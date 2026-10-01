# P1PHASE1_LINE —— 墙 (a) phase-1 施工：exact-index 延迟 + D6v2 两刀（(iv-f) 前两组件，slab 另役）

线：`.rebuild/p1phase1_line/`（产物独占）。2026-09-20。基座迁移链：建刀 e2ff96144 → 烤制/commit 8c28eda74（他线 docs/duck 提交三次移动 HEAD，基座断言以「两文件字节等价」放行，编译器域零改动实证）。
**终态：两刀已入库并推送（56571f10e 刀一 + 2be4b0162 刀二），v8 驱动 kd=d62622f1 金丝雀 2/2，门轮双跑达标——floor 落预算带 + 穿越 13/15/16 + 爬深 src=63，verdict=KILLED_PASS1_EXPECTED（预期形态，spike 面归 slab 役）。**

## 0. 四件套

1. **刀改动规模**：三冻结补丁 `p1phase1_cut1_typed_expr.patch`（193 行：结构体旗标+core pass-1/2 抽取+deferred 四入口）+ `p1phase1_cut1_compiler_csg.patch`（93 行：入口/环内 append/环后 finish 三点）+ `p1phase1_cut2_compiler_csg.patch`（522 行：预量道兼产+纯读者+19 族对照器+驱动接线，其中 ~200 行为恒等对照器）。commit：刀一 210+/27−（双文件）、刀二 422+/28−（单文件）。施工侧产物：`build_cut1.py`/`build_cut2.py`（锚点唯一断言构建器）、`p1phase1_bake.sh`（基座内容等价断言+冻结施加身份 sha+槽 trap+金丝雀）、`p1phase1_gate.sh`（双跑判级）、`p1phase1_predict.py/txt`（预测先行）、`patched/`（pristine/cut1/final 三态快照）。preflight 三补丁联 PASS（ann=0 displaced=0 wedged=0）。
2. **floor 预测-实测对账**：预测带 [688.7, 714.7] MiB（残差回吐 19~45 中值 32 + idx 30.1 杠杆，`p1phase1_predict.txt`）；实测 **入口 floor（p1_merge_scan_done）= 713.2 MiB，带内**（判据一达标）。逐项贴线：payload 628.4→**604.2**（D6v2 残差回吐 **+24.2**，登记带内中值偏下）+ arena 步进 **+105.6**（不变，105.4 口径噪声内）+ 延迟骨架 **+3.5**（ctx_source/module-const/caches，预测按 <1 计入噪声，实际 3.5——落带偏上段的全部偏差即此项，无未解释项）。任务简报 ≈658 需残差 75.8（超登记带），预测器已预判不采纳；实测 713.2 印证带口径。
3. **门轮终态**：**KILLED_PASS1_EXPECTED**（768MiB 恒定不放宽，kd=d62622f1）。判据二 **穿越 src=13/15/16 = 1/1/1，not_visible=0**（p1vis e2ff96144 import 修复随基座生效，wall-b 关闭）；判据三 **爬深 src=63**（p1_begin=64，m3fixd6 窗=src=13，+50 源），kill 点=src=63 parse begin rss=769.4（贴 768 线），max_rss=910.6（全树 spike，slab 役标的）。measure 234/234、forest_parsed 234/234（measure 道承载连续性标签）。diag 轮（CHENG_D6V2_HARVEST_DIAG=1）：**D6v2 收获恒等 234/234**（19 列族逐字节+4 标量+census 全等，identity_fail=0，`d6v2_harvest_identity_ok` 收据行在案），diag 臂携 scratch 爬深 src=96（守卫采样节奏差异，恒等已在 pass-1 前入账）。跨窗计数（type_syntax 159644→159775 等）随 closure 演化不可比，恒等判词以同轮 A/B 为准。cut-1 单项收据 `p1_ctx_census index_live_bytes==37542811` 需 pass-1 完成轮观测（本轮环 src=63 击杀未达 finish），移交 slab 役首个完成轮补录；byte-identity 现由 pass-2 同产同序构造论证+穿越行为收据承担。
4. **置信度**：高（判据面）/高（恒等面）。判据三项全部实测闭合、逐项贴线无未解释项；D6v2 恒等为同轮 in-vivo 逐字节对照非推算。残余登记：①cut-1 census 字节收据待完成轮；②爬深深度的守卫采样节奏敏感性（default 63 vs diag 96 的 ratchet 差异，不影响判据）；③施工期类型门禁四轮迭代（v3 shared→var 转发、v5 var→var 转发、v7 ref-vs-formal 比较均被 body-store-freeze 硬拒，修法全部对齐 HEAD 既有 shape，见 §3）。

## 1. 刀一：exact-index 延迟（56571f10e）

- **机制**：streaming 臂 exact-index 拆两相。入口 `TypedExprBuildSourceContextExactIndexDeferredCore` 只跑 core pass-1（ctx_source/module-const/content caches/domain counts，置 `coreMetadataDeferredPending` 旗标）；metadata 注册（core pass-2）由 `TypedExprBuildIndexFinishDeferredCore` 在 merge 环后、call-declaration seal（:37843）前逐字节同产同序补齐（exact reserve + rehash 保容量一致，`index_live_bytes` 收据设计为精确对照）。环内改走 `TypedExprBuildIndexAppendSourceCallDeclarationsDeferredCore`（仅 call-decl 列族；enum 域归 finish——core 臂携带 `ctx_import_enum_type`（[B9] 臂没有），环内若走 [B9] 会在 finish 处 RequireFresh 双登记 panic，故环内跳过）。core pass-1/2 抽取自 `typedExprBuildIndexForContextsCore` 原文逐字节，全林路径（:32931、seal=true 臂）行为零变。
- **floor 效果**：入口 exact-index 步进 +30.1 消失（骨架 +3.5，见对账）；环后 core 物化 +30.1 落在无树瞬态窗（仅环完成才到达）。
- **body-store-freeze 施工记录（四轮迭代，教训沉淀）**：v3 shared 形参转发 var 被调 → 形参改 var（m3fix v1 同款）；v5 var 借用形参再转发 var 被调（plain fn）→「managed copy lacks exact source authority」——var 实参要求被调 @borrows（可变借用）或自有地，`FinishCallDeclarationsManualRec(@borrows)→AppendContextCallDeclarationsManual(@borrows,var)` 为合法先例；v3/v5 两版 `ref vs var 形参` 比较（字段直比/let 比皆然）均被硬拒为 defless managed copy（HEAD 先例只存在「字段 vs let」形），身份不变式改由 pending 旗标+驱动唯一调用点承担。

## 2. 刀二：D6v2（2be4b0162）

- **机制**（c2feas §5 草图逐条落地）：`CompilerCsgMeasureSourceArenaReservesInto` 同树窗口追加 census + `TypedExprTypeDeclarationIndexBuildSourceInto`（bases 随道累进，seal 移道尾，overflow 门随迁）；默认臂 pass-0 = `CompilerCsgHarvestParserForestAuthorityFromMeasuresInto` 纯读者（harvest 完整性断言：sealed+满程+census 满量，let-it-crash 不放宽）；诊断臂 `CHENG_D6V2_HARVEST_DIAG=1` 保留原 pass-0 parse，驱动 seal 后 `CompilerCsgD6v2HarvestIdentityInto` 逐族对照，失配 hard fail。
- **收益实测**：payload 残差回吐 +24.2（628.4→604.2）；p0 位峰 746.9 消失；时间 −50s 档（p0_parse 消失，p0_index CPU 随道前移不增窗，p0 memtrace/subtime 标签随迁保持 grep 连续性）。
- **施工修正**：reader 初版 census 门误写「空断言」与预量道已填产 contradict（金丝雀 minmain/ordinary 当场拦截，`harvest input invalid`）——改为满量断言后 2/2 绿。金丝雀判活纪律（规则 10-②）在 v7→v8 一轮内兑现拦截价值。

## 3. 门轮证据清单（本目录）

- `gate_p1phase1.stderr.txt` / `gate_p1phase1_diag.stderr.txt`（双跑全量 stderr；源 = `.rebuild/s1b_step3/r9/gate_p1phase1/`）
- `receipts_default.txt` / `floor_band_judgment.txt` / `verdict_p1phase1_default.txt` / `verdict_p1phase1_diag 判读行`（gate wrap log）
- `p1phase1_predict.py/txt`（预测先行）、`p1phase1_bake.wrap.log`、`canary_kd_p1phase1.txt`（2/2）、`.clone_root_manifest.txt`（root=8c28eda7+两刀，kd sha d62622f1）
- 上游引用：x2cut REPORT §7（预算 706.5/713.7 与两刀点位）、c2feas FEASIBILITY §5（D6v2 草图）、m3fix REPORT（D6 现状与 floor 锚）

## 4. 移交

1. **slab 役**（关键路径本体，x2cut §7.3-3）：本轮 floor 已就位（713.2），slab 落地后首预测峰 = 713.2 + slab带(14.8~22.0) + fixed 3 ≈ 731~738，硬线余 30~37、余量线贴线——与 (iv-f) 预算 706.5/713.7 的差 = X2cut（−10~25）尚未施工；cut-1 census 收据（37542811）在首个 pass-1 完成轮补录。
2. **X2cut**（补刀）：x2cut §4 载体图直接可用，与本两刀正交。
3. **模型线**：残差回吐实测钉值 24.2（登记带 19~45 收敛）；D6v2 后 payload 锚 604.2 供逐相贴线模型更新。
