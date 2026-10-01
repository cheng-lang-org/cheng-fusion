# OVERLOAD_DESIGN.md —— overload 歧义族裁处 + 去重迁移刀设计（`ambiguous call declaration name=Error arity=1`）

日期：2026-09-21。性质：**零烤设计线**——零编译器烤制、零 commit、活树零写入；实测仅用冻结机（`artifacts/bootstrap/cheng.stage3` sha `05af823e7db0c8ea…` + 冻结驱动 `kd_c1_b` sha `d86f1bb34b867530…`，c36 复测同源机=基座 5bdb7364432b 含 C1+staticarg）在受控克隆根做探针，全部产物独占本目录。补丁冻结件 `/usr/bin/diff` 生成，`git apply --check` 只读验证。

判点移交：`.rebuild/duowall_line/DUOWALL_DESIGN.md` 墙②尾——W4-os 规范迁移（f0b068a7b 已入库）后 c6 路径前进新墙：result.cheng:103 特化 `Error(Result[bool])` 与 :109 泛型 `Error[T](r: Result[T])` 同 arity 同秩，解析判 ambiguous fail-closed。

---

## 一、判点权威与实读链（现 HEAD 坐标，行号仅参考以锚为准）

1. **panic 站点**：`src/core/lang/typed_expr.cheng:30582`——`TypedExprResolveCallDeclarationFromText`（:30473）内，实参静态定型 `TypedExprCallStaticArgTypesInto`（:30375，调用点 :30555）前置完成后，`TypedExprResolveCallDeclarationWithExplicit`（:34331）返回 `TypedExprBuildIndexAmbiguous` 即 panic，判词只含 name+arity、不含 line/args。
2. **解析序**：同源 face（:34375-34408，os.cheng 自身无 `Error` 声明 → Missing）→ 裸名 import 环 `TypedExprResolveCallDeclarationKind`（:34248，:34411-34423 进入）：逐 import 对目标源单源查 `TypedExprBuildIndexLookupCallDeclarationInSourceForArgOwner`（:34013）；**任一 import 返回 Ambiguous 即整体短路 Ambiguous（:34313-34314）**；跨 import 同秩 tie 亦 Ambiguous（:34321-34322）。
3. **单源 tie 机理**（:34069-34090）：对 (source,name) 二分区间内每行算秩 `TypedExprCallDeclarationMatchRank`（:33949）——借阅闸 :33963-33971 → 泛型绑定 `TypedExprCallDeclarationBindTypes`（:33859，逐参 unify :33763）失败=秩0 → 逐参恒等 `TypedExprCallTypeIdentityEqual`（:33706，**文本先判短路 :33720**，落属主解析 :33726-33738）全中=秩2（exact）、否则秩1（bindable）；高秩覆盖、**同秩 tie → Ambiguous（:34088-34089）**。
4. **候选面普查**：全库 arity-1 `Error` 声明仅 result.cheng:103/:109 两行（`grep "fn Error\b|fn Error\["` src 全树；log.cheng:116 是 arity-2 不同 face）。两行**函数体逐 token 相同**（:103-106 ≡ :109-112，体不引用 bool 性），:103 恒等于 :109 的 T=bool 实例；同体第三副本 `ErrorText[T]` 在 :114-118。同 `@borrows` 同 `str` 返回。
5. **秩演算（读链结论）**：arg 文本=`Result[bool]` ⇒ :103 文本短路 exact 秩2 唯一胜；arg=`Result[X]`(X≠bool) ⇒ :103 绑定失败秩0、:109 秩1 唯一胜——**两行在任何单一可定型 arg 文本下按秩演算均应唯一**；实测 tie 意味着到达查表机的某 arg 文本使两行同秩（秩1 tie：arg 与 `Result[bool]` 属主恒等但文本不同——限定拼写类，:13893-13895 注释实证 `result.Result[…]` 限定拼写存在于 wild；或秩2 tie：文本同构，不可能因两行 param 文本互异）。该 arg 文本的精确触发位点未钉（见 §三）。
6. **先例同族**：①`typed_expr.cheng:33995-33999` 注释——seqs.Add 特化+泛型对的 false-ambiguity 已修过借阅闸半边，该 face 全 corpus 绿=秩机器对「合法特化+泛型」形状工作正常；②commit 2c29fe556（Len 二义墙）=裸名环混入别名边致双 exact rank2 panic，修=记录面+裸名环过滤，**并实证 system.cheng:2 import std/result → 凡引 system 者传递面必含 result.cheng**（杀伤半径）。

## 二、规范定性（docs/cheng-formal-spec.md）

- §1.3.3（:686-697）「符号重载分发（编译期静态）」**只覆盖符号运算符重载**（`$`/`[]`/`=`），收尾「若候选不唯一或不存在可用重载，必须在编译期报错」。
- **普通函数同名声明（特化 vs 泛型同 face）的合法性、解析优先序、显式类型实参消歧——spec 全文无一条规定**（§1.2.1/§1.3 全查）。即：**这是规范缺口**，不是「规范有规则而编译器漏臂」；现役秩机器（exact>bindable>fail-closed）是规范未背书的实现发明。

## 三、本线实测台账（双机八轮，判读诚实申报）

| 探针 | 形状 | stage3 | kd_c1_b |
|---|---|---|---|
| ov_a1_bool | param `Result[bool]` → `Error(r)` | rc=0 | — |
| ov_a2_str | param `Result[str]` → `Error(r)` | rc=0 | — |
| ov_a3_nested | `return Err[bool](Error(r))` 嵌套（镜像 os:2305） | rc=0 | — |
| ov_c1_letshape | 无注解 let 推断 → `Error(let值)` + `CloneStr(Error(...))`（镜像 os:2586/:3321） | rc=0 | — |
| ov_b1_os | `import std/os` 浅闭包 | — | rc=0 |
| ov_b2/b3/b4 | os 深闭包：read/write/atomicTree verify 族全部 Error 位点 | rc=0 | 卡**预存墙**（b2/b4=cmdline:178 C6 前红；b4 typed-expr 已过、csg 死于探针自身 `Bytes()` 物化；b3 过 typed-expr 后 csg 死于探针 `os.AtomicTree(0)` 转换面） |
| **去重后** a1/a3/b3 | 删 ：103 同夹具 | **rc=0 ×3** | a1 rc=2 但 typed-expr **过 Error face**，前进至 c1 复测**记录在案的同一条预期墙** `system.cheng:1614 RuntimeAllocationLedgerOperation`（a8d072457 commit message 原文同墙=交叉印证） |
| ov_a1_bool.c1b 红 | 未去重 kd_c1_b | — | rc=0（未达 tie 触发位点） |

**结论（诚实）**：c36 真机（kd_c36_b）与 c6 夹具均已灭（duowall 线 924MB 探针根提取证据后删除），本线双冻结机在所有可达 Error 位点上均唯一解析，**tie 的精确触发 arg 文本与位点未钉**——duowall 双源钉死的仅是「c6 闭包+kd_c36_b 机器上 ambiguous 判词出现」这一事实本身（判词逐字：`typed expr: ambiguous call declaration source=…/os.cheng name=Error arity=1`）。

## 四、三分叉裁处

**判定：③为主（两声明本不该并存→去重迁移刀），②伴行（规范缺口登记+提案条文），①排除。**

- **①排除**：编译器**有**「特化 exact 优先于泛型」臂（秩2>秩1，:34083）且对 seqs.Add 合法同构 face 全 corpus 绿；spec 又无被违反的解析规则——「补臂」没有规范靶子。秩演算显示两行在任何单一良定 arg 文本下唯一，tie 只能来自「属主恒等但文本异构」的 arg 拼写或上游填型串味（staticarg 成员2 同类），两者都**未钉**；在未钉机制上加秩语义/改名比较器=对全树重载面盲改，违第一性原理（动机不清立刻停）。
- **③成立**：:103 与 :109 体逐 token 相同、语义 100% 等价、:103 零独立表达力（它就是 ：109 的 T=bool 实例且恒被 ：109 覆盖）——两声明并存是纯冗余，任何机器态下的 tie 都因这个冗余而存在。**删 ：103 后单候选 face 结构性不可能 tie**，对任意 arg 文本、任意机器、任意未来演化稳健。判据法合 lessons:205 先例（dead-overload dedup 零语义 delta、判定=grep 全树 caller 闭包完整+语义等价——本线已做：arity-1 Error 全库仅此两行，裸名 FuncRef 面零使用）。
- **②伴行**：普通函数重载解析规则缺失是真空档，走规范迁移提案（镜像 W4-os 的「源侧修+规范条文化」工艺，OpenSpec propose→确认→apply→archive 另案，不碰编译器）：提案把**现役秩语义**条文化进 §1.3.3——「普通函数同名声明：特化（exact 参数恒等）优先于泛型实例化（unify 可绑），同秩 fail-closed 编译期报错」——零行为变化，使本轮与后续同类 face 有法可依；同时条文化「同模块同名特化+泛型对合法但冗余，源侧按去重治理」。

## 五、刀施工合同（去重迁移刀，源侧，零编译器改动）

- **补丁冻结件**：`result_cheng_dedup_error103.patch`（本目录，sha `43580077ac25f397…`，/usr/bin/diff 生成，repo 相对路径 a/ b/）——src/std/result.cheng 单 hunk 删 ：102-107 共 7 行（`@borrows`+特化 `Error(Result[bool])` 整块+尾空行），`fn Error[T]` 与其 `@borrows` 原样保留、注解紧贴关系不变。
- **机械预检回执（规则10①）**：`git apply --check`=PASS；`patch_preflight.py`=`FAIL  src/std/result.cheng ann=0 displaced=2 wedged=0 (balance=0 min=0) + LOST @borrows on declaration Error ×2`——**FAIL-by-design 如实登记**：被删块自含其注解，「注解→声明名」多重集必失一 `@borrows`/`Error` 项，这正是本刀的手术意图本体；wedged=0/balance=0/min=0 证明无楔入无空套件无括号失衡、无注解错挂（保留侧 `@borrows`+`fn Error[T]` 逐字在 hunk 上下文可见）。撤销只走冻结件 `git apply -R`。
- **落库工艺**：普通 commit（与 W4-os 同），零烤机增量；并入 c6 批施工时与批内其他 typed_expr 刀零文件交集（本刀 std 源域），可并行，行号漂移互不影响。

## 六、红绿口径

- **红臂**（已双源钉死，duowall 在案）：c6 合同夹具 × kd_c36_b（=HEAD a8d072457 语义）×W4-os 迁移生效 ⇒ rc=1/2、判词 `typed expr: ambiguous call declaration source=…/os.cheng name=Error arity=1` 逐字（c36 RETEST + `probe/c6_mig.stderr.txt` sha `5ae36c33507064b7`）。本线无可复现凭证（机与夹具已灭），不重复宣称本地红。
- **绿臂**：同窗同夹具唯一变量=本补丁 ⇒ 该 ambiguous 判词消失、verdict 前进至下一墙（未知，如实记录）；Error 调用行为语义恒等（体相同）。
- **本线微绿证（已实测）**：去重后 bool 实参/嵌套 Err[bool](Error)/os-atomic 深闭包三形态 stage3 全 rc=0；kd_c1_b 上 bool 形前进至 c1 复测记录在案的预期墙 system.cheng:1614（typed-expr Error face 已过）——证明去重不引入新红且解析前进。
- **正式落库验收**（批编排者口径）：金丝雀 2/2×每轮；c6 合同夹具 bin 进位；四合同 primary.o **漂移预算诚实申报**——Error 的 `Result[bool]` 调用者改绑 `Error[T=bool]` 实例（目标符号从非泛型 `Error` 变为按 T 实例化的实例符号），该形状消费者对象**合法漂移**；无 Error 调用的合同预期逐字节恒等，漂移即归因重查。

## 七、本线产物

| 件 | 内容 | sha256 前 16 |
|---|---|---|
| `result_cheng_dedup_error103.patch` | 去重迁移刀施工件（单 hunk -7 行） | 43580077ac25f397 |
| `probe/ov_*.cheng` + `probe/*.std*.txt` | 八轮双机探针夹具与 stdout/stderr 凭证 | —（逐文件在案） |
| 探针环境 | 冻结机 stage3 `05af823e7db0c8ea…` + kd_c1_b `d86f1bb34b867530…`；受控克隆根 git archive HEAD，CHENG_*NO_CACHE 全开、BACKEND_JOBS=1；根已提取证据后删除，tmp 目录登记 disk guard | — |

## 四件套

1. **三分叉判定一句话**：①排除——编译器秩机器（特化 exact>泛型）在位且 corpus 绿、spec 无被违反规则、tie 触发 arg 未钉；③成立——:103 与 :109 函数体逐 token 相同、纯冗余并存，一切 tie 的结构性根源；②伴行——普通函数同名/特化-泛型解析规则是 spec 真缺口，走条文化提案（把现役秩语义写进 §1.3.3）。
2. **修法一句话**：源侧去重迁移刀——单 hunk 删 result.cheng:102-107（特化 `Error(Result[bool])` 整块）保留泛型 ：109，零编译器改动、行为恒等、tie 结构性消除，镜像 W4-os 工艺。
3. **规模**：单文件 -7 行零新增；零烤机增量（正式绿判并入 c6 批驱动）；预检 FAIL-by-design（LOST @borrows×1 实登记）+`git apply --check` PASS+`git apply -R` 撤销。
4. **置信度**：中高——去重正确性（体恒等+候选面普查+裸名面零用+双机三形态微绿证+kd_c1_b 前进交叉印证）为高；「去重即清 c6 该墙」为结构必然（单候选不可能 tie）但正式绿判须 c6 夹具+批驱动实测收口；tie 的精确触发 arg 文本未钉已如实登记，不阻碍本刀（去重对该未钉机制稳健）。
