# A9b 三腿 + cdomain 两档 · 判词证据表（只读归并）

**生成**: 2026-09-13T20:03:44Z（2026-09-14 04:03 +0800），本席**只读**归并。
**只读声明**: 全程未发起任何编译、未取 `.rebuild/COMPILE_SLOT.lock`、未改动任何源码或 `.rebuild/` 在飞件；`src/core/**`、`.rebuild/b_line/**` 零写入。
**证据范围**: `docs/cheng-rsi-acceptance-status.md` 的 §6.1u / §6.1w / §6.1x / §6.1bb / §6.1y（外加为对齐标记来源而读的 `.rebuild/cdomain_run2.log`）。
**路径基准**: 仓库根 `/Users/lbcheng/cheng-lang`（下表路径均为仓库相对路径），行号 1-based，`file:line` 可直接定位。

**三条口径纪律**
1. 每条判词一行：`条目（账本行号 + 对象）| 判词（逐字）| 原始件路径 | 支撑行（逐字）| 类别`。判词一律照抄原始件字面，不改写。
2. 类别用本席规定的三值 `PASS` / `INCONCLUSIVE_DEP` / `未取得`；**墙探针**一类判词在账本里既不是 PASS 也不是 DEP（是墙字符串），据实另标 `FAIL(墙)` / `FAIL(越门)`，**不并入三值**（避免改写判词类别）。
3. 凡本席未能在盘上复算的，写`未验证`，不写成结论。

---

## §0 总判词（四条落盘总账）

| 条目 | 判词（逐字） | 原始件路径 | 支撑行（逐字） | 类别 |
|---|---|---|---|---|
| §6.1x:590 A9b | `A9B_VERDICT=INCONCLUSIVE_DEP legs_with_dep=(p) all_legs=(p n n0) attempts=1 elapsed=62s` | `.rebuild/a9b_run1.log:68` | `A9B_VERDICT=INCONCLUSIVE_DEP legs_with_dep=(p) all_legs=(p n n0) attempts=1 elapsed=62s` | INCONCLUSIVE_DEP |
| §6.1w/§6.1z:627 cdomain | `CDOMAIN_VERDICT=INCONCLUSIVE_DEP corpora_with_dep=(0 1) all_corpora=(0 1) attempts=2 elapsed=280s` | `.rebuild/cdomain_run2.log:45` | `CDOMAIN_VERDICT=INCONCLUSIVE_DEP corpora_with_dep=(0 1) all_corpora=(0 1) attempts=2 elapsed=280s` | INCONCLUSIVE_DEP |
| §6.1bb:697 语义 oracle | `SEMANTIC_VERDICT=PASS steps=(v3f) attempts=1 elapsed=293s` | `.rebuild/semantic_run35.log:19` | `SEMANTIC_VERDICT=PASS steps=(v3f) attempts=1 elapsed=293s` | PASS |
| §6.1y:602 语义 oracle | `SEMANTIC_VERDICT=PARTIAL steps=(v4) 未取得(候选未复现) attempts=1 elapsed=119s` | `.rebuild/semantic_run41.log:15` | `SEMANTIC_VERDICT=PARTIAL steps=(v4) 未取得(候选未复现) attempts=1 elapsed=119s` | 未取得 |

---

## §1 §6.1u — 墙探针判词（RSI 形状最小复现；账本明言"不得写成 PASS 或 FAIL"）

| 条目（账本行） | 判词（逐字） | 原始件路径 | 支撑行（逐字） | 类别 |
|---|---|---|---|---|
| §6.1u:485 c1@kd_b905b（`import std/strings` + `return 0`，源 sha `f8bd6e8cd2cec634`） | `compiler parser receipt: manual consume function identity drift` | `.rebuild/patchwork/b905b_walls.log:2-4` + `:8` | `:2` `PROBE_RESULT src=c1 guard_rc=3 bin=no sha=f8bd6e8cd2cec634`<br>`:3` `status=ABORT rc=3 abort_reason=exit_code_contract_mismatch `<br>`:8` ` compiler parser receipt: manual consume function identity drift` | FAIL(墙) |
| §6.1u:486 c3@kd_b905b（`var total: int64` + `for i in range(200)`，源 sha `8fc16a8101e001d1`） | `typed expr value definition: producer lacks exact type or ownership proof` | `.rebuild/patchwork/b905b_walls.log:9-11` + `:15` | `:9` `PROBE_RESULT src=c3 guard_rc=3 bin=no sha=8fc16a8101e001d1`<br>`:15` `typed expr value definition: producer lacks exact type or ownership proof` | FAIL(墙) |
| §6.1u:487 c2 对照 @kd_b701（成功腿） | `PAIR cc=kd_b701 mode=plain src=c2.cheng elapsed=220s guard_rc=0 bin=yes` / `     phase_rows=18 peak=800687280 ...` | `.rebuild/patchwork/contrast3.log:2-3` | `:2` `PAIR cc=kd_b701 mode=plain src=c2.cheng elapsed=220s guard_rc=0 bin=yes`<br>`:3` `     phase_rows=18 peak=800687280 verdict_tail=[compile_progress phase=runtime_execute status=done]` | PASS |
| §6.1u:487 c2 对照 @kd_b905b（判词"越门被杀"，指向 §6.1v） | `PAIR cc=kd_b905b mode=nc src=c2.cheng elapsed=235s guard_rc=137 bin=no` / `     phase_rows=8 peak=805750272 ...` | `.rebuild/patchwork/contrast3.log:4-5` | `:4` `PAIR cc=kd_b905b mode=nc src=c2.cheng elapsed=235s guard_rc=137 bin=no`<br>`:5` `     phase_rows=8 peak=805750272 verdict_tail=[compile_progress phase=runtime_provider_objects status=begin]` | FAIL(越门) |
| §6.1u:495 c0（无 import，`fn main(): int32 =`+`return 0`）@kd_b905b | `rc=0、产出可执行件、18 相行`（kd_b905b 实测 221 s） | `.rebuild/patchwork/contrast3.log:6-7` | `:6` `PAIR cc=kd_b905b mode=plain src=c0.cheng elapsed=221s guard_rc=0 bin=yes`<br>`:7` `     phase_rows=18 peak=770868400 verdict_tail=[compile_progress phase=runtime_execute status=done]` | PASS |
| §6.1u:497 c5@kd_f102（`import std/strutils`，源 sha `0a24b03c80bcb892`） | `同一道墙：manual consume function identity drift` | `.rebuild/patchwork/c5c6_probe.log:2-3` + `:8` | `:2` `PROBE_RESULT src=c5 guard_rc=3 bin=no sha=0a24b03c80bcb892`<br>`:8` ` compiler parser receipt: manual consume function identity drift` | FAIL(墙) |
| §6.1u:498 c6@kd_f102（`import std/os`，源 sha `c56def1754c21282`） | `compiler parser receipt: normalized expression parser node missing exprIndex=5 kind=1 line=50 surface=if rootNode=-1 originNode=-1 role=0` | `.rebuild/patchwork/c5c6_probe.log:9-10` + `:15` | `:9` `PROBE_RESULT src=c6 guard_rc=3 bin=no sha=c56def1754c21282`<br>`:15` ` compiler parser receipt: normalized expression parser node missing exprIndex=5 kind=1 line=50 surface=if rootNode=-1 originNode=-1 role=0` | FAIL(墙) |
| §6.1u:500 触发条件收窄（`std` 导入闭包） | ⇒ 触发条件 = 只要 `import std/<任一模块>`（strings / strutils / os 三例全中）... | `.rebuild/patchwork/c5c6_probe.log:1`（窗口/驱动行）+ 上两行 c5/c6 判词 | `:1` `PROBE_WINDOW 2026-09-13T11:14:29Z attempt=1 drv=/Users/lbcheng/cheng-lang/.rebuild/f1_line/out/kd_f102 sha=4dfd9d6109767755` | FAIL(墙) |
| §6.1u:502 m1 本地导入对照@kd_f102（`import cheng/a9_wall_probe/m0`） | 而是更早的 `merkle_store_before_snapshot_head_absent`（模块不在被编译的 merkle 快照里） | `.rebuild/patchwork/m1_retry.log:5-6` + `:12` | `:5` `PROBE_WINDOW 2026-09-13T11:28:46Z attempt=1 drv=/Users/lbcheng/cheng-lang/.rebuild/f1_line/out/kd_f102 sha=4dfd9d6109767755`<br>`:12` `merkle_store_before_snapshot_head_absent` | FAIL(墙，非干净对照) |
| §6.1u:519 kd_d7 复测（typed_expr 四连修后）c1/c3 逐字不变 | c1 `compiler parser receipt: manual consume function identity drift`；c3 `typed expr value definition: producer lacks exact type or ownership proof` | `.rebuild/patchwork/kd_d7_walls3.log:3-4` + `:11` + `:18` | `:3` `SLOT_ACQUIRED 2026-09-13T14:06:26Z purpose=wall_probe`<br>`:11` ` compiler parser receipt: manual consume function identity drift`<br>`:18` `typed expr value definition: producer lacks exact type or ownership proof` | FAIL(墙) |
| §6.1u:527 kd_b1002 复测（sha `0fbca3919bf8224b…`）c1/c3 逐字不变 | 同上两条墙字符串 | `.rebuild/reverify/20260913T102300Z_0fbca391/wall_probe.log:1` + `:8` + `:15` | `:1` `PROBE_WINDOW 2026-09-13T10:24:21Z attempt=1 drv=/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/kd_b1002 sha=0fbca3919bf8224b`<br>`:8` ` compiler parser receipt: manual consume function identity drift`<br>`:15` `typed expr value definition: producer lacks exact type or ownership proof` | FAIL(墙) |
| §6.1u:527 kd_f102 复测（sha `4dfd9d61…`）c1/c3 逐字不变 | 同上两条墙字符串 | `.rebuild/reverify/20260913T105401Z_4dfd9d61/wall_probe.log:1` + `:8` + `:15` | `:1` `PROBE_WINDOW 2026-09-13T11:08:30Z attempt=1 drv=/Users/lbcheng/cheng-lang/.rebuild/f1_line/out/kd_f102 sha=4dfd9d6109767755`<br>`:8` ` compiler parser receipt: manual consume function identity drift`<br>`:15` `typed expr value definition: producer lacks exact type or ownership proof` | FAIL(墙) |
| §6.1u:527 kd_b1102 复测（sha `fab71072…`，watchdog_rc=0 ⇒ 非窗口丢失） | 同上两条墙字符串；`watchdog_rc=0` | `.rebuild/reverify/20260913T113247Z_fab71072/wall_probe.log:2` + `:8` + `:9` + `:15` | `:2` `PROBE_RESULT src=c1 guard_rc=3 watchdog_rc=0 bin=no sha=f8bd6e8cd2cec634`<br>`:8` ` compiler parser receipt: manual consume function identity drift`<br>`:15` `typed expr value definition: producer lacks exact type or ownership proof` | FAIL(墙) |

**§6.1u 结论行（账本自述，原始件即上表各墙行，另见 §3 / §4 的落盘标记）**

| 条目 | 判词（逐字） | 原始件路径 | 支撑行（逐字） | 类别 |
|---|---|---|---|---|
| §6.1u:489 | `⇒ 账本 §6.15 的单一缺口仍然开着，A9b 三腿与 cdomain 档 0/1 的判词继续是 INCONCLUSIVE（依赖未满足），不得写成 PASS 或 FAIL。` | `docs/cheng-rsi-acceptance-status.md:489`（账本自述；原始件 = 表 C1–C3、表 D2–D3 的标记） | 同左 | INCONCLUSIVE_DEP |

---

## §2 §6.1v — Cheng 链编译成本/贴门判词（§6.1u:487 与 §6.1u:551 的原始件）

| 条目（账本行） | 判词（逐字） | 原始件路径 | 支撑行（逐字） | 类别 |
|---|---|---|---|---|
| §6.1v:541 kd_b701（里程碑前）c2 `echo("hi")` plain，220 s | `PAIR cc=kd_b701 mode=plain src=c2.cheng elapsed=220s guard_rc=0 bin=yes`；18 相行；峰值 800,687,280 B | `.rebuild/patchwork/contrast3.log:2-3` | `:2` `PAIR cc=kd_b701 mode=plain src=c2.cheng elapsed=220s guard_rc=0 bin=yes`<br>`:3` `     phase_rows=18 peak=800687280 verdict_tail=[compile_progress phase=runtime_execute status=done]` | PASS |
| §6.1v:542 kd_b905b 里程碑后 c2 nc，235 s，越门被 SIGKILL | `PAIR cc=kd_b905b mode=nc src=c2.cheng elapsed=235s guard_rc=137 bin=no`；峰值 805,750,272 B > 门 805,306,368 B | `.rebuild/patchwork/contrast3.log:4-5` | `:4` `PAIR cc=kd_b905b mode=nc src=c2.cheng elapsed=235s guard_rc=137 bin=no`<br>`:5` `     phase_rows=8 peak=805750272 verdict_tail=[compile_progress phase=runtime_provider_objects status=begin]` | FAIL(越门) |
| §6.1v:543 kd_b905b c0 `return 0` plain，221 s | `PAIR cc=kd_b905b mode=plain src=c0.cheng elapsed=221s guard_rc=0 bin=yes`；18 相行；峰值 770,868,400 B | `.rebuild/patchwork/contrast3.log:6-7` | `:6` `PAIR cc=kd_b905b mode=plain src=c0.cheng elapsed=221s guard_rc=0 bin=yes`<br>`:7` `     phase_rows=18 peak=770868400 verdict_tail=[compile_progress phase=runtime_execute status=done]` | PASS |
| §6.1v:544 cheng.stage3（C 链对照）c2 nc，3 s，0 相行 | `PAIR cc=cheng.stage3 cc_sha=05af823e7db0 src=c2.cheng elapsed=3s guard_rc=0 bin=yes`；`phase_rows=0` | `.rebuild/patchwork/contrast.log:4-5` | `:4` `PAIR cc=cheng.stage3 cc_sha=05af823e7db0 src=c2.cheng elapsed=3s guard_rc=0 bin=yes`<br>`:5` `     phase_rows=0 verdict_tail=[([binstamp]) v7]` | PASS(对照) |
| §6.1v:551 排程后果 | `⇒ 在墙与成本双双未解锁前，这两项的判词只能保持 INCONCLUSIVE` | `docs/cheng-rsi-acceptance-status.md:551`（账本自述） | 同左 | INCONCLUSIVE_DEP |

---

## §3 §6.1x — A9b 三腿（§6.1x:578 原始件 = 各腿标记 + `run_att*/` + `a9b_run1.log`）

| 条目（账本行） | 判词（逐字） | 原始件路径 | 支撑行（逐字） | 类别 |
|---|---|---|---|---|
| §6.1x:582 腿 p（正腿：要求 `phase_rows ≥ 1`，probe_rc=1） | `leg=p verdict=INCONCLUSIVE_DEP reason=missing_phase_rows rows=0`；`INCONCLUSIVE_DEP（逐相仪器缺失 —— 不是 FAIL）` | `.rebuild/a9b/legs/p/INCONCLUSIVE_DEP:1` + `:5`；`.rebuild/a9b_run1.log:22` + `:24` + `:27` | 标记 `:1` `leg=p verdict=INCONCLUSIVE_DEP reason=missing_phase_rows rows=0`<br>标记 `:5` `probe_rc=1`<br>日志 `:22` `a9_assert_phase_rows: FAIL positive phase_rows=0 (逐相行不可得)`<br>日志 `:27` `leg=p INCONCLUSIVE_DEP (逐相仪器缺失 — 不是 FAIL)` | INCONCLUSIVE_DEP |
| §6.1x:582 腿 p 引擎断言（证明非空跑） | `a9_assert_engine_trials: PASS p trials=1 >= 1 (非空洞)` | `.rebuild/a9b_run1.log:20` + `:21` | `:20` `a9_assert_engine_trials label=p trials=1 expect_min=1 start=rsi_engine start gen=0 d0=0/0 d1=0/0 d2=1/0 m=0 score=22963 stdout=/Users/lbcheng/cheng-lang/.rebuild/a9b/legs/p/run_att1/guard_p.out.txt`<br>`:21` `a9_assert_engine_trials: PASS p trials=1 >= 1 (非空洞)` | PASS(子断言) |
| §6.1x:583 腿 n（负腿：要求 0 行，probe_rc=0） | `leg=n verdict=PASS attempt=1 elapsed=43s`；`a9_assert_phase_rows: PASS zero phase_rows=0 (无条件乱喷不成立)` | `.rebuild/a9b/legs/n/PASS:1` + `:5`；`.rebuild/a9b_run1.log:42` + `:46` | 标记 `:1` `leg=n verdict=PASS attempt=1 elapsed=43s`<br>标记 `:5` `phase_rows=0`<br>日志 `:42` `a9_assert_phase_rows: PASS zero phase_rows=0 (无条件乱喷不成立)`<br>日志 `:46` `leg=n PASS (落袋 /Users/lbcheng/cheng-lang/.rebuild/a9b/legs/n/PASS)` | PASS |
| §6.1x:584 腿 n0（负腿 + 子环境转储，probe_rc=0） | `leg=n0 verdict=PASS attempt=1 elapsed=60s`；`a9_assert_env_dump: PASS CHENG_PROGRESS matches=0` | `.rebuild/a9b/legs/n0/PASS:1` + `:5`；`.rebuild/a9b_run1.log:60` + `:61` + `:67` | 标记 `:1` `leg=n0 verdict=PASS attempt=1 elapsed=60s`<br>标记 `:5` `phase_rows=0`<br>日志 `:61` `a9_assert_env_dump: PASS CHENG_PROGRESS matches=0`<br>日志 `:67` `leg=n0 PASS (落袋 /Users/lbcheng/cheng-lang/.rebuild/a9b/legs/n0/PASS)` | PASS |
| §6.1x:586 三腿共同（窗口/守卫/看门狗） | `guard_rc=0`、`watchdog_rc=0`、`window=a9_window_watch outcome=held` | `.rebuild/a9b_run1.log:19`（p）+ `:38`（n）+ `:57`（n0） | `:19` `a9_run_slot_probe leg=p guard_rc=0 pgid=34594 watchdog_rc=0 window=a9_window_watch label=p outcome=held reason=-`<br>`:38` `a9_run_slot_probe leg=n guard_rc=0 pgid=34992 watchdog_rc=0 window=a9_window_watch label=n outcome=held reason=-`<br>`:57` `a9_run_slot_probe leg=n0 guard_rc=0 pgid=35436 watchdog_rc=0 window=a9_window_watch label=n0 outcome=held reason=-` | PASS(子断言) |
| §6.1x:582-584 三腿 `probe_rc` 列（1 / 0 / 0） | `leg=p probe_rc=1` / `leg=n probe_rc=0` / `leg=n0 probe_rc=0` | 仅 `p` 标记含 `probe_rc`；n/n0 的 0 来自日志 | `.rebuild/a9b/legs/p/INCONCLUSIVE_DEP:5` `probe_rc=1`；`.rebuild/a9b_run1.log:44` `leg=n probe_rc=0`；`:65` `leg=n0 probe_rc=0` | INCONCLUSIVE_DEP / PASS |

**注（可引用要点）**: 腿 p 的 `run_att1/` 目录 **已不是** 该判词的原始件（被 10:24:42Z 后续轮覆盖，现内容为 rc=143/窗口 busy）——见 §8 不一致清单 C-1；腿 p 判词的活原始件是 `.rebuild/a9b/legs/p/leg_archive/p_rc0_pg34594_1789294000/`（guard_rc=0，与日志 `:19` 的 `pgid=34594` 对齐）。

---

## §4 §6.1w — cdomain 档 0 / 档 1

| 条目（账本行） | 判词（逐字） | 原始件路径 | 支撑行（逐字） | 类别 |
|---|---|---|---|---|
| §6.1w:558 档 0（账本引用的那一轮，圆整到 run1） | `corpus=0 rc=1 watchdog_rc=0` / `inner_guard_reports=1 peak_bytes=178290688 inner_rcs=0,` / `rsi_cdomain: FAIL genesis paired bake failed` | `.rebuild/cdomain_run1.log:71-74` | `:71` `corpus=0 rc=1 watchdog_rc=0`<br>`:72` `inner_guard_reports=1 peak_bytes=178290688 inner_rcs=0,`<br>`:74` `rsi_cdomain: FAIL genesis paired bake failed` | INCONCLUSIVE |
| §6.1z:627 档 0 落盘标记（真正被审计的那份） | `corpus=0 verdict=INCONCLUSIVE_DEP reason=missing_phase_readings tag=0` | `.rebuild/cdomain/legs/corpus0/INCONCLUSIVE_DEP:1` + `:4` + `:5`；同轮日志 `.rebuild/cdomain_run2.log:34-38` | 标记 `:1` `corpus=0 verdict=INCONCLUSIVE_DEP reason=missing_phase_readings tag=0`<br>标记 `:5` `cd_c2_reject reason=missing_phase_readings tag=g00 peak=177127424 peak_ok=1 peak_resident=177127424 peak_footprint=92357424 limit=805306368 limit_ok=1 gate=805306368 phase_rows=0 rc=0`<br>日志 `:36` 同一条 `cd_c2_reject …peak=177127424…`<br>日志 `:38` `corpus=0 INCONCLUSIVE_DEP (依赖未满足: 逐相仪器缺失 — 不是 FAIL)` | INCONCLUSIVE_DEP |
| §6.1z:627 档 1 落盘标记 | `corpus=1 verdict=INCONCLUSIVE_DEP reason=missing_phase_readings tag=1` | `.rebuild/cdomain/legs/corpus1/INCONCLUSIVE_DEP:1` + `:4` + `:5`；同轮日志 `.rebuild/cdomain_run2.log:39-44` | 标记 `:1` `corpus=1 verdict=INCONCLUSIVE_DEP reason=missing_phase_readings tag=1`<br>标记 `:5` `cd_c2_reject reason=missing_phase_readings tag=g00 peak=176635904 peak_ok=1 peak_resident=176635904 peak_footprint=93537072 limit=805306368 limit_ok=1 gate=805306368 phase_rows=0 rc=0`<br>日志 `:42` 同一条 `cd_c2_reject …peak=176635904…`<br>日志 `:44` `corpus=1 INCONCLUSIVE_DEP (依赖未满足: 逐相仪器缺失 — 不是 FAIL)` | INCONCLUSIVE_DEP |
| §6.1w:564 内存腿与 rc 腿判词 | `⇒ 内存腿与 rc 腿都过（peak 178,290,688 B ≪ 门；内层 guard rc=0），唯一拒收理由是 phase_rows=0` | `.rebuild/cdomain_run1.log:73` | `:73` `cd_c2_reject reason=missing_phase_readings tag=g00 peak=178290688 peak_ok=1 peak_resident=178290688 peak_footprint=89621320 limit=805306368 limit_ok=1 gate=805306368 phase_rows=0 rc=0` | INCONCLUSIVE |
| §6.1w:548 单一缺口同因（与 A9b `phase_rows=0`） | `⇒ 在缺口解锁前，档 0/1 的判词恒为 INCONCLUSIVE（依赖未满足）` | 档 0/1 标记（本表上两行）+ 拒收判据源码 `src/rsi/compiler_domain.cheng:194-195` | `:194` `    if phaseRows <= 0:`<br>`:195` `        return "missing_phase_readings"` | INCONCLUSIVE_DEP |

---

## §5 §6.1y — 运行时判据 V0–V9 + V3F（逐条绑原始件）

| 条目 | 判词（逐字） | 原始件路径 | 支撑行（逐字） | 类别 |
|---|---|---|---|---|
| V0 工具自身编译 | `step=v0 verdict=PASS` | `.rebuild/semantic/v0/PASS:1-3`／**2026-09-13T20:05Z 起实际落点** `.rebuild/semantic/superseded/v0.20260914T_toolfix/PASS:1-3`（内容逐字节相同，sha `78f83be0…`） | `:2` `tool_sha256=e742917823a9e3034a925cf379b33a68c5a9e8e34079eedebf4f772a6b231d36`<br>`:3` `tool_src_sha256=e252520f52d8bb69b1017794df4ff5468339b0f7380f97b0fd3fe92f9005cc7b` | PASS |
| V1 比较器负例自检（`checks_pass=7`） | `checks_pass=7` | `.rebuild/semantic/v1/PASS:2`／**实际落点** `.rebuild/semantic/superseded/v1.20260914T_toolfix/PASS:2`（sha `3e38ad7d…`） | `:2` `checks_pass=7` | PASS |
| V2 金标基线记录（基线 `7995091f…`，38 条；`cache_hits=32`） | `step=v2 verdict=PASS` | `.rebuild/semantic/v2/PASS:1-4`；副本 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/semantic_baseline_05af823e.txt` | `:2` `baseline_sha256=7995091fa119bb54d66dbda82aa0b4b9c772691a78889ca477967b07e54ac033`<br>`:3` `carrier_sha256=05af823e7db0c8ea1a69cbd01eda84fcd4b8ff8049d38178663fd357d840f276`<br>`:4` `cache_hits=32` | PASS |
| V2B（追加）缓存复算自证 | `step=v2b verdict=PASS`；`cache_hits=38`（38/38 全命中） | `.rebuild/semantic/v2b/PASS:1-3` | `:2` `baseline_sha256=7995091fa119bb54d66dbda82aa0b4b9c772691a78889ca477967b07e54ac033`<br>`:3` `cache_hits=38` | PASS |
| V3 同载体自证等价（逐条 `baseline=equal`） | `step=v3 verdict=PASS`；`baseline=equal` 共 38 行 | `.rebuild/semantic/v3/PASS:1-2`；`.rebuild/semantic/v3/guard.out.txt:1` + `:3`（`grep -c 'baseline=equal'` = 38） | `PASS:1` `step=v3 verdict=PASS`<br>`PASS:2` `carrier_sha256=05af823e7db0c8ea1a69cbd01eda84fcd4b8ff8049d38178663fd357d840f276`<br>`guard.out.txt:1` `check=compiler_sha256 status=PASS detail=sha256=05af823e7db0c8ea1a69cbd01eda84fcd4b8ff8049d38178663fd357d840f276`<br>`guard.out.txt:3` `check=cell_d0_s0_p0 status=PASS detail=compile_rc=0 fp=0:fea0fcbd1072059811211ce028933ba5efc0a03d2e78040ad438df16826a647a golden=match score=10640 baseline=equal fp=0:fea0fcbd1072059811211ce028933ba5efc0a03d2e78040ad438df16826a647a cached=obs_v1` | PASS |
| V4a 结构必坏载具必判 differ | `step=v4a verdict=PASS (actual_exit_code=1, differ_rows=38)` | `.rebuild/semantic/v4a/PASS:1-2`；`.rebuild/semantic/v4a/guard.out.txt:3`（首条 differ）+ `:47`；`actual_exit_code` 在 `guard.report.txt:359` | `PASS:1` `step=v4a verdict=PASS (actual_exit_code=1, differ_rows=38)`<br>`PASS:2` `carrier=/Users/lbcheng/cheng-lang/.rebuild/patchwork/carrier_bad.sh sha=f8a83a3bb140b15acebe1528ff2b8b096aaac04b98079ddefccdc731000b35b7`<br>`guard.out.txt:3` `check=cell_d0_s0_p0 status=FAIL detail=verdict=differ compile_rc=1 fp=- golden=not_run score=0 compile_rc baseline=0 current=1`<br>`guard.report.txt:359` `actual_exit_code=1` | PASS |
| V4b 已知误编译必判 FAIL（设计件 V4 原意） | `step=v4 verdict=NOT_A_MISCOMPILER (候选逐格 equal, 未复现误编译 ⇒ 反例未取得)`；`SEMANTIC_VERDICT=PARTIAL` | `.rebuild/semantic/v4/DONE_NOT_A_MISCOMPILER:1-3`；`.rebuild/semantic/v4/guard.out.txt`；`.rebuild/semantic_run41.log:10-15` | `v4:1` `step=v4 verdict=NOT_A_MISCOMPILER (候选逐格 equal, 未复现误编译 ⇒ 反例未取得)`<br>`v4:2` `candidate=stage3+BACKEND_JOBS=2 wrapper sha=9a61acebcda3924fedee55b9d6379a527f7394231db6ec13513dbe1d039fc9e8`<br>`run41:13` `v4 actual_exit_code=0 differ_rows=0`<br>`run41:15` `SEMANTIC_VERDICT=PARTIAL steps=(v4) 未取得(候选未复现) attempts=1 elapsed=119s` | 未取得 |
| V5 8 源闭包 known-red 基线（前提已变） | `check=closure8_multisource status=PASS detail=compile_rc=0 fp=0:e3b0c442…`（空串 sha） | `.rebuild/semantic/v2/guard.out.txt:42` | `:42` `check=closure8_multisource status=PASS detail=compile_rc=0 fp=0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 record_mode` | PASS（前提已变，如实登记） |
| V6 incumbent 两口径 | 生产口径 `incumbent=2254 oracle_best_correct=3937 equals_best=0 gen=3`；私账本口径**未取得** | `.rebuild/semantic/v8/guard.out.txt:44` | `:44` `check=ledger_incumbent status=PASS detail=incumbent=2254 oracle_best_correct=3937 equals_best=0 gen=3` | PASS（生产口径）/ 未取得（私账本口径） |
| V7 语料漂移 fail-closed | `step=v7 verdict=PASS (rc=3, verdict=drift 实测)`；`cached=obs_v1` 共 37 行 | `.rebuild/semantic/v7/PASS:1`；`.rebuild/semantic/v7/guard.out.txt:37` | `PASS:1` `step=v7 verdict=PASS (rc=3, verdict=drift 实测)`<br>`guard.out.txt:37` `check=fixture_ordinary status=FAIL detail=verdict=drift compile_rc=2 fp=- corpus_src_sha baseline=778411395cf0c9cb77503f149d0182255c135a76c81405a99974b9ae7ed14c46 current=4a181a93da409029de783ff4509c7dd46ee2ee703dc4043df7beed328a1fa626` | PASS |
| V8 基线缺条 fail-closed | `step=v8 verdict=PASS (rc=3, verdict=missing 实测)` | `.rebuild/semantic/v8/PASS:1`；`.rebuild/semantic/v8/guard.out.txt:3` | `PASS:1` `step=v8 verdict=PASS (rc=3, verdict=missing 实测)`<br>`guard.out.txt:3` `check=cell_d0_s0_p0 status=FAIL detail=verdict=missing compile_rc=0 fp=0:fea0fcbd… golden=match score=10640 baseline_entry_absent cached=obs_v1` | PASS |
| V9 守卫包裹轮（RSS 腿） | 守卫 `tool=tools/beat_c_process_group_guard.sh`；`memory_limit_bytes=805306368`；峰值 `13860864` B | `.rebuild/semantic/v3/guard.report.txt:1` + `:368` + `:375` | `:1` `tool=tools/beat_c_process_group_guard.sh`<br>`:368` `memory_limit_bytes=805306368`<br>`:375` `process_tree_enforced_peak_bytes=13860864` | PASS |
| V3F（追加）无缓存全量 judge | `step=v3f verdict=PASS`；`cache_hits=0`；`checks_pass=43 checks_fail=0 entries=31+7` | `.rebuild/semantic/v3f/PASS:1-3`；`.rebuild/semantic/v3f/guard.out.txt:46`／**自 2026-09-13T20:05Z 起实际落点** `.rebuild/semantic/superseded/v3f.20260914T_toolfix/PASS:1-3` + `.rebuild/semantic/superseded/v3f.20260914T_toolfix/guard.out.txt:46`（逐字节相同） | `PASS:2` `cache_hits=0`<br>`PASS:3` `carrier_sha256=05af823e7db0c8ea1a69cbd01eda84fcd4b8ff8049d38178663fd357d840f276`<br>`guard.out.txt:46` `cheng.rsi.semantic.v1 checks_pass=43 checks_fail=0 entries=31+7 covered=31/31 best_correct=3937 compiler_sha=05af823e7db0c8ea1a69cbd01eda84fcd4b8ff8049d38178663fd357d840f276 mode=0` | PASS |

---

## §6 §6.1bb — V3F 收口轮（逐字块对账）

| 条目（账本行） | 判词（逐字） | 原始件路径 | 支撑行（逐字） | 类别 |
|---|---|---|---|---|
| §6.1bb:692 持锁 | `SLOT_ACQUIRED 2026-09-13T12:21:12Z pid=62202 purpose=l4_v3f` | `.rebuild/semantic_run35.log:10` | `:10` `SLOT_ACQUIRED 2026-09-13T12:21:12Z pid=62202 purpose=l4_v3f` | PASS |
| §6.1bb:693 判词行 | `cheng.rsi.semantic.v1 checks_pass=43 checks_fail=0 entries=31+7 covered=31/31 best_correct=3937 compiler_sha=05af823e7db0c8ea… mode=0` | `.rebuild/semantic_run35.log:15`（与 `v3f/guard.out.txt:46` 同字） | `:15` `cheng.rsi.semantic.v1 checks_pass=43 checks_fail=0 entries=31+7 covered=31/31 best_correct=3937 compiler_sha=05af823e7db0c8ea1a69cbd01eda84fcd4b8ff8049d38178663fd357d840f276 mode=0` | PASS |
| §6.1bb:694 工具总判 | `rsi_semantic: PASS SEMANTIC_EQUIVALENT` | `.rebuild/semantic_run35.log:16` | `:16` `rsi_semantic: PASS SEMANTIC_EQUIVALENT` | PASS |
| §6.1bb:695 无缓存 | `cache_hits=0` | `.rebuild/semantic_run35.log:17` | `:17` `cache_hits=0` | PASS |
| §6.1bb:696 标记行 | `STEP=v3f verdict=PASS`（marker: `cache_hits=0` / `carrier_sha256=05af823e…`） | `.rebuild/semantic/v3f/PASS:1-3`／**实际落点** `.rebuild/semantic/superseded/v3f.20260914T_toolfix/PASS:1-3` | `:1` `step=v3f verdict=PASS`<br>`:2` `cache_hits=0`<br>`:3` `carrier_sha256=05af823e7db0c8ea1a69cbd01eda84fcd4b8ff8049d38178663fd357d840f276` | PASS |
| §6.1bb:697 总判词 | `SEMANTIC_VERDICT=PASS steps=(v3f) attempts=1 elapsed=293s` | `.rebuild/semantic_run35.log:19` | `:19` `SEMANTIC_VERDICT=PASS steps=(v3f) attempts=1 elapsed=293s` | PASS |
| §6.1bb:706 收口 | `⇒ L4 语义 oracle 判据收口：V0 / V1 / V2 / V2B / V3 / V3F / V4a / V7 / V8 / V9 全部取得；未取得的两条已在 §6.1y 如实登记` | `docs/cheng-rsi-acceptance-status.md:706`（账本自述；原始件 = 上表 V0–V9 各行） | 同左 | PASS（部分；V4b/V5/V6 私账本口径 未取得） |

---

## §7 `audit_claims.py` 只读审计输出（逐字）

命令（本席实跑两遍，只读，未取编译槽）：

**第一遍（2026-09-13T20:03Z 前后，标记仍在原位）**

```
$ cd /Users/lbcheng/cheng-lang && python3 docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/audit_claims.py
audit: 31/31 OK
[exit=0]
```

**第二遍（2026-09-13T20:06:23Z，同一脚本、同一命令，未改一个字节）**

```
$ cd /Users/lbcheng/cheng-lang && date -u +%FT%TZ && python3 docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/audit_claims.py
2026-09-13T20:06:23Z
audit: 26/31 OK
  FAIL v0.tool_sha256 ?
  FAIL v0.tool_src_sha256 ?
  FAIL v1.checks_pass=7 
  FAIL v3f.cache_hits=0 ?
  FAIL v3f.carrier_sha256 
[exit=0]
```

⇒ **两遍之间的差不是判词变化，是原始件在飞**：04:05 +0800（= 20:05Z）另一条线把 `.rebuild/semantic/{v0,v1,v3f}` 的标记与 guard 报告**整目录搬进** `.rebuild/semantic/superseded/*.20260914T_toolfix/`（内容逐字节不变、mtime 保留 16:59 / 20:22）。5 条 FAIL 全部对应被搬走的 3 个标记，其余 26 项仍对盘。详见 §8 C-7、§9 归档指纹。

脚本本体（`docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/audit_claims.py`，sha256 `e7a42d1dea580e90eb774810d79c527229e8a8c4fe98cce8d86beb462d4ccfc5`）审计 31 项，其中与本次归并直接相关的：`v0.tool_sha256` / `v0.tool_src_sha256` / `v1.checks_pass=7` / `v2|v2b.baseline_sha256` / `v2.carrier_sha256` / `receipt.baseline==live` / `baseline.entry_count==38` / `v3|v7|v8` 判词行与 guard 报告在位 / `v3f.cache_hits=0` / `v3f.carrier_sha256` / `v3f.checks_fail=0` / `v3f.entries=31+7` / `a9b.{p,n,n0}` 标记在位与 `cli_sha256` 对盘 / 两条 PASS 腿 `phase_rows=0` / `cdomain.{0,1}` DEP 含 `missing_phase_readings` 且 `inner_peak_bytes < 805306368`。

**审计脚本未覆盖、由本席补做的对盘复核**（只读 `shasum -a 256`，全部一致，见 §9）：
- `artifacts/bootstrap/cheng.stage3` = `05af823e…`（对应 §6.1u:478 的 kd_b905b 同源面、§6.1v 的 C 链对照、A9b/cdomain 标记里的 `compiler_sha256`）；
- `src/rsi/compiler.cheng` = `bd15bddd…`（n/n0 标记 `rsi_src_sha256`）；
- 五枚驱动 sha（kd_b905b / kd_d7 / kd_b1002 / kd_b1102 / kd_f102）；
- 五枚探针源 sha（c1/c3/c5/c6/m1）；
- `carrier_bad.sh` / `carrier_jobs2.sh` 与 `tools/a4/` 的 git 可追踪副本逐字节相同。

---

## §8 不一致清单

**结论：判词**类别**无不一致**（A9b 2 PASS + 1 INCONCLUSIVE_DEP、cdomain 2 INCONCLUSIVE_DEP、语义 V0–V9/V3F 的 PASS/未取得分类，均能被盘上原始件支持）；**但发现 5 条"引用原始件与判词不同源/已被覆盖"的引用缺陷 + 1 条决定性文件缺失 + 1 条引文非逐字**，逐条如下（每条绑证据）。

### C-1（引用件被后续轮覆盖，现内容**与判词相反**）§6.1x 腿 p 的 `run_att1/` 不再是该判词的原始件

- 账本 §6.1x:578 写"原始件 `.rebuild/a9b/legs/<腿>/{PASS,INCONCLUSIVE_DEP}` 与 `run_att1/`"，§6.1x:586 写三腿共同 `guard_rc=0`、`outcome=held`。
- **现盘上** `.rebuild/a9b/legs/p/run_att1/guard_p.report.txt:355-359`：
  ```
  status=ABORT
  rc=143
  abort_reason=guard_signal_15
  ```
  且 `.rebuild/a9b/legs/p/run_att1/window_p.txt:1`：`a9_window_watch label=p outcome=busy reason=foreign compile in flight: 51538 …`
- **同名件的身份也变了**：`.rebuild/a9b_run1.log:15` 记 `probe_sha256=fece0802b6227debb65bd75be67d3a7c78f45a018577387fd0728ba9694a5434`，而盘上 `.rebuild/a9b/legs/p/run_att1/a9_probe_compiler.sh` 实测 sha256 = `7481daa6df8ca4cff176437ca745580b656ee0fc2dd5107a4dbdc12d1ff71632`（不同）。
- 判词本体**没丢**：同一判词的活原始件是 `.rebuild/a9b/legs/p/leg_archive/p_rc0_pg34594_1789294000/guard_p.report.txt:356` = `rc=0` + `:355` = `status=completed`，与日志 `:19` 的 `pgid=34594` 对齐；n / n0 的 `run_att1/` 未被覆盖（与各自 archive 逐字节相同）。
- **判读**：账本对腿 p 的**判词正确、路径引用失效**；引用应改为 `leg_archive/p_rc0_pg34594_1789294000/`。
- **未验证**：该覆盖发生在何时、由哪一轮（推测为 10:24:42Z 的 `p_rc143_pg51506_1789295082` 归档轮，依据是同名的 archive 与 `run_att1` 的 monitor_pid=51506）——本席未追其触发方，不作结论。

### C-2（引用件被后续轮覆盖，驱动身份不符）§6.1u 的 `.rebuild/patchwork/b905b_probe/{c1,c3}.{err.txt,report.txt}` 现为 kd_d7 的证据

- 账本 §6.1u:481 写"判词（原始件 `.rebuild/patchwork/b905b_walls.log` + `.rebuild/patchwork/b905b_probe/{c1,c3}.{err.txt,report.txt}`）"，且 §6.1u:478 记该轮驱动 = `kd_b905b`（sha `4d1a60aab8d5efc7…`）。
- **现盘上** `.rebuild/patchwork/b905b_probe/c1.report.txt:91`：`command_sha256=a266b12f2fc527c0e84863f217e29da041d4b2c6ade52272438ba30b576b90c4`，`:90` = `command_path=/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/kd_d7`；`c3.report.txt` 同。两文件的 mtime = 2026-09-13 14:06Z（kd_d7 那轮），而 kd_b905b 轮是 09:25Z。
- 判词本体**没丢**：`.rebuild/patchwork/b905b_walls.log:1` = `PROBE_WINDOW 2026-09-13T09:25:05Z attempt=1 drv=/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/kd_b905b sha=4d1a60aab8d5efc7`，其 `:8` / `:15` 两条墙字符串逐字支撑 §6.1u:485-486。
- **判读**：`b905b_probe/` 是固定输出目录（每轮覆盖）；以它做"kd_b905b 轮"的引用会误导（现内容属 kd_d7 轮）。B905b 轮的可靠原始件 = `b905b_walls.log`。

### C-3（引用路径指错轮次）§6.1w 的 `.rebuild/cdomain/legs/corpus0/run_att1/` 是**被看门狗杀掉**的那一轮

- 账本 §6.1w:555 写"原始件 `.rebuild/cdomain_run1.log`、腿目录 `.rebuild/cdomain/legs/corpus0/run_att1/`"。
- 现盘上：`run_att1/inner/cd_g00.greport.txt` = **0 字节**（`.rebuild/cdomain_run2.log:27-29` 对应 `corpus=0 rc=143 watchdog_rc=3 … 看门狗: 外来编译, 已按组杀`，`run_att1/window.txt:1` = `outcome=busy`）。
- 真正承载 DEP 判词的是 **`run_att2/`**：`.rebuild/cdomain/legs/corpus0/run_att2/leg.log:1` = `cd_c2_reject reason=missing_phase_readings tag=g00 peak=177127424 … phase_rows=0 rc=0`，`run_att2/window.txt:1` = `outcome=held`，与 `.rebuild/cdomain_run2.log:33-38` 同轮（`09:59:42Z` 被杀 = att1，`10:01:48Z` = att2）。

### C-4（判词数值与被审标记不同源）§6.1w 引的是 `cdomain_run1.log`（peak 178,290,688），落盘标记来自未引用的 `cdomain_run2.log`（peak 177,127,424 / 176,635,904）

- 账本 §6.1w:559-562 逐字块 peak = `178290688`，可在 `.rebuild/cdomain_run1.log:72` 逐字命中（引用无误）。
- 但 `.rebuild/cdomain/legs/corpus0/INCONCLUSIVE_DEP:4` = `inner_guard_reports=1 inner_peak_bytes=177127424 inner_rcs=0,`、corpus1 同名件 = `176635904` —— 这两个数是 §6.1z:627 审计与 §6.1y 引用的对象，来自 **`.rebuild/cdomain_run2.log`**（`:35` / `:41`），该文件在 §6.1u/w/x/bb/y 五节里**从未被引用**。
- **判读**：判词类别一致（都是 `missing_phase_readings` → INCONCLUSIVE_DEP），数值差是两轮（17:54 与 18:01）所致；但"§6.1w 的判词"与"§6.1w 落盘的标记"不同源，引用链缺一环。

### C-5（决定性文件缺失，行数不可复算）cdomain 内层 guard 记 `phase_trace_size=1768` 与判词 `phase_rows=0`

- `.rebuild/cdomain/legs/corpus0/run_att2/inner/cd_g00.greport.txt:74` = `phase_trace_size=1768`，`:66-67` = `phase_trace_path=/Users/lbcheng/cheng-lang/src/rsi_work/cd_g00.phase.tsv` / `phase_trace_sha256=08f49cdcab020c59ba75c788a093b0dd59e8167baeb505774d02a6233923aa04`（corpus1 同值 1768）。
- 判决写 `phase_rows=0`（`run_att2/leg.log:1`、标记 `:5`）。
- **不是矛盾，但不可复算**：CLI 的计数规则是"逐相行 = trace 里含 `phase=` 的行"（`src/rsi/compiler_domain.cheng:100-108`），而 guard 的 trace 是"子进程 stderr 每非空行一行"（`tools/beat_c_process_group_guard_runtime.py:5194-5200`；本席曾误写为 `beat_c_group_guard_runtime.py`，以实测路径为准）⇒ trace 非空但 `phase=` 行数为 0 是可能的（该轮子编译器 stderr 全是 `system_link_plan_stage=…`）。
- **缺件**：`src/rsi_work/cd_g00.phase.tsv` **现不在盘上**（`ls` 报 No such file），故 0 行这个数**无法用原始件复算**。⇒ 标 **未验证**。

### C-6（引文非逐字）§6.1bb:696 的 `STEP=v3f verdict=PASS`

- 账本把它写成一个代码块行（同时把 marker 的两个字段并进同一行）。盘上并没有这一行：`.rebuild/semantic/v3f/PASS:1` = `step=v3f verdict=PASS`（小写 `step=`），日志 `.rebuild/semantic_run35.log:18` = `v3f PASS (无缓存全量复现基线)`。
- **判读**：语义无误、逐字不成立；引用时应拆为 `semantic/v3f/PASS:1` + `:2`（`cache_hits=0`）。

### C-7（原始件在审计期间被另一条线搬走）§6.1y 的 `.rebuild/semantic/{v0,v1,v3f}/` 自 2026-09-13T20:05Z 起不再原位

- 本席第一遍跑 `audit_claims.py` 得 `31/31 OK`（此时 3 个标记仍在原位，见 §7 第一遍输出）。
- **同一命令、同一脚本、未改一字节**，1 分半后第二遍得 `26/31 OK`，5 条 FAIL 恰为 `v0.tool_sha256` / `v0.tool_src_sha256` / `v1.checks_pass=7` / `v3f.cache_hits=0` / `v3f.carrier_sha256`（§7 第二遍输出）。
- 盘上证据：`.rebuild/semantic/v0/` 现只剩 `leg.log` + `window.txt`；`.rebuild/semantic/v1/` 已空；`.rebuild/semantic/superseded/` 于 04:05 +0800 新增 `v0.20260914T_toolfix/`、`v1.20260914T_toolfix/`、`v3f.20260914T_toolfix/`（`superseded/` 目录 mtime = Sep 14 04:05）。
- 内容**逐字节不变**：`.rebuild/semantic/superseded/v0.20260914T_toolfix/PASS` sha256 = `78f83be07f205e94cefc66635f47d5bae40fcdbbe97ad995be2ab2a4ddd3d83a`，与本席 20:0xZ 实测的原位 `v0/PASS` sha **完全相同**；三个归档件全部保留原 mtime（16:59 / 20:22）。
- **判读**：判词没有变、也没有被推翻；变的是**引用路径**。凡引用 `.rebuild/semantic/v{0,1,3f}/` 的判词（§6.1y:596/597/608 与 §6.1bb:690），在本席取证时刻之后必须改引 `superseded/*.20260914T_toolfix/`，否则 `audit_claims.py` 会持续报 26/31 的**假失败**。
- **未验证**：该搬迁的触发方与是否会在本席交出本件后继续搬迁其余步骤（v2/v2b/v3/v4/v4a/v7/v8 至 20:06Z 仍在原位）；本席不追因、不预测。

### 边界（本次五节之外，顺带发现，仅登记不判）

- §6.1cc:681 记"判词落 `.rebuild/patchwork/postfix_watch.log`"——该文件**不存在**（`.rebuild/patchwork/` 下只有 0 字节的 `postfix_watch.out`）。§6.1cc 不在本次归并范围内，故不计入上表。

---

## §9 附：本席独立复算的对盘指纹（只读 `shasum -a 256`，2026-09-13T20:0x Z）

| 对象 | 盘上实测 | 被哪条判词引用 | 是否一致 |
|---|---|---|---|
| `.rebuild/rsi_cli/rsi_cli` | `6410dae9cddef4b3b153e7977daf995b096c2d7e864ed9c3ecd6bfda6676d61c` | p/n/n0 标记 `cli_sha256`、cdomain 两档标记 `cli_sha256` | 一致 |
| `.rebuild/rsi_cli/rsi_cli.identity` | `3a41fc28aaa96fc66823b005f02ece96b90834813d595252e7ddd92fd1d42188` | `.rebuild/a9b_run1.log:7` `cli_reuse identity=3a41fc28aaa96fc6` | 一致 |
| `artifacts/bootstrap/cheng.stage3` | `05af823e7db0c8ea1a69cbd01eda84fcd4b8ff8049d38178663fd357d840f276` | §6.1u:478、§6.1v:544、A9b/cdomain 标记 `compiler_sha256` | 一致 |
| `src/rsi/compiler.cheng` | `bd15bdddb61cd1ff29f6b77ece68fd7b488051a920ddaa255b86def7a80af01f` | n/n0 标记 `rsi_src_sha256` | 一致 |
| `.rebuild/semantic/rsi_semantic` | `e742917823a9e3034a925cf379b33a68c5a9e8e34079eedebf4f772a6b231d36` | `v0/PASS:2` | 一致 |
| `src/tools/rsi_semantic_regression.cheng` | `e252520f52d8bb69b1017794df4ff5468339b0f7380f97b0fd3fe92f9005cc7b` | `v0/PASS:3` | 一致 |
| `.rebuild/semantic/semantic_baseline.txt` 与 `receipts/semantic_baseline_05af823e.txt` | 同为 `7995091fa119bb54d66dbda82aa0b4b9c772691a78889ca477967b07e54ac033` | `v2/PASS:2`、`v2b/PASS:2` | 一致（副本逐字节相同） |
| `.rebuild/patchwork/carrier_bad.sh` 与 `tools/a4/carrier_bad.sh` | 同为 `f8a83a3bb140b15acebe1528ff2b8b096aaac04b98079ddefccdc731000b35b7` | `v4a/PASS:2` | 一致 |
| `.rebuild/patchwork/carrier_jobs2.sh` 与 `tools/a4/carrier_jobs2.sh` | 同为 `9a61acebcda3924fedee55b9d6379a527f7394231db6ec13513dbe1d039fc9e8` | `v4/DONE_NOT_A_MISCOMPILER:2` | 一致 |
| `.rebuild/s1b_step3/r9/kd_b905b` | `4d1a60aab8d5efc7c750e8e8f912797cf47272ef4bb7a91e842fac2f7d02cfb3`（mtime 2026-09-13 16:42） | §6.1u:478 `sha 4d1a60aab8d5efc7…` | 一致 |
| `.rebuild/s1b_step3/r9/kd_d7` | `a266b12f2fc527c0e84863f217e29da041d4b2c6ade52272438ba30b576b90c4` | §6.1u:518 `a266b12f…` | 一致 |
| `.rebuild/s1b_step3/r9/kd_b1002` | `0fbca3919bf8224b83e9b74d6f29b10292a022a72baa0b181e4cf961f283f447` | §6.1u:527 `0fbca3919bf8224b…` | 一致 |
| `.rebuild/s1b_step3/r9/kd_b1102` | `fab7107264972410da46063d9f626c60eccfdb96e5c4451357f8fd121c3bf324` | §6.1u:527 `fab71072…` | 一致 |
| `.rebuild/f1_line/out/kd_f102` | `4dfd9d61097677554a67ed653e04ccebb132dbc9edb16dba4a2d0216764782a7` | §6.1u:491 `4dfd9d61…` | 一致 |
| `src/a9_wall_probe/c1.cheng` | `f8bd6e8cd2cec634c6d7b3a94e6952bad353019af586d148282eff8c7137fc86` | `b905b_walls.log:2` `sha=f8bd6e8cd2cec634` | 一致 |
| `src/a9_wall_probe/c3.cheng` | `8fc16a8101e001d1ef0bf3caefff9e5aa2c205aa6056986c801f54e47e82ffb0` | `b905b_walls.log:9` `sha=8fc16a8101e001d1` | 一致 |
| `src/a9_wall_probe/c5.cheng` | `0a24b03c80bcb892bd319e604ea78079644fa094e69d9671fd168d8ba1a201d0` | `c5c6_probe.log:2` `sha=0a24b03c80bcb892` | 一致 |
| `src/a9_wall_probe/c6.cheng` | `c56def1754c21282af023f4c14c0115140da787ff2aa88cedfd7263df09471e0` | `c5c6_probe.log:9` `sha=c56def1754c21282` | 一致 |
| `src/a9_wall_probe/m1.cheng` | `8df7ed8f635bff14f79c068c14d299743e7e47741d94bd5e6c06b0fb23464ecf` | `m1_retry.log:6` `sha=8df7ed8f635bff14` | 一致 |

**取证时刻之后被搬走的 3 个语义标记（归档副本指纹，只读 `shasum -a 256`，2026-09-13T20:06Z）**

| 归档路径 | sha256 | 对应原位路径（判词取值处） |
|---|---|---|
| `.rebuild/semantic/superseded/v0.20260914T_toolfix/PASS` | `78f83be07f205e94cefc66635f47d5bae40fcdbbe97ad995be2ab2a4ddd3d83a` | `.rebuild/semantic/v0/PASS` |
| `.rebuild/semantic/superseded/v1.20260914T_toolfix/PASS` | `3e38ad7d6d5d11b18bafc7e4dee04326645f56fb2e9b6031ffac55fc116ad8b6` | `.rebuild/semantic/v1/PASS` |
| `.rebuild/semantic/superseded/v3f.20260914T_toolfix/PASS` | `b26e51e3fa42b2839ff4027ba18fe5bb0e92c8485590732995872146e3a5486e` | `.rebuild/semantic/v3f/PASS` |
| `.rebuild/semantic/superseded/v3f.20260914T_toolfix/guard.out.txt` | `cddf308829d30470705865649d8d666e587216f006b056cdc2ed6bdcd8a868b0` | `.rebuild/semantic/v3f/guard.out.txt` |

**审查脚本本体指纹**：`docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/audit_claims.py` 为只读脚本（源码 §7 前已列出，无写操作、无编译调用）；本席未修改它一个字节。

---

## §10 未验证 / 未复算项（不得当结论用）

1. §6.1u:479 的"驱动来源核验"命令 `diff -rq src/core .rebuild/b_line/b2_root/src/core`：**本机不可执行**（`diff` 为 BSD 版，报 `illegal option -- r`；`/Applications/DevEco-Studio…/diff` 同样不支持 `-r`）。本席改用逐文件 sha256 比对做数据点：现势 `src/core` 448 件 vs `b2_root/src/core` 447 件，**26 条路径不同**（其中 138 件 mtime > 2026-09-01 ⇒ b2_root 是在飞烤根，已前进）。**该历史声明（kd_b905b 轮 0 差异）不可复算**，标"未验证"。
2. §6.1y V6 的"盘上无 31/31 私账本"：本席只做粗查（`grep -rl '31/31' artifacts/` 仅命中 5 个二进制媒体件，无文本账本），**未做穷尽核验** ⇒ 标"未验证"。
3. §6.1y V5 的"闭包不再 known-red"：只在 `v2/guard.out.txt:42` 见到 `compile_rc=0`；"设计件原期望 `compile_rc=2`"属设计件侧，本次未读设计件 ⇒ 未验证。
4. 各 `leg_archive/` 下更早轮次（rc=3/rc=143）与本次五节判词无关，本席未逐条判读。
5. 本件的"活原始件"引用是**时刻量**：所有 `.rebuild/semantic/**`、`.rebuild/a9b/**`、`.rebuild/cdomain/**` 路径的取证时刻 = 2026-09-13T20:04Z 前后；此后发生的搬迁（已知 3 处，见 §8 C-7）不在本件内自动跟随。
6. 所有跨轮"逐字相同"的说法（§6.1u:523"连续七枚驱动"、:527"连续五枚"）本次只核到 §6.1u 明文引用的 4 枚驱动 + kd_b905b（共 5 枚）的原始件，余者未在盘上逐一取证 ⇒ 标"未验证"。
