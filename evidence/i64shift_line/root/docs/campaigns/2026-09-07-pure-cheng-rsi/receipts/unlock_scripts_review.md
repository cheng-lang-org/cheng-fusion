# 解锁四件脚本独立审查 (只读)

日期 2026-09-14 · 审查对象 = a4/semantic_wait_and_run.sh · a4/post_wall_verify.sh ·
a9/a9b_wait_and_run.sh · a5/cdomain_wait_and_run.sh (+ 同款取锁块的两个相关件)。
方法: 全静态读 + `bash -n`(四件全过) + 一次**只读** `a7_preconditions.sh --samples 1` 观测。
**未执行任何受审脚本、未发起任何编译、未取用 .rebuild/COMPILE_SLOT.lock、未改动任何文件**(本回执除外)。
结论: 取锁/放锁在正常与 continue 路径上配对正确、`set -u` 无未定义变量、`PIPESTATUS` 用法正确；
但有 **1 处结构性致命**(acquire 模式下 A9b 每次腿必被自己的锁判 BUSY) 与 **1 处判词吞没**
(FAIL/未跑 被写成 INCONCLUSIVE_DEP)，以及全局性的 EXIT trap 过度释放。

---

## A. 会静默出错 (按严重度)

### A1【致命】SLOT_MODE=acquire 下 A9b 的每一腿都被自己的锁拒跑
- 取锁: `a9b_wait_and_run.sh:145` acquire_slot 成功 → 本进程持锁(owner.txt pid=$$)。
- 随即调用的腿件 **自带硬门**: `a9_run_slot_probe.sh:179` = `bash "$PRECHECK" --samples 1 --interval 0 | grep -q 'A7_PRECONDITIONS=FREE'`，不 FREE 就 `exit 3`；每腿还有一次 `a9_run_slot_probe.sh:171-173` + `:230-233`。
- `a7_preconditions.sh:33-47` 的判据**只认"锁目录在 + owner pid 活着"**，全脚本没有任何"是不是我自己"的概念:
  `if [ "\$lock_state" = present ]; then busy_reason="lock held by live owner pid=..."; fi`。
- ⇒ 本席持锁(活 pid)时 PRE 必报 BUSY ⇒ 探针在**开跑前** exit 3 ⇒ `a9b:150 LEG_RC=3`，一条腿都没编译过。
- 只读实测(未取锁): 当时真锁 `pid=8203 purpose=b17line_b1701_gate` 在位，PRE 输出
  `A7_PRECONDITIONS=BUSY reason=lock held by live owner pid=8203`、rc=3 ⇒ 判据确实不看归属。
- 与其它三件对比: semantic 的腿是工具直调(无内层 PRE)、cdomain 的腿是 CLI(源码面无 COMPILE_SLOT 依赖)、
  `.rebuild/patchwork/probe_b905b_corpus.sh:55` 与 `a4/wall_probe.sh` 是 `mine || { [ ! -e "$LOCK" ] && bash "$PRE" ...; }`(**先认自己人**)。
  **只有 a9_run_slot_probe.sh 漏了这一改** —— 正是"取锁块插进去了但内层没接上"。
- 触发路径: `unlock_decisive.sh:31-33` 正是 `A9_LEG_COMPILER=<drv> SLOT_MODE=acquire bash a9b_wait_and_run.sh`。
- 判死法(零编译): `SLOT_MODE=acquire A9_LEG_ORDER=p MAX_ATTEMPTS=1 MAX_TOTAL_SEC=60 bash a9b_wait_and_run.sh`
  → 日志出现 `REFUSING — 窗口非 FREE`，`legs/p/` 无 PASS。修法: 探针内层复检改成先认自己人
  (传 `--own-pid $$` 或让调用方导出 `SLOT_MODE=acquire` 时短路 `window_cheap_check`)。

### A2【致命·判词档位】a9b 把 FAIL / 未跑 / 参数错 一律写成 INCONCLUSIVE_DEP 并永久结算
- `a9b_wait_and_run.sh:166`: `elif [ "$LEG_RC" != 0 ] && [ "${rows:-0}" = 0 ] && [ "$DRV" = "$CLI_COMPILER" ]` → 写 `$LEGS/$t/INCONCLUSIVE_DEP`。
- 该分支**排在** `elif [ "$LEG_RC" = 3 ]`(`:173`)与 FAIL 的 `else`(`:175-177`)之前，且条件里 `DRV = CLI_COMPILER`
  在缺省配置(`:39 DRV="${A9_LEG_COMPILER:-$CLI_COMPILER}"`，不传该变量时)恒真。
- 于是 rc=**1**(探针真判 FAIL: `a9_run_slot_probe.sh:322/324/330/332`)、rc=**3**(未跑/窗口丢)、
  rc=**2**(参数/缺 store-dir 等 setup 错)全部落进 INCONCLUSIVE_DEP。
- 而 `leg_done()`(`:79`)把 INCONCLUSIVE_DEP 当作**已结算** ⇒ `pending` 永不含该腿(`:117-119`)、
  终判 `A9B_VERDICT=INCONCLUSIVE_DEP`(`:121-122`, verdict=4)。
- 后果: 一条**真 FAIL** 或**根本没跑**的腿，对外读数是"依赖未满足(逐相仪器缺失)"，与 A1 叠加时
  整套 A9b 在零编译的情况下收出一个"合理"的 DEP 判词。
- 判死法(零编译): 令探针 exit 1(如 `A9_LEG_COMPILER` 不传、指向一个编不出候选的 CLI) 或 exit 2
  (故意不给 `--store-dir`) ⇒ 观察 `legs/<leg>/INCONCLUSIVE_DEP` 被写出、终判 rc=4。
- 修法: 先判 rc=1→FAIL、rc≥其他非0非3→FAIL，再判 rc=3→INCONCLUSIVE，最后才轮到 INCONCLUSIVE_DEP；
  且 DE 档应要求"腿确实跑到过 guard 判词"的证据(日志含 `verdict=INCONCLUSIVE_POSITIVE|INCONCLUSIVE_NEGATIVE`)。

### A3【高】EXIT trap 无条件 `rm -rf "$LOCK"` ⇒ 会删掉**别人**正在持有的锁
- `semantic_wait_and_run.sh:81`、`a9b_wait_and_run.sh:66`、`cdomain_wait_and_run.sh:60`(同款还有
  `.rebuild/patchwork/probe_b905b_corpus.sh:40`、`a4/wall_probe.sh:40`)。
- 对比同文件的正确写法 `release_slot() { mine && rm -rf "$LOCK"; ... }`(`:84`/`:69`/`:63`)——**先验归属**。
  trap 里没有 `mine`。
- 触发: 取得过一次锁后该 trap 永久生效；每条腿结束都 `release_slot`(`:153`/`:151`/`:156`)，此后
  他线可以立刻 mkdir 拿到锁；此时本进程若 EXIT/INT/TERM(semantic `:355` 的 `sleep 5` 期间最容易)，
  trap 就把他线活锁删掉 ⇒ 双方都失去互斥、他线 `mine()` 从此恒假、其 `release_slot` 变成空操作。
- 判死法: 副本上先 acquire→release，再让他进程 `mkdir` 建锁并写 owner.txt，然后 kill 本脚本
  ⇒ 观察锁目录消失而他进程仍在跑(`mine` 返回 1)。修法: `trap 'release_slot' EXIT INT TERM`。

### A4【高·判词档位】post_wall_verify 的"墙在/没跑完"分流只覆盖两种字面量
- `:44` 只认 `PROBE_WINDOW_LOST|watchdog_rc=3`；`:46` 否则就要求 `bin=yes` 恰等于 2，否则 `:58-62` 报
  `WALL_STILL_UP` exit 2。
- 漏掉的未跑完形态: 看门狗超时按组杀(`a9_window_watch.py` 返回 **4** → 探针打印 `watchdog_rc=4`)、
  探针自身 3600s 超时(`probe_b905b_corpus.sh:45` `PROBE_TIMEOUT` exit 4，日志里**连 PROBE_RESULT 都没有**)、
  guard 被信号杀(guard_rc=137/143)、探针脚本缺失。
- 探针路径是 **`.rebuild/` 下的副本**(见 A5)，被清理/重建时 `bash xxx.sh` 直接报 No such file ⇒ 日志里
  既无 WINDOW_LOST 也无 bin=yes ⇒ **WALL_STILL_UP**，而真相是"探针根本没跑"。
- 判死法(零编译): `bash post_wall_verify.sh /usr/bin/false`(假"驱动") 或把探针文件改名 ⇒ 观察
  `WALL_STILL_UP` exit 2、`inconclusive=0`。修法: 默认判词 = INCONCLUSIVE，只有"探针确实跑完且
  两源都给出 guard/编译判词而 bin=no"才允许 WALL_STILL_UP。

### A5【中高】post_wall_verify 两处"说了不算"
- 同源核验 `:32-36`: 注释写"否则判词无效(立卡)"，实现只 `echo WARN` 后继续跑并照写 PASS。
  判死法: 令 `src/core` 与 b2_root 有 1 文件差异 ⇒ 观察 WARN 后仍落 PASS。建议差异数≠0 直接 exit 3。
- 恒 `exit 0`(`:92`): a9b/cdomain 真 FAIL 时也只把 rc 打进一行文本，调用方 `$?` 永远 0。
  与自身口径注释(`:91`)冲突。判死法: `A9_LEG_COMPILER=/usr/bin/false bash post_wall_verify.sh`
  → 末行 `a9b_rc=1` 但脚本 rc=0。
- 依赖件在 `.rebuild/` 内: `:40` 用 `$REPO/.rebuild/patchwork/probe_b905b_corpus.sh`，随 build 树重建而消失
  (A4 已给判死法)。仓库里另有 `tools/a4/wall_probe.sh` 同名件，两份已分叉(取锁实现不同)，属漂移风险。

### A6【中·判词档位】semantic 的 PARTIAL 与 PASS 共用 rc=0
- `:177-180`: 只命中 `DONE_NOT_A_MISCOMPILER` 时打印 `SEMANTIC_VERDICT=PARTIAL` 但 `verdict=0`。
- 本战役别处的口径是"rc=0=PASS(全绿)"(`post_wall_verify.sh:91`、`unlock_decisive.sh:43`)，
  任何按 rc 判绿的包装都会把"V4 反例未取得"读成绿；脚本自己的注释(`:87-90`)明说它"不是绿"。
- 判死法: `STEPS=v4` 且预置 `$OUT/v4/DONE_NOT_A_MISCOMPILER` ⇒ 打印 PARTIAL、`echo $?` = 0。建议给 PARTIAL 独立码(如 5)。

### A7【中】semantic v1 是唯一不计数、不 sleep 的块 ⇒ 缺 $BIN 时热循环烧满 5400s
- `:203-211`: `"$BIN" --self-test`；失败只 `echo + continue`，**既不自增 attempt 也无 sleep**。
- 触发: `$OUT/v0/PASS` 残留而 `$OUT/rsi_semantic` 被删/不可执行 ⇒ rc=127 打转直到
  `MAX_TOTAL_SEC`(`:161`)，`MAX_ATTEMPTS` 完全不起作用，且每圈覆写 `$OUT/v1.log`。
- 判死法: 在副本上造"只有 v0/PASS 无 $BIN"的状态 ⇒ 观察 v1 刷屏、attempt 不涨。
  建议: rc!=0 时自增 attempt 并 `sleep 5`；`[ -x "$BIN" ] || rm -f "$OUT/v0/PASS"`(让 v0 重跑)。

### A8【中】CLI 构建不在锁内，且两个排队件共享同一个 CLI 路径会被互相删建
- `a9b:134 ensure_cli` 在 `a9b:145` 取锁**之前**；`cdomain:126` 在 `cdomain:143` 之前。
  `ensure_cli` 内含一次真编译(`a9b:100-102`/`cdomain:96-98`)=**无锁编译**，与取锁纪律自相矛盾。
- 更实际的风险: 两件共用 `CLI_HOME="${RSI_CLI_HOME:-.rebuild/rsi_cli}"`(`a9b:84`/`cdomain:80`)，
  各自 `rm -f "$CLI"` 后重编同一路径(`a9b:99`/`cdomain:95`)；并发时应有的互斥恰好在锁区间之外
  ⇒ 一条腿可能执行到被对方删掉/写了一半的 CLI。
- 判死法: 两个终端同时起 a9b 与 cdomain(WAIT 模式) ⇒ 观察 `cli_build` 交错、腿内 CLI 报 ENOENT/校验失败。
  修法: 把 ensure_cli 移进取锁区间，或编到 `$CLI.$$` 再原子 `mv`。

---

## B. 低 / 中:锁自愈与调度

### B1 无主锁/僵尸锁没有自愈路径(疑似锁泄漏)
- `acquire_slot` 是"先 `mkdir` 再写 owner.txt"(`semantic:58-63`、`a9b:56-59`、`cdomain:50-53`)。
  两步之间被 SIGKILL(或 printf 失败) ⇒ 锁目录在、owner.txt 缺 ⇒ `mine()` 对**所有人**恒假，
  `release_slot` 也删不掉；PRE 的 stale 判定要求 owner_pid 非空(`a7_preconditions.sh:39`)，故它判
  `present` + `pid=<unknown>` ⇒ BUSY。
- 僵尸锁(owner.txt 指向已死 pid)同样清不掉: wait 模式三件都是 `[ -e "$LOCK" ] && return 3`
  (`semantic:85-86`、`a9b:72-73`、`cdomain:66-67`)，**在问 PRE 之前就返回 BUSY**，
  `acquire_slot` 也不会接管别人的锁 ⇒ 只能等外部清理，自己一等就是 900s×N 或满预算。
- 判死法: 副本上 `mkdir ${LOCK}`(不写 owner.txt) ⇒ `SLOT_MODE=acquire SLOT_WAIT_SEC=5 ...` 观察
  `SLOT_BUSY` 且无人能自愈；`owner.txt` 写一个已死 pid 再跑 wait 模式 ⇒ 三件空转到 MAX_TOTAL_SEC。
  建议: acquire 侧加"owner 不存在或 owner 已死 ⇒ rmdir 接管"，PRE 之前不做纯 `-e` 短路。

### B2 SLOT_BUSY 的 `continue` 语义与注释不符
- `a9b:145`、`cdomain:144`: 取锁超时后 `continue` 落在 `for t in $pending` / `for c in $pending` 内，
  即"换下一条腿再取一次锁"，而不是注释说的"留给下一轮"。单轮可能连付 `SLOT_WAIT_SEC`(900s)×腿数。
- 判死法: `SLOT_WAIT_SEC=5 A9_LEG_ORDER='p n n0' MAX_ATTEMPTS=1 SLOT_MODE=acquire`，外部占住锁
  ⇒ 观察一条 attempt 内三次 SLOT_BUSY、耗时 ≈15s(而非 5s)。

### B3 死变量
- `cdomain:30-31` 的 `WINDOW_SAMPLES/WINDOW_INTERVAL` 全文无引用(旧长确认逻辑残留)；
  设了 `A9_WINDOW_SAMPLES` 以为会生效是空操作。`a9b:22-23` 的同类变量**有**用(`:147` 透传探针)。

### B4 post_wall_verify 先归档后跑
- `:64-77` 在跑腿前把既有 `PASS/INCONCLUSIVE_DEP` `mv` 进 `$ARCH`。若窗口始终不来/腿起不来，
  主位置从"有 PASS"变成"无判词"(件在 `$ARCH` 里，路径已打印)。属已知取舍，但"归档=丢弃主判词"应写进纪律。

---

## C. 逐问核对(用户五问)

1. **取锁/放锁配对**: 正常路径与 continue 路径均配对 —— release 在腿结束处**无条件**调用
   (`semantic:153`、`a9b:151`、`cdomain:156`)，acquire 失败路径不持有锁故不需释放；
   acquire 超时返回 3 的分支(`semantic:126-129`)也无锁在手。`set -u` 下取锁块所用变量全部有默认值
   (`SLOT_WAIT_SEC`/`SLOT_MODE`/`WATCH_ON_BUSY`)，无未定义变量。
   **泄漏/越权面** = A3(trap 越权删他锁) + B1(无主锁/僵尸锁无自愈，自己也不接管)。
2. **判词档位**: A2(FAIL/未跑→INCONCLUSIVE_DEP)、A4(未跑完→WALL_STILL_UP)、A5(判词无效仍落 PASS、恒 exit 0)、
   A6(PARTIAL→rc=0)。cdomain 的档位顺序是对的: `cdomain:180-191` 先认 `cd_c2_reject` 证据再认 `WRC=3`，
   窗口丢失不会被写成 INCONCLUSIVE_DEP(与 a9b 相反，a9b 应照抄这个顺序)。
3. **变量/路径**: `$LOCK`(`semantic:43`/`a9b:47`/`cdomain:41`)、`$OUT`(`:19`/`:18`/`:26`)、
   `$LEGS`(`a9b:18`/`cdomain:26`)、`$ARCH`(`post_wall_verify:27`) 均在首次使用前定义；
   `$CLI` 在 `ensure_cli` 内使用、由调用点先赋值(`a9b:132`/`cdomain:125`)——可用但脆弱。
   `PIPESTATUS` 两处用法正确(`post_wall_verify:82-83`、`87-88`，读取紧贴管道，取的是子脚本 rc，
   tail 截断不影响)。`tool_sha`(`semantic:107`)对缺失 `$BIN` 会产出空 `--cache-key:`(只在 A7 状态下发生)。
   路径风险 = A5 的 `.rebuild/` 依赖。
4. **bash -n 之外的语义**: 四件 `bash -n` 全过；`case` 无漏 `;;`(`semantic:95` 已逐字符核对；
   `acquire_slot` 内的 `case` 均带 `;;`)；`local` 全部在函数内(逐行核对，无函数外)；
   `trap` 只有 acquire_slot 一处来源，无互相覆盖，但"取得过一次即永久生效"是 A3 的根因；
   `export WATCH_ON_BUSY` 作用域正确(子探针/看门狗能收到，`a9b:70`/`cdomain:64`/`semantic:164`)。
5. **最小复现/判死法**: 每条已就地给出，均可零编译或小改动触发。

---

## D. 范围外但同一解锁路径(相关件，供参考)

- `unlock_decisive.sh:24` 只按 `bin=yes` 计数判墙，**没有** `post_wall_verify.sh:44` 的 WALL_PROBE_INCONCLUSIVE 分流；
  而 `wall_probe_retry.sh:13` 也只认 `PROBE_WINDOW_LOST`(不认 `PROBE_TIMEOUT`/watchdog_rc=4)。
  两者叠加 ⇒ 4 轮全空手/探针超时都会被报成 `WALL_STILL_UP`(exit 2)。这条正是账本 §(status:529) 记过的缺陷在同族新件里的复现。
- `unlock_decisive.sh:42-44` 与 `post_wall_verify.sh:90-92` 一样恒 `exit 0`。

## E. 建议的最小修法(只报告，未改动)

1. `a9_run_slot_probe.sh` 窗口复检先认自己人(或 `SLOT_MODE=acquire` 时短路两处 PRE 门) —— 解 A1。
2. `a9b_wait_and_run.sh:166-177` 分支重排: rc=1/2 → FAIL，rc=3 → INCONCLUSIVE，最后才是 INCONCLUSIVE_DEP —— 解 A2。
3. 三件 + 两个探针的 `trap 'rm -rf "$LOCK"' EXIT INT TERM` 改成 `trap release_slot EXIT INT TERM` —— 解 A3。
4. `post_wall_verify.sh:44-48` 改为"默认 INCONCLUSIVE，仅探针确实完成后才允许 WALL_STILL_UP"，并先断言探针文件存在 —— 解 A4/A5。
5. `semantic_wait_and_run.sh` PARTIAL 用独立退出码；v1 失败自增 attempt + sleep —— 解 A6/A7。
