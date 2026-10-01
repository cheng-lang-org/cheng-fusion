
/Users/lbcheng/cheng-lang/.rebuild/i64shift_line/arms/x86_64-unknown-linux-gnu/disc.o:	file format elf64-x86-64

Disassembly of section .text:

0000000000000000 <main>:
       0: 55                           	pushq	%rbp
       1: 48 89 e5                     	movq	%rsp, %rbp
       4: 49 89 fc                     	movq	%rdi, %r12
       7: 49 89 f5                     	movq	%rsi, %r13
       a: e8 00 00 00 00               	callq	0xf <main+0xf>
       f: 83 f8 01                     	cmpl	$0x1, %eax
      12: 0f 84 0c 00 00 00            	je	0x24 <main+0x24>
      18: bf 46 00 00 00               	movl	$0x46, %edi
      1d: b8 e7 00 00 00               	movl	$0xe7, %eax
      22: 0f 05                        	syscall
      24: 4c 89 e7                     	movq	%r12, %rdi
      27: 4c 89 ee                     	movq	%r13, %rsi
      2a: e8 d9 29 00 00               	callq	0x2a08 <main>
      2f: 48 89 c7                     	movq	%rax, %rdi
      32: b8 e7 00 00 00               	movl	$0xe7, %eax
      37: 0f 05                        	syscall
      39: 90                           	nop
      3a: 90                           	nop
      3b: 90                           	nop

000000000000003c <system.strSubView>:
      3c: 55                           	pushq	%rbp
      3d: 48 89 e5                     	movq	%rsp, %rbp
      40: 48 81 ec 30 01 00 00         	subq	$0x130, %rsp            # imm = 0x130
      47: 48 89 bc 24 f0 00 00 00      	movq	%rdi, 0xf0(%rsp)
      4f: 48 89 b4 24 f8 00 00 00      	movq	%rsi, 0xf8(%rsp)
      57: 48 89 94 24 00 01 00 00      	movq	%rdx, 0x100(%rsp)
      5f: 48 89 8c 24 08 01 00 00      	movq	%rcx, 0x108(%rsp)
      67: 4c 89 84 24 10 01 00 00      	movq	%r8, 0x110(%rsp)
      6f: 4c 89 8c 24 18 01 00 00      	movq	%r9, 0x118(%rsp)
      77: 4c 8b 94 24 f8 00 00 00      	movq	0xf8(%rsp), %r10
      7f: 48 8d bc 24 08 00 00 00      	leaq	0x8(%rsp), %rdi
      87: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
      91: 4c 89 d6                     	movq	%r10, %rsi
      94: fc                           	cld
      95: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
      97: 44 8b 94 24 00 01 00 00      	movl	0x100(%rsp), %r10d
      9f: 44 89 94 24 20 00 00 00      	movl	%r10d, 0x20(%rsp)
      a7: 44 8b 94 24 08 01 00 00      	movl	0x108(%rsp), %r10d
      af: 44 89 94 24 24 00 00 00      	movl	%r10d, 0x24(%rsp)
      b7: 48 8d b4 24 08 00 00 00      	leaq	0x8(%rsp), %rsi
      bf: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
      c9: 48 8d bc 24 28 00 00 00      	leaq	0x28(%rsp), %rdi
      d1: fc                           	cld
      d2: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
      d4: 48 8b 84 24 30 00 00 00      	movq	0x30(%rsp), %rax
      dc: 89 84 24 c0 00 00 00         	movl	%eax, 0xc0(%rsp)
      e3: 8b 84 24 c0 00 00 00         	movl	0xc0(%rsp), %eax
      ea: 89 84 24 40 00 00 00         	movl	%eax, 0x40(%rsp)
      f1: 8b 84 24 20 00 00 00         	movl	0x20(%rsp), %eax
      f8: 89 84 24 44 00 00 00         	movl	%eax, 0x44(%rsp)
      ff: b8 00 00 00 00               	movl	$0x0, %eax
     104: 89 84 24 c0 00 00 00         	movl	%eax, 0xc0(%rsp)
     10b: 8b 84 24 44 00 00 00         	movl	0x44(%rsp), %eax
     112: 8b 8c 24 c0 00 00 00         	movl	0xc0(%rsp), %ecx
     119: 39 c8                        	cmpl	%ecx, %eax
     11b: 0f 9c c0                     	setl	%al
     11e: 0f b6 c0                     	movzbl	%al, %eax
     121: 89 84 24 48 00 00 00         	movl	%eax, 0x48(%rsp)
     128: b8 00 00 00 00               	movl	$0x0, %eax
     12d: 89 84 24 4c 00 00 00         	movl	%eax, 0x4c(%rsp)
     134: 8b 84 24 48 00 00 00         	movl	0x48(%rsp), %eax
     13b: 8b 8c 24 4c 00 00 00         	movl	0x4c(%rsp), %ecx
     142: 39 c8                        	cmpl	%ecx, %eax
     144: 0f 85 05 00 00 00            	jne	0x14f <system.strSubView+0x113>
     14a: e9 1f 00 00 00               	jmp	0x16e <system.strSubView+0x132>
     14f: b8 00 00 00 00               	movl	$0x0, %eax
     154: 89 84 24 c0 00 00 00         	movl	%eax, 0xc0(%rsp)
     15b: 8b 84 24 c0 00 00 00         	movl	0xc0(%rsp), %eax
     162: 89 84 24 44 00 00 00         	movl	%eax, 0x44(%rsp)
     169: e9 05 00 00 00               	jmp	0x173 <system.strSubView+0x137>
     16e: e9 00 00 00 00               	jmp	0x173 <system.strSubView+0x137>
     173: 8b 84 24 24 00 00 00         	movl	0x24(%rsp), %eax
     17a: 89 84 24 50 00 00 00         	movl	%eax, 0x50(%rsp)
     181: 8b 84 24 44 00 00 00         	movl	0x44(%rsp), %eax
     188: 8b 8c 24 50 00 00 00         	movl	0x50(%rsp), %ecx
     18f: 01 c8                        	addl	%ecx, %eax
     191: 89 84 24 c0 00 00 00         	movl	%eax, 0xc0(%rsp)
     198: 8b 84 24 c0 00 00 00         	movl	0xc0(%rsp), %eax
     19f: 8b 8c 24 40 00 00 00         	movl	0x40(%rsp), %ecx
     1a6: 39 c8                        	cmpl	%ecx, %eax
     1a8: 0f 9f c0                     	setg	%al
     1ab: 0f b6 c0                     	movzbl	%al, %eax
     1ae: 89 84 24 54 00 00 00         	movl	%eax, 0x54(%rsp)
     1b5: b8 00 00 00 00               	movl	$0x0, %eax
     1ba: 89 84 24 58 00 00 00         	movl	%eax, 0x58(%rsp)
     1c1: 8b 84 24 54 00 00 00         	movl	0x54(%rsp), %eax
     1c8: 8b 8c 24 58 00 00 00         	movl	0x58(%rsp), %ecx
     1cf: 39 c8                        	cmpl	%ecx, %eax
     1d1: 0f 85 05 00 00 00            	jne	0x1dc <system.strSubView+0x1a0>
     1d7: e9 2a 00 00 00               	jmp	0x206 <system.strSubView+0x1ca>
     1dc: 8b 84 24 40 00 00 00         	movl	0x40(%rsp), %eax
     1e3: 8b 8c 24 44 00 00 00         	movl	0x44(%rsp), %ecx
     1ea: 29 c8                        	subl	%ecx, %eax
     1ec: 89 84 24 c0 00 00 00         	movl	%eax, 0xc0(%rsp)
     1f3: 8b 84 24 c0 00 00 00         	movl	0xc0(%rsp), %eax
     1fa: 89 84 24 50 00 00 00         	movl	%eax, 0x50(%rsp)
     201: e9 05 00 00 00               	jmp	0x20b <system.strSubView+0x1cf>
     206: e9 00 00 00 00               	jmp	0x20b <system.strSubView+0x1cf>
     20b: 8b 84 24 44 00 00 00         	movl	0x44(%rsp), %eax
     212: 8b 8c 24 40 00 00 00         	movl	0x40(%rsp), %ecx
     219: 39 c8                        	cmpl	%ecx, %eax
     21b: 0f 9d c0                     	setge	%al
     21e: 0f b6 c0                     	movzbl	%al, %eax
     221: 89 84 24 5c 00 00 00         	movl	%eax, 0x5c(%rsp)
     228: b8 00 00 00 00               	movl	$0x0, %eax
     22d: 89 84 24 60 00 00 00         	movl	%eax, 0x60(%rsp)
     234: 8b 84 24 5c 00 00 00         	movl	0x5c(%rsp), %eax
     23b: 8b 8c 24 60 00 00 00         	movl	0x60(%rsp), %ecx
     242: 39 c8                        	cmpl	%ecx, %eax
     244: 0f 85 05 00 00 00            	jne	0x24f <system.strSubView+0x213>
     24a: e9 1f 00 00 00               	jmp	0x26e <system.strSubView+0x232>
     24f: b8 00 00 00 00               	movl	$0x0, %eax
     254: 89 84 24 c0 00 00 00         	movl	%eax, 0xc0(%rsp)
     25b: 8b 84 24 c0 00 00 00         	movl	0xc0(%rsp), %eax
     262: 89 84 24 50 00 00 00         	movl	%eax, 0x50(%rsp)
     269: e9 05 00 00 00               	jmp	0x273 <system.strSubView+0x237>
     26e: e9 00 00 00 00               	jmp	0x273 <system.strSubView+0x237>
     273: b8 00 00 00 00               	movl	$0x0, %eax
     278: 89 84 24 c0 00 00 00         	movl	%eax, 0xc0(%rsp)
     27f: 8b 84 24 50 00 00 00         	movl	0x50(%rsp), %eax
     286: 8b 8c 24 c0 00 00 00         	movl	0xc0(%rsp), %ecx
     28d: 39 c8                        	cmpl	%ecx, %eax
     28f: 0f 9c c0                     	setl	%al
     292: 0f b6 c0                     	movzbl	%al, %eax
     295: 89 84 24 64 00 00 00         	movl	%eax, 0x64(%rsp)
     29c: b8 00 00 00 00               	movl	$0x0, %eax
     2a1: 89 84 24 68 00 00 00         	movl	%eax, 0x68(%rsp)
     2a8: 8b 84 24 64 00 00 00         	movl	0x64(%rsp), %eax
     2af: 8b 8c 24 68 00 00 00         	movl	0x68(%rsp), %ecx
     2b6: 39 c8                        	cmpl	%ecx, %eax
     2b8: 0f 85 05 00 00 00            	jne	0x2c3 <system.strSubView+0x287>
     2be: e9 1f 00 00 00               	jmp	0x2e2 <system.strSubView+0x2a6>
     2c3: b8 00 00 00 00               	movl	$0x0, %eax
     2c8: 89 84 24 c0 00 00 00         	movl	%eax, 0xc0(%rsp)
     2cf: 8b 84 24 c0 00 00 00         	movl	0xc0(%rsp), %eax
     2d6: 89 84 24 50 00 00 00         	movl	%eax, 0x50(%rsp)
     2dd: e9 05 00 00 00               	jmp	0x2e7 <system.strSubView+0x2ab>
     2e2: e9 00 00 00 00               	jmp	0x2e7 <system.strSubView+0x2ab>
     2e7: 48 b8 00 00 00 00 00 00 00 00	movabsq	$0x0, %rax
     2f1: 48 89 84 24 d8 00 00 00      	movq	%rax, 0xd8(%rsp)
     2f9: 48 b8 00 00 00 00 00 00 00 00	movabsq	$0x0, %rax
     303: 48 89 84 24 e0 00 00 00      	movq	%rax, 0xe0(%rsp)
     30b: 48 b8 00 00 00 00 00 00 00 00	movabsq	$0x0, %rax
     315: 48 89 84 24 e8 00 00 00      	movq	%rax, 0xe8(%rsp)
     31d: 48 8d b4 24 d8 00 00 00      	leaq	0xd8(%rsp), %rsi
     325: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     32f: 48 8d bc 24 70 00 00 00      	leaq	0x70(%rsp), %rdi
     337: fc                           	cld
     338: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     33a: 48 8b 84 24 28 00 00 00      	movq	0x28(%rsp), %rax
     342: 48 89 84 24 c8 00 00 00      	movq	%rax, 0xc8(%rsp)
     34a: 48 8b 84 24 c8 00 00 00      	movq	0xc8(%rsp), %rax
     352: 48 89 84 24 70 00 00 00      	movq	%rax, 0x70(%rsp)
     35a: b8 00 00 00 00               	movl	$0x0, %eax
     35f: 89 84 24 c0 00 00 00         	movl	%eax, 0xc0(%rsp)
     366: 8b 84 24 c0 00 00 00         	movl	0xc0(%rsp), %eax
     36d: 89 84 24 78 00 00 00         	movl	%eax, 0x78(%rsp)
     374: 8b 84 24 34 00 00 00         	movl	0x34(%rsp), %eax
     37b: 89 84 24 c0 00 00 00         	movl	%eax, 0xc0(%rsp)
     382: 8b 84 24 c0 00 00 00         	movl	0xc0(%rsp), %eax
     389: 89 84 24 7c 00 00 00         	movl	%eax, 0x7c(%rsp)
     390: b8 00 00 00 00               	movl	$0x0, %eax
     395: 89 84 24 c0 00 00 00         	movl	%eax, 0xc0(%rsp)
     39c: 8b 84 24 c0 00 00 00         	movl	0xc0(%rsp), %eax
     3a3: 89 84 24 80 00 00 00         	movl	%eax, 0x80(%rsp)
     3aa: b8 00 00 00 00               	movl	$0x0, %eax
     3af: 89 84 24 c0 00 00 00         	movl	%eax, 0xc0(%rsp)
     3b6: 8b 84 24 50 00 00 00         	movl	0x50(%rsp), %eax
     3bd: 8b 8c 24 c0 00 00 00         	movl	0xc0(%rsp), %ecx
     3c4: 39 c8                        	cmpl	%ecx, %eax
     3c6: 0f 9f c0                     	setg	%al
     3c9: 0f b6 c0                     	movzbl	%al, %eax
     3cc: 89 84 24 88 00 00 00         	movl	%eax, 0x88(%rsp)
     3d3: b8 00 00 00 00               	movl	$0x0, %eax
     3d8: 89 84 24 8c 00 00 00         	movl	%eax, 0x8c(%rsp)
     3df: 8b 84 24 88 00 00 00         	movl	0x88(%rsp), %eax
     3e6: 8b 8c 24 8c 00 00 00         	movl	0x8c(%rsp), %ecx
     3ed: 39 c8                        	cmpl	%ecx, %eax
     3ef: 0f 85 05 00 00 00            	jne	0x3fa <system.strSubView+0x3be>
     3f5: e9 50 00 00 00               	jmp	0x44a <system.strSubView+0x40e>
     3fa: 48 8b 84 24 28 00 00 00      	movq	0x28(%rsp), %rax
     402: 48 89 84 24 c8 00 00 00      	movq	%rax, 0xc8(%rsp)
     40a: 48 8b 84 24 c8 00 00 00      	movq	0xc8(%rsp), %rax
     412: 8b 8c 24 44 00 00 00         	movl	0x44(%rsp), %ecx
     419: 48 63 c9                     	movslq	%ecx, %rcx
     41c: 48 01 c8                     	addq	%rcx, %rax
     41f: 48 89 84 24 d0 00 00 00      	movq	%rax, 0xd0(%rsp)
     427: 48 8b 84 24 d0 00 00 00      	movq	0xd0(%rsp), %rax
     42f: 48 89 84 24 70 00 00 00      	movq	%rax, 0x70(%rsp)
     437: 8b 84 24 50 00 00 00         	movl	0x50(%rsp), %eax
     43e: 89 84 24 78 00 00 00         	movl	%eax, 0x78(%rsp)
     445: e9 4a 00 00 00               	jmp	0x494 <system.strSubView+0x458>
     44a: e9 67 00 00 00               	jmp	0x4b6 <system.strSubView+0x47a>
     44f: 48 8d b4 24 90 00 00 00      	leaq	0x90(%rsp), %rsi
     457: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     461: 48 8d bc 24 a8 00 00 00      	leaq	0xa8(%rsp), %rdi
     469: fc                           	cld
     46a: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     46c: 4c 8b 84 24 f0 00 00 00      	movq	0xf0(%rsp), %r8
     474: 48 8d b4 24 a8 00 00 00      	leaq	0xa8(%rsp), %rsi
     47c: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     486: 4c 89 c7                     	movq	%r8, %rdi
     489: fc                           	cld
     48a: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     48c: 4c 89 c0                     	movq	%r8, %rax
     48f: 48 89 ec                     	movq	%rbp, %rsp
     492: 5d                           	popq	%rbp
     493: c3                           	retq
     494: 48 8d b4 24 70 00 00 00      	leaq	0x70(%rsp), %rsi
     49c: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     4a6: 48 8d bc 24 90 00 00 00      	leaq	0x90(%rsp), %rdi
     4ae: fc                           	cld
     4af: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     4b1: e9 99 ff ff ff               	jmp	0x44f <system.strSubView+0x413>
     4b6: 48 8d b4 24 70 00 00 00      	leaq	0x70(%rsp), %rsi
     4be: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     4c8: 48 8d bc 24 90 00 00 00      	leaq	0x90(%rsp), %rdi
     4d0: fc                           	cld
     4d1: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     4d3: e9 77 ff ff ff               	jmp	0x44f <system.strSubView+0x413>

00000000000004d8 <system.StrSubView>:
     4d8: 55                           	pushq	%rbp
     4d9: 48 89 e5                     	movq	%rsp, %rbp
     4dc: 48 81 ec 50 01 00 00         	subq	$0x150, %rsp            # imm = 0x150
     4e3: 48 89 bc 24 10 01 00 00      	movq	%rdi, 0x110(%rsp)
     4eb: 48 89 b4 24 18 01 00 00      	movq	%rsi, 0x118(%rsp)
     4f3: 48 89 94 24 20 01 00 00      	movq	%rdx, 0x120(%rsp)
     4fb: 48 89 8c 24 28 01 00 00      	movq	%rcx, 0x128(%rsp)
     503: 4c 89 84 24 30 01 00 00      	movq	%r8, 0x130(%rsp)
     50b: 4c 89 8c 24 38 01 00 00      	movq	%r9, 0x138(%rsp)
     513: 4c 8b 94 24 18 01 00 00      	movq	0x118(%rsp), %r10
     51b: 48 8d bc 24 08 00 00 00      	leaq	0x8(%rsp), %rdi
     523: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     52d: 4c 89 d6                     	movq	%r10, %rsi
     530: fc                           	cld
     531: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     533: 44 8b 94 24 20 01 00 00      	movl	0x120(%rsp), %r10d
     53b: 44 89 94 24 20 00 00 00      	movl	%r10d, 0x20(%rsp)
     543: 44 8b 94 24 28 01 00 00      	movl	0x128(%rsp), %r10d
     54b: 44 89 94 24 24 00 00 00      	movl	%r10d, 0x24(%rsp)
     553: 48 8d b4 24 08 00 00 00      	leaq	0x8(%rsp), %rsi
     55b: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     565: 48 8d bc 24 28 00 00 00      	leaq	0x28(%rsp), %rdi
     56d: fc                           	cld
     56e: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     570: b8 00 00 00 00               	movl	$0x0, %eax
     575: 89 84 24 40 00 00 00         	movl	%eax, 0x40(%rsp)
     57c: 48 8b 84 24 28 00 00 00      	movq	0x28(%rsp), %rax
     584: 48 89 84 24 e8 00 00 00      	movq	%rax, 0xe8(%rsp)
     58c: 48 b8 00 00 00 00 00 00 00 00	movabsq	$0x0, %rax
     596: 48 89 84 24 f0 00 00 00      	movq	%rax, 0xf0(%rsp)
     59e: 48 8b 84 24 e8 00 00 00      	movq	0xe8(%rsp), %rax
     5a6: 48 8b 8c 24 f0 00 00 00      	movq	0xf0(%rsp), %rcx
     5ae: 48 39 c8                     	cmpq	%rcx, %rax
     5b1: 0f 95 c0                     	setne	%al
     5b4: 0f b6 c0                     	movzbl	%al, %eax
     5b7: 89 84 24 4c 00 00 00         	movl	%eax, 0x4c(%rsp)
     5be: b8 00 00 00 00               	movl	$0x0, %eax
     5c3: 89 84 24 50 00 00 00         	movl	%eax, 0x50(%rsp)
     5ca: 8b 84 24 4c 00 00 00         	movl	0x4c(%rsp), %eax
     5d1: 8b 8c 24 50 00 00 00         	movl	0x50(%rsp), %ecx
     5d8: 39 c8                        	cmpl	%ecx, %eax
     5da: 0f 85 2c 00 00 00            	jne	0x60c <system.StrSubView+0x134>
     5e0: e9 38 00 00 00               	jmp	0x61d <system.StrSubView+0x145>
     5e5: 48 8b 84 24 30 00 00 00      	movq	0x30(%rsp), %rax
     5ed: 89 84 24 e0 00 00 00         	movl	%eax, 0xe0(%rsp)
     5f4: 8b 84 24 e0 00 00 00         	movl	0xe0(%rsp), %eax
     5fb: 89 84 24 40 00 00 00         	movl	%eax, 0x40(%rsp)
     602: e9 1a 01 00 00               	jmp	0x721 <system.StrSubView+0x249>
     607: e9 15 01 00 00               	jmp	0x721 <system.StrSubView+0x249>
     60c: b8 01 00 00 00               	movl	$0x1, %eax
     611: 89 84 24 48 00 00 00         	movl	%eax, 0x48(%rsp)
     618: e9 11 00 00 00               	jmp	0x62e <system.StrSubView+0x156>
     61d: b8 00 00 00 00               	movl	$0x0, %eax
     622: 89 84 24 48 00 00 00         	movl	%eax, 0x48(%rsp)
     629: e9 00 00 00 00               	jmp	0x62e <system.StrSubView+0x156>
     62e: b8 00 00 00 00               	movl	$0x0, %eax
     633: 89 84 24 54 00 00 00         	movl	%eax, 0x54(%rsp)
     63a: 8b 84 24 48 00 00 00         	movl	0x48(%rsp), %eax
     641: 8b 8c 24 54 00 00 00         	movl	0x54(%rsp), %ecx
     648: 39 c8                        	cmpl	%ecx, %eax
     64a: 0f 85 16 00 00 00            	jne	0x666 <system.StrSubView+0x18e>
     650: e9 00 00 00 00               	jmp	0x655 <system.StrSubView+0x17d>
     655: b8 00 00 00 00               	movl	$0x0, %eax
     65a: 89 84 24 44 00 00 00         	movl	%eax, 0x44(%rsp)
     661: e9 5f 00 00 00               	jmp	0x6c5 <system.StrSubView+0x1ed>
     666: 48 8b 84 24 30 00 00 00      	movq	0x30(%rsp), %rax
     66e: 89 84 24 e0 00 00 00         	movl	%eax, 0xe0(%rsp)
     675: b8 00 00 00 00               	movl	$0x0, %eax
     67a: 89 84 24 e4 00 00 00         	movl	%eax, 0xe4(%rsp)
     681: 8b 84 24 e0 00 00 00         	movl	0xe0(%rsp), %eax
     688: 8b 8c 24 e4 00 00 00         	movl	0xe4(%rsp), %ecx
     68f: 39 c8                        	cmpl	%ecx, %eax
     691: 0f 9f c0                     	setg	%al
     694: 0f b6 c0                     	movzbl	%al, %eax
     697: 89 84 24 5c 00 00 00         	movl	%eax, 0x5c(%rsp)
     69e: b8 00 00 00 00               	movl	$0x0, %eax
     6a3: 89 84 24 60 00 00 00         	movl	%eax, 0x60(%rsp)
     6aa: 8b 84 24 5c 00 00 00         	movl	0x5c(%rsp), %eax
     6b1: 8b 8c 24 60 00 00 00         	movl	0x60(%rsp), %ecx
     6b8: 39 c8                        	cmpl	%ecx, %eax
     6ba: 0f 85 2c 00 00 00            	jne	0x6ec <system.StrSubView+0x214>
     6c0: e9 38 00 00 00               	jmp	0x6fd <system.StrSubView+0x225>
     6c5: b8 00 00 00 00               	movl	$0x0, %eax
     6ca: 89 84 24 64 00 00 00         	movl	%eax, 0x64(%rsp)
     6d1: 8b 84 24 44 00 00 00         	movl	0x44(%rsp), %eax
     6d8: 8b 8c 24 64 00 00 00         	movl	0x64(%rsp), %ecx
     6df: 39 c8                        	cmpl	%ecx, %eax
     6e1: 0f 85 fe fe ff ff            	jne	0x5e5 <system.StrSubView+0x10d>
     6e7: e9 1b ff ff ff               	jmp	0x607 <system.StrSubView+0x12f>
     6ec: b8 01 00 00 00               	movl	$0x1, %eax
     6f1: 89 84 24 58 00 00 00         	movl	%eax, 0x58(%rsp)
     6f8: e9 11 00 00 00               	jmp	0x70e <system.StrSubView+0x236>
     6fd: b8 00 00 00 00               	movl	$0x0, %eax
     702: 89 84 24 58 00 00 00         	movl	%eax, 0x58(%rsp)
     709: e9 00 00 00 00               	jmp	0x70e <system.StrSubView+0x236>
     70e: 8b 84 24 58 00 00 00         	movl	0x58(%rsp), %eax
     715: 89 84 24 44 00 00 00         	movl	%eax, 0x44(%rsp)
     71c: e9 a4 ff ff ff               	jmp	0x6c5 <system.StrSubView+0x1ed>
     721: 8b 84 24 20 00 00 00         	movl	0x20(%rsp), %eax
     728: 89 84 24 68 00 00 00         	movl	%eax, 0x68(%rsp)
     72f: b8 00 00 00 00               	movl	$0x0, %eax
     734: 89 84 24 e0 00 00 00         	movl	%eax, 0xe0(%rsp)
     73b: 8b 84 24 68 00 00 00         	movl	0x68(%rsp), %eax
     742: 8b 8c 24 e0 00 00 00         	movl	0xe0(%rsp), %ecx
     749: 39 c8                        	cmpl	%ecx, %eax
     74b: 0f 9c c0                     	setl	%al
     74e: 0f b6 c0                     	movzbl	%al, %eax
     751: 89 84 24 6c 00 00 00         	movl	%eax, 0x6c(%rsp)
     758: b8 00 00 00 00               	movl	$0x0, %eax
     75d: 89 84 24 70 00 00 00         	movl	%eax, 0x70(%rsp)
     764: 8b 84 24 6c 00 00 00         	movl	0x6c(%rsp), %eax
     76b: 8b 8c 24 70 00 00 00         	movl	0x70(%rsp), %ecx
     772: 39 c8                        	cmpl	%ecx, %eax
     774: 0f 85 05 00 00 00            	jne	0x77f <system.StrSubView+0x2a7>
     77a: e9 1f 00 00 00               	jmp	0x79e <system.StrSubView+0x2c6>
     77f: b8 00 00 00 00               	movl	$0x0, %eax
     784: 89 84 24 e0 00 00 00         	movl	%eax, 0xe0(%rsp)
     78b: 8b 84 24 e0 00 00 00         	movl	0xe0(%rsp), %eax
     792: 89 84 24 68 00 00 00         	movl	%eax, 0x68(%rsp)
     799: e9 05 00 00 00               	jmp	0x7a3 <system.StrSubView+0x2cb>
     79e: e9 00 00 00 00               	jmp	0x7a3 <system.StrSubView+0x2cb>
     7a3: 8b 84 24 24 00 00 00         	movl	0x24(%rsp), %eax
     7aa: 89 84 24 74 00 00 00         	movl	%eax, 0x74(%rsp)
     7b1: 8b 84 24 68 00 00 00         	movl	0x68(%rsp), %eax
     7b8: 8b 8c 24 74 00 00 00         	movl	0x74(%rsp), %ecx
     7bf: 01 c8                        	addl	%ecx, %eax
     7c1: 89 84 24 e0 00 00 00         	movl	%eax, 0xe0(%rsp)
     7c8: 8b 84 24 e0 00 00 00         	movl	0xe0(%rsp), %eax
     7cf: 8b 8c 24 40 00 00 00         	movl	0x40(%rsp), %ecx
     7d6: 39 c8                        	cmpl	%ecx, %eax
     7d8: 0f 9f c0                     	setg	%al
     7db: 0f b6 c0                     	movzbl	%al, %eax
     7de: 89 84 24 78 00 00 00         	movl	%eax, 0x78(%rsp)
     7e5: b8 00 00 00 00               	movl	$0x0, %eax
     7ea: 89 84 24 7c 00 00 00         	movl	%eax, 0x7c(%rsp)
     7f1: 8b 84 24 78 00 00 00         	movl	0x78(%rsp), %eax
     7f8: 8b 8c 24 7c 00 00 00         	movl	0x7c(%rsp), %ecx
     7ff: 39 c8                        	cmpl	%ecx, %eax
     801: 0f 85 05 00 00 00            	jne	0x80c <system.StrSubView+0x334>
     807: e9 2a 00 00 00               	jmp	0x836 <system.StrSubView+0x35e>
     80c: 8b 84 24 40 00 00 00         	movl	0x40(%rsp), %eax
     813: 8b 8c 24 68 00 00 00         	movl	0x68(%rsp), %ecx
     81a: 29 c8                        	subl	%ecx, %eax
     81c: 89 84 24 e0 00 00 00         	movl	%eax, 0xe0(%rsp)
     823: 8b 84 24 e0 00 00 00         	movl	0xe0(%rsp), %eax
     82a: 89 84 24 74 00 00 00         	movl	%eax, 0x74(%rsp)
     831: e9 05 00 00 00               	jmp	0x83b <system.StrSubView+0x363>
     836: e9 00 00 00 00               	jmp	0x83b <system.StrSubView+0x363>
     83b: 8b 84 24 68 00 00 00         	movl	0x68(%rsp), %eax
     842: 8b 8c 24 40 00 00 00         	movl	0x40(%rsp), %ecx
     849: 39 c8                        	cmpl	%ecx, %eax
     84b: 0f 9d c0                     	setge	%al
     84e: 0f b6 c0                     	movzbl	%al, %eax
     851: 89 84 24 80 00 00 00         	movl	%eax, 0x80(%rsp)
     858: b8 00 00 00 00               	movl	$0x0, %eax
     85d: 89 84 24 84 00 00 00         	movl	%eax, 0x84(%rsp)
     864: 8b 84 24 80 00 00 00         	movl	0x80(%rsp), %eax
     86b: 8b 8c 24 84 00 00 00         	movl	0x84(%rsp), %ecx
     872: 39 c8                        	cmpl	%ecx, %eax
     874: 0f 85 05 00 00 00            	jne	0x87f <system.StrSubView+0x3a7>
     87a: e9 1f 00 00 00               	jmp	0x89e <system.StrSubView+0x3c6>
     87f: b8 00 00 00 00               	movl	$0x0, %eax
     884: 89 84 24 e0 00 00 00         	movl	%eax, 0xe0(%rsp)
     88b: 8b 84 24 e0 00 00 00         	movl	0xe0(%rsp), %eax
     892: 89 84 24 74 00 00 00         	movl	%eax, 0x74(%rsp)
     899: e9 05 00 00 00               	jmp	0x8a3 <system.StrSubView+0x3cb>
     89e: e9 00 00 00 00               	jmp	0x8a3 <system.StrSubView+0x3cb>
     8a3: b8 00 00 00 00               	movl	$0x0, %eax
     8a8: 89 84 24 e0 00 00 00         	movl	%eax, 0xe0(%rsp)
     8af: 8b 84 24 74 00 00 00         	movl	0x74(%rsp), %eax
     8b6: 8b 8c 24 e0 00 00 00         	movl	0xe0(%rsp), %ecx
     8bd: 39 c8                        	cmpl	%ecx, %eax
     8bf: 0f 9c c0                     	setl	%al
     8c2: 0f b6 c0                     	movzbl	%al, %eax
     8c5: 89 84 24 88 00 00 00         	movl	%eax, 0x88(%rsp)
     8cc: b8 00 00 00 00               	movl	$0x0, %eax
     8d1: 89 84 24 8c 00 00 00         	movl	%eax, 0x8c(%rsp)
     8d8: 8b 84 24 88 00 00 00         	movl	0x88(%rsp), %eax
     8df: 8b 8c 24 8c 00 00 00         	movl	0x8c(%rsp), %ecx
     8e6: 39 c8                        	cmpl	%ecx, %eax
     8e8: 0f 85 05 00 00 00            	jne	0x8f3 <system.StrSubView+0x41b>
     8ee: e9 1f 00 00 00               	jmp	0x912 <system.StrSubView+0x43a>
     8f3: b8 00 00 00 00               	movl	$0x0, %eax
     8f8: 89 84 24 e0 00 00 00         	movl	%eax, 0xe0(%rsp)
     8ff: 8b 84 24 e0 00 00 00         	movl	0xe0(%rsp), %eax
     906: 89 84 24 74 00 00 00         	movl	%eax, 0x74(%rsp)
     90d: e9 05 00 00 00               	jmp	0x917 <system.StrSubView+0x43f>
     912: e9 00 00 00 00               	jmp	0x917 <system.StrSubView+0x43f>
     917: 48 b8 00 00 00 00 00 00 00 00	movabsq	$0x0, %rax
     921: 48 89 84 24 f8 00 00 00      	movq	%rax, 0xf8(%rsp)
     929: 48 b8 00 00 00 00 00 00 00 00	movabsq	$0x0, %rax
     933: 48 89 84 24 00 01 00 00      	movq	%rax, 0x100(%rsp)
     93b: 48 b8 00 00 00 00 00 00 00 00	movabsq	$0x0, %rax
     945: 48 89 84 24 08 01 00 00      	movq	%rax, 0x108(%rsp)
     94d: 48 8d b4 24 f8 00 00 00      	leaq	0xf8(%rsp), %rsi
     955: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     95f: 48 8d bc 24 90 00 00 00      	leaq	0x90(%rsp), %rdi
     967: fc                           	cld
     968: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     96a: 48 8b 84 24 28 00 00 00      	movq	0x28(%rsp), %rax
     972: 48 89 84 24 e8 00 00 00      	movq	%rax, 0xe8(%rsp)
     97a: 48 8b 84 24 e8 00 00 00      	movq	0xe8(%rsp), %rax
     982: 48 89 84 24 90 00 00 00      	movq	%rax, 0x90(%rsp)
     98a: b8 00 00 00 00               	movl	$0x0, %eax
     98f: 89 84 24 e0 00 00 00         	movl	%eax, 0xe0(%rsp)
     996: 8b 84 24 e0 00 00 00         	movl	0xe0(%rsp), %eax
     99d: 89 84 24 98 00 00 00         	movl	%eax, 0x98(%rsp)
     9a4: 8b 84 24 34 00 00 00         	movl	0x34(%rsp), %eax
     9ab: 89 84 24 e0 00 00 00         	movl	%eax, 0xe0(%rsp)
     9b2: 8b 84 24 e0 00 00 00         	movl	0xe0(%rsp), %eax
     9b9: 89 84 24 9c 00 00 00         	movl	%eax, 0x9c(%rsp)
     9c0: b8 00 00 00 00               	movl	$0x0, %eax
     9c5: 89 84 24 e0 00 00 00         	movl	%eax, 0xe0(%rsp)
     9cc: 8b 84 24 e0 00 00 00         	movl	0xe0(%rsp), %eax
     9d3: 89 84 24 a0 00 00 00         	movl	%eax, 0xa0(%rsp)
     9da: b8 00 00 00 00               	movl	$0x0, %eax
     9df: 89 84 24 e0 00 00 00         	movl	%eax, 0xe0(%rsp)
     9e6: 8b 84 24 74 00 00 00         	movl	0x74(%rsp), %eax
     9ed: 8b 8c 24 e0 00 00 00         	movl	0xe0(%rsp), %ecx
     9f4: 39 c8                        	cmpl	%ecx, %eax
     9f6: 0f 9f c0                     	setg	%al
     9f9: 0f b6 c0                     	movzbl	%al, %eax
     9fc: 89 84 24 a8 00 00 00         	movl	%eax, 0xa8(%rsp)
     a03: b8 00 00 00 00               	movl	$0x0, %eax
     a08: 89 84 24 ac 00 00 00         	movl	%eax, 0xac(%rsp)
     a0f: 8b 84 24 a8 00 00 00         	movl	0xa8(%rsp), %eax
     a16: 8b 8c 24 ac 00 00 00         	movl	0xac(%rsp), %ecx
     a1d: 39 c8                        	cmpl	%ecx, %eax
     a1f: 0f 85 05 00 00 00            	jne	0xa2a <system.StrSubView+0x552>
     a25: e9 50 00 00 00               	jmp	0xa7a <system.StrSubView+0x5a2>
     a2a: 48 8b 84 24 28 00 00 00      	movq	0x28(%rsp), %rax
     a32: 48 89 84 24 e8 00 00 00      	movq	%rax, 0xe8(%rsp)
     a3a: 48 8b 84 24 e8 00 00 00      	movq	0xe8(%rsp), %rax
     a42: 8b 8c 24 68 00 00 00         	movl	0x68(%rsp), %ecx
     a49: 48 63 c9                     	movslq	%ecx, %rcx
     a4c: 48 01 c8                     	addq	%rcx, %rax
     a4f: 48 89 84 24 f0 00 00 00      	movq	%rax, 0xf0(%rsp)
     a57: 48 8b 84 24 f0 00 00 00      	movq	0xf0(%rsp), %rax
     a5f: 48 89 84 24 90 00 00 00      	movq	%rax, 0x90(%rsp)
     a67: 8b 84 24 74 00 00 00         	movl	0x74(%rsp), %eax
     a6e: 89 84 24 98 00 00 00         	movl	%eax, 0x98(%rsp)
     a75: e9 4a 00 00 00               	jmp	0xac4 <system.StrSubView+0x5ec>
     a7a: e9 67 00 00 00               	jmp	0xae6 <system.StrSubView+0x60e>
     a7f: 48 8d b4 24 b0 00 00 00      	leaq	0xb0(%rsp), %rsi
     a87: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     a91: 48 8d bc 24 c8 00 00 00      	leaq	0xc8(%rsp), %rdi
     a99: fc                           	cld
     a9a: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     a9c: 4c 8b 84 24 10 01 00 00      	movq	0x110(%rsp), %r8
     aa4: 48 8d b4 24 c8 00 00 00      	leaq	0xc8(%rsp), %rsi
     aac: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     ab6: 4c 89 c7                     	movq	%r8, %rdi
     ab9: fc                           	cld
     aba: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     abc: 4c 89 c0                     	movq	%r8, %rax
     abf: 48 89 ec                     	movq	%rbp, %rsp
     ac2: 5d                           	popq	%rbp
     ac3: c3                           	retq
     ac4: 48 8d b4 24 90 00 00 00      	leaq	0x90(%rsp), %rsi
     acc: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     ad6: 48 8d bc 24 b0 00 00 00      	leaq	0xb0(%rsp), %rdi
     ade: fc                           	cld
     adf: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     ae1: e9 99 ff ff ff               	jmp	0xa7f <system.StrSubView+0x5a7>
     ae6: 48 8d b4 24 90 00 00 00      	leaq	0x90(%rsp), %rsi
     aee: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     af8: 48 8d bc 24 b0 00 00 00      	leaq	0xb0(%rsp), %rdi
     b00: fc                           	cld
     b01: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     b03: e9 77 ff ff ff               	jmp	0xa7f <system.StrSubView+0x5a7>

0000000000000b08 <stdstrings.hasPrefix>:
     b08: 55                           	pushq	%rbp
     b09: 48 89 e5                     	movq	%rsp, %rbp
     b0c: 48 81 ec e0 00 00 00         	subq	$0xe0, %rsp
     b13: 48 89 bc 24 a0 00 00 00      	movq	%rdi, 0xa0(%rsp)
     b1b: 48 89 b4 24 a8 00 00 00      	movq	%rsi, 0xa8(%rsp)
     b23: 48 89 94 24 b0 00 00 00      	movq	%rdx, 0xb0(%rsp)
     b2b: 48 89 8c 24 b8 00 00 00      	movq	%rcx, 0xb8(%rsp)
     b33: 4c 89 84 24 c0 00 00 00      	movq	%r8, 0xc0(%rsp)
     b3b: 4c 89 8c 24 c8 00 00 00      	movq	%r9, 0xc8(%rsp)
     b43: 4c 8b 94 24 a0 00 00 00      	movq	0xa0(%rsp), %r10
     b4b: 48 8d bc 24 00 00 00 00      	leaq	(%rsp), %rdi
     b53: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     b5d: 4c 89 d6                     	movq	%r10, %rsi
     b60: fc                           	cld
     b61: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     b63: 4c 8b 94 24 a8 00 00 00      	movq	0xa8(%rsp), %r10
     b6b: 48 8d bc 24 18 00 00 00      	leaq	0x18(%rsp), %rdi
     b73: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     b7d: 4c 89 d6                     	movq	%r10, %rsi
     b80: fc                           	cld
     b81: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     b83: 48 8d b4 24 00 00 00 00      	leaq	(%rsp), %rsi
     b8b: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     b95: 48 8d bc 24 30 00 00 00      	leaq	0x30(%rsp), %rdi
     b9d: fc                           	cld
     b9e: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     ba0: 48 8d b4 24 18 00 00 00      	leaq	0x18(%rsp), %rsi
     ba8: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     bb2: 48 8d bc 24 48 00 00 00      	leaq	0x48(%rsp), %rdi
     bba: fc                           	cld
     bbb: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     bbd: 48 8b 84 24 38 00 00 00      	movq	0x38(%rsp), %rax
     bc5: 89 84 24 94 00 00 00         	movl	%eax, 0x94(%rsp)
     bcc: 8b 84 24 94 00 00 00         	movl	0x94(%rsp), %eax
     bd3: 89 84 24 60 00 00 00         	movl	%eax, 0x60(%rsp)
     bda: 48 8b 84 24 50 00 00 00      	movq	0x50(%rsp), %rax
     be2: 89 84 24 94 00 00 00         	movl	%eax, 0x94(%rsp)
     be9: 8b 84 24 94 00 00 00         	movl	0x94(%rsp), %eax
     bf0: 89 84 24 64 00 00 00         	movl	%eax, 0x64(%rsp)
     bf7: b8 00 00 00 00               	movl	$0x0, %eax
     bfc: 89 84 24 94 00 00 00         	movl	%eax, 0x94(%rsp)
     c03: 8b 84 24 64 00 00 00         	movl	0x64(%rsp), %eax
     c0a: 8b 8c 24 94 00 00 00         	movl	0x94(%rsp), %ecx
     c11: 39 c8                        	cmpl	%ecx, %eax
     c13: 0f 94 c0                     	sete	%al
     c16: 0f b6 c0                     	movzbl	%al, %eax
     c19: 89 84 24 68 00 00 00         	movl	%eax, 0x68(%rsp)
     c20: b8 00 00 00 00               	movl	$0x0, %eax
     c25: 89 84 24 6c 00 00 00         	movl	%eax, 0x6c(%rsp)
     c2c: 8b 84 24 68 00 00 00         	movl	0x68(%rsp), %eax
     c33: 8b 8c 24 6c 00 00 00         	movl	0x6c(%rsp), %ecx
     c3a: 39 c8                        	cmpl	%ecx, %eax
     c3c: 0f 85 05 00 00 00            	jne	0xc47 <stdstrings.hasPrefix+0x13f>
     c42: e9 18 00 00 00               	jmp	0xc5f <stdstrings.hasPrefix+0x157>
     c47: b8 01 00 00 00               	movl	$0x1, %eax
     c4c: 89 84 24 70 00 00 00         	movl	%eax, 0x70(%rsp)
     c53: 8b 84 24 70 00 00 00         	movl	0x70(%rsp), %eax
     c5a: 48 89 ec                     	movq	%rbp, %rsp
     c5d: 5d                           	popq	%rbp
     c5e: c3                           	retq
     c5f: 8b 84 24 64 00 00 00         	movl	0x64(%rsp), %eax
     c66: 8b 8c 24 60 00 00 00         	movl	0x60(%rsp), %ecx
     c6d: 39 c8                        	cmpl	%ecx, %eax
     c6f: 0f 9f c0                     	setg	%al
     c72: 0f b6 c0                     	movzbl	%al, %eax
     c75: 89 84 24 74 00 00 00         	movl	%eax, 0x74(%rsp)
     c7c: b8 00 00 00 00               	movl	$0x0, %eax
     c81: 89 84 24 78 00 00 00         	movl	%eax, 0x78(%rsp)
     c88: 8b 84 24 74 00 00 00         	movl	0x74(%rsp), %eax
     c8f: 8b 8c 24 78 00 00 00         	movl	0x78(%rsp), %ecx
     c96: 39 c8                        	cmpl	%ecx, %eax
     c98: 0f 85 05 00 00 00            	jne	0xca3 <stdstrings.hasPrefix+0x19b>
     c9e: e9 18 00 00 00               	jmp	0xcbb <stdstrings.hasPrefix+0x1b3>
     ca3: b8 00 00 00 00               	movl	$0x0, %eax
     ca8: 89 84 24 7c 00 00 00         	movl	%eax, 0x7c(%rsp)
     caf: 8b 84 24 7c 00 00 00         	movl	0x7c(%rsp), %eax
     cb6: 48 89 ec                     	movq	%rbp, %rsp
     cb9: 5d                           	popq	%rbp
     cba: c3                           	retq
     cbb: b8 00 00 00 00               	movl	$0x0, %eax
     cc0: 89 84 24 94 00 00 00         	movl	%eax, 0x94(%rsp)
     cc7: 8b 84 24 94 00 00 00         	movl	0x94(%rsp), %eax
     cce: 89 84 24 80 00 00 00         	movl	%eax, 0x80(%rsp)
     cd5: e9 00 00 00 00               	jmp	0xcda <stdstrings.hasPrefix+0x1d2>
     cda: 8b 84 24 80 00 00 00         	movl	0x80(%rsp), %eax
     ce1: 8b 8c 24 64 00 00 00         	movl	0x64(%rsp), %ecx
     ce8: 39 c8                        	cmpl	%ecx, %eax
     cea: 0f 8c 05 00 00 00            	jl	0xcf5 <stdstrings.hasPrefix+0x1ed>
     cf0: e9 f7 00 00 00               	jmp	0xdec <stdstrings.hasPrefix+0x2e4>
     cf5: 48 8b 8c 24 30 00 00 00      	movq	0x30(%rsp), %rcx
     cfd: 8b 94 24 38 00 00 00         	movl	0x38(%rsp), %edx
     d04: 8b 9c 24 80 00 00 00         	movl	0x80(%rsp), %ebx
     d0b: 85 db                        	testl	%ebx, %ebx
     d0d: 7d 01                        	jge	0xd10 <stdstrings.hasPrefix+0x208>
     d0f: cc                           	int3
     d10: 39 da                        	cmpl	%ebx, %edx
     d12: 7f 01                        	jg	0xd15 <stdstrings.hasPrefix+0x20d>
     d14: cc                           	int3
     d15: 48 63 db                     	movslq	%ebx, %rbx
     d18: 48 01 d9                     	addq	%rbx, %rcx
     d1b: 0f b6 01                     	movzbl	(%rcx), %eax
     d1e: 89 84 24 94 00 00 00         	movl	%eax, 0x94(%rsp)
     d25: 48 8b 8c 24 48 00 00 00      	movq	0x48(%rsp), %rcx
     d2d: 8b 94 24 50 00 00 00         	movl	0x50(%rsp), %edx
     d34: 8b 9c 24 80 00 00 00         	movl	0x80(%rsp), %ebx
     d3b: 85 db                        	testl	%ebx, %ebx
     d3d: 7d 01                        	jge	0xd40 <stdstrings.hasPrefix+0x238>
     d3f: cc                           	int3
     d40: 39 da                        	cmpl	%ebx, %edx
     d42: 7f 01                        	jg	0xd45 <stdstrings.hasPrefix+0x23d>
     d44: cc                           	int3
     d45: 48 63 db                     	movslq	%ebx, %rbx
     d48: 48 01 d9                     	addq	%rbx, %rcx
     d4b: 0f b6 01                     	movzbl	(%rcx), %eax
     d4e: 89 84 24 98 00 00 00         	movl	%eax, 0x98(%rsp)
     d55: 8b 84 24 94 00 00 00         	movl	0x94(%rsp), %eax
     d5c: 8b 8c 24 98 00 00 00         	movl	0x98(%rsp), %ecx
     d63: 39 c8                        	cmpl	%ecx, %eax
     d65: 0f 95 c0                     	setne	%al
     d68: 0f b6 c0                     	movzbl	%al, %eax
     d6b: 89 84 24 84 00 00 00         	movl	%eax, 0x84(%rsp)
     d72: b8 00 00 00 00               	movl	$0x0, %eax
     d77: 89 84 24 88 00 00 00         	movl	%eax, 0x88(%rsp)
     d7e: 8b 84 24 84 00 00 00         	movl	0x84(%rsp), %eax
     d85: 8b 8c 24 88 00 00 00         	movl	0x88(%rsp), %ecx
     d8c: 39 c8                        	cmpl	%ecx, %eax
     d8e: 0f 85 05 00 00 00            	jne	0xd99 <stdstrings.hasPrefix+0x291>
     d94: e9 18 00 00 00               	jmp	0xdb1 <stdstrings.hasPrefix+0x2a9>
     d99: b8 00 00 00 00               	movl	$0x0, %eax
     d9e: 89 84 24 8c 00 00 00         	movl	%eax, 0x8c(%rsp)
     da5: 8b 84 24 8c 00 00 00         	movl	0x8c(%rsp), %eax
     dac: 48 89 ec                     	movq	%rbp, %rsp
     daf: 5d                           	popq	%rbp
     db0: c3                           	retq
     db1: e9 00 00 00 00               	jmp	0xdb6 <stdstrings.hasPrefix+0x2ae>
     db6: b8 01 00 00 00               	movl	$0x1, %eax
     dbb: 89 84 24 94 00 00 00         	movl	%eax, 0x94(%rsp)
     dc2: 8b 84 24 80 00 00 00         	movl	0x80(%rsp), %eax
     dc9: 8b 8c 24 94 00 00 00         	movl	0x94(%rsp), %ecx
     dd0: 01 c8                        	addl	%ecx, %eax
     dd2: 89 84 24 98 00 00 00         	movl	%eax, 0x98(%rsp)
     dd9: 8b 84 24 98 00 00 00         	movl	0x98(%rsp), %eax
     de0: 89 84 24 80 00 00 00         	movl	%eax, 0x80(%rsp)
     de7: e9 ee fe ff ff               	jmp	0xcda <stdstrings.hasPrefix+0x1d2>
     dec: b8 01 00 00 00               	movl	$0x1, %eax
     df1: 89 84 24 90 00 00 00         	movl	%eax, 0x90(%rsp)
     df8: 8b 84 24 90 00 00 00         	movl	0x90(%rsp), %eax
     dff: 48 89 ec                     	movq	%rbp, %rsp
     e02: 5d                           	popq	%rbp
     e03: c3                           	retq

0000000000000e04 <stdstrings.dropPrefix>:
     e04: 55                           	pushq	%rbp
     e05: 48 89 e5                     	movq	%rsp, %rbp
     e08: 48 81 ec f0 00 00 00         	subq	$0xf0, %rsp
     e0f: 48 89 bc 24 b0 00 00 00      	movq	%rdi, 0xb0(%rsp)
     e17: 48 89 b4 24 b8 00 00 00      	movq	%rsi, 0xb8(%rsp)
     e1f: 48 89 94 24 c0 00 00 00      	movq	%rdx, 0xc0(%rsp)
     e27: 48 89 8c 24 c8 00 00 00      	movq	%rcx, 0xc8(%rsp)
     e2f: 4c 89 84 24 d0 00 00 00      	movq	%r8, 0xd0(%rsp)
     e37: 4c 89 8c 24 d8 00 00 00      	movq	%r9, 0xd8(%rsp)
     e3f: 4c 8b 94 24 b8 00 00 00      	movq	0xb8(%rsp), %r10
     e47: 48 8d bc 24 08 00 00 00      	leaq	0x8(%rsp), %rdi
     e4f: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     e59: 4c 89 d6                     	movq	%r10, %rsi
     e5c: fc                           	cld
     e5d: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     e5f: 4c 8b 94 24 c0 00 00 00      	movq	0xc0(%rsp), %r10
     e67: 48 8d bc 24 20 00 00 00      	leaq	0x20(%rsp), %rdi
     e6f: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     e79: 4c 89 d6                     	movq	%r10, %rsi
     e7c: fc                           	cld
     e7d: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     e7f: 48 8d b4 24 08 00 00 00      	leaq	0x8(%rsp), %rsi
     e87: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     e91: 48 8d bc 24 38 00 00 00      	leaq	0x38(%rsp), %rdi
     e99: fc                           	cld
     e9a: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     e9c: 48 8d b4 24 20 00 00 00      	leaq	0x20(%rsp), %rsi
     ea4: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     eae: 48 8d bc 24 50 00 00 00      	leaq	0x50(%rsp), %rdi
     eb6: fc                           	cld
     eb7: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     eb9: 4c 8d 94 24 38 00 00 00      	leaq	0x38(%rsp), %r10
     ec1: 4c 89 d7                     	movq	%r10, %rdi
     ec4: 4c 8d 94 24 50 00 00 00      	leaq	0x50(%rsp), %r10
     ecc: 4c 89 d6                     	movq	%r10, %rsi
     ecf: e8 34 fc ff ff               	callq	0xb08 <stdstrings.hasPrefix>
     ed4: 89 84 24 68 00 00 00         	movl	%eax, 0x68(%rsp)
     edb: b8 00 00 00 00               	movl	$0x0, %eax
     ee0: 89 84 24 6c 00 00 00         	movl	%eax, 0x6c(%rsp)
     ee7: 8b 84 24 68 00 00 00         	movl	0x68(%rsp), %eax
     eee: 8b 8c 24 6c 00 00 00         	movl	0x6c(%rsp), %ecx
     ef5: 39 c8                        	cmpl	%ecx, %eax
     ef7: 0f 85 2d 00 00 00            	jne	0xf2a <stdstrings.dropPrefix+0x126>
     efd: e9 00 00 00 00               	jmp	0xf02 <stdstrings.dropPrefix+0xfe>
     f02: 4c 8b 84 24 b0 00 00 00      	movq	0xb0(%rsp), %r8
     f0a: 48 8d b4 24 38 00 00 00      	leaq	0x38(%rsp), %rsi
     f12: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     f1c: 4c 89 c7                     	movq	%r8, %rdi
     f1f: fc                           	cld
     f20: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     f22: 4c 89 c0                     	movq	%r8, %rax
     f25: 48 89 ec                     	movq	%rbp, %rsp
     f28: 5d                           	popq	%rbp
     f29: c3                           	retq
     f2a: 48 8b 84 24 58 00 00 00      	movq	0x58(%rsp), %rax
     f32: 89 84 24 88 00 00 00         	movl	%eax, 0x88(%rsp)
     f39: 8b 84 24 88 00 00 00         	movl	0x88(%rsp), %eax
     f40: 89 84 24 8c 00 00 00         	movl	%eax, 0x8c(%rsp)
     f47: 48 8b 84 24 40 00 00 00      	movq	0x40(%rsp), %rax
     f4f: 89 84 24 88 00 00 00         	movl	%eax, 0x88(%rsp)
     f56: 8b 84 24 88 00 00 00         	movl	0x88(%rsp), %eax
     f5d: 89 84 24 90 00 00 00         	movl	%eax, 0x90(%rsp)
     f64: 8b 84 24 90 00 00 00         	movl	0x90(%rsp), %eax
     f6b: 8b 8c 24 8c 00 00 00         	movl	0x8c(%rsp), %ecx
     f72: 29 c8                        	subl	%ecx, %eax
     f74: 89 84 24 88 00 00 00         	movl	%eax, 0x88(%rsp)
     f7b: 4c 8d 94 24 38 00 00 00      	leaq	0x38(%rsp), %r10
     f83: 4c 89 d6                     	movq	%r10, %rsi
     f86: 44 8b 94 24 8c 00 00 00      	movl	0x8c(%rsp), %r10d
     f8e: 44 89 d2                     	movl	%r10d, %edx
     f91: 44 8b 94 24 88 00 00 00      	movl	0x88(%rsp), %r10d
     f99: 44 89 d1                     	movl	%r10d, %ecx
     f9c: 48 8d bc 24 98 00 00 00      	leaq	0x98(%rsp), %rdi
     fa4: e8 2f f5 ff ff               	callq	0x4d8 <system.StrSubView>
     fa9: 48 8d b4 24 98 00 00 00      	leaq	0x98(%rsp), %rsi
     fb1: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     fbb: 48 8d bc 24 70 00 00 00      	leaq	0x70(%rsp), %rdi
     fc3: fc                           	cld
     fc4: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     fc6: 4c 8b 84 24 b0 00 00 00      	movq	0xb0(%rsp), %r8
     fce: 48 8d b4 24 70 00 00 00      	leaq	0x70(%rsp), %rsi
     fd6: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
     fe0: 4c 89 c7                     	movq	%r8, %rdi
     fe3: fc                           	cld
     fe4: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
     fe6: 4c 89 c0                     	movq	%r8, %rax
     fe9: 48 89 ec                     	movq	%rbp, %rsp
     fec: 5d                           	popq	%rbp
     fed: c3                           	retq
     fee: 90                           	nop
     fef: 90                           	nop

0000000000000ff0 <stdstrings.__cheng_slice_string>:
     ff0: 55                           	pushq	%rbp
     ff1: 48 89 e5                     	movq	%rsp, %rbp
     ff4: 48 81 ec c0 00 00 00         	subq	$0xc0, %rsp
     ffb: 48 89 bc 24 80 00 00 00      	movq	%rdi, 0x80(%rsp)
    1003: 48 89 b4 24 88 00 00 00      	movq	%rsi, 0x88(%rsp)
    100b: 48 89 94 24 90 00 00 00      	movq	%rdx, 0x90(%rsp)
    1013: 48 89 8c 24 98 00 00 00      	movq	%rcx, 0x98(%rsp)
    101b: 4c 89 84 24 a0 00 00 00      	movq	%r8, 0xa0(%rsp)
    1023: 4c 89 8c 24 a8 00 00 00      	movq	%r9, 0xa8(%rsp)
    102b: 4c 8b 94 24 88 00 00 00      	movq	0x88(%rsp), %r10
    1033: 48 8d bc 24 08 00 00 00      	leaq	0x8(%rsp), %rdi
    103b: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1045: 4c 89 d6                     	movq	%r10, %rsi
    1048: fc                           	cld
    1049: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    104b: 44 8b 94 24 90 00 00 00      	movl	0x90(%rsp), %r10d
    1053: 44 89 94 24 20 00 00 00      	movl	%r10d, 0x20(%rsp)
    105b: 44 8b 94 24 98 00 00 00      	movl	0x98(%rsp), %r10d
    1063: 44 89 94 24 24 00 00 00      	movl	%r10d, 0x24(%rsp)
    106b: 44 8b 94 24 a0 00 00 00      	movl	0xa0(%rsp), %r10d
    1073: 44 89 94 24 28 00 00 00      	movl	%r10d, 0x28(%rsp)
    107b: 48 8d b4 24 08 00 00 00      	leaq	0x8(%rsp), %rsi
    1083: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    108d: 48 8d bc 24 30 00 00 00      	leaq	0x30(%rsp), %rdi
    1095: fc                           	cld
    1096: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1098: b8 00 00 00 00               	movl	$0x0, %eax
    109d: 89 84 24 48 00 00 00         	movl	%eax, 0x48(%rsp)
    10a4: 8b 84 24 28 00 00 00         	movl	0x28(%rsp), %eax
    10ab: 8b 8c 24 48 00 00 00         	movl	0x48(%rsp), %ecx
    10b2: 39 c8                        	cmpl	%ecx, %eax
    10b4: 0f 85 05 00 00 00            	jne	0x10bf <stdstrings.__cheng_slice_string+0xcf>
    10ba: e9 2a 00 00 00               	jmp	0x10e9 <stdstrings.__cheng_slice_string+0xf9>
    10bf: 8b 84 24 24 00 00 00         	movl	0x24(%rsp), %eax
    10c6: 8b 8c 24 20 00 00 00         	movl	0x20(%rsp), %ecx
    10cd: 29 c8                        	subl	%ecx, %eax
    10cf: 89 84 24 68 00 00 00         	movl	%eax, 0x68(%rsp)
    10d6: 8b 84 24 68 00 00 00         	movl	0x68(%rsp), %eax
    10dd: 89 84 24 4c 00 00 00         	movl	%eax, 0x4c(%rsp)
    10e4: e9 4d 00 00 00               	jmp	0x1136 <stdstrings.__cheng_slice_string+0x146>
    10e9: 8b 84 24 24 00 00 00         	movl	0x24(%rsp), %eax
    10f0: 8b 8c 24 20 00 00 00         	movl	0x20(%rsp), %ecx
    10f7: 29 c8                        	subl	%ecx, %eax
    10f9: 89 84 24 68 00 00 00         	movl	%eax, 0x68(%rsp)
    1100: b8 01 00 00 00               	movl	$0x1, %eax
    1105: 89 84 24 6c 00 00 00         	movl	%eax, 0x6c(%rsp)
    110c: 8b 84 24 68 00 00 00         	movl	0x68(%rsp), %eax
    1113: 8b 8c 24 6c 00 00 00         	movl	0x6c(%rsp), %ecx
    111a: 01 c8                        	addl	%ecx, %eax
    111c: 89 84 24 70 00 00 00         	movl	%eax, 0x70(%rsp)
    1123: 8b 84 24 70 00 00 00         	movl	0x70(%rsp), %eax
    112a: 89 84 24 4c 00 00 00         	movl	%eax, 0x4c(%rsp)
    1131: e9 00 00 00 00               	jmp	0x1136 <stdstrings.__cheng_slice_string+0x146>
    1136: 8b 84 24 4c 00 00 00         	movl	0x4c(%rsp), %eax
    113d: 89 84 24 68 00 00 00         	movl	%eax, 0x68(%rsp)
    1144: 4c 8d 94 24 30 00 00 00      	leaq	0x30(%rsp), %r10
    114c: 4c 89 d6                     	movq	%r10, %rsi
    114f: 44 8b 94 24 20 00 00 00      	movl	0x20(%rsp), %r10d
    1157: 44 89 d2                     	movl	%r10d, %edx
    115a: 44 8b 94 24 68 00 00 00      	movl	0x68(%rsp), %r10d
    1162: 44 89 d1                     	movl	%r10d, %ecx
    1165: 48 8d bc 24 50 00 00 00      	leaq	0x50(%rsp), %rdi
    116d: e8 66 f3 ff ff               	callq	0x4d8 <system.StrSubView>
    1172: 4c 8b 84 24 80 00 00 00      	movq	0x80(%rsp), %r8
    117a: 48 8d b4 24 50 00 00 00      	leaq	0x50(%rsp), %rsi
    1182: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    118c: 4c 89 c7                     	movq	%r8, %rdi
    118f: fc                           	cld
    1190: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1192: 4c 89 c0                     	movq	%r8, %rax
    1195: 48 89 ec                     	movq	%rbp, %rsp
    1198: 5d                           	popq	%rbp
    1199: c3                           	retq
    119a: 90                           	nop
    119b: 90                           	nop

000000000000119c <stdstrings.sliceBytes>:
    119c: 55                           	pushq	%rbp
    119d: 48 89 e5                     	movq	%rsp, %rbp
    11a0: 48 81 ec a0 00 00 00         	subq	$0xa0, %rsp
    11a7: 48 89 bc 24 60 00 00 00      	movq	%rdi, 0x60(%rsp)
    11af: 48 89 b4 24 68 00 00 00      	movq	%rsi, 0x68(%rsp)
    11b7: 48 89 94 24 70 00 00 00      	movq	%rdx, 0x70(%rsp)
    11bf: 48 89 8c 24 78 00 00 00      	movq	%rcx, 0x78(%rsp)
    11c7: 4c 89 84 24 80 00 00 00      	movq	%r8, 0x80(%rsp)
    11cf: 4c 89 8c 24 88 00 00 00      	movq	%r9, 0x88(%rsp)
    11d7: 4c 8b 94 24 68 00 00 00      	movq	0x68(%rsp), %r10
    11df: 48 8d bc 24 08 00 00 00      	leaq	0x8(%rsp), %rdi
    11e7: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    11f1: 4c 89 d6                     	movq	%r10, %rsi
    11f4: fc                           	cld
    11f5: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    11f7: 44 8b 94 24 70 00 00 00      	movl	0x70(%rsp), %r10d
    11ff: 44 89 94 24 20 00 00 00      	movl	%r10d, 0x20(%rsp)
    1207: 44 8b 94 24 78 00 00 00      	movl	0x78(%rsp), %r10d
    120f: 44 89 94 24 24 00 00 00      	movl	%r10d, 0x24(%rsp)
    1217: 48 8d b4 24 08 00 00 00      	leaq	0x8(%rsp), %rsi
    121f: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1229: 48 8d bc 24 28 00 00 00      	leaq	0x28(%rsp), %rdi
    1231: fc                           	cld
    1232: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1234: 4c 8d 94 24 28 00 00 00      	leaq	0x28(%rsp), %r10
    123c: 4c 89 d6                     	movq	%r10, %rsi
    123f: 44 8b 94 24 20 00 00 00      	movl	0x20(%rsp), %r10d
    1247: 44 89 d2                     	movl	%r10d, %edx
    124a: 44 8b 94 24 24 00 00 00      	movl	0x24(%rsp), %r10d
    1252: 44 89 d1                     	movl	%r10d, %ecx
    1255: 48 8d bc 24 40 00 00 00      	leaq	0x40(%rsp), %rdi
    125d: e8 76 f2 ff ff               	callq	0x4d8 <system.StrSubView>
    1262: 4c 8b 84 24 60 00 00 00      	movq	0x60(%rsp), %r8
    126a: 48 8d b4 24 40 00 00 00      	leaq	0x40(%rsp), %rsi
    1272: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    127c: 4c 89 c7                     	movq	%r8, %rdi
    127f: fc                           	cld
    1280: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1282: 4c 89 c0                     	movq	%r8, %rax
    1285: 48 89 ec                     	movq	%rbp, %rsp
    1288: 5d                           	popq	%rbp
    1289: c3                           	retq
    128a: 90                           	nop
    128b: 90                           	nop

000000000000128c <stdstrings.DropPrefix>:
    128c: 55                           	pushq	%rbp
    128d: 48 89 e5                     	movq	%rsp, %rbp
    1290: 48 81 ec e0 00 00 00         	subq	$0xe0, %rsp
    1297: 48 89 bc 24 a0 00 00 00      	movq	%rdi, 0xa0(%rsp)
    129f: 48 89 b4 24 a8 00 00 00      	movq	%rsi, 0xa8(%rsp)
    12a7: 48 89 94 24 b0 00 00 00      	movq	%rdx, 0xb0(%rsp)
    12af: 48 89 8c 24 b8 00 00 00      	movq	%rcx, 0xb8(%rsp)
    12b7: 4c 89 84 24 c0 00 00 00      	movq	%r8, 0xc0(%rsp)
    12bf: 4c 89 8c 24 c8 00 00 00      	movq	%r9, 0xc8(%rsp)
    12c7: 4c 8b 94 24 a8 00 00 00      	movq	0xa8(%rsp), %r10
    12cf: 48 8d bc 24 08 00 00 00      	leaq	0x8(%rsp), %rdi
    12d7: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    12e1: 4c 89 d6                     	movq	%r10, %rsi
    12e4: fc                           	cld
    12e5: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    12e7: 4c 8b 94 24 b0 00 00 00      	movq	0xb0(%rsp), %r10
    12ef: 48 8d bc 24 20 00 00 00      	leaq	0x20(%rsp), %rdi
    12f7: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1301: 4c 89 d6                     	movq	%r10, %rsi
    1304: fc                           	cld
    1305: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1307: 48 8d b4 24 08 00 00 00      	leaq	0x8(%rsp), %rsi
    130f: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1319: 48 8d bc 24 38 00 00 00      	leaq	0x38(%rsp), %rdi
    1321: fc                           	cld
    1322: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1324: 48 8d b4 24 20 00 00 00      	leaq	0x20(%rsp), %rsi
    132c: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1336: 48 8d bc 24 50 00 00 00      	leaq	0x50(%rsp), %rdi
    133e: fc                           	cld
    133f: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1341: 4c 8d 94 24 38 00 00 00      	leaq	0x38(%rsp), %r10
    1349: 4c 89 d6                     	movq	%r10, %rsi
    134c: 4c 8d 94 24 50 00 00 00      	leaq	0x50(%rsp), %r10
    1354: 4c 89 d2                     	movq	%r10, %rdx
    1357: 48 8d bc 24 80 00 00 00      	leaq	0x80(%rsp), %rdi
    135f: e8 a0 fa ff ff               	callq	0xe04 <stdstrings.dropPrefix>
    1364: 48 8d b4 24 80 00 00 00      	leaq	0x80(%rsp), %rsi
    136c: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1376: 48 8d bc 24 68 00 00 00      	leaq	0x68(%rsp), %rdi
    137e: fc                           	cld
    137f: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1381: 4c 8b 84 24 a0 00 00 00      	movq	0xa0(%rsp), %r8
    1389: 48 8d b4 24 68 00 00 00      	leaq	0x68(%rsp), %rsi
    1391: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    139b: 4c 89 c7                     	movq	%r8, %rdi
    139e: fc                           	cld
    139f: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    13a1: 4c 89 c0                     	movq	%r8, %rax
    13a4: 48 89 ec                     	movq	%rbp, %rsp
    13a7: 5d                           	popq	%rbp
    13a8: c3                           	retq
    13a9: 90                           	nop
    13aa: 90                           	nop
    13ab: 90                           	nop

00000000000013ac <stdstrings.SliceBytes>:
    13ac: 55                           	pushq	%rbp
    13ad: 48 89 e5                     	movq	%rsp, %rbp
    13b0: 48 81 ec a0 00 00 00         	subq	$0xa0, %rsp
    13b7: 48 89 bc 24 60 00 00 00      	movq	%rdi, 0x60(%rsp)
    13bf: 48 89 b4 24 68 00 00 00      	movq	%rsi, 0x68(%rsp)
    13c7: 48 89 94 24 70 00 00 00      	movq	%rdx, 0x70(%rsp)
    13cf: 48 89 8c 24 78 00 00 00      	movq	%rcx, 0x78(%rsp)
    13d7: 4c 89 84 24 80 00 00 00      	movq	%r8, 0x80(%rsp)
    13df: 4c 89 8c 24 88 00 00 00      	movq	%r9, 0x88(%rsp)
    13e7: 4c 8b 94 24 68 00 00 00      	movq	0x68(%rsp), %r10
    13ef: 48 8d bc 24 08 00 00 00      	leaq	0x8(%rsp), %rdi
    13f7: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1401: 4c 89 d6                     	movq	%r10, %rsi
    1404: fc                           	cld
    1405: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1407: 44 8b 94 24 70 00 00 00      	movl	0x70(%rsp), %r10d
    140f: 44 89 94 24 20 00 00 00      	movl	%r10d, 0x20(%rsp)
    1417: 44 8b 94 24 78 00 00 00      	movl	0x78(%rsp), %r10d
    141f: 44 89 94 24 24 00 00 00      	movl	%r10d, 0x24(%rsp)
    1427: 48 8d b4 24 08 00 00 00      	leaq	0x8(%rsp), %rsi
    142f: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1439: 48 8d bc 24 28 00 00 00      	leaq	0x28(%rsp), %rdi
    1441: fc                           	cld
    1442: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1444: 48 8b 8c 24 28 00 00 00      	movq	0x28(%rsp), %rcx
    144c: 8b 94 24 30 00 00 00         	movl	0x30(%rsp), %edx
    1453: 44 8b 84 24 20 00 00 00      	movl	0x20(%rsp), %r8d
    145b: 44 8b 8c 24 24 00 00 00      	movl	0x24(%rsp), %r9d
    1463: 49 63 c0                     	movslq	%r8d, %rax
    1466: 48 01 c1                     	addq	%rax, %rcx
    1469: 48 89 8c 24 40 00 00 00      	movq	%rcx, 0x40(%rsp)
    1471: 44 89 8c 24 48 00 00 00      	movl	%r9d, 0x48(%rsp)
    1479: 4c 8b 84 24 60 00 00 00      	movq	0x60(%rsp), %r8
    1481: 48 8d b4 24 40 00 00 00      	leaq	0x40(%rsp), %rsi
    1489: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1493: 4c 89 c7                     	movq	%r8, %rdi
    1496: fc                           	cld
    1497: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1499: 4c 89 c0                     	movq	%r8, %rax
    149c: 48 89 ec                     	movq	%rbp, %rsp
    149f: 5d                           	popq	%rbp
    14a0: c3                           	retq
    14a1: 90                           	nop
    14a2: 90                           	nop
    14a3: 90                           	nop

00000000000014a4 <rawbytes.BytesFromString>:
    14a4: 55                           	pushq	%rbp
    14a5: 48 89 e5                     	movq	%rsp, %rbp
    14a8: 48 81 ec b0 00 00 00         	subq	$0xb0, %rsp
    14af: 48 89 bc 24 70 00 00 00      	movq	%rdi, 0x70(%rsp)
    14b7: 48 89 b4 24 78 00 00 00      	movq	%rsi, 0x78(%rsp)
    14bf: 48 89 94 24 80 00 00 00      	movq	%rdx, 0x80(%rsp)
    14c7: 48 89 8c 24 88 00 00 00      	movq	%rcx, 0x88(%rsp)
    14cf: 4c 89 84 24 90 00 00 00      	movq	%r8, 0x90(%rsp)
    14d7: 4c 89 8c 24 98 00 00 00      	movq	%r9, 0x98(%rsp)
    14df: 4c 8b 94 24 78 00 00 00      	movq	0x78(%rsp), %r10
    14e7: 48 8d bc 24 08 00 00 00      	leaq	0x8(%rsp), %rdi
    14ef: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    14f9: 4c 89 d6                     	movq	%r10, %rsi
    14fc: fc                           	cld
    14fd: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    14ff: 48 8d b4 24 08 00 00 00      	leaq	0x8(%rsp), %rsi
    1507: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1511: 48 8d bc 24 20 00 00 00      	leaq	0x20(%rsp), %rdi
    1519: fc                           	cld
    151a: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    151c: 48 b8 00 00 00 00 00 00 00 00	movabsq	$0x0, %rax
    1526: 48 89 84 24 50 00 00 00      	movq	%rax, 0x50(%rsp)
    152e: b8 00 00 00 00               	movl	$0x0, %eax
    1533: 89 84 24 48 00 00 00         	movl	%eax, 0x48(%rsp)
    153a: 48 b8 00 00 00 00 00 00 00 00	movabsq	$0x0, %rax
    1544: 48 89 84 24 58 00 00 00      	movq	%rax, 0x58(%rsp)
    154c: 48 b8 00 00 00 00 00 00 00 00	movabsq	$0x0, %rax
    1556: 48 89 84 24 60 00 00 00      	movq	%rax, 0x60(%rsp)
    155e: 48 8d b4 24 50 00 00 00      	leaq	0x50(%rsp), %rsi
    1566: 48 b9 08 00 00 00 00 00 00 00	movabsq	$0x8, %rcx
    1570: 48 8d bc 24 58 00 00 00      	leaq	0x58(%rsp), %rdi
    1578: fc                           	cld
    1579: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    157b: 48 8d b4 24 48 00 00 00      	leaq	0x48(%rsp), %rsi
    1583: 48 b9 04 00 00 00 00 00 00 00	movabsq	$0x4, %rcx
    158d: 48 8d bc 24 60 00 00 00      	leaq	0x60(%rsp), %rdi
    1595: fc                           	cld
    1596: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1598: 48 8d b4 24 58 00 00 00      	leaq	0x58(%rsp), %rsi
    15a0: 48 b9 10 00 00 00 00 00 00 00	movabsq	$0x10, %rcx
    15aa: 48 8d bc 24 38 00 00 00      	leaq	0x38(%rsp), %rdi
    15b2: fc                           	cld
    15b3: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    15b5: 48 8b 84 24 28 00 00 00      	movq	0x28(%rsp), %rax
    15bd: 89 84 24 48 00 00 00         	movl	%eax, 0x48(%rsp)
    15c4: 8b 84 24 48 00 00 00         	movl	0x48(%rsp), %eax
    15cb: 89 84 24 4c 00 00 00         	movl	%eax, 0x4c(%rsp)
    15d2: 48 8b 84 24 20 00 00 00      	movq	0x20(%rsp), %rax
    15da: 48 89 84 24 50 00 00 00      	movq	%rax, 0x50(%rsp)
    15e2: 48 8b 84 24 50 00 00 00      	movq	0x50(%rsp), %rax
    15ea: 48 89 84 24 38 00 00 00      	movq	%rax, 0x38(%rsp)
    15f2: 8b 84 24 4c 00 00 00         	movl	0x4c(%rsp), %eax
    15f9: 89 84 24 40 00 00 00         	movl	%eax, 0x40(%rsp)
    1600: 4c 8b 84 24 70 00 00 00      	movq	0x70(%rsp), %r8
    1608: 48 8d b4 24 38 00 00 00      	leaq	0x38(%rsp), %rsi
    1610: 48 b9 10 00 00 00 00 00 00 00	movabsq	$0x10, %rcx
    161a: 4c 89 c7                     	movq	%r8, %rdi
    161d: fc                           	cld
    161e: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1620: 4c 89 c0                     	movq	%r8, %rax
    1623: 48 89 ec                     	movq	%rbp, %rsp
    1626: 5d                           	popq	%rbp
    1627: c3                           	retq

0000000000001628 <rawbytes.BytesSliceView>:
    1628: 55                           	pushq	%rbp
    1629: 48 89 e5                     	movq	%rsp, %rbp
    162c: 48 81 ec e0 00 00 00         	subq	$0xe0, %rsp
    1633: 48 89 bc 24 a0 00 00 00      	movq	%rdi, 0xa0(%rsp)
    163b: 48 89 b4 24 a8 00 00 00      	movq	%rsi, 0xa8(%rsp)
    1643: 48 89 94 24 b0 00 00 00      	movq	%rdx, 0xb0(%rsp)
    164b: 48 89 8c 24 b8 00 00 00      	movq	%rcx, 0xb8(%rsp)
    1653: 4c 89 84 24 c0 00 00 00      	movq	%r8, 0xc0(%rsp)
    165b: 4c 89 8c 24 c8 00 00 00      	movq	%r9, 0xc8(%rsp)
    1663: 4c 8b 94 24 a8 00 00 00      	movq	0xa8(%rsp), %r10
    166b: 4c 89 94 24 08 00 00 00      	movq	%r10, 0x8(%rsp)
    1673: 4c 8b 94 24 b0 00 00 00      	movq	0xb0(%rsp), %r10
    167b: 4c 89 94 24 10 00 00 00      	movq	%r10, 0x10(%rsp)
    1683: 44 8b 94 24 b8 00 00 00      	movl	0xb8(%rsp), %r10d
    168b: 44 89 94 24 18 00 00 00      	movl	%r10d, 0x18(%rsp)
    1693: 44 8b 94 24 c0 00 00 00      	movl	0xc0(%rsp), %r10d
    169b: 44 89 94 24 1c 00 00 00      	movl	%r10d, 0x1c(%rsp)
    16a3: 48 8d b4 24 08 00 00 00      	leaq	0x8(%rsp), %rsi
    16ab: 48 b9 10 00 00 00 00 00 00 00	movabsq	$0x10, %rcx
    16b5: 48 8d bc 24 20 00 00 00      	leaq	0x20(%rsp), %rdi
    16bd: fc                           	cld
    16be: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    16c0: 48 b8 00 00 00 00 00 00 00 00	movabsq	$0x0, %rax
    16ca: 48 89 84 24 78 00 00 00      	movq	%rax, 0x78(%rsp)
    16d2: b8 00 00 00 00               	movl	$0x0, %eax
    16d7: 89 84 24 70 00 00 00         	movl	%eax, 0x70(%rsp)
    16de: 48 b8 00 00 00 00 00 00 00 00	movabsq	$0x0, %rax
    16e8: 48 89 84 24 88 00 00 00      	movq	%rax, 0x88(%rsp)
    16f0: 48 b8 00 00 00 00 00 00 00 00	movabsq	$0x0, %rax
    16fa: 48 89 84 24 90 00 00 00      	movq	%rax, 0x90(%rsp)
    1702: 48 8d b4 24 78 00 00 00      	leaq	0x78(%rsp), %rsi
    170a: 48 b9 08 00 00 00 00 00 00 00	movabsq	$0x8, %rcx
    1714: 48 8d bc 24 88 00 00 00      	leaq	0x88(%rsp), %rdi
    171c: fc                           	cld
    171d: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    171f: 48 8d b4 24 70 00 00 00      	leaq	0x70(%rsp), %rsi
    1727: 48 b9 04 00 00 00 00 00 00 00	movabsq	$0x4, %rcx
    1731: 48 8d bc 24 90 00 00 00      	leaq	0x90(%rsp), %rdi
    1739: fc                           	cld
    173a: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    173c: 48 8d b4 24 88 00 00 00      	leaq	0x88(%rsp), %rsi
    1744: 48 b9 10 00 00 00 00 00 00 00	movabsq	$0x10, %rcx
    174e: 48 8d bc 24 30 00 00 00      	leaq	0x30(%rsp), %rdi
    1756: fc                           	cld
    1757: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1759: 48 8b 84 24 20 00 00 00      	movq	0x20(%rsp), %rax
    1761: 48 89 84 24 78 00 00 00      	movq	%rax, 0x78(%rsp)
    1769: 48 8b 84 24 78 00 00 00      	movq	0x78(%rsp), %rax
    1771: 48 89 84 24 30 00 00 00      	movq	%rax, 0x30(%rsp)
    1779: b8 00 00 00 00               	movl	$0x0, %eax
    177e: 89 84 24 70 00 00 00         	movl	%eax, 0x70(%rsp)
    1785: 8b 84 24 70 00 00 00         	movl	0x70(%rsp), %eax
    178c: 89 84 24 38 00 00 00         	movl	%eax, 0x38(%rsp)
    1793: 8b 84 24 18 00 00 00         	movl	0x18(%rsp), %eax
    179a: 89 84 24 40 00 00 00         	movl	%eax, 0x40(%rsp)
    17a1: 8b 84 24 1c 00 00 00         	movl	0x1c(%rsp), %eax
    17a8: 89 84 24 44 00 00 00         	movl	%eax, 0x44(%rsp)
    17af: b8 00 00 00 00               	movl	$0x0, %eax
    17b4: 89 84 24 70 00 00 00         	movl	%eax, 0x70(%rsp)
    17bb: 8b 84 24 44 00 00 00         	movl	0x44(%rsp), %eax
    17c2: 8b 8c 24 70 00 00 00         	movl	0x70(%rsp), %ecx
    17c9: 39 c8                        	cmpl	%ecx, %eax
    17cb: 0f 9e c0                     	setle	%al
    17ce: 0f b6 c0                     	movzbl	%al, %eax
    17d1: 89 84 24 48 00 00 00         	movl	%eax, 0x48(%rsp)
    17d8: b8 00 00 00 00               	movl	$0x0, %eax
    17dd: 89 84 24 4c 00 00 00         	movl	%eax, 0x4c(%rsp)
    17e4: 8b 84 24 48 00 00 00         	movl	0x48(%rsp), %eax
    17eb: 8b 8c 24 4c 00 00 00         	movl	0x4c(%rsp), %ecx
    17f2: 39 c8                        	cmpl	%ecx, %eax
    17f4: 0f 85 05 00 00 00            	jne	0x17ff <rawbytes.BytesSliceView+0x1d7>
    17fa: e9 28 00 00 00               	jmp	0x1827 <rawbytes.BytesSliceView+0x1ff>
    17ff: 4c 8b 84 24 a0 00 00 00      	movq	0xa0(%rsp), %r8
    1807: 48 8d b4 24 30 00 00 00      	leaq	0x30(%rsp), %rsi
    180f: 48 b9 10 00 00 00 00 00 00 00	movabsq	$0x10, %rcx
    1819: 4c 89 c7                     	movq	%r8, %rdi
    181c: fc                           	cld
    181d: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    181f: 4c 89 c0                     	movq	%r8, %rax
    1822: 48 89 ec                     	movq	%rbp, %rsp
    1825: 5d                           	popq	%rbp
    1826: c3                           	retq
    1827: b8 00 00 00 00               	movl	$0x0, %eax
    182c: 89 84 24 70 00 00 00         	movl	%eax, 0x70(%rsp)
    1833: 8b 84 24 40 00 00 00         	movl	0x40(%rsp), %eax
    183a: 8b 8c 24 70 00 00 00         	movl	0x70(%rsp), %ecx
    1841: 39 c8                        	cmpl	%ecx, %eax
    1843: 0f 9c c0                     	setl	%al
    1846: 0f b6 c0                     	movzbl	%al, %eax
    1849: 89 84 24 50 00 00 00         	movl	%eax, 0x50(%rsp)
    1850: b8 00 00 00 00               	movl	$0x0, %eax
    1855: 89 84 24 54 00 00 00         	movl	%eax, 0x54(%rsp)
    185c: 8b 84 24 50 00 00 00         	movl	0x50(%rsp), %eax
    1863: 8b 8c 24 54 00 00 00         	movl	0x54(%rsp), %ecx
    186a: 39 c8                        	cmpl	%ecx, %eax
    186c: 0f 85 05 00 00 00            	jne	0x1877 <rawbytes.BytesSliceView+0x24f>
    1872: e9 28 00 00 00               	jmp	0x189f <rawbytes.BytesSliceView+0x277>
    1877: 4c 8b 84 24 a0 00 00 00      	movq	0xa0(%rsp), %r8
    187f: 48 8d b4 24 30 00 00 00      	leaq	0x30(%rsp), %rsi
    1887: 48 b9 10 00 00 00 00 00 00 00	movabsq	$0x10, %rcx
    1891: 4c 89 c7                     	movq	%r8, %rdi
    1894: fc                           	cld
    1895: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1897: 4c 89 c0                     	movq	%r8, %rax
    189a: 48 89 ec                     	movq	%rbp, %rsp
    189d: 5d                           	popq	%rbp
    189e: c3                           	retq
    189f: 8b 84 24 28 00 00 00         	movl	0x28(%rsp), %eax
    18a6: 89 84 24 70 00 00 00         	movl	%eax, 0x70(%rsp)
    18ad: 8b 84 24 40 00 00 00         	movl	0x40(%rsp), %eax
    18b4: 8b 8c 24 70 00 00 00         	movl	0x70(%rsp), %ecx
    18bb: 39 c8                        	cmpl	%ecx, %eax
    18bd: 0f 9d c0                     	setge	%al
    18c0: 0f b6 c0                     	movzbl	%al, %eax
    18c3: 89 84 24 58 00 00 00         	movl	%eax, 0x58(%rsp)
    18ca: b8 00 00 00 00               	movl	$0x0, %eax
    18cf: 89 84 24 5c 00 00 00         	movl	%eax, 0x5c(%rsp)
    18d6: 8b 84 24 58 00 00 00         	movl	0x58(%rsp), %eax
    18dd: 8b 8c 24 5c 00 00 00         	movl	0x5c(%rsp), %ecx
    18e4: 39 c8                        	cmpl	%ecx, %eax
    18e6: 0f 85 05 00 00 00            	jne	0x18f1 <rawbytes.BytesSliceView+0x2c9>
    18ec: e9 28 00 00 00               	jmp	0x1919 <rawbytes.BytesSliceView+0x2f1>
    18f1: 4c 8b 84 24 a0 00 00 00      	movq	0xa0(%rsp), %r8
    18f9: 48 8d b4 24 30 00 00 00      	leaq	0x30(%rsp), %rsi
    1901: 48 b9 10 00 00 00 00 00 00 00	movabsq	$0x10, %rcx
    190b: 4c 89 c7                     	movq	%r8, %rdi
    190e: fc                           	cld
    190f: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1911: 4c 89 c0                     	movq	%r8, %rax
    1914: 48 89 ec                     	movq	%rbp, %rsp
    1917: 5d                           	popq	%rbp
    1918: c3                           	retq
    1919: 8b 84 24 40 00 00 00         	movl	0x40(%rsp), %eax
    1920: 8b 8c 24 44 00 00 00         	movl	0x44(%rsp), %ecx
    1927: 01 c8                        	addl	%ecx, %eax
    1929: 89 84 24 70 00 00 00         	movl	%eax, 0x70(%rsp)
    1930: 8b 84 24 28 00 00 00         	movl	0x28(%rsp), %eax
    1937: 89 84 24 74 00 00 00         	movl	%eax, 0x74(%rsp)
    193e: 8b 84 24 70 00 00 00         	movl	0x70(%rsp), %eax
    1945: 8b 8c 24 74 00 00 00         	movl	0x74(%rsp), %ecx
    194c: 39 c8                        	cmpl	%ecx, %eax
    194e: 0f 9f c0                     	setg	%al
    1951: 0f b6 c0                     	movzbl	%al, %eax
    1954: 89 84 24 60 00 00 00         	movl	%eax, 0x60(%rsp)
    195b: b8 00 00 00 00               	movl	$0x0, %eax
    1960: 89 84 24 64 00 00 00         	movl	%eax, 0x64(%rsp)
    1967: 8b 84 24 60 00 00 00         	movl	0x60(%rsp), %eax
    196e: 8b 8c 24 64 00 00 00         	movl	0x64(%rsp), %ecx
    1975: 39 c8                        	cmpl	%ecx, %eax
    1977: 0f 85 05 00 00 00            	jne	0x1982 <rawbytes.BytesSliceView+0x35a>
    197d: e9 38 00 00 00               	jmp	0x19ba <rawbytes.BytesSliceView+0x392>
    1982: 8b 84 24 28 00 00 00         	movl	0x28(%rsp), %eax
    1989: 89 84 24 70 00 00 00         	movl	%eax, 0x70(%rsp)
    1990: 8b 84 24 70 00 00 00         	movl	0x70(%rsp), %eax
    1997: 8b 8c 24 40 00 00 00         	movl	0x40(%rsp), %ecx
    199e: 29 c8                        	subl	%ecx, %eax
    19a0: 89 84 24 74 00 00 00         	movl	%eax, 0x74(%rsp)
    19a7: 8b 84 24 74 00 00 00         	movl	0x74(%rsp), %eax
    19ae: 89 84 24 44 00 00 00         	movl	%eax, 0x44(%rsp)
    19b5: e9 05 00 00 00               	jmp	0x19bf <rawbytes.BytesSliceView+0x397>
    19ba: e9 00 00 00 00               	jmp	0x19bf <rawbytes.BytesSliceView+0x397>
    19bf: b8 00 00 00 00               	movl	$0x0, %eax
    19c4: 89 84 24 70 00 00 00         	movl	%eax, 0x70(%rsp)
    19cb: 8b 84 24 44 00 00 00         	movl	0x44(%rsp), %eax
    19d2: 8b 8c 24 70 00 00 00         	movl	0x70(%rsp), %ecx
    19d9: 39 c8                        	cmpl	%ecx, %eax
    19db: 0f 9e c0                     	setle	%al
    19de: 0f b6 c0                     	movzbl	%al, %eax
    19e1: 89 84 24 68 00 00 00         	movl	%eax, 0x68(%rsp)
    19e8: b8 00 00 00 00               	movl	$0x0, %eax
    19ed: 89 84 24 6c 00 00 00         	movl	%eax, 0x6c(%rsp)
    19f4: 8b 84 24 68 00 00 00         	movl	0x68(%rsp), %eax
    19fb: 8b 8c 24 6c 00 00 00         	movl	0x6c(%rsp), %ecx
    1a02: 39 c8                        	cmpl	%ecx, %eax
    1a04: 0f 85 05 00 00 00            	jne	0x1a0f <rawbytes.BytesSliceView+0x3e7>
    1a0a: e9 28 00 00 00               	jmp	0x1a37 <rawbytes.BytesSliceView+0x40f>
    1a0f: 4c 8b 84 24 a0 00 00 00      	movq	0xa0(%rsp), %r8
    1a17: 48 8d b4 24 30 00 00 00      	leaq	0x30(%rsp), %rsi
    1a1f: 48 b9 10 00 00 00 00 00 00 00	movabsq	$0x10, %rcx
    1a29: 4c 89 c7                     	movq	%r8, %rdi
    1a2c: fc                           	cld
    1a2d: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1a2f: 4c 89 c0                     	movq	%r8, %rax
    1a32: 48 89 ec                     	movq	%rbp, %rsp
    1a35: 5d                           	popq	%rbp
    1a36: c3                           	retq
    1a37: 48 8b 84 24 20 00 00 00      	movq	0x20(%rsp), %rax
    1a3f: 48 89 84 24 78 00 00 00      	movq	%rax, 0x78(%rsp)
    1a47: 48 8b 84 24 78 00 00 00      	movq	0x78(%rsp), %rax
    1a4f: 8b 8c 24 40 00 00 00         	movl	0x40(%rsp), %ecx
    1a56: 48 63 c9                     	movslq	%ecx, %rcx
    1a59: 48 01 c8                     	addq	%rcx, %rax
    1a5c: 48 89 84 24 80 00 00 00      	movq	%rax, 0x80(%rsp)
    1a64: 48 8b 84 24 80 00 00 00      	movq	0x80(%rsp), %rax
    1a6c: 48 89 84 24 30 00 00 00      	movq	%rax, 0x30(%rsp)
    1a74: 8b 84 24 44 00 00 00         	movl	0x44(%rsp), %eax
    1a7b: 89 84 24 38 00 00 00         	movl	%eax, 0x38(%rsp)
    1a82: 4c 8b 84 24 a0 00 00 00      	movq	0xa0(%rsp), %r8
    1a8a: 48 8d b4 24 30 00 00 00      	leaq	0x30(%rsp), %rsi
    1a92: 48 b9 10 00 00 00 00 00 00 00	movabsq	$0x10, %rcx
    1a9c: 4c 89 c7                     	movq	%r8, %rdi
    1a9f: fc                           	cld
    1aa0: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1aa2: 4c 89 c0                     	movq	%r8, %rax
    1aa5: 48 89 ec                     	movq	%rbp, %rsp
    1aa8: 5d                           	popq	%rbp
    1aa9: c3                           	retq
    1aaa: 90                           	nop
    1aab: 90                           	nop

0000000000001aac <strings.hasPrefix>:
    1aac: 55                           	pushq	%rbp
    1aad: 48 89 e5                     	movq	%rsp, %rbp
    1ab0: 48 81 ec e0 00 00 00         	subq	$0xe0, %rsp
    1ab7: 48 89 bc 24 a0 00 00 00      	movq	%rdi, 0xa0(%rsp)
    1abf: 48 89 b4 24 a8 00 00 00      	movq	%rsi, 0xa8(%rsp)
    1ac7: 48 89 94 24 b0 00 00 00      	movq	%rdx, 0xb0(%rsp)
    1acf: 48 89 8c 24 b8 00 00 00      	movq	%rcx, 0xb8(%rsp)
    1ad7: 4c 89 84 24 c0 00 00 00      	movq	%r8, 0xc0(%rsp)
    1adf: 4c 89 8c 24 c8 00 00 00      	movq	%r9, 0xc8(%rsp)
    1ae7: 4c 8b 94 24 a0 00 00 00      	movq	0xa0(%rsp), %r10
    1aef: 48 8d bc 24 00 00 00 00      	leaq	(%rsp), %rdi
    1af7: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1b01: 4c 89 d6                     	movq	%r10, %rsi
    1b04: fc                           	cld
    1b05: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1b07: 4c 8b 94 24 a8 00 00 00      	movq	0xa8(%rsp), %r10
    1b0f: 48 8d bc 24 18 00 00 00      	leaq	0x18(%rsp), %rdi
    1b17: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1b21: 4c 89 d6                     	movq	%r10, %rsi
    1b24: fc                           	cld
    1b25: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1b27: 48 8d b4 24 00 00 00 00      	leaq	(%rsp), %rsi
    1b2f: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1b39: 48 8d bc 24 30 00 00 00      	leaq	0x30(%rsp), %rdi
    1b41: fc                           	cld
    1b42: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1b44: 48 8d b4 24 18 00 00 00      	leaq	0x18(%rsp), %rsi
    1b4c: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1b56: 48 8d bc 24 48 00 00 00      	leaq	0x48(%rsp), %rdi
    1b5e: fc                           	cld
    1b5f: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1b61: 48 8b 84 24 38 00 00 00      	movq	0x38(%rsp), %rax
    1b69: 89 84 24 94 00 00 00         	movl	%eax, 0x94(%rsp)
    1b70: 8b 84 24 94 00 00 00         	movl	0x94(%rsp), %eax
    1b77: 89 84 24 60 00 00 00         	movl	%eax, 0x60(%rsp)
    1b7e: 48 8b 84 24 50 00 00 00      	movq	0x50(%rsp), %rax
    1b86: 89 84 24 94 00 00 00         	movl	%eax, 0x94(%rsp)
    1b8d: 8b 84 24 94 00 00 00         	movl	0x94(%rsp), %eax
    1b94: 89 84 24 64 00 00 00         	movl	%eax, 0x64(%rsp)
    1b9b: b8 00 00 00 00               	movl	$0x0, %eax
    1ba0: 89 84 24 94 00 00 00         	movl	%eax, 0x94(%rsp)
    1ba7: 8b 84 24 64 00 00 00         	movl	0x64(%rsp), %eax
    1bae: 8b 8c 24 94 00 00 00         	movl	0x94(%rsp), %ecx
    1bb5: 39 c8                        	cmpl	%ecx, %eax
    1bb7: 0f 94 c0                     	sete	%al
    1bba: 0f b6 c0                     	movzbl	%al, %eax
    1bbd: 89 84 24 68 00 00 00         	movl	%eax, 0x68(%rsp)
    1bc4: b8 00 00 00 00               	movl	$0x0, %eax
    1bc9: 89 84 24 6c 00 00 00         	movl	%eax, 0x6c(%rsp)
    1bd0: 8b 84 24 68 00 00 00         	movl	0x68(%rsp), %eax
    1bd7: 8b 8c 24 6c 00 00 00         	movl	0x6c(%rsp), %ecx
    1bde: 39 c8                        	cmpl	%ecx, %eax
    1be0: 0f 85 05 00 00 00            	jne	0x1beb <strings.hasPrefix+0x13f>
    1be6: e9 18 00 00 00               	jmp	0x1c03 <strings.hasPrefix+0x157>
    1beb: b8 01 00 00 00               	movl	$0x1, %eax
    1bf0: 89 84 24 70 00 00 00         	movl	%eax, 0x70(%rsp)
    1bf7: 8b 84 24 70 00 00 00         	movl	0x70(%rsp), %eax
    1bfe: 48 89 ec                     	movq	%rbp, %rsp
    1c01: 5d                           	popq	%rbp
    1c02: c3                           	retq
    1c03: 8b 84 24 64 00 00 00         	movl	0x64(%rsp), %eax
    1c0a: 8b 8c 24 60 00 00 00         	movl	0x60(%rsp), %ecx
    1c11: 39 c8                        	cmpl	%ecx, %eax
    1c13: 0f 9f c0                     	setg	%al
    1c16: 0f b6 c0                     	movzbl	%al, %eax
    1c19: 89 84 24 74 00 00 00         	movl	%eax, 0x74(%rsp)
    1c20: b8 00 00 00 00               	movl	$0x0, %eax
    1c25: 89 84 24 78 00 00 00         	movl	%eax, 0x78(%rsp)
    1c2c: 8b 84 24 74 00 00 00         	movl	0x74(%rsp), %eax
    1c33: 8b 8c 24 78 00 00 00         	movl	0x78(%rsp), %ecx
    1c3a: 39 c8                        	cmpl	%ecx, %eax
    1c3c: 0f 85 05 00 00 00            	jne	0x1c47 <strings.hasPrefix+0x19b>
    1c42: e9 18 00 00 00               	jmp	0x1c5f <strings.hasPrefix+0x1b3>
    1c47: b8 00 00 00 00               	movl	$0x0, %eax
    1c4c: 89 84 24 7c 00 00 00         	movl	%eax, 0x7c(%rsp)
    1c53: 8b 84 24 7c 00 00 00         	movl	0x7c(%rsp), %eax
    1c5a: 48 89 ec                     	movq	%rbp, %rsp
    1c5d: 5d                           	popq	%rbp
    1c5e: c3                           	retq
    1c5f: b8 00 00 00 00               	movl	$0x0, %eax
    1c64: 89 84 24 94 00 00 00         	movl	%eax, 0x94(%rsp)
    1c6b: 8b 84 24 94 00 00 00         	movl	0x94(%rsp), %eax
    1c72: 89 84 24 80 00 00 00         	movl	%eax, 0x80(%rsp)
    1c79: e9 00 00 00 00               	jmp	0x1c7e <strings.hasPrefix+0x1d2>
    1c7e: 8b 84 24 80 00 00 00         	movl	0x80(%rsp), %eax
    1c85: 8b 8c 24 64 00 00 00         	movl	0x64(%rsp), %ecx
    1c8c: 39 c8                        	cmpl	%ecx, %eax
    1c8e: 0f 8c 05 00 00 00            	jl	0x1c99 <strings.hasPrefix+0x1ed>
    1c94: e9 f7 00 00 00               	jmp	0x1d90 <strings.hasPrefix+0x2e4>
    1c99: 48 8b 8c 24 30 00 00 00      	movq	0x30(%rsp), %rcx
    1ca1: 8b 94 24 38 00 00 00         	movl	0x38(%rsp), %edx
    1ca8: 8b 9c 24 80 00 00 00         	movl	0x80(%rsp), %ebx
    1caf: 85 db                        	testl	%ebx, %ebx
    1cb1: 7d 01                        	jge	0x1cb4 <strings.hasPrefix+0x208>
    1cb3: cc                           	int3
    1cb4: 39 da                        	cmpl	%ebx, %edx
    1cb6: 7f 01                        	jg	0x1cb9 <strings.hasPrefix+0x20d>
    1cb8: cc                           	int3
    1cb9: 48 63 db                     	movslq	%ebx, %rbx
    1cbc: 48 01 d9                     	addq	%rbx, %rcx
    1cbf: 0f b6 01                     	movzbl	(%rcx), %eax
    1cc2: 89 84 24 94 00 00 00         	movl	%eax, 0x94(%rsp)
    1cc9: 48 8b 8c 24 48 00 00 00      	movq	0x48(%rsp), %rcx
    1cd1: 8b 94 24 50 00 00 00         	movl	0x50(%rsp), %edx
    1cd8: 8b 9c 24 80 00 00 00         	movl	0x80(%rsp), %ebx
    1cdf: 85 db                        	testl	%ebx, %ebx
    1ce1: 7d 01                        	jge	0x1ce4 <strings.hasPrefix+0x238>
    1ce3: cc                           	int3
    1ce4: 39 da                        	cmpl	%ebx, %edx
    1ce6: 7f 01                        	jg	0x1ce9 <strings.hasPrefix+0x23d>
    1ce8: cc                           	int3
    1ce9: 48 63 db                     	movslq	%ebx, %rbx
    1cec: 48 01 d9                     	addq	%rbx, %rcx
    1cef: 0f b6 01                     	movzbl	(%rcx), %eax
    1cf2: 89 84 24 98 00 00 00         	movl	%eax, 0x98(%rsp)
    1cf9: 8b 84 24 94 00 00 00         	movl	0x94(%rsp), %eax
    1d00: 8b 8c 24 98 00 00 00         	movl	0x98(%rsp), %ecx
    1d07: 39 c8                        	cmpl	%ecx, %eax
    1d09: 0f 95 c0                     	setne	%al
    1d0c: 0f b6 c0                     	movzbl	%al, %eax
    1d0f: 89 84 24 84 00 00 00         	movl	%eax, 0x84(%rsp)
    1d16: b8 00 00 00 00               	movl	$0x0, %eax
    1d1b: 89 84 24 88 00 00 00         	movl	%eax, 0x88(%rsp)
    1d22: 8b 84 24 84 00 00 00         	movl	0x84(%rsp), %eax
    1d29: 8b 8c 24 88 00 00 00         	movl	0x88(%rsp), %ecx
    1d30: 39 c8                        	cmpl	%ecx, %eax
    1d32: 0f 85 05 00 00 00            	jne	0x1d3d <strings.hasPrefix+0x291>
    1d38: e9 18 00 00 00               	jmp	0x1d55 <strings.hasPrefix+0x2a9>
    1d3d: b8 00 00 00 00               	movl	$0x0, %eax
    1d42: 89 84 24 8c 00 00 00         	movl	%eax, 0x8c(%rsp)
    1d49: 8b 84 24 8c 00 00 00         	movl	0x8c(%rsp), %eax
    1d50: 48 89 ec                     	movq	%rbp, %rsp
    1d53: 5d                           	popq	%rbp
    1d54: c3                           	retq
    1d55: e9 00 00 00 00               	jmp	0x1d5a <strings.hasPrefix+0x2ae>
    1d5a: b8 01 00 00 00               	movl	$0x1, %eax
    1d5f: 89 84 24 94 00 00 00         	movl	%eax, 0x94(%rsp)
    1d66: 8b 84 24 80 00 00 00         	movl	0x80(%rsp), %eax
    1d6d: 8b 8c 24 94 00 00 00         	movl	0x94(%rsp), %ecx
    1d74: 01 c8                        	addl	%ecx, %eax
    1d76: 89 84 24 98 00 00 00         	movl	%eax, 0x98(%rsp)
    1d7d: 8b 84 24 98 00 00 00         	movl	0x98(%rsp), %eax
    1d84: 89 84 24 80 00 00 00         	movl	%eax, 0x80(%rsp)
    1d8b: e9 ee fe ff ff               	jmp	0x1c7e <strings.hasPrefix+0x1d2>
    1d90: b8 01 00 00 00               	movl	$0x1, %eax
    1d95: 89 84 24 90 00 00 00         	movl	%eax, 0x90(%rsp)
    1d9c: 8b 84 24 90 00 00 00         	movl	0x90(%rsp), %eax
    1da3: 48 89 ec                     	movq	%rbp, %rsp
    1da6: 5d                           	popq	%rbp
    1da7: c3                           	retq

0000000000001da8 <strings.dropPrefix>:
    1da8: 55                           	pushq	%rbp
    1da9: 48 89 e5                     	movq	%rsp, %rbp
    1dac: 48 81 ec f0 00 00 00         	subq	$0xf0, %rsp
    1db3: 48 89 bc 24 b0 00 00 00      	movq	%rdi, 0xb0(%rsp)
    1dbb: 48 89 b4 24 b8 00 00 00      	movq	%rsi, 0xb8(%rsp)
    1dc3: 48 89 94 24 c0 00 00 00      	movq	%rdx, 0xc0(%rsp)
    1dcb: 48 89 8c 24 c8 00 00 00      	movq	%rcx, 0xc8(%rsp)
    1dd3: 4c 89 84 24 d0 00 00 00      	movq	%r8, 0xd0(%rsp)
    1ddb: 4c 89 8c 24 d8 00 00 00      	movq	%r9, 0xd8(%rsp)
    1de3: 4c 8b 94 24 b8 00 00 00      	movq	0xb8(%rsp), %r10
    1deb: 48 8d bc 24 08 00 00 00      	leaq	0x8(%rsp), %rdi
    1df3: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1dfd: 4c 89 d6                     	movq	%r10, %rsi
    1e00: fc                           	cld
    1e01: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1e03: 4c 8b 94 24 c0 00 00 00      	movq	0xc0(%rsp), %r10
    1e0b: 48 8d bc 24 20 00 00 00      	leaq	0x20(%rsp), %rdi
    1e13: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1e1d: 4c 89 d6                     	movq	%r10, %rsi
    1e20: fc                           	cld
    1e21: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1e23: 48 8d b4 24 08 00 00 00      	leaq	0x8(%rsp), %rsi
    1e2b: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1e35: 48 8d bc 24 38 00 00 00      	leaq	0x38(%rsp), %rdi
    1e3d: fc                           	cld
    1e3e: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1e40: 48 8d b4 24 20 00 00 00      	leaq	0x20(%rsp), %rsi
    1e48: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1e52: 48 8d bc 24 50 00 00 00      	leaq	0x50(%rsp), %rdi
    1e5a: fc                           	cld
    1e5b: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1e5d: 4c 8d 94 24 38 00 00 00      	leaq	0x38(%rsp), %r10
    1e65: 4c 89 d7                     	movq	%r10, %rdi
    1e68: 4c 8d 94 24 50 00 00 00      	leaq	0x50(%rsp), %r10
    1e70: 4c 89 d6                     	movq	%r10, %rsi
    1e73: e8 34 fc ff ff               	callq	0x1aac <strings.hasPrefix>
    1e78: 89 84 24 68 00 00 00         	movl	%eax, 0x68(%rsp)
    1e7f: b8 00 00 00 00               	movl	$0x0, %eax
    1e84: 89 84 24 6c 00 00 00         	movl	%eax, 0x6c(%rsp)
    1e8b: 8b 84 24 68 00 00 00         	movl	0x68(%rsp), %eax
    1e92: 8b 8c 24 6c 00 00 00         	movl	0x6c(%rsp), %ecx
    1e99: 39 c8                        	cmpl	%ecx, %eax
    1e9b: 0f 85 2d 00 00 00            	jne	0x1ece <strings.dropPrefix+0x126>
    1ea1: e9 00 00 00 00               	jmp	0x1ea6 <strings.dropPrefix+0xfe>
    1ea6: 4c 8b 84 24 b0 00 00 00      	movq	0xb0(%rsp), %r8
    1eae: 48 8d b4 24 38 00 00 00      	leaq	0x38(%rsp), %rsi
    1eb6: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1ec0: 4c 89 c7                     	movq	%r8, %rdi
    1ec3: fc                           	cld
    1ec4: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1ec6: 4c 89 c0                     	movq	%r8, %rax
    1ec9: 48 89 ec                     	movq	%rbp, %rsp
    1ecc: 5d                           	popq	%rbp
    1ecd: c3                           	retq
    1ece: 48 8b 84 24 58 00 00 00      	movq	0x58(%rsp), %rax
    1ed6: 89 84 24 88 00 00 00         	movl	%eax, 0x88(%rsp)
    1edd: 8b 84 24 88 00 00 00         	movl	0x88(%rsp), %eax
    1ee4: 89 84 24 8c 00 00 00         	movl	%eax, 0x8c(%rsp)
    1eeb: 48 8b 84 24 40 00 00 00      	movq	0x40(%rsp), %rax
    1ef3: 89 84 24 88 00 00 00         	movl	%eax, 0x88(%rsp)
    1efa: 8b 84 24 88 00 00 00         	movl	0x88(%rsp), %eax
    1f01: 89 84 24 90 00 00 00         	movl	%eax, 0x90(%rsp)
    1f08: 8b 84 24 90 00 00 00         	movl	0x90(%rsp), %eax
    1f0f: 8b 8c 24 8c 00 00 00         	movl	0x8c(%rsp), %ecx
    1f16: 29 c8                        	subl	%ecx, %eax
    1f18: 89 84 24 88 00 00 00         	movl	%eax, 0x88(%rsp)
    1f1f: 4c 8d 94 24 38 00 00 00      	leaq	0x38(%rsp), %r10
    1f27: 4c 89 d6                     	movq	%r10, %rsi
    1f2a: 44 8b 94 24 8c 00 00 00      	movl	0x8c(%rsp), %r10d
    1f32: 44 89 d2                     	movl	%r10d, %edx
    1f35: 44 8b 94 24 88 00 00 00      	movl	0x88(%rsp), %r10d
    1f3d: 44 89 d1                     	movl	%r10d, %ecx
    1f40: 48 8d bc 24 98 00 00 00      	leaq	0x98(%rsp), %rdi
    1f48: e8 8b e5 ff ff               	callq	0x4d8 <system.StrSubView>
    1f4d: 48 8d b4 24 98 00 00 00      	leaq	0x98(%rsp), %rsi
    1f55: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1f5f: 48 8d bc 24 70 00 00 00      	leaq	0x70(%rsp), %rdi
    1f67: fc                           	cld
    1f68: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1f6a: 4c 8b 84 24 b0 00 00 00      	movq	0xb0(%rsp), %r8
    1f72: 48 8d b4 24 70 00 00 00      	leaq	0x70(%rsp), %rsi
    1f7a: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1f84: 4c 89 c7                     	movq	%r8, %rdi
    1f87: fc                           	cld
    1f88: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1f8a: 4c 89 c0                     	movq	%r8, %rax
    1f8d: 48 89 ec                     	movq	%rbp, %rsp
    1f90: 5d                           	popq	%rbp
    1f91: c3                           	retq
    1f92: 90                           	nop
    1f93: 90                           	nop

0000000000001f94 <strings.__cheng_slice_string>:
    1f94: 55                           	pushq	%rbp
    1f95: 48 89 e5                     	movq	%rsp, %rbp
    1f98: 48 81 ec c0 00 00 00         	subq	$0xc0, %rsp
    1f9f: 48 89 bc 24 80 00 00 00      	movq	%rdi, 0x80(%rsp)
    1fa7: 48 89 b4 24 88 00 00 00      	movq	%rsi, 0x88(%rsp)
    1faf: 48 89 94 24 90 00 00 00      	movq	%rdx, 0x90(%rsp)
    1fb7: 48 89 8c 24 98 00 00 00      	movq	%rcx, 0x98(%rsp)
    1fbf: 4c 89 84 24 a0 00 00 00      	movq	%r8, 0xa0(%rsp)
    1fc7: 4c 89 8c 24 a8 00 00 00      	movq	%r9, 0xa8(%rsp)
    1fcf: 4c 8b 94 24 88 00 00 00      	movq	0x88(%rsp), %r10
    1fd7: 48 8d bc 24 08 00 00 00      	leaq	0x8(%rsp), %rdi
    1fdf: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    1fe9: 4c 89 d6                     	movq	%r10, %rsi
    1fec: fc                           	cld
    1fed: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    1fef: 44 8b 94 24 90 00 00 00      	movl	0x90(%rsp), %r10d
    1ff7: 44 89 94 24 20 00 00 00      	movl	%r10d, 0x20(%rsp)
    1fff: 44 8b 94 24 98 00 00 00      	movl	0x98(%rsp), %r10d
    2007: 44 89 94 24 24 00 00 00      	movl	%r10d, 0x24(%rsp)
    200f: 44 8b 94 24 a0 00 00 00      	movl	0xa0(%rsp), %r10d
    2017: 44 89 94 24 28 00 00 00      	movl	%r10d, 0x28(%rsp)
    201f: 48 8d b4 24 08 00 00 00      	leaq	0x8(%rsp), %rsi
    2027: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    2031: 48 8d bc 24 30 00 00 00      	leaq	0x30(%rsp), %rdi
    2039: fc                           	cld
    203a: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    203c: b8 00 00 00 00               	movl	$0x0, %eax
    2041: 89 84 24 48 00 00 00         	movl	%eax, 0x48(%rsp)
    2048: 8b 84 24 28 00 00 00         	movl	0x28(%rsp), %eax
    204f: 8b 8c 24 48 00 00 00         	movl	0x48(%rsp), %ecx
    2056: 39 c8                        	cmpl	%ecx, %eax
    2058: 0f 85 05 00 00 00            	jne	0x2063 <strings.__cheng_slice_string+0xcf>
    205e: e9 2a 00 00 00               	jmp	0x208d <strings.__cheng_slice_string+0xf9>
    2063: 8b 84 24 24 00 00 00         	movl	0x24(%rsp), %eax
    206a: 8b 8c 24 20 00 00 00         	movl	0x20(%rsp), %ecx
    2071: 29 c8                        	subl	%ecx, %eax
    2073: 89 84 24 68 00 00 00         	movl	%eax, 0x68(%rsp)
    207a: 8b 84 24 68 00 00 00         	movl	0x68(%rsp), %eax
    2081: 89 84 24 4c 00 00 00         	movl	%eax, 0x4c(%rsp)
    2088: e9 4d 00 00 00               	jmp	0x20da <strings.__cheng_slice_string+0x146>
    208d: 8b 84 24 24 00 00 00         	movl	0x24(%rsp), %eax
    2094: 8b 8c 24 20 00 00 00         	movl	0x20(%rsp), %ecx
    209b: 29 c8                        	subl	%ecx, %eax
    209d: 89 84 24 68 00 00 00         	movl	%eax, 0x68(%rsp)
    20a4: b8 01 00 00 00               	movl	$0x1, %eax
    20a9: 89 84 24 6c 00 00 00         	movl	%eax, 0x6c(%rsp)
    20b0: 8b 84 24 68 00 00 00         	movl	0x68(%rsp), %eax
    20b7: 8b 8c 24 6c 00 00 00         	movl	0x6c(%rsp), %ecx
    20be: 01 c8                        	addl	%ecx, %eax
    20c0: 89 84 24 70 00 00 00         	movl	%eax, 0x70(%rsp)
    20c7: 8b 84 24 70 00 00 00         	movl	0x70(%rsp), %eax
    20ce: 89 84 24 4c 00 00 00         	movl	%eax, 0x4c(%rsp)
    20d5: e9 00 00 00 00               	jmp	0x20da <strings.__cheng_slice_string+0x146>
    20da: 8b 84 24 4c 00 00 00         	movl	0x4c(%rsp), %eax
    20e1: 89 84 24 68 00 00 00         	movl	%eax, 0x68(%rsp)
    20e8: 4c 8d 94 24 30 00 00 00      	leaq	0x30(%rsp), %r10
    20f0: 4c 89 d6                     	movq	%r10, %rsi
    20f3: 44 8b 94 24 20 00 00 00      	movl	0x20(%rsp), %r10d
    20fb: 44 89 d2                     	movl	%r10d, %edx
    20fe: 44 8b 94 24 68 00 00 00      	movl	0x68(%rsp), %r10d
    2106: 44 89 d1                     	movl	%r10d, %ecx
    2109: 48 8d bc 24 50 00 00 00      	leaq	0x50(%rsp), %rdi
    2111: e8 c2 e3 ff ff               	callq	0x4d8 <system.StrSubView>
    2116: 4c 8b 84 24 80 00 00 00      	movq	0x80(%rsp), %r8
    211e: 48 8d b4 24 50 00 00 00      	leaq	0x50(%rsp), %rsi
    2126: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    2130: 4c 89 c7                     	movq	%r8, %rdi
    2133: fc                           	cld
    2134: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    2136: 4c 89 c0                     	movq	%r8, %rax
    2139: 48 89 ec                     	movq	%rbp, %rsp
    213c: 5d                           	popq	%rbp
    213d: c3                           	retq
    213e: 90                           	nop
    213f: 90                           	nop

0000000000002140 <strings.sliceBytes>:
    2140: 55                           	pushq	%rbp
    2141: 48 89 e5                     	movq	%rsp, %rbp
    2144: 48 81 ec a0 00 00 00         	subq	$0xa0, %rsp
    214b: 48 89 bc 24 60 00 00 00      	movq	%rdi, 0x60(%rsp)
    2153: 48 89 b4 24 68 00 00 00      	movq	%rsi, 0x68(%rsp)
    215b: 48 89 94 24 70 00 00 00      	movq	%rdx, 0x70(%rsp)
    2163: 48 89 8c 24 78 00 00 00      	movq	%rcx, 0x78(%rsp)
    216b: 4c 89 84 24 80 00 00 00      	movq	%r8, 0x80(%rsp)
    2173: 4c 89 8c 24 88 00 00 00      	movq	%r9, 0x88(%rsp)
    217b: 4c 8b 94 24 68 00 00 00      	movq	0x68(%rsp), %r10
    2183: 48 8d bc 24 08 00 00 00      	leaq	0x8(%rsp), %rdi
    218b: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    2195: 4c 89 d6                     	movq	%r10, %rsi
    2198: fc                           	cld
    2199: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    219b: 44 8b 94 24 70 00 00 00      	movl	0x70(%rsp), %r10d
    21a3: 44 89 94 24 20 00 00 00      	movl	%r10d, 0x20(%rsp)
    21ab: 44 8b 94 24 78 00 00 00      	movl	0x78(%rsp), %r10d
    21b3: 44 89 94 24 24 00 00 00      	movl	%r10d, 0x24(%rsp)
    21bb: 48 8d b4 24 08 00 00 00      	leaq	0x8(%rsp), %rsi
    21c3: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    21cd: 48 8d bc 24 28 00 00 00      	leaq	0x28(%rsp), %rdi
    21d5: fc                           	cld
    21d6: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    21d8: 4c 8d 94 24 28 00 00 00      	leaq	0x28(%rsp), %r10
    21e0: 4c 89 d6                     	movq	%r10, %rsi
    21e3: 44 8b 94 24 20 00 00 00      	movl	0x20(%rsp), %r10d
    21eb: 44 89 d2                     	movl	%r10d, %edx
    21ee: 44 8b 94 24 24 00 00 00      	movl	0x24(%rsp), %r10d
    21f6: 44 89 d1                     	movl	%r10d, %ecx
    21f9: 48 8d bc 24 40 00 00 00      	leaq	0x40(%rsp), %rdi
    2201: e8 d2 e2 ff ff               	callq	0x4d8 <system.StrSubView>
    2206: 4c 8b 84 24 60 00 00 00      	movq	0x60(%rsp), %r8
    220e: 48 8d b4 24 40 00 00 00      	leaq	0x40(%rsp), %rsi
    2216: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    2220: 4c 89 c7                     	movq	%r8, %rdi
    2223: fc                           	cld
    2224: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    2226: 4c 89 c0                     	movq	%r8, %rax
    2229: 48 89 ec                     	movq	%rbp, %rsp
    222c: 5d                           	popq	%rbp
    222d: c3                           	retq
    222e: 90                           	nop
    222f: 90                           	nop

0000000000002230 <strings.DropPrefix>:
    2230: 55                           	pushq	%rbp
    2231: 48 89 e5                     	movq	%rsp, %rbp
    2234: 48 81 ec e0 00 00 00         	subq	$0xe0, %rsp
    223b: 48 89 bc 24 a0 00 00 00      	movq	%rdi, 0xa0(%rsp)
    2243: 48 89 b4 24 a8 00 00 00      	movq	%rsi, 0xa8(%rsp)
    224b: 48 89 94 24 b0 00 00 00      	movq	%rdx, 0xb0(%rsp)
    2253: 48 89 8c 24 b8 00 00 00      	movq	%rcx, 0xb8(%rsp)
    225b: 4c 89 84 24 c0 00 00 00      	movq	%r8, 0xc0(%rsp)
    2263: 4c 89 8c 24 c8 00 00 00      	movq	%r9, 0xc8(%rsp)
    226b: 4c 8b 94 24 a8 00 00 00      	movq	0xa8(%rsp), %r10
    2273: 48 8d bc 24 08 00 00 00      	leaq	0x8(%rsp), %rdi
    227b: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    2285: 4c 89 d6                     	movq	%r10, %rsi
    2288: fc                           	cld
    2289: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    228b: 4c 8b 94 24 b0 00 00 00      	movq	0xb0(%rsp), %r10
    2293: 48 8d bc 24 20 00 00 00      	leaq	0x20(%rsp), %rdi
    229b: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    22a5: 4c 89 d6                     	movq	%r10, %rsi
    22a8: fc                           	cld
    22a9: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    22ab: 48 8d b4 24 08 00 00 00      	leaq	0x8(%rsp), %rsi
    22b3: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    22bd: 48 8d bc 24 38 00 00 00      	leaq	0x38(%rsp), %rdi
    22c5: fc                           	cld
    22c6: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    22c8: 48 8d b4 24 20 00 00 00      	leaq	0x20(%rsp), %rsi
    22d0: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    22da: 48 8d bc 24 50 00 00 00      	leaq	0x50(%rsp), %rdi
    22e2: fc                           	cld
    22e3: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    22e5: 4c 8d 94 24 38 00 00 00      	leaq	0x38(%rsp), %r10
    22ed: 4c 89 d6                     	movq	%r10, %rsi
    22f0: 4c 8d 94 24 50 00 00 00      	leaq	0x50(%rsp), %r10
    22f8: 4c 89 d2                     	movq	%r10, %rdx
    22fb: 48 8d bc 24 80 00 00 00      	leaq	0x80(%rsp), %rdi
    2303: e8 a0 fa ff ff               	callq	0x1da8 <strings.dropPrefix>
    2308: 48 8d b4 24 80 00 00 00      	leaq	0x80(%rsp), %rsi
    2310: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    231a: 48 8d bc 24 68 00 00 00      	leaq	0x68(%rsp), %rdi
    2322: fc                           	cld
    2323: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    2325: 4c 8b 84 24 a0 00 00 00      	movq	0xa0(%rsp), %r8
    232d: 48 8d b4 24 68 00 00 00      	leaq	0x68(%rsp), %rsi
    2335: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    233f: 4c 89 c7                     	movq	%r8, %rdi
    2342: fc                           	cld
    2343: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    2345: 4c 89 c0                     	movq	%r8, %rax
    2348: 48 89 ec                     	movq	%rbp, %rsp
    234b: 5d                           	popq	%rbp
    234c: c3                           	retq
    234d: 90                           	nop
    234e: 90                           	nop
    234f: 90                           	nop

0000000000002350 <strings.SliceBytes>:
    2350: 55                           	pushq	%rbp
    2351: 48 89 e5                     	movq	%rsp, %rbp
    2354: 48 81 ec a0 00 00 00         	subq	$0xa0, %rsp
    235b: 48 89 bc 24 60 00 00 00      	movq	%rdi, 0x60(%rsp)
    2363: 48 89 b4 24 68 00 00 00      	movq	%rsi, 0x68(%rsp)
    236b: 48 89 94 24 70 00 00 00      	movq	%rdx, 0x70(%rsp)
    2373: 48 89 8c 24 78 00 00 00      	movq	%rcx, 0x78(%rsp)
    237b: 4c 89 84 24 80 00 00 00      	movq	%r8, 0x80(%rsp)
    2383: 4c 89 8c 24 88 00 00 00      	movq	%r9, 0x88(%rsp)
    238b: 4c 8b 94 24 68 00 00 00      	movq	0x68(%rsp), %r10
    2393: 48 8d bc 24 08 00 00 00      	leaq	0x8(%rsp), %rdi
    239b: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    23a5: 4c 89 d6                     	movq	%r10, %rsi
    23a8: fc                           	cld
    23a9: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    23ab: 44 8b 94 24 70 00 00 00      	movl	0x70(%rsp), %r10d
    23b3: 44 89 94 24 20 00 00 00      	movl	%r10d, 0x20(%rsp)
    23bb: 44 8b 94 24 78 00 00 00      	movl	0x78(%rsp), %r10d
    23c3: 44 89 94 24 24 00 00 00      	movl	%r10d, 0x24(%rsp)
    23cb: 48 8d b4 24 08 00 00 00      	leaq	0x8(%rsp), %rsi
    23d3: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    23dd: 48 8d bc 24 28 00 00 00      	leaq	0x28(%rsp), %rdi
    23e5: fc                           	cld
    23e6: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    23e8: 48 8b 8c 24 28 00 00 00      	movq	0x28(%rsp), %rcx
    23f0: 8b 94 24 30 00 00 00         	movl	0x30(%rsp), %edx
    23f7: 44 8b 84 24 20 00 00 00      	movl	0x20(%rsp), %r8d
    23ff: 44 8b 8c 24 24 00 00 00      	movl	0x24(%rsp), %r9d
    2407: 49 63 c0                     	movslq	%r8d, %rax
    240a: 48 01 c1                     	addq	%rax, %rcx
    240d: 48 89 8c 24 40 00 00 00      	movq	%rcx, 0x40(%rsp)
    2415: 44 89 8c 24 48 00 00 00      	movl	%r9d, 0x48(%rsp)
    241d: 4c 8b 84 24 60 00 00 00      	movq	0x60(%rsp), %r8
    2425: 48 8d b4 24 40 00 00 00      	leaq	0x40(%rsp), %rsi
    242d: 48 b9 18 00 00 00 00 00 00 00	movabsq	$0x18, %rcx
    2437: 4c 89 c7                     	movq	%r8, %rdi
    243a: fc                           	cld
    243b: f3 a4                        	rep		movsb	(%rsi), %es:(%rdi)
    243d: 4c 89 c0                     	movq	%r8, %rax
    2440: 48 89 ec                     	movq	%rbp, %rsp
    2443: 5d                           	popq	%rbp
    2444: c3                           	retq
    2445: 90                           	nop
    2446: 90                           	nop
    2447: 90                           	nop

0000000000002448 <mkNegI>:
    2448: 55                           	pushq	%rbp
    2449: 48 89 e5                     	movq	%rsp, %rbp
    244c: 48 83 ec 70                  	subq	$0x70, %rsp
    2450: 48 89 bc 24 30 00 00 00      	movq	%rdi, 0x30(%rsp)
    2458: 48 89 b4 24 38 00 00 00      	movq	%rsi, 0x38(%rsp)
    2460: 48 89 94 24 40 00 00 00      	movq	%rdx, 0x40(%rsp)
    2468: 48 89 8c 24 48 00 00 00      	movq	%rcx, 0x48(%rsp)
    2470: 4c 89 84 24 50 00 00 00      	movq	%r8, 0x50(%rsp)
    2478: 4c 89 8c 24 58 00 00 00      	movq	%r9, 0x58(%rsp)
    2480: b8 00 00 00 00               	movl	$0x0, %eax
    2485: 89 84 24 08 00 00 00         	movl	%eax, 0x8(%rsp)
    248c: 48 b8 ff ff ff ff ff ff ff 7f	movabsq	$0x7fffffffffffffff, %rax # imm = 0x7FFFFFFFFFFFFFFF
    2496: 48 89 84 24 10 00 00 00      	movq	%rax, 0x10(%rsp)
    249e: 8b 84 24 08 00 00 00         	movl	0x8(%rsp), %eax
    24a5: 48 63 c0                     	movslq	%eax, %rax
    24a8: 48 89 84 24 18 00 00 00      	movq	%rax, 0x18(%rsp)
    24b0: 48 8b 84 24 18 00 00 00      	movq	0x18(%rsp), %rax
    24b8: 48 8b 8c 24 10 00 00 00      	movq	0x10(%rsp), %rcx
    24c0: 48 29 c8                     	subq	%rcx, %rax
    24c3: 48 89 84 24 20 00 00 00      	movq	%rax, 0x20(%rsp)
    24cb: b8 01 00 00 00               	movl	$0x1, %eax
    24d0: 89 84 24 08 00 00 00         	movl	%eax, 0x8(%rsp)
    24d7: 8b 84 24 08 00 00 00         	movl	0x8(%rsp), %eax
    24de: 48 63 c0                     	movslq	%eax, %rax
    24e1: 48 89 84 24 18 00 00 00      	movq	%rax, 0x18(%rsp)
    24e9: 48 8b 84 24 20 00 00 00      	movq	0x20(%rsp), %rax
    24f1: 48 8b 8c 24 18 00 00 00      	movq	0x18(%rsp), %rcx
    24f9: 48 29 c8                     	subq	%rcx, %rax
    24fc: 48 89 84 24 00 00 00 00      	movq	%rax, (%rsp)
    2504: 48 8b 84 24 00 00 00 00      	movq	(%rsp), %rax
    250c: 48 89 ec                     	movq	%rbp, %rsp
    250f: 5d                           	popq	%rbp
    2510: c3                           	retq
    2511: 90                           	nop
    2512: 90                           	nop
    2513: 90                           	nop

0000000000002514 <mkNegU>:
    2514: 55                           	pushq	%rbp
    2515: 48 89 e5                     	movq	%rsp, %rbp
    2518: 48 83 ec 50                  	subq	$0x50, %rsp
    251c: 48 89 bc 24 10 00 00 00      	movq	%rdi, 0x10(%rsp)
    2524: 48 89 b4 24 18 00 00 00      	movq	%rsi, 0x18(%rsp)
    252c: 48 89 94 24 20 00 00 00      	movq	%rdx, 0x20(%rsp)
    2534: 48 89 8c 24 28 00 00 00      	movq	%rcx, 0x28(%rsp)
    253c: 4c 89 84 24 30 00 00 00      	movq	%r8, 0x30(%rsp)
    2544: 4c 89 8c 24 38 00 00 00      	movq	%r9, 0x38(%rsp)
    254c: 48 b8 00 00 00 00 00 00 00 80	movabsq	$-0x8000000000000000, %rax # imm = 0x8000000000000000
    2556: 48 89 84 24 00 00 00 00      	movq	%rax, (%rsp)
    255e: 48 8b 84 24 00 00 00 00      	movq	(%rsp), %rax
    2566: 48 89 ec                     	movq	%rbp, %rsp
    2569: 5d                           	popq	%rbp
    256a: c3                           	retq
    256b: 90                           	nop

000000000000256c <expAsr8>:
    256c: 55                           	pushq	%rbp
    256d: 48 89 e5                     	movq	%rsp, %rbp
    2570: 48 83 ec 70                  	subq	$0x70, %rsp
    2574: 48 89 bc 24 30 00 00 00      	movq	%rdi, 0x30(%rsp)
    257c: 48 89 b4 24 38 00 00 00      	movq	%rsi, 0x38(%rsp)
    2584: 48 89 94 24 40 00 00 00      	movq	%rdx, 0x40(%rsp)
    258c: 48 89 8c 24 48 00 00 00      	movq	%rcx, 0x48(%rsp)
    2594: 4c 89 84 24 50 00 00 00      	movq	%r8, 0x50(%rsp)
    259c: 4c 89 8c 24 58 00 00 00      	movq	%r9, 0x58(%rsp)
    25a4: 48 b8 ff 00 00 00 00 00 00 00	movabsq	$0xff, %rax
    25ae: 48 89 84 24 10 00 00 00      	movq	%rax, 0x10(%rsp)
    25b6: b8 38 00 00 00               	movl	$0x38, %eax
    25bb: 89 84 24 08 00 00 00         	movl	%eax, 0x8(%rsp)
    25c2: 8b 84 24 08 00 00 00         	movl	0x8(%rsp), %eax
    25c9: 48 63 c0                     	movslq	%eax, %rax
    25cc: 48 89 84 24 18 00 00 00      	movq	%rax, 0x18(%rsp)
    25d4: 8b 8c 24 18 00 00 00         	movl	0x18(%rsp), %ecx
    25db: 89 c9                        	movl	%ecx, %ecx
    25dd: 48 8b 84 24 10 00 00 00      	movq	0x10(%rsp), %rax
    25e5: 48 d3 e0                     	shlq	%cl, %rax
    25e8: 48 89 84 24 20 00 00 00      	movq	%rax, 0x20(%rsp)
    25f0: 48 b8 80 00 00 00 00 00 00 00	movabsq	$0x80, %rax
    25fa: 48 89 84 24 18 00 00 00      	movq	%rax, 0x18(%rsp)
    2602: b8 30 00 00 00               	movl	$0x30, %eax
    2607: 89 84 24 08 00 00 00         	movl	%eax, 0x8(%rsp)
    260e: 8b 84 24 08 00 00 00         	movl	0x8(%rsp), %eax
    2615: 48 63 c0                     	movslq	%eax, %rax
    2618: 48 89 84 24 10 00 00 00      	movq	%rax, 0x10(%rsp)
    2620: 8b 8c 24 10 00 00 00         	movl	0x10(%rsp), %ecx
    2627: 89 c9                        	movl	%ecx, %ecx
    2629: 48 8b 84 24 18 00 00 00      	movq	0x18(%rsp), %rax
    2631: 48 d3 e0                     	shlq	%cl, %rax
    2634: 48 89 84 24 28 00 00 00      	movq	%rax, 0x28(%rsp)
    263c: 48 8b 84 24 20 00 00 00      	movq	0x20(%rsp), %rax
    2644: 48 8b 8c 24 28 00 00 00      	movq	0x28(%rsp), %rcx
    264c: 48 09 c8                     	orq	%rcx, %rax
    264f: 48 89 84 24 00 00 00 00      	movq	%rax, (%rsp)
    2657: 48 8b 84 24 00 00 00 00      	movq	(%rsp), %rax
    265f: 48 89 ec                     	movq	%rbp, %rsp
    2662: 5d                           	popq	%rbp
    2663: c3                           	retq

0000000000002664 <expLsr8>:
    2664: 55                           	pushq	%rbp
    2665: 48 89 e5                     	movq	%rsp, %rbp
    2668: 48 83 ec 60                  	subq	$0x60, %rsp
    266c: 48 89 bc 24 20 00 00 00      	movq	%rdi, 0x20(%rsp)
    2674: 48 89 b4 24 28 00 00 00      	movq	%rsi, 0x28(%rsp)
    267c: 48 89 94 24 30 00 00 00      	movq	%rdx, 0x30(%rsp)
    2684: 48 89 8c 24 38 00 00 00      	movq	%rcx, 0x38(%rsp)
    268c: 4c 89 84 24 40 00 00 00      	movq	%r8, 0x40(%rsp)
    2694: 4c 89 8c 24 48 00 00 00      	movq	%r9, 0x48(%rsp)
    269c: 48 b8 80 00 00 00 00 00 00 00	movabsq	$0x80, %rax
    26a6: 48 89 84 24 10 00 00 00      	movq	%rax, 0x10(%rsp)
    26ae: b8 30 00 00 00               	movl	$0x30, %eax
    26b3: 89 84 24 08 00 00 00         	movl	%eax, 0x8(%rsp)
    26ba: 8b 84 24 08 00 00 00         	movl	0x8(%rsp), %eax
    26c1: 48 63 c0                     	movslq	%eax, %rax
    26c4: 48 89 84 24 18 00 00 00      	movq	%rax, 0x18(%rsp)
    26cc: 8b 8c 24 18 00 00 00         	movl	0x18(%rsp), %ecx
    26d3: 89 c9                        	movl	%ecx, %ecx
    26d5: 48 8b 84 24 10 00 00 00      	movq	0x10(%rsp), %rax
    26dd: 48 d3 e0                     	shlq	%cl, %rax
    26e0: 48 89 84 24 00 00 00 00      	movq	%rax, (%rsp)
    26e8: 48 8b 84 24 00 00 00 00      	movq	(%rsp), %rax
    26f0: 48 89 ec                     	movq	%rbp, %rsp
    26f3: 5d                           	popq	%rbp
    26f4: c3                           	retq
    26f5: 90                           	nop
    26f6: 90                           	nop
    26f7: 90                           	nop

00000000000026f8 <caseA>:
    26f8: 55                           	pushq	%rbp
    26f9: 48 89 e5                     	movq	%rsp, %rbp
    26fc: 48 83 ec 60                  	subq	$0x60, %rsp
    2700: 48 89 bc 24 20 00 00 00      	movq	%rdi, 0x20(%rsp)
    2708: 48 89 b4 24 28 00 00 00      	movq	%rsi, 0x28(%rsp)
    2710: 48 89 94 24 30 00 00 00      	movq	%rdx, 0x30(%rsp)
    2718: 48 89 8c 24 38 00 00 00      	movq	%rcx, 0x38(%rsp)
    2720: 4c 89 84 24 40 00 00 00      	movq	%r8, 0x40(%rsp)
    2728: 4c 89 8c 24 48 00 00 00      	movq	%r9, 0x48(%rsp)
    2730: 44 8b 94 24 20 00 00 00      	movl	0x20(%rsp), %r10d
    2738: 44 89 94 24 00 00 00 00      	movl	%r10d, (%rsp)
    2740: e8 03 fd ff ff               	callq	0x2448 <mkNegI>
    2745: 48 89 84 24 10 00 00 00      	movq	%rax, 0x10(%rsp)
    274d: 48 8b 84 24 10 00 00 00      	movq	0x10(%rsp), %rax
    2755: 48 89 84 24 18 00 00 00      	movq	%rax, 0x18(%rsp)
    275d: 8b 84 24 00 00 00 00         	movl	(%rsp), %eax
    2764: 48 63 c0                     	movslq	%eax, %rax
    2767: 48 89 84 24 10 00 00 00      	movq	%rax, 0x10(%rsp)
    276f: 8b 8c 24 10 00 00 00         	movl	0x10(%rsp), %ecx
    2776: 89 c9                        	movl	%ecx, %ecx
    2778: 48 8b 84 24 18 00 00 00      	movq	0x18(%rsp), %rax
    2780: 48 d3 f8                     	sarq	%cl, %rax
    2783: 48 89 84 24 08 00 00 00      	movq	%rax, 0x8(%rsp)
    278b: 48 8b 84 24 08 00 00 00      	movq	0x8(%rsp), %rax
    2793: 48 89 ec                     	movq	%rbp, %rsp
    2796: 5d                           	popq	%rbp
    2797: c3                           	retq

0000000000002798 <caseB>:
    2798: 55                           	pushq	%rbp
    2799: 48 89 e5                     	movq	%rsp, %rbp
    279c: 48 83 ec 60                  	subq	$0x60, %rsp
    27a0: 48 89 bc 24 20 00 00 00      	movq	%rdi, 0x20(%rsp)
    27a8: 48 89 b4 24 28 00 00 00      	movq	%rsi, 0x28(%rsp)
    27b0: 48 89 94 24 30 00 00 00      	movq	%rdx, 0x30(%rsp)
    27b8: 48 89 8c 24 38 00 00 00      	movq	%rcx, 0x38(%rsp)
    27c0: 4c 89 84 24 40 00 00 00      	movq	%r8, 0x40(%rsp)
    27c8: 4c 89 8c 24 48 00 00 00      	movq	%r9, 0x48(%rsp)
    27d0: 44 8b 94 24 20 00 00 00      	movl	0x20(%rsp), %r10d
    27d8: 44 89 94 24 00 00 00 00      	movl	%r10d, (%rsp)
    27e0: e8 2f fd ff ff               	callq	0x2514 <mkNegU>
    27e5: 48 89 84 24 10 00 00 00      	movq	%rax, 0x10(%rsp)
    27ed: 48 8b 84 24 10 00 00 00      	movq	0x10(%rsp), %rax
    27f5: 48 89 84 24 18 00 00 00      	movq	%rax, 0x18(%rsp)
    27fd: 8b 84 24 00 00 00 00         	movl	(%rsp), %eax
    2804: 48 63 c0                     	movslq	%eax, %rax
    2807: 48 89 84 24 10 00 00 00      	movq	%rax, 0x10(%rsp)
    280f: 8b 8c 24 10 00 00 00         	movl	0x10(%rsp), %ecx
    2816: 89 c9                        	movl	%ecx, %ecx
    2818: 48 8b 84 24 18 00 00 00      	movq	0x18(%rsp), %rax
    2820: 48 d3 f8                     	sarq	%cl, %rax
    2823: 48 89 84 24 08 00 00 00      	movq	%rax, 0x8(%rsp)
    282b: 48 8b 84 24 08 00 00 00      	movq	0x8(%rsp), %rax
    2833: 48 89 ec                     	movq	%rbp, %rsp
    2836: 5d                           	popq	%rbp
    2837: c3                           	retq

0000000000002838 <caseC>:
    2838: 55                           	pushq	%rbp
    2839: 48 89 e5                     	movq	%rsp, %rbp
    283c: 48 83 ec 60                  	subq	$0x60, %rsp
    2840: 48 89 bc 24 20 00 00 00      	movq	%rdi, 0x20(%rsp)
    2848: 48 89 b4 24 28 00 00 00      	movq	%rsi, 0x28(%rsp)
    2850: 48 89 94 24 30 00 00 00      	movq	%rdx, 0x30(%rsp)
    2858: 48 89 8c 24 38 00 00 00      	movq	%rcx, 0x38(%rsp)
    2860: 4c 89 84 24 40 00 00 00      	movq	%r8, 0x40(%rsp)
    2868: 4c 89 8c 24 48 00 00 00      	movq	%r9, 0x48(%rsp)
    2870: 44 8b 94 24 20 00 00 00      	movl	0x20(%rsp), %r10d
    2878: 44 89 94 24 00 00 00 00      	movl	%r10d, (%rsp)
    2880: e8 8f fc ff ff               	callq	0x2514 <mkNegU>
    2885: 48 89 84 24 10 00 00 00      	movq	%rax, 0x10(%rsp)
    288d: 48 8b 84 24 10 00 00 00      	movq	0x10(%rsp), %rax
    2895: 48 89 84 24 18 00 00 00      	movq	%rax, 0x18(%rsp)
    289d: 8b 84 24 00 00 00 00         	movl	(%rsp), %eax
    28a4: 48 63 c0                     	movslq	%eax, %rax
    28a7: 48 89 84 24 10 00 00 00      	movq	%rax, 0x10(%rsp)
    28af: 8b 8c 24 10 00 00 00         	movl	0x10(%rsp), %ecx
    28b6: 89 c9                        	movl	%ecx, %ecx
    28b8: 48 8b 84 24 18 00 00 00      	movq	0x18(%rsp), %rax
    28c0: 48 d3 f8                     	sarq	%cl, %rax
    28c3: 48 89 84 24 08 00 00 00      	movq	%rax, 0x8(%rsp)
    28cb: 48 8b 84 24 08 00 00 00      	movq	0x8(%rsp), %rax
    28d3: 48 89 ec                     	movq	%rbp, %rsp
    28d6: 5d                           	popq	%rbp
    28d7: c3                           	retq

00000000000028d8 <caseD>:
    28d8: 55                           	pushq	%rbp
    28d9: 48 89 e5                     	movq	%rsp, %rbp
    28dc: 48 83 ec 60                  	subq	$0x60, %rsp
    28e0: 48 89 bc 24 20 00 00 00      	movq	%rdi, 0x20(%rsp)
    28e8: 48 89 b4 24 28 00 00 00      	movq	%rsi, 0x28(%rsp)
    28f0: 48 89 94 24 30 00 00 00      	movq	%rdx, 0x30(%rsp)
    28f8: 48 89 8c 24 38 00 00 00      	movq	%rcx, 0x38(%rsp)
    2900: 4c 89 84 24 40 00 00 00      	movq	%r8, 0x40(%rsp)
    2908: 4c 89 8c 24 48 00 00 00      	movq	%r9, 0x48(%rsp)
    2910: 44 8b 94 24 20 00 00 00      	movl	0x20(%rsp), %r10d
    2918: 44 89 94 24 00 00 00 00      	movl	%r10d, (%rsp)
    2920: e8 ef fb ff ff               	callq	0x2514 <mkNegU>
    2925: 48 89 84 24 10 00 00 00      	movq	%rax, 0x10(%rsp)
    292d: 48 8b 84 24 10 00 00 00      	movq	0x10(%rsp), %rax
    2935: 48 89 84 24 18 00 00 00      	movq	%rax, 0x18(%rsp)
    293d: 8b 84 24 00 00 00 00         	movl	(%rsp), %eax
    2944: 48 63 c0                     	movslq	%eax, %rax
    2947: 48 89 84 24 10 00 00 00      	movq	%rax, 0x10(%rsp)
    294f: 8b 8c 24 10 00 00 00         	movl	0x10(%rsp), %ecx
    2956: 89 c9                        	movl	%ecx, %ecx
    2958: 48 8b 84 24 18 00 00 00      	movq	0x18(%rsp), %rax
    2960: 48 d3 e8                     	shrq	%cl, %rax
    2963: 48 89 84 24 08 00 00 00      	movq	%rax, 0x8(%rsp)
    296b: 48 8b 84 24 08 00 00 00      	movq	0x8(%rsp), %rax
    2973: 48 89 ec                     	movq	%rbp, %rsp
    2976: 5d                           	popq	%rbp
    2977: c3                           	retq

0000000000002978 <caseE>:
    2978: 55                           	pushq	%rbp
    2979: 48 89 e5                     	movq	%rsp, %rbp
    297c: 48 83 ec 60                  	subq	$0x60, %rsp
    2980: 48 89 bc 24 20 00 00 00      	movq	%rdi, 0x20(%rsp)
    2988: 48 89 b4 24 28 00 00 00      	movq	%rsi, 0x28(%rsp)
    2990: 48 89 94 24 30 00 00 00      	movq	%rdx, 0x30(%rsp)
    2998: 48 89 8c 24 38 00 00 00      	movq	%rcx, 0x38(%rsp)
    29a0: 4c 89 84 24 40 00 00 00      	movq	%r8, 0x40(%rsp)
    29a8: 4c 89 8c 24 48 00 00 00      	movq	%r9, 0x48(%rsp)
    29b0: 44 8b 94 24 20 00 00 00      	movl	0x20(%rsp), %r10d
    29b8: 44 89 94 24 00 00 00 00      	movl	%r10d, (%rsp)
    29c0: e8 83 fa ff ff               	callq	0x2448 <mkNegI>
    29c5: 48 89 84 24 10 00 00 00      	movq	%rax, 0x10(%rsp)
    29cd: 8b 84 24 00 00 00 00         	movl	(%rsp), %eax
    29d4: 48 63 c0                     	movslq	%eax, %rax
    29d7: 48 89 84 24 18 00 00 00      	movq	%rax, 0x18(%rsp)
    29df: 8b 8c 24 18 00 00 00         	movl	0x18(%rsp), %ecx
    29e6: 89 c9                        	movl	%ecx, %ecx
    29e8: 48 8b 84 24 10 00 00 00      	movq	0x10(%rsp), %rax
    29f0: 48 d3 f8                     	sarq	%cl, %rax
    29f3: 48 89 84 24 08 00 00 00      	movq	%rax, 0x8(%rsp)
    29fb: 48 8b 84 24 08 00 00 00      	movq	0x8(%rsp), %rax
    2a03: 48 89 ec                     	movq	%rbp, %rsp
    2a06: 5d                           	popq	%rbp
    2a07: c3                           	retq

0000000000002a08 <main>:
    2a08: 55                           	pushq	%rbp
    2a09: 48 89 e5                     	movq	%rsp, %rbp
    2a0c: 48 81 ec c0 00 00 00         	subq	$0xc0, %rsp
    2a13: 48 89 bc 24 80 00 00 00      	movq	%rdi, 0x80(%rsp)
    2a1b: 48 89 b4 24 88 00 00 00      	movq	%rsi, 0x88(%rsp)
    2a23: 48 89 94 24 90 00 00 00      	movq	%rdx, 0x90(%rsp)
    2a2b: 48 89 8c 24 98 00 00 00      	movq	%rcx, 0x98(%rsp)
    2a33: 4c 89 84 24 a0 00 00 00      	movq	%r8, 0xa0(%rsp)
    2a3b: 4c 89 8c 24 a8 00 00 00      	movq	%r9, 0xa8(%rsp)
    2a43: b8 08 00 00 00               	movl	$0x8, %eax
    2a48: 89 84 24 44 00 00 00         	movl	%eax, 0x44(%rsp)
    2a4f: 8b 84 24 44 00 00 00         	movl	0x44(%rsp), %eax
    2a56: 89 84 24 00 00 00 00         	movl	%eax, (%rsp)
    2a5d: 44 8b 94 24 00 00 00 00      	movl	(%rsp), %r10d
    2a65: 44 89 d7                     	movl	%r10d, %edi
    2a68: e8 8b fc ff ff               	callq	0x26f8 <caseA>
    2a6d: 48 89 84 24 50 00 00 00      	movq	%rax, 0x50(%rsp)
    2a75: e8 f2 fa ff ff               	callq	0x256c <expAsr8>
    2a7a: 48 89 84 24 58 00 00 00      	movq	%rax, 0x58(%rsp)
    2a82: 48 8b 84 24 50 00 00 00      	movq	0x50(%rsp), %rax
    2a8a: 48 8b 8c 24 58 00 00 00      	movq	0x58(%rsp), %rcx
    2a92: 48 39 c8                     	cmpq	%rcx, %rax
    2a95: 0f 95 c0                     	setne	%al
    2a98: 0f b6 c0                     	movzbl	%al, %eax
    2a9b: 89 84 24 04 00 00 00         	movl	%eax, 0x4(%rsp)
    2aa2: b8 00 00 00 00               	movl	$0x0, %eax
    2aa7: 89 84 24 08 00 00 00         	movl	%eax, 0x8(%rsp)
    2aae: 8b 84 24 04 00 00 00         	movl	0x4(%rsp), %eax
    2ab5: 8b 8c 24 08 00 00 00         	movl	0x8(%rsp), %ecx
    2abc: 39 c8                        	cmpl	%ecx, %eax
    2abe: 0f 85 05 00 00 00            	jne	0x2ac9 <main+0xc1>
    2ac4: e9 af 00 00 00               	jmp	0x2b78 <main+0x170>
    2ac9: 48 8d 05 05 00 00 00         	leaq	0x5(%rip), %rax         # 0x2ad5 <main+0xcd>
    2ad0: e9 06 00 00 00               	jmp	0x2adb <main+0xd3>
    2ad5: 52                           	pushq	%rdx
    2ad6: 45 44 5f                     	popq	%rdi
    2ad9: 41 00 48 89                  	addb	%cl, -0x77(%r8)
    2add: 84 24 60                     	testb	%ah, (%rax,%riz,2)
    2ae0: 00 00                        	addb	%al, (%rax)
    2ae2: 00 b9 05 00 00 00            	addb	%bh, 0x5(%rcx)
    2ae8: 89 8c 24 68 00 00 00         	movl	%ecx, 0x68(%rsp)
    2aef: c7 84 24 6c 00 00 00 00 00 00 00     	movl	$0x0, 0x6c(%rsp)
    2afa: 48 c7 84 24 70 00 00 00 00 00 00 00  	movq	$0x0, 0x70(%rsp)
    2b06: b8 01 00 00 00               	movl	$0x1, %eax
    2b0b: 89 84 24 44 00 00 00         	movl	%eax, 0x44(%rsp)
    2b12: 8b bc 24 44 00 00 00         	movl	0x44(%rsp), %edi
    2b19: 48 8b b4 24 60 00 00 00      	movq	0x60(%rsp), %rsi
    2b21: 8b 94 24 68 00 00 00         	movl	0x68(%rsp), %edx
    2b28: b8 01 00 00 00               	movl	$0x1, %eax
    2b2d: 0f 05                        	syscall
    2b2f: c7 84 24 48 00 00 00 0a 00 00 00     	movl	$0xa, 0x48(%rsp)
    2b3a: 8b bc 24 44 00 00 00         	movl	0x44(%rsp), %edi
    2b41: 48 8d b4 24 48 00 00 00      	leaq	0x48(%rsp), %rsi
    2b49: ba 01 00 00 00               	movl	$0x1, %edx
    2b4e: b8 01 00 00 00               	movl	$0x1, %eax
    2b53: 0f 05                        	syscall
    2b55: c7 84 24 48 00 00 00 00 00 00 00     	movl	$0x0, 0x48(%rsp)
    2b60: b8 01 00 00 00               	movl	$0x1, %eax
    2b65: 89 84 24 0c 00 00 00         	movl	%eax, 0xc(%rsp)
    2b6c: 8b 84 24 0c 00 00 00         	movl	0xc(%rsp), %eax
    2b73: 48 89 ec                     	movq	%rbp, %rsp
    2b76: 5d                           	popq	%rbp
    2b77: c3                           	retq
    2b78: 44 8b 94 24 00 00 00 00      	movl	(%rsp), %r10d
    2b80: 44 89 d7                     	movl	%r10d, %edi
    2b83: e8 10 fc ff ff               	callq	0x2798 <caseB>
    2b88: 48 89 84 24 50 00 00 00      	movq	%rax, 0x50(%rsp)
    2b90: e8 d7 f9 ff ff               	callq	0x256c <expAsr8>
    2b95: 48 89 84 24 58 00 00 00      	movq	%rax, 0x58(%rsp)
    2b9d: 48 8b 84 24 50 00 00 00      	movq	0x50(%rsp), %rax
    2ba5: 48 8b 8c 24 58 00 00 00      	movq	0x58(%rsp), %rcx
    2bad: 48 39 c8                     	cmpq	%rcx, %rax
    2bb0: 0f 95 c0                     	setne	%al
    2bb3: 0f b6 c0                     	movzbl	%al, %eax
    2bb6: 89 84 24 10 00 00 00         	movl	%eax, 0x10(%rsp)
    2bbd: b8 00 00 00 00               	movl	$0x0, %eax
    2bc2: 89 84 24 14 00 00 00         	movl	%eax, 0x14(%rsp)
    2bc9: 8b 84 24 10 00 00 00         	movl	0x10(%rsp), %eax
    2bd0: 8b 8c 24 14 00 00 00         	movl	0x14(%rsp), %ecx
    2bd7: 39 c8                        	cmpl	%ecx, %eax
    2bd9: 0f 85 05 00 00 00            	jne	0x2be4 <main+0x1dc>
    2bdf: e9 af 00 00 00               	jmp	0x2c93 <main+0x28b>
    2be4: 48 8d 05 05 00 00 00         	leaq	0x5(%rip), %rax         # 0x2bf0 <main+0x1e8>
    2beb: e9 06 00 00 00               	jmp	0x2bf6 <main+0x1ee>
    2bf0: 52                           	pushq	%rdx
    2bf1: 45 44 5f                     	popq	%rdi
    2bf4: 42 00 48 89                  	addb	%cl, -0x77(%rax)
    2bf8: 84 24 60                     	testb	%ah, (%rax,%riz,2)
    2bfb: 00 00                        	addb	%al, (%rax)
    2bfd: 00 b9 05 00 00 00            	addb	%bh, 0x5(%rcx)
    2c03: 89 8c 24 68 00 00 00         	movl	%ecx, 0x68(%rsp)
    2c0a: c7 84 24 6c 00 00 00 00 00 00 00     	movl	$0x0, 0x6c(%rsp)
    2c15: 48 c7 84 24 70 00 00 00 00 00 00 00  	movq	$0x0, 0x70(%rsp)
    2c21: b8 01 00 00 00               	movl	$0x1, %eax
    2c26: 89 84 24 44 00 00 00         	movl	%eax, 0x44(%rsp)
    2c2d: 8b bc 24 44 00 00 00         	movl	0x44(%rsp), %edi
    2c34: 48 8b b4 24 60 00 00 00      	movq	0x60(%rsp), %rsi
    2c3c: 8b 94 24 68 00 00 00         	movl	0x68(%rsp), %edx
    2c43: b8 01 00 00 00               	movl	$0x1, %eax
    2c48: 0f 05                        	syscall
    2c4a: c7 84 24 48 00 00 00 0a 00 00 00     	movl	$0xa, 0x48(%rsp)
    2c55: 8b bc 24 44 00 00 00         	movl	0x44(%rsp), %edi
    2c5c: 48 8d b4 24 48 00 00 00      	leaq	0x48(%rsp), %rsi
    2c64: ba 01 00 00 00               	movl	$0x1, %edx
    2c69: b8 01 00 00 00               	movl	$0x1, %eax
    2c6e: 0f 05                        	syscall
    2c70: c7 84 24 48 00 00 00 00 00 00 00     	movl	$0x0, 0x48(%rsp)
    2c7b: b8 01 00 00 00               	movl	$0x1, %eax
    2c80: 89 84 24 18 00 00 00         	movl	%eax, 0x18(%rsp)
    2c87: 8b 84 24 18 00 00 00         	movl	0x18(%rsp), %eax
    2c8e: 48 89 ec                     	movq	%rbp, %rsp
    2c91: 5d                           	popq	%rbp
    2c92: c3                           	retq
    2c93: 44 8b 94 24 00 00 00 00      	movl	(%rsp), %r10d
    2c9b: 44 89 d7                     	movl	%r10d, %edi
    2c9e: e8 95 fb ff ff               	callq	0x2838 <caseC>
    2ca3: 48 89 84 24 50 00 00 00      	movq	%rax, 0x50(%rsp)
    2cab: e8 bc f8 ff ff               	callq	0x256c <expAsr8>
    2cb0: 48 89 84 24 58 00 00 00      	movq	%rax, 0x58(%rsp)
    2cb8: 48 8b 84 24 50 00 00 00      	movq	0x50(%rsp), %rax
    2cc0: 48 8b 8c 24 58 00 00 00      	movq	0x58(%rsp), %rcx
    2cc8: 48 39 c8                     	cmpq	%rcx, %rax
    2ccb: 0f 95 c0                     	setne	%al
    2cce: 0f b6 c0                     	movzbl	%al, %eax
    2cd1: 89 84 24 1c 00 00 00         	movl	%eax, 0x1c(%rsp)
    2cd8: b8 00 00 00 00               	movl	$0x0, %eax
    2cdd: 89 84 24 20 00 00 00         	movl	%eax, 0x20(%rsp)
    2ce4: 8b 84 24 1c 00 00 00         	movl	0x1c(%rsp), %eax
    2ceb: 8b 8c 24 20 00 00 00         	movl	0x20(%rsp), %ecx
    2cf2: 39 c8                        	cmpl	%ecx, %eax
    2cf4: 0f 85 05 00 00 00            	jne	0x2cff <main+0x2f7>
    2cfa: e9 af 00 00 00               	jmp	0x2dae <main+0x3a6>
    2cff: 48 8d 05 05 00 00 00         	leaq	0x5(%rip), %rax         # 0x2d0b <main+0x303>
    2d06: e9 06 00 00 00               	jmp	0x2d11 <main+0x309>
    2d0b: 52                           	pushq	%rdx
    2d0c: 45 44 5f                     	popq	%rdi
    2d0f: 43 00 48 89                  	addb	%cl, -0x77(%r8)
    2d13: 84 24 60                     	testb	%ah, (%rax,%riz,2)
    2d16: 00 00                        	addb	%al, (%rax)
    2d18: 00 b9 05 00 00 00            	addb	%bh, 0x5(%rcx)
    2d1e: 89 8c 24 68 00 00 00         	movl	%ecx, 0x68(%rsp)
    2d25: c7 84 24 6c 00 00 00 00 00 00 00     	movl	$0x0, 0x6c(%rsp)
    2d30: 48 c7 84 24 70 00 00 00 00 00 00 00  	movq	$0x0, 0x70(%rsp)
    2d3c: b8 01 00 00 00               	movl	$0x1, %eax
    2d41: 89 84 24 44 00 00 00         	movl	%eax, 0x44(%rsp)
    2d48: 8b bc 24 44 00 00 00         	movl	0x44(%rsp), %edi
    2d4f: 48 8b b4 24 60 00 00 00      	movq	0x60(%rsp), %rsi
    2d57: 8b 94 24 68 00 00 00         	movl	0x68(%rsp), %edx
    2d5e: b8 01 00 00 00               	movl	$0x1, %eax
    2d63: 0f 05                        	syscall
    2d65: c7 84 24 48 00 00 00 0a 00 00 00     	movl	$0xa, 0x48(%rsp)
    2d70: 8b bc 24 44 00 00 00         	movl	0x44(%rsp), %edi
    2d77: 48 8d b4 24 48 00 00 00      	leaq	0x48(%rsp), %rsi
    2d7f: ba 01 00 00 00               	movl	$0x1, %edx
    2d84: b8 01 00 00 00               	movl	$0x1, %eax
    2d89: 0f 05                        	syscall
    2d8b: c7 84 24 48 00 00 00 00 00 00 00     	movl	$0x0, 0x48(%rsp)
    2d96: b8 01 00 00 00               	movl	$0x1, %eax
    2d9b: 89 84 24 24 00 00 00         	movl	%eax, 0x24(%rsp)
    2da2: 8b 84 24 24 00 00 00         	movl	0x24(%rsp), %eax
    2da9: 48 89 ec                     	movq	%rbp, %rsp
    2dac: 5d                           	popq	%rbp
    2dad: c3                           	retq
    2dae: 44 8b 94 24 00 00 00 00      	movl	(%rsp), %r10d
    2db6: 44 89 d7                     	movl	%r10d, %edi
    2db9: e8 1a fb ff ff               	callq	0x28d8 <caseD>
    2dbe: 48 89 84 24 50 00 00 00      	movq	%rax, 0x50(%rsp)
    2dc6: e8 99 f8 ff ff               	callq	0x2664 <expLsr8>
    2dcb: 48 89 84 24 58 00 00 00      	movq	%rax, 0x58(%rsp)
    2dd3: 48 8b 84 24 50 00 00 00      	movq	0x50(%rsp), %rax
    2ddb: 48 8b 8c 24 58 00 00 00      	movq	0x58(%rsp), %rcx
    2de3: 48 39 c8                     	cmpq	%rcx, %rax
    2de6: 0f 95 c0                     	setne	%al
    2de9: 0f b6 c0                     	movzbl	%al, %eax
    2dec: 89 84 24 28 00 00 00         	movl	%eax, 0x28(%rsp)
    2df3: b8 00 00 00 00               	movl	$0x0, %eax
    2df8: 89 84 24 2c 00 00 00         	movl	%eax, 0x2c(%rsp)
    2dff: 8b 84 24 28 00 00 00         	movl	0x28(%rsp), %eax
    2e06: 8b 8c 24 2c 00 00 00         	movl	0x2c(%rsp), %ecx
    2e0d: 39 c8                        	cmpl	%ecx, %eax
    2e0f: 0f 85 05 00 00 00            	jne	0x2e1a <main+0x412>
    2e15: e9 af 00 00 00               	jmp	0x2ec9 <main+0x4c1>
    2e1a: 48 8d 05 05 00 00 00         	leaq	0x5(%rip), %rax         # 0x2e26 <main+0x41e>
    2e21: e9 06 00 00 00               	jmp	0x2e2c <main+0x424>
    2e26: 52                           	pushq	%rdx
    2e27: 45 44 5f                     	popq	%rdi
    2e2a: 44 00 48 89                  	addb	%r9b, -0x77(%rax)
    2e2e: 84 24 60                     	testb	%ah, (%rax,%riz,2)
    2e31: 00 00                        	addb	%al, (%rax)
    2e33: 00 b9 05 00 00 00            	addb	%bh, 0x5(%rcx)
    2e39: 89 8c 24 68 00 00 00         	movl	%ecx, 0x68(%rsp)
    2e40: c7 84 24 6c 00 00 00 00 00 00 00     	movl	$0x0, 0x6c(%rsp)
    2e4b: 48 c7 84 24 70 00 00 00 00 00 00 00  	movq	$0x0, 0x70(%rsp)
    2e57: b8 01 00 00 00               	movl	$0x1, %eax
    2e5c: 89 84 24 44 00 00 00         	movl	%eax, 0x44(%rsp)
    2e63: 8b bc 24 44 00 00 00         	movl	0x44(%rsp), %edi
    2e6a: 48 8b b4 24 60 00 00 00      	movq	0x60(%rsp), %rsi
    2e72: 8b 94 24 68 00 00 00         	movl	0x68(%rsp), %edx
    2e79: b8 01 00 00 00               	movl	$0x1, %eax
    2e7e: 0f 05                        	syscall
    2e80: c7 84 24 48 00 00 00 0a 00 00 00     	movl	$0xa, 0x48(%rsp)
    2e8b: 8b bc 24 44 00 00 00         	movl	0x44(%rsp), %edi
    2e92: 48 8d b4 24 48 00 00 00      	leaq	0x48(%rsp), %rsi
    2e9a: ba 01 00 00 00               	movl	$0x1, %edx
    2e9f: b8 01 00 00 00               	movl	$0x1, %eax
    2ea4: 0f 05                        	syscall
    2ea6: c7 84 24 48 00 00 00 00 00 00 00     	movl	$0x0, 0x48(%rsp)
    2eb1: b8 01 00 00 00               	movl	$0x1, %eax
    2eb6: 89 84 24 30 00 00 00         	movl	%eax, 0x30(%rsp)
    2ebd: 8b 84 24 30 00 00 00         	movl	0x30(%rsp), %eax
    2ec4: 48 89 ec                     	movq	%rbp, %rsp
    2ec7: 5d                           	popq	%rbp
    2ec8: c3                           	retq
    2ec9: 44 8b 94 24 00 00 00 00      	movl	(%rsp), %r10d
    2ed1: 44 89 d7                     	movl	%r10d, %edi
    2ed4: e8 9f fa ff ff               	callq	0x2978 <caseE>
    2ed9: 48 89 84 24 50 00 00 00      	movq	%rax, 0x50(%rsp)
    2ee1: e8 86 f6 ff ff               	callq	0x256c <expAsr8>
    2ee6: 48 89 84 24 58 00 00 00      	movq	%rax, 0x58(%rsp)
    2eee: 48 8b 84 24 50 00 00 00      	movq	0x50(%rsp), %rax
    2ef6: 48 8b 8c 24 58 00 00 00      	movq	0x58(%rsp), %rcx
    2efe: 48 39 c8                     	cmpq	%rcx, %rax
    2f01: 0f 95 c0                     	setne	%al
    2f04: 0f b6 c0                     	movzbl	%al, %eax
    2f07: 89 84 24 34 00 00 00         	movl	%eax, 0x34(%rsp)
    2f0e: b8 00 00 00 00               	movl	$0x0, %eax
    2f13: 89 84 24 38 00 00 00         	movl	%eax, 0x38(%rsp)
    2f1a: 8b 84 24 34 00 00 00         	movl	0x34(%rsp), %eax
    2f21: 8b 8c 24 38 00 00 00         	movl	0x38(%rsp), %ecx
    2f28: 39 c8                        	cmpl	%ecx, %eax
    2f2a: 0f 85 05 00 00 00            	jne	0x2f35 <main+0x52d>
    2f30: e9 af 00 00 00               	jmp	0x2fe4 <main+0x5dc>
    2f35: 48 8d 05 05 00 00 00         	leaq	0x5(%rip), %rax         # 0x2f41 <main+0x539>
    2f3c: e9 06 00 00 00               	jmp	0x2f47 <main+0x53f>
    2f41: 52                           	pushq	%rdx
    2f42: 45 44 5f                     	popq	%rdi
    2f45: 45 00 48 89                  	addb	%r9b, -0x77(%r8)
    2f49: 84 24 60                     	testb	%ah, (%rax,%riz,2)
    2f4c: 00 00                        	addb	%al, (%rax)
    2f4e: 00 b9 05 00 00 00            	addb	%bh, 0x5(%rcx)
    2f54: 89 8c 24 68 00 00 00         	movl	%ecx, 0x68(%rsp)
    2f5b: c7 84 24 6c 00 00 00 00 00 00 00     	movl	$0x0, 0x6c(%rsp)
    2f66: 48 c7 84 24 70 00 00 00 00 00 00 00  	movq	$0x0, 0x70(%rsp)
    2f72: b8 01 00 00 00               	movl	$0x1, %eax
    2f77: 89 84 24 44 00 00 00         	movl	%eax, 0x44(%rsp)
    2f7e: 8b bc 24 44 00 00 00         	movl	0x44(%rsp), %edi
    2f85: 48 8b b4 24 60 00 00 00      	movq	0x60(%rsp), %rsi
    2f8d: 8b 94 24 68 00 00 00         	movl	0x68(%rsp), %edx
    2f94: b8 01 00 00 00               	movl	$0x1, %eax
    2f99: 0f 05                        	syscall
    2f9b: c7 84 24 48 00 00 00 0a 00 00 00     	movl	$0xa, 0x48(%rsp)
    2fa6: 8b bc 24 44 00 00 00         	movl	0x44(%rsp), %edi
    2fad: 48 8d b4 24 48 00 00 00      	leaq	0x48(%rsp), %rsi
    2fb5: ba 01 00 00 00               	movl	$0x1, %edx
    2fba: b8 01 00 00 00               	movl	$0x1, %eax
    2fbf: 0f 05                        	syscall
    2fc1: c7 84 24 48 00 00 00 00 00 00 00     	movl	$0x0, 0x48(%rsp)
    2fcc: b8 01 00 00 00               	movl	$0x1, %eax
    2fd1: 89 84 24 3c 00 00 00         	movl	%eax, 0x3c(%rsp)
    2fd8: 8b 84 24 3c 00 00 00         	movl	0x3c(%rsp), %eax
    2fdf: 48 89 ec                     	movq	%rbp, %rsp
    2fe2: 5d                           	popq	%rbp
    2fe3: c3                           	retq
    2fe4: 48 8d 05 05 00 00 00         	leaq	0x5(%rip), %rax         # 0x2ff0 <main+0x5e8>
    2feb: e9 17 00 00 00               	jmp	0x3007 <main+0x5ff>
    2ff0: 4f 4b 20 69 36               	andb	%bpl, 0x36(%r9)
    2ff5: 34 73                        	xorb	$0x73, %al
    2ff7: 68 69 66 74 20               	pushq	$0x20746669             # imm = 0x20746669
    2ffc: 64 69 73 63 20 67 72 65      	imull	$0x65726720, %fs:0x63(%rbx), %esi # imm = 0x65726720
    3004: 65 6e                        	outsb	%gs:(%rsi), %dx
    3006: 00 48 89                     	addb	%cl, -0x77(%rax)
    3009: 84 24 60                     	testb	%ah, (%rax,%riz,2)
    300c: 00 00                        	addb	%al, (%rax)
    300e: 00 b9 16 00 00 00            	addb	%bh, 0x16(%rcx)
    3014: 89 8c 24 68 00 00 00         	movl	%ecx, 0x68(%rsp)
    301b: c7 84 24 6c 00 00 00 00 00 00 00     	movl	$0x0, 0x6c(%rsp)
    3026: 48 c7 84 24 70 00 00 00 00 00 00 00  	movq	$0x0, 0x70(%rsp)
    3032: b8 01 00 00 00               	movl	$0x1, %eax
    3037: 89 84 24 44 00 00 00         	movl	%eax, 0x44(%rsp)
    303e: 8b bc 24 44 00 00 00         	movl	0x44(%rsp), %edi
    3045: 48 8b b4 24 60 00 00 00      	movq	0x60(%rsp), %rsi
    304d: 8b 94 24 68 00 00 00         	movl	0x68(%rsp), %edx
    3054: b8 01 00 00 00               	movl	$0x1, %eax
    3059: 0f 05                        	syscall
    305b: c7 84 24 48 00 00 00 0a 00 00 00     	movl	$0xa, 0x48(%rsp)
    3066: 8b bc 24 44 00 00 00         	movl	0x44(%rsp), %edi
    306d: 48 8d b4 24 48 00 00 00      	leaq	0x48(%rsp), %rsi
    3075: ba 01 00 00 00               	movl	$0x1, %edx
    307a: b8 01 00 00 00               	movl	$0x1, %eax
    307f: 0f 05                        	syscall
    3081: c7 84 24 48 00 00 00 00 00 00 00     	movl	$0x0, 0x48(%rsp)
    308c: b8 00 00 00 00               	movl	$0x0, %eax
    3091: 89 84 24 40 00 00 00         	movl	%eax, 0x40(%rsp)
    3098: 8b 84 24 40 00 00 00         	movl	0x40(%rsp), %eax
    309f: 48 89 ec                     	movq	%rbp, %rsp
    30a2: 5d                           	popq	%rbp
    30a3: c3                           	retq
