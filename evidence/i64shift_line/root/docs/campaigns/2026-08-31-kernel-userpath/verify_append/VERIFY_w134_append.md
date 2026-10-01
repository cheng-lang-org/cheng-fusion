# wall134.VERIFY

## 判定：烤机预算 3/3 用尽，provider 编译墙整体清死（cold_nested 判词两轮连进：core_runtime provider 过 → program_support provider 过），新死点前移至直接对象发射（direct_object_emit 域，授权面外），停手完整移交。

- **修法一（wall133 移交候选 b 采纳并执行）**：`SystemLinkExecRuntimeAddCoreRuntimeRoots` 删除 `cheng_str_drop_owned` / `cheng_str_snapshot_retain_owned` 两行列举。定性=该臂是错误提供者：export roots 契约=「本 provider 源必须导出」，cold 编译器逐 root 在源内精确匹配 @exportc（cheng_cold_head.c `cold_symbol_matches_export_root`=memcmp 纯文本），`cheng_str_drop_owned`/`cheng_str_snapshot_retain_owned` 定义唯一点=program_support_backend.cheng（:2329/:2341），core_runtime provider 源零此导出——原注释「cannot be unconditional core roots」的条件化（reloc 需要才加）只推迟失败不消除失败，cold_nested main 的 `let actual: str` 作用域尾 drop 首次生成该 reloc 即触发。str glue reloc 全权归 `AppendProgramSupportRelocRoots` reloc 扫描臂（definitionIndex 不命中→candidate→program_support roots，源可导出），闭环实证：needsRuntime 时 providerModules 原子批量含 `runtime/program_support`（system_link_plan.cheng:4915-4920），其源=`ProgramSupportProviderSourcePath`→program_support_backend.cheng。C 链 oracle 二进制（cheng_w126）strings 零 `cheng_str_drop_owned`——C 链 str drop 不走 provider roots 通道，此臂系 kernel 链自创错接线。
- **修法二（r2 新死点，同文件扫描臂）**：`AppendProgramSupportRelocRoots` candidate 臂插入 key 从 reloc 列原形式改为 `SystemLinkExecRuntimeColdProviderRootSpelling`（剥一层 target 装饰）。定性=r2 判词 `export root _cheng_seq_str_add not found`（provider.3=program_support）：plan reloc 列混合形态（`cheng_str_drop_owned` raw 与 `_cheng_seq_str_add` decorated 并存，r2 现场实证），candidate 臂原样 add 把 decorated 形式带进 roots，而 provider cold 匹配零装饰感知必死；该函数上方注释已自证契约「plan reloc columns carry the target-decorated form … Strip exactly one decoration at this seam」却只有查重臂用了归一形式、add 臂没归一——契约对齐补全。归一到同一 raw key 后 raw/decorated 双行去重语义不变。误剥风险面收窄实证：`__cheng_*` 双下划线行经 :2259 rootIndex 命中（纯桥硬根 raw 形态）或 definitionIndex 命中先行 continue，到不了归一插入点。[r3 效果实证：provider 编译全过，该死点消失。]
- **r3 新死点（授权面外，只读定性，移交）**：`direct object emit: add plan undefined data symbol`（direct_object_emit.cheng:4158）。语义=：4150 dataRelocTargetSymbols 循环对每个目标直接 `ObjectSymbolsAddUndefined`，而 AddUndefined（object_symbols.cheng:251-264）对「已存在 defined 行的名字」返回 -1（纯 undefined 行幂等返回 existing 不死）。即 data reloc 目标与主对象自身 defined 符号（嵌套 Fmt 字符串常量数据 label）同名时必死。同文件 ：3995-4002 的 relocTargetSymbols 循环有 `ObjectSymbolsFind(symbols, …) >= 0 → skip` 跳过谓词，dataReloc 循环缺同一谓词——**两循环谓词不对齐，与 wall133 移交的通道谓词不对齐完全同构**。修法候选：：4158 循环镜像 ：3995 的 Find 跳过谓词（自身已定义的 data reloc 目标不需要 undefined 行）。修面=src/core/backend/direct_object_emit.cheng，超出 wall134 授权面且烤机预算用尽无法验证，未动手。

日期 2026-09-04。车头=/tmp/oob_ab/cheng_w126（sha256=0f198c5e6266597ff888e81a24fced244669d32b24b49b894cb8b51887c35d89，与 wall128-133 记录逐字节同）。烤机配方=head 三件套 + CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w134/cold_cache + CHENG_ENTRY_CACHE=0，cwd=仓库根。作业期间遭遇多波 `parent lease unavailable`（并行 wall135 线烤机），全程按纪律串行退避（r2 门禁 zz_v6_w7 一轮 8 次退避后仍租约失败 rc=2，该轮 v6 无有效判词，仅此一格）。

## 烤机台账（3/3，全部 sha256+size）

| 轮 | 产物 | sha256 | size | 树态 | 结果 |
|---|---|---|---|---|---|
| r1 | kernel_driver_w134_r1 | 3206d4fd7d30959b616ea094925dd253695b52cd5b8f9928eb01b0c55598ed9a | 186269360 | 进场复现（零树改动） | cold_nested 判词与 wall133 r2/r3 逐字同：`provider compile failed rc=2 source=…core_runtime_provider_darwin.cheng` → `cheng_cold: export root cheng_str_drop_owned not found` |
| r2 | kernel_driver_w134_r2 | b6f5b100b6e3c70c9c980704653fe1bd4b685da5bfbcaa17e092e5f41ec27df8 | 186269360 | +修法一 | 判词推进：core_runtime provider 过，`provider compile failed rc=2 source=…program_support_backend.cheng` → `cheng_cold: export root _cheng_seq_str_add not found` |
| r3 | kernel_driver_w134_r3 | ad2a17270081d49fab9266582081374ed72845e507c60e0971206c3e92b105ca | 186269360 | +修法二 | 判词再推进：provider 编译墙整体清死，`direct object emit: add plan undefined data symbol`（rc=1，direct_object_emit:4158） |

注：r2/r3 烤机与 r1 同树基线外仅含本线两 hunk（r3 另含并行 wall135 线在 r1 后落入 core_types/typeFact 域的在途 hunks，原样照录未触碰；v6 判词 r1→r3 的推进即其修复生效证据，与本线无涉）。

秒级门：system_link_exec_runtime.cheng × 车头 --emit:obj，修法一后 rc=0（/tmp/oob_ab/w134/w134_slink.o），修法二后 rc=0（/tmp/oob_ab/w134/w134_slink2.o，size=27431697）。零既有雷（本文件不在 HEAD 车头已知 parse 雷面）。

## 门禁实况（cwd=仓库根）

| 门 | r1 | r2 | r3 | 车头 cheng_w126（语义参照） |
|---|---|---|---|---|
| cold_nested | rc=2 `export root cheng_str_drop_owned not found`（provider.1） | rc=2 `export root _cheng_seq_str_add not found`（provider.3） | rc=1 `direct object emit: add plan undefined data symbol` | 0/0 `cold_nested_fmt_interpolation=pass`（w133 lead 档实录沿用，本轮未重跑） |
| ordinary_zero_exit | 0/0 | 0/0 | 0/0 | 0/0 |
| call_fixture | 0/1（契约预期） | 0/1 | 0/1 | 0/1 |
| zz_v6_w7（wall135 领地，只记录） | rc=1 `cleanup_cfg: cleanup source control cid invalid st=103 off=9 … fn=3 slot=[id=9 typeId=7 kind=1 storage=1 size=4 align=4] factIds=[16,17]` | rc=2 租约退避 8 次失败，无有效判词 | rc=1 `cleanup_cfg: return snapshot action authority missing`（wall135 在途修复推进所致） | 0/0 |

判词三轮推进轨迹（cold_nested，逐字）：
1. `cheng_cold: export root cheng_str_drop_owned not found`（r1，provider.1=core_runtime）
2. `cheng_cold: export root _cheng_seq_str_add not found`（r2，provider.3=program_support）
3. `direct object emit: add plan undefined data symbol`（r3，主对象符号表组装，provider 全过）

## diff 统计与交付

- **/tmp/oob_ab/wall134.patch**：当前树态 `git diff HEAD` 全树生成，13175 行，65 files +7825/−1197（含他线在途 hunks 原样照录）；`git apply --check --reverse` **PASS**（sha256=0a72371bb932a7d0705dedd6ce14a26007b078ccf8ad8e7481b5b12094ecafc4）。
- **本线增量=1 文件 2 hunks（+15/−6），全带 [wall134] 标记**：system_link_exec_runtime.cheng ①`SystemLinkExecRuntimeAddCoreRuntimeRoots` 删 str glue 两行列举+[wall134] 契约注释（修法一）；②`AppendProgramSupportRelocRoots` candidate 臂插入 key 归一 coldRootSpelling+[wall134] 契约注释（修法二）。同文件他人 hunks（wall118 ref glue 注释等）原样保留。
- 未 git commit、零分支/worktree；src/tests 零探针残留（本线未入仓探针）；临时产物全部收在 /tmp/oob_ab/w134/。
- 仓库根运行残档 `system_link_exec_provider.{0..5}.o*`（provider 编译现场 log/map/report，wall133 起累积、r2/r3 门禁更新）：**保留**给 r3 死点归属线复用（:4158 定性已可只读完成，但复现现场仍在），终了由最后一清线的任务清理。

## 移交事项（下一线）

1. **cold_nested 新死点（direct_object_emit.cheng:4158，授权面外）**：如上定性。修法候选=dataRelocTargetSymbols 循环镜像同文件 ：3995 relocTargetSymbols 循环的 `ObjectSymbolsFind >= 0 → skip` 谓词（主对象自身 defined 的 data reloc 目标不需要 undefined 行；AddUndefined defined 冲突返回 -1 是唯一死路径，undefined 重复幂等不死，已读 object_symbols.cheng:251-264 实证）。归属线注意：修后 cold_nested 判词预估进入链接/run 域（wallcensus CN-3 run 值语义），插值数据装配值错风险与修复同源。**本修面与本线两 hunk 零交集，可直接并行。**
2. **wall118 ref glue 同域隐患（同文件 :1793-1797，本线未动）**：`cheng_ref_drop_owned` / `cheng_ref_retain_owned` 定义唯一点同在 program_support_backend.cheng（:6390/:6398），core provider 源零导出——与修法一完全同构的错误提供者。当前未触发因 v6 死在 cleanup_cfg 更早处；v6 清墙走到 provider 编译时将复现 `export root cheng_ref_drop_owned not found`。修法与修法一同构（删除该两行列举，reloc 扫描臂已可覆盖）。归属线= v6 清墙线，届时同文件操作需与本线已合入 hunk rebase。
3. **wall133 移交债清账**：其移交事项 1（本墙）已由本线修法一+修法二关单；移交事项 2（core_types typeFact）wall135 线已接手且判词推进实证（r3 v6 判词变化）；移交事项 3（wall131 语义验证）仍待 v6 清墙。
4. **观测面待修**：`--debug-system-link-exec` 打点（:2580 等 `cmdline.ParamStr(2)` 条件）实测不触发（本轮排列 A/B 均零打点输出），provider argv/roots 无法现场取证；不影响正确性，观测债留给后续线（建议改由 plan 列显式落盘）。
