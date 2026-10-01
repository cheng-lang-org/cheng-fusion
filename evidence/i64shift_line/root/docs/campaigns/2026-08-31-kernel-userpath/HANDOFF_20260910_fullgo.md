# 收官交接书（2026-09-10 全速轮，session 收口）

> 本文件是「完成三份方案剩余验收项」这条会话线的交接页：已证事实、未提交资产、待裁决、
> 可立即执行的任务包、纪律红线、估工。所有结论绑定仓库实测与回执，未验证项一律标注。

## 一、一句话状态

HEAD 编译回归已定位并修复（**未提交**）；内存墙量级与靶点已由两条独立线互证到文件级；
Step 2 组合装配 / Step 3 768MiB / Step 4 三臂 / RSI 编译器域**同被该内存墙前置阻塞**；
held-exec 只剩 **M3 安装面**待授权。总体完成度约 **45%**，剩 **85-170 agent 小时**。

## 二、已验证（可直接引用，绑哈希/回执）

| 项 | 结论 | 证据 |
|---|---|---|
| HEAD 编译回归 | `e7e38d76a` 把 receipt accumulator 初始化挪到 forest 窗后并新增「派生表释放+重建」对 ⇒ `typed expr: frozen metadata seal code=context_sequence_shared ref_count=2`；连 `fn main(): return 0` 都编不过 | 回执 §九-§十一；克隆/主树双证；提交二分 |
| 修复 v4 | 整段还原该提交 `compiler_csg.cheng` 改动（保留 parser detach 与 psb 修复）⇒ 真实 768MiB 门 **3/4 PASS**（ordinary 624MiB / call_fixture 628MiB / cold_nested 706MiB），v6 超线 16.4MB | `patches/head_seal_regression_fix_v4.patch`；回执 §十一；TA-MEM3 独立复核 |
| 内存墙量级 | 768MiB 死点=forest pass0 `src=61 primary_object_plan`（单源 131.8MiB 树，enforced phys 808.7-809.2MB，差 3.4-3.9MB）；**合并森林 Σ=1,230.7MiB 是 1.5GiB 死因**（1.5GiB 双抬仍死，树上单进程）；森林成本 ≈2,012 B/源行 | 回执 §一/§六；`VERIFY_tamem3_append.md` 互证 |
| 正解唯一性 | 增量消费（每源 parse→typed→立即释放）；F1（pass0 presize）三轮零净已回退；隐藏天花板 `frontierParsedSources` 跨轮持久（`compiler_csg.cheng:39107-39108` 整批释放）【更正 2026-09-10 实读：旧写 `:39060` 系 S1a 入库前编号，`CompilerCsgFrontierParsedSourceStoreRelease(` 现址 `:39107-39108`】 | `design/incremental-forest-consumption.md`；回执 §十三/§十五 |
| 并行 lower 池 | `BACKEND_JOBS>1` 必挂 `primary_lower_pool_batch_receive_failed`；fork 臂=裸 libc fork（与 DarwinAuthority/`bd149df96` 无关）；失败在父侧，最强嫌疑 `:69547` 拒提交【更正 2026-09-10 实读：旧写 `:69520` 已漂移（`PrimaryLowerPoolCommitBatch` 自体由 `:69470` 移至 `:69497`），`if bodylifecycle.BodyIrPayloadHasPhysicalStorage(` 拒提交点现址 `:69547`】；该路径从未端到端验收（门硬钉 jobs=1） | 回执 §十二/§十六 |
| kernel-only / 组合装配 | 直连实测 `rc=125@177s rss=838,976,712 > 805,306,368`（aarch64 组合装配 873MB 同族）⇒ Step 2 组合构建+exec_diff 同被内存墙阻塞 | 回执 §十八 |
| manifest 未知键疑点 | **证伪关闭**：`system-link-exec --composition-manifest:` 不执行 unknown-key 规则（合成探针实测） | 回执 §十七 |
| S1a 索引相（任务线终报已补投） | `typed_expr_type_arena.cheng` +323（`TypedExprTypeDeclarationIndex` + Build/Verify）、`compiler_csg.cheng` pass0 双产出+调用点硬门；**B1/B3 已验证**（四夹具 compile=0 / run 0/1/0/0 / `decl_index verified=1`；B3 因设计口径计数行是死码，改比同路径产物 sha256 全等）；边界：reuse 路径未覆盖、**无降峰**（索引相） | 回执 §十九；`patches/s1a_step1.patch`（-R 通过） |
| RSI §5 缺口 | 提交边界中断/双写者锁（`rsi.write.lock.d` 目录锁+死锁接管+活锁硬拒+受锁提交零落盘）/前瞻预算配对账本/递归 e2e（真 3 轮 gen0 22963→gen1 13450→meta→gen3 3937）；contract+e2e 独立复验 `compile=0/run=0` | 提案 §5/§8；回执 §十三 |
| held-exec | 判词 56：darwin 五原语判决 + `begin_claim` 纯派发器 + 硬 fail 码（无 linux required 兜底）；**余 M3 安装面** | 提案 §8.2⑥；回执 §十四 |

## 三、未提交资产（**落盘优先级最高**）

1. `src/core/tooling/compiler_csg.cheng`（+14/−43）= **v4 seal 回归修复**（HEAD 已提交态仍带回归）。
   补丁：`patches/head_seal_regression_fix_v4.patch`。另 v1/v2/v3 为探测产物，**勿用**。
2. `src/rsi/store.cheng`(+300)、`src/rsi/promotion.cheng`(+90)、`src/tests/rsi_contract.cheng`(+333)、
   新增 `src/tests/rsi_recursive_e2e.cheng` = RSI §5 缺口补齐。
3. 会话前既存 WIP（非本席）：`src/core/lang/typed_expr.cheng`（`[ledgerwalk-*]`）、vpn/quic/net 若干。
4. 文档：三份方案（`docs/cheng-minimal-kernel-plan.md`、`docs/memory-time-limits-plan.md`、
   `openspec/proposals/pure-cheng-rsi.md`）、回执 `verify_append/VERIFY_fullgo_0910_append.md`（§九-§十九）、
   设计 `design/incremental-forest-consumption.md`、`design/strict-closure-k3-split.md`。

## 四、待用户裁决（两件硬前置）

- **① 提交主树未提交改动**（尤其第 1 项）。TA-MEM3 线独立建议「尽快收割提交」。
- **② held-exec M3 选 A/B**：A=授权安装面（root + `SF_IMMUTABLE` + codesign），选 A 即可排 M1/M2/M4；
  B=终验走 Linux lane（外部机 + 跨机哈希绑定）。**未授权前不动任何权限面。**
  **【2026-09-10 用户授权本席定案：走 A】** 安装面方案见 `design/m3_install_surface_plan.md`
  （固定路径 `/usr/local/libexec/cheng/csg-core-native` + `SF_IMMUTABLE` + 非 ad-hoc 签名；
  待用户给 root/签名身份/路径确认，M1/M2/M4 为纯代码可先做）。

## 五、可立即执行的任务包（拿到独占槽即可开工）

| 包 | 首刀与锚点 | verify / done | 估工 |
|---|---|---|---|
| **P-A 内存 S1b** | 按 `design/incremental-forest-consumption.md` §三 S1：R2 两相拆分（S1a 索引相已在树）→ 删合并森林（`typeArenaParserForest` 23 处引用） | B1-B6 判据（含反向判词）；768MiB 自烤 phys 峰下降；GEN2/GEN3 固定点硬门 | 28-36h |
| **P-B 池修复** | `primary_object_plan.cheng:69497-69553`（`:69547` 父侧已有 BodyIR 即拒 → wave 内先按既有生命周期释放再接受帧）【更正 2026-09-10 实读：旧写 `:69470-69526`/`:69520` 已漂移，`fn PrimaryLowerPoolCommitBatch(` 现址 `:69497`（下一 fn `PrimaryLowerPoolReleaseStagedPayloads` 起 `:69591`），拒提交点 `:69547`；旧区间末 `:69526`=`return false` 与今 `:69553` 上下文（其后紧接 `# No live state is touched…`）逐字同构】 | jobs=1/2 产物 sha256 逐字节相等；两个 pool 合同仍绿；**禁**失败回落串行 | 4-8h |
| **P-C 严格闭包 S1** | `design/strict-closure-k3-split.md` §三：切 E3+E4+E2 三门面入口边 + 同刀删 `bootstrap/kernel_manifest.cheng` 11 行 | `--require-strict-closure` arch 12→4；closure 183；四夹具+契约冒烟绿 | 40-80h |
| **P-D held-exec M1/M2/M4** | 施工图已出：`design/pd_heldexec_m1m2m4_plan.md`（395 行）。五个纠偏：①**errcode 31/32/34 在 M3 未装时永不出现**（仅定义行 `psb:24766-24769`；darwin 臂只 `:29028/29033` 返 33）⇒ 验收改模块级探针；②child 侧 channel 门 `SolSocket=1/SoType=3`（`psb:24698-24699`）是 **Linux ABI**，darwin 应为 `0xffff/0x1008`，必须另立常量；③M1 非「接桥」：现存 darwin recv 要求一次收满 768（`host_runtime:3457/3689`）而 SOCK_STREAM 必分片，且缺 pid/uid/gid 出参（`psb:385-391` vs `:31483` 要 childUid）⇒ 定长分帧循环+凭据出参（`core_runtime_provider_darwin.cheng:992-1027` 可复用）；④stage3 冒烟**不覆盖** psb/host_runtime（走 C 窄面）⇒ 每轮必须先重烤驱动；⑤M2 audit-token 树内**零生产者**（capability 有状态无列 `:42-53`，`:204-205` 无条件 HARD_RED），须新建两列+Bind+打开成功路径，`kinfo_proc` 偏移须先写 C 探针实测 | 各模块可证伪探针（M1-a/b、M2-a/b/c、M4-a/b/c）；M3 未装处显式 HARD_RED | **27-46h / 12-18 轮烤机**（不含 M3 安装与 M5） |
| **P-E 补验** | S1a B1/B3 对拍（独占槽）；Step2 exec_diff（内存过后） | 逐字节/census 对拍 + 四夹具 | 2-4h |
| ~~**P-F purity 门自检**~~ ✅ 已完成 | `tools/cheng_source_purity_gate.py` 补 `--self-test` 三腿（提交 `472266f09`）；并修两处硬伤——加 `--root`（CI 显式传仓根，杜绝审错树）+ `git` 异常处理（仓外走 rc=2 干净判词，不再 traceback），`ci_gate.sh:524` 传 `--root "$ROOT"`（提交 `8286ed225`，四路验证：仓内 PASS / 仓外 `--root` PASS / 仓外无 root rc=2 / 自检 PASS） | — | 0 |
| **P-G ci_gate 注释过期**（低优先） | `tools/ci_gate.sh:582` 的 zrpc 注释「当前如实 RED 347/9」已过期（实测 strict/no-cold rc=0）——改注释与当前实测值一致 | 注释与 `tools/zrpc_kernel_gate.py` 实跑一致 | 0.2h |

**已闭环的 CI 完整性（09-10 晚，提交 `3f836272a`）**：扫 `ci_gate.sh` 的 28 个 `tools/*` 目标 → **悬空 0、未入库 0**；此前 5 个「门在调、文件不在库」（`backend2_plugin_trade_gate.sh`、`pickup_offline_gate.sh`、`pickup_tamper_gate.sh`、`cheng_source_purity_gate.py`、`kernel_plugin_manifest_gate.py`
——fresh clone 上这些检查必断）已加 `.gitignore` 白名单例外并入库；新增棘轮门 `move-into-field-completeness`
（63 家族 / 3 baseline 命中 / `--self-test` 5 类全过，`ci_gate.sh` 接 1 行）。

## 六、纪律红线（本会话用血换来的运维事实）

1. **独占窗口是硬前提**：同仓并发重编译撞 workspace-root 租约，失败形态是**静默 rc=2** +
   stderr 一行 `os atomic tree: parent lease unavailable`。任何 rc=2 先查该判词，命中即判环境碰撞重跑，
   **禁止**记成编译器判词；一切 before/after 基准必须在独占槽内跑（本会话两次被此污染作废）。
2. **克隆床不能做端到端夹具**：克隆内 provider 路径指向主树（`missing provider` /
   `cold source snapshot source path leaves package root`），只能在主树验证。
3. **C 链烤机 `--out` 不能落 `/private/tmp`**（`primary object emit failed` /
   `Darwin host provider preprocessing identity failed` 两种误导判词）；落仓库内或 `$HOME`。
4. **PATH 里的 `diff` 是假的**（不吃 `-u`，对相异文件报相同）——一律 `/usr/bin/diff`。
5. 禁 `git checkout --`/`git restore` 共享文件；他人 WIP 只能共存不能覆盖；不 commit（由主线程收割）。
6. 门禁口径：`tools/user_path_gate.sh` 内固定 `BACKEND_JOBS=1`；`beat_c` 守卫产物 O_EXCL，
   同目录重跑前须清存量（否则 `output_artifact_contract`）。

---

## 附录 Z：2026-09-11 凌晨现状追加（本会话后半段，读回执 §二十~§二十三 与三份 design 文档为准）

**Z.1 一句话**：内存/时间两条墙都已定位到代码级；**全量 234 源当前真正的拦路虎是 correctness 缺陷**（`parser forwarding production: authority invalid`，判重 key 缺 producer/源维度、跨源同 span 误判，pre-existing）；池化 `BACKEND_JOBS>1` 的残留失败点已定到 `pv_fail stage=68`，且**极可能是我们自己 fix3 把形参极性抄反**。

**Z.2 已入库（本段新增，均为实测绑定）**：
- `c5f6c6736` perf(parser)：`parser.cheng` 三处同族站点中的 token/typeSyntax 两处补 per-source remap 缓存（同路径 A/B `cmp` 逐字节相同）；森林窗 774,266→553,914 ms、整轮 793→577s。第三处 `:11699`（region 循环）**未补 = 残余主项**。
- `f92f573f2` S1a 索引相 + RSI §5；`43e12c322` 埋点位移（原址是死码，before 命中 0）；`f8f4ab66c` 池化三根因（**但含 fix3 极性反转，待修**）。
- 回执 §二十~§二十三（`VERIFY_fullgo_0910_append.md`，含 §二十三 provenance 边界：测量期树内有他线 WIP，**含会改 C 种子的 `bootstrap/cheng_cold.c`**，故本会话数字一律不得当发布证据）。
- 三份 design：`pa_s1b_edit_plan.md` rev.3、`incremental-forest-consumption.md` rev.3、`memory-time-limits-plan.md` §五重写；`authority_invalid_triage.md`、`pool_stage68_conjuncts.md`、`heldexec_kinfo_probe.md`、`anchor_drift_audit.md`。

**Z.3 关键实测数字**（细节见对应节）：pass0 森林 Σ=1,230.73 MiB=门线 1.53×；pass0 活块 `live` 1,470,764→3,089,597（+172 MB）；默认门 rc=125 死在 `forest src=61`；抬门 4GiB（诊断）rc=1 @583s、`forest_appended=40`、peak 2.00 GiB、止于 correctness；intern 探针证伪"探测爆炸/ hash 常量"（worst 恒 51）；时间墙真因=每 token 克隆并重 intern 整段源文本。

**Z.4 在飞与下一步**：判重修复（`parser.cheng` 工作树 +192/−96，负例控制要"同一份源喂两次"实测 fail-closed）→ 第三处同族缓存 → S1b（pass0 流式化 + 删并林，34~46h）。池化：probe10 判词 → 极性取反修复 A → 四夹具转绿。held-exec：M2 偏移与权限门已实测（**非 root 能读他人 kinfo_proc，权限门不得建在"读不到"上**）。

**Z.5 纪律新增四条**（详见 `lessons.md`）：①共享热文件禁整文件安装（`cp`/`checkout --`/`restore`/`stash`），只走 patch + 上下文校验；②埋点须证"旧址命中 0/新址命中 N"；③并发互斥用 `mkdir` 原子锁，**等待者必须做 owner 活性检查并清陈旧锁**（否则一条被杀的线冻结全仓）；④"对齐 canonical"先写形参语义对照表，**绝不抄字面值**（反向参数必取反）。另：任何"相等/通过"判词的分母必须是本轮新生成产物且生成侧 rc 作前置门（否则会拿旧产物自证等价）。

**Z.6 后续增量（03:2x 补记，接手前必读）**

- **未提交 WIP（在工作树，别丢）**：
  1. `parser.cheng` **+192/−96** ＝ authority 判重修复（key 补 producer/源维度）。验证状态：小复现 `did_subscribe_smoke` 3/3 稳定 `forest_parsed=37/forest_appended=37`、`authority_invalid_lines=0`（pristine 侧为 `appended=18`+authority invalid）；新死点前移到 `frozen module const query before build-index seal`（**先前不可达、归因未定、超出该轮范围**）。**全量 234 两轮尚未出判词**。patch 与全部原始件在 `.rebuild/auth_fix/`。
  2. RSI 批次九（§5 步 5 前瞻预算配对账本 engine 接线）：4 文件 `+85/−11`，patch sha `bff137ec…fa11`，**零编译**；报告 `design/rsi_batch_progress.md` §⑤ 有 **6 条待槽位验证**。注意：`engine.cheng` sha 已变（`e1668eca…`→`dfc130da…`），`receipts/batch7_gate.txt` 旧绑定失效，**旧 11/11 不得挪用作本批证据**。
  3. 池化 probe10 修复实验：`.rebuild/pool68/`（patch 与 phase1/phase2 脚本齐备），**正在占槽跑**（owner 39482；基线 `bake[kd_base] rc=0/202s/lease_hits=0`、驱动 sha `51503e86…`；夹具矩阵进行中）。判词目标 = 八合取项中存活假项 + 极性取反后四夹具是否转绿。
- **闭包 S1 的两个实测纠偏（重要，别再按旧文本干）**：① G2 选型**不能**用"declared==actual 与 token 计数自洽"——`codegen_contract.cheng` 在 `ARCH_TOKEN_CONTRACT_FILES` 内、`scan_strict_arch_tokens:311` 直接 `continue`（token 零覆盖），两变体输出逐字节相同；真判据 = **调用方新增 import 面**，据此取变体 B（0 新增 import）并消解 `ResultAt`/`ObjectBytes` 矛盾。② 施工图 `:142` 称两个 `str[]` 是"var 写回"**是错的**：全 `src/` 仅 3 处写且都在内核侧、在轨调用之前，轨上只有只读用法 ⇒ E4 难点收缩为两个真 var 载体。闭包线下一步 = **一次烤机合并四件事**（W1 二次调用 + W1b `var` 是否需可写副本 + G1 甲/乙判别 + S0.5 形态定案）。
- **证据纳管**：`verify_append/` 下 11 份他线回执（b3meta/b3r_churn/b3struct/b3struct_model/bigsrc/forin_seq/gen2r2/gen2r3/rowreset/tamem2/tamem3）已从工作树纳入版本控制（内容一字未改、未复验），避免再现 wall154 那种"未入库即蒸发"。

**Z.7 病态红线 + 当前两条主线（04:0x 补记）**

- **用户裁定（已入库 `65ac999a4`，红线）**：**超过理论内存（`805,306,368 B`）或理论编译时间（`compile_theory_parallel_limit_ms`）的运行时状态一律按「病态」处理——是缺陷，不是工作点。** 派生：①抬门只许用于**发现缺陷**且全程标 `diagnostic`，其运行状态本身即病态证据（抬门 peak 2.0–2.3 GB = 超理论门 2.5–2.9×）；②凡"通过/可用"判词，若曾越过理论边界则**判词无效**；③已登记病态逐条待消解：pass0 Σ=1.53× 门线、活块 +171.9 MB（末态占 96.9%）、并林窗峰 2.62×、编译 13.641× 理论下限、第三处同族站点未修。**内存达标线唯一 = 默认 768MiB 门内全量 234 源跑完并林。**
- **当前两条主线**：①**S1b 实施**（`design/s1b_impl_progress.md` 待出）——按 `pa_s1b_edit_plan.md` rev.3 走 S1b-0→1 原子切换→2，判据 B2b（森林窗 <120s、无 >60s 零输出窗）/B2（门内跑完）/B2c（`live` 平台化），红线：`70339` 硬 panic 与串行臂一字不动、禁止 fallback；②**理论推导固化**（`design/deterministic_model_derivation.md` 待出）——把 `805,306,368 B` 与 `compile_theory_parallel_limit_ms` 的**产生处、公式、输入项**写成可复算文档 + 与运行时逐项对照（标不可比项），使"越界=病态"可判定、可进门禁。
- **authority 修复现状**：默认门内小复现 3/3 有效（`forest_appended=37`、`authority_invalid_lines=0`）；抬门全量已越过原 `producer=40`、推进到 `src=60/61`（**仅算缺陷发现**）；**fail-closed 保持未取得证据**（dup-in 与 dup-import 两次构造均未触达判据，应如实写"未验证"）。
