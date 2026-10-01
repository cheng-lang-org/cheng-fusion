# tools/

Battle-tool sediment: each script here replaced a manual step that was
repeated at least twice in a live campaign (per the "重复第二次即工具化信号"
house rule). One section per tool -- purpose, one-line usage, and the
incident/lesson that produced it.

## tree_guard.sh

**Purpose**: snapshot a shared/multi-session working tree (git porcelain +
sha256 manifest of `src/`) before a long chain run, then verify it hasn't
drifted before trusting that chain's verdict.

**Usage**:
```
tree_guard.sh snapshot <tree>   # write <tree>/.tree_guard_manifest
tree_guard.sh verify <tree>     # compare current state to the manifest;
                                # prints the drifted file list and exits 1
                                # on any mismatch
```

**Lesson**: chain28/chain29 both ran ~30-minute cold bakes against a shared
tree that a concurrent session silently mutated mid-bake; both chains'
final verdicts were read against a tree that no longer matched what was
actually baked, wasting both burns. `verify` before trusting any judgement
read off a shared tree. Pre-run complement (2026-07-27, same incident
recurring): run `cheng_tree_quiesce_probe` before any frontier/chain burn,
and when `cheng_driver_frontier_probe` returns
`entrySourceClosureTrusted=false changed=<file>`, that file is under an
active concurrent editor -- coordinate the file mutex or use
`waitQuietSeconds`; blind retry just burns the same window again.

## zc_census_diff.sh

**Purpose**: A/B bail-signature diff between two `backend_driver` binaries
against the same source file -- one shot instead of eyeballing two
`tools/zc_enumerate.sh` runs by hand.

**Usage**:
```
zc_census_diff.sh <root> <driverA> <driverB> <source.cheng>
```

**Lesson**: this campaign's three-generation DRV comparisons (chain24
defective vs chain30 fixed) were diffed by hand three separate times to
answer "did the patch introduce or heal any not_ready function." Verified
against `src/core/runtime/program_support_backend.cheng`: chain24 (d1e8177)
gives zero missing functions, chain30 (T52 v3.1 fix) introduces exactly one
-- `cheng_epoch_time_export` (`bail=801`), an unrelated pre-existing gap the
fix's own build newly surfaces on this file, not a regression from the T52
patch itself.

## run_ignition_probes.sh

**Purpose**: compile+run the ignition fixture battery against one driver,
PASS/FAIL each against its recorded expected exit code.

**Usage**:
```
run_ignition_probes.sh <driver> <root> [manifest.json]
```
Default manifest (no `manifest.json` arg) is the 11 probes this tool was
originally speced against (adv6_int32_boundary, enumadd_probe,
alias_regress_base, f47_probe_two_globals, a2_strimmvalue_offdesync,
b3_global_str_regress, formB_ok_hoist_struct_misread, g4_bareptr_or_store,
f4_str_nested_call_arg, triv_station, vardecl5_station) plus the 5
T52-family fixtures landed in the same batch as this tool -- 16 total.

**Lesson**: `adv6_int32_boundary.cheng` lives one directory down
(`fixtures/ignition/adversarial/`) from every other default probe; a
hand-written loop over `fixtures/ignition/*.cheng` silently skips it (or,
with a too-greedy glob, drags in `battery_out/` debris). Also tripped zsh
word-splitting on the `--root:X` / `--in:X` colon-flag style used by
`system-link-exec` when building the command line by naive concatenation.
Verified: 16/16 PASS against the T52-fixed driver
(`chain30/ignite_20260715T0112/DRV`); 14/16 PASS (t52a/t52b correctly FAIL)
against the pre-fix driver (`chain24/ignite_20260714T1600/DRV`, d1e8177) --
confirms the tool actually catches the regression it is meant to catch, not
just reports numbers.

## chain_journal.sh

**Purpose**: pretty-print an ignition-chain `journal.jsonl` -- one block per
stage (drvBake/probes/gen2Bake/terminal/oracle/done) with rc/zc/passCount/
per-case breakdown/verdict.

**Usage**:
```
chain_journal.sh <journal.jsonl>
```

**Lesson**: the same `python3 -c "import json; ..."` projection was
hand-typed from scratch 7 times in one session for status updates. A field
absent from a given stage's record (e.g. `probes` has no `zcTotal`) is
simply omitted from that stage's block, never fabricated as 0/null.

## lldb_syscall_probe.py

lldb command-script module for pairing entry/return breakpoints on a libc
syscall wrapper (waitpid, read, ...) and logging arg/return-value pairs.
Based on `scratchpad/t52v2/t52_probe2.py`, with the known "context keyed by
recyclable one-shot breakpoint ID" bug fixed (see the file's own header
comment for the full incident writeup: the original script's return
callback could read a stale, wrong call's arguments when a one-shot
breakpoint ID got reused on a hot polling loop -- silent mislabeling, not a
crash). Fixed by keying context on thread ID with a per-thread FIFO queue
instead. Load with:
```
lldb -o "command script import /path/to/lldb_syscall_probe.py" ...
```
See the module docstring for the full batch-mode invocation. Not run live
as part of this sedimentation pass (no live lldb session in scope); syntax
self-checked with `python3 -c "import ast; ast.parse(open(...).read())"`.

## cold_regression_ab.sh

Runs the upstream cold regression suite concurrently against baseline and patched compilers built from the same clean clone, then compares noise-masked results.

```
cold_regression_ab.sh <clone_root> <patch_file> [--heavy] [--jobs N] [--out DIR]
```

The clone must be either clean or contain exactly the supplied patch; the script verifies and restores that original state.

## gen2_symbolize.sh

Resolves one or more Cheng text offsets through a `primary.o` symbol table or an offset-bearing cold `.map`, without a new bake.

```
gen2_symbolize.sh <primary.o|cold.map> <text_offset> [more_offsets...]
```

For Mach-O objects, the script reads the single real `__TEXT,__text` section and builds
half-open intervals from every `T`/`t` boundary to the next boundary or section end. Only
one global `T` at an interval start may own it: a local `t` returns `NO_MATCH` with exit 2,
and same-address aliases return `ERROR AMBIGUOUS` with exit 3. Section-external offsets
also return exit 2, so the final symbol is never unbounded. A `.map` lookup first validates
the complete `cheng_line_map` stream: exact marker, matching `entry_count`, decimal source
lines, unique required `function_name`/`module_path`/`offset`/`size` fields, and positive sizes.
It then requires exactly one interval: zero matches return 2 and overlaps return 3. Target offsets
accept strict unsigned decimal (including `08`) or hexadecimal syntax and are parsed as
unbounded Python integers. Provider-region PCs must be resolved against the actual owner.

## seed_lint_check.sh

Rejects newly added function-local integer declarations with redundant explicit `= 0`, a source shape accepted by stage3 but rejected by the self-hosted driver.

```
seed_lint_check.sh <file.cheng|patch.diff> [...]
```

## cov_trace.py / cov_diff.sh

`cov_trace.py` records exact first-hit function coverage using LLDB-managed arm64 traps after byte-verifying the `primary.o → executable` text mapping. `cov_diff.sh` runs the same workload on two binaries and reports newly covered and lost functions.

```
cov_diff.sh <binA> <binB> <outdir> [--timeout SEC] [--objA a.primary.o] [--objB b.primary.o] -- <argv...>
```

Mapping failure, launch failure and unknown traps are hard errors; they never produce guessed coverage.

## macho_masked_cmp.py

Checks GEN3≡GEN2 byte identity after masking only Mach-O `LC_UUID` and `LC_CODE_SIGNATURE` payloads.

```
macho_masked_cmp.py <gen2> <gen3>
```

Every other byte must match.

## semantic_gen.py

Bounded semantic-combination fixture generator. Emits
`fixtures/semantic/<family>/s<seed>.cheng` plus an ignition-matrix-isomorphic
`fixtures/semantic/matrix.json` (one contract group per entry: runtime
`expectRc`, or `expectCompileRc` for diagnosed-rejection families), directly
runnable by `cheng_shape_matrix` via its `matrixPath` parameter.

```
semantic_gen.py --root /abs/cheng/tree [--out fixtures/semantic] [--seeds 3]
                [--families all|name,name] [--check]
```

Deterministic: own xorshift64* PRNG keyed by (family, seed); same arguments
always reproduce the same bytes (`--check` byte-verifies without writing).
Oracle values are computed by the generator from the constants it emits, never
hand-recorded. `--root` is mandatory and only lands in `matrix.json
defaultRoot` — regenerating with a different root changes nothing else, which
is the parameterization answer to the ignition matrix's pinned defaultRoot.

**Lesson**: the 2026-07-19 inventory (`diag_fusion_inventory/REPORT.md`) found
every ignition fixture was hand-curated from /tmp battle repros and the repo
had zero generators; the first generator covers the 2026-07-19 campaign forms
(str global call-RHS, slot-dominance dedup, narrow deref, ref-seq field,
aggregate-field str RHS, AddrOf scalar root, int32-shell shift) so the next
battle's repro variants are produced, not retyped. Calibration evidence and the
known pre-fix-driver divergences it reproduces: `diag_c1_semantic_gen/REPORT.md`.

## evidence_deposit.py

**Purpose**: deposit one finished ignition-chain run's release evidence out of
its ephemeral run workDir into the checked-in `evidence/<runId>/`, before the
workDir is cleaned and the evidence evaporates.

**Usage**:
```
evidence_deposit.py <runId> <runDir> [--evidence-dir DIR] [--force]
```
Copies `journal.jsonl`, the `done.json`/`completion.claim.json` sentinel pair
and the provenance record verbatim, projects per-stage verdict summaries into
`stages.json`, binds source-tree/seed/driver/GEN2/GEN3/fixture-manifest/
comparator/chain-tool/deposit-tool hashes plus the GEN3 masked-compare result
into `receipt.json`, re-hashes every deposited file into `manifest.json`, and
appends one entry to `evidence/index.json` (append-only: runId -> verdict +
hashes + ts). Everything is staged in a tmp sibling and committed by rename;
a runId already deposited is refused with exit 2 unless `--force`. Hard errors
(exit 1): runId mismatch, missing done/claim, done/claim byte mismatch, broken
journal structure, or a DRV/GEN2 binary whose current bytes no longer match
the hash the journal recorded at bake time. Exit 0 = deposited.

**Lesson**: the chain's provenance mechanism (inputManifestSha256, per-file
sha256 snapshots, atomic O_EXCL done sentinel) was already strict, but every
bit of it lived only in the run workDir -- three 2026-07-19/20 chains
(T045700/T210408/T004807, all ABORTED_GEN3_BAKE_FAILED) had their verdicts
recorded in session notes with no in-repo receipt to point at. Deposit right
after a chain finishes; the receipt is what the 2026-07-17 contract's
"completion manifest" audit can actually check in.

## evidence_verify.py

**Purpose**: post-deposit verifier for the checked-in evidence store (mutation-net
GAP-1 hardening). `evidence_deposit.py` validates a run workDir at deposit time;
nothing re-checked the deposited `evidence/<runId>/` payloads afterwards.

**Usage**:
```
evidence_verify.py [--evidence-dir DIR] [runId ...]
```
For every deposited run it re-checks, from the checked-in bytes alone: every
manifest.json file re-hashes (sha256+size) and the on-disk set is exactly
`manifest.files + manifest.json`; done.json == completion.claim.json byte-identical;
journal.jsonl starts with provenance and its final done verdict equals done.json's;
receipt.json shape (exact schema, runId == directory, enum-shaped verdict);
index.json entries consistent with each receipt hash block (verdict/lastStage/ts/
seed/tree/input-manifest/driver/gen2/gen3/masked-identical); provenance/input_manifest/
stages cross-checks; store-level two-way orphan scan (every index run has a directory,
every directory is indexed). Any mismatch exits 1; usage errors exit 2; with no
runId the whole store is verified.

**Lesson**: verified by a 7-case perturbation matrix (verdict flips on receipt and
index, file delete/add, done flip, orphan dir, ghost index entry) -- every tamper
is caught with an exact FAIL reason. item27 wires the two former GAP-1 mutants
(M-EVIDENCE-SEED-SWAP, M-EVIDENCE-VERDICT-DROP) onto this gate. Current full
item27 run is 27/29: both evidence mutants still return `evidence_verify rc=-1`;
the module-header and flat-zero corpus mutants are killed by their exact contract.

## seed_artifact_desymlink.sh

Replaces a symlink directory entry with a verified regular copy of its
resolved target: O_EXCL|O_NOFOLLOW same-directory temp staged with the
target's mode, sha256 re-verified, symlink+target inode/mtime/size drift
re-checked, atomic rename, parent fsync. Targets outside the entry's own
directory are refused outright -- the tool never follows the link for
writes and never mutates the target.

```
seed_artifact_desymlink.sh <canonical-absolute-dir-entry>
```

**Lesson**: Fusion audits (`cheng_semantic_snapshot_audit` compiler input,
regalloc preflight seed path) lstat every bound input and hard-reject
symlinks; `artifacts/bootstrap/cheng.stage3 -> cheng.stage3.bin` blocked the
snapshot audit twice (2026-07-26 probe round, 2026-07-27 production-closure
round). The inverse trap is documented in cheng-lang lessons.md: a plain
`cp --regen` over the symlink follows it and silently overwrites the target
bytes, polluting the baseline while leaving the symlink in place. The
verified stage3 bytes were already byte-identical to stage2 (fixed point),
so the honest fix is replacing the directory entry, not rebuilding and not
relaxing the audit. First executed by hand on 2026-07-27
(`cheng.stage3` sha256 026113bc..a2a2b preserved); toolized here on its
second manual occurrence, and the same trap was found and fixed through
this tool on `artifacts/backend_driver/cheng -> cheng.bin` the same day
(the seven-stage producer binds that path and would hit the same lstat
rejection).

## ebnf_parser_node_map_gen.ts

Regenerates `fixtures/semantic/ebnf_parser_node_map.json` from the live
`docs/cheng-formal-spec.md` + `src/core/lang/parser.cheng` + producer
claims, staging to a pid-suffixed sibling and renaming only after a
post-write source-closure drift re-read.

```
bun tools/ebnf_parser_node_map_gen.ts --prepare-current-unwitnessed
bun tools/ebnf_parser_node_map_gen.ts --official-current-build-binding <binding.kv>
```

**Lesson**: `cheng_regalloc_preflight` recomputes the map's producer
projection in-memory and compares it against the committed file; any
spec/parser edit since the last regen fails as "generated EBNF parser map
producer projection is not current" (hit 2026-07-27 after a formal-spec
touch). The fix is always the unwitnessed regen above -- never hand-editing
the JSON, which cannot survive the canonical-JSON comparison anyway. After
regen the same check honestly reports "zero, rejected or malformed
production receipts" until the witnessed mode runs against a real official
current build binding; that residual is the actual 971-obligation witness
workload, not staleness, and must not be "fixed" by faking receipts.
spec/parser 变更后必须成对再生：map 之外还要跑
`bun run generate:grammar-corpus-sources`，否则 `bun run test:item25`
以 "corpus.json: 内容漂移" 拒绝（2026-07-27 同轮命中）；两项 regen +
item25 PASS（rows=125 PARTIAL、missingRequiredCount=971 与计划基线一致）
才算 EBNF artifact 收敛。

### 已知状态(2026-07-27 定位):57 个 statement-root obligation 是 pin 住的故意缺失

`parserOwnedStructuredWitnessAccepted` 对 `statement_root_span` 要求 role
kind(`ParserValueExprStatement*`)且 ∈ claims `nodeKinds`;claims 对 7 个
转发 production(topLevelDecl/topLevelCore/templateBody/statement/
statementCore/matchArm/blockStmt)刻意 `nodeKinds: []`(不复制无意义
AST)。曾怀疑是两 authority 矛盾并试过放宽 membership 要求——被 item25
否决:该测试同时 pin 正反两类用例(statementCore 空声明时必须拒绝
Condition 冒充),且明确断言这 57 个 obligation "必须继续缺失"。结论:这
是 owner 刻意保留的 witness 缺口,闭合需要 owner 决定转发 production 的
witness role 声明粒度,任何侧不得擅自放宽 acceptance 或伪造 claims 声明。
同轮修复的真 bug:`cheng_regalloc_preflight_m9022.ts` validator 调用点漏
传 `production`/`node_kinds` 两参(真实 witness 路径一直传 4 参);
`item22:formal-profile` 在 57 缺口闭合前保持诚实 RED。

### 维护例(2026-07-27):跨仓 exact-hash pin 漂移

`cheng_regalloc_preflight_m9022.ts` 内三组 pin 会随 cheng-lang gate 工具
演进过期：`PRODUCTION_GATE_DEPENDENCY_EXPECTED_SHA256`、
`AARCH64_F64_RUNTIME_GATE_EXPECTED_SHA256`、
`X86_64_F64_RUNTIME_GATE_EXPECTED_SHA256`。cheng-lang 侧 gate/guard/
evidence 脚本一旦提交，item22 即报
`exact_source_hash_mismatch:<path>`。判定与修法：先用
`git -C cheng-lang diff` 确认目标文件是已提交的权威变更（非脏改动），
再把 pin 更新为当前字节 sha——昨日 cb0379d 即为同款例行 re-pin，不是
放宽。注意同一文件可能出现在多个 pin 集(guard 三处)，漏改一处会继续
红。re-pin 后 item22 从 [B] 段推进到 formal binding 段；其最终 GREEN
依赖 witnessed map,属 971 witness 生产任务，不是 pin 问题。

### 维护例(2026-07-27):fusion src 编辑后 MCP 长进程即 stale

`cheng_fusion_source_guard` 对 `src/` 53 个文件取指纹，任何编辑（包括
改后还原、仅 mtime 变化）都会让常驻 MCP server 拒绝后续调用：
`fusion_source_drift_since_process_start`。编辑 fusion src 后本会话内
一律改用 headless CLI(`bun cli.ts run <tool> --root … --input '…'`),
或重启 MCP server;CLI 每次起新进程，永远吃当前字节。后台长任务
(chain/probe）本来就该走 CLI，天然免疫。

### 维护例(2026-07-27):receipt key 扩容后旧 fixture 静默假值

`HARD_GATE_RECEIPT_KEYS` 新增 `native_descriptor_candidate_entry_path` 等
绑定字段后，item32 的 synthetic receipt 只按 key 模板填默认值
(path/module 默认 "0")，报 "只接受两个官方 entry"。修法是在 fixture
里显式绑定一个官方 entry(path+module_path 与 `CID_OFFICIAL_ENTRY_SPECS`
一致）;sha256 类字段默认同 hash，等式链自动成立。凡 receipt key 扩容，
同轮必须 grep 所有按 key 模板生成 synthetic receipt 的测试 fixture。

变种（2026-07-29 第四例）:symlink 指向**外部 baseline seed**（如
regalloc-baseline-current)——工具按设计拒绝（不复制外部字节）。此时正确
修法是用**同目录内**已验证的 bin(stage3.bin）替换目录项；绝不顺链接写
外部 target(baseline 是 perf-gate 不可变基线，覆写即毁证据）。
