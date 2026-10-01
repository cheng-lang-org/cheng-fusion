
## wall107 报告：cold_nested `regalloc_production_emit_failed code=2 detail=1043`（EmitRecipeInvalid）墙死亡——富化判词一次定案（proof 腿 4 实锤 mask=12 op/sub 投影漂移）+ bind 权威字段回写 action/site 投影落地（零弱化），判词推进至 exact_def_derive 墙（授权面外移交）

日期 2026-09-02。承接 wall104b 小节移交（cold_nested `code=2 detail=1043`）。本臂修面=src/core/backend/regalloc_aarch64_adapter.cheng（授权面内唯一文件，apply 前对 HEAD 干净）。

### 判定（本墙已死：proof 腿 4 的 reloc 投影字段漂移修复，cold_nested 判词不再出现 regalloc_production_emit_failed）

1. **1043 判据链路定位（静态，一次闭合）**：判词 `code=2 detail=1043` 在 primary_object_plan.cheng:73741 打印，`detail={emission.errorDetail}` ← emitter regalloc_production_emitter.cheng:1124-1128：`RegallocProductionBindMachineRecipe(out.plan, out.recipes)` 失败 → `regallocProductionEmitFail(out, RegallocProductionEmitRecipeInvalid, out.plan.errorDetail)`（EmitRecipeInvalid=2）。plan_detail=1043 且 plan_valid=1 的矛盾由 regalloc_production_artifacts.cheng:2014-2033 解开：1041..1048 是 proof 诊断阶段码（注释原文 "Diagnostic stage codes … Zero effect on success paths and on the accept/reject decision itself"），只写 plan.errorDetail 不置 invalid。1043 = `regallocProductionFrozenRelocsAligned(recipes)` 返回 false（frozen relocs 未对齐门）。wall104b 移交的 "adapter prepare 返回 invalid" 修正为：adapter prepare 成功（words=104），炸点在 bind 期 proof 门。
2. **富化（r1 承载，reject 路径专用，绿路零输出零行为变化）**：adapter 新增 `regallocA64RelocAlignmentDiagnostics`（compose 末尾、BuildMachineFragments 成功后调用），镜像 proof 全部腿做只读复算：腿 1=fixed (wordStart, ownerKind) 排序后 machineFragments reloc 连接序 vs functionRelocs 逐条全等；腿 3=functionRelocs 逐 word 唯一覆盖；腿 4=每条 action recipe reloc 按绝对 word 投影到 function 行后全字段比较（差异位掩码）。任一腿失败才向 stderr 打 `phase=regalloc_a64_reloc_align_probe …`；全绿静默返回，不改任何字节与判定。
3. **r1 一次定案（/tmp/oob_ab/w107/cn_r1.stderr）**：`fragments=80 frag_relocs=26 func_relocs=26 words=104 actions=155 leg1=1 leg3=1 leg4=0 … l4_action=85 l4_reloc=0 l4_abs=16 l4_row=1 l4_mask=12 l4_func_op=5 l4_func_sub=0 l4_act_op=-1 l4_act_sub=-1 l4_sym=…nestedFmt__L1__cheng_cstring_0`。mask=12=bit2(opIndex)+bit3(subIndex)：唯一漂移=bind 回填未贯穿投影。机理：`regallocA64BindFunctionRelocOwners`（3989 起）把 owner op/data subIndex 只回填 `out.functionRelocs`（函数级表），而 proof 腿 4 要求 action recipe 投影行与 function 行全字段相等——action 级 data reloc（`StoreStackArg`+`Constant(CString)` 路径，regallocA64AppendProjectedCStringDataAddress→regallocA64AppendDataAddress，生成时 opIndex/subIndex=-1 哨兵）永远 -1/-1 ≠ 回填后 ≥0 → proof 恒拒。ordinary/call_fixture 过绿的原因：二者的 data reloc 全走 site 层（proof 不查 site 投影）或无 cstring action 实参；cold_nested 的嵌套 Fmt 让 cstring 字面量（`cheng_cstring_0`）成为 outgoing stack 实参 → 首次落入 action 投影 → 触发。
4. **修法（r2 承载，契约对齐零弱化）**：bind 回填循环后新增投影回写——按绝对 word 定位 function 行（word 唯一性由本函数既有 `ownerOpByWord` 查重与回填循环保证），kind+targetSymbol 双匹配确认同一 reloc 后，仅拷贝 opIndex/subIndex 两个 bind 权威字段到 action recipes、opRecipes、termRecipes 三类投影行；无匹配行的行保持原值（真失配照旧下游 reject）。proof 门（artifacts 全部子句）、reject 判据、发射字节零改动：唯一效果是同一 reloc 的多份投影在 bind 后字段一致，正是 proof 全字段比较的语义目标。
5. **秒级门**：车头 /tmp/oob_ab/cheng_w107（任务书所指 cheng_final 现场不存在，与前两臂同，自建：clang -std=c11 -O2 bootstrap/cheng_cold.c，rc=0，sha256=12930fe9614daff426c694bfbe70b3fd20fbff625ca585159c85d76357c424f5）`--in:regalloc_aarch64_adapter.cheng --emit:obj` r1/r2 均 rc=0（/tmp/oob_ab/w107/tc_r1.log、tc_r2.log）。

### 验收实况（cwd=仓库根；驱动 /tmp/oob_ab/kernel_fixed_out/kernel_driver_w107 r2 sha256=79ff7ad15b1816de3d84cb621d0c2625be45dbb038f38bf7357cfd12469d1dd9 size 185314880；r1 sha256=cfeeea0772c9cda61e807ec45f0a0fefc51e446a71baca7bbc8aa6964445c4ff）

| 门 | 结果 |
|---|---|
| **cold_nested × r2** | compile rc=1，**本墙死亡**：`phase=regalloc_ledger_pre actions=155 finalized=1 sealed=1 bound=1 recipe_bound=1 issue=155 ack=155 emissions=155 valid=1 frozen=1 frag=80 receipt_frag=80 abi=2 receipt_abi=2 relocs=26 words=104 receipt_valid=1` 全绿，`phase=regalloc_production_emit_failed` 与 `reloc_align_probe` 均不再出现（探针绿路静默自证）。新墙=`exact def derive: call result definition authority missing op=2 fn=1 slot=2 slot_name=nestedFmt#arg#0#str_literal#0 slot_tk=3 …`（exact_def_derive 域，typed_expr/primary_object_plan 领地=授权面外，且 w106 并行线正在该域作业，停手移交，见遗留） |
| ordinary × r2 | compile=0 / run=0 不回归 |
| call_fixture × r2 | compile=0 / run=1 契约预期不回归 |
| v6 × r2（只记录） | compile rc=1，regalloc ledger 期全绿（56/29 emissions valid=1）与本臂无文件冲突；判词从 w104b 期 `exact def derive … op=11 slot_name=r1` 变为 `ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=11 fn=2`——v6 是 w106 并行线领地，同烤窗口，判词漂移归因其线中间态，未动其夹具与文件 |
| 烤机 | 2/3 轮：r1（富化）与 r2（修复）各一次成功；秒级门 r1/r2 均 rc=0；cold_nested 验收首跑遇 1 次 parent lease 忙退避后跑通（并行线共存瞬态） |

### 契约红线自查
- 守卫判据零弱化：proof 门、reject 判据、detail 语义全部原样；回写只补同一 reloc 投影间的 opIndex/subIndex 一致性，kind/symbol 双匹配不匹配则不动（真失配仍拒）。
- 主树只改 src/core/backend/regalloc_aarch64_adapter.cheng（+252/−0）；primary_object_plan.cheng / regalloc_production_artifacts.cheng / regalloc_production_emitter.cheng 未动（判词/proof 门原样，只读引用）。
- v6（src/tests/zz_v6_w7.cheng）未动未删；未 git commit；探针夹具 zz_probe_w107.cheng 未创建（cold_nested 夹具即单变量验证物）；编排者 user_path_gate.* 工作目录未动。
- RSS 零抬帽：全程默认帽，cold_nested 编译照常完成。

### 遗留移交
- **cold_nested 新墙（授权面外，w106 v6 线同域）**：`exact def derive: call result definition authority missing op=2 fn=1 slot=2 slot_name=nestedFmt#arg#0#str_literal#0 slot_tk=3 slot_sz=24 vds=-1 vdo=0 vok=0 vsr=-1 call_row=0 calls=2 call_result_slot=2 call_result_own=0 call_result_pass=3 call_result_origin=0 call_result_vrow=-1 defs=0`——修面在 typed_expr/primary_object_plan（exact_def_derive），当前有并行线在改该域，静置待其合流后归因。
- v6 判词漂移（exact_def_derive → ownership ingress invalid code=15）归因 w106 线中间态，其线验收为准。
- r1 诊断探针（`regallocA64RelocAlignmentDiagnostics`，含 `regallocA64FragmentRelocMatchesFunctionReloc` helper）已随终版补丁保留在 reject 路径（绿路静默），后续 reloc 域 reject 可直接复用其腿号/坐标判词形态。

### 交付与统计
- /tmp/oob_ab/wall107.patch（== wall107_r2.patch 终版；252 行；sha256=0236c13a595aa83c0112aaec9bf9adefeebb89f83b69683e396e0cdc873e59be）；中间态 /tmp/oob_ab/wall107_r1.patch（富化轮，189 行，sha256=ea8135b0cf13b6fe58a7153d7ffb953f8104225c1ddf0a9a096739ebd81b0738）
- git diff --stat（apply 前→后）：src/core/backend/regalloc_aarch64_adapter.cheng 对 HEAD 干净（0）→ **+252/−0**（4 hunk：诊断 helper+主探针、compose 挂点、bind 投影回写主体）
- 车头 /tmp/oob_ab/cheng_w107 sha256=12930fe9…24f5；烤机产物 r2 sha256=79ff7ad1…1dd9（上表）；产物/日志全在 /tmp/oob_ab/w107/（accept_w107.sh、tc_r1/tc_r2.log 秒级门、cn_r1/cold_nested/ordinary/call_fixture/v6 各 compile.log+stderr+run）
- 烤机 2/3 轮（多臂预算内）；未 git commit
