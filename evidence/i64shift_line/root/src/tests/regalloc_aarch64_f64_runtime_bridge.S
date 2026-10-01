.text
.p2align 2

.globl _regalloc_bridge_f64_eq
_regalloc_bridge_f64_eq:
    fmov x0, d0
    fmov x1, d1
    b _regalloc_raw_f64_eq

.globl _regalloc_bridge_f64_ne
_regalloc_bridge_f64_ne:
    fmov x0, d0
    fmov x1, d1
    b _regalloc_raw_f64_ne

.globl _regalloc_bridge_f64_lt
_regalloc_bridge_f64_lt:
    fmov x0, d0
    fmov x1, d1
    b _regalloc_raw_f64_lt

.globl _regalloc_bridge_f64_le
_regalloc_bridge_f64_le:
    fmov x0, d0
    fmov x1, d1
    b _regalloc_raw_f64_le

.globl _regalloc_bridge_f64_gt
_regalloc_bridge_f64_gt:
    fmov x0, d0
    fmov x1, d1
    b _regalloc_raw_f64_gt

.globl _regalloc_bridge_f64_ge
_regalloc_bridge_f64_ge:
    fmov x0, d0
    fmov x1, d1
    b _regalloc_raw_f64_ge

.globl _regalloc_bridge_f64_local
_regalloc_bridge_f64_local:
    str x30, [sp, #-16]!
    fmov x0, d0
    fmov x1, d1
    fmov d0, xzr
    bl _regalloc_raw_f64_local
    mvn x0, x0
    fmov d0, xzr
    fmov d0, x0
    ldr x30, [sp], #16
    ret

.globl _regalloc_bridge_f64_field
_regalloc_bridge_f64_field:
    fmov x1, d0
    b _regalloc_raw_f64_field

.globl _regalloc_bridge_f64_index
_regalloc_bridge_f64_index:
    mov x2, x1
    fmov x1, d0
    b _regalloc_raw_f64_index

.globl _regalloc_bridge_f64_const_nan
_regalloc_bridge_f64_const_nan:
    str x30, [sp, #-16]!
    bl _regalloc_raw_f64_const_nan
    fmov d0, x0
    ldr x30, [sp], #16
    ret

.globl _regalloc_bridge_f64_const_negative_zero
_regalloc_bridge_f64_const_negative_zero:
    str x30, [sp, #-16]!
    bl _regalloc_raw_f64_const_negative_zero
    fmov d0, x0
    ldr x30, [sp], #16
    ret

.globl _regalloc_bridge_f64_const_infinity
_regalloc_bridge_f64_const_infinity:
    str x30, [sp, #-16]!
    bl _regalloc_raw_f64_const_infinity
    fmov d0, x0
    ldr x30, [sp], #16
    ret

.globl _regalloc_bridge_f64_const_subnormal
_regalloc_bridge_f64_const_subnormal:
    str x30, [sp, #-16]!
    bl _regalloc_raw_f64_const_subnormal
    fmov d0, x0
    ldr x30, [sp], #16
    ret

.globl _regalloc_bridge_f64_call_clobber
_regalloc_bridge_f64_call_clobber:
    str x30, [sp, #-16]!
    fmov x0, d0
    bl _regalloc_raw_f64_call_clobber
    ldr x30, [sp], #16
    ret
