# Cheng 编译器计划（纯 Cheng 最小内核 + 内存/编译时间双极限）

> **合并说明（2026-09-12）**：本文档由 `docs/cheng-minimal-kernel-plan.md`（975 行，《纯 Cheng 编译器最小内核计划》）
> 与 `docs/memory-time-limits-plan.md`（408 行，《内存与编译时间双极限实施计划》）**物理合并**而成，两份原件已 `git rm`。
> 结构维度（内核/插件组合、自举固定点）与资源维度（768 MiB 内存门 / 编译时间）在此是同一份计划：
> **§四 = 架构与关键决策，§五 = 落地顺序（含两份的 action/判据/依赖/工时），§六 = 验收铁门，§七 = 病态判据红线，§十一 = 决策记录（两份按日期合并）**。
> **状态只写一处**（§二）；日期化的历史状态一律压缩进 §十；本战役的全部实测证据与推导**不在本文复制**，唯一一份在
> `docs/campaigns/2026-08-31-kernel-userpath/design/deterministic_model_derivation.md`（证据总账，持续追加）。
> `openspec/proposals/pure-cheng-rsi.md` **保持独立、未并入本文**（它属 OpenSpec propose→apply→archive 流程，必须留在 `openspec/` 下）。
> 数字口径沿用原文习惯：`[实测]`／`[估计]`／`diagnostic`；未实测处明确标注为待判，`[估计]` 与 `diagnostic` 标注不得当实测引用。
> 本文只保留**结构 + 资源**两个维度；**数据/所有权/指针/C 冷链权威**见
> `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md`（Z0-Z8 + `tools/zrpc_kernel_gate.py`），冲突时以该文为准。

## 一、目标与不变判据

### 1.1 目标（结构维度）

把编译器重组为**纯 Cheng 的最小内核 + 按架构展开的代码生成单元**：内核（arch-neutral：前端 + 中端 + 寄存器分配骨架 +
对象模型 + 取件客户端）自举固定点，x86_64 / aarch64 / riscv64 代码生成作为独立组合单元按需并入，wasm32 后续。
联网时按 target triple 从 CSG 生产链取件并过字节门；离线无缓存则 fail-closed，报 `codegen_plugin_missing=<triple>`，
不做任何带病降级。

「最小」的验收口径是**组合面**（内核 manifest 不含任何 arch 模块、内核可独立自举），不是臆测的字节体积。实测基线见 §三。

> **2026-09-03 历史更正（原文保留）**：本计划未完成。96/96 归属和直接违规为零**不等于** kernel 闭包纯净；仍有 130 条间接架构依赖。
> composition manifest 已进入请求、真实 plan 闭包和生产报告的两阶段精确校验，但严格门当前仍是 37 个声明源对 201 个真实 core 可达源、
> 13 个 arch 可达文件，因此不能发布。四用户路径正用 fresh aarch64 composition 复验；kernel-only 产物执行 emit 时按设计只报
> `codegen_plugin_missing`，不能替代四路径载具。Step 3 仍无纯 Cheng GEN2/GEN3 原始固定点；Step 4 已改用真实 compiler hash，
> 但取件对象尚未进入下一次静态组合。下文任何"闭卷/绿/完成"只保留历史语境，不再作为当前完成结论。
> 当前 apply authority 为 `openspec/proposals/pure-cheng-minimal-kernel.md` 与 `task_plan.md` 战役 R。

### 1.2 终态判据（资源维度，2026-09-03 定稿，未变）

- 全冷串行中位数 ≤40s；零变更 ≤3s；真实 1/3 文件编辑 ≤10s；
- ordinary 进程树 ≤200MiB；完整自举 Linux cgroup v2 ≤768MiB 且终态 live=0。

**五项终态判据当前全未达成**（历史证据与逐项现势见 §十；现势以 §二 为准）。

> **2026-09-03 历史更正（原文保留）**：四个里程碑均未完成。240s/873MB、W4≈98MB、W5≈170MB 均不是可复用 current-source 基线；
> 现有缓存只能算零变更 whole-closure 缓存，物化未并行，compiler snapshot 未 mmap/按需化，W1 还有历史 SIGSEGV 未清。
> 终值改为：全冷串行中位数 ≤40s、零变更 ≤3s、真实 1/3 文件编辑均 ≤10s、ordinary 进程树 ≤200MiB、完整自举 Linux cgroup v2 ≤768MiB。
> 本轮已把四用户路径 compile/run 全部放入进程树 200MiB 硬守卫，并把正式 release receipt 精确绑定到 Linux cgroup v2 768MiB 的
> 同一 release-build argv；这些只是证据边界，不代表资源目标已经达成。cold object cache 的并发原子性与 Darwin C provider
> 预处理闭包身份已加固，但它仍是冷链桥接缓存，不能冒充 frozen BodyIR 条目缓存、并行物化或 mmap/按需 snapshot。
> 当时的 apply authority 为 `openspec/proposals/deterministic-memory-lifecycle.md` 与 `task_plan.md` 战役 R。

### 1.3 现行管理线与逐相锚（2026-09-08 用户令）

- 守卫默认值 = 理论锚 = 768MiB：`tools/memory_model_limits.sh`（**唯一常量** `CHENG_MEMORY_MODEL_LIMIT_BYTES=805306368`）；
  `tools/user_path_gate.sh:47` `RSS_CAP_MIB=768`（**原文记 `:45`，复 grep 现为 `:47`**，旧值 1024 仅是"最后防线"已废止）；
  `tools/linux_cgroup_guard.sh:44` `RSS_LIMIT_BYTES=805306368`。
- 逐相锚（`tools/memory_model_limits.sh`）：enter 190 / bind 230-250 / profiles 372-392 /
  forest 750-880（B1/B2 后目标 ≤768）/ TypeArena 100-120。
- 台账制度：每轮烤机/门禁/自烤 summary 必含「树峰 vs 锚差值」；差值 >20% 开持有者核账（「留给守卫拦」=设计失败）。
  GEN2 rc=0 的健康形态 = 900s 帽内 + 树峰 ≤768MiB 双达标（`docs/selfhost-resource-plan.md` §二点五）。

### 1.4 不变量（全程不变）

产物字节逐字节一致（配对轮禁缓存，lessons:752）；768MiB 正式守卫；验证强度零减弱；四夹具判词回归；
确定性红线（并行发射 index-order、mmap 不改发射输入）。

### 1.5 用户裁定红线（2026-09-11）

**凡超过理论内存或理论编译时间的运行时状态，一律按「病态」处理——它是缺陷，不是工作点。** 全文四条派生强制口径见 §七。

## 二、当前权威状态与剩余路径（唯一状态段）

> 本节是全文**唯一**的状态口径，取代两份原件中一切更早的状态表与结论；历史回执保留原文与日期（§十），不再作为完成结论。
> 本节只收四件事：**验收线 / 当前阻塞点 / 下一步动作 / 证据指针**。任何数字以证据总账为准，本文不复制推导。

**验收线（唯一判据，两条并行，缺一不算达标）**

- **内存线**：默认 768 MiB 门（内门 `CHENG_PROCESS_MAX_RSS_BYTES=805306368` + 外门）下，全量 234 源自烤
  `rc=0` ∧ `forest_parsed_lines=234` ∧ `forest_appended_lines=234` ∧ `guard_hits=0`；判据已机械化，缺任一读数一律 REJECT（见 §六.2）。
- **发布线**：GEN2→GEN3 原始字节 `cmp`+SHA 固定点，源码冻结并绑定源码/编译器/工具三方哈希，Linux cgroup v2 双口径回执，
  `full_backend_codegen=1` / `cold_system_link_exec=0` 正式回执（见 §六.5）。
- 判据定义见 §六；理论量硬边界与病态判据见 §七。

**当前阻塞点（2026-09-13 凌晨更新，以证据总账 `deterministic_model_derivation.md` §8.45–§8.68 为准；更早读数保留作历史）**

- **正确性轴：`typed expr:` 判词已全部归零（192 + identity drift 双墙根修），新墙 = `[cheng_seed] redundant explicit default init`（src=2，B3 在攻）**。kd_r94 的 `name=Join` 根因 = `src/chain/lsmr_types.cheng` 缺 `import std/strings`（规范 §1.4 直接导入可见性，与下文 `name=Result` 裁定同族：源侧缺陷修源；先例 binary_types.cheng:5-10；`pubsub.cheng:153` 同族同修已落树、待闭包覆盖）——kd_b102/b204（全 diagnostic）实测 234/234、guard_hits=0、**192 判词 0**；identity drift 根因 = 记录端 `TypedExprBuildFactInto` 规范化前用全限定名查叶子名键控的索引 ⇒ 三记录臂全灭留 sig=0，复核端叶子名命中 409 ⇒ drift；修法 = 两处 `(source, name)` 查找前 `TypedExprQualifiedCallLeaf` 叶子规范化（+23/−2，非限定名恒等、仍要求 Unique，不放宽判据）——b204 实测 **`typed expr:` 判词总计 0**、lsmr_types 完整通过（`src_done=1`，facts_added=41；§8.61/§8.62）。
  **新墙（前方墙，此前从未触达 src=2）**：`src=2 …/cleanup_cfg.cheng` 后 `[cheng_seed] redundant explicit default init; omit initializer type=bool expr=false`（gate rc=2）→ **已根修（§8.68，B3）**：cleanup_cfg 13 处纯删初始化器（kd_b302 判词归零 + 同驱动 A/B 反证未放宽）；**批量清扫已完成（§8.69，B5）**：领地 17 文件 60 处纯删清零（kd_b501 与 kd_b302 逐项全等 = 零行为变化零回归），闭包余 36 处全在界外在飞文件（parser 9／typed_expr_type_arena 11／compiler_csg 16）。**W7X 已根修（§8.70，B4）——根因是后端 miscompile 非源码逻辑**：托管 struct seq 元素读拷贝（`var expr = layer.exprs[i]`）被下沉成破坏性 move，源槽整格清零；命中路径靠写回自愈、continue 路径泄漏（探针指纹 226/226 store 前快照 firstZero=target）；判词 45 同族、全仓辐射（`var x = seq[i]` 读后不写回位点皆潜伏），真根因归 emitter（D1 线立项根修），parser 侧同值写回缓解已验证（+10/−0，kd_b404 五族判词全零：W7X/redundant/192/drift/typed expr:）。**frozen anchor missing 已根修（§8.73，B6，parser.cheng +159/−3）**：归一化行 anchor-only 身份产线与 receipt「每行必有 node id」契约断裂三子类（类型字段行合成 Assign 锚=-1、三元续行被误分类 IfStmt、break/continue/defer 锚-only 族无 node 身份）——修复=span 推统声明行旗标+join 组事件行尾追加+终止语句 node 身份补全（Break/Continue/DeferNode）；kd_b604 六族判词全零，src=2 推进过 r92_t2_pre_observe。**generic declaration header invalid 已根修（§8.76，B7，receipt +126/−30）**：解析侧泛型符号行有显式（`fn F[T]` 头窗）与隐式（参数区自由单大写名即类型参数，spec :518-529，如 cleanup_cfg:1189 `var T[]`）两合法形，receipt 严格校验只实现显式形合同——修复=窗口形判定+隐式 ordinal-0 臂（kind/span/constraint/default/children+名单准入 helper 逐条镜像收集器）+隐式续行臂+收口检查门限显式窗；零放宽（显式臂原样、不满足仍原判词）。kd_b701 全历史判词族归零，src=2 推进 t3_post_observe_meta→t4→**t5_post_structured**；drift 候选墙定性=仅泛型函数调用触发、不在森林路径。**frozen module const query 已根修（§8.78，B8，typed_expr +14/−3）**：只读 const 查询合同把「索引可读」错等价「已冻结」——流式 r92 相共享索引 sealed-but-not-frozen 本是合法查询相（行在构建时已全量登记 dual namespace），同函数枚举臂/const 臂双标准；门换合同 nil||!frozen→nil||released（冻结相行为不变），kd_b801 全历史判词族归零，src=2 过 t6。**192 族限定名已根修（§8.82，B9，typed_expr +120/−0 双臂）+ explicit conversion 已根修（§8.83，B10，+100/−1 双刀：classify 同名函数优先臂+结构化 call 权威优先门）**：kd_b1003 全历史判词族归零，src=2 连过 t6→tb 六子相（B9 止于 t5）。**enum→int32 转换墙已根修（§8.86，B11，typed_expr +58/−1）**：主因=classify canonical 化洗掉枚举身份（`Name = enum` 声明头被无条件登记为退化别名 ⇒ ABI 枚举臂查 "enum" 必落空，探针实证数据俱在）+ 流式可见性矩阵三跳全断；修复=枚举名守恒（operand 为精确枚举名时保留原名进 ABI）+ 本源 ctx 列臂 + importedModules 回退跳；fix2 v1 UAF 被 0xdd 印迹单变量归因后 v2 share() 修复。kd_b1104 全历史判词族归零。**share(call) 实参定型已根修（B12，typed_expr +26/−0：share 惯用面臂递归定型，声明权威先行/不可定型仍空/非 share 零接触三重零放宽）——`typed expr:` 前缀判词总数首次归零**（十二轮墙链清空整个 typed-expr 判词族），src=2 全部 310 声明处理完毕、连过 td 相（B11 止于 tb）。**executable-call share 墙已根修（B13，compiler_csg +6/−0：range 臂后补 share 内建豁免，同先例；定性=补合同登记——share 是规范内建所有权惯用面 spec :55/:67，全树无 fn share 可解析，硬造=捏造身份；臂仅 !callResolved 可达零劫持）**：kd_b1301 executable-call 族 1→0、`typed expr:` 前缀保持 0，**src=2 越 r92_td 连过 te/tc 多周期重入（1283 条 stage 线）**。**join 坐标 StrFormat 墙已根修（B14，parser +67/−7：join 组感知播种）+ Range 包含绑定墙已根修（B15，parser +75/−0：token walk 反查根 span 端点唯一包含即绑定，零/多命中 fail-closed）**：kd_b1401/b1501 全历史判词族零回归，r92 stage 1374→1521 条，**cleanup_cfg 源内事实行深 7028→8402（+1374 行）**。**kind=12 IfStmt 墙已根修（B16，parser +45/−0 四版链：W7 不中路径接入 B15 包含绑定臂+同位随绑裸 if 行；v1 假绿被 A/B 当场抓获=v1 直调遭破坏性 move 源槽清零重读 (0,0)，v2 烤拒 exact-owner，v3 单一 store，v4 终版）——B15 交割的「种子取行产线缺口」定性被修正：种子取行本就正确（锚=if token 真实物理行），真缺口在绑定侧（树层把 let+跨行 if-ternary 收成单语句，事件锚≠事实锚）**。kd_b1601 receipt 全族 1→0，**cleanup_cfg 事实行深 8402→10291（+1889 行）**、r92 stage 1521→1641。**现役前沿墙 = 192 族新实例**：`name=cleanupCfgRelocateDefinitionCoordinate line=10291`**已根修（§8.97，B17，typed_expr +14/−3：postfix 点/箭头臂成员名提取前跳续行空白，消费方两处同族收益）——kd_b1701(t3000 完整窗) 全历史判词族零回归+src=2 事实行深 10291→14387(+4096 行)+r92 stage 1641→2194+function_index 192→256，驱动首次无 panic 跑完整下游管线（1800s 截断属推进）**。**现役前沿墙 = importc resolved call 缺 concrete type**：`target=memRefCount importc=1`**已根修（§8.98，B18，typed_expr +1/−0：小写公开 std/system 运行时符号手工登记表漏登 memRefCount——补登记零放宽，放行后走正常精确声明查证与全量定型）——kd_b1801 森林路径 `typed expr:` 前缀首次全零**，r92 stage 2194→2340、function_index 256→320、行深 14387→15735。**receipt kind=1 裸 if 关键字行墙已根修（§8.101，B19，parser +19/−0：role==Invalid 臂接 B15 包含绑定臂，三路全断定谳——W7 sidecar 段不收 kind=1+role Invalid 锚查找不运行+无 Condition 根事件）**——**里程碑：src_done=2 首次达成**（cleanup_cfg 817KB/310 decls 全处理完成），推进新源 src=3（exact_def_call_authority）、r92 stage 2340→2439。**登记表家族清扫已落地（B20，typed_expr +8/−0）**：枚举 system+os 223 个小写 @importc 原语、消费面验真 8 符号一次补登（209 无消费面记录不扩）；kd_b2002 森林门轮 os_exit_bridge 1→0、src=3 深入 :162→:1462、r92 stage 2439→2712。**现役前沿墙 = exactdef 域限定 tag 实参定型（B21 在飞）**：`name=exactDefCallAuthorityCidAppendText line=1462 args=buf, exactdef.BodyIrExactDefContractCidDomainTag`（:29650 发射器族，qualified tag 定型不可达）。**P0（T10 定谳，T11 在飞根修）**：T6 owned 旗标发布武装 C 链 drop-before-sret 潜伏缺陷（双 return str 局部作用域 drop 未被 return 物化杀死），修复=所有权机器 move-kill；家族预警=凡「let x = <Ixx_TO_STR 结果>…尾臂 return x」形修复落地前都是 dd 毒化候选。C2 sha 对拍欠账保留（src=3 通过后产物化）。
  **口径**：抬门轮**不是验收轮**，不得计入达标；默认门仍 `guard_hits=1`（并林期触发，r92 默认轮 `max_csg_rss≈787,825,744`；c102_default `782,664,808`）。**方法学新事实（§8.62）**：森林自烤驱动内嵌冻结源快照不吃磁盘源 ⇒ 一切源侧修复必须重烤驱动才能验证。
- **本轮验证过的内存修复**：回放相 `replayColumnCensus` 声明后从未填充 ⇒ reader 收空 census ⇒ 每列几何增长。修后回放 `lex arena/解析 1,706,527→994`、`produce arena/解析 4,193,515→22,894`；默认门峰值 `822,445,256→787,825,744`、抬门 `1,411,548,816→1,392,117,320`，正确性无回归。
- **剩余内存阻塞（G(k) 主项）**：并林净留存同窗口 `+2,628,364 块 / +361 MB`（233 源，`+11,280 块/源`），其中**解析段占 67%（+1,773,092 块 / +737.5 MB，释放仅 −2,106 块）**；`ParserValueExprProduceStatementEvents` 段是留存点（~4,720–5,312 块/解析），形态为 **~100 块/解析固定 + ~1.5 块/token**，已排除 tree/tree.arena/tree.internPool/parser 模块级/全 `src/core` 模块级数组/逐语句 helper/census 相关；`system.tree` 摘链修复必要但不充分。**并林起点 `p1_ctx_index_built≈735 MB` 对门 `805,306,368 B` ⇒ 并林必须近乎零增长。**
- **已定位未执行的两步 → 已执行（§8.63，C 线）**：① 相位内存账已接线（真缺口 = `RecordCsgTopContributor` 零调用者而非无调用点；`patches/retain_ledger_c101.patch` +374/−3 在树，env `CHENG_CSG_MEM_TRACE` 门控常驻诊断）；② 回放免重解析**已落地（§8.71，C2）**：列物化三步全部兑现——逐行相等诊断 627,107/0、硬切后回放解析 187→0（结构性，列路径零 reader 调用）、同窗回放段 d_live −1,722,334 块 ≈47.5MB；基线归属修正：47.6MB 份额大部分已由 seq scope-drop 修复先兑现，本补丁真实代价 = append 相 +39MB 物化 pin；维护契约 = 列读 walk 转写体与 cmp_walk.py 机械对照。**G(k) owner 已点名到段（§8.63）**：reader 产出段（`ParserValueExprProduceStatementEvents` 一带）树 arena 外逐 token 小块；top 实数 = merge_parse **1,774,359 块/671MB**（7,583 块/源）+ build_index 62MB + ta_append 52MB；「释放它」不可行（树释放只还 9 块/源）⇒ **默认门达标必要项 = 免重解析（47.6MB）+ parser 产出段不分配根治（671MB 主项）**。另见 §8.58–§8.60：并林入口基线 737MB 逐段分解，X2 = `typedMetadataContexts` 逐源常驻 ≈151MB（模型未预算的结构项）。
- **【已撤回】"`G(k)` 根因 = 局部 seq 不释放"是测量伪影（2026-09-13，证据总账 §8.64 撤回声明）**：探针把第二次 `MemLiveAllocations()` 取在**被测函数内部、局部出作用域之前**，"+1 块"只证明"当时还活着"。改正为**跨调用**取差后，`src/tests/_chk_repro_seq_local_scope_drop.cheng` 与 `..._cases.cheng`（seq+add / seq+显式 `=[]` / 数组字面量 / 局部 `str` / 局部 `new` 对象五例打包）**实测全部 exit=0**；静态侧互证：`cold_parser.c:1802` 已把 `SLOT_SEQ_*` 映射为 `COLD_MANAGED_STORAGE_SEQUENCE`、`:73040` 的 drop 发射里**已有 seq 臂**（`cold_emit_sequence_buffer_release`）⇒ 编译器本来就正确释放托管 seq。**⇒ `G(k)` 的 owner 仍未定**，退回 §8.63 结论（产出段树 arena 外逐 token 小块，671 MB 主项）；被排除的方向：① 托管局部（含 seq）的作用域释放；② "补 seq drop-glue 权威"整条修法。**§8.63 的"免重解析 = 47.6 MB"独立杠杆不受影响。**
- **`G(k)` 收口（2026-09-13，证据总账 §8.66/§8.67；结论已有三项独立实测，取代上一条的"owner 仍未定"）**：
  - **验收线实况**（默认门 `r104_recov`，探针关闭）：`forest_parsed_lines=234`、**`forest_appended_lines=136`**、`guard_hits=1`，`rss=839,353,592 / limit=805,306,368` ⇒ **超门 34.05 MB**；逐相账：并林入口 **604.9 MiB**（他线本轮已削 ≈98 MiB）、并林增长 **0.90 MiB/源**、满量外推 ≈**816 MiB** ⇒ **距门 ≈48 MiB**（旧账差 290+ MB）。
  - **落点**：produce 段 Δlive 的 **96.3%（4,573 块/解析）** 落在 `ParserValueExprProcessStatementRangeWithTypeOwner` 一条调用内（四桶归因，501 次解析配平 Σ=5,111.9/解析，与独立窗口读数吻合到 1%）。
  - **机制**：**循环体内被 `add` 增长的局部 `seq`，其最终缓冲在作用域出口不释放（≈1 块/调用）**；直线路径与显式 `= []` 均干净（放大 1000× 定谳：循环桶 ≥15 / 直线桶 0）。根因在数据结构层闭合：loop-edge 掉落收集器枚举 `body->exact_borrowed_rebind_op_ids`，其落行判据（`cold_parser.c:81195-81212`）要求 **prior 是"非拥有借用"或静态串** ⇒ 该表定义域是"非拥有借用重绑定"，而被 `add` 写回的局部其 prior 是**拥有值** ⇒ 结构上不在域内 ⇒ 无 drop。真链试点（`ParseCallSuffix.children` 改 `setLen` 预置 + 下标赋值）实测父桶 **−42,348**、其余桶逐块不变、金丝雀 4/4 绿 ⇒ 单点 ≈2.5 MB。
  - **修法二选一**：**A2（已证、见效快）** 热位点改"预置+下标 / 先数后填 / arena 常驻列"，清单 **61 函数 78 处**（施工单 2v 含 top 表），缺口 ≈50 MB ÷ 单点 2.5 MB ⇒ **~20 处可望闭合**；**A1（结构性，治全仓含下游 emit）** 新增平行表 `exact_loop_mutated_local_*` + 独立校验器 + 新 staging 枚举，汇入既有物化链（末端 seq 臂 `:73040` 已就绪）。**禁止**扩展借用表的判据、**禁止**落 `cheng_str_drop_owned` 兜底（16 B seq 头 vs 24/32 B str 头 = 类型混淆）。最小判据：A1 重建 `cheng_cold_v3` 后三件 repro 必须 **15/64/240 → 0**（~4 分钟）；A2 抬门读 s6（基线 2,248,756）按位点预期块数对账。
  - **需用户裁定（目标定义层面）**：模型卡给森林相的锚是 **750–880 MiB**，其中 40% 本就高于 768 门 ⇒ 实测 800.5 MiB **按模型判据"贴线合格"、按门是 RED**。与"MB vs MiB 未裁定"同类；裁定前一律按"门 + 三判据"执行验收。
- **方法学（应成常规）**：验收跑默认门、**排墙跑抬高门**，两者读数绝不混用；同窗口只取相邻差；`d_live` 找持有者、`rss` 找峰值贡献者；**生命周期类读数必须跨宿主作用域取**（见 `lessons.md` 同日条）。
- **这条 `name=Result` 的裁定（已定）：源侧缺陷，修源不动管道。** `source_index=13` = `src/core/backend/codegen_a64_body_units.cheng`（11234 B 唯一）；`Result` 声明在 `src/std/result.cheng:11`（=`forest src=225`，在后面），**但根因不是前向**：该文件 3 条 `import` 全是 `as` 限定名、**没有 `import std/result`**，导入边回退只认 owner==本源且 `allowsUnqualified` 的边、**不做传递** ⇒ 名字根本不可达。
  依据：①`primary_object_plan.cheng:10` import 了该文件 ⇒ 它在编译器自身闭包里、**C 链几十轮烤机 rc=0**；②**规范 `docs/cheng-formal-spec.md:714-719`（§1.4）**：「首字母大写导出」+「**`import` 仅导入导出符号；未导出符号在模块外不可见**」⇒ **`import` 是跨模块名字进入作用域的唯一机制**，C 链的扁平解析是宽松实现、不是契约；③约定旁证：`core/std/chain/runtime` 中代码位用 `Result[` 的 **216 文件有 200 个显式 import**，未导入的 16 个多为**近期 B2/B4/B6 迁移新建门面**。
- **全森林门禁读数 r14（`kd_r14`、默认 768 MiB 门、wall=214s）**：`forest_parsed_lines=234`、`forest_appended_lines=2`、
  **`guard_hits=1`**、`max_rss=823,936,176`，守卫在 **837,141,704** 触发（门 `805,306,368` ⇒ **超 31,835,336 B**）、`rc=125`；
  机械判据 `check_acceptance.py` 判 **REJECT**（`rc=125` / `appended=2≠234` / `guard_hits=1≠0`）。
  ⇒ **内存仍是阻塞**；**不得**再用 09-12 02:2x 那轮"内存已进门槛"的说法。
- **同一次运行内的内存阶梯（只可同窗口取相邻差，跨窗口不可比）**：`after_profile_source_payload_release` 618,922,968 →
  `forest_build_done` **+109,133,920**（A 段 = pass0 逐源 parse 残留，最大单块）→ `p1_arena_reserved` **+39,174,216**（全林 TypeArena 预留）
  → `p1_ctx_index_built` **+27,770,904**（`TypedExprBuildIndex`）→ 守卫触发。
  E2 探针已把原先"B1 或 B2 二选一"的假设**判死为两块并列**；A 段是否可回收由 E1 第二段（release 前后读数）决定，**未测前不得记账**。
- **口径纪律**：门口径是驱动自身 `phys_footprint`，本机内存压力会把它抬高（同一未改动驱动在相邻窗口 `guard_hits` 0→1、触发点 807.6→841.7 MB）
  ⇒ 绝对门读数仅可**同窗口相对比较**；`gate_run.sh` 的 summary 已随轮记录 `loadavg/free_pages/page_size`。
- **判词墙进展**：隐式泛型**两个写入点已全部打通**（签名窗口 + 局部注解窗口）⇒ 原 `name=T` 墙清掉；
  随后按"**C 链内建类型身份契约整表对表**"（`bootstrap/cold_type_identity_contract.h`；三态表 13 覆盖 / 1 部分=APPLY 的 builtin 头 / 1 缺失=SET / 1 设计性 N/A=RAW_POINTER）
  一次修掉 **`typedesc` 与 `set[T]`**（`patches/builtin_type_constructor_arity.patch` + `patches/builtin_type_constructor_bracket_preflight.patch`，
  两次修法**都只增硬失败、不放宽判据**：`typedesc[A,B]`、裸 `typedesc` 均响亮失败）—— `kd_r19` 实测两墙已过，
  `binary_types_via_import` 推进到新墙 **`object field authority invalid`**（判词不带 `source_index`；`tag=forest src=` 最后一条是 `src=10` ⇒ 失败在其后的 production 相）。
- **口子纪律**：内建构造器**禁止逐个名字补**，一律走"闭表 + 显式 hard-fail"；顺带拆掉了 `canonical_type_chain.cheng:143`「未知 scalarKind 静默返回 `LocalI32Tag`」这颗地雷。
- **夹具链进展**：四个定长数组正例已越过 bitmap=5 墙（该墙由 `symbol_obligation_domain_global_local` 修掉，M-A 判别实验独立验证），
  统一停在 `ownership body ir production: ingress BodyIR ownership invalid code=11 site=1 index=4 detail=0`
  （`ownership_body_ir_production.cheng:1377`）。富化 dump 给出指纹：`slots=33 ids_ok=31`，`s4`/`s10` **整行全零**（`tid=0` 而非 `-1`）；
  store 全 hit、miss 在读侧 `index_get`；追加点 guard **未 abort** ⇒ 判定为**追加之后被零覆盖**，判别读数补丁（6 回读、决策树已预登记）待烤。
- 隐式泛型补丁 v1 曾烤挂（两个只读 helper 漏 `@borrows`，C 链 `borrowed actual cannot bind non-var non-@borrows formal`），v2 已修并验证。
- **正对照已补**：`ctl_ordinary_r13 rc=0 run_rc=0`（多槽普通 body 在本代正常）⇒ "驱动整体误编译/世代回归"两项否证。
- 待对账（保留）：`VERIFY_gen2r2_append.md`（09-09）的「rc=0@189s + 树峰 756.28MiB ≤768MiB 双达标」记录与 09-10 全 trip 记录的
  绑定差异（源态/车头/守卫口径）**未对账，两套数字不得互代**。
- 未闭合项（不阻塞上述排序，但闭环须补）：全量 `ci_gate.sh`、GEN2/GEN3 原始字节固定点复验、exec_diff 全集复核、
  池化合同冒烟（四夹具之外）、严格闭包 S0.5 实测、held-exec M3 安装面。

**下一步动作（依赖序；动作/判据/依赖/工时的完整条款见 §五.7）**

① 隐式泛型（修法落 `parser.cheng`：签名位 / `sizeof(T)` 表达式位 / `var T[]` 三类形态都要覆盖，方括号 schema 应用内的 `T`
不得被"嵌套括号一律 hard-fail"误杀）→ ② 符号接口配平（`compiler_snapshot_builder.cheng`；**不得**放宽桥的"恰好等于 1"判定、
**不得**从文本/名字/行号合成 CID）与 ③ `ownership body ir production` ingress 缺口（文件面不重叠，可合炉同轮烤）→
④ 跨源符号两条（`closure8` / `pair2`）→ ⑤ v6 后端相 → ⑥ 时间轴 region 缓存 → ⑦ arena 紧容量 + 削逐源 `U0` →
⑧ 并林路径 correctness（遗留项）→ ⑨ S1b → ⑩ 768 MiB 真门达标 → ⑪ 池化 4/4 与合同冒烟 →
⑫ 严格闭包 S1、⑬ held-exec、⑭ RSI 批次九（并联）。

**证据指针（唯一证据处）**

- 证据总账：`docs/campaigns/2026-08-31-kernel-userpath/design/deterministic_model_derivation.md`
  （§⑧ 流式路径内存包络；**§8.10-§8.13 = 2026-09-12 最新判词**；本文不复制）。
- 回执主源：`verify_append/VERIFY_fullgo_0910_append.md` §十九~§二十四（原始件表见 §十）；
  `user_path_baseline.tsv`（四夹具基线）；`HANDOFF_20260910_fullgo.md` 附录 Z（在途修复实验与槽位）、§三/§四/§五；
  `task_plan.md` 战役 R；`openspec/proposals/pure-cheng-minimal-kernel.md`（K0-K6）。
- 施工图：`design/pa_s1b_edit_plan.md`（rev.3）、`design/incremental-forest-consumption.md`（rev.3）、
  `design/arena_capacity_and_u0_cut.md`、`design/pc_closure_s1_progress.md`、`design/authority_invalid_triage.md`、
  `design/pool_stage68_conjuncts.md`、`design/strict-closure-k3-split.md`、`design/pc_closure_s1_edit_plan.md`、
  `design/pd_heldexec_m1m2m4_plan.md`、`design/anchor_drift_audit.md`。
- 门值常量：`tools/memory_model_limits.sh`（唯一权威）。

## 三、事实基线（实测）

### 3.1 自举链与产物基线

| 项 | 数值 | 测法 |
|---|---|---|
| 自举链 | stage0→stage3 固定点 `e202c0c35424eb36`，`tools/bootstrap_from_cheng.sh` | CI 9/9 **【2026-08-25 订正：实测该"固定点"为自映像拷贝仪式（`cheng_cold.c:11422` mmap 自身→memcpy→127B 合同槽补丁；stage3 含 1675 个 `_cold_` C 符号），非纯 Cheng 编译产物——不得再当纯自举证据引用；纯编译载具尚不存在，两代固定点距离=∞。证据：`/Users/lbcheng/cheng-patches/kernel-step3-distance-20260825/DISTANCE.md`（sha `643ed62d`）】** |
| stage3 二进制 | 3,102,128 B（≈3.0 MiB，2026-08-24 口径）；**2026-09-10 实测 3,310,144 B（2026-08-31 构建）** | `ls -l artifacts/bootstrap/cheng.stage3` |
| C 冷链（待退役的编译路径） | `bootstrap/cheng_cold.c` 113,953 行；`bootstrap/cold_parser.c` 90,297 行 | wc |
| 现役 current-source 驱动构建 | 锁定 `src/**/*.cheng` **加 bootstrap C include 字节**后经种子链产出 | `build_current_source_compiler_main_candidate.sh` 头注 |
| 组合清单现状 | `min_driver_manifest.cheng` 31 项；`pure_cheng_manifest.cheng` 45 项；`driver_bootstrap_manifest.cheng` 45 项（2026-08-24 实测修正，原记 32/47/46 为含注释行口径差） | wc 后扣除注释行 |
| src/core 体量 | tooling 210,340 / backend 196,768 / lang 119,766 / runtime 124,397 / backend2 59,591 / ir 30,487 / analysis 25,714 行 | `wc -l` |
| arch 代码生成面 | 明细表合计 ≈18,218 行（见 §四.2 插件面表）；另有共享格式层 `macho_object_writer`(840)、`elf/coff_object_linker`(4,532)、`elf_riscv32_writer`(418) 待 Step 0 归属裁定 | `wc -l` |
| backend 中立大块 | `primary_object_plan` 76,478 + `lowering_plan` 30,910 + `regalloc_single_pass` 7,456 行 | `wc -l` |

体积收益采用可验口径：安装面从「全量驱动」缩到「内核 + 1 个本机插件」的组合单元数；
一切体积结论以构建产物实测为准，文档不引入未经测量的字节估计。

### 3.2 Step 0 归属结果（2026-08-24）

工具：`tools/kernel_plugin_attribution.tsv`（85 行全量归属，含 Step1 新增 `codegen_contract.cheng` 归 kernel；
`backend_driver_dispatch_min.cheng` 按选项 B 移出源目录，见 §3.3）＋ `tools/kernel_plugin_closure_check.py`
（import 图闭合检查＋大文件 arch 关键词扫描＋tracked `.cheng` Mach-O 魔数门；`python3 tools/kernel_plugin_closure_check.py`
复跑 Step0 覆盖门，覆盖缺口/硬错误退出非零；`--require-closure` 转 Step1 正式门禁，违规清零才退出零）。以下为本次实测。

| 桶 | 文件数 |
|---|---|
| kernel | 62 |
| shared-format | 10 |
| x86_64 | 5 |
| aarch64 | 2 |
| riscv32 | 1 |
| riscv64 | 4 |
| wasm32 | 1 |
| unresolved | 0 |

> **2026-08-29 重计（B8/B9 后现役值，取代上表）**：backend 96 ／ 已归属 96 ／
> 未覆盖 0；kernel=62、shared-format=18、x86_64=5、aarch64=4、riscv32=1、
> riscv64=5、wasm32=1；direct_violations=0、indirect_edges=130、
> divergence_hits=242。上表为 2026-08-24 Step0 定稿口径，留作对照。

- 覆盖：backend `.cheng` 总数 85 ／ 已归属 85 ／ 未覆盖 0。
- 直接违规（kernel→arch import）17 条，涉 7 个文件：`primary_object_plan`(3：aarch64_encode / x86_64_body_emit /
  regalloc_aarch64_adapter)、`regalloc_production_emitter`(4)、`direct_object_emit`(3)、`native_object_emission_plan`(3)、
  `regalloc_production_artifacts`(2)、`regalloc_production_encoder_events`(1)、`native_link_exec`(1)。全部留档待结构化拆分，不在 Step 0 内修。
- kernel→unresolved 警告 0 条（`elf_riscv32_writer` 已由 unresolved 裁定为 riscv32 单列桶，原 2 条警告转计入上项直接违规）。
- 间接可达：19 个 kernel 源头经非 arch 中间层摸到 arch 单元，共 91 条边；主通道是 `direct_object_emit` 与
  `regalloc_production_emitter` 两个派发枢纽，另有一条格式层暗道 `system_link_exec_runtime → coff_object_linker → aarch64_encode`。
- 分叉嫌疑扫描（大小写不敏感关键词 x86_64/aarch64/arm64/riscv/wasm/macho/mach-o/triple）：共 270 处命中，
  `primary_object_plan` 259 处、`lowering_plan` 11 处。结构性实锤举例：`primary_object_plan:206`
  `PrimaryObjectPlanSetPackedStackArgsForTriple` 按 triple 分叉 AAPCS64 栈参打包、`:226` `PrimaryObjectPlanSetSibRouteForTriple`
  仅 x86_64 生效、`:1341-1369` Darwin arm64 emit-first 回填流、`:2084-2088` 直接消费 RegallocAarch64/Riscv reloc 种类；
  `lowering_plan:1134` 调 `RegallocTargetConstraintsAarch64Darwin()`、`:49` 硬编码 `riscv64_encode` 源路径。全量行号清单由脚本输出。
- 数据异常：`backend_driver_dispatch_min.cheng` 是 Mach-O 二进制而非源码，且首跑静态门禁又捕获
  `tests/cheng/backend/fixtures/return_ucmp.cheng` 同族异常；两文件已按选项 B 移出跟踪（§3.3）。
- 结论：风险 1／2 成立——arch 分叉确认集中在 `primary_object_plan` 与派发枢纽文件；后续步骤以本表为唯一移动依据，
  闭合检查在 Step 1 转正式门禁时违规清零。

#### 3.2.1 dispatch_min 异常处置记录（2026-08-24）

结论：`src/core/backend/backend_driver_dispatch_min.cheng` 自入库起就是二进制，该路径在全部 refs 历史上从未存在过文本版，
「恢复本路径源码」无对象；但模块本体零损失——同模块在役真源码在 `src/core/tooling/backend_driver_dispatch_min.cheng`
（8,581 行，与本文件 Step0 内核面清单所记行数一致），三份 bootstrap manifest、全部测试与门禁均指向 tooling 路径。
`backend/` 下这份 51,072B 文件是误入库的冷直发可执行产物，应按构建产物处置，不重写源码。

证据链：

1. 现状：Mach-O 64-bit arm64（magic `cffaedfe`），51,072B，mode 100755，mtime 06-10 07:00，
   sha256 `942f7e977b463a5bc8bcd6c1834bf5a37e71a4fc03c2bbec1ecdc7815e16038a`。HEAD 全量 tracked `.cheng` 魔数扫描仅此一个二进制。
2. 历史：`git log --all --follow` 仅 `f681cad2b` Initial commit（2026-07-24）一个版本，其 blob `cad3c5b6` 与磁盘逐字节一致。
   跨全部 refs（789 commit，含 cline/codex checkpoint refs）`rev-list --all --objects` 同名 blob 共 115 个：114 个均为文本
   （首字节 `import s`，全在 `src/core/tooling/` 同名路径），唯一的 Mach-O 就是本文件。dangling blob×3 均为 lessons/findings 文档副本；
   `artifacts/` 无同名文本备份。
3. 产物指纹：内嵌字符串仅 `__PAGEZERO / __LINKEDIT / /usr/lib/dyld / /usr/lib/libSystem.B.dylib / cheng.cold.direct`；
   nm/strings 报 load command cmdsize 非对齐（非 Apple ld 出品）＝Cheng 冷直发 writer 产物特征；51KB 远小于真 driver（MB 级）
   → 判定为小型冷直发 exe 误落源码路径。

API 面／消费方反推：

- `import cheng/core/backend/backend_driver_dispatch_min` 全仓 0 处——该路径无任何代码消费者，不存在需要满足的导出面；
- `bootstrap/min_driver_manifest.cheng`、`driver_bootstrap_manifest.cheng`、`kernel_manifest.cheng` 均声明
  `compiler_entry_source = src/core/tooling/backend_driver_dispatch_min.cheng`；
- 测试经 `cheng.core.tooling.backend_driver_dispatch_min` 消费：`BackendDriverDispatchMinTypedFactMemoryModel /
  FullRssMemoryModel / FullRssParallelMemoryModel`（含 TryBuild/Report）、`BackendDriverDispatchMinAppendFullTheoryReport`
  及命令面 `system-link-exec/status/--help/emit-csg`——全部由 tooling 在役文本承载；
- 仅两处按 backend/ 路径引用：`tools/cold_regression_test.sh`（:3549 obj-smoke、:4750 nm 清单，输入非文本必然红）；
  `openspec/proposals/csg-core-production-admitted-input-capability.md`:593 早有明文——该路径是占位，「不能成为正式入口」。

选项裁定：

- **A（按 API 面重写 backend/ 最小 dispatch 源码）：否决。** 该路径 API 面为空集（无 import 方），tooling 已有 8,581 行在役真源码；
  重写等于制造第二份同名实现分叉。
- **B（排除产物、收敛单一入口）：推荐（已实施）。** ①将 `backend/backend_driver_dispatch_min.cheng` 作为构建产物移出跟踪，
  不再留在源码包内冒充源码；②`cold_regression_test.sh` 两处改指 tooling 路径，与三份 manifest 对齐；
  ③补静态门禁：tracked `.cheng` 拒绝 Mach-O 魔数（可挂 `kernel_plugin_closure_check` 或 `ci_gate`），防同类异常再次入库。

#### 3.2.2 选项 B 实施回执（2026-08-24 晚，用户确认后执行）

- ②复核：`cold_regression_test.sh` 全文已无 `core/backend/backend_driver_dispatch_min` 引用（grep rc=1；:641/:765/:986 均为
  tooling 路径）——立案时的行号引用早于脚本演进，该项无动作需求。
- ①执行：`git rm --cached` + 删除工作区文件（sha256 与 §3.2.1 记录一致后删）；`.gitignore` 增同名行防再入库。
- ③执行：`kernel_plugin_closure_check.py` 新增 `scan_binary_magic`——`git ls-files '*.cheng'` 全量读首 4 字节比对 Mach-O 四魔数
  （feedface/feedfacf/cefaedfe/cffaedfe），命中即 `result: FAIL (binary_magic_tracked=N)` 退出 1（任何模式都判失败，
  不进 Step0 已知违规放行分支）；tracked-but-missing 文件跳过（并发 lane 中间态不属本门）。
- **门禁首跑即捕获第二个漏网二进制**：`tests/cheng/backend/fixtures/return_ucmp.cheng`（223,312B Mach-O arm64，
  内嵌 backend_driver 用法串，Initial commit 时代误入库，全树引用仅 findings.md 文档提及）——按同族产物同治（移出跟踪+删除+gitignore）。
  §3.2「HEAD 魔数扫描仅此一个」的结论由本次实测修正为**两个**。
- **riscv32 桶归属裁定（同日）**：`elf_riscv32_writer.cheng` `unresolved → riscv32` 单列成桶（非 kernel 非 shared-format；
  kernel→此处的 2 条 import 从 warning 转计入待拆违规清单）。
- 复跑结果：`python3 tools/kernel_plugin_closure_check.py` rc=0，backend 85/85 覆盖，unresolved=0，
  buckets kernel=62/shared-format=10/x86_64=5/aarch64=2/riscv32=1/riscv64=4/wasm32=1，
  direct_violations=17（15+2，全部留档待 Step1 结构化拆分），indirect_edges=91。§3.2 汇总同步为本回执口径。

### 3.3 双轨账（两套数字不可互代；9/6 静窗定谳）

| 轨 | 构成 | 数值 |
|---|---|---|
| C 头参照烤（`cheng_w126` 烤 35 条目） | prescan 2s / entry 3s / admission 184.6s / codegen 66.5s / emit 0.2s | 全冷 **205-225s**；缓存命中 **7s** |
| 自宿主自烤（`knife_a` 驱动编自家 239 源，900s 帽三重复核） | 计划/绑定/排序 ~20s；profiles 逐源 parse 249.4s；metadata+forest ≥630s 未触界 | 全墙 **≥2500-3300s** |

夹具单件 76-96s（99% 曾在快照编排——已分解，剩余在相内 store I/O + 哈希链）。
测量铁则：ps-rss 与 footprint 双口径必录；一切时间/内存基准只在静窗取数（负载窗会把 210s 烤机压成 3319s/穿帽）。

### 3.4 768 MiB 缺口的实测定性与预算拆解（09-10 定谳）

1. **GEN2 rc=0 + GEN3 原始字节固定点已在克隆树达成**（独立记录三条：`56bc64e0…` / `e98be9ea…` / `6b8ca86c…`，
   186-204s、900s 帽内），但固定点绑定的源码**未冻结提交**（锚 commit + 未提交工作树）⇒ 按仓规第 6 条**不是发布级固定点**。
2. **768MiB 不是 0.5-6MB 的调参缺口**：768 门下实测的 805.5-806.1MB phys「台地」是驱动**内建 `CHENG_PROCESS_MAX_RSS_BYTES`（768MiB）
   与外部守卫夹逼**出的位置，不是进程自然峰；内建门抬到 1GiB 后同源同载具顶到 `1,074,496,832` B（rc=137@240s）且 metadata 相
   从未建成（`metadata_contexts_built` 未达）；收官轮复现：外门 1GiB 时仍是内门先开枪（resident `822,214,656` / phys `967,689,488`，
   rc=125@187s）⇒ metadata+forest 真实需求 **>1GiB**；**双抬到 1.5GiB 仍死**（收官轮：rc=137@302-314s，
   phys 顶到 `1,612,302,040` / `1,613,825,752`，树上进程数峰=**1**，无子进程并驻）⇒ 收口靶是 **约 −800MB 的增量消费改造**，
   不是亚 MB 收尾、也不是几十 MB 调参。
   **预算拆解**：保底驻留 ≈700MB（profiles + 快照 + intern/行池 + 3.06M 活块）＋ **合并森林 arena 实测 1,230.7 MiB**
   （234 源逐源 arena 求和 `1,290,508,960` B；最大单源 134.1 MiB，Top10 源占 53%）＝ 峰 ≈1.6GB，对照管理线 805MB。
   **关键否定性事实：合并森林 arena 自身即 1,230.7 MiB > 805MB——「整块并林」形态不消除，768MiB 数学上不可达。**
   正解 = 每源 parse→typed 生产→立即释放（P1 汇点增量化 / T-2），永不物化全量森林，并同时压保底驻留；
   编译臂口径（686-703MiB）达标与尾段发射/链接窗另计，不改变结构事实。
   **死相修正（09-10 收官轮 census）**：768MiB 门下当前绑定三跑死于 **forest 解析相 `src=61/230`**（`live=1,743,524`，
   内部守卫报 `rss_bytes=840,910,000`）；1.5GiB 门下则走完 pass 0 的 234 源（`forest_parsed src=233 rss=702,940,216
   live=3,060,689`）、死在 pass 1 的整块并林窗口。两处都落在 T-1/T-2 施工面，与 ledgerwalk 线在途刀（−145,802 / −667,349 活块）同域同向。
3. **四夹具门**（GEN2R3 同轮）：`pass=4 known_red=0 stale=0`；树峰 ordinary 732,768KiB / call_fixture 692,946KiB /
   cold_nested 745,218KiB / v6 1,006,336KiB（该轮门用 1GiB 帽，v6 贴帽）；另轮实测 ordinary `765,504KiB`、call 782MiB
   ⇒ **ordinary ≤200MiB 终态远未达成**。**09-10 晚 768MiB 正式门口径**（v4 修复后）：ordinary 624MiB / call_fixture 628MiB /
   cold_nested 706MiB 均 PASS，**v6 超线 16.4MB**（`821,691,976 > 805,306,368`；TA-MEM3 侧同结论，差值 3.1MB，
   归属发射/链接臂，属「模型外新刀」禁触域）。
4. **倍增瞬态不主导 enforced 峰（TA-MEM3 F1 负结果）**：pass0 测量解析 presize 刀 A/B 三轮实测
   `808.7 / 809.1 / 809.0 MB`（±0.5MB 噪声带）⇒「倍增共存在 enforced 口径主导峰」被证伪，该刀已按纪律回退、
   不交付 no-op patch。收口仍唯一依赖增量消费（T-1/T-2）。

### 3.5 P1-P5 现状对照（原条款 09-01 ↔ 现状）

| 项 | 原条款（09-01） | 现状 | 证据 |
|---|---|---|---|
| P1 条目化地基（C 链桥接缓存） | 缓存命令面 + cargo store；迭代秒级 | **部分落地**：`tools/build_kernel_driver.sh:141-153` 内容寻址 cold object cache（任务级 scratch，跨任务保留被禁），配对轮强制 `CHENG_ENTRY_CACHE=0`；全冷 205-225s / 命中 7s。**它不是条目缓存**：whole-closure 键含完整源闭包，改 1 文件必全失效 | `build_kernel_driver.sh:141-153`；`findings.md:14776-14778` |
| P2 materialize 并行 | 自宿主物化并行 + row 保序 | **未做**；且波次编译已被判死（波界不存在 terminal 死产物），保序论证须逐结构重做 | `selfhost-resource-plan.md` §三-1 |
| P3 生命周期切分 | W1 事务中间产物 / W4 lowering / W5 world 细分 / W2 源文本 share | **部分落地（换成相序 + 释放刀）**：W1 −319MB（1042→723MB）已落地；**W4≈98MB / W5≈170MB 两个原始估算已证伪**，真相 = merkle bootstrap ~449MB/170s 窗；已落刀 = TA-MEM B1/B2 + relief 相序 + intern75 + 快照文本共享、metadata churn 六处、line-intern 文本整批归还、parser forest 两遍精确容量合并、derived call-name 表/缓存与收据累加器跨 forest 窗释放、前端 in-place 类型字段；batch2 R1/R2 落 2 文件（+30/−3 行） | `38feddb3b` / `ab86b8ce5` / `67b8c8b7b` / `91a68b3f7` / `04d39d084` / `e7e38d76a`；`phase_c_recon.md:15,17`；`VERIFY_phasec_batch2_append.md:7,34` |
| P4 mmap 驻留 + 按需物化 | 战役级，Step 3 关键路径前置 | **未做**；现行替代路线 = P1 汇点增量化（T-2 typedIr fixed-point 波次化） | `selfhost-resource-plan.md` §三/§六 |
| P5 验证增量化 + 世代修剪 | 证据政策裁决后 | **未动** | — |

### 3.6 census3（49.8% / 65 类）与最小内核的关系

**结论：不需要先把 49.8% 拉到 100%。** 三条口径差（详见 `cheng-patches/kernel-step1-step4-closeout-20260829/CENSUS3-CROSSCHECK.md`）：

1. **编译器不同**：census3 用 `cold_census3_0827`（冷源 `a2a68659…`/`eb01c0f1…`），本轮组装用 `cheng.stage3`（`fc1645b4…`），
   工作树冷源是第三份（`2c959d4e…`）。
2. **单文件 obj ≠ 整体组装**：census3 把每个文件当入口编其可达闭包；最小内核是整源集组装，同一文件是非入口模块。
   反例——x86_64 插件源集 5 件里 3 件在 census3 是红的（`x86_64_encode` / `elf_x86_64_writer` / `coff_x86_64_writer`），
   组合驱动照样 rc=0；aarch64 插件源集 3 红（含 census3 标的回归件 `codegen_a64_fill_units`）同样组装 rc=0。
3. **范围不同**：内核真交集 = `kernel_manifest` 源集 35 件（绿 18/红 17）+ 一份插件源集 4-5 件，不是 530 件。

**两处真交叉要盯**：① `FunctionContractAdmission rejected`（kernel 桶 11 件、`kernel_manifest` 源集 7 件、三插件源集各 1-2 件）
——现在组装能过是因为非入口模块不走该检查路径，Step3 烤固定点整体编译时必然外露；② `codegen_a64_fill_units.cheng` 的 parse 破损
（能力面债，Step3 前应清偿）。

**关键否定性事实**：census3 红集与驱动运行期红集**不相交**——`regalloc_production_emit_failed`、`absolute argv0 required`、
`encoder runtime authority` 三个运行期判词在 `census3_rows.tsv` 全量 grep 命中**均为 0**。census3 是编译期红集，
清完 65 类不会让 Step2 的现役墙自动消失。

## 四、架构与关键决策

### 4.1 内核面（arch-neutral，目标组合清单）

- 入口/请求：`backend_driver_dispatch_min`(8,581)、`compiler_request`、`compiler_runtime`、`support_matrix`、`gate_main`
- 前端：`lang/parser`(37,321)、`lang/typed_expr`(66,830) 及 lang 支撑
- 中端：`ir/*`（core_types、type_abi、low_uir、body_ir_loop/noalias/egraph/opt、phase_arena、dense_store）
- 后端骨架：`lowering_plan`、`primary_object_plan`、`primary_object_emit`、`regalloc_single_pass` 及生产工件、
  object_buffer/symbols/relocs/plan、system_link_plan/exec(+runtime)、line_map/debug_*、backend2 canonical 管线
  （lower/assemble/frag_codec/lifecycle/pipeline/types）
- 取件客户端：以 `backend2_cid.cheng` 为底座扩展（CID 解析 + sha256 字节门）
- **契约模块（新增）**：`backend/codegen_contract.cheng` —— 内核↔代码生成单元的唯一耦合面

### 4.2 插件面（per-arch，现有文件映射）

| 单元 | 文件 | 行数小计 |
|---|---|---|
| x86_64 | `x86_64_encode`(339) + `x86_64_body_emit`(4,430) + `elf_x86_64_writer`(368) + `coff_x86_64_writer`(261) + `regalloc_x86_64_adapter`(2,354) | ≈7,752 |
| aarch64 | `aarch64_encode`(728) + `regalloc_aarch64_adapter`(4,566) | ≈5,294 |
| riscv64 | `riscv64_encode`(478) + `elf_riscv64_writer`(413) + `elf_riscv64_linker`(1,019) + `regalloc_riscv_adapter`(2,680) | ≈4,590 |
| wasm32（后续） | `wasm_module_emit`(582) | 582 |

共享归属待判：`macho_object_writer`(840)、`elf_object_linker`(2,339)、`coff_object_linker`(2,193)、`macho_provider_linker`(4,120)
—— Step 0 按 import 图裁定归内核或按格式×架构二次切分。

### 4.3 契约（codegen_contract.cheng）

- 每单元必须供给：triple/ABI 表、指令编码器、body 发射器、regalloc adapter、对象 writer 入口；
  签名全部落在契约模块，类型走既有 DOD + Arena + int32 索引身份铁律。
- 内核只 import 契约，不 import 任何 arch 文件；arch 文件只 import 契约与中立工具。
  该闭合性用脚本硬门禁检查（Step 0 产出），违反即构建失败。

### 4.4 D1 装载模型：编译期组合，不做 dlopen（已定）

- per-triple 产出一个驱动：内核 + 该架构单元静态链接（manifest 组合，机制已在 min_driver 验证）。
- 理由：① 纯 Cheng 无稳定跨 .so ABI，dlopen 边界会击穿 Arena/int32 身份与所有权证明体系，且需重证整套权限模型
  ——成本高、收益为零；② 分发目标由「只装本机架构驱动」同样达成；③ fail-fast：缺件在构建/安装期 hard-fail 早于运行期。
- dlopen 运行时热插拔列为**非目标**（§九）。

### 4.5 D2 信任模型：CSG 链签发（已定）

- 插件为 capability 交易对象；CID 绑定四元组：source-closure 哈希 + 编译器哈希 + target triple + 契约版本。
- 取件先过 sha256 字节门与 provenance 校验再进组合；本地构建产物允许，但必须产出同构 receipt（同一字段集，缺一拒收）。
- 离线且有本地缓存：可用；离线且无缓存：fail-closed 明确报错。

### 4.6 D3 纯度口径：「纯 Cheng 内核自举」为一等里程碑

现状：current-source 驱动的官方构建仍锁 bootstrap C include 字节，即编译路径经过 C 冷链。
本计划的「纯 Cheng」验收 = 内核源集由纯 Cheng 编译器编译出 GEN2/GEN3 原始字节固定点，
`cheng_cold.c`/`cold_parser.c` 退出编译路径、降级为历史种子证据（对应 CLAUDE.md zero-C 缺口）。
此步不达成，「纯 Cheng 最小内核」只是组合学命题，不是自举命题。

### 4.7 原案架构决策与依赖图（资源维度，2026-09-01 立项）

merkle store 升级为「编译期唯一驻留本体」：内容寻址磁盘态 = 驻留形态（mmap 只读、page cache 可回收），
规范事实按需物化（import 图驱动），条目 = 缓存粒度 + 并行单元 + 驻留路由三合一。
依据（当时实测）：内容本体 1MB、验证/事务驻留 352MB（230 万 ~150B 小块）、单线程 cpu≈wall 14 核闲置、
C 冷种子同输入 172MB——瓶颈全部落在「全量物化 + 单线程 + 无缓存」三件事上。
（**09-10 注**：该 352MB 后被证认为 `annot_release` 前的遗弃树池账，非稳态驻留；`BACKEND_JOBS` 现默认 8。
见 `verify_append/VERIFY_b3r_churn_append.md:32`。）

```
四夹具收官（已绿，2026-09-10）
   ↓
P1 条目化地基（边界+缓存键+cargo store 缓存）──→ 迭代秒级【独立可交付】
   ↓ 条目=并行单元                                    ↓
P2 materialize 并行（B2）──→ 全量 ~130s          （与 P2 并行推进）
   ↓
P3 生命周期切分（W1→W4/W5/W2）──→ RSS −336MB+87MB 峰
   ↓
P4 mmap 驻留 + 按需物化 ──→ 100-200MB 区间 + Step 3 前置就绪
   ↓
P5 验证增量化 + 世代修剪（证据政策裁决后）
```

与最小内核计划的汇合点：P1 条目化 = Step 2 分层 manifest 条目结构的运行时化；P3 生命周期切分 + P4 mmap 驻留/按需物化
= Step 3 纯自举固定点的 768MiB 守卫可行性前提；汇合点 = **Step 3 GEN2/GEN3 固定点**。

### 4.8 门读数身份与路径口径（2026-09-11 裁定，全文档强制）

- **Darwin 侧内门读的是本进程当下 `phys_footprint`**（`src/std/os.cheng:1798 → :1712 → :1722`，
  `proc_pid_rusage(getpid(), 0 /*RUSAGE_INFO_V0*/, …)` 取 `ri_phys_footprint`），**不是进程树、不是 session 并集、
  也不是 `ru_maxrss` 高水位**；探针实测 `sizeof=96` 与字段偏移正确、`RUAGE_SELF.ru_maxrss` 对子进程不动，
  本机 `hw.memsize=51,539,607,552`（48 GiB）⇒ 数 GB 读数不需要压缩/换页即可真实驻留。
  **凡写成"进程树 RSS"的地方一律按笔误改口径。**
- **`--out` 必须落仓库内或 `$HOME`，不得落 `/private/tmp`**：C 链烤机 `--out` 落在 `/private/tmp` 下必失败（两种误导判词），
  `tools/cheng_scratch_scope.sh` 的任务目录正在其下，故 C 链烤驱动须落仓库内或 `$HOME`（冷链线待修，C 链只产 GEN1 不改退役路线）。
- **测量纪律**：ps-rss 与 footprint 双口径必录；一切时间/内存基准只在静窗取数；同窗口读数只与同窗口可比。

### 4.9 关键设计结论（由 §3.4 与证据总账推导，落地时必须遵守）

1. **「整块并林」形态不消除，768MiB 数学上不可达**（合并森林 arena 自身 1,230.7 MiB > 805MB）⇒ 正解 = 逐源
   `parse → typed 生产 → 立即释放`（P1 汇点增量化 / T-2），永不物化全量森林，并同时压保底驻留。
2. **S1b 的交付边界（防假绿）**：删并林买到「能跑完」+ 消 1.23GiB 活块 / 2,009.6 MiB phys 峰，
   **不买到门线**（只删森林后残留峰 ≈660-804 MiB 仍压线——09-10 晚设计口径，保留）；**删并林是"能跑完"的必要而非充分条件**，
   `design/pa_s1b_edit_plan.md` 禁止项 10 明文。**S1b 不得据此降级为「只剩内存轴」**，也不得被当作全量跑完的充分条件。
3. **达标杠杆次序（09-11 夜按同窗口实测改写）**：决定项是**逐源 parse 瞬时 `U0`**（实测最大 `140,599,840 B` @ `src=134`）
   与**前端驻留 F≈490~514 MiB**（占门宽 61~64%），**不是** 22 个 TypeId 侧列（量级仅几 MiB）。
   完整包络 `peak(k) = F + I + C(k) + T(k)`：`F=538,903,512` + `I=125,665,376` + `C=71,027,100` = `735,595,988`，
   留给逐源瞬时的余量只剩 `69,710,380 B`（66.5 MiB）⇒ **⑤⑥ 落地后的真实缺口是 24.1~36.7 MB**（旧记 13.1 MiB 已被实测否证）。
   `U0` 的根因与列 arena 同族：`arena.cheng:373` 每次 grow 在 bump 顶开新块、旧块成死区 ⇒ `used ≈ 2×` 活数据；
   按精确终值 `ArenaArrayInt32ReserveEmpty` 预留后下界 `775,567,336 B`、余量 28.4 MiB。
   **收益倍数待判决性实测（`ArenaUsed(tree.arena)` vs 各列 `len` 之和）确认，未测前不得声称收益。**
   完整推导、逐相表与三条未测项见证据总账 §⑧。

## 五、落地顺序（files / action / verify / done）

### 5.1 Step 0 归属冻结与测量（先行，零行为变化）

- **files**：`tools/kernel_plugin_attribution.tsv`（新）＋闭合检查脚本（新）。
- **action**：`src/core/backend` 每个 `.cheng` 归入 {kernel, shared-format, x86_64, aarch64, riscv64, wasm32}；
  以 import 图验证闭合（kernel 不触 arch 文件）；重点解剖 `primary_object_plan`/`lowering_plan` 内是否埋有 arch 分叉
  ——若有，先记录结构化拆分清单，**不许 hoist 补丁**。
- **verify**：归属表 100% 覆盖；闭合检查通过；数字回填本文档。
- **done**：归属基线冻结（后续步骤只允许按表移动，不允许静默新增耦合）。实测结果见 §3.2。

### 5.2 Step 1 契约定型（纯布局重构，零行为变化）✅ 完成

- **files**：`src/core/backend/codegen_contract.cheng`（新）；各 arch 文件入口签名收敛到契约。
- **action**：抽显式契约模块；arch 模块改 import 契约；不改任何语义与发射字节。
- **verify**：`tools/ci_gate.sh` 9/9；exec_diff 全集零新差异；全量驱动哈希漂移仅允许来自布局并如实记录。
- **done**：契约是唯一耦合面（闭合检查转正式门禁）。

#### 5.2.1 Step 1 闭卷回执（2026-09-02，制度收尾）

- **正式门禁已接线**：`tools/ci_gate.sh` 常驻检查 `kernel-plugin-closure`
  （`tools/kernel_plugin_closure_check.py --require-closure`，commit `f7a88ae28` 接入）：归属覆盖缺口 /
  kernel→arch 直接 import 违规 / tracked `.cheng` Mach-O 魔数 / `CodegenContractVersion` 契约版本权威越界，任一命中即硬失败。
  2026-09-02 实测 rc=0：backend 96/96 覆盖、unresolved=0、direct_violations=0、
  `contract_version_definitions=1` / `authority_violations=0`。
- **ci_gate 全套实测（2026-09-02，接线核验跑）**：18 PASS / 32 FAIL（50 项）。本计划相关门全绿：
  `kernel-plugin-closure`、`kernel-plugin-manifest`、`backend2-plugin-{cid,cache,trade}`、`cheng-source-purity`、
  `exact-def` derive/freeze/merge/call-authority。FAIL 归因三类，均与闭合门接线无关
  （接线检查位于队尾，FAIL 的编译路径检查先于其执行；本任务零源码/门禁改动）：
  ① 配置性——determinism/perf-witness/export-visibility 需完整面 `gate_main`（官方 stage3 为 C 窄面，
  `unknown command 'verify-*'`，需 `STAGE3_FULL` 口径，脚本头注已述）；② 并行 lane 在途瞬态——host-smoke-zero-exit、
  verifier-dod、v2 合同族、net-sim-pipe、exact-def-identity/materialize 在门跑时段红、复跑抽查绿
  （cfg-body-ir、host-smoke-zero-exit 手动 rc=0）；③ 现役 WIP 真红——pqc-mlkem/mldsa 手动复现
  `plain local copy requires an address-free value object` → primary object emit failed（并行 lane 域，非本任务领地，如实记录）。
- **契约有效性实证（「契约是唯一耦合面」的战役归档）**：2026-08-30/31 kernel 用户路径清墙战役
  （`docs/campaigns/2026-08-31-kernel-userpath/`，`VERIFY.md` 45+ 小节、wall7-44 系 30+ 面墙修复）全部是契约对齐工作
  ——exact-def authority、ownership 前提、BodyIR stack schema、CSG 绑定权威、类型/布局逐层证明，无一例绕开契约或以启发式补丁收场。
  契约面在真实用户程序编译路径上被逐面行使且逐面收敛，是 done 判据的实证。
- **延后项（不阻塞契约闭合）**：`indirect_edges=130` / `divergence_hits=243`（2026-09-02 复测值；Step 0 归属表 2026-08-24 基线 91 条间接边，
  2026-08-29 重计 130/242）。间接可达与关键词分叉按蓝图 2.x 逐族施工；Step 1 正式门禁口径 = kernel→arch 直接违规=0 +
  覆盖 100% + 契约版本权威唯一，不含间接面清零，本项延后不回卷 Step 1。
- **门禁口径备注**：arch 文件当前仍直连中立 kernel 模块（object_buffer / object_symbols / object_relocs / regalloc_single_pass
  等 DOD 骨架），「arch 文件只 import 契约」的严格形属蓝图 2.x 施工面；本步门禁执行的闭合定义以上条口径为准，如实记录不虚标。

### 5.3 Step 2 分层 manifest 与 per-triple 驱动

- **files**：`bootstrap/kernel_manifest.cheng`、`bootstrap/plugin_manifest_{x86_64,aarch64,riscv64}.cheng`、对应构建脚本（新）。
- **action**：从 `min_driver_manifest` 裁剪内核清单；每架构一清单；产出 kernel-only 驱动与三份组合驱动。
- **verify**：kernel-only 驱动遇到未装 triple 时报 `codegen_plugin_missing=<triple>` 退出非零；
  本机组合驱动与现行驱动 exec_diff 等价；既有 min_driver 门禁保持绿。
- **done**：本机安装面 = 内核 + 1 单元；三份组合驱动可复现构建。

#### 5.3.1 Step 2 验收回执（2026-09-02，制度收尾：脚本级闭卷，语义级进行中）

- **✅ 清单/构建脚本/驱动产物在树**：`bootstrap/kernel_manifest.cheng` + `plugin_manifest_{x86_64,aarch64,riscv64}.cheng`、
  `tools/build_kernel_driver.sh` / `tools/build_plugin_driver.sh`、清单一致性硬门 `tools/kernel_plugin_manifest_gate.py`
  （ci_gate 常驻检查 `kernel-plugin-manifest`，x86_64=5/aarch64=4/riscv64=5 与归属表精确双向覆盖）全部在树。
- **✅ codegen_plugin_missing 错误路径（脚本级已满足）**：`tools/build_kernel_driver.sh` 脚本级 triple 门禁——
  请求未装 triple 时输出规范报文 `codegen_plugin_missing=<triple>` 并 exit 9；contract 级对拍已由 ci_gate
  `backend2-plugin-cache-gate` 的 S4-D missing-msg-contract 腿承担（构建脚本规范报文与契约 `CodegenPluginMissingError` 逐字对拍）。
  Step 1 闭合门接线后本项即为 contract 级背书，验收条件「kernel-only 驱动遇未装 triple 报错退出非零」满足。
- **✅ exec_diff 等价（ordinary/call_fixture 配对实测）**：C 链车头 vs kernel 驱动同输入配对等价——wall40/wall42 代实测：
  C 链车头 ordinary compile=0 run=0、call_fixture compile=0 run=1；`kernel_driver_w40/w42` 同夹具同结果
  （ordinary 0/0、call_fixture 0/1 语义正确）。配对证据：`docs/campaigns/2026-08-31-kernel-userpath/VERIFY.md`（wall40/wall42 节）。
- **⏳ 语义级验收**：kernel 驱动编用户程序正确性 = 四夹具战役验证，2/4 绿——ordinary 0/0、call_fixture 0/1；
  cold_nested 现位 `cleanup_cfg: local stack schema invalid`、v6 现位 TypeId missing
  （基线契约 `docs/campaigns/2026-08-31-kernel-userpath/user_path_baseline.tsv`）。可重复门：
  `tools/user_path_gate.sh --driver <kernel_driver>`（compile/run/判词逐项对基线）。
  四夹具全绿 + 本机组合驱动 exec_diff 全集复核后 Step 2 完全闭卷；在此之前 Step 2 保持「脚本级验收通过，语义级验收进行中」，
  不提前打勾。**09-11 夜现势**：四夹具 **4/4**（`user_path_baseline.tsv`：ordinary `0/0`、call_fixture `0/1`、
  cold_nested `0/0`、v6 `0/0`，commit `69817b8b2` 入库），该 4/4 是 `BACKEND_JOBS=1` 串行门内基线，
  与池化路径不是同一口径；**遗留**：exec_diff 全集复核、合同冒烟、全量 `ci_gate.sh` 与 GEN2/GEN3 固定点均**未复验**。

### 5.4 Step 3 内核纯自举固定点

- **files**：`tools/bootstrap_from_cheng.sh` 增加 kernel 模式；固定点证据目录。
- **action**：源码冻结窗口（先查共享文件 mtime，避开并发 lane）内，用纯 Cheng 编译器编译内核源集，
  连续两代原始字节固定点；全程 768MiB 进程树守卫。
- **verify**：固定点绑定源码/编译器/工具三方哈希；`ci_gate` 增设该项。
- **done**：C 冷链不再出现在内核编译路径的证据落档。

**资源维度前置（2026-09-01）**：自举编译的 RSS 可行性前提 = 本计划内存/时间轴（条目缓存/materialize 并行/生命周期切分/
mmap 驻留——全驻留架构自举必穿 768MiB 守卫），P1-P4 落地是本步骤关键路径前置（现势见 §二、展开条款见 §五.7；
依赖序已按 09-11 实测改写为「correctness 修复 → 第三处同族缓存 → S1b（含 S1b-M 另计）→ 复烤闭合」，
**旧写「C-0 测量账本 → metadata 结构改造 → 复烤闭合」保留为 09-10 口径**）。

**未过（不变）**：768MiB 正式门、源码冻结 + 三方哈希绑定、Linux cgroup v2 双口径、`full_backend_codegen=1` /
`cold_system_link_exec=0` 正式回执；且 09-09/09-10 固定点数字**未复验**。

### 5.5 Step 4 CSG 取件接线

- **files**：`backend2_cid` 客户端扩展、csg-core 交易侧对接。
- **action**：插件上链；CID 四元组绑定；字节门 + provenance 校验后进组合。
- **verify**：在线取件→组合→exec_diff 等价；篡改单字节必拒收；断网无缓存 → fail-closed 报文含已装清单。
- **done**：联网自动展开、离线诚实失败，两端都有自动化门禁。
- **现势**：trade / cache / cid 三门 rc=0；pickup 两臂已接线（案 A，fail-closed 抛 `codegen_plugin_missing`，
  见 §十一 2026-08-29 条）；**「取件对象进入下一次静态组合」online/tamper/offline 三臂未验**。

### 5.6 Step 5 发布接线与归档

- **action**：取件/组合工具真实落入 `cheng-fusion` 正式仓；`progress.md`/`findings.md` 落卷；本文档逐步打勾。
- **现势**：前置于 Step 3/4。

### 5.7 剩余路径（依赖序：动作 / 判据 / 依赖 / 工时）

> 本表是两份原件「剩余路径」的**合并版**（原 kernel 文首 §剩余路径 8 条 + 原 memory 计划 §5.2 ①-⑤），按最新实测与裁决重排；
> 每条的动作/判据/依赖/工时逐条保留（不再分两份）。「→」表依赖放行，「∥」表可并行（同文件落盘须串行）。
> **现行顺序**：`⓪ 已完成前置` → `① 隐式泛型` →（`② 符号接口配平` ∥ `③ ownership ingress`）→ `④ 跨源符号两条` → `⑤ v6 后端相`
> → `⑥ 时间轴 region 缓存` → `⑦ arena 紧容量 + 削 U0` → `⑧ 并林路径 correctness（遗留）` → `⑨ S1b` → `⑩ 768MiB 真门达标`
> → `⑪ 池化 4/4 与合同冒烟` → `⑫ 严格闭包 S1` → `⑬ held-exec` → `⑭ 其后（Step 4 三臂 / Step 5）` ∥ `⑮ RSI 交集`。
> **provenance 边界（回执 `VERIFY_fullgo_0910_append.md` §二十三原文口径，先读后用）**：09-10 夜~09-11 的数字都取自
> **带未提交 WIP 的工作树**；测量期树内并存他线改动（含**会改变 C 冷启动种子**的 `bootstrap/cheng_cold.c`）
> ⇒ 这些数字一律为**诊断/定位**性质，**不得当发布证据**；凡以「GEN2/GEN3 原始字节固定点」为名的结论，
> 必须在**源码冻结 + 干净树 + 精确门**下重跑，不得沿用任何该窗口的 bake 产物。

#### 5.7.0 已完成的前置（保留条款以示依赖，不得回退）

- **const 块条目的 metadata 绑定接线**（`compiler csg: parser-owned global coverage mismatch … parser=N metadata=0`）：
  parser 侧把 `const` 块条目算作模块级声明行、metadata 侧三个绑定生产点只认 `var` 块（全仓 818 文件 / 9041 条目）
  ⇒ **任何含 `const` 块的源都被拒**，这是 `forest_appended=0` 的直接成因。修复 = `patches/s1b_step3l_global_const_block_bindings.patch`，
  **已落树**，`kd_r9c` 下六件夹具该判词出现次数 **= 0**，四件正例推进到下一道墙，负例判词逐字不变；下一步（已执行）重烤驱动验证该判词消失。
- **`T[具名常量/内联常量表达式]` 长度的 parser 侧能力移植**：根因 = Cheng 侧缺「具名常量/常量表达式作 `T[N]` 长度」的能力
  ——`src/chain/binary_types.cheng:27` 的 `digits: int32[LsmrMaxDepth]`（`LsmrMaxDepth` 是 `:10` 的 const）在 Cheng parser 里
  走不进 `FixedArray` 分支（`parser.cheng:17909-17929` **只认 `ParserValueTokenInteger`**）⇒ 被降级成泛型应用、
  产出一条 `ParserTypeSyntaxNominal`；而 `const` 行在 module 循环走**绑定块**分支（`parser.cheng:26321-26331` ⇒ 只创建
  `ParserTypeSyntaxBindingAnnotation` 根，`:23800`），**全仓仅两处**赋 `TypeDeclarationRhs`（`:23353`/`:23371`，都在类型声明路径）
  ⇒ **const 名永不进登记面 ⇒ 该 nominal 不可能解析**。**C 链本来就支持**（`bootstrap/cheng_cold.c:30171-30183`：字面量 /
  `symbols_find_const` 具名常量 / `cold_eval_i32_const_expr` 内联算术，非 int32 一律 `die`）⇒ 这是 **Cheng 侧移植缺口**，
  且只有程管线自己会暴露（`bake_*` 走 C 链前端故编得过 234 源）。**归属 = HEAD 既有、首次可达**。
  **修法（设计已定，落地不得退化）**：括号分类改三级（字面量 → 常量表达式求值 → 泛型应用），**非 int32/非正值硬失败、
  不得静默退化**；const 求值器补"名字"节点并接模块常量表；**改在 parser 侧、不碰 authority ⇒ 全林/流式不分叉**。
  相关补丁：`patches/s1b_step3o_module_const_expr_read.patch`、`patches/s1b_step3p_forward_declaration_failclosed.patch`（在树）。
- **`object trait premise out of range` 墙**：修复 `patches/object_trait_premise_portable_row_order.patch`（sha256 `f2521edd…`，已 bake rc=0）
  ⇒ 该墙在四个正例上全部不再出现（此前同时挡住 4 个正例 + M-A + `pair2_ord2`）。取证件 `.rebuild/s1b_step3/r9/bake_r9z.log`。

#### 5.7.1 ① 隐式泛型（当前唯一直接卡点；修法落 `parser.cheng`）

- **现状**：全森林门禁 r9z 在 `src=2`（`src/core/analysis/cleanup_cfg.cheng`，817,253 B）报
  `nominal declaration is not visible … name=T … root_generic_count=0 source_generic_symbols=0`；夹具链 `binary_types_via_import` **逐字同类**
  ⇒ 隐式泛型这一件**同时**是夹具链与验收线的阻塞点。
- **动作**：补隐式泛型符号表/签名段补写（`parser.cheng`）。**两条硬要求**：① `sizeof(T)` 表达式位是否走同一张
  declaration generic symbol 表——同表则签名段补写自动覆盖，**须给出查询函数坐标**；不同表则补丁不完整；
  ② `var T[]` 的 `T` 位于**方括号 schema 应用**内、仍在签名表层，**不得被"嵌套括号一律 hard-fail（深度>0）"误杀**
  ——该条写错会把正例直接判失败，比现状更糟。已定位的完整形态（`cleanup_cfg.cheng`）：`:1189` `var T[]`、
  `:14380-14382` / `:14408-14410` `@borrows fn …(values: T[], …)`、`:14403` `int64(sizeof(T))` **表达式位**。
- **一次根因合并的量化依据**（扫描 `src/**/*.cheng`）：签名位含 `T[]` 的**文件数 24**、含 `sizeof(T)` 的文件数 12；
  `: T)` / `: T[]` / `var T[]` / `: T,` 出现 96 / 46 / 43 / 25，其它单字母隐式泛型 `V[]` 14、`V)` 6、`N,` 6、`var V)` 5、
  `var T,` 4、`var T)` 4、`P)` 4、`B)` 4。`src/core/lang/parser.cheng`、`src/core/tooling/compiler_snapshot_lowering_bridge.cheng`
  **自身**就在使用该写法 ⇒ 不是夹具特例，而是编译器自举源码的普遍依赖。**一个修法同时解锁"夹具链 + 全森林 append 相 + 24 个源文件"**。
- **判据**：`cleanup_cfg.cheng` 单源 + 三夹具 + 全森林门禁 `forest_appended_lines` 推进；**不得**用"放宽判据/合成身份"换绿。
- **依赖**：`parser.cheng` 独占期 + 重烤驱动；**文件面与 ②（`compiler_snapshot_builder.cheng`）不重叠，可合炉同一轮烤**。
- **工时**：**未定**（v2 已出，`patches/implicit_generic_signature_window_v2.patch` +336/−14，r11b 读数未回）。
- **在仓硬约定（非风格）**：只读访问器一律 `@borrows` + 非 `var tree`（`ParserValueExprTokenKindAt:14199`、
  `ParserValueExprTokenText:14270`、`ParserValueExprTypeSyntaxKindAt:16030`；`parser.cheng` 内 `@borrows` 共 **636** 处）；
  总则见 `lessons.md` §32 与 §243-248（"borrow 实参绑 byval 托管形参一律编译拒绝，修复模式 = `@borrows`(只读) / `var`(可变)"）。

#### 5.7.2 ② 符号接口配平（`missingFactBitmap=5` 的 bit 4）

- **定性**：`5 = 1 | 4` = `CompilerSnapshotAdmissionMissingSourceInterface` | `…MissingSymbolInterface`
  （`compiler_snapshot_builder.cheng:26-34`）；报错点 `compiler_snapshot_lowering_bridge.cheng:4864`，判定在 `:4856-4862`，
  要求 `missingFactBitmap` **恰等于** `MissingSourceInterface`，且 `missingSourceInterfaceCount == tables.sources.documentCids.len`。
  多余那一位的来源：`missingSymbolInterfaceCount` 在 `compilerSnapshotProductionAdmissionBuildValidated`（`:9577`）的
  `:9658-9661` **无条件**设成 `declarationInterfaceCount + genericInterfaceCount + annotationTargetBindingCount`；
  存在**后置清除路径**本该将其清零（`:11445-11482`、`:11724-11779`、`:12052` 均在动这几个计数器），实测**未生效**
  ⇒ 墙 = canonical DeclId/SymbolCid 投影未配平，**不是门禁口径问题**。
- **根因（已获 M-A 判别实验独立验证）**：义务分母统计**每一条非 Module 的 parser 声明行**（含模块级 `var`/`const` 块条目），
  而 Symbol 生产者对这类行**一个 symbol 都不产** ⇒ 相减恒余 #(模块级 var/const) ⇒ `==0` 护栏永不成立 ⇒ bit 4 永不清。
- **动作**：把分母收窄到与生产者同域（模块级 `var`/`const` 的覆盖仍留在 parser-owned global binding 域）；
  已落树补丁 `patches/symbol_obligation_domain_global_local.patch`（+30/−4，1 hunk，只动 `compiler_snapshot_builder.cheng`，
  桥文件零命中），**未放宽桥的"恰好等于 1"判定**，也未为 globals 伪造任何 CID。
- **红线**：桥要求"恰好只缺 source 那一位"是**设计意图**（source CID 由桥自己补），bit 4 属真缺口 ⇒ **不得放宽桥的等值判定**
  （放宽即假绿），**不得从文本/名字/行号合成 CID**（`compiler_snapshot_builder.cheng:9648-9650` 即此禁令）。
- **判据**：四个定长数组正例过桥（不再报 `missingFactBitmap=5`），负例（`r8_fixed_len_non_int32_main expect=FAIL_COMPILE`）
  **判词逐字不变**（`parser type syntax: fixed array length const must be int32 name=SlotName`）。
- **依赖**：与 ① 文件面不重叠，可合炉同轮烤；烤轮 `r10` 进行中。
- **工时**：**未定**。

#### 5.7.3 ③ `ownership body ir production` ingress 缺口

- **现状**：M-A（零 `const` 控制组）越过 bitmap 墙后直接撞 `ownership body ir production: ingress BodyIR ownership invalid
  code=11 site=1 index=4 detail=0 fn=0`，点 = `src/core/analysis/ownership_body_ir_production.cheng:1377`。
  M-A 是"零 const"控制组却撞上此墙 ⇒ 它与"模块级 const"无关，属**定长数组字段 / 结构化值**这条线上的下游缺口；
  四个正例在 bit 4 修好后**预期**也会走到这里（**未证，待实测**）。
- **动作**：静态定位该 ingress 的 ownership 证据缺口（**文件面与在途两个补丁都不同**，已另派手）。
- **依赖**：与前两项无代码依赖，可并行；**判据**：同类夹具不再报该判词；**工时**：**未定**。

#### 5.7.4 ④ 两条跨源符号卡点

- `closure8` 的 `declaration SymbolId is not materialized`（逐源符号只填本源 vs 跨源解析，**修法 (a) 从索引算全局 SymbolId**
  + fail-closed 断言；可实现形态已定稿：`globalSymbolId = Σ_{s<src} declarationSymbolCountBySource[s] + 该条目在其源内的符号序号`，
  依据索引条目按行升序登记 `typed_expr_type_arena.cheng:3666-3678` 与 `FillDeclarationSymbols` 也按行升序发号 `:6756-6759`；
  建议**纯加一列 `entryBaseBySource`** 以便 O(1) 取序号）；
- `pair2` 的 `portable TypeArena Symbol join duplicate`（TypeId 一对一只对 Field 开豁免）。
- **排序**：修完 ①②③ 会立刻撞上，应排在其后；**工时**：**未定**。

#### 5.7.5 ⑤ v6 后端相 847 MB

- **现状**：v6 那 `851,510,472 B`（B 侧）/`827,704,496 B`（A 侧）是**后端相**爆的——CSG 全程 RSS 峰值只有 ≈17.5 MB
  （`frontier_store rss=17,515,024`，取证 `.rebuild/s1b_step3/r8/ab_v6.B.stderr.txt`），两侧末行都是
  `phase=regalloc_ledger_pre`/`replay_lazy_*` 才报 `resource_guard`；已收窄到 `primary_object_plan.cheng` 的 decl-order-stream 段。
- **红线**：`patches/tree_arena_column_census.patch`（削 pass1 逐源 tree arena，≥67 MiB）**不构成 v6 的解**，不得据此宣布 4/4。
- **判据**：v6 夹具在默认门内 PASS 并 4/4 达成；**工时**：**未定**。

#### 5.7.6 ⑥ 第三处同族缓存：region 循环 per-source remap（时间轴第一刀）

- **动作**：按 `c5f6c6736` 两处的同一形状，给 `parser.cheng:11699-11710` 的 region 循环加**独立** per-source
  缓存数组（不与 token/typeSyntax 两份共用——未实读证明三段 intern 文本逐字节同形）；非负 id 才走缓存、
  负值路径与旧代码逐字一致；不改 intern 顺序/id 取值/equal 判据、不新增 panic。
- **判据**：同路径 A/B（同 `--in`/`--out`、仅驱动不同）**exe 与 primary.o 逐字节相同** + 三夹具全 `rc=0`
  （判等价前先 `rm -f` 产物，分母必须是本轮新生成）；`typed_expr_type_arena_smoke` 时间盒的森林窗与整轮 wall
  在 **553,914 ms / 577s** 基线上再降；`sample` 栈不再落 region 循环偏移（证据总账 §22.9）。
- **依赖**：无外部依赖；需独占槽 + 重烤（~194s）。可与其它 `parser.cheng` 项并行设计，但**同文件落盘串行**。
- **工时**：**2~4h `[估计]`**（含重烤 + A/B 对拍 + 时间盒）。
- **注**：本项**不改变** ⑧ 的 correctness 死点；根因与已证伪的旧假设（探测爆炸 / hash 常量）见 §5.9 前版路径项。
- **2026-09-13 判据失效更正（A1 交付件 `design/time_model_structural.md`，本席复核独立证实）**：本项的**验收面已不在森林窗**。
  工作树（未提交，`src/core/tooling/compiler_csg.cheng` **1458/188**）已删除"精确容量并林"：`CompilerCsgBuildParserForestAuthorityInto` 自述
  "the merged forest … **is gone**"（工作树 `:33438-33460`），`grep -rn typeArenaParserForest src/` = **0 命中**（B1 满足）；全仓 `ParserValueExprTreeAppendFrom` 调用点
  只剩 **2 处** = `compiler_csg.cheng:30704`（typed/frontier 相，经 `compilerCsgExprLayerForFrontierFunctionsImplRec`）与 `parser.cheng:3698`（`NormalizedExprLayerAdd` delta 层）。
  `git show HEAD:src/core/tooling/compiler_csg.cheng` 仍在 `:33162` 有并林调用 ⇒ **这是在工作树、未提交**，HEAD `b083fc3dd` 仍为旧形态。
  ⇒ **本项判据"森林窗在 553,914 ms 基线上再降"作废**（对象已不在该窗内），改为：①**森林窗不回归**（口径用 `design/forest_window_caliber.md` §0 的绑定三件）；
  ②**新增 typed/frontier 相埋点对**，第三点修复只在该埋点对上验收。工时与动作不变，**动作项本身仍然成立**（该处代价仍是 `源字节×项数` 双线性）。
  另注：`553,914/774,266 ms` 的原始件（`.rebuild/remap_exp/`）**已被清理**，只剩文档引文 ⇒ 只能作历史参照，**不得作发布证据**。

#### 5.7.7 ⑦ arena 紧容量 + 削逐源 `U0`（记忆轴，必须配 fail-closed 断言）

- **动作 A（arena 紧容量）**：各列按**精确终值** `ArenaArrayInt32ReserveEmpty` 预留。**口径（已更正）**：旧句
  "`typeCount ≤ typeSyntaxCount + 种子` 已证"**已撤回**（Seal 相泛型特化 `SpecializeTypeInto` 会内插新 Apply 类型、memo 每次调用新建）；
  现口径 = **拷贝链**：4 次 realloc 共拷 `102,117,712 B` ⇒ pin 后该点位 Δ `94,666,824 B` 降到 ≈1 MB，
  **期望省 ≈93.6 MB**（不与旧的 32 MB 相加）。实测形态：`r8s2 used=71,035,484 capacity=115,507,584 ⇒ 1.626×`，
  容量余量 `44,472,100 B`（42.4 MiB），实测可达收益按 `94,666,824 − 71,033,660 ≈ 23.6 MB` 估（非上限口径的 42~57 MB）。
  **容量不足是静默增长**（`arena.cheng:373-397` 无边界检查）⇒ **必配 fail-closed 断言**；残差预算 `8,641,456 B`
  是预算不是界，靠首轮 `ArenaUsed` 回填。
- **动作 B（削逐源 `U0`）**：`U0` = 逐源 parser tree arena，实测最大 `140,599,840 B`；根因与 A 同族
  （`arena.cheng:373` 每次 grow 在 bump 顶开新块、旧块成死区 ⇒ `used ≈ 2×` 活数据）。**机器核实**：201 列全为
  `ArenaArrayInt32Add` 目标、非列 arena 分配 0 个 ⇒ 弃块 = `U0/2 − 16C`，与分布无关；`src=134` 省 ≥ `67.0 MiB`
  （另一口径记 ≥ `70,296,704 B`），**仅削 pass1**。消费循环本就按 pass0 实测逐源预留
  （`compiler_csg.cheng:35705` `work.typeArenaForestSourceArenaBytes[sourceIndex] + 65536`），故在环下界 = `F + I + C(k) + U0(k)`。
- **判据**：包络 `peak(k) = F + I + C(k) + T(k)` 给出向理论门的收敛值；**收益倍数待一条判决性实测
  （`ArenaUsed(tree.arena)` vs 各列 `len` 之和）确认，未测前不得声称收益**。详见 `design/arena_capacity_and_u0_cut.md`。
- **依赖**：**排在 ①②③ 之后**（修前进程在消费第一个源之前就已被推过门，本项测不出来）。
- **工时**：**未定**（原 TA-MEM3 文本按实测形态改写后，工程量级相应下降）。

#### 5.7.8 ⑧ 并林路径 correctness（遗留项）：authority 判重 key 补 producer（源）维度

> **排序变更**：本条原为"第一优先/第一前置"，09-11 夜起**降级为并林路径遗留项**（S1b 链下 pass0 全 234 跑完、门内不再撞门，
> 该缺陷属**并林路径**，不再是当前墙）；动作/判据/依赖/工时条款本身仍有效。

- **动作**：三个 span-keyed 判重域——`declaration×5`（填充 `parser.cheng:8976-9002`）、`lexicalScopeBlock`（`:9014-9033`）、
  `patternOwnerRegion`（`:9034-9057`）——的 key 从「纯 span」改为「**producer + span**」，唯一性判定从「全树 count==1」
  收窄为「**同源** count==1」；同期补**同源硬臂**（authority 行 producer == 该 forwarding production 的 producer），
  否则等于放宽。producer 逐行可得（`ParserValueExprForwardingProductionChildProducerSourceIndexAt` @ `:8024`，HEAD 复核命中），
  无需新 API；key 塞不进 int64 时按 producer 分桶或链化（wall154 的 `*NextInSpan` 平行链），
  **禁哈希压缩 key**（完整性判据，碰撞=静默 fail-open）。出处：`design/authority_invalid_triage.md` ⑥ 方案 A
  （等同 09-05 wall154 已验证设计；该补丁 14 hunks + `compiler_csg.cheng` 1 hunk **从未入库、已从 HEAD 树消失**——
  `grep -c "declarationNextInSpan" src/core/lang/parser.cheng` = 0，须重写；设计可直接复用）。
- **判据**：`src/tests/did_subscribe_smoke.cheng`（37 源）与全量 234 源抬门轮**都不再出现** `authority invalid`；
  四夹具 + wall154 台账用例（`elf_riscv64_writer.cheng: fn elfWriteSym` ↔
  `debug_relocatable_object_evidence.cheng: fn debugObjectCStringValid`，跨源同 span 3351:3879）回归绿；
  单源语义等价（单源树 producer 恒同 ⇒ 与旧行为零变化）；负例控制「同一份源喂两次」实测 fail-closed；
  改后必须重烤驱动（C 链 ~200s）。
- **依赖**：无上游；需 `parser.cheng` 独占期 + 原子槽（`mkdir .rebuild/COMPILE_SLOT.lock`，`lease_hits=0` 是数据入账前置）。
  与 ⑥ 无代码依赖，但同占 `parser.cheng`，落盘须串行。
- **工时**：**6~10h `[估计]`**（3 域 key 改造 + 同源硬臂 + 重烤与四夹具 / M3 / 全量抬门复跑；设计在案、补丁已失须重写）。

#### 5.7.9 ⑨ S1b：pass0 流式化 + 删并林（记忆轴主刀）

- **动作**：按 `design/pa_s1b_edit_plan.md`（**rev.3**）与 `design/incremental-forest-consumption.md`（rev.3）步梯——
  **S1b-0** 纯加（Seal 列 + 索引消费辅助 + 逐源对拍门 0f + R1 append/seal + 埋点含 `live`）→ **S1b-1** 原子切换
  （删并林半段 `compiler_csg.cheng:33076-33168`，含 `totalArenaBytes` 一次性预留；`typed_expr_type_arena.cheng:5763`
  拆 Init/AppendSource/Seal；权威相索引化；逐源驱动 + R1 逐源 + Seal 接线；reuse 分支同期定形态）→ **S1b-2** 删林
  （字段/死码/abort/断言/旧实参 + `grep -rn typeArenaParserForest src/` **真零命中**）。
  **旧判断（09-10 晚，保留）**：当时的最小首刀 = R2 两相拆分（索引相 S1a 已入库 `f92f573f2` / 物化相+删森林 S1b），
  判定 B1-B6 全可证伪；隐藏天花板 = `frontierParsedSources` 跨轮持久（`compiler_csg.cheng:39107-39108` 整批释放，
  HEAD 复核命中；旧写 `:39060` 系 S1a 入库前编号）。
- **判据**：B1–B6（施工图 §5；口径见 §六.3）。第一判据 **B2b「234 源能否跑完」**；B2 峰值对照抬门实测峰
  `2,107,262,968 B`（B 轮）/`2,146,535,464 B`（全量抬门轮）；**B2c** pass0 活块曲线平台化；
  **B4** 四夹具产物 sha256 全等（硬门，不等即否决，不接受「差一点」）。
  **红线**：只删并林不得宣称过 768MiB（pass0 末已占门线 96.9%）；**不得据 rc≠0 判 S1b 失败**——correctness 未修时
  抬门跑先死在别处，时间/内存面数据取不到（`incremental-forest-consumption.md` rev.3 §4.2）。
- **依赖**：**① 之后**（否则没有能跑到底的被测对象）；`compiler_csg.cheng` 单文件独占期
  （09-11 实查该文件工作树挂 `31 0` 未提交）；⑥ 同文件面串行。`typed_expr.cheng` 在途 WIP（施工图记 +35/−11）
  已不在当前工作树 diff 清单（同日实查 `git status`），开工前仍须复核。
- **工时**：**34~46h `[估计]`**（`pa_s1b_edit_plan.md` §6.1 合计，**不含 S1b-N/M**；旧估 28-36h 作废）。
  **含 S1b-M（pass0 活块累积）另计**：触发条件为 Δlive ≥ 1M 且 owner 不明（`[实测]` 当前 Δlive=1,618,833、
  pass0 末占门线 96.9%），触发/判据/红线见施工图 §3.3，**工时未定**（等 S1b-0 的 `live` 逐源曲线）。
- **交付边界（防假绿）**：见 §4.9-2。

#### 5.7.10 ⑩ 768MiB 真门达标验证（发布级前置，必须绑定真门与本仓守卫）

- **动作**：在**真门**（`805,306,368 B`=768MiB；内门 + 外门）下跑四夹具与全量自烤；双口径守卫 =
  Darwin 进程树 `tools/beat_c_process_group_guard.sh` + Linux cgroup v2 `tools/linux_cgroup_guard.sh`
  （`memory.max` 精确字节 + `swap.max=0` + `oom.group=1`，raw 快照 + sha256 回执）；随后 metadata 峰 ≤768MiB + 900s 帽
  → GEN2 → GEN3 原始 `cmp` + SHA → **源码冻结**并绑定源码/编译器/工具三方哈希。
- **判据**：真门 rc=0；`tools/user_path_gate.sh` 四夹具判词回归；配对轮禁缓存、driverA/B 同名 `--out` sha256 相等；
  `--out` 落仓库内或 `$HOME`（不得落 `/private/tmp`）。**当前门内 3/4 PASS、v6 超线 `821,691,976 > 805,306,368` 必须转 4/4。**
- **234 源门内并林的判据已机械化**：`.rebuild/s1b_step3/gate_run.sh <label> r9/kd_<tag>` 产出 `<label>.summary.txt`，
  再用 `.rebuild/s1b_step3/check_acceptance.py <label>.summary.txt` 判 **ACCEPT/REJECT**：四条同时成立 =
  `rc=0` ∧ `forest_parsed_lines=234` ∧ `forest_appended_lines=234` ∧ `guard_hits=0`
  （另：`ta_stream_lines` 出现时必须等于 `forest_appended_lines`，否则说明发射点被改坏）。**缺任一读数一律 REJECT**
  （fail-closed：读不到判据不算通过）。该 checker 已对两件历史 summary 实测判 REJECT
  （`default768_step3` / `default768_verified`：rc=125、appended=24、guard_hits=1、`ta_stream=0`），
  并已用合成用例验证 ACCEPT 与"缺 `forest_appended_lines` ⇒ REJECT"两条路径。
- **依赖**：**① 之后**（否则全量跑不到底、无被测对象），且 **⑦ + S1b-M 之后**（否则 pass0 末已贴门线 96.9%）；
  另需先收割未提交资产（seal 回归修复 v4 等，`HANDOFF_20260910_fullgo.md` §三/§四）并使他线 WIP
  （尤 `bootstrap/cheng_cold.c`）落定——否则不满足「源码冻结 + 干净树」，出不了发布证据。
- **工时**：**8~16h `[估计]`**（复烤闭合 + GEN2/GEN3 固定点 + 双口径回执 + 哈希绑定）。

#### 5.7.11 ⑪ 池化 4/4 与合同冒烟（`BACKEND_JOBS>1` 路径，与上述不同轴）

- **动作**：先跑 probe10 打点（一次运行把 8 个顶层合取项 + C8 的 10 个子项打成 0/1，
  `design/pool_stage68_conjuncts.md` §④），命名存活假项；按判读表上**修复 A**
  （`primary_object_plan.cheng:68876/68879/68882/68885/68888` 五实参还原为 `false,false,false,true,true`）；
  仅当探针把循环 C 也打成 0 才加修复 B（`:68925-68930` 补 canonical 的 `preallocatedInSource` 分支）。
  **四夹具之外的合同冒烟**补跑。
- **§68 的定位与首选候选（保留）**：残留失败词 `pv_fail stage=68` 定位到 `primary_object_plan.cheng:68948`
  （HEAD 复核：`PrimaryLowerPoolBodyIrPayloadPrevalidate` `:67827` ~ `primaryLowerPoolWriteFrameHeader` `:69028`
  之间第 68 个 `return false`；文件 sha256 `50176394…`，与 `design/pool_stage68_conjuncts.md` 记值同）。
  首选候选（**推理，置信度中高约 0.55，待探针确认**）：fix3 把 `primaryLowerPoolRangesCoverTail` 的 `requirePositive`
  五实参极性抄反——canonical `bodyIRCleanupRangeValid(..., allowEmpty)` 对 local/op/call/block/term 是
  `true,true,true,false,false`（`core_types.cheng:6641/6646/6651/6656/6660`），而镜像形参
  `requirePositive = !allowEmpty`（`:67723-67724`）⇒ 应为 `false,false,false,true,true`（`f8f4ab66c~1` 原极性）。
  修复 A 待 probe10 探针打点命名后落地（`design/pool_stage68_conjuncts.md` §①/§③/§④）。
- **判据**：四夹具 jobs=1/2 产物 sha256 逐字节相等；`grep -c POOLPROBE` = 0（探针必须还原）；
  `git diff --numstat` 只含预期行数；`python3 tools/move_into_field_completeness_gate.py` PASS；
  串行臂 hunk 数 0（红线：**禁失败回落串行**）；合同冒烟（四夹具之外）——**当前未验证，须补判据**。
- **依赖**：独立于 ①-⑩（`primary_object_plan.cheng` 文件面；该文件 HEAD sha256 `50176394…` 与 09-11 静态定位时一致），
  但共用独占槽/烤机（09-11 03:13 槽位由 pool68 线自持，锁内 purpose = `pool68: probe10 stage68 verdict + fix A
  (A/B byte-equality)`，见 `design/pc_closure_s1_progress.md` §8.0 ⇒ 本项在飞时其它线让位）；
  **全量 `ci_gate.sh` 与 GEN2/GEN3 固定点未复验**，闭环须补。
- **工时**：**4-8h `[估计]`**（探针 + 极性修复 + 四夹具 j1/j2 对拍；其中 jobs=1/2 对拍已部分完成 ⇒ 余 probe10 +
  修复 A + 合同冒烟）；**合同冒烟工时未估**。
- **09-11 夜现势**：池化四夹具 **4/4 全绿、j1=j2 逐字节相等**，入库 `8e1a84ec4`（连同四门禁 PASS、发射字节中性）。
  **09-13 probe10 复验回执（P1 线）**：HEAD `8e1a84ec4` 已含 fix A（极性）+fix B（越界放行分支）+fix C（block/term coverage）+fix D（intent snapshot typeId），present 臂 **12/12 子项全 1 零存活假项**（与 09-11 修复前同形状 body 探针对照逐项证实）；条件修复 A/B 均不触发，零新补丁；四夹具 j1/j2 exe+primary.o 全 cmp IDENTICAL（j1retake/j2b 复跑三重钉死）、探针轮与干净轮 exe sha 完全相同=发射字节中性、完整门 PASS、探针零残留、串行臂 hunk 0。**口径变更**：fix C/D 在失败臂前新增一个 return false ⇒ stage 序号 68→69（克隆根 :69108/活树 :69285，函数体两树逐字同）。**遗留**：present 臂零测试覆盖（无构造非空 field-17 schedule 的 smoke，建议补）；全量 `ci_gate.sh` 与 GEN2/GEN3 固定点复验仍待源码冻结窗。

#### 5.7.12 ⑫ 严格闭包 S1（K2/R2 清零）

- **动作**：切 E3+E4+E2 三门面入口边 + 同刀删 `bootstrap/kernel_manifest.cheng` 11 行
  （HEAD 复核命中同形行：`:28,30,59,222-226,228,229,231`）；施工靶 `design/strict-closure-k3-split.md` §三 /
  `design/pc_closure_s1_edit_plan.md`（627 行）。门期望阶梯（每步同刀删 manifest 行，全切片删 11 行）：
  194/12/30·342/42 → 189/8/29·328/37 → 185/5/28·325/33 → 183/4/27·324/31。
- **09-10 晚 K3 拆分设计（保留）**：12 条 arch 链坍缩为 6 门面 / 12 条入口边；反事实切边实测最小切片
  **E3+E4+E2 → arch 4 / closure 183 / token 27·324 / 出闭包 11 文件**；token 342 行中 238 行是纯字符串
  （`direct_object_emit` 78 行最大）。禁止项：启用 `codegen_contract` 的 fn 值槽注册表、注释藏 token、拼串绕过。
- **09-10 晚行级施工图五条纠偏（均实测，保留）**：① 门面**出闭包的充要条件是调用方停止 import 它**，
  不是删门面自身 arch import（只切门面实测 186/arch4/token 30·342/出闭包 8）⇒ 必须同刀切「调用方→门面」import；
  ② 设计 §3.2「组合根服务循环 + `CompilerMainCompositionProcessEntry` 可续跑」被静态否定
  （`compiler_main.cheng:8859-8868` 明令 pristine-heap 单次前置，`:9053-9063` 是薄包装无游标/phase，HEAD 均复核命中）
  ⇒ 轨+续跑 30-60h、**S1 合计 60-120h**（原 40-80h 低估），三条出路 A 延迟尾 / B 游标续跑 / C 两趟冻结（C 对 E2/E4 不成立）；
  ③ 设计 §3.4 的 kernel-only 负例**无判据力**（`codegen_contract.cheng:561-566` 对 kernel-only 恒 false，准入期即 return 9，
  今天就绿，与 E3 无关）；④ 设计 §4 mtime 与行号已过期，E2（`codegen_x64_body_units`，15 处调用点）与在途 WIP 的
  68858-70089 **不重叠** ⇒ E2 可独立成步；**09-11 静态复核 + 本 HEAD 复核**：E2 的 15 处调用点内容全中、
  行号相对施工图有漂移——本 HEAD 命中 `:3064 / 62834-63121 / 64547 / 67343 / 75942`
  （施工图原记 `3064 / 62822-63109 / 64535 / 67331 / 75980`；6 组 +12、末组 −38）；⑤ token 实账 A20/B91/C219/D12=342，
  S1 只吃 A 类 3 文件 18 行；`direct_object_emit` 78 行的诊断文案被 2 个 `-F` 判词门 + 夹具
  `tools/zc_fixtures/wave3/repro44_call_nestedargs.cheng:18`（HEAD 复核命中 `"direct object emit: add branch reloc"`）逐字钉住
  ⇒ 只改 token 子串、保前缀与后半句、**禁全局 sed**；另有 8 个 token 文件的标识符被 175 条 `-F` 字面量钉住 ⇒ 只改值不改名。
- **判据**：`--require-strict-closure` arch 12→4、closure 183、token 27·324；四夹具 + 契约冒烟绿。
  **当前门读数**：`strict_manifest_sources=194 strict_core_closure_files=194`、`manifest_unreachable=0 closure_unmanifested=0`、
  `arch_reachable_files=12`、`arch_token_files=30 / 342 行`；`indirect_edges=128`（18 源）、
  `divergence_hits=225`（arm64=45、triple=156）；**09-03 口径的 201 core 可达源 / 13 arch 文件已不适用**。
  **当前状态**：S1 静态线**零 `src/**`/零 manifest 改动**——阻塞于施工图自身（S0.5 `CompilerMainProcessEntry` 可重入性
  实测需 1 次烤机 + G1-G4 规格未闭合）；静态前置全部复现（基线 194/194/arch 12/token 30·342/violations 42 rc=1；
  反事实 oracle 183/4/27·324/31 与保留行逐名一致；E3/E4 与 11 行 manifest 零漂移、E2 15 处整体漂移）；
  新发现两个派发 smoke 也 import 三门面（严格门只遍历 `src/core` 故不可见，无门构建它们）。
  **第二轮（`design/pc_closure_s1_progress.md` §8，实测）四项裁决输入**：① **G2 判据被实测推翻**——契约文件在门内
  `ARCH_TOKEN_CONTRACT_FILES` 内被直接 `continue` ⇒ **门对该文件 token 零覆盖**（两变体跑门输出逐字节相同），
  改用**调用方新增 import 面判据**⇒ 取 B（0 新增 import）并消解 `ResultAt`/`ObjectBytes` 矛盾；
  ② **G4 推翻施工图一处事实性错误**——`slotDataSymbols`/`cstringDataSymbols` 是 `var` 形参但语义只读，
  全 `src/` 仅 3 处写且都在内核侧、轨调用之前（`regalloc_production_emitter.cheng:729/735/749`），
  三个 arch adapter 写模式零命中 ⇒ E4 难点收缩为两个真 `var` 载体；③ G3 取 import-only 读法；
  ④ G5 登记：两个派发 smoke 是**非内核消费者**（`src/tests/**`，严格门只遍历 `src/core/**`），**不许删测试**。
  G1 两种 pending 第三态候选 + 判别实验已备；manifest 11 行同刀脚本**写好待用、未落盘、未执行**。
  **另有（commit `2cc034bf8` 摘要，未复验）**：契约已存在**两套 fn 值槽派发面恰覆盖 E3/E4**（属禁止项⑥范围）
  ⇒ S0 须走第三条数据面。**未闭合**：S0.5 实测（需槽位）、G1 定案、两个派发 smoke 的处置
  （若 S0.5 迫使改门面本体，须同刀改其断言对象，**禁止删测试/skip 让门变绿**）。
- **依赖**：需编译槽做 S0.5 实测 + G1 定案（G2/G3/G4/G5 已由第二轮给出裁决输入）；四夹具与契约冒烟**当前未复验**。
- **工时**：S1 **60-120h**、token 清零 **46-83h**、arch 4→0 **60-140h**（09-10 晚行级施工图纠偏；原 40-80h 低估）。

#### 5.7.13 ⑬ 解 held-exec 平台门

- Linux x86_64 生产环境或 DarwinAuthority 生产臂。09-10 晚 `b6b4816e4` 已把 darwin 臂实现到
  「五原语等价判决 + 纯派发器 + 硬 fail 码（**无 linux required 兜底**）」，**余 M3 安装面（root + `SF_IMMUTABLE` + 签名）**
  ——需环境/用户决策；解锁后补幽灵运行期终验 + 纯载具可编语料恢复（RSI 编译器域 C1 A/B 的解锁面）。
- **依赖/判据/工时**：施工图 `design/pd_heldexec_m1m2m4_plan.md`（395 行）；各模块可证伪探针（M1-a/b、M2-a/b/c、M4-a/b/c）；
  M3 未装处显式 HARD_RED；**27-46h / 12-18 轮烤机 `[估计]`**（不含 M3 安装与 M5）。
- **已在树的事实（保留）**：字面串 `src/core/runtime/production_held_exec_spawn.cheng:56`（HEAD 复核命中
  `"held_exec_parent_linux_x86_64_required"`）；声明点 `src/core/runtime/program_support_backend.cheng:28985-28989`
  （HEAD 复核命中 `@exportc("cheng_held_exec_parent_begin_claim")` 声明块；旧写 `:28983-28987` 在 HEAD 已漂移）。
  `psb begin_claim` 已拆纯派发器（Linux 主体逐字节保留，darwin 臂硬 fail 于 errcode 33 + 未接线码 31-34）；主树 contract 冒烟双 rc=0。
  Darwin 等价判决：fs-verity 可行；pidfd 部分（kqueue `EVFILT_PROC` + birth tuple）；proc 可行（libproc 全字段对照）；
  execveat 不可行（`fexecve` ABSENT + `dev_fd` rc=9，生产臂改固定路径 `posix_spawn START_SUSPENDED`）；SEQPACKET 不可建
  errno=43，等价 = `SOCK_STREAM` + 定长分帧 + `getpeereid`。

#### 5.7.14 ⑭ 其后（保留原条目，未变）

- **Step 4 三臂**（online 取件→校验→任务 store→下一次静态组合→exec_diff；tamper 拒收；offline fail-closed 含已装清单）。
- **Step 5**：本文（合并后）与相关文档同步、OpenSpec archive、`cheng-fusion` 正式仓落位、接 release CI。
- **独立施工单（未派，不在关键路径）**：`bootstrap/cheng_cold.c` 残余 **151 行**探针（142 行为整行
  `if (…) fprintf(…);` 可机械删除，9 行为多行续行需手改）+ `cold_parser.c:77383` `CHENG_NO_MEMO11` 5 行临时开关；
  因两文件均带未提交改动且 mtime 近（他会话编辑面），按 lane 纪律不动刀，留独立施工单。

#### 5.7.15 ⑮ 与 RSI / 内核两条线的交集与顺序

- **动作**：按 **① →（② ∥ ③）→ ④** 排它；两条线的解锁面都是本计划的同一门面。
- **在案事实**：kernel 战役 **Step 2 组合装配 / Step 3 768MiB / Step 4 三臂与 RSI 编译器域同被该内存墙前置阻塞**
  （`HANDOFF_20260910_fullgo.md:9`）；RSI 侧现态 = 任务域 EXHAUSTED 终态 + **编译器域 C1 A/B 载具级 BLOCKED@kernel 覆盖墙**，
  其任务表明写解锁面「kernel 战役清墙后：重冻结档 1/2 语料 + 解锁 C1 A/B 载具 + 补 gate 编译器域两腿」
  （`2026-09-07-pure-cheng-rsi/task_plan.md:21-22`）；RSI 的 RSS 守卫已包 `beat_c`，768MiB 在 RSI 侧只作防失控硬限。
- **判据**：①②③（含 S1b-M）落地后 kernel 链路能在 768MiB 门内跑完全量 234 源且固定点可复现 ⇒ 该判据成立
  即 RSI 编译器域 C1 A/B 载具的解锁条件成立。
- **依赖**：文件面互斥（`parser.cheng` / `compiler_csg.cheng`）；RSI 侧不占这些文件面，只等门面开。
- **工时**：**0.5~1h `[估计]`**（协调与门面；不含被解锁方自身工时）。

> **2026-09-13 融合改写（本条升级，取代上面"RSI 等门面"的单向口径）**：两条线是**同一个优化问题的两条约束轴**，不是先后依赖——Cheng 链自烤的时间墙（`ParserValueExprTreeAppendFromImpl` 三处同族站点，森林窗 **553,914 ms**）与内存 `G(k)` 主项（`ParserValueExprProcessStatementRangeWithTypeOwner`，**671 MB / 单调用 96.3%**）**同属 `src/core/lang/parser.cheng` 的 `ParserValueExpr*` 族**（异口径对照：C 链参照烤 `kd_b102` parse **136,997,679 µs / 208,367,529 µs = 65.7%**），只动一轴等于把成本在两条轴之间搬家。
> 因此把"⑮ RSI 交集"改为**车道矩阵**：kernel 出候选、RSI 出准入，判据/仪器/账本三者只允许一份。七条车道、文件面互斥、判据与排期见 `docs/cheng-rsi-fusion-plan.md`（唯一融合层）。
> 立即可并行的四道（不占 `parser.cheng` 文件面、不等清墙）：**L1 时间模型结构化** `[估计] 3–5h`、**L4 RSI 语义 oracle**（31 格任务域当编译器回归语料）`[估计] 8–12h`、**L5 RSI C1/C2 口径对齐 + 新增语料档 3 = 234 源自烤** `[估计] 6–10h`、**L6 自烤理论发射接线验证**（patch 已就绪，等编译槽位）。
> 同文件串行组：**L2 G(k) 收口 → L3 region 第三点 + S1b**（二者都在 `src/core/lang/parser.cheng`，单写者）。
> 判据不变：`rc=0` ∧ 树峰 ≤805,306,368 B ∧ 各相贴线三判据同时成立。

### 5.8 S1b-N 重新界定

= **消同族冗余「整段源文本 clone + intern」**（取代施工图 §6.3 的宽口径「消 intern/CloneStr 二次代价」；
也不再以「单源时间盒是否挂死」为触发前提）。根因已锁定为 `ParserValueExprTreeAppendFromImpl` 内三处循环站点，
**⑥ 即其第一刀**；剩余判据 = 第三处补完后森林窗 / 整轮 wall 是否降到量级不同（二分口径：<120s 判「量级不同」，
否则仍判部分缓解并继续定位）；B4 语义硬门不破；**不得**以减少 intern 调用次数但改变 intern 顺序/identity 的方式换时间
（`typed_expr.cheng:36946`、`parser.cheng:10304` 的精确身份链条不得松动）。

### 5.9 前版路径项（逐字保留；判词未变，S1b 明细的 `文件:行` 已于 2026-09-10 夜修正）

> 以下为 09-10 晚版本，逐字保留以便对账；凡与 §5.7-§5.8 重叠处（如 S1b 合计工时 **34~46h** 取代旧写 28-36h、
> 时间墙根因由「假设」升级为「锁定」），**以 §5.7 为准**。

0. **四夹具 baseline 入库 + probe 区 7 红收口**：工作树 `user_path_baseline.tsv` 四夹具已 4/4
   （ordinary/call_fixture/cold_nested/v6 = 0/0、0/1、0/0、0/0），probe 区仍有 7 件红
   （generic/closure/objctor/assert/tuple/try/array），baseline 尚未提交。
1. **C-0 测量账本**：allocator live（alloc/free/live）唯一权威、终态相采样、持有者账
   （`phase_c_recon.md:57-64`），此后一切内存结论以该账为准。
2. **增量消费改造（约 −800MB~−1.2GB，768MiB 一切验收的前置）**：目标态 = 每源 parse→typed 生产→立即释放，
   不再「全量 profiles/快照（≈700MB）+ 整块合并森林 arena（1,230.7 MiB）」同时在驻。
   **09-10 晚设计定稿**（`docs/campaigns/2026-08-31-kernel-userpath/design/incremental-forest-consumption.md`）：
   ① **768MiB 的直接死因是 pass 0 单源 parse 的 arena 块倍增瞬态**（`parser.cheng:26647-26650` 自述 268MB+134MB；
   `arena.cheng:373-398` 的 `ArenaArrayInt32Add` 每次翻倍都在 arena 内弃旧块且不复用），合并森林 1,230.7 MiB 是 1.5GiB 的死因；
   ② 只删合并森林后残留峰 ≈660-804 MiB，**仍压在 805,306,368 线上（余量 <1MiB）**，必须同时买第二轴
   （churn 归还 / 保底驻留 / 单源树宽）；
   ③ 最小首刀 S1 = R2 两相拆分（S1a 索引相 → S1b 物化相 + 删合并森林），判定 B1-B6 全可证伪
   （含反向判词：phys 降幅 <1,230.7 MiB 的 80% ⇒「合并森林是 1.5GiB 死因」被证伪）；
   ④ 隐藏天花板：`frontierParsedSources` 是跨轮持久缓存、只在 `compiler_csg.cheng:39107-39108` 整批释放
   （2026-09-10 夜实读更正；旧写 `:39060` 系 S1a 入库前编号，已整体漂移约 +28 行），
   若固定点走遍 234 源会二次长出全林（流式化只是搬峰点）。估工 28-36 agent h。
   **09-10 晚 S1b 行级施工图（`design/pa_s1b_edit_plan.md`，257 行）三条纠偏**：
   (i) 「TypeArenaBuild 拆 Init/AppendSource/Seal」字面不成立——真实函数在 `typed_expr_type_arena.cheng:5763`，
   Seal 段有 **7 处必须读输入树**（`:5530/4270/5617/3553/1550/1744/1862`），须先补 arena 列
   （TypeSyntax 子 CSR / enum variant CSR / owner-token name intern id）才能拆 ⇒ 估工 **~28h+**（原 19.5h 偏低）；
   (ii) **B5 埋点原址是死码**（原锚 `:38877`、位移后编号 `:38930`；arena 在该处已被 move 走），
   已由 `43e12c322` 移位到 `:38912`(guard)/`:38914`(emit)，位于 `:38921-38923` arena bind **之前**；
   旧写「埋点 `:38924`」与「arena 于 `:38912` 已 move 进 typedIr」**两处均错**（`:38912` 是 memTrace 守卫）。
   实测：A/B 双轮 `type_arena_lines=0`（门内墙在 pass0 forest 累积，生产阶段不可达；埋点位移 `43e12c322`
   已证旧址是死码——before 命中 0）⇒ TypeArena 本体体积仍无 234 源实测值；
   **TypeArena 不可能是 768MiB 决定项**（独立 arena + 独立 `internPool`：`typed_expr_type_arena.cheng:5776-5778`；
   尺寸上界 ≤ 森林，而森林单项 Σ=`1,290,508,960 B`=1,230.73 MiB 已是门的 **1.60×**），
   其 `used` **不得与森林相加**（共驻点只在 `:35512` 并林窗，释放点 `:35553`）；
   夹具相 TypeArena 恒 1MiB cap / 峰值 25.9KB used，**不得外推**到 768MiB 结论。
   (iii) reuse 路径须同期定形态（推荐「同一 AppendSource 驱动 + 整林按源行区间喂」，顺带删 `:33055` 全林 clone）。
   **(iv) intern id 是位序分配（`intern.cheng:690-724`）⇒ 新列不得提前 intern**：若按设计在 `FillTypeSyntax` 内提前
   intern owner-token/变体名文本，会把后续既有 name id 整体移位，而 name id 是 `typedExprTypeArenaHash` 的输入，
   B4/B5 必破。S1b-0 定稿做法 = **构建末尾 append-only 填新列（新列不入 hash）**，同时满足「新列可用」与「逐字节不变」；
   S1b-2 逐源化时每源窗口必须自带文本（或专用池），不得在主池提前 intern。
   **(v) S1b-0 实测负结果（21:36 交回，已精确回退）**：15 hunks/+446 落地后——两驱动烤机均 rc=0
   （before `b8fa3d63` rss 711,049,216 / after `081d3422` rss 711,524,352）；**byte 等价成立**
   （ordinary `961ccaae`、call_fixture `93987aaf`、cold_nested `538636bb` 前后全等）；四夹具 jobs=1 下
   **v6 由 PASS 变 rc=125**（`rss_limit_exceeded rss_bytes=856,343,704 > 805,306,368`，**超线 51MB**）。
   同树态唯一差异即该补丁（4 文件 sha 有 `tree_{before,after}.sha256` 留证）⇒ 归因明确、非环境。
   主因疑为 **owner-token 全量提前 intern**（池/哈希索引增长与再哈希瞬态）+ 9 新列的 doubling。
   ⇒ **设计修正**：owner-token 文本**不得全量提前 intern**；改为「只对 Seal 实读行 intern」或存**旁路文本列/span**。
   全部 hunk 已回退（两文件 sha 精确还原 `d1abbb21`/`4588aa9b`），补丁留 `patches/s1b0_step.patch`（sha `7977a069`，
   `git apply` 可重放）；证据在 `.rebuild/run_s1b0/`。
   **仍未取到的关键未知量**：B5 埋点实测数（该轮驱动编译未带 `CHENG_CSG_MEM_TRACE=1`，且冷烤不走 Cheng CSG 管线）
   ⇒ 下一步做**只挪埋点的最小补丁**（1 hunk、hash-neutral）+ 一次带 trace 的驱动编译，先拿到 TypeArena 本体积，再决定 S1b 形态。
   施工梯：**S1b-0 纯加（埋点/新列/`functionBaseBySource`）→ S1b-1 三相当量重构但仍喂整林（byte 等价桥接态）
   → S1b-2 逐源流式 → S1b-3 删林**，每步 rc=0 可编译；反向判词：phys 降幅 < **984.6 MiB** ⇒
   「合并森林是 1.5GiB 死因」前提证伪、回 I2。前置：`typed_expr.cheng` 在途 WIP（+35/−11）与本刀强重叠，
   开工前须先落盘或冻结；`compiler_csg.cheng` 需单文件独占期。
   另：单源峰值靶 = 森林成本 ≈2,012 B/源行，Top6 大源占 42%（`typed_expr` 134.1 / `primary_object_plan` 131.8 /
   `compiler_csg` 70.0 / `parser` 67.0 / `lowering_plan` 60.1 / `compiler_snapshot_builder` 59.5 MiB）。
3. **C-2 堆腐 SIGSEGV 定谳 / C-3 假说（SMALL dirty 627MB）**（`phase_c_recon.md`）。
4. **W5 merkle bootstrap 主修**（~449MB/170s 窗；W1 已 −319MB）。
5. **T-1 intern 正则化**：消 parse-into-forest 串行 append（~500s 级主墙）；PARSE-PERF 线在跑
   （CloneStr 消除 / intern 表升级 / 批处理 / 私有池并行四候选，先量化后动手）。
6. **768MiB 复烤闭合**：metadata 峰 ≤768MiB + 900s 帽 → GEN2 → GEN3 原始 `cmp` + SHA →
   源码冻结并绑定三方哈希 → Linux cgroup v2 精确 768MiB 双口径回执（`tools/linux_cgroup_guard.sh`）。
7. **T-2 typedIr fixed-point 波次化**（P1 汇点增量化；字节恒等 = row 分配保序清单逐结构重做）。
8. **T-3 codegen 包围段分流** + 下游未达界相逐相账。
9. **entry cache 冻结化**（P1 真身）：先冻结 declaration origin、source-slice CID、依赖签名/type CID、
   compiler schema 与 target descriptor，再缓存 frozen BodyIR，损坏条目 hard-fail
   —— 零变更 ≤3s、1/3 编辑 ≤10s 的唯一路径（现行 cold object cache 为 schema v4 整闭包键，
   `bootstrap/cheng_cold.c:86574`；`openspec/proposals/deterministic-memory-lifecycle.md:19-20`
   明文禁止把它称为 entry cache）。
10. **P2 物化并行 / P4 mmap 驻留+按需 / P5 验证增量化+世代修剪**（顺序如上，P2/P4 未动，P5 待证据政策裁决）。
11. **ordinary ≤200MiB**：待 0-8 结构刀落地后重推锚表（当前四夹具/用户路径峰 651-765MiB 量级）。

#### 5.9.1 时间墙根因（已锁定，不再是假设）

`ParserValueExprTreeAppendFromImpl` 内**三处同族站点**——每 token / 每 typeSyntax 节点 / 每 region 各对
「该节点所属源的**整段源文本**」做一次 `strings.CloneStr`（malloc+memcpy）+ `langintern.Intern`（整串 hash +
探测×逐字节比对），**三处均无 per-source 缓存**（同 impl 上游 `parser.cheng:10303-10330` 的 node 循环有
`remappedSourceIds`，是该 impl 内唯一有缓存者）：

| 同族站点 | 缺缓存区（VERIFY §21.9 / §22 记录） | 当前 HEAD 锚点（`9c368085c` 重 grep） | 状态 |
|---|---|---|---|
| token 循环 | `parser.cheng:10546-10551` | `:10552`（缓存声明）/`:10553`（循环） | **已补**，入库 `c5f6c6736` |
| typeSyntax 循环 | `parser.cheng:10954-10960` | `:10977`（缓存声明）/`:10978`（循环） | **已补**，入库 `c5f6c6736` |
| region 循环 | `parser.cheng:11664-11675` | **`:11699`（循环）/`:11706`（Intern）/`:11708`（CloneStr）** | **未补 = 残余主项（= §5.7.6）** |

`[实测]` 两处缓存落地后的效果：森林窗 `after_profile_lookup since_ms` **774,266→553,914（−28.5%）**、
整轮 **793→577s 自结束**（修复前 1213s 盒到期仍卡 `src=2`）、`src=2` 单源 append 由「1173s 未完」→约 590s
→**约 400s**、`forest_appended` **2/29→29/29**。第三处（region）由全量抬门轮 el≈400s 的 `sample` + `lldb`
反汇编定位（热点代码偏移 **+90536/+90504**；紧邻前序调用含
`ArenaArrayInt32Get(sourceTree.arena, sourceTree.regionSourceTextIds, …)`，是该循环独有特征）。
**旧假设已证伪两条**：① **探测爆炸**——intern 探针 v1/v2 直方图 `worst=51` **恒定**，20min 内 steps 未跨 524,288
（平均 <217 步/s）；② **hash 常量**——`intern.cheng:250-260` 的 FNV offset basis 少一位是事实，
但 **id 是位序分配**（`internPoolAppendUnique` 返回 `pool.texts.len - 1`，`intern.cheng:710-725`），
hash 只影响探测路径，不是停摆根因。⇒ 根因在**调用侧**：单源代价 = `源字节 × 节点数` 双线性
（`[实测推算]` `parser.cheng` `L=1,729,036 B` ⇒ 10¹²–10¹³ 字节内存流量，与 16–20min 停摆量级吻合）。

#### 5.9.2 双轴判定（保留的轴定义，现势见 §二）

- **轴 1｜内存：pass0 累积消费流式化 = 必需项（不是优化项）。** `[实测]` 抬门 4GiB 诊断轮
  （env-only：`CHENG_PARENT_RSS_GUARD=1` + `CHENG_PROCESS_MAX_RSS_BYTES=4294967296`）pass0 全量 234/234，
  **Σ=`1,290,508,960 B`=1,230.73 MiB = 门线 `805,306,368 B` 的 1.60×**；`[实测]` 同一入口默认门下
  **rc=125 @176s 死在 pass0 第 62 源（`forest src=61`）**=`core/backend/primary_object_plan.cheng`（单源树 131.76 MiB），
  守卫读数 `836,388,064 B > 805,306,368`，并林尚未开始。⇒「先攒齐 Σ 再消费」的形态下 768MiB 数学上不可达。
- **轴 2｜时间：删并林分支 = 必要但不充分。** 删并林只移除**并林调用点**
  （`compiler_csg.cheng:33162` → `parser.cheng:10218/10222` 的 `ParserValueExprTreeAppendFrom/Impl`）上的时间墙；
  **同族未缓存站点仍在同一 impl 内**（见 §5.9.1 第三行）。`[实测]` 未删并林、仅补两处缓存的口径下：
  整轮 577s 才自结束、森林窗仍 553,914 ms、`src=2` 单源 append 仍约 400s ⇒ 买到的是「并林不再是 16+min 停摆点」，
  **不判「时间墙消除」**。
- **全量 234 源现状（当时口径，历史）**：默认 768MiB 门 `rc=125 @176s`、`forest_parsed=61`、`forest_appended=0`；
  抬门 4GiB（**diagnostic**）`rc=1 @583s`、`forest_parsed=234`、`forest_appended=40`、`max_rss=2,146,535,464 B`（2.00 GiB）、
  最长零输出窗 90s ⇒ 既未撞门也未超时，止步于 `authority invalid … producer=40`（= §5.7.8）。
  **未跑到的 `src=41..233` 是否还有别的错未定，不外推。**

## 六、验收铁门（全程不变）

### 6.1 默认 768 MiB 进程门（双口径守卫）

- 门值 = **805,306,368 B = 768 MiB**，唯一权威常量 `tools/memory_model_limits.sh`（`CHENG_MEMORY_MODEL_LIMIT_BYTES`）；
  内门 = 驱动内建 `CHENG_PROCESS_MAX_RSS_BYTES=805306368`（Darwin 侧读本进程当下 `phys_footprint`，口径见 §4.8）；
  外门 = Darwin 进程树 `tools/beat_c_process_group_guard.sh` + Linux cgroup v2 `tools/linux_cgroup_guard.sh`
  （`memory.max` 精确字节 + `swap.max=0` + `oom.group=1`，raw 快照 + sha256 回执）。
- 门内运行**缺任一读数一律 REJECT**（fail-closed：读不到判据不算通过）。

### 6.2 全量 234 源并林判据（内存达标线，已机械化）

四条同时成立才判 **ACCEPT**：`rc=0` ∧ `forest_parsed_lines=234` ∧ **`forest_appended_lines=234`** ∧ **`guard_hits=0`**；
另：`ta_stream_lines` 出现时必须等于 `forest_appended_lines`，否则说明发射点被改坏。
机械 checker：`.rebuild/s1b_step3/gate_run.sh <label> r9/kd_<tag>` → `.rebuild/s1b_step3/check_acceptance.py <label>.summary.txt`。

**6.2.1 逐相贴线（与上面四条同等效力，全任务硬约束）**

上四条只看**总峰**，会漏掉"总峰压下去了、但某一相已经贴着模型上限"的情形。因此本战役另立一条**同等效力**的验收口径：

- **约束卡（唯一）**：`docs/campaigns/2026-08-31-kernel-userpath/design/memory_model_constraints.md`；已同步进 `AGENTS.md` 工程规范第 9 条。
- **模型（唯一权威）**：`tools/memory_model_limits.sh`（门值与逐相锚）+ `verify_append/VERIFY_tamem_model_append.md`（逐相公式、系数、实测对账）。
- **判据**：每一相的实测 RSS 对本表模型值**报差值**，**差值 > 50 MB 即遗留物，必须解释**；`rc=0` ∧ 树峰 ≤768 MiB ∧ **各相贴线** 三判据**同时**成立才算绿。
- **纪律**：抬门诊断轮读数**一律不计入达标**且必须标 `diagnostic`；内存读数**只可同窗口相对比较**；`d_live`（找"谁留住了"）与 `rss`（找"峰值贡献者"）不可互换；按源/按行累积的结构必须给出 234 源全量外推与所属模型项，**外推超门即缺陷**；未钉模型项（待钉区①–⑤）不得当 0 或用估计值充数。

### 6.3 S1b 验收（B1-B6 六条判据 + I1/I2 插桩；口径见 `design/pa_s1b_edit_plan.md` §5）

口径基线：外门 + 内门 + `CHENG_CSG_MEM_TRACE=1`，四夹具 `BACKEND_JOBS=1/2`、禁缓存四件套；抬门轮（4GiB）只用于观测资源相上限，
**全部标 `diagnostic`**；驱动 = C 链烤（`cc -std=c11 -O2 bootstrap/cheng_cold.c`，166~200s），落点 `.rebuild/run_*/kd`，
时间盒 ≥6min 并保存 stderr/progression 原始件。

| 判据 | 期望 | 反向判词 |
|---|---|---|
| **B1 森林消失** | `grep -rn "typeArenaParserForest" src/ --include=*.cheng` **0 命中**；trace 无 `forest_build_start/forest_appended/forest_parsed`，新增 `ta_stream_*` 且**每源 parse 后有释放** | 仍有任一 `forest_appended` ⇒ S1b 未生效 |
| **B2 峰值** | 抬门 4GiB 1 跑，phys/rss 峰 **< 2,107,262,968 B**（B 轮 2,009.6 MiB）且**降到 pass0 量级**（B 轮 pass0 末 781,288,480 B）⇒ 降幅 ≈ **1.26 GiB** | 峰仍 ≥1.5GiB 或仍出现「pass1 预留后 OOM/卡死」⇒ 并林未被真正移除 |
| **B2b 森林窗量级（本刀第一判据）** | 29 源入口（`typed_expr_type_arena_smoke`）默认门 + 盒 1200s，读 `after_profile_lookup since_ms` **<120s**（基线 553,914 ms）且 pass0 234/234 源完成 | 森林窗仍停 553.9s 量级 ⇒ **触发 S1b-N**；「>6min 零输出」不再是判据，只作佐证 |
| **B2c pass0 活块曲线** | `forest_parse_begin/end` + `forest_parsed` 的 `live` 逐源落 TSV，曲线**平台化**（Δlive 不再单调升），目标 pass0 末 rss 回到 `609,387,432 B` 量级 | Δlive ≥1M 且 owner 不明 ⇒ **触发 S1b-M**，不得以「碎片/压力」结案 |
| **B3 单源瞬态** | `forest_parse_end.rss − forest_parse_begin.rss`，最大源（`src=134` `typed_expr.cheng` 134.09 MiB / `src=61` `primary_object_plan.cheng` 131.76 MiB）：pass B ≤ 单源 arena + 64 KiB（精确预留生效）；pass A 如实上报（首测点 `src=61` 瞬态 Δ=`185,319,664 B`（176.7 MiB）对单源最终 arena `138,162,976 B`（131.76 MiB）≈ **1.34× 单源 arena**，**单点推算、非上界**） | pass B 仍见 ≈1.5×arena ⇒ 前缀和没用于 reserve |
| **B4 语义等价（硬门）** | 四夹具 + 2 源对 + 8 源闭包，S1a 驱动 vs S1b 驱动**产物 sha256 全等**（S1a 基线 `793afdce…`/`d285f4be…`，四夹具 `d3cca8c1/4f9af51f/0b89d8dd/6eca55c6`，多源对 `9779b97d`）+ `decl_index verified=1` + 逐源对拍门全绿 | 任一不等 ⇒ 语义不等价，直接否决，**不接受「差一点」** |
| **B5 TypeArena 对拍 + 口径** | ① `types/tokens/used` 与 S1a 驱动相等；② 首次拿到 TypeArena 本体字节；③ **该 `used` 与 1,230.73 MiB 不得相加**（两个独立 arena，共驻点只在并林窗 `:35545`，本刀已删） | 不等 ⇒ 索引相或 AppendSource 丢字段 |
| **B6 索引相独立性** | S1a 已过，本刀只做**回归复验**（同门跑一次 + 逐源门 0f） | 复验不等 ⇒ 本刀破坏了索引相 |
| **I1/I2 插桩** | `forest_parse_begin/end`（含 `live`）+ `append_begin/end` 计时 + `frontier_store cap_bytes`，B1/B2 两跑内必须出数 | 无数据仍宣称达标 = 自证假绿 |

**S1b 施工梯（步与步之间必须可编译、不得留半成品态）**：S1b-0 纯加（行为不变）→ S1b-1 原子切换（删并林半段 +
Init/AppendSource/Seal 重构 + 权威相索引化 + 逐源驱动 + R1 逐源 + Seal 接线）→ S1b-2 删林（`grep` 真零命中）→
S1b-N（时间轴占位）/ S1b-M（内存轴占位）。**成本**：每轮 ≈7 分钟 wall；S1b-0/1/2 各至少 1 轮，
B2b + B2c + B2 + B4 再加 2~3 轮 ⇒ 6~8 轮。**独占槽是硬前提**：`mkdir .rebuild/COMPILE_SLOT.lock` 原子 test-and-set
（`ps`+协作旗标存在同秒双起，check-then-act 不是互斥原语），释放走 owner 校验的 `release_lock.sh`。

### 6.4 字节铁门与确定性红线

- 字节铁门：driverA/B 同名 `--out` **sha256 相等**（配对轮禁缓存，`lessons:752`）。
- 四夹具判词回归（`tools/user_path_gate.sh`）；验证强度零减弱；确定性红线（并行发射 index-order、mmap 不改发射输入）。

### 6.5 发布级铁门

发布级结论**必须绑定源码/编译器/工具哈希并落入正式仓**（工程规范 6）：真门 rc=0 + 双口径回执 +
GEN2→GEN3 原始字节固定点 + 源码冻结 + Linux cgroup v2 精确 768MiB 双口径回执 +
`full_backend_codegen=1` / `cold_system_link_exec=0` 正式回执。
**单 smoke、临时仓结果、未绑定报告、缓存命中重跑均不产生完成信用。**
（`full_backend_codegen` 是管线 provenance，不是覆盖率——完整面 C 烤的 `=0` 合格；GEN/zero-C 学分才要求诚实 `=1`。）

### 6.6 常驻门禁清单

- `tools/ci_gate.sh`：`kernel-plugin-closure`（`--require-closure`，commit `f7a88ae28` 接入）、`kernel-plugin-manifest`
  （`tools/kernel_plugin_manifest_gate.py`，x86_64=5/aarch64=4/riscv64=5 与归属表精确双向覆盖、源存在、跨清单唯一、
  不与 kernel manifest 重复）、`backend2-plugin-{cid,cache,trade}`、`cheng-source-purity`、`exact-def`
  derive/freeze/merge/call-authority/materialize 等；tracked `.cheng` Mach-O 魔数门（`scan_binary_magic`）内嵌于闭合检查。
- **棘轮门 `tools/cheng_export_symbol_dup_gate.py`**：把「`__cheng_setCmdLine` / `__cheng_rt_paramStr` 双实现、
  各带独立 backing store」这类结构性缺陷变成常驻守卫。范围 `src/core/{runtime,tooling,backend}`；**平台变体折叠**
  （`_darwin`/`_linux` 互斥实现算正常）把 169 条原始重复收敛到 **28 条真重复**；**棘轮而非清零**——28 条进 baseline，
  只允许减少、新增即 rc=1（历史债一次清零会把门挂红、失去信号）。负例自检：删一条 baseline →
  `NEW_DUPLICATE __cheng_rt_paramStr` rc=1；还原 rc=0。**未挂 `ci_gate.sh`**（共享文件 + lane 活跃，待主线点名窗口后加一行）。
- **严格闭包门期望阶梯**：`--require-strict-closure` arch 12→4、closure 183、token 27·324（见 §5.7.12）。

## 七、病态判据（红线，2026-09-11 用户裁定）

**凡超过理论内存或理论编译时间的运行时状态，一律按「病态」处理——它是缺陷，不是工作点。** 派生四条强制口径：

1. **理论量是硬边界，不是难度旋钮**：内存门 `805,306,368 B`（768 MiB，推导见
   `design/deterministic_model_derivation.md`）与编译理论并行下限 `compile_theory_parallel_limit_ms` 是模型给出的边界。
   运行时一旦超过，**必须记为缺陷（病态）并给出超出倍数**，不得记为"可用状态"，也不得记为中性的观测值。
   （**口径待修**：证据总账 §3.3/§⑦-7 已定性 `compile_theory_parallel_limit_ms` 实为**本轮实测 CPU / 核数的后验折算**
   ——"有效并行度基准"，不是算法下限；文档引用时须带该限定。）
   **2026-09-13 口径收口**：该定性成立并升级为结论——`compile_theory_parallel_limit_ms` 与 Cheng 链 `full_compile_theory_*`
   （`backend_driver_main.cheng:4416-4451`，系数 `bytes×50 ns` = 20 MB/s）**都不是理论时间边界**：前者是并行效率倒数、后者是后验校准系数，
   两者相除无意义。理论时间边界的正形 = 结构项 + 逐源斜率：`T_floor(相 p) = W_p / B_eff(p) + n_p × c_p`，
   其中 `W_p` 由算法决定。判据据此改为**超出倍数的量级判据**：当前三处同族 append 站点代价 = `源字节 × 节点数` 双线性
   （`parser.cheng` `L=1,729,036 B` ⇒ 10¹²–10¹³ B 流量），超出线性底线 **= 该项的节点/项数**（该源实测推算 ≈**6×10⁵–6×10⁶**），而非 13.7×。
   模型落地件 = `docs/cheng-rsi-fusion-plan.md` §1.2 与 L1（`design/time_model_structural.md`）。
2. **禁止把"抬门后的运行"当工作点**：抬门（`CHENG_PARENT_RSS_GUARD=1` + `CHENG_PROCESS_MAX_RSS_BYTES=…`）
   只允许用于**发现缺陷**（把门后面的因果链看清），全部轮次必须标 `diagnostic`；其运行状态**本身即病态证据**
   （例：抬门后 peak 2.0–2.3 GB ⇒ 超理论门 2.5–2.9×，是待消除的病态，不是"能跑完"）。
3. **当前已判定的病态实测（逐条消解，消解前不得当基线）**：
   - pass0 森林 Σ = `1,290,508,960 B`（1,230.73 MiB）= 门线 **1.60×**；
   - pass0 活块 `live` 1,470,764 → 3,089,597（Δ=1,618,833、+171.9 MB），pass0 末已占门线 **96.9%**；
   - 并林窗峰值 phys `2,107,262,968 B` = 门线 **2.62×**；
   - 编译实耗/理论下限 = **13.641×**（`compile_real_elapsed_ms=194117.692` / `compile_theory_parallel_limit_ms=14229.630`；
     后者含义见第 1 条口径待修）；
   - append 同族站点的 `tokenCount × L × (1+探测数)` 冗余流量（已修两处，第三处 `parser.cheng` region 循环未修 = §5.7.6）；
   - 「整块并林」形态（合并森林 arena 1,230.7 MiB > 805MB，数学上不可达）；
   - 5.65 GB 开门缺陷（现树已修：Δ `4,852,010,584 → 28,246,064`，塌 171.8×）。
4. **达标判据据此收紧**：①**默认 768MiB 门内全量 234 源跑完并林**（唯一内存达标线，= §6.2）；
   ②森林窗降到量级不同（<120s）且整轮时间给出向理论下限收敛的目标与判据（**"森林窗"必须先绑定单一埋点对口径**
   ——`forest_build_start → after_profile_lookup` / `→ 末条 forest_appended` / `after_profile_source_payload_release → after_profile_lookup`
   三者数值差数倍，判据在定义前不可判定）；③凡报告写"通过/可用"，若其运行状态曾越过理论边界，**判词无效**
   ——先消解病态，再谈达标。
   **2026-09-13 口径已钉（A2 交付件）**：唯一口径 = **`after_profile_source_payload_release → after_profile_lookup`**，读数直取
   `csg_stage=after_profile_lookup since_ms=`（`design/forest_window_caliber.md`，259 行）。绑定三件缺一不可判定：闭包（入口+源数）/ 守卫（`rss_guard_env`+`guard_hits`，只有 `805306368` 算门内）/ 驱动 sha256+树修订。
   **同轮内三口径是嵌套区间而非三种量级**（`arena_scale_probe.err`：C=465,494 ms `:259`，A≡C，B ∈ [450,149, 465,494] 吃到 C 的 95.5%）——
   `deterministic_model_derivation.md:367` 的"三者数值差数倍"**在树内找不到同轮支撑**，散布全部来自跨轮混用（10/29/234 源闭包 × 缓存前后世代 × 机器窗口；同闭包同世代 `b101` 277,406 vs `b102` 361,267）。
   B（`→ 末条 forest_appended`）被否决：端点无时钟（三代 emitter 只发 `rss/live`，`progression.tsv` 首列 42/42 全空）+ 流式世代内部计时归零 + §6.3 B1 要求落地后 `forest_appended` 零发射 ⇒ 判据自毁。
   **连带修正**：§6.3 B2b 的基线 553,914 ms 本来就是该口径的值（不换基线），但其"29 源读 since_ms"与"pass0 234/234"写在同一行 ⇒ 须拆档：29 源默认门档可判定（<120 s），**234 源档在内存侧解锁前门内无该口径读数，只能 diagnostic**。

## 八、风险与对策

1. **`primary_object_plan`(76k)/`lowering_plan`(31k) 内埋 arch 分叉**：归属不是干净二分的最大嫌疑。
   对策：Step 0 先暴露；分叉处走结构化拆分，严禁启发式补丁与事后补救。
   **2026-08-29 进展**：kernel→arch 直接违规已清零（B8/B9 两道门面收编），残留的是
   `indirect_edges=130` / `divergence_hits=242` 的间接可达与关键词分叉面，按蓝图 2.x 逐族施工，
   不因直违归零而宣告闭合完成。
2. **aarch64 无独立 `body_emit` 文件**：发射逻辑疑似散在中立层。对策：同上，Step 0 裁定后再动手。
3. **固定点烤制撞并发 lane**：共享文件 clobber 有前科。对策：源码冻结窗口 + mtime 静止检查 + 只 stage 自己 hunk；
   **绝不整文件 checkout 共享文件**（`git checkout -- <file>` / `git restore` 在共享主树多会话场景 = 不可逆破坏操作）。
4. **wasm32 面不全**：只有 module emit，无完整 ABI/链接面。对策：明确列后续，不计入首版验收。
5. **假绿风险**：单 smoke、临时仓结果不算完成；一切结论绑哈希、过守卫（工程规范 6/7 全文适用）。
   配套纪律：探针必须还原（`grep -c POOLPROBE` = 0）、串行臂 hunk 数 0（**禁失败回落串行**）、
   `git diff --numstat` 只含预期行数；**禁止删测试/skip 让门变绿**；**不得放宽桥的等值判定、不得合成 CID**。
6. **frozen stage3 与树上源码的能力缺口（2026-08-29 实测）**：`primary_object_plan.cheng:66`（09-10 行号漂移为 `:68-69`）
   用「导入模块的 const 初始化本模块 const」（`PrimaryObjectSymbolRoleTypedName: int32 = lower.LoweringFunctionSymbolRoleTypedName`，
   commit `e9932103c` 引入），frozen stage3 报 `unsupported imported const` 无法单独编译该文件；
   现役 `artifacts/backend_driver/cheng` 另卡在 `codegen_a64_fill_units.cheng:472` `trailing tokens in let initializer`。
   对策：Step3 烤固定点前必须先补「导入 const 初值」能力面并修该 parse 破损，否则两代固定点无从烤起；
   **不得以「换入口文件绕开」充当修补**。
7. **B6c Fill 主族物理迁出不可行（2026-08-25 裁定）**：迁移闭包含 165 共享中立符号，强迁会把中立逻辑拖入 arch 单元。
   终态 = 留内核经 `codegen_a64_body_units` 门面消费（32 函数 / 847 处 a64 引用不做代码移动），门禁以该形态验收；
   详见 kernel-split-blueprint-20260824 `BLUEPRINT.md` §7 修订记录。
8. **stage3 编译偶发死亡**（批6审计记录，~1/3 概率 `[cheng_cold] Mach-O primary line-map missing`）：
   接入 `ci_gate` 硬门将产生**间歇假红** ⇒ 列为施工清单输入，不得当作确定失败，也不得据此放松门禁。
9. **未知量不得当 0 用**：234 源 TypeArena 真实 `used/tokens` 至今未测得（`type_arena_lines=0`）；
   `U0` 削半的收益倍数待判决性实测；B5 埋点实测数未取到。凡未测项一律写"未测"，不得填入估算冒充读数。
10. **口径笔误风险**：把门读数写成「进程树 RSS」（实为本进程 `phys_footprint`）、把抬门轮读数当"进度基线"、
    把"森林窗"当无歧义量 —— 三类笔误均已发生过，引用前必须回源（见 §4.8、§七-2、§七-4②）。
11. **行号漂移风险**：本仓行号漂移严重，实测有整体 +28 行、**最隐蔽差 4 行即跨函数**；锚点必须在指定 HEAD 下用
    `git show HEAD:<file> | grep -n <点名符号>` 复核，跨节引用前按
    `design/anchor_drift_audit.md` 重定位。**「行号对得上」≠「锚点可信」**——该审计已定义一类
    `DRIFT-stale-birth`（行号自写作提交起未动，但行号处内容与文档描述不符，写作时即错，靠 diff 看不出来），
    机检不可靠，只能读行 + 点名符号 grep 发现。本合并文档保留原件的行号坐标，**引用前一律重 grep**。

## 九、非目标

- 进程内动态装载/卸载后端（除非 D1 另议）；dlopen 运行时热插拔。
- 非 Linux/macOS 平台分发形态（ELF/MACH-O/COFF writer 已存在，按需并入即可）。
- 语言层语法变更；本计划纯属编译器结构与组合重构。
- P2 波次编译（**已判死**：波界不存在 terminal 死产物；保序论证须逐结构重做）；
  P4 mmap 驻留 / P5 验证增量化在证据政策裁决前不动工（现行替代路线 = P1 汇点增量化）。
- 把缓存命中重跑的读数当作完成信用；把抬门轮当工作点（§七-2）。

## 十、历史里程碑（压缩：只列日期 + 一句话结论 + 原始件路径）

| 日期 | 一句话结论 | 原始件 |
|---|---|---|
| 2026-08-24 | Step 0 归属冻结：backend 85/85 覆盖、unresolved=0、direct_violations=17、indirect_edges=91；arch 分叉集中在 `primary_object_plan` 与派发枢纽 | `tools/kernel_plugin_attribution.tsv`、`tools/kernel_plugin_closure_check.py`、本文 §3.2 |
| 2026-08-24 | `dispatch_min` 二进制误入库：路径 API 面为空集，裁定选项 A 否决 / 选项 B（排除产物、收敛单一入口）并已实施；魔数门首跑又捕获第二个漏网二进制 | 本文 §3.2.1 / §3.2.2 |
| 2026-08-24 | Step 1 验证状态：ci_gate 7 PASS / 32 FAIL，关键门 `build-backend-driver` FAIL 的根因是**共享树多 lane WIP 叠加**（30+ 文件被改，含 libp2p TypeNode 预存缺陷），**非契约接线引入** ⇒ 需等树稳或清洁分支隔离验证 | `git show HEAD:docs/cheng-minimal-kernel-plan.md`（合并前原件） |
| 2026-08-25 17:4x | Step1/2 复验：归属表补齐 S4-B 新单元 `csg_plugin_pickup.cheng → kernel` ⇒ backend 93/93、uncovered=0、direct_violations=0、indirect_edges=86、divergence_hits=237，Step0 模式与 `--require-closure` 正式门均 rc=0；kernel-only 请求未装 triple 报 `codegen_plugin_missing=x86_64-unknown-linux-gnu` exit 9；`kernel_plugin_manifest_gate.py` 接 ci_gate（x86_64=5/aarch64=3/riscv64=5 精确双向覆盖，负例自检缺收录 rc=1、桶错配 rc=1）；`kernel_manifest_smoke.sh` 改为按插件正典 triple 编冒烟（x86_64/riscv64 交叉只断言非空镜像并显式 `SKIP_NON_NATIVE`）；closure 工具补 S4 §5 契约版本权威门（`CodegenContractVersion` 只允许在 `codegen_contract.cheng` 定义，实测 definitions=1 / violations=0）；ExactDef 批1-6 六个夹具硬门（2+8+24+15+15+5 腿，均含负例判词与 stderr md5 双跑零漂移）接进 ci_gate；kernel-only 驱动实际组装仍红于既有 current-source 精确活性/CFG merge 墙 | `git show HEAD:docs/cheng-minimal-kernel-plan.md`（合并前原件）；`kernel-parity-coord receipts/batch5|batch6/independent-audit.md` |
| 2026-08-25 | 自举"固定点"订正：实测为**自映像拷贝仪式**（非纯 Cheng 编译产物），不得再当纯自举证据；纯编译载具尚不存在，两代固定点距离=∞ | `/Users/lbcheng/cheng-patches/kernel-step3-distance-20260825/DISTANCE.md`（sha `643ed62d`）、本文 §3.1 |
| 2026-08-25 | B6c Fill 主族物理迁出不可行（迁移闭包含 165 共享中立符号）⇒ 终态 = 留内核经门面消费 | kernel-split-blueprint-20260824 `BLUEPRINT.md` §7；本文 §八-7 |
| 2026-08-26 05:0x | Step2 组合驱动 target 语义修正：拆分 `BUILDER_TARGET` 与 `PLUGIN_TARGET`，x86 独立墙消除，三组合统一推进到同族 primary emit 墙 | 本文 §十一 2026-08-26 条 |
| 2026-08-26 05:5x | Step2 覆盖门加固：排除 `codegen_*_units` shared-format 中立门面，避免 kernel 清单的中立门面把空插件清单误判成已覆盖 | 本文 §十一 2026-08-26 条 |
| 2026-08-26 06:1x | Door12/read-edge 首修：`WriteErrorReportBridge` 三处 exact-read 发布错拼修正，read-edge 首红清除 | 本文 §十一 2026-08-26 条 |
| 2026-08-26 11:3x | Step2 验收跑：kernel-only + 三组合驱动组装全 rc=0；`kernel_manifest_smoke` PASS=0/FAIL=3（唯一堵墙 = lowering defer slice out of range） | 本文 §十一 2026-08-26 条 |
| 2026-08-26 17:2x → 08-27 18:30 | 入口桥破墙战役 v1-v17：入口桥身份生产 → BodyIR ownership 冻结 → backend2 codec → ORC `registry_miss`（根因 `50d1ffeeb` 位拷别名）→ synthetic symbol 身份 → provider export root → native link 未解 → pthread TLS → 第十墙（stage3 种子 b.lo/b.lt 误编自指死结）→ CSG import edge 门 → Form-B 多行例程头 parser 根治 → 闭包门族长征 | `cheng-patches/entry-bridge-wall-20260826/REPORT.md`、`cheng-patches/kernel-parity-coord-20260826/TASKS.md` §七、`cheng-patches/wall-atlas-20260826/` |
| 2026-08-27 | 批5审计遗留三刀（契约 reject 负例 4/14→12/14，余两条判为不可达死防御分支不设黑盒腿；§1.9 初始化源缺位复核维持原判；批6独立静态审计 PASS_WITH_RISKS——五腿可复现但 stage3 偶发死亡、N4 腿名实不符） | `kernel-parity-coord receipts/batch6/independent-audit.md`；本文 §八-8 |
| 2026-08-29 09:2x | Step2 测量口径更正：此前三组合驱动数据全部在 `env -i PATH=/usr/bin:/bin` 下量得，对 ELF 交叉目标无效（`cold_find_elf_linker_cmd`（`cheng_cold.c:107495`）调的 `cold_command_in_path`（`:107470`）**只搜 `getenv("PATH")`**；本机 `x86_64-linux-musl-gcc` 在 `/opt/homebrew/bin`，被剥掉后回退 `NULL` → `ELF linker unavailable`）⇒ **撤回两处判读**（①「参考驱动三目标全 rc=0」的 riscv64 部分不可复现；②「Step2 的墙不是能力缺口、是组合路径缺陷」的重定位尚未定谳）；修正后 `arm64-apple-darwin` rc=0 / `x86_64-unknown-linux-gnu` rc=0 / `riscv64-unknown-linux-gnu` rc=2 = **环境阻塞**（cold 只找 `riscv64-linux-gnu-gcc` / `riscv64-unknown-linux-gnu-gcc`，本机全无；只有 bare-metal `riscv64-elf-*`，强指 `CHENG_ELF_LINKER=riscv64-elf-gcc` 实测 `ld: cannot find crt0.o / -lc / -lgloss`）；**新阻塞：当前无法构建任何组合驱动** | `cheng-patches/kernel-step1-step4-closeout-20260829/CORRECTION-20260829.md` |
| 2026-08-29 | Step3 静态冻结门清零：`bootstrap/cold_parser.c` 剥离 197 行；**克隆双构建 A/B** 证 obj 字节恒等、rc 恒等、stderr 差异逐条钉死（编译器自戳 + 被删探针自身输出）⇒ 认定零语义变化 | 同目录 `STEP3-PROBE-STRIP.md` |
| 2026-08-29 | Step2 三组合驱动重测（修正口径后）：三份组装全 rc=0（此前"组装墙"已不存在）；aarch64 出现一次全绿但第二跑红于 provider link 且 primary object 字节差 26 ⇒ **偶发、未定量**，不得据此宣告转绿；riscv64 墙定位到 `CompilerToolchainEncoderRuntimeAuthorityImportCurrent` 取 `cmdline.ParamStr(0)` | 本文 §5.5/§十一、`compiler_toolchain_encoder_authority_import.cheng:290/:449/:547` |
| 2026-08-29 | Step 状态总账：Step0 绿、Step1 ✅闭卷、Step2 脚本级闭卷/语义级 2/4、Step3 半绿、Step4 绿、Step5 未动；冻结门 4/4 假阳性钉死（门正则收紧要求左括号前紧邻 `(` 或 `"` 后） | 同目录 `REPORT.md`、`CENSUS3-CROSSCHECK.md`、`ATTEMPT-ALLFIX-20260829.md`；本文 §十一 |
| 2026-08-29 | Step1/Step4 收口：B8（`regalloc_production_emitter` 三处直违）收编为 shared-format 门面 `codegen_regalloc_adapter_units.cheng`；B9（`darwin_syscall_provider` 归属缺口）收编为 `codegen_darwin_provider_units.cheng`（标 `@borrows` 与 provider 原签名同形）；Step4 两臂收口（案 A）落树；**两处头注名实不符订正（grep 证）**——`csg_plugin_pickup.cheng` 原称「direct_object_emit 三处未命中臂已由 S4-D 收口」不实（该文件零 pickup 引用，只直调 `CodegenPluginMissingError`），`codegen_contract.cheng` 沿用同一表述，两处已改述为「报文形一致、未走本包装 / pop 两臂已接线 2026-08-29」 | `cheng-patches/step4-final-20260829/CLOSEOUT-MANUAL.md` §3；本文 §十一 |
| 2026-09-01 | 内存/时间双极限计划立项：merkle store = 编译期唯一驻留本体；P1-P5 依赖图定稿 | 本文 §4.7 |
| 2026-09-02 | Step1 闭卷回执（契约=唯一耦合面，`kernel-plugin-closure` 常驻 ci_gate，rc=0）；Step2 验收回执（脚本级闭卷，语义级 2/4）；Step4 trade/cache/cid 三门 rc=0 | 本文 §5.2.1 / §5.3.1 |
| 2026-09-03 | 历史更正：四个里程碑（含终态判据）均未完成；现有缓存只能算零变更 whole-closure 缓存，不能冒充条目缓存/并行物化/mmap 按需 snapshot | 本文 §1.1 / §1.2 |
| 2026-09-08 | 口径迁移（用户令）：1GiB 最后防线废弃，全线统一 768 MiB，唯一权威常量 `tools/memory_model_limits.sh` | 本文 §1.3 |
| 2026-09-09 | GEN2R2 / GEN2R3：候选固定点达成（GEN2 rc=0 + GEN3 原始字节固定 `56bc64e0…` / `e98be9ea…`，186-188s、900s 帽内）；**源码未冻结提交 ⇒ 不是发布级固定点** | `verify_append/VERIFY_gen2r2_append.md`、`VERIFY_gen2r3_append.md` |
| 2026-09-10 | b3r churn 五轮（GEN3 固定点 `6b8ca86c…`，fp 805.90/806.04/805.91 MB）；b3struct 刀/控配对（控 842.1MB / 刀态最佳 811,058,352 B，距门 5.8MB）；goal2 集成态（enforced 817,233,920 B 超门 ~12MB）；**true-peak 诊断**（内建门抬到 1GiB，phys 顶到 1,074,496,832 B，`metadata_contexts_built` 从未到达）；TA-MEM t6（resident 624,951,296 / footprint 806,700,208） | `VERIFY_b3r_churn_append.md`、`VERIFY_b3struct_append.md`、`VERIFY_goal_integrate2_append.md`、`VERIFY_true_mem_1g_append.md`、`selfhost-resource-plan.md` §二点六 |
| 2026-09-10 | 收官轮独立三跑：外门 768MiB→137@187s、外门 1GiB→125@187s（内门先开枪）、双抬 1.5GiB→137@302-314s（phys 1,612,302,040，树上进程数峰=1）⇒ 当时判「真实需求 >1.5GiB，768MiB 需消约 800MB」；死相 = forest 解析相 `src=61/230`（口径后更正为 234 源：闭包复算 `234 源 / 30,544,352 B` 与 bake report `compile_input_source_file_count=234` / `byte_count=30,547,003` 对拍通过） | `VERIFY_fullgo_0910_append.md` §一/§六；本文 §3.4 |
| 2026-09-10 | **里程碑现势：五项终态判据全未达成。** 全冷 C 头 205-225s（ordinary_zero_exit 全冷 257s）/ 自宿主 ≥2500-3300s；零变更 6.04s（whole-closure 命中，**非条目缓存**）/ 7s（C 头命中）；1/3 编辑**未测**；ordinary 峰 651-748MiB 量级；GEN2 186-204s rc=0 但树峰 806-817MB **超 768 门**、真峰 >1GiB phys | `phase_c_recon.md:19`；本文 §3.3、§十 09-09/09-10 各行 |
| 2026-09-10 | seal 回归事件：`e7e38d76a` 引入 seal 回归（HEAD 连最简夹具都编不过，判词 `typed expr: frozen metadata seal code=context_sequence_shared ref_count=2`），已定位并以 `patches/head_seal_regression_fix_v4.patch` 修复；修后真实 768MiB 正式门 **3/4 PASS**（ordinary 624MiB / call_fixture 628MiB / cold_nested 706MiB），**v6 超线 16.4MB**；同期 kernel-only 组合装配（`compiler_composition_kernel_main.cheng` + `bootstrap/kernel_manifest.cheng`，禁缓存、jobs=1）**rc=125@177s**（`rss_bytes=838,976,712 > 805,306,368`）⇒ 三份组合驱动的可复现构建同被内存墙阻塞，与 exec_diff 同一前置 | `VERIFY_fullgo_0910_append.md` §九-§十一/§十八；`patches/head_seal_regression_fix_v4.patch` |
| 2026-09-10 晚 | TA-MEM3 新鲜梯子（分相：enter 71.3 → after_profiles 291.1 → reachable 341.1 → metadata_contexts_built 490.6 → payload_release 538.1 → forest 基线 538-577MB → 死点 `src=61` 557.6-577.8MB）；768MiB 正式门 3/4 PASS（v6 超线 16.4MB）；kernel-only 组合装配 rc=125@177s | `VERIFY_tamem3_append.md`；本文 §3.4、§5.7.11 |
| 2026-09-10 晚 | 四夹具 baseline 4/4 入库；S1b 行级施工图三条纠偏（Seal 7 处树读、B5 埋点原址是死码、reuse 须定形态）；**S1b-0 实测负结果**（byte 等价成立但 v6 由 PASS 变 rc=125，超线 51MB）⇒ 已精确回退 | `design/pa_s1b_edit_plan.md`、`.rebuild/run_s1b0/`；本文 §5.9-2 |
| 2026-09-11 凌晨 | 定谳：**门内卡 pass0 内存、抬门后卡 correctness**；全量能否跑完的前置既不是内存也不是时间，而是 correctness 修复；「删并林即可过门」作废 | `VERIFY_fullgo_0910_append.md` §二十一/§二十二 |
| 2026-09-11 上午 | 世代更新：门内墙从 pass0 移到**并林 pass1**（`forest_parsed=234`、`forest_appended=24`、rc=125@396s）；下午精确列总量 `column_bytes=70,931,312 B` ⇒ 流式峰值模型 `819,036,575 B` 仍超默认门 13.1 MiB（**该口径后被上修，见 09-11 夜**） | `VERIFY_fullgo_0910_append.md` §二十四；`.rebuild/s1b_step3/gate/default768_verified.summary.txt` |
| 2026-09-11 夜 | 门读数身份回源 + 探针双证（内门 = 本进程当下 `phys_footprint`）；r7 同窗口完整包络 `F+I+C = 735,595,988`；5.65 GB 开门缺陷逐字节定位（`compiler_csg.cheng:35656`）→ 根因 = `TypedExprBuildIndexRegisterVisibilityDeclaration` 的 O(N²) 克隆（**自 initial commit 既有，非回归**）→ 修法落树；同窗口 A/B 定案；缺口口径由 13.1 MiB 上修为 **24.1~36.7 MB** | `design/deterministic_model_derivation.md` §⑧/§8.5-§8.9；`patches/s1b_step3k_visibility_inplace_append.patch` |
| 2026-09-11 20:19 | const 块 metadata 绑定修复落树并经 `kd_r9c` 验证：六件夹具该判词出现次数 = 0，四件正例推进到下一道墙，负例判词逐字不变 | `patches/s1b_step3l_global_const_block_bindings.patch`；本文 §5.7.0 |
| 2026-09-11 | **现势状态表（当时口径，逐项现势见 §二/§五）**：**Step 0 绿（维持）** attributed=109/109 uncovered=0、direct_violations=0、`contract_version_definitions=1` / `authority_violations=0`；桶 kernel=62 / shared-format=23 / backend2=8 / x86_64=5 / aarch64=4 / riscv32=1 / riscv64=5 / wasm32=1。**Step 1 ✅闭卷（维持）**。**Step 2** 门内基线 4/4（`BACKEND_JOBS=1` 串行口径）、池化残留 `stage=68`、exec_diff 全集/合同冒烟/全量 `ci_gate` 未复验。**Step 3** 发布级未达（详见 §5.4）。**Step 4** 门绿，最后一跳未验。**Step 5** 未动。**K2/R2 严格闭包 RED** violations=42（数值与施工面见 §5.7.12）。**K6 ZRPC/闭包 门绿（goal2 集成态）**：`zrpc` 默认 / `--require-zero-kernel-core` / `--no-cold` / `--require-zero-closure` 全 rc=0，total=368、zero_tier=0、cold=0、provider=366/plugin=2；`zrpc_kernel_gate_contract_test.sh` PASS。**幽灵（parser merge/绑定层）**：补丁在树、**运行期终验未做**——判词 48 证伪「C 车头发射墙」= `add(托管seq, 借用源)` 门禁三级吞哑；判词 50/52 E1（MoveInto 源侧 detach）+ V1（空 str 记录 validator 合同收敛）合入主树；判词 53 墙 #2 根修（tracked provider）；判词 54 墙 #3 darwin seal 等价物「写-冻-匿-证」。**held-exec 生产入口**：Linux 声明点已拆、DarwinAuthority 判词 56 落地，余 M3 安装面（详见 §5.7.13） | 本文 §5.3.1/§5.4/§5.5/§5.7.12/§5.7.13；`design/pc_closure_s1_progress.md` |
| 2026-09-12 01:51-02:2x | r9z：`object trait premise out of range` 墙倒；四正例统一推进到 `missingFactBitmap=5`（新墙定位到 bit 级）；全森林门禁 `forest_appended` **0→2**、`guard_hits=0`；M-A 判别实验独立验证 bitmap 根因并暴露下一堵墙（`ownership_body_ir_production.cheng:1377`）；r11 烤挂 → v2（隐式泛型补丁缺两处 `@borrows`），**r11b 未回** | `design/deterministic_model_derivation.md` §8.10-§8.13；`.rebuild/s1b_step3/{r9/bake_r9z.log,r9/fixtures_r9z.txt,gate/r9z.summary.txt,r9/disc_ma_prerix_r9z.stderr.txt,r9/bake_r11.log}` |
| 2026-09-15 | **当前源载具升格（V1 线，lessons 09-13/14 条 3 落地）**：`cheng_cold_v1cur`（sha256 `79e0ce59…46b874`，源 `adf7b105…517f3`，HEAD=`58c2da695…`）取代冻结 stage3 成为新工作标准载具；冻结 stage3 本体不覆盖不删除。升格门全过：金丝雀 4/4；四夹具正式门 **4/4 PASS exit 0**（0/1/0/0，峰值 112MB≪768MiB；v6 master 在战役 fixtures 存续，4/4 非 3/4）；双层 run 输出与 t9 历史逐字节同，kd 层 primary.o 与 SM1 跨根记录逐一相同（v6 新钉 `39213361…`）；D3 concat noq 18.45/18.64MB 贴 T9A/B 线+stdout=2000000；T6 i2s 1M/2M N 无关判别保持+七边值 rc=0；T7 sq/pj 贴线+hex 冒烟绿（readtext/rf 探针源失传如实记录）；kd_v1c（`5107047c…`，对照 kd_b2002 `e3be0f6b…` 换代）全闭包烤 rc=0、17 判词族 bake 层 0↔0、kd 层金丝雀+四夹具 4/4。B22+ 烤制基座/载具引用切换到本载具 | `artifacts/vehicles/current/README.md`；`.rebuild/v1_line/REPORT.md` |

**回执全账**：`cheng-patches/kernel-step1-step4-closeout-20260829/REPORT.md`（含 `CENSUS3-CROSSCHECK.md`、
`STEP3-PROBE-STRIP.md`、`ATTEMPT-ALLFIX-20260829.md`、`CORRECTION-20260829.md`——最后一份**必读**，它推翻了
Step2 重测表中的部分判读）。

## 十一、决策记录（两份按日期合并）

> 本章是**决策索引**：每条给出日期 + 决策 + 理由；正文已在 §四/§五/§六 展开的，只留一句并指向该处，不重复内容（避免第二个漂移源）。

- **2026-08-24 · D1 装载模型 = 编译期组合 per-triple 驱动；进程内动态装载出局。** 理由见 §4.4。
- **2026-08-24 · D2 信任模型 = CSG 链签发；本地构建产物必须产出同构 receipt。** 理由见 §4.5。
- **2026-08-24 · D3 纯度口径「纯 Cheng 内核自举」为一等里程碑**；Step 3（纯自举固定点）纳入首期，
  源码冻结窗口单独约定。理由见 §4.6。
- **2026-08-24 · `dispatch_min` 异常处置取选项 B（排除产物、收敛单一入口），否决选项 A（重写源码）。**
  理由：该路径 API 面为空集，重写 = 制造第二份同名实现分叉。详见 §3.2.1/§3.2.2。
- **2026-08-24 · riscv32 桶归属裁定**：`elf_riscv32_writer.cheng` 由 `unresolved` 单列成桶，
  kernel→此处的 2 条 import 从 warning 转计入待拆违规清单。详见 §3.2.2。
- **2026-08-25 · B6c Fill 主族不做物理迁出**：迁移闭包含 165 共享中立符号，强迁会把中立逻辑拖入 arch 单元；
  终态 = 留内核经门面消费（32 函数 / 847 处 a64 引用不做代码移动）。详见 §八-7。
- **2026-08-26 · Step2 target 语义拆分**：`build_plugin_driver.sh` 原先把插件正典 triple 同时当作组合驱动本体的发射 target；
  改为 `BUILDER_TARGET`（host 运行 target）与 `PLUGIN_TARGET`（后端支持面）分离，x86_64 首版正典改 `x86_64-unknown-linux-gnu`。
- **2026-08-26 · Step2 覆盖门加固**：已装 arch 判定排除 `codegen_*_units` shared-format 中立门面，
  避免 kernel 清单里的中立门面把空插件清单误判成已覆盖。
- **2026-08-27 · 契约 reject 负例补齐到 12/14**：余两条（`no return root` / `formal root set is empty`）
  经控制流推演判为 fail-first 分类器内**不可达死防御分支**，gate 头注留真空依据、**不设黑盒腿**（不为凑数造假腿）。
- **2026-08-29 · B8/B9 用 shared-format 门面收编直违**：门面按 unitId 四臂直调、**零间接调用**、
  未命中返 `valid=false / errorDetail=-1` reject 形、**不设兜底臂**；等价性用 A/B 实测（frontier 判词逐字相同）
  而非「编过就算数」；驱动字节 −112B 布局漂移如实记录。
- **2026-08-29 · Step4 两臂收口取案 A**：两处未命中 panic 臂在 panic 前插入取件尝试，Ok 仍 fail-closed 抛
  `CodegenPluginMissingError`（D1「编译期组合、进程内不装载插件」铁律）；**案 B（取件后续发）需下游插件分派面就绪，
  当前未就绪，禁第三案**。详见 §5.5。
- **2026-08-29 · 新棘轮门 `cheng_export_symbol_dup_gate.py` 取「棘轮而非清零」**：历史债一次清零会把门挂红、失去信号；
  28 条真重复进 baseline，只允许减少、新增即 rc=1。详见 §6.6。
- **2026-08-29 · 测量口径纪律**：`env -i` 下量的交叉目标数据无效（`cold_find_elf_linker_cmd` 只搜 `getenv("PATH")`）；
  **撤回**「参考驱动三目标全 rc=0」的 riscv64 部分与「Step2 的墙是组合路径缺陷」的重定位；保留 A/B 证明的门面重构零回归。
- **2026-08-29 · 验收方法纪律：克隆双构建 A/B**——同一源码用两个克隆构建的编译器跑同一命令，逐文件对拍
  rc + 产物 sha256 + stderr，差异逐条钉死；**不拿「编过就算数」充数**。
- **2026-08-29 · Step3 静态冻结门正则收紧**：裸式 `\[(ra|rlp|…)\]` 会把 `cheng_cold.c` 的 `ws_root[rl]`
  **数组下标**误判为探针 ⇒ 收紧为要求左括号前紧邻 `(` 或 `"` 后（cold_parser 151→151 全真、cheng_cold 4→0 全假）。
- **2026-09-03 · 资源终态判据定稿 + 历史更正**：四里程碑均未完成；cold object cache 仍是冷链桥接缓存，
  **不能冒充** frozen BodyIR 条目缓存、并行物化或 mmap/按需 snapshot。详见 §1.2。
- **2026-09-08 · 口径迁移（用户令）**：1GiB 最后防线废弃，全线统一 768MiB，唯一权威常量
  `tools/memory_model_limits.sh`；`tools/user_path_gate.sh` `RSS_CAP_MIB=768`。详见 §1.3。
- **2026-09-10 · 倍增瞬态刀回退**：pass0 presize 刀 A/B 三轮落在 ±0.5MB 噪声带 ⇒「倍增共存在 enforced 口径主导峰」
  被证伪，**该刀按纪律回退、不交付 no-op patch**。详见 §3.4-4。
- **2026-09-11 · 用户裁定红线**：超过理论内存与理论编译时间一律按病态处理（四条派生口径见 §七）。
- **2026-09-11 · 台账制度**：每轮 summary 必含「树峰 vs 锚差值」，差值 >20% 开持有者核账。
- **2026-09-11 · 门读数身份裁定**：Darwin 内门 = 本进程当下 `phys_footprint`，**不是进程树 RSS、不是 session 并集、
  也不是 `ru_maxrss` 高水位**；凡写"进程树 RSS"一律按笔误改口径。详见 §4.8。
- **2026-09-11 · 抬门只许用于发现缺陷**：全部轮次标 `diagnostic`，其运行状态本身即病态证据，不得计入任何达标结论。详见 §七-2。
- **2026-09-11 · 因果归属纪律**：「既有的、首次可达的路径」≠「本次改动引入的回归」；
  未跑到的源是否有别的错**未定，不外推**；两套不同绑定（源态/车头/守卫口径）的数字**不得互代**。
- **2026-09-11 · 5.65 GB 缺陷归因与修法**：根因 = `TypedExprBuildIndexRegisterVisibilityDeclaration` 的 O(N²) 全量深拷贝，
  `git log -S` 追到 initial commit ⇒ **自始既有、非回归**；修法 = 就地 `add`（不动语义、不加兜底），
  实测 Δ `4,852,010,584 → 28,246,064`（171.8×）。
- **2026-09-11 · 缺口口径更正**：完整包络 `peak(k) = F + I + C(k) + T(k)`；旧"缺口 13.1 MiB"被实测否证，
  真实缺口 **24.1~36.7 MB**；杠杆次序改为「逐源 parse 瞬时 + 前端驻留」，**不是** 22 个 TypeId 侧列。
- **2026-09-11 · 删并林的交付边界**：删并林买到「能跑完」+ 消 1.23GiB 活块 / 2,009.6 MiB phys 峰，**不买到门线**；
  「删并林即可过门」作废；S1b 不得降级为「只剩内存轴」，也不得当作全量跑完的充分条件。
- **2026-09-11 · S1b-0 负结果的设计修正**：`intern` id 是**位序分配** ⇒ 新列不得提前 intern、
  不得进 `typedExprTypeArenaHashMaterialized` 枚举表（否则 B4 必破）；owner-token 文本不得全量提前 intern，
  改为「只对 Seal 实读行 intern」或存旁路文本列/span；全部 hunk 已精确回退、补丁可重放。详见 §5.9-2(iv)(v)。
- **2026-09-11 · 禁止事项（红线）**：不得放宽桥的"恰好等于 1"判定；不得从文本/名字/行号合成 CID；
  不得删测试/skip 让门变绿；探针必须还原；不得失败回落串行。
- **2026-09-11 · 派单表五条现状核对（不重派，逐条改文本/排序）**：① S1b step3 续（派单文本已过期，
  真实目标先是 `T[具名常量]` 长度能力移植，后由实测改写为隐式泛型）；② TA-MEM3 续（仍要做但**排在 ① 之后**，
  文本按可测形态改写）；③ R2-C3 续（**现在派也做不动**：阻塞于 G1/G3/G5 裁决 + S0.5 bake）；
  ④ IFEXPR-FIX（**经核查已解决，无需派单**：`valueIsConditional` 已在现树 `parser.cheng:25744/25756/25763/25774`，
  且 `VERIFY_gen2r2_append.md §三十三` 记「if-expr 前置墙确认已消」；`VERIFY_tamem_append.md` 另记的
  "bootstrap 冻结转译态无法解析 if 表达式"属**冻结面**而非 `parser.cheng`）；⑤ R5-PUBLISHER（等 GEN3，**现在派是空转**）。
  表格外补两条：`closure8` 与 `pair2`（见 §5.7.4），修完 ① 会立刻撞上，应排在其后。
- **2026-09-11 · 归因纪律（自我更正两次，作废两次撤回）**：「`bake_*` 烘焙成功」**不能**证明 Cheng 链没有能力缺口
  ——`bake_*` 走 **C 链前端**（`bootstrap/cheng_cold.c:30171-30183`），故 234 源闭包在 C 链下编得过与 Cheng 侧
  缺「具名常量作 `T[N]` 长度」并不矛盾。据此做出的两次"撤回"**均已作废**；`T[具名常量]` 能力缺口是**真的**
  （修法见 §5.7.0）。凡"两条路径同败 ⇒ 同一根因"的纯静态推论，必须先做同窗口 A/B 或对照行实验再定性。
- **2026-09-12 · 桥/门禁不得为过墙而放松**：`missingFactBitmap=5` 是**真缺口**，只能让 canonical DeclId/SymbolCid
  投影真正配平；`missingSymbolInterfaceCount` 的后置清除路径未生效是缺陷，不是门禁口径问题。详见 §5.7.2。

## 十二、与其它文档的关系

| 文档 | 关系 |
|---|---|
| 本文（`docs/cheng-plan.md`） | **结构与资源两个维度的合并总档**：§四 架构与关键决策、§五 落地顺序、§六 验收铁门、§七 病态判据、§十一 决策记录 |
| `docs/pure-cheng-kernel-master-plan.md` | 上层汇聚：结构维度（本文）+ 资源维度（本文）；本文是其详档 |
| `docs/selfhost-resource-plan.md` | 纯 Cheng **自宿主管线**资源方案唯一汇聚点（吸收 P2/P3/P4）；§二点五 管理线锚表；冲突时以该文为准 |
| `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md` | 数据/所有权/指针/C 冷链的**唯一权威**（Z0-Z8、K6、`tools/zrpc_kernel_gate.py`）；冲突时以该文为准 |
| `openspec/proposals/pure-cheng-minimal-kernel.md` | apply authority（K0-K6） |
| `openspec/proposals/deterministic-memory-lifecycle.md` | 内存生命周期 apply authority；`:19-20` 明文禁止把 cold object cache 称为 entry cache |
| `openspec/proposals/pure-cheng-rsi.md` | **独立文档，未并入本文**（属 OpenSpec propose→apply→archive 流程，必须留在 `openspec/` 下）；其 §八 病态判据口径与本文 §七 同源 |
| `task_plan.md` 战役 R | apply authority；R3 分片与本文 §五 为一事两表 |
| `docs/campaigns/2026-08-31-kernel-userpath/design/deterministic_model_derivation.md` | **本战役证据总账（持续追加）**：门值推导链、编译理论下限、逐相分解、包络公式、最新判词；本文只放指针 |
| `docs/cheng-kernel-step3-freeze-window.md` | Step 3 源码冻结窗口作业 checklist（依据本文 Step 3 与工程规范 6/7） |
| `docs/pure-cheng-kernel-closure-plan.md` | Phase A-F 总图；资源/结构详版分别指向本文 |
| `docs/cheng-formal-spec.md` | 语法规范唯一权威（与本文无重叠） |
| `docs/cheng-exact-def-rewrite-design.md` | D3 的前置主体工程 |
| `docs/cheng-csg-pickup-design.md` | D2 信任模型 + Step 4 的设计卷 |
| 施工图集合 | `design/pa_s1b_edit_plan.md`（rev.3）、`design/incremental-forest-consumption.md`（rev.3）、`design/arena_capacity_and_u0_cut.md`、`design/authority_invalid_triage.md`、`design/pool_stage68_conjuncts.md`、`design/pc_closure_s1_progress.md`、`design/pc_closure_s1_edit_plan.md`、`design/strict-closure-k3-split.md`、`design/pd_heldexec_m1m2m4_plan.md`、`design/anchor_drift_audit.md`、`design/bake_opt_design.md`、`r2_closure_ops_map.md` |
| C 头/工具 | `tools/user_path_gate.sh`（四夹具判词回归 + 200MiB/768MiB 硬守卫）、`tools/beat_c_process_group_guard.sh`、`tools/linux_cgroup_guard.sh`、`tools/memory_model_limits.sh`、`tools/kernel_plugin_closure_check.py`、`tools/kernel_plugin_manifest_gate.py`、`tools/cheng_export_symbol_dup_gate.py`、`tools/zc_enumerate.sh` |

