# wall105.VERIFY

## wall105 报告：call-result 定义行缺失墙定性唯一收敛=发布侧三层缺失（TypedExpr 无权威行→lowering 无戳可落→derive 禁造权威），derive 侧无契约内修法；判词富化落地（v6 判词从 identity 槽循环 partial authority 推进为 derive 层 call-mirror 段全列实况 hard fail），按契约边界停手完整移交

日期 2026-09-02。承接 wall104 小节遗留（v6 槽 7/12 call-result 定义行缺失，derive/lowering 域）。授权面=src/core/analysis/exact_def_derive.cheng（主树唯一改动文件）。

### 判定（定性收敛：本墙在 derive 授权面内不可修，非守卫缺臂而是发布侧权威为零，derive 不可能无中生有）
1. **复现与判词推进**：kernel_driver_w105（本臂烤机驱动）同输入（src/tests/zz_v6_w7.cheng）rc=1，判词从 wall104 r3 的 `exact identity schema [freeze] … slot row=7 has partial authority … writers=1 defs=0`（identity 槽循环）推进为 derive 层单行全列实况：
```
exact def derive: call result definition authority missing op=11 fn=2 slot=7 slot_name=r1 slot_tk=1 slot_tid=7 slot_sz=4 slot_mg=1 vds=-1 vdo=0 vok=0 vsr=-1 call_row=2 calls=3 call_result_slot=7 call_result_own=0 call_result_pass=0 call_result_origin=0 call_result_vrow=-1 call_result_bod=0 call_args=3 defs=0
```
2. **三层缺失因果链（v6 o11 实证，逐层源码坐标）**：
   - **第 1 层（病根最深处，typed_expr 领地）**：TypedExpr 发布侧对非托管 call 结果不发布 produced value-definition 权威行。实证=判词 `call_result_vrow=-1`（CallOp.resultValueDefinitionRow）+ primary_object_plan.cheng:26753-26756 注释原文「CallOp 非托管结果必须 OwnInvalid: OwnPlain 没有 TypedExpr value-def, AccessDecode 会在 decodeCallOrdinal 上 Ownership 失败」+ PrimaryBodyIrExactStatementCallResultOwnership（:26684）对 classResultHasManaged=false 直接返回 OwnInvalid、不查权威行。
   - **第 2 层（lowering 发布面，primary_object_plan=w103 线领地）**：通用 call 发射臂（:27074-27077）只对 `callResultOwnershipSaved ∈ {OwnMove, OwnBorrowShared}` 落 op.valueDef 戳；托管形经 managedLocalDefinition→LoweringBindManagedCallResultDefinition 落全列戳（wall28 同族）；非托管形（v6 r1=i32）两臂皆不走 → `vds=-1 vdo=0 vok=0 vsr=-1`（判词实测）。managedLocalDefinition 臂的前提=TypedExpr 权威行在先（:26758 TypedExprIrNodeProducedValueDefinitionRowAt），非托管形该行不存在 → lowering 无权威可落。
   - **第 3 层（derive，授权面）**：defs 倒排计数的唯一入口列=BodyOp.valueDefSlot（exact_def_identity.cheng 倒排循环首行 `let defSlot = bodyIR.ops[opRow].valueDefSlot; if defSlot < 0 … continue`）。derive 设计纪律明示输入 (b) BodyOp.valueDef* 为「不可变权威列」——derive 写它=冒充 lowering 发布权威（且 vdo=OwnInvalid 会立刻撞 partial definition tuple 类守卫，写全列=完全伪造）；即便 derive 只落槽车道戳（TEMPORARY/origin），计数门仍 count==0≠1 炸 `definition count=0`（wall104 r2 同款门）。**derive 层零契约内动作可使该形状变绿。**
3. **C 冷链对照（车头绿的真实含义）**：python 展平全文正则扫描确证 cheng_cold.c 对 op_value_def_* 六列只有 -1 初值写（body_op3 :19817 与 slot 插入 :51866），从不发布 def 行；slot_place_kind/slot_origin_id 同样恒 INVALID/-1；SLOT_I32 经 cold_managed_storage_kind_for_slot_kind(:18451)→UNKNOWN。故 C 链普通槽全走 sentinel 豁免（exact_type=-1 ∧ place=INVALID ∧ origin=-1 ∧ storage=UNKNOWN），partial authority/计数门在 C 链从未行使过任何非 sentinel 槽。**车头 v6 compile=0/run=0 只证明程序语义合法（r=7/offset=8/n=108），不构成 identity 契约参照。** Cheng 链差异源=let 绑定槽被绑定面绑 TypeId proof（tid=7+Unmanaged，primary_object_plan:5789 区 BodyIRBindLocalSlotTypeArenaProof，公共规范门既有契约，不可撤=弱化）→ 非 sentinel → identity 要求 defs==1。
4. **v6 其余 op/槽核（dump 逐行）**：o5（t=-1 丢弃结果）、o10（compute→slot12，tid=-1 走 sentinel）、o4（LoadConst→slot6，tid=-1 sentinel）均不触本墙；唯一必炸形=o11（非 sentinel 槽+无权威戳+defs==0）。

### 本臂落地（授权面内，判词富化，fail-closed 零放行）
exact_def_derive.cheng 相 3 `if op.valueDefSlot < 0: continue` 前插 [wall105] 检测块：`op.kind==CallTag ∧ operands.len==1 ∧ target 界内 ∧ !BodyIrExactDefSlotIsSentinel(bodyIR, target)`（sentinel 谓词与 identity 槽循环同源单实现）∧ 全 op 扫描 `valueDefSlot==target` 计数为 0（identity 倒排计数同款入口列，四条件合取=守卫必炸形状，先行不误伤任何绿面）→ panic 单行判词（call 行权威列 resultSlot/resultOwnership/resultPassKind/resultDefinitionOriginKind/resultValueDefinitionRow/resultBorrowOwnerDefinitionDomain/argSlots + op 权威戳态 vds/vdo/vok/vsr + 槽权威坐标 name/tk/tid/sz/mg + defs 全扫计数）后 hard fail。其余形状逐字走原 continue，守卫覆盖面不变；ordinary/call_fixture 无此形状零扰动（实测背书）。

### 门禁与验收实况（cwd=仓库根，零抬帽，烤机 1/3 轮，全程零 rc=125）
| 门 | 结果 |
|---|---|
| 秒级门 cheng_now5 --emit:obj exact_def_derive.cheng | rc=0 |
| 车头 cheng_w105（clang rc=0，13 warnings 全既有 format 类）× v6 | compile=0 / run=0（语义参照保持） |
| 烤机 kernel_driver_w105 | rc=0，sha256=c8f326df51207b6768ac26f60a6f07e7b756897261eddbd9b1a0e492f488c354，size 185133920 |
| **v6 × w105 烤机驱动** | compile rc=1，判词推进（上列 derive 层全列实况；identity partial authority 判词不再出现） |
| ordinary × w105 | compile=0 / run=0 不回归 |
| call_fixture（zz_call_fixture_w7）× w105 | compile=0 / run=1 契约预期不回归 |
| cold_nested | 只记录：w103 并行线领地，本线未跑 |
| 租约 | 编排者 user_path_gate 长矩阵同窗（w101a2/w101b 驱动），v6 门 14+ 次 `parent lease unavailable`（rc=2），150s 退避串行全消 |

### 移交下一臂（发布侧权威补全，typed_expr/lowering 领地裁量）
- 修面候选（按依赖序）：①typed_expr 发布侧为非托管 call-result 的 let 绑定形发布 produced value-definition 权威行（需与 AccessDecode decodeCallOrdinal Ownership 契约对齐——:26753 注释即该契约的因，不能只加行）；②lowering 通用发射臂对该形落全列 valueDef 权威戳（wall28/LoweringBindManagedCallResultDefinition 同契约形态：行查不到/域不符/已绑非零戳即 hard fail，零启发式）；③derive/identity 既有四 origin 臂与倒排计数原样消费，零改动预期（BindingInitializer→STACK_LOCAL/origin=slotRow 臂对 `let r1=…` 语义行天然匹配，计数门 STACK_LOCAL⇒>=1 满足）。
- 契约红线：禁止 derive 写 BodyOp.valueDef* 列；禁止 sentinel 谓词放宽或计数门豁免（=弱化）；TypedExpr 权威行发布必须 fail-closed。
- 注意：primary_object_plan.cheng 现为 w103 线在树改动文件，撞窗口即租约冲突，须统筹。
- 判词坐标已备齐：v6 o11 全列实况（上节判词）即移交取数点。

### 交付与统计
- /tmp/oob_ab/derive_wall105.patch（== derive_wall105_r1.patch，vs HEAD 累积式含在树 w25/w90/w100 hunks，299 行；sha256=d3793af6a66a3558136b110d27a12313cabea3e713bdf4e8c04d87e70ed5a3f0；reverse 语义=单 hunk 纯插入）
- git diff --stat（exact_def_derive.cheng）：apply 前 191 insertions(+)/5 deletions(-)（155 行净）→ apply 后 236 insertions(+)/5 deletions(-)；本臂净归属 +45/-0（1 hunk，全带 [wall105] 标记）
- 车头 cheng_w105 sha256=7e9d2c93442acf0d63e4b83fae7a251acc25f53cfa0cb631062dddc6ccdd6e1c；烤机产物 sha256=c8f326df51207b6768ac26f60a6f07e7b756897261eddbd9b1a0e492f488c354（size 185133920）
- /tmp/oob_ab/w105/：tc.o（秒级门）、v6_head.exe（车头语义参照）、bake_w105.log、accept_w105.sh、v6/ordinary/call 三夹具 compile/run log、v6_compile_w105.log（新判词全 log）
- 探针 zz_probe_w105.cheng 未创建（v6 夹具即单变量验证物，判词一次给全实况）；编排者资产（zz_v6_w7.cheng、user_path_gate.* 工作目录）零触碰；未 git commit；主树仅动 exact_def_derive.cheng；烤机 1/3 轮
