> **口径迁移（2026-09-08 用户令）**：本回执中的 1GiB / 1073741824 为迁移前最后防线证据，保留原文；当前内存模型理论极限=768MiB=805,306,368 bytes。

# Linux current-source 1 GiB 硬内存回执

唯一 producer 一次生成 traced workload 与 aggregate OOM 两套证据。它只接受
rootless native Linux、delegated cgroup v2、固定 rootfs manifest、Linux ELF
driver/build receipt 和与本次 argv/env 完全一致的 native descriptor：

```bash
tools/beat_c_linux_cgroup_v2_hard_memory_gate.sh \
  --delegation-manifest /abs/delegation.kv \
  --cgroup-parent /sys/fs/cgroup/delegated-parent \
  --crun /usr/bin/crun \
  --rootfs /abs/rootfs \
  --rootfs-manifest /abs/rootfs-manifest.json \
  --evidence-root /abs/new-evidence-root \
  --workspace-root /abs/cheng-lang \
  --source-closure /abs/source-closure.before \
  --driver /abs/linux-native-cheng \
  --build-receipt /abs/linux-native-build-receipt.kv \
  --native-descriptor /abs/native-descriptor.kv \
  --native-descriptor-sha256 <64hex> \
  --workload-kind current_driver \
  -- system-link-exec \
  --require-pure-system-link-exec \
  --root:/cheng-current-source/repo \
  --in:src/core/tooling/backend_driver_dispatch_min.cheng \
  --emit:exe \
  --link-providers \
  --target:x86_64-unknown-linux-gnu \
  --out:/cheng-hardcap-work/current-driver.next \
  --report-out:/cheng-hardcap-work/current-driver.report
```

`current_driver` 是兼容默认值。report-only dry-compile 使用同一 gate，不创建
第二套脚本：

```bash
tools/beat_c_linux_cgroup_v2_hard_memory_gate.sh \
  --delegation-manifest /abs/delegation.kv \
  --cgroup-parent /sys/fs/cgroup/delegated-parent \
  --crun /usr/bin/crun \
  --rootfs /abs/rootfs \
  --rootfs-manifest /abs/rootfs-manifest.json \
  --evidence-root /abs/new-evidence-root \
  --workspace-root /abs/cheng-lang \
  --source-closure /abs/source-closure.before \
  --driver /abs/linux-native-cheng \
  --build-receipt /abs/linux-native-build-receipt.kv \
  --native-descriptor /abs/native-descriptor.kv \
  --native-descriptor-sha256 <64hex> \
  --workload-kind dry_compile \
  -- dry-compile \
  --root:/cheng-current-source/repo \
  --in:/cheng-current-source/repo/src/core/tooling/backend_driver_dispatch_min.cheng \
  --target:x86_64-unknown-linux-gnu \
  --emit:exe \
  --backend-jobs:1 \
  --out:/cheng-hardcap-work/dry-output \
  --report-out:/cheng-hardcap-work/dry-compile.report
```

dry native descriptor 必须绑定这组 exact argv，以及固定环境
`HOME=/nonexistent`、`LANG=C`、`LC_ALL=C`、`PATH=/usr/bin:/bin`、`TZ=UTC`、
`BACKEND_JOBS=1`、`CHENG_PROCESS_MAX_RSS_BYTES=1073741824`。入口和 target
必须与 Linux build receipt 相同；不能拿 Darwin Mach-O 或其 raw SHA 代替 Linux
ELF worker。

dry 成功时 `dry-output` 必须不存在，work tmpfs 只允许正式 report；`.map`、
`.primary.o`、native-link log、额外文件/目录、report 后唯一换行之外的 stdout
或任意 stderr 字节都直接 `HARD_RED`。report 必须是无末尾换行的唯一 KV，且满足：

- `dry_compile_executes_codegen=0`、所有 codegen/link phase 为 0、unresolved import 为 0。
- source stats 与 full-theory 同形字段、phase ns/ms、time guard 算术完全一致。
- `exec_phase_dry_actual_total_ms` 是实测 dry 时间；`full_compile_theory_time_guard_recommended_ms`
  只是调度模型。
- `full_compile_theory_rss_modeled_guard_estimate_bytes` 必须继续标记为
  `non_exhaustive`、`not_proven_upper_bound`，不能冒充 1 GiB 上界证明。

producer 先校验 current binding，再顺序运行 workload 和双子进程 aggregate OOM
probe，最后调用独立 validator。收据绑定 workload kind、exact argv/env、
Linux driver/build/source closure/entry、完整 descendant-exec ledger、report
hash/bytes、`time.monotonic_ns()` 的 start/end/elapsed、`memory.max=1073741824`、
`memory.swap.max=0`、OOM=0（workload）和 cleanup `populated=0`。任一步失败都输出
`production_release_status=HARD_RED`。

独立校验入口：

```bash
tools/beat_c_validate_linux_cgroup_v2_hard_memory_receipt.sh \
  --evidence-dir /abs/workload-evidence \
  --aggregate-evidence-dir /abs/aggregate-oom-evidence \
  --workspace-root /abs/cheng-lang \
  --source-closure /abs/source-closure.before \
  --driver /abs/linux-native-cheng \
  --build-receipt /abs/linux-native-build-receipt.kv \
  --native-descriptor /abs/native-descriptor.kv \
  --native-descriptor-sha256 <64hex> \
  --workload-kind dry_compile
```

校验器只接受唯一 current 身份链：

- 用固定生产 scopes 重算完整源码闭包，要求 before/after 原始字节相同。
- 校验 canonical Linux ELF driver、最终 build receipt、源码闭包、入口与 native
  descriptor 的路径、哈希、inode、target/machine 身份。
- 要求 workload 通过只读 bind mount 直接执行 ELF driver；运行中 process-tree audit 必须证明目标及全部存活后代位于同一 cgroup，并对拍实际执行文件哈希。
- workload 与双子进程 aggregate OOM probe 必须绑定同一 native Linux rootfs、
  内核、delegated parent、runner 和 validator 身份。
- `memory.max` 必须为 `1073741824`，`memory.swap.max`、VM swap 和实测 swap 必须为 `0`；peak、OOM event 和 OOMKilled 必须互相一致。
- OCI runtime、leaf cgroup 和完整进程树必须完成清理；任一残留立即失败。
- ptrace ledger 必须闭合所有 descendant exec、argv 和绑定文件；旧回执缺少任一字段
  或 artifact 都会失败。

本门只覆盖 native Linux cgroup，固定输出 `darwin_release_status=HARD_RED`，不能
替代 Darwin 生产门。Darwin userspace polling、静态合同测试和未执行真实 1 GiB
pair 的状态都保持 `production_release_status=HARD_RED`。

离线对抗测试：

```bash
tools/beat_c_validate_linux_cgroup_v2_hard_memory_receipt_test.sh
```

producer/validator 离线合同测试：

```bash
tools/beat_c_linux_cgroup_v2_hard_memory_gate_contract_test.sh
```

离线测试不代替真实 native Linux delegated cgroup v2，也不能把缺失 Linux ELF
driver、rootfs、descriptor 或 dynamic pair 转绿。

当前 dry 工具闭包仍明确保持发布 `HARD_RED`，直到 source authority 同时提供：

- `exec_phase_system_link_plan_ns`，用于关闭真实 phase ns/ms 算术；
- reachable import-header BFS 的 canonical manifest/CID，并把 files/lines/bytes/
  import-edges 绑定到 frozen source closure；
- dry 成功 report 的 exact ordered key schema、字段数和顺序摘要；
- 可独立重算的 `source_bundle_binding_seal` 物理输入。

现有 required-field 校验、同形统计相等或下游自报 seal 都不能代替这些权威。

## Lifetime/ORC 完整动态门

编译器 workload/OOM producer 之外，确定性内存线使用独立 current-only 入口：

```bash
tools/lifetime_orc_linux_cgroup_v2_hard_memory_gate.sh \
  --cgroup-parent /sys/fs/cgroup \
  --output /abs/new-lifetime-orc-hard-memory-receipt.json
```

该入口不是 RSS 采样包装。它把真实 LifetimeLedger 16 项动态 mutation 和 primary/
backend2 ORC 5000 次成功、8 类失败矩阵放入同一个内核 cgroup v2 叶节点，要求
`memory.max=1073741824`、`memory.swap.max=0`、VM swap 为 0，并由
`cgroup.procs` 继承覆盖完整后代。缺 cgroup 权限或任一固定 current driver 时直接
`HARD_RED`，不会回退到 Darwin process-tree 采样。
