# Backend Source Line Rescan Removal（后端行重扫删除）

目标：后端只消费一种结构化事实源（typed facts / NormalizedExpr / BodyIR），删除 lowering/primary/CSG 三处对源码行的二次字符串扫描，使 parser 成为源码文本的唯一消费者。

状态：apply 中（用户已确认）。当前进度：lowering_plan 7 -> 2、primary 9 -> 7、compiler_csg 8 -> 5（在范围 6 -> 3）；剩余站点全部归类为 facts 生产者迁移 / RSS 权衡 / 门禁阻塞三类（见执行记录）。

## 问题

- 现状存在两条平行的语义获取路径：parser -> typed facts 的结构化路径，以及后端用 `ParserSplitChar(text, '\n')` / `ParserSplitChar(..., ',')` 把源码重新按行/逗号切开再猜语义的文本路径。
- 现场规模（以 `rg -c "ParserSplitChar"` 实跑为准，下列为本提案起草时快照）：
  - `src/core/backend/primary_object_plan.cheng`：9 处
  - `src/core/backend/lowering_plan.cheng`：7 处（含按 `,` 重切参数/调用实参文本）
  - `src/core/tooling/compiler_csg.cheng`：8 处
- 危害：同一语义有两个事实源，行扫描对字符串字面量/续行/注释的处理与 parser 永远存在漂移面；每次语法演进要改两处；与 formal-spec §0.0（该注记现已迁至 `docs/cheng-implementation-status.md` 实现对齐注记）已锁的"禁止把源码行字符串扫描当作新增 statement 支持的实现路径"方向冲突（存量即技术债）。

## 决议

- 后端（lowering_plan / primary_object_plan / compiler_csg）禁止读取源码行文本恢复语义事实；所需事实一律由 parser/typed 层一次性物化进结构化 facts（statement kind、param list、call args、import edge、line map）。
- `ParserSplitChar` 收口为 parser/前端内部工具；后端与 tooling 的 CSG 导出路径不得 import 该入口用于源码文本。
- 缺失的事实不得用行扫描补：先扩展 typed facts schema（含 line map side table），再删对应行扫描点。hard-fail 优先，禁止静默回退到文本路径。

## 分阶段执行（每阶段独立可验收）

1. 盘点：为 24 处调用点逐一登记"恢复的是什么事实"（行号映射 / 参数列表 / 调用实参 / import 边 / statement 边界），产出 facts 缺口清单。
2. 阶段 A `lowering_plan.cheng`（7 处）：参数/调用实参文本重切（`ParserSplitChar(paramsText, ',')` 类）改为消费 parser 已物化的参数/实参 facts。
3. 阶段 B `compiler_csg.cheng`（8 处）：CSG 导出所需的行信息改为消费 parser line map side table（复用 source context，见 lessons：勿重复建 ctx）。
4. 阶段 C `primary_object_plan.cheng`（9 处）：同上；该文件最大，放最后，借助前两阶段沉淀的 facts schema。
5. 收口门禁：新增静态检查（grep 级即可）锁 `src/core/backend/` 与 `src/core/tooling/compiler_csg.cheng` 中 `ParserSplitChar` 出现次数为 0，防回潮。

## 每阶段验收

- `tools/ci_gate.sh` 全绿（含 determinism / perf-witness / perf-theory-ratio）。
- `artifacts/bootstrap/cheng.stage3 run-production-regression` 不出现新失败。
- `tools/cold_csg_roundtrip_test.sh` 通过数不下降；`emit-cold-csg` facts 对同一输入 byte-identical。
- 编译耗时报告（`parse_emit_selection_us` 等字段)不得回归：行重扫删除应是零或负成本（消除重复 I/O 与重复扫描）。

## 禁止项

- 禁止以"先共存、逐步替换"为名长期保留双路径：每个阶段结束时该文件内对应类别的行扫描点必须清零。
- 禁止为绕过 facts 缺口在后端新增任何字符串启发式（含正则、子串匹配恢复语义）。
- 禁止借本提案顺带重构无关代码（surgical changes）。

## 盘点（阶段 1 交付，2026-06-10 实核）

### compiler_csg.cheng（8 站点 -> 在范围 6）

| 站点 | 函数 | 恢复的事实 | 分类 |
|---|---|---|---|
| 1434 | `CompilerCsgReadTypedIrExprLayerFromText` | 单源文本 -> NormalizedExprLayer 的逐行摄入（含多行字符串归一） | parser 摄入逻辑住错层；需 parser 暴露整文本入口（schema 扩展类） |
| 2301 | `CompilerCsgCollectReachabilityEdgesForProfile` | `profile.lines` 行号->源码行重建（可达边扫描用） | 回退（lines 被故意清空后重切）；走 lineStarts 偏移表设计（见下文设计稿；借用 ctx.lines 已证伪：该字段被刻意清空，保留实验峰值 >20GiB） |
| 3250 | `CompilerCsgExpandSourceClosureImports` | 按行扫 import 边扩展源码闭包 | 与 lowering 已删站点同类；应只吃 `importEdges` 图（schema 接线） |
| 4101 | `CompilerLegacyNormalizeText` | 旧语法迁移重写（proc/method/converter -> fn） | **范围外**：CompilerLegacy 迁移工具的本职文本变换（migration smokes 覆盖，活代码） |
| 4125 | `CompilerLegacyPackageId` | 模块路径按 '/' 切分 | **范围外**：路径字符串处理，非源码行重扫 |
| 4998 | `BuildCompilerCsgBorrowedWithOverridesInto` | profile.lines 为空时惰性重建（decl importc mask 修复用） | 防御性回退；`ParserBuildExprCallProfile` 已填 lines，确认 invariant 后删 |
| 5184 | `BuildCompilerCsgBorrowedWithOverridesInto` | 同 2301（expr layer 构建前恢复 lines） | 同 2301 |
| 6225 | `CompilerColdCsgAppendFunctionRowsForSourceText` | 行扫描重导 function decls 过滤 typedIr.functions | 真双重事实源：改纯 `typedIr.functions` 校验（cold 导出收口） |

### primary_object_plan.cheng（9 站点，全部 BodyIR 构建路径；替代源经子代理逐站核实）

| 站点 | 恢复的事实 | 主/回退 | 替代事实源 |
|---|---|---|---|
| 742 | 函数体 binding 发现（签名行之后逐行扫） | 回退 | 有：`TypedExprIrLookupLocalBindingType`、`TypedExprIrStatement.resultType` |
| 1422 | const 块 -> i32 常量值缓存 | 主路径 | **无**：`globalNames/globalTypes` 缺 i32 值表，需扩 `globalConstValues` 类 facts |
| 2642 | `import x as y` 别名 -> 目标路径 | 主路径 | 有：`TypedExprIrLookupTypeAliasTargetSourcePath` |
| 2664 | 枚举声明存在性（type 块扫描） | 主路径 | 有：`TypedExprIrTypeIsEnum` |
| 2721 | 枚举成员表预缓存（type 块扫描） | 主路径 | 有：同 2664 + `enumValue*` |
| 2935 | 结构体字段布局（offset/size/align） | 回退 | 有：`TypedExprIrLookupTypeLayout`、`typeLayout*/typeField*` |
| 3268 | 单字段 meta（offset/size/align） | 回退 | 有：`TypedExprIrLookupSingleFieldMeta`/`TypedExprIrLookupFieldPathMeta` |
| 5927 | decl header 参数类型补扫（typed 种子后） | 回退 | 有：`PrimaryObjectIrFunction.paramNames/paramTypes`、ParamRef 节点 |
| 12304 | 跨模块 callee 返回类型（扫 import 源 fn 行） | 回退 | 有：`typedIr.functions[].returnType` |

缺口归并（修正版）：

- **typed 已覆盖、删回退即可**（A2 同款手法：删文本回退/hard-fail，用回归暴露覆盖洞）：742、2935、3268、5927、12304，以及主路径但 typed API 已在的 2642、2664、2721。
- **需扩 facts schema 才能删**：1422（const i32 值表）、1434（`NormalizedExprLayer` 整文本摄入应由 parser 暴露入口）、3250（import 闭包只吃 `importEdges` 图）、6225（cold 导出去 decl 文本扫、纯 `typedIr.functions` 校验）。
- **line map 缓存类**（不重读源码、改为结构化行索引）：2301、5184（`profile.lines` 被故意清空后重切，走 lineStarts 偏移表设计，见设计稿）、4998（`ParserBuildExprCallProfile` 已填 `profile.lines`，防御分支需先确认 invariant 再删）。
- **decl 参数全覆盖**（lowering 剩余 891/905 同类）：typed 未收录函数的参数事实。

schema 扩展类涉及 `typed_expr.cheng`/`parser.cheng`（前者当前被并发会话持有，本轮不动）；"删回退"类不需要动 typed 层，是阶段 B/C 的首批执行对象。

## 执行记录

### 阶段 A：lowering_plan.cheng（2026-06-10，7 -> 2 站点）

已删除/替换的行重扫：

1. importc 符号文本扫描（原 1215/1235 两站点）：`LoweringFindImportcTargetSymbol` + 包装 `LoweringImportcTargetSymbol` + 助手 `LoweringAnnotationQuotedValue` 整体删除。全仓零调用方（死代码）；活路径早已走 `TypedExprIrLookupImportcTargetSymbol`（typed facts）。
2. import 闭包文本扩展（原 321 站点）：`LoweringExpandSourceClosureImports` + `LoweringImportModuleNameFromLine` 整体删除。结构化事实源（`sourceSnapshot.sourceClosurePaths` + `sourceSnapshot.importEdges`）已是主路径；文本扩展只是 typed 闭包为空时的静默回退，违反"禁止静默回退"决议。删除后闭包缺失会由下游 reachable-body-missing 硬失败暴露。
3. 调用实参直通匹配的 decl 行扫描（原 1111/1114）：`LoweringReturnCallArgsPassThrough` 改签名直接消费 `fnIr.paramNames`（typed 参数事实），不再按函数名扫源码行找声明；孤儿化的 `LoweringFunctionParamNamesFromDeclLine`（含 `ParserSplitChar(paramsText, ',')` 站点）删除。
4. 实参逗号平切（原 1043 站点）：`LoweringCallArgNames` 改用已有的括号深度感知 `TypedExprSplitTopLevelCsv`，对纯 ident 实参观测等价、对嵌套调用实参不再误切。
5. typed 分支参数 gap-fill（原 1830 调用）删除：回归证明 typed 参数事实完整，decl 行扫描补填是无效安全网。

剩余 2 站点（facts 缺口，待阶段 A'）：

- `LoweringFunctionDeclLine` / `LoweringFunctionDeclHeaderText`（现 891/905）：唯一消费方是 `LoweringFillPrimaryObjectIrParamsFromDecl` 的 `typedFnIndex < 0` 分支——函数不在 typed IR 里时参数名/类型没有结构化事实源。缺口定义：parser/typed 层需为 plan 内全部函数（含未进 typed IR 的）物化 decl 参数事实，之后该分支改为消费事实并删除行扫描。本轮未动 `typed_expr.cheng`（另一会话并发持有该文件）。

### 阶段 B/C 首批（2026-06-10，primary 9 -> 7、compiler_csg 8 -> 5）

每步独立过 `ci_gate`（9/10，恒定例外见下）+ `run-production-regression`（恒 1346/1348）：

1. primary 12304：跨模块 callee 返回类型的 import 源 fn 行扫描回退删除，只留 `typedIr.functions[].returnType` 查找；type 仍 unknown 时走既有保守推断。
2. primary 5927：`PrimaryBodyIrSeedParamSlots` 第三级（decl header 重读重切）删除；第一级（lowering typed 参数）+ 第二级（ParamRef 节点）已覆盖（阶段 A3 回归证据）。
3. compiler_csg 4998：`profile.lines` 空时的防御性重切删除。invariant 已核实：`ParserBuildExprCallProfileWithExternalPackageRoots` 成功必填 `profile.lines`（parser.cheng:5428）；且该回退切的是未归一化原文，真触发反而行号错位——属于"错误的兜底"。
4. compiler_csg 3250：闭包扩展改调 `ParserReadImportEdgesWithExternalPackageRoots`（parser 整文本入口，内含多行字符串归一化），行切分收口进 parser；顺带修复了原实现跳过多行字符串归一化的漂移面。
5. compiler_csg 1434：简单表层 expr 摄入循环原样搬入 parser 新 API `ParserReadSimpleSurfaceStmtExprLayerFromText`，csg 侧只留 typedIr 剪枝；行为逐行等价（同一组 ParserAppend* 调用）。

### 剩余站点处置判定（重要修正）

- **primary 布局簇（2935/3268 + 支撑件 2642/2664/2721/742/1422）不可按"删回退"处理**：实读代码发现 `PrimaryBodyIrSourceObjectLayoutAtDepth` 扫描结果会回写 `TypedExprIrAppendTypeFieldLayout`——文本扫描是 typed 布局事实的**生产者**而非冗余消费者；盘点表中"替代源：TypedExprIrLookupTypeLayout"实为该扫描填充的缓存。删除的失败模式是静默布局损坏（错误 size/align 进生成代码），不是响亮失败。必须先在 typed 层物化 type/enum/const/binding facts（待 `typed_expr.cheng` 并发占用解除），再整簇删除。
- compiler_csg 2301/5184：`profile.lines` 构建后被刻意清空省内存（编译器自编译 RSS 已达守卫边界），按需重切归一化文本是显式的内存换重算；删除走 lineStarts 偏移表设计（见设计稿；借用 `TypedExprSourceContext.lines` 已证伪——metadata/facts 路径刻意清空该字段，整体保留 lines 的实验峰值 >20GiB）。
- compiler_csg 6225（cold 导出 decl 过滤）：无法在本轮验证——emit-cold-csg 不在 ci_gate/回归的新驱动路径上，主门禁 `cold_csg_roundtrip_test.sh` 被并发的 `cheng_cold.c` 修改阻塞；待解除后执行。
- compiler_csg 4101/4125：范围外（迁移工具文本变换 / 路径切分），维持现状。

### 设计稿：profile.lines 结构化行表（针对延期站点 compiler_csg 2281/5159）

现状：`CompilerCsgSourceProfile.lines` 为降 RSS 被提前丢弃，构建 expr layer 时在 2281/5159 重新「读文件 + 多行串重写 + ParserSplitChar」再水化。双重代价：`[]string` 行数组对底层文本完整复制一份（每行独立 string 头+载荷），且每次再水化重付 IO+重写+切分。

目标形态（理论最优）：每模块保留一份规范化文本 + SoA 偏移表。

- 结构：profile 增加 `lineStarts: []int32`（行首偏移，末尾哨兵 = 文本长度），保留 `normalizedText: string`，删除 `lines` 字段。
- 访问：`ProfileLineAt(profile, i)` 按需 substring（瞬时分配单行）；热循环用 `ProfileLineSpanAt` 返回 (start, end) 偏移由调用方一次性切片，避免逐行分配。
- RSS 估算：文本驻留 1×源码大小 + 4B/行，对比现状「再水化窗口内 2×文本 + 每行 string 头开销」；再水化逻辑整体消失，2281/5159 直接删除。
- 迁移步骤：①builder 规范化时顺手填 lineStarts；②加访问器、机械迁移 `profile.lines[i]` 消费方；③删 lines 字段与两处再水化；④以构建报告已有的 `*RssBytes` 标记做不增长断言。
- 风险：需先审计是否存在对 lines 的写入方（有则该消费点单独处理）；逐行 substring 在热路径的分配压力用 span 访问器规避。

### 设计稿：moveHint 等价性证据管线（关联提案 ownership-movehint-optimization-semantics）

详见该提案内同名章节；与本提案的交点：等价性 A/B 门禁复用本提案的「新旧驱动 obj byte-compare」方法学。

### 验证口径说明（重要）

`ci_gate` 与 `run-production-regression` 的编译全部由预编译 stage3 的 cold 路径执行，对本提案改动只构成**编译级**验证（改动后的源码能被 cold 正确编译进新驱动）与 cold 管线无回归证据，不构成改动代码的**行为级**验证。行为级证据另行补齐：

- 用本提案改动后源码构建的驱动与 HEAD 源码构建的驱动，分别对 `ordinary_zero_exit_fixture`、`dwarf_debug_line_smoke` 执行 `system-link-exec --emit:obj`（该路径完整执行 lowering_plan 闭包展开/参数填充、compiler_csg profile/闭包/expr layer、primary 参数种子/返回类型查找），两组产物 **byte-identical**（271B / 316B）。
- 驱动 `--emit:exe` 的 provider 子编译路径在 HEAD 与改动后均以相同签名失败（provider_compile_exit_code=127，递归子进程问题，存量缺陷），与本提案无关。

验收快照：

- `tools/ci_gate.sh`：9/10 PASS；唯一失败 perf-theory-ratio 归因于并发会话对 `src/core/lang/typed_expr.cheng` 的未完成修改（`TypedExprFactsValidateCallResolutionRange` reachable body missing），用 HEAD 版 lowering_plan 复现同样失败，证明与本提案改动无关。
- `run-production-regression`：每步改动后均为 1346/1348，失败项恒为 provider_multi_missing_xopt_csg / provider_multi_primary_xopt_csg（已知存量）。
- `tools/cold_csg_roundtrip_test.sh`：本轮无法执行——该脚本会从 `bootstrap/cheng_cold.c` 重建 cold 编译器，而该 C 文件正被并发会话修改且当前缺 `<stdarg.h>` 导致 C 编译失败（va_start/va_end 隐式声明错误），与本提案改动无关；待并发修改收口后补跑。
