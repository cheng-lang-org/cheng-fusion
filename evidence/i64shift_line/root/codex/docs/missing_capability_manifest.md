# Missing Capability Manifest — codex

> Historical manifest. Live source inventory and the current static
> rewrite/translate path are now synchronized at 115 Cargo members,
> `ported=115`, `blocked=0`. Do not use the counts below as live source
> inventory.

ported=22, blocked=84, total=106
verified: 84/84 categorized, 0 uncategorized

## Primary Capability Categories

| # | Category | Count | Description |
|---|----------|-------|-------------|
| P1 | `fs` | 4 | File system provider (open/read/write/stat/mkdir/rename/remove/canonicalize) |
| P2 | `ffi` | 8 | FFI/provider archive (native C/C++ binding, system call access) |
| P3 | `async` | 31 | Async runtime (executor/waker/IO readiness/cancel/streaming) |
| P4 | `http` | 5 | HTTP client (TCP/TLS/proxy/SSE/streaming/backpressure) |
| P5 | `sqlite` | 1 | SQLite or thread-store provider |
| P6 | `pty` | 1 | Process/PTY provider |
| P7 | `ws` | 0 | WebSocket/event-stream (secondary only, no primary members) |
| P8 | `keyring` | 0 | Keyring/secrets provider (secondary only) |
| P9 | `terminal` | 1 | Terminal raw mode / ANSI input |
| P10 | `sandbox` | 3 | Sandbox/exec policy provider |
| — | `codex_internal` | 17 | Deep internal Codex dep chain (blocked transitively) |
| — | `external_crate` | 7 | Large external Rust crate, no Cheng equivalent |
| — | `platform` | 4 | Platform-specific (Linux/Windows/macOS only) |
| — | `serde` | 0 | Serialization framework (secondary only, no primary members) |
| — | `inventory_error` | 1 | Listed in Cargo members but crate does not exist |
| — | `verification_gap` | 1 | Cheng crate exists, but smoke evidence does not yet prove crate-level equivalence |

**Total blocked: 4+8+31+5+1+1+0+0+1+3+17+7+4+0+1+1 = 84**

---

## Complete Blocked Member Inventory (84/84)

Each member listed exactly once with its PRIMARY blocker.

### fs — File System Provider (4)

`apply-patch`, `config`, `file-search`, `utils/cache`

### ffi — FFI / Provider Archive (8)

`agent-identity`, `keyring-store`, `linux-sandbox`, `process-hardening`, `sandboxing`, `secrets`, `shell-command`, `shell-escalation`

### terminal — Terminal/ANSI (1)

`ansi-escape`

### async — Async Runtime (31)

`analytics`, `app-server`, `app-server-client`, `app-server-test-client`, `app-server-transport`, `async-utils`, `backend-client`, `cli`, `cloud-requirements`, `cloud-tasks`, `cloud-tasks-client`, `cloud-tasks-mock-client`, `codex-api`, `codex-client`, `core`, `core-api`, `core-plugins`, `core-skills`, `exec`, `exec-server`, `login`, `model-provider`, `models-manager`, `network-proxy`, `otel`, `plugin`, `rmcp-client`, `rollout`, `thread-store`, `tui`, `utils/readiness`

### http — HTTP Client (5)

`lmstudio`, `ollama`, `responses-api-proxy`, `test-binary-support`, `thread-manager-sample`

### sqlite — SQLite Provider (1)

`state`

### pty — Process/PTY Provider (1)

`utils/pty`

### sandbox — Sandbox/Exec Policy (3)

`execpolicy`, `execpolicy-legacy`, `utils/sandbox-summary`

### codex_internal — Deep Internal Dep Chain (17)

`agent-graph-store`, `app-server-protocol`, `arg0`, `aws-auth`, `codex-mcp`, `connectors`, `debug-client`, `external-agent-sessions`, `feedback`, `hooks`, `mcp-server`, `memories/read`, `memories/write`, `protocol`, `rollout-trace`, `skills`, `tools`

### external_crate — Large External Rust Crate (7)

`code-mode`, `codex-backend-openapi-models`, `codex-experimental-api-macros`, `git-utils`, `utils/cargo-bin`, `utils/image`, `v8-poc`

### platform — Platform-Specific (4)

`realtime-webrtc`, `stdio-to-uds`, `uds`, `utils/sleep-inhibitor`

### inventory_error — Listed But Missing (1)

`device-key`

### verification_gap — Missing Crate-Level Smoke Evidence (1)

`utils/template`

---

## Verification

Sum: 4+8+1+31+5+1+1+3+17+7+4+1+1 = **84** ✓ (matches blocked_count)

Ported: 22 (see module_map.cheng)

Total: 84 + 22 = 106 ✓ (matches inventory.cheng RustCsgExpectedCargoMembers)

Uncategorized: 0 ✓

## Notes

- Ported means both a Cheng crate under `codex/crates` and a dedicated `rust_csg_*_smoke.cheng` exist.
- `device-key`: Listed in Cargo.toml members but no crate directory exists. References exist only in state DB migration SQL.
- `collaboration-mode-templates`: Cheng crate and dedicated smoke now import the crate and validate Rust `include_str!` byte lengths, so it is counted as ported.
- `utils/template`: Cheng crate exists, but the current smoke inlines the implementation because the crate-level cold path still has composite return/dynamic array risk; it remains blocked until the smoke imports the crate directly.

## Capability Priority Order

| Priority | Capability | Unlocks | Rationale |
|----------|-----------|---------|-----------|
| 1 | `fs` | 4 | Highest ROI — config, state, rollout all need it |
| 2 | `ffi` | 8 | Enables SQLite/keyring/pty/system API access |
| 3 | `async` | 31 | Single-thread event loop first; HTTP/MCP/app-server depend on it |
| 4 | `http` | 5 | Codex needs streaming, proxy, cancel, timeout, TLS |
| 5 | `sqlite` | 1 | Unlocks state → rollout → thread-store chain |
| 6 | `pty` | 1 | Shell command execution |
| 7 | `sandbox` | 3 | Exec policy enforcement |
| 8 | `terminal` | 1 | ANSI escape parsing (ansi-escape) |
| 9+ | `ws/keyring` | 0 primary | Needed for secondary deps after primary capabilities |

---

## Contract

Any newly blocked member in module_map.cheng MUST be added to this manifest with a valid primary capability category. A CI check MUST verify that `count(manifest_blocked) == rewrite_plan.blocked_count`. Uncategorized members trigger hard-fail.
