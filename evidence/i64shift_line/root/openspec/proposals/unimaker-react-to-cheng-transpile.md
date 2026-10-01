# UniMaker React→纯 Cheng：从「路由快照投影」升级为「组件转译 + 运行时求值」

状态：**propose**（待用户确认）。

## 一页结论

当前管线把 React UI 在 44 个离散路由状态下展开成静态 scene 快照，事件靠 handler 文本匹配表映射成路由跳转/受限状态翻转。这是 `UI = f(state)` 的**有限采样**：凡是连续状态空间——搜索框输入→列表过滤、排序选择→列表重排、任何「状态改变数据再改变 UI」的数据流——快照模型**结构上**不可表达。返回按钮 no-op（17 路由）、搜索/过滤无效、点空白开视频，全是同一病根的不同症状；普查存量还有 272 个 distinct no-op handler。补表永远追不完，因为表在追一个本应被执行的程序。

一次性完整正确的方案只有一个：**把 React 组件函数转译成 Cheng 函数，让 `UI = f(state)` 在设备上每帧真实求值**。ts-csg 的 facts 已经携带完整的 TS 函数体 IR（ops/blocks/data/functions）——转译的全部输入已经在手，缺的只是「IR→Cheng 代码生成」这最后一步。路由、返回、搜索、过滤、列表重排从此不再需要任何表：它们是状态求值的自然结果。

> 与 v2 总纲同一原则：**一个语义只允许一个事实源。** UI 行为的事实源是 React 组件函数本身——快照表是从它「猜」出来的第二事实源，应当退役。

## 病根诊断（全部有本仓实证）

| # | 症状 | 快照模型的结构性原因 | 实证 |
| --- | --- | --- | --- |
| 1 | 17 个界面返回按钮 no-op | handler 是组件函数 prop，文本表解析不到父组件实例化实参 | facts 普查：`actionKind=command, effect=invoke:onClose, stateDeltas=[]`；修复靠手工 17 项路由表（2026-06-12，已是补丁） |
| 2 | 搜索输入无效果 | 输入文本是连续状态，44 快照不含「输入了 X 的搜索页」 | headless：搜索入口 (303,52)→route 10 正常；输入→过滤链路无任何 fact 可执行 |
| 3 | 排序/过滤点了不重排 | `setSortType('hot')` 的 state_delta 能记，但「列表按 sortType 重排」是 render 体内的 `.sort()` 数据流，快照里列表内容是固定的 | home_sort_open 路由存在、选项 hit 正常、列表内容恒为快照值 |
| 4 | 点空白开全屏视频 | 快照布局错误（inset-0 视口字面量）放大 hit 区 | v165 已修，但属于「快照展开器再实现一遍 CSS」的永续追赶 |
| 5 | 页面切换明显延时 | 路由切换 = `ensure_route_runtime_ready` 整页构建（layout+glyph+paint 图集），复杂页首次进入百 ms 级 | 用户真机体感；digest 链路同路径 |
| 6 | 偶尔卡死 | no-op 事件后状态机不一致 + 快照间转场假设被破坏 | 用户真机体感（待转译架构下自然消除或单独定位） |
| 7 | 272 个 no-op handler 存量 | 文本匹配表只覆盖已暴露的交互 | facts 普查 2026-06-12：272 distinct `invoke:*` no-op |

## 目标架构

```text
React/TS source
   │  ts-csg 静态分析（已有，不动）
   ▼
csg facts：完整函数 IR（ops/blocks/data）+ JSX 树 + 组件实例化关系
   │  ◄── 新增：transpiler——IR→Cheng 代码生成
   ▼
生成的 Cheng 组件函数（每个 React 组件一个 Cheng 函数）
   ├─ useState/useRef → 确定性状态槽（int32/str 槽位，编译期编号）
   ├─ JSX → scene 节点构建调用（retained tree，key 驱动 diff）
   ├─ 事件 handler → Cheng 闭包：改状态槽 → 标记 dirty
   ├─ map/filter/sort/条件渲染 → Cheng 等价（确定性整数/字符串运算）
   └─ 文本输入 → 既有 text_input_utf8 通道直写状态槽
   ▼
每帧：dirty ⇒ 重新求值受影响组件子树 ⇒ scene diff ⇒ 增量 layout/paint
（web_scene_runtime / 字形 SDF / LBM 水墨 / compositor 全部复用，不动）
```

- **路由退役为投影**：当前 44 个 routeId 保留为「状态谓词→routeId」的纯函数（digest/转场/back 仍按 routeId 工作），但不再是执行模型——执行模型是状态求值。
- **像素 oracle 保留**：React puppeteer 对拍 + 确定性状态序列回放，digest 门继续作为安全网。
- **页面切换延时自然消除**：切换 = 状态改变 → 受影响子树增量重建，不再整页 ensure。

## 语义子集与 let-it-crash 边界

普查 facts 中实际出现的 op 种类，定义受支持子集（赋值/算术/比较/逻辑/调用/闭包/数组操作/字符串模板/三元/可选链/早退）。子集之外（async/await、网络、第三方库调用、document/window 直访）在**转译期硬失败并报全量清单**——不静默降级，与 v1「首错 vs 全量失败面」教训一致。媒体/网络等宿主能力走既有 host 通道白名单。

## 实现归属（2026-06-12 确认：扩展 ts-csg）

转译器落在 ts-csg：facts IR 与 Cheng 代码 emit 基建两端都已在此（materializer / scene-runtime 生成器本就是 facts→Cheng 源码生成器）。

- 新模块 `ts-csg/src/csg-cheng-transpiler.ts`：组件函数 IR→Cheng 组件函数 codegen，与 materializer 平行消费 facts。
- `scene-runtime-smoke-source.mjs` 保留宿主 ABI 骨架（init/tick/on_touch/ink/asset），转译产物作为组件层拼装。
- materializer 快照展开 M3 退役；其 CSS/布局 fact 发射继续复用。
- one-click 管线：extract → transpile → 拼装 → stage3 编译；编译链接链不动。
- 转译器纯 Cheng 化（去 TS 工具依赖）属自举线后续独立战役，不与本提案耦合。

## 阶段与门禁

| 阶段 | 内容 | 验收门禁 |
| --- | --- | --- |
| M1 转译器核心 | IR→Cheng 表达式/语句/闭包/列表操作代码生成；先闭环 HomePage 单组件树（含搜索输入→过滤、排序→重排） | 真机：搜索输入即时过滤、排序即时重排；headless 状态序列回放 rc=0 |
| M2 运行时语义层 | useState/受限 useEffect/条件渲染/列表 key diff + scene 增量重建 | 增量重建帧 <16ms（120Hz 半帧预算）；digest 44/44 不回退 |
| M3 全组件转译 | 23 个组件全量转译，路由快照模型退役（保留 routeId 投影） | 272 个 no-op handler 清零（普查脚本=0）；像素 oracle 全路由对拍不低于现基线 |
| M4 性能与输入收口 | dirty 子树最小化、布局增量、IME 组合输入、转场/水墨线接缝 | 页面切换 P95 <50ms；卡死复现脚本 0 命中 |

## 不做什么

- 不重写 ts-csg 静态分析（facts 已够用）；不动 web_scene_runtime 渲染/字形/水墨/compositor。
- 不引入 JS 解释器/WebView——转译是编译期一次性的，运行时是纯 Cheng。
- 不保留双执行模型长期并存：M3 收口时快照事件表（inferHomeRouteTargetFromClick、overlayCloseRouteTargetByRouteId 等）整体退役删除。
