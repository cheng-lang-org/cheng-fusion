# RSI 融合战役 · 正交原子任务矩阵（2026-09-14 第 92 轮）

判据口径：**每个任务必须自证** —— 产物 = 一个 docs 侧回执/文件；结论必须绑「原始件 file:line + sha256 前 16 位」；不确定的标「未验证」，禁止推测与捏造。子代理**只读**（可写自己的回执），**不得编译、不得取 .rebuild/COMPILE_SLOT.lock、不得改既有文件**。

## 0. 现势（本轮已核）
- 语义 oracle：v0/v1（源 `2c855f8a…`、自检 11/11）、v2/v2b/v3/v7/v8/v3f 全 PASS；重录基线 sha `7995091f…` 与冻结副本逐字节相同；judge `checks_pass=45 checks_fail=0`。镜像 `receipts/semantic_steps/`。
- 墙探针：c1/c3 两源 `bin=no`（判词同形）⇒ 墙仍在。镜像 `receipts/evidence/wall_probe_latest/`。
- A9b：p=`INCONCLUSIVE_DEP`、n/n0=`PASS`（`A9B_VERDICT=INCONCLUSIVE_DEP`，243 s / 17 轮）。镜像 `receipts/evidence/a9b_legs_latest/`。
- cdomain：档 0=`INCONCLUSIVE_DEP(missing_phase_readings)`；档 1 恢复中。镜像 `receipts/evidence/cdomain_latest/`。
- A7：抬门诊断轮两次失败（① 编载具自身 813,778,072 B > 768 MiB 门；② 现场主树快照编译错误 `executable call unresolved callee=share`@`cleanup_cfg.cheng:836`）。已加抬门开关 + **快照金丝雀**。
- `.rebuild/` 曾被外部整片清理（账本 §6.1cj/§6.1ck）⇒ 一切判词引用必须指 docs 侧镜像。

## 1. 原子任务矩阵（正交 = 彼此不共享写面，可并行）

| ID | 任务 | 输入（只读） | 产物（唯一写面） | 阻塞关系 | 完成判据 |
|---|---|---|---|---|---|
| S1 | 证据对账与引用体检 | `audit_claims.py`、账本 §6.1y/§6.1bb/§6.1cj/§6.1ck 全部引用、`receipts/evidence/**` | `receipts/evidence_reconciliation.md` | 无（零槽位） | 每条引用可解析（存在 + sha 对得上）；列出全部失效引用与建议替换路径 |
| S2 | A7 快照确定性方案 | `git archive HEAD` 快照、`selfbake_theory_emit.patch`、`theory_emit_rss_metric_label.patch`、`a7_bake_carrier.sh` | `receipts/a7_snapshot_plan.md` | 无（**不编译**） | 给出「HEAD 快照 + 两补丁」逐 hunk 能否干净应用的结论；给出一命令替代现场 rsync |
| S3 | C1/C2 契约-实现差异对账 | `compiler_domain_c1c2_contract.md`、`src/rsi/compiler_domain.cheng`、子代理 C 的三条差异 | `receipts/c1c2_contract_delta.md` | 无 | 逐条给出「合同原文 vs 实现行号 vs 是否成立」 |
| S4 | 档 3 前置机械复核 | `receipts/tier3_prereq_checklist.md`、`tier3_static_verdict.txt`、`src/rsi/compiler_domain.cheng` | `receipts/tier3_prereq_recheck.md` | 无 | 逐前置项给出「现状证据 + 是否满足」；Open(3) 必须 false 的机械依据 |
| S5 | 恢复轮判词表（替代已失路径） | `.rebuild/a9b/legs/**`、`.rebuild/cdomain/**`、`receipts/evidence/{a9b_legs_latest,cdomain_latest,wall_probe_latest}/` | `receipts/verdict_table_restored.md` | 依赖 cdomain 档 1 恢复完成 | 逐条判词 = 判词逐字 + docs 侧路径 + sha；旧 `.rebuild` 路径给替代 |
| S6 | A7 S6 运行手册 | `a7s6_run.sh`、`a7s6_wait_and_run.sh`、账本 §6.1aa/§6.1cf、抬门纪律 | `receipts/a7s6_runbook.md` | 无 | 一条可照抄命令 + 三态判据 + 抬门标记 + 回退 |

## 2. 主代理独占的槽位任务（子代理不得触碰）
- **T-A7-1**：按 S2 方案重烤 A7 载具（HEAD 快照 + 快照金丝雀门）→ `kd_a7`（抬门诊断件）。
- **T-A7-2**：S6 抬门 234 源发射检查（`A7_DRIVER=.rebuild/a7_root/kd_a7 bash a7s6_run.sh`）。
- **T-CD-1**：cdomain 档 0/1 的 C 链 DEP 判词（本轮恢复）。
- **T-SEM-1**：语义链最终证据固化（已 PASS）。

## 3. 反自伤纪律（本轮新增，已写进账本各节）
1. 禁止就地改**正在执行**的脚本（会读到中间态 ⇒ 语法错）。
2. 一切「先取锁再复检」的腿必须用 `CHENG_SLOT_OWNER_PID` **显式声明**识别自链（禁止祖先链推断）。
3. 看门狗必须把**声明的槽主**算作自己人（否则自 SIGSTOP ⇒ 自死锁）；暂停超限必须 CONT；退出前必须 CONT。
4. 「在飞」判据必须用 **CPU 时间增量**（文本匹配会被他线带编译文本的长命 shell 假命中）。
5. `.rebuild/` 只是工作区；判词引用必须有 docs 侧副本（`mirror_evidence.sh`）。