# VERIFY_tamem_runtime_analysis_0908 —— GEN2 自烤 metadata 峰窗运行时分析

- 日期：2026-09-08
- 来源：TA-MEM 车道 t4/t5 自烤（隔离克隆 `/Users/lbcheng/cheng-f24/tamem2`）
- 载具：t4 驱动 `sha256=8e83cd1bf447595b61f1a9bcc3e50e67925671f25928c6ef4222248586e771ec`
  （C 链 t4 产物；`/tmp/cheng_cold_v2` 车头，rc=0 wall=186s）
- 运行时守卫：本席当时默认 1GiB 帽；主树 2026-09-08 用户令后已改 **768MiB 理论极限**
  （`tools/memory_model_limits.sh`，805,306,368 bytes）
- 原始证据：`.w/t2/self_gen2diag/{bake.log,summary.txt,vmmap_snap_*}`、
  `.w/t2/self_gen2trace/bake.log`（车道克隆内）

## 一、逐相运行时轨迹（t4 驱动自烤，单位 bytes）

| 相/探针 | RSS | live_allocations |
|---|---:|---:|
| after_profiles | 618,857,480 | 3,858,114 |
| import_edges_resolved | 624,460,832 | 3,864,191 |
| profile_lookup_built | 624,460,832 | 3,864,666 |
| metadata_start profiles=230 | 624,460,832 | 3,864,666 |
| metadata src=0 | 624,657,440 | 3,866,072 |
| metadata src=16 | 699,057,232 | 3,978,286 |
| metadata src=32 | 707,691,600 | 4,005,286 |
| metadata src=48 | 811,877,528 | 4,116,316 |
| metadata src=64 | 825,885,872 | 4,294,716 |
| metadata src=80 | 849,888,456 | 4,394,822 |
| metadata src=96 | 889,750,776 | 4,493,506 |
| metadata src=112 | 913,327,352 | 4,584,745 |
| metadata src=128 | 1,013,466,408 | 4,695,735 |
| guard trip | 1,089,848,664 | — |

- `summary.txt`：`rc=125 wall=379s peak_rss_kb=821056`
- `guard_line=compile_progress phase=resource_guard status=rss_limit_exceeded
  rss_bytes=1089848664 limit_bytes=1073741824`
- vmmap（711,760KB 窗）：`Physical footprint: 836.1M`、`Physical footprint (peak): 875.8M`

## 二、判定

1. B1/B2 已把 forest arena 倍增拷贝瞬态与 lineStore 越窗滞留压下去（不再出现
   917→500MB 的 realloc 骤降），但**峰窗前移到 metadata contexts 相**：
   `compilerCsgBuildMetadataContextsRec` 一次性构建 230 个
   `TypedExprSourceContext`，RSS 从 624MB 涨到 >1GB。
2. profiles 工作集（3.86M live allocations）是基座；metadata 相平均每源约
   +1.7MB（`metadata src=128` 已 1,013MB）。
3. 在 **768MiB 理论极限**下，该实现更早 RED：约 `metadata src≈80`（850MB）
   即触 805,306,368 上限；主树 `user_path_gate`/`beat_c_process_group_guard`
   已按此口径执行。
4. 下一刀目标：**metadata contexts 按源惰性构建/用后即释**（或
   `TypedExprSourceContext` SoA/intern 化），使 `after_profiles≤392MB`、
   metadata 峰 ≤768MiB；随后复烤 GEN2/GEN3。

## 三、复现

```bash
# 车道克隆内
bash .w/t2_selfbake2.sh gen2diag .w/t2/run_t4/kernel_driver trace1
# 主树 768MiB 守卫默认值验证
tools/beat_c_process_group_guard.sh --report-out:/tmp/g.rpt \
  --stdout:/tmp/g.out --stderr:/tmp/g.err -- /bin/echo hi
grep -E '^(status|memory_limit_bytes)' /tmp/g.rpt   # memory_limit_bytes=805306368
```

## 四、边界

- 本分析为 TA-MEM 车道在隔离克隆的运行时证据；主树尚未合入 B1/B2，且主树守卫已
  改 768MiB，故当前主树 GEN2 自烤为 RED。
- 1GiB 数字为迁移前口径；新规范一律 768MiB，历史回执保留原文并加口径迁移注。


## 五、768MiB 理论极限首跑（2026-09-08，主树守卫）

- 载具：TA-MEM t6 驱动 `sha256=8e83cd1bf447595b61f1a9bcc3e50e67925671f25928c6ef4222248586e771ec`；
  源：`selfhost_b12` 克隆（TA-MEM 最新 174 行补丁，已含 B1/B2）。
- 守卫：主树 `tools/beat_c_process_group_guard.sh --rss-limit:805306368`。
- 结果：`rc=137 wall=260s`；`status=ABORT abort_reason=rss_limit_exceeded`；
  `process_tree_resident_peak_bytes=624,951,296`；
  `process_tree_phys_footprint_peak_bytes=806,700,208`；
  `process_tree_enforced_peak_bytes=806,700,208`（限 805,306,368，采样点超 1,393,840B）。
- 死亡相位：最后一个 `csg_stage=after_sort_sources rss_bytes=158,073,552`；
  即 **profiles 构建期**就被 768MiB phys_footprint 守卫拦下（尚未到
  `after_profiles`/metadata）。
- 判定：B1/B2 不足；profiles 工作集（3.86M live allocations）是下一刀唯一入口；
  768MiB 理论极限下不能靠 forest 窗优化单独收口。复现：
  `bash .w_selfhost_goal_768.sh`（selfhost_b12 克隆内）。


## 六、四夹具 768MiB 实测（TA-MEM t5/t6 驱动，C 链产物 `sha256=8e83cd1b…`）

来源：TA-MEM 车道 `user_path_gate.sh --driver .w/t2/run_t5/kernel_driver` 的
per-fixture `guard.report`（当时 `memory_limit_bytes=1GiB` 旧口径；下表按主树
768MiB=805,306,368 判定）。

| fixture | resident peak | phys_footprint peak | enforced peak | 768MiB 判定 |
|---|---:|---:|---:|---|
| ordinary | 469,270,528 | 652,084,256 | 652,084,256 | **PASS** |
| call_fixture | 561,332,224 | 628,704,288 | 628,704,288 | **PASS** |
| cold_nested | 889,896,960 | 747,144,320 | 889,896,960 | **RED +84,590,592** |
| v6 | 1,022,410,752 | 850,101,448 | 1,022,410,752 | **RED +217,104,384** |

- 判定：TA-MEM 已把 ordinary/call_fixture 压到 768MiB 内；cold_nested/v6 仍超。
- 与自烤的合并排序：v6 +217MB > 自烤 profiles/metadata ~250MB+ > cold_nested +85MB；
  下一刀优先处理 v6 的 resident 峰（phys_footprint 已 850MB，resident 1,022MB）。
- 复现：`tools/user_path_gate.sh --driver <driver>`（主树默认 768MiB 帽）。


## 七、v6 基线相 trace（m60c 认证驱动，2GiB 诊断帽）

- 命令：`beat_c_process_group_guard.sh --rss-limit:2147483648 ... -- .rebuild/run_m60c/kernel_driver
  system-link-exec --root:<main> --in:<src/tests 隔名暂编 v6> --emit:exe ...`
  （fixture 来自 `docs/campaigns/2026-08-31-kernel-userpath/fixtures/v6_direct1_repro.cheng`；
  `--in` 必须位于 `src/` 包内，否则报 `entry module identity unavailable`）。
- 结果：`rc=0`、`status=completed`；`process_tree_resident_peak_bytes=695,681,024`、
  `process_tree_phys_footprint_peak_bytes=816,809,184`（768MiB 限 805,306,368，**超 11,502,816B**）。
- 报告：`full_backend_codegen=1`、`cold_system_link_exec=0`、`source_snapshot_count=1`。
- CSG 相：`after_immutable_source_snapshot_release rss_bytes=19,907,088` —— 单源 v6 的
  CSG/profiles/metadata 仅 ~20MB；**主导相是 primary object emit**
  （报告 `exec_phase_primary_object_emit` 支配，lowering 次之）。
- 对比 TA-MEM t5 驱动 v6（车道门实测）：resident 1,022,410,752 / phys 850,101,448；
  **resident 比 m60c 基线反升 +326MB**，phys 也多 +33MB。下一刀必须同时处理
  backend emit 峰与 TA-MEM 驱动的 v6 resident 回归；只做 profiles/metadata 刀
  不足以让 v6 过 768MiB。


## 八、v6 峰窗 vmmap 分解（m60c 认证驱动，607MB RSS 采样）

- 采样：`.rebuild/run_v6_mem/vmmap_607088KB.txt`（v6 编译，2GiB 诊断帽；RSS 607MB 时抓）。
- `Physical footprint: 689.9M`；`MALLOC_SMALL` 716.0M virtual / **473.4M resident /
  456.2M dirty / 198.1M swapped**；ReadOnly libraries resident 297.8M；
  Writable regions resident 507.2M。
- 判定：v6 峰由 **MALLOC_SMALL 活集**（编译器小对象）主导，phys 峰含
  compressed/swapped 页；基线 phys 峰 816,809,184 仅超 768MiB 11,502,816B，
  12MB 级 release 即可过门。但 TA-MEM t5 驱动 v6 resident 反升到 1,022,410,752
  （+326MB vs m60c 基线），需先定位该回归，否则 768MiB 门会被 t5 驱动放大。
- 复现：`.rebuild/run_v6_mem/`（guard.report/rss_samples/vmmap_607088KB.txt）。
