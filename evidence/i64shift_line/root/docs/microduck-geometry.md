# MICRODUCK 机器鸭几何参数表（视频帧测量）

来源：`/tmp/xhs_duck.mp4`（30s，960x720，25fps，Isaac Sim/PhysX 渲染）。
方法：ffmpeg 1fps 抽帧 + 高倾角区间加密抽帧 → PIL 颜色分割（白壳/橙色/深色关节三分类）逐行轮廓测量 → 篮球（直径 24.0–24.6 cm，取 24.2）作像素标尺。
抽帧与网格测量图留存于 `/tmp/microduck_frames/`（`f_XX.png` 原帧、`g_*/h_*` 网格放大图、`measure_out.txt` 轮廓数据）。

## 0. 代表帧清单（10 张）

| 帧 | t (s) | 视角/姿态 | 用途 |
|---|---|---|---|
| f_01 | 0.5 | 右侧向、近直立 | 头轮廓长、颈、直立站姿 |
| f_04 | 3.5 | 右侧、深蹲前倾（OSD tilt≈9.0°，全片最大） | 髋/膝弯曲极限、大腿:小腿 |
| f_07 | 6.5 | 正面、分腿 | 髋外展、躯干正面宽、眼环 |
| f_10 | 9.5 | 正面 3/4、近直立 | 总高、头宽、颈宽、站距 |
| f_13 | 12.5 | 背面 3/4 | 背部无臂/无尾确认 |
| f_19 | 18.5 | 左侧、单腿高抬 | 髋摆动幅度、悬空踝 |
| f_24 | 23.5 | 左侧、低头+对侧脚抬起 | 头侧轮廓、足板长、踝俯仰 |
| f_27 | 26.5 | 背面 3/4 | 双腿外展对称性 |
| f_29 | 28.5 | 左前、仰头 | 颈俯仰行程 |
| f_30 | 29.5 | 正面、近直立 | 头正面宽、眼环、足正面 |

OSD 遥测（每帧左上）：`t / ball 速度 / tilt 角度 / jointcontrol / free ball`。30s 内 tilt 0.8°–9.6°，1fps 采样未见完全倒伏；"free ball" 表明球为无驱动自由体，"jointcontrol" 表明关节空间控制。

## 1. 比例参数表（身高 H=1 归一；绝对值按 H=33cm 名义值）

证据等级：**高** = 多帧一致且颜色分割可复核；**中** = 单帧清晰或受姿态/偏航/遮挡影响，给区间；**低** = 假设/文献填补。

| 连杆/尺寸 | H 归一（区间） | 绝对值 @H=33cm | 证据 |
|---|---|---|---|
| 总站立高 H（头顶→足底） | 1.0 | 32–35.5 cm（名义 33） | 高（5 帧球尺交叉 7.4–8.3 px/cm） |
| 头长（前后，含帽檐/喙） | 0.40–0.46 | 13.5–15 cm | 高（f_01/f_19/f_24 一致 ≈105–115px） |
| 头宽（左右） | 0.34–0.42 | 11.5–13.5 cm | 中（f_30 近正面 90–105px，略有偏航） |
| 头高（含橙色帽檐+喙） | 0.22–0.27 | 7.5–9 cm | 高（平视帧 62–72px） |
| 眼环外径（黄色） | 0.08–0.10 | 2.7–3.3 cm | 中 |
| 颈可见长 | 0.12–0.16 | 4–5.3 cm | 中（低头/抬头帧变化大） |
| 颈宽（深色伺服叠块） | 0.09–0.10 | 3.0–3.3 cm | 高（多帧 23–25px 恒定） |
| 躯干宽（正面） | 0.22–0.30 | 7.5–10 cm | 中（偏航影响：60px@3/4 vs 80px@正） |
| 躯干深（侧向） | 0.20–0.26 | 7–8.5 cm | 中 |
| 躯干高（颈底→髋线） | 0.24–0.27 | 8–9 cm | 高（多帧 60–65px） |
| 髋间距（关节中心） | 0.25–0.34 | 8.5–11 cm | 中（0.26=中立位，0.34=外展态） |
| 大腿长（髋→膝） | 0.18–0.24 | 6–8 cm | 中（f_04≈53px、f_24≈61px、f_19≈40px） |
| 小腿长（膝→踝） | 0.15–0.20 | 5–6.5 cm | 中（44/50/40px） |
| 大腿:小腿 | 1.15–1.25 : 1 | — | 中 |
| 踝关节离地高 | 0.04–0.07 | 1.5–2.3 cm | 中 |
| 足板长（前后） | 0.14–0.18 | 4.5–6 cm | 中（f_24 侧向 40–47px，悬空足清晰） |
| 足板宽（左右） | 0.12–0.16 | 4–5.3 cm | 中（f_10 正面 33–40px） |
| 足总厚（含趾/上翻边） | 0.05–0.09 | 1.7–3 cm | 中（底板厚 ≈0.03–0.05H） |
| 头顶离髋高（颈+头堆叠） | ≈0.56 | ≈18.5 cm | 中 |

整体高宽比：直立轮廓最大宽（头）≈0.40H → 高:宽 ≈ 2.5:1；分腿姿态轮廓宽可达 0.55H。头是最大的单一视觉块（头长≈身高 42–46%，"鸭头面包块"造型）。

## 2. 关节位置与自由度

关节离地高度（站立、H 归一）：

| 关节 | z/H（单侧） | x 偏置 | 轴向 | 证据 |
|---|---|---|---|---|
| 髋 | 0.42–0.50（直立微屈取 0.44） | ±0.13 | 俯仰(横轴)+横滚(前后轴)确认；偏航存在性未证实 | 中 |
| 膝 | 0.20–0.26 | ±0.12 | 俯仰（铰链） | 中 |
| 踝 | 0.04–0.07 | ±0.13 | 俯仰+横滚（足板贴贴球面需两轴） | 中 |
| 颈基座 | ≈0.72 | 0 | 偏航+俯仰（深色叠块+白色颈环两级） | 中 |

自由度配置结论：

- 双腿：髋俯仰、髋横滚、膝俯仰、踝俯仰、踝横滚 **确认**（f_04 前后劈腿→髋俯仰；f_07/f_10 外八→髋横滚；f_04 深弯→膝；f_24/f_19 悬空足俯仰→踝俯仰；贴弧面站立→踝横滚）。髋偏航 **推断**（30s 内整机连续转体，可用髋偏航搓球实现，也可能是足底摩擦拖拽自由球，画面无法区分）。
- 颈：俯仰 **确认**（f_04/f_24 低头 vs f_29/f_30 仰头）；偏航 **中**（头朝向与躯干朝向多处不一致）；横滚 未证实（f_01 头倾斜可能是俯仰+偏航复合）。
- 无臂、无尾（f_07/f_13/f_27 背面/正面确认；侧向"白臂状"块为外展大腿板）。
- 合计：**确认 11–12 DoF（每腿 5 ×2 + 颈 1–2）；含推断 12–14（每腿 6 ×2 + 颈 2）**。典型伺服构型即每腿 6（髋 YPR+膝+踝 PR）+颈 2 = 14。

## 3. 质量与惯量（均匀密度近似 + 伺服占比）

体积→质量：外壳空腔按有效密度 0.25–0.7 g/cm³（关节处高、壳体低）。

| 部件 | 体积估算 @33cm | 质量 (kg) | 证据 |
|---|---|---|---|
| 头（14×13×8.5 cm 壳体+传感） | ≈1.4–1.6 L | 0.35–0.65 | 低 |
| 颈 | — | 0.02–0.05 | 低 |
| 躯干（含电池/主控） | ≈0.6–0.7 L | 0.25–0.45 | 低 |
| 髋/盆块 | — | 0.05–0.10 | 低 |
| 大腿 ×2 | ≈100 cm³/条 | 0.03–0.06/条 | 低 |
| 小腿 ×2 | ≈60 cm³/条 | 0.02–0.04/条 | 低 |
| 足 ×2（含踝双伺服） | ≈75 cm³/只 | 0.03–0.05/只 | 低 |
| **整机** | — | **0.9–1.8（名义 ≈1.2）** | 低 |

- 质心高度 ≈ 0.58–0.65 H（头部大质量堆高所致，偏上）。低。
- 缩放律：`m ≈ 1.2 kg × (H/0.33m)^2.5–3`。若按 H=40cm 构建则 1.6–2.6 kg，H=45cm 才进入 2–4 kg 带。
- 同级 sanity check（文献记忆，**低**）：ROBOTIS OP3 ≈51cm/2.8kg/20DoF；Darwin-Mini ≈17cm/≈0.6kg/16DoF；KHR-3HV ≈39cm/≈1.5kg。按立方插值，33cm 落在 0.8–1.5 kg，与上表一致。任务提示的 2–4 kg 属 40cm+ 级别或金属齿轮密集构型。RoboMaster 步兵为轮式平台，不构成双足对照，剔除。
- 惯量公式（引擎填参用，均匀盒近似）：`I = m/12 × (边长²之和)`，例：头 0.5 kg、14×13 cm 截面 → 偏航 `Izz ≈ 0.5/12×(0.14²+0.13²) ≈ 1.5×10⁻³ kg·m²`。头部质量/惯量占比大，平衡控制器必须计入（相当于顶端摆锤）。

## 4. 转换公式（比例 → 引擎场景绝对尺寸）

```
dim = ratio_H × H            # H 为设定身高
H 建议 0.33 m（可 0.30–0.40）
m_total ≈ 1.2 × (H/0.33)^2.7  kg
球半径 ≈ 0.73 × H（球径 24.2cm/身高33cm；引擎可独立设 0.12 m）
```

## 5. 引擎映射建议

| 结构 | 刚体表达 | 关节 |
|---|---|---|
| 头 | box（0.14×0.13×0.085 m @0.33H，或前后向 capsule 近似）；质量密度调高 | 颈: revolute(yaw) + revolute(pitch) 串联，颈杆可省略为质量点 |
| 躯干 | box（0.095×0.085×0.085），上宽下窄忽略 | 颈基座固连躯干顶 |
| 大腿/小腿 | capsule ×2（半径 ≈0.03H / 0.025H） | 髋: 铰链三连 yaw-pitch-roll（或 universal+rotational）；膝: revolute(pitch)；踝: universal(pitch+roll) |
| 足板 | box + 倒圆角/底面球化（球-球接触更稳），μ≈0.8–1.2，厚度 ≈0.02m | — |
| 篮球 | sphere r≈0.12 m，free 6-DoF 体（OSD "free ball"），低阻尼 | 无驱动，仅接触 |
| 控制接口 | 关节空间目标角 + PD（OSD "jointcontrol"）；踝俯仰/横滚为平衡主执行器，髋俯仰为恢复策略；头部按高质心摆锤计入 ZMP | — |

注意：头部占整机质量 30–45% 且位于最高处，capsule 化时不要把头质量摊薄；足板接触点在球面顶部，接触 patch 小，建议提高接触求解迭代而非加厚足板造假。

## 6. 证据等级分布与不确定项

- 高（多帧分割复核）：总高/球尺、头长/头高、颈宽、躯干高、足板长、整体高宽比、无臂无尾。
- 中（单帧或姿态相关）：头宽、躯干宽/深、大腿:小腿、足宽、髋间距、各关节 z 比例、踝两轴、颈偏航、眼环尺寸。
- 低（假设/记忆）：全部质量数字、质心高度、髋偏航存在性、眼球数量（仅见单只黄环眼+暗色横缝，是否对称双眼未确认）。
- 30s 内未见完全倒伏帧（1fps 采样，最大 tilt≈9.6°@t≈3.6s）；倒伏瞬间如需测量需对原始视频做更密抽帧。
- 所有像素测量固有 ±3px（≈±1% 身高）读数误差 + 渲染透视（相机俯视，足部比球心更近相机 ≈2–3% 比例偏差），区间已覆盖。

## 7. 完整网格映射表（官方 46 件 STL 全量入库）

来源：`https://github.com/adityakamath/microduck_description`（main 分支 `meshes/`，标准二进制 STL，单位米，URDF 中 `scale="1.0 1.0 1.0"`）。
入库：`assets/microduck_meshes/`（顶层 38 件 + `test/` 副本 8 件 = **46 件，共 25,293,964 字节**）；同步脚本 `tools/microduck_mesh_sync.sh`（GitHub API 列树 + raw 下载，字节数一致即跳过，幂等可重跑）。

实测备注：
- 标准二进制 STL，`84 + 50×三角数 = 文件字节数` 精确成立（例 xl330：84+50×4126=206384）；**80 字节文件头全零，不含 COLOR/MATERIAL 扩展文本**（上游任务描述称含该扩展头，与实测不符，如实记录）。
- `test/` 8 件与顶层同名件 sha256 逐一比对**全部一致**（上游测试副本，非新几何）。

列说明：
- **URDF link**：来自 `/tmp/microduck_urdf/microduck.urdf` 的 `<visual><geometry><mesh filename="../meshes/...">` 机械解析；×N 为同一 link 内多次 visual 引用。
- **引擎连杆槽位**：取自 `/tmp/microduck_urdf/robot_walk.xml`（MuJoCo body 名，即引擎刚体槽位，15 个 body）。PCB/装饰壳等未独立建体的内部/装饰件标 `-`。
- **证据**：格式「URDF / 引擎槽位」。高=机械解析或 link/body 与网格同名直接对应；中=经 joint 链路唯一对应但名字非同名；`-`=不适用。

| 文件（assets/microduck_meshes/） | 字节 | URDF link（visual 引用） | 引擎连杆槽位 | 证据 |
|---|---|---|---|---|
| ankle_left.stl | 248984 | ankle_left | ankle_left | 高 / 高（同名） |
| ankle_right.stl | 248884 | ankle_right | ankle_right | 高 / 高（同名） |
| banana_pcb_locker.stl | 69484 | trunk_base | -（内部件：PCB 锁扣） | 高 / - |
| bearing_roll.stl | 121084 | yaw2roll_left、yaw2roll_right | yaw2roll（左）/ bearing_roll（右） | 高 / 高（同名） |
| bottom_head_shell.stl | 1048584 | jaw_soft | bottom_head_shell（头刚体） | 高 / 高（同名） |
| elec_rpi_robot_hat_pcb.stl | 942884 | jaw_soft | -（内部件：Robot HAT PCB） | 高 / - |
| face_part.stl | 570684 | jaw_soft | -（装饰件：脸壳，视觉并入头体） | 高 / - |
| foot_left.stl | 996184 | ankle_left | ankle_left（足体） | 高 / 高（link 同名） |
| foot_right.stl | 995784 | ankle_right | ankle_right（足体） | 高 / 高（link 同名） |
| hip_l.stl | 1048584 | hip_left、hip_right | hip_l（左）/ hip_l_2（右） | 高 / 中（非同名） |
| jaw.stl | 495984 | jaw | -（引擎未建 jaw 体，视觉并入头体） | 高 / - |
| jaw_soft.stl | 336384 | jaw | -（引擎未建 jaw 体，视觉并入头体） | 高 / - |
| left_shell.stl | 1048584 | trunk_base | trunk_base（躯干侧壳） | 高 / 高（link 同名） |
| leg.stl | 738884 | leg_left、leg_right | leg（左）/ leg_2（右） | 高 / 中（非同名） |
| lens.stl | 93684 | jaw_soft | -（内部件：摄像头镜头） | 高 / - |
| m12_lens_holder.stl | 549684 | jaw_soft | -（内部件：M12 镜头座） | 高 / - |
| motor_support.stl | 180884 | jaw_soft | -（内部支架） | 高 / - |
| neck.stl | 73484 | neck（×2 visual） | neck | 高 / 高（同名） |
| neck_pitch.stl | 356084 | neck_pitch | neck_pitch | 高 / 高（同名） |
| noenoeil.stl | 49284 | jaw_soft | -（装饰件：眼睛） | 高 / - |
| np_f970.stl | 1048584 | trunk_base | -（内部件：电池/电源模块，质量并入躯干） | 高 / - |
| pcb__raspberry_pi_zero_2_w.stl | 1048584 | jaw_soft | -（内部件：Raspberry Pi Zero 2 W） | 高 / - |
| power_support.stl | 641684 | trunk_base | -（内部支架） | 高 / - |
| right_shell.stl | 1048584 | trunk_base | trunk_base（躯干侧壳） | 高 / 高（link 同名） |
| seeed_bearing__configuration__22x16x4.stl | 1048584 | upper_leg_left、upper_leg_right、hip_left、hip_right、yaw2roll_left、yaw2roll_right、yaw_roll_motion、neck_pitch、trunk_base | -（内部件：22×16×4 轴承，并入各相邻刚体） | 高 / - |
| seeed_bearing__configuration_default.stl | 1048584 | ankle_left、ankle_right、jaw_soft | -（内部件：默认轴承，并入相邻刚体） | 高 / - |
| soft_mouth_top.stl | 393584 | jaw_soft | -（装饰件：软上嘴） | 高 / - |
| sole_left.stl | 789484 | ankle_left | ankle_left（足底板） | 高 / 高（link 同名） |
| sole_right.stl | 794484 | ankle_right | ankle_right（足底板） | 高 / 高（link 同名） |
| speaker.stl | 684 | jaw_soft | -（内部件：扬声器） | 高 / - |
| top_head_shell.stl | 806084 | jaw_soft | bottom_head_shell（头刚体顶壳） | 高 / 中（非同名） |
| trunk_base.stl | 184984 | trunk_base | trunk_base | 高 / 高（同名） |
| upper_leg_left.stl | 612584 | upper_leg_left | left_upper_leg | 高 / 中（非同名） |
| upper_leg_right.stl | 612584 | upper_leg_right | right_upper_leg | 高 / 中（非同名） |
| upper_leg_rigidity_plate.stl | 180084 | upper_leg_left、upper_leg_right | left_upper_leg / right_upper_leg | 高 / 中（非同名） |
| xl330.stl | 206384 | 15 处 visual：trunk_base（×2）、yaw2roll_left、yaw2roll_right、leg_left、leg_right、upper_leg_left（×2）、upper_leg_right（×2）、neck（×2）、jaw_soft（×2）、yaw_roll_motion | -（内部件：XL330 伺服壳，并入各相邻刚体） | 高 / - |
| yaw2roll.stl | 620284 | yaw2roll_left、yaw2roll_right | yaw2roll（左）/ bearing_roll（右） | 高 / 高（同名） |
| yaw_roll_motion.stl | 290784 | yaw_roll_motion | yaw_roll_motion | 高 / 高（同名） |
| test/banana_pcb_locker.stl | 69484 | -（test/ 副本，URDF 未引用） | - | 高（sha256 与顶层一致） |
| test/elec_rpi_robot_hat_pcb.stl | 942884 | -（test/ 副本，URDF 未引用） | - | 高（sha256 与顶层一致） |
| test/m12_lens_holder.stl | 549684 | -（test/ 副本，URDF 未引用） | - | 高（sha256 与顶层一致） |
| test/motor_support.stl | 180884 | -（test/ 副本，URDF 未引用） | - | 高（sha256 与顶层一致） |
| test/pcb__raspberry_pi_zero_2_w.stl | 1048584 | -（test/ 副本，URDF 未引用） | - | 高（sha256 与顶层一致） |
| test/speaker.stl | 684 | -（test/ 副本，URDF 未引用） | - | 高（sha256 与顶层一致） |
| test/yaw2roll.stl | 620284 | -（test/ 副本，URDF 未引用） | - | 高（sha256 与顶层一致） |
| test/yaw_roll_motion.stl | 290784 | -（test/ 副本，URDF 未引用） | - | 高（sha256 与顶层一致） |

统计：46 行 = 结构件（有引擎槽位）21 件 + 内部/装饰件（标 `-`）17 件 + test/ 副本 8 件。引擎侧 15 个刚体槽位全部有网格视觉来源：trunk_base、yaw2roll、bearing_roll、hip_l、hip_l_2、left_upper_leg、right_upper_leg、leg、leg_2、ankle_left、ankle_right、neck、neck_pitch、yaw_roll_motion、bottom_head_shell（jaw 关节未导出到引擎，jaw/jaw_soft 视觉并入头体）。
