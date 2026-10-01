# SLABK2_ATTRIB — slab 役刀 2（度量道分段化 + 索引 per-decl/per-seg base 列）施压档案

日期：2026-09-21。线：`.rebuild/slabk2_line/`（产物独占）。锚 HEAD `b6213616d`
（含刀 1 b6213616d + phase-1 双刀 56571f10e/2be4b0162，建刀前已重查）。
冻结补丁（三件，全 additive，+337/−0）：

| 补丁 | 文件 | 规模 | sha256 |
|---|---|---|---|
| `slabk2_parser.patch` | parser.cheng | +17/−0 | `380622351603a07b72b956b7d729650014f12a2799047ddfddb2076f87dc17bc` |
| `slabk2_type_arena.patch` | typed_expr_type_arena.cheng | +164/−0 | `2c370c64c5cad5084dac046f4728ad82822c88229c8e18b8b988285559a35698` |
| `slabk2_compiler_csg.patch` | compiler_csg.cheng | +156/−0 | `1c772184c8c239d2b184e8a6cf9961399b7ba94e0600a1f008b0125eed007895` |

## 刀规模与机制

1. **parser.cheng（+17）**：刀 1 段界记录的公开读面四访问器
   （`ParserSegmentDiagBoundsLen/At`、`ParserSegmentDiagMainTokens`、
   `ParserSegmentDiagSuspendSet`），纯新增，缺省零调用零成本。
2. **typed_expr_type_arena.cheng（+164）**：
   - `TypedExprTypeDeclarationIndex` additive 六列（per-decl/per-seg base 列）：
     `segmentOwnerSourceIndexes/segmentTypeSyntaxBases/segmentDeclarationBases/
     segmentTypeSyntaxRowCounts/segmentDeclarationRowCounts/segmentDeclEntryCounts`；
     缺省（默认臂）全空，shape 门仅加「非空必须同长」additive 检查。
   - `TypedExprTypeDeclarationIndexAppendSegmentInto`：单段声明投影追加，B 侧
     装配核心，与整源装配**共用** `typedExprTypeDeclarationIndexAppendEntry`
     逐条目代码路径（恒等由共用实现承担），不触 per-source 总量列。
   - `TypedExprTypeDeclarationIndexSegmentIdentityInto`：**恒等式定理三门**——
     P1Σ（分段条目和==整片条目）、P2前缀和（段 base 列==源行跨度逐段细分划：
     首段 base==源 base、相邻差==段行数、Σ段行数==源行数）、P3切片（六条目列
     逐行逐字节恒等，名称串含内）。失配报首个分歧行，hard fail。
3. **compiler_csg.cheng（+156）**：度量道 A/B 走查
   `compilerCsgSlabk2SegmentIdentityWalk`，env `CHENG_SLABK2_AB=1` 门内
   （latch idiom 同 D6v2）：在度量环内、整源装配（A）后、base 前进前，
   用刀 1 段界记录逐段 fresh-arena 重放（`ParserSegmentDiagParseSegment`，
   12 项 strict validate 内建），段树声明投影按段 base 装配（B），三门对照 +
   `slabk2_ab_seg`/`slabk2_ab` receipts + 通道尾 `slabk2_ab_channel`。
   段界缺席=权威缺失，hard fail，不静默跳过。

**读侧零改动**：`typedExprTypeDeclarationIndexEntryForRoot` 二分、
`typedExprTypeAuthorityIndexFindDeclaration`、seal、既有整源装配
`TypedExprTypeDeclarationIndexBuildSourceInto`、流式对拍
`VerifySourceAgainstInto` 一行未动（补丁 grep 在案）。
**schema 全 additive**；默认臂零新增工作（env 关 = 原路径逐字节）。

## 与两邻线不冲突（施工时点核查）

- staticarg 线补丁只触 `typed_expr.cheng`（非本刀三文件域）；C1 线补丁
  hunks 在 parser.cheng :5483/:5555（lex 区），本刀唯一 parser hunk 在
  :30697 后（刀 1 块尾）。commit 前按纪律再查 staged。

## 建刀证明（零烤部分，已闭合）

1. **preflight 三补丁联 PASS**：ann=0 displaced=0 wedged=0（规则 10-①）。
2. **施加态字节恒等**：三补丁施加于 `git archive HEAD` 后与构建器产物
   `patched/*` 逐字节 `cmp` 相等（3/3 IDENTITY_OK）。
3. **零烤 A/B 回放器形态**（`ab_replay_form.py`，复用刀 1 冻结回放器）：
   闭包 234/234 回放零错、construct_hits=0（段界不切多行构造=per-decl
   划分良构前提）；静态口径 20829 段/max_seg_bytes=466261（与烤后观察位
   口径 D≈23242/466876 的差为静态移植保守性，非恒等判据；恒等以 in-compiler
   三门为准）。账本 `ab_replay_form.txt`。

## (iv-f) 三判据重算（刀 3 开工门；`ivf_recalc.py/.txt`）

输入全实测：floor=713.2（p1phase1 门轮）、max_seg_arena=40.0625 MiB
（刀 1 烤后对拍）、fixed=3.0、硬线=768 恒定。

- **判据一 总峰**：713.2+40.06+3.0=**756.26 ≤ 768**，余 **11.74 MiB**。
- **判据二 各相贴线**：floor 组成 604.2+105.6+3.5=713.3 vs 实测 713.2
  （偏差 0.1 噪声内）；段驻留单元 40.06 vs worst-slab 41.4 校准带偏差
  3.2%（<4% 刀 1 已钉）；无未解释项。
- **判据三 rc=0**：预测峰不打穿恒定守卫且段峰 ≤62 停线门 → 可达。
- **停线门**：设计 62 MiB（预算 floor 706.5 口径）与实测 floor 换算的
  有效门 51.8 MiB（=768−713.2−3.0），实测 40.06 **两门均未触**。
- **IVF_VERDICT=PASS_knife3_gate_open**；X2cut（−10~25）未施工为余量后备。

## 烤制+证明链（`slabk2_bake.sh`，排队式，槽空自启）

S1 基座内容断言（三文件 pristine==HEAD）→ S2 双臂烤制（A=HEAD 原样、
B=三补丁，唯一变量=刀；冻结施加态身份断言）→ S3 金丝雀 2/2 → S4 四合同
A/B（compile rc+primary.o cmp+run 判词）→ S5 A/B 恒等诊断轮（抬门
3.6GiB，SEGMENT_DIAG=1+SLABK2_AB=1，三门 receipts 全量、失配行必须 0）→
S6 恒定门轮（768 不放宽；floor 贴线 vs 713.2 噪声内+爬深记录；
KILLED_PASS1_EXPECTED 为预期形态，全树 spike 归刀 3）。
本链只产判据不 commit；绿后人工审读再入库。

## 依据缺位披露

`.rebuild/slabdesign_line/SLAB_DESIGN.md` 与 `.rebuild/x2cut_line/REPORT.md`
磁盘缺位（目录已被清理，m3fix/SLABK1 档案仍引用）。刀 2 范围按任务简报
引用的刀 2 节条款施工（度量道分段化+索引 per-decl 列+恒等式定理三门+
读侧零改动+additive schema+62MiB 停线门），数值锚全部取自在案实测档案
（SLABK1_ATTRIB/segment_readings/p1phase1_REPORT/m3fix_REPORT）。
