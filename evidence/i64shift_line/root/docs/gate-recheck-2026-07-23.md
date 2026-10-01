# 门禁与墙体复测记录(2026-07-23,agent 复测 lane)

复测窗口 13:17–14:05 CST。只读+烘焙,未改任何 src/ 源码。所有产物在
`.tmp-exec/gate-recheck-0723/`。复测期间另有 lane 在实时编辑
`src/core/lang/typed_expr.cheng`(13:31→13:36→13:41 三次改动)与
`src/core/backend/debug_section_plan_receipt.cheng`(13:01→13:21),前两次烘焙失败
均为该 lane 的中间态,非本 lane 结论。

## 1. 冷烤 driver(backend_driver_dispatch_min)

- `cc -O2 bootstrap/cheng_cold.c` 成功(2.0MB)。
- 烘焙命令(对齐 tools/backend2_current_source_gate.sh 的 flags):
  `cheng_cold system-link-exec --root:<repo> --in:src/core/tooling/backend_driver_dispatch_min.cheng --emit:exe --link-providers --target:arm64-apple-darwin`
  → rc=0,346189 行,compile_real_elapsed_ms=132175(≈132s),driver 34MB。
- **但烤出的 driver 不可用**:用它对 ordinary_zero_exit_fixture.cheng 做 exe 发射,
  4 个 runtime provider 全部硬失败(rc=2):
  - runtime/core_runtime: `compiler csg: executable call unresolved callee=Int32Ptr`
    (core_runtime_provider_darwin.cheng:4631)
  - runtime/debug_runtime: `typed expr: call declaration identity drift`
    (debug_runtime_provider.cheng:389 fact_signature_line=270 expected_signature_line=0)
  - runtime/program_support: `compiler csg: executable call unresolved callee=cheng_call_ptr_void_raw`
    (program_support_backend.cheng:564)
  - runtime/program_support_host_runtime: `typed expr: structural type conversion preflight kind invalid`
- 对照:锁定 driver `artifacts/backend_driver/cheng`(7-21 烤)在同一棵树上对同一
  fixture exe 发射 rc=0、运行 rc=0。⇒ 今天的工作树烤不出能自举编译 provider 的
  driver,这是树当前状态的真实回归/中间态,不是烘焙姿势问题(quiet 窗口内重烤同结果)。

## 2. W1:parser wildcard `let _ =` panic(agent-10 报)

**已修复**。探针 `.tmp-exec/gate-recheck-0723/w1_probe.cheng`(`let _ = helper()`):
cheng_cold 编译 rc=0(6 行,cold_compile_elapsed_ms=36.6),运行 rc=0。
另 parser.cheng 本体含大量 `let _ =`,driver 烘焙(346189 行闭包)全程无 wildcard panic。

## 3. media_moq_e2e_timing_gate.sh(门①②③)

**无法执行**:门禁第一步要用编译器构建 media_moq_publisher_main,而 publisher 编译
被 msquic 体缺失墙挡死(见第 5 节),三个可用编译器路径全堵:
- stage3:msquicNativeFlushServerShortPacketsLoop 墙;
- pinned backend_driver(7-21):msquicConnImplStoreSetFlow 墙;
- 新烤 driver:provider 编译墙(第 1 节),且对 publisher 主编译还先撞
  `compiler csg: exact parser expression has no function or reachability domain`
  (libp2p/core/peer_id.cheng:13)。
门①②③本次无实测值。

## 4. es_pool 两个 check main

- `media_moq_es_pool_bookkeeping_check_main.cheng`:stage3 编译 rc=0
  (97701 行,cold_compile_elapsed_ms=958.3),运行全绿:
  step1_slot_count_ok / step2_three_slots_distinct_ok / step3_dedupe_ok /
  step4_pool_full_loud_ok / step5_unopened_getters_zero_ok /
  step6_invalid_index_loud_ok / step7_find_peer_open_only_ok → POOL_BOOKKEEPING_OK,rc=0。
- `media_moq_es_pool_check_main.cheng`(live):stage3 编译 rc=2,撞
  msquicNativeFlushServerShortPacketsLoop 墙 ⇒ run_media_moq_es_pool_check.sh
  的双发布端共存/收养/GOP0 上盘验证无法执行(它还需要 publisher 二进制,同样被墙挡)。

## 5. msquic 体缺失墙复测

两堵墙**都还在**,函数体源码都在(7-14 起未动),是 cold 拒收导致体缺失:

- `native_runtime.msquicNativeFlushServerShortPacketsLoop`(native_runtime.cheng:2865):
  stage3 编译 publisher_main / es_pool_check_main 时报
  `cold call arg mismatch: arg[0] param_kind=9 param_size=8 param_type=var connection_impl.MsQuicConnImpl actual_kind=1 actual_size=4`
  (调用点 `MsQuicConnImplHasQueued(msquicNativeServerImpl[msquicNativeCurSlot])`,
  数组元素 4 字节实际参数喂给 var MsQuicConnImpl 形参)→ 体缺失 → rc=2。
- `connection_impl.msquicConnImplStoreSetFlow`(connection_impl.cheng:147):
  pinned backend_driver 编译 publisher_main 时报
  `indexed field assignment unsupported indexed field kind` → 体缺失 → rc=2。

## 结论速览

| 项 | 状态 |
|---|---|
| driver 冷烤 | 烤得出(132s),烤出的 driver provider 编译 4 连硬失败,不可用 |
| W1 `let _ =` panic | 已修复,探针编译+运行全绿 |
| 门①②③ | 无实测值(publisher 编译被 msquic 墙挡) |
| es_pool 簿记 check | 绿(7 步全过) |
| es_pool live check | 未执行(编译被 flush 墙挡) |
| msquic 两堵体缺失墙 | 均在(flushLoop arg mismatch / storeSetFlow indexed field) |
