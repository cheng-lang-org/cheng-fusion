# 234 源墙类普查 v3（2026-09-14）

> 口径：墙 = typed-facts 相串行推进中暴露的未知 bug 形。静态 grep 看不见未见过的形 ⇒「总墙数」无精确静态解。
> 类修复是全局的：每类根修清掉全链同类位点 ⇒ **位点数不外推为墙数**。
> 本普查产出三样可决策物：已修类位点覆盖（同类异形风险表）、高密度源排名、闭包序位地图。

## 一、数据源

- 闭包（权威 234 源，森林合并序 = 串行处理序）：`.rebuild/b_line/b20_forest_closure_234.txt`
- 普查脚本：`tools/wall_pattern_census.py`（v3）
- 逐源×逐类×行号矩阵：`.rebuild/wall_pattern_census.json`
- 当前推进位：**src=4**（exact_def_derive，B22 在修 ORC 记账族墙）；#0-#3 已收割（binary_types / lsmr_types / cleanup_cfg / exact_def_call_authority）。

## 二、十类×位点×含源×最早序位（v4 剥注释口径）

> v3→v4 修正：脚本 v3 不剥 `#` 注释，P1 的 2750 位点中 2690 个（97.8%）是句号结尾注释行假阳性（WA1 审计发现）。v4 全线剥注释后总位点 7782→5074。

| 类 | 位点(v4) | 含源 | 最早序位 | 已修面 |
|---|---|---|---|---|
| P8 Fmt 多行 | **2050\*** | 28 | #2 cleanup_cfg | B14（ParserAppendFmtExprsLine :6276 join-group 感知 + ParserValueExprStampStrFormatFacts :34552） |
| P5 share 实参 | **1523** | 48 | #2 cleanup_cfg | B12 |
| P10 seq Add 调用 | 798 | 10 | #72 system_link_exec | 内存轴 D4 域 |
| P1 跨行字段链 | 71 | 10 | #2 cleanup_cfg | B17 |
| P3 绑定初式 if | 59 | 13 | #2 cleanup_cfg | B16 |
| P7 importc 跨模块 | 48 | 14 | #2 cleanup_cfg | B18 |
| P2 双行 const | 42 | 16 | **#61 primary_object_plan** | B21 |
| P4 for 跨行 Range | 37 | 15 | #2 cleanup_cfg | B15 |
| P6 enum→int32 | 38 | 10 | #2 cleanup_cfg | B11 |
| P9 下标跨行赋值 | 1* | 1 | #7 exact_def_merge | — |

\* P9 普查口径 1 处；WA1 审计修正真实足迹 10×3（跨行赋值 LHS 族）。
\* P8 深度口径（v5：Fmt" 处于未闭合括号内的行，字符串清空后逐行深度跟踪）；WA3 严格口径（join 续行参数形后随 , / )）= 856/29 源，源集合一致。WA3 另证：行尾 Fmt 形 ~2475 个是平凡单行非墙群体；真实全量 5412 token/64 源，最密源 **#61 primary_object_plan（421 续行位点）**。

风险读法（v5 定稿）：体量三大类 = P8/P5/P10；P1 体量小但未覆盖变体密度最高（17/71，见 §七）。

## 三、三巨头集中度（55%）

| 序位 | 源 | 位点 | 类 |
|---|---|---|---|
| #134 | lang/typed_expr.cheng | 2021 | P10,P1,P3,P4,P5,P8 |
| #158 | tooling/compiler_csg.cheng | 1219 | P10,P1,P2,P3,P4,P5,P8 |
| #61 | backend/primary_object_plan.cheng | 1041 | P10,P1,P2,P3,P4,P5,P6,P8 |
| #132 | lang/parser.cheng | 753 | P10,P1,P3,P4,P5,P8 |
| #136 | lang/typed_expr_type_arena.cheng | 382 | P10,P1,P3,P4,P8 |

剩余墙事件的烤机时间集中在这五源。

## 四、剩余墙数最终定稿：3-7 堵（悲观 ≤12）

十类审计全部收割（WA1-WA4）后合成：P1 = 2（悲观 6）＋ P5 = 1 ＋ P8 = 0-3 ＋ 其余六类 = 0（悲观 ≤2）＝ **3-7 堵**。对比普查 v3 期的 20-60 估收敛约一个量级；串行推进 #4→#234 的墙预算即此。未计入项：未知未知形（grep 不可见，由推进实测兜底）。

**审计战役总结（2026-09-14，四线并行零冲突）**：

| 审计线 | 类 | 方法 | 预测墙 | 关键结论 |
|---|---|---|---|---|
| WA1 | P1 | 60 位点全读+11 源抽查 | 2（悲观 6） | 97.8% 注释假阳性；U1/U2 两族 17 位点未覆盖（join 链触发集缺 `.`），首墙 #7 |
| WA2 | P5 | 1524 全量机械分类+97 深读 | 1 | 闭包内未覆盖仅 V1（share 调用结果.字段，#135），一次根修清零 |
| WA3 | P8 | 播种链复刻全 234 源双向比对 | 0-3 | B14 坐标契约 0 错配；唯一残余 #59 洞内嵌套 Fmt |
| WA4 | P2/P3/P4/P6/P7/P10 | 全读或全量分类 | 0（悲观 ≤2） | 六类全覆盖；P10 94% 是 arena 原语域外；循环内重复 Reserve 结构性排除 |

census 工具已知口径缺陷（登记不再迭代，历史使命已完成）：P3/P4 `\s` 跨行锚漂移、P6 漏小写 .kind/裸枚举值两族、P10 漏裸 `add(` 且 94% arena 虚高。

## 五、正交原子任务与状态（2026-09-14 派发）

**领地图（写入权唯一化，防 9/12 式热文件自伤）：**

| 领地 | 属主 | 状态 |
|---|---|---|
| typed_expr.cheng | B22（src=4 ORC 墙） | 专属；PE1/X2 排队，B22 收割后解锁 |
| typed_expr_type_arena.cheng | F5（arena 路由） | 专属 |
| bootstrap/cheng_cold.c | M3（SpawnPtr/串行解锁） | 专属 |
| parser.cheng | 只读开放 | 写入冻结（B14-B19 已入库） |
| compiler_csg.cheng | 写入冻结 | 有未提交探针（M1/C2/T4），待 commit sweep |
| WA1/WA2/WA3 审计线 | 全只读 | 唯一可写 = 各自 `.rebuild/waX_line/report.md` |

**原子任务（三线并行派发，全只读、零编译、零领地冲突）：**

- **WA1**：P1 跨行字段链变体审计。已覆盖面 = B17 臂；从 2750 位点采样 ≥60 点覆盖 ≥20 源，按变体轴分类（行尾符号/前驱形状/链深/缩进/注释穿插/join 组内/与它类重叠），产出「变体×覆盖」表 + 预测墙清单。
- **WA2**：P5 share 实参变体审计。先定位现行 share 处理臂（typed_expr/parser），再对 1524 位点按变体轴分类（实参位置/表达式形状/分支内/跨行/与 P1 重叠）。
- **WA3**：P8 Fmt 多行变体审计。对照 B14 双函数修复面，对 2476 位点按变体轴分类（参数跨行数/join 触发符/嵌套括号/参数含字段链/语句 vs 实参）。

**验收口径**：每线产出「变体×已覆盖/未覆盖」表 + 预测墙清单（未覆盖变体 × 代表位点 × 文件：行号证据）+ 预测墙数与置信度。预测墙清单交 coordinator 排**主动修复轮**（不等墙）。

## 六、仪器使用法（推进中滚动复测）

- 串行推进每过 10 源重跑 `tools/wall_pattern_census.py`（v4 起剥注释），实际墙 vs 普查比对。
- #5→#60 段连续无墙 ⇒ 类修复覆盖良好，剩余估计下修。
- #61（primary_object_plan）连爆多墙 ⇒ 按审计预测墙清单转主动修复。

## 七、审计收割记录与主动修复轮排序

**WA1（P1 跨行字段链，收割 2026-09-14，报告 `.rebuild/wa1_line/report.md`）**
- 真实足迹 60 位点×9 源（脚本机械口径 71×10，量级吻合）；箭头形真实代码零实例。
- 已覆盖 43/60（B17 修复面 = 点/箭头尾行处于未闭合括号内，join 空格已拼入）。
- **两个未覆盖变体族（17 位点×7 源），根因同一条**：三条续行 join 链（typed_expr.cheng:28403-28413、parser.cheng:32373-32375、typed_expr.cheng:57287-57289）触发集不含 `.`，语句级点尾行续行永远拼不进来：
  - U1 语句级点尾 RHS（7 点：body_ir_cleanup_authority:37、typed_expr:45700/45705、compiler_csg:8239/8243/19693/19697）
  - U2 跨行赋值 LHS（10 点：exact_def_merge:1954、lowering_plan:27248-27262×8、core_types:10940）
- 附带风险：节点构建器 `typedExprIrBuildRhsPostfixChainRec`（:22866-22944）无 B17 等价空白跳过。
- **预测墙数：2（中高置信），悲观 6。U2 首墙 #7 exact_def_merge——距推进位 src=4 仅 3 源。**

**WA2（P5 share 实参，收割 2026-09-14，报告 `.rebuild/wa2_line/report.md`）**
- 全量分类 1524/1524 + 97 点深读：裸标识符 1067 / 根链 450 / 调用结果 5，全部已覆盖；跨行、多 share、分支内、数组字面量、限定常量各轴覆盖。
- **闭包内未覆盖仅 V1**：`share(调用结果.字段)`，站点 typed_expr.cheng:62419/:62642（序位 **#135**）——右括号后缀使 `TypedExprBindingRhsCallHead`(18415) 返空→postfix 根臂查无此绑定→:29712 判词。同形旁支 ~20 位点（闭包外 hf_qwen38_graph:668 等）。V2 限定 `mod.share`、V3 `share(x).f` 全仓 0 位点，纯潜伏。
- **预测墙数：1 面（中置信），一次根修清零。**

**WA3（P8 Fmt 多行，收割 2026-09-14，报告 `.rebuild/wa3_line/report.md`）**
- B14 坐标契约**全闭合**：复刻 parser 播种链（ParserPrepareCodeLines :32006 → ParserJoinContinuationLines :32373 → ParserAppendFmtExprsJoinGroupLine :6344 → ParserValueExprStampStrFormatFacts :34916）对全 234 源 token↔fact 双向比对 **0 错配 0 重复**；tab=+1/1 基列约定逐位核对；历史墙锚 cleanup_cfg:5596 与真实编译器表现一致。人工复核 114 位点/24 源与机械分类 100% 一致。
- census P8 正则曾漏计真群体（已修，v5 深度口径）。
- **唯一残余（非坐标面）**：csgc_cargo:335（**#59**）洞内嵌套 `Fmt\"...\"`——洞内 FmtLiteral 节点永无 fact 行（ParserParseFmtExprAt :5131 拒 `Fmt\`），stamping 静默跳过，下游 receipt 是否索权未经串行门验证。次要未活验形：转义引号字面量 12 位点、`{{}}` 转义 5 位点。
- **预测墙数：0-3（点估计 1），最可能 #59。修复序：不开编译器修复轮，先 #59 前单源预烤诊断；若墙则修 stamping/receipt 对洞内节点身份约定，不动 ParserAppendFmtExprs\*。**

**WA5（P9 identity drift 根因诊断，收割 2026-09-14，报告 `.rebuild/wa5_line/report.md`）**
- **归类修正**：AR2 报告的「P9 最小实证」是误标——该墙与 P9（下标跨行赋值，analysis 领地）不同族，实属 **receipt 名字投影族**（与 f5d9db72a 同属：receipt 名字投影 vs parser 权威域）。
- 根因：反引号运算符 fn 名（`` fn `[]` ``，仅 std 8 源、src/core 零处）在两条登记路径名字跨度不一致——profile 行级解析记「反引号内层文本」（parser.cheng:39706-39708）vs 权威 token 树记「含开头反引号跨度」（parser.cheng:23711→23744-23747→9802-9809）——receipt 桥（compiler_parser_receipt.cheng:3616-3627）要求字节恒等故反引号名下永不等。
- **暴露面：234 源推进不受影响**（grep 证零反引号 fn）；只影响 import std 的用户夹具——**不在串行关键路径**。
- 根修：receipt 侧树名跨度→sidecar 投影一跳（镜像 SkipBacktickName），+25/−5 单文件，树列零改动。已派 R5 修复轮（`.rebuild/r5_line/`）。

**主动修复轮排序（预测墙清单 → 排队，领地图见 §五）**：
- **R1 = U2+U1 合并轮（最急）**：三条 join 链触发集加 `.` 续行支持，赶在 #7 前。领地 typed_expr.cheng+parser.cheng——**等 B22 收割让出 typed_expr 后立即派**。
- **R2 = P5-V1 轮**：B12 臂扩展（操作数=调用结果+postfix 时先按 callHead 臂定型再走 PostfixValueTypeFromRoot），#135 前完成即可。按规则 10：preflight→金丝雀→kd 单变量夹具。
- **R3 = P1 节点构建器空白跳过**：搭 R1 顺风车。
- **R4 = #59 csgc_cargo 单源预烤诊断轮**（WA3 修复序②），编译槽空档插入。
- **R5 = receipt 反引号名投影根修**（WA5 方案，receipt 领地空闲，不在串行关键路径）——已派发。
- **WA4 结论：P2/P3/P4/P6/P7/P10 六类无未覆盖变体，无修复轮。**
