# VERIFY_gen2p1_3_append —— [GEN2-P1] 阶段 2 前置审计②：分相实测+T1+T2 投影判定（>100s → 重报）

date_utc=2026-09-06 · 代理=GEN2-P1 · 克隆=gen2p1 · 审计件=.w/p1_phase_audit.sh（CHENG_COMPILER_CSG_STDERR=1 带内 csg_stage since_ms，900s 帽）· 载具=knife_a 驱动（bdd6f8f2，自宿主 187MB）自烤测试本体 · 数据=phase_audit_t1/t2/t3/t4/.w/phase_share.py

## 结论先行

**投影判定：T1+T2 落地后总墙钟 ≫100s（量级 1000s），按裁决口径触发「>100s → 重报」。判决定谳依据：自宿主头静窗实测 profiles 相 249.4s、metadata+forest 段 ≥630s 仍未触界（900s 帽三次独立复现同一卡点）；该段含 forest append re-intern（checkpoint-1 反证认定的串行命门，knife1 516s 栈），在 T1 设计边界内不可并行。185s→25s 账被审计②实测证伪——其模型数（parse 5s/materialize 25s）来自 C 链（cheng_w126 头=3.3MB C 种子链，烤 210-227s 的「配对烤机」全是 C 头参照烤），不迁移到自宿主管线。T1 照设计不实施；下一靶=parse-into-forest+intern 正则化（消 ~500s 级串行 append）与 typedIr fixed-point 波次化（checkpoint-1 边界图既有条目），须重新立项换账。**

## 一、实测账（自宿主头，静窗）

| 相段 | 实测 | 依据轮 |
|---|---|---|
| 计划/绑定/排序（enter→after_sort_sources） | ~20s | t3（清窗 90s 处原子启动） |
| **profiles 逐源 parse（T1 可并行）** | **249.4s** | t3；负载轮 t1/t2=253/324s（负载敏感度低，本征成本） |
| **metadata+forest（含 append re-intern 串行命门）** | **≥630s 未触界** | t1/t2/t3 三轮 900s 帽同一卡点复现 |
| reachable/exprCallSources/TypeArena/typedIr fixed-point/graph/CID | 未达（合计使自宿主全墙 ≥2500-3300s 级，p1long 3319s 死于其中） | p1long 探针 |
| 对照：C 头（cheng_w126，3.3MB）同闭包全烤 | **210-227s rc=0**（exec_phase_parse=145.1s/codegen=75.3s/emit=0.14s） | knife_a/knife_b 配对轮报告 |

## 二、投影（裁决公式代入）

parse 桶可并行部分÷8 + 串行剩余 + codegen 包围段分流后 + 固定项：
- 可并行（profiles+metadata 的 per-source 部分全按 ÷8 乐观）：≈ (249+~200)÷8 ≈ 56s；
- 串行剩余（森林 append re-intern ~500s 级 + TypeArena/typedIr/graph 未测 ≥数百 s）：**数百 s 起**；
- codegen（自宿主头未测，C 头参照 75.3s，分流后 ~20s）+ 固定 ~20s。
- **投影 = 数百 s 至 1000s+ 级 ≫100s → 重报**。即使 metadata/forest 的并行份额再乐观一倍，串行 append 单项即破 100s。

## 三、裁定执行与移交

1. T1 不实施（未过 gate；未带未校准账撸码——审计②目的达成，证伪在撸码前）。
2. 重报靶（优先序按实测）：①**parse-into-forest + intern 正则化**（parser 演进立项，消 append re-intern 串行 ~500s 级=自宿主 materialize 主墙；即 checkpoint-1 §2.3 边界图①②的合流）；②typedIr fixed-point 波次化（checkpoint-1 §3.1 边界项）；③T2 codegen 包围段（75.3s→~20s，仍有效但非主墙）。
3. 探针/烤机纪律全程执行（900s 帽×4 轮审计、车头健康自查、锁双保险）；t1/t2 两次违窗启动已自首（VERIFY_gen2p1_2 §六）；t3 轮含一次轮询脚本「放弃后仍启动」缺陷，已发现即停（未形成第三次违窗）。

## 三B、死段栈解码补遗（529s 内 5 份 sample × run_knife_a 幸存 .primary.o.map，fnid 行映法同 wave2）

| 采样点 | 主线程链定谳 |
|---|---|
| 239s | profiles 相尾段：`parserBuildExprCallProfileSyntaxInto → ForwardingProductions/Patterns StrictValidate`（wall154 校验器） |
| 336s | **forest append 已开局**：`CompilerCsgBuildParserForestAuthorityInto → ParserValueExprTreeAppendFrom(Impl)` 占 80%（1985/2477），其余为下一源 parse |
| 400/464/529s | **100% 在 forest append**；热叶=`langintern.Intern → FindInternId → internPoolTextExact`（1435-1471 采样）+`strings.CloneStr`（999-1019）——**段本质=合并 intern 池增长下的逐 token 再 intern（哈希+逐字节精比），非 memcpy**；池增长 ⇒ 超线性，与 ≥630s 段长吻合 |

- 与 BREAK 线 vmmap 400s 快照对账：VM_ALLOCATE 364MB「arena 语义活集」主体=森林 intern 池文本 arena+森林行列 arena（本解码命名）；RSS 靶与 wall 靶同体。
- 落点归属：`ParserValueExprTreeAppendFromImpl`/`langintern.Intern` 均在 parser.cheng/langintern——**非本线可动面**（PHASEB-PARSER 零接触令）。可论证加速方向（供 parser 线立项输入）：append 期 batch-intern 保持首见序（字节安全）或 token 文本免重 intern 的等价证明（需先证 token intern id 是否进产物字节）。
- m2 复测预判：400s 死段 D3/F1 均不触碰（F1 eviction 作用于 2000s+ 段）；D3 后复测若死点仍在 400s 段，必须等 forest 弹（parser 线）落地。

## 四、门禁表

| 门 | 结果 |
|---|---|
| 审计②分相实测（自宿主头，静窗） | PASS（t3 清窗轮；t1/t2/t4 三重复核） |
| T1+T2 投影 ≤70s | **FAIL（≫100s）→ 重报** |
| T1 实施 | **不实施**（裁决条款） |
| 账目校准先行 | PASS（撸码前证伪 185→25s 账） |
