# VERIFY_gen2r3_append —— [GEN2-R3] GEN2 自烤 rc=0 + GEN3 字节固定点收口（刀已在树态）2026-09-09

date_utc=2026-09-09 · 代理=GEN2 突破线 R3（第二次重派）· 证据克隆=/Users/lbcheng/cheng-f24/gen2r3（锚 commit=3640b77e6 = 主树 345edb9a3 + 主树工作树全量含未提交改动）· 车头=/tmp/cheng_cold_v2（sha=7f731d4d…，与 R2 记录恒等）· 烤机壳=克隆 .rebuild/selfbake_gen2r3.sh（beat_c guard 1GiB 防线+900s 硬帽，禁缓存四件套，BACKEND_JOBS=8，bake_win 锁）

## 一、结论先行

**GEN2 自烤 rc=0 达成：4/4 轮通过（186-188s，900s 帽内），if-expr 墙确认已消；GEN3 字节固定点达成：4 轮 driver sha256 全 EQ（e98be9ea…）；四夹具门 rc=0（pass=4 known_red=0 stale=0），probe 区 19 件判词文本与 m70c 认证栏全同（3 件 STALE→RED 分类翻转=未提交 baseline tsv 登记更新所致，零语义漂移）。768MiB 管理线双口径：编译臂（锚定义口径，user_path_gate 头注=「车头烤：单遍工作集+全局符号表+流缓冲」）实测峰 686-703MiB，在锚带（C 链同闭包 717-748MiB）内 ✓；guard 全树驻留峰口径 806.38-808.28MiB，超锚 38-40MiB——峰窗定位实证=尾段发射/链接窗子进程（ld ~483-495MiB+车头 ~222MiB 并驻）瞬态，非编译臂遗留，按 TA-MEM 模型无对应刀项（LINKEDIT 负载漂移属模型 §二明示不入模型的环境面），不另起灶，双口径如实入账待主线裁决。**

## 二、重对位账（刀态考古——R2 刀已正式入主树，本线免重放）

简报所附三 patch（tamem_b1/b2/diag）无需再对位：R2 交付的 gen2r2_knives.patch 内容已由主树 38feddb3b「perf(kernel): TA-MEM B1/B2 + relief 相序 + intern75 + 快照文本共享」正式合入，且现主树 HEAD 345edb9a3 的 src/core/tooling/compiler_csg.cheng blob（a5e688518）与 R2 刀 commit 49fd1f811 的 blob **逐字节恒等**（git rev-parse 双证 + sha256 23f2dd31a… 双证）。

| 步骤 | 实况 |
|---|---|
| `git apply --check gen2r2_knives.patch` | fail（内容已在） |
| `git apply -3` | "Applied cleanly" 且 `git status` 零 delta = no-op |
| 刀面覆盖确认 | compilerCsgMemTrace 门控计量 47 处标记、parserForestReleasePending×6、B1 两阶段精确容量合并、B2a 延后 forest build 全部在位 |
| 本线源码 delta | **零**（刀已在树=交付态，故本线无 gen2r3_*.patch 交付，证据=锚 commit 3640b77e6+四轮烤机账） |

**blob 断代（考古情报，移交主线）**：38feddb3b(f900fa3cf) → ab86b8ce5(0bd4f0fd7) → 90b1a17c6(49019d25c) → 4fac10758(e78e3b7a6=a7d26bebf 提交态) → fc089902c(b205d145f=R2 刀前工作树版) → 345edb9a3(a5e688518=R2 刀后版)。共享树覆盖使 compiler_csg.cheng 在 4fac10758/fc089902c 两度回退到旧拷贝；**38feddb3b 的 knife 之外增量（relief 相序/intern75/快照文本共享的文件内部分）、ab86b8ce5 b3meta churn 刀文件内部分、90b1a17c6 type-decls/行池文件内部分、4fac10758 forest F1-F9 诊断、fc089902c BIGSRC-SPLIT 委托的文件内改动，均不在现文件**（4fac10758→现树 diff=403 行）。本线按「现主树状态=最完整基线」如实烤该态；是否追认/重落上述丢失改动归主线裁决。

## 三、实测账（四轮全同配方；b0 窗内有一次外部主树 rsi_gate 编译并发，k1/d1/k2 独跑核过）

| 轮 | tag | rc | wall | 树驻留峰 (MiB) | phys_footprint 峰 (MiB) | driver sha256 |
|---|---|---|---|---|---|---|
| 1 | baseline_b0 | 0 | 188s | 806.38 | 686.15 | e98be9ea… |
| 2 | gen2_k1 | 0 | 188s | 808.28 | 686.15 | e98be9ea… |
| 3 | diag_d1（env 门控诊断，产物字节不变实证） | 0 | 186s | 806.79 | 686.19 | e98be9ea… |
| 4 | gen3_k2 | 0 | 186s | 806.67 | 684.71 | e98be9ea… |

闭包硬参数（bake report）：230 源/640,446 行/decl origins 18,472/cold 前端函数 21,098/types 1,620/body ops 2,633,214/总函数 13,750；产物 170,321,408B（R2 刀态 170,304,992B，Δ+16,416B）。与 TA-MEM 模型口径（230 源/643,601 行/2.64M ops）同量级，模型适用性维持。

## 四、双达标判定

1. **GEN2 rc=0 在 900s 硬帽内** ✓（4/4 轮，186-188s，未抬帽；1GiB 防线零 trip）。
2. **峰 ≤768MiB 管理线**：按锚定义口径（编译臂）✓，按 guard 全树驻留峰口径 ✗——
   - 编译臂（768 锚的定义臂）：1s 采样器实测车头独占峰 686-703MiB（t≈90-95s 窗），低于锚带下沿 717MiB，**在锚带内**；fp 口径 684.7-686.2MiB（R2 刀态 715.4-718.5MiB，Δ≤+4MiB=树真实增量微）。
   - 全树驻留峰（R2 用的 guard 口径）：806.38-808.28MiB×4 轮（极差 1.9MiB，确定性瞬态），超锚 38-40MiB。
3. **GEN3 固定点** ✓：sha(b0)=sha(k1)=sha(d1)=sha(k2)=e98be9ea1972cfbb7b9ecc43a8715c919bd45e0ce668f53800a9e16c93f02471，四轮同配方同源字节 EQ。
4. **四夹具门** ✓：rc=0，`pass=4 known_red=0 stale=0`（ordinary 732,768 / call_fixture 692,946 / cold_nested 745,218 / v6 1,006,336 KiB，v6 贴 1GiB 帽内）；门自身 guard 全树峰 1,030,488,064B 未 trip。

## 五、768MiB 差值的峰窗边界图（.rebuild/run_gen3_k2/tree_curve.tsv，1s 采样）

| 时窗 | 构成 | 树驻留 |
|---|---|---|
| 0-90s | 车头编译臂独占（bind/profiles/metadata/forest/TypeArena） | 平台爬升至 ~686MiB |
| ~95s | 编译臂峰（车头独占） | **703MiB（编译臂真实峰，≤768 ✓）** |
| 95-180s | typed ir/facts/发射准备 | 缓落 |
| ~184s | **发射/链接窗：ld 495,024KB + 车头 228,032KB 并驻** | 采样 706MiB；guard 10ms 捕获确定性瞬态 806.7MiB（process_tree_peak_process_count=3） |

定性：807MiB 级树峰=产物链接子进程（170MB 产物的 cc/ld）与车头收尾并驻的**发射臂**瞬态，不在 768MiB 锚的定义臂（编译臂）内；TA-MEM 模型各相（§四）无对应刀项，模型 §二明示 LINKEDIT 负载窗漂移属环境面不入模型。R2 同口径先例：gen3_k2=807.88MiB 同值出现并按环境噪声入账。今日环境该瞬态确定性复现（4 轮极差 1.9MiB），非彩票抽样。**模型内无修点，按「不另起灶」红线不新开刀；如需压此峰，刀位在发射/链接编排（子进程串行化或 ld 换代），属模型外新刀，交主线立项裁决。**

## 六、门账与探针台账（.rebuild/gate_gen3_k2.log）

- 四夹具收官区与基线 tsv 逐列一致，rc=0。
- probe 区 4绿/5红/10stale vs m70c 认证栏（15:18 gate）4绿/2红/13stale：**判词文本 19/19 全同**；唯一差异=probe_tuple/probe_assert/probe_objctor 三件 STALE→RED 分类翻转。归因闭合：主树工作树未提交版 user_path_baseline.tsv 已将三件按判词前缀登记为已知红（grep 实证），本门命中登记→RED；m70c 门时点该登记未落→STALE。非 driver 语义漂移。红绿总数 15/19 恒等。
- 台账情报：probe 判词与 R2 刀态门（4绿/1红/14stale）存在 generic STALE↔RED 一件同类翻转，源=R2 树与本树驱动/夹具源差异，属树级既有台账态。

## 七、三方哈希

| 角色 | sha256 |
|---|---|
| 车头 cheng_cold_v2 | 7f731d4dfbaca2094097503b6a1af8456edd766daab05e3b225850b16e12c86c |
| GEN2/GEN3 刀态 driver（固定点×4） | e98be9ea1972cfbb7b9ecc43a8715c919bd45e0ce668f53800a9e16c93f02471 |
| 源聚哈希（src+bootstrap 排序逐文件 sha256 聚合） | 099b456294742cb0160470692f09858970074ac75107aa7ab3ecb6829df91dce |
| 锚 commit | 3640b77e6（=主树 345edb9a3+工作树全量） |
| R2 刀 driver（历史参照） | 56bc64e02dee520403b93b6497d742a79f3ca35dbc41fac447950a7eb43f885a |

## 八、纪律记录

- 全轮 900s 帽+1GiB 防线（beat_c guard），禁缓存四件套，冷缓存根每轮独立 run 目录；无抬帽、无假绿、rc 紧邻捕获。
- 主树代码零接触：主树仅新增本 VERIFY 文档副本（未跟踪文件，R2 先例）；源码/工具零改动。
- b0 窗内并发外部编译已标注；k1/d1/k2 独跑核过（进程表按二进制名核，pgrep -f 自匹配误报已排除）。
- 门轮与外部会话门循环并发跑（静窗不可得）：verdict 台账不受污染，RSS 列已在比对中剥离；门 rc=0 无 trip。
- 诊断轮 d1 证实车头（冷链 C 实现）不响应 CHENG_CSG_MEM_TRACE/CHENG_COMPILER_CSG_STDERR（分相打点为闭包源码面，车头执行面无此通道），分相定位改用自研 1s 树采样器完成。
- 考古发现（§二 blob 断代）涉及共享树覆盖丢刀嫌疑，已如实移交，本线未擅动。
