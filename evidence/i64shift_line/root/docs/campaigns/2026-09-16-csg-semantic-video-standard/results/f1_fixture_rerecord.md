# F1 夹具重录（修复后物理）+ manifest 基线哈希防线

日期：2026-09-20。前置：results/f3hub_snap_cid_triage.md（根因定谳：557e8e8d9 修复 1e9 门配 `<=` 只跑 1 扫潜伏 bug，9/17 夹具在坏轨迹上录制，worldCid 永久失配；factsCid 零漂移）。本任务：修复后物理（base pass 真 96 扫，`src/game/constraints3d.cheng:330` 门 `-1.0` + `Constraints3dIterations=96`）重录 f1_ball.svblock + manifest `x-` 基线防线。**未回退 557e8e8d9。**

判定：**绿**。f3_hub smoke rc=0 三臂全绿；两路负例演练（旧夹具缺键 / 基线失配）均报「夹具基线过期」而非裸 sv_snap_cid_mismatch。

## 1. 改动面（git diff --stat 全量）

```
docs/.../fixtures/f1_ball.svblock        | Bin 3035 -> 3129 bytes
src/apps/semantic_snapshot/main.cheng    |  11 ++++++-   (capture 探针+传参+回显)
src/game/assets/semantic_video/reader.cheng   |  2 ++    (manifest 解析 x- 键)
src/game/assets/semantic_video/schema.cheng   |  8 ++++   (SvManifestRec.xPhysicsBaseline 字段 + 条件发射)
src/game/assets/semantic_video/snapshot_block.cheng | 33 +++++ (探针常量/函数 + SvSnapshotBlockBuildWithBaseline)
src/tests/sv_f3_hub_smoke.cheng          |  13 ++++    (装载段基线对拍防线)
```

机制：规范 `docs/specs/csg-semantic-video-v0.1.md` §2 既有 `x-` 可选扩展键条款（读取端记录忽略），validator 原生放行（SvCheckKeys）。键名 `x-physicsBaseline`，canonical 键序排保留键后（'x'>'t'），空串不发射——既有全部夹具（b1/b2/f1 旧件）字节零影响。`SvSnapshotBlockBuild` 旧签名保留为委托包装（`sv_f1_snapshot_smoke` 两调用点零触碰）。

## 2. 基线指纹定义（录制端与消费端唯一同源）

`snapshot_block.SvSnapPhysicsBaseline(facts)`：同一 facts 从 tick 0 权威驱动（SvSnapDriveStartFromFacts，无 RNG/钟）到 `SvSnapBaselineProbeTick=8` 取 `World3dCid`（状态结构哈希域）。物理默认行为（base pass 门值/扫描数等）变更 → 探针值变 → 结构化判「夹具基线过期」。

## 3. 重录证据（capture 原文，scratch scope 内实测）

驱动命令：

```
artifacts/bootstrap/cheng.stage3 system-link-exec --root:<repo> \
  --in:<repo>/src/apps/semantic_snapshot/main.cheng --emit:exe \
  --target:arm64-apple-darwin --out:<scratch>/semantic_snapshot
<scratch>/semantic_snapshot capture --ticks 1200,2400,3600 \
  --out <scratch>/f1_ball.svblock --res-dir <scratch>/f1_res \
  --world artifacts/csg_world_video/csgworld/ballbalance.csgworld
```

输出（rc=0）：

```
mode=capture
ticks=1200,2400,3600
world=artifacts/csg_world_video/csgworld/ballbalance.csgworld
factsCid=538f3f61b26ecfe59dba02ebe5df68fa6356e590c94e2836e90de72e99e602b7
physicsBaseline=0127baf1324a74572ceb72654b012babd0f49da1b1ad290c5d1cbff5e9f2dea5
ckpt=ck-1200 tick=1200 payloadBytes=8444 worldCid=sha256:17ad0b24bbed2a9de37900d47955653ed62c026cd8a6acfd9a81e694690fd9d9 cid=a31ec47a820fe74f47906790f981e53f428129026f0d0909df1b827723a030ba
ckpt=ck-2400 tick=2400 payloadBytes=8444 worldCid=sha256:7079d189894be8c51f352d2c1fe21bda9edf9255c4a15e6650874bc955d99bf7 cid=c442385b74025006b08d548b2600faafed8417030f5a8a3fe09a536aa37b05f4
ckpt=ck-3600 tick=3600 payloadBytes=8444 worldCid=sha256:622f4fcee9384d9cfa6a6a314012616b3cd96b96efa78b473dddcabfd14e55b5 cid=be5ffc419d98454f7ff7dcd11e006bab5833c3301ff308e34d7931ae59c2d4da
factCount=10
contentId=sha256:f8ffef2d8a5abc40f6763e3935e00d95540b53e65b7af3d9b8078ed1df11a268
dirCid=sha256:547dfcf7704cdca56dcf2bce006bf80cc335eb826e63986fdc4fa87c78546d0d
blockBytes=3129
```

三重正确性锚全部命中：
1. **factsCid 逐字节等 538f3f61…**（事实域零漂移 = 重录正确的首要锚）。
2. **ck-1200 worldCid == triage 独立重推导值 17ad0b24…**（另一线程先验重推导，两链一致）。
3. **二次 capture 复跑 block 逐字节全等**（`rerecord_determinism=byte_identical`，cmp 实测）。

三臂 CLI restore：ck-1200 ahead 5 / ck-2400 ahead 3 / ck-3600 ahead 3 均 rc=0 且 `replayCid==decodedCid`、`replayCidMatch=1`。

### 新旧三臂对照（资源域 worldCid = payload 字节 sha256）

| ckpt | 旧（09-17，1 扫坏轨迹，已失效） | 新（09-20，96 扫合同轨迹） |
|---|---|---|
| ck-1200 | sha256:5d33ec215651bcae07546971be6b902712cda9c6a9f0a6ce8cce677ccaa5939b | sha256:17ad0b24bbed2a9de37900d47955653ed62c026cd8a6acfd9a81e694690fd9d9 |
| ck-2400 | sha256:3214f6750ae7ed61dfff93db7d5d7b55b52ee793724231f61ed967513bc65aac | sha256:7079d189894be8c51f352d2c1fe21bda9edf9255c4a15e6650874bc955d99bf7 |
| ck-3600 | sha256:a2ffc69a65a8a3c5aa3f04ccd00ae9c4d7455150517d20effc8101f5060ca0a6 | sha256:622f4fcee9384d9cfa6a6a314012616b3cd96b96efa78b473dddcabfd14e55b5 |

夹具：`docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/f1_ball.svblock`
旧 sha256 = `0175b22ce2fd5b3af16f27f466004f5c467c19e6fda2628409427b938b2fb19e`（3035 B）
新 sha256 = `d31b44c675af44b42e2e25bcc692fa4fe3700c3310819b6708e8716fe3e4a1bd`（3129 B；+94 B 即 x- 键行）

## 4. smoke 装载段防线（src/tests/sv_f3_hub_smoke.cheng）

f1 块装载 + factsCid 复现断言之后、快照 prep/直通驱动之前：读 `f1M.xPhysicsBaseline`，与 `SvSnapPhysicsBaseline(facts)` 现树探针值对拍。缺键或失配 → echo `sv_f3_hub_smoke FAIL: f1 fixture baseline expired (夹具基线过期（物理默认行为已变，请重录）)…` 并 rc=1，**先于** payload CID 判定，不再裸抛 sv_snap_cid_mismatch。

## 5. 转绿与负例演练（原文）

红签名复跑（改前现树，金丝雀 ordinary_zero_exit_fixture 编译/运行 rc=0 在案）：

```
 sv_f3 smoke: hgs verify-footage ok, query [0,200000) matched=6, seek 10000000 readahead_bytes=454624
 f1 pass-through run + verify-snap binding: check sv_snap_cid_mismatch
smoke_rc=1
```

负例演练 A（新 smoke × 旧夹具，缺键路，真实旧件触发）：

```
 sv_f3 smoke: hgs verify-footage ok, query [0,200000) matched=6, seek 10000000 readahead_bytes=454624
 sv_f3_hub_smoke FAIL: f1 fixture baseline expired (夹具基线过期（物理默认行为已变，请重录）): manifest x-physicsBaseline missing
drillA_rc=1
```

负例演练 B（临时伪造 recorded 基线 sha256:000…0 → 编译运行 → 还原 byte_identical → 复编译复绿；失配路）：

```
 sv_f3_hub_smoke FAIL: f1 fixture baseline expired (夹具基线过期（物理默认行为已变，请重录）) expected=sha256:0000000000000000000000000000000000000000000000000000000000000000 actual=0127baf1324a74572ceb72654b012babd0f49da1b1ad290c5d1cbff5e9f2dea5
drill_rc=1
```

两路均无 sv_snap_cid_mismatch 字样。演练后源码还原（cmp byte_identical）、重编译、smoke 复绿：

```
 sv_f3 smoke: hgs verify-footage ok, query [0,200000) matched=6, seek 10000000 readahead_bytes=454624
 sv_f3 smoke: f1 verify-snap ok (3 ckpts bound, payloadBytes=8444 each)
 sv_f3 smoke: f1 restore ck-1200 ahead 1000 replayCidMatch=1 (continuation 1000 ticks all equal pass-through)
 sv_f3 smoke: combined block ok (blockBytes=4323)
 sv_f3 smoke: combined chain segments ok (footage/query/seek/verify-snap/restore)
 sv_f3 smoke: negatives ok (corrupt-source/f1-as-footage/hgs-as-snap/ck-9999/payload-flip/payload-magic)
 sv_f3_hub_smoke ok
final_smoke_rc=0
```

## 6. 诚实边界

- 指纹探针 = tick 8 状态结构哈希，覆盖「tick 8 前已显形」的默认行为变更（本轮肇事类=base pass 门值/扫描数，逐 tick 生效，必然覆盖）；tick 8 后才显形的变更会穿透防线落到裸 cid_mismatch——防线按构造尽力，非全知。
- 录制时工作树含他 lane 在途脏改：`src/game/physics3d.cheng`（DUCK_DV_ECHO 诊断探针，注释与门控均为 echo-only 无物理读取）、`src/apps/vpn_proxy/vpn_proxy_main.cheng`（不在 smoke 编译闭包）。轨迹中性双重实证：ck-1200 与 triage 在更早树态的独立重推导逐字节一致 + 本任务双 capture 逐字节一致。constraints3d/semantic_video/snapshot 链本任务外零脏改。
- `.scratch/f1/f1_res` 旧 payload（1 扫代）已废：夹具不载荷 payload（消费端按 CID 绑定重推导），无需迁移。
- semantic_hub CLI 本体未接基线对拍（任务范围=smoke 装载段）；字段与探针已就位，hub 后续加同款对拍即可。
- 编译器=artifacts/bootstrap/cheng.stage3（08-31 冻结件），全流程 scratch scope（tools/cheng_scratch_scope.sh）内烤制运行，临时产物零留存。
