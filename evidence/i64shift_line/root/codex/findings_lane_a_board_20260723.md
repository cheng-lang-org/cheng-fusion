# Lane A 五连板对拍快照(2026-07-23 17:5x,主 agent 亲验)

驱动:/tmp/official_new15(16:09 树烤)、/tmp/official_new16(17:10 树烤,含未提交面)。

## 未提交 17:10 树 + official_new16(全红,但闸全部前移)
- pv/sp/canary: provider runtime/core_runtime 编译失败 → `executable call unresolved callee=Int32Ptr`(core_runtime_provider_darwin.cheng:4631,`Int32Ptr(raw)` 类型别名转换被 CSG 当可执行调用且未解析;TypedExprTypeCallKindForExpr 只在 NormalizedExprConstructor 时打 Constructor,别名转换未归类)。
- canary 另一 provider: `call declaration identity drift debug_runtime_provider.cheng:389 fact_signature_line=270 expected_signature_line=0`(身份链校验)。
- rri: `call declaration static argument type unavailable`(rri_id_probe.cheng:25 ParserCollectClosureWithExternalPackageRoots,静态实参类型缺失)。
- rb: `exact parser expression lacks declaration node row=25 source=os.cheng line=61`(parser 声明节点覆盖缺口,正是 lane +810 行在建面)。

## 已提交 HEAD(7e96673f)+ official_new15
- canary: `system link plan: closure exact module identity unavailable index=0`(身份闸,比未提交树更靠前)。

## 结论
未提交面把 canary 从 closure 身份闸推进到 provider typed 解析闸——是前进不是回归。四闸全在 lane 在飞域(parser 声明节点/typed call-declaration 身份/CSG 解析),Lane A 排队等 lane 落定,不在热文件上动手。

## Int32Ptr 闸预诊断(主 agent 只读追踪,18:0x)
调用点: core_runtime_provider_darwin.cheng:4631 `let ep: Int32Ptr = Int32Ptr(raw)`(绑定初始化行)。
- 旧行扫 ParserAppendConstructorExprsLine(:6237)靠 ParserConstructorTypeStatus>0 判构造;Int32Ptr 在 type 块登记(:305 `Int32Ptr = int32 *`,refObject=false)→ 应判 Constructor。该扫扫器在驱动循环 :21680 仍每行执行。
- 但 CSG fact 出来 typeCallKind=None、surfaceCallKind=Local、callResolved=false → 走的是"调用"行。
- 疑点: :21662 的去重守卫 `!lineHasBindingInitializerRoot && !lineHasAssignmentRoot` 只罩住 assignment 追加器,没罩 Constructor/Call 追加器;树路径(绑定初始化 RHS)另 stamp 一行 NormalizedExprCall,Int32Ptr 按函数解析失败 → 可执行调用闸误击。
- 修法方向: 当 RHS 被 ParserConstructorTypeStatus 判 Constructor 时,树路径的 call 行应抑制或改判 Constructor(typeCallKind=Constructor);落点在 parser.cheng 树追加器 + typed_expr 归类,属 lane 热文件。

## rb 闸预诊断(主 agent 只读追踪,18:1x)
报错点 compiler_csg.cheng:15555: CompilerCsgExactExprRowsMarkNonFunctionDeclarationDomain 要求每个非函数域 expr 行带树节点身份(valueExprRootNodeIndex 或 originParserNodeId >=0)。row=25(os.cheng:61 `File = ptr` type 块别名行)两个 id 都 <0 → 旧行扫追加的 expr 未经树 stamp。
- 关联: lane 16:47 新增的 ParserValueExprSetStatementRootDeclarationAuthority 正是管这个的,但 `type\n    File = ptr` 形仍漏 stamp;其消费点 ParserValueExprProcessTypeDeclarationRangeInto(:14792)在 lane 在飞面。
- 探测受阻: 任何 probe 编译都需链 provider(runtime/core_runtime),而 provider 闸(Int32Ptr)未通,树 17:10 状态下无 probe 可编。只能静态归因。
- 修法方向: type 块别名行的 expr 追加器要么不产行,要么经 declaration-authority stamp 树节点;落点 parser.cheng:14792 一带 + compiler_csg 域标记,属 lane 热文件。

## rri 闸预诊断(主 agent 只读追踪,18:2x)
panic 点 typed_expr.cheng:21178: TypedExprCallStaticArgTypesInto 返回 false,9 实参之一静态定型失败(rri_id_probe.cheng:25 ParserCollectClosureWithExternalPackageRoots 调用)。
- 链: 实参逐个走 TypedExprStaticExprTypeAtLevel;简单标识符臂(:20886)→ TypedExprAssignStatementType 查绑定。
- 首选嫌疑(无法 probe 验证,provider 闸阻塞):
  a) 限定类型绑定 `var externalRoots: parser.ParserExternalPackageRoot[]`、`var cEdges: parser.ImportEdge[]` — 模块限定类型文本的绑定解析;
  b) 拼接初始化 `let entry = root + "..."` — let 推断型绑定的类型回填。
- 次选: 该 panic 与 canary 的 `call declaration identity drift`(expected_signature_line=0)同域(call declaration 解析器),可能一根因两表象。
- 修法方向: 绑定类型回填覆盖限定类型与拼接推断;落点 typed_expr.cheng 绑定解析臂,属 lane 热文件(17:41 后静默)。

## canary identity-drift 闸预诊断(主 agent 只读追踪,18:3x)
报错点 typed_expr.cheng:8159: 事实重放校验,fact.callTargetSignatureLineNumber=270 vs 重解析=0(debug_runtime_provider.cheng:389,debug_emit_raw_report 调用)。
- 机制: 重解析 returnType 非空(已进 resolved 分支,否则 :8143 resolved-drift 先击),但签名行产出 0 → 两条解析路径分歧: stamp 时走完整解析拿到 270,校验时走了只回类型不回签名行的快路径(疑似 KnownQualifiedCallReturnType :5634 类硬编码表或 shim)。
- 与 rri 闸同族: 都是 call declaration 解析器两条路径产出不一致。一根两表象的判断成立。
- 修法方向: 统一解析路径或快路径必须回填签名行;落点 typed_expr.cheng 解析/校验双臂,lane 热文件。

## EBNF 映射缺口复核(主 agent,18:2x,数据源 cheng-fusion/fixtures/semantic/ebnf_parser_node_map.json)
现态 124 productions: MAPPED=57 / PARTIAL=59 / UNMAPPED=8(此前盘点 121 项 46/39/36,已大幅推进)。
- UNMAPPED 8 项两簇:
  a) 注解参数六连(13-18 annotationArgs/annotationArg/annotationList/annotationDict/annotationEntry/annotationKey): 通用 list/dict/kv 注解参数语法在语言里未实现,仅 ffi_map 类固定形被文本解析——这是语言特性缺口,不是节点化缺口,959 receipts 对这 6 项只能记"规范未实现"而非补节点。
  b) variant 两项(38 algebraicType/39 variantType): variant 联合类型不节点化,variant 载荷 fieldDecl 默认值除外。
- PARTIAL 59 项是 receipts 增量的主战场,方向与 lane 在飞面一致(parser.cheng 6 分钟 +1000 行的推送即此域)。
- 修正 runbook 阻塞登记: Lane B 缺口从"36 未映射"改为"8 未映射(2 簇,其一为语言特性级)+59 partial"。

## Lane D 收官亲验(主 agent,18:4x)——全绿 + 新误编译实锤移交
- 四证审计抽验通过(pobjp:16-19 import、emitter:374 唯一 build、69580/69873 追加、driver 回执:4893/:8325)。A2 零源码修改判定正确。
- 新误编译(亲验复现): `globalVar = f(arg)` 形丢实参,bl 前无 w0 装载。
  - vararg fixture(`laneD_counter = laneDFib(n)`)run rc=202(应 rc=0);richer fixture primary/backend2 双后端同 rc=202。对照 `let x = f(10)` 正常。
  - 根因: BodyIR call 事实缺 argSlots(action ledger 对拍缺 fixed_kind=1 arg 动作)→ typed_expr/lowering 调用语句实参绑定;与用户九族之首「str 全局←call」同族。
  - 复现件: /tmp/laneD_build/bytecheck/{laneD_vararg_fixture.cheng,laneD_richer_fixture.cheng,*_exe}。
  - 移交: typed_expr/lowering 所属 lane(typed_expr.cheng 18:21 仍在飞);修复后建议把 laneD_vararg_fixture 加运行时门禁(现有 wiring smoke 只验证据不执行,抓不到此形)。
  - 附带 lane 语义差异: primary 对该 fixture 把模块全局 `_laneD_counter` 整体 DCE(.o 无符号定义),backend2 保留往返——非 regalloc 问题,登记备查。
- 重要陷阱(转录): 钉死 driver 与 cold 种子对普通 fixture 回退 cold_subset_direct_macho(full_backend_codegen=0),只有 official 级 full-backend 烘焙才走 Cheng 源 canonical 路径——所有字节级验证必须指明 driver 形态。

## Lane C 补丁落树+集成链全通(主 agent,19:0x)
- 落树: laneC_patch_qualified_find_mem + freeze_disambig 顺序应用于 bootstrap/cheng_cold.c + cold_parser.c(共 +333 行);冷_parser.c 虽被 lane 碰过(17:52)但当时已静默 1h,补丁 hunk 全中。备份 /tmp/cheng_cold.c.bak-preC、/tmp/cold_parser.c.bak-preC。
- vend 集成: HEAD 把 print-symbols 协议串回退成非 v1(cheng_symbols/cheng_line_map),vend 补丁 hunk2 挂;已按当前树 rebase(补 v1 头+cold_collect_function_names 名单),替换 cheng-fusion/vendor/cold-driver/patches/print-symbols-symbol-list.patch(旧件备份 /tmp/print-symbols-symbol-list.patch.bak),build.sh 重建 csg9 成功;print-symbols 实测输出 cheng_symbols_v1 + 精确名单(lowering_symbols=main)。
- 1GiB 验收(树内补丁,vend 形态): emit-cold-csg driver 入口,exact-1GiB 帽 rc=0,RSS 960,036,864B(帽 89.4%),facts 331,770,054B 写出,writer_status=ok。树膨胀使余量从 20% 收到 10.6%,Lane C 次头清单(FnDef 右尺寸/malloc churn/小 join3 站点)是后续余量保障。
- fusion 件帽修正: ROUNDTRIP_MAX_FACTS_BYTES 256MiB→1GiB(cheng_csg_roundtrip_m9003.ts:25);编译器闭包 facts 实测 316MB 超旧帽,旧帽是 fixture 时代的 sanity 界,非语义限。
- 新阻塞(瞬时): lane 18:55 正在写 src/std/crypto/sha256.cheng,emit 读到撕裂字节("trailing tokens [2 bytes]");scratch/官方 vend 二进制同现即证非二进制差异。树落定后重跑 roundtrip 即通。
- 环境坑: PATH 里 DevEco-Studio 的 diff 是残缺 shim(静默无输出,致两次假 SAME/DIFF 判读),本机一律用 git diff --no-index / cmp。

## CSG reader line-map 断链修复(主 agent,19:4x)
- 根因: canonical CHENG_CSG facts schema(kind 0-9)全是对象级记录,无 source/line;而 system-link-exec 的 move-with-line-map 硬要 `<primary_o>.map` → CSG 消费路径永远挂 "Mach-O object move source incomplete"(64MB 预算矛盾排查中发现 cheng_cold.c:92-93 实际重定义 512MB,预算非因)。
- 修法(零 schema 迁移): writer(emit-cold-csg)在写完 facts 后同步产 `<facts>.linemap` sidecar——条目键=写入 function record 的同一 symbol span(cold_fn_object_symbol_span strip=false),行/源=function_bodies source_line/source_path,缺 source_path 即 hard-fail;reader(canonical 分支)在 object emit 后把 sidecar 拷到 `<out>.primary.o.map`,缺失/非法即 hard-fail,禁产无行 map。
- 验证(sha256.cheng 全链): emit rc=0(facts 911KB+sidecar 274 条)→ reader rc=0 system_link_exec=1,object 163KB+map 274 条字节级一致。fusion reader 零影响(不改 schema)。
- 落点: bootstrap/cheng_cold.c writer ~:55114 区、reader canonical 分支 :35076 区;vend csg9 已重建含此修复。

## 特化体 source_path 断链修复(主 agent,20:0x)
- 链: cold_clone_specialized_body(cold_parser.c:8453)body_new 建克隆,packed tables 不含 source 身份,从不继承 → 全量 emit 在 fn=11771(seqs.reserve$g…)挂 sidecar 硬校验。模板重解析路径(cheng_cold.c:37364)显式 NULL 是次级同源(本闭包未触发,触发即被 sidecar 具名抓住)。
- 修: 克隆显式继承 source_line + source_path(有则 arena 拷贝),cold_parser.c:8475 区。
- 验证: 全量 emit rc=0,facts+linemap(2.9MB)齐出,11784 函数过线;附注: emit 既有"closure-wide skip uncompilable body"恢复臂跳过 12 个不可编译体(seqs.Reserve$g…缺体+deferred type-size 泛型绑定未解),事实带名带数,非静默,但与 facts 全闭包覆盖目标有 12 函数缺口,移交 lane 定性。

## 编译器级 CSG roundtrip 全链闭环(主 agent 亲验,20:5x)
- roundtrip success=true,generationId=sha256-11198ef0…,writer/reader exit=0,432s;canonical 切换 fixture→driver 入口: 122 源文件、11,292 函数、14.66M words、18,764 relocs、79,008 callEdges、facts 333MB、对象 59MB+行图 2.9MB。
- csg_query 全闭包亲验: symbol pobj.BuildPrimaryObjectPlanInto → cold:function:2494 真命中;references 查询同通(factsRoot 绑 sha256:ece9c932…)。
- 契约改造(双形状,不炸旧件): m9003+m9000 的目录白名单/artifactHashes/immutability/GC/final-verification 全线接纳 legacy(4件)与 linemap(7件)两形状;sidecar==object map 哈希强一致,散即 hard-fail;summary 22 键不动。
- 查询侧 facts 帽 256MiB→1GiB(m9000:647,注释记理由:完整性靠哈希/形状校验,帽只是防失控)。
- 查询注意: facts 符号是限定名形态(pobj.X),裸名查询空命中属预期,不是断链。

## 节点记录(21:1x)
- lane 19:56 提交 874df1bb(79 文件 +9154/-1668): parser.cheng +2666、receipts +1610、snapshot schema/builder、seven-stage;我方 bootstrap 三件与 codex 台账全部收编,零覆盖。
- 工作树提交后脏编辑(parser_receipt +193)处于半重构态: 引用未定义函数 parserReceiptProjectNormalizedExprIdentitiesForSourceInto("no same-name candidates"),烤机挂——lane 正在线修。
- 应对: 克隆 HEAD 烤 official(纯提交态),五连板以提交态为准;脏区收敛后再对工作树复扫。

## 提交态 874df1bb 五连板(21:2x,official_head 克隆烤)
- pv/sp: provider runtime/core_runtime 失败,内层同为 closure exact module identity unavailable index=0。
- rri/rb: 同闸 index=1;canary: 同闸 index=0。
- 结论: 五连板全红于单一闸「closure exact module identity unavailable」——lane 的 B 通道逐行身份弧未闭(提交后脏区 +197 parser/typed_expr +242 receipts 正在收,21:07 活跃)。Lane A 续排队,下一提交点复扫。

## module identity 闸预诊断(主 agent 只读,21:2x)
- 链: system_link_plan.cheng:2032 SystemLinkPlanSourceRowIdentityInto → :336 在根内路径转 parser.cheng:25628 ParserSourcePathToModulePathExactWithExternalPackageRootsInto。
- 失败面: provider 闭包入口(如 core_runtime_provider_darwin.cheng,根内绝对路径)在该函数的早段守卫被拒——候选: ParserSourceIdentityLexicalPathInto 规范化、ParserManifestNormalizePackageId(packageId=="")、ParserSourceIdentityAppendOwner 登记。B 通道(lane 身份机器)尚在建设,无 probe 可编(全板红),只能静态归因到此层。
- 历史: 7e96673f 已现同闸,874df1bb 未闭,lane 提交后脏区(parser/typed_expr +197)正在此弧。

## identity 闸 trace 精确定位(主 agent,CHENG_SYSTEM_LINK_PLAN_TRACE 实证,21:3x)
- pv 顶层 plan 全程绿(5 provider 注册完成 done);随后每个 provider 编译 plan 停在 before_parse 之后——失败是 per-provider 的闭包身份解析。
- 判定: pv 入口(/tmp,根外)行身份平凡通过;canary(根内)顶层即挂 index=0——凡根内闭包行,ParserSourcePathToModulePathExactWithExternalPackageRootsInto(parser.cheng:25628)必败。
- 对照: 种子 cold_fix1(旧解析器)烤全树 122 文件闭包无恙 → 回归在 874df1bb 提交的 B 通道新解析器,非数据/环境问题。守卫候选: 词法路径规范化/packageId 归一/AppendOwner(:25636-25667 段)。
- lane 脏区(parser/typed_expr +197@21:07)正在此弧,等下一提交点复扫验证。

## identity 闸根因定案 + 真路径当前闸(主 agent,21:5x,诊断 driver 取证)
- 取证: 诊断 driver 错误带运行时值,克隆态暴露 workspaceRoot=/Users/lbcheng/cheng-lang ≠ packageRoot=/tmp/tree_head_probe,双根同 packageId=cheng 触发 AppendOwner:25504 拒重——**克隆 A/B 法的人造产物,非 lane 回归**。
- 真路径(--root 指真树,workspace==package)顶层闭包身份**过**: canary 顶层 plan 绿,挂 provider 编译(runtime/core_runtime/debug/program_support)。
- 真路径当前闸: `compiler parser receipt: normalized expression parser node missing`(compiler_parser_receipt.cheng:5203)——provider 源某归一表达式缺 parserNodeId(function_index=0,7 exprs),与 rb 闸同族(节点 stamp 覆盖),receipt 消费侧。lane 热弧中(parser.cheng +2666/receipts +1610/脏区 +242),避让不碰。
- 方法论沉淀: 克隆对拍会制造 workspace≠package 的双根同 id 场景,今后 A/B 对拍必须把 driverRoot 与 consumerRoot 的包 id 差异纳入判读,身份类闸不能靠克隆复现。

## receipt 节点 stamp 闸嫌疑面收窄(主 agent 静态,22:0x)
- 失败点: compiler_parser_receipt.cheng:5203,provider 源首个体函数 cheng_ptr_plus(core_runtime_provider_darwin.cheng:415),expr_count=7 与切片日志吻合。
- 构成: `base == nil`、两次 `uint64(...)` 转换、`ptr(...)` 转换、`+` 二元、nil 字面量——**原语类型转换调用形态**,与 Int32Ptr 闸(构造/转换归类缺口)同族。高嫌疑: 转换调用 expr 在新树路径未 stamp parserNodeId。
- @importc 声明无体无 expr 行,排除注解读参数簇作案。
- 修法方向不变: 树路径转换调用补 parserNodeId stamp;落点 parser.cheng 树追加器,lane 热弧。

## if 身份 stamp 修复落地+验证(主 agent,22:5x)
- 修法: 新函数 ParserValueExprStampConditionFact(parser.cheng)——行扫 if 行升级为树 Condition 根身份(rootNode+span+role);驱动循环新增 StatementCondition 臂;嵌套单行 if 链按序认领。机制镜像 assignment/binding。
- 验证: 修复版 driver 烤成(official_fix1),canary 真路径 receipt 闸「normalized expression parser node missing」**消除**。
- 下一闸( lane 热弧): `lowering plan: canonical TypeArena proof replay failed`(lowering_plan.cheng:8727)——lane 正在 TypeArena 重写中(lowering_plan 22:47/typed_expr_type_arena 22:40 活跃),避让。
- 修复期间 lane 持续打字(parser.cheng 22:21→22:37),编辑穿插未被覆盖;diagnostic 双件(system_link_plan/receipt)留存树中。

## TypeArena 闸联动确认(主 agent 只读,22:5x)
- 闸: lowering_plan.cheng:8715-8730 LoweringBindCanonicalTypeArenaProofs——把 parser TypeSyntax 根 id 重放成 arena typeId(函数返回+全局声明两支)。
- 联动: lane 未提交 parser.cheng 脏区正是「type declaration↔parser-owned TypeSyntax root 一对一 identity join」——本闸即消费该 join,属 lane 在飞弧正中央,非新缺陷。if-stamp 修复后管线已推进到此,证明 receipt 段已通。
- 处置: 不插诊断(lane 热文件),等 lane join 落地后五连板复扫。

## cold 箭头/seq 三修复 + 真路径闸序收敛(主 agent,23:4x)
- 三修复(bootstrap/cold_parser.c,亲验): ①箭头读侧指针到 seq 字段(str[]*->len/cap/buffer,SLOT_SEQ_*_REF 重标,走既有 seq 臂); ②字段赋值写侧同族(p->len=n,PAYLOAD_STORE 头偏移); ③#97 存储 walker 的对象内联 seq 头终段(obj.pool.len=n)。lane 新码(delete/Clear 两族)从硬挂到全过。
- 快照烤法验证: vend csg9(含全部修复)可作全量种子烤 driver(obj+exe 双通);snapshot 扫描受 workspace==package 约束(driver 的 workspaceRoot 由种子烘焙根决定,与快照根不同即撞 AppendOwner 双 cheng 守卫)——生产板必须真树真根跑。
- 真路径闸序: identity(定案人造)→receipt if-stamp(我修,通)→箭头/seq(我修,通)→**TypeArena(lane 活弧,lowering_plan 重放→backend2 codec,弧在一小时内推进一站)**:真路径仅剩此一族。
- pv 实测(official_fix1,真根): 过 identity/receipt/箭头,挂 TypeArena 重放,同 canary。

## 闸位移追踪(00:4x)
- lowering_plan TypeArena 重放闸**已消**(lane 弧推进);新前沿: `backend2_bodyir_codec_type_arena_cid_zero`(backend2_frag_codec.cheng:381/:875)——BodyIR.typeArenaArtifactCid 未盖章即进 codec,生产侧(typed_expr_type_arena→lowering→backend2)正是 lane 当前弧,pv/canary 同挂。
- vend 种子真树全量烤(driver obj+exe)复通;official_fix3 烤挂仅因 --out 目录未建(同坑两次,已记: bake 前必 mkdir)。
- 快照烤扫法定案不可用于生产板(workspace==package 要求真根);真路径板以 vend 种子真树直烤(/tmp/zargc2/drv.exe 即当前态 driver)。

## 末个跳体族归因(主 agent,00:5x)
- 形: `seqs.reserve$g52a7420506aef975` deferred type-size unresolved generic binding(cold_parser.c:8546)。
- 机制: reserve 体内 elemSize[T]() 降成 TYPE_SIZE op,特化时以 actuals 代 T;嵌套泛型实例化(泛型调用方以自身 T 再实例化 reserve)使 actual 仍是泛型名 → 代不干净即 die。cold_specialized_generic_actual 取不到具体 actual 的已知族,即 lane progress 自登记的「deferred type-size 泛型绑定未解」项——非新缺口,emit 恢复臂按设计跳过,移交 lane 深弧,不在本板。
- 其余 11 跳体均由箭头/seq 三修复消除。

## TypeArena CID 闸消除+新前沿(04:3x,哨兵 round5 首烤)
- backend2 codec CID 闸**已消**(lane 4 小时弧);pv/canary 同进新闸 `plan_not_ready`。
- 细节: ZC_NOT_READY idx=0/1 function=main,body_kind=regalloc_production_emit_failed,detail=call_ordinal=12;data_op_index=-1;data_sub_index=-1——单函数单调用,data op 引用未接。lane 正踞 regalloc_production_emitter.cheng(s1 round17),前沿同点。
- 里程碑: 哨兵首抓静默窗自烤+探闸全链工作;lane 已在用烤机锁(04:17)。

## 并行只读面齐射复盘(07:4x,零编译零碰撞)
- residual_peel: 误报(会话内 MCP server 是 15:35 旧码;工作树已修 schema 对齐)。fresh stdio 探针实测 GREEN(1 hit/3 sites,同前 freeSeq_multi_overload)。
- symbol_diff 定案: 当前合同=头 `cheng_symbols`+精确名单(reader m9000:3239/3734 与 vend 补丁现状一致,我方 23:42 vend 二进制实测输出正确)。RED 根=钉死 driver artifacts/backend_driver/cheng(Jul21)仍产旧 v1 头+摘要行——只能靠收口第 4 步 official 装回重钉,当前被 lane guard 挡,不另修。
- claim_audit: 绿,SILENT_RISK 线索同前(dispatch_loop_continue 簇)。
- 回归日志(151F/504P): variant/enum payload、linkerless、nested_package_import、build_backend_driver 簇,全部 lane WIP 域;我方五修复域(箭头/seq/if-stamp/sidecar/克隆继承)零命中。
- 方法论: 会话内 MCP server 一次性装载不热更,工作树修复必须走 fresh stdio 探针或重启 kimi-code 才能生效——工具判读先分清 server 新旧。

## 并行只读面第二轮(07:5x)
- template_leak_audit: 对落盘 59MB driver 对象 GREEN(invariantHeld,0 泄漏)。
- cheng_evidence(probe): pobj.BuildPrimaryObjectPlanInto 真 facts 绑定返回(.tmp-exec/cheng-carrier-final-csg 的 402026ce generation,lane 自产证据链在轨)。
- orphan_slot_scan: 工具对 59MB 对象 otool -tv 输出超其 maxBuffer(ENOBUFS)——工具侧上限,大对象需扩 cap 或先按函数切片,记录为 fusion 改进项(非编译器问题)。

## orphan_slot_scan 修复+实测(07:5x,fusion 侧)
- 修复(m9020:111): otool maxBuffer 64MiB→1GiB、timeout 15s→120s(59MB Mach-O 实测反汇编 517MB/数十秒,旧限必 ENOBUFS/ETIMEDOUT)。
- 实测(driver 落盘对象,_regprod.RegallocProductionEmitAarch64Function): 31672 insns/4891 stores/10575 loads,orphan 候选(sp+off 未初始化读线索)按工具纪律待运行时证据,不定性。
- 附带发现: _regprod.X 与 _emitter.X 两模块同名 RegallocProductionEmitAarch64Function 并存(工具歧义报告),录 Lane D 审计备查。

## LSP/CSG 实时等价确认(07:5x)
- cheng_lsp_query documentSymbol 对当前 27k 行 parser.cheng 返回全量符号表(含 lane 昨夜新增),LSP 与代码实时等价成立。
- canonical CSG facts 当日生成(11,292 函数),csg_query symbol 限定名真命中/evidence 绑定真 facts。
- cheng_line_map_read pobjp 554 函数行映射全对。
- fusion 工具群 probe 全绿;环境依赖二件: symbol_diff 等收口重钉官方 driver;会话内 MCP server 旧码等 kimi-code 重启。

## 冻结基线(Initial commit ae981f2e)五连板+ZRPC 取址闸归因(09:4x)
- 历史事件: 09:23 仓库历史重写为单根 Initial commit(全量工作落盘),guard 已撤,烤机恢复。vend 种子烤冻结基线 driver 绿(36MB/14.0x)。
- 板: pv/sp/canary=plan_not_ready(lowering_plan.cheng 09:31 lane 在修);rri/rb=ZRPC_PUBLIC_ADDRESS_OF_FORBIDDEN。
- ZRPC 闸归因: parser.cheng:14604 对 `&` primary 一律拒;但后端 pobjp:28626 与 backend2_lower_slots:18830 **显式支持 `&place` 取址实参**(注释原话即以 atomicLoadI32(&a.value) 为例)。合法形=&place(字段/全局/局部 var,借用证明);非法形=&rvalue。std 的 atomic(&a.value)/sync(&m.lock)/intern(&indexHashes) 全是合法 place 形——**闸过宽**,应放 place、拒 rvalue。parser.cheng 09:41 lane 秒级在写,正在此域。
- fixture 双失已按台账重建(pv/sp/rri/rb 全部复原,/tmp/b_verify+/tmp/rb.cheng)。

## vararg 族闸位移(09:5x,冻结基线)
- laneD_vararg(global=f(arg) 形)现挂 `lowering ownership transport: managed ownership class drift`——同族(Lane D 的 global←call 丢实参族)从 regalloc emit 推进到 ownership transport 硬检;int32 标量全局被判 managed 类漂移,疑误伤,落 lowering_plan.cheng(09:48 lane 在写)。
- 三条当前前沿全部在 lane 在写文件: parser(ZRPC &place 闸,14604 过宽)、lowering_plan(plan_not_ready + ownership drift)。等其静默即复烤复板。

## plan_not_ready 根层钉死(10:0x,FAIL_TRACE 取证)
- 真相: canary(return 0,无任何显式调用)同样挂 regalloc_production_emit_failed call_ordinal=12——不是用户码问题;`primary_object_first_missing_call_target_resolution_label=unresolved` 且 `first_zero_call_target=` **空调用目标**。
- 链: 合成调用序(运行时脚手架)第 12 个调用的目标符号为空 → 生产发射器无法落 BL 记录 → backpatch call_bl_reloc_no_fill_record(:68324)→ regalloc_production_emit_failed。
- 性质: call fact 空目标,与 rri「static argument type unavailable」、Lane D vararg「缺 argSlots」同族——**调用事实生产链(call declaration identity)**,lane 正在其上的正是这条链(nodes2_callKinds/call declaration)。全域阻断级: 一切端到端编译都过此点。
- fixture 全灭再修: /tmp 双失后已按台账重建(pv/sp/rri/rb/laneD)。

## 空调用目标最终归因(10:1x)
- 排除: 入口桥 relocs 只占 ordinal 0-3;ordinal=12 在 main 自身调用序。cold 子集(canary emit-cold-csg)main 零调用——12 个合成调用全是 Cheng 源管线注入(运行时脚手架/ownership 生命周期 Init/Drop/retain-release)。
- 定谳: **ownership 弧为裸函数注入的生命周期调用中有一个目标符号为空**——lane managed-consume/cleanup 在飞弧的产物,落 typed_expr/lowering(lane 文件)。canary(return 0)必现,即全域阻断的根。
- 不动手原因: 注入机器是 lane 当前设计域(parser/lowering 09:4x 在写),非过宽闸/非旧缺陷,等其自修。

## bare panic 内建解析落地(13:0x,主 agent)
- 修(bootstrap/cold_parser.c 函数解析层): bare `panic`/`Panic` 本名解析不中时回退 `system.panic`——spec 定 panic 为语言级非结构化终止,树内数百处裸用;typed_expr/lowering 经 import 链能解,零 import 的 ownership_drop_ir 裸 panic 曾致 bake 断链。模块本地 panic 定义仍优先(本名先查)。
- 验证: vend 重建后 ownership_drop_ir 过 panic 点;全量 bake rc=0(含 lane 最新 typed_expr)。
- 当前板: pv/canary=plan_not_ready(ownership 注入空目标,lane typed_expr 12:58 在写);laneD=typed expr node origin proof missing(ownership 执法前移);rb/rri=ZRPC &place 闸(parser:14604 过宽未变)。

## 空调用目标机制全链定谳(14:0x)
- 链: ①ownership 弧给裸函数注入生命周期调用,标 TypedExprCallBuiltin;②compiler_csg.cheng:7712-7736 CompilerCsgNormalizeTypedFactForCsg 对「builtin kind + builtin 返回类型非空 + 非 importc + 非跨源」的调用**清空 callTarget/callTargetSourcePath**;③regalloc 生产发射器仍为其产 BL 机器 reloc;④resolvedCallTargetSymbols[12]="" → emitter 拒填 → backpatch 挂 call_bl_reloc_no_fill_record。
- 性质: **两条路径对 builtin 注入调用的处理不一致**——CSG 认为内建无需目标,regalloc 仍要符号。修法二选一(lane 决策域): 注入调用不标 builtin(给真 runtime 符号),或 regalloc 跳过 builtin-blanked 调用的 reloc。
- 联动: lane 的 nodes2_callKinds/call-kind authority 全天在做 builtin 分类,此闸即其分类决策的直接后果,typed_expr(13:04)/compiler_csg(09:44 静默 4h)在弧。

## 2026-07-24 15:1x 全域阻断 plan_not_ready 根因定案(推翻空调用目标论)

- 现象复核: `plan_not_ready detail=call_ordinal=12;data_op_index=-1;data_sub_index=-1` 的显示字段是 `PrimaryObjectPlanRecordStreamedBackpatchFailure(state, functionIndex, kind, callOrdinal, dataOpIndex, dataSubIndex)` 的形参名; pobjp:69586-69588 实际传入的是 `emission.errorCode, emission.errorDetail, -1`。**call_ordinal=12 不是调用序,是 errorCode=12**。
- errorCode=12 = `RegallocProductionEmitTargetUnsupported`(regalloc_production_emitter.cheng:26), 全发射器唯一 fail(12,-1) 点在 :410-414: `!RegallocProductionTargetUsesCanonicalRegalloc(targetTriple)`。
- 真根因(相位顺序 bug): `BuildPrimaryObjectPlanInto` 全程只有 `PrimaryObjectPlanFillAndCheckPhase`(pobjp:70942) 给 `plan.targetTriple` 赋值, 而 decl-order stream 发射在 `PrimaryObjectPlanBuildItemsPhase`(71482, 先于 fill 71492) 内调 `RegallocProductionEmitFunction(plan.targetTriple="")` → 空串不匹配 arm64-apple-darwin/aarch64-linux/x86_64-linux 三常量 → 每函数必挂, 与函数体无关(吻合 return 0/return 5/let x/let s 四档全挂)。此前「第 12 个合成调用符号映射缺口」为误读字段所致的错归因, 作废。
- 修复(最小): pobjp `BuildPrimaryObjectPlanInto` plan 身份块(71390 后)提前 `plan.targetTriple = linkPlan.targetTriple`; fill 的 70942 变为同值重申。全文件 `.targetTriple =` 赋值点仅此两处, 无其他消费方依赖空串期态。
- 复烤: task bash-tlyy1fv1, vend csg9 种子, 出 /tmp/official_final/cheng。板: pv/sp/rri/canary/rb + laneD_vararg(期望 rc 0)。
- 待办(冻结前): 清理战术探针 CHENG_CSG_BLANK_TRACE(compiler_csg:7724)/CHENG_STREAM_RELOC_DUMP(pobjp)/emitter 空目标打印(:469-473)。

## 2026-07-24 1x:xx 六闸 swarm 战果+arity 断桥修复

- 全域阻断修复后首板: 六夹具闸分解——sp=PlanInvalid(1,1)、rri/rb=ZRPC &place、canary=backend2 CID zero(exe)/payload lifecycle physical free(obj)、pv=cleanup managed identity、laneD=typed_expr origin proof。
- G3(agent-51)落树: pobjp PrimaryBodyIrAnnotateLastManagedValueDefinitionExact 补 valueDefOriginKind/Id+TypeArena proof(漏半身份);残留 R1(owned 局部无 consume 生产侧=cleanup 物化未接线)、镜像缺口 backend2_lower_slots:8585、R0(codex 嵌套包夹具路径被 module identity 闸拒,夹具一律跑 /tmp 副本)。
- G4(agent-53)落树: 裸 var 零初始化 desugared 节点补 synthetic 原点 stamp(TypedExprIrAddDesugaredLeafNode+5 臂);暴露 G7=compiler_csg:19470 TypedIR global parser identity columns incomplete(全局裸 var 触发)。
- G5(agent-57)落树二层: regallocValuePlanFixedInput 的 FactFixed/FactAddress 早退未冻结 operandRegByFact;一层(域外)由我落: pobjp:3650 聚合 align 地板 ResultStrAlignBytes(16)→8(Pair 真 align=8,白名单{1,2,4,8})。登记: plainvar 扰动敏感非确定性(潜伏内存态,单独立项);FixedBytes65 size%align pad 需求。
- G6(agent-58)落树: parser & 闸改 place/rvalue 判别(Identifier/Field 放行,rvalue 维持拒),rri/rb 冷 driver 双路 rc=0;移交 parser_formal_ebnf_admission_smoke:113-116 旧负例断言需属主改 rvalue 形。
- arity 断桥(并行落树的交错): TypedExprIrCanonicalFieldMetaState  callee 加第 10 参 fieldRowOut,pobjp:6242/backend2_lower_slots:150 两调用点仍 9 实参→全树不可烤;已按 typed_expr:36124 同款弃置模式补 fieldRow var 落树。
- agent-48(G1G2 生命周期/CID)遇 provider 403 中断、agent-59(G7+mirror)被手动中断——续跑中。

## 2026-07-24 19:3x 全域阻断#2 定谳(AppendMove 后置断言)+ ORC lane 活跃中

- agent-48/59 双双收官落树: G1G2-B(入口桥 BodyIR 未绑 TypeArenaArtifactCid,pobjp 3 处)、G7(TypedExprAttachStableMetadataToRebuildContext 漏转移 parser-owned 全局 bindings,新 helper+3 接线)、mirror(backend2_lower_slots Annotate 补 origin/TypeArena stamp)。G1G2-A(payload lifecycle physical free)静态审计闭合,探针待运行时数值。
- 新全域阻断(两 agent 独立命中,任何夹具 0.02s 秒败): `typed expr: source context append move postcondition failed column=sourceLineByteStarts column_id=2 refcount=0`(typed_expr.cheng:26232)。
- 机制定谳: AppendMove 协议= `add(out,ctx)`(应 ORC retain,+1) → `ReleaseMovedSourceStorage(ctx)`(freeSeq,-1) → Clear 清零(不释放)。后置读 out[last] 缓冲 refcount=0 ⇒ **add 未 retain**(1+0-1=0),排除 Clear 双放(那会 2-1-1=0 但 ORC 在 0 上 release 必先 panic,未见)。对照 MoveInto(:26034)用结构体赋值(注释自证 ORC-retained)不踩坑。根因=编译器对 `add(seq, 含托管字段的结构体)` 元素未发 ORC retain,托管值位拷贝——AGENTS.md 工程规范 5 明禁形,与「借来 seq 头位拷贝」同族;此前静默存在(postcondition 是 storage lane 今日新加才暴露),吻合 agent-57 登记的 plainvar 扰动敏感非确定性。
- 域判定: ORC/managed retain 发射域。ORC lane 正在活跃(orc_release_failure_fixture/parser/pobjp <20min 有写入,typed_expr.cheng 18:58 后静默),此闸是其当前前沿的必经墙,等其自修;lane 静默超时我接手。
- 主线不因等而停: 转 VSS/fusion 线(不依赖树可烤)。

## 2026-07-24 19:4x 探针清理+admission smoke 修正+九族 item27 状态

- 战术探针已拆×3: pobjp CHENG_STREAM_RELOC_DUMP、emitter 空目标打印(连带清 unused import std/os)、compiler_csg CHENG_CSG_BLANK_TRACE。G5PROBE 经 agent-57 自拆确认零残留;CHENG_BIRC_TRACE(pobjp:70720)系更早既有诊断件,留冻结清单再审。
- G6 移交项落地: parser_formal_ebnf_admission_smoke.cheng:113-116 旧 address_of 负例(&value 必拒=过宽闸编码)改为 address_of_place_positive(&value 收)+address_of_rvalue(&1 拒)。
- 九族 fusion 侧: 夹具(9 族×3 种子)+otool_contract.json+item27 自检均已在包内;[A] 生成器确定性/[B] 契约自洽/tsc 全绿;[C] 红因默认 DRV(ignite_20260719T045700_ed34af)已被系统清除。cheng-f24 幸存 5 个旧 DRV(diag_T66/hunt、ignite_20260720×2、nb_workspace/tree_fin_l、chain46 Jul-16),已派 agent-60 标定重钉+加 NINE_DRV_FIXED 修复代腿(默认 /tmp/official_final/cheng)。
- 树状态: ORC/storage lane 活跃至 19:41(typed_expr +569 行,AppendMove 闸位移至 :26801),probe_bake1 探针烤取证中。

## 2026-07-24 20:0x fusion 静态面回归扫(树热期并行)

- 绿: tsc --noEmit、CID item31(production evidence 待 official)、VSS item30-mutations(变异 100% kill 系)、item23 semantic matrix、item24 pipeline matrix(285336 legal joined/1584 bundles,grammarRequiredMissing=971 诚实挂账)、item28 七阶段 receipt validator。
- item30-integration 红=环境: lane 写 compiler_csg.cheng 触发 input-drift hard-fail(设计行为),冻树后复跑才算数。
- item26 红=EBNF 映射表相对当前 spec 过期(lane 改 spec),已重跑 tools/ebnf_parser_node_map_gen.ts 并联 item25/25H/26 复跑,在途。
- R1 预备(只读): CleanupPlanPrepare(:1546)/CleanupPlanMaterialize(:10546)生产零调用方实证(仅 smoke 测试引用)——canonical cleanup 物化层建成未接线,pv 的 owned 局部无 consume 即此缺口;接线需 consumeActionRow 权威,候选点 pobjp BodyIR 收尾段(待树静默后实施)。

## 2026-07-24 20:1x EBNF regen 也被树热阻断+静默批次清单

- ebnf_parser_node_map_gen.ts rc=1: 内嵌 current_parser_production_receipt_harness 硬拒 "source closure drifted during seed build: src/core/lang/typed_expr.cheng"(lane 写入期漂移检测,设计行为)。item25/25H/26 复跑与 item30-integration 同列入静默后批次。
- 静默守望触发后的执行序列(免重推): ①烤机锁内全量烤 driver(种子 vend csg9,出 /tmp/official_v2/cheng) ②六连板(/tmp/b_verify pv/sp/rri/laneD+/tmp/rb.cheng+canary,exe+obj) ③EBNF regen+item25/25H/26 ④item30-integration ⑤G1G2-A 探针(agent-48 设计,两行,取 payload lifecycle 计数) ⑥pv 若推进至 R1 则启动 cleanup 物化接线。
- bash 管道陷阱再犯两次(cmd|tail 后 $? 是 tail 的 rc): 一律 `cmd > log 2>&1; echo RC=$?` 或 PIPESTATUS。
- item21 zc protocol strict PASS;item14/19 首轮输出被 tail 截断,已按新纪律(全量重定向)复跑,在途。
- item19/item21 PASS;item14 [B3] 绿、[C] 红因 artifacts/backend_driver/cheng 钉死 driver 缺失(仓内已不存在,复验实证)。钉死件是发布面,按收口 runbook 第 4 步由 official 装回时才重建,不提前放临时二进制冒充;item14[C] 列入 official 装回后复跑清单。

## 2026-07-24 20:4x 九族 item27 复绿(agent-60)+tsc 管道陷阱纠偏

- DRV 标定(5 候选全冒烟过): t66 与 chain46 完全吻合「③⑤⑥ RED、其余 GREEN+契约过」;三个 Jul-20+ DRV 在 str_global_call_rhs 契约形变(codegen 已演进)。选定 chain46 d57e51(ignition 链 provenance,sha256=8c6d94d1…),t66 同形备选。
- item27 改造: NINE_DRV 重钉 chain46;新增 [C-fix] 修复代腿(BAIL 如实记、编译过则运行+契约双绿才算绿、driver 缺失记 MISSING);[D] neg rc=2 ✓;[E] RSS 门两夹具 peak 108.7/108.9MB≤256MiB、负对照 16MiB 咬 rc=137 ✓。matrix.json 未改(实测与 expectRc 无矛盾)。
- 修复代腿实测(重要): 9 族夹具在 /tmp/official_final/cheng 上全 BAIL——2 族 ZRPC 裸指针门 rc=2(narrow_deref/addrof,后者正是契约 expect_bail_on_fixed 期望形),7 族各类证明门 rc=1。无误编译样本;生成器惯用形与当前严格证明门已脱节(生成器过时 or 门禁过严,下一棒定夺)。
- tsc 纠偏(诚实): 包内从无 tsconfig.json,裸 bunx tsc --noEmit 拉 TS7 打 help 且 rc=1——我此前「tsc 绿」是 `| tail` 管道陷阱把 tail 的 rc 当成 tsc 的。正确口径=钉死 tsc(ts-csg/node_modules/.bin/tsc --noEmit --strict …,实测 rc=0)。同陷阱已三次,一律改全量重定向。
- NINE_DRV_FIXED 已 cp 到 vendor/drivers/official_final_20260724_cheng(sha256=004534fa… 与报告一致)并改钉持久路径,防 /tmp 清除。
- item27 重钉持久 vendor 腿后复验 rc=0 全绿;lessons.md 增两则(诊断字段名≠实义——12=errorCode 非调用序;bash 管道吞 rc 一日三踩)。

## 2026-07-24 20:1x 静默批次预备(锚点+接线形)

- G1G2-A 探针锚点(当前行号,会漂移,以名为准): BackendDriverDispatchMinCompilerCsgLifetimeFinish(dispatch_min fn:2465) 与 BackendDriverDispatchMinLoweringArenaLifetimeEnd(fn:2605)。探针插两个 fn 体内 lifecycle End 调用前(单点覆盖全部 call site:2465 被 :2531/:2544/:2565 调,2605 被 :8038/:10446/:10472 调),打印 expected(got) buffer 数/字节对,一次 canary obj 编译读出哪个生命周期、差额与方向。
- R1 接线形(smoke 实证 idiom,cleanup_cfg_defer_contract_smoke:1472-1501): CleanupPlanPrepare(plan,limits,0)→BindLocalSchema→CaptureFragment/AddScope/RegisterDefer(或 QueueOwnershipExit)→逐 CFG 边 QueueUnmanagedExit→CleanupPlanMaterialize(body,plan)→report.released 校验。生产接线点=pobjp BodyIR 收尾(发射前),scope 树镜像词法域、exit 按 CFG 边 queue;consumeActionRow 权威=odir 分析的动作行,primary 侧禁自造 id。
- 守望换 3h 长窗(bash-gkkts68c)。
- deterministic-memory-lifecycle.md(lane 当前弧蓝图)佐证: ①同一 payload 被 system_link_exec:1524+dispatch_min:4257 与 lowering 内三处重复 release,严格 ledger 必判重复释放——与 G1G2-A(physical free receipt incomplete)高度疑似同根,探针取证时先核重复释放方向;②lane 计划「唯一 cleanup owner」原子接线,即 G1G2-A 的根修可能由 lane 弧自带,我侧只做验收不抢修;③语言级 ORC 全出口释放合同同弧,R1(cleanup 物化接线)正是其生产接线面,等 lane 收敛后按 smoke idiom 验收。
- 九修复完整性核验(lane 连写期): targetTriple=2/align8=1/G3 proof×2(pobjp+b2 镜像)/bridge CID=1/G7=4/G4=6/G5 freeze=1/fieldRow×2/探针=0——全部在位,零被覆盖。
- 21:0x 批次试探①: BAKE_RC=2,仍是 lane 撕裂写(lower.LoweringC5FieldTypeFromSourceText body 缺失,C5 field-type helper 在写)。批次脚本可用,改回纯守望触发,不再手动探。

## 2026-07-24 21:4x 九族 fixed-leg 合法面变体收官(agent-60)

- 变体×2: narrow_deref_fixed(uint8 序列元素读→ldrb 指令级契约,expectRc=90/176/195)、addrof_scalar_root_fixed(std atomic StoreI32/FetchAddI32 内部 &c.value→&place 合法面,红码 81,expectRc=45/29/49)。
- 生成器接线(semantic_gen GENS 注册 13 族×3 种子=40 文件,--check 字节级过);matrix +6 条目原 33 条目不动(rng 按族名 key 互不扰动);契约 +2 fixedLeg 注解(ldrb 指令级仅 fixed-leg 适用、原 checks 仅钉旧 DRV 回归,strength 如实分级);item27 [B] 交叉校验+[C-fix] 变体接线。
- 验证: semantic_gen --check rc=0、pinned-tsc rc=0、item27 全量 rc=0([C] 九族旧 DRV 模式不变;[C-fix] 变体 BAIL 如实记——vendor fixed driver 烤于 &place 收窄前,std/atomic 自身 &a.value 被其旧 CSG 拒,待收敛 driver 替换 vendor 件后断言自动生效);变体良构性经 chain46 实证(编译运行绿+契约非空置)。
- 遗留: narrow 变体运行时判别力有 mod-256 高位盲区(权威归 ldrb 契约);addrof checks=weak-proxy(权威归 expectRc);fixedLeg.expectRc 只钉 s1。

## 2026-07-24 21:5x 静默批次首轮战报+全域阻断#3 定谳(门禁已随 lane 前移)

- 静默信号 21:47:45 触发(后知:守望只盯 src/**/*.cheng,漏 bootstrap/*.c——lane 21:53 还在写 cold_parser.c,静默是局部假象;宽域守望已补挂)。
- 批次①②: BAKE_RC=2,非撕裂——csg9 的「managed assignment lacks exact source」新闸拒 dispatch_min:531 `blockerArtifactPath = chengpath.PathAbsolute(rootDir, requestedOutputPath)`(gate_blocker 报告块,lane 15:17 后新码,official_final 二进制 strings 实证不含 gate_blocker_id)。
- 批次③: GEN_RC=1(receipt_driver_a build 同族闸「managed consumer call source is not exact」)、I25 连带红、I26 连带红、I25H 绿。
- 批次④: I30INT_RC=1(production binding gate 同根)。
- 机制定谳(mgate_probe×2): 同模块调用结果 var 重赋值过(rc=0);**跨模块调用(chengpath.PathAbsolute)结果 var 重赋值必现闸**(rc=2 同文),let 初始化跨模块调用过——csg9 跟踪缺口=「导入调用 RHS 的 provenance 不随 var 重赋值继承」。
- 关键转折: 当前 bootstrap/cheng_cold.c(21:32 被 lane 改)已不含该闸文本——lane 已拆/改此闸(cold_parser.c 现存的是 borrowed root/borrowed binding/share(value)/bind move/destination layout 五个细化版)。即阻断#3 的修法已在 lane 手上推进,我侧动作=等宽域静默→重建 vend 种子(build.sh)→重跑批次,不抢修。


## 2026-07-25 00:4x vend 种子重建+阻断#3 机制探针(P1-P4)+撕裂快照教训

- vend 种子已从 22:26 bootstrap 快照重建(rc=0,GEN2=GEN3 原始字节相等,receipt 在位)。阻断#3 复验:**新种子仍拒**跨模块调用结果 var 重赋值,同签名 result_slot=-1 result_def=-1。
- 机制探针(mgate_probe×4,/tmp 夹具,新种子实测): 同模块调用 RHS 重赋值=过;导入别名叫(`chengpath.PathAbsolute`)直接 RHS=拒 rc=2;**括号包一层仍拒**(排除 17266 发布路径旁路);**`let t=导入调用; s=t` 过**(绑定期 stamping 正常,门本身接受 exact local)。结论收窄: 导入调用的 ColdExprResult 在 cold_managed_call_result 早期 return(或 result_out 未接线),绑定期另有 stamping 路径;list 排除法已排除 sink invalidate/门过严两假说。待 bootstrap 静默后仪表化(zz-mcr-debug.patch 已备在 /tmp/mcr_dbg,故意移出 vendor/patches 保 receipt 诚实)。
- 教训①(lane 活跃期快照必撕裂): cp 爆发拷贝 bootstrap 撞上 lane 00:41-42 连写 cold_parser.c/cheng_cold.c,编出 cold_fnv1a_u32 未声明=典型撕裂读;build.sh 的 source before/after drift 闸如实硬拒——该闸设计有效,勿绕过,等静默再烤。
- 教训②(PATH 污染): OpenHarmony DevEco toolchain 的 diff 遮蔽 /usr/bin/diff(无 -u),生成补丁一律 /usr/bin/diff 绝对路径;patch/cc 未受污染(已核)。
- 守望分工: bash-sa4fk6be 盯 bootstrap-only 静默(种子重建触发器);bash-28axtxfx 盯 src+bootstrap 宽域静默(全量批次触发器,3h 窗将尽,超时即换班)。


## 2026-07-25 03:3x 静默窗口战报: 阻断#3 已修(致谢 lane), 新全域阻断#4 定谳(STR_REF 读缺三连)

- 静默: 树 03:07 停写,03:17 双守望确认(src+bootstrap 均静默 10min)。
- 阻断#3 修复实证: 种子 d70c3a84(自 03:07 bootstrap 烤,GEN2=GEN3)四针全绿——同模块/跨模块/括号/let 均 rc=0。「managed assignment lacks exact source」闸及其 provenance 缺口已被 lane 修掉。
- 新阻断#4(烤机首撞 dispatch_min:463): `let seed = out`(out: var str)→ die "managed binding layout is not owned"(cold_parser.c:23359)。仪表化种子取证: kind=11=SLOT_STR_REF, place=3=PARAM, own=4=BORROW_UNIQUE——RHS 裸引用未物化为 owned str 值,绑定期 exact-owned 闸硬拒。22:26 旧种子过 :463(败在 :531),证明系本轮精确化改写引入的回归。
- 探针矩阵(全 /tmp 夹具,新种子实测): `let x=out`(var str 参数)=拒;`s=out` 赋值=拒(另一闸 "managed assignment exact kind mismatch", kind 11 vs 3);`return out`=拒(第三闸 "share(value) source kind is unsupported");`len(out)`=过(内置特判);**by-value str 参数全形=过**(编译+运行端到端)。结论: var-str 参数按值读取在 binding/assignment/return 三条路径全缺 STR_REF→STR 物化臂,仅 builtin 特判路径幸存。最小复现 /tmp/gate6_repro.cheng(7 行)。
- 判定: lane 域(exact-binding 新机械,其 03:07 前连改 4h+),不抢修、不降闸;待 lane 补齐 STR_REF 物化臂(参照 23333-23345 的 I32_REF/I64_REF 臂先例)。
- 我侧并行: EBNF regen③/item25/25H/26/item30④ 与烤机无依赖,静默窗内先跑;宽域守望续盯,树再静默或 lane 复写即知。

- 03:28:44 lane 复写 cold_parser.c(单文件,疑似定点修闸——刚好处在我板报 STR_REF 证据发出后)。EBNF regen③ 被 drift 闸如实中止(设计行为,非失败),宽域守望 v3 已重挂(bash-963hq9d2),下次静默: 重建种子→STR_REF 三针复验(gate6_repro/probeB/probeD)→过则全量批次。


## 2026-07-25 04:4x 四路代理审计合成(fusion 静态/VSS/CID/性能门)

**fusion 静态面(agent-67)**: 24 绿(tsc/item23/24/28/30mut/31 等全保)。9 项连带红全属「钉哈希 vs 树漂移」与 stage3 新闸咬旧件,冻结窗重钉即消。需注意的 lane 改写连带: ①stage3 消费检查器咬树内 smoke(semantic_snapshot_core_smoke:1 "use of consumed managed value def=0 consume_op=3 expression=identity",同族 f47_probe_seq_fnvalue "Ok value size mismatch");②bootstrap/bodyir_packed_slab_test.c 运行时断言 "obsolete growth slabs remain accounted" rc=1;③ZRPC/SABI v2 闸拒 program_support_backend.cheng:1307(str 返回直曝)。item2 1ms 超时前提是 fusion 自身 flake(暖态 <1ms),与树无关。

**VSS(agent-68)**: production_closure 静态面 19 项精确合同全 true,唯一 blocker=no_published_candidate_evidence。但 atomic_publish 运行时三门 RED(消费检查器+borrowed reborrow+reachable body missing),即计划外第 0 位 blocker:stage3 当前编不过自家 gate 夹具。missingFactBitmap 实勘:509 已降至 381(128 DependencyProof 已闭合,builder:9142),LSP smoke 期望 336(TypedNodeProof16+LexicalScope64+DiagnosticProof256)但可能已过期。收口链 A0(修编译失败)→A1(冻结)→A2(补 proof producer)→A3(official+runPublishedCandidate)→A4(30×30)→A5(等价)→A6(性能)。

**CID(agent-69)**: CID_RED 产物缺位。evidence.json 全盘不存在;producer(tools/cid_linux_identity_chain_evidence_producer.py)需 Linux cgroup v2 宿主+x86_64 ELF candidate+冻结 fusion 三件 sha——macOS 宿主不可能,colima 容器不算数(gate 跑宿主)。冻结常量(schema.py:19-21)与磁盘 fusion 件已不匹配,冻结窗需重钉。审计工具链本身三项负路径验证正常(fail-closed)。

**性能门(agent-70)**: 门工具链就绪(regalloc_production_gate.sh 9129 行,--self-test PASS,常量与计划 §5 一致);fixture 11 件、exec_diff corpus 恰 209、clang 21、stage3 均在。阻塞全在 driver/identity/锁/冻结:artifacts/backend_driver/cheng 缺失、/private/tmp/regalloc-release 不存在、四锁全缺、树 445 dirty。历史基线 RSS 1.97→2.46GB 与 1GiB 硬门有量级冲突,靠内存车道下台阶。Linux AArch64/x86_64 真机环境未登记=独立缺口。附: fusion matrix defaultRoot 指向已不存在的 cheng-f24/tree,调用须显式传 root。

**关键路径判定**: A0(stage3 编不过自家 gate 夹具,含 STR_REF 三连+consume 检查器咬 smoke)是当前唯一全局瓶颈,全在 lane 域。我侧全部剧本/守望/资产就绪,等 lane 收敛+冻结窗。


## 2026-07-25 05:4x wave-2 收官: fusion 两修落地+CID 证据终局判定

- agent-71(fusion 小修): item2 flake 根修——真根因是 line_map_read 已改纯本地读、根本不 spawn cheng-lsp,旧「spawn 必超 1ms」前提整体失效;改测 cheng_lsp_query(documentSymbol@lowering_plan)双保险前提,3×rc=0,断言零放宽。死根路径 4 处(matrix.json/m9018/run_ignition_probes.sh+注释)全改 /Users/lbcheng/cheng-lang,111 fixture 零缺失,残留 grep 零命中。遗留: 包级缺 @types/node,钉死 tsc 对引 node:* 的非 nocheck 文件恒 rc=2(既存水位,冻结窗一并定夺)。
- agent-72(CID 搜寻): **六例 Linux CID 证据从未存在**(非清除/他机)。13 次历史尝试(2026-07-23 cheng-cid-current-source-*-v1..15)全部死在 candidate bootstrap 构建(12 次种子报 reachable function body missing: pobj.PrimaryBodyIrAppendCallOp——与 A0 同族),从未到六例生产。CID 闭环硬前提=Linux cgroup v2 宿主+A0 修复+冻结窗重钉 fusion 三件 sha,本机(macOS)不可达,colima 容器不算数。
- 静默窗剧本已补齐第三段: /tmp/post_silence_fusion_batch.sh(EBNF regen→item25/25H/26→item30-integration),与前两段(seed_rebuild_and_probe/post_silence_batch)衔接成全自动链。


## 2026-07-25 09:0x 快照路线首轮战报(不等静默,直接推进)

- 方法: 整树快照 /tmp/tree_snap1(3872 文件,src+bootstrap+docs),手工 cc 烤快照种子,所有验证在快照内闭环,lane 写真树零干扰。两个环境教训: ①源文件必须在 root/src/ 下(cheng_cold.c:1438 包根闸);②--in 相对路径优先按 CWD 解析,快照跑必须 cwd=快照根。
- **STR_REF 三连已修复实证**: 快照种子八针全绿(阻断#3×4+阻断#4×3+对照),lane 在 03:28 后的 bootstrap 改写补齐了物化臂。
- **A0 当前形(唯一剩余全局闸)**: consume 检查器拒 compiler_csg.cheng 的 CompilerCsgReachableNameIndexAppend——by-value str 参 functionName 三次使用(IndexSlot/add/KeyCertificate)被判定先消费后使用,函数体被丢→下游 reachable function body missing。烤机、EBNF harness(receipt_driver_a build)、凡拉 compiler_csg 闭包的路径全撞此一点。同族旧烟(semantic_snapshot_core_smoke expression=identity)证实该检查器对改写前合法码也开火,但 lane 新码亦可能真违例(add 消费语义在迁移中)——归属 lane 定夺,证据: /tmp/snap_official/bake3.log、compiler_csg.cheng:14071-14089。
- **链健康(快照实证)**: canary 编译+运行+exit 0 全通;plainvar(rc=6)/struct_probe(rc=1)/laneD(rc=0) 编译运行通;rri_id_probe 撞「exact identity schema [body-store-freeze] fn=ParserWriteSh」、rb 撞「runtime symbol signature mismatch cheng_mem_release」——均 lane 内存 ABI 迁移中间态,与 consume 闸不同族。
- EBNF harness 对快照根的环境接线已打通(CHENG_ROOT+三 env 覆盖),唯一卡点同为 consume 闸。
- 下一步: lane 修 consume 检查后重快照复验;真树静默窗仍按原三段剧本做发布级证据。


## 2026-07-25 09:1x consume 闸定谳: 检查器符合规范,lane 已在实时修

- 判别探针实证(快照种子): P1 `add(names,x);add(names,x)`=拒(exact point liveness);P2 `g(x);h(x)` 普通调用复用=过(run=5 全对)。即**仅 add 容器写入被记 move**,普通 by-value 复用不罚。
- 规范锚: docs/cheng-formal-spec.md §0.2「默认 move:赋值/参数传递/返回默认移动所有权,后续使用需显式 share(x)」「容器写入须 share 或 Owned 新值」「不做隐式拷贝」。consume 检查器是规范执行器,**不是误报**;旧编译器对 add 隐式 share 是历史违规范实。
- 修形=复用点补 share()(如 compiler_csg.cheng:14080 `add(index.functionNames, share(functionName))`)。我侧沙盒补丁未落即发现 **lane 已在真树自修同一行**(08:57 rsync 实证)——lane 正在实时烧 consume 错误清单,快照引擎 15min 探针跟进度,闸开自动全量。
- 注意面: 全库 add-复用点存量大(smoke 群同族),烧单可能要数小时;引擎 rss/周期已按 24h 设计。

- 10:0x 烧单前沿推进(快照引擎 v2 直探 bake): compiler_csg consume 错误已清,现卡 typed_expr.cheng 的 TypedExprIrAppendUnrepresentedTopLevelBodyStatements——体内多处 exact point liveness failed→「managed scope exit ownership dataflow is invalid」(CFG 块级所有权数据流校验,非单点 share 补钉),body 被丢→reachable missing。即 lane 的检查器数据流分析与源码互磨中段,引擎 12min 轮追踪。


## 2026-07-25 14:2x wave-3 收官: 全量 smoke 普查基线+rri/rb 精确现场

- **普查(agent-75,1287 个 smoke 全编译)**: GREEN 360 / CONSUME 258 / REACHABLE 267(多为下游)/ OTHER 400(exact identity schema 60+、field replace authority 17、duplicate WebDocument 17、cold call ABI 16、Darwin provider 真链接缺口 19)/ STR_REF 仅余 2。烧单基线表与复跑脚本落 /tmp/census/(filelist.txt+run_one.sh,GREEN 只许增)。STR_REF 余 2: cold_exact_partial_init_overwrite_borrow_smoke、unimaker_edge_agent_sync_smoke。
- **rri/rb(agent-74,真树 14:18 代)**: 两闸均 lane 内存 ABI 迁移中间态,夹具无责。rri=cold_parser.c:26007 双重消费(parser.cheng:30545 ParserAppendImportEdgeDirectWithExternalPackageRoots,PARAM 槽 op57 消费后 op615 再消费);rb=cold_parser.c:26303 Result[Bytes] move-return 未入 exact 簿记(os.cheng:1598 readFileBytesResult 返回解析成空哨兵)。cheng_mem_release 签名闸已被 lane 迁移越过(arity=1/void 对齐)。取证期间 lane 连改 bootstrap 四代,烧单节奏正猛。
- 引擎 v2 最新: round18 前沿已进 dispatch_min:6131(闭包末端)。

- 15:5x 烧单前沿(引擎 round24-27 同一闸): dispatch_min.cheng:3715 BackendDriverDispatchMinReadKnownFlagOrDefault 的 `return out`——out 经 var-param out 写(`BackendDriverDispatchMinReadFlagCodeInto(code, out)`)产生,return 路径 exact 簿记找不到 value_def(parsed_*=-1)。即「var-param out 写作值源」未入 return 精确簿记,与 rb(Result move-return)同族不同形。
