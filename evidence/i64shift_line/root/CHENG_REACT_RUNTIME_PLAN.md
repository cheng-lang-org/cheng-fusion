# Cheng 原生 React 运行时 — 架构与分期(2026-06-21 启动)

## 目标
把整个 PWA(React app)编成 Cheng 原生程序,真正逼近"UI + handler 全覆盖"。替代撞到结构墙的 CHT 静态标量模型(诚实终点 CHT=5/119)。

## 根因(为什么 CHT 不够)
CHT 是 per-handler 静态转译,假设状态=带字面量初值的标量 KV。撞墙的全部是 CHT 模型之外:对象/数组/工厂/spread 值、运行时计算的状态(KV 无源)、async I/O、事件 payload、prop-callback、closure。地基缺的是**真值模型 + 真状态堆 + 真 closure**。

## 架构原则
- AOT 转译(非运行时解释 React)——延续现有 transpiler/CHT 管线,逐层扩到 app 用到的完整语言子集。
- 单线程事件驱动(QUIC 铁律):render loop + async pump 都在 cheng_app_tick,绝不开线程碰 Cheng state。
- 真桥真服务:平台能力走真 host 符号(grep 确认存在);I/O 走已有纯 Cheng QUIC/MoQ 栈。严禁 stub/fallback/fabrication。
- 每相落地都要真编译真运行验证 + 零回归(cht-measure 基线不破 + 已编 handler 不退)。

## 分期(地基 → 上层,每相可独立验证)

### 相1 值模型(地基,先建)
- 对象字面量 `{a,b}` → 合成具名 Cheng struct + 构造;数组字面量 `[...]` → Cheng 动态数组。
- 字段读/写、索引读/写、spread `{...s,f}`、`.map/.filter/.slice/.push/.length`。
- 复用 #20 已有的 object-ref 字段降级机制扩成通用值。
- 验证:一个产/用对象字面量的 handler 真编译真运行。解锁:object-literal effect、object/array 状态、useMemo 集合、工厂写。

### 相2 状态堆(替代标量 KV)
- 全部 useState/useRef/useMemo/useReducer 持任意值类型(对象/数组),存 Cheng 堆而非扁平标量 KV。
- 状态初值可为计算表达式(编译 init,含工厂调用)——解 "NO KV PRODUCER" 墙。
- useMemo 依赖追踪 + 重算钩子。
- 验证:依赖计算态/对象态的 handler 编译跑通(如 handleMorePanelTouchStart 的 morePanelPages.length)。

### 相3 完整 handler/closure 转译
- 每个 handler/effect/memo 带真 closure(捕获真值)、真 prop 传递。
- prop-callback 解析:沿编译后的组件树解析到父级绑定的真 effect(非 host 桥)——解 onBack/onClose 按实例各异。
- inline-arrow handler 合成。验证:no-fid/prop-callback 家族编译。

### 相4 事件 payload ABI(#21)
- 分发从 click-only 扩成 touch/change/key/pointer,合成事件对象带 materializer 能供的真字段(触摸坐标 cheng_app_on_touch_milli)。
- 无真源的(DOM 命中测试 elementFromPoint、文本输入值若 materializer 无文本控件)如实标注边界,不造假数据。
- 验证:params 家族中有真源的编译(滑页等)。

### 相5 async 运行时 + I/O 服务 + 平台桥(layer-2/3,已起步)
- 续延运行时已建(帧表+pump+setTimeout 延迟效果,CHT 4→5 handleCopyDid 已证)。
- 扩真 await-split(完成谓词=QUIC recv poll msquicNativeAppRecvAvailable)。
- 逐个建 I/O 服务路由已有纯 Cheng QUIC/MoQ;平台能力(文件/相机/定位)建真 host 桥。
- 验证:demo 屏真 async handler 端到端功能落地。

## 关键文件
- transpiler: ts-csg/src/csg-cheng-transpiler.ts(值/类型/closure 降级)
- CHT/runtime 生成器: ts-csg/scripts/scene-runtime-smoke-source.mjs(状态槽/分发/pump emit)
- 度量: `cd ts-csg && node scripts/cht-measure.mjs tmp/gap1-percard-184283985132458`(基线现 5)
- 真编译验证: `artifacts/bootstrap/cheng.stage3 system-link-exec --root:. --in:<f> --emit:exe --link-providers --out:<bin>`

## 硬约束/已知坑
- 冷后端 float 全 miscompile → 一律 int64;标量数组索引写被拒 → 用 struct 数组字段。
- workflow worktree 常落后 main → agent 报假基线;只取 diff+根因,基线以主树为准。
- 分支 cht-coverage(与 K-gaps lane 交错提交);GUI/audio 改动未提交。

## 进度
- [x] 相5 起步:续延运行时 increment-1(a9ac14c10)+ leg-2 setTimeout(0890ce741),CHT 4→5。
- [x] 相1 值模型:对象字面量(63b50bb75)+ 数组(commit 后)——真编译运行证,零回归。剩:object-spread `{...o,f}`、嵌套数组 T[][](冷后端硬墙 "nested opaque sequence element unsupported")。
- [x] 相3 地基:inline-arrow 确定性链接(adbc24e36,提取器根因修)——no-fid 25→17,27 arrow 全解析真 fid。剩:把 handlerFn 延进 materializer .map()-render 路径(201/228 arrow 在此,含能直编的简单 setState arrow→预期首个 no-fid 计数跳)。
- [ ] 下一步候选(按预期计数收益):① map-render handlerFn 延伸(简单 setState arrow→真跳计数)② 相4 事件 payload ABI(params 12-15,需 dispatcher click→touch/change/key)③ 相2 状态堆(object-state,KV-producer 修)。

## 计数现实(诚实)
CHT=5。计数只在某 handler 全部跨相阻塞清空才跳;地基已测量推进墙(no-fid 25→17、8 arrow advanced)但每簇需多原子叠加才翻。这是数月地基工程的常态。

## 运维坑
workflow worktree 落后 main(基于 b6e61a52c K-gaps 旧基,无本会话任何提交)→ agent 报假基线 base-4 且看不到已提交 atom。只取 scoped diff 在主树 `git apply`+重建+(改 fact 形状则)重生 census 验证。多个堆叠 diff 时人工集成有摩擦。
