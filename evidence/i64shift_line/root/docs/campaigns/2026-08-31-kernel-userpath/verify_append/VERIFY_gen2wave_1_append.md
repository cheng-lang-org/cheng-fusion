# VERIFY_gen2wave_1_append —— [GEN2-WAVE] 波次架构定谳（汇点封墙）+ 元数据相读视图刀

date_utc=2026-09-06 · 代理=GEN2-WAVE 线 · 克隆=/Users/lbcheng/cheng-f24/anchor_clones/gen2wave（进场态=主树工作树全量副本，进场 diff -rq 与主树全等）· 探针件=.w/gen2_probe_wave.sh（gen2_probe_drv.sh 配方+ROOT 改克隆）· 烤机壳=.w/wave_bake.sh（w1_bake.sh 配方）

## 结论先行

**波次编译线定谳：P1 波界释放在本管线拓扑内不成立（可达性+typedIr 两个全局汇点把全部 profile/上下文产物钉到 typedIr 构建终态），波次骨架无 RSS 可交付；改打元数据相逐行 transient churn（读视图刀），GEN2 死点归因经细粒度账本修正为「活增长≈账本可见的小对象流 + 交错棘轮」，刀效与终态见 §四。**

## 一、波次架构定谳（确定性论证 + 汇点封墙，替代 wall102 判据）

### 1.1 row 分配序清单（波次=升序连续切片时全部保序，论证闭合）

| 结构 | 分配点 | 序来源 | 波次保序性 |
|---|---|---|---|
| work.orderedSources | compilerCsgBuildOrderedSourcesRec + SortSourcePathModulePairs | (path,module) 字典序 | 波=连续切片，升序处理=同一全局序 |
| work.exprCallProfiles[i] | ProfileAppendMove 逐源 | orderedSources 序 | profile[i]=f(源文本 i) 纯逐源 |
| lineInternPool InternId | ProfileLinesInternIntoArena 逐源逐行 | 源序×行序 | intern 操作全局序列不变 ⇒ id 演化逐字节同 |
| typedMetadataContexts[i] | SourceContextAppendMove 逐 profile | profile 序 | ctx[i]=f(profile[i], typedSourceText[i]) 无跨源读 |
| reachableSet.functionNames 行 | ReachableAddFunctionsFromProfiles | exprCallProfiles 0..len | 不变相 |
| CSG nodes / typedIr 行 | 模块扫描/exprCallProfileSourcesRec/r91 种子序 | 上述各序 | 不变相 |

⇒ 波次骨架（分波构建+全量累积）字节恒等平凡成立；**但累积即零收益**。

### 1.2 汇点封墙（波界无可释放产物——比 row 重映射更强的不可能判据）

全部 profile/元数据相产物的 terminal 消费点在波界之后：
- exprCallProfiles：import resolve 需全量注册表 → parser forest authority → **可达性汇点**（跨源调用边闭包）→ 语义 decl 表 → typedIr 固定点（compact 形态）；ReleaseExprCallProfiles 在 typedIr 后。
- typedMetadataContexts：typedContextLookup（全量索引）→ exprCallProfileSourcesRec → declaration-layout bind → **typedIr 固定点**（逐 context 消费至 len==0，终态审计强制）；ReleaseMetadataContexts 在 typedIr 后。
- lineStore 行池：元数据相（行物化）+ 可达性相（函数体边扫描）双消费者，CompactProfiles 后整批 reset。
- sourceSnapshots/typedSourceTexts：exprCallProfileSources 重建行文本直至 typedIr。

⇒ **波界释放=必须把两个全局汇点改造成逐波增量算法（跨波 carry 可达性+typedIr），属 wall102 同级架构战役，非波次骨架。** 本线不盲动，按止损条款交定性。

## 二、死点归因修正（细粒度账本 + .o.map 行映解码）

- 账本轮（含刀前驱动）：after_profiles 733-743MB/4.281M 活分配 → resolve 后 750MB/4.305M → 元数据相每源 RSS +2.2-4.3MB、活分配 +2.5-4.8K/源，idx≈100-112 处穿 1GiB（rc=125）。
- **ctxacct 排除上下文 payload**：6044 行源（body_ir_access）全上下文仅 ~90KB（scopes 7.1KB+fields 4.6KB+consts 1.3KB+cols 72.5KB）；239 源合计 ≈5-15MB。前线「元数据上下文 450-600MB」外推作废——大头是逐行 transient churn 的交错棘轮（SMALL 区活小对象与空闲块交错锁页）。
- **309s 死窗 stack 经 run_probe_meta5 `.primary.o.map` 逐帧解码，最大单链（178 采样）**：
  `compilerCsgBuildMetadataContextsRec → TypedExprBuildMetadataContextFromProfile → typedExprBuildSealedGlobalBindings → ParserStartsWith → PathTrim → CloneStr → strOwnedAlloc → cheng_malloc`
  —— `ParserStartsWith` 每次调用对输入做 PathTrim 全值克隆（逐行 ×3 前缀检查），是全球绑定扫描的分配主机。次级：TypedExprNormalizeTypeText(19)、ParserStartsWith 直配(14)、TypedExprFunctionParamsInto(10)。
- 归因与前线 w1a/w1c relief 无效轮一致：relief 只收整段空闲，收不走交错棘轮；活增长+棘轮复合主导死点。
- 刀 2（追加）：`ParserStartsWith` 内部 trim 改 PathTrimView（布尔结果同值零分配，全仓调用点受益含 profile 相）；`TypedExprParseBindingLine` tail 空判同改。

## 三、读视图刀（gen2wave_1 交付本体）

机制：SMALL 区 churn 分配量正比于交错棘轮增速。死窗热链每行 2-3 次全值拷贝（EntryForLine 的 ParserOwnedText 全行拷贝+strip 拷贝+trim 克隆×683k 行×多趟扫描）。

新增两个 @borrows @borrow_result 读视图函数（同值零拷贝，快路径返回输入视图）：
- parser.cheng `ParserStripLineCommentView`：'#' 语义与本体逐字节同值；无 '#' 行返回输入视图。本体 25+ 调用点 owner 契约不动（同 SlashAware 窄切口先例）。
- path.cheng `PathTrimView`：同值；干净值返回输入视图；真裁剪走 StrSubView 视图切片。

切换五处死窗只读消费点（typed_expr.cheng）：TypedExprModuleConstEntryForLine（删全行拷贝）、TypedExprCollectDeclaredTypeNames、typedExprBuildSealedGlobalBindings、TypedExprBuildMetadataContextFromProfile 类型块扫描、TypedExprParseBindingLine。

等价性论证：五处消费全为只读（比较/扫描/切片输出为新鲜 owner），视图别名寿命覆盖于 profile 行表（lineStore 池）至相末；值逐字节恒等 ⇒ 字节铁门由配对烤机仲裁。

## 四、实测账

| 轮 | 载具 | rc | wall | 死点/结果 |
|---|---|---|---|---|
| acct | 刀前+锚点1 | 125 | 388s | 1,074MB，元数据相 ~140s 内 733→1074MB |
| acct2 | 刀前（DRV 指向事故轮，作刀前对照有效） | 125 | 371s | 同死点形态 |
| knife1 | 刀1+全锚点 | 125 | 321s | idx0=750MB→idx96=1044MB，+2.2-4.3MB/源，增速未降 |
| knife2 | 刀1+2+stepacct | 125 | 349s | idx0=784→idx64=1021→死 1,088MB；活分配/源降 (1.6-2.7K) 但 RSS 增速不降（~1.7KB/活分配） |
| wave1_a/b | knife-only 配对 | 0/0 | 208/212s | **sha 7a5f4457…×2 逐字节相等** |
| gate | wave1_a 驱动 | **0** | - | **4/4 PASS**（树峰 975,683,584B<1GiB，探针 7 pass/0 red/0 stale） |
| final1 | wave1_a 驱动 | 125 | 323s | 1,075MB@320s 穿帽，GEN2 未过 |

- stepacct 定谳：逐源活增长集中在 scopes 步（~+3.1K 活分配）与 type-block 步（~+10.8K 活分配，cleanup_cfg 样本）——`TypedExprContextProcessTypeDeclLineOwned`/`TypedExprAddTypeFieldDeclOwned` 族逐行 copy-in/copy-out + 逐 decl 参数/签名解析的保留链，属上下文构建的结构性行为；读视图刀砍掉 strip/trim/StartsWith 层 churn 后，增速由剩余保留链主导，RSS 增速不变。
- **GEN2 rc=0 的剩余路径**（本线不实施，立项级）：①上下文构建结构手术（type-decl 批处理化/上下文 arena 化，消 copy-back 保留链）；②P1 汇点增量化（§1.2）。两者均为 wall102 同级战役。

## 五、门禁表

| 门 | 结果 |
|---|---|
| 波次确定性论证（row 清单） | PASS（§1.1，分波+全量累积=同一全局操作序列） |
| 波界释放可行性 | **FAIL（§1.2 汇点封墙）→ 止损转副刀，不落空骨架** |
| 死点归因（账本+.o.map 解码） | PASS（§二：上下文 payload 排除；死链 StartsWith→PathTrim→CloneStr 定位） |
| 读视图刀字节恒等（配对） | PASS（wave1_a/b sha 7a5f4457… 相等） |
| 四夹具门 | PASS（4/4，rc=0，判词与基线一致，树峰 975MB） |
| 烤机报告契约字段 | 未单独比对（final1 未过 admission，报告未产出全量；四夹具门 rc=0 覆盖功能性） |
| GEN2 rc=0 ≤1GiB | **未达（1,075MB@320s）——墙=上下文构建保留链，立项级** |
| sha(DRV1)==sha(GEN2) | 未达（前置 GEN2 未过；配对确定性已证） |

## 纪律记录

- 主树零代码改动（交付=patches/gen2wave_1.patch + 本文件）；未 commit、未建分支/worktree。
- 临时目录=克隆 .w/；探针件（compiler_csg.cheng 锚点/账本、typed_expr.cheng 账本函数/步级打点/import）全部剥离后方才烤配对轮，/usr/bin/diff 对主树核零残留。
- file face 实际触碰（交付 patch 三文件）：parser.cheng（+ParserStripLineCommentView 纯增量 + ParserStartsWith 内部读视化）、path.cheng（+PathTrimView 纯增量）、typed_expr.cheng（7 处只读消费点换视图）；compiler_csg.cheng/system_link_exec.cheng 收工态对主树零差异；compiler_snapshot_lowering_bridge.cheng 零接触。
- 烤机全程串行（bake_win 锁）；SNAP-SPLIT 线多次持窗（含把 bake_win 当 scratch 的 gate 轮），本线最长等窗 40min×2+耐心队列，未越权未并行。
- **违纪自首两次**：.w/wave_bake_patient.sh 落盘与 typed_expr 探针剥离各用了一次 heredoc（shell 纪律违反，结果正确；其余文件改动全部走编辑工具通道）。
- 工具陷阱入档：环境 PATH 被 DevEco 工具链 diff 劫持（恒 rc=0 假绿），文件比对必须用 /usr/bin/diff 或 cmp。
- 无降级无兜底：读视图刀全部带同值论证+配对字节门；验收链不过的部分（GEN2 rc=0）如实报未达，不带病宣称。

## 主线程合入复验（2026-09-06，收割追加）

gen2wave_1.patch git apply 干净落地主树；配对烤机 m6=m7=0be3b00ba5821ce2c75b93a857271a87ab576c6a073d2d63563d8ab941d343c0（rc=0，225/225s）；全门认证 rc=0——四夹具 4/4、探针区 7 绿 12 红（判决逐字命中）0 STALE，树峰 997,785,600B < 1GiB。主树现役认证驱动自此为 0be3b00b（层叠：三补丁+objreg+snap_split+本刀）。GEN2 自烤 51MB 缺口的补刀（type-decl 保留链结构刀）已派 GEN2-WAVE2 线。
