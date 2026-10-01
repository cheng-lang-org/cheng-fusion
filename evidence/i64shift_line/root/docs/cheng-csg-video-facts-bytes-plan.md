# CSG × 视频「事实图 ⊕ 字节」端到端方案（fact-first 发布 · 逐层 CSG 化 · 全链审计）

> 2026-08-30 立项正典。正文=当前真相与计划；实测推翻即改正文，禁尾部订正链。
> 上位文档：`docs/cheng-video-e2e-miaofa-miaokai-plan.md`（视频线本体：MoQ 逐帧流、秒发秒开门禁、真机验证）。本文不重复那条线，只定义它的**事实合同层**：把"发布/寻址/验收"从字节行为升级为 fact 行为。

## 0. 理论框架（定谳，不随实现漂移）

**任何内容 = facts（结构）⊕ bytes（熵）。** CSG 化不是二值判断，是逐层归位：

- 模板/动效/UI 类内容生下来几乎全是 facts → 分发载荷 KB 级，带宽账差 2~4 个数量级，首帧=加载即渲染；
- 实拍内容（信息熵在像素里，hgs=任素汐真人实拍、maitian=麦田实拍，海报帧已核）**不可程序化重建**——任何"把实拍片编译成程序"的口径都被信息论挡死，禁止写进任何材料；
- 实拍内容可被 facts **治理**：索引、传输合同、验收回执全部 fact 化。像素进不了 facts，但像素的出生、旅行、死亡全部可以活在 facts 里——这就是"把像素问题转化成 CSG 问题"的实义。

边界禁令：①不把逐内容编译塞进发布路径（渲染器=产品级预编译，内容包=数据封签）；②不对实拍宣称程序化带宽节省；③不上 360p-first 兜底（沿上位文档 §0 判例）。

## 1. 实测真相基线（2026-08-30）

| 主题 | 定谳 | 证据 |
|---|---|---|
| 索引已是雏形 fact index | `.moqidx` = 36B 头（MQES/format=2/宽高/fps/frameCount/esTotal/rotation）+ 12B/帧 {offset,size,flags(bit0=keyframe)}，Annex-B 解码序连续；接收端 GOP 寻址已用它 | `tools/gen_moq_es_index.mjs`；`src/tests/moqidx_oracle_dump_main.cheng` 独立重推布局 |
| 发布现状=整片 ingest | publish_total_ms 含全量 fountain ingest（真资产实测：麦田 310-415ms 达标、hgs 5.9MB 静载 993ms 达标、载态超门）→ **GB 级资产此路秒发物理不可能**（2GB/1s 需 16Gbps 上行） | 上位文档 §S1/§S7 门①台账 |
| 后端文件读缺口 | 自举后端 `system-link-exec --emit:exe` 下 os.ReadFile 链缺 call target（ZC_NOT_READY 21 处）；>3.8KB 字面量常量会使 backend_driver 编译期 SIGSEGV → pure main 内禁文件读、禁大字面量 | `moqidx_oracle_dump_main.cheng` 头注实测账 |
| sha256 独立可用 | `std/crypto/sha256`（`Sha256Digest`/`Sha256DigestTwo`/`Sha256DigestInto`），不拖 libp2p 闭包；fountain ingest 即用 | `src/std/crypto/sha256.cheng`、`src/moq/moq_fountain.cheng:363` |
| 回执纪律已有雏形 | bridge 四账（ConnDialed/ConnClose/Release/AdoptMove）+ EOS 三态 receipt——生产点直写、禁事后推断，即 fact 治理的第一批 fact | 上位文档 §S3/S4（2026-08-27 Lane V 席） |
| 模板内容制作端 | UniMaker=跨端应用制作器（CSG-Web facts→纯 Cheng runtime→pixel 金标 r37b 全绿）；"场景包当视频发布"的焊接件（内容包格式+封签）**未建** | `docs/cheng-native-gui-plan.md`；管线性能战役收官账 |
| 熵墙实核 | hgs_poster（真人演唱）、maitian_poster（麦田纹理）均为实拍；唯一可程序化层=hgs 标题字幕层（<1% 信息量） | 2026-08-30 本会话海报帧直读 |

## 2. 三条转化线

### T1 fact-first 发布：发布=封签事实图，不是传完字节
发布动作只封签 manifest（事实包：资产 CID + 帧图 + 关键帧表 + 首帧预算），字节由接收端按 facts 逐帧兑现。GB 级资产的"秒发"从物理不可能变成自然——发出去的是 Merkle 事实图，不是字节。发布时延由**索引大小**界定，与资产大小解耦。

### T2 pixel→fact extractor：从像素中提取可恢复结构
镜头切点、字幕层、贴片、音频节拍是可恢复结构 → facts。视频从"一块字节"变成"引用字节的图"：可查询、可复用、可编排；UniMaker 素材库从文件堆升级为事实图。第一事实=hgs 标题字幕层。

### T3 全链审计合同：验收表=manifest+receipts 的投影
ingest→demux→传输→解码→上屏每步 receipt 入 fact DAG（Patricia Merkle 局部验证语义与 csg_core 同源）。政企验收表自动生成、每行可验证——4.2 的"可审计验收"拿到格式合同背书。

## 3. 分阶段实施（每段独立验证门）

### S1 fact-first 封签模块（2026-08-30 本会话，已落地）
- 新模块 `src/core/runtime/web_scene_media_factfirst.cheng`：`.moqidx` → **CFFM v1 事实包**（magic/version/宽高/fps/frameCount/esTotal/rotation + esIndexCid[32B] + 关键帧表 {frameIndex,offset,size}×n + manifestCid[32B]）；API 纯 int/Bytes（对齐方言无 struct 风格）：Seal/Verify/FrameCount/EsTotal/KeyframeCount/KeyframeFrame/SnapToKeyframe/GopStartOffset/GopByteLen/FirstGopByteLen/ManifestLen。
- 接收端纯 facts 操作面：seek=查表（SnapToKeyframe）、首帧预算=FirstGopByteLen（起播前只需拉这些字节）、防篡改=CID 重算比对、封签确定性=同输入同字节。
- check `src/tests/media_csg_factfirst_check_main.cheng`（pure 无文件读）：两个合成索引（maitian 形 333f/60fps/kf@60、hgs 形 675f/30fps/kf@120）逐项断言 + 篡改负例（翻 flags 位→CID 必变、keyframeCount 必变）+ 确定性对拍。
- runner `src/tests/run_media_csg_factfirst_check.sh`：stage3 构建（providers.o 照 media_eos_pool_mutation_gate 配方）+ 运行门 + **真资产对拍**（python3 struct 独立解析真实 maitian.moqidx/hgs_stream.moqidx 的关键帧表，锚定合成形状与真实 fixture 一致，防自证绿）。
- **验证门**：runner ALL OK；合成形状 == 真资产 python3 对拍结果。
- **实测回执（2026-08-30 本会话）**：`run_media_csg_factfirst_check.sh` ALL OK——build（stage3 system-link-exec）✓、check_main（封签/验证/查表/确定性/篡改负例）✓、真资产 maitian/hgs 关键帧锚 ✓。源哈希绑定：模块 `f8a30d1d…fee5e63c`、check `f41e164a…1e5d442`、runner `4a8f401a…eaeab9c`。
- 配方注记：`--provider-objects` 吃逗号分隔多 .o 路径（`CompilerProviderObjectPathsFromText`）；`media_eos_pool_mutation_gate.sh` 里两个 .c 共一个 `-o` 的 cc 写法在 Apple clang 下必炸（`cannot specify -o when generating multiple output files`），该门复跑时需同款拆分。
- 诚实边界：pure main 无文件读（§1 后端缺口），S1 以内存合成索引驱动真实格式解析与封签逻辑；接真文件的发布端接线在 S2（publisher 侧读盘封签，走 publisher 既有构建/运行路径，不受 pure 缺口约束）。

### S2 fact-first 发布端接线（2026-08-30 本会话：**live 门禁全绿**，双进程真资产跑通）
- **落地代码**（源哈希绑定）：publisher `media_moq_publisher_main.cheng` 新增 `--fact-first` 模式（`mediaMoqPublisherFactFirstRun`：只读 `.moqidx` 封签 CFFM、ready 即发布完成、服务面 moq-announce/moq-factfirst/moq-esindex/moq-frame，sha256=`af6f6037…5aa610db`，含 §S2.5 fact_first 设备入口）；接收端 `src/tests/media_csg_factfirst_live_check_main.cheng`（**逐对象全生命周期重拨**=生产 bridge 形态，因服务端 accept 探测无第二流即收会话——`media_moq_range_fetch_main.cheng` 先例；manifest→Verify→纯 facts 查表→按 FirstGopByteLen 拉首 GOP→esindex 摘要字节级对拍→篡改负例，sha256=`debf4fa3…0dbd955`）；门禁 `src/tests/run_media_csg_factfirst_live_check.sh`（hgs+maitian 双资产双进程，sha256=`218e5e07…b4b6905`）。S1 模块未变（`f8a30d1d…fee5e63c`）。
- **实测回执（两轮 ALL OK，回执逐字节可重复）**：
  - hgs（5.9MB/675f）：`seal_ms=1 manifest_bytes=176 keyframes=6 first_gop_budget=1077887 first_gop_bytes=1077887 manifest_cid=bc7eaed1d2489b2b74b2cb99bc6ac730fa9f0570b3ebe3ef56e5638d4675d7da index_cid=8ac15332608e9b4d4fde0608e95ca1756ea488cbeb0822eb87d616bd8fc9af14`
  - maitian（1.8MB/333f）：`seal_ms=0/1 manifest_bytes=176 keyframes=6 first_gop_budget=310161 first_gop_bytes=310161 manifest_cid=e419dd05f8797a423325a25c5893d2d8acd725d51511900a2dd8c479ec198652 index_cid=137a100c6c026dab0a72984194ccc9ebe669c85e138713d262419ff62d7874fd`（== `moqidx_oracle_dump_main.cheng` 头注记载的该文件已知 sha256，独立第三方印证）
  - 门①发布动作=封签 0~1ms 且与资产大小解耦（5.9MB 与 1.8MB 同毫秒级，对比整片 ingest 旧路径 310~1200ms）；门②事实预算==实际首 GOP 字节双资产硬断言过；门③manifest.esIndexCid 与实际服务索引摘要字节级一致 + announce cid 三方一致；篡改负例必红。
- **载具注记（诚实）**：本轮门禁载具=`artifacts/backend_driver/cheng`（8/29 09:49，sha256=`fc1645b49e68294f46c9a9d4a8fb4190fe0533e1faac78022afb2bfd689a6d1d`）。新烤 stage3 系（8/29 18:50 及更新 cheng_cold.c）对 QUIC/MoQ 闭包全红——`datapath_runtime.msquicDatapathRecordSend` 托管结构定长数组字段投影 storage UNKNOWN（cold_parser.c:46588），归编译器 lane（findings.md 同日条目，含复现配方）；该旧载具自身 flaky（约 1/4 次构建报 "generic application TypeNode producer rejected" 且类型名打印截断错乱，重跑即过）。载具收敛后本门禁 `CHENG=<新载具>` 即可复跑，回执应逐字节一致（封签确定性已被两轮双资产证实）。
- 首帧时延口径（诚实）：gop 首字节 560~580ms（含逐对象重拨的冷拨号），为回执非门禁；生产暖连接池（S3 per-slot pool）接入后另计。

### S2.5 UniMaker GUI 接线（2026-08-30 立项：Cheng 侧入口已落地，C 侧适配与真机挂账）
- **目标**：UniMaker GUI 内点发布→fact-first 封签→对端按事实图秒开。先桌面/设备捆绑资产，后相册视频（依赖 S5 就地 demux）。
- **现状锚点（2026-08-30 实核，较 E2E 文档旧账已演进）**：发布桥已参数化——`cheng_gui_host_adapter.c:2265` CHT publish bridge dlsym `cheng_moq_harmony_publish_serve_file_ex(mp4,poster,es,esIndex)`（2026-07-23 起 poster 显式传参、相册视频 ES 对传空=诚实缺位）；发布回执邮箱 `cheng_gui_host_gen.c:7663`（`cheng_publish_port_reporter` 轮询 moq_ready.port/.cid → render 线程 `publishedAssetCid` + sourcePeer 自戳）；设备 publisher exportc 段在 `media_moq_publisher_main.cheng`（serve_file / serve_file_ex / bundled 三入口）。
- **已落地（本会话）**：新 exportc `cheng_moq_harmony_publish_serve_file_fact_first(esPath, esIndexPath)`——只吃预切 ES 对、跳过整片 ingest、ready 即封签完成（ms 级），`moq_ready.cid` 携带事实包内容哈希（此路径上封签的 manifest 就是发布内容身份）。旧 Ex 符号不动（同 Ex 上线时的 ABI 惯例）。构建验证 rc=0（旧载具；载具 flake 已记档，3 跑 2 绿非本改动引入）。
- **待办**：①adapter C 侧——选中资产带 ES 对（HAP rawfiles maitian.*/hgs.* 今天就具备）时 dlsym 切 fact_first 符号，无 ES 对维持 Ex 路径（等 S5）；②接收端 GUI 化——scene 卡先取 moq-factfirst、按 FirstGopByteLen 拉首 GOP（CLI 接收端 `media_csg_factfirst_live_check_main.cheng` 的取帧序列即蓝图）；③打包门禁——CMake 符号 gate 增列 fact_first 符号；④真机 deviceOnly（hdc+解锁态）。
- **载具前置**：设备 HAP 构建的代码生成当前需锁 `backend_driver/cheng`（0829-0949）旧载具，新烤编译器 datapath 投影缺口清偿后解除（findings.md 2026-08-30 条目）。
- **真机段（2026-08-30：脚本就绪；设备运行期 blockedOnSharedTree，证据链完整已移交编译器 lane）**：`tools/moq_droid_factfirst_live_check.sh` 已落——aarch64-linux-android 构建（NDK27 + export-roots 全清单 + objcopy localize 集 + flaky 重试）全绿、真机（GBJ0222B24021692）push/stage 全绿。设备运行期挂死根因链已完整测绘并移交（findings.md 8/30 续四~续十一）：①新烤编译器闭包五层（L1-L4 本席已修+L5 widen 已修，余 x509 borrow 投影层起的 managed fixed-array field 形状级收口=lane 核心战役）；②backend_driver 0829-0949 的 android exe emit 入口 trampoline `bl` 回填在最终布局下自指（delta=-14 words 负值，main 永不执行），darwin 路径同机制未复现。两债清偿后 `CHENG=<新载具> sh tools/moq_droid_factfirst_live_check.sh` 即出四账数字落账本段。darwin S2 门禁不受影响（四次复跑全绿、回执逐字节一致）。
- **验证门**：桌面/设备 GUI 点发布→publish receipt ms 级回执（moq_ready.cid=manifest 哈希）→对端按事实图首帧；逐项数字同 S2 门（seal≤1000ms、budget==bytes、双 cid 一致）。

### S3 验收表投影（挂账）

- manifest + bridge 四账 + EOS receipt → 验收表投影器（发布端/接收端双账逐项对拍，行级可验证）。
- 验证门：eos_check/pool_check 现有门全绿前提下，投影表行数与 receipts 计数逐项相等；篡改任一 receipt → 投影表红。

### S4 pixel→fact extractor 第一事实（挂账）
- hgs 字幕层：时间窗 + 文本 + 位置 facts（离线提取，入 CSG 方言雏形）；镜头切点第二。
- 验证门：提取 facts 重建字幕层与原帧人工比对留档；CSG 侧以 typed fact 消费。

### S5 csg_dialect::scene 正式方言（挂账，焊接件）
- 内容包格式升格为 CSG 方言（facts_root 内容寻址 DAG、增量回算、局部证明），UniMaker=extractor 前端、纯 Cheng runtime=消费后端、pixel 金标=消费证明。
- 验证门：csg-core-standard 合规工具链全绿；模板内容端到端 KB 级发布+端上渲染+逐帧金标对拍。

## 4. 风险与共享树纪律
- 本战役只新增文件（factfirst 模块/check main/runner/本文档），不碰 lane 热区（bootstrap/*、tools/beat_c_linux_cgroup_v2_*）与共享热文件（web_scene_media_network_bridge.cheng 等）；S2 起需动共享文件时按单 owner 纪律排队。
- 共享树 compile-link 时差回归（findings.md 2026-08-27）若复现：S1 pure 面不受影响则照常；live 面挂账 blockedOnSharedTree，不假绿。
- 临时产物走 `tools/cheng_scratch_scope.sh` 生命周期；冷对象缓存不跨任务保留。

## 5. 商业映射（口径纪律）
- 4.2 政企专网试点：验收表（S3）+ 发布即达/烂网即播数字（S1/S2 门禁数字直接入表）；
- 模板内容带宽账（千倍级）以 S5 焊接件兑现为准，宣传口径按"内容类型路由"：模板类走场景包、实拍类走 MoQ 逐帧流，同一条事实图治理；
- 对外一句话：**让内容生下来就是程序；实拍片的像素省不了，但它的索引、传输与审计全在事实图上。**
