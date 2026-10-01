package org.cheng.hy2tunprobe

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.widget.TextView
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import javax.net.ssl.SNIHostName
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory

class ProbeActivity : Activity() {
    private lateinit var statusText: TextView
    @Volatile private var probeGeneration = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        statusText = TextView(this).apply {
            gravity = Gravity.CENTER
            textSize = 18f
            text = "probe: running"
        }
        setContentView(statusText)
        startProbe(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        Log.i(TAG, "cheng_vpn_probe_new_intent")
        startProbe(intent)
    }

    private fun startProbe(runIntent: Intent) {
        val generation = probeGeneration + 1
        probeGeneration = generation
        statusText.text = "probe: running"
        writeResultFile("probe: started")
        Log.i(TAG, "cheng_vpn_probe_start")
        Thread({ runProbe(runIntent, generation) }, "ChengVpnProbe").start()
    }

    private fun runProbe(runIntent: Intent, generation: Int) {
        val url = runIntent.getStringExtra(EXTRA_URL)
            ?: "https://www.google.com/generate_204?cheng_hy2_tun_probe=${System.currentTimeMillis()}"
        val started = System.currentTimeMillis()
        var phase = "init"
        val httpsDetails = ProbeHttpsDetails("", 0, "init")
        var result = ""
        var attempt = 0
        while (attempt < PROBE_ATTEMPTS) {
            attempt += 1
            phase = "init"
            httpsDetails.fakeIp = ""
            httpsDetails.localPort = 0
            httpsDetails.subphase = "init"
            httpsDetails.dnsServer = ""
            httpsDetails.dnsQueryId = -1
            httpsDetails.dnsLocalPort = 0
            try {
                val target = URL(url)
                phase = "vpn"
                requireActiveVpn()
                phase = "dns"
                val dnsStarted = System.currentTimeMillis()
                val injectedFakeIp = runIntent.getStringExtra(EXTRA_FAKE_IP)?.trim().orEmpty()
                val fakeIp = if (injectedFakeIp.isNotEmpty()) {
                    httpsDetails.dnsServer = "injected"
                    parseInjectedFakeIp(injectedFakeIp)
                } else {
                    queryFakeDnsA(target.host, httpsDetails)
                }
                httpsDetails.fakeIp = fakeIp.text
                val dnsElapsed = System.currentTimeMillis() - dnsStarted
                phase = "https"
                val httpsStarted = System.currentTimeMillis()
                val code = httpsGetViaFakeIp(target, fakeIp.address, httpsDetails)
                val httpsElapsed = System.currentTimeMillis() - httpsStarted
                val elapsed = System.currentTimeMillis() - started
                val ok = code == 204 || code in 200..399
                result = "ok=${if (ok) 1 else 0} code=$code elapsed_ms=$elapsed active=${networkSummary()} vpn=${vpnNetworkSummary()} dns=${dnsSummary()} phase=done url_host=${target.host} fake_ip=${httpsDetails.fakeIp} local_port=${httpsDetails.localPort} dns_server=${httpsDetails.dnsServer} dns_query_id=${httpsDetails.dnsQueryId} dns_local_port=${httpsDetails.dnsLocalPort} subphase=${httpsDetails.subphase} dns_ms=$dnsElapsed https_ms=$httpsElapsed attempt=$attempt"
                break
            } catch (err: Throwable) {
                val elapsed = System.currentTimeMillis() - started
                result = "ok=0 code=${err.javaClass.simpleName} elapsed_ms=$elapsed active=${networkSummary()} vpn=${vpnNetworkSummary()} dns=${dnsSummary()} phase=$phase fake_ip=${httpsDetails.fakeIp} local_port=${httpsDetails.localPort} dns_server=${httpsDetails.dnsServer} dns_query_id=${httpsDetails.dnsQueryId} dns_local_port=${httpsDetails.dnsLocalPort} subphase=${httpsDetails.subphase} detail=${safeDetail(err)} attempt=$attempt"
                Log.w(TAG, "cheng_vpn_probe_attempt_failed $result")
                if (generation != probeGeneration) {
                    return
                }
                if (attempt >= PROBE_ATTEMPTS || !isTransientProbeFailure(err, httpsDetails.subphase)) {
                    break
                }
                try {
                    Thread.sleep(PROBE_RETRY_DELAY_MS)
                } catch (_: InterruptedException) {
                    break
                }
            }
        }
        if (generation != probeGeneration) {
            return
        }
        writeResultFile(result)
        Log.i(TAG, "cheng_vpn_probe_result $result")
        runOnUiThread {
            if (generation == probeGeneration) {
                statusText.text = "probe: $result"
            }
        }
    }

    private fun isTransientProbeFailure(err: Throwable, subphase: String): Boolean {
        val name = err.javaClass.simpleName
        if (name == "SocketTimeoutException") {
            return true
        }
        val detail = (err.message ?: "").lowercase()
        if (detail.contains("empty http response")) {
            return true
        }
        if (detail.contains("read timed out") || detail.contains("timeout")) {
            return true
        }
        // Handshake/connect races right after browser traffic are common on LTE.
        return subphase == "handshake" || subphase == "connect" || subphase == "tls" ||
            subphase == "read_status"
    }

    private fun writeResultFile(result: String) {
        try {
            openFileOutput(PROBE_RESULT_FILE, MODE_PRIVATE).use { stream ->
                stream.write(result.toByteArray(Charsets.UTF_8))
                stream.write('\n'.code)
            }
        } catch (ignored: Throwable) {
            Log.w(TAG, "cheng_vpn_probe_result_file_failed ${ignored.javaClass.simpleName}")
        }
    }

    private fun requireActiveVpn() {
        val manager = getSystemService(ConnectivityManager::class.java)
            ?: throw IOException("connectivity manager missing")
        val active = manager.activeNetwork ?: throw IOException("active network missing")
        val caps = manager.getNetworkCapabilities(active)
            ?: throw IOException("active network capabilities missing")
        if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
            throw IOException("active network is not VPN: ${networkSummary()}")
        }
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
            throw IOException("active VPN has no internet capability")
        }
    }

    private fun queryFakeDnsA(host: String, details: ProbeHttpsDetails): FakeDnsAnswer {
        val queryId = ((System.nanoTime() xor System.currentTimeMillis()) and 0xffffL).toInt()
        details.dnsQueryId = queryId
        val query = buildDnsAQuery(queryId, host)
        val vpnNetwork = activeVpnNetwork()
            ?: throw IOException("active VPN network missing")
        DatagramSocket().use { socket ->
            socket.soTimeout = PROBE_STAGE_TIMEOUT_MS
            // Fake-IP DNS (198.18.0.1) is only reachable on the VPN Network.
            vpnNetwork.bindSocket(socket)
            val dnsServer = activeVpnDnsServer()
                ?: throw IOException("active VPN DNS server missing")
            details.dnsServer = dnsServer.hostAddress ?: ""
            socket.send(DatagramPacket(query, query.size, dnsServer, 53))
            details.dnsLocalPort = socket.localPort
            val response = ByteArray(1500)
            val packet = DatagramPacket(response, response.size)
            socket.receive(packet)
            return parseDnsAResponse(queryId, response, packet.length)
        }
    }

    private fun buildDnsAQuery(queryId: Int, host: String): ByteArray {
        val labels = host.trim('.').split('.').filter { it.isNotEmpty() }
        require(labels.isNotEmpty()) { "host is empty" }
        val out = ByteArrayOutputStream()
        writeU16(out, queryId)
        writeU16(out, 0x0100)
        writeU16(out, 1)
        writeU16(out, 0)
        writeU16(out, 0)
        writeU16(out, 0)
        for (label in labels) {
            val bytes = label.toByteArray(Charsets.US_ASCII)
            require(bytes.size in 1..63) { "invalid dns label: $label" }
            out.write(bytes.size)
            out.write(bytes)
        }
        out.write(0)
        writeU16(out, 1)
        writeU16(out, 1)
        return out.toByteArray()
    }

    private fun parseDnsAResponse(queryId: Int, packet: ByteArray, length: Int): FakeDnsAnswer {
        if (length < 12) {
            throw IOException("dns response too short")
        }
        if (readU16(packet, 0) != queryId) {
            throw IOException("dns response id mismatch")
        }
        val flags = readU16(packet, 2)
        if ((flags and 0x8000) == 0) {
            throw IOException("dns response missing qr bit")
        }
        val rcode = flags and 0x000f
        if (rcode != 0) {
            throw IOException("dns rcode=$rcode")
        }
        val questionCount = readU16(packet, 4)
        val answerCount = readU16(packet, 6)
        var pos = 12
        repeat(questionCount) {
            pos = skipDnsName(packet, length, pos)
            if (pos + 4 > length) {
                throw IOException("dns question truncated")
            }
            pos += 4
        }
        repeat(answerCount) {
            pos = skipDnsName(packet, length, pos)
            if (pos + 10 > length) {
                throw IOException("dns answer truncated")
            }
            val type = readU16(packet, pos)
            val klass = readU16(packet, pos + 2)
            val rdLen = readU16(packet, pos + 8)
            val dataPos = pos + 10
            if (dataPos + rdLen > length) {
                throw IOException("dns rdata truncated")
            }
            if (type == 1 && klass == 1 && rdLen == 4) {
                val address = byteArrayOf(
                    packet[dataPos],
                    packet[dataPos + 1],
                    packet[dataPos + 2],
                    packet[dataPos + 3]
                )
                return FakeDnsAnswer(address, ipv4Text(address))
            }
            pos = dataPos + rdLen
        }
        throw IOException("dns A answer missing")
    }

    private fun skipDnsName(packet: ByteArray, length: Int, start: Int): Int {
        var pos = start
        var jumps = 0
        while (true) {
            if (pos >= length) {
                throw IOException("dns name truncated")
            }
            val len = u8(packet[pos])
            if ((len and 0xc0) == 0xc0) {
                if (pos + 1 >= length) {
                    throw IOException("dns compression pointer truncated")
                }
                jumps += 1
                if (jumps > 8) {
                    throw IOException("dns compression pointer loop")
                }
                return pos + 2
            }
            if ((len and 0xc0) != 0) {
                throw IOException("unsupported dns label")
            }
            pos += 1
            if (len == 0) {
                return pos
            }
            pos += len
        }
    }

    private fun httpsGetViaFakeIp(url: URL, fakeIp: ByteArray, details: ProbeHttpsDetails): Int {
        val host = url.host
        val path = if (url.file.isNullOrEmpty()) "/" else url.file
        val fakeAddress = InetAddress.getByAddress(fakeIp)
        val vpnNetwork = activeVpnNetwork()
            ?: throw IOException("active VPN network missing")
        val raw = Socket()
        raw.tcpNoDelay = true
        raw.soTimeout = PROBE_STAGE_TIMEOUT_MS
        raw.bind(InetSocketAddress(0))
        details.localPort = raw.localPort
        // Keep the socket on the VPN Network (fake-IP 198.18/16 is only routed
        // there). Must be unbound-from-remote; local bind above is fine.
        vpnNetwork.bindSocket(raw)
        details.subphase = "connect"
        raw.connect(InetSocketAddress(fakeAddress, 443), PROBE_STAGE_TIMEOUT_MS)
        details.subphase = "tls"
        val ssl = (SSLSocketFactory.getDefault() as SSLSocketFactory)
            .createSocket(raw, host, 443, true) as SSLSocket
        ssl.use { socket ->
            socket.soTimeout = PROBE_STAGE_TIMEOUT_MS
            val params = socket.sslParameters
            params.endpointIdentificationAlgorithm = "HTTPS"
            params.serverNames = listOf(SNIHostName(host))
            if (Build.VERSION.SDK_INT >= 29) {
                params.applicationProtocols = arrayOf("http/1.1")
            }
            socket.sslParameters = params
            details.subphase = "handshake"
            socket.startHandshake()
            details.subphase = "write"
            // Align with Harmony production probe: generate_204 + browser-like
            // headers. Full google.com HTML often stalls after TLS for non-browser
            // clients (handshake bytes arrive; HTTP status never does).
            val request = "GET $path HTTP/1.1\r\n" +
                "Host: $host\r\n" +
                "User-Agent: Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36\r\n" +
                "Accept: */*\r\n" +
                "Connection: close\r\n\r\n"
            socket.outputStream.write(request.toByteArray(Charsets.US_ASCII))
            socket.outputStream.flush()
            details.subphase = "read_status"
            val statusLine = readHttpStatusLine(socket)
            details.subphase = "done"
            val parts = statusLine.split(' ')
            if (parts.size < 2 || !parts[0].startsWith("HTTP/")) {
                throw IOException("invalid http status: $statusLine")
            }
            return parts[1].toIntOrNull()
                ?: throw IOException("invalid http code: $statusLine")
        }
    }

    private fun activeVpnNetwork(): Network? {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return null
        val active = manager.activeNetwork ?: return null
        val caps = manager.getNetworkCapabilities(active) ?: return null
        if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
            return null
        }
        return active
    }

    private fun readHttpStatusLine(socket: SSLSocket): String {
        val out = ByteArrayOutputStream()
        while (out.size() < 256) {
            val value = socket.inputStream.read()
            if (value < 0) {
                break
            }
            if (value == 10) {
                break
            }
            if (value != 13) {
                out.write(value)
            }
        }
        if (out.size() == 0) {
            throw IOException("empty http response")
        }
        return out.toString("US-ASCII")
    }

    private fun ipv4Text(address: ByteArray): String =
        "${u8(address[0])}.${u8(address[1])}.${u8(address[2])}.${u8(address[3])}"

    private fun parseInjectedFakeIp(value: String): FakeDnsAnswer {
        val parts = value.split('.')
        if (parts.size != 4) {
            throw IOException("invalid fake ip")
        }
        val bytes = ByteArray(4)
        for (i in 0..3) {
            val part = parts[i].toIntOrNull() ?: throw IOException("invalid fake ip")
            if (part !in 0..255) {
                throw IOException("invalid fake ip")
            }
            bytes[i] = byte(part)
        }
        if (u8(bytes[0]) != 198 || u8(bytes[1]) != 18) {
            throw IOException("fake ip outside 198.18.0.0/16")
        }
        return FakeDnsAnswer(bytes, ipv4Text(bytes))
    }

    private fun u8(value: Byte): Int = value.toInt() and 0xff

    private fun byte(value: Int): Byte = (value and 0xff).toByte()

    private fun readU16(packet: ByteArray, offset: Int): Int =
        (u8(packet[offset]) shl 8) or u8(packet[offset + 1])

    private fun writeU16(out: ByteArrayOutputStream, value: Int) {
        out.write((value ushr 8) and 0xff)
        out.write(value and 0xff)
    }

    private fun networkSummary(): String {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return "missing"
        val active = manager.activeNetwork ?: return "none"
        val caps = manager.getNetworkCapabilities(active) ?: return "caps-missing"
        val parts = mutableListOf<String>()
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
            parts.add("vpn")
        }
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
            parts.add("wifi")
        }
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
            parts.add("cell")
        }
        if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
            parts.add("internet")
        }
        if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
            parts.add("validated")
        }
        if (parts.isEmpty()) {
            return "unknown"
        }
        return parts.joinToString("+")
    }

    private fun vpnNetworkSummary(): String {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return "missing"
        val matches = manager.allNetworks.mapNotNull { network ->
            val caps = manager.getNetworkCapabilities(network) ?: return@mapNotNull null
            if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                return@mapNotNull null
            }
            val props = manager.getLinkProperties(network)
            val dns = props?.dnsServers?.joinToString("|") { it.hostAddress ?: "unknown" } ?: "dns-missing"
            val parts = mutableListOf<String>()
            parts.add("vpn")
            if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                parts.add("internet")
            }
            if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                parts.add("validated")
            }
            "${parts.joinToString("+")}@dns=$dns"
        }
        if (matches.isEmpty()) {
            return "none"
        }
        return matches.joinToString(",")
    }

    private fun dnsSummary(): String {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return "missing"
        val active = manager.activeNetwork ?: return "none"
        val props = manager.getLinkProperties(active) ?: return "props-missing"
        val servers = props.dnsServers
        if (servers.isEmpty()) {
            return "empty"
        }
        return servers.joinToString("|") { it.hostAddress ?: "unknown" }
    }

    private fun activeVpnDnsServer(): InetAddress? {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return null
        val active = manager.activeNetwork ?: return null
        val caps = manager.getNetworkCapabilities(active) ?: return null
        if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
            return null
        }
        val props = manager.getLinkProperties(active) ?: return null
        for (server in props.dnsServers) {
            val raw = server.address
            if (raw.size == 4) {
                return server
            }
        }
        return null
    }

    private fun safeDetail(err: Throwable): String {
        return (err.message ?: err.javaClass.name)
            .replace(Regex("\\s+"), "_")
            .take(160)
    }

    companion object {
        private const val TAG = "ChengHy2TunProbe"
        private const val EXTRA_URL = "org.cheng.hy2tunprobe.URL"
        private const val EXTRA_FAKE_IP = "org.cheng.hy2tunprobe.FAKE_IP"
        private const val PROBE_RESULT_FILE = "probe-result.txt"
        private const val PROBE_STAGE_TIMEOUT_MS = 30000
        private const val PROBE_ATTEMPTS = 3
        private const val PROBE_RETRY_DELAY_MS = 750L
    }

    private data class FakeDnsAnswer(val address: ByteArray, val text: String)

    private data class ProbeHttpsDetails(
        var fakeIp: String,
        var localPort: Int,
        var subphase: String,
        var dnsServer: String = "",
        var dnsQueryId: Int = -1,
        var dnsLocalPort: Int = 0
    )
}
