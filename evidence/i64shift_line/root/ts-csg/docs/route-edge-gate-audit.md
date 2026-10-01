# route_edge 控制流闸 — csg-core.ts 发射分支穷举审计表

对象：`ts-csg/src/csg-web-materializer.ts` 的
`functionBodyIsUnconditionalSyncControlFlow(functionOps)`（下称"闸"）。它扁平扫描一个函数体
在 `ts-csg/src/csg-core.ts` 的 `emitStatement`/`emitExpression` 递归发射出的全部 `csg.op` 事实，
判定该函数体是否为"纯同步无条件直线代码"；只有闸判定为真时，`functionBodyInvokesCloseProp`
才会把函数体里对 close/back prop（`onClose`/`onBack`）的调用登记为 `route_edge`
（`csg-web-materializer.ts:8663 emitSceneRouteEdgeFact`）。

闸的世代：
- v2（`104c0cafb`）：`await`/`branch_if`/`try`/`while`/`for_count`/`for_of`/`for_in` + `&&`/`||`/`??`
  短路二元 + 三元表达式。
- v3（`20f999a71`）：可选链调用 `optionalCall`（`node.questionDotToken` 直接在调用节点上，
  如 `onClose?.()`/`a.b?.()`）。
- v4（本轮）：ES2021 逻辑赋值 `&&=`/`||=`/`??=`，无论 LHS 是裸变量（`assign`）、属性
  （`property_write`）还是下标（`element_write`）。

下表逐一穷举 `emitStatement`（源码行号约 1838-1961）与 `emitExpression`（约 1963-2280）
的每一个发射分支，标注它是否可能把一个"只在条件下才执行的调用"静态摊平成看起来无条件的
op 流、闸现状如何、以及本轮定谳结论。"已闸覆盖"指闸已经能正确判定为非平凡（返回 false）；
"非洞"指该分支的语义决定了它承载的调用（如果有）在到达该 op 时总是无条件执行，闸不需要也不
应该排除它；"非本类洞（漏边）"指该分支根本不会把调用递归进 op 流（不是把条件调用误判成
无条件，而是压根不可见），因此不可能被 `functionBodyInvokesCloseProp` 命中产生伪边——这是另
一类问题（漏检不是误报），与本闸的伪造边职责正交，本轮不动。

## emitStatement 分支

| # | 语句形态 | op 发射 | 调用是否可能被摊平成"看似无条件" | 闸现状 | 定谳 |
|---|---|---|---|---|---|
| S1 | `VariableStatement` | `var_statement` + 每个声明 `local_write`（初始化式经 `emitExpression`）或 `binding_extract`（解构） | 否——声明语句执行时初始化式必然求值 | 不适用 | 非洞 |
| S1a | 解构默认值 `const {x = onClose()} = o` | `binding_extract.defaultInitializer` 是 `getText()` 原始文本，**不经过 `emitExpression`** | 调用完全不进 op 流 | 不适用 | 非本类洞（漏边，不可能伪造边）；架构边界记录，非本轮范围 |
| S2 | `FunctionDeclaration`（带体） | `function_decl`，函数体经 `emitFunction` 独立成新函数 | 否——嵌套函数体不在外层函数的 op 流里"执行" | 不适用 | 非洞 |
| S3 | `ExpressionStatement` | 纯透传进 `emitExpression(node.expression)`，自身无 op | 由被穿透表达式决定 | 见 emitExpression 表 | 透传 |
| S4 | `ReturnStatement` | `return{value}`，value 先经 `emitExpression` | 否——return 语句执行时 value 必然先求值 | 不适用 | 非洞 |
| S5 | `IfStatement` | `branch_if{condition,thenBlock,elseBlock}` | 是（then/else 分支条件执行） | **已闸覆盖**（v2） | 定谳 |
| S6 | `WhileStatement` | `while{conditionBlock,bodyBlock,condition}` | 是（循环体条件执行） | **已闸覆盖**（v2） | 定谳 |
| S7a | `ForStatement`（规范计数形）匹配 `forCountLoopParts` | `for_count{...}` | 是 | **已闸覆盖**（v2） | 定谳 |
| S7b | `ForStatement`（非规范形，不匹配） | 兜底 `statement{statementKind:"ForStatement"}`，**不递归循环体** | 调用完全不进 op 流 | 不适用 | 非本类洞（漏边）；架构边界记录 |
| S8 | `ForOfStatement`/`ForInStatement` | `for_of`/`for_in{...}` | 是 | **已闸覆盖**（v2） | 定谳 |
| S9 | `Block` | `block{nestedBlock}`，内部语句递归进新 blockId，但落入**同一函数**的扁平 `functionOps`（`opsByFunction` 按函数非按块分组） | 否——花括号本身不引入条件性 | 不适用 | 透传，非洞（内部 op 各自单独审计） |
| S10 | `TryStatement` | `try{tryBlock,catchBlock,finallyBlock}` | 是（catch/finally 条件执行） | **已闸覆盖**（v2） | 定谳 |
| S11 | `ThrowStatement` | `throw{value}`，value 先经 `emitExpression` | 否——throw 语句执行时 value 必然先求值 | 不适用 | 非洞 |
| S12a | `SwitchStatement` | 兜底 `statement{statementKind}`，不递归 case 体 | 调用完全不进 op 流；且 `switch` 已被 `inspectUnsupported`（csg-core.ts:2570）标记 `addUnsupported`，上游拦截，函数根本编不进物化产物 | 不适用 | 非本类洞（上游 unsupported 拦截，闸不可达） |
| S12b | `DoStatement`（do/while） | 无专属分支，落兜底 `statement{statementKind}`，**不递归循环体**（无 `ts.isDoStatement` 分支存在） | 调用完全不进 op 流 | 不适用 | 非本类洞（漏边）；架构边界记录 |
| S12c | `LabeledStatement` | 兜底 `statement{statementKind}`，不递归 `node.statement` | 调用完全不进 op 流 | 不适用 | 非本类洞（漏边），React 处理函数体内罕见 |
| S12d | `BreakStatement`/`ContinueStatement`/`EmptyStatement`/`DebuggerStatement` | 兜底 `statement{statementKind}` | 无子表达式，不可能承载调用 | 不适用 | 非洞 |

## emitExpression 分支

| # | 表达式形态 | op 发射 | 调用是否可能被摊平成"看似无条件" | 闸现状 | 定谳 |
|---|---|---|---|---|---|
| E1 | `ParenthesizedExpression` | 透明拆包，无自身 op | 由内部表达式决定 | 见对应条目 | 透传 |
| E2 | `SpreadElement` | `spread{value}` | 否——展开到达时其操作数必然求值 | 不适用 | 非洞 |
| E3 | 数字/字符串/无替换模板字面量 | `literal{}` | 无调用承载可能 | 不适用 | 非洞 |
| E4 | `true`/`false`/`null` | `literal{}` | 无调用承载可能 | 不适用 | 非洞 |
| E5 | `Identifier` | `identifier{name,typeText}` | 无调用承载可能 | 不适用 | 非洞 |
| E6a | `CallExpression`，`optionalCall===true`（`?.` 直接在本调用节点，如 `onClose?.()`/`a.b?.()`） | `call{...,optionalCall:true}` | 是——调用可能被跳过 | **已闸覆盖**（v3） | 定谳 |
| E6b | `CallExpression`，`optionalCall===false` 但 `ts.isOptionalChain(node)===true`（`?.` 在链更早处，如 `a?.onClose()`/`a?.b.onClose()`） | `call{...,optionalCall:false}`——csg-core.ts 只镜像 `node.questionDotToken`，不镜像 `ts.isOptionalChain` | 语义上是——整条链可能因更早的 `?.` 短路而从未调用 | **未覆盖**（`optionalCall` 字段本身就未采集这一信息） | **已知边界洞，非本轮可利用面**：`functionBodyInvokesCloseProp` 用 `op.callee === propName` 严格字符串相等匹配；member 形态 callee 恒为带前缀全文本（如 `"a?.onClose"`），不会等于裸 `propName`（如 `"onClose"`）；裸标识符 callee 不存在"链更早处带 `?.` 但自身 questionDotToken 为 false"的情形（裸标识符前面没有更早的 accessor）。故对本闸唯一消费者不可利用，记录不修；若未来出现按 `memberName` 匹配的消费者需重新评估 |
| E7 | `NewExpression` | `new{constructor,arguments}` | 否——`new` 表达式到达时参数必然求值 | 不适用 | 非洞 |
| E8 | `JsxElement`/`JsxSelfClosingElement`/`JsxFragment` | `jsx{tagName,props,children}`（`emitJsx` 独立走查） | 域外——JSX 子树条件渲染由场景图 `conditionalChain`/`stateConditional` 机制单独追踪（`unimaker-one-click.mjs sceneNodeConditionalChain`），不是本闸的职责（本闸只扫描函数体自身 op 流） | 不适用（不同闸） | 非本类洞 |
| E9a-i | `BinaryExpression`，赋值算子，LHS 为 `PropertyAccessExpression` | `property_write{operator,receiver,name,value}` | 见 E9-operator 细分 | 见下 | 见下 |
| E9a-ii | 同上，LHS 为 `ElementAccessExpression` | `element_write{operator,receiver,argument,value}` | 同上 | 同上 | 同上 |
| E9a-iii | 同上，LHS 为裸标识符等 | `assign{operator,left,right}` | 同上 | 同上 | 同上 |
| E9a-普通 | operator ∈ {`=`,`+=`,`-=`,`*=`,`/=`,`%=`,`**=`,`&=`,`\|=`,`^=`,`<<=`,`>>=`,`>>>=`} | 同上三种 opKind | 否——RHS 无短路语义，赋值执行时必然求值 | 不适用 | 非洞，**不应排除**（防过杀边界；`control:plain_equals` 三形态已验证不受影响） |
| E9a-逻辑 | operator ∈ {`&&=`(`AmpersandAmpersandEqualsToken`),`\|\|=`(`BarBarEqualsToken`),`??=`(`QuestionQuestionEqualsToken`)} | 同上三种 opKind | **是**——RHS 只在 LHS 当前值满足短路条件时才求值 | **本轮前未覆盖**（三种 opKind 此前完全不在闸的判断范围内，无论 operator 是什么） | **洞，v4 已修复**：3 opKind × 3 operator = 9 组合，真编译器合成反例双态对拍矩阵全部验证（见 matrixProof） |
| E9b | `BinaryExpression`，非赋值算子；右操作数**总是**先被 `emitExpression` 静态发射（不因运行时短路而省略 op） | `binary{operator,left,right}` | 见细分 | 见下 | 见下 |
| E9b-短路 | operator ∈ {`&&`,`\|\|`,`??`} | `binary{operator:"AmpersandAmpersandToken"\|"BarBarToken"\|"QuestionQuestionToken"}` | 是 | **已闸覆盖**（v2） | 定谳 |
| E9b-逗号 | operator = `,`（`CommaToken`） | `binary{operator:"CommaToken"}` | 否——逗号表达式两操作数都无条件求值（只是求值顺序+丢弃左值，非短路） | 不适用（不需要，也不在闸的排除列表里） | **非洞，先例已定谳**（v2 `104c0cafb` 提交说明已注明；本轮复核照录不重开） |
| E9b-其余 | `+ - * / % ** < > <= >= == === != !== & \| ^ << >> >>> instanceof in` 等 | `binary{operator:...}` | 否——两操作数均无条件求值 | 不适用 | 非洞 |
| E10 | `PrefixUnaryExpression`/`PostfixUnaryExpression` | `unary{operator,operand}` | 否——操作数到达时必然求值 | 不适用 | 非洞 |
| E11 | `PropertyAccessExpression`（含 `a?.b` 可选属性读取，`questionDotToken` 未镜像进 op） | `property_read{receiver,name,...}` | 否，对"跳过调用"审计而言——`property_read` 本身不承载调用；若读到的值被当函数调用，属于 E6 的关注范围 | 不适用 | 非洞 |
| E12 | `ElementAccessExpression` | `element_read{receiver,argument,...}` | 同 E11 | 不适用 | 非洞 |
| E13 | `AwaitExpression` | `await{value}` | 是（异步挂起点） | **已闸覆盖**（v2） | 定谳 |
| E14 | `ObjectLiteralExpression`（含 spread/property/shorthand） | `object_literal{...}` | 否——每个属性值构造时都无条件求值，无短路语义 | 不适用 | 非洞 |
| E15 | `ArrayLiteralExpression` | `array_literal{...}` | 否——每个元素都无条件求值 | 不适用 | 非洞 |
| E16 | `ArrowFunction`/`FunctionExpression` | `function_value{functionKind,targetFunction}` | 否——这是值构造（定义一个新函数），子函数体不在当前函数的 op 流里"执行"，其自身条件性在它被调用时独立审计 | 不适用 | 非洞 |
| E17 | `TemplateExpression` | `template{parts,spanOpIds}` | 否——每个插值 span 都无条件求值 | 不适用 | 非洞 |
| E18 | `TypeOfExpression` | `expression{expressionKind:"TypeOfExpression",operand}` | 否——操作数无条件求值 | 不适用 | 非洞 |
| E19 | `ConditionalExpression`（三元 `?:`） | `expression{expressionKind:"ConditionalExpression",condition,whenTrue,whenFalse}`（两分支都静态发射，运行时只走一支） | 是 | **已闸覆盖**（v2） | 定谳 |
| E20 | `AsExpression`（`as` 类型断言） | `expression{expressionKind:"AsExpression",value}` | 否——类型断言只是编译期标注 | 不适用 | 非洞 |
| E21 | `NonNullExpression`（`!`） | `expression{expressionKind:"NonNullExpression",value}` | 否 | 不适用 | 非洞 |
| E22 | `VoidExpression`（`void`） | `expression{expressionKind:"VoidExpression",operand}` | 否——`void` 只丢弃结果，不影响是否求值 | 不适用 | 非洞 |
| E23 | 兜底 catch-all：`DeleteExpression`/`TaggedTemplateExpression`/`SatisfiesExpression`/`YieldExpression`/`MetaProperty` 等任何未被上面枚举捕获的表达式 | `expression{expressionKind:syntaxKindName(node.kind)}`，**不递归操作数** | 调用完全不进 op 流（若操作数里藏了调用） | 不适用 | 非本类洞（漏边）；若未来任一分支被扩展为递归求值操作数，需重新审计其条件性 |

## 结论

穷举覆盖 `emitStatement` 全部 12 个分支族与 `emitExpression` 全部 23 个分支族（含算子/子字段细分）。
唯一定性为"洞"且本轮修复的：E9a-逻辑（`assign`/`property_write`/`element_write` 三 opKind ×
`&&=`/`\|\|=`/`??=` 三 logical-assignment operator = 9 种组合）。E6b（可选链的非直接
`?.` 情形）是已知但对当前唯一消费者不可利用的边界，记录不修。其余分支要么已被 v2/v3
覆盖，要么根据其自身语义（RHS/操作数无条件求值）不应被排除，要么根本不递归进 op 流因而
不可能伪造边（漏边是正交问题）。第五类同族洞在此表上已无处可藏。
