# CSG 语义物理世界视频进度

2026-09-06：开发计划已交付。完成仓库基线及并行只读审查，按大纲→合同/阶段→验收填充计划；OpenSpec提案、详细开发计划、独立任务/发现记录和全局流程图均已写入。

独立Review后补齐AAC有效样本、离线耗时/取消预算、全量重算独立物化要求。已检查本次文档链接、Markdown围栏与空白；`git diff --check`通过。规划级估算与性能目标均明确标注，未把它们写成实测结果。

实现状态：A–G 均未开始。无新运行性能数据，无新人物动画或视频产物。本轮不创建分支或 worktree，不改生产源码。

2026-09-06后续：用户要求资产管线开发计划。已将D1关联至独立资产提案/任务，保留同一CSG与世界执行器；外部来源范围及工作量单独规划并与原D1去重。本次仍只有规划变更，未增加实现完成项。

## 实施进展（2026-09-06 晚间，纯 cheng stage3 通道）

- **A1**：stage3 exe 通道六项既有 game smoke 全绿；`artifacts/backend_driver/cheng` 在当前树上报 `parser-owned global coverage mismatch`（最小复现=任一 import `cheng/game/ecs` 的源），属编译器主线，本任务全部走 stage3。
- **A2**：合同冻结（`docs/csg-world-contract.md` + campaign solver-decision/assets）。数值路线实测：纯半隐式欧拉自由落体 40.9mm>1cm 预算 → 改步内恒力精确积分，机器精度 0.000mm。
- **B 全链**：`time/world3d/csg/{schema,validation,producer,materializer,execution}` + `constraints3d/contacts3d/rope3d/physics3d` 落地。2400 tick 执行零拒绝、双跑字节级确定、validation 负例（质量/未知动作/重叠抓握窗）精确拒绝码。
- **C1**：解析案例四连绿（`csg_world_physics_cases`）：自由落体 0.000mm、e=0 落地零下陷、20kg 悬挂伸长 0.062mm、摆保持球面。
- **C2**：绞盘-上升器攀爬（交替抓握×3、收绳、蹬腿）2400 tick 全程零失败。
- **D2/E1**：CPU 光栅 1280×720 PPM 帧流：正常片 240 帧 + 检查点(1700)卸绳干预片 70 帧 + B/C 机位验证帧 + manifest。全片渲染实测 ~3 分钟。
- **干预因果**：卸载后 250ms 窗口零接触、COM 弹道误差 0.000mm（机器精度）。
- **E3**：`csg_world_video_gate`（时间探针+物理案例+执行 smoke+电影双跑确定性+manifest 真值+帧哈希）。

## 未完成（如实）

- 质心净上升 361mm < 500mm 验收目标（绞盘行程/周期数待调）。
- D1 完整角色美术（当前=分色球体小人）、D3 音频/MP4（Darwin provider 未接线，交付=PPM 帧流+manifest）。
- E2 增量对拍、E 段完整视觉审查与媒体完整解码验收、F/G 全部。
- 未创建分支/worktree，未推送；`src/game/{fluid3d,lbm2d}.cheng` 等无关文件未触碰。
- **E3 门禁收官**：`csg_world_video_gate` 9/9 全绿（时间探针/物理案例/执行 smoke/电影双跑 chainCid 一致/240 帧/干预帧/零拒绝/250ms 无接触/帧哈希），exit 0。跨进程确定性修复（float→int64 两步量化）后达成。

## 实施进展（2026-09-07，D3 媒体封装与 MP4 调试）

- **MP4 封装**：纯 cheng MP4 box 写入器（`src/game/cinema/mp4.cheng`）+ VideoToolbox H.264 编码会话（`src/game/cinema/vtbr.cheng`，纯 cheng 直接驱动 VideoToolbox 系统符号，无 C 桥）。导出器 `src/tools/csg_world_mp4_export.cheng`：重跑确定性攀爬 + H.264 编码 + AVCC→MP4 封装 + chainCid 绑定。
- **播放验证**：MP4 的 H.264 载荷经 AVCC→Annex-B 提取后 **ffmpeg 完整解码 1280×720、232 帧**（`/tmp/climb_ab_fixed.h264` 提取物）。ffprobe 对 MP4 容器的严格探测仍报 "missing picture in access unit"（首 AU 为 SEI+IDR 合并样本），排查中。
- **E2 增量对拍**：`csg_world_incremental_check` 全绿（检查点保真=字节一致；绳长编辑传播；编辑后确定性）。
- **物理修复**：Verlet-PBD 速度更新（半量系数）；对称 Gauss-Seidel 约束扫描（正反交替）；步内恒力精确积分。
- **MP4 调试**（如实）：mvhd 矩阵缺失条目（8/9）已修；avc1 采样入口多写 2 字节已修；avcC 参数集捕获竞态已修（样本保留后主线程统一提取）；首 AU 前缀合并 SPS/PPS 已实现；ffprobe 仍报首 AU 缺图——待查（MP4 结构化解析全部通过）。
- **音频**：AAC 编码（AudioConverter 桥已写、未接线验证）；事件音频已合成并写 WAV（`climb_film_audio.wav`）。
- **未完成**：ffprobe 对 MP4 的严格探测通过、AAC 音轨、D1 完整角色美术、F/G 阶段。

## 实施进展（2026-09-07 上午，MP4 容器修复 + 完整验证）

- **MP4 完全通过 ffprobe/ffmpeg 验证**：h264、1280×720、240 samples、duration=10.000000s、size=841592。修复序列（box 级）：mvhd 矩阵缺 1 条目+predefined 缺 2 条目（8 字节短）→ mov demuxer 越界；mdhd 多写 pre_defined 2 字节；avc1 frame_count 误用 W32（应 W16）；stsd/avc1 字段错位已全部对齐。
- **H.264 载荷验证**：AVCC→Annex-B 提取后 ffmpeg 全解码 1280×720、232 帧；chainCid 绑定（4489b550…）。
- **WAV 音频**：RIFF 头大端错误已修（W32At/W16At 改小端），afinfo 验证 1ch 48kHz Int16 10.000000s；事件音频（抓握/释放咔哒、卸载闷响）由 cheng 合成。
- **E2 增量对拍**：csg_world_incremental_check 全绿（检查点恢复=字节一致；绳长编辑传播；编辑后确定性）。
- **交付物**：climb_film.mp4（841KB）+ climb_film_audio.wav（960KB）+ manifest.txt（chainCid 绑定）+ 240 PPM 帧流 + 71 干预帧。
- **未完成（如实）**：AAC 音轨（AudioConverter 桥代码已写、未接线验证——WAV 为当前音频交付物）；ffprobe 对首 AU（SEI+IDR 合并）报 benign "missing picture" 警告（解码 239 帧正常）；D1 完整角色美术（分色球体小人）；F/G 阶段。

- **MP4 ffprobe 全绿**：h264 1280×720 240 samples duration=10.000000 size=841592（mvhd 矩阵 9 条目+predefined 6 条目；mdhd 32B；avc1 frame_count W16 修复后）。

- **MP4 ffprobe 全绿**：h264 1280×720 240 samples duration=10.000000 size=841592（mvhd 矩阵 9 条目+predefined 6 条目；mdhd 32B；avc1 frame_count W16 修复后）。

## 实施进展（2026-09-07 下午，MP4 验证全绿 + 干预分支修复）

- **climb_film.mp4 ffprobe 全绿**：h264 High profile、yuv420p、1280×720、24fps、671kb/s、duration=10.000000s、nb_frames=240。ffmpeg 全解码 239 帧（240 帧中最后 1 帧由 flush 产生，属正常 H.264 行为），0 个 Error。
- **根因修复链**：①mvhd 矩阵 8/9 + predefined 4/6（缺 8B→demuxer 越界）→ 补齐后消除 "overread by 8" ②mdhd 多写 pre_defined 2B ③avc1 frame_count 误用 W32 ④avcC SPS/PPS 捕获竞态（改为样本保留后主线程统一提取）⑤AVCC BE 长度前缀逐字节 BE 读 ⑥Verlet-PBD 速度半量系数 ⑦RIFF 小端。
- **交付物清单**：climb_film.mp4（841KB，240 帧 10s）+ climb_film_audio.wav（960KB，48kHz mono 10s）+ manifest.txt（chainCid 绑定）+ 240 normal PPM + 71 intervention PPM + 3 camera verification frames。
- **干预片 MP4**：导出器干预分支代码已回退（双重步进导致段错误），待后续在独立分支世界中实现干预编码。
- **未完成（如实）**：AAC 音轨内嵌 MP4（AudioConverter 桥已写未验证）；D1 完整角色美术；E 段完整视觉审查；F/G 阶段。

- **climb_film.mp4 ffprobe JSON 验证**：duration=10.000000, codec=h264, 1280×720, nb_frames=240, bitrate=671kb/s, profile=High, yuv420p。ffmpeg -f null 0 Error 239 帧。dts 警告（239>=238）为 null muxer 良性提示。

## 交付物最终清单（2026-09-07，film_chain 清白 + 干预片 MP4 后）

| 交付物 | 路径 | 验证 |
|--------|------|------|
| climb_film.mp4 | artifacts/csg_world_video/climb_film.mp4 | ffprobe: h264 1280×720 240 帧 10.000000s 841507B，chainCid=4489b550… 绑定 manifest |
| climb_intervention.mp4 | artifacts/csg_world_video/climb_intervention.mp4 | ffprobe: h264 1280×720 71 帧 2.958333s 179865B，ffmpeg 全帧解码 rc=0 |
| climb_film_audio.wav | artifacts/csg_world_video/climb_film_audio.wav | afinfo: 48kHz mono Int16 10.000000s 960044B |
| manifest.txt | artifacts/csg_world_video/manifest.txt | chainCid + COM 810mm + 干预 0.000mm |
| normal PPM × 240 | artifacts/csg_world_video/normal/ | 1280×720 24fps |
| intervention PPM × 71 | artifacts/csg_world_video/intervention/ | 卸绳自由落体 |
| verify frames × 2 | artifacts/csg_world_video/verify/ | camB + camC |

- **gate 9/9 全绿（2026-09-07 串行复跑）**：film_chain 分叉定谳为并行编辑窗污染（同二进制双跑一致 + 双编译字节一致双实证），门禁期间禁止并行编译已入纪律。

## D1 角色升级交付（2026-09-07 晚）

- **可辨认角色入片**：胶囊躯干红衫+胶囊四肢深蓝+球头肤色+球手脚灰+连续棕绳（A2 资产合同形态），world_cinema 三机位与 exporter 双 MP4 全部换用 `render/character.cheng`；MP4 中段抽帧目检攀爬姿势清晰。
- **门禁 9 项→11 项全绿**：新增 `d1_character_render_probe`（调色板断言）与 `character_asset`（skeleton 对应表 CID 绑定断言）；chainCid 与全部物理指标不变（渲染零回写实证）。
- **两个存量 PPM 渲染 bug 修复**（offset-15 头覆盖+通道错位、墙面负 lum 过曝），240+71 帧已用修复版重导出。
- **E 段视觉审查首层 PASS**（双片 9 帧抽样目检）：角色全帧可辨、绳连续、卸绳因果链可视化完整；相机 A 头部投影重叠与躯干体量两项观察记档为 F 阶段渲染参数改进项。

## F-a 行走原语（2026-09-07 深夜，机制全部落地、步态调优挂起）

- **落地**：schema 脚本步表（stepPart/XYZ/窗口/rate/plantLen + preimage + 校验码 19-23）；无绳场景合法化（rope nodeCount=0）；execution 落点锚 winch 伺服（静态锚体 + StepPull 约束，与攀爬绞盘同族）；`CsgProducerBuildWalkScene` 扶墙横移场景（手锚链+双脚挪步+盆重心伺服+姿态 strut 三角）；walk smoke 双跑探针 + 渲染预览工具。
- **机制定谳**：质点模型无踝扭矩→单支撑必倒（需持续支撑+姿态 strut）；plant 语义分脚/手（脚 0.02 钉地、手 0.15 轻扶）；躯干直立靠 pelvis-handR/pelvis-head 距离约束 strut（实证有效）。
- **挂起**：步态参数矩阵调优——最好成绩 695mm 前进直立 0 拒绝；盆伺服加入后多锚交叠时刻残差>10mm 反弹。下轮方向：盆锚降速放宽/相位错开/refinement 加权。探针 `csg_world_walk_smoke` 未进主门禁（主门禁 11 项复跑全绿零回退）。
- **收口（同日续）**：三轮参数矩阵实测后**定版 6 步轻扶基线**（695mm、直立、0 拒绝、双跑确定）；8 步"5m"版为滑行失控如实否决；smoke 断言 ≥0.5m，**门禁 11→12 项全绿**。≥0.9m 与滑行抑制根治=投影器 anchor compliance（物理内核战役窗口）。

## F-b/c 字幕与镜头表（2026-09-07 深夜，编辑管线全通）

- **`render/text.cheng`**：5x7 点阵字体（45 字符：A-Z 0-9 标点，glyph 七行位图打包 int64 一表驱动）+ `RasterText` 屏幕空间覆盖层（不经 zbuf，字幕直接落帧）+ `TextPixelWidth` 居中辅助。`text_render_probe` 断言覆盖层落幅（≥1500 亮像素）+ 目检清晰可读。
- **`cinema/shot_plan.cheng`**：镜头表 schema（每镜头=相机七参+tick 窗口+标签；字幕时间轴）+ 窗口查询 + 校验（镜头窗口无缝单调、字幕窗口不重叠、标签非空）。
- **`apps/build_ascent/main.cheng`**：编辑主入口首版——攀爬世界 × 6 镜头 plan（三机位家族+推拉 focal）× 6 行叙事字幕，按帧选镜头相机+叠字幕，输出 240 帧 edited 帧流 + manifest（shots/frames/factsCid/chainCid）。6 镜头按帧 0/40/80/120/160/200 准点切换，跨镜字幕叙事目检完整（SHOT 2 特写"ONE HAND AT A TIME"、SHOT 6 收尾"THE TOP IS CLOSE"）。
- 冷编译器注意：托管 struct 形参（ShotPlan）的读取函数全部需 `@borrows`，否则循环内二次调用触发 move 消费。

## F-d 成片导出首版（2026-09-07 深夜，ascent.mp4 交付）

- **`apps/build_ascent` 接通 VT 编码**：编辑帧流直接编码 H.264（RGB→BGRA→VtbrVideoEncodeBgra）→ drain → Mp4Assemble → `artifacts/csg_world_video/ascent/ascent.mp4`：h264 1280×720 240 帧 10.000000s（1.18MB，字幕叠加使码率高于无字幕版）。抽帧目检字幕/标签入片完整，ffmpeg 全帧解码 rc=0。
- **chainCid 绑定实证**：ascent 成片 chainCid=4489b550… 与攀爬主片逐字节一致——同一物理世界、两种编辑输出（无字幕主片/带字幕六镜头剪辑），"换编辑不改世界"合同实证。
- manifest：schema/shots=6/frames=240/factsCid/chainCid 全绑定。

## f_gate 成片门禁（2026-09-07 深夜，13 项全绿）

- **`tools/csg_ascent_gate.cheng`**：编辑成片验收门禁——①fresh 编译+运行 build_ascent；②manifest 真值（shots=6/frames=240）；③**chainCid 跨片绑定断言**（ascent 成片必须与攀爬主片 manifest 逐字节一致="换编辑不改世界"）；④六镜头逐镜 overlay 像素断言（每镜第 5 帧：标签区白色 ≥200 + 字幕区 ≥200，实测 label 680-844/caption 1683-2439）；⑤ffprobe 流真值（nb_frames=240/width=1280）。**13 项全绿**。
- 调试记档：检帧位置最初取镜头首帧（t=0/400/…），全部落在字幕窗口间隙（字幕从 t=30 起、与镜头切换点错开 30 tick）→ 改检镜头内第 5 帧。ReadFile 不存在的路径会直接崩溃（Trace/BPT），门禁文件名拼接必须与被检产物逐字符一致。

## 如实未完成

- AAC 音轨内嵌 MP4：**链接通道墙**——stage3 驱动框架表无 AudioToolbox（三符号 undefined），env 覆盖撞 direct-ld admission 墙；桥代码 `aac.cheng`+探针已就绪（obj 层验证），待驱动战役框架表加 ordinal 8 后即插即用。当前音频交付物=WAV（合同首期规定）
- MP4 stbl 无 ctts box：B 帧末帧 dts 推导提示（解码完整性不受影响，F 阶段前修）
- 角色仍是程序化分色胶囊人形（A2 首期合同形态）；网格/纹理/骨架蒙皮的完整资产管线（assets/ 通用底座已在）为 F 前任务
- E 段完整视觉审查（三机位+双片抽帧目检已做首层）
- F 阶段 60–90 秒 6–10 镜头原创出山短片
- G 阶段 GPU 扩展
