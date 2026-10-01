# VERIFY_phaseb_bc3_append.md —— kernel_driver_w2 PhaseB-BC3 线（W2 break role / W3 for-range / W4 match case-else / W6 when 臂）2026-09-05

克隆=/Users/lbcheng/cheng-f24/anchor_clones/bc3（HEAD=73debaef2，进场工作树干净，建后 `git apply /tmp/oob_ab/phaseb_bc2.patch` 前置）。主树 /Users/lbcheng/cheng-lang 零写入零烤机。零 commit、零分支、零 revert。车头=cheng_w126 + /tmp/oob_ab/w139/kernel_manifest_head_git.cheng，`CHENG_COLD_OBJECT_CACHE_ROOT=<克隆>/.cold_cache CHENG_ENTRY_CACHE=0`。门禁脚本=克隆内 `.w/gates_bc3.sh`（root/产出全锚定克隆，`CHENG_ROOT` 显式覆写）。烤机脚本=克隆变体 `.w/build_kernel_driver_bc3.sh`（原 w139 脚本硬编码 cd 主树，直跑违主树零烤机纪律）。

## 一、四件判定（一句话终态）

1. **W2 break role＝已修复并实证**。parser 值表达式树侧为 break/continue 终结语句新增正式产线：追加 `ParserValueExprBreak/Continue` 节点 kind（零子节点，span=关键字 token）+ `ParserValueExprStatementLoopExit/LoopNext` role（enum 尾部追加），终结语句注册自身 root event；`ParserValueExprNormalizedStatementRole` 补 BreakStmt/ContinueStmt 映射，seed 行经 role+行列三元组精确认领自身 root。连带更新三处 role 合法上界（parser StrictValidate、compiler_parser_receipt、compiler_snapshot_schema——后两处为 role 公共契约的必要连带，各 1 行越面，[phaseB-bc3] 标记申报）。**实证**：t_while compile=0 run=0 `t_while=pass`（kdrv_bc3_r5），原 `prebound statement root has no role` panic 消失。
2. **W3 for-range ＝parser 侧闭环、余墙移交**。`ParserAppendRangeExprsLine` 的 Range 行（行扫描产物，此前 role=Invalid 绑不上 for 头 LoopSource root，receipt 拒 `rootNode=-1`）新增认领臂：按行列冻结行 anchor（`..<` token）→ 回填行 span → token span==operator span 精确命中树侧 range 二元/切片节点 → direct root（for-in LoopSource）优先、enclosing root（切片等嵌套形）次之认领。**实证**：t_for 的 `surface=..< rootNode=-1` receipt 墙消失，parser 全过；**终态墙**=`typed expr binding: exact local value-definition group unavailable`——for pattern binding（introduction=PatternIterator）缺 decl-local 组行，属 **BC2 线已定性移交的 typed_expr 域缺口**（本轮授权面外），判词逐字一致。
3. **W4 match case-else ＝parser 面大幅推进、余墙定性移交**。落地：早退分支排除 Case（parser 线定性修法）+ **树侧 case 臂产线** `ParserValueExprProcessCaseArmSuiteRange`（of 臂产 CaseEntry root event（pattern 表达式，anchor=of 关键字），臂体行内/缩进形交既有产线；else 臂无 pattern 不产 root（与"else 不是独立语句"契约同构）；guard 形 admission 硬拒零弱化）+ colonless case 头 seed（`ParserReadCaseStmtHeadSeedRange`，kind=CaseStmt）+ case 臂域 else 行 ElseStmt seed 抑制（pendingCaseArmColumn 域追踪）。**墙推进链**：`PARSER_BRANCH_WITHOUT_IF` → `statement suite scope is missing` → `prebound statement root has no role` → **终态** `parser normalized structure: scope owner identity missing`。终态墙归因：case 臂域体行的 layer 缩进 scope 缺 owner statement ordinal 绑定（轻量 finalize 不建 suite scope）。**修复设计（函数级，移交下线一行级收尾）**：轻量 finalize 时预建 case 体 suite scope 并 `ParserScopeSetOwnerStatementOrdinal`（owner=case 头 statementOrdinal）。注：即使 parser 全过，t_match 完整闭环仍需 typed/primary 判定树真身（BC 线 VERIFY 已定性，授权面外）。
4. **W6 when 臂＝已修复并实证**。`parserReadControlStmtSeedRangeMode` 加 when 分支：when 头按任务书授权先例折叠为 IfStmt（elif/else 天然复用 if 续支通道；树侧 conditional 产线本已认 `ParserValueTokenWhen`），typed/primary 零新臂消费。**实证**：t_when compile=0 run=0 `t_when=pass`（含 when false/elif true/else 三相与无 else 死臂两形状）。spec 的 when 求值时机语义条目缺口照记移交 spec owner（本轮按 if-else 链运行时同构，未发明编译期分相语义）。

## 二、r5 终局门禁表（kdrv_bc3_r5）

| 件 | 合同 | 实测 | 判定 |
|---|---|---|---|
| ordinary | 0/0 | compile=0 run=0 | PASS |
| call | 0/1 | compile=0 run=1 | PASS |
| cold_nested | 0/0+pass | compile=0 run=0 `cold_nested_fmt_interpolation=pass` | PASS |
| v6 | 0/0 | compile=0 run=0 | PASS |
| t_while | 0/0+pass | compile=0 run=0 `t_while=pass` | **PASS（W2）** |
| t_for | 0/0+pass | compile=1 `typed expr binding: exact local value-definition group unavailable` | W3 parser 闭环；typed 域墙移交（BC2 已定性同判词） |
| t_match | 0/0+pass | compile=2 `parser normalized structure: scope owner identity missing` | 墙推进至 case 臂域 scope owner；设计移交（见一.3） |
| t_when | 0/0+pass | compile=0 run=0 `t_when=pass` | **PASS（W6）** |
| t_assert | 0/0+pass | compile=0 run=0 `t_assert=pass` | PASS（bc2 前置维持） |
| t_assert_fail | 0/1+msg | compile=0 run=1 stdout `math broken` | PASS（bc2 前置维持） |

四夹具 functional（ordinary/call/cold_nested/v6）全轮次零回归。

## 三、烤机台账（5/5 用尽）

| 轮 | 产物 | size | sha256 | 门禁要点 |
|---|---|---|---|---|
| r1 | kdrv_bc3（烤失败） | — | — | 判词 `cheng_cold: expected then value in multi-line if`——W2 hunk 的多行 then 值拼写被烤机车头（C 冷链）拒收 |
| r2 | kdrv_bc3_r2 | 186994592 | c68b016ac6477d52e6561df90272cf311f3d2db34e5826d3b823a760f6493e8b | base 四件绿、t_when PASS；t_while=snapshot role 上界、t_for=range anchor missing（helper 用 span 找 token 而 Range 行 span 未回填）、t_match=suite scope missing |
| r3 | kdrv_bc3_r3 | 186994608 | 11771988225ae46896f39d0c6cadf6707ee2b54f91c8e58490ac1d6c30313ce0 | t_for parser 闭环（typed 域墙涌现）；t_while 推进至 lowering summary（kind 对账缺 break/continue 桶）；t_match suite scope 残留（Read 缺 delimiter out 参） |
| r4 | kdrv_bc3_r4 | 186994608 | 2b29cee604ff6129abf5b3abc09421f355b9159f360227cb45480113e72835bf | t_while 仍 summary invalid（summary 桶修复在本轮烤机后）；t_match 推进至 prebound panic（else 臂 ElseStmt seed 抑制后的新暴露面） |
| r5 | kdrv_bc3_r5 | 187027472 | 9da0bc8d21521c01747b079455eac7154578988201c6e21b76cfa394ecc6a2e1 | **终态表见二**：t_while/t_when 达成，t_for/t_match 定性移交 |

烤机前的闭包 `--emit:obj` 预门（w126 车头，与烤机同执行体）共 20 余版迭代（v2–v22），全部不计烤机。**烤机车头判词语义记录**（C 冷链专有，kernel driver 侧不可见）：`expected then value in multi-line if`＝多行 then 值拼写不支持（须 then/else 值同行）；`borrowed call argument rejected`/`borrowed actual cannot bind non-var non-@borrows formal`＝@borrows 契约（携带 borrowed 实参的函数须 @borrows 标注，@borrows 函数签名不容结构体值参，var 形参禁传表达式）；多行条件的续行上不允许独立注释行（行尾亦然）。

## 四、patch

`/tmp/oob_ab/phaseb_bc3.patch`（32198B，基线=73debaef2+bc2patch，五文件）：
- `src/core/lang/parser.cheng`（+394/-6，主）：W2 role 通道+树侧终结语句产线、W3 Range 认领臂+anchor 冻结 helper、W4 早退排除 Case+case 臂产线+colonless case 头 seed+臂域 else 抑制、W6 when 折叠。
- `src/core/tooling/compiler_parser_receipt.cheng`（1 行）：role 合法上界随 enum 追加同步（越面 1 行，连带义务申报）。
- `src/core/csg_core/compiler_snapshot_schema.cheng`（1 行）：同上（`>12`→`>15`）。
- `src/core/tooling/compiler_csg.cheng`（+7）：semantic expr summary 补 breakStmtCount/continueStmtCount 桶（W2 对账连带）。
- `src/core/backend/lowering_plan.cheng`（+4，授权面内特征臂）：summary kind 对账总数/ShapeValid 补入两桶。

**Roundtrip**：REVERSE-CHECK PASS → REVERSE APPLIED（工作树回到 73debaef2+bc2，bc2 三文件 diff 原样保留）→ RE-APPLY PASS → r5 driver 核心门禁复验与 r5 终态逐条一致。lowering_plan 的 bc2/bc3 混合 hunk 已按 `--include` + bc2only 参照法分离，patch 内仅含 bc3 增量。

## 五、纪律自查

- 授权面：parser.cheng（主）+ lowering_plan 特征臂；越面 3 处均为 role 公共契约上界/对账的必要连带（receipt 1 行、snapshot_schema 1 行、compiler_csg summary 桶），全部 [phaseB-bc3] 标记便于编排者双线 merge。零 commit、零分支、零 revert；主树零写入零烤机。
- 探针件 zz_bc3_probe_m1–m19（src/tests）验收/二分后全部删除；门禁/预门日志、烤机脚本克隆变体、bc2only 参照全在克隆 `.w/`（任务临时目录）；`.cold_cache`/`.fp` 随克隆生命周期。
- 烤机 5/5 用尽（r1 失败 + r2–r5 成功）；预门为 driver 使用不计烤机。
- 移交清单：①t_match 终态墙修复设计（一.3，parser 面内一行级）；②t_for 终态墙=typed_expr 循环变量绑定通道（BC2 移交项，判词复现一致）；③typed/primary 的 case 判定树真身（match/case 语义闭环前置）；④spec 缺口：when 求值时机语义条目、case guard 形产线与语义、assert 全条目（前轮遗留）。
