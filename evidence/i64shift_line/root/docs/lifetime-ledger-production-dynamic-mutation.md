# LifetimeLedger 生产接线动态突变门

`tools/lifetime_ledger_production_dynamic_mutation_gate.sh` 是当前唯一
`LifetimeLedger` 接线的动态自检，不是发布绿灯，也不替代冻结源码、Linux cgroup
v2 1 GiB 硬门或全量 ORC 门。

门禁固定使用当前生产入口 `artifacts/bootstrap/cheng.stage3`，拒绝环境变量替换
compiler。入口必须真实响应 `status`，声明 canonical compiler schema、
`system-link-exec` 和正式 driver source entry。门禁将 `src/` 复制到一次性目录，
只突变临时副本；完整 `src` 树、选定源码、编译器和门禁自身在开始与结束时绑定
SHA-256，编译子进程显式清除继承的 `CHENG_ROOT`，任一漂移都会让整轮失败。没有
旧版本兼容、Mock、降级编译器或历史回执。

真实宿主目标只接受 Darwin arm64、Linux x86_64 和 Linux AArch64；Linux 分别使用
`x86_64-unknown-linux-gnu` 与 `aarch64-unknown-linux-gnu`。其他宿主直接
`HARD_RED`，不交叉生成不可执行产物。

基线必须真实编译并运行：

- 成功路径依次执行 alloc、borrow、borrow return、move、release，验证
  `allocated=released=1`、`live=0`、精确字节和 6 列物理释放。
- 失败路径执行重复 release，必须由运行时拒绝。
- backend2 成功与失败路径各执行 5000 次，验证 `allocated == released`、
  `live == 0`、字节平衡、worker/all-symbol 物理释放和 ledger 存储释放；最终回执
  公开两条路径的真实 alloc/free 与物理释放数，且每条路径的逻辑分配和物理释放
  都不得少于 5000，避免仅打印 `cycles=5000` 的假回执。

随后执行 16 个单点突变。10 个覆盖 alloc/move/borrow/release、对象状态写入、字节
计数和 ledger 物理释放；6 个覆盖 backend2 worker move/release/free、物理字节回执、
分配字节回执和 ledger 存储释放。每个突变都必须满足：

1. 当前编译器编译成功；
2. 运行时非零退出；
3. stdout 为空，stderr 只能是该 mutation 绑定的精确 ledger 或 backend2
   硬失败诊断；每项同时输出唯一 `mutation→diagnostic_id` 回执。

`released_physical_bytes` 会先被生产
`Backend2AssemblerTempLifecycleFinalizeStrictInto` 拒绝，绑定
`backend2_terminal_ledger_mismatch`，不会伪称为未到达的下游 sanitizer 诊断。

编译失败不能冒充突变被捕获，运行成功也不能靠文本扫描补红。

`tests/lifetime_ledger_production_dynamic_mutation_gate_test.sh` 会先证明 compiler
缺失和非 canonical override 都是可执行 `HARD_RED`，再运行完整真实门禁并逐项核对
16 个 mutation 回执。若当前生产 compiler 缺失或宿主不属于上述真实目标，focused
test 自身也保持 `HARD_RED`，不会输出动态 PASS。

该门只证明当前生产入口下这组生命周期路径的动态闭包，固定输出
`release_evidence=0`；它不替代 Linux cgroup v2 1 GiB 硬限、全编译进程树、ASAN/
UBSAN、5000 次真实 ORC 调用入口和最终 `RELEASE_GREEN`。

## ORC 当前生产门

`tools/orc_atomic_release_contract_gate.sh` 固定消费唯一当前正式入口
`artifacts/backend_driver/cheng`，拒绝 compiler/driver role override。入口存在时，它
必须在 primary 与 backend2 各运行 5000 次 retain/release，得到
`alloc=free`、`live=0`，并让 normal/atomic 的 underflow、registry miss、double
release、wrong object 共 8 类失败逐项非零退出。

入口缺失时，门仍先执行 38 个 current-schema contract mutations；新增四项分别切断
formal primary/backend2 选择和 dispatcher 的 plan/runtime 两段转发，确保两个生产入口
到双后端和 ORC provider root 的可达链不能靠模块内孤立符号假绿。其中正式 driver
必须是 canonical 路径上的非 symlink 常规可执行文件，并通过 runtime schema、
`system-link-exec` 与 production dispatch entry 的动态 `status` 身份校验。随后门必须输出
`status=HARD_RED` 与 `reason=current_source_compiler_missing`；静态 mutation PASS
不能变成动态 PASS。`tests/orc_atomic_release_current_failstop_test.sh` 独立验证这个
fail-stop 以及环境变量替换拒绝。当前工作树没有该正式入口，因此 ORC 动态生产状态
保持 `HARD_RED`。

## Linux cgroup v2 联合硬门

`tools/lifetime_orc_linux_cgroup_v2_hard_memory_gate.sh` 将上述两个真实动态门顺序放入
同一个新建 cgroup v2 叶节点。它只使用固定当前入口
`artifacts/bootstrap/cheng.stage3` 与 `artifacts/backend_driver/cheng`，不接受 driver、
限值或旧 schema override。

```bash
tools/lifetime_orc_linux_cgroup_v2_hard_memory_gate.sh \
  --cgroup-parent /sys/fs/cgroup \
  --output /abs/new-lifetime-orc-hard-memory-receipt.json
```

父 cgroup 必须已经委派 memory controller 和创建子 cgroup 的权限。门禁在任何编译或
运行前把叶节点设置为：

- `memory.max=1073741824`
- `memory.swap.max=0`
- `memory.oom.group=1`

VM `SwapTotal`、叶节点 `memory.swap.current` 也必须为 0。每个动态门的根进程先把自身
写入 `cgroup.procs`，父进程复核实际 membership 和控制文件后才放行 `exec`；全部后代
由内核继承同一 cgroup。完成等待使用 `pidfd` 事件，不做 RSS 轮询。最终证明只认
`memory.peak`、`memory.events` 和 cgroup 控制文件，固定
`userSpaceSamplingAuthority=0`。

任一 current driver 缺失、身份漂移、cgroup v2/controller/权限缺失、swap 非零、
OOM、残留进程或 cgroup 清理失败都不产回执，并输出
`production_release_status=HARD_RED`。成功回执只证明确定性内存线，不能单独宣告
`RELEASE_GREEN`。

离线 mutation：

```bash
python3 -B tests/lifetime_orc_linux_cgroup_v2_hard_memory_gate_test.py
```

该测试覆盖限值、swap、peak、证明范围、Lifetime/ORC 动态回执和缺 driver/cgroup
fail-stop；它不运行真实编译门。
