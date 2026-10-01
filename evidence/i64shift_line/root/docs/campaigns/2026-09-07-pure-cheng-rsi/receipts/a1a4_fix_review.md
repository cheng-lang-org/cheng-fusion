# a1a4 修补件对抗式复核 (只读, 2026-09-14)

**结论先行: A1 有阻断级缺陷(已实测复现); A2/A3/A4 未发现阻断级缺陷, 各留 1 条疑似。**

## 1. A1 自链豁免 —— 阻断: pid 1 进了自链 ⇒ 任何活进程都判"自链"

复现命令(只读, 无编译无取锁): `eval "$(sed -n '32,53p' .../a7_preconditions.sh)"; for p in 1 $$ $(pgrep -x Finder) ...; do pid_in_self_chain "$p"; echo $?; done`
实测输出: `SELF_CHAIN=[ 51274 73349 73321 73320 858 856 649 1]`, 候选 1 / 51274(我自己) / 743 / 402 / 358 / 45337 **全部 self=0**。
根因(同一段两处):
- 36-42 行建链**先 append 再 break**: `_self_chain="$_self_chain $_cur"`(39) → `[ "$_cur" = 1 ] && break`(40) ⇒ 链尾恒有 ` 1`。
- 46-49 行判链**先 case 后 break**: `case "$_self_chain " in *" $cur "*) return 0;; esac`(47) 在 `[ "$cur" = 1 ] && break`(48) **之前** ⇒ 任何活进程上溯到 launchd(1) 时 cur=1 命中 `" 1 "` ⇒ return 0。
⇒ `pid_in_self_chain` 对所有活进程恒真, 与"是否我起的"无关。
后果二连:
- 86-87 行 `hits` 恒空 ⇒ pgrep 面整体失效: 他线"不守锁的 noslot 编译"再也看不见。
- 66-69 行把**外来活锁**改判 `self`: `if [ "$lock_state" = "present" ] && pid_in_self_chain "$owner_pid"; then lock_state="self"; fi` ⇒ 73-75 行不设 `busy_reason` ⇒ 101-103 行出 FREE。

**现场实测(决定性)**: 本轮 `bash a7_preconditions.sh --samples 1 --interval 0` 输出
```
  lock=self owner_pid=43397
  sample 1: silent (consecutive=1)
A7_PRECONDITIONS=FREE silent_samples=1   (rc=0)
```
而 43397 是**外来 lane 的活锁**: `ps -o pid=,ppid=,command= -p 43397` = `43397 43396 bash docs/.../a4/a7_bake_carrier.sh --run --driver .../kd_d7`, owner.txt 逐字 `pid=43397 purpose=l4_a7_bake start=1789329870`。旧代码此时必为 `lock_state=present` ⇒ `busy_reason="lock held by live owner pid=43397"` ⇒ BUSY/exit 3。**修完后判 FREE**: 判据从"自伤"翻成"纵容与他线并发烤机"。
被掩盖的其余面:
- 兄弟 lane 假阴性: 47 行比的是**祖先 pid 集合**, 同一父 shell 起的另一条 lane 的编译子进程命中共享祖先 ⇒ 一并豁免。
- 假阳性(轻): 候选 pid 在取 ppid 时消失 ⇒ ps 空 ⇒ `cur=""` 退循环 ⇒ `return 1` ⇒ 偶尔多报一次 BUSY(只影响单采样)。
- hop=40 不是问题(实测链长 8)。
- 修补器瑕疵: 86-87 行的 `printf '%s\n'` 被 Python 三引号里的 \n 展开成**真换行**(文件里实际跨两行: `printf '%s` / `' "$_l"; done)"`); `bash -n` rc=0、行为等价, 但非本意。
最小修法: 建链不收 1(`[ "$_cur" -le 1 ] && break` 放 append 之前), 判链先 break 再 case。

## 2. owner.txt 解析 vs 写者格式 —— 解析面无洞, 洞全在 §1

- 解析(60): `owner_pid="$(sed -n 's/^pid=\([0-9][0-9]*\).*/\1/p' "$OWNER_FILE" | head -1)"`。
- 写者全是 `pid=<shell-$$> ` 前缀: acquire_slot_fast.py:31 `handle.write('pid=%s purpose=%s start=%d\n' % ...)`(调用方传 `"$$"`: probe_b905b:30 / probe_decl_trace:21 / wall_probe:30 / a7_bake_carrier:75 / a7s6_run:32); a9b:59 / cdomain:53 / semantic:63 `printf 'pid=%s purpose=%s start=%s\n' "$$" ...`; a7_bake_carrier:77 同款; 仓内同款还有 tools/bake_clone_root.sh:39、frozen/s1b_step3/r8/take_slot.sh:31。未见第二格式。
- owner.txt 缺失/为空/格式不认识 ⇒ `owner_pid=""` ⇒ 63 行 stale 判定跳过 ⇒ 66-69 行 `pid_in_self_chain ""` 立刻 `return 1`(44-45) ⇒ 保持 `present` ⇒ BUSY(**fail-closed 正确**)。
- 所以"别人的锁被当自己"不是解析引起的, 是 §1 恒真函数引起的 —— 效果是**所有人的锁都被当自己**。

## 3. A2 LEG_RC 分支(逐值)

rc 面: a9_run_slot_probe.sh 单腿分发 347-352 `"leg_${leg_sel}"; rc=$?; ... exit "$rc"`; 腿函数 1=断言失败(322/324/330/332/338/341/343), 3=窗口/看门狗/guard 非零(232, 306-309, 320/328/336 的 `run_leg … || return 3`), 2=用法/前置 `exit 2`(100-211)。

| LEG_RC | a9b 归宿(改后) | 行 |
|---|---|---|
| 0 | PASS 落袋 | 156-165 |
| 1 | rows=0 且 DRV=CLI_COMPILER → INCONCLUSIVE_DEP; 否则 FAIL verdict=1 | 170-176 / 179-181 |
| 2 | FAIL verdict=2(不再被吞) | 180 |
| 3 | INCONCLUSIVE, 留给下一窗口 | 177-178 |
| 4 | FAIL verdict=4 —— 但 4 同时是 a9b 顶层 DEP/TOTAL_TIMEOUT 的码(113/114/121-122), post_wall_verify:95 会把 leg-level 4 读成 INCONCLUSIVE_DEP(命名空间撞车, 疑似, 非本次引入) | 180 |
| 124/137 | FAIL verdict=124/137; 实际只能来自外部 timeout/kill(probe 内不包 timeout; guard 自身 --timeout 非零会被腿函数转 3) | 180 |

- **rc=1 语义成立**: 腿函数是 `run_leg … || { …; return 3; }`(320/328/336) ⇒ rc=1 蕴含 `run_leg` 返回 0 ⇒ guard_rc=0 ⇒ "真编完、只是判据不成立" ✓ 与 166-169 注释自洽。
- **疑似残留**: rc=1 里两个不同事实都落 DEP —— 322 `FAIL_POSITIVE_VACUOUS (该腿未编译任何候选…)` 与 324 `FAIL_POSITIVE`; 负腿 330/338 的 `…_VACUOUS` 也返回 1 且 rows 恰为 0 ⇒ "引擎一个候选都没编"的空洞轮次仍会被盖上 INCONCLUSIVE_DEP(170-175)并从此不重跑。A2 灭掉的是 rc=2/3 误吞, 这一类同源残余未灭。
- 口径自洽: post_wall_verify:84 `A9_LEG_COMPILER="$DRV"`(kd_*)≠CLI_COMPILER ⇒ 复验路径 DEP 分支不可达, rc=1 一律 FAIL, 与 a9b:30-38 注释一致。

## 4. A3 八处 mine() —— 8/8 变量名与 owner 写者 pid 一致

| 文件 | LOCK/SLOT | mine() | trap | owner 写者 |
|---|---|---|---|---|
| a4/semantic_wait_and_run.sh | 43 | 54 | 81 | 63 本 shell `"$$"` |
| a4/wall_probe.sh | 11 | 24 | 40 | 30 fast.py `"$$"` |
| a5/cdomain_wait_and_run.sh | 41 | 46 | 60 | 53 本 shell `"$$"` |
| a9/a9b_wait_and_run.sh | 47 | 52 | 66 | 59 本 shell `"$$"` |
| .rebuild/patchwork/probe_b905b_corpus.sh | 11 | 24 | 40 | 30 fast.py `"$$"` |
| .rebuild/patchwork/probe_decl_trace.sh | 13 | 19 | 22 | 21 fast.py `"$$"` |
| a4/a7_bake_carrier.sh | 22 `SLOT=` | 25(`$SLOT`) | 76(`$SLOT`) | 75 fast.py `"$$"` + 77 行重写同格式 |
| a7_theory_emit/a7s6_run.sh | 28 | 18 | 33 | 32 fast.py `"$$"` |

mine() 逐字(八处同款): `mine() { [ -f "$LOCK/owner.txt" ] || return 1; local t; t=$(< "$LOCK/owner.txt"); case "$t" in "pid=$$ "*) return 0;; esac; return 1; }` —— 与写者 `pid=<pid><空格>` 前缀吻合, **`$$` 语义成立**(python 拿到的就是调用方 shell 的 $$; bash 的 `$$` 在子 shell 与 trap 中也不变, trap 又同 shell 执行)。a7s6_run.sh 的 mine 定义(18)先于 LOCK 赋值(28), 但首次调用在 33 行后, `set -u` 下无碍。
- 疑似(低危, 建议补 reaper): owner.txt 缺失时 mine 恒 1 ⇒ 自杀锁不再自清。acquire_slot_fast.py:24-31 与 tools/bake_clone_root.sh:38-39、r8/take_slot.sh:31 都是"先 mkdir 后写 owner"; 他线在这个窗口里被打死就留下**无 owner 的活锁目录**, 而 `[ -e "$LOCK" ] && return 3`(a9b:72-73 等)永远拿它没办法 —— 原无条件 `rm -rf` 顺手承担的兜底现在无人接手, 可能锁死整条流水线。

## 5. A4 两源判词 —— 逻辑正确, 无"真撞墙被误判"

- 47-48 行逐字: `PROBE_ROWS=$(grep -c 'PROBE_RESULT' "$ARCH/wall_probe.log" 2>/dev/null || true)` / `if [ "${PROBE_ROWS:-0}" != 2 ] || grep -qE 'PROBE_WINDOW_LOST|watchdog_rc=[34]|PROBE_TIMEOUT' "$ARCH/wall_probe.log" 2>/dev/null; then`
- 文件不存在: `grep -c` 无 stdout + exit 2(实测 `grep_rc=2`), `|| true` 兜住 ⇒ "0" ≠ 2 ⇒ WALL_INC=1 ⇒ exit 3; 空文件同理。**fail-closed 正确**。
- 行数恒 2: probe_b905b_corpus.sh:74 在 `for SRC in $SRCS` 里**无条件**打 `PROBE_RESULT`, post_wall_verify:39 写死两源(`PROBE_SRCS="…/c1.cheng …/c3.cheng"`)⇒ 跑完必 2。早退面: 45 `{ echo PROBE_TIMEOUT; exit 4; }` → 0 行(且字面量被 grep 命中); 中途被 kill → 0/1 行 → INCONCLUSIVE。⇒ **没有**"两源真撞墙却凑不齐 2 行"的正常路径。
- watchdog 语义: a9_window_watch.py:293 `return 3 if outcome == "busy" else 4`; 243/248-250 腿退出即 `outcome="held"` ⇒ 跑完的腿恒 0; 4=deadline 到点(273-275)且腿仍活, 随后按组杀 ⇒ 腿没跑完 ⇒ INCONCLUSIVE 正确; pause 模式 busy 不置 outcome(251-262) ⇒ 不会把"暂停后跑完"误判。
- 疑似(非本次引入): 两源都 bin=no 也可能是源缺失/夹具坏(probe 对不存在的输入照跑照打 bin=no)⇒ 仍落 WALL_STILL_UP(62-65); A4 只管"跑没跑完", 不管"跑的对象对不对"。
- 极窄噪声面: 77 行 `tail -3 err.txt` 也进日志, 若编译器 stderr 恰含 `PROBE_RESULT` 字样会多计一行(疑似, 可忽略)。

## 是否有阻断级缺陷

**有, 一条: A1 的 `pid_in_self_chain` 因把 pid 1 收进自链而对所有活进程恒真, 实测把正在 `a7_bake_carrier --run` 的外来活锁判成 `self` 并输出 `A7_PRECONDITIONS=FREE`(rc=0), 窗口判据整体失效; A2/A3/A4 未发现阻断级缺陷。**
