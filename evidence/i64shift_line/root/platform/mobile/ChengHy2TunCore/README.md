# Cheng HY2 TUN Mobile Core ABI

This directory defines the stable C ABI used by mobile platform shells.

The platform app owns only native VPN integration:

- obtain a TUN file descriptor from Android `VpnService` or Harmony `VpnExtensionAbility`;
- call `protect(fd)` for every exit socket before the socket can be captured by the TUN route;
- pass config JSON and the TUN fd to `libcheng_hy2_tun`;
- expose status and stop lifecycle.

The platform app must not implement Hysteria2, QUIC, TLS, TCP reassembly, fake-IP DNS, or routing policy in Kotlin or ArkTS. Those live in the Cheng native core behind `cheng_hy2_tun_core_start`.

If `libcheng_hy2_tun` is missing, cannot be loaded, or returns a start error, the platform app must surface a failed state. It must not report connected and must not create an empty tunnel.

## Gates

Static product checks:

```sh
sh platform/mobile/ChengHy2TunCore/product_gate.sh
```

Read-only readiness check before touching the devices:

```sh
sh platform/mobile/ChengHy2TunCore/product_acceptance_preflight.sh
```

When one side is blocked by a device prompt, inspect the other side without installing:

```sh
CHENG_MOBILE_PREFLIGHT_SCOPE=harmony sh platform/mobile/ChengHy2TunCore/product_acceptance_preflight.sh
```

Final mobile acceptance requires both connected devices and unlocked install prompts:

```sh
sh platform/mobile/ChengHy2TunCore/product_acceptance_gate.sh
```

The acceptance gate runs the read-only preflight first, then accepts only full Android and Harmony product markers. It rejects Android skip-install and Harmony lightweight runs because those do not prove the installed apps can route real `google.com` traffic.
