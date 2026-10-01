# HomePage / NodesPage 转译诊断逐条映射（T2 线 longtail 分析）

日期：2026-09-13。数据源：`ts-csg/tmp/r2c-census/unimaker-facts-v5.jsonl`（project 模式抽取，808,864 facts）+ `ts-csg/dist/csg-cheng-transpiler.js` 的 `transpileR2c(facts, name)`。

**总原始诊断：218 条**（HomePage 89 + NodesPage 129），按 (行,列) 归并为 **136 个独立位点**。同一内联箭头经多条 lowering 路径（useCallback 壳别名路径 + useMemo/useEffect 挂载路径）重复编译，失败诊断成对/成组出现，表中以（×N）标注。

## 根因链（机械验证）

1. **captureRenames 包装丢 type**（transpileR2c → transpileFunctions 7253-7256：`wrapped.set(k, { expr: v })` 丢弃 componentCaptures 值里的 `type` 字段）→ `t`/props 捕获在组件体「有表达式无类型」，`t.xxx` 属性读落到 unsupported receiver type。
2. **buildCaptureRenames 不继承组件级 captures**（6158 起：lambda 自由变量解析只走槽表/别名/hop，不合并 componentCaptures）→ lambda 内 `t`、`targetPeerId`、`captureHighAccuracyLocation` 全部 unresolved。这是最大单一根因，直接解释 B3/B5 并级联出大量 B1。
3. **emitRefSlots 拒绝 useRef(false)**：v5 facts 盖章 returnType=any 且无 `.current` 写位点 → `isDragging` 无 ref 槽 → 壳级联（refDiagnostics 实证）。
4. `new Map(...)` 无构造分支（case "new" 只接 new Set(str[])）→ 全部本地 Map 构造/拷贝失败（B7），并级联 for_of 源 undefined（B8）。

## 桶汇总

| 桶 | 名称 | 原始诊断 (HP/NP) | 独立位点 (HP/NP) | 期望降级方案（既有机制引用） |
|---|---|---|---|---|
| B1 | hook 壳级联（useCallback/useMemo/useRef 壳与别名下游） | 50/23 | 46/14 | 壳机制（emitStateSlots / localAliasEmitNames / stateSetterNames）已在，逐根因修复内部桶后自动消除；useRef(false) 型补 emitRefSlots 从 init 字面量推槽类型（literal→bool） |
| B4 | 宿主服务桥（libp2pService / Capacitor / document / EventSource / sevenGatesRuntime / 元素属性） | 4/14 | 2/7 | hostBridges 桥表注册（DEFAULT_R2C_HOST_BRIDGES 同机制）：libp2pService 每成员一桥 + CHT_BRIDGE_RETURN_TYPES 回填返回型；Capacitor.getPlatform→str；document.addEventListener/removeEventListener、new EventSource、sevenGatesRuntime.getSnapshot、元素 .scrollTop 各一桥 |
| B15 | 可选参缺审计默认（CHT_DEFAULT_PARAM_VALUES） | 4/10 | 2/5 | CHT_DEFAULT_PARAM_VALUES 补六行审计默认：startDistributedContentSync.options / prefetchFastPlaybackSegment.signal / scheduleRefreshNativeStatus.immediate / joinViaRandomBootstrap.limit / syncDistributedContentFromNetwork.options / generateScoreReport.now（手工审计登记机制已有） |
| B16 | 多语句/链式 lambda 与回调方法（reduce/map/filter/find/forEach/链式调用） | 3/11 | 1/5 | extractor 扩展：块体箭头提升为命名 lambda + 调用位替换；链式 .slice().map() 逐段降低；短期源码降级：块体提为模块级 fn |
| B7 | new Map 本地构造（含 new Set() 无源） | 0/13 | 0/6 | case "new" 增 Map 分支：new Map() → R2cMap 零值；new Map(src) → keys/vals 拷贝；new Map(entries) → 逐项 insert；new Set() 无源从上下文元素型注解取 elem |
| B3 | locale 桥贯穿（t / t.xxx 读取） | 2/10 | 1/6 | 同 B2 两修；另加 property_read receiver 为捕获桥（__r2cT, str）时折叠 t.xxx → __r2cT("key") |
| B21B | any/unknown 参数与返回 | 2/8 | 1/3 | 源码注解收紧（filter 返回、renderPieChart 返回、param any/unknown 具体化）；extractor 侧拒绝前先试上下文具体化 |
| B21A | 事件参数类型（React.TouchEvent/DragEvent/StorageEvent） | 6/2 | 3/1 | 事件参数类型注册表：各事件类型 → 桥事件信封 struct（payload 由宿主桥构造） |
| B6 | JSX 复合插值与组件元素 | 1/6 | 1/6 | 短期源码降级：`{cond && (<Comp/>)}` 复合插值提为变量/子组件；机制面：extractor 复合插值携带结构 + transpileR2c 组件内联（诊断语已指名） |
| B14 | async await-split 未启用 | 4/2 | 2/1 | recv-done frame kind 注册开启 await 拆分；短期把 async handler 体提为 @exportc 宿主桥异步调用 |
| B13 | struct 真值条件 presence 登记 | 3/2 | 1/1 | STRUCT_PRESENCE_FIELDS 审计登记 GeoPoint、RetainedNativeDiscoveryState 的 presence 字段（机制已有，缺登记行） |
| B24 | inline-obj struct 成员表缺口（ChtInlineObj_543f6e08） | 5/0 | 3/0 | ChtInlineObj_543f6e08 合成 struct 收全成员（active/startY/…）；struct 成员读写机制已有，成员表收全即通 |
| B8 | Map/Array.from 迭代（for_of / entries / Array.from(map) / forEach） | 0/4 | 0/2 | for_of over R2cMap → vals（或 keys+vals zip）；entries()/Array.from(map) → 生成 keys/vals 对数组；arr.forEach(fn) → for_of + 直接调用 fn |
| B9 | updater typed input（setState(prev => …) 参数 any） | 0/4 | 0/2 | updater lambda 参数类型从对应 state 槽 chengType 注入（r2cSlotTypes/stateSetterNames 管道已有） |
| B25 | ?? / optional-chain 类型流 | 2/2 | 1/1 | exprType 扩展：find() 结果 T\|undefined、`?.` 成员链类型下传到 ?? |
| B2 | hook 返回对象解构 path 类型流（binding_extract） | 2/1 | 2/1 | useLocale 已登记 R2C_HOOK_MEMBER_BRIDGES（t→__r2cT）：修复 componentCaptures 包装丢 type + buildCaptureRenames 继承即通；useHighAccuracyLocation 在同表补成员桥（captureHighAccuracyLocation → @exportc 宿主桥） |
| B5 | props capture 类型流（targetPeerId.trim / (initialTruthRoute ?? '').trim） | 1/2 | 1/1 | props 数据捕获已落 componentCaptures——buildCaptureRenames 继承后直通；`(x ?? '')` 二元链从捕获类型下传 str，.trim()（str 方法表已有）即通 |
| B21C | union 数组元素返回 | 0/3 | 0/1 | truthNodeContents 返回两分支 union → 源码统一单型 DistributedContent[] |
| B11 | spread 对象合并（multi-spread Record literal） | 0/2 | 0/1 | 键静态可知时 extractor 展开为逐字段覆盖；否则经 json.JsonSetField 合并 |
| B12 | Set .size 属性读（str[] 接收者） | 0/2 | 0/1 | property_read `.size` on T[] → int64(len(recv))（emitCall 侧已有同语义分支，property_read 补对称分支） |
| B18 | try 体含循环（catch-shell break 层级） | 0/2 | 0/1 | 源码降级：循环体提为独立 fn 保持 break 语义；机制面 catch-shell 分层 |
| B19 | for_count 语句未降低 | 0/2 | 0/1 | for_count 语句降低（int64 计数 → while 形）；短期源码改 for-of/while |
| B20 | json.JsonNode 字段写 | 0/2 | 0/1 | json.JsonNode 字段写 → json.JsonSetField 桥（读侧 JsonGetField 已接，补对称写桥） |
| B26 | setter 一等值直传（subscribeNetworkTelemetry(setX)） | 0/2 | 0/1 | 短期源码包 thunk `() => setX(v)`；机制面 setter 引用折叠为生成的 setter fn 名 |
| B17 | .catch() continuation | 0/0 | 0/0 | reducible-catch 白名单扩展到宿主桥调用形态；或源码 await 化 + 同步 try/catch 折叠（throw new Error 形已支持） |
| B21D | JSON.stringify(Node[]) | 0/0 | 0/0 | Node 序列化桥（经 json.JsonNode 转换） |
| B21E | parseObject 泛型单态化失败 | 0/0 | 0/0 | 调用点补显式类型实参（单态化） |

注：**B17（.catch() continuation，1 个多因位点携带）、B21D（JSON.stringify(Node[])，1 个多因位点携带）、B21E（parseObject 泛型单态化失败，1 个多因位点携带）** 仅作为多因位点里的子因出现（主桶已归并给根因桶），降级方案同样适用，按位点备注逐条落地。

## HomePage（原始诊断 89 条，独立位点 67 个）

| 行:列 | 源码片段 | 诊断（聚合） | 桶 | 降级方案/备注 |
|---|---|---|---|---|
| 159:30 | `const resolvedTruthRoute = (initialTruthRoute ?? '').trim();` | unsupported callee '(initialTruthRoute ?? '').trim' | B5 | → B5 props capture 类型流 |
| 185:11 | `const { t } = useLocale();` | binding_extract 't': cannot infer type through path (source type '?') | B2 | → B2 hook 返回对象解构 path 类型流 |
| 186:11 | `const { captureHighAccuracyLocation } = useHighAccuracyLocation…` | binding_extract 'captureHighAccuracyLocation': cannot infer type through path (source type 'ChtInlineObj_4e4e3e5a') | B2 | → B2 hook 返回对象解构 path 类型流 |
| 217:9 | `const isDragging = useRef(false);` | cannot infer type for local 'isDragging' | B1 | → B1 hook 壳级联 |
| 217:22 | `const isDragging = useRef(false);` | unsupported callee 'useRef' | B1 | → B1 hook 壳级联；根因行：v5 facts 里 useRef(false) returnType=any 且无 .current 写位点，emitRefSlots 拒建槽（refDiagnostics: unsupported type 'any'） |
| 226:9 | `const getTabLabel = useCallback((tab: typeof categoryTabs[0]) =…` | cannot infer type for local 'getTabLabel' | B1 | → B1 hook 壳级联 |
| 226:23 | `const getTabLabel = useCallback((tab: typeof categoryTabs[0]) =…` | unsupported callee 'useCallback' | B1 | → B1 hook 壳级联 |
| 226:35 | `const getTabLabel = useCallback((tab: typeof categoryTabs[0]) =…` | inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 't'（×2） | B3 | → B3 locale 桥贯穿；根因行：lambda 内 unresolved t（B3） |
| 229:9 | `const unreadCountsMemo = useMemo(() => {` | cannot infer type for local 'unreadCountsMemo' | B1 | → B1 hook 壳级联 |
| 229:36 | `const unreadCountsMemo = useMemo(() => {` | inline arrow '<anonymous>' -> __tN_lambda: array .reduce requires a single-expression arrow argument（×3） | B16 | → B16 多语句/链式 lambda 与回调方法；根因行：unreadCounts 的 .reduce 三支箭头 |
| 252:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: call to 'startDistributedContentSync' is missing an audited default for optional parameter 'options' (CHT_DEFAULT_PARAM_VALUES…（×2） | B15 | → B15 可选参缺审计默认 |
| 288:9 | `const resetPullRefreshGesture = useCallback(() => {` | cannot infer type for local 'resetPullRefreshGesture' | B1 | → B1 hook 壳级联 |
| 288:35 | `const resetPullRefreshGesture = useCallback(() => {` | unsupported callee 'useCallback' | B1 | → B1 hook 壳级联 |
| 288:47 | `const resetPullRefreshGesture = useCallback(() => {` | inline arrow '<anonymous>' -> __tN_lambda: property write 'active' on unsupported receiver type 'ChtInlineObj_543f6e08'（×2） | B24 | → B24 inline-obj struct 成员表缺口；根因行：pullRefreshGesture 对象 ref 字段 active 写（B24） |
| 293:9 | `const canStartPullRefresh = useCallback(() => {` | cannot infer type for local 'canStartPullRefresh' | B1 | → B1 hook 壳级联 |
| 293:31 | `const canStartPullRefresh = useCallback(() => {` | unsupported callee 'useCallback' | B1 | → B1 hook 壳级联 |
| 293:43 | `const canStartPullRefresh = useCallback(() => {` | inline arrow '<anonymous>' -> __tN_lambda: property 'scrollTop' on unsupported receiver type 'int64'（×2） | B4 | → B4 宿主服务桥；根因行：contentScrollRef.current?.scrollTop（int64 句柄上取宿主元素属性） |
| 300:9 | `const handleFeedTouchStart = useCallback((event: React.TouchEve…` | cannot infer type for local 'handleFeedTouchStart' | B1 | → B1 hook 壳级联 |
| 300:32 | `const handleFeedTouchStart = useCallback((event: React.TouchEve…` | unsupported callee 'useCallback' | B1 | → B1 hook 壳级联 |
| 300:44 | `const handleFeedTouchStart = useCallback((event: React.TouchEve…` | inline arrow '<anonymous>' -> __tN_lambda: parameter 'event': unsupported type 'React.TouchEvent<HTMLDivElement>'（×2） | B21A | → B21A 事件参数类型 |
| 310:7 | `}, [canStartPullRefresh]);` | unresolved identifier 'canStartPullRefresh' | B1 | → B1 hook 壳级联 |
| 312:9 | `const handleFeedTouchMove = useCallback((event: React.TouchEven…` | cannot infer type for local 'handleFeedTouchMove' | B1 | → B1 hook 壳级联 |
| 312:31 | `const handleFeedTouchMove = useCallback((event: React.TouchEven…` | unsupported callee 'useCallback' | B1 | → B1 hook 壳级联 |
| 312:43 | `const handleFeedTouchMove = useCallback((event: React.TouchEven…` | inline arrow '<anonymous>' -> __tN_lambda: parameter 'event': unsupported type 'React.TouchEvent<HTMLDivElement>'（×2） | B21A | → B21A 事件参数类型 |
| 328:7 | `}, [resetPullRefreshGesture]);` | unresolved identifier 'resetPullRefreshGesture' | B1 | → B1 hook 壳级联 |
| 330:9 | `const handleFeedTouchEnd = useCallback(() => {` | cannot infer type for local 'handleFeedTouchEnd' | B1 | → B1 hook 壳级联 |
| 330:30 | `const handleFeedTouchEnd = useCallback(() => {` | unsupported callee 'useCallback' | B1 | → B1 hook 壳级联 |
| 330:42 | `const handleFeedTouchEnd = useCallback(() => {` | inline arrow '<anonymous>' -> __tN_lambda: property 'active' on unsupported receiver type 'ChtInlineObj_543f6e08'; property write 'active' on unsupported receiver type '…（×2） | B24 | → B24 inline-obj struct 成员表缺口 |
| 343:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: inline arrow '<anonymous>' -> __tN_lambda: host global 'document' in value position (bridge the specific member call instead);…（×2） | B4 | → B4 宿主服务桥；含 host global 'document' in value position（内层箭头） |
| 365:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 'unreadCountsMemo'（×2） | B1 | → B1 hook 壳级联 |
| 367:7 | `}, [unreadCountsMemo]);` | unresolved identifier 'unreadCountsMemo' | B1 | → B1 hook 壳级联 |
| 369:9 | `const findRefreshedContent = useCallback((content: Content): Co…` | cannot infer type for local 'findRefreshedContent' | B1 | → B1 hook 壳级联 |
| 369:32 | `const findRefreshedContent = useCallback((content: Content): Co…` | unsupported callee 'useCallback' | B1 | → B1 hook 壳级联 |
| 369:44 | `const findRefreshedContent = useCallback((content: Content): Co…` | inline arrow '<anonymous>' -> __tN_lambda: ?? on unsupported type 'undefined'（×2） | B25 | → B25 ?? / optional-chain 类型流 |
| 375:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: inline arrow '<anonymous>' -> __tN_lambda: parameter 'current': unsupported type 'any'; inline arrow '<anonymous>' -> __tN_lam…（×2） | B21B | → B21B any/unknown 参数与返回 |
| 386:7 | `}, [findRefreshedContent, selectedContent]);` | unresolved identifier 'findRefreshedContent' | B1 | → B1 hook 壳级联 |
| 406:9 | `const handleOpenMarketplace = useCallback(() => {` | cannot infer type for local 'handleOpenMarketplace' | B1 | → B1 hook 壳级联 |
| 406:33 | `const handleOpenMarketplace = useCallback(() => {` | unsupported callee 'useCallback' | B1 | → B1 hook 壳级联 |
| 406:45 | `const handleOpenMarketplace = useCallback(() => {` | inline arrow '<anonymous>' -> __tN_lambda: unsupported callee 'markAppMarketplaceViewed'（×2） | B1 | → B1 hook 壳级联；调用位别名解析：useCallback 别名在嵌套 lambda 调用位未折叠 |
| 411:9 | `const handleHomePageNavigate = useCallback((page: string) => {` | cannot infer type for local 'handleHomePageNavigate' | B1 | → B1 hook 壳级联 |
| 411:34 | `const handleHomePageNavigate = useCallback((page: string) => {` | unsupported callee 'useCallback' | B1 | → B1 hook 壳级联 |
| 411:46 | `const handleHomePageNavigate = useCallback((page: string) => {` | inline arrow '<anonymous>' -> __tN_lambda: unsupported callee 'markAppMarketplaceViewed'（×2） | B1 | → B1 hook 壳级联 |
| 432:9 | `const handleDragOver = useCallback((e: React.DragEvent, targetC…` | cannot infer type for local 'handleDragOver' | B1 | → B1 hook 壳级联 |
| 432:26 | `const handleDragOver = useCallback((e: React.DragEvent, targetC…` | unsupported callee 'useCallback' | B1 | → B1 hook 壳级联 |
| 432:38 | `const handleDragOver = useCallback((e: React.DragEvent, targetC…` | inline arrow '<anonymous>' -> __tN_lambda: parameter 'e': unsupported type 'React.DragEvent'（×2） | B21A | → B21A 事件参数类型 |
| 463:9 | `const displayContents = useMemo(() => {` | cannot infer type for local 'displayContents' | B1 | → B1 hook 壳级联 |
| 463:35 | `const displayContents = useMemo(() => {` | inline arrow '<anonymous>' -> __tN_lambda: array .filter block-bodied arrow: struct type 'GeoPoint' used as a boolean condition has no registered presence field (STRUCT_…（×3） | B13 | → B13 struct 真值条件 presence 登记；根因行：GeoPoint 真值条件 |
| 542:9 | `const handleSelectDistanceSort = useCallback(() => {` | cannot infer type for local 'handleSelectDistanceSort' | B1 | → B1 hook 壳级联 |
| 542:36 | `const handleSelectDistanceSort = useCallback(() => {` | unsupported callee 'useCallback' | B1 | → B1 hook 壳级联 |
| 542:48 | `const handleSelectDistanceSort = useCallback(() => {` | inline arrow '<anonymous>' -> __tN_lambda: async await-split not enabled for this handler (no recv-done frame kind)（×2） | B14 | → B14 async await-split 未启用；根因行：async 定位排序 handler |
| 556:7 | `}, [captureHighAccuracyLocation, t]);` | unresolved identifier 'captureHighAccuracyLocation' | B1 | → B1 hook 壳级联 |
| 559:9 | `const handleOpenContentDetail = useCallback((content: Content) …` | cannot infer type for local 'handleOpenContentDetail' | B1 | → B1 hook 壳级联 |
| 559:35 | `const handleOpenContentDetail = useCallback((content: Content) …` | unsupported callee 'useCallback' | B1 | → B1 hook 壳级联 |
| 559:47 | `const handleOpenContentDetail = useCallback((content: Content) …` | inline arrow '<anonymous>' -> __tN_lambda: async await-split not enabled for this handler (no recv-done frame kind)（×2） | B14 | → B14 async await-split 未启用；根因行：async 详情打开 handler（下游 L635/L637 级联源） |
| 586:9 | `const handleWarmVideoDetail = useCallback((content: Content) =>…` | cannot infer type for local 'handleWarmVideoDetail' | B1 | → B1 hook 壳级联 |
| 586:33 | `const handleWarmVideoDetail = useCallback((content: Content) =>…` | unsupported callee 'useCallback' | B1 | → B1 hook 壳级联 |
| 586:45 | `const handleWarmVideoDetail = useCallback((content: Content) =>…` | inline arrow '<anonymous>' -> __tN_lambda: call to 'prefetchFastPlaybackSegment' is missing an audited default for optional parameter 'signal' (CHT_DEFAULT_PARAM_VALUES …（×2） | B15 | → B15 可选参缺审计默认；根因行：prefetchFastPlaybackSegment(signal?) |
| 635:9 | `const handleOpenFeedCard = useCallback((content: Content) => {` | cannot infer type for local 'handleOpenFeedCard' | B1 | → B1 hook 壳级联 |
| 635:30 | `const handleOpenFeedCard = useCallback((content: Content) => {` | unsupported callee 'useCallback' | B1 | → B1 hook 壳级联 |
| 635:42 | `const handleOpenFeedCard = useCallback((content: Content) => {` | inline arrow '<anonymous>' -> __tN_lambda: unsupported callee 'handleOpenContentDetail'（×2） | B1 | → B1 hook 壳级联 |
| 637:7 | `}, [handleOpenContentDetail]);` | unresolved identifier 'handleOpenContentDetail' | B1 | → B1 hook 壳级联 |
| 649:17 | `transition: pullRefreshGestureRef.current.active ? 'none' : 'tr…` | property 'active' on unsupported receiver type 'ChtInlineObj_543f6e08' | B24 | → B24 inline-obj struct 成员表缺口；JSX 内 ref 字段读，同 B24 |
| 652:19 | `onTouchStart: handleFeedTouchStart,` | unresolved identifier 'handleFeedTouchStart' | B1 | → B1 hook 壳级联 |
| 653:18 | `onTouchMove: handleFeedTouchMove,` | unresolved identifier 'handleFeedTouchMove' | B1 | → B1 hook 壳级联 |
| 654:17 | `onTouchEnd: handleFeedTouchEnd,` | unresolved identifier 'handleFeedTouchEnd' | B1 | → B1 hook 壳级联 |
| 655:20 | `onTouchCancel: handleFeedTouchEnd,` | unresolved identifier 'handleFeedTouchEnd' | B1 | → B1 hook 壳级联 |
| 659:5 | `<>` | jsx element '': only lowercase host tags are lowered (component elements need transpileR2c component inlining) | B6 | → B6 JSX 复合插值与组件元素 |

## NodesPage（原始诊断 129 条，独立位点 69 个）

| 行:列 | 源码片段 | 诊断（聚合） | 桶 | 降级方案/备注 |
|---|---|---|---|---|
| 1860:11 | `const { t } = useLocale();` | binding_extract 't': cannot infer type through path (source type '?') | B2 | → B2 hook 返回对象解构 path 类型流 |
| 1944:34 | `const markCachedPeersOffline = (removedPeerIds: string[], remov…` | inline arrow '<anonymous>' -> __tN_lambda: array .filter requires a single-expression arrow argument; inline arrow '<anonymous>' -> __tN_lambda: parameter 'prev': unsupp…（×2） | B16 | → B16 多语句/链式 lambda 与回调方法；多桶：B16 filter 块体 + B9 prev:any + B7 |
| 1971:36 | `const renderPwaOnlineNodeCache = (cache: Map<string, Node>) => {` | inline arrow '<anonymous>' -> __tN_lambda: Array.from over unsupported source; array .map requires a single-expression arrow argument（×2） | B8 | → B8 Map/Array.from 迭代；多桶：B8 Array.from(cache) + B16 map 块体 |
| 1979:38 | `const schedulePwaOnlineNodePrune = () => {` | inline arrow '<anonymous>' -> __tN_lambda: for_of over unsupported iterable type 'undefined'; inline arrow '<anonymous>' -> __tN_lambda: new Map not supported in the tra…（×2） | B7 | → B7 new Map 本地构造；多桶：B7 new Map + B8 for_of/Array.from；for_of 源 undefined 为 B7 级联 |
| 2020:36 | `const commitPwaOnlineNodeCache = (cache: Map<string, Node>, syn…` | inline arrow '<anonymous>' -> __tN_lambda: Array.from over unsupported source; array .map requires a single-expression arrow argument; JSON.stringify on unsupported argu…（×2） | B8 | → B8 Map/Array.from 迭代；多桶：B8 + B21D JSON.stringify(Node[]) |
| 2037:38 | `const mergePwaOnlineNodeSnapshot = (incomingNodes: Node[], sync…` | inline arrow '<anonymous>' -> __tN_lambda: new Map not supported in the transpiled subset; unsupported callee 'nextCache.entries'; for_of missing iterable/initializer; A…（×2） | B7 | → B7 new Map 本地构造；多桶：B7 new Map + B8 entries/for_of/Array.from |
| 2068:31 | `const removePwaOnlineNode = (peerIdRaw: string, removedAt = Dat…` | inline arrow '<anonymous>' -> __tN_lambda: new Map not supported in the transpiled subset（×2） | B7 | → B7 new Map 本地构造；根因行：new Map(prev) 拷贝构造 |
| 2085:26 | `const saveNodeRemark = (peerIdRaw: string, remarkRaw: string) =…` | inline arrow '<anonymous>' -> __tN_lambda: inline arrow '<anonymous>' -> __tN_lambda: parameter 'prev': unsupported type 'any'; inline arrow '<anonymous>' -> __tN_lambda…（×2） | B9 | → B9 updater typed input；根因行：setNodeRemarks updater prev:any（B9） |
| 2112:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 't'; new Map not supported in the transpiled subset; inline arrow '<anonymous>' -> __tN_lambda: unsuppor…（×2） | B7 | → B7 new Map 本地构造；多桶：B3 t + B7 new Map + B8 nextCache.set/cachedNodes.forEach |
| 2130:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: inline arrow '<anonymous>' -> __tN_lambda: parameter 'event': unsupported type 'StorageEvent'; inline arrow '<anonymous>' -> _…（×2） | B21A | → B21A 事件参数类型；多桶：B21A StorageEvent + B4 window.addEventListener |
| 2145:35 | `const truthNode = useMemo<Node>(() => ({` | inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 't'; unresolved identifier 't'; property 'nodes_instantMsg' on unsupported receiver type 'Card[]'; unres…（×3） | B3 | → B3 locale 桥贯穿；根因行：t 未解析级联 + useMemo<Node> 对象字面量 |
| 2164:59 | `const truthNodeContents = useMemo<DistributedContent[]>(() => {` | inline arrow '<anonymous>' -> __tN_lambda: return type: array element: union 'DistributedContent[] \| { id: string; type: string; publishCategory: string; userId: any; u…（×3） | B21C | → B21C union 数组元素返回；根因行：union 数组元素返回 |
| 2183:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 'truthRoute'; unresolved identifier 'truthNode'; unresolved identifier 'truthNode'; unresolved identifie…（×2） | B1 | → B1 hook 壳级联；级联：truthRoute/truthNode（useMemo 壳，根因 L2145） |
| 2203:34 | `const cloneDiagnosticsRecord = (source: Record<string, unknown>…` | inline arrow '<anonymous>' -> __tN_lambda: property write 'systemProfile' on unsupported receiver type 'json.JsonNode'; property write 'resourceSnapshot' on unsupported …（×2） | B20 | → B20 json.JsonNode 字段写；根因行：Record clone 的 JsonNode 字段写 |
| 2224:39 | `const readRetainedNativeDiscovery = (): RetainedNativeDiscovery…` | inline arrow '<anonymous>' -> __tN_lambda: struct type 'RetainedNativeDiscoveryState' used as a boolean condition has no registered presence field (STRUCT_PRESENCE_FIELD…（×2） | B13 | → B13 struct 真值条件 presence 登记；根因行：RetainedNativeDiscoveryState 真值条件 |
| 2244:33 | `const retainNativeDiscovery = (` | inline arrow '<anonymous>' -> __tN_lambda: array .map requires a single-expression arrow argument; array .map requires a single-expression arrow argument（×2） | B16 | → B16 多语句/链式 lambda 与回调方法 |
| 2265:32 | `const rememberPeerProfiles = (items: Node[]) => {` | inline arrow '<anonymous>' -> __tN_lambda: cannot infer type for local 'nextCache'; element write on unsupported receiver type 'undefined'; unresolved identifier 'nextCa…（×2） | B7 | → B7 new Map 本地构造；级联：new Map 缺构造 → nextCache 局部无型 |
| 2280:37 | `const overlayCachedPeerProfiles = (items: Node[]): Node[] => it…` | inline arrow '<anonymous>' -> __tN_lambda: array .map requires a single-expression arrow argument（×2） | B16 | → B16 多语句/链式 lambda 与回调方法 |
| 2295:32 | `const applyPeerProfileRows = (rows: Record<string, unknown>[]):…` | inline arrow '<anonymous>' -> __tN_lambda: multi-spread Record literal not yet supported; array .map requires a single-expression arrow argument; inline arrow '<anonymou…（×2） | B11 | → B11 spread 对象合并；多桶：B11 双 spread + B16 + B9 |
| 2344:40 | `const hydrateConnectedPeerProfiles = async (peerId: string, att…` | inline arrow '<anonymous>' -> __tN_lambda: unsupported statement op 'for_count'（×2） | B19 | → B19 for_count 语句未降低；根因行：for (let attempt = 0; …) 计数循环 |
| 2364:30 | `const hydratePeerProfile = async (candidate: Node) => {` | inline arrow '<anonymous>' -> __tN_lambda: unsupported callee 'libp2pService.registerPeerHints'; unsupported callee 'libp2pService.socialConnectPeer'; unsupported callee…（×2） | B4 | → B4 宿主服务桥；根因行：libp2pService 五个成员调用 |
| 2417:31 | `const refreshNativeStatus = async () => {` | inline arrow '<anonymous>' -> __tN_lambda: try body contains a loop — the catch-shell break would target the wrong level (never silently mislowered)（×2） | B18 | → B18 try 体含循环；根因行：try 体含 while 循环 |
| 2763:34 | `const runRefreshNativeStatus = async () => {` | inline arrow '<anonymous>' -> __tN_lambda: call to 'scheduleRefreshNativeStatus' is missing an audited default for optional parameter 'immediate' (CHT_DEFAULT_PARAM_VALU…（×2） | B15 | → B15 可选参缺审计默认；根因行：scheduleRefreshNativeStatus(immediate?) |
| 2784:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: unsupported callee 'document.addEventListener'; inline arrow '<anonymous>' -> __tN_lambda: unsupported callee 'document.remove…（×2） | B4 | → B4 宿主服务桥；根因行：document.addEventListener/removeEventListener |
| 2801:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: inline arrow '<anonymous>' -> __tN_lambda: call to 'scheduleRefreshNativeStatus' is missing an audited default for optional pa…（×2） | B15 | → B15 可选参缺审计默认 |
| 2819:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: new EventSource not supported in the transpiled subset; cannot infer type for local 'stream'; inline arrow '<anonymous>' -> __…（×2） | B4 | → B4 宿主服务桥；多桶：B4 new EventSource + B1 级联（stream/baseUrl） |
| 2901:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: unsupported callee 'libp2pService.setDiscoveryActive'; call to 'scheduleRefreshNativeStatus' is missing an audited default for…（×2） | B4 | → B4 宿主服务桥；多桶：B4 setDiscoveryActive + B15 immediate |
| 2912:34 | `const joinViaRandomBootstrap = async () => {` | inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 't'; property 'nodes_noBootstrapNode' on unsupported receiver type 'Card[]'; unsupported callee 'libp2pS…（×2） | B4 | → B4 宿主服务桥；多桶：B3 t + B4 joinViaRandomBootstrap + B21E parseObject |
| 2935:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: call to 'joinViaRandomBootstrap' is missing an audited default for optional parameter 'limit' (CHT_DEFAULT_PARAM_VALUES has no…（×2） | B15 | → B15 可选参缺审计默认 |
| 2943:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 'truthRoute'; unresolved identifier 'truthNodeContents'; inline arrow '<anonymous>' -> __tN_lambda: unre…（×2） | B1 | → B1 hook 壳级联；级联：truthRoute/truthNodeContents + 内层箭头 peerId（B3/B5） |
| 2965:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: unsupported callee 'Capacitor.getPlatform'; unsupported callee 'Capacitor.getPlatform'; inline arrow '<anonymous>' -> __tN_lam…（×2） | B4 | → B4 宿主服务桥；多桶：B4 Capacitor.getPlatform ×2 + B3 peerId |
| 3044:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 'disposed'; call to 'generateScoreReport' is missing an audit…（×2） | B15 | → B15 可选参缺审计默认；多桶：B15 generateScoreReport.now + B1 disposed |
| 3061:9 | `const scoreLookup = useMemo(() => {` | cannot infer type for local 'scoreLookup' | B1 | → B1 hook 壳级联 |
| 3061:31 | `const scoreLookup = useMemo(() => {` | inline arrow '<anonymous>' -> __tN_lambda: new Map not supported in the transpiled subset; new Map not supported in the transpiled subset; for_of over unsupported iterab…（×3） | B7 | → B7 new Map 本地构造；根因行：new Map ×2 + for_of 源 undefined |
| 3070:9 | `const filteredNodes = useMemo(() => {` | cannot infer type for local 'filteredNodes' | B1 | → B1 hook 壳级联 |
| 3070:33 | `const filteredNodes = useMemo(() => {` | inline arrow '<anonymous>' -> __tN_lambda: array .filter block-bodied arrow: return type: unsupported type 'any'（×3） | B21B | → B21B any/unknown 参数与返回；根因行：filter 块体返回 any（B21B） |
| 3087:69 | `const mdnsCandidatePlaceholders = useMemo<CandidatePlaceholder[…` | inline arrow '<anonymous>' -> __tN_lambda: inline arrow '<anonymous>' -> __tN_lambda: parameter '_': unsupported type 'unknown'; Array.from over unsupported source（×3） | B21B | → B21B any/unknown 参数与返回；多桶：B21B param _ unknown + B8 Array.from |
| 3097:27 | `}, [mdnsCandidateCount, t.nodes_diag_mdns_peers]);` | property 'nodes_diag_mdns_peers' on unsupported receiver type 'Card[]' | B3 | → B3 locale 桥贯穿 |
| 3100:5 | `filteredNodes.length === 0` | unresolved identifier 'filteredNodes'；.length on unsupported receiver type 'undefined' | B1 | → B1 hook 壳级联 |
| 3106:28 | `const toggleSelectPeer = (peerId: string) => {` | inline arrow '<anonymous>' -> __tN_lambda: inline arrow '<anonymous>' -> __tN_lambda: parameter 'prev': unsupported type 'any'; inline arrow '<anonymous>' -> __tN_lambda…（×2） | B9 | → B9 updater typed input |
| 3114:27 | `const toggleSelectAll = () => {` | inline arrow '<anonymous>' -> __tN_lambda: property 'size' on unsupported receiver type 'str[]'; unresolved identifier 'filteredNodes'; .length on unsupported receiver t…（×2） | B12 | → B12 Set .size 属性读；多桶：B12 size + B7 new Set() 无源 + B1 级联 filteredNodes |
| 3122:29 | `const handleCreateGroup = () => {` | inline arrow '<anonymous>' -> __tN_lambda: property 'size' on unsupported receiver type 'str[]'; unsupported callee 'members       .slice(0, 3)       .map((member) => fo…（×2） | B16 | → B16 多语句/链式 lambda 与回调方法；多桶：B16 members.slice().map() 链 + B12 size + B1 级联 |
| 3160:13 | `useEffect(() => subscribeNetworkTelemetry(setRuntimeNetworkTele…` | inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 'setRuntimeNetworkTelemetry'（×2） | B26 | → B26 setter 一等值直传；根因行：订阅桥 setter 直传 |
| 3161:9 | `const localProfile = useMemo(() => {` | cannot infer type for local 'localProfile' | B1 | → B1 hook 壳级联 |
| 3161:32 | `const localProfile = useMemo(() => {` | inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 'diagnosticsPeerId'; .find arrow body not inlinable; cannot infer type for local 'fromNode'; unresolved …（×3） | B16 | → B16 多语句/链式 lambda 与回调方法；多桶：B16 find 块体 + B3 diagnosticsPeerId + B20 systemProfile |
| 3169:9 | `const globalResourceSummary = useMemo(` | cannot infer type for local 'globalResourceSummary' | B1 | → B1 hook 壳级联 |
| 3170:5 | `() => buildGlobalResourceSummary(nodes, nativeDiagnostics, loca…` | inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 'localProfile'（×3） | B1 | → B1 hook 壳级联 |
| 3171:19 | `[localPeerId, localProfile, nativeDiagnostics, nodes, runtimeNe…` | unresolved identifier 'localProfile' | B1 | → B1 hook 壳级联 |
| 3173:9 | `const osStats = useMemo(() => {` | cannot infer type for local 'osStats' | B1 | → B1 hook 壳级联 |
| 3173:27 | `const osStats = useMemo(() => {` | inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 'globalResourceSummary'; property 'osBreakdown' on unsupported receiver type 'undefined'; cannot infer t…（×3） | B1 | → B1 hook 壳级联；级联：globalResourceSummary + B9 param any |
| 3183:7 | `}, [globalResourceSummary.onlineCount, globalResourceSummary.os…` | unresolved identifier 'globalResourceSummary'；property 'onlineCount' on unsupported receiver type 'undefined' | B1 | → B1 hook 壳级联 |
| 3183:42 | `}, [globalResourceSummary.onlineCount, globalResourceSummary.os…` | unresolved identifier 'globalResourceSummary'；property 'osBreakdown' on unsupported receiver type 'undefined' | B1 | → B1 hook 壳级联 |
| 3185:9 | `const renderPieChart = () => {` | cannot infer type for local 'renderPieChart' | B1 | → B1 hook 壳级联 |
| 3185:26 | `const renderPieChart = () => {` | inline arrow '<anonymous>' -> __tN_lambda: return type: unsupported type 'any'（×2） | B21B | → B21B any/unknown 参数与返回；根因行：renderPieChart 返回 any |
| 3260:24 | `const openNodeChat = async (node: Node, action: NodeActionType)…` | inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 't'; property 'nodes_groupChatSuffix' on unsupported receiver type 'Card[]'; template span has unsupport…（×2） | B3 | → B3 locale 桥贯穿；多桶：B3 t + B4 socialGroupsCreate + B6 template span |
| 3335:39 | `const refreshSelectedNodeContents = async (peerId: string, useN…` | inline arrow '<anonymous>' -> __tN_lambda: call to 'syncDistributedContentFromNetwork' is missing an audited default for optional parameter 'options' (CHT_DEFAULT_PARAM_…（×2） | B15 | → B15 可选参缺审计默认；根因行：syncDistributedContentFromNetwork(options?) |
| 3364:29 | `const openContentDetail = (content: DistributedContent) => {` | inline arrow '<anonymous>' -> __tN_lambda: async await-split not enabled for this handler (no recv-done frame kind)（×2） | B14 | → B14 async await-split 未启用；根因行：async content detail handler |
| 3380:34 | `const openNodeDetailByPeerId = (peerIdRaw: string): void => {` | inline arrow '<anonymous>' -> __tN_lambda: cannot infer type for local 'existing'; ?? on unsupported type 'LedgerEntry[]'; unresolved identifier 'existing'; inline arrow…（×2） | B25 | → B25 ?? / optional-chain 类型流；多桶：B25 ?? LedgerEntry[] + B9 + B1 级联 |
| 3403:13 | `useEffect(() => {` | inline arrow '<anonymous>' -> __tN_lambda: unsupported callee 'targetPeerId.trim'; unresolved identifier 'targetRequestKey'; unresolved identifier 'targetPeerId'（×2） | B5 | → B5 props capture 类型流；根因行：props targetPeerId.trim + targetRequestKey（B5/B3） |
| 3416:28 | `const handleCreateNode = () => {` | inline arrow '<anonymous>' -> __tN_lambda: unresolved identifier 't'; property 'nodes_invalidPeerId' on unsupported receiver type 'Card[]'; inline arrow '<anonymous>' ->…（×2） | B3 | → B3 locale 桥贯穿；多桶：B3 t + B21B item:any + B4 |
| 3443:28 | `const handleSelectNode = async (node: Node) => {` | inline arrow '<anonymous>' -> __tN_lambda: unsupported callee 'sevenGatesRuntime.getSnapshot'; unsupported callee 'libp2pService.getPeerMultiaddrs(peerId).catch': .catch…（×2） | B4 | → B4 宿主服务桥；多桶：B4 sevenGatesRuntime.getSnapshot + B17 .catch continuation |
| 3635:7 | `<div className="h-full">` | jsx interpolation of composite expression 'selectedNodeContent && (           <Susp' not lowered (extractor carries text only) | B6 | → B6 JSX 复合插值与组件元素 |
| 3636:9 | `<NodePublishedContentPage` | jsx element 'NodePublishedContentPage': only lowercase host tags are lowered | B6 | → B6 JSX 复合插值与组件元素 |
| 3664:7 | `<div className="h-full">` | jsx interpolation of composite expression 'socialHint && (           <div className' not lowered (extractor carries text only) | B6 | → B6 JSX 复合插值与组件元素 |
| 3670:9 | `<NodeDetail` | jsx element 'NodeDetail': only lowercase host tags are lowered | B6 | → B6 JSX 复合插值与组件元素 |
| 3692:7 | `<Suspense fallback={<div className="fixed inset-0 z-50 bg-white…` | jsx element 'Suspense': only lowercase host tags are lowered (component elements need transpileR2c component inlining) | B6 | → B6 JSX 复合插值与组件元素 |
| 3709:26 | `{ key: 'all', label: t.nodes_sourceAll },` | property 'nodes_sourceAll' on unsupported receiver type 'Card[]' | B3 | → B3 locale 桥贯穿 |
| 3712:32 | `{ key: 'Connected', label: t.nodes_sourceDirect },` | property 'nodes_sourceDirect' on unsupported receiver type 'Card[]' | B3 | → B3 locale 桥贯穿 |
| 3717:5 | `<>` | jsx element '': only lowercase host tags are lowered (component elements need transpileR2c component inlining) | B6 | → B6 JSX 复合插值与组件元素 |

## 复现

```
node --max-old-space-size=16384 /tmp/r2c_t2/run-diags.mjs   # 收集（诊断 JSON 在 /tmp/r2c_t2/diags.json）
python3 /tmp/r2c_t2/map-loc.py && python3 /tmp/r2c_t2/attach-src.py   # opId→fact.loc→源码行
```

桶指派为逐位点人工归类（脚本内 ASSIGN 表），缺位即硬失败；降级方案引用的机制均为 `dist/csg-cheng-transpiler.js` 内已存在实现：R2cMap_<K>_<V> 双平行数组 Map 槽模型（TypeMapper + mapHelperTexts + `__r2cMapSet/Get/Has/Delete`）、Set→T[] 数组语义（jsSetContainsStr/Int、__r2cSetDedup）、R2C_HOOK_MEMBER_BRIDGES（t→__r2cT）、hostBridges/DEFAULT_R2C_HOST_BRIDGES、CHT_DEFAULT_PARAM_VALUES、STRUCT_PRESENCE_FIELDS、CHT_INTERFACE_SUPERS。
