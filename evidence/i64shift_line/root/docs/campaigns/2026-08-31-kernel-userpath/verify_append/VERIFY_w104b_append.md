# wall104b.VERIFY

## wall104b 报告：cold_nested regalloc data symbol projection ORC 记账墙死亡——判词富化逐行实锤（4 条 cstring 符号行窗口期 rc=0 非 ORC 注册 payload）+ 记账口径对齐落地（due=注册表活性行 + buffer 事件腿，零弱化），dsp 墙死亡判词推进

日期 2026-09-02。承接 wall103 小节移交（`regalloc_production_emit_failed code=10 detail=22`，`dsp_orc=2 >= dsp_rmvc=4` FALSE）。本臂修面=src/core/backend/regalloc_production_emitter.cheng（授权面内唯一文件，apply 前对 HEAD 干净）。

### 判定（本墙已死：dsp ORC 断言口径错配修复，cold_nested 判词不再出现 regalloc_production_emit_failed code=10；结果见末节验收实况）

1. **判词富化（r1 承载，reject 路径专用，绿路零输出）**：
   - receipt 新增 5 字段：`orcSlotColumnReleaseCount`/`orcCStringColumnReleaseCount`（释放窗口按列拆分计数）、`retainedManagedStringDueReleaseCount`（due 行数）、`dataSymbolRowEvidence`（逐行证据串）。
   - `regallocProductionPlanAndRecipesInto` 的 receipt-invalid 臂新增 stderr 判词 `phase=regalloc_dsp_receipt_invalid … evidence=…`（绿路静默，纯发射零 stderr 不破）。
2. **r1 逐行实锤（/tmp/oob_ab/w104b/r1/cold_nested_w104b_r1.stderr 第 3 行，机理一次定案）**：
   ```
   phase=regalloc_dsp_receipt_invalid rows=22 crows=4 rbuf=2 rmvc=4 due=4 orc=2 orc_slot=1 orc_cstr=1 free=2 storage=1
   evidence=rows|s0:0:1:0|…（22 槽全 0/1/0）…|c0:142:0:0|c1:142:0:0|c2:142:0:0|c3:142:0:0
   ```
   读法（`c{行}:{len}:{data==nil}:{memRefCount(data)}`）：4 条 cstring 符号行在释放窗口 len=142、data≠nil、**rc=0**。
3. **定性（修正 w103 的「空串/池化」假说，精确到运行时契约）**：
   - `cheng_mm_release_total`（=memReleaseCount）只在 `cheng_mem_release(p)` 找到注册 header 时 +1（program_support_backend.cheng `cheng_mem_release_checked`：header 查无静默 return 不计数）；`memRefCount(p)` header 查无返回 0。
   - kernel driver 链接面里 CloneStr/Fmt 产出的符号 payload **不在 ORC 注册表**（窗口期 rc=0 实测），其释放是运行时静默 no-op——**永远不可能产生可计数事件**。旧断言 `orc >= rmvc(4)` 要求 4 个事件=要求不可能之事，恒 false-reject。
   - 窗口 2 事件恰为 2 个 seq buffer 释放（`cheng_seq_free` 对非 nil buffer 必发 `cheng_mem_release`，rc=1 时随后 finalize→free=2）；4 行元素级事件为 0。
   - w103「adapter 只读」结论精确化：bodyIR 字节确实零漂移（dsp_cid=1、sha_now_eq_plan=1 维持），投影列行也未被消费（行 len=142 存活到窗口），但 payload 的 ORC 注册态与符号行记账天然异源。
4. **修法（口径对齐零弱化，r2 承载）**：
   - ORC 断言 floor 从「每个 retained 行」改为「**due 行 + buffer 事件腿**」：due=窗口前一刻 `len>0 && memRefCount(data)>0` 的行（注册表活性、事件可计数）；buffer 腿=每非 nil 列缓冲必发 1 事件（cheng_seq_free 契约，任何不崩运行必满足）。两者不相交，和为窗口可计数事件真下界。
   - 零弱化论证：①真泄漏检测力不降——注册表活性行未获对应事件（如 flags 丢失跳过派发、rc 门跳过元素循环）→ orc 短缺 → 照旧 reject；②行销毁仍由 `storageReleased`（len/cap 全零）证明；③长度/容量守恒、cid 等值、physicalFree≥rbc 全部子句原样；④旧断言能正确 reject 的每种形状（行持注册 payload 却无事件）新 floor 必然同样 reject，唯一差异是不再对运行时契约上不可能产生事件的非注册 payload 假性 reject。
   - 顺手强化：释放窗口拆分双列计数（orc_slot/orc_cstr 入 receipt），未来 reject 可归因到列。
5. **秒级门**：cheng_w104b（车头 sha256=bc41f0f8fe30d96d9df44451fa821634f2a827b5b6497cf8b251b0866141aba2，clang rc=0 13 warnings 全既有 format 类）`--in:regalloc_production_emitter.cheng --emit:obj` r1/r2 均 rc=0（/tmp/oob_ab/w104b/tc_r1.log、tc_r2.log）。注：任务书所指 /tmp/oob_ab/cheng_final 现场不存在（w103 同），以本臂自建车头承载。

### 验收实况（cwd=仓库根；驱动 /tmp/oob_ab/kernel_fixed_out/kernel_driver_w104b r2 sha256=c39fb805c72648d7f2e1b826ac4242c1ac990be6670c143ac7709b32b44ca852 size 185166800；r1 sha256=3651d829443c339242b98341ea309b737fbaf84ec8e8b04aca0dde50ad47442c）

| 门 | 结果 |
|---|---|
| **cold_nested × r2** | compile rc=2，**本墙死亡**：判词从 `code=10 detail=22`（dsp ORC receipt）推进为 `code=2 detail=1043`（`RegallocProductionEmitRecipeInvalid`，`out.recipes.errorDetail=1043` 且 `plan_detail=1043`/plan_valid=1）；`phase=regalloc_dsp_receipt_invalid` 不再出现=receipt 全子句通过；dsp 全列维持（dsp_orc=2、dsp_cid=1、dsp_sha_now_eq_plan=1）。新墙在 regalloc_aarch64_adapter recipes 域=授权面外，停手移交（见遗留）。前 3 次租约忙退避后第 4 次跑通 |
| ordinary × r2 | compile=0 / run=0 不回归 |
| call_fixture × r2 | compile=0 / run=1 契约预期不回归 |
| v6 × r2（只记录） | compile rc=1 `exact def derive: call result definition authority missing op=11 fn=2 slot=7 slot_name=r1 …`——w105 线（exact_def_derive）领地当前墙；其 regalloc_ledger_pre 期全绿（actions=56/29 emissions valid=1），与本臂无文件冲突 |
| cold_nested × r1（机理轮） | compile rc=2 code=10 detail=22 维持 + **dsp_receipt_invalid 富化判词首发逐行证据**（上节第 2 点），r1 证据存档 /tmp/oob_ab/w104b/r1/ |
| 烤机 | 2/3 轮：r1（机理+初版 floor）与 r2（终版）各一次成功；秒级门 r1/r2 均 rc=0 |

### 契约红线自查
- 守卫判据零弱化：见上第 4 点论证；`RegallocProductionEmitDataTargetInvalid` 拒收路径、detail=slotProjectionRows 原样。
- 主树只改 src/core/backend/regalloc_production_emitter.cheng（+69/−4）；primary_object_plan.cheng（w103 dsp 判词列）未动——新 receipt 字段不经 pobj 列输出，经本文件 reject stderr 判词输出。
- v6（src/tests/zz_v6_w7.cheng）未动未删；烤机 2/3 轮（r1 机理轮、r2 终版轮，均一次成功）；未 git commit；未创建探针夹具（cold_nested 夹具即单变量验证物）。

### 遗留移交
- **cold_nested 新墙（授权面外）**：`regalloc_production_emit_failed code=2 detail=1043`（EmitRecipeInvalid）——炸点=adapter prepare 返回 `out.recipes.valid=0`，`recipes.errorDetail=1043`，同值见于 `plan.errorDetail=1043`（plan_valid=1，字段残留语义待查）。修面=src/core/backend/regalloc_aarch64_adapter.cheng（`RegallocAarch64PrepareFunctionActionRecipesWithDataSymbolProjection` 聚合路径，4000+ 行文件内 detail 非字面量、为计算值，需下臂富化定位）。emitter 侧入口：`regallocProductionPlanAndRecipesInto` 的 `!out.recipes.valid` 臂（现无判词富化，可参照本臂 dsp 形态补 stderr 判词）。
- kernel driver 链接面 owned-str payload 不入 ORC 注册表（窗口期 rc=0 实测）的归属（provider 选择/manifest 域）——本臂仅在 emitter 侧完成记账口径对齐；若后续要求「所有 owned payload 注册表可查」，修面在 driver 链接/runtime provider 域，非 emitter。
- memReleaseCount 进程级计数器含并行 worker 噪声（≥ 语义），w103 移交注记继续有效。

### 交付与统计
- /tmp/oob_ab/wall104b.patch（== wall104b_r2.patch 终版；110 行；sha256=e04f8ad082fc0a0258a86dbb74b668f2158718b2c0668453ee2de6090bb8d3d9）；中间态 /tmp/oob_ab/wall104b_r1.patch（机理轮，104 行）
- git diff --stat（apply 前→后）：src/core/backend/regalloc_production_emitter.cheng 对 HEAD 干净（0）→ **+69/−4**；本臂净归属全部 hunks（4 hunk：receipt 字段、release 窗口重排+due 计数、ORC floor 替换、reject stderr 判词）
- 车头 /tmp/oob_ab/cheng_w104b sha256=bc41f0f8fe30d96d9df44451fa821634f2a827b5b6497cf8b251b0866141aba2（clang rc=0，13 warnings 全既有 format 类）；烤机产物 r2 sha256=c39fb805…a852（上表）；产物/日志全在 /tmp/oob_ab/w104b/（accept_w104b.sh、tc_r1/tc_r2.log 秒级门、r1/ 证据存档、各夹具 compile/stderr/run）
- 探针夹具未创建未遗留（cold_nested 夹具即单变量验证物）；未 git commit；编排者 user_path_gate.* 工作目录未动；烤机 2/3 轮（多臂预算内）
