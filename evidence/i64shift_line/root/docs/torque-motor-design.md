# 铰链 + 力矩电机实现设计（机器鸭 A 段第三步）

状态：设计稿（为编码备料，未实现）。
基线：2026-09-11 全量读码 `src/game/world3d.cheng`(559行) / `physics3d.cheng`(333行) / `constraints3d.cheng`(106行) / `contacts3d.cheng`(334行) / `csg/joint_motor.cheng`(158行) / `tests/rigid_ball_probe.cheng`(150行)。
本文档自足：不看代码即可开工；引用格式 `文件:行号:函数`。

---

## 0. 现状基线（设计输入的代码事实）

求解器结构（`physics3d.cheng:253:Physics3dStep`，dt=1/240，`physics3d.cheng:272`）：

1. 存运动列快照（`physics3d.cheng:139:physics3dSaveMotion`，含角速度列）。
2. 相位1 线性积分：`x += v*dt + (F/m)*dt²/2`，常力解析精确（`physics3d.cheng:276-288`）。**角速度没有任何积分路径**——ω 只被滚动接触冲量改写（`physics3d.cheng:220:physics3dBallRollingContact`）。
3. 相位2 约束投影：纯位置级 Gauss-Seidel，96 次交替扫（正/反序），残差超 10mm 门禁再补 4096 次（`constraints3d.cheng:14-15`，`constraints3d.cheng:101:Constraints3dSolve`）。投影算子只有"点-点距离"一种（`constraints3d.cheng:18:constraints3dProjectOne`），双/单边由 `conKind` 分支（`constraints3d.cheng:36-54`）。伺服 = 移动 `conTarget`（`constraints3d.cheng:33` 注释、`csg/execution.cheng:1258-1324` 的 winch 有界速率走靶）。
4. 相位2b 球体地面 prepass 推出（`physics3d.cheng:202:physics3dBallGroundPushout`）。
5. 相位3 接触：仅 球-平面 / 球-AABB面 / 球-球，位置级库仑锥（锥界 = μ×穿透深度，`contacts3d.cheng:88`），不受支持的组合上游硬失败（`contacts3d.cheng:3-4`）。约束相连对跳过自碰撞（`contacts3d.cheng:33:Contacts3dConstraintLinked`，按 conA/conB 判）。
6. Verlet-PBD 速度重建：`v = (p − p_prev)/dt + a*dt/2`，约束冲量经真实位移进入速度（`physics3d.cheng:314-324`）。
7. 球体滚动耦合：速度级库仑冲量同时作用 v 和 ω，粘滞冲量 `J = −u/(1/m + r²/I)`（`physics3d.cheng:212-250`）。
8. NaN/Inf 或残差超门禁 → 回滚快照、本 tick 作废（`physics3d.cheng:299-309`）。

世界状态（`world3d.cheng:39-78:World3d`）：纯标量 SoA float64/int32 列。bodyKind：Static=0/Dynamic=1/Rope=2/Anchor=3/**BallRigid=4**（`world3d.cheng:22-30`）。**没有 CapsuleRigid，没有姿态列**（球对称不需要；capsule 必须新增姿态）。约束列 conA/conB/conRest/conKind/conActive/conTarget，kind：RopeSegment=1/ConJoint=2（现状=双边距离）/Grasp=3/StepPull=4/DistMax=5/DistMin=6（`world3d.cheng:31-36`）。容量 MaxBodies=64 / MaxConstraints=96。

条件 preimage 先例：`|balls=` 段只在存在 BallRigid 体时追加，无球世界的 CID 与加球前逐字节相同；ω 走 milli-unit 量化（`world3d.cheng:477-506`，门禁用例 `rigid_ball_probe.cheng:118:casePreimageGate`）。注意：`|cons=` 段只写 conRest 不写 conTarget（`world3d.cheng:437-451`）——conTarget 是运行时伺服态，不进 CID。

质点系先例：余弦定理 角度↔端距 映射 + 有界速率伺服（`csg/joint_motor.cheng:66:JointMotorAngleToDist`、`:89:JointMotorDistToAngle`、`:111:JointMotorStep`、`:128:JointMotorState`）；二分 acos（`:41:jointMotorAcos`，60 次迭代、先钳域）。零依赖纯数学（无 World3d import），调用方把返回距离写入 `conTarget`。

确定性约束（必须遵守）：`std` 的 `sqrtFloat` 在现 backend 上有缺陷（<1 的输入原样返回，`csg/numerics.cheng:3-9`），开方一律 `CsgSqrt`；`std/math` 只有 `sinFloat/cosFloat`（Taylor）与 `clampFloat`，**没有 acos/atan2**——所有角度测量走"点积 + `jointMotorAcos` 式二分 + 符号点积"。量化一律 `CsgQuantMm`（int32 中转，`csg/numerics.cheng:42`）。

探针写法先例：case 函数返回 bool、main 按序门禁、物理循环内零 str 分配（trace 缓冲后置输出）、阈值硬断言（`rigid_ball_probe.cheng`）。

---

## 1. 铰链关节约束（两 capsule 绕共轴转动）

### 1.1 姿态与惯量（铰链的前置状态）

新增 bodyKind `World3dBodyCapsuleRigid = 5`，新增体列（对齐现有 SoA 风格）：

- 姿态四元数 `bodyQx/bodyQy/bodyQz/bodyQw: float64[]`（本地→世界旋转；capsule 轴 = 本地 +Z 经 q 旋转）。每 tick 末归一化（`CsgSqrt`）。
- 形状 `bodyHalfLen: float64[]`（圆柱段半长；半径复用 `bodyRadius`）。
- 力矩列 `bodyTx/bodyTy/bodyTz: float64[]`（对齐 bodyF*，`Physics3dClearForces` 同步清零）。

ω 沿用现有 `bodyAngVx/Vy/Vz`，语义=世界系（与球体滚动耦合一致，`physics3d.cheng:234-249` 直接以世界系使用）。

惯量取体坐标系对角 `(I_a, I_t, I_t)`：I_a = 绕轴，I_t = 绕横轴。实心胶囊精确组合公式（m、r、hl=圆柱半长，圆柱段质量 m_c = m·hl/(hl+2r/3)，两半球合计 m_h = m−m_c，半球质心距球心 3r/8）：

- `I_a = 0.5*m_c*r² + 0.4*m_h*r²`（两半球绕对称轴各 (2/5)(m_h/2)r²）
- `I_t = m_c*((2hl)²/12 + r²/4) + 0.4*m_h*r² + m_h*(hl + 0.375*r)²`

新增纯函数 `World3dCapsuleInertia(w, slot, axial: bool): float64`（对齐 `world3d.cheng:353:World3dBallInertia` 的调用契约：调用方保证 kind 与 invMass>0）。

角动力学与线性侧严格同构（这是设计主轴，逐相位对照 `physics3d.cheng:253:Physics3dStep`）：

1. 步前快照加 q 四列（`physics3dSaveMotion:139` 扩展），q_prev 同存。
2. 相位1 姿态积分：`q += 0.5*dt*ω_quat⊗q` 后归一化（dt=1/240 下与精确轴角式差异 O(dt³)；探针 A 不达阈才改精确式，需实验验证）。
3. 相位2 投影只改 x 与 q（见 1.3），**不碰 ω**。
4. Verlet 重建相位（`physics3d.cheng:314-324` 同层）加角重建：`ω = 2·vec(q_prev⁻¹ ⊗ q)/dt`。自由旋转部分精确还原旧 ω，约束修正部分按 /dt 进入 ω——与线性侧"约束冲量经真实位移进入速度"（`physics3d.cheng:311-313` 注释）完全同构，单一事实源，无双重计入。
5. 速度级末段（与 `physics3dBallRollingContact:220` 同层）加力矩积分：ω += I_w⁻¹·(τ − ω×(I_w ω))·dt，I_w = R·diag(I_a,I_t,I_t)·Rᵀ；陀螺项 10 个浮点运算必须含（省略会在快转轴倾斜时漂移）。电机若走 (a) 后备也在此层。

### 1.2 约束表述（5 行标量，全部双边）

新 `conKind = World3dConHinge = 7`。每铰链持两体 A（大腿）、B（小腿）的局部锚点与局部轴：

- `hAnchAx/Y/Z`、`hAxisAx/Y/Z`：A 局部锚点（相对 A 质心）、A 局部轴（单位向量，初始取本地 +Z）。
- `hAnchBx/Y/Z`、`hAxisBx/Y/Z`：B 同构。
- 定义时刻校验锚点重合（|x_A+R_A a_A − x_B−R_B a_B| < 1mm）与共轴，违者 panic（对齐 `World3dAddConstraint` 的 `world3d.cheng:190` 校验风格）。

世界系量每投影现算：`r_A = R_A·a_A`，`u_A = R_A·â_A`，B 同理。约束行：

- **C0..C2（锚点重合，3 行）**：`C_p = (x_B + r_B) − (x_A + r_A) = 0`。允许绕轴自由转动 + 完全锁死平移 3 自由度。
- **C3、C4（轴平行，2 行）**：取 A 局部系内与轴垂直的两参考向量 d_A、e_A（构建时正交化），`C3 = d_A^w · u_B`，`C4 = e_A^w · u_B`，其中 `d_A^w = R_A·d_A`、`u_B = R_B·û_B`。两行保证 u_B ∥ u_A，转轴方向的角自由度不受约束。

### 1.3 投影（广义逆质量 + 分块修正）

对标量行（方向 n，作用于体 i 的锚臂 r_i），广义逆质量：

`w_i = invM_i + Σ_k (T_k)²/I_k`，T = R_iᵀ(r_i × n)（体系下分解，除对角惯量，避免显式构 3×3 I_w）。

- **锚点块（3 行联立）**：有效质量矩阵 `K = (invM_A+invM_B)·I₃ − [r_A]×I_A⁻¹[r_A]× − [r_B]×I_B⁻¹[r_B]×`（对称正定 3×3）。Δp = −K⁻¹·C_p，按 `Δx_i = ∓invM_i·λ`、`Δθ_i = ±I_i⁻¹(r_i × λ)`（体系除对角）分摊；Δθ 以小角四元数 `Δq = (Δθ/2, 1) 归一` 左乘进 q。3×3 用 Cramer 法则；det < 1e-18 属构型错误 → panic（创建时校验锚臂非零，运行时数值护栏对齐 `jointMotorAcos` 的钳域风格，不走静默跳过）。
- **轴行（2 行各标量，纯角行）**：转 A 的 δω_A 改变 C3 经 `δω_A·(d_A^w × u_B)`，转 B 经 `δω_B·(u_B × d_A^w)`——力臂即 `n_A = d_A^w × u_B`、`n_B = u_B × d_A^w`（锚臂不进轴行）。λ = −C/(w_A + w_B)，w 用体系分解 `(Rᵀn)²/I` 分量和；修正只作用于 Δq，Δx = 0。

**雅可比计算量评估（每次投影）**：2 次四元数旋向量（~30 flop）+ K 组装 ~60 flop + 3×3 解 ~30 flop + 2 轴行 ~80 flop ≈ **每次投影 ~250 flop、每扫每铰链 ~250 flop**。96 次扫 × 4 铰链（双腿髋膝）≈ 10 万 flop/tick，相对现有 96×距离约束扫是同量级加项，无性能风险。

### 1.4 接入求解器与残差

`constraints3dProjectOne`（`constraints3d.cheng:18`）头部按 `conKind == World3dConHinge` 分派到新 `constraints3dProjectHinge(w, ci)`，返回该铰链残差 = max(锚点行 |C_p| 各分量（米）, 轴行 |C3|、|C4| × L_ref)，L_ref = min(|r_A|, |r_B|)——轴行无量纲，乘以参考锚臂折成米，与 10mm 门禁（`physics3d.cheng:25`）同单位。铰链 5 行在**同一次 ProjectHinge 调用内联立**（锚点块解耦轴行，一次过），不做 5 次独立标量扫，规避 Gauss-Seidel 行序偏置（见 §5 风险2）。

铰链相连两体自动被 `Contacts3dConstraintLinked`（`contacts3d.cheng:33`）跳过自碰撞（走 conA/conB，无需改）。

---

## 2. 力矩电机（τ_m 的施加路径）

### 2.1 选型：(b) 目标角伺服（位置级）为主，(a) 冲量对为后备

| | (a) 冲量对 | (b) 目标角伺服（选） |
|---|---|---|
| 施加点 | 速度级，投影+重建之后（与 `physics3dBallRollingContact` 同层）：ω_A += I_w⁻¹(τ dt)，ω_B −= 同值 | 位置级，作为第 6 行约束 `C5 = θ − θ_cmd` 进 solve，θ_cmd 每 tick 有界速率走靶 |
| 力矩上限 | 显式 τ_max 钳冲量 | 折算成每 tick 最大角修正（见 2.3） |
| 速度饱和 | 显式 ω_max 断矩 | 走靶速率上限 ω₀·dt 即饱和 |
| 与门禁/回滚关系 | 绕过约束门禁直改速度，能量注入先于投影削除，失控要靠外部钳 | 残差门禁、回滚、确定性全部自动继承（就是 `conTarget` winch 伺服的角域版，`csg/execution.cheng:1258-1324` 先例） |
| 前例一致性 | 只有球滚动接触一例 | `joint_motor.cheng` 整文件哲学："力矩级关节控制还原为位置级等价物"（文件头 1-26 行） |

**结论：先做 (b)。** 理由：全库求解哲学是位置级 + 伺服移靶 + 门禁回滚，(b) 零新风险面；(a) 保留为 M4 探针后的实验对比项（若伺服带宽不够，见 2.3 饱和折算，需实验验证）。

### 2.2 角度测量（零 atan2）

关节角 θ：q_rel = q_A⁻¹ ⊗ q_B，取 B 局部参考横向量 b_ref（构建时正交于轴）。世界系算：

1. `u = R_B·û_axis`（现等于 u_A 附近，投影后误差门禁内）。
2. `b = R_B·b_ref`，投影到垂直 u 的平面：`b' = b − (b·u)u`。
3. `c = clamp(d_A^w · b'/|b'|, −1, 1)`，θ_cos = `jointMotorAcos(c)`（直接复用 `csg/joint_motor.cheng:41`，零依赖不破坏）。
4. 符号 = sign(`(d_A^w × b') · u`)（dot 取号，无 atan2）。

约定沿用 joint_motor 的屈曲惯例：θ=0 伸直，增大=屈曲；hAngleMin/hAngleMax 创建时钳入 [0°,180°]。

### 2.3 伺服与电机饱和建模

新增纯函数（进 `csg/joint_motor.cheng`，保持零依赖；与既有 `JointMotorStep` 同构）：

```
JointMotorHingeStep(cmdRad, targetRad, maxRatePerTick) -> 新 cmdRad   # 有界速率走靶，同 :111 的 6 行
```

每 tick（执行层调 `Physics3dStep` 之前，对齐 winch 走靶位置 `csg/execution.cheng:1258`）：

1. **速度饱和**：`rate = min(maxRatePerTick, ω₀·dt)`（ω₀ = 电机空载角速度）。
2. **堵转力矩饱和**：`rate = min(rate, τ_max·dt²/I_eff)`，I_eff = B 体绕铰链轴横惯量 I_t + m_B·d²，d = COM 到轴线的垂距（实现可保守取 |r_B_anchor|，只会压低速率不破饱和语义）。物理含义：一步内把 B 的角修正压到 τ_max 能给出的 Δθ = τ·dt²/I 以下，投影施加的广义冲量折算力矩恒 ≤ τ_max。
3. `hAngleCmd = JointMotorHingeStep(hAngleCmd, hAngleTarget, rate)`。
4. 投影阶段对 C5 = θ − hAngleCmd 用与轴行相同的广义逆质量分摊（只转 B，若 A invM=0 则 A 不动；两体皆动时按 w 分摊，反力矩自动成对出现=等大反向 τ）。

该模型即直流电机 τ-ω 线的端点钳制：堵转 τ_max 与空载 ω₀ 两帽，中间段由 P 走靶自然过渡（同 `joint_motor.cheng:21-26` 对 PD 语义的论证：速率帽=D 项，钳到=无超调）。

### 2.4 被动限位

膝关节限位复用 C5 机制的两个单边变体：θ > hAngleMax 或 θ < hAngleMin 时仅该方向投影（对齐 `constraints3d.cheng:45-54` 的 DistMax/Min 单边模式），无电机参与，行残差同折算。

---

## 3. 与质点系的混合（质点人形 + 刚体连杆）

过渡期形态：骨盆等仍是 Dynamic 质点（现有 role 槽位 rig，`render/character.cheng:90-175` 消费 pelvis/knee/foot 槽），肢体换成 CapsuleRigid。两类混合约束：

### 3.1 球销（质点 ↔ capsule，3 行）

`conKind = World3dConSpherePin = 8`：`C_p = x_point − (x_capsule + R·a_anchor) = 0`，3 行，K 退化成 `(invM_p + invM_c)·I₃ − [r_c]×I⁻¹[r_c]×`，同一分块解法（1.3），质点侧无角项。销连对自动免自碰撞（conA/conB）。

### 3.2 混合电机（质点系余弦定理直接复用）

质点无姿态 → 铰链无参考系 → **不做角约束，做锚距伺服**：新增 `conKind = World3dConAnchorDist = 9`，1 行 `C = |x_point − x_capsule − R·a_anchor2| − L_cmd`，L_cmd 由**现有 `JointMotorAngleToDist/JointMotorStep` 原样驱动**（`csg/joint_motor.cheng:66/:111`）——质点-膝-capsule 足锚构成两骨三角，角度目标照旧折算距离目标。这是 joint_motor 先例的逐字复用，唯一新东西是距离约束的作用点在 capsule 锚点而非质心（雅可比 = 锚点行，同 1.3 广义质量）。

### 3.3 混合态的语义边界

- 质点↔capsule 之间姿态自由度不受约束（capsule 姿态靠重力+电机稳定）；鸭躯干成刚体后再升格为全铰链（M4 形态），约束行数 3→5 增量迁移，conKind 换 7 即可，锚点列原样沿用。
- 混合态电机 = 距离伺服（走 conTarget 同款机制但目标存关节列，见 §4 CID 决策）；刚体态电机 = 角伺服 C5。两层 API 都落在 `JointMotorState` 的 `Command(angleDeg)/Tick()` RL 接口形状上（`csg/joint_motor.cheng:150-157`），策略层无感。

---

## 4. CID / preimage 设计（沿用球刚体手法）

### 4.1 体列：`|caps=` 条件段

仿 `|balls=`（`world3d.cheng:477-506`）：统计 CapsuleRigid 计数，仅当 >0 时在 walls 段后追加：

```
|caps=<n> |cap<i>: qx,qy,qz,qw (milli-unit×4), halfLen(mm), wx,wy,wz (milli-unit×3)
```

capsule 的 ω 进 `|caps=`（与 `|balls=` 的量化器同款，`world3d.cheng:495-497`），**`|balls=` 段与其门禁一字不动**——纯球世界字节兼容是平凡成立的，纯 capsule 世界只有 `|caps=`。四元数 4 份额外哈希后保持 |q|=1 由验证函数保证（`World3dValid` 扩展项）。

### 4.2 关节列：`|joints=` 条件段 + 不动 conTarget

铰链/混合关节的扩展列全部平行于约束槽（长度 World3dMaxConstraints，`World3dReset:137-143` 同款分配）：

`hAnchA*`(6列含轴)、`hAnchB*`、`hAxisA*`、`hAxisB*`、`hAngleCmd`、`hAngleTarget`、`hAngleMin/Max`、`hMaxRate`、`hTauMax`、`hOmega0`（float64），`hFlags`(int32，记录参考向量正交化种子等构型)。

**决策：新 kind 不复用 conTarget。** 现状 `|cons=` 段只哈希 conRest 不哈希 conTarget（`world3d.cheng:437-451`）——winch 的运行时靶不进 CID。电机的 cmd/target 是决定后续演化的状态，**必须**进 CID；若复用 conTarget 则要么给 `|cons=` 加字段（改动所有既有世界的 CID，破坏链连续门禁），要么漏哈希（假确定性）。故全部关节态放 `|joints=` 段：

```
|joints=<n> |j<i>: kind,A,B, axA(milli)×3, axB(milli)×3? … 锚点(milli)×6, 轴(milli-unit)×6,
    cmd(millideg), target(millideg), min/max(millideg), maxRate(milli), tauMax(milli N·m), omega0(milli rad/s)
```

仅当存在 active 的 kind∈{7,8,9} 约束时追加；无关节世界逐字节不变。量化全走 `CsgQuantMm`（millideg = 度×1000 同量化器）。

### 4.3 配套改造清单（全部必改，漏一处即假绿）

- `World3dReset`（:80）：新列 setLen+预分配。
- `World3dSpawnBody`（:153）：capsule 初始化 q=(0,0,0,1)、halfLen。
- `World3dClone`（:284）：拷贝 q/halfLen/关节列（否则 checkpoint 快照失真）。
- `World3dValid`（:519）：q 有限且 |q|≈1、轴单位、锚点有限、力矩有限。
- `physics3dSaveMotion/RestoreMotion`（:139/:171）：**回滚快照必须加 q 四列**（否则带姿态世界的失败 tick 回滚不彻底，CID 链断）。
- `Physics3dClearForces`（:39）：清力矩列。

---

## 5. 稳定性风险清单与缓解

| # | 风险 | 机理 | 缓解（全部非启发式） |
|---|---|---|---|
| 1 | **Jacobian 病态** | 锚臂过短→角项 K 逼近奇异；轴反平行→参考向量投影 | 创建时校验锚臂 ≥1cm、轴单位（§4.3）；参考向量正交化在构建时一次完成；acos 前钳域（`jointMotorAcos` 先例）；K 的 det 护栏 panic 而非静默跳过 |
| 2 | **约束顺序敏感** | 现解算器是序贯 Gauss-Seidel（`constraints3d.cheng:88-97`），铰链 5 行若拆 5 个标量行会被行序偏置拧出伪扭矩 | 5 行在同一次 ProjectHinge 内联立（1.4）；正反交替扫已有；需实验验证：双腿+膝链在 96 次扫下的残差收敛曲线，不达门禁再议块序，**不许**加迭代内 ad-hoc 重排 |
| 3 | **力矩爆冲/能量泵** | 速度级直改 ω 先于投影，被约束削掉的冲量转化为抖动能；(a) 方案固有 | 选型 (b) 规避；τ_max/ω₀ 双帽（2.3）；若 M4 后备实验跑 (a)：冲量后必须复算门禁残差，超限即回滚本 tick（复用 `physics3d.cheng:299-309` 路径） |
| 4 | **ω 重建起点/双重计入** | 若在投影内直改 ω，Verlet 重建会把它再计一遍（双重计入）；若重建起点取相位1后的中间 q，会漏掉自由旋转 | 投影只改 x/q 不碰 ω（1.1 第3条）；重建严格用步前 q_prev（1.1 第4条）；探针 A 的无外矩角动量守恒即此设计的门禁。需实验验证其阈值 |
| 5 | **四元数漂移** | 连乘舍入破坏单位性 → K 渐失真 | 每 tick 末 `CsgSqrt` 归一化（确定性路径）；`World3dValid` 加 |q|−1|<1e-6 硬校验，违者走回滚 |
| 6 | **capsule 接触摩擦** | 现库仑锥界=μ×穿透（`contacts3d.cheng:88`），capsule 最近点接触+摩擦需对锚臂出扭矩，锥界换算未经验证 | M2 单列里程碑+探针；先做 capsule-平面（最近点=线段端点/内点解析），capsule-capsule 自碰撞明确出范围 |
| 7 | **铰链链欠 substep** | 髋-膝双铰链+电机在 dt=1/240 下若残差贴门禁，瞬态可能触发 4096 refine 抖频 | 先实测；确需则 `Physics3dStep` 外层 substep 包装（N×dt/N），不许在解算器内加变步长启发式 |
| 8 | **warm start 缺失** | 纯投影（无 compliance/λ 持久化）下收敛靠迭代数 | 现框架无 Lagrange 乘子态，warm start 无从谈起；仅在引入 compliance 时一并设计，本期不做 |

---

## 6. 里程碑分解（球刚体 → 一腿摆动的最小验证路径）

探针全部落 `src/tests/`，结构照 `rigid_ball_probe.cheng`（case fn + main 序门禁 + 循环内零 str）。

### M1 capsule 刚体基座（姿态动力学 + preimage）
- 内容：§1.1 全部 + §4 全部配套改造 + 相位级 ω 力矩积分。
- 探针 `capsule_rigid_probe.cheng`：
  - A 无外矩自旋：初始 ω=(3, 5, 20)，2400 tick，验收 |L|（世界系角动量，I_w(ω) 模长）相对漂移 <0.5%，|q|−1|<1e-6，无 tick 回滚；
  - B preimage 门禁：Dynamic vs CapsuleRigid 同世界异 CID、重复哈希稳定（照 `casePreimageGate`）；另验**纯球世界 CID 与 M1 前一致**（字节兼容硬门禁）；
  - C 回滚完整性：人为注入残差超限 → q/ω 快照还原逐位相等。

### M2 capsule 接触（地面+墙，摩擦出扭矩）
- 内容：`contacts3d` 增 capsule-平面/AABB 面（线段最近点解析），摩擦冲量对锚臂出 Δω（`physics3dBallRollingContact` 的广义化，粘滞冲量 J = −u/(1/m + (r_c×n̂)ᵀI⁻¹(r_c×n̂)) 形）。
- 探针 `capsule_contact_probe.cheng`：斜置 capsule 自由落接触，验收 稳态穿透 ≤2mm（门禁内）、滑动→滚动收敛（slip 阈值同球探针 0.02 量级）、10s 无 NaN/回滚。锥界换算数值需实验验证。capsule-vs-平面只对 invMass>0 的 CapsuleRigid 生效（invMass=0 的 capsule 无接触，见 M4 注）。

### M3 混合腿（质点销 + 锚距伺服电机）
- 内容：§3.1/§3.2（SpherePin + AnchorDist + `JointMotor*` 复用）。
- 探针 `hybrid_leg_probe.cheng`：固定"髋"点用 `World3dBodyAnchor` kind + mass 0（mass 0 → invMass=0 不被投影推动；kind Anchor → 不进 `Contacts3dResolveStaticBodies` 的 Static 障碍环，`contacts3d.cheng:299`，销连不会与障碍环打架），capsule 小腿悬摆，伺服 0°→30°：验收 2s 内 |θ−θ_cmd|<2°（θ 用 2.2 的测量）、锚点销残差 <2mm、全程无回滚；等效力矩轨迹单调有界（τ 帽未饱和时）。

### M4 刚体铰链 + 角伺服电机
- 内容：§1.2-1.4 + §2 全部（C5、双帽、限位）。
- 探针 `hinge_motor_probe.cheng`：固定大腿用 kind=5、invMass=0（kind 5 使其不进 Static 球障碍环 `contacts3d.cheng:299`，铰链对之间又走 `Contacts3dConstraintLinked` 免碰撞，无需额外开关）+ 动小腿，指令 0°→45°→0° 方波：验收 稳态角误差 <2°、锚点漂移 <2mm、4800 tick 零回滚、**同一脚本跑两遍最终 CID 逐字节相同**（确定性硬门禁）。

### M5 一腿摆动（双动体 + 髋电机 + 膝限位）
- 内容：M4 大腿解固（invMass 0→正质量，kind 不变）；髋电机驱动，膝被动限位（2.4）。
- 探针 `leg_swing_probe.cheng`：小角频段扫频（如 0.5/1/2 Hz），验收 幅值-频率响应与单摆近似解偏差 <10%（系数需实验验证标定）、10s 能量不单调增长（幅值漂移 <10%）、零回滚、CID 链可复现。

M1→M5 严格串行：每一关的探针是下一关的回归门禁。

---

## 7. 工程量估计

标定基准：球刚体最小切 = world3d ~40 行（kind 常量+惯性函数+条件段）+ physics3d ~45 行（pushout+滚动耦合+接线）+ probe 150 行。

| 里程碑 | 文件 | 行数量级 | 探针验收（定义见 §6） |
|---|---|---|---|
| M1 | world3d.cheng +~180（列/克隆/校验/两条件段/惯性）；physics3d.cheng +~100（q 积分/ω 力矩/快照扩展/清矩）；probe 新 ~180 | ~460 | A/B/C 三 case 全绿 + 字节兼容门禁 |
| M2 | contacts3d.cheng +~120；physics3d.cheng +~60（滚动耦合广义化）；probe ~160 | ~340 | 穿透/滚动收敛/无回滚 |
| M3 | constraints3d.cheng +~90（SpherePin 块 + AnchorDist 行）；csg/joint_motor.cheng +~20；probe ~150 | ~260 | 角跟踪/销残差/零回滚 |
| M4 | csg/joint_motor.cheng +~40（HingeStep/双帽）；constraints3d.cheng +~160（ProjectHinge 全套）；world3d.cheng +~60（关节列+|joints= 段）；probe ~200 | ~460 | 方波跟踪/漂移/零回滚/CID 复现 |
| M5 | 探针为主 +~220；执行层接线 ~50 | ~270 | 扫频响应/能量有界 |

总计 ~1800 行（含 ~900 行探针），五个独立可验收的 PR 粒度。最大不确定块：M2 摩擦扭矩数值（需实验验证）、M4 在 96 次扫下的伺服带宽（需实验验证，决定是否启用 (a) 后备）。

---

## 8. 明确不做（本期边界）

- capsule-capsule 自碰撞接触（contacts3d 头注"不受支持组合硬失败"的边界不动）。
- 铰链 compliance/soft constraints、warm start（无乘子态）。
- 陀螺项省略、惯量近似（1.1 给的是精确组合公式，无近似）。
- 鸭躯干多刚体耦合、双足——A 段第四步范畴。
