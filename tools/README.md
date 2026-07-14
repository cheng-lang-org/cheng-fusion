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
read off a shared tree.

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
