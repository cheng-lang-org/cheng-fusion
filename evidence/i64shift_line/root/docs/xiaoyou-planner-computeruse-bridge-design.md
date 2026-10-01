# 小优引擎桥：cheng-lang 推理规划器 ↔ UniMaker computer-use 执行面 设计侦察报告

状态：纯设计文书，零代码落地。两仓主树只读侦察，结论均锚定到具体文件/commit。

## 0. 结论先行

- 两仓当前是三座互不相连的孤岛：① cheng-lang `inference_planner_cli`（真权重推理管线，桌面 CLI，行文本协议）；② UniMaker `asiComputerUseContract.ts`（纯 JS 规则分类器 + 执行回路，S1 确认门 + S3 四回路已生产级打通）；③ cheng-lang `src/apps/unimaker/*`（EvoMap 记忆/基因经济体，另一套协议，与前两者也不通）。`e1216bafa` 只是把①③的分类规则文本镜像到了一起，没有建立运行时调用关系，UniMaker 侧运行时用的仍是自己的 JS 正则。
- 桥协议不该有两套（桌面子进程 JSON + 生产 FFI 并存）。第一性原理：协议是被验证的契约，契约分叉一次就要维护两份语义一致性证明，且 UI 控制面异步事件驱动的铁律天然排斥子进程轮询/socket 两种候选。cheng-lang 生产侧已有且仅有一种被双端（Android NDK27 + HarmonyOS SDK23）验证过的移动 FFI 范式——`vpn_proxy_mobile_core.cheng` 的 SABI（utf8_view/bytes_view 输入深拷贝 + `@importc` emit 回调事件驱动输出，禁裸指针、禁 str/cstring/owned_cstring 跨边界直传）。推荐直接复用这一套，桌面验证也走同一 ABI（用编译器已内置的 `--provider-objects:` 链接一个几十行的 C 桩，而不是发明另一个传输层）。
- 最小首切片：新增 4 个文件（1 个 Cheng 桥模块 + 1 个 C 桩 provider + 1 个 Cheng smoke 测试 + 1 个 shell 驱动脚本），零改动任何既有文件，桌面用 `cheng.stage3 system-link-exec --provider-objects:` 编译执行，不需要任何真权重、不碰 op-lane 热点文件、不碰 UniMaker 主树。verify = 8/8 断言 + exit 0。

---

## 1. 现状证据

### 1.1 cheng-lang 侧：推理规划器现状

`src/tests/inference_planner_cli_main.cheng`（`main()`，166-274 行）是唯一的规划器桌面入口，本质是一个**测试/oracle CLI**，不是生产运行时组件：

- 参数契约：`--config`/`--weights`（或环境变量 `CHENG_PLANNER_CONFIG`/`CHENG_PLANNER_WEIGHTS`）二者缺一 hard-fail（exit 2，不静默造假权重）；可选 `--prompt`/`--prompt-tokens`/`--max-new-tokens`/`--tensor-scale`/`--model-cid`/`--tokenizer`/`--unicode-tables`。
- 输出契约：**行文本 `key: value`**，不是 JSON（`echo(strutil.Join(["task_kind: ", ...], ""))` 这种拼串方式）。关键行：`prompt`/`prompt_token_ids`/`task_kind`/`prompt_roundtrip_ok`/`config_path`/`weights_path`/`graph_weights`/`graph_ops`/`generated_token_ids`/`decoded_text`/末尾 `inference_planner_cli_main ok`。
- `task_kind:` 这一行（222 行）只在 `--prompt` 文本路径才会输出，`--prompt-tokens` 模式（跳过 tokenizer 直喂 token id）完全不产出 task_kind——说明该 CLI 从设计上就是"验证生成管线本身"，不是"验证任务分类契约"，两者只是恰好共用一个入口文件。
- 真正的分类逻辑在 `src/inference/planner_task.cheng`（`e1216bafa`，2026-07-14 新增）：`PlannerTaskClassifyFromText(text: str): str`，7 个 taskKind 常量 + 6 条关键词规则，注释明确写着"规则镜像桥（结构闭环）……不是模型驱动的真语义分类"，且"后续把本函数体换成模型 logits argmax 到 taskKind 词表映射时，调用方签名零改动"——这是一个刻意设计的稳定契约点，桥应该挂在这个函数上，而不是挂在 CLI 的行文本输出上。
- `src/tests/planner_task_kind_smoke.cheng` 是纯函数级 smoke（8 组用例，含空文本边界），零权重依赖，桌面秒级可跑，是"不依赖真权重"约束下唯一可复用的分类验证基座。
- 真实生成管线（`hf_model_graph`/`weight_store`/`weight_binding`/`model_executor`/`distributed_engine`）已用极小 Qwen2 toy config（vocab=6/hidden=8/2层，`src/tests/inference_planner_cli_weights_path_smoke.cheng` 28-42 行）+ 合成 safetensors 字节在桌面验证过完整链路（含 mutation 哨兵证明不是摆设），但这条链路与 task_kind 分类是**正交**的两件事——分类不需要权重，生成需要。首切片只取分类，不碰生成。

### 1.2 UniMaker 侧：computer-use 执行面现状

`React.js/app/libp2p/asiComputerUseContract.ts` 是唯一的任务图编译入口：`compileAsiVoiceToComputerUse(transcriptRaw, createdAt, options)`（200-317 行）。关键事实：

- 该函数**自己**通过 `classifyTaskKind(transcript)`（353-363 行，正则规则）做分类，不接受外部传入的 taskKind、不接受任何分类结果注入。7 个 taskKind 字符串常量与 cheng-lang 侧逐字节相同（`e1216bafa` 已核对），但运行时链路完全独立，互不调用。
- 调用点是 `ChatPage.tsx` 的 `appendAsiAssistantReply(source)`（1136-1224 行）：`transcript` 来自聊天消息文本或语音 ASR 的 `voicePayload.transcript`，同步调用 `compileAsiVoiceToComputerUse` 后，按 taskKind 分发到四个 handoff（`requestAsiPublishDraftHandoff`/`requestAsiProductPublishDraftHandoff`/`requestAsiEcomSearchHandoff`/`requestAsiHomeFeedFilterHandoff`）。整条链路**同步、非 async**——这是后续接入真推理引擎时必须打破的一个既有假设（真推理有延迟，UI 侧要么等待态、要么事件回填，不能假装同步）。
- S1 确认门（`e59287c1b`，2026-07-11）：`IRREVOCABLE_EFFECT_CLASSES = {external-publish, payment}` 白名单，无论 `executionMode` 是 `ai-code` 还是 `human-gui`，这两类效果恒需用户显式确认，ai-code 模式无权豁免。
- S3 四回路（`4a9bb3e85`，2026-07-11）：授权商品发布/购买辅助/内容搜索/首页筛选四类任务的 handoff 全部接通（sessionStorage handoff → dispatchEvent → App.tsx 导航 → 目标页 useEffect 消费 → 回流对话），只有 taskKind 分类结果本身来自本地正则，不来自任何推理引擎。
- **两仓 grep 双向零命中**：cheng-lang 侧无任何文件引用 `asiComputerUseContract`/`ChatPage`/`compileAsiVoiceToComputerUse`；UniMaker 侧无任何文件引用 `planner_cli`/`distributed_engine`/`PlannerTaskClassifyFromText`。战役定位描述准确。

### 1.3 生产侧已验证的移动 FFI 范式（唯一候选基座）

`src/apps/vpn_proxy/mobile/vpn_proxy_mobile_core.cheng`（588 行，15 个 `@exportc` 入口，2026-06-26 完成去裸指针重写，NDK27 + OHOS SDK23 双端 rc=0 编译验证）确立的范式：

- **输入**：文本走 `(ptr, len: int64)` 对，入口内 `ChengHy2TunMobileCopyRawText` 立即深拷贝成 `str`（`rawbytes.BytesView` + `BytesToString`，107-117 行）；二进制走同款深拷贝到 owned `Bytes`（119-132 行）。C ABI 语义上等价于 `utf8_view`/`bytes_view`（调用期有效，不可跨调用存留原始指针）。
- **输出**：**禁止**通过 `@exportc` 返回值传字符串（`str`/`cstring`/`owned_cstring` 全被 SABI 编译期拒绝，`bail 801`）。文本结果必须走 `@importc` **emit 回调**——C/JNI/NAPI 宿主预先注册 setter，Cheng 在 `@exportc` 函数体内**同步**调用该回调把标量 + 文本字段推给宿主（79-110 行 `ChengHy2TunStartEmit`/`ChengHy2TunStatusEmit`/`ChengHy2TunSnapshotEmit`）。这是**事件驱动 push**，不是宿主轮询拉取，天然符合"移动端 UI 控制面异步事件驱动而非轮询"的第一性原理约束。
- **产物落点**：编译到 `libcheng_mobile_capi.so`（`React.js/android/app/src/main/jniLibs/arm64-v8a/`），Kotlin 侧用 `external fun` 声明对应符号（`ChengLibp2pNative.kt` 同款模式），Capacitor `@CapacitorPlugin` 把 JNI 调用暴露给 JS（`call.resolve(JSObject)`）。HarmonyOS 侧镜像为 NAPI 桥（`cheng_hy2_tun_core_bridge.h`）。
- 该 ABI 形状本身有编译期硬门禁：`tests/cheng/backend/fixtures/sabi/*` 正例/反例夹具 + `src/tests/sabi_string_bridge_smoke.cheng` 断言 spec 文本标记存在，`bootstrap/cheng_cold.c:57273` 的 `cold_run_host_smoke_sabi_string_bridge` 是编译器自带的合规回归测试——即这不是我这次设计新发明的协议，是编译器级别已经钉死、双端已经出货验证过的边界规则，复用它的协议风险等于零，唯一工作量是"照抄配方写新的 exportc/importc 入口"。

### 1.4 反面参照：已存在但是纯 Mock 的"边缘推理桥"

`React.js/android/app/src/main/kotlin/com/unimaker/app/edge/EdgeInferenceBridgePlugin.kt`（Capacitor 插件 `EdgeInferenceBridge`，`content_filter`/`speech_asr`/`background_blur` 三能力）**全部**是 Kotlin 侧关键词字符串匹配和硬编码返回值（`nudenetScore=0.93`、`latencyMs=24` 等常量），`engine: "cheng_native"`/`native_runtime_enabled: true` 字段均为断言性文本，**没有任何 JNI 调用、没有链接任何 `.so` 符号**。这是"标榜生产、实为 mock"的反面案例——用户 CLAUDE.md 明确"生产代码严禁 Mock"，这个插件目前处于违反该原则的状态（不在本次任务范围内，不修，仅作证据记录：证明"UniMaker 侧目前没有任何一条能力是真连了 Cheng 原生推理的"，包括表面看起来最像的这一条）。

真正连了 Cheng 原生代码的对照组是 `ChengLibp2pNative.kt`（`android/app/src/main/kotlin/com/unimaker/app/libp2p/`）—— 真 JNI handle、真 `dlopen`/`UnsatisfiedLinkError` 处理、真 `libcheng_mobile_capi.so`/`libnimlibp2p.so` 链接（`CMakeLists.txt:39` `-l:libcheng_mobile_capi.so`）。新桥要长得像这一个，不要长得像 `EdgeInferenceBridgePlugin`。

### 1.5 相邻但正交的第三条线（不要混进来）

`src/apps/unimaker/unimaker_edge_agent.cheng`（+ `unimaker_edge_types.cheng`/`unimaker_product_publish.cheng`）是"EvoMap"记忆/基因/胶囊经济体（P2P 身份、capsule 存证、A2A hello/push/pull 协议），用 `cheng/mobile/mobile_sdk`（无 SABI 边界，纯 Cheng 库）而非 emit 回调模式。它和推理规划器（`cheng/inference/*`）、和 computer-use 执行面（`asiComputerUseContract`）三者两两不通，是三座独立孤岛而非两座。本次桥接目标明确限定在"推理规划器 ↔ computer-use 执行面"这一对，不涉及 EvoMap。

---

## 2. 候选桥协议评估

评估约束：① 生产终态 = Android（Capacitor）+ HarmonyOS（native）应用内推理，同进程；② 桌面开发态需要能在不下载真权重的前提下验证契约；③ 用户第一性原理铁律——移动端 UI 控制面必须事件驱动而非轮询；④ 不允许两套协议并存（分叉即失去"验证过"的意义）。

| 候选 | 生产终态适配 | 事件驱动契合度 | 桌面可验证性 | 新增协议面 | 现有证据/风险 |
|---|---|---|---|---|---|
| **A. 子进程 + stdio JSON 行** | 差。Android/HarmonyOS 应用内嵌不适合常驻/按需 fork 子进程做核心推理路径（进程生命周期、启动开销、无常驻 shell、沙箱限制），且现有 `planner_cli` 输出是 `key: value` 纯文本不是 JSON，接入前还要新造一层 JSON 序列化 | 差。子进程通信天然是"发请求→等 exit/读完 stdout"的请求-响应轮询式读取（除非再造一层长驻 stream reader），不是 push 事件 | 好，但这正是它已经在做的事（`inference_planner_cli_weights_path_smoke.sh`），属于"验证生成引擎正确性"的 oracle 角色，不是"验证桥协议"的角色 | 大。要新造 JSON schema + 长驻进程管理 + 两套（桌面子进程/生产 FFI）语义一致性证明 | `planner_cli` 现状证明了它的定位就是**桌面回归 oracle**，不是运行时组件；把它拔高成生产桥要素颠倒了它的设计意图 |
| **B. 本地 socket（含 UDS/TCP loopback）** | 差。同进程内推理引入跨 socket 通信等于人为制造进程边界+序列化开销，且引入常驻 server 生命周期管理、端口/句柄冲突、Android 后台进程回收风险，无任何现有需求（无需跨设备/跨 App 共享模型）支撑这个复杂度 | 可以做成事件驱动（长连接 + push），但需要另起一层连接管理/心跳/重连状态机，而这套状态机 SABI emit 回调机制里免费自带（函数调用本身就是同步 push，无需连接概念） | 中。桌面能起，但要维护 server/client 两端代码，且验证的是"我搭的 socket 协议"而非"生产真链路" | 大。全新序列化格式 + 连接生命周期状态机 + 无先例可循（本仓 socket 用于 vpn_proxy/QUIC 等网络传输域，不用于进程内模块耦合） | 是为跨设备/跨进程分布式场景设计的方案（如未来 `distributed_engine` 真正做多端算力共享时才有正当性），套用到"同一个 App 内 UI 与推理内核通信"是过度工程 |
| **C. 进程内 FFI（SABI utf8_view 输入 + emit 回调输出）** | **好**。就是生产终态本身——同进程、零序列化开销、零额外生命周期管理 | **好**。emit 回调=函数调用内同步 push，调用方（JNI/NAPI 宿主）收到即是事件，无轮询语义 | **好**。编译器自带 `--provider-objects:` 链接机制，桌面用几十行 C 桩顶替 JNI 宿主即可让**同一份 Cheng 代码**在桌面跑通，验证的就是生产 ABI 本身，不是仿制品 | **零**。协议规则已经是编译器内建硬约束（SABI spec + 正反例夹具门禁），照抄 `vpn_proxy_mobile_core.cheng` 现成配方即可，不发明新东西 | 双端（NDK27+OHOS SDK23）已生产验证，15 个既有 `@exportc` 入口作为参照实现，风险最低 |

**评估结论**：不存在"桌面用 A、生产用 C"的正当理由——A 的桌面可验证性优势是虚假的，因为 C 用 `--provider-objects:` 桩替换宿主之后桌面可验证性和 A 打平甚至更强（验证的是生产代码本体而非另一份协议实现），而 A 在生产端完全不可行、在事件驱动约束上完全不达标。B 是为一个不存在的分布式需求引入的过度工程。三者不是同一量级的候选，C 唯一成立。

`planner_cli` 不需要废弃或改造——它的定位继续做"生成引擎正确性 oracle"（真权重路径、golden 回归），与桥协议是两件事，不冲突。

---

## 3. 推荐方案

### 3.1 契约设计

在 `PlannerTaskClassifyFromText`（已存在，e1216bafa，签名稳定承诺"未来换模型 logits 映射调用方零改动"）外面包一层 SABI 边界，新增模块 `src/apps/unimaker/mobile/unimaker_planner_task_bridge_core.cheng`（选址理由：`src/apps/unimaker/` 已是 UniMaker 专属 app 域根，`vpn_proxy` 已确立"app 根/mobile/xxx_core.cheng"子目录惯例，新建 `unimaker/mobile/` 与之同构，避免另起 `src/apps/xiaoyou/` 造成两个 app 根表达同一产品）：

```
@importc("cheng_unimaker_planner_task_kind_emit")
fn ChengUnimakerPlannerTaskKindEmitRaw(taskKindRaw: ptr, taskKindLen: int64): int32

fn ChengUnimakerPlannerTaskKindEmit(taskKind: str): int32 =
    return ChengUnimakerPlannerTaskKindEmitRaw(StrDataPtr(taskKind), int64(len(taskKind)))

fn ChengUnimakerPlannerCopyRawText(raw: ptr, rawLen: int64): str =
    if raw == nil || rawLen <= int64(0):
        return ""
    if rawLen > int64(2147483647):
        return ""
    return rawbytes.BytesToString(rawbytes.BytesView(raw, int32(rawLen)))

@exportc("cheng_unimaker_planner_classify_task_kind")
fn cheng_unimaker_planner_classify_task_kind(transcriptRaw: ptr, transcriptLen: int64): int32 =
    let transcript = ChengUnimakerPlannerCopyRawText(transcriptRaw, transcriptLen)
    let taskKind = ptask.PlannerTaskClassifyFromText(transcript)
    return ChengUnimakerPlannerTaskKindEmit(taskKind)
```

逐行对照 `vpn_proxy_mobile_core.cheng` 79-117 行的既有配方，零发明。生产落点：编入现有 `libcheng_mobile_capi.so`（同一 `.so` 已被 JNI/CMake 链接消费，追加符号是最小面改动，不新起一个 `.so`）；Kotlin 侧新增 `external fun` 声明 + 一个**真实**（非 mock）Capacitor 插件方法，风格对齐 `ChengLibp2pNative.kt` 而非 `EdgeInferenceBridgePlugin.kt`。

调用方（`asiComputerUseContract.ts`）需要的配套改动（超出本次"零代码落地"范围，仅记录为下一步依赖）：`compileAsiVoiceToComputerUse` 目前恒自算 `classifyTaskKind(transcript)`，要接收桥回传的 taskKind，需要新增一个可选覆盖参数（如 `options.taskKindOverride`），并把 `ChatPage.appendAsiAssistantReply` 的同步调用改为等待桥的 Promise/回调结果——这是一处架构性事实要求（真推理有延迟，同步假设必须打破），不是本设计文书要解决的问题，留给下一轮 OpenSpec 提案。

### 3.2 为什么这是第一性原理最优而非过度设计

- 唯一新增的抽象是"给一个已经存在、已经稳定的纯函数包一层已经存在、已经生产验证过的 ABI 边界"——零新协议、零新序列化格式、零新生命周期状态机。
- 事件驱动是免费的：emit 回调本身就是同步函数调用内的 push，不需要额外设计"如何做成事件驱动"。
- 桌面验证和生产验证是**同一份代码**在跑（区别只是宿主实现是 C 桩还是 JNI），不存在"桌面测过了但生产行为不一致"的验证鸿沟。
- 面向未来的分类算法升级（规则镜像 → 真模型 argmax）不触碰这层桥——`PlannerTaskClassifyFromText` 内部实现换掉，`cheng_unimaker_planner_classify_task_kind` 签名和 ABI 完全不变，这也是原作者在 e1216bafa 注释里已经写明的设计意图，桥的存在进一步把这个承诺延伸到跨语言边界。

---

## 4. 最小首切片（files / action / verify / done）

范围：仅 cheng-lang 侧，桌面可验证，不碰任何真权重、不碰 UniMaker 主树、不碰任何既有文件（零改动风险，不撞 op-lane）。

**files（4 个新文件，0 个改动）**：
1. `src/apps/unimaker/mobile/unimaker_planner_task_bridge_core.cheng` —— 桥模块本体（3.1 节代码，import `std/rawbytes`、`cheng/inference/planner_task as ptask`）。
2. `src/tests/fixtures/unimaker_planner_task_bridge_provider.c` —— 桌面用 C 宿主桩，职责仅两个：① `cheng_unimaker_planner_task_kind_emit(data, len)` 把收到的字节捕获进静态缓冲区；② `unimaker_test_emit_matches(expected, expected_len)` 逐字节比对缓冲区与期望值，返回 `int32`（沿用 `sabi_string_provider.c` 里 `SabiAcceptUtf8(text: utf8_view): int64` 已经验证过的 `(ptr,len)→原生标量`形状，不引入任何新 ABI 形状，规避 cstring 返回值这类尚待确认的边界情况）。
3. `src/tests/unimaker_planner_task_bridge_smoke.cheng` —— 8 组用例（7 个 taskKind + 1 个空文本边界，直接照抄 `planner_task_kind_smoke.cheng` 的 8 组转录文本），每组：`import` 桥模块调用 `cheng_unimaker_planner_classify_task_kind(...)`，再 `import`（`@importc`）`unimaker_test_emit_matches` 断言。若跨模块直接调用 `@exportc` 函数在语义上受限（本设计未在源码中直接找到反例但也未找到跨模块调用 `@exportc` 的既有正例，需在 apply 阶段第一步先用最小 fixture 确认），退路是把 `main()` 与桥入口放进同一份文件，不影响契约设计只影响文件切分。
4. `tools/unimaker_planner_task_bridge_smoke.sh` —— shell 驱动，结构镜像 `tools/inference_planner_cli_weights_path_smoke.sh`：
   ```
   cc -arch arm64 -std=c11 -O2 -c -o <out>/provider.o src/tests/fixtures/unimaker_planner_task_bridge_provider.c
   $CHENG_DRIVER system-link-exec --root:$ROOT \
     --in:src/tests/unimaker_planner_task_bridge_smoke.cheng \
     --emit:exe --target:arm64-apple-darwin \
     --provider-objects:<out>/provider.o \
     --out:<out>/smoke
   <out>/smoke | tee <out>/smoke.stdout
   grep -q "unimaker_planner_task_bridge_smoke ok" <out>/smoke.stdout
   ```
   （`--provider-objects:` 是 `bootstrap/cheng_cold.c:57240` 已内建、`cold_run_sabi_positive_case` 已在用的编译器原生能力，非我方案新造，直接复用。）

**action**：新建以上 4 个文件，不改动任何既有文件（含 `planner_task.cheng`/`vpn_proxy_mobile_core.cheng` 均不动，纯新增引用）。

**verify**：
1. `bash tools/unimaker_planner_task_bridge_smoke.sh` exit 0。
2. stdout 含 8 条断言通过标记 + 末行 `unimaker_planner_task_bridge_smoke ok`。
3. 回归防线：同时重跑既有 `planner_task_kind_smoke.cheng`（`cheng.stage3 system-link-exec --in:src/tests/planner_task_kind_smoke.cheng --emit:exe ...` 后执行），确认底层分类函数未被本次改动影响（8/8 依旧绿）。
4. `git status` 只显示 4 个新增文件，无任何既有文件的 diff。

**done**：verify 1-4 全部满足，且新增代码零使用裸指针（`ptr` 仅出现在 `@exportc`/`@importc` 边界签名上，函数体内立即转换成 `str`/深拷贝，与 `vpn_proxy_mobile_core.cheng` 现有铁律一致）。

首切片完成后的自然下一片（不在本次范围，仅记录）：① Kotlin 侧 `external fun` 声明 + 真实 Capacitor 插件方法，替换/补齐 `EdgeInferenceBridgePlugin` 里名不副实的 mock；② `asiComputerUseContract.ts` 加 taskKind 覆盖参数 + `ChatPage` 调用链异步化；③ HarmonyOS NAPI 侧镜像；④ 待真 Qwen2.5-0.5B 权重可用时，把 `PlannerTaskClassifyFromText` 内部实现换成模型 logits argmax（桥 ABI 不变）。
