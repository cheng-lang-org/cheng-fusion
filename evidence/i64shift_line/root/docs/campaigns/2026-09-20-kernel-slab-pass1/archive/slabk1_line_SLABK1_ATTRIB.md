# SLABK1_ATTRIB — slab 役刀 1（parser 分段机制，纯新增）施压档案

日期：2026-09-20/21。线：`.rebuild/slabk1_line/`。锚 HEAD `e2ff96144`。
施工依据：`.rebuild/slabdesign_line/SLAB_DESIGN.md` §5 刀 1。
冻结补丁：`.rebuild/slabk1_line/slabk1_parser.patch`
sha256 = `b3bb41cae3c484b3f324705e7ade83a09ad4da19d977a9fb5d829b79a04b6523`。

## 刀规模

- `src/core/lang/parser.cheng` 单文件，**+642 / −0 行，2 hunk**，纯新增：
  ① produce 环静息点观察调用（:28099 前，块闭包判定后/分派前）；
  ② 入口诊断钩子（成功路径 `return true` 前，env 门内）+ 新代码块
  （globals/gate/静息点观察器/`ParserValueExprLexSourceRange`/
  段级重放 `ParserSegmentDiagParseSegment`/家族分区对拍
  `ParserSegmentDiagCompareSegment`/度量主入口 `ParserSegmentDiagRunFromTree`）。
- 旧入口 `parserValueExprReadTreeFromTextMode` 调用点零改动（全仓 8 处
  caller 均为既有 wrapper/内部点，补丁未新增任何调用点——grep 在案）。
- 机制：段界 = produce 静息点（无开启 type/routine/binding 块 + 注解组
  闭合：`@` 行 pendingAnnotationCount==0 开新组、携带注解目标行不入新
  段界）；`LexSourceRange` = 整源文本 + 段字节域 + 绝对行列基；段级重放 =
  fresh-arena（零 reserve 零 census）+ 段内 module-const 收集 + 主表按名
  播种 + produce 段 token + forwarding seal + 12 项 strict validate。

## 行为不变四重证明（缺省 env 全零改动）

1. **金丝雀 2/2**（B 臂驱动 `kd_slabk1_b`
   sha256=`ea607c4075a7976b5d7dcdcb20b0224cfc2c46735f85cd365a49c41316557bef`，
   同日同门单变量，A 臂 = HEAD 原样
   `dddad9cf57f33067bb90dab1204af00051a4b8e9b8a79551026bbf9e51ed593c`）：
   `fn main(): int32 = return 0` compile/run rc=0；ordinary_zero_exit_fixture
   compile/run rc=0。
2. **四合同 primary.o 双臂逐字节恒等**（cmp，A/B 臂驱动同 root 同闭包）：
   ordinary_zero_exit_fixture / call_fixture / cold_nested_fmt_interpolation_smoke
   / v6_direct1_repro —— 4/4 `primary_o=IDENTICAL`（`contract_summary*.txt`）。
3. **四夹具判词恒等**：compile rc + run rc + stdout/stderr 双臂逐字节一致
  （run_rc=0/1/0/0 与 HEAD 臂逐一相同）。
4. **env 门缺省零路径**：观察器/诊断钩子全部 `ParserSegmentDiagEnabled()`
   （env `CHENG_PARSER_SEGMENT_DIAG=1` 才开）或 `parserSegmentDiagSuspend`
   门内；缺省零读零写，四合同字节恒等为其机械证明。

## lex 续行诊断轮（SLAB_DESIGN 最大技术风险裁决）

**结论：无命中 → 留证，设计不回炉。**

- 零烤静态回放器 `static_replay.py`（逐算法移植 parser.cheng e2ff96144：
  LexSpan/LogicalLineEnd/Extend 家族/produce 迭代结构/多行字符串源文重写
  :2268-2477）：全语料 5802 文件（src/**，剔除 .orig/.tmp-exec）可回放
  5786；编译器闭包（静态 import 闭包 = 恰 234 文件，`closure_files.txt`）
  **234/234 回放零错**；段界切在多行构造/字面量/注释内 **0 例**；同物理
  行段界 **0 例**；注解行携同线声明 **0 例**；段切片回放静息结构 == 整源
  切片 **234/234**。16 个不可回放文件与闭包交集为空（现行严格校验会拒的
  形 + 负例件，冻结 stage3 是旧宽版）。详见 `CENSUS_DIAG.md`。
- 烤后 in-compiler 对拍轮（`diag_gate.sh`，抬门 3.6GiB 诊断轮，驱动
  ea607c40，clone root = git archive HEAD + 冻结补丁）：**234/234 源、
  46484 段重放、mismatch_total=0、零 parse_fail、零分区违例**
  （`segment_readings.txt`）。lex 分段续行恒等（字节域/绝对行列/字符串
  子流）在全部闭包源上实证成立。

## 真实 per-decl 读数（刀 2 消费；`segment_readings.txt`）

| 量 | 读数 |
|---|---|
| D（段总数/闭包·单遍） | ≈23242（重放 46484 = 两遍） |
| max_seg_bytes（重写文本域） | 466,876 |
| max_seg_arena（fresh-arena 实测） | **42,008,704 B ≈ 40.06 MiB** |
| med / p90 / p99 seg_arena | 16,512 / 129,536 / 543,936 B |
| Σ seg_arena（两遍） | 2,760.4 MB |

max_seg_arena 40.06 MiB 落在 x2cut §7 worst-slab 41.4 MiB 校准带内
（偏差 <4%），med 16.5KB；SLAB_DESIGN §3.5「真实最大段」常数就此钉定，
刀 3 开工门（62 MiB 硬余归零点）远未触及。

## 施工记录与教训（诊断轮三轮归因）

- 第一轮崩 `arena array: read out of bounds` @ src=2 seg=322：① 段重放
  内 produce 复入同一观察器全局（重置了正在迭代的 bounds）→ 加
  `parserSegmentDiagSuspend` + planBounds 快照；② compare 家族主侧
  off-by-one（scopes）→ 修正。
- 第二轮同点再崩：map 解码栈（`kd_slabk1_b.primary.o.map` 逐帧函数名）
  钉定崩点在 `ParserSegmentDiagCompareSegment` → 家族主侧加分区守卫 +
  四处 name/anchor span 解引用改归一化引用比较（`-1` 引用不再解引用）。
- 第三轮守卫兜出真因：**`tree.tokenCount` 在 produce 后含 Fmt 插值子流
  行**，RunFromTree 以其为 tokenTotal → 末段计划切片落进子流坐标，
  byteStart 落在字面量内部 → 截断 lex（seg 树仅 31 token vs 计划 233）。
  修 = 观察器在 produce 起点快照主流数 `parserSegmentDiagMainTokens`。
- 过程纪律事故两起（自查）：shell heredoc 使用两次（纪律禁用）、一次
  `&` 尾随脱管（纪律 8）——均已当场纠正/记录，未造成假绿。

## 门与证明的边界（如实陈述）

- 对拍诊断轮为**抬门诊断轮**（3.6GiB，约束卡允许排墙，不计达标）：
  对拍驻留使默认 768MiB 门在后段源打穿；本刀达标证据 = 四重行为不变
  证明（全部默认门内），诊断轮只产出对拍判词与读数。
- 崩溃三轮均在**诊断读数路径**（env 门内），生产行为不变证明不受影响；
  最终冻结补丁含全部守卫，对应驱动 ea607c40 重过四重证明。
- 刀 2/3 待 phase-1（idx 延迟 + D6v2）落地后开工（SLAB_DESIGN §5 依赖）。
