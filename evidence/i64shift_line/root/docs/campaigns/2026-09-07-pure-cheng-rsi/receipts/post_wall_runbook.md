# T4 墙清后事后验证 runbook 复核（只读）

日期 2026-09-14 · 对象 = docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4 五件 · 结论绑 file:line + sha256[:16] · 本件不执行任何受审脚本、不取锁、不改树。

## 0. 对象哈希（sha256[:16]）
unlock_decisive.sh `d85dda822480f2bf`｜post_wall_verify.sh `585a4c0d885478e5`｜wall_probe_retry.sh `2e51b98b6d157aa2`｜wall_probe.sh `b2f038b525f1df3f`｜chain_bake_s6.sh `cc03c172d0875d23`。
支撑件：a9b_wait_and_run.sh `1615310908a16b57`｜cdomain_wait_and_run.sh `753658b88ec69326`｜a9_run_slot_probe.sh `44dbd7ee53a65387`｜acquire_slot_fast.py `0cce7ecad3b83039`｜mirror_evidence.sh `a21e206bdbfcee93`｜a7s6_run.sh `c02ceb8640b88c61`｜a7_preconditions.sh `cd2e084fa89dfaeb`｜a9_window_watch.py `197ab674ee3bf502`｜exec_new_pgroup.sh `1fd4fbd3570b5f3a`。五件 `bash -n` 全 PASS。默认新驱动（post_wall_verify.sh:22 选择）= `.rebuild/s1b_step3/r9/kd_t81` `879f5320d2a3c9f6`。

## 1. 逐脚本核对（取锁 / 判词态 / 证据 / 早退 / 镜像）
**unlock_decisive.sh**：取锁=自身不读 SLOT_MODE，对三子件显式传 `SLOT_MODE=acquire`（:21 wall_probe_retry / :32 a9b / :37 cdomain）；:5 用法前缀冗余。判词=墙 `bin=yes` 计数==2（:24），之后仅打印 a9b_p_rc/cdomain0_rc（:42），口径注释（:44）rc=0 PASS / rc=4 DEP / 其他 FAIL，**自身恒 exit 0（:45）**。证据=`$ARCH=.rebuild/reverify/<utc>_<sha8>`（:16-17）+ 三份 tee 日志（:23/:33/:39）。早退=无驱动 exit2（:14）；墙在 exit2（:25-27）。镜像=:43 mirror_evidence → docs evidence/decisive_latest。
**post_wall_verify.sh**：取锁=**未声明 SLOT_MODE**；:39/:84/:90 调子件不传 → 三子件均 wait 被动模式（子件自证其不可靠：a9b:51 / cdomain:44）。判词=墙 WALL_OK/WALL_INC（:43-52），探针未跑完 exit3（:54-57），真墙 exit2（:62-66），腿判词仅打印 a9b_rc/cdomain_rc（:94），口径（:95），**自身恒 exit 0（:96）**。证据=`$ARCH=.rebuild/reverify/...`（:27）+ wall_probe.log（:40）。早退=无驱动 exit2（:24）；:56 exit3 WALL_PROBE_INCONCLUSIVE；:65 exit2 WALL_STILL_UP。镜像=**无**（ARCH 不落 docs 侧）。**两处已改自洽**：:40 已指 docs a4/wall_probe.sh，与 :39 的 PROBE_COMPILER/PROBE_SRCS 匹配、实件在、`bash` 调用不依赖可执行位；wall_probe.sh:20 的 docs 证据目录实存、`PROBE_OUT_DIR` 可覆盖，且被 wall_probe_retry.sh:8 复用同一路径；无残留 `.rebuild/patchwork` 活引用。
**wall_probe_retry.sh**：取锁=不自取，环境透传 wall_probe.sh（:14）。判词=rc=0 仅表示"拿到非空手结果"（:15-18，含 watchdog_rc=4 / PROBE_TIMEOUT / 真墙 bin=no）；rc=3=N 轮全 window-lost（:22）。证据=docs evidence/wall_probe_latest/retry_$i.log（:8）。早退=无。镜像=直写 docs 侧。
**wall_probe.sh**：取锁=acquire 时协作 mkdir 锁（:29-44，acquire_slot_fast.py 写 owner.txt）、`trap 'mine && rm -rf'`（:42）、槽主声明（:32）；wait 时走 PRE 单点（:57）；默认 wait（:17/:50）。判词=两源 PROBE_RESULT（:76）后 exit0（:82）；看门狗 wrc=3 → PROBE_WINDOW_LOST（:75）；整体超时 PROBE_TIMEOUT exit4（:47）。证据=`D` 默认 docs evidence/wall_probe_latest（:19-21）。改后自洽见上。
**chain_bake_s6.sh**：取锁=对 a7s6_run.sh 传 `SLOT_MODE=acquire`（:25）。判词=继承 a7s6_run.sh rc（:27）并 exit（:32），但 **a7s6_run.sh:100-101 末命令是 `echo DONE`、无 exit → S6_RC 恒 0**，不反映 S6_VERDICT（:88-99）。证据=`.rebuild/a7s6_chain.log`（:26）+ `.rebuild/a7s6/`；:29-30 复制到 docs evidence/a7s6（cp 失败 `|| true`）。早退=bake 退出无驱动 exit3（:19）、90 分钟超时 exit3（:23）。驱动路径 :9 `.rebuild/a7_root/kd_a7`。镜像=cp（:29-30）。

## 2. 歧义 / 失路径 / 注释不符（按严重度）
1. **A9b p 的 DEP 分支对 kd_* 腿编译器不可达**：a9b:179 额外要求 `[ "$DRV" = "$CLI_COMPILER" ]`，而 unlock_decisive:31 / post_wall_verify:84 传 kd_* 作 `A9_LEG_COMPILER`、`CLI_COMPILER` 固定 stage3（a9b:29 / cdomain:32）。于是 kd_* 下 0 行 rc=1 落 FAIL（a9b:192-193），不是 DEP。⇒ unlock_decisive:7/:44、post_wall_verify:95 的"p=0 行→INCONCLUSIVE_DEP"与实现不符；现存 `.rebuild/a9b/legs/p/INCONCLUSIVE_DEP` 是 stage3 产物（其内 `leg_compiler=.../artifacts/bootstrap/cheng.stage3`）。
2. **rc=4 双义**：a9b:114-115 / cdomain:110-111 对 TOTAL_TIMEOUT/ATTEMPTS_EXHAUSTED 也置 verdict=4，与 DEP（a9b:122 / cdomain:117）同码；口径注释一律称 DEP。只有 marker 能区分。
3. **未跑完 → WALL_STILL_UP**：unlock_decisive:24 只看 `bin=yes==2`，wall_probe_retry:15 只认 PROBE_WINDOW_LOST → watchdog_rc=4（a9_window_watch.py:313、wall_probe.sh:76）/ PROBE_TIMEOUT（wall_probe.sh:47）/ 探针缺失全落 WALL_STILL_UP（:25-27）。post_wall_verify :44-57 已修此分流，另两件未修（与 receipts/unlock_scripts_review.md §D:158-160 同结论，仍未闭合）。
4. **恒 exit 0 / rc 不承载判词**：unlock_decisive:45、post_wall_verify:96；chain_bake_s6:27+:32 的 S6_RC 恒 0。按 rc 判绿的包装会把 FAIL/DEP 读成绿。
5. **post_wall_verify 不声明 acquire**（:39/:84/:90）→ 被动 wait；头部 :9 "串行" 靠 wait+看门狗 kill 兜，而非协作锁。
6. **部分清墙粒度**：两源仅一源 bin=yes 时 WALL_OK=0/WALL_INC=0（:50-52）→ exit2 WALL_STILL_UP，判词不区分"全在"与"1/2"（须看日志 per-src bin）。
7. **失路径/待出现**：chain_bake_s6:9 `.rebuild/a7_root/kd_a7` 当前 MISS（与 a7s6_runbook.md §6-1 一致）；S6 还需 A7-patched 驱动（a7s6_run.sh:14）。wall_probe.sh:15 默认 kd_b905b 存在。`.rebuild/patchwork` 仅存注释（wall_probe_retry:6 / post_wall_verify:40），无活引用。
8. **注释不符**：wall_probe_retry:3 用法名写 `retry_probe.sh`（实名 wall_probe_retry.sh）；post_wall_verify:31 注释"判词无效(立卡)"但 :35 仅 WARN 继续；post_wall_verify :69-80 把旧判词 move 进 .rebuild ARCH（"不覆盖历史"但未镜像）。
9. **执行序**：post_wall_verify 串行（:84→:90），unlock_decisive 亦串行（:31→:37），互不并发。可取。

## 3. 墙清后一条命令序（新驱动 kd_*）
```bash
cd /Users/lbcheng/cheng-lang
export SLOT_MODE=acquire SLOT_WAIT_SEC=1800
KD=$(ls -t .rebuild/s1b_step3/r9/kd_* | grep -Ev '\.(map|log|txt|sha256|o)$' | head -1)
echo "KD=$KD sha=$(shasum -a 256 "$KD" | cut -c1-16)"
# ① 墙探针 + ② A9b 三腿 + ③ cdomain 0/1：post_wall_verify 串行三/四步（墙在/未跑完自动早退）
bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh "$KD" 2>&1 \
  | tee docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/evidence/post_wall_run_$(date -u +%Y%m%dT%H%M%SZ).log
# ④ S6：直接用 a7s6_run.sh 显式给 A7-patched 驱动（chain_bake_s6 仅在 .rebuild/a7_root/kd_a7 出现时可用）
A7_DRIVER=<A7-patched kd_*> SLOT_MODE=acquire SLOT_WAIT_SEC=1800 \
  bash docs/campaigns/2026-08-31-kernel-userpath/tools/a7_theory_emit/a7s6_run.sh \
  > .rebuild/a7s6_chain.log 2>&1
grep -E 'S6_VERDICT=' .rebuild/a7s6_chain.log
bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/mirror_evidence.sh .rebuild/a7s6 a7s6_latest
```
每步预期判词 + 证据路径：
1. **墙探针**：`wall_probe: ... wall_ok=1 inconclusive=0`（子件 rc=0）。证据 docs `receipts/evidence/wall_probe_latest/{c1,c3}.{report.txt,out.txt,err.txt,leg.log,window.txt}` + `.rebuild/reverify/<stamp>_<sha8>/wall_probe.log`。
2. **A9b 三腿**：`A9B_VERDICT=PASS all_legs=(p n n0)`、rc=0；marker `.rebuild/a9b/legs/{p,n,n0}/PASS`；镜像 `receipts/evidence/a9b_legs_latest/`。p 若 0 相行 rc=1 → 现实现 FAIL（§2-1），不是 DEP；窗口反复丢 → rc=4 的 TOTAL_TIMEOUT/ATTEMPTS_EXHAUSTED（§2-2），非判词。
3. **cdomain 档 0/1**：`CDOMAIN_VERDICT=PASS all_corpora=(0 1)`、rc=0；marker `.rebuild/cdomain/legs/corpus{0,1}/PASS` + `run_attN/inner/*.greport.txt`；镜像 `receipts/evidence/cdomain_latest/`。若 `cd_c2_reject reason=missing_phase_readings` → INCONCLUSIVE_DEP rc=4。
4. **S6**：`S6_VERDICT=PASS`（report/theory 闭包=234，a7s6_run.sh:88-89）；否则 INCONCLUSIVE(known_wall/empty_closure) 或 FAIL（:90-99）。证据 `.rebuild/a7s6/{a7s6.report.txt,a7s6.stdout.txt,a7s6.stderr.txt,MARKER.txt}` → 镜像 `receipts/evidence/a7s6/`。**必须 grep 判词，不可看 rc**（§2-4）。
补：post_wall_verify 的 ARCH 不自动镜像；记其首行 `archive=...`，人工 `bash .../mirror_evidence.sh <ARCH> post_wall_verify_latest`（补 §1 镜像缺口）。

## 4. 墙没清的早退路径
- post_wall_verify：日志 `WALL_PROBE_INCONCLUSIVE` + exit 3（:54-57）= 探针被抢槽/看门狗杀（watchdog_rc=4）/ PROBE_TIMEOUT ⇒ **不是判词**，原地重跑，不得写 WALL_STILL_UP。
- post_wall_verify：日志 `WALL_STILL_UP` + exit 2（:62-66）= 两源均跑完且 bin=no = 真墙 ⇒ **立刻停**：不跑 A9b/cdomain/S6，现有 `a9b/legs/p/INCONCLUSIVE_DEP`、`cdomain/legs/corpus{0,1}/INCONCLUSIVE_DEP` 原样保留（:59-62 纪律）。
- unlock_decisive：exit 2（:25-27）但把上述两态混为一态（§2-3），不要据此写"墙在"。
- 陈旧锁缺口（背景，a7s6_runbook.md:39）：acquire_slot_fast.py 只 mkdir/等目录消失、不检 owner 存活；移锁前先 `cat .rebuild/COMPILE_SLOT.lock/owner.txt` 确认非他线活锁（复核时在位：`pid=79027 purpose=m2line_bake_t81`）。
