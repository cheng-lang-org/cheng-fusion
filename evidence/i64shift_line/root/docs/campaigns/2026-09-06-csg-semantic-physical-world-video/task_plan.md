# CSG 语义物理世界视频任务表

状态：`apply`（A1/A2、B 全链、C1 解析门、E1 v0 已落地；C2 上升幅度、D1/D3 完整线、E 段完整验收与 F/G 未完成）。完整定义见 [开发计划](../../superpowers/plans/2026-09-06-csg-semantic-physical-world-video.md)。本表只跟踪本任务，保留仓库其他战役的任务状态。

## 规划交付

- [x] 回顾 lessons、Cheng 技能与现有 CSG/游戏/视频计划。
- [x] 并行审查架构复用、语义物理映射与验收漏洞。
- [x] 创建具体提案、计划大纲和独立工作记录。
- [x] 填完阶段、文件/行动/验证/完成条件、依赖和资源估算。
- [x] 更新全局导航与流程图。
- [x] 独立 Review、链接与一致性检查并交付。

## 实施任务

| 任务组 | files | action | verify | done |
|---|---|---|---|---|
| A1 基线 | stage3 能力探针（int64/float64 SoA/sha256/二进制写/递归开方） | stage3 纯 cheng 编译器六项既有 game smoke 全绿；backend_driver CSG 管线报 parser-owned global coverage mismatch（复现：任一 import ecs 的源），归 compiler 主线，本任务改用 stage3 通道 | [x] 每项已测，阻塞已记录 | [x] |
| A2 合同 | [csg-world-contract](../../csg-world-contract.md)、[solver-decision](solver-decision.md)、[assets](assets.md) | 冻结单位/时间/身份/求解方法/资产；步内恒力精确积分（自由落体机器精度） | [x] 数值路线实测校准 | [x] |
| B1/B2/B3 世界CSG | `src/game/{time,world3d}.cheng`、`src/game/csg/{schema,validation,producer,materializer,execution,numerics}.cheng` | producer→validator（负例拒绝码）→materializer→2400 tick 执行→链式回执；身份代际/事务回滚/发散守卫（残差门 10mm+4096 精化） | [x] 实际状态变化+质量/动作窗/越界负例+双跑字节级确定 | [x] |
| C1/C2 动力学与控制 | `src/game/{constraints3d,contacts3d,rope3d,physics3d}.cheng` + execution 控制器 | 绞盘-上升器攀爬模型：交替抓握/收绳/蹬腿；Verlet-PBD 速度更新 | [x] 自由落体 0.000mm、落地、悬挂、摆 4 案例（`src/tests/csg_world_physics_cases.cheng`）；[ ] 质心净上升 361mm < 500mm 目标 | [ ] |
| D1/D2/D3 画面与媒体 | `src/game/render/cpu_raster.cheng`、`src/game/cinema/camera.cheng` | CPU 光栅（平面 ray-cast+球 impostor+Lambert）→ PPM 帧流；三机位验证帧 | [x] 240+120 帧实际渲染；[ ] D1 完整角色美术、D3 音频/MP4 封装未接线 | [ ] |
| E1/E2/E3 十秒闭环 | `src/apps/world_cinema/main.cheng`、`src/tools/csg_world_video_gate.cheng`、`src/tests/csg_world_incremental_check.cheng` | 正常片 240 帧+检查点(1700)卸绳干预片+因果指标+manifest；E2 检查点保真+编辑传播全绿；gate 编译运行全部门禁+电影双跑确定性 | [x] E2 增量对拍全绿+COM 上升 810mm≥500mm+干预弹道 0.000mm；[ ] E 段完整视觉审查 | [x] |
| F1/F2 整片与生产 | 未开始 | 60–90 秒成片、生产权威链 | 未开始 | [ ] |
| G1/G2 计算扩展 | 未开始 | GPU 同语义执行、可验证模型候选 | 未开始 | [ ] |
