# SABI String ABI Bridge Contract

目标：把 `str` 固定为 Cheng 值语义文本，把所有 C ABI 字符串互操作收敛到显式边界类型。

## 决议

- SABI 只有当前 canonical 合同；`@ffi_map(str)` 直接 hard-fail，不提供旧合同读取或兼容期。
- 公开 C ABI 禁止裸 `str` 参数和裸 `str` 返回；诊断必须携带 `ZRPC/SABI`。
- `@abi_internal` 是唯一内部逃生口，只允许 compiler/runtime 内部声明使用 Cheng `str` 24 字节布局；源码路径不再授予权限。
- `@ffi_map` 只服务 slice/bytes，不再服务 `str`。

## 边界类型

- `utf8_view`：只读 UTF-8 `(ptr,len)`，仅 C ABI 参数可用，调用期有效，C 不得保存。
- `bytes_view`：只读 bytes `(ptr,len)`，仅 C ABI 参数可用，不承诺 UTF-8。
- `cstring`：NUL 终止 C 字符串边界；`str -> cstring` 遇内嵌 NUL 必须 hard-fail。
- `owned_cstring`：C 返回的拥有型 NUL 字符串；必须通过 `@ffi_owned_result(free=symbol)` 声明释放函数，copy 成 Cheng `str` 后释放。

## 禁止项

- 禁止公开 `@importc/@exportc` 直接暴露 `str` 参数或返回值。
- 禁止 `@ffi_map(str)`。
- 禁止 `owned_cstring` 返回值缺少 `@ffi_owned_result(free=symbol)`。
- 禁止 `utf8_view/bytes_view/owned_cstring` 出现在普通 object/global/non-ABI 函数表面。
- 禁止 C 侧持有 `utf8_view/bytes_view` 指针越过调用返回。

## 文档同步范围

- `docs/cheng-formal-spec.md`
- `docs/cheng-skill/SKILL.md`
- `docs/cheng-skill/references/grammar.md`
- `docs/cheng-skill/references/stdlib.md`
- 本地 skill 镜像：`~/.codex/skills/cheng语言/`

## 已验证范围

- `ffi_str_abi_negative_smoke`：锁公开 C ABI 裸 `str` 参数/返回 hard-fail。
- `sabi_string_bridge_smoke`：锁 SABI 文档/前端/typed/cold 合同、负例诊断，以及 `utf8_view`、`bytes_view`、`cstring`、`owned_cstring + free`、`@abi_internal` 的真实 executable lowering。
- `cheng_skill_consistency_smoke`：锁 `docs/cheng-skill/` 与本地 `cheng语言` skill 镜像一致。
- `thread_join_pool_runtime_smoke`：锁 SABI 改动进入正式 runtime provider 门禁后没有破坏线程/原子路径。
- `run-production-regression`：锁正式 stage3 聚合回归，包含 Linux x86_64 与 AArch64 provider runtime smoke。
