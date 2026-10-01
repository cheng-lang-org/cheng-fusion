# 脚本集当前态对抗复核（T1 / round2，只读）

只读声明：未编译、未取/未删 `.rebuild/COMPILE_SLOT.lock`、未改任何既有文件、未建分支/worktree、未 git add/commit/push。唯一写入 = 本文件。全部结论绑 file:line + sha256[:16]（本回执写作时刻工作树实测）；不确定处标「未验证」。

快照（sha256 前 16）：a7_preconditions.sh `cd2e084fa89dfaeb` · a9_window_watch.py `197ab674ee3bf502` · a9_window_watch_selftest.sh `e565bde02c04448b` · a7s6_run.sh `c02ceb8640b88c61` · a7s6_wait_and_run.sh `00243cabef175b68` · a7_bake_carrier.sh `4c7d929182933aff` · a9_run_slot_probe.sh `44dbd7ee53a65387` · a9b_wait_and_run.sh `1615310908a16b57` · cdomain_wait_and_run.sh `753658b88ec69326` · semantic_wait_and_run.sh `56f2d9ecc387a4ee` · wall_probe.sh `b2f038b525f1df3f` · post_wall_verify.sh `585a4c0d885478e5` · mirror_evidence.sh `a21e206bdbfcee93` · acquire_slot_fast.py `0cce7ecad3b83039`

## 1. 槽主声明制一致性
- 6 个取锁点全部在取锁后逐字 `export CHENG_SLOT_OWNER_PID="$$"`：a7_bake_carrier.sh:99 / wall_probe.sh:32 / semantic_wait_and_run.sh:64 / cdomain_wait_and_run.sh:54 / a9b_wait_and_run.sh:60 / a7s6_run.sh:33。
- 两个消费方都认：a7_preconditions.sh:43 `SELF_OWNER_PID="${CHENG_SLOT_OWNER_PID:-$$}"`；a9_window_watch.py:247-249 `_decl = os.environ.get("CHENG_SLOT_OWNER_PID", "")` / `if _decl.isdigit(): own.add(int(_decl))`。
- a9_run_slot_probe.sh 无取锁点（全脚本无 `mine`/无锁 trap），靠调用方 a9b 声明 + 环境继承进入内层 a7_preconditions(:172,:179) 与看门狗(:281-284)。**无取锁点漏声明，无自拒路径**。

## 2. 「在飞」判据
- 判 BUSY 用 CPU 时间增量：`snap_cpu`(:98) 取两次 `ps -o time=`，:107 `awk 'NR==FNR{a[$1]=$2; next} ($1 in a) && ($2-a[$1]) >= 30 {print ...}'`，:113 reason=`compiler process actively burning CPU (cpu-delta caliber)`。
- :87 `cpu_cs` 对 `MM:SS.ss` 做 `$1*6000+$2*100`（==厘秒）；实测 `ps -o time= -p 1` = `88:30.93`（ps 带百分秒），故 30 == 0.30 CPU 秒。**a7 本件无纯文本假阳性**；唯一文本残留是候选选取 :91 `pgrep -f 'system-link-exec|cheng_cold[0-9._]*'` —— 带该文本且同时烧 ≥0.30 CPU 秒/1s 的进程才会中。
- **阈值与看门狗 pause 不是同一口径**：a9_window_watch.py:136 `total = total * 60 + int(part)` 对秒字段取 int ⇒ 丢弃百分秒，`ps_cpu_snapshot`(:142-160) 存整秒，:183/:185 的 `>= 0.3` 实际被量化成 ≥1 CPU 秒。注释「同一阈值/同一口径」名实不符。

## 3. 看门狗
- `own` 含声明槽主：:241-242 `own = set(args.own_pid)` / `own.add(os.getpid())`；:247-249 收 `CHENG_SLOT_OWNER_PID`（逐字见 §1）。
- 暂停超限真实现：:286-290 `if paused and args.on_busy == "pause" and (time.time() - paused_at) > args.max_pause_sec:` → `signal_group(watch, "CONT"); paused = False; pause_disabled = True`。退出前 SIGCONT 真实现：:294-296 `if paused:` / `signal_group(watch, "CONT")` / `time.sleep(args.interval)`。
- **W1（阻断级）**：kill 模式 `busy_reason`(:193-207) 只做文本匹配——:199 `for pid, text in pgrep_hits(pattern):`、:205-206 `if foreign:` / `return "foreign compile in flight: %s" % "; ".join(foreign[:3])`，**无 CPU 判据**；pause 模式 `busy_reason_pause`(:163-190) 已改 CPU 增量。默认 wait 轮次全走 kill（wall_probe.sh:70 `--on-busy "${WATCH_ON_BUSY:-kill}"`、cdomain:161、a9b 探针 :282 未导出 WATCH_ON_BUSY 时）⇒ 外来长命 shell/heredoc 仅凭命令行含编译文本即可把本腿按组杀，而同轮 PRE 的 CPU 判据报 FREE。
- self-test 三项（A :34-48 / B :50-70 / C :72-97）**全走 kill、无 env 声明**：三例均无 `--on-busy`、无 `CHENG_SLOT_OWNER_PID`。**pause / 退出前 SIGCONT / `--max-pause-sec` / env 槽主四条路径零覆盖**。

## 4. 释放纪律
- 锁 trap 全带 `mine`：a9b:67 / cdomain:61 / semantic:82 / wall_probe:42 / a7_bake_carrier:100 / a7s6_run:34。无未加 `mine &&` 的取锁 trap（wall_recheck:24、selftest:17、a7_apply_revert:31 是临时目录 trap，不算）。
- 变量对照：a7s6_run.sh `LOCK`(:28) / `mine`(:18 用 `$LOCK`) / trap(:34) 一致（mine 定义早于赋值，首次调用在 :34，`set -u` 下无碍）；a7_bake_carrier.sh `SLOT`(:22) / `mine`(:25 用 `$SLOT`) / trap(:100) 一致；a9_run_slot_probe.sh 无 mine/无锁 trap，仅 `lock_dir`(:114) 传给看门狗 :282，一致。
- **R1（高，潜伏）**：semantic_wait_and_run.sh:174 `return "$rc"` 之后 :175-178 全为死代码 —— :176 `[ "${SLOT_MODE:-wait}" = acquire ] && release_slot` 与 :177 `[ "$wrc" = 3 ] && return 3` **永不执行** ⇒ acquire 模式锁从首腿一直持有到脚本退出（只剩 EXIT trap 兜底），与 :128-129 注释「只在一条腿的执行期持锁」矛盾；现有调用方 wall_then_semantic.sh:34-35 未设 acquire，故当前不可达。
- **R2（低）**：trap 在排空循环**之后**才装（a9b:56-67 / cdomain:50-61 / semantic:58-82 / wall_probe:36-42），排空最长 60s；此窗口内被 SIGKILL 则锁无 trap 释放。

## 5. docs 侧依赖（三个被抹路径）
- 工具脚本里 `.rebuild/patchwork`、`.rebuild/a7b9`、`.rebuild/b905b_probe` **已无活引用**；剩余全部是注释/echo：a7s6_run.sh:11(注释)、:21 `echo "a7s6_run: 原默认路径 .rebuild/a7b9/kd_a7v9 已于 2026-09-13 磁盘清理时删除"`（真驱动取 :15 `A7_DRIVER`/`$1`）；a7_bake_carrier.sh:4(注释)；wall_probe_retry.sh:6(注释，:14 走 docs 侧)；carrier_bad.sh:2 / carrier_jobs2.sh:2(注释)；post_wall_verify.sh:40（命令用 `$REPO/docs/.../wall_probe.sh`，`.rebuild/patchwork` 仅行尾注释）；wall_probe.sh:20 `D="${PROBE_OUT_DIR:-$REPO/docs/.../receipts/evidence/wall_probe_latest}"`(docs) ✓。
- 仍落 `.rebuild` 的写目标（非被抹路径、但同为易失层）：a7s6_run.sh:10 `OUT=$REPO/.rebuild/a7s6`；a7_bake_carrier.sh:20 `ROOT=.../.rebuild/a7_root`；post_wall_verify.sh:27 `ARCH=.../.rebuild/reverify/...`；a7_apply_revert.sh:22 `STATE=.../.rebuild/rsi_a7/apply_state.txt`（revert 缺 state 时 exit 2，fail-closed）。

## 6. 镜像
- 调 `mirror_evidence.sh` 的只有三处、全在整轮收尾：a9b:200 `mirror_evidence.sh "$LEGS" a9b_legs_latest`、cdomain:205 `mirror_evidence.sh "$OUT" cdomain_latest`、unlock_decisive:43 `mirror_evidence.sh "$ARCH" decisive_latest`。
- semantic 未调该件，但 :159-174 逐腿内联 `cp` 到 `receipts/semantic_steps`；wall_probe.sh 直接写 docs(:20)，无需镜像。
- **缺镜像**：a7s6_run.sh（产物只落 `.rebuild/a7s6` :10；仅 chain_bake_s6.sh:29-30 代拷 docs）；a7_bake_carrier.sh（载具只落 `.rebuild/a7_root` :20/:133-134，**与当年 `.rebuild/a7b9/kd_a7v9` 被抹同类**）；post_wall_verify.sh（自身归档仅 `.rebuild/reverify` :27，无 mirror_evidence 调用）。a9b/cdomain/unlock_decisive 只在退出时镜像一次，整轮中途被清理仍会丢腿——逐腿镜像只在 semantic 落地。

**末句：有阻断级缺陷** —— a9_window_watch.py kill 模式仅按文本匹配判「外来编译」(W1)，使默认 wait 轮次在存在带编译文本的外来长命 shell 时腿腿被按组杀；另 semantic_wait_and_run.sh:174 的 `return` 使逐腿释放成死代码(R1，潜伏)。
