# VERIFY_w143_append.md —— kernel_driver_w2 战役 wall143 线

日期：2026-09-04。工作目录=仓库根。任务：修 regalloc_aarch64 StrEqLiteral 字面量自比休眠缺陷（wall140 移交 :1549-1554）。

## 判定

**移交缺陷不成立 + 当前树不可达，如实关闭，未修，无 patch。** 烤机预算 2 轮，用 1 轮（r1 复现轮；无修法可验，r2 未用）。

## 一、机理核查：移交与源码不符（源码级证据闭环）

wall140 移交称「字节循环两条 load 基址均为 X17：`ldrb X16,[X17]` 应为 `ldrb X16,[X8]`」。核对当前树（含未提交在树修复）：

- `regallocA64AppendStrEqLiteral`（src/core/backend/regalloc_aarch64_adapter.cheng:1503）字节循环 :1549-1552 实际为：
  - `A64EncLdrbImm(A64X16, A64X8, 0)` → `ldrb x16,[x8]`
  - `A64EncLdrbImm(A64X7, A64X17, 0)` → `ldrb x7,[x17]`
- 编码器参数序实证（src/core/backend/aarch64_encode.cheng:506-512）：`A64EncLdrbImm(rt, rn, offsetBytes)`，`rn` 落 bits[9:5]、`rt` 落 bits[4:0]（0x39400000 标准形）。首条 load 基址=X8。
- X8 语义：:1533 `ldr x8,[x16]`（X16=str 槽地址，x8=str 数据指针），循环内 `add x8,x8,#1` 步进；X17=字面量数据地址（:1303 物化），同样步进。**即源码已经是移交所开的「修后形」，两基址独立、字节真实比较，不存在字面量自比。**
- `git log -L1549,1552` 与未提交 diff 双向核查：该循环自文件入库（f681cad2b）从未变过形；在树 diff 仅 wall138 两个 CallArgSlotAddress hunks（+35 行），与本域零交集。
- 操作数序契约：两处降 site（backend2_lower_slots.cheng:5466-5469 条件形、:26287-26290 值形）均为 operands[0]=strSlot、operands[1]=literalId，与 regalloc 侧用法精确配对；strSlot 侧另有 `LocalStrTag` 类型门（:1356-1358），literalId 有 cstringLiterals 越界门（:1520-1522）。无字面量/str 槽混用通道。
- 推断：wall140 系源码误读（把 `rt, rn` 序读反或与 x86 填充臂记录混淆），其开出的「修法」即现状代码。

## 二、复现不可达论证（当前树驱动 kernel_driver_w143_r1）

判别性探针（同长不同字节，如 `"aaa"` vs `"aab"`、`"prefix-xyz"` vs `"prefix-abc"`——自比缺陷下必虚真）在车头 cheng_w126 下全绿（`zz_probe_w143_streqlit=pass`，rc=0；反汇编 10 处比较全为双基址字节循环 `ldrb w7,[x2]`/`ldrb w8,[x4]`，x2≠x4 且各自步进，正确形）。

当前树 r1 驱动下，任何能到达 `str == "字面量"` 代码生成的夹具形态均被他人领地既有墙拦截（本轮逐一实测）：

| 形态 | 结果 | 拦截墙（领地） |
|---|---|---|
| `let s: str = "aaa"` 局部字面量初始化 | compile=1 `lowering ownership transport: managed temporary definition missing node=0 row=0` | primary_object_plan.cheng:27611 wall28 binder（降侧） |
| helper `return ""` + 调用初始化 | compile=1 同上（node=1） | 同上 |
| `let e: str = ""` | compile=2 `redundant explicit default init` | 语义门禁 |
| call-arg 字面量（cfg_string_literal_arg_let_call_fixture） | compile=2 csg `borrowed value passed to non-var parameter` | csg 门 |
| aes 形（桥返 str + 比较） | compile=2 `seqs.cheng:235 duplicate @borrows` | std/seqs.cheng 并行线在途编辑（git diff +8 内双 @borrows） |
| Fmt 生产者 str（`Fmt"{s}"`）+ `==/!= "字面量"`（探针 v3，已突破降侧 binder） | compile=1 `cleanup_cfg: captured-old release authority mismatch`（与 zz_v6_w7 同门同族） | cleanup_cfg/odir（wall139/141 领地，wall141 移交明示修面在 ownership_drop_ir.cheng） |

cold_nested（唯一在树可编译的比较夹具）走 fill 直发臂；action-recipe 臂（regallocA64AppendStrEqLiteral）在当前树上无任何夹具可达。三面拦截墙均在授权面外，按纪律不越界修。

## 三、门禁表（cwd=仓库根；r=kernel_driver_w143_r1，烤机=当前树 head 三件套）

| 门 | r1 | 车头 cheng_w126 | 判 |
|---|---|---|---|
| cold_nested_fmt_interpolation_smoke | c0/r0 `=pass` | c0/r0 `=pass` | 零回归 ✓ |
| ordinary_zero_exit_fixture | c0/r0 | c0/r0 | 零回归 ✓ |
| call_fixture | c0/r1 | c0/r1 | 零回归 ✓ |
| zz_v6_w7（只记录） | c1 `cleanup_cfg: captured-old release authority mismatch`（poid=10 opid=4） | c0/r0 | 与 wall140/141 移交现状一致 |
| zz_probe_w143_streqlit（v3，探针） | c1 cleanup_cfg 同门 | c0/r0 `=pass` | 复现不可达实证 |

## 四、烤机记录（配方=wall140 同款三件套：/tmp/oob_ab/w138/build_kernel_driver_w138.sh + /tmp/oob_ab/w138/kernel_manifest_head.cheng + 车头 /tmp/oob_ab/cheng_w126；任务简报所写 /tmp/oob_ab/w126/ 路径已不存在，w140 线即用 w138 配方成功，本线照搬）

| 轮 | sha256 | size | 结果 |
|---|---|---|---|
| r1 | e8ccc76856372c916c5a10b30606bd4ee4d9dca28cc5d976a99d1502da125d86 | 186318864 | 一次成烤（attempt=1）；四门零回归；复现不可达闭环 |

## 五、探针处置与树态记录

1. src/tests 探针四只（zz_probe_w143_streqlit / zz_w143_bisect_a|b|c）已删，零残留复核（git status 无本线残留）。不转正理由：无修复落地，且该夹具当前树下 compile=1（cleanup_cfg 墙），转正即向树上添红。全部产物存 /tmp/oob_ab/w143/（disasm、compile.err、report、门禁输出）。
2. 本线未 commit、未开分支、未出 patch（无可修内容）；regalloc_aarch64_adapter.cheng 零改动。
3. 树态供各线自取：std/seqs.cheng:235-241 `@borrows` 双写（并行线在途，封 aes 形夹具）；cfg_string_literal_arg_let_call_fixture 在当前树 csg 门拒（陈旧夹具，非四门范围）；降侧 wall28 binder 对 `str="字面量"` 初始化 panic（新近可达墙）；zz_v6 与探针 v3 同撞 cleanup_cfg captured-old（wall139/141 现状）。
4. 对下墙线建议：若后续要真验 recipe 臂，需等 cleanup_cfg（wall141）与降侧 binder 墙清后，用 Fmt 生产者形探针（本线 v3 形态）重试；届时若臂被触发，字节循环按本线源码核查已是正确形，预期直接 =pass。
