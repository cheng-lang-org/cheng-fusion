# VERIFY_goal_integrate2_append — closure integration set (goal2)

date_utc=2026-09-10 · base main HEAD=9dd7a2bcddc9df34e1471d2ec7e06e36aecb8290
clone=/Users/lbcheng/goal-work/integrate_goal2

## Committed closure set

- core340 01..09 with owner fixes 03b (macho stat borrow), 05b (path write borrow), 05c (path fstat borrow), 06b (arena cstring consistency), 07b (thread entry borrow).
- prov624 `00_prov624_all.patch` final (sha256 fd9be1d9fa2ea54f1444baf127dcdccc254f26b25090943a1ff350696b5bb83f, 13 files).
- archtok 01, 04, 05, 09, 09b, 09c, 09d (09d adds observed_strict_provider_parser_text_provider).
- v6mem P1 `/tmp/v6mem_receipts/v6_p1.patch` (sha256 f1959dca95f5483e3e0fec373a92424939eb82a00078aa8b6a5f65440529d96d).
- `tools/legacy_x86_stage0_build.sh` (gitignored; committed with `git add -f`).

Memory patch `/tmp/memstream_patches/main_memory_fix.patch` is intentionally NOT in this commit; it is committed separately by the main thread. The clone used for codegen verification carried closure + memory; the committed closure-only tree still passes zrpc with `new=0` against the updated baseline.

## Gate receipts (closure + memory verification tree)

- zrpc default / `--require-zero-kernel-core` / `--no-cold` / `--require-zero-closure`: total=368, zero_tier=0, cold=0, by_tier provider=366/plugin=2; rc=0 after baseline update.
- `kernel_plugin_closure_check.py --require-closure`: rc=0 PASS.
- `kernel_plugin_closure_check.py --require-strict-closure`: violations=42 = 12 documented arch_reachable + 30 token files/342 lines; manifest_unreachable=0, closure_unmanifested=0, arch_reachable=12.
- `kernel_plugin_manifest_gate.py`: PASS (x86_64=5, aarch64=4, riscv64=5; coverage=exact; cross_manifest_unique=true).
- `zrpc_kernel_gate_contract_test.sh`: PASS.
- Baseline: `tools/zrpc_kernel_baseline.tsv` b14e7fed682f60d69b24cb5ce4f00ba4ae7a77168ba52c0bcf66cff1d6efea88 -> ee5e4ac8ec137f776d1c925af8b3d4e26e57424327641cee55a9a4c6fc271a96; diff 162 insertions / 771 deletions. This is line-number/datasource drift from prov624 00_all + archtok 09b token neutralization: before new=145 / resolved=754, after new=0 / resolved=0; all new keys provider-tier (no kernel_core). Receipts: `/tmp/goal_integrate2_baseline_update.stdout`, `/tmp/goal_integrate2_baseline_update.diff`, `/tmp/goal_integrate2_zrpc_baseline_post.json`.

## Bake / fixture receipts

- 768MiB bake: RED solely on memory wall (codegen clean). guard `abort_reason=rss_limit_exceeded`, rc=137, actual_exit_code=143, `process_tree_enforced_peak_bytes=817233920`, memory_limit=805306368. Receipts: `.run_goal2/bake.guard.report`, `/tmp/goal_integrate2_bake_v5.launch`.
- 1.5GiB diagnostic bake: rc=0, driver_sha256=`dc26d446e8884e2c923881daa095bfa03d9a4495396fcb739744291f7c716f5a`, `report_rss_bytes=708771840`, guard peak=834,240,512, elapsed=195,594 ms. Receipt: `.run_goal2_diag/`.
- Fixtures under 1.5GiB diagnostic guard: ordinary compile/run rc=0/0; call_fixture compile=0, run actual=1 (guard expected 1, guard rc=0); cold_nested 0/0; v6 0/0.
- parse-receipt: cold_nested rc=0 json sha256 `35fcc0f4058733ffc0493b6c93cf2ec53c5348fd1954043af64573cda09613fc`; v6 rc=0 json sha256 `453819a6eebd16a07413df22265deb1d562d9a16d71bc29f184a906f6337cd85`.
- Receipt dir: `.run_goal2_fixtures/`.

## Open item

Kernel 768MiB memory wall remains open: enforced peak ~817.2MB vs 768MiB (~49MB over). Memory patch set (O(n²) in-place, forest presize, double-copy removal, lazy override) is committed separately; after it lands the 768MiB acceptance must be re-run.
