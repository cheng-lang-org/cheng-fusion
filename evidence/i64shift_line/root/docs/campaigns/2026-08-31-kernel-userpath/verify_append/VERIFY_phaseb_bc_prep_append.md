# VERIFY_phaseb_bc_prep_append.md —— PhaseB-B/C 组准备线（while/for + match/when/assert）2026-09-05

锚点 commit=69817b8b2。车头=/tmp/oob_ab/cheng_w126（cheng_cold，**C 冷链口径**；kernel driver 链在 wall150 测量租约期禁运行，全程未跑）。编译调用形态：`cheng_w126 system-link-exec --in:<src/tests/t_*.cheng> --out:<t.exe>`，逐件串行。全程零 git commit、零分支；src/core/**、docs/**、bootstrap/** 零改动；足迹仅 src/tests/t_{while,for,match,when}.cheng 四件修型（t_assert/t_assert_fail 未动）。

## 一、验收件逐件实测（判词逐字）

| 件 | 修型内容 | compile | run | 判词/输出（逐字） |
|---|---|---|---|---|
| t_while | 修型（原件违规计数形→非计数形） | 0 | 0 | stdout `t_while=pass` |
| t_for | 修型（range 保留 + 数组字面值迭代） | 0 | 0 | stdout `t_for=pass` |
| t_match | 修型（三分支 enum 判别 + else；guard 形二分后收窄移出） | 0 | 0 | stdout `t_match=pass` |
| t_when | 修型（when/elif/else 三相 + 无 else 死臂） | **1** | - | `cheng_cold: unknown identifier (recovery=0 depth=2)` + `[cheng_cold] primary object emit failed` |
| t_assert | 保留现状 | 0 | 0 | stdout `t_assert=pass` |
| t_assert_fail | 保留现状 | 0 | **1（预期非零）** | stdout `math broken`，进程在断言处退出（echo/return 0 未达）——反向合同成立 |

**红灯清单规模：6 件中 1 件红（t_when），另 1 形状（case guard）二分定位红灯未入库。冷链绿灯仅证明夹具期望值与 spec 语义自洽；kernel driver 链为最终验收门（recon 定性：while/for/case 的 lowering 臂为 0，冷链不在授权面）。**

## 二、修型明细与 spec 依据（docs/cheng-formal-spec.md）

### t_while（原件违反 spec MUST，已修型）
- 原件 `while i<3: i=i+1` 是 spec L550 明令"必须改写为 for"的违规计数形，作为长期验收资产不合格。
- 修型后两形状：① 倍增收敛 `while v < 100: v = v * 2`（v:1→128，steps=7，非计数型——while 的正当地盘）；② `while true` + `n==4` 时 `break` 哨兵循环（hits=30，验证 break 结构化退出）。依据 L354 whileStmt 文法、L341 breakStmt、L45 退出 LIFO、L551 MUST 条款。
- 冷链实测：编译 rc=0，run rc=0 `t_while=pass`。

### t_for（数组字面值迭代升级，seq 表述废止）
- 形状① `for i in 0 ..< 5` 累加 total=10（原件保留）；形状② `var xs: int32[] = [10, 20, 30, 40]` + `for x in xs` 累加 sum2=100。依据 L356 forStmt、L552（in 支持 range 字面值/数组字面值/常量与变量）、L478 listLiteral、L554 `T[]` 动态序列、L166 bindingEntry 初始化器。
- **更正 recon 一处**：recon 写"for-in seq 迭代（kernel 主用形）"，但 `seq[T]` 已被 spec L556 废除（编译期报错），kernel 主用形按 `T[]` 理解。
- 冷链实测：编译 rc=0，run rc=0 `t_for=pass`（数组字面值迭代冷链全通）。

### t_match（三分支 + else；guard 二分定位后收窄）
- 修型后：Color 增 Blue 成三分支，`case c` + `of Red/of Green/of Blue` + `else`，编码 1/2/3。依据 L358-366 caseStmt/caseBranch/caseEntry 文法（else 合法形）。
- 冷链实测：编译 rc=0，run rc=0 `t_match=pass`。
- **guard 形二分实验（探针件未入库，已删除）**：`of Green if flag:` 挂 `cheng_cold: cold case arm label must be an int32 constant (recovery=0 depth=2)`——同件去掉 guard（纯三分支）即绿，定论为 case 臂标签核对不认 guard 后缀。spec L363 `"of" caseArm ["if" expression] ":" suite` 为合法形，属冷链实现缺口；kernel 链 C1 实现时 guard=判定树短路（先比判别值再与 guard 求与），不新增 BodyIR op。
- variantPattern 绑定形（`of Some(inner)`，L395）依赖判别联合 algebraicType（L285-286），规格中列为 C1 第二扩件（复用 [phaseB-enum] 的 TypeArena Enum 变体 CSR）。
- **t_match kernel 链硬前置**：依赖 enum 特征——PhaseB-A 实证含 enum 声明程序止步 production snapshot schema 墙4；且 parse 层 case-else 墙（`PARSER_BRANCH_WITHOUT_IF`）修法已由 parser 线定性（早退分支排除 `headerKind == ParserValueTokenCase`），落地须与 parser 线在途重构对齐窗口。

### t_when（修型合规，红灯=特征本体双链缺失）
- 修型后两形状：① `when false/elif true/else` 三相（picked=1）；② `when false:` 无 else 死臂（untouched 保持 0，证明死臂消除）。依据 L368-370 whenStmt 文法。
- 冷链实测：编译 rc=1，判词逐字 `cheng_cold: unknown identifier (recovery=0 depth=2)`。
- **决定性对照**：同形 if 版（`if true: picked = 1`，探针件已删除）编译 rc=0——定论为冷链无 when 语句臂，非夹具形状问题。与 recon"parser 仅关键字识别、无 WhenStmt AST kind、typed_expr 0 处"一致：双链均未实现 when。
- **spec 歧义记录**：when 语句求值时机 spec 无语义条目（defined( 全文零命中）。本轮按 recon C2 口径（编译期分相、死臂消除、非编译期已知条件 hard-fail）写入实现规格，请 spec owner 开工前补条目。

### t_assert / t_assert_fail（现状保留，spec 缺口记录）
- **assert 在 spec 全文零定义**（grep 无任何命中）——现实现为 parser builtin callee（:6262）。验收合同按"实现即合同"固化：通过形 rc=0；失败形输出消息 + rc≠0。
- t_assert：编译 rc=0，run rc=0 `t_assert=pass`。
- t_assert_fail：编译 rc=0；run stdout 逐字 `math broken`，rc=1——断言触发即非零退出（echo "t_assert_fail=fail" 与 return 0 未达），反向合同成立。gate 入基线时期望 rc 列填实测非零码防假绿。
- spec owner 需补 assert 全条目（建议语义：cond 假→输出 msg 非零退出，禁兜底）。

## 三、实现线即插即用要点（详见 /tmp/oob_ab/phaseb_bc_prep.md）

- B1 while：主战场 typed_expr 循环 scope 生产 + lowering 循环 CFG 四块（header/body/latch/back-edge，复用 body_ir_loop 分析形状与 BodyControlEdgeLoopBack），break=结构化出口边；面数 8-14，typed_expr.cheng 冻结后开工。
- B2 for：range 降级计数循环 + 数组形降级索引循环，复用 B1 CFG 生产；串行在 B1 后。
- C1 match：parser case 吞并墙修法（parser 线已定性）→ typed_expr value-def producer（[phaseB-enum] 臂复用）→ lowering 判定树比较链；硬前置=A 组移交项 1（snapshot schema enum 表示）。
- C2 when：parser 新增 WhenStmt kind（净新增）+ typed_expr 编译期分相；条件非编译期已知 hard-fail，禁降级运行时 if。
- C3 assert：预期仅 typed_expr 降级臂（if !cond: panic/exit 形）；最顺项可先行。
- 并行位：C3 零冲突可立即开（冻结解除后）；C2 错窗口可并行；C1 parser 侧必须等 parser 线落地；B1/B2 等 typed_expr.cheng 收官 commit 冻结。

## 四、纪律自查

- git status 复核：src/tests 仅 t_for/t_match/t_when/t_while 四件 M（另有并行线在途的 5 个 snapshot smoke 与 t_tuple 改动、src/core 多文件改动，均非本线所动，未触碰）；二分探针件 t_bcprobe_* 已全部删除，无残留。
- src/core/**、docs/**、bootstrap/** 零改动；零 commit、零分支；车头仅编译单夹具（秒级×9 次，串行），未运行 kernel 驱动、未烤机，wall150 租约期机器安静约束遵守。
