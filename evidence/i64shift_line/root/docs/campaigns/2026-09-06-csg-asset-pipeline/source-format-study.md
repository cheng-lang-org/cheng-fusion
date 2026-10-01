# E0 源格式可提取性研究（CSG 资产管线）

日期：2026-09-06。状态：初版研究完成，**真实源样例取得被阻塞**（本机无 Blender/UE）。本文按计划 §5 E0 行冻结：选定版本、逐字段取得路径、缺口与阻塞项。

## 1. 选定源版本（冻结目标，未实测——软件未安装）

| 源 | 目标版本 | 导出通道 | 官方文档 |
|---|---|---|---|
| Blender | 5.1 LTS（安装时取实际小版本） | 官方 glTF 2.0 导出器（内置） | docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html |
| Unreal Engine | 5.x（安装时冻结具体版本） | 官方 glTF 导出器（Interchange） | dev.epicgames.com/documentation/.../how-the-gltf-exporter-handles-unreal-engine-content |

## 2. 逐字段取得路径（官方导出通道）

| 源字段 | glTF 传递 | 取得路径 / 风险 |
|---|---|---|
| 网格拓扑/变换 | POSITION/indices/node TRS | 直接；导出器可能做 vertex split，顶点总数与源不同必须有据（计划 §6） |
| PBR 材质因子 | pbrMetallicRoughness | 直接；**UE 导出器可能以默认值替换部分输入**（官方文档列明）——覆盖门必须逐字段对拍 |
| 纹理 | images/textures (PNG/JPEG) | 直接；打包选项决定内嵌或外部 |
| 摄影机 | cameras (perspective) | 直接 |
| 骨骼/动画 | skins/animations | Blender 直接；**UE morph 目标动画官方导出器不支持**，不伪造（capabilities.json 已列） |
| 碰撞/物理参数 | **无 glTF 通道** | UE 官方导出器忽略碰撞；必须走源侧结构化附加数据（E1 自有读取或 USD） |
| 蓝图/驱动器/程序材质 | 无 | 不在 glTF 语义内；声明不支持的源功能在 E1 拒绝 |

## 3. 纯 Cheng 源格式读取可行性（E0 判定）

- `.blend`（二进制，版本化 DNA 结构）与 `.uasset`（版本化包 + 自定义类）解码工程量大且强绑定具体版本；在官方导出已覆盖首期字段集的前提下，**不做通用源格式解码**。E1 所需"结构化源清单"改由两条路径取得：① 官方导出器的诊断/日志（版本+选项+对象清单）；② 需要碰撞等导出丢失字段时，按指定版本的专用解码器另立任务（计划 §2.4 已预留）。
- 判定：`通用 .blend/.uasset 解码 = 不支持（显式）`；`指定版本专用字段解码 = 按需另列`。

## 4. 阻塞与解除路径

1. **Blender 未安装**（`blender not found`）→ 安装后：导出静态盒场景 + 3 关节角色各一，冻结版本/选项/source_map，替换现有构造夹具的"真实资产验收"位。
2. **UE 未安装** → 同上；morph 动画负例按官方说明保持"不支持"声明。
3. 在 1/2 到位前：Blender/UE 源工程对应能力（geometry-from-source、physics_source 等）一律不得 verified；现有 GLB 构造夹具只授予解析器正反例资格。
