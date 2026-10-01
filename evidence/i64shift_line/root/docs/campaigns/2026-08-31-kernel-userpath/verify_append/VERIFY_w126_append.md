
# wall126.VERIFY

## wall126 报告：cold_nested `fn=1 op row=4 consume edge is broken recorded=-1` 墙未死——r1 修法实验（cleanup_cfg 物化尾 move-event 补戳臂）实烤证伪后，trace 全列 dump 把定性推进到契约边界：消费记在 manual-consume 域（decode 明文「physical BodyOp row is therefore not a cp1 contract」，body_ir_access:5527），freeze 审计漏认该域，**唯一合法修面=exact_def_freeze.cheng 审计容忍臂，授权面外，按纪律停手完整移交**；主树零残留（cleanup_cfg 精确还原进场态 +108/−12 vs HEAD），r1 驱动上 ordinary 0/0、call 0/1（契约预期）、车头 cold_nested 0/0 pass、车头 v6 rc=0 零回归

日期 2026-09-03。授权面=src/core/analysis/exact_def_derive.cheng + src/core/analysis/cleanup_cfg.cheng。车头=/tmp/oob_ab/cheng_w126（HEAD 提取件 /tmp/oob_ab/w126/cheng_cold_head.c，`clang -std=c11 -O2 -I bootstrap`，sha256=0f198c5e6266597ff888e81a24fced244669d32b24b49b894cb8b51887c35d89；在途 bootstrap/cheng_cold.c 直烤复现 `cold object cache store payload identity failed` 既有缺口同 w122/w124，按配方降级 HEAD 提取件）。烤机配方=head 三件套（HEAD build 脚本复刻 /tmp/oob_ab/w126/build_kernel_driver_w126.sh + HEAD kernel_manifest /tmp/oob_ab/w126/kernel_manifest_head.cheng + cheng_w126）+ CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w126/cold_cache 任务级隔离，rc=0。

### 判定（撞契约边界停手，墙未推进，完整移交）
1. **r1 修法实验（已还原）**：按 w124 移交候选「cleanup_cfg 物化域落戳」实现 `[wall126] cleanupCfgStampLoweringConsumeColumn`（物化收尾 SyncAppended 之后，append-only managed-move-event 拼写逐列镜像 BodyIrAccessAppendOnlyManagedMoveEventExact，OwnMove∧cp1==0∧consumeActionRow==-1 收窄）+ CHENG_CC_W126_TRACE 门控物化收尾 op/call 全列 dump，烤 kernel_driver_w126（sha256=fd76f50eccf24db7a5b77a4c0e4118f998ff48493b14c2d3cf665dfa5bc93dac，size 186055296）。实测 cold_nested 判词逐字不变（fn=1 op row=4 … recorded=-1）→ **op5 非 move-event 形，臂不命中**；实验件按纪律整体还原，主树零残留（git diff vs HEAD 进场态复现 +108/−12，零 wall126 字样；/tmp/oob_ab/wall126_r1.patch 即 r1 实验全量 diff 存档，sha256=86c66b0dd4b59a490a01a17cf85a4e95fcf967603439accf144249cc3a427956，**最终合并 patch 不存在=主树零改动**）。
2. **trace 全列实况（fn=1 物化收尾态，/tmp/oob_ab/w126/cn_w126_trace.log）**：`op=4 k=2(Call) t=2 vds=2 vdo=2(Move) sdom=0 srow=-1 act=-1 cp1=0 call=0 msk=0 rs=2 rpk=3(Sret) args=(字面量@addr,slot3)` ——nestedFmt 调用结果暂存 slot2，TypedExpr 权威完整；`op=5 k=2 t=0 vds=0 vdo=2 sdom=0 srow=-1 act=0 cp1=11 call=1 msk=0 rs=0 rpk=3 args=(slot2,slot1)` ——绑定胶水 call 经 **slot 编码 Move 实参**（argDefOpRows→4，argOwnerships=Move，derive 批 2 已落 CSR）消费 op4，自身 sret 定义 slot0；`op=10 … sdom=2 srow=5 act=0 args=@0` ——scope 尾 drop 单元 source 边消费 op5（cp1=11 已落）。
3. **定性（机理闭环，四证联立）**：op5 消费 op4 的证据在 CSR 通道②（Move 实参）与 manualConsume 域双记，而 cp1(op4)=0。publisher（ownershipBodyIrPublishExactCallArgConsumers）漏戳的唯一自洽解释=该 fact 被 `fact.manualConsumeRow < 0` 过滤（publish 侧明文）→ **call1 是 manual-consume call**（op5/call1 consumeActionRow=0=manualConsume 行 0 的域内记账；decode 侧 `BodyIrAccessManualConsumeRowForCall` 命中后 bind 照常）。decode 终审今日放行 def4 走 manual-consume 臂/wall116-admit，其 :5527-5546 明文契约：**"Manual-consume has its own sealed definition authority. … A physical BodyOp row is therefore not a cp1 contract"**——manual-consume 消费的 def 的 cp1 按设计恒 0（publisher 过滤同证）。freeze consume-edge 审计通道②（exactDefFreezeCallArgReference）**无 manual-consume 豁免**，把该消费计入 consumers 并按 brokenNoRecord 要求 cp1 列 → 双域分裂=墙根因。C 权威无此矛盾：cold_attach_exact_managed_consume 在发射点即时落列（「consume 列与分类器一个契约」），C 侧从不出现 manual-consume 未戳形。
4. **in-surface 修法逐一证伪（全部违反契约，不可走）**：(a) 我方 stamp cp1 → final decode cp1!=0 臂 exactCallArgConsume 需 `fact.manualConsumeRow < 0`（假）且 canonicalConsume 需 source 边（op5 无）→ canonicalConsume=false → `ownership body ir production: … ownership invalid` 必死；(b) derive 批 2 落戳（w124 候选一）→ 同 (a)，decode 必死；(c) 篡改 CSR argOwnerships 让通道②不计消费 → 伪造证据，禁。**幸存修法=exact_def_freeze.cheng 审计容忍臂（授权面外）**。
5. **移交修法 spec（freeze 线执行）**：exact_def_freeze.cheng `exactDefFreezeConsumeEdgeAudit`（:2080 brokenNoRecord 组装处）新增容忍臂：def 的 cp1==0 且其唯一消费来自 manual-consume call（`bodyIR.manualConsume.callOrdinals` 含 consumer 的 callOrdinal 且该 effect 的 sourceDefinition==(BodyOpTag, def)，与 decode manual-consume 臂同域谓词）时，豁免 brokenNoRecord（mirror decode :5527 契约，零弱化：manual-consume 消费已由 decode 证明「unique consuming fact + CFG replay」，审计只是补认 decode 已承认的域）。备选（不推荐，动两文件且翻 :5527 契约）：production publisher 改收 manual-consume fact + decode exactCallArgConsume 放行 manual-consume fact，两侧同改。
6. **v6 驱动路判词已迁移（并行线领地只记录）**：v6 × kernel_driver_w126 rc≠0，判词=`ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=9 detail=0 fn=3 …`（/tmp/oob_ab/w126/v6_w126_compile.log）——与 w122/w124 记录的 `csg semantic parameter type drift addCol` 不同点，系并行 v6 线改动 exact_def_identity/exact_def_derive 后的驱动路新态，非本臂产物（r1 臂不命中态）。

### 门禁与验收实况（cwd=仓库根；RSS 零抬帽；零探针夹具残留）
| 门 | 结果 |
|---|---|
| 秒级门（车头编 cleanup_cfg.cheng obj，r1 实验态） | rc=0 |
| 秒级门（复原终态同门） | rc=0 |
| cold_nested × kernel_driver_w126（r1 实验驱动） | compile rc=1，判词与 w124 移交态逐字同（本墙未推进，机理与移交 spec 见上） |
| cold_nested × 车头 cheng_w126 | compile=0 / run=0，`cold_nested_fmt_interpolation=pass`（语义参照） |
| ordinary_zero_exit × w126 驱动 | compile=0 / run=0 不回归 |
| call_fixture × w126 驱动 | compile=0 / run=1 契约预期不回归 |
| zz_v6_w7 × 车头 | compile rc=0（回归门过） |
| zz_v6_w7 × w126 驱动 | rc≠0 新判词 `ingress BodyIR ownership invalid … fn=3`（并行线领地只记录，见判定 6） |
| 烤机 | 1/3 轮（r1 修法实验+trace；边界停手后无后续轮次） |

### 交付与统计
- **主树**：零改动（r1 实验件已精确还原；进场/离场 `git diff --stat HEAD -- src/core/analysis/cleanup_cfg.cheng` 同为 `108 insertions(+), 12 deletions(-)`，他线 hunks 原样在树；未 git commit）。exact_def_derive.cheng 全程零触碰（vs HEAD 恒 0 diff）。
- **/tmp/oob_ab/wall126.patch：不存在**（主树零改动无最终 patch 可交）；/tmp/oob_ab/wall126_r1.patch 为 r1 实验存档（sha256=86c66b0d…，git apply --reverse --check rc=0 于实验态）。
- 烤机产物：kernel_driver_w126 sha256=fd76f50eccf24db7a5b77a4c0e4118f998ff48493b14c2d3cf665dfa5bc93dac（size 186055296，r1 实验态，非交付驱动）；车头 cheng_w126 sha256=0f198c5e6266597ff888e81a24fced244669d32b24b49b894cb8b51887c35d89。
- 作业目录 /tmp/oob_ab/w126/：cn_base/cn_lead/cn_w126_compile/cn_w126_trace（trace 全列=移交核心证据）/ordinary/call/v6 门禁 log、bake_r1.log、head 三件套、cold_cache/。零探针夹具残留（trace 为 r1 驱动内 env 门控代码，已随还原移出主树）；他人资产（含 user_path_gate.* 工作目录）零触碰。


# wall126.VERIFY（v6 index=9 FieldStore 线；与前文 wall126（cold_nested 线）同名异域，本节=派发方 2026-09-03 深夜对同一 w126 号的第 2 次派发）

## wall126(v6) 报告：v6 `ingress BodyIR ownership invalid code=15 site=2 index=9 detail=0 fn=3 op_kind=15` 墙未死（烤机预算 3/3 用尽，按纪律停手），但判词两轮富化落地（115 个 Ownership fail 点 phase 打标 + errorDetail 槽 diag 联立坐标），定性从「index=9 FieldStore 新形状」钉进到单行单门单 killer 域：**phase=4746 = body_ir_access.cheng bodyIrAccessVerifyDefinitionCfg 终态 CFG replay 的 states[slot]<0 门（HEAD 既有门，非新臂）**；diag 钉死注册来源=slot0 唯一定义 `d3:k2:o2`（new(Node) CallOp 直盖 slot0/OwnMove），managed-replace 行与 manual-consume 行全空；杀手=op3 与首次 FieldStore 之间某 op 对 (BodyOp,3) 的 consume（CSR exact-call-arg 或 scalar 通道二选一，+38 新 Kill 通道为头号嫌疑；bind 胶水对 slot0 的 sret def 盖章缺失=生产侧缺口）。r3 落地的 replace-row Kill 镜像守卫因 replacerows 空对 v6 不触发（如实记录：未推进本墙），ordinary compile=0/run=0、call_fixture compile=0/run=1（契约预期）不回归；头车 v6 compile=0/run=0 回归门过

日期 2026-09-03。授权面=src/core/ir/body_ir_access.cheng + src/core/analysis/ownership_body_ir_production.cheng（任务书写 src/core/backend/ 系笔误，真实路径 src/core/ir/，与前线记录一致）。车头=/tmp/oob_ab/cheng_w126：在树 bootstrap 直烤（sha256=f6358cdd618d9afcce37da77a95fe26bc3942bb55715f2cccdd60a0d6f94372b）复现 `cold object cache store payload identity failed (recovery=0 depth=1)` 既有缺口（同 w122–w126 记录），按既录配方降级 HEAD 提取件（clang -std=c11 -O2 -I bootstrap，sha256=0f198c5e6266597ff888e81a24fced244669d32b24b49b894cb8b51887c35d89，与 cold_nested-wall126 线记录逐字节同源）。烤机配方=head 三件套（/tmp/oob_ab/w126/build_kernel_driver_w126.sh + kernel_manifest_head.cheng + 车头）+ CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w126/cold_cache；在树 tools/build_kernel_driver.sh 走 --composition-manifest 新通道被 HEAD 车头拒（`system-link-exec invalid argument`，ts-csg 迁移中态）故用 head 三件套，与前线同。

### 判定与机理（①富化→②定性闭环，探针族+双烤实测）
1. **①富化第一轮（phase 打标）**：body_ir_access.cheng 全部 115 个 BodyIrAccessErrorOwnership fail 点机械改写为 bodyIrAccessFailPhase（phase=fail 调用首行在进场文件中的 1 基源行号），BodyIrAccessTable 增 errorPhase 列（0=未打标），ingress/materialized 判词追加 `phase=`。脚本 /tmp/oob_ab/w126/tag_phases_w126.py，进场快照 body_ir_access.pre_w126phase.cheng。烤机 r2 实测钉门：**phase=4746**，即 `bodyIrAccessVerifyDefinitionCfg` 终态 replay 循环内 `states[fact.slotIndex] < 0` fail（进场源行 4746；该门本身系 HEAD 既有，diff 仅 fail 改名）。
2. **门语义**：op9/op6/op10（三探针+ v6 的 FieldStore 基使用）的 base Use fact 落在托管 slot（mg=2），`managedDefinitionCountBySlot[slot]>0` 使门生效，而 CFG replay 到该 op 时 `states[slot]<0`（Consumed/Unreached）=该槽无存活已跟踪托管定义。decodeField 自身、枚举门（全空 op 全 conjunct 为假）、manual-consume 验证器、defer-replay、explicit-edges 逐门静态排除（detail=0 与各门 detail 语义联立不符），唯 4746 相符。
3. **探针族（kernel_driver_w126 秒级实测，src/tests/zz_probe_w126.cheng 用后已删）**：v6 删减版（Node/Box+addCol+main 前缀）fn=1 index=9 同判词 slots=20；E2（单一 new+标量字段存 `n.cnt=5`）index=6 detail=0 同 phase——**首次托管基使用即死**；F（int32 var 形参供 new 解析、零托管 var-arg）index=10 detail=4 同 phase——manualConsume 注册贡献排除；D（var 形参函数不调用）死于更低层 `lowering plan: call target exact TypedExpr identity missing`（new 解析需 var 形参被调用，既有门非本墙）。⇒ 形状=`var n: Node; n = new(Node)` 后对 n 的首次字段访问。
4. **①富化第二轮（diag）**：ownership_body_ir_production 新增 ownershipBodyIrAccessRejectDiag（errorDetail 槽的 def-census/replace 行/manual-consume 行联立坐标），ingress 与 materialized 判词在 code=15 时追加。r3 实测 v6：`slot0defops=d3:k2:o2 replacerows= mcrows=`——slot0 唯一已盖章定义=op3（CallOp/OwnMove，new(Node) 直盖 slot0），**fn=3 无任何 managed-replace sidecar 行、无 slot0 manual-consume 行**。
5. **②定性结论（机理闭环）**：注册（BuildManagedDefinitionIndex vd_own≠Invalid 谓词）与 Gen（BuildDefinitionCfg 同谓词）一一对应、Kill 带预检（4504），故 states[0]<0 于首用 ⇒ (BodyOp,3) 在 op3 后、首用前被某 op 的 Kill 清掉且无 re-Gen：唯一候选=bind 胶水 call 对 (BodyOp,3) 的 exact-call-arg CSR consume（+38 在树新通道，wall108 系接线；HEAD 无此通道=cheng_now5 同输入 0/0 旁证自洽）或 scalar sourceDefinition 通道；胶水对 slot0 的 sret def 盖章缺失（defops 仅 d3）=生产侧（primary_object_plan 域）缺口。两候选的判别需「ops 0..index 逐 op sourceDefinition/CSR 消费列 dump」，授权面内判词函数（ownershipBodyIrAccessRejectDiag）已就位，下一线一轮烤机即可钉死。
6. **③修法（r3 落地，未推进本墙如实记录）**：[wall126] replace-row Kill 镜像守卫（per-fact 精确收窄：仅跳过密封 managedLvalueReplace 行站点上与 sidecar sourceDefinition 对精确相等的 exact-call-arg Kill；转移权威=sidecar，与 manual-consume「physical BodyOp row is not a cp1 contract」同构；fail-closed 自证四点见源码注记）。v6 实测 replacerows= 空 ⇒ 守卫对本墙不触发、判词逐字未变——**未推进，留树理由=契约对齐臂（replace 站点 bind-transport 语义），回归门全绿佐证零回归**；如评审认为无失败案例不应留树，revert 该守卫（body_ir_access 内 2 hunk，phase/diag 富化不受影响）。

### 门禁与验收实况（cwd=仓库根；RSS 零抬帽零 rc=125；并行线瞬态租约冲突以串行退避重试消解）
| 门 | 结果 |
|---|---|
| 秒级门（车头编 bia/obip --emit:obj，每轮改动后） | r2/r3 共 4 次，全 rc=0 |
| 烤机 r1（基线）/r2（phase）/r3（守卫+diag） | 全 rc=0；r3=kernel_driver_w126 sha256=0c85a61bdec3b8c14b6b712982403950a05aa9333627985bfce95778e584730e size=186137712（r2=9eebffd6…,186104736；r1=7ec24549…,186055344） |
| v6 × r3 驱动 | compile rc=1，判词同 4746 + diag 全坐标（本墙未推进，见判定 4/5） |
| ordinary_zero_exit × r3 | compile=0 / run=0 不回归 |
| zz_call_fixture_w7 × r3 | compile=0 / run=1 契约预期不回归 |
| 头车 × v6（回归门） | compile=0 / run=0（车头与树改动无关，语义参照保持） |
| cold_nested | w86r 并行线领地，本轮零触碰零运行（只记录） |
| 烤机预算 | 3/3 用尽（r1 复现/r2 钉门/r3 守卫+diag），后续臂无预算，按纪律停手移交 |

### 交付与统计
- /tmp/oob_ab/wall126.patch（1768 行，两授权文件累积 vs HEAD 以当前树态生成=在树 w39/42/73/82/106/108/110/121b 等 hunks 原样照录+本轮 phase 打标/errorPhase/diag/replace 守卫；`git apply --check --reverse` 当前树 PASS；sha256=bb3a59bf8b63750cf938d49923d0eda9470e91db94e1631139ff5c31157d1d99）。
- git diff --stat：进场 bia 293 行面/obip 136 行面（合计 +381/−48）→ 离场 bia +483/−162、obip +140/−34（合计 +623/−196）；本轮净 +242/−148（115 点打标 +115/−115、wrapper/struct/diag/守卫注释与代码为余量）。未 git commit；zz_v6_w7.cheng 等他人资产零触碰；zz_probe_w126.cheng 用后已删。
- 作业目录 /tmp/oob_ab/w126/：probeC/D/E/F log、v6_w125_repro/v6_w126_compile（diag 全坐标=移交核心证据）、ordinary/call 门禁 log、bake_w126.log、tag_phases_w126.py、phase_map_w126.py、body_ir_access.pre_w126phase.cheng、cheng_cold_head_w126b.c、drun.sh（租约退避）、cheng_w126_head_backup。
- 移交（下一线，授权面=按定性落点）：①判别 killer 通道——扩 ownershipBodyIrAccessRejectDiag 加 ops[0..index) 的 sourceDefinition 对+CSR 消费列 dump，一轮烤机钉死；②修面二选一：(a) 生产侧恢复 bind 胶水对 slot0 的 sret def 盖章（primary_object_plan 域），(b) decode 侧 bind-transport 守卫（按胶水 call-row resultSlot==被消费 def 槽 ∧ resultOwnership∈{Move,BorrowShared} 跳过该 Kill，与本轮 replace 守卫同构、per-fact 精确）；③若评审裁定本轮 replace 守卫应回退，revert body_ir_access 内 [wall126] 两 hunk 即可（phase/diag 富化独立无损）。
