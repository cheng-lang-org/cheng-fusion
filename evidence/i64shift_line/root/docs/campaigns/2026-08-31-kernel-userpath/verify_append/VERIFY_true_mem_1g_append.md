# VERIFY append — true kernel metadata peak vs 768MiB guard (2026-09-10)

## Scope and source binding

- Main repo: `/Users/lbcheng/cheng-lang`, HEAD `67b8c8b7b` plus goal-owned working-tree changes
  (`parser.cheng` if/while+nested-Fmt fixes, `typed_expr.cheng`/`intern.cheng`/`compiler_csg.cheng`
  metadata compaction, `bootstrap/kernel_manifest.cheng` + strict-closure/cold marker patches).
- Driver under test (C-chain seed, lean + strip): `/tmp/kd_poolshrink_strip_lean`
  sha256 `c43d22a7cb75eef9ea9ba6546c940e8118d5b9ffa83d737dbd12908bdcc54565` after lean patch,
  then `strip -x -S` + ad-hoc re-sign; size 169,598,592 B (unstripped 170,239,456 B).
- Vehicle: `.rebuild/run_goal_lr/kernel_driver` (sha `560005b2...` for the line-release reorder build;
  the memory probe below used the poolshrink build, source state before the reorder).
- Guard: `tools/beat_c_process_group_guard.sh`, metric `max(resident_peak, phys_footprint_peak)`.
  The driver also has a baked-in `CHENG_PROCESS_MAX_RSS_BYTES` internal guard.

## Receipts

### 1. 768MiB guard (internal default 805,306,368)

| run | driver | rc | wall | resident peak | phys peak | enforced peak | last stage |
|---|---|---:|---:|---:|---:|---:|---|
| `run_selfg2_poolshrink_notrace_768` | kd_poolshrink_lean | 137 | 181 s | 537,067,520 | 805,487,768 | 805,487,768 | after_profiles / import_edges_resolved |
| `run_selfg2_poolshrink_j1_768` | kd_poolshrink_lean, BACKEND_JOBS=1 | 137 | 198 s | 558,645,248 | 805,995,600 | 805,995,600 | after_profiles / import_edges_resolved |
| `run_selfg2_poolshrink_strip_j1_768` | kd_poolshrink_strip_lean, BACKEND_JOBS=1 | 137 | 208 s | 461,373,440 | 806,126,672 | 806,126,672 | after_profiles / import_edges_resolved |

All three abort at `abort_reason=rss_limit_exceeded`, `process_tree_peak_process_count=1`.
The measured phys plateau is ~805.5–806.1 MB, i.e. only ~0.2–0.8 MB above 805,306,368 B.
This is the number that made the wall look ~0.5 MB away.

### 2. True-peak diagnostic (internal guard raised to 1 GiB)

- Command: same self-bake script with `CHENG_PROCESS_MAX_RSS_BYTES=1073741824` and
  external `--rss-limit:1073741824`; run dir `.rebuild/run_selfg2_pure_bootstrap_1g`.
- Result: `status=ABORT`, `rc=137`, `abort_reason=rss_limit_exceeded`, wall 240 s.
- `process_tree_resident_peak_bytes = 612,745,216`
- `process_tree_phys_footprint_peak_bytes = 1,074,496,832` (exactly the 1 GiB external limit)
- Last stderr stage: `after_profiles` / `csg_mem tag=import_edges_resolved`; metadata never
  reached `metadata_contexts_built`.
- Interpretation: the process’s true metadata-phase demand is **> 1 GiB phys**. The ~806 MB
  numbers in section 1 are the point where the driver’s own 805 MiB RSS guard fired, not the
  process’s natural peak. Raising the internal guard lets the same source/vehicle grow past 1 GiB.

## Conclusion

- The 768 MiB memory-model limit is **not** a 0.5 MB tuning gap. The current kernel metadata
  construction (full `TypedExprSourceContext` set + per-source owned string payloads + profile
  payloads + line-intern texts + graph/semantic tables) has a true peak above 1 GiB.
- Source-level compaction performed in this round (drop derivable line-length/override columns,
  projection override column, type-decl/field owned-copy fast paths, exact start-column sizing,
  line-pool slot shrink, snapshot-text borrow, per-profile line-text release reorder) reduced the
  *measured* peak and the resident set materially, but did not change the structural fact: the
  metadata phase must build and retain the full per-source context set before typed IR.
- Closing the wall requires a structural redesign (top targets, unchanged from the forestdiag
  report): stream/build the compact frozen metadata projection before the full context peak, or
  release full `TypedExprSourceContext` string/array payload as each context is compacted; plus
  bulk line-intern text release at a dedup-safe boundary. This is a ~300 MB class reduction, not
  a sub-MB one.
- Parser walls are green: `cold_nested_fmt_interpolation_smoke` and `v6_direct1_repro`
  parse-receipt rc=0 with the integrated if/while + nested-Fmt merge fixes; ordinary/call_fixture
  compile+run PASS under the 768 MiB guard. cold_nested/v6 compile still hit the memory wall.

## Artifacts

- `.rebuild/run_selfg2_poolshrink_notrace_768/guard.report.txt`
- `.rebuild/run_selfg2_poolshrink_j1_768/guard.report.txt`
- `.rebuild/run_selfg2_poolshrink_strip_j1_768/guard.report.txt`
- `.rebuild/run_selfg2_pure_bootstrap_1g/guard.report.txt` (true-peak diagnostic)
- `.rebuild/run_selfg2_pure_bootstrap_1g/resource.trace.txt`
