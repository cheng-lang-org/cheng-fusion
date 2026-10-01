# CSG 资产管线任务表

状态：`apply`（实施中；2026-09-06/07 第一夜 A1 完成、A2–G2 代码落盘，编译验证等 const 接口缺口修复）。详细合同见 [开发计划](../../superpowers/plans/2026-09-06-csg-asset-pipeline.md)，本表只跟踪资产子项目。

## 规划交付

- [x] 回顾 lessons、已有世界计划与资产源码。
- [x] 核对官方 GLB、Blender、UE 和 USD 能力与导出丢失风险。
- [x] 并行审查统一架构与独立验收，创建提案和计划大纲。
- [x] 完成阶段、任务、格式范围与资源估算。
- [x] 同步世界计划 D1、全局导航与依赖图。
- [x] 独立 Review、链接和一致性检查后交付。

## 实施任务

| 任务组 | files | action | verify | done |
|---|---|---|---|---|
| A1–A3 统一核心 | 合同/capabilities/baseline/fixtures + source_map/validation/pack + import/{diagnostic,request,commit,reader,normalize} | 样例、身份、来源、依赖、数值转换与原子提交 | 当前编译、边界/中断/错误输入及同输入确定性 | [x] gate baseline PASS（2026-09-07, 车头 cheng_w126_re） |
| B1–B2 原媒体 | media、import/mp4、observation(B2 待) | 保留原字节，解析时间与轨道；观测另记来源 | 真播放、timebase、有效音频与独立解析 | [x] B1 gate PASS；B2 未开始 |
| C1–C2 静态GLB | gltf/{glb,accessor,scene} | 严格读取、图像/PBR/场景规范化 | 格式正反例、官方 validator、源能力范围 | [x] C1 gate PASS；C2 纹理/真实源资产 blocked(无 Blender/UE) |
| D1–D2 动态GLB | skeleton/animation、gltf/{skin,anim}、csg_world_asset_main | 骨骼/动画求值并实际加载运行 | 关节/顶点数值对拍，不启动源应用也能播放 | [x] D1 gate PASS；D2 六样例消费 PASS（渲染归世界 D2） |
| E0–E2 来源与交互 | source-format-study.md 已交；coverage/Blender/Unreal/physics 待 | 先查源字段取得路径，后做精确映射与受力控制 | 覆盖100%、源导出丢失负例、撤销支撑干预 | [ ] E0 初版完成；E1/E2 未开始 |
| F1–F3 USD | 未开始 | 快照与组合分开支持，复用同一资产语义 | stage求值、variant/时间/引用、物理验证 | [ ] |
| G1–G2 更新发布 | reimport/dependency 待；csg_asset_gate 已落盘 | 增量/全量一致、原子发布、按能力验收 | 六真实样例、生命周期、当前纯度/生产权威门 | [x] G2 baseline PASS（VERIFY_gate_baseline_20260907.log）；G1 未开始 |
| R1 视频重建研究 | reconstruction-study.md 已交 | 具体模型/样例/算子/硬件与可验证范围研究 | 有实验留实际回执；无可达模型记录缺口，不宣称产品化 | [x] 研究结论完成（模型 blocked，观测层可行） |

所有18项详细任务与路径以开发计划第5节为准。实施第一夜细节见 [progress.md](progress.md)。


所有18项详细任务与路径以开发计划第5节为准。未运行导入器、源应用导出或运行时验收。初步20–38工程人周为限定A–G范围，首批媒体/GLB及对应发布11–20人周；编译器、源格式深度解码、模型研究与上位引擎另计，与原D1重叠不重复求和。

整体archive清单为A–G的17项实现/验证任务全部通过及R1研究结论完成。按能力发布单批资产不会改变这份清单。具体与世界D1/D2/D3的唯一计账和实现归属见详细计划第4.1节。
