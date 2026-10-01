# Cheng 正式规范（语法与语义）

> 版本：2026-06-03

> 本文只包含 `规范性要求`（决定语言语法与语义的行为边界）。  
> 当前实现对齐状态、已知偏差、门禁命令与 backend/UIR/CSG 工具链操作手册见 `docs/cheng-implementation-status.md`（实现状态与门禁手册）；该手册不改变本文条款的权威性，冲突时以本文各章节规范条款为准。

本文为 Cheng 语言最终规范，描述语法与核心语义。

---

## 0. 语义与内存管理

### 0.1 ORC/Ownership 闭环规则

- 内存模型开关：`MM=orc`（固定）；ORC **默认严格模式**（只读 ownership 标注，不回退启发式），可用 `MM_STRICT=0` 关闭或 `MM_STRICT=1` 强制开启。
- Cheng 不内建 tracing GC；runtime 性能与诊断统一按 ORC retain/release 和 alloc/free/live 计数观察，不定义 tracing-GC pause contract。
- Ownership 唯一输出：
  - `exprClass`：`Owned`（新值/构造/非借用调用）、`Borrowed`（ident/field/index/借用视图调用）、`Unmanaged`（数值/布尔/空值等）。
  - `lastUseMoveValueDefId`：指向当前函数 TypedExpr 中精确 value-definition 的 `int32` 行身份。该优化事实命中与否对程序可观测行为必须不可观测；命中时省略的 retain/release 必须与完整插桩等价。禁止用变量名、源码行或布尔 `moveSource` 代替精确身份。
  - `escapeClass`：`NoEscape` / `ReturnEscape` / `GlobalEscape`。
  - `mustRetain`：保守为 true（Borrowed 或明确需要持有）。
- 借用/视图摘要集中在 ownership，并绑定解析后的声明身份；返回非拥有视图的 API 必须显式产生 Borrowed 证明，禁止按函数名白名单猜测。
- ORC 插桩规则（受管类型域内）：
  - **assign/overwrite**：对 Borrowed 或 `mustRetain` 的 RHS 先 retain，再 store，最后 release(old LHS)；若后端启用 moveHint，可在 last-use 场景跳过 retain，并在 cleanup 中跳过 moved-from 的 release。
  - **alias 覆盖**：当 RHS 与现有引用别名相同（如 `b = a; a = ...`），retain 优先于 release，确保旧值仍被其他别名持有，不发生提前释放。
  - **容器存入**：写入全局或长生命周期容器时必须保证容器持有引用（优先由容器 API 内部 retain；调用侧仍可显式 `share/retain`）。当前标准库字符串容器写入（`TablePut[str]` / `addPtr_str` / `setStringAt` / `insert` / `delete`）已在容器实现内完成 retain/release 闭环，不再依赖 codegen 的 call-site 特判。
  - **return**：返回本地 ident 走 move（跳过 scope release）；返回借用值必 retain；新建 Owned 值不额外 retain；scope 退出先执行 defer，再执行 releaseAllExcept(return)。
  - **`?` 解包赋值**：Ok 分支按常规 assign；Err 分支直接 return/panic，不触发 LHS release。
  - **`?` 未初始化 LHS**：Err 分支禁止对未初始化 LHS 执行 release；Ok 分支正常跟踪与 release。
  - **expr-stmt**：Owned 临时值落地 `__tmp` 并 release。
  - **global assign**：视作 `share` 写入并在覆盖时 release。
- 运行时语义：`memRetain/memRelease` 仅改 refcount；refcount==0 立即释放并从管理链表中移除。**RC 默认原子实现**（可用 `MM_ATOMIC=0` 关闭以换取性能）；跨线程共享仍需 `share_mt`/`Arc[T]` 与 `Send/Sync` 边界检查。
- 循环引用最佳实践：**显式打断**（如手动置 `nil`/拆分容器/断开引用），不内建 tracing GC。
- FFI 边界：跨 FFI 传递所有权需显式 `memRetain/memRelease`，避免悬垂指针。
- 默认公开安全边界：`cheng`、`release-compile` 与默认公开编译入口下，用户源码表面按 no-pointer + borrow/`Send/Sync` 规则 hard-fail 收口；这一定义的是“默认公开表面安全”，不等于 FFI/raw handle/环引用场景自动安全。
- 可观测性：运行时用 `MM_DIAG=1` 输出 retain/release 日志；计数器 API：`memRetainCount/memReleaseCount/memAllocCount/memFreeCount/memLiveCount`（可用 `memDiagReset()` 清零）。编译期 ownership 诊断使用 `OWNERSHIP_DIAGS=1`。

ORC/Ownership 的实现映射、验收清单、工具链/CI 落地、构建缓存一致性与性能优化实践见 `docs/cheng-implementation-status.md`。

#### 0.1.1 `defer` 清理语义

- 唯一合法表面语法是 `defer: suite`；`defer f()`、`defer expression` 均为语法错误。
- 执行流到达 `defer` 声明时，suite 才在当前词法作用域激活；注册本身不执行 suite。未到达的声明不得执行。
- 正常落出作用域、`return`、`break`、`continue` 都是结构化退出。退出时先清理内层作用域，再清理外层作用域；同一作用域内按实际激活顺序的逆序执行，形成严格 LIFO。
- `return expression` 必须先求值并稳定到返回槽，再执行 defer 和 `releaseAllExcept(return)`；defer 对原绑定的后续修改不得改变已经稳定的返回值。
- defer suite 捕获词法绑定而不是声明时的值快照；suite 在退出时读取绑定的最终值。捕获不得逃逸其声明作用域。
- defer suite 内禁止 `return`、`yield`、`break`、`continue`、`await` 和嵌套 `defer`，编译器必须 hard-fail。
- `panic` 是非结构化进程终止，不承诺执行 defer；不得把 defer 当作 panic recovery 或异常处理机制。

### 0.2 默认 move + var/共享 语义

- **默认 move**：赋值、参数传递、返回默认移动所有权；原值在语义层视为“已移走”，后续使用需显式 `share(x)` 或重新赋值。
- **可变借用**：`var` 形参/绑定表示可变借用（不转移所有权、不增加引用计数），生命周期限定在调用/作用域内，不得逃逸；调用侧对 `var` 形参隐式建立借用，物理地址只允许在借用证明完成后的 ABI lowering 内瞬时产生。
- **共享**：`share(x)` 明确增加引用计数并返回可共享引用，用于跨作用域/容器写入；跨线程共享必须使用 `share_mt(x)`/`Arc[T]`（原子 RC）；**不做隐式拷贝**。
- **容器写入**：写入全局或长生命周期容器时必须保证被写入值可共享（`share` 或 Owned 新值）；不允许将 `var` 借用值直接存入全局容器。
- **no-pointer 生产门禁**：在当前默认公开编译口径（`cheng`、`release-compile`、默认 `chengc`）下，用户源码模块禁指针；`@importc/@exportc` 等 C ABI 声明不豁免。
  - **禁用指针类型**：`T*`、`void*`、`ref T`、`ptr[T]`。
  - **禁用指针操作**：解引用（`*`/`->`）、取址（`&`）、`dataPtr/getPointer`、`ptr_add/load_ptr/store_ptr`、`copyMem/setMem/zeroMem`、`alloc/dealloc`。
  - **违规诊断**：语义阶段报 `no-pointer policy`。
  - **默认 CLI 入口**：不提供切换回指针表面语法的兼容开关。

#### 0.2.1 编译期借用证明

- **追踪范围**：`var` 形参作为借用源；`let/var` 绑定或赋值若 RHS 为借用视图，则新变量被标记为借用（同作用域内 reborrow）。
- **借用独占**：借用活跃期内禁止对借用源进行读取/写入/再次借用；借用结束（作用域结束或变量被覆盖为非借用）后解除。
- **逃逸规则**：借用值禁止 `return/yield`、禁止写入全局、`share(x)` 禁止接收借用值；借用值不得传给非 `var` 形参（默认 move），仅当目标函数显式标注 `@borrows` 时允许；标注 `@escapes` 的函数在调用处仍拒绝借用值。
- **借用视图识别**：`ident/field/index` 通过精确 value-definition 与 place projection 传播；调用结果只读取解析后声明的 Borrowed/Owned 摘要，未知摘要 hard-fail。
- **能力边界（已工程化约束）**：跨过程默认要求显式摘要（`@borrows/@escapes`）；未知/未解析调用在“借用活跃”场景下按编译期硬错误处理（需提供可解析签名或显式注解）；类型细分（Copy/RC/原始指针）遵循当前 `Send/Sync + no-pointer` 门禁口径并持续细化。
- **借用返回摘要**：返回值直接借用既有存储的函数必须在声明前标注 `@borrow_result`。该摘要绑定解析后的声明身份并进入 TypedExpr 所有权列；未标注的 Cheng 函数返回值按 Owned，`importc` 或缺失摘要的 managed 返回值按 Unknown 硬拒绝，禁止按函数名、源码路径或行号猜测。

### 0.3 多线程内存安全

- 目标：默认 ORC 保持原子 RC；跨线程显式、可检查、心智负担最小；不引入新关键词，仅新增标准库类型与编译器边界检查。
- 原则：单线程路径仍鼓励 `share` 明确语义；跨线程必须显式转换为 `Arc`/`share_mt` 并通过 `Send/Sync` 约束。

#### 0.3.1 标准库与运行时语义

- `Arc[T]`：原子引用计数的共享容器，跨线程共享的唯一入口；`Arc` 本身不可变借用，避免隐式可变共享。
- `share_mt(x)`：将 Owned `T` 或 `Arc[T]` 转换/克隆为 `Arc[T]`；内部使用原子 retain/release，最后一次 release 才析构。
- `Mutex[T]`/`RwLock[T]`：跨线程可变共享的显式通道；只允许通过锁获得可变视图。
- `Atomic[T]`：仅支持基础数值/指针/布尔类型；提供原子读写与 CAS。
- `Thread`：真实 OS 线程句柄；`thread.Start(&fn)`/`thread.StartPtr(&fn, ctx)` 返回可 `Join` 的句柄，`thread.Spawn`/`thread.SpawnPtr` 是显式 detach 入口。
- `Pool`：固定 worker 数的任务池；`ParallelFor(pool, count, &body, ctx)` 按原子 work counter 分配任务，body ABI 为 `fn(ctx: int64, index: int32, worker: int32): int32`，主线程 join 所有 worker 后返回。
- 原子 RC 语义：retain 采用 relaxed；release 采用 release；当 refcount 归零时执行 acquire fence 再析构，保证跨线程可见性。

#### 0.3.2 编译期约束与 `Send/Sync`

- 线程边界：当前白名单为 `thread.Start/thread.StartPtr/thread.Spawn/thread.SpawnPtr/thread.ParallelFor/chanI32Send/chanI32Recv`；调用实参必须满足 `Send/Sync` 约束。
- 线程边界当前通过 `@thread_boundary` 注解声明（无新增关键字），用于标记标准库/业务边界 API；未标注视为非边界；若声明了白名单并发入口但缺失标注，将在函数声明/调用处报错。
- 构造器白名单：`chanI32New` 的返回值视为 `Send/Sync`（可跨线程传递的 channel 句柄）。
- 函数指针：`&fnName`（函数取址）视为 `Send/Sync`；对数据取址 `&x` 仍属于原始指针，默认 `!Send/!Sync`。
- `Send`：可跨线程 move；Borrowed/`var` 借用仍为 `!Send`。
- `Sync`：可跨线程共享只读；类型递归满足；`Arc[T]` 为 `Send+Sync` 当且仅当 `T: Send+Sync`。
- `share` 仅用于同线程共享；跨线程必须使用 `share_mt`/`Arc[T]`，否则在边界处报错。
- `T*`/`void*` 与 FFI 句柄默认 `!Send/!Sync`，仅允许在库级封装并由调用方承担生命周期与同步责任。

多线程内存安全的实现与验收清单见 `docs/cheng-implementation-status.md`。

### 0.4 HRT Profile（已移除）

ASM/HRT profile 已于 `2026-02-06` 起从语言与生产工具链中移除，不再属于现行支持范围；具体入口/开关的移除记录见 `docs/cheng-implementation-status.md`。

### 0.5 匿名函数与函数指针（语义差异）

- **匿名函数（lambda/closure）**可以捕获外部变量，值语义包含“环境”；编译期可能生成 env 结构与 trampoline。
- **函数指针**仅包含代码地址，不携带环境；ABI 更直接，适合 `importc` 回调与 C 交互。
- 不捕获的匿名函数可视作函数指针使用，但仍需确保签名与回调形参匹配。

## 1. 形式文法（BNF）

### 1.1 词法元素

| 类别 | 关键字或符号 |
|------|--------------|
| 关键字 | `module`, `const`, `let`, `var`, `type`, `concept`, `trait`, `fn`, `iterator`, `macro`, `template`, `async`, `mut`, `if`, `elif`, `else`, `for`, `while`, `break`, `continue`, `return`, `yield`, `defer`, `await`, `import`, `as`, `in`, `when`, `match`, `case`, `of`, `where`, `true`, `false`, `nil`, `block`, `enum`, `ref`, `tuple`, `set`, `str`, `is`, `notin` |
| 分隔符 | `(` `)` `[` `]` `{` `}` `,` `:` `;` `.` `=` `=>` `@` |
| 运算符 | `+` `-` `*` `/` `%` `==` `!=` `<` `<=` `>` `>=` `<<` `>>` `..` `..<` `&` <code>&#124;</code> `^` `~` `!` `&&` <code>&#124;&#124;</code> `$` `?` `?:` `->` |
| 字面量 | 整型（十进制/十六进制/二进制/八进制）、浮点（允许下划线）、布尔（`true`/`false`）、字符串（短字符串 `"..."` 与多行字符串 `"""..."""`；`Fmt` 前缀支持短/多行插值；短字符串支持常见反斜杠转义与两位十六进制 `\xNN`）、字符（`'a'`，支持常见反斜杠转义） |
| 标识符 | 正则 `[A-Za-z_][A-Za-z0-9_]*`，严格大小写敏感 |

说明：`mut`/`is` 为保留字，当前语义未启用；不出现在正式语法产生式中。`block` 是上下文关键字：仅在语句首按 `blockStmt` 解释，在声明名、字段名、参数名及表达式标识符位置按 `ident` 解释。`proc`/`method` 已移除，统一使用 `fn` 声明函数。

词法器保证行首自动计算缩进：同一逻辑块会触发 `INDENT`/`DEDENT` 辅助 token。

在尚未闭合的 `(`、`[`、`{` 内，物理换行属于同一逻辑行，不产生
`NEWLINE`、`INDENT`、`DEDENT`；匹配的闭合符可独占一行。分隔符必须按
类型和嵌套顺序闭合，遇到不匹配闭合符或到达 `EOF` 仍未闭合均为语法错误。

公开 Cheng 表面语法不提供裸指针类型 `T*`、取地址 `&x`、解引用 `*p`
或指针成员访问 `p->field`。托管 `ref object` 是对象种类，不是裸指针；
FFI 的物理地址只允许在已证明的 ABI 边界内部瞬时产生。

逻辑运算使用 C 风格的 `&&` `||` `!`；其中 `&&` 与 `||` 按从左到右短路求值。按位异或用 `^`。

### 1.2 语法定义（EBNF）

以下为语法定义（EBNF）。

```ebnf
module         ::= { NEWLINE }
                    [ moduleHeader { NEWLINE } ]
                    { importDecl { NEWLINE } }
                    { topLevelDecl { NEWLINE } }
                    EOF ;
moduleHeader   ::= "module" ident NEWLINE ;

importDecl     ::= "import" modulePath [ "as" ident ]
                  | "import" modulePath "/[" modulePath { "," modulePath } "]" ;
modulePath     ::= ident { "/" ident } ;

topLevelDecl   ::= annotations topLevelCore ;
topLevelCore   ::= bindingDecl
                  | fnDecl
                  | iteratorDecl
                  | macroDecl
                  | templateDecl
                  | conceptDecl
                  | traitDecl
                  | typeDecl
                  | exprDecl ;
exprDecl       ::= expression ;

bindingDecl    ::= storage bindingEntry
                  | storage NEWLINE INDENT bindingEntry { NEWLINE bindingEntry } DEDENT ;
bindingEntry   ::= pattern [ ":" typeExpr ] [ "=" expression ] ;
storage        ::= "let" | "var" | "const" ;

annotations    ::= { annotation } ;
annotation     ::= "@" ident [ annotationArgs ] ;
annotationArgs ::= "(" [ annotationArg { ("," | ";") annotationArg } ] ")" ;
annotationArg  ::= ident
                  | numberLiteral
                  | stringLiteral
                  | charLiteral
                  | boolLiteral
                  | annotationEntry
                  | annotationList
                  | annotationDict ;
annotationList ::= "[" [ annotationArg { "," annotationArg } [ "," ] ] "]" ;
annotationDict ::= "{" [ annotationEntry { "," annotationEntry } [ "," ] ] "}" ;
annotationEntry ::= annotationKey ( ":" | "=" ) annotationArg ;
annotationKey  ::= ident | stringLiteral | numberLiteral | boolLiteral ;

注解在语法层统一生成 `Annotation/AnnotationArg` 结构节点，在语义 admission
阶段只接受注册名。当前注册表为 `compiler_top_level`、`exportc`、`exported`、
`importc`、`ffi_map`、`ffi_out_ptrs`、`ffi_owned_result`、`ffi_handle`、
`abi_internal`、`borrow_result`、`borrows`、`escapes`、`thread_boundary`、
`profile`、`weak`、`trusted_abi`、`no_alloc`、`interrupt_handler` 与
`keep_export_binding`；其他名字必须硬错误，不得静默忽略。固定注解参数只从
结构节点读取，不得再次拆分源码文本。`borrows`、`escapes`、`weak`、
`trusted_abi`、`no_alloc`、`interrupt_handler`、`keep_export_binding` 是
无参数函数注解：必须精确绑定一个 routine declaration row，重复、携带参数或
绑定到非函数声明都硬错误；`borrows` 与 `escapes` 是互斥的跨过程契约。

`@ffi_handle` 只允许绑定 `@importc` 函数，并且必须精确声明一次
`unwind=no_unwind` 和至少一个句柄 role：
`@ffi_handle(unwind=no_unwind,result=produce)` 表示返回值产生新句柄，
`@ffi_handle(unwind=no_unwind,argN=borrow)` 表示调用期借用第 `N` 个参数，
`@ffi_handle(unwind=no_unwind,argN=consume)` 表示调用后消费第 `N` 个参数。一个注解
可以组合多个 role，例如
`@ffi_handle(unwind=no_unwind,result=produce,arg0=borrow,arg1=consume)`；`unwind`
是必填合同键且唯一合法值是 `no_unwind`，缺失、重复或其他值均必须硬错误。
编译器不得从 `@importc`、`@trusted_abi`、C ABI 或函数实现推断该合同，也不存在
独立的 `@no_unwind` 注解。`result` 只允许 `produce`，参数只允许 `borrow` 或
`consume`。`argN` 按参数 ordinal 从 `arg0` 开始，十进制 `N` 不得带前导零；
同一 target 重复声明、未知 role、越界参数、非 `@importc` 目标都必须硬错误。
句柄 target 的规范类型必须由 TypedExpr/CSG 按 exact canonical `TypeId` 验证为
`uint32` 或 `uint64`，不得按类型文本猜测。无参数 `@ffi_handle` 和
`@ffi_handle_consume` 是非法旧形，不提供兼容读取。
当前 parser、canonical sidecar、CompilerCSG、canonical snapshot 与 Extern identity
lowering 已闭合；调用期 capability dataflow、租约和双后端 proof 尚未闭合，因此
生产 proof 保持 hard red。

routineHead    ::= ident [ typeParamList ] paramList
                   [ ":" typeExpr ]
                   [ "where" expression ] ;

fnDecl         ::= [ "async" ] "fn" routineHead "=" suite
                  | "fn" NEWLINE INDENT fnEntry { NEWLINE fnEntry } DEDENT ;
fnEntry        ::= [ "async" ] [ "fn" ] routineHead "=" suite ;

iteratorDecl   ::= "iterator" routineHead "=" suite ;

macroDecl      ::= "macro" ident [ typeParamList ] paramList
                   ":" typeExpr
                   [ "where" expression ]
                   "=" suite ;

templateDecl   ::= "template" ident [ typeParamList ] paramList
                   [ ":" typeExpr ]
                   [ "where" expression ]
                   "=" templateBody ;
templateBody   ::= suite | expression ;

typeDecl       ::= "type" ident [ typeParamList ]
                   [ "where" expression ]
                   "=" ( typeExpr | implicitObjectType )
                  | "type" NEWLINE INDENT typeEntry { NEWLINE typeEntry } DEDENT ;
typeEntry      ::= ident [ typeParamList ]
                   [ "where" expression ]
                   "=" ( typeExpr | implicitObjectType ) ;

implicitObjectType ::= [ "of" typeExpr ] [ ":" ] objectFields
                  | [ "of" typeExpr ] ; /* 允许省略 object 的声明体 */
objectType     ::= "object" [ "of" typeExpr ] [ ":" ] objectFields
                  | "object" [ "of" typeExpr ] ; /* 允许空对象 */
objectFields   ::= NEWLINE INDENT fieldDecl { NEWLINE fieldDecl } DEDENT ;
fieldDecl      ::= ident ":" typeExpr [ "=" expression ] ;
conceptDecl    ::= "concept" ident [ typeParamList ] ":" suite ;
traitDecl      ::= "trait" ident [ typeParamList ] ":" suite ;

`object/ref object` 继承语义：

- `of` 恰好保存一条由 parser 拥有的 base `TypeSyntax` 边；语义阶段必须把它解析为
  当前实例化上下文中的具体 nominal `object` TypeId。标量、tuple、enum、alias
  环、未实例化 generic、另一个 `ref object` 或无法唯一解析的类型都硬错误。
- 继承图必须无环。派生类型不得重新声明任何继承字段名；字段查找与构造器的
  unknown/duplicate 检查覆盖完整 base 链，不允许用同名字段遮蔽 base 字段。
- 普通派生 `object` 的值布局以完整 base object 布局为前缀，再按声明顺序追加
  本地字段。`ref object of Base` 的引用计数头不属于 payload；其 payload 同样以
  `Base` 布局为前缀，再追加本地字段。任何后端不得把 base 字段 offset 穿过引用
  边直接摊平。
- 初始化顺序固定为 base 零值/默认字段、派生本地字段默认值、显式构造实参覆盖；
  析构顺序严格相反：派生本地字段逆声明顺序释放，最后释放 base 子对象。部分
  初始化、提前返回和失败路径必须用同一顺序的 conditional drop flag。
- `managed/Send/Sync`、layout、drop glue、TypeCid 与语义快照身份都递归包含精确
  base TypeId/CID；不得用 base 名称、源码行、裸指针或把 base 混入普通字段 CSR
  代替独立 base 边。破坏或遗漏 base 边必须在 admission 前 hard-fail。

typeParamList  ::= "[" typeParam { ("," | ";") typeParam } "]" ;
typeParam      ::= ident [ ":" typeExpr ] [ "=" typeExpr ] ;
paramList      ::= "(" [ param { ("," | ";") param } ] ")" ;
param          ::= ident [ ":" typeExpr ] [ "=" expression ] ;

typeExpr       ::= procType
                  | tupleType
                  | setType
                  | enumType
                  | refType
                  | varType
                  | algebraicType
                  | typePostfix ;

algebraicType  ::= variantType { "|" variantType } ;
variantType    ::= ident [ "(" [ fieldDecl { ("," | ";") fieldDecl } ] ")" ] ;

procType       ::= "fn" paramList [ ":" typeExpr ] ;
tupleType      ::= "tuple" "[" tupleElem { ("," | ";") tupleElem } "]" ;
tupleElem      ::= [ ident ":" ] typeExpr [ "=" expression ] ;
setType        ::= "set" "[" typeExpr "]" ;
enumType       ::= "enum"
                  [ ":" enumFields
                  | NEWLINE INDENT enumFields DEDENT ] ;
enumFields     ::= enumField { NEWLINE enumField } ;
enumField      ::= ident [ "=" expression ] ;
refType        ::= "ref" objectType ;
varType        ::= "var" typeExpr ;
typePostfix    ::= typePrimary { "." ident
                                | "[" [ typeArg { ("," | ";") typeArg } ] "]"
                                | "?"
                                } ;
typePrimary    ::= ident
                  | "(" typeExpr ")" ;
typeArg        ::= typeExpr | numberLiteral | ident ;

suite          ::= NEWLINE INDENT statement { statement } DEDENT
                  | statement ;

- `suite ::= statement` 为稳定语义，表示允许单行 suite；例如 `if x < 0: return 0` 是合法写法。

statement      ::= annotations statementCore ;
statementCore  ::= bindingDecl
                  | typeDecl
                  | assignStmt
                  | returnStmt
                  | yieldStmt
                  | breakStmt
                  | continueStmt
                  | deferStmt
                  | ifStmt
                  | matchStmt
                  | whileStmt
                  | forStmt
                  | caseStmt
                  | whenStmt
                  | blockStmt
                  | macroStmt
                  | templateStmt
                  | conceptStmt
                  | traitStmt
                  | fnStmt
                  | iteratorStmt
                  | expressionStmt ;

assignStmt     ::= lvalue "=" expression ;
lvalue         ::= postfix ; /* 语义层限制为可写 lvalue */

returnStmt     ::= "return" [ expression ] ;
yieldStmt      ::= "yield" [ expression ] ;
breakStmt      ::= "break" ;
continueStmt   ::= "continue" ;
deferStmt      ::= "defer" ":" suite ;

ifStmt         ::= "if" expression ":" suite
                   { "elif" expression ":" suite }
                   [ "else" ":" suite ] ;

matchStmt      ::= "match" expression ":" NEWLINE
                   INDENT matchArm { NEWLINE matchArm } DEDENT
                 | "match" expression ":" matchArm ;
matchArm       ::= pattern "=>" suite ;

whileStmt      ::= "while" expression ":" suite ;

forStmt        ::= "for" pattern { "," pattern } "in" expression ":" suite ;

caseStmt       ::= "case" expression [ ":" ]
                   ( suite
                   | NEWLINE
                     ( INDENT caseBranch { caseBranch } DEDENT
                     | caseBranch { caseBranch } ) ) ;
caseBranch     ::= "of" caseArm [ "if" expression ] ":" suite
                  | "else" ":" suite ;
caseArm        ::= caseEntry { "," caseEntry } ;
caseEntry      ::= pattern | expression ;

whenStmt       ::= "when" expression ":" suite
                   { "elif" expression ":" suite }
                   [ "else" ":" suite ] ;

blockStmt      ::= "block" [ ident ] ":" suite ;

fnStmt        ::= [ "async" ] "fn" routineHead "=" suite ;

templateStmt   ::= templateDecl ;
macroStmt      ::= macroDecl ;
conceptStmt    ::= conceptDecl ;
traitStmt      ::= traitDecl ;

iteratorStmt   ::= "iterator" routineHead "=" suite ;

expressionStmt ::= expression ;

pattern        ::= ident [ ":" typeExpr ]
                  | "_" [ ":" typeExpr ]
                  | literalPattern
                  | "(" pattern { "," pattern } ")"
                  | "[" [ pattern { "," pattern } ] "]"
                  | "{" pattern { "," pattern } "}"
                  | rangePattern
                  | objectPattern
                  | variantPattern ;

variantPattern ::= ident [ "(" [ ident { "," ident } ] ")" ] ;

rangePattern   ::= pattern (".." | "..<") pattern ;
objectPattern  ::= ident "(" patternArg { "," patternArg } ")" ;
patternArg     ::= pattern | ident ":" pattern ;

literalPattern ::= numberLiteral | stringLiteral | boolLiteral | charLiteral ;

expression     ::= conditionalExpr ;

conditionalExpr ::= logicalOr [ "?" expression ":" conditionalExpr ] ;

logicalOr      ::= logicalAnd { "||" logicalAnd } ;
logicalAnd     ::= bitwiseOr { "&&" bitwiseOr } ;

bitwiseOr      ::= bitwiseXor { "|" bitwiseXor } ;
bitwiseXor     ::= bitwiseAnd { "^" bitwiseAnd } ;
bitwiseAnd     ::= equality { "&" equality } ;

equality       ::= comparison { ("==" | "!=") comparison } ;
comparison     ::= membership { ("<" | "<=" | ">" | ">=") membership } ;
membership     ::= rangeExpr { ("in" | "notin") rangeExpr } ;
rangeExpr      ::= sum { (".." | "..<") sum } ;
sum            ::= term { ("+" | "-") term } ;
term           ::= factor { ("*" | "/" | "%") factor } ;

factor         ::= spaceCall
                  | postfix
                  | whenExpr
                  | ifExpr
                  | caseExpr ;

postfix        ::= unary { "." ident
                         | callSuffix
                         | "[" expression "]"
                         | "[" expression (".." | "..<") expression "]"
                         | "?"
                         } ;

callSuffix     ::= "(" [ callArg { "," callArg } ] ")" ;
callArg        ::= [ ident ( "=" | ":" ) ] expression ;
spaceCall      ::= postfix spaceAtom ; 
spaceAtom      ::= spacePrimary { "." ident
                                | callSuffix
                                | "[" expression "]"
                                | "[" expression (".." | "..<") expression "]"
                                | "?"
                                } ;
spacePrimary   ::= ident
                  | numberLiteral
                  | stringLiteral
                  | charLiteral
                  | boolLiteral
                  | tupleLiteral
                  | listLiteral
                  | "{" [ expression { "," expression } [ "," ] ] "}"
                  | fnLiteral
                  | iteratorLiteral
                  | "(" expression ")" ;

unary          ::= primary
                  | ("+" | "-" | "!" | "~" | "$" | "^" | "%") unary
                  | "await" unary
                  | comprehension ;

comprehension  ::= "for" pattern "in" expression
                   [ "if" expression ]
                   ":" expression ;

primary        ::= ident
                  | numberLiteral
                  | stringLiteral
                  | charLiteral
                  | boolLiteral
                  | tupleLiteral
                  | listLiteral
                  | fnLiteral
                  | iteratorLiteral
                  | "(" expression ")" ;

tupleLiteral   ::= "(" tupleElement { "," tupleElement } [ "," ] ")" ;
tupleElement   ::= [ ident ":" ] expression ;

listLiteral     ::= "[" listLiteralBody "]" ;
listLiteralBody ::= listComprehension
                  | [ expression { "," expression } [ "," ] ] ;
listComprehension ::= expression "for" pattern { "," pattern } "in" expression
                      [ "if" expression ] ;

whenExpr       ::= "when" expression ":" expression
                   { "elif" expression ":" expression }
                   [ "else" ":" expression ] ;

ifExpr         ::= "if" expression ":" expression
                   { "elif" expression ":" expression }
                   "else" ":" expression ;

caseExpr       ::= "case" expression [ ":" ]
                   ( expression
                   | NEWLINE
                     INDENT caseExprBranch { caseExprBranch } DEDENT )
                   [ "else" ":" expression ] ;
caseExprBranch ::= "of" caseEntry [ "if" expression ] ":" expression ;

fnLiteral      ::= "fn" [ ident ] [ typeParamList ] paramList
                   [ ":" typeExpr ]
                   [ "where" expression ]
                   "=" suite ;

iteratorLiteral ::= "iterator" [ ident ] [ typeParamList ] paramList
                    [ ":" typeExpr ]
                    [ "where" expression ]
                    "=" suite ;

boolLiteral    ::= "true" | "false" ;
charLiteral    ::= `'` CHARACTER `'` ;

# 词法终端定义(1.1 节词法元素的 EBNF 引用形; IDENT/INTEGER/FLOAT/STRING 由词法器产出)
ident          ::= IDENT ;
numberLiteral  ::= INTEGER | FLOAT ;
stringLiteral  ::= SHORT_STRING | MULTILINE_STRING ;
```

#### 隐式类型参数（语法糖，编译期）

除显式 `typeParamList`（如 `fn f[T](x: T): T = ...`）外，Cheng 还支持**隐式类型参数**的简写形式：

- 适用范围：`fn` / `iterator` / `template` / `macro` 的例程声明（不含 lambda 字面量）。
- 触发条件：例程头部省略 `typeParamList`，但在**参数类型**或**返回类型**里出现了自由的单字母大写标识符（`T`/`U`/`K`/`V`/...）。
- 语义：编译器按签名从左到右的首次出现顺序补全类型参数列表；例如
  - `fn len(xs: T[]): int32 = xs.len` 等价于 `fn len[T](xs: T[]): int32 = xs.len`
  - `template mapIt(xs: T[], body: untyped): U[] = ...` 等价于 `template mapIt[T, U](...) = ...`
- 限制：只识别 ASCII 单字母大写；限定名（如 `mod.T`）不引入隐式类型参数；若同名类型已在作用域内定义，则按该类型解析（不当作隐式类型参数）。

#### 显式类型参数约束与缺省类型实参

- `typeParam ::= ident [ ":" typeExpr ] [ "=" typeExpr ]` 中，`:` 右侧是该参数的类型约束，`=` 右侧是缺省类型实参。两者都由 parser-owned `TypeSyntax` 与精确 `genericSymbolId` 解析，不得按名字或源码文本重建。
- 泛型 Apply 的显式类型实参按声明顺序绑定；缺省值只允许补齐末尾连续缺失的实参。显式实参数量超过参数数量，或首个缺失参数没有缺省值，即编译期错误；不支持跳过中间参数形成“洞”。
- 缺省值按参数声明顺序求值，只能引用同一参数列表中排在它之前的 `genericSymbolId`。引用自身、引用后续参数、循环依赖或引用列表外参数均为编译期错误。
- 缺省值中的前序类型参数先由已经确定的 canonical `TypeId` 替换，再形成该参数的实际 `TypeId`；显式实参与补齐后的缺省实参共同组成唯一、完整、有序的 substitution。
- 每个参数存在约束时，约束中的类型参数以完整 substitution 替换。当前尚无 concept/trait satisfaction producer，因此 admission 只接受“替换后的约束 canonical `TypeId` 与实际实参 canonical `TypeId` 精确相等”；否则编译期 hard-fail，禁止 nominal、名称或文本近似匹配。
- Apply receipt 必须同时证明显式实参与 parser `TypeSyntax` 一致、尾部缺省替换结果一致、全部约束 admission 一致；缺省或约束的前向依赖、缺洞、数量、顺序、`TypeId` 或 receipt 任一漂移都必须 hard-fail。

### 1.2.1 语义约束（补充）

- 表达式语句允许忽略返回值；语法级 `discard` 已移除（`discard x`/`discard(x)` 旧写法会报错），默认允许 unused-value。
- 绑定初始化的声明身份由 parser 产生的精确结构事实定义：每个实际引入声明的 initializer statement root 必须携带赋值 token 的 `int32` 索引，以及它拥有的 declaration row 连续区间；该区间必须与 RHS root、源码和声明 span 精确一致，declaration span 的终点取 RHS 语义 root 的精确终点，不把外层分组右括号等非语义 delimiter 算成另一份身份。纯 wildcard discard（如 `let _ = value`）不产生 declaration row，不得伪造绑定权威，其 RHS 按 assignment 事实记录且 declaration CSR 必须为 `-1/0`。receipt、CSG snapshot 与 cargo 必须逐层 remap 并哈希这些列；禁止后续阶段按 `let/var/const` 行前缀、名字、行号或源码文本重建声明身份。
- 调试段计划的源码身份由 `DebugSectionPlanReceipt` 的规范 SoA 投影定义：`sourceIds/sourceModulePaths/sourceDocumentCids` 等长，`sourceId` 严格递增且每个身份只出现一次；函数与真实操作行只保存 `int32 sourceId + documentCid` 并精确 join 该表，语义函数名按函数身份保存在等长 `functionNames` 列。收据 CID、strict replay 和 self validation 必须覆盖这些列；DWARF/对象写入器只能直接消费该投影，禁止从函数/操作行、符号名、路径文本或源码坐标重建第二套身份。
- `[]` / `[a, b, c]` 是列表字面量（历史序列字面量 `@[ ... ]` 已移除）：用于构造 `T[]`（动态序列）或 `T[N]`（固定长度数组）。**空 `[]`** 必须有类型上下文：允许用于已有类型的赋值（`xs = []`）、`return []`、以及实参位置（参数类型已知）；禁止作为无类型上下文的独立表达式语句。
- 调用语法统一使用小括号：`f()`、`f(x)`、`f(a, b)`、`f(name: value)`。空格单参调用 `f x` 属于迁移期旧表面；在 `CHENG_STRICT_CALL_SYNTAX=1` 的优雅语法门禁下直接报错，迁移提示为 `use f(x)`。字符串格式化只保留 Nim 风格 `Fmt"..."`；多行拼接使用 `Lines(...)`。
- `Fmt` 为当前稳定公开格式化表面：`Fmt"label={expr}"` 与 `Fmt"""..."""` 用于插值字符串；无分隔动态数组拼接使用 `std/strutils.Join(parts, "")`，按换行拼接使用 `Lines(parts)` 或 `std/strutils.Join(parts, "\n")`。`Fmt(parts)`、`Fmt expr`、`Lines expr` 不再支持，小写 `fmt/lines` 不导出。
- 多行字符串语法固定为 `"""` 后立刻换行，结束 `"""` 独占一行；结束符缩进作为公共缩进并从每个非空正文行剥离，正文缩进浅于结束符时编译期报错。开头换行和结束符前的分隔换行不进入字符串；源码换行统一归一为 `\n`。普通 `"""..."""` 不处理反斜杠转义也不插值；`Fmt"""..."""` 只处理 `{expr}` 插值，`{{` / `}}` 表示字面量大括号。
- 短字符串反斜杠转义支持常见单字符转义和 `\xNN` 两位十六进制 byte；`\x` 后缺位或出现非十六进制字符必须编译期 hard-fail。
- 字符串拼接操作符 `+` 已移除；字符串组合必须使用 `Fmt"..."`、`std/strutils.Join(...)` 或 `Lines(...)`。数值加法仍使用 `+`。
- 列表生成式：`[expr for pat in iter if cond]`（`if` 可选；当前仅支持 1 个 `for` + 可选 1 个 `if`）。生成式的结果类型为 `T[]`，且 `pat` 引入的名字仅在生成式内部可见。当前后端仅支持出现在“可落地”的位置（绑定初始化/简单赋值/`return`/全局初始化）；不支持直接嵌入复杂子表达式（例如直接作为函数实参），需先绑定到临时变量再使用。
- 计数型迭代规范：源码中形如 `var i = start; while i < end: ...; i = i + 1`、`while i <= end`、`while i > end`、`while i >= end` 的自增/自减计数循环必须改写为 `for ... in range` 迭代（含 guard-for 等价写法）。
- 规范要求（MUST）：凡可归约为单调索引计数（循环变量仅做 `i = i + 1` / `i = i - 1`）的循环，一律使用 `for ... in ...`；`while` 只用于非计数型条件循环。
- `for ... in ...` 的 `in` 表达式支持：range 字面值（`a..<b` / `a..b`）、数组/Table/HashMap 的字面值、常量与变量；Table/HashMap 支持 `for k, v in tableOrMap` 键值迭代。
- 容器/数组类型语法（统一后缀）：
  - `T[]`：动态序列（运行时布局为 `len/cap/buffer`，可扩容；零值为“空序列”；带类型标注省略初始化即可得到空序列，标准库不再提供 `newSeq/newSeqWithCap` 作为初始化入口）。
  - `T[N]`：固定长度数组。`N` 是编译期常量，类型身份与 ABI 都包含长度；`T[N]` 与 `T[]` 不等价。
- 旧容器语法已移除/禁用并在编译期报错：`seq[T]`、`openArray[T]`、`array[...]`、`seq_fixed[T, N]`（仅允许作为内部 lowering 目标）、`Table_fixed[V, N]`、`Table[V, N]`（容量不得作为类型参数）。
- FFI 影子桥接（Raw Pointer Safety）：用户层不得显式暴露 `ptr + len`/`out-ptr`/`void*`。
  - 切片桥接：优先 `T[]` + `@ffi_map`，由后端降级为 `(ptr,len)`；`@ffi_map` 只服务 slice/bytes，不允许桥接 `str`。
  - 字符串桥接：SABI 规定 `str` 只保持 Cheng 值语义文本，不作为公开 C ABI 裸参数或裸返回值；C ABI 必须显式选择 `utf8_view`、`bytes_view`、`cstring` 或 `owned_cstring`。
  - `utf8_view`：只读 UTF-8 `(ptr,len)`，仅 C ABI 参数可用，调用期有效，C 侧不得保存。
  - `bytes_view`：只读 bytes `(ptr,len)`，仅 C ABI 参数可用，不承诺 UTF-8。
  - `cstring`：NUL 终止 C 字符串边界；`str -> cstring` 遇内嵌 NUL 必须 hard-fail。
  - `owned_cstring`：C 返回的拥有型 NUL 字符串，必须配套 `@ffi_owned_result(free=symbol)`，copy 成 Cheng `str` 后调用声明的释放函数。
  - `@abi_internal` 是唯一允许 compiler/runtime 内部声明使用 Cheng `str` 24 字节布局的逃生口；源码路径不授予 SABI 例外。
  - 出参桥接：优先 `@ffi_out_ptrs`，由后端回收为 tuple 返回。
  - 句柄桥接：使用 `@ffi_handle(unwind=no_unwind,...)` 显式声明必填 unwind 合同与 `result=produce`、`argN=borrow|consume` role，由 runtime 负责 `void* <-> handle(uint32/uint64)` 映射；不得推断 unwind，不存在独立 `@no_unwind`，无参旧形和 `@ffi_handle_consume` 非法。
  - 借用桥接：优先 `@importc + var T`，在借用校验通过后桥接到 `T*`。
- 设计结论：只保留 `T[]` 与 `T[N]`；`T[]` 表示动态序列，`T[N]` 表示固定长度数组。
- no-pointer 门禁（生产口径）：当前默认公开编译口径下，用户源码模块默认禁指针；`@importc/@exportc` 等 C ABI 声明不再豁免。
  - 禁用指针类型：`T*`、`void*`、`ref T`、`ptr[T]`。
  - 禁用指针操作：解引用（`*`/`->`）、取址（`&`）、`dataPtr/getPointer`、`ptr_add/load_ptr/store_ptr`、`copyMem/setMem/zeroMem`、`alloc/dealloc`。
  - 违规则在语义阶段报 `no-pointer policy` 诊断。
  - 默认 CLI 不提供切换回指针表面语法的兼容开关。
- `std/cmdline` 约束：`main(argc, argv)` 入口统一调用 `cmdline.CaptureCmdLine(argc, argv)` 将参数转交 runtime 接口；`cmdline` 通过 `__cheng_rt_paramCount/__cheng_rt_paramStr/__cheng_rt_paramStrCopy` 获取并缓存参数。语言层禁止暴露 `argv:void*` 与指针算术语义。

类型转换与调用约定：
- 显式类型转换仅使用紧邻小括号：`TypeExpr(expr)`；不允许 `TypeExpr (expr)`。
- 类型转换不属于函数调用语法；只能写 `TypeExpr(expr)`。
- 类型表达式不参与空格单参调用；`TypeExpr expr` 非法。
- `TypeExpr()` 空参形式只用于 `object/tuple/Bytes` 这类复合值默认值表达式；`T[]()` / `T[N]()` 非法，需改用带类型标注的省略初始化或字面量；简单类型同样不支持 `int32()`/`bool()`/`str()` 这类零参默认值写法。
- 带类型标注的绑定省略初始化表达式时，使用该类型的**隐式默认值**；省略初始化表达式时必须提供类型。
- 隐式默认值（稳定语义）：
  - `bool` -> `false`
  - `int8/int16/int32/int64/int`、`uint8/uint16/uint32/uint64/uint`、`enum` -> `0`
  - `float32/float64` -> `0.0`
  - `char` -> `'\0'`
  - `str`/`cstring` -> `""`
  - `ref object` 实例 -> `nil`；`var T` 是借用视图，不具有可独立构造的默认值
  - 复合类型（`tuple/object/T[]/T[N]/Table/...` 等）-> 先按该类型的零值（zero-init）递归初始化；其中 `T[]/T[N]` 的零值为“空序列”（`len=0 cap=0 buffer=nil`）
- `object` / `ref object` / `tuple[...]` 的字段或元素声明可携带默认值（如 `a: int32 = 1`、`tags: str[] = ["a", "b"]`、`fixed: int32[3] = [1, 2, 3]`、`tuple[a: int32 = 1, b: int32[]]`）；复合值初始化顺序固定为：类型零值 -> 声明顺序应用字段/元素默认值 -> 显式构造实参覆盖。
  - `object/tuple/Bytes` 的 `T()`、`new(Type)`、省略初始化的 `let/var x: T`、以及 object/ref object 构造缺失字段，统一复用同一套隐式默认值物化规则。
- 字段/元素默认值表达式必须是稳态表达式：字面量（含 `T[]/T[N]` 上下文下的 `[]` 与 `[a, b, ...]`）、`object/tuple/Bytes` 的 `T()`、`new(Type)`、纯类型构造，以及 `if/?:` 组合。
- 字段/元素默认值表达式禁止引用同一对象/tuple 的其他字段，禁止副作用调用，禁止依赖求值顺序的写法；违者编译期报错。
- 与隐式默认值一致的显式初始化是编译期硬错误：带类型标注的 `let/var` 禁止写 `= false` / `= 0` / `= ""` / `= []` / `= T()`，字段/元素默认值也禁止重复声明同样的零值；只保留真正改变默认语义的值。
- `object` / `ref object` 构造器的具名字段必须唯一；unknown field 与 duplicate field 都是编译期硬错误。
- `object` / `ref object` 构造器支持 `T(field: value)` 与 `T { field: value }` 两种表面写法；二者共享同一隐式默认值物化、字段唯一性和 unknown field 诊断规则。
- `tuple` 本轮仅支持 typed implicit init 与 `T()` 物化；tuple 字面量/tuple 类型构造仍要求显式写全所有元素，不支持省略元素后用默认值自动补齐。
- 字符串类型命名约束：业务文本类型仅 `str`；`cstring/utf8_view/bytes_view/owned_cstring` 是 C ABI 边界类型，不是普通业务数据结构。
- 字符串 nil 语义（稳定口径）：
  - `str` 省略初始化默认 `""`。
  - `str = nil`、`let/var x: str = nil`、`x == nil`、`x != nil` 在编译阶段直接报错。
  - `str` 判空请显式写 `len(s) == 0` 或 `len(s) > 0`。
  - `cstring` 作为 C ABI 指针语义保留 `nil` 比较（`== nil` / `!= nil`）。
- string ABI contract markers：
  - `string_abi_contract.schema=canonical`
  - `string_abi_contract.scheme.id=SABI`
  - `string_abi_contract.scheme.name=backend_string_abi_contract`
  - `string_abi_contract.scheme.normative=1`
  - `string_abi_contract.enforce.mode=default_verify`
  - `string_abi_contract.closure=required`
  - `string_abi_contract.language.str=value_semantics`
  - `string_abi_contract.abi.utf8_view=borrowed_utf8_call_scope`
  - `string_abi_contract.abi.bytes_view=borrowed_bytes_call_scope`
  - `string_abi_contract.abi.cstring=nul_terminated_boundary`
  - `string_abi_contract.abi.owned_cstring=owned_result_requires_free`
  - `string_abi_contract.abi.str_direct_c_abi=forbidden`
  - `string_abi_contract.abi.ffi_map_str=forbidden`
  - `string_abi_contract.abi.internal_escape=@abi_internal`
  - `string_abi_contract.abi.owned_result_annotation=@ffi_owned_result`
  - `string_abi_contract.abi.str_bridge=utf8_view_or_bytes_view_or_cstring_or_owned_cstring`
  - `string_abi_contract.nil_compare.cstring_only=1`
  - `string_abi_contract.language.str.layout.bytes=24`
  - `string_abi_contract.language.str.layout.data_offset=0`
  - `string_abi_contract.language.str.layout.len_offset=8`
  - `string_abi_contract.language.str.layout.store_id_offset=12`
  - `string_abi_contract.language.str.layout.flags_offset=16`
  - `string_abi_contract.language.sequence_header.bytes=16`
  - `string_abi_contract.formal_spec.synced=1`
- `str` 是 24 字节值布局：`data@0`、`len@8`、`store_id@12`、`flags@16`。`str[]`/`uint8[]` 是 16 字节动态序列头。ABI、codegen 与 runtime provider 禁止把两者混成同一种布局。
- `str` 的 24 字节布局只属于 Cheng 语言/runtime 内部合同；外部 C ABI 不得把该布局当成稳定互操作结构体。需要把 `str` 传给 C 时，必须在 ABI lowering 层显式桥接：只读文本用 `utf8_view`，原始 bytes 用 `bytes_view`，NUL 结尾 API 用 `cstring` 临时副本，C 返回拥有型字符串用 `owned_cstring + @ffi_owned_result(free=symbol)` copy 后释放。
- `str -> cstring` lowering 必须保持作用域生命周期；遇到内嵌 NUL 时必须 hard-fail，禁止静默截断。C 侧不得直接构造 `store_id/flags`，也不得持有 `utf8_view/bytes_view` 指针越过调用返回。
- SABI 的生产完成证明与实现进度口径见 `docs/cheng-implementation-status.md` 与 `docs/beat-c.md §12` §7；未通过完整门禁前不得宣称完成。
- 实现约束：编译器后端前端统一按 `stage1` 口径处理（旧前端别名已移除），并会显式拒绝 `string`（报错提示改用 `str`/`cstring`）。
- 类型表达式允许点限定名 `Module.Type` 用于消歧；语义等价于 `Type`，模块前缀在语义/后端 lowering 时消解。
- `T()` 是正常表达式；仅对 `object/tuple/Bytes` 会按隐式默认值规则物化一个新的 `T` 值。`T[]/T[N]` 与简单类型默认值都不写 `T()`，旧 `default[T]` 写法已移除。
- 如果只是复合类型零值/默认值构造，不再维护 `FooZero()` 这类无参镜像 helper；直接使用 `var x: Foo`、`Foo()` 或 `new(Foo)`。
- `new` 的唯一合法表面写法为 `new(TypeExpr)`，返回该类型的 zero-init Owned 实例；旧 `new x` / `new(x)` 本地变量分配写法已移除。
- 空的 `[]` 需要类型上下文（例如已有类型的 `xs = []` / `return []` / 作为实参），否则会报“缺少元素类型”。
- 类型与值命名空间分离；当 callee 解析为类型且只有一个位置参数时，`T(x)` 表示类型转换；对象构造使用具名字段参数 `T(field: ...)` 或 brace 形式 `T { field: value }`。
- C 风格 `(T)(x)` 已移除。
- `cast[T](x)` 已移除。
- 单参数调用统一写 `f(x)`；`f x` 只作为迁移期旧表面保留，不属于优雅语法。`f (x)` 非法。
- 零参调用使用小括号形式（`f()` / `obj.m()`）；当 callee 解析为 `object/tuple/Bytes` 这类复合值类型时，`T()` 表示默认值物化。

破坏性语法升级的工程流程（规范/文档/门禁同步顺序，非语义）见 `docs/cheng-implementation-status.md`。

### 1.3 运算符优先级

| 优先级 | 运算符/结构 | 说明 |
|--------|-------------|------|
| 120 | `.` `->` | 成员访问 |
| 110 | `()` `[]` postfix `?` | 调用、下标/切片、Result 解包 |
| 100 | 单目 `+ - * & ! ~ $ ^ await` | 前缀运算 |
| 90  | `* / %` | 乘除取模 |
| 80  | `+ -` | 数值加减；字符串不得使用 `+` 拼接，改用 `Fmt` / `Lines` |
| 77  | `<< >>` | 移位 |
| 75  | `.. ..<` | 区间运算 |
| 70  | `in` `notin` | 成员测试（区间/序列/字符串/set/Table/字面量容器） |
| 65  | `< <= > >=` | 比较 |
| 60  | `== !=` | 相等比较 |
| 50  | `&` | 按位与 |
| 45  | `^` | 按位异或 |
| 40  | <code>&#124;</code> | 按位或 |
| 30  | `&&` | 布尔与 |
| 20  | `||` | 布尔或 |
| 15  | `?:` | 条件运算 |

#### 1.3.1 `$`（stringify/toString）运算符（语义约定）

- `$x` 为前缀运算符，语义等价于对 `x` 调用一元操作符函数 `$`（可被重载）。
- 约定：`$` 用于 toString；可通过为类型实现操作符函数 `$` 来提供字符串化输出。
- 编译器对 `enum` 提供内建 `$`（默认使用字段名；若字段带显式字符串值则优先使用该值）。

#### 1.3.2 `<<` / `>>` 位移运算（语义约定）

- 适用范围：整数类型（`int8/int16/int32/int64/int`、`uint8/uint16/uint32/uint64/uint` 等）。
- 位移位数：设被移位值位宽为 `W`（例如 `int32` 为 32；`int`/`uint` 为 `INTBITS`），实际位移量 `k = rhs mod W`（结果落在 `[0, W-1]`）。
  - 该规则对任意整数 `rhs` 生效（包含负数与超范围值），用于避免 C 的 out-of-range shift 未定义行为。
- 左移 `a << rhs`：
  - 低位补 0，高位溢出丢弃（按位宽回绕），返回类型与 `a` 相同。
- 右移 `a >> rhs`：
  - 若 `a` 为有符号整数（`int*`/`int`），执行算术右移（符号扩展，IR: `ashr`）。
  - 若 `a` 为无符号整数（`uint*`/`uint`），执行逻辑右移（高位补 0，IR: `lshr`）。
- 例：`int32(1) << 33 == int32(2)`；`uint32(0xffffffff) >> 1 == uint32(0x7fffffff)`；`int32(-1) >> 1 == int32(-1)`。

#### 1.3.3 符号重载分发（编译期静态）

- Cheng 的符号重载采用**编译期静态分发**：候选函数选择由静态类型、泛型实例化与可见性在编译阶段确定。
- 不做运行时动态分发；编译产物中运算符调用应收敛为确定目标（内建 lowering 或已解析函数符号）。
- 下标运算遵循以下规则：
  - 读取 `a[b]`：优先命中内建容器路径（如 `str/T[]/T[N]` 等）；否则按操作符函数 ``[]`` 做静态重载解析。
  - 赋值 `a[b] = v`：若存在匹配的 ``[]=``，优先按 ``[]=`` 解析；否则按“先 `[]` 取值再赋值”的语义处理。
- 普通赋值 `lhs = rhs` 遵循静态分发：
  - 对复合类型（如 object/tuple/泛型容器实例化类型），若存在匹配的 ``=`` 重载（含泛型实例化后匹配），优先静态分发到该重载。
  - 未命中 ``=`` 重载时，回退到内建赋值语义。
- 标准容器（含 `hashmap/json/Table` 等）的 `[]/[]=` 也遵循同一静态分发规则。
- 若候选不唯一或不存在可用重载，必须在编译期报错（不得回退为运行时动态判别）。

#### 1.3.4 条件表达式 `?:` 与 postfix `?` 区分

- Cheng 支持三目条件表达式：`cond ? thenExpr : elseExpr`。
- `?:` 为右结合，语义遵循 `conditionalExpr ::= logicalOr [ "?" expression ":" conditionalExpr ]`。
- postfix `expr?` 表示 Result/Option 风格解包语义（失败分支提前返回/传播）；它与三目 `?:` 是两套独立语义。
- `return expr?` 非法；需要先 `let value = expr?` 再 `return Ok(value)` 或返回其它显式构造值，语言层不做隐式 Ok 包装。
- 推荐实践：当表达式中同时出现两类 `?`（例如 `x? ? a : b`）时，使用括号显式分组以避免可读性歧义。
- 例：`flag ? 1 : false ? 2 : 0` 按右结合解析为 `flag ? 1 : (false ? 2 : 0)`。

#### 1.3.5 spaceCall 的 strict-profile 排除

- `spaceCall` 产生式（如 `foo x` 空格分隔调用）仅描述非 strict 编译剖面的语法空间。
- 固定生产剖面 `CHENG_STRICT_CALL_SYNTAX=1` 拒绝 spaceCall：调用必须书写 `callSuffix`（圆括号实参列表），空格分隔的调用形式在语法分析期以 `space_call_removed` 诊断拒绝。
- 本排除与 `factor ::= spaceCall | postfix | whenExpr | ifExpr | caseExpr` 的 EBNF 并存：EBNF 描述全量语法空间，生产剖面按本条收窄，二者不构成矛盾。

### 1.4 模块导出与可见性

- Cheng 采用 Go 风格的“首字母大写导出”规则：标识符首字符为 ASCII 大写字母的符号视为导出。
- 首字符为小写字母或 `_` 的符号为模块私有。
- `import` 仅导入导出符号；未导出符号在模块外不可见。
- 不支持 `*` 导出标记。

### 1.5 包定义与导入解析（生产约束）

- 包根目录固定 `cheng-package.toml`；必须包含 `package_id`；依赖项至少声明 `package_id` + `channel`，并**应支持 SemVer 约束**（如 `version = "^1.2"`）与可选校验和。
- 锁文件默认 `cheng.lock.toml`；记录可验证快照（`cid/author_id/signature/epoch`）、解析后的版本/来源/校验和；`format = "source"` 表示源码直发。
- 导入仅接受归一化模块路径（例如 `import <pkg>/<path>`、`import std/...`、`import ide/...`、`import ide/gui/...`），不接受字符串/绝对/相对路径；路径中**不允许空格**。
- **路径规范化**：`<pkg>/<path>` 为当前推荐写法；`cheng/<pkg>/<path>` 作为兼容别名接受并在解析阶段等价归一化。
- **域名内容寻址（IPNS 风格）**：`<pkg>/<path>` 视为包域名入口（等价于 `pkg://cheng/<pkg>`）；解析由 registry/lock 固定 `cid`，本地从 `chengcache/packages/<cid>/` 加载。
- **包内模块根**：对已解析到的包根目录（含 `cheng-package.toml`），源码以 `src/` 为模块根：`import <pkg>/<path>` 映射为 `<pkgroot>/src/<path>.cheng`（`<pkg>` 只用于选包，不参与包内路径）。
- 包搜索根：优先 `PKG_ROOT/PKG_ROOTS`；未设置时默认 `~/.cheng-packages`，并优先尝试 `cheng-<pkg>` 容器目录。
- 标准库导入规范：业务/编译器代码统一使用 `std/<path>` 入口，并映射到仓库 `src/std/<path>.cheng`；`cheng/stdlib/bootstrap/*` 已移除，不作为可用导入路径。
- 迁移约束：`cheng/net/*` 与 `cheng/multiformats/*` 已上收至 `std/net/*` 与 `std/multiformats/*`；源码中禁止继续导入旧前缀。
- 支持相同前缀合并：`import libp2p/[crypto,transport,swarm]`（方括号内用逗号分隔，路径整体不含空格）。
- 导入分组不支持 `as`；需要别名时请拆成多行 `import ... as ...`。
- 模块路径解析由 manifest/lock 决定；团队规范统一使用 `/` 分隔的模块路径，禁止 `.` 或 `..` 片段。
- **源码根回退**：对非绝对/非相对的普通模块路径，解析器可回退尝试 `<workspace>/src/<module>.cheng`（用于仓库内源码模块导入）。
- **循环导入约束**：模块导入图不允许出现环；命中环路时编译器必须报错并输出链路（`Import cycle detected: A -> ... -> A`）。
- **无前置声明口径**：同一编译单元允许“先用后定义”，语义阶段先收集全局符号/函数签名再分析函数体。
- **导入参与检测**：`import` 语句一经解析即进入导入图；即使当前模块未直接引用该导入符号，也必须参与循环检测。
- **实现约束（active trace）**：循环检测应基于“活动导入栈（active import trace）”，且入栈/出栈覆盖整个递归加载生命周期，避免提前出栈导致漏检。
- **插件导入覆盖（可选）**：`PLUGIN_ENABLE!=0` 且命中插件前缀时，可在标准解析前按 `PLUGIN_PATHS`（兼容 `PLUGIN_PATH`）覆盖解析；此能力属于编译器可配置导入面，不改变语法约束本身。
- `@importc` 指令与参数之间不允许空格（例如 `@importc("printf")`）。
- 生产环境要求解析可复现并与 lock 一致；规范化后不得越出允许根目录。

## 附录 A 自研后端与 UIR 摘要（已迁移）

自研后端与 UIR 的实现约束、产物/轨道策略、门禁命令、调试入口与 CSG/cold 工具链手册已迁移至 `docs/cheng-implementation-status.md`；自研后端保持本规范定义的语言语义不变，后端实现细节不构成语义承诺。

## 附录 B Raw Pointer Safety 契约冻结（RPSPAR-01）

规范性约束（Normative）：
- 本契约的规范名为 `零裸指针生产闭环`（`Zero-RawPtr Production Closure`，`ZRPC`），属于发布门禁的规范性约束，不是建议项。
- 执行模式为 `hard_fail`：任一契约漂移或门禁缺失必须阻断闭环与发布。
- 语言表面禁止裸指针类型与指针算术；不得向用户暴露 `void*` 语义入口。
- 编译器内部表示（AST/UIR/基本块）在生产口径应采用 `Arena + SoA` 连续存储，跨节点引用应使用 `int32` 索引；不得以对象裸指针作为长期关联键暴露到优化与门禁接口。
- C ABI 互操作仅允许通过“影子桥接”完成，用户可见接口保持值/借用语义：
  - `ffi_map`：`slice/bytes -> (ptr,len)` 物理拆包；`@ffi_map(str)` 禁止。
  - `str bridge`：`str` 默认不裸露为 C ABI 结构体；只允许显式 lowering 为 `utf8_view`、`bytes_view`、`cstring` 临时副本，或 `owned_cstring + @ffi_owned_result(free=symbol)` copy/free 后回收为 Cheng `str`。
  - `ffi_out_ptrs`：`out-ptr -> tuple` 语义回收。
  - `ffi_handle`：以 `@ffi_handle(unwind=no_unwind,...)` 显式声明唯一合法 unwind 合同和 `result=produce`、`argN=borrow|consume` role 的 `void* <-> handle(uint32/uint64)` runtime 槽位映射；只允许 `@importc`，禁止推断和独立 `@no_unwind`，无参旧形与 `@ffi_handle_consume` 非法。
  - `borrow`：`&T/&mut T -> T*` 仅在借用校验通过后桥接。
- 释放后句柄必须 fail-safe（panic/error），不得退化为 UAF/野指针访问。

验收约束（Acceptance）：
- `ffi_map` 合入条件：parser/语义属性表能记录映射；no-pointer gate 拒绝用户源码中的裸 `ptr/len` 表面；UIR ABI lowering 或内存 thunk 只在 ABI 边界拆包；正例至少覆盖 `ffi_importc_map_slice_ptr_len_i32.cheng`，反例至少覆盖用户裸指针切片表面。
- `str bridge` 合入条件：默认公开口径下，未声明桥接语义的 C ABI `str` 参数/返回值必须 hard-fail；正例覆盖 `str -> utf8_view`、`Bytes/uint8[] -> bytes_view`、`str -> cstring`、`owned_cstring + free -> str`、`@abi_internal` 内部直通；反例覆盖 C 侧直接消费/构造 24 字节 Cheng `str` 布局、`@ffi_map(str)`、`owned_cstring` 缺释放声明、内嵌 NUL 静默截断、边界类型出现在普通 object/global/non-ABI 函数、以及 `str[]`/`uint8[]` 布局混用。
- `ffi_out_ptrs` 合入条件：语义阶段校验 out 参数位置、数量、返回 tuple arity/type；UIR lowering 创建临时出参槽并回收为 tuple；正例至少覆盖 pair/status/string result 三类，反例至少覆盖 arity mismatch。
- `ffi_handle` 合入条件：parser 以 exact declaration row 记录显式 role；TypedExpr/CSG 以 exact canonical `TypeId`、SymbolId 与 capability CID 绑定合同；两个生产后端在 lowering 裸 ABI 地址前消费同一 proof；runtime handle table 负责 register/resolve/invalidate/generation。用户层只暴露 `uint32/uint64` handle；smoke 必须覆盖正常读写、generation reuse、stale trap 与 stale reuse trap。当前 parser、canonical sidecar、CompilerCSG、canonical snapshot 与 Extern identity lowering 已闭合；调用期 capability 和双后端生产 proof 仍 hard red。
- `borrow` 合入条件：`var T` 与 `@borrows/@escapes` 先通过借用证明；ABI lowering 只在证明通过后生成物理 `T*`；反例必须覆盖非 lvalue、活跃借用逃逸、未知调用和 `@escapes` 调用。
- 默认 no-pointer 合入条件：`cheng`、`release-compile` 与默认公开入口均启用同一语义门禁；`@importc/@exportc` 不得绕过；违规诊断携带 `ZRPC`/`no-pointer policy`。
- 工具门禁合入条件：发布报告不得把 C 脚本、C seed 强制构建、旧 C sidecar 或假实现列为通过依据；active compile chain 出现旧 C sidecar 符号族必须 hard-fail。
- 全源码 normalized expression 必须被划入且仅划入可达函数、不可达函数、非函数声明值三个精确域。非函数声明值只能由 parser 的 exact statement-root、declaration CSR、声明 kind、lexical scope 与 `functionRow=-1` 联合证明；函数行范围的补集、源码行号、文本或名称均不构成身份。
- 同一 binding initializer 只能由 parser-owned producer 生成一条 NormalizedExpr；发现 exact BindingInitializer statement-root 后，旧逐行 assignment scanner 不得再次追加。验收必须拒绝任何缺 `valueExprRootNodeIndex` 或 statement role 的 Assign 行，不能只统计已绑定行。
- CompilerCSG 的语义依赖身份必须严格验证并哈希 source table、declaration→source join、import owner/target source、module 与路径 join；任何缺列、越界、计数漂移或 receipt 不一致都必须 hard-fail。跨根发布身份仍以 `canonicalGraphCid` 为准，本地 `graphCid` 不得替代发布固定点。

同步标记（供门禁脚本读取）：
- `rawptr_contract.scheme.id=ZRPC`
- `rawptr_contract.scheme.name=zero_rawptr_production_closure`
- `rawptr_contract.scheme.normative=1`
- `rawptr_contract.enforce.mode=hard_fail`
- `rawptr_contract.formal_spec.synced=1`
