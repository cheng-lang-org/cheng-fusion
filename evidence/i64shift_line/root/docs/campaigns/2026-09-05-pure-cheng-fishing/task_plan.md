# 纯 Cheng 捕鱼任务表

状态：OpenSpec `apply`（A1 基线组实施中/本轮回执落卷）；游戏实现 B-F 未开始。

权威产品边界：`openspec/proposals/pure-cheng-fishing-game.md`。
详细开发计划：`docs/superpowers/plans/2026-09-05-pure-cheng-fishing.md`。
本表只跟踪本游戏，不改写仓库根目录其他战役的任务状态。

| 任务组 | files | action | verify | done |
|---|---|---|---|---|
| A 基线 | 正式规范、依赖清单、现有 game/quic/provider | 冻结真实编译入口、平台和能力缺口 | 当前源码 compile/run 与闭包回执 | [ ] |
| B 系统边界 | 拟新增 game platform/provider、shader 子集 | 纯 Cheng 启动、事件、GPU、音频、恢复 | 真机最小闭环与链接纯度 | [ ] |
| C 表现 | 拟新增 assets/render/animation/audio | 3D 资产、骨骼、粒子、UI、混音 | 可见、可听、生命周期对账 | [ ] |
| D 玩法 | game 基础模块、拟新增 apps/fishing | 鱼群、连续命中、炮台、Boss、积分 | 回放、边界、完整可玩场景 | [ ] |
| E 联网 | quic、拟新增 fishing server/store | 四人权威房间、幂等提交、重连 | 真客户端与故障注入 | [ ] |
| F 发布 | 拟新增验收工具、包清单、报告 | 优化、冻结、完整验收 | 设备和产物哈希绑定、全部门通过 | [ ] |

## 本轮文档任务

- [x] 回顾相关 lessons、Cheng 技能和正式规范。
- [x] 并行只读审计游戏/图形/网络/纯度边界。
- [x] 输出产品提案、任务分解、全局依赖图与证据。
- [x] 对文档做一致性检查和独立 Review；修正身份、时钟、幂等、shader入口及依赖。
- [x] 完成计划交付文件；实现任务保持未完成。

## A1 实施轮（2026-09-05）

- [x] 现场核实编译入口（`system-link-exec` 调用形）与三支载具（./cheng 自举编排器、bootstrap/cheng_cold C 车头、artifacts/backend_driver/cheng 共享纯链 driver）。
- [x] 规范迁移落地：冗余显式默认初始化 8 处（规范 §594，编译器硬错为正确行为）。
- [x] 现行借用契约迁移：ecs/physics2d/runtime 共 29 个只读函数补 `@borrows`；借用源显式共享改 Fmt 拷贝；托管结构体 move 拷贝改 @borrows 字段克隆（规范 §0.2/§67）。
- [x] 站点修：compiler_main.cheng bridge staging PathDirExists 假阴 → 直调 os.DirExists（★重案 631 家族，待自举重烤生效）。
- [x] 14 支最小复现探针 + 当日矩阵回执（VERIFY_a1_matrix.txt）。
- [x] capabilities.json（每项 已实测/未通过/不支持）。
- [x] fishing_platform_contract.cheng 正例合同 + 3 支负例夹具。
- [x] tools/fishing_gate.cheng baseline 阶段全实现，其余阶段 NOT_IMPLEMENTED 硬失败。
- [x] Android 设备实际回读（HUAWEI DCO-AL00 / Android 12 / arm64 / Vulkan 1.2 / Adreno 730）。
- [ ] done 判据未达：六 smoke 编译层 6/6 红跨两族墙（W-A1-1 跨模块 @borrows 准入、W-A1-2 staging 假阴）+ W-A1-4 SIGILL；负责模块=编译器链（kernel-userpath 战役热区），不承诺修复日期。双验收机冻结未完成（仅一台设备在线）。
