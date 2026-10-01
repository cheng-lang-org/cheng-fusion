# Cheng HY2 TUN Android

Production delivery (pure Cheng core + Kotlin VpnService shell):

```sh
# static ABI / architecture gate
sh platform/mobile/ChengHy2TunCore/product_gate.sh

# release APK + signing contract
sh platform/android/ChengHy2TunVpn/scripts/production_readiness_audit.sh
# expect: android_production_ready=1

# device product gate (needs unlocked phone; enter install password if prompted)
CHENG_ANDROID_SERIAL=<serial> sh platform/android/ChengHy2TunVpn/scripts/product_perf_stability_gate.sh
```

Release APK: `app/build/outputs/apk/release/app-release.apk`  
Gradle wrapper lives in this directory (`./gradlew`, Gradle 8.13).

Default production exit:

- remote repo: `ssh://root@dosg/root/cheng-lang`
- Android exit name: `dosg`
- IPv4 TCP forward endpoint: `165.245.176.65:7443`
- IPv4 UDP/QUIC endpoint: `165.245.176.65:7443`
- default transport: `tcp-tls-forward`
- product gate default: `CHENG_ANDROID_TRANSPORTS=tcp-tls-forward`

Run UDP/QUIC only as an explicit regression while its TUN-loop dial path is being made fully event-driven:

```sh
CHENG_ANDROID_TRANSPORTS='udp-quic tcp-tls-forward' scripts/product_perf_stability_gate.sh
```

The APK asset `hy2-tun-client.example.json` intentionally does not store the shared token. It points at `hy2-tun-client.auth`, copied into the app files directory beside `hy2-tun-client.json`. Missing or short token files fail startup before the native core starts.

Mobile product modes:

- `tun`: Android `VpnService` installs routes by `route_mode`:
  - `fast` (default): OS-level split — only `198.18.0.0/16` (fake-ip) plus known blocked IP literals enter TUN; domestic real IPs stay on the physical NIC.
  - `global`: full IPv4 default route into TUN.
  Cheng core still owns fake-ip DNS, TCP/UDP adaptation, and exit transport.
- `pac`: Android `VpnService` installs a global HTTP PAC proxy for proxy-aware traffic. The PAC script is served by the Cheng local proxy listener on the first available port in `127.0.0.1:18080..18089`; public hosts return that same `PROXY 127.0.0.1:<port>`, local/private hosts return `DIRECT`. If the whole port pool is unavailable, startup hard-fails.

Deploy and operate the Vultr server from this directory:

```sh
CHENG_HY2_TUN_AUTH_SHA256=<64-hex-sha256> scripts/vultr_hy2_tun_server.sh deploy
scripts/vultr_hy2_tun_server.sh start
scripts/vultr_hy2_tun_server.sh status
```

Equivalent token input is allowed for local hashing and is never printed:

```sh
CHENG_HY2_TUN_TOKEN=<token> scripts/vultr_hy2_tun_server.sh deploy-start
```

The script uses `ssh root@vultr 'cd /root/cheng-lang && ...'` semantics, uploads only the public `transport.cert.der`, requires the remote `transport.key.pk8` and `transport.root.der` to already exist, builds `artifacts/apps/vpn-proxy-server` for `x86_64-unknown-linux-gnu` when missing, and hard-fails on missing binary, missing config, missing runtime files, or build failure.

Do not commit or print token values, private keys, or full auth headers. Do not replace the default VPN path with SSH; SSH is only for remote deployment and process control. TCP forwarding is an explicit transport option, not a fallback.
