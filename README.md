# cheng-fusion-mcp

Standalone Cheng compiler diagnostic toolkit. The same validated registry, schemas, validation and execution path are exposed through MCP stdio JSON-RPC and a headless CLI. The registry exports its actual unique names, count and identity hash instead of a hand-maintained count. Runs on [bun](https://bun.sh).

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
/Users/lbcheng/cheng-fusion/install.sh --doctor   # registers, then runs all health checks
```

Real installs take a cooperative exclusive transaction lock, preserve the prior mode and unrelated keys, hard-link an exact backup, then fsync and atomically rename the new config. A concurrent install or non-object configuration fails without changing the file. The config path itself must be a regular file; symlinks are rejected so an atomic rename cannot silently replace a dotfiles link instead of its target.

## Headless CLI

The CLI is the reliable entry point for automation, subagents and isolated clones that do not inherit an MCP connection:

```sh
bun /Users/lbcheng/cheng-fusion/cli.ts list
bun /Users/lbcheng/cheng-fusion/cli.ts run cheng_crash_triage --input '{"stderr":"panic at sample.cheng:12"}'
bun /Users/lbcheng/cheng-fusion/cli.ts run cheng_csg_query --root /absolute/cheng-project --cwd /absolute/cheng-project --input '{"kind":"symbol","name":"main","source":"src/main.cheng","entrySource":"src/main.cheng"}'
printf '%s\n' '{"stderr":"panic"}' | bun /Users/lbcheng/cheng-fusion/cli.ts run cheng_crash_triage --input -
bun /Users/lbcheng/cheng-fusion/cli.ts doctor
```

`list` and `run` invoke the same `handleMcpRequest` path as MCP. `--root` and `--cwd` are request-local and canonicalized; existing project inputs are checked by real target, and prospective outputs reject escaping/symlink ancestors. Each root-dependent MCP call consumes its own `roots/list` snapshot, while empty/error responses clear stale state. `doctor` starts the real `index.ts`, performs `initialize → tools/list`, verifies every top-level input schema is an object, checks the backend/stage3/LSP executables and macOS signatures, and completes a real minimal LSP initialize handshake. Failures are structured JSON and return nonzero.

The repeatable production-path integration entry is `bun run test`; it uses checked-in or runtime-created fixtures, includes the real LLDB watchpoint test, and requires the configured real Cheng toolchain. Each child has a process-group timeout (`CHENG_FUSION_SUITE_TEST_TIMEOUT_MS`, default 180000 ms). Historical `/tmp`-dependent observational tests are excluded from this gate. `bun run test:item11` remains available for running the LLDB gate alone.

## Tools

| Tool | Mutating | Purpose |
|---|---|---|
| `cheng_csg_query` | no | Query one exact committed CSG source/entry generation: symbol declarations, inbound references, outbound calls. Source or entry mismatch hard-fails; stale facts are never returned. |
| `cheng_evidence` | no | Cross-module refactor blast-radius evidence (impact radius, cross-module callers) from CSG facts. |
| `cheng_csg_roundtrip` | yes | Emit a required `entrySource` package closure for an explicit query `source`, verify cold-reader consumption, atomically commit one content-addressed generation, and refresh non-authoritative `current.*` projections. |
| `cheng_crash_triage` | yes* | Parse Cheng compiler/runtime stderr, or execute an explicitly supplied binary under LLDB for live triage. The conservative MCP annotation is mutating because the debuggee may have side effects. |
| `cheng_line_map_read` | no | Deterministically parse top-level `fn`/`iterator` signature, body, and end spans from the current `.cheng` bytes; an existing line-map is parsed only when that `.map` file is passed explicitly. |
| `cheng_lsp_query` | no | Direct pass-through to the single explicit/default `cheng-lsp` binary: hover, definition, references, diagnostics, rename, codeAction, etc. Missing, non-executable, dead, or non-canonical binaries fail with the exact path; PATH lookup and alternate-binary fallback are forbidden. |
| `cheng_profile_report` | yes | Build or select the canonical backend driver through `build-backend-driver`, bind it to the exact current source tree, map, provenance, compiler source-manifest and binary hashes, then probe the real `profile-run`/`profile-report` producer contract. `run` publishes an exact `cheng_profile_raw` plus a hash-bound receipt; `report` rejects every raw profile not carrying that matching receipt. Stage3 is builder-only and never becomes the profiling driver. Missing compiler instrumentation is an explicit CFAIL, never a timing/RSS substitute. |
| `cheng_symbol_diff` | no | Compare defined and undefined symbol sets. For thin Mach-O objects, Darwin branch relocations are mapped to a unique global-`T` owner interval; local `t`, aliases and out-of-range sites remain explicit `unresolved-owner`. Executables/fat objects are rejected for caller attribution. |
| `cheng_exec_diff` | yes | Two-driver differential method using raw stdout bytes. Completed runs report `identical`/`semantic_divergence`/`both_fail`; `compile_wall` additionally requires the complete rc=2 `ZC_NOT_READY` protocol. Timeout, output overflow, invalid executable materialization, or missing raw bytes report `CFAIL`. Output uses the canonical `cheng_exec_diff` schema. |
| `cheng_template_leak_audit` | no | Scan a `.primary.o` for `__L<line>`-mangled generic functions still carrying a bare unbound type parameter in return/param position (template monomorphization leak), and count real BL call edges via `objdump -r` to classify `live_leak` vs `dead_weight`. Golden invariant: `liveLeakCount` should be 0. |
| `cheng_zc_census` | yes | Run the canonical whole-tree `ZC_NOT_READY` census and return exact missing-function/bail records instead of parsing logs by hand. Output uses the canonical `cheng_zc_census` schema. |
| `cheng_corrupt_hunt` | yes* | Execute a binary twice under LLDB for two-stage watchpoint localization. Stage 1 uses the target breakpoint's ignore count for `breakpointSkip`; stage 2 accepts only the exact created watchpoint ID. Signals/other stops and failed memory reads are hard errors. |
| `cheng_shape_matrix` | yes | Run all 111 checked-in ignition contracts under one driver, including exact runtime/stdout/golden, `expectCompileRc`, and honest compile-bail contracts. Contract groups are preflight-exclusive; timeout/materialization contradictions cannot be GREEN. Output uses the canonical `cheng_shape_matrix` schema. |
| `cheng_fixture_matrix` | yes | Run the full explicit `drivers[] × fixtures[]` compile/run product. Preflight requires a real Cheng root and unique canonical driver/`.cheng` paths plus bidirectional/`*_true` mirror contracts; every cell and pair receives a GREEN/RED verdict in the canonical `cheng_fixture_matrix` schema. |
| `cheng_addr_symbolicate` | no | Resolve a runtime address against an explicit executable/object pair, using Mach-O symbols and a bounded instruction window. It is rootless and read-only; missing, ambiguous or out-of-range ownership remains explicit in the canonical `cheng_addr_symbolicate` schema. |
| `cheng_tree_quiesce_probe` | no | Verify one deterministic byte-stable freeze window over explicit Cheng source scopes before current-source receipts, driver bakes or production regalloc evidence are generated; every file that breaks the window is reported exactly. |
| `cheng_driver_frontier_probe` | yes | Bind one run to both the cold-seed include closure and the entry Cheng import closure (exact member bytes and import edges); any pre/post drift hard-fails as untrusted and returns no consumable frontier. |
| `cheng_memory_release_gate_audit` | no | Verify the unique current production memory-release manifest by replaying complete Linux cgroup-v2 evidence at `memory.max=1073741824` and `memory.swap.max=0`, then requiring real AArch64/x86-64 primary/backend2 success and failure receipts with physical storage release, ledger `live=0`, and ORC `alloc==free/live=0`; missing official drivers or evidence are RED. |
| `cheng_regalloc_preflight` | yes | Two-layer regalloc gate. `source` exact-hash binds the 2026-06-03 complete formal grammar block, the `expression`→`iteratorLiteral` slice, bool/char definitions, the precedence table and conditional-semantics section; it verifies 95 independent expression families plus 69 explicitly selected leaf alternatives. The mechanical EBNF manifest emits stable production/choice/optional/repetition/feasible-pairwise/associativity/precedence IDs with ancestor activation guards: 34 productions currently yield 460 required obligations, while 178 impossible cross-branch combinations are excluded by a deterministic structural proof hash. All eleven external nonterminals are definition-bound (eight grammar/literal plus three lexical-terminal definitions pinned by `cheng_formal_lexical_terminal_definitions.v1`). The ledger's 23 direct IDs are declarations only, with zero parser/IR execution witnesses; thirteen definition-only bindings are satisfied and 447 obligations remain explicit UNPROVEN gaps. The admitted `spaceCall` EBNF versus fixed `CHENG_STRICT_CALL_SYNTAX=1` rejection is resolved by the exact-hash-pinned formal exclusion clause (`cheng_formal_spacecall_exclusion.v1`, spec §1.3.5), not disguised as coverage. Every Cheng compile reports one hashed strict/serial/no-cache/no-handoff profile with experimental producer flags unset. A dedicated `monotimes.MonoTimeNs(monotimes.GetMonoTime())` execution witness requires both qualified calls to bind their exact canonical declarations and proves the `MonoTime` inner-return → outer-parameter edge; deleting or mis-typing either declaration is RED. Fusion-owned ABI/address/reloc, packed-slab O2/sanitizer and `cold_bodyir_memory_manifest.v1` checks remain mandatory. The source snapshot treats nine parser/TypedExpr/lowering/primary/backend2 files as minimum roots, requires `backend2_pipeline.cheng` as an authority root, recursively binds their real import closure, and unions every hash-verified v2 source-manifest path for release; the same union is used by the final identity recheck. Source-wide gates scan identifier and backtick-operator bodies, ordinary/triple strings, and executable `Fmt` interpolations with escaped/doubled braces, nested braces, quotes, chars and block comments; malformed interpolation is RED, while every operator declaration is a conservative forbidden-reachability root. The reported call reachability is explicitly a bounded syntactic model, not compiler-resolved authority; the long-term authority is a compiler-produced structured call manifest bound to the exact source CID. Function-boundary token gates reject direct backend `buildIndex`/internal-chain reads, canonical named-field bypass, ownerless/owner-leaf and cold-CSG field/layout fallbacks, caller-source callee-owner substitution, guessed eight-byte ABI widths, non-unique exact-owner selection, TypedExpr call-argument source recovery, fixed metadata text caps, DAG worklist caps, and arbitrary numeric recursion/scan/cardinality/fixed-point limits; physical ABI-register, encoding-width, integer-width, hash-bucket and resource-wave contracts are explicitly excluded. `BodyIR.entryIsCAbi` is schema-bound to backend2 codec version 4/field-count 7, exact tag/size/boolean encode+decode, and encode→decode→re-encode byte equality. The AArch64 adapter additionally emits exactly one proof-or-violation row for each F64 boundary family. F64 must remain Stack class; importc/F64 is accepted only with a complete class-aware AAPCS64 GPR/FPR/overflow-stack bridge, otherwise it must fail closed before recipe emission. Exported-entry F64 parameters also fail closed before emission while F64 returns remain admitted through D0. The exact-hash-pinned native AArch64 gate then requires six independent 1 GiB process-tree-guarded stages, 30 NaN and 18 finite comparisons, five cases across the three local/field/indexed store families, zero raw-image relocations, and a separate global-store oracle proving consecutive same-symbol PAGE21/PAGEOFF12 relocations. The remaining families require the canonical condition mapping (`Eq/Ne/Lt/Le/Gt/Ge` → `EQ/NE/MI/LS/GT/GE`) mirrored against primary and backend2, `localStackOffsets` bound to the exact `parameterHomeOffsets` value written by the prologue and recorded by its ingress receipt, and call-result/return `D0↔X0` bridges. The x86-64 rows bind exact checked `×2/4/8/14/16`, byte-count prediction, maximum displacement proof, source/target range admission, checked 1/4/8-byte cursor advance, every fixed/base/store byte-count composition, aggregate-parameter pointer precedence, arbitrary-byte CopySlot/indexed/sret paths, and the post-padding int32 word-count bound; direct wrapping multiplication/addition or a restored `%4` gate is RED. Its F64 boundary fixes every return in XMM0, bridges call results `XMM0→RAX` before stack homing, rejects importc and exported-entry F64 arguments before planning/fill, admits exported F64 returns through XMM0, and binds the exact five-byte encodings plus size predictors. The live integration test never requires an old violation count to remain: all 95 expression cases still execute, genuine fixes may monotonically reduce RED rows, while skipped cases, false GREEN, unexplained RED, nested CFAIL, or source/driver identity drift fail the test. TypedExpr field/layout row APIs must reject empty owners and ambiguous/missing rows without global indexes. Only exact-hash-bound producer source loaders are allowed; manifest files expand the graph universe but never become authority roots. The exact bootstrap C include closure and projection build/schema/digest/live-bytes/release/materialize/expected-row closure stay fail-closed. m9023/m9024 now add a required bounded semantic layer: 1,584 legal base cases join 2,520 profiles into 3,991,680 assignments, two independent classifiers agree on all assignments, 285,336 are legal, and 2,926 deterministic matrix cases materialize 1,584 base plus 2,919 accepted-profile Cheng bundles. m9025 runs this structural proof in a private Bun child under the exact 1 GiB process-tree guard and binds the formal spec, 1,117/959 grammar obligations, private source set, driver, Bun, guard and actual toolchain manifest; the parent independently recomputes its canonical receipt. Parser-span evidence and compiler-owned source-bound TypedExpr→CSG/lowering→primary/backend2→both-regalloc receipts are separate required RED checks until real producer receipts exist. `release` additionally requires exact GEN2/GEN3/official raw identity, official/baseline manifests and four external locks before any heavy child; it claims a caller-owned empty `releaseWorkRoot`, copies every executable into private O_EXCL/O_NOFOLLOW snapshots, guards every release-critical child, retains success/failure evidence there, and independently binds the v5 report, all declared guard-v4 process trees, the fixed current workload v6 receipt, its v3 frozen plan, v4 ledger and output object. Its stage-one one-shot worker is built and run with a private Bun; only the second private finalizer may freeze the recursive release-artifact manifest after the outer worker guard closes. `SOURCE_GREEN` and `RELEASE_GREEN` cover the declared regalloc release scope only. The older formal-obligation and compiler-profile rows remain honest research diagnostics, but the new parser/seven-stage receipt checks are release-required and cannot be downgraded to diagnostics; any required RED/CFAIL makes automation exit nonzero. |
| `cheng_semantic_snapshot_audit` | yes | Root-required semantic snapshot audit. `atomic_publish` independently stable-reads and hashes the core/production/builder/CompilerCSG/LSP sources, parser declaration producer/receipt, schema/cargo/validator/CompilerFact dependencies, complete local cold-compiler include closure, three smokes, three gates, process-tree guard and compilers; it proves scalar-only terminal commits, exact reclaim and terminal rejection, then runs the real gates under exact 1 GiB process-tree guards. `production_closure` additionally requires Reference `ownerSymbolIds` and exact owner/source/function/target-kind/builder-remap/cargo/CompilerFact/LSP bindings, rejecting text or name+arity identity. `runPublishedCandidate=true` with `timeoutSeconds>=1230` executes the current hash-bound multi-file acceptance gate and only closes publication evidence when its real `published=1` receipt is combined with the statically proved `missingFactBitmap=0` commit route; source literals cannot manufacture evidence. Every input generation is rechecked before one domain-separated `auditCid` is published. |
| `cheng_cid_identity_chain_audit` | no | Rootless production verifier for one absolute canonical `evidence.json`. It stable-reads every bound raw artifact; enforces borrowed link-plan/source-payload validation, structural-only compact receipt capture, one exact import rebuild reused by the source-bundle producer, import-only streaming scans, index-only source ordering without a second full text sequence, per-row canonical source-path/module identity proof with exact domain routing, parser-owned binding initializer anchor-token/declaration-row identity through receipt hash, snapshot remap, schema, cargo and validator, exact-preimage two-part streaming SHA-256 with fixed state/tail/schedule storage, and fine-grained memory-trace calls bound to their output allowlist; line-prefix/name/line-number declaration reconstruction is rejected. It recomputes source/tool/image/candidate identities; verifies the exact 1 GiB candidate build, aggregate-OOM counterexample and six independent case receipts; then replays all destructive and identity-preserving mutations. It returns `CID_GREEN_CANDIDATE` only when the complete chain is proven. |
| `cheng_claim_audit` | no | Diagnostic-only static text audit of `primary_object_plan.cheng`'s statement-claim sites (`PrimaryBodyIrNodeEvalOnlyOwn(` calls, `localInitialized = true` assignments, `continue` inside statement-dispatch loops found by indentation backtrack), classified `EMITS`/`POISONS`/`SILENT_RISK` by regex-scanning nearby context for emission/poison evidence. Candidates for human review, not verdicts — never a sufficient condition on its own to delete a text-path fallback. Output uses the canonical `cheng_claim_audit` schema. |
| `cheng_ignition_chain` | yes | Start/poll the journaled DRV→probes→GEN2→terminal/oracle→optional GEN3 chain. `baseTree+revertCommits` runs exact reverse patches in a realpath-isolated clone. OS lock state proves liveness; provenance drift and GEN3 failures abort explicitly; the permanent claim, sole journal `done` and atomic non-overwriting `done.json` must match. `status` with `depositEvidence:true` on a consistently completed run deposits the run's evidence into the checked-in `evidence/` store (idempotent `evidence_deposit.py`) and immediately re-verifies it with `evidence_verify.py`; either failure is a hard error. |
| `cheng_residual_peel` | yes* | One-shot residual peel board for ZC/Pass B: `mode=static` (default) runs second-scale shape rules (`freeSeq` multi-overload, multi-stmt `;…; break`, V2FastBuild same-name) from the canonical `cheng_residual_rules` input in `fixtures/residual_rules.json`; `mode=full` adds canonical `tools/zc_enumerate.sh` census. Returns the canonical `cheng_residual_peel` report with `static.hits`, optional `census`, phase-ordered `attackOrder`, and `maskedRisk` (deeper-phase static hits likely hidden until call-resolve clears). Static = leads not verdicts; only census may claim `zc_missing_function_count`. \*Mutating flag set because `mode=full` spawns a heavy driver; prefer `static` under load. |
| `cheng_orphan_slot_scan` | no | Disassembles `objPath` via `otool -tv`, selects the function matching `fnFilter`, and reports explicit `[sp,#offset]` loads whose full byte range has no explicit `str`/`stur`/`stp` coverage in that function. Pair stride follows register width (`w/s=4`, `x/d=8`, `q=16`) and implicit-zero-offset `stp`/`ldp` is supported. Computed-pointer/callee writes and control flow are outside this scan, so results are candidates, never a GOOD/BAD correctness verdict; `wOnly` only selects 32-bit priority candidates. Output uses the canonical `cheng_orphan_slot_scan` schema. |

The AArch64 F64 native gate also pins the anti-false-green data path: poison D0 before the raw call, require a real `BL`, poison D0 again after return, bridge X0 back to D0, reject outputs equal to either input, and execute `StoreLocal → F64Add → X0`. Replacing that call/return bridge with the old tail branch is RED.

The x86-64 F64 production-emitter gate is equally mandatory and exact-hash pinned. It runs six independent guard-v4 stages at exactly 1 GiB, proves Rosetta availability and executes the final x86-64 binary through `/usr/bin/arch -x86_64`, emits six materialized plus six fused compare functions with zero raw relocations, checks `ucomisd`/`setp`/`setnp` in the linked image, and executes 60 NaN plus 72 finite comparisons. The ABI bridge must move XMM0/XMM1 to RDI/RSI, poison EAX before a real call, restore stack alignment, and apply the observable `0x5a5a5a5a` result transform; changing the Rosetta path, fused image, bridge transform, counts, or disassembly markers is RED.

All tools except `cheng_crash_triage`, `cheng_corrupt_hunt`, `cheng_shape_matrix`, `cheng_fixture_matrix`, `cheng_addr_symbolicate`, `cheng_regalloc_preflight`, `cheng_claim_audit`, `cheng_ignition_chain`, `cheng_orphan_slot_scan` and `cheng_cid_identity_chain_audit` require an active Cheng project root (a directory containing `cheng-package.toml`). MCP workspace roots and CLI `--root`/`--cwd` are invocation-local context; when the client declares no workspace roots, an explicit `root` argument that passes the `cheng-package.toml` check is itself a valid authorization (declared roots, when present, still bound the call). Rootless tools instead require their own explicit absolute driver/tree/object/evidence paths.

## Environment knobs

| Variable | Default | Effect |
|---|---|---|
| `CHENG_FUSION_RSS_CAP` | `1073741824` (1 GiB) | Overrides `CHENG_PROCESS_MAX_RSS_BYTES` for toolkit-spawned Cheng processes. `cheng_ignition_chain` is intentionally separate and uses its explicit `rssCapBytes`/`gen3RssCapBytes` contract (default 12 GiB). `cheng-lsp` does not consume the RSS variable; timeout/group-kill is its bound. |
| `CHENG_FUSION_TIMEOUT_MS` | tool-specific (15s for LSP requests, 120s for driver runs) | Overrides toolkit process timeouts. On timeout the whole subprocess group is `SIGKILL`ed. The background ignition chain owns explicit per-stage timeouts in its generated journaled runner. |
| `CHENG_TOOLCHAIN_ROOT` / `CHENG_ROOT` | `/Users/lbcheng/cheng-lang` | Default Cheng toolchain root used to locate the backend driver, stage3 driver, and cheng-lsp fallback path. |
| `CHENG_DRIVER` | `$CHENG_TOOLCHAIN_ROOT/artifacts/backend_driver/cheng` | Explicit override for the backend driver binary. For `cheng_profile_report` it must still resolve to the selected project’s canonical `artifacts/backend_driver/cheng`; an arbitrary/stage3/vendor binary is rejected. |
| `CHENG_STAGE3_DRIVER` | `$CHENG_TOOLCHAIN_ROOT/artifacts/bootstrap/cheng.stage3` | Explicit override for the stage3 self-hosted driver. `cheng_profile_report` may use it only to invoke the official `build-backend-driver` flow. |
| `CHENG_LSP_PATH` | resolved via `which cheng-lsp`, else `$CHENG_TOOLCHAIN_ROOT/artifacts/cheng-lsp` | Explicit override for the `cheng-lsp` binary. |
| `CHENG_COLD_DRIVER` | — | Explicit absolute driver override for `cheng_csg_roundtrip`; it also requires the exact absolute `CHENG_COLD_DRIVER_RECEIPT` and never falls back. |
| `CHENG_FUSION_VENDOR_COLD_DRIVER` | `vendor/cold-driver/cheng_cold_csg9` (this package) | Default compatible CSG driver. It is the only implicit fallback, so a stale main-repo driver binary cannot silently emit the pre-kind-9 schema. |
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
| `cheng_lsp_query` | **not bounded by this cap at all** — see below | `cheng_line_map_read` is now in-process and does not launch LSP. |

**Important finding, unrelated to the cap value itself:** querying `cheng-lsp` (`documentSymbol` or the internal `cheng/lineMap` request) against a real project file (`lowering_plan.cheng`) reproducibly grows RSS at ~2.4 GB/s, unbounded, until `CHENG_FUSION_TIMEOUT_MS` (default 15s) kills the process tree at 15–27 GB. The same query against the tiny canary file is instant and ~6 MB. `cheng-lsp` never reads `CHENG_PROCESS_MAX_RSS_BYTES` (verified: no reference in `lsp_server.cheng`/`lsp_entry.cheng`/`lsp_protocol.cheng`), so raising or lowering `CHENG_FUSION_RSS_CAP` has **zero effect** on this leak — only the timeout bounds it. This looks like a real memory leak in `cheng-lsp`'s project-wide symbol resolution and is out of scope for this change; flagging for a separate fix.

Sizing: max confirmed cap-governed peak = 66.6 MB (`typed_expr.cheng` writer). `1073741824` (1 GiB) gives ~16x headroom over that, replacing the old 12 GiB (which gave ~193x headroom — not a meaningful circuit breaker).

## Vendor cold driver (CSG kind=9 call edges)

CSG record kind=9 (intra-object call-edge facts) writer/reader support is
upstream in the main repo's `bootstrap/cheng_cold.c` since 2026-07-22
(agent-19 lane2, including the edge-target `strip=false` fix); the formerly
vendored `csg-writer-call-edges.patch` was dropped once the main repo carried
it. Without kind=9, `cheng_csg_query kind=references` only sees cross-object
calls (kind=6 relocs); intra-file calls (the common case) are invisible.

`vendor/cold-driver/` still builds a fusion-local cold driver binary so the
roundtrip contract does not depend on the main repo's *binaries* being fresh:
it compiles a **copy** of `$CHENG_TOOLCHAIN_ROOT/bootstrap/cheng_cold.c`
(plus its `#include`d siblings) with
`vendor/cold-driver/patches/print-symbols-symbol-list.patch` applied (the
fusion `cheng_symbols` list-form contract, which upstream deliberately
does not carry). This never touches the main repo's source tree, artifacts,
or seeds.

```sh
/Users/lbcheng/cheng-fusion/vendor/cold-driver/build.sh
```

Rebuild whenever the main repo's `bootstrap/cheng_cold.c` changes upstream, or
the vendored patch is updated. Outputs:
`vendor/cold-driver/cheng_cold_csg9` and its hash-bound
`cheng_cold_csg9.receipt` plus the exact source-closure manifest. The build
rejects source/tool drift, fixes the C compiler to `/usr/bin/cc`, binds the
current CSG contract, compiler and running Bun path/hash/version, and requires
two different-inode links to have identical raw bytes before installing the
driver. The binary is gitignored and rebuilt on demand. `cheng_csg_roundtrip`
picks it up automatically once built — no env var required (see the
driver-priority table above); an explicit driver is accepted only with its
exact receipt. If neither exists, `cheng_csg_roundtrip` hard-fails.

## Layout

```
cheng-fusion/
├── index.ts                                  entry point (equivalent to the source repo's 3-line shim)
├── cli.ts                                    headless list/run/doctor entry point
├── package.json                               name=cheng-fusion-mcp, bun, zod dependency
├── install.sh                                  idempotent ~/.claude.json registration
├── vendor/
│   └── cold-driver/
│       ├── build.sh                            builds cheng_cold_csg9 from a patched copy of upstream cheng_cold.c
│       ├── patches/print-symbols-symbol-list.patch  fusion cheng_symbols list-form contract patch
│       └── cheng_cold_csg9                      built binary (gitignored, run build.sh to produce)
├── src/
│   ├── runtime.ts                              tiny lazy-module-init helper (copied verbatim)
│   ├── cheng_csg_current_contract.ts            unique current summary/identity/generation contract
│   ├── tool_definition_lookup_and_defaults_m2929.ts
│   ├── cheng_toolkit_m9000.ts                  shared toolkit: project-root resolution, CSG facts parsing, driver spawning, cheng-lsp client
│   ├── cheng_fusion_tool_registry.ts           validated registry with derived unique-name manifest
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
│   ├── cheng_zc_census_m9014.ts
│   ├── cheng_corrupt_hunt_m9015.ts
│   ├── cheng_shape_matrix_m9016.ts              golden ignition fixture matrix runner
│   ├── cheng_claim_audit_m9017.ts               pobj dispatcher claim-site static audit
│   ├── cheng_ignition_chain_m9018.ts            detached journaled generation chain + ablation
│   ├── cheng_residual_peel_m9019.ts
│   ├── cheng_orphan_slot_scan_m9020.ts
│   ├── cheng_fixture_matrix_m9021.ts             multi-driver × fixture contract matrix
│   ├── cheng_addr_symbolicate_m9021.ts            executable/object address resolver
│   ├── cheng_regalloc_preflight_m9022.ts         strict source/release regalloc gate and two-stage publisher
│   ├── cheng_semantic_matrix_m9023.ts            bounded base semantic model and independent classifier
│   ├── cheng_semantic_pipeline_matrix_m9024.ts   grammar/profile join and deterministic Cheng materializer
│   ├── cheng_semantic_pipeline_gate_m9025.ts     exact-1-GiB private-child structural receipt gate
│   └── cheng_semantic_snapshot_audit.ts          atomic snapshot structure, input and guarded-gate audit
├── fixtures/
│   ├── ignition/                                golden fixture library + matrix.json (see "Ignition fixture matrix" below)
│   └── regalloc_preflight/                      Fusion-owned Cheng and real cheng_cold.c contracts
└── test/                                       production-path integration and end-to-end harnesses
```

## Ignition fixture matrix

`fixtures/ignition/` is the productized, checked-in home for the "ignition determinism
loop" fixtures (previously scattered across `/tmp/*` and lost on every reboot). `matrix.json`
pins 111 unique, runnable contracts: `expectRc` / `expectStdout` / byte-exact `golden` /
`expectCompileRc` / diagnosed `expectCompileBail`, plus `family:*` and `kind:*` tags.
There are no `planned:true` placeholders or split staging manifests. Run the canonical library
with `cheng_shape_matrix`; use `cheng_fixture_matrix` for an explicit multi-driver subset.

`expectStdout` is the exact UTF-8 byte sequence encoded by the JSON string; trailing spaces and
newlines are significant, exactly as they are for `golden`. `expectCompileBail` is GREEN only for
the evidenced rejection protocol: exit code 2, exact `ZC_NOT_READY` records, one final
`ZC_NOT_READY_TOTAL`, matching count/denominators, unique continuous zero-based indices, and the
contracted bail on every record. The whole matrix is preflighted before `filterTag` is applied.

Known blocker: `g45.cheng` (from `/tmp/f23/repro42/`) does not exist anywhere on disk and could
not be copied into the fixture library — recorded here rather than fabricated.

## Notes on what changed vs. the source repo

- **zod**: the source repo vendors a bundled/renamed copy of zod 4's internals (`vendor/m222.ts` re-exporting `m219`/`m211`/etc.). This package uses the real `zod` npm package (`^4.4.3`) instead — verified to expose an identical top-level API for everything actually used (`strictObject`, `enum`, `string`, `number().int().positive()`, `.optional()`, `.describe()`, `.safeParse()`, `.toJSONSchema()`).
- **Tool registry**: the source repo's server filtered `cheng_*` tools out of claude-code's full builtin tool registry. This package registers its Cheng tools directly in `cheng_fusion_tool_registry.ts`; initialization rejects invalid or duplicate names and exports the actual sorted-name count and SHA-256 manifest consumed by the MCP/CLI tests.
- **`withDefaultToolDefinitionBehavior`**: copied verbatim (12 lines, `tool_definition_lookup_and_defaults_m2929.ts`) — small enough that a minimal reimplementation wasn't warranted.
- **Excluded**: `cheng_fusion_hooks_m9011.ts` (claude-code session/BashTool integration hooks) is not part of this package; it only makes sense inside claude-code's own process, not a standalone MCP server.
