# M3 只读普查与退役清单分析(r2c 战役)

日期:2026-09-15。口径:全部数字来自实跑,脚本与产物路径见文末。facts=`/private/tmp/facts-v11-full.jsonl`(857306 行),驱动=`ts-csg/dist/csg-cheng-transpiler.js`(工作副本,未重建)。

## 一、全组件普查矩阵

- 123 个 .tsx → 去重 121 个组件名;111 个在 facts 解析到函数,**10 个未在 facts**(AstrologyMain、BaziMain、ErrorBoundary、GameIcons、AstrologyGuideCards、Chart、Resizable、Sonner、Main、ZiweiMain)。
- fn 口径:ok 合计 7 / fail 108;**有产出组件(fn ok>0)5 个**,其中 4 个是 probe/smoke 组件(CapHoistProbe、CaptureProbe、MapProbe、R2cProbe),唯一有 ok fn 的业务组件是 DappComputerUseSettingsPanel(1 ok / 1 fail)。槽合计 289,refs 46。

### unsupported 类分布(与 M2 同口径,class==='unsupported')

- **零 unsupported:17 个组件名**(其中 10 个是 NOT_IN_FACTS 未实际尝试;真实转译尝试且干净的只有 7 个:App、CapHoistProbe、CaptureProbe、MapProbe、SmokeApp、LanguageSelector、PaymentConfigSection)。
- **剩余 unsupported 总量:747 条**,落在一个非 HomePage/NodesPage 组件上。Top:
  | 组件 | unsupported |
  |---|---|
  | ProfilePage | 220 |
  | EcomProductDetailPage | 63 |
  | FortuneResultModal | 44 |
  | PublishProductWizard | 33 |
  | ProductDetailPage / PublishVideoWizard | 各 28 |
  | PublishContentPage / TradingKlineChart | 各 24 |
  | C2CTradingPage / PublishBasePage | 各 21 |
  | NodesPage | 17 |
  | GameShell | 17 |
- HomePage unsupported=5、NodesPage=17,与 M2 收尾数字一致(交叉验证通过)。

### 全类 exclusion 分布(共 994 条)

unsupported 747(75.2%);具名类合计 247(24.8%):host-icon 113、jsx-component-element 43、struct-presence 26、domain-bridge 21、effect-cleanup 10、host-listener 8、async-await 6、route-page 5、host-global 4、host-capacitor 4、catch-continuation 4、host-eventsource 2、find-presence 1。

### 重大口径发现:lazy 包装误解析遮蔽 26 个路由页

**26 个组件的普查条目转译的不是组件本体**,而是 App.tsx L66 起的 `const X = lazy(() => import('./components/X'))` 绑定(名字 first-match 撞车;诊断=`unsupported callee 'lazy'` + `return type: unsupported type 'typeof import("$root/app/components/X")'`,每组件恰好 2 条、fnTotal=1)。名单:ChatPage、ContentDetailPage、EcomFeedPage、PublishVideoPage、LiveStreamPage、BaziPage、ZiweiPage、TradingPage、ChessPage、DouDiZhuPage、MahjongPage、MinecraftPage、WerewolfPage、AppMarketplace、GovernanceConsolePage、SevenGatesPage、UpdateCenterPage、PublishAdPage、PublishFoodPage、PublishProductPage、PublishRidePage、PublishSecondhandPage、4 个 PwaSmokePage。
**这 26 个(含几乎全部游戏/交易/聊天主页面)的真实转译状态在本次普查中是未知的**——普查数字"106 个零解锁"被此遮蔽放大。修复=transpileR2c 组件名解析加 owner/file 域限定(materializer 已有同款 owner-scoped resolution 先例)。

### 搜索/排序业务 fn 确认

displayContents(HomePage.tsx L463,useMemo)、handleCategoryChange(L418,useCallback)、resetToSmartSort(L455,useCallback)、searchQuery(L161,useState)全部是 HomePage 组件体内 hooks,**均在 facts 清单**(csg.function/标识符名分别出现 5/2/2/32 次)。它们随 HomePage 本体转译(当前 5 条 unsupported 之外的主障碍是全类诊断里的 effect-cleanup/host-listener/async-await 具名类)。

## 二、快照模型退役清单

### 数据文件/生成器位置

| 角色 | 位置 |
|---|---|
| 44 路由采样表(现 46 项) | `ts-csg/scripts/unimaker-one-click.mjs` L412-475(`routeId → rootSource/rootComponent`) |
| 事件表生成器(文本匹配器族) | `ts-csg/src/csg-web-materializer.ts` `inferSceneEventActionInfo` + `attachSceneEventHandlerFact`(~L8930),发射 `csg.web.scene.event_handler` facts,effect=`route:/state:/command;invoke:<handlerText>` fallback |
| 运行时源生成 | `ts-csg/scripts/scene-runtime-smoke-source.mjs` `emitSceneRuntimeSmokeSource`(L1788)/`emitSceneMobileRuntimeSource`(L11188) → `unimaker-react.scene-runtime.cheng` |
| 产物(r50 现役) | `ts-csg/src/.gen/unimaker-r50-multiroute/`:scene-manifest.json(36 路由/7926 节点/1485 handlers)、scene-data .bin、route-reachability/route-edge-details.json、scene-runtime.cheng |
| no-op 普查口径 | `ts-csg/scripts/scene-action-coverage.mjs`(invoke segment 计数);272=2026-06-12 facts 普查 distinct `invoke:*` no-op(proposal L7/L23) |
| CHT(已存在的双轨) | 同文件 `buildCompiledHandlerTable`(L6997):把 `invoke:*` handler 编译为真 cheng 函数并**原地改写** effect→`compiled:/external-publish:/file-picker:`;one-click L1125-1129 已接线 |

### 退役影响面(消费方)

1. `unimaker-one-click.mjs` 四步管线(extract→materialize→compile→run)——materialize 快照步是退役对象本体。
2. scene-runtime.cheng + .bin data asset:运行时按 effect 串解释分发(表解释执行的执行面)。
3. `unimaker-apk-build.mjs`(APK 线):消费同一 scene runtime/data asset 链。
4. `scene-action-coverage.mjs` + `csg-web-project-gate` 等审计门(no-op 普查=0 的验收即在此口径)。
5. `html-csg-render/pixel-diff/navigate` 像素 oracle 线(M3 验收"不低于现基线"的对拍面)。
6. route-reachability/route-edge-details:路由图审计,退役后由 routeId 投影继续承担。

### r50 现状数字

manifest 1485 个 handler 全部已分类(0 个 unclassified):route=161、state_delta=1029、command=279、stop_propagation=12、media_lifecycle=4。即文本表已"追平"采样面,但 100% 仍是表解释执行;272 distinct no-op 是 facts 层口径(采样点之外的 handler 落 `invoke:<text>` fallback 无实现)。

### M3 退役分步建议(先双轨后切换;只分析不实施)

1. **第一步(前置)**:修 lazy 入口误解析 + 完成 26 个路由页本体转译——没有组件本体就谈不上退役表。
2. **双轨扩展(已有先例,非新机制)**:CHT 已把 invoke:→compiled: 原地改写并真编译(M2 已接 one-click)。M3 把 CHT 覆盖从现在的部分 handler 扩到全部 route/state_delta/command 族;每扩一族跑一次像素 oracle 对拍,表仍在位,格式 `compiled:` 生效即自动短路表解释——这是天然的双轨开关,不需要新轨道机制。
3. **切换**:像素 oracle 全路由对拍不低于基线后,把 44 路由表从"渲染+事件真值"降级为"routeId 投影"(路由可达性审计保留),materialize 步停止产出事件表。
4. **退役验收**:scene-action-coverage 口径 invoke segment=0(272 清零)+ 采样表 effect 全部 compiled:/route: + oracle 对拍记录绑定哈希。

## 三、全组件编译差距(top5 非 HomePage/NodesPage 归因)

### ProfilePage(220)
- **自定义 hook 返回解构→槽缺失(~51+30 条)**:`useVpnNode()/useC2cMaker()/useDistributedNode()` 返回解构(L587-615)不产槽,50+ 标识符 unresolved + 30+ binding_extract path 推断失败。= **通道问题**(useState 槽机制已实装,缺"自定义 hook 返回→槽"通道)。
- undefined 接收者/模板 13 条是其下游(槽无类型→undefined)。
- 另有 host-icon 44 条(具名类,新通道)、少量 memo/fn 类型流。

### EcomProductDetailPage(63)
- 根因单一:**props 解构 `{ product }` 的可选 prop 类型流缺失** → `unresolved 'product'`/`property 'skus' on undefined`/flatMap 等链式失败。= **通道问题**(props 类型合成/可选 prop 窄化;setter 类型流机制已有,未覆盖 props 入口)。

### FortuneResultModal(44)
- 根因单一:**useMemo 返回对象解构**(`const { baziResult, ... } = useMemo(...)`)不产绑定 → baziResult unresolved×8 + gan/zhi/yearPillar 等 undefined 属性/模板 ~30 条。= **通道问题**(useMemo mount 语义已实装,缺 binding_extract 穿 memo 返回值)。

### PublishProductWizard(33)
- 混合:`return type 'any'`(canProceed 等,extractor 局部 fn 类型流,= **通道延伸**,task_plan 已标 extractor 深水)、`console.log`×2(小桥,**新族但极小**)、`splice`×2(已有 push/spread 降级先例,通道)、optional-chain `.trim`(已有 optional-chain 部分支持,通道)。

### ProductDetailPage(28)
- **100% 同一族**:局部 render 助手 fn(renderImageCarousel/renderPriceSection/renderSKUSelector)`return type 'any'` → `cannot infer type for local`。= **通道问题**(extractor 对组件内局部 function 的返回类型流;与 task_plan "局部类型推断 52" 同族)。

### 通道 vs 新族总结

| 类别 | 族 | 规模(条) | 备注 |
|---|---|---|---|
| 通道(已有机制未触达) | lazy 入口名解析 | 26 组件(52 条) | 修后 26 页真实状态才可见,是 M3 第一优先 |
| 通道 | 自定义 hook 返回→槽 | ~80(ProfilePage) | useState 槽机制扩展 |
| 通道 | useMemo 返回解构绑定 | ~44(FortuneResultModal) | useMemo 已实装 |
| 通道 | props 解构/可选 prop 类型流 | ~63 + 45 个 UI primitives 各 1 条(`ComponentProps<...>` 参数族) | props 入口类型合成 |
| 通道 | 局部 fn/lambda 返回 any(extractor 类型流) | ~60+(ProductDetailPage 全部、wizard、masonry 等) | extractor 深水,已知 |
| 通道 | struct-presence 注册 | 26 | 机制已有,按 struct 补注册 |
| 新族(需新机制) | host-icon 图标通道 | 113(具名类) | 已列 M3 icon channel(lucide 资产) |
| 新族 | jsx-component-element 组件内联 | 43(具名类) | transpileR2c 组件内联,已知 M3 项 |
| 新族(小) | 正则字面量(test) | ~4(AddressManager 等) | 可先桥 `RegExp.test` |
| 新族(小) | console.log / Array.from({length}).map / 复合表达式插值 | 各 1-6 | extractor 文本-only 的已知响亮 fail 面 |

结论:剩余 unsupported 的主体不是未知机制,而是 6 条已实装机制的"最后一跳"通道(lazy 入口解析、自定义 hook 槽、memo 解构、props 类型流、局部 fn 类型流、presence 注册)+ 2 个已列计划的新通道(icon、组件内联)。先修 lazy 入口解析(否则 1/5 组件状态不可见),再按 ProfilePage/EcomProductDetail/FortuneResultModal 三族的通道逐条清偿,unsupported 面预计可从 747 压到 200 以内(以 icon 43+内联另算)。

## 附:实跑产物

- 普查:`/tmp/census-v11.json`、`/tmp/census-v11.md`(node scripts/r2c-all-census.mjs,121.7s)
- unsupported 类逐组件(含 innermost 族):`/tmp/unsup-by-comp.json`(probe_all_unsup.mjs,125s)
- 全类分布:`/tmp/class-global.json`、关键组件明细 `/tmp/class-detail.json`
- 只读探针:`/tmp/probe_all_unsup.mjs`、`/tmp/probe_class_global.mjs`、`/tmp/probe_class_detail.mjs`
