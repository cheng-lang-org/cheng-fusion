# Cheng 标准库速查（稳定对齐版）

权威来源：`docs/cheng-formal-spec.md` 与仓库 `src/std/`（Cheng 标准库入口）；当前实现处于 native 与 pure substrate 并行迁移期。
本文件只做模块定位与导入示例；语义细节以正式规范与标准库源码为准。

## 导入规则（生产约束）
- 仅使用归一化模块路径：`std/<module>`、`<pkg>/<path>`。
- `cheng/<pkg>/<path>` 为兼容别名，推荐迁移为 `<pkg>/<path>`。
- 禁止字符串路径导入、相对路径导入、绝对路径导入。
- 禁止路径中空格。
- 允许前缀合并导入：`import libp2p/[crypto,transport,swarm]`；分组不支持 `as`。
- no-pointer 生产口径下，用户源码模块禁指针且不提供 ABI 兼容开关；`@importc/@exportc` 也不豁免 user-surface raw pointer 语法。
- 禁用指针类型：`T*`、`void*`、`ref T`、`ptr[T]`。
- 禁用指针操作：`&`、`*`、`->`、`dataPtr/getPointer`、`ptr_add/load_ptr/store_ptr`、`copyMem/setMem/zeroMem`、`alloc/dealloc`。

```cheng
import std/os
import std/times
import std/json as stdjson
import libp2p/swarm
import libp2p/[crypto,transport,swarm]
```

## 核心模块（`src/std`）
- `system.cheng`：运行时类型与内存管理基元。
- `strings.cheng`：字符串工具。
- `seqs.cheng`：序列工具与迭代支持。
- `tables.cheng`：表/映射工具。
- `bytes.cheng`：字节缓冲工具。
- `streams.cheng`：流接口。
- `hashes.cheng`：哈希工具。
- `os.cheng`：系统工具。
- `cmdline.cheng`：命令行解析。
- `c.cheng`：C 互操作工具。

## `std/cmdline`（更新）
- 入口函数：`programName()`、`argCount()`/`paramCount()`、`argStr(i)`/`paramStr(i)`。
- `main(argc, argv)` 入口先调用 `cmdline.CaptureCmdLine(argc, argv)`；参数随后通过 runtime `paramCount/paramStr` 表面读取，不在语言层暴露 `argv:void*`。
- flag 探测：`findFlag`、`hasFlag`、`isFlag/isFlagAt`。
- flag 取值：`readFlagValue`、`readFirstFlagValue`、`readLastFlagValue`、`readFlagValueAt`、`readFlagValueAt2`。
- 类型解析：`parseBool`、`parseInt32`、`readBoolFlag`、`readIntFlag`。
- 取值格式兼容：`--key:value`、`--key=value`、`--key value`。

## FFI 影子桥接（RPS 口径）
- `@ffi_map`：只把 `T[]`/借用切片/bytes 桥接到 C ABI 的 `(ptr,len)`；`@ffi_map(str)` 在 SABI 下禁止。
- `utf8_view` / `bytes_view`：C ABI 参数边界，分别表示只读 UTF-8 view 与只读 bytes view，调用期有效，C 侧不得保存。
- `cstring`：NUL 终止 C 字符串边界；从 `str` 转入 `cstring` 遇内嵌 NUL 必须 hard-fail，不能静默截断。
- `owned_cstring + @ffi_owned_result(free=symbol)`：C ABI 拥有型字符串返回边界，必须 copy 成 Cheng `str` 后调用声明的释放函数。
- `@ffi_out_ptrs`：把 C 的 out-ptr 参数回收为 tuple 或 Cheng `str` 返回。
- `@ffi_handle(unwind=no_unwind, ...)`：把 C `void*` 句柄收敛为 `uint32/uint64` handle。`unwind` 必填且只能精确出现一次，禁止推断及独立 `@no_unwind`；role 为 `result=produce`、`argN=borrow|consume`。句柄 target 由 TypedExpr/CSG 按 exact canonical `TypeId` 验证。无参 `@ffi_handle` 与 `@ffi_handle_consume` 非法且无兼容。当前 parser、canonical sidecar、CompilerCSG 与 canonical snapshot 合同已闭合，调用期 capability 与双后端 lowering proof 仍 hard red。
- `@importc + var T`：结构体借用桥接；当前生产 gate 使用 `system + substrate` 口径验证运行态与符号收敛。

## 字符串类型与默认值（语言对齐）
- 业务文本类型只有 `str`；`cstring/utf8_view/bytes_view/owned_cstring` 是 C ABI 边界类型，不是普通业务数据结构；`string` 不是内建类型名。
- 编译器 `stage1` 主链路对 `string` 类型名会直接报错（提示改用 `str`；C ABI 边界按需要显式选择 `cstring/utf8_view/bytes_view/owned_cstring`）。
- 隐式默认初始化时，`str/cstring` 默认值为 `""`（空串）。
- 运行时与 FFI 边界可能出现 `nil` 字符串值；边界代码建议同时考虑 `nil` 与空串。
- `std/strings` 提供 `len/==/[]/[]=/strIsEmpty/strNonEmpty` 等基础能力。
- `charAt` 不再作为标准库接口；历史代码中的 `charAt(s, i)` 在编译期静态改写为 `s[i]`。
- 容器语法：动态序列 `T[]`、定长数组 `T[N]`，其中 `N` 必须求值为 `1..2147483647` 的无环编译期整数常量；序列字面量仅 `[]` / `[a, b]`；旧 `seq[T]`/`array[T,N]`/`@[]` 已移除。

## `std/` 常用模块（`src/std`）
- 系统与时间：`std/os`、`std/times`、`std/monotimes`。
- 字符串与解析：`std/strutils`、`std/strformat`、`std/parseutils`。
- 集合与容器：`std/sequtils`、`std/sets`、`std/tables`、`std/streams`。
- 数学与算法：`std/math`、`std/algorithm`。
- 并发：`std/sync`、`std/syncio`。
- 其它：`std/json`、`std/unicode`、`std/hashes`。

## 运行时路径（迁移口径）
- `host_substrate`：平台 substrate 边界与系统 ABI 入口。
- 相关历史 C 符号适配文件（`system_helpers*.c/.h`、`stb_image.h`）当前仅作为实现历史记录保留；默认构建口径以 substrate/底座入口为主。

## 并发约束（摘要）
- 同线程共享使用 `share`。
- 跨线程共享必须使用 `share_mt` 或 `Arc[T]`。
- 可变共享优先使用 `Mutex[T]`/`RwLock[T]`。
