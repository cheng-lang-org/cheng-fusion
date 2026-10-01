# 纯 Cheng 捕鱼：规划依据

日期：2026-09-05。审计基点 HEAD：`73debaef2b29ac253d5fb44a88793a9a524ab22b`。共享工作树不是冻结发布源码；观察到 parser 在途修改及其他测试文件删除，本任务不覆盖。以下仅为源码观察，未运行编译、回放、真机或性能测试。

## 代码现状

所有路径相对仓库根，行号为审计时定位。实施前重读当前源码；历史文档和 skill 中的通过数字不是本轮证据。

| 路径:行 | 观察 | 影响 |
|---|---|---|
| `src/game/ecs.cheng:18,25` | 64 槽、int32 列 | 可借鉴 SoA；不是完整 Arena 生命周期 |
| `src/game/ecs.cheng:142,223,229` | sprite CID 读取恒空；ID 自增/线性查找 | 补资源列、回收和代际校验 |
| `src/game/ecs.cheng:285` | 速度乘毫秒再除1000 | 定点中间值和累计截断必须重新证明 |
| `src/game/physics2d.cheng:69,159` | AABB 限制及逐对检测，圆形也未支持 | 需补本计划的网格与凸多边形连续SAT |
| `src/game/runtime.cheng:39,55,123,175` | 8槽输入、毫秒步进、guard只判非空、SHA256 receipt | 不等于认证或生产调度 |
| `src/tests/game_tick_replay_smoke.cheng:10,19` | 2实体、8 tick 的重复执行测试 | 无当前执行或跨端确定性证据 |
| `src/core/runtime/core_runtime_provider_darwin.cheng:6242,6272,6305` | GUI 句柄/尺寸记录，run/frame返回、poll无事件 | 不可当作真实桌面 GUI |
| `src/core/runtime/web_scene_runtime.cheng:436,9500,9552` | retained draw facts 与资源命令 | 借鉴数据合同，不外推为3D renderer |
| `src/core/tooling/mobile_shell_codegen.cheng:1411,12900,12945` | 生成 Kotlin、C 及嵌入 GLSL | 严格纯 Cheng 产品不能复用这条运行壳 |
| `src/core/tooling/mobile_shell_codegen.cheng:22581,22624` | iOS 模板 CAMetalLayer 与 tick | 未证明实际 drawable/present |
| `src/std/mobile_surface.cheng:12,50,62` | ptr 公开字段、自定义 C 符号、poll | 不能直接复制为游戏 API |
| `src/core/runtime/web_audio_runtime.cheng:3` | 明示无音频输出 | 游戏混音和设备输出要单独做 |
| `src/core/tooling/mobile_shell_codegen.cheng:8482,8504` | 生成 C 中的 AAudio 回调 | 有接线经验，没有纯 Cheng 闭环 |
| `src/core/runtime/core_runtime_provider_darwin.cheng:1666,1707` | 系统 Metal 计算调用 | 不等于 Cheng shader 或3D呈现 |
| `src/game/fluid3d.cheng:19,33` | 512槽专用水墨粒子 | 不引入捕鱼核心依赖 |
| `src/apps/wow_export/asset_formats.cheng:129`；`render.cheng:234,1218` | M2/WMO读取及离线TGA渲染 | 不等于通用glTF/骨骼实时管线 |
| `src/quic/msquictransport_native.cheng:156`；`native_runtime.cheng:8,15,24` | Cheng TLS/连接/UDP真实调用链 | 可选真实传输，需重新验收 |
| `src/quic/native_runtime.cheng:90,4964` | N_SLOTS=8，仍有SleepMs分支 | 容量、事件模型不能按生产已完成计 |
| `src/libp2p/transports/wstransport.cheng:187` | newConnectionPair | 非真实WebSocket链路 |
| `src/core/runtime/web_websocket_runtime.cheng:602` | send只echo | 非可用游戏网络 |
| `src/std/sqlite.cheng:38,121` | 外部importc包装 | 不作为纯Cheng数据库 |
| `src/std/os.cheng:2699,2715,2744,2836` | 文件写入、追加与同步原子树接口 | 需补齐/证明日志持久提交协议 |
| `docs/cheng-formal-spec.md:54,57,767` | 借用后物理地址、默认no-pointer、FFI proof仍标hard red | ABI必须先验，不能绕过 |

搜索 `src/core/backend` 未找到 shader/SPIR-V 后端；搜索 `src/support/platform` 对应实际目录 `src`、`support`、`platform` 未找到 Vulkan/NativeActivity 实现。这里记为“未找到、需建设或证明”，不声称穷尽所有外部仓库。旧引擎文档的2槽/fingerprint描述已落后于当前64槽/SHA256源码。

## Review与精简

文档Review补齐：E2持久存储必须先于D4单机恢复；shader源必须经parser/TypedExpr真实降至ShaderIR；本地触摸响应与权威网络回执分开计时；完整RoomKey贯穿命令/快照/回执；重连保留业务会话和原幂等键；暂停/冷启重新绑定单调时钟。

第一性原理精简：固定相机捕鱼无需通用3D刚体；显式凸多边形+分段线性平移允许连续SAT给出精确有理数TOI，减少跨端开方/epsilon复杂性。所有弹鱼接触按全房间精确全序结算，阶段变化下tick生效。没有为绕过现有缺口加入生产降级实现。

## 外部系统边界依据

- [Android NativeActivity 概念与清单](https://developer.android.com/ndk/guides/concepts?hl=zh-CN)：系统提供原生活动入口，可无自有 Java 源；这只证明平台允许，不证明当前 Cheng ABI 已可用。
- [Android Vulkan 入门](https://developer.android.com/ndk/guides/graphics/getting-started)：必须在支持 Vulkan 的设备上验证。
- [AAudio 官方指南](https://developer.android.com/ndk/guides/audio/aaudio/aaudio)：提供设备音频与回调边界；本计划不用外部 Oboe/C++ 包装。

## 流程工具现状

已读取 `cheng语言`、`using-superpowers`、`writing-plans` 技能。已搜索本机 `.codex`/`.claude` 技能目录及可用工具元数据，未找到 `j-space`/`skill_load`、`planning-with-files`、`gsd-method-guide`。本次没有声称加载这些技能；按用户明确要求保留任务三文件、files/action/verify/done 与 OpenSpec 提案状态。任务只制定计划，无需以缺少编排插件阻断文档交付。

## 2026-09-05 晚：A1 基线轮（纯 Cheng 捕鱼战役）

- 六 smoke 6/6 编译层红，墙两族：跨模块 @borrows 实参准入缺失（同模块借用全绿、跨模块 callee borrows_args=0 → transfer authority 拒）+ bridge staging PathDirExists 假阴（★重案 631 运行面，凡 Fmt 闭包经 ./cheng 必死）。另：零 import 最简程序 ./cheng SIGILL（C 车头直呼同输入全绿）；kernel_driver_w150 当日多份 SIGILL 疑同族。
- 现行契约定谳（探针实证）：非 var 托管形参=move；借用值仅许入显式 @borrows；借用源入容器需显式共享，共享入口收敛 Fmt 插值拷贝（CloneStr 在 C 链释放 registry_miss，p5c 立案）；@borrows 可返回托管字段（自动共享）；托管返回 let 绑定合法。
- 载具格局：./cheng（7/16）主对象代码生成委托 C 车头；backend_driver 9/2 与在途 parser.cheng 失配（coverage mismatch）；纯链自举重烤归 kernel-userpath（其 wall152 烤机进行中，本役未争用未覆盖）。
- 本役落卷：game 三文件 29 函数 @borrows 迁移、默认初始化 8 处规范迁移、Fmt 共享迁移、compiler_main staging 站点修（待重烤生效）、fishing 门禁/合同/负例/探针/capabilities 全套。证据：docs/campaigns/2026-09-05-pure-cheng-fishing/。

## 2026-09-05 深夜：W-A1-1 反转定谳 + 门禁契约四发现

- **W-A1-1 反转**：跨模块 @borrows 准入缺失不是编译器缺口。三文件 @borrows 注解在 13:52-14:27 之间被树操作剥除（他线烤机窗口），此前"旗标未达调用点"的全部证据测自被剥文件。重注解后：import merge borrows_args=1（XMOD 实证）、p7 跨模块借用两连调编译运行全绿、C 链 7/7（六 smoke+合同）compile/run 双零。教训：共享树热窗口内的源码编辑必须留 md5 指纹并在断言"编译器墙"前复核输入文本。
- **W-A1-8 结构体入 seq 崩溃**：含 str 字段的结构体（CheckResult）add 进 seq → 运行期 SIGBUS 零输出。与 ecs.cheng 卷首警示（struct-seq elements containing str/Bytes crash）同族。契约：容器一律平行 str 数组/扁平化。
- **W-A1-9 CloneStrRange 溢出**：`CloneStrRange(s, start>0, 2147483647)` 钳制条件 `safeStart+safeCount>n` int32 溢出为负→钳制绕过→2GB 拷贝 SIGBUS（lldb 实证 ldrb/strb 循环）。path.cheng 自用 start=0 故未触发。根修归 std/strings（他线窗口不动）；调用侧用精确长度切片。
- **W-A1-10 os 原语语义**：os.WriteFile 返回 void（成功判据须回读比对）；os.ListDir 项可能为名字或全路径（用 os.ExtractFilename 归一，注意其为 move 形参）；str 形参助手一律 @borrows（形参槽 OWNED 非 MOVE，转发普通 str 形参必拒）。
- **★重案 631 现行确认**：门禁 import chengpath 后其函数（PathCreateDirAll/ReadTextFile/WriteTextFile）在闭包内静默失灵；整删 chengpath 改 os 原语后恢复。桥面 staging（bridge_surface_source 684MB 拷贝树）纯属 ./cheng 编排器行为，C 车头与 driver 直呼 system-link-exec 均不需要——Fmt 闭包在 driver 上无 staging 阻断。
- **neg4 载具依赖**：[cheng_seed] 冗余初始化硬错在 .cheng parser 层，C 车头不拒、纯链载具拒——门禁负例断言以纯链载具为准。
- **门禁基建落地**：src/tools/fishing_gate.cheng（原 tools/ 因 cold 包根 src/ 约束迁入）；baseline 全流程（staging→编译→运行→回读校验→负例断言→流式报告）C 链预验证 9 过 1 失（唯一失=neg4 载具依赖，纯链即过）。
