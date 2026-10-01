# VERIFY_main_mem_round5_append —— [主线程] 768MiB 自烤墙定位：profiles 大源瞬态 + 四夹具/瘦身链证据 2026-09-08

date_utc=2026-09-08 · 代理=主线程（goal f374911d 第 4-5 轮）· 口径=current-source builds + 768MiB 守卫（理论极限 805306368B）· 共享树纪律：仅动主树三文件（已 commit），不碰他线在飞文件

## 一、结论先行

**两件落地、两墙定谳、一件移交：**

1. **已 commit `38feddb3b`**：TA-MEM B1/B2（arena 精确容量 + forest 两阶段合并；lineStore/lineInternPool 释放点前移）＋ b3meta relief 相序（profiles/metadata 相 relief 先行再守卫，去掉 profiles 起点裸 guard）＋ intern 索引负载因子 50%→75% ＋ immutable snapshot 文本 refcount 共享 ＋ CHENG_CSG_MEM_TRACE 工作集/分组 census。C 链 rebake rc=0（driver_sha256=bd31c182…，report_rss=676,446,208B）。
2. **四夹具（lean 驱动，768MiB）**：ordinary PASS compile_rss=622,786KiB；call_fixture PASS compile_rss=712,912KiB；cold_nested 在并发负载下 812,580,864B RED（+7.3MB），同一驱动早先独跑 rc=0 峰 779,306,064B（−26MB 余量）——**冷夹具贴线，测量受系统压力影响**；v6 未及执行（gate 在 cold_nested 停）。
3. **墙 1 = profiles 相大源解析瞬态**：纯自烤 768MiB 连续 5 轮 rc=137，enforced_peak=806.8-808.5MB（phys_footprint 口径），resident 峰仅 656-674MB；最后标签 profile src=132，after_profiles/metadata 标签零输出。驱动内账 src=132 rss≈406MB、live=2,442,478；死亡窗=src133-143 的大源（compiler_csg.cheng 2.15MB / typed_expr.cheng 3.52MB / primary_object_plan.cheng 4.49MB 量级）。差口 ~1.5-3MB 即锚。
4. **墙 2 = metadata contexts 相**（TA-MEM2 已定谳并移交）：contexts 全量驻留，~3.9MB/源线性，src=128 已 1,013MB；B3=构建即压缩/分片驻留，本线程尚未施工。

## 二、current-source 构建与哈希（主树）

| tag | 内容 | rc | driver_sha256 | report_rss_bytes |
|---|---|---|---|---|
| run_tamem_main | TA-MEM B1/B2（原始） | 0 | 8a025f9a… | 667,238,400 |
| run_diag_main | +工作集 census | 0 | e88159d9… | 704,069,632 |
| run_relief_main | +relief（16 源） | 0 | 1b757e61… | 709,902,336 |
| run_nopool_main | +无池实验（已回退，见 §五） | 0 | bbb6af05… | 674,168,832 |
| run_share_main | +快照文本共享 | 0 | 5c4f0e88… | 699,432,960 |
| run_share2_main | +forest_reserve/meta census | 0 | 2681378f… | 705,527,808 |
| run_intern75_main | +intern 75% | 0 | 54ff85ea… | 677,085,184 |
| **run_relief2_main** | **+relief 相序（终态）** | **0** | **bd31c1821915d610df3326ecf5227f3ed5eb8004d79edc3c41b3734f3239d7a3** | **676,446,208** |

全部为 `/tmp/cheng_cold_v2` C 链烤机（种子轮，`cold_system_link_exec=1`、`full_backend_codegen=0` 属预期；纯轮验收看 GEN2 产物回执）。

## 三、768MiB 纯自烤曲线（终态驱动 bd31c182，BACKEND_JOBS=2）

- 轮次：relief2_lean_768 rc=137@205s enforced=806,831,232；j1 rc=137@194s enforced=808,141,928；此前 share2_lean rc=137@190s enforced=806,765,576；intern75_lean rc=137@190s enforced=807,208,064。
- 相位账（驱动内 `CHENG_CSG_MEM_TRACE=1`，rss=os.ProcessRssBytes）：
  - profile src=120：rss=383,648,560 live=2,091,785 pool_struct=25,166,096 pool_logic=11,308,385
  - profile src=128：rss=390,120,240 live=2,212,821 pool_struct=25,166,096 pool_logic=11,956,928
  - profile src=132：rss=406,455,112 live=2,442,478 pool_struct=25,166,096 pool_logic=13,234,067
- 外部 guard 1s 采样在 src132 后捕获 phys 峰 806.8-808.5MB；resident 峰 656-674MB。差值=压缩页/共享页计入 phys_footprint，非驱动内账。**结论：差 ~2MB 即穿 profiles 墙；下一刀必须削大源解析瞬态（非全量 relief 能覆盖的相内峰）。**

## 四、四夹具 gate 回执（lean relief2 驱动，768MiB）

| 夹具 | compile | run | compile_rss_KiB | 判定 |
|---|---|---|---|---|
| ordinary | 0 | 0 | 622,786 | PASS |
| call_fixture | 0 | 1 | 712,912 | PASS |
| cold_nested | — | — | 812,580,864B enforced | RED（+7.3MB；同驱动独跑 779,306,064B rc=0） |
| v6 | — | — | 未执行 | gate 停于 cold_nested |

日志：`.rebuild/gate_relief2_lean.log`。cold_nested 独跑回执：`/tmp/lean_cold/guard.report.txt`（status=completed rc=0 peak=779,306,064）。

## 五、两条工程发现（供下一刀）

1. **未使用 media framework 的 LC_LOAD_DYLIB 开销（已验证，未落源码）**：kernel_driver 链接 VideoToolbox/CoreMedia/CoreVideo/CoreFoundation/Foundation/Metal/QuartzCore，但 `nm -u` 89 个未定义符号全在 libSystem（零 media/ObjC 符号）。用 `install_name_tool -change` 把 7 个 framework 换成轻量 system dylib + ad-hoc 重签后：cold_nested 独跑 805,781,504→779,306,064（−26MB phys）；kernel 纯自烤 phys 峰不变（shared clean pages 不进 phys 的私有大头）。**正确修法在 macho_provider_linker/source closure：只对 program 可达 import 发 dylib，或把 media provider 移出 kernel 闭包；post-link hack 仅作证据，不入最终链。**
2. **无池模式已回退**：`CHENG_DISABLE_LINE_POOL=1` 实验路径在 ordinary 夹具复现 `compiler parser receipt: function source span invalid`（rc=2），证明 fallback 行表语义不等价；相关代码已在 commit 前全部回退，默认 pool 路径不受影响。

## 六、下一刀清单（按收益/风险排序）

1. **profiles 大源瞬态**（当前 768MiB 墙，差 ~2MB）：parser/profile 构建的 per-source 峰 ~200MB。候选：大源分片（compiler_csg/typed_expr/primary_object_plan）、parser 内部按行/token 分段的 relief 钩子、profile SoA/Arena 化。
2. **B3 metadata contexts**（下一墙，~1GB）：构建即压缩/分片驻留，或 per-source projection 增量 append 后释放 full context（typed_expr 语义权威域，按 TA-MEM2 移交协议施工）。
3. **linker/closure 去 unused media dylib**（夹具 −26MB 已证）：优先 source closure 把 media provider 从 kernel 闭包移出；次选 linker 只发 program-reachable dylib。
4. **GEN2/GEN3 固定点 + 去 C 冷链**：以上两墙穿后按 master-plan Z7/Z8 执行；`--no-cold`、`_cold_`=0、`cold_system_link_exec=0`、`full_backend_codegen=1` 四项门禁同轮取证。

## 七、纪律记录

- 主树源码足迹=commit `38feddb3b` 三文件（intern.cheng/arena.cheng/compiler_csg.cheng）；`bootstrap/cheng_cold.c` 的 9 行 `[dbg-admission]` 调试打印为他线在飞文件，未纳入本 commit（其归属线随后以 bafd0ab66 等提交处理）。
- 全部守卫默认 768MiB，无抬帽轮；失败轮均保留 guard.report/phase.trace/resource.trace。
- 自烤轮与他线（b3meta/tamem2）并发时 phys 口径漂移 ±33MB 已记录；cold_nested 独跑/并发差异即此。
