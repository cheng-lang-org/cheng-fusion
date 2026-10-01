# M3 前沿刀——D6+X2 重排落地轮终报（merge pass-0 234/234 穿越）

线：`.rebuild/m3fix_line/`（产物独占）。2026-09-20。
裁决执行：路线①（D6+X2cut）+四条硬条件；C2 维持 M4 独立刀。
**终态：三 commit 已入库并推送（61025e9c0..69fa6c349）——merge pass-0 全量 234/234 穿越（M3 时代首次），typed_expr 判点位穿越，确定性契约 234/234 零失配；pass-1 = 下一墙（两子墙，见 §5）。**

## 0. 四件套

1. **刀改动规模**：`m3fix_knife.patch`（compiler_csg.cheng，155+/27−：D6 预量道+精确 reserve+确定性门+X2 段相序重排）+ `m3fix_wedges_typed_expr.patch`（typed_expr.cheng 两枚楔子还原，2×2 行）。三 commit：`1c1b9148b`（主刀）/`4f25fca0a`（facts_fail_2）/`69fa6c349`（facts_ctx_init）。身份链：pristine base commit→冻结 patch→树 sha 断言（`d6_patched_file_sha.txt`/`d6_typed_expr_wedge_sha.txt`），三补丁联 preflight PASS。
2. **预测-实测对账**：B1 预测 spike=u+old(u)，两窗 dev≤0.11；改后实测 spike=139.4 MiB（=u 133.76+5.6 bump，无旧块项）对照同点改前 261.9——**B1 消灭 −103 MiB 实证**。typed_expr u 预测带 109.5-307.4 收敛为实测 **134.1 MiB**（140,603,584 B，与 primary_object_plan 133.76 几何同量）。确定性门：measure 道 vs pass-0 逐源 ArenaUsed **234/234 逐字节相等**。
3. **门轮终态**：`m3fixd6_default`（768MiB 门恒定，kd=25a9a598，金丝雀 2/2）：**forest_parsed=234/234**（既定门判据「merge 穿越」达成）；src=61 @663.8MiB ✓；typed_expr(src=134) @643.0MiB ✓；pass-0 峰 663.8 MiB（余 +104）。**pass-1 下一墙两子墙**：(a) X2 驻留使 pass-1 地板 776.6MiB 超门→X2 projection 刀（typed_expr 域，独立战役，全部常数已钉）；(b) pass-1 src=13 流式解析权威跨源可见性缺陷（`nominal declaration is not visible name=Result`，从未抵达的新领地，非本刀域）。
4. **置信度**：高。判点机理三窗（937/915/本窗）一致；所有验收读数来自仪器行；确定性契约在体验证。残余：pass-1 未到底（子墙 a/b），reachable set 缺项 +80.4（登记）。

## 0.5 过程要事（如实记）

- v1 烤制 16s 死于类型门禁（`work.字段`绑 plain 托管形参）→ 形参改 `var int32[]`（相邻列同款先例）。
- v3 门轮首跑死 typed_expr parse 拒：**协调方 wedgescan_line 的 facts_fail_2 楔子=直接成因**（探针楔在调用参数表中间），该移除件由「主刀后追加步」提前为主刀穿越前置件。
- v4 门轮二跑暴露**第 4 枚楔 facts_ctx_init**（空套件形态，与规则 10-①事故二同族）→ 新冻结件 `orcd9_wedge4_facts_ctx_init_typed_expr.patch` + 全域扫描器 `wedge_scan.py`（argzone/empty-suite 双形态，O8SITE 17 枚定谳：仅 2 楔，余 15 合法，不外溢 typed_expr）。
- 一次外部清扫删除整个 `.rebuild/clone_roots/`（含在烤 root，编译死于 materialize 相 toolchain root 打不开）——重建重烤，如实记。
- 门轮用 shell `&` 脱管一次即纠正为受追踪后台任务（纪律 8）。

## 5. 下一墙（2026-09-20 晚重裁版；本刀实测常数维持有效）

本刀门轮实测常数（X2 域输入）：typed_expr u=134.1 MiB；column_bytes=68.8 MiB；index_live=35.8 MiB；X2 段驻留 +105.6（orcd12m 窗）/+174.6（本窗）；pass-1 地板 776.6 MiB（X2 驻留形态）；reachable set 缺项 +80.4（登记）。

**重裁一（x2cut_line）：X2 projection 刀预测先行判 RED**——简报预算漏环前两栈 +135.5MiB（p1 TypeArena 预量 105.4 + exact-index 30.1），参数箱全域 FAIL，无 slab 下界证明 773.8>768 在案（`.rebuild/x2cut_line/REPORT.md` §7）。墙 (a) 重裁为 **(iv-f)=phase-1（idx 延迟+D6v2，建刀中）+ slab 三刀（.rebuild/slabdesign_line/SLAB_DESIGN.md 刀序；刀1 建刀中，刀2 带 62MiB 停线门）**，地板槽时 ≈10-14h，现实 24-40h。

**重裁二（p1vis_line，commit e2ff96144）：墙 (b) 非权威缺陷**——本刀门轮 src=13 `Result not visible` 判词正确，根因=源侧 4 行缺失 import（codegen_a64_body_units/codegen_a64_link_units/codegen_contract +std/result；cas_fetch_subprocess +std/rawbytes；修复集 f5d9db72a 只落 5/8 的漏网，git 重建 clone 即回滑）。p1vis 抬门诊断绿轮（3.6GiB）已穿越 src=13/15/16/155+全部权威相+r92 观察相（wall=2646s，not-visible 全程 0 例），枚举臂另抓静态盘点漏网 cas_fetch rawbytes（共 4 hunk）。

**正确性前沿（后续线在飞）**：static-arg 族（ownership_drop_ir.cheng:1809，R1 线移交已知族）根修烤制中；WDFS 已入库（ac41af29e）。本刀 kd_m3fixd6=69fa6c349 代驱动，GEN 接线验证够用；正式 GEN 轮须换最新 HEAD 驱动，GEN 尾巴 1h 预置。

## 5.5 分支 B verdict 同步（2026-09-20 晚，会话自派 c1/c3/c6 复测线）

**bin=no（3/3），U 组不解锁**（fusion-plan:343 c1/c3 bin=yes 未满足，a9b_wait_and_run.sh 已验就绪不发车）。增量重大：**原 W1/W3 判词均不复现**（本刀 D6+X2 重排 + R5/R6 + ORCD11 累计生效），接墙全换新位点，三夹具均 ABORT rc=3 exit_code_contract_mismatch：

| 夹具 | 新判点 |
|---|---|
| c1 | normalized expression parser node missing kind=5 @std/result.cheng:51（泛型声明头） |
| c3 | unresolved structural Call callee=range |
| c6 | resolved call missing concrete type __cheng_cstrlen @cmdline:178（旧 static-arg 墙位 146 前移，疑与在飞 staticarg 刀同根） |

回执+22 件原始件在 `.rebuild/branchb_line/`（verdict sha 23a3780f）。三新族裁处线已派（族归属+刀设计，零烤）。旧 §3.3 W1/W3/W2 行的判点归属 branchb_line 文档改判；本线不持该账。外部清扫的回执转正镜像由协调方收割轮统一做。



## A0. 四件套（预测先行轮存档，D6 落地前）

1. **刀改动规模**：活树源码改动 **0 行**。产物=校准读数（`orcd12m_cal_*.{txt,csv}`）+ 修后形态预测器（`m3fix_predict.py` / `m3fix_predict.txt`）+ 本报告。
2. **预测-实测对账**：B1 模型（spike=u+old(u)）在 ORCD12m 新窗 src=61 预测 261.76 / 实测 261.88 MiB（**dev +0.11**）；36 个 ≥1MiB 源 mean |dev|=1.49。修后形态预测见 §3：主比带上**唯一达标形态 = D6+X2cut**（typed_expr 点最坏主带峰 701.9 MiB，余量 +66.1），任何 compiler_csg-only 形态（B/C/E/F）主带即不过线。
3. **门轮终态**：未烤。**下一墙**不是 typed_expr 位而是**裁决墙**：X2 floor cut 的全部安全形态都在 typed_expr.cheng 域内（§4 证据链）；按任务纪律「X2 若必须动 typed_expr 先报告等裁决」停在此处。
4. **置信度**：高。判点机理与 B1 预测式在两个独立窗口逐字节闭合（dev ≤0.11 MiB）；形态预测的输入（floor 序列、X2、bump、比带）全部来自实测读数，无估计充数；X2 读取面为源码实读证据（行号在案）。不确定项：typed_expr u 带宽（109.5-307.4 MiB，max 档受小源离群污染，主带 109.5-155.9）。

## 1. ORCD12m 新窗校准（对协调方指引的回应）

- 击杀点：`forest_parse_end pass=0 src=61 arena=140260800 rss=915719368` → 守卫同值击杀（873.3 MiB，超线 105.3）。分解：floor@61 601.6 + begin bump 9.86 + u 133.76 + 旧块共存 128.0 = 873.3，**逐字节闭合**。
- 与 ORCD11 窗的结构差：X2 相 Δ 从 +124.4 → **+105.6 MiB**（ORCD12 typed_expr 刀已削 ~19 MiB）；after_reachable_function_set 后 floor 从 602.8 → 585.5；floor 拟合 0.223 MiB/源，floor@233 ≈ 641.6。
- B1 预测器对齐确认（协调方要求项）：`extract_mem_attrib.py` 对 915MB 读数 spike 预测偏差 +0.11 MiB，预测器与最前线读数一致。
- reachable set 无锚缺项两窗一致（+76.6 / +76.3 MiB），见 §6 登记。

## 2. u 同构性定谳（D6 度量前移的前置审计）

D6 要求 pass-0 解析前拿到该源的精确 arena 终值 u。审计结论：**现存管线不存在 pass-0 之前的同入口 u 生产者**。

1. profiles 相解析入口是 `parserBuildExprCallProfileSyntaxInto`（parser.cheng:31473）→ `parserReadFunctionDeclsLinesMode`（lines 模式），**不是** value-expr tree 入口 `ParserValueExprReadTreeFromTextReserved`——u 不等价（归因线 §7-2 的「u 同构性需核对」在此闭合：不同构）。
2. 全仓 value-expr tree 入口仅 5 处调用（compiler_csg 34182/34356/36820/36983/37290）：34182=pass-0 自身、37290=pass-1（消费 pass-0 测量）、36820/36983=streaming 内 replay/sweep（在 pass-0 之后）、34356=receipt-tree 通路——被 `reuseLinkPlanExprLayer` 门死，该复用路径为结构不可达（compiler_csg:34082-34112 硬失败注释 + 全部历史运行 `mode=reparse` 实证）。

⇒ 度量前移唯一可实现形态 = **pass-0a 同入口预量道**（每源多一整道 parse，+~55s 壁钟）。挂点核算：最低现存挂点 after_profiles（403.6 MiB）处 typed_expr med 带瞬态 749.5 已破 734 判据线；前移到 after_binding_source_texts（231.6 MiB，源文本快照全量已驻）则 med 带回门内（577.3，余 +156.7）。早挂点入口选择已无障碍：`migrationSourceSyntax` 是 build 全局量（`linkPlan.parserSyntaxTag`，compiler_csg.cheng:40725-40727），非逐源旗标。或放弃度量前移、由 C2 免重解析消双道（归因线首选方向 1，任务划出本轮）。

## 2.5 D6 实施记录（本轮）

补丁：`m3fix_d6.patch`（sha256 5122146b…，114 insertions/1 deletion，单文件 compiler_csg.cheng，8 处精确锚编辑，apply 脚本 `apply_m3fix_d6.py` 逐锚唯一性断言）。`patch_preflight.py` **PASS**（ann=0 displaced=0 wedged=0）。身份链：head 757d6ab056cb → pristine base commit → apply → 树文件 sha 记录于 `d6_patched_file_sha.txt`，bake 脚本烤前逐字节断言。

首次烤制（patch v1 112c583c，16s）死于类型门禁：`work.字段` 绑 plain 托管形参（borrowed actual cannot bind non-var non-@borrows formal，formal_ordinal=9）。v2 修法=新形参改 `var int32[]`，与相邻两列（sourceArenaBytesOut/sourceColumnCensusOut）完全同款（field→var-formal 先例已证）；只读使用 var 形参无害。

八处编辑：①work 结构体新增 `typeArenaForestSourceArenaReserveMeasures: var` 同款 int32[] 列（约 936B 常驻，随 working set 整体 teardown，无手工释放位）；②新增 `CompilerCsgMeasureSourceArenaReservesInto`（预量道：快照文本→rewrite→**与 pass-0 同入口** parse（reserve=0）→ArenaUsed→立即释放；16 源一档守卫检查；每源 churn relief；memtrace `forest_measure_begin/end`）；③authority 签名新增 `sourceArenaReserveMeasures: var int32[]`；④authority 入口覆盖前置（len≠源数 → hard fail，禁默认 reserve）；⑤pass-0 `sourceArenaReserve = measures[i]+65536`（替 `=0`）；⑥pass-0 **确定性门**：`ArenaUsed != measures[i]` → hard fail（同文本同入口必须逐字节复现，失配即补丁确定性破坏，let-it-crash）；⑦driver 调点传列；⑧挂点=**after_sort_sources 后、snapshot index 安装后、line-arena/profiles 前**（floor 259.5 MiB，全窗最低可达位）。

挂点合法性证明：`migrationSourceSyntax` 是 build 全局量（`linkPlan.parserSyntaxTag`，compiler_csg.cheng:40725-40727），逐 profile 只是复制该值（:38894/:30682），无逐源写者——预量道用全局旗标选入口与 pass-0 的逐 profile 读取**同构**。确定性门在烤后门轮对全部 234 源逐一在体验证。

预测（orcd12m 窗基）：预量道自身瞬态 src=61 516.9 / typed_expr med 605.2（挂点 floor 259.5）；pass-0 精确 reserve 后 src=61 峰 745.3（穿 M3 判点，余 +22.7）；typed_expr pass-0 位 u 实测前不可判——**本轮门轮的第一目的就是钉死 u 带与 pass-1 的 index/columns 字节（X2 cut 的列清单合同输入）**。D6 单独不达标（B 形态），X2 cut 是下一刃，不因本轮门轮结果深浅而改变。

## 3. 修后形态预测（`m3fix_predict.txt` 全表；判据=全点位 ≤734 MiB）

两窗一致（此处列 ORCD12m 主带规划数，max 比带为对抗敏感性）：

| 形态 | src=61 峰 | typed_expr 峰（主带 med 155.9） | 判 |
|---|---|---|---|
| A 现状（reserve=0） | 874.8 | 935.4 | 击杀（两窗实测同判） |
| B D6-only（瞬态=u） | 746.9（余 +21.1 <34） | 807.5 | **不过线** |
| C X2cut-only | 769.2（超门） | 829.8 | **不过线** |
| **D D6+X2cut** | **639.7（余 +128）** | **701.9（余 +66.1）** | **唯一主带达标**（对抗带 hi 853.3 不过，归因线同口径以主带为规划基准） |
| E D6+X2-defer（pass-1 前重建 X2） | 639.7 | pass-1 位 807.5 | **不过线**（X2 回驻后 pass-1 大源必杀） |
| F pass-0a 度量道 | 688.8（余 +45.2） | 749.5（med 档破线；lo 档 638.9 过） | 仅 D6 前置件，单独无意义；med 带下度量道自身破线 |

要点：**B/C 单独不达标的归因线结论在削掉 19 MiB 后的新窗依然成立**；组合形态 D 的达标性对 typed_expr 的 u 估计带宽敏感（u≥171 MiB 即破 734 判据线），落地轮必须用门轮实测 u 钉带。

## 4. 裁决项：X2 floor cut 必须动 typed_expr.cheng（证据链）

X2 = merge 窗驻留的 `work.typedMetadataContexts`（ORCD12m 窗 +105.6 MiB）。compiler_csg-only 的任何削减/搬移/重建形态都被以下四条源码事实封死：

1. **pass-0 不读 contexts**（compiler_csg.cheng:34135-34313 无 contexts 引用）——cut 对 pass-0 无障碍；
2. **pass-1 硬读**：`CompilerCsgStreamTypeArenaFromDeclarationIndexInto` 在入口即调 `TypedExprBuildSourceContextExactIndexWithManualAuthority(work.typedMetadataContexts,…)`（compiler_csg.cheng:37087）并取 `contexts[0].buildIndex`（:37108）作全程 append 注册目标；exact-index 构建逐上下文读 metadata 列，且 `moduleConstScanned=false && lines.len<=0` 直接 panic（typed_expr.cheng:38962-38964）——**contexts 就是 pass-1 的核心工作集**；
3. **r92（merge 后）继续读**：compiler_csg.cheng:39289/39356/39558 → typed facts 构建/语义身份读 `scopes/bindings/declaredTypes` 等（typed_expr 内 35 处 `.lines` 族读面 + 列消费）——contexts 在 merge 后仍是活工作集；
4. **merge 后重建不可行**：X2 构建输入（profile lines payload、lineInternPool/lineStore）恰在 X2 段内被释放/复位（compiler_csg.cheng:39027-39028、41195、41266）——先释放再重建=无米之炊。

⇒ X2 cut 的安全形态只有两种，都在 typed_expr 域：(a) contexts 投影化（buildIndex 承载全部 merge/r92 所需行，contexts 降为按需 materialize 的回放体——typed_expr 内已有 frozen-projection 机制 `typedExprBuildFrozenMetadataProjection`/`typedExprFrozenMaterializeContext`（:42021/:42331）可作载体，但无 compiler_csg 可达的公开入口，接线即改 typed_expr）；(b) 把 pass-1/r92 的 context 读取面收窄到 buildIndex 后释放余列（同域改动）。
**请协调方裁决**：放行 typed_expr 域改动（ORCD12 合并线已收官，域是否解冻），或改走 C2 独立刀。

## A5. 建议路线（裁决后存档；路线①已执行，其中 X2 projection 形态经 x2cut_line 预测先行判 RED，重裁见顶部 §5）

- **路线一（本轮刀的完整形态）**：D6（pass-0a 预量道挂 after_binding_source_texts（231.6 MiB，med 带 577.3 过，旗标 build 全局可得 §2）+ 234×i32 reserves 持久化 + pass-0 `sourceArenaReserve=u+页对齐余量`，点位 compiler_csg.cheng:34165）+ X2 投影化 cut（typed_expr 域，§4-(a)）。预测：src=61 639.7 / typed_expr 主带 701.9，余量 +66~128。代价：+55s 壁钟 + typed_expr 域施工面。落地轮用门轮实测钉 typed_expr u 带。
- **路线二（结构最优，维持归因线首选）**：C2 免重解析独立刀（消 pass-0/1 全部 reparse 与 B1 形态本身）：峰 ≈ floor@merge 585.5 + C2 池 34.8 + 回放工作集 ≈ 620-660，且时间侧 −55.3s。前置问题不变：C2 facts 域是否承载 pass-0 两产物（声明投影+sourceArenaBytes）。
- 路线一与路线二不混刀；若裁决放行 typed_expr，建议先做 C2 域承载面核查（零烤）再定先后。

## 6. 登记项

- **reachable set 无锚缺项**：+76.6（ORCD11 窗）/+76.3 MiB（ORCD12m 窗），构建点 compiler_csg.cheng:41160 `CompilerCsgSemanticBuildReachableTable`，两窗量级一致=结构性驻留（reachable set 名称/邻接/证书结构）。钉归属需专门的相位内字节账读数轮（非本轮 scope），移交模型线补 `VERIFY_tamem_model_append` 锚项；在补锚前该相继续按「>50MiB 必须解释」挂账。
- **X2 模型价修正**：ORCD12 刀后 X2 实测价 +105.6 MiB（≈451KB/源），约束卡 X2 价 645KB/源 已过时，随下次模型追加轮一并修正。
- 本轮零活树写入、零 commit；烤制未发生，槽全程未被本线占用。

## 7. 门轮预案（裁决通过后的下一轮用）

- 槽：`mkdir .rebuild/COMPILE_SLOT.lock` + owner.txt(pid) + EXIT/INT/TERM trap 释放（orcd11_bake.sh 同款）；金丝雀 2/2 先于一切判读（纪律 10-②）。
- 守卫：768MiB 恒定不抬；峰值判读按 CHANNEL_AUTHORITY 双口径（beat_c 回执 + rusage maxrss 权威，ps 序列仅同窗相对比较）；门轮脚本沿用 orcd11_gate.sh 形态（GATE_RSS=805306368、CHENG_RSS_GUARD_HF=1、csg_mem 全开），判读用 `extract_mem_attrib.py` 逐相贴线 + B1 对账。
