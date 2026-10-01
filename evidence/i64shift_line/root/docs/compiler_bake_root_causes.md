# 编译器烤制管线失败根因清单（供编译器战役精确修复）

来源：密码学会话子代理 20 轮迭代适配（50d1ffeeb 快照 × stage3.dev 8.23，逐函数暴露）
快照与全部适配改动：/private/tmp/ag1/snap（含 probe-adapted(N) 注释标记）

## 最终死点
**cold primary 合成 drop-object glue**：borrowed param（source_ownership=2）上逐字段
move-out 再 release 被拒（`managed field move lacks exact owned source`，
projection_sentinel=1/field_sentinel=0）——任何含 managed 字段对象的局部值离开作用域即触发，
无法源码适配绕过。此缺口堵死一切——driver 未烤成。

## 失败函数清单（按暴露顺序）
| # | 函数 | 文件 | 根因族 |
|---|------|------|--------|
| 1 | typedExprIrCallDeclarationOwnerIndex | lang/typed_expr.cheng | A 读链+borrow_result |
| 2 | TypedExprContextsBuildIndex | lang/typed_expr.cheng | A |
| 3 | typedExprFrozenProjectionText | lang/typed_expr.cheng | A(Result[str]) |
| 4 | typedExprRequireFrozenMetadataSession | lang/typed_expr.cheng | A |
| 5 | typedExprBuildIndexTextAt | lang/typed_expr.cheng | A(Result[str]) |
| 6 | ObjectSymbolsNameAt | backend/object_symbols.cheng | A |
| 7 | typedExprPrepareFrozenMetadataOperation | lang/typed_expr.cheng | A(转发) |
| 8 | typedExprTypeArenaLookupIntern | lang/typed_expr_type_arena.cheng | A(Result[str]) |
| 9 | ByteSpanSlice | std/bytes_layout.cheng | A(转发) |
| 10 | TypedExprIrCallDeclarationBuildIndex | lang/typed_expr.cheng | A(转发) |
| 11 | typedExprBuildIndexEntryKind 等 ~39 个 wrapper | lang/typed_expr.cheng | A(批量) |
| 12 | langintern.LookupIntern | lang/intern.cheng | A(Result[str]) |
| 13 | BackendDriverDispatchMinReportBuilderReset | tooling/backend_driver_dispatch_min.cheng | B 全局store |
| 14 | BeginReportBuilder / BeginReportBuilderFrom | 同上 | B |
| 15 | BackendDriverDispatchMinAppendLine | 同上 | B |
| 16 | StructuredLiveBytes / FinishReportBuilder / WriteReport / RecordReportPayloadAssemblyAfter | 同上 | B 全局load |
| 17 | DryCompileScanSourceText | 同上 | C CFG merge |
| 18 | DryCompileSourceStatsReset | 同上 | D var对象managed字段store |
| 19 | DryCompileManifestAppendText | 同上 | C(for回边) |
| 20 | DryCompileSourceStatsAppendManifestRow | 同上 | D(ref projection TypeId/storage) |
| 21 | DryCompileSourceStatsSealManifest | 同上 | D(unique-borrow authority) |
| 22 | `<cold-drop-object:137>`（parser.ImportEdge glue） | 编译器合成 | **E drop glue** |
| 23 | `<cold-drop-object:1392>`（SourceStats glue） | 编译器合成 | **E drop glue（最终卡点）** |

## 适配策略统计
- **有效**：剥离 @borrow_result（约 50 处，A 族全灭）；managed 读链拆单级局部变量；
  stub/砍分支（16 个函数）；删类型字段（掐断 ImportEdge glue 可达性）
- **无效**：setLen 替代全局 [] 赋值（B 族 store 本身坏）；自赋值占位（B 族读写都炸）；cheng 无 discard

## 错误形态演进（真实管线深度）
body missing → 物理源 mismatch → global root not exact → CFG merge invalid →
TypeId/storage mismatch → unique-borrow authority → **field move rejected（死点）**

## 修复靶点（按优先级，给编译器战役）
1. **cold primary 合成 drop-object glue**（最高优先级，堵死一切）
2. **@borrow_result 前向传递**（ref/struct/Result[str] 的 borrow 证据链转发断裂）
3. **borrowed ref 参数 managed 字段读链**（ir.a.b.c 物理源绑定缺失）
4. **全局变量 store/load**（global scalar root not exact + store 侧 mismatch）
5. **CFG merge**（elif 链+调用条件+循环回边下 physical source set 合并无效）
6. **var 对象 managed 字段 store**（空 seq 字面量赋值/ref projection/unique-borrow call authority）
