package org.cheng.hy2tunvpn

import android.content.Context
import org.json.JSONException
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.Inet4Address
import java.net.InetAddress
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

internal data class Hy2TunConfigPreview(
    val file: File,
    val address: String,
    val prefixLength: Int,
    val addressCidr: String,
    val dnsServer: String,
    val mtu: Int,
    val routeMode: String,
    val transport: String,
    val productMode: String,
    val authStatus: String,
    val ownerProbeHost: String,
    val ownerProbePort: Int,
    val ownerProbeTimeoutMs: Int
)

internal data class Hy2TunConfig(
    val file: File,
    val json: String,
    val certDer: ByteArray,
    val keyPk8Der: ByteArray,
    val trustRootDer: ByteArray,
    val address: String,
    val prefixLength: Int,
    val addressCidr: String,
    val dnsServer: String,
    val mtu: Int,
    val routeMode: String,
    val transport: String,
    val exitHost: String,
    val exitPort: Int,
    val productMode: String,
    val ownerProbeHost: String,
    val ownerProbePort: Int,
    val ownerProbeTimeoutMs: Int
) {
    companion object {
        private const val defaultAsset = "hy2-tun-client.example.json"
        private const val defaultFile = "hy2-tun-client.json"
        private const val defaultFakeDnsServer = "198.18.0.1"
        private const val defaultOwnerProbeHost = "223.5.5.5"
        private const val defaultOwnerProbePort = 443
        private const val defaultOwnerProbeTimeoutMs = 5000
        private const val defaultUdpQuicPort = 443
        private const val defaultTcpTlsForwardPort = 8443
        private const val productModeTun = "tun"
        private const val productModePac = "pac"
        private const val routeModeFast = "fast"
        private const val routeModeGlobal = "global"
        private val bundledFiles = arrayOf(
            "auth.token" to "auth.token",
            "hy2-tun-client.auth" to "hy2-tun-client.auth",
            "transport.cert.der" to "transport.cert.der",
            "transport.key.pk8" to "transport.key.pk8",
            "transport.root.der" to "transport.root.der"
        )

        fun ensureDefaultFile(context: Context): File {
            val configFile = File(context.filesDir, defaultFile)
            copyEditableBundledAsset(context, defaultAsset, configFile)
            canonicalizeLegacyConfig(configFile)
            for ((assetName, fileName) in bundledFiles) {
                copyBundledAssetIfChanged(context, assetName, File(context.filesDir, fileName))
            }
            return configFile
        }

        private fun copyEditableBundledAsset(context: Context, assetName: String, out: File) {
            val data = context.assets.open(assetName).use { input -> input.readAllStrict() }
            val bundledHash = sha256Hex(data)
            val marker = File(context.filesDir, "${out.name}.sha256")
            android.util.Log.i("Hy2TunConfig", "copyEditable asset=$assetName bundled=${bundledHash.take(8)}")
            if (out.isFile) {
                if (!marker.isFile) {
                    android.util.Log.i("Hy2TunConfig", "copyEditable keep: no marker (user file)")
                    return
                }
                val copiedHash = marker.readText(StandardCharsets.UTF_8).trim()
                val currentHash = sha256Hex(out.readBytes())
                if (currentHash != copiedHash) {
                    android.util.Log.i("Hy2TunConfig", "copyEditable keep: user modified cur=${currentHash.take(8)} marker=${copiedHash.take(8)} route=" + runCatching { JSONObject(out.readBytes().decodeToString()).optJSONObject("client")?.optJSONObject("tun")?.optString("route_mode") }.getOrDefault("?"))
                    return
                }
                if (copiedHash == bundledHash) {
                    return
                }
            }
            android.util.Log.w("Hy2TunConfig", "copyEditable OVERWRITE out=${out.name} bundled=${bundledHash.take(8)}")
            writeAtomic(out, data)
            writeAtomic(marker, bundledHash.toByteArray(StandardCharsets.UTF_8))
        }

        private fun copyBundledAssetIfChanged(context: Context, assetName: String, out: File) {
            val data = context.assets.open(assetName).use { input -> input.readAllStrict() }
            val hash = sha256Hex(data)
            val marker = File(context.filesDir, "${out.name}.sha256")
            if (out.isFile && out.length() == data.size.toLong() && marker.isFile) {
                val currentHash = marker.readText(StandardCharsets.UTF_8).trim()
                if (currentHash == hash) {
                    return
                }
            }
            writeAtomic(out, data)
            writeAtomic(marker, hash.toByteArray(StandardCharsets.UTF_8))
        }

        private fun writeAtomic(out: File, data: ByteArray) {
            val tmp = File(out.parentFile, "${out.name}.tmp")
            FileOutputStream(tmp).use { output ->
                output.write(data)
                output.fd.sync()
            }
            if (!tmp.renameTo(out)) {
                throw java.io.IOException("rename asset into place failed: ${out.absolutePath}")
            }
        }

        private fun sha256Hex(data: ByteArray): String {
            val digest = MessageDigest.getInstance("SHA-256").digest(data)
            val hex = "0123456789abcdef"
            val out = CharArray(digest.size * 2)
            for (i in digest.indices) {
                val value = digest[i].toInt() and 0xff
                out[i * 2] = hex[value ushr 4]
                out[i * 2 + 1] = hex[value and 0x0f]
            }
            return String(out)
        }

        fun preview(file: File): Hy2TunConfigPreview {
            val configFile = requireConfigFile(file)
            canonicalizeLegacyConfig(configFile)
            val root = JSONObject(configFile.readText(StandardCharsets.UTF_8))
            val parsed = parseClientConfigShape(configFile, root)
            return Hy2TunConfigPreview(
                configFile,
                parsed.address.address,
                parsed.address.prefixLength,
                parsed.address.cidr,
                parsed.dnsServer,
                parsed.mtu,
                parsed.routeMode,
                parsed.transport,
                parsed.productMode,
                inspectExitAuth(root, parsed.baseDir),
                parsed.ownerProbeHost,
                parsed.ownerProbePort,
                parsed.ownerProbeTimeoutMs
            )
        }

        fun load(file: File): Hy2TunConfig {
            val configFile = requireConfigFile(file)
            canonicalizeLegacyConfig(configFile)
            val root = JSONObject(configFile.readText(StandardCharsets.UTF_8))
            val parsed = parseClientConfigShape(configFile, root)
            materializeExitAuth(root, parsed.baseDir)
            val json = root.toString()
            val certDer = readRequiredBinary(parsed.baseDir, parsed.client.optString("cert_der", ""), "client.cert_der")
            val keyPk8Der = readRequiredBinary(parsed.baseDir, parsed.client.optString("key_pk8_der", ""), "client.key_pk8_der")
            val trustRootDer = readRequiredBinary(parsed.baseDir, parsed.client.optString("trust_root_der", ""), "client.trust_root_der")
            return Hy2TunConfig(
                configFile,
                json,
                certDer,
                keyPk8Der,
                trustRootDer,
                parsed.address.address,
                parsed.address.prefixLength,
                parsed.address.cidr,
                parsed.dnsServer,
                parsed.mtu,
                parsed.routeMode,
                parsed.transport,
                parsed.exitHost,
                parsed.exitPort,
                parsed.productMode,
                parsed.ownerProbeHost,
                parsed.ownerProbePort,
                parsed.ownerProbeTimeoutMs
            )
        }

        private fun requireConfigFile(file: File): File {
            val absolute = file.absoluteFile
            if (!absolute.isFile) {
                throw java.io.IOException("config file not found: ${absolute.absolutePath}")
            }
            return absolute.canonicalFile
        }

        private fun parseClientConfigShape(file: File, root: JSONObject): ParsedClientConfig {
            if (root.optString("protocol", "") != "hy2-tun-v1") {
                throw JSONException("protocol must be hy2-tun-v1")
            }
            val client = root.optJSONObject("client") ?: throw JSONException("client object missing")
            val baseDir = file.parentFile ?: throw java.io.IOException("config parent missing: ${file.absolutePath}")
            val tun = client.optJSONObject("tun") ?: throw JSONException("client.tun object missing")
            if (!tun.optBoolean("enabled", false)) {
                throw JSONException("client.tun.enabled required")
            }
            val address = parseAddress(tun.optString("address", "").trim())
            val mtu = tun.optInt("mtu", 1500)
            if (mtu < 576 || mtu > 9000) {
                throw JSONException("client.tun.mtu out of range")
            }
            val routeMode = parseRouteMode(tun.optString("route_mode", routeModeFast))
            if (tun.optString("dns_mode", "fake-ip") != "fake-ip") {
                throw JSONException("only fake-ip dns_mode is supported")
            }
            val dnsServer = parseDnsServer(tun.optString("dns_server", defaultFakeDnsServer).trim())
            val exits = root.optJSONArray("exits")
            if (exits == null || exits.length() == 0) {
                throw JSONException("exits[] missing")
            }
            val productMode = parseProductMode(client.optString("mode", productModeTun))
            val firstExit = exits.optJSONObject(0) ?: throw JSONException("invalid exits[] entry")
            val transport = parseExitTransport(firstExit.optString("transport", "udp-quic"))
            val exitHost = firstExit.optString("host", "").trim()
            if (exitHost.isEmpty()) {
                throw JSONException("exits[0].host missing")
            }
            val exitPort = firstExit.optInt("port", -1)
            if (exitPort !in 1..65535) {
                throw JSONException("exits[0].port out of range")
            }
            val ownerProbe = client.optJSONObject("owner_probe")
            val ownerProbeHost = ownerProbe?.optString("host", defaultOwnerProbeHost)?.trim()
                ?: defaultOwnerProbeHost
            if (ownerProbeHost.isEmpty()) {
                throw JSONException("client.owner_probe.host missing")
            }
            val ownerProbeHostLiteral = parseIpv4Literal(ownerProbeHost, "client.owner_probe.host")
            val ownerProbePort = ownerProbe?.optInt("port", defaultOwnerProbePort)
                ?: defaultOwnerProbePort
            if (ownerProbePort !in 1..65535) {
                throw JSONException("client.owner_probe.port out of range")
            }
            val ownerProbeTimeoutMs = ownerProbe?.optInt("timeout_ms", defaultOwnerProbeTimeoutMs)
                ?: defaultOwnerProbeTimeoutMs
            if (ownerProbeTimeoutMs !in 1000..30000) {
                throw JSONException("client.owner_probe.timeout_ms out of range")
            }
            return ParsedClientConfig(
                client,
                tun,
                baseDir,
                address,
                dnsServer,
                mtu,
                routeMode,
                transport,
                exitHost,
                exitPort,
                productMode,
                ownerProbeHostLiteral,
                ownerProbePort,
                ownerProbeTimeoutMs
            )
        }

        fun updateExitTransport(file: File, transport: String): Hy2TunConfigPreview {
            val normalized = parseExitTransport(transport)
            val configFile = requireConfigFile(file)
            canonicalizeLegacyConfig(configFile)
            val root = JSONObject(configFile.readText(StandardCharsets.UTF_8))
            parseClientConfigShape(configFile, root)
            val exits = root.optJSONArray("exits") ?: throw JSONException("exits[] missing")
            if (exits.length() == 0) {
                throw JSONException("exits[] missing")
            }
            for (i in 0 until exits.length()) {
                val entry = exits.optJSONObject(i) ?: throw JSONException("invalid exits[] entry")
                entry.put("transport", normalized)
                entry.put(
                    "port",
                    if (normalized == "tcp-tls-forward") defaultTcpTlsForwardPort else defaultUdpQuicPort
                )
            }
            writeAtomic(configFile, root.toString().toByteArray(StandardCharsets.UTF_8))
            return preview(configFile)
        }

        fun updateClientMode(file: File, mode: String): Hy2TunConfigPreview {
            val normalized = parseRouteMode(mode)
            android.util.Log.w("Hy2TunConfig", "updateClientMode mode=$normalized")
            val configFile = requireConfigFile(file)
            canonicalizeLegacyConfig(configFile)
            val root = JSONObject(configFile.readText(StandardCharsets.UTF_8))
            val parsed = parseClientConfigShape(configFile, root)
            parsed.client.put("mode", productModeTun)
            parsed.tun.put("route_mode", normalized)
            writeAtomic(configFile, root.toString().toByteArray(StandardCharsets.UTF_8))
            return preview(configFile)
        }

        private fun canonicalizeLegacyConfig(file: File) {
            if (!file.isFile) {
                return
            }
            val root = try {
                JSONObject(file.readText(StandardCharsets.UTF_8))
            } catch (_: Throwable) {
                return
            }
            val client = root.optJSONObject("client") ?: return
            val tun = client.optJSONObject("tun") ?: return
            var changed = false
            val oldAddress = tun.optString("address", "")
            if (oldAddress == "198.18.0.2/16" ||
                oldAddress == "198.18.0.2/32" ||
                oldAddress == "10.111.0.2/24") {
                tun.put("address", "10.111.0.2/32")
                changed = true
            }
            val oldDnsServer = tun.optString("dns_server", "")
            if (oldDnsServer == "8.8.8.8" || oldDnsServer == "10.111.0.1") {
                tun.put("dns_server", defaultFakeDnsServer)
                changed = true
            }
            val exits = root.optJSONArray("exits")
            if (exits != null) {
                for (i in 0 until exits.length()) {
                    val entry = exits.optJSONObject(i) ?: continue
                    val transport = entry.optString("transport", "udp-quic").trim()
                    val port = entry.optInt("port", -1)
                    if (transport == "tcp-tls-forward" && port == defaultUdpQuicPort) {
                        entry.put("port", defaultTcpTlsForwardPort)
                        changed = true
                    } else if (transport == "tcp-tls-forward" && port == 7443) {
                        // 2026-08-23: 7443 blocked on CN mobile paths; exits moved to 8443.
                        entry.put("port", defaultTcpTlsForwardPort)
                        changed = true
                    } else if (transport == "udp-quic" && port == defaultTcpTlsForwardPort) {
                        entry.put("port", defaultUdpQuicPort)
                        changed = true
                    }
                }
            }
            if (changed) {
                writeAtomic(file, root.toString().toByteArray(StandardCharsets.UTF_8))
            }
        }

        private fun inspectExitAuth(root: JSONObject, baseDir: File): String {
            val exits = root.optJSONArray("exits") ?: throw JSONException("exits[] missing")
            if (exits.length() == 0) {
                throw JSONException("exits[] missing")
            }
            val missing = ArrayList<String>()
            val invalid = ArrayList<String>()
            var present = 0
            for (i in 0 until exits.length()) {
                val entry = exits.optJSONObject(i) ?: throw JSONException("invalid exits[] entry")
                val inlineAuth = entry.optString("auth", "").trim()
                if (inlineAuth.isNotEmpty()) {
                    if (inlineAuth.length < 32) {
                        invalid.add("exits[$i].auth")
                    } else {
                        present += 1
                    }
                    continue
                }
                val authFile = entry.optString("auth_file", "").trim()
                if (authFile.isEmpty()) {
                    missing.add("exits[$i].auth_file")
                    continue
                }
                val file = resolveRelative(baseDir, authFile)
                if (!file.isFile) {
                    missing.add(file.absolutePath)
                    continue
                }
                val value = file.readText(StandardCharsets.UTF_8).trim()
                if (value.length < 32) {
                    invalid.add(file.absolutePath)
                } else {
                    present += 1
                }
            }
            if (invalid.isNotEmpty()) {
                return "auth invalid: " + invalid.joinToString(",")
            }
            if (missing.isNotEmpty()) {
                return "auth missing: " + missing.joinToString(",")
            }
            return "auth ready: $present exit(s)"
        }

        private fun materializeExitAuth(root: JSONObject, baseDir: File) {
            val exits = root.optJSONArray("exits") ?: throw JSONException("exits[] missing")
            if (exits.length() == 0) {
                throw JSONException("exits[] missing")
            }
            for (i in 0 until exits.length()) {
                val entry = exits.optJSONObject(i) ?: throw JSONException("invalid exits[] entry")
                val inlineAuth = entry.optString("auth", "").trim()
                if (inlineAuth.isNotEmpty()) {
                    requireAuthToken(inlineAuth, "exits[$i].auth")
                    entry.put("auth", inlineAuth)
                    continue
                }
                val authFile = entry.optString("auth_file", "").trim()
                if (authFile.isEmpty()) {
                    throw JSONException("exits[$i].auth_file missing")
                }
                val auth = readRequiredSecretText(baseDir, authFile, "exits[$i].auth_file")
                requireAuthToken(auth, "exits[$i].auth_file")
                entry.put("auth", auth)
            }
        }

        private fun readRequiredSecretText(baseDir: File, rawPath: String, label: String): String {
            val file = resolveRelative(baseDir, rawPath)
            if (!file.isFile) {
                throw java.io.IOException("$label file not found: ${file.absolutePath}")
            }
            val value = file.readText(StandardCharsets.UTF_8).trim()
            if (value.isEmpty()) {
                throw java.io.IOException("$label file is empty: ${file.absolutePath}")
            }
            return value
        }

        private fun requireAuthToken(value: String, label: String) {
            if (value.length < 32) {
                throw JSONException("$label token too short")
            }
        }

        private fun readRequiredBinary(baseDir: File, rawPath: String, label: String): ByteArray {
            val trimmed = rawPath.trim()
            if (trimmed.isEmpty()) {
                throw JSONException("$label missing")
            }
            val file = resolveRelative(baseDir, trimmed)
            if (!file.isFile) {
                throw java.io.IOException("$label file not found: ${file.absolutePath}")
            }
            val data = file.readBytes()
            if (data.isEmpty()) {
                throw java.io.IOException("$label file is empty: ${file.absolutePath}")
            }
            return data
        }

        private fun parseExitTransport(raw: String): String {
            val value = raw.trim().ifEmpty { "udp-quic" }
            if (value == "udp-quic" || value == "tcp-tls-forward") {
                return value
            }
            throw JSONException("unsupported exit transport: $value")
        }

        private fun parseProductMode(raw: String): String {
            val value = raw.trim().ifEmpty { productModeTun }
            if (value == productModeTun || value == productModePac) {
                return value
            }
            throw JSONException("unsupported client mode: $value")
        }

        private fun parseRouteMode(raw: String): String {
            val value = raw.trim().ifEmpty { routeModeFast }
            if (value == routeModeFast || value == routeModeGlobal) {
                return value
            }
            throw JSONException("unsupported tun route_mode: $value")
        }

        private fun parseDnsServer(raw: String): String {
            val value = raw.ifEmpty { defaultFakeDnsServer }
            val parsed = InetAddress.getByName(value)
            if (parsed !is Inet4Address) {
                throw JSONException("client.tun.dns_server must be IPv4")
            }
            return parsed.hostAddress ?: value
        }

        private fun parseIpv4Literal(raw: String, label: String): String {
            val octets = raw.split('.')
            if (octets.size != 4) {
                throw JSONException("$label must be IPv4 literal")
            }
            return octets.joinToString(".") { part ->
                if (part.isEmpty() || part.length > 3 || part.any { it !in '0'..'9' }) {
                    throw JSONException("$label must be IPv4 literal")
                }
                val value = part.toIntOrNull() ?: throw JSONException("$label must be IPv4 literal")
                if (value !in 0..255) {
                    throw JSONException("$label octet out of range")
                }
                value.toString()
            }
        }

        private fun parseAddress(raw: String): AddressParts {
            if (raw.isEmpty()) {
                throw JSONException("client.tun.address missing")
            }
            val slash = raw.indexOf('/')
            val addressText = if (slash >= 0) raw.substring(0, slash) else raw
            val prefixLength =
                if (slash >= 0) raw.substring(slash + 1).toIntOrNull()
                    ?: throw JSONException("client.tun.address prefix invalid")
                else 32
            if (prefixLength !in 1..32) {
                throw JSONException("client.tun.address prefix out of range")
            }
            val parsed = InetAddress.getByName(addressText)
            if (parsed !is Inet4Address) {
                throw JSONException("client.tun.address must be IPv4")
            }
            val address = parsed.hostAddress ?: addressText
            return AddressParts(address, prefixLength, "$address/$prefixLength")
        }

        private fun resolveRelative(baseDir: File, rawPath: String): File {
            val candidate = File(rawPath.trim())
            return if (candidate.isAbsolute) candidate else File(baseDir, rawPath.trim())
        }

        private fun java.io.InputStream.readAllStrict(): ByteArray {
            val out = ByteArrayOutputStream()
            val buf = ByteArray(8192)
            while (true) {
                val n = read(buf)
                if (n < 0) {
                    return out.toByteArray()
                }
                if (n == 0) {
                    throw java.io.IOException("zero-byte read")
                }
                out.write(buf, 0, n)
            }
        }
    }

    private data class AddressParts(val address: String, val prefixLength: Int, val cidr: String)

    private data class ParsedClientConfig(
        val client: JSONObject,
        val tun: JSONObject,
        val baseDir: File,
        val address: AddressParts,
        val dnsServer: String,
        val mtu: Int,
        val routeMode: String,
        val transport: String,
        val exitHost: String,
        val exitPort: Int,
        val productMode: String,
        val ownerProbeHost: String,
        val ownerProbePort: Int,
        val ownerProbeTimeoutMs: Int
    )
}
