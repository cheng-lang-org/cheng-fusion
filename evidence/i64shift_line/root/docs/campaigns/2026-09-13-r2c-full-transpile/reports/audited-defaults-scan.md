# audited-defaults-scan：HomePage/NodesPage "missing an audited default for optional parameter" 审计

- 日期：2026-09-14
- 口径：`transpileR2c(facts, componentName)`（与 r2c-all-census.mjs 一致，无 options），facts = `ts-csg/tmp/r2c-census/unimaker-facts-v6.jsonl`
- 扫描范围：HomePage、NodesPage 两个组件闭包的全部诊断，reason 含 `is missing an audited default for optional parameter`

## 总量

- 诊断实例：14 条（同一源调用在 sync/async 双胞胎 lambda lowering 中各报一次，故每对成偶数）
- 唯一 (callee, param) 对：5 个
- 可登记建议行：4 条
- 不可登记（错绑缺陷）：1 对（`joinViaRandomBootstrap.limit`，见 §2）

## 1. 建议表

| 键 (fnName.paramName) | 源码默认值 | 建议 cheng 行 | 审计依据（源码行号） |
|---|---|---|---|
| `prefetchFastPlaybackSegment.signal` | 无初始化器，`signal?: AbortSignal`；JS 语义默认 `undefined` | `"0"` | 声明 app/data/p2pMedia.ts:4551；唯一用途 `if (signal?.aborted)` p2pMedia.ts:4554，nullish 等价；调用点 HomePage.tsx:603 `prefetchFastPlaybackSegment(fastRef, content.userId)` 传 2 实参 |
| `scheduleRefreshNativeStatus.immediate` | `immediate = false` | `"false"` | 声明 NodesPage.tsx:2740；0 实参调用点 NodesPage.tsx:2779、2804、2906（其余调用点均显式传 `true`，不触发本路径） |
| `generateScoreReport.now` | `now = Date.now()` | `"jsDateNow()"` | 声明 app/libp2p/peerScore.ts:474；调用点 NodesPage.tsx:3048 `const peers = generateScoreReport();`；与既有 `finalizeRoomVoiceSessions.updatedAt` 同形，且 transpiler 对该值自动加 `jsDateNow` prelude（csg-cheng-transpiler.ts:5949） |
| `syncDistributedContentFromNetwork.options` | `options: {...} = {}` | `"0"` | 声明 app/data/distributedContent.ts:5695；调用点 NodesPage.tsx:3349 `await syncDistributedContentFromNetwork(normalizedPeerId);` 传 1 实参；沿用既有先例 `startDistributedContentSync.options → "0"`（distributedContent.ts:6148 同文件同形默认 `{}`） |

### 可直接追加到 CHT_DEFAULT_PARAM_VALUES（ts-csg/src/csg-cheng-transpiler.ts:1469）

```ts
  // audited-defaults-scan.md 2026-09-14：HomePage/NodesPage 扫描（facts v6）
  ["prefetchFastPlaybackSegment.signal", "0"],
  ["scheduleRefreshNativeStatus.immediate", "false"],
  ["generateScoreReport.now", "jsDateNow()"],
  ["syncDistributedContentFromNetwork.options", "0"],
```

## 2. 不可登记项（必须如实标注）

**`joinViaRandomBootstrap.limit` —— 名字碰撞错绑，登记默认值会改变语义，禁止按本表修复。**

- 诊断来源：NodesPage.tsx:2940 `void joinViaRandomBootstrap();`
- JS 词法作用域下该调用的真实被调是**组件局部 const**：NodesPage.tsx:2912 `const joinViaRandomBootstrap = async () => {`，**0 参数**——本不存在缺参，诊断本身是绑定缺陷的症状。
- facts v6 中名为 `joinViaRandomBootstrap` 的 csg.function fact 只有一条：app/libp2p/service.ts:1891 类方法 `async joinViaRandomBootstrap(limit = 3)`（已用 `TranspilerFactIndex` 实测 `functionByName.get("joinViaRandomBootstrap")` → service.ts:1891）。
- 局部 const（NodesPage.tsx:2912，内部调 `libp2pService.joinViaRandomBootstrap(3)` 后做 `parseObject`/`setNodes` 等页面状态更新，NodesPage.tsx:2921 起）没有被提取为可绑定 fact，emitCall 落到模块级 `functionByName` 命中 service 方法。
- 若登记 `["joinViaRandomBootstrap.limit", "3"]`，发射 `joinViaRandomBootstrap(3)` 会静默改调 service 方法、跳过局部 const 的全部状态更新——语义改变，违背"audited default 只补缺席实参、绝不伪造"的表契约。
- 正确修复方向（归 T 线，非本表）：facts/绑定层须把组件局部 const 与模块级同名函数按精确身份区分（组件词法遮蔽），而不是靠名字先到先得。

## 3. 诊断实例明细（14 条 → 5 对）

| (callee, param) | 组件 | 诊断数 | 涉及 lambda |
|---|---|---|---|
| prefetchFastPlaybackSegment.signal | HomePage | 2 | __t53/__t54 |
| scheduleRefreshNativeStatus.immediate | NodesPage | 6 | __t51/__t52、__t55/__t56、__t59/__t60（3 个调用点 × 双胞胎 lowering） |
| joinViaRandomBootstrap.limit | NodesPage | 2 | __t63/__t64 |
| generateScoreReport.now | NodesPage | 2 | __t69/__t70 |
| syncDistributedContentFromNetwork.options | NodesPage | 2 | __t103/__t104 |

## 4. 复现命令

```sh
node --input-type=module -e '...transpileR2c(facts, "HomePage"|"NodesPage")...过滤 reason 含 "missing an audited default for optional parameter"'
```
绑定验证：`new TranspilerFactIndex(facts)` 后查 `functionByName.get(calleeName)` 的 loc（本审计已实测，结论见 §2）。
