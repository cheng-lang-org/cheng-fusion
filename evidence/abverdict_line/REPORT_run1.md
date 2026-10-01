# ABVERDICT_LINE 定谳报告（一次编译器烤双案并审）

基座: HEAD c03ad5470（git archive 快照克隆根）
- A 臂 = HEAD 态: .rebuild/clone_roots/abverdict_a
- B 臂 = 仅回退 src/quic/native_runtime.cheng@ac41af29e（树差已核=仅该一文件）: .rebuild/clone_roots/abverdict_b
- 编译器 = 本线新烤 kd_abv_1（CLT cc -O2 bootstrap/cheng_cold.c，1GiB 守卫轮）
- 反汇编专项: 泵 recv 门=msquicNativePumpCodeUnlocked（a85e5b5f9 hunk x2 @:4969/:5012）、拨号环=msquicNativeDialPumpReadyCode（hunk x1 @:5595）

## 1) 编译器无罪结论复核
- git diff ac41af29e..HEAD -- bootstrap/ 行数 = 0（0 = C 链自最后已知好烤时点零变化）
- ac41af29e..HEAD 内移动闭包（quic/std/vpn_proxy）变更文件: (无)
- 三炉字节/反汇编一致性:
```
three_bake_byte_1v2=DIFF
three_bake_byte_1v3=DIFF
three_bake_disasm_equal=NO
driver1_sha256=751af95795bedae16f23cc2947405d56291d5f540fa279ef328136aa0b39e4b0
note=Mach-O LC_UUID 为链接器元数据; 字节 DIFF 时以 disasm_sha 为准
```
- 金丝雀 2/2 + wdfs 红绿夹具绿保持:
```
ac_two_line_canary compile_rc=3 run_rc=ABSENT
ordinary_zero_exit_fixture compile_rc=0 run_rc=0
wdfs_peephole_r3_redgreen compile_rc=0 run_rc=0
```

## 2) A/B binary sha 与反汇编专项 diff
```
core_A_sha256=3772443b841be04c0401ca194a077074d33203175f8c05ac31ce8df9e25c9d47
core_B_sha256=c5618d912012d107bbace1e62cbcb4d4c8c7a3210bd1582a158c94421b63702a
--- sha_a.txt ---
3772443b841be04c0401ca194a077074d33203175f8c05ac31ce8df9e25c9d47  cheng_hy2_tun_core.o
fc5501aa7020bca7c5fd0b2a51ae4c86c09391078be95e12a6d5af50732d04ae  cheng_hy2_tun_core_b.o
f04326bf001a6cfb4bdd8f14baa20c71df5bb36be597d9cc36528f87a19f1983  core_runtime_provider_linux.o
d93b76f39dcb883b31a96b6ccc43ff70e74bb4e0d30979eb2080d65b1f2de39d  program_support_backend.o
128b4b1099f633c00173098d8ce9c060a5f8a48a606cb00b57f9896094c42067  program_support_host_runtime.o
--- sha_b.txt ---
c5618d912012d107bbace1e62cbcb4d4c8c7a3210bd1582a158c94421b63702a  cheng_hy2_tun_core.o
fc5501aa7020bca7c5fd0b2a51ae4c86c09391078be95e12a6d5af50732d04ae  cheng_hy2_tun_core_b.o
f04326bf001a6cfb4bdd8f14baa20c71df5bb36be597d9cc36528f87a19f1983  core_runtime_provider_linux.o
d93b76f39dcb883b31a96b6ccc43ff70e74bb4e0d30979eb2080d65b1f2de39d  program_support_backend.o
128b4b1099f633c00173098d8ce9c060a5f8a48a606cb00b57f9896094c42067  program_support_host_runtime.o
--- per-object cmp (A vs B) ---
cheng_hy2_tun_core.o DIFFERS
cheng_hy2_tun_core_b.o IDENTICAL
core_runtime_provider_linux.o IDENTICAL
program_support_backend.o IDENTICAL
program_support_host_runtime.o IDENTICAL
```
逐符号反汇编 diff 摘要（core 对象全量）:
```
SYMBOL_DIFF_REPORT=/Users/lbcheng/cheng-lang/.rebuild/abverdict_line/disasm/per_symbol/SYMBOL_DIFF_REPORT.txt
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
专项三函数判读:
```
msquicNativePumpCodeUnlocked NOT_FOUND
msquicNativeDialPumpReadyCode NOT_FOUND
msquicNativePumpCode NOT_FOUND
```
交付: binaries/A/ binaries/B/（交 VPN lane 装机 A/B 实测定谳: 挂死跟 A 走=quic 线层3 债; 跟 B 走=回编译器域携坏烤重开 marshal 窗）

## 3) or-of-shifts 探针判词
```
compile_rc=0
run_rc=0
or_term=0180000000000000
split_or=0180000000000000
right_alone=0080000000000000
signed_shr8=0080000000000000
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

