# VERIFY_b3struct_append —— [B3STRUCT] 三刀落地+同树 A/B+零漂移验证+GEN2 止损边界图 2026-09-10

date_utc=2026-09-10 · 代理=B3-STRUCT（战役 R「B3 结构改造授权线」）· 克隆=/Users/lbcheng/cheng-f24/b3struct（基线 d9a080a21=主树 9dd7a2bcddc+工作态；刀态 HEAD=5c40cfe10）· 车头=/tmp/cheng_cold_v2（sha 987832510c…）· bake_win 锁全程 · 全轮 900s 帽零抬帽（代码内 1GiB 硬门零改动，GEN2 以驱动自带的 CHENG_PROCESS_MAX_RSS_BYTES=805306368 子进程门为准）

## 一、结论先行

**五件交付、一项如实记红：①三刀全部落地（typed_expr/intern 语义域+compiler_csg 组装区，commit bec3debb9→5c40cfe10）——刀③ line-intern 文本收敛到 dedup 安全边界整批归还（删除逐行 refcount+InternPoolClearTextAt 机制）、刀①② seal 重排（index-vs-context 全量校验前移到 projection 构建之前，pass2 逐上下文压实后 store-barrier 立即释放全量字符串/数组，下游五个索引构建+compact canonical index+derived index 全程零全量 contexts）+有界 scratch 改造（三段全文件行走查的逐轮暂存提升重用）；②同树配对 A/B 定谳：无刀 control GEN2 trip 842.1MB，刀态五轮 811-836MB（中位 ~828）——刀净改善 ~13MB，方向正确；③配对四夹具门零漂移成立：刀/控双驱动 4/4 PASS、24 行判词中 23 行共享行逐一相同（1 行为日志截断伪差），探针 RED/STALE 分位变化与主线程批次七树级漂移一致（双驱动同谱）；④**GEN2 ≤768MiB rc=0 未达成**——最佳轮 811.1MB，距门 5.8MB，距中位 23MB；⑤按止损条款移交精确边界图：窗内棘轮主体=TypedExprBuildMetadataContextFromProfile 三段全文件行走查的 ~74 万活块滞留（分组 census 铁证 contexts 权威仅 0.054MB/源、占爬升 1.8%），阶段归因 globalBindings 50.7%/decls 循环 33.1%/type 块行走 14.7%，逐 callee 探针显示逐轮释放系统性滞后——需要 allocation-ledger 站点级归因或 ORC 循环体释放审计（语义权威邻接域，本线不动）。**

## 二、核账轮数据（CHENG_CSG_MEM_TRACE 梯子，acct 系）

### 2.1 分相梯子（acct2，刀态 trace1）

| 点位 | rss(phys_footprint) | live_allocs |
|---|---|---|
| import_edges_resolved | 348.3MB | 888k |
| before_semantic_decl_import_tables | 402.1MB | 961k |
| after_semantic_reachable_table | 423.7MB | 980k |
| metadata_start | 423.7MB | 980k |
| metadata src=16 | 469.4MB | 1.079M |
| metadata src=48 | 580.6MB | 1.194M |
| metadata src=128 | 798.6MB | 1.677M |
| trip（src≈132-140） | 840.2MB | ~1.68M |

### 2.2 分组 census（contexts 权威，acct3/acct4 同型）

src=128 累计 total=6.92MB（外推 230 源 ~12.4MB）=0.054MB/源——**窗内爬升 +2.93MB/源 中 contexts 占 1.8%**；snap/typed 各 30.5MB（typedSourceTexts=第二份全量快照，待钉区⑦实证 30,484,036B）全程平；pool_logic=21.6MB/pool_struct=9.4MB/line_store=2.6MB 全程平（刀③按设计生效）。

### 2.3 阶段归因（tstage 探针，acct3；梯子差分归属前序阶段）

| 阶段 | 活块净增 | 占比 |
|---|---|---|
| typedExprBuildSealedGlobalBindings（全文件行走查） | +374,180 | 50.7% |
| decls 循环（scope 构建族） | +244,224 | 33.1% |
| type 块行走查 | +108,426 | 14.7% |
| importEdges+ModuleConst | +9,288 | 1.3% |
| lineIndex 构建 | +2,420 | 0.3% |

parser.cheng 单源梯度（acct4 p2d，968 decls）：线性 +24.7 块/decl，无跳变——逐 decl 均匀滞留，非特定 decl。**这些块不属于任何 census 可见结构（contexts/池/store/快照/profiles 全平），且 ~74 万块 × ~540B ≈ 窗内 +350-400MB 的主体。**

## 三、刀账（全部在授权 face 内）

| 刀 | commit | 落点 | 实测效果 |
|---|---|---|---|
| ③ line-intern 批量归还 | bec3debb9 | compiler_csg.cheng：删 CompilerCsgLineTextRefCountsBuild/CompilerCsgProfileLineTextsRelease（逐行 refcount+ClearTextAt），归还点收敛到 PhaseArenaLineStoreReset 的 InternPoolRelease 一处整批灭；intern.cheng 零改动（InternPoolRelease 即批量原语，逐行 str free 的在窗 churn 被移出峰窗） | 池文本窗内恒 21.6MB（acct3 census 平线）；行为与 38669 注释契约（InternId 只读域）一致 |
| ①② seal 流式压实+即释 | bec3debb9 | typed_expr.cheng TypedExprSealBuildSourceContextIndex：TypedExprBuildSourceContextIndex 全量校验前移到 projection 构建前；typedExprFrozenProjPass2Rec 每 context 压实后立即 TypedExprClearSourceContextAllFields | seal 时刻全量 contexts 在 pass2 扫内逐源归还；五个索引构建+compact/derived index 构建期 contexts=0（此前隔到 commit 后） |
| 有界 scratch（刀②构建时紧凑表示的落地形） | 5c40cfe10 | 同函数三段全文件行走查：decls 循环 declHeader/params/paramTypesForGenerics/genericNames/genericErr 提升重用+顶部 store barrier；globalBindings gbTrimmed 逐行重赋；type 块 twTrimmed 逐行重赋 | decls 斜率 24.7→21.5 块/decl（−3）；A/B 净 −13MB（含刀③净值） |

语义等价锚：①pass1 全量路径注册→pass2 逐 ctx 提取的依赖序未动；②校验前移不改变任何检查项（零弱化），失败路径均为 fail-stop 无重试；③InternId→text 只读域不变（行文本读者全在边界前）；④有界 scratch 仅改暂存生命周期，不动任何判定。

## 四、GEN2 战报（768MiB 门，全轮 rc=125 如实记红）

| 轮 | 驱动 | trace | trip bytes | 备注 |
|---|---|---|---|---|
| acct1 | base1（旧主树 c5583ec 基线） | 无 | 814,744,728 | 旧树基线 |
| gen2ctrl | ctrl1（同树无刀 control） | 无 | **842,106,032** | 同树 A/B 基准 |
| acct2 | knife1（三刀） | 有 | 840,172,720 | |
| acct3 | probe2 | 有 | 828,736,688 | |
| acct4 | probe3 | 有 | 820,774,064 | |
| acct5 | probe5 | 有 | 836,207,792 | |
| acct6 | probe6（+有界 scratch） | 有 | **811,058,352** | 最佳轮，距门 5.8MB |
| gen2a | probe6 | 无 | 833,340,592 | 无 trace ≠ 更低：run 方差 ±20MB 为主 |

**判读**：刀态中位 ~828MB vs 同树 control 842MB=净改善 ~13MB；距门残余 ~23MB（中位口径）。窗内棘轮机制未清前，达门不可期（详见 §五边界图）。GEN3 未串行（GEN2 未 rc=0，配方闭环前置缺失）。

## 五、止损边界图（移交主线程裁决）

1. **窗内活块滞留机制（本墙主体，~74 万块）**：位置=typed_expr.cheng `TypedExprBuildMetadataContextFromProfile` 三段全文件行走查（阶段归因见 §2.3），逐 decl/逐行均匀滞留（parser.cheng 梯子线性 +21-25 块/decl），census 全覆盖contexts/池/store/快照/profiles 后仍不可见 → 滞留对象=行走查自身的逐轮暂存产品（header 重建/params 解析×2/normalize join/ParseTypeFieldLine 族）。有界 scratch store-barrier 仅收回 ~3 块/decl——**逐轮释放系统性滞后，疑似 ORC 循环体作用域退出释放的延迟/合并行为或 registry 记账侧滞留，静态读码无法定谳**。建议：①激活运行时 allocation ledger（chengAllocationLedger* 1M 记录带站点）做站点级归因；②或对 typedExprBuildSealedGlobalBindings/decls 循环做 ORC 释放审计（后端 realizer 域）。该函数为语义权威构建点，本线不越权改形。
2. **typedSourceTexts 第二份快照（30.5MB，待钉区⑦已钉）**：profiles 相入账存活到尾；与 sourceSnapshots 全量双持。建议主线评估快照单一持有（读侧经 snapshots 索引借用）。
3. **刀③ A/B 净值**：批内滞留 +21.6MB vs 逐行 free churn 移除——同树 A/B 净仍为正（−13MB 含其他刀），若后续在窗内棘轮破解锁后需再校准刀③的边界位置（per-batch 中粒度折中）。
4. **字节铁门受限**：直接 system-link-exec 同名产物对比被 parent-lease 墙挡（os atomic tree: parent lease unavailable——即主线已移交的「墙#2 ledger 会话」域）；本线以配对四夹具门判词零漂移+门内产物 PASS 代偿，字节级对比需在 gate/认证烤机 harness 内补做。
5. **GEN2 方差**：同态五轮 811-836MB（±20MB），机器负载（兄弟线烤机并行）与内存压缩噪声为主，静窗轮次可再收窄。

## 六、模型补遗回填（VERIFY_b3struct_model_append.md §二实测列）

- metadata_start 实测 423.7MB（含 reachable 406MB+semantic tables +17MB）；contexts 0.054MB/源（61KB 口径再证实）；pool_logic 21.6MB/pool_struct 9.4MB/line_store 2.6MB；snap=typed=30.5MB 双快照；decls=17,169。
- seal 计量行（typed_seal）已插装；GEN2 窗内 trip 未达 seal，实测回填待 GEN2 rc=0 轮。
- 相 3 爬升修正：+2.93MB/源（其中行走查滞留 ~2.87MB/源、contexts 0.054MB/源）。

## 七、纪律记录

- **违章一次自首（重大）**：工作克隆曾被主树侧清扫整体删除（cheng-f24 下 b3struct/tamem2/b3r 等多克隆同轮消失；disk guard/scavenge 均只清 /tmp，非本次肇因），丢失两个已 commit+未推送的中间提交与一份未提交刀面；重建后全部重放（本档 commit 链可溯），此后所有交付物以 bundle 双写主树 patches/（b3struct_knife_bundle.bundle 全量 + b3struct_knife2.bundle 增量）。
- 违章一次自首（小）：bs_bake.sh 首版 trace 参数解析错误（"1"≠"trace1"）导致 acct1 轮 CHENG_CSG_MEM_TRACE 未生效——该轮作为无 trace 基线保留（814.7MB），梯子轮以 acct2 起算。
- 微探针（probe_leak）留档 fixtures/，其编译因「entry module identity」包根规则未走通，未影响主线（ORC 释放语义改由线上 A/B 判定）。
- 判定表生效：GEN2 连续 trip ×5 为同墙逐轮新增证据（同树 A/B/梯度/逐 callee），非盲重试；>10min 病理零记录（最长 330s 自收敛）。
- 主树足迹=patches/ 三件（b3struct_knives.patch+两 bundle）+本文档；源码零接触（iface 零 diff：c5583ec→9dd7a2bc 三 face 文件逐字节相同）。
- 刀态克隆保留 /Users/lbcheng/cheng-f24/b3struct（HEAD=5c40cfe10），全部轮次证据在 .w/bs/self_*/（bake.log/csg_mem/csg_memgrp/rss_samples/vmmap）。
