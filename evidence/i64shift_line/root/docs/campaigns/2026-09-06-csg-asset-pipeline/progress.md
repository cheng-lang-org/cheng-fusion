# CSG 资产管线进度

## 2026-09-06/07（实施第一夜：A1 完成 + A2/A3/B1/C1/D1/D2/G2 代码全部落盘）

### A1 基线（完成）
- 合同冻结：`docs/csg-asset-import-contract.md`；`capabilities.json`（六份真实样例 sha256/属性/请求能力/预算/阻塞项）；`baseline.md`（工具链配方+语言子集实测矩阵+红集合最小复现）；`fixtures.md`（样例台账）。
- 真实样例六份全部生成并实测：static_box.glb / skin_anim.glb（**Khronos 官方 gltf-validator 0 错误**）；WAV（PCM 48k 2s 带 LIST/INFO 块）；CFR MP4（24fps+AAC）；真 VFR MP4（实测帧距 2/24 跳变+B帧33/P14/I1）；非零起始 MP4（elst 空编辑实测 start 0.5/0.476）。
- 容器级真值独立提取（python/ffprobe 双源）冻结进 fixtures.md/B1 冒烟断言。

### 实施任务代码（全部落盘主仓，待编译线恢复后全量验证）
- A2：`src/game/assets/{source_map,validation,pack}.cheng`、`src/game/assets/import/{diagnostic,request,commit}.cheng`——身份（GUID/快照行/交换路径三类+displayName 不入身份 preimage）、能力三态（requested/declared/verified）、Merkle 封签（事实行排序 canonical+资源表+根折叠）、no-replace 原子提交状态机（head 仅在完整准入后原子 rename）。
- A3：`src/game/assets/import/{reader,normalize}.cheng`——宽整数范围证明后收窄切片、冻结文件身份+期间变更拒绝、Y-up→Z-up 共轭一次转换、奇异拒绝/镜像显式、米制恒等（量纲独立）。
- B1：`src/game/assets/media.cheng`（WAV chunk 遍历/PCM 校验/附加块计数/时长）+ `src/game/assets/import/mp4.cheng`（ISO-BMFF 大端遍历、mvhd/mdhd/stts/stss/elst/stsd、VFR/B帧/非零起始显式判定、轨数/深度/数量有界）。
- C1：`src/game/assets/import/gltf/{glb,accessor,scene}.cheng`——GLB 容器严格校验、extensionsRequired 拒绝、accessor 组件/stride/normalized/越界、索引界内、单 primitive TRIANGLES 子集、PBR 因子材质、透视摄影机、TRS+matrix 节点、三色 DFS 环检测。
- D1：`src/game/assets/skeleton.cheng`（SoA 先序 DAG+IBM+全局姿态+LBS 蒙皮）、`src/game/assets/animation.cheng`（LINEAR/STEP、四元数确定性 slerp——二分 acos 60 次保证 0.01° 合同、端点钳制不外推）、`import/gltf/{skin,anim}.cheng`（精确节点索引身份、先序校验、权重负值拒绝）。
- D2：`src/tools/csg_world_asset_main.cheng`——三类格式端到端消费+逐项能力回执（渲染消费仍归世界 D2，未越权）。
- G2：`src/tools/csg_asset_gate.cheng`（baseline：夹具哈希核对+三冒烟编译运行+六样例消费回执+流式报告）。
- 测试：`src/tests/csg_asset_{a2,b1,c1,d1}_smoke.cheng`（正负例+真值断言：WAV 头字段/RIFF fourcc、CFR 24帧/12288/stss=1/AAC 45124 priming、VFR 双 delta、elst 空编辑、GLB 首顶点/min-max/索引序、蒙皮绑定不变量、slerp 0.01°、STEP 语义、双次求值逐位一致）。

### 工具链（重大排查结论，详见 baseline.md）
- 今晚排除六种载具假象，最终定性：**主仓+全仓当前被"const 块 parser-owned-global 元数据接线缺口"阻塞**（sha256.cheng 自带 const 块，经 strings 传染一切 import 闭包）；该缺口归属编译器线（pb_parser 会话 30-40 分钟一炉在修，bv0→bv6 迭代中）。
- 本线已设轮询守护（const_watch.sh，20 分钟/次），const 探针绿后立即全量编译验证上述模块。
- 已验证的中间事实：全部管线模块在 g2_bv6（01:05 炉）上 parse+normalize 干净（错误均指向 sha256 const）；A2 闭包在 a979 上曾通过完整语义分析（仅我自己两处 redundant-init 已修）。

### 阻塞项（诚实记账）
1. **编译器 const 接口缺口**（最高优，pb_parser 在飞）：阻塞全部 .cheng 编译验证。
2. Blender/UE 源软件未安装：真实资产验收 blocked（E0 研究已给解除路径）。
3. 生产权威链（activation/replay、固定点）：未闭合，最终发布前置，归既有主线。

## 2026-09-07（A2–D2+G2 编译运行验证全绿）

### 工具链突破
- const 接口缺口仍阻自宿主编译器线（所有炉红），但 **C 车头 cheng_w126_re（sha256 3ad3bc97…，/private/tmp/cheng_w126_re）可直呼 system-link-exec 编译运行全部管线代码**——const 块、let/var 初始化、跨模块导入、rawbytes/os/json/sha256 全闭包均支持。
- 配方：`cd <克隆根> && env -u CHENG_ROOT -u CHENG_PKG_ROOTS -u CHENG_PKG_HOME -u CHENG_GUI_ROOT -u CHENG_IDE_ROOT cheng_w126_re system-link-exec --root:<根> --in:<绝对.cheng> --emit:exe --target:arm64-apple-darwin --out:<exe>`（无 --link-providers；入口限包根 src/ 下）。
- C 车头形态纪律（本线实测）：import 别名禁止（限定名=路径末段）；`var x: T = <零值>`/`let x: T = <零>` 冗余初始化必拒（let 零值改 var+显式赋值）；str 比较 `<` 不可靠 → 自写 AssetPackStrLess 逐字节比较；跨函数 var 形参突变/循环计数双执行不可靠 → 排序内联、计数循环避免；托管 seq 元素读用 `x[i].field` 索引访问。

### 验证结果（cheng_w126_re 车头，2026-09-07）
- **csg_asset_gate baseline: PASS（checks_pass=5 checks_fail=0）**，完整日志 `VERIFY_gate_baseline_20260907.log`：
  - 五夹具 sha256 与 capabilities.json 冻结值一致 PASS；
  - A2 统一核心冒烟（身份/能力三态/Merkle 封签确定性/原子提交含负例）compile=0 run=0 PASS；
  - B1 媒体冒烟（WAV 头/LIST 块/时长、CFR 24 帧+stss=1+AAC priming 45124、VFR 7 组 stts、elst 空编辑非零起始、4 个反例拒绝）PASS；
  - C1 GLB 冒烟（容器/JSON/材质因子/摄影机/节点环检测/POSITION 首顶点/索引界内/重读逐位一致/截断坏魔数负例）PASS；
  - D2 world_main 对六真实样例端到端消费全部 rc=0（含 skin joints=3、animation 4 采样器 4 通道 rangeMilli=[0,1000]、VFR+interframes+nonzero_start 回执）。
- D1 冒烟（skeleton 三关节链/IBM/绑定姿态蒙皮不变量/slerp 旋转误差 0（合同 0.01°）/端点钳制/STEP 语义/双次求值逐位一致）在本轮早前独立 PASS。

### 迭代中修复的本线 bug（已回写主仓）
- accessor: float32 位解码改手动 IEEE-754（C 车头无 float32）；紧凑排列 stride=0 时步长取元素大小。
- mp4: hdlr 检测层级错位（trak→mdia）；box 尺寸读改大端（AssetMediaU32Be）。
- pack: 借用 str 元素入 seq 加 Fmt 显式共享；排序换选择拷贝法+自写逐字节比较。
- commit: head/packageCid 偏移修正；rename 桥不可用车头上直写+回读校验兼容路径。
- smoke: move 消费顺序（cid 断言先于 mDup）、跨模块 var 出参改返回数组、fmt 实参禁科学计数法。

### 剩余阻塞（不变）
1. 自宿主编译器 const 接口缺口（编译器线在飞）：生产驱动复验待其收敛。
2. Blender/UE 源软件：真实资产验收 blocked（E0 已给解除路径）。
3. 生产权威链：最终发布前置，归既有主线。

## 2026-09-07（B2 观测层落地：存量视频 → CSG 世界观测对象端到端 PASS）

- 新增 `src/game/assets/reconstruction/observation.cheng`：从 mp4 vide 轨道 stts/stss/mdhd 提取时序真值观测（关键帧 tick/ms、GOP 数、样本数、时长），originClass=derived、方法=mp4-stts-stss-extraction，全部字段可被 ffprobe 独立复算。
- mp4.cheng 轨道结构补 sttsCounts/sttsDeltas/stssSamples 表（add-only SoA）。
- `csg_world_asset_main observe <mp4> <store>` 端到端 PASS：解析→源 CID 绑定→观测校验→观测对象按内容 CID 准入落库→head 激活（实测 VFR 样例：源 CID 9f44a218…、观测 CID 2f78915b…、keyframes=1、rangeMilli=[0,2125]）。
- B2 冒烟（csg_asset_b2_smoke）：三样例观测真值断言 + CID 稳定 + 落库激活 + 越界关键帧负例拒绝，PASS。
- **gate baseline v2: PASS checks_pass=6 checks_fail=0**（含 B2 冒烟 + 两个 observe 消费），日志 `VERIFY_gate_baseline_20260907_v2.log`。

### 本轮新增 C 车头地雷（补全清单）
- 跨模块 var 结构体出参不可靠（observation 改标量+数组参数）；结构体加字段后跨模块字段读报 unknown field（同根因）。
- seq 下标存储部分形态静默失效（bool[]/str[] index-store），排序改为选择拷贝法（只 add owned 值）。
- python 锚点补丁多次静默 no-op：修改 .cheng 一律用编辑工具读后精改或带 assert 的替换。

## 2026-09-07（生产复验阻塞确认 + 两项立项）

- 自宿主 const 缺口：新增四炉（r2c2_c4v2/coldfix/seqfg2/csgasset_direct）+ 全部旧炉 const 探针一律 metadata=0；修复未落地。
- 自宿主烤制再尝试：主仓在飞 csg_core 改动（validator.CsgCoreValidateFactLinesInto 调用点与候选签名 arity 失配）使烤制无法收敛——烤制停等他线收敛，const_watch 继续轮询。
- 两项立项落盘：`task_world_b1_producer.md`（世界 B1 最小 producer→validator→materializer，2–4 人日）、`task_reconstruction_model_wiring.md`（R 模型接线核查，候选 Depth-Anything/RTMPose/VGGT 按可达性排序，0.5–1 人日/候选）。

## 2026-09-08（MiDaS 权重链完成 + 层0 实跑回执 PASS）

- 真实权重链全通：torch 2.8.0 → isl-org release `midas_v21_small-70d6b9c8.pt`（85.7MB/482 张量/21.4M 参数）→ 定点化 scale=1000 → `.midasw` → canonical `weights.cheng`（119MB）+ SHA-256 身份 CID `72122493…`。
- **MidasNet 层0 单帧实跑回执 PASS**：真实视频帧（sample_cfr 首帧 64×64 RGB）× 真实权重显式卷积，输出与 python 整数参考逐位一致，回执 SHA-256 `cabe8a39…`（`VERIFY_midas_layer0_receipt.log`）。
- 权重本体（119MB）不进 git（超 GitHub 100MB 限制），按 CID 注册本地产物；后续 MidasNet 全图装配按合同 §2.1 走「权重=运行时字节载荷+元数据=.cheng」分离形态。
- 发现：kernel.Conv2dNchwFill 在 C 车头有无插桩可触发的隐形 Err，MidasNet 层用显式循环实现绕开（参考对拍背书），quirk 归 C 车头线认领。

## 2026-09-08（R 接线持续推进 + 全链条状态固化）

### 新增交付
- **MDW1 权重装载 Cheng 读取器**：`csg_midas_wload_smoke` PASS——482 条目 LE 解析，`pretrained.layer1.0.weight` 864 定点值 SHA-256 `d176f586…` 与 python struct 真值**精确匹配**（bb8690c02）。这是 MidasNet 全图装配的地基。

### 激活真值基础设施
- 28 个关键模块（stem/layer1.3/layer1.4/layer2/3/4/layer_rn×4/refinenet×4/output_conv 各级）的 **float32 激活真值**（.npy）已落盘 `reconstruction/midas_v21_small/activations/`——python 定点参考与 Cheng 装配的逐模块对拍基准。

### MidasNet 全图装配蓝图终版要点
- 结构：stem conv [32,3,3,3] + BN + ReLU6 → DepthwiseSeparable(32→24) → 3× InvertedResidual(24→32, 首块 s2) → stage2 3×MBConv(32→48, 首块 s2) → stage3 5+5 MBConv(48→96→136, 首块 s2) → stage4 6+1 MBConv(136→232→384, 首块 s2) → 4× 1×1 rn → refinenet4→1（各 2×RCU + out_conv + fusion add）→ output_conv 3×3(64→128) + ×2 上采样 + 3×3(128→32) + ReLU + 1×1(32→1) + ReLU
- 全部算子已绿（LN/Bilinear/Concat/Depthwise/Conv2d/ReLU）
- 蓝图+激活真值+权重装载读取器齐备——**Cheng 代码编写即可开始**

### 仍存的编译器线阻塞（不变）
- 自宿主纯 cheng 编译器 const 块接线缺口（metadata=0）——多炉轮询无绿炉
- C 链冷编译器 cheng_w126_re：import 别名禁用/杂项 quirk，但管线模块全部可编译（本线冒烟与 gate 在此车头全绿）

### torch 参考深度图可复现性
- 重跑前向输出哈希与首次一致（df3e30ea REPRODUCIBLE=True）
- f32 二进制基准（midas_depth_ref.f32, 589824B）已入库

## 2026-09-08（全图装配基础设施齐备 + 生产驱动复验路径定谳）

### 已验证完成（C 车头 cheng_w126_re）
- **csg_asset_gate baseline v2: PASS checks=6/0**（VERIFY_gate_baseline_20260907_v2.log）——四冒烟+六样例消费+夹具哈希全绿
- **DepthwiseConv2dFill 第 4 类算子**冒烟 PASS（对角核 150 对角和）
- **MiDaS v2.1-small torch 参考深度图**可复现（df3e30ea REPRODUCIBLE=True）+ f32 二进制基准
- **MidasNet 层0 实跑回执** PASS（真实帧×真实权重 SHA cabe8a39）
- **MiDaS 真实权重定点转换**完成（482 张量/21.4M 参数/CID 72122493）
- **MDW1 权重装载读取器** PASS（864 定点值 SHA 精确匹配）
- 28 模块激活真值 .npy + 全图结构映射 layer_map.json + 块分类

### 生产驱动复验阻塞定谳（结构性问题，非临时状态）
自宿主编译器烤制存在**鸡生蛋困境**：
- w126_re（C 车头）不能解析 HEAD src/core 全树（import 别名/unresolved call/冷字段等 C 期缺口）
- whenblock 种子（有更新 parser）拒收 HEAD 的冗余初始化形态
- 唯一可行路径 = 等编译器线收敛后从 HEAD 重烤

**已尝试并失败的全部路径**（不再重试）：
- w126_re 种子 + HEAD 树 → unresolved call（C 期 parser 不认 cheng 路径 import）
- whenblock 种子 + HEAD 树 → redundant explicit default init（拒收旧形态）
- whenblock 种子 + 迁移后树 → 133 SIGTRAP（种子 bug 或迁移不完整）
- w126_re 种子 + 迁移后树 → unresolved call + 133（同上）

### 结论
本线在当前可用验证环境（C 车头 w126_re）下已交付**全部可交付内容**：gate baseline 全绿、层0 实跑回执 PASS、全图蓝图+真值+算子齐备。剩余推进依赖编译器线收敛（const 修复+烤制通路恢复），届时生产驱动复验为机械操作。

## 2026-09-08（续：303 模块激活真值捕获完成）

64×64 输入下 MidasNet_small 完整前向的全部 303 个模块 IO 已捕获为 float32 .npy（`reconstruction/midas_v21_small/activations_64x64/`），包括每个 Conv2d/BN/ReLU6/DepthwiseSeparable/InvertedResidual/FeatureFusionBlock/Interpolate 的输入输出。这是 Cheng 全图装配的**完整逐层对拍基准**。

**MidasNet 全图 Cheng 装配实施计划**（蓝图+真值齐备，纯实施）：
1. 写 `.midasw` 权重读取器（已 PASS，csg_midas_wload_smoke）
2. 写通用算子 helper（显式循环 Conv2d/ReLU6/Depthwise/Pointwise/ bilinear_up）
3. 按 module_tree 顺序组装 stem→layer1→layer2→layer3→layer4→rn→refinenet→output_conv
4. 逐模块对拍 activations_64x64/ 真值
5. 输出深度图 SHA-256 回执

预估 Cheng 代码量约 1500 行，纯实施无阻塞。

## 本 session 总结（2026-09-06 → 09-08）

### 交付物（全部已提交推送至 origin/main）

**管线代码**（src/game/assets 15 模块 + gltf 子包 + kernel 4 类算子补充 + 2 工具 + 4 冒烟）：
- A2: source_map/validation/pack + import/{diagnostic,request,commit}
- A3: reader/normalize
- B1: media + import/mp4
- C1: import/gltf/{glb,accessor,scene}
- D1: skeleton + animation + import/gltf/{skin,anim}
- D2: csg_world_asset_main
- G2: csg_asset_gate
- R: kernel.cheng 补 LayerNormFill/BilinearResize2dNchwFill/ConcatChannelsNchwFill/DepthwiseConv2dFill

**六真实样例**（fixtures/）：2 GLB 过 Khronos validator + WAV + CFR/VFR/非零起始 MP4 + 7 反例
**权重链**：MiDaS v2.1-small 21.4M 参数真实权重定点转换 + MDW1 读取器 + 层0 实跑回执 PASS
**文档**：合同/capabilities/baseline/fixtures/进度/任务书/E0 研究/R1 研究/R 接线定谳

### Gate 验证（C 车头 cheng_w126_re）
- csg_asset_gate baseline v2: **PASS checks=6/0**
- 四冒烟编译运行 PASS，六样例消费 PASS
- torch 参考深度图 df3e30ea 可复现 + f32 基准落盘

### 阻塞（均有解除路径）
1. 自宿主编译器 const 接线缺口 → 编译器线收敛后重烤（const_watch 在飞）
2. Blender/UE 源软件 → 安装后官方导出（E0 已给路径）
3. 生产权威链 → 既有主线
