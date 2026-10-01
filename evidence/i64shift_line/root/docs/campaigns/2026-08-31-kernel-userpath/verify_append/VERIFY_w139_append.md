# wall139.VERIFY

## 判定：v6 `cleanup_cfg: snapshot interface source invalid` 墙已死——r4 烤机实证判词推进至 `body ir cleanup intent: root bind invalid`（新死点=core_types `bodyIRCleanupIntentRowsValid` 对快照行 typeId<0 的第三副本拒绝，其镜像修复已在树、待 r5 烤机验证）。定性反转两次：①slot14 proof-bind 修法被 exact-def freeze schema 拒（def-less temp 必须 storage=Unknown，r3 ordinary/call 回归实证，已全量回滚，primary_object_plan 零 wall139 足迹）；②真冲突=cleanup intent 域三处 typeId>=0 副本 vs decode 权威 `BodyIRLocalSlotTypeArenaProofValid` 明文首类域 `typeId==-1 ∧ storage==Unknown`——wall135 dual-domain split 同构，镜像放行落 cleanup_cfg + core_types 两授权域。烤机预算 3/3 用尽（r2/r3/r4），按「撞契约边界停手完整移交」纪律停。门禁零回归：ordinary 0/0、call 0/1（契约）、cold_nested 0/0、车头四夹具全绿。

## 一、定性（c2 腿三段定性史）

- **进场（前任 r1 + 树内富化 hunk 引用）**：前任留 r1 驱动（10:44）+ cleanup_cfg.cheng :15205 [wall139] 判词富化 hunk（c1/c2/c3 三腿 + 全槽 k/t/s 投影），原样保留续用。r1_v6.log 逐字：`fn=3 c1=0 c2=1 c3=0 cid=e6c200dd... typeId=-1 policy=2 facts=2 locals=41 slots=[...14:k1t-1s0...]`——死腿=c2（快照源槽 typeArenaTypeId=-1），c1（arena cid 有效）c3（policy=2 Snapshot 有效）双过。wall136 移交 src=14（exit=2=`return 100 + r` 的 return 源槽）。
- **slot14 身份与真实降级路径（零烤机 potrace 实证）**：`CHENG_PRIMARY_OBJECT_TRACE=<file>` 全量 build trace 显示四条 return（:49/:51/:53/:54）**零 `phase=return_shape`**——文本臂（else + LocalInitValueSlot，前任 wall136 线猜的路径）根本不在 v6 路径；真实认领臂=语句循环 :55751 起的 **rhsNodeIndex 节点路径臂**（probe→`PrimaryBodyIrEvalNode`→`#nev{nodeIndex}` binop temp→AppendReturnTerm），EvalNode 的 binop 分支用裸 FindOrCreateSlot、无任何 proof bind 面 → slot14 恒 t=-1。
- **proof-bind 方向实证作废（r3 回归铁证）**：给 `#nev` temp 落精确 proof（返回类型表+nodes2 节点双权威）→ ordinary/call 由绿转 compile=1：`exact identity schema [freeze] ... has partial authority ... slot_name=#nev0 ... expected_storage=0`——freeze schema 明文要求 def-less 槽 storage=Unknown，带 proof 反成 partial authority 拒收。**给无定义槽盖章=违反 identity schema，方向作废**，两处 primary_object_plan 实验性 hunk 全量回滚（该文件现零 wall139 标记，与并行 wall138 零交集保持）。
- **真冲突与契约对齐**：decode 权威 `BodyIRLocalSlotTypeArenaProofValid`（core_types :8600）明文两域合法——`typeId==-1 ∧ storage==Unknown`（def-less）与 `typeId>=0 ∧ storage∈{Unmanaged,Managed}`；freeze schema 同证。cleanup intent 域却有 **typeId>=0 三处副本**：①`BodyIRCleanupIntentAppendSnapshotSource` panic 条件、②`bodyIRCleanupIntentRowsValid` 快照行检查、③cleanup_cfg 快照接口三联判 c2——滞后未镜像。修法=wall135 dual-domain split 同构：**单点共享谓词 + 三处同源镜像**，无 proof 域 typeKind 三族限定复用 `BodyIRLocalTypePlainNoAliasProof`（wall135 同源），托管/聚合槽不适用（仍必须完整 proof+定义权威，零弱化）。

## 二、修法（在树，2 文件全 [wall139] 标记；primary_object_plan 零足迹）

1. **core_types.cheng（3 hunk）**：①共享谓词 `BodyIRCleanupIntentSnapshotSourceNoProofAdmitted(slot)`（typeId<0 ∧ storage==Unknown ∧ PlainNoAlias(typeKind)，紧贴 `BodyIRLocalSlotTypeArenaProofValid` 落位）；②`BodyIRCleanupIntentAppendSnapshotSource` 拒绝条件收窄为 `typeId<0 && !NoProofAdmitted`（行内仍逐字存实际 -1；谓词计算自带界卫）；③`bodyIRCleanupIntentRowsValid` 快照行同镜像。codec 为纯 I32 列透传、sidecar 形状校验仅查行数、`SnapshotProjectionValid` 只做等值比较——下游零 -1 敏感消费面（全数核查）。
2. **cleanup_cfg.cheng（2 hunk）**：①`cleanupCfgSnapshotInterfaceCid` 签名改 `(bodyIR, sourceSlotId, policy)`，c2 腿收窄同谓词，接口 CID 域分离（proof 域编 typeId=绿路径字节逐字不变；无 proof 域编 `"plain_no_proof"` 域文+typeKind，确定性互不碰撞），失败臂富化加 `np=` 列；②两调用点（guard/return 快照）改传槽号。前任 [wall136]/[wall139] 富化 hunks 逐字保留。

## 三、烤机台账（预算 3/3：r2/r3/r4；配方=head 三件套+cold_cache+ENTRY_CACHE=0，cwd=仓库根）

| 轮 | 产物 | sha256 | size | 内容 | 结果 |
|---|---|---|---|---|---|
| r1（前任） | kernel_driver_w139_r1 | 64243209b111ff0bc1313996903ad494c2a2019f627902a210d4a4e0ee51296e | 186302304 | 进场+判词富化 | c2=1 死腿定位 |
| r2 | kernel_driver_w139_r2 | 8cca4194134d59fdb2990f204064a7e28279aedb2c94115c135d1ba8e968e512 | 186302400 | 文本臂 return-type-table bind 实验 | v6 判词原状（该臂不在路径）；ordinary 0/0 |
| r3 | kernel_driver_w139_r3 | cacb0fb37f8d7410e9cc34a462bc7a114083244ac024c634dd7f11a27de2a5c3 | 186302400 | 节点臂双权威 bind 实验 | ordinary/call 回归（freeze partial authority）→方向作废已回滚 |
| r4 | kernel_driver_w139_r4 | f3fe09124d2c005760fd526fe88b8de1d1422d0f9185e4c8b09868d10f53dc7c | 186302448 | 镜像放行（谓词+append 镜像） | **v6 推进**（见四）；四门零回归 |

秒级门：cleanup_cfg.cheng × 车头 rc=0（5.21MB）；core_types.cheng × 车头 rc=0（2.14MB）；primary_object_plan.cheng × 车头 rc=2=任务书既有雷（codegen_a64_fill_units parse，判词点名该文件非本线改动）。

## 四、v6 判词推进实录

- r1/r2/r3：`cleanup_cfg: snapshot interface source invalid fn=3 c1=0 c2=1 c3=0 ... slots=[...14:k1t-1s0...]`（compile=1）
- r4：`body ir cleanup intent: root bind invalid`（compile=1）——**本墙已死**，快照接口三联判+SnapshotSource append 双双放行，判词前移至 `BodyIRCleanupIntentBindRootCid`（其 `OriginalSourcesValid → RowsValid` 快照行 typeId<0 第三副本拒绝；该副本镜像修复已在树，r4 二进制不含）。

## 五、门禁实况（cwd=仓库根，r4）

| 门 | r4 | 车头 cheng_w126 |
|---|---|---|
| zz_v6_w7 | compile=1 `root bind invalid`（**推进**） | 0/0 |
| ordinary_zero_exit | 0/0 | 0/0 |
| call_fixture | 0/1（契约预期） | 0/1 |
| cold_nested | 0/0（wall138 领地，判词记录） | 0/0 |

## 六、移交事项（下一线）

1. **r5 首动作（预算重置后第一轮）**：直接烤机验证在树 RowsValid 镜像修复（/tmp/oob_ab/w139/bake_r4.sh 改 out=r5 即可），预期 v6 推进过 `root bind invalid`+Seal。**Seal 之后对本形（无 proof 快照源）从未跑通**：ownership-op-sites 物化、per-exit 物化、`cleanupCfgAppendOwnershipSnapshotSlotsUnit`（:13177 旗标 proof bind，源旗标 t=-1 时 bind false→「ownership snapshot type proof bind failed」，v6 无 defer 或不触发，defer 形夹具会撞）、freeze sidecar sync 均未知域，逐门如实记录勿硬凑。
2. **三处副本镜像的完整性自证**：grep `snapshotTypeArenaTypeIds` 全库仅剩 codec/lifecycle 透传与 CID 哈希列（-1 无敏感消费）；`SnapshotProjectionValid` 等值比较 -1==-1 天然通过。
3. **wall136 姊妹墙（probe A 实证，归 wall131/136 系台账）**：`@borrows` 共享借用 call arg（如 `compute(n,2)`）的 exact_def mirror 臂伪消费 → fn actions=0 → `return snapshot action authority missing`。与 wall136 已修的 setMem arg0 同族（该修只覆盖 BorrowUnique var 形参），共享借用形参未覆盖。
4. **head 三件套重建记录**：/tmp/oob_ab/w126/ 整目录已失（build_kernel_driver_w126.sh、kernel_manifest_head.cheng、cheng_cold_head.c 均不在）；重建=**/tmp/oob_ab/w139/build_kernel_driver_w139.sh + kernel_manifest_head_git.cheng（=git HEAD bootstrap/kernel_manifest.cheng）**，入口同为 backend_driver_dispatch_min.cheng，直烤通道（cheng_w126 system-link-exec --emit:exe，HEAD 车头拒 --composition-manifest 新通道，w126b 同记录）。manifest entries=36 vs r1 log 35=HEAD 已前移所致，入口一致、烤机 rc=0、产物 size 差<150B。
5. **探针台账**：zz_probe_w139_a（compute 形→撞移交事项 3 姊妹墙）/b（内联 binop→撞既有 `lowering plan: call target exact TypedExpr identity missing`，new(T) setMem 在极简 main 形的既有雷）/c（租约锁死未跑成）——已建已删，src/tests 零残留；repo 根误写 trace 文件「1」已删。
6. 仓库根残档（他线，非本线产物）：src/tests/zztmp_claude_ccfg_probe.cheng、src/tests/cold_ok_result_three_consumer_negative.cheng、src/tests/zz_probe_w138.cheng。
7. 租约纪律：wall138 并行烤机贯穿全程，probe/门禁多波 `parent lease unavailable` 全部 40-120s 退避串行消化；cold_nested 门 8 连退避后补齐。
8. 本线持久价值：potrace 定性法（`CHENG_PRIMARY_OBJECT_TRACE=<file>` 路径语义非开关，误写 cwd「1」已清）；v6 全槽 k/t/s 投影+np 列富化在树，下一线定性零烤机。

## 七、diff 统计与交付

- **/tmp/oob_ab/wall139.patch**：当前树态 `git diff HEAD` 全树生成，15287 行，73 files +8418/−1371（含 wall134-138 等并行线在途 hunks 原样照录）；`git apply --check --reverse` **PASS**（sha256=498782826504dda3a21e13739e2471527e672c38bc63d0ebd7b2ca901a4e3258）。
- **本线净增量（相对前任 r1 态）**：src/core/analysis/cleanup_cfg.cheng（gate 谓词化+CID 域分离+调用点，前任富化保留）+ src/core/ir/core_types.cheng（共享谓词+append/rowsValid 双镜像，+78 行含 wall135 系既有）。**primary_object_plan.cheng 零 wall139 足迹**（两轮实验 hunk 全量回滚）；src/tests 零残留；未 git commit、零分支/worktree；临时产物全部收在 /tmp/oob_ab/w139/。
