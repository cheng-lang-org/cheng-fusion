# Cheng 语法隐式规则债清单 + 演化路线图 v0（syntax_debt_line）

日期：2026-09-18。性质：**纯历史转译，零编译零烤制零源码写入**。方法论 =「演化即去特例」——每条语法隐式规则都是潜在墙，墙谱（修复轮次）就是该规则的代价账单。

## 0. 数据源与置信度声明

- 一手在案（本线逐份读入）：`.rebuild/{r6,r6f,r71,n1,n3,bd,ri,sa,ia,fg,tg,tdc,tdt,tdv,te,te2,orcd4,orcd5,orcd6,peak61,fs,fg}_line/REPORT.md` 或 `DESIGN.md`，共 20+ 份；`docs/cheng-formal-spec.md`；`docs/campaigns/2026-08-31-kernel-userpath/design/milestone_board.md`；git log 提交锚点（45001eeb8/5a11027fe/2a049ccd3/5dfc12d07/2875a5a07/e9a42241e/43ae2fe2b/16ed5cf76/b73de3afe/82f07684a/ecbb4f0cb 逐条核对在案）。
- 已清理、按账本转述（逐处标注）：`explore_line/judgment_families.json`（判词族历史全集灭失，判词族牵涉数改由各轮 b22 16/22 族面板逐轮在案计数）；`r7_line`、`n2_line`、`td_line/DESIGN.md`、`orcd3_line`（v3 冻结件灭失，orcd5 REPORT §0-8 四路查证在案）——凡引用处标**【账本转述】**并给出转引点（`sr_line/stop_rules.md`、`milestone_board.md`）。
- 墙谱主干序（判词史压缩叙事）：192-Join importc 可见性四连（45001eeb8 + join114/batch1/batch2=5a11027fe，census 判词轴 53 位点≈47 缺口 board:44-45）→ 键域分裂七连+1 设计稿（R5 2a049ccd3 / R6 5dfc12d07 / N1 2875a5a07 / R6F e9a42241e / R7-1 43ae2fe2b / BD 16ed5cf76 / RI / frozen-seal 稿）→ scope id 分配序（b73de3afe）→ ByCase+N3 allowlist（82f07684a）→ 泛型窗口臂（R6 环1）→ value-def 重绑【账本转述：board:105 ORCD1 同根】→ seq sret 桥【账本转述：sr R4=N2 立项】→ importc 直调臂合同矛盾（ia 钉位）→ TypeArena op 链【账本转述：sr R5 转引 R7 §4】→ spec 1.4 别名导出（45001eeb8）。

---

## 1. 规则债清单（16 条）

每条：{规则文本（spec 引用）｜判词族牵涉数｜修复轮次累计｜源覆盖面｜违背 fail-closed 表现｜演化方向}。轮次口径 = 墙谱实修轮（钉位/登记/设计稿单列）。

### D1 大小写导出合同（ByCase）与跨层可见性凭证隐式传递
- 规则：spec `docs/cheng-formal-spec.md:714-719`「首字符 ASCII 大写=导出；import 仅导入导出符号」。隐式面：小写即私有、跨层直调小写名被拒、allowlist 例外（system ptr-bridge 内征族）无声明式形态。
- 判词族牵涉：3 族——`static argument type unavailable`（census 判词轴主族）、`explicit type conversion operand type unavailable`（N3②）、`nominal declaration is not visible`（w16 门面可见性）。
- 修复轮次：**6**——192-Join 四连源修（45001eeb8 cas_store 别名；5a11027fe join114/batch1/batch2 覆盖 QUAL 族）+ N3② allowlist 补名 + N3③ 夹具一词迁移（82f07684a）+ R7-1 面 A hashmaps 6 处改名（43ae2fe2b）。
- 覆盖面：census 12 文件 11 组 47 缺口（board:44）；std/hashmaps（strDataPtr/strLenFast/load）、std/seqs（chengSeqFreeTyped 6 处无大写孪生，域决策仍悬 sr R7(2)）、std/stringlist、cas_store。
- fail-closed：`TypedExprSymbolExportedByCase`（typed_expr:12055 经 :33648）拒小写非 allowlist 名 → 实参定型 Missing → :29989 panic（rc=1/2）。N3③ 定谳该判词为**正确合同行为**（probe_c 保留红）——规则本身即用户直觉墙。
- 演化方向：**显式化**——导出标注与标识符大小写脱钩（声明式导出面）；allowlist 转声明式内征注解；跨层调用凭证随声明一次写明。

### D2 importc 双身份（声明名 vs C 符号别名）
- 规则：spec 1.4 别名 import 只暴露别名（45001eeb8 援引在案）；importc 行 `targetSymbol=="" ? name : targetSymbol`（typed_expr:31538+，ia §1-5）——仅别名形两列分离。
- 判词族牵涉：2 族——`resolved-call fact/TypedIR target payload drift`、`statement/call-node intrinsic identity drift`。
- 修复轮次：**2**——ia 刀（节点侧 4 hunk 向声明名对齐，World B 裁定）+ 45001eeb8 cas_store type 位漏网一刀。
- 覆盖面：std/atomic 全部 6 个 importc 声明皆别名形；任一别名形 importc 被调用即触发（import-only 足够，ia 最小夹具 3 行复现）。
- fail-closed：compiler_csg:8102 fact_name vs typed_name 逐字比对 fail（fail-closed 正确侧）。
- 演化方向：**键域统一**——声明行注册名为唯一身份，C 符号降为 lowering 期派生载荷（ia §0-② 三证已裁定，后端权威门全按声明名查表在案）。

### D3 名字身份四键域分裂（span / token / source-local / forest 投影）——七连修主体
- 规则：无 spec 条目（纯隐式合同）。同一名字在站与站之间各持一键域：declarationNameTokenIds（opener 反引号 token）、nameSpan（R5 后=内层 span）、bindingParserSourceLocalNodeRows（source-local 行合同域）、nodes2_bindingParserNodeIndexes（曾误装 forest 全局 id）、producerSourceIndexes（canonical 按 documentCid 序=合法非恒等排列）。
- 判词族牵涉：**8 族**——receipt TypeSyntax owner/span invalid、symbol name lacks exact token authority、invalid declaration row、backtick name opener ambiguous、binding reference TypedExpr/parser identity drift、parser source reverse identity invalid、structural field owner did not build、global_commit_invalid（frozen-seal 投影域 vs IR 提交域同型）。
- 修复轮次：**8**（7 实修 + 1 设计稿）——R5 nameSpan 双路径投影根修（2a049ccd3）→ R6 环2 四站共享反引号感知 resolver（5dfc12d07）→ N1 csg_core 第 5+6 消费者镜像（2875a5a07）→ R6F resolver 跨源偏移过滤（e9a42241e）→ R7-1 面 B 结构/文本层漂移镜像臂（43ae2fe2b）→ BD 耐久列改装合同域投影（16ed5cf76）→ RI init/claim 混环两段化（8fc9d1ff，报头注基线 16ed5cf76）→ frozen-seal 发布臂设计稿（fs DESIGN §2.1，未施工）。修法全遵守「原判据逐字保留 ∨ 权威形」——判据已固化为多站合同，**规则债利息 = 每个新消费站重演一次同型修**（T-I 四站清单漏计第 5/6 站即实证）。
- 覆盖面：一切反引号运算符名 + 一切跨模块 import（多源编译）。**234 闭包单源恒真从未发作**——全部红证据来自用户域多源/反引号形（BD §1：单源 global==local 恒真；RI §1：只有恒等排列能通过）。
- fail-closed：各站 rc=2 panic（snapshot/builder/schema/csg_core 各自的权威判词）。
- 演化方向：**键域统一**——canonical 名身份单一投影：把 N1 已建的「括号结构权威 + 解析期字节覆盖权威」（CsgCompilerBacktickNameTokenBracketValid/AuthorityValid）升格为唯一权威形，其余键域降为派生；根因形态单列 D10。

### D4 scope id 隐式分配序（单行套件惰性第二通道）
- 规则：无 spec 条目。scope id 由缩进套件 walk 按行序分配（parser:33225），单行 `if cond: action` / inline defer / 跨列 lexical 套件由 pass-2 语句种子终结遍惰性追加（:33569/:33557/:33771/:33879）→ 前行函数单行体 id 恒大于后行 walk 套件 id，domain stage 消费要求严格递增。
- 判词族牵涉：1 族——`structured source scopes out of source order`。
- 修复轮次：**2**——R7 钉位定谳【账本转述：sr R1/R5 转引 r7 §0-③/§4】+ sa 一刀（b73de3afe：惰性追加提前进 walk 行序位 + 5 逐行 SoA 预分配通道，真实触发谓词收窄=span 序上单行-if 后还存在任何 walk 套件即触发，sa §0-③）。
- 覆盖面：一切单行控制语句/inline defer（std/atomic 触发实例：Malloc :24 单行-if vs NewI32 :34-35 嵌套块）。
- fail-closed：compiler_csg:31216 panic（校验器 fail-closed 正确侧，零改动）。
- 演化方向：**删除/显式化**——sa 修法已把惰性第二通道合入主 walk（运行时侧去特例完成一半）；语言层终态 = scope 身份与源文本行序解耦（按归属树编号），或 spec 写明 span 全序分配不变量。

### D5 所有权×泛型窗口交互（泛型声明布局权威 + 实例化凭证）
- 规则：泛型声明按 exact-layout authority state=1 **刻意不落 ir_layout 行**（AppendTypeLayoutsFromContext :47959 泛型 continue 臂）；receipt validator 对绑定注解 TypeSyntax 根 owner 要求两形之一（R6 环1 补的泛型窗口臂：firstBindingNameToken 或首挂窗符号 token 等式）。
- 判词族牵涉：3 族——`pattern TypeSyntax owner/span invalid`（环1）、`unresolved structural Call callee=Option`（N3①）、`typed expr value definition: producer lacks exact type or ownership proof`（:6127，W3 同族面）。
- 修复轮次：**4**（2 实修 + 2 设计稿）——R6 环1 泛型窗口臂（5dfc12d07）+ N3① 泛型聚合构造定型臂（82f07684a）+ W3 value-definition type-proof 设计稿（`.rebuild/n3_line/n3_generic_ctor_value_definition_design.md`，exprClass/Arena managed 标志对账为必钉开放点）+ frozen-seal 同族发布臂稿（fs DESIGN）。
- 覆盖面：core/option——**经 std 传递闭包进入几乎一切用户域编译**（R6 §2.1 关键发现：hashmaps→seqs/strings/system 亦拉入）；一切泛型聚合构造 `Option[T](has:, value:)`。
- fail-closed：typed-expr panic（typeOwner 空 → :25147/:6127，rc=1/2）。
- 演化方向：**正交化**——泛型声明的布局权威与实例化解耦；实例化凭证（类型群 + ownership proof）在声明处一次显式给出，消费站只读不重建。

### D6 所有权×跨容器别名（W-A1-3 CloneStr 漏释族）
- 规则：spec `:26` 已有「alias 覆盖 retain 优先于 release」——但结构体字段/查找表条目持托管 buffer 靠手写习语（ParserOwnedText 私钥），位拷贝入字段（parser:38275 位拷入）不产生 retain。
- 判词族牵涉：1 族（历史最高频多显现面）——ORCM `registry_miss` / `cheng_orc_release_failure`（16 族面板基线签名）。
- 修复轮次：**≈8**——wa13 四轮证伪换向（board:67 先例）+ ORCD1-6 六线：orcd3 v3 冻结件灭失、orcd4 六期闭案（str_dispose 消费对 IR 不可见→scope drop 双发）、orcd5 刀证伪+双新发现、orcd6 三同型站点 InsertExact 私钥刀入库过墙（ecbb4f0cb：234/234 全解析 ORCMISS=0）。ORCD1「fresh 载荷不重绑 value-def」同根【账本转述：board:105】。
- 覆盖面：自宿主 234 闭包（TextSet 桶克隆、moduleConstLookup/names、capture 链）；语言面=一切托管值跨容器流转。
- fail-closed：ORCMISS 0xdd 毒印 `wrong_object_or_owner`，merge 崩 / rc=70 duplicate_or_untracked_release。
- 演化方向：**删除**——语法/类型层禁止裸位拷贝携带托管 buffer 所有权：字段持有必须经带精确 Owned/Borrowed 证据的通道（与 AGENTS 工程规范 5 同向；spec §0 语义已有，缺语法层强制）。

### D7 importc 直调臂合同矛盾（audit graph 身份未定稿）
- 规则：同文件两合同矛盾——compiler_csg:35632-35637 无条件要求 `targetGraphNodeIds>0`，:6648-6654/:19721-19726 规定 importc 行 graph node 恒 -1（ia §0-④(a) 钉位）。
- 判词族牵涉：1 族——`resolved importc target has graph node`（typed-node 审计）。
- 修复轮次：**0**（钉位登记，修法方向在案：补 importc 直调臂按 importc 权威链取返回 TypeId）。
- 覆盖面：一切 importc 直调（含非别名形，ia_ctrl_same 基线即撞）。
- fail-closed：rc=1 typed-node 审计拒绝。
- 演化方向：**键域统一**——importc 在 audit graph 的身份合同二选一定稿（-1 为正式合同则审计臂补权威形）；随后与 D2 合流为「importc 单一身份」提案。

### D8 权威表发布点不完备（builtin 字段 / 泛型 layout / 外模块 global / importc TypeId）
- 规则：每个「权威数据形态」需在各消费站有发布行/臂；全源发布臂先例仅 enum/importc/typedef/layout 四种（fs DESIGN §1.2 :63620-63657 原注释背书），第五种形态出现即成墙。
- 判词族牵涉：4 族——`not in exact authority`（FieldGet builtin 行恒 -1）、`typed-node exact producer TypeId missing`（op=38 LocalRef / op=68 NilPtr 变体）、`exact identity schema [freeze] partial authority kind=5`、`global_commit_invalid ir=0 projection=1`。
- 修复轮次：**1 实修 + 3 登记站**——FG builtin 字段行物化一刀（fieldget_builtin_materialize.patch，+120/−2 单文件）；op 链三变体【账本转述：sr R5 转引 R7 §4 二分矩阵】、外模块 global 发布臂（fs 稿 FS-1）、ia② NilPtr TypeArena 接入均登记未修。
- 覆盖面：一切 builtin 字段读（str/Bytes/[]/Option 的 data/len/cap/buffer/has/value——fg §2：全仓无任何 typeField 发布点）、nil 字面量、seq 局部、外模块 const。
- fail-closed：直接索引查找恒 -1 → missingRow panic（fg :18124；门本身无缺陷，缺表侧行——fg §2 设计定性）。
- 演化方向：**删除**——「权威数据形态→逐站补臂」模式声明式化：权威行发布点归一为 producer 单点合同，消费站只做 fail-closed 对账（fg 的 seal-源取上游冻结节点列已是该方向第一步）。

### D9 跨模块同名重载二义（Len 三声明）
- 规则：无 spec 定序合同。`Len` 同时声明于 strings:438 / seqs:369 / system:2644，跨层解析双 Unique 同秩 → Ambiguous（typed_expr:29958-29959，n3 §3-2）。
- 判词族牵涉：1 族——`ambiguous call declaration`。
- 修复轮次：**0**（登记；域决策三选一——补孪生/allowlist/归并——待协调席，sr R7(2)）。
- 覆盖面：result.cheng 及一切跨层调 Len 的闭包形（probe_f/probe_h 实证最小闭包即触发）。
- fail-closed：Ambiguous panic。
- 演化方向：**正交化**——重载解析定序合同 spec 化（跨模块同名候选的秩定义）；模块限定名一等化（注意 R7-1 面 B 证明连 `alias.CONST` field 读法臂都曾缺失——限定名通路本身是修复出来的，不是设计出来的）。

### D10 `[]` 三重身份（索引操作 / 泛型实参 / 反引号运算符名）+ spec 缺条
- 规则：spec 形式文法（`docs/cheng-formal-spec.md` §1，:110 起）**无反引号名条目**（本线 grep 全文零命中，实测）——`fn `[]`` 在 std 在用（r6_bk_def 夹具、hashmaps `[]`/`[]=`），纯靠 parser/键域各站隐式消解；`load[uint8](x)` 泛型实参靠 PlainQualifiedIdent 剥群区分于索引（n3 §1②）。
- 判词族牵涉：8 族（D3 全族的触发器）+ N3② 剥群面。
- 修复轮次：**0**（从未作为语法问题修——**七连 8 轮修的全是它的下游键域站**。本清单「演化即去特例」的头号标本：根因特例零轮，下游利息八轮）。
- 覆盖面：一切下标运算符定义 + 泛型直调（用户域普遍形态）。
- fail-closed：同 D3 各站。
- 演化方向：**正交化**——运算符名一等化（命名构造或 lexer 反引号单 token/单 span 权威），spec 文法补条；与 D3 合并为战役 2.0 首批提案，具体设计留立项。

### D11 注释位置隐式规则（冷 bootstrap parser）
- 规则：无 spec 条目。冷 bootstrap parser 不支持 `if` 条件表达式内 `#` 注释，注释必须放语句位（r6 REPORT 附 :77，v1 补丁缺陷实测暴露）。
- 判词族牵涉：0（编译失败，非判词族）。
- 修复轮次：0（教训留档）。
- 覆盖面：一切自宿主源。
- 演化方向：**正交化**——注释 lexer 层剥离、任意 token 间合法；spec 写明注释合法位。

### D12 注解附着规则（@ 必须紧贴声明 + 串叠合法）
- 规则：无 spec 文法条目。`@borrows→@importc→fn` 串叠合法（te2 §5-3 实测）；悬空/重复注解在 normalized-decl 读法期才炸。
- 判词族牵涉：1 族——`compiler csg: normalized decl read failed: duplicate @borrows on this declaration`（fail-stop rc=2，ORCD5 新发现 B）。
- 修复轮次：**1**——stray @borrows 删除入库（16ed5cf76 第一括号；preflight FAIL-by-design 待检查器「重复项白名单」用例，orcd5 §6）。
- 覆盖面：全仓注解声明（事故一教训同源：注解位移=静默丢注解，AGENTS 规则 10① 整条因它设立）。
- fail-closed：rc=2 fail-stop。
- 演化方向：**显式化**——注解附着目标在文法层定死（紧邻声明），悬空注解解析期 fail-fast 前移，与机械预检同判据。

### D13 facts 多遍触碰结构（TD 病灶账）
- 规则：临时事实表组装后回读/compact/normalize 多遍触碰——任务书口径「5 触碰→2」为**账本转述**（td DESIGN.md 已清理）；一手在案：每 fact 行 csg 侧 3 触碰→1、组装 4→1、事务 init/state-validate/metrics/delta 23k→234、FindSourceIndex 逐 fact→逐片（tdc §0-3）、compact 遍退役净 −24 行（tdt §0）。
- 判词族牵涉：0（性能债；退役证明=t2fix7 16 族双零+四合同冻结 sha）。
- 修复轮次：**4**——TD-1/2/3/4 四刀（tdc 两件 + tdt 一件 + tdv 叠加预验）。
- 覆盖面：编译器内部 facts 管线（23k facts/窗）。
- 演化方向：**删除**——单遍发射合同：TD-3a 已证「生产面全行可串行发射」，TD-3b 切片融合被证明否决（tdt §0 机制账）——即单遍化的边界已在案，剩消费面接线（TD-1/TD-2）。

### D14 cold 函数数上限（自举载体合同，非语言规则）
- 规则：typed_expr.cheng「已触 cold 函数数上限，禁新增顶层函数」（n3/r71 头注）；诊断段槽容量 25，首版缩 24 被 VaReresolve 越界自检拦下（tdt §0）。
- 判词族牵涉：0（越界即 bootstrap fail-closed）。
- 修复轮次：0（写权纪律，非修复对象）。
- 覆盖面：编译器巨石源（typed_expr 4.4 万行级）。
- 演化方向：**删除（条件化）**——自举固定点（GEN3）达成后载体退役，上限随之失效；列入路线图第③层准入判据。

### D15 源代际语法门控（migrationSourceSyntax）
- 规则：parser 内按源代际门控语法分支（sa §0-② 实名在案：单行-fn `=` 移位与 migrationSourceSyntax 门控）。
- 判词族牵涉：0（隐门，无独立判词；45001eeb8「源代际回归」事故是其管理成本实例）。
- 修复轮次：0。
- 覆盖面：迁移期源。
- 演化方向：**删除**——规范迁移完成后单代化；门控退役需先有 spec 侧单一定义（D1/D10 显式化的下游）。

### D16 token 文本的拥有/借用隐式合同（T-G 面）
- 规则：token 文本无一等借用视图 API，消费站逐个手写 `TokenText` 克隆——20 处克隆站点孤儿块 +441,237 块/281 树（tg §1.2）。
- 判词族牵涉：0（内存债 G(k) 孤儿项）。
- 修复轮次：**1**——T-G 刀（55244c8ce：ParserNameSeenSet + TokenTextEqualsText + 数字读数借用视图，三面构造等价，pass0 净留存 −94.8%）。
- 覆盖面：全部 parser 比较/名集/读数站点（结构性：512-token 直方图均匀 ~82 块/窗证明非单点，tg §0）。
- 演化方向：**正交化**——库/语言层提供一等 borrowed token-text 视图（spec §0 str 借用语义已有），新站点不再能写出克隆形。

**排除说明**：guard 双通道采样语义（orcd5 §0-6）、parser 每源树 arena `capacity*2` 倍增（peak61 §0-1，P0-G 刀已设计）、RSS 门值类——属内存/仪器债，由内存战役模型卡（约束卡）管辖，不入语法债清单。

---

## 2. 排程：规则债 Top-N（修复轮次累计 × 阻塞面）

| 排名 | 债 | 轮次 | 阻塞面（覆盖） | 单轮平均代价佐证 |
|---|---|---|---|---|
| 1 | D3 名字身份四键域分裂 | 8 | 一切多源编译+反引号名；234 单源恒真（用户域必炸） | 每轮四合同+双门+t2fix7 全套（各 REPORT §4） |
| 2 | D1 大小写导出合同 | 6 | census 47 缺口 + std 全域（hashmaps/seqs/stringlist/cas_store） | 6-7 轮批量源修可打穿（board:44-45 定稿） |
| 3 | D6 所有权×跨容器别名 | ≈8 | 自宿主 234 闭包基线签名 + 语言面托管流转 | wa13 四轮证伪+ORCD 六线（board:105/orcd4-6） |
| 4 | D5 所有权×泛型窗口 | 4 | core/option 经 std 闭包进入几乎一切用户域（r6 §2.1 实测） | W3 开放点 3 条未钉（n3 §3-3） |
| 5 | D8 权威表发布点不完备 | 1+3 登记 | 一切 builtin 字段/nil/外模块 const/importc TypeId | 每新权威形态=全消费站补臂（fg/fs/ia 三线同型证据） |
| 6 | D10 `[]` 三重身份+spec 缺条 | 0（根因）/8（下游利息） | 一切下标定义+泛型直调 | D3 的 8 轮全为其利息 |
| 7 | D2 importc 双身份 | 2 | std/atomic 6 处+一切别名形 FFI | ia 三别名夹具全红（ia §0-③） |
| 8 | D4 scope id 分配序 | 2 | 一切单行控制语句（std/atomic 实例） | sa 四象限矩阵（sa §0-③） |
| 9 | D13 facts 多遍触碰 | 4 | 编译器内部（23k facts/窗，TD-5 量化挂 ORCM 后） | tdc/tdt 结构账 |
| 10 | D7 importc 直调臂矛盾 | 0（登记） | 一切 importc 直调 | ia file:line 已钉（§0-④a） |
| 11 | D9 Len 跨模块二义 | 0（登记） | 跨层调 Len 闭包形 | n3 §3-2 最小闭包实证 |
| 12 | D12 注解附着 | 1 | 全仓注解声明 | 事故一+ORCD5 地雷双源（AGENTS 规则 10①/orcd5 §6） |
| 13 | D16 token 克隆合同 | 1 | 全 parser 比较站点（+441K 块） | tg §1.2 站点分解表 |
| 14 | D11 注释位置 | 0 | 一切自宿主源 | r6 附 :77 |
| 15 | D15 源代际门控 | 0 | 迁移期源 | sa §0-② |
| 16 | D14 cold 函数上限 | 0 | 编译器巨石源自体演化 | n3/r71 头注+tdt 槽位账 |

---

## 3. 演化路线图 v0（三层）

**总准入判据（贯穿三层，即「演化固定点三道」，全部有在案仪器）**：
1. **向后字节固定点**：四合同 primary.o = M1/M2/M3 冻结 sha（7b594c89…/abaa15ba…/1967b4cd…/39213361…）双臂逐字节（20+ 轮先例同判据）；
2. **自举固定点**：stage3 直烤 rc=0 + 金丝雀 2/2；GEN2/GEN3 原始字节对拍恢复后补入（当前阻于 module_const 同源双注册墙——te2 §0-5/ORCD6 §0-5，属层①待清偿项）；
3. **234 闭包+判词族零回归**：默认门 234 源 stderr 判词族逐族一致（16/22 族面板）+ t2fix7 7/7 逐字节。

**每层通用铁律：新特性/新刀必须消除 ≥1 条本清单登记特例（绑定 D 编号），否则不立项。**

### 层① 去特例审计（GEN3 前，纯源侧/编译器侧清偿）
全部为「家族同款：判据逐字保留 ∨ 权威形」低风险刀（七连已验证 8 轮的模式）：
- D7 importc 直调臂（ia 已 file:line 钉位，compiler_csg:35632 对照 :6648 合同补权威臂）；
- D8 余下三登记站：op=38/op=68 TypeArena 接入【账本转述：sr R5】、外模块 global 发布臂（fs DESIGN FS-0..FS-5 拆单表已备，typed_expr :63611 函数群 ~15-25 行）、ia② NilPtr；
- D1 剩余源修家族（census 47 缺口余量 + chengSeqFreeTyped 域决策三选一）；
- D9 域决策落地（补孪生/allowlist/归并）；
- D12 检查器重复项白名单（preflight FAIL-by-design 闭环，orcd5 §6）；
- D11/D15 spec 条目化（纯文档侧先行）。
层①出口判据 = 三道固定点 + 本清单登记站清零（登记项全部转为实修轮或显式 spec 条目）。

### 层② 宏/语法扩展系统（GEN3 后，战役 2.0 核心）
首批消除 Top 债（每项绑定债编号，方向性建议、设计留立项）：
- **D10+D3**：运算符名一等化 / 反引号名单一权威投影 + spec 文法补条——消除八轮利息的根因；
- **D1**：导出显式化（大小写脱耦的声明式导出面）；
- **D5**：泛型实例化凭证显式化（类型群+ownership proof 声明处一次给出）；
- **D4/D15**：单行形同构化 + 源代际门退役；
- **D6**：字段所有权强制通道（裸位拷贝入托管字段 fail-closed 前移到类型检查）。
准入判据：宏展开产物必须过 D3 canonical 名身份（不得新增键域）；每个新语法特性绑定其消除的 D 编号；三道固定点同上。

### 层③ 自宿主语法自举（parser 规则表声明式化）
- 目标形态：parser 规则表从代码分支变为数据表——D4（scope 分配序）、D11（注释位）、D12（注解附着）、D10（`[]` 消歧）成为表条目；语法新增不再需要改 parser 代码（自举定义）；
- D14 cold 函数数上限随自举载体退役（GEN3 达成即失效，无需专门刀）；
- 准入判据：规则表变更=纯数据变更过三道固定点；234 源 forest 解析零判词保持（te/te2 实测的 pass0 正资产，te §0-3「234/234 全解析零判词」为基线）；
- 前置依赖：层②的 D10 权威形定稿（规则表需要单一名字身份列）。

---

## 4. 末尾四件套

1. **规则债总数**：**16 条**（D1-D16；其中 8 条有实修轮次记录合计 ≈28 轮，5 条纯登记，3 条为纪律/文档条目。内存/仪器类债已排除并注明归属）。
2. **Top-5**：D3 名字身份四键域分裂（8 轮×多源编译全域）＞ D1 大小写导出合同（6 轮×census 47 缺口+std 全域）＞ D6 所有权×跨容器别名（≈8 轮×自宿主闭包基线签名）＞ D5 所有权×泛型窗口（4 轮×几乎一切用户域经 option）＞ D8 权威表发布点不完备（1 实修+3 登记站×builtin 字段/nil/外模块 const）。**潜伏最高息债**：D10 `[]` 三重身份——根因 0 轮、下游利息 8 轮。
3. **演化第一刀建议**：**把 N1 已建的括号结构+解析期字节覆盖权威形（CsgCompilerBacktickNameTokenBracketValid/AuthorityValid，2875a5a07）升格为反引号名的唯一 canonical 身份，并补入 spec §1 文法**——这不是新设计而是消费侧先例的反向提格（N1 三判点已用该权威形实测通过、四合同冻结 sha 零回归在案），同时偿还 D3 的根因与 D10 的 spec 缺条。若要求 GEN3 前纯编译器侧最低风险起步：D7 importc 直调臂（ia file:line 钉位、修法方向在案、零语法面）。
4. **置信度**：债条目与轮次计数=**高**（20+ 份一手 REPORT + git 提交锚点逐条核对；每条轮次可回溯到冻结补丁 sha）；判词族牵涉数=**中高**（逐轮 16/22 族面板在案可数，但 judgment_families.json 历史全集已清理，跨代归族为账本转述）；r7/n2/td 设计稿/orcd3 v3 引用处均已标注**账本转述**；演化方向与第一刀=**中**（方向性建议，具体设计按任务书留战役 2.0 立项，未做任何语法细节发明）。
