# 主要功能与公开技术重合补查

2026年9月16日。按用户追问扩大到产品能力比较。不是全面新颖性检索或实施自由结论，没有修改已交付Word。

|功能|本次确认的公开资料|比较边界|
|---|---|---|
|同一世界支持影片和游戏|Epic Sequencer及游戏事件触发过场文档|共用引擎制作影片和交互不是全新概念；尚未据此核定CSG整套状态和执行合同被相同披露|
|编辑后依赖更新和计算复用|DreamWorks CN104520902B及OpenExec|不能仅以图、缓存、依赖失效作为区别；需对检查点、动态查询完整性及耦合状态复用逐项比较|
|存量视频变成场景或对象|NVIDIA CN118196277A权利要求1至9|图像重建、分割识别、模型替换和编辑已披露；不等于任意视频可恢复完整物理世界|
|跨工具资产统一及组合|OpenUSD官方介绍|交换、层、引用、变体、场景组合和物理领域表达已存在；不表示任意Blender或UE行为完整可迁移|
|语义指令驱动三维世界及物理反馈|CN121683561A、CN117320790A|分别有引擎桥接和神经生成后物理反馈的具体限定，不能抽成覆盖一切自然语言控制的专利|
|资产能力验证和回执|SimReady Foundation|声明、验证、引擎测试和随资产证据已披露；受控干预、状态写入权限与实际加载绑定的组合仍待比对|
|世界描述分发及按需加载|OpenUSD payload和CN114448977B|延迟载入和场景增量传播有公开内容；小型世界描述不是完整资产闭包，不能直接推算压缩率或秒开|

## 新补到的OpenExec

官方介绍明确公开场景对象上的命名计算、强类型数据流、有向无环执行网络、自动缓存和依赖失效。输入依赖在一次求值期间静态，回调要求无状态且无副作用；OpenExec本身不是事件交互系统，计算不能直接修改UsdStage拓扑或创作新值。上述边界不等于无法在外层组织仿真步进，不能仅凭“我们的世界有状态”推断没有重合。

旧世界再生成稿应补入OpenExec逐特征对照。当前只是核读其官方介绍，尚未完成代码、历史公开日期和相关专利族核验，不声称已经排除其对旧稿创造性的影响。

来源：

- https://openusd.org/release/intro.html
- https://openusd.org/release/intro_to_openexec.html
- https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-sequencer-movie-tool-overview
- https://dev.epicgames.com/documentation/unreal-engine/play-cinematics-from-blueprints-in-unreal-engine
- https://patents.google.com/patent/CN104520902B/zh
- https://patents.google.com/patent/CN118196277A/zh
- https://patents.google.com/patent/CN121683561A/zh
- https://patents.google.com/patent/CN117320790A/zh
- https://patents.google.com/patent/CN114448977B/zh
- https://nvidia.github.io/simready-foundation/2026.06.0/guides/benchmark/overview.html
- https://nvidia.github.io/simready-foundation/2026.04.1/capabilities/packaging/conformance_metadata/capability-conformance_metadata.html

研发依据沿用本任务已核读的世界、游戏、资产规划、源文件与产物；本次没有重跑引擎或刷新全部进度。功能重要性排序是产品判断，不是市场测量。

## 用户补正 千倍压缩与秒发秒开

用户指出压缩和分发体验应是核心价值，不能被资产准入与编辑能力掩盖。补查CSG_VIDEO_IDEAL、M7、M12、M14及双设备互发记录，区分以下口径：

- 千倍压缩：需同内容、同质量、同输出要求的成熟视频编码基准，分母为完整必需世界、纹理、音频、模型和执行依赖；原生世界表达与视频逆向分开，冷端完整包与缓存命中新增传输分开。当前核读记录未证明通用同质完整内容千倍压缩。
- M7报告880130字节分发形态与56236字节首段预算，属于base视频、深度视频及manifest的混合结构，不是全语义零解码证明。
- M12的1.32%至2.46%比例对比的是按帧数乘64KiB的单层基准，不能当同质H.265整片压缩率。
- M14明确记载体积缩小同时播放MAD退化约45%并超过其质量门，不能只摘体积达标句。
- 9月12日双设备报告记载鸿蒙发布就绪284至291毫秒，同时跨设备全链仍阻塞，环回点击到首帧约1.95至2.18秒。不能合并为跨设备全链秒开。此次未重跑设备，不将旧报告当9月16日全局状态。

相近技术补查：MPEG-4 BIFS已有交互场景及动画的表示、传输和渲染；US8957946B2和US9865081B2说明书涉及复用视口状态数据对象与渲染指令，由客户端生成视频帧以实现压缩；MoQ草案已覆盖QUIC上的低延迟发布订阅。这些是公开技术方向重合，尚未完成该压缩专利族的逐权项对比、中国同族核验或有效性判断。未把另一众包渲染专利的中国同族误认成上述压缩专利的同族。

新增资料：

- https://mpeg.chiariglione.org/standards/mpeg-4/scene-description-and-application-engine.html
- https://patents.google.com/patent/US8957946B2/en
- https://patents.google.com/patent/US9865081B2/en
- https://www.ietf.org/archive/id/draft-ietf-moq-transport-00.html

两份世界专利稿分别围绕状态复用与物理能力准入，没有将语义时空表示压缩、首帧依赖调度及接收端恢复作为核心保护链。该第三方向值得单独检索，不能以千倍或秒开效果词直接认定可授权。
