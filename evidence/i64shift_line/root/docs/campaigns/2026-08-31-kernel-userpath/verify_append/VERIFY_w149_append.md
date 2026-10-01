# VERIFY_w149_append.md —— kernel_driver_w2 战役 wall149 线（quarantine ring 翻倍陈旧遗体槽读修复线）

日期：2026-09-04 21:15–22:xx。工作目录=仓库根。授权面=src/core/runtime/program_support_backend.cheng（wall142 系旧领地空闲），零越域、零 commit、零分支/worktree。作业区 /tmp/oob_ab/w149/（基线复现、双轮烤机、反汇编、门禁、轮询脚本与输出全留档）。修复依据=wall147 十三轮定谳 spec（/tmp/oob_ab/VERIFY_w147_append.md §三）。

## 判定

**根治 + 辅防已落地并烤机验证：wall145/147 的 6 秒级确定性 SIGSEGV 复现（w143 驱动 5/5 必崩、本轮 w143 3/3 + w148 1/1 必崩）在 r2 驱动上同命令同夹具完全消失，且 r2 是第一代能活着穿过该雷区（csgJsonParse 释放路径）走到后续阶段的驱动。** cleanup_cfg ×20 rc=0 铁证门当前被并行线在树缺陷（src/std/buffer.cheng 双 @borrows，16:33 起在树）阻塞在 csg 阶段 rc=2，与本修复无关（见 §四），已设轮询自动接力。

## 一、实现（src/core/runtime/program_support_backend.cheng，2 hunks，+63/-4）

按 wall147 spec 逐条落地，全部在授权面内：

1. **根治（翻倍紧缩拷贝，ring_push_locked 翻倍分支）**：翻倍禁走 `c_realloc`（libc 大块搬家只拷旧字节，拷贝边界 [oldBytes,newBytes) 是复用 freed 大块的陈旧遗体区，wall147 定谳根因）。改为 `c_malloc` 新块 + 旧窗口 [head, head+len) 环形展开逐 entry（16B/cheng_bytes_copy）紧缩拷贝到新块 [0, len) + `ring_head=0` + 旧块 `c_free`。不变量：窗口恒为已写槽，未拷贝陈旧区永远落在窗口外，任何复用遗体不可达。新旧块不重叠无别名。malloc 失败（仅 libc OOM）保留旧块走强制淘汰一格，与原 realloc 失败语义一致。**关键实现纪律：旧块指针以 `uint64 raw` 快照携带（`cheng_mem_registry_grow` :1479/:1546 同款，注释明言 pointer values never borrows）——r1 烤机实证指针型 local 从全局赋值会被后端物化成 `&global` 别名（见 §二），uint64 携带是既有树内唯一可靠形态。**
2. **辅防（evict 毒形态 fail-stop，evict_one_locked）**：读 entry->header 后、解引用前查毒形态——`(raw >> 32) == 0xDDDDDDDD`（毒化填充形；用户态地址空间不存在该形态合法堆指针，零误报）命中走新增 `cheng_quarantine_stale_slot_abort_locked`：write(2) 直出 `cheng_quarantine: ring stale slot header=0x… slot=… len=… cap=…`（毒模式值+槽位+窗口现场）后 `_exit(70)`，禁静默解引用。

同文件他人 hunks（wall75/118/142/146/148 系）原样保留，本线 hunks 均带 `[wall149]` 标记。

## 二、r1 烤机：新雷钉死（指针型 local 别名全局误物化）→ uint64 raw 改写

- r1 驱动：sha256 `52739afa7e4801bf15873f375a443c180c076e65df269aec8e101fd8b2895183`，186499840 B（烤机 228s，BAKE_OK，source_identity_valid=1，unresolved=0）。
- 门禁全数 `rc=134`（SIGABRT，零 stderr）。cheng_crash_triage（ordinary 夹具 --emit:obj 现场复现）钉死：`cheng_host_free → libmalloc ___BUG_IN_CLIENT_OF_LIBMALLOC_POINTER_BEING_FREED_WAS_NOT_ALLOCATED → abort`，崩链 `cheng_free → cheng_free_locked(_488) → cheng_quarantine_release_locked(_238) → cheng_quarantine_ring_push_locked(_237+1336) → cheng_host_free`，即我的 `c_free(ptr(oldRing))`。
- 反汇编（dis_push.txt，_237）：`<+744..760>` 把 **`&cheng_quarantine_ring`（全局槽地址）** 存入 oldRing 栈槽（int32 快照 oldCap/oldHead/oldLen 全部是正确的值语义 load，唯独指针型 local 中招）；free 实参从该槽单次 load 不解引 → free 全局槽地址 → libmalloc 拒绝。**新发现（移交后端线）：指针型 local `let p: PtrT = 全局指针` 被误物化为对全局的引用别名，破坏值语义。** 本线不越域修后端，按树内既有纪律以 uint64 raw 携带绕开该误物化形态（同 cheng_mem_registry_grow；该函数存活多代证明此形态可靠）。
- r2 重烤后反汇编（dis_push_r2.txt）：`<+760>` 变为 `ldr x0,[x1]` 装载全局**值**再存快照槽，free 实参正确。

## 三、r2 烤机与门禁

r2 驱动：sha256 `507f0b3ded42d10e0d0d32a122afa80a6344c23cce723da25efd9a4bf1e1efe1`，186499840 B，BAKE_OK。烤机通道=wall148 验证过的 w139 rebuild（w126 同通道；/tmp/oob_ab/w126 目录已清理，`/tmp/oob_ab/manifest_head.cheng` 与 `w139/kernel_manifest_head_git.cheng` diff=0，车头 `/tmp/oob_ab/cheng_w126`）。

修前基线（同命令同夹具，全部必崩）：w143 驱动 3/3 rc=139（21:22）、w148_r1 驱动 1/1 rc=139（21:31）。

| 门 | 预期 | 实测 |
|---|---|---|
| cleanup_cfg.cheng × r2 --emit:obj 连续 20 轮 | rc=0 零崩溃 | **被并行线在树 buffer.cheng 双 @borrows 阻塞**：20/20 rc=2（csg 阶段判词 `compiler csg: normalized decl read failed: src/std/buffer.cheng: parser annotation: invalid @borrows on fn byteBufferAppendBytesImpl at line 86: duplicate @borrows`）。**零 SIGSEGV/SIGABRT**——r2 每轮都在同一管线的 ~35s 深解析中存活（旧驱动 6s 即死），随后被 csg 注解门拦下。轮询自动接力中（§四） |
| ordinary_zero_exit_fixture | compile=0 / run=0 | **compile=0 / run=0 PASS** |
| call_fixture | compile=0 / run=1（契约） | **compile=0 / run=1 PASS** |
| cold_nested_fmt_interpolation_smoke | compile=0 / run=0 `=pass` | **compile=0 / run=0，输出 `cold_nested_fmt_interpolation=pass` PASS**（数分钟级全量 --emit:exe 实编译全程零崩溃） |
| zz_v6_w7 | 判词只记录（wall148 领地） | compile_rc=1，判词 `exact def derive: def/slot TypeId drift op=3 slot=0 row=10 … exact_tid=17:kind=8:scalar=0:sz=8:al=8 slot_tid=0:… slot_name=`（exact-def/identity 域 fail-stop，非 quarantine 域；与 wall146 移交态 compile=0/run=139 的差异源于在树 wall148 系 analysis 域在途修复，如实记录不追） |

## 四、cleanup_cfg 铁证门的阻塞定性（外部在树缺陷，非本线引入）

- `src/std/buffer.cheng` 5 个函数带**双重 `@borrows`**（git diff 显示为在树未 commit 系列对既有 `@borrows` 行前再加一行），mtime 16:33 至今未变；parser 注解门拒 `duplicate @borrows`。cleanup_cfg 闭包含 buffer.cheng（ordinary/call/cn 闭包不含，故三门 PASS）。
- 时序证据链：w143（20:1x，w147 裸跑）与本轮 w143/w148 复现全部 SIGSEGV 死于 csgJsonParse 释放路径（wall145 定名的同一雷区，~6s）；r1 死于同阶段的 ring 指针误物化（134）；**r2 是第一代穿过该雷区的驱动**，随后才在 csg 注解门吃 rc=2。即：修复使该管线首次可达其后续阶段。
- 本缺陷属他人 hunks（严禁 revert 他人在树修复），本线不触碰 src/std。处置：/tmp/oob_ab/w149/poll_unblock.sh 每 120s 探一次 cleanup_cfg --emit:obj，buffer.cheng 愈合（rc=0）即自动重跑完整门禁 gates_r2b.sh（20 轮 + 四夹具）。本线交付时（22:2x）轮询 6 次均 rc=2（buffer.cheng 未愈合）。**移交接力动作：buffer.cheng 修复落地后，`bash /tmp/oob_ab/w149/poll_unblock.sh`（或直接 `bash /tmp/oob_ab/w149/gates_r2b.sh`）即可补齐铁证门，结果落 /tmp/oob_ab/w149/r2b_gates/，无需重烤。**

## 五、交付物

| 项 | 值 |
|---|---|
| patch | /tmp/oob_ab/wall149.patch（当前树态全量 git diff，19282 行/102 文件，含 wall7-148 系在树 hunks；本线净贡献=program_support_backend.cheng +63/-4） |
| reverse-check | **PASS**（git apply --reverse --check） |
| r1 驱动 | 52739afa…（误物化证据存档，勿用） |
| r2 驱动（最终） | 507f0b3d…，186499840 B |
| 作业区 | /tmp/oob_ab/w149/（base_repro/bake_r1/r2/dis_push(.r2)/gates_r1/r2/r2b/poll_unblock 全留档） |

## 六、移交事项

1. **后端线（高优）**：指针型 local 从全局指针赋值被误物化为 `&global` 别名（§二，含反汇编坐标），本线以 uint64 raw 规避；树内存量代码若同形（指针 local = 全局指针）需排查。建议该形态进 identity/误物化狩猎清单。
2. **buffer.cheng 属线**：双 @borrows 修复落地后，wall149 轮询将自动跑完 cleanup_cfg ×20 rc=0 铁证门（脚本已就位，结果落 /tmp/oob_ab/w149/r2b_gates/）。
3. exact-def TypeId drift 判词（§三 v6 行）属 wall146/148 领地，判词富化字段已在案。
