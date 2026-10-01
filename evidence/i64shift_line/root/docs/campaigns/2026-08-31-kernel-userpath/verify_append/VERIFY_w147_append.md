# VERIFY_w147_append.md —— kernel_driver_w2 战役 wall147 线（堆腐野写钉死线）

日期：2026-09-04 19:26–24:xx。工作目录=仓库根。硬约束遵守：src/core/**、src/std/**、docs/** 零触碰；零烤机；现存驱动二进制（kernel_driver_w143_r1）只读使用；未 commit、零分支/worktree；bootstrap/cheng_cold.c 只读未改（19:22 有并行线在途修改，本线未动它）。作业区 /tmp/oob_ab/w147/（13 个轮次脚本+输出全部留档）。复现基线：/tmp/oob_ab/VERIFY_w145_append.md + /tmp/oob_ab/w145/。

## 判定

**只诊断未修，授权面外，交修线 spec。** 任务书预设的「写者在 bootstrap/cheng_cold.c（C 冷链分配器）」不成立——cheng_cold.c 是车头 bootstrap 编译器主体，全文 grep 无 quarantine/分配器实现（`grep quarantine bootstrap/cheng_cold.c` 零命中）；崩链与根因面全部位于 `src/core/runtime/program_support_backend.cheng` 的编译产物（provider 域 fcc71913）+ libc realloc 大块复用行为的交互，属 src/core/** 授权面外。按任务书停手，spec 见 §四。

## 一、写者/机制定位链（观察点证据，全部基于 kernel_driver_w143_r1 + 关 ASLR 硬件观察点/断点过滤）

### 1.1 崩点复核（本轮 5 次独立运行全部复现，6 秒级，w145 结论维持）

- 裸跑（无 lldb）：rc=139 SIGSEGV（/tmp/oob_ab/w147/bare1.out，20:1x，树被并行线 gpuros 系列在途编辑闪烁时复测仍崩）。
- 崩点恒为 `cheng_cold_fcc71913_225 + 204`（=cheng_mem_header_size_get，program_support_backend.cheng:1733，`ldr w0,[x1]`），崩链 `cheng_free → cheng_free_locked(:5958) → cheng_quarantine_release_locked(:1939) → cheng_quarantine_ring_push_locked(:1901) → cheng_quarantine_evict_one_locked(:1879) → size_get(:1733)`，全帧符号化（provider.o.map）与 w145 一致。

### 1.2 野值定性改写（推翻 w145 的「0x81 恒定野值」认知）

- w145 的 0x8100000000000004 只是**残渣形态之一**。本轮 6 次崩样中 5 次崩值=**0xdddddddddddddde1**（8 字节 0xDD=chengQuarantinePoisonByte=221 的毒化填充模式），1 次（w145 存档）=0x8100000000000004。**野值不是常量，是「读到的陈旧内存内容」**——堆腐本质从「野写」修正为「**读到从未合法写入/已被历史毒化的槽**」。
- 数学对账：far=header+4（size 字段）→ header=0xdddddddddddddddd → 对应 quarantine ring entry 的 header 字段整 8 字节 0xDD。

### 1.3 排除法（每步独立运行验证）

1. **排除「free 收到野指针」**：轮 3 在 `cheng_free` 入口用 python 逐次过滤 x0（free_filter_w147.py），**87955 次 free 全部合法**（无 0x81/0xDD 前缀），崩在过滤循环内 → 野 header 不是 free 参数带来的。
2. **排除「栈上野写」**：轮 5 对 w145 指认的栈槽 0x173afe780 挂写观察点（watch_collect_w147.py，第 1 次 ParserOwnedTextRange 调用时武装），全程 26172 次 continue，**该槽仅 11 次合法写入（合法堆地址/0），零野值写入** → w145 的「GrowByteBuffer 槽被野写」定性不成立，崩值与该栈槽无因果关系。
3. **排除「运行期毒化越界写 ring」**：轮 11 在 `cheng_bytes_set`（fcc71913_255）入口过滤毒化调用（x1==0xDD）并校验目标区间 [x0,x0+x2) 与 ring [ring,ring+cap*16) 是否重叠（poison_check_w147.py），**全程 151161 次毒化调用零重叠**，崩在循环内 → ring 里的 0xDD 不是本次运行毒化写进去的。
4. **排除「push/evict/ptr_plus 记账或地址计算 bug」**：全量反汇编 cheng_quarantine_evict_one_locked（_235）、ring_push（_236）的翻倍/tail/entry 写段、cheng_ptr_plus（_206，纯 nil 检查+sxtw 加法）——与 .cheng 源逐句同构，head+1/环回、tail=head+len 单次减 cap、entry 写（[x2]=header、[x2+8]=payloadBytes）全部正确。
5. **排除「锁失效/重入并发」**：runtime 锁=os_unfair_lock 桥（core_runtime_provider_darwin.cheng:1074-1090，含 assert_not_owner 防重入 fail-stop）；单大栈 worker 串行；thread_create/file_handle 等锁外 free_locked 调用点与 worker 生存期不重叠。

### 1.4 决定性观测（轮 12/13）

- **轮 12（evict_seq_w147.py）**：断 `cheng_quarantine_evict_one_locked` 入口，逐次记录 (head,len,entry[head].header)：
  ```
  EV[32761..32767] head=32761..32767 len≈233912 hdr=0xae91c5220…0xae91cbe90（全部合法堆 header）
  EV[32768]        head=32768                 hdr=0xdddddddddddddddd   ← 崩
  ```
  **head 单步 +1 推进，前 7 个槽合法、第 8 个（=32768）是纯 0xDD 填充**。len=233912（注：首轮脚本把 len 误读在 +20 偏移，修正后 len 在全局 +24=0x10aa17370，nm 对齐）。
- **崩槽位置规律（5 轮独立运行）**：崩读槽恒为 **ring 历史容量边界槽**——16384（r10b/r13）、32768（r10c/r12）、65536（r9b）——即 **c_realloc 翻倍链上最近一次搬家的「旧块字节量拷贝边界」（16384×16=256KB、32768×16=512KB、65536×16=1MB）之后的第一批槽**。
- **综合机制**：ring_push 翻倍走 `c_realloc`（=libc realloc，rawbytes/system 的 @importc）。libc 对大块 realloc 搬新址时只拷贝旧块数据，**新块 [oldBytes, newBytes) 未拷贝区=libc 复用 freed 大块的陈旧内容**——其中混杂着历史 cheng 托管块被 quarantine 毒化（0xDD 填充）后的遗体（r10c 同区另见全 0 页，与轮 5 观测的合法值一致）。**push 的 tail 环绕推进尚未（可靠地）写过这些边界槽，head 窗口却已覆盖并读取** → evict 把毒化遗体当 header 读 → size_get(header+4) → SIGSEGV。w145 时代的 0x81… 值=同一机制下另一块复用内容，非独立 bug。
- **最后一步未钉死（如实申报）**：「tail 应当写过边界槽而 evict 读到遗体」还差一环——要么翻倍后首批 push 的 entry 写丢失/写到旧块，要么 len 窗口语义在翻倍边界有隐式错位。轮 13（evict_watch_w147.py）原计划对「head+1 槽」挂写观察点追踪最后写入者，但 lldb 硬件观察点 `SetEnabled(False)` 在多线程下未可靠拆除旧观察点，产生了 2 条陈旧地址误触发（addr=0xa49b06a90，写者 `__cheng_runtime_ptr_slot_store_raw+244`，值 0→0xa4704dad8，疑似其他 slot 更新），未能取得崩槽的干净写入者记录。**下一步实验设计见 §四.3。**

## 二、授权面判定

1. 崩链函数（cheng_free/cheng_free_locked/cheng_quarantine_*/cheng_mem_header_*）全部是 `src/core/runtime/program_support_backend.cheng` 编译产物；锁桥在 `src/core/runtime/core_runtime_provider_darwin.cheng`。均**授权面外**。
2. `bootstrap/cheng_cold.c`（118077 行）经 grep 证实**不含 quarantine/内存分配器实现**（无 cheng_free_locked/quarantine/ring 概念），非任务书预设的「C 冷链分配器」载体。**授权面内无可修点** → 按任务书第 3 条停手交 spec。
3. 修复验证门未执行（未修）；复现命令在当前树态下 rc=139 仍 5/5 复现（w145 基线+本轮 bare1 复测）。现存 8 代驱动产物不回收属预期。

## 三、修线 spec（移交）

**Bug 单**：quarantine ring（`src/core/runtime/program_support_backend.cheng` cheng_quarantine_ring_push_locked:1901 翻倍分支 + cheng_quarantine_evict_one_locked:1879）在 c_realloc 搬家后的「拷贝边界后陈旧区」被 head 窗口覆盖读取，毒化遗体被当 ChengMemHeader 解引用，6 秒级确定性 SIGSEGV（mode B：cleanup_cfg.cheng --emit:obj；mode A merkle JSON 同族）。属 findings.md:358 家族，但机制为「陈旧遗体读」而非「野写」。

**修法方向（优先级序）**：
1. **环不变量修复（根治，推荐）**：ring_push 翻倍分支搬家后重建窗口——把旧窗口 [head, head+len) 的 entry **顺序紧缩拷贝到新块 [0, len)**，置 `ring_head=0`，再继续本次 push。使「未拷贝陈旧区」永远落在窗口外，任何复用遗体不可达。改动量：翻倍分支内一次 O(len) 搬移，预算记账不变。
2. **防御诊断（辅助）**：evict 读 entry->header 后先查毒形态（高 32 位==0xDDDDDDDD 或 `cheng_mem_header(p)==nil`），命中走 `cheng_runtime_lock_abort("quarantine ring stale slot")` 携 entry 索引/head/len 直出——把 SIGSEGV 变确定性诊断，杜绝野读。
3. **定位补全（若需写者级证据）**：用「翻倍后第一批 push 的 entry 写回读校验」（断 push 的 +1548 写完成点，回读 entry->header==入参 header）裁决「写丢失 vs 事后改写」；lldb watchpoint 需确认 SetEnabled 后硬件观察点真拆除（本轮 r13 的误触发教训），或改用单步窗口。
4. **验证门**（修复后执行）：wall145 复现命令连续 20 轮零崩溃；最新 2 代 kernel 驱动重编后复现消失；ordinary 夹具 × 重编车头 0/0 不回归； quarantine 语义门（rc=70 毒化报告路径）不回归。

## 四、作业区留档（/tmp/oob_ab/w147/）

| 文件 | 内容 |
|---|---|
| watch_drive_w147.py / r1-r2_watch.out | 轮1-2：槽 0x173afe780 首版观察点（噪音测量） |
| free_filter_w147.py / r3_free.out | 轮3：87955 次 free 零野参数+首见 0xDD 崩值 |
| ensure_filter_w147.py / r4_ensure.out | 轮4（中止）：ensureCapacity 逐停过滤（太慢弃用） |
| watch_collect_w147.py / r5_collect.out | 轮5：槽 0x173afe780 全程 11 写全合法，零野写 |
| watch_ring_w147.py / r6_ring.out | 轮6：ring[100] 首版（观察点随 realloc 搬家失配；旁证 bytes_set 曾写 ring 槽域） |
| watch_ring2_w147.py / r7_ring2.out | 轮7：崩时 ring 全扫描无 0xDD（脚本漏 SetAsync，dump 仍有效） |
| watch_ring3_w147.py / r8-r9b.out | 轮8-9b：修 SetAsync+SIGSTOP skip；r9b 完整崩时快照（寄存器/帧槽/ring 毒化区） |
| watch_ring4_w147.py / r10-r10c.out | 轮10：ring[65536] 观察（暴露 lldb 入口挂 watch 不武装后建线程问题→改 worker 首跳断点挂） |
| poison_check_w147.py / r11_pchk.out | 轮11：151161 次毒化调用与 ring 零重叠 |
| evict_seq_w147.py / r12_evseq.out | 轮12：evict 序列，head 32767→32768 崩、32767 槽合法 |
| evict_watch_w147.py / r13_evw.out | 轮13：head 推进尾段+崩槽边界规律确认（watch 陈旧误触发教训在案） |
| bare1.out / cache/ | 裸跑复现 rc=139 复测 |

树态记录：本线零写入仓库；并行线在途编辑（gpuros_probe*.cheng、bootstrap/cheng_cold.c）曾造成 r8/r9 两次 lldb 会话内 csg 门瞬态拒绝（裸跑复测正常），不影响证据有效性。
