# CHT 执行模型升级：async 执行器 + 对象 state + 忠实原生桥（降 invoke 战役）

## 一页结论

`buildCompiledHandlerTable`(CHT)只能把"同步 + 标量 state + 轻副作用"的 handler 编成原生 Cheng。当前 118 个唯一 invoke handler 里只有 3 个达标(`handleVideoToggle/handleSettingsToggle/handleCopyDidBackup`),`invoke_sites=399`。剩 115 个全是 **async/对象图/DOM/网络** 的业务 handler(ASI computer-use、消息、支付、通话)。已落 `trampoline-unwrap`(`() => f()` → 解开到 f,`no-fid` 71→58,零风险结构改进)。

五路验证(复合阻塞分析 + trampoline 落深 + 漏typed核验 + transpile-fail 核验 + site 加权机制核验)收敛到同一结论:**材料性降 399 不是"再加一个桥",是换执行模型**。按 invoke-site 加权的机制 ROI:`ref 24 > other 14 > objstate 11 > browser 5`,但逐个做 no-fallback 可行性核验后,每个机制都要先建深层能力。本提案把这件事拆成 4 个可验证机制 + 显式天花板,每落一个用 `cht-measure` 量化 `invoke_sites` 下降,严禁 fallback/fake。

## 现状基线(可复现)

- 量化工具:`ts-csg/scripts/cht-measure.mjs`(读缓存 `.csgc`,跑 `buildCompiledHandlerTable`,报 `invoke_sites / CHT_compiled / skip 直方图`)。
- 当前:`invoke_sites=399`,`CHT_compiled=3`,skip:`no-fid 58 / fv-unknown 24 / params 18 / transpile-fail 8 / fv-badtype 5 / slot-badtype 1`。
- 原生场景已具备的忠实接口(核验过):`WebSceneRouteContentScrollY` / `WebSceneRouteContentScrollMax`(= scrollTop / scrollHeight−clientHeight)、`WebSceneApplyNodeTextInputValue`、`WebSceneSetContentScrollY`。**无** caret/selectionStart 访问器。

## 四章设计(每章=一个机制,独立可验证)

### 1. 对象 state slot(objstate,11 sites)— 先做,最自洽
- **问题**:`activeOrder/roomState` 等有 setter 但非标量(对象),`fv-unknown`/`fv-badtype` 直接挡;`{...settings, x}` 对象字面量 `transpile-fail`。
- **忠实做法(无捏造)**:对象 state 按字段**无损分解**成多个标量 KV slot(`activeOrder.orderId`/`.status`/...),字段读写 lower 到对应 slot;`{...spread, field: v}` lower 成"逐字段拷贝 + 覆盖"。字段非标量(嵌套对象/数组)的 state **不编**(留 skip,诚实),不做 JSON 兜底。
- **门**:`invoke_sites` 从 399 降到 ≤ 388;新增 objstate handler 的原生行为与 React 逐字段一致(数据 hash 对照)。

### 2. 忠实原生桥 + ref→节点绑定(ref 的可桥子集,~4–8 sites)
- **问题**:`messagesScrollRef.current.scrollTop` 等 DOM 几何在转译时 `ref→节点`绑定已丢;部分属性(`selectionStart`)原生无对应。
- **做法**:转译期补一条 `ref→nodeId` 绑定 fact(JSX `ref={x}` → 节点);CHT 把 `ref.current.{scrollTop,scrollHeight,clientHeight}` lower 到 `WebSceneRouteContentScrollY/ScrollMax`(忠实等价),`mutable-box ref`(纯 `.current` 读写、标量值)建成 KV slot。
- **显式不做**:`selectionStart`/`value`无原生语义的属性 → 对应 handler 保持 uncompiled(天花板,诚实标注,绝不 fake)。
- **门**:可桥 ref 子集编译通过;`cht-measure` ref 桶 site 数下降到"仅剩无原生对应"的残量,并 `log` 残量明细(不静默截断)。

### 3. async 执行模型(核心,最大桶)— 事件驱动,非阻塞
- **问题**:业务 handler 普遍 `await fetch()/getLatestByopProof(...)`;CHT dispatcher `__cht_apply` 是同步 int32,原生帧管线同步,挂不住 await。
- **做法(移动端事件驱动原则,非轮询)**:async handler 分解成 ①同步前奏(读 state、发起请求)②异步 I/O(host 网络桥,回调驱动)③同步续延(响应到达 → 作为新场景事件 re-enter → 更新 slot + 标脏)。需要:`await` 切点处生成续延入口 + host 网络完成事件回投机制(libp2p/http provider 已有异步 I/O,接完成事件)。
- **门**:最小 async handler(选 `refreshProofStatus` 类)端到端打通,续延更新的 state 与 React 一致(hash 对照);`invoke_sites` 目标降到 ≤ 360;生产 computer-use 发布编排 handler 走通(与已验证的 external-publish 原生秒发链路对齐)。

### 4. builtin + 调用点实参绑定(params 18 + builtin)— 收尾
- `Math/Date/Number/Array` → 忠实 Cheng intrinsic;`localStorage` → host KV 桥;`console` → host log 桥。
- params handler:event 形参用原生 dispatch 已有的坐标/目标忠实绑定;域值形参(`card.id`)由场景节点携带绑定 thread 进来。
- **门**:`invoke_sites` 目标降到 ≤ 330;剩余 skip 全部是"显式天花板项"(无原生语义),逐条 `log` 列明。

## 阶段与门禁(每阶段独立 archive)

| 阶段 | 机制 | invoke_sites 门 | 验证 |
|---|---|---|---|
| P1 | 对象 state slot + 对象字面量 | ≤ 388 | cht-measure + 逐字段 hash 对照 |
| P2 | ref→节点绑定 + scroll/box 桥 | ref 桶降到残量 | cht-measure + 残量 log |
| P3 | async 执行模型 | ≤ 360 | 最小 async handler 端到端 + computer-use 发布编排 |
| P4 | builtin + params 绑定 | ≤ 330 | cht-measure + 天花板项逐条 log |

每阶段:propose 已合 → apply 单机制 → `cht-measure` 量化 + 设备真跑回归(不退现有 3 个 + HAP build + external-publish 秒发链路)→ archive。任一阶段撞"无原生忠实语义"立即停、标天花板,绝不 fallback。

## 同步/异步拆分(实测修正,影响排期)

实测 57 个 uncompiled-with-fid handler:**sync 41 / async 16**。但 sync ≠ 可编:高 site 的指针族(`endPointerDrag` 24 sites、`handlePointerMove` 12、`handleNodeClick`)深度耦合 **DOM 事件语义**——`hasPointerCapture`/`releasePointerCapture`(指针捕获)、`preventDefault`/`stopPropagation`、`event.currentTarget`、`window.setTimeout`——这些在原生场景**无忠实等价**(原生 dispatch 模型不同)。结论修正:**P2/P4 的真实可编集远小于 41**,要先有一层 DOM-事件语义映射(指针捕获/默认行为/冒泡的原生对应或显式天花板)。这层本身是 P3 同级的运行时活,不是简单 param 绑定。

## 不做什么(显式天花板,诚实边界)

- **不 fake 无原生对应的 DOM 事件/几何语义**:`selectionStart`/caret、`hasPointerCapture`/`releasePointerCapture`、`preventDefault`/`stopPropagation`、`event.currentTarget`、`document.fullscreenElement`、`window.*` 几何/`setTimeout` → 相关 handler 永久 uncompiled 或需先建 DOM-事件语义层,`cht-measure` 明列,绝不 fake。
- **不做完整 ASI 图语义**:只补 handler 编译实际触达的能力,不实现 ASI 编排全图。
- **不为凑数降级**:任何 slot/桥/续延不满足"与 React 逐字段/逐行为一致"就不编,留 skip。
- **不动 op-lane 域**:cold 后端/typed_expr WIP 不碰;CHT 升级纯在 `ts-csg` 转译线 + 场景运行时桥。

## 与已完成工作的关系

- 复用休眠转译器 `dist/csg-cheng-transpiler.js`(`transpileClosure`/`emitStateSlots`)。
- `trampoline-unwrap` 已落:P1/P3 落地后,之前解开但撞深门的 13 个 handler 即随之编译。
- P3 的 async 续延与已验证的"生产 GUI computer-use external-publish → cheng_host_publish → 麦田 秒发"原生链路同源(执行模型打通后,发布编排 handler 不再特判 rewrite,走通用 async 编译)。
