package org.cheng.hy2tunvpn

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.ProxyInfo
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.system.OsConstants
import android.util.Log
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import org.json.JSONObject

class ChengHy2TunVpnService : VpnService() {
    private val sessionLock = Any()
    private val generation = AtomicLong(0)
    private var nativeSessionId = 0L
    private var nativeMode = ""
    private var proxyListenPort = 0
    private var tunFd: ParcelFileDescriptor? = null
    private var startThread: Thread? = null
    private var cleanupThread: Thread? = null
    private var protectCallback: ChengHy2TunNative.ProtectCallback? = null
    private var lastUnderlyingNetwork: Network? = null
    private val networkRefreshHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var dnsActivityRefreshDone = false
    // Startup offline-lock refresh (DNS_PROBE_FINISHED_NO_INTERNET): the
    // expected bounce is tracked so the heartbeat can verify it landed and
    // re-fire when a busy-state guard silently dropped it.
    private val refreshLock = Any()
    private var refreshExpectBaseSessionId = 0L
    private var refreshExpectDeadlineMs = 0L
    private var refreshRetryCount = 0
    // Terminal-dataplane auto restart (forward session recovery): scheduled
    // through the cleanup join with exponential backoff; streak resets on a
    // successful session.
    private var autoRestartBackoffMs = 0L
    private var activeConfigPath = ""
    private var activeConfigFingerprint = ""
    private var preserveFailedStatusOnDestroy = false
    // QUERY must not block onStartCommand: even with JNI try_lock, a held-lock
    // status/mem_diag sample can exceed the "executing service" ANR budget.
    private val statusQueryExecutor: ExecutorService =
        Executors.newSingleThreadExecutor { r ->
            Thread(r, "ChengHy2TunStatusQuery").apply { isDaemon = true }
        }
    // Heartbeat: publish status periodically while the service lives so wd.log
    // observability (dns_ring, counters) never depends on external QUERY intents
    // (Huawei ROMs deny adb-issued startservice after every reboot).
    private val statusHeartbeatExecutor: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor { r ->
            Thread(r, "ChengHy2TunStatusHeartbeat").apply { isDaemon = true }
        }
    private var statusHeartbeatTask: ScheduledFuture<*>? = null
    private fun ensureStatusHeartbeat() {
        if (statusHeartbeatTask?.isDone == false) return
        synchronized(sessionLock) {
            if (statusHeartbeatTask?.isDone == false) return
            statusHeartbeatTask = statusHeartbeatExecutor.scheduleWithFixedDelay({
                try {
                    val heartbeatSessionId = synchronized(sessionLock) { nativeSessionId }
                    if (heartbeatSessionId > 0L) {
                // [self-heal] worker 存活检查: TUN worker 每轮循环必调一次 tun
                // wait（空闲也推进），status JSON 里的 tun_wait_calls 连续多个
                // tick 无增量 = worker 真死。禁止用 relay_trace.log mtime 判活：
                // 生产构建 trace 门控关闭，mtime 永久冻结，旧判据把每个健康
                // 会话在 start 后第一个 5s tick 就杀掉（wd.log 实锤 start 后
                // 5.09s 必现 ACTION_START→"session already running"→failVpn）。
                        val json = try {
                            ChengHy2TunNative.nativeStatusJson(heartbeatSessionId)
                        } catch (_: Throwable) {
                            ""
                        }
                        if (isWorkerWaitCallsFrozen(heartbeatSessionId, json)) {
                            selfHealBounceSession(
                                heartbeatSessionId,
                                "worker-dead self-heal: tun_wait_calls frozen ${WORKER_DEAD_FROZEN_TICKS} ticks"
                            )
                            return@scheduleWithFixedDelay
                        }
                        publishStatus()
                    }
                } catch (_: Throwable) {
                }
            }, 5L, 5L, TimeUnit.SECONDS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        serviceProcessAlive = true
        redirectStderrToFailStopLog()
        wdLog("onCreate pid=${android.os.Process.myPid()}")
        requestIgnoreBatteryOptimizationsOnce()
    }

    // Native fail-stop exits via exit_group after writing the reason to stderr
    // (fd 2), which Android discards for app processes. Point fd 2 at a file so
    // silent self-exits leave a readable dying declaration next to wd.log.
    private fun redirectStderrToFailStopLog() {
        try {
            val logFile = java.io.File(filesDir, "failstop.log")
            val fd = android.os.ParcelFileDescriptor.open(
                logFile,
                android.os.ParcelFileDescriptor.MODE_WRITE_ONLY or
                    android.os.ParcelFileDescriptor.MODE_CREATE or
                    android.os.ParcelFileDescriptor.MODE_APPEND
            )
            android.system.Os.dup2(fd.fileDescriptor, 2)
            // Keep the ParcelFileDescriptor object from closing its wrapped fd
            // on GC before dup2 completes is not a concern: dup2 cloned it.
        } catch (e: Throwable) {
            wdLog("stderr redirect failed: ${e.message}")
        }
    }

    // EMUI/PowerGenie kills backgrounded sideloaded apps on its own schedule;
    // the AOSP deviceidle whitelist does not cover it. The standard exemption
    // dialog is the sanctioned mechanism — fire it once from service create.
    private fun requestIgnoreBatteryOptimizationsOnce() {
        if (Build.VERSION.SDK_INT < 23) return
        val pm = getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager ?: return
        if (pm.isIgnoringBatteryOptimizations(packageName)) return
        try {
            val intent = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(Uri.parse("package:$packageName"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
            wdLog("battery exemption dialog requested")
        } catch (e: Throwable) {
            wdLog("battery exemption request failed: ${e.message}")
        }
    }

    private fun wdLog(text: String) {
        try {
            synchronized(wdLogLock) {
                java.io.File(filesDir, "wd.log")
                    .appendText("${System.currentTimeMillis()} $text\n")
            }
        } catch (_: Throwable) {
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            return restoreDesiredVpnIfInactive(startId, "process restart")
        }
        return when (intent.action ?: ACTION_QUERY) {
            ACTION_START -> {
                val requestedConfigPath = intent.getStringExtra(EXTRA_CONFIG_PATH) ?: ""
                wdLog("ACTION_START path=$requestedConfigPath")
                rememberDesiredRunning(requestedConfigPath)
                if (!startForegroundOrFail("starting", "")) {
                    clearDesiredRunning()
                    START_NOT_STICKY
                } else {
                    startVpnAsync(requestedConfigPath)
                    START_STICKY
                }
            }
            ACTION_RECONFIGURE -> {
                if (!reconfigureVpn()) {
                    stopSelf(startId)
                }
                if (shouldServiceStick()) START_STICKY else START_NOT_STICKY
            }
            ACTION_STOP -> {
                clearDesiredRunning()
                // Never block the binder/main path on native teardown — Huawei
                // "Timeout executing service" ANR fires if stopVpn waits on the
                // tun worker / status sample under sessionLock.
                Thread({
                    try {
                        stopVpn("stopped")
                    } catch (err: Throwable) {
                        Log.e(TAG, "async stop failed: ${redactSecrets(err.message ?: err.javaClass.name)}")
                    } finally {
                        stopSelf()
                    }
                }, "ChengHy2TunStop").start()
                START_NOT_STICKY
            }
            else -> {
                // Offload status sample so QUERY never ANRs the service main path.
                // Sticky bit must survive QUERY: returning START_NOT_STICKY here used to
                // clear restart-after-kill even while the tunnel was still desired/live.
                val stick = shouldServiceStick()
                statusQueryExecutor.execute {
                    try {
                        publishStatus()
                    } catch (err: Throwable) {
                        Log.e(TAG, "status query failed: ${redactSecrets(err.message ?: err.javaClass.name)}")
                    }
                }
                synchronized(sessionLock) {
                    if (nativeSessionId == 0L && startThread == null && !stick) {
                        if (intent.action != ACTION_QUERY) {
                            stopSelf(startId)
                        }
                    }
                }
                if (stick) START_STICKY else START_NOT_STICKY
            }
        }
    }

    override fun onRevoke() {
        clearDesiredRunning()
        stopVpn("vpn permission revoked")
        stopSelf()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        val configPath = desiredConfigPath() ?: return
        requestForegroundRestart(configPath)
    }

    override fun onDestroy() {
        serviceProcessAlive = false
        val keepFailedStatus = synchronized(sessionLock) { preserveFailedStatusOnDestroy }
        val alreadyStopped = synchronized(sessionLock) {
            nativeSessionId == 0L && startThread == null && currentState() == "stopped"
        }
        when {
            keepFailedStatus -> Unit
            // ACTION_STOP already published mem_diag; do not overwrite with plain text.
            alreadyStopped -> Unit
            // User stop is still joining native worker; final ORC sample comes from cleanup.
            synchronized(sessionLock) { currentState() == "stopping" || cleanupThread != null } -> Unit
            else -> stopVpn("service destroyed")
        }
        statusQueryExecutor.shutdownNow()
        statusHeartbeatTask?.cancel(true)
        statusHeartbeatExecutor.shutdownNow()
        super.onDestroy()
    }

    private fun restoreDesiredVpnIfInactive(startId: Int, reason: String): Int {
        val configPath = desiredConfigPath()
        wdLog("restore reason=$reason path=$configPath")
        if (configPath == null) {
            publishStatus()
            synchronized(sessionLock) {
                if (nativeSessionId == 0L && startThread == null) {
                    stopSelf(startId)
                }
            }
            return START_NOT_STICKY
        }
        synchronized(sessionLock) {
            if (nativeSessionId != 0L || startThread != null) {
                publishStatus()
                return START_STICKY
            }
        }
        if (!startForegroundOrFail("starting", reason)) {
            clearDesiredRunning()
            return START_NOT_STICKY
        }
        startVpnAsync(configPath)
        return START_STICKY
    }

    private fun startVpnAsync(requestedConfigPath: String) {
        wdLog("startVpnAsync path=$requestedConfigPath")
        // Keep onStartCommand off the heavy path: config IO / SHA-256 / preview used to
        // run on the binder thread and ANR ("Timeout executing service") on Huawei.
        var token = 0L
        var startWorker: Thread? = null
        synchronized(sessionLock) {
            val cleanup = cleanupThread
            // Null check, NOT isAlive: cleanupThread is assigned under
            // sessionLock before worker.start(), so a freshly scheduled
            // cleanup reports isAlive==false and this guard would let a new
            // start race the pending nativeStop (protect callback cleared
            // under the new session). cleanupThread is nulled only in the
            // cleanup thread's finally, after nativeStop completed.
            if (cleanup != null) {
                wdLog("startVpnAsync skip: cleanup alive")
                publishStatus("stopping", "native cleanup in progress")
                return
            }
            if (startThread != null) {
                wdLog("startVpnAsync skip: already starting")
                publishStatus("starting", "session already starting")
                return
            }
            preserveFailedStatusOnDestroy = false
            token = generation.incrementAndGet()
            publishStatus("starting", "")
            // The native dataplane worker runs cheng-generated functions with
            // very large frames on this thread; the ART default (~1MB) overflows
            // once cold-layout shifts add depth ("stack pointer is not in a rw
            // map" SIGSEGV in Thread-3). Give it an explicit 64MB stack.
            startWorker = Thread(null, {
                try {
                    val configFile = resolveConfigFile(requestedConfigPath)
                    val requestedMode = Hy2TunConfig.preview(configFile).productMode
                    val requestedFingerprint = configFingerprint(configFile)
                    var staleSnapshot: NativeStopSnapshot? = null
                    synchronized(sessionLock) {
                        if (nativeSessionId != 0L) {
                            if (isActiveSessionCompatibleLocked(
                                    configFile,
                                    requestedMode,
                                    requestedFingerprint
                                )
                            ) {
                                publishStatus("connected", "session already active")
                                return@Thread
                            }
                            staleSnapshot = takeNativeSessionLocked()
                            publishStatus("starting", "config reconfigure")
                        }
                    }
                    val snapshot = staleSnapshot
                    if (snapshot != null) {
                        closeQuietly(snapshot.fd)
                        runNativeStopBlocking(snapshot)
                    }
                    startVpn(token, configFile.absolutePath)
                } catch (err: StartCancelledException) {
                    publishStatus("stopped", err.message ?: "start cancelled")
                    stopForegroundCompat()
                } catch (err: Throwable) {
                    failVpn(err.message ?: err.javaClass.name)
                } finally {
                    synchronized(sessionLock) {
                        startThread = null
                    }
                }
            }, "ChengHy2TunStart", 64L * 1024L * 1024L)
            startThread = startWorker
        }
        startWorker?.start()
    }

    private fun isActiveSessionCompatibleLocked(
        configFile: File,
        requestedMode: String,
        requestedFingerprint: String
    ): Boolean {
        if (nativeSessionId <= 0L) {
            return false
        }
        if (nativeMode != requestedMode) {
            return false
        }
        if (activeConfigPath != configFile.absolutePath) {
            return false
        }
        if (activeConfigFingerprint != requestedFingerprint) {
            return false
        }
            if (requestedMode == "pac" && proxyListenPort <= 0) {
                return false
            }
            if (requestedMode == "tun" && tunFd == null) {
                return false
        }
        return true
    }

    private fun startVpn(token: Long, requestedConfigPath: String) {
        markStartPhase(token, "loading native core")
        ChengHy2TunNative.requireCore()
        markStartPhase(token, "loading config")
        val configFile = resolveConfigFile(requestedConfigPath)
        val config = Hy2TunConfig.load(configFile)
        if (config.productMode == "pac") {
            startProxyVpn(token, config)
            return
        }
        if (config.productMode != "tun") {
            throw IOException("unsupported client mode: ${config.productMode}")
        }
        markStartPhase(token, "selecting underlying network")
        val underlyingNetwork = selectUnderlyingNetwork()
            ?: throw IOException("underlying network missing")
        val callback = protectCallbackFor(underlyingNetwork)
        verifyOwnerNetworkAccess(token, config, underlyingNetwork, callback)
        lastUnderlyingNetwork = underlyingNetwork

        markStartPhase(token, "establishing tun")
        val builder = Builder()
            .setSession("Cheng HY2 TUN")
            .setMtu(config.mtu)
            .addAddress(config.address, config.prefixLength)
            .addDnsServer(config.dnsServer)
            .allowFamily(OsConstants.AF_INET)
            .setUnderlyingNetworks(arrayOf(underlyingNetwork))
        applyTunRoutes(builder, config.routeMode, config.dnsServer)
        // Track the system default underlying network instead of pinning the
        // Network object captured at establish time: a pinned handle goes stale
        // after Wi-Fi roaming/DHCP renew/score updates and silently drops the
        // VPN out of apps' default-network set, leaking their traffic around
        // the tunnel.
        builder.setUnderlyingNetworks(null)
        builder.addDisallowedApplication(packageName)
        if (Build.VERSION.SDK_INT >= 29) {
            builder.setMetered(false)
        }

        val established = builder.establish()
            ?: run {
                wdLog("establish NULL")
                throw IOException("VpnService.Builder.establish returned null")
            }
        wdLog("establish ok fd=${established.fd}")
        if (!isStartTokenActive(token)) {
            closeQuietly(established)
            throw StartCancelledException("start cancelled")
        }

        markStartPhase(token, "starting native tunnel")
        var sessionId = 0L
        try {
            sessionId = ChengHy2TunNative.nativeStart(
                config.json,
                config.file.absolutePath,
                config.certDer,
                config.keyPk8Der,
                config.trustRootDer,
                established.fd,
                underlyingNetwork.networkHandle,
                callback
            )
            if (sessionId <= 0L) {
                throw IllegalStateException("nativeStart returned invalid session id")
            }
            synchronized(sessionLock) {
                if (token != generation.get() || nativeSessionId != 0L) {
                    throw StartCancelledException("start cancelled")
                }
                tunFd = established
                nativeSessionId = sessionId
                nativeMode = "tun"
                proxyListenPort = 0
                protectCallback = callback
                activeConfigPath = config.file.absolutePath
                activeConfigFingerprint = configFingerprint(config.file)
            }
            rememberDesiredRunning(config.file.absolutePath)
            resetAutoRestartStreakLocked()
            wdLog("session started id=$sessionId")
            updateActiveNativeSession(sessionId, "tun", 0)
            publishStatus("connected", "native session started mode=tun")
            ensureStatusHeartbeat()
            updateNotification("connected", "native session started")
        } catch (err: Throwable) {
            closeQuietly(established)
            if (sessionId > 0L) {
                ChengHy2TunNative.nativeStop(sessionId)
            }
            throw err
        }
    }

    private fun startProxyVpn(token: Long, config: Hy2TunConfig) {
        if (Build.VERSION.SDK_INT < 29) {
            throw IOException("PAC mode requires Android 10+ VpnService HTTP proxy support")
        }
        markStartPhase(token, "selecting underlying network")
        val underlyingNetwork = selectUnderlyingNetwork()
            ?: throw IOException("underlying network missing")
        val callback = protectCallbackFor(underlyingNetwork)
        verifyOwnerNetworkAccess(token, config, underlyingNetwork, callback)
        lastUnderlyingNetwork = underlyingNetwork
        var sessionId = 0L
        var listenPort = 0
        var established: ParcelFileDescriptor? = null
        try {
            markStartPhase(token, "starting native proxy")
            val result = ChengHy2TunNative.nativeStartProxy(
                config.json,
                config.file.absolutePath,
                config.certDer,
                config.keyPk8Der,
                config.trustRootDer,
                underlyingNetwork.networkHandle,
                callback
            )
            if (result.size < 2 || result[0] <= 0L || result[1] !in 1L..65535L) {
                throw IllegalStateException("nativeStartProxy returned invalid result")
            }
            sessionId = result[0]
            listenPort = result[1].toInt()
            val pacUrl = pacUrlForPort(listenPort)
            markStartPhase(token, "establishing pac vpn")
            val builder = Builder()
                .setSession("Cheng HY2 PAC")
                .setMtu(config.mtu)
                .addAddress(config.address, config.prefixLength)
                .addRoute("0.0.0.0", 0)
                // IPv6 leak block (see applyTunRoutes): blackhole v6 while the PAC vpn is up.
                .addAddress("fd00:6368:656e:67::1", 128)
                .addRoute("2000::", 3)
                .allowFamily(OsConstants.AF_INET)
                .setUnderlyingNetworks(null)
                .setHttpProxy(ProxyInfo.buildDirectProxy("127.0.0.1", listenPort))
            builder.addDisallowedApplication(packageName)
            builder.setMetered(false)
            established = builder.establish()
                ?: throw IOException("VpnService.Builder.establish returned null")
            if (!isStartTokenActive(token)) {
                throw StartCancelledException("start cancelled")
            }
            synchronized(sessionLock) {
                if (token != generation.get() || nativeSessionId != 0L) {
                    throw StartCancelledException("start cancelled")
                }
                tunFd = established
                nativeSessionId = sessionId
                nativeMode = "pac"
                proxyListenPort = listenPort
                protectCallback = callback
                activeConfigPath = config.file.absolutePath
                activeConfigFingerprint = configFingerprint(config.file)
            }
            rememberDesiredRunning(config.file.absolutePath)
            resetAutoRestartStreakLocked()
            updateActiveNativeSession(sessionId, "pac", listenPort)
            publishStatus("connected", "native session started mode=pac proxy_mode=direct-routed pac_url=$pacUrl proxy=127.0.0.1:$listenPort")
            updateNotification("connected", "PAC proxy 127.0.0.1:$listenPort")
        } catch (err: Throwable) {
            closeQuietly(established)
            if (sessionId > 0L) {
                ChengHy2TunNative.nativeStopProxy(sessionId)
            }
            throw err
        }
    }

    private fun resolveConfigFile(requestedConfigPath: String): File {
        val trimmed = requestedConfigPath.trim()
        val file = if (trimmed.isNotEmpty()) File(trimmed) else Hy2TunConfig.ensureDefaultFile(this)
        val absolute = file.absoluteFile
        wdLog("resolveConfigFile requested=\"$trimmed\" resolved=\"${absolute.absolutePath}\"")
        if (!absolute.isFile) {
            throw IOException("config file not found: ${absolute.absolutePath}")
        }
        return absolute.canonicalFile
    }

    private fun reconfigureVpn(): Boolean {
        val configPath: String
        synchronized(sessionLock) {
            if (startThread != null) {
                publishStatus("starting", "transport_update_requires_reconnect")
                return true
            }
            configPath = activeConfigPath
            if (nativeSessionId == 0L || configPath.isEmpty()) {
                publishStatus(currentState(), "config_saved_reconnect_required")
                return false
            }
        }
        stopVpn("config reconfigure")
        if (!startForegroundOrFail("starting", "config reconfigure")) {
            return false
        }
        startVpnAsync(configPath)
        return true
    }

    // Chromium on this device hard-latches DNS_PROBE_FINISHED_NO_INTERNET when
    // the browser cold-starts, even with the tunnel already up: the latch only
    // clears when a network-change event arrives AFTER the browser finished
    // starting. The first DNS query from an app (visible in the native status
    // json) proves a browser/app is resolving again; at that point cycle the
    // VPN underlying-networks binding once. Each switch makes
    // ConnectivityService emit a capabilities change for the VPN network,
    // which flushes the browser cache WITHOUT tearing the tun interface down.
    private fun observeDnsActivityForNetworkRefresh(statusJson: String) {
        if (dnsActivityRefreshDone) {
            return
        }
        // One refresh per explicit user enable: the MainActivity toggle arms
        // this latch, so watchdog resurrections never churn extra bounces.
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(PREF_REFRESH_PENDING_ENABLE, false)) {
            return
        }
        val dnsId = Regex("\"last_rx_dns_id\":([0-9]+)").find(statusJson)?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 0
        if (dnsId <= 0) {
            return
        }
        // [tun-live-guard] 刷新的目的是救"冷启动卡死"（DNS 有活动但数据面零流
        // 量）。数据面已有真实下载量时刷新只会把在途页面连接整会话拆掉（
        // RECONFIGURE=stop/start 全重启，模拟器实证 killing 页面加载）。
        val rxBytes = Regex("\"rx_bytes\":([0-9]+)").find(statusJson)?.groupValues?.getOrNull(1)?.toLongOrNull() ?: 0L
        if (rxBytes > 0L) {
            dnsActivityRefreshDone = true
            prefs.edit().putBoolean(PREF_REFRESH_PENDING_ENABLE, false).apply()
            wdLog("dns activity with live traffic (rx=$rxBytes): startup refresh skipped")
            return
        }
        dnsActivityRefreshDone = true
        prefs.edit().putBoolean(PREF_REFRESH_PENDING_ENABLE, false).apply()
        val net = synchronized(sessionLock) {
            if (nativeSessionId != 0L && nativeMode == "tun") lastUnderlyingNetwork else null
        }
        if (net == null || currentState() != "connected") {
            wdLog("startup network refresh skipped: session not healthy")
            return
        }
        wdLog("dns activity detected: scheduling underlying-network refresh")
        // Two cycles: browsers differ in cold-start length, so fire one while
        // the browser is still starting and a second after the latch would
        // have formed. Both are zero-interruption underlying switches.
        scheduleUnderlyingCycle(net, 8_000L, "first")
        scheduleUnderlyingCycle(net, 25_000L, "second")
    }

    private fun scheduleUnderlyingCycle(net: Network, delayMs: Long, tag: String) {
        // [tun-live-guard] runnable 滞留服务层会跨会话代际开火(实测杀掉两个后继
        // 会话)。调度时锁定会话 id:一旦会话更代(重启=浏览器 DNS 缓存已随 VPN
        // 网络重建而重置),刷新目的已达成,必须弃射。
        val scheduledSessionId = synchronized(sessionLock) { nativeSessionId }
        networkRefreshHandler.postDelayed({
            val alive = synchronized(sessionLock) { nativeSessionId != 0L }
            if (!alive || currentState() != "connected") {
                wdLog("startup network refresh skipped ($tag): session not healthy")
                return@postDelayed
            }
            val currentSessionId = synchronized(sessionLock) { nativeSessionId }
            if (currentSessionId != scheduledSessionId) {
                wdLog("startup network refresh skipped ($tag): session changed $scheduledSessionId->$currentSessionId")
                return@postDelayed
            }
            armNetworkRefreshExpectation()
            // Route through the RECONFIGURE intent path (the same stop/start
            // cycle as the manual toggle) instead of touching the interface
            // inline: Chromium only resets its DNS cache when the VPN network
            // actually disappears and returns, and the intent path runs the
            // bounce with the proven threading model.
            wdLog("startup network refresh: firing reconfigure ($tag)")
            try {
                startService(Intent(this, ChengHy2TunVpnService::class.java).setAction(ACTION_RECONFIGURE))
            } catch (t: Throwable) {
                wdLog("startup network refresh failed ($tag): $t")
            }
        }, delayMs)
    }

    private fun startForegroundOrFail(state: String, detail: String): Boolean {
        return try {
            startForeground(NOTIFICATION_ID, buildNotification(state, detail))
            true
        } catch (err: Throwable) {
            val safeDetail = redactSecrets(err.message ?: err.javaClass.name)
            Log.e(TAG, "foreground start failed: $safeDetail")
            publishStatus("failed", "foreground service failed: $safeDetail")
            stopSelf()
            false
        }
    }

    /**
     * OS-level split for route_mode=fast: only fake-ip + known blocked IP literals
     * enter TUN. Domestic real IPs miss these routes and stay on the physical NIC.
     * route_mode=global keeps the full default route.
     * Prefix list must stay aligned with VpnProxyTunShouldProxyIpDirectly.
     */
    private fun applyTunRoutes(builder: Builder, routeMode: String, dnsServer: String) {
        wdLog("applyTunRoutes mode=$routeMode dns=$dnsServer")
        builder.addRoute("198.18.0.0", 16)
        // IPv6 leak block: route all global unicast IPv6 into the tun; the native
        // dataplane parses IPv4 only and drops unknown-version packets, so this
        // blackholes v6 instead of leaking around the tunnel on dual-stack nets.
        builder.addAddress("fd00:6368:656e:67::1", 128)
        builder.addRoute("2000::", 3)
        if (dnsServer.isNotBlank() && !dnsServer.startsWith("198.18.")) {
            builder.addRoute(dnsServer, 32)
        }
        if (routeMode == "global") {
            builder.addRoute("0.0.0.0", 0)
            return
        }
        for ((prefix, length) in FAST_MODE_PROXY_IP_ROUTES) {
            builder.addRoute(prefix, length)
        }
    }

    private fun selectUnderlyingNetwork(): Network? {
        val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        // Rank candidates validated-first: a user-selected captive/half-dead
        // Wi-Fi can carry INTERNET capability with NO working egress, and the
        // owner probe plus every dial socket bind to the chosen handle —
        // picking it starves the tunnel while a validated cellular sits idle.
        val seen = LinkedHashMap<Network, Pair<Boolean, Boolean>>() // network -> (validated, active)
        fun consider(network: Network?, active: Boolean) {
            if (network == null || seen.containsKey(network)) {
                return
            }
            if (!isUsableUnderlyingNetwork(manager, network)) {
                return
            }
            val caps = manager.getNetworkCapabilities(network)
            seen[network] = Pair(
                caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true,
                active
            )
        }
        consider(manager.activeNetwork, true)
        for (network in manager.allNetworks) {
            consider(network, false)
        }
        if (seen.isEmpty()) {
            wdLog("network selection FAILED")
            return null
        }
        val best = seen.entries.firstOrNull { it.value.first } ?: seen.entries.first()
        if (!best.value.first) {
            wdLog("network selection: no validated underlying, using handle=${best.key.networkHandle}")
        } else {
            wdLog(
                "network selected ${if (best.value.second) "active" else "scan"} handle=${best.key.networkHandle} validated=true"
            )
        }
        return best.key
    }

    private fun isUsableUnderlyingNetwork(manager: ConnectivityManager, network: Network): Boolean {
        val caps = manager.getNetworkCapabilities(network) ?: return false
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
            return false
        }
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
            return false
        }
        return true
    }

    private fun protectSocket(fd: Int, network: Network): Boolean {
        if (!protect(fd)) {
            Log.e(TAG, "protect fd failed: fd=$fd network=${network.networkHandle}")
            return false
        }
        Log.i(TAG, "protect fd ok: fd=$fd underlying=${network.networkHandle}")
        return true
    }

    private fun protectCallbackFor(network: Network): ChengHy2TunNative.ProtectCallback =
        object : ChengHy2TunNative.ProtectCallback {
            override fun protect(fd: Int): Boolean =
                this@ChengHy2TunVpnService.protectSocket(fd, network)
        }

    private fun verifyOwnerNetworkAccess(
        token: Long,
        config: Hy2TunConfig,
        network: Network,
        callback: ChengHy2TunNative.ProtectCallback
    ) {
        markStartPhase(token, "checking app network access")
        val result = ChengHy2TunNative.nativeOwnerTcpProbe(
            config.ownerProbeHost,
            config.ownerProbePort,
            config.ownerProbeTimeoutMs,
            network.networkHandle,
            callback
        )
        if (result == "ok") {
            return
        }
        throw IOException(
            "app network access blocked: enable WLAN/mobile data for Cheng hy2-tun VPN in System Manager > Data usage > Network access; probe=$result"
        )
    }

    private fun markStartPhase(token: Long, detail: String) {
        if (!isStartTokenActive(token)) {
            throw StartCancelledException("start cancelled")
        }
        Log.i(TAG, "start phase: $detail")
        wdLog("phase $detail")
        publishStatus("starting", detail)
    }

    private fun configFingerprint(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(file.readBytes())
        val hex = "0123456789abcdef"
        val out = CharArray(digest.size * 2)
        for (i in digest.indices) {
            val value = digest[i].toInt() and 0xff
            out[i * 2] = hex[value ushr 4]
            out[i * 2 + 1] = hex[value and 0x0f]
        }
        return String(out)
    }

    private fun failVpn(detail: String) {
        val safeDetail = redactSecrets(detail)
        wdLog("failVpn $safeDetail")
        Log.e(TAG, "start failed: $safeDetail")
        clearDesiredRunning()
        val snapshot: NativeStopSnapshot
        synchronized(sessionLock) {
            generation.incrementAndGet()
            snapshot = takeNativeSessionLocked()
            preserveFailedStatusOnDestroy = true
        }
        scheduleNativeCleanup(snapshot)
        publishStatus("failed", safeDetail)
        stopForegroundCompat()
        stopSelf()
    }

    private fun stopVpn(detail: String) {
        val snapshot: NativeStopSnapshot
        synchronized(sessionLock) {
            generation.incrementAndGet()
            snapshot = takeNativeSessionLocked()
        }
        // Publish stopped immediately so UI/gate observe 已关闭. Capture ORC
        // before teardown; cleanup thread refreshes the final residual sample.
        publishStoppedStatus(detail)
        stopForegroundCompat()
        if (snapshot.sessionId <= 0L && snapshot.mode.isEmpty()) {
            return
        }
        scheduleNativeCleanup(snapshot, afterStopDetail = detail)
    }

    private fun publishStoppedStatus(detail: String) {
        val safeDetail = redactSecrets(detail)
        val json = try {
            val obj = JSONObject(nativeStatusJson(0L))
            obj.put("state", "stopped")
            if (!obj.has("mem_live")) {
                // nativeStatusJson always emits mem_*; if a partial payload arrives,
                // force a second status sample so ORC contract stays observable.
                val retry = JSONObject(nativeStatusJson(0L))
                if (retry.has("mem_live")) {
                    obj.put("mem_live", retry.optLong("mem_live"))
                    obj.put("mem_alloc", retry.optLong("mem_alloc"))
                    obj.put("mem_free", retry.optLong("mem_free"))
                }
            }
            if (safeDetail.isNotEmpty() && obj.optString("text").isEmpty()) {
                obj.put("text", safeDetail)
            } else if (safeDetail.isNotEmpty() && safeDetail != "stopped") {
                obj.put("detail", safeDetail)
            }
            obj.toString()
        } catch (_: Throwable) {
            // Still publish a JSON envelope so UI keeps the ORC line contract shape.
            JSONObject()
                .put("state", "stopped")
                .put("text", safeDetail.ifEmpty { "stopped" })
                .put("mem_live", 0)
                .put("mem_alloc", 0)
                .put("mem_free", 0)
                .toString()
        }
        publishStatus("stopped", json)
    }

    private fun rememberDesiredRunning(configPath: String) {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(PREF_DESIRED_RUNNING, true)
            .putString(PREF_CONFIG_PATH, configPath)
            .apply()
        scheduleWatchdogAlarmFor(this)
    }

    private fun clearDesiredRunning() {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(PREF_DESIRED_RUNNING, false)
            .remove(PREF_CONFIG_PATH)
            .apply()
        cancelWatchdogAlarmFor(this)
    }

    private fun desiredConfigPath(): String? {
        return desiredConfigPathForContext(this)
    }

    private fun shouldServiceStick(): Boolean {
        if (desiredConfigPath() != null) {
            return true
        }
        synchronized(sessionLock) {
            return nativeSessionId != 0L || startThread != null
        }
    }

    private fun requestForegroundRestart(configPath: String) {
        val restart = startIntent(applicationContext, configPath)
        if (Build.VERSION.SDK_INT >= 26) {
            startForegroundService(restart)
        } else {
            startService(restart)
        }
    }

    private fun isStartTokenActive(token: Long): Boolean =
        synchronized(sessionLock) { token == generation.get() && nativeSessionId == 0L }

    private fun takeNativeSessionLocked(): NativeStopSnapshot {
        val sessionId = nativeSessionId
        val mode = nativeMode
        val fd = tunFd
        nativeSessionId = 0L
        nativeMode = ""
        proxyListenPort = 0
        protectCallback = null
        activeConfigPath = ""
        activeConfigFingerprint = ""
        tunFd = null
        updateActiveNativeSession(0L, "", 0)
        return NativeStopSnapshot(sessionId, mode, fd)
    }

    // [zero-rx self-heal] fast 路由下 VPN 网络未通过验证时 apps 流量完全不进
    // TUN(僵尸会话, rx_bytes 恒 0, UI 假"已连接")。connected 后持续 15s 零收包
    // 即自动弹一次会话(每会话限一次), 让 VpnService 重新建立并重过验证。
    private var zeroRxSessionId = 0L
    private var zeroRxFirstSeenMs = 0L
    private var zeroRxBounced = false

    // [worker-watch] tun_wait_calls 冻结判据的状态；换会话即重置。
    private var workerWatchSessionId = 0L
    private var workerWatchLastWaitCalls = -1L
    private var workerWatchFrozenTicks = 0

    private fun isWorkerWaitCallsFrozen(sessionId: Long, json: String): Boolean {
        if (json.isEmpty() || isCachedStatusJson(json)) {
            // 状态不可用或锁忙缓存都不是死亡证据，禁止据此杀会话。
            return false
        }
        val wait = Regex("\"tun_wait_calls\":([0-9]+)")
            .find(json)?.groupValues?.getOrNull(1)?.toLongOrNull()
            ?: return false
        if (sessionId != workerWatchSessionId) {
            workerWatchSessionId = sessionId
            workerWatchLastWaitCalls = wait
            workerWatchFrozenTicks = 0
            return false
        }
        if (wait != workerWatchLastWaitCalls) {
            workerWatchLastWaitCalls = wait
            workerWatchFrozenTicks = 0
            return false
        }
        workerWatchFrozenTicks += 1
        return workerWatchFrozenTicks >= WORKER_DEAD_FROZEN_TICKS
    }

    // 自愈弹射统一入口：先原生快照→cleanup join（nativeStop 完成后才清理
    // cleanupThread），cleanup finally 见 desired_running 仍在且 backoff=0
    // →立即 requestForegroundRestart。旧代码"nativeSessionId=0 + 直接
    // restart"绕过 startVpnAsync 的兼容检查，native 撞 "already running"
    // 后 failVpn 反把健康会话标记成 failed。
    private fun selfHealBounceSession(sessionId: Long, reason: String) {
        val path = desiredConfigPath() ?: return
        val snapshot: NativeStopSnapshot
        synchronized(sessionLock) {
            if (nativeSessionId != sessionId) {
                return
            }
            generation.incrementAndGet()
            autoRestartBackoffMs = 0L
            preserveFailedStatusOnDestroy = true
            snapshot = takeNativeSessionLocked()
        }
        workerWatchSessionId = 0L
        workerWatchLastWaitCalls = -1L
        workerWatchFrozenTicks = 0
        zeroRxSessionId = 0L
        zeroRxBounced = false
        wdLog("$reason, bouncing session $sessionId")
        Log.e(TAG, reason)
        scheduleNativeCleanup(snapshot)
    }

    private fun maybeSelfHealZeroRxSession(statusJson: String) {
        val sessionId = synchronized(sessionLock) { nativeSessionId }
        if (sessionId <= 0L) {
            zeroRxSessionId = 0L
            return
        }
        val rxBytes = Regex("\"rx_bytes\":([0-9]+)").find(statusJson)?.groupValues?.getOrNull(1)?.toLongOrNull() ?: 0L
        if (rxBytes > 0L) {
            if (zeroRxSessionId == sessionId) wdLog("zero-rx self-heal: session $sessionId now receiving (rx=$rxBytes), disarmed")
            zeroRxSessionId = 0L
            return
        }
        if (zeroRxSessionId != sessionId) {
            // [fix] 粘性: 每个 enable 只自愈弹一次, 新会话不再重置弹射权——
            // 否则流量未起的头 15s 反复弹会话, 杀死页面加载(实测 7 次重启)。
            zeroRxSessionId = sessionId
            zeroRxFirstSeenMs = System.currentTimeMillis()
            return
        }
        if (zeroRxBounced) {
            return
        }
        val ageMs = System.currentTimeMillis() - zeroRxFirstSeenMs
        if (ageMs < 15_000L) {
            return
        }
        zeroRxBounced = true
        wdLog("zero-rx self-heal: session $sessionId rx=0 for ${ageMs}ms, bouncing once")
        selfHealBounceSession(sessionId, "zero-rx self-heal: rx=0 for ${ageMs}ms")
    }

    private fun publishStatus() {
        val sessionId = synchronized(sessionLock) { nativeSessionId }
        if (sessionId <= 0L) {
            // Still emit mem_diag so session ORC contract is observable after stop.
            val memJson = try {
                nativeStatusJson(0L)
            } catch (_: Throwable) {
                currentDetail()
            }
            publishStatus(currentState(), memJson)
            return
        }
        val json = nativeStatusJson(sessionId)
        wdLog("status $json")
        maybeSelfHealZeroRxSession(json)
        observeDnsActivityForNetworkRefresh(json)
        val state = nativeStateFromJson(json)
        // Lock-busy cache (or mismatched session_id) is not authoritative teardown.
        if (isCachedStatusJson(json) || isMismatchedSessionStatus(json, sessionId)) {
            val keepState =
                if (isTerminalNativeState(state)) currentState() else state
            publishStatus(keepState, json)
            return
        }
        var snapshot: NativeStopSnapshot? = null
        if (isTerminalNativeState(state)) {
            Log.e(TAG, "native terminal: ${redactSecrets(json)}")
            // The user asked for the tunnel (desired_running still set): do NOT
            // clear it. The cleanup join below resurrects the session; the
            // backoff scales with consecutive failures so a persistent fault
            // (dead network, bad config) retries at most every ~60s instead of
            // hot-looping.
            synchronized(sessionLock) {
                if (nativeSessionId == sessionId) {
                    generation.incrementAndGet()
                    snapshot = takeNativeSessionLocked()
                    preserveFailedStatusOnDestroy = true
                    autoRestartBackoffMs = nextAutoRestartBackoffMs()
                }
            }
            scheduleNativeCleanup(snapshot)
            stopForegroundCompat()
        }
        publishStatus(state, json)
        superviseNetworkRefresh(state)
    }

    // Startup offline-lock refresh supervisor: when an underlying-network
    // bounce was fired, the next heartbeat checks whether a fresh session
    // actually came up. Busy-state guards (start already in flight, cleanup
    // joining) can silently drop the RECONFIGURE intent — re-fire within
    // bounds instead of losing the refresh.
    private fun superviseNetworkRefresh(state: String) {
        val deadline = synchronized(refreshLock) { refreshExpectDeadlineMs }
        if (deadline <= 0L) {
            return
        }
        val currentId = synchronized(sessionLock) { nativeSessionId }
        val base: Long
        val retry: Int
        synchronized(refreshLock) {
            base = refreshExpectBaseSessionId
            retry = refreshRetryCount
        }
        if (currentId > 0L && currentId != base && state == "connected") {
            synchronized(refreshLock) {
                refreshExpectDeadlineMs = 0L
                refreshRetryCount = 0
            }
            wdLog("startup network refresh completed session=$currentId")
            return
        }
        if (System.currentTimeMillis() < deadline) {
            return
        }
        val canBounceNow = synchronized(sessionLock) {
            nativeSessionId != 0L && startThread == null && cleanupThread == null
        }
        if (!canBounceNow) {
            extendNetworkRefreshDeadline()
            return
        }
        val fired: Int = synchronized(refreshLock) {
            if (refreshRetryCount >= REFRESH_MAX_RETRY) {
                refreshExpectDeadlineMs = 0L
                wdLog("startup network refresh gave up after $retry retries")
                -1
            } else {
                refreshRetryCount += 1
                refreshExpectBaseSessionId = currentId
                refreshExpectDeadlineMs = System.currentTimeMillis() + REFRESH_EXPECT_WINDOW_MS
                refreshRetryCount
            }
        }
        if (fired < 0) {
            return
        }
        wdLog("startup network refresh re-fire #$fired")
        try {
            startService(Intent(this, ChengHy2TunVpnService::class.java).setAction(ACTION_RECONFIGURE))
        } catch (t: Throwable) {
            wdLog("startup network refresh re-fire failed ($fired): $t")
        }
    }

    private fun extendNetworkRefreshDeadline() {
        synchronized(refreshLock) {
            refreshExpectDeadlineMs =
                System.currentTimeMillis() + REFRESH_EXPECT_WINDOW_MS
        }
        wdLog("startup network refresh deferred: session busy")
    }

    private fun armNetworkRefreshExpectation() {
        val currentId = synchronized(sessionLock) { nativeSessionId }
        synchronized(refreshLock) {
            refreshRetryCount = 0
            refreshExpectBaseSessionId = currentId
            refreshExpectDeadlineMs = System.currentTimeMillis() + REFRESH_EXPECT_WINDOW_MS
        }
    }

    private fun resetAutoRestartStreakLocked() {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putInt(PREF_AUTO_RESTART_STREAK, 0)
            .apply()
    }

    private fun nextAutoRestartBackoffMs(): Long {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val streak = prefs.getInt(PREF_AUTO_RESTART_STREAK, 0) + 1
        prefs.edit().putInt(PREF_AUTO_RESTART_STREAK, streak).apply()
        var delay = AUTO_RESTART_BACKOFF_BASE_MS
        var shift = if (streak - 1 < 5) streak - 1 else 5
        while (shift > 0) {
            delay *= 2
            shift -= 1
        }
        return if (delay > AUTO_RESTART_BACKOFF_MAX_MS) AUTO_RESTART_BACKOFF_MAX_MS else delay
    }

    private fun isCachedStatusJson(json: String): Boolean =
        json.contains("\"status_source\":\"cache\"")

    private fun isMismatchedSessionStatus(json: String, expectedSessionId: Long): Boolean {
        if (expectedSessionId <= 0L) {
            return false
        }
        return try {
            val reported = JSONObject(json).optLong("session_id", 0L)
            reported > 0L && reported != expectedSessionId
        } catch (_: Throwable) {
            false
        }
    }

    private fun scheduleNativeCleanup(snapshot: NativeStopSnapshot?, afterStopDetail: String? = null) {
        if (snapshot == null) {
            return
        }
        closeQuietly(snapshot.fd)
        if (snapshot.sessionId <= 0L && snapshot.mode.isEmpty()) {
            if (afterStopDetail != null) {
                publishStoppedStatus(afterStopDetail)
                stopForegroundCompat()
            }
            return
        }
        val worker = Thread({
            try {
                runNativeStopBlocking(snapshot)
            } catch (err: Throwable) {
                Log.e(TAG, "native cleanup failed: ${redactSecrets(err.message ?: err.javaClass.name)}")
            } finally {
                var restartPath: String? = null
                var backoffMs = 0L
                synchronized(sessionLock) {
                    if (cleanupThread === Thread.currentThread()) {
                        cleanupThread = null
                    }
                    restartPath = desiredConfigPath()
                    backoffMs = autoRestartBackoffMs
                    autoRestartBackoffMs = 0L
                }
                if (afterStopDetail != null) {
                    // Refresh ORC residual after native join completes.
                    publishStoppedStatus(afterStopDetail)
                }
                if (restartPath != null) {
                    val path = restartPath ?: ""
                    if (backoffMs > 0L) {
                        // Terminal-dataplane resurrection: wait out the
                        // exponential backoff first; ACTION_STOP meanwhile
                        // clears desired-running and this firing is skipped.
                        networkRefreshHandler.postDelayed({
                            if (desiredConfigPath() == null) {
                                wdLog("auto restart cancelled: desired cleared")
                                return@postDelayed
                            }
                            wdLog("auto restart firing backoff=${backoffMs}ms")
                            requestForegroundRestart(path)
                        }, backoffMs)
                    } else {
                        requestForegroundRestart(path)
                    }
                }
            }
        }, "ChengHy2TunStop")
        synchronized(sessionLock) {
            cleanupThread = worker
            // Start under the lock so startVpnAsync's null-check guard cannot
            // observe the thread between assignment and start.
            worker.start()
        }
    }

    private fun runNativeStopBlocking(snapshot: NativeStopSnapshot) {
        when (snapshot.mode) {
            "pac" -> {
                ChengHy2TunNative.nativeStopProxy(snapshot.sessionId)
                ChengHy2TunNative.nativeStopProxy(0)
            }
            "tun" -> {
                ChengHy2TunNative.nativeStop(snapshot.sessionId)
                ChengHy2TunNative.nativeStop(0)
            }
            else -> {
                ChengHy2TunNative.nativeStop(snapshot.sessionId)
                ChengHy2TunNative.nativeStop(0)
                ChengHy2TunNative.nativeStopProxy(snapshot.sessionId)
                ChengHy2TunNative.nativeStopProxy(0)
            }
        }
    }

    private fun nativeStatusJson(sessionId: Long): String =
        try {
            val mode = synchronized(sessionLock) { nativeMode }
            val port = synchronized(sessionLock) { proxyListenPort }
            val raw =
                if (mode == "pac") ChengHy2TunNative.nativeProxyStatusJson(sessionId)
                else ChengHy2TunNative.nativeStatusJson(sessionId)
            if (mode == "pac" && port > 0 && raw.endsWith("}")) {
                val pacUrl = pacUrlForPort(port)
                raw.dropLast(1) + ",\"proxy_listen_port\":$port,\"pac_url\":\"$pacUrl\",\"mode\":\"pac\"}"
            } else {
                raw
            }
        } catch (err: Throwable) {
            "{\"state\":\"failed\",\"error\":\"${err.message ?: err.javaClass.name}\"}"
        }

    private fun nativeStateFromJson(json: String): String =
        try {
            JSONObject(json).optString("state", "connected")
        } catch (_: Throwable) {
            "connected"
        }

    private fun isTerminalNativeState(state: String): Boolean =
        state == "stopped" || state == "failed"

    private fun publishStatus(state: String, detail: String) {
        val safeDetail = redactSecrets(detail)
        val detailWithMem = ensureMemDiagDetail(safeDetail)
        synchronized(statusLock) {
            currentState = state
            currentDetail = detailWithMem
        }
        if (detailWithMem.contains("\"mem_live\"")) {
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(PREF_LAST_STATUS_DETAIL, detailWithMem)
                .apply()
        }
        val status = Intent(ACTION_STATUS)
            .setPackage(packageName)
            .putExtra(EXTRA_STATE, state)
            .putExtra(EXTRA_DETAIL, detailWithMem)
        sendBroadcast(status)
    }

    private fun ensureMemDiagDetail(detail: String): String {
        if (detail.contains("\"mem_live\"")) {
            return detail
        }
        val persisted =
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(PREF_LAST_STATUS_DETAIL, "")
                ?: ""
        if (!persisted.contains("\"mem_live\"")) {
            return detail
        }
        return try {
            val src = JSONObject(persisted)
            if (detail.trimStart().startsWith("{")) {
                val dst = JSONObject(detail)
                if (!dst.has("mem_live")) {
                    dst.put("mem_live", src.optLong("mem_live"))
                    dst.put("mem_alloc", src.optLong("mem_alloc"))
                    dst.put("mem_free", src.optLong("mem_free"))
                }
                dst.toString()
            } else if (detail.isEmpty()) {
                JSONObject()
                    .put("state", currentState())
                    .put("mem_live", src.optLong("mem_live"))
                    .put("mem_alloc", src.optLong("mem_alloc"))
                    .put("mem_free", src.optLong("mem_free"))
                    .toString()
            } else {
                detail
            }
        } catch (_: Throwable) {
            detail
        }
    }

    private fun updateNotification(state: String, detail: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager?
        manager?.notify(NOTIFICATION_ID, buildNotification(state, detail))
    }

    private fun buildNotification(state: String, detail: String): Notification {
        createNotificationChannel()
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            pendingIntentFlags(false)
        )
        val stopIntent = PendingIntent.getService(
            this,
            1,
            stopIntent(this),
            pendingIntentFlags(true)
        )
        val builder =
            if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL_ID)
            else Notification.Builder(this)
        val text = if (detail.isEmpty()) state else "$state: $detail"
        builder.setSmallIcon(R.drawable.ic_vpn)
            .setContentTitle("Cheng HY2 TUN")
            .setContentText(text)
            .setContentIntent(contentIntent)
            .setOngoing(state == "connected" || state == "starting")
            .setShowWhen(false)
            .addAction(R.drawable.ic_vpn, getString(R.string.action_stop), stopIntent)
            .setCategory(Notification.CATEGORY_SERVICE)
        return builder.build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) {
            return
        }
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager?
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) {
            return
        }
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Cheng HY2 TUN",
            NotificationManager.IMPORTANCE_LOW
        )
        channel.setShowBadge(false)
        manager.createNotificationChannel(channel)
    }

    private fun pendingIntentFlags(update: Boolean): Int {
        val flags = if (update) PendingIntent.FLAG_UPDATE_CURRENT else 0
        return flags or PendingIntent.FLAG_IMMUTABLE
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= 24) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    private fun redactSecrets(text: String): String =
        text.replace(Regex("(?i)((auth|token|secret|key)[A-Za-z0-9_.-]*=)[^\\s,}]+"), "$1<redacted>")
            .replace(Regex("(?i)(\"(auth|token|secret|key_pk8_der|expected_auth_sha256)\"\\s*:\\s*\")[^\"]*"), "$1<redacted>")

    private class StartCancelledException(message: String) : Exception(message)

    private data class NativeStopSnapshot(
        val sessionId: Long,
        val mode: String,
        val fd: ParcelFileDescriptor?
    )

    companion object {
        const val ACTION_START = "org.cheng.hy2tunvpn.START"
        const val ACTION_STOP = "org.cheng.hy2tunvpn.STOP"
        const val ACTION_QUERY = "org.cheng.hy2tunvpn.QUERY"
        const val ACTION_RECONFIGURE = "org.cheng.hy2tunvpn.RECONFIGURE"
        const val ACTION_STATUS = "org.cheng.hy2tunvpn.STATUS"
        const val STATUS_PERMISSION = "org.cheng.hy2tunvpn.permission.STATUS"
        const val EXTRA_CONFIG_PATH = "config_path"
        const val EXTRA_STATE = "state"
        const val EXTRA_DETAIL = "detail"
        const val ACTION_WATCHDOG_TICK = "org.cheng.hy2tunvpn.WATCHDOG_TICK"

        // Alive means this process currently hosts a bound service instance.
        // The watchdog receiver compares it against the persisted desired-
        // running flag: flag set + process dead => resurrect via FGS start.
        @Volatile
        var serviceProcessAlive: Boolean = false

        fun desiredRunningForContext(context: Context): Boolean {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.getBoolean(PREF_DESIRED_RUNNING, false) &&
                !prefs.getString(PREF_CONFIG_PATH, null).isNullOrEmpty()
        }

        private fun watchdogPendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, ChengHy2TunWatchdogReceiver::class.java)
                .setAction(ACTION_WATCHDOG_TICK)
            return PendingIntent.getBroadcast(
                context,
                7103,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        fun scheduleWatchdogAlarmFor(context: Context) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + WATCHDOG_INTERVAL_MS,
                watchdogPendingIntent(context)
            )
        }

        fun cancelWatchdogAlarmFor(context: Context) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.cancel(watchdogPendingIntent(context))
        }

        private const val NOTIFICATION_ID = 7102
        private const val CHANNEL_ID = "cheng_hy2_tun_vpn"
        const val PREFS_NAME = "cheng_hy2_tun_vpn"
        private const val PREF_DESIRED_RUNNING = "desired_running"
        private const val PREF_CONFIG_PATH = "config_path"
        // One-shot latch armed by the MainActivity enable toggle; the service
        // consumes it on the first routed DNS query to fire the offline-lock
        // network refresh exactly once per user enable.
        const val PREF_REFRESH_PENDING_ENABLE = "refresh_pending_enable"
        private const val PREF_AUTO_RESTART_STREAK = "auto_restart_streak"
    private const val AUTO_RESTART_BACKOFF_BASE_MS = 2_000L
    private const val AUTO_RESTART_BACKOFF_MAX_MS = 60_000L
    // 心跳 5s/tick；连续 6 tick（~30s）tun_wait_calls 无增量判 worker 死。
    private const val WORKER_DEAD_FROZEN_TICKS = 6
        private const val REFRESH_EXPECT_WINDOW_MS = 20_000L
        private const val REFRESH_MAX_RETRY = 6
        // Survives service destroy / QUERY-after-stop so ORC residual stays observable.
        private const val PREF_LAST_STATUS_DETAIL = "last_status_detail"
        private const val TAG = "ChengHy2TunVpn"
        private const val WATCHDOG_INTERVAL_MS = 120_000L
        // Huawei ROM suppresses our logcat TAG lines in background-started
        // processes; crash-recovery diagnosis therefore goes to a file.
        private val wdLogLock = Any()
        // Keep aligned with VpnProxyTunShouldProxyIpDirectly (/16 of each dotted prefix).
        private val FAST_MODE_PROXY_IP_ROUTES = listOf(
            "216.239.0.0" to 16,
            "142.250.0.0" to 16,
            "142.251.0.0" to 16,
            "172.217.0.0" to 16,
            "172.253.0.0" to 16,
            "74.125.0.0" to 16,
            "64.233.0.0" to 16,
            "108.177.0.0" to 16,
            "173.194.0.0" to 16,
            "209.85.0.0" to 16,
            "91.108.0.0" to 16,
            "149.154.0.0" to 16
        )
        private val statusLock = Any()
        private var currentState = "stopped"
        private var currentDetail = ""
        private var currentSessionId = 0L
        private var currentMode = ""
        private var currentProxyListenPort = 0

        fun pacUrlForPort(port: Int): String =
            "http://localhost:$port/cheng-hy2-tun.pac"

        fun startIntent(context: Context, configPath: String): Intent =
            Intent(context, ChengHy2TunVpnService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_CONFIG_PATH, configPath)

        fun stopIntent(context: Context): Intent =
            Intent(context, ChengHy2TunVpnService::class.java).setAction(ACTION_STOP)

        fun queryIntent(context: Context): Intent =
            Intent(context, ChengHy2TunVpnService::class.java).setAction(ACTION_QUERY)

        fun reconfigureIntent(context: Context): Intent =
            Intent(context, ChengHy2TunVpnService::class.java).setAction(ACTION_RECONFIGURE)

        fun currentState(): String = synchronized(statusLock) {
            if (currentState == "connected" && currentSessionId <= 0L) "starting" else currentState
        }

        fun currentDetail(): String = synchronized(statusLock) {
            if (currentState == "connected" && currentSessionId <= 0L) {
                "native session pending"
            } else {
                currentDetail
            }
        }

        fun currentDetail(context: Context): String {
            val live = currentDetail()
            if (live.contains("\"mem_live\"") || live.contains("orc: live=")) {
                return live
            }
            val persisted =
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .getString(PREF_LAST_STATUS_DETAIL, "")
                    ?: ""
            return if (persisted.contains("\"mem_live\"")) persisted else live
        }

        fun desiredConfigPathForContext(context: Context): String? {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            if (!prefs.getBoolean(PREF_DESIRED_RUNNING, false)) {
                return null
            }
            return prefs.getString(PREF_CONFIG_PATH, "") ?: ""
        }

        fun currentLiveDetail(): String {
            val sessionId: Long
            val mode: String
            val port: Int
            val fallback: String
            synchronized(statusLock) {
                sessionId = currentSessionId
                mode = currentMode
                port = currentProxyListenPort
                fallback = currentDetail
            }
            if (sessionId <= 0L) {
                return fallback
            }
            return try {
                val raw =
                    if (mode == "pac") ChengHy2TunNative.nativeProxyStatusJson(sessionId)
                    else ChengHy2TunNative.nativeStatusJson(sessionId)
                if (mode == "pac" && port > 0 && raw.endsWith("}")) {
                    val pacUrl = pacUrlForPort(port)
                    raw.dropLast(1) + ",\"proxy_listen_port\":$port,\"pac_url\":\"$pacUrl\",\"mode\":\"pac\"}"
                } else {
                    raw
                }
            } catch (_: Throwable) {
                fallback
            }
        }

        private fun updateActiveNativeSession(sessionId: Long, mode: String, port: Int) {
            synchronized(statusLock) {
                currentSessionId = sessionId
                currentMode = mode
                currentProxyListenPort = port
            }
        }

        private fun closeQuietly(fd: ParcelFileDescriptor?) {
            if (fd == null) {
                return
            }
            try {
                fd.close()
            } catch (_: IOException) {
            }
        }
    }
}
