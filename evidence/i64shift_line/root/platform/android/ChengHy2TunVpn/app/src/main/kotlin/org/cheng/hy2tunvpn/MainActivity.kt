package org.cheng.hy2tunvpn

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.io.IOException
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var titleText: TextView
    private lateinit var statusText: TextView
    private lateinit var detailText: TextView
    private lateinit var configText: TextView
    private lateinit var transportText: TextView
    private lateinit var modeText: TextView
    private lateinit var googleTestText: TextView
    private lateinit var tunSummaryText: TextView
    private var pendingConfigPath = ""
    private var selectedMode = ROUTE_MODE_FAST
    private var statusReceiverRegistered = false
    private var initialConfigError = ""
    private var chengGuiModel = ChengGuiModel.empty()
    private val chengButtons = LinkedHashMap<String, Button>()
    private val chengButtonRows = ArrayList<Pair<LinearLayout, List<String>>>()
    private var pendingGoogleTrafficBefore: TrafficCounters? = null
    private var pendingGoogleTrafficStartedMs = 0L
    @Volatile
    private var pendingGoogleTrafficCheckRunning = false
    @Volatile
    private var chengGuiLoadGeneration = 0
    private var lastRuntimeState = "stopped"
    // Keep last ORC sample across transitional plain-text status updates
    // ("stop requested") so after-stop deterministic-memory contract stays visible.
    private var lastOrcLiveLine: String = ""
    private val uiPrefs by lazy { getSharedPreferences("cheng_hy2_tun_vpn_ui", MODE_PRIVATE) }

    private val statusReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != ChengHy2TunVpnService.ACTION_STATUS) {
                return
            }
            val state = intent.getStringExtra(ChengHy2TunVpnService.EXTRA_STATE)
            val detail = intent.getStringExtra(ChengHy2TunVpnService.EXTRA_DETAIL)
            updateStatus(
                state,
                detail
            )
            scheduleNativeStatusQueryIfNeeded(state, detail)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNotificationPermission()
        try {
            getExternalFilesDir(null)?.mkdirs()
        } catch (_: Throwable) {
        }
        try {
            val config = Hy2TunConfig.ensureDefaultFile(this)
            pendingConfigPath = configPathFromIntent(intent) ?: config.absolutePath
        } catch (err: java.io.IOException) {
            pendingConfigPath = ""
            initialConfigError = err.message ?: "config init failed"
        }
        buildUi()
        if (pendingConfigPath.isEmpty()) {
            configText.text = initialConfigError
            transportText.text = getString(R.string.transport_unknown)
        } else {
            updateConfigDisplay()
            updateModeDisplay()
        }
        updateStatus(
            ChengHy2TunVpnService.currentState(),
            ChengHy2TunVpnService.currentDetail(this)
        )
        handleDiagnosticIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDiagnosticIntent(intent)
        val configPath = configPathFromIntent(intent) ?: return
        pendingConfigPath = configPath
        updateConfigDisplay()
        updateModeDisplay()
        updateStatus(
            ChengHy2TunVpnService.currentState(),
            ChengHy2TunVpnService.currentDetail(this)
        )
    }

    @SuppressLint("UnspecifiedRegisterReceiverFlag")
    override fun onResume() {
        super.onResume()
        val filter = IntentFilter(ChengHy2TunVpnService.ACTION_STATUS)
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(
                statusReceiver,
                filter,
                Context.RECEIVER_NOT_EXPORTED
            )
        } else {
            registerReceiver(statusReceiver, filter)
        }
        statusReceiverRegistered = true
        // Broadcasts while paused are dropped; re-sync companion state immediately.
        // Prefer prefs-backed detail so ORC residual survives stopSelf / QUERY races.
        updateStatus(
            ChengHy2TunVpnService.currentState(),
            ChengHy2TunVpnService.currentDetail(this)
        )
        if (restoreDesiredVpnOnForegroundIfNeeded()) {
            statusText.postDelayed({
                sendServiceIntent(ChengHy2TunVpnService.queryIntent(this))
            }, 900)
        } else if (ChengHy2TunVpnService.currentState() == "connected" ||
            ChengHy2TunVpnService.currentState() == "starting"
        ) {
            // Foreground resume: refresh native JSON detail without relying on sticky UI text.
            statusText.postDelayed({
                sendServiceIntent(ChengHy2TunVpnService.queryIntent(this))
            }, 300)
        } else if (ChengHy2TunVpnService.currentState() == "stopped" ||
            ChengHy2TunVpnService.currentState() == "disconnected"
        ) {
            // After stop, prefs already hold mem_* from publishStoppedStatus. Skip
            // QUERY spam on every resume — gate after-stop launch storms + QUERY
            // pegged Huawei main looper into Timeout executing service ANR.
            val detail = ChengHy2TunVpnService.currentDetail(this)
            if (!detail.contains("\"mem_live\"")) {
                statusText.postDelayed({
                    sendServiceIntent(ChengHy2TunVpnService.queryIntent(this))
                }, 400)
            }
        }
        if (::googleTestText.isInitialized) {
            googleTestText.postDelayed({ completePendingGoogleBrowserTrafficTestAsync() }, 1200)
            googleTestText.postDelayed({ completePendingGoogleBrowserTrafficTestAsync() }, 3000)
        }
    }

    override fun onPause() {
        if (statusReceiverRegistered) {
            unregisterReceiver(statusReceiver)
            statusReceiverRegistered = false
        }
        super.onPause()
    }

    @Deprecated("Android framework callback")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_VPN && resultCode == RESULT_OK) {
            startVpn()
            return
        }
        if (requestCode == REQUEST_CONFIG && resultCode == RESULT_OK) {
            importSelectedConfig(data)
        }
    }

    private fun verifyChengGuiContract(path: String): ChengGuiModel {
        if (path.isEmpty()) {
            return ChengGuiModel.empty()
        }
        val snapshot = ChengHy2TunNative.nativeGuiSnapshot("android", path)
        try {
            java.io.File(filesDir, "wd.log").appendText(
                "${System.currentTimeMillis()} gui_snapshot $snapshot\n"
            )
        } catch (_: Throwable) {
        }
        return ChengGuiModel.parse(snapshot)
    }

    private fun refreshChengGuiModelAsync() {
        if (pendingConfigPath.isEmpty()) {
            chengGuiModel = ChengGuiModel.empty()
            return
        }
        val path = pendingConfigPath
        val generation = chengGuiLoadGeneration + 1
        chengGuiLoadGeneration = generation
        Thread({
            val result = try {
                verifyChengGuiContract(path)
            } catch (err: Throwable) {
                ChengGuiModel.error(redactSecrets(err.message ?: err.javaClass.name))
            }
            runOnUiThread {
                if (generation != chengGuiLoadGeneration || path != pendingConfigPath) {
                    return@runOnUiThread
                }
                chengGuiModel = result
                if (::titleText.isInitialized) {
                    applyChengText(titleText, "title", getString(R.string.app_name))
                }
                refreshChengButtonStates()
            }
        }, "ChengHy2TunGuiContract").start()
    }

    private fun chengComponent(id: String): ChengGuiComponent =
        chengGuiModel.components[id] ?: ChengGuiComponent(id, "text", "", id, "", "body", false, 0, id)

    private fun chengText(id: String, defaultText: String): String =
        chengGuiModel.components[id]?.text?.takeIf { it.isNotEmpty() } ?: defaultText

    private fun applyChengText(view: TextView, id: String, defaultText: String) {
        val component = chengComponent(id)
        view.text = component.text.ifEmpty { defaultText }
        view.contentDescription = component.accessibility.ifEmpty { component.text }
    }

    private fun chengButton(id: String, onClick: () -> Unit): Button {
        val component = chengComponent(id)
        return Button(this).apply {
            isAllCaps = false
            text = component.text
            minHeight = dp(if (component.minTouchDp > 0) component.minTouchDp else chengGuiModel.minTouchDp)
            isEnabled = component.enabled
            contentDescription = component.accessibility
            setPadding(dp(14), 0, dp(14), 0)
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            includeFontPadding = false
            applyChengButtonStyle(this, id)
            setOnClickListener { onClick() }
            chengButtons[id] = this
        }
    }

    private fun refreshChengButtonStates() {
        for ((id, button) in chengButtons) {
            val component = chengComponent(id)
            val label = runtimeButtonLabel(id, component)
            if (label.isNotEmpty()) {
                button.text = label
            }
            val enabled = runtimeButtonEnabled(id, component)
            button.isEnabled = enabled
            button.visibility = if (runtimeButtonVisible(id)) View.VISIBLE else View.GONE
            button.contentDescription = runtimeButtonAccessibility(id, label.ifEmpty { component.text }, enabled)
            button.minHeight = dp(if (component.minTouchDp > 0) component.minTouchDp else chengGuiModel.minTouchDp)
            applyChengButtonStyle(button, id)
        }
        for ((row, ids) in chengButtonRows) {
            row.visibility = if (ids.any { runtimeButtonVisible(it) }) View.VISIBLE else View.GONE
        }
    }

    private fun runtimeButtonEnabled(id: String, component: ChengGuiComponent): Boolean {
        val state = lastRuntimeState
        val running = state == "starting" || state == "connected" || state == "stopping"
        val needsStopOrReset = running || state == "failed" || state == "error"
        return when (id) {
            "proxy_toggle" -> component.enabled && (
                shouldProxyToggleStop() || pendingConfigPath.isNotEmpty()
            )
            "start" -> pendingConfigPath.isNotEmpty() && !needsStopOrReset
            "stop" -> true
            "test_google" -> state == "connected"
            "network_settings" -> shouldShowNetworkSettingsAction()
            "mode_global", "mode_fast", "transport_udp_quic", "transport_tcp_forward" ->
                component.enabled && pendingConfigPath.isNotEmpty() && !running
            "status_refresh" -> component.enabled
            else -> component.enabled
        }
    }

    private fun runtimeButtonVisible(id: String): Boolean =
        when (id) {
            "network_settings" -> shouldShowNetworkSettingsAction()
            else -> true
        }

    private fun shouldShowNetworkSettingsAction(): Boolean {
        val detail = if (::detailText.isInitialized) detailText.text.toString() else ""
        val lower = detail.lowercase()
        return lower.contains("app network access blocked") ||
            (lower.contains("network access") && lower.contains("blocked"))
    }

    private fun runtimeButtonLabel(id: String, component: ChengGuiComponent): String =
        if (id == "proxy_toggle") proxyToggleText() else component.text

    private fun runtimeButtonAccessibility(id: String, labelText: String, enabled: Boolean): String {
        val label = labelText.ifEmpty { id }
        val state = if (enabled) "enabled" else "disabled"
        return "$id button $state $label"
    }

    private fun applyChengButtonStyle(button: Button, id: String) {
        val theme = chengGuiModel.theme
        val selected = when (id) {
            "mode_global" -> selectedMode == ROUTE_MODE_GLOBAL
            "mode_fast" -> selectedMode == ROUTE_MODE_FAST
            "transport_udp_quic" -> currentTransportText().contains(TRANSPORT_UDP_QUIC)
            "transport_tcp_forward" -> currentTransportText().contains(TRANSPORT_TCP_FORWARD)
            else -> false
        }
        val bg = GradientDrawable().apply {
            cornerRadius = dp(12).toFloat()
            when {
                !button.isEnabled -> {
                    setColor(theme.disabled)
                    setStroke(dp(1), theme.border)
                }
                id == "stop" || (id == "proxy_toggle" && shouldProxyToggleStop()) -> {
                    setColor(theme.dangerSoft)
                    setStroke(dp(1), theme.danger)
                }
                id == "start" || id == "proxy_toggle" || id == "test_google" || id == "status_refresh" || selected -> {
                    setColor(theme.primary)
                    setStroke(0, theme.primary)
                }
                else -> {
                    setColor(theme.surface)
                    setStroke(dp(1), theme.border)
                }
            }
        }
        button.background = bg
        button.setTextColor(
            when {
                !button.isEnabled -> theme.disabledText
                id == "stop" || (id == "proxy_toggle" && shouldProxyToggleStop()) -> theme.danger
                id == "start" || id == "proxy_toggle" || id == "test_google" || id == "status_refresh" || selected -> theme.inverseText
                else -> theme.text
            }
        )
    }

    private fun currentTransportText(): String =
        if (::transportText.isInitialized) transportText.text.toString() else ""

    private fun surfacePanel(): LinearLayout =
        LinearLayout(this).apply {
            val theme = chengGuiModel.theme
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = GradientDrawable().apply {
                cornerRadius = dp(14).toFloat()
                setColor(theme.surface)
                setStroke(dp(1), theme.border)
            }
        }

    private fun applyStatusBadgeStyle() {
        if (!::statusText.isInitialized) {
            return
        }
        val status = lastRuntimeState
        val theme = chengGuiModel.theme
        val color = when (status) {
            "connected" -> theme.success
            "starting", "stopping" -> theme.warning
            "error", "failed" -> theme.danger
            else -> theme.mutedDark
        }
        statusText.setTextColor(theme.inverseText)
        statusText.typeface = Typeface.DEFAULT_BOLD
        statusText.setPadding(dp(12), dp(6), dp(12), dp(6))
        statusText.background = GradientDrawable().apply {
            cornerRadius = dp(9).toFloat()
            setColor(color)
        }
    }

    private fun buildUi() {
        chengButtons.clear()
        val padding = dp(20)
        val theme = chengGuiModel.theme
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(padding, padding, padding, padding)
            setBackgroundColor(theme.background)
        }

        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        titleText = TextView(this).apply {
            text = chengText("title", getString(R.string.app_name))
            textSize = 26f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(theme.text)
            gravity = Gravity.CENTER_VERTICAL
            contentDescription = chengComponent("title").accessibility
        }
        headerRow.addView(titleText, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            setMargins(0, dp(8), dp(10), dp(8))
        })
        root.addView(headerRow, matchWrap())

        addChengButtonRows(root)

        val scroll = ScrollView(this)
        val body = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }

        googleTestText = TextView(this).apply {
            textSize = 14f
            gravity = Gravity.CENTER
            setTextColor(theme.muted)
            text = chengText("google_status", getString(R.string.google_not_tested))
            contentDescription = chengComponent("google_status").accessibility
        }
        body.addView(googleTestText, matchWrap())

        val statusPanel = surfacePanel()
        modeText = TextView(this)
        configText = TextView(this)
        transportText = TextView(this)

        statusText = TextView(this).apply {
            textSize = 16f
            gravity = Gravity.CENTER
            includeFontPadding = false
        }
        statusPanel.addView(statusText, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            setMargins(0, dp(4), 0, dp(10))
        })

        detailText = TextView(this).apply {
            textSize = 12f
            gravity = Gravity.CENTER
            setTextColor(theme.muted)
        }
        statusPanel.addView(detailText, matchWrap())

        tunSummaryText = TextView(this).apply {
            textSize = 12f
            gravity = Gravity.CENTER
            setTextColor(theme.muted)
        }
        statusPanel.addView(tunSummaryText, matchWrap())
        body.addView(statusPanel, matchWrap())

        scroll.addView(body)
        root.addView(scroll, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ))
        setContentView(root)
    }

    private fun addChengButtonRows(root: LinearLayout) {
        chengButtonRows.clear()
        for (rowIds in chengGuiModel.buttonRows) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER
            }
            chengButtonRows.add(row to rowIds)
            for ((index, id) in rowIds.withIndex()) {
                row.addView(chengButton(id) { dispatchChengButton(id) }, LinearLayout.LayoutParams(
                    0,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    1f
                ).apply {
                    val left = if (index == 0) 0 else dp(6)
                    val right = if (index == rowIds.size - 1) 0 else dp(6)
                    setMargins(left, dp(8), right, dp(8))
                })
            }
            root.addView(row, matchWrap())
        }
    }

    private fun dispatchChengButton(id: String) {
        when (id) {
            "proxy_toggle" -> {
                if (shouldProxyToggleStop()) {
                    updateStatus("stopping", "stop requested")
                    sendServiceIntent(ChengHy2TunVpnService.stopIntent(this@MainActivity))
                } else {
                    requestVpnPermissionThenStart()
                }
            }
            "mode_global" -> setProductMode(ROUTE_MODE_GLOBAL)
            "mode_fast" -> setProductMode(ROUTE_MODE_FAST)
            "transport_udp_quic" -> setTransport(TRANSPORT_UDP_QUIC)
            "transport_tcp_forward" -> setTransport(TRANSPORT_TCP_FORWARD)
            "start" -> requestVpnPermissionThenStart()
            "stop" -> {
                updateStatus("stopping", "stop requested")
                sendServiceIntent(ChengHy2TunVpnService.stopIntent(this@MainActivity))
            }
            "test_google" -> testGoogle()
            "network_settings" -> openNetworkAccessSettings()
            "status_refresh" -> sendServiceIntent(ChengHy2TunVpnService.queryIntent(this@MainActivity))
        }
    }

    private fun openNetworkAccessSettings() {
        val attempts = arrayOf(
            Intent("huawei.intent.action.NETWORK_SETTING").setPackage("com.huawei.systemmanager"),
            Intent("huawei.intent.action.TRAFFIC_APP_DETAIL")
                .setPackage("com.huawei.systemmanager")
                .putExtra("packageName", packageName)
                .putExtra("uid", android.os.Process.myUid()),
            Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:$packageName"))
        )
        var lastError: Throwable? = null
        for (intent in attempts) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
                return
            } catch (err: Throwable) {
                lastError = err
            }
        }
        updateStatus("failed", "open network settings failed: ${lastError?.message ?: "unknown"}")
    }

    private fun chooseConfig() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/json"
        }
        @Suppress("DEPRECATION")
        startActivityForResult(intent, REQUEST_CONFIG)
    }

    private fun importSelectedConfig(data: Intent?) {
        val uri = data?.data
        if (uri == null) {
            updateStatus("failed", "config selection missing")
            return
        }
        try {
            val destination = File(filesDir, "hy2-tun-client.json")
            contentResolver.openInputStream(uri).use { input ->
                if (input == null) {
                    throw IOException("open selected config failed")
                }
                val tmp = File(filesDir, "hy2-tun-client.json.tmp")
                FileOutputStream(tmp).use { output ->
                    input.copyTo(output)
                    output.fd.sync()
                }
                if (!tmp.renameTo(destination)) {
                    throw IOException("rename selected config failed")
                }
            }
            pendingConfigPath = destination.absolutePath
            updateConfigDisplay()
            updateStatus("stopped", "config imported")
            sendServiceIntent(ChengHy2TunVpnService.reconfigureIntent(this))
        } catch (err: Throwable) {
            updateStatus("failed", redactSecrets(err.message ?: err.javaClass.name))
        }
    }

    private fun handleDiagnosticIntent(intent: Intent?) {
        if (intent?.action != ACTION_TRACE_TCP) {
            return
        }
        val clear = intent.getBooleanExtra(EXTRA_TRACE_CLEAR, false)
        val localPort = intent.getIntExtra(EXTRA_TRACE_LOCAL_PORT, 0)
        val dnsQueryId = intent.getIntExtra(EXTRA_TRACE_DNS_QUERY_ID, -1)
        val dnsHost = intent.getStringExtra(EXTRA_TRACE_DNS_HOST)?.trim().orEmpty()
        val result = try {
            if (clear) {
                if (localPort in 1..65535) {
                    ChengHy2TunNative.nativeClearTcpTraceForLocalPort(localPort)
                    "tcp_trace_clear=1 port=$localPort"
                } else {
                    ChengHy2TunNative.nativeClearTcpTrace()
                    "tcp_trace_clear=1 port=all"
                }
            } else if (localPort in 1..65535) {
                ChengHy2TunNative.nativeTcpTraceForLocalPort(localPort)
            } else if (dnsQueryId in 0..65535) {
                val answerIp = ChengHy2TunNative.nativeDnsAnswerIpForId(dnsQueryId)
                if (answerIp.isEmpty()) {
                    "dns_trace query_id=$dnsQueryId found=0"
                } else {
                    "dns_trace query_id=$dnsQueryId found=1 answer_ip=$answerIp"
                }
            } else if (dnsHost.isNotEmpty()) {
                val answerIp = ChengHy2TunNative.nativeDnsAnswerIpForHost(dnsHost)
                if (answerIp.isEmpty()) {
                    "dns_trace host=${safeFileToken(dnsHost)} found=0"
                } else {
                    "dns_trace host=${safeFileToken(dnsHost)} found=1 answer_ip=$answerIp"
                }
            } else {
                ChengHy2TunNative.nativeTcpTraceSummary()
            }
        } catch (err: Throwable) {
            "tcp_trace=error port=$localPort detail=${safeFileToken(err.message ?: err.javaClass.name)}"
        }
        try {
            File(filesDir, TRACE_RESULT_FILE).writeText("$result\n", Charsets.UTF_8)
        } catch (_: Throwable) {
        }
    }

    private fun requestVpnPermissionThenStart() {
        if (pendingConfigPath.isEmpty()) {
            updateStatus("failed", "config file missing")
            return
        }
        if (!validateStartConfiguration()) {
            return
        }
        val prepare = VpnService.prepare(this)
        if (prepare != null) {
            @Suppress("DEPRECATION")
            startActivityForResult(prepare, REQUEST_VPN)
            return
        }
        startVpn()
    }

    private fun configPathFromIntent(intent: Intent?): String? =
        intent?.getStringExtra(ChengHy2TunVpnService.EXTRA_CONFIG_PATH)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }

    private fun validateStartConfiguration(): Boolean {
        return try {
            Hy2TunConfig.preview(java.io.File(pendingConfigPath))
            true
        } catch (err: Throwable) {
            updateStatus("failed", err.message ?: err.javaClass.name)
            false
        }
    }

    private fun startVpn() {
        updateStatus("starting", "start requested")
        // Manual enable arms the one-shot browser offline-lock refresh latch;
        // watchdog/auto resurrections do not arm it (no churn on restarts).
        getSharedPreferences(ChengHy2TunVpnService.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(ChengHy2TunVpnService.PREF_REFRESH_PENDING_ENABLE, true)
            .apply()
        sendServiceIntent(ChengHy2TunVpnService.startIntent(this, pendingConfigPath))
    }

    private fun restoreDesiredVpnOnForegroundIfNeeded(): Boolean {
        val desiredPath = ChengHy2TunVpnService.desiredConfigPathForContext(this) ?: return false
        if (desiredPath.isBlank()) {
            return false
        }
        val liveState = ChengHy2TunVpnService.currentState()
        if (liveState == "connected" || liveState == "starting") {
            return false
        }
        pendingConfigPath = desiredPath
        updateConfigDisplay()
        updateModeDisplay()
        updateStatus("starting", "restore requested")
        sendServiceIntent(ChengHy2TunVpnService.startIntent(this, desiredPath))
        return true
    }

        private fun sendServiceIntent(intent: Intent) {
        try {
            if (Build.VERSION.SDK_INT >= 26 && intent.action == ChengHy2TunVpnService.ACTION_START) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        } catch (e: Exception) {
            // BackgroundServiceStartNotAllowedException on Android 12+ when the
            // app is briefly in background during resume. Surface it — silent
            // swallow left sticky restore looking like a spontaneous disconnect.
            android.util.Log.e(
                "ChengHy2TunVpn",
                "sendServiceIntent failed action=${intent.action}: ${e.javaClass.simpleName}: ${e.message}"
            )
            updateStatus("failed", "service start blocked: ${e.javaClass.simpleName}")
        }
    }

    private fun updateStatus(state: String?, detail: String?) {
        lastRuntimeState = displayState(state?.takeIf { it.isNotEmpty() } ?: "stopped")
        statusText.text = displayStateLabel(lastRuntimeState)
        detailText.text = compactStatusDetail(detail ?: "")
        applyStatusBadgeStyle()
        refreshChengButtonStates()
    }

    private fun scheduleNativeStatusQueryIfNeeded(state: String?, detail: String?) {
        // Refresh JSON detail while connected, and once after stop so ORC live remains visible.
        if (state != "connected" && state != "stopped" && state != "disconnected") {
            return
        }
        if (state == "connected" && (detail ?: "").trimStart().startsWith("{")) {
            return
        }
        // Stop path already publishes mem_* via publishStoppedStatus; avoid QUERY
        // storms when the gate re-launches MainActivity after disconnect.
        if ((state == "stopped" || state == "disconnected") &&
            (detail ?: "").contains("\"mem_live\"")
        ) {
            return
        }
        statusText.postDelayed({
            sendServiceIntent(ChengHy2TunVpnService.queryIntent(this))
        }, 300)
        statusText.postDelayed({
            sendServiceIntent(ChengHy2TunVpnService.queryIntent(this))
        }, 1200)
    }

    private fun displayState(state: String): String =
        if (state == "stopped") "disconnected" else state

    private fun displayStateLabel(state: String): String =
        when (state) {
            "connected" -> "已连接"
            "starting" -> "连接中"
            "stopping" -> "正在关闭"
            "error", "failed" -> "错误"
            else -> "已关闭"
        }

    private fun shouldProxyToggleStop(): Boolean =
        when (lastRuntimeState) {
            "starting", "connected", "stopping", "error", "failed" -> true
            else -> false
        }

    private fun proxyToggleText(): String =
        when (lastRuntimeState) {
            "connected" -> "关闭代理"
            "starting" -> "停止启动"
            "stopping" -> "停止中"
            "error", "failed" -> "重置代理"
            else -> "开启代理"
        }

    private fun compactStatusDetail(detail: String): String {
        val safeDetail = redactSecrets(detail)
        if (lastOrcLiveLine.isEmpty()) {
            lastOrcLiveLine = uiPrefs.getString(PREF_LAST_ORC_LINE, "") ?: ""
        }
        if (!safeDetail.trimStart().startsWith("{")) {
            if (lastOrcLiveLine.isNotEmpty() && !safeDetail.contains("orc: live=")) {
                return if (safeDetail.isEmpty()) lastOrcLiveLine else "$safeDetail\n$lastOrcLiveLine"
            }
            return safeDetail
        }
        return try {
            val parsed = JSONObject(safeDetail)
            val lines = ArrayList<String>()
            val text = parsed.optString("text", "")
            if (text.isNotEmpty()) {
                lines.add("core: $text")
            }
            val sessionId = parsed.optLong("session_id", 0L)
            if (sessionId > 0L) {
                lines.add("session: $sessionId")
            }
            val pacUrl = parsed.optString("pac_url", "")
            if (pacUrl.isNotEmpty()) {
                lines.add("pac: $pacUrl")
            }
            val port = parsed.optInt("proxy_listen_port", 0)
            if (port > 0) {
                lines.add("proxy: 127.0.0.1:$port")
            }
            val protectCalls = parsed.optLong("protect_calls", -1L)
            if (protectCalls >= 0L) {
                lines.add(
                    "protect: calls=$protectCalls ok=${parsed.optLong("protect_success", 0L)} fail=${parsed.optLong("protect_failure", 0L)}"
                )
            }
            val memLive = parsed.optLong("mem_live", -1L)
            if (memLive >= 0L) {
                lastOrcLiveLine =
                    "orc: live=$memLive alloc=${parsed.optLong("mem_alloc", 0L)} free=${parsed.optLong("mem_free", 0L)}"
                uiPrefs.edit().putString(PREF_LAST_ORC_LINE, lastOrcLiveLine).apply()
                lines.add(lastOrcLiveLine)
            } else {
                if (lastOrcLiveLine.isEmpty()) {
                    lastOrcLiveLine = uiPrefs.getString(PREF_LAST_ORC_LINE, "") ?: ""
                }
                if (lastOrcLiveLine.isNotEmpty()) {
                    lines.add(lastOrcLiveLine)
                }
            }
            val rxPackets = parsed.optLong("rx_packets", -1L)
            val txPackets = parsed.optLong("tx_packets", -1L)
            if (rxPackets >= 0L || txPackets >= 0L) {
                lines.add("tun packets: rx=$rxPackets tx=$txPackets")
            }
            val waitCalls = parsed.optLong("tun_wait_calls", -1L)
            val readCalls = parsed.optLong("tun_read_calls", -1L)
            val writeCalls = parsed.optLong("tun_write_calls", -1L)
            if (waitCalls >= 0L || readCalls >= 0L || writeCalls >= 0L) {
                lines.add(
                    "tun fd: wait=$waitCalls ready=${parsed.optLong("tun_wait_ready", 0L)} read=$readCalls write=$writeCalls last=${parsed.optInt("tun_last_wait_result", 0)}/${parsed.optInt("tun_last_read_result", 0)}/${parsed.optInt("tun_last_write_result", 0)}"
                )
            }
            val lastRxProto = parsed.optInt("last_rx_proto", -1)
            val lastTxProto = parsed.optInt("last_tx_proto", -1)
            if (lastRxProto >= 0 || lastTxProto >= 0) {
                lines.add(
                    "last: rx=${protoName(lastRxProto)}:${parsed.optInt("last_rx_sport", -1)}->${parsed.optInt("last_rx_dport", -1)} ${parsed.optString("last_rx_dst", "")}"
                )
                lines.add(
                    "last: tx=${protoName(lastTxProto)}:${parsed.optInt("last_tx_sport", -1)}->${parsed.optInt("last_tx_dport", -1)} ${parsed.optString("last_tx_dst", "")}"
                )
            }
            val rxDnsQtype = parsed.optInt("last_rx_dns_qtype", -1)
            val txDnsQtype = parsed.optInt("last_tx_dns_qtype", -1)
            if (rxDnsQtype >= 0 || txDnsQtype >= 0) {
                lines.add(
                    "dns: rx id=${parsed.optInt("last_rx_dns_id", -1)} q=$rxDnsQtype ans=${parsed.optInt("last_rx_dns_answers", -1)} rcode=${parsed.optInt("last_rx_dns_rcode", -1)} csum=${parsed.optInt("last_rx_dns_checksum_ok", -1)} a=${parsed.optString("last_rx_dns_answer_ip", "")}"
                )
                lines.add(
                    "dns: tx id=${parsed.optInt("last_tx_dns_id", -1)} q=$txDnsQtype ans=${parsed.optInt("last_tx_dns_answers", -1)} rcode=${parsed.optInt("last_tx_dns_rcode", -1)} csum=${parsed.optInt("last_tx_dns_checksum_ok", -1)} a=${parsed.optString("last_tx_dns_answer_ip", "")}"
                )
            }
            val error = parsed.optString("error", "")
            if (error.isNotEmpty()) {
                lines.add("error: $error")
            }
            if (lines.isEmpty()) safeDetail else lines.joinToString("\n")
        } catch (_: Throwable) {
            safeDetail
        }
    }

    private fun updateConfigDisplay() {
        configText.text = pendingConfigPath
        try {
            val config = Hy2TunConfig.preview(java.io.File(pendingConfigPath))
            pendingConfigPath = config.file.absolutePath
            selectedMode = config.routeMode
            refreshChengGuiModelAsync()
            refreshChengButtonStates()
            configText.text = pendingConfigPath
            transportText.text = getString(R.string.transport_label, config.transport)
            tunSummaryText.text = chengText("traffic_text", "rx: 0 / tx: 0")
            updateModeDisplay()
        } catch (err: Throwable) {
            transportText.text = getString(R.string.transport_label, "invalid")
            tunSummaryText.text = redactSecrets(err.message ?: err.javaClass.name)
        }
    }

    private fun protoName(proto: Int): String =
        when (proto) {
            6 -> "tcp"
            17 -> "udp"
            else -> proto.toString()
        }

    private fun setTransport(transport: String) {
        if (pendingConfigPath.isEmpty()) {
            updateStatus("failed", "config file missing")
            return
        }
        try {
            val updated = Hy2TunConfig.updateExitTransport(java.io.File(pendingConfigPath), transport)
            pendingConfigPath = updated.file.absolutePath
            updateConfigDisplay()
            sendServiceIntent(ChengHy2TunVpnService.reconfigureIntent(this))
        } catch (err: Throwable) {
            updateStatus("failed", redactSecrets(err.message ?: err.javaClass.name))
        }
    }

    private fun setProductMode(mode: String) {
        if (pendingConfigPath.isEmpty()) {
            updateStatus("failed", "config file missing")
            return
        }
        try {
            val updated = Hy2TunConfig.updateClientMode(java.io.File(pendingConfigPath), mode)
            pendingConfigPath = updated.file.absolutePath
            selectedMode = updated.routeMode
            updateConfigDisplay()
            sendServiceIntent(ChengHy2TunVpnService.reconfigureIntent(this))
        } catch (err: Throwable) {
            updateStatus("failed", redactSecrets(err.message ?: err.javaClass.name))
        }
    }

    private fun updateModeDisplay() {
        if (::modeText.isInitialized) {
            modeText.text = getString(R.string.mode_label, selectedMode)
        }
    }

    private fun testGoogle() {
        googleTestText.setText(R.string.google_testing)
        try {
            startGoogleBrowserTrafficTest()
        } catch (err: Throwable) {
            googleTestText.text = "google: error ${safeErrorText(err)}"
        }
    }

    private fun startGoogleBrowserTrafficTest() {
        if (findVpnNetwork() == null) {
            googleTestText.text = "google: error vpn network missing"
            return
        }
        pendingGoogleTrafficBefore = currentTrafficCounters()
        pendingGoogleTrafficStartedMs = System.currentTimeMillis()
        pendingGoogleTrafficCheckRunning = false
        val nonce = System.currentTimeMillis().toString()
        val url = "https://www.google.com/?cheng_hy2_tun=$nonce"
        openBrowserForGoogleTest(url)
    }

    private fun completePendingGoogleBrowserTrafficTestAsync() {
        if (pendingGoogleTrafficBefore == null || pendingGoogleTrafficCheckRunning) {
            return
        }
        pendingGoogleTrafficCheckRunning = true
        Thread({
            var resultText: String? = null
            var shouldRetry = false
            try {
                val before = pendingGoogleTrafficBefore
                if (before != null) {
                    val after = currentTrafficCounters()
                    val rxDelta = after.rxBytes - before.rxBytes
                    val txDelta = after.txBytes - before.txBytes
                    val rxPacketDelta = after.rxPackets - before.rxPackets
                    val txPacketDelta = after.txPackets - before.txPackets
                    if (rxDelta > 0L || txDelta > 0L || rxPacketDelta > 0L || txPacketDelta > 0L) {
                        pendingGoogleTrafficBefore = null
                        val tunnelError = currentTunnelError()
                        resultText = if (tunnelError.contains("www.google.com")) {
                            "google: error $tunnelError"
                        } else {
                            "google: browser traffic seen rx=$rxDelta tx=$txDelta packets_rx=$rxPacketDelta packets_tx=$txPacketDelta"
                        }
                    } else if (System.currentTimeMillis() - pendingGoogleTrafficStartedMs >= GOOGLE_TEST_TOTAL_TIMEOUT_MS) {
                        pendingGoogleTrafficBefore = null
                        resultText = "google: error browser traffic timeout"
                    } else {
                        shouldRetry = true
                    }
                }
            } catch (err: Throwable) {
                pendingGoogleTrafficBefore = null
                resultText = "google: error ${safeErrorText(err)}"
            } finally {
                pendingGoogleTrafficCheckRunning = false
            }
            runOnUiThread {
                if (resultText != null) {
                    googleTestText.text = resultText
                }
                if (shouldRetry) {
                    googleTestText.postDelayed({ completePendingGoogleBrowserTrafficTestAsync() }, 1000)
                }
            }
        }, "ChengHy2TunGoogleTrafficCheck").start()
    }

    private fun openBrowserForGoogleTest(url: String) {
        val latch = CountDownLatch(1)
        val error = arrayOf<Throwable?>(null)
        runOnUiThread {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    addCategory(Intent.CATEGORY_BROWSABLE)
                }
                startActivity(intent)
            } catch (err: Throwable) {
                error[0] = err
            } finally {
                latch.countDown()
            }
        }
        if (!latch.await(3, TimeUnit.SECONDS)) {
            throw IOException("browser launch timeout")
        }
        error[0]?.let { throw it }
    }

    private fun currentTrafficCounters(): TrafficCounters {
        val detail = ChengHy2TunVpnService.currentLiveDetail()
        return try {
            val parsed = JSONObject(detail)
            TrafficCounters(
                rxBytes = parsed.optLong("rx_bytes", 0L),
                txBytes = parsed.optLong("tx_bytes", 0L),
                rxPackets = parsed.optLong("rx_packets", 0L),
                txPackets = parsed.optLong("tx_packets", 0L)
            )
        } catch (_: Throwable) {
            TrafficCounters(0L, 0L, 0L, 0L)
        }
    }

    private fun currentTunnelError(): String {
        val detail = ChengHy2TunVpnService.currentLiveDetail()
        return try {
            val parsed = JSONObject(detail)
            safeErrorText(IOException(parsed.optString("error", "")))
        } catch (_: Throwable) {
            ""
        }
    }

    private fun findVpnNetwork(): Network? {
        val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        for (network in manager.allNetworks) {
            val caps = manager.getNetworkCapabilities(network) ?: continue
            if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                continue
            }
            if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                continue
            }
            return network
        }
        return null
    }

    private fun isActiveVpnNetwork(network: Network): Boolean {
        val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val active = manager.activeNetwork ?: return false
        if (active != network) {
            return false
        }
        val caps = manager.getNetworkCapabilities(active) ?: return false
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    @SuppressLint("UnspecifiedRegisterReceiverFlag")
    private fun queryServiceDetailBlocking(timeoutMs: Int): String {
        val latch = CountDownLatch(1)
        val holder = arrayOf("")
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action != ChengHy2TunVpnService.ACTION_STATUS) {
                    return
                }
                holder[0] = intent.getStringExtra(ChengHy2TunVpnService.EXTRA_DETAIL) ?: ""
                latch.countDown()
            }
        }
        val filter = IntentFilter(ChengHy2TunVpnService.ACTION_STATUS)
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                registerReceiver(receiver, filter)
            }
            sendServiceIntent(ChengHy2TunVpnService.queryIntent(this))
            latch.await(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        } finally {
            try {
                unregisterReceiver(receiver)
            } catch (_: Throwable) {
            }
        }
        return holder[0].ifEmpty { ChengHy2TunVpnService.currentLiveDetail() }
    }

    private fun safeErrorText(err: Throwable): String =
        redactSecrets(err.message ?: err.javaClass.name).take(160)

    private fun redactSecrets(text: String): String =
        text.replace(Regex("(?i)((auth|token|secret|key)[A-Za-z0-9_.-]*=)[^\\s,}]+"), "$1<redacted>")
            .replace(Regex("(?i)(\"(auth|token|secret|key_pk8_der|expected_auth_sha256)\"\\s*:\\s*\")[^\"]*"), "$1<redacted>")

    private fun safeFileToken(text: String): String =
        redactSecrets(text).replace(Regex("\\s+"), "_").take(160)

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) {
            return
        }
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return
        }
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_NOTIFICATIONS)
    }

    private fun matchWrap(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            setMargins(0, dp(8), 0, dp(8))
        }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density + 0.5f).toInt()

    private data class ChengGuiComponent(
        val id: String,
        val kind: String,
        val slot: String,
        val text: String,
        val action: String,
        val style: String,
        val enabled: Boolean,
        val minTouchDp: Int,
        val accessibility: String
    )

    private data class ChengGuiTheme(
        val background: Int,
        val text: Int,
        val inverseText: Int,
        val muted: Int,
        val mutedDark: Int,
        val primary: Int,
        val success: Int,
        val warning: Int,
        val danger: Int,
        val dangerSoft: Int,
        val surface: Int,
        val disabled: Int,
        val disabledText: Int,
        val border: Int
    ) {
        companion object {
            fun parse(root: JSONObject): ChengGuiTheme =
                ChengGuiTheme(
                    background = color(root, "background"),
                    text = color(root, "text"),
                    inverseText = color(root, "inverse_text"),
                    muted = color(root, "muted"),
                    mutedDark = color(root, "muted_dark"),
                    primary = color(root, "primary"),
                    success = color(root, "success"),
                    warning = color(root, "warning"),
                    danger = color(root, "danger"),
                    dangerSoft = color(root, "danger_soft"),
                    surface = color(root, "surface"),
                    disabled = color(root, "disabled"),
                    disabledText = color(root, "disabled_text"),
                    border = color(root, "border")
                )

            fun default(): ChengGuiTheme =
                ChengGuiTheme(
                    background = Color.rgb(255, 255, 255),
                    text = Color.rgb(15, 23, 42),
                    inverseText = Color.rgb(255, 255, 255),
                    muted = Color.rgb(71, 85, 105),
                    mutedDark = Color.rgb(51, 65, 85),
                    primary = Color.rgb(21, 94, 239),
                    success = Color.rgb(22, 163, 74),
                    warning = Color.rgb(217, 119, 6),
                    danger = Color.rgb(220, 38, 38),
                    dangerSoft = Color.rgb(254, 242, 242),
                    surface = Color.rgb(248, 250, 252),
                    disabled = Color.rgb(241, 245, 249),
                    disabledText = Color.rgb(148, 163, 184),
                    border = Color.rgb(226, 232, 240)
                )

            private fun color(root: JSONObject, key: String): Int {
                val value = root.optString(key, "")
                require(Regex("^#[0-9A-Fa-f]{6}$").matches(value)) {
                    "invalid Cheng GUI theme color: $key"
                }
                return Color.parseColor(value)
            }
        }
    }

    private data class ChengGuiModel(
        val title: String,
        val minTouchDp: Int,
        val theme: ChengGuiTheme,
        val buttonRows: List<List<String>>,
        val components: Map<String, ChengGuiComponent>
    ) {
        companion object {
            fun parse(snapshot: String): ChengGuiModel {
                val root = JSONObject(snapshot)
                require(root.optString("format") == "cheng_hy2_tun_mobile_gui_v2") {
                    "invalid Cheng GUI format"
                }
                require(root.optString("source") == "pure-cheng") {
                    "invalid Cheng GUI source"
                }
                require(root.optString("host_role") == "render-only") {
                    "invalid Cheng GUI host role"
                }
                require(root.optString("button_layout") == "top-fixed") {
                    "invalid Cheng GUI button layout"
                }
                require(root.optString("status_layout") == "below-buttons") {
                    "invalid Cheng GUI status layout"
                }
                val ux = root.optJSONObject("ux") ?: throw IOException("missing Cheng GUI ux")
                val minTouch = ux.optInt("min_touch_dp", 0)
                require(minTouch >= 48) {
                    "invalid Cheng GUI touch target"
                }
                require(ux.optBoolean("stable_button_geometry", false)) {
                    "invalid Cheng GUI button geometry"
                }
                require(ux.optBoolean("no_screenshot_positioning", false)) {
                    "invalid Cheng GUI positioning contract"
                }
                val theme = ChengGuiTheme.parse(
                    root.optJSONObject("theme") ?: throw IOException("missing Cheng GUI theme")
                )
                val componentsArray: JSONArray = root.optJSONArray("components")
                    ?: throw IOException("missing Cheng GUI components")
                val components = LinkedHashMap<String, ChengGuiComponent>()
                for (i in 0 until componentsArray.length()) {
                    val item = componentsArray.getJSONObject(i)
                    val component = ChengGuiComponent(
                        id = item.optString("id"),
                        kind = item.optString("kind"),
                        slot = item.optString("slot"),
                        text = item.optString("text"),
                        action = item.optString("action"),
                        style = item.optString("style"),
                        enabled = item.optBoolean("enabled", true),
                        minTouchDp = item.optInt("min_touch_dp", 0),
                        accessibility = item.optString("accessibility")
                    )
                    require(component.id.isNotEmpty()) {
                        "empty Cheng GUI component id"
                    }
                    components[component.id] = component
                }
                val buttonRows = parseButtonRows(root, components)
                val required = arrayOf(
                    "title",
                    "proxy_toggle",
                    "test_google",
                    "google_status",
                    "status_badge",
                    "core_text",
                    "detail_text",
                    "traffic_text",
                    "error_text"
                )
                for (id in required) {
                    require(components.containsKey(id)) {
                        "missing Cheng GUI component: $id"
                    }
                }
                return ChengGuiModel(
                    title = components["title"]?.text ?: "代理",
                    minTouchDp = minTouch,
                    theme = theme,
                    buttonRows = buttonRows,
                    components = components
                )
            }

            fun empty(): ChengGuiModel {
                val components = linkedMapOf(
                    "title" to component("title", "text", "header", "代理", "", "title", true),
                    "mode_fast" to component("mode_fast", "button", "actions", "极速", "set_mode_fast", "secondary", true),
                    "mode_global" to component("mode_global", "button", "actions", "全局", "set_mode_global", "secondary", true),
                    "proxy_toggle" to component("proxy_toggle", "button", "actions", "开启代理", "toggle_proxy", "primary", true),
                    "test_google" to component("test_google", "button", "actions", "TEST GOOGLE", "test_google", "primary-wide", false),
                    "google_status" to component("google_status", "text", "status", "google: not tested", "", "muted", true),
                    "status_badge" to component("status_badge", "badge", "status", "disconnected", "", "neutral", true),
                    "core_text" to component("core_text", "text", "status", "core: unchecked", "", "body", true),
                    "detail_text" to component("detail_text", "text", "status", "", "", "muted", false),
                    "traffic_text" to component("traffic_text", "text", "status", "rx: 0 / tx: 0", "", "muted", true),
                    "error_text" to component("error_text", "text", "status", "", "", "danger", false)
                )
                return ChengGuiModel(
                    "代理",
                    52,
                    ChengGuiTheme.default(),
                    defaultButtonRows(),
                    components
                )
            }

            fun error(message: String): ChengGuiModel {
                val model = empty()
                val components = LinkedHashMap(model.components)
                components["status_badge"] = component("status_badge", "badge", "status", "error", "", "danger", true)
                components["error_text"] = component("error_text", "text", "config", message, "", "danger", true)
                return model.copy(components = components)
            }

            private fun component(
                id: String,
                kind: String,
                slot: String,
                text: String,
                action: String,
                style: String,
                enabled: Boolean
            ): ChengGuiComponent =
                ChengGuiComponent(id, kind, slot, text, action, style, enabled, if (kind == "button") 52 else 0, "$id $kind")

            private fun parseButtonRows(
                root: JSONObject,
                components: Map<String, ChengGuiComponent>
            ): List<List<String>> {
                val rawRows = root.optJSONArray("button_rows")
                    ?: throw IOException("missing Cheng GUI button rows")
                val rows = ArrayList<List<String>>()
                for (rowIndex in 0 until rawRows.length()) {
                    val rawRow = rawRows.optJSONArray(rowIndex)
                        ?: throw IOException("invalid Cheng GUI button row")
                    val row = ArrayList<String>()
                    for (columnIndex in 0 until rawRow.length()) {
                        val id = rawRow.optString(columnIndex)
                        require(id.isNotEmpty()) {
                            "empty Cheng GUI button id"
                        }
                        val component = components[id]
                            ?: throw IOException("missing Cheng GUI button component: $id")
                        require(component.kind == "button") {
                            "non-button in Cheng GUI button row: $id"
                        }
                        row.add(id)
                    }
                    require(row.isNotEmpty()) {
                        "empty Cheng GUI button row"
                    }
                    rows.add(row)
                }
                require(rows.isNotEmpty()) {
                    "empty Cheng GUI button rows"
                }
                return rows
            }

            private fun defaultButtonRows(): List<List<String>> =
                listOf(
                    listOf("mode_fast", "mode_global"),
                    listOf("proxy_toggle"),
                    listOf("test_google")
                )
        }
    }

    companion object {
        private const val REQUEST_VPN = 4101
        private const val REQUEST_NOTIFICATIONS = 4102
        private const val REQUEST_CONFIG = 4103
        private const val GOOGLE_TEST_STATUS_TIMEOUT_MS = 1200
        private const val GOOGLE_TEST_TOTAL_TIMEOUT_MS = 16000
        private const val ROUTE_MODE_FAST = "fast"
        private const val ROUTE_MODE_GLOBAL = "global"
        private const val TRANSPORT_UDP_QUIC = "udp-quic"
        private const val TRANSPORT_TCP_FORWARD = "tcp-tls-forward"
        private const val ACTION_TRACE_TCP = "org.cheng.hy2tunvpn.TRACE_TCP"
        private const val EXTRA_TRACE_LOCAL_PORT = "local_port"
        private const val EXTRA_TRACE_DNS_QUERY_ID = "dns_query_id"
        private const val EXTRA_TRACE_DNS_HOST = "dns_host"
        private const val EXTRA_TRACE_CLEAR = "clear"
        private const val TRACE_RESULT_FILE = "tcp-trace-result.txt"
        private const val PREF_LAST_ORC_LINE = "last_orc_live_line"
    }

    private data class TrafficCounters(
        val rxBytes: Long,
        val txBytes: Long,
        val rxPackets: Long,
        val txPackets: Long
    )
}
