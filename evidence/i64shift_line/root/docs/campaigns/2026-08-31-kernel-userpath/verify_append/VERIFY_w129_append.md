# wall129.VERIFY

## 判定：cold_nested canonical CFG 块数组序墙（BodyIrCfgErrorBlockRange=4）已死。修后 kernel_driver_w129_r3 判词推进到下游新域墙 `data_reloc_no_fill_record`（primary 数据重定位填装，主函数与 nestedFmt 两函数体均已通过 plan 构建+regalloc ledger 封印发射 words=104/66）；既绿门全保持（ordinary 0/0、call 0/1、v6 判词逐字不变）；车头语义参照 3/3。授权面（cleanup_cfg.cheng / ownership_body_ir_production.cheng）内穷尽推进，无契约弱化。新墙属并行领地（primary_object_plan/regalloc_production_emitter 侧），按纪律停手完整移交。

日期 2026-09-04。车头=HEAD 提取件 /tmp/oob_ab/cheng_w126（sha256=0f198c5e6266597ff888e81a24fced244669d32b24b49b894cb8b51887c35d89）；烤机配方=w126/w126b 三件套（/tmp/oob_ab/w126/build_kernel_driver_w126.sh + kernel_manifest_head.cheng + 车头）+ CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w129/cold_cache + CHENG_ENTRY_CACHE=0，cwd=仓库根。

### r1 进场基线说明（如实报备）
进场判词基线未另烧烤机：w126b 线 3 小时前刚在同一墙、同一配方上逐字记录（kernel_driver_w126b，/tmp/oob_ab/w126b/acc_kd_cold_nested.log：`regalloc_plan_cfg_diag code=4 block=1 slot=-1 detail=8` + `body_kind=regalloc_production_emit_failed … primary0=primary_object_machine_words_missing`），其树态与本线进场态在授权面内零差异。三轮烤机预算全部改投修法迭代（每轮均产出驱动与增量定性），未见信息损失。

### 修法定性（三轮实证闭环）
1. **r1（bc456ad8…，重排路线证伪轮）**：按 w126b 修法方向(b) 实现「物化收尾 canonical 重分割（(opStart,旧序) 稳定排序重建 blocks[]）+ 全量 remap（terms true/falseBlock、successorBlockIds CSR、blockScopeIds、deferActivationSiteBlockIds、scheduleDraft 块号列）+ BlockRange 同判据自证」，插在 stage materialize 内、schedule 封印之前（此时 schedule 全列与 CID 尚未出生，天然出生于重排后布局；intent/plan 的 original 坐标系列与 immutable control identity 经逐列核对均不含块数组序，零触碰）。结果：原 CFG 墙死（regalloc ledger 通过），但新死点 `body ir cleanup schedule: root bind invalid`——`bodyIRCleanupScheduleCoverageValid` 的块扫描（**位置≥intent.originalBlockCount 的块必须是 unit 成员或 owner 锚**）与 CFG 分区门联立后，中块 split 的 continuation（b5/b6，锚，持前段 op 行 3-7）迫使非锚 original 块（b3，op 9）落入扫描区位置 5——**可证明任何事后块重排/插入均无解**（空块 tie 序穷举）。
2. **r2（2408c76d…，块尾 split v1）**：修法收敛到 `cleanupCfgPrepareOwnershipOpSites` 的 split 点本身——中块 split 改块尾 split（prefix 保留全部 op、continuation 空载体携带原 term、unit 链插块尾与 term 之间；transition unit 只写合成 flag 槽、原 op 零引用、块内无出口边，块尾放置与中块放置块粒度数据流恒等且支配性不变）。continuation.opStart 暂取 originalEnd(8)：被本线自证拦截（`canonical block order partition drift block=2 opStart=8 expected=9`——空 continuation 与 b1 的 os=8 撞 tie，分区要求 ≥9）。
3. **r3（c41247e8…，终态）**：continuation.opStart 改取 `bodyIR.ops.len`（cleanupCfgAppendReturnBlock 同款空块先例）→ 追加区按 (opStart,旧序) 稳定排序后无缝全覆盖分区，schedule seal、自证、regalloc plan 全部通过。**原墙判词（regalloc_plan_cfg_diag code=4 / regalloc_production_emit_failed）消失。**

### 门禁与验收实况（cwd=仓库根；kernel_driver_w129_r3）
| 门 | 结果 |
|---|---|
| 秒级门（cleanup_cfg.cheng × cheng_w126 --emit:obj） | rc=0（三轮均过） |
| cold_nested_fmt_interpolation_smoke × r3 | compile rc=2，判词推进：`body_kind=data_reloc_no_fill_record fn=_cheng_program_source_entry abort=data_reloc_no_fill_record primary0=primary_object_machine_words_missing`（reason=missing_call_target code=6 detail=140 primary_missing=3）；`regalloc_plan_cfg_diag code=4` 墙判词消失；两函数 ledger 全绿（main actions=155 words=104 relocs=26、nestedFmt actions=68 words=66 relocs=13） |
| ordinary_zero_exit_fixture × r3 | compile rc=0 / run rc=0 不回归 |
| call_fixture.cheng × r3 | compile rc=0 / run rc=1 契约预期不回归 |
| zz_v6_w7.cheng × r3 | compile rc=1，判词与 r1/r2 逐字相同（`ownership body ir production: ingress … code=15 site=2 index=22 … phase=4746`+wall128_cfg_kill_dump）——本线改动对其路径零扰动，并行 derive 线领地只记录 |
| 同夹具 × 车头 cheng_w126 | cold_nested compile=0/run=0 `cold_nested_fmt_interpolation=pass`、ordinary 0/0、v6 0/0 |
| 烤机 | 3 轮实烤全部产出行（预算 3/3 用尽，无误燃）：r1=bc456ad823b4e19caad3b6321827538e7c7584750dfa39fe611f329991ecc925、r2=2408c76d9af2c60178190c99d79f65d1343dd0c7063ec6567747aca944d0f5ac、r3=c41247e8386a174d81f89f3d5b45634a31ab351dc28d326c6d8b4a2a9a34245e（均 186203616 字节） |
| 验收期租约 | 2 次 `parent lease unavailable`（csg merkle store flock，并行线烤机），60s 串行退避后全过；未产驱动，不计烤机轮 |

### diff 统计与交付
- **/tmp/oob_ab/wall129.patch**：单文件 src/core/analysis/cleanup_cfg.cheng，3 hunks（全带 [wall129] 标记），234 insertions / 9 deletions；当前树态 `git apply --check --reverse` **PASS**。同文件他人 hunks（wall121 等 10 个）原样保留、不在 patch 内；ownership_body_ir_production.cheng 本线零触碰（未 git commit；无探针夹具残留，未开分支/worktree）。
- hunks：① `cleanupCfgPrepareOwnershipOpSites` 块尾 split（[wall129] 注释块）；② 新函数 `cleanupCfgRemapBlockIdForCanonicalOrder` / `cleanupCfgRemapScheduleDraftBlocksForCanonicalOrder` / `cleanupCfgCanonicalizeBlockOpArrayOrder`（排序+全量 remap+自证，含 scheduleDraft remap；intent/plan original 坐标系与 immutable control identity 经核对零触碰）；③ `cleanupCfgStageMaterialize` 内 `cleanupCfgMaterializePreparedOwnershipOpSites` 之后、`BodyIRControlFlowSeal` 之前的 canonicalize 调用。
- 核心证据 log（/tmp/oob_ab/w129/）：kd_cold_nested.log（r3 终态判词）、bake_r1/r2/r3.log、accept_out.txt、cfg_full.diff（文件全量 diff）。
- **烤机轮如实计数**：3/3，全部 productive（r1 证伪+定性、r2 自证拦截+数据、r3 终态）。

### 移交事项（下一线）
1. **新墙 `data_reloc_no_fill_record`（primary_missing=3）**：cold_nested 两函数体 plan/ledger/emission 已全通过，abort 在 primary 数据重定位填装记录缺失（fmt 插值字符串字面量的 data 段 reloc）。域=primary_object_plan / regalloc_production_emitter / data-reloc 填装链（并行活动领地，本线零触碰）。判词原文见上表与 /tmp/oob_ab/w129/kd_cold_nested.log。
2. **canonicalize 安全网为终态保留**：正常布局下恒等（identity），异形时 fail-closed（判词前缀 `cleanup_cfg: canonical block order …`）。
3. r1 结论对后续线有效：**cleanup sealed 契约（CoverageValid 位置≥originalBlockCount 扫描 + unit 区间 ≥originalBlockCount）禁止一切把非锚块挪过 B0 边界的重排**；任何后续 CFG 序类修法必须走「块尾 split」同款结构修法，禁事后排序。
