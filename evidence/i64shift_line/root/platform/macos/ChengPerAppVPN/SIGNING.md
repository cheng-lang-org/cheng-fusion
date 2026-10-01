# ChengPerAppVPN Production Gate

ChengPerAppVPN production delivery means production-grade performance,
stability, and security. App Store listing is not required.

Current architecture: the provider is a macOS NetworkExtension System Extension
(`.systemextension`) with `com.apple.networkextension.app-proxy`.

The default local performance/stability gate does not require Notary. It
requires:

- valid local macOS development signing profiles for the host and provider
- valid `app-proxy-provider-systemextension` NetworkExtension entitlement
- valid `com.apple.developer.system-extension.install` host entitlement
- host/provider bundle IDs and Team ID match
- no SSH SOCKS fallback or stale LaunchAgent
- Chrome policy is system proxy only when Chrome is not selected
- Cheng native proxy upstream is healthy
- app rules are fresh for selected targets
- full gate checks bridge listener, RSS limit, and HTTPS reachability

The explicit distribution gate is enabled only with
`CHENG_PER_APP_VPN_REQUIRE_NOTARIZED_DISTRIBUTION=1`. That path additionally
requires no `com.apple.security.get-task-allow=true`, Hardened Runtime,
Developer ID timestamped signing, a stapled Notary ticket, and
`syspolicy_check distribution` success.

Required App IDs for team `8TPZK99LFJ` and bundle prefix `com.bicheng.cheng`:

- `8TPZK99LFJ.com.bicheng.cheng.ChengPerAppVPN`
- `8TPZK99LFJ.com.bicheng.cheng.ChengPerAppVPN.ProxyExtension`

For the current System Extension architecture, each local development or
distribution provisioning profile must:

- include `com.apple.developer.networking.networkextension`
- include `app-proxy-provider-systemextension`

For local performance/stability acceptance, create or repair two macOS
development profiles with an Apple Development certificate:

- `Mac Team Provisioning Profile: com.bicheng.cheng.ChengPerAppVPN`
- `Mac Team Provisioning Profile: com.bicheng.cheng.ChengPerAppVPN.ProxyExtension`

For explicit distribution use, create two Developer ID provisioning profiles
with the `Developer ID Application` certificate:

- `chengPerAppVPN`
- `chengPerAppVPNProxyExtension`

The host App ID `com.bicheng.cheng.ChengPerAppVPN` must enable both
Network Extension and System Extension capabilities. The provider App ID
`com.bicheng.cheng.ChengPerAppVPN.ProxyExtension` must enable Network
Extension with `app-proxy-provider-systemextension`.

Local development profile repair is intentionally explicit because it may
contact Apple Developer services and create or update profiles. Without the
approval flag the script only writes a report and fails before xcodebuild:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/repair_development_signing_profiles.sh \
  --team-id 8TPZK99LFJ \
  --bundle-prefix com.bicheng.cheng
```

Run the repair only after approving Apple provisioning updates:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/repair_development_signing_profiles.sh \
  --team-id 8TPZK99LFJ \
  --bundle-prefix com.bicheng.cheng \
  --allow-apple-provisioning-updates
```

Configure production target selection deterministically before acceptance. The
workstation preset selects Codex, Cursor, ClaudeCode, and Terminal/CLI; Chrome
is intentionally not selected:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/configure_targets.sh \
  --preset workstation
```

Configure dialer-proxy only with a real Cheng `tcp-tls-forward` front exit. SSH
is only an access method for operating a server; it is not a Cheng
`dialer_proxy` target.

```sh
bash platform/macos/ChengPerAppVPN/Scripts/configure_dialer_proxy.sh \
  --front-host FRONT_HOST \
  --front-port FRONT_PORT \
  --front-server-name FRONT_SERVER_NAME \
  --out artifacts/vpn-proxy-local/client-perapp-production.json
```

The generated config keeps the Vultr clean exit as the final exit and adds
`dialer_proxy` to it. If the front exit uses a different token, pass
`--front-auth FRONT_AUTH_TOKEN`; otherwise the final exit auth is reused.
Product gates require this chain by default:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/product_gate.sh
```

If the old diagnostic SSH SOCKS listener on `127.0.0.1:10808` is still running,
the gate fails before install/start. Stop it explicitly through the gate:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/product_gate.sh --stop-legacy-ssh-socks
```

Preview without writing:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/configure_targets.sh \
  --preset workstation \
  --dry-run
```

Read-only target preflight validates selected apps, CLIs, and helper
executables before build/install:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/target_preflight.sh
```

There is no implicit default target in production gates. If the target config is
missing or every target is false, `target_preflight.sh`, `product_gate.sh`, and
`production_acceptance_gate.sh` must all fail before install/start work.

Preflight only checks signing/config/upstream health and does not start or stop
the VPN runtime:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/product_gate.sh --preflight-only
```

Local runtime stability can be validated before Notary or System Extension
activation. This gate starts only a temporary native bridge on a random
loopback port, runs the selected target preflight, checks upstream health, runs
the bridge benchmark, and then cleans up the temporary bridge. It does not
install, activate, repair, load LaunchAgents, change profiles, or change system
proxy settings:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/local_runtime_stability_gate.sh \
  --rounds 3 \
  --requests 3
```

Full runtime gate checks local bridge performance/stability too. The bridge
benchmark hard-fails on marker loss, median latency, p95 latency, single-request
max latency, absolute RSS, and RSS growth:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/product_gate.sh
```

`product_gate.sh` writes a full `product-gate-report.txt` under
`CHENG_PER_APP_VPN_OUT`. The report keeps the normal gate output and adds
artifact paths plus `product_gate_failed_stage` and
`product_gate_failed_reason` on failure.

`bridge_benchmark.sh` writes `bridge-benchmark-report.txt` under the same output
directory. The report records benchmark inputs, run directory, latency TSV path,
RSS/latency thresholds, final metrics, and on failure
`bridge_benchmark_failed_stage` plus `bridge_benchmark_failed_reason`.
Benchmarking also verifies that the listening process executable is exactly the
configured Cheng `vpn-proxy` binary or installed `ChengPerAppVPN` app binary by
default, so a random local HTTP proxy or argv-spoofed process cannot satisfy the
performance gate. RSS samples must be measurable and greater than zero; missing
process memory data is a hard failure, not a zero-memory pass.

The native bridge is started as its own process group. If the bridge must be
recycled because RSS exceeds the configured limit, the runtime kills the whole
bridge process group only when the listening process is the group leader;
otherwise it kills only the stale listening pid. This keeps production recycle
deterministic without killing unrelated user processes.

All production gates are bounded. Useful timeout knobs:

- `CHENG_PER_APP_VPN_TARGET_PREFLIGHT_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_NOTARY_PREFLIGHT_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_NOTARY_SUBMIT_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_SIGNING_PREFLIGHT_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_CODE_SIGNATURE_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_INSTALL_AND_START_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_RUNTIME_STABILITY_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_PRODUCT_GATE_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_RUNTIME_READINESS_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_PRODUCT_GATE_ROUND_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_ALLOW_RAW_NOTARY_PASSWORD`
- `CHENG_PER_APP_VPN_NATIVE_PROXY_STATUS_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_BRIDGE_BENCHMARK_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_BENCH_MAX_MEDIAN_MS`
- `CHENG_PER_APP_VPN_BENCH_MAX_P95_MS`
- `CHENG_PER_APP_VPN_BENCH_MAX_REQUEST_MS`
- `CHENG_PER_APP_VPN_BENCH_MAX_RSS_GROWTH_KB`
- `CHENG_PER_APP_VPN_ZIP_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_STAPLER_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_SYSPOLICY_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_APP_STATUS_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_APP_REPAIR_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_BRIDGE_START_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_UPSTREAM_HEALTH_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_RUNTIME_STATE_TIMEOUT_SECONDS`
- `CHENG_PER_APP_VPN_OUT`

Benchmark thresholds must be ordered: max median <= max p95 <= max single
request.

The readiness audit is also the read-only pollution check: it reports whether
the runtime LaunchAgent is installed/loaded, whether the old SSH SOCKS fallback
is absent, whether the bridge listener is owned by Cheng, and whether the
System Extension is both enabled and active. The production runtime LaunchAgent
label is derived from the current bundle prefix, for example
`com.bicheng.cheng.perappvpn.runtime`; the old
`com.bichengliu.cheng.perappvpn.runtime` label is treated as legacy pollution.
Production install removes that legacy runtime agent before writing the current
runtime agent. The runtime LaunchAgent contract is verified structurally: exact
label, `RunAtLoad`, `KeepAlive.SuccessfulExit=false`, `start_runtime.sh --watch`,
bridge/config/provider environment, RSS limit, and no SOCKS upstream.

Post-activation runtime stability gate first requires the readiness audit to be
fully green, then runs repeated full product gates and fails on bridge latency
or RSS growth:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/production_runtime_stability_gate.sh \
  --team-id 8TPZK99LFJ \
  --bundle-prefix com.bicheng.cheng \
  --notary-profile cheng-notary
```

The runtime stability gate writes `runtime-stability-report.txt`,
`runtime-stability-readiness-audit.txt`, `runtime-stability-product-gate.tsv`,
and one `runtime-stability-round-N.txt` file per product-gate round under
`CHENG_PER_APP_VPN_OUT`. Each round also gets its own
`runtime-stability-round-N-artifacts/` directory so `product-gate-report.txt`
and `bridge-benchmark-report.txt` are not overwritten by later rounds. The
summary report records inputs, thresholds, artifact paths, round metrics, and
the exact failed stage when the gate fails. Runtime stability round metrics are
read back from that round's `bridge-benchmark-report.txt`; the captured terminal
output is not the authoritative performance source.

Final production completion is proven by the completion gate. It is read-only:
it first runs `production_readiness_audit.sh`; if readiness is not fully green,
it fails immediately with the first blocker and does not run runtime stability.
Only after readiness is green does it run the post-activation runtime stability
gate:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/production_completion_gate.sh \
  --team-id 8TPZK99LFJ \
  --bundle-prefix com.bicheng.cheng
```

The completion report is `production-completion-report.txt`. A completed local
production install must contain `cheng_per_app_vpn_production_completion_ready=1`.

End-to-end local production acceptance builds, installs, starts, runs the full
product gate, then runs the post-activation runtime stability gate. It refuses
to run when no per-app target is selected and fails before build/install if
local development System Extension signing profiles are incomplete:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/production_acceptance_gate.sh \
  --team-id 8TPZK99LFJ \
  --bundle-prefix com.bicheng.cheng
```

To run the explicit Developer ID distribution path, enable the distribution
gate and provide Notary credentials:

```sh
CHENG_PER_APP_VPN_REQUIRE_NOTARIZED_DISTRIBUTION=1 \
  bash platform/macos/ChengPerAppVPN/Scripts/production_acceptance_gate.sh \
    --team-id 8TPZK99LFJ \
    --bundle-prefix com.bicheng.cheng \
    --old-bundle-prefix com.bichengliu.cheng \
    --notary-profile cheng-notary
```

The acceptance gate writes durable artifacts under `CHENG_PER_APP_VPN_OUT`
(default: `.tmp-exec/macos-per-app-vpn`). The top-level report is
`production-acceptance-report.txt`; stage output files include target
preflight, Notary preflight, signing preflight, install/start/product gate, and
runtime stability output. The report records only safe key/value metadata and
artifact paths; it must not contain Notary passwords, tokens, certificate
private keys, or complete auth headers.

The acceptance gate keeps nested gate artifacts isolated. Install/start/product
gate artifacts are written under
`production-acceptance-install-start-artifacts/`; post-activation stability
artifacts are written under
`production-acceptance-runtime-stability-artifacts/`. Production acceptance does
not trust exit code alone: it also requires the install/start
`product-gate-report.txt` to contain `per_app_vpn_product_ready=1`, the
install/start `bridge-benchmark-report.txt` to contain
`bridge_benchmark_failed=0` and `bridge_benchmark_ready=1`, and the runtime
stability summary to contain `cheng_per_app_vpn_runtime_stability_ready=1`.

Production gates reject raw Apple ID Notary passwords by default because
command arguments are visible to other local processes. Use a notarytool
keychain profile or App Store Connect API key auth. To create a keychain
profile with Apple ID auth, run `setup_notary_profile.sh` without `--password`
and let notarytool prompt. `CHENG_PER_APP_VPN_ALLOW_RAW_NOTARY_PASSWORD=1`
exists only as an explicit unsafe escape hatch and is not a production-ready
configuration.

`setup_notary_profile.sh` writes `notary-profile-report.txt` under
`CHENG_PER_APP_VPN_OUT`. The report records the profile name, auth mode, safe
presence flags, validation result, and failure stage/reason. It must not record
Apple ID passwords, API private key contents, tokens, or complete auth headers.

Signing asset preflight:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/signing_preflight.sh \
  --team-id 8TPZK99LFJ \
  --bundle-prefix com.bicheng.cheng
```

Read-only production readiness audit:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/production_readiness_audit.sh \
  --team-id 8TPZK99LFJ \
  --bundle-prefix com.bicheng.cheng \
  --notary-profile cheng-notary
```

The audit also verifies the installed host/provider static contract before
notarization is available: bundle IDs, Team ID, provider Info.plist link,
NetworkExtension entitlements, host System Extension entitlement, Hardened
Runtime, timestamp, and Developer ID authority.

The readiness audit writes `production-readiness-report.txt` under
`CHENG_PER_APP_VPN_OUT` and stores product-gate preflight output in
`production-readiness-product-gate-preflight.txt`. It also writes
`production-readiness-actions.txt`, a machine-readable blocker/action list for
the remaining production steps. Each blocker has a priority and phase, and the
file ends with `production_readiness_next_blocker` plus
`production_readiness_next_action` so automation can take only the current
dependency-unblocked step. It is still read-only: it does not install, start,
stop, repair, notarize, or change target selection.

Notary credential preflight is read-only and uses `notarytool history` only. It
writes `notary-credentials-report.txt` or the report path passed with
`--report`; the readiness audit stores the same safe credential check in
`production-readiness-notary-credentials.txt`. It is only required for the
explicit notarized distribution path. `install_and_start.sh --notarize` and
`notarize.sh --preflight-only` use the same preflight and report schema before
submit work starts.

```sh
bash platform/macos/ChengPerAppVPN/Scripts/notary_credentials_preflight.sh \
  --profile cheng-notary
```

Create a Notary keychain profile:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/setup_notary_profile.sh \
  --profile cheng-notary \
  --apple-id you@example.com \
  --team-id 8TPZK99LFJ

bash platform/macos/ChengPerAppVPN/Scripts/notarize.sh \
  --app /Applications/ChengPerAppVPN.app \
  --profile cheng-notary \
  --preflight-only
```

Install and run with production signing:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/install_and_start.sh \
  --team-id 8TPZK99LFJ \
  --bundle-prefix com.bicheng.cheng \
  --old-bundle-prefix com.bichengliu.cheng \
  --configuration Release \
  --production-signing \
  --notarize \
  --notary-profile cheng-notary
```

Notarize and staple the installed app before the production gate:

```sh
CHENG_PER_APP_VPN_NOTARY_PROFILE=cheng-notary \
  bash platform/macos/ChengPerAppVPN/Scripts/notarize.sh \
  --app /Applications/ChengPerAppVPN.app
```

If a notarytool keychain profile is not configured, provide either App Store
Connect API key environment variables or Apple ID app-specific password
environment variables shown by:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/notarize.sh --help
```

Manual signing:

```sh
bash platform/macos/ChengPerAppVPN/Scripts/build.sh \
  --team-id 8TPZK99LFJ \
  --bundle-prefix com.bicheng.cheng \
  --configuration Release \
  --manual-signing \
  --signing-identity "Developer ID Application" \
  --host-profile-specifier "chengPerAppVPN" \
  --provider-profile-specifier "chengPerAppVPNProxyExtension"
```
