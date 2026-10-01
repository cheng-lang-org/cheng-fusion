# A7 自烤理论发射接线验证包（可执行件，git 可追踪）

**为什么有这个目录**：`design/selfbake_theory_emit.md` §⑥ 的"待槽位验证清单"原先只引用 `.rebuild/theory_emit/` 下的脚本，
而该目录**已被整体清理**（`find . -name 'verify_theory_emit*'` 零命中）⇒ 清单退化成不可执行的引文。
本目录把验证件重建到 **git 可追踪路径**，并只保留**能在当前（非静窗）状态下实测**的部分。

## 组成

| 文件 | 作用 | 当前状态 |
|---|---|---|
| `a7_apply_revert.sh`（sha256 `51f7d03e…`） | 补丁对**应用/撤销安全带**：`--apply`（记 pre-sha）/`--revert`（断言逐字节还原）/`--roundtrip`（scratch 自证，不碰树） | **已实测**：`--roundtrip` ⇒ `before=880d4632… applied=fae6ac97… after=880d4632…` **逐字节还原**；`--revert` 无 state ⇒ exit 2 拒跑；未知参数 ⇒ exit 2 |
| `a7_preconditions.sh` | 抢槽窗口检测（锁缺失或 owner 已死 ∧ 无 `cheng_cold*`/`system-link-exec`/`rebake*`/`kd_*` ∧ 连续 N 次静默采样，默认 3×15s） | **已实测**：当前报 `A7_PRECONDITIONS=BUSY reason=lock held by live owner pid=96980`，exit 3 |
| `a7_assert_emit.py` | 发射块断言（`--expect emitted|absent|closure234`） | **已实测**：真回执 `absent`→PASS；真回执 `emitted`→FAIL 并列出 43 个缺失键；合成全键 fixture→PASS；`closure234` 计数 233→FAIL；零值字段→FAIL；重复键→FAIL |

字段清单（37 个 `theory_emit_*` + 6 个 `cheng_cold_chain_compare_*`）**逐字取自冻结 patch 的 Fmt 语句**，
不是从设计文档 §④ 的"代码形状示例"抄的（该示例明确不是实测样例）。`git apply --numstat` = **323/2**，与设计文档一致。

## 执行序（**必须在 `a7_preconditions.sh` 报 FREE 之后**）

`PATCH = docs/campaigns/2026-08-31-kernel-userpath/patches/selfbake_theory_emit.patch`（sha256 见下）

- **S0 窗口**：`bash a7_preconditions.sh` ⇒ 必须 `FREE`。撞 `os atomic tree: parent lease unavailable` ⇒ 该轮作废重跑。
- **S1/S2 应用（改用安全带，见下节）**：`bash a7_apply_revert.sh --apply` —— 它先跑窗口检测、记录应用前 `sha256`、按 **base → fix** 顺序 `git apply` 两份补丁、校验标记位，并把 `sha_before` 落进 `.rebuild/rsi_a7/apply_state.txt`。
  **撤销只许 `bash a7_apply_revert.sh --revert`**（内部按 **fix → base** 反序 `git apply -R`，并断言还原后 sha256 **逐字节等于** `sha_before`）；**严禁按文本匹配删新增行**（事故二成因）。
- **S3 重烤**：按下面"重烤配方（已钉）"逐字执行。**两次**（pristine 与 patched 各一次，见 S5）。
- **S4 小夹具发射**：patched driver 跑一个 fixture 的真实 `system-link-exec`，stdout/report 过
  `python3 a7_assert_emit.py --expect emitted <report> <stdout>` ⇒ `A7_EMIT_VERDICT=PASS`；
  对照：**pristine driver 同轮同 fixture** 必须 `--expect absent` PASS（0 行 `theory_emit_*`）。
- **S5 产物字节不变**：pristine 与 patched 各编同一 fixture，`cmp` **exe 与 `.primary.o` 逐字节相同**，两侧 `rc=0`。
  ⇒ 两侧各需一次 bake，共 **2 次**。
- **S6 234 源发射（头号目标，抬门 `diagnostic`）**：
  `python3 a7_assert_emit.py --expect closure234 <report> <stdout>` ⇒ PASS，且肉眼确认
  `theory_emit_wall_ms / cpu_tree_ms / hw_logical_cpu / effective_parallelism_cpu_over_wall_x / real_wall_over_theory_x` 有值。
- **S7 还原**：`bash a7_apply_revert.sh --revert` ⇒ 必须打印 `A7_APPLY_REVERT_VERDICT=REVERTED_BYTE_IDENTICAL`；随后 `git diff --numstat` 必须回到 S1 前的读数（本文件面基线 **39/3**，属他线 WIP）。
  **为什么必须有这一步**：该文件带他线未提交 WIP，风险不是"打不上"而是"**撤不干净 = 抹掉他线的工作**"。安全带把这件事变成机械判据：**撤销后 sha256 必须等于应用前记录的 sha256**，不等即响亮失败（`--revert` 在缺 state 文件时直接拒跑，不给"凭记忆还原"的机会）。

## ⚠ S2.1 必改项（应用补丁后、烤机前）：`theory_emit_rss_peak_scope` 标签在 Darwin 上是错的

**事实（读码链，逐跳可回源）**：补丁第 61 行 `let rssPeakBytes = BackendDriverDispatchMinCurrentRssBytes()`；该函数在
`src/core/tooling/backend_driver_dispatch_min.cheng:3398-3400` 直接返回 `os.ProcessRssBytes()`；后者在
`src/std/os.cheng:1798-1799` 调 `processResourceGuardCurrentRssBytes()`，而该函数 `:1709-1726` 是**按平台分叉**的：

- **Darwin**（本战役全部实测所在平台）：取 `proc_pid_rusage` 的 `ri_phys_footprint` —— 注释 `:1718-1720` 明写
  "ru_maxrss is blind to compressed memory（实测 3.27GB ru_maxrss vs phys_footprint 9.74GB 已越 8GB 守卫仍未触发），
  所以 guard 必须读 phys_footprint"，且失败时响亮返回 `-1`、**不回退到那个瞎指标**；
- **Linux**：取 `ru_maxrss` 高水位。

但补丁第 260 行发出的标签是 `theory_emit_rss_peak_scope=process_self_peak_ru_maxrss` ⇒ **在 Darwin 上名实不符**：
数值是"本进程**当下** phys_footprint 的一次采样"，既不是 `ru_maxrss`、也不是"peak"（`:61` 只在报告装配时**采一次**）。

**必改（S2 应用补丁后立即执行，改完再烤）**：
1. 把第 260 行那条 scope 文案改成**平台限定 + 采样语义**的表述，例如
   `theory_emit_rss_metric=darwin_ri_phys_footprint_sample_at_report|linux_ru_maxrss_highwater`，
   并追加一行 `theory_emit_rss_sample_count=1`。
2. 若保留 `_peak_` 字样，只能在**平台已证为高水位**（Linux）时使用；**两平台不得共用一个"peak"标签**。
3. 改后必须重跑 `a7_assert_emit.py`（键表随改随更新）并重算补丁双份 sha256。

**未改之前**：该补丁**不得**被引用为"RSS 峰值口径"证据；其 `theory_emit_rss_peak_bytes` 只能读作"Darwin 下本进程报告时刻的 phys_footprint 采样"。
**与 §6.5 的关系**：这是"同一概念多个口径"的第五个实例——跨口径相除/相比一律无效。

## 未钉项（不得当 0、不得猜）

1. ~~S3 的重烤命令口径未钉~~ → **2026-09-13 已钉**（读内核线在用的脚本 `.rebuild/s1b_step3/run_step3_round.sh:54-74`，非臆造）：

   ```bash
   BAKE_BIN="${BAKE_BIN:-$HOME/.cheng-complete-0910/cheng_cold_v3}"   # 同脚本 :18
   OUT=<本任务输出目录>
   ( cd "$REPO" && CHENG_DISABLE_COLD_OBJECT_CACHE=1 CHENG_ENTRY_CACHE=0 \
       CHENG_NO_CACHE=1 CHENG_STRICT_NO_CACHE=1 BACKEND_JOBS=2 \
       "$BAKE_BIN" system-link-exec --root:"$REPO" \
       --in:"$REPO/src/core/tooling/backend_driver_dispatch_min.cheng" \
       --emit:exe --target=arm64-apple-darwin \
       --out:"$OUT/kd_<tag>" --report-out:"$OUT/kd_<tag>.report.txt" )
   ```

   **配套纪律（同脚本 :53/:67/:73）**：`lease_hits = grep -c 'parent lease unavailable' <log>` 必须为 **0** 且 rc=0，该轮才有效；否则整轮作废重跑。
   **bake 载具身份（实测，机制未钉）**：`/Users/lbcheng/.cheng-complete-0910/cheng_cold_v3`，3,328,176 B，sha256 `0c765779c8f6abac565be2949a40e6c185678e31dbde247212bc266a231d02cb`。
**观测事实**：`kd_b102.report.txt` 的 `compiler_executable_sha256` 与它**逐字相同**。
**不得据此断言机制**（"驱动记录生产自己的编译器"只是候选解释；也可能是嵌套 provider 编译时兜底到当前可执行体、或驱动自映像来自该载具）——该解释属 **B3 驱动新鲜度检查器**要钉的身份面，本包只登记这条等式。
   **仍未钉**：单轮 wall 未由本包实测（设计件记的"≈194s"是他人读数，本包不引用为自有证据）。
2. **43 键全量的严格性**：当前 `--expect emitted` 要求全部键在位。若真实运行证明某键是条件发射的，
   收窄断言**必须附该次真实回执**为依据，不得为了好看而放宽。
3. 嵌套编译行为（设计件 §⑥-7）本包**未实现断言**：需要先拿到一次真实 234 源回执统计块数，再据此写判据。

## 冻结件哈希

| 件 | sha256 |
|---|---|
| `patches/selfbake_theory_emit.patch` | `git apply --numstat` = 323/2；bytes/sha 见 `SELFTEST` 段落随轮记录 |
| `a7_assert_emit.py` | 随建时记录（见下） |
| `a7_preconditions.sh` | 随建时记录（见下） |

## 本轮实测证据（2026-09-13，非静窗）

```text
bash -n a7_preconditions.sh                     -> SYNTAX_OK
bash a7_preconditions.sh --samples 1 --interval 0
  lock=present owner_pid=96980 sample 1: BUSY (kd_c2c system-link-exec 在飞)
  A7_PRECONDITIONS=BUSY reason=lock held by live owner pid=96980   exit=3
python3 a7_assert_emit.py --expect absent  .rebuild/s1b_step3/r9/gate/r104_recov.summary.txt
  emit_lines=0  A7_EMIT_VERDICT=PASS   exit=0
python3 a7_assert_emit.py --expect emitted .rebuild/s1b_step3/r9/gate/r104_recov.summary.txt
  PROBLEM: no theory_emit_* line found  PROBLEM: missing 43 key(s)  A7_EMIT_VERDICT=FAIL   exit=1
合成 fixture（43 键全量、非零约束字段给 1）        -> PASS exit=0
合成 fixture（closure_files=233）                 -> FAIL exit=1
合成 fixture（全部非零约束字段 = 0）               -> FAIL exit=1（<=0 视为缺失）
合成 fixture（同键写两次）                        -> FAIL exit=1（重复键 fail-closed）
```

**未执行**：S1–S7 全部（非静窗 + 编译槽位被他线持有）。本包**不声称**该补丁已生效或发射已成功。
