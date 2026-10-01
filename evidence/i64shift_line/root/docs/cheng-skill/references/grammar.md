# Cheng 语法速查（稳定对齐版）

权威来源：`docs/cheng-formal-spec.md`（版本 2026-06-03）。
本文件只做速查；如有冲突，一律以正式规范为准。

## 关键结论
- 顶层例程仅使用 `fn` 与 `iterator`。
- `if/elif/else`、`while`、`for` 等 `:` 后允许单行 suite，例如 `if x < 0: return 0`。
- 逻辑运算使用 `&&` `||` `!`，其中 `&&` / `||` 按从左到右短路求值；按位异或使用 `^`。
- 条件表达式支持三目 `cond ? thenExpr : elseExpr`，并按右结合解析。
- 单参数调用统一写 `f(x)`；`f x` 属于迁移期旧表面，`CHENG_STRICT_CALL_SYNTAX=1` 下报错；禁止 `f (x)`。
- 类型转换仅允许 `TypeExpr(expr)`。
- 对象构造支持 `TypeName(field: value)` 与 `TypeName { field: value }`。
- 导入仅允许归一化模块路径（`<pkg>/<path>`、`std/<name>`）。
- `cheng/<pkg>/<path>` 为兼容别名，推荐迁移为 `<pkg>/<path>`。
- 对非相对/非绝对模块路径，解析器可回退尝试 `<workspace>/src/<module>.cheng`。
- 导出采用 Go 风格：标识符首字符为 ASCII 大写字母即导出；小写字母或 `_` 开头保持模块私有。
- 代数类型使用 `|` 分隔 variant，例如 `type Option[T] = Some(value: T) | None`；模式匹配写 `match value:` 后缩进 arms，arm 分隔符固定为 `=>`，例如 `Some(x) => return x`。
- 业务字符串类型仅 `str`；`cstring/utf8_view/bytes_view/owned_cstring` 只用于 C ABI 边界（`string` 非内建类型名）。
- 短字符串支持常见反斜杠转义与两位十六进制 `\xNN`；`\x` 后缺位或非 hex 必须 hard-fail。
- 编译器 `stage1` 主链路会显式拒绝 `string` 类型名。
- no-pointer 生产口径下，用户源码模块禁指针且不提供 ABI 兼容开关；`@importc/@exportc` 同样不提供裸指针绕过路径。
- 禁用指针类型：`T*`、`void*`、`ref T`、`ptr[T]`。
- 禁用指针操作：`&`、`*`、`->`、`dataPtr/getPointer`、`ptr_add/load_ptr/store_ptr`、`copyMem/setMem/zeroMem`、`alloc/dealloc`。
- FFI 影子桥接：优先 `@ffi_map`（仅 `T[]`/bytes -> `ptr,len`）、`utf8_view`、`bytes_view`、显式 `cstring`、`owned_cstring + @ffi_owned_result(free=symbol)`、`@ffi_out_ptrs`（`out-ptr -> tuple/str result`）、`@ffi_handle(unwind=no_unwind, ...)`（`void* <-> handle`）与 `@importc + var T`（borrow struct bridge）；`str` 的 24 字节布局不作为默认 C ABI，`@ffi_map(str)` 禁止。
- `@ffi_handle` 只允许 `@importc`；`unwind` 必填且只能精确出现一次，唯一合法值为 `no_unwind`，不得从 `@importc`、`@trusted_abi`、C ABI 或函数实现推断，不存在独立 `@no_unwind`。role 使用 `result=produce` 与 `argN=borrow|consume`，例如 `@ffi_handle(unwind=no_unwind, result=produce, arg0=borrow)`。当前 parser、canonical sidecar、CompilerCSG 与 canonical snapshot 合同已闭合，调用期 capability 与双后端生产 proof 仍 hard red。

## 已移除/禁用写法（必须避免）
- 顶层声明：`proc`、`method`、`converter`。
- 类型转换/默认值：`TypeExpr expr`、`TypeExpr (expr)`、`TypeExpr()`、`cast[T](x)`、`(T)(x)`。
- 导入：字符串路径导入、相对/绝对路径导入、`from import`、`import A, B`、路径中带空格。
- 旧运算：`div`/`mod`、`concat`。
- no-pointer 门禁启用时：出现禁用指针类型或禁用指针操作会报 `no-pointer policy`。
- SABI 门禁启用时：公开 `@importc/@exportc` 裸 `str` 参数/返回、`@ffi_map(str)`、缺少释放声明的 `owned_cstring`、`str -> cstring` 内嵌 NUL、普通 global/object/variant/非 C ABI 函数里的 `utf8_view/bytes_view/owned_cstring` 都会 hard-fail。
- FFI handle 旧形：无参数 `@ffi_handle`、`@ffi_handle_consume`；二者均非法并直接迁移，不提供兼容。

## 模块与导入
```cheng
module demo

import std/os
import std/json as stdjson
import libp2p/swarm
import libp2p/[crypto,transport]
```

## 顶层声明（常用）
- 绑定：`let` `var` `const`。
- 例程：`fn` `iterator`。
- 类型：`type` `enum` `ref` `tuple` `set`。
- 抽象：`trait` `concept`。
- 元编程：`template` `macro`。

## 代数类型与模式匹配
```cheng
type Option[T] = Some(value: T) | None

fn fallback(value: Option[int32]): int32 =
    match value:
        Some(x) =>
            return x
        None =>
            return 0
```

- Variant payload 写字段列表；无 payload variant 只写名字。
- `match` arm 分隔符固定为 `=>`。
- 多字段 payload 可按位置绑定：`Ok(value, extra) => ...`。

## 类型转换与默认初始化
- 显式转换：`T(x)`（`T` 为类型表达式）。
- 带类型标注且省略初始化时，使用该类型隐式默认值。
- `T()` 仅用于 `object/tuple/Bytes` 的表达式/返回/实参位置；`T[]/T[N]` 不写 `T()`，简单类型默认值同样不写 `T()`。
- `object/ref object/tuple` 字段可直接写 `name: Type = expr`。
- 初始化优先级固定为：显式实参 > 字段默认值 > 类型零值。
- 对象构造支持 `TypeName(field: value)` 与 `TypeName { field: value }`；字段名必须唯一，未知字段必须编译期报错。
- 字段默认值只允许稳态表达式：字面量（含 `T[]/T[N]` 上下文下的 `[]` 与 `[a, b, ...]`）、复合类型 `T()`、`new(Type)`、纯类型构造与 `if/?:` 组合；禁止引用同对象其他字段与副作用调用。
- tuple 这轮只支持 typed implicit init 与 `T()`；tuple 字面量/tuple 类型构造必须显式写全所有元素。
- 只有偏离隐式默认值的字段才写 `= expr`；重复写 `= false`、`= 0`、`= ""`、`= []`、带类型标注的 `= T()` 是编译期硬错误。其余场景直接依赖隐式初始化，再用 `var x: Foo`、`Foo()`、`Foo(changed: ...)`；不要再写 `FooZero()` 之类镜像 helper。
- `Fmt` 现在按语法级 special form 使用，不需要 `import std/strformat`；模板插值写 `Fmt"label={expr}"` 或 `Fmt"""..."""`，动态数组拼接用 `std/strutils.Join(parts, "")`，多行拼接写 `Lines(parts)`；`Fmt(parts)`、`Fmt expr`、`Lines expr` 不再支持。
- 多行字符串写 `"""` 后换行、结束 `"""` 独占一行；结束符缩进会从每个非空正文行剥离，正文缩进浅于结束符时报错；普通 `"""..."""` 不插值，`Fmt"""..."""` 支持 `{expr}` 插值。
- 空 `[]` 表示空序列字面量；必须有类型上下文（例如已有类型的 `xs = []`，或返回类型已知时 `return []`），否则会歧义报错。
- `@[]` 已移除（会报错）。

隐式默认值（速记）：
- `bool=false`
- 整数/枚举=`0`
- 浮点=`0.0`
- `char='\0'`
- `str/cstring=""`
- 指针/`ref`/`var`/`void*`=`nil`
- 复合类型（`tuple/object/T[]/T[N]/Table/...`）先 zero-init，再应用字段默认值

示例：
```cheng
let a: int32 = int32(123)
let b: int32
let c: int32[]

type
    RunResult =
        exitCode: int32 = -1
        outputText: str
        tags: str[]
        retries: int32[3] = [1, 2, 3]

var run: RunResult
let patched = RunResult(outputText: "ok")
let patchedBrace = RunResult { outputText: "ok" }
```

## 调用与参数
- 小括号调用：`f()`、`f(x)`、`f(a, b)`、`f(a=1)`。
- 旧空格单参调用：`f x`（迁移期旧表面；优雅语法门禁下报错）。
- 具名参数支持 `=` 与 `:`。

## 最小可编译示例
```cheng
module hello

fn add(a: int32, b: int32): int32 =
    return a + b

fn main(): int32 =
    let result: int32 = add(1, 2)
    if result == 3:
        return 0
    return 1

main()
```
