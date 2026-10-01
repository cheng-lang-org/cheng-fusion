# wall103.VERIFY

## wall103 报告：cold_nested backend2 codec 墙死亡——primary 池 data relocation identity 生产臂落地（bind→seal 门控 + GlobalAddress fail-closed + owner cid 六元单一配方出口），判词推进至 regalloc data symbol projection 的 ORC 记账墙（定性收敛，死点在 regalloc_production_emitter 记账契约，非授权面停手移交）

日期 2026-09-02。承接 wall99 小节（backend2 参照臂 + 病根定性：primary 池生产臂缺失）。本臂修面=src/core/backend/primary_object_plan.cheng（授权面内唯一文件）。

### 判定（本墙已死：cold_nested 判词不再出现 backend2_bodyir_codec_data_relocation_identity_invalid；BodyIR 携 sealed identity 通过 codec/ingress；新墙=regalloc_production_emit_failed code=10 detail=22，r2 dsp 判词逐列实测定性唯一收敛=ORC release 记账口径错配，死点 regalloc_production_emitter.cheng receipt 契约，停手移交）
1. **生产臂落地**（PrimaryBuildBodyIrForFunction 终态点、tempBodyIRs[i] 存储门控内，ApplyOwned/cleanup 物化与 wall60 双向复核之后）：
   - ① GlobalAddress 槽 fail-closed：placeKind==BodyPlaceGlobalAddressTag 且未精确绑靶（domain∉{TypedGlobal,Function} ∨ row<0 ∨ cid 零）→ 带全坐标硬崩（fn/slot/slot_name/slots），不猜靶；typedIr global 行+靶 CID 靶表仍为同域后续臂。
   - ② 逐字面量 `coreir.BodyIRBindCStringTarget(bodyIR, row, ownerCid)` → `coreir.BodyIRSealDataRelocationIdentity(bodyIR)`；seal 门控「仅 cstringLiterals.len>0」：无靶 body 保持契约第一形态 unsealed-empty（守卫 unsealed 臂明示合法），无 cstring 夹具编码字节与既有绿面零漂移（ordinary/call_fixture 实测不回归）。
   - ③ 存储门控内执行的理由：只有会经 worker 帧 Backend2BodyIrEncode 编码的 body 受编码契约约束；结构不完整不编码的 discovery/census 路径零扰动。
2. **owner cid 六元单一配方出口**：owner=b2cid.Backend2FuncLowerCidFixed32（epoch 盐+targetTriple+typed 指纹+sourcePathHash+排序 callTargets+过滤 importc 符号+ABI views），字节配方零二次实现。入参供给裁定（w99 授权「typed 指纹对等物按同一契约自定」的延展，如实记录）：
   - typed 指纹=新 helper PrimaryBodyIrOwnerTypedFingerprint（pobj 域对等物；backend2 侧 backend2SkipLowerTypedFingerprint 为 pipeline 私有且 backend2_pipeline import pobj，反向 import 成环不可达）。契约同款：typed 级（PrimaryObjectIr typed statement 切片，非 BodyIR 内容，无自指）、含体（逐 statement index/kind/bindingName/resultType/surfaceText/callCallee/callTarget）、决定性（本文件既有 primaryObjectSymbolIdentityAppend{U32,Text} LE 配方+sha256）、版本敏感（函数名/bodyKind/sourcePath/形参名类表/返回类型任一变即变）。
   - ABI views 元供给空集：Backend2CalleeAbiViewsForFunction 本体在 backend2_pipeline（同上成环不可达），按契约在 pobj 复刻其边→视图判定即第二配方（禁）；callee 签名区分度由 typed 指纹内调用边+类型列与第 5 元 callTargets/importc 显式编码承载，空集只降冗余不降区分度。升级点：ABI views 构造下沉 b2cid 时对齐。
   - sourcePathHash=b2cid.Backend2SourcePathHash(workspaceRoot, packageRoot, sourcePath) 原样复用。
3. **验收实况**（cwd=仓库根，零抬帽；r1 驱动=kernel_driver_w103 sha256=0be9f44373c9b624c9f1193b03ab26b351d09371d51d1e5370a1cd1cf4bcfd4d size 185051664；r2 驱动=kernel_driver_w103r2 sha256=f0eac113c3d3986787134e136f162c5b2ab408a351d5d796ef3e9d830b8914c3，唯一差异=pobj reject 路径判词富化）：
   | 门 | 结果 |
   |---|---|
   | cold_nested × r1/r2 | compile rc=2，**本墙死亡**：旧 `backend2_bodyir_codec_data_relocation_identity_invalid`（sealed=0 五列全空）不再出现；ingress=1、sealed body 编码通过、recipes 生成 words=104；死在 `phase=regalloc_production_emit_failed code=10 detail=22`（RegallocProductionEmitDataTargetInvalid，data symbol projection receipt valid=0） |
   | ordinary × r1 | compile=0 / run=0 不回归 |
   | call_fixture × r1 | compile=0 / run=1 契约预期不回归（首测 4 次租约忙，串行重试即消） |
   | r2 dsp 判词（cold_nested） | `dsp_rows=22 dsp_crows=4 dsp_slb=22 dsp_sla=22 dsp_clb=4 dsp_cla=4 dsp_rbuf=2 dsp_relbuf=2 dsp_rmvc=4 dsp_relmvc=4 dsp_free=2 dsp_orc=2 dsp_stor=1 dsp_cid=1 dsp_sha_now_eq_plan=1` |
   | v6 × r1 | 租约忙未复测（只记录；w99 期 v6 已在 v6 线自身 exact_def_freeze 墙） |
   | 烤机 | r1/r2 均成功（烤机门=真门，pobj 全管线编译含生产臂） |
4. **新墙定性（r2 dsp 判词逐列对照 receipt.valid 条件链，唯一死项）**：`dsp_orc=2 >= dsp_rmvc=4` 为 FALSE——release 窗口 `system.memReleaseCount()` 差值（2）低于 projection build 记账的 retainedManagedStringValueCount（4=cstring 符号行数；22 个空 slot 符号不计数）。其余全部子条件实 measuring 通过（含 ingressCidBefore==After、判词时刻 bodyIR ingress sha==plan sha：**bodyIR 字节零漂移，adapter prepare 只读实锤**；storageReleased、行列长度前后相等、physicalFree 2>=2）。机理=regalloc_production_emitter.cheng `regallocProductionReleaseDataSymbolProjection`（:847-850）的 ORC 断言口径：retained 按行记账（每 cstring 符号 CloneStr 计 1），而 freeSeqStrRelease 批量释放的实际 memReleaseCount 按堆释放事件计数（空串/池化不触发），两者对 cstring 符号错配；无 cstring body（ordinary）rmvc=0 断言恒真故恒绿。**死点文件=src/core/backend/regalloc_production_emitter.cheng（regalloc 领地，v6 线 regalloc_single_pass 领地在飞），非本臂授权面，按纪律停手移交。**
5. **秒级门归因（如实记录：门本体既有缺口）**：任务书秒级门车头 /tmp/oob_ab/cheng_final 现场不存在；以树内车头（cheng_now5/cheng_w103）执行 `--in:primary_object_plan.cheng --emit:obj` 均 rc=2，报错定位于 `codegen_a64_fill_units.cheng:9/:472 trailing tokens in let initializer [19667 bytes]`（SHA fill 单元，8/28 e61d9e904 落树）。归因实证：①基线变体（本臂三处编辑全部反向打掉）同款 rc=2；②单编 codegen_a64_fill_units.cheng 同死；③同车头编 backend2_cid.cheng rc=0；④**烤机路径（build_kernel_driver.sh，含 pobj 全管线）r1/r2 rc=0 成功**——emit:obj 单文件门死于 a64fill 巨型 let × 当前解析器（既有缺口，非本臂引入），烤机门为准。
6. **并行交会记录**：验收窗口遇 w101b 驱动同窗口编 cold_nested（并行线同夹具在推），租约冲突 5+ 次、120-150s 退避串行即消；r2 的 ordinary/call_fixture 复验窗口仍持续租约忙——r1 已实证不回归，r2 与 r1 唯一差异为 reject 路径判词（绿路零改动，cold_nested 在 r2 走到同一 reject 判词点=该路径生效证明），不构成回归。

### dsp 判词富化（r2 驱动承载，reject 路径 wall84 同款仅判词）
pobj regalloc_production_emit_failed 判词新增 `dsp_rows/dsp_crows/dsp_slb/dsp_sla/dsp_clb/dsp_cla/dsp_rbuf/dsp_relbuf/dsp_rmvc/dsp_relmvc/dsp_free/dsp_orc/dsp_stor/dsp_cid/dsp_sha_now_eq_plan`——dataSymbolProjectionReceipt 逐列实况 + 判词时刻 bodyIR ingress sha 与 plan（before）sha 等值观测。

### 契约红线自查
- 守卫判据零改动：coreir.BodyIRDataRelocationIdentityStrictValidate/Bind/Seal 原样调用，零弱化。
- 身份配方唯一：owner cid 只经 b2cid.Backend2FuncLowerCidFixed32 出口；pobj 侧仅供给入参（typed 指纹对等物授权自定、ABI views 空集裁定、无第二 6-tuple append 实现）。
- backend2 参照臂（w99 落树）未动；backend2 三文件本臂零改动。
- 主树只改 src/core/backend/primary_object_plan.cheng：import 面 +2 行（b2t/b2cid）、helper 1 个（PrimaryBodyIrOwnerTypedFingerprint）、生产臂 1 块、判词富化 1 处。

### 移交下一臂（regalloc data symbol projection ORC 记账，regalloc 领地裁量）
- 修面：src/core/backend/regalloc_production_emitter.cheng `regallocProductionReleaseDataSymbolProjection` 的 `orcReleaseCount >= retainedManagedStringValueCount` 断言（:847-850 区段）。方向裁量：①记账口径改按实际堆占用（非 SSO/非池化）计数；②改用确定性证明（freeSeqStrRelease 返回值/长度守恒）替代进程级计数断言。注意 memReleaseCount 为进程级计数器，窗口内含他处释放噪声，断言本身语义已弱。
- 本臂生产臂与判词富化 hunks 已在树（/tmp/oob_ab/pop_wall103.patch），下臂烤机直接承载。
- 实证产物：/tmp/oob_ab/w103/cold_nested_w103r2.stderr（dsp 全列）、cold_nested_w103.stderr（r1 形态）、accept 脚本与日志同目录。

### 交付与统计
- /tmp/oob_ab/pop_wall103.patch（== pop_wall103_r2.patch，vs HEAD 累积式含树内既有 w17…w92 hunks + 本臂；1017 行；reverse-check PASS；sha256=6d392f496297ca060c25c7072b2a9c1b7b628b9c8ceec94827c83c6f7257e475）；中间态 /tmp/oob_ab/pop_wall103_r1.patch（生产臂初版，判词富化前）
- git diff --stat（apply 后全程）：src/core/backend/primary_object_plan.cheng 466+73 → 621+/−73（本臂净 +155/−0；判词富化后 621）
- 车头 /tmp/oob_ab/cheng_w103 sha256=5baadf58292e48b2e59d5a67bbeaa843d9940cadccf83ca688b1c2252f797704（clang bootstrap/cheng_cold.c，13 warnings 全既有 format 类）；烤机产物 sha256 见上表；产物/日志全在 /tmp/oob_ab/w103/（bake_r1/r2.log、accept_w103.sh、accept_r2.sh、accept_r2_retry.sh、各夹具 compile/stderr/run、tc_*.log 秒级门记录、pobj_full/no_arm/baseline.cheng 二分归因变体）
- 探针 zz_probe_w103.cheng 未启用（cold_nested 夹具即单变量验证物，未创建未遗留）；未 git commit；编排者 user_path_gate.* 工作目录未动；烤机 2/3 轮
