# VERIFY_main_mem_round6_append —— [主线程] 合入 b3meta metadata churn 刀 + intern87.5 + @importc 精确预筛：768MiB 墙贴线 0.56MB 2026-09-09

date_utc=2026-09-09 · 代理=主线程（goal f374911d 第 6 轮）· 口径=current-source C 链 rebake + 768MiB 守卫（805306368B）· 共享树纪律：仅动主树已提交文件

## 一、结论先行

**三件合入、一墙贴线、一刀定谳：**

1. **合入 b3meta metadata churn 刀**（commit `ab86b8ce5`，来源 b3meta `3e76fc5bc`+`6a4a526ce`）：typed_expr 逐行扫描零分配预筛（ParseBindingLine/ModuleConst/CollectDeclaredTypes/globalBindings/ScopeEndLine）＋ compiler_csg 行表物化 `LookupInternShared` 池共享。随后修正其 `CollectDeclaredTypeNames` 的 `lineRaw` 拼写笔误（commit `532ca869b`，与 b3meta 工作树逐字节对齐）。
2. **intern 87.5% + @importc 精确预筛**（commit `ba0a22413`）：
   - 索引增长负载因子 75%→87.5%，kernel 闭包 line pool 索引停 2^19 而非 2^20，再省 ~12MB；
   - `ParserNormalizedImportcTargetColumnsInto` 增加零分配 `'@'+可选空白+importc` 预筛：`compiler_csg.cheng`（2.15MB、115 处 `importc` 标识符、0 个 `@importc`）等大源不再走全量 `ParserValueExprTree`；有注解的源保守回退全量，语义不变。
3. **768MiB 纯自烤最好轮**：`enforced_peak=805,896,192B`（resident 口径，仅超限 589,824B=0.56MB），`phys_footprint=774,669,320B`；最后标签仍为 `profile src=132`，`after_profiles`/`metadata` 未达。差口从合入前的 +2.4MB 收窄到 **+0.56MB**。

## 二、current-source 构建与哈希（主树）

| tag | 内容 | rc | driver_sha256 | report_rss_bytes |
|---|---|---|---|---|
| run_b3main (第一版) | b3meta churn + intern75 + 快照共享 | 2 | — | `lineRaw` 笔误 |
| run_b3main (修正) | +rawLine 修复 | 0 | f9120c73… | 708,509,696 |
| run_b3main (intern87.5) | +87.5% 负载因子 | 0 | 5cf8a77b… | 707,428,352 |
| run_b3main (@importc 粗筛) | 子串 `importc` 快筛 | 0 | a6b3523c… | 702,070,784 |
| run_b3main (@importc 精确筛) | `@`+空白+importc 预筛 + @borrows | 0 | **aaa34371a2c7778f07fa1aaf0ca33130484c8444f92b14bca67ace07a1b4558d** | 710,246,400 |
| run_b3main (逐源 relief 试验) | 每源 relief（已回退） | 0 | 1d9116b6… | 710,328,320 |
| run_b3main (预置池试验) | 行池按总行数预置（已回退，反升 9.4MB） | 0 | 0cd5d119… | 709,066,752 |

全部为 `/tmp/cheng_cold_v2` 种子轮（`cold_system_link_exec=1`、`full_backend_codegen=0` 属预期）。

## 三、768MiB 自烤关键轮

| 轮 | 驱动 | rc | wall | enforced_peak | resident | phys | 最后标签 |
|---|---|---|---|---|---|---|---|
| b3main+87.5 | 5cf8a77b | 137 | 188s | 807,059,456 | 807,059,456 | 692,323,408 | profile src=132 |
| b3main+精确筛 | aaa34371 | 137 | 174s | **805,896,192** | 805,896,192 | 774,669,320 | profile src=132 |
| b3main+逐源 relief | 1d9116b6 | 137 | 174s | 808,730,624 | 808,730,624 | 756,057,144 | profile src=132 |

- 精确筛后 src=132 驱动内账 `rss≈408-463MB`（随系统负载漂移）、`live=1,972,299`（合入前 2,442,478，−470K 分配）、`pool_struct=25.1MB`、`pool_logic=13.2MB`。
- 死亡窗仍是 src133-143 的**带 `@importc` 大源**（typed_expr 3.52MB/9 注解、primary_object_plan 4.49MB/5、parser 1.70MB/11、program_support_backend 1.29MB/177）——这些源仍走全量 `ParserValueExprTree`。
- 对照 b3meta `self_gen2_census2`（其 clone 无本树 intern87.5/精确筛）：rc=125@339s，`rss_bytes=806,978,712`（+1.67MB），metadata src=48 已 795.6MB；本树合并后最好轮已到 +0.56MB，两线收敛。

## 四、下一刀（唯一剩余 profiles 墙）

**逐行 `@importc` 目标提取，替代带注解源的全量树解析**：注解语法固定为 `@importc(...)` 附着到下一处顶层 `fn`；按行定位 `@importc` 行并解析紧随的 `fn` 行/列即可填 `targetColumns`，无需构建整棵 `ParserValueExprTree`。这是当前唯一仍触发大源全量树解析的入口（`ParserNormalizedImportcTargetColumnsInto`）。若行级提取风险高，退路是把 `typed_expr.cheng`/`primary_object_plan.cheng` 拆成 <2MB 模块。

## 五、纪律记录

- 主树源码足迹=commit `ab86b8ce5`/`532ca869b`/`ba0a22413`（typed_expr/compiler_csg/intern/parser）；`bootstrap/cheng_cold.c` 调试打印与他线 `VERIFY_tamem2_append.md` 未纳入。
- 无抬帽轮；失败轮均保留 guard.report/phase.trace/resource.trace。
- 逐源 relief、行池预置两试验均实测反升或无效，已回退，不入最终链。
- 目标仍 active；下一轮从 §四 施工。
