# Cheng GUI：纯 Cheng 高性能 GUI 框架设计

状态：**propose**（2026-06-13；cheng-gui-kernel.md 的 K1/K3 实战成果与全部性能实测数字是本设计的输入）。

## 一页结论

一个 retained 场景树 + 反应式状态内核 + 增量帧管线的纯 Cheng GUI 框架。渲染层沿用已实测达标的 GPU 合成管线（68-73fps、墨效 11ms 帧距），交互与布局层按 K1 已验证的索引化设计（点击 7/10.5ms、待机 0% CPU），状态层采用转译线已验证的槽+脏模型（differential 全过）。所有数字都有探针背书，所有 cold 雷区都有生成规范规避。

> 原则继承 v2 总纲：一个语义一个事实源；凡"猜"必退役；确定性（Q 定点、状态回放、digest）是一等公民，不是测试附件。

## 分层架构

```text
┌─ 应用层：组件（React 转译产物 / 手写 Cheng 组件，同一 API）
├─ 反应内核：状态槽 + setter 置脏 + TakeDirty 帧驱动     【已验证: M2 differential】
├─ 场景树：retained 节点/样式/文本，版本号失效协议       【已有: WebSceneGraph】
├─ 交互层：合一交互表(二分) + 路由段空间索引 + z 仲裁    【已验证: K1, 点击<10ms】
├─ 布局层：增量 RelayoutSubtree，脏子树局部重排          【K2, 设计于此】
├─ 绘制层：命令缓冲 + 签名跳过（相同批次零重传）          【已验证: media sig】
├─ 合成层：GPU layer cache + compositor（不动）          【已实测: 68-73fps】
└─ 平台壳：Android/iOS/Harmony host（窗口/输入/媒体/IME，ABI 白名单）
```

## 帧管线契约（每帧固定顺序，预算显式 @120Hz）

| 阶段 | 内容 | 预算 | 超额行为 |
|---|---|---|---|
| 1 输入 | ring 消费、z 仲裁、handler 执行 | 0.5ms | 计数器+findings |
| 2 状态 | 槽镜像、TakeDirty 收集脏集 | 0.2ms | 同上 |
| 3 布局 | 脏子树 RelayoutSubtree | 2ms | 分帧续排 |
| 4 绘制 | 脏节点命令重建（签名跳过未变批次） | 4ms | 分层延迟 |
| 5 合成 | layer cache 复用 + GPU 提交 | 2ms | — |

**铁律：needs_frame 的每个 true 来源必须自证终止**（动画有寿命、预热有 cursor 终点、媒体有 playing 条件、转场有 tick 上限）。每个来源一个计数器，常驻 true 即 findings 报警——这是 2026-06-12 两个 100% CPU 自旋环换来的契约。

**watchdog**：tick 单次调用超 50ms 即在循环热点打步进 trace（app_trace 通道已通）；超 500ms 视为死循环事故，记录现场 build_step。

## 核心数据结构（全部已实战验证）

1. **合一交互表**：route edge/click handler/text input 三类合一，(routeIndex,nodeId) 排序数组+二分，graph.version 惰性失效。祖先链查询 12 次比较替代 4000 线性。
2. **路由段 box 索引**：layoutBoxes 按路由 min/max 聚簇区间，hit 扫描 28K→600。
3. **z 仲裁**：单遍剪枝（layerId×1e6+boxIndex 评分，score≤best 跳过祖先查询），赢家节点直通 apply。
4. **签名跳过**：命令批次 fold 签名，相同 (route,viewport,批次) 不重传 host——绘制与媒体共用此协议。
5. **状态槽**：模块级标量 + 同值不置脏 setter + 分支式 TakeDirty（cold 安全形态）。
6. **确定性时钟**：宿主每帧注入毫秒，Date.now 类读数全部可回放。

## 反应式渲染（状态→像素的唯一路径）

```text
setter(同值跳过) → dirty → 帧阶段2收集 → 阶段3局部重排 → 阶段4重建脏命令 → 阶段5合成
```
- 列表/容量化：结果 i 填充槽位 i，超量隐藏（display 条件），K2 升级为真增量节点增删。
- 文本变更：节点级 paint 重写 + glyph run 重建（已验证三连），布局影响走 RelayoutSubtree。
- 转场/水墨是装饰层：失败回退直切，永不阻塞路由（已实现）；粒子渲染 instanced 单 pass + 模拟 30Hz 插值 120Hz + 物理像素 smoothstep（清晰度）。

## 线程模型

- **UI/render 单线程**（ChengRenderThread）：tick 全部 app 逻辑+GL 提交。阻塞队列驱动，无自旋。
- **媒体解码线程**（MediaCodec 自管）：经 receipt 通道回 UI 线程，不直接触图。
- **预热**：UI 线程空闲帧渐进（热度序），cursor 模块槽推进（cold 规避），needs_frame 驱动至终点。
- 2026-06-13 教训：单次 tick 死循环会冻结整个 UI 线程且无日志——watchdog 步进 trace 为必备件。

## cold 代码生成规范（生成器与手写 runtime 共同遵守）

1. 分支体内禁 `let x = call(...)`——毒化读取并吞后续语句；一律模块槽，关键推进语句放调用之前。
2. 跨写读取模块标量用分支式（`if flag: flag=false; return true`），禁 let 快照。
3. 模块级裸数组禁纯元素赋值（RMW 保留、标量槽可靠、struct 字段数组经 var 参数可写）；清空用 `= []`。
4. struct 字段名避 Cheng 关键字（`f_` 前缀表）。
5. 数值常量防 int32 溢出字面量；number 域全 int64 整数语义（除法=floor，已记语义子集）。

## 性能 SLO（实测数字即门禁，探针常驻）

| 指标 | SLO | 当前实测 |
|---|---|---|
| 点击 down/up 处理 | <10ms | 7.1 / 10.5ms |
| 切页（预热后） | <50ms | 11.4ms（up 含切换） |
| 待机 CPU | ~0% | home 0.0% |
| 持续动画帧 | ≤16ms | 墨效 11ms 帧距 |
| 媒体路由待机 | ~0% | **未达**（环二死循环修复中） |

## 与转译线的合约

转译产物面向框架 API（状态槽注册、节点构建、事件闭包绑定），不感知层内实现。React 语义子集文档（整数模型、零值哨兵、容量化列表）是两侧共同契约。手写 Cheng 组件用同一 API——框架不知道组件来自转译还是手写。

## 阶段

| 阶段 | 内容 | 门禁 |
|---|---|---|
| F1 | 环二死循环收口 + needs_frame 计数器 + watchdog | 全路由待机 ~0% |
| F2 | RelayoutSubtree 增量布局 + 容量化升级真增量 | 单变更<2ms；digest 44/44 |
| F3 | 水墨 instanced/插值/物理像素三刀 | 动画帧≤8ms；清晰度像素对拍 |
| F4 | 框架 API 定稿 + 转译 M3 全组件接入 | 272 no-op 清零；像素 oracle 不低于基线 |
