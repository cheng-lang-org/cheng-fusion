# UniMaker S2 feed_core.o 构建墙诊断报告

日期 2026-07-08 · driver `artifacts/backend_driver/cheng`(2026-07-08 13:51,含 export-roots 前端裁剪)
只读诊断 + 产物隔离 `/tmp/feed_probe2/`,未修改任何仓库文件,无 git 写操作。

## 1. 探针结果表

| probe | export-roots | env | rc | wall_s | maxRSS | object | report 关键字段 |
|---|---|---|---|---|---|---|---|
| a_2root | libp2p_get_last_error,libp2p_string_free | — | **0** | 5 | 378 MB | ✓ 2248 B | typed_ir_function_count=5;reachable_function_table_count=7567;exec_phase_total_ms=4957;report_rss_bytes=378 683 392;missing_function_count=0;direct_object_bytes=2248 |
| b_feed_contents | libp2p_feed_node_contents | — | 138 | 350 | 6.43 GB | ✗ | ✗(崩前无 report) |
| b_feed_lazy | libp2p_feed_node_contents | LAZY=1 | 138 | 317 | 6.57 GB | ✗ | ✗ |
| c_init_slim | libp2p_node_init_slim | — | **2** | 40 | 1.55 GB | ✗ | typed_ir_function_count=651;reachable_function_table_count=7567;lowering_primary_ir_materialized_function_count=645;**primary_object_missing_function_count=58**;error=plan_not_ready;exec_phase_total_ms=40084;first_missing=cheng_libp2p_protocols_didauth__initDidAuthState__L43 |
| (15:04 参考) 4-root | 4 roots | 8 GiB guard,无 lazy | 138 | 353 | 7.60 GB | ✗ | ✗ |
| **d_4root_lazy** | 4 roots | LAZY=1 | 138 | 284 | 4.43 GB | ✗ | ✗ |
| **e_4root_lazy_b4096** | 4 roots | LAZY=1,BATCH=4096 | 138 | 267 | 4.75 GB | ✗ | ✗ |
| e_csg_feed (emit-csg) | libp2p_feed_node_contents | — | 0 | 451 | 1.83 GB | (csg-only) | node_count=7567,edge_count=0(模块图;无 per-root typed_ir 计数) |

4 roots = NimMain,libp2p_node_init_slim,libp2p_node_start,libp2p_feed_node_contents

### SIGBUS 崩溃日志一致性(~/Library/Logs/DiagnosticReports/)
四次 feed 相关 SIGBUS 全同签名 —— 顶帧同一符号 `.Lcheng_cold_2030`,faulting address 落在 reserved commpage VM 区起点:

| 探针 | 时刻 | faulting addr | 顶帧符号 |
|---|---|---|---|
| b_feed_contents | 17:32 | 0x762400000 | .Lcheng_cold_2030 |
| b_feed_lazy | 17:40 | 0xba2800000 | .Lcheng_cold_2030 |
| d_4root_lazy | 18:23 | 0x86e000000 | .Lcheng_cold_2030 |
| e_4root_lazy_b4096 | 18:27 | 0xb38c00000 | .Lcheng_cold_2030 |

b_feed_contents 完整崩溃元数据:`EXC_BAD_ACCESS / SIGBUS / KERN_PROTECTION_FAILURE`,esr="Data Abort, byte write Translation fault",faulting address 0x762400000 = 11.5G reserved commpage 区(0x762400000-0xa44000000,---/--- SM=NUL unallocated)起点,紧邻前一个 4 MB MALLOC_SMALL 块(762000000-762400000)。调用栈 main → .Lcheng_cold_4768/4764/4673/4678/4679/4680/2034 → **.Lcheng_cold_2030**(imageOffset ~6.7 MB,cold 编译器)。

## 2. rc=138 死因定谳(一句话)

**rc=138 = SIGBUS(signal 10)= EXC_BAD_ACCESS/KERN_PROTECTION_FAILURE:cold 编译器 `.Lcheng_cold_2030` 处一次堆越界写越过 ~4 MB MALLOC_SMALL 块边界、落入 reserved commpage VM 区(四次 faulting addr 均为 reserved 区起点),在 feed 闭包物化 ~267-353 s 触发;非 OOM、非 RSS guard(6.4-7.6 GB << 8/12 GiB guard)、非 timeout,是编译器确定位置(.Lcheng_cold_2030)的堆 OOB 写 bug。**

## 3. 可行性结论

**feed_core.o 在当前 driver 下不可产。** 三重独立 blocker,全部位于新 trim driver `artifacts/backend_driver/cheng`(2026-07-08 13:51):

1. **SIGBUS 堆 OOB 写(.Lcheng_cold_2030)** —— 大闭包 lowering 物化时越界写,feed_contents 单根及 4-root 全崩。主墙。267-353 s / 4.4-7.6 GB。
2. **init_slim plan_not_ready** —— c_init_slim 干净退出 rc=2,651 typed_ir 函数中 **58 个 body_semantics_missing**(newSlimSwitch[missing_call_target→toString]、NimMain、newSwitchBuilder、withAddressText、resolveSwitchBuilderIdentity、applySwitchBuilderOptions、initConnectionGater、validatePublicKey、keyPairFromSeed、generateKeyPair、各 add*Transport、setSecure、setMuxerKind…)。即便修好 SIGBUS,含 init_slim 的 4-root 会被这 58 个未解析函数挡成 plan_not_ready。
3. **export-roots 路径丢失 bare @exportc 别名** —— a_2root(唯一成功产物,OHOS llvm-nm -g + 全符号 dump 双验)只导出 mangled 名 `cheng_..._libp2p_get_last_error__L4082`/`cheng_..._libp2p_string_free__L7728`,**无 bare `libp2p_get_last_error`/`libp2p_string_free`**;对照 `cheng.stage3` 编的 cp_local.o 有 bare 名(cheng_epoch_time_seconds 等)。即 trim driver 的 export-roots object 发射丢 @exportc 裸名别名 → 即便前两墙过,host bridge `dlsym("libp2p_node_init_slim")` 仍失败。

**四符号验证强度**:4-root object 不存在(全 SIGBUS),四符号无法验证;但 a_2root 证据(强)表明即使产出也缺 bare 别名。验证工具:`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/native/llvm/bin/llvm-nm`(已用,-g 与全 dump 双跑)。

### 闭包规模量化(feed_contents)
- 模块级 reachable_function_table_count=7567(245 源文件闭包,所有 root 共享常量;emit-csg node_count=7567 印证)。
- root-specific typed_ir_function_count:trivial 2-root=5;init_slim=651(其中 58 missing);**feed_contents 未知**(SIGBUS 崩前无 report,emit-csg 只给模块图不给 per-root 计数)。
- 量级推算:c_init_slim 651 函数 = 40 s / 1.55 GB;feed_contents 崩于 350 s / 6.4 GB(无 lazy)→ 按 RSS/time 比例 feed_contents 闭包约数千函数级(数千 typed_ir),是重头 root。与 S2 文档 line 45 吻合:libp2p_node_init→initSwitchWithPersistentIdentity→NewHostWithAddressText 挂载全部协议(gossipsub+kademlia+rendezvous+dm+feed+livestream),feed 内在拖入整个 switch+QUIC+crypto 闭包。

## 4. ps.o / hr.o 来源 + feed 六件套落位方案(只方案,不落位)

prebuilt/publisher/ 现物来源(rebuild_publisher_prebuilt.sh **只编 moq_core.o + cp_local.o**,ps.o/hr.o 由 tools/moq_droid_two_process.sh 编后手拷):

| 文件 | 源 | export-roots | 产出脚本 | 备注 |
|---|---|---|---|---|
| moq_core.o | src/tests/media_moq_publisher_main.cheng | 无(全闭包) | rebuild_publisher_prebuilt.sh:37 | ohos target |
| cp_local.o | src/core/runtime/core_runtime_provider_linux.cheng + objcopy | 19 roots + localize(cheng_ptr_plus/cheng_bytes_copy/cheng_bytes_set) | rebuild_publisher_prebuilt.sh:38-44 | ohos target |
| ps.o | **src/core/runtime/program_support_backend.cheng** | 19 roots(c_iometer_call,cheng_cstrlen,cheng_fclose,cheng_fflush,cheng_file_handle_*,cheng_malloc/free,cheng_monotime_ns,cheng_os_*_bridge…) | tools/moq_droid_two_process.sh:35 | **android target**(rebuild 脚本不重编) |
| hr.o | **src/core/runtime/program_support_host_runtime.cheng** | 14 roots(cheng_host_clock_gettime/closedir/fclose/…/malloc/mkdir/opendir/stat,__cheng_runtime_ptr_slot_load/store_raw) | tools/moq_droid_two_process.sh:39 | **android target**(rebuild 脚本不重编) |
| host_bridge.c | src/tests/moq_droid_support/host_bridge.c | (C 源,拷贝) | rebuild:13 / moq_droid:16 | 拷贝 |
| linux_intrinsics.S | src/tests/moq_droid_support/linux_intrinsics.S | (asm,拷贝) | rebuild:14 / moq_droid:16 | 拷贝 |

**feed 六件套落位方案(镜像 publisher,仅 feed_core.o 受阻)**:

| 文件 | 源 | 状态 |
|---|---|---|
| **feed_core.o** | unimaker_compat_ffi.cheng + 4 roots + ohos target | **BLOCKED(三重墙)** |
| ps.o | program_support_backend.cheng + 19 roots + **ohos target** | 可产(重编或复用 publisher;注意 publisher 现物是 android target,干净落位应 ohos 重编) |
| cp_local.o | core_runtime_provider_linux.cheng + 19 roots + objcopy | 可产(rebuild_publisher_prebuilt.sh 同款) |
| hr.o | program_support_host_runtime.cheng + 14 roots + **ohos target** | 可产(重编或复用;同上 target 注意) |
| host_bridge.c | src/tests/moq_droid_support/ 拷贝 | 可产 |
| linux_intrinsics.S | src/tests/moq_droid_support/ 拷贝 | 可产 |

结论:六件套中 **仅 feed_core.o 受阻**,其余 5 件(provider 三件 + 两个 droid_support 拷贝)均可在 bounded 资源内产出。墙是单点。

## 5. 最小解锁条件

### 短期(装机链路,不改闭包结构)
- **A. 修 `.Lcheng_cold_2030` 堆 OOB 写**(bootstrap/cheng_cold.c 单函数 pinpoint bug,非重构):lldb 钉崩点 + otool 反汇编 `.Lcheng_cold_2030` 附近指令,找无界数组写、加 allocation-bound 断言/正确增长。验证:b_feed_contents 单根探针应到达 report(rc=0 或 rc=2)而非 SIGBUS。
- **B. 解 init_slim 的 58 个 missing 函数**(body_semantics_missing / missing_call_target):c_init_slim 干净 rc=2 证明是真实未解析体语义,非崩溃致残。newSlimSwitch→toString 等是 slim-switch 链尾;S2 文档 line 45 的 slim-switch profile(只挂 gossipsub+feed,不挂全协议集)既缩闭包也可能解这批 missing。
- **C. 修 export-roots 路径发 bare @exportc 别名**:a_2root 证据(强)无 bare 名,cp_local.o(stage3)有 bare 名 → trim driver object 发射丢别名表。否则 host bridge dlsym 全失败。
- **D.(战略)slim-switch profile**:libp2p_node_init_slim 只挂 gossipsub+feed,不挂 gossipsub+kademlia+rendezvous+dm+feed+livestream 全集。缩闭包使 lowering 留在 bounded 内存/时间内(即便 A 修了 OOB)。"feed-only 薄入口"已被 S2 文档证伪,slim-switch profile 才是真缩。

### 长期(编译器 op-lane)
- **后端 fork-join 并行 + Cheng-backend regalloc**(S2 文档 line 45 真解):大闭包并行分片 lowering,每 worker bounded RSS,而非单巨型串行 arena。
- **堆 OOB 硬化**:`.Lcheng_cold_2030` 暴露 cold 编译器无界写无 guard。加 mmap guard page / allocation-bound 断言,使 OOB 写快速失败而非静默走入 reserved VM(lessons.md §13 "ZC meter 自身可以是被测缺陷的宿主" 同款教训:meter/cold-compiler bug 先 lldb/otool 钉点再追源)。

## 6. 探针命令(原样)

driver: `artifacts/backend_driver/cheng`(2026-07-08 13:51)
入口: `src/libp2p/mobile_ffi/unimaker_compat_ffi.cheng`
target: `aarch64-unknown-linux-ohos` · emit:obj · guard: CHENG_PROCESS_MAX_RSS_BYTES=12884901888(12 GiB) · timeout 1500s

run_probe.sh wrapper(`/tmp/feed_probe2/run_probe.sh`):
```
/usr/bin/time -l env CHENG_PROCESS_MAX_RSS_BYTES=12884901888 "$@" \
  timeout 1500s artifacts/backend_driver/cheng system-link-exec \
  --root:"$PWD" --in:"$PWD/src/libp2p/mobile_ffi/unimaker_compat_ffi.cheng" \
  --emit:obj --target:aarch64-unknown-linux-ohos \
  --out:"$DIR/feed_core.o" --report-out:"$DIR/report.txt" \
  --export-roots:"$ROOTS"
```

- a_2root(rc=0): `--export-roots:libp2p_get_last_error,libp2p_string_free` → /tmp/feed_probe2/a_2root/
- b_feed_contents(rc=138): `--export-roots:libp2p_feed_node_contents` → /tmp/feed_probe2/b_feed_contents/
- b_feed_lazy(rc=138): 上 + env `CHENG_LOWERING_OBJ_LAZY=1` → /tmp/feed_probe2/b_feed_lazy/
- c_init_slim(rc=2): `--export-roots:libp2p_node_init_slim` → /tmp/feed_probe2/c_init_slim/
- d_4root_lazy(rc=138,本次): `/tmp/feed_probe2/run_probe.sh d_4root_lazy NimMain,libp2p_node_init_slim,libp2p_node_start,libp2p_feed_node_contents CHENG_LOWERING_OBJ_LAZY=1`
- e_4root_lazy_b4096(rc=138,本次): `/tmp/feed_probe2/run_probe.sh e_4root_lazy_b4096 NimMain,libp2p_node_init_slim,libp2p_node_start,libp2p_feed_node_contents CHENG_LOWERING_OBJ_LAZY=1 CHENG_CSG_TYPED_IR_BATCH_LIMIT=4096`
- e_csg_feed(rc=0,csg-only,本次): `env CHENG_PROCESS_MAX_RSS_BYTES=12884901888 timeout 900s artifacts/backend_driver/cheng emit-csg --root:$PWD --in:$PWD/src/libp2p/mobile_ffi/unimaker_compat_ffi.cheng --target:aarch64-unknown-linux-ohos --report-out:/tmp/feed_probe2/e_csg_feed/report.txt --export-roots:libp2p_feed_node_contents`

## 7. 产物清单(/tmp/feed_probe2/)
a_2root/(feed_core.o+report.txt+rc.txt) · b_feed_contents/(build.time+rc.txt) · b_feed_lazy/(build.time+rc.txt) · c_init_slim/(report.txt+rc.txt) · d_4root_lazy/(build.time+rc.txt) · e_4root_lazy_b4096/(build.time+rc.txt) · e_csg_feed/(report.txt+build.time+done.txt) · run_probe.sh · DIAGNOSIS_REPORT.md(本件)

## 7-09 更正（wave5 lldb 活体复现定谳，权威崩案卷 lldb_crash.log/debug_run.log 在会话 scratchpad）

旧文三处归因**作废**，以下为当前真相：
1. **崩点不在 cheng_cold.c 自身逻辑**：`.Lcheng_cold_N` 是 cheng_cold.c 给它编译的第 N 个 Cheng 函数打的标签（cheng_cold.c:26467）。崩的是 driver 执行自己编译进去的 `pobj.PrimaryObjectPlanFillAndCheckPhase`（primary_object_plan.cheng:56110 `add(plan.instructionWords, 0)` 零填循环，非 Darwin-arm64/ohos 分支），不是 BuildItemsPhase。
2. **双 bug 叠加，非"大闭包物化 OOB"**：驱动因=**字数虚高**——feed 闭包实际仅 1618 函数/69439 op（合理 ~25 万字），但 `state.totalWordCount` 被算成 1,781,250,043（~7000 倍虚高；wave6 定谳=**非 int32 溢出**，真因见下「7-09 再更正」①）；近因=cheng_cold.c `codegen_seq_i32_add`（:14407-14408）用 32 位 ADD 算 4×newCapacity，容量翻倍到 2^30 时 4×2^30 截断为 0 → calloc(0) → 拷 2^29 元素冲出 4MB MALLOC_SMALL 区 SIGBUS（寄存器级验证 x5+w6*4==fault addr）。int32[] 全局被此 bug 硬顶在 2^29 元素；str[]/opaque[] 扩容走 64 位无此洞。
3. **解锁序**：真解锁=修驱动因②字数虚高（pobj 域，非 seed 级）→ totalWordCount 回落后 feed_core.o 在 bounded 内存可产；近因①修法=a64_add_reg→a64_add_reg_x（镜像 :13871-13874 safe 路径，seed 级需签字重烤，且单修只把崩变成 ~7GB 干净 OOM 不解锁）。lazy/batch/RSS 参数全部无效（都在 plan build 之前，碰不到 totalWordCount 与 fill 循环）；**"58-missing 修通可缩闭包避崩"假设证伪**（resolve missing 只增字不减；两墙正交）。
4. 58-missing 同日定谳（隔离树实测）：node-eval 多家族 bail（711×29=Option[T] 泛型布局/字段全栈缺失为主力，44×11/801×6/91×4/32×3/709×2 等各自独立）；typed_expr 单独补 Option 分支可 58→35 但运行时 SIGSEGV（backend2 泛型局部 slot/store/read 未跟上，711 bail 是保护网）——真解=镜像 Result[T] 端到端链路补 Option[T] 全栈+运行时 golden 门。

## 7-09 再更正（wave6 定谳）

1. **字数虚高真因=巨型固定全局状态表按全数据尺寸计入帧足迹，非 int32 溢出**：`yamuxStates: YamuxMuxerState[64]`≈101,989,888 B 等全局表被 `BodyPlaceGlobalAddressTag` slot 按全数据尺寸算进栈帧/拷贝字数（正确应为 8 字节地址槽）。PART-1 帧足迹修已隔离树验证：total_words 1,781,250,043→820,003,172（-54%），yamuxWrite frame_bytes 105,177,472→3,187,584；仍 >2^29 仍 SIGBUS。patch=会话 scratchpad `s2-wordcount.patch`（5 hunk：PrimaryBodyIrLocalFrameFootprint + NextLocalStackOffset/Reflow×2/StackByteCountRaw 四调用点）。
2. **PART-2 残余根（wave7 实施中）**：app 侧 yamux/muxer/transport 对 1.6MB 全局元素整结构值拷贝（yamux.cheng L691/734 等）+ 两后端缺陷——`CopySlotWordCount` O(n²) 预测虚高（pobj:46216）与 `A64EncStrImm` copyIndex*8>32760 发 0x0 垃圾指令（pobj:46840；**只修预测器=运行时 miscompile，绝不可单落**）。推荐解=方案B 就地索引操作（app 源第一性原理：每流操作拷 1.6MB 本身病态）。
3. **自宿主重烤新债**：当前树自宿主烤出的 driver 启动即 SIGSEGV（`_platform_strlen` 野指针 0xa00000000），纯净重烤（不带任何补丁）同样崩=既有 bootstrap 脆弱性，非补丁引入。破局=stage3 烤 driver（~10s rc=0），但 stage3 前端更严（拒冗余 `var i:int32=0` 等）。隔离树验证循环口径改为 stage3 烤。
4. **s2-option（58-missing 主力 Option[T]）根因定谳**：`backend2_lower_util` TypeKindFromText 对 Option 返 LocalPtrTag + TypeShapeFromTextImpl sizeBytes=0→按 8 字节指针槽错尺寸。修复三补丁（util/slots/frontend-typed_expr）已设计并对主树 apply-check OK（在会话 scratchpad）；运行时验证 wave6 被自宿主烤崩（上条③）阻断，wave7 换 stage3 烤复验中。**←该条修法已被 7-09 第七波改写（backend2 补丁对生产路径惰性，真修在 pobj），见下节 ②。**

## 7-09 第七波（wave7 定谳，全部已对抗复核；字数/rc 证据 /tmp/s2wc/feed_p2.stderr，存证勘误见第八波 ⑤）

1. **PART-2 方案B 已落主树 3614eac19，SIGBUS 墙清除**：yamux 14 处 / muxer 17 处 / memorytransport 7 处 / wstransport 7 处 copy-in/out 改 var 形参就地操作 + memoryListeners 拍平（规避冷后端嵌套表取址 miscompile）；运行时 A/B 双绿。字数 820,003,172→**163,639,663**（-80%，<2^29 余量 3.3x，存证 /tmp/s2wc/feed_p2.stderr）；feed 探针 rc138（SIGBUS）→**rc2（plan_not_ready 干净退出）**。§2/§3 的"主墙=SIGBUS"自此作废。
2. **Option 修复定谳改写（作废 wave6 ④"三补丁待复验"路线）**：生产 driver 用户代码 lowering 走 **pobj 老后端**，backend2 两补丁对该路径惰性——真修=**第四补丁 s2-option-pobj.patch**（kind+shape+field-meta+dispatch 四镜像）。验证：阶梯 A/B 基线 1/5→修复版 **5/5 PASS**；c_init_slim missing **59→28**（-31）；三合一 words +0.96%（Option 真聚合布局的预期增量）。存证说明：wave7 阶梯 1/5→5/5 的运行日志无落盘存证（数字来源=wave7 车道实时复跑，复核员当时重跑过 5/5）；wave8 landing-kit 排练已再次复跑 5/5 并落盘（scratchpad/landing-kit/ladder_kitcheck.log）。
3. **新前沿=35 missing 多族**（SIGBUS 清除后 feed 探针干净暴露）：801×15（最大单族）/ 91×3 / 712×3 / 44×3 / 709×2 / 64×2 + 散 6，另有 closeBufferStream primary_fill_failed（first_missing）。
4. **新钉死两个冷后端缺陷（本波只规避未修）**：①嵌套表元素 var 实参 miscompile（memoryListeners 拍平即为规避）；②大元素拷贝 b.cond offset overflow。
5. **落地状态**：四补丁（含 s2-option-pobj）+ PART-1 帧足迹修全部等 pobj 静默窗；落地工具包在会话 scratchpad/landing-kit/（wave8 重生成中；旧 s2-wordcount.patch 对 HEAD 漂移不可 git apply，已作废）。

## 7-09 第八波（wave8 定谳，已对抗复核）

1. **801 族 15→7，feed missing 35→29**：全清 5 个（connectionInfo/secure/upgrade/dial-msquic/muxerProtocol）+ 推进 3 个（noise/plaintext/tls）到 711 族。证据：基线 /tmp/s2fix/feed_combo/（missing=35，801×15）、修后 r3 /tmp/s2fix/feed_r3/（missing=29，801×7，word_count=166,068,055）。补丁 s2-801-family.patch（14 hunk / 4 文件，会话 scratchpad）。**801 残 7 已知根清单**：argContext 侵入大 / dialPeer / quic decode / msquic seq / jsonParseArray body 级。
2. **新钉死缺陷【跨模块无限定 const 静默 miscompile】**：跨模块引用无限定名 const 时，decl-RHS / call-arg 位置读栈垃圾且**不 poison**（静默 miscompile，非响亮 bail）。repro /tmp/s2fix/s2q7.cheng 在**未改动的 driver_combo** 上 rc=7；曾致 muxer 探针假红（假红根因在旁侧 pre-existing 洞，非补丁引入）。教训：**census=0 不充分的又一实证**——探针假红时先排查旁侧既有洞再归因补丁。wave9 根修中。
3. **closeBufferStream primary_fill_failed 完整定谳**：FieldStore 1 字节 @ offset>4095 超 LDRB/STRB imm12 编码域 → A64 编码 Err → 发零字 → zero-scan 报 primary_fill_failed。现守卫只护 SP 基址且阈值 >16000 太粗（4096-16000 区间与非 SP 基址全漏）。修复草案=宽度感知守卫 / ADD 基址物化 + predictor 全消费点锁步。repro /tmp/s2fix/s2cbs3.cheng（25 行）。wave9 锁步修中。
4. **落地工具包就绪**：landing-kit 三补丁（kit-part1 五 hunk / kit-option-pobj 五 hunk / kit-option-mirrors 七 hunk）双 HEAD 排练全绿（烤 rc=0 + 阶梯 5/5 + feed missing=35 / word_count=165,207,735，存证 scratchpad/landing-kit/feed_kitcheck.report.txt）；复核员在漂移 HEAD 又独立重烤重跑全绿。唯欠 pobj 静默窗（哨兵已挂）。**已知不对称立案**：slots 版 Option field-meta 多 innerLeaf==CompilerEmit 分支，pobj 侧该形态是响亮 bail——落地时补齐或跟踪。
5. **wave7 存证勘误**：第七波"字数 163,639,663 / rc138→rc2"的证据指针原写 /tmp/s2fix/feed_combo/ 不准（该目录是本波 801 族基线，missing=35 快照），实际存证在 /tmp/s2wc/feed_p2.stderr；阶梯 5/5 存证说明已补进第七波 ②。

## 7-09 第九波（wave9 七件套全落主树，全对抗复核）

1. **七件套全部落地主树**（当前 HEAD=f5654ff9d）：3614eac19（PART-2，巨全局表整结构值拷贝改 var 形参就地，SIGBUS 墙清除，wave7 已落）/ 3a7465445（PART-1，全局地址 slot 帧足迹按 8 字节计）/ a7da4d1ec（Option[T] 局部布局全栈修，pobj 四镜像+backend2/typed_expr 镜像）/ 9b3670195（801 bail 族 node-eval 覆盖扩展，feed missing 35→29）/ 587c56e1a（跨模块无限定 const 静默 miscompile 根修）/ 40503bb43（S2 余族两根修，bail=64×2+92×1）/ f5654ff9d（FieldLoad/FieldStore 指针基大偏移 imm12 越界锁步修，closeBufferStream 清除）。**主树当前前沿**：feed 探针 missing=29、word_count≈166,069,886（166.07M），rc=2 plan_not_ready（29 个 not-ready 前沿函数未产出 obj）——SIGBUS 墙已在 wave7（3614eac19）清除，此态非 SIGBUS 崩溃，是七件套全部落地后仍未破的下一层墙。**grand-combo 七件套合并终验全绿**（HEAD=904d07894 纯净副本 /tmp/grandcombo 上验证）：git apply --check+apply 7/7 零冲突；stage3 烤 driver rc=0 real_backend_codegen=1；Option 阶梯 5/5 PASS；const repro s2q5/6/7/9/10/11 全 compile_rc=0+run_rc=0（值断言过）、s2q12 撞名对照精确落 bail=9601 poison（响亮拒编）；fill repro s2cbs3 compile_rc=0+run_rc=0（往返读写断言过）；feed 29 条成分逐条可追溯（3 项真修复移出 closeBufferStream/bandwidthEnabled/resourceTotalConnections/msquicTls13HandshakeExpandLabelSha256 共 4 个 + 1 项 fill 自曝新前沿 + 3 项 families 自曝新前沿，无未解释新增）。

2. **const 静默洞已根修落地**（587c56e1a）：双层修复——①正确解析路径 `PrimaryBodyIrLookupUnqualifiedImportedConstI32`/`…StrLiteral`，走 `typedIr.typeAliasSourcePaths`/`typeAliasTargetSourcePaths` 前端真实导入表（非文本猜测路径，后者对非规范布局入口文件恒返空）；②poison-on-miss 兜底（bail=9601），撞名场景从静默 rc=80 垃圾值变为响亮拒编。验证：s2q5/6/7 金标 rc 1/1/7→0/0/0，s2q9/s2q10 变体 rc 1/1→0/0，s2q11 限定形对照修前后均 0（零回归），Option 阶梯 5/5，feed 探针同树 A/B 零回退，撞名 repro s2q12 用 poison 开关 A/B 证实非死码。零瑕疵对抗复核（issues=[]，10 项独立重跑全部 matches_claim=true）。**盲区立案**（本波未覆盖，非虚报）：①I64 类型跨模块无限定 const 未修——同文件裸名检查本身只在 `typeKind==LocalI32Tag` 分支触发，按既有作用域最小改动未扩展，未建 I64 repro；②多跳 re-export 链未覆盖——grand-combo 合并才暴露：`muxerResetStreams`（muxer.cheng→libp2p/resourcemanager 转发 shim→std/net/resourcemanager 两跳）诊断从 bail=709 变为 bail=9601，根因是补丁只查调用文件**直接** import 的模块，两跳外真声明查不到诚实返回 found=false 触发 poison（方向正确、非回归——该函数两版本均是 ZC_NOT_READY，仍在 29 条列表内，只是诊断更精确），但暴露 const 补丁一个新盲区，未在原 honest_gaps 提及。wave10 清扫中。

3. **fill imm12 越界已锁步修落地**（f5654ff9d）：根因=FieldLoad/FieldStore（op.kind=14/15）指针基/var-param 聚合基/str 基分支把字段 byteOffset 原样传给寄存器基址访问，从未走地址物化守卫（既有两道守卫只护纯 SP 基分支）；byteOffset 超真实 imm12 上限（1B/2B 走 CopyMemory 字节环上限 4095，4B 走 %4==0 快路径上限 16380，8B 走 %8==0 快路径上限 32760）时 A64 编码 Err→Value() 解出 0→写零字→zero_scan 报 primary_fill_failed。修复=新增通用寄存器基址折叠 `PrimaryBodyIRFillRegAddImmToReg`（泛化既有 stack 版本，链式 ADD immediate 折叠，4095/次），FieldLoad/FieldStore emitter 与 predictor 三处对称插入折叠，字数计算复用既有 `PrimaryBodyIrStackAddressWordCount` 天然锁步。**四组 predicted==emitted 零 desync**：s2cbs3(1B@6400) 118/118、s2cbs_2b(2B@4104，跨 4095) 119/119、s2cbs_4b_a(4B@8192，跨 8190 未跨真实 16380) 119/119、s2cbs_4b_b(4B@16384，跨真实 16380 上限) 146/146。closeBufferStream 已从 missing 列表消失。**新前沿**（解除该 blocker 后暴露，非回归）：3 个此前不可达函数 storeFeedEntryLocal/storePublishTask/findPublishTaskJson（bail=44）+ 1 个不同类新前沿 `cheng_libp2p_upgrademngrs_upgrade__upgrade__L69`（op_kind=10 BodyOpResultProjectTag，value_slot_size=6360，走 PrimaryBodyIRFillResultProjectOp 路径，非本补丁 FieldLoad/FieldStore=14/15 授权范围，未修）。零瑕疵对抗复核（issues=[]）。wave10 攻坚中。

4. **families r2 两族已根修落地**（40503bb43）：①bail=64×2（bandwidthEnabled/resourceTotalConnections）——`TypedExprFoldSingleBodyExprReturn` 原设计死锁"函数体必须恰好一条语句"，多一条 call 语句（如 `ensureXxxInit()`）即弃疗落 kind=Unsupported 兜底 bail=64；修=放宽成"只认最后一条 top-level 行"，`TypedExprBodyExprIsImplicitReturn` 天然排除 return/let/var/if/for 等前缀 + `TypedExprIrStatementLineExists` 天然拒绝重复登记，双重 poison-on-miss，中间行不会被误 fold。②bail=92×1（msquicTls13HandshakeExpandLabelSha256）——非编译器 bug，是 `src/quic/tls/handshake13.cheng` 源码缺陷：两行本应是模块级 const（`msQuicTls13SideClient`/`msQuicTls13SideServer`，被 bft_state_machine_main.cheng 十余处限定名引用证明其模块级身份）错误粘贴在函数体 return 语句之后；修=挪回同文件已有 const 块（第 22-60 行）。**44 新三连暴露（非回归）**：storeFeedEntryLocal/storePublishTask/findPublishTaskJson 是本轮两处修复解除更早 blocker 后暴露的独立可达函数，与两处改动（typed_expr.cheng 一处函数、handshake13.cheng 一处 const 位置）文件/函数/调用链均无重叠。**判定跳过（本轮不做，侵入过大，与 801 残 7 同级）**：bail=711×4（裸类型名撞名，Connection struct 四文件同名，需按 import 图消歧类型注册表，高侵入）；bail=91×3（嵌套调用被主统计语句抽取器 `TypedExprIrAppendStatementsForScope` 误判成独立顶层语句抢占行占用，牵动全编译器核心函数或 15+ 并行 SoA 数组原地覆写，双高风险）；bail=8548×1（既有故意 poison 点，非缺陷，需新增 ptr-cast-nested-call-arg realizer）。**未完成根因排查**：bail=712×3/709×2/44×5(现存)/805×1/93×1（93 的"前置声明当独立函数"假设已建 repro 证伪，未找到替代根因）。审慎一分：verdict=`pass_with_issues`（minor：Option 阶梯"日志同名"表述不精确，数字本身经独立重跑证实为真）。

5. **主树当前前沿总账**：feed_core.o 仍未产出（missing=29≠0），S2 墙未全破——这是三车道各自在自身车道文档中承认未完成的既有前沿，非本轮合并新引入的失败；净额持平（29→29）全部可追溯到已交付的三份车道文档（4 项真修复移出 + 4 项自曝新前沿），无未解释缺口。落地判据（窗态静止>25min + 零相交 + HEAD 漂移复检）在七件套实际落地时均已满足，落地后 `git status` 复核他人 WIP 原样。

## 7-09 种子事故（2026-07-09 15:29-15:33，wave9 验证环境改用抢救区）

主树 `artifacts/`（含 `artifacts/bootstrap/cheng.stage3` 与 `artifacts/backend_driver/cheng`）被外部进程在会话中途整体清空重建：种子世系（stage0 六修+全部 `.bak`）一度仅存 `/tmp/s2wc` 副本，已抢救到 `~/.claude/projects/-Users-lbcheng-cheng-lang/seed-rescue-20260709/`（stage0=65e58709 验真）。新主树 stage3（14.9MB driver 形态二进制，非源改构建）同一烤 driver 命令旧 10s→新 400s 超时不可用——此后**一切 stage3 调用（烤 driver / run-host-smokes）一律改用抢救区二进制**，不使用主树 stage3。`ts-csg/tmp/` 同期两次被外部清空（非 git 追踪产物目录，与磁盘 95%→拉出 18GB 空闲观测吻合，疑似磁盘空间守护进程周期性清理），中断 feature-task9 车道 output-smoke 复核跑（已用会话开始基线 output-smoke RC=0 独立佐证不受影响，未虚报）；同期还阻断 review:feature-task9 复核员的端到端四门禁 RC=0 直接确认（复核员非破坏性缓解=复制现成 cheng 二进制到 artifacts/bootstrap/cheng.stage3 路径，实测复现 DOM/CSS complete=true/routeReachability edges=284，但 glyph SDF precompute 超时未到 digest 阶段，判定环境故障非被审 diff 缺陷，verdict=`pass_with_issues`）。**教训**：`/tmp` 与 `ts-csg/tmp` 产物一律视为易失，补丁与关键验证证据必须存会话 scratchpad，不依赖这两处目录的持久性。

## 7-09 第十波（wave10 定谳，已对抗复核）

1. **两提交落地**：97348ec3b（跨模块 const 多跳 re-export 递归解析 + I64 扩展 —— 587c56e1a 遗留两处盲区一并收口；`LookupUnqualifiedImportedConst*` 沿 re-export 链递归解析，撞名仍一律拒猜；`muxerResetStreams` 诊断从 poison bail=9601 前移到 bail=712，即该函数真正卡点是既有独立更深缺陷，非 const 解析问题，一层根治）；82fead5f2（`PrimaryBodyIRFillCopyMemory` 硬门在 byteCount 本身>4096 时必炸的洞修复——byteCount>4096 走 4095B 分窗 + `PrimaryBodyIRFillRegAddImmToReg` 基址前折，predictor 同步锁步；`upgrade__L69` ResultProject 大聚合零填清除）。
2. **净效果诚实口径勘误**：生产净效果=1 出 1 进——`upgrade__L69` 清除，同时暴露下一独立缺陷 `yamuxReinitState__L236`（FieldStore byteCount>32760，另案攻坚）；feed missing 维持 29→29。早前"净减 3"是 587c56e1a 的功劳误记，复核员同基座 A/B 已定谳纠正。
3. **missing=29 构成定谳**（新前沿逐条归类，非笼统计数）：712 族×4——`muxerResetStreams`（二层，即上条一层根治后暴露的深层）/ `muxerClearStreamState` / `handleFrame` / `msquicTls13ComputeSharedSecret`，共性=聚合局部写回结构体字段定长数组元素，卡 3000+ 行巨 realizer `PrimaryBodyIrAppendI32Assign`，需 node-primary+poison 方法论攻坚，非小补丁；trio44×3——bail=44，根因=`len(seq 字段)` 条件位，EvalNode 的 len 内征仅覆盖 str/Bytes 两类，fallback 误解析到 strings.cheng 的 str 版本（expect=3/got=5），修法模板=`PrimaryBodyIrSeqLenValueSlot` 扩展；`yamuxReinitState__L236`（本波 82fead5f2 新暴露，FieldStore byteCount>32760）；`jsonParseRawString`（bail=709，repro 未命中，根因比表面更 subtle，未定位）；801 残 4（argContext 侵入过大，未动，同 wave9 判定维持）；91 族等（未逐条列出）。
4. **trio44 坑位记录（wave11 车道正在做，非本波遗漏）**：seq 头 len 字段在"已抽取聚合槽副本"场景偏移 0 vs 8，修前需独立确认——这是 wave10 明确留给下一波的坑，已记录避免重复踩。
5. **种子事故后续**（详见上节「7-09 种子事故」）：世系已抢救至持久区（`~/.claude/projects/-Users-lbcheng-cheng-lang/seed-rescue-20260709/`，stage0=65e58709 验真）状态维持稳定；新主树 stage3 A/B 定谳 400s 超时仍不可用，本波验证全程延用抢救区二进制；op-lane 正在重建 `artifacts/backend_driver`，本波验证避让其在途产物，未覆盖。

## 7-09 第十一波（wave11 定谳，已对抗复核）

1. **两提交落地，missing 29→26**：26bd4487b（EvalNode len 内征扩展覆盖 seq 字段——trio44 族清零）+ a2983f62d（FieldLoad/FieldStore byteCount>32760 分窗拷贝锁步修——yamuxReinitState 编码墙清除）。
2. **trio44 根因**：`len(...)` CALL 内征（`PrimaryBodyIrNodeEvalProbe`/`PrimaryBodyIrEvalNode`）只覆盖 str/Bytes 两类（`PrimaryBodyIrLenFieldOffsetForType` 对 seq 恒 -1），seq 字段 len 在 if/while 条件位 miss 后退化到旧文本 fallback 把 seq 误当 str，触发静默值错（部分形态退化为 word-count-mismatch 硬 bail=44）。修复=probe/emit 两侧新增 `PrimaryBodyIrSeqRefForText`/`PrimaryBodyIrSeqLenValueSlot` 镜像分支，str/Bytes 原逻辑零改动，接管形态互斥不重叠，miss 仍原样 poison。wave10 留的"seq 头 len 字段偏移 0 vs 8"坑位本波定谳为**伪问题**：文本路径从不做聚合槽物化，直接 root 槽+字段偏移 FieldLoad，无偏移歧义。验证：repro `src/tests/repro_trio44_seq_len_cond.cheng` 8 项值断言（基线 exit=1 证实静默值错 / 修复版 exit=0）；阶梯 5/5；findPublishTaskJson/storeFeedEntryLocal/storePublishTask 三个函数零回归。
3. **FieldStore 墙——纠偏 wave10 误诊**：wave10 案卷记的"FieldStore 路径"系误诊——census `op_kind=14`=`BodyOpFieldLoadTag`，真凶是 var 形参 `state` 物化时对 `streams` 字段（256×1548=396288B）整字段 **FieldLoad**；FieldStore（=15）是结构对称同族缺陷，本次双修。修复=两条 8 字节对齐拷贝循环加 32760B(=4095×8) 分窗，窗间 `PrimaryBodyIRFillRegAddImmToReg` 前折基址（镜像 82fead5f2 CopyMemory 手法），共享 predictor 分支同步折叠字数。诚实净效果=**1 出 1 进**：`yamuxReinitState__L236` 内部卡点从 byteCount 编码墙（op_kind=14/396288）迁移到独立新缺口——`state.rxBuffer=EmptyBytes()` 的 `BodyOpCallTag` 支持缺口（body_ir_ops 29→16, frame_bytes 817552→6688），该函数仍在 not-ready 列表内，是"编码墙清除、下一层墙现形"而非"函数彻底解锁"（对 missing 计数本身无单独增减）。
4. **已知债（两提交共同点名，未修）**：`backend2_lower_slots.cheng`（len 内征）与 `backend2_emit_ops.cheng`（FieldLoad/FieldStore 拷贝循环+predictor）两处同构镜像缺口——`CHENG_BACKEND2` 默认关不构成生产回归（trio44 repro 在 `CHENG_BACKEND2=1` 下实测亦不复现缺陷），但切默认前必须补齐两处镜像，否则切换即引入静默回归。

## 7-09 第十二波 a（wave12a 定谳，已对抗复核）

1. **5399c87f5：712 根 A 已清，missing 26→23**——纯转发 shim（`src/libp2p/stream/bufferstream.cheng` 仅一行 import）具名空间调用 `callTarget` 穿透解析。根因（实测钉死）：大规模编译单元（245 sourceContexts）下纯转发 shim 的 context 条目不进前端 `sourceContexts[]`，`TypedExprSourceContextLookup` 早退 → callTarget 空 → 落 `PrimaryBodyIrAppendI32Assign` 712 通用兜底；3 文件小 repro 不触发（规模依赖，census-gap 陷阱族的又一实例）。修复（97348ec3b 同款模式）=新增 `PrimaryBodyIrLookupSourceFunctionReturnTypeViaReexport`，复用已验证纯转发 shim 判据（`SourceIsPureForwardingShim`/`SourceOwnImportTargets`），窄门仅 `stmt.callTarget==''` 且 RHS 为零实参具名空间调用，命中只回写局部拷贝 `callTarget`/`callTargetSourcePath` 两字段，原 emit 链路原样接管——零新增发射，预测器天然锁步。三个函数（muxerResetStreams/muxerClearStreamState/handleFrame）逐字节同形，一次修复三合一，**族 C 全清**。边界（诚实）：窄门不覆盖非零实参穿透 shim 调用（本前沿未见）；前端 sourceContexts population 根治（方案①）未做，留独立线。
2. **712 族根因改判存档**：旧"聚合写回定长数组元素"假设（wave10 案卷记的方向：卡 3000+ 行巨 realizer `PrimaryBodyIrAppendI32Assign`，需 node-primary+poison 方法论整族攻坚）被本波 6 组 repro 证伪，改判为两条独立根，不可一次性合并修：**根 A**=纯转发 shim 具名空间调用 callTarget 穿透（上条，已修）；**根 B**=字段写入 RHS 为裸全局变量读——标量值槽解析器 `PrimaryBodyIrContextScalarValueSlotForText`（`primary_object_plan.cheng:37960` 起 byteCount 分类调度）对"字段写入语境下的全局变量名"这条读取路径未覆盖，`valueSlot` 落空后续 ptr/i32 分支均不匹配而维持 -1，直落 712 出口（`msquicTls13ComputeSharedSecret`：`state.localKeyShareGroup = msquicTls13ServerLocalKeyShareGroupCache`，标量字段=全局 int32 缓存变量）。根 B 未修——需在该分类调度里补一条"RHS 是已知全局变量名 → GlobalLoad 取值槽"分支，与局部变量/形参路径并列；风险中等（单点、标量、无聚合宽度问题，但改动点在高频共享 realizer 内，改前需先摸清该 realizer 依赖 valueSlot<0 兜底的其余调用形态，评级=需完整验证链的重构级，非一行小补丁）。
3. **wave10 撞名警示已归档**：census 报告只给函数名不给文件，`handleFrame` 本仓有两个同名定义（真凶 `muxer.cheng:359`／撞名陷阱 `yamux.cheng:452`），本次修复按文件路径精确定位交叉核对，未误踩。

## 7-09 missing=23 全前沿 12 族 census 表（wave12a 后，诊断车道产出，未落修复）

方法：`ZC_NOT_READY idx=N/23` 逐行反查 `primary_object_plan.cheng` 中对应 bail 号的 `PrimaryBodyIrAppendInvalidOp` 落点，读取该函数源码逐行核对 `slot_diag`（行号/操作数）。12 族=本诊断车道识别过的全部族（含已清的族 C），当前 11 族仍开放，合计 23。

| 族 | bail | 数量 | 状态 | 一句话根因 | 代表函数 |
|---|---|---|---|---|---|
| A | 91 | 3 | 未修 | 表达式体聚合构造尾表达式吞空——whole-body 单表达式裸构造器（无 `return`）触发"0 block"兜底 | initMuxerStreamState/initStreamState/newConnection |
| B | 44 | 2 | 未修 | call-arg 降级 poison 通用捕获码，两种不同实参形态（嵌套构造器实参 / 下标+字段链实参）共享同一出口，需分别覆盖 | yamuxConnection/findPeerIndex |
| C | 712 根A | 0（已清） | **wave12a 已修**（5399c87f5） | 纯转发 shim 具名空间调用 callTarget 穿透，见上 | muxerResetStreams/muxerClearStreamState/handleFrame |
| D | 712 根B | 1 | 未修 | 字段写入 RHS=裸全局变量读，标量值槽解析器未覆盖"全局变量名"路径，见上 | msquicTls13ComputeSharedSecret |
| E | 709 | 1 | 未修（根因已钉死） | `//` 尾随注释词法泄漏——Cheng 词法层唯一承认的行内尾随注释是 `#`（`ParserStripLineComment` 仅认 `ch=='#'`），`//` 及其后文本原样保留进 `surfaceText`，落在含二元运算符的赋值 RHS 末尾时污染 `TypedExprIrPopulateAssignValueMeta` 顶层运算符文本切分，切出的操作数文本带着注释垃圾找不到值槽；全仓 `grep -rn '  //' src --include='*.cheng'` 实测 731 处站点，多数因落在无害语境未暴露 | jsonParseRawString |
| F | 801 | 7 | 未修（按 detail1=(failIndex<<8)\|failCode 解包 4 子族） | 通用构造器/return 解析器多分支共享出口码，需分开修：F1(failCode=9×4，`Ok[T]`尺寸二次解析不一致 / `Err[T](Error(x))`被误当构造器校验)、F2(failCode=3×1，返回值是下标读非构造器调用形)、F3(failCode=4×1，jsonParseArray 内具体 return 未二分定位)、F4(failCode=60×1，字段值=`Call(...).field` 复合链未覆盖) | HostDialTextOwned/HostDialPeerTextOwned/getPeer/dialPeer/msquicConnImplSentPacketAtStore/jsonParseArray/quicPacketHeaderDecode |
| G | 711 | 4 | 未修 | 跨模块类型（Connection）/参数化泛型类型（Option[T]）字段写入，`PrimaryObjectMetadataTextStable` 判字段类型文本"不稳定"，具体分支（空串/泛型方括号/byteCount=0）未 trace 二选一 | noiseSecure/plaintextSecure/tlsSecure/dial |
| H | 805 | 1 | 未修 | `if cond: a else: b` 语法糖字符串返回，已读的 805 代码只覆盖 `cond ? a : b` 三元 token 扫描，处理 if/else 表达式返回的姊妹分支未定位 | udpNormalizeHost |
| I | 93 | 1 | 未修 | 命中互递归前向声明桩（无 `=` 无体，仅签名）而非稍后出现的真实定义，census/plan 把纯声明桩当独立可编译目标遍历 | jsonParseValue（前向声明 json.cheng:854，真实实现在 909 行） |
| J | 8548 | 1 | 未修，**高危语言语义**（不建议 backend 单方面动手） | `void*(str)` 裸指针值转换语义未定义（str 无单一裸指针表示，取 buffer 指针还是胖指针结构体地址未拍板），wave-36 已知故意 poison 点，是语言设计问题非纯 backend bug | isNullText |
| K | 40 | 1 | 未修 | 非 InvalidOp 网关，是"已发射机器码窗口内出现真零字"的独立扫描器（`PrimaryObjectPlanCaptureBodyIrWordDetail`）命中：IndexedStore（聚合构造器值存入定长数组元素，target_size=6144）编码窗口内某条指令编码函数退化成"编码失败返回 0"而非报错，具体是哪条 LDR/STR/ADD 未定位 | pushCopy |
| L | primary_fill_failed | 1 | 未修 | `PrimaryBodyIRFillBlocks` 整函数体 fill 相位中止（比单语句 bail 更底层），顶层"首个零字"汇总（base_slot_size=6320/call_target=EmptyBytes）高度提示嫌疑句=`state.conn = conn`（6320B 聚合形参整体拷贝）或 `state.rxBuffer = EmptyBytes()`（裸调用结果存字段），未二分定位到底哪一句 | yamuxReinitState |

合计 23（11 族未修 + 1 族已清）。

**未完全钉死项（如实报告，本诊断车道预算内未展开，非"其余若干"糊弄条目）**：jsonParseArray 具体触发 return 语句（族F/F3）；udpNormalizeHost 处理 `if/else` 表达式返回的姊妹代码路径（族H）；noiseSecure/dial 各自 `assignFieldType` 实际文本值（族G）；pushCopy 具体是哪条指令编码函数退化为 0（族K）；yamuxReinitState 到底是 `state.conn=conn` 还是 `state.rxBuffer=EmptyBytes()` 触发 fill 中止（族L）；HostDialTextOwned/HostDialPeerTextOwned 两次类型形状查询各自的具体字节数（族F1a）。六项均建议各自配一次 `CHENG_PRIMARY_OBJECT_TRACE_FILTER=<函数名>` 单独复现，半小时量级可逐个钉死。

## 7-09 第十二波 b（wave12b 定谳，五落地，missing 23→12）

1. **ca1afe370：族A 91×3 全清**（-3）——`typed_expr.cheng` `TypedExprIrAppendStatementsForScope`(WithFactsAndExprLayer) 表达式体聚合构造裸尾表达式行（无 `return` 的多行聚合构造函数体）被误提升为独立语句，丢弃 binding 致空返回折叠失效，落 pobj 空块兜底 bail=91。修复=两函数各加纯增量护栏：非绑定行且行首 `Identifier(` 解析为本地聚合类型（`fieldCount>0`）且非可见函数时跳过该行 fact 提升。initMuxerStreamState/initStreamState/newConnection 三清；`TypedExprIrAppendStatementsForScopeFromExprLayer` 同构缺口是死代码（零调用点），启用时需补同款护栏。
2. **259305903：族B 44 之一 yamuxConnection 清**（-1）——`PrimaryBodyIrAppendCallArgs` 不支持聚合构造器作实参（`multiaddress.MultiAddress(raw:...,data:EmptyBytes())` 形态），新增窄分支复用 `PrimaryBodyIrAppendAggregateConstructorToSlot` 物化聚合实参，miss 照旧 poison。
3. **b72ca5b35：族G 711×4 + 3 同根附带清**（-7）——`TypedExprTypeContextIndexAdd` 对跨模块同名聚合类型（Connection×4/MultiAddress×3 处声明）全局撞名保守投毒 `entryContextIndexes=-1`，丢弃"读文件自身 import 图=权威消歧证据"；新增 `TypedExprFieldContextLookupViaImports`/`TypedExprDeclaredTypeContextLookupViaImports`，只在 `currentCtx.importedModules` 内找唯一候选，≥2 候选保持保守失败（窄门模式）。noiseSecure/plaintextSecure/tlsSecure/dial 四目标 + HostDialTextOwned/HostDialPeerTextOwned/yamuxConnection 同根附带三清。**撞名 repro 基线是静默 miscompile（census=0 但 RC=1）比 bail 更隐蔽**，是本波最高价值发现——RC 层面才暴露的错误分类比响亮 bail 更需要专门 mutation 验真流程。
4. **08f69f7a4：709/707 json `//` 尾注释非法源码修正 + 语言边界定谳**——`cheng-formal-spec §1.1` 无注释类别，`ParserStripLineComment` quote-aware 只认 `#`，`//` 非 Cheng 语法；`json.cheng:790/:533` 尾注释原样泄漏进 `surfaceText`，顶层 `+` 文本切分把注释切进右操作数，求值槽失败落 709/707 兜底。修复仅两处触发字节 `//`→`#`，不做全仓 `//` 站点（实测 731 处）机械 sweep（字符串内 `https://` 必误伤）。**系统性建议（未实施）**：词法层对代码后 `//` 应响亮 `LexError`，当前只是应用层单点修正，是防线建议非编译器根治。
5. **c5da3783d：yamux `FindOrCreateSlot` 槽型静默改写污染根治**——`state.initiator = streamconn.ConnectionDirection(conn)==streamconn.Outbound` 走文本比较赋值分支，`FindOrCreateSlot`①把 Cmp 结果别名写进 state 参数槽 ②对已存在异型槽原地把 `LocalAggregateTag` 静默改写为 `LocalI32Tag`，污染此后所有 state 引用。修复新增 `assignFieldName!=''` 分支，只读 `FindSlotIndex` 定位根槽 + `LookupSingleFieldMeta` 权威解析字段。**udpSlotResetAt 由静默 miscompile 转为响亮 718**——诚实口径：本提交自身不减 missing 计数（只是把一个隐蔽错误变成显式 bail，仍是 not-ready），718 家族的真正清零由下一波 cf03c7bfb 完成；这是"先钉响亮、再补接管"的两步流程范例。`backend2_lower.cheng:3207` 同款分支未镜像（已知债，见下节汇总）。

## 新深层缺陷立卷（w13 rootbglobal，诚实拒绝出补丁，**已被 wave14 改判并根治，见后节**）

**裸全局 Bytes 变量物化 len 丢 0 = pre-existing 静默 miscompile**：对内建 `Bytes` 类型的裸全局变量（非字段、非局部）物化时，其内部 `len` 字段在特定路径下读取丢 0；范围限定在内建 `Bytes` 类型名单的上游特判分支，不是通用聚合布局问题。本波已产出 REJECTED 补丁（未采纳，因扩大打击面风险高于收益）+ 6 个夹具存证（对照复现该缺陷但不落地修复）。**712 根 B**（`msquicTls13ComputeSharedSecret`，标量值槽解析器 `PrimaryBodyIrContextScalarValueSlotForText` 未覆盖"字段写入语境下的全局变量名"路径）被此缺陷阻塞：字段写入 RHS 是全局变量读时，若不先修好该全局变量本身的物化（含 Bytes len 丢 0 这类前置缺陷），再接分支会在错误的基础上叠加新分支，属于"先物化后接分支"顺序问题。修复序已定：wave14 先根治裸全局 Bytes 物化，再回头补 712 根 B 的标量值槽分支。

## 7-09 第十三波（wave13 定谳，两落地，missing 12→8）

1. **b05e258fe：跨模块聚合布局解析器一跳限制→多跳穿透**（-3，missing 12→9）——`PrimaryBodyIrSourceObjectLayoutViaImports` 只一跳 import 扫描；`PeerInfo.pubKey: Option[PublicKey]` 经 `crypto.cheng` 引入但真声明在 `crypto/types.cheng`，且 `crypto.cheng` 非严格纯转发壳（自有类型+函数，不满足 `PureForwardingShim` 门槛）——一跳 miss 级联 `PeerStore`，findPeerIndex 落 bail=44。修复新增 `PrimaryBodyIrSourceObjectLayoutDeclPathViaReexport`（深度上限 4+环检测，复用 `SourceOwnImportTargets`/`SourceModuleDeclaresType`），撞名判定改按**最终真实声明文件**去重（比 `PureForwardingShim` 门槛更精确：只能把 0 声明者 miss 转成唯一命中或同结果 poison，不动已成功单跳路径）。findPeerIndex + 同布局依赖链 dialPeer/getPeer 三清。130k 行自举 rc=0（9.3s 无回归）。
2. **cf03c7bfb：下标字段元素比较赋值——`slots.useLenField[idx]` 形态严等接管**（-1，missing 9→8）——`c5da3783d` 新分支只认裸标识符字段，`assignFieldName` 带 `[idx]` 后缀时 `ParserIdentPrefix` 剥下标查到整个 `bool[64]` 数组字段 meta（size=64），严等 `{1,4}` 必不过→无差别 poison 718。修复纯加法 elif（123 行新增 0 行改删）：解析 `arrayField[idx]`（无 `.subField` 尾）、查数组字段 meta 排除动态 seq、元素宽度 ∈ `{1,4}` 才接管，`SeqAddHeaderPtrSlot(base+offset)+Madd(idx*elemSize)` 与既有固定数组寻址逐字同构，`Cmp`→新标量槽→`FieldStoreTag`；其它形状照旧 718。**udpSlotResetAt 718 清除**，与上一波 c5da3783d 的"先响亮化"步骤合成完整两步修复闭环。26 行最小 repro 100% 复现基线（不需大闭包），int64[8] 反向验证宽度 8 仍正确 poison（未放宽）。

## 7-10 第十四波（wave14 定谳，三落地，missing 8→3）

1. **55f2a6e0f：全局聚合整值赋值幽灵栈槽根治 + 712 根B 窄分支接回**（feed 8→7）——真根因（上节"新深层缺陷立卷"记的"限定内建 Bytes 类型名单"假设被本波 Pair 标量对照组**证伪**）：`assign_copy_local` 整值拷贝快路径对 LHS 是模块级全局变量（不限 Bytes，任意 str/聚合皆中招）缺"LHS 是全局"防护，用裸绑定名建幽灵局部栈槽接收拷贝，真全局数据标号从未被写（BSS 恒零）；紧邻的 str-only 分支早有同款防护（`stringAssignLhsIsGlobal`），唯独这条更早快路径缺失。修复=快路径补齐 LHS-全局门禁（8+1 行），改道到已验证的全局写路径；同时把此前 REJECTED 的 712 根B 窄分支（`GlobalSeqAddressSlot`+`FieldLoadTag`，读侧语义本就正确）接回 712 出口前，严格形态匹配+poison-on-miss。**msquicTls13ComputeSharedSecret（712 根B）清除**。验证：7 个运行时值断言 repro（含精确镜像 handshake13.cheng:1259-1262 的 msquic_mirror）全部 `--emit:exe` 真跑 + 两处 git-revert-rebuild mutation 验真 + 自举 rc=0 + 阶梯 5/5。已知债：`backend2_lower_stmt.cheng:2827-2856` 逐字节同款镜像未同步（见文末 backend2 债汇总）；另立卷 `assert(callExpr,msg)` 失败分支不可靠+失败路径 SIGSEGV（未修，已规避，见下）。
2. **05afd7e83：jsonParseValue 前向声明桩误注册 + jsonParseArray `//` 注释续行吞并**（独立测算 feed 8→6，与其余两提交合并计入总账 8→3）——`jsonParseValue`（bail=93）：`json.cheng:854` 无 `=` 的纯签名前向声明被 `TypedExprBuildSourceContextBorrowed`/`MetadataContextFromProfile` 当独立函数注册，backend 合成隐式 return 必败；修=`TypedExprFindTopLevelTextToken(declHeader,'=')` 顶层无 `=` 跳过注册（两处镜像），真实定义（909 行）正常注册。`jsonParseArray`（bail=801 F3 子族）：`TypedExprIrAppendUnrepresentedTopLevelBodyStatements` 剥注释判空只认 `ParserStripLineComment`（仅识别 `#`），函数头后纯 `//` 注释行存活，注释内未配对单引号内 `[` 被续行括号深度扫描误判未写完，续行 join 吞并整个函数体；修=新增 `ParserStripLineCommentSlashAware`（`#` 与 `//` 双识别），只替换 4 个依赖剥注释驱动续行判定的消费点，不动 25+ 调用点共享的本体。验证：json.cheng 单文件 census 17→14 两目标净消失；独立 runtime repro mutation 验真（基线静默垃圾值 exit 1/修复 -1/1/0 exit 0）；阶梯 5/5。**复核新立卷（pre-existing，非本次回归）**：同函数 ~20890 行多行**控制头续行分支**存在**第 5 处**同款 `ParserStripLineComment` 消费点未升级到 slash-aware 版本，复核员 `fam_ctrlhdr_repro` 实证补丁前后行为一致的同族静默 miscompile 缺口，留后续波清扫。
3. **5ebc2295d：str 三元 quote-aware 切分 + `Value(x).field` 本地类型别名穿透**（独立测算 feed 8→6，合并计入总账）——`udpNormalizeHost`（bail=805）：`PrimaryBodyIrAppendStrTernaryDeclValue` 的 `?`/`:` 顶层切分用非 quote-aware `TypedExprFindTopLevelTextToken`，被臂字面量 `::1` 内部 `:` 击穿；修=3 处调用点换已有 `TypedExprFindTopLevelTextTokenStringAware`（无引号输入逐位同结果）；补 diag6 缺口：if/else 经 `IfExprToTernaryText` 文本转换复用同一 805 出口。`quicPacketHeaderDecode`（bail=801 detail1=316）：diag6"Call().field 无分支"假设被实测推翻，真根因=`innerType` 为本地类型别名（`QuicPacketHeaderVarIntDecoded=quic_varint.QuicVarIntDecoded`）时未穿透别名查字段（别名声明自身零字段）；修=仿 `AppendAggregateConstructorToSlot` 既有别名穿透模式 13 行+2 处传参。**`msquicConnImplSentPacketAtStore` 诚实 no-safe-fix**：返回值是下标读表达式非构造器，需全新"任意 lvalue 链求地址+整体拷贝"基础设施，且共享入口回退分支须先枚举全部调用点下游预期，结构分析入卷留独立线（即剩余 3 前沿之一，见下）。已知债：backend2 自有约 10 处独立三元门槛判断可能同款 quote-aware 缺口（不在本 driver 闭环，未验证未修）。
4. **wave14 净效果**：三提交合并 feed missing **8→3**。
5. **w14-pushcopy 复核 FAIL 存档（对抗复核体系立功，补丁未落地）**：pushCopy（bail=40）census 层面已清零，但独立运行时 repro 二连 push 覆坏首元素——`RUN_EXIT=12`，双树（主树+隔离净树）100% 复现。真伤疑点在 `elemSize=24`（非 2 次幂）下标地址计算或拷贝阶段寄存器复用，未定位到具体指令。教训两条入卷：①**census 清零≠修好**，运行时 repro 必须覆盖多元素场景（单元素场景可能巧合过）；②`--emit:exe` 不带 `--link-providers` 会静默走 cold-C 回退，是**假阴性口径陷阱**（看似过了实则没测到 pobj 路径）。pushCopy 补丁本波未落地，wave15 真修中。
6. **新钉死缺陷（55f2a6e0f 同波点名，未修，已规避）**：`assert(callExpr,msg)` 失败分支不可靠 + 失败路径 SIGSEGV，与本波修复无关的既存缺陷，未展开根因，本波仅规避（repro 未触发该断言失败路径）。

**rootbglobal 案卷改判**：上节"新深层缺陷立卷"记的"裸全局 Bytes 变量物化 len 丢 0，限定内建 Bytes 类型名单上游特判分支"一说已被本波证伪——真根因是 `assign_copy_local` 快路径缺 LHS-全局防护，与 Bytes 无关，任意全局 str/聚合皆受影响；已随 55f2a6e0f 根治并接回 712 根B 窄分支，msquicTls13ComputeSharedSecret 清除。原案卷保留作诊断路径存档，不再是攻坚中状态。

## 7-10 第十五波（wave15 定谳，三落地，missing 3→0，★S2 ZC 墙清零）

1. **0eaed21e8：pushCopy（bail=40）清 + w14 FAIL 反转定谳**——pobj 两处改动与 w14 逐字相同（`LocalAggregateTag` 并入 `LocalStrTag` 分支，发射器+预测器锁步，复用已验证 6 字 LDR/STR 逐 8 字节拷贝），lldb 寄存器/内存/watchpoint 追踪反复验证 `index*24` 寻址与 1/2/3 连续 push 全正确。**w14 复核 FAIL 真根定谳（非代码缺陷）**：w14 补丁文件 hunk 头声明 88 行实际 91 行，`git apply` 按头截断静默吞掉测试尾部 echo+return，残缺测试恰好撞上 HEAD 自带的独立缺陷——多条件 `||` 链作函数体最后语句时 fallthrough 分支目标错等于 true 分支（干净 HEAD 独立复现，最小 repro 已存证据，未修留独立线）。验证：1/2/3-push 交叉 repro（`--emit:exe --link-providers`）RC=0 + 邻元素哨兵；mutation（错改第三块 LDR 偏移）RC=4 精确捕获；阶梯 5/5；feed 3→2；干净 HEAD 出树独立复验补丁自完整；复核 pass（独立复现"补丁文件损坏+撞无关缺陷"定谳非甩锅）。边界（诚实）：IndexedLoad 读侧同族缺口未碰；trailing-|| 缺陷机器码级细节复核员未 lldb 级钉死。
2. **8ce442bcd：`return globalVar.arrayField[callExpr]` 整聚合元素返回窄门 — msquicConnImplSentPacketAtStore（801）清**——形态钉死：整聚合数组元素做返回值且下标是函数调用，`AppendAggregateConstructorToSlot` 只认构造器语法，failCode=3；修复=新增 `PrimaryBodyIrAppendReturnFieldArrayIndexedElemValue`（纯加法，4 行派发插入），组合三个已验证原语——cf03c7bfb 的 `SeqAddHeaderPtrSlot`+`Madd` 元素寻址 + 55f2a6e0f 的 `FieldLoadTag` 整值读 + 既有 `AppendWholeCallExprToSlot`（~26 调用点）补下标调用环；任一步 miss 原样落回既有 801 出口零重叠。验证：3 组（slot,idx）整聚合往返真跑（`--link-providers`）rc=0；复核员另构 4 个边界场景（本地根/算术下标/嵌套调用下标）全正确；mutation 对照；阶梯 5/5；feed 3→2；复核 pass。
3. **26e8cb05c：isNullText 违规 `void*(str)` 判空改写为 spec 合法 `len(text)<=0` — 8548 清，★ZC 墙清零**——定谳（a 类）：spec 已定义且定义即禁止——`string_abi_contract.abi.str_direct_c_abi=forbidden`，str 24 字节布局唯一逃生口 `@abi_internal`，str 判空唯一合法写法 `len(s)==0`；backend 8548 响亮 poison 是正确防线非语义空白。修复=应用层语义等价改写 `len(text)<=0` + 移除孤儿 `chengPtrToU64` import，零 backend 改动。验证：5 项值断言真跑 PASS + mutation 5 项全翻转；阶梯 5/5；feed 3→2；复核 pass-with-notes。**★里程碑**：三补丁 combo 合并终验 **ZC_NOT_READY_TOTAL 3→0**，S2 feed ZC 墙全清（本战役 wave7 起 29→0，26 个根修提交）；残留 rc=2 系更深非 ZC 族前沿（`cheng_libp2p_main__HostDialTextOwned__L2133` statement_sequence 类），三补丁文件零交集非回归。
4. **静默 miscompile 三件立卷（比 bail 危险，wave16 攻坚中）**：①arrayField[idx]=聚合整值写侧静默错（8ce442bcd 点名，牵连姊妹写函数 msquicConnImplStoreSetSentPacket，本验证用逐字段写绕开）；②双层嵌套字段写不落地（8ce442bcd 复核员发现，`Grid.rows[i].cols[j].a=v` 形状不同于①，排查范围或更广）；③trailing-|| 尾语句 fallthrough 目标错（0eaed21e8 定谳，多条件 `||` 链作函数体最后语句时命中 true 分支，干净 HEAD 独立复现，机器码级细节未 lldb 钉死）。三件均未修，均比响亮 bail 更危险（无 poison，静默产出错误值）。
5. **持留补丁 w15-ctrlhdr（未落地）**：wave14 复核立卷的"控制头续行分支第 5 处 `ParserStripLineComment` 消费点未升级 slash-aware"缺口本波尝试修复——typed_expr 5 处换成 `ParserStripLineCommentSlashAware`，但 mutation repro 被 parser 主路径遮蔽（同一续行判定另有更早解析分支先行接管，改动点未被该 repro 实际触达，无法验真），补丁未落地，wave16 与其余 ctrlhdr 缺口联合修复中。
6. **新前沿**：rc=2 残留 = statement_sequence 类 not_ready（非 ZC 族），已知 `HostDialTextOwned__L2133`（switch+`Result[Muxer]`），总量 wave16 census 中。

## 剩余前沿（wave14 时点存档，已被 wave15 全部清零——见上节）

| 函数 | bail/族 | 定谳出处 |
|---|---|---|
| isNullText | 8548 | 高危语言语义（`void*(str)` 裸指针值转换未定义），不建议 backend 单方面动手，需语言层拍板 |
| msquicConnImplSentPacketAtStore | 801 | wave14 定谳=返回值是下标读表达式非构造器，需全新"任意 lvalue 链求地址+整体拷贝"基础设施，结构分析或窄门待评估 |
| pushCopy | 40 | census 已清零但运行时 repro 二连 push 覆坏首元素（RUN_EXIT=12），真伤疑在 elemSize=24 非 2 次幂下标地址计算/拷贝寄存器复用，wave15 真修中 |

**新口径（op-lane 2026-07-09 晚改动后生效）**：烤 driver / 探针命令必须显式传 `--out:`，不再依赖隐式默认输出路径——省略会撞 op-lane 改动后的新默认行为，历史命令片段（本文档 §6）如需重跑先补 `--out:` 参数。

## 方法论入卷：detail1 全局单例陷阱

`primaryAggCtorLastFailIndex`/`primaryAggCtorLastFailCode`（`primary_object_plan.cheng:47-48`）是模块级全局变量，仅在函数入口重置一次（`:25616-25617`），函数体内多条失败路径各自写入不同 `FailCode`（1-7 等）后即返回——**同一次调用内多个缺陷会互相遮蔽**：若诊断只看最终 `primaryAggCtorLastFailCode`，只能看到"最后一次赋值"，更早触发的失败码已被覆盖，census/detail1 报告因此可能低估真实缺陷数或指向错误的失败分支。诊断该家族问题时必须结合源码逐分支核对，不能只信 detail1 单值。

## backend2 镜像债累计五处（默认关不构成生产回归，切默认前必补）

wave10 起 pobj（老后端）侧陆续修复的五处缺陷，`CHENG_BACKEND2` 侧同构代码均未跟上：①**len 内征**（`backend2_lower_slots.cheng`，seq 字段 `len(...)` CALL 内征扩展，wave11 26bd4487b 对应修复未镜像）；②**FieldLoad/FieldStore 拷贝循环 + predictor**（`backend2_emit_ops.cheng`，byteCount>32760 分窗折叠，wave11 a2983f62d 对应修复未镜像）；③**yamux 比较赋值分支**（`backend2_lower.cheng:3207`，`FindOrCreateSlot` 槽型静默改写根治，wave12b c5da3783d 点名未镜像）；④**跨模块聚合布局解析器 util 副本**（`backend2_lower_util`，多跳 re-export 穿透，wave13 b05e258fe 点名未镜像，沿 97348ec3b/5399c87f5 既有惯例）；⑤**全局聚合整值赋值快路径**（`backend2_lower_stmt.cheng:2827-2856`，与 pobj `assign_copy_local` 逐字节同款 LHS-全局幽灵栈槽缺陷，wave14 55f2a6e0f 点名未镜像）。五处均因 `CHENG_BACKEND2` 默认关闭而不构成当前生产回归（trio44 repro 在 `CHENG_BACKEND2=1` 下实测亦不复现缺陷），但一旦计划切换默认后端，必须先补齐这五处镜像，否则切换即引入静默回归。


## 2026-07-15 追记：export-roots 第 5 根（libp2p_network_discovery_snapshot）

**背景**：#43 v2（`platform/harmony/ChengGuiDemo/entry/src/main/cpp/cheng_gui_host_adapter.c` 新增 `cheng_host_nodes_snapshot_refresh` 桥）需要 `libcheng_feed_harmony.so` 额外导出 `libp2p_network_discovery_snapshot`。本节登记配方；S2 全量重建是独立大烤。

**核验结论：feed_core.o 无 committed 构建脚本**——`rebuild_publisher_prebuilt.sh` 只编 publisher；feed 仅有文档 §6 手工探针 + CMake `if(EXISTS)` 门。下次手工构建必须用 5-root 配方：

- 旧：`--export-roots:NimMain,libp2p_node_init_slim,libp2p_node_start,libp2p_feed_node_contents`（4 root）
- 新：`--export-roots:NimMain,libp2p_node_init_slim,libp2p_node_start,libp2p_feed_node_contents,libp2p_network_discovery_snapshot`（5 root）

**装机一致性**：host 把第 5 符号解耦为独立惰性 dlsym+失败态缓存。旧 4-root `.so` 配新 host：`cheng_host_nodes_snapshot_refresh` → `{"ok":false,"error":"discovery_snapshot_symbol_missing"}`，不拖死 `cheng_host_node_contents_refresh`。真出数据需同批换装 5-root feed `.so` + 新 host。

**Kotlin 模板实参定谳**（Android `chengNodesSnapshotForRuntime` / `networkDiscoverySnapshot`）：`sourceFilter=""`、`limit=64`、`connectCap=4`——鸿蒙桥同参。

## 2026-07-23 追记：feed 探针当前墙栈（cheng-fusion 车道，案卷 ~/cheng-patches/20260723/feed_wall/）

**本文 §1-§6 描述的 SIGBUS/58-missing/bare-@exportc 三墙全部不再代表当前状态**：SIGBUS 已死（wave7 `3614eac19`），58-missing 被 975afc114 惰性骨架切换后的新缺口面取代（07-15 台账：5-root census 82 条/去重 57）。2026-07-23 实测当前墙栈（driver=今 10:35 烤 `/tmp/official_new15/cheng` 快照 sha256=30efb142…，树=HEAD bab6fcaa+在飞 WIP）：

1. **墙#0（第一堵，typed-expr 相位 rc=1）**：`typed expr: duplicate structured metadata kind=ctx_import_alias … name=types`。9cfe5dc0（7-18，T79）给 build-index Pass-2 引入 `TypedExprBuildIndexRequireFreshMetadataKey`，对 `ctx_import_alias` 按 (sourcePath, qualifier) 强制唯一（typed_expr.cheng:26488-26494）；main.cheng 裸 import 三个叶名同为 `types` 的模块即 panic。spec 无叶名唯一约束、全仓 12 文件同款（main.cheng×3 对/switch.cheng client×4/standard_switch.cheng server×4/gossipsub.cheng types×2/unimaker_symbol_bridge.cheng protobuf×2 等）→ 按「合法语法只修不绕」修复归属编译器：注册点改 `hardConflict=false` 走既有 Unique/Ambiguous/Missing 三态（`Register` 已实现 Ambiguous 翻转，查询侧全量歧义感知，未使用重复限定名无害）+ close 校验/冻结投影 3-4 处对 Ambiguous 跳过 per-row exact 校验。cheng_exec_diff 微分：7-21 树 driver 同 fixture rc=0、今日 driver rc=1 → 门禁激活在 7-21 烤之后。最小复现 3 行（evidence/repro_dup_entry.cheng）。
2. **墙#1（墙#0 之后，parser 相位 rc=1）**：影子树战术别名绕过墙#0（补丁 feed_alias_probe_shadow_only.patch，被改文件裸限定名使用数全 0、语义零变化）后，2-root/5-root 探针双双 rc=1 `parser value expr: binding initializer lhs is not a declaration`（~8s）；`import std/strings`+`return 0` 三行文件同崩（变体 `field name missing`）。7-21 树 driver 同输入过前端（只死于更晚的 getenv provider 契约漂移）→ 7-21 后 WIP parser 回归（T79 车道）。**移动目标**：该 panic 字符串今 11:00 已从 parser.cheng 消失（并行车道理手中），需新烤 driver 复测。
3. **墙#2（census，今日不可测）**：07-15 记录值 82/57（6650×7/missing_call_target×12/801×12/44×7/810×1/长尾），今日因 #0/#1 到不了 lowering，无法重测。
4. **环境债**：`artifacts/backend_driver/cheng`（7-21）对 ohos 探针即死（getenv 签名 mismatch，provider 契约漂移）；7-23 01:51 最近重烤失败（full compiler materialize failed）。树 driver 与新 sources 已不自洽，探针须用当日现烤 driver。

复测配方（parser 车道落手+新烤 driver 后）与全部证据（复现/日志/影子补丁/driver 哈希）见案卷 REPORT.md。

