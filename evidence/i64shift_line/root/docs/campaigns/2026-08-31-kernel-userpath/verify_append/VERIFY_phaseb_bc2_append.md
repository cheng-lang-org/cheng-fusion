# VERIFY_phaseb_bc2_append.md —— kernel_driver_w2 PhaseB-BC2 续派实现线（W1 TypeId 通道 / assert 臂 / construction 墙）2026-09-05

克隆=/Users/lbcheng/cheng-f24/anchor_clones/bc_cont（HEAD=73debaef2，进场工作树干净）；主树 /Users/lbcheng/cheng-lang 零写入零烤机。零 commit、零分支、零 revert。车头=cheng_w126 + /tmp/oob_ab/w139 锚点版 manifest（entries=35，compiler_entry=backend_driver_dispatch_min.cheng），CHENG_COLD_OBJECT_CACHE_ROOT=<克隆>/.cold_cache CHENG_ENTRY_CACHE=0。烤机脚本为主树版的克隆变体（.w/build_kernel_driver_bc2.sh，仅 ROOT 改克隆——原脚本硬编码 cd 主树，直接跑会违主树零烤机纪律）。**门禁环境注意：provider 路径解析消费环境变量 CHENG_ROOT，门禁必须 `export CHENG_ROOT=<克隆>`**（首次踩坑：缺省指向主树，撞 `cold source snapshot source path leaves package root`，非墙）。

## 一、烤机台账（r1–r5，预算 5/5 用尽；每次烤机前 dispatch_min 闭包 --emit:obj 预门 rc=0）

| 轮 | 内容 | 产物 | size | sha256 |
|---|---|---|---|---|
| r1 | W1 wall43b + assert 臂 v1（EmitConditionOps cmp 槽 + puts/exit）+ seal 占位构造臂 | .fp/kdrv_bc2 | 186945120 | 21e018f78b35515415665af59c60019ce3fe9029d287945f159d6f9e71d2562d |
| r2 | wall133 assert 豁免 + assert 臂 v2（if 节点路径 EvalNode+LocalNonZero cbr）+ tuple 形状/字段/权威让位簇 | .fp/kdrv_bc2_r2 | 186945120 | f6d30aad4fa3b233ed140346007ed05f59ec85f3a38e160a944389703f07f0ab |
| r3 | assert 失败出口 exit→cheng_exit（provider @exportc 根可解析）+ 聚合构造绑定盖章助手（LocalDecl 文本臂挂点） | .fp/kdrv_bc2_r3 | 186961584 | 9d700af29971557a9f0ffac0bdf3fc86ad8da79ab554f203eb19fcca58cad86b |
| r4 | cheng_exit 入 PrimaryBodyIrDirectExternalCallTarget 白名单（plan 级 admit）+ 节点路径盖章钩子 | .fp/kdrv_bc2_r4 | 186961584 | 19788523956cf99f695c9dd8c2dd513d16f4e847c201cde9e09c1bd3fce5efdd |
| r5 | 盖章行派生回退（TypedExprIrBindingInitializerDefinitionRowForTypedFunction）+ FAIL_TRACE 诊断（终态驱动） | .fp/kdrv_bc2_r5 | 186978048 | 387ebf270cba11c8191ef8cb28ae6db0f454483204e7becc55e3542cfa28a1bf |

秒级门基线雷 codegen_a64_fill_units.cheng:471 未触发未追（闭包入口不经过该文件）。

## 二、三件判定（终态）

1. **W1（带初始化绑定 LocalRef 缺 exact TypeId）＝已修复并实证**。typed_expr 新增 `typedExprIrBindingInitializerTemplateStructuralTypeId`（wall43b）：语句列 bindingName 精确命中且 wall78 定义行已回填的唯一行 → defining 节点精确结构 TypeId（typedFunctionIndexes==当前函数坐标 + resultType intern 全等双门，同名多命中 -1 fail-closed），挂 TypedExprIrAddRhsLocalRefNode 的 wall43 失败回退。**实证**：探针 zz_bc2_probe_while_nobreak（`var v: int32 = 1` + while 主体读写 + v==128/steps==7 判定）compile=0 run=0 `probe_while_nobreak=pass`（kdrv_bc2_r3 实测，W1 代码 r3 后未改）。附带新增 `TypedExprIrBindingInitializerDefinitionRowForTypedFunction`（行派生，盖章钩子回退用）。
2. **assert 臂＝已修复并实证（双件达契约）**。三段合成：(a) typed_expr wall133 空-target 豁免扩 callee=="assert"（镜像既有 echo 豁免；修 kernel 链 typed 契约 140 missing_call_target——r1 实测 t_assert_fail 即此墙）；(b) primary call 臂 assert 识别门 + `PrimaryBodyIrAppendAssertStatement`：cond 经 NodeEvalProbe/EvalNode 物化单槽（if 语句节点路径同构；v1 版 EmitConditionOps cmp 槽路径在 cond 同值双操作数 `1 == 1` 时触发 ingress LocalShape code=11，实验矩阵定性后弃用）→ LocalNonZero cbr（true=join / false=fail 块）；fail 块 puts(msg)+cheng_exit(1)（cheng_exit=program_support_backend @exportc，且入 PrimaryBodyIrDirectExternalCallTarget 白名单——exit 仅 libc importc 无 provider 导出，作根必死「export root exit not found」）；msg 仅收纯字符串字面量，形态不支持落回原 poison bail=63 零弱化。(c) lowering 侧 fact 路径本就过滤 assert 行（文本路径既有）。**终态**：t_assert compile=0 run=0 `t_assert=pass`；t_assert_fail compile=0 run=1 stdout `math broken`——精确契约。
3. **construction lowering 墙＝本线授权面内已修（seal 墙消失），t_tuple 残留 freeze 墙已定性移交**。(a) 核心修复：`LoweringSealPrimaryObjectIrCallIdentities` 占位构造识别臂（签名行 0 + 非 importc + 声明行 -1 + 目标名精确命中过 `TypedExprIrCallNodeMinusOneDeclarationStateValidAt` 占位判定的 CallExpr 节点 → 跳过函数 identity 解析；判定不过原样 panic 零弱化）——`lowering plan: call target exact TypedExpr identity missing` 判词自 r2 起四轮门禁零复现。(b) 下游配套：primary exact call-node 权威/语句 call-result 所有权对占位态让位（不再 panic）；TypeShapeFromText 增 `tuple[name:type,...]` 聚合形臂 + LookupSingleFieldMeta 增 tuple 别名 owner 解引用字段臂（镜像 array< 匿名 tuple 先例，AnonTupleFieldMeta 扩双前缀门）——t_tuple 的构造已真实下降（零初始化 + 逐字段 FieldStore，偏移 0/4、尺寸 4/4 全对）。(c) **残留墙（预算尽，定性移交）**：t_tuple compile=1 `primary exact def freeze validate rejected`——绑定槽 p（Managed 聚合，tid=16，proof 已绑）在 freeze 门要求证明配对精确定义，实测 writers=0 defs=0（full BodyIR op/slot dump 见 .w/gates_r5/t_tuple.log）。已落两处盖章钩子（AppendLocalDeclInitializer 文本臂 + LocalDecl 节点路径 declCallExprDone 后）+ 行派生回退，r4/r5 实测均未命中真实 realizer（BodyIR 逐位同 r2）——定位需一次带 trace 的烤机指认实际发射者，预算已尽。obj_ctor r5 实测另见 `lowering body ir: canonical CallId identity missing`（同族 lowering body-ir 域，未及处理）。

## 三、r5 终局门禁表（kdrv_bc2_r5）

| 件 | 合同 | 实测 | 判定 |
|---|---|---|---|
| ordinary | 0/0 | compile=0 run=0 | PASS |
| call_fixture | 0/1 | compile=0 run=1 | PASS |
| cold_nested | 0/0 + pass | compile=0 run=0 `cold_nested_fmt_interpolation=pass` | PASS |
| v6 | 0/0 | compile=0 run=0 | PASS |
| t_while | 0/0 + pass | compile=1 `parser value expr: prebound statement root has no role` | W2（break role，parser.cheng，授权面外）墙维持 |
| t_for | 0/0 + pass | compile=2 `parser node missing surface=..<` | W3（range 节点，parser.cheng，授权面外）墙维持 |
| t_assert | 0/0 + pass | compile=0 run=0 `t_assert=pass` | PASS |
| t_assert_fail | 0/1 + msg | compile=0 run=1 stdout `math broken` | PASS |
| t_tuple | 0/0 + pass | compile=1 freeze partial authority（见二.3(c)） | 墙推进至 freeze 域，定性移交 |
| 探针 while（无 break） | 0/0 + pass | compile=0 run=0 `probe_while_nobreak=pass`（r3 驱动实测，W1 代码未再改） | W1 实证 PASS |
| 探针 for（数组形） | 0/0 + pass | compile=1 `typed expr binding: exact local value-definition group unavailable` | 循环变量绑定通道缺口（W1 设计只覆盖 decl-init 绑定列），移交 |

冷链对照（cheng_w126，零改动参照）：t_tuple/t_assert/t_assert_fail compile+run 全绿（`t_tuple=pass`/`t_assert=pass`/`math broken` rc=1）——primary 机械本身完备，本轮各墙均为 kernel 链权威门特有。

## 四、纪律自查

- 授权面：typed_expr.cheng / primary_object_plan.cheng / lowering_plan.cheng 三文件，全部 hunk 带 [phaseB-bc2] 标记；主树零写入零烤机。
- 探针件 zz_bc2_probe_*（src/tests，11 件）验收后已全部删除；克隆根杂项 compile log 已清；门禁脚本/实验件/roundtrip 证据全在克隆 .w/（任务临时目录）。
- patch=/tmp/oob_ab/phaseb_bc2.patch（44672B，sha256 058c8ccfa066393bd9cbd4c91abb1fbd0e8685fa076263b0b534984ffef5e5e4）；双向验证：REVERSE-CHECK PASS → REVERSE-RESTORE PASS（tracked 树回到基线 73debaef2）→ RE-APPLY BYTE-IDENTICAL PASS（三文件逐字节）。
- 烤机 5/5 用尽（r1–r5）；预门 5 次不计烤机。
