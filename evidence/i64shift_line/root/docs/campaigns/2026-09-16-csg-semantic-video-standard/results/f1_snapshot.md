# F1 快照语义块（S1）+ 恢复对拍（S2）结果

日期：2026-09-17。范围：f 闭环 S1/S2——活状态磁盘序列化、v0.1 snapshot 记录块构建、capture/restore CLI、进程内三恢复点对拍。纯 Cheng，无新语言栈。

> 2026-09-20 注：本文所记三臂 worldCid（5d33ec21…/3214f675…/a2ffc69a…）与 §5 的 World3dCid 值系「base pass 1 扫早退 bug（ee53b9202）」轨迹上录制，已由 557e8e8d9（96 扫修复）永久失效；夹具已用修复后物理重录并带 x-physicsBaseline 基线，现值见 results/f1_fixture_rerecord.md。

## 逐相内存影响（硬约束卡口径）

新结构 = 每检查点 payload（实测 8444 B ×3 ≈ 25 KB）+ 块字节（3035 B）+ 记录行数组；smoke 进程另有直通 CID 数组（4001 条 × ~71 B ≈ 280 KB）与 payload 拼接缓冲（25 KB），量级 KB–MB。无生产运行时增量：新模块仅被本阶段新入口（semantic_snapshot、sv_f1_snapshot_smoke）import，既有 8 smoke 同窗口复跑全 rc=0（见 §6），无逐相预算门触碰。

## 1. 交付文件

- `src/game/assets/semantic_video/snapshot_codec.cheng`（新建）：sv-snap.v1 二进制编解码。编码 174 个声明字段（固定序、小端、定宽），float64 经精确 IEEE-754 分解位级保真（仅有限值可编码，inf/nan 结构化拒绝）；字段切割 = 已证明检查点原语（World3dClone 清零 bodyF*、CsgExecutionSnapshot 清零事件/计数器），decode 重建同语义状态。
- `src/game/assets/semantic_video/snapshot_block.cheng`（新建）：共用确定性驱动（build→inject→setParams→setBallMode→tick，capture/restore 同一函数体）+ SvSnapshotBlockBuild（manifest/entity/observation/双 assertion/revision/3 snapshot/dependency 共 10 记录）+ 借用形态包装器。
- `src/apps/semantic_snapshot/main.cheng`（新建）：capture/restore CLI。
- `src/tests/sv_f1_snapshot_smoke.cheng`（新建）：S2 进程内对拍。
- `docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/f1_ball.svblock`（产物，3035 B）+ `.scratch/f1/f1_res/ck-{1200,2400,3600}.payload`（8444 B ×3，state_payload 资源，CID 绑定，b2/b3 媒体同模型）。

## 2. payload 字段清单（174 字段 = 两结构 + servo 全覆盖）

- World3d（68）：标量 8（instanceId、tick、count、nextEntityId、conCount、wallCount、ropeActive、ropeAnchorSlot）+ 体列 22（entityIds、generations、bodyKind 整列 + bodyPx/Py/Pz、bodyVx/Vy/Vz、bodyInvMass、bodyRadius、bodyAngVx/Vy/Vz、bodyQuatW/X/Y/Z、bodyIxx/Iyy/Izz、bodyCapsuleHalf 浮点列，范围 [0,count)）+ 约束列 31（conA、conB、conRest、conKind、conActive、conTarget、conAnchA/Bx/Y/Z、conAxisA/Bx/Y/Z、conRefA/Bx/Y/Z、conCmd、conGoal、conLimMin/Max、conMaxRate、conTauMax、conOmega0，范围 [0,conCount)）+ 墙列 7（wallCx/Cy/Cz、Hx/Hy/Hz、wallFriction）。
- CsgExecutionState（73）：整标量 14（mpPartCount、mpRopeNodeCount、stepCount、balBallEnableTick、dynFootStart、balOn、balPelvis/Chest/Head/FootL/FootRSlot、balBallMode/Slot/Armed）+ 浮标量 36（balChestOff×3、balHeadOff×3、balPelvisOff×3、balGain、balDamp、balCorrCapMps、balCapture{SpeedMps,StepLenM,Steps,LeadTicks,WindowTicks}、balBallRadius、balBallFootL/R Off×3+3、balBallPelvisOffX/Y、balBall{Gain,FootGain,Damp,CorrCapMps,TorsoCapMps,RollResist,Trim,TrimX,TrimY,UserLeanX}）+ chainCid + 数组 22（mpPartSlot、mpRopeNodeSlot、handGraspCon、graspNodeOfHand、jointOfPart、jointPeerSlot、legConOfPart、legPushing、lostGrace、footCon、footAnchor、footDone、dynFootPart/X/Y/Z/StartTick/EndTick/Rate/PlantLen、anchorFreeSlot、footConFree）。
- BallServoRigidState（33）：全部字段（ballSlot、torsoSlot、headSlot、armed、tickCount、trimComLo/Hi、contactGateOn/Seen/Tick、footL/RSlot、anchorOn 整列 13 + rampTicks、offX/Y/Z、k、c、linCapMps、linDampCapMps、kAng、cAng、angCapRadS、angDampCapRadS、trimRate、trimX/Y、contactDistM、anchorX/Y、anchorKp/Kd 浮列 20）。
- 刻意不编码（= 原语语义）：bodyFx/Fy/Fz（World3dClone 置零的步内草稿）；eventTick/eventKind/eventArg/eventCount、rejectedCount、graspOk/FailCount、releaseCount、graspLostCount、balCaptures（CsgExecutionSnapshot 归零）。缺字段=对拍必炸由 S2 门兜底。

## 3. S1 门证据

- validator PASS + 修订并存 + 重编码/重建逐字节相等：`sv_f1_snapshot_smoke` 内 `s1 gates: validator pass, revision coexists, rebuild deterministic`。asv-gen0（rev=0）与 asv-gen1（rev=1）块内并存，revision{supersedes=asv-gen0, targetUid=asv-gen1, oldRev=0, newRev=1} 指向成立，原记录不擦除。
- 同进程 decode→re-encode 逐字节相等（三恢复点各验证一次）；块重建两次 BytesEqual；smoke 块与 CLI fixture 块 `cmp` 逐字节相等（跨二进制确定性）。

## 4. S2 三恢复点对拍（进程内，直通 5000 tick 基准；基线 CID 落盘 .scratch/f1/passthrough_cids.txt）

> 2026-09-17 修订：直通终点按 S2 门严格口径从 4000 延长到 5000（世界 totalTicks=14400 内），三恢复点续跑窗口全部 ≥1000 tick；smoke 同窗口重跑全绿。

| 恢复点 | 快进重放 CID=直通 | decode 后 CID=直通 | 续跑窗口 | 逐 tick CID 一致 |
|---|---|---|---|---|
| ck-1200 | ✓ | ✓ | 3800 tick | ✓ 全部 |
| ck-2400 | ✓ | ✓ | 2600 tick | ✓ 全部 |
| ck-3600 | ✓ | ✓ | 1400 tick | ✓ 全部 |

另有：payload tick/stepCount 绑定断言、损坏拒绝两路（magic 翻字节 → `sv_snap_bad_magic` 结构化拒绝；数据翻字节 → 资源 CID 绑定拒绝）。

## 5. CLI 实跑（fixture f1_ball.svblock）

capture：`semantic_snapshot capture --ticks 1200,2400,3600 --out .../fixtures/f1_ball.svblock --res-dir .scratch/f1/f1_res --world artifacts/csg_world_video/csgworld/ballbalance.csgworld` → rc=0，factsCid=538f3f61…（与合同 ballbalance 一致），factCount=10，contentId=50767871…，dirCid=3774f3fc…，blockBytes=3035，三 ckpt payloadBytes=8444/8444/8444，World3dCid=c27c9a7d…/4316cf3c…/3157ee7b…。

restore ×3（2026-09-17 复跑，窗口延长版）：ck-1200+3800 / ck-2400+2600 / ck-3600+1400 均 rc=0，`replayCidMatch=1`（重放 CID == payload 解码 CID == capture 记录 CID），逐 tick `tick=<t> cid=<World3dCid>` 落 `.scratch/f1/restore_ck{1200,2400,3600}_5000.txt`，finalTick=5000/5000/5000，restore=ok。三份输出与直通基线 passthrough_cids.txt 同 tick 逐行 diff：**3800/2600/1400 行全部相等、0 mismatch**（S2 门"逐 tick World3dCid 全等"的 CLI 侧硬证据）。

## 6. 总绿（同窗口复跑）

`bash .scratch/f1/green.sh`（逐入口 `artifacts/bootstrap/cheng.stage3 system-link-exec … --emit:exe` 编译+运行）：
8 smoke（b1 roundtrip/negative/commit、b2 convert、b3 player、clockmap、time、**f1 snapshot**）+ 独立参考解码器 sv_ref_decoder + ordinary_zero_exit 金丝雀 = **10 pass / 0 fail**。

## 7. 工程备注（诚实边界与实现取舍）

- capture/restore 必须共享同一 facts 来源：实测 producer 原始 facts 与 .csgworld 量化回读 facts 的 factsCid 相同（538f3f61）但原始浮点有差，动力学 300 tick 内即分叉。故 capture 也从 .csgworld 加载（文件=分发权威），CLI capture 增加 `--world` 参数；fixture 以文件权威驱动重采。
- 载荷 bytes（state_payload 资源）不进块体：块只装记录，资源按 CID 绑定外置（b2/b3 媒体同模型），CLI 以 `--res-dir` 存取。
- CSGC 打包会重排块内行（实测 snapshot 三行序 1200/3600/2400）：消费端必须按 ckpt id 定位记录，不得按下标假设顺序。
- cheng_cold 兼容形态（未改共享源码，全部按借用注解先例解决）：BytesSliceView 结果（携带借用地址）直传 plain 未注解函数触发 "plain local copy requires an address-free value object"，经 @borrows 包装器（b3 SvSmVerifyChain 形状）解决；解码器重构为纯位置读取器（(data,at)→POD{v,next,failed}，无 var 变异链）后端到端稳定。I64 字段读写曾存在大小端不一致（写小端读大端），由列长严格校验当场暴露并修复；序列化大小端合同=小端。
