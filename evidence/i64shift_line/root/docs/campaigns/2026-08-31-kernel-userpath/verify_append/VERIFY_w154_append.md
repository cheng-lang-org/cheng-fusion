# VERIFY wall154（kernel_driver_w2 战役 wall154 线 · 自举阶梯第二墙续线）

锚点=73debaef2。树上多线在途 hunks 原样保留（parser.cheng 内 ZRPC gate、conversion prefix、wall152 ExtendIndentedValueRange 等并行/在途 hunks 均未触碰），本墙改动=src/core/lang/parser.cheng（authority 判重链化+诊断列，14 hunks）+ src/core/tooling/compiler_csg.cheng（权威森林链补填源路径诊断列，1 hunk）。patch=/tmp/oob_ab/wall154.patch（15 hunks，git apply --reverse --check PASS；由 /tmp/oob_ab/w154/gen_patch.py 从 git diff 按 hunk 过滤生成，只含本墙 hunks）。

## 任务 1：normalized-read 判词无文件名（定位盲点）——已补

- 根因：authority invalid 判词走 `ParserValueExprTreeAppendFromImpl` 的 seal 校验 panic 路径（parser.cheng 11687 原 行 `parser forwarding production: invalid appended forest: {structuralErr}`），不经过 compiler_csg 的 `normalized decl read failed: {sourcePath}` err 包装，故无文件名。
- 修补：`ParserValueExprTree` 新增诊断列 `producerSourcePaths: str[]`（producer index→源路径，仅 fail 路径诊断显示，不参与任何校验）：
  1. 单源补填：`CompilerCsgBuildParserForestAuthorityInto`（normalized-read 权威森林链）逐源建树后 `producerSourcePaths=[sourcePaths[sourceIndex]]`——权威森林的 producer 索引与 sourcePaths 循环序严格同序。
  2. append 拼接：`ParserValueExprTreeAppendFromImpl` 按 sourceOffset 顺序拼接，未补填源以空串占位（列长不变式；CloneStr 显式 share）。
  3. 判词注入：authority invalid 判词追加 ` source={path}`（越界/未填显示 unknown，fail 路径零频先例同 w126 phase 打标）。
- 本墙烤机即实证：D2 判词（见台账 #4）已带 `source=/Users/lbcheng/cheng-lang/src/core/backend/elf_riscv64_writer.cheng`。

## 任务 2：authority invalid 墙形定性（kind=5 arm=19）

判词（wall152 轮 6）：`authority invalid row=72831 kind=5 arm=19 auth_kind=6 auth_row=13619 expected_auth=6 owner=72830 span=3351:3879 source_local=79 producer=31`。

- kind=5=StatementCore、arm=19=fn 语句、auth_kind=6=ChildDeclaration、expected_auth=6 匹配 → 失败点在 `parserForwardingProductionAuthorityTargetValid` 的 ChildDeclaration 分支三重判定的第三重：同 span 同 kind 判重 `exactDeclarationCount == 1`。
- **缺口机制（span 判重 key 无源维度）**：
  1. span（forwarding production 与 declaration 均同）是**源内字节偏移**，forest append 时原样拷贝不加 offset（token index 才加 tokenOffset）——这是设计（"sourceLocalDeclarationRow is stable across forest append"）。
  2. normalized-read 权威森林把 31 个源 append 进同一棵树后，判重 map `declarationFunctionCounts` 的 key 仍只是 `(spanStart, spanEnd)`。
  3. 跨源同 span 属正常形态：`elf_riscv64_writer.cheng` 的 `fn elfWriteSym` 与 `debug_relocatable_object_evidence.cheng` 的 `fn debugObjectCStringValid` 在各自文件内**起点同为 3351、span 同为 528 字节（3351:3879）**（本线 python 实测复核 wall152 台账的扫描结论）→ 合并树上 `declarationFunctionCounts[(3351,3879)]=2 ≠ 1` → 行序在前的那个 fn production（row=72831）authority invalid，fail-closed panic。
- C 链对照全通行的原因：cold_parser 逐文件独立建 profile，单文件内同 span 声明天然唯一；该缺口为 .cheng parser normalized-read 合并上下文专属（自举线从未到达的领地）。
- spec 裁决：authority 契约的本意是「authority row 是**该源内**该 span 该 kind 的唯一声明」（防同源双声明互相冒充），跨源同 span 不构成歧义。**裁决：合法形，修 .cheng parser 侧判重契约**。

## 修补（契约对齐，fail-closed）

`ParserValueExprTreeForwardingProductionsStrictValidateInto` + `parserForwardingProductionAuthorityTargetValid`：

1. **判重链化**：三个 span-keyed 域（declaration 5 kind / lexicalScopeBlock / patternOwnerRegion）的判重 map value 语义从「计数」改为「同 spanKey 链首 row+1」，配平行链数组 `declarationNextInSpan`/`lexicalScopeNextInSpan`/`patternNextInSpan`（-1 终止，每行恰属一条链）。
2. **同源硬臂**：ChildDeclaration/ChildLexicalScope/ChildPattern 三分支新增 `authority 行 producer == forwarding production producer` 检查（span 是源内偏移，跨源同 span 的声明不得充当 authority；原实现无此臂，多源树上本可被跨源冒充）。
3. **唯一性收窄为同源唯一**：沿链按 `producerSourceIndexes` 计数（声明/lexicalScope/pattern 三域各一个计数 helper），`==1` 判定；计数越界提前返回。bindingDeclaration 的 pattern 臂中 declaration 存在性（>0）判定同步链化（原实现跨源同 span 会误真，属 fail-open 方向，一并修复）。
4. **不受影响域**：statementRootRoleCounts 的 key=(role, anchorToken)，anchorToken 在 append 时已 rebase 进合并空间，天然全树唯一，无需 producer 维度（复核记录在注释）。
- 单源树语义等价性：单源树 producer 恒同，「同源唯一」≡「全树唯一」，链上计数与旧 count 完全一致——C 链单编路径与四夹具行为零变化。
- fail-closed：同源真重复仍 count=2→false；链空/断链（内部不一致）由 ==1 判定自然拒绝。

## 烤机纪律（每轮启动前）

每轮烤机前 `cheng_tree_quiesce_probe src/core quietMinutes=10` 必须安静（静默窗内并行线 elf_riscv64_linker.cheng 编辑曾两次推迟开烤）。配方=head 三件套 `bash /tmp/oob_ab/w139/build_kernel_driver_w139.sh --manifest kernel_manifest_head_git.cheng --out <out> --driver <driver>`，env `CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w154/cold_cache CHENG_ENTRY_CACHE=0 CHENG_PROCESS_MAX_RSS_BYTES=12884901888`，nohup 受控分离（pid 落盘）。

## 事件：/tmp/oob_ab/w152/ 被外部清理（fp_D1r2 丢失）

wall152 产物 fp_D1r2（D1' 参照驱动）、cold_cache、round6.log 随 w152/w153 子目录在本次任务执行期间被外部清理（/tmp 清理，非本线操作）。阶梯恢复：按 wall152 轮 2 配方用 **cheng_w126（C 链车头，幸存）重烤 D1''**，再以 D1'' 当车头滚 D2''——与 wall152 阶梯语义一致。GEN2 判定相应改为 sha(D1'') vs sha(D2'')。

## 阶梯台账

| # | 车头 | 目标 | 启动时刻 | 结果 |
|---|---|---|---|---|
| 1 | cheng_w126 | d1(D1'') | try1 | FAIL rc=2（5min）：冷链 `unknown identifier 'producerSourceIndex' fn=parserForwardingProductionAuthorityTargetValid`——本线 bug：AuthorityTargetValid 函数体新增引用但签名漏传参；已补 `producerSourceIndex: int32` 形参 |
| 2 | cheng_w126 | d1(D1'') | try2 | FAIL rc=2（5min）：parser.cheng 已过，推进到 csg——`add(value) borrowed source requires explicit share`（producerSourcePath 补填处 borrowed str 直接入 seq）；已改 `strings.CloneStr`，判词注入处同形预防 |
| 3 | cheng_w126 | d1(D1'') | try3 | FAIL rc=2（5min）：`native sequence mutation local predecessor is not exact fn=CompilerCsgBuildParserForestAuthorityInto`——本地 `var str[]=[]`+add 触发冷链本地 seq 精确前继检查；改为对新树字段直接 add（AppendFromImpl 同形已通过） |
| 4 | cheng_w126 | d1(D1'') | try4 18:41 前后 | **烤成**。`kernel_driver_build=ok entries=35`，compile_real_cpu_ms=261893（CPU ~262s，墙钟 ~5.5min），sha256=**31a3dc23**cfb77c33aa2364f976726f2ddbba92d636a7a2440ed7dfb114fbaceb（≠wall152 fp_D1r2 的 462d114e…，树含 wall154+并行在途改动，预期） |

- D1'' 烤成本身即全闭包 35 条目归一化读对本墙判重链化的验证：权威森林建树若被链化改动破坏，此处即挂。

## 四夹具门禁 × D1''（含本墙改动的驱动，修复零回归实证）

| 夹具 | compile | run | 预期 | 判定 |
|---|---|---|---|---|
| ordinary_zero_exit_fixture | 0 | 0 | 0/0 | PASS |
| call_fixture | 0 | 1 | 0/1 契约 | PASS |
| cold_nested_fmt_interpolation_smoke | 0 | 0 | 0/0 + 输出 `cold_nested_fmt_interpolation=pass` | PASS |
| zz_v6_w7 | 0 | 0 | 0/0 | PASS |

log=/tmp/oob_ab/w154/gate_*.log / gate_*.run.log（脚本 /tmp/oob_ab/w154/w154_gate.sh）。

## D2'' 滚动台账（车头=D1'' sha=31a3dc23…）

| 启动 | 时刻 | 结果 |
|---|---|---|
| #1/4 | 2026-09-05 18:46:58 | （进行中，见下） |

