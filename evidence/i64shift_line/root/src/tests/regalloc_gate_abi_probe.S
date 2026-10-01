.text
.p2align 2

.globl _regalloc_gate_external_clobber
_regalloc_gate_external_clobber:
    mov x1, #0x101
    mov x2, #0x102
    mov x3, #0x103
    mov x4, #0x104
    mov x5, #0x105
    mov x6, #0x106
    mov x7, #0x107
    mov x8, #0x108
    mov x9, #0x109
    mov x10, #0x10a
    mov x11, #0x10b
    mov x12, #0x10c
    mov x13, #0x10d
    mov x14, #0x10e
    mov x15, #0x10f
    mov x16, #0x110
    mov x17, #0x111
    add w0, w0, #101
    ret

.globl _regalloc_gate_verify_sret
_regalloc_gate_verify_sret:
    sub sp, sp, #64
    stp x29, x30, [sp, #0]
    mov x29, sp
    add x8, sp, #16
    mov w0, #3
    bl _regallocGateMakeWideAggregate
    ldr w9, [sp, #16]
    cmp w9, #5
    b.ne Lregalloc_gate_sret_fail
    ldr w9, [sp, #20]
    cmp w9, #7
    b.ne Lregalloc_gate_sret_fail
    ldr w9, [sp, #24]
    cmp w9, #11
    b.ne Lregalloc_gate_sret_fail
    ldr w9, [sp, #28]
    cmp w9, #13
    b.ne Lregalloc_gate_sret_fail
    ldr w9, [sp, #32]
    cmp w9, #19
    b.ne Lregalloc_gate_sret_fail
    ldr w9, [sp, #36]
    cmp w9, #23
    b.ne Lregalloc_gate_sret_fail
    mov w0, #1
    b Lregalloc_gate_sret_done

Lregalloc_gate_sret_fail:
    mov w0, #0

Lregalloc_gate_sret_done:
    ldp x29, x30, [sp, #0]
    add sp, sp, #64
    ret

.globl _regalloc_gate_verify_callee_saved
_regalloc_gate_verify_callee_saved:
    sub sp, sp, #96
    stp x29, x30, [sp, #0]
    stp x19, x20, [sp, #16]
    stp x21, x22, [sp, #32]
    stp x23, x24, [sp, #48]
    stp x25, x26, [sp, #64]
    stp x27, x28, [sp, #80]
    mov x29, sp

    mov x19, #0x119
    mov x20, #0x120
    mov x21, #0x121
    mov x22, #0x122
    mov x23, #0x123
    mov x24, #0x124
    mov x25, #0x125
    mov x26, #0x126
    mov x27, #0x127
    mov x28, #0x128
    mov w0, #7
    bl _regallocGateCrossHeapAndCall

    cmp w0, #1480
    b.ne Lregalloc_gate_callee_fail
    cmp x19, #0x119
    b.ne Lregalloc_gate_callee_fail
    cmp x20, #0x120
    b.ne Lregalloc_gate_callee_fail
    cmp x21, #0x121
    b.ne Lregalloc_gate_callee_fail
    cmp x22, #0x122
    b.ne Lregalloc_gate_callee_fail
    cmp x23, #0x123
    b.ne Lregalloc_gate_callee_fail
    cmp x24, #0x124
    b.ne Lregalloc_gate_callee_fail
    cmp x25, #0x125
    b.ne Lregalloc_gate_callee_fail
    cmp x26, #0x126
    b.ne Lregalloc_gate_callee_fail
    cmp x27, #0x127
    b.ne Lregalloc_gate_callee_fail
    cmp x28, #0x128
    b.ne Lregalloc_gate_callee_fail
    mov w0, #1
    b Lregalloc_gate_callee_done

Lregalloc_gate_callee_fail:
    mov w0, #0

Lregalloc_gate_callee_done:
    ldp x27, x28, [sp, #80]
    ldp x25, x26, [sp, #64]
    ldp x23, x24, [sp, #48]
    ldp x21, x22, [sp, #32]
    ldp x19, x20, [sp, #16]
    ldp x29, x30, [sp, #0]
    add sp, sp, #96
    ret

.globl _regalloc_gate_verify_frame_and_sp
_regalloc_gate_verify_frame_and_sp:
    sub sp, sp, #48
    stp x29, x30, [sp, #0]
    stp x19, x20, [sp, #16]
    mov x9, sp
    str x9, [sp, #32]
    and x9, x9, #15
    cbnz x9, Lregalloc_gate_frame_sp_fail

    mov x29, #0x129
    mov w0, #7
    bl _regallocGateCrossHeapAndCall

    ldr x9, [sp, #32]
    cmp sp, x9
    b.ne Lregalloc_gate_frame_sp_fail
    cmp x29, #0x129
    b.ne Lregalloc_gate_frame_sp_fail
    mov w0, #1
    b Lregalloc_gate_frame_sp_done

Lregalloc_gate_frame_sp_fail:
    mov w0, #0

Lregalloc_gate_frame_sp_done:
    ldp x19, x20, [sp, #16]
    ldp x29, x30, [sp, #0]
    add sp, sp, #48
    ret
