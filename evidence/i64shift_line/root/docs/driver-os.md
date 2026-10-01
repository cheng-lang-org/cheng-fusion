# Cheng 驱动/OS 安全能力闭合计划

## Summary
目标锁定为：先补 Cheng 语言和编译器的低层安全 profile，让驱动/OS 主体代码不需要 C、不暴露裸指针。第一验收目标是 **RISC-V QEMU 安全门禁**，不是先做完整 OS。

成功标准：`driver_safe` profile 下，公开 API 无裸指针、无 C provider、无 mock；MMIO/DMA/interrupt/no_alloc 误用编译期 hard-fail；RISC-V QEMU smoke 能用纯 Cheng 产物运行并输出固定 marker。

## Key Changes
- 新增 `driver_safe` profile：默认 no-pointer，禁止公开 `ptr/T*/void*/ref`，只允许 `@trusted_abi` 模块内部接触地址构造；导出 API 只能使用强类型 handle。
- 新增低层安全类型：`PhysAddr`、`VirtAddr`、`MmioReg[T]`、`DmaBufferCpu[T]`、`DmaBufferDevice[T]`、`IrqToken`、`IrqSpinLock[T]`。
- 新增语义标注：`@profile("driver_safe")`、`@trusted_abi`、`@no_alloc`、`@interrupt_handler`、`@section("...")`、`@align(n)`。
- 编译器门禁：
  - `@no_alloc` 函数禁止 heap allocation、ORC managed 临时值、阻塞调用。
  - `@interrupt_handler` 自动包含 `@no_alloc`，禁止普通锁、IO 阻塞、逃逸借用、非原子共享状态。
  - `MmioReg[T]` 只允许 volatile load/store/readModifyWrite，要求整数类型、自然对齐、地址来源可信。
  - `DmaBufferCpu[T]` 可读写；交给设备后变成 `DmaBufferDevice[T]`，CPU 侧禁止读写，必须 reclaim 后才能访问。
- 新增 RISC-V 裸机目标：`riscv64-unknown-none-elf`，使用已有 RISC-V ELF/linkerless 架构扩展，不走系统 linker，不链接 C runtime。
- 新增 QEMU smoke：编译纯 Cheng kernel fixture，通过 UART MMIO 写出 `cheng_driver_safe_ok`，通过 QEMU virt 退出设备或明确机器退出路径返回 0。

## Test Plan
- 编译期正例：
  - `driver_safe` UART MMIO 写寄存器。
  - `@no_alloc` 纯标量函数。
  - DMA `Cpu -> Device -> Cpu` 状态转移。
  - interrupt handler 只访问 `Atomic`/`IrqSpinLock`/静态 buffer。
- 编译期反例：
  - 公开 API 暴露 `ptr` hard-fail。
  - 非 `@trusted_abi` 构造物理地址 hard-fail。
  - MMIO 非整数类型、未对齐地址、普通 load/store hard-fail。
  - `@no_alloc` 内分配、字符串拼接、容器扩容 hard-fail。
  - interrupt handler 内普通 `Mutex`、阻塞 IO、borrow escape hard-fail。
  - `DmaBufferDevice[T]` 被 CPU 读写 hard-fail。
- 运行门禁：
  - 现有 `borrow_checker_smoke`、`orc_perf_contract_smoke`、`thread_atomic_orc_runtime_gate_smoke` 保持通过。
  - RISC-V object/linker smoke 保持 `linkerless_image=1`、`system_link=0`、`unresolved_symbol_count=0`。
  - 新增 `riscv64_driver_safe_qemu_smoke`，要求 QEMU 输出 marker 且退出码为 0。
- 报告门禁：
  - 编译报告必须包含 `driver_safe_profile=1`、`public_pointer_violations=0`、`no_alloc_verified=1`、`interrupt_safe_verified=1`、`system_link=0`。

## Assumptions
- 第一阶段只闭合语言/编译器安全能力，不实现完整 OS。
- 首个目标是 `riscv64-unknown-none-elf` + QEMU virt。
- C 可以保留在历史 bootstrap 文件中，但 `driver_safe` 目标产物不得链接 C runtime/C provider。
- 地址不会被“消灭”，只允许封装在强类型能力里；普通 Cheng 驱动/OS 代码不直接使用裸指针。
