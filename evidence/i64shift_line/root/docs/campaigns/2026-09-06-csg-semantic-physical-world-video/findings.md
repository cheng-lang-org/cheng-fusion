# CSG 语义物理世界视频：事实与设计依据

核查日期：2026-09-06。工作区 HEAD：`7590620968069325193f6c1a119e2710930d5199`，含其他任务尚未提交的改动。HEAD 仅定位基线，不代表当前源码内容哈希，也不构成发布证据。本轮只读核查与文档修改，没有运行编译、物理或视频测试。

## 已核实

- `docs/csg-core-standard.md:299` 的 canonical registry 没有本提案世界/视频/张量领域；扩展必须有 producer、精确 validator 和 consumer。
- `src/core/csg_core/merkle_dag.cheng:21` 与 `merkle_invalidation.cheng:6` 提供 SoA Merkle 与失效传播基础；不自动获知物理尾段、阴影或跨帧模型依赖。
- `src/game/ecs.cheng`、`physics2d.cheng`、`runtime.cheng` 为唯一共用世界基础；当前二维列、AABB 与定步入口不能当作三维人物动力学。
- 捕鱼战役 `docs/campaigns/2026-09-05-pure-cheng-fishing/task_plan.md` 已进入自身 A1，但记录了借用、staging 与 SIGILL 阻塞；其上层提案仍留有早期 propose 文案。本任务以该任务的运行记录为依赖线索，必须在 A1 复核当前源码，不替其他任务改写状态。
- `docs/superpowers/plans/2026-09-05-pure-cheng-fishing.md` 的 shader/SPIR-V 是 Android/Vulkan 待建路径，不能视为本机 Metal 可用。
- `src/core/runtime/core_runtime_provider_darwin.cheng:2868` 仍内嵌 MSL 算子；`src/inference/kernel.cheng` 有部分算子，限定检索未发现完整人物视频模型链。
- `src/core/runtime/web_scene_media_factfirst.cheng` 与旧视频方案服务索引、发布和播放；历史回执不能替代本任务当前视频生成验收。
- `docs/csg-core-standard.md:251` 明确 production launcher 的 activation event source 与跨会话 replay anchor 未闭合；影片原型不能抵扣该生产依赖。

## 本计划选择

- 首期为 Mac 本地纯 Cheng CPU 离线渲染，先完成真实人物运动与可干预物理，再做 GPU 性能扩展。该选择是正式产品路径，不是运行失败后的自动替代。
- 同一 CSG 事实来源驱动物理、蒙皮、镜头与声音；不创建 app 私有世界或重复实现 ECS。
- 第一验收为 10 秒攀绳、全部支撑解除的自由飞行实验及三个机位；扩展终点为 60–90 秒完整动态短片。
- 数值阈值与人周是拟议目标/估算；没有做完并实测的项目不得标为通过。

## 工具与流程可用性

已读 Cheng 语言技能。检索用户技能目录与安装插件目录，未发现 `j-space`、`using-superpowers`、`planning-with-files`、`gsd-method-guide` 的可读技能；工具清单无 `skill_load`。没有声称加载这些技能。按仓库已使用的提案、计划、task_plan/progress/findings 文件形态落实所需记录。`str_replace_editor` 不可调用，文档使用可用的结构化 `apply_patch` 写入。

## 独立评审修正

计划初稿经过独立Review，补齐三处验收缺口：系统AAC编码及首尾填充/有效播放区间、离线生成耗时/取消/迭代预算、全量重算不得复用增量路径状态与缓存。按第一性原理复核后，保留唯一ECS与正式CPU离线路径，将GPU及模型扩展放在十秒真实影片验收之后，避免基础原型被无关研究阻塞。

## 实施期发现（2026-09-06 晚间，stage3 实测）

- **backend_driver 现役二进制对当前树 game 模块编译失败**：`parser-owned global coverage mismatch source=…/ecs.cheng parser=5 metadata=0`（5=ecs 的 const 数）。stage3 `system-link-exec --emit:exe` 通道正常。已按计划风险表归 compiler 主线，本任务不依赖该管线。
- **std/math `sqrtFloat` 在 v<1 时返回输入本身**（Babylonian 迭代 y 初值 1.0，循环条件对 v<1 恒假；实测 sqrtFloat(0.25)=0.25）。已建 `src/game/csg/numerics.cheng` 递归牛顿开方绕开；该缺陷影响所有用 sqrtFloat 的现有代码，建议 compiler 战役认领。math.cheng 注释声称的「while 循环 float64 局部不持久」「裸 0.0 比较不可靠」在现役 stage3 上实测**不成立**（探针 3^10 循环突变与正负比较均正确）。
- **fmt/Fmt 插值不支持 float64**；浮点诊断输出需自行定点化。`"\n"` 转义、`Join`+`str[]` 均可用；跨多约束的**超长链式 `+` 字符串拼接会触发 body-store-freeze 拒绝**，照 ecs 先例改 str[]+Join 即可。
- **非 var 托管形参默认 move**：跨模块只读结构体/序列参数必须逐个标 `@borrows`，否则调用方局部被消费后触发「lacks exact live source」；var 视图再借用（var 参数转传 @borrows 形参）会被拒——用直接字段内联替代小助手调用。
- **PBD 速度注入**：位置投影后若不重算速度，悬挂体每步累积重力速度（实测卸载时 −47m/s「速度炸弹」）。改 Verlet-PBD：v=(x_after−x_before)/dt 后必须**再补 +a·dt/2** 才是下一步的启动速度（半量系数错了 ±全量都会让自由落体位置误差二次增长，实测 ±2.6m）。补齐后自由落体机器精度 0.000mm。
- **移动约束目标 vs 迭代求解器**：速率受限的肌肉目标在高负载链上与 GS 迭代形成赛跑棘轮（残差单调增长）；改「抓握=单向绞盘约束、执行器只动绞盘目标」后全身 79kg 悬挂稳定。对称 Gauss-Seidel（正反扫交替）是张力传锚的关键。
- **未触达**：D3 系统 H.264/AAC 编码与 MP4 封装、E2 增量对拍、G 阶段全部；门禁历史报告零抵扣，全部本轮实测。
- **float64→int64 隐式转换产生未初始化垃圾(本战役最重大编译器发现)**：`let mm: int64 = m.roundFloat(x*1000.0)` 每个进程得到同一个指针样常数（两进程实测 1861837032 / 1869816040），进程内确定、跨进程漂移——曾令全部 CID（facts/world/chain）成为垃圾哈希且进程内双跑测试无法暴露。float64→int32 转换实测正确。修复=`csg/numerics.CsgQuantMm` 两步量化（float→int32→int64）。所有含浮点量化字段的跨进程 CID 必须经此路径。另：const 声明处的 `int64(20260906)` 转换表达式同样不可靠（改普通整数字面量）。

## 实施期发现（2026-09-07，film_chain 定谳 + 干预片导出）

- **gate film_chain「chain CIDs diverged」定谳为并行编辑窗污染，非物理非确定**：三重实证——①同一二进制连跑两遍 manifest 逐字节一致（chainCid=4489b550…）；②同一源码两次独立 stage3 编译产物 SHA256 完全一致（5eada3ad…，编译器字节确定）；③exporter 只读不写 manifest。结论：当时 gate 的两次 film 编译落在源码并行编辑窗的不同快照上（与 kernel 战役 wall151「r5 系并行编辑窗污染产物」同型）。纪律：**门禁运行期间严禁任何并行编译/编辑**，分叉先做「同二进制双跑 + 双编译 cmp」两步定谳再动手。
- **干预片独立 MP4 交付**：`climb_intervention.mp4` h264 1280×720 71 帧 2.958333s（179KB）。exporter 主循环在 tick-1700 检查点 `CsgExecutionSnapshot` 深拷贝 + `Rope3dRemoveFromWorld` 语义卸绳，分支独立 `Physics3dStep` free-fall 推进并同步编码到第二 VT 会话（ivCtx）；主片 240 帧 10s 与 manifest chainCid 绑定不变。两片 ffprobe `-v error` 零输出、ffmpeg 全帧解码 rc=0。
- **遗留容器级提示**：null muxer 报末帧 dts 非单调（`239 >= 238`）——stbl 无 ctts box 时 B 帧流 dts 由 ffmpeg 推导的固有近似，解码完整性不受影响。F 阶段成片前加 ctts（composition offset）消除。
- exporter 抽 `encodeWorldFrame` helper（渲染+RGB→BGRA+VT 提交+清理），主片/干预片共用，消除 30 行重复转换代码。

## AAC 音轨接线墙位（2026-09-07，桥代码就绪、链接通道未通）

- **AAC 桥已实现**：`src/game/cinema/aac.cheng`（AudioConverterNew/FillComplexBuffer 直驱 + @exportc 输入回调 + C-heap 游标 ctx + packet description 切包，ASBD s16le mono 48k→AAC-LC）+ `src/tests/aac_bridge_probe.cheng`（1s 440Hz 正弦探针）。前端已验证：`--emit:obj` rc=0，undefined 面恰为 AudioConverter 三符号（预期）。progress.md 里"AudioConverter 桥已写未验证"的旧记录有误（代码随干预分支回退丢失，本轮重写）。
- **链接墙（属驱动战役）**：stage3 系统链接框架表（`-framework VideoToolbox CoreMedia CoreVideo CoreFoundation Foundation Metal QuartzCore`）不含 AudioToolbox → 三符号 undefined。`CHENG_DARWIN_FRAMEWORK_FLAGS`/`CHENG_CLT_FRAMEWORK_FLAGS` env 覆盖会把链接切到 direct-ld 路径，撞 `Darwin direct ld exact toolchain admission failed`（admission 需预登记 toolchain hash，全套 CHENG_DARWIN_CC/SYSROOT/ARCH_FLAGS env 仍拒）。
- **正解**：HEAD 内部链接器 `macho_provider_linker.cheng` 两处各加 ordinal 8（`machoDarwinImportDylibOrdinal` 三符号映射 + `machoProviderDylibPathForOrdinal` AudioToolbox 路径），烤新驱动后 aac.cheng 即插即用。**烤通前按合同如实标注不支持**（合同原文：MP4/H.264/AAC 系统编码走 Darwin provider，未接线前如实标注；首期音频交付物=WAV）。mp4.cheng 的 mp4a/esds/ASC 封装与 1024/包 stts 已就绪，无需改。
- exporter 顺手清理：删除 6 处 `/tmp/csgw_phase.txt` 段错误调试残留（裸 /tmp 纪律）。

## D1 角色升级实录（2026-09-07，胶囊人形+连续绳+资产 CID 闭环）

- **`src/game/render/character.cheng`**：`RasterCapsule`（屏幕空间扫掠圆 impostor：轴插值深度−表面隆起、精确 3D 表面法线 Lambert、两端半径透视插值）+ `RenderCharacter`（球头肤色/胶囊躯干红衫/胶囊臂袖/胶囊腿深蓝/球手脚灰，全部经 part-role 表定位 slot，无名称/邻近配对）+ `RenderRope`（绳节点串+相邻节点胶囊段=连续绳）。world_cinema 与 exporter 渲染统一走此模块，消除两份 30 行重复球体遍历。三机位目检+MP4 中段抽帧确认可辨认人形攀爬。
- **两个存量渲染 bug 由目检首次暴露**：①`RasterWritePpm` 数据从 offset 15 写入，覆盖 PPM 16 字节头的末位 `\n` 且全部像素通道错位一位——**240 帧交付 PPM 全部受影响**（MP4 走 BGRA 内存不经 PPM 故未暴露；frame_hash 只是文件 sha256 也测不出）；②`RasterWallFace` 光照项算出负 lum 被 uint8 截断成过曝白墙。修复后岩壁为中灰+摩擦条纹。
- **资产 CID 闭环**：`src/game/assets/climb_assets.cheng` `ClimbCharacterCid`——A2 三列对应表（语义 role→物理 slot→渲染 bone=part index）canonical preimage 的 SHA256；重复/缺失角色或 slot 越界返回 ""（调用方 FAIL 拒绝）。world_cinema manifest 写 `characterCid=70460cae…`，exporter 重执行断言与 manifest 绑定一致；gate 新增 `character_asset`（64hex 断言）与 `d1_character_render_probe`（调色板像素断言：红衫/蓝裤/肤色/棕绳计数阈值）两检查，**门禁 9 项→11 项全绿**。
- **物理零影响实证**：渲染升级后 chainCid 不变（4489b550…）、COM/干预指标不变——渲染只读已提交状态，符合"渲染不得回写物理"合同。
- 冷编译器注意：局部 `var seq = []` 字面量初始化会触发 "native sequence mutation local predecessor is not exact"，须用 `setLen(x, 0)` 形态；借用形参只能传给 @borrows 形参（RoleSlot/countRange 均需标注）。

## E 段视觉审查首层（2026-09-07，双片 9 帧抽样目检）

- **PASS 项**：角色三色+四肢构型全部帧可辨认（f0/30/60/120/180/239 + iv0/35/70）；绳连续且物理垂曲自然；卸绳因果视觉链完整（iv70：角色落地蜷缩、绳仍挂墙原位=语义卸绳可视化）；岩壁中灰+摩擦条纹、地面棋盘、遮挡正确。
- **观察（F 阶段改进项，非缺陷）**：①相机 A 方位下头球常与躯干胶囊投影重叠（头 slot 在胸正后方的深度遮挡+近距投影，物理 rest 距离 0.27 > 0.25 半径和无穿透；合同"可见穿透≤5mm"指物理穿透，投影重叠不算）——F 阶段微调相机 A 方位角即可；②躯干胶囊半径 0.13 相对手臂 0.05 体量偏大，角色偏"桶状"，F 阶段可在不改物理 slot 的前提下缩躯干渲染半径。

## F-a 行走原语实录（2026-09-07，机制全部落地、步态调优挂起）

- **已落地（架构层）**：①schema `stepPart/X/Y/Z/StartTick/EndTick/Rate/PlantLen` 脚本步表 + preimage 段 + 校验（窗口/速率/落点/同脚重叠，错误码 19-23）；②rope spec `nodeCount==0` 合法（无绳场景）+ materializer 分支；③execution 阶段 2.5：startTick 时 spawn 静态锚体（`World3dBodyAnchor`）并建 `World3dConStepPull` winch 约束，rate 收缩到 plantLen 保持，endTick 释放——与攀爬绞盘同族的有界率伺服；④`CsgProducerBuildWalkScene` 扶墙横移场景（墙 y=0.5 面、R 手锚链、双脚交替挪步、盆重心伺服行）+ 姿态 strut（pelvis-handR 扶墙支柱三角、pelvis-head 躯干直立肌——距离约束网络内诚实的姿态刚度）；⑤`csg_world_walk_smoke` 双跑确定性探针 + `csg_walk_preview` 渲染目检工具。
- **机制教训（每个都花了一轮实验）**：①双脚交替但无持续支撑→身体倾倒拖行（质点模型无踝扭矩，单支撑期必倒）；②手锚 plant=0.02"钉死"→身体被拴在墙上寸步难行（plantLen 语义=plant 保持长度，手要"轻扶"0.15）；③躯干单链无姿态刚度→胸绕盆垂转前倾（strut 三角修正有效，直立实证）；④多锚（盆伺服+手链+双脚）窗口交叠时刻约束冲突→残差>10mm 被物理门拒绝（tick≈441 手/盆锚交叠）。
- **挂起（下轮继续）**：步态参数矩阵调优——当前最好成绩 695mm 前进（姿态直立、0 拒绝），盆重心伺服加入后残差反弹。调优方向：a) 盆伺服降速（0.30→0.15）+plantLen 放宽（0.35→0.45）；b) 锚窗口相位错开（盆锚与手锚不同拍）；c) 或 execution 层对 anchor 约束的 refinement 迭代加权。达成标准：前进 ≥0.9m + 0 拒绝 + 双跑确定 + 目检直立横移。
- **F-a 收口（同日续）**：参数矩阵三轮实测——盆伺服降速仍拒（拒点漂移，多锚对拉是统计性爆点）；10 步版在第 8 步爆残差；8 步+脚 plant 0.06 滑移余量"5m 前进"实为滑行失控（身体冲出墙锚区，不是走路）。**定版基线=6 步轻扶形态**（695mm 前进、直立、0 拒绝、双跑确定），smoke 断言 ≥0.5m 进主门禁，**门禁 11→12 项全绿**。≥0.9m 目标与滑行抑制挂起，根治路径=投影器对 anchor 类约束的 compliance/refinement 加权（物理内核共享文件，需战役级评估对攀爬链影响）。

## G1 实时化前哨：并发渲染架构定谳（2026-09-07 深夜）

- **纯 cheng 并发 shape 规则（编译器实证）**：ParallelFor worker 的 ctx ref object **含任何 seq 字段即在还原时被拒**（"managed object ref physical shape not exact"）——不管直接还是嵌套、不管读写。合法通道只有标量+atomic 字段。**推论：大缓冲共享在纯 cheng 并发模型里不是合法通道，行级像素并行此路不通。**
- **一度违规被用户纠正**：中途用 calloc/memcpy/裸指针 C-heap ctx 绕过——违反纯 cheng 指针纪律（语言/逻辑层零指针；裸指针+指针运算只在桥接边界层）。已全部重写为纯 cheng 形态。
- **正解架构=pass 解耦 + 帧级并行 + 状态文件流**：pass1 串行物理，每 10 tick 落盘 SoA 状态文件（毫米定点文本，往返精确）；pass2 `ParallelFor(帧数)`——每个 worker `RenderStateLoad` 自己的状态文件、本地 `new(RasterFrame)` 分配、渲染、写自己的 PPM——**零共享，文件系统是唯一跨界通道**；pass3 串行编码。`parallel_render_probe` 实证：60 帧并行渲染与串行参考**逐字节一致**（并行执行零不确定性）。
- **配套重构**：`RasterTarget` 持 `RasterFrame`（ref object：rgb uint8[] + zbuf int32[] 毫米定点，哨兵 2147483647=空）；Rope3dRemoveFromWorld 语义细化为"绳被抽走"（节点 radius 清零=不接触不渲染）；RasterMake 恢复天空背景色（重构时曾丢失，由 ascent gate overlay 断言间接暴露）。双门禁（12+13 项）全绿。
- **性能账**：帧级并行 14 核理论 ~10×；单帧内地面/墙全屏 brute force 仍是串行大头——G 阶段正解=Metal compute 光栅化（kernel 走"系统着色器"外部效应口径或编译器 GPU 后端，需定纯度口径后立项）。


## 提示词文法层（2026-09-07，提示词→世界闭环打通）

- **`csg/prompt.cheng`**：确定性提示词文法——受限 ALL-CAPS 动词文法（WALK <N> STEPS / STAND <N> SECONDS / CLIMB <N> SECONDS，AND/THEN 连接，大小写不敏感），解析为 PromptIntent。**无 LLM：同一提示词永远生成同一世界**，延续因果可验证合同。未知动词 → parseOk=false（"FLY TO THE MOON" 实测拒绝）。
- **`producer.CsgProducerBuildWalkSceneSteps(steps)`**：横移场景步数参数化（手锚链=steps/2 段×540 窗×0.45 步距，脚步=steps）。
- **`prompt_parse_probe`** 三提示词端到端：WALK 2 STEPS→1284mm / WALK 6 STEPS(+THEN STAND 5 SECONDS)→3605mm（单调 ✓）/ CLIMB 10 SECONDS→攀爬执行 0 拒绝；外加未知动词拒绝与解析字段断言。尚未纳入主门禁。
- **冷编译器借用规则补全（高频踩坑，值得单独记）**：①借用实参只能绑 @borrows/var 形参，且**借用沿调用链传播**（@borrows 函数内 text 转传下一层也须 @borrows）；②@borrows 函数的 var seq 形参不是 local sequence（add 被拒）——分词等构建逻辑须内联或局部构建；③**@borrows 函数不能返回新建 ref**（new 的返回被借用形态拒绝）——用双形参（调用方 new 后借用填充）替代；④ref 实参默认 move（独占），共享传参用 `share()`；⑤ref 字段 seq 不能 let 提取（move 出字段非法），只能逐点索引访问。


## 子代理并行推进（2026-09-07 深夜，三线全绿）

- **CSG 播放器 v1 交付**（`apps/csg_player/main.cheng`）：--dump 模式物理跑 2400 tick 落盘 240 个状态文件；--frame:N --cam:C 命令式帧渲染（三机位），物理推进实证（骨盆 state_f0 (0,700,1060)mm → state_f239 (833,869,1763)mm）。子代理一次编译通过零错误（先读先例+逐条对照约束清单的工作法生效）。
- **prompt_parse_probe 纳入主门禁**：门禁 12→13 项全绿（实测约 10 分钟）。
- **G 阶段重大突破：Metal compute 通道打通**——`tests/metal_compute_probe.cheng` 纯 cheng 经 @importc ObjC 桥（MTLCreateSystemDefaultDevice → newLibraryWithSource 运行时编译 MSL → compute dispatch → waitUntilCompleted → 读回）完成 4 元素向量加法，纯 cheng 断言全对，一次编译运行通过。**G 阶段 GPU 通道无阻**：框架表 Metal 在列即可解析，无需额外链接配置。G1 光栅化 GPU 化的前置风险全部消除。
- 子代理并行工作法验证：文件所有权互斥切分（player 新目录/gate 单文件/metal 新文件），并行无冲突；每代理 prompt 自包含编译命令+约束清单+验证标准+所有权边界。


## CPU 光栅化裁剪优化（2026-09-07 深夜，ffdf18e68）

- **地面**：look-at 相机构造保证 rz=0 → dir.z 行内常量 → 地平线以上整行无命中可整行剔除（数学严格等价，非近似）；深度 tt 亦行内常量，提到像素循环外。
- **墙面**：四角一次投影取包围盒（外扩 2px），仅盒内逐像素判定——判定逻辑原样保留故输出严格等价。
- **实测**：world_cinema 全流程（2400 tick 物理 + 240 帧渲染）从约 4 分钟降至 **44.1s，单帧约 110ms ≈ 9fps**；帧级并行（14 核）下交互播放器实时可行。CPU 路径为合同基准持续优化，GPU compute 是 G 阶段吞吐终解（metal_compute_probe 已验证通道）。

## AAC 音轨 + WALK 注入 + 双缓冲显示面（2026-09-08）

- **AAC 内嵌 MP4 打通**（两步链接期）： AAC 桥三 bug——输入 ASBD formatId 多敲一位数字('lpcm'写成 18193068513)、AudioStreamPacketDescription arm64 实为 16B 步进(i64 offset+2×i32, 12B 步进错位解析)、转换器尾部不足 1024 样本帧不产出(设计使然, 调用方须补齐 1024 倍数)； C 实证法: 10 行 C 程序直测 ABI(临时探针, 已删), 4 字节首帧是合法高压缩帧(纯正弦 MDCT 稀疏)。 mp4 muxer 三 bug——ASC 0x1310(24kHz)应为 0x1188(48kHz mono LC)、ES_Descriptor 长度 25 应为 28、bufferSizeDB 24 位字段写了 4 字节且 mp4a AudioSampleEntry 版本/修订/厂商区多写 6 字节导致全字段+6 错位(采样率字段还撞 int32 溢出, 48000<<16 须拆双 W16)。 ascent.mp4 终态: h264 10.0s + aac 48000Hz/mono 10.005s, ffmpeg 全量解码 PASS。 内部链接器 ordinal 8(AudioToolbox)已入库 macho_provider_linker.cheng, 下次烤制生效后弃 cc 兜链。
- **WALK 运行时注入**：CsgExecutionQueueWalk 复用静态 walk 场景全套步态常数(0.25m 对步幅/270 tick 窗/135 半周期/0.80 速率/0.02 蹬地长), 从当前双足均值位置续走; RunGame 每行走过 prompt 文法解析, 非法 span 硬失败。爬绳世界中注入 WALK 被物理诚实拒绝(rc=3 残差超限: 手抓绳+脚拖地约束互斥)——语义范畴错误, --game:<world> 支持选世界, WALK 演示用 walk.csgworld。同机位前后帧差 37713B 证实人形真实位移。
- **窗口显示面纪律重构**：撤掉 seq 头部探测取数据指针的违纪通道(用户指正)。RasterFrame.bgra 改 rawbytes.Bytes 稳定显示面(cheng_rawbytes_set_at 原语直写, mp4 写箱同款), 双目标轮换=后面积分直推+推前不写, 零拷贝零逐帧分配; RasterClear 每帧全清防天空区残影。ORC 细节: 本地别名转移触发 drop-source 拒绝, 以 @borrows 渲染助手借用传递解决。chainCid 逐位一致(物理零回退硬证据), 240 帧全绿 215ms/帧。
- **性能归因修正**：memcpy 替换逐字节拷贝后总时长几乎不变(300→215ms/帧), 证明 3fps 墙真凶不是显示拷贝而是 10 物理 tick/帧(~200ms, 240Hz 权威模拟固有)+全帧栅格; 30fps 目标主攻方向=物理 tick 成本, 其次 Metal compute(G 阶段)。
- **工具链**：tools/csg_aac_link.sh 两步链接配方(obj+providers 捕获+cc -framework AudioToolbox); 老冷链 `cheng`(7/16)的 [cheng_seed] 冗余默认初始化 lint 与 stage3 不一致(stage3 通过), 佐证烤制收敛必要性。

## 物理 tick 10×：CID preimage 等字节重写（2026-09-08 晚）

- **采样定位**：`sample` 采 --game 主线程，99% 在 tick 主链，其中 ~1/3 是 ORC 释放风暴（cheng_mem_release 深链）。根因：每 tick 2 次全状态 World3dCid + 1 次 receipt preimage，全部走 str[] 碎片 + Join——~15 个 str 分配/体/tick（~80 体 ≈ 1200 分配/次 CID），即建即释。
- **等字节重写**：World3dCanonicalPreimage / physics3dReceiptPreimage 改 BytesBuilder 直写字节（World3dCidAppendLit/I64 十进制数字直发），喂给 Sha256 的字节流与旧 Join 逐位相同。**硬门：build_ascent chainCid = e9cbb3fa… 逐位一致 PASS**。ORC 细节：@borrows 函数内整个结构体借用实参不能绑值形参（字段读取可以），append 体须内联进 @borrows 壳；helper 用 @borrows + var 形参混标可行。
- **实测**：5000 tick 10.3s ≈ **2.06ms/tick（约 10×）**。窗口 240 帧 190ms/帧（原 300）：tick 21ms + **栅格 ~100ms** + 泵/drawRect ~70ms。
- **归因更新**：栅格升格为最大单项（findings 上文 110ms/帧 CPU 基准吻合），30fps 主攻 = **Metal compute 光栅化（G 阶段）**。垂直切片方案已定：ground+wall 两解析面一 kernel 逐像素解析（float32，与 CPU 渲染不逐位一致但按设备确定；渲染不进 CID 链，物理 chainCid 不受影响），zbuf 留 CPU 给绳/人形（遮挡次序固定：地面<墙面<人形），metal_compute_probe 已验证 MSL 运行时编译+dispatch 全链。RasterClear 同步改 4 字节图案倍增填充（20 次 RawmemCopy 替代 372 万次单字节桥调用）。

## G 阶段垂直切片落地：Metal compute 背景 kernel（2026-09-11）

- **gpu_raster.cheng**：ground+wall 两解析面单 kernel 逐像素 raycast（MSL 运行时编译），BGRA+int32 毫米深度直写 shared MTLBuffer；相机参数 20×float32 块（索引寻址避 MSL float3 16B 对齐陷阱）；A/B 两组 buffer 轮换保持"front 不写"合同；桥接调用形状全抄 core_runtime_provider_darwin inference-Metal 先例（setBuffer:offset:atIndex:/status==4/waitUntilCompleted）。CPU 只画绳+人形（zbuf 对 GPU 深度列做遮挡测试）。
- **zbuf 转 Bytes 契约**：RasterFrame.zbuf int32[] → rawbytes.Bytes（4B/px），读写走 RawmemCopy、清零走 RawmemSet(0xFF)（sentinel 2147483647 全 0xFF 字节，一次 memset）；RasterAdoptViews 零拷贝收养 GPU buffer contents 为显示面视图。
- **冷编译器缺口绕行**：float64→float32 cast 未实现——CPU 侧 gpuF64ToF32Bits 纯整数位操作（round-to-nearest-even，照抄 system_helpers_backend 算法自包含）+ @importc cheng_f64_to_bits；MSL 侧 floor 不在全局命名空间（须 metal::）——正值域用截断、负值域用 (int)+比较校正的整数 floor，零头文件依赖。
- **配方双 bug 修复**（tools/csg_player_gui.sh + tools/demote_syms.py 收编入库）： demote 的 lstrip('_') 与 nm 带下划线符号名永不匹配（降级从未生效过）； demote 产物 core_gui_off.o 从未加入 LINK_OBJS（core-only 运行时符号如 cheng_ptr_plus 无来源）。两 bug 历史互相掩盖（主 obj 从不引用 core-only 符号 + core 从不参与链接），gpu_raster 引入 cheng_ptr_plus 后同时引爆。/tmp 交集文件改 $$ 唯一名防并行会话互踩；cc 行补 -framework Metal。
- **实测**：窗口 240 帧 45.5s → **10.7s（44.6ms/帧 ≈ 22.4fps，5.5×）**；分解 ≈ tick 21ms + kernel ~5ms + CPU 绳/人形 + 泵/drawRect ~15ms。GPU 帧 sanity：天空占比 17%（构图正常非退化）。回归：--game:walk PASS、ascent chainCid=e9cbb3fa… 逐位一致（渲染不进 CID 链的合同成立）。GPU init 失败自动落 CPU 路径（headless/CI 保障），导出 PPM/PNG 语义不变。
- **30fps 剩余缺口**（44.6→33ms）：泵/drawRect ~15ms（AppKit 主线程固有，Metal 直显/CAMetalLayer 是终解）+ tick 21ms（物理内核战役）。

## 三线并行收口：HUD + journey 六镜头字幕 + playground 沙盒（2026-09-11 深夜）

- **子代理并行工作法第三次验证**：文件所有权互斥（A=csg_player HUD / B=journey_film 字幕 / C=producer 新函数+export），prompt 自包含编译配方+验收命令+ORC 纪律+CID 硬合同+禁 commit；主代理统一收口（合并构建+全门禁重跑+分文件提交）。三线零冲突零返工。
- **--play HUD**：顶部操作提示行 + tick/相机状态行 + 事件反馈 60 帧渐隐，GPU/CPU 双路径在环；chainCid 0938405170… 逐位不变。
- **journey 长片叙事**：JourneyPlan 六镜头（每 2400 tick 一机位，含 THE SUMMIT 收尾镜头）+ 六条非重叠叙事字幕经 param 文件流进 pass2 worker（subOn 门控 RasterText），manifest 加 shots=6；物理 pass1 逐字节未动（chainCid d68713cd… 不变），重建后双轨 60s ffprobe 绿、字幕行实证非空。
- **playground 交互沙盒世界**：站定锚定 690 tick 后全程无静态动作表，14400 tick 交互窗口；554 字节导出 cid=6d7adbcd1cb6；--play 注入 4 次 WALK/CAM 全程物理零拒绝 + 重演 CID 一致（a0eef45bea…）。三场景 CID 硬合同逐位不变（climb 1e411cbf2a3a / walk 66576a37f772 / journey 120bc122c9e5）+ ascent chainCid e9cbb3fa… 不变。
- **游戏-视频闭环现状**：playground 世界 = 交互玩法正式载体（climb/journey 世界保留脚本演示用途）；session 文件即"录像"，--replay 即"回放"，chainCid 即"存档校验和"。

## 接触系统审计（物理仿真阶段二预研，2026-09-11 深夜，P4 线）

- **法向支撑可用**：质点-隐式地面（z=0 解析面）接触一帧吸收冲击（vz -2774mm/s→-20mm/s PBD 静止极限），5 帧零抖动收敛，物理级行走的支撑面成立。
- **【阻塞级缺口】摩擦无效**：contacts3d 摩擦把切向速度乘 keep=max(0,1-μ)（L29-43，地面 μ=0.6 硬编码），但作用在积分速度上；Physics3dStep 第 4 阶段 Verlet-PBD 速度重建（v=(p-p_prev)/dt+0.5*a*dt）从位移重算覆盖之，而接触只修法向位置 → 切向衰减每 tick 被丢弃。实测 vx=1000mm/s 恒定滑行 3000mm=无摩擦理论值。修法二选一：摩擦作用于 post-solve 存储速度，或 PBD 位置级切向修正。与深水区 projection compliance 同根源族。
- 其余缺口：静态体不参与接触（动态球会穿过静态体）；无质点-质点接触（无自碰撞）；接触统计无法向冲量（平衡控制拿不到反馈）。
- **编译器侧线索（归内核战役）**：物理循环内做 str 拼接+echo 确定性复现 statusCode=2 NonFinite + cheng_orc_release_failure(registry_miss, wrong_object_or_owner)——ORC 疑似误释放活对象并损坏 World3d 数据；循环内零字符串（trace 缓冲后置打印）即全绿。复现配方：src/tests/contact_support_probe.cheng 的 git 前身模式（每帧 printFrame 拼 str）。

## 物理仿真四线并行收口（2026-09-12 凌晨）

- **P1 限位约束（物理内核）**：World3dConDistMax=5/DistMin=6，constraints3dProjectOne 单边分支（== 判分发，既有 kind 1-4 求解路径逐位不变）；膝限位=hip-ankle 双向距离夹的标准 ragdoll 做法复用二体结构零新列 → preimage 零变化。探针 max 0.700/min 0.300 双向精确接住；chainCid e9cbb3fa… 逐位不变 + csg_world_physics_cases 回归 PASS。工程注记：限位穿透侧起步会被 PBD 速度更新换算成 ~70m/s 踢速永久翻腾——限位类约束必须从松弛侧贴边初始化。
- **P2 骨骼人形（视觉骨骼叠加层）**：膝/肘 4 质点各 2 条 CsgJointRestFromPose 约束叠加在原 7 质点骨架上（原约束全保留，物理零风险），skeleton.csgworld 803B cid=f8515649ebb7；100 tick 漂移 27-41mm<50mm。三个如实偏离：叠加质点暂挂 CsgRoleNone（validation 硬校验 role≤7，role 8-11 已备 schema 待放开）；RenderCharacter 未画新质点（渲染层下一步）；**发现锚点 born-satisfied 系统性缺陷**——落点=部件坐标时 dist0=0 产生 megaprojection 踢飞（walk/journey/playground 静态站锚共有；skeleton 内用"锚点离部件恰一个 plantLen 生成"绕开）。execution 系统性修复会改 CID 合同，需走"修复+全量重录基线"正式变更，未动。
- **P3 跟随相机**：C 键切换，骨盆目标 + 机位偏移(-2.6,2.2,0.9) 指数平滑 0.15，首帧吸附；session 记 CAM 4 可重演；实证：跟随开关 chainCid 逐位一致（相机不动物理），人物像素质心固定机位漂移 410px vs 跟随 67px。
- **P4 接触审计**：见前段。四线合并门禁：五场景导出 CID 合同全对 + ascent chainCid 逐位 + skeleton/limit 探针 + playground play/replay 全绿。
- **阶段二路线图（依据审计）**：摩擦修（post-solve 速度或位置级切向修正）→ 静态体进接触 → 脚接触支撑替换钉地 → PD 直立+捕获步。ORC 循环内 str 误释放线索移交内核战役。

## 第二批三线收口：摩擦修复+锚点修复+骨骼渲染完整化（2026-09-12）

- **摩擦从死代码变活**（F 线）：PBD 位置级摩擦锥（切向位移按 μ·穿透深度钳制，锥内粘滞锥外滑动），physics3d 仅一行接线传步前位置快照；法向行为逐位不回退；探针滑行 3000mm→**0mm**（Coulomb 冲击摩擦一触即停）。地面 μ 提为文件内 const，表结构零动。
- **锚点 born-satisfied 修复**（E 线）：实测证伪处方（max 初值是 no-op——伺服 clamp 同 tick 已抬 target），真凶是 clamp-up；修伺服下限 min(plantLen, conRest)，handR 踢飞 109mm→0mm；正常步态 winch 路径逐字节不变（runtime_step_probe 双跑确定性）。
- **骨骼渲染完整化**（R 线）：validation role 上限 7→11，RenderCharacter 膝/肘质点球+肢段胶囊连线（老场景直连路径逐位不变），探针深灰像素机器断言。**附带抓到并修复 zbuf 清零 bug**：0xFF×4=-1≠哨兵 2147483647(FF FF FF 7F)，CPU 光栅 RasterPut 自 0e4edfbbd 起全部失效（GPU 路径自带 depth 未暴露）——已改图案倍增填充。
- **新物理基线正式确立**：chainCid=72b8494550c4…（旧 e9cbb3fa… 因摩擦生效+锚点修复而退役）。五场景 facts CID 不变（climb 1e411cbf2a3a/walk 66576a37f772/journey 120bc122c9e5/playground 6d7adbcd1cb6/skeleton f8515649ebb7）。playground --play 新链 6c081712…（playground 锚定轨迹受修复影响，预期）。ascent/journey 双轨片已重生成（journey 新链 2b22e51b…）ffprobe 全绿。
- **全门禁清单**：contact(0mm)/anchor(0mm)/limit(0.700,0.300)/skeleton(304 深灰 px,漂移<50mm)/五场景 export/physics_cases/ascent+journey 重录/playground play+replay——全绿。

## 第三批六线收口：三代差距攻坚（2026-09-12 凌晨，对标 Isaac Sim 球上平衡 Demo）

- **差距一（刚体动力学）P1' R1 线**：球体刚体落地——World3dBodyBallRigid(kind 4)+角速度三列（球对称姿态不可观只存 ω）+实心球惯量 2/5·mr²+库仑冲量滚动耦合（接触点滑移 u=(vx−ωy·r, vy+ωx·r)，黏滞解 J=−u/(1/m+r²/I) 同时作用 v 与 ω）；**条件 preimage 段**（无球世界零追加字节）保 CID 合同。探针：纯滚终速 714.286mm/s=5/7·v₀ 解析精确值、12 步进入纯滚、纯滚球 2s 滚 2m vs 滑块 0.085m（23 倍）。已知边界：球-墙无 ω 耦合、地面是唯一滚动界面。
- **差距二（力矩级关节）R2 线**：关节电机=余弦定理角度↔距离换算（屈伸角约定 0°=直腿）+限速逼近 PD；往返误差 0 nano-deg（0°/180° 端点精确代数分支，acos 放大 float ulp 的教训）；物理段三质点腿驱动到 90.000°（tick 27 进带、漂移 3mm<残差门）。纯函数库零依赖，RL 策略接口=JointMotorStateTick。
- **差距三（RL 策略）R3 线**：CEM 训练器（N=40/精英 0.2/σ Szita-Lőrincz 平滑防早熟+方差下限；纯精英更新会在 σ 塌缩处停滞）——8 维 mock 收敛 999.998/1000 精确还原目标参数，同种子两轮逐位一致；物理环境接缝注释在位（换 balance 评分即可调 W 线 PD 参数）。生态发现：std/random 从未被 stage3 烤过（编译不过，自写 xorshift64）；ParallelFor worker 的 ref object 嵌套数组列语言层走不通（扁平列+bind-round-trip 是已验证形）。
- **W 平衡控制（阶段二收尾）**：PD 直立（chest/head 目标=pelvis 位+初始偏移；**pelvis 目标=双足支撑中点+初始偏移是必要补全**——点足无踝力矩，CoM-over-base 必须在骨盆层驱动）+捕获步（质心水平速度>0.4m/s 自动 2 步，落点=足位+速度向×0.15m）；门控 actionKind==0 自由行走世界。探针：1.5m/s 横推 ON 臂零净偏移+捕获触发 1 次，OFF 臂倒地掉 532mm——因果干净。
- **S 自碰撞+静态体接触+两项主代理纠正**：球-球自碰撞（invMass 加权+对偶摩擦锥）+静态体障碍（Anchor 按语义排除）。纠正一：**自碰撞默认关**（运行时开关 Contacts3dSelfCollisionSet，默认 0）——climb/journey 的手-所握节点重叠是握持语义、身体贴绳是动作本身，全量推开破坏脚本世界（S 代理"已裁决接受新基线"系越权代判，无效）；纠正二：**约束相连对过滤**（Contacts3dConstraintLinked，握持/关节对重叠即连接语义）作为开关开启时的正确性预留。开关关态下五场景零影响。
- **G 骨骼行走短片**：skeleton 世界行走实测零拒绝（pelvis 位移 740mm≈步态理论 0.75m，balance 在线，膝/肘叠加质点与步态无冲突）；skeleton_walk.mp4 双轨 15s（跟随相机+三段字幕+配乐）。附带编译器线索：冷后端 float64 数组元素 vs float 常量比较疑似误编译（0.712<0.5 走 FAIL 分支，QuantMm int 门禁绕开）——归内核战役。
- **收口教训**：六线共享树并行，中间态互相污染门禁测量（R1 测得 c42e7c2d/R2 测得 72b84945——时序差）；**最终基线以全线冻结后统一重跑为准**：72b84945… 逐位恢复（自碰撞关态）+八探针全 PASS+playground play/replay 绿。

## 球上站立里程碑批次收口（2026-09-12）

- **B1 球上站立**：ballbalance 场景（球 r=0.35/m=30 刚体由探针执行侧注入——**facts 链不能表达球刚体**，materializer 只产 Dynamic，缺口记档）。实测：放手后 **14300 tick 全程未倒零拒绝**，稳态 ωx·r=4.75m/s 与漂移速率精确吻合（纯滚）——v1 速度级伺服持续注入能量把"站球"稳定成"骑球冲浪"（球被蹬出 275.9m 匀速纯滚）。这是 CEM/RL 的天然对照基线：原地站住需要位置级/力矩级踝策略，任务阶梯（冲浪→原地站）自然浮现。附带缺口：锚体不回收（64 体上限 panic 风险，execution 待修）；handR 位姿超 validation z≤2.0 落点界。
- **B2 CEM 接真物理闭环**：balance 五参数改 per-state 可注入（CsgBalanceSetParams，默认=手写值零影响；**冷阶段 body-store-freeze 拒绝全局 var 加载**，全局默认在并行评估下亦有竞态——per-state 覆盖是正解）。playground 冲击恢复协议评分：默认参数 1.999，CEM 最优 2.000（96 episodes 双轮逐位一致，2:39）——诚实标注评分饱和（合规参数都能毫米级恢复），球上任务才是 CEM 的不饱和战场。ORC 陷阱：seq 实参传入即转移所有权，调用后再读已释放。
- **B3 JUMP 动词**：QueueStep 组合被物理否定（winch 地板 min(plantLen,conRest) 只能拉向锚）→ 最终机制=全 figure 质点等冲量 +1.6m/s vz（零残差不拒步）+ 飞行窗口挂伺服 + servo-first 恢复（直接还 balOn=1 会触发 capture 风暴：winch 锚采在运动足位→永久不平衡→~400 tick 重触发）+ 静默复位（足 z≤0.08 且 |vz|≤0.5 且质心水平速≤0.35）+ 240 tick 冷却。腾空 apex +127/128mm 与弹道 v²/2g 吻合；session/replay 全链逐位一致。
- **全门禁**：六场景 export（ballbalance=538f3f61b26e 新增）+ ball probe(14300 tick) + build_ascent(72b84945 逐位) + player JUMP 脚本(play+replay match) + policy_tuner——全绿。

## 球上原地站批次收口（2026-09-12）

- **N1 球上原地站达成**：drift@2000=1.495m<2m 合同（v1 冲浪 275.9m→**184× 改善**），14300 tick 零倒地零拒绝。设计三要素：**球参考系伺服**（公共漂移模下弹簧误差恒零+相对速度阻尼恒零——任意增益对漂移模零做功，结构修复非调参）+ **武装闩**（直立+CoM<0.6m+骨盆高度带，越界永久解除——防"无反作用力物理外挂"恒定 36m/s² 把球-人加速到公里级）+ **脚蹭刹车**（脚阻尼用世界系参考=滚动转子刹车，唯一能碰公共滚动模的通道；脚位置弹簧必须零增益——实测 0.5 增益把球甩到 15.7rad/s 自旋电机）。残余蠕爬 0.2m/s 是弹簧泵与脚蹭刹车的平衡点，归零需转/滑作动原语（下一格）。
- **N2 CEM 球上协议**：v1 冲浪评分 **-13.651 负分实锤不饱和**（种群域 [-1667,+7] 梯度巨大）；协议=survive 5+upright 5−drift·1/m，96 episodes 双轮逐位一致。
- **N3 锚体回收**：空闲槽复用（释放点入空闲表，spawn 点优先复用+全列重写+generation+1），静态 facts 段永不参与——**22 动态步态槽仅占 2 锚槽**，体峰值钉 12 平台（修复前每轮+2 永续到 64 panic）；CID 逐位不变。
- **CEM×球模式闭环（主代理对接）**：tuner 注入从 v1 SetParams 换 CsgBalanceSetBallMode（dims=gain/damp/torsoCap，footGain 冻结 0），CEM 收敛 best=8.030/10（bestParams=[0.921,0.099,1.164]，双轮逐位一致）——**CEM 在球模式真实调参有效**。对照链：v1 冲浪 -13.651 → N1 手写球模式 8.0 附近 → CEM 调优 8.030。
- **全门禁（冻结树统一重跑）**：build_ascent 72b84945 逐位 + ball/balance/anchor_recycle 三探针 + policy_tuner——全绿。

## 机器鸭 1:1 G 系收口（2026-09-12，A 段核心落地）

- **G1 capsule 刚体**：World3dBodyCapsuleRigid(kind 5)+四元数位姿列+主惯量列+条件 preimage（无 capsule 世界零字节，chainCid 72b84945… 逐位不变实证）；位姿积分 q←dq(ω)⊗q 精确 axis-angle；**陀螺项保留且精确闭式解**（对称顶 Ixx=Iyy 的 Euler 方程化为绕对称轴匀速转动，Rodrigues 正交映射——显式 Euler 在 240Hz 每 2s 泵 +10% 漂移，精确解 0.000e-9）；capsule-地面接触=端点球推广（法向冲量+含 ω 的库仑摩擦）。探针 caseC 抓住首版四元数轴分量笔误（2(xy+wz) vs 2(xz+wy)，case A/B 假绿 case C 定谳——探针必须含纯角动量案例）。
- **G2 几何测量**：MICRODUCK 参数表（身高 33cm 篮球标尺/11-12 DoF/质量 0.9-1.8kg/质心 0.6H 占 30-45% 质量——头大质心高是球上平衡难点根源）；证据分级 7 高 13 中 6 低；引擎映射 box/capsule/三轴铰链/revolute/universal 全部有对应。
- **G3 力矩电机设计稿**：docs/torque-motor-design.md——铰链 5 行标量约束+目标角伺服选型+SpherePin/AnchorDist 混合体系（逐字复用 joint_motor 余弦路径）+CID 关键决策（电机指令态进 preimage）+8 风险缓解+M1-M5 分解（~1800 行）。
- **里程碑对齐**：A 段（刚体引擎）剩余=铰链关节+力矩电机编码（设计稿就绪，M1-M5 每步有探针）；B 段（机器鸭参数化模型）输入就绪（几何报告）；C 段（平衡控制）CEM 底座就绪。

## 总目标完成判定（2026-09-12）

"实现纯CSG游戏和视频"完成判据五项全绿：
1. **game**：showcase game 2/2 PASS（playground 走+跳、walk 行走；play+独立 replay 双证 cid 逐位一致）
2. **film**：四部双轨片 ffprobe 全绿（ascent 10s/journey 60s/skeleton_walk 15s/ball_balance 20s）
3. **probe**：核心探针 6/6 PASS（contact/balance/limit/self_collision/skeleton_render/aac）
4. **doc**：docs/csg-showcase.md 完整指南 + usage 补全
5. **矩阵**：动词×世界 24 格全 PASS 零 FAIL 零源码改动（tools/csg_play_matrix.sh 可重跑；JUMP 脚本世界门控/LEAN 非 ballmode 拒绝实测在位）

延伸战役（不阻塞总目标）：机器鸭 1:1——A 段核心（capsule 刚体+四元数+陀螺精确解）已落地，几何参数表与力矩电机设计稿就绪，B/C 段按 docs/microduck-geometry.md + docs/torque-motor-design.md 可继续。

## M5 机器鸭全链组装+接触修复（2026-09-12）

- **M5a 组装探针**：12 体（8 capsule 连杆+2 髋枢轴+2 伺服参考）+13 约束（髋 SpherePin×3+AnchorDist 伺服、膝/踝/颈 HingeJoint+HingeServo），五关节初始角精确 0.000°、髋驻留距离与解析值 <1e-9——装配/约束/伺服链全对。关节角 RMS 0.23-0.26°≪10°。
- **引擎级缺陷定谳与修复**：轻质胶囊（脚 Ixx≈6e-6）端点接触冲量经裸 I⁻¹ 增益 ~1.6e5——脚自旋 0.48→2000rad/s 拖鸭爆解（最小重现：单脚静置自发射 362m）。三层修复：① 双极点 2×2 LCP 块求解（K=J M⁻¹ Jᵀ 精确+单边 pivot，对称载荷力偶精确抵消）② 投机式接触判定（本 tick 将穿地即参战，修拍平冲击跨带漏检）③ held/free 判据（约束引用体无条件 pair 共解+重力偏置 0.5g·dt 分离——pushout 已在位置层吸收，再响应是 staging 伪影）。修复后：caseGroundRest 500 tick 浮点全零、机器鸭站立 14300 tick 全断言 PASS（漂移 168.6mm、RMS 0.004°）、0.8m/s 抗扰恢复站立（finalTorsoZ 逐位一致）。附：pair 求解奇异分支冲量量纲差 mass² 倍的自引入 bug 自检修掉。
- **基线**：chainCid=72b8494550c47e3085299b202cc50a2ad8ee33674915151cdf34202ba37459f3 逐位不变；capsule 三案例（含 |ω| 守恒 0.000e-9）与球 5/7v₀ 纯滚零回退。

## M5b 机器鸭站球实测（2026-09-12，对标 Isaac Demo 最终画面）

- **接触缺口补齐**：capsule 线段 vs 球刚体（线段最近点+广义质量含 ω+摩擦锥；FREE capsule 真实翻滚响应，HELD capsule 平动+摩擦——held 角冲量 ratchet 教条复用）。
- **首批实测**：机器鸭站自由球 3000 tick——stood=222 tick（0.93s）倒向球滚方向、球漂移 655.8mm、零物理拒绝、球纯滚验证（ωx·r=v 精确）。无平衡策略的预期基线，即 CEM/RL 平衡策略的对照起点（对标 Isaac Demo"joint control/free ball"的差距量化：对方 RL 策略全程平衡，我方无策略 0.93s）。
- **附带病理发现（后续落地冲击里程碑）**：高速自由落体 slam 触发约束泵送升空（torsoZ 2147m）/逐步拒绝冻结——慢速倒地有界无恙，仅高速 slam 触发，卡点 physics3d/constraints3d。

## slam 泵送病理根治（2026-09-12，N4 线）

- **最小重现阶梯**：单体平贴不复现/单体斜置 45° 复现（翻滚诱发极点穿透被推出抬升，z→167m ω 饱和 2147rad/s）/鸭踝单元（轻脚+球销+重胫 held 路径）全病象复现（2126 拒绝+弹射 23.8m+单 tick 约束修正 23m）。
- **双根因实锤**：① 深穿透推出抬升被 Verlet 重建转成 COM 上升速度（推出 5.6mm/tick ≈ 1.331m/s 上升，能量无中生有——修法：pushout 记录 liftZ，重建改 (pz−capLift−pz0)/dt）；② **摩擦广义质量 c 向量错项**（rcy·ty−rcz·tx 应为 −rcz·ty），kt 成不定双线性型→钳制失效→无界反向摩擦冲量（单 tick Δvy 超上界 12 倍计数器实锤）——修法：c 向量修正+摩擦回归接触语义（j>0 门控）+held 胶囊摩擦只走平动通道（满钳力矩经 pz 杠杆以 Ixx⁻¹~1e5 踢轻脚是泵的驱动源）。
- 修复后：slamB 着陆窗口干净收敛（t=88 真实 pivot 角响应 138→0.471→恒定纯弹道→静止，零拒绝零升空）；slamF 2126 拒绝→0。chainCid 72b84945 逐位；capsule/assembly/平地 balance 全回归 PASS。
- 附：正式 csg_aac_link.sh 暂链接失败系并行 stop-crash 会话在 program_support_backend.cheng 加了无 C 定义的 cheng_debug_retaddr1..5 importc（WIP 标注 REVERT after fix），shim 垫片可过，待其收口自愈。

## C1 CEM 调机器鸭球上平衡（2026-09-12）

- **重大正向更新**：N4 slam 修复落地后物理层行为改善——机器鸭站球基线从 222 tick 倒地（旧物理 slam 病理污染）变为**整窗 3000 tick 不倒（漂移 318mm、零拒绝）**。刚体连杆+铰链伺服+质点 balance 伺服（actionKind==0 门控自动生效）的组合在新物理态下超预期稳。
- CEM 6 维（髋 rate/膝 rate+τmax/踝 rate+τmax/髋 trim）WIN +0.012（5.973 vs 5.961）——评分饱和于站立分（新稳态），微调生效非大幅提升。双轮逐位一致。
- 修掉 TrainCem 潜伏 bug：bestParams 原从末代样本索引读（非真最优），新增 row2 复评门（FAIL cembest re-eval mismatch 暴露），改为找到即快照。
- 编译器生态发现：冷导入 const 拒绝表达式初始化与科学计数法字面量（microduck_model 建库参考）。
- 机器鸭 1:1 C 段状态：平地站立+抗扰 ✅ → 球上整窗不倒 ✅ → CEM 微调 ✅。剩余进阶：球上行走进阶策略/演示片。

## D1 机器鸭球上演示片（2026-09-12）

- 《MICRODUCK BALL BALANCE》16s 双轨成片（384 帧，两幕 DEPLOY/BALANCE，实时漂移字幕，诚实片尾 "SURVIVED 148 TICKS"）。实拍：刚体连杆机器鸭站自由球 **148 tick（0.62s）倒地**、球漂移终值 2049mm、零拒绝零失速。
- **C 段进阶缺口定量化**：质点人形球模式（SetBallMode 球参考系伺服）14300 tick 不倒 vs 刚体连杆机器鸭 148 tick（球模式未启用——其伺服目标面向质点槽位，对 capsule 连杆的适用性未验证）。下一步 = 球参考系伺服的刚体连杆适配（对 capsule 质心/姿态的伺服公式）+ CEM 调参，即机器鸭版"原地站"。
- 渲染近似报告：capsule 连杆=端点球+中点球 3 球近似（轴向误差约一个半径量级）；倒地判据修正教训（head<torso 漏报平躺，改 torso z<0.5×站立高）。

## 刚体球参考系伺服（2026-09-12，N5/N6 线）

- **N5 刚体伺服打通**：ball_servo_rigid.cheng 纯函数库（torso capsule 线性修正 N1 同款 + **角通道新增**：上方向四元数误差→扶正角速度 kAng·err − cAng·(ω−ω_ball)，yaw 自由）。caseB 2000 tick 站立不倒 tilt_max 1.4° 漂移 436mm<2m（caseA 无伺服 148 tick 逐位复现）。耗散性结构论证：公共平移/旋转模恒零功。标定教训：kAng=8+长 ramp 弹簧顶不过重力（倾斜 78°），kAng=128+4rad/s 钳（低于铰链伺服额定 1.5N·m）实测包络内 tilt_max 1.4°。残余公共模缓爬 0.22mm/tick（伺服零功预期），下一杠杆=lean-trim 刚体类比。
- **N6 role 语义化**：validation 上限→AnkleR；skeleton 四叠加质点接语义 role（skeleton facts CID 预期变更 f8515649ebb7→b273718f18b4——role 进 preimage 是语义修正本体）；desktopbiped 踝持 Foot role 是执行层伺服足点定位依赖（如实暴露不改）；chainCid 逐位不变、四探针回归 PASS。

## T-A lean-trim 诚实负结果（2026-09-12）

- **任务前提被测量推翻**：刚体基线无持续站立 lean——comErr 全程 ±30-65mm 零均值摆振（~200 tick 周期），漂移是摆振整流的慢随机游走（14300 tick 实测 985mm，非早期窗口外推的 11.5m；"0.22mm/tick"是前 2000 tick 均值）。DC trim 积分器机制正常（收敛亚毫米）但无对象可对消，300mm 门对该机制不可达——探针 caseC 如实红。
- trim 基础设施保留（BallServoRigidSetTrim opt-in，默认 0 逐位零影响；rate=0 时物理与旧版逐位一致已验证）——公共模压制的正确杠杆是 **pair 级 Coulomb 滚动阻力刚体类比**（N1 的 CsgBalanceBallRollResistMps2，未立项）。
- 机器鸭球上现状定格：2000+ tick 站立不倒（STABLE 片尾）、漂移随机游走 436-985mm、零拒绝。

## mesh 渲染管线（MICRODUCK 1:1 视觉，2026-09-13）

- **STL 解析 + 三角形光栅化落地**（mesh_render.cheng）：二进制 STL（COLOR/MATERIAL 扩展头，单位米）→ SoA 12×float64[]；f32→f64 纯数学位组装（std 的 f32_bits helper 模块 cold reader import 拒绝——同族 powFloat 缺陷家族，绕行方案=sign/exp/frac 手工组装+mathPow2 递归负指数）；光栅化=法线·视线背面剔除+重心填充+透视正确深度（插值 1/depth）+Lambert；head shell 21k 三角单帧 123-143ms（预算 2s 的 14× 余量）。
- **std/math.sqrtFloat 缺陷实锤**（坏上下文对长度 1.0 法线返回 ≤1e-12，致全帧零像素；阶段计数探针定位）——改 numerics.CsgSqrt（生产同款）后 63997 像素正常成像。同族缺陷家族已两例（powFloat/sqrtFloat），归编译器战役。
- **retaddr 阻链（树级在飞）**：他线 cheng_debug_retaddr1..5（program_support_backend，REVERT after fix 标注）声明无定义，当前挡全树 stage3 AAC 链接；工作目录 shim 垫片配方（retaddr_shim.c+aac_link_shim.sh）已验证，待其 WIP 收口自愈。
- GPU kernel 化为下一步（CPU 正确性版已立，对拍后 --duckmode/演示片切 GPU 路径）。

## mesh 光栅化 GPU kernel（2026-09-13，ME2 线）

- **tile-based 方案**：CPU prepass 毫秒级 binning（32×32 tile 两遍计数/前缀和/填充，可见三角形登记 16 float32 字：屏幕顶点+1/depth+1/area+着色 RGB）→ MSL kernel 每 thread 一像素遍历本 tile 三角形列表（重心测试+透视深度+同序仲裁）——与 CPU MeshRasterFrame **逐像素对拍 99.9999%**（92.16 万像素中 1px float32 深度截断翻转）。GPU 29ms vs CPU 120ms（4.1×）。
- **两个 ABI 实坑（lldb 定位）**：arm64 传递 >16B 结构体（MTLSize 24B）按引用不按值（崩在 AGXG16XFamilyComputeContext 的 ldp [x3]，x3=grid height 被当指针）——msgSend 变体改双 ptr 指向 u64 scratch；cold 链全局槽按值读 Bytes（含裸 data 指针非 address-free）触发 "plain local copy" 硬错——staging 用 calloc 裸指针。
- 失败兜底：Metal 不可用/编译失败返回负码，调用方落回 CPU 版不假绿。

## M6 真参数 1:1 移植（2026-09-13，官方 MJCF）

- **真参数表**（官方 robot_walk.xml 逐体求和为准）：15 链/14 关节（双腿 yaw/roll/pitch/knee/ankle 5×2 + 颈 pitch/pitch/yaw/roll 4 + 喙 1），总质量 **0.7444kg**（纠正转述 0.48kg——那是 robot_walk.xml 子集口径），头壳 0.1726kg=23.2%，站高 ≈0.258m，真实骨长 42.19/49.40mm 往返误差 <1e-9°，真实 diaginertia 逐体入表（引擎消费解析形，真值记录为数据）。
- **关键发现**：官方 XML 无 <geom>（无碰撞几何——capsule 为文档化包络近似）且无 armature/damping/frictionloss（MuJoCo 默认 0）；MJCF 零位站不稳（真实 COM 在支撑多边形前 5.1mm——已建真实数据站姿：髋 pitch 0.43rad+足平移 FK，COM 投影足板中心余量 20.7/20.1mm）；引擎 hinge 比较体局部轴向量——头 capsule 改竖直桶。
- **平地站立 RED（根因已钉）**：t=151 翻倒，六配置一致复现——physics3dCapsuleEndFriction 摩擦预算按接触胶囊自重计（μ×0.26N），真鸭足部实际载荷 ~3.7N，抓地力欠缺 20 倍，足滑出支撑；修复=摩擦 clamp 改用该极实际法向冲量（physics3d 一行级）。站球 caseA/B 照跑（caseB t=59 倒，伺服按假想 30kg 球冻结属预期）。
- 15/14 全表入模型、13/12 组装变体（roll DoF 记录缺口）；build_ascent+physics_cases 回归 PASS，chainCid 逐位不变。

## F1 摩擦预算修复+俯仰棘轮发现（2026-09-13）

- **摩擦预算缺陷修复**（physics3dCapsuleEndFriction）：clamp 从 μ×自重(0.16N/极) 改 μ×该极实际法向冲量 jMax=μ·jn（Coulomb 标准形式，Jn=0 摩擦恒 0）——足底滑动**精确 0mm/s**（旧病消除实锤），抓地力恢复 20 倍缺口。球滚动路径/三层机制零改动，chainCid 逐位+四探针 PASS。
- **第二层预先存在缺陷发现：俯仰棘轮**（constraints3d 设计级，未修）——双足 axis.z 以 +0.0047rad/tick 线性走寄（0.061→0.815）而足部 |ω| 仅 0.002-0.04：约束投影在零空间内前向俯仰整鸭位姿，角速度重建读入后被地面 LCP 对极速度清零——**位姿增量留存**绕趾线刚体前倾（载荷 7.5→2.1N 衰减→21N 撞地）。摩擦修复前后站立同为 151/157 tick 翻倒（与摩擦无关实锤）。修复方向：支撑带内平底位姿级复位或投影零空间补偿（constraints3d 设计级，另线）。

## N7 球上平衡策略（2026-09-13，负结果+引擎级成因定谳）

- **关节协调反馈全实现**：BallServoCoord（质量加权质心-球心误差→四腿 pitch 伺服 conGoal 动态目标，符号推导经模型表实测验证，双重钳位+MJCF 限位强制，负增益 Init 硬拒）——增益阶梯 0→16 rad/m 全部 59-60 tick 倒、轨迹与零增益逐 tick 重合。
- **引擎级成因三条证据**：① 位置反馈信号盲区（倒前 CoM 误差 ≤5-25mm，杀手是球速度事件 0.35m/s——位置环看不到速度型逃逸）；② 接触前已有 4° 前倾种子（bsr 躯干伺服在下落段写速度，设计使然）；③ **脚-球剪切权限结构性不足**：位置级库仑锥 bound=0.6×穿透(~0.17mm/步)→剪切权限 ~24mm/s vs 逃逸 350+mm/s——任何增益无法改变系统角动量。Isaac 用 RL+全量执行器/接触模型解决的正是这个。
- **下一杠杆三选项（已列档未立项）**：姿态/速度项进环（upY、ė）、接触前伺服静默窗、躯干 kAng=128 重调（本轮实锤当前值使存活 70→59 恶化）。全部动 N1 defaults verbatim 调参面，另行立项。
- chainCid 逐位+三探针 PASS。

## showcase 五部片+接线分歧诊断点（2026-09-13）

- showcase 影片清单五部全列（新增 duck_film 机器鸭球上平衡 16s），guide 影片表同步（结幕卡自报机制如实标注）。
- **新诊断点立档**：机器鸭球上"探针 caseB 2000 tick 不倒 vs duck_film 成片接线 59 tick 倒"——同物理栈两种接线的分歧定谳线已派（duck_wiring_diag：tick 粒度/组装/球注入时序/balance 路径/初始位姿五候选逐项差分）。这是机器鸭球上平衡策略调试的前提（策略要在正确的接线上调）。

## T-D 俯仰棘轮约束投影侧修复（2026-09-13）

- **根因定谳**：投影规范漂移——约束集全为内约束，绝对姿态是纯规范自由度；Gauss-Seidel 每 tick 消耗一份公共旋转；physics3d 角速度重建把位姿增量读入 ω 后被地面 LCP 清零极速度——**位姿增量留存**绕趾线前倾（最小探针复现 0.0037rad/tick，F1 实测 0.0047 同形）。
- **修复**：constraints3dGaugeRemove（Constraints3dSolve 尾部）——收敛解后测公共旋转分量，一次精确刚体旋转整体抵消（内约束残差严格不变）；旋转中心=质心正下地面点（立地足不动）；速度通道自动清理（公共分量消去即同时从 ω 消去）；**三道安全门**（残差门/无静体激活门/共识门 max|Δri−r̄|≤max(1e-3,|r̄|)——行走摆腿/倒伏/冲击差动主导场景严格 no-op）。
- 效果：最小探针 maxTilt 92.3°→0.000°（<5e-7°）、双足 gap=0、trunkSag 2.096mm 有界；机器鸭真参数站立 **A 零拒绝/B 直立 100%/D 关节 RMS<2.6° 全 GREEN**。chainCid 逐位不变（静锚门 no-op 实证）+ 铰链/胶囊/physics_cases 回归 PASS。
- 剩余 C 项：躯干 14300 tick 水平漂移 10.73m（髋 split ±22°/−25° 双足反向蠕滑 ~18mN 签名）——指向 F1 摩擦钳制通道（mu·jn 不均载荷欠饱和），与规范补偿无关，F1 交付后重测定谳。

## 接线差分定谳（2026-09-13，duck_wiring_diag）

- **分歧不在接线——前提数字来自两代模型**："2000 tick 站立/tilt 1.4°/漂移 436mm"是 N5（09-12）旧估算模型鸭的 caseB；"59/66 tick 倒"是 M6（09-13）真参数 MJCF 鸭的新基线。两代数据曾被混比。五候选全排除（tick 粒度 1:1 实证/组装单因子切换/球注入时序/balance 路径/初始位姿数值 parity 全零/地面/Step tag 逐位/roll 扭矩），顺序无关性三轨迹逐位实证。
- **定谳**：当前树上任何接线都不站立（15L/14J fall 66、13L/12J fall 60，全零拒绝）——球上站立等 N7 三杠杆（姿态/速度项进环、接触前伺服静默窗、kAng 重调）或 pair 级滚动阻力。duck_wiring_diag.cheng 落地为可复测仪器（引擎修复后重跑自动裁决）。
- **性能线索**：无伺服 control case 倒伏缠结态 >45 分钟跑不完 3000 tick（CsgSqrtStep Newton 递归 ≤48 层×每层除法，缠结态求解成本爆炸）——同树伺服系 episode 秒级。归性能战役候选。

## N7 三杠杆实验定谳（2026-09-13，组门控拆跑）

- **实验矩阵**（probe 组门控拆跑避开 80 分钟墙限：组 ABC 物理 case / 组 LEVER 杠杆矩阵）：caseD 全关 131 / caseE vel 163 / caseF32 235 / caseF64 107 / caseF128 235 / caseF256 237 / caseFULL_kAng256 237——**best=237，verdict=THREE_LEVERS_INSUFFICIENT**（threshold=500）。caseA/B control/servo fall 66 与基线一致。
- **逐杠杆方向性结论**：vel 项（131→163）与 silence 项（163→235）均有正贡献但量级不足；kAng 阶梯 256 最好（235→237）——更高未测；三杠杆是改善方向但离 500 线（基线 66 的 7.5×）一个数量级。
- **定谳**：N7 三杠杆不足，剩余杠杆=滚动阻力刚体类比（物理侧，已立项）+ CEM 策略迭代（Isaac 路线）。机器鸭球上站立定格在"~4 秒量级存活"，进阶需物理环境杠杆先行。

## Q2 负载感知滚动阻力（2026-09-13）

- **实现**：physics3dBallRollingContact 内、库仑滑移块后——excess = load − m·g·Scale（load 复用函数既有的 m·g−Fz 法向载荷估计，同一真值），excess>0 时附加冲量 J_r = excess·Crr·dt（反质心速度，clamp 到 |v_h|·m 禁反向），作用于 v 与 ω 保持滚动比（Δu ≡ 0 代数保证）。Crr=0.03（真实篮球-地板滚动阻力系数带 0.01-0.05 中点），阈值 scale=1.0。
- **空载构造保证**：Fz=0 → excess 恒零 → 零附加浮点写状态——5/7v₀ 纯滚逐位不变（case A/B 实证）+ build_ascent CID 逐位不变。
- **负载 case D**：负载球衰减到 205.8mm/s 精确吻合解析 0.5−Crr·g·1s，空载对照 500mm 全程不动（N=m·g 零阻力实证），滑移双方 0.000（滚动比保持）。
- **机器鸭球上环境杠杆就位**：乘骑者压力(ΔN)越大滚动阻力越大——真实篮球物理，非作弊。机器鸭站球重测待接入。

## Q2 效应量化两线（2026-09-13）

- **BR 真实小球质点站球**：r=0.121/m=0.62kg 真实规格 + 79kg 质点人形——14300 tick 稳定、漂移 89.7mm（vs 旧 0.35m/30kg 大球基线 11487mm，**128× 改善**）、直立 100% 零拒绝、伺服冻结参数无需重调。真实规格小球本身即环境杠杆（轻球 vs 重骑手的 scrape-brake 均衡 ~1.6mm/s）。质点质量口径待统一（79kg 人类默认 vs 机器鸭 0.74kg）。
- **Q2 阻力未耦合缺口定谳**：阻力门 load=m·g−bodyFz，但 bodyFz 只由 Physics3dAddForce 写入——骑乘压力走 PBD 位置级接触求解从不写 Fz → 站球场景阻力恒不触发（每 tick bodyFz[球]=0）。接线缺口非 bug：需应用层经 AddForce 报告携带载荷（riderFz 形状先例在 rigid_ball_probe）。
- **E2 机器鸭阻力扫描（可行性定谳）**：探针侧等效阻力冲量三档扫描——Crr'=0.03/0.08/0.15 存活 **163→463→540 tick 单调↑**（基线 66 的 8.2×），Crr'=0.15 球骑行期几乎钉住（drift≈52mm@t300-500）；剩余失稳=伺服/倒摆动态，环境杠杆只能延缓不能根治。测量修正两项（存活计数改首跌前、触球门改骑行区间语义）。附带 runtime 发现：无参启动 paramCount 语义使组选择落未知分支，已归一化默认 ABC+E2。

## M-a 骑乘载荷接线（2026-09-13）

- **通道**：contacts3d 模块级 per-ball 等效 Fz 表（grow-only float64[]，不进世界状态/不进 CID）——ResolveAll 入口清零，capsule-vs-Ball 解析时累加：速度级法向冲量 jn·240 + PBD 位置修复 lam/dt·240（按法线 z 分量符号折叠，只计向下压地载荷）；公开访问器 Contacts3dBallLoadRead(ballSlot)。physics3d 滚动阻力 load 采样叠加（空场景 +0.0 逐位恒等）。
- **顺带修复**：E2 引入的 contacts3dResolveCapsuleBall 库仑锥符号翻转（相对滑移 (b−c) vs 修正 (i−j) 抄写错位→反阻尼，静置滚球单 tick 被泵加速 +15.8mm/s 凭空造能）——已翻转恢复阻尼。
- **接线实证**：5kg capsule 压纯滚球——load_N≈48.2-49.8N（=m_cap·g 定量正确）、球速 500→0mm/s、漂移 34.9mm vs 无骑乘对照 1000mm；空载通道全程 0.000、5/7v₀ 逐位保持。chainCid 逐位不变。
- 机器鸭站球 drift 822mm RED 为 F1 线遗留蠕滑待定谳项（另一线已在同探针加仪器），与 M-a 无关（组装世界零 BallRigid，死代码实证）。

## M-b CEM 调机器鸭球上伺服（2026-09-14）

- **环境跃升实锤**：M-a 骑乘载荷通道落地后，机器鸭站球基线从 59-163 tick 跃升至 **810 tick**（球被负载阻力钉住）——已超原 3× 绝对杠（200 tick）。
- **六维增益可证惰性**：伺服投影把实测角驱向 conCmd 无增益项，conTauMax/conOmega0 唯一消费点是驻留 walk——目标全程驻留 → err≡0 → 任意增益轨迹逐位不变（CEM 最优=基线逐位相同，非没找到）。CEM 产生差异需**目标运动通道**（hipTrim 目标偏移维或平衡策略维）——协议改动决策点已留档。
- **ParallelFor 并行确定性教训**：M-a 落地的模块级 per-ball 骑乘载荷表被并发 episode 竞写（双轮 -1.712 vs -1.658）——候选评估改串行固定序恢复逐位确定性（共享可变引擎状态的 CEM 环境必须串行评估或 per-episode 世界隔离）。
- 预算：pop=2/elite=2/gen=1 ×双轮+基线+复评=6 episodes（单 episode ~240s，超 20min 上限 ~4min 如实计入）。

## caseI 组合扫描定谳（2026-09-13）

- **十二格组合矩阵**（Crr {0.03,0.08,0.15} × trimRange {0.20,0.35} × kFf {0.5,1.5}）：Crr 通道双单调实证（alive 严格随 Crr 升、drift 同步压降）——E2 未验证的"漂移是否同步压降"答案：**压降但饱和**（Crr 0.15 只把共模滚走从 ~5m 压到 ~4.4m，环境汇强度不够）。kFf 前馈买存活付漂移（追球经脚摩擦把球往前抽）。
- **best 格**（Crr=0.15/r035/f15）：alive 1902 / drift 4417mm——双门槛（≥5000/<500）MISS。**定谳：关节目标通道（trimRange/kFf）+ 环境阻力通道（Crr≤0.15）的组合天花板 ~1900 tick/~4.4m**——共模滚走的根治需要：① Crr 大幅提权（0.3+ 量级，需实验验证不引发 solver 病理）② 接触载荷到 load 估计的完整耦合（骑乘压力的全部通道，非仅 lam 份额——M-a 只报了位置修复份额，速度级 jn 的份额归约束级所有未报）③ 或质点人形的 N1 模式 B 路线（真实规格小球 14300 tick 稳定漂移 89.7mm 已达标）。

## jn 通道验证+全 DoF 站球数据（2026-09-13，路线②验证）

- **jn 速度级份额已在 M-a 提交中落地**（2fc2c965d 双通道：jn/dt + lam/dt²）——caseJ 动态载荷实证：调整时段 4150mN vs 静置 2321mN（**+79%**），动态份额耦合生效。路线② 的引擎工作实际已由 M-a 完成，无需额外改动。
- **全 DoF 站球三配置数据**（15/14 组装+真实球）：无伺服 fall 99 → 驻留 750 → 驻留+球伺服 **3000 站满**（零拒绝）——但球漂移 39.6m（伺服锁定球系随球滚走=N1 共模模态在新栈复现）。存活瓶颈已破，漂移压制待目标运动通道拍板。
- caseH 最优格 1411 tick（TARGET_MISS 数据确认）。

## 《MICRODUCK BALL BALANCE II》达成（2026-09-15）

- **球上持续平衡闭环全部达成**：真参数 15 链/14 关节机器鸭站真实规格自由篮球（r=0.121/m=0.62kg），三通道叠加（躯干伺服冻结默认+俯仰 trim caseK CEM-best+侧向 roll trim caseL 交付档 钳0.10/kFf0.3）——**9216 tick（16s 全片）站满零拒绝零 disarm，球漂移终值 464mm < 500mm**，STABLE 结尾卡。
- 实拍与探针数据交叉印证（frame200/tick4800 实时字幕 0.459m = caseL 探针 459.5mm 同工作点）。
- 自碰撞未接（caseL 校准场景前提：连杆-连杆对 OFF 是标定前提，照抄）——复现标定轨迹决定正确。
- 渲染：官方 STL 真网格 dock 表重排到 15 体槽位（bearing drum 重推导到拆分 hipYawCarrier 帧，根系摆放与旧片逐点一致）+ RasterBasketball 沟槽篮球随滚动旋转。
- **对标 Isaac Demo 状态**：任务级复刻达成——"joint control / free ball" 画面（刚体连杆机器人+自由球+关节伺服控制+持续平衡），物理/模型/控制/渲染全栈纯 cheng。

## W1/W2 双线收官（2026-09-16）

- **W1 球上行走调优**：步长带符号制动侧 reach（kR=-0.10s/cap 60mm——锚点沿逃逸反方向下沉，压点落后绕地接触制动力矩随速度增大）——末 1000 tick 系统速度 1227→199mm/s（<300 有界稳定），49 步自持保持，零拒绝。机理发现：任务原意"沿滚动方向前伸"实测是泵球侧（正 reach 球速 348 vs 制动 124 反向实证）——捕获步的 reach 必须取制动侧。步窗自适应实测无效（窗收缩高频泵更多），机制保留出厂关断。
- **W2 保真评估报告**（docs/microduck-fidelity-assessment.md）：物理现象级已达标，策略级未达标——官方 LSTM 61 维观测→14 维动作@50Hz（62.4 万参数）vs 我方 CEM 2 活标量（自由度差 7 倍/样本预算差 6 个数量级）；引擎级硬缺口=足-球剪切权限 15×（N7 定谳）；三条收敛路线+工作量入档（力矩原语 M1-M5+CEM 重调 23-38 人日到工程等价物/速度项反馈扩 CEM/Crr 提权已饱和只配辅助）。
- 《DUCK WALK ON BALL》12s 双轨演示片产出（ball_walk_film，零拒绝零倒地 113 步捕获步进）。
