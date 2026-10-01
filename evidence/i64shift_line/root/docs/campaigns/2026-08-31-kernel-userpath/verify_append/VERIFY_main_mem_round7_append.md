# VERIFY_main_mem_round7_append —— [主线程] @importc 行级提取落地：profiles 相残留墙=per-source 瞬态 2026-09-09

date_utc=2026-09-09 · 代理=主线程（goal f374911d 第 7 轮）· 口径=current-source C 链 rebake + 768MiB 守卫 · 共享树纪律：仅动主树 parser.cheng（已 commit）

## 一、结论先行

**一刀落地、一墙定谳：**

1. **commit `3ba8f16e0`**：`ParserNormalizedImportcTargetColumnsLinewiseInto` 行级提取 `@importc` 目标，`parserReadFunctionDeclsLinesMode` 先走快路径、未处理形态回退全量 `ParserValueExprTree`。大源 `typed_expr.cheng`(3.52MB/9 注解)、`primary_object_plan.cheng`(4.49MB/5)、`parser.cheng`(1.70MB/11) 不再建整棵树。
2. **效果**：纯自烤 src=132 `live` 从 1,972,299 → **1,432,268**（−540K 分配）；但 768MiB 自烤仍在 145s 撞线（enforced=808,140,800B，+2.8MB），最后标签 `profile src=132`，`after_profiles`/`metadata` 未达。
3. **定谳**：保留集已连续削掉 ~1M 分配（2.44M→1.43M）而峰位不变——**残留墙是 per-source 瞬态**（大源解析时 ~350-400MB 临时分配），不是 retained base。下一刀必须打 profiles 相逐行扫描 churn，与 b3meta metadata churn 刀同范式。

## 二、current-source 构建与门禁回执

| 项 | 值 |
|---|---|
| C 链 rebake | rc=0，driver_sha256=`3c4ce54c15019eae71b34573d034c60abde49095e9df289800f437a3f2050063`，report_rss=709,246,976 |
| user_path_gate（本驱动） | ordinary PASS compile_rss=766,896KiB；call_fixture PASS compile_rss=768,224KiB |
| cold_nested.compile | RED `rss_limit_exceeded:808,632,320:805,306,368`（gate 停于此，v6 未执行） |
| parser_normalized_source_smoke 编译 | rc=125 `rss_limit_exceeded rss_bytes=811,156,560`（驱动内建 768MiB 守卫） |
| 768MiB 纯自烤（本驱动） | rc=137@145s，enforced=808,140,800（resident），phys=797,246,496，最后标签 profile src=132 |

## 三、相位账（本驱动，CHENG_CSG_MEM_TRACE=1）

| 点 | rss | live | pool_struct | pool_logic |
|---|---|---|---|---|
| profile src=120 | 376,029,928 | 1,232,822 | 15,728,912 | 11,308,385 |
| profile src=128 | 396,706,536 | 1,302,153 | 15,728,912 | 11,956,928 |
| profile src=132 | 450,691,864 | 1,432,268 | 25,166,096 | 13,237,207 |

对照 round6 最好轮 src=132：live 1,972,299、rss≈408-463MB、enforced=805,896,192。**live 降 540K 但 enforced 峰未降**——证实峰由瞬态而非 retained 集决定；src=132 后的大源（src133-143）解析窗即死亡窗。

## 四、下一刀（唯一 profiles 墙）

profiles 相逐行扫描的临时分配（`ParserSplitChar` 每行 str、`parserReadFunctionDeclsLinesMode` 的 `ParserTextSliceCopy`/`ParserIdentPrefix`、`ParserLocalCallNamesFromDecls`、`ParserMaxQualifiedCallDepthLines`）是当前 ~350-400MB 瞬态来源。刀形（按收益排序）：

1. **零分配预筛**：仿 b3meta metadata churn 刀，对每行先做首字节/关键字/引号状态机分类，非目标行不再 `PathTrim`/`StripLineComment`/`ParserTextSliceCopy`；
2. **行表 SoA/Arena**：`ParserSplitChar` 改一次性 arena 字节偏移列，消灭每行 str 分配；
3. **大源拆分**：`typed_expr.cheng`/`primary_object_plan.cheng` 拆 <2MB 模块（结构刀，风险高）。

B3 metadata contexts 的 churn 刀已由 b3meta 合入主树，一旦 profiles 瞬态穿线，metadata 相应可继续推进。

## 五、纪律记录

- 主树源码足迹=commit `3ba8f16e0`（parser.cheng 单文件）；`bootstrap/cheng_cold.c` 与他线 `VERIFY_tamem2_append.md` 未纳入。
- 无抬帽轮；失败轮保留 guard.report/phase.trace/resource.trace。
- 行级提取的保守回退面：行内 `fn`、缺 `(`/`)`、缩进声明、非 fn 目标、块注释、EOF 注解均回退全量树，语义权威仍以全量路径为准；ordinary/call 夹具双绿为当前功能证据。
- 目标仍 active；下一轮从 §四-1 施工。
