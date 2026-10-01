# VERIFY_w145_append.md —— kernel_driver_w2 战役 wall145 线（Phase C 开工地基）

日期：2026-09-04 18:16–19:3x。工作目录=仓库根。硬约束遵守：src/core/** 与 docs/ 零触碰、零烤机、既有驱动二进制只读使用、未 commit、零分支/worktree。授权面内新文件仅 `tools/cheng_mem_protocol.sh`；作业区 /tmp/oob_ab/w145/。

## 判定

**两件均有实质交付：**
1. **C-0 测量地基脚本化完成**：`tools/cheng_mem_protocol.sh` 落盘（10 条测量协议内建、自检明确报错、自测两轮）。
2. **堆腐定谳复现重大突破**：csgJsonParse 释放路径野 header SIGSEGV 已从「2 次/日非确定性」变成 **6 秒级确定性复现**（每轮必崩、三份 dump 崩溃链 PC 级一致、野值槽地址与野值逐一致 `0x8100000000000004`，周边合法堆指针随轮正常随机化），全帧符号化到源行，并用现存 8 个各代 kernel 驱动完成 A/B（全崩，引入点 ≤09-03 树态）。**只诊断未修**，定性 spec 见下，可直接交修线。

---

## 一、C-0 测量地基：tools/cheng_mem_protocol.sh

### 用法

```
tools/cheng_mem_protocol.sh --driver BIN --fixture PATH.cheng [选项]
  --rounds N         编译轮数（默认 1；性能信用需 --median 且 >=5）
  --median           静窗中位数口径（rounds 强制 >=5，否则自检报错）
  --tag S / --out-dir DIR / --expect-sha HEX / --emit exe|obj
  --interval SEC     进程树 RSS 采样周期（默认 0.2）
  --lease-retries N  parent lease 退避上限（默认 8×45s）
退出码: 0=全绿 1=字节门破 2=编译/运行失败 3=环境自检失败 4=OOM 守卫 5=信号崩溃
```

### 协议 checklist 10 条 → 脚本内建映射（phase_c_recon §三）

| 协议 | 实现 |
|---|---|
| 1 cwd=仓库根 | 脚本按自身位置定位 repo 根并 cd（`REPO=$(dirname $0)/..`），报告打 `cwd=` |
| 2 四 env 同禁 | 固定 export `BACKEND_INCREMENTAL=0 BACKEND_MULTI_MODULE_CACHE=0 CHENG_DISABLE_PRIMARY_OBJECT_CACHE=1 CHENG_DISABLE_COLD_OBJECT_CACHE=1`，无旁路 |
| 3 任务级缓存根 | 每轮独立 `CHENG_COLD_OBJECT_CACHE_ROOT=<轮目录>/cache`，不跨任务 |
| 4 1GiB 帽双守卫 | `CHENG_PROCESS_MAX_RSS_BYTES=1073741824` + 外部采样器整树轮询超限 KILL（落 `OOM` 旗、类 `OOM_GUARD`、退 4） |
| 5 RSS 双口径 | 外部 200ms 进程树采样（含 cc/ld 子进程，可回落，csv 曲线+peak/median）+ `/usr/bin/time -l` ru_maxrss（仅驱动进程高水位；本机实测该值单位为字节，标签 `ru_maxrss_raw`）；report 相级 rss 键（如 `compiler_csg_rss_bytes`）一并对账打印 |
| 6 字节铁门 | 各轮**同名 --out**（`cheng_mem_gate.bin`），逐轮 sha256，轮间全 EQ；`--expect-sha` 可再对预期值；不等→退 1 |
| 7 静窗中位数 | `--median` 强制 ≥5 轮取中位数；启动时 `find src tools bootstrap -mmin -10` 判静窗，不静则报告打 `TREE_NOT_QUIET(...性能信用无效)` |
| 8 租约退避 | `parent lease unavailable` → 45s 退避重试，上限 `--lease-retries` |
| 9 毒化网 | 记录 `quarantine=L1_default_on(驱动内建)`；rc=70 → `POISON_HIT_rc70`、stderr 0xDD → `POISON_HIT_evidence` |
| 10 产物纪律 | 全部落 `--out-dir`（默认 mktemp 任务目录）；stderr 独立落盘 `.compile.err`；src/ 零残留 |

### 自检（明确报错，退 3）

实测五条路径全过：无驱动、无夹具、驱动不可执行、夹具不存在、`--median --rounds 3`（提示「协议 P7: 性能信用需 >=5 轮中位数」）。注：沙箱里 `/bin/true` 不存在属环境态，非脚本缺陷。

### 自测实况（现存驱动 w143_r1，真实产出样例报告）

- **自测 B（崩溃分类路径）**：`--fixture src/core/analysis/cleanup_cfg.cheng --emit obj`。最终样例 `/tmp/oob_ab/w145/selftest_crash2/mem_protocol_report.txt`：`round=0 compile_rc=139 class=TARGET_SIGNAL_CRASH(rc139)`、`tree_rss_kb peak≈98MB/median≈78MB`、`ru_maxrss_kb≈96.9MiB`、`exit_status=5`——即本次自测顺带**第三次独立确证了堆腐 SIGSEGV（裸跑 rc=139）**，且脚本把它如实归类退 5。首轮自测（selftest_crash，19 时前后）曾遇并行线在途 `@borrows` 注解挡门（csg 拒 `duplicate @borrows`），脚本当时如实 `COMPILE_FAIL`，并暴露两个脚本缺陷（COMPILE_FAIL 误退 0、case 未匹配 `(rcNNN)` 后缀），已当场修复并把轮级 class 写入报告文件——**自测过程即完成了脚本诚实性的闭环验证**。静窗检测亦实测（曾报 `TREE_NOT_QUIET(6个文件10分钟内有改动)`）。
- **自测 A（green 全冷样例，全绿）**：`ordinary_zero_exit_fixture` 全冷 exe 一轮（`/tmp/oob_ab/w145/selftest_green/mem_protocol_report.txt`，2026-09-04T11:17Z）：`compile_rc=0 run_rc=0 wall_s=257s class=OK`；**树 RSS 峰 777536KB=759.3MiB / 中位 567328KB**（0.2s 采样，1036 点曲线 `round_0/rss.csv`）；`ru_maxrss_raw=795459584`；out sha256 `62b8f35f…c323e2da`；相级对账（compiler_csg 10.5MB / lowering_plan 68.0s / total 253.0s）。静窗=NOT_QUIET（并行线活跃，性能信用按协议不给）。**附带测量发现**：macOS `/usr/bin/time -l` 的 maximum resident set size 本机实为**字节**（795459584B=758.5MiB，与进程树采样峰值吻合），脚本标签已改 `ru_maxrss_raw` 并注明。

---

## 二、堆腐定谳复现侧（只诊断，未修）

### 2.1 复现命令（确定性，6 秒级）

```bash
cd /Users/lbcheng/cheng-lang
env -i HOME=$HOME PATH=/usr/bin:/bin:/usr/sbin:/sbin \
  BACKEND_INCREMENTAL=0 BACKEND_MULTI_MODULE_CACHE=0 \
  CHENG_DISABLE_PRIMARY_OBJECT_CACHE=1 CHENG_DISABLE_COLD_OBJECT_CACHE=1 \
  CHENG_ENTRY_CACHE=0 \
  CHENG_COLD_OBJECT_CACHE_ROOT=<任务级新目录> \
  CHENG_PROCESS_MAX_RSS_BYTES=1073741824 \
  /tmp/oob_ab/w143/kernel_driver_w143_r1 system-link-exec \
    --root:/Users/lbcheng/cheng-lang \
    --in:src/core/analysis/cleanup_cfg.cheng --emit:obj \
    --target:arm64-apple-darwin --out:<out> --report-out:<report>
```
lldb 下实测约 6 秒停于 SIGSEGV（本轮 5/5）；**裸跑实测同样 SIGSEGV（rc=139，19:2x 经协议脚本自测确证）**。复现套壳脚本：`/tmp/oob_ab/w145/single_b_run.sh`（内置 `-k` 崩溃倾倒模块 `/tmp/oob_ab/w145/lldb_crash_dump.py`：全线程回溯+寄存器+野值栈扫描+堆寄存器扫描）。

### 2.2 死点与崩溃链（全帧符号化，依据 kernel_driver_w143_r1.primary.o.map）

野 header 读点 = `cheng_mem_header_size_get`（program_support_backend.cheng:1733，读 header+4），`EXC_BAD_ACCESS KERN_INVALID_ADDRESS at 0x8100000000000004`，发生在 `BackendDriverDispatchMinSystemLinkExecOnLargeStack`（backend_driver_dispatch_min.cheng:7008）大栈 worker 线程。两条等价触发变体：

**变体 α（mode B 确定性主形态，本轮全部样本）**——CSG 构建段 parser 缓冲扩容释放：
```
main → RunCommand → ExecuteFormalRequestInto → SystemLinkExecOnLargeStack (backend_driver_dispatch_min.cheng:7008)
→ compilerCsgBuildConsumeWithOverridesCoreInto (compiler_csg.cheng:38299)【更正 2026-09-10 实读：旧写 `:37943` 已漂移，`fn compilerCsgBuildConsumeWithOverridesCoreInto(` 现址 `:38299`（`:37943` 现落 `compilerCsgBuildTypedIrReachRoundPrepare` 的 `return false`）】
→ compilerCsgBuildOrderedSourceProfilesRec (compiler_csg.cheng:36483)【更正 2026-09-10 实读：旧写 `:36202` 已漂移，`fn compilerCsgBuildOrderedSourceProfilesRec(` 现址 `:36483`（`:36202` 现落 `CompilerCsgLinkPlanOwnershipLeaseCommit`）】
→ ParserSplitCharInto (parser.cheng:34038)
→ ParserBuildExprCallProfileExactInto (parser.cheng:27995)
→ parserBuildExprCallProfileSyntaxInto (parser.cheng:27871)
→ ParserOwnedTextRange (parser.cheng:2068)
→ buffer.AppendByte (buffer.cheng:129)
→ byteBufferEnsureCapacity (buffer.cheng:29)
→ rawbytes.BytesFree (rawbytes.cheng:106) → system.Free (system.cheng:535)
→ cheng_free_locked (program_support_backend.cheng:5958)
→ cheng_quarantine_release_locked (:1939) → cheng_quarantine_ring_push_locked (:1901)
→ cheng_quarantine_evict_one_locked (:1879) → cheng_mem_header_size_get (:1733)
→ SIGSEGV @0x8100000000000004
```
崩点栈槽实况（v3 dump）：GrowByteBuffer 槽 `{data.ptr=0x8100000000000000, Bytes.len=4, buf.len=0}`——**野值已在 buf.data 里，ensureCapacity 是受害者不是写点**。

**变体 β（mode A ordinary 全量语境，w117 09-03 .ips 同形）**——merkle bootstrap JSON receipt 解析释放：
```
→ snapshot_bridge.compilerSnapshotLoweringBridgeMerkleBootstrapAtInto (compiler_snapshot_lowering_bridge.cheng:2186)
→ snapshot_cargo.CsgCompilerSnapshotCargoMerkleApply (:3213) → csgCompilerSnapshotCargoMerkleExecute (:3139)
→ merkle_transaction.CsgCoreMerkleTransactionPlanStore (:2735) → csgTransactionBuildPreparedStore (:2787)
  → csgTransactionBuildOperations (:1269) → csgTransactionFactIndex (:1239) → csgTransactionFactKey (:1137)
→ merkle_dag.CsgCoreMerkleFactKey (:433) → csgMerkleCanonicalizeFact (:389)
→ canonical.CsgCoreJsonCanonicalize (json_canonical.cheng:1032)
→ csgJsonParseValue (:740, 递归) ← csgJsonParseNumber (:659) / csgJsonCanonicalNumber (:537) / csgJsonSignedAddSmall (:438)
→ cheng_mem_release / cheng_free → SIGSEGV @0x8100000000000004
```
两变体与 memline2b 在案两份 .ips（04:19 cheng_free←csgJsonParseString 族、04:36 cheng_mem_release←csgJsonParseValue 族）**逐帧同构**，确系同一 bug。

### 2.3 野值定性（本轮新实证）

1. **野值恒定**：`0x8100000000000000` / `0x8100000000000004` 两值，跨 09-03 w117 两份 .ips 与今日 5 份 w143_r1 dump 完全一致；二进制常量池**无此 8 字节模式**（字节搜索 0 命中）→ 运行期产生。
2. **崩点线程栈下沿有 11 个连续野 qword**（0x173afe780–0x173afe7e8，三份 dump 地址级一致；lldb 关 ASLR 效应使栈地址跨轮稳定）：一段已被更早（已返回的）更深调用填满 `0x8100000000000004/00` 重复模式的栈区残迹——即野值**源写入者**的脚印，其身份待修线钉死。
3. **分配器关键推理（本轮新定性）**：崩在 quarantine evict 重扫链而非 `foreign pointer` 干净 abort（program_support_backend.cheng:5958 区），说明 `cheng_mem_header(野p)` 返回了非 nil——**野 payload 在 cheng_mem_registry 在册，即它是分配器自己签发并登记过的**。c_malloc/mmap 皆不可能回 0x81 前缀地址 → 签发野值的只剩两类通道：(a) ledger slab 元数据（如 `slab->baseRaw`，:5150 区）被覆盖为 0x8100000000000000 族值后，该 slab 后续所有分配全部变野（一锅端，与栈上 11 处野对象并存的现象吻合）；(b) alloc 返回值物化的幽灵槽读（返回 x0 被从错误栈槽取回）。两通道同属「编译产物写错槽」家族，exact 指令待修线用观察点钉死。
4. **在案家族同形**：findings.md:358「gen3 野写在猎——internPool resolved callTargetSourcePath str 头 data 指针被 **CSG 构建段**野写改脏，最小复现 `import std/strutils`+`--emit:obj` ~5s 必炸」（2026-07-20，未钉死确切指令后挂起）；findings:2279「条件区域内写的 spill 槽被无条件 use 按名复用，陈旧栈垃圾填槽」（wave-36 已修纯发射器一例）；w143 卷 buffer.cheng 头注释自述的「直接写 .data 不同步 .len → 下次 Append 读越界/空指针崩溃」语义雷区。本轮=**同族在冷链（cheng_cold_* 对象）的新复发**。

### 2.4 代际 A/B（现存二进制，零烤机）

同 mode B 夹具 × 8 个现存 kernel 驱动：**w126br3/w136_r1/w137_r1/w138_r1/w139_r1/w140_r1/w141_r5/w142_r1 全部 CRASH**（`/tmp/oob_ab/w145/ab/CRASH_ab_*.txt`）。结论：引入点 ≤ w126br3 树态（09-03 深夜）。更早驱动（now5…w125 系）已被 /tmp 清理回收，**现有二进制无法再收窄**；memline2b 指认的 09-02 16:07+ 窗（ chief suspect=merkle_store_codec W1 memo diff）与全部证据相容。git 考古不可行：仓库提交粒度粗（update 大粒度提交），无逐 hunk 可分界。

### 2.5 修线移交（定性 spec 结论）

1. **修法方向**：这是**编译产物栈槽身份错乱**（幽灵槽读/写、spill 槽支配复用家族）在冷链代码里的复发，不是 merkle/json 业务逻辑 bug，也不是分配器/毒化网逻辑 bug——quarantine 链本次是**正确的探测器**（拦野 free 时在 header 重扫处崩）。修点应在冷链发射器（cheng_cold.c a64/sret/返回值物化与 spill 槽支配）或触发其边界的源形态；不许用业务层绕过（buffer/parser 加防御性拷贝=掩盖）。
2. **快速迭代钥匙（本线最大移交价值）**：mode B 6 秒确定性复现 + lldb 栈地址跨轮稳定（0x173afe780）→ 修线可在**不烤机**前提下用硬件观察点钉死写者：在 `ParserOwnedTextRange` 入口断点命中后对 buf 槽地址下 `watchpoint set expression -s 8 -- 0x173afe780`（或对该深度的栈区/`slab->baseRaw` 字段下 watch），第一处写入即写点；辅以 `symbolicate_frames.py`（/tmp/oob_ab/w145/，输入帧符号清单输出源:行）做帧归因。另可验「slab 一锅端」假说：在 cheng_allocation_ledger_slab_create_locked 返回后检查 baseRaw，或统计 registry 中 0x81 前缀 payload 数量。
3. **疑似触发形态**：buffer.cheng GrowByteBuffer（近期做过 `.data`=容量语义重设计）+ parser.cheng `ParserOwnedTextRange` 的逐字节 AppendByte 循环 + @importc/@exportc 边界（cheng_malloc 返回值物化）三者交集；W1 memo diff 若为诱发方，机制是「改变这些函数的编译形态/栈布局」而非其逻辑有错。
4. **证据包**：`/tmp/oob_ab/w145/repro/CRASH_w143_{1,2,3}.txt`（loop 三连崩，崩溃链 PC 级一致、野值槽逐一致）、`single_v3/lldb.out`（带野值槽十六进制）、`ab/CRASH_ab_*.txt`（8 代驱动）、`lldb_selftest*.out`（倾倒模块自证）、`memline2b/crash_evidence/*.ips`（09-03 原始物证）；解析工具 `lldb_crash_dump.py / lldb_wildcatch.py(半成品) / symbolicate_frames.py / repro_heap_loop.sh / ab_bisect_drivers.sh / single_b_run.sh`。
5. **诚实边界**：未抓到写点指令（wildcatch 条件断点方案因逐 free 求值过慢弃用，模块保留）；mode A 变体正在解析的 JSON receipt 源文本未及取出（下一次可在 dump 的 json-source-hunt 段补挂）；野值源写入者身份未定谳——2.5.2 观察点方案是既定下一步。

---

## 三、树态记录（供各线自取）

1. **并行线在途编辑曾闪烁、现已修复**：`src/std/buffer.cheng`(+5)/`seqs.cheng`(+8) 的重复 `@borrows` 注解 17:26 起分批落树（17:26 seqs:235 挡 aes 形夹具 → 18:5x 轮到 buffer.cheng，期间所有 std-importing 夹具被 csg 门拒），本卷撰写期间（19:2x 前）已被该并行线修复，树恢复可编译。本线全部崩溃证据（18:31–18:52）取自注解落地前后均有效——w117 09-03 已崩，早于注解数日，二者无关。
2. **租约高 contention**：w144（probe_run.sh 长跑）、w146（r1 烤机+门禁）、gpu-render-cold 等多线并发，`parent lease unavailable` 退避 45s×N 为标配；另有混版本驱动并发互造 `immutable Cargo HEAD mismatch`（memline2c §6 预警应验，本线 loop 已把该错纳入退避类）。
3. 本线对树零写入；protocol 脚本为授权面内唯一新文件；全部临时产物绑 /tmp/oob_ab/w145/。
4. **入库提示**：`.gitignore:325` 规则 `*.sh` 会忽略新脚本（仓库 774 个既有 .sh 是先追踪后加规则的，不受影响）——正式落卷时需 `git add -f tools/cheng_mem_protocol.sh`。
