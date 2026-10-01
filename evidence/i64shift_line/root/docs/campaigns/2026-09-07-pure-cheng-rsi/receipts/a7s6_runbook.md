# A7 S6 运行手册（抬门 234 源发射检查；本文件不执行、不取锁、不改树）

只读产出（2026-09-14，S6 子代理）。全部结论绑 file:line + sha256 前 16 位。

## 0. 源件哈希（本手册引用以此为准）
a7s6_run.sh `0a00ce1a571b74fb`｜a7s6_wait_and_run.sh `00243cabef175b68`｜a7_preconditions.sh `cd2e084fa89dfaeb`｜exec_new_pgroup.sh `1fd4fbd3570b5f3a`｜acquire_slot_fast.py `0cce7ecad3b83039`｜a7_bake_carrier.sh `e572f293d5bf2420`｜账本 cheng-rsi-acceptance-status.md `816cccbac3404799`｜selfbake_theory_emit.patch `3f152300698faa51`｜历史现场 .rebuild/a7s6_wait.log `6e57595f4bf3a09d`。

## 1. 硬前置（缺一即退，编译前零副作用）
- `A7_DRIVER` 必须是**打完 selfbake_theory_emit.patch（+ S2.1 修正补丁）后烤出的**可执行驱动；缺/非可执行 ⇒ `exit 2`（a7s6_run.sh:15,19-23）。原默认路径 `.rebuild/a7b9/kd_a7v9` 已随 2026-09-13 清理删除（a7s6_run.sh:11-13；账本 :718）。
- 取锁：`SLOT_MODE=acquire` 走协作 mkdir 锁协议（kqueue 事件驱动，acquire_slot_fast.py:45-59），拿不到即 `REFUSING` + `exit 3`，**未发起任何编译**（a7s6_run.sh:31-35）。槽主显式声明 `CHENG_SLOT_OWNER_PID=$$`（:33），EXIT/INT/TERM 只删自己的锁（`mine()` :18,34）。非 acquire 分支才复核 `a7_preconditions.sh == FREE`（:36-38）；preconditions 只认显式声明（a7_preconditions.sh:36-57）。拒绝分支在任何编译之前。

## 2. 一条可照抄命令（推荐路线）
```bash
cd /Users/lbcheng/cheng-lang
A7_DRIVER=/Users/lbcheng/cheng-lang/.rebuild/a7_root/kd_a7 \
SLOT_MODE=acquire SLOT_WAIT_SEC=1800 \
bash docs/campaigns/2026-08-31-kernel-userpath/tools/a7_theory_emit/a7s6_run.sh
```
- 输出目录**不可配**，固定 `$REPO/.rebuild/a7s6/`（a7s6_run.sh:10）：`a7s6.exe`、`a7s6.report.txt`、`a7s6.stdout.txt`（编译器 stdout）、`a7s6.stderr.txt`（:48-49）。
- 编译在独立进程组后台跑、`timeout 1800`，脚本打印 `compile_pgid=`（:43-52）；4 GiB 抬门硬编码在 :43（见 §4）。
- `a7s6_wait_and_run.sh` 现属**冗余**：它先等 FREE 再 `exec a7s6_run.sh`（a7s6_wait_and_run.sh:13-17），而 acquire 本身已在锁协议内排队。若仍用：须 `export A7_DRIVER=...`、`MAX_WAIT_SEC=1800`。
- `A7_DRIVER` 期望位置按 T-A7-2（workplan_atomic_matrix.md:26）= `.rebuild/a7_root/kd_a7`；当前该件不存在（§6-1）。

## 3. 判据（PASS / INCONCLUSIVE / FAIL；逐字引自 a7s6_run.sh:74-86）
- **PASS**（:74-75）：`[ "${CLOSURE_REPORT:-}" = "234" ] && [ "${CLOSURE_THEORY:-}" = "234" ]` ⇒ `S6_VERDICT=PASS`。
- **INCONCLUSIVE(known_wall)**（:76-81）：`[ "$RC" != "0" ] && grep -qE '<5 墙模式>' "$OUT/a7s6.stderr.txt"` ⇒ `S6_VERDICT=INCONCLUSIVE known_wall='$WALLHIT' rc=$RC wall=${WALL}s`。5 墙模式逐字（:76,:80）：`frozen anchor missing`、`manual consume function identity drift`、`normalized expression parser node missing`、`typed expr value definition: producer lacks exact type or ownership proof`、`typed expr: call declaration static argument type unavailable`。
- **INCONCLUSIVE(empty_closure)**（:82-83）：`[ "${CLOSURE_REPORT:-}" = "0" ]` ⇒ `S6_VERDICT=INCONCLUSIVE closure table empty in this invocation (theory field faithfully 0)`。
- **FAIL**（:84-85）：其余 ⇒ `S6_VERDICT=FAIL report=... theory=... rc=$RC`。
- 取值口径：`CLOSURE_REPORT` = `grep '^source_closure_count=' "$OUT/a7s6.report.txt" | head -1 | cut -d= -f2`（:64）；`CLOSURE_THEORY` = `grep '^theory_emit_theory_source_closure_files=' "$OUT/a7s6.stdout.txt" | head -1 | cut -d= -f2`（:65）。缺件 = `<missing>` 且 rc=0 时落 FAIL——**注意**：历史 2026-09-13 轮报的 `S6_VERDICT=FAIL` 是扩判据前旧脚本产物（.rebuild/a7s6_wait.log:12）；账本 :91 与 a7b_window_receipt.md:14 对同轮复判为 INCONCLUSIVE(known_wall)。

## 4. 抬门（4 GiB）与「诊断件不得用于达标判词」标记
- 抬门值 = `CHENG_PROCESS_MAX_RSS_BYTES=4294967296`（4 GiB），硬编码在 a7s6_run.sh:43；默认权威门 = 805,306,368 B（a7b_window_receipt.md:74）。
- 纪律原文（memory_model_constraints.md:34）：**排墙可以跑抬门诊断轮，但抬门轮读数一律不得计入达标，且必须与验收轮分开标注。** 同款标记先例：a7_bake_carrier.sh:99-100 打印 `gate=raised bytes=... (诊断轮; 产物不得用于达标判词)`；账本 :841 记「日志第 78 行与产物均标」。
- **该写在哪**（a7s6_run.sh 现无此行，属待补的诚实性缺口）：① 本手册标题与 §3 判词段；② `.rebuild/a7s6/` 内（脚本的 `=== raised-gate ...` 只回终端 :41，`a7s6.stdout.txt` 只装编译器 stdout ⇒ 单看 stdout 无法自证抬门轮，须外部标注，建议落 `MARKER.txt`）；③ 任何 docs 侧镜像回执与账本 S6 条目。

## 5. 失败/中断后的回退与清理
- **主树零改动**：S6 只读 `src/core/tooling/backend_driver_dispatch_min.cheng` 作 `--in`，只写 `.rebuild/a7s6/`；补丁只打在副本根（a7_bake_carrier.sh:2-8,46-51）⇒ S6 自身**无树回退步骤**，不需要 `a7_apply_revert.sh --revert`（仅当驱动来自主树 apply 路线时才需 S7，见 a7_theory_emit/README.md:23-24,34）。
- 中断：按组杀 `kill -TERM -"$compile_pgid"`（PGID 由 :50 打印；v1 的 job_kill 只杀外壳、编译存活，:6-7）。EXIT trap 只删自己的锁（:34）。
- **陈旧锁缺口**：acquire_slot_fast.py 只 mkdir/等目录消失，**不检 owner 存活**（:22-32,54-59）；owner 被 SIGKILL 时锁滞留到 `SLOT_WAIT_SEC` 超时（exit 3）。移除前必须 `cat .rebuild/COMPILE_SLOT.lock/owner.txt` 确认非他线活锁（a7_preconditions.sh:67-73 会标 stale）。
- 可删中间件（先镜像后删）：`.rebuild/a7s6/`（stdout/stderr/report 存 docs 侧后整目录可删）；`.rebuild/a7_root/`（798 MB 可再生副本根，烤机日志入 `receipts/evidence/a7_bake/` 后可删，先例账本 :863）；失败轮 `a7s6.exe` 无价值。
- 不可删：`.rebuild/COMPILE_SLOT.lock`（除非确认是自己持有）、docs 侧原始件。

## 6. 未验证（不得当已知）
1. **A7_DRIVER 当前不满足**：本席只读时 `find -name 'kd_a7*'` 零命中、`.rebuild/a7_root/` 只有 src+artifacts；bake 两次失败（内存门 813,778,072 B > 768 MiB：账本 :841；主树快照 `executable call unresolved callee=share`：账本 :864）。⇒ §2 命令现在跑只会 `exit 2`。
2. **现版判据（sha 0a00ce1a）从未实测**：唯一真跑（2026-09-13，.rebuild/a7s6_wait.log `6e57595f`）用的是扩判据前脚本；账本 :91 与 a7b_window_receipt.md:14 的同轮 INCONCLUSIVE 复判是**人工复核**，非脚本执行。
3. 234 源闭包表是否真填 `source_closure_count=234`：**未观测到**，历史轮未到发射点。
4. 4 GiB 抬门对 S6（234 源、脚本注释估 ≈30 min，:26）是否够：未验证。
5. 5 条 known_wall 模式是否覆盖现役全部前沿：`cheng-plan.md` 已更新 B6 根修（现势哨兵为 c1/c3，a9_cheng_chain_wall_repros.md:34-51、workplan_atomic_matrix.md:7），脚本清单未随之后续核对。
