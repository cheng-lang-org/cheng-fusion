# P3 async 执行模型：事件驱动续延 + 真 host 异步 I/O 回投(降 invoke 主战役)

## 一页结论

CHT 同步路径实测天花板只 ~58/399 sites 可忠实编(realistically ~15-25),**~341 永久不可编**(138 DOM无原生/async + 203 prop-callback)。其中 **async 占 16 handler / 51 sites**——这是"假死",不是真死:async handler = "读 state → await 真后端 I/O → 用响应更新对象 state",只要换执行模型就能忠实原生编。P3 把它们编成**事件驱动续延**(非轮询),把 async 51 sites 从 dead 转 closeable,加上 P1 同步集,realistically 399 → ~290。这是材料性降 399 的主路。

**前置**:依赖 P1 对象 state slot 分解(响应/续延帧都是对象)。**严禁 mock**:await 的 I/O 走真 libp2p/http/sqlite provider,续延携带真响应,完成用事件回投(不轮询)。

## 实测形态(grounded)

- 16 async handler / 51 sites。**5 个 ≤1 await**(P3.1 首批):`refreshProofStatus`(3)、`handleSendLocation`(4)、`toggleAsiSession`(2)、`handleBackPress`(4)、`handleFileSelect`(5);**11 个 >1 await**(链式,P3.3)。
- I/O surface(host 桥面):`getLatestByopProof`、`resolveDistributedContentDetail`、`createMessage`、`createUnifiedOrder`、`submitByopProof`、`resolveSynccastRoomId`…全是真后端操作,原生对应=已存在的 libp2p/http/sqlite provider。
- 典型体:`const r = await getLatestByopProof(activeOrder.orderId); setActiveOrder(r.order); setProofVerification(r.verification)`。= 同步前奏(读 activeOrder.orderId 槽)→ async I/O(getLatestByopProof)→ 续延(写 activeOrder/proofVerification 对象槽)。

## 核心架构(事件驱动,非轮询)

handler 体在每个 `await` 处切成同步段 S0,S1,…,每段一个 Cheng fn:

1. **await-splitting(transpiler)**:CFG 在 await 切段。S0 在触发事件上跑:读槽、发起 async I/O、`return`(挂起)。S_{k+1} 在 I/O 完成时跑。
2. **续延帧(frame)**:跨 await 存活的 locals + handler 的槽 → 一个 frame(对象 state 槽,复用 P1 分解),按 `(handlerId, token)` 键存;挂起时 capture,恢复时 restore。无堆栈魔法,纯数据槽。
3. **async I/O 桥**:每个被 await 的 callee → 一个 `@importc` host 桥,在 runtime 的**真异步 provider**(libp2p/http/sqlite,非阻塞)上发起操作 + 注册完成回调。桥签名:`fn chtAsyncCall(token: int64, ...args): void`,不阻塞返回。
4. **完成事件队列**:I/O 完成 → host 把续延事件 `(handlerId, token, resultRef)` enqueue 进场景事件环;帧泵(已有的 input-consume 阶段)drain 它。**事件驱动,非轮询**(契合移动端原则)。
5. **续延派发**:`fn __cht_resume(graph, handlerId, token, resultRef): int32` 按 (handlerId, token) 路由到对应段,restore frame,绑定 result,跑该段(可再挂起 → 链式)。

与现有 CHT 关系:S0(前奏)像 compiled handler 一样经 `__cht_apply` 派发(`compiled:`);续延经新的续延事件 + `__cht_resume`。两条派发路径并存。

## 阶段与门禁(每阶段 cht-measure + 设备 data-hash 回环验证)

| 阶段 | 内容 | 门 |
|---|---|---|
| **P3.0** | 对象 state slot 分解(对象→标量字段槽;P1 对象机制) | 对象 state 读写编译通过;逐字段 hash 对照 |
| **P3.1** | 单 await 切段 + frame capture/restore + 完成事件派发 | `refreshProofStatus` 端到端:发起 I/O→完成事件→续延更新 state,data-hash 一致 |
| **P3.2** | async I/O 桥接真 provider(libp2p/http/sqlite)的 I/O surface | 设备真网络回环(同 麦田 秒发 的 CSG-code 验证法) |
| **P3.3** | 链式 await(≥2)+ try/finally(错误/cleanup) | 11 个多-await handler;finally 清理槽正确 |
| **P3.4** | prop-callback 解析(no-fid 203:把 onX prop 解析到其场景-action 实现,凡映射到已编 handler 的) | 解析率 + cht-measure |

每阶段:propose 已合 → apply 单阶段 → cht-measure 量化 invoke_sites + 设备 data-hash 回环 → archive。撞"无真 provider/无原生忠实语义"立即停、标天花板,绝不 mock/fallback。

目标:399 → ~290(async 51 + 同步 15-25 + 部分 prop-callback)。

## 不做什么(显式天花板,诚实边界)

- **不 mock async I/O**:await 的后端操作必须走真 libp2p/http/sqlite provider;无真 provider 的 callee → 该 handler 不编,明列。
- **不轮询**:完成必须事件回投(host enqueue 续延事件),不在帧里 spin/poll。
- **不解 DOM 无原生**:`selectionStart`/`preventDefault`/`elementFromPoint`/逐维 scroll 几何 → 相关 handler 永久 uncompiled。
- **不堆栈魔法**:续延是纯数据 frame(标量字段槽),不实现协程/栈切换;跨 await 存活值必须可分解成标量槽,不可分解的 handler 不编。
- **不动 op-lane**:cold 后端/typed_expr WIP 不碰;P3 在 ts-csg 转译线 + 场景运行时桥 + host C provider 接线。

## 与已落基础的关系

- 已落 3 块忠实砖:trampoline-unwrap、int64 slot、box-ref-scalar slot(均零回归)。
- P3.0 对象 state = 这些砖的同族扩展(标量槽 → 字段槽集)。
- 完成事件/续延派发复用已验证的帧泵 + 场景事件环 + `__cht_apply` 派发骨架。
- async I/O 桥复用已验证的 libp2p/http/sqlite provider(codex/src/core/runtime/*_provider.cheng)+ 麦田 秒发 同源的真网络栈。
- 验证法 = 已验证的 CSG-code data-hash 回环(非截图),设备间真跑。
