> **口径迁移（2026-09-08 用户令）**：内存模型理论极限=768MiB=805,306,368 bytes；本文历史 1GiB/1073741824 为迁移前口径，当前守卫与验收一律以 768MiB 为准。

# Cheng 语言生产就绪统一闭环

状态：`applying / user confirmed 2026-07-23`。

本提案把以下既有 applying 提案收敛为一个发布终点，不替代其详细合同：

- `versioned-semantic-snapshot.md`
- `deterministic-memory-lifecycle.md`
- `regalloc-production.md`

正式语法与语义唯一权威为 `docs/cheng-formal-spec.md`。任何历史 PASS、未绑定
当前源码的 driver、contract-only receipt、用户态 RSS 采样或双后端自洽均不构成
生产完成。

## 唯一数据流

```text
formal EBNF
  -> parser-owned Declaration / TypeSyntax / Pattern / Annotation Arena+SoA
  -> immutable TypedExpr type/value-def/ownership authority
  -> canonical semantic snapshot
      -> event-driven LSP/query/debug/incremental fragments
      -> canonical Ownership/Init/Drop + CFG cleanup
          -> BodyIR
          -> canonical regalloc
          -> primary/backend2 independent object receipts
  -> seven-stage real receipt
  -> RELEASE_GREEN
```

所有跨节点身份使用 `int32` 行索引与 domain-separated CID。源码文本、行号、
name+arity、对象地址、裸指针和 post-seal source scan 只能作为被拒绝的旧路径，
不得参与生产决策。

所有 schema、producer、consumer 和 runner 只保留无版本后缀的唯一 canonical
文件与字段集合。破坏性升级原地原子迁移全部读写方；禁止 `v1`/`v2` 平行文件、
后缀、双写、兼容读取或版本字段分流，旧字节因字段/CID 不匹配直接拒绝。

## Apply 分片

| 分片 | files | action | verify | done |
| --- | --- | --- | --- | --- |
| G0 冻结基线 | 本提案、任务/进度/发现账本、Cheng/Fusion source manifest | 选择无并发写入窗口，锁定两仓源码、规范、工具、driver 与依赖闭包；运行中任一字节漂移整轮作废 | 前后 source manifest 完全一致；组件门与 LSP 阶段逐边界闭包一致；组件超时无存活子进程；无外部重编译占用生产门资源 | applying：acceptance harness 已在首组件前、每个真实组件完成后及 LSP 阶段完成后重算精确 workspace closure，闭包同时绑定内容与 dev/inode/mode/link/mtime/ctime，首次漂移立即终止后续阶段并保留边界 manifest；每个组件在独立 session/process group 内运行，超时一次性捕获当时活跃的 descendant tree 后同时杀进程组和已脱离 pgid 的后代。合同测试证明漂移后下一组件不可执行、同字节不同 inode 也不可复用 CID、另建 session 的活跃超时 child 也不存活。正式冻结尚未开始 |
| G1 EBNF 权威 | parser、parser receipt、Fusion EBNF map/corpus/mutation | 映射由正式 EBNF、parser producer 与真实 receipt 生成；闭合 TypeSyntax、Pattern、Annotation 及其 owner/span/child/value-def | `UNMAPPED=0` 且 `missingRequiredCount=0`；全部 required obligation 有 parser-owned witness；mutation 可稳定打红 | applying：自动真值 `125=0 MAPPED+125 PARTIAL+0 UNMAPPED`、`required=971`、`witnessed=0`；producer declarations 已对齐 Pattern/TypeSyntax/generic/Optional/Conditional。production harness 在 seed/driver 构建前严格锁定 125 productions、971 obligations、29 sources，124/970/28/30 mutation 全拒绝；但 official current driver/build binding 尚不存在，故没有 accepted 双 driver receipt，production witness 仍为 0 |
| G2 snapshot | canonical schema/cargo/validator/builder、CompilerCSG、LSP | 单 schema 原子迁移；完成 Decl/Type/Symbol/Function/interface/reference/scope/dependency/diagnostic/fragment authority；事件驱动增量 publish | `missingFactBitmap=0`；真实非空多文件 `published=1`；六查询、30×30 冷对拍、object/run/debug/ORC 等价 | applying：唯一 latest `schemaVersion/semanticEpoch` 已进入 schema/cargo/store/query pin；23 行 cargo/wire、GenericParameter、annotation target、Type→parser-generic、exact TypedExpr/value-def TypeId 均已接线。resolved-call 由 CallExpr 的 exact `callDeclaration` row 投影 target source-local parser declaration、DeclId/DeclKeyCid/SymbolCid，result TypeId/ownership 与 target CID 共用 strict proof，bit32 已清零。LSP hot pin 已删除 per-request projection 全表 strict scan，只消费 publish-admitted immutable index 并核对 CID/shape。production publish 未完；最近动态尝试因源码漂移或 cold 所有权红点作废，当前没有可引用的 bitmap/publish 回执 |
| G3 memory/ORC | lifetime ledger、TypedExpr ownership、cleanup CFG、lowering/BodyIR、双后端 | 账本记录真实物理 owner；canonical Ownership/Init/Drop 经所有 cleanup edge 与 typed drop glue 进入生产发射 | 所有成功/失败路径 `live=0`、`alloc==free`；Linux cgroup v2 aggregate hard 1GiB | applying：ledger storage 物理释放、cleanup consume-op/debug 重基、StoreOwned captured-old CFG definition 与 owned sret exact CallOp/BodyOp/ReturnTerm authority 已通过；direct managed sret 的 global/container 合法表面语法都已生成 `CALL_COMPOSITE → STACK_LOCAL COPY_COMPOSITE → PAYLOAD_STORE` 精确链，Darwin 动态 5000 次 alloc/free=`5000/5000`、live=0。lowering allocator 已按 capacity epoch 接入多组 SoA family，current 机械未覆盖降为 `80 = 66 add + 13 setLen + 1 reserve`。defer 最终 binding/CFG liveness 与 ref referent mutability 已推进真实首红；mutable copy-out 仍缺 BORROW_UNIQUE/owned authority。其余 allocator、失败路径统一释放、official ORC 与 Linux hard cap 仍未闭合 |
| G4 regalloc | BodyIR access/CFG、canonical allocator/emitter、primary/backend2、Fusion preflight | 只允许 `body_ir_adapter`；双后端分别消费冻结 plan/action/fragment 并发真实对象字节回执 | 七阶段真实 receipt、209+ exec-diff、jobs 1/N、16×3 target emit、GEN2/GEN3 原始字节固定点 | applying：FunctionId/kind 已进入 frozen、双后端、driver、对象与七阶段 hash，普通函数/entry bridge 重复消费可拒绝；旧 predictor/task-local fill 已物理删除。Linux x86_64 scalar、内部 direct call、stack args、conditional sret、精确 forward-entry-sret bridge 与冻结 CFG 已消费同一 action/fragment，生成 `E8/E9/0F8x rel32`、`call r11`、exact byte target、critical-edge trampoline、reserved+caller-clobbered R11 copy-cycle、hidden `RDI` sret、AddressHome ingress store/LoadFixed、聚合复制和 ELF relocation/object ledger；删除、交换、重复 consumer 等 mutation 全拒绝。其余 indirect、importc/variadic 仍精确 hard-fail；真架构双后端 object/run/debug/ORC、七阶段、GEN/性能与 official/baseline identity 未闭合 |
| G5 release | official/baseline manifests、三目标运行/性能工具、最终审计 | Darwin arm64、Linux AArch64、Linux x86_64 真架构正确性与性能；所有证据再次绑定冻结源码 | `status=GREEN`、`red_count=0`、`driver_role=production`、`RELEASE_GREEN` 后 archive | pending |

## 不可放宽的门

- G1 冻结前，G2/G3/G4 不得从源码文本重建缺失身份。
- G2 canonical authority 未闭合前，G3 不得按 callee 名或可变 LocalSlot 猜所有权，
  G4 不得以对象字节或性能收益替代正确性。
- regalloc 正式性能门继续使用现有 ABBA/BAAB、最大 5% 回归、10% 噪声、
  spill density `<=250000ppm`、`__TEXT` 小于 baseline、`__TEXT/clang<=2.0` 合同。
- 1GiB 终点只接受 Linux cgroup v2 aggregate hard cap；Darwin process-tree sampled
  peak 只作辅助画像。
- 未实现 target/emit 组合 hard-fail；禁止 fallback、Mock、旧 emitter、fixed template、
  提高内存上限或补写伪 receipt。
- 注解语义 admission 只接受正式注册名；固定注解消费者必须使用 parser-owned
  Annotation/AnnotationArg target、span 与 CSR，禁止逐行扫描或字符串 substring
  赋予语义。
- snapshot/cache/managed-mirror 的 verified tree 必须把每个已读文件的 canonical
  path、dev/ino、长度与 SHA 绑定到 handle，并在 close 前重放；根交换、同 inode
  改写和失败 close 后复用 handle 一律 hard-fail。

## 2026-07-24 当前源码切片

- G1：Object/RefObject inheritance 已进入 parser、canonical sidecar 与真实 JSON receipt；TypeSyntax 行身份同时绑定有序 child targets。Fusion producer-only current map 与
  source-plan 已按当前规范重算为 `125` productions、`971` required claims，
  且旧 `BLOCKED` 控制面已删除；source claims 不算 receipt，发布真值仍是
  `0 MAPPED/125 PARTIAL/0 UNMAPPED`、`witnessed=0/missing=971`。
- G1 source-plan 已原地迁移为唯一 current store：
  `current=sha256-6f96f020ef4cc3a068bad2ed52755db04681dfc61a9047c69e0d9499145a68a2`，
  29 个 Cheng 源与 manifest 位于只增不改的 content-addressed generation；
  publisher 只在完整 generation 校验后原子替换单标量 `current`，全部正式
  consumer 均先固定 generation 再读取，旧平面路径、符号链接、缺项、额外文件和
  staging 中间态一律 hard-fail。
- G1 Review：17 个 blocked 均已裁决为可消除缺口，不能进入 archive。公开 EBNF
  必须迁出 raw ref/pointer/address/deref/arrow、独立保留 managed ref object，
  修正 suite/case 空 repetition，并用 parser raw token 补 module/multiline
  witness；最终物理删除 `BLOCKED` 机制。
- G1/G2/G3：正式规范已固定 object/ref object 的单 base、无环、
  base-prefix payload、base-first init/local-first drop 与递归 trait/CID 语义。
  TypeArena 尚无独立 base TypeSyntax/TypeId 列，snapshot/layout/drop glue 尚未消费；
  因此 parser receipt 不能外推为继承语义完成。
- G2：freeze1/2 的 runtime 首红依次推进到 TypedNode domain split 与 Function
  Symbol authority guard；freeze4 在编译前暴露旧 closure helper 的 fork 风暴。
  单进程流式 closure 与工具身份绑定已通过 self-test，freeze5 的源码闭包
  start/after-build 一致并进入 runtime，当前首红为 interface finalize 前误用
  sealed source validator。所有轮次均未产生 `published=1/bitmap=0`。
- G3：driver-safe annotation index 的七个 buffer 已在四类终态显式释放并重复 500 次 `live=0`；该 focused owner 不代表 parser、text、result 或完整编译进程树已闭合。

## 2026-07-25 current 闭包与真实回执收敛

- G0/G2：快照生产门已在全部 `bootstrap/src`、正式规范、直接工具和包清单上
  生成唯一 current source closure manifest。每个成员稳定读取内容 SHA 与
  `dev/ino/mode/size/mtime/ctime`；tracked deletion、add/change/remove 和路径集合
  变化均 fail-closed，失败路径也在退出前复核。真实并发运行已精确输出
  `source_closure_drift_path` 并作废同轮编译诊断，尚未取得 `published=1`。
- G1：Fusion current corpus 已原子切到
  `sha256-29296bc5a614534cdbd783e0fbeb3c622abda137c3ce2c61b815d79af9f8cf72`。
  TypeSyntax、Pattern、Annotation/AnnotationArg witness projection 只接受对应
  parser-owned SoA 行及精确 owner/span/token/node/receipt identity。当前真值仍是
  `125 productions / 971 required / witnessed=0 / missing=971`；没有真实 current
  driver receipt 前不得发布映射。
- G1：current parser receipt ingress/runner 消费端及 delete/swap/old-generation/
  source/driver drift mutation 已通过。admission 必须同时匹配冻结 source snapshot、
  official driver、current corpus generation、双 driver raw bytes 与完整
  parser-owned obligation。当前这三类上游产物均不完整，因此 runner 只返回
  `HARD_RED`，不生成 admitted map。
- G3：CompilerCSG build fragment 已使用 per-build ledger 与真实 PhaseArena
  release receipt；storage gate 自动覆盖五个生产消费者及 15 个 mutation。ORC
  原子释放静态门覆盖 primary/backend2、5000 次成功调用、各 8 个失败用例和
  30 个 mutation，旧 driver 不能产 PASS；正式动态仍因 current-source compiler
  缺失保持 RED。
- G3：新增 loop/early-return/conditional-move 的真实 Cheng fixture 与完整
  source-closure gate；合法正例当前暴露 state7，去 early-return mutation 与
  同块 move 后读取分别稳定要求 state6/state4 hard-fail。install-lock 语法已
  收敛；冻结 closure=`6da976b93443b90d4c8ed92efe1c2908088164f18f46e757eb2796463fce7145`
  仍唯一复现 state7。dataflow apply 前 hot C 从 `24bf…` 漂到 `44b0…`，该 lane
  已停写且未留下并发补丁，等待无 writer 窗口。
- G3：break/continue、每迭代双 defer LIFO 与 conditional move 的第二个真实
  fixture 在 closure=`eba023c1352275cb0ff713e5efc751b09e469d2caf3be9b0440761fab1c815c7`
  下稳定先红 `nested-scope defer is unsupported in cold`，证明 defer cleanup
  edge 仍是当前实现缺口。
- G3：partial-init、managed self-assignment/overwrite、borrow→owned return 与
  defer LIFO 的第三个 fixture 在
  closure=`b4e924b38402b88a843a1ef81250cf7b2e6c44b04efac2be05069d855137c499`
  下稳定先红 `managed assignment lacks exact source target`，定位到
  partial-init 合流后的 current-definition 丢失。
- G3：managed aggregate sret→本地 owner→global/container overwrite 与
  5000 次调用的第四个 fixture 在
  closure=`dc54bba236645befee2e2c4e4073b80975fb2ef470f1aad0279862a523c20b58`
  下稳定先红 `last block has no terminator`；因此 ORC 5000 runtime 与三类
  mutation 尚未执行，不能把静态合同计为动态闭合。
- G3：`last block has no terminator` 已最小化为 explicit `return 0`：
  `parse_statements_until` 在 EOF/indent/stop 判断前创建 phantom dead block。
  closure=`a316261db1e8223bf7a9ad664c5e884955d3c88638865f5bcfa51eb89b7f3751`
  的独立 gate 证明 inline form 绿、explicit return 稳定红；修复不得放松
  last-block verifier，只能延后 dead-block 创建并显式 UNREACHABLE 终结。
- G3：terminator 根修已在 closure
  `c25ce164c922601aa5b39d6e589504f6dc191a3e4cbf75eadebf503b4a7021bf`
  下证明 explicit return 只有一个 RET block，真实 trailing dead block 为
  UNREACHABLE。sret/ORC 5000 fixture 已越过编译，当前在 closure
  `9883385a478476f3c01e03bd1ff3d9279008b3f3e24a777db1abd4d37d824fc2`
  下运行 rc202：`freeDelta != 5000`。
- G3：两轮诊断一致显示 `alloc=5000/free=0/live=5000`、首个 mismatch cycle=0；
  诊断轮因并发漂移不作为正式 receipt，但已将下一步收敛为 global/container
  overwrite 与 nil clear 的 release op/drop glue 生产链，禁止用计数器补值。
- G3：独立 ORC smoke 已证明 runtime counter/释放函数本身平衡。BodyIR 对拍确认
  global/container/nil clear 仍发 raw `PAYLOAD_STORE`，没有
  `MANAGED_REF_MOVE_REPLACE(168)`、旧 owner drop 或 release。根修必须统一 exact
  managed-lvalue replace，覆盖 global/field/field-path/self-assignment，并让
  verifier hard-fail managed raw store。
- G3：上述 direct sret→global/container 缺口已在 current source 原地闭合。
  两种合法表面语法都由 realizer 自动物化为精确 stack-local value-def，schema
  拒绝 call temporary 直接进入 managed payload store；动态门绑定完整 source
  closure，并取得 5000 次 alloc/free=`5000/5000`、live=0。该 Darwin 回执不替代
  Linux cgroup v2 1GiB 硬门或其余 cleanup/失败矩阵。
- G2：builder 动态门已接入同一 current source closure，并在失败 trap 重算完整
  闭包。首轮实跑精确拒绝 `bootstrap/cheng_cold.c` 运行中漂移；随后在
  before/after=`7f9ee75afc4807143de7e2441b1a4873b3c40eab4cf3efcf27743adbe490b487`
  的稳定闭包下复现 `CompilerCsgCloneNode(symbolA)` exact-point liveness 错误。
  源码核对确认 fixture 在默认 move 后再次读取，已迁移为真实双 owner 的
  `share(symbolA)`；随后删除零调用的旧 borrow-to-owned helper。最新稳定闭包
  `307756e5…` 先暴露 install-lock 五参签名与六个四参调用未同步的 C 语法红，
  因而尚无新的 snapshot runtime 回执。
- G4：七阶段 fail-stop 静态合同已通过；official current gate 已删除旧 Linux
  双 manifest 入口，只消费 `cheng.current_source_closure_manifest`，并通过
  不同 inode GEN2/GEN3 与九类 source/tool/driver/snapshot 漂移 mutation。动态
  仍因 production driver 缺失保持 RED。
- G4：Fusion official seven-stage current consumer 已实现并通过全列 mutation；
  它先重跑 parser ingress admission，再要求同一 executionRaw32 贯穿七阶段的
  ingress/action/fragment/object/receipt。当前 official driver 不存在，真实运行
  保持 `verifiedStageCount=0`，没有填充 witness hash。
- G4：official gate runtime lock 已覆盖 Bun、runner/CLI、parser ingress、
  execution validator、Fusion source/tool/fixture/package/bun.lock/.gitignore
  closure 与 current corpus pointer/generation 目录成员；任一中途写入 rc97，
  summary 绑定全部 hash/stat/generation identity。
- G0/G4：首轮正式冻结捕获 4937 paths，manifest
  `a3cbee61e9c7c71c8c05b48e07b70cdf6b51dbd1bf997007f0f60736dd0613dd`。
  preflight 前 cold_parser 从 `de60a989…` 漂到 `fb3b6d83…`，整轮 rc97 作废且
  未进入编译。closure diff 现独立输出 Cheng/Fusion header、path_hex 变化和
  before/after row SHA。
- G4/G5 对抗审计：current release auditor 仍可接受自声明 semantic/perf/target
  receipt、caller-selected policy/stage、action/fragment hash alias、跨源码
  memory/target、复制式 GEN2/GEN3 与先执行后 pin；canonical realpath 也未全验。
  这些 PASS 不再计完成，正在 Fusion 原地实现原始 artifact 独立重算、唯一
  composite release identity、pre/post 全闭包锁和真实代际生成 receipt。
- G4/G5 原始生产端审计确认现成 source/fixed-point/pre-post locks、12 个 compile
  samples 与 Linux cgroup raw receipts可复用；direct command/env、backend epoch、
  jobs1/N、三目标×双后端 object/run/debug/ORC 和 post-completion recursive
  artifact publisher 为硬缺口。official producer 已开始接 direct-command guard、
  epoch/jobs raw evidence 与 O_EXCL publisher。
- current-source 编译已依次暴露并修正 TypedExpr source range/source identity/
  sealed line 与 SystemLinkPlan request/entry identity 的真实 move/borrow 错误。
  桌面常驻 Fusion MCP 仍加载旧 receipt 工具而正确拒绝；只有新进程 current MCP
  与冻结源码闭包的 roundtrip 才可计证据。
- G4：唯一 `CompilerRequest` 已原地加入 backend/jobs/emit/provider action CID、
  request CID 与 seal；两个正式入口各解析一次，formal plan 禁止 argv/env 重选
  backend 或 seal 后改写。合同及 34 个 mutation 当前全绿。
- G3/G4：formal builder 已按 sealed backend 选择 primary/backend2；backend2
  exact-function 未实现时 hard-fail。runtime 在 backend2 plan 物理释放并 strict
  consume 后持久化独立 owner receipt，owner ledger 不再把它登记成 primary。
  single-pipeline 缺口从 38 降至 31；direct runtime/source role/dispatch
  producer 与 compiler_main bridge fallback 尚未物理删除，因此仍为 RED。
- G2/G4：dispatch source closure 的 `Value→Panic` 依赖已从原始源码文本扫描迁移
  到 parser-owned Call/SpaceCall event、canonical Result.Value detail identity
  与单参数根；parser producer 缺失或失败即 hard-fail，tree owner 在成功/失败
  路径均 release。CompilerCSG 仍只按精确 `std/system.cheng::Panic` identity
  retain。focused gate 与 6 个结构化 mutation 全绿；正式 roundtrip 仍被
  vendor cold receipt `752b3c6d…` / actual `8157e2a7…` 漂移拒绝，未计发布完成。
- G4：primary integer-cast 的 post-seal pointer、integer/enum 位宽与符号判定
  已从 type/result/source/alias 文本迁移为 CompilerCSG-sealed node TypeId、
  exact TypeArena CID、canonical physical TypeId 与冻结 kind；缺事实 hard-fail。
  node-eval integer→F64 同样只消费 exact arg node 的位宽/符号并核对冻结 slot
  kind；integer-only consumer 对 F64 显式 not-claimed。post-seal gate 与 24/24
  mutation、current-source metadata closure 编译运行均通过，Fusion line map
  1110/1110；stale cold receipt 与 DebugEmissionPlan
  reachable-body 缺口仍阻断正式 roundtrip/dynamic cast smoke，因此
  object/七阶段/发布状态不变。
- G3：lowering TypeArena return/global owner-proof 四列与 import graph
  `parser.ImportEdge[]` 已进入容量 epoch ledger；托管字段和物理 buffer 均在
  terminal path 真实释放，收据进入唯一 owner token。静态 94 mutation 和
  focused 动态 21 receipt mutation 全拒绝，机械未覆盖 allocator 调用从 217
  降至 212。semantic debug FunctionId/TypedNodeId/DebugOpId 三列随后接入同一
  capacity epoch 合同，candidate 失败物理释放、成功原子转移，receipt 进入
  owner token/storage/strict consume；104 个静态 mutation 全拒绝，机械计数降至
  209。动态回执被共享 cold parser dependency scan 首红阻断。已有 focused
  回执不替代 official current driver 或 Linux cgroup v2
  1GiB 硬门，G3 仍为 RED。
- G1：正式 EBNF/corpus/map 已由仓内原子生成器重算到唯一 current generation
  `sha256-49de6f60b29111db70165f85bff6e6b4c6bf8611fdd5cb953ab81a8a4408409e`；
  source-plan/full item25、pattern/type-syntax、item26 与 corpus checks 全绿。
  严格真值仍为 `0 MAPPED/125 PARTIAL/0 UNMAPPED`、
  `witnessed=0/missingRequiredCount=971`；5 份 synthetic receipt 只用于拒绝网，
  不算 production witness。
- G2：fresh Fusion production-closure audit 在 sourceSetCid
  `7794d76435134c73e0daff67388939f8b7d189632e9efd56d586c254aa2ab116`
  下通过结构、精确身份、六查询隔离及 Mach-O DWARF consumer 检查，唯一 blocker
  为 `no_published_candidate_evidence`。atomic publish 诊断轮因
  `bootstrap/cold_parser.c` 中途漂移作废，未产生可引用 publish receipt。
- G3/G4：current SystemLinkExec topology gate 与 focused mutation test 已通过：
  唯一 formal root、两个 official entry、零 direct root/compat/post-plan
  selector，backend2 terminal owner receipt 精确，seal 后 backend 不可改写；
  28/28 mutation 全拒绝。该静态拓扑回执不替代 official driver、双后端动态
  object/run/debug/ORC 或发布门。
- G0/G2/G5：唯一 latest 已扩展到跨仓 evidence 与哈希域。Cheng external
  wall/read-trace argv CID 原地统一为 `cheng.guard.command_argv`；Fusion
  deposit/verify、4 份存量 evidence、index/manifest/receipt/stages 全部迁移到
  无版本后缀 schema 并重算受影响哈希。Cheng singleton/read-trace/acceptance
  与 Fusion evidence verify/item41 全绿，无旧 schema 读取或双写。
- G0/G4：pure exe cache 已从版本字面量域原地升级到唯一
  `cheng.compiler.pure_exe_cache`。compiler/provider 身份不再使用 path+版本或
  FNV64，统一消费 canonical pinned file 的 exact SHA-256；before/after/reopen
  identity 与 9 类 mutation 已由 focused gate 固定。动态 cache hit 仍待冻结
  current driver，不计发布完成。
- G3/G4：parser signature 已发布 canonical formal TypeId，current full 越过全部
  formal identity 缺失。下一首红为 initialized var-out
  `live_before_call=0`；lowering focused/minimal smoke 同样在
  body-store-freeze exact value-def 门停止，尚未取得 semantic-debug runtime
  `live=0`。
- G0/G4：browser ABI plan/source 与 pure entry marker 已原地迁移为唯一 current
  名称；producer/consumer mutation 全拒绝。零引用 bail44 type-text/name/path
  fallback ghost 已物理删除，不留可复活的旧启发式入口。
- G4：七阶段 manifest 七行已统一绑定 source/compiler/tool 与真实
  ingress/action/fragment/object/receipt CID，删除/换列 mutation 全拒绝。official
  runner 仍因 production driver/current build receipt 不存在而
  `verifiedStageCount=0`，保持 HARD_RED。
- G3：PrimaryObjectIr statements/paramNames/paramTypes 三列 allocator 完成，
  122 mutations 全拒绝，当前机械剩余降为
  `125=100 add+24 setLen+1 reserve`；动态 official `live=0` 未证明。
- G3：report projection 的 counts/targets/structured-counts 三列又消除 22 个
  raw add，132 mutations 全拒绝；最新机械剩余为
  `103=78 add+24 setLen+1 reserve`。动态状态不变。
- G3：defer-scope build 的四个 scratch `int32[]` 已使用精确 length domain 和
  同一 epoch owner，正常完成前物理释放并 strict consume；142 mutations
  全拒绝，机械剩余降至 `99=78 add+20 setLen+1 reserve`。未取得 official
  动态 `live=0`。
- G2：fresh Fusion production-closure 在 sourceSetCid
  `43e2428d30158adbf58d1831868ae388de7f07832d101e6c8a2f02927485a9c6`
  下继续通过全部结构/身份/六查询/DWARF 检查；唯一 blocker 仍为
  `no_published_candidate_evidence`，没有运行或生成 `published=1`。
- G3：defer cleanup 已按正式语义在退出边读取 lexical binding 的最终
  value-def；focused CFG/defer runtime 全绿。冻结 full closure CID=
  `c6b5879ff19dc0468b38521e7875394e06cd040152ffe0d46eaabb1a3bcc615e`，
  旧 liveness/body-store 首红消失，新首红推进到 `atomic.LoadI32` var-out
  actual 的 exact local mutability 投影。
- G1：AnnotationArg scalar leaf 已补 kind↔token kind、owner sourceTextId 与
  span==token strict validation，sidecar 及 Cheng/Fusion mutation 同步拒绝错绑。
  仓内 item25 仍因 current corpus 内容漂移 fail-stop，未增加 production witness。
- G0/G4：SHA256 bridge 的 production/nolibc provider、mobile consumer 与真实
  smoke 已原地统一为无版本 public C symbol；singleton 锁定 exact export/import
  count 并拒绝旧后缀。stage3 focused link/run 已通过全部向量，但 command
  identity 非 official，尚未取得冻结 current-driver 回执。
- G1：current grammar corpus/node map/pointer 已原子刷新到
  `sha256-a993ff78779113b00b71d479397796de31fafee1259557b0c9ec58aaf7b6efac`，
  未引用旧 generation 已移入可恢复废纸篓。item25 与 `--check-sources` PASS；
  严格真值仍为 0 MAPPED/125 PARTIAL/971 missing，不增加 production witness。
- G3：functionDenseStore 七列已进入 exact capacity-epoch ledger，并按托管/plain
  元素类型真实释放；152 mutations 全拒绝，机械剩余降至
  `80=66 add+13 setLen+1 reserve`。dynamic official `live=0` 未证明。
- G1/G4：八个固定注解的 production text residual 已归零；结构 flag/snapshot
  传输存在。但 `weak/keep_export_binding/borrows/escapes` 尚无真实 link retention
  或 ownership 行为 consumer，保持 RED；当前先实现 `keep_export_binding`
  的 exact Function identity 消费。
- G3：ref referent mutability 已沿 definition/slot/call-arg/call-op 贯穿，诊断
  full 越过 atomic.LoadI32 immutable red；下一红为 mutable copy-out 的
  BORROW_SHARED source。该 full 因外部 gate 字节漂移作废，只用于定位。
- G3：resolved-call graph scratch 已覆盖 exact epoch、六条退出释放与 strict
  receipt；177 mutations 全拒绝，机械剩余降至
  `79=66 add+12 setLen+1 reserve`。dynamic official 状态不变。
- G0：四个 Git 跟踪且零引用的 `.bak/.mybackup` 旧源码已物理删除，避免正式
  source closure 继续吸收旧实现；singleton 新增 tracked-backup hard-fail。
- G3：第三次 frozen full closure manifest CID=
  `acdcc7a8c8d76d1e4755ddca4856dc7a6e119f4db2de6e22e4b52a3f84580d44`，
  pre/post 完全一致；两类 unique var-out 首红均消失。新首红推进到 SystemLink
  plan 的 managed requestSourcePath consume 后复用。
- G1/G4：`keep_export_binding` 已从 exact annotation Function identity 生成 CSG
  retention root，并把完整 provenance 贯穿最终 reachable table；9 类 mutation
  全拒绝。official current driver 缺失，动态 production 仍为 RED。
- G3：bool typed-index scratch 已覆盖 exact owner、五条退出释放与 strict
  receipt；188 mutations 全拒绝，机械剩余降至
  `78=66 add+11 setLen+1 reserve`。dynamic official 状态不变。
- G0/G4：atomic/current-driver 源码原子已静止并绑定核心哈希；随后只刷新一次
  backend2 唯一 current 身份。epoch=`8f33b88c…850d`、closure=
  `f0736825…43b6`、manifest=`963e20a0…f5bc`、source_count=109；sentinel/current
  gate PASS，4 consumers、0 legacy residual、5 类身份 mutation 全拒绝。static
  gate 不执行 official driver，动态仍 RED。
- G1：Fusion binder 已清除 `driverDeclarationIdentity` 参数漂移，并新增同步改绑
  Field owner/lexical scope/TypeSyntax owner/token/CID 的强 mutation；该伪造在
  FieldBlock/direct-owner join hard-fail。item25/item26/严格 tsc/Bun build
  全绿，但没有 official parser receipt，witnessed 仍为 0。
- G2：snapshot 四工具的 closure、ENTRY_EXE、真实 Mach-O link/run 骨架已增强，
  但独立 review 发现 stdio binding shadow、非 exact JSON-RPC、父侧 admission
  自证及 random stale GREEN/schedule/artifact/mutation 自证；这些修复完成前
  工具合同不得计绿。random Cheng producer 仍以
  `object_runtime_oracle_not_bound` hard-fail。
- G2/G3/G4：parser borrow frontier 已改为真实 Owned 边界：constructor、
  manifest、import-root sequence、intern name/span 均不再借 `@borrows` 掩盖
  Fast view；typed 伪 mutable tree handle已撤。独立审计追加闭合 source-id
  accessor 与三个 typed alias query 的 borrowed→Owned normalizer 边界；当前
  当前候选 parser/intern/typed 哈希为 `5653f2e2…912cc9d`/
  `dcb4bcbd…dee3c3`/`3412186f…7cc1f`；BuildIndex 26 函数 ref-handle borrow
  closure、metadata/LookupIntern `@borrow_result`、cache/out Owned 边界已补，
  32/32 focused mutation PASS，第三次独立审计在执行。trusted current-driver 仍待
  bootstrap stable schema，backend2 identity 已 stale，保持 RED。
- G2：random gate 现由冻结 official driver 独立执行 30 baseline+900
  transitions，660 valid 对象 byte-compare/link/run、240 reject nonzero/no
  object，47 mutations PASS；producer contract 缺失使完整门继续 hard RED。
- G2/G4：fresh snapshot audit 拒绝 symlink stage3。正式证据要求 current
  driver 是常规文件并与 source/tool manifest 同时冻结，不能引用外部 baseline
  symlink。禁止普通 `cp` 跟随链接覆写外部 target；final closure 后须先在持久
  evidence dir 生成并验证 stage2/stage3 fixed-point、自检与真实 fixture，再以
  同目录 no-follow regular temp、旧 inode/readlink recheck、atomic replace 和
  parent fsync 物化入口。
- G3：CleanupPlan 的 247 个 sequence 已逐列真实 free，15 个 `str[]` 先释放元素，
  provider/arena 最后释放；物理 buffer/bytes/managed bytes receipt strict close
  后才清 owner，自动列枚举与删除任一 free mutation PASS。该切片仅静态闭合；
  dynamic current-source `live=0` 仍被 stage3 symlink/bootstrap 漂移阻断，
  OwnershipDropIr 仍 RED。
- G3：OwnershipDropIr/Analysis 的唯一 current Release API 已静态闭合：10/23
  owned SoA 列和 FlowState 内嵌列先内后外释放，owned string 走真实 ORC drop；
  61 mutation 与 Cleanup 247 列交叉门 PASS。current-source runtime/live=0 仍
  未证明，因此 G3 总体继续 RED。
- G0/G3/G4：bootstrap final-schema 的 21 mutation 与 CHENGCSG roundtrip/
  fixed-point 已独立复跑通过，owner family、TypeId/producer/CFG 和 call metadata
  对拍局部闭合；尚未与最新 Cheng 源码哈希合成 trusted driver closure。

## Archive 条件

三个被引用提案和本提案只能在同一冻结源码闭包下同时满足 G1–G5 后归档。
任何 source/tool/driver hash 漂移都回到 G0；不得沿用上一轮证据。
