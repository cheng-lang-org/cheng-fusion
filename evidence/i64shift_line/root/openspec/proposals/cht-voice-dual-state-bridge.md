# CHT 语音双态桥提案 —— ChessPage.handleClose 闭包生产级桥接

状态: 待编排者审阅 → 审后入库 `openspec/proposals/`
流程: OpenSpec 四步闭环(本文档=propose;下一步用户确认→apply→archive)
取证基线: wl6naqar0 诊断底稿 + 本文档新增的逐方法源码复核(2026-07-15,UniMaker HEAD)
版本: **r2**(2026-07-15,收 w9jsz39z7 对 r1 的四条 mustFix 复核意见,逐行重新核对 UniMaker/cheng-lang 源码后修订;改动点见 §2 第1条/§3.2/§3.3/§3.4/§4/§6/§7,均标注"r2")

---

## 0. 已批决策(原样记录,不复述背景)

用户 2026-07-15 决策:
(a) 立项批 —— CHT 语音双态桥(headless/设备)战役正式开工。
(b) 双态桥批 —— 架构红线: **headless 宿主必须是契约的诚实实现**。无设备 → 会话不可启动 / 枚举为空 / 状态机停在无设备态。严禁伪造语音成功、伪造 track、伪造信令回执——那是 Mock。设备宿主 = 真 WebRTC。**编译期按宿主选实现,生成物单一路径,无运行时探测 fallback。**

本文档是**纯文书任务**,零代码改动;主树 `/Users/lbcheng/cheng-lang` 与 `/Users/lbcheng/UniMaker` 全程只读取证。

---

## 1. 目标

把 `ChessPage.tsx` 的 `handleClose` 闭包(及其依赖数组传递闭包的完整调用链)编译进 CHT(Compiled Handler Table),使其 `invokeSites → 0`,在两种真实宿主下都产出诚实行为,不引入任何运行时宿主探测分支。这是解锁 v35 装配的两个前置条件之一(另一是 gate 绿)。

---

## 2. 取证范围与口径修正

读取范围(逐行核实,非转述 wl6naqar0):
- `UniMaker/React.js/app/components/ChessPage.tsx`(1984 行,`handleClose` 及其 useCallback 依赖闭包 `finalizeRoomVoiceSessions`/`handleVoiceAction`/`leaveCurrentRoom`/`releaseVoiceRuntime`/`ensureLocalVoiceMedia`/`hydrateIceConfig`/`sendCallEnvelope`/`sendRealtimeEnvelope`/`applyOutgoingEnvelope`/`matchesRoomVoiceSession`/`stopStreamTracks`/`clearVoiceTimers`/`clearQueuedVoiceIceCandidates`)
- `UniMaker/React.js/app/libp2p/realtimeSessionStore.ts`(1036 行,类 `RealtimeSessionStore`,只读其被调的 5 个公开方法)
- `UniMaker/React.js/app/libp2p/service.ts`(单例 `libp2pService`,只读 `isNativePlatform`/`primeDirectPeer` 两个直调点)
- `UniMaker/React.js/app/libp2p/uiDirectMessageFlow.ts`(`prepareUiDirectRoute` 的 `UiDirectMessageBridge` 结构类型)
- `UniMaker/React.js/app/App.tsx`(1118 行 `<ChessPage roomId={currentApp.roomId} onClose={closeCurrentApp} />`,`roomId` 真实来源)
- `cheng-lang/ts-csg/src/csg-cheng-transpiler.ts`(CHT 转译器核心,`hostBridges`/`hostObjects`/`boxRefSlots`/`objBoxRefSlots`)
- `cheng-lang/ts-csg/scripts/scene-runtime-smoke-source.mjs`(`CHT_HOST_GLOBALS`/`CHT_HOST_BRIDGES`/`CHT_BRIDGE_IMPLS`/`CHT_RECV_DONE_SEND_BRIDGES` 的具体登记项;5662 行起的整 handler effect 硬编码先例)
- `cheng-lang/ts-csg/src/csg-core.ts`(r2 新增读取:`emitExpression`/`emitCall` 的 `memberName`/`callee` op fact 生成,1944 行 catch 零绑定假阳性)
- `cheng-lang/ts-csg/src/cheng-source.ts`(r2 新增读取:6130 行 `__ts_csg_setInterval` 等无关兜底路径的恒等空转占位符,排除误引为"等价机制")
- `UniMaker/React.js/app/libp2p/service.ts`(r2 新增读取:109 处 `.catch(() => 常量)` 全量计数(另有 2 处 .catch((error) => {…}) 带参含副作用形态, 不属机制9零参纯常量范围, 走既有 fail 分派))

**对 wl6naqar0 底稿的两处口径修正(先查证再断言,非嘴硬)**:
1. 底稿称"11 个不透明宿主 ref"。逐行数出该闭包真实触达的 ref 标识符共 **17 个**(r2 订正: 原 13 个漏数 4 个纯标量重入锁/去重标记,详见 §3.3 新增四行):10 个持有真正不透明宿主状态(`localStreamRef`/`remoteStreamRef`/`peerConnectionRef`/`processedSignalIdsRef`/`pendingIceCandidatesRef`/`queuedVoiceIceCandidatesRef`/`iceConfigRef`/`voiceIceFlushTimerRef`/`callSetupTimerRef`/`callClockTimerRef`)+ 3 个纯标量镜像(`latestRoomStateRef`/`latestRoomIdRef`/`latestRoomModeRef`,已被 CHT 既有 objBoxRef/boxRef 机制覆盖,非新工作)+ **4 个纯标量重入锁/去重标记**(`cleanupInFlightRef`(`releaseVoiceRuntime`:672/675/718)/`offerStartedSessionIdRef`(`releaseVoiceRuntime`:709 +`handleVoiceAction`:1071)/`hiddenVoiceSignalRouteReadyRef`(`releaseVoiceRuntime`:710)/`leaveAttemptRoomIdRef`(`leaveCurrentRoom`:1269/1272))。这 4 个全是 `useRef('')`/`useRef(false)` 标量,机制上同归既有 `boxRefSlots`,**但必须显式登记 Map 条目**——它们是各自函数体内的自由变量,漏登记会被 S1 闭包扫描器判定为"未建模自由变量"而非视为已被既有机制覆盖,直接撞 census。计数差异不影响契约设计,以下按 17 个逐一开契约行,3 个镜像类 + 4 个新增标量类均标注"复用既有机制,非新设计,但需登记"。
2. 底稿称 `roomConversationId`/`activeVoiceSession` 均为 "useMemo 派生值"。实读源码(ChessPage.tsx:462-468):**只有 `activeVoiceSession` 是 `useMemo`;`roomConversationId` 是普通内联 const(`roomState?.conversationId || roomId || ''`),连缓存边界都没有**。这个区别对设计有利: `roomConversationId` 无需建模"记忆化单元",在每个使用点原地替换求值表达式即可,比 `activeVoiceSession`(含 `.find()`)更简单,两者归同一机制("本地派生值内联"),难度上是子集关系。

---

## 3. 桥契约表

### 3.1 `realtimeSessionStore` 单例 —— 5 个真实调用方法(不桥 1036 行全类)

`handleClose` 闭包链只触达以下 5 个方法(逐一核实调用点):

| 方法签名(realtimeSessionStore.ts) | 调用点 | 设备宿主语义 | headless 宿主诚实语义 | SABI 形态 |
|---|---|---|---|---|
| `getSnapshot(): RealtimeSessionSnapshot` | `finalizeRoomVoiceSessions`:519 | `safeClone(this.snapshot)`,深拷贝当前内存快照 | **同一份真实实现**,无设备依赖(纯内存状态 + 序列化),两宿主行为逐字节一致 | 值语义返回:`RealtimeSessionSnapshot` 是纯标量/数组复合结构,经 `bytes_view`(JSON 编码)或直接结构体值返回,不经指针 |
| `getChessRoom(roomId: string): RealtimeChessRoom \| null` | 组件挂载态初始化(非 handleClose 路径,但同单例) | 按 key 查 `chessRooms[roomId]`,深拷贝 | 同上,无设备依赖 | `utf8_view` 入参(roomId),值语义返回(null 用 present-bool 伴随槽) |
| `subscribe(listener: (snap)=>void): ()=>void` | 组件挂载态 useEffect(非 handleClose 路径,但 unsubscribe 语义关联) | 注册监听器到 `Set`,状态变更时 `listener(snapshot)` | 同一份真实实现;headless 没有 React 重渲染消费者,但 store 自身订阅/emit 逻辑完全一致 | 不过 `@importc` 边界——这是纯 Cheng 逻辑(store 本身重写为 Cheng 原生实现),回调走 Cheng 闭包/函数指针,不经 SABI 边界;返回的 unsubscribe 是句柄+释放函数对 |
| `applyEnvelope(context: ApplyEnvelopeContext): void` | `applyOutgoingEnvelope`(603-614)← `leaveCurrentRoom`(1282)+`sendCallEnvelope`(764) | 应用信令 envelope,写快照 + emit(可能 debounce)+ persist | 同一份真实实现,persist 后端(见下)按宿主切换,但 apply 语义不变 | `ApplyEnvelopeContext` 是标量+枚举复合体,经 objBoxRef 风格的字段分解结构体传入 |
| `finalizeCallSession(sessionId: string, options?: {status, lastAction, updatedAt}): void` | `finalizeRoomVoiceSessions`(527)+`releaseVoiceRuntime`(683) | 把某通话会话标记为 ended/rejected,写快照+persist | 同一份真实实现 | `utf8_view` + 可选参数结构体(present-bool 分解,镜像 objBoxRefSlots 惯例) |

**架构结论**: `realtimeSessionStore` 无 OS/硬件依赖(纯内存状态 + 持久化),**不构成设备/headless 二态分叉点**——两宿主共享同一份 Cheng 原生实现。唯一的宿主差异是 persist 后端(设备: 已有的本地 KV 桥;headless: 文件或纯内存,视 S2 实际交付形态定,不影响本节的 5 个方法契约)。

### 3.2 `libp2pService` 单例 —— 直调 2 方法 + 1 处按值传递整个单例

| 调用形态 | 调用点 | 设备宿主语义 | headless 宿主诚实语义 | SABI 形态 |
|---|---|---|---|---|
| `libp2pService.isNativePlatform(): boolean` | `sendRealtimeEnvelope`:581 | `Capacitor.isNativePlatform()`,真实探测是否运行在原生 App 壳内 | **编译期常量 `false`**(headless 进程定义上不是移动端原生壳,这是诚实事实非伪造)。走原方法源码本来就有的"非原生"分支(20s 超时 + web-direct 优先路径),不是新分支 | 两态各自编译期常量折叠为 `true`/`false`,零运行时探测,契约头无需真符号,直接内联 |
| `libp2pService.primeDirectPeer(peerId: string): Promise<boolean>` | `sendRealtimeEnvelope`:583(`.catch(()=>false)`,不 await 结果)+ 经 `prepareUiDirectRoute` 内部再次调用 | 真实拨号预热一个 P2P 直连通道(移动端有 JNI 原生 libp2p 传输,参照 `ChengLibp2pNative.kt`) | **真实实现,非 stub**:headless 进程若已具备 Cheng 原生 P2P 传输(QUIC/MoQ 栈,`cht_layer2_async_runtime_reframe` 已证有真实非阻塞 issue/poll 通道先例),用同一套真实拨号;若该拨号能力尚未在此宿主落地,诚实返回 `false`(“未能预热”,与真实网络不可达时的返回值同构,不是伪造成功)。调用点本就 fire-and-forget 吞返回值,`false` 不影响 `handleClose` 路径的可观察行为 | 契约头方法 `chengLp2pPrimeDirectPeer(peer: utf8_view): bool`;设备侧 `@importc` 绑定 JNI/NAPI 真符号,headless 侧绑定同名真实 Cheng 拨号实现(若已具备)或诚实返回 false 的骨架(**不是 mock**——是"能力尚未建成"的真实状态,需在 §8 风险登记标注,不可与"伪造语音成功"混淆) |
| `prepareUiDirectRoute(libp2pService, {peerId, connect, timeoutMs})` | `sendRealtimeEnvelope`:585 | 把整个单例对象**按值传递**给另一函数(`UiDirectMessageBridge` 结构类型),该函数内部还会调 `waitSecureChannel`/`socialListDiscoveredPeers`/`getPeerMultiaddrs`/`socialConnectPeer` 等 4 个 CHT 契约表**未覆盖**的方法 | 同上,完整方法集透传 | 同上 | **架构注意点**(非本次 S1 范围): 这是"把单例句柄整体传给另一个函数"的调用形态,不同于 `singleton.method()` 直调——`hostBridges` 现有机制以扁平字符串路径(`"libp2pService.isNativePlatform"`)为键,无法表达"把整个对象作为值传递"。`sendRealtimeEnvelope`→`prepareUiDirectRoute` 这条链已经越过 `ChessPage.tsx` 自身编译单元的边界(`uiDirectMessageFlow.ts` 是独立模块),其内部对 `libp2pService` 的 4 个方法引用应作为 `uiDirectMessageFlow.ts` 自己被编译时的桥接项,**不计入本提案 S1 的契约面**,仅在此注记以防遗漏 |

`sendManagedSocialDm`(leaveCurrentRoom → sendRealtimeEnvelope → 此函数)在 `dmNetworkActor.ts` 模块作用域直接 `import { libp2pService }`,不经 `ChessPage.tsx` 闭包传参——是**普通导出函数调用**(CHT 既有机制:跨模块函数调用,非单例桥),不属于本提案新机制范围。

**`.catch()` 链是转译器目前零处理的语法构造,必须在此正面处理(r2 新增,不再只在调用点旁注带过)**:

逐证(源码实读,非转述): `csg-core.ts:1997-2033` 的 `emitExpression` 对任何调用表达式一律生成 `"call"` op fact,若 `node.expression` 是 `PropertyAccessExpression`(即 `x.foo(...)` 形态)则额外写入 `memberName: node.expression.name.text`(2002 行)。对 `libp2pService.primeDirectPeer(peerId).catch(() => false)`,外层调用的 `memberName === "catch"`,`callee`(`op.callee`)是 `node.expression.getText()` 的**整段文本**——即 `"libp2pService.primeDirectPeer(peerId).catch"`。但转译器 `csg-cheng-transpiler.ts` 私有方法 `emitCall`(1931 行起)对 `memberName` 的分派只覆盖字符串/数组方法(`includes`/`trim`/`filter`/`map`/... ,1986-2058 行)与 `getFullYear`/`play`/`pause`(2059-2068 行),**对 `"catch"`/`"then"` 没有任何 case**——对全文件 grep `"catch"`/`"then"` 字面量结果为零命中。落不进任何 case 后,执行流最终落到默认分支(2145 行起):`callee` 既不在 `stateSetterNames`/`externNames`/`functionByName`,也不在 `hostBridges`(其键是不含参数文本的扁平方法路径,如 `"videoRef.current.play"`,不可能匹配这段含内层调用文本的 `callee`),最终 `this.fail(op.id, \`unsupported callee '${callee}'\`)`——**这就是 `sendRealtimeEnvelope` 当前编译失败(invokeSites≠0)的直接根因之一,不是次要问题**。

`sendRealtimeEnvelope`(573-601)内触达 3 处 `.catch()`:
- 583 行:`void libp2pService.primeDirectPeer(peerId).catch(() => false)`—— fire-and-forget,不消费结果。
- 585-589 行:`void prepareUiDirectRoute(libp2pService, {...}).catch(() => null)`—— fire-and-forget,不消费结果。
- 595-600 行:`return sendManagedSocialDm(...).catch(() => false)`—— **catch 的结果被当作函数返回值直接消费**(`sendRealtimeEnvelope` 的 `Promise<boolean>` 返回类型就来自这一条)。

三处 continuation(`() => false`/`() => null`/`() => false`)均是零参数箭头函数,函数体是单一字面量,不读取任何外部变量、不含任何调用——**静态可证的纯常量表达式**。`handleClose` 闭包链内(§2 列出的全部函数)`.then()` 未出现(`.then()` 只出现在 `sendHiddenVoiceSignal`(799 行)/`handleMove` 等非本链函数,不在本提案范围内,不处置)。设计取舍见 §4 机制9。

### 3.3 17 个 ref 的宿主契约(逐一列出真实 API 触达面,r2: 13→17)

| ref 名 | 持有类型 | handleClose 链内真实触达的方法/字段 | 设备宿主语义 | headless 宿主诚实语义 |
|---|---|---|---|---|
| `peerConnectionRef` | `RTCPeerConnection\|null` | 读一次(`releaseVoiceRuntime`:689);若非空:`.onicecandidate=null`/`.onconnectionstatechange=null`/`.oniceconnectionstatechange=null`/`.ontrack=null`/`.close()` | 真实 WebRTC 连接对象(Android/Harmony 原生 WebRTC 引擎) | **该连接对象在 `handleClose` 可达的运行时路径上永远是 `null`**——真实创建点在 `ensureVoicePeerConnection`(**r2 订正**: 函数定义起于 ChessPage.tsx **858** 行,`new RTCPeerConnection(...)` 构造语句在 **867** 行;原稿"1001 行起"有误,1001 行实际是另一函数 `startOutgoingVoiceOffer` 的定义起点,与创建点无关),而该函数只被 `startOutgoingVoiceOffer`/接听路径调用,均**不在 `handleClose` 的 useCallback 依赖闭包内**。且创建前必先 `await Promise.all([ensureLocalVoiceMedia(), hydrateIceConfig()])`——若 `ensureLocalVoiceMedia` 诚实抛出"无麦克风"(见下),创建流程根本不会执行到。**结论:headless 侧无需实现真 WebRTC 引擎即可满足本闭包的教学契约**——只需一个恒为 `null`(未创建)的现实,`release` 分支的 `if (connection) {...}` 空跳即是诚实行为,零 fabrication |
| `localStreamRef` | `MediaStream\|null` | `releaseVoiceRuntime`(702, `stopStreamTracks`→`.getTracks()`+`track.stop()`,读后置空);`ensureLocalVoiceMedia`(726-738,读缓存/写入 `getUserMedia` 结果) | 真实麦克风采集流 | **`getUserMedia`-等价桥诚实返回"无音频输入设备"错误**(headless 进程无真实麦克风硬件,这是真实状态非伪造)。ChessPage 自身既有 `try {...} catch (error) { releaseVoiceRuntime('failed', error.message) }` 逻辑(1060-1068/1028-1036)**已经**是"无设备→语音失败,停在 failed 态"的正确处理——**不需要新写任何降级分支,只需 headless 侧的采集桥老实抛错**,组件原有代码自动落到红线要求的状态 |
| `remoteStreamRef` | `MediaStream\|null` | `releaseVoiceRuntime`(703,同 `stopStreamTracks`,读后置空) | 真实远端音轨汇聚流 | 同 `peerConnectionRef`:写入点在 `ensureVoicePeerConnection`/`connection.ontrack`,不在 `handleClose` 可达路径,故契约面只需"读+清空"两操作,恒为 `null` |
| `processedSignalIdsRef` | `Set<string>` | `releaseVoiceRuntime`(708,`.clear()`) | 去重信令 messageId 的内存集合 | 同一份真实实现(纯内存 Set,无设备依赖) |
| `pendingIceCandidatesRef` | `RTCIceCandidateInit[]` | `releaseVoiceRuntime`(706,写 `[]`) | 缓冲尚未应用的 ICE 候选 | 同一份真实实现(纯内存数组) |
| `queuedVoiceIceCandidatesRef` | `RTCIceCandidateInit[]` | `clearQueuedVoiceIceCandidates`(667,写 `[]`) | 出站 ICE 候选合批队列 | 同一份真实实现 |
| `iceConfigRef` | `WebRtcIceConfig\|null` | `hydrateIceConfig`(617-622,读缓存/写入 `loadWebRtcIceConfig()` 结果) | 真实 STUN/TURN 服务器配置(经 `ingressNodes.ts` 网络请求获取,非设备专属能力) | **同一份真实实现**——`loadWebRtcIceConfig` 本质是一次网络配置拉取,不依赖移动端专属 API,headless 若具备网络出口即可真实完成;若网络不可达,诚实抛错(与设备端网络不可达时行为一致,非新分叉) |
| `voiceIceFlushTimerRef` | `number\|null`(`setTimeout` 句柄) | `clearQueuedVoiceIceCandidates`(663-665,`window.clearTimeout`+置 null) | 浏览器/WebView 定时器句柄 | **r2 订正(撤回"两宿主已有等价机制"的失实定性)**: 逐查 `csg-cheng-transpiler.ts` 唯一相关构造是 `matchSetTimeoutDeferred`(712-726 行)——只能精确匹配"内联 `setTimeout(fn, msLiteral)` 直接触发一次延迟效果",**不返回句柄**、ms 必须字面量、且同一 handler 内只能出现一次(1282 行硬性 `this.fail("multiple setTimeout deferrals in one handler not supported")`)。这与本 ref 的真实形态——"创建时把句柄存进 ref,另一处按 `if (ref.current) { clearTimeout(ref.current); ref.current=null }` 条件清除"——是完全不同的形状,现有机制不覆盖。原稿引用的"`cht_layer2_async_runtime_reframe` 的 tick-delay 原语"在代码库中检索不到任何匹配(`tick-delay`/`tickDelay` 全仓零命中),该表述不成立,已撤。真实设计见 §4 机制10 |
| `callSetupTimerRef` | `number\|null` | `clearVoiceTimers`(639-642) | 浏览器/WebView 定时器句柄 | 同 `voiceIceFlushTimerRef`:句柄化 setTimeout + 条件清除,现有机制不覆盖,见 §4 机制10 |
| `callClockTimerRef` | `number\|null`(`setInterval` 句柄) | `clearVoiceTimers`(643-646);创建点在同层兄弟闭包 `startVoiceClock`(651-660,`window.setInterval(() => setVoiceClockNow(Date.now()), 1000)`,不在 `handleClose` 链内但决定本 ref 的真实类型) | 浏览器/WebView 周期定时器句柄 | **r2 订正**: `setInterval`/`clearInterval` 在 `csg-cheng-transpiler.ts` 与 `scene-runtime-smoke-source.mjs` 的 codegen 分派中**均无任何 case**,全文件 grep 零命中真实实现。`cheng-source.ts:6130` 出现的 `__ts_csg_setInterval`/`__ts_csg_clearInterval` 属于另一条无关的通用 JS 转译兜底路径,函数体是 `fn X(value: int32): int32 = return value` 的恒等空转占位符,**不是可用实现,不能作为"等价机制"引用**。真实设计见 §4 机制10,S2 workload 同步重估 |
| `cleanupInFlightRef`(r2 新增) | 布尔标量(`useRef(false)`) | `releaseVoiceRuntime`(672 读判重入锁;675 置真;718 finally 置回假) | 应用态重入锁,无宿主语义 | 同左;归 `boxRefSlots`,**S1 须显式登记该 Map 条目**(它是 `releaseVoiceRuntime` 体内的自由变量,漏登记会被闭包扫描器判为未建模自由变量) |
| `offerStartedSessionIdRef`(r2 新增) | 字符串标量(`useRef('')`) | `releaseVoiceRuntime`(709 置空);`handleVoiceAction`(1071 置空,accept 分支去重) | 应用态去重标记,无宿主语义 | 同左;归 `boxRefSlots`,同上须显式登记 |
| `hiddenVoiceSignalRouteReadyRef`(r2 新增) | 布尔标量(`useRef(false)`) | `releaseVoiceRuntime`(710 置假) | 应用态就绪标记,无宿主语义 | 同左;归 `boxRefSlots`,同上须显式登记 |
| `leaveAttemptRoomIdRef`(r2 新增) | 字符串标量(`useRef('')`) | `leaveCurrentRoom`(1269 读判重入去重;1272 置当前 roomId) | 应用态重入去重标记,无宿主语义 | 同左;归 `boxRefSlots`,同上须显式登记 |
| `latestRoomStateRef`/`latestRoomIdRef`/`latestRoomModeRef` | 标量/结构体镜像(非不透明宿主对象) | `leaveCurrentRoom`(1264-1266)只读;写入侧在独立 `useEffect`(408-410) | 应用态镜像,无宿主语义 | 同左;**复用 CHT 既有 `objBoxRefSlots`/`boxRefSlots` 机制,零新设计** |

### 3.4 组件 prop:`roomId` 与 `onClose`

| 项 | 真实来源(逐行核实) | 现状定性 | 本提案处置 |
|---|---|---|---|
| `roomId?: string` | `App.tsx:1118 <ChessPage roomId={currentApp.roomId} onClose={closeCurrentApp} />`;`currentApp` 是 `App.tsx` 顶层 overlay 路由状态(`overlay.kind==='app' ? overlay.app : null`,331 行)。**r2 订正真实源头**: `roomId` 字段并非"随 668-683 派生"——668-683 行是**反向**的 URL 回写 `useEffect`(把已有的 `currentApp.roomId` 写回 `window.history.replaceState`,单向 state→URL,不产出新值)。`roomId` 的真实源头是 `gameLaunchQuery.roomId`(`App.tsx:307-315`,`useMemo(() => readGameLaunchQuery(), ...)` 解析 URL 查询串得到),经 `initialOverlayAppRoute`(312-316 行)写入 `overlay` 的初始 `useState`,`currentApp.roomId` 只是对它的透传读取,原稿引用的 668-683 是误植 | **CHT 目前无"路由携带类型化参数"的通用机制**——已有的 `resolveRouteContentForHandler` 先例(`cht_layer2_async_runtime_reframe` 记录)只解出单一固定 `content.id`,是"路由→固定内容对象"的窄形态,不是"路由→任意具名参数"的通用形态。`roomId` 需要的是后者的**推广**:CHT 派发进入 `ChessPage` 编译入口时,随路由态一并携带一个 `roomId: str` 参数槽(来源同 `gameLaunchQuery.roomId` 一样是路由级真实状态,不是伪造) | 第7类机制(详见 §4):把 `resolveRouteContentForHandler` 的单值范式泛化为"路由参数槽",`roomId` 是首个消费者 |
| `onClose: () => void` | `App.tsx:655 closeCurrentApp = useCallback(() => {...})`,语义是"弹出当前 overlay 路由"(把 `currentApp` 置空一类的路由转移,不是任意副作用) | **危险先例,必须显式避坑**:`cht_layer2_async_runtime_reframe`(2026-06-21)记录过同形态的 `onBack` prop-callback 曾被编成 `@importc cheng_host_invoke_callback`,因"该符号 host 不存在 + onBack 真效果在父级按实例各异,字符串路由桥架构错"而**被撤销(revert)**。`onClose` 绝不能重蹈这条已判定为 fabrication 的路径 | **不引入回调指针桥**。`onClose()` 在语义上等价于 CHT 已有的"route pop"动作(既有 `route` 类型 scene event,37 条路由已在用,详见 §4),按已验证的真实路由机制解析,不发明新的"调用父级函数指针"抽象 |

### 3.5 派生值:`roomConversationId` / `activeVoiceSession`

| 值 | 定义 | 处置 |
|---|---|---|
| `roomConversationId` | `roomState?.conversationId \|\| roomId \|\| ''`(468 行,**非 useMemo**,每次渲染重算的内联 const) | 无需记忆化建模,在闭包每个使用点原地替换为该表达式即可(CHT 派发器本就每次 apply 重算状态,替换后语义不变) |
| `activeVoiceSession` | `useMemo(() => activeVoiceSessionId ? roomVoiceSessions.find(s => s.sessionId === activeVoiceSessionId) ?? null : null, [...])`(462-467) | 同一机制,多一层 `.find()` 谓词查找;数组来自 state(`roomVoiceSessions`),查找是纯函数,同样原地内联求值,无需独立记忆化单元 |

两者归入 §4 的"机制8:本地派生值内联"。

---

## 4. 新机制设计 及与 CHT 既有机制的关系(r2: 3类→5类,增机制9/10)

CHT 现有 5 类机制(`csg-cheng-transpiler.ts` 逐行核实):
1. `hostBridges: Map<扁平调用路径, Cheng函数名>` —— 单个宿主方法调用桥(如 `navigator.clipboard.writeText`)
2. `hostObjects: Set<ref名>` —— 不透明宿主 ref(如 `videoRef`),`.current` 恒真,`.current.method()` 经 hostBridges 解析
3. `boxRefSlots: Map<ref名, Cheng类型>` —— 标量 useRef 分解为单个状态槽
4. `objBoxRefSlots: Map<ref名, Map<field,类型>>` —— 对象 useRef({字段:标量}|null) 分解为 present-bool + 逐字段槽
5. `recvDoneSendBridges: Map<await调用名, {issue,injectArgs}>` —— 异步 await-split 的非阻塞 issue+poll 桥

本提案新增 5 类机制(r2: 原 3 类机制6/7/8 之外,补机制9/10),均是对①⑤的**推广**,不引入范式外的新抽象:

**机制6(单例句柄多方法桥,推广①)**: `hostBridges` 现有键是"扁平调用路径→单个函数"的一对一映射,天然可以直接承载 `realtimeSessionStore.getSnapshot`/`.getChessRoom`/`.subscribe`/`.applyEnvelope`/`.finalizeCallSession` 与 `libp2pService.isNativePlatform`/`.primeDirectPeer` 这 7 条新键——**结构上无需扩展 `hostBridges` 的类型**,只需登记新的 Map 条目(仿照 `CHT_HOST_BRIDGES` 里 `videoRef.current.play` 那样的字符串键)。唯一新增的是**契约头**(SABI 边界的真实符号声明 + `CHT_BRIDGE_IMPLS` 里两套宿主各自的实现体),这是工作量而非机制设计的新增。

**机制7(路由参数槽,推广既有 `resolveRouteContentForHandler`)**: 现有先例只解一个固定的 `content: {id}` 结构体。本提案把它推广为**具名参数槽表**:一个页面的编译入口可以声明 `{roomId: str}` 这样的参数槽集合,槽值来源与 `content.id` 同源——都是路由/overlay 状态里已经真实存在的字段,由生成器在物化场景图时随路由一起写入(不是新发明数据源,只是把"单值"推广成"具名多值")。`onClose` **不**走这个机制(它是动作不是数据),见下。

**机制8(本地派生值内联)**: `useMemo`/内联 const 的纯函数式派生值(§3.5 两例),在闭包每个使用点直接替换为其定义表达式,不建立独立缓存槽。前提: 表达式必须是纯函数(无副作用、无 I/O),对 `roomConversationId`/`activeVoiceSession` 均成立(已逐行核实,只读 state/props,无调用桥)。

**机制9(reducible catch 归约,r2 新增,推广⑤ recvDoneSendBridges 的失败分支)**: 详见 §3.2 的正面证据——`.catch()` 在转译器里目前是彻底未处理的 `memberName` 值,落到 `this.fail`。设计: 当且仅当 `.catch(fn)` 包裹的是一次已经/将要走机制⑤(await-split issue+poll)非阻塞桥接的调用,且 `fn` 是零参箭头、函数体是**静态可证的纯常量表达式**(无自由变量读取、无调用、无副作用——编译期直接可判定,不是运行时启发式)时,把机制⑤ poll 的"失败"分支接到这个常量出口,而不是让编译失败。这是对既有机制⑤失败分支的**类型扩展**(它现在只支持"失败→编译报错",扩展为"失败→调用点显式声明的常量"),不是发明新的 Promise/异常抽象——`.then()` 不纳入本次范围(§3.2 已证 `handleClose` 链内不出现 `.then()`)。非纯 continuation(捕获外部变量、有副作用如 `console.warn`、或多参数)一律维持 `this.fail`,不做任何静默兜底——这是与 CLAUDE.md"严禁降级/兜底"红线一致的边界。

**`.catch()` 处置的二选一决策与代价(r2 新增,撤回原稿"只需登记 Map 条目"的工作量定性)**:

| | 方案A: 机制9(reducible catch 归约) | 方案B: 整 handler 效果硬编码(仿 GPS 发布先例) |
|---|---|---|
| 先例 | 无直接先例,但是对既有机制⑤的类型扩展,同属"推广既有范式" | `scene-runtime-smoke-source.mjs:5662` 起的 `handlePublish`/`handleStartLive` 整 effect 原生绕过;`service.ts` 内同结构的 `.catch(() => 常量)` 有 **109 处**(已逐一 grep 计数并剔除 2 处带参含副作用形态 service.ts:1398/1526, 远超"6+"的原估) |
| 作用范围 | 只替换 3 处 `.catch()` 表达式本身,`sendRealtimeEnvelope` 其余语句(`buildRealtimeSignalPayload`/`sendManagedSocialDm` 调用/`timeoutMs` 分支)照常经 CHT 正常路径编译 | 整个 `sendRealtimeEnvelope`(乃至上游 `sendCallEnvelope`/`leaveCurrentRoom`/`handleVoiceAction` 调用它的路径)绕开 CHT 数据流,变成一段手写原生实现,与源码的对应关系不再由转译器保证 |
| 可复用性 | 通用规则,`service.ts` 109 处同形态 `.catch(() => 常量)` 未来均可复用同一条转译器逻辑 | 每个新 handler 撞到同类 `.catch()` 都要新开一段硬编码,不可复用,维护成本随 handler 数线性增长 |
| 风险 | 需要新增"箭头体纯度静态判定"逻辑(转译器代码改动,非 Map 登记),要防止误判"看似简单实则有副作用"的箭头体——但判定规则是保守的(不满足条件一律 fail-fast,不是"猜"),不引入生产 Mock 风险 | 复刻的是 GPS 发布先例"整个 handler 是一坨编译不动的异步编排"这一问题形状;本例只有 3 个语句卡编译,其余全部可正常转译,套用整体硬编码等于放弃已经能编译的部分,还原创译器保证的"源码↔生成代码"对应关系,风险/收益比更差 |
| 决策 | **选方案A**。第一性原理: 问题的真实形状是"3 处孤立的、continuation 静态可证明为常量的 `.catch()` 表达式",不是"整个 handler 不可编译"——GPS 先例解决的是后一种形状,套在这里是方案与问题形状不匹配的过度硬编码。方案A 是对现有机制⑤的最小类型扩展,风险可控且通用可复用 | — |

**`onClose` 的处置(不是新机制,是既有路由机制的复用)**: `closeCurrentApp` 语义等价于"弹出当前 overlay 路由",CHT 现有 `route` 类型 scene event(37 条路由已投产)已经承载"点击→切路由"的真实语义。`handleClose` 尾部的 `onClose()` 应编译为该 scene 的路由弹出动作,**不建任何"调用父级函数指针"的抽象**——这是吸取 `onBack` fabrication 被 revert 的教训后唯一被验证过安全的方向。

**机制10(定时器句柄化,r2 新增,替换 §3.3 原"两宿主已有等价机制"的失实定性)**: §3.2 已证 `.catch()` 是零处理的语法构造;定时器句柄同样是——`csg-cheng-transpiler.ts` 唯一相关构造 `matchSetTimeoutDeferred`(712-726 行)只精确匹配"内联 `setTimeout(fn, msLiteral)` 直接触发一次延迟效果",不返回句柄、ms 须字面量、一个 handler 内限一次;`setInterval`/`clearInterval` 在转译器与场景生成器里**均无任何 codegen case**(`cheng-source.ts:6130` 的 `__ts_csg_setInterval`/`__ts_csg_clearInterval` 是另一条无关通用 JS 转译路径的恒等空转占位符 `return value`,不可用)。这与 `voiceIceFlushTimerRef`/`callSetupTimerRef`(setTimeout 句柄+条件 `clearTimeout`)、`callClockTimerRef`(`setInterval` 周期回调+`clearInterval`)三个 ref 的真实形态均不匹配。设计:
- **句柄化 setTimeout**: `boxRefSlots` 新增一个不透明句柄标量类型(`timerHandle`);`ref.current = window.setTimeout(fn, ms)` 编译为"发起真实延迟调度并把调度句柄写回槽位",`if (ref.current) { window.clearTimeout(ref.current); ref.current = null }` 编译为"按句柄取消 + 清空槽位"——是对既有 `boxRefSlots`(标量槽机制)的类型扩展,不是全新抽象。
- **周期 setInterval**: 对称原语——创建返回句柄 + 周期回调注册 + `clearInterval` 按句柄取消;底层需要 Cheng 运行时提供真实的"周期性回调注册/取消"能力(非 JS 沿用,非空转桩)。
- 定时器本身无设备/headless 语义分叉(与 §3.1 `realtimeSessionStore` 同理),两态应共享同一份真实调度实现,不需要为它复制两份。

**工作量归属与 S2 重估**: 编译期识别 + codegen(句柄类型、条件清除、周期回调)是 **S1** 范围内的转译器代码改动,不是 Map 登记。底层"周期性回调注册/取消"若 Cheng 运行时(两宿主口径下)尚无可复用原语,这是一个**前置阻塞**而非 S2 的宿主特化工作——因为定时器无设备/headless 分叉,理应与 realtimeSessionStore 同归"两态共享同一实现"。本提案不越权拍板"该原语算 S1 前置还是独立里程碑",只如实标注: **原 S2 workload 未含任何定时器工作项(因为 r1 误判"已有等价机制"),r2 更正后 S2 必须新增前置条件"确认/建设 Cheng 运行时周期回调原语",具体归属留给下一步规划者判定**。

---

## 5. 双态宿主构建与选择(编译期,无运行时探测)

- 选择点: 编译目标(device-android / device-harmony / headless)在**生成期**决定,由构建脚本选择 `CHT_BRIDGE_IMPLS` 里对应宿主变体的实现体字符串,拼进最终 `.cheng` 源码——生成物本身只含一条路径,不含 `if is_device(): ... else: ...` 的运行期分支(这是红线的字面要求,也是 `scene-runtime-smoke-source.mjs` 里 `CHT_BRIDGE_IMPLS` 现有惯例:每个桥函数名下已经是"一份实现",本提案把它扩展成"每个桥函数名下两份实现,按目标选一份拼入")。
- `libp2pService.isNativePlatform()` 在两态都编译期折叠为常量(`true`/`false`),不生成任何探测代码。
- `realtimeSessionStore` 的 5 个方法在两态共享同一实现体(§3.1 已论证无设备依赖),不需要为它复制两份。
- 语音媒体桥(`ensureLocalVoiceMedia` 对应的 `getUserMedia` 桥)是唯一需要"两份完全不同实现体"的桥:设备侧绑定真实 JNI/NAPI 音频采集;headless 侧绑定一个**总是诚实失败**的实现(返回"无音频设备"错误,不是空转/不是 stub 返回假流)——这份 headless 实现体本身也是编译期选定的"真实代码",不是运行时探测出来的降级路径。

---

## 6. 分片 S1 → S4

| 分片 | files/action | verify | done(含门禁) |
|---|---|---|---|
| **S1 桥契约 + CHT 编译面** | ①`csg-cheng-transpiler.ts` 或场景生成器登记表新增机制6/7的 Map 条目(§4,7 个单例方法键,纯登记);②`CHT_BRIDGE_IMPLS` 补 7 个单例方法契约头(仅声明,两态实现体见 S2/S3);③生成器路由参数槽支持 `roomId`;④route-pop 动作复用既有 `route` scene event,不新增回调桥;**⑤(r2 新增,真实转译器代码改动,非 Map 登记)`emitCall` 新增机制9: `.catch()` continuation 纯度静态判定 + 接到机制⑤失败分支的归约 codegen,覆盖 `sendRealtimeEnvelope` 3 处;⑥(r2 新增,同为真实代码改动)`boxRefSlots` 扩展机制10 的句柄标量类型 + `setTimeout`/`clearTimeout` 句柄化 codegen + `setInterval`/`clearInterval` codegen,覆盖 `voiceIceFlushTimerRef`/`callSetupTimerRef`/`callClockTimerRef`;⑦(r2 新增)登记 §3.3 新增 4 个标量 ref 到 `boxRefSlots`** | `cht-measure` census:`handleClose`/`finalizeRoomVoiceSessions`/`handleVoiceAction`/`leaveCurrentRoom` 等闭包链 invoke-fallback → compiled;`CHT_DEBUG=1` 逐 handler 核实无 skip;**(r2 新增)`sendRealtimeEnvelope` 3 处 `.catch()` 归约后的生成代码人工核对与源码语义逐句等价;`clearVoiceTimers`/`clearQueuedVoiceIceCandidates` 编译产物按句柄条件清除,行为与原 JS 逐句等价;任何非纯 continuation 或非本设计覆盖的定时器形态必须 `fail`,不得静默降级或吞错——census/CI 需断言无此类静默通过** | `handleClose` 及其闭包链 `invokeSites=0`;`unimaker-retained-parity-gate` 不因本分片新增回归;不引入任何 `@importc cheng_host_invoke_callback` 式的父级函数指针桥(硬门,直接对照 §4 的教训);**(r2 新增)机制9/10 的 fail-fast 边界经 census 验证无静默兜底** |
| **S2 headless 宿主** | ①`realtimeSessionStore` 5 方法的 Cheng 原生实现(纯内存 store + 可选 persist);②`libp2pService` 两方法的 headless 实现体(`isNativePlatform`→常量 false;`primeDirectPeer`→真实拨号或诚实 false);③语音采集桥 headless 实现体(诚实失败:无音频设备);④WebRTC 对等连接桥**不需要**在 S2 实现(§3.3 已证 `handleClose` 可达路径上创建点不可达);**⑤(r2 新增,前置条件,归属待定)确认/建设 §4 机制10 所需的 Cheng 运行时"周期性回调注册/取消"原语——若两宿主均无现成实现,这是 S1/S2 边界前的新阻塞项,不因"两宿主已有等价机制"的原判定而豁免(该判定已在 §3.3 撤回)** | 单元/集成测试:headless 进程枚举语音设备为空;尝试发起语音 → `voiceState` 落在 `'failed'`,错误文本为真实"无麦克风"提示,不是空跑/不是假 connected;`handleClose` 在无任何活跃语音会话时可安全调用且不抛异常;**(r2 新增)`clearVoiceTimers` 在 headless 下对已创建/未创建的 `callClockTimerRef`/`callSetupTimerRef` 均可安全调用,周期回调(若曾创建)真实被取消(非空转断言)** | `unimaker-retained-parity-gate` 绿;digest-oracle 覆盖 `handleClose` 闭包链;S1+S2 合并后满足"解锁 v35 装配"的两个前置条件 |
| **S3 安卓设备宿主** | JNI 桥:`realtimeSessionStore`/`libp2pService` 复用既有 `ChengLibp2pNative.kt` 真实原生传输模式;语音采集+`RTCPeerConnection` 桥走**真实 WebRTC**——评估点(需下阶段决策,不在本提案拍板): (i) 复用系统自带 WebRTC 库(Android `org.webrtc`,工作量小、维护性好、但引入非 Cheng 原生依赖);(ii) 自研基于既有 libp2p/QUIC 栈的语音信令(与项目"自研引擎"总纲一致,工作量大、周期长)。**建议**: S3 先做 (i)——复用系统 WebRTC——理由: ①`RTCPeerConnection`/`MediaStream` 本身就是 W3C 标准 API 在 Android 侧的对应实现,复用系统库不违反"真实语音"红线(仍是真 WebRTC,不是 Mock);②项目已有 `EdgeInferenceBridgePlugin.kt` mock 反面案例的教训——自研信令栈若达不到生产级 NAT 穿透/编解码成熟度,风险是伪装成"自研"实则功能残缺,与红线"真实"的精神相悖;③自研 QUIC 语音信令可作为**后续独立里程碑**(与本战役解耦),不阻塞 S3 交付 | 安卓真机语音通话双端验证(参照 `video_e2e_campaign_2026_07_10` 的真机验证方法论) | 真机语音接通 + `handleClose` 挂断路径真实生效(通话状态机正确回落) |
| **S4 鸿蒙 NAPI 镜像** | 镜像 S3 的 ABI 与选型结论到 NAPI/ArkTS 桥(`cheng_hy2_tun_core_bridge.h` 同款跨端对齐先例) | 鸿蒙真机语音通话双端验证 | 双端(安卓+鸿蒙)语音互通 + `handleClose` 生效 |

**S1+S2 解锁 v35 主张的论证**: v35 装配阻塞点是 `unimaper-retained-parity-gate` 的 `invokeSites=0` 硬门 + digest-oracle 覆盖。`handleClose` 闭包链是该组件唯一残留的 invoke-fallback 来源(全组件已核实,見 §2 取证范围)。S1 把它编译进 CHT、S2 给两个已声明的桥(单例方法 + 语音采集)一个诚实的 headless 实现,即可使该组件在 headless 宿主下完整通过 gate,不依赖 S3/S4 的真实设备语音能力——因为 headless 路径下语音采集诚实失败,状态机停在 `'failed'`/`'idle'`,这本身就是 gate 要求的"确定性诚实行为",无需等到真实 WebRTC 落地。

---

## 7. 前置卫生修 #65(纳入,先行)

`csg-core.ts:1944` 的 `catch (error)` 零绑定假阳性(单例阻塞解锁后必引爆)在 wl6naqar0 中已定性为"另卷"。本提案确认: **S1 动工前必须先完成 #65 的最小修复**——原因: S1 一旦把 `realtimeSessionStore`/`libp2pService` 从"自由变量白名单外的未知量"变成"已建模的单例桥",闭包扫描器会重新遍历整个 `handleClose` 调用链上的所有 catch 块。**r2 订正**: 原稿在此处误引 `ensureLocalVoiceMedia`/`handleVoiceInvite` 两处并不成立的 catch——逐行核实,`ensureLocalVoiceMedia`(722-740)本身没有 try/catch,只在 723-724 行 `throw`,catch 由调用方持有;`handleVoiceInvite`(1018-1050)确有自己的 catch(1033),但它**不在 §2 `handleClose` 依赖闭包列表内**(是同层级的兄弟 `useCallback`,不参与 `handleClose` 的调用链,不该被本卷统计)。链上唯一真实存在、且绑定了 `error` 变量的 catch 块是 **`handleVoiceAction` 自身的 `catch (error)`(1065 行,包裹 1061-1064 行的 `Promise.all([ensureLocalVoiceMedia(), hydrateIceConfig()])`)**——若扫描器沿用 `#65` 同款零绑定误判逻辑,会把这个真实绑定的 `error` 变量误伤为假阳性自由变量,导致 S1 的契约面统计失真。修复 #65 是 S1 动工的卫生前提,顺序: **#65 → S1 → S2**。

---

## 8. 风险登记

| 风险 | 影响 | 处置 |
|---|---|---|
| `libp2pService.primeDirectPeer` headless 侧"诚实返回 false"与"能力尚未建成"两种情况在调用点不可区分(§3.2) | 若未来要精确诊断 headless 拨号失败原因,当前契约不够;但**不影响本提案范围**,因为 `handleClose` 路径本就不消费该返回值(fire-and-forget) | 记录不深挖,留给 P2P 传输层自己的可观测性建设,不在本提案阻塞 |
| `Object.values(snapshot.callSessions)`(`finalizeRoomVoiceSessions`:520)与 `Promise.all([ensureLocalVoiceMedia(), hydrateIceConfig()])`(`handleVoiceAction`:1061-1064)是 JS 内建,CHT 转译器目前无通用 `Object.values`/`Promise.all` 原语 | 若不处置,S1 无法编译这两处语句 | **`Object.values` 处置**: 让 `getSnapshot()` 桥的 Cheng 返回类型直接把 `callSessions` 定义为 `[]RealtimeCallSession`(数组,因为 `sessionId` 字段本就在值里,Record 的 key 是冗余信息)——这样源码里的 `Object.values(x)` 在类型上是恒等操作,转译器按"标识符替换"处理即可,不需要新增通用 Map→数组原语。**`Promise.all` 处置**: 该调用只用于"两个独立 await 一起 fail-fast"语义(无需真并发,无相互依赖),改写为顺序 `await ensureLocalVoiceMedia(); await hydrateIceConfig()`——可观察行为不变(任一失败都触发同一个 catch),唯一代价是失去并发节省的墙钟时间(几十到几百毫秒量级,非正确性问题),需在实现说明里显式记录为"设计内的行为收窄",不是隐藏的语义偷换 |
| S3 选型建议(复用系统 WebRTC vs 自研信令)未拍板 | S3/S4 排期不确定 | 本提案只给出建议与理由(§6),**不越权拍板**,由用户在 S1/S2 落地后基于实测结果二次确认 |
| `hostBridges` 机制6扩展后,`prepareUiDirectRoute(libp2pService, {...})` 整体传参形态(§3.2 末行)仍未纳入任何机制 | 若后续要编译 `uiDirectMessageFlow.ts`/`dmNetworkActor.ts` 自身,会撞到"单例按值传参给自由函数"这一新形态,现有 6 类机制均不覆盖 | 明确排除在本提案范围外(那是另一模块的编译单元),仅记录风险,防止下一轮工作流误以为 S1 已经解决 |
| 语音信令层(`sendRealtimeEnvelope`/`applyOutgoingEnvelope`)在 headless 侧依赖已有的真实 QUIC/MoQ P2P 传输是否真的可达 headless 场景 | 若 headless 宿主实际不具备网络出口能力(如沙盒环境),`primeDirectPeer` 会持续诚实返回 false,`leaveCurrentRoom`/`finalizeRoomVoiceSessions` 的信令发送会静默失败 | 这本身就是红线要求的诚实行为(无网络→发不出,不伪造回执),不算风险违规,仅记录为"S2 验收时需明确 headless 测试环境的网络能力假设" |

---

## 9. 验收总门

1. `handleClose` 闭包链(§2 列出的全部函数)`invokeSites = 0`。
2. `unimaper-retained-parity-gate` 绿,digest-oracle 覆盖新增的 47(现 46)route 中本组件可达路由。
3. headless 宿主下: 无语音设备 → 会话不可启动 / 状态机停在 `idle`/`failed`,不出现任何 `voiceState==='connected'` 或伪造 track 的可观察行为(手工/自动化断言均可,取其一)。
4. 设备宿主(S3/S4)下: 真实语音互通 + `handleClose` 挂断生效(真机双端验证)。
5. 生成物审计: 对比 device 与 headless 两份编译产物,确认 `libp2pService.isNativePlatform`/媒体采集桥等分叉点均为编译期常量/独立实现体,产物中**不存在**`if (runtime detect host)`类运行时分支代码(静态扫描生成的 `.cheng`/`.o` 或对应中间产物即可验证)。
6. #65 卫生修先于 S1 落地,且落地后无新增假阳性自由变量误报。
