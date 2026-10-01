# VERIFY_w144_append（wall144 线 · Phase B 前置验收基建 · 2026-09-04）

执行者：wall144 线代理。硬约束遵守：src/core/** 零触碰（git status 中 src/core 36 个 M 文件均为 wall142 在飞线既有树态）；未烤机、未 commit、未开分支；探针 zz_probe_w144* 用后已删；租约冲突（t_assert_fail 首跑 `os atomic tree: parent lease unavailable`）已串行退避重试拿到真判词。

## 三件状态

| # | 任务 | 状态 | 一句话 |
|---|---|---|---|
| 1 | gate 探针区扩展 | **完成** | `# --- probe section ---` 两段式 TSV + `--require-probes-green`，四夹具收官语义与退出码契约不变，契约测试 6 个新用例全绿 |
| 2 | t_match/t_when 修型 + 12 件自查升级 | **完成（含实测定性）** | 12 件全部升级为判别行验收件 + 新增 t_assert_fail；t_match 补 main+显式 return，t_when 改显式 var+编译期分相；另按 seed 实测修正 `var x: int32 = 0` 非法形 4 件 |
| 3 | sizeof/assert 重测 | **车头已销账；w143 在飞墙待 wall142 后终验** | cheng_w126 车头：t_sizeof（含 `+` 嵌套形）/t_assert 全绿、t_assert_fail 正确非零退出；w143_r1 红归因在飞修改态（typed_expr +231 未提交、ownership BodyIR 墙族） |

## 任务一：gate 探针区

### 设计
- 基线 TSV 分两段：分隔行 `# --- probe section ---`（精确匹配，至多一次，重复=ENV-FAIL rc=2）之前为四夹具收官区（恒 4 行、四名强校验、独占退出码）；之后为探针区，同五列 TSV 格式，名字不限于四名（master 文件仍必须在 fixtures/ 存在，五列形状约束 compile=0→run 必填/verdict 空、compile≠0→run 空/verdict 必填 与收官区一致）。
- 探针区绿态行（run rc=0）额外要求 run stdout 含 `<fixture>=pass` 固定子串判别行，缺失=PROBE-STALE——这是「验收件自带期望值自查」的门上消费点。
- 探针区红/漂移只进独立计数与 `probe_summary:` 行，不影响四夹具退出码；显式 `--require-probes-green` 时探针红/漂移归入 exit 1。
- RESULT 列新标签：PROBE-PASS / PROBE-RED / PROBE-STALE。
- 探针区行不做 FINAL-CONTRACT-RED 检查（收官合同仍只约束四夹具）。

### 改动文件
- `/Users/lbcheng/cheng-lang/tools/user_path_gate.sh`（探针区校验/执行/计数/旗标/usage）
- `/Users/lbcheng/cheng-lang/tools/user_path_gate_contract_test.bash`（+6 探针用例与静态 grep）
- `/Users/lbcheng/cheng-lang/tools/user_path_gate_fake_driver_contract_test.bash`（probe_ok/probe_silent/probe_fail 分派）
- `/Users/lbcheng/cheng-lang/tools/user_path_gate_fake_executable_contract_test.bash`（probe_ok 判别行输出 / probe_silent 无输出）
- testdata 新增：`tools/testdata/user_path_gate/probe_green.tsv`（绿态+红态注册）、`probe_stale.tsv`（run 期望漂移）、`probe_silent.tsv`（判别行缺失）、`probe_dup_marker.tsv`（重复 marker→rc=2）
- fixtures 新增：`probe_ok_fixture.cheng`、`probe_silent_fixture.cheng`、`probe_fail_fixture.cheng`（fake 契约测试用 master 件）

### 用法示例
```
# user_path_baseline.tsv 末尾追加：
# --- probe section ---
# t_while	src/tests 蓝本的 fixtures master 件	0	0	
```
`tools/user_path_gate.sh --driver <kernel_driver> [--require-probes-green]`

### 门禁表

| 门禁 | 结果 |
|---|---|
| `bash -n` gate + 4 契约脚本 | 过 |
| user_path_gate_contract_test.bash（含原 6 用例回归 + 新 6 探针用例） | **全绿 contract_rc=0**（`user_path_gate_contract_test_status=pass`） |
| 原四夹具语义回归（current rc=1 known_red=2 / final rc=0 pass=4 / verdict_drift / final_contract_red / rss / escape） | 全部不回归 |
| 探针用例：probe_green 默认 rc=0 且 `probe_summary: probe_pass=1 probe_red=1 probe_stale=0`；`--require-probes-green` rc=1 | 过 |
| 探针用例：probe_stale / probe_silent 判别行缺失 → PROBE-STALE；加旗标 rc=1 | 过 |
| 探针用例：重复 marker → rc=2 `ENV-FAIL: duplicate probe section marker` | 过 |
| 真驱动（w143_r1）跑现基线 gate | rc=1 四夹具全 BASELINE-STALE，判词 `system link plan: entry module identity unavailable`——wall142 在飞态所致（gate 自身行为/退出码/probe_summary 输出正常；fake 契约已证四夹具路径逻辑）。**待 wall142 后重跑终验** |

## 任务二：12 件修型 + 自查升级（+1 新增）

统一验收件形：语义自查期望值 → `echo("<name>=pass")` + `return 0`；失败 → `echo("<name>=fail")` + `return 101`。反向件（t_assert_fail）期望非零退出且无 pass 行。

| 件 | 修型/升级内容 | w143_r1 实测（compile/rc/判词摘要） |
|---|---|---|
| t_match | **补 main()**、隐式 result→显式 return、+else 臂、main 双臂消费 `Color.Red/Green` | rc=2 `PARSER_BRANCH_WITHOUT_IF`——case/of 块语句 parse 臂缺（定性：特征前置 parse 缺口） |
| t_when | **隐式 result→显式 var**；`defined(名)` 全树无定义（parser/typed_expr 零臂），改用 spec 合法编译期常量三相 `when false/elif true/else` 证明只活臂生效 | rc=1 挂 `ownership body ir production: ingress BodyIR ownership invalid`（在飞 ownership 墙族）——when 链路已通到 BodyIR 段，**待 wall142 后重测** |
| t_assert | +判别行 | rc=1 同上 ownership BodyIR 墙（见任务三） |
| t_assert_fail（新） | 反向验收件：assert(1==2) 期望非零退出 | rc=1 同上（首跑撞租约已退避重取真判词） |
| t_closure | `proc (`（spec 外）→spec 合法 `fn` 字面量形；+判别行 | rc=1 `typed expr: unsupported structural value case=12 surface=fn (a: int32...)`——**parser 已接受 fn 字面量**（修正预研"匿名前端全缺"：parse 有臂，缺 typed_expr 结构值 case=12） |
| t_defer | defer 内赋值不改返回值语义形（`defer: x = 99`）；+判别行 | rc=1 `parser value expr: prebound statement root has no role`——defer 块语句值表达式臂缺 |
| t_enum | `Status.Ok` 参与 ==比较（原 s 未消费）；+判别行 | rc=2 `compiler csg: exact parser expression lacks declaration node line=2`——enum 成员声明 csg 链路挂 |
| t_for | +判别行（期望 total=10） | rc=2 `normalized expression parser node missing surface=..<`——range 表达式 `.. <` 节点缺 |
| t_sizeof | 扩 `+` 嵌套形（plan 点名 nested-call 臂）；+判别行 | rc=1 `typed expr: structural nested call argument did not build`（见任务三） |
| t_tpl | +判别行（期望 42） | rc=1 `typed expr: node value/share authority is incomplete`——与 plan 原判吻合（generic node authority 缺臂） |
| t_try | +判别行（保留未命中形） | rc=2 `parser type syntax: field declaration type missing`——try 块语句形 parse 缺。**注意：try 块语句/raise 均不在 formal-spec**（spec statementCore 无 tryStmt/raiseStmt），Phase B 实现前需先走 spec 扩展，本线不擅自改 spec |
| t_tuple | p.x/p.y 双投影自查；+判别行 | rc=2 `parser type syntax: tuple field list missing`——tuple 缩进字段表 parse 臂缺 |
| t_while | +判别行（期望 i=3） | rc=1 `cheng_cold: exact identity schema [freeze] partial authority ... primary exact def freeze validate rejected`（循环 CFG merge 写者被 freeze 段拒——循环 CFG 生产缺，与预研判定吻合） |

**修型过程中发现的通用语法事实**：`var x: int32 = 0` 被 seed 判 `redundant explicit default init; omit initializer`（rc=2 硬错）——t_defer/t_for/t_when/t_while 已改为 `var x: int32`（省略初始化器）。Phase B 验收件一律遵守。

## 任务三：sizeof / assert 重测销账

探针处置：`src/tests/zz_probe_w144_sizeof_a.cheng`（原形 `int32(sizeof(int32))` 定界探针）、`zz_probe_w144_assert_ok.cheng`、`zz_probe_w144_assert_bad.cheng` 三件实测后已删除。

| 驱动 | 件 | compile | run | 判词/输出 |
|---|---|---|---|---|
| cheng_w126（语义参照车头） | t_sizeof（含 `int32(sizeof(int32))+int32(sizeof(int8))` 嵌套形） | 0 | 0 | stdout `t_sizeof=pass` |
| cheng_w126 | t_assert | 0 | 0 | stdout `t_assert=pass` |
| cheng_w126 | t_assert_fail | 0 | 1 | 假断言正确触发非零退出，无 pass 行（反向形成立） |
| w143_r1 | t_sizeof / zz_sizeof_a（原形） | 1 | - | `typed expr: structural nested call argument did not build` |
| w143_r1 | t_assert / t_assert_fail | 1 | - | `ownership body ir production: ingress BodyIR ownership invalid` |

**结论**：
- **sizeof、assert 以车头 w126 语义参照为准：已支持，从 Phase B 实现清单销账**（sizeof 连 plan 点名的 nested-call 形都绿；assert 真假两形语义完整）。
- w143_r1 上的红**不算负结论**：挂点分别落在 typed_expr（收官线在树 +231 未提交正在改）与 ownership BodyIR 生产（wall141/142 在飞墙族），按纪律记录**待 wall142 收官驱动重测终验**。w126→w143 之间 typed_expr structural 段出现的行为回退请 wall142/实现线知悉（`structural nested call argument did not build` 为新增挂点）。
- 未实测到 `captured-old release authority mismatch` 族墙（v6 族）拦截的探针形态，无该类待重测条目。

## 移交 Phase B 实现线的增量情报（相对预研报告的修正）
1. closure：parser 已接受 `fn` 字面量形，缺口收窄为 typed_expr 结构值 case=12（预研"匿名前端全缺"修正）。
2. when：spec 合法编译期分相（常量条件）已能走到 BodyIR ownership 段，缺口比预判小；`defined()` 名字空间全树未定义，实现时需先定名。
3. while：缺口确认为循环 CFG 的 primary exact-def freeze 段拒绝（writers=2 CFG merge）。
4. try/tuple/enum/match/for：挂点全部前置到 parser/csg 层，预研"parse kind 在"不等于"parse 臂通"。
5. `var x: T = 0` 形非法（seed 硬错），验收件模板已按 `var x: T` 修正。
6. gate 真驱动跑四夹具当前全 STALE（`entry module identity unavailable`），与 t_* 件直接编译路径行为不一致，wall142 收官后应先重跑 gate 恢复四夹具绿基线再挂探针。

## 交付物索引
- 门：`/Users/lbcheng/cheng-lang/tools/user_path_gate.sh`
- 契约：`/Users/lbcheng/cheng-lang/tools/user_path_gate_contract_test.bash`（+fake 驱动/可执行 2 件 + testdata 4 件 TSV）
- 验收件：`/Users/lbcheng/cheng-lang/src/tests/t_{assert,assert_fail,closure,defer,enum,for,match,sizeof,tpl,try,tuple,when,while}.cheng`（13 件）
- 实测记录：`/tmp/oob_ab/w144/w143_all.tsv`、`/tmp/oob_ab/w144/w126_heads.tsv`、`/tmp/oob_ab/w144/real_gate_w143.log`、`/tmp/oob_ab/w144/probe_run.sh`
