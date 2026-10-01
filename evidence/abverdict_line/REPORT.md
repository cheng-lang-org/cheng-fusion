# ABVERDICT_LINE 定谳报告 run2（harness 重启重派续跑）

基座: HEAD 11a16cd12（git archive 快照克隆根; 冻结于 run2 启动时点）
- A 臂 = HEAD 态: .rebuild/abverdict_line/clone_roots/abverdict_a
- B 臂 = 仅回退 src/quic/native_runtime.cheng@ac41af29e（树差已核 /usr/bin/diff -rq = 恰该一文件）: .rebuild/abverdict_line/clone_roots/abverdict_b
- 编译器 = run2 新烤 kd2_abv_1（CLT cc -O2 bootstrap/cheng_cold.c，1GiB 守卫轮，三烤后钉 binary sha 单驱动烤一切）
- 源差语义: ac41af29e..HEAD native_runtime.cheng +88/-20 = 71dec35b0 泵门 v1+v2 还原（v2=recv 所有权双门+scan-park 分形态）; B 臂 = 无双门的 pre-v1 形
- run1 报告存档: REPORT_run1.md（run1 基座 c03ad5470, 其 "(无)闭包变更" 行系 run1 报表 bug, 实际 ac41..c03a 有 native_runtime 47+/20-）

## 1) 编译器无罪复核
- git diff ac41af29e..11a16cd12 -- bootstrap/ 行数 = 0（0 = C 链自最后已知好烤时点零变化; HEAD 前进未触编译器域）
- ac41af29e..11a16cd12 移动闭包（quic/std/vpn_proxy）变更文件: src/apps/vpn_proxy/vpn_proxy_main.cheng, src/quic/native_runtime.cheng, src/quic/pure/frames_codec.cheng, src/quic/pure/frames_header.cheng, src/quic/pure/frames_varint.cheng, src/quic/pure/tls13_keyschedule.cheng, src/quic/pure/tls13_messages.cheng, src/quic/pure/tls13_transcript.cheng, src/quic/quictransport.cheng, src/std/crypto/sha384.cheng, src/std/os.cheng, src/std/result.cheng
- 三炉一致性（判等先钉 binary sha; cc 同源三烤字节/反汇编非确定为已知现象, 一切后续烤均钉 kd2_abv_1 单驱动, 驱动非确定性不进 A/B 差）:
```
three_bake_byte_1v2=DIFF
three_bake_byte_1v3=DIFF
three_bake_disasm_equal=NO
driver1_sha256=c3df5702d6c06eca148650f0896e5c6f3bf6fed5cdde3f1f7435dc3729ad5898
pinned_driver_for_all_bakes=kd2_abv_1
note=cc 同源三烤字节/反汇编非确定(run1 已见); 方法论=后续一切烤均钉 kd2_abv_1 单一二进制, 驱动非确定性不进 A/B 差
```
- 金丝雀 2/2（两行源金丝雀本轮已实拷入克隆根 src/tests/, run1 缺件 rc=3 的缺口已补）+ wdfs 绿保持:
```
ac_two_line_canary compile_rc=0 run_rc=0
ordinary_zero_exit_fixture compile_rc=0 run_rc=0
wdfs_peephole_r3_redgreen compile_rc=0 run_rc=0
```

## 2) A/B binary sha 与稳定性控制
```
pinned_driver1_sha256=c3df5702d6c06eca148650f0896e5c6f3bf6fed5cdde3f1f7435dc3729ad5898
core_A2_sha256=199a0f2710e777d650b34b010430108b31182f976e215f279ae44f4ebc76ebba
core_B2_sha256=8c265af196297f3e430c7dcbfce1b25b9fc8bd096fd660c2edcebe3a580dc651
--- sha_a2.txt ---
199a0f2710e777d650b34b010430108b31182f976e215f279ae44f4ebc76ebba  cheng_hy2_tun_core.o
fc5501aa7020bca7c5fd0b2a51ae4c86c09391078be95e12a6d5af50732d04ae  cheng_hy2_tun_core_b.o
f04326bf001a6cfb4bdd8f14baa20c71df5bb36be597d9cc36528f87a19f1983  core_runtime_provider_linux.o
d93b76f39dcb883b31a96b6ccc43ff70e74bb4e0d30979eb2080d65b1f2de39d  program_support_backend.o
128b4b1099f633c00173098d8ce9c060a5f8a48a606cb00b57f9896094c42067  program_support_host_runtime.o
--- sha_b2.txt ---
8c265af196297f3e430c7dcbfce1b25b9fc8bd096fd660c2edcebe3a580dc651  cheng_hy2_tun_core.o
fc5501aa7020bca7c5fd0b2a51ae4c86c09391078be95e12a6d5af50732d04ae  cheng_hy2_tun_core_b.o
f04326bf001a6cfb4bdd8f14baa20c71df5bb36be597d9cc36528f87a19f1983  core_runtime_provider_linux.o
d93b76f39dcb883b31a96b6ccc43ff70e74bb4e0d30979eb2080d65b1f2de39d  program_support_backend.o
128b4b1099f633c00173098d8ce9c060a5f8a48a606cb00b57f9896094c42067  program_support_host_runtime.o
--- per-object cmp (A2 vs B2) ---
cheng_hy2_tun_core.o DIFFERS
cheng_hy2_tun_core_b.o IDENTICAL
core_runtime_provider_linux.o IDENTICAL
program_support_backend.o IDENTICAL
program_support_host_runtime.o IDENTICAL
--- A2 vs A2_repeat (同驱动同源复烤, 必须 SAME) ---
cheng_hy2_tun_core.o IDENTICAL
cheng_hy2_tun_core_b.o IDENTICAL
core_runtime_provider_linux.o IDENTICAL
program_support_backend.o IDENTICAL
program_support_host_runtime.o IDENTICAL
--- 与 run1 交叉(仅供溯源: run1 A=c03a 基座 源侧已前进, 差异属预期) ---
run1_core_A=3772443b841be04c0401ca194a077074d33203175f8c05ac31ce8df9e25c9d47
run1_core_B=c5618d912012d107bbace1e62cbcb4d4c8c7a3210bd1582a158c94421b63702a
```
判读: A2 vs A2_repeat 同驱动同源复烤必须逐对象 IDENTICAL——不等则闭包烤非确定, A/B 对象差即含噪声、归因无效。

## 3) 反汇编: 按名拆分 + 位置对齐归一化窗口分析
```
SYMBOL_DIFF_REPORT=/Users/lbcheng/cheng-lang/.rebuild/abverdict_line/disasm2/per_symbol/SYMBOL_DIFF_REPORT.txt
DIFF_COUNT=13
DIFF_SYMBOL cheng_hy2_proxy_core_probe_status
DIFF_SYMBOL cheng_hy2_proxy_core_start
DIFF_SYMBOL cheng_hy2_proxy_core_status
DIFF_SYMBOL cheng_hy2_proxy_core_stop
DIFF_SYMBOL cheng_hy2_proxy_core_worker_entry_bridge
DIFF_SYMBOL cheng_hy2_tun_core_mem_diag
DIFF_SYMBOL cheng_hy2_tun_core_set_config
DIFF_SYMBOL cheng_hy2_tun_core_set_identity
DIFF_SYMBOL cheng_hy2_tun_core_start
DIFF_SYMBOL cheng_hy2_tun_core_status
DIFF_SYMBOL cheng_hy2_tun_core_stop
DIFF_SYMBOL cheng_hy2_tun_core_worker_entry_bridge
DIFF_SYMBOL cheng_hy2_tun_mobile_gui_snapshot_json
```
窗口分析（v2 结构优先口径: 外部引用全遮蔽的结构哈希 difflib 对齐, 对源函数集合分叉/内部 idx 错位免疫——
v2 还原使 A/B 源函数集合分叉, 首版按 idx 名保留引用的口径曾把调用错位区函数的调用点误判为差(1041 假窗), 已修正;
run1 对回归校准=恰 2 函数, 与 diffforensic_line align2 独立同判; disasm2/windows/WINDOW_ANALYSIS.txt 全文）:
```
(missing)
```
专项三函数按名核查:
```
msquicNativePumpCodeUnlocked NOT_PRESENT_AS_NAMED_SYMBOL
msquicNativeDialPumpReadyCode NOT_PRESENT_AS_NAMED_SYMBOL
msquicNativePumpCode NOT_PRESENT_AS_NAMED_SYMBOL
```
说明: msquicNativePumpCodeUnlocked/msquicNativeDialPumpReadyCode 为非导出内部函数, 对象内符号=cheng_cold_<内容哈希>_<idx>,
A/B 内容哈希不同致按名匹配天然失效(run1 NOT_FOUND 同因); 定位以归一化窗口分析替代, 专项名核查仅覆盖导出面。

## 4) or-of-shifts 探针判词
```
compile_rc=0
run_rc=0
or_term=0180000000000000
split_or=0180000000000000
right_alone=0080000000000000
signed_shr8=0080000000000000
driver1_sha256=c3df5702d6c06eca148650f0896e5c6f3bf6fed5cdde3f1f7435dc3729ad5898
verdict=GREEN
```
探针完整输出:
```
fixed_shl56=0100000000000000
var_shl_s56=0100000000000000
var_shl_64minusn=0100000000000000
signed_shr8=0080000000000000
uint_shr8=0080000000000000
or_term=0180000000000000
split_or=0180000000000000
split_xor=0180000000000000
split_s2_or=0180000000000000
right_alone=0080000000000000
left_alone=0100000000000000
pos_shl56=0100000000000000
pos_shl_64minusn=0100000000000000
u_shr=0080000000000000
u_shl56=0100000000000000
u_shl64minusn=0100000000000000
u_or=0180000000000000
u_xor=0180000000000000
fix_himask=00ffffffffffffff
fix_right=0080000000000000
fix_xor=0180000000000000
```

## 5) realshape 真形状夹具判词（diffforensic 交验证槽两件）
```
driver1_sha256=c3df5702d6c06eca148650f0896e5c6f3bf6fed5cdde3f1f7435dc3729ad5898
rotr64 compile_rc=0 run_rc=1 green=NO
rotr64_out:
RED rotr8 got wrong
pumpgate_base compile_rc=0 run_rc=0
pumpgate_pad  compile_rc=0 run_rc=0
pumpgate_variant_output_identical=YES
pumpgate_out_base:
OK pumpgate realshape green
pumpgate_out_pad:
OK pumpgate realshape green
realshape_verdict=RED
```

## 6) 证据仓外备份（每小时 GC 在扫, 双份）
```
backup_rc=0
backup_dest_1=/Users/lbcheng/cheng-fusion/evidence/abverdict_line
backup_dest_2=/Users/lbcheng/cheng-f24/abverdict_line
```


## run2 定谳四件套

1. **A/B binary sha 与 diff 结论**
   - A（HEAD 11a16cd12 含泵门 v1+v2）core sha256 = 199a0f2710e777d650b34b010430108b31182f976e215f279ae44f4ebc76ebba
   - B（仅回退 src/quic/native_runtime.cheng@ac41af29e）core sha256 = 8c265af196297f3e430c7dcbfce1b25b9fc8bd096fd660c2edcebe3a580dc651
   - 树差 /usr/bin/diff -rq 核验=恰该一文件; A2 同驱动同源复烤五对象全 IDENTICAL（闭包烤字节确定）; 其余 4 对象 A=B 且与 run1 跨驱动同 sha
   - 结构差分=恰 2 函数: f3881=PumpCodeUnlocked（A 1733/B 1426 行, 帧 0x440/0x3d0, v1 位置门+v2 recv 所有权双门+scan-park）、f3908=DialPumpReadyCode（+6 行, msquicNativeCurSlot=dialSlot 重钉）; 与源 diff 触及函数集精确对应; 其余 2316 函数指令流经 idx 错位校正后逐位恒等, 13 导出符号全等 → 发射忠实, A/B binary 差异=纯源侧单文件差异
   - 交付: binaries/run2_A/ binaries/run2_B/ + 仓外双备份; VPN lane 装机定谳: 挂死跟 A 走=quic 层3 债坐实; 跟 B 走=回编译器域重开取证

2. **or-of-shifts 判词: RED（真形状）/ GREEN（合成探针）——P1 活着**
   - 合成探针 int64_shift_semantics_probe: GREEN（or_term=split_or=0180000000000000, 连续第二轮）
   - 真形状夹具 rotr64_realshape（diffforensic 交验证槽）: **RED**（compile_rc=0 run_rc=1, RED rotr8 got wrong=丢 << 项）→ P1 缺陷在当代驱动（kd2_abv_1, sha256 c3df5702d6c06eca148650f0896e5c6f3bf6fed5cdde3f1f7435dc3729ad5898）上复现, 合成探针绿≠洞闭合; lowering 域归因成立（嫌疑面=共享 lowering/opt I64_OR 重写族）, 不建刀（另役）
   - pumpgate_realshape 好/坏 padding 两变体: compile/run 全绿且输出恒等 → 本轮 padding 形状敏感性未复现

3. **编译器无罪复核: 无罪保持**
   - git diff ac41af29e..11a16cd12 -- bootstrap/ = 0 行（HEAD 前进未触编译器域; 排队期间 048b3fc1 纯文档镜像提交已排除）
   - 驱动=A 臂归档快照 bootstrap 烤制, 与闭包严格配对; cc 同源三烤非确定（字节+反汇编）为已知现象 → 一切烤钉 kd2_abv_1 单驱动 binary sha, 驱动非确定性不进 A/B 差
   - 闭包产物跨驱动确定（run1/run2 未变源对象 sha 恒等）; 金丝雀 2/2（run1 缺件 rc=3 缺口本轮已补）+ wdfs 绿保持
   - A/B 反汇编忠实发射（恰 2 函数且逐臂对源语义对应）→ 病灶在源侧泵门 v1+v2 行为面, 非编译器误译

4. **置信度**
   - A/B binary 归因: 高（单文件树差 + 复烤字节确定 + 结构差分恰 2 函数与源集精确对应 + 分析器经 run1/diffforensic 双重独立校准）
   - or-of-shifts 真形状 RED 复现: 高（驱动 binary sha 钉定, 双 oracle 判据, 与 2026-09-20 三目标全错同族）
   - padding 形状敏感性未复现: 中（单轮单形状壳, 好/坏样本仍灭失待 VPN lane 补交）
   - VPN 设备挂死定谳: 待装机实测（设备侧不归本线）
