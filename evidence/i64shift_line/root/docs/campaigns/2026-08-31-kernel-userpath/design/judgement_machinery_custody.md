# 判据机械件保管审计与抢救（B2）

> 审计快照 τ = 2026-09-13 08:44:00 – 09:14:00（本地时钟）；HEAD `35e7df1a8c0b56b5bbf7eb1135bb06711f9b3bbd`；工作树脏（内核 C2 线 + RSI 线在飞，`.rebuild/COMPILE_SLOT.lock/owner.txt = pid=96980 purpose=c2line_round2`）。
> 只读对象：`.rebuild/**`、`tools/`、`src/`、`docs/`；本任务**未编译 / 未链接 / 未烤机 / 未计时 / 未测内存 / 未抢槽**，全部命令零产物。
> 引用坐标口径：`文件:行` 为审计时读到的行号；本仓文档正被并发 lane 改写，故关键引用同时给节名与当时哈希。
> HEAD 漂移注记：审计开始 HEAD = `35e7df1a8c0b56b5bbf7eb1135bb06711f9b3bbd`；审计期间**他线并行提交**（`git log -1` = `b904dda50…` @ 2026-09-13 09:00:52，`git merge-base --is-ancestor 35e7df1a HEAD` = YES）⇒ 本报告所有读数以**工作树内容**为准，不以 HEAD 为准；本任务全程未 commit / 未 push / 未建分支或 worktree。

## 0 结论

**一句话**：`.rebuild/s1b_step3/` 下 447 件判据机械件里，433 件（6,417,687 B）**git 不可追踪且无再生依据**，已逐件复制进 `frozen/` 并绑定本轮实算 sha256；`.rebuild/` 整体被 git 忽略（`.gitignore:343`，`git ls-files .rebuild/ | wc -l` = **0**），树内文档引用的 319 个 `.rebuild/` 路径中 **102 个（32.0%）已不存在**——`theory_emit` 不是孤例，是正在持续发生的引文蒸发。

### 交付物（绝对路径）

| 交付物 | 说明 |
|---|---|
| `/Users/lbcheng/cheng-lang/docs/campaigns/2026-08-31-kernel-userpath/design/judgement_machinery_custody.md` | 本文（保管审计报告） |
| `/Users/lbcheng/cheng-lang/docs/campaigns/2026-08-31-kernel-userpath/frozen/FROZEN_MANIFEST.tsv` | 433 件 U 类登记清单（sha256/mtime/birth/引用坐标） |
| `/Users/lbcheng/cheng-lang/docs/campaigns/2026-08-31-kernel-userpath/frozen/verify_frozen.sh` | 一致性校验器（可执行；`--coverage` 报增量） |

三件的本轮实算 sha256 与字节数见 §12；抢救副本为 `frozen/s1b_step3/**` 共 **433** 件（镜像源相对路径，保持原文件名与 mode/mtime；无重名冲突，因目录层级即来源前缀）。

### 已实测证据（要点；完整命令与读数见 §3–§8）

- 机械件清点：`447 = 4 G + 10 Z + 433 U + 0 D`（§3）。
- `verify_frozen.sh` 当场跑：`FROZEN_FILES=433 (declared 433)`、`SHA256_OK=433`、`SHA256_MISMATCH=0`、`ORIGINALS_IDENTICAL=432`、`DRIFTED=1`、`UNLISTED=0` ⇒ `VERDICT=CUSTODY_INTACT_SOURCE_DRIFTED`，exit 3（§6）。
- `verify_frozen.sh --coverage` 当场跑：`COVERAGE_TOTAL=449 LISTED=433 NEW_U=2 NEW_G=4 NEW_Z=10` ⇒ `VERDICT=COVERAGE_GAPS`，exit 5；2 件是审计快照之后由在飞 c2 lane 新写的活件（§6、§8）。
- 引文蒸发普查：319 个不同 `.rebuild/` 引用路径 / 102 个不存在（32.0%）；`theory_emit` 一族 8 个路径全部悬空（§7）。

### 未验证 / 未钉（摘要，逐条见 §9）

1. 只清点并抢救了 `.rebuild/s1b_step3/`；`.rebuild/` 其余子目录另有 **608 件**机械件（1,170,031 B，`b_line` 496 件为首）**未清点、未抢救**。
2. 判据**回执**（`*.summary.txt` 169 份 / 303,595 B，`*.txt` 2,033 份 / 238,785,159 B，`*.log` 48,840,818 B）不在本轮抢救面内——文档按名引用它们（融合层 §1.1 引 `.rebuild/s1b_step3/r9/gate/r104_recov.summary.txt`，该件在盘、2,327 B、mtime 2026-09-13 06:07）。
3. `D=0` 是**在本轮机械判据下**的结论（判据见 §2），不等于"人工逐件确认无可再生路径"。
4. 433 件的 `role/tier` 由文件名规则机械赋值（规则见 §4），不是逐件语义审计。
5. `frozen/` 现为**未跟踪新目录**（本任务禁 commit），其"进 git 后可恢复"未验证。

### 阻塞

无。本任务全程只读 `.rebuild/`、只在 `frozen/`（新建）与 `design/`（新建）落文件；未碰内核在飞件，未抢槽，未编译。

---

## 1 事故样本与传播面

`design/selfbake_theory_emit.md` §⑥「待槽位验证清单」把**可执行验证脚本本身**只留在 `.rebuild/theory_emit/`，该目录已整体消失。本轮实测（§7）：

- `ls -la .rebuild/theory_emit` → `No such file or directory`；`find . -name 'verify_theory_emit*'` → 零命中；`find . -name 'run234_selfbake*'` → 零命中。
- 被文档点名而悬空的路径（8 个不同路径，坐标取自 `design/selfbake_theory_emit.md`）：`:20` `selfbake_theory_emit.patch`、`:213` `verify_theory_emit.sh`（5 处引用）与 `run234_selfbake.sh`、`:218` `borrow_repro.cheng`、`:237` `borrow_repro` 与 `theory_emit/`、`:249` `dispatch_min.head.cheng`、`:255` `MANIFEST.sha256`。
- 该族里唯一可恢复的是 patch 正文：`docs/campaigns/2026-08-31-kernel-userpath/patches/selfbake_theory_emit.patch`（git 可追踪，融合层 §6.1 A7 已复核 `git apply --check` exit 0）。

⇒ 同类风险不是"theory_emit 这一件"，而是**所有只活在 `.rebuild/` 的判据件**。`.rebuild/s1b_step3/` 是其中体量最大、被文档引用最密的一处，故定为本轮抢救面。

## 2 方法与三态判定规则

**机械件集合**（`.rebuild/s1b_step3/` 递归，5,425 个文件中的 447 件）：扩展名 ∈ `{.py .sh .tsv .sha256 .sha .patch .json .awk .pl .mk .cfg .ini}` 或文件名前缀 ∈ `{MANIFEST, Makefile, VERSIONS, CHECKSUMS, SHA256SUMS}`。

**显式排除**：`.o .exe .map .dylib` 等构建产物（675 + 244 + 756 件）与 `*.log / *.stderr.txt / *.stdout.txt / *.report.txt` 等回执（见 §9-2）——它们是产物/读数，不是判据机械件；本任务亦禁复制二进制大件。

**三态判定（逐件，机器可复算）**：

- **G（git 可追踪）**：该件内容 sha256 与**至少一个 git 追踪文件的现工作树内容 sha256 相同**（跨文件名，10,819 件追踪文件全量哈希索引；不是同名匹配）。
- **D（可从源头/文档再生）**：机械筛查"正文行（长度 ≥20）在单一 git 追踪文档中的覆盖率 ≥80%"，命中者再人工核对是否字节可重建。**全库仅 1 件命中 98/101**：`r6/write_report.py`——其 15,067 B 的 `TEXT` 块整体在 `docs/campaigns/2026-08-31-kernel-userpath/design/s1b_step3_progress.md` 内，但脚本本体的 9 行（shebang、`import io`、路径常量、`TEXT = r'''` 与其结束行、`with io.open(...)` 追加循环、`print`）不在文档中 ⇒ **字节不可再生，仍判 U**（登记"其产物文本已在 git 追踪文档内"这一缓解事实）。
- **U（不可再生＝抢救对象）**：其余。
- **Z（0 字节，U 的子类，不复制）**：内容为空，其 sha256 `e3b0c442…` 与任意空追踪文件"相等"属**空匹配**，不构成恢复路径；复制空文件不携带信息，故登记不复制（10 件）。
- **X（读取期不稳定）**：读到一半被在飞 lane 改写 ⇒ 不冻结、登记告警。本轮 **0 件**（读两遍哈希一致才落盘）。

**活性判据（本轮新增的一等公民）**：`.rebuild/s1b_step3/r9/gate/` 是**活目录**（§8 实测 60 min 内 94 个文件被写）。因此抢救是**快照**而非同步：只冻结"判定时刻的字节"，不冻结在飞轮的未定读数；快照边界外的增量由 `verify_frozen.sh --coverage` 报为 gap（§6）。

## 3 清点结果

命令（只读；脚本为任务级临时件，判据规则见 §2，命令序列见 §11）：

```text
$ git check-ignore -v .rebuild/s1b_step3/check_acceptance.py
.gitignore:343:.rebuild/	.rebuild/s1b_step3/check_acceptance.py
$ git ls-files .rebuild/ | wc -l
0
$ find .rebuild/s1b_step3 -type f | wc -l
5425
```

清点与分类读数（审计快照 τ）：

| 类别 | 件数 | bytes | 处置 |
|---|---|---|---|
| **U** 不可再生 | **433** | **6,417,687** | 全部复制进 `frozen/s1b_step3/**` |
| **G** git 可追踪（内容级孪生） | 4 | 125,358 | 不复制，指针见下 |
| **Z** 0 字节 | 10 | 0 | 登记不复制（无内容） |
| **D** 可再生 | **0** | 0 | — |
| **X** 读取不稳定 | 0 | 0 | — |
| 合计机械件 | 447 | 6,543,045 | |

- **G 四件（内容级孪生，逐件给出追踪副本）**：`r5/s1b_step3d_seal_treefree.patch` → `docs/campaigns/2026-08-31-kernel-userpath/patches/s1b_step3d_seal_treefree.patch`；`r6/stageA.patch` → `…/patches/s1b_step3e_global_rows.patch`（**异名孪生**）；`r7/enum_variant_source_fix.patch` → `…/patches/s1b_step3h_enum_variant_producer_source.patch`（异名孪生）；`s1b_1c_seal_arena.patch` → `…/patches/s1b_1c_seal_arena.patch`。
- **Z 十件**：`gate/{r11,r36_trace,r37_sweep,r37_trace}.progression.tsv`、`r9/ab_probe_{const_only,lit_arith,struct_literal}.{A,B}.sha`。
- **无超过 1 MiB 的件**（最大：`MANIFEST.sha256` 48,315 B）⇒ 无需"只登记不复制"的大件处置；433 件全为文本。
- 按目录：`r9/gate` 116、`r9` 110、`r9/patchgen` 70、`gate` 36、`r6` 22、`r8` 15、`.`（顶层）15、`r5` 13、`r3` 11、`r7` 11、其余 14。

**既有 `MANIFEST.sha256` 的覆盖度**（`.rebuild/s1b_step3/MANIFEST.sha256`，mtime 2026-09-11 15:09，格式 `<sha256>  ./rel`）：433 件 U 中仅 **29 件**被它哈希记录——28 件当前内容与记录一致，**1 件不一致**（`r9/gate/c2c_raised_hardcut.ps.tsv`，该文件 2026-09-13 08:35 由在飞 c2 lane 重写）。⇒ **"在 MANIFEST.sha256 里有记录"不等于有内容保证**：活 lane 会按同名原地覆写。

## 4 风险分级与"下一件"警示

**分层规则（按丢失后果，机械赋值）**：

| 层 | 含义 | 件数 | 角色构成 |
|---|---|---|---|
| **T1-verdict** | 直接影响验收判词 | **38** | `verdict-checker` 1、`gate-runner` 8、`hash-record` 29 |
| **T2-reproduce** | 影响复现（烤机/AB/补丁链） | **211** | `patch-preflight` 1、`bake-driver` 9、`ab-pair-runner` 14、`converge-runner` 4、`patch-generator-or-checker` 32、`patch-artifact` 67、`other-script` 84 |
| **T3-diagnostic** | 仅诊断 | **198** | `criteria-data`（tsv）162、`diagnostic-probe` 36 |

角色由文件名规则赋值（`gate*`→gate-runner、`bake*`→bake-driver、`ab_*`→ab-pair-runner、`probe*/diag*/orc_triage*`→diagnostic-probe、`*.patch`→patch-artifact、`*_gen.py / mk* / freeze* / check* / verify*`→patch-generator-or-checker、`MANIFEST* / *.sha*`→hash-record、`*.tsv`→criteria-data），**是分拣标签，不是语义结论**。

**T1 核心件（本轮实算 sha256；引用坐标为文档:行）**：

| 件 | bytes | sha256（前 16） | 文档引用 | 说明 |
|---|---|---|---|---|
| `check_acceptance.py` | 3,897 | `d88f3463baa6db8b` | 18 处：`docs/cheng-plan.md:726`、`:985`、`:99`；`docs/campaigns/2026-09-07-pure-cheng-rsi/corpus_tier3_contract.md:90,91,171,265,274`；融合层 §八证据指针 | 唯一机械验收判词计算器：`rc=0 ∧ forest_parsed=234 ∧ forest_appended=234 ∧ guard_hits=0`，`EXPECT_SOURCES=234` 硬编码在 `:18`，`:33-66` fail-closed |
| `gate_run.sh` | 3,459 | `6725b43c7af239d7` | 33 处：`design/deterministic_model_derivation.md:763,864`；`design/forest_window_caliber.md:150,151`；`design/memory_model_constraints.md:35`；`design/forward_cross_source_resolution.md:237,312,525,673` | 默认 768 MiB 门运行器（`:13-26` env、`:45-71` summary）；**`:46` 把摘要首行写死 `gate=default(768MiB)` ＝ 融合层 §6.2 缺陷 F1**（内核线在飞件，本席只登记不改） |
| `r9/patch_preflight.py` | 9,585 | `1a310dc87303e48b` | 12 处：`AGENTS.md:26`（每轮补丁强制）、`design/time_model_structural.md:313` | 四查：注解贴紧 / 注解位移 / 空套件 / 括号平衡；2026-09-12 事故的唯一机械闸 |
| `MANIFEST.sha256` | 48,315 | `0803386711b174c5` | 17 处（`design/authority_invalid_triage.md:196,439`；`design/s1b_impl_progress.md:6,305,386`；`design/s1b_step3_progress.md:107,258,584` …） | 全树哈希锚；与 `r5\|r6\|r7\|r8/MANIFEST*.sha256`（8 件）构成验收哈希链 |
| `r9/gate_r9.sh` | 3,799 | `e07371a882bcfdec` | 5 处：`design/deterministic_model_derivation.md:994`、`design/forest_window_caliber.md:235` | `ROOT` 覆写判 `acceptance/diagnostic`（`:11-12`，被 `forest_window_caliber.md:235` 判为与抬门事实冲突） |
| `r{3,5,6,7,8}/gate*.sh` | 2,161–2,937 | `1444af63…` / `f70da28b…` / `b6a8754a…` / `0d6c0228…` / `e7eb61d2…` | `design/pair2_typearena_symbol_join.md:99`、`design/s1b_step3_progress.md:505,1411,1416,1580` | 逐轮门运行器 |

**下一个可能消失且后果最重的一件（明确警示）**：**.rebuild/s1b_step3/check_acceptance.py**（sha256 `d88f3463baa6db8befd4ae202b234c63d6648eda7450ba7866aac435683c0eec`，3,897 B）。

判据三条：① 它是全仓**唯一**的机械验收判词计算器，`docs/cheng-plan.md:726/985` 与 RSI 档 3 合同把它写成流程本体而非附件；② 本轮机械判定：无 git 追踪孪生、无同名后代、无文档内嵌全文 ⇒ 只有 `.rebuild/` 一份；③ 融合层命题「判据、仪器、账本三者只允许一份」＋ `corpus_tier3_contract.md:91,265` 明文「属冻结件、RSI 侧无权私改、不得第二份」⇒ 一旦丢失**不允许**旁路再造，必须先裁定再重建，代价从"重跑一次"升级为"重走一次判据冻结"。

**次席且更迫近**：`.rebuild/s1b_step3/r9/patch_preflight.py`（`1a310dc8…`，9,585 B）——它是 `AGENTS.md:26` 对**每一轮补丁**的强制前置（当前内核 C2 线正在产补丁、A5/A8 两个 patch 的 V0–V8 待验证），丢失后 2026-09-12 的静默所有权翻转事故重新失去机械闸；它排在次席只因本轮风险分层按"验收判词 > 复现"归类。

## 5 抢救集 `frozen/`（结构与登记）

```text
frozen/
├── FROZEN_MANIFEST.tsv     # 433 行数据 + 头注释（列见下）
├── verify_frozen.sh        # 一致性校验器（§6）
└── s1b_step3/**            # 433 件 U 类副本，镜像 .rebuild/s1b_step3/ 相对路径
```

- `frozen/` **只放** U 类判据件副本 + 清单 + 校验脚本；未放 G/Z/D（指针与理由见 §3），未放二进制/大件（本轮无）。
- 复制保留 mode + mtime：`frozen/s1b_step3/r9/patch_preflight.py` 等脚本保持可执行位与原始 mtime，便于取证。
- 清单列（TAB 分隔）：`frozen_rel`、`source_abs`、`sha256`（**本轮对该副本实算**）、`bytes`、`mtime_iso`、`birth_iso`（首次出现）、`tier`、`role`、`manifest_sha256_attest`（与既有 `MANIFEST.sha256` 的一致性：match/differs/absent）、`doc_refs`（引用它的文档坐标，`文件:行;…`，上限 40）。
- `birth_iso` 为 APFS 创建时间（首次出现的最强可得证据）；无更早回执时不外推。
- 148/433 件有文档引用坐标；其余 285 件无任何文档引用（"无人引用的诊断件"），仍按 U 全量冻结（fail-closed：不因"看起来没用"而丢弃）。

## 6 校验脚本与实测回执

`frozen/verify_frozen.sh`（可执行，**只读**；不写任何文件、不碰 `.rebuild/`）：

- 主判据：逐件重算 `frozen/` 副本 sha256 与清单比对；对**仍在盘上**的原件 `cmp -s` 逐字节比对；扫出 `frozen/` 内未登记文件；核对清单行数与 `# frozen_files` 声明。
- `--coverage`：重新枚举源子树机械件，对未登记件做 G/Z 分类（G 用 `git hash-object` 对追踪 blob 索引比对，**跨文件名**），其余报 `UNCOVERED`。
- 判词与退出码（fail-closed）：`0 CUSTODY_INTACT` / `1 CUSTODY_BROKEN`（冻结侧缺件、哈希不符、未登记件、行数不符）/ `2 CUSTODY_UNVERIFIABLE` / `3 CUSTODY_INTACT_SOURCE_DRIFTED`（冻结侧完好，但原件缺失或已被改写）/ `5 COVERAGE_GAPS`。

**当场实跑（本报告撰写时，同一命令同一窗口）**：

```text
$ docs/campaigns/2026-08-31-kernel-userpath/frozen/verify_frozen.sh; echo "EXIT_CUSTODY=$?"
FROZEN_DIR=/Users/lbcheng/cheng-lang/docs/campaigns/2026-08-31-kernel-userpath/frozen
SOURCE_ROOT=/Users/lbcheng/cheng-lang SOURCE_SUBTREE=.rebuild/s1b_step3/
FROZEN_FILES=433 (declared 433)
SHA256_OK=433 SHA256_MISMATCH=0 FROZEN_MISSING=0
ORIGINALS_PRESENT=433 IDENTICAL=432 DRIFTED=1 ABSENT=0
UNLISTED=0 ROWCOUNT_MISMATCH=0
FAIL ORIGINAL_DRIFTED s1b_step3/r9/gate/b404_w7xfix.ps.tsv src=/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/gate/b404_w7xfix.ps.tsv (frozen copy is the audited snapshot; source changed after freeze)
VERDICT=CUSTODY_INTACT_SOURCE_DRIFTED frozen_files=433 originals_absent=0 originals_drifted=1 originals_identical=432
EXIT_CUSTODY=3
```

```text
$ docs/campaigns/2026-08-31-kernel-userpath/frozen/verify_frozen.sh --coverage; echo "EXIT_COVERAGE=$?"
… （前 6 行与上同：FROZEN_FILES=433 / SHA256_OK=433 / IDENTICAL=432 / DRIFTED=1 / UNLISTED=0） …
COVERAGE_ZERO_BYTE …/gate/r11.progression.tsv
COVERAGE_ZERO_BYTE …/gate/r36_trace.progression.tsv
COVERAGE_ZERO_BYTE …/gate/r37_sweep.progression.tsv
COVERAGE_ZERO_BYTE …/gate/r37_trace.progression.tsv
COVERAGE_TRACKED_TWIN …/r5/s1b_step3d_seal_treefree.patch -> docs/campaigns/2026-08-31-kernel-userpath/patches/s1b_step3d_seal_treefree.patch
COVERAGE_TRACKED_TWIN …/r6/stageA.patch -> docs/campaigns/2026-08-31-kernel-userpath/patches/s1b_step3e_global_rows.patch
COVERAGE_TRACKED_TWIN …/r7/enum_variant_source_fix.patch -> docs/campaigns/2026-08-31-kernel-userpath/patches/s1b_step3h_enum_variant_producer_source.patch
COVERAGE_ZERO_BYTE …/r9/ab_probe_const_only.A.sha
COVERAGE_ZERO_BYTE …/r9/ab_probe_const_only.B.sha
COVERAGE_ZERO_BYTE …/r9/ab_probe_lit_arith.A.sha
COVERAGE_ZERO_BYTE …/r9/ab_probe_lit_arith.B.sha
COVERAGE_ZERO_BYTE …/r9/ab_probe_struct_literal.A.sha
COVERAGE_ZERO_BYTE …/r9/ab_probe_struct_literal.B.sha
UNCOVERED /Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/gate/c2d_raised_diag.ps.tsv size=14361
UNCOVERED /Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/gate/c2d_raised_hardcut.ps.tsv size=2259
COVERAGE_TRACKED_TWIN …/s1b_1c_seal_arena.patch -> docs/campaigns/2026-08-31-kernel-userpath/patches/s1b_1c_seal_arena.patch
COVERAGE_TOTAL=449 LISTED=433 NEW_U=2 NEW_G=4 NEW_Z=10
VERDICT=COVERAGE_GAPS uncovered=2 (re-run the rescue pass for these)
EXIT_COVERAGE=5
```

**如何读这两个非零退出**：exit 3 与 exit 5 **不是脚本故障**，而是本轮确立的两条事实——(a) 源目录是活的，快照后原件会被并发 lane 改写；(b) 审计快照之后源目录又长出新的判据件。两者都必须非零（fail-closed），但判词把"冻结侧被篡改（exit 1）"与"源侧漂移/增量（exit 3/5）"分开，避免把正常演化误读为保管事故。

## 7 引文蒸发全景（本轮实测）

文档集 = 树内在盘的 `.md/.txt/.cheng/.c/.h/.py/.sh/.json/.rs` 共 **15,751** 件（排除 `.rebuild/` 自身与 `frozen/`，避免自指）。

| 口径 | 不同 `.rebuild/` 引用路径 | 仍存在 | 已消失 | 悬空率 |
|---|---|---|---|---|
| 在盘全部文档（本轮主口径） | 319 | 206 | **102** | **32.0%** |
| 仅 git 追踪文档（同轮对照口径） | 180 | 80 | **94** | **52.2%** |

- `.rebuild/` 整体被忽略（`.gitignore:343`）⇒ **任何**"只放 `.rebuild/` 的待验证清单"都在持续退化；`theory_emit` 是其中最重的一族（§1），且已经在 `.rebuild/s1b_step3` 内部又出现 5 个悬空引用：`r9/disc_ma_r22.stderr.txt`、`r9/patchgen/.scratch/base.cheng`、`r9/patchgen/.scratch/`、`diag/diag.log`、`r4/kd_r4`。
- 融合层 §1.1 直接引用的 `.rebuild/s1b_step3/r9/gate/r104_recov.summary.txt` **本轮实测在盘**（2,327 B，mtime 2026-09-13 06:07，首行 `label=r104_recov driver=kd_r104 gate=default(768MiB) rc=125 wall=261s`）——但它在 `.rebuild/` 内，属于**同一风险面**。
- 已确立的通用纪律（融合层 §6.1 A7 结论）本轮再次验证：**可执行脚本本身必须落在 git 可追踪路径**。`frozen/` 即为此而建：它是 `docs/` 下的新目录（**当前未跟踪，需由主线 commit 才真正进入 git**）。

## 8 活目录快照边界（本轮实测）

- `find .rebuild/s1b_step3/r9/gate -type f -newermt '-60 minutes' | wc -l` = **94**（审计窗口内被写）。
- 漂移实证：`.rebuild/s1b_step3/r9/gate/b404_w7xfix.ps.tsv`——冻结副本 11,207 B / sha256 `17b9f913…`（birth 2026-09-13 08:44:39），核对时原件 18,148 B / sha256 `56fa7355…`（mtime 08:54:31）⇒ exit 3 的直接来源。
- 增量实证：`c2d_raised_hardcut.ps.tsv` 在三分钟内 **936 → 1,314 → 2,259 B** 增长（09:12:56 / 09:13:25 / 09:14 三次 `stat` 读数），`c2d_raised_diag.ps.tsv` birth 09:05:08 ⇒ 这两件是**在飞轮的未定读数**，按 §2 活性判据**不冻结**，由 `--coverage` 报 gap。
- 结论：**在 `.rebuild/s1b_step3` 上的任何"清点"天然是快照**。重跑口令：`verify_frozen.sh --coverage`（报增量）→ 在静窗内重跑抢救规程（§11）。

## 9 未验证 / 未钉（逐条）

1. **`.rebuild/` 其余面未清点**：除 `s1b_step3` 外，`.rebuild/` 下另有 **608 件**机械件、1,170,031 B（`b_line` 496、`b5_line` 22、`c2_line` 12（活）、`c3_line` 9、`c_line` 8、`rsi_a9a` 7、`rsi_batch9` 4、`rsi_tier3` 2，及 `.rebuild/` 顶层 `selfbake_*.sh` 等）。**未逐件判三态、未抢救**。
2. **判据回执未抢救**：`*.summary.txt` 169 份 / 303,595 B（小、可整批救）、`*.txt` 2,033 份 / 238,785,159 B、`*.log` 48,840,818 B（大、需按引用筛选）。文档按名引用其中 21 个 `.rebuild/s1b_step3` 文本路径（本轮实测全部在盘）。这些是**读数**不是脚本，丢失后果 ＝ 文档数字变成不可复核的引文（`theory_emit` 的数字面同样已蒸发）。
3. **D=0 的适用边界**：只做了"追踪文档内嵌全文"的机械筛查（≥80% 行覆盖）＋ 1 件人工核对；未逐件审计"是否有别处（补丁/回执/生成器）能重建"。因此 `D=0` 应读作"**在本判据下**无可再生依据"，不是绝对断言。
4. **role/tier 是分拣标签**：由文件名规则机械赋值（§4），未做逐件语义审计；`other-script` 84 件里可能混有 T1 级件（例如未带 `gate` 前缀的判词脚本），未逐件复核。
5. **frozen/ 尚未进 git**：本任务禁 commit，`frozen/` 现为未跟踪目录；"进 git 后可恢复"这一环**未验证**（清单与校验脚本已就位，任何时点可复核）。
6. **`r6/write_report.py` 的文档内嵌一致性**只做了行覆盖（98/101），未逐字节比对 `TEXT` 块与文档正文。
7. **清理归因未钉**：`.rebuild/theory_emit/`、`.rebuild/remap_exp/`、`.rebuild/run_b5/`、`.rebuild/s1b_impl/` 各自被谁/何时清掉**未钉**（无清理日志）。唯一在盘的清理脚本 `.rebuild/disk_cleanup_old5.sh` 只删 `/Users/lbcheng/cheng-f24/{seqbridge,kfreplay,annotrel,owalls,ppf}`，与本树无关 ⇒ 排除该脚本为成因，但成因本身未定。
8. **RSI 侧在飞件的判据面未审**：`src/rsi/compiler_domain.cheng`、`src/tools/rsi_gate.cheng` 是工作树在飞件（禁改禁动），本轮只引用了它们对 `check_acceptance.py` 的依赖，未审计 RSI 侧是否另有只活在 `.rebuild/` 的判据件（`rsi_c2_caliber/`、`rsi_batch9/` 已计入 §9-1 的 608 件）。

## 10 阻塞

无。本任务无编译/槽位依赖，全程未抢 `COMPILE_SLOT.lock`、未写入 `.rebuild/` 任何字节。

## 11 重跑规程（判据是规则，不是脚本）

本轮抢救脚本与清点脚本为**任务级临时件，已按纪律删除**（`tools/cheng_scratch_scope.sh` 生命周期；`.scratch/b2_custody/` 任务尾删除）。需要重跑时按以下规则复算（每步只读源、只写 `frozen/`）：

1. 枚举：`find .rebuild/s1b_step3 -type f`，按 §2 的扩展名/前缀规则取机械件集合。
2. 追踪哈希索引：`git ls-files -z` 全量 → 逐件 sha256（10,819 件 / 647,336,221 B，实测约 10 s）。
3. 逐件读两遍、哈希一致才落盘（X 判据）；分类 `G/Z/U`（§2 规则）。
4. 复制 U 到 `frozen/s1b_step3/<相对路径>`，保持文件名与 mode/mtime；`sha256` 取**副本自身**的实算值（禁止用枚举期的旧哈希——本轮 v1 正是因此被 `verify_frozen.sh` 当场抓出 1 件漂移，见 §8）。
5. 文档坐标：扫描在盘文档集（排除 `.rebuild/` 与 `frozen/`），记录 `文件:行`（上限 40/件）。
6. 写 `FROZEN_MANIFEST.tsv`（原子替换：`tmp` + `os.replace`）。
7. 校验：`frozen/verify_frozen.sh` 与 `frozen/verify_frozen.sh --coverage`；两者任一非零都**不得**当绿。

> 建议（本席无权新建该文件）：把第 1–6 步的抢救脚本正式落到 `docs/campaigns/2026-08-31-kernel-userpath/tools/`（该目录已存在，git 可追踪），使"重跑"从规程变成可执行件；否则本规程自身仍是"文档里的引文"。

## 12 交付物实测回执

三件交付物在**本报告写定后**的实算回执（2026-09-13T09:16:22）：

| 交付物 | bytes | sha256 |
|---|---|---|
| `frozen/FROZEN_MANIFEST.tsv`（433 行数据 + 头注释） | 142814 | `678495b174f754c10ba91782102812121199e135fef70560997b6c14584107ff` |
| `frozen/verify_frozen.sh` | 7648 | `1760ec7444ece15e56fcd349f588d4b18599a25d952a795dcde93b99a35906f2` |
| `design/judgement_machinery_custody.md`（本文） | 自指不内嵌 | 见最终交付回执 |

抢救副本计数复核：`find frozen/s1b_step3 -type f | wc -l` = **433**（与清单 433 行一致）；副本字节合计 = **6417687**；机械件分类合计 = G 4 / Z 10 / U 433。


## 附录 A 全量清单（447 件机械件；U 类 433 件已冻结）

列义：`cls` = G/Z/U（§2）；`tier` = T1-verdict / T2-reproduce / T3-diagnostic（§4）；`sha256` 为 U 类在 `frozen/` 副本上的本轮实算值（G/Z 类给源件值，仅作登记）；`refs` = 引用坐标数（完整坐标见 `FROZEN_MANIFEST.tsv` 的 `doc_refs` 列）。


| # | 路径（`.rebuild/` 下相对路径） | cls | bytes | sha256 | tier | role | refs |
|---|---|---|---|---|---|---|---|
| 1 | MANIFEST.sha256 | U | 48315 | `0803386711b174c530a58c7693c024d5e9c0bbc2de38cc253d6824ae4e680d13` | T1-verdict | hash-record | 17 |
| 2 | MANIFEST_r6.sha256 | U | 7156 | `9f4eec86b72f76a4995e5f1734a1862ff7ea2efef22f7588793df66e4ddfb0a4` | T1-verdict | hash-record | 0 |
| 3 | ab_arena_prep.sh | U | 4592 | `25c434e0069d8df6038bb792c88769e72bbfe42e21680a8dfd97814cb825f9cc` | T2-reproduce | ab-pair-runner | 3 |
| 4 | authority_entry.py | U | 4061 | `9742c41c0900be903d50b9fdfda34c7647ec2e7c5d3d249b2b5b2fda3d39f560` | T2-reproduce | other-script | 0 |
| 5 | authority_to_arena.py | U | 17000 | `31da23ca1cd49d7c47c16d4d2ccf2f06f694064c58c5bea01fe7bdf23d675a59` | T2-reproduce | other-script | 0 |
| 6 | battery.sh | U | 3809 | `55bb66a5a52b4a31699ea9240fa7906c9af25823d897102ed15c6830bfb334e4` | T2-reproduce | other-script | 1 |
| 7 | battery2.sh | U | 3520 | `9c03eb4fcbfb358c59d58ed65f29ab7292547a017124bb3a32c8cea2636daf4e` | T2-reproduce | other-script | 0 |
| 8 | check_acceptance.py | U | 3897 | `d88f3463baa6db8befd4ae202b234c63d6648eda7450ba7866aac435683c0eec` | T1-verdict | verdict-checker | 18 |
| 9 | converge.sh | U | 2006 | `6fbe6a14086d98dfc2a7d54255942f5a0b8544faf9beb8efcb1cdd9f436b7608` | T2-reproduce | converge-runner | 1 |
| 10 | diag_raised_gate.sh | U | 2033 | `c67695c4653db2846d921988e0dc3fd965db9a19fdfa9e958b53654130c06178` | T3-diagnostic | diagnostic-probe | 2 |
| 11 | gate/default768_step3.progression.tsv | U | 83750 | `0c1e2161fb24caada43afce3280030f396dd7c3a2131198e1210bedcde3357df` | T3-diagnostic | criteria-data | 0 |
| 12 | gate/default768_verified.progression.tsv | U | 83750 | `0985ec58fa3a89c2f07b745c24e3c0841a94d55a153a93c9c6ca58c5df1fd39e` | T3-diagnostic | criteria-data | 0 |
| 13 | gate/r11.progression.tsv | Z | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | - | criteria-data | 0 |
| 14 | gate/r11b.progression.tsv | U | 77107 | `4a3b69cf69df931d2b74cd59f6c7c635346cc218c7925b8c83e4860a79b8ba00` | T3-diagnostic | criteria-data | 0 |
| 15 | gate/r14.progression.tsv | U | 77225 | `56c188af519d068123bc46e2020371c98114d55e691282a0e890f56e166c1dc9` | T3-diagnostic | criteria-data | 0 |
| 16 | gate/r16.progression.tsv | U | 77227 | `85efbb9dd652849074eceafc8377cb6397008fc262d73d0211ecbb8819401100` | T3-diagnostic | criteria-data | 0 |
| 17 | gate/r19.progression.tsv | U | 77227 | `4dc510f84a0a9fe28a9ff6e059e992d90f9b3bfb01c833415ff0b8a7a9aacff1` | T3-diagnostic | criteria-data | 0 |
| 18 | gate/r25_raised.progression.tsv | U | 51155 | `b2990e2b6985953318151fdbb4e35d76e977d6ece3a955382b4a8d1d7594b533` | T3-diagnostic | criteria-data | 0 |
| 19 | gate/r27_raised.progression.tsv | U | 80633 | `d5c9394e4b9f02128dca1a8a4912baea0114f1eedae224ac5c220909232fbe99` | T3-diagnostic | criteria-data | 0 |
| 20 | gate/r28_raised.progression.tsv | U | 80631 | `f613e53dadd0536831c6601fd9bb0dce4eb36d01a78eb899d2748ed453ad9219` | T3-diagnostic | criteria-data | 0 |
| 21 | gate/r28_trace.progression.tsv | U | 80631 | `e4795917622a6f5448eb6b17f4f968b937581ca5a28163bb8fed66d65cabd903` | T3-diagnostic | criteria-data | 0 |
| 22 | gate/r29_raised.progression.tsv | U | 81254 | `336fed93120b28e016bb9c5d199d179a440ae6f990ca4fd80bee9766a8b27444` | T3-diagnostic | criteria-data | 0 |
| 23 | gate/r30_raised.progression.tsv | U | 81254 | `b37ec60c56420cbee22929f6f53658deb2cc7b7c38c3ba766d5b69c009bd840b` | T3-diagnostic | criteria-data | 0 |
| 24 | gate/r31_raised.progression.tsv | U | 81259 | `175f7695275767a7a1e17d30e969d191b01e6dcc536e1c0d96e5c39355fdf02f` | T3-diagnostic | criteria-data | 0 |
| 25 | gate/r32_sweep.progression.tsv | U | 76067 | `4378297dc0ef7781d0ed56ed03921e5366d2f7f9a066b67ddc3a11ac7f5b3b9f` | T3-diagnostic | criteria-data | 0 |
| 26 | gate/r33_raised.progression.tsv | U | 76403 | `9fb7b0e26697fa360f0f150b39da6a5f464b9768a22235dff6bd812916c6e208` | T3-diagnostic | criteria-data | 0 |
| 27 | gate/r33_sweep.progression.tsv | U | 76067 | `08c37d3d3cab90cc4db811611de4abfc2de60452657a9dcbaf39f6d4b9aa4e7c` | T3-diagnostic | criteria-data | 0 |
| 28 | gate/r34_raised.progression.tsv | U | 95703 | `497f0af68284296f81f214b2494e7ab53762981aa04edc1a96b05b0f849b3af2` | T3-diagnostic | criteria-data | 0 |
| 29 | gate/r34_sweep.progression.tsv | U | 76068 | `7ec62ee3bbf4b799eea8d9678d2719589bb1f66b23f4f13b52de67322e1f95c8` | T3-diagnostic | criteria-data | 0 |
| 30 | gate/r35_raised.progression.tsv | U | 126570 | `8920a763c4bc983f9b4853902a42c7aca9276efb9c3b4e5528097537274400a4` | T3-diagnostic | criteria-data | 0 |
| 31 | gate/r35_recheck.progression.tsv | U | 126625 | `30d9572205db4684d9d475493612ce9a09bd4b130765e259b344e3ed4837e86a` | T3-diagnostic | criteria-data | 0 |
| 32 | gate/r35_sweep.progression.tsv | U | 126600 | `80ad117d75d16724e3f45b476e50b7f48a01b786264d0e9bcdcf1ed9a7ff1444` | T3-diagnostic | criteria-data | 0 |
| 33 | gate/r36_trace.progression.tsv | Z | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | - | criteria-data | 0 |
| 34 | gate/r37_sweep.progression.tsv | Z | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | - | criteria-data | 0 |
| 35 | gate/r37_trace.progression.tsv | Z | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | - | criteria-data | 0 |
| 36 | gate/r38_sweep.progression.tsv | U | 76916 | `9b138404545f533be534c5b7970945ebaa015afc390e15bdd8a59bc4b475f3e6` | T3-diagnostic | criteria-data | 0 |
| 37 | gate/r38_trace.progression.tsv | U | 76917 | `e7a78039d2a8b783e0ea8b9933e0c3b439ab104aed41f1902aa4b01ea8ab0ba2` | T3-diagnostic | criteria-data | 0 |
| 38 | gate/r39_trace.progression.tsv | U | 76919 | `9557e167e83acb0ebd1f20c2ad3f0422da9d8c23bdc911c4df441fcbca2c3e72` | T3-diagnostic | criteria-data | 0 |
| 39 | gate/r41_raised.progression.tsv | U | 43407 | `7657f2cbbb8712bae4755f501919ce409f33b1fab954ebc7944b7685a9e233eb` | T3-diagnostic | criteria-data | 0 |
| 40 | gate/r42_raised.progression.tsv | U | 76402 | `a1a4203b9b71f81fd123d9df980277b82b72a654aa1c89a6e7cb4c351e915e6f` | T3-diagnostic | criteria-data | 0 |
| 41 | gate/r43_raised.progression.tsv | U | 76402 | `54bc78bd720d2069462baa2e323e080e00e6457f4898615d6b993c8e9d7a9bdc` | T3-diagnostic | criteria-data | 0 |
| 42 | gate/r45_raised.progression.tsv | U | 76920 | `b112dcc8eadc836adc17914d04ad89c19c1893d1071f4de94058b0f6878505c3` | T3-diagnostic | criteria-data | 0 |
| 43 | gate/r45_recheck.progression.tsv | U | 76932 | `1d747b3d39158b263abc99820d1e80d59dc7bb399c664446d70089254a295adb` | T3-diagnostic | criteria-data | 0 |
| 44 | gate/r50_raised.progression.tsv | U | 126669 | `1c11a2da7ce7234850ee6721808da171ff563f62c7373880a4a52c76e0fd7f84` | T3-diagnostic | criteria-data | 0 |
| 45 | gate/r50_sweep.progression.tsv | U | 126679 | `e4a28ac059cc831ad3377d329a5a60bc722b88a47bb2303b4a18308cba560d75` | T3-diagnostic | criteria-data | 0 |
| 46 | gate/r51_raised.progression.tsv | U | 126603 | `0d42f1b643089a1c8011618a5815b76cf3f38b816575efaeb3b1477dffa863a7` | T3-diagnostic | criteria-data | 0 |
| 47 | gate/r52_raised.progression.tsv | U | 126624 | `c002a37d8e48e7f1b62dd8b14f82732887344507b975d12810fc7f8d335eb43a` | T3-diagnostic | criteria-data | 0 |
| 48 | gate/r9g.progression.tsv | U | 76490 | `b01422d3e571e70a5122366910cf9037e147e12150e886fef4f1bd5668619f7e` | T3-diagnostic | criteria-data | 0 |
| 49 | gate/r9z.progression.tsv | U | 77105 | `b9e37f0c34dc9523bdf82d97ccf500ef987261d9b6322bc75d581dac88f93868` | T3-diagnostic | criteria-data | 1 |
| 50 | gate/r9z2.progression.tsv | U | 43410 | `357cd7146bbbc88f0844242e8166fd290831fc994734c42d233f16d9a3b349b6` | T3-diagnostic | criteria-data | 0 |
| 51 | gate_run.sh | U | 3459 | `6725b43c7af239d756b974b75a214c69ad3b39f5e4ce2a4bc176286b1b972791` | T1-verdict | gate-runner | 33 |
| 52 | make_prep_patch.py | U | 1076 | `381e2c0b918c3f39bfb593ce1b56690ffc6c576a64865eac14d6fa9b05305d60` | T2-reproduce | other-script | 0 |
| 53 | package_authority.py | U | 2970 | `5d6cc16f41cad0f5933dc790d3fc37c4f803ce625a98421b7ad7747b22c41fa4` | T2-reproduce | other-script | 0 |
| 54 | r3/ab_r3.sh | U | 4732 | `ab46bda5a461d423b430d1003aa41a28c9fd856e4e1ad9872a035ddfeb0dc9ff` | T2-reproduce | ab-pair-runner | 1 |
| 55 | r3/ab_v6_retry.sh | U | 2116 | `f3c9c0522d9f20822e59b50f14dd2081817546df8caf8d876aef16d458c5c469` | T2-reproduce | ab-pair-runner | 0 |
| 56 | r3/bake_r3.sh | U | 925 | `74d7b9e3d9484af0b05e48e8226856eb2e6f62f5553c0cb10ec34280bb8ce467` | T2-reproduce | bake-driver | 1 |
| 57 | r3/converge_r3.sh | U | 1374 | `f2ce925b01d2149933ddcf052f1c779fed4f62ee4f9129afa914f0d63c8fac81` | T2-reproduce | converge-runner | 2 |
| 58 | r3/diag_limits.sh | U | 1803 | `ae7f8a2e89fc9d07f21d477e5e1bb0bbed2fd67467670776ec58ebb93f070414` | T3-diagnostic | diagnostic-probe | 1 |
| 59 | r3/entryprobe.sh | U | 728 | `b5803af64f6ca09f1c20d6eecede362f906bcfdb77300462a317e7200c5487df` | T3-diagnostic | diagnostic-probe | 0 |
| 60 | r3/envcheck.sh | U | 1394 | `24ab223d10f2685393518185f6fa6597feeacafb0739f09a46b7eac04d398566` | T2-reproduce | other-script | 0 |
| 61 | r3/gate_pair_r4.sh | U | 2161 | `1444af63bc461ab5b273833265969975d9846d4dd163025efdb08c4cdfa7e5fb` | T1-verdict | gate-runner | 0 |
| 62 | r3/gate_run_r3.sh | U | 2312 | `e4c67551e9056cf157607a9a54e04a824f09a4f148c8741567783b39968132f0` | T1-verdict | gate-runner | 1 |
| 63 | r3/mkbase.py | U | 1950 | `f65d8899eb70e4171081c83779750c1acc4fc9fabb945029f3ebc538b069e72e` | T2-reproduce | patch-generator-or-checker | 0 |
| 64 | r3/mkpatch.py | U | 1250 | `5b5b4a6140c48c9d22719a4679a3fa299230e23d94dea1345f45226b7b45194b` | T2-reproduce | patch-generator-or-checker | 1 |
| 65 | r4/ab_r4.sh | U | 4740 | `b37bd53db285c40a698a436b1599c82d68cc10b3dd8d2e58e6a6ad9c855b0c4b` | T2-reproduce | ab-pair-runner | 0 |
| 66 | r4/converge_r4.sh | U | 1727 | `092892e71faa7a0a61c6d08279bad897e7ccfd58abd775ba1b9082206105ad54` | T2-reproduce | converge-runner | 1 |
| 67 | r4/manual_single.sh | U | 2116 | `bcddf9e71944b995ff2d94ede51388a563b8359af3d6d1f35a44b53fcd360fdf` | T2-reproduce | other-script | 1 |
| 68 | r4/mkpatch_r4.py | U | 1156 | `18c887420f52d1d026897cb1f2070bb1439af4dcf28bad701531c13cb6ed676a` | T2-reproduce | patch-generator-or-checker | 1 |
| 69 | r5/MANIFEST_r5.sha256 | U | 13409 | `f454ca9d3209fb5bbfe42e970c6885f9a043c46921b9060818d9f4339e8e04e6` | T1-verdict | hash-record | 0 |
| 70 | r5/ab_r5.sh | U | 4790 | `52c6cb6b956abc5413addb6ff71b979deb34125158cf6892fedfc5be86ccd7d5` | T2-reproduce | ab-pair-runner | 0 |
| 71 | r5/bake_r5.sh | U | 1081 | `aedc5952afb0f3c9c682be8e7e4765744c5ab6ccfda7f19a1ee2a6ba1ce1b08e` | T2-reproduce | bake-driver | 4 |
| 72 | r5/converge_r5.sh | U | 2023 | `e6c093660b8d0c13355c50fd71793507ad72272f62f43e82d47511c4cce39a93` | T2-reproduce | converge-runner | 1 |
| 73 | r5/gate_r5.sh | U | 2611 | `f70da28b905ab48c9e90961056a98df2800e6e2401c986b751325e2449297356` | T1-verdict | gate-runner | 0 |
| 74 | r5/make_manifest.sh | U | 945 | `f641a5d8f47f7dc613b021f33399d05f5c6c4185907ab7396209a8fe77fd1482` | T2-reproduce | other-script | 0 |
| 75 | r5/mkpatch_r5.py | U | 1261 | `dfa9a2d0690801e2fbc9232145b9716947584eab86e5d286e8274d1de2617ef4` | T2-reproduce | patch-generator-or-checker | 1 |
| 76 | r5/s1b_step3d_seal_treefree.patch | G | 48020 | `b308e6bf5b74774ede34aa3dc3f8933e7ea3bc1bc72c7b18188f7b403e980539` | - | patch-artifact | 3 |
| 77 | r5/seal_bad.patch | U | 2510 | `ee176f0a4d2809569bb1700fc8b390b59e83e2c64810ec71c440ac5bd6c82647` | T2-reproduce | patch-artifact | 1 |
| 78 | r5/seal_ok.patch | U | 30791 | `4969c7770bbd476caa2469b51519669c4e54c6fe596c2707f1fce30b3ae02926` | T2-reproduce | patch-artifact | 2 |
| 79 | r5/split_patch.py | U | 1993 | `d5f2ac87c4e4f5232cff63458d5d5c3ec25921166fab4a20f46eeca9922ce9fc` | T2-reproduce | other-script | 5 |
| 80 | r5/stage2_edit.py | U | 13096 | `8bf688ddce257776c8aef898dcf0c02185b259c9cd4f2cf4bde992c08e8cd635` | T2-reproduce | other-script | 1 |
| 81 | r5/stage2_only.patch | U | 14738 | `9cc9aa0724fd8eb32039f850b1a02b3aeeeb18ac7f206c4d7d79f6929b77faf6` | T2-reproduce | patch-artifact | 1 |
| 82 | r5/v6_retry.sh | U | 1772 | `2d4f1178f53fccdc39ec6596cf8d6e5f06f6d6111619cb21b21b86ccafcade75` | T2-reproduce | other-script | 2 |
| 83 | r6/MANIFEST.sha256 | U | 7750 | `e218e80d5b44d9c3a1be4744beef3f9d0d33e1f2df003e7ce4294c7f3fe60e67` | T1-verdict | hash-record | 17 |
| 84 | r6/ab_r6.sh | U | 4790 | `1824f28d011896bc0109f57c7afd7ef16c0c3ddfb4dbb087b4314293668a4748` | T2-reproduce | ab-pair-runner | 1 |
| 85 | r6/bake_ctl_r6.sh | U | 1932 | `32b84765bda74fa0fe2e5fd8620702aa950e0db11dc6337499cfe8c433d3e110` | T2-reproduce | bake-driver | 2 |
| 86 | r6/bake_r6.sh | U | 1081 | `61df5c30c171474054edf1834fc7feecb80e5806115bdc47f9841bd6c0bd848d` | T2-reproduce | bake-driver | 3 |
| 87 | r6/ctl_after.sha | U | 108 | `5e2dd17c94ebb59fdfc81b9000edc8a5427919726e8da1c83446edfe4b4950cd` | T1-verdict | hash-record | 0 |
| 88 | r6/ctl_before.sha | U | 108 | `5e2dd17c94ebb59fdfc81b9000edc8a5427919726e8da1c83446edfe4b4950cd` | T1-verdict | hash-record | 0 |
| 89 | r6/editA.py | U | 16376 | `d5f998abd6e826013b7474d452deefa8bc0668832dbe31c72cc89ba2e6f1307d` | T2-reproduce | other-script | 0 |
| 90 | r6/editA2.py | U | 7864 | `a6b7d99e550d470588713da20bd1befd62e90b9b270f77ff04e4e03fe751af0e` | T2-reproduce | other-script | 0 |
| 91 | r6/editA3.py | U | 15718 | `48a5b8a657350532e1383dff2e46df36a9a3f9c8bb9e507d838ba197995e2bc7` | T2-reproduce | other-script | 0 |
| 92 | r6/editA4.py | U | 13877 | `56dc44131b028400efe03de2cf15449d3e9d2f4b1672c286b15ff83419e4fb0e` | T2-reproduce | other-script | 0 |
| 93 | r6/editA5.py | U | 2284 | `c16b5dc6fbf213ad818ca7f57115a4ad63cedef842180c654f693790e4cafc9b` | T2-reproduce | other-script | 0 |
| 94 | r6/editB.py | U | 17320 | `71e644cf00f89675b2c2592556dba5c52a89aa70e0cb8ce2149c7dc30f6ca708` | T2-reproduce | other-script | 0 |
| 95 | r6/editC.py | U | 11339 | `00ac128960850f009e5d033e55b8cc7e2428707365c87e3936143e794cf0a8df` | T2-reproduce | other-script | 0 |
| 96 | r6/editD.py | U | 13688 | `a82882e4d33c67b59a803879d3d5e53df251d8b58cd09df84bae4cf8665db00e` | T2-reproduce | other-script | 0 |
| 97 | r6/editD2.py | U | 19147 | `ceb8455704da5c32549f3d69b523d142c0abdce4750cd32223a10b9dc7ab5f44` | T2-reproduce | other-script | 0 |
| 98 | r6/gate_r6.sh | U | 2611 | `b6a8754a82e12058298ad2ea49a25e285f903a12bf5fdaf7e11bbce1196bae7e` | T1-verdict | gate-runner | 0 |
| 99 | r6/land_r6.sh | U | 2661 | `d51defb805763b5b30420c602dfa789d5868795b4b9782fe25b2a0e023d85115` | T2-reproduce | other-script | 2 |
| 100 | r6/part_arena.patch | U | 25579 | `4a3bd53c6da0ded115124e966bc3eaec7301bacd986ae5461269dd60838d11d7` | T2-reproduce | patch-artifact | 0 |
| 101 | r6/part_csg.patch | U | 37899 | `e6c502be1b798cd72c4100d30af56c262ea3b71dca4fcf3c7c553e2a0edbb963` | T2-reproduce | patch-artifact | 0 |
| 102 | r6/part_texpr.patch | U | 9767 | `fd4414df8891a035dd249882da9b0dc53ccf7c4de810cb1e4082622987e8b1be` | T2-reproduce | patch-artifact | 0 |
| 103 | r6/stageA.patch | G | 42504 | `c49d594d801659c7ac5bc3266ff5ae3d68192d9aadf78f34482e24e6854b16fc` | - | patch-artifact | 0 |
| 104 | r6/v6_retry.sh | U | 1773 | `48d59ddd92aee012aa6a1d546673b3935f689a65b561f0cc337fb47a5f270d88` | T2-reproduce | other-script | 2 |
| 105 | r6/write_report.py | U | 20894 | `cf45c6b1b0637a063493c52bdd911933e0f1acdf07263418a8e7522e93e3a911` | T2-reproduce | other-script | 0 |
| 106 | r7/MANIFEST.sha256 | U | 21638 | `40fa9b85cfe9f66de2ad23fa4c26559ff3f29f795a3be51f1b46217eb0c4a2f4` | T1-verdict | hash-record | 17 |
| 107 | r7/ab_r7.sh | U | 4790 | `93838eea745d047b4faa2dff8e5bc1c14cf9a31ee0ef149c787e8bbd67480bdc` | T2-reproduce | ab-pair-runner | 2 |
| 108 | r7/ab_r7_enum.sh | U | 3331 | `7be3a6f9e01fb7180322bee9d00fcf706b6fd39abe796651c7f20b3f3a9cfcaf` | T2-reproduce | ab-pair-runner | 1 |
| 109 | r7/ab_r7_var.sh | U | 2232 | `ef98f94d4fad8e620009095196ce893239500c8f99a453ab123bb605bead27cc` | T2-reproduce | ab-pair-runner | 1 |
| 110 | r7/bake_r7.sh | U | 1081 | `4db01ee28f6b25c49e5f9c6b29440577a1421f4b8ba2bf722e7e5d937a56f573` | T2-reproduce | bake-driver | 6 |
| 111 | r7/enum_variant_source_fix.patch | G | 1629 | `35996b3691467733dcb47f73fc1b63260c8e4291c22e359ef627a4af0df20101` | - | patch-artifact | 0 |
| 112 | r7/envcap.sh | U | 319 | `fcd772864a5d65e973b81037a54f68f06b0d042b4c23444a0fa690e35592efe7` | T2-reproduce | other-script | 0 |
| 113 | r7/gate/b.progression.tsv | U | 76358 | `819288747ce2f5004dc2add690d078181368bd956dfbdb3f34f44d64b515319c` | T3-diagnostic | criteria-data | 0 |
| 114 | r7/gate/base.progression.tsv | U | 83754 | `01ef25a15e1a182eb696878dfb80026c46a999d8a97a1bfe0e56ff09cf691c93` | T3-diagnostic | criteria-data | 0 |
| 115 | r7/gate_r7.sh | U | 2831 | `0d6c02286a92cc588bd63e11b2acc3b238d7ccec94367f2052a9289a0407d940` | T1-verdict | gate-runner | 2 |
| 116 | r7/mk_fix_patch.py | U | 2430 | `2f0c5eb96680140772f85eb801fb48db814c0ee1be38c5d2f479898539d96da1` | T2-reproduce | patch-generator-or-checker | 0 |
| 117 | r7/pair2_r7.sh | U | 1458 | `ad362091e644122de906b3194046df5bbba3a39f8073792d7c198878713fcf17` | T2-reproduce | other-script | 2 |
| 118 | r7/probe_r7.sh | U | 1333 | `fcf92b1bf65c70d48c7363d95cdb3174b2b854a99a2297c08d43f01dab3235c7` | T3-diagnostic | diagnostic-probe | 2 |
| 119 | r7/single_r7.sh | U | 1582 | `f0f37ea71f554782d97d0e5e272d0c87b2127925fc38e5312734620e5bec7000` | T2-reproduce | other-script | 1 |
| 120 | r8/MANIFEST.sha256 | U | 20524 | `76ab20515a4f0a9f217f991481015218768ce0fa60afecd36f659d845f77c5cf` | T1-verdict | hash-record | 17 |
| 121 | r8/ab_r8.sh | U | 5345 | `ab68e0d5c5a913c25bf79566d7c5afcf0bbcb4ed3684928ad2148b1607271086` | T2-reproduce | ab-pair-runner | 3 |
| 122 | r8/ab_repro_r8.sh | U | 1682 | `0351eb9c6c48a94fada8f05119a65edcb3e134374699e6b37689e3ab97f12226` | T2-reproduce | ab-pair-runner | 2 |
| 123 | r8/append_section14.py | U | 5249 | `6001c665fffc6666cae8c1facd0431044bb21aefa04eaea89b476e934af7119d` | T2-reproduce | other-script | 0 |
| 124 | r8/bake_r8.sh | U | 1081 | `78cd558801ad14164f3e8d5df6d38980f41e994eb3257f26b1688e0218e85907` | T2-reproduce | bake-driver | 5 |
| 125 | r8/envcap.sh | U | 319 | `fcd772864a5d65e973b81037a54f68f06b0d042b4c23444a0fa690e35592efe7` | T2-reproduce | other-script | 0 |
| 126 | r8/gate/fix2.ps.tsv | U | 7803 | `df50daa296f82217d1882eff64aba5c5b95c9c350af10f7e346c52e5b9d1e9cd` | T3-diagnostic | criteria-data | 0 |
| 127 | r8/gate/fixed.ps.tsv | U | 6920 | `a246dcfa3eeca6b52038d1151714ec84b54192e674da70a42c479018e5d650b2` | T3-diagnostic | criteria-data | 0 |
| 128 | r8/gate/preA.ps.tsv | U | 10931 | `ed8b75f0add85b858c324c88349bb43c453d04314533cea480362dc9cd1f45b8` | T3-diagnostic | criteria-data | 0 |
| 129 | r8/gate/probe1.ps.tsv | U | 8079 | `5e08f70d091a94f640106da81a399858e9d63cef6883b6e103374c8aaa8b969c` | T3-diagnostic | criteria-data | 0 |
| 130 | r8/gate_r8.sh | U | 2937 | `e7eb61d29bb946be97fe519737fdd94b34e94f49049e5b6afae72194f1eba27b` | T1-verdict | gate-runner | 5 |
| 131 | r8/leaseprobe.py | U | 409 | `fd3785b1088fd0c549828555b69a923faa340e456c0d00c2939f71041865a126` | T3-diagnostic | diagnostic-probe | 2 |
| 132 | r8/mkfixpatches.py | U | 8705 | `0807e1f5d7092f4c67e420d106e7856b4dac879f49e6b86a89c9f356fae7633d` | T2-reproduce | patch-generator-or-checker | 0 |
| 133 | r8/mkmanifest.sh | U | 710 | `92059b9591a6154949e0e1efd4c8d8afe7d0a55fdd1710d80369c173c0c7138a` | T2-reproduce | other-script | 0 |
| 134 | r8/pair2_r8.sh | U | 1605 | `a749761126f61cbc9c3903fca1005312e32be842208f2c37ceaf85f9a0343735` | T2-reproduce | other-script | 5 |
| 135 | r8/sync_section14.py | U | 569 | `3446d31ea37585f4d8468bca8f086d606119555aa72d6c14ef33daf59f73e860` | T2-reproduce | other-script | 0 |
| 136 | r8/take_slot.sh | U | 2487 | `a7e43dd56cafbc0046fbc88332b88de7ffedd67fdae50f6896dd0b043688cf92` | T2-reproduce | other-script | 0 |
| 137 | r8/tree_r8_fix2probe.patch | U | 260927 | `22f26e55c52a137ed9dead3939172d64420834b429522ff9c55d4480f6b78f06` | T2-reproduce | patch-artifact | 0 |
| 138 | r8/tree_r8_fixprobe.patch | U | 257718 | `b4f92ac4be88f97373043af117fe894845278ad9014dff93c9c87f32682606e1` | T2-reproduce | patch-artifact | 0 |
| 139 | r9/ab_call_fixture.A.sha | U | 65 | `c05fa921b1ca192be00bdc8306039b0e2d1ebaae4fbb5f1f7d43ef7ca25b6279` | T1-verdict | hash-record | 0 |
| 140 | r9/ab_call_fixture.B.sha | U | 65 | `c05fa921b1ca192be00bdc8306039b0e2d1ebaae4fbb5f1f7d43ef7ca25b6279` | T1-verdict | hash-record | 0 |
| 141 | r9/ab_cold_nested_fmt_interpolation_smoke.A.sha | U | 65 | `b62fc0c15208baad0c4dd3ddfef88cfe2034e1d636589d61428ebb33bc6e1b46` | T1-verdict | hash-record | 0 |
| 142 | r9/ab_cold_nested_fmt_interpolation_smoke.B.sha | U | 65 | `b62fc0c15208baad0c4dd3ddfef88cfe2034e1d636589d61428ebb33bc6e1b46` | T1-verdict | hash-record | 0 |
| 143 | r9/ab_compare.py | U | 2543 | `f8c77e4f74ba420fde63fae47e61580d29aca0b866dfeeb07c40ee2f98dca730` | T2-reproduce | ab-pair-runner | 0 |
| 144 | r9/ab_ordinary_zero_exit_fixture.A.sha | U | 65 | `244fcd80e07a6192a7459b6756cf6f16c943f028d6141f5ef0298b4104378d20` | T1-verdict | hash-record | 0 |
| 145 | r9/ab_ordinary_zero_exit_fixture.B.sha | U | 65 | `244fcd80e07a6192a7459b6756cf6f16c943f028d6141f5ef0298b4104378d20` | T1-verdict | hash-record | 0 |
| 146 | r9/ab_probe_const_only.A.sha | Z | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | - | hash-record | 0 |
| 147 | r9/ab_probe_const_only.B.sha | Z | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | - | hash-record | 0 |
| 148 | r9/ab_probe_lit_arith.A.sha | Z | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | - | hash-record | 0 |
| 149 | r9/ab_probe_lit_arith.B.sha | Z | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | - | hash-record | 0 |
| 150 | r9/ab_probe_local_only.A.sha | U | 65 | `57da4bd8a49e35c343fc10874deda964d88ada712a2aa5c5574882d333932e81` | T1-verdict | hash-record | 0 |
| 151 | r9/ab_probe_local_only.B.sha | U | 65 | `57da4bd8a49e35c343fc10874deda964d88ada712a2aa5c5574882d333932e81` | T1-verdict | hash-record | 0 |
| 152 | r9/ab_probe_ordinary.A.sha | U | 65 | `e9435aade1df3f2eb0bc98e801d1be37c879aaef52597ad28cd9b642797d4371` | T1-verdict | hash-record | 0 |
| 153 | r9/ab_probe_ordinary.B.sha | U | 65 | `e9435aade1df3f2eb0bc98e801d1be37c879aaef52597ad28cd9b642797d4371` | T1-verdict | hash-record | 0 |
| 154 | r9/ab_probe_struct_literal.A.sha | Z | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | - | hash-record | 0 |
| 155 | r9/ab_probe_struct_literal.B.sha | Z | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | - | hash-record | 0 |
| 156 | r9/ab_r9.sh | U | 3907 | `03fbb4e28344354dfabf1a754e988e046e28e00801f106074d8bce8969886e5e` | T2-reproduce | ab-pair-runner | 3 |
| 157 | r9/ab_two_gates.sh | U | 1756 | `5cf3d670aad7cbe2394855274dcbdcde002d700d4d701d20799a9666d9065ab6` | T2-reproduce | ab-pair-runner | 2 |
| 158 | r9/ab_v6_direct1_repro.A.sha | U | 65 | `bc692b3d68e3d4a4cc19fc6a985015f830d2a2140664bdd8d1752f1f6a1fe4f7` | T1-verdict | hash-record | 0 |
| 159 | r9/ab_v6_direct1_repro.B.sha | U | 65 | `bc692b3d68e3d4a4cc19fc6a985015f830d2a2140664bdd8d1752f1f6a1fe4f7` | T1-verdict | hash-record | 0 |
| 160 | r9/add_append_split.py | U | 2289 | `7faf2b8089932a17c1d8d6bfc244b8bcfd16ed5d31aa544f62f484586e396934` | T2-reproduce | other-script | 0 |
| 161 | r9/add_fixed_arena_reserve.py | U | 3992 | `20a80b34a227dc2799aeea2109c0d6a5ff9b54cdd8a8ee9434af9a23e1ec3212` | T2-reproduce | other-script | 0 |
| 162 | r9/add_reader_step_probe.py | U | 1952 | `1a77fd238308154363f62df245383c0a1fbce696d3d8a85ccee8353d71e8cdca` | T3-diagnostic | diagnostic-probe | 1 |
| 163 | r9/add_replay_skip_probe.py | U | 6085 | `d3b7aff518121a4b532ac5f7ddca13d8860d2d8740ef5e818b3c00d0151836fc` | T3-diagnostic | diagnostic-probe | 0 |
| 164 | r9/add_row_counters.py | U | 2582 | `1f5fc8176026476ecf12829541fa8553b3e0c6ce16d3320bd2853ee7b9ba1424` | T2-reproduce | other-script | 0 |
| 165 | r9/add_stage_probe.py | U | 4199 | `270cbe8fb298fd56000add6e96f9b3fd427dcc51f3afa9d58a297258784f4811` | T3-diagnostic | diagnostic-probe | 0 |
| 166 | r9/add_ta_bisect.py | U | 2268 | `12c70c9a5f81c3b60ee70985fc93f23e6cfbeb10901f212dd834dab2710ea2fc` | T2-reproduce | other-script | 0 |
| 167 | r9/bake_probe_r9.sh | U | 2323 | `e1716d3ff92ee199e50fa8c4dfd82feb43cd6c07b12d97ec299f68a3e0f5433d` | T2-reproduce | bake-driver | 0 |
| 168 | r9/bake_r9.sh | U | 1470 | `4b63e16166b7a3a888729315127015196a37153e06f7f524405c3bd0b50027a2` | T2-reproduce | bake-driver | 1 |
| 169 | r9/bake_scratch_r9.sh | U | 2116 | `6496fe7c54288d6042bd66cebd30685a79b5147323642a608ce7fd56b3d992b5` | T2-reproduce | bake-driver | 2 |
| 170 | r9/canary_r9.sh | U | 2329 | `8a870a315dafd6d6a02e2e65112d4c40a305e2d012d89f8320d110e91158b9b8` | T2-reproduce | other-script | 1 |
| 171 | r9/catch_provider_argv.sh | U | 1211 | `2231942539b1df4939653c8a2e7c6b98846ca6de9d963ad4e0a84dd6434692dc` | T2-reproduce | other-script | 0 |
| 172 | r9/closure8_pair2_r9.sh | U | 3916 | `e4857fa304350d6d920c36b9a2b72be786f1ec2ba5b854b64f7d9c63402749ca` | T2-reproduce | other-script | 0 |
| 173 | r9/closure_census.py | U | 2741 | `3a53a563fc06aa4f2630b766dc773c0254bafd72509c31bd0a88f9cf645ee035` | T2-reproduce | other-script | 3 |
| 174 | r9/discriminate_const_count.sh | U | 3755 | `e2648ea9a951360f5c4f086da18bd9bf699482670ca783451aea239374e6f343` | T2-reproduce | other-script | 1 |
| 175 | r9/driver_identity_probe.sh | U | 3438 | `ac4992f65def5bdeb537b52c4e65402ea9c18c7f212852bb6021b99b5db4f232` | T3-diagnostic | diagnostic-probe | 2 |
| 176 | r9/dropname_probe.patch | U | 1384 | `67a1b529cad8fb09bbb2bd221af4fe9204522d53d95cfbaaed58386c8d1928ef` | T2-reproduce | patch-artifact | 0 |
| 177 | r9/entry_chain_write_points.py | U | 2522 | `d182a500be3e07c99e20cd59b1e9469965664f9617ab429a1135e2aab6851267` | T2-reproduce | other-script | 1 |
| 178 | r9/envcap.sh | U | 319 | `fcd772864a5d65e973b81037a54f68f06b0d042b4c23444a0fa690e35592efe7` | T2-reproduce | other-script | 0 |
| 179 | r9/exp_drop_context_lines.py | U | 2858 | `8c6c5ad600a217b71c8eef53ae681718235e850efd45c6b1340aebed08a84b15` | T2-reproduce | other-script | 0 |
| 180 | r9/find_private_import.py | U | 3930 | `a96a968915497284c90a4908a85f4dbe9f1a259916a813d643a536348340a2eb` | T2-reproduce | other-script | 0 |
| 181 | r9/fix_arena_reuse_v3.py | U | 14038 | `1fd79a3ed4e85d263aba81a09accbc15754e93ca288fee8e44a950f236236ce0` | T2-reproduce | other-script | 0 |
| 182 | r9/fix_blocked_row_deferral.py | U | 3422 | `46b6d07d64b2198a345a8b8ebdfe370069b8e29e9eb9abc7118cea14f6edfb7c` | T2-reproduce | other-script | 0 |
| 183 | r9/fix_dedup_table_arena.py | U | 7917 | `d66adb887e9800e93d01fcef38275d78b1ba2694e81dda866f7e4b1f072dc04c` | T2-reproduce | other-script | 0 |
| 184 | r9/fix_donated_arena.py | U | 15183 | `5fc0bb7e5961747f4d728988e5e512fbf29233da7b60f2a4b7ff0fe4b1b2c055` | T2-reproduce | other-script | 0 |
| 185 | r9/fix_field_csr_arena.py | U | 7736 | `c0a8536aaeea78fd8941e7242b1d21b307f77760cb09215c4f6807edc3b3113b` | T2-reproduce | other-script | 0 |
| 186 | r9/fix_no_arena_reserve.py | U | 3442 | `81901d4d55a9602d8d3adf45e290ec95cc6bb13367e3bd877779d33dfae0dfe8` | T2-reproduce | other-script | 0 |
| 187 | r9/fix_produce_attr_patch.py | U | 1847 | `c402e45de0ae3262806cc43e1adb32a322241999b8b9be655dd17875ac6abaf0` | T2-reproduce | other-script | 0 |
| 188 | r9/fix_replay_census.py | U | 3064 | `28f5e4762499fb61e710b475d870b167bc3f9834e2d8fa8665736e432dd4b0ff` | T2-reproduce | other-script | 0 |
| 189 | r9/fix_replay_fixpoint.py | U | 14306 | `1ff722d15679fa0e1f7c949c909b7dd66b3e92c977c9f12ef91b4b08f98eb118` | T2-reproduce | other-script | 0 |
| 190 | r9/fix_replay_full_walk.py | U | 4056 | `5d5140a90c58f7c4ab8ea45a5d3e8e1ae47e9c1e9ad22212cd3ac4f8fce60275` | T2-reproduce | other-script | 0 |
| 191 | r9/fix_replay_progress.py | U | 6320 | `9bbc21ad050478e9c871d48449e45e3d6946d208bdd4ea82df9174aeb776220e` | T2-reproduce | other-script | 0 |
| 192 | r9/fix_reuse_tree.py | U | 11307 | `38841866c9d0841b7b611bbac2c80e588dc33ee6d8d975c334ea6d4bd68f4ff3` | T2-reproduce | other-script | 0 |
| 193 | r9/fix_seal_pin_budget.py | U | 5549 | `fa0311d4d50d309657e1a383f73fe5e1aa8538c70d515fb8861e0be3191a58ce` | T2-reproduce | other-script | 0 |
| 194 | r9/fix_ta_functions_scratch.py | U | 13558 | `7e99b85f99fa26a5785490a431bb37e77633175ad428582d5a6ccfe00dfdd56f` | T2-reproduce | other-script | 0 |
| 195 | r9/fixtures_r9.sh | U | 3251 | `1e2888e818ae4865a3810c10e6b4ada4310401c0f1f350b66308f9a231fc3ec7` | T2-reproduce | other-script | 4 |
| 196 | r9/fn_level_diff.py | U | 2577 | `0b51e244b506e8b0052fb54c04c5eb612998f22aca3812174a5c42bc08650eff` | T2-reproduce | other-script | 3 |
| 197 | r9/freeze_dedup_fix.py | U | 1964 | `a26f40af66d381948a763fa4f5089dc5d42e1d16bd11f3aff0e3eff6693c7a73` | T2-reproduce | patch-generator-or-checker | 0 |
| 198 | r9/freeze_donated_arena.py | U | 1893 | `46008fc45419866ceb6fb1a1e3797806f11b01baa22ba570e6e28e75052adc62` | T2-reproduce | patch-generator-or-checker | 0 |
| 199 | r9/freeze_patch.py | U | 2357 | `505fff47e0ee10e4d24a62f902562845e02f7095f84da7ac653bf017c2a24b33` | T2-reproduce | patch-generator-or-checker | 0 |
| 200 | r9/gate/ab_r73.ps.tsv | U | 11661 | `ad8ce861ef07d0e0d9391181fb0d55f4b21e4358b8b9d1b9615c75a184436cde` | T3-diagnostic | criteria-data | 0 |
| 201 | r9/gate/ab_r74.ps.tsv | U | 10953 | `1202fb9fc3a7cd88a90d1cc5e336d0198fa2c0aa46b51c2e07b2d60d1fdbc12e` | T3-diagnostic | criteria-data | 0 |
| 202 | r9/gate/ab_r75.ps.tsv | U | 11092 | `af168fae3fb80eb8a425dfb04b70c4c4336ce9430c97e972415f710070eee985` | T3-diagnostic | criteria-data | 0 |
| 203 | r9/gate/b101_scratch_importfix.ps.tsv | U | 12093 | `15da2de64774f5a1bda9f46c564a0b06e686df8c95a1602c2db64f55663bbd72` | T3-diagnostic | criteria-data | 0 |
| 204 | r9/gate/b102_scratch_importfix.ps.tsv | U | 15115 | `40e70d015f3c89cc1841afa112a50874600186ed2d0a83d3c8cdc858596c4b2f` | T3-diagnostic | criteria-data | 0 |
| 205 | r9/gate/b204_leafname_fix.ps.tsv | U | 13914 | `2dc67c2dfb65728eafdf8b9cf897eefde9ba43ddbf8701a80dc0f75e73bd40ac` | T3-diagnostic | criteria-data | 0 |
| 206 | r9/gate/b302_cleanupfix.ps.tsv | U | 14363 | `d98f6359d96740d215702efb7e4121178774f4058ccc86420c861ecf5eaf9804` | T3-diagnostic | criteria-data | 0 |
| 207 | r9/gate/b404_w7xfix.ps.tsv | U | 11207 | `17b9f913bac7726fb91655a3a45cb1b0c784df1f06e9c718fd29f8e2bef4075e` | T3-diagnostic | criteria-data | 0 |
| 208 | r9/gate/b501_cleanupfix.ps.tsv | U | 14886 | `3188e47f59b249e8d48aaf9d7b5299d5a478dee862334c9a871bc2cb0c7ea97d` | T3-diagnostic | criteria-data | 0 |
| 209 | r9/gate/c100_base_default.ps.tsv | U | 7491 | `3b6c8d3c9f27c1d4117e5c4bb6bf6b230cc229c235232e9e8c5af941546176ea` | T3-diagnostic | criteria-data | 0 |
| 210 | r9/gate/c100_default.ps.tsv | U | 7051 | `a6ab311b1cce4e187a91d01abc741dfc7af344acf1850c3b40586a921cbe9ac6` | T3-diagnostic | criteria-data | 0 |
| 211 | r9/gate/c102_default.ps.tsv | U | 7489 | `b9b69a9c31dc4d7e89383821e65e1fef175f90d26d33e6765ad08b4bdcb50363` | T3-diagnostic | criteria-data | 0 |
| 212 | r9/gate/c102_raised.ps.tsv | U | 14357 | `f6cb92f2c5fc9a78e1d499a6c2fa841c2aaa8595647272743e7142a9994d169c` | T3-diagnostic | criteria-data | 0 |
| 213 | r9/gate/c2a_default_diag.ps.tsv | U | 7867 | `b7c2119dd8bf06f21165ecce3c1e764401d4f664c619b429dce892ad32b801c2` | T3-diagnostic | criteria-data | 0 |
| 214 | r9/gate/c2a_default_hardcut.ps.tsv | U | 7299 | `2f34ba2adcc41fae3cc47ce43060d47eacffa110d4462dcb711fb95681008dbb` | T3-diagnostic | criteria-data | 0 |
| 215 | r9/gate/c2a_raised_diag.ps.tsv | U | 16061 | `d27b70d62ee88efc3a5f85b6cb19c56f366af5dc792828d437b4e41e85a862c0` | T3-diagnostic | criteria-data | 0 |
| 216 | r9/gate/c2a_raised_hardcut.ps.tsv | U | 12027 | `e1492ad1b286eb2ca4821969ee1bdd801f8364f39fdd25b7e91f7695763b1c3b` | T3-diagnostic | criteria-data | 0 |
| 217 | r9/gate/c2b_raised_diag.ps.tsv | U | 13934 | `296172054ec25949f70a27b26cd2798a6d2672bf45b05bb8383ee856da8b3653` | T3-diagnostic | criteria-data | 0 |
| 218 | r9/gate/c2b_raised_hardcut.ps.tsv | U | 11083 | `389f40517f8d683213a09c0312caf26d7b8db9a937b6f88132ba71c51b7a6775` | T3-diagnostic | criteria-data | 0 |
| 219 | r9/gate/c2c_raised_diag.ps.tsv | U | 14445 | `5d5a1901ad5b8df2cb0569cb9f4f7c52c63f65c0fb5e14fc05d3a87af93f2547` | T3-diagnostic | criteria-data | 0 |
| 220 | r9/gate/c2c_raised_hardcut.ps.tsv | U | 15140 | `10ebca7d809412d9c33f21cc1a0bf606e4eb9f6f7e247968e79006c21f12becc` | T3-diagnostic | criteria-data | 0 |
| 221 | r9/gate/r103_attr.ps.tsv | U | 13032 | `84e1fa1155fe9f01d3061269d546a50f8b35c17ee676b57575af7c8de5e3fa4b` | T3-diagnostic | criteria-data | 0 |
| 222 | r9/gate/r103_oncurrent.ps.tsv | U | 5034 | `af8171c546df9385746306e25e010ce3b5963e6bd6cf071ff0578359abb7e771` | T3-diagnostic | criteria-data | 0 |
| 223 | r9/gate/r104_attr.ps.tsv | U | 1064 | `1d1cb06339356d8d0bcfe109af0ba5afbb595ef58d0c8cb07bbdc2678767b2f2` | T3-diagnostic | criteria-data | 0 |
| 224 | r9/gate/r104_attr2.ps.tsv | U | 1062 | `c1f9abab0bf83279f5954511daf49fbf5ae3765ee074fb91172659cb414088ee` | T3-diagnostic | criteria-data | 0 |
| 225 | r9/gate/r104_noprobe.ps.tsv | U | 5033 | `36fa7c399e2f4eec0cb8d478c4ab7005c5be6fdb6e8eea1ba9e19e5c7b50a0c3` | T3-diagnostic | criteria-data | 0 |
| 226 | r9/gate/r104_recov.ps.tsv | U | 7993 | `e5e2c66dba4a4099d842d219ece7492d1e6dd8eac58242c58581e0c9a83be6ba` | T3-diagnostic | criteria-data | 0 |
| 227 | r9/gate/r105_attr.ps.tsv | U | 12088 | `438f35d6bfc74abb84eb966e9bc6ed3ff38eca964f3ff1f0d45e1c2aff11d887` | T3-diagnostic | criteria-data | 0 |
| 228 | r9/gate/r106_attr.ps.tsv | U | 11836 | `f3ac0aa3283a3d36e3c7a9cc5c4712b6a98d04b412263e5de095f3f04e9c3e16` | T3-diagnostic | criteria-data | 0 |
| 229 | r9/gate/r107_attr.ps.tsv | U | 11772 | `a1f5d09ee363df3fbafc1731a121fe7946f537ad23834eeb0edbd934f158320f` | T3-diagnostic | criteria-data | 0 |
| 230 | r9/gate/r108_base.ps.tsv | U | 11088 | `0e9d45182786b0e36fbbbd072c2d5de797ea37d128cce5ee7c66d55e69258b34` | T3-diagnostic | criteria-data | 0 |
| 231 | r9/gate/r59_default.ps.tsv | U | 6861 | `f51b48cdc9311c8552bb3f1188601ee1f77ea49a39f44a2f25258521c743d8c5` | T3-diagnostic | criteria-data | 0 |
| 232 | r9/gate/r59_raised_detach.ps.tsv | U | 16123 | `f24a62d000fe3dcd885cf5bf143a3e5c16f8c60a860132b7bd0ee122d2930050` | T3-diagnostic | criteria-data | 0 |
| 233 | r9/gate/r59_raised_nodetach.ps.tsv | U | 9184 | `3902a7983bf192371730597e5d6ec14b3fa97a171e330274e462fe6edc0b8e06` | T3-diagnostic | criteria-data | 0 |
| 234 | r9/gate/r60_default.ps.tsv | U | 6674 | `9ba238fc8146b369d1fb0a3950e776fd06aa3b94ce76536317566037286ae176` | T3-diagnostic | criteria-data | 0 |
| 235 | r9/gate/r60_raised_detach.ps.tsv | U | 15808 | `b36b9653f22ff95d7219b2195d356e95de37cac41c8c2d8b0d09d5a5e39182e2` | T3-diagnostic | criteria-data | 0 |
| 236 | r9/gate/r61_default.ps.tsv | U | 7922 | `b7621db15e06706b6f5ec9dfebc2da4088991edbc1c206ba8e2d086dc02d641b` | T3-diagnostic | criteria-data | 0 |
| 237 | r9/gate/r61_raised_fixed.ps.tsv | U | 13673 | `8d5b0342470aa0e55a503f4accb83bda87f08cdbdc9f018f7c3ff64e1b2402b9` | T3-diagnostic | criteria-data | 0 |
| 238 | r9/gate/r61_raised_per_source.ps.tsv | U | 10704 | `dc7c35561054f2a29c00e39c2b7a53ed45f7b7b820b22b823bbc4a083dbfaac9` | T3-diagnostic | criteria-data | 0 |
| 239 | r9/gate/r62_default.ps.tsv | U | 4716 | `15974fc7002832176243bb6ec0a0588972a450460beaeafd754ce05308a3e248` | T3-diagnostic | criteria-data | 0 |
| 240 | r9/gate/r62_raised_detach.ps.tsv | U | 10701 | `9fcc45061074d93796d94bc3cedd21f5222ac5822fa6924ee3f8f025e924cdb4` | T3-diagnostic | criteria-data | 0 |
| 241 | r9/gate/r63_default.ps.tsv | U | 4846 | `4e8c224c8ac52fc2449a65687148db3fd4edab4f40484461df0dcae95ec777bf` | T3-diagnostic | criteria-data | 0 |
| 242 | r9/gate/r63_raised_detach.ps.tsv | U | 10752 | `9c5b580b8c7d82833d5c82044d2b3190760fec4cc56805736ceefbe2fcc671ac` | T3-diagnostic | criteria-data | 0 |
| 243 | r9/gate/r64_base.ps.tsv | U | 11214 | `0a7944dd214c972c3f4bb07672bf69442f2b4a2847ae8fda70b5b40e1e58ac2b` | T3-diagnostic | criteria-data | 0 |
| 244 | r9/gate/r64_default.ps.tsv | U | 7861 | `24bde2eafd38cb784712542d9377890996b25343820bfc728fa5ff3c35150dae` | T3-diagnostic | criteria-data | 0 |
| 245 | r9/gate/r64_fix.ps.tsv | U | 10042 | `e1ad6d08ac425eb62c587a2cb06b412a72dc0088d2974a7f7ace4fe0c7ab6d38` | T3-diagnostic | criteria-data | 0 |
| 246 | r9/gate/r66_default.ps.tsv | U | 6926 | `bf17072b5f1d1ad9448a5b272d416048e4a10f66d6869e3d49303af79e38cd15` | T3-diagnostic | criteria-data | 0 |
| 247 | r9/gate/r68_default.ps.tsv | U | 4784 | `97578f1021c3393381b23f88d6f559739aa257048838f4af9f4ca143cad0613e` | T3-diagnostic | criteria-data | 0 |
| 248 | r9/gate/r68_noreserve.ps.tsv | U | 10386 | `d0170c5e85c729634d0b57655324d0e3bc368a27734c812b2fd80b55fcccd0af` | T3-diagnostic | criteria-data | 0 |
| 249 | r9/gate/r68_reserve.ps.tsv | U | 10262 | `6682a5ac632f4096ca807f168ee35ab82407c599a6169646616ad5a8dd6b846d` | T3-diagnostic | criteria-data | 0 |
| 250 | r9/gate/r69_default.ps.tsv | U | 6858 | `88653b75cd5a888267f0e75f4d52519127c3c7f05386125430516b6facd80113` | T3-diagnostic | criteria-data | 0 |
| 251 | r9/gate/r69_raised_detach.ps.tsv | U | 10798 | `b77e08fa67f53ab88cd343526b427b6e23d7bffd1d989a8251668d0041a099cb` | T3-diagnostic | criteria-data | 0 |
| 252 | r9/gate/r70_default.ps.tsv | U | 6857 | `3333fde3bcdad3d99e76798905d192a571def3a8c3869877dacb2fae04f9367a` | T3-diagnostic | criteria-data | 0 |
| 253 | r9/gate/r70_raised_detach.ps.tsv | U | 11097 | `d1d0a5f60f00ab633b497f190fb46134777526349f8a8667faebcc52b4fe7896` | T3-diagnostic | criteria-data | 0 |
| 254 | r9/gate/r72_arenareuse.ps.tsv | U | 10935 | `e91b7a3776becaa80b51e362a2410f472782ef3807d62baacd5ca3d210ea0861` | T3-diagnostic | criteria-data | 0 |
| 255 | r9/gate/r72_default.ps.tsv | U | 4905 | `8a7fa8cf3123e605adf93b1f70e6eda345541f96db4fc66a0ec8c39c7c153b8b` | T3-diagnostic | criteria-data | 0 |
| 256 | r9/gate/r72_persource.ps.tsv | U | 10871 | `2e985a1ff754096367e68e06850cbe860aafefd2ca398be5390f4663e296242b` | T3-diagnostic | criteria-data | 0 |
| 257 | r9/gate/r73_default.ps.tsv | U | 6734 | `a3369db9f9212fdd1af0efaa3bd567c89fd5e15a1f12b8fe1b75833aba94a396` | T3-diagnostic | criteria-data | 0 |
| 258 | r9/gate/r73_raised_detach.ps.tsv | U | 10814 | `810dc4fde90b608fc38f1b043b281b0afd4b786d351dd2acc35c2089a18f691d` | T3-diagnostic | criteria-data | 0 |
| 259 | r9/gate/r74_default.ps.tsv | U | 5666 | `9bd630655c5d75cf9491e09501ed009a6ffa93029e1c631ae39df7dbf750410f` | T3-diagnostic | criteria-data | 0 |
| 260 | r9/gate/r74_raised_detach.ps.tsv | U | 11333 | `e6700a79fc085e0077d7c036658ad1519f77a51ae98ab38c41f2cfd113d68e57` | T3-diagnostic | criteria-data | 0 |
| 261 | r9/gate/r75_default.ps.tsv | U | 6984 | `e3bd0c8a406a6961fedd330bac7a7a164e65265a275b291a5fe4b684b380d08c` | T3-diagnostic | criteria-data | 0 |
| 262 | r9/gate/r75_raised_detach.ps.tsv | U | 10647 | `4d085a80609e52f6cdbf3605ece90fe05fc513fe2ba9a33b06d22e9bc165783d` | T3-diagnostic | criteria-data | 0 |
| 263 | r9/gate/r76_default.ps.tsv | U | 7048 | `5f43801e1de216da9c78478aa2b6244921bef0adf12acb7ad13edf1a48b4e29e` | T3-diagnostic | criteria-data | 0 |
| 264 | r9/gate/r76_droplines.ps.tsv | U | 11268 | `08009905e489d0443af479b869a4ebfc4702e010fdf55d1f245edec76fb27282` | T3-diagnostic | criteria-data | 0 |
| 265 | r9/gate/r76_keeplines.ps.tsv | U | 10933 | `e008f6d83e1e6a57cee3ad57165dad279501378891a10444663b57aae7889d98` | T3-diagnostic | criteria-data | 0 |
| 266 | r9/gate/r77_default.ps.tsv | U | 7175 | `8e0550c3d886c94905d8aab1863d6dface58cfdd26606260051a6bd36f353545` | T3-diagnostic | criteria-data | 0 |
| 267 | r9/gate/r77_raised_detach.ps.tsv | U | 10850 | `2f99425cf608757dacc274785a4303c02ec0a69dc28195630d610bcb594dfa74` | T3-diagnostic | criteria-data | 0 |
| 268 | r9/gate/r78_default.ps.tsv | U | 4842 | `8460460529a48206e722d68e7d6134f8c0b1854f9d93d6a29cc7c7289332a650` | T3-diagnostic | criteria-data | 0 |
| 269 | r9/gate/r78_raised_detach.ps.tsv | U | 10893 | `b58a7caeb2e3e7980c128b9ae057a3b0773887b293333d91cfa9b268fc5319fe` | T3-diagnostic | criteria-data | 0 |
| 270 | r9/gate/r79_default.ps.tsv | U | 4844 | `6ff802c64332250942d8f96b2e3aa59dfca6b535b678fca080037e93a4b0420c` | T3-diagnostic | criteria-data | 0 |
| 271 | r9/gate/r79_raised_detach.ps.tsv | U | 12285 | `7dd326a166e34b4fd7222e2b0a86284926287af91276129f0341f9c8b9542fe2` | T3-diagnostic | criteria-data | 0 |
| 272 | r9/gate/r80_default.ps.tsv | U | 6984 | `6860c830c9f195bb1174f999015add8401cd1723a4a2261dac65be7940407f3d` | T3-diagnostic | criteria-data | 0 |
| 273 | r9/gate/r80_raised_detach.ps.tsv | U | 12530 | `1843a5c82b5cb52fc039e21b9c9da63d7c3e8e76c7fee288a971a679b8978514` | T3-diagnostic | criteria-data | 0 |
| 274 | r9/gate/r81_default.ps.tsv | U | 7047 | `a42351816835819ebefd65cde974e46f851542f1b0a7875aa4f6e10880bb146e` | T3-diagnostic | criteria-data | 0 |
| 275 | r9/gate/r81_raised_detach.ps.tsv | U | 12530 | `a588f8d01427e686efc319158289ded1a24a417c7ee779da3e66613148e67cb7` | T3-diagnostic | criteria-data | 0 |
| 276 | r9/gate/r82_default.ps.tsv | U | 6987 | `7bae96134ec0bbda9f8ceda774cd8c006be232adbc01744e20b9b0b81946f430` | T3-diagnostic | criteria-data | 0 |
| 277 | r9/gate/r82_raised_detach.ps.tsv | U | 12279 | `56bcf748e99879f4e304fe658a2825943e69692b91322f592d1631990a884f07` | T3-diagnostic | criteria-data | 0 |
| 278 | r9/gate/r83_default.ps.tsv | U | 6988 | `4aee17c7483548d6645b846f354980e9e74d7766354f744b15d4a3a9cd0a7d08` | T3-diagnostic | criteria-data | 0 |
| 279 | r9/gate/r83_raised_detach.ps.tsv | U | 12345 | `3650e4a7862ca6db6f9ae3ab992cb8d6839ec29c75e5fae51a3676abd098f8e2` | T3-diagnostic | criteria-data | 0 |
| 280 | r9/gate/r84_default.ps.tsv | U | 7362 | `776634b421425ed8c6788bfa935f588db64991817480d92762d383826e01de60` | T3-diagnostic | criteria-data | 0 |
| 281 | r9/gate/r84_probe.ps.tsv | U | 12406 | `8bf0e8df81eefebfbc8d7bffdab136cd173e825a5c69109ec65d81742ce65741` | T3-diagnostic | criteria-data | 0 |
| 282 | r9/gate/r85_default.ps.tsv | U | 4781 | `e6dcaba28494b99a9a02bed00ce8385742f976b311cbdabdabfbe51bb63188f3` | T3-diagnostic | criteria-data | 0 |
| 283 | r9/gate/r85_raised_detach.ps.tsv | U | 19815 | `dd4d0bbc16270988155792b2e7afb86075030ff246c9b4c1e1205c0bef1a956e` | T3-diagnostic | criteria-data | 0 |
| 284 | r9/gate/r85_raised_nodetach.ps.tsv | U | 6485 | `44c82ee6b740007ab245784b61337a9cabbeae510a66a80eca726d93702a0bb3` | T3-diagnostic | criteria-data | 0 |
| 285 | r9/gate/r86_default.ps.tsv | U | 7551 | `95c813eaa42471ea98660ad8e19e7b8335b82bb4bbc6b1e9b137d6496c291701` | T3-diagnostic | criteria-data | 0 |
| 286 | r9/gate/r86_raised_detach.ps.tsv | U | 11737 | `50cc5921e9f9752d8de308e5ac400dc4a57ba7b04835cf40cd368915837ca02f` | T3-diagnostic | criteria-data | 0 |
| 287 | r9/gate/r86_sealprobe.ps.tsv | U | 11756 | `0471f49c873370f94ecffa3ab216cc120cf11933f355ed02a102e3c931c22c31` | T3-diagnostic | criteria-data | 0 |
| 288 | r9/gate/r87_default.ps.tsv | U | 7677 | `12c6ccded1bbd86ecf1ed9b740633409f3b705f8f244cae422fadb1c4a77cd98` | T3-diagnostic | criteria-data | 0 |
| 289 | r9/gate/r87_seal.ps.tsv | U | 11652 | `e804a6e20ebec5b1ed0527bd04a476d37085884c2a69b93f292c5a5e401b6862` | T3-diagnostic | criteria-data | 0 |
| 290 | r9/gate/r88_default.ps.tsv | U | 6858 | `c5a436a72b309d546cfc0ccf2ff5fe668a7fdbf6fc552c0ba16f8126166e7452` | T3-diagnostic | criteria-data | 0 |
| 291 | r9/gate/r88_mergetrace.ps.tsv | U | 12025 | `92688c966977e305a6b3540e1a120f6edb748c79a78bf8453ef2b45f11bc6dd8` | T3-diagnostic | criteria-data | 0 |
| 292 | r9/gate/r88_parsertrace.ps.tsv | U | 12100 | `502893d5004ff451dc67b2cc23621e7105a571532e691774583025dadfc195a9` | T3-diagnostic | criteria-data | 0 |
| 293 | r9/gate/r88_raised_detach.ps.tsv | U | 12048 | `762c1051fcc1c0a3c6fa987073096a2c8e5f1073ae171aa308b35255595d6cd8` | T3-diagnostic | criteria-data | 0 |
| 294 | r9/gate/r88_raised_nodetach.ps.tsv | U | 6354 | `3158efbd2e708d3cfcb62b3068e58d8ec5c62bb4937750ea8ecb014d1de9a924` | T3-diagnostic | criteria-data | 0 |
| 295 | r9/gate/r88b_fixed.ps.tsv | U | 12125 | `2d3b2663007a92f68f261288063696e2c2ea3abfb865dccdd6f6f86c395cd581` | T3-diagnostic | criteria-data | 0 |
| 296 | r9/gate/r88b_persource.ps.tsv | U | 12040 | `2af1811f0d61dcba39f27649ad1cf81e6aa9c1cbb5b8b36018d7411254b1416b` | T3-diagnostic | criteria-data | 0 |
| 297 | r9/gate/r89_bisect.ps.tsv | U | 12000 | `55cdd56388081cb535f53aaa7dc134e5449b54b7702ddd2ce84edb30b8776683` | T3-diagnostic | criteria-data | 0 |
| 298 | r9/gate/r89_default.ps.tsv | U | 6668 | `b25d7cd1e780db711810126fe917d874172f46580122941342d8e9c1ef0d119f` | T3-diagnostic | criteria-data | 0 |
| 299 | r9/gate/r90_default.ps.tsv | U | 6546 | `be1b2d12fff9e18faf61c050cbd9e11cd6d5748ba2152efb43f5d3376115e7b7` | T3-diagnostic | criteria-data | 0 |
| 300 | r9/gate/r91_arena.ps.tsv | U | 12090 | `31622b921a7e8976a0f982917f0af1d6dd256d909ae81c08dbc75325bc636a5d` | T3-diagnostic | criteria-data | 0 |
| 301 | r9/gate/r91_default.ps.tsv | U | 4654 | `655cf2976c4d41361f07dfbe601e0269c5de467a4dc6567368bfc3757c1cc68a` | T3-diagnostic | criteria-data | 0 |
| 302 | r9/gate/r92_census.ps.tsv | U | 12005 | `14fe38f2e2b7db33f2e3b7e4b075bbb7cb96f59bc866dfebccd6c848b95194b2` | T3-diagnostic | criteria-data | 0 |
| 303 | r9/gate/r92_default.ps.tsv | U | 4653 | `4bcea154b0fa61bfe6447c8697f488dbb3677a2b6432fb0d1e9b10d2172c3256` | T3-diagnostic | criteria-data | 0 |
| 304 | r9/gate/r92_raised_detach.ps.tsv | U | 11929 | `2c99c6c62c49f896890a2fc3f8e727058fc25d620a16ed9110276d59b6367e76` | T3-diagnostic | criteria-data | 0 |
| 305 | r9/gate/r92_raised_nodetach.ps.tsv | U | 6518 | `28727e18749c9c4521000a31699060b5dc06fe9dd6eb61b15541faa46913dd3d` | T3-diagnostic | criteria-data | 0 |
| 306 | r9/gate/r93_default.ps.tsv | U | 6796 | `9ddb926bcff1db7813d1fb4ca09577ff11d2ca9240d227d20d54e9793ac4efe0` | T3-diagnostic | criteria-data | 0 |
| 307 | r9/gate/r93_pool.ps.tsv | U | 11903 | `f7883c8f0c56b20a4ff6c0791544f24703812d2cccde0e846feb578a347ba88b` | T3-diagnostic | criteria-data | 0 |
| 308 | r9/gate/r94_default.ps.tsv | U | 6795 | `6a357bd3c90eceed4f417bdb80c0992e83102a2e05e056bf4911fd9865a9d05d` | T3-diagnostic | criteria-data | 0 |
| 309 | r9/gate/r94_ledger.ps.tsv | U | 11961 | `138dea107edec00981c0c983a3bf8e87f4c0a95cb15e0c89b68d390fabf15f1b` | T3-diagnostic | criteria-data | 0 |
| 310 | r9/gate/r95_ctx.ps.tsv | U | 58 | `3fa99d7e31d37454b299ee4bedee033bf82733c10473550e4668ea9c9ef5845e` | T3-diagnostic | criteria-data | 0 |
| 311 | r9/gate/r96_ctx.ps.tsv | U | 13792 | `8f788636da0e6db9f7b21b681373f8da553ea9557a0fa8dcd95dd771922f92ab` | T3-diagnostic | criteria-data | 0 |
| 312 | r9/gate/r96_default.ps.tsv | U | 8059 | `a5ab8869fd4e15afb1296b2fd3b63eff02e621beda8f7ecda56ca4cdb4123bd4` | T3-diagnostic | criteria-data | 0 |
| 313 | r9/gate/r97_ctx.ps.tsv | U | 13350 | `d20b868d3a2f5b1158b0bc37fb3b22950761182877de49839f1bb40f501e3fc8` | T3-diagnostic | criteria-data | 0 |
| 314 | r9/gate/r98_pool.ps.tsv | U | 14604 | `fb3f8f2d812cf17158685195e6dbb63b4727f93f507a6e1dc72a3efa0e09b3c9` | T3-diagnostic | criteria-data | 0 |
| 315 | r9/gate/r9g.ps.tsv | U | 58 | `f4fb8e5a8c48c21627ecbc0a9473211050d526e47989a77f809bd8a542136622` | T3-diagnostic | criteria-data | 0 |
| 316 | r9/gate_r9.sh | U | 3799 | `e07371a882bcfdec7eff8dd93b38a66042ba356b6e193358f1f603c3c979183f` | T1-verdict | gate-runner | 5 |
| 317 | r9/leaseprobe.py | U | 409 | `fd3785b1088fd0c549828555b69a923faa340e456c0d00c2939f71041865a126` | T3-diagnostic | diagnostic-probe | 2 |
| 318 | r9/lens_analyze.py | U | 5618 | `3672b0ee1f49055c3f1e8f6751d90c3b8ae248c7e067ec9915a6f03b13eefdea` | T3-diagnostic | diagnostic-probe | 0 |
| 319 | r9/matrix_atomic_tree.sh | U | 1272 | `84c0377ef667fc2dc23e7650aa1161b01d79e9c152b16fba156c5ec8f88ba38d` | T2-reproduce | other-script | 0 |
| 320 | r9/merge_release_analyze.py | U | 2836 | `0ff465cdca1640fe17d2e0331c727c0c1c012acd21d75d653a14cd68dfbf51bb` | T2-reproduce | other-script | 0 |
| 321 | r9/merge_source_delta.py | U | 1711 | `9b5ebcda497696e1a240883078807e4108e5cf40cc1eaefeb5b5c4155c7f5b4a` | T2-reproduce | other-script | 0 |
| 322 | r9/merge_stage_delta.py | U | 2797 | `704993a4909c17b61bbb552c8d1ab895469d9ddbb9b05f94a5df4a5f14135111` | T2-reproduce | other-script | 1 |
| 323 | r9/mirror_canary.sh | U | 1721 | `c21cdefde7e3a7a97ae74bf9ed23880ef8c12fa0ca0e53839764df5f099a160c` | T2-reproduce | other-script | 0 |
| 324 | r9/mk_mergeprobe_patch.py | U | 1767 | `f29f962bc2154f081643b1e9106dcf4e83597940a1939a685bce43bda2c7bf11` | T2-reproduce | patch-generator-or-checker | 0 |
| 325 | r9/mkcleanpatch.py | U | 2256 | `cd69d809a02fca3033f3dd7f2e4031c364b482a63d191ca07bd77bec344b79dd` | T2-reproduce | patch-generator-or-checker | 0 |
| 326 | r9/nblock_corr.py | U | 2566 | `351352625db73055be41eec4dfcc11bca1cffb836c4bea5a0fabe31095c2366a` | T3-diagnostic | diagnostic-probe | 1 |
| 327 | r9/orc_triage_bin_diff.py | U | 2435 | `5a6f56a490ea0452b1027097112af20d7759c0bf4667df5652d453d63b7c816a` | T3-diagnostic | diagnostic-probe | 1 |
| 328 | r9/orc_triage_callers.py | U | 1872 | `9937bebc93e0b4eceaebe9f4c7b9f0e73cad4f46c3edd4b900df5121af4ed187` | T3-diagnostic | diagnostic-probe | 1 |
| 329 | r9/orc_triage_callgraph.py | U | 2353 | `aa07352858d33c1ff4be7ac8d25951e9533f62d56936ebde7362c8811bc32c12` | T3-diagnostic | diagnostic-probe | 2 |
| 330 | r9/orc_triage_fn_bytes.py | U | 2366 | `06e3c65a6e36f4866f9df9f77669711376c1a054f437c55c40b998e7bc502a82` | T3-diagnostic | diagnostic-probe | 1 |
| 331 | r9/orc_triage_hexdump.py | U | 2377 | `ebf5b1669e4fe41bfdbb9422998a917d1ec972525bb6c923bd349cd007d0bf36` | T3-diagnostic | diagnostic-probe | 2 |
| 332 | r9/orc_triage_line_fp.py | U | 2583 | `fce824f6fabc98f22a660c91fdec220a306118fd449b782004d8ae2154b8db25` | T3-diagnostic | diagnostic-probe | 2 |
| 333 | r9/orc_triage_map_diff.py | U | 2003 | `797a585f94b34b3c31e2d9320771b20992a4e56207c8ca503a7b69947e628cf5` | T3-diagnostic | diagnostic-probe | 0 |
| 334 | r9/orc_triage_map_diff2.py | U | 2536 | `048070279c908df1475f21816a57b0031edd932c9acf504400673135af0a4ede` | T3-diagnostic | diagnostic-probe | 0 |
| 335 | r9/orc_triage_map_pair.py | U | 1780 | `f13bfdb90aad4b7e7a7275cff2e6073af6fad1e252aebc78199afeb36c9ba6f9` | T3-diagnostic | diagnostic-probe | 1 |
| 336 | r9/parse_call_suffix_presize.patch | U | 991 | `ac2f192405e71c12e5f15c160ca4d574ab34e155bc85a2724cf9dd9ed639548d` | T2-reproduce | patch-artifact | 1 |
| 337 | r9/patch_preflight.py | U | 9585 | `1a310dc87303e48b8c9bebb6dd4588bc1fc1a8f6d6460e34348b612e3d29d2d2` | T2-reproduce | patch-preflight | 12 |
| 338 | r9/patchgen/alias_zero_member_gen.py | U | 9916 | `59b2ea958981b48c31e0439751e54bea4cd92caecad9cee9ac73f60282668731` | T2-reproduce | patch-generator-or-checker | 1 |
| 339 | r9/patchgen/alias_zero_member_shape.frozen.patch | U | 1913 | `b15e9807d8b88cf901d9183075c44ca64231dddfb14577c576be5b84df596c39` | T2-reproduce | patch-artifact | 2 |
| 340 | r9/patchgen/binary_types_import_gen.py | U | 7695 | `1fc19cc72a8a984e39fefc9f1b7bf099c8078357ce876711fef6b76e752a5c68` | T2-reproduce | patch-generator-or-checker | 1 |
| 341 | r9/patchgen/bodyir_ingress_ownership_entry_slot_dump.patch | U | 2208 | `1803884aff293d6b35b90216d1d67dd274c8f9e5f2a9731607efe3397b0c9c6a` | T2-reproduce | patch-artifact | 7 |
| 342 | r9/patchgen/bodyir_slot_element_store_guard.patch | U | 1647 | `a3e7b3e733c0e5d5ec2105aa6f45eddedc652c74b163f60348b0e22959f9fd70` | T2-reproduce | patch-artifact | 5 |
| 343 | r9/patchgen/bodyir_slot_element_write_readbacks.patch | U | 5249 | `c7c6006d493d0cbfcf64568ba8a03689535dcd2ece2c950eda5f9fb9a7ab78d8` | T2-reproduce | patch-artifact | 3 |
| 344 | r9/patchgen/bodyir_slot_growth_integrity_readbacks.patch | U | 5078 | `eaf41cd2b802ce93f998349545204967dec9026d13537b8c3412e8d339213470` | T2-reproduce | patch-artifact | 2 |
| 345 | r9/patchgen/bodyir_slot_identity_discriminators.patch | U | 4739 | `5e8c0a55361cffa24ce1dd289bb4b18c34720e3bf8cf7639add4548ad9cb84e3` | T2-reproduce | patch-artifact | 4 |
| 346 | r9/patchgen/bodyir_slot_impl_bisect.patch | U | 2142 | `54601a05164dca285646436a5f9ed3c1fb67708a4915a11dbb804c658b1c23e8` | T2-reproduce | patch-artifact | 3 |
| 347 | r9/patchgen/bodyir_slot_stage_probes.patch | U | 7336 | `55e5349c1caec108269e731f8192771f10e0eb06fc6f138266e8dc4d6337d3e4` | T2-reproduce | patch-artifact | 3 |
| 348 | r9/patchgen/bodyir_slot_stage_trail.patch | U | 4134 | `26cb99eb186ea2bf733c7adc9b3dcf6eb49d4167fd74fd264fce52e1a658eb5d` | T2-reproduce | patch-artifact | 3 |
| 349 | r9/patchgen/builtin_ctor_gen.py | U | 27565 | `17d0b38399fabdf4e78f1bf07cfee3550c49e0ba17be0e9f1a9c113cfd3c2358` | T2-reproduce | patch-generator-or-checker | 1 |
| 350 | r9/patchgen/builtin_ctor_preflight_gen.py | U | 11808 | `8b5a563b61058bd578c4bf3235025f8b66f604e91d0ff96df0d838b341ff66a6` | T2-reproduce | patch-generator-or-checker | 1 |
| 351 | r9/patchgen/builtin_sabi_view_scalar_kinds.frozen.patch | U | 8264 | `49721b8d18f89939e3f0992403d77cacd48824ea37ff76cdbf5038ad98cf3959` | T2-reproduce | patch-artifact | 2 |
| 352 | r9/patchgen/builtin_type_constructor_arity.frozen.patch | U | 22380 | `a96410958432ea1250129a27c9ce03593189b66bab3403dd7776f044ffef1ee7` | T2-reproduce | patch-artifact | 1 |
| 353 | r9/patchgen/builtin_type_constructor_bracket_preflight.frozen.patch | U | 7709 | `87e7efb4693ff911a993520cae7c4a4c5b140ed5259f08828f4d506609d27bd5` | T2-reproduce | patch-artifact | 1 |
| 354 | r9/patchgen/chain_binary_types_inttostr_import.frozen.patch | U | 686 | `9f610a7a2b95da01c62b533e3651c26289c8b3d1a30b9b4dd1767927b3d44c69` | T2-reproduce | patch-artifact | 2 |
| 355 | r9/patchgen/declkey_after_remap.frozen.patch | U | 5596 | `1296fbe391e448e51d31848f5c224951da446e333009fcde4ad373b0cae58819` | T2-reproduce | patch-artifact | 0 |
| 356 | r9/patchgen/declkey_finalizer.frozen.patch | U | 2659 | `3defa1fee58830efdedcd02043d8f6d27b9675f29600a40493c0e03b5d8f851f` | T2-reproduce | patch-artifact | 0 |
| 357 | r9/patchgen/declkey_finalizer_v2.frozen.patch | U | 2684 | `5be8c0ba11d8f1175136b492b9b8708b76ce3838791787a78ec93ce7acc415ce` | T2-reproduce | patch-artifact | 0 |
| 358 | r9/patchgen/declkey_probe_v4.frozen.patch | U | 1448 | `3ecb67f3c7f865db000f91bb00ec8104f3e26af35457211d7a26cf5ce8f0049a` | T2-reproduce | patch-artifact | 0 |
| 359 | r9/patchgen/e1_p0_release_probe.frozen.patch | U | 2821 | `01036af44a1e8e4c74e405a1dd60c72077514f41b5662f186f9ecafea323ae39` | T2-reproduce | patch-artifact | 1 |
| 360 | r9/patchgen/e1b_intern_count_probe.frozen.patch | U | 3126 | `6c92a197df982c4d5efbc4cca865b2c37b11d77c1c5604f35bc4f398141bedaf` | T2-reproduce | patch-artifact | 1 |
| 361 | r9/patchgen/e1c_rowcount_probe.frozen.patch | U | 3267 | `ea11951571523f0a177a58a19eab9a702294d177d230bc3b20fdf4b7d5a4fcef` | T2-reproduce | patch-artifact | 1 |
| 362 | r9/patchgen/e1d_parse_bisect_probe.frozen.patch | U | 851 | `dccc5ac6fa74578dc5b5c395db1d2ea2c584187565f5667acd0a42e7b575c42b` | T2-reproduce | patch-artifact | 1 |
| 363 | r9/patchgen/e1e_parse_srcindex_probe.frozen.patch | U | 3112 | `2472188986511757499e010cf460040110bfdbc3046810d7fee28bccade97a58` | T2-reproduce | patch-artifact | 1 |
| 364 | r9/patchgen/e1f_buildindex_lens_probe.frozen.patch | U | 6999 | `53da888437312bd41c1727ca7b9e9bfa76b5324ccc495498c419241614b65dd3` | T2-reproduce | patch-artifact | 1 |
| 365 | r9/patchgen/e1f_buildindex_lens_probe_v2.frozen.patch | U | 36020 | `3ac69bec3bf58660d8e515f5e8ef8e01bd56c5554f8afe4100d89d973e76df09` | T2-reproduce | patch-artifact | 0 |
| 366 | r9/patchgen/e1g_ctx_census_probe.frozen.patch | U | 7231 | `0ed1c49b50f28a4801ff9010f1a90ac633e7f0336a9c51bc1a936f7f6914fac0` | T2-reproduce | patch-artifact | 1 |
| 367 | r9/patchgen/e2_stage_boundary_probe.frozen.patch | U | 1100 | `c5d4900942123b6edf3bac3de63972d2cbefd10619f900d19ead66f4e8dd54da` | T2-reproduce | patch-artifact | 1 |
| 368 | r9/patchgen/fix_a64_body_units_import_result.patch | U | 597 | `98ad8a242b9af0eca67e79280be7b7ef0f9828aee23454052c6d5c6d0981f2c9` | T2-reproduce | patch-artifact | 2 |
| 369 | r9/patchgen/fix_missing_imports_forest6.frozen.patch | U | 3810 | `0055200e5dc0210d9eb508bc63db18b756c1e241517be61c2af668b1316e06f0` | T2-reproduce | patch-artifact | 0 |
| 370 | r9/patchgen/forward_typeid_r2_revert_tool.frozen.patch | U | 27938 | `09381e9367ffa7aced416a96d4b791cb963738e490bbcf1dc621bae1707bd10f` | T2-reproduce | patch-artifact | 1 |
| 371 | r9/patchgen/forward_typeid_r3.frozen.patch | U | 28276 | `b507878aacef677df9e69e75d53b5c581fb43bb909dd1c56060fb9875cc94b7d` | T2-reproduce | patch-artifact | 1 |
| 372 | r9/patchgen/generic_application_origin_builtin_head.frozen.patch | U | 8039 | `bfa3f1000819f15e90bf6744c59c36b0e23f03db6c93d5e3009958d1976b9645` | T2-reproduce | patch-artifact | 2 |
| 373 | r9/patchgen/generic_application_origin_gen.py | U | 20652 | `b23b13197a0d7fc9a3af8e68f2ceee0e6c0dbc8e0181d5f70592420515a0f6b1` | T2-reproduce | patch-generator-or-checker | 1 |
| 374 | r9/patchgen/generic_owner_probe.frozen.patch | U | 2189 | `32f1f9353033813745efb09780ca3af69d9626e97266f1a07085f2f1b270b244` | T2-reproduce | patch-artifact | 0 |
| 375 | r9/patchgen/implicit_generic.frozen.patch | U | 17364 | `aec59e4adee765eb5b88d58d99b5559d4737b3a1e505bd85cbab03d173a3218a` | T2-reproduce | patch-artifact | 1 |
| 376 | r9/patchgen/implicit_generic_local_annotation_window.frozen.patch | U | 8668 | `c36f1fb2adad73b485f0c2633021b54e21465ba85783739b6641dded1d478824` | T2-reproduce | patch-artifact | 0 |
| 377 | r9/patchgen/implicit_generic_local_annotation_window_v2.frozen.patch | U | 7191 | `9505fc59c1547c9444cad125f0550ab68c1f07d6c06ab18d289c0c36bc87e385` | T2-reproduce | patch-artifact | 0 |
| 378 | r9/patchgen/implicit_generic_v2.frozen.patch | U | 17354 | `4ddaa961f7397b10e5f62d52832ac4c50b2600fa35d06c4c86490c48d8438e45` | T2-reproduce | patch-artifact | 1 |
| 379 | r9/patchgen/imported_type_not_exported_coords.patch | U | 1746 | `1c66632b939fe6c9ed2de62ca3014ce8c7319bb0c85c2d24db03991bd8542b36` | T2-reproduce | patch-artifact | 2 |
| 380 | r9/patchgen/local_symbol_domain_gen.py | U | 5694 | `8848b4104cf04a91b6604b74f9e5688cdcb44994ca2a97603b54d6620b6a1045` | T2-reproduce | patch-generator-or-checker | 1 |
| 381 | r9/patchgen/module_const_scan_progress_csg_paren.frozen.patch | U | 732 | `ff10fb6d45170ccb7124a0e4a45cb8c1fcfdc613f54c359e316b418e6513c29a` | T2-reproduce | patch-artifact | 1 |
| 382 | r9/patchgen/nominal_sweep_addedcheck.py | U | 4101 | `381933468a2e35bbc6f51f4bd279f2cc0ddf47d82776dfb029a2fe0e22636d09` | T2-reproduce | patch-generator-or-checker | 1 |
| 383 | r9/patchgen/nominal_sweep_enumerate.frozen.patch | U | 14831 | `093fc21a991a50d1fa1b5317849b5920072a1cccc378566009748598b4cf8fe4` | T2-reproduce | patch-artifact | 1 |
| 384 | r9/patchgen/nominal_sweep_enumerate.frozen.patch.sha256 | U | 238 | `93c2bf77c64aaf7c61e1f53f613a97f3d228ffde1569ab6e67741f2fe995ed32` | T1-verdict | hash-record | 0 |
| 385 | r9/patchgen/nominal_sweep_gen.py | U | 16831 | `b2ca4595c4b4c1adf88f92385d91c30ae3b8f3df115d514e8a32be580f8b842d` | T2-reproduce | patch-generator-or-checker | 1 |
| 386 | r9/patchgen/nominal_sweep_indentdelta.py | U | 1147 | `02801cc6cae674c92e39fb3ec672299c50d2859505c74f1efabad01f8bdf372b` | T2-reproduce | other-script | 2 |
| 387 | r9/patchgen/nominal_sweep_lineindex.py | U | 1475 | `d7381449516013d26c7a93bb7fa2dee3eb7e79638b782614898958f52fa1e3f3` | T2-reproduce | other-script | 0 |
| 388 | r9/patchgen/nominal_sweep_syntaxcheck.py | U | 3208 | `26d93c4024f2a403198a0e9821020bf6b7a864fb459c0692b20fe122d3e7ff27` | T2-reproduce | patch-generator-or-checker | 1 |
| 389 | r9/patchgen/object_field_authority_name_domain.frozen.patch | U | 4563 | `1c0f20da1690db6cb70da7bfa2d63cc5b6017ded6da19437b573bbfb20fab880` | T2-reproduce | patch-artifact | 2 |
| 390 | r9/patchgen/object_field_fixpoint_gen.py | U | 9388 | `2db2fb04c0404e0c62844c7b87ca482c66f8ea599526dc1153a766f23757ce56` | T2-reproduce | patch-generator-or-checker | 1 |
| 391 | r9/patchgen/object_field_fixpoint_idcheck.py | U | 4968 | `3d107a60d60517dc5b60147fe7051786e6a2bc95d5414495af070a5bf4dd9d29` | T2-reproduce | patch-generator-or-checker | 2 |
| 392 | r9/patchgen/object_field_fixpoint_verify.py | U | 3683 | `cb68e32623ca341b1c2d25600bc6a3b3f03bf2617c6707f844b20c907ff7066d` | T2-reproduce | patch-generator-or-checker | 2 |
| 393 | r9/patchgen/object_field_name_domain_gen.py | U | 11182 | `b8a255e208cdb91e022504b9f9a1b52160482f67a54a1bc35d15d34dd6d63f9c` | T2-reproduce | patch-generator-or-checker | 1 |
| 394 | r9/patchgen/parser_receipt_name_domain.frozen.patch | U | 5017 | `7e0e2af3b0ee715a637da8b7d5925576f63f380e81a5f3869661454db237a811` | T2-reproduce | patch-artifact | 1 |
| 395 | r9/patchgen/parser_receipt_name_domain_gen.py | U | 12791 | `5d29a16a802dfe7cf71bba0cef8a721bc214054dc1c94ecc52ca4cea0bbd8b1c` | T2-reproduce | patch-generator-or-checker | 1 |
| 396 | r9/patchgen/patch_idcheck_generic.py | U | 4214 | `7e82993b4ba5ff6ed9a431003319360b71192a1a67a3144a99680bf2ef556d92` | T2-reproduce | patch-generator-or-checker | 1 |
| 397 | r9/patchgen/patch_verify_generic.py | U | 2429 | `7d44552f7bd4abbe9c33e5bf137e6e864b4607cb3bf26845b52f723c0b2e3964` | T2-reproduce | patch-generator-or-checker | 1 |
| 398 | r9/patchgen/ptr_builtin.frozen.patch | U | 7882 | `f4f02529ad2451791e24f50a5e4ad4b07b41d1f5b18a18540db65274da138478` | T2-reproduce | patch-artifact | 0 |
| 399 | r9/patchgen/resolution_receipt_row_order.frozen.patch | U | 5955 | `be1ce4bfed11883f1c6728e87eb5509aaf2299d1839a56f9f84a08e9ec95d492` | T2-reproduce | patch-artifact | 2 |
| 400 | r9/patchgen/resolution_receipt_row_order_gen.py | U | 17746 | `a35bf7652b618734890d1409f4511067aef98b5abce7cf0e793849f4ee49eae5` | T2-reproduce | patch-generator-or-checker | 1 |
| 401 | r9/patchgen/sabi_view_scalar_gen.py | U | 19796 | `f8f794d4163a74c5a90cb068098e82a73e82e54c48d6024b4811de51f2ed2436` | T2-reproduce | patch-generator-or-checker | 1 |
| 402 | r9/patchgen/scalar_send_sync_gen.py | U | 14272 | `d202d7da03f1b61171adbffd3a5729326576f5d4fc008ae1eb5d98fd31a5fada` | T2-reproduce | patch-generator-or-checker | 1 |
| 403 | r9/patchgen/scalar_send_sync_single_source.frozen.patch | U | 5143 | `00337316cf09f113cce07ea81be27eb2dcce72dbf825d69f715bc327927f5c98` | T2-reproduce | patch-artifact | 2 |
| 404 | r9/patchgen/symbol_obligation_domain_global_local.patch | U | 2606 | `914dd5012aa11717e01f3b96af4c577bede6bd19dd53aeefa510eb2e5f1eb045` | T2-reproduce | patch-artifact | 4 |
| 405 | r9/patchgen/trait_premise_roworder.frozen.patch | U | 3940 | `f2521edd92993afa212eac6d77377ac69156bcdc817a8dd8364bd08d8bc597ca` | T2-reproduce | patch-artifact | 1 |
| 406 | r9/patchgen/zero_arg_type_constructor_gen.py | U | 17802 | `7f734dc2050609b35c981577ca76f499ef67d3de6c65e8514c304eee81b88713` | T2-reproduce | patch-generator-or-checker | 1 |
| 407 | r9/patchgen/zero_arg_type_constructor_surface.frozen.patch | U | 6806 | `4fe3a04fd2d98d9e5c32004d9b71422d776545147a7ce56ded865004e33ed441` | T2-reproduce | patch-artifact | 2 |
| 408 | r9/pilot_call_suffix_presize.py | U | 3359 | `7043759038bf02b4a0478825ff5cb7aed4a380c3d64de3215ee2f4b38a21d9eb` | T2-reproduce | other-script | 0 |
| 409 | r9/preflight_fixtures/bad_annotation_split.patch | U | 5573 | `fb3181b83610c486cf494dc7058ff4510b04c19bb08698a22949e9511145019d` | T2-reproduce | patch-artifact | 1 |
| 410 | r9/probe_ctx_columns.py | U | 4529 | `95a4608dde6084e33c390c0b42d19e23cf51428debf95e5efa3846abd3d58f46` | T3-diagnostic | diagnostic-probe | 0 |
| 411 | r9/probe_dropname.py | U | 4213 | `98dd78daa20d7cce3bbb1d0274ebf7d29042cceb9368fd325b15973c0018fa75` | T3-diagnostic | diagnostic-probe | 0 |
| 412 | r9/probe_phase_ledger.py | U | 2235 | `4b05f597e3128efff5d5f97ca669d0e966955602477771496bb0f21ad624a74e` | T3-diagnostic | diagnostic-probe | 0 |
| 413 | r9/probe_produce_attr.py | U | 6876 | `980dc48fe266005589febfc4a29a9c13cf9d850b76ec416c6a8380c6f2754c3c` | T3-diagnostic | diagnostic-probe | 2 |
| 414 | r9/probe_produce_attr2.py | U | 4149 | `8103741118d1371ad2fae99e1ca39ce6b516d578dfd3d5d8bedd5559ba78f2ba` | T3-diagnostic | diagnostic-probe | 1 |
| 415 | r9/probe_produce_bisect.py | U | 2089 | `2f72c9279e11c2d04a5224527a3857185d579b0d9456640b1721f0686d24fc35` | T3-diagnostic | diagnostic-probe | 0 |
| 416 | r9/probe_produce_pool.py | U | 1535 | `dae73daece5ca665c0656b3e496eb0ebd09af5ba1152a81c4bbfce9d30c087e5` | T3-diagnostic | diagnostic-probe | 0 |
| 417 | r9/probe_reader_arena.py | U | 2324 | `71b13a1f4c47140255f556da803fb6baf9539b77aae8ec9565d81c44c16afba3` | T3-diagnostic | diagnostic-probe | 0 |
| 418 | r9/probe_seal_arena.py | U | 7276 | `ea6d65d1fe75918419bc426a194140f9750357efe1509fd951e5cd4dc225526b` | T3-diagnostic | diagnostic-probe | 0 |
| 419 | r9/probe_seq_extra_release.py | U | 3446 | `a85038da56ca2a47443f1e3d3c2009adc7a217589a5061a41d48f19172bc6133` | T3-diagnostic | diagnostic-probe | 0 |
| 420 | r9/probe_seq_skip_release.py | U | 2577 | `318b17b8b15f541d0d79b5c719a13cd5bfce222dcdf7df91ba560fc634517a10` | T3-diagnostic | diagnostic-probe | 0 |
| 421 | r9/probe_window_r9.sh | U | 7353 | `b350bc7db4d6035dbad34229bcdfb27306a40282fedb630b8339432cfca1a907` | T3-diagnostic | diagnostic-probe | 2 |
| 422 | r9/produce_attr_probe.patch | U | 5285 | `2bdb1fe46c66cf4410a2de77c294b31037b8f25eeea49ae79a8954e7cf6a5d5f` | T2-reproduce | patch-artifact | 2 |
| 423 | r9/produce_bisect_delta.py | U | 2520 | `f7423ce310d6e53d3dedb777716af76328bf42dd7ea4fe55b29c0c9beef7949c` | T2-reproduce | other-script | 1 |
| 424 | r9/reader_step_delta.py | U | 2206 | `dbc2460d7b0347effadcef6536daeba99474b8973e61b6a52f92d390637175a7` | T2-reproduce | other-script | 1 |
| 425 | r9/rebuild_e1f_v2.py | U | 3125 | `9f6d0933f0bbae0749b45e2251dc5332b1498b5531e49f4b16a5d6ba5f930808` | T2-reproduce | other-script | 0 |
| 426 | r9/reconstruct_e1f_deletions.py | U | 4373 | `fae0d76944dd405cd2b53ac96219bcea4b4b262a5825dd6fe8458f8bb7695714` | T2-reproduce | other-script | 2 |
| 427 | r9/reduce_e1f_v2.py | U | 1917 | `712cf0ea76520cdba08451f4601f57c49412c57799ab79d4dfcd24d27b81639f` | T2-reproduce | other-script | 0 |
| 428 | r9/remove_e1f.py | U | 2156 | `dd74de10364de23d21006014d7325abfb8712e80b82d74ac6c8f95b70ea776c0` | T2-reproduce | other-script | 1 |
| 429 | r9/rename_buildstate.py | U | 1547 | `06713c8b243f72358c46d085fc78c2025fcf9eec08465e4ea349cdfce839c454` | T2-reproduce | other-script | 0 |
| 430 | r9/scan_fixed_len.py | U | 3438 | `390a8e3ab2669d805e329006b8288916abd0803b5a904d7b7dc68597216c6e24` | T3-diagnostic | diagnostic-probe | 0 |
| 431 | r9/scan_module_consts.py | U | 4180 | `b6ec106b45b403fad7f4205e3b1e299e9334643690977671bb2f3c1690c8a5fb` | T3-diagnostic | diagnostic-probe | 0 |
| 432 | r9/scan_typepos_fixed_len.py | U | 3703 | `d1773e0c9c1f4e4f5255aa0c07f27c532f65130208cf42def0f5387e895e905c` | T3-diagnostic | diagnostic-probe | 1 |
| 433 | r9/scratch_probe_revert/build_scratch_root.py | U | 5925 | `1a995f5644989d00961a3448d0cd9c012c7a46fb9f4a4550d3d077c96c17a6dc` | T2-reproduce | other-script | 2 |
| 434 | r9/scratch_probe_revert/full.patch | U | 18904 | `a4f86c04dfbc5d727c54c3373d46f4841a52558c7c79b7b6e5fa7f454eb0a1ef` | T2-reproduce | patch-artifact | 22 |
| 435 | r9/scratch_probe_revert/probe_only_revert.patch | U | 8219 | `ed13c4d42d85255e6132c6fff375f03c8ba4251b02aec1392d33807b1558cc43` | T2-reproduce | patch-artifact | 1 |
| 436 | r9/seq_extra_release_probe.patch | U | 1115 | `e35df8a25bee30c083c48f0cb1788b0cda1266bebe33b3c66f91aac23fe7f3a7` | T2-reproduce | patch-artifact | 0 |
| 437 | r9/seq_skip_release_probe.patch | U | 405 | `ba2897f27fae59fdc4fdeb4d15aebd22396aeea16c6a91fa1dc778acc4d44138` | T2-reproduce | patch-artifact | 0 |
| 438 | r9/try_r9.sh | U | 955 | `e82044f99646f21c35197c94a6232e1ff39146d5273976e6caf4a1952a28314d` | T2-reproduce | other-script | 3 |
| 439 | r9/typed_expr.pre_vis_swap.sha256 | U | 65 | `aca256ba07e259bbb493e9973935c9848c7db617dfa31a46c4979af324a32238` | T1-verdict | hash-record | 0 |
| 440 | r9/verify_collateral_sites.py | U | 2181 | `692a9435b66c6749a199a372dd9cc15fd1608a2ffd8e7ff0b0af3e8f4867338d` | T2-reproduce | patch-generator-or-checker | 1 |
| 441 | r9/verify_merge_r9.sh | U | 1182 | `03096a89edcf19a150ed9f879e31c1f7dc8a8202fb8b484ca62fb34d1d43822f` | T2-reproduce | other-script | 0 |
| 442 | r9/verify_round_r9.sh | U | 1013 | `d60ee9dc598997bbb13072bd86a64b78ee64b2e6de74f79e6ef5131e07cfbc01` | T2-reproduce | other-script | 0 |
| 443 | r9/vis_swap.py | U | 2786 | `f00eaca1ebe9910951cc49a411d183dd6acf1f1387a00284950d6a0e4e727f87` | T2-reproduce | other-script | 0 |
| 444 | r9/whole_file_fn_compare.py | U | 3568 | `283251b1c1b783b55e3c787f637312273f6b074739135a12d6e253b9637416ed` | T2-reproduce | other-script | 3 |
| 445 | run_step3_round.sh | U | 6379 | `2987a945c3f8d7601c6a5d2df8695f0cfb67c009b69f4a0a850f9c8c969b27a2` | T2-reproduce | other-script | 3 |
| 446 | s1b_1c_seal_arena.patch | G | 33205 | `ddf6948ac911c77e6124262544d95576fac300281e2768ae30f4afcac61be21c` | - | patch-artifact | 7 |
| 447 | ta_step3.sha | U | 65 | `1d5f278a7af944e9e4843c1c86186aadd661733f5da30487329bed97d14ff10d` | T1-verdict | hash-record | 0 |

合计：G 4 件、Z 10 件、U 433 件（其中 433 件已复制）；机械件总数 447。

