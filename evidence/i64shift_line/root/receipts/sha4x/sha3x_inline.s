.text
.globl _sha3x
.p2align 2
_sha3x:
    ldr     q0, [x0, #0]
    ldr     q1, [x0, #16]
    ldr     q2, [x0, #32]
    ldr     q3, [x0, #48]
    ldr     q4, [x0, #64]
    ldr     q5, [x0, #80]
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
    ldr     q20, [x1, #64]
    rev32   v20.16b, v20.16b
    ldr     q21, [x1, #80]
    rev32   v21.16b, v21.16b
    ldr     q22, [x1, #96]
    rev32   v22.16b, v22.16b
    ldr     q23, [x1, #112]
    rev32   v23.16b, v23.16b
    ldr     q24, [x1, #128]
    rev32   v24.16b, v24.16b
    ldr     q25, [x1, #144]
    rev32   v25.16b, v25.16b
    ldr     q26, [x1, #160]
    rev32   v26.16b, v26.16b
    ldr     q27, [x1, #176]
    rev32   v27.16b, v27.16b
    ldr     q30, [x2, #0]
    mov     v29.16b, v0.16b
    add     v28.4s, v16.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    mov     v29.16b, v2.16b
    add     v28.4s, v20.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    sha256su0 v20.4s, v21.4s
    sha256su1 v20.4s, v22.4s, v23.4s
    mov     v29.16b, v4.16b
    add     v28.4s, v24.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    sha256su0 v24.4s, v25.4s
    sha256su1 v24.4s, v26.4s, v27.4s
    ldr     q30, [x2, #16]
    mov     v29.16b, v0.16b
    add     v28.4s, v17.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    mov     v29.16b, v2.16b
    add     v28.4s, v21.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    sha256su0 v21.4s, v22.4s
    sha256su1 v21.4s, v23.4s, v20.4s
    mov     v29.16b, v4.16b
    add     v28.4s, v25.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    sha256su0 v25.4s, v26.4s
    sha256su1 v25.4s, v27.4s, v24.4s
    ldr     q30, [x2, #32]
    mov     v29.16b, v0.16b
    add     v28.4s, v18.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    mov     v29.16b, v2.16b
    add     v28.4s, v22.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    sha256su0 v22.4s, v23.4s
    sha256su1 v22.4s, v20.4s, v21.4s
    mov     v29.16b, v4.16b
    add     v28.4s, v26.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    sha256su0 v26.4s, v27.4s
    sha256su1 v26.4s, v24.4s, v25.4s
    ldr     q30, [x2, #48]
    mov     v29.16b, v0.16b
    add     v28.4s, v19.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    mov     v29.16b, v2.16b
    add     v28.4s, v23.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    sha256su0 v23.4s, v20.4s
    sha256su1 v23.4s, v21.4s, v22.4s
    mov     v29.16b, v4.16b
    add     v28.4s, v27.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    sha256su0 v27.4s, v24.4s
    sha256su1 v27.4s, v25.4s, v26.4s
    ldr     q30, [x2, #64]
    mov     v29.16b, v0.16b
    add     v28.4s, v16.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    mov     v29.16b, v2.16b
    add     v28.4s, v20.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    sha256su0 v20.4s, v21.4s
    sha256su1 v20.4s, v22.4s, v23.4s
    mov     v29.16b, v4.16b
    add     v28.4s, v24.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    sha256su0 v24.4s, v25.4s
    sha256su1 v24.4s, v26.4s, v27.4s
    ldr     q30, [x2, #80]
    mov     v29.16b, v0.16b
    add     v28.4s, v17.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    mov     v29.16b, v2.16b
    add     v28.4s, v21.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    sha256su0 v21.4s, v22.4s
    sha256su1 v21.4s, v23.4s, v20.4s
    mov     v29.16b, v4.16b
    add     v28.4s, v25.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    sha256su0 v25.4s, v26.4s
    sha256su1 v25.4s, v27.4s, v24.4s
    ldr     q30, [x2, #96]
    mov     v29.16b, v0.16b
    add     v28.4s, v18.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    mov     v29.16b, v2.16b
    add     v28.4s, v22.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    sha256su0 v22.4s, v23.4s
    sha256su1 v22.4s, v20.4s, v21.4s
    mov     v29.16b, v4.16b
    add     v28.4s, v26.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    sha256su0 v26.4s, v27.4s
    sha256su1 v26.4s, v24.4s, v25.4s
    ldr     q30, [x2, #112]
    mov     v29.16b, v0.16b
    add     v28.4s, v19.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    mov     v29.16b, v2.16b
    add     v28.4s, v23.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    sha256su0 v23.4s, v20.4s
    sha256su1 v23.4s, v21.4s, v22.4s
    mov     v29.16b, v4.16b
    add     v28.4s, v27.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    sha256su0 v27.4s, v24.4s
    sha256su1 v27.4s, v25.4s, v26.4s
    ldr     q30, [x2, #128]
    mov     v29.16b, v0.16b
    add     v28.4s, v16.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    mov     v29.16b, v2.16b
    add     v28.4s, v20.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    sha256su0 v20.4s, v21.4s
    sha256su1 v20.4s, v22.4s, v23.4s
    mov     v29.16b, v4.16b
    add     v28.4s, v24.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    sha256su0 v24.4s, v25.4s
    sha256su1 v24.4s, v26.4s, v27.4s
    ldr     q30, [x2, #144]
    mov     v29.16b, v0.16b
    add     v28.4s, v17.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    mov     v29.16b, v2.16b
    add     v28.4s, v21.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    sha256su0 v21.4s, v22.4s
    sha256su1 v21.4s, v23.4s, v20.4s
    mov     v29.16b, v4.16b
    add     v28.4s, v25.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    sha256su0 v25.4s, v26.4s
    sha256su1 v25.4s, v27.4s, v24.4s
    ldr     q30, [x2, #160]
    mov     v29.16b, v0.16b
    add     v28.4s, v18.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    mov     v29.16b, v2.16b
    add     v28.4s, v22.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    sha256su0 v22.4s, v23.4s
    sha256su1 v22.4s, v20.4s, v21.4s
    mov     v29.16b, v4.16b
    add     v28.4s, v26.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    sha256su0 v26.4s, v27.4s
    sha256su1 v26.4s, v24.4s, v25.4s
    ldr     q30, [x2, #176]
    mov     v29.16b, v0.16b
    add     v28.4s, v19.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    mov     v29.16b, v2.16b
    add     v28.4s, v23.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    sha256su0 v23.4s, v20.4s
    sha256su1 v23.4s, v21.4s, v22.4s
    mov     v29.16b, v4.16b
    add     v28.4s, v27.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    sha256su0 v27.4s, v24.4s
    sha256su1 v27.4s, v25.4s, v26.4s
    ldr     q30, [x2, #192]
    mov     v29.16b, v0.16b
    add     v28.4s, v16.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    mov     v29.16b, v2.16b
    add     v28.4s, v20.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    mov     v29.16b, v4.16b
    add     v28.4s, v24.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    ldr     q30, [x2, #208]
    mov     v29.16b, v0.16b
    add     v28.4s, v17.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    mov     v29.16b, v2.16b
    add     v28.4s, v21.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    mov     v29.16b, v4.16b
    add     v28.4s, v25.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    ldr     q30, [x2, #224]
    mov     v29.16b, v0.16b
    add     v28.4s, v18.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    mov     v29.16b, v2.16b
    add     v28.4s, v22.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    mov     v29.16b, v4.16b
    add     v28.4s, v26.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    ldr     q30, [x2, #240]
    mov     v29.16b, v0.16b
    add     v28.4s, v19.4s, v30.4s
    sha256h.4s q0, q1, v28
    sha256h2.4s q1, v29, v28
    mov     v29.16b, v2.16b
    add     v28.4s, v23.4s, v30.4s
    sha256h.4s q2, q3, v28
    sha256h2.4s q3, v29, v28
    mov     v29.16b, v4.16b
    add     v28.4s, v27.4s, v30.4s
    sha256h.4s q4, q5, v28
    sha256h2.4s q5, v29, v28
    add     v0.4s, v0.4s, v6.4s
    add     v1.4s, v1.4s, v7.4s
    str     q0, [x0, #0]
    str     q1, [x0, #16]
    add     v2.4s, v2.4s, v6.4s
    add     v3.4s, v3.4s, v7.4s
    str     q2, [x0, #32]
    str     q3, [x0, #48]
    add     v4.4s, v4.4s, v6.4s
    add     v5.4s, v5.4s, v7.4s
    str     q4, [x0, #64]
    str     q5, [x0, #80]
    ret
