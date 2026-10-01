# RSI 语义回归 oracle（车道 L4）设计 + 待槽位验证清单

> **未编译、未运行，任何通过判词均未取得。** 本文与 `src/tools/rsi_semantic_regression.cheng` 同轮产出：
> 该文件本轮**未经任何编译器编译、未经任何一次执行**；本文所有"期望判词"都是**待验证项**，不是读数，
> 任何数字都必须等到编译槽位窗口内实跑后才可回填。未得读数处一律写「未钉」，不填估计值。
>
> 口径来源（只读引用，本轮不改）：`docs/cheng-rsi-fusion-plan.md` §二/§四（车道 L4 = 71 行；唯一语义锚 = 81 行）、
> `docs/campaigns/2026-09-07-pure-cheng-rsi/compiler_domain_c1c2_contract.md` §正确性锚（9-11 行）、
> `docs/cheng-plan.md` §6.3 B4（698 行硬门 / 1001 行口径表）。

## 一、定位与判据形态

**输入**：编译器可执行体路径（+ 其 sha256，rv 内实测取得）+ 冻结基线文件路径。
**输出**：逐条 `(rc, stdout sha256)` 指纹 + 与金标对拍 + 与基线逐条对拍 + 总判词（非零退出即 FAIL）。

| 腿 | 语料 | 逐条判据 | 条数 |
|---|---|---|---|
| A | RSI 任务域三域 31 格（`types.RsiTaskCellValid` 白名单全空间） | 指纹对拍 + 金标对拍（`generator.RsiGeneratorGoldenAnswer` 独立重算）+ 域分重算 | 21 (d0) + 5 (d1) + 5 (d3) = 31 |
| B1 | 内核 B4 四夹具（ordinary / call_fixture / cold_nested / v6） | 指纹对拍（源 sha 同步入基线，夹具字节漂移即 drift） | 4 |
| B2 | 内核 B4 2 源对（msp2） | 同上 | 1 |
| B3 | 内核 B4 8 源闭包（multisource） | 同上（该条现势为 known-red：编译失败，见 §九-V5） | 1 |
| C | 编译器域 C1/C2 语料档 0（`src/tests/rsi_minimal_smoke.cheng`） | 同上 | 1 |
| D | incumbent 腿 | 账本在位聚合分 ≤ 本门实测重算 `best_correct` | 1 |

合计 **38 条指纹 + 1 条 incumbent 腿 + 7 项门级检查**（compiler_present / compiler_sha256 /
baseline_present|baseline_mode / task_space_enumerated / task_space_correct / task_best_correct /
workdir_clean；record 轮另有 baseline_write）。

**总判词**（`semanticMain` 尾部，唯一出口）：
- 全绿 ⇒ `rsi_semantic: PASS SEMANTIC_EQUIVALENT`（rc=0）；
- 任一失败 ⇒ `rsi_semantic: FAIL SEMANTIC_DIVERGENT_OR_INCOMPLETE`（rc=1，逐条 FAIL 行点名条目与字段）；
- 用法/参数错误 ⇒ rc=2。

## 二、唯一语义锚（不另立第二个）

**锚 = 产物真实运行的 `(rc, stdout sha256)`，锚串 `fp = "<rc>:<stdout-sha256>"`。**

- 算式**逐字同构**于 C1/C2 账本既有实现 `src/rsi/compiler_domain.cheng:284-288`
  （`runSha = strings.Sha256(stdout)`；`fp = IntToStr(rc) + ":" + runSha`；账本字段 `product_sha`，
  账本字段名 `product_sha`，实读形态见 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/cdomain_current.txt:6`：
  `product_sha 0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`）。
- 否定链（实测，`compiler_domain_c1c2_contract.md:9-11`）：Mach-O 产物含每进程随机 uuid ⇒ 产物字节 sha 不可用；
  链接 map 受 jobs 布局影响 ⇒ map sha 仅记账不作锚。
- **与 B4 的合并口径**：`docs/cheng-plan.md:698/1001` 现口径为「S1a 驱动 vs S1b 驱动**产物 sha256 全等**」。
  本条把该门的**比较对象**换成同一判据下的 `fp`（产物真实运行 rc + stdout sha）与源 sha：
  - 有产物的条目（四夹具 + 2 源对 + 31 格 + 档 0）：判 `fp` 与 `src_sha` 双字段全等；
  - 无产物的 known-red 条目（8 源闭包，实测 `compile_rc=2` + 既有 receipt 判词）：判 `compile_rc` 全等（见 §八 的 API 缺口）。
  **B4 原有「产物名需一致（exe 内嵌自身路径）」的顾虑随锚切换自动消失**（stdout 不含自身路径）；
  「map sha 仅记账」不变。
- **本文件的边界（不冒充）**：`docs/cheng-plan.md` 是权威件，本轮**不改**；上述合并的落库（改 §6.3 B4 行）
  属后续接线任务，本文只把可机械判定的形态钉死。

## 三、语料字节来源（逐条可指）

| 条目 | 字节来源（原始件） |
|---|---|
| 31 格 | `generator.RsiGeneratorTaskProgram(d,s,p)` 生成期产物（`src/rsi/generator.cheng:831-887`）；金标 `RsiGeneratorGoldenAnswer`（`:100-131`） |
| fixture_ordinary | `docs/campaigns/2026-08-31-kernel-userpath/fixtures/ordinary_zero_exit_fixture.cheng`（`tools/user_path_gate.sh:183-200` 为权威映射；基线行 `user_path_baseline.tsv`：compile=0 / run=0） |
| fixture_call_fixture | 同上目录 `call_fixture.cheng`（基线 compile=0 / run=1） |
| fixture_cold_nested | 同上目录 `cold_nested_fmt_interpolation_smoke.cheng`（基线 compile=0 / run=0） |
| fixture_v6 | 同上目录 `v6_direct1_repro.cheng`（基线 compile=0 / run=0） |
| pair2_ms | `docs/campaigns/2026-08-31-kernel-userpath/design/s1b_impl_progress.md:459-491` §10.1 内联 printf 引文（2 源） |
| closure8_multisource | 同文件 `:493-520` §10.1 内联 printf 引文（1 源，闭包 8 源） |
| corpus0_minimal_smoke | `types.RsiCompilerCorpusRel(0)` = `src/tests/rsi_minimal_smoke.cheng`（`src/rsi/types.cheng:101-109`） |

**路径纪律**：四夹具与 31 格落 `<root>/src/rsi_sem_work/sem_*`（平铺直接子文件）；
pair2/closure8 两条源的 import 路径在 **字节里写死** `import cheng/tests/ug_s1a_ms_lib`，故只能落
`<root>/src/tests/ug_s1a_ms_lib.cheng`、`ug_s1a_ms_main.cheng`、`ug_s1a_multisource.cheng`
（与 B4 原始脚本同路径，`s1b_impl_progress.md:463-468`）——该三路径属共享命名空间，**已存在即硬拒**
（`shared_stage_path_occupied`，不覆盖、不删他线文件）。

## 四、逐条判词表（缺项一律硬失败，不静默不折算）

| check 名 | PASS 条件 | FAIL 判词 / 触发 |
|---|---|---|
| `compiler_present` | 编译器体路径在位 | `missing path=…` |
| `compiler_sha256` | `/usr/bin/shasum -a 256` argv 直发得 64 hex | `unavailable` |
| `baseline_mode`（record） | 记录模式 | — |
| `baseline_present` / `baseline_schema`（judge） | 基线在位、含 schema 头、含 64 hex `compiler_sha` | `missing_or_empty` / `schema_header_absent` / `compiler_sha_line_absent` |
| `task_space_enumerated` | 枚举格数 == `types` 三域 `RsiTaskDomainCellCount` 之和（现势 31） | `enumerated=N/M`（白名单与枚举漂移） |
| `task_space_correct` | 每格金标命中 ⇒ `correct==31/31`（EXHAUSTED 门） | `correct=N/31 (EXHAUSTED 不成立)` |
| `task_best_correct` | 三域各有 correct 观测，聚合 = Σ 域内最小 correct 分 | `domain_min_missing` |
| 每格 `cell_d*_s*_p*` | 指纹对拍 pass ∧ `golden=match` | `verdict=differ|missing|drift` 或 `golden=mismatch|output_format_invalid|not_run` |
| 每条语料 `fixture_*|pair2_ms|closure8_multisource|corpus0_minimal_smoke` | 指纹对拍 pass | 同上；夹具缺件为 `fixture_master_missing|fixture_master_empty`；目标路径被占为 `shared_stage_path_occupied` |
| `ledger_incumbent` | 账本可读 ∧ `incumbent <= best_correct`（`src/apps/rsi/main.cheng:198` 同判据） | `ledger_unreadable` / `incumbent>oracle_best_correct` |
| `baseline_write`（record） | 且仅当本门零失败时原子落盘（.tmp → 回读逐字节相等 → rename） | `record_refused fail_count>0` / `write_or_readback_failed` |
| `workdir_clean` / `workdir_leftover` | `sem_` 前缀临时件残留 = 0 ∧ 三条共享路径已回收 | 逐件点名 `residual=<名>` |

**记录模式（`--record`）的 fail-closed 语义**：金标不符/空间不满/任一条失败 ⇒ **拒绝写基线**（基线不得含坏读数）。
judge 模式下 `missing`（基线缺条）与 `drift`（源 sha 漂移）都判 FAIL —— 缺判据不折算通过。

## 五、已复用 API 清单（动手前逐个 grep 确认，含 @borrows 形状）

| API | 定义点 | 形状 / 说明 |
|---|---|---|
| `execution.RsiRunCapture` | `src/rsi/execution.cheng:10-16` | 无 `@borrows`；`(exePath, args, envOverrides, workingDir, timeoutSec, outOutput: var str, outExitCode: var int32)`；内层 `hostos.ExecFileCapture`（`src/std/os_host_process.cheng:727-742`，**@borrows**，`mergeStderr=true`） |
| `execution.RsiCleanWorkDir` | `src/rsi/execution.cheng:20-31` | `@borrows`；**本工具不调用**（整目录清空会删并发 lane 文件），只保留其「只删直接子文件」的平铺纪律 |
| `compiler.RsiCompileCheng` | `src/rsi/compiler.cheng:7-20` | `@borrows`；唯一编译通道 argv 直发 `system-link-exec --root: --in: --emit:exe --target:arm64-apple-darwin --out:`，返回 rc，**不返回编译器输出**（见 §八 缺口） |
| `generator.RsiGeneratorTaskProgram` | `src/rsi/generator.cheng:831-887` | `(taskDomain, strategy, param) -> str`；越白名单返回空串 |
| `generator.RsiGeneratorGoldenAnswer` | `src/rsi/generator.cheng:100-131` | `(taskDomain) -> str`；金标独立重算，不消费候选输出 |
| `evaluator.RsiParseTaskOutputInto` | `src/rsi/evaluator.cheng:12-35` | `(text, outOk: var int32, outAnswer: var str, outCompares: var int64)` |
| `evaluator.RsiTaskCandidateCorrect` | `src/rsi/evaluator.cheng:39-41` | `@borrows`；`(taskDomain, answer) -> bool` |
| `types.RsiTaskCellValid` / `RsiTaskDomainCellCount` | `src/rsi/types.cheng:112-141` | 白名单与域内格数（分母**从 types 派生，不硬编码 31**） |
| `types.RsiDomain0StrategyMax` 等常量 | `src/rsi/types.cheng:44-56` | 循环上界用 `0..<(常量 + 1)` 半开形（`generator.cheng:925` 有 `0..<常量` 先例） |
| `types.RsiCompilerCorpusRel` / `RsiCompilerCorpusOpen` | `src/rsi/types.cheng:101-109` | 语料档 0 开放门；关档 ⇒ 硬失败（不静默跳过） |
| `store.RsiStoreLoadVersionInto` | `src/rsi/store.cheng:468-497` | `(storeDir, outOk, outGeneration, outAStrategy, outAParam, outMStrategy, outScore, outFactsRoot)`；只读，不写盘 |
| `strings.Sha256` | `src/std/strings.cheng:513` | `@borrows`；`str -> 64 hex`（stdout sha / 源 sha 同一原语） |
| `strings.HasPrefix` / `CloneStr` / `CloneStrRange` / `IntToStr` / `Int64ToStr` | `src/std/strings.cheng:448 / 468 / 478 / 286 / 523` | 手工扫描与切片（精确长度切片，fishing_gate 的 2GB 钳制坑规避形） |
| `strutil.Split` / `Strip` / `Contains` / `Join` / `ParseInt` | `src/std/strutils.cheng:411 / 403 / 391 / 423 / 435` | 全文只 Split 一次，行内一律字符扫描（"连续两次 Split 产物损坏" 实录：`generator.cheng:889`） |
| `os.ListDir` / `ReadFile` / `WriteFile` / `FileExists` / `MkdirAll` / `RemoveFile` / `RenameFile` / `ExtractFilename` | `src/std/os.cheng:3787 / 3866 / 3884 / 3903 / 3915 / 3935 / 3939 / 3810` | 全部为纯 Cheng std，无 `@importc` |
| `cmdline.paramCount` / `paramStr` | `src/tools/rsi_gate.cheng:556-570` 用法先例 | 位置参数 + `--flag:` 前缀切片 |

**零 `@importc`**：全文无任何 importc 注解（机械自检见 §九；卷首注释里出现的 "@importc" 是文字说明，不是注解——
代码行扫描 `^[[:space:]]*@importc` 零命中）。

## 六、资源守卫与超时语义（复用，不自造第二套）

1. **超时**：全部子进程走 `execution.RsiRunCapture` → `hostos.ExecFileCapture`，其到限语义已有实测锚：
   单调钟到限 **SIGTERM**，+500ms **SIGKILL**，`timedOut` 分支唯一判词 **rc=124**
   （机制锚 `src/tests/rsi_execution_negatives.cheng:136-138`，实测 `:155-159`）；越界读写候选进程级
   **rc=133(SIGTRAP)**（`:161-196`）。本工具不自造超时/杀进程逻辑。
2. **进程树 RSS 腿**：沿用 `tools/beat_c_process_group_guard.sh`（与 `rsi_gate` 的 `rsi_rss_guard` 腿
   **同一脚本、同一门值语义**，`src/tools/rsi_gate.cheng:266-296`）。本工具**不在进程内自造守卫**；
   由外层按下列模板包裹（与 gate 同形，只换命令面）：

   ```
   /bin/bash <root>/tools/beat_c_process_group_guard.sh \
     --rss-limit:805306368 --timeout:3600 --expected-exit-code:0 \
     --report-out:<root>/artifacts/rsi_gate/semantic.report.txt \
     --stdout:<root>/artifacts/rsi_gate/semantic.out.txt \
     --stderr:<root>/artifacts/rsi_gate/semantic.err.txt \
     --  <semanticBin> <root> <compilerPath> <baselinePath>
   ```

   （argv 直发，`--` 后为被测命令；门值 `805306368` 与 `tools/memory_model_limits.sh` 单点同源——
   后续接线任务应改为从该权威件派生，本工具不重复定义门值。）

## 七、夹具平铺与自清场

- **平铺**（批次十教训，`src/tests/rsi_execution_negatives.cheng:31-33`）：全部临时件为 `src/rsi_sem_work` 的
  **直接子文件**，名前缀统一 `sem_`；不建子目录（`RsiCleanWorkDir` 只删直接子文件，子目录会漏清）。
- **自清**：按 `sem_` 前缀整体删除（**不逐一枚举 sidecar 名**——实测产出 `.map / .primary.o.map /
  .provider*.map / .link.log`，见 `src/rsi_work/cd_cand*.bin.*` 现势），随后 `ListDir` 回查 `sem_` 残留 = 0；
  三条共享路径仅在本轮真实写入过时回收。**不信任删除返回值**，残留即 FAIL 判词。
- **不调用 `RsiCleanWorkDir`**：它与并发 lane 共享工作目录（现势 `src/rsi_work` 有他线 `cd_cand*.bin` 在飞），
  整目录清空 = 删他线夹具。

## 八、API 缺口（如实报告，不绕道）

**`compiler.RsiCompileCheng` 只返回 rc，丢弃编译器 stdout/stderr**（`src/rsi/compiler.cheng:13-20`）。
后果：编译失败的条目（现势 = 8 源闭包，known-red）只能锚 `compile_rc`，**拿不到 B4 原口径的「末行判词逐字相同」**
（`s1b_impl_progress.md:501`）。本轮不绕道（不复制编译 argv、不用 shell 重定向、不改既有文件），
把它作为**已登记的缺口**交接：

- 可接受解 A（推荐）：在 `src/rsi/compiler.cheng` 增一个**同 argv**的捕获入口
  （如 `RsiCompileChengCaptureInto(..., outOutput: var str)`），本工具改调它 ⇒ 编译失败条目升级为
  `(compile_rc, 末行判词 sha)` 双字段锚。**属既有文件改动，本轮未授权，不做。**
- 可接受解 B：8 源闭包条目的判据维持 `compile_rc` 全等，并在回执里显式标注 `anchor=rc_only`（弱化已知、不冒充）。
- 不可接受：自己拼 `system-link-exec` argv 或经 shell 抓输出（= 第二个编译通道，违反唯一通道纪律）。

## 九、本轮机械自检（无编译、无运行；命令与结果）

工具：`/tmp/a4_semantic_check/mech_check2.py`（任务级临时件，任务尾删除；脚本自身只读源码）。

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | 括号平衡（`()[]{}`，忽略字符串/注释，深度不得为负、终值 0） | `python3 /tmp/a4_semantic_check/mech_check2.py src/tools/rsi_semantic_regression.cheng` | **PASS**（`lines=902 fns=20`，仅剩 1 条：卷首注释含 "@importc" 字面，非代码注解） |
| 2 | 缩进一致（语句行 4 的倍数；续行按括号深度放行；无 tab；无行尾空白） | 同上 | **PASS** |
| 3 | `@borrows`/`@…` **紧跟**其修饰的 `fn`（下一非空行必须是 `@` 或 `fn `） | 同上 | **PASS**（本文件 12 处 `@borrows` 全部邻接，行号 65/71/86/94/121/171/207/250/281/348/431/448） |
| 4 | 块体缩进（`:` 结尾的语句头，其体必须更深） | 同上 | **PASS** |
| 5 | 零 `@importc`（代码行） | `grep -n '^[[:space:]]*@importc' src/tools/rsi_semantic_regression.cheng` | **零命中**（`exit 1`） |
| 6 | 无重名 `fn`、`fn`/`import` 均顶层、无 import 在 fn 之后 | 同 #1 脚本 | **PASS** |

**未触发项**：本轮**不产出 patch**（交付物是 2 个新文件，无既有文件改动），故
`python3 .rebuild/s1b_step3/r9/patch_preflight.py <patch>` 这一条**条件未触发**；
其针对的"注解位移/注解失去挂载"风险，本文件用 #3（注解邻接）+ #1（括号）+ #2（缩进）三条等价覆盖。
若后续任务产出 patch，该预检必须 PASS 才可落盘（`AGENTS.md` 工程规范 10）。

## 十、待槽位验证清单（**本轮全部未做**；每条给命令、期望判词、未做原因）

> **2026-09-13 交付后现势（本表已过时，以账本 §6.1y 为准）**：V0/V1/V2/V2B/V3/V7/V8 **已实测通过**、V9 随轮取得；**V4 进行中**（候选载具 = stage3 + `BACKEND_JOBS=2` 包装脚本，见 `.rebuild/patchwork/run_v4.sh`）；**V3F**（无缓存全量）待连续 3–5 分钟静窗；**V5 的前提已变**（8 源闭包当前 `compile_rc=0`，不再是 known-red）；**V6 私账本口径未取得**（盘上无 31/31 私账本，生产口径已取得 `incumbent=2254 <= 3937 equals_best=0`）。下表"为何本轮未做"一列保留为**当时的**记录，不再更新。

> **抢槽纪律（三条件，全部满足才可 `mkdir` 锁）**：
> ① `COMPILE_SLOT.lock` 缺失**或** owner 已死；**且** ② 无 `cheng_cold*` / `system-link-exec` / `rebake*` / `kd_*` 进程；
> **且** ③ 连续 ≥3 次静默采样、间隔 ≥15s。
> **撞车作废**：任何一轮出现 `os atomic tree: parent lease unavailable`（或 `compile_rc=2` 且 stderr 含该串）
> ⇒ **该轮作废重跑**，不得当结论、不得入账。
> 出处：任务指令引 `.rebuild/theory_emit/verify_theory_emit.sh`，**该文件本轮实测不存在**
> （全仓 glob `**/verify_theory_emit*` 只命中 `patches/selfbake_theory_emit.patch` 与
> `design/selfbake_theory_emit.md`）⇒ 三条件以本段为在案口径，**原始件未钉**（见 §十一-①）。
> **本轮现势实测（只读）**：`.rebuild/COMPILE_SLOT.lock/owner.txt` = `pid=96980 purpose=c2line_round2`（08:16 建立），
> 且 `ps` 实见 `kd_c2c`（pid 11945）正在 `system-link-exec` 自烤 ⇒ 条件①②**当场不满足**，
> `src/core/lang/parser.cheng` mtime 08:18:21（锁建立后仍在被写）。

| # | 验证项 | 命令（槽位窗口内） | 期望判词 | 为何本轮未做 |
|---|---|---|---|---|
| V0 | 本工具自身编译 | `<stage3> system-link-exec --root:<root> --in:src/tools/rsi_semantic_regression.cheng --emit:exe --target:arm64-apple-darwin --out:<scratch>/rsi_semantic` | `rc=0` 且产物在位 | 需编译槽位（条件②不满足） |
| V1 | 比较器负例自检（**不需要被测编译器**） | `<bin> --self-test` | `7×check=self_test_* status=PASS` + `rsi_semantic: SELF_TEST_PASS`（rc=0） | 需先 V0 |
| V2 | 金标基线记录（载体 = 冻结 stage3 或当轮 kd） | `<bin> <root> <carrier> <scratch>/semantic_baseline.txt --record --ledger:<root>/artifacts/rsi` | 31 格 `golden=match` + `task_space_correct=PASS correct=31/31` + `baseline_write=PASS` + `PASS SEMANTIC_EQUIVALENT`（rc=0） | 需先 V0；且基线属"记录"动作，须在**同一工作树**上与被测轮配对 |
| V3 | 同载体自证等价 | `<bin> <root> <carrier> <scratch>/semantic_baseline.txt` | 全条 `baseline=equal` ⇒ `PASS SEMANTIC_EQUIVALENT`（rc=0） | 需 V0/V2 |
| V4 | **已知误编译必判 FAIL**（合同实证反例） | 先用 `BACKEND_JOBS=2` 烤出的 C 冷链载具作 `<cand>`，再 `<bin> <root> <cand> <scratch>/semantic_baseline.txt` | 逐格 `status=FAIL verdict=differ`（vs 基线 `run_rc=0` ⇒ 候选 `run_rc=1`/无输出）⇒ `FAIL SEMANTIC_DIVERGENT_OR_INCOMPLETE`（rc=1） | 需 V0/V2 + 另一枚载具烤制（槽位）；**该反例即 `c1c2_contract.md:11` 的 `BACKEND_JOBS=2 → 无输出 rc=1`** |
| V5 | 8 源闭包 known-red 基线 | V2 回执中 `check=closure8_multisource` | `compile_rc=2` 且 **两侧相同** ⇒ `PASS`（known-red 平价，非绿；见 §八 缺口） | 需 V0/V2 |
| V6 | incumbent 腿两口径 | 生产账本：`... --ledger:<root>/artifacts/rsi`；私账本（31/31）：`... --ledger:<private>` | 生产：`PASS incumbent=2254 <= oracle_best_correct=…`（`equals_best=0`）；私账本：`equals_best=1`（`incumbent==best_correct`） | 需 V0；**读数未钉**（估值 2254/3937 来自 `pure-cheng-rsi.md` §8.1，本席未复读账本） |
| V7 | 语料漂移 fail-closed（负例） | 把 `fixtures/` 副本中任一夹具改 1 字节，`--fixtures:<副本>` 重跑 judge | 该条 `status=FAIL verdict=drift`（**不是**静默换语料）⇒ rc=1 | 需 V0/V2；副本须落任务级 scratch |
| V8 | 基线缺条 fail-closed（负例） | 从基线副本删掉 1 个 `entry` 行后重跑 judge | 该条 `status=FAIL verdict=missing` ⇒ rc=1 | 需 V0/V2 |
| V9 | 守卫包裹轮（RSS 腿） | §六 的 `beat_c_process_group_guard.sh` 模板包裹 V3 | 全绿 + guard 报告 `process_tree_enforced_peak_bytes=…`；`--rss-limit` 用 `tools/memory_model_limits.sh` 派生值 | 需 V0/V2 + 槽位（守卫与烤机同窗口） |

## 十一、未钉项与边界（逐条，不得省略）

① **抢槽纪律原始件未钉**：被引 `.rebuild/theory_emit/verify_theory_emit.sh` 实测不存在，三条件按任务指令口径转写（§十 引文块）。
② **pair2/closure8 源字节的尾部换行未钉**：原生成脚本 `.rebuild/run_s1a/` 已不在盘上（本轮实测目录不存在），
   内联文本取自 `s1b_impl_progress.md:459-520` 的引文；**尾随换行是否与当年 printf 逐字节相同未钉**。
   影响面：只影响"是否逐字节等于 2026-09 的历史输入"，不影响本门 A/B（`src_sha` 入基线，两侧同一字节）。
③ **编译失败条目的锚强度**：见 §八（`compile_rc` only），"末行判词逐字相同"未实现。
④ **入口级源 sha，不是闭包级**：`src_sha` 只锚入口源文件；被 import 的 std/core 源漂移**不进判据**
   （驱动的 `composition_source_closure_sha256` 已存在于 kernel 侧，接线属后续任务）。
⑤ **`RsiGeneratorTaskProgram` 生成器漂移**只被 `src_sha` 捕获（同一 generator 版本内一致）；生成器语义扩展（新格/新模板）会判 `drift` 而非静默通过——**这是设计意图，不是缺陷**。
⑥ **best-of-5 / 双峰口径未接**：C1 的 `exec_phase_total_us` best-of-5（合同 §C1 计分）不在本门（本门只管语义，不管时间/内存）。
⑦ **档 1/2 语料未纳入**：`types.RsiCompilerCorpusOpen(1|2)=false`（BLOCKED，kernel 覆盖墙）⇒ 本门只收档 0；
   解冻后应追加为条目（不得静默跳过）。
⑧ **本门不判内存**：C2 硬门/逐相贴线仍由 `RsiCdC2Verdict`（`compiler_domain.cheng:193-208`）+ guard 判；
   本门与它是**同一次试验的两个面**，不互相折算。
⑨ **未实测声明**：本文件与工具**均未编译未运行**；§九 的 6 类自检是本轮唯一的实测读数，且只覆盖文本形态。

## 十二、后续接线（本轮明确不做，防越权）

1. `src/tools/rsi_gate.cheng` 增一条 oracle 腿（gate 私账本 + 冻结载体 → `SEMANTIC_EQUIVALENT`）；
2. `docs/cheng-plan.md` §6.3 B4 行按 §二 换成 `fp` 口径（权威件，须用户裁定）；
3. `src/rsi/compiler.cheng` 增捕获入口（§八 解 A），消除编译失败条目的锚弱化；
4. `src/rsi/compiler_domain.cheng:284-288` 的锚算式抽成**唯一导出函数**，本工具与 C1/C2 账本同调一个实现
   （现状=同构表达式两处，**尚不是字面一份实现**，如实登记）；
5. 档 1/2 解冻后追加语料条目 + B4 的 `decl_index verified=1` / 逐源对拍门（0f）两条 kernel 侧判据的合流口径。

---

## 十三、交付后追加：观测缓存与对外 gate（2026-09-13 实测追加，**设计件原文没有，如实补记**）

**为什么追加**：设计时假设"一轮 3–5 分钟连续窗口"可得。实测现势（内核线独占编译槽位）窗口**成簇**出现——簇内 3–12 秒、簇间 5–20 分钟——单轮 V2 连撞 6 轮全被抢槽杀掉。⇒ 不追加"按条目续跑"能力，本工具在现势下**不可能跑完**（不是慢，是死锁）。

**追加件一：观测缓存**（实现 `src/tools/rsi_semantic_regression.cheng` 的 `obsCacheLookupInto`/`obsCacheStore`）
- 只缓存**全绿观测**：`crc=0 && rrc=0 && judge=pass`（格子再加 `golden=match`）。任何非绿一律不落缓存 ⇒ **缓存只能确认绿，不能掩盖红**。
- 键 =（载体 sha256）:（工具 sha256，经 `--cache-key` 由调用方传入）+ 条目名 + 条目 `src_sha`。⇒ 换载体/换工具/换语料/改夹具**必然 miss**；不传 `--cache-key` ⇒ 缓存整体禁用（fail-safe）。
- 命中路径**仍然逐轮重算 judge 判据**（基线缺条判 `missing`、源漂移判 `drift`），省掉的只有"编译+运行"这一步；命中条目在判词里带 `cached=obs_v1` 标记。
- 正确性证据 = 记两遍 record：首轮（部分命中）与全命中重放产出**逐字节相同**的基线（账本 §6.1s 的 V2B，sha `7995091f…`）。
- **实现注意（踩过）**：`@borrows` 函数体内把调用结果直接当另一个 `@borrows` 形参实参（`Split(ReadFile(...))`）会拿到空串且**不报错**，表现为"写进得去、读永远 miss"；必须先落局部。见 `lessons.md` 的 C2 线第 6 条与账本 §6.1r。

**追加件二：对外 gate** `tools/a4/semantic_gate.sh`（候选编译器 → 语义等价判词，退出码 `0/1/2/3`，热跑几秒、冷跑 3–5 分钟）。接线方式与边界见 `docs/cheng-rsi-fusion-plan.md` §6.16。

**仍未做**："无缓存全量 judge（V3F）" 需连续 3–5 分钟窗口，被饥荒挡住（账本 §6.1s / §7-9）。

