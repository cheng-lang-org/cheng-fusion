# CSG 资产管线事实依据

2026-09-06 只读核查。HEAD为`7590620968069325193f6c1a119e2710930d5199`，工作区包含其他任务未提交改动；HEAD不是完整工作区哈希或运行回执。本轮只规划文档，没有下载资产、启动源应用、运行编译或导入测试。

## 仓库现状

- 世界视频计划 D1 已拟定 `src/game/assets/{mesh,skeleton,material,pack}.cheng` 与 `src/tools/csg_world_asset_main.cheng`；本项目细化和复用这些路径。
- 限定检索 `src/game`、`src/apps/wow_export`、`src/core/csg_core` 与 docs，尚未发现 glTF/GLB、FBX、USD、`.blend/.uasset` 的通用导入实现；“拟新增”不得计完成。
- `src/apps/wow_export/asset_formats.cheng:231` 等存在 WoW 专用解析，`asset_export.cheng:108` 有限定资产导出，`render.cheng:3154` 有静态画面入口；没有本轮运行证明，也不覆盖所问源格式。
- 专用解析原语不能直接升级为通用库：`binary.cheng` 的范围相加需先防溢出，部分解析会缩减浮点精度，专用文件发布不等于现有 CSG store 的原子 no-replace admission。提炼时应修在共享原语并回归旧消费者，不把整个 WoW 工具链作为运行依赖。
- 现有 `web_scene_media_factfirst.cheng` 管理媒体索引/摘要/发布事实，不实现三维重建或物理控制。
- CSG store、canonical CSGC 和 Merkle 身份必须复用；`oracle_asset` 属于金融观察领域，不用于三维素材。生产 activation/replay 权威链的现有未闭合项仍是最终发布前置。

## 官方资料与含义

- [glTF 2.0 规范](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)：支持合同须覆盖二进制布局、accessor、场景、蒙皮与动画求值；不能以JSON可解析作为完整验收。
- [UE glTF 导出说明](https://dev.epicgames.com/documentation/en-us/unreal-engine/how-the-gltf-exporter-handles-unreal-engine-content)：源复杂材质、碰撞和部分运行语义不能完整通过glTF传递；导出器可能替换或省略内容。合法交换文件不能证明源工程完整。
- [Blender glTF 导出说明](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)：对象/骨骼/形态键动画与物理/驱动器等语义的保留范围不同。官方搜索内容已读取；直接网页打开返回402，未声称浏览器完整读取。
- [USD 概念](https://openusd.org/release/glossary.html)、[USD Physics](https://openusd.org/release/api/usd_physics_page_front.html)：composition、场景快照与物理描述是不同合同；字段对应不能推出不同物理求解器轨迹完全相同。

## 规划结论

统一导入核心先冻结身份、能力、来源和原子提交；媒体与GLB静态导入并行，再加骨骼动画。源工程语义、物理控制、USD composition和视频重建分别验收；导入器只承诺它能够证明的输入能力，不能自动烘焙或根据名字猜对应关系。

本会话此前已检索确认所要求的 j-space/using-superpowers/planning-with-files/gsd-method-guide 技能不可读，当前工具仍无skill_load或str_replace_editor。没有声称加载；沿用仓库的提案、计划、任务/发现/进度形态，使用可用的结构化apply_patch写文档。

## 独立Review修正

评审后将UE骨骼动画与不受该导出器支持的morph动画分开验收；E0前移为A1后的源可提取性研究，E1/E2依赖真实源读取与世界执行器；明确整体archive清单和R仅研究范围；新增资产/动画求值/蒙皮/媒体/物理的唯一实现与计账归属表，避免与原D1/D2重复估工。按第一性原理复核，保留一套CSG和资产消费者，各输入只增格式前端及明确语义转换。

## 实施期事实（2026-09-06/07 第一夜）

- **编译器 const 接口缺口（全仓当前头号阻塞，归属编译器线）**：parser-owned-global 元数据接线缺失 => 任何含 `const` 块的模块（含传递依赖 std/strings→sha256、std/os、std/json）编译报 `parser-owned global coverage mismatch parser=N metadata=0`。ctx.bindings 仅来自"reusable facts context"，用户编译路径从不填充（compiler_csg.cheng 33603-33682 唯一消费点）。清 `.cheng-csg-cargo-*` 缓存无效（排除陈旧缓存假设）。pb_parser 会话 bv0→bv7 迭代烤机中（每 ~30-40 分钟一炉），本线设 const_watch.sh 每 20 分钟轮询。
  - **2026-09-11 更新（kernel-userpath 战役回填：已定位到代码级并落树修复）**：机制 = parser sidecar 把 `const` 块条目记成模块级声明行（`declarationKinds==ParserDeclarationLocal` + `declarationFunctionRows==-1`）⇒ parser-owned 全局身份 pass（`compiler_csg.cheng:33457-33471` + `TypedExprParserOwnedGlobalBindingFromSpans`）为它们产出全局绑定；而 metadata 侧三个绑定生产点（`TypedExprBuildSourceContextBorrowed` / `typedExprBuildSealedGlobalBindings` / `typedExprBuildFactsContextFromSelectedMetadata`）的块判定只认 `var` 块 ⇒ 两侧计数对任何含 `const` 块的源必不等，`compiler_csg.cheng:33796-33797` 的覆盖闸拒绝该源追加（逐源增量森林 `forest_appended` 恒为 0）。计数证据：`src/chain/binary_types.cheng` const 块恰好 11 条，实测 `parser=11 metadata=0`；无 const 的 `fn main` 夹具 `rc=0` 通过；单行 `const X: int32 = 1`（列 0，全仓 796 处）本来**就**产绑定 ⇒ 缺的是块形态。影响面 818 文件 / 9041 条目。修复 = `patches/s1b_step3l_global_const_block_bindings.patch`（新增 `TypedExprConstBlockEntryBinding` 处理无类型标注条目的字面量类型推断，三处生产点块判定扩到 `var`+`const`）。判据：重烤后含 const 夹具上该判词必须消失。
- **载具矩阵实测**（各自红集合互不相同，全部为烘焙编译器、不消费树源码——语法探针实证）：a979（9/5 fishing 座驾）= const/let-str/Fmt-str/assert 绿，let-int/int64字面量/bytes 无初始化 SIGILL，Fmt-int 桥接面 staging 假阴必死（编排器内嵌 PathDirExists 缺陷，不可从树侧修）；fp_D1（9/5 11:56）= canary/let-int/echo-Fmt-int/int64 绿，min2/const 红，cheng 路径 import 整体 "malformed alias"（模块化代码不可用）；185MB 生产驱动（9/2 0e7c）= canary 绿、const/min2/var-init-call 红；whenblock 16:27 = const→"parser missing source"。唯一全形态绿点=等 const 修复后的新炉。
- **语言子集地雷（实测入库 baseline.md）**：`var x: T = <零值>`/`= ""` 冗余默认初始化被拒（新 parser 合同）；`@borrows` str 形参强制；托管字段结构体**元素 let 绑定=move 消费源**（json 解析器索引字段访问模式安全）；fp_D1 时代不认 import 别名（std 与 cheng 路径均拒），现行 HEAD 恢复 `import x as y` 合法。
- **桥接面 staging 机制**：`artifacts/backend_driver/bridge_surface_source/<包名>/` 由编排器在请求开始时删除重建（删-建路径触发假阴）；driver 直呼 system-link-exec 不走 staging（fishing findings W-A1-2/★重案631 同源确认）。
- A2 闭包（diagnostic/request/source_map/validation/pack/commit/reader/normalize+smoke）在 g2_bv3/bv6 上 parse+normalize 通过（错误均止于 sha256 const）；B1/C1/D1 模块待 const 修复后首轮 parse 验证。

## 自烤尝试与形态迁移配方（2026-09-07 深夜追加）

- **const 修复已在主仓未提交源码中**：parser.cheng +771 行（GEN2-WAVE）把「元数据 bindings 逐行 ×3 前缀检查」当热路径优化——接线存在于在飞工作区，只是尚未烤进任何可达炉（pb_parser bv3→g2_main→d1_w126 02:13 全部仍红，它们烤自各自旧树）。
- **自烤主仓树的形态迁移配方**（新 parser 合同，语义等价）：①`var x: T = <零>` 剥初始化；②结构体字段 `x: T = <零>` 剥；③推断零 `var x = 0` → `var x: int32`；④**let 零值** `let x: T = <零>` → `var x: T` + 紧随显式赋值行（裸 var 化会产生形式未初始化读 → 种子 SIGTRAP 静默崩，rc=133 零输出）；⑤**const 块内初始化器绝不可剥**（迁移必须避开 const 块，否则 sha256 等直接崩）。③④注意 re.M。
- 迁移迭代至 cleanup_cfg.cheng 一带（v4 深、v7 后又 133）后停手：手工迁移 10 万行在飞树是无底洞，各线自烤树自带正确迁移态，等绿炉是唯一经济路径。const_watch.sh（8h 窗，扫全部克隆 35 分钟内新烤头）已重启。
