.text
.globl _sha4blk_compress
.p2align 2
_sha4blk_compress:
    ldr     q0, [x0]
    ldr     q1, [x0, #16]
    mov     v6.16b, v0.16b
    mov     v7.16b, v1.16b
    ldr     q16, [x1, #0]
    rev32   v16.16b, v16.16b
    ldr     q17, [x1, #16]
    rev32   v17.16b, v17.16b
    ldr     q18, [x1, #32]
    rev32   v18.16b, v18.16b
    ldr     q19, [x1, #48]
    rev32   v19.16b, v19.16b
    ldr     q26, [x2, #0]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    ldr     q26, [x2, #16]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    ldr     q26, [x2, #32]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    ldr     q26, [x2, #48]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    ldr     q26, [x2, #64]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    ldr     q26, [x2, #80]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    ldr     q26, [x2, #96]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    ldr     q26, [x2, #112]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    ldr     q26, [x2, #128]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    ldr     q26, [x2, #144]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    ldr     q26, [x2, #160]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    ldr     q26, [x2, #176]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    ldr     q26, [x2, #192]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    ldr     q26, [x2, #208]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    ldr     q26, [x2, #224]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    ldr     q26, [x2, #240]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    add     v0.4s, v0.4s, v6.4s
    add     v1.4s, v1.4s, v7.4s
    add     x1, x1, #64
    mov     v6.16b, v0.16b
    mov     v7.16b, v1.16b
    ldr     q16, [x1, #0]
    rev32   v16.16b, v16.16b
    ldr     q17, [x1, #16]
    rev32   v17.16b, v17.16b
    ldr     q18, [x1, #32]
    rev32   v18.16b, v18.16b
    ldr     q19, [x1, #48]
    rev32   v19.16b, v19.16b
    ldr     q26, [x2, #0]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    ldr     q26, [x2, #16]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    ldr     q26, [x2, #32]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    ldr     q26, [x2, #48]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    ldr     q26, [x2, #64]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    ldr     q26, [x2, #80]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    ldr     q26, [x2, #96]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    ldr     q26, [x2, #112]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    ldr     q26, [x2, #128]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    ldr     q26, [x2, #144]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    ldr     q26, [x2, #160]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    ldr     q26, [x2, #176]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    ldr     q26, [x2, #192]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    ldr     q26, [x2, #208]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    ldr     q26, [x2, #224]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    ldr     q26, [x2, #240]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    add     v0.4s, v0.4s, v6.4s
    add     v1.4s, v1.4s, v7.4s
    add     x1, x1, #64
    mov     v6.16b, v0.16b
    mov     v7.16b, v1.16b
    ldr     q16, [x1, #0]
    rev32   v16.16b, v16.16b
    ldr     q17, [x1, #16]
    rev32   v17.16b, v17.16b
    ldr     q18, [x1, #32]
    rev32   v18.16b, v18.16b
    ldr     q19, [x1, #48]
    rev32   v19.16b, v19.16b
    ldr     q26, [x2, #0]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    ldr     q26, [x2, #16]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    ldr     q26, [x2, #32]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    ldr     q26, [x2, #48]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    ldr     q26, [x2, #64]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    ldr     q26, [x2, #80]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    ldr     q26, [x2, #96]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    ldr     q26, [x2, #112]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    ldr     q26, [x2, #128]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    ldr     q26, [x2, #144]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    ldr     q26, [x2, #160]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    ldr     q26, [x2, #176]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    ldr     q26, [x2, #192]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    ldr     q26, [x2, #208]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    ldr     q26, [x2, #224]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    ldr     q26, [x2, #240]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    add     v0.4s, v0.4s, v6.4s
    add     v1.4s, v1.4s, v7.4s
    add     x1, x1, #64
    mov     v6.16b, v0.16b
    mov     v7.16b, v1.16b
    ldr     q16, [x1, #0]
    rev32   v16.16b, v16.16b
    ldr     q17, [x1, #16]
    rev32   v17.16b, v17.16b
    ldr     q18, [x1, #32]
    rev32   v18.16b, v18.16b
    ldr     q19, [x1, #48]
    rev32   v19.16b, v19.16b
    ldr     q26, [x2, #0]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    ldr     q26, [x2, #16]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    ldr     q26, [x2, #32]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    ldr     q26, [x2, #48]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    ldr     q26, [x2, #64]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    ldr     q26, [x2, #80]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    ldr     q26, [x2, #96]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    ldr     q26, [x2, #112]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    ldr     q26, [x2, #128]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    ldr     q26, [x2, #144]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    ldr     q26, [x2, #160]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    ldr     q26, [x2, #176]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    ldr     q26, [x2, #192]
    mov     v25.16b, v0.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    ldr     q26, [x2, #208]
    mov     v25.16b, v0.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    ldr     q26, [x2, #224]
    mov     v25.16b, v0.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    ldr     q26, [x2, #240]
    mov     v25.16b, v0.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    add     v0.4s, v0.4s, v6.4s
    add     v1.4s, v1.4s, v7.4s
    add     x1, x1, #64
    str     q0, [x0]
    str     q1, [x0, #16]
    ret
