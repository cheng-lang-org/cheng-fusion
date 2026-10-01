# wall141.VERIFY

## 判定

wall139 移交首动作**完成且实证**：r5 烤机验证在树 RowsValid 镜像修法成功——v6 判词推进过 `body ir cleanup intent: root bind invalid` + Seal（该形首次跑通），前移至物理物化段新墙 `cleanup_cfg: captured-old release authority mismatch`。新墙已定性闭环至物理冲突级（r6 判词富化轮，dump 解码 + 消费戳写入点唯一化）：**子条件 7 =「release 产者定义必须未消费」被触发，op4（TypedExpr call 定义，originId=semanticRow=10，slot0）被同站点前序 action0（copy unit，consume op=45/actionRow=0）盖戳消费后，action1（DropPlace，actionId=0，TypedExpr 产者权威，cor=自指）再次以 op4 为释放产者**。根因域=odir 流格（ownership_drop_ir.cheng，授权面外、wall117b/120 领地）：流格在 Move 已重置源 place 事实（mask=Moved/producer=-1，:2328-2335）之后仍以 Move 前的 Initialize 产者权威规划了该 DropPlace。按「撞契约边界停手」纪律停：修面必在 odir 流格（cleanup_cfg 侧无契约完备修法——跳发=破物化 complexity ledger，拒收=换判词不清墙），余预算 2 轮不足以支撑「流格取证+修+验」安全周期，硬凑风险不可接受。烤机预算 2/4 用（r5/r6），r7/r8 原封移交。四门零回归；cold_nested 0/0（wall140 领地修法在树生效）。

## 一、v6 判词推进实录（墙链）

| 轮 | v6 判词（compile=1） | 阶段 |
|---|---|---|
| r4（wall139） | `body ir cleanup intent: root bind invalid` | intent bind（RowsValid 第三副本拒 t=-1） |
| r5 | `cleanup_cfg: captured-old release authority mismatch`（裸判词） | **过 bind+Seal**，物理物化 per-exit/op-site drop unit |
| r6 | 同判词 + 富化 dump：`action=1 kind=3 ids=0 cor=1 pok=1 poid=10 opid=4 ops=49 d_own=2 d_srow=10 d_slot=0 tgt=0 d_ok=1 d_oid=10 d_cons=46 d_car=0 tx=1 oldr=0 mpr=1 fldr=0` | 同上，定性数据齐 |

枚举解码：kind=3=CleanupActionDropPlace，pok=1=DefinitionOriginTypedExpr，d_ok=1=BodyDefinitionOriginTypedExprTag，OwnMove=2（过 validator :5346），tx=1=capturedTargetExact，oldr=0/mpr=1/fldr=0。

## 二、定性链（零烤机代码闭环 + r6 dump 互证）

1. **失败门**：cleanup_cfg.cheng `cleanupCfgAppendOwnershipDropUnit` 失败臂（原 :12867，现富化）。七子条件中 1/2/3/4/5/6 全过（d_own=OwnMove ✓、d_srow=10≥0 ✓、tx=1 ✓、origin 族 ✓），败因=子条件 7：`d_cons=46≠0 ∨ d_car=0≠-1`——产者定义已被消费。
2. **消费戳唯一化**：全文件 valueDefConsumeOpIndexPlusOne+valueDef consumeActionRow 成对盖戳点仅 `cleanupCfgAppendOwnershipCopyUnit` :10868-10873（SimpleCallUnit/RetainValue 不盖 valueDef 对；:12096 为 fragment 迁移车道非新授权；:12893+ 为 field 投影臂且要求先 `==0`）。d_cons=46=opStart45+1 → op45=action0 copy unit 的 `first` op（append 于 :10892 即 opStart）→ **action0=StoreMove/StoreOwned copy unit，源=op4(slot0)**。
3. **到门路径唯一解**：poid=10≥actionRow=1 排除 MaterializedManagedDefinitionOp synthetic 臂（:12674 必炸"producer authority invalid"未现）；op-site surface 门 :4986-4987 强制 capturedOldSourceDefinitionRow==-1 排除 :11130 captured-old 边；唯一自洽路径=:11149-11158 managedTypedProducerDrop 臂（ids=0 ∧ DropPlace ∧ TypedExpr，surface 门 :4933-4936 明文收）→ MaterializedManagedDefinitionOp TypedExpr 臂（:12614-12664，diag 三项过）→ opid=4。
4. **物理冲突**：op4 被 action0（copy unit 源消费盖戳）与 action1（DropPlace 释放产者）同流点双主张。plan 侧双消费门 :8723-8737 比较四元组 (originKind, originId, sdom, srow)，两动作 originId 不同 → 漏放（物理重定位后同指 op4，wall64 重定位域的盲点形态）。
5. **odir 根因域**：ownership_drop_ir.cheng `ownershipDropMove` :2285-2335 实证 Move 后源 place mask=Moved/producer=-1，其后 Drop 规划会被 `!ownershipDropMaskHasLive` :2556 跳过或降为无权威 plain action（surface 门 :4976-4984 Unknown 臂）→ 正确流格永不产出本对。现产出了 → Drop 规划时刻读到的 place 产者事实（Initialize/TypedExpr 权威）与 StoreMove 已入列的时序矛盾，疑点在流格状态线程化/边重发（wall117b :8704-8711「按 exit 边从共享 pre-edge 态重发」域）或 op-site CSR 多 op 行拼接 (:11218-11243) 的状态语义。**此为下一线的 odir 取证点，非本线可闭。**
6. **语义后果（为何 fail-closed 正确）**：若放行，drop unit 将二次盖戳 op4（clobber action0 消费记录，破坏 exact-def freeze 身份链）并发射对 moved-from 槽的 drop glue 调用=双释放。车头 C 链 v6 0/0 值语义正确（无泄漏无双放），kernel 链必须等价——门零弱化，修面只能在 plan 侧不再产出该对。

## 三、修法（在树，[wall141] 1 hunk）

- cleanup_cfg.cheng captured-old 失败臂判词富化（wall139 同法）：纯读投影 20 列（action/kind/ids/cor/pok/poid/opid/ops/d_own/d_srow/d_slot/tgt/d_ok/d_oid/d_cons/d_car/tx/oldr/mpr/fldr），零语义变化，秒级门 cleanup_cfg × 车头 rc=0（.o 5.22MB）。下游线任何复现即得全投影，零烤机起步。
- 本线未动 wall139 及更早 hunks（grep wall141 全 diff 仅 1 处标记）；primary_object_plan/exact_def/core_types 零足迹；src/tests 零残留（探针 zz_probe_w141_a 已建已删——极简 new(T) main 形撞既有 `lowering plan: call target exact TypedExpr identity missing` 雷，与 wall139 probe_b 同录，隔离复现不可行）。

## 四、烤机台账（预算 2/4：r5/r6；配方=复刻 bake_r4.sh，manifest=w139/kernel_manifest_head_git.cheng，driver=cheng_w126，cwd=仓库根）

| 轮 | 产物 | sha256 | size | 内容 | 结果 |
|---|---|---|---|---|---|
| r5 | kernel_driver_w141_r5 | 45b4f311e8ad15fbb9c2ee1587a238a213978724d990239fab87e466342bf6af | 186302448 | 在树 RowsValid 镜像验证（wall139 移交首动作） | **v6 推进过 root bind+Seal**；四门零回归 |
| r6 | kernel_driver_w141_r6 | c2e5026209b41987bf1d30c6ce8afe43761a8b73393e0b46d01511029ed94158 | 186318864 | captured-old 失败臂富化（定性轮） | dump 全投影到手；三门零回归 |

秒级门：cleanup_cfg.cheng × 车头 r6 前后 rc=0（w141_ccfg_r6.o 5221620B）。租约：本轮无 parent lease 冲突（wall140 线安静）。

## 五、门禁实况（cwd=仓库根）

| 门 | r5 | r6 | 车头 cheng_w126 |
|---|---|---|---|
| zz_v6_w7 | compile=1 `captured-old release authority mismatch`（**推进**） | compile=1 同判词+全投影 dump | 0/0（r=7/offset=8/arena.n=108 语义参照） |
| ordinary_zero_exit | 0/0 | 0/0 | 0/0 |
| call_fixture | 0/1（契约预期） | 0/1（契约预期） | 0/1 |
| cold_nested_fmt_interpolation_smoke | 0/0（wall140 领地，判词记录：已全绿） | 0/0 | 0/0 |

## 六、移交事项（下一线，预算 r7/r8 未动）

1. **修面必在 odir 流格**：ownership_drop_ir.cheng。建议首动作=在 `ownershipDropApplyOp` 的 OwnershipDropOpDrop 臂（:2798）或 op-site 动作规划处 dump 该站点的 odir ops/places 表（placeIndex、producerOpId、mask 时序），核实「Drop 规划时 producer=Initialize 而 StoreMove 已先行入列」的具体 op 序；重点排查 wall117b 共享 pre-edge 态重发 (:8704-8711 注) 与 op-site CSR 拼接 (:11218-11243) 的状态线程化。修法方向：Drop 规划遇源 place 产者已被同站点更早动作消费时，要么不出该 DropPlace（mask 纠正），要么降为无权威 plain 形（Unknown 臂天然可物化，capturedDefinitionOpId=-1 路径零 cond7）。
2. **cleanup_cfg 侧禁区**：跳发=破 :16353 物化 ledger；拒收/收紧 :8723=换判词不清墙；两者皆非修法。
3. **姊妹墙预警（wall139 移交事项 3 仍开放）**：@borrows 共享借用 call arg exact_def mirror 伪消费（wall136 setMem arg0 修法只覆盖 BorrowUnique var 形参）。本墙与其同在 owned-arg/释放权威域，修 odir 时建议联立勘察。
4. **r6 驱动含富化**（kernel_driver_w141_r6 仍在 /tmp/oob_ab/w141/）：任何触发该门的夹具即得全投影，无需重烤即可续取证。
5. 复烤配方：`/tmp/oob_ab/w141/bake_r5.sh` 改 out/rN 即用（内含租约退避 8×45s）；门禁脚本 `/tmp/oob_ab/w141/gates_r5.sh`（改 KD 变量）。
6. 仓库根残档（他线，非本线产物）：src/tests/zztmp_claude_ccfg_probe.cheng、cold_ok_result_three_consumer_negative.cheng 等仍在（wall139 移交事项 6 原样）。

## 七、diff 统计与交付

- **/tmp/oob_ab/wall141.patch**：当前树态 `git diff HEAD` 全树生成，15300 行，73 files +8422/−1372（含 wall7-139 各并行线在途 hunks 原样照录）；`git apply --check --reverse` **PASS**（sha256=2a1013fe03341b4cf2d86dec5a51540304e178b3813bf8d6d9af387063edacbb）。
- **本线净增量（相对 wall139 交接树态）**：仅 src/core/analysis/cleanup_cfg.cheng captured-old 失败臂富化 1 hunk（+10/−2 含 [wall141] 标记）。未 git commit、零分支/worktree；临时产物全在 /tmp/oob_ab/w141/。
