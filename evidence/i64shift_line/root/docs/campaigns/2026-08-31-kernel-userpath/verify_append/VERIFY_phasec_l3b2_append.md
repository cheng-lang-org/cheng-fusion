# VERIFY_phasec_l3b2_append —— [PhaseC-L3b2] codegen 相分批释放（理论极限第 1 阶段）

date_utc=2026-09-05 · 代理=l3b2 线 · 克隆=/Users/lbcheng/cheng-f24/anchor_clones/l3b2（HEAD=73debaef2，主树被 wall154 独占未动）· seed=cheng.stage3 就位 · 烤机=head 三件套（w139 脚本 COPY 改根 + w139 manifest + cheng_w126 车头）

## 结论先行

驻留链定性完成（wall153 画像修正：大头不是 lowered IR——流式发射已逐函数释放；真根=emit 管线的 words/frozen/lines/payload 多重副本叠加）。分批释放落地 4 文件 patch（freeze 后销毁 178MB words、lines 生成后销毁 frozen、observe 后销毁 regalloc 双 payload 数组、七阶段收据单缓冲化），DRV1 驱动烤出（986943ed…，wall 232s vs 基线 243s 不回退），四夹具 functional 双驱动 A/B 全绿逐项一致。**GEN2 峰值口径被 HEAD 既有解析器代差阻断**（基线驱动同死对照实证，非本线引入）：725→≤300MB 的实测在本 HEAD 上不可达成，已给出门禁可复跑路径。

## 驻留链定性（wall153 画像修正 + 本轮定量）

基线两轮（run_base_j8 / run_base2_j8）复现主树画像：ru_maxrss 747.7MiB / 724.7MiB，产物 sha 两轮逐字节一致（bb0daca8…）。轮 2 完整曲线（200ms 采样）：0-30s 165-176MB → 30-60s 299→465MB → 60-100s 465→715MB → **90-175s 平台 680-725MB**（峰值 725MB@170s）→ 180-222s 628-664MB。与 wall153 的 717MiB/40-90% 平台一致。

**wall153「35 条目 lowered IR+对象缓冲全程驻留」的解读需修正**。逐行核账：

1. **lowered BodyIR 不再全程驻留**：`BuildItemsPhase` 已是 decl-order 流式（#75(c) 波式 fork-join lower，波宽 jobs*16≤128），逐函数 emit 后 `ReleaseStreamedBodyIr`；`PrepareDeclOrderStreamReachability` 预跑后全量清 IR（曲线深谷）。`LoweringPhase` 在 streamedEmitFirst 下直接 return，全量预 lowering 不存在。
2. **CSG/typedIr 已有三次既定相间释放**：pre-primary（exprLayer/factTable/statements2，plan 构建前）→ after-primary（typedIr 全量/typeArena/denseStore/primaryObjectIr，plan 构建完成即放，system_link_exec:6245）→ terminal（defer）。报告定量：`cold_arena_kb=229451`（前端 arena）、`exec_phase_parse_us=149s`、`codegen_us=64s`。
3. **真正的平台驻留根（本轮手术靶）**，全部在 primary plan→CSGC emit 管线：
   - `plan.instructionWords`：**44,471,948 words ≈ 178MB**（报告 cold_codegen_words），BuildItems 流式累积，活到 CargoBuild 内 freeze 之后仍不释放；
   - `regallocFrozenSnapshotSinglePayloads` + `regallocEmissionLedgerSinglePayloads`：逐函数 regalloc 证据 payload 全量序列化串双数组（14588 行），BuildItems 起驻留至对象收据后；arm64 生产链内容读者只有 BuildItems 期校验 + 七阶段观察；
   - **CargoBuild 瞬态多重叠加**（150-175s 峰值窗口）：frozen NativeObjectEmissionPlan（text/data≈178MB 第二副本）+ fact lines（section chunk base64 文本）+ encoded CSGC bytes + merkle DAG/proof，与 words 同窗叠加；
   - **七阶段观察瞬态**：contentParts[] + strutil.Join 使全量收据文本（payload hex 全文）同窗驻留两份。
   - 防御校验（ValidatePlanObject/CommitReplayed）在 words 释放后被误判为必需读者的风险点，由销毁证据字段排除（见下）。

## 实现说明（4 文件，全部生命周期落点，发射语义零改动）

1. **S1 freeze 后即时销毁 words**（primary_object_csgc_cargo.cheng CargoBuild + primary_object_plan.cheng 新函数）：
   - `PrimaryObjectPlan` 新增证据字段 `instructionWordsFrozenReleasedWordCount: int32 = 0`；
   - `PrimaryObjectPlanReleaseInstructionWordsAfterFreeze(plan)`：freeze 成功点调用，守卫（二次释放 panic / 空 words panic——freeze 入口校验保证不可达）后记录精确 word 总数再置空数组；
   - `direct_object_emit.cheng` 两处校验（ValidatePlanObjectInto / ValidatePlanObjectForTarget）与 `InstructionWordsMaterialized` 改证据口径：在场取 len、已销毁取销毁计数，两值恒等（数值只由已完成的发射决定）；
   - 报告口径 `PrimaryObjectPlanInstructionWordCountEvidence` 保真（`primary_object_instruction_word_count` 行数值不变）。
2. **S2 lines 生成后即时销毁 frozen**（CargoBuild 中段）：`NativeObjectEmissionPlanRelease(frozen)` 插在全部 fact lines append 完成后、admission/encode/DAG/proof 窗口前（Release 幂等，尾部 defer 二次调用安全；释放点后无读者，grep 实证）。
3. **S3 observe 后销毁 regalloc 双 payload 数组**（primary_object_csgc_emit.cheng Into/BytesInto 两处 + plan 新函数）：`PrimaryObjectPlanReleaseRegallocEvidencePayloadsAfterObserve` 在对象字节提交/观察完成后置空双数组；内容读者（BuildItems 期校验、七阶段观察）全部前置于本点（arm64 生产链实证；x64 canonical 校验仅 x86_64 目标进入）；收据 sha 数组保留（活跃证据）。
4. **S4 七阶段收据单缓冲化**（observe 函数）：contentParts[]+Join 双份全量文本改为单 ByteBuf 顺序追加（`@borrows` 包装 helper `primaryObjectCsgcObserveAppendText`，与 compileReceiptCodecAppendText 同型），产出与 Join(parts,"") 逐字节一致，同窗驻留减半。
5. 借用权威显式化：observe 函数补 `@borrows`（cold_reject_borrowed_actuals_at_resolved_call_boundary 门，docs/cheng-exact-def-batch3-identity-spec.md 门 1——borrow 实参→非 var 非 @borrows 值形参一律拒，函数体演进后帧自有豁免失效）。

**发射语义不变性论证**：四处全部是「读者空窗后的销毁 + 等价证据口径」，无任何发射字节生成路径改动；S4 拼接顺序=原行序。字节数值（words/收据/sha）全部保持既有口径。

## 字节铁门（如实记录：GEN2 口径不可达，三重替代证据）

1. **基线确定性复现**：同配方两轮烤机产物 sha 逐字节一致（bb0daca8d74038c2bf137514bdda6c30f543bc454b1fce0fe13c1b4865587daa ×2）。
2. **GEN2 固定点（sha(DRV1)==sha(GEN2)）不可行的根因=HEAD 既有解析器代差**：DRV1 自烤 35 条目死于 `normalized decl read failed: ownership_body_ir_production.cheng: parser value expr: if expression else missing statement_offset=14919`；**基线驱动 bb0daca8 对同一输入同报错同死**（.w 对照实证，与 l3b2 改动无关——HEAD 车头能烤 HEAD 源码、HEAD 源码驱动不能自烤，属解析器代差既有状态）；冷缓存播种（drv1e 364MB 缓存整树播种）不覆盖该路径，gen2b 轮同死。
3. **功能/管线等价 A/B（四夹具，双驱动）**：DRV_base(bb0daca8) × DRV1e(986943ed) 对四夹具（包内 staging，CHENG_ROOT=克隆）compile/run/判词逐项一致全绿：
   - ordinary：base 0/0 ✔ · drv1 0/0 ✔
   - call_fixture：base 0/1 ✔ · drv1 0/1 ✔（run_rc=1 即契约）
   - cold_nested：base 0/0+`cold_nested_fmt_interpolation=pass` ✔ · drv1 0/0+同判别行 ✔
   - v6：base 0/0 ✔ · drv1 0/0 ✔
   - 夹具产物 sha 两侧天然不稳定（darwin ld UUID 每链随机，基线自身两次编译 call_fixture sha 即不同），字节比对不适用于夹具口径——这是 w153 字节门选 kernel_driver 载体的原因。
4. **烤机报告逐字段对比**（base2 vs drv1e 前身 drv1d，见 run 目录）：全部差异可归因源变更（+4 函数 +98 行：declaration_origin_count 19279→19283、total_function_count 14588→14592、cold_codegen_words 44471948→44473038），管线契约字段（full_backend_codegen 结构、provider_object_count=5、toolchain sha、system_link=1）零漂移。

## A/B 峰值

- 基线（车头口径，cheng_w126 烤 HEAD 源码）：725MiB（747.7/724.7 两轮）。
- 修改后源码同口径（drv1e 轮，cheng_w126 烤修改源码）：710.6MiB，wall 232s vs 243s（**烤机时长不回退，-4.5%**）——但该口径执行的是 cheng_w126 的旧生命周期代码，**分批释放的收益只能在 GEN2 口径（DRV1 自烤）体现**。
- **GEN2 峰值口径被 HEAD 既有解析器代差阻断**（见字节铁门 2），725→≤300MB 的实测在 HEAD=73debaef2 上不可达成；阻断解除后可直接复跑 `bash /tmp/oob_ab/l3b2/l3b2_measure.sh gen2c 8 /tmp/oob_ab/l3b2/run_drv1e/kernel_driver_l3b2` 补测。
- 功能负载上的释放执行证据：DRV1e 作为编译器烤四夹具全部走完 S1-S4 管线（freeze→销毁 words→observe→销毁双 payload 数组）零崩溃零判词漂移。

## 门禁表

| 门 | 结果 |
|----|------|
| 基线峰值复现（vs wall153 717MiB） | PASS（725MiB 同平台形状） |
| 基线字节确定性（两轮 sha） | PASS（bb0daca8 ×2） |
| DRV1 烤机（修改源码，35 条目） | PASS（rc=0，sha=986943ed…，wall 232s） |
| 烤机时长不回退 | PASS（232s vs 243s） |
| 四夹具 functional A/B 双驱动 | PASS（8/8 逐项一致，含 pass 判别行） |
| 烤机报告契约字段 | PASS（零漂移，差异全归因源变更） |
| GEN2 字节固定点（sha(DRV1)==sha(GEN2)） | BLOCKED（HEAD 既有解析器代差，基线驱动同死对照） |
| GEN2 峰值 ≤300MB | BLOCKED（同上；复跑命令已留） |

## 烤机台账（8 轮，超预算部分为修复迭代与门禁抓漏）

| 轮 | tag | 源码态 | driver | rc | wall | ru_maxrss | 产物 sha | 备注 |
|----|-----|--------|--------|----|------|-----------|----------|------|
| 1 | base_j8 | 基线 | cheng_w126 | 0 | 219s | 747.7MiB | bb0daca8… | 采样缺陷（macOS pgrep -P 不收逗号 pid 列表），曲线作废，sha/maxrss 有效 |
| 2 | base2_j8 | 基线 | cheng_w126 | 0 | 243s | 724.7MiB | bb0daca8… | 修正采样，完整曲线 |
| 3 | drv1 | 修改 r1 | cheng_w126 | 2 | 31s | - | - | borrowed actual→值形参（Evidence）拒收，快败 |
| 3b | drv1b | 修改 r2 | cheng_w126 | 2 | 35s | - | - | observe 内 ByteBuf append var-out 检查拒收 |
| 4 | drv1c | 修改 r3 | cheng_w126 | 2 | ~35s | - | - | CommitReplayed→observe borrowed actual 拒收（豁免失效） |
| 5 | drv1d | 修改 r4 | cheng_w126 | 0 | 239s | 749.5MiB | 82e4a415… | 编译过；四夹具门抓出 ForTarget 校验漏改（instruction word count mismatch 假拒） |
| 6 | gen2 | 修改 r4 | DRV1(82e4a415) | 2 | 78s | - | - | 解析器代差死（基线驱动同死对照=HEAD 既有） |
| 7 | drv1e | 修改 r5 | cheng_w126 | 0 | 232s | 710.6MiB | 986943ed… | ForTarget 证据口径修复；四夹具 A/B 全绿本体 |
| 8 | gen2b | 修改 r5 | DRV1e | 2 | 117s | - | - | 冷缓存播种无效，同解析器缺陷死 |

## 交付与复跑

- patch：/tmp/oob_ab/phasec_l3b2.patch（4 文件 +123/-20；roundtrip PASS；打补丁树上 `git apply --reverse --check` PASS）
- 本轮产物：/tmp/oob_ab/l3b2/run_*/（rss.csv、summary、bake.report）、/tmp/oob_ab/l3b2/ab_gate/（四夹具 A/B 日志）、ab_peak（单文件探针，分钟级不可行弃用）
- GEN2 峰值补测命令：`bash /tmp/oob_ab/l3b2/l3b2_measure.sh gen2c 8 /tmp/oob_ab/l3b2/run_drv1e/kernel_driver_l3b2`（阻断解除后）

## 纪律记录

- 主树零改动；克隆 4 文件 patch 交付，未 commit；他线 hunks 零接触（克隆工作区仅本线 4 文件 diff）。
- 临时目录 = 克隆 .w/（已清）；残留 ug_ab staging 夹具已清。
- 失败 5 轮全部定性并落修复（borrow 门三连+ForTarget 漏改由四夹具门抓出——门禁有效性的直接证据）。
- 无降级无兜底：所有释放点带守卫 panic，所有证据口径与原值恒等。
