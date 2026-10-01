# wall142.VERIFY

## 判定

**`captured-old release authority mismatch` 墙已清**：r1 烤机验证 odir 释放产者权威唯一主张镜像修法成功，v6 判词推进过 cleanup_cfg 物化段全程（regalloc ledger 三 fn 全 valid/frozen），前移至 exact_def_freeze 段新墙 `cheng_cold: read-edge unresolved op=35 operand=1 slot=26 candidates=1 opkind=14 dst=27 a=26 b=27 c=0` + `read-edge freeze fail row=3 fn=3` + `cold BodyIR physical-source canonicalization invalid`（compile_rc=2）。新墙经 P3''/P2 双判别探针实证**独立于本线修法**（单 exit 零降级行同撞 read-edge），系本面之后多墙链的第一道，属 exact_def_freeze 领地（wall86/81/126 系），按「撞契约边界停手」停。四门零回归；烤机预算 1/4 用（r1），r2/r3/r4 原封移交。

## 一、墙心定性（零烤机代码闭环：w141_r6 判词复现 + 4 探针二分）

1. **触发形**：main 持托管局部 `n: Node`（`n = new(Node)`，bodyIR op4，TypedExpr origin=semanticRow，slot0），4 个 return exit 全部 live。odir 流格对每条 return 边各规划一次 DropPlace（同产者权威四元组 TypedExpr/originId/BodyOp/op4，actionId=0，consumeActionRow=自指）——**语义全对**：一条执行至多经一条 return 边，4 次释放互斥且必要（C 链 0/0 同形全通）。
2. **死点**：物化级消费账本每定义仅一个 consume 槽。exit0 drop unit 过 cond7 门后在 `cleanup_cfg.cheng:12956-12965` 盖 release 消费戳（valueDefConsumeOpIndexPlusOne=callOpIndex+1=46，consumeActionRow=0）；exit1 drop unit cond7 读到 d_cons=46≠0 → `captured-old release authority mismatch action=1`。wall141 误判消费戳写入点唯一（:10868 copy unit）——:12963 drop unit release 戳同样成对盖写，且失败动作是 **exit 侧动作**（odir 边清理，非 op-site；wall141 的 op-site 表面门推理不成立，生产构建器只 Append Initialize/Consume，op-site 动作列恒空，物化走 :13362 exit 孪生臂）。
3. **探针定案**（w141_r6 与 r1 双驱动，探针建删零残留）：
   - probe_B（v5 形，去直调）：w141_r6 同判词（poid 10→9 随行移）→ 墙非 v6 专属，v5 形同墙；
   - probe_C（main 单 return）：w141_r6 与 r1 均过本墙、撞更后 `exact identity schema [freeze] #canonical_return_snapshot#plain#11`（rc=1）→ 多 exit 是触发必要条件；
   - probe_D（直调-only outer）：形不洁（unused param）撞 ingress 前置墙，作废；
   - P3''（单 exit + 字段读，r1）：**零降级行仍撞 read-edge 墙** → read-edge 独立于本线修法；
   - P2（4 exit 无 n 后置读，r1）：过 read-edge、过 identity-schema，死于更后 `cheng_cold: export root cheng_ref_drop_owned not found` → 暴露第三道墙（[wall118] ref glue 冷链 export 根未注册）。
4. **修法契约依据**：wall120 消费唯一性扫描（odir :4734-4757，MayCoexecute 精确 CFG 可达谓词）+ cleanup_cfg [wall117b] 计划层「不同 return 边互斥消费合法」豁免，已在计划层承认互斥双消费合法；本修把同一互斥语义镜像到物化授权层，系 wall117b 自身契约的跨段补全，非弱化。wall141 移交方向之二「降为无权威 plain 形（Unknown 臂天然可物化，capturedDefinitionOpId=-1 路径零 cond7）」命中。

## 二、修法（在树，[wall142] 1 hunk，授权面内）

`src/core/analysis/ownership_drop_ir.cheng` `ownershipDropBindManagedProducerActionAuthority` 重排：候选产者权威列（TypedExpr 镜像 producer 全列 / Synthetic 镜像 canonical store 动作行）先算后写；写前扫描动作表同四元组 (originKind, originId, srcDomain, srcRow) 且 consumeActionRow>=0 的在先主张：

- 无在先主张 → 照旧绑定全权威（可审计链保持）；
- 有在先主张且 `ownershipDropActionsMayCoexecute`=true（同边/同路径可达）→ `ownership_drop_ir: release producer authority coexecutes` fail-closed（真双消费，旧码本就死于消费扫描/cond7，无回归面）；
- 有在先主张且不可共存（典型：不同 return 边）→ 降级为 Unknown 全哨兵 plain 形（计划验证器 :4724 fall-through 既有合法形），物化层 releaseDefinitionOpId=-1，不盖戳、零 cond7，drop glue 仍按计划条件完整发射。

守卫零弱化论证：首主张保持全权威+消费戳（精确身份链唯一可审计）；降级仅发生于互斥谓词证明不可共存之时；同四元组可共存对在旧码必 fail（消费扫描 :4756 先炸），故零「fail→pass」翻转、零漏放。净增 +183/−14，单文件秒级门 rc=0（w142_odir.o 791561B）。

## 三、烤机台账（预算 1/4：r1；配方=w139 脚本复刻 bake_r6.sh，manifest=w139/kernel_manifest_head_git.cheng，driver=cheng_w126，cwd=仓库根；w126 烤脚本已不在盘，按 wall141 实际通道）

| 轮 | 产物 | sha256 | size | 内容 | 结果 |
|---|---|---|---|---|---|
| r1 | kernel_driver_w142_r1 | b75d3f1dfbaa095adbd204a711c6a01a765d5aff71e59dea64255725b3c3dd37 | 186318864 | odir 释放产者权威唯一主张镜像 + 互斥降级 plain 形 | **v6 过 captured-old 墙**，判词前移 read-edge freeze（rc=2）；四门零回归 |

秒级门：ownership_drop_ir.cheng × 车头 rc=0。租约：烤机零冲突；门禁/探针期系统租约被并行线（w143 探针在树）长占，call/cn/ctl_b 以 60s×N 退避补跑。

## 四、门禁实况（cwd=仓库根，r1 驱动）

| 门 | r1 | 车头 cheng_w126 |
|---|---|---|
| zz_v6_w7 | compile=2 `read-edge unresolved … fn=3`（**本墙清除，前移**） | 0/0 |
| ordinary_zero_exit | 0/0 | 0/0 |
| call_fixture | 0/1（契约预期） | 0/1 |
| cold_nested_fmt_interpolation_smoke | 0/0 `=pass` | 0/0 |

判词推进实录：`cleanup_cfg: captured-old release authority mismatch action=1 …`（rc=1，wall141 判词逐字复现）→ `cheng_cold: read-edge unresolved op=35 operand=1 slot=26 candidates=1 opkind=14 dst=27 a=26 b=27 c=0` + `read-edge freeze fail row=3 fn=3` + `cold BodyIR physical-source canonicalization invalid`（rc=2）。

## 五、移交事项（下一线，预算 r2/r3/r4 未动）

1. **新墙 A（read-edge freeze，exact_def_freeze 领地）**：`ExactDefFreezeCompleteReadEdges` 对 fn=3(main) op35/op31（opkind=14=FieldLoad，读 n.col 借视投影槽 slot26/22，**candidates=1**）解析零命中——`ReadSourceEdgeValid` 六子检查（type/producerFn/placeKind/ownership/paramLane/isCurrent）逐项取数 dump 为首动作（exactDefFreezeReadEdgeUnresolvedLine 现仅有 6 列，建议失败臂富化 20 列，wall139/141 同法零烤机起步）。已实证：与降级臂无关（P3'' 零降级同撞）、与多 exit 无关性未证（P2 无读形过 read-edge）。
2. **新墙 B（export root，link/provider 领地）**：`cheng_ref_drop_owned not found`（P2 形）——[wall118] 只接了 CleanupPlan glue 绑定，冷链 export 根未注册；与 read-edge 墙独立（P2 过 read-edge 后撞）。
3. **姊妹墙仍开放**：identity-schema freeze `#canonical_return_snapshot#plain#11 partial authority`（ctl_c 形，rc=1）——wall139 移交事项 3 的 exact_def mirror 域。
4. cleanup_cfg 侧禁区不变：跳发破物化 ledger、收紧 cond7=换判词不清墙；本线未触碰 cleanup_cfg/exact_def_freeze 任何 hunk。
5. 复烤配方 `/tmp/oob_ab/w142/bake_r1.sh` 改 out/rN；门禁 `/tmp/oob_ab/w142/gates_r1.sh`（改 KD）；判别探针全在 /tmp/oob_ab/w142/（probe_v5like / probe_c_main_single / probe_p3_single_exit_reads / probe_p2_no_post_reads），src/tests 零残留（脚本自清+终态复核）。
6. 并行线警示：w143 探针（zz_probe_w143_streqlit.cheng）在树，租约高 contention，补跑须 60s 级退避。

## 六、diff 统计与交付

- **/tmp/oob_ab/wall142.patch**：当前树态 `git diff HEAD` 全树生成，17567 行，84 files +8854/−1386（含 wall7-141 各并行线在途 hunks 原样照录）；`git apply --check --reverse` **PASS**（sha256=ff79e4fb2d2a933d1169125313b18b435310bbe7eb9d90b00dbb3c7b22bdaa86）。
- **本线净增量（相对 wall141 交接树态）**：仅 src/core/analysis/ownership_drop_ir.cheng 1 hunk（+183/−14，含 [wall142] 标记 ×3）。未 git commit、零分支/worktree；临时产物全在 /tmp/oob_ab/w142/。
