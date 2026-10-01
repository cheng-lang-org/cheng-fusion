# F3 单一消费入口 semantic_hub 实测记录（f 闭环 S4）

日期：2026-09-17。范围：验证、恢复、播放、查询、证据回溯并入单一消费入口。纯 Cheng，未改任何既有文件（git status 确认仅新增）。

> 2026-09-20 注：本文 §4/§5 所记三臂 worldCid（5d33ec21…/3214f675…/a2ffc69a…）为 1 扫时代录制值，已由 557e8e8d9 失效（f3hub_snap_cid_triage.md）；夹具已重录（新值 17ad0b24…/7079d189…/622f4fce…），smoke 转绿，见 results/f1_fixture_rerecord.md。

## 1. 交付文件

- `src/apps/semantic_hub/main.cheng`（新建，768 行）：七模式 CLI（verify-footage / verify-snap / restore / query / seek / chain / --help），直接复用模块层导出（reader/validator/writer/source_index/snapshot_codec/snapshot_block + csgworld），缺的胶水（块验证链、快照 prep、payload 三重校验、tick 时基换算、seek/query/restore 行为）在 hub 内自实现，k=v 行输出，rc=0/1，任一失败结构化拒绝不降级。
- `src/tests/sv_f3_hub_smoke.cheng`（新建）：进程内独立复算 hub 行为合同（不 import hub），并构建 chain 用的合并块夹具。
- `docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/` 不动；合并块夹具落 `.scratch/f3/chain_hgs_ball.svblock`（4323 B，由 smoke 生成，见 §5）。
- 编译产物：`.scratch/f3/hub`、`.scratch/f3/sv_f3_hub_smoke`。

## 2. 编译命令（真实执行，两枚均一次通过或修复后过）

```
artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang --in:/Users/lbcheng/cheng-lang/src/apps/semantic_hub/main.cheng --emit:exe --target:arm64-apple-darwin --out:.scratch/f3/hub
artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang --in:/Users/lbcheng/cheng-lang/src/tests/sv_f3_hub_smoke.cheng --emit:exe --target:arm64-apple-darwin --out:.scratch/f3/sv_f3_hub_smoke
```

## 3. smoke（进程内）

```
$ .scratch/f3/sv_f3_hub_smoke
 sv_f3 smoke: hgs verify-footage ok, query [0,200000) matched=6, seek 10000000 readahead_bytes=454624
 sv_f3 smoke: f1 verify-snap ok (3 ckpts bound, payloadBytes=8444 each)
 sv_f3 smoke: f1 restore ck-1200 ahead 1000 replayCidMatch=1 (continuation 1000 ticks all equal pass-through)
 sv_f3 smoke: combined block ok (blockBytes=4323)
 sv_f3 smoke: combined chain segments ok (footage/query/seek/verify-snap/restore)
 sv_f3 smoke: negatives ok (corrupt-source/f1-as-footage/hgs-as-snap/ck-9999/payload-flip/payload-magic)
 sv_f3_hub_smoke ok
rc=0
```

覆盖：hgs 对 footage 链全绿 + query [0,200000) matched=6 + seek 10000000 → kf_pts=8000000 且 readahead_bytes=454624（与 B3 实测一致）；f1 对直通 3600 tick 逐 tick CID 基准 + 三检查点 payload 派生绑定 + restore ck-1200 续跑 1000 tick 逐 tick 与直通全等；合并块 validator PASS；六路负例结构化拒绝。

## 4. 真机逐模式（hgs 对 / f1 对）

```
$ .scratch/f3/hub verify-footage fixtures/b2_hgs.svblock src/tests/real_media_assets/hgs_faststart.mp4
mode=verify-footage
sourceCid=sha256:b6bbf35125c519964fa4a197cfa3708db7e9e2ee77504b9492e719e8cabccf6e indexCid=sha256:dcb7a7b341bb16c8214b39fe02919115c03290f4947c01779bd418da9df0559a
samples=675 keyframes=6 timescale=1000000 timeEnd=22500000
verifyFootage=ok
rc=0

$ .scratch/f3/hub query fixtures/b2_hgs.svblock hgs_faststart.mp4 0 200000
mode=query
sample=0 pts=0 offset=24121 size=27744 key=1
…（共 6 行, offset/size 左闭右开升序）
matched=6 bytes=59152
rc=0

$ .scratch/f3/hub seek fixtures/b2_hgs.svblock hgs_faststart.mp4 10000000
mode=seek
kf_pts=8000000 interval=[8000000,12000000) readahead_samples=61 readahead_bytes=454624 from_sample=240
rc=0

$ .scratch/f3/hub verify-snap fixtures/f1_ball.svblock artifacts/csg_world_video/csgworld/ballbalance.csgworld
mode=verify-snap
factsCid=538f3f61b26ecfe59dba02ebe5df68fa6356e590c94e2836e90de72e99e602b7
ckpt=ck-1200 tick=1200 payloadBytes=8444 worldCid=sha256:5d33ec215651bcae07546971be6b902712cda9c6a9f0a6ce8cce677ccaa5939b
ckpt=ck-2400 tick=2400 payloadBytes=8444 worldCid=sha256:3214f6750ae7ed61dfff93db7d5d7b55b52ee793724231f61ed967513bc65aac
ckpt=ck-3600 tick=3600 payloadBytes=8444 worldCid=sha256:a2ffc69a65a8a3c5aa3f04ccd00ae9c4d7455150517d20effc8101f5060ca0a6
verifySnap=ok
rc=0

$ .scratch/f3/hub restore fixtures/f1_ball.svblock …/ballbalance.csgworld ck-1200 5
mode=restore
ckpt=ck-1200 tick=1200
factsCid=538f3f61b26ecfe59dba02ebe5df68fa6356e590c94e2836e90de72e99e602b7
replayCid=c27c9a7def381ba72733dd244130ed62fd246182a3e3e1332af0728d7bb73f87
decodedCid=c27c9a7def381ba72733dd244130ed62fd246182a3e3e1332af0728d7bb73f87
tick=1201 cid=d3f0b7867a60d899dba9438ec65e5990b30cb3087e95d831af48a4aa2eb52f6e
…（逐 tick cid 行）
tick=1205 cid=22777024edd27c3183a3f539db28188c127339a7e87c668d8a9599e827d12fd4
finalTick=1205
replayCidMatch=1
rc=0
```

## 5. chain 全链真机原文（rc=0，末行 chain=ok）

chain 要求块同时携带 footage（video_sample+index）与 snapshot（state_payload）两族资源；既有夹具各自只有一族，故由 smoke 用 writer/snapshot_block 公开导出构造合并块 `.scratch/f3/chain_hgs_ball.svblock`（hgs 的 manifest/2 实体/7 观测原样并入 + 快照侧实体/观测/双 assertion/3 snapshot/dependency/revision；快照记录 tick 按 240→1000000 时基整除换算 1200/2400/3600 → 5e6/1e7/1.5e7，manifest 恰 1 条，validator PASS）。

```
$ .scratch/f3/hub chain .scratch/f3/chain_hgs_ball.svblock \
    src/tests/real_media_assets/hgs_faststart.mp4 \
    artifacts/csg_world_video/csgworld/ballbalance.csgworld \
    ck-1200 20 4000000 4200000
seg=verify-footage
mode=verify-footage
sourceCid=sha256:b6bbf35125c519964fa4a197cfa3708db7e9e2ee77504b9492e719e8cabccf6e indexCid=sha256:dcb7a7b341bb16c8214b39fe02919115c03290f4947c01779bd418da9df0559a
samples=675 keyframes=6 timescale=1000000 timeEnd=22500000
verifyFootage=ok
seg=verify-snap
mode=verify-snap
factsCid=538f3f61b26ecfe59dba02ebe5df68fa6356e590c94e2836e90de72e99e602b7
ckpt=ck-1200 tick=1200 payloadBytes=8444 worldCid=sha256:5d33ec215651bcae07546971be6b902712cda9c6a9f0a6ce8cce677ccaa5939b
ckpt=ck-2400 tick=2400 payloadBytes=8444 worldCid=sha256:3214f6750ae7ed61dfff93db7d5d7b55b52ee793724231f61ed967513bc65aac
ckpt=ck-3600 tick=3600 payloadBytes=8444 worldCid=sha256:a2ffc69a65a8a3c5aa3f04ccd00ae9c4d7455150517d20effc8101f5060ca0a6
verifySnap=ok
seg=restore
mode=restore
ckpt=ck-1200 tick=1200
factsCid=538f3f61b26ecfe59dba02ebe5df68fa6356e590c94e2836e90de72e99e602b7
replayCid=c27c9a7def381ba72733dd244130ed62fd246182a3e3e1332af0728d7bb73f87
decodedCid=c27c9a7def381ba72733dd244130ed62fd246182a3e3e1332af0728d7bb73f87
tick=1201 cid=d3f0b7867a60d899dba9438ec65e5990b30cb3087e95d831af48a4aa2eb52f6e
tick=1202 cid=0c414c878237122b5ab038880f7e95595ca20c709cd8d4c041df1e8e97165bf4
tick=1203 cid=f57341489ad210af1277b829599228436af77c0d9af03f80f02fe9a8c5074fc3
tick=1204 cid=a5be5d50ace17cf9425f42af58857313d38958457f607152405d3673ff4d2ea8
tick=1205 cid=22777024edd27c3183a3f539db28188c127339a7e87c668d8a9599e827d12fd4
tick=1206 cid=d2912ff9550795e930b4786a11aea2af6b98addc64bd430abad0abd021eba815
tick=1207 cid=6dc601c9eba0dbb0f1ef4fb02ce11fa0c8043264fc942b3e2bd66826953468ed
tick=1208 cid=2568951dc99813d3318ac403c312de1c3f1c05ccd82d99add9f04840343686d1
tick=1209 cid=4416c71ffeb97942e36aebee77289e025aac230cfd3c94ef4956935944a802f0
tick=1210 cid=b9f9a71a05eacd71d5b88c603ccbc1b009a5a2415742313c0473b6543a14450e
tick=1211 cid=cc04d98a7846e9fede151e4624b562c18a25c0308fb16203c77788a05836bd62
tick=1212 cid=6e0cab7219884f99a5470d8bfd4d28594c3dffa7546eb4c2c1473512b7f6878a
tick=1213 cid=d06d25853e73b7b8e73028a0f710f850a2e3dea7bf30bed7701b6c836e7af57e
tick=1214 cid=209e9afcec33049092790500da8773f8e25b87d94298fb4543bffebaa3f876e4
tick=1215 cid=cb25df0a37254ac06e09c8f08b8a401f1e9086deaef75e45b145820ba15dbf2a
tick=1216 cid=d152bab5151c0fb86c02b2d7c4a31a2a6478094375b19bbb58f2e9c1604a74af
tick=1217 cid=5c68c55cb55a692c5fa3d6d239eb8a41ded55cc85d691bfe97a6ca7000d757d4
tick=1218 cid=74c80015e985eb46955756fc1f40c86a979991f4bc2781c15015afa844e99a1e
tick=1219 cid=9a40ce48a053c6b663f3c844e3bf5a9052772e42b3d9ed224bad5fcce13408e0
tick=1220 cid=18afd6b2d6073fe2cc3e78293bad8c58f5a25d349b762e0652bfdd4ca41bf94c
finalTick=1220
replayCidMatch=1
seg=query
mode=query
sample=120 pts=4000000 offset=1164028 size=31232 key=1
sample=121 pts=4033333 offset=1195975 size=5200 key=0
sample=122 pts=4066667 offset=1201533 size=7040 key=0
sample=123 pts=4100000 offset=1208994 size=6992 key=0
sample=124 pts=4133333 offset=1216864 size=9040 key=0
sample=125 pts=4166667 offset=1226245 size=6208 key=0
matched=6 bytes=65712
seg=seek
mode=seek
kf_pts=4000000 interval=[4000000,8000000) readahead_samples=1 readahead_bytes=31232 from_sample=120
chain=ok
rc=0
```

（以上为 .scratch/f3/chain_out.txt 全量 53 行原文，五段依次 rc=0。）

## 6. 负例（真机，各模式结构化拒绝 rc=1）

```
verify-footage + 源翻字节      → semantic_hub error: sv_cid_malformed source expected=sha256:b6bbf351… actual=sha256:bb6ab62d…  rc=1
verify-footage + f1块当footage → semantic_hub error: sv_res_type_mismatch                                        rc=1
verify-snap   + hgs块当snap    → semantic_hub error: sv_snap_no_snapshots                                        rc=1
restore       + ck-9999        → semantic_hub error: sv_snap_ckpt_unknown ck-9999                                 rc=1
verify-snap   + 错配world(climb)→ semantic_hub error: sv_snap_facts_unbound ck-2400                               rc=1
```

smoke 进程内另有：payload 数据翻字节 → 资源 CID 绑定拒绝；magic 翻字节 → SvSnapDecode 结构化拒绝。

## 7. 同窗口复跑绿

`sv_f3_hub_smoke` rc=0；相邻既有 smoke 同窗口复跑：`sv_f1_snapshot_smoke` rc=0、`sv_b3_player_smoke` rc=0（本任务零共享源改动，无回归面）。

## 8. 工程备注（实现取舍与教训）

- **两套 CID 域不可混**（本轮实测踩坑后修正）：`snapshot.worldCid`/`manifest.resCid` 是 payload **字节** sha256（资源域）；`World3dCid(w)` 是状态**结构**哈希（状态域）。hub 校验合同：派生 payload 资源 CID == worldCid 字段；SvSnapDecode 后的 `World3dCid(decoded.w)` == 采集/重放状态 CID（restore 即 replayCidMatch）。二者永不相等，首版误把解码 CID 对资源 CID 即被门拦下。
- **payload 无需 res-dir**：verify-snap/restore 的 payload 由共享确定性驱动（SvSnapDriveStartFromFacts/SvSnapDriveTick）从 bound csgworld 重推导，F1 已证与 capture 侧逐字节一致；资源 CID 绑定即证明块↔世界一致。
- **时基换算**：validator 强制全部记录 tb 与 manifest 一致；合并块以 footage 时基（1/1000000）为主时基，快照记录 tick 按整除换算（driveTick = tick*240/tbDen，非整除即结构化拒绝），hub 消费端同规则逆换算。
- **诚实边界**：像素呈现依赖渲染/解码路径现状——仓内无 H.264 解码桥，hub 消费记录时间轴 + 证据锚（按索引 offset/size 绑定源字节）+ 快照恢复链（sv-snap.v1 payload），--help 内已声明。
