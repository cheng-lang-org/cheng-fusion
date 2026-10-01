# CSG 资产导入合同（A1 冻结）

日期：2026-09-06。状态：A1 已冻结初版，随真实样例到位演进（演进须走本文件修订，不得测试失败后放宽）。
上级计划：[CSG资产管线](superpowers/plans/2026-09-06-csg-asset-pipeline.md) · [任务表](campaigns/2026-09-06-csg-asset-pipeline/task_plan.md) · 能力清单：[capabilities.json](campaigns/2026-09-06-csg-asset-pipeline/capabilities.json)

## 1. 纯度边界

- 纯 Cheng 范围：导入、验证、规范化、加工、CSG 打包与执行代码（`src/game/assets/**`、`src/tools/csg_world_asset_main.cheng`、`src/tools/csg_asset_gate.cheng`）。
- 源创作边界（非纯 Cheng，逐项列账）：Blender/UE 官方离线导出、ffmpeg（样例创作与交付验证独立解码基准）、Khronos gltf-validator（仅验证）。发布后的 CSG 加载/执行不启动源应用、不依赖 Python/插件/Assimp/OpenUSD 承载语义。
- 文件解析零隐式联网；URI/解压/路径必须落在冻结清单内本地对象。

## 2. 身份与事实

- 复用 core 的 CSGC、canonical JSON、SHA-256 内容 CID（小写 hex 64）与 Merkle manifest/admission。大块几何/纹理/音频为有类型/范围/CID 的字节载荷，不进 JSON 主事实。
- 同一冻结输入与实现闭包 → 字节相同 CSGC；不同来源记录允许根不同，未变资源按内容 CID 精确复用。
- 三层记录分列：requested / source-declared / verified 能力；原始/推导/重建/人工创作来源分列。构造夹具只授予解析器正反例资格，不替代真实资产验收。

## 3. 输入合同（首期）

| 输入 | 首期支持 | 拒绝 |
|---|---|---|
| WAV | PCM RIFF/WAVE，s16/s32/f32，chunk 遍历（LIST/INFO 等附加块跳过并记录） | 非 PCM 压缩格式、损坏头、越界数据块 |
| MP4/M4A | ISO-BMFF box 遍历：ftyp/moov/mvhd/trak/tkhd/mdhd/stts/stss/stsc/stsz/stco/co64/elst/stsd(avc1/mp4a) | 加密、未知必需 codec、错误时间表 |
| GLB | glTF 2.0 受支持子集：GLB 容器、TRIANGLES、场景/实例/变换、PBR 材质、摄影机、skin/IBM/JOINTS_0/WEIGHTS_0、morph、LINEAR/STEP 动画 | `extensionsRequired` 未知必拒；未列 required 但影响请求能力的未知扩展拒；外部缺资源拒；sparse/压缩扩展首期拒并明确报不支持 |

- 合法规范默认值按规范解释；实现缺失与合法默认值是两种情况，分别记录。
- 坐标一次转换：glTF 右手 Y-up 米 → 世界右手 Z-up 米（网格、法线、绕序、父子矩阵、逆绑定、动画同步转换）。
- 动画插值首期 LINEAR/STEP；CUBICSPLINE 在 D1 求值器落地后接入。动画不自动获得物理能力。

## 4. 有界读取

- 长度/offset/stride 计算用 int64 宽整数并防溢出；配额：单文件 ≤256MiB GLB / ≤1GiB 媒体；解码像素 ≤4096×4096；节点 ≤100k、关节 ≤256、三角形 ≤1,000,000；超范围显式报不支持，不自动减面/截断。
- 读取持有冻结文件身份（size+sha256 闭包）；读取期间输入变化拒绝本次结果。
- 资源 no-replace 准入：损坏/未完整准入对象不得激活；孤立未准入对象不等于成功版本。

## 5. 错误与取消

- 错误返回源对象/字段定位、违反合同、已支持版本、失败阶段；禁止 warning+成功吞掉请求能力；失败后不得自动缩小范围重签成功。
- 取消 2 秒内确认；停止接收新任务；不可中断段单独记时；取消不提交可激活资产。

## 6. 验收口径（与计划 §6 一致，数字为冻结门槛）

- 原始字节 CID 逐字节保持；PTS/DTS/timebase 与 ffprobe 独立解析一致；VFR/B帧/非零起始样例不得按恒定帧率或零起始解释。
- GLB 几何/材质/场景与官方 validator + 结构化预期对拍；蒙皮动画按全关键帧+区间内固定时刻对拍关节/顶点，位置误差 `1e-5m + 1e-5*|ref|`，旋转 ≤0.01°。
- 同输入两次导入字节一致；损坏/越界/环/NaN 负例全部拒绝。
- 100 次加载/卸载资源回落基线；ORC 与文件资源释放可解释。

## 7. 当前实现状态（诚实记账）

- 解析器/规范化/打包代码：本任务实施中，见 progress.md。
- Blender/UE 真实源样例：blocked（本机无源软件），取得路径见 capabilities.json `blocked_sources`；在其到位前，源工程对应能力一律不授予。
- 编译线：HEAD 自宿主编译器处于 parser-owned-global 迁移中，const 块等形态红（最小复现已附）；本线开发/验证环使用冻结克隆 + fishing-era 座驾（a979322bfe90f691），配方见 baseline.md。
