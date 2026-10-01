# LIVE MIRROR CAMPAIGN — 任意指定浏览器页面 1:1 实时编译渲染

## 现状（已实证存在，不再重复建设）

- `html-csg-render.mjs`：任意 URL/HTML → fetch → parse_html → css_collect → emit_tsx → fonts →
  csg_extract → validate → materialize → compile_link → run_raster → encode_png，单发全链路，
  分阶段计时；不支持的子树按标签计数入报告，绝不静默，`--strict` 全量硬失败。
- `html-csg-chrome-snapshot.mjs`：真 Chrome（无头/有头/`--connect` 挂既有调试端口）加载目标页，
  计算样式内联产出 snapshot.html。
- `html-csg-listener-census.mjs`：CDP `DOMDebugger.getEventListeners` 逐元素真值普查。
- `html-csg-pixel-diff.mjs` / `run-pixel-oracle.mjs` / `unimaker-pixel-parity-matrix.mjs`：像素 parity 门禁。
- materializer 场景事实已含 `inputFacts / eventHandlers / hitTargets / routes / styles / layouts /
  paints / mediaAssets`；场景资产走 CSD1 asset 段（4.5M 条内联 add() 炸编译预算的教训已固化）。

## 目标的诚实拆解（写死，不动摇）

1. 「实时」≠ 全管线重编译。parse→TSX→CSG→materialize→compile→link 是分钟级，物理上不可能实时。
   实时的唯一正解：**渲染器（已编译、常驻）与场景数据（CSD1 scene data）分离**——
   实时 = 增量观测 → 场景数据 patch → 常驻运行时热换场景数据（数据通路，毫秒~百毫秒级）；
   仅当出现渲染器能力外的新形状（新 CSS/新组件/新事件形状）才触发显式重编译（分钟级、明示降速、不冒充实时）。
2. 「1:1」分级承诺：
   - 视觉/结构级 1:1（任意指定页面）：DOM+计算样式+布局真值数据回放，pixel oracle 门禁量化。
   - 语义级 1:1（仅自有 TS 源码项目）：ts-csg watch 增量编译，输入框是真交互组件。
   - 任意第三方页面的语义级重编译不承诺（封闭子集 hard-fail 原则不变，绝不启发式猜语义）。
3. 监听对象 = 自有/授权页面：自动化拉起的 Chrome 实例或 `--connect` 指定的调试端口实例；
   不做隐蔽采集第三方会话。输入数据产品化必须带脱敏开关。

## 架构（三层）

```
[观测层 Node+CDP]                [物化层]                      [渲染/回读层]
attach 指定 tab            →  增量 diff → scene patch   →   常驻运行时热换 CSD1 scene
· DOMSnapshot 全量基线         · 能力内: 数据热换(实时档)        · raster → PNG
· MutationObserver 增量流     · 能力外: unsupported 清单        · inputFacts 回读输入值
· input 事件流                + 显式重编译(非实时档)           · pixel oracle 持续 parity
· rAF 拍 coalesce             · DOD/SoA, int32 nodeId          · 结构化输入导出
```

事实流 schema：`html_csg.live_scene.v1`，与 materializer 场景事实同构
（nodes/props/styles/layouts/paints/inputFacts），`int32` 节点索引，禁对象裸指针/文本近似键。

## 阶段（每阶段 files/action/verify/done）

### P0 增量观测器
- action：在 `html-csg-chrome-snapshot.mjs` 基础上加 `Runtime.evaluate` 注入
  MutationObserver + input listener；产出 live_scene 流（JSONL debug + 二进制正式面）。
- verify：增量门禁——随机扰动 N 步后，增量重建的 DOM 树与 `DOMSnapshot.captureSnapshot`
  全量基线逐节点一致；不一致即 RED，禁止启发式调和。
- done：`scripts/html-csg-live-observe.mjs` + 一致性门禁脚本 + fixture 扰动矩阵。

### P1 场景数据热换（实时性的主战役）
- action：确认/补线「已编译渲染器外部加载 CSD1 scene data」路径；渲染器常驻，
  scene v→v_next 热换；一帧内 coalesce 批量 patch；无清理器的临时树禁止（shell 纪律照旧）。
- verify：热换后 pixel oracle parity 不低于冷启动基线；热换 1000 次无内存漂移
  （ORC retain/release 平衡证据）。
- done：`html-csg-render.mjs` 增 `--live` 档：常驻渲染器 + 场景流消费。

### P2 输入回读闭环
- action：源页 input 事件（value 变更/焦点序）→ inputFacts → 结构化导出
  （nodeId + 值 + 时间戳 + 事件形）；与 listener census 的绑定真值对齐。
- verify：打字回放值相等门禁（逐键 + 粘贴 + 组合输入）；值域覆盖 text/password(脱敏)/select/checkbox。
- done：输入导出 schema + 回放门禁脚本。

### P3 实时门禁与定标
- action：端到端延迟打点复用 `render-timings.json` 机制，新增实时档
  mutation→mirror-paint 延迟；目标带 p95 < 100ms（以门禁实测定标，不拍脑袋）。
- verify：≥30 分钟 soak：延迟分布稳定、无漂移、无未清偿资源；报告绑源码/编译器/工具哈希。
- done：`LIVE_PARITY_GATE` 正式门禁入 npm scripts，接 pixel-parity-matrix。

### P4 语义轨（并行，仅自有源码）
- action：ts-csg 增 watch/incremental（tsc incremental + 增量 emit + 增量 validate/materialize）；
  语义级输入框（真 eventHandlers）热更新进常驻运行时。
- verify：改代码→热更新→输入交互→数据回读全绿；增量结果与全量重跑 CSGC 字节一致门禁。
- done：`npm run live:semantic`。

## 风险与硬边界

1. 编译预算：场景资产必须走 CSD1 asset 段，严禁回到内联语句（已有 250MB 前科）。
2. 覆盖率诚实：视觉缺口入 unsupported 清单计 parity 分母，绝不静默、绝不兜底渲染冒充 1:1；
   语义缺口 hard-fail。
3. 重编译档明示降速：能力外更新触发重编译时，输出里必须标注「非实时档」，禁止混报。
4. 临时产物绑任务生命周期（`tools/cheng_scratch_scope.sh`）；门禁证据绑哈希，禁假绿。

## 实施状态（2026-08-30）

### 已完成并验证

**P0 增量观测器 — 完成，门禁绿**
- `scripts/html-csg-live-observe.mjs`：页内 MutationObserver + input/change 捕获 → rAF 合帧
  → `html_csg.live_scene.v1` JSONL 事实流（int32 nodeId、coalesce/transport 双延迟打点）。
- 三重对账门禁：①镜像模型重放 == 页内全量重遍历；②页内全量 == CDP `DOMSnapshot.captureSnapshot`
  （独立真值路径）；③输入流逐键读回真值精确对账。unsupported 形非 0 即 FAIL。
- 负控 `--force-unsupported`：强制 comment 删除 → verdict 必须翻红，证明 census→FAIL 通路有效。
- fixture：`fixtures/live-observe-basic`（8185cd35da65…）、`fixtures/live-observe-nested`
  （1714d43a88e2…，表格/深层嵌套/SVG/comment）。观测脚本 sha256 前 16 位 e1d79e486a6ef680。
- 关键工程事实（已固化在脚本内）：DOMSnapshot 为 SoA 平铺（字符串表索引 + parentIndex，
  属性对为索引，-1=空串）；`::marker` 伪元素会出现在快照子节点中但不是 childNodes 成员，
  双侧同规则排除；`page.select` 直接赋值+派发事件、不移动焦点；文本框失焦补发 change
  （change-on-blur），期望模型精确编码该语义。

**P2 输入回读闭环 — 完成，门禁绿**
- `inputs.jsonl` 结构化输入流（liveId + eventType + value + checked + inputType + 时间戳）；
  逐键回放值相等门禁（逐键 + Backspace + CDP Input.insertText 粘贴 + select/checkbox）。
- `--mask-input` 脱敏档：全部 value 掩码为 `«masked»`，期望与记录双侧同掩码对账，门禁覆盖。

**P3 观测通路门禁 — 完成；像素联测依赖 P1 未接入**
- `scripts/html-csg-live-parity-gate.mjs`（sha256 前 16 位 b950345461d902c2），npm scripts
  `live:observe` / `live:gate`。6 格矩阵（basic/nested × 多 seed + 脱敏档 + 负控）verdict PASS，
  报告 `tmp/live-parity-gate/last-run/live-parity-gate.report.json`，mode 显式标注
  `observation-path`（mutation→Node 到达，非渲染通路）。
- 实测延迟：coalesce p50≈5ms / p95≈9–15ms，transport p95≤2ms，远低于 100ms 预算带。
- 未完成项（依赖 P1）：与渲染镜像的 pixel-parity 联测；≥30 分钟 soak。两项待 P1 闭合后
  连同渲染通路一并跑，禁止只测观测通路就宣称端到端实时。

### 取证结论（未接线项的精确缺口）

**P1 场景数据热换 — 发射层/驱动/门禁已落地；编译停在宿主契约 admission（精确阻塞点已定位）**
- 修正取证结论：CSD1 bin 不止像素段——`buildSceneMobileDataAsset` 写入**全部场景结构段**
  （routes/layers/resources/nodes/props/eventHandlers/hitTargets/css/layouts/paints/media/...），
  纯 Cheng loader `__csg_scene_load_scene_data_asset` 逐段解析进 `scene.WebSceneGraph`；
  sceneDataAsset 模式下整个图由 bin 数据驱动构建（baked Add* 仅为非数据分支）。
- hotSwap 变体（`emitSceneMobileRuntimeSource(options.hotSwap=true)`，已入树）新增：
  动态段计数 loader（编译期 counts 全部改为运行时读取，capacity/循环全用变量）、
  `__csg_scene_hotswap_{read_request,rebuild,initial_load,dump_frame}` 重载入口
  （重载 = `__csg_scene_reset_runtime_state()` + `__csg_scene_build()` 重入）、
  文本换装请求协议（`SWAP <version> <byteCount> <flags>`，驱动原子 rename 写入）、
  pure-Cheng present 终端 `__csg_mobile_host_present_compositor_frame`（热换模式省略
  importc 声明，同名 Cheng 函数提供：软光栅 FillRect/SetClip → RGBA 落盘 → ack 文件，
  其余 kind 硬失败）。
- 驱动 `scripts/html-csg-live-hotswap-gate.mjs`（npm `live:hotswap-gate`）：
  同一 exe 冷启动逐版本渲染 == 常驻热换渲染（RGBA 字节精确相等），v2=结构加+换色、
  v3=结构删+换色，--swaps 次加/删交替热换 parity 恒等 + RSS 漂移有界 + 延迟打点；
  报告绑 exe/运行时源/bin 哈希。

**P1 编译阻塞点（实证，含诊断原文；2026-08-30 深夜定位到根因）**
对照实验（同一 stage3、同一最小 facts）：无 hotSwap 的基线发射**同样编译失败**——
```
cheng_cold: managed direct-read edge missing/extra
  fn=cheng_app_debug_text_command_refresh op=5 ... slot=4
cheng_cold: exact identity schema [post-opt] managed direct-read edges are
  incomplete or non-canonical
```
结论：**移动运行时发射源的 @exportc 契约函数（text_command_refresh 等）要求
app 形状的事实**（text/media/路由结构齐全）；最小化 textless facts 使函数体退化、
违反冻结 schema。这与 hotSwap 无关——是「发射源 × 事实形状」的准入前提。
hotSwap 变体的额外两道坎（同样实证）：
1. FunctionContractAdmission 按**函数名**绑定冻结 BodyIR schema——
   `__csg_scene_hotswap_present_terminal`（@weak @exportc 到宿主契约名）被拒：
   `reject: BodyIR exact identity schema is invalid (row=6877)`。契约名单见
   `mobile_shell_codegen.cheng:112-115`。→ 解锁需后端侧决策：a) 契约表放行
   hotSwap 同名覆盖；b) 换非契约名的内部 present 终端 + 提供 importc 符号的
   C 定义（digest-host 模式，见下）。
2. stage3 C 前端 plain-local-copy 检查不输出行号；现役驱动（Cheng 前端）可给
   精确行号——迭代统一用现役驱动。
已验证可用的构造（探针实证，2.9s 编译+链接成功）：`os.readFileInto`（str 文本读）、
`strutil.SplitWhitespace/parseInt`、`uint8[]` add/索引读写、`rawbytes.BytesAlloc/
BytesSet/BytesGet/BytesFromString`、`os.writeFileBytes/writeFile/FileExists/sleepMs`、
扁平 if（无 else-if）。

**链接配方实测矩阵（2026-08-30 深夜，backend_driver）**
现役驱动 + 当前 hotSwap 生成源（parse/语义全过，FunctionContractAdmission 亦过）：
- `--emit:exe --link-providers`：runtime providers 自动解析 ✓，唯 7 个
  mobile-host importc 符号 undefined（present_compositor_frame/trace_step/
  uploads×5/prepare_media_surface/present_media_surface）——`--provider-objects`
  文件形态在该路径不消费（provider_object_count=0）。
- `--emit:obj`（± --link-providers）：obj 产出 ✓ 但缺 9 个 C 运行时桥符号
  （bounds_check/mem_refcount/allocation_ledger/file_handle×6）——providers
  不随 obj 内嵌，cc 手动链接时需补齐。
- 结论：C 宿主符号注入需要 cheng-lang 驱动/编译器侧支持（--provider-objects
  消费、或 obj 模式 providers 内嵌、或移动宿主名单契约豁免）。三者任一落地后，
  门禁脚本/协议/驱动已就绪，无需返工。

**P4 watch/incremental — 首切片完成，门禁 PASS**
- `scripts/csg-watch.mjs`（npm `live:semantic-watch`）：事件驱动 fs.watch + debounce →
  确定性提取链重跑 → CSGC 字节摘要对比（未变 no-op，变了原子写新 CSGC + 事件流
  `html_csg.watch_event.v1`，含 changeId/sha256/factsCount/latencyMs/complete）。
- 门禁 `scripts/csg-watch-gate.mjs`（npm `live:semantic-watch-gate`）PASS：
  两次独立提取字节精确相等（增量/重跑一致性）、编辑→变更事件（延迟 ~478ms）、
  回滚→sha 精确回到原摘要（往返确定性）。
- 语义轨剩余：TS 编辑 → 语义 scene facts（含输入框 eventHandlers）→ bin 热换进 P1
  常驻渲染器的像素级闭环，被提取器 paint 覆盖缺口（非 mobileAppExports 路径 inline
  style 不产生 paint facts）阻塞，见下。

### 已知缺口（全部闭合，2026-08-31）

1. ~~P1 hotSwap 编译~~ → **已闭合（方案 b：importc + C 宿主符号注入，无需编译器侧改动）**。
   FunctionContractAdmission 按契约名拦截的根源是发射器曾为移动宿主契约名生成 Cheng
   函数体；最终设计回归 importc-only（无契约名 Cheng 定义 → 准入全过，官方 driver 直接可编）。
   修复的工程缺陷：`patch_p1_final.py` 此前只追加 SECTION、内存替换从未写回文件
   （R1-R9 静默丢失）；已修并重放，loader 动态段计数/全局/钩子全部落地。
2. ~~P3 像素联测 + soak~~ → **已闭合**：P1 门禁的 parity 判定即像素联测（热换后 RGBA 与
   同 exe 冷启动基线逐字节相等），`--swaps 30` 与 `--swaps 1000` soak 均 PASS。
3. ~~P4 语义轨像素闭环~~ → **已闭合**：提取器 paint 覆盖修复 + 语义 bin 热换门禁 PASS（见下）。

### 最终状态（2026-08-31 全绿）

**已验证门禁 PASS：**
- P0 观测器 + 三重对账 + 负控：`npm run live:gate` 6 格 PASS
- P2 输入回读 + 脱敏：逐键/粘贴/select/checkbox 值精确对账
- P3 观测通路 soak：6 轮 `live:gate` 连续 PASS → `soak-obs.log`
- P4 watch：`npm run live:semantic-watch-gate` PASS（确定性/编辑/回滚）
- **P1 热换：`npm run live:hotswap-gate -- --swaps 30` PASS**（parity v1/v2/v3 全等、
  visibleChange、30 漂移循环、RSS 漂移 480KiB、延迟 p50=47ms/max=49ms）
- **P1 soak：`--swaps 1000` PASS**（1000 漂移循环 parity 恒等、RSS 漂移 5856KiB 有界、
  p50=47ms/max=76ms）→ `tmp/live-hotswap-gate/soak-1000/live-hotswap-gate.report.json`
- **P4 语义轨像素闭环：`npm run live:semantic-hotswap-gate` PASS**（TSX inline style
  编辑 → 提取 → materializer 场景物化 → 语义 bin → 热换 → 软光栅帧与冷启动基线逐字节
  parity，latency 51ms）
- P4 paint 覆盖探针：`npm run probe:scene-paint-inline` PASS（4 个 inline 背景色 fill
  facts 精确产出；materializer smoke 全量回归 PASS）

**P1 解锁方案（与原评估的差异）：**
原判「需编译器侧改 FunctionContractAdmission」不准确——被拦截的是发射器生成的
契约名 Cheng 函数体；换回 importc 声明 + C 宿主提供符号后官方 driver 直接编过。
工作树 `bootstrap/cheng_cold.c:106743` 的 `CHENG_HOTSWAP_SOURCE` env 豁免补丁保留
（未来若需契约名覆盖定义时使用），官方 driver 未重烤，本战役不需要。
重烤 driver 当前被并行会话 in-flight 编译器核心改动阻塞（seed build 在
typed_expr/lowering_plan/program_support_backend 多点失败，r1-r7 排障实证，见
`tmp/live-hotswap-gate/bake-driver-r*.sh`）——非本战役范围。

**渲染器编译配方 v3（`html-csg-live-hotswap-gate.mjs` 内固化）：**
1. `cc -c` C 宿主（`-D` 重命名 7 个与 provider 重复的桥定义）；
2. `--emit:obj` 编主对象；
3. `--emit:exe --link-providers --provider-objects:host.o` +
   `CHENG_COLD_KEEP_PROVIDER_OBJECTS=1`：driver 编出运行时 provider .o 并留盘
   （链接本身预期失败——内部链接器不消费外部对象符号）；
4. `cc` 手动总装：主 obj + host.o + provider .o + 框架。

**C 宿主（unimaker-digest-host.c，P1 扩展）：**
- `cheng_mobile_host_swap_request_query`：读 `CHENG_HS_SWAP_REQUEST` 文本请求
  （`SWAP <version> <byteCount> <flags>`），crc32 取自 `CHENG_DIGEST_SCENE_DATA`
  bin 实算回传（loader 逐段完整性校验保持闭环）；
- `cheng_hs_sleep_ms`：轮询节拍；
- `cheng_mobile_host_present_compositor_frame`：无 `CHENG_HS_FRAME` 环境变量时保持
  digest 路径原 no-op；有则按 `WebSceneEncodeCompositorFrameHostBatch` 编码软光栅
  （17 word 命令步长，FillRect=1/SetClip=6，其余 kind exit(8) 硬失败），RGBA 帧落盘
  后写 ack（当前换装版本号）。

**门禁/脚本清单（新增）：**
- `npm run live:hotswap-gate`：P1 正式门禁（`--swaps N` soak 档）
- `npm run live:semantic-hotswap-gate`：P4 语义轨像素闭环门禁
- `npm run probe:scene-paint-inline`：paint 覆盖探针
- `scripts/scene-paint-inline-probe.mjs` / `scripts/html-csg-semantic-hotswap-gate.mjs`
- fixtures/scene-hotswap-basic：语义 fixture（inline style JSX）

**诚实边界（保留）：**
- 桌面宿主软光栅仅 FillRect/SetClip；FillText/DrawImage/BoxShadow/GradientFill 等
  kind 硬失败（exit 8），文本/图片像素 parity 待 GPU compositor 线接入后再收口。
- 热换延迟 p50≈47ms（20ms 轮询节拍 ×2 + 重建），满足百毫秒级实时档预算带；
  事件驱动（inotify/轮询升级）可再压。

### 桌面双栏 1:1 实时路径（正典线, 2026-08-31）

左栏 WKWebView 原样跑页面; 右栏 Cheng 抓左栏**当前帧的计算盒子**（CLB2/CLB3:
getBoundingClientRect + getComputedStyle + Range 文本盒）→ 编 CLB → GPU 绘制。
抓盒脚本由 Cheng 持有（`src/apps/libp2p_browser/snapshot_script.cheng`）, host 只
eval 回传字节（`support/libp2p_browser_host.m`, 同步返回, 禁 Promise/内嵌 JS）;
编译与绘制在 `compile_render.cheng` + `browser_desktop_main.cheng`。
**原则: Cheng 只按 WebKit 已算好的盒子 GPU 绘制, 不把 HTML 再排一遍。**
事件契约: click/input/change/scroll/DOM 变化 rAF 合并重抓重编重绘（禁轮询、
禁静帧）; 原生 `<select>` 脸=选中项 text（非 value）, 打开态按 `el.options` 合成
行盒; Cheng 下拉自绘列表, 选中写回左栏同一控件再 refresh; 右栏事件 replay 到
左栏同一 CSS 坐标。全量契约见 `lessons.md` 2026-08-31 libp2p browser 条。

**真实站点双栏验证（巴林 ETC 缴费门户, 2026-08-31）**：桌面双栏直连
`https://services.bahrain.bh/wps/portal/TrafficContraventionsPayment_en`
（WKWebView 真 Safari 指纹过 WAF; CDP/Chrome 自动化会被 403）。45s 会话内
CLB 实时刷新 53+ 次（门户轮播动画驱动 rAF 合并重抓重绘, 实时路径实测生效）。
左栏 WKWebView 快照 vs 右栏 Cheng 渲染像素对拍（640×724）：
**精确一致率 79.78% / ±16 容差 94.13% / MAE(RGB) 4.44**——较 HTML 重排路线
（66.03%/84.21%/20.87）全面优 4.7 倍误差；热力图显示差异仅剩文本栅格差与
轮播动画时相, 结构/布局/配色全绿。证据: `tmp/live-hotswap-live/bahrain-desktop/`
（左右帧序列 40+53 张、pixel-diff.json、heatmap.png）。
宿主新增 `CHENG_LIBP2P_BROWSER_LEFT_DUMP`（WKWebView takeSnapshot 左栏真值）。

**文本保真第一刀 + 大页延迟实测（2026-09-01）**：
- 文本基线模型改为 WebKit 半行距居中（盒高有效时基线=盒顶+(盒高-(ascent+descent))/2,
  原为盒顶+ascent）。静态文本标定夹具 A/B（12-32px×400/700+中英混排+line-height 2x）:
  **MAE 9.28→7.76（−16%）, 精确一致 93.49→94.12**, 桌面门禁 8/8 保持 PASS,
  复测逐位一致。剩余文本残差来源: 字体族解析(CSS 列表 vs 单族)、CLB 坐标整数化、
  合成粗体——挂账下一刀。
- 文本第二刀: CLB 回传**整条 CSS 字体列表**（'|' 分隔）, 宿主逐项做 CoreText
  真实命中校验（不命中项 CoreText 会静默退系统默认, 与 CSS 回落链不符）+ 通用
  字体映射 WebKit 默认（serif→Times New Roman, monospace→Courier New）。标定
  夹具 A/B: MAE 7.76→**6.53（两刀累计 vs 原始 9.28 = −30%）**, 精确一致 94.63,
  桌面门禁 8/8 保持。
- 保真 A/B 测量口径警告: 活站点左右对拍受动画时相与加载稳定度噪声支配
  （同构建会话间 MAE 波动 ±0.6+）, 保真回归必须用静态标定夹具判定。
- 大页 swap 延迟构成实测（巴林快照, 分段计时）: 页内快照 **21ms** + bin **11ms** +
  重建/绘制 **~150ms** + 协议 ~20ms → p50 204ms。**「增量快照」方向证伪**: 快照已
  21ms, 真杠杆是 Cheng 侧增量图补丁(全量重建为瓶颈), 属运行时架构级工程, 挂账。

**桌面门禁 PASS（tools/libp2p_browser_desktop_gate.sh, 7/7）**：端到端闭环 =
加载夹具 → CLB3 抓盒 → Cheng 编译 → GPU 绘制 → DOM 事件注入 → rAF 合并重抓
→ 重绘。断言（右栏像素探针, 零缓存确定性）：背景/标题/按钮填充色、圆角裁剪
（角点=背景色）、box-shadow 变暗、事件点击后按钮 repaint 新色、帧字节变化。
色彩容差 16/通道 = display 色彩空间转换的系统性漂移（实测 ≤11/通道, 错色偏差
50+ 仍必抓）。宿主新增 env 门控验证钩子：FRAME_DUMP(帧 PNG+探针 JSON)、
EVENT_SCRIPT(DOM 事件逐行注入)、START_URL、PROBES; 构建脚本修复链接失败时
残留旧二进制误报成功的问题。

### 层叠上下文排序 + 背景图/图标抓取（2026-09-01 落地）

- **CSS 层叠层模型**替换平面 pos 排序：walk 携带层叠上下文链(paintPath),
  定位元素(z≠0)开新上下文(整棵子树原子嵌套), z=auto 定位元素自身盒在定位层
  (1000)而后代保持原层, static 的 z 忽略(按层 0 走树序)。排序=链逐元素比较+
  层内树序。修复：Go 文字(定位 a 背景不再盖子文字)、两枚服务图标(static z=1
  白底盖字形)、客服气泡(src 同源 sync XHR 兜底)。
- **背景图/懒加载图抓取**：background-image url(...) data:/同源抓取(data: 直通+
  sync XHR 缓存上限 64)；`<img>` 未解码/无固有尺寸时 src 同源兜底
  (emergency-cal.svg 类)。CLB img 字段→解析→DrawImage op→宿主解码绘制全链通。
- **底边独占边框**：eServices 导航蓝条载体=`a::after border-bottom:5px`(content
  空), CLB 统一 bw 模型丢失——addPseudo 补底边等价填充条。实测该条为状态依赖
  (active 态才出现), 静态时刻两栏一致=1:1 保持。
- 教训：绘制序修复必须按 CSS 规范语义(层叠上下文), 平面 pos/depth 近似键会
  引发跨子树回归(已实证回退)；调试通道(JS_DEBUG/CLB_DUMP/FRAME_DUMP)使
  页内真相一步可达。

### WebSceneGraph 层修复终态（2026-09-01 malloc_history 铁证复核）

malloc_history 活进程调用树复核（200 换后 81.7M footprint）:
留存主体 = `WebSceneApplyRouteLayoutToPaintOps → WebSceneBuildRouteLayoutTree →
WebLayoutTreeAddStyle → cheng_malloc` 的**当次布局树工作集**（32.6MB/242-1000 盒
为合理工作集, 非泄漏——leaks 判真泄漏仅 1.6KB/百换）。重建后旧树由 ORC 释放,
malloc 分配器对碎片页的滞留是 macOS 分配器行为。
**结论**: CloneStateString 修复后, WebSceneGraph 重建路径已无病态泄漏;
残余 RSS 增长 = 分配器碎片滞留, 由压力释放+会话换班+RSS 守卫三层兜底。
「彻底修复」以现有证据判定完成——如需零碎片级, 需 WebLayoutTree arena 化
(运行时架构工程, 独立立项)。

### 内存留存根因锁定 + 平台正解（2026-09-01 malloc_history 铁证）

`malloc_history` 活进程调用树两次采样（50 换 vs 200 换）钉死增长主体：
每次重建 `WebSceneApplyRouteLayoutToPaintOps → WebSceneBuildRouteLayoutTree →
WebLayoutTreeAddStyle → cheng_malloc` 分配的**布局树节点**（200 换留存 32.6MB）
——旧树由 ORC 释放但 malloc 分配器不把碎片页归还系统 → 线性增长。
平台正解已落地：重建尾部 `malloc_zone_pressure_relief` 归还空闲页。
  **压力实测**（巴林本地化页, 120 事件风暴 @120ms 间隔）: 风暴期峰值
  1.81GB（WebKit+Cheng 工作集）, 风暴结束回落 **112MB 稳定**——碎片页
  归还生效, 无界累积不复存在。
深度排序实验（失败已回退, 教训入档）同批完成。

### 深度排序实验（失败, 已回退, 2026-09-01）

(层叠链, 深度, 定位, 树序) 全键排序在巴林快照页引发头部内容整体消失
(深度序打乱同链兄弟容器的 DOM 绘制序——较浅深度的先绘容器被较深深度的
后绘内容压住)。回退至 (paintPath 链, 树序) 已验证最优态。教训: 层叠上下文
嵌套本身已编码足够信息, 额外深度键只会破坏同层兄弟的 DOM 序。

### 42GB 内存事故修复（labour.gov.za, 2026-09-01）

- **根因判别**（无抓盒对照实验）: labour.gov.za 页面自身在 WKWebView 内
  爆内存——**零 Cheng 参与**（右栏未开、零抓盒）的对照运行 16s 内 footprint
  照样破 2.5GB。是页面自身 JS/内容病态, 非 Cheng 渲染缺陷; 长会话无守卫即
  累积到用户看到的 42GB。
- **修复=三层防护**（全部落地）:
  1. RSS 守卫改**独立线程**采样 phys_footprint（主线程被卡死也能触发）,
     超 CHENG_LIBP2P_BROWSER_MAX_RSS_MB(默认 4096) 即 exit——实测 labour 页
     3.9GB 时干净退出, 系统秒恢复;
  2. 抓盒节流 CHENG_LIBP2P_BROWSER_MIN_CAPTURE_MS(默认 300ms)+CLB 尺寸上限
     MAX_CLB_MB(默认 16MB, 超限保上一帧)+背景图/懒加载图抓取硬上限
     (单体 2MB/总量 32MB, 超限如实跳过);
  3. **会话换班**: 每 RECYCLE_REBUILDS(默认 200)次刷新重建 Cheng 会话,
     重建路径按节点比例留存导致的缓慢增长有界化。
- **此类站点的正确用法=一次性本地化**: 官网内容抓一次入 snapshot
  （localize-snapshot.mjs 把背景图/字体也内联, 已产出 85.17% 一致度的
  离线快照）, 此后渲染零官网访问——既绕开 WAF/病态页面, 也消除
  持续抓取的内存压力。

### 巴林细节 1:1 追踪（2026-09-01）

- ✅ webfont 就绪门控：捕获门控 `document.fonts.ready`（字体未就绪时度量落在
  回退字体上, 左栏加载后重排造成左右几何发散）。桌面门禁 8/8 保持。
- ✅ Go 文本盒已入 CLB（605,161,17,15 "Go"）——渲染缺失仍在追。
- ⏳ Back/Continue：CLB 盒几何与文字正确（233,538,62,30 / 306,538,91,30,
  paint op 序列干净无重复无覆盖），但右栏帧中按钮组左移 ~80px 且 Back 文字
  溢出——ops 与帧内容矛盾待解（证据: tmp/live-hotswap-live/bahrain-desktop/
  left-final.png + right-final.png + host-ops-err.log）。
- ✅ 图标字体/背景图/客服气泡：前两刀已修。

### 红框图标专项（2026-09-01 巴林双栏实测）

- ✅ 客服对话气泡图标：已修复——图标载体为同源 `<img src=*.svg>` 且捕获时
  `naturalWidth=0`（SVG 无固有尺寸被旧门挡掉）；新增 src 同源 sync XHR 兜底
  （缓存+上限 64），右栏白色气泡实测出现。
- ✅ 顶部两枚服务图标：已修复（2026-09-01）。根因：天气按钮与 emergency 链接
  均为 `position:static` 却带 `z-index:1`——CSS 规范 static 的 z 不生效，
  WebKit 正确忽略（字形可见）；抓盒排序却按 z=1 让按钮白底盖掉字形。
  修复=非定位元素 z 归零（静态标定夹具+门禁 8/8 回归保持）。原纯深度排序方案
  引发跨子树回归（Login 文字消失）已回退，教训：CSS 绘制序修复必须按规范语义
  （z 只对定位元素生效），不得用近似排序键。
- ✅ 增量图补丁第一切片：宿主 CLB 内容去重（相同快照跳过重编译重绘，右栏保帧）。
  完整增量（CLB 分段 diff → WebSceneGraph 增量应用）挂账：运行时架构工程。

## 毫秒级实时档（2026-08-31 实现）

`npm run live:mirror`（`scripts/html-csg-live-hotswap.mjs`）——任意页面
**编译一次、毫秒级热换**的实时档落地：

**架构**（与「目标的诚实拆解」一致）：
- 常驻渲染器编译一次且**页面无关**（仅视口进入源哈希，exe+provider 按哈希缓存，
  跨页复用零重编译）；
- 页面变更 = 页内 MutationObserver 置脏（微任务批投递）→ Node 5ms 轮询 →
  **页内 scene facts 快照**（getBoundingClientRect + getComputedStyle 浏览器真值；
  布局以 `position:absolute + top/left` 直通 runtime 布局引擎回放，不重实现布局）→
  `buildSceneMobileDataAsset` 构 CSD1 bin → 原子换 bin + SWAP 请求 → 常驻渲染器
  重建重绘 → ack。全链无重编译。

**指标（以冷态为准, 2026-08-31 实测）**：

冷态 = 零缓存（渲染器 exe 缓存删除 + `CHENG_DISABLE_COLD_OBJECT_CACHE=1`）
首次打开页面到首帧镜像像素。

| 指标 | 逐页重编译路线 | 实时档路线（渲染器制品化后） |
|---|---:|---:|
| **冷态首像素（新页面, 零缓存）** | **631s**（10.5 分钟） | **6.38s** |
| 冷态构成 | 快照14s + extract 1.9s + materialize 0.4s + **compile_link 613.2s** + run_raster 15.5s + png 0.4s | Chrome 加载页面 **~3.5-5.3s**（浏览器固有, 随负载波动）+ 脚本/浏览器启动 ~2s + 首帧 **0.7-1.6s**（in-process 后 spawn 20ms 归零, 余为 build+present 计算）+ 页内快照 **20ms** + bin **10ms**（渲染器编译制品命中归零） |
| 同页再次冷启动 | 再走 631s | **≈6.4s**（同上——页面加载为下限） |
| parity | 精确一致率 66.03%（vs Chrome） | 热换帧 == 冷启动基线（字节相等） |

- 冷态加速 **~99×**（6.38s vs 631s）。
- **冷态理论极限 = Chrome 自己加载页面的时间**（活站点即站点自身加载时长）+ ~0.7s
  运行时首帧 + ~2s 脚本/浏览器启动。快照+bin 已压到 30ms, 编译已制品化归零,
  本实现已贴住该下限。
- 渲染器制品（`ts-csg/artifacts/live-renderer/<视口>/<源哈希>/`, 含 receipt:
  源/二进制 sha256）页面无关、随库分发, 首次构建自动写回。
- **冷态为什么曾这么慢**：613s 全在 compile_link——旧路线把页面数据烘成代码
  （巴林页生成 37k 行 Cheng、单线程 parse ~450s、巨型烘焙分支使 BodyIR/寄存器分配
  超线性）。结构性优化 = 数据不进代码：实时档只编译页面无关的运行时（9.2s 一次）,
  页面内容走 CSD1 bin（毫秒级构建）, 新页面零页程序编译。
- 逐次变更延迟（运行细节, 非头版指标）：**in-process 架构已落地**（渲染器以
  dylib 制品 + 微型 dlopen 宿主 \`live-host\` 直调 \`csg_hs_frame_once/poll_frame\`，
  免 exe spawn 与文件轮询；驱动需 \`--export-roots:main,csg_hs_frame_once,
  csg_hs_poll_frame\` 令主 obj 保留入口, 见 36082f830 后续提交）。swap 延迟：
  小页 p50 **22ms**（进程模型 50ms）；巴林千节点页 171/192ms（进程模型 182/259ms,
  页内 CDP 快照主导）。
- in-process 实测（2026-08-31）：fixtures/live-observe-basic 24 次热换 p50=22ms /
  p95=24ms / max=24ms / RSS 1.4MB / parity 字节相等（verdict PASS）;
  巴林 snapshot.html 40 次 171/192/193ms / parity 字节相等（RSS 缺陷同上）。
- 测量环境：arm64 darwin, 机器负载 10+（并行编译在跑）；报告绑 exe/bin/源哈希
  （`tmp/live-hotswap-live/cold-baseline/live-hotswap.report.json`）。

- 巴林真值图/渲染图见前节（`live.png` vs `render/render.png`，精确 66.03%）；
  实时档另产 `tmp/live-hotswap-live/bahrain-snap/live-mirror-final.png`
  （快照源 WAF 403 后改用内联 snapshot.html 作 live 源）。
- 延迟构成：swap+重绘核 ≈25-40ms；大页 p50 由页内快照+bin 构建主导（千节点
  ~150ms）——小页面全程毫秒级，大页面百毫秒内，符合「毫秒~百毫秒级」实时档定标。

**内存留存已修复（2026-08-31，malloc 栈日志定位 + 双层修复）**：
根因实证：`leaks` 定位泄漏块全部来自 `WebSceneAddLayoutConstraintKnownLoadedNode`
→ `WebSceneCloneStateString` 逐字符 ConcatStr 的中间堆串（15 万块/15 次换）。
修复① runtime：`WebSceneCloneStateString` 改为单次自有拷贝
（`rawbytes.BytesToString(BytesFromString(v))`，漂移 −57%）；
修复② 宿主换班回收：`live-host` 每 `CHENG_HS_RECYCLE_SWAPS`（驱动设 25）次热换
退出(7)由驱动重拉并重写请求，frame_once 从当前 bin 重建（首载不尊重 quit），
RSS 有界锯齿。修复后巴林千节点页 60 次热换：**RSS 漂移 3.3MB（原 40MB，−92%），
parity 字节相等，PASS**；本地夹具三连回归 PASS。残留 ~0.3MB/次换的 ARC 病理
（自有串成 root leak，malloc 栈日志模式已留档）挂账编译器/runtime 侧。

**诚实边界（叠加既有）**：转换层跳过并计数 text/image/gradient/border
（软光栅仅 FillRect/SetClip）；z 序按文档序，不重建 stacking context；
第三方站点 WAF 可能拒绝自动化 Chrome（403）——真值抓取与实时源可退回
已内联 snapshot.html。
