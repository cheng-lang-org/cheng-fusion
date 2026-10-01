# VERIFY_w138_append.md —— kernel_driver_w2 战役 wall138 线（续飞线）

日期：2026-09-04。工作目录=仓库根。目标：修 cold_nested_fmt_interpolation_smoke.cheng 的 run 域 SIGSEGV 墙（收官面）。

## 判定

**墙推进 2 层，未收官，停手移交。**

- 接手态（引用前任 r1 资产）：cold_nested compile=0 / run=139 SIGSEGV。
- 本线结束态（r4）：cold_nested **compile=0 / run=0（SIGSEGV 崩溃墙已打穿）**，判词 `cold_nested_fmt_interpolation=fail`（第三层语义墙暴露，详见移交）。
- 其余门禁全绿不回归；烤机预算 3 轮（r2/r3/r4）已用尽，按纪律停手，不硬凑。

## 两层已修墙（定性链）

### 墙 1：regalloc 将「CallArgSlotAddress 编码槽」当算术常量物化

- r1 死点：`str w0,[x1]`，x1=0x80000673。位型算术：`CallArgSlotAddress(3)` = `(-2147482000)+3` = -2147481997 = **0x80000673**（前任「tag|页索引」读法的精确根：编码基址 `CallArgSlotAddressBase()=0-2147482000`）。
- 形状闭合：nestedFmt 外/内层 Fmt 的 parts seq 槽（LocalAggregate 16B）零初始化 `setMem(dst,0,16)`。body_ir_access decode 的 writeOnlyAddress 臂（只写 dst 不记 address/use）发 FixedCallArg **Fixed fact**，encodedValue=编码槽；regalloc plan 端把 FactFixed 无差别标 `LocationConstant`；regalloc_aarch64_adapter 的 LoadFixed/Constant 臂 else 兜底直接 `regallocA64AppendImmediate(encodedValue)` → MOVN+MOVK 裸指针。
- r1 编译日志 regalloc ledger（actions=155 issue=155 emissions=155 全绿）证明该函数走 regalloc 生产发射（旧 fill 臂不在链路且其发射形状均正确）。
- **修**（regalloc_aarch64_adapter.cheng，消费端按同一编码空间精确解码）：LoadFixed/Constant 与 StoreStackArg/Constant 两臂在 IsCString 之后补 `CallArgSlotIsAddress` 臂 → `CallArgSlotAddressId` 解码 → `regallocA64AppendSlotAddress`（局部槽 add sp,off / 全局槽 data-symbol adrp+add，与 AddressFixed/StoreStackArg-Address 臂同契约）；解码失败 ok=false 走统一 `regallocA64Fail`（fail-closed）。[wall138] 标记。
- r2 验证：nestedFmt 内两条 setMem dst 变为 `add x0, sp, #off`，MOVN+MOVK 伪指针消失。
- 兄弟域核查：regalloc_x86_64_adapter / regalloc_riscv_adapter 的 LoadFixed 只接 AddressHome 值类约束，**无同形洞**，无需扩散。

### 墙 2：macho_provider_linker 将 provider 的 undefined 解析到「引用者自己的定义」成死循环

- r2 死点：F(0x100039a30)↔G(0x100039b14) 互递归栈溢出（EXC_BAD_ACCESS code=2 于 `stp x29,x30,[sp,#-0x10]!`）。
- 定性：provider（program_support_backend.cheng:6942 `@exportc("puts")` 定义 `_puts`；:43 `@importc("puts")` 引用 `_puts`）。链接器 `machoProviderResolveTarget` undefined 臂扫「任意对象的唯一定义」不排除引用者自身 → provider 的 c_puts_runtime 被绑回自家 puts_export，形成 puts_export→cheng_puts_export→c_puts_runtime(→puts_export) 死循环。主对象 echo 的 puts 同绑 provider 定义。r1 已存在，被墙 1 遮蔽（r2 换位暴露）。ordinary exe 无主对象 puts 引用时同符号绑 dylib stub（解析随引用者漂移，ordinary 门禁因此未见此墙）。
- Linux 侧先例佐证：core_runtime_provider_linux.cheng:3290 同导出带 `@weak`（darwin macho 链未贯通 weak，不可用）。
- **修**（macho_provider_linker.cheng，链接通用语义：引用者自己的定义不得满足自己的 undefined）：`machoProviderCountDefinedObjectIndex` / `machoCountLinkedDefinedByteOff` 增 `excludeObjectIndex` 参；`machoProviderResolveTarget` 传 `originObjectIndex`；**scan 阶段（:3977）同参传 oi，两阶段判定对齐**（r3 失败臂教训：仅改解析侧则 provider puts 不入 imports，报 "import missing after scan" compile=2，r3 验证后回补）。[wall138] 标记。
- r4 验证：cold_nested run=0 无崩溃，echo 输出正常（puts 通道工作）。

## 门禁表（cwd=仓库根）

| 门 | r1（前任基线） | r2 | r3 | r4 | 车头 oracle |
|---|---|---|---|---|---|
| cold_nested_fmt_interpolation_smoke | c0/**r139** | c0/r139 | c2（"import missing after scan"，scan/解析两阶段失配的中间态） | **c0/r0**（判词 `=fail`，见移交） | c0/r0 `=pass` ✓ |
| ordinary_zero_exit_fixture | c0/r0 | c0/r0 ✓ | c0/r0 ✓ | c0/r0 ✓ | c0/r0 ✓ |
| call_fixture | c0/r1 | c0/r1 ✓ | c0/r1 ✓ | c0/r1 ✓ | c0/r1 ✓ |
| zz_v6_w7（wall139 领地，只记录不设门） | - | c1 cleanup_cfg 判词 | c1 同 | c1 同 | c0/r0 ✓ |

- 车头 /tmp/oob_ab/cheng_w126 四夹具 oracle 全绿（上表末列）：cold_nested `=pass`、ordinary 0/0、call 0/1、zz_v6_w7 0/0。

## 烤机记录（head 三件套；w126 原配方目录被系统清理，已按 git HEAD 快照重建于 /tmp/oob_ab/w138/：build_kernel_driver_w138.sh + kernel_manifest_head.cheng，输出格式/entries=35/entry 与前任 bake_r1.log 逐行一致；车头不变）

| 轮 | sha256 | size | 结果 |
|---|---|---|---|
| r1（前任） | 1ecb39e1e8e3b164bd0ecbf0d92cee12653869ccfe3a49f8b0f16366f132f624 | 186302304 | 基线复现 |
| r2（墙1修复） | 91ed716c35e164fe2ef1a3efa7ba4d6e25ba31890993595c0310872b407a6efe | 186302400 | 墙1消失，墙2暴露 |
| r3（墙2修复·半） | 131ce214d5e7d1d471b030203b6fde7399aa2768de352bee00391a8e1fa1c4c4 | 186302400 | scan/解析失配 compile=2，回补 |
| r4（墙2修复·全） | 3fc3e380bb604e4d5667e12df77e46d0d01c54635388072ae821e404fcc3800a | 186302400 | run=0，判词 =fail |

## diff 统计（/tmp/oob_ab/wall138.patch，仅本线两文件，reverse-check PASS）

- src/core/backend/regalloc_aarch64_adapter.cheng：+35（LoadFixed/StoreStackArg 两臂 IsAddress 解码）
- src/core/backend/macho_provider_linker.cheng：+26/-3（scan+resolve 两阶段 origin 排除）
- 合计 2 files changed, 58 insertions(+), 3 deletions(-)；`git apply --reverse --check` PASS。
- 授权面说明：两文件均在 lowering_plan/primary_object_plan 授权面之外。必然性论证：①墙1发射点经 r1 反汇编逐指令锁定 regalloc adapter 的 Immediate 兜底臂，授权面两文件发射臂不在 r1 实际链路且形状正确；②墙2发射点为 provider 链接器符号解析，授权面无涉。均属「定性证明修面必在别处，最小触碰」条款，已加 [wall138] 标记。并行 wall139（cleanup_cfg 域）零交集。

## 移交事项（下一墙线）

1. **第三层墙：cold_nested 判词 `=fail`（拼接/比较语义）**。SIGSEGV 已清，main 走到 `if actual == "outer=inner=asset-7"` 为假。探测受限：lldb 对该 exe 地址断点 unresolved（--shlib 可命中但 thread step-out 沿 CFI 跳层不可靠）；探针夹具须 --in 仓库内路径（entry module identity），与「src/tests 零残留」纪律冲突，未落。建议下一线：a) 以仓库内临时夹具+用后即删的方式打单一 fmt 串探针拿 actual 内容；或 b) 对 _cheng_strformat_fmt_bridge/join 做运行时行为对拍（车头 C 链 nestedFmt STR_CONCAT 链为语义参照，见 primary_object_plan wall93 注释引用的 cn_c_ref_dump.log）。主对象发射（r4 primary.o）序列形状（setMem/utf8_copy/seq_str_add/fmt_bridge×2）静态看合理，嫌疑集中在 fmt 桥运行时拼串或 str 比较语义。
2. 单层 fmt 无可用 pass 基线：cold_bootstrap_fmt_str（r4 下 compile=2 `typed-node exact producer TypeId missing`）、cold_fmt_var_scalar_ref_smoke（compile=1 `manual consume function identity drift`）均为既有域雷，r4 下原样复现，非本线引入。
3. debug_runtime_provider/std/system_helpers_backend 等处仍有裸 `@importc("puts")` 声明，若其所在对象同时被链入带 `@exportc("puts")` 的 provider，依赖本次链接器排除契约保证；后续可评估统一收敛到 cheng_host_puts_runtime 通道（wall93/`cheng_host_puts_runtime` 先例）。
4. 前任留盘探针 src/tests/zz_probe_w138.cheng（头注「用后必删」）已删除；探针产物全部收敛在 /tmp/oob_ab/w138/。
5. /tmp/oob_ab/w126/ 目录（含原 build 脚本与 manifest）被系统清理；本线重建件与 r2/r3/r4 驱动、gate 产物均在 /tmp/oob_ab/w138/。车头 /tmp/oob_ab/cheng_w126 完好（oracle 单测 c0/r0）。

## 烤机脚本

- 烤：`bash /tmp/oob_ab/w138/bake_w138_v2.sh <rN>`（含租约 45s×40 退避）
- 门：`bash /tmp/oob_ab/w138/gates_w138.sh <driver> <tag>`（cwd=仓库根）
