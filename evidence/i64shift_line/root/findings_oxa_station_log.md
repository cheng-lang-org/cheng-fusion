# oxa 自举收敛站日志（接力纪要）

## 运行口径
- 构建: gcc -O2 -I. -o /tmp/oxa_cold bootstrap/cheng_cold.c -lm
- 验证: env CHENG_COLD_DUMP_VAR_FORWARD=1 /tmp/oxa_cold system-link-exec --root:. --in:src/core/tooling/csg_core_native_main.cheng --emit:exe --link-providers --target:arm64-apple-darwin --out:/tmp/<唯一> --report-out:/tmp/<唯一>.rep
- 最新日志: /tmp/oxa_s32.log （RC=2）

## 本轮已修站点（全部在 bootstrap/cold_parser.c，除注明 cheng_cold.c）
统一模式：点存活区间表/整图游走对"新物化循环携带行"失明，用两个规范证明补出口：
槽头身份(cold_exact_slot_current_definition_replace_valid 或 版本链 chain-to-head) + 支配 currency(cold_exact_definition_is_current_at_predecessor)。

1. 站4 unique-borrow projection 早退块 liveness 组(~23120)：加 root_live(源或自身@call) 出口。案例 def=1198 cert var-out。
2. 站5 @borrows 实参门(cold_materialize_exact_borrow_call_args ~28830)：CFG_MERGE+UNIQUE 加 replace_valid||current_at_predecessor 出口。
3. 站6 cold_emit_exact_call_borrow_view(~59650 liveness 合取)：同上出口。
4. 站7 边界边检查(~29165)：source 为新 merge 时同上出口 + [bvx] 探针。
5. 站8a 三处出口扩展到 OWNED(MOVE/PLAIN) merge（materializer/view/boundary）。
6. 站9a cold_require_local_exact_value_available 消费门(~3895)：head 身份+支配出口（[cvx] 探针）。
7. 站9b cold_exact_var_out_source_live_at_call CFG_MERGE 早真臂：加 replace_valid+cap 出口。
8. 站10a initialized_var_source_valid_impl owned CFG_MERGE 尾臂：加 replace_valid/chain+cap 出口。
9. 站10b bootstrap/cheng_cold.c cold_exact_projection_parent_live_before_op(~60242) MOVE/PLAIN 臂：merge self-origin + 链到头(严格递减 source/origin 游走) + cap。[plx] 探针。
   根因事实：var-out 发布器先推进槽头再验证 carrier，故"父=头"须放宽为"链可达"。

## 公共根修复（关键）
站11根因链定位：owned_cfg_merge_authority_valid 整图游走卡在 SHARED_COPY 行 1554(dst=1361 share-view, og=1518)，其 SHARED_COPY 臂要求 live_before(1518@1554)=0 —— 同一盲区。
已修：cold_exact_owned_local_authority_valid_impl SHARED_COPY 臂(~73348)：merge 父行加 (head==source || version_chain_reaches(head→source)) && current_at_predecessor 出口。此修复使 authority(1604)=1 应已打通 MV 递归与 drop 权威链。

## 当前卡点（站11，drop 记账）
die: "use of consumed managed value" @ compiler_csg.cheng:311(函数坐标) local=candidate def=1622
[cvx] body=0x… slot=853 def=1622 blk=259 opc=1638 head=1604 rvs=0 curpred=0 chain(head→def)=0 revchain(def→head)=1 consrep=1632 creach=1 dblk=258 MV MOVE src=1604 org=1604
- op1631/1632 = 分解 drop(copy 到 1426 + call cold-drop-object:636)，位于 release_block 261；当前开放块 259（body_reopen_block 回跳主线）。
- 即：ref-object 分解放 drop 把消费代表记到主线仍在用的版本上；且 head 显示回退为 1604（疑借用视图重锚或合并选输入所致——正是他会话 [smgw](line 25708/25714/57743) 活跃区，勿盲改）。
- 可能正解方向：a) 消费代表登记时按互斥块语义（参考 cold_exact_mutually_exclusive_consumer_pair_valid cheng_cold.c:51985）；b) require_available 门对"消费行所在有效块不可达当前点"的出口；c) 查 head 回退是否 bug。
- 若证实为编译器正确拒绝（真实 use-after-drop），需查用户源码 BuildCandidateInto 的作用域。

## 探针清单（收尾删）
本轮新增: [ubx]+cold_oxa_ubx_merge_dump、[rbx]、[bvx]、[cvx]、[evx]、[oga](5臂)、[plx]。前任遗留须删: [fxp][fxu][fxg][fxv][fxs][fxt]。保留他方: [smgw][ev0][ev1][ib*][elp][elpd][ivm][ivn][vocert][voret][vofail][voenter][voimpl][vos][vopub][who][rew][pvfail][upv][pe][d3][w22][x22][pre9][rlt][mv][uxp][uxq][uxr][uxs][pj2][ret][VP][vfl][vol][ogf][prd][ev][avail] 等（多数为他方会话探针，勿动；仅删明确属于本任务的）。
注意：rc=0 后需连续两次 rc=0 才算完成；清理后重建双跑。

## 站11 续（授权后推进记录）
护栏①已履约：读 git diff [smgw] 区 —— 他方会话语义：a) 版本血缘对所有根细胞发布记 source 列；b) 发布器无条件推头 head:=MV 行；c) 预埋 [rew] 探针监测回退（slot853 从未触发，head 回退非发布器所为）；d) 发布前用最新同槽行刷新 Local 快照（解释 snapshot=1622）。锚点语义=发布即最新，未动其语义。

站11第一门已破：require_local_exact_value_available 加路径不相交消费出口——consumer_index_sync 枚举全部消费者 + consumer_effective_block 取有效块 + query_relevant_blocks(cfg,0,N,current)[blk]==0 表示消费块不可达使用点；全部不相交则本路径存活。判定精确（可达路径真实消费仍拒绝）。已过此门（/tmp/oxa_s33.log）。

新卡点（站12，当前 RC=2）：cold_drop_exact_scope_locals 的 scope preflight（cold_parser.c ~70596-70740）
- die: managed scope preflight ownership dataflow is invalid
- cold_exact_definition_consumption_dataflow(body, definition, exit_block, &state) 返回 invalid/未知
- 消费者: 1622(MV src=1604 blk258)、1638(COPY_COMPOSITE TEMP own=2 org=1432 src=1604 blk259)
- 猜想：release_block 261 分解 drop 与主线 259 使用并存使全图定点未定；或 MV 写回+条件 drop 超状态格。
- 方向：a) 读 cheng_cold.c 的 consumption_dataflow 状态格，把 var-out 写回与条件 drop 共存折叠为已知态；b) preflight 前 release_block 互斥归并；c) 查 op1638 源列为何=1604 非 1622——若为 line311 use 且绑旧版，疑借用视图重锚错绑（他会话区，护栏①协商）。

## 探针增补
[plx]（cheng_cold.c parent_live）、[evx]（edge_structure 分解）、[oga]（owned 图游走5臂）、[cvx] 富化版、[bvx]。均在 CHENG_COLD_DUMP_VAR_FORWARD 门内。

## 站12 定性（护栏②结论 + 实锤）
- CHENG_COLD_SCOPE_PREFLIGHT_DETAIL 实跑（s34）：preflight failed 行显示 local=candidate **definition=1604** exit_block=263 consume=921 —— 即作用域关闭时槽头与 Local 快照均已回退到 1604，而非最新版本 1622。
- 用户源码（compiler_csg.cheng:15507 起）：candidate 于函数中段经 ArenaInitInto(var-out) 绑定，第二个 for 循环内多处使用/变异，作用域关闭才 emit drop —— 单趟解析下 drop 必然晚于全部主线使用。**编译器应接受并正确发 drop；当前拒绝属循环携带细胞版本管理缺口，非正确拒绝。**
- 新线索：loop header 区 op1086=call(InitInto 族) 有两条 dst=853 的 var-out 行(1088 b=0 / 1090 b=1)，candidate 细胞属循环头合并家族；循环闭合重锚把头/快照压回 1604，丢弃 1622 谱系，导致 consumption_dataflow 对 def=1604 出 invalid。
- 下手点建议（按优先序）：① 循环闭合重锚时对新版本做合并/继承而非覆盖（查 loop close 的 slot_origin_id 与 local->value_def_op_id 写入）；② consumption_dataflow 状态格允许"新版本存在但检查定义为其祖先"折叠为 CONSUMED|LIVE 已知态；③ 若重锚本意即丢弃 1622，则须解释主线 1638 为何仍绑 1622 谱系——三者取一前先跑 CHENG_COLD_SCOPE_PREFLIGHT_DETAIL=1 看 1086-1090 全貌。

## 最终状态
rc=2 @ 站12 scope preflight。已修 9 处出口全部保留且各自门已过。探针未清（按纪律）。日志链 /tmp/oxa_s11…s34.log。

# 续攻会话（站12→站33，接档）
站12~31 已过（修复清单见交接报告：batch supersede/血缘盖章/sole-MV/frame-owned/closed-link/COPY_I64载体/区间纯度/身份三元组/MV头parent-live 等，全部白名单窄证明）。当前 RC=2 @ **站32**：
- die: cold_parser.c:2401 "scalar pointer read source is not exact"
- 形状: proj=86 PAYLOAD_LOAD(5) dst=87 a=86 b=8 c=8；root=85 自身即 BORROW_PROJECTION/SHARED 行(org=77,src=-1,etid=5244019,pfr=18969)
- 实锤([oxa32][oxa33]探针, s31b.log)：①cheng_cold.c:59650 resolver_at 入口门要求 producer 七列全 INVALID——但本路径 cold_parser.c:2346 cold_publish_exact_managed_read 先盖了 86 的 def 列→入口即 -1，下游永不执行（[oxa33] 未打印=实锤）。修向：入口门放行 pl==BORROW_PROJECTION && own∈{SHARED,UNIQUE} 的已发布形状。②terminal walker(cold_parser.c:19997) 对 85 第一跳 edge_valid=cold_exact_shared_projection_edge_valid(85)=false 即断链（单次 oxa32 打印后终止=实锤）。修向：读该函数补 SHARED 边出口。③cheng_cold.c:59797 已删 destination storage-tag conjunct（与 parser:2360 eager stamp 互毒）；cold_parser.c walker 已加 COPY_I64 纯地址拷贝链节点上溯(dst∈PTR/OPAQUE 才爬——若77的dst非此类需再放宽)。
- 本轮新增探针待清：cheng_cold.c [oxa26]两段/[oxa33]、cold_parser.c [oxa28]/[oxa29]/[oxa30]/[oxa31]/[oxa32]/field-take die前打印/[hop]:2350/[prd]:2345；他方探针不动。
- 日志链：/tmp/oxa_s26a…s31b.log。构建验证命令同纪要。


- 入口门已放宽 place/own（s32a 仍 resolved=-1）→ 86 的 org 或 cs 列亦被 stamp；下一步把 [oxa33] 探针移到 cheng_cold.c 入口门之前打七列实况，按实况放行对应列（identity 列 vds/vet/pfr 保持严判）。

# 续攻会话2（站32→站37，接档）
构建验证同口径。日志链 /tmp/oxa_s32w…s60w.log。

## 站32 已破（scalar pointer read source is not exact @ parser:2401）
- 实测推翻入口门假设：[oxa33] 现打印 prod=86 七列全净(-1/0)，门本就通过。真因在下游：
- 修 cheng_cold.c cold_exact_borrow_parent_live_before_projection 槽证明臂(~60160)：父行77(COPY_I64 共享借用载体, dst=slot77 PTR) 的 recorded storage 列未盖章但派生 authority=4 可证 —— 加「record 与派生双 UNKNOWN 才拒」出口（同 59826 既有 tolerance 注释族）。

## 站33 已破（scope preflight invalid, machoReadObject/parsedRelocs def=1097）
- [oxa36] 实锤：def=1097 为自源 CFG_MERGE/MOVE 循环头 phi（org=self，双臂 cs==definition+1），ospm 臂成立但被 exact_nonresource_loop_reentry 的 C 组 (state&CONSUMED)==0 卡死（回边 join 带 CONSUMED 位）。
- 修：cheng_cold.c C 组补 || owned_same_place_merge_reentry（不可变列证明已由 ospm 自身锁死；覆盖 def=996 同形 kill）。

## 站34 已破（call var unique-borrow authority, elfLinkExeX8664/dynsym call=2606）
- 定性：Local 快照=2600（自源 MOVE merge，block508），调用块504 是其兄弟臂——reach(2600 到 call)=0 是正确拒绝；真正在场纪元是唯一同时 reach+支配货币的同槽版本 2578。
- 修：cold_parser.c cold_exact_unique_borrow_var_call_valid 在 owner_root 恢复步后加「快照不可达时解析唯一 reach+current 同槽生产者」窄出口（多于一个候选取 -2 保持拒绝）。

## 站35 已破（owned Ok result cannot hide a borrowed value, coffReadRelObj return Ok(out)，源码合法）
- [oxa39]：authority=1591(NOP MV own=UNIQUE cs=0) org/src=1362(自源 MOVE merge=细胞头 slot_origin_id 命中)。
- 修：parser Ok 门 die 前加「帧自有移出」白名单：UNIQUE+MV 行 cs==0+vds==value_slot+origin 为自源 MOVE CFG_MERGE 且等于 slot_origin_id。误用由消费数据流拦截。

## 站36 已破（indexed element field store lacks exact unique base authority, TextIndexInit）
- [iba/ibm/oxa41]：基授权=MV 纪元行(pl=8 own=UNIQUE cs=0) src 链 32 到 27 到 22(STACK_LOCAL/MOVE/org==vds 槽约定自根)；根证明只认 projection/var-param 形。
- 修：parser ~81540 根判定加「帧版本纪元」臂——MV 行沿不可变 src 链爬(不超过64跳)，终端接受 BORROW_PROJECTION/var-param 或 STACK_LOCAL|TEMPORARY+(MOVE|PLAIN)+origin==vds。

## 站37 当前前沿（jsonParseObject local=node def=6，RC=2）
- 三层修复均已生效：
  a) bind-source live=0：valid_at consumer==-1 臂加「代表块 RET 终结+唯一纪元(staging 自根)」出口（rep op37@blk9 RET——该路径已带消费退出函数）。
  b) 数据流二次消费 kill：cheng_cold.c ~55319 加三臂——mutex 对(既有 helper，symbols=0 走可达性 fallback)、跨槽血缘标记(MV/merge 行 vds 不等 def 槽且 src/org==def 即非消费)、REP 块 RET 终结对一切后续点豁免。[oxa43] 证实 (37,164)=helper1、(37,{111,150})=rexit1 全放行。
  c) preflight dataflow 现 valid(state=6 known)。
- 新卡点：conditional managed cleanup closure failed ... continuation=45 tail=45 exit=44 state=6 live=1 ended=1 @ parser:71044（die 71071）。语义：混合状态(LIVE|CONSUMED)的边应先发边上的 release 再验闭合；现直接进闭合断言。方向：读 cold_emit_exact_scope_cleanup_edges 边循环，确认混合态是否漏发 per-edge drop（对照 71004 uniformly-live 分支），或 state 应按边前驱分别查询而非全 join。
- 注：body 含恢复重试残留行（node 拷贝 x4：op37/63/89/150 同形），多站 kill 均与其相关；若上游 recovery 能回滚残留可整族消解。

## 收尾清单（rc=0 双跑后执行）
删我方本轮探针：cold_parser.c [oxa34]/[oxa37]/[oxa38]/[oxa39 打印段]/[oxa42]；cheng_cold.c [oxa35]/[oxa36]/[oxa43]。上轮遗留 [oxa26]*、[oxa28]-[oxa33]、[plx] 还原、[hop]:2350、[prd]:2345 按前述清单。他方探针([smgw][ev][lvv*][ux*][elp*][fxv][iba*][arows][avail][pub][vobool*][d3][w22][x22][pre9][own9][dl9][crx][cgr][mtid][ret][pj2][projcheck] 等) 一律不动。
五处语义修复全部为不可变列白名单窄证明，保留。
# 续攻会话5（站40/41 已破→站42 前沿，接档）
构建验证同口径。日志链 /tmp/oxa_s88a…s88s.log。进度 1704 万行 → 2013 万行（历史最远刷新）。

## 站40 已破（mvmerge authority 游走 nodewalk cur=922，cs[384]=0）
- 定性（护栏①履约）：922 确由我方 mvmerge 块构造（[oxa] mvmerge merge=922 f=384 s=921 日志实锤），非他方发布器；cs[384]=0 也非构造后被外部改写，而是**我方 parser 侧 CFG 回退点的快照恢复无条件覆盖 consume 列**，把 mvmerge 守卫刚盖的消费代表抹回快照值。[oxa52] 抓获五次覆盖：join-compatible(old=922→snap=0)、restore(old=923→snap=0)、早期 restore/loopclose(old=424/397→snap=0)。
- 根因语义：consume 列对 MOVE/PLAIN 定义是「消费代表记账」（信息性；BodyIR 行只增不减，现行非零必有物理消费者行背书，覆盖必丢账→node_valid 的 rep 合取失明）；对 BORROW_UNIQUE 定义是「排他终结标志」（约束性；fork/join 恢复快照=重置借用可用性，必须无条件恢复）。统一 ==0 保护会回归 byteBufferEnsureCapacity（unique-borrow merge input was consumed 族），必须按 ownership 拆分。
- 修复（三处同谓词）：owned(MOVE/PLAIN) 且现行非零 → 保留现行；否则恢复快照值。① cold_restore_local_value_defs（fork restore）；② cold_close_exact_managed_loop_phi entry_def/backedge_def 两笔；③ cold_join_local_value_defs compatible 分支 true/false 两笔。与 88512 非-phi 分支既有 ==0 先例同构。

## 站41 已破（var arg primitive sequence type missing [] @ parser:14538→现约14560，slplan.SystemLinkPlanRetainedBytes）
- 实锤链（[oxa56]/[oxa57]/[oxa54]）：`plan.externalPackageRoots[rootIndex].verifiedSourcePaths` 传 `var str[]` 形参。字段跳强制 ref_kind=callee 形参 kind(12) 使 **hop1 中转载体（opaque-object seq）冒充 str-seq**；随后 body_slot_set_seq_opaque_type 把槽类型剥成元素拼写（32 无 []），hop2 索引跳按 kind=12 走 i32/str 分支读不到 `T[]` → die。
- 修：删字段跳的强制覆盖（cold_parser.c ~16236 一带），每跳保持自身 field type 证明的 natural ref_kind；形参 kind 适配仍由链尾 leaf 规范化点（16604 带 specialized TypeId 证明那处）负责。中间 hop kind 必须与 slot_type 物理一致，这是 DOD 身份原则而非启发式。

## 站42 当前前沿（exact parameter carrier borrow mode is invalid @ parser:13462，parser.ParserValueExprTreeReleaseBorrow）
- 首现于站41 破后（历史各跑零出现，非回归）。函数签名 `@borrows fn ...(tree: ParserValueExprTree)`（@borrows + **值对象非-var 形参**）。carrier own=3(SHARED)（[fxu] def=0 own=3 cs=49），effect_matches 三合法形态全不匹配 → 疑 @borrows 未进 function->borrows_args（应走 SHARED 臂却按 MOVE 臂判）或 formal_is_var 误判。下手点：13449-13463 判定处打印 formal_is_var/borrows_args 运行时值；再查 @borrows 解析写 FnDef.borrows_args 的路径对新组合是否遗漏。

## 探针增补（rc=0 后与本轮一起统一清）
本轮新增：[oxa53]（borrowed merge 验证失败详情，mvmerge 失败分支）、[oxa54]（seq 类型 die 详情）、[oxa55]×2（kindnorm-16604/16682）、[oxa57]（place-enter）。[oxa52] 与 [oxa56] 已随定性完成删除。⚠️教训：探针 `%.*s` 打印悬垂 Span 会触发既有 UB 段错误（裸跑崩、lldb 下不复现）——新探针一律打数值 len，勿解引用 .ptr。

# 续攻会话4（站38已破→站40前沿，接档）
构建验证同口径。日志链 /tmp/oxa_s77w…s87w.log。

## 站38 已破（initialized call var-out source @ parser:28960，json_field.cheng:108）
- 实锤链：def=275 是 slot57 buf 自源 CFG_MERGE/MOVE 循环头 phi；其块 52 [275,276) 唯一后继是**空且无终结符的蹦板块 158**，通向查询块 160 的真实路径被断绝（159→161 同形）→ 数据流 walk 从未扫过 op275（[oxa47] 零命中）→ 活性读成 UNDEFINED（st=1）。块表全图可达 162 块但仅 41 块反达 160。
- 曾试「蹦板透明桥接」（空块唯一同起点续接重定向 relevance+join）：能破站38 但把全族 merge-phi 查询变诚实，连续翻出 PathHostFilePath/LoweringPrimaryObjectIrReportText 的 replace-state 混合态拒绝（st=6=LIVE|CONSUMED 为真值，门策略不收）——已整体回滚，桥接代码不在树上。
- 终修（白名单 sole-current 单写者事实移植）：① parser initialized 门 die 前加臂 `oxa_init_merge_phi_current`：NOP+CFG_MERGE+origin==self+own==MOVE+cs==0+producer 同+区间 (src,call) 无同槽重定义 → 放行。② 发布器推进头后，post 门（parser:25960 一带）同一盲区再卡 → 加对称臂 `oxa_pub_merge_phi_succession`：phi 家族源 + cs[source]==definition+1（消费代表恰为本发布行）+ exact-read 源边 + slot_origin_id[slot]==definition → 放行。两臂均纯不可变列证明，零遍历。

## 站39 已破（managed field take zero-store @ parser:61681，csgc.csgcEncodeFromOrdered）
- take 路径发射 PAYLOAD_STORE 后无人盖章 `op_source_value_def_op_id[store]=zero.def` 与 `consume[zero]=store+1`（body_op3 清零列，publish 只盖 exact-read DST 列），后检必炸。修：publish 后补两笔规范记账（与 63012-63022 phi 边模式一致）。zero def 每次 str 字面量新建，盖章无重入风险。[oxa51] 探针实证 src=-1/cons=0。

## 站40 当前前沿（same-place memory-version merge failed @ parser:85429，validator.csgCoreValidateFactLinesInto local=result slot30）
- mvmerge 构造 def=1024(first=1007,second=1023) 成功，`cold_exact_owned_cfg_merge_authority_valid(1024)` 整图游走在 **nodewalk 臂 cur=922** 失败（[oga] arm=nodewalk）。
- 行 922：NOP place=6(CFG_MERGE) own=2(MOVE) origin=self consume=928 source=**384** b=921 c=193 —— 老自源 phi 家族。node_valid(922) 走 `memory_version_cfg_merge_valid`：first=384 的消费代表 rep=cs[384]-1=**-1**（dump 实证 consume[384]=0）→ 代表格合取必败。
- 疑点（⚠️他方活跃区证据）：若 922 由本 mvmerge 块构造，85378 守卫必给 first 臂盖 cs[384]=923，不可能留 0 → 922 的 first 臂系构造后被改写，或构造者为本块之外的另一发布者（cheng_cold.c ~63384 同款也带守卫）。且 384 是被 897→920→921 谱系超越的老头，把祖先直接记为合并臂本身可疑（second=921 的谱系里已含 920←897←877，而 first=384 是更老分叉）。
- 下手建议：① 先查 922 构造点（谁写的 source=384）：git blame 不动工作树，用 CHENG_OXA_DIAG 在 85348 块入口打印每次 mvmerge 的 (first,second) 观测是否出现 384；② 若坐实他方改写/漏刷新快照 → 按纪律落证据报告不擅改；③ 若属我侧验证器容差：可沿「祖先臂被谱系后继取代」加不可变列窄证明（384 是 920/921 的版本链祖先 + cs[921]/cs[920] 已由本合并批盖章 → first 臂事实由 second 臂承载）。
- 本会话新增待清探针：cold_parser.c [oxa50]（replace-state die dump）、[oxa51]（zero-store die 事实）；连同上轮 [oxa44]-[oxa48]。全部 CHENG_OXA_DIAG/DUMP_VAR_FORWARD 门内。
- 本会话语义修复三处全为不可变列窄证明，保留。回归佐证：s86w 推进至 1704 万行（历史最远 1675 万），此前各站无一复发。

# 续攻会话3（站37已破→站38前沿，接档）
构建验证同口径。日志链 /tmp/oxa_s61w…s76w.log。

## 站37 已破（conditional managed cleanup closure failed @ parser:71044，jsonParseObject node def=6 state=6 LIVE|CONSUMED）
- 实测链（[oxa44][oxa45][oxa46][oxa47][oxa48] 探针）：函数级出口块含 return-node 编组对 buf/node 的引用行（k13 COPY_COMPOSITE src=def），边循环 useexit=1 两臂全 continue；continuation 遍只处理 uniformly-live，混合态无人发射→闭合 die。
- CONSUMED 位来源：循环内同槽 MEMORY_VERSION 再盖章行（op111 pl8 org6 src6，同细胞版本后继，非真实移出）；四条 k13 同形行（op37/63/89/150）＝四个 return jsonNil() 站点的分解释放（copy+call），位于 RET 终结块，与源码 946/950/955/974 一一对应——**前手『恢复重试残留』假说不成立**，无发布器去重问题，未做任何删除。
- 修一（cold_parser.c 新 helper cold_exact_scope_exit_consumers_are_same_slot_succession，~70816）：混合态收窄证明——反向可达尾块的引用行审计：MV 行 org 链回 def=同细胞再盖章✓；BORROW_PROJECTION/SHARED_COPY=纯视图✓；值less临时行✓；call 参仅借式✓；块尾数据流 LIVE 存活=所有权未终结✓；其余（真移动/owned实参）拒绝。接线：continuation 遍 known&&live&&ended&&!undefined 且证明通过 → 走 uniformly-live 同款在出口操作之后发一次释放（71268 同 cell mixed 分支）。
- 修二（cold_emit_exact_owned_drop 消费门 ~69828）：prior_consume!=0 时若同 helper 证明通过（记录消费者所在不可达路径=互斥，可达引用全为版本盖章/视图），放行物化——「本点恰欠一次释放」由构造证明。
- 修三（cheng_cold.c 数据流容差臂 ~55369/~55409）：rep 块 RET 豁免臂与异槽血缘盖章臂在跳过二次消费记账时，若联合态带 LIVE 位则规范化为 CONSUMED（清 LIVE 留 UNDEFINED）——容差豁免的是二次记账不是终结本身，真实消费行必须终结活跃半边；纯 CONSUMED 性行为不变。此修使释放后 re-query 正确翻转为 ended。

## 站38 当前前沿（RC=2，新）
- die: parser:28960 "initialized call var-out source is not exact and live"，fn=field.csgJsonFieldDecodeString（src/core/csg_core/json_field.cheng:108，ByteBufAppendByte(buf,…) var-out 循环体调用）。
- 形状：source=275（slot57 buf 的自源 CFG_MERGE 循环头 phi，own=2 og=self src=61 b=274 c=50），gate 数据流 (275,blk160,before-op282) 返回 valid=1 state=1(UNDEFINED)。[oxa48] 实锤：walk 全程跑完（qfrom fe=0 fex=162 qb=160 qo=282 → qdone st=1）但从未经过 op==275 行（[oxa47] 零命中）；且 op275 所在块在不同快照为 65/11/52 三态——疑 emission 中途行重定位/块重建导致 def 行不在被扫描范围或 slot 头索引陈旧。该区为他方活跃战场（[ux*][rv1][hh3][rlt][arows][ivm][vocert][vfl][VP][pub][vopub] 密集），勿盲改。
- 下手建议：① 先核 op275 行现属块与其块 op 区间是否覆盖（block_op_start/count vs 冷冻缓存）；② 核 slot57 头链（slot_origin_id/hh3 hist）与 local->value_def 是否指同一现行行；③ 若行重定位坐实，按版本链语义重挂 def 身份（禁删行）。

## 探针增补（rc=0 后统一清）
cold_parser.c：[oxa44] 五段（enter/edge useexit/edge st/tail/tail2/failmap/exitops/emitted）、[oxa45] 两段（walk/emit）；cheng_cold.c：[oxa46] 两段（skip/consume，门=def∈{6,275}&&op≥164）、[oxa47] defrow、[oxa48] qfrom/qdone。全部 CHENG_OXA_DIAG 门内。他方探针一律未动。五处语义修复（上轮5+本轮3）全为不可变列窄证明，保留。


## 站42-45 主道连破（oxa 主道接管，2026-06-27）

### 站42 @borrows 首现（parser.ParserValueExprTreeReleaseBorrow）
- [oxa58] 实证：fiv=0 ba=1 own=4(UNIQUE)——ba 正常，载体是租约句柄 UNIQUE，effect_matches 只收 SHARED。
- 修=effect_matches 第二臂放行 UNIQUE（排他→共享出借健全），cold_parser.c:13449 区。

### 站42b 同族二连（texpr.typedExprReleaseFrozenMetadataProjection）
- gba=0→非本站；实为 source-edge 门 op_b 期待 borrowed=1 而 def 行 COPY_I64 opb=0。
- 修=source-edge 门加窄臂：ba && carrier UNIQUE && kind==COPY_I64 && opb==0 → 豁免（cold_parser.c:~13419）。
- ⚠️该站声明 typed_expr.cheng:39450 原无 @borrows，属源缺陷 → 站44 补 @borrows 后两门全过。注意 st44 脚本曾覆盖 if 行，已补回并 awk 核验——改行号敏感文件必须事后 diff 核验。

### 站43 借用实参绑 by-value 形参（direct/nativeplan ×3 调用点）
- CodegenElfTextDataWriterUnit(plan.targetTriple)：字段 MV 共享投影绑非 var 非@borrows str 形参，spec 0.2.1 明令拒绝。
- 修=源侧显式 strings.CloneStr（同函数 ownedRoot/ownedPath 先例），direct_object_emit.cheng:365/473、native_object_emission_plan.cheng:385。

### 站45 循环携带 var-str 陈旧快照（sexec.BuildSystemLinkExecPlanWithWorldAndChannelInto）
- local typedIrContractReason 跨迭代 var-out 发布后，Local 快照滞留 init 行(10828, dblk≠call blk)。
- 修=cold_exact_unique_borrow_var_call_valid @23412 陈旧快照解析去掉 CFG_MERGE 前置（候选仍需 reach+current 单写者）。
- ⚠️教训：st45.py 三次静默失败/未落盘（write 工具 heredoc 型字符串含 chr(10) 断言错），最终按 awk 行号删两行成功——**每次脚本改 C 必须立即 grep 核验落盘**。

### 工具与纪律
- 新增 tools/oxa_verify.sh 两段式验证：A 静默跑取 rc+死点函数（日志 KB 级），失败才 B 开诊断 tail -c 48M 截尾——磁盘有界（此前单 log 800MB+，已清）。
- FN 门控 getenv 改造尝试失败已精确回滚（helper 注入位置错+18 处盲替换破坏语法）；如再做须逐站点改。
- 本节新增探针：[oxa58][pec 扩展列][oxa59][oxa59c]，随站收敛统一清。

### 站46 当前前沿（委派新会话攻坚中）
- ccsg.compilerCsgExactLayoutResolveInto **递归自调用**，local err(var str) 传自身 formal 6；def 解析为 PARAM-place UNIQUE epoch(def=5) 后仍拒，拒点在 ~23990-24078 大析取块内（疑似 24019 arg_own=2 vs def own=4 且非 MV 版本项）。[ubf] rootlive=1 liveb=1 lashape=1。

## 站46 主道委派（2026-08-25 委派会话收工：死点已消，前沿移交）

### 验证事实（/tmp/oxa_v_100839_b.log，含 [oxa59] 臂的二进制，两阶段同位点）
- 旧死点零触发：`unique-borrow authority is not exact`=0、[ubf]=0、[ubg]=0、`projection root is not a live mutable place`=0。
- var-borrow 实参校验共 737 次（[pj2]=737），全部经 carrier_is_exact_local_projection 早退臂放行；~23948-24102 大析取块整场未进入。[oxa59] 触发 486 次。
- 首个递归自调用（call op≈209，借出 slot8..12 五个 var 形参，含 err/formal6/slot12）完整过门并发布 var-out 版本行 210-214（NOP pl=8 OWN_UNIQUE org=参数序），lowering 推进到 op 245+。旧 [ubf] 拒绝形态未复现 → 不加大 if 盲臂（无 repro 的臂违反窄证明纪律），代码零改动、零新探针、他方探针未动。

### 新前沿（下一站，非本站）
- die 点：cold_publish_exact_managed_read（cold_parser.c ~21198→21268/21312）。LOCAL_ADDR op=245(slot8 载体) 对槽头 MV 行 210（上一次递归调用发布的 var-out epoch）物理读边证明失败：immutable lanes 全过（[ev]=11111110 仅 cur=0）、tuple_match=1、sole-MV bypass 成立且 (211..244) 同槽区间干净，但被 ~20862 `bypass_reaches=cold_exact_definition_reaches_consumer(210,245)=0` 门杀——跨块 blk87→blk96 中途 lowering CFG 边未闭，reach 走不通 → edge_valid=0 → `managed direct read lacks exact physical source` (recovery=1 depth=2) → 函数体弃注册 → `reachable function body missing: ccsg.compilerCsgExactLayoutResolveInto`。
- ⚠️ 归属提示：managed-read edge validator + publish + [pubra]/window 探针是并发 WIP 热区（本会话期间 cold_parser.c mtime 持续推进至 10:14，全文件未提交 diff ~2000 行）。下一站动手前先与持 lane 协调，禁整段重写。

## ⚠️ 并发碰撞协调（主道 ox-alpha，10:40）

**证据**：10:31 cold_parser.c 被本会话以外改动（[ubx] 探针族、bypass_reaches 门 @20862、initialized call var-out 新门）。改动后复验（tools/oxa_verify.sh，两阶段同位点）：

- 站45 形态回退：sexec.BuildSystemLinkExecPlanWithWorldAndChannelInto 现死于 `initialized call var-out source is not exact and live`（typedIrContractReason MV10832，[vfl] 探针）——即我方 [oxa59] 陈旧快照解析所在函数被重写，解析结果未延续。
- 我方锚点现状：[oxa59]/[oxa59c] 仍在（现 @23571/23583），st45 的 CFG_MERGE 前置删除是否保留请核（原语义：陈旧快照解析触发条件= !reaches_consumer(def)，候选需 reach+current+同 slot+同 producer 行，单写者歧义即弃用）。

**主道已落臂清单（请勿无意覆盖）**：
1. effect_matches 第二臂放行 carrier UNIQUE（@~13449 区，站42）；
2. source-edge 门 COPY_I64+UNIQUE+opb==0 豁免（@~13417 区，站42b）；
3. typed_expr.cheng:39450 @borrows 注解（站44，源缺陷修复）；
4. direct/nativeplan 三处 CloneStr（站43，spec 0.2.1 要求的源侧显式化）。

**请求**：任一方动 cold_exact_unique_borrow_var_call_valid / cold_publish_exact_managed_read 前，先确认对方 mtime 静默>10min；站47（ccsg 递归 LOCAL_ADDR 读槽头 MV210 被 bypass_reaches 杀，blk87→blk96 中途 CFG 边未闭）双方都看到了——建议由最后改动 bypass_reaches 门的一方处理或明示移交。
