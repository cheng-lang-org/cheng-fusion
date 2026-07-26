.section __TEXT,__text,regular,pure_instructions
.globl _fixture_symbol
.p2align 2
_fixture_symbol:
    mov x0, #0x101
    mov x1, #0x202
    mov x2, #0x303
    mov x3, #0x404
    mov x4, #0x505
    mov x5, #0x606
    mov x6, #0x707
    mov x7, #0x808
    eor x8, x0, x1
    add x9, x2, x3
    sub x10, x4, x5
    orr x11, x6, x7
    and x12, x8, x9
    lsl x13, x10, #3
    lsr x14, x11, #2
    adds x15, x12, x13
    adc x16, x14, x15
    eor x0, x16, x8
    add x0, x0, #0x33
    ret

.globl _main
.p2align 2
_main:
    mov w0, #0
    ret
