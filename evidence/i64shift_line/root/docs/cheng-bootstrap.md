# 纯 Cheng 自举性能基准交付计划

## Summary

- 结论：这些能力不能“大爆炸式一起改完再测”。同一交付批落地，但按依赖顺序实施，最后用同一性能门禁验收。
- 交付硬门槛：3 次中位数对比同一输入，纯 Cheng `elapsed_ms <= cold * 0.95`，进程组峰值内存 `<= cold * 0.90`，产物非空且 marker 通过。
- 禁止：cold fallback、stub、mock、空产物成功、语法文本猜测补救。

## Key Changes

- Dense IR / SoA：
  - 新增 `CompilerDenseStore`，把函数、符号、CFG、TypedIR、BodyIR 都转为 `int32 id + 连续列数组`。
  - `BodyIRFlatSoA` 从合同检查对象升级为热路径输入；旧 `BodyIR` 只保留为 debug/test adapter。
  - 符号表冻结后只读，查询用 dense id/hash table，禁止裸指针 key 和后缀猜测命中。
- Arena：
  - 每个编译 phase 建独立 `PhaseArena`，短生命周期 scratch、operand buffer、rewrite candidate 全部批量 reset。
  - 长生命周期列数组先计数再一次 reserve/setLen，禁止热路径反复 `add` 扩容。
  - 报告输出 `phase_arena_peak_bytes/reset_count/spill_count`，spill 非预期直接失败。
- No-alias：
  - `ownership + escape + ABI + provider object immutability` 生成 `NoAliasFactsDense`。
  - 只对已证明 no-alias 的 slot/buffer/provider object 做 copy forwarding、reload 删除、store/load 合并。
  - 未证明就是 may-alias，阻止优化，不做猜测。
- E-graph：
  - 接入 BodyIR dense rewrite，规则限制在纯整数、比较、select、常量折叠、代数恒等式。
  - call、pointer load/store、mutable slot、逃逸 buffer 不进 CSE。
  - 报告 `egraph_classes/rounds/rule_hits/extracted/op_delta/egraph_ms`；如果 rewrite 成本吃掉收益，收窄规则，不关闭门禁。
- Linkerless：
  - `emit:obj` 走 direct object writer。
  - 支持目标的 `emit:exe` 直接写 linkerless image；不支持目标 hard-fail，不转系统 linker。
  - 报告锁定 `linkerless_image=1`、`system_link=0`、`provider_object_count`、`unresolved_symbol_count=0`。
- 函数并行：
  - `BACKEND_JOBS` 是唯一公开控制面。
  - lowering/codegen/provider function body 任务只读 frozen dense store，worker 只产 task-local result。
  - 主线程按声明顺序稳定 merge；`BACKEND_JOBS=1` 与 `BACKEND_JOBS=N` 产物 hash 必须一致。
  - worker 等待用 join/barrier，不用固定 sleep 轮询。

## Implementation Order

1. 先把可达优先 lowering 接好，避免 `emit:obj` 全量 materialize 1648 个函数。
2. 建 `CompilerDenseStore`，把当前 TypedIR/BodyIR/CFG/符号热遍历改为 dense reader。
3. 接 phase arena 和精确 reserve，删除热路径重复分配。
4. 接 no-alias pass，再接 e-graph pass，二者都写入 `exec_phase_*` 和独立统计。
5. 把 direct object/linkerless 设为 pure selfhost 性能门禁路径。
6. 把 work-stealing executor 接进真实 lowering/codegen/provider 任务，不保留旁路 demo。
7. 更新 `pure_cheng_perf_gate`：比较 cold/pure 3 次中位数，失败即不交付。

## Test Plan

- 正确性：
  - `body_ir_dod_soa_contract_smoke`
  - `body_ir_noalias_proof_smoke`
  - `compiler_csg_egraph_active_contract_smoke`
  - `direct_object_writer_smoke`
  - `function_task_ws_determinism_smoke`
- 自举：
  - 8GiB 内纯 Cheng 编译 `program_support_backend.cheng --emit:obj --export-roots:cheng_seq_str_add`。
  - 8GiB 内纯 Cheng 编译并运行 `ordinary_zero_exit_fixture.cheng --emit:exe`。
  - 纯 Cheng `system-link-exec` 自编译，报告必须有 `cold_system_link_exec=0`、`full_backend_codegen=1`。
- 性能：
  - cold/pure 同输入、同 target、同 cache-disabled 环境跑 3 次。
  - 检查 `exec_phase_*`、`egraph_*`、`phase_arena_*`、`lowering_parallel_*`。
  - pure 必须比 cold 更快、更省内存，否则不更新自举进度。

## Assumptions

- 不新建 branch/worktree。
- cold 只保留为产物恢复和对照基线；require-pure gate 内禁用 fallback。
- 20GiB 只作诊断，不作通过标准。
- 遇到 Cheng 语法不稳健，先记录 `findings.md`，再继续结构化修复。

## 2026-06-05 Windows Guard-Off Progress

- 已解除 generated Windows `system-link-exec --emit:obj` 解析成 `ob` 的 blocker：`--emit` 及常用 flag 改走 raw code bridge，避免 `ParamStr`/`SliceBytes` 少一字节。
- 已把默认 guard-off `rc=0` 无报告推进到显式 blocker：当前返回 `2`，stderr 为 `generated Windows plan build unavailable`，报告包含 `gate_blocker_id=generated_windows_plan_build_runtime_unavailable`。
- 已修复 generated Windows 写报告路径 `.txt` 被截成 `.tx` 的 blocker：plan-build blocker 报告优先用 raw argv path + raw write bridge 写入，验证产物为完整 `*.guardoff.report.txt`。
- 已通过 `--plan-build-probe:1` 把 plan-builder 静默退出继续细分并转成报告：已越过 `BuildSystemLinkPlanStubWithExternalPackageRoots` 的高参数 fields builder 边界；probe 当前返回 `2`，报告包含 `gate_blocker_id=generated_windows_plan_build_result_return_abi_unavailable`。
- 已通过 `--plan-build-probe:deep` 继续收窄 ABI 边界：no-payload bool probe 可返回并写 report，报告包含 `gate_blocker_id=generated_windows_plan_build_plan_payload_out_abi_unavailable`。
- 已通过 `--plan-build-probe:parse` 越过 parser/header fast path、`str[]` singleton closure、missing reasons 大对象传参、source-bundle `Result[FixedBytes32]` 返回，以及单源 source-bundle CID probe；guard-off 复跑到 `probe_status_ok_return`，报告包含 `gate_blocker_id=generated_windows_plan_build_no_payload_probe_reached_ok`。
- 当前剩余 blocker：generated Windows 正式路径对 `ParsedSourceStub`/`SystemLinkExecPlan` 大 payload out-param/返回仍不稳定，`ByteBuf`/raw byte write 也仍是正式 CID/SHA 路径 blocker；下一步是修 full `SystemLinkExecPlan` payload 后继续推进到 compiler CSG 和 primary object emit。
