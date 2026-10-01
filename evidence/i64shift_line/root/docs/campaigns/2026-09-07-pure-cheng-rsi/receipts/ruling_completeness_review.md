# 裁定书完整性与措辞风险复核（只读回执）

- 受审件：`docs/cheng-rsi-acceptance-ruling.md`（31 行，2026-09-14 第 96 轮）。对照：`docs/cheng-rsi-acceptance-status.md` §6.1cg–§6.1cr、§7.0；`receipts/{evidence_reconciliation,verdict_table_restored,post_wall_runbook,ledger_numbers_recheck,c1c2_contract_delta,tier3_prereq_recheck,tier3_gap_plan}.md`。
- 只读：未编译、未取 `.rebuild/COMPILE_SLOT.lock`、未改任何既有件、未建分支/worktree；唯一新建 = 本件。

## 1. 逐节可执行性

- **裁定项 1（L5–L9）**：现势/证据/请裁定三件齐。请裁定 = 单一是/否（L9），用户可直接答。风险：把「重录 + 无缓存 judge + 自检 11 例」三件打包成一个"证据面"，不能拆分接受。
- **裁定项 2（L11–L15）**：二选一（接受工具承担 / 要求接线 cdomain），可直接答。风险：**现势（L12）只说"主链可交付"，未说现役 cdomain 判词 = 两档 `INCONCLUSIVE_DEP(missing_phase_readings)`、`phase_rows=0`**（verdict_table_restored.md:17-18、§6.1cl:876）——C1/C2 至今没有产出过 PASS，用户会把"可交付"读成"已达标"。
- **裁定项 3（L17–L21）**：现势机械、数字已用 T2 更正（81 份而非"唯一"），请裁定 = 接受不交付 + 三缺口列后续，可直接答。轻微打包（不交付 / 列后续 / 三前置绑在一句）。
- **跨项阻塞（L23–L26）**：**不可执行**。只陈述阻塞与"非本席可解"，**无请裁定、无选项**；§7.0 第 8 条明确给了「三条出路（请用户择一或指定顺序）」+ 本席建议（§7.0:1020-1021），裁定书全漏。用户读完无法就阻塞作答。

## 2. 漏掉的关键事实（对裁定有影响）

1. **现役判词缺失面**：cdomain 档 0/1 = `INCONCLUSIVE_DEP reason=missing_phase_readings`、`phase_rows=0`；A9b p = `INCONCLUSIVE_DEP rows=0`、n/n0 = PASS（verdict_table_restored.md:14-18）。裁定项 2/3 与阻塞节均未点明"C1/C2 无绿判词"。
2. **阻塞三条出路**（§7.0:1020-1021）：①内核线清墙（推荐）②给 C 链补逐相发射点（`bootstrap/cheng_cold.c`，D1/D2 线在飞、本席不碰）③用户裁定 tier0/1 豁免逐相（与 c1c2 合同 v1.2 冲突，改变达标定义）。裁定书未给，用户无从择一。
3. **§7.0 第 1–7 条用户裁定项全部未出现**：第 1 条「锚贴线 vs 768 门」明说"二选一须用户定，因为它改变'什么算达标'"（§7.0:1009-1010）；另有配对口径 12/3/9（:1011）、kernel §6.2 措辞（:1012）、`gate_run.sh` 硬编码 `gate=default(768MiB)` 标签失真 71/114（:1013）、档 3 配对口径（:1014）、gate 轮身份字段 0/14（:1015）、槽位仲裁（:1016）。
4. **`tier3_static_verdict.txt` 已过时**：记 835/1172，现树 848/1184（`compiler_domain.cheng` sha `60dfe56f`），"不得沿用"（§6.1cm:911、tier3_prereq_recheck.md:88）。裁定项 3 未登记。
5. **抬门标签纪律有反例**：裁定书 L29 称"所有抬门轮一律标诊断件"，但 81 份达 234 的 summary 全为抬门轮、却带 `gate=default(768MiB)` 失真标签（ledger_numbers_recheck.md:16；tier3_prereq_recheck.md:89）。
6. **L4 工具仍有未修缺陷**：F4/F5/F6（ledger 归因、空选项目志、int32 回绕、`ParseInt` 静默 0、按 `sem_` 删共享 workDir）未改（§6.1cg:801）；残余②基线写盘早于清场判据、`anchor=rc_only` 平价未实现（§6.1ci:835-836）。裁定项 1 未披露。
7. **S6 三态实测不可复算**：合成样本 `/tmp/a7_assert_smoke2/valid.txt` 已不在盘，只有键数 44 与硬门值可复算（ledger_numbers_recheck.md:54；§6.1co:936）；账本原写 "37 theory_emit_*" 实为 38（ledger_numbers_recheck.md:31）。裁定书 L25 只写"已实测就绪"。
8. **`evidence_reconciliation.md`（裁定书 L7 引为证据）自身揭示证据腐坏**：审计针对 929 行快照 `fac35798`（盘上已无，149 条总数不可复算，ledger_numbers_recheck.md:23）；39 条引用失效、18 条无任何替代、3 条 sha 不符、2 条 sha 不可复算（evidence_reconciliation.md:94-99），且体检期间账本被外部改写过（:115）。裁定书只引 "32/32 OK"。
9. **事后验证脚本残缺陷**（阻塞节依赖的 `chain_bake_s6.sh` 自动接力）：T4 记 `chain_bake_s6.sh` 的 S6_RC 恒 0、`a7s6_run.sh` 旧末命令无 exit（post_wall_runbook.md:14）；`unlock_decisive.sh`/`wall_probe_retry.sh` 把"探针没跑完"读成 `WALL_STILL_UP`（:19）；rc=4 双义（:18）；`post_wall_verify.sh` 未声明 `SLOT_MODE`、ARCH 不镜像（:11,:48）。§6.1cp:960-961 亦登记 rc=4 双义未改。
10. **看门狗暂停的墙钟口径未修**：SIGSTOP 期间 guard `--timeout` 照走墙钟，"待办…仍未改"（§6.1ck:865）。
11. **实现 sha 未绑**：裁定项 2 引 `src/rsi/compiler_domain.cheng` 无 sha；c1c2 对账基于 `60dfe56f`（1184 行，tier3_prereq_recheck.md:6），P-a 后现树为 `ac288371`（1191 行，§6.1cq:976），item 3 的 `compiler_domain.cheng:507-581/:960-1013` 行号来自 P-a 前版本。
12. **V4a / V9 亦为 PASS 但未列未登记**：§6.1y:601,:607；`.rebuild/semantic/v4a/PASS` 无 docs 副本（evidence_reconciliation.md:42,:116）。裁定项 1 的 "全 PASS" 清单只有 8 步。

## 3. 过度声明（逐条点名）

- **L12「主链可交付」**：是代码-合同逐行一致的结论，不是判词；现役 cdomain 无 PASS、逐相仪器缺口未解（见 §2-1）。应改为"判词链可审，现役判定为 INCONCLUSIVE_DEP"。
- **L7「audit_claims.py 32/32 OK」**：`audit_claims.py` 是本席自写件，只做语义自检（ledger_numbers_recheck.md:23），且针对已消失的 929 行快照；把它列为证据完整性证据 = 自证当独立验证。
- **L25「S6 判据与仪器已实测就绪」**：三态实测不可复算（§2-7），只应写"键表/硬门可复算，三态实测样本已失"。
- **L24「已从 … 再向前推进一道」**：只绑一个裸 `.rebuild/b_line/b18_b17_ctrl_1line_field_chain_b1801.stderr.txt`（无时间戳、无 docs 镜像）；而同一阻塞节 L26 引的墙复测证据 `wall_b18probe/run.log` 里 c1/c3 仍是旧字符串 `manual consume function identity drift` / `producer lacks exact type or ownership proof`（该文件 :11,:18）——"推进"发生在内核 B18 线，不是墙探针路径，易被读成墙已位移。
- **L29「所有抬门轮…一律标诊断件」**：与 §2-5 的 71/114 失真标签冲突，至少应限定为 A7/S6 两处。
- **L30「本轮补了 docs 侧镜像与失效引用替代」**：漏 18 条无替代 + 2 条 sha 不可复算 + 工具脚本无 docs 副本（evidence_reconciliation.md:98,111-112）。
- **本席自证面**：L28「纪律自证」整节（未抬门换绿 / 证据绑原始件 / 已修自伤面）为自评；真正独立的只有子代理只读回执，且同会话同模型。

## 4. 总判

**不可原样交用户直接裁定。** 三项裁定的"请裁定"本身是可答的是/否题；但（a）跨项阻塞节无选项、不可答（漏 §7.0 三条出路）；（b）§7.0 第 1 条"什么算达标"等 1–7 条用户裁定项未进入一页；（c）现役 cdomain/A9b 判词、L4 未修缺陷、S6 实测不可复算、`audit_claims` 快照失效、抬门标签失真等信任校准事实缺失，且有 §3 六处过度声明。补齐上述 §2-1/2/3、§3 各项并给 item2 绑实现 sha 后，方可交付。
