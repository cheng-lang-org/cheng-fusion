# VERIFY_whenblock_append —— [WHENBLOCK] when/block 语句产线刀（战役 R 第 3 红缺口）：授权墙（BodyIR ingress 产线）已清，typed 契约第二墙现形止损移交

date_utc=2026-09-06 · 代理=WHENBLOCK 线 · 克隆=/Users/lbcheng/cheng-f24/anchor_clones/whenblock（cp -R 整树克隆，/usr/bin/diff -rq src 与主树全等进场）· 烤机壳=.w/wb_bake.sh（cheng_w126 车头 0f198c5e，~3.8min/轮，600s 病理看门狗+他线病理击杀门）· 门=.w/wb_gate.sh（四夹具+19 探针单驱动一口径，m2 基线 A/B 对照）· 主树零代码接触（campaign docs/patches 追加）· 未 git commit · file face=src/core/backend/primary_object_plan.cheng + src/core/backend2/backend2_lower_stmt.cheng（同名臂同构镜像）；typed_expr.cheng/parser.cheng 零接触

## 结论先行

**基线红行判词所指的授权墙——BodyIR ingress 产线（`ownership body ir production: ingress BodyIR ownership invalid code=1`，BodyOpInvalid 落点）——已在本刀清除：when 头/续支/`block:` 臂补全后，两探针编译完整跑过 primary/lowering（`primary_missing=0 lowering_missing=0 lowering_fns=1 reachable=1 items=2 words=63`），ingress 判词不再出现。配对烤机 ×2 字节 EQ（sha f0ac0cee…×2，260s/220s 双 rc=0）。但 probe_when/probe_block 尚未翻绿：compile 尾门现形第二墙 `system link exec: cannot execute a plan that is not ready reason=typed_ir_contract … reason=unsupported_statement code=6 detail=130`——typed_expr.cheng:9567 bootstrap contract 只放行 surface 恰为 `break`/`continue` 的 Unsupported 语句。该门在 typed_expr（GEN2-P1 面），触本线止损条款，**交定性协调不硬改**：需 typed 行给 when/block surface 增契约白名单或立 typed 语句 kind。基线两红行维持红（判词更新为本新判词），翻绿待 typed 行合入后由主线程统一认证。**

## 一、墙形定谳与根因（核账）

1. 基线判词复现（834ff488/m2 双驱动同判）：`ingress BodyIR ownership invalid code=1 site=2 index=2 … op_kind=0 op_target=4 op_operands=3 a0=0 a1=64 a2=0`——code=1=BodyIrAccessErrorUnknownOp，op_kind=0=BodyOpInvalid，op_target=4=when/block 语句行，operands=[kind0, 64, probe]。
2. 产出点：primary_object_plan.cheng Unsupported 语句 general 通道尾 `PrimaryBodyIrAppendInvalidOp(…, 64, probe)`（补丁前 53477 一带）；backend2_lower_stmt.cheng 同构。ingress 门按设计 fail-closed，门无错，死在产线表无臂。
3. 语句流迹证（CHENG_PRIMARY_OBJECT_TRACE）：`when false:` 以 kind=unsupported surface=`when false:` 进 IR；链内 elif/else 续支以 kind=elif/else 进 IR（elif surface=已剥关键字条件文本，else surface 空）；分支体为更深缩进的普通语句。`block:` 无标签形（6 字符）不满足既有 `block <label>:` 臂守卫（len>7）。typed 层无 When/Block 语句 kind——产线臂归 primary/backend realizer（与 block-label、echo-Fmt 桥同族），非 typed 节点缺失，未触第一止损线。

## 二、刀体（whenblock.patch，两文件 8 hunks 纯增臂，+283/−2）

primary_object_plan.cheng 与 backend2_lower_stmt.cheng 同构四件套（[WHENBLOCK] 标记；backend2 为逐字复制架构的镜像副本，helper 名 B2WhenHeaderCondText/B2WhenChainCondEval）：
1. **链态平行栈**（DOD：`whenChainHdrIndentStk/SuppressStk/TakenStk: int32[]` 函数局部，每开链一行：链头缩进/压制中/链已中）。
2. **dispatch 前 when 编译期条件链门**：缩进精确配对——< 链头缩进弹链；== 链头且 elif/else 形（kind 或 surface 双认）→ 续支判定（elif 条件非常量 → InvalidOp 64/821 hard bail；else 链已中 → 压制；首真 elif/else → 选中）；> 链头 → 链体（压制期整句零 IR，live 期照常 dispatch；嵌套 when live 期递归接管、压制期随死支整片跳过）。兄弟链经弹链+重开正确轮转。
3. **Unsupported 臂内 `when <cond>:` 头臂**：`PrimaryBodyIrWhenHeaderCondText`（Exact 前缀+收尾冒号）认头形，`PrimaryBodyIrWhenChainCondEval` 仅收 `true`/`false` 字面；非常量 → InvalidOp(64/820) honest bail。链头自身零 IR。
4. **`block:` 无标签臂**：`commentTrimmed == "block:"` 精确匹配并入既有 no-op scope 边界语义；非法形照旧 general 通道 honest bail。

## 三、fail-closed 论证

- 条件收窄面仅 `true`/`false` 字面；任何表达式形 → InvalidOp(64/820/821) honest hard bail。零启发式、零运行时 Cbr 猜测、零兜底。
- 非法形（`when`/`block` 无冒号等）不进新臂，落原 general 通道 honest bail。
- 压制期死支不参与编译（when 语义对齐）；选中支按普通语句产线全权校验。
- 门透明性：无 when 链时门三处条件全假，逐语句原路径直落——本轮 A/B 门禁表逐行验证（§五）。
- 备注：whole-program 编译下 64/820/821 bail 当前被 typed 契约门（§四）前置遮蔽（Unsupported 语句先被契约拒）；typed 行放行后该 bail 即成 when 链的活动 fail-closed 门。

## 四、第二墙定性（止损移交，typed_expr 面）

新判词（probe_when，刀后驱动，干净串行运行）：
```
system link exec: cannot execute a plan that is not ready reason=typed_ir_contract function=main line=4 reason=unsupported_statement code=6 detail=130 primary_missing=0 lowering_missing=0 lowering_fns=1 reachable=1 items=2 words=63
```
- 坐标：src/core/lang/typed_expr.cheng:9567-9572（TypedExprBootstrapContract 语句循环）：`statements2_kinds == TypedExprIrStmtUnsupported` 且 surface 非 `break`/`continue` 即 `TypedExprBootstrapContractFail(…, 130, …, "unsupported_statement")`；plan 侧封装为 notReadyCode=6。
- 定性：when/block 在 typed IR 仅为 Unsupported+surface（无 When/Block kind），契约白名单不放行 → plan-readiness 拒执行。**primary/lowering plan 完整建成（primary_missing=0 lowering_missing=0）= 本刀授权墙已清的直接证据**；残余为 typed 契约与 statement-kind 表达，均在 typed_expr.cheng（GEN2-P1 占用面）。止损条款适用，不硬改。
- 移交选项（供协调）：①契约白名单增 when/block 头形 surface（最小改）；②立 TypedExprIrStmtWhen/Block kind+分类（正解，工作量在 typed）。两案任一落地后本刀臂即全程贯通，探针翻绿由主线程统一认证。

## 五、实测账

| 轮 | 载具 | rc | 结果 |
|---|---|---|---|
| bake_pa/pb | 刀后配对烤机 ×2（cheng_w126 0f198c5e 车头，260s/220s，全冷禁缓存+每轮新鲜缓存根） | 0/0 | **sha f0ac0cee8221391a18ce59f05d06c9833616c7c2637e5b4bc148c93cc237f05d ×2 字节 EQ**（同基名配方，见 §七） |
| gate_m2 | m2 基线驱动 × 本克隆（A/B 对照基线，23 行） | 0 | ordinary 0/0、call_fixture 0/1、while/enum/tuple/mod/varinit 0/0；probe_when/block=ingress 判词红 |
| gate_wb | 刀后驱动 f0ac0cee × 本克隆（23 行） | 0 | 与 gate_m2 逐行同判，漂移仅三处：①probe_when/block 判词 ingress invalid → typed_ir_contract（本刀推进，§四）；②probe_objctor 翻绿 0/0（现树 CallId 修复已合入，m2 代差）；③无任何行恶化 |
| 负/正夹具 | 非常量 when、`when true:` | 2/2 | 同落 typed 契约门（§四遮蔽，见 §三备注）；typed 放行后按臂语义裁决 |

## 六、门禁表

| 门 | 结果 |
|---|---|
| 核账（产出点 file:line + 语句流迹证 + 产线臂归属定性） | PASS（§一） |
| 配对烤机 ×2 sha EQ（cheng_w126 车头，同基名配方） | PASS（f0ac0cee…×2） |
| 授权墙清除（ingress 判词消失 + plan 完整建成 primary_missing=0 lowering_missing=0） | PASS（§四新判词） |
| probe_when/probe_block 翻绿（0/0+pass） | **未达（第二墙 typed 契约前置，止损移交）** |
| A/B 零漂移（m2 基座隔离口径） | PASS（gate_m2 vs gate_wb 逐行同判，仅 §五三处既定漂移） |
| 烤机报告契约字段 | PASS（键集合零漂移，值差异仅路径/计时族） |
| fail-closed 论证 | PASS（§三；活动门待 typed 放行后生效） |

## 七、配对字节 EQ 的基名泄漏发现（配方入档）

首对 A/B（wb_driver_a/wb_driver_b）同尺寸异 sha：逐字节审计仅 110 字节差=Mach-O UUID(16B)+尾部签名/OSO 族——输出**基名**泄漏进镜像成员名（`wb_driver_a.provider.host.o`）与 `wb_driver_a-<uuid>` stab 链，UUID+签名级联。m8/m9 字节 EQ 先例实为「不同目录、同基名 kernel_driver_merge」。配方铁律：**配对烤机必须同基名异目录**（.w/pa|pb/kernel_driver_wb），改基名必破字节 EQ。

## 八、基线刷新指令（user_path_baseline.tsv）

本刀后两红行**维持红**但判词应刷新为新墙（name/file/compile_rc 不变，verdict 列更新）：
```
probe_when	probe_when.cheng	1		system link exec: cannot execute a plan that is not ready reason=typed_ir_contract function=main line=4 reason=unsupported_statement code=6 detail=130
probe_block	probe_block.cheng	1		system link exec: cannot execute a plan that is not ready reason=typed_ir_contract function=main line=4 reason=unsupported_statement code=6 detail=130
```
typed 行白名单/kind 落地后翻绿终态：`0		probe_when=pass` / `0		probe_block=pass`。

## 九、纪律与铁律执行账

- 主树零代码改动（交付=campaign patches/whenblock.patch + 本文件；git apply --check 干净）；未 commit、未建分支/worktree。
- 烤机铁律执行：①R2-C 病理车头 pid 93048（etime 103min≈健康基线 29 倍）kill+通报；②GEN2-P1 越帽 knife pid 79840（etime 11:03>900s 帽）kill（先于静窗令到达，既授权执行）；③本线 A/B 前序轮 600s 看门狗自杀 ×3（负载饥饿，13 并发编译期）+**32:23 孤儿诊断**：看门狗 kill -9 仅杀车头父进程，其孙辈编译进程存活至主线程 32:23 击杀——wb_bake.sh 已入档缺口（应进程组击杀），本轮配对（cheng_w126，230-260s）全程健康未再触发。
- bake_win 锁：mkdir 原子优先+被占降级 marker（owner_WHENBLOCK.pid），只用毕撤自方标记；静窗仲裁令后未开新轮，解封后以 cheng_w126 完成 260s/220s 双轮。
- 无 heredoc：全部文件经编辑工具落盘；比对一律 /usr/bin/diff 或 cmp；rc 紧邻捕获。
- 克隆大对象（.w 下 driver ×4、gate exe/缓存、bake 缓存根）交付后即清。

## 十、移交材料

1. whenblock.patch（两文件 8 hunks 纯增臂）——typed 行放行 when/block 契约后即可全程贯通，无需再动 backend。
2. 第二墙坐标：typed_expr.cheng:9567 契约白名单/语句 kind 二选一（§四）。
3. 配对烤机同基名配方（§七）与 wb_bake.sh 看门狗壳（含进程组击杀待修缺口）。
4. 刀后驱动：.w/pa/kernel_driver_wb（f0ac0cee…，主树合入后由主线程重烤认证，本克隆驱动不作认证基线）。

## 主线程合入复验（2026-09-06，收割追加）

1. whenblock.patch git apply 干净落地主树；**尾墙按移交案①落最小白名单**：typed_expr.cheng bootstrap 契约（原 9567 区）增 when `/elif `/else/`block:` 头形放行（bsSurface=PathTrim 后前缀/精确匹配；break/continue 原精确语义不动；其余 surface 维持 hard-fail code=130 不放宽）。
2. 配对烤机 m14=m15=60c22b96d8aad8ce2469166fdb515cd6cce89dbb0dafa748cb47e06f47334cb9（rc=0，273/279s）。
3. 全门认证 rc=0——四夹具 4/4、探针区 **11 绿**（probe_when/probe_block 翻绿：compile=0 run=0 stdout 判别行在）/8 红 0 STALE，树峰 1,001,816,064B < 1GiB。基线两行已刷新 0/0/-。语言面棘轮自 9/5 基线累计 +4（objctor/break/continue/when/block 两批次）。
4. 合并协调备注：本刀触 primary_object_plan.cheng + backend2_lower_stmt.cheng，与 R2-C-FAMILIES 的 C6（backend2_lower* 裸 import 收口）同文件——hunk 行区间表见 §移交，主线程按序合入时对位。
