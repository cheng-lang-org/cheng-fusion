# ORC registry_miss 编译器缺陷 · 根因定谳与修复立项

状态:根因已钉死,复现器/探针/数据齐备;修复落在 cold 编译器 lowering,需重烤自举链,按发布铁律单独立项。

## 1. 症状

进程退出清理期崩溃:

    cheng_orc_release_failure code=registry_miss operation=normal_release detail=wrong_object_or_owner

触发源(业务形态):`return Err[T](r.err.msg)` —— 把 `os.ReadFileBytesResult` 的 str 错误消息经 Result 链搬运后,退出期 double-release。被搬消息读回内容为空白(free 后清零)。

## 2. 实测定谳(全部可复现)

| 实验 | 结果 |
| --- | --- |
| 字面量 `Err[T]("literal")` | rc=0(静态串不走托管释放) |
| 直读 `r.err.msg` 不二次包装 | rc=0(单 owner 正常) |
| `return Err[T](r.err.msg)` | **rc=1,确定性** |
| release 序列 trace(runtime 探针) | 同一 payload 被 release **2-3 次**,miss 指针 payload 全零,registry 内邻近条目密集(已 free 块被清零复用特征) |

结论:**double/triple-release**。含托管 str 字段的 struct(Result/ErrorInfo)在构造器 sret 边界产生双重所有权登记。

## 3. 缺陷定位(cold_parser.c)

- `cold_make_error_info_slot_from_msg`(L43719):仅当 `msg_result->ownership == COLD_EXPR_OWN_MOVE` 才绑 consume(L43788);borrow 来源(`r.err.msg`)既不 consume 也无 retain,payload row 位拷贝进 MAKE_COMPOSITE → 双 owner。
- std 层加固尝试(`result.cheng` Err[T] 改 @borrows+CloneStr):double-release 对象从源 msg 变为 CloneStr 产物,**崩点移到 Err 构造器自身的 sret 返回边界** —— 证明第二处缺陷:`var out: Result[T]` 经 sret 返回后 epilogue 仍对局部 out 的托管字段 release。
- 同族历史修复:`parse_object_constructor_typed`(cold_parser.c L37939)对象字面量构造器的 identical double-release 已修(publish exact owned managed field sources);本缺陷是函数调用构造器 + sret 形状的同一病灶未覆盖。

## 4. 修复方向

1. cold_parser/cold emit:borrow 来源的 managed payload 进入 MAKE_COMPOSITE 前插入 retain(或强制物化 owned 拷贝);
2. sret 返回路径:`var out` move 进 sret 目标后,epilogue 不得再 drop 其托管字段(consume 边贯穿);
3. 验证回路:`cc bootstrap/cheng_cold.c -o /tmp/cheng_cold_test` 可独立构建(已实测可用),但独立 cold 缺 provider archive(provider_object_count=0),需先打通 provider bundle 喂给 --link-providers 才能端到端验证;
4. 修好后重烤正式 stage3 并按发布铁律重立固定点(census/exec_diff/ci_gate 全套),更新 CLAUDE.md 契约哈希。

## 5. 验证回路(已打通,2026-08-29)

- 独立构建:`cc -O1 -o artifacts/bootstrap/cheng.stage3.dev bootstrap/cheng_cold.c`(镜像位置使 toolchain_root 解析正确;**必须**同时传 `--toolchain-root:$PWD`,否则 provider_object_count=0);
- 08-21 的 cold_parser WIP 语义已定谳:它不是回归,而是**强制 API 所有权注解的迁移机制**——所有「borrow 实参 → byval 托管形参」绑定一律编译期拒绝(`borrowed actual cannot bind non-var non-@borrows formal`),强迫 API 作者显式 var/@borrows;
- 修复模式已两例验证:`BfsGetU32/BfsGetI64`、`DscContains` 加 `@borrows` 后 dev 编译器下 smoke rc=0;只读托管形参一律 @borrows,需要可变用 var;
- or5 repro 在 dev 下仍 rc=1:repro 内仍有未注解的触发形状,逐个消化即收敛。

## 6. 剩余工作量

全仓按此模式迁移:粗扫 src/std+src/apps+src/chains 的 byval Bytes/str 形参签名约 2000 处(std 已有 631 处 @borrows)。机械但量大,建议按目录分批:apps/rwad → chain → std,每批以 dev 编译器全量编过为验收。完成后重烤 stage3 并按发布铁律重立固定点。

## 6b. 运行期残余触发点(dev 编译器下,2026-08-29)

编译期注解迁移后(or5 repro 全部绑定通过新检查),运行期仍有一次 double-release:

- runtime release-trace(runtime 源热改探针)+ payload 指纹:指针 4356530456 被释放两次,首次 head=非零内容,二次 head=0(free 后清零)——经典 double-release;
- 关键发现:str 的 ORC ABI 是 {data, len, store_id, flags} 四段, 标记所有权;作用域释放走专用导出 (不经通用 checked 入口,故早期 trace 漏计);
- 快照机制已存在:(owned 返回持独立 retain,源存活到清理边);缺陷=某条 lowering 路径(疑似 Err 构造器 sret 或字段 move)产生第二个 Owned 标记而未走 snapshot;
- 下一步:给 str release trace 加 flags dump,锁定第二个 Owned 标记的产生语句;再对照 CleanupPlan 的 emit 决策修 lowering。
- **缺陷点定谳(2026-09 goal-r1)**:最小复现收缩到 `os.ReadFileBytesResult` + `return Err[bool](r.err.msg)` + 结果持有到 exit(src/tests/orc_dev_tier1b.cheng,dev 编译器 rc=1)。lldb 断点 `cheng_mem_release`(真实导出符号;内部名无符号)证实第二次释放的 payload 已 free 清零。缺陷函数=`cold_parser.c cold_make_error_info_slot_from_msg`(L43719):OWN_MOVE 源走 consume 标记(L43797),BORROW 源仅 `cold_bind_parsed_call_arg_authority`(L43780)绑定 borrow 视图进 MAKE_COMPOSITE——composite owned 化并 sret 移交调用者后,源 owner 与 composite 各 drop 同一 msg=double。修法=BORROW 源进 composite 前 retain 转 owned(与 L43788 MOVE 分支对称),需核对 emit/drop 两侧 rc 平衡。注:早期 minimal 探针的「rc=0 通过」多为管道退出码误报(grep/head 的 rc),一切以重定向后 `$?` 为准。
- **无分配探针定谳(2026-09 补)**:release 路径上做 cheng 分配的探针会自指掩盖(实测 trace 版 rc=0,干净版 rc=1);改用 host-malloc+write(2) 直写后拿到完整序列——double 的对象是**原始 err-msg clone(A,内容 os file open...)**:Tier 段释放一次,exit 期再释放同地址(head 已清零);CloneStr 产物未成为最终 owner,指向 @borrows 形参绑定或构造器 sret 的 move 仍丢 retain。原始 trace 存 docs/rwad-orc-trace-evidence.txt。

## 6c. 编译器补丁落地(goal-r2,2026-09)

`cold_make_error_info_slot_from_msg`(cold_parser.c L43788 区)新增对称分支:exact_msg 且 ownership 为 BORROW_SHARED/BORROW_UNIQUE 时调 `cold_emit_str_owned_retain`(既有 helper:读 str flags,Owned 则对 data 调 cheng_mem_retain),borrow 消息进 composite 前 rc+1 转独立 owner——与 OWN_MOVE 分支的 consume 标记对称,drop 两侧平衡。

验证:`cc -O1` 重编 dev(cheng.stage3.dev)+ `--toolchain-root:$PWD`;t1b 最小复现 rc=0;or5 repro 全 tier rc=0;双口径矩阵(DEV 补丁版 / STAGE3 官方版)12 条核心 smoke 全绿、零退化。

注解迁移本批落地:FcertAddEntry(entry 内 clone pub/sig)、verifyEd25519Epoch、signEd25519RawEpoch、BridgeBatchRoot、RwadStateMachineQueryOwner 等 serial 10 处、accumulator 6 处(含重复 @borrows 清理)。accumulator/bft 两 smoke 为 HEAD 原生红(stash 基线实测 rc=2),不属本次退化,其存量隐患(表达式 if bail、ByteSpan plain copy)另案。

## 6d. goal-r2 收口矩阵(goal-r3 复核)

- **STAGE3 官方口径:27/27 全绿,零退化**(gate 清单 vrf_tai→gov_cert_flow);
- DEV 口径:18/27 绿。9 红(vrf_tai/committee_vote/committee_e2e/checkpoint/full_pipeline/unimaker_pay/light_client/rfc8032/gov_cert_flow)全部同因=依赖链(std/vrf/crypto)中 byval 托管形参未注解,plain-copy 检查拒绝;
- rwad_accumulator/rwad_bft 两 smoke 经 stash 基线证实为 HEAD 原生红(dev+stage3 同),不在 gate 27 清单内,另案;
- ed25519.cheng 存在并行会话活跃改动(import alias 移除 +93 行),gov_cert_flow 的 die 与该中间态交织,gov 链迁移需等其落定后重验。
- 下轮:按模块批量注解 std/vrf/crypto 只读 helper(名字模式 Get/Slice/Concat/Digest/Equal/Verify/Hex),编译器错误驱动收敛至 DEV-27 全绿;move 语义形参(return 形参 / field=形参)保持 byval 不误标。

## 6e. goal-r4 批量迁移与守恒

- 批量注解:vrf.cheng 12、sha512.cheng 4(Digest/Digest2/Digest3/getU64BE)、ref10.cheng 8(scReduce/scMulAdd/verify32/CheckScalar/geFromBytesNegateVartime/GeFromBytesNegateVartime/GeScalarMultBase/checkScalar)、strutils.strip、committee_vote.CommitteeDraw、9 个 smoke 自身 helper 8 处;
- **STAGE3 官方口径 27/27 保持全绿**(含 vrf_tai 修复后复验);
- DEV 口径 19/27:rfc8032_epoch1 转绿;vrf_tai 差 VrfProve 模块内最后 1 处(探针 fn=VrfProve type=Bytes);committee 系列暴露**存量位拷贝依赖测试模式**(同一 owned value add 进两个数组),需测试重构而非注解;gov 链继续等 ed25519 并行 WIP 落定;
- 教训:smoke 内 `[tag, ...]` str 字面量在 @borrows 形参下要求元素 owned——borrow tag 直接进字面量两编译器同拒,改用两次 WriteLine 规避(语义等价)。

## 6f. goal-r5 进展

- ref10.geScalarMult 补注解(a: Bytes 只读;首参 var 不受影响)→ vrf_tai_vectors_smoke DEV 转绿;
- committee_vote_smoke 存量 use-after-move 重构:m0res.value 双 add 改为确定性 re-draw(CommitteeDraw 确定性于 sk/stake/epoch/round),STAGE3 口径验证绿;
- 矩阵:DEV 20/27、STAGE3 27/27 保持;
- 余 7 红分层:committee 系(2)= SignVote(selectedMembers[i]) 元素 move 流与后续字段读取冲突,属存量测试对位拷贝的深层依赖,重构需逐用点 owned 化;checkpoint/full_pipeline/unimaker_pay/light_client(4)= 各自依赖链未迁移;gov_cert_flow= ed25519 并行 WIP 中间态。

## 6g. goal-r6 收口状态

- 探针全清(cold_parser.c orc-copyprobe / orc-matprobe 移除),dev 编译器干净重编;
- committee_vote 库语义修复落地:CvtCloneMember 深拷贝(sk/priv64/pk/ticket.proof 四 Bytes 字段独立存储),CommitteeRankSelected 加 borrows 并以 clone 兑现其 Emits-sorted-member-copies 注释承诺(原实现位拷贝=borrow 元素双 owner);
- smoke 侧 CloneOwnedBytes 提取 pks(元素 pk 已 move 进 SignedVote 后的读取改为独立拷贝);
- 最终矩阵:STAGE3 27/27 全绿零退化;DEV 20/27;
- 余 7 红(committee x2 的 SignVote 后续 move 流、checkpoint/full_pipeline/unimaker_pay/light_client 依赖链、gov 并行 WIP)为同质迁移长尾,方法学已验证(vrf/fcert/settlement 等 12 条由红转绿),后续按 6d 批量模式继续即可收敛。

## 6h. 收官(DEV-27 全绿)

- 最终矩阵:**DEV-27 27/27、STAGE3-27 27/27**,探针剥离后干净重编复验通过;
- 本轮收官注解:CvtCloneMember、rwad_gov_cert_flow.BytesEqual、dag_ordering.DagOrderCommitSequence、finality_certificate.FcertCreate、ed25519.signEd25519Raw/verifyEd25519(基础版,此前仅 Epoch 变体)、两个 smoke 的 CloneOwnedBytes helper;CommitteeSignVote 改 @borrows+voterPk 克隆(borrow 视图字段不得 move 进 owned 结果);
- 关键机理确认:borrow 实参物化 plain copy 仅允许 address-free 类型;托管类型实参的正确通路 = callee @borrows 后 continue 跳过物化传视图,函数级开关在 materialize 循环头判定;
- 库语义修复两处:RankSelected/SignVote 注释承诺 copies 实为位拷贝,以 CvtCloneMember/CvtCloneBytes 兑现单 owner 契约。

## 6i. RWAD 外围清理战役(goal-da4cc35f)

- consensus wrapper 系列 10/11 转绿:事件局部 let→var(22 处)、localApply 的 event 形参加 var(8 文件)、ConsensusEventPos/@borrows、transfer_apply 的 raw.chengRawbytesGetAt 大小写修正;
- dag_mempool 转绿:DagBlobSummaryFromBytes/DagAvailabilityCertMake/Validate/ValidateShape/CertCid/DagCidSet/lsmr.FixedBytes32Less 批量 @borrows(消除 proofs 数组二次消费的 use-of-consumed);
- RWAD 相关普查 62 文件:**41 绿(此前 31)**;STAGE3-27 与 DEV-27 保持 27/27;
- 另案登记:①consensus_transfer_apply_smoke = canonical ObjectDef origin layout drift(同一物理声明双注册的 semantic owner CID 不等,字段/槽全同,CID 输入含 source_identity_document_cid+token_byte_offset,疑声明 origin 注册时序 bug,var 化后编译走深暴露);②dag_mempool 运行期 rc=1 = lsmr_types.HashInts 被并行会话改为 range-for 中间态(等落定重验);③browser/mobile bridge 工件类 13 个 = CSG snapshot lowering unknown field(非链功能面);④accumulator/bft/serial = 编译器存量解析缺陷。

## 6j. goal-r1(清理战役)进展

- rwad_serial_state_machine_smoke 转绿:RwadCloneNotes/RwadCloneNullifiers @borrows;
- rwad_bft_state_machine_smoke 推进:DecodeTx(ByteSpan borrow 视图实参)/CheckTx/CheckTxBytes/QueryOwner/QueryAppHash 五处 @borrows,残余 FinalizeBlockSummary 的 managed scope preflight 失败(var next = machine 形参拷贝 + 循环 + 写回的数据流模式,preflight 报 dataflow_valid=0)——独立深水区另案;
- STAGE3-27 保持 27/27 零退化,探针剥离后干净重编;
- 余:accumulator 多行 if continuation 解析缺陷、bft preflight、transfer layout drift、dag 运行期(并行 WIP)、bridge 工件类。

## 6k. goal-r2(清理战役):accumulator/bft 双绿

- rwad_accumulator_smoke 转绿:RwadSerialAccumulatorProof/RwadNullifierAccumulatorProof 内的多行值位 if 链(spec 未定义的实验语法,触发 Bug D-2 continuation 捕获对嵌套臂缩进误判 if_indent=27 vs 臂缩进 12)改写为语句级 if/else + 前声明局部;
- rwad_bft_state_machine_smoke 转绿:FinalizeBlockSummary/CheckTx 的 `var next/preview = machine`(从 var 形参初始化托管局部,scope preflight dataflow_valid=0)改为 `var x: T` 声明 + CloneState 字段深拷贝——同时消除 var 形参位拷贝双 owner 隐患;
- RWAD 普查 **44 绿 / 18 红**;STAGE3-27 保持 27/27 零退化;csg_core_merkle_dag 为 timeout 边缘偶发非真红(双口径复验绿);
- 余红:transfer_apply(ObjectDef semantic CID drift 编译器 bug)、dag_mempool 运行期(lsmr 并行 WIP)、bridge 工件类 ~13(CSG lowering 另案)、其余单点。

## 6l. goal-r3(清理战役):transfer_apply 转绿——ObjectDef drift 编译器修复

- 根因定谳(字段级 dump 探针):同一 declaration_origin_row=4 登记了两个对象——canonical=3 是内建 stand-in(intrinsic_owner_kind=BYTES,ensure 路径先注册),index=28 是认领该声明的 parser 声明(intrinsic=NONE);semantic owner CID 输入含 intrinsic kind → 两 CID 必然不等 → alias_identity_equal 失败 → die;
- 修复:cold_canonical_object_identity 在 CID 不等时回退到 cold_object_fields_layout_equal(新增,逐字段 name/type/kind/size/offset/array_len + field_count/slot_size/generic/is_ref/inherited 全等)——同 origin 行即同一物理源行,布局相等即同一声明,合并保持名义安全;
- consensus_transfer_apply_smoke 转绿;DEV-27 与 STAGE3-27 保持双 27/27;
- 注:dev 编译器当前含并行会话 ffi_handle WIP(109 行),曾短暂 segfault 后自行恢复,与本修复无关。

## 6m. goal-178a4ba1 r1:bridge/CSG 类分类与首批修复

- 16 错误全量分类:A) use-of-consumed/borrowed-actual 同族 ~10(smoke 内 helper 与库只读 callee 缺 @borrows);B) body-store-freeze/FunctionContractAdmission/preflight 编译器深水区 5(link_input int32[] authority、plan_report PARAM authority x2、__cold_cheng_malloc ABI recompute、planner partial authority);C) 工具链 fixture 1(manual_link_input Darwin ld);D) FFI borrow 契约 1(mobile_bridge 等 @ffi_handle(argN=borrow) 并行落地);
- 首批修复转绿 2:sabi_string_bridge(assertTextHas)、browser_bridge_artifact_write(browserBridgeArtifactContains);另 WebSceneMediaBlockCacheInit/bridgeHexOf/ReportPathBridgeProbeByteText+RawFlagValue+RawFlagLen/DiagLine/containsText(object_plan)/browserBridgeSmokeDriver/ReadFirstFlagValue/bridgeShapeJson/bridgeHeader/bridgeTotalDataBytes 十余处 @borrows;
- weight tensorName 字面量 owned 化(CloneStr);obj-surface 的 outBin/reportPath/compileLog/bridgeObjectPath 字面量捕获 CloneStr 链推进多层;
- **重要发现**:@borrows 对函数体内存在 `let alias = 形参` 重绑定的库函数(path.cheng PathJoin/PathAbsolute/MkdirP 等)运行期破坏(mkdir 失败),已全部回滚——borrow 视图在体内再绑定语义未定义,属 borrow-view 实现深水区,与并行会话 ffi_handle/borrow view 工作交汇;
- RWAD 普查 **47 绿 / 15 红**;DEV-27 与 STAGE3-27 保持双 27/27。

## 6n. goal-178a4ba1 r2:dag_mempool 转绿 + 内建 runtime exact 注册迁移

- dag_mempool 运行期转绿(双口径):根因是测试对哈希值的隐含顺序假设——实测 HashInts([2,20]) < HashInts([1,10])(B-LESS),assert 硬编码 providerA 在前必假;改为排序不变量断言(FixedBytes32Less(ids[0], ids[1])),lsmr range-for 并行 WIP 实际已可用;
- compiler_csg_manual_consume_lowering 转绿:__cold_cheng_malloc/__cold_cheng_free 旧式 arity-only 注册(param_exact_type_id=-1)过不了 FunctionContractAdmission 重算(stored=-1 vs recomputed=1048576);迁移到 symbols_ensure_exact_external_runtime_fn(exact publisher,带 param_types),保留 existing 分支签名校验;
- C 类剩余 4(link_input/plan_report x2/planner)pauth 定谳:cold_exact_object_storage_obligation_readonly 的 COMPUTING 缓存态把 DAG 共享子对象(Ledger 被 Plan 与 Entry 双路径引用)误判为递归环 → 整链 UNKNOWN → PARAM authority reject;修复方案已明确(COMPUTING 命中改重算+depth 兜底真环),但该区域是并行会话活跃调试区([fold] 探针在位,mtime 静止 <5min),本轮不动防撞车;
- RWAD 普查 **49 绿 / 13 红**;STAGE3-27 27/27,DEV-27 复验 27/27(矩阵瞬时 2 红为并行重编干扰,复测绿)。

## 6o. goal-178a4ba1 r3:borrow 链批量注解推进 + 并行区确认

- weight/vexa/mobile 三链各推进 5+ 层,新增 @borrows 30+ 处:weight_store.LoadGraphFilePath、distributed_engine.DistributedGenerateGreedyDenseTransformerTokens/DistributedLogitArgmaxRow/DistributedAppendTokenIdFill(tokenIds)、model_executor.Execute x2、model_graph.Validate x2、android_bridge MobileHost* 只读访问器全 sweep(18 处)、oracle_asset ValueHash/Verify、unimaker_edge_types.CapsuleKeywordMatch、edge_agent.Recall、publish.LedgerCount、smoke 内 tokensEqual/TokensToString/RunPipeline/SerializeGraph/SignedClaim 家族;mobile selfPeer FFI 消耗点 CloneStr;
- 确认的系统性模式:1) @borrows 需要**沿调用链传播**(engine→executor→argmax 每层都要注解);2) borrow 视图进聚合字面量/add 需要**显式 share 语义**(当前编译器拒绝,属 borrow-view 能力缺口);3) var 形参与 @borrows 共存合法(RegisterPeerHintText/ConnectRegisteredText host:var + peerText borrow);
- 普查 47-49 绿(并行会话重编 pauth 区导致瞬时抖动,artifact_write 复测绿;其 [fold] 探针已收敛,COMPUTING/DAG 修复预期由并行会话落地);
- STAGE3-27 与 DEV-27 保持双 27/27。

## 6p. goal-178a4ba1 r4:并行 WIP 运行期回归立案 + 普查定稿

- obj-surface 运行期 mkdir 失败最小复现:干净 probe 中 MkdirP(clone(root), clone(outDir)) 对合法绝对路径返回 false(手动 mkdir -p 同路径成功)——PathCreateDirAll/DirExists bridge 在当前 dev 编译器(并行 obligation/pauth WIP,cheng_cold.c 高频重编)下存在运行期回归;非 smoke 所有权问题,立案待并行区落定后重验;
- 本轮确认绿:dag_mempool、sabi_string_bridge、compiler_csg_manual_consume_lowering、csg_core_merkle_dag、browser_bridge_artifact_write(列表瞬时红为并行重编抖动);
- STAGE3-27 保持 27/27 零退化。

## 6q. goal-178a4ba1 r5:report_path 与 mobile_cid 转绿

- report_path_bridge_probe 编译+运行全通:main 内 root/hostHandlePath 等全部实参位 CloneStr;cmdline.ReadFirstFlagValue @borrows 后链式传播到内部实现 readFirstFlagValue;注意该 probe 需要 --report-out 参数运行(裸跑 rc=2 是正常参数缺失,非红),带参验证 rc=0 且四份工件齐全;
- mobile_cid_bridge_seam_equivalence 转绿:preflight dataflow 失效的真根因是 bridgeWordOf 缺 @borrows(循环内 text 首轮被 move);补注解后 preflight 通过,单用 text 无需内联;
- obj-surface mkdir 回归继续等并行区(本轮回避编译器文件);
- STAGE3-27 保持 27/27。

## 6r. goal-178a4ba1 r6:普查抖动定性 + 战役收口状态

- 普查瞬时掉到 45 的三个新红(committee_e2e/light_client/rwad_query)经错峰复测全部 rc=0——dev 编译器在并行会话高频重编期是移动靶,普查数字仅在重编静默窗内可信;
- 稳定态约 **52+ 绿 / ~10 红**,残余红根因全部位于 bootstrap/cheng_cold.c 并行 WIP 区(obligation COMPUTING/DAG 误判、borrow-view share 语义、固定数组字段投影、MkdirP bridge 回归、ffi_handle borrow 契约),修复权在并行会话;
- 测试侧可执行动作已全部完成:62 文件从战役起点 31 绿推进至 52+,STAGE3-27 全程零退化;
- goal 转入 blocked:等待并行 borrow-view/obligation 区落定后批量收割。

## 6s. goal r7(自主推进):COMPUTING 重算尝试回滚 + 官方口径定稿

- 尝试解除 COMPUTING/DAG 误判(COMPUTING 命中改重算+depth 兜底):plan_report 上触发编译器 SEGV——并行会话 387 行 WIP 下该 smoke 的对象图折叠在重算路径上不安全(depth guard 未随递归递增或存在真环),已完整回滚,文件回到并行最新态;
- 回滚后 plan_report 仍 SEGV:确认 SEGV 来自并行 WIP 本身(非我方改动),该区由并行会话继续调试;
- 官方 STAGE3 口径(冻结固定点,移动靶免疫):dag_mempool/mobile_cid/sabi/csg_manual 四个源码级修复全绿,STAGE3-27 27/27 零退化终验通过。

## 6t. goal r8(自主推进):MkdirP 回归定性升级

- 分层 probe 定谳:os.MakeDir 单层正常;PathCreateDirSegment 正常 stop 下正常;逐段复刻 CreateDirAll 循环全部成功;但真 PathCreateDirAll false,且 probe 在 PathHostFilePath(strings.CloneStr(p)) 后 SEGV(官方冻结编译器,无并行 WIP);同一 hostPath 的 os.DirExists 在相邻调用间先 false 后 true——runtime cstring 临时生命周期/borrow 视图稳定性 bug,非 path.cheng 逻辑问题;
- 该回归与 @borrows 体内重绑定破坏(r3 定性)同属 borrow-view runtime 范畴,修复权在并行会话;PathCreateDirAll 的 @borrows 已摘除(体内 let 重绑定不安全模式);
- dev 编译器本轮进入整体 SEGV 态(dag 等已知绿 smoke build=139),并行 WIP 中间态,所有 dev 口径验证暂停。

## 6u. goal r9(自主推进):官方口径全量普查定稿

- 官方冻结口径 62 文件普查:**48 绿 / 14 红**(稳定靶);与 dev 口径集合不同属版本差——官方闭包(8/16 烤)既无 obligation/pauth 新检查也无 borrow-view 新能力,部分红在重烤后自然消失;
- report_path 官方口径实为绿(rc=2 是 --report-out 参数缺失);artifact_write 补 outputPath 字面量 CloneStr 后,官方暴露下一层为旧 preflight 对新 @borrows 模式的 dataflow 误报——版本差,不为旧编译器过度适配;
- 收敛预测:重烤官方固定点(纳入 cold_parser drift 修复 + obligation/pauth + borrow-view)后,绿集 = dev 口径 ∪ 官方可迁移项;
- dev 口径本轮仍处并行 [mk]/[w565] 探针活跃中间态(strSubView 调试),收割继续等待。

## 6v. goal r10(自主推进):mobile 链推进 + 链式传播定性收尾

- 并行会话已将 COMPUTING 改为空体重算(INVALID 可重试)——方向与我 r7 尝试一致,但 plan_report 仍 SEGV:确认简单重算不够,需要两阶段折叠/SCM 处理真环与菱形共享,该工作并行会话进行中;
- mobile_bridge 推进多层:DisconnectText/PeerRecordSeed/ConnectKnown @borrows、adhocPeer CloneStr;暴露**跨模块链式传播长尾**(android_bridge→libp2p peerstore→…):函数级 @borrows 需要逐层手追,每层一次编译验证,属 borrow-view 传递性能力缺口(并行区核心工作);
- PathCreateDirAll @borrows 摘除确认(MkdirP 回归归 runtime 层);dev 编译器仍处并行 [mk]/[w565] 中间态;
- STAGE3-27 保持 27/27 零退化。

## 6w. goal r11(自主推进):SEGV 根因修复——递归深度恒定 bug

- plan_report SEGV 根因定谳:cold_exact_object_storage_obligation_readonly 的两处递归调用(qualified/unqualified 名字解析回环)传**常量 depth**,depth guard 永不触发;COMPUTING 改重算后真环无限递归爆栈;修复:两处改 depth + 1(已合入,注释说明);SEGV 消除,plan_report/host_probe 从崩溃转为确定性错误;
- 新暴露层:managed direct read physical source mismatch(typedExprIrCallDeclarationOwnerIndex,column 重复发布/edge_valid=0)与 plain object producer authority——属并行会话 exact-read-source 区([pdef]/[abiedge]/[ev0] 探针活跃,dag 等已知绿 smoke 被其新检查临时压红);
- STAGE3-27 保持 27/27 零退化。

## 6x. goal r12(自主推进):@borrow_result 回归立案 + 双口径终态快照

- 并行会话收尾调试探针(全部清空)并合入 @borrow_result 新注解(csg_normalize/compiler_request/bytes_layout 等);dev 口径 dag_mempool 随即被新特性回归压红:reachable function body missing: layout.ByteSpanSlice——带体的函数被判 missing,@borrow_result 特性 bug,立案并行区;
- 官方冻结口径不受影响:dag_mempool/mobile_cid/sabi 三点复验 rc=0;
- 双口径终态快照:官方 48 绿/14 红(版本差),dev 口径待并行 borrow-view/@borrow_result 落定后重测;
- STAGE3-27 保持 27/27 零退化。

## 6y. goal r13(自主推进):@borrow_result 两层 bug 定性 + 实验还原

- 实验:摘除 ByteSpanSlice 的 @borrows/@borrow_result 后 body missing 消失,但 dag 转而报 managed direct read physical source mismatch(fn=main,edge_valid=0)——与 plan_report 同族;证明 @borrow_result 特性有两层 bug:跨模块 body 拉取解析错位(注解行导致 fn_start 偏移错判)与 exact-read-source 发布缺口(edge_valid=0);
- 实验已精确还原(git status 干净,回到并行提交态);dev 口径 dag 红归并行 @borrow_result/exact-read-source 区;
- 并行会话静默 2 小时(17:38 起),探针全清、@borrow_result 已合入但特性未收敛。

## 6z. goal r14(自主推进):body missing 根因链打通——authority die 的 longjmp 包装

- 最小 repro(src/tests/scratch_bs_probe.cheng 已删)定谳:reachable function body missing: layout.ByteSpanSlice 是**误导性包装**——真实错误是 parse ByteSpanSlice body 时 plain object producer lacks exact result authority die(cold_parser.c:3167)→ longjmp 被 import 拉取路径(cheng_cold.c:77711)吞掉改报 missing;
- [plainprobe] 探针输出:body=ByteSpanSlice pop=2 pk=12(BODY_OP_CALL_COMPOSITE)k=5 etid=5242909 st=1——返回槽的真实构造是 var 局部 + 嵌套字段 store 序列,而 authority 检查的五类合法生产者(独立拷贝/中性/copy/call/constructor/index-read)**未覆盖 var 局部字段逐 store 构造路径**;
- 该检查属并行会话 exact-authority 开发中代码(探针未清),修复方向(新增 field-store 组装生产者类别或修正 def 追踪)需与其设计意图对齐,不越权代写;实验注解已还原(git 干净);
- STAGE3-27 保持 27/27 零退化。

## 7a. goal r6 自动续:官方普查刷新与新红归属

- 官方冻结口径刷新:**47 绿 / 15 红**;较上轮 48/14 新增 compiler_snapshot_lowering_bridge_release_smoke 红:ORC alloc/free imbalance(live_delta=516);
- 归属定谳:该 smoke 直接 import 的 compiler_snapshot_lowering_bridge.cheng 存在并行会话 **2604 行未提交 WIP**(新增多处 @borrows),imbalance 为其 borrow-view 改动在官方口径的运行期副作用,归并行区;
- git 全景确认:@borrow_result 注解已在 HEAD(16:10 提交),工作树另有大面积并行 M 文件(src/core/backend/*、tooling/* 等);bootstrap 三文件为双方混合 WIP;
- STAGE3-27 维持 27/27(上轮复验);我方收割动作保持就绪。

## 7b. goal r7 自动续:artifact_write 官方转绿 + fixture 假红剔除

- browser_bridge_artifact_write_smoke 官方口径转绿:sourceClosurePaths 数组字面量三元素(browserRuntimePath/browserCodecPath/browserProbePath)补 strings.CloneStr——数组捕获 move 与后续调用消费冲突,与 outputPath 同款 share 缺口,测试侧修复;
- browser_bridge_manual_link_input_fixture 判定为假红:3 行 marker 工件(@exportc 导出 marker 函数,无 main),单独 system-link-exec 的 ld 失败是预期行为,应从可执行 smoke 普查口径剔除;report_path_bridge_probe 同前(带参即绿);
- 官方口径真红收敛至 **12 个**,全部归并行 exact-authority/borrow-view/runtime-cstring 区;
- STAGE3-27 复验 27/27 零退化。

## 7c. goal r7 续:MkdirP 官方口径死路双堵定性

- 诊断工具修正:此前 probe 的 SEGV 假象源于 echo(int32) 无重载被错误接受(int 按位转 cstring → puts 解引用崩溃)——echo 仅 cstring 重载,门禁缺口另案;修正后官方口径复测:PathHostFilePath/len/DirExists/逐段 mkdir 全链正常;
- 真 PathCreateDirAll false 的死路双堵:(a) 依赖链函数带 @borrows 时 runtime borrow-view 实现有 bug(r3 立案)→ 运行期 false;(b) 摘 @borrows 改 byval 又被官方 exact consume dataflow preflight 拦截(owned str 传 byval 形参消费断裂,managed scope preflight failed)——两条路均堵死,唯一出路是并行会话的 borrow-view 正确性 + consume dataflow 工作;
- 实验注解已精确还原(path.cheng 剩 5 deletions 为我方 PathCreateDirAll/PathHostFilePath 两处摘除,语义正确保留);
- STAGE3-27 零退化维持。

## 7d. goal r8:收割工具化 + 官方口径新运行期回归立案

- tools/harvest_rwad.sh 落地并验证:一键双口径全量普查 + STAGE3-27 gate,最终收割零延迟;
- 当前快照:官方 48/62(真红 12);dev 口径大面积红——authority 检查当前对所有 ByteSpanSlice 类调用拒绝(dag_ordering 等已知绿亦被拦),并行会话调参中;
- 新回归立案:plan_report/host_probe 官方口径从编译 reject 变**运行期 SEGV(139)**——与 path.cheng 注解无关(还原验证),归并行会话 compiler_snapshot_lowering_bridge.cheng 2604 行 borrow-view WIP 在官方冻结 runtime 的副作用;STAGE3-27 不受影响(27/27)。

## 7. 立案物

- 复现器:`src/tests/orc_registry_miss_repro.cheng`(rc=1 为预期,sha 见 gate)
- bisect:`src/tests/orc_bisect_x.cheng`(X1/X2/X3 单层均 rc=0,证明需跨函数组合)
- 探针:本文件 §2 的 runtime 探针写法(miss 点 dump ptr/head/neighbour;release 全序列 trace + uniq 找重复)
- 业务侧防御:`rwad_bridge_fs.cheng` FileExists 预检 + 字面量 Err;`result.cheng` Err[T] 所有权合同明确化(@borrows + CloneStr,保留)
