# 里程碑看板（2026-09-14）

> 四里程碑 × 在飞线 × 阻塞链。审计已闭卷（十类，剩余墙定稿 3-7，见 wall_pattern_census.md §四）。

## 段 1 冻结窗口执行计划（2026-09-15 立项，打法换轨：一个窗口、一棵树、一次烤、全部判据）

> 依据：用户裁定「最短 1 工作日/现实 2-4 天 vs 当前节奏 1-2 周，差距全在排队与重复烤机」。段 0 已由 fusion 席收口（`receipts/stage0_wrapup_20260915T1019Z.md`，六墙候选 patch 齐）。T60-T65 裁定已落（`cheng-rsi-acceptance-ruling.md` 裁定落地节）。

**窗口树定义（HEAD 快照基准 fcf5e919f，非活树）**：
```
HEAD 快照 fcf5e919f（已含 R1 四层 join 修复）
  + stage0_A1（cheng_cold.c 545/31，G(k) 掉落收集器刀）
  + stage0_W3（typed_expr 9/0，producer lacks ownership proof）
  + stage0_W8（typed_expr 11/0，node origin proof）
  + V1 备弹（r2_b12_call_postfix.patch +46，回归面=零已证）
  + compiler_domain 三枚：c1c2_order_contract → tier3_50mb_wiring → P-b（裁定 T61/T62/T65）
移出：ORCD1（ORCD2 首烤 fail-loud——cheng_string_copy 惰性注册时序死点，修复=预注册一行，v2 待 C 链车道后轻量复验）；stage0_B22 作废；stage0_W1/W9 已在 HEAD
⚠ 叠集相容性待窗口线首验：W3/W8 段 0 基准 60e37f0e、V1 基准更早，R1 入库后 typed_expr 行号已漂，全序 apply --check 冲突需消解
```

**开窗状态（2026-09-16）：条件全部满足，窗口已开。** R1 收割入库 fcf5e919f（最后一个硬等）；ORCD2 已收（ORCM 判定未达验证+勘误两项）；在飞线清零，槽独占。

**触发条件（2026-09-15 放宽：段 0 先例=候选 patch 零编译进叠，窗口首轮唯一验证）**：
1. **R1 收割（唯一硬等）**——U2 首墙 #7 必需，无它首轮必撞已知墙浪费一轮；
2. ORCD2 不阻塞（ORCD1 直接入叠，其验证并行收尾作独立确认）；
3. V1/#59 备弹线不阻塞开窗（设计线零槽并行，弹齐前窗口推进到 #135/#59 若露墙则回段 0 节奏处理）。

→ R1 收割通知即开窗发令枪。

**窗口内序列（每轮 ≈30 min 槽时：烤 209s+金丝雀秒级+四探针 15min 可并+森林门轮 500s+逐相贴线 1min）**：

**分层判读纪律（2026-09-15 用户令「先优化时间再推进」后确立，全线的跑法）**：
- 迭代轮判据最小集 = 重烤（~210s）+ 金丝雀 + 该墙最小夹具双臂 ≈ **8 分钟**；夹具红直接回 patch，禁跑全门轮。
- 全量验收轮（四夹具 primary.o 对拍+森林 234 判读+16 判词族）只在最小集连续绿后跑**一次**；双臂可并行（14 核）压半。
- 基线复现判据优先引用既有现场证据（如 B22 kd_b2201 stderr），免 A 臂重跑。
- 断言/对照轮与主判据轮共享烤制（同驱动多 env run），不单独重烤。

1. 叠集 apply（全序 `--check` + preflight 逐枚）→ 烤一枚驱动 → 金丝雀；
2. c1/c3/c4/c6 四探针 → 默认门森林轮 234 → typed-facts 串行推进（露新墙回段 0 出 patch 再来一轮）；
3. compiler_domain 三枚应用 + C 链重建（并入唯一一烤）；
4. 段 2 U 组串行：A9b 三腿 45min → cdomain 两档 40min → 档 3 首轮 ≈1h → A7 234 源 2×1200s → GEN2/GEN3 三代自烤 + sha 对拍（≈4-5h）。

**打穿边界图 v2（2026-09-16，普查线 explore_line 收割定稿）**：
- **族机制勘误**：「static argument type unavailable」无静态实参声明语法——发射点 typed_expr:29766 对全部实参静态定型（重载选择），真因全是**裸名缺 import/错别名 → 声明 Missing 上浮**（源修家族，第三例 import 可见性并案）。
- **判词轴足迹定稿**：400,354 实参精化后 **53 位点 ≈47 真实缺口**（12 文件 11 组，全声明侧可修）；撞墙序列 wall_sequence.txt：#22 → #35×17 → #61×5 → #86/#97/#134 → #162/#175 → #198 → #207 → #231-233——**6-7 轮批量源修可打穿**。
- **16 族盲区（残余不确定项）**：TypeArena 权威族（历史最高频）/snapshot builder/cheng_cold/parser type syntax/linker/lease 五族在追踪表盲区——历史判词全集 judgment_families.json 已备归族。
- **时间账定稿**：判词轴 6-7 轮（每轮 30-40min 分层判读）+ 内存轴（parser 释放面刀 §8.46）1-2 轮 ≈ **5-7h**；盲区族不爆则当天见 r92 末段；段 2 固定 4-5h。
- ORCM@13 判相位漂移形（三枚无罪+基座无差异面，src/rsi 非闭包 grep 实证）；ORCD1 v2 链 = 预注册 ✓ → slot-coloring 墙（C 链道移交件冻结）→ 独立 owned 拷贝消双释放，相位漂移失义。

**新增冻结区**：T60-T65 裁定结果（见裁定书落地节）——段 2 各步按裁定执行，不再逐项请示。

## 冻结区（已定谳，后续轮免检不复审）

> 借鉴 RSIAgent Phase 3「记忆冻结只复用」：以下结论已定谳入账，后续轮次直接引用，不再重复审计/建模。只有新判词族实际击穿时才解冻对应条目。

- **十类墙类审计闭卷**（WA1-WA4）：P1 剩 U1/U2 两族（R1 在修）、P5 剩 V1（备弹在飞）、**P8 #59 免弹关闭（R4 备弹线三面闭合定谳：stamping 唯一出口 continue/receipt 零索权/活验 smoke 同形已过；「补 fact 行」方案否决——致重复求值+哈希漂移）**、其余六类零墙。**剩余已知墙 3 堵（悲观 7）**。
- **待钉区①②④⑤系数**（§8.112）：nodes/token=0.4733、typeSyntax=158,375 行、去重=0.6110、facts 119B/行；行数 >2.2M 即超门缺陷。
- **src=192 墙已清偿**（N1+45001eeb8）：源代际回归非编译器缺陷；#192-#233 authority 实证全绿。
- **ORCM 根因**（B23 §8.115）：C 链 share/move→嵌套容器字段 store 丢 retain；首释放者链已符号化定谳。
- **census v5 工具口径**：P1/P8 已修正（剥注释+括号深度）；已知残余缺陷登记不迭代（P3/P4 锚漂移、P6/P10 漏计）。

## 墙路线停止规则（2026-09-17 显式化，Dream-RSI 停止判据思想落地；全部修复/诊断/打穿路线开局必填）

**开局三件套（每条线派单时必写，缺一不发）**：
1. 目标判据：什么信号算这条线完成（精确判词消失/判据值/阶梯全绿）；
2. **放弃判据**（触发即停，已获证据强制移交，禁止沉没成本续命）：
   - 诊断型：**4 轮证伪**即换向（wa13 四轮证伪换 ledger 先例）；仪器增益归零（新实验不再改变决策）即停；
   - 修复型：**同一判词 2 轮未清**即升维（症状补丁→机理重钉）；
   - 成本红线：单墙累计 **>4h**（烤机+判读合计）升协调席裁线（续命/换向/立项三选一）；
   - 前提证伪：路线的前提被任一轮机械证伪（如 T-E 证伪「v3 未入库即不现」）→ 立即停线重定向，已获正面资产清点入账；
3. 移交物清单：停线时必须落盘的最小集合（REPORT 四件套+冻结件+可复用仪器+已证伪清单——证伪也是资产）。

**排程计入项（矩阵排序显式公式）**：优先级 = 墙价值（阻塞面宽度）× 修复概率（族归属/先例） ÷ 预期槽时——停止判据是「预期槽时」的封顶值，超封顶即触发裁线。

**重放评估（编排层适用，语义层不适用）**：候选策略序列可用历史门轮 log（判词族分布+驱动谱系）做零执行评估——patch 语义层必须真烤（fail-closed 不可绕）。

## 正交原子任务矩阵（2026-09-16，领地×里程碑，写入权唯一化）


| # | 原子任务 | 领地（唯一写入） | 里程碑 | 状态 |
|---|---|---|---|---|
| T-A | ORCD4：ledger 开窗点前移→归账点名→结构修→ORCM@13 终验 | bootstrap | M1 | **在飞** agent_9d91341e |
| T-B | D2 三重解析合并施工（**已收 bd05cff8c**：三合并点 M1 单次解析+回放/M2 ctor 重推消消费 build 判词/M3 通用臂消 build 原始输出；判词零回退八证 frozen_match×8+t2fix7×7+16 族全零；机制账 −150~170s/窗锚定估计，DECLTIME rider 挂 ORCD4 清墙后一轮实测；冻结件 sha b30b9061） | typed_expr | M4 | ✅ 收（rider 挂） |
| T-C | M4 刀③：并林窗窗内子段埋点 + C2 免重解析扩展面施工（**已收 5ae6de1ff**：分段分布定谳 p0_parse 38%+p0_index 38%+p0_rewrite 23%+pass1 费率 parse 191ms/buildidx 67ms/append 20ms 每源；探针落地入库 077331d1；死坐标图移除 −37.3s 实测零扰动但内存判缓不落待 RSS 符号钉死 tc_line 存档；pass1 免二次 parse 结构判死；C2 replay −55.3s 确认继承） | compiler_csg | M4 | ✅ 收（死坐标图挂起） |
| T-D | facts 流式直通+事务批量化架构设计冻结稿（**已收**：Form A=decl 级发射+源级事务批；源内批量化零语义风险三跳证据链；每 fact 5 触碰→2 目标；总账 D1×D2×T-D≈14-43×；拆单 TD-0..TD-5=TD-1/2/4 compiler_csg 串行于 T-C、TD-3 typed_expr 串行于 T-B、TD-5 串行于 T-E；**时机定谳=打穿后落地**；`.rebuild/td_line/DESIGN.md`） | 跨领地设计件 | M4 | ✅ 设计收 |
| T-E | 打穿轮（T-A 解锁后）：重叠集烤一枚→默认门全源验收→段 2→静窗 | 窗口执行席 | M1/M2 | 排队 |
| T-F | M3 变绿验证轮（T-B/T-D 后）：全源位图+逐相贴线三判据 | 窗口执行席 | M3 | 排队 |
| T-G | gensym 名集 121K 块（C2 移交） | parser | M3 | 排队（parser 稳定窗口后） |
| T-H | AR2 批次 3 六组路由 | parser | M3/M4 | 排队 |
| T-I | std 闭包链三环诊断（receipt TypeSyntax/snapshot_builder owner-token/csg 既有墙） | receipt/只读 | 用户夹具域 | 低优先 |
| T-J | m1_ledger_arm（backend_driver_dispatch_min 遗留冲突消解） | driver_dispatch | 仪器 | 挂起 |
| T-K | FunctionAddress 跨领土死前提判废施工（**裁决完成**：csg_core schema :10928-10929 Function 行死前提判废→消费面精确核对 TypeScalar+ScalarPtr，红证=b1fbc7e83 双前提互斥实证+op79 击穿；裁决书 .rebuild/xterritory_line/RULING.md，冻结件 .rebuild/xterritory_fix_line/function_address_schema_fix.patch sha dd905bc3；零烤，green 待 T-E 爬坡消费或后置轻量线） | csg_core | M1/M2 | ✅ 裁决收 |

冻结区（免检）：十类审计结论/待钉区①②④⑤系数/src=192 清偿/ORCM 根因定性/census v5 口径/T60-T65 裁定。

## T-E 打穿轮 RED 定谳（2026-09-17，`.rebuild/te_line/`）

- **ORCM@13 在冻结 HEAD（55244c8ce）确定性复现**（双轮同判点同签名同载荷）——「v3 未入库即不现」证伪；orcd4「v3=触发器」结论适用域仅 wa13 根（pre-C2），**HEAD 基座另有触发面且多根多点显现**（N1 线 src=0、N3 线 B 臂旁证）。
- **正面资产**：pass0 234/234 全解析零判词（parser 侧干净）；pass0 稳态 633.7MB 门内（C2/T-G 兑现）；一烤 1014s 金丝雀 2/2；A7 载具预备根就绪（theory_emit 六补丁+39 发射点）。
- **新发现**：guard 相界采样缺陷实锤（pass0 瞬时峰 970/960.7MB 超门且 guard 未触发）；merge 相 763-775 贴线后死。
- **M 判定**：M1 src_done=0 RED；M2 appended 13/234 RED；M3 稳态门内/瞬时峰超门（采样缺陷）；M4 至死点 351s/286s 全墙不可测。
- **移交**：ORCM@13@HEAD 定谳件（stderr :1228-1231）→ ORCD5 重钉刀位（HEAD 形在 merge 相非 capture 链）；guard 采样缺陷 → ORCD5 附带修；slot 反竞态修复（双读双验+空 owner 永不清）→ 各线脚本采纳；事故录（b19 wrapper 与 n3fix2 同时 SIGKILL，凶手未钉）。

## M1 墙类清偿（typed-facts 轴）

- **bisect13 终审（.rebuild/bisect13_line/，8 轮机械证明）**：ORCM@13 窗口无罪（15 提交全排除，基座内容本身即崩）——定性 = **既有 share/clone 释放语义缺陷**（W-A1-3 CloneStr 家族，与 ORCD1「fresh 载荷不重绑 value-def」同根），对闭包构成不敏感、确定性发作。**ORCD3 = M1 关键路径独木桥**（回退/修枚路线机械证死）。
- **机理链坐标**：pass1 流式 verify/authority（compiler_csg:36776/:36788）对 13B str 载荷二次 normal_release → registry 查无（首释摘册+0xdd）→ panic——同一载荷双 owner = 发射面所有权凭证缺失。
- **已破**：Join:114 族三枚批量弹判词推进验证过（入库 5a11027fe）；typed_expr 三枚+RSI 面 T61/T62/T65 入库（f4f6b9684/9a3f53acf）；parse 内存墙 gk1 刀入库（50b536062，src=61/61→234/234）；t2 回归刀①入库（0db5c25b5，−981s）。
- **关键路径**：ORCD3 v3（在飞，value-def 重绑+真槽号）→ ORCM@13 过墙 → r92 爬坡 src 0→234（判词轴已清）→ M1。
- **完成判据**：typed-facts 相推进至 src=234（全部源 src_done）。
- **2026-09-20 回填：M1 解锁（唯一墙已过）**——ORCM@13 根修合并 c92975786（@borrows 根因，kd_orcd11f 234 源元数据构建首次全走通）；te5 M1=RED src_done=0/234 为 pre-merge 快照旧代读数；待 T-E 五轮直判 typed-facts 爬坡 src 0→234。详见文末「2026-09-19/20 收割链回填」节。

## M2 forest 收口（192→234）

- **N1 收割定谳（2026-09-15）**：src=192 墙 = **源代际回归，非编译器缺陷**——cas_store.cheng 别名 import（`as rawbytes`）漏改 ~3 处裸 `Bytes` 引用，spec 1.4 别名 import 只暴露别名，authority fail-closed 行为正确。判决性 A/B：修法代（b22v1 臂）**234 源 append 全绿**；HEAD 代死 authority。**源修已提交（45001eeb8）。**
- **PE1 覆盖判定：否**（本墙数据面是 TypedExprTypeDeclarationIndex + TypedExprTypeImportAuthority，不读 PE1 ctx metadata）——原依赖边「PE1 → src=192 过墙」**作废**，改为「源修 + 冻结面刷新 → 过墙」。
- **尾段风险切片**：authority 层修法代已实证 #192-#233 全绿零残留；census 模式轴热点 = #212 std/path（P10×12）、#207 std/json（P1×11）、#224-233 tests 驱动（P5 族）；seal/r92 属 M1 域。
- **收口路径**：从修法代（45001eeb8+）重冻 M2 门轮源根并绑哈希 → 复跑双臂 → 234 appended + 16 判词族双零。若 B22 在飞门轮已含修法代臂且判读齐（N1 见 b22v1 9-15 11:24 臂 234 全绿），M2 判据可由 B22 收割证据顺带达成——**等 B22 收割核验后再定是否需独立收口轮**。
- 工具警示：本机 PATH `diff`（OpenHarmony 工具链）对两代 cas_store 返回假 0——比对一律 cmp/sha256/python。
- **2026-09-20 回填：M2 解锁（唯一墙已过）**——te5 M2=RED forest_appended=0/234 同为 pre-merge 旧代读数（死点在爬坡之前，c92975786 已合并）；待 T-E 五轮直判 234 appended + 16 判词族双零。详见文末「2026-09-19/20 收割链回填」节。

## M3 内存轴 768MiB 贴线验收

- **已落**：D5 presize + D6 Fix A；AR2 批次 1+2a merge_parse **−11,552 块（−0.678%）**；2b 七平行数组施工在飞；**N2 已收（§8.112）：待钉区①②④⑤系数钉死，T(k) 带 390-430MB，B2 项下修 57MB，⑤ 行数超门判定式（>2.2M 即缺陷）入账。**
- **主攻未清**：G(k) 主项 = reader 解析相每源 +7,577 块树外分配无人释放（§8.46），根修领地 parser.cheng——**卡 2b 施工线收割**。
- **依赖链**：M3 线（SpawnPtr/串行解锁，在飞）→ M2 armed 账本可跑 → Top-N 点名 → 下一刀定点。
- **读数轮排队**：③ statementRoot 一行打印 + ⑤ facts_rows 逐源打印（各一行门控探针），排领地+槽空档。
- **完成判据**：静窗正式门轮逐相贴线（差值 >50MB 必须解释）+ 总峰 ≤768MiB + rc=0 三判据同时成立。
- **2026-09-20 回填：诊断闭环 + 根修在飞（预算 631.6 MiB）**——前沿推至 merge pass-0 B1 倍增瞬态（src=61 两窗逐字节闭合，typed_expr 必杀源，历史 profiles 遗留账与 G(k) 8-12MB/源均未复现=前相根修有效）；模型补锚 R(k) 新项 76.3-76.6 MiB/234 源 + X2 价修正 473,175 B/源（约束卡 3 条目已追加，MODEL_ANCHOR）；修法裁决① = D6+X2cut 组合刀（M3_ATTRIB §7 组合预算 631.6 MiB 余 +136.4；m3fix 主带预测 639.7/701.9），D6 已建 preflight PASS 门轮待发。详见文末「2026-09-19/20 收割链回填」节。

## M4 时间档 L1（199-209s 档）

- **M4 建模线收割（2026-09-16，.rebuild/m4_line/）**：typed-facts 相实测 **1348-1463s**（§8.75 的 52-60s [估计] 证伪，低估 ≥40×，漏 t2_pre_observe 段 63-77%）；**最大相反转：typed-facts = 并林窗（342s）3.9×**（看板旧现势过时）。
- **Top-3 刀**：① **t2_pre_observe 回归解除——已兑现入库 0db5c25b5**（机理=B15/B16/B19 共用 bind 事件全量 token 扫描无早退；修=端点索引化+二分；src=2 874.4s→33.5s **26.1×** 贴无回归水位，全轮 1900→919s **−981s**，7 夹具逐字节 IDENTICAL+3000 trial 仿真零失配，判词零回退）；② decl-loop 结构性增量化（需 ≥40×，sub-timing 探针先行——typed-facts 相下一关键路径）；③ 并林窗 C2 接线扩展（−55.3s 独立复算 ✓）。
- **G(k) 内存刀判零时间收益**（可证伪判据已给 parser 线：t2 回归期 live +1.4% 对时间 +24× 反证）。
- **L1 路径**：1814s →①≈994s →②≈556s →③≈501s →+X2≈486s，仍差 277s（并林窗余量+profiles 邻段）。全部读数为抬门+负载窗——静窗复测前只定序不定谳（复测清单五项 REPORT §5）。
- **完成判据**：全墙走完 ≤ L1 上界 209s（静窗口径）。
- **2026-09-20 回填：仪器就绪 + D6v2 路线定形**——JUDGE_M4 三态判定表 + 静窗五项一发 + guard 三通道权威表建成；C2 严格形态判死（facts 域不承载树行空间身份 + 结构门封死），唯一可行形态 D6v2 = D6 预量道升格超集延伸（时间 −49.7~58.5s、pass-0 位 746.9 峰消失，c2feas）；te5（pre-merge）M4=RED 全墙不可测（死墙 281/270s）。详见文末「2026-09-19/20 收割链回填」节。

## 依赖链总图

```
B22(src=4) ──→ typed_expr 解锁 ──→ R1(#7前) ──→ 串行推进 ──→ R2(#135前)/R4(#59前) ──→ M1
    │
    └→ src=192 已由源修 45001eeb8 清偿（PE1 不再是 M2 前置）
       修法代重冻门轮源根 → 复跑双臂 → forest 234 ──→ M2（或由 B22 收割证据顺带达成）

M3线(SpawnPtr) ──→ armed 账本 ──→ Top-N 点名 ──→ 内存刀 ──┐
2b施工(parser) ──→ 收割 ──→ G(k) reader 根修 ──────────┼──→ 静窗贴线验收 ──→ M3
N2 已收（§8.112：①②④⑤系数钉死）+ ③⑤读数轮排队 ────────┘
并林窗收敛（与 M3 同刀）+ X2(typed_expr) ──→ M4
```

**当前瓶颈**：B22（M1/M2/M4 共同前置）与 parser 领地（2b 占，M3 主攻前置）。在飞 5 烤机线 + N1/N2 只读线派发后共 9 线。

## 打穿策略重放评估（2026-09-17，`.rebuild/replay_line/REPLAY.md`，易失区结论在此转述）

- **决策表 14 行**：binding 墙随刀序迁移（RSS 墙→内存刀压下→露 ORCM crash 墙）；**ORCM@13 在全部 C2 代根复现（te/c1/sa×2/n1×2/N3），pre-C2 根 234 全过 ORCMISS=0——发作纪元与 C2 代内容强相关**（①c 向下 bisect 的零执行信息点，备胎位）。
- ORCD5 lldb 已钉 HEAD 形死亡链：merge pass1 worker 的 cheng_seq_string_release_range_compat 通道（非 wa13 capture 链）。
- **执行序**：①a ORCD5 consume 刀（merge 相重钉）→ 确认轮 → ③ 叠集全量+窗口首轮 → ④ 分层判读爬坡（crash 墙唯停修，抬门仅诊断）→ ⑤ 段 2。①b sret 桥/①c 向下 bisect = 2 轮未清升维备胎。总槽时 ≈9.75-13.75h。
- 必须真烤：落刀轮/窗口首轮/每源新判词/段 2 全部——其余归因已重放完成。
- **资产偏差登记**：bisect13/window/explore/gk/census JSON 部分被纪律 8 清理回收，REPLAY 以看板转述作二手证据逐项登记；sa 线 REPORT「rc=0」与工件（rc=1 双臂同死 ORCM@13）矛盾——以工件为准，其移交件（判据/驱动）仍有效。

## 存量路线停止判据回填（2026-09-17，`.rebuild/sr_line/stop_rules.md`，易失区执行序在此转述）

- **现势修正**：R6 权威族×3 已由 N3 清偿；真正现存 = 第 4 实例（hashmaps:268）+ binding reference identity drift + lsmr_types:211；第 4 实例与 N3 尾巴 hashmaps 改名清单**同一墙两面已合并一刀**（R7(1)，评分 3.6 最高，已派）。
- **执行序（评分降序+依赖）**：R1 ORCD5（在飞，门轮实跑中 pid 21597，kd_orcd5h d4065cf9 金丝雀 2/2）→ R7(1) hashmaps 刀（在飞）→ R8-T-J（1.8，R1 判读前置）→ R2 importc 别名族（1.6，在飞）→ R6 drift 族（1.4）→ R7(2) Len 二义（1.2，需域决策）→ R8-T-H（0.8）→ R7(3)（0.5）→ **R9 段 2/静窗（R1 终验 src_done=234 绿后立即插入，优先于剩余评分项）** → R10 TD-0 槽空档先行、TD-1..5 打穿后（0.3）→ R4 seq sret 桥（0.25）。
- T-J 前提部分取证：orcd4 R0 证伪「移窗」——待动的是 ledger 开窗点。
- 资产缺口：bisect13_line/m4_line 目录不在树（纪律 8 清理），引用以看板转述为准。

## 2026-09-19/20 收割链回填（boardfill_line，零烤零编译；本节为该线唯一活树写入，产物独占 `.rebuild/boardfill_line/`，零 commit 留收割轮统一提交）

- **今日战报**：ORCM@13 过墙定谳（ORCD11 @borrows 根因 × ORCD12 typed_expr 刀双线收敛）→ 根修合并入库 c92975786 → 爬坡前沿 = merge/forest src=61 RSS 墙（M3 刀 D6 在飞）→ T-E 四轮 te5 RED（五轮待 M3 刀清墙后发）。
- **ORCM@13 过墙（ORCD11 线）**：根因 = `TypedExprModuleConstStoreLocalEntryOwned` 缺 `@borrows` 借用合同（缺标=形参接管，续行 const 路径 pending/literal 32B 块双释放 registry_miss；地址级仪器 O11ST entry#1 逐字节命中，载具 primary_object_csgc_cargo.cheng = 闭包首个续行形 const 源消费序#60，60/47 之谜闭合）。绿证 = kd_orcd11f（sha 50e05eb6）：ORCMISS=0/orc_failures=0、mf7=234/lsdance_post=234（234 源元数据构建首次全走通）、红 3 轮同位逐字复现、四合同 3/3 MATCH、金丝雀 2/2。注：`.rebuild/orcd11_line/` 已被纪律 8 回收，判据以 commit c92975786 全文 + `.rebuild/m3attrib_line/`、`.rebuild/m3fix_line/`、`.rebuild/modelanchor_line/` 转述为准。
- **双线收敛合并 c92975786**：ORCD11 @borrows 合同 + literals 列显式 share(literal) 记账 + ORCD9 楔位还原 2 处（typed_expr +19/−7）；ORCD12 typed_expr 刀（刀件 sha 1b0b7b84，X2 实削 18.44-18.78 MiB）同批；变体 ORCD10 AppendMove 刀落选维持暂不合入。合并验证驱动 kd_orcd12m（sha dd7ff483，head 299016dc）金丝雀 2/2 + preflight PASS（`.rebuild/orcd12_line/bake_receipt.txt`）。
- **爬坡前沿 = src=61 RSS 墙（诊断闭环）**：合并后爬坡于 merge/forest 相撞 768MiB resource_guard（src≈61，守卫不抬不放宽）。归因 = merge pass-0 reparse 道 `sourceArenaReserve=0` 下源树 arena 倍增拷贝瞬态（B1 项 src=61 +261.7 MiB；两窗 937,411,832 B / 915,719,368 B 逐字节闭合，dev −0.03/+0.11）；X2 驻留 +105.6~124.4 MiB 为使能项；typed_expr.cheng（u 估 110-160 MiB）为前方必杀源——不修瞬态 merge 无法走完 234 源，外推超门即缺陷。档案 `.rebuild/m3attrib_line/M3_ATTRIB.md`。
- **T-E 四轮 te5 RED**（snapshot a9b2e1a9a，早于 a6264c0a8/c92975786；driver kd_te5 sha 40243fd5，金丝雀 2/2）：ACCEPTANCE=RED wall=ORCM@import_edges_resolved（orc_release_failure×4、其余 18 族 0、ramp 未启动=死点在 per-source 循环之前）；judgment_point = after_reachable_function_set→import_edges_resolved→ORCMISS×3→registry_miss/normal_release/wrong_object_or_owner（32B 0xdd deref16 形）；双臂 te5_default 281s / te5_minleg 270s 同 q 值逐字同签名（仪器隔离：非探针/非守卫致因）；同日四驱动同判点同签名（orcd10 刀臂五轮 359/364/274/274/305s + orcd11 diag 401s + te5 双臂）= HEAD 源级根因非烤制事故。机理（ORCD10 线定谳）= 崩块 build#60 TypedExprBuildMetadataContextFromProfile decls 环非 importc 分支迭代尾 32B 临时块双释放，AppendMove/SR5 复位/view teardown/decls-name 悬挂四假设地址级证伪；合并后代根按 c92975786 前瞻读数该判点可穿越，余墙 = src=61 RSS。M 判词：M1 RED src_done=0/234；M2 RED forest 0/234；M3 NOT_JUDGEABLE（死点 406MB，beat_c 权威臂按门未跑）；M4 RED 全墙不可测（死墙 281/270s；参考 orcd10 红基线 305s、orcd11 diag 401s）；段 2 U 组按门控未跑。档案 `.rebuild/te5_line/verdict_te5.txt`。

### 在飞/排队清单（2026-09-20）

- **M3 刀（槽独占，在飞）**：路线①放行 = D6（pass-0 精确 reserve，预量道挂 after_sort_sources 后 floor 259.5 MiB）+ X2 投影化 cut（typed_expr 域）组合刀；D6 全刀已建（patch sha 5122146b，preflight PASS）门轮待发，X2cut 以门轮三实测输入为下一刃；主带唯一达标形态 D（src=61 位 639.7 余 +128、typed_expr 位 701.9 余 +66.1），变体 B/C/E/F 全落选（`.rebuild/m3fix_line/REPORT.md`）。
- **preflight 硬化已落**：`patch_preflight.py` 杂注解线伪声明误报根修写回（annotation_map 声明归属识别），165 件同语料回归唯一翻转 = W2 移除件 FAIL→PASS、零 PASS→FAIL（`.rebuild/pfhard_line/HARDENING.md`）。
- **楔子普查收口（真违例 2，移除件冻结）**：W1 typed_expr:68328 第三枚 O8SITE——还原件 preflight OK，typed_expr 属 M3 刀领土须协调槽位后应用；W2 handshake13:3433 `f@borrows` 杂线——移交 quic/tls 线带槽验证（硬化版 preflight 已 PASS，此前不得单独应用）（`.rebuild/wedgescan_line/WEDGE_SCAN.md`）。
- **kind 前提普查（113 判点全对账）**：死前提 3（D1/D2/D3）、高击穿风险 1（F1/F2）、已闭通道留验 R1/R2/R3；born 三钉 a7ee2da19 / f681cad2b git log -S 实证（`.rebuild/kindcensus_line/KIND_PREMISE_CENSUS.md`）。
- **F1/F2 预制件待消费**：Closure 五合同互斥环甲案修正版补丁 sha 6c733b7a 已备（`.rebuild/closure_fix_line/closure_fn_type_schema_fix.patch`）；fn 类型语法（spec:84）是合法表面，爬坡源触达 fn 类型语法前必须入库验红绿（红臂最小源现库可跑）。D1 判死留锚已入库 bcfb0c01a（纯注释零行为；预制件 eb98137b 同批）。
- **FunctionAddress green 同批**：a6264c0a8 已入库零烤，green 验证待 T-E 爬坡消费或后置轻量线（T-K 行衔接不改）。
- **D2/D3 接线日**：维持 fail-closed 即正确行为；D2 泛型接线日五处一次闭环（普查三处→五处，补 ExactShape builtin 形态）、D3 `?T` 接线日六点闭环 + spec 前置（`?T` 先入 spec）；接线日前不预制补丁（`.rebuild/closure_ruling_line/CLOSURE_KIND_RULING.md`）。
- **guard 活树通道**：beat_c（A）/驱动内埋点（B）本轮未动，<10ms 网格、埋点间失明、回执峰值下界三类盲区属活树改动须单独立项（`.rebuild/guardfix_line/CHANNEL_AUTHORITY.md` §4/§5）。
- **N-C/N3 尾巴**：hashmaps 第 4 实例 + 改名清单同刀（R7(1)）等按「存量路线停止判据回填」节评分序排队，本日无新增。

### 仪器栏（2026-09-20 就绪清单）

- **te5 冻结件直跑**：te5_head 冻结克隆根 + te5_bake/te5_gate/te5_m3_beatc/te5_judge/te5_a7/te5_gen 全套复验仪器已备未耗；O10CONS/O10AFTB 探针族可复用为 typed_expr 新刀红绿仪器（`.rebuild/te5_line/`）。
- **静窗五项一发**：T-E 线绿后 `bash .rebuild/quietwin_line/quietwin_retest.sh --driver <驱动>` 一发五项（C 链锚/自宿主全墙/逐相计时/逐相 RSS/guard 双通道），按 JUDGE_M4 三态判定表落判（`.rebuild/quietwin_line/JUDGE_M4.md` + `DATA_LEDGER.md`）。
- **guard 三通道权威表**：超门 fail-stop = 通道 A（beat_c，10ms footprint，唯一执法）；编译器第一道门 = 通道 B（CHENG_PROCESS_MAX_RSS_BYTES 埋点 fail-stop）；同窗相对比较 + 外部峰值对账 = 通道 C（ps 序列 + rusage maxrss 峰值权威；旧 ps sleep-2 网格 0/8 命中缺陷已根修）；峰值判读一律 rusage + beat_c 回执双口径，ps 序列只作下界（`.rebuild/guardfix_line/CHANNEL_AUTHORITY.md`）。
- **B1 预测器**：`extract_mem_attrib.py`（36 个 ≥1MiB 源全拟合，|dev| mean 1.51 MiB、dev>0 ≤+1.73 = 实测上界，两独立窗 src=61 逐字节闭合；可复跑 T-E 五轮读数，多轮各跑一次不做跨窗合并）+ 形态预测器 `m3fix_predict.py`（`.rebuild/m3attrib_line/`、`.rebuild/m3fix_line/`）。
- **preflight 硬化版**：`.rebuild/s1b_step3/r9/patch_preflight.py`（硬化前后备份与 165 件回归账见 `.rebuild/pfhard_line/`）。

## 2026-09-20 晚收割链追加 + 分支 B W1/W3/W2 改判（mirror_line 证据抢救线转述）

> 本节档案背景：`.rebuild/` 遭外部清扫连环灭失（orcd11/slabdesign/x2cut 先丢，wdfs/copyback/branchb/prefabC/trioverdict/xterritory/closure_ruling/modelanchor/timemodel/quietwin/guardfix/pfhard 及 slabk1/slabk2 REPORT 随后）。幸存原件已逐份字节恒等镜像转正 `docs/campaigns/2026-09-20-kernel-slab-pass1/`（README 为索引，含逐件「已灭失+现存权威替代物」登记）；本节引用的 `.rebuild/` 路径凡已灭失者以该镜像为准。

- **今日收割链追加**（接上节 boardfill 行后）：
  - **phase-1 双刀入库** `56571f10e`+`2be4b0162`：floor 763.8→**713.2 MiB** 带内（payload 残差回吐 +24.2 实测）、穿越 src=13/15/16（p1vis import 修复随基座生效，wall-b 关闭）、**爬深 src=63**；KILLED_PASS1_EXPECTED=预期形态（spike 面归 slab 役）；kd `d62622f1` 金丝雀 2/2，D6v2 收获恒等 234/234。
  - **slab 役刀 1 入库** `b6213616d`：parser 分段机制纯新增 +642/−0，行为不变四重证明（四合同 primary.o 双臂逐字节恒等）；真实段常数钉定 max_seg_arena=**40.06 MiB**（SLABK1_ATTRIB+segment_readings 已镜像）。
  - **WDFS 入库** `ac41af29e`：aarch64 loop-plan peephole 边界检查 scratch R3→R2（迭代子布局彩票根修，VPN bug①③）；knife 三烤反汇编全等+VPN 闭包 4 烤 .o 同 sha。
  - **p1vis 入库** `e2ff96144`：pass-1 TypeArena 权威裸名不可达族源侧收口（192-Join 修复集 f5d9db72a 只落 5/8 的漏网 4 行 import），m3fix 门轮 src=13 not-visible 关墙。
  - **copyback 免刀**：bug② 无需动刀、零入库物（原线 REPORT 已灭失，结论以本行转述为准）。
  - **分支 B 复测 bin=no**（见下条改判）。
- **分支 B W1/W3/W2 改判（旧判点作废，判点归属 branchb/mirror 转述；fusion-plan §3.3 墙清单 W1/W3/W2 行由 fusion-plan 席下次写窗同步）**：最新驱动上 c1/c3/c6 复测 **bin=no（3/3），原 W1/W3 判词均不复现**（R5 `2a049ccd3` + R6 + ORCD11 `c92975786` + m3fix D6+X2 累计刀生效），接墙全换新三位点（三夹具均 ABORT rc=3 exit_code_contract_mismatch）：
  - c1 = normalized expression parser node missing kind=5 @std/result.cheng:51（泛型声明头）；
  - c3 = unresolved structural Call callee=range（结构化 call）；
  - c6 = resolved call missing concrete type __cheng_cstrlen @cmdline:178（旧 static-arg 墙位 146 前移，疑与在飞 staticarg 刀同根）。
  - U 组不解锁维持（fusion-plan:343 c1/c3 bin=yes 未满足，a9b_wait_and_run.sh 已验就绪不发车）。分支 B 原始 verdict（sha `23a3780f`）随 `.rebuild/branchb_line/` 灭失，逐字转述=m3fix REPORT §5.5 镜像；哨兵夹具本体 `src/a9_wall_probe/c0-c6.cheng` 在库。三新族裁处线（族归属+刀设计，零烤）待派。
