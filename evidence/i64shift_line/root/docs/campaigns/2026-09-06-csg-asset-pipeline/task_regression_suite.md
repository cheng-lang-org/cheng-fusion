# CSG 资产管线一键回归套件

`tools/csg_full_regression.sh`——任何组件改动后一键跑全链，每步输出 `PASS/FAIL/SKIP step_N` 带计时，末行输出全链汇总。

## 用法

```bash
tools/csg_full_regression.sh --quick   # 核心三步, 实测 3.4s (<10s)
tools/csg_full_regression.sh --full    # 全量 12 步, 实测 333.4s
tools/csg_full_regression.sh           # 缺省 = quick
```

- 判据 = **退出码 0 + 各步专属哨兵串**（所有探针均为 assert 崩溃式 Let-it-crash，哨兵防"退出 0 但静默跳过"）。每步日志落任务级临时目录，命令退出即删，不伪造、不跨任务保留。
- 退出码：全 PASS（含 SKIP）= 0；任一 FAIL = 1。

## 步骤与实测耗时（2026-09-13 实跑）

| step | 内容 | 工具 | quick | full 实测 |
|------|------|------|:---:|---:|
| step_1 | 打包校验 25 项（qp0 BITEXACT 锚/qp10 带界/负例） | `campaigns/tools/ssm1_parse_check.py --v2` | ✓ | 0.8s |
| step_2 | MES1 流式协议 roundtrip（双向编解码/二次解码确定性/反向重打包 ≡ 原容器） | `tools/csg_mes1_stream.py` | ✓ | 0.5s |
| step_3 | 物理逆向受控实验三判据（g≤5%/e≤10%/轨迹 MAD≤2px） | `tools/csg_phys_inverse.py` | ✓ | 0.8s |
| step_4 | 打包一致性 v1 包 vs batch_depth_runner 产物（逐字段往返/时间定位/seek） | `ssm1_parse_check.py <stream.ssm1> --report --input depth/` | | 0.2s |
| step_5 | warm-start GT × MES1 组合（3 变体可逆 + 播放 MAD≤12 门） | `tools/csg_ws_mes1_combo.py` | | 10.3s |
| step_6 | OBB 序列 OBS1（roundtrip 可逆校验 + 体积账三层账） | `tools/csg_obb_sequence.py` | | 34.6s |
| step_7 | 时序一致深度三档 M10（8 变体 frame0 锚定 + roundtrip 守卫） | `tools/csg_temporal_depth.py` | | 192.6s |
| step_8 | disocclusion 三策略填充（identity 逐位自检 + 锚值） | `tools/csg_disocclusion_fill.py` | | 5.2s |
| step_9 | 语义分割辅助（结构区覆盖率 + 前景纯度，deeplabv3） | `tools/csg_semseg_probe.py` | | 7.2s |
| step_10 | 单镜头混合表达产线（RANSAC→OBB→warm-start→MES1→FGS0） | `tools/csg_lens_pipeline.py` | | 73.4s ✗ |
| step_11 | CSG 求值渲染对拍（场景图掩码逐位 + 225 帧恒等渲染） | `tools/csg_render_eval.py` | | 7.8s |
| step_12 | demo_sskk 秒发秒开四段（源片→打包→传输秒开→真包播放） | `campaigns/tools/demo_sskk.sh` | | SKIP |

素材：`artifacts/csg_asset_pipeline/huguangsheng/`（v2 包 + pack v1 + depth 批次 + run10fps npy）。v1 包校验的 `--input` 是 `depth/`（9-11 批次，与 v1 包同期），不是 `v2/run10fps`——用错会 D3 逐位 FAIL。

## 当前全链状态（2026-09-13）

```
FULL CHAIN: FAIL  (failed: step_10; skipped: step_12; 累计 333.4s)
```

- **step_1–9, 11 全 PASS**（10/12）。
- **SKIP step_12**：demo 依赖 cheng-f24 anchor_clones 三个外部二进制（pack_verify/ssm1_opensmoke/playback_probe.exe），当前未构建。脚本自动探测，在位即真跑（哨兵 `ALL 4 SEGMENTS PASS`）。

## 已知红项：step_10（lens 产线）——归档 ref 过期，非代码回退

现象：`byte_anchor` 在 `m9d_scene_v1_obb` 上 assert 失败（新产物 18112B ≠ 归档 ref 18111B）。

根因（两个独立见证互证）：
1. `tools/csg_box_merge.py` 2026-09-13 04:03 改动；归档参考物 `boxmerge/scene_frame0_v1.json` 是 09-12 15:19 旧代码产物；lens 产线上次全绿运行在 09-13 03:21（早于改动）。
2. `csg_obb_sequence.py`（step_6，独立重算）输出 `ANCHOR m9d_stale_artifact RECORDED 过期产物差异 [(0,0.0067),(1,32.22),(2,26.73),(3,2.37),(4,41.07)]`；step_10 新产物与归档 ref 的 box 中心差 √Δ 实测 = 0.007/32.3/26.7/2.4/41.1，逐盒吻合 → 新代码两处一致，归档 ref 单独过期。

修复路径（本套件范围外，需单独执行）：重跑 m9d 探针刷新 `boxmerge/scene_frame0_v1.json` 归档参考物（或按 box_merge 改动意图判定新参考物），step_10 即转绿。**不得**为转绿放宽 lens 的逐字节锚。

## 记账口径说明（非门禁、如实落账的项）

- step_7 M10 对照表所有变体 `VOL-FAIL`（k225 > 150KB 预算）为工具自身质量账目，step 判据 = 8 变体 ANCHOR + 守卫全过（exit 0），不受其影响。
- step_6 可逆校验事件帧误差≈0（机制正确）、非事件帧差距来自 GT 逐帧运动，工具已归因落账。
