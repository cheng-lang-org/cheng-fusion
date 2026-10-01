# A9b 腿编译器调查：Cheng 链驱动的三道墙（含最小复现）

日期：2026-09-13 ｜ 线：RSI 融合线 ｜ 发现场景：A9b 逐相仪器三腿

## 0. 一句话结论

**逐相仪器只在 Cheng 链载具上存在，而 Cheng 链载具今天编不动 RSI 语料——卡点全在内核 receipt/typed_expr 管线，不在 RSI。** 本文给出三个 3–5 行最小复现，供内核线直接取用。

## 1. 载具能力对照（同一窗口、同一 guard 配置、逐字取自原始件）

| 载具 | `ordinary_zero_exit_fixture`（2 行） | RSI 语料 | 成功编译时逐相行 |
|---|---|---|---|
| `artifacts/bootstrap/cheng.stage3`（C 链） | ✓ rc=0 | ✓ rc=0（引擎 genesis→trial→accept 全跑通） | **0 行** |
| `.rebuild/a7b9/kd_a7v9`（Cheng 链，pre-B6） | ✓ | ✗ `normalized expression parser node missing … surface=continue` | 18 行 |
| `.rebuild/s1b_step3/r9/kd_b701`（Cheng 链，post-B6） | ✓ rc=0 | ✗（见下三道墙） | 18 行 |

判据：`bootstrap/cheng_cold.c` 全文只有 **1** 处 `compile_progress`（且仅 `phase=resource_guard status=rss_limit_exceeded` 越限路径）；两个 Cheng 链驱动二进制各 **11** 处。⇒ C 链载具成功编译时一行都不发。

## 2. 最小复现（全部在 `src/tests/` 下编译；用 kd_b701 + `CHENG_PROGRESS=1`）

| # | 源码（逐字） | 判词（逐字） |
|---|---|---|
| c1 | `import std/strings as strings` + `fn main(): int32 =` + `return 0`（3 行） | `compiler parser receipt: manual consume function identity drift` |
| c3 | `fn main(): int32 =` / `var total: int64` / `for i in range(200):` / `total = total + int64(i * i)` / `return 0`（5 行，**无 import**） | `typed expr value definition: producer lacks exact type or ownership proof` |
| c4 | `import std/strings as strings` + `fn main(): int32 =` / `echo(strings.Sha256(strings.Int64ToStr(5)))` / `return 0`（5 行） | `typed expr: call declaration static argument type unavailable source=<c4> name=Sha256 line=4 scope=main scope_start=3 args=strings.Int64ToStr(5) scopes=1 signatures=1 bindings=0 lines=3` |
| c2（**对照，通过**） | `fn main(): int32 =` / `echo("hi")` / `return 0`（3 行） | rc=0，产出可执行件 |
| c5 | `import std/strutils as strutil` + `return 0` | **已实测（2026-09-13，kd_f102）**：`compiler parser receipt: manual consume function identity drift`（与 c1 同墙） |
| **c6** | `import std/os as os` + `return 0` | **已实测**：`compiler parser receipt: normalized expression parser node missing exprIndex=5 kind=1 line=50 surface=if rootNode=-1 originNode=-1 role=0`（**另一道墙**） |
| **c0**（对照，通过） | `fn main(): int32 =` / `return 0`（**无 import**） | **rc=0、产出可执行件、18 相行**（kd_b905b 实测 221 s） |

⇒ c2 通过而 c1/c3/c4 失败 ⇒ **不是『驱动坏了』，也不是『路径不对』**：把同一份 `src/tests/rsi_minimal_smoke.cheng` 放 `src/tests/` 与 `src/rsi_work/` 两处编译，**同一个墙、逐字相同**。
另注：源放在 `.rebuild/` 下会先撞**另一道更早的墙** `system link plan: entry module identity unavailable`（驱动不识别该目录），故复现必须落在 `src/tests/`。

## 2b. 2026-09-13/14 追加实测（**触发面已收窄，请以此节为准**）

**结论（一句话）**：**只要 `import std/<任一模块>` 就撞墙**（strings / strutils / os 三例全中，其中 os 撞的是另一道），**无 import 的程序完全通过**；⇒ 这与 RSI 源码无关，修法必须落在 **std 导入闭包的声明面**。

**驱动稳定性（判词逐字相同，连续七枚）**：`kd_b701`（pre-B6）→ `kd_b905b` → `kd_b1002` → `kd_f102` → `kd_b1102` → `kd_d7`（21:34:37，含 typed_expr 四连修）。

**⚠ 2026-09-13 14:06Z 明确结论（请内核线注意）**：`kd_d7` **含 typed_expr 四连修**（`3b767ba64`，提交语称『前缀判词总数首次归零』），但 **c1/c3 两枚最小复现判词逐字不变** ⇒ **该修的『归零』是在 `src=2 cleanup_cfg` 那条源上的度量，不覆盖本回执的两种 RSI 形状**。请以本回执的 c0/c1/c3/c5/c6 五枚哨兵为验收集，而不是只看 cleanup_cfg 的判词计数。

**位点图（只读代码所得，未编译验证；用于定点）**：
- **实证（2026-09-14，用你们自带的 `CHENG_TYPED_DECL_TRACE`，未改任何源码）**：c1（3 行）编译时 **profile 共 571 条声明，第 0 条 = `main line=3`，其后 570 条是导入闭包的声明**（sha256/crypto 族）⇒ **profile 把入口源声明排最前，而 receipt 的 bridge 表按 parser 树行序建立**；只要树序里 `main` 不在第 0 行，`exactFunctionDeclarationRow != 记录值(0)` ⇒ drift。原始件 `.rebuild/patchwork/decl_trace/g.err.txt`（571 行），探针 `docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/…`（同上目录 `probe_decl_trace.sh`）。
- **一步验证**：打印 c1 轮次的 `tree.declarationCount` 与 `main` 的树行号 —— 若 ≠ 其 `declarationSourceLocalRows[row]`（=0），即坐实两空间顺序不同；修法 = 在同一空间比较（或记录值改存树行号）。
- 墙一（drift）判点 `src/core/tooling/compiler_parser_receipt.cheng:3613-3636`：被判的两个量分别是
  - 左值（记录值）`functionSpan.manualConsumeFunctionDeclarationSourceLocalRow` ← `:2172-2173` ← `compiler_csg.cheng:29545-29546` ← **`profile.decls[declIndex].manualConsumeFunctionDeclarationRow`**（某源 **profile 表**的行号）；
  - 右值（精确值）`exactFunctionDeclarationRow` = receipt **bridge 表**里按 `(kind==Function ∧ declarationSpanId ∧ nameSpanId)` 反查到的行号；bridge 表在 `:3274-3319` 按 `for declarationRow in 0..<tree.declarationCount` **逐行 1:1** 建立，且 `:3299-3302` 硬要求 `tree.producerSourceCount == 1`。
  - ⇒ **被判的是「profile 行空间」与「tree/bridge 行空间」是否一致**。候选机制（**未验证**）：`compiler_csg.cheng:25611-25729` 的 merge/排序段（含 `declOrder`）重排了 `profile.decls`，而记录值取自重排前；或导入闭包触发的声明插入发生在记录之后。**一次最小探针即可判死**：打印 `out.declarationKinds.len` 与 `tree.declarationCount`（不等即后者，等而值不同即前者）。
- 墙二（`normalized expression parser node missing … surface=if`）：`rootNode=-1` = 该表达式节点**没被归一化树建出来**；同在 parser 归一化→receipt 段，且只有带 `import std/*` 才触发。

**建议：把 c0/c1/c3/c5/c6 当回归哨兵** —— 任何"清墙"补丁先过这五枚（c0 必须仍 rc=0，其余四枚必须转 rc=0）再看 234 源。

## 3. 复现命令（一条腿）

**现役复现（推荐，工具已入 git 可追踪路径）**：
```
# 源在 src/a9_wall_probe/{c0,c1,c3,c5,c6}.cheng（必须落 <root>/src/ 下，放 .rebuild/ 会先撞 entry module identity unavailable）
PROBE_COMPILER=$PWD/.rebuild/s1b_step3/r9/<驱动> \
  PROBE_SRCS="$PWD/src/a9_wall_probe/c1.cheng $PWD/src/a9_wall_probe/c3.cheng" \
  bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/wall_probe_retry.sh     # 窗口被抢自动重试
# 一键盘点（墙在则原样早退、不碰既有判词；墙清了自动跑 A9b 三腿 + cdomain 档 0/1）：
SLOT_MODE=acquire bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh <驱动>
```

**历史复现（2026-09-13 之前，保留备查）**：

```
CHENG_PROGRESS=1 bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a9/a9_seed_compile_probe.sh \
  --root /Users/lbcheng/cheng-lang \
  --compiler /Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/kd_b701 \
  --src /Users/lbcheng/cheng-lang/src/tests/<复现源>.cheng \
  --out-dir .rebuild/a9b/<标签>
```

探针本身只做一件事：把一次编译原样重放并把**全量 stdout/stderr 落盘**（A9a 的转发面按设计只转发 `compile_progress ` 前缀，报错原文会被吞掉——这正是本轮之前『腿内无判词』的原因）。

## 4. 原始件索引（本轮实测，只读）

- 载具对照：`.rebuild/a9b/kd_probe1/`（kd_a7v9 夹具 18 行）、`.rebuild/a9b/kd_probe2/`（kd_b701 夹具 rc=0 + 18 行）、`.rebuild/a9b/kd_probe3/`（kd_b701 编生成候选 → `manual consume function identity drift`）
- 位置分离：`.rebuild/a9b/locprobe/{tests,work}/`（同一份源两处，同墙）
- 二分：`.rebuild/a9b/bisect2/{c1_import,c2_echo,c3_range,c4_sha}/`
- A9b 三腿实证（stage3 载具，引擎跑通但 0 行）：`.rebuild/a9b/legs/p/run_att1/`

## 5. 判词边界（不得含糊）

- A9b 本轮判词 = **INCONCLUSIVE（依赖未满足）**：不是 PASS，也不是 FAIL。
- 仪器链**已用 Cheng 链夹具证过能发 18 行**（同一探针、同一 guard 配置）⇒ 缺的只是「能编语料的 Cheng 链载具」。
- 生成器那 41 处冗余默认初始化是**真缺陷且已修**（修后同一候选在 C 链 rc=0 并产出可执行件）；它与上述三道墙**是两回事**，不得混记。
