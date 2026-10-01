# 总目标进度板（每 goal round 更新）

started_at=2026-08-16 15:36 CST
started_epoch_ms=1786865760000
更新时间：2026-08-22 09:45 CST / 已耗约 138h；**r99 内存战役重大进展：正式门 N1280 峰值 1.012GiB→649MB（余量40%），轮数 641→11，墙钟 492→451s（三刀落地全字节不变）**。热点行级地图+下一战役开工序已归档 r90_memory_wall_ANALYSIS.md。剩余改 42–84h
读法：只看“当前阻塞”和“剩余估时”；证据细节在 progress.md/findings.md。

| # | 工作项 | 分项% | 状态 | 当前阻塞 / 最新证据（rc·字节·哈希） | 剩余估时 |
|---|---|---|---|---|---|
| 1 | emit-csg 首红收敛 | 87% | 绿图扩至 26+ 文件；elf 链路组件全绿 | 五代 driver（最新 `e64c01ba…` 326382896B）。**新绿：bytes/seqs/hashmaps/elf_riscv64_linker（RC=0 各自探针）**——RISC-V obj 出码链（encode→writer→linker）组件级全绿。gate 首红稳定 lifecycle 台账 buf=20≠22（op-lane 流释放点记账）。CI 全量 30/38：20 败=资源竞争伪影（单门禁复现过实证）、余为 driver 链 WIP/环境漂移。SABI 桥 16 处全清。 | 8–16h |
| 2 | 超线性性能治理 | 85% | 无变化（parser/receipt 文件静默） | r88c 单轮 N1280 445.806s/RSS 934MB；复测 1072.8–1074.0MB 贴/破 1GiB。range 索引 `83fe23a…` 与 receipt heap `f066ef3e…` 仍不足。峰值>50MB 压降未做。 | 6–12h |
| 3 | CSG capability 原子切换 | 65% | 无变化（op-lane 战场） | CLAIMED 未发。现刀 `f89ea83d…`（`--check`=0），未进共享。exe 路径台账错位（`allocation_ledger_realloc_without_active_owner` rc=70，lldb 栈已交）与此项同源。backend2 通道另有快照回执自检红。 | 6–12h |
| 4 | Linux held-exec | 50% | 无变化 | compiler_main 私烤（`3526a536a44ec791`）HARD_RED fail-close 符合设计。同 `f89ea83d…`。 | 4–8h |
| 5 | 正式工具链重烤 | 65% | 冻结前置面收窄：std 四文件已清绿 | driver 已至 `e64c01ba…`。**bytes/seqs/hashmaps/linker 清绿移除部分冻结前置**；余 typed_expr/ccsg/dispatch_min WIP + os 组合字形（cold-owner，管线依赖模式不踩）+ result 入口泛型伪影（非真阻断）。mem-diag 冒烟三件套备好作冻结后动态验收。勿烤。 | 12–22h |
| 6 | 三验收 | 45% | 动态验证基建就绪；目标级证据稳定复证 | mem-diag 冒烟实跑证据在案（stage3 旧运行时 seq 泄漏实锤、str 路径干净、当前源 realloc 记账正确）。**riscv64 目标级证据双重复证**：gate 自检器 pass + 跨进程逐字节一致 sha256_16=`ac66e2417c7b6591`（r100/r107 两轮同值）。ESP32-S31 字节证据待当前管线双红（primary lifecycle/backend2 快照自检）解封。binfmt riscv64 就绪。 | 8–16h |

分项权重：1=35% / 2=15% / 3=15% / 4=5% / 5=20% / 6=10%。
加权：87×.35 + 85×.15 + 65×.15 + 50×.05 + 65×.20 + 45×.10 = 30.45+12.75+9.75+2.5+13.0+4.5 = 72.95 → 约 **73%**。

合计剩余估时：约 **46–88h**（2026-08-21 22:56 修正：已耗约 **127.3h**。变动理由：① item1 绿图 21→26+ 且 elf 链路组件全绿 85→87%、10–18→8–16h；② item5 std 冻结前置面收窄 60→65%、14–26→12–22h；③ CI 甄别清除伪影不确定性。行合计 44–86h + 共享串行缓冲。不是承诺值）。

红线状态：所有权门未弱化；未 checkout/restore 共享文件。r91–r112 新增源修全部带 RC=0 证据（progress.md）：lowering_plan/cleanup_cfg/host_ops/os_host_process/bytes/seqs/hashmaps/os 桥注解、elf_riscv64_linker ~15 处所有权签名修、hashmaps lookup 族 @borrows ×13+Grow 重构、SABI 桥累计 16 处。现树 cold parser=`d2f13563…` cold源=`ac63a30f…`（WIP 05:28）；官方 driver 五代最新 `e64c01ba…`（20:54）。看门狗 scratchpad/gate_watch_loop.sh 后台轮询中（120s）。隔离 diff 未落：cfgmerge=`bc698455…` / ownedvalid=`935c27bd…` / capability=`f89ea83d…`。
