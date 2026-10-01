# VERIFY_gen2_selfbake_regression_append.md —— GEN2 自烤阻断回归诊断（PHASEB-PARSER 续线）2026-09-07

诊断现场：主树现态（parser_w2 已被主线程吸收，parser.cheng md5=b5b79714 含 marker×6）GEN2 自烤全断。工作变体均在 pb_parser/.w/（bv0/bv3/bv4 + g2_* 头）。

## 一、结论先行

**本案交付的 phaseb_parser_w2.patch 经三重实证排除肇事**：
1. H_bv0（主树回退我的 5 文件 patch，`/usr/bin/patch -R -f` 逐文件 md5 核实全撤）自烤同样 900s 超时 rc=124；
2. m0906 驱动（9/6 晨烤，**早于我的 patch 存在**）自烤 rc=125 `compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=1123222944 limit=1073741824`（378s）；
3. A/B 同负载背靠背：cheng_w126 头 231s rc=0 vs main-now 头 901s rc=124——回归在合并态编译器代码，与 patch 无关。

**失败真实形态（本案实测）**：不是 34s 的 import edge 判词，而是 **RSS 超 1GiB 铁门 + parse 相巨慢**。PARSE-PERF 的 34s 判词在本案所有驱动（w126/m0906/g2_main/g2_bv0/bv3）上均未复现，其驱动烤自何态需该线回答。

## 二、实证链

1. **RSS 曲线**（m0906 头 + CHENG_PARSER_DEBUG=1，按分采样）：60s=305MB → 120s=441 → 180s=503 → 240s=637 → 300s=830 → 360s=1053MB → ~380s 撞 1073741824 铁门 rc=125。单调涨、无相间释放。
2. **死亡相态**：debug log 35.4 万行全是 `debug_parser=*`（parse 相），至死未见到 w126 完成态日志的 CVOG/rvL codegen 行——**parse 相就吃掉 >380s 与 >1GiB**（w126 全程 231s 含 codegen）。
3. **死亡点 stage**：slice_copy_enter ×93814 / split_into ×880 / source_exists_enter ×4824——**closure 的 import 边收集**（逐源 exists + 逐行切分 + 切片入 arena）。
4. **vmmap**（100s 时）：VM_ALLOCATE（cheng arena 段）413MB/158 段为主，MALLOC 合计 ~230MB；后段采样热点 = **runtime/program_support_backend.cheng 的内存注册表/账本**（provider.o.map 破译：cheng_mem_registry_insert_into :1454 / _grow :1474 / _hash :1427 / cheng_allocation_ledger_slot_at :3831）+ `__cheng_runtime_ptr_slot_load_raw/store_raw` 热循环 + 主线程 `__ulock_wait`（注册表锁串行化）。
5. **gen2p1（通过世界）→main 全树 md5 盘点**：src 层仅 8 文件差异 = 我的 5 文件 patch + WHENBLOCK 三件（typed_expr 4 行 / backend2_lower_stmt ~78 行 / primary_object_plan ~60 行）。bootstrap C 零差异。

## 三、归因排除矩阵（烤头+900s 自烤实测）

| 变体 | 内容 | 结果 |
|---|---|---|
| cheng_w126 头 × main 根 | wall126 代 | 231s rc=0 ✓（同负载对照成立） |
| m0906 头 × main 根 | 9/6 晨合并态（pre-两套 delta） | **378s rc=125 rss_limit**（复现 2/2，另一次 >800s 未死——峰值有时序漂移） |
| g2_main 头 | main 现态全量 | 901s rc=124 |
| g2_bv0 头 | main − 我的 patch | 901s rc=124 |
| bv3 头 | main − WHENBLOCK 三件 | 901s rc=124 |
| bv4 头 | parser=HEAD 已提交版 + 其余主树 | 烤制即败：receipt 引用新枚举与 HEAD parser 不兼容（构造作废） |
| bv6 头 | parser/receipt/schema=gen2p1 版（剥 wall154+WAVE2+mine 全部在途 parser hunks），其余主树 | **901s rc=124** |
| bv7 头 | typed_expr/bridge=gen2p1 版（剥 WAVE2 在途 typed/bridge hunks），其余主树 | **901s rc=124** |

## 四、嫌疑收敛与下一步

**归因终态（bv6/bv7 后）**：在途 hunks 全线排除（我的 patch、WHENBLOCK 三件、wall154+WAVE2 parser hunks、WAVE2 typed/bridge hunks——各自独立回退均不救，两两组合亦慢）。矛盾闭环指向未变量化轴：
- **D1 root 内容 × 车头 plan 代码交互**：全部自烤用 --root=主树根（含 gen2p1 没有的 src/game/*、src/apps/* 等新源，19k 新文件）；PARSE-PERF 判词 edge index=53 说明其失败 plan 是小闭包，而本案实测 closure 探测 4824 源——车头代际间 plan 收集范围行为可能已变。下一步首试：g2_main 头 × root=gen2p1 克隆（小根）计时对照 + 主根上 w126 vs m0906 的 plan 收集源数对质。
- **D2 wall126→HEAD 已提交窗口**（在途全剥仍慢的残余解释）：需按提交 bisect（每轮烤+测 ~15 分钟）。
- **D3 mem_registry 观察者效应**：自烤 workload 数百万活分配 × 注册表记账（hash+insert+grow+锁）即 RSS/CPU 大头之一，属 memory-time-limits 线设计域。
- PARSE-PERF 34s 判词未复现：其驱动哈希与烤制树态需该线提供后对质。

已排除：我的 patch、WHENBLOCK 三件（各独立回退不救）。剩余嫌疑（互斥待 bv4 判）：
- **A**：在途 parser hunks 的 wall154/WAVE2 子集（bv4 快即坐实，再按子集二分）；
- **B**：typed_expr/bridge 在途 hunks 或 wall126→HEAD 已提交 delta（bv4 慢即转向）；
- **C**：mem_registry/账本本身——`docs/memory-time-limits-plan.md` 线引入的注册表在自烤 workload（数百万活分配）下记账成本 + 槽表内存就是 RSS 大头，属该线设计债（观察者效应），需其 owner 裁定降耗方案（fail-closed 不允许放松 1GiB 门）。

旁证：PARSE-PERF 线的 34s import-edge 判词与本案 RSS/慢垒失败形态不同，二值是否同根待其驱动哈希对质；`std/result` vs `cheng/std/result` 形态差（ParserSourcePathToModulePathWithExternalPackageRoots 边侧 vs SourceRowIdentityInto 行侧）为独立待核点，当前主树代码两函数均无在途 hunks。

## 五、纪律

零 commit、零分支；变体均为 pb_parser/.w/ 下一次性拷贝（bv0/bv3/bv4）；主树零接触；每轮烤机 owner 协议遵守（轮次目录入克隆 .w/）。
## 六、静态对账（PARSE-PERF 对质包回复，2026-09-07）

**当前主树态两侧字面实测推演（src/std/result.cheng，workspaceRoot=主树根，packageId=pkg://cheng→cheng）**：
- 边侧 ParserSourcePathToModulePathWithExternalPackageRoots：builtin 分支（ParserSharedBuiltinSourceRoot(workspaceRoot)=workspaceRoot，CHENG_ROOT 未设时）stdPrefix=\<root\>/src/std/ 命中 → **返回裸 std/result**。
- 行侧 SourceRowIdentityInto → WithinRoots=yes → ParserSourcePathToModulePathExactWithExternalPackageRootsInto：owner=packageRoot(id=cheng)，rel=std/result，**显式特支（ownerPackageIds==cheng && rel 以 std/ 开头 → 剥 cheng 前缀）→ 返回裸 std/result**。该特支与 Exact 函数自 Initial commit(f681cad2b) 即在，已提交史从未变。
- ParserSharedBuiltinModulePathToSourcePath 双形接受（std/ 与 cheng/std/ 均回源）——裸 std/ 形即规范形。

**裁决=②当前态已匹配**。它方 21:00 头的失配来源排除已提交代码后，最大嫌疑=**CHENG_ROOT 环境门**：ParserSharedBuiltinSourceRoot 优先读 $CHENG_ROOT，若其 diag 运行携带指向无 /src/std/ 的 CHENG_ROOT，边侧 builtin 分支脱靶、外部根分支产出 std-id/rel 形而行侧不同 → 34s 判词。请 PARSE-PERF 回答其 diag 运行 env（CHENG_ROOT 是否设置/指向）。本案全部自烤运行 CHENG_ROOT 未设。
## 七、D1 判别执行结果（2026-09-07，2x2 矩阵补格）

| 头 \ 根 | main 根（含 game/apps 新源） | gen2p1 根（旧小根） |
|---|---|---|
| cheng_w126 头 | 231s rc=0 ✓ | **222s rc=0 ✓** |
| main-now 头（g2_main，重烤 sha 见 .w/g2_main） | 901s rc=124 | **901s rc=124** |

**裁决：D1（root 内容）排除。** merged 头在旧小根上同样 >900s，w126 头在新大根上同样 231s——纯车头编译器代码回归，与 root 态/新源无关。活性唯一=D2：wall126→HEAD(759062096) 已提交窗口 bisect（每格=烤头+900s 自烤 ≈18 分钟；建议按 git log 提交簇粗分后再细二分）。D3（mem_registry 记账降耗）与 CHENG_ROOT 环境门对质（§六）维持原路由。
## 八、D2 bisect 执行记录（粗分轮，2026-09-07）

窗口 69817b8b2..HEAD(759062096) 仅 5 提交，代码 delta 实际=**73debaef2 巨型检查点**（唯碰 program_support_backend/system_link_plan/registry 簇）+ 桌面两提交（1147b0410/759062096）+ docs（361df718c 仅 progress.md、78d04df86 纯 docs）。粗分塌缩为两格：
- start=69817b8b2（w126 代，预期过）
- cell1=73debaef2（registry/closure 嫌疑簇，预期慢）

执行口径修正记录：首跑误用 --root=主树（新旧版本 skew：旧头解析不了在途新语法，rc=2 判词无效作废）；已修正为**自洽 root**（各 cell 头测各自树，= GEN2 自烤本义）。修正后两格结果见文末补记（脚本 .w/d2_cell1.sh 自主运行，日志 .w/d2_start/self.log、.w/d2_cell1/self.log，判罚口径=900s 自烤 rc：124 慢/未完、0 过、125 守卫）。
若 cell1 慢坐实：归因=73debaef2 引入，其 diff 内 mem_registry/ledger（program_support_backend）+ closure/plan（system_link_plan）段即肇事段，修复派发 memory-time-limits 域（D3 并案）；若 cell1 过：回归在桌面两提交的 src 改动或 69817b8b2..HEAD 非代码因素，转主线程会诊。
## 九、D2 修正口径终态（2026-09-07）

自洽 root 两格实测：start(69817b8b2) rc=2@74s、cell1(73debaef2) rc=2@69s——**git archive 导出的提交树无法自烤**（自身 ownership_body_ir_production.cheng parse 失败：历史构建全部出自含未跟踪/在途件的工作树，纯提交树缺件不 backed）。**archive 式提交 bisect 判无效，D2 以此口径终结**。可行续路：
1. PARSE-PERF 驱动哈希+其 21:00 冻结工作树（parseperf_base 世界=工作树快照非 archive）对质——那是唯一可复现历史失败态的在案世界；
2. D3 mem_registry 记账降耗（memory 域）——与引入点无关地压 RSS/CPU 大头；
3. 快照纪律：此后检查点烤头须绑工作树快照（本案教训入 m10 协议修订）。
