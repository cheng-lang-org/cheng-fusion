# STAGE0-A1 Leader 裁定（2026-09-15T10:14Z，绑 HEAD 60e37f0e）

被审：`stage0_A1_20260915T101349Z.md` + `stage0_A1_20260915T101349Z.patch`。

## 已独立复核（逐项对上原始件）
- patch sha16 = `7355d5f7fa3dd870`，与 `.rebuild/d6_line/d6_fix_head.patch` **逐字节相同**；32972 B。
- `git apply --check` **fwd rc=0**；`-R` **rc=1**（未应用态互证）⇒ 现树不含 D6。
- `git apply --numstat` = `545 31 bootstrap/cheng_cold.c`（12 hunk，仅此一文件）。
- 三件 fixtures 在 `receipts/fixtures/stage0_A1_*.cheng`（loopseq_amplified / strseq_scope_drop / loopseq_fix_probe）。

## 裁定
1. **preflight FAIL = 工具假阳性，判据成立**。`ann=4 displaced=0 wedged=0`；4 条 `ANNOTATION`（:25764/:26446/:68865/:92554）全是 `.c` 注释正文里的 `exportc/importc/borrows` 字样（实测 :25763-25764 为注释行），非 Cheng 注解。**事故一的门（注解→声明映射位移）以 `displaced=0 wedged=0` 通过**。C 文件类 patch 的「preflight PASS」按此口径收；`patch_preflight.py` 对 `.c` 的 `^` 扫描是已知口径缺陷，登记、不放宽判据。
2. **`milestone_board.md` M3「已落：D5 presize + D6 Fix A」是文档假绿**（对 `cheng_cold.c`）：patch 正向 rc=0 + `-R` rc=1 + D6 墓碑仍在 ⇒ 现树无 D6。属内核线看板，登记交还，本线不改其文件。
3. **A1 线索更正**：我给的 `cold_parser.c:81195-81212` 是 D1/D2 局部绑定臂（`exact_take` / read-copy），**不是掉落收集器**。真判据域 = 表填充 `:81342-81366` / staging `:91339-91341` / loop-edge 物化 `:73234-73239`；真泄漏点 = `cheng_cold.c:38619-38698` `codegen_seq_i32_add` 增长分支（str/opaque 同形）。A1 名义刀（`cold_parser.c` 平行表）按 `deterministic_model_derivation.md:2105-2106` 定谳「登表即双释放、修复空间为空」——**放弃**。
4. **候选 patch 不是墓碑重踩**：D6 Fix A 是**位门控释放**（三处 seq_add 增 `release_ok` 参数 + 456 行 `cold_d6_seq_add_release_decisions` 逃逸/发布分析；墓碑注释已改写为「历史禁忌针对**无条件**形，发布形恰被 bit proof 排除」）。**接受为段 1 候选**，但**零编译未验**（UNVERIFIED）。

## 段 1 待办（本墙）
- 真烤后先过金丝雀，再验 `d6_tombstone_repro`（无条件 => registry_miss；bit-gated => rc=0）。
- D6 与 `f53f64e14` 之后合流线（T6/T7/M2/T10/D5/AR2）的语义兼容、逃逸白名单是否需扩：未核。
