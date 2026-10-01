# 事后通路第 97/98 轮六处改动回归复核（只读）

只读声明：未编译、未取/未删 `.rebuild/COMPILE_SLOT.lock`、未改任何既有文件、未建分支/worktree。`bash -n` 只解析不执行；唯一写入=本回执。
对象 sha256[:16]：semantic `2f9dbdac650fa294`｜cdomain `3ce8cb6eec816e58`｜a9b `f02b063307dedfe5`｜wall_probe `84385c853b1505ad`｜unlock_decisive `c788d1f5e1e95b21`｜post_wall_verify `54ffa4fb327996a8`｜mirror_evidence `a21e206bdbfcee93`｜a7_bake_carrier `b27119a3bf873328`｜a7s6_run `86785cc99d961fcf`。

**结论**：1/2/3/4 逐条核对无回归。5 有两处非阻断隐患（镜像只增不清会留旧判词；`a7_bake/` 裸 cp 无 mkdir）。6：1 个整目录空（`a7s6/`）+149 个空子目录，第 98 轮三个新镜像标签目录至今一个都没出现（那段路径从未跑通）。

## 1. trap 顺序（四件全对）
| 件 | mine() | mkdir+owner.txt | export | trap | 排空循环 |
|---|---|---|---|---|---|
| semantic_wait_and_run.sh | :54 | :58-63 | :64 | **:67** | :78-84 |
| cdomain_wait_and_run.sh | :46 | :50-53 | :54 | **:57** | :59-63 |
| a9b_wait_and_run.sh | :52 | :56-59 | :60 | **:63** | :65-69 |
| wall_probe.sh | :25 | :31(python 写) | :32 | **:35** | :39-44 |

四处逐字相同：`trap 'mine && rm -rf "$LOCK"' EXIT INT TERM`。trap 均在 `mine()` 定义之后、`mkdir` 成功且 owner.txt 写好之后、进入排空 `while` 之前；四处都在 `acquire_slot()` 函数体内，无错函数/错作用域（wall_probe.sh:29-46 的 acquire 段正确）。
- 已实测：bash 函数内装的 EXIT trap 在函数返回后仍生效（`f(){trap ... EXIT;}; f; echo` → 退出时触发），语义成立。
- 注释瑕疵（不改代码）：四处注释写「被 SIGKILL 则锁无 trap 释放」——SIGKILL 不可捕；该改动实际只兜 INT/TERM。且 mkdir→printf 之间（如 semantic:58-63）仍无 trap，这段窄窗仍会留无主锁，trap 前置未覆盖它。

## 2. rc 4→5（改对；无一处把 5 当 FAIL）
- a9b:112 `verdict=5`；:119 `TOTAL_TIMEOUT ... verdict=5`；:120 `ATTEMPTS_EXHAUSTED ... verdict=5`；DEP 仍 :128 `verdict=4`。新增 :191 `elif [ "$LEG_RC" = 5 ]; then`（空洞轮次，可重跑）排在 :198 FAIL 之前。
- cdomain:112 `verdict=5`；:115/:116 置 5；:123 DEP 置 4。
- 全仓执行这两脚本的调用方只有 3 处：
  1. `unlock_decisive.sh:42/:48` `${PIPESTATUS[0]}` → :54-57 `worst` 显式映射 5→5、4→4，未落 FAIL。✓
  2. `post_wall_verify.sh:88/:93` 取值、:95 打印、:98 `exit 0` 恒 0 —— 5/4/1 都不外传，但它也没有「rc!=0 当 FAIL」的分支，故不误判；代价是 rc 不承载判词（第 98 轮只修了 unlock_decisive，此处未同步，非回归）。
  3. `wall_then_semantic.sh:29-30` 只 `echo "a9b_rc=$?"`，不分支。✓
- `audit_claims.py:72/:84` 读的是 marker 文件内容（INCONCLUSIVE_DEP/PASS），不读 rc，不受影响。
- 残留（非本次引入）：a9b:198 `verdict="$LEG_RC"` 仍可能把 leg 级 rc=4 当 DEP=4；实测 probe 腿 rc 集为 0/1/2/3/124/137，不产 4。cdomain:203-204 对非 DEP/非 WRC3 的腿 rc 只打印重试、不落 marker，最终归入 5 ⇒ 真腿 FAIL 会被 5 吞（旧缺陷，未被本次 4→5 引入）。

## 3. worst()（语法/时机/空值全对）
```bash
54  worst() { case "$1" in 0) echo 0;; 4) echo 4;; 5) echo 5;; *) echo 1;; esac; }
55  A=$(worst "$A9B_RC"); B=$(worst "$CD_RC")
56  if [ "$A" = 1 ] || [ "$B" = 1 ]; then exit 1; fi
57  if [ "$A" = 5 ] || [ "$B" = 5 ]; then exit 5; fi
58  if [ "$A" = 4 ] || [ "$B" = 4 ]; then exit 4; fi
```
- `bash -n unlock_decisive.sh` PASS。worst 于 :55 调用，晚于 :42/:48 的 `PIPESTATUS` 赋值，取值时机正确。
- `[ "$A" = 1 ]` 引号包裹，空值不报错也不命中；`worst` 的 `*)` 兜底恒输出 0/1/4/5，A/B 永不为空 ⇒ 无「空值直落 exit 0」的口子（最坏 exit 1，fail-closed）。
- 优先级 1>5>4>0，即「5 超时压过 4 DEP」；与 :52-53 注释一致。

## 4. post_wall_verify 顶部 SLOT_MODE
`15  SLOT_MODE="${SLOT_MODE:-acquire}"; export SLOT_MODE`。全文件仅此一处 SLOT_MODE，无冲突。
- 墙探针确实走 acquire：:41 调 `wall_probe.sh` 未覆写 SLOT_MODE ⇒ 继承 acquire ⇒ `wall_probe.sh:52-58` 进协作取锁。a9b/cdomain 同继承（:87/:92）。
- 不影响内层既定行为：腿件 `a9_run_slot_probe.sh:179/:230` 的 PRE 复检不会自锁死 —— `a7_preconditions.sh:43` `SELF_OWNER_PID="${CHENG_SLOT_OWNER_PID:-$$}"`、:71 把 owner==声明者判 `self` ⇒ a9b 取锁后探针报 FREE（旧 A1「自锁 BUSY」已由此声明制闭合）。
- 唯一口径落差：`:-acquire` 会保留调用方已导出（或先被 `SLOT_MODE=wait` 污染）的值，与「本件也要参与协作锁」不完全等价；要强制须写死。

## 5. 三处新镜像 + bake log
- `mirror_evidence.sh:7-8` `DST=.../receipts/evidence/$2` + `mkdir -p "$DST"` ⇒ 三目标目录都自动创建。✓
- 调用：`post_wall_verify.sh:96` `"$ARCH" post_wall_latest`；`a7_bake_carrier.sh:139` `"$ROOT/kd_a7" a7_carrier_latest`（文件源，:12 `cp -p "$1" "$DST"/`）；`a7s6_run.sh:108` `"$OUT" a7s6_latest`（写在 :109-113 判词 exit 之前，三态都镜像）。✓
- 覆盖：标签与既有目录不同名（`a7s6_latest` ≠ `a7s6/`；`a7_carrier_latest/post_wall_latest/decisive_latest` 现均不存在），无同名互踩。✓
- 隐患1：镜像是 `cp -Rp "$1"/. "$DST"/`（:10），**只增不删**。例：`a9b_legs_latest/p/INCONCLUSIVE_DEP` 已在；将来重跑出 `p/PASS` 时，`.rebuild` 侧由 post_wall_verify:73 `mv` 归档旧 marker，但 docs 侧不清 ⇒ 新旧判词同目录共存。所有 `*_latest` 同理。
- 隐患2：`a7_bake_carrier.sh:140` 直写 `receipts/evidence/a7_bake/bake_latest_compiler.log` 是裸 `cp`（无 mkdir、`|| true` 吞错），目录现存在但无人保证；mirror 只保证 `a7_carrier_latest`。
- 另：S6 产物有两条互不相干落点 —— `a7s6_run.sh:108`→`a7s6_latest/`、`chain_bake_s6.sh:29`→`a7s6/`，同内容会分叉。

## 6. receipts/evidence/** 现势（文件数 / 空子目录）
| 目录 | files | empty dirs |
|---|---|---|
| a7_bake | 4 | 0 |
| a7s6 | 0 | 1（整目录空） |
| a9b_legs_latest | 62 | 50 |
| a9b_pre_cli_rebuild | 72 | 98 |
| cdomain_latest | 24 | 0 |
| cdomain_pre_pa | 13 | 0 |
| wall_b18probe | 1 | 0 |
| wall_probe_latest | 2 | 0 |

合计 **149 个空子目录**。`.rebuild` 下 `a9b/cdomain/a7s6/a7_root/reverify/semantic` 现全部 ABSENT ⇒ docs 侧是唯一副本。
- 整目录空：`a7s6/`（chain_bake_s6.sh:10 `mkdir -p` 建的空壳；S6 从未产出，`.rebuild/a7s6` 已不存在）。
- 半截镜像：`a9b_legs_latest` 50 空 = 48 个 `run_att1..16`（每腿 16）+2 个 `leg_archive/*`，仅 `run_att17` 与 `*_rc0_*` 有件；`a9b_pre_cli_rebuild` 98 空 = 48 `run_att`+48 `store/*`（另 2 个 leg_archive）。源树当时就是空的，但无删减的镜像把残留固化成「证据」。
- 未出现：`a7_carrier_latest`、`a7s6_latest`、`post_wall_latest`、`decisive_latest` 四标签目录均不存在；`a7_bake/` 只有 run4/run7 的 wrapper/compiler 日志，无 `bake_latest_compiler.log` ⇒ 第 98 轮三处新镜像路径尚未真正执行过一次。
