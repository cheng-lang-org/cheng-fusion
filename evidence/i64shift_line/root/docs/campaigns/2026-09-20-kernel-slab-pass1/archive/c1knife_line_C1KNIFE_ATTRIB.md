# C1KNIFE_ATTRIB — 归一化表达式族声明名 token 排除（c1 刀）

日期：2026-09-20｜判词依据：`.rebuild/trioverdict_line/TRIO_VERDICT.md` §一/§三 刀 C1
线目录：`.rebuild/c1knife_line/`（产物独占本目录；活树零直写，打补丁走受控克隆根）

## 判点（TRIO_VERDICT §c1）

`std/result.cheng:51`：行扫描器 `ParserAppendSimpleSurfaceExprsLine`
ResultIntrinsic 臂把泛型声明头 `fn Ok[T](value: T): Result[T]` 的声明名 token
`Ok` 误识别成 `NormalizedExprResultIntrinsic`（kind=5）表达式行；该行在
value-expr 树中无声明节点（root/origin 双 -1），
`src/core/tooling/compiler_parser_receipt.cheng:9117` 对函数身份域内每条归一化
表达式要求携带 parser 节点 → fail-closed：
`normalized expression parser node missing exprIndex=0 kind=5 line=51 surface=Ok rootNode=-1 originNode=-1 role=0`

## 刀（build_knife.py → c1knife_parser.patch，2 hunk，净增 37 行，单域 parser.cheng）

1. 新增 `ParserValueExprFunctionDeclNameAt(tree, line, column): bool`（插在
   `ParserAppendSimpleSurfaceExprsLine` 定义前的函数边界）：线性扫 value-expr
   树声明 CSR（`declarationKinds==ParserDeclarationFunction` +
   `declarationNameTokenIndexes`），命中精确 (line, col) 即 true。镜像
   phaseB-enum `enumMemberLineFlags` 先例，证据源升级到 token 精度。
2. ResultIntrinsic 识别臂 append 前加排除谓词：位置与函数声明名 token 重合即
   跳过 append。比行级排除更窄：同签名行其余位置的合法 Result intrinsic
   表达式不受伤（TRIO_VERDICT 风险点 col=i+1 与词法 1-based 字节列对齐已钉死：
   `ParserValueExprLexSpan` initialColumnNumber=1 逐字节推进，声明名恒在
   声明头行自身前缀区，join 不影响）。
   消费面核对：`ParserAppendSimpleSurfaceExprsLine` 仅两个调用点，第二点
   （:37612）appendResultIntrinsics=false 不进新臂，行为零变。

## 静态回放账（static_replay.py，零烤，bytes 口径逐算法移植：词法主环/续行 join/
行扫描臂/声明名规则/helper 镜像）

- std/ 全语料：55/55 回放成功；baseline ResultIntrinsic append 316 条 →
  刀后移除 9 条、保留 307 条；9 条全部为 `fn <名>` 声明头 col=4 的 c1 形
  （result.cheng 51 Ok / 59 Err / 84 IsOk / 87 IsErr / 90 Value / 96
  ErrorInfoOf / 103 Error / 109 Error + log.cheng 116 Error）；残留
  （backtick 名 / join 消耗行错位 / macro-template 形）= 0。
- src/ 全语料（--full）：5787/5802 回放成功（15 个失败件与 slabk1 回放器同集，
  均为预存畸形夹具，在树读取即失败、根本到不了行扫描，刀不可见）；
  baseline 81174 条 → 移除 11 条、保留 81163 条；新增 2 击为
  `src/tests/exec_diff_corpus/adv_samename_value_{global,local}.cheng` 的
  `fn Value` 声明头（夹具注释自证即为本族形）；残留 = 0。
- 增量账：被移除 append 逐条断言命中声明名位置集且 ident 与声明名逐字相同；
  恒等账：保留 append (line,col,ident,detail) 逐条恒等。

## 机械预检

`patch_preflight.py c1knife_parser.patch`：PASS（ann=0 displaced=0 wedged=0）。
叠基座探针：slabk1_parser.patch 先打 + 本刀后打 → 干净叠加，双补丁 preflight
PASS（本刀与 k1 站点零交叠）。

## 烤制（bake.sh；基座=b6213616d 含 slab k1 b3bb41ca 纯新增段机制, build_knife
重跑后 hunk 行号不变, preflight PASS, apply 探针干净）

- [x] 双臂驱动 kd_c1_a=7a1e8871 / kd_c1_b=d86f1bb3（受控克隆根, 单变量=刀;
      首轮 arm B 被 SIGTERM 外部终止(rc=143, 与 slabk1 线同晚两起同源), SKIP_A
      复用 arm A 重烤 B 成功）
- [x] 金丝雀 2/2 × 双臂（minmain + ordinary, compile_rc=0 run_rc=0）
- [x] c1 夹具红→绿（刀域口径）: A 臂判词复现（rc=2, `...kind=5 line=51
      surface=Ok` 逐字）; B 臂 c1 判词清除, 回执通过 result.cheng 全域, 前进至
      下一墙 system.cheng:1614 `executable call unresolved callee=
      RuntimeAllocationLedgerOperation`（enum 转换 call 解析域）。叠墙预存性
      三证: 回放账 system.cheng 零移除 / 单变量双臂唯一差=本刀 / 本基座 std
      闭包从未编到过该文件（result:51 恒先爆）。U 组 bin=yes 信号未达成,
      待下一墙刀（非 C1 域）
- [x] 四合同 std-free primary.o 双臂逐字节恒等（ordinary_zero_exit_fixture /
      call_fixture / cold_nested_fmt_interpolation_smoke / v6_direct1_repro
      [docs 路径按 battery.sh 先例 staging src/tests]）
- [x] Result 消费源闭包墙位前进账: assign_result_ctor_fixture A=c1 判词 →
      B=下一墙（"std-free 恒等 + 消费源闭包前进"构成本基座上零漂移证据的
      可达形态; 81163 条保留 append 恒等见回放账）
- 烤制总结: contract_summary.txt fail=0（patch sha cc9aaa67, stage3 sha 05af823e）
- 落库: b44d1d139（HEAD c03ad5470 之上, c03ad5470 为 docs-only 与刀零交）,
  push c03ad5470..b44d1d139 main

## 置信度

高：发射点→判词链路全源码直证（TRIO_VERDICT §五），先例同构（phaseB-enum），
回放增量账与残留账双清零，刀 45 净增行单域。行为证据单变量双臂：
红臂判词逐字复现 + B 臂 c1 判词清除前进下一墙（叠墙预存性三证）。
落库 b44d1d139。剩余开放项 = 下一墙 system.cheng:1614 enum 转换 call 解析
（独立刀域）与 U 组 bin=yes 信号（需该墙清后达成）。
