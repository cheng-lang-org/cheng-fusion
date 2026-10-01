# T-G 像素层画质门补强：全帧 A/B（5000 tick 全程渲染 vs 三恢复点续跑渲染）

日期：2026-09-19。基点：f_loop2 克隆 HEAD `58a0bca79`（dual-role + 泵门 + send 修复与
semantic_video 全模块在树）。判词先行：**PASS——直通臂 5000 tick 每 tick 渲染一帧
（5001 帧），三个恢复臂 ck-1200/2400/3600 各自续跑渲染至 5000，7803 对同 tick 帧
SHA-256 全部逐帧相同（mismatched=0）；每臂一个真字节级 spot check（双侧重烤）
3/3 byte_equal（first_diff_offset=-1，mad_sum=0，2,764,816 B/帧）；全部跨臂 CID
断言零触发；rc=0。** 恢复确定性从状态全等（F-H3 以来 CID 逐 tick 全等）传递到
像素全等成立。

## 1. 判据（先冻结后测量）

- 主判据：恢复臂在 tick T 渲染的帧 == 直通臂同 tick 帧；逐帧 SHA-256 + 跨臂
  World3dCid 同录；任何一帧差 = FAIL。
- FAIL 诊断通道：确定性重放双侧重现该 tick 真字节，报首差偏移与 MAD（本轮未触发）。
- 字节级加固：每臂在 ck 帧（1200/2400/3600）做一次真字节 spot check——直通侧
  fresh 重放渲染的帧 SHA 必须等于直通臂在案哈希（渲染器跨世界自重渲染一致），
  双侧 PPM 字节逐字节比较。
- 门强度：直通臂 5001 帧哈希必须非全同（防 §20 发现一的静止不动点弱门）。

## 2. 对比结果

- 直通臂：5001 帧（tick 0..5000，每 tick 一帧），**distinct 哈希 4981**（场景逐
  tick 演化，门为强门；少量重复合计 20 帧系毫米量化渲染态在相邻 tick 重合）。
- 快照 payload：3 件各 8,444 B（SvSnapEncode @ tick 1200/2400/3600）。
- factsCid=`538f3f61b26ecfe59dba02ebe5df68fa6356e590c94e2836e90de72e99e602b7`
  （与 §20 / ball_film manifest 同值）。

| 臂 | 对比窗（帧） | compared | mismatched | 结果 |
| --- | --- | --- | --- | --- |
| ck-1200 | 1200..5000 | 3801 | 0 | 全等 |
| ck-2400 | 2400..5000 | 2601 | 0 | 全等 |
| ck-3600 | 3600..5000 | 1401 | 0 | 全等 |
| 合计 | （≥1200 每个 tick ≥1 次覆盖，≥2400 ≥2 次，≥3600 3 次） | **7803** | **0** | **PASS** |

- 覆盖口径：直通臂另含 0..1199 基线帧（无恢复对照对象）。

### 2.1 §20 同构采样行（12 行，sha 前 8 位）

| ck | tick | 直通 | 恢复 | identical |
| --- | --- | --- | --- | --- |
| 1200 | 1200 | 6999c93d | 6999c93d | 1 |
| 1200 | 1201 | c0c554cb | c0c554cb | 1 |
| 1200 | 1300 | 7e08a82b | 7e08a82b | 1 |
| 1200 | 1600 | 0d68722e | 0d68722e | 1 |
| 2400 | 2400 | 71aea0dd | 71aea0dd | 1 |
| 2400 | 2401 | 61b53b27 | 61b53b27 | 1 |
| 2400 | 2500 | 358fa144 | 358fa144 | 1 |
| 2400 | 2800 | ca99e49c | ca99e49c | 1 |
| 3600 | 3600 | 9136dac9 | 9136dac9 | 1 |
| 3600 | 3601 | a117ac35 | a117ac35 | 1 |
| 3600 | 3700 | 06f9cb81 | 06f9cb81 | 1 |
| 3600 | 4000 | 1ded8062 | 1ded8062 | 1 |

### 2.2 真字节 spot check（每臂 ck 帧，双侧重烤）

| ck | byte_equal | first_diff_offset | mad_sum | bytes |
| --- | --- | --- | --- | --- |
| 1200 | 1 | -1 | 0 | 2,764,816 |
| 2400 | 1 | -1 | 0 | 2,764,816 |
| 3600 | 1 | -1 | 0 | 2,764,816 |

### 2.3 零触发断言面

factsCid 可复产 ×3、replay CID==直通 @ck ×3、decoded CID==直通 @ck ×3、payload
tick/stepCount 绑定 ×3、decode→re-encode 字节恒等 ×3、续跑逐 tick World3dCid
A/B ×7803——全部零触发（触发即 assert 硬停）。

## 3. 渲染链（§20/T-A 同链照抄）

`RenderStateSave(w, roles, st.txt)`（roles=ball_film 冻结 7 角色序，facts.partRole
语义角色表查得）→ `RenderStateLoad`（毫米量化文本回读）→ 相机=**被渲染 RenderState
内球心的纯函数**（球心+固定偏移 −2.8/+2.4/+1.6，look-at 球心，focal 750；去平滑，
跨臂同构无历史依赖）→ `RasterMake(1280,720)` → `RasterGround` →
`RenderRopeState` → `RenderCharacterState` → 逐 BallRigid 体
`RasterSphere(205,120,35)`（DrawBallState 同款）→ `RasterWritePpm` → 盘上回读
→ SHA-256。帧=2,764,816 B（P6 头 16B + 1280×720×3）。世界驱动=**F1 共享驱动**
`SvSnapDriveStartFromFacts`（build→注入球→setParams→setBallMode，无 RNG 无钟）+
`SvSnapDriveTick`，恢复侧=重放快进→payload `SvSnapDecode` 覆写→续跑。
`Contacts3dSelfCollisionSet(1)` 照抄开启（缺省 0 = 静止不动点弱门，§20 发现一；
本轮直通臂 4981/5001 distinct 再次实证）。

## 4. 门禁与改动面

- 金丝雀 2/2：`tg_two_line_canary`（两行源）+ `ordinary_zero_exit_fixture`，编译
  rc=0 + 运行 rc=0 各二。
- 工具链：`artifacts/bootstrap/cheng.stage3 system-link-exec --emit:exe
  --target:arm64-apple-darwin`；驱动编译 8.1s；运行 wall ≈55 min（12804 次光栅
  + ~20000 authority tick + 20020 次 SHA）。
- 改动面：**主树 src 零改动**（仅自主树只读拷入克隆缺位的
  `artifacts/csg_world_video/csgworld/ballbalance.csgworld`，§16.2/§20 在案同形
  夹具补齐）；克隆内新增 `src/tests/sv_pixel_gate.cheng`
  （sha256 `ff9eeada…36417e`）与 `src/tests/tg_two_line_canary.cheng`。
- 绑定：世界文件 sha256 `b444f023…5a2ff026`；门 exe
  `.scratch/ta/sv_pixel_gate`（10,096,704 B，sha256 `a86cc7a9…639c06`）。

## 5. PPM 留证（人工复核）

`.scratch/fi2/f_loop2/.scratch/ta/ppm/`：9 件（direct × t1201/2401/3601、
ck1200 × t1201/2401/3601、ck2400 × t2401/3601、ck3600 × t3601），每件
2,764,816 B、P6 头 `P6\n1280 720\n255\n`；盘上 `cmp` 跨臂两两 5/5 identical。
运行全录：`.scratch/fi2/f_loop2/.scratch/ta/gate_run.log`。
