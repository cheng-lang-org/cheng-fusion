# 立项：世界 B1 世界 CSG Producer 最小实现

日期：2026-09-07。状态：propose（待用户确认后进入 apply）。归属：`2026-09-06-csg-semantic-physical-world-video.md` 主计划 B1（事实与准入），本立项细化其最小实现切面。

## 1. 目标

用纯 Cheng 实现最小世界 CSG producer→validator→materializer 通路，使资产管线产出的观测/资产对象（B2 观测、B1 媒体、C1 GLB）成为**可执行世界事实**，而非孤立数据文件。这是"存量视频转 CSG 世界视频"链条中"世界生产"一环的最小闭环。

## 2. 最小范围（files/action/verify/done）

| 项 | 内容 |
|---|---|
| files | `src/game/csg/{schema,producer,validation}.cheng`（拟新增，单一 owner） |
| action | ① `world.entity`/`world.timeline` 两类事实 schema（复用 csg_core canonical JSON + SHA-256 CID + Merkle admission，零新协议）；② producer：把观测对象（observation CID、关键帧时间线、源字节 CID）投影为世界事实行；③ validator：事实行逐条类型/引用/单调性校验（复用 csg_core validator 原语）；④ materializer：按时间线物化为可枚举世界状态 |
| verify | 相同输入两次生产字节一致；未知 kind/坏引用/非单调时间线拒绝；与 csg_core 准入链对接（no-replace） |
| done | producer→validator→materializer 三段在当前可用编译器上车全绿，正反例齐 |

## 3. 依赖与边界

- 依赖：本管线 A2 commit/observation（已绿）；上游 csg_core（外部依赖，单 owner）。
- 边界：不含物理/控制/渲染（主计划 C/D）；不含 USD/重建（E/F）。
- 工作量估计：2–4 人日（schema 投影+三段接线，复用率高）。

## 4. 验收

最小世界 = 一条源视频时间线（如 VFR 样例 48 样本/26112 tick/1 GOP）物化为 48 个可枚举状态帧的事实序列，producer 输出与 validator 通过集字节一致，materializer 可按 tick 重放枚举。
