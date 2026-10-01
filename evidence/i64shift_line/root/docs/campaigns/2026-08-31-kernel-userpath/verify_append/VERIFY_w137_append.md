# wall137.VERIFY

## 判定：cold_nested 的 `direct object emit: add plan undefined data symbol` 墙**清死**（r2 cold_nested compile=0，判词前进至 run 域）；run 域 SIGSEGV 定性完成，修面在 plan/lowering 域（授权面外），按契约边界停手完整移交。烤机 2/3（r3 未动用）。

- **修法（wall134 移交候选采纳并执行）**：`direct_object_emit.cheng` 两处 `dataRelocTargetSymbols` 循环补 `ObjectSymbolsFind(symbols, …) < 0` 跳过谓词，镜像同文件既有 `relocTargetSymbols` 循环的 Find-skip 谓词（`DirectObjectEmitPlanSymbolsForTarget` 循环 ：4009→现 ：4009-4015；`DirectObjectEmitPlanSymbolsInto` 循环 ：4152→现 ：4156-4162，判词原 ：4158）。定性实证：`ObjectSymbolsAddUndefined`（object_symbols.cheng:251-264）对已存在 defined 行的名字返回 -1（`DirectObjectEmitRequireIndex` 即 panic），纯 undefined 重复幂等返回 existing 不死——data reloc 目标与主对象自身 defined 数据 label（嵌套 Fmt 字符串常量，dataLabels 循环 AddDefined section=1）同名必死；data reloc 目标来自 regalloc Page21/PageOff12 对的 `reloc.targetSymbol`（primary_object_plan.cheng:74064 装配），指本对象数据 label 属正常形态，本地已定义即无需 undefined 行，谓词 fail-closed 不放水（Find<0 时 AddUndefined 仍可能因非法名失败）。两函数（exe 路 `Into` 与 .o 直发路 `ForTarget`）同缺同补，契约对齐。
- **r2 新死点（run 域，只读定性，移交）**：cold_nested 编译过、链接过（unresolved_symbol_count=0），运行 SIGSEGV（rc=139）。lldb 实录：`str w0, [x1]` @0x100018a0c，fault addr=**x1=0x80000673**。栈：`nestedFmt+56` → provider 薄包装 0x10003989c（判空转发）→ 0x100018778（(ptr,int,int) 三参，判空后向缓冲写 int32 元素）。反汇编定性：**0x80000673 是 nestedFmt 自己 MOVN+MOVK 物化的编译期立即数**（`129f3180` movn w0,#0xf98c + `72b00000` movk w0,#0x8000,lsl#16），作首参（指针位）传入 provider 桥且返回值被弃；nestedFmt 内共两次同形调用（0x80000673 / 0x80000679，6 字节步进）；同函数紧随其后用 adrp+add 正常取数据段字面量（data+0 len6 "outer="、data+7 len7、data+15 len1）。0x673 恰为数据段页索引（数据段 size=0x673b90，>>12=0x673），0x8000_0000 为高位 tag——即**Fmt 插值参数/parts 描述符的数据地址被以「页索引|tag 伪指针」形态物化成 32 位 MOV 对，而正确形态是 adrp+add 全 64 位数据地址**。该立即数烤死在指令流里，与符号表行无关（本线改动只动符号表行；指令/数据字节由 plan words 直出，门禁旁证 ordinary/call/v6 三格 r1→r2 逐格不变）。归属面=lowering/primary_object_plan 的 Fmt 插值参数数据地址装配（Page21/PageOff12 backpatch 或 operand 值装配域），非 direct_object_emit.cheng。**与 wall134 移交事项 1 预判完全吻合**（"修后 cold_nested 判词预估进入链接/run 域…插值数据装配值错风险与修复同源"），本线把判词从预估落成现场实证。wallcensus CN-3 同步实锤。
- **wall118 ref glue 同构隐患（移交原样转录）**：本线门禁 v6 死点仍在 cleanup_cfg（更早域），ref glue 形在 cold_nested 路未复现（provider 编译 wall134 起已全过）；未撞见，修法仍归 v6 清墙线届时处理。
- **秒级门既有雷（新增一例，A/B 实证非本线引入）**：单文件 `--emit:obj` 编 direct_object_emit.cheng × 车头 cheng_w126 rc=2 `cheng_cold: call var unique authority caller=DirectObjectEmitWriteObjectTextOnly callee=DirectObjectEmitBuildDebugSectionsInto … call var unique-borrow authority is not exact (recovery=0 depth=2)`。**HEAD 基线原字节同判词同 rc**（backup→checkout→编→restore 一链完成），与任务书已知 codegen_a64_fill_units.cheng parse 雷同类（单文件入口既有雷，manifest 全量编 r1 已证同文件可过）。本线改动未引入新错误，秒级门对本文件失效，改由 r2 烤机直接验证。

日期 2026-09-04。cwd=仓库根。车头=/tmp/oob_ab/cheng_w126（sha256=0f198c5e6266597ff888e81a24fced244669d32b24b49b894cb8b51887c35d89，与 wall128-134 记录逐字节同）。烤机配方=head 三件套 + CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w137/cold_cache + CHENG_ENTRY_CACHE=0。r1/r2 各一次成功，全程零 `parent lease unavailable`。

## 烤机台账（2/3，全部 sha256+size）

| 轮 | 产物 | sha256 | size | 树态 | 结果 |
|---|---|---|---|---|---|
| r1 | kernel_driver_w137_r1 | a8ef70ebc553f27dadbfe477539234b4c9ef8da944bc444354b433ce53e8eeda | 186269472 | 进场复现（零树改动） | cold_nested 判词与 wall134 r3 逐字同：`direct object emit: add plan undefined data symbol`（compile=1；前三函数 regalloc ledger 全绿 actions=155/68/26） |
| r2 | kernel_driver_w137_r2 | 752beb31ab025f0b177a8fd2d67b63647beaed8f4fc01d971269136806d33fd7 | 186269472 | +修法（1 文件 2 hunks +13/−5） | **墙清**：cold_nested compile=0，链接过；run=139 SIGSEGV（新死点，定性见上） |

## 门禁实况（cwd=仓库根）

| 门 | r1 | r2 | 车头 cheng_w126（语义参照） |
|---|---|---|---|
| cold_nested | compile=1 `direct object emit: add plan undefined data symbol` | **compile=0**（墙清），run=139 SIGSEGV（fault=0x80000673，见定性） | 0/0 `cold_nested_fmt_interpolation=pass`（本轮重跑复证） |
| ordinary_zero_exit | 0/0 | 0/0 | 0/0 |
| call_fixture | 0/1（契约预期） | 0/1（契约预期） | 0/1（契约预期） |
| zz_v6_w7（wall136 领地，只记录不设门） | compile=1 `cleanup_cfg: return snapshot action authority missing fn=3 exit=2 …`（与 wall134 r3 同判词） | compile=1 同左逐字同（无回归、无推进，非本线域） | 0/0 |

## diff 统计与交付

- **/tmp/oob_ab/wall137.patch**：当前树态 `git diff HEAD` 全树生成，13846 行，67 files +7984/−1253（含 wall7-136 他线在途 hunks 原样照录）；`git apply --check --reverse` **PASS**（sha256=60bb54934bb6155670812fce1461e91acb6e6093c306780f3e861a86ff679826）。
- **本线增量=1 文件 2 hunks（+13/−5），全带 [wall137] 标记**：src/core/backend/direct_object_emit.cheng ①`DirectObjectEmitPlanSymbolsForTarget` dataReloc 循环补 Find-skip 谓词+注释（顺带归一该循环原有 14 空格异常缩进为 12）；②`DirectObjectEmitPlanSymbolsInto` dataReloc 循环补同谓词+注释。该文件无他人 hunks（进场时干净 HEAD 态）。
- 未 git commit、零分支/worktree；src/tests 零本线探针（现存 M 态文件与 untracked `cold_ok_result_three_consumer_negative.cheng` 均他线在途资产，原样保留）；临时产物全部收在 /tmp/oob_ab/w137/。
- 仓库根 `system_link_exec_provider.{0..5}.o*`（r2 门禁现场再生成，09:32）：本线已用于崩溃 PC 符号化取证，**保留**给 run 域归属线复用（exe provider 区字节窗与 .o 不匹配系链接重定位改写，addr_symbolicate 零命中为预期；建议改用 otool 反汇编 exe + provider .o nm 对照）。

## 移交事项（下一线）

1. **cold_nested run 域 SIGSEGV（CN-3 实锤，lowering/primary_object_plan 域）**：如上定性。要点复述：①崩点 `str w0,[x1]` @exe 0x100018a0c（fileOffset 0x17a0c），x1=0x80000673=常量本身；②常量由 nestedFmt（0x100001000）MOVN+MOVK 立即数物化并作指针首参调 3 参 provider 桥（0x10003989c→0x100018778），返回值弃；③正确数据地址形态参照同函数 adrp+add（`__data` @0x100098000）；④0x673=数据段页索引（size 0x673b90>>12），0x8000_0000=tag，两次调用步进 6 字节（0x673/0x679）疑为 parts 表相邻条目；⑤车头同夹具 0/0 pass=C 链无此形状。排查入口建议：Fmt 插值参数装配的 operand 值来源（lowering_plan / primary_object_plan 的 fmt/parts 描述符道）与 Page21/PageOff12 backpatch 对 MOV 对的适用性。r2 夹具现场：/tmp/oob_ab/w137/gates_r2/（exe+primary.o+report 全套）。
2. **观测债**：`--debug-system-link-exec` 打点仍不触发（wall134 移交事项 4 原样继承）；provider 区崩溃帧无符号（native_link 不落 provider 符号表），符号化须离线对照 provider .o。
3. **wall133 移交债清账**：其移交事项 1（:4158 dataReloc 谓词）本线已关单（墙清）；事项 2（core_types typeFact）wall135 线承接中（r1/r2 v6 判词停在 cleanup_cfg，以其为准）；事项 3（wall131 语义验证）待 run 域清墙后进行。
4. **烤机预算**：3 轮用 2，r3 备用未动用。若 run 域线需要干净 A/B：r1=墙前态（a8ef70eb…）、r2=本修法态（752beb31…）均可复用二进制直接对拍。
