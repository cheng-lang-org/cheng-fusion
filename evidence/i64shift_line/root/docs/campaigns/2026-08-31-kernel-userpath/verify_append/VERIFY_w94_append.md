# wall94.VERIFY — cold_nested `exact def freeze: appended definition storage evidence missing op=26 slot=20` 墙死亡：r1 判词富化一烤钉死追加 def 形=owned 返回快照 runtime intrinsic Call（slot_name=#canonical_return_snapshot#owned#20），r2 契约对齐修法一烤穿墙（sync 证据道按 op kind 分道：Call 形经精确形状列继承地址编码源槽车道，同 TypeId 契约即本槽规范义务，UNKNOWN 不通行零弱化）；cold_nested 判词推进至 `cleanup_cfg: managed BodyOp consume authority invalid`（cleanup_cfg 领域=wall93 移交 probe1×w93 同位点，撞授权面停手完整移交）；ordinary 0/0、call_fixture 0/1、v6 车头 0/0 全不回归；烤机 2/3 轮

## 判定摘要

- **wall94 死亡**：A/B 同窗实证——w93 编 cold_nested rc=1 `appended definition storage evidence missing op=26 slot=20`（无 slot_name 旧判词）；w94b（改后）同输入该判词消失，推进至 `cleanup_cfg: managed BodyOp consume authority invalid`（cleanup_cfg.cheng:5421，授权外停手移交）。
- 主树仅改 src/core/analysis/exact_def_freeze.cheng（2 hunk：判词富化 + 证据道分道修法）；primary_object_plan.cheng 本线零改动（授权面内未需）。该文件 vs HEAD：apply 前 +31/−0（w86 导出 hunk 在树态）→ apply 后 +139/−7（本线净 +108/−7）。
- 补丁（vs HEAD 累积式，`git apply --check -R` 对当前树干净过）：终件 /tmp/oob_ab/wall94.patch（sha256=ffa5d93886e816023dc31c306f31d243402bd8762506f59f074ca2eb84b59ba1，172 行）；分件 r1=/tmp/oob_ab/wall94_r1.patch（318ac228ec9d10a75d62cb74051c7280647eb930f6ca8734ca13127d0099d26b，90 行）、r2=/tmp/oob_ab/wall94_r2.patch（408787a963d27a9bcd242219c83d5aa871eb0ec5ae68b9f410afb20aa38ba0f0，108 行）；临时仓链验证 head→r1→r2 逐段 cmp 与树态全等（R1-CHAIN-OK/R2-CHAIN-OK）。
- 车头：/tmp/oob_ab/cheng_w94（clang rc=0，bootstrap/cheng_cold.c，13 预存 C 告警与在树一致）sha256=52d0153d5b603dcd6cefcb0625655728c181dcbc2b5589f218e128b7964725af。
- 烤机 2/3 轮：r1=kernel_driver_w94（富化诊断轮）sha256=2aba2f2c1ebf2ecc6feb45c07bd856a2e0a79b8295a32717625584a2c020e3fa size=184870720；r2=kernel_driver_w94b（修法定案轮）sha256=0412d91ba83b8a34c8c760477865dc5568af946e3ca1e6e6bae719f2085c0939 size=184887136。

## 机理（富化判词一烤定案）

1. **追加 def 形（w94 富化判词实测）**：fn=0 op=26 op_kind=2(Call) slot=20 slot_name=`#canonical_return_snapshot#owned#20` slot_tk=3(STR)/sz=24/tid=13，fresh sentinel（place=0/origin=-1）——即 cleanup_cfg:11478-11552 owned 返回快照 runtime intrinsic 物化（managedStoreKind SNAPSHOT_RETAIN/CLONE，resultPassKind=SretResult，OwnMove）。
2. **病根**：ExactDefFreezeSidecarSyncAppended 证据收集按 CopyLocal 形设计（「物化 CopyLocal operands[0] 是唯一物理 source 证据」，sync 车道注释自述）；快照物化 Call 的 operands[0]=callOrdinal（call 行，非 slot），旧道把 16 误读槽域（`#nev5#str_literal_len#2`，src_storage=0）→ 证据洞 panic。probe1×w92 op=13 slot=11 同形（w93 移交判定「改前已在」正确），非 w93 引入。
3. **修法（发射/证据形对齐，非豁免非弱化）**：sync 车道按 op kind 分道——Call 形读 callSequence[operands[0]]，五列精确形状守卫（managedStoreKind∈{SnapshotRetain,SnapshotClone} + resultSlot==slot + resultPassKind==SretResult + argSlots/argPassKinds 各恰 1 + 地址编码）与生产契约 cleanupCfgRuntimeIntrinsicInterfaceCid（cleanup_cfg.cheng:746-790）逐列镜像后，继承地址编码源槽（CallArgSlotAddressId）的 recorded storage 车道。权威性论证：intrinsic 构建契约已查 arg/result 同 TypeId，storage 义务是 TypeId 纯函数（derive BodyIrExactDefStorageObligationForSlot）⇒ source 槽 recorded 车道=本槽规范义务（identity 冻结层「recorded 即规范义务」同裁定，TypeArena 窗不在冻结投影不重证）；形状列不全/源槽越界/UNKNOWN 原样 panic（evidenceLane 列入判词），零放行增量。非 Call 车道逐字保留。

## 门禁与验收实况（cwd=仓库根，RSS 帽零抬）

| 件 | 结果 |
|---|---|
| 秒级门（cheng_w94 编 exact_def_freeze --emit:obj，r1/r2） | rc=0 ×2 |
| 车头门（cheng_w94 编 zz_v6_w7） | compile rc=0 / run rc=0 |
| cold_nested × w94b | compile rc=1：**wall94 判词消失**，推进 `cleanup_cfg: managed BodyOp consume authority invalid`；maxrss=683,163,648B（651MB，836MB 帽内） |
| ordinary_zero_exit_fixture × w94b | compile rc=0 / run rc=0 不回归 |
| zz_call_fixture_w7 × w94b | compile rc=0 / run rc=1 契约预期不回归 |
| 探针 | 未启用（富化判词一烤取得全列，zz_probe_w94 未创建，src/tests 零残留） |

## 移交与遗留（完整移交包）

1. **下一墙（cleanup_cfg 领地，授权外停手）**：`cleanup_cfg: managed BodyOp consume authority invalid`（cleanup_cfg.cheng:5421 死点臂）——cold_nested 与 wall93 移交的 probe1×w93 同位点汇合，即 w93「probe1×w93 更后同域梯级」墙；该文件有内存线并行活动史，接力前先对齐树态。判词无取数列，接力先照 wall91/w94 先例富化。
2. **共享账本被清事件**：/tmp/oob_ab 于本窗口被并行线（cheng_now3/user_path_gate.sh，内存线）两度清空，borrow_fix.VERIFY.md 与历史 VERIFY/补丁顶层面文件丢失（目录与在产驱动幸存）；本节为 append 重建态，前史以各线报告与 /Users/lbcheng/cheng-patches/wall94/ 镜像为参照。本线产物镜像已存 /Users/lbcheng/cheng-patches/wall94/（bake 日志/sha256/C 链 dump）。
3. v6 按纪律只记录：车头 0/0 过；w94b 驱动侧 v6 未测（并行线 gate 长持锁 + v6 为 w87 线领地，非本线验收面）。

## 纪律执行

- 主树仅改 exact_def_freeze.cheng（授权面内，2 hunk）；primary_object_plan/其他线领地（cleanup_cfg/typed_expr/csg_core/regalloc）零触碰；编排者 user_path_gate.* 工作目录未动；未 git commit；烤机 2/3 轮；禁抬 RSS 帽；未启用降级/兜底/启发式补丁；产物集中 /tmp/oob_ab/w94/。
