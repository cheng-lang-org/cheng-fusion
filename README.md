# cheng-fusion-mcp

Standalone MCP server exposing deterministic Cheng compiler fusion tools — CSG facts, cheng-lsp, crash triage, line maps, profiling, and symbol-regression checks — for the active Cheng project. Speaks MCP over stdio JSON-RPC (hand-rolled transport, no MCP SDK dependency). Runs on [bun](https://bun.sh).

Extracted as a standalone package from the claude-code reverse-engineered repo's `claude/tool/cheng_*.ts` modules; the session-integration hooks (`cheng_fusion_hooks_m9011.ts`, which wire into claude-code's own Bash tool / session registry) are intentionally **not** included — a standalone MCP server doesn't need them.

## Install

Pick one:

**1. `claude mcp add` (quickest)**

```sh
claude mcp add cheng-fusion -- bun /Users/lbcheng/cheng-fusion/index.ts
```

**2. Manual `~/.claude.json` snippet**

```json
{
  "mcpServers": {
    "cheng-fusion": {
      "type": "stdio",
      "command": "bun",
      "args": ["/Users/lbcheng/cheng-fusion/index.ts"],
      "env": {}
    }
  }
}
```

**3. `install.sh`** — idempotently merges the entry above into `~/.claude.json` (backs up the existing file first; if `cheng-fusion` is already registered, only `command`/`args` are replaced in place, other fields on that entry are kept).

```sh
/Users/lbcheng/cheng-fusion/install.sh            # applies the change
/Users/lbcheng/cheng-fusion/install.sh --dry-run  # prints the JSON without writing anything
```

## Tools

| Tool | Mutating | Purpose |
|---|---|---|
| `cheng_csg_query` | no | Query CSG facts: symbol declarations, inbound references, outbound calls. |
| `cheng_evidence` | no | Cross-module refactor blast-radius evidence (impact radius, cross-module callers) from CSG facts. |
| `cheng_csg_roundtrip` | yes | Emit Cheng cold CSG facts for a source file and verify the cold reader consumes them; refreshes `conversion-reports/cheng-csg/current.facts`. |
| `cheng_crash_triage` | no | Parse Cheng compiler/runtime stderr into structured `file:line` frames. |
| `cheng_line_map_read` | no | Canonical function sig/body line spans for a `.cheng` source (sidecar-cached; falls back to cheng-lsp). |
| `cheng_lsp_query` | no | Direct pass-through to the real `cheng-lsp` language server: hover, definition, references, diagnostics, rename, codeAction, etc. |
| `cheng_profile_report` | yes | Probe/run/convert real Cheng profiling reports (`profile-report` / `system-link-exec` + executable timing). |
| `cheng_symbol_diff` | no | Snapshot `cheng print-symbols` counts; `primary_unsupported_count > 0` signals a compiler lowering regression. |
| `cheng_exec_diff` | yes | Two-driver differential method: compile+run one or more fixtures under `driverA`/`driverB` and diff the result (`identical`/`semantic_divergence`/`compile_wall`/`both_fail`). |
| `cheng_template_leak_audit` | no | Scan a `.primary.o` for `__L<line>`-mangled generic functions still carrying a bare unbound type parameter in return/param position (template monomorphization leak), and count real BL call edges via `objdump -r` to classify `live_leak` vs `dead_weight`. Golden invariant: `liveLeakCount` should be 0. |
| `cheng_corrupt_hunt` | no | Two-stage lldb watchpoint write-point localization: stage 1 breakpoints a known detection site and reads a base-register+offset victim address `H` (and its current value); stage 2 (fresh process) sets a write watchpoint on `H` and replays from process start, recording pc/symbol/new-value/backtrace for each hit — the first hit in the real culprit function is the corrupting write. |
| `cheng_shape_matrix` | yes | Runs the golden ignition fixture matrix (`fixtures/ignition/matrix.json`) under one Cheng driver: compiles+runs every non-planned entry and checks `expectRc` / `expectStdout` / `golden` (byte-exact) / `expectCompileBail` (a contracted honest `ZC_NOT_READY` rejection), reporting GREEN/RED/CFAIL per entry plus `coverageGaps` (`planned:true` entries with no fixture yet). Productizes the manual "30s ignition determinism loop". |
| `cheng_claim_audit` | no | Diagnostic-only static text audit of `primary_object_plan.cheng`'s statement-claim sites (`PrimaryBodyIrNodeEvalOnlyOwn(` calls, `localInitialized = true` assignments, `continue` inside statement-dispatch loops found by indentation backtrack), classified `EMITS`/`POISONS`/`SILENT_RISK` by regex-scanning nearby context for emission/poison evidence. Candidates for human review, not verdicts — never a sufficient condition on its own to delete a text-path fallback. |
| `cheng_residual_peel` | yes* | One-shot residual peel board for ZC/Pass B: `mode=static` (default) runs second-scale shape rules (`freeSeq` multi-overload, multi-stmt `;…; break`, V2FastBuild same-name) from `fixtures/residual_rules.json`; `mode=full` adds canonical `tools/zc_enumerate.sh` census. Returns `static.hits`, optional `census`, phase-ordered `attackOrder`, and `maskedRisk` (deeper-phase static hits likely hidden until call-resolve clears). Static = leads not verdicts; only census may claim `zc_missing_function_count`. \*Mutating flag set because `mode=full` spawns a heavy driver; prefer `static` under load. |

All tools except `cheng_crash_triage`, `cheng_corrupt_hunt`, `cheng_shape_matrix` and `cheng_claim_audit` require an active Cheng project root (a directory containing `cheng-package.toml`), resolved from MCP workspace roots, an explicit `cwd`, or the tool's own `file`/`source`/`root` argument. `cheng_shape_matrix`/`cheng_claim_audit` take explicit absolute `driver`/`root`/`pobjPath` arguments instead (same rationale as `cheng_exec_diff`: fixtures and experimental drivers are often outside any Cheng project root).

## Environment knobs

| Variable | Default | Effect |
|---|---|---|
| `CHENG_FUSION_RSS_CAP` | `1073741824` (1 GiB) | Overrides `CHENG_PROCESS_MAX_RSS_BYTES` injected into every spawned Cheng driver/cheng-lsp subprocess. This is a **circuit-breaker ceiling, not an expected footprint** — real measured peaks are two orders of magnitude smaller (see below); the compiler self-aborts once a compile/link process crosses it (checked in `compiler_main.cheng` / `system_link_exec.cheng` via `HostOpsConfiguredMaxRssBytes`/`HostOpsCurrentRssBytes`). Note: `cheng-lsp` does **not** check this env var at all (no call site in `lsp_server.cheng`/`lsp_entry.cheng`/`lsp_protocol.cheng`), so for `cheng_lsp_query`/`cheng_line_map_read` this cap is inert — the only backstop there is `CHENG_FUSION_TIMEOUT_MS` + process-group `SIGKILL`. |
| `CHENG_FUSION_TIMEOUT_MS` | tool-specific (15s for LSP requests, 120s for driver runs) | Overrides every timeout in the process, uniformly. On timeout the whole subprocess **group** is `SIGKILL`ed (not just the direct child), so `BACKEND_JOBS` fork-join grandchildren don't survive as orphans. |
| `CHENG_TOOLCHAIN_ROOT` / `CHENG_ROOT` | `/Users/lbcheng/cheng-lang` | Default Cheng toolchain root used to locate the backend driver, stage3 driver, and cheng-lsp fallback path. |
| `CHENG_DRIVER` | `$CHENG_TOOLCHAIN_ROOT/artifacts/backend_driver/cheng` | Explicit override for the backend driver binary. |
| `CHENG_STAGE3_DRIVER` | `$CHENG_TOOLCHAIN_ROOT/artifacts/bootstrap/cheng.stage3` | Explicit override for the stage3 self-hosted driver. |
| `CHENG_LSP_PATH` | resolved via `which cheng-lsp`, else `$CHENG_TOOLCHAIN_ROOT/artifacts/cheng-lsp` | Explicit override for the `cheng-lsp` binary. |
| `CHENG_COLD_DRIVER` | — | Highest-priority driver override for `cheng_csg_roundtrip`'s cold-CSG emission. |
| `CHENG_FUSION_VENDOR_COLD_DRIVER` | `vendor/cold-driver/cheng_cold_csg9` (this package) | Second priority, ahead of `CHENG_CSG_DRIVER`/`CHENG_DRIVER`/`CHENG_STAGE3_DRIVER`. Used automatically whenever the vendor binary exists — see "Vendor cold driver" below. |
| `CHENG_CSG_DRIVER` | — | Third-priority driver candidate, tried before `CHENG_DRIVER`/`CHENG_STAGE3_DRIVER`. |
| `CSG_CORE_READER_ROOT` / `TS_CSG_ROOT` | `$CHENG_TOOLCHAIN_ROOT/ts-csg` | Root used to locate the CSG-Core facts reader (`dist/csgc-reader.js`) for non-cold CSG facts. |

### RSS cap sizing (measured 2026-07-10)

Peak RSS per tool, measured by sampling `ps -axo pid,ppid,rss,comm,command` over the whole real MCP-server process tree every 20ms while driving each tool through the real stdio JSON-RPC protocol (max of 2 runs per row; large-file roundtrip run only once, under the *old* 12 GiB cap, since it's a real compile):

| Tool / scenario | Driver subprocess peak RSS | Notes |
|---|---|---|
| `cheng_symbol_diff` (canary) | ~10 MB | trivial 2-line fixture |
| `cheng_csg_roundtrip` — small (canary) | ~few MB | too fast to sample reliably; bounded like symbol_diff |
| `cheng_csg_roundtrip` — mid (`lowering_plan.cheng`, 6357 lines) | writer (`emit-cold-csg`) 57.8 MB; reader (`system-link-exec --emit:obj`, 15.8 MB facts) ≥20 MB | reader peak likely undercounted (short-lived process, ps caught it mid-ramp) |
| `cheng_csg_roundtrip` — large (`typed_expr.cheng`, full frontend closure) | writer 66.6 MB (12.6 MB facts) | **max observed across the whole table**; run once |
| `cheng_profile_report` (`action=probe`, canary compile+run) | ~few MB | trivial 2-line fixture |
| `cheng_crash_triage` | 0 (no subprocess) | pure in-process regex parse |
| `cheng_csg_query` / `cheng_evidence` | 0 (no subprocess) | facts parsed in-process; bun server RSS grew from ~65 MB idle to ~125–140 MB after loading the 12.6 MB large-facts file — informational only, **not gated by this cap** (the cap is only injected into spawned driver/lsp subprocess env, not the server's own process) |
| `cheng_lsp_query` / `cheng_line_map_read` (LSP path) | **not bounded by this cap at all** — see below | |

**Important finding, unrelated to the cap value itself:** querying `cheng-lsp` (`documentSymbol` or the internal `cheng/lineMap` request) against a real project file (`lowering_plan.cheng`) reproducibly grows RSS at ~2.4 GB/s, unbounded, until `CHENG_FUSION_TIMEOUT_MS` (default 15s) kills the process tree at 15–27 GB. The same query against the tiny canary file is instant and ~6 MB. `cheng-lsp` never reads `CHENG_PROCESS_MAX_RSS_BYTES` (verified: no reference in `lsp_server.cheng`/`lsp_entry.cheng`/`lsp_protocol.cheng`), so raising or lowering `CHENG_FUSION_RSS_CAP` has **zero effect** on this leak — only the timeout bounds it. This looks like a real memory leak in `cheng-lsp`'s project-wide symbol resolution and is out of scope for this change; flagging for a separate fix.

Sizing: max confirmed cap-governed peak = 66.6 MB (`typed_expr.cheng` writer). `1073741824` (1 GiB) gives ~16x headroom over that, replacing the old 12 GiB (which gave ~193x headroom — not a meaningful circuit breaker).

## Vendor cold driver (CSG kind=9 call edges)

The main repo's `bootstrap/cheng_cold.c` doesn't parse/write CSG record kind=9
(intra-object call-edge facts) yet — the patch for it lives in the main repo
at `docs/patches-csg-writer-call-edges.patch` (vendored here too, see below),
verified to apply cleanly but not yet merged upstream. Without it, `cheng_csg_query kind=references`
only sees cross-object calls (kind=6 relocs); intra-file calls (the common
case) are invisible.

`vendor/cold-driver/` builds a fusion-local cold driver binary that *does*
understand kind=9, by applying `vendor/cold-driver/patches/csg-writer-call-edges.patch`
to a **copy** of `$CHENG_TOOLCHAIN_ROOT/bootstrap/cheng_cold.c` (plus its
`#include`d siblings) and compiling that copy. This never touches the main
repo's source tree, artifacts, or seeds.

```sh
/Users/lbcheng/cheng-fusion/vendor/cold-driver/build.sh
```

Rebuild whenever the main repo's `bootstrap/cheng_cold.c` changes upstream, or
the vendored patch is updated. Output: `vendor/cold-driver/cheng_cold_csg9`
(gitignored; rebuilt on demand, not committed). `cheng_csg_roundtrip` picks it
up automatically once built — no env var required (see the driver-priority
table above); set `CHENG_COLD_DRIVER` to override with a different binary, or
delete the vendor binary to fall back to the main repo's stage3/backend
driver.

## Layout

```
cheng-fusion/
├── index.ts                                  entry point (equivalent to the source repo's 3-line shim)
├── package.json                               name=cheng-fusion-mcp, bun, zod dependency
├── install.sh                                  idempotent ~/.claude.json registration
├── vendor/
│   └── cold-driver/
│       ├── build.sh                            builds cheng_cold_csg9 from a patched copy of upstream cheng_cold.c
│       ├── patches/csg-writer-call-edges.patch vendored copy of the CSG kind=9 patch
│       └── cheng_cold_csg9                      built binary (gitignored, run build.sh to produce)
├── src/
│   ├── runtime.ts                              tiny lazy-module-init helper (copied verbatim)
│   ├── tool_definition_lookup_and_defaults_m2929.ts
│   ├── cheng_toolkit_m9000.ts                  shared toolkit: project-root resolution, CSG facts parsing, driver spawning, cheng-lsp client
│   ├── cheng_fusion_tool_registry.ts           local static registry of the 8 cheng_* tools (replaces the claude-code builtin tool registry)
│   ├── cheng_fusion_mcp_server_m9009.ts        MCP stdio JSON-RPC server
│   ├── cheng_csg_query_m9001.ts
│   ├── cheng_evidence_m9002.ts
│   ├── cheng_csg_roundtrip_m9003.ts
│   ├── cheng_crash_triage_m9004.ts
│   ├── cheng_line_map_read_m9005.ts
│   ├── cheng_lsp_query_m9006.ts
│   ├── cheng_profile_report_m9007.ts
│   ├── cheng_symbol_diff_m9008.ts
│   ├── cheng_exec_diff_m9012.ts
│   ├── cheng_template_leak_audit_m9013.ts
│   ├── cheng_corrupt_hunt_m9015.ts
│   ├── cheng_shape_matrix_m9016.ts              golden ignition fixture matrix runner
│   └── cheng_claim_audit_m9017.ts               pobj dispatcher claim-site static audit
├── fixtures/
│   └── ignition/                                golden fixture library + matrix.json (see "Ignition fixture matrix" below)
└── test/                                       hardening-item harness (RSS cap, timeout orphan-kill, stale-facts warning, line-map sidecar)
```

## Ignition fixture matrix

`fixtures/ignition/` is the productized, checked-in home for the "ignition determinism
loop" fixtures (previously scattered across `/tmp/*` and lost on every reboot). `matrix.json`
pins each fixture's contracted expectation (`expectRc` / `expectStdout` / `golden` byte-exact
comparison / `expectCompileBail` for fixtures whose current honest contract is a diagnosed
`ZC_NOT_READY` rejection) plus tags (`family:*`, `kind:*`) and five `planned:true` coverage-gap
placeholders (ctor positional real-emit, global-init str field, assign/argpos/return-position
constructor bugs `707`/`44`/`801`). Run it with `cheng_shape_matrix`.

Known blocker: `g45.cheng` (from `/tmp/f23/repro42/`) does not exist anywhere on disk and could
not be copied into the fixture library — recorded here rather than fabricated.

## Notes on what changed vs. the source repo

- **zod**: the source repo vendors a bundled/renamed copy of zod 4's internals (`vendor/m222.ts` re-exporting `m219`/`m211`/etc.). This package uses the real `zod` npm package (`^4.4.3`) instead — verified to expose an identical top-level API for everything actually used (`strictObject`, `enum`, `string`, `number().int().positive()`, `.optional()`, `.describe()`, `.safeParse()`, `.toJSONSchema()`).
- **Tool registry**: the source repo's server filtered `cheng_*` tools out of claude-code's full builtin tool registry (1000+ lines, dozens of unrelated tools). This package registers the 8 `cheng_*` tools directly in `cheng_fusion_tool_registry.ts`, in the same order and with the same init-call sequence as the original registry.
- **`withDefaultToolDefinitionBehavior`**: copied verbatim (12 lines, `tool_definition_lookup_and_defaults_m2929.ts`) — small enough that a minimal reimplementation wasn't warranted.
- **Excluded**: `cheng_fusion_hooks_m9011.ts` (claude-code session/BashTool integration hooks) is not part of this package; it only makes sense inside claude-code's own process, not a standalone MCP server.
