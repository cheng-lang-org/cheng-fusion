# wall99.VERIFY

## wall99 报告：`backend2_bodyir_codec_data_relocation_identity_invalid` 墙——判词富化落地实证、定性收敛，病根生产臂在 primary 池（v6 线领地），backend2 域参照臂已落地，授权边界停手移交

日期 2026-09-02。承接 wall95/wall97 小节。目标墙：cold_nested_fmt_interpolation_smoke 的 `backend2_bodyir_codec_data_relocation_identity_invalid`（w95d 实测；任务书 wall95 小节既载）。

### 判定（诚实判定：cold_nested 墙未死，判词已富化到全列实况，定性唯一收敛，修面在授权面外）
1. **复现**：kernel_driver_w95d 同输入 rc=1 目标判词（bare）；w98 驱动（14:22 烤，含 w86r 线最新 cleanup_cfg）同输入死更早的 `cleanup_cfg: managed CallOp/BodyOp authority drift`——两驱动均内嵌各自烤期流水线，w95d 为本墙参照。
2. **富化落地并烤机实证**（r2 驱动判词，单行）：
```
backend2_bodyir_codec_data_relocation_identity_invalid sealed=0 slots=22 cstrings=4 len_d=0 len_r=0 len_c=0 len_tr=0 len_oc=0 global_slots=0 bad_slot=0 bad_place=0 bad_dom=-1 bad_row=-1 bad_cid=-1 bad_lit=0 lit_id=0 lit_trow=-1 lit_ocid=-1
```
读法：unsealed、22 槽、**4 条 cstring 字面量**、五列 relocation identity 全空、global 槽 0——即守卫 unsealed 臂的「有字面量不绑不封」形状，定性唯一收敛：**data relocation identity 生产臂缺失**。
3. **生产臂定位（炸点路径）**：kernel driver 用户路径走 **primary 后端 primary lower pool**（`phase=regalloc_ledger_pre` 打点在 primary_object_plan.cheng:72200 实证）。炸点=池 worker 帧编码 `primary_object_plan.cheng:68788 payload = b2fc.Backend2BodyIrEncode(state.tempBodyIRs[i])`（worker 流：primaryLowerPoolWorkerRunIndexes → PrimaryObjectPlanEnsureFunctionLowered:66251 → PrimaryBuildBodyIrForFunction:65250）。父侧 ：69156 还有 verify 再编码同墙。**全 src/core 管线零 bind/seal 调用方**（仅两个契约 smoke 手工绑封），守卫自 8/24 e9932103c 在树即令一切带字面量 body 的编码必炸；ordinary/call_fixture 无字面量故绿。
4. **按纪律停手**：primary_object_plan.cheng = 任务书明示的 v6 线领地（"v6 线（typed_expr/regalloc_single_pass/primary_object_plan 领地）"），非「守卫所在 backend2 域」授权面。守卫本体（core_types）与 codec（backend2_frag_codec）判据零改动。

### 本臂落地（授权面内，契约对齐零弱化）
1. **src/core/backend2/backend2_frag_codec.cheng**（守卫所在文件，[wall99] 2 hunk）：
   - :950 起 `backend2BodyIrDataRelocationIdentityDiagPanic`（@borrows）：unsealed/sealed 两臂逐条实况入判词（sealed/slots/cstrings/五列 len/global_slots/首个坏槽坐标+placeKind+domain+row+cid 态/首个坏字面量坐标），列长漂移时条件化寻址取 -1，diag 自身永不 panic；判据 `BodyIRDataRelocationIdentityStrictValidate` 原样，两个 panic 点（:1055 编码尺寸路径、:3073 解码路径）改调 diag。
2. **src/core/backend2/backend2_cid.cheng**（[wall99] 2 hunk）：`Backend2ComputeFuncLowerCid` 的 6-tuple 编码核心拆出 `backend2FuncLowerCidAppend` 单一配方，双出口——原 hex str 出口（skip-lower 缓存键，字节流不变）+ 新 `Backend2FuncLowerCidFixed32`（FixedBytes32 出口，供 owner 绑定直取，杜绝 hex 往返二次解析）。
3. **src/core/backend2/backend2_pipeline.cheng**（[wall99] 2 hunk，backend2 路径参照臂）：`backend2BuildFragmentForFunction` 中 ①funcLowerCid 无条件计算（参数提升：typed 指纹/路径哈希/ABI 视图各算一次，skip-lower 开启时同值复用原语义）；②BodyIR 终态点（lower/restore 汇合、ApplyOwned/cleanup 物化后、首个编码前）插生产臂：GlobalAddress 槽未精确绑靶带全坐标硬崩（fail-closed 不猜靶）→ 逐字面量 `BodyIRBindCStringTarget(owner=Backend2FuncLowerCidFixed32(...))`（typed 级含体指纹的函数版本身份，bodyIR 内容无关无自指循环）→ `BodyIRSealDataRelocationIdentity`；③seal 门控「仅 cstrings>0」：无靶 body 保持契约第一形态 unsealed-empty（守卫 unsealed 臂明示合法），ingress 字节与既有绿面零漂移；skip-lower 缓存 blob 恒 pre-seal 态（put :1796 先于本点），命中恢复后同值重放两路字节恒等。
   - 边界如实记录：skipLower-miss 模式下 :1796 put 编码对带字面量 body 在本臂前后同样炸（守卫 8/24 落树即然，env-gated 默认关，非本臂引入）；backend2 参照臂的运行时效果未被 kernel-driver 验收矩阵行使（用户路径在 primary 池即炸，到不了 backend2 fragment build），仅秒级门+烤机零回归背书。

### 门禁与验收实况（cwd=仓库根，零抬帽，全程零 rc=125）
| 门 | 结果 |
|---|---|
| 秒级门 × cheng_w99 --emit:obj | cid/frag_codec/pipeline 三文件全 rc=0（r1 曾抓 `borrowed actual cannot bind non-var non-@borrows formal`→补 @borrows；`@borrows managed argument lacks exact live source`/`share requires exact owned source`→改 b2cid 双出口方案，borrow 纪律实证） |
| 车头 cheng_w99（clang rc=0，13 warnings 全既有 format 类） | sha256=be279867d45dcea053793ead60cdf538bda9919effaf3b52c002f74be89156b6 |
| 烤机 kernel_driver_w99（2/3 轮；r1=富化+未收窄臂，r2=终态绑定） | r2 sha256=8c5ceb55d3e296dee29f77ea85dff03664567b52d27d8ce658a98be734c0697b，size 185018784 |
| **cold_nested × w99** | compile rc=1 富化判词（上列），墙未死——炸点 primary 池 worker 授权面外 |
| ordinary × w99 | compile=0 / run=0 不回归 |
| call_fixture × w99 | compile=0 / run=1 契约预期不回归 |
| v6 × w99（只记录） | compile rc=1 `cheng_cold: exact identity schema [freeze] fn=2 op row=1 slot=3 …` + `primary exact def freeze validate rejected fn=2 …`（带全列富化 dump）——**v6 线自身已推进**：w98 期的 ownership production drift 墙已过，现停在 exact_def_freeze 墙（v6 线领地在飞，与本臂无关） |
| 租约 | v6 门遇 3 次 parent lease unavailable，90s 退避串行即消 |

### 移交下一臂（primary 池生产臂，v6 线领地裁量）
- 修面：src/core/backend/primary_object_plan.cheng。seal 点=PrimaryBuildBodyIrForFunction（:65250）末尾 wall60 不变式复核（:65640 区段）之后——该点后 ApplyOwned/cleanup 物化的全部 slot 追加已完成、worker 帧编码（:68788）在下游，与 backend2 参照臂同构。
- owner cid：函数版本身份 FixedBytes32。参照实现=backend2_cid.cheng `Backend2FuncLowerCidFixed32`（单一 6-tuple 配方双出口已备）；primary 侧若复用需补 b2cid import 并选定 typed 指纹入参（backend2 侧 `backend2SkipLowerTypedFingerprint` 为 pipeline 私有，primary 侧对等物由该线按同一契约自定，严禁自造第二身份配方）。
- 契约红线：守卫判据零弱化；GlobalAddress 槽靶表（typedIr global 行+靶 CID）为同域后续臂，未绑前照 backend2 参照臂 fail-closed 带全坐标硬崩。
- 预警：primary 池 payload/frame 字节随 seal 变化属字节敏感面；call_fixture/ordinary 无字面量零漂移。

### 交付与统计
- /tmp/oob_ab/wall99.patch（== wall99_r2.patch，vs HEAD 累积式；sha256=50be7c857d7cdf876fbbb13d36e389294a392e840c09d4835e3ddf225b6678da，399 行，reverse-check 过）；/tmp/oob_ab/wall99_r1.patch（sha256=fdedc258…6941，收窄前中间态，仅存档）
- git diff --stat 分文件（apply 前→后）：backend2_cid.cheng 0→67 行、backend2_frag_codec.cheng 0→87 行、backend2_pipeline.cheng 72（前臂既有）→162 行；numstat（后）：+53/-14、+85/-2、+133/-29
- 车头 sha256=be279867…56b6；烤机 r2 sha256=8c5ceb55…697b；产物/日志全在 /tmp/oob_ab/w99/（bake_r1/r2.log、accept_w99.sh、accept_r2.log、四夹具 compile/stderr/run、tc_*_r*.log 秒级门记录）
- 探针 zz_probe_w99.cheng 未启用（代码读证即定性）；未 git commit；编排者 user_path_gate.* 工作目录未动；烤机 2/3 轮
