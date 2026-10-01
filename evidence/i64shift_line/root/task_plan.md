# Task Plan

## 战役 R：纯 Cheng 最小内核与资源双极限（2026-09-03 apply）

> 口径迁移（2026-09-08 用户令）：内存模型理论极限=768MiB=805,306,368 bytes；下文历史 `exact-1GiB` 门名/记录为迁移前口径，保留原名，新门禁一律 768MiB。

用户已明确要求实施 `docs/cheng-minimal-kernel-plan.md` 与
`docs/memory-time-limits-plan.md` 的联合完成计划。本战役只按生产闭环计完成：脚手架、静态
文本命中、缓存命中重跑、Darwin 单 PID RSS、masked compare、旧 artifact/receipt 均不得转绿。
当前工作树中的 `cleanup_cfg.cheng`、`ownership_drop_ir.cheng` 与 `.gitignore` 为外部在途改动，
冻结前只读 Review，不覆盖、不建分支或 worktree。

### 2026-09-05 持续目标：GEN2/GEN3 + Phase B + Phase C 并行推进

```text
固定点线：当前组合/held-exec 入口复核 -> 独占 768MiB 烤机 -> GEN2 -> GEN3 -> raw cmp/SHA
Phase B：正式规范核对 -> 可扩展探针门 -> 逐特征垂直切片 -> 11 项逐项判决
Phase C：C-0 精确账本 -> 堆腐定谳 -> Merkle 生命周期 -> mmap/按需物化
```

| 线 | 本轮 files/action | verify | done |
|---|---|---|---|
| 固定点 | production authority、composition/ignition 工具；先找当前最前方真实阻塞，重型烤机只在机器静默窗独占执行 | 不同 inode、原始 `cmp`、SHA-256、`full_backend_codegen=1`、`cold_system_link_exec=0` | GEN2/GEN3 原始字节固定且 768MiB 正式证据绑定 |
| Phase B | `user_path_gate.sh`/baseline 先扩为“四核心夹具+特征探针”；再按 formal spec 做 parser→typed→lowering→emit 垂直切片 | 每项独立 compile/run 探针；非法或未入规范表面保持 hard-red | 11 项均有不漂移的正式判决；通过项进入基线 |
| Phase C | 先做 C-0：allocator live/alloc/free 唯一权威、terminal-release 采样、持有者账；再据实选择生命周期/mmap 路径 | 报告与进程树采样对账、cache-off 同名字节、毒化网 | ordinary≤200MiB，完整自举≤768MiB，且终态 live=0 |

并行只用于文件面互斥的静态/合同工作；编译与自举烤机串行。当前外部
`cleanup_cfg` 编译仍占用 CPU，退出前不得启动第二条重型构建，避免把资源争用误判为编译器回归。

```text
R0 真值/提案/唯一硬门
  -> R1 四夹具 4/4 + 正式语法探针
  -> R2 kernel 数据合同 + 四个真实组合闭包
  -> R3 条目身份/缓存 + 并行物化 + mmap/按需 + 生命周期
  -> R4 GEN1->GEN2->GEN3 原始固定点 + CSG 取件进入下一组合
  -> R5 Linux cgroup v2 768MiB + Darwin 原生证据 + 原子发布/归档
```

| 分片 | files | action | verify | done |
|---|---|---|---|---|
| R0 | OpenSpec、`kernel_release_gate`、cache/user-path/closure gates | 冻结 exact schema、任务 scratch、cache-off 正式轮、source/compiler/tool/target/jobs/RSS/hash 回执 | 每个门有真实负例；当前缺口保持 RED | 唯一 `cheng.kernel.release.v1` 回执与硬门可重算 |
| R1 | TypedExpr/BodyIR/cleanup/exact-def 真实生产链 | 修 `cold_nested`、`v6` 的唯一定义/消费关系；以 formal spec 实测语法 | compile 全 0；run=0/1/0/0；compile/run 都在进程树守卫 | 4/4 且任一 RSS/逃逸/判词漂移非零 |
| R2 | codegen contract、composition roots、manifest/driver | kernel 只传 SoA/int32 数据；每组合真实导入一个插件；二进制自身报告缺插件 | 全图闭包、重复导出、三 target source/object receipt | kernel 不可达 arch；每组合恰一插件且产物可重建 |
| R3 | snapshot/Merkle、entry cache、materialize、mapped reader、lifetime ledger | 稳定 declaration/function identity；frozen BodyIR 条目缓存；canonical row 发布；精确末消费后 arena 释放 | cache-off 与 jobs=1/N 原始字节；损坏 hard-fail；20 次 live=0 | cold<=40s、zero<=3s、1/3 file<=10s、ordinary<=200MiB |
| R4 | bootstrap authority、CSG pickup/composition | C 只产 GEN1；纯 Cheng 产 GEN2/GEN3；真实 compiler hash 取件后进入下一组合 | 不同 inode；raw `cmp`+SHA；online/tamper/offline 三臂 | GEN2==GEN3、full_backend=1、cold=0、无 cold C 闭包 |
| R5 | Linux/Darwin authority、publisher、CI、正式仓 | Linux cgroup v2 exact 768MiB；Darwin 原生运行；全门后原子替换 | 独立 validator；receipt/closure/source 后置重算 | 两计划同步、OpenSpec archive、`cheng-fusion` 无覆盖落仓 |
| R6 | ZRPC/DoD/SoA/Arena/ORC + 无 C 冷链（`docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md`） | 闭包零指针/零 cold 引用；Arena/SoA 收口；ORC 生产接线；C 只产 GEN1 | `tools/zrpc_kernel_gate.py` 三模式 + 负例自检；ORC `alloc==free`/`live=0`；内核产物 `_cold_`=0 | §7 八项同时成立 |

执行状态：R0 证据系统已落地（唯一 release gate、canonical receipt、任务 scratch、cache-off、
组合编译报告与 Linux 768MiB 命令精确绑定），本机合同门已绿；正式 Linux 回执尚无。R1 已进入
fresh aarch64 composition 四夹具验证，kernel-only 产物按设计只能返回 plugin missing；R2 的
manifest/held-exec 接线已落地，但严格闭包仍为 RED（201 个 core 可达文件、13 个 arch 可达文件），
不得发布。R3-R5 未完成。环境缺失只记 RED/blocked，不得 SKIP 成绿。每一刀完成后执行 Review
查 Bug，再从第一性原理检查是否存在更小且更强的实现。R6 方案已落
（`docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md` + `tools/zrpc_kernel_gate.py`
+ 基线 + 负例自检；当前 RED：kernel-core 347、cold 9、closure 977），施工按 Z0-Z8 推进。

## 战役 R：语义泛化——滚动/iframe/shadow/SPA/真站（2026-09-03 立项即执行）

目标：把"任意 Web 项目转 cheng GUI 即具备文字控制"从静态夹具推向实战边界。五条：
- R1 滚动寻址 ✓：视口外交互控件仍入快照与控件表（渲染天然裁剪无害），执行注入 scrollIntoView 后真实点击
- R2 同源 iframe：name 求解链 ownerDocument 修正 ✓；跨域 iframe 语义收割=W3C 安全边界，如实标注不做
- R3 shadow DOM：open shadowRoot 穿透 walk ✓；closed=语言边界不做
- R4 SPA 切换：captureId 稳定性验证夹具（路由切换前后同名控件 id 恒定+新控件可寻址）
- R5 巴林真站实战冒烟（一次性，如实记录，非门禁断言）

## 战役 Q：Web→cheng GUI 原生 computer use（文字/语音控制）（2026-09-03 规划，Q0-Q4a 已完成）

进度：Q0 基线(05af823e…) ✓ | Q1 CLB4 ✓ | Q2 控件表 ABI ✓ | Q3 语义动作通道 ✓ | Q4a 结构化指令 ✓ | Q4b LLM 在环 ✓（本机 ollama qwen2.5:1.5b, temperature 0） | Q6 CSG 合流 ✓ | 门禁 9/9+42/42 全绿
挂账：Q5 语音前端（SFSpeechRecognizer 需真机麦克风验证）
环境依赖：Q4b 门禁需 `ollama serve`（本机已装 brew ollama 0.18.2；模型 qwen2.5:0.5b/1.5b 已拉取；端点不可达时 planner 断言如实 SKIP 不假绿）。inference 线存量所有权红与本战役无关已实证（stash），清偿归 inference 战役。

回答核心问题：**不需要逐界面预学操作路径**。控件语义来自 Web DOM 标准属性（role/aria/label/type），语义求解链一次建成即对所有 Web 项目通用；多步模糊指令由 LLM 运行时读控件树现场规划。路线定为：渲染在 cheng、动作回注 WKWebView 真实 DOM——JS 运行时语义不可静态编译，"纯离线 cheng GUI 自承载交互"路线排除。

架构地图（现状→缺口，探索定谳 2026-09-03）：
- 捕获 `support/libp2p_browser_snapshot.js`（正源，经 `support/embed_snapshot_js.py` 生成 cheng 副本 `src/apps/libp2p_browser/snapshot_script.cheng`）：已有 kind 分类（input=1/textarea=2/a=3/button=4/media=5/select=6，role=button/onclick 升格）、href/type/value/options、aria-haspopup/controls/option 收割 → **缺稳定数字 captureId、accessible name 求解链、disabled/readonly/checked、全 input type**
- 编译 `src/apps/libp2p_browser/page_snapshot.cheng`：`SnapBindWidgetDocument` 已给交互盒 nodeId/fieldId → **缺统一身份体系与控件表整体导出**；纯视觉盒编译后身份丢失（可接受，computer use 只操作交互控件）
- 反向通道 `support/libp2p_browser_host.m`：已有坐标 replay（右栏点击→合成 mousedown/click 同坐标、键盘 replay、select 值写回）→ **缺按 captureId 的语义动作（按 id 查元素 el.click()/dispatchEvent，非坐标合成）**
- CSG `src/core/ir/csg_web_facts.cheng`：已有 VoiceComputerUseScenario/ComputerUseAction/VoiceTaskTemplate/VoiceTaskStep schema + `src/core/runtime/web_scene_computer_use.cheng` typed 动作准入（Click/SetText/SetNumber/Select/Toggle，effectClass=external-publish/payment 确认门）→ **与双栏快照线零接线**（快照线走 CLB，不走 CSG）
- 指令规划层：不存在。ASR：不存在（语音=ASR 前置转文字，同构后置）

阶段拆分（每阶段独立 verify；全阶段红线：8/8 桌面门禁 + 5/5 引擎门禁 + 对拍指标不得回退）：

**Q0 基线冻结** — 跑 `tools/libp2p_browser_desktop_gate.sh`（8/8）与 `tools/libp2p_browser_gate.sh`（5/5），记录 driver_sha256 基线。

**Q1 捕获端语义完备化（CLB3→CLB4）**
- files: `support/libp2p_browser_snapshot.js`、`support/embed_snapshot_js.py`、`src/apps/libp2p_browser/snapshot_script.cheng`
- action: 交互盒分配单调 captureId；accessible name 求解链 aria-label > aria-labelledby 解析 > label[for]/包裹 label > placeholder > title > 聚合文本；补 aria-role/disabled/readonly/checked/全 input type；CLB4 以追加行扩展，parser 容忍未知行（沿 FONT| 尾行先例）
- verify: 全控件类型夹具页断言 captureId 唯一、name 链逐例正确；5/5 绿
- done: CLB4 快照含全交互语义

**Q2 编译端控件表**
- files: `src/apps/libp2p_browser/page_snapshot.cheng`、`src/apps/libp2p_browser/host_abi.cheng`
- action: `BrowserCompileSnapshot` 产出控件表 captureId→{kind,role,name,box,value,options,enabled,actions}；`SnapBindWidgetDocument` nodeId 与 captureId 统一为单一身份；控件表经 ABI 导出（`cheng_libp2p_browser_control_*`）
- verify: 控件表与 CLB4 交互盒一一对应 smoke
- done: 控件表 ABI 稳定，5/5 绿

**Q3 语义动作通道**
- files: `support/libp2p_browser_host.m`、`src/apps/libp2p_browser/session.cheng`、复用 `src/core/runtime/web_scene_computer_use.cheng` 准入
- action: 按 captureId 查元素执行 Click（el.click()）/SetText（native setter + input/change）/SetNumber/Select/Toggle；typed 准入 + effectClass 确认门接线；坐标 replay 保留为人类手动通道不删；控件不存在/动作不支持 hard-fail，禁止静默降级为坐标合成
- verify: EVENT_SCRIPT 钩子逐动作断言 DOM 状态变化；桌面门禁扩语义动作探针（8/8→N/N）
- done: 语义动作门禁绿

**Q4a 结构化指令（确定性，无 LLM）** — 文字指令解析为（动词, 目标名）→ 控件表按 accessible name 精确检索 → 单动作执行 → 重抓快照回读状态。覆盖"点击登录""在用户名输入 X""选择 Y"类直接指令。
**Q4b 多步规划（LLM）** — 控件树序列化为结构化清单喂真实模型（接本机 inference 线或 API，严禁 Mock），LLM 出 typed 动作序列 → Q3 执行 → 回读 → 循环至完成或 hard-fail；external-publish/payment 用户在环确认。
- files: `support/libp2p_browser_host.m`（指令输入）、新 `src/apps/libp2p_browser/computer_use_session.cheng`
- verify: 夹具端到端指令集（单步+多步勾选提交类）成功率断言
- done: 文字指令端到端绿——此时"任意 Web 项目转 cheng GUI 即具备文字控制"成立

**Q5 语音前端（可选后置）** — macOS SFSpeechRecognizer 本机 ASR → 文字指令，同构接入；VoiceTaskTemplate 作为常用任务宏快捷方式，非必需路径。
**Q6 CSG 合流（战略）** — 双栏控件表导出为 CsgWebControlSurfaceFact 与 csg_web_facts schema 对齐，快照线与 ts-csg 热换线合流，兑现"通过 CSG 转成 cheng GUI"的完整叙事。

红线：语义通道是 computer use 唯一路径，坐标合成仅限人类手动通道；确认门不可绕；LLM 接入前 Q4a 必须独立成绿，不冒充自由指令能力。

---

## 战役 L：纯 Cheng libp2p 浏览器（桌面+安卓）

左边常规浏览器（WKWebView / Android WebView）。只有 `load complete` 才打开右边：HTML→DOM→CSS→layout→paint op，1:1 元素/样式/事件，GPU 上屏，并统计 parse/style/layout/paint 时间。右边输入框和跳转经 `/cheng/libp2p-browser/sync/1.0.0` 发到已连接的指定手机节点。

- files: `src/apps/libp2p_browser/*`、`src/tests/libp2p_browser_*`、`support/libp2p_browser_host.m`、`platform/android/ChengLibp2pBrowser/`、`tools/libp2p_browser_gate.sh`
- action: 解析/编译/会话/协议纯 Cheng 实现；桌面宿主 WKWebView；安卓 WebView+GLES
- verify: `bash tools/libp2p_browser_gate.sh`
- done: `bash tools/libp2p_browser_gate.sh` 4/4 PASS（html_parse / sync_protocol / compile_render / session），driver_sha256=`05af823e7db0c8ea1a69cbd01eda84fcd4b8ff8049d38178663fd357d840f276`

---

## 战役 P：Cheng OS 护照能力核（2026-08-30）

权威：`docs/cheng-os-passport-product.md`。评估板 FOLOTOY AI Passport；产品是可穿戴 Cheng OS 节点，不是官方玩法皮肤。

```
[本轮] P0 合同 ✓  |  P1 能力核 + 主机数值门  |  P2 computer use syscall + gate
[其后] P3 对等点 SABI  |  P4 C3 riscv32imc 出码  |  P5 Web Serial 整包换核 + 15 秒实拍
```

本轮 files/action/verify/done：
- files: `docs/cheng-os-passport-product.md`、`src/cheng_os/passport/*`、`src/tests/cheng_os_passport_*.cheng`、`tools/cheng_os_passport_gate.sh`；禁改 mosaico 信封源、禁碰 op-lane
- action: CHNG v2 信封 + 能力表 + `Idle→ReceiptShown` 核 + Admit 确认门必须经键/NFC
- verify: `tools/cheng_os_passport_gate.sh` PASS（wire/caps/kernel/computer_use，禁冷缓存，打印 driver_sha256）
- done: `tools/cheng_os_passport_gate.sh` PASS（4/4，driver_sha256=`f3719185c86e73bf03adab9c49193a1062ecf30ba763ff4931bf54e6602cfb4b`）。真机换核未做，不宣称可闪镜像。

---

## 战役 K：纯 Cheng 最小内核（2026-08-27 本轮）

权威：`docs/cheng-minimal-kernel-plan.md`。全案约 44%，本轮不假装一次做完 Step3 自举。

```
[已完成] Step0 归属冻结 ✓  |  Step1 结构 B0–B7 ✓（verify 未过）
         Step2 组装 kernel-only+三组合 ✓
[本轮目标] 第十二墙 Form-B 收口 → v15/v16 编过 ordinary_zero_exit
           → kernel_manifest_smoke aarch64 本机编+跑绿
[其后]    墙链继续 / Step1 补验 / Step3 纯自举（C 冷链退出编译路径）
```

本轮 files/action/verify/done：
- files: `src/core/lang/typed_expr.cheng`（Form-B 头已在树）、`src/core/backend/macho_provider_linker.cheng`（TLS 白名单已在树）；禁碰 lowering_plan / cold_parser / 整文件 revert
- action: v15 驱动验 wall12 探针 m1/m2 绿、m3 仍拒；再编 ordinary_zero_exit 串/并行；绿则 kernel_manifest_smoke aarch64
- verify: m1/m2 compile+run rc=0；m3 rc≠0；fixture serial/par rc=0 且 run=0
- done: `tools/kernel_manifest_smoke.sh --driver <v15|v16>` aarch64 PASS（交叉腿允许 SKIP_NON_NATIVE）

阻塞：v16=`9d4c8d9e…` 1GiB 下 wall12 m1/m2 run=3/7、m3 拒、ordinary_zero serial×2+JOBS=8 绿。`kernel_manifest_smoke --driver v16` 编组合插件驱动 aarch64 仍 `rss_bytes≈1.09GiB` 杀。未提限。未宣称 Step2 完成。

---

## 战役 C：UniMaker PWA React.js 语义图 → CSG → 纯 Cheng GUI 全面推进（2026-08-27 凌晨窗口）


状态收束（08:2x）：编译链解锁✓(7e187442f)、S 拆分✓(r6 回执 cmp=0/gitdiff=0, 1f1e0f9b4)、M 补丁位移✓根因转 transpile 形挂账(eedfc1414+M-report§六)、glyph 理论极限代码✓+像素逐字节等价✓但 import 自伤已修(e474150f5) 待 r9 全链字节验收；H 探针✓(f7a88ae28 已含运行期泵, 33 断言)。V live 与 media main 编译墙（datapath 定长数组投影）留档内核线。

用户目标：子代理并行工作流全面推进 PWA React.js 语义图经 CSG 1:1 转译成纯 Cheng GUI（全部元素、样式、事件），完成视频秒发秒开/节点界面实时数据/节点社交/游戏/发布内容核心功能。

```text
[材料器域 M] CHT invoke-sites 清零 + publish 条件 guard + 游戏 handler 覆盖   (ts-csg/src/*)
[拆分域 S]   巨型生成源 splitGeneratedChengSource 落地                        (ts-csg/scripts/unimaker-one-click.mjs + scene-runtime-smoke-source.mjs)
[视频域 V]   秒发秒开 S3 per-slot 连接池 + S4 EOS 完整播放                    (src/core/runtime/web_scene_media*, src/tests/media_*)
[宿主桥域 H] 节点实时数据：运行期 feed 订阅→cheng_app_distributed_contents_update_utf8 (宿主侧)
      |
      v
[收口-主线程串行] 合并亲验 → retained one-click 重产 → output smoke → parity gate [2/4]/[3/4] 判决
```

文件互斥红线：M≠S 文件集；V 不碰 ts-csg；H 宿主侧+FFI 只加不改；全量 one-click/gate 仅主线程串行跑（唯一例外 S 的 materialize-only 单次）。
任务书与回执：cheng-patches/unimaker-campaign-20260827/。权威挂账：src/.gen/r16-probe2/A-LINE-HANDOFF.md。

---

## 战役 B：DiLoCo 去中心化训练 + 推理（propose，待确认）

日期: 2026-08-23
状态: D1–D7 缩小竖切已跑通；D8 双机内步+外步 delta 已在 sg/dosg 跑通；QUIC 因 CPU 无 sha_ni（sha256rnds2 SIGILL）未跑
权威: `openspec/proposals/cheng-diloco-decentralized-train-infer.md`

`tools/diloco_train_infer_loop_smoke.sh` 绿：真字节工件、本地 SGD 内步、按 tokenCount 加权外合并、合并版本 held-out MSE 下降。`PublishMergeCommit` 的 modelRef 由 outer_merge 从 delta 字节算出，禁止 stub。

`tools/diloco_qwen38_tiny_train_smoke.sh` 绿：生产 64 层 interval-4 计划钉死，mini 前向走前 4 槽（3 GDN + 1 full，GDN 冻结无反传），DiLoCo blob 是 i32 lm_head；两 worker 外合并后 held-out softmax NLL 下降（nll0=6931472 → nll1=6184637 micros），held-out argmax 分别为 target 7/21。

`tools/diloco_train_settle_smoke.sh` 绿：同一 Qwen3.8 tiny 闭环的 NLL 进入 `DepinDiLoCoTrainEvalNllHash`；token/versionCid/schema/NLL 漂移 Validate 硬错；NLL/versionCid/outerStep 变化必改 recordHash。不是链上打款。

`tools/diloco_expert_route_smoke.sh` 绿：每专家一个 DiLoCo job；L0 hidden 本地；路由只发 token 块；专家 0 主副本停机切到副本 versionCid（replicaIndex=1）；专家 1 无副本 hard-fail；hidden layer WAN 入口硬错。

`tools/diloco_wan_two_host_gate.sh` 绿：sg=186.244.238.116 跑 inner-A，dosg=165.245.176.65 跑 inner-B，外步才 scp delta pack，sg 上 token 加权合并与重放逐字节一致。RTT dosg→sg = 9.742ms。两机 `/proc/cpuinfo` 无 sha_ni，Cheng artifact CID/QUIC TLS 的 `sha256rnds2` SIGILL，QUIC 路径未跑。

```
D1 artifact 真字节 → D2 内步 SGD/AdamW → D3 token 加权外合并
      → D4 缩小 Qwen3.8 图 → D5 versionCid 推理
      → D6 DePIN 结算收据 → D7 专家驻留 → D8 真双机（C 类）
```

禁止：公网切注意力头；stub CID 冒充权重；用 outer_step++ 当训成。

---

# 战役 A：Qwen3.8 推理栈接入 — MTP + DFlash2 全面推进

日期: 2026-08-22
状态: 执行中（4 条文件集互斥战线并行）


## 全局流程图

```
[已完成评估] DFlash2 > 原生MTP(高并发崩塌) > AR
     |
     v
+---------------------+   +----------------------+   +----------------------+   +---------------------------+
| W1 qwen38-graph     |   | W2 gdn-kernel        |   | W3 dflash2-draft     |   | W4 spec-gate 泛化          |
| config/profile/     |   | gated delta net      |   | 块扩散草稿数据结构    |   | 门控去 GLM52 硬编码        |
| ModelGraph 构建     |   | CPU 参考实现+对拍    |   | top-K 选择器+卷积    |   | + dflash2 算法枚举占位     |
| (新文件)            |   | (新文件)             |   | (新文件)             |   | (distributed_engine 独占) |
+----------+----------+   +----------+-----------+   +----------+-----------+   +------------+--------------+
           |                         |                          |                            |
           +-------------------------+------------+-------------+----------------------------+
                                                  |
                                                  v
                                     [集成收口线 - 主线程串行]
                                      model_graph 常量注册 / executor 对齐 /
                                      全量 smoke 绿 / DiLoCo 分布式闭环
```

## 战线

### W1 hf_qwen38_graph（新文件集）
- files: src/inference/hf_qwen38_graph.cheng, src/tests/hf_qwen38_config_smoke.cheng, tools/hf_qwen38_config_smoke.sh
- action: 解析真实 qwen3_5 config.json -> HfQwen38DeployProfile; 构建 architecture="hf_qwen38_hybrid_mtp" 的 ModelGraph
- verify: smoke 编译运行绿, 断言逐字段对表
- done: tools/hf_qwen38_config_smoke.sh 通过

### W2 gated_delta_net kernel（新文件集）
- files: src/inference/gated_delta_net.cheng, src/tests/gated_delta_net_smoke.cheng, tools/gated_delta_net_smoke.sh
- action: GDN chunked 前向 CPU 参考实现; 朴素递推 vs 分块并行双实现对拍; SoA/int32 身份
- verify: 双实现对拍 hash 一致 + 形状门
- done: tools/gated_delta_net_smoke.sh 通过

### W3 dflash2_draft（新文件集）
- files: src/inference/dflash2_draft.cheng, src/tests/dflash2_draft_selector_smoke.cheng, tools/dflash2_draft_smoke.sh
- action: 两抽头动态深度卷积; top-K 候选 SoA; 相邻对双线性打分 S=U(b)+<A(a)⊙H(h),B(b)>; 贪心/拒绝采样路径 walk
- verify: 合成 fixture 上路径连贯性/单调性/无损接口断言
- done: tools/dflash2_draft_smoke.sh 通过

### W4 spec gate 泛化（distributed_engine.cheng 独占）
- files: src/inference/distributed_engine.cheng (仅 spec decode 门控区段)
- action: 抽参数化 DistributedRequireArchitectureMtpSpecDecodeExecution; GLM-5.2 原函数薄包装零行为变化; DistributedSpecDecodeAlgorithmDflash2 常量
- verify: 既有 distributed_inference_engine_smoke 全绿
- done: 重构后行为等价

### 集成收口（主线程）
- model_graph.cheng 注册新架构常量+校验分支; W1-W3 对齐; 全量回归
- 依赖: W1-W4 完成

## 硬约束（所有战线）
1. 生产代码严禁 Mock; 错误走 Result[T] 硬失败, 禁兜底
2. DOD + Arena + SoA; 跨节点身份 int32 索引; 禁对象裸指针
3. 以 docs/cheng-formal-spec.md 为准; 合法语法只修不绕
4. 编译验证: artifacts/bootstrap/cheng.stage3 system-link-exec --target:arm64-apple-darwin

## 并行任务：纯 Cheng RISC-V 自举出码（执行中）

```text
TypedExpr lhs/value-def ownership
  -> immutable CallOp managed-replace receipt
  -> BodyIR managed sidecar + exact address-definition row
  -> PhaseArena/FlatSoA exact projection and relational validation
  -> primary/backend2 real managed store
  -> shipped riscv64_encode.cheng reachable consumption
  -> ELF64 RV64 + ELF32 RV32IMAC+F
  -> two-process byte equality + crash concurrency + cross-platform release
```

| files | action | verify | done |
|---|---|---|---|
| `bootstrap/cold_parser.c`、`bootstrap/cheng_cold.c`、fixed-array gate | inline aggregate→托管定长数组字段→动态下标替换，发布真实 replace mutation row 与聚合 MEMORY_VERSION；冻结期用 declaration/extent/carrier/TypeId 四列重算存储权威 | exact-1GiB 编译+运行、ORC 平衡、O0/O2 静态门、28 项关系突变 | 当前夹具 compile/run rc=0，alloc/free=6/6、live=0、retain/release=3/9；static 与 28 mutations rc=0。只证明该所有权原子，不计 RISC 出码完成 |
| `typed_expr.cheng`、frag codec、CompilerCSG、`lowering_plan.cheng` | FuncRef 从本地函数查询直接发布 `CallDeclaration` 域+精确 int32 行；两列贯穿 Arena/SoA、clone/move/release、codec/CID，并按 producer source/declaration/function row 精确 join TypedFunction | clone/move/release、codec/CID、跨列 mutation；focused exact-1GiB 编译 | 静态门 rc=0、11 mutations rc=0；三处冗余默认初始化首红已按规范消除，旧 `./cheng` 深入后 actual=143/peak=1,075,135,760B，不能作为当前源码性能固定点；current backend driver 的决定性首红仍是跨线程 ledger rc=70；primary/backend2 最终符号消费仍未接 |
| `lowering_plan.cheng`、linear gate | 删除 11 个 clone-all append，改为真实几何增长/批量追加；participant/result SoA 与 `functionNameIds` 纳入精确 allocator owner | N=4096 复制量从 `n(n-1)/2` 降为 O(n)；10+2 并行列物理释放并闭合 receipt；allocator census 回到既有基线 | 已落地：15 overload/10 ledger overload、217 call sites、clone-all=0；exact-1GiB compile/run rc=0，原 8,386,560 次 prior-element copy 消失。formal self-test rc=0、343 mutations 全拒、census=`41/0/0`；动态 participant 合约另见下行 |
| terminal journal/provider/runtime | `std/os` AtomicTreeOwner→merkle root/fence→capsule→journal→guardian 的无环 int32 capability DAG；统一 CLAIMED/FINISHED/DECISION/EXIT/REAP/PROVIDER fixed-binary v3 durable bytes；各模块消费 owner 后串联 close receipt | append 前/后崩溃、重复投影、完整 record 重签篡改、stale/replay/ABA/double-close、双 guardian recovery、pidfd/kqueue 跨平台事件 | 正式 guardian gate rc=97 且目标 journal 模块缺失。进一步确认 held-output `{slot,generation,owner}` 只能进程内整文件 Publish，durable no-replace/exit-event 又只由 `merkle_store` 私有 AtomicTree root owner持有，两者无 typed import 边；按 path/fd重开会假绿。正在先给 `std/os` 建不泄漏对象/路径的 int32 AtomicTreeOwner 基础原子，再由现有 root owner move exact object/report pair；禁止 forwarder/双 authority |
| primary/backend2 output identity | typed function index→original/export InternId→owned UTF-8 role projection；call/data/funcaddr 的 domain/row/interface CID 贯穿 relocation SoA→symbolRow；UTF-8 只作 payload；两后端共用最终 strict validator | 任意 UTF-8 导出、同文本不同 producer、stale row、slash/dot/dash/underscore、普通 `main` InternId 在两后端/两目标/两轮验收；构建 O(S+R) | 上游 InternId→owned UTF-8 投影已存在且 focused 门绿；首个丢身份点是 primary/backend2 验证 domain/row/CID 后只发布 relocation `str`，direct emitter 再用文本 O(RS) Add/Find 并保留 `"main"` 合成。必须让 plan/CSGC/native replay/direct emitter 直接消费 int32 symbolRow；仅改 object_symbols 文本哈希会违反身份红线，未实施 |
| shared RISC encoder event receipt | 每个最终指令由 shipped `riscv64_encode.cheng` typed call 产生 7 列 SoA event；event row 由数组下标精确给出，root 绑定工具链构建期 source row/authority CID、xlen、操作数、结果、物理容量；冻结 CSR range 贯穿 action→fragment→plan→artifact→receipt | exact replay；字段/range/重叠/缺行/重复行/site mutation；transient permutation 终局零容量；工具链 source cargo/receipt/compiler hash 漂移；non-RISC canonical empty；exact-1GiB compile/run | event/build projection 与两后端 authority 接线已过 focused 合约；emission payload 改为 `recipes` 唯一 owner，顶层只发 int32 range/count。action 已由六类 canonical CSR 从 O(A×sites) 收敛为 O(A+sites)；CFG emission-order、block-edge、fixup-edge 又由 position→block + edge owner CSR + exact edge row 收敛为 O(P+B+E+F)。23-word fixture bytes/event roots 均保持，7+10 mutations 全拒，两个 focused exact-1GiB 门 rc=0。current-source 仍受 ObjectDef field-shape/value-definition 首红约束，不计正式出码 |
| `tools/riscv_esp32s31_isa_gate.sh` | 只允许 canonical selfhost compiler+official build receipt；四组合两轮出码、ELF/ISA/flags/symbol/provenance/对象 digest 对拍 | argv/env override 必拒；receipt/encoder/evidence mutations；正式源码冻结后 exact-1GiB 全跑 | 当前 rc=1 精确停在 `official_build_receipt_missing`；旧 official driver sha=`e64c01baf2582151b9ec4e3cedfb869f0d888e0dc946a0a0dd1af4f80c497857` 不被接受。receipt/encoder/evidence authority 已在 gate 内绑定，须等源码冻结、纯 Cheng compiler 固定点与 v2 receipt 正式发布后才能启动四组合验收 |
| guard 数值 FD authority、`held_output_fd.cheng`、held object runtime | guard 唯一解析 `--out-fd:N/--report-fd:N` 并与继承 FD 精确绑定；Cheng 侧从 CSGC replay 直接发布 bytes | exact-1GiB 数值 authority；FD/OS 负例；lease move 清源、copy/replay/stale-generation/double-publish/失败 retire；runtime ledger Close | held-FD capability 原子已根线程独立转绿：静态 15 文件、20 mutations、精确1GiB动态正例、真实 ledger 零 live、9 负例均 rc=0 门禁；正式 compiler CLI 仍受 snapshot/worker-domain 首红约束，不计出码 |
| compiler snapshot Merkle store | 完整 snapshot cargo 作为不可变 artifact；可变 HEAD 只替换一个绑定 cargo/facts-root/proof-root 的 envelope fact；function/statement/span 用 int32 capability 双射 | 任意源码变化仍恰好一个 Replace；多操作 transaction 继续硬拒；canonical span/statement root mutations；崩溃前后 HEAD/receipt/cargo 逐字节一致 | statement root 与 canonical span 已根修，static rc=0、7+1 mutations 绿。full 红并非 sret：`PrimaryBodyIrAppendI32Assign` 丢弃 `assignLvalueNodeIndex`，按文本重解析 indexed LHS，导致分支赋值后的 exact value-def/字段身份丢失。修复必须新增 immutable `localBindingValueDefinitionRows` SoA 并贯穿 primary/backend2/codec/validator；禁止业务 hoist |
| lowering parallel worker-domain | main active ledger mint 唯一 int32 worker owner，`StartFn(fn())` 从同一 owner slot 精确预留 row 并以 TLS 绑定 worker ordinal；Claim/Publish 原子搬移 DOD/SoA boundary/result root 并清源，join 后唯一 Consume；participant 10 列与 result identity 2 列各自唯一 owner | duplicate/replay/stale owner、漏迁列、源未清、worker realloc、cross-row、返回未 Publish、join 双消费、裸 setLen/add、漏 physical release/receipt/token mutations；exact-1GiB current compiler | participant 合约 rc=0：正例 actual=0、escape=0、peak=53,116,928B、live 全零；7 动态负例 actual=70；33 static mutations 全拒；lowering smoke rc=0。current compiler artifact-bound 复跑进行中，正式 CLI 尚未宣告完成 |
| direct-object data materializer | 先按 raw-count/文本 payload/对齐做 checked O(N) 计数，再以单调 `rawOffset` 一次物化；两个消费者共用同一 builder | 交错 raw/zero/hex exact bytes；截断 raw shape hard-fail；静态拒绝 prefix nested loop/初始固定64容量；exact-1GiB | 已消除每个 raw payload 重扫全部前缀的 O(L²)；focused gate 正例 rc=0/负例 panic rc=1，源码 sha=`04b7410d5d632e0a0b0016600baea429880e942e261a94fe2af138a4e8d1ac4e`。既有 CSG cargo 回归 rc=3 首红为数据物化前的 `symbol identity shape incomplete`，不冒充集成绿 |
| primary branch-reloc coverage | 流式函数按本函数新增 reloc ranges 建 bool coverage；终局一次建 `wordIndex→itemId` int32 owner SoA；删除逐 word 全表查询 | call/data shape、wrong item、cross-owner duplicate、overflow/start 越界 mutations；既有 offset/target 语义不变；exact-1GiB | O(W(R+D))→O(W+R+D) focused 已落地，compile/run rc=0，5 mutations 全拒；当前源码快照 sha=`2bd138073eb74a831fed9ef3a85bfe8e0e0ed52bbaa86b20fbf65841a43b060e`。完整 current compiler flow 仍受更早首红阻断，不计正式集成绿 |
| native object relocation validation | 以 text/debug section byte row 为 dense 域，用 transient int32 bitset 检查 relocation offset 唯一性；符号 identity 线独立保持硬红 | 31-bit bucket 边界/重置/重复 offset；4096 reloc；既有 RV64/RV32 writer contract；exact-1GiB | relocation 与 debug relocation duplicate scan 从 O(R²+D²) 收敛为 O(T/31+R+D)，focused 与既有 writer contract compile/run 均 rc=0；源码 sha=`40b39eff2c9ffa4d9c09e41f9e01a9b6bebee42292d2baf2147309c29bbec8b2`。symbol name O(S²) 不在此处用文本哈希绕过 |
| object symbol exact UTF-8 index | `ObjectSymbol` row 保持唯一身份；`ObjectSymbolTable` 增加逐字节 SoA trie 作为派生 lookup index，direct emitter 缺行直接 crash，禁止 `cheng_synthetic_*` 兜底 | 4096 长公共前缀 UTF-8 符号正反向 lookup；root/terminal/duplicate-edge mutation；RV64/RV32 relocation writer 与 intern lookup 回归；exact-1GiB | Add/Find 从 O(S²+RS) 的全表文本扫描收敛为 O(UTF-8 总字节+R×目标字节)，无哈希碰撞身份；focused compile/run rc=0、3 mutations actual=1、writer/intern 两门 rc=0。仍未替代 relocation SoA 的 exact int32 symbolRow 贯穿，不能计最终身份闭合 |
| official v2 publish chain | official pair fail-fast 后，共用 exact guard validator；从冻结 CompilerCSG 语义解析 encoder producer projection，并把 projection receipt CID join 到每次 runtime encoder receipt；pure producer 成为正式必需节点 | orphan driver/receipt、Darwin guard 字段、wrong module/producer/canonical/content row、断开的 pure producer mutation；源码冻结后再烤 GEN2/GEN3 | 当前 preflight rc=97：driver `e64c01…` 存在而 v2 receipt 缺失，必须经用户授权归档孤立 official 后才能继续。语义审计又确认 production 尚未调用 build projection constructor，正式 receipt 未保存 cargo bytes/path，也未发布 `riscv_encoder_receipt_cid`；candidate 会先红于 projection schema 缺失。正在从 live lowering authority 接生产发行，缺真实 immutable 字段 hard-fail；不改字符串放宽、不启动正式 bake |

当前唯一可计的 CSG mutation 标准是：合法 record → 分别改 16/48/176/208/216 → 清 232 → `RecordFinalize` → 从公开 Commit 入口动态调用。静态源码锚点变异和私有 wrapper 拒绝均不计 capability 闭合。

### 本轮身份/持久化收敛更新

| files | action | verify | done |
|---|---|---|---|
| `core_types.cheng`、BodyIR lifecycle、backend2 frag codec | 给 local slot/global/function address 与 cstring literal 发布独立 immutable domain/row/CID SoA，禁止从 label/name 反查 | shape/CID/codec old-magic rejection、clone/release、exact-1GiB focused gate | schema/codec/lifecycle 已落地；compile/positive rc=`0/0`，17 进程负例与 5 个 primary 线级突变全拒，byte round-trip。生产 producer 尚未绑定，不计最终 symbol projection |
| `primary_object_plan.cheng`、backend2 assemble | 把 recipe 已有 call target domain/row/interface CID 原样贯穿 phase state→plan；typed function symbol另存 interface CID | snapshot/rollback/hash/strict validator/lifecycle/owner-token、mutation、exact-1GiB | primary focused 门在当前 sha=`de5dcbc5…` 上 compile/run rc=`0/0`；synthetic entry bridge/runtime intrinsic 仍因缺 exact authority hard-red，禁止文本哈希赋权 |
| `object_symbols.cheng` | UTF-8 byte trie 入口增加严格标量验证并拒绝 ELF 不可表示的内嵌 NUL | 4096 任意 UTF-8 名；3 个 trie 结构 mutation；过长/代理区/越界/截断/孤续/NUL 共 6 负例 | exact-1GiB compile/run rc=0，stderr=0；module sha=`06f902af81c2c4c1432025f5b140ec3eef719b3aac73a41fb79e6ab58521b26f` |
| `std/os.cheng` AtomicTreeOwner | `atomic.FetchAddI32` 单调发行不可复用 row，容量越界永久关闭 registry；4 线程各自 issue→append→terminal→close | stale token、terminal reopen、double-close、row uniqueness；exact-1GiB | compile/run rc=0、escape=0、peak=`152567808/7274496`B；os sha=`a982ce9218907d066ebabf79a3c9ee572509340f4720a423ec6af32babf7556a`。只完成 Phase A，不等于 terminal journal 已接线 |
| encoder projection held validator | receipt 先导出 canonical cargo path，再做 absolute/realpath/O_NOFOLLOW stable-read 与独立进程复验 | 7 个独立 mutation 进程、missing-env、candidate contract | focused/candidate rc=0；official 动态因共享源码漂移为红且停止重跑，未 producer/安装/bake |
| terminal journal schema cutover | 原子统一 V2 六阶段 record、merkle writer/recovery/provider 与 program-support signer，删除 V1 双 authority | 同一字节逐阶段 decode、完整重签 mutation、crash recovery、exact-1GiB guardian | 只读审计证明当前同一 512B CLAIMED record 被 V1/V2 互斥布局同时解码，guardian rc=97；未写入、未给动态信用，下一步必须整链原子迁移 |
| `provider_export_identity_receipt.cheng` 与 focused gates | provider 行绑定 CompilerCSG artifact/compile receipt/object bytes CID；export Arena/SoA 发布 int32 producer rows、fact/interface CID、有限 role 与 UTF-8 payload；显式 Move/Release | 622B wire round-trip、26 mutations、live-output/self-move/double-release/moved-source、exact-1GiB | 根线程 gate rc=0；正例 compile/run=`0/0`，self-move compile actual=2，double-release/moved-source=`1/1`；module sha=`dd58b4ba5554e59006cac64d98ca3faa1bf6a112088eced90f09ed80cb9ee2b6`。仅完成独立 receipt 原子，子进程签发与父计划严格 join 尚未接，不计 synthetic bridge/正式出码 |
| provider parent import + synthetic function authority | 父侧按 int32 providerRow 对拍 child receipt 与实际 artifact/compile/object CID，发行有限三角色投影；synthetic 只消费 imported receipt并把 child/actual/import CID、source-entry、target/ABI、四 call rows 封入 function CID | O(P+E) join、角色唯一完整、22+18 mutations、Move/Release/double/moved、exact-1GiB | 两个 focused gate 根线程各两次 rc=0；import receipt CID=`64ed1e4f…`，synthetic authority CID=`8cb3dc82…`，源码 sha=`248a90c8…/340be40a…`。尚未接 provider 子进程签发和 primary/backend2 production plan，不计正式 bridge/出码 |
| provider child identity publication | child 持有已验证 CompilerCSG 时冻结 canonicalGraphCid 与 entry/runtime-init/runtime-cleanup 三角色精确 int32/CID 列；与 compile receipt CID、held-fd object CID 一起写入 finished canonical，父侧严格 Move/Decode | 缺列 hard-fail；finished record/CID/role/row mutation；跨进程 actual-CID join；exact-1GiB | 当前生产仅有 compile receipt 与 fd 实测 object digest，CompilerCSG artifact CID 和三角色精确列未跨 child completion。按红线零写入；禁止从 `exportRootsText`、surface CID、名字或 hash 反推，signer 尚不可实现 |
| pure selfhost RISC first-red | Return 只构造一次 value DAG，并从真实 CallExpr ArgLink 投影 statement metadata；下一步给两个 `GlobalDef` 镜像增加 immutable exact-TypeId/storage/authority 列，在 body parse 前单次 freeze，所有 path-local GLOBAL_ADDR 与 phi remat 只按 int32 GlobalDef row复制并向冻结 tuple 对拍；禁止 join 放宽、按 mutable Symbols 重算或源码 hoist | focused exact-1GiB 行为门；candidate actual rc/peak/escape/stderr/report/object与全部输入完整哈希；未冻结/二次 refine/OBJECT↔PLAIN mutation | Return 单一 owner focused compile/run actual=`0/0`；harness argv/FD/ABORT validator 已修。r268 formal seed actual=2、peak=`227606528`B、escape=0，精确红为同 global row 的两 GLOBAL_ADDR storage=`1/0`；producer receipt/candidate/map/report=0B，源码未冻结、未 bake |


## 战役 D：VPN 底层网络选网修复（2026-08-27，执行中）
用户目标：消灭宽带半死场景下的选网缺陷——Wi-Fi 关联成功但无外网时，selectUnderlyingNetwork 选中它导致 owner probe 失败/启动失败，而健康蜂窝被弃用。
方案：候选排序 validated 优先（NET_CAPABILITY_VALIDATED），无 validated 才回退首个可用网并打日志；拨号 socket 已由 AndroidNetworkBindFd 绑定所选 handle，选对即全链路对。
验收：真机 Wi-Fi(死宽带)+蜂窝并存 → 重装 → 单次开关 → logcat 选中 validated=蜂窝 → 连接成功 → baidu 渲染；回归：纯蜂窝、(A)(B) 弹跳不劣化。
