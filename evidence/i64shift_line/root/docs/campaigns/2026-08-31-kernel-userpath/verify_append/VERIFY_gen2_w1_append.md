# VERIFY_gen2_w1_append —— [GEN2-LADDER] GEN2 死点定量画像 + 1GiB 墙架构性定谳（止损移交）

date_utc=2026-09-06 · 代理=GEN2-LADDER 线 · 克隆=/Users/lbcheng/cheng-f24/anchor_clones/l3b4（进场态=主树 HEAD=73debaef2 + 48 文件在途 hunks 全量副本，收工态 diff 与主树逐字节一致=零残留）· 探针修正版=.w/gen2_probe2.sh（直取 PID 采样）· 载具=merge 驱动 f0cf2f4d… 与克隆烤机驱动

## 结论先行

**GEN2 死点定谳为架构性驻留，按止损条款移交：1GiB 墙=单遍全量物化的活集下限穿透，非生命周期释放点可穿，无 patch 交付。** 死点 RSS 在 5 轮实测中不变（guard 口径 1.088-1.152GiB，rc=125），帧级/vmmap/heap/机内账本四路证据一致：死点位于 `compilerCsgBuildConsumeWithOverridesCoreInto → compilerCsgBuildMetadataContextsRec`（逐源元数据上下文构建，texpr 绑定/串分配热链），活产物 = profile 相驻留 648MB（428 万活分配）+ 元数据上下文 ~450MB+（每 binding/scope/串独立分配×逐分配 header 开销），两者均被下游消费（无读者空窗）。已实测否决两个机制级修复（16-步进与逐源节奏的 `ProcessMemoryPressureRelief`）：棘轮残量可收 ~250MB（vmmap 实证 SMALL 脏页 520→258MB）但死点 RSS 不动，补丁未过自身验收链（死点 RSS 未单调下移）不交付。**GEN2 rc=0 需 P1 条目化/P4 按需物化（立项材料见 §五）；组合装配路径（主线程数据点 1.129GiB）同墙同类，W1 释放批次无交付故不触发装配复测。**

## 一、探针修正（merge_0906 gen2_probe.sh 采样 bug 破案）

- 根因：`pgrep -f "kernel_driver_merge system-link-exec"` 命中 `timeout` 壳自身（其 argv 含同文本，RSS 恒 1536KB）——旧 csv 全程采到 timeout 而非驱动。
- 修正：后台直启驱动取 `$!`，自建看门狗（免 timeout 包装）；采样 驱动 RSS/pcpu + 两级子树 RSS + progress 尾行；RSS>950MiB 自动 `sample` 抓栈（60s 间隔≤5 份）；`CHENG_PROGRESS=1` 开带内相位遥测（stderr，进程退出 flush；`CHENG_PROGRESS_OUT` 文件通道在 dispatch_min 路径不生效——该路径 rich 相位走 system_link_exec 系，实测未达）。
- 修正版与全部轮次产物：克隆 .w/gen2_{base,trace,vm,zone,delta,delta2,w1a,w1c}/（rss.csv、summary、sample_*.txt、csg_trace.txt）。

## 二、死点定谳（基线轮 + 五轮不变量）

| 轮 | 驱动 | rc | wall | guard rss_bytes |
|----|------|----|----|----|
| base | f0cf2f4d | 125 | 400s | 1,093,272,944 |
| trace | f0cf2f4d +CHENG_CSG_TRACE | 125 | 402s | 1,078,199,688 |
| vm | f0cf2f4d | 125 | 408s | 1,151,681,928 |
| zone | f0cf2f4d | 125 | 417s | 1,106,855,328 |
| delta | f0cf2f4d | 125 | 443s | 1,088,472,456 |
| delta2(16步进) | 4cf154ee | 125 | 531s | 1,076,643,208 |
| w1a(16步进) | 4cf154ee | 125 | 454s | 1,146,307,976 |
| w1c(逐源) | 051eebcf | 125 | 410s | 1,088,226,672 |

- **守卫发射者**：`src/std/os.cheng:1793 processResourceGuardCheck`（自采样 `ProcessRssBytes`=Darwin phys_footprint，默认 1GiB，exit 125），调用点遍布 `compiler_csg.cheng` 内循环（16-步进守卫节奏）；裸格式行（无 guard_phase）与 host_ops 父方监控器（本轮驱动无子进程，排除）及 system_link_exec.cheng:4460（带 guard_phase 后缀，排除）区分定谳。
- **相位判词**：四份 stack profile（239s/363s/401s/515s，经 run_m2 `.primary.o.map` 行映解析 `cheng_cold_<salt>_<fnid>`）全落在同一条链：

```
BuildSystemLinkExecPlanWithWorldAndChannelInto (sexec)
└ ccsg.compilerCsgBuildConsumeWithOverridesCoreInto:38130
  ├ 239s 平台段: compilerCsgBuildOrderedSourceProfilesRec → ParserBuildExprCallProfileExactInto
  │   → parserValueExprReadTreeFromTextMode → ParserValueExprTreeForwardingProductionsStrictValidateInto
  │   → parserInt64SeenInsert（wall154 forwarding 校验，CPU 大头 30%）
  └ 363-515s 死窗: compilerCsgBuildMetadataContextsRec:36526 → TypedExprBuildMetadataContextFromProfile:54671
      ├ typedExprBuildSealedGlobalBindings → TypedExprParseBindingLine → parser 逐行 owned-text churn
      └ TypedExprModuleConstScanContext → EntryForLine → ParserOwnedText/StripLineComment → buffer.AppendByte → cheng_malloc
```

- **CPU 形态**：全程 97-100% 单线程满转（主线程 thread_join 等 worker，worker 承载编译），无活锁；死=守卫在循环步进点拦截，非超时非崩溃。
- **机内锚点**（csg_stage 粗粒度 trace 轮）：`enter` 147MB/7.4 万活分配 → `after_profiles` **648MB/428 万活分配**（profile 相 250s）→ 元数据循环内无锚点（该循环无 trace 点），死于其中。

## 三、驻留分解（活产物 vs 可收残量，vmmap/heap 双口径）

死窗对齐采样（旧驱动 384s@1.04GiB ps-rss；W1 驱动 395s@footprint 679MB 与 471s@950MB）：

| 区 | 脏量 | 性质 |
|----|------|------|
| MALLOC_SMALL（<256KiB 块） | 498-520MB | 活载荷 ~165MB（4.4M 节点直方图：16B×1.9M+32B×1.7M+…）+ 逐分配 ChengMemHeader ~142MB（4.4M×32B）+ free 棘轮 ~200-250MB |
| VM_ALLOCATE（mmap ≥256KiB） | 269-305MB | 全活（free 即 munmap 归还；wall150 阈值生效中） |
| MALLOC_LARGE + (empty) | 68+72MB | 活 68MB + 空置未还 72MB |
| quarantine | ≤48MB（封顶） | 毒化网，红线禁触碰 |

- **活集下限（死窗）** ≈ SMALL 活 300 + mmap 305 + LARGE 活 68 + quarantine 48 ≈ **~720MB 且随元数据循环继续单调增长**（515s 仍在 CloneStr/PathTrim 热链）。
- **footprint 亚秒尖峰**：heap 采样实证 current 612-679MB 时 peak 已 987MB-1.0GiB——+300MB 级瞬态（大源单批物化×分配即清零 `cheng_bytes_set`）叠加在活基底上，守卫拦的是「活增长+尖峰」复合。
- 可收残量（free 棘轮+空置 LARGE）≈ 250-320MB，见 §四实测不能改变死点。

## 四、W1 实验账（两节奏，全冷禁缓存，烤机串行）

- **16-步进节奏**（每 16 源一次 `os.ProcessMemoryPressureRelief()`=malloc_zone_pressure_relief(nil,0)，插既有守卫节奏点，bind 边界同机制先例）：编译过（w1a rc=0 wall 251s），vmmap 实证 SMALL 脏 520→258MB（归还真实生效）；**死点 RSS 不动**（1.146GB@453s），最好轮靠运行方差活到 531s。
- **逐源节奏**：w1c rc=0 wall 247s；死点 1.088GB@410s——归还收益被逐源再缺页减速抵消，死点更早。
- **判定**：死点 RSS 对归还节奏零敏感 ⇒ 死窗由活产物主导。补丁未过任务书验收链③（死点 RSS 单调下移且与释放账对得上）→ **不交付，克隆两处 hunks 已逆序还原**（收工态 compiler_csg.cheng diff 与主树在途 diff `diff` 全等实证）。
- 教训入档：机制级「还 free 页」只能治 wall150 型棘轮，治不了活集超帽；活集型墙必须动数据生命周期或架构。

## 五、架构性定谳与 P4 立项材料

**活集下限账**（同闭包 239 源/683k 行，单遍全量物化，语义保持前提）：

| 相位 | 活产物 | 量级 | 最早合法释放点 |
|------|--------|------|----------------|
| profile 相（exprCallProfiles+decls+lineStore arena+sourceSnapshots+typedSourceTexts） | 下游 slices/expr-layer 消费 | 648MB 实测（含 ~200MB 可收棘轮） | slices 后（死窗之后） |
| 元数据上下文相（typedMetadataContexts：逐 binding/scope/串独立分配） | 下游 slices/expr-layer/typedIr 消费 | ~450-600MB（死时 75% 进度外推） | terminal（现状） |
| slices/expr-layer/typedIr 相 | typedIr 为 streaming lowering 输入 | ≥224MB（batch2 after-primary 锚） | after-primary（已最优） |
| emit 窗（words+frozen+lines） | 发射本体 | words 178MB（R1/R2 已收副本） | l3b2/batch2 已收 |
| quarantine | 毒化网 | ≤48MB | 红线 |

合计下限 ≈ **1.5GiB > 1GiB**，逐相位错峰亦不能同时 <1GiB（相邻相产物交接窗即 ~1.1GiB）。**逐墙释放点路线在本架构内到墙 #1 即止损，非执行不力。**

**P4 立项材料（按 docs/memory-time-limits-plan.md P1/P4 既有框架补实测输入）**：
1. **条目化波次编译**（P1 运行时化，首选）：`BuildCompilerCsgConsumeWithOverridesCoreInto` 的 239 源单遍改为按 manifest 条目分波（波宽=条目闭包子集），波边界=profile 相+元数据上下文相产物整体 terminal 释放 + 波界 `ProcessMemoryPressureRelief`（本线已实证的既有机制）。活集从「全闭包常数」降为「单波工作集」，按 35 条目/波估活集 ~350-500MB。确定性命门：波序=decl-order、符号 row 保 DFS 序（P2 先例）。
2. **按需物化**（P4 本体）：typedMetadataContexts 逐 binding 独立串是最大活产物，改 intern/arena 化（一行一 InternId，对标 lineStore 既有范式）可收 ~300MB 级 + 逐分配 header 142MB；属结构手术，须字节铁门配对。
3. **mmap 驻留**：源文本三拷贝（snapshot+typedSourceText+arena lines，W2 旧标签）实测仅 ~60MB，非大头，降级为顺手项。
4. 资源面实测输入齐备：死点不变量、活集分解表、16-步进归还先例、`.o.map` 行映解析法（栈帧→源函数，P4 验证可复用）。

## 六、组合装配路径（主线程 0906 数据点对账）

- d1 载具死点 1,128,924,576B 与本线 kernel-only 死点（1.088-1.152GiB）同量级，死因同墙（compiler_csg 相活集）；本线无释放批次交付，`tools/build_plugin_driver.sh --arch aarch64` 装配复测无前置触发，移交主线程随 P4 波次编译一并验收。
- manifest 扩容（37→201 声明）后活集增量方向与 P4 波次化收益同域，`composition_manifest.cheng:263` declared==actual 硬门若先触发按该行判词定性（本轮 35 条目路径未触发）。

## 门禁表

| 门 | 结果 |
|----|------|
| 探针采样修正（直取 PID+带内遥测+迟段抓栈） | PASS（8 轮全部命中驱动进程） |
| 死点基线定性（相位判词+曲线+CPU 形态） | PASS（五轮不变量 1.088-1.152GiB，compiler_csg 元数据循环，无活锁） |
| 驻留归因（帧级+vmmap+heap+机内账本四路互证） | PASS（活产物主导，链路逐帧解析到源函数行号） |
| W1 机制级修复验收链③（死点 RSS 单调下移） | **FAIL（两节奏）→ 不交付，还原** |
| W1 编译通过/烤机 rc=0 | PASS（w1a/w1c 均 rc=0，wall 251/247s vs m1/m2 205/208s，+43/39s 为机制换页成本+负载噪声混合，未深究因补丁不交付） |
| 克隆收工态=进场态 | PASS（diff 与主树逐字节全等） |
| GEN2 rc=0 | **止损（架构性，§五）** |
| GEN3 固定点 | 未达（前置 GEN2 未过） |

## 纪律记录

- 主树零代码改动（唯一写入=本文件）；无 patch 交付（无穿墙）；未 commit、未建分支/worktree；bootstrap/ 零接触；验证层（exact-def 族）零改动。
- 烤机全程串行（8 轮：sanity 25s+base/trace/vm/zone/delta2 探针+w1a/w1c 烤机），每轮前 ps 核无他烤；收工时发现的在跑 cheng 进程属他线克隆（snap_split 门进程），只记录未触碰。
- 临时目录=克隆 .w/，大对象（两轮 189MB 烤机产物）已清，保留 ~6.6MB 文本证据（csv/summary/sample/csg_trace/脚本）。
- 违纪自首一次：W1 收紧节奏时使用 heredoc 内联 python 落盘（shell 纪律违反，结果正确；后续文件改动已全部回到编辑工具通道）。
- 无降级无兜底：W1 实验件全部带 [GEN2-LADDER] 标记与三要素论证，验收不过即还原，未进主树。
