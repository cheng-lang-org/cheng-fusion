.text
.globl _cheng1x_compress
.p2align 2
_cheng1x_compress:
    ldr q0, [x0]
    ldr q1, [x0, #16]
    ldr q4, [x1]
    ldr q5, [x1, #16]
    ldr q6, [x1, #32]
    ldr q7, [x1, #48]
    rev32 v4.16b, v4.16b
    rev32 v5.16b, v5.16b
    rev32 v6.16b, v6.16b
    rev32 v7.16b, v7.16b
    mov v2.16b, v0.16b
    mov v3.16b, v1.16b
    ldr q16, [x2, #0]
    add v20.4s, v4.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    ldr q16, [x2, #16]
    add v20.4s, v5.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    ldr q16, [x2, #32]
    add v20.4s, v6.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    ldr q16, [x2, #48]
    add v20.4s, v7.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    add x9, x2, #64
    sha256su0 v4.4s, v5.4s
    sha256su1 v4.4s, v6.4s, v7.4s
    ldr q16, [x9]
    add x9, x9, #16
    add v20.4s, v4.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    mov v21.16b, v4.16b
    mov v4.16b, v5.16b
    mov v5.16b, v6.16b
    mov v6.16b, v7.16b
    mov v7.16b, v21.16b
    sha256su0 v4.4s, v5.4s
    sha256su1 v4.4s, v6.4s, v7.4s
    ldr q16, [x9]
    add x9, x9, #16
    add v20.4s, v4.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    mov v21.16b, v4.16b
    mov v4.16b, v5.16b
    mov v5.16b, v6.16b
    mov v6.16b, v7.16b
    mov v7.16b, v21.16b
    sha256su0 v4.4s, v5.4s
    sha256su1 v4.4s, v6.4s, v7.4s
    ldr q16, [x9]
    add x9, x9, #16
    add v20.4s, v4.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    mov v21.16b, v4.16b
    mov v4.16b, v5.16b
    mov v5.16b, v6.16b
    mov v6.16b, v7.16b
    mov v7.16b, v21.16b
    sha256su0 v4.4s, v5.4s
    sha256su1 v4.4s, v6.4s, v7.4s
    ldr q16, [x9]
    add x9, x9, #16
    add v20.4s, v4.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    mov v21.16b, v4.16b
    mov v4.16b, v5.16b
    mov v5.16b, v6.16b
    mov v6.16b, v7.16b
    mov v7.16b, v21.16b
    sha256su0 v4.4s, v5.4s
    sha256su1 v4.4s, v6.4s, v7.4s
    ldr q16, [x9]
    add x9, x9, #16
    add v20.4s, v4.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    mov v21.16b, v4.16b
    mov v4.16b, v5.16b
    mov v5.16b, v6.16b
    mov v6.16b, v7.16b
    mov v7.16b, v21.16b
    sha256su0 v4.4s, v5.4s
    sha256su1 v4.4s, v6.4s, v7.4s
    ldr q16, [x9]
    add x9, x9, #16
    add v20.4s, v4.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    mov v21.16b, v4.16b
    mov v4.16b, v5.16b
    mov v5.16b, v6.16b
    mov v6.16b, v7.16b
    mov v7.16b, v21.16b
    sha256su0 v4.4s, v5.4s
    sha256su1 v4.4s, v6.4s, v7.4s
    ldr q16, [x9]
    add x9, x9, #16
    add v20.4s, v4.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    mov v21.16b, v4.16b
    mov v4.16b, v5.16b
    mov v5.16b, v6.16b
    mov v6.16b, v7.16b
    mov v7.16b, v21.16b
    sha256su0 v4.4s, v5.4s
    sha256su1 v4.4s, v6.4s, v7.4s
    ldr q16, [x9]
    add x9, x9, #16
    add v20.4s, v4.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    mov v21.16b, v4.16b
    mov v4.16b, v5.16b
    mov v5.16b, v6.16b
    mov v6.16b, v7.16b
    mov v7.16b, v21.16b
    sha256su0 v4.4s, v5.4s
    sha256su1 v4.4s, v6.4s, v7.4s
    ldr q16, [x9]
    add x9, x9, #16
    add v20.4s, v4.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    mov v21.16b, v4.16b
    mov v4.16b, v5.16b
    mov v5.16b, v6.16b
    mov v6.16b, v7.16b
    mov v7.16b, v21.16b
    sha256su0 v4.4s, v5.4s
    sha256su1 v4.4s, v6.4s, v7.4s
    ldr q16, [x9]
    add x9, x9, #16
    add v20.4s, v4.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    mov v21.16b, v4.16b
    mov v4.16b, v5.16b
    mov v5.16b, v6.16b
    mov v6.16b, v7.16b
    mov v7.16b, v21.16b
    sha256su0 v4.4s, v5.4s
    sha256su1 v4.4s, v6.4s, v7.4s
    ldr q16, [x9]
    add x9, x9, #16
    add v20.4s, v4.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    mov v21.16b, v4.16b
    mov v4.16b, v5.16b
    mov v5.16b, v6.16b
    mov v6.16b, v7.16b
    mov v7.16b, v21.16b
    sha256su0 v4.4s, v5.4s
    sha256su1 v4.4s, v6.4s, v7.4s
    ldr q16, [x9]
    add x9, x9, #16
    add v20.4s, v4.4s, v16.4s
    mov v18.16b, v0.16b
    sha256h.4s q0, q1, v20
    sha256h2.4s q1, q18, v20
    mov v21.16b, v4.16b
    mov v4.16b, v5.16b
    mov v5.16b, v6.16b
    mov v6.16b, v7.16b
    mov v7.16b, v21.16b
    add v0.4s, v0.4s, v2.4s
    add v1.4s, v1.4s, v3.4s
    str q0, [x0]
    str q1, [x0, #16]
    ret
