# transpileClosure 事件闭包子系统 — 实现提案

状态：**propose**（2026-06-13；4-agent workflow wf_5edbb62b 设计，三路组件设计互校 + 真实代码锚点核实）。

## 目标
把 732 个 invoke no-op 事件闭包（function_value）从 no-op 接到 transpileClosure 真实执行，完成 React→Cheng 事件 handler 全覆盖（当前 471/1203 ≈ 39%）。

所有锚点、门禁、范式全部核实。三路设计互相一致且与真实代码吻合。现在产出完整 spec。

# transpileClosure 事件闭包子系统 — 可实现完整 Spec

## 锚点核实结论(已逐条比对真实代码)

三路设计引用的行号与符号全部命中,仅以下两处需修正后落地:
- materializer 文件含 NUL 字节,grep 默认当二进制静默 → 工具侧用 `rg -na`,不影响实现。
- runtime `invoke:` 段在 `WebSceneApplyEventEffectSegment:11346` 已是 `return 0`(no-op),但 `closure:` 段若进 effect 切段会落到 `:11365 return -1` 致 apply 失败 → **必须在 `WebSceneApplyNodeEventEffect:11497` 层放行,绝不让 closure 进 `WebSceneApplyEventEffect`**。这是双重执行/失败仲裁的根因点。

核实通过的关键事实:
- `transpileClosure(facts, closureFunctionId, emitName, freeVarTypes, externImpls)` 签名一致(transpiler.ts:1427-1433),`const:` 前缀走 constBindings 不进形参(:415-417)。
- `inferSceneEventActionInfo` 单出口 if 链:route(:2172)→inline state_delta(:2183)→stop(:2192)→body state_delta(:2205)→command 兜底(:2214)。closure 判定必须插在 **:2205 之后、:2214 之前**。
- `emitSceneEventHandlerFact:3109` fact 填充,`data.action:3136` 与 stateDeltas 同级。
- runtime 白名单 `WebSceneApplyNodeEventEffect:11502/11504`,accessor `ActionKindAt:11769`/`EffectAt:11779`,读写原语 `WebSceneStateValueForRef:11206`/`WebSceneSetStateValue:11295`(内置相等短路+markDirty)。
- mjs `__csg_scene_apply_event_to_node:4437`(ClearDirty:4441→ApplyNodeEventEffect:4442→refresh:4446),模块槽规避 cold `:4956-4958`,整数 if-链 switch 范式 `__csg_scene_prewarm_route_at:5650-5655`,M2 sync `__m2SyncTick:2650-2671`。
- 门禁脚本:`tools/interaction_regression_test.sh`(6 个 run_tap)、`ts-csg/scripts/scene-runtime-smoke-source.mjs`(route 44/44 + home 像素)、`csg-web-materializer-smoke.mjs`(handler 计数 route=116/state_delta=205/command=299/stop=5)。

---

## (1) 端到端数据流 — 每段精确改动文件+函数

```
materializer fact 生成
  └─ csg-web-materializer.ts: inferSceneEventActionInfo(:2168) 新增 closure 分支(夹在 :2205 后 :2214 前)
  └─ csg-web-materializer.ts: SceneEventActionInfo 类型(:2160) 加 closureId?/freeVars?
  └─ csg-web-materializer.ts: emitSceneEventHandlerFact(:3109) 把 closureId/freeVars 写入 fact.data.action
            ↓  fact: { actionKind:"closure", effect:"closure:<N>", closureId, freeVars:[{name,chengType}] }
transpiler 产物生成(在 scene-runtime 代码发射阶段)
  └─ scene-runtime-smoke-source.mjs: 新增 buildClosureWiring(coreFacts, sceneFacts)
       ├─ 对每个 closure fact 调 transpileClosure(coreFacts, closureId, "__closure_<N>", freeVarTypes, externs)  (复用 transpiler.ts:1427)
       ├─ 对每个 closure 发射 __closure_<N>_apply(): int32 薄包装(读 ForRef→纯算→写 SetStateValue)
       └─ 发射 __csg_scene_dispatch_closure(cid:int32): int32 整数 if-链(范式 :5650)
运行时注册(资产侧,零改动)
  └─ scene-runtime-smoke-source.mjs: 资产 writer effect 字段(:382-393) 直接写 "closure:<N>" 字符串,struct 布局不变
  └─ web_scene_runtime.cheng: WebSceneAddEventHandler*(:1758/1792) 签名零改动
tap 分派
  └─ web_scene_runtime.cheng: WebSceneApplyNodeEventEffect(:11497) 白名单加 closure → return true(放行,不进 ApplyEventEffect)
  └─ scene-runtime-smoke-source.mjs: __csg_scene_apply_event_to_node(:4437) 在 ApplyNodeEventEffect 后、refresh 前插入闭包分派
执行
  └─ __closure_<N>_apply: ForRef 读自由变量 → __closure_<N> 纯算 → WebSceneSetStateValue 写回(内置 markDirty)
            ↓  分派状态用模块槽 __csgSceneClosureStatus 接收(规避 cold,范式 :4958)
重算
  └─ scene-runtime-smoke-source.mjs: __csg_scene_refresh_effect_dirty_frame(:4514) 照常跑(routeRuntimeReady=[]/MarkRouteDirty/cssVariant/invalidate)
  └─ scene-runtime-smoke-source.mjs: __m2SyncTick(:2650) 从 canonical 单向拉镜像槽;非镜像 state 挂同构 rebind
```

**三路冲突仲裁(已对齐)**:写回路径有两个候选——runtime-dispatch 主张 `__closure_N_apply` 直接 `WebSceneSetStateValue(canonical)`;transpiler-emit 与 freevar-m2-boundary 主张走 `emitStateSlots` 的 `setX` 写镜像槽。**采纳 runtime-dispatch 的 canonical 直写**,理由:
- canonical 是唯一真相源,镜像槽只读(freevar-m2-boundary 边界裁定)。闭包写镜像槽会与 `__m2SyncTick` 拉取形成双写。
- `WebSceneSetStateValue:11295` 已内置相等短路+markDirty,等价于 setter 的 if-值变守卫,cold-safe。
- 下一帧 `__m2SyncTick:2658` 自然从 canonical 拉回镜像槽,M2 链零改动接住。

即:**闭包纯算用 transpileClosure 产出;读用 ForRef;写一律 canonical WebSceneSetStateValue,不写镜像槽不调 setX**。

---

## (2) 最小垂直切片 — 架构验证第一步

**选取标准**:当前落 `command` 兜底(actionKind=299 那批)、targetFunction 体内单条 `setX(literal)`、无控制流屏障、无 FFI、自由变量为空。

最简真实形态:`onClick={() => handleSelectFood()}`,helper `handleSelectFood` 体仅 `setCategory('food')`(单 setter + 静态字面量实参,零自由变量、零纯算)。当前它落 `command/invoke:`,点击不改 state。

完整改动清单(从 fact 到执行,7 处):

| # | 文件:函数 | 改动 |
|---|---|---|
| 1 | materializer.ts:2160 `SceneEventActionInfo` | 加 `closureId?: string; freeVars?: {name,chengType}[]` |
| 2 | materializer.ts:2205 后 / 2214 前 | 插 closure 判定:解析 helper名→targetFunction→资格门(无 await/branch_if/return/throw/try/for/while/FFI、freeVars 可映射)→算 freeVars。切片阶段资格门**只接受 freeVars 为空 + 单 setter literal** 的最窄子集,其余仍退 command |
| 3 | materializer.ts:3109 `emitSceneEventHandlerFact` | actionKind="closure",effect=`closure:<closureId序号>`,`data.action` 写 closureId/freeVars |
| 4 | scene-runtime-smoke-source.mjs 新增 `buildClosureWiring` | 调 `transpileClosure(coreFacts, closureId, "__closure_0", new Map(), externs)`;静态实参 `'food'` 走 `const:food` 注入(transpiler.ts:415);hard-fail on `!results.every(r=>r.ok)`(范式 smoke:2512) |
| 5 | 同上,发射 `__closure_0_apply():int32` | 体:`return scene.WebSceneSetStateValueInternal(__csgSceneGraph, "category", "food", true)`(直接 canonical 写,literal 折叠;此切片无 ForRef 读、无纯算) |
| 6 | 同上,发射 `__csg_scene_dispatch_closure(cid:int32):int32` | `if cid == 0: return __closure_0_apply()` … `return -1`(整数 if-链,范式 :5650) |
| 7 | web_scene_runtime.cheng:11502-11504 | 白名单:`if actionKind == "closure": return true`(放行,不进 ApplyEventEffect) |
| 8 | scene-runtime-smoke-source.mjs:4445 后 | tap 分派注入(见下) |

tap 分派注入(`__csg_scene_apply_event_to_node`,ApplyNodeEventEffect 成功后、refresh 前):
```
let hidx = scene.WebSceneFindEventHandlerForNodeEvent(__csgSceneGraph, activeRoute, nodeId, "click")
if scene.WebSceneEventHandlerActionKindAt(__csgSceneGraph, hidx) == "closure":
    __csgSceneClosureStatus = __csg_scene_dispatch_closure(__csg_scene_parse_closure_id(scene.WebSceneEventHandlerEffectAt(__csgSceneGraph, hidx)))
```
`__csg_scene_parse_closure_id` 用现成 `WebSceneStrStartsWith`/`SliceBytes`(:11343/11350 同款)取 "closure:" 后整数。分派状态落模块槽 `__csgSceneClosureStatus`(不在 if 分支内 `let = 调用`,规避 cold:4956)。

**切片验证目标**:点 food category 按钮 → canonical `category=food` → refresh 重算 → 对应 route 的 css variant 切换。这条打通即证明 fact→transpile→register→dispatch→execute→recompute 六段架构成立。

---

## (3) 分阶段实现顺序 + 每阶段门禁

每阶段门禁四件套,**全绿才进下一阶段,任一红回退本阶段改动**:
- **interaction 6/6**: `tools/interaction_regression_test.sh`(card→detail/back/search/sort/sidebar/blank)
- **transpile 3/3**: materializer-smoke 的 handler 结构化计数三类(route/state_delta/command/stop)分布稳定
- **route 44/44**: scene-runtime-smoke route-reachability 全可达
- **home 像素等价**: scene-runtime-smoke home 路由像素 digest 不变

| 阶段 | 范围 | 门禁守法(怎么不回退) |
|---|---|---|
| **阶段0 垂直切片** | 上节单 setter literal | 新分支只蚕食 command 中**资格门全过**的那部分,其余 299 个原样落 command。transpile 计数:command 减 N、新增 closure=N,**route/state_delta/stop 必须一字不变**(若变说明误吞了已分类 handler,立即回退)。interaction 6/6 不受影响(那 6 个是 route handler,走 :2172 早 return)。route 44/44 + home 像素:闭包只多写 canonical state,不动 layout/route 图,无闭包 fact 的路由字节相同 |
| **阶段1 单 setter 闭包(无自由变量)** | targetFunction 体含 1-2 个 `setX(literal/!x)`,仍零自由变量 | 同上门禁。新增:closure fact 的 setter 集必须与 sceneEventStateDeltasFromHandlerBody(:2250)抽出的 deltas 一致性自检(同一 handler 不能既 closure 又 state_delta,单出口保证)。double-exec 守:库白名单 return true 不进 effect 串 + 分派恰一次 |
| **阶段2 函数式 setX(setX(prev=>...))** | `setItems(items.filter(p))` 含纯算 | transpileClosure 的 filter/map monomorph+prelude 覆盖(已过 44/44 的 M2 路径同款)。`__closure_N_apply` 引入 ForRef 读 items→纯算→SetStateValue 写。门禁加:闭包改的若是 M2 镜像同名 state,`__m2SyncTick:2658` 拉回链不断(home 像素守);若非镜像 state,挂与 `__m2RebindHomeList:2595` 同构的幂等 rebind(diff `__m2LastTitle` 守 churn,home 像素不翻空帧) |
| **阶段3 props 回调** | handler 实参为非静态 state/props | 非静态实参作普通自由变量 emit 成形参,分派时 ForRef 取值传入(范式 :2658)。props 走 `const:` 内联或 externs(范式 buildM2HomeWiring externImpls:2499)。门禁全套 + closure.results !ok 即 hard-fail 不发 fact(不伪造) |

**门禁回退判据(统一)**:每阶段改动后跑全套四门;若 transpile 的 route/state_delta/stop 计数偏移 → 误分流,回退;若 home 像素 digest 变 → churn 帧或镜像双写,回退;若 route<44 → refresh 重算被破坏,回退;若 interaction<6 → route handler 被误吞,回退。

---

## (4) 本期明确不做

- **async/await**: targetFunction 体含 `await` opKind 或 `fn.async` → 退 command。异步副作用顺序不可在单次 dispatch 复现(屏障 SCENE_HANDLER_BODY_CONTROL_BARRIERS 已含 await:2238)。
- **多语句副作用 + 控制流屏障**: `branch_if/return/throw/try/for/while` 之后还有 setter → 退 command。保证单次 dispatch 行为确定。
- **跨组件 props 解析**: props 来源跨组件、需运行时解析 props 链的 → 退 command。仅本组件作用域可推断类型的自由变量入闭包。
- **FFI / 平台容器调用**: callee 既不在 transpiler 白名单又非可解析本地 helper → 退 command(command 通道拿不到 externImpls,直接排除不贴桩)。
- **返回 JSX / 渲染 props 的 handler**(非纯状态副作用)。
- **裸 Date.now/Math.random**: 时间走已有 `jsDateNow`/`jsSetNowMs`(transpiler.ts:355-365)+`__m2NowMs` 推进;random 本期闭包不涉及(若出现须新增 `jsRandom` prelude 读确定性种子槽,本期不做)。

退化一律原样落 command(现状 no-op),**零回归,绝不降级伪造**。

---

## (5) cold-safe 落地要点 + 双重执行仲裁

**cold-safe 六条(生成代码必须遵守,均有 smoke 注释实证)**:
1. 分派状态用模块槽 `__csgSceneClosureStatus` 接收,**不在 if 分支内 `let = dispatch调用`**(:4956 "cold miscompiles let of a call result inside a branch")。
2. `__closure_N_apply` 写回用整调用 `WebSceneSetStateValue(graph,...)`,**不做 `graph.stateEntries[i].value=x` 裸元素 store**(:4517 "bare element stores after calls get miscompiled")。
3. dispatch switch 用 `if cid==K` 整数比较 + `return` 直返,**不用 match/fallthrough**(范式 :5650 已验证)。
4. 读 state 的 `let v = ForRef(...)` 放函数体顶部、所有写之前,**不夹在调用之间**(范式 refresh 把整组 reset 放最前 :4517)。
5. 整数组重置用 `__x = []` 形式且置于所有 call 之前;闭包体内不直接改数组元素(状态写一律走标量 SetStateValue)。
6. `effect` 解析 "closure:" 用现成 `WebSceneStrStartsWith`/`SliceBytes`(:11343/11350),**不引入新字符串扫描**;`emitName` 须是合法 Cheng 标识符(closureId 派生 hash,不直接拼特殊字符)。
   闭包纯算体由 transpileClosure 产出,本身已过 44/44 cold 安全。

**双重执行仲裁规则(三层互斥,保证恰好跑一次)**:
1. **库侧不执行**: `WebSceneApplyNodeEventEffect:11502` 对 closure `return true` 放行,**绝不进 `WebSceneApplyEventEffect`**。这是关键——`closure:` 段若进 `WebSceneApplyEventEffectSegment` 会落 `:11365 return -1` 使 apply 失败。漏改库白名单 = apply 直接报错(fail-loud,不会静默双执行)。
2. **generated 层执行一次**: `__csg_scene_apply_event_to_node` 在 ApplyNodeEventEffect 成功后调 `__csg_scene_dispatch_closure` 恰一次。
3. **单 actionKind 出口**: 同一 handler 在 `inferSceneEventActionInfo` 的 if 链只落一种 actionKind(closure 与 state_delta 互斥),`closure` 不写 effect 串只存 `closure:N` 作分派载体 + trace,不被 effect 路径执行。
4. **写回单一真相源**: 闭包只写 canonical(`WebSceneSetStateValue`),不写镜像槽。`__m2SyncTick:2658` 从 canonical 单向拉镜像,双层幂等守卫(sync 侧 `sq != __home_searchQuery` + SetStateValue 内置相等短路)吸收重复,canonical 不变则不置 dirty、rebind 不跑,杜绝镜像/canonical 双写 churn。

**相关文件绝对路径**:
- `/Users/lbcheng/cheng-lang/ts-csg/src/csg-web-materializer.ts`(inferSceneEventActionInfo:2168 / SceneEventActionInfo:2160 / emitSceneEventHandlerFact:3109)
- `/Users/lbcheng/cheng-lang/ts-csg/src/csg-cheng-transpiler.ts`(transpileClosure:1427 / transpileWithInjectedParams:404 / emitStateSlots:1508)
- `/Users/lbcheng/cheng-lang/ts-csg/scripts/scene-runtime-smoke-source.mjs`(__csg_scene_apply_event_to_node:4437 / refresh:4514 / __m2SyncTick:2650 / __m2RebindHomeList:2595 / prewarm if-链范式:5650 / 资产 writer effect:382)
- `/Users/lbcheng/cheng-lang/src/core/runtime/web_scene_runtime.cheng`(WebSceneApplyNodeEventEffect:11497 / Segment:11340 / accessor:11769,11779 / ForRef:11206 / SetStateValue:11295)
- 门禁:`/Users/lbcheng/cheng-lang/tools/interaction_regression_test.sh`、`/Users/lbcheng/cheng-lang/ts-csg/scripts/csg-web-materializer-smoke.mjs`、`/Users/lbcheng/cheng-lang/task_plan.md:495`