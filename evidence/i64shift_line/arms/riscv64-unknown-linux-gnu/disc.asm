
/Users/lbcheng/cheng-lang/.rebuild/i64shift_line/arms/riscv64-unknown-linux-gnu/disc.o:	file format elf64-littleriscv

Disassembly of section .text:

0000000000000000 <main>:
       0: 00050413     	mv	s0, a0
       4: 00058493     	mv	s1, a1
       8: 108000ef     	jal	0x110 <main>
       c: 05e00893     	li	a7, 0x5e
      10: 00000073     	ecall

0000000000000014 <caseB2>:
      14: ff010113     	addi	sp, sp, -0x10
      18: 00113023     	sd	ra, 0x0(sp)
      1c: 00813423     	sd	s0, 0x8(sp)
      20: 00010413     	mv	s0, sp
      24: fd810113     	addi	sp, sp, -0x28
      28: 00a13023     	sd	a0, 0x0(sp)
      2c: 00b12423     	sw	a1, 0x8(sp)
      30: 00013283     	ld	t0, 0x0(sp)
      34: 00513c23     	sd	t0, 0x18(sp)
      38: 00812283     	lw	t0, 0x8(sp)
      3c: 02513023     	sd	t0, 0x20(sp)
      40: 01813283     	ld	t0, 0x18(sp)
      44: 02013303     	ld	t1, 0x20(sp)
      48: 4062d2b3     	sra	t0, t0, t1
      4c: 00513823     	sd	t0, 0x10(sp)
      50: 01013503     	ld	a0, 0x10(sp)
      54: 02810113     	addi	sp, sp, 0x28
      58: 00013083     	ld	ra, 0x0(sp)
      5c: 00813403     	ld	s0, 0x8(sp)
      60: 01010113     	addi	sp, sp, 0x10
      64: 00008067     	ret

0000000000000068 <caseA2>:
      68: ff010113     	addi	sp, sp, -0x10
      6c: 00113023     	sd	ra, 0x0(sp)
      70: 00813423     	sd	s0, 0x8(sp)
      74: 00010413     	mv	s0, sp
      78: fd810113     	addi	sp, sp, -0x28
      7c: 00a13023     	sd	a0, 0x0(sp)
      80: 00b12423     	sw	a1, 0x8(sp)
      84: 00013283     	ld	t0, 0x0(sp)
      88: 00513c23     	sd	t0, 0x18(sp)
      8c: 00812283     	lw	t0, 0x8(sp)
      90: 02513023     	sd	t0, 0x20(sp)
      94: 01813283     	ld	t0, 0x18(sp)
      98: 02013303     	ld	t1, 0x20(sp)
      9c: 4062d2b3     	sra	t0, t0, t1
      a0: 00513823     	sd	t0, 0x10(sp)
      a4: 01013503     	ld	a0, 0x10(sp)
      a8: 02810113     	addi	sp, sp, 0x28
      ac: 00013083     	ld	ra, 0x0(sp)
      b0: 00813403     	ld	s0, 0x8(sp)
      b4: 01010113     	addi	sp, sp, 0x10
      b8: 00008067     	ret

00000000000000bc <caseD2>:
      bc: ff010113     	addi	sp, sp, -0x10
      c0: 00113023     	sd	ra, 0x0(sp)
      c4: 00813423     	sd	s0, 0x8(sp)
      c8: 00010413     	mv	s0, sp
      cc: fd810113     	addi	sp, sp, -0x28
      d0: 00a13023     	sd	a0, 0x0(sp)
      d4: 00b12423     	sw	a1, 0x8(sp)
      d8: 00013283     	ld	t0, 0x0(sp)
      dc: 00513c23     	sd	t0, 0x18(sp)
      e0: 00812283     	lw	t0, 0x8(sp)
      e4: 02513023     	sd	t0, 0x20(sp)
      e8: 01813283     	ld	t0, 0x18(sp)
      ec: 02013303     	ld	t1, 0x20(sp)
      f0: 0062d2b3     	srl	t0, t0, t1
      f4: 00513823     	sd	t0, 0x10(sp)
      f8: 01013503     	ld	a0, 0x10(sp)
      fc: 02810113     	addi	sp, sp, 0x28
     100: 00013083     	ld	ra, 0x0(sp)
     104: 00813403     	ld	s0, 0x8(sp)
     108: 01010113     	addi	sp, sp, 0x10
     10c: 00008067     	ret

0000000000000110 <main>:
     110: ff010113     	addi	sp, sp, -0x10
     114: 00113023     	sd	ra, 0x0(sp)
     118: 00813423     	sd	s0, 0x8(sp)
     11c: 00010413     	mv	s0, sp
     120: ffc10113     	addi	sp, sp, -0x4
     124: 00000293     	li	t0, 0x0
     128: 00512023     	sw	t0, 0x0(sp)
     12c: 00012503     	lw	a0, 0x0(sp)
     130: 00410113     	addi	sp, sp, 0x4
     134: 00013083     	ld	ra, 0x0(sp)
     138: 00813403     	ld	s0, 0x8(sp)
     13c: 01010113     	addi	sp, sp, 0x10
     140: 00008067     	ret
