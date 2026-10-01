# 恢复轮判词表（替代已失路径）

- 生成：2026-09-14T05:35Z 前后（本席只读恢复轮）；新原始件 mtime = 2026-09-14 04:40–05:29 +0800（= 2026-09-13 20:40–21:29Z）。
- 只读声明：未发起任何编译、未取 `.rebuild/COMPILE_SLOT.lock`、未改任何既有文件、未建分支/worktree、未 git add/commit/push。唯一写入 = 本文件。
- 路径基准：仓库根 `/Users/lbcheng/cheng-lang`，仓库相对路径；行号 1-based；sha256 取前 16 位。
- 引用优先 docs 侧（`receipts/evidence/**`、`receipts/semantic_steps/**`）；docs 缺镜像才回退 `.rebuild/` 并标注。
- 类别口径：`PASS` / `INCONCLUSIVE_DEP` / `未取得` 三值；DEP 不写成 FAIL。
- 镜像对拍：a9b+cdomain 判词件 5/5、semantic PASS 7/7 与 `.rebuild` 原位件**逐字节相同**（下表单列 docs sha 即两边同值）。

## §1 判词行

| # | 类别 | 判词逐字（关键字段） | docs 侧原始件:行 + sha256:16 | .rebuild 原位件 sha256:16 | 绑定驱动/载体 sha256 |
|---|---|---|---|---|---|
| A1 | INCONCLUSIVE_DEP | `leg=p verdict=INCONCLUSIVE_DEP reason=missing_phase_rows rows=0`；`leg_compiler=/…/artifacts/bootstrap/cheng.stage3`；`leg_compiler_sha256=05af823e7db0c8ea…`；`probe_rc=1` | `receipts/evidence/a9b_legs_latest/p/INCONCLUSIVE_DEP:1-5` `c080104fdf4cf579` | `c080104fdf4cf579` | 载体 `05af823e7db0c8ea…`（C 链 stage3，见 §3.1） |
| A2 | PASS | `leg=n verdict=PASS attempt=17 elapsed=224s`；`phase_rows=0` | `.../a9b_legs_latest/n/PASS:1-5` `67609d2f257d9c69` | `67609d2f257d9c69` | cli `6410dae9cddef4b3…`；compiler `05af823e7db0c8ea…`；rsi_src `bd15bdddb61cd1ff…` |
| A3 | PASS | `leg=n0 verdict=PASS attempt=17 elapsed=241s`；`phase_rows=0` | `.../a9b_legs_latest/n0/PASS:1-5` `d292df111460676c` | `d292df111460676c` | 同 A2 三 sha |
| C1 | INCONCLUSIVE_DEP | `corpus=0 verdict=INCONCLUSIVE_DEP reason=missing_phase_readings tag=0` | `.../cdomain_latest/legs/corpus0/INCONCLUSIVE_DEP:1` `73cf14af9d9335c8` | `73cf14af9d9335c8` | cli `6410dae9cddef4b3…`；compiler `05af823e7db0c8ea…` |
| C2 | INCONCLUSIVE_DEP | `corpus=1 verdict=INCONCLUSIVE_DEP reason=missing_phase_readings tag=1` | `.../cdomain_latest/legs/corpus1/INCONCLUSIVE_DEP:1` `9cc1ef8241079f5d` | `9cc1ef8241079f5d` | 同 C1 |
| S0 | PASS | `step=v0 verdict=PASS` | `receipts/semantic_steps/v0/PASS:1` `fdef751977747c1a` | `fdef751977747c1a` | tool `fe67c40f533ee59e…`；tool_src `2c855f8aff34e19f…` |
| S1 | PASS | `step=v1 verdict=PASS`；`checks_pass=11` | `semantic_steps/v1/PASS:1-2` `ee0a6de7692a324c` | `ee0a6de7692a324c` | 自检 11 项（见 S1L） |
| S1L | PASS | `cheng.rsi.semantic.v1 self_test_pass=11 self_test_fail=0`；`rsi_semantic: SELF_TEST_PASS` | **docs 无镜像** | `.rebuild/semantic/v1.log:12-13` `c9b93670a3a95b08` | — |
| S2 | PASS | `step=v2 verdict=PASS`；`cache_hits=0` | `semantic_steps/v2/PASS:1-4` `7b02ccc4aadff4d4` | `7b02ccc4aadff4d4` | baseline `7995091fa119bb54…`；carrier `05af823e7db0c8ea…`；tool `fe67c40f533ee59e…` |
| S2B | PASS | `step=v2b verdict=PASS`；`cache_hits=37` | `semantic_steps/v2b/PASS:1-3` `4b5333354ff1b170` | `4b5333354ff1b170` | baseline `7995091fa119bb54…` |
| S3 | PASS | `step=v3 verdict=PASS` | `semantic_steps/v3/PASS:1-2` `2dd66a47ba7d1c5a` | `2dd66a47ba7d1c5a` | carrier `05af823e7db0c8ea…` |
| S7 | PASS | `step=v7 verdict=PASS (rc=3, verdict=drift 实测)` | `semantic_steps/v7/PASS:1` `4a4b1c8af6f8a059` | `4a4b1c8af6f8a059` | 语料漂移 fail-closed |
| S8 | PASS | `step=v8 verdict=PASS (rc=3, verdict=missing 实测)` | `semantic_steps/v8/PASS:1` `06a31f5a6176bb0d` | `06a31f5a6176bb0d` | 基线缺条 fail-closed |
| S3F | PASS | `step=v3f verdict=PASS`；`cache_hits=0`；`carrier_sha256=05af823e7db0c8ea…` | **PASS 无 docs 镜像**；决定性行 `semantic_steps/v3f/guard.out.txt:46` `7530ec1ffc73d0b4` = `cheng.rsi.semantic.v1 checks_pass=45 checks_fail=0 entries=31+7 covered=31/31 best_correct=3937 compiler_sha=05af823e7db0c8ea… mode=0` | `.rebuild/semantic/v3f/PASS:1-3` `b26e51e3fa42b283` | carrier `05af823e7db0c8ea…` |

## §2 旧引用 → 新引用映射

| 旧引用（已失/失效） | 新引用（现存） | 绑定证据 |
|---|---|---|
| `.rebuild/patchwork/`（整片：`b905b_walls.log`/`contrast3.log`/`c5c6_probe.log`/`kd_d7_walls3.log`/`m1_retry.log`/`contrast.log`） | 无逐字镜像；墙字符串现存 `receipts/a9_cheng_chain_wall_repros.md:23-32,38-40` `af7e8b150ba627f7`；新轮同字符串 `receipts/evidence/wall_probe_latest/run.log:11,18` + `retry_1.log:9,16` | `tools/a4/mirror_evidence.sh:2-3` `a21e206bdbfcee93` 自述 patchwork 曾被整片抹掉 |
| `.rebuild/patchwork/carrier_bad.sh`（旧表记 `f8a83a3bb140b15a`） | `tools/a4/carrier_bad.sh` 现 sha `7ff454122658a23e`（**已漂移**） | 旧 sha `a9b_cdomain_verdicts.md:240` `2d758db207c944e3` |
| `.rebuild/patchwork/carrier_jobs2.sh`（旧表记 `9a61acebcda3924f`） | `tools/a4/carrier_jobs2.sh` 现 sha `9cc503bc4f1223f2`（**已漂移**） | 旧 sha `a9b_cdomain_verdicts.md:241` |
| `.rebuild/patchwork/probe_decl_trace.sh` | **缺件**（`tools/a4/` 下无此文件） | `a9_cheng_chain_wall_repros.md:43`；tools/a4 ls |
| `.rebuild/a9b/legs/p/leg_archive/p_rc0_pg34594_1789294000/`（旧表 §3 注的活原件） | **未镜像**；现役 `receipts/evidence/a9b_legs_latest/p/leg_archive/p_rc0_pg69418_1789334763/`（新一轮；docs 另有 `p_rc3_pg44741_1789334190`） | 旧引用 `a9b_cdomain_verdicts.md:75` |
| `.rebuild/a9b/legs/p/leg_archive/*`（通用） | `receipts/evidence/a9b_legs_latest/p/leg_archive/*`（`.rebuild` 侧另有未镜像 `p_rc143_pg52109_1789334550`） | find/ls |
| `.rebuild/a9b/legs/{n,n0}/leg_archive/*` | `receipts/evidence/a9b_legs_latest/{n,n0}/leg_archive/*` | find/ls |
| `.rebuild/semantic/v3f/PASS` | docs 无 PASS 镜像；内容仅 `.rebuild/semantic/v3f/PASS` `b26e51e3fa42b283`；判词字段改绑 `semantic_steps/v3f/guard.out.txt:46` `7530ec1ffc73d0b4` | 本表 S3F |
| `.rebuild/semantic/{v0,v1,v2,v2b,v3,v7,v8}/PASS` | `receipts/semantic_steps/{v0,v1,v2,v2b,v3,v7,v8}/PASS`（逐字节同） | 本表 §1 |
| `.rebuild/semantic/v1.log` | **docs 无镜像**（`semantic_steps/v1/` 仅 `PASS`） | ls |
| `.rebuild/a9b_run1.log` / `.rebuild/cdomain_run2.log` / `.rebuild/semantic_run35.log` | **无镜像**；落盘标记已由本表 §1 覆盖 | 未验证 |

## §3 特别核对

### 3.1 A9b p `leg_compiler` 是否 = C 链 stage3 `05af823e…`？→ **是**
`.rebuild/a9b/legs/p/INCONCLUSIVE_DEP:2-3`（docs 镜像同源，sha `c080104fdf4cf579`）逐字：
- `:2` `leg_compiler=/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3`
- `:3` `leg_compiler_sha256=05af823e7db0c8ea1a69cbd01eda84fcd4b8ff8049d38178663fd357d840f276`

交叉绑定该 sha = C 链 stage3：
- `receipts/batch7_migration.txt:16-17` `d2266bee543b8968`：`载具 = gate 同款 stage3：artifacts/bootstrap/cheng.stage3` / `sha256 = 05af823e…`。
- `receipts/batch8_domain_v4.txt:6-7` `6a0c92bf0e281a5c`：同句（`未重烤`）。
- `receipts/a9_cheng_chain_wall_repros.md:13` `af7e8b150ba627f7`：`artifacts/bootstrap/cheng.stage3（C 链）`。
- 本席重算 `artifacts/bootstrap/cheng.stage3` = `05af823e7db0c8ea…`，一致。

⇒ 口径：该 DEP 针对 **C 链 stage3**。C 链能编 RSI 语料，但 `bootstrap/cheng_cold.c` 全文仅 1 处 `compile_progress` ⇒ 成功编译时 0 逐相行 ⇒ `reason=missing_phase_rows rows=0`，判 `INCONCLUSIVE_DEP`（逐相仪器缺失），**不是 FAIL**。依据 `INCONCLUSIVE_DEP:4`（note）与 `a9_cheng_chain_wall_repros.md:13,17`。

### 3.2 cdomain 档 0/1 `missing_phase_readings` 逐字（docs 侧）
档 0 `receipts/evidence/cdomain_latest/legs/corpus0/INCONCLUSIVE_DEP`（sha `73cf14af9d9335c8`）：
- `:1` `corpus=0 verdict=INCONCLUSIVE_DEP reason=missing_phase_readings tag=0`
- `:5` `cd_c2_reject reason=missing_phase_readings tag=g00 peak=176898048 peak_ok=1 peak_resident=176898048 peak_footprint=86508336 limit=805306368 limit_ok=1 gate=805306368 phase_rows=0 rc=0`

档 1 `receipts/evidence/cdomain_latest/legs/corpus1/INCONCLUSIVE_DEP`（sha `9cc1ef8241079f5d`）：
- `:1` `corpus=1 verdict=INCONCLUSIVE_DEP reason=missing_phase_readings tag=1`
- `:5` `cd_c2_reject reason=missing_phase_readings tag=g00 peak=177340416 peak_ok=1 peak_resident=177340416 peak_footprint=93094728 limit=805306368 limit_ok=1 gate=805306368 phase_rows=0 rc=0`

两档 `phase_rows=0`、内存腿过门（peak ≈176.9/177.3 MB ≪ 805306368），唯一拒收理由 = `missing_phase_readings`。

## §4 差异 / 缺件 / 未验证
1. **V3F 计数漂移**：`semantic_steps/v3f/guard.out.txt:46` 现为 `checks_pass=45`（sha `7530ec1ffc73d0b4`），旧表 `a9b_cdomain_verdicts.md:107`（`2d758db207c944e3`）记同路径 `checks_pass=43`；PASS 标记内容不变（`b26e51e3fa42b283`）。类别不变，计数以 45 为准；未追因。
2. **docs 缺镜像**：`semantic_steps/v3f/PASS`、`semantic_steps/v1/v1.log`、`probe_decl_trace.sh`、`.rebuild/patchwork/**`、三个 run 日志均无 docs 逐字镜像 ⇒ 依赖它们的历史判词无法在 docs 侧复算。
3. **载体漂移**：两个 carrier 现 sha 与旧表记录不同（§2），V4a/V4b 引用必须改绑现 sha；容器内容是否等价**未验证**。
4. 旧表 §3 注的活原件 `p_rc0_pg34594_1789294000` 既不在盘也不在 docs 镜像 ⇒ **已失**；现役 DEP 活 archive = `p_rc0_pg69418_1789334763`（docs 有）。
5. 本轮**不改任何既有件**；本表所有 `.rebuild/...` 引用是取证时刻量（2026-09-14T05:3xZ），此后搬迁不在本表自动跟随。
