# wall125.VERIFY

## wall125 报告：v6 `lowering plan: compiler csg semantic parameter type drift function=addCol line=30 index=0 expected=@borrow:Box actual=Box` 墙死亡（lowering_plan.cheng 单文件单臂 [wall125]：csg 语义签名参数比对改回归一 canonical 形+@borrows 包裹 canonical image，纯契约对齐+判词富化零弱化）——v6 判词推进至 `ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=9 detail=0 fn=3 op_kind=15(FieldStore) …`（ownership_body_ir_production.cheng:1344 ingress 门=BodyIrAccessDecode op 站点失败，授权面外停手完整移交）；ordinary compile=0/run=0、call_fixture compile=0/run=1、车头 v6 compile=0/run=0、车头 cold_nested compile=0/run=0 `cold_nested_fmt_interpolation=pass` 零回归；烤机 1/3 轮

日期 2026-09-03。授权面=src/core/tooling/compiler_csg.cheng + src/core/backend/lowering_plan.cheng（本臂只动后者）。车头=/tmp/oob_ab/cheng_w125（HEAD 提取件 bootstrap/cheng_cold.c `clang -std=c11 -O2 -I bootstrap`，sha256 前 16=cb984b59b9d8992d；派发直烤配方 `clang bootstrap/cheng_cold.c` rc=0 建成但运行死于 `cold object cache store payload identity failed (recovery=0 depth=1)` 在途树态缺口，w122/w123/w124 同记归因既有，按其配方降级 HEAD 提取件）。基线复现驱动=kernel_fixed_out/kernel_driver_w124。

### 判定与机理（①富化+②定性+③修法静态闭合，一轮烤机定案）
1. **复现**：w124 编 v6 rc=2 判词与移交逐字。判词两端：expected=`@borrow:Box`（CSG 语义记录 `semanticParamTypeJoin` 片段，权威=typed_expr scope `TypedExprJoinParamTypes`→`TypedExprCallParamType`，var 形参盖 `@borrow:` 标记）；actual=`Box`（typed build index call-declaration 参数文本经在树一行 hunk `TypedExprNormalizeTypeText`→`TypedExprCallRuntimeType`（lowering_plan:14108 域，无任何 /tmp/oob_ab 补丁认领）剥离 `@borrow:` 后的 runtime 形）。
2. **定性（两端权威实为同一 canonical 文本，drift 由比对层生产）**：声明侧注册（typed_expr `TypedExprScopeCallDeclarationInto`→`typedExprBuildIndexCallDeclarationAppendInto`）存的就是 `TypedExprCallParamType` 输出的归一文本=带 `@borrow:` 标记（HEAD 车头同检查同输入 v6 通过 ⇒ 声明侧存标记实锤）。ts-csg 迁移线在树 hunks 给 `@borrows` 函数声明侧追加 canonical 包裹（无显式标记的实参全包成 `@borrow:T`，typed_expr:30519 域），该一行 hunk 用 runtime 剥标记补偿——但把 var 视图形参的 `@borrow:` 标记一并剥掉，addCol `a: var Box`（无 @borrows）即死：`runtime(@borrow:Box)=Box ≠ @borrow:Box`。compute（`@borrows fn compute(n: Node…)`）在该 hunk 下反而过（语义侧 `Node` vs 剥标记后 `Node`）——wall 恰落 addCol 非 compute 与此完全自洽。⇒ 缺的生产段=「@borrows 包裹 canonical image」只算了一半：补偿了包裹差异、却破坏 var 标记恒等。
3. **③修法（[wall125] lowering_plan 单臂，净 +34/−5）**：`LoweringValidateCompilerCsgSemanticSignature` 参数循环改回归一 canonical 比对：`declaredParamTypeNorm=NormalizeTypeText(声明原文)` ⊕ `declaredExpectedParamType=语义片段的精确 canonical image`（image=仅当 `functions2_borrowsArguments[fn]` 且语义片段无显式标记时 `TypedExprCallBorrowModeType` 包裹，否则恒等）——即注册侧唯一已文档化 transform 的逐字镜像，双射无豁免：真 drift（Box vs Col、标记缺失、多余标记）仍全部拒绝，仅吞掉迁移线自己引入的 @borrows 包裹差。bounds 守卫（`functions2_borrowsArguments.len` 界外按无包裹保守处理 fail-closed）；`TypedExprCallBorrowModeType` 空串/双标记 panic 面由 `semanticParamType != "" && !HasExplicitBorrow` 前置封死。
4. **①判词富化（fail 分支永久保留）**：原 13 值文本作前缀，追加 `declared_raw`（声明侧原文）/`declared_runtime`（runtime 剥标记形）/`expected_type_id`/`actual_type_id`（`langintern.FindInternId(plan.typedIr.internPool, …)` 只读查 pool，-1=未入池）/`borrows_arguments`/`declaration_row`/`typed_function`/`param_count`/`source`。语义侧无 per-param TypeId 可取（CompilerCsgNode 只携带 join 文本），TypeId 以 typedIr intern pool id 实况呈现，坐标全列。修复生效后该判词在 v6 不再触发（0 命中），富化随树待命。
5. **落地注记（@borrows 借用权威）**：局部 `let` str 直传借用形参死 `@borrows managed argument lacks exact live source`，managed-return callee 直传局部死 `borrowed actual cannot bind non-var non-@borrows formal`——借权威调用面全部改为数组元素/新鲜调用结果/`share()`（:30522 同款），秒级门一次过。
6. **下一墙（授权外契约边界，完整移交）**：v6 × w125 compile rc=1（原 rc=2），csg drift 判词 grep=0，穿过 lowering/primary/regalloc ledger（3 函数 emission 全 receipt_valid=1），死 `ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=9 detail=0 fn=3 op_kind=15 op_target=0 op_operands=4 a0=0 a1=3 a2=0 a3=8 vd_slot=-1 …slots=36 sealed=1`（ownership_body_ir_production.cheng:1344 ingress 门=ApplyOwned 入口 `bodyaccess.BodyIrAccessDecode` op 站点失败；fn=3=main，op9=BodyOpFieldStoreTag=15，operands=[0,3,0,8] 即 `n.arena = new(Box)` 形；vd 系全空=非 value-def 行）。修面在 body_ir_access/ownership_body_ir_production/其上游生产域，均非本轮授权面；全量判词与槽表 36 列 dump 在 /tmp/oob_ab/w125/v6_w125_compile.log。

### 门禁与验收实况（cwd=仓库根；RSS 零抬帽零 rc=125）
| 门 | 结果 |
|---|---|
| 秒级门（车头编 lowering_plan.cheng --emit:obj） | 改码中两态死于 @borrows 借权威（见判定 5，非树态缺口）→ 终态 rc=0，tc.o 34216442B |
| 烤机 r1（head 三件套+CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w125/cold_cache） | rc=0，kernel_driver_w125 sha256=2b2cbd148718f78145fcfbb2142c0a61d255f3502faae94b7b6afc3bb9a1ba4c（size 186038800），1/3 轮 |
| v6 × w125 | compile rc=1，**本墙判词死亡（grep=0）**，推进 ownership ingress fn=3 墙（移交墙，判定 6） |
| ordinary_zero_exit × w125 | compile=0 / run=0 不回归 |
| zz_call_fixture_w7 × w125 | compile=0 / run=1 契约预期不回归 |
| zz_v6_w7 × 车头 cheng_w125 | compile=0 / run=0（回归门过） |
| cold_nested × 车头 | compile=0 / run=0 `cold_nested_fmt_interpolation=pass`（语义参照保持） |

### 交付与统计
- /tmp/oob_ab/wall125.patch（== wall125_r1.patch 字节全等，155 行，双授权文件累积 vs HEAD 以当前树态生成=lowering_plan 在树 ts-csg 一行 hunk 被本臂替换+本臂富化（本臂净 +34/−5）+ compiler_csg 在树 ts-csg hunks +20/−9 零增量照录；`git apply --check --reverse` 当前树 PASS；sha256=519090bc92a5fa30a19bcceee1b1c77dda958c82a131ae501a8c310472420057）。
- git diff --numstat（vs HEAD）：apply 前 lowering_plan +1/−1、compiler_csg +20/−9 → apply 后 lowering_plan +35/−6、compiler_csg +20/−9；主树仅 lowering_plan.cheng 一文件本臂增量，未 git commit。
- lowering_plan.cheng 进场 sha256=（树态含 ts-csg hunk）→ 离场 ecee92186443f2150622637eb78832f2f933e4e0982bbfe18e8eb4418715e723。
- 作业目录 /tmp/oob_ab/w125/：v6_w124_compile.log（进场复现）、tc.log、head_build.log、cheng_cold_head_w125.c、bake_r1.log、accept_w125.sh、v6/ordinary/call/head 全套 compile+run log、diffstat_after_entry.txt。
- 零探针夹具（zz_probe_w125.cheng 未创建：定性由 HEAD 车头参照+两侧生产源静态闭合，判词富化随修法同轮落地）；zz_v6_w7.cheng 等他人资产零触碰；烤机 1/3 轮（余 2 轮留同域后续臂）。
