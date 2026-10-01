.text
.p2align 4, 0x90

.macro REGALLOC_X64_F64_BRIDGE bridge_name, raw_name
.globl \bridge_name
\bridge_name:
    movq %xmm0, %rdi
    movq %xmm1, %rsi
    movl $0x6d6d6d6d, %eax
    subq $8, %rsp
    call \raw_name
    addq $8, %rsp
    xorl $0x5a5a5a5a, %eax
    ret
.endmacro

REGALLOC_X64_F64_BRIDGE _regalloc_x64_bridge_f64_eq, _regalloc_x64_raw_f64_eq
REGALLOC_X64_F64_BRIDGE _regalloc_x64_bridge_f64_ne, _regalloc_x64_raw_f64_ne
REGALLOC_X64_F64_BRIDGE _regalloc_x64_bridge_f64_lt, _regalloc_x64_raw_f64_lt
REGALLOC_X64_F64_BRIDGE _regalloc_x64_bridge_f64_le, _regalloc_x64_raw_f64_le
REGALLOC_X64_F64_BRIDGE _regalloc_x64_bridge_f64_gt, _regalloc_x64_raw_f64_gt
REGALLOC_X64_F64_BRIDGE _regalloc_x64_bridge_f64_ge, _regalloc_x64_raw_f64_ge

REGALLOC_X64_F64_BRIDGE _regalloc_x64_bridge_f64_fused_eq, _regalloc_x64_raw_f64_fused_eq
REGALLOC_X64_F64_BRIDGE _regalloc_x64_bridge_f64_fused_ne, _regalloc_x64_raw_f64_fused_ne
REGALLOC_X64_F64_BRIDGE _regalloc_x64_bridge_f64_fused_lt, _regalloc_x64_raw_f64_fused_lt
REGALLOC_X64_F64_BRIDGE _regalloc_x64_bridge_f64_fused_le, _regalloc_x64_raw_f64_fused_le
REGALLOC_X64_F64_BRIDGE _regalloc_x64_bridge_f64_fused_gt, _regalloc_x64_raw_f64_fused_gt
REGALLOC_X64_F64_BRIDGE _regalloc_x64_bridge_f64_fused_ge, _regalloc_x64_raw_f64_fused_ge
