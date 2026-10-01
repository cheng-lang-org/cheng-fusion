.text
.globl _sha4x_compress
.p2align 2
_sha4x_compress:
    ldr     q0, [x0, #0]
    ldr     q1, [x0, #16]
    ldr     q2, [x0, #32]
    ldr     q3, [x0, #48]
    ldr     q4, [x0, #64]
    ldr     q5, [x0, #80]
    ldr     q6, [x0, #96]
    ldr     q7, [x0, #112]
    mov     v27.16b, v0.16b
    mov     v28.16b, v1.16b
    ldr     q8, [x1, #0]
    rev32   v8.16b, v8.16b
    ldr     q9, [x1, #16]
    rev32   v9.16b, v9.16b
    ldr     q10, [x1, #32]
    rev32   v10.16b, v10.16b
    ldr     q11, [x1, #48]
    rev32   v11.16b, v11.16b
    ldr     q12, [x1, #64]
    rev32   v12.16b, v12.16b
    ldr     q13, [x1, #80]
    rev32   v13.16b, v13.16b
    ldr     q14, [x1, #96]
    rev32   v14.16b, v14.16b
    ldr     q15, [x1, #112]
    rev32   v15.16b, v15.16b
    ldr     q16, [x1, #128]
    rev32   v16.16b, v16.16b
    ldr     q17, [x1, #144]
    rev32   v17.16b, v17.16b
    ldr     q18, [x1, #160]
    rev32   v18.16b, v18.16b
    ldr     q19, [x1, #176]
    rev32   v19.16b, v19.16b
    ldr     q20, [x1, #192]
    rev32   v20.16b, v20.16b
    ldr     q21, [x1, #208]
    rev32   v21.16b, v21.16b
    ldr     q22, [x1, #224]
    rev32   v22.16b, v22.16b
    ldr     q23, [x1, #240]
    rev32   v23.16b, v23.16b
    ldr     q26, [x2, #0]
    mov     v25.16b, v0.16b
    add     v24.4s, v8.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v8.4s, v9.4s
    sha256su1 v8.4s, v10.4s, v11.4s
    mov     v25.16b, v2.16b
    add     v24.4s, v12.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    sha256su0 v12.4s, v13.4s
    sha256su1 v12.4s, v14.4s, v15.4s
    mov     v25.16b, v4.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    mov     v25.16b, v6.16b
    add     v24.4s, v20.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    sha256su0 v20.4s, v21.4s
    sha256su1 v20.4s, v22.4s, v23.4s
    ldr     q26, [x2, #16]
    mov     v25.16b, v0.16b
    add     v24.4s, v9.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v9.4s, v10.4s
    sha256su1 v9.4s, v11.4s, v8.4s
    mov     v25.16b, v2.16b
    add     v24.4s, v13.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    sha256su0 v13.4s, v14.4s
    sha256su1 v13.4s, v15.4s, v12.4s
    mov     v25.16b, v4.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    mov     v25.16b, v6.16b
    add     v24.4s, v21.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    sha256su0 v21.4s, v22.4s
    sha256su1 v21.4s, v23.4s, v20.4s
    ldr     q26, [x2, #32]
    mov     v25.16b, v0.16b
    add     v24.4s, v10.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v10.4s, v11.4s
    sha256su1 v10.4s, v8.4s, v9.4s
    mov     v25.16b, v2.16b
    add     v24.4s, v14.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    sha256su0 v14.4s, v15.4s
    sha256su1 v14.4s, v12.4s, v13.4s
    mov     v25.16b, v4.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    mov     v25.16b, v6.16b
    add     v24.4s, v22.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    sha256su0 v22.4s, v23.4s
    sha256su1 v22.4s, v20.4s, v21.4s
    ldr     q26, [x2, #48]
    mov     v25.16b, v0.16b
    add     v24.4s, v11.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v11.4s, v8.4s
    sha256su1 v11.4s, v9.4s, v10.4s
    mov     v25.16b, v2.16b
    add     v24.4s, v15.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    sha256su0 v15.4s, v12.4s
    sha256su1 v15.4s, v13.4s, v14.4s
    mov     v25.16b, v4.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    mov     v25.16b, v6.16b
    add     v24.4s, v23.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    sha256su0 v23.4s, v20.4s
    sha256su1 v23.4s, v21.4s, v22.4s
    ldr     q26, [x2, #64]
    mov     v25.16b, v0.16b
    add     v24.4s, v8.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v8.4s, v9.4s
    sha256su1 v8.4s, v10.4s, v11.4s
    mov     v25.16b, v2.16b
    add     v24.4s, v12.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    sha256su0 v12.4s, v13.4s
    sha256su1 v12.4s, v14.4s, v15.4s
    mov     v25.16b, v4.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    mov     v25.16b, v6.16b
    add     v24.4s, v20.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    sha256su0 v20.4s, v21.4s
    sha256su1 v20.4s, v22.4s, v23.4s
    ldr     q26, [x2, #80]
    mov     v25.16b, v0.16b
    add     v24.4s, v9.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v9.4s, v10.4s
    sha256su1 v9.4s, v11.4s, v8.4s
    mov     v25.16b, v2.16b
    add     v24.4s, v13.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    sha256su0 v13.4s, v14.4s
    sha256su1 v13.4s, v15.4s, v12.4s
    mov     v25.16b, v4.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    mov     v25.16b, v6.16b
    add     v24.4s, v21.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    sha256su0 v21.4s, v22.4s
    sha256su1 v21.4s, v23.4s, v20.4s
    ldr     q26, [x2, #96]
    mov     v25.16b, v0.16b
    add     v24.4s, v10.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v10.4s, v11.4s
    sha256su1 v10.4s, v8.4s, v9.4s
    mov     v25.16b, v2.16b
    add     v24.4s, v14.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    sha256su0 v14.4s, v15.4s
    sha256su1 v14.4s, v12.4s, v13.4s
    mov     v25.16b, v4.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    mov     v25.16b, v6.16b
    add     v24.4s, v22.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    sha256su0 v22.4s, v23.4s
    sha256su1 v22.4s, v20.4s, v21.4s
    ldr     q26, [x2, #112]
    mov     v25.16b, v0.16b
    add     v24.4s, v11.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v11.4s, v8.4s
    sha256su1 v11.4s, v9.4s, v10.4s
    mov     v25.16b, v2.16b
    add     v24.4s, v15.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    sha256su0 v15.4s, v12.4s
    sha256su1 v15.4s, v13.4s, v14.4s
    mov     v25.16b, v4.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    mov     v25.16b, v6.16b
    add     v24.4s, v23.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    sha256su0 v23.4s, v20.4s
    sha256su1 v23.4s, v21.4s, v22.4s
    ldr     q26, [x2, #128]
    mov     v25.16b, v0.16b
    add     v24.4s, v8.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v8.4s, v9.4s
    sha256su1 v8.4s, v10.4s, v11.4s
    mov     v25.16b, v2.16b
    add     v24.4s, v12.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    sha256su0 v12.4s, v13.4s
    sha256su1 v12.4s, v14.4s, v15.4s
    mov     v25.16b, v4.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    sha256su0 v16.4s, v17.4s
    sha256su1 v16.4s, v18.4s, v19.4s
    mov     v25.16b, v6.16b
    add     v24.4s, v20.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    sha256su0 v20.4s, v21.4s
    sha256su1 v20.4s, v22.4s, v23.4s
    ldr     q26, [x2, #144]
    mov     v25.16b, v0.16b
    add     v24.4s, v9.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v9.4s, v10.4s
    sha256su1 v9.4s, v11.4s, v8.4s
    mov     v25.16b, v2.16b
    add     v24.4s, v13.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    sha256su0 v13.4s, v14.4s
    sha256su1 v13.4s, v15.4s, v12.4s
    mov     v25.16b, v4.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    sha256su0 v17.4s, v18.4s
    sha256su1 v17.4s, v19.4s, v16.4s
    mov     v25.16b, v6.16b
    add     v24.4s, v21.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    sha256su0 v21.4s, v22.4s
    sha256su1 v21.4s, v23.4s, v20.4s
    ldr     q26, [x2, #160]
    mov     v25.16b, v0.16b
    add     v24.4s, v10.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v10.4s, v11.4s
    sha256su1 v10.4s, v8.4s, v9.4s
    mov     v25.16b, v2.16b
    add     v24.4s, v14.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    sha256su0 v14.4s, v15.4s
    sha256su1 v14.4s, v12.4s, v13.4s
    mov     v25.16b, v4.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    sha256su0 v18.4s, v19.4s
    sha256su1 v18.4s, v16.4s, v17.4s
    mov     v25.16b, v6.16b
    add     v24.4s, v22.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    sha256su0 v22.4s, v23.4s
    sha256su1 v22.4s, v20.4s, v21.4s
    ldr     q26, [x2, #176]
    mov     v25.16b, v0.16b
    add     v24.4s, v11.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    sha256su0 v11.4s, v8.4s
    sha256su1 v11.4s, v9.4s, v10.4s
    mov     v25.16b, v2.16b
    add     v24.4s, v15.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    sha256su0 v15.4s, v12.4s
    sha256su1 v15.4s, v13.4s, v14.4s
    mov     v25.16b, v4.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    sha256su0 v19.4s, v16.4s
    sha256su1 v19.4s, v17.4s, v18.4s
    mov     v25.16b, v6.16b
    add     v24.4s, v23.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    sha256su0 v23.4s, v20.4s
    sha256su1 v23.4s, v21.4s, v22.4s
    ldr     q26, [x2, #192]
    mov     v25.16b, v0.16b
    add     v24.4s, v8.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    mov     v25.16b, v2.16b
    add     v24.4s, v12.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    mov     v25.16b, v4.16b
    add     v24.4s, v16.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    mov     v25.16b, v6.16b
    add     v24.4s, v20.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    ldr     q26, [x2, #208]
    mov     v25.16b, v0.16b
    add     v24.4s, v9.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    mov     v25.16b, v2.16b
    add     v24.4s, v13.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    mov     v25.16b, v4.16b
    add     v24.4s, v17.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    mov     v25.16b, v6.16b
    add     v24.4s, v21.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    ldr     q26, [x2, #224]
    mov     v25.16b, v0.16b
    add     v24.4s, v10.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    mov     v25.16b, v2.16b
    add     v24.4s, v14.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    mov     v25.16b, v4.16b
    add     v24.4s, v18.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    mov     v25.16b, v6.16b
    add     v24.4s, v22.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    ldr     q26, [x2, #240]
    mov     v25.16b, v0.16b
    add     v24.4s, v11.4s, v26.4s
    sha256h.4s q0, q1, v24
    sha256h2.4s q1, v25, v24
    mov     v25.16b, v2.16b
    add     v24.4s, v15.4s, v26.4s
    sha256h.4s q2, q3, v24
    sha256h2.4s q3, v25, v24
    mov     v25.16b, v4.16b
    add     v24.4s, v19.4s, v26.4s
    sha256h.4s q4, q5, v24
    sha256h2.4s q5, v25, v24
    mov     v25.16b, v6.16b
    add     v24.4s, v23.4s, v26.4s
    sha256h.4s q6, q7, v24
    sha256h2.4s q7, v25, v24
    add     v0.4s, v0.4s, v27.4s
    add     v1.4s, v1.4s, v28.4s
    str     q0, [x0, #0]
    str     q1, [x0, #16]
    add     v2.4s, v2.4s, v27.4s
    add     v3.4s, v3.4s, v28.4s
    str     q2, [x0, #32]
    str     q3, [x0, #48]
    add     v4.4s, v4.4s, v27.4s
    add     v5.4s, v5.4s, v28.4s
    str     q4, [x0, #64]
    str     q5, [x0, #80]
    add     v6.4s, v6.4s, v27.4s
    add     v7.4s, v7.4s, v28.4s
    str     q6, [x0, #96]
    str     q7, [x0, #112]
    ret
