# VERIFY_typed3_append — TYPED-RED3 线（typed 域三红线）

date_utc=2026-09-07 · 代理=TYPED-RED3（typed_expr.cheng 独占 face） · 工作克隆=/Users/lbcheng/cheng-f24/anchor_clones/typed3（cp -cR 主树快照进场） · 主树代码零接触（本文件+patches 除外） · 未 git commit

## 结论

- **probe_sizeof 翻绿**（compile=0 run=0 `probe_sizeof=pass`，a=4/b=5 双折叠断言过）——sizeof 刀完成，patch 已入 patches/typed3_sizeof_generic.patch。
- **probe_generic 墙推进两层后定性**：typed_expr 面两堵墙均已实证定位并推进到 csg/semantic-graph 域（冻结面），非单 face 可解，交定性协调。
- **probe_closure 定性交付**：FunctionLiteral 的 typed 结构值通道缺失，完整施工需三文件域联动（arena 行生产+typed 消费+primary 物化），超 face，交定性协调。
- 配对烤机 sha EQ ×2（b8bca03d…）；既有 11 绿探针零漂移；四夹具编译期零漂移（call_fixture run=1 为 head 基线同态，主树在途基线漂移，非本线）。

## 一、sizeof 刀（完成，翻绿）

- 判词原位：typed_expr.cheng 结构 call 实参循环 `structural nested call argument did not build`——`int32(sizeof(int32))` 的内层 sizeof 实参 `int32` 是类型名非值表达式，arg-loop 当值建节点 ident miss → -1 → panic（与 new(T) 专臂注释同款病灶）。
- 修法：typedExprIrBuildValueExprNodeCallFmtActive 的 Call 分支加 sizeof 折叠臂（new(T) 专臂之后）：callHead=="sizeof" 且 rootCount==1 时，surface 整段喂既有 `TypedExprIrSizeofConstBytes`（单一布局权威 TypedExprTypeLayout oracle，不重复实现），fold 成 `TypedExprIrAddI32ConstNode`；miss（非整段 sizeof(T) 形/T 不可布局/多实参）原样落 arg-loop fail-closed。
- fail-closed 论证：折叠臂只在「callHead 逐字==sizeof + 唯一实参 + 布局 oracle 成功」三条件下生效；任何其他形（sizeof()、sizeof(a,b)、命名实参、不可布局类型）都 miss 落原路径，既有 hard-fail 不动。fold 产物与 text 路径独立形（已绿）的常量叶节点同款（TypedExprIrAddI32ConstNode），下游消费面不变。

## 二、generic 刀（墙推进+定性）

### 实证链（诊断探针+panic 增强三轮烤机）

1. g1（纯声明不调用）：`compiler snapshot builder: parser function type root authority invalid`（compiler_snapshot_builder.cheng:14687，csg 域）——非本探针形态，未追。
2. g2（声明+调用）基线：panic 挂 identity **体内** `return x` 的 ParamRef(x:T)——type arena 对 GenericParameter 行保守 managed=true（typed_expr_type_arena.cheng trait 规则原文注释），而布局 oracle 对未代入 "T" miss → typedExprNodeExprClassExact 返 Unknown → managed+Unknown → shareKind Unknown → AddNode 门 panic。
3. **第一刀（保留）**：typedExprNodeExprClassExact 布局 miss 分支加泛型参数臂——node.resultStructuralTypeId 绑定 arena GenericParameter 行（managed=true 权威前提）且 opKind∈引用族（ParamRef/LocalRef/FieldGet/IndexGet/AddrOf，与既有 hasManaged 确定后的规则族同款）→ Borrowed；其余 opKind 保持 Unknown fail-closed。pa 驱动实证：panic 从体内移到 main 调用点（node=4 op=CallExpr surface=identity[int32](42) result_type=int32 managed=1）。
4. 调用点墙：call 节点 structuralTypeId 绑声明返回行=T 的 GenericParameter 行（managed=true），与已实例化 resultType=int32（exprClass=Unmanaged）身份脱节 → shareKind Unknown panic。
5. **第二刀（试探后回滚）**：显式 bracket 实例化形按 resultType 文本绑保留 scalar 行——typed_expr 门通过，但 csg 审计门 `compiler csg: typed-node call result TypeId drift`（compiler_csg.cheng:34501，exactTypeIds 必须等于 semantic graph reachable 函数的返回行=声明 T 行）拦截。
6. **互斥定谳**：在「call 节点 resultType 文本=实例化类型 + structuralTypeId=声明 T 行」组合下，AddNode shareKind 门（要求 managed 与 exprClass 同源自洽）与 csg drift 门（要求绑声明行）不可同时满足。破局需要 schema 级裁定：semantic graph/arena 的泛型实例化函数行表示（每实例化一行，返回 TypeId=实例化类型行），属 csg 域+GEN2 快照 schema 域（SEQ-FIELDGET 冻结面），非 typed_expr 单 face。交定性协调。

### fail-closed 论证（保留的第一刀）

泛型臂三重 guard：structuralTypeId 必须>=0 且 arena 行 kind==GenericParameter 且 ManagedAt==true 且 opKind∈引用族，全部命中才返 Borrowed；布局 oracle 对具体类型可判定时（绝大多数生产路径）走原 hasManaged 路径不受影响；非引用族 opKind（CallExpr 等）保持 Unknown 落门 panic，不兜底。

## 三、closure 定性（未动刀，证据链交付）

- 判词原位：typed_expr.cheng CallFmt 尾兜底 `unsupported structural value case=12 parser_kind=26`——case 12=TypedExprStructuredValueFunctionLiteral，parser_kind 26=ParserValueExprFunctionLiteral。
- 变体实证：`let add = fn (a: int32, b: int32): int32 = a + b` 仅绑定不调用也炸同判词——typed 消费缺失是第一堵墙。
- 跨面缺口清单（全部实证）：
  1. **type arena 行缺失**：FunctionLiteral 是值表达式节点（parser 只存 span+operator+children=体语句根，无参数/返回 TypeSyntax），type arena 的 StructuralTypeFunction 行生产走 ParserTypeSyntaxFunction（显式类型文本），无字面量路径——typed_expr 无法为 OpClosure 绑精确 structuralTypeId（绑 -1 会被 csg 审计 `closure type invalid` 拒）。行生产在 typed_expr_type_arena.cheng（typed 域邻接文件，非本线独占 face）。
  2. **primary 物化缺失**：primary_object_plan 无 OpClosure 消费（匿名体→合成函数物化、函数值 slot）。FuncRef 的 CallDeclaration 身份模型不适用匿名 fn（无声明行，AddNode 门 L6485 强制精确行）。
  3. **调用点 indirect call 缺失**：`add(1, 2)` 的 callee=局部函数值；primary 的 indirect 调用只有显式内征（cheng_call_ptr_i32_raw 族），无语言面局部函数值调用路径。
  4. csg 审计面已备（compiler_csg.cheng:34648 OpClosure→StructuralTypeFunction 期望+capture rows 审计）。
- spec 权威（docs/cheng-formal-spec.md §0.5）：不捕获匿名 fn 可视作函数指针；捕获形=env+trampoline（编译期可能生成 env 结构与 trampoline）。
- 施工蓝图（三文件域联动，预估与施工元组一致 2-3 日）：typed_expr_type_arena.cheng 给 FunctionLiteral 产函数类型行（参数/返回从字面量 token 精确解析）→ typed_expr.cheng dispatch 加 FunctionLiteral 分支建 OpClosure（捕获集=体内外层局部引用的 value-definition rows）→ primary 匿名体物化+函数值 slot+局部函数值调用约定。

## 四、验证与回执

| 项 | 结果 |
|---|---|
| probe_sizeof A/B | head(m18 基线)=红判词对位 → pa/pb(b8bca03d)=**compile=0 run=0 pass** |
| probe_generic A/B | head=红（体内 panic）→ pa=红（调用点 panic，增强文本 node=4 op=66 managed=1）——墙推进实证 |
| probe_closure A/B | head=pa 同判词（case=12）——未动刀，无漂移 |
| 11 绿基线（head 全量 19 件） | assert/block/break/continue/enum/mod/objctor/tuple/varinit/when/while 全 pass，8 红判词与 user_path_baseline.tsv 逐字对位 |
| pa 下编译期零漂移 | probe_try（parser type syntax）/probe_match（call declaration static argument）/probe_array（csg FieldGet）判词与 head 逐字一致 |
| 链接期车头代差（非本线） | pa（cheng_w126_re 车头烤）下 assert/enum/mod/cold_nested/v6 死于 native link `cheng_exit` 符号/`provider object read failed index=0`（链接期 provider，与编译期 typed_expr 改动阶段分离；head 下这些件全绿） |
| 四夹具 | head 基线：ordinary 0/0、cold_nested 0/0、v6 0/0、call_fixture 0/1（rc=1 为 9/7 主树在途基线态，与 9/6 记录的 4/4 已不同，非本线接触）；pa 下 ordinary 0/0 同基线，其余三件死于上述链接期车头代差 |
| 配对烤机 ×2 | pa=pb=**b8bca03d6cc8080c90a1dca7806bdaa411be77c602053181cfea77b0e7fb0986** 字节 EQ（wall 187s/191s，同基名 kernel_driver_t3 异目录配方，cheng_w126_re 车头，900s 帽内，bake_win 锁排队获取） |
| 中间态字节自洽 | 含第二刀试探态烤机=fb5e06b2…（不同 sha），回滚后恢复 b8bca03d——字节级证明回滚彻底+源态一致 |
| patch | patches/typed3_sizeof_generic.patch（3 hunks，+48 行：sizeof 臂+generic 泛型引用臂+AddNode 门 panic 诊断增强） |

### panic 诊断增强说明（报告契约）

AddNode 门 `node value/share authority is incomplete` 增强为带 node/op/expr_class/value_kind/share_kind/share_proof/managed/surface/result_type/fn/line 的 Fmt panic——**判词前缀逐字保留**（基线 tsv 判词列子串匹配不受影响），新增字段为诊断可观测性（本线靠它一轮定位 generic 调用点墙），不构成契约漂移。

## 五、交付物与基线刷新指令

- patch：`patches/typed3_sizeof_generic.patch` = `docs/campaigns/2026-08-31-kernel-userpath/patches/typed3_sizeof_generic.patch`（同内容双落盘）。
- 应用：主树 `git apply patches/typed3_sizeof_generic.patch`（3 hunks 全落 src/core/lang/typed_expr.cheng）。
- 基线刷新（应用后主线程重烤驱动验收 0/0+pass 时）：
  - user_path_baseline.tsv 行 `probe_sizeof  probe_sizeof.cheng  1  <tab>  structural nested call argument did not build` → 五列绿格式 `probe_sizeof  probe_sizeof.cheng  0  -  -`（对照既有绿件行格式）。
  - probe_generic/probe_closure 保持红行不动（墙在 csg/semantic-graph 域与三文件域联动，判词见 §二/§三）。
- 主线程终验建议：认证链（COLD-PROVIDER-FIX）恢复后用正式车头重烤主树态驱动，复跑 probe_sizeof（0/0+pass）+11 绿+四夹具口径；本线配对烤机用的 cheng_w126_re 车头有链接期 provider 符号代差（§四），只宜作编译期 A/B 参照，不宜作发布驱动基线。

## 六、纪律回执

- 主树代码零接触（仅本 VERIFY+patches 双文件落盘）；未 commit/分支/restore。
- 烤机全部走 bake_win 锁（排队获取，与主线程 m27/m29/c6cert2 认证烤错峰）+900s 帽+全禁缓存+每轮新鲜缓存根。
- 诊断探针（g1/g2/g3/c1）与暂编件用毕即删；scratch 目录绑定 typed3 克隆 .w 生命周期。
- 禁 heredoc：脚本全部 Write 落盘后 bash 执行；rc 紧邻捕获；比对 /usr/bin/diff。
