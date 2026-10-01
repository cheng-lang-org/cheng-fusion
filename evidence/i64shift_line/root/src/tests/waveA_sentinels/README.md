# Wave-A T4 正确性哨兵

gen2 运行时静默 miscompile 的最小可复现夹具, 供 T1 修后红→绿门。
**不改** `src/core/**`; 本目录只放夹具 + 本 README。

## 如何跑

```bash
# 权威口径: pure driver/stage3 + --emit:exe --link-providers
tools/waveA_sentinel_run.sh

# 单夹具
tools/waveA_sentinel_run.sh setlen_zero_tail_ptr_field

# 换候选 driver
EXEC_DIFF_DRIVER=/path/to/candidate tools/waveA_sentinel_run.sh
```

超时建议: 单夹具 compile ≤60s, run ≤10s。

## 哨兵清单 (2026-07-09 实测)

| 夹具 | 根因族 | 官方 driver pure providers | stage3 | 修后目标 |
|---|---|---|---|---|
| `setlen_zero_tail_ptr_field.cheng` | #1b 第五形态 ptr->field 实参 | **绿 0** (hoist+arrow 臂) | 绿 0 | 0 |
| `addr_of_local_ptr_decl_g.cheng` | #1 decl-init `&x` | 绿 0 (现源已物化) | 绿 0 | 0 (防回退) |
| `addr_of_local_ptr_decl_d.cheng` | #1 decl-init `ptr(&x)` | 绿 0 | 绿 0 | 0 (防回退) |
| `bare_deref_inline_wide.cheng` | 裸 `*name` 宽度 (inline) | **红 run=81** | 绿 0 | 0 |

对照 (已在 `exec_diff_corpus/`, 勿重复):
- `bare_deref_wide_return.cheng` — return-form 宽 deref, 现源绿

### 实测身份 (入库时)

```
HEAD:           d79057912
driver mtime:   2026-07-09 09:18
driver sha256:  39817d4f192d651150c468a454f32bcff9e14a5e94284d930d3142ebe4c63eb9
stage3 sha256:  58e5bdc8dd5920bbd2f3ee257152dcaed79bfe84b212ac010e6ae8c3c2d4d47c
```

命令级复现 (setLen 修后绿):

```bash
ROOT=$PWD
DRV=artifacts/backend_driver/cheng
SRC=src/tests/waveA_sentinels/setlen_zero_tail_ptr_field.cheng
$DRV system-link-exec --root:$ROOT --in:$SRC --emit:exe --link-providers \
  --target:arm64-apple-darwin --out:/tmp/setlen.drv && /tmp/setlen.drv; echo rc=$?
# → compile 0, run 0
```

## 口径陷阱

1. **setLen 第五形态只在 pure providers 暴露**  
   `tools/exec_diff.sh` 默认 `--emit:obj` + `_shared_runtime.c` C stub 实现 setLen,  
   夹具体本身不编 provider → **掩蔽** `cheng_seq_set_len_export` 内 `seqHdr->buffer` 等 ptr->field 实参死槽。  
   本 runner 强制 `--link-providers`。

2. **obj 口径 vs exe+providers 责任可反转**  
   案卷 nested_seq_index 旧注释曾判 stage3 分歧; exe+providers 下责任在 driver。  
   判黑白必须双口径 (op-lane-queue 三线战果注记)。

3. **addr_of_local 历史红 / 现源绿**  
   `/tmp/addrloc/{d,g}_*.cheng` + gen2fix 驱动曾静默 miscompile (p 槽从不写)。  
   2026-07-09 官方 driver 反汇编已见 `add xN,sp,#off` LEA 写入 p 槽 → 运行绿。  
   哨兵保留作 T1.6 回退门; 勿因现绿删夹具。

## bl-self — 无微夹具

bl-self (BL 目标坍缩为自身 / 空 reloc) **不能**用微夹具稳定复现:
- assert/Assert 在小闭包被内联/桥接, `_Assert` 符号都不出现
- 全闭包静态扫 `0x94000000` 无 reloc 才是有效口径
- 案卷: op-lane-queue gen2 点火进展; 微夹具陷阱注记

**禁止** 为 bl-self 造假绿微夹具。验证:
```bash
# 全闭包/集成树产物静态扫, 非本目录职责
# python 扫 text 段 0x94000000 且无对应 reloc
```

## pending 未转正

| 源 | 原因 |
|---|---|
| `scratchpad/gen2fix/pending_sentinels/addr_into_let_deref.cheng.pending` | 与 g 同族; 现源 `let ap: int32* = &x; *ap` 已绿, 语义由 g/d 覆盖 |
| `typed_ptr_field_store_exe.cheng.pending` | bail=711, exe 路径 `->field` store 未 ready — **blocked**, 非运行时静默 |
| bare_deref return `.pending` (scratchpad) | 已转正为 `exec_diff_corpus/bare_deref_wide_return.cheng` |

## 关联

- 作战图: `docs/beat-c.md §2` §8.2 T4
- 队列: `docs/op-lane-queue-2026-07-09.md` #1 / #1b / 三线战果
- packet: `scratchpad/gen2fix/addrlocal_arg_packet.md`
