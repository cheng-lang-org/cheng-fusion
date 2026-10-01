# hy2-tun-v1 VPN

`hy2-tun-v1` is Cheng's self-developed secure tunnel/VPN mode. It is configured and operated like a Hysteria2-style QUIC tunnel, but it does not promise wire compatibility with official Hysteria2 clients or servers.

## Scope

- Client platforms:
  - macOS system VPN through `utun`;
  - Android native VPN through `VpnService`;
  - Harmony/OpenHarmony native VPN through `VpnExtensionAbility`.
- Address family: IPv4 TCP and UDP.
- Transport: Cheng QUIC/TLS with HTTP/3/QPACK authentication frames.
- Security posture: `token_sha256`, `server_pin_sha256`, `disable_0rtt=true`, server authority validation, and masquerade response on rejected auth.

IPv6, ICMP, and raw-IP full-tunnel semantics remain outside this version. Mobile platform shells only own system VPN integration and lifecycle; Hysteria2-style transport, TLS, TCP/UDP adaptation, fake-IP DNS, and routing policy stay inside the Cheng native core.

## Server Config

```json
{
  "protocol": "hy2-tun-v1",
  "server": {
    "listen": "0.0.0.0:7443",
    "cert_der": "certs/server.der",
    "key_pk8_der": "certs/server.pk8.der",
    "trust_root_der": "certs/root.der",
    "expected_auth_sha256": "930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94",
    "expected_authority": "edge.internal",
    "cc_rx_text": "auto"
  },
  "security": {
    "auth_mode": "token_sha256",
    "expected_auth_sha256": "930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94",
    "disable_0rtt": true
  },
  "anti_block": {
    "masquerade": {
      "enabled": true,
      "host": "www.example.com",
      "path": "/",
      "status": 200,
      "body": "<html><body>ok</body></html>"
    }
  }
}
```

Start the server:

```sh
cheng vpn-proxy exit --config:server.json
```

## macOS Client Config

```json
{
  "protocol": "hy2-tun-v1",
  "client": {
    "cert_der": "certs/client.der",
    "key_pk8_der": "certs/client.pk8.der",
    "trust_root_der": "certs/root.der",
    "tun": {
      "enabled": true,
      "address": "198.18.0.2",
      "mtu": 1400,
      "route_mode": "global",
      "dns_mode": "fake-ip",
      "fake_ip_prefix": "198.18.0.0/16"
    }
  },
  "security": {
    "auth_mode": "token_sha256",
    "server_pin_sha256": [
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    ],
    "client_cert_mode": "off",
    "disable_0rtt": true
  },
  "exits": [
    {
      "name": "edge",
      "host": "203.0.113.10",
      "port": 7443,
      "server_name": "edge.internal",
      "authority": "edge.internal",
      "auth": "replace-with-a-random-token-at-least-32-bytes",
      "cc_rx": 123456,
      "weight": 10
    }
  ]
}
```

Start the macOS client with administrator privileges:

```sh
sudo cheng vpn-proxy local --config:client.json
```

The client opens a named `utun`, configures the TUN address and MTU, adds a host route for the selected exit server through the current default gateway, then installs split default routes (`0.0.0.0/1` and `128.0.0.0/1`) through the `utun` interface. On normal return or handled relay error, the client deletes those split routes and brings the `utun` interface down.

## Acceptance Checks

On macOS:

```sh
ifconfig | grep utun
route -n get 203.0.113.10
curl -4 https://example.com/
```

UDP can be checked with a literal IPv4 target. The first version intentionally keeps DNS fake-IP policy narrow, so full transparent DNS interception is not a required acceptance check.

On Windows or non-macOS hosts, smoke tests can validate config parsing, packet building, relay mapping, QUIC/Hysteria2 framing, and UDP/TCP relay logic. Actual `utun` creation and route mutation must be verified on macOS.

## GUI Client

Open the graphical client:

```sh
artifacts/apps/vpn-proxy-tool gui --config:client.json
```

The dedicated GUI binary can also be launched directly:

```sh
artifacts/apps/vpn-proxy-gui-macos --config:client.json
```

The GUI starts a local web control surface and uses the configured runtime tool when the user starts the tunnel.

## Android Native VPN

Android uses `VpnService` for user authorization, TUN fd creation, and socket protection. The platform shell lives under:

```text
platform/android/ChengHy2TunVpn
```

The Android adapter is Kotlin. No Java source is part of the product shell.

The Android app must:

- call `VpnService.prepare()` before starting the service;
- create the local VPN interface with `VpnService.Builder.establish()`;
- call `VpnService.protect(fd)` for every exit socket through the native callback;
- load the JNI adapter and require `libcheng_hy2_tun_core.so`;
- enter failed state if the native library is missing or start fails.

The Android platform shell must not implement QUIC, TLS, Hysteria2 frames, TCP reassembly, or fake-IP policy in Kotlin.

## Harmony/OpenHarmony Native VPN

Harmony/OpenHarmony uses `VpnExtensionAbility` and `vpnExtension.createVpnConnection(context)`. The platform shell lives under:

```text
platform/harmony/ChengHy2TunVpn
```

The Harmony app must:

- start the VPN extension through the system VPN authorization flow;
- create a `VpnConnection` with `vpnExtension.createVpnConnection(context)`;
- call `VpnConnection.create(config)` to obtain the TUN fd;
- call `VpnConnection.protect(fd)` for every exit socket through the native callback;
- load the native Cheng HY2 TUN module and hard-fail if it is unavailable.

The ArkTS layer must stay a lifecycle/config surface. It must not reimplement the protocol.

## Cheng Mobile GUI Contract

The shared mobile GUI state lives in Cheng:

```text
src/apps/vpn_proxy/mobile/vpn_proxy_mobile_gui.cheng
```

It owns the product state model, button enablement, mobile snapshot JSON, and default `hy2-tun-v1` config shape. Android Kotlin and Harmony ArkTS are only renderers and OS bridges: they request VPN permission, obtain TUN fd, forward `protect(fd)`, and render the Cheng snapshot. They must not own product state transitions beyond reflecting native status.

## Mobile Core ABI

Both mobile shells use the same C ABI:

```text
platform/mobile/ChengHy2TunCore/cheng_hy2_tun_core.h
```

The ABI passes `tun_fd`, config JSON, and platform callbacks into the Cheng native core. `protect_fd` is mandatory; without it the client can route its own QUIC exit socket back into the TUN interface and deadlock the tunnel.

Mobile product gate:

```sh
platform/mobile/ChengHy2TunCore/product_gate.sh
```

---

## 附录 A：本地部署（原 hy2-tun-v1-local-deploy 合卷）

Windows server + macOS client 的 `hy2-tun-v1` 部署记录。运行时文件位于用户配置目录；server 监听 QUIC + tcp-tls-forward，client 通过 utun 建立系统 VPN。详见 `platform/mobile/ChengHy2TunCore/` 部署脚本与配置模板。

## 附录 B：macOS per-app VPN（原 macos-per-app-vpn 合卷）

macOS Cursor/Codex per-app VPN 走 Apple NetworkExtension（非全局代理）。架构：Cursor.app/Codex.app → NetworkExtension → tcp-tls-forward 隧道 → exit node。per-app 流量捕获通过指向本地 SOCKS5/HTTP CONNECT 端口。

## 附录 C：Windows VPN Proxy（原 windows-vpn-proxy 合卷）

`x86_64-pc-windows-msvc` 交付。Windows 兼任 server（exit node，接受 tcp-tls-forward）+ client（本地 SOCKS5+HTTP CONNECT listener 转发）。TUN-mode 不在 Windows 交付范围；per-app 流量通过 app/系统代理设置指向本地端口。

## 附录 D：流多路复用重设计（原 repro/vpn_mux_redesign 合卷）

旧 per-stream 顺序复用有 teardown 竞态（间歇 ~6.5s 卡顿）+ 16-worker round-robin 在 China→US 因 wrap-around 延迟不复用。新架构 = 事件循环 + streamId 多路解复用：一条常热隧道承载并发多 stream，按 frame.streamId 解复用；单进程非阻塞 I/O；只有首个连接付 ~1.3s dial，之后复用热隧道永不再 dial。

This gate checks that Android and Harmony use native VPN APIs, require the native core, expose `protect(fd)`, and do not report connected without a real native start.
