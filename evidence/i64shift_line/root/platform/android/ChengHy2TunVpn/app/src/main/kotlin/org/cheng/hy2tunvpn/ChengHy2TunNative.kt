package org.cheng.hy2tunvpn

internal object ChengHy2TunNative {
    interface ProtectCallback {
        fun protect(fd: Int): Boolean
    }

    private val loadErrorText: String
    private val adapterLoaded: Boolean

    init {
        var loaded = false
        var error = ""
        try {
            System.loadLibrary("cheng_hy2_tun_android")
            loaded = true
        } catch (err: UnsatisfiedLinkError) {
            error = err.message ?: "unknown native load error"
        } catch (err: SecurityException) {
            error = err.message ?: "native load blocked"
        }
        adapterLoaded = loaded
        loadErrorText = error
    }

    fun requireCore() {
        if (!adapterLoaded) {
            throw IllegalStateException("missing libcheng_hy2_tun_android.so: $loadErrorText")
        }
        if (!nativeCoreAvailable()) {
            throw IllegalStateException("missing Cheng hy2-tun core: ${nativeLoadError()}")
        }
    }

    @JvmStatic
    external fun nativeCoreAvailable(): Boolean

    @JvmStatic
    external fun nativeLoadError(): String

    @JvmStatic
    external fun nativeGuiSnapshot(platform: String, configPath: String): String

    @JvmStatic
    external fun nativeStart(
        configJson: String,
        configPath: String,
        certDer: ByteArray,
        keyPk8Der: ByteArray,
        trustRootDer: ByteArray,
        tunFd: Int,
        underlyingNetworkHandle: Long,
        protectCallback: ProtectCallback
    ): Long

    @JvmStatic
    external fun nativeStartProxy(
        configJson: String,
        configPath: String,
        certDer: ByteArray,
        keyPk8Der: ByteArray,
        trustRootDer: ByteArray,
        underlyingNetworkHandle: Long,
        protectCallback: ProtectCallback
    ): LongArray

    @JvmStatic
    external fun nativeOwnerTcpProbe(
        host: String,
        port: Int,
        timeoutMs: Int,
        underlyingNetworkHandle: Long,
        protectCallback: ProtectCallback
    ): String

    @JvmStatic
    external fun nativeStop(sessionId: Long)

    @JvmStatic
    external fun nativeStopProxy(sessionId: Long)

    @JvmStatic
    external fun nativeStatusJson(sessionId: Long): String

    @JvmStatic
    external fun nativeDnsAnswerIpForId(queryId: Int): String

    @JvmStatic
    external fun nativeDnsAnswerIpForHost(host: String): String

    @JvmStatic
    external fun nativeClearTcpTraceForLocalPort(localPort: Int)

    @JvmStatic
    external fun nativeClearTcpTrace()

    @JvmStatic
    external fun nativeTcpTraceForLocalPort(localPort: Int): String

    @JvmStatic
    external fun nativeTcpTraceSummary(): String

    @JvmStatic
    external fun nativeProxyStatusJson(sessionId: Long): String

    @JvmStatic
    external fun nativeProxyProbeJson(timeoutMs: Int): String
}
