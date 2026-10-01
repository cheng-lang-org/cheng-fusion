# wall101.VERIFY

## wall101 报告：W2 源文本三拷贝 share 化落地（CloneStr/newStringCopy 两分配点消拷贝），字节铁门三方全同 GREEN；RSS/墙钟因并行线同窗噪声不记性能信用（移交静窗中位数复测）；四夹具判词 stale 双侧对称=并行线树态漂移，非本臂归因

日期 2026-09-02。授权面=src/core/tooling/compiler_snapshot_builder.cheng 与 src/core/tooling/semantic_snapshot_incremental_plan.cheng 两拷贝点及其消费链。烤机 3/3 轮（配对 2 + 备用 1，全部 CHENG_DISABLE_COLD_OBJECT_CACHE=1 禁缓存）。

### 三层证据（w46/w88 方法学）
1. **拷贝链定位**：`compilerSnapshotProductionInitialFactsBuildInto`（builder:10980，唯一生产调用点 builder:11444）`strings.CloneStr(canonicalSourceTexts[i])` 填 `input.sourceTexts`（拷贝 2）→ 同函数内即调 `SemanticSnapshotIncrementalPrebuildFactsMakeInto`（plan:756，生产调用点仅此一处；tests 直调签名不变）`system.SystemToStringStr(input.sourceTexts[i])` 填 `facts.sourceTexts`（拷贝 3）→ MakeInto 返回后 `input` 即亡、其克隆随亡；facts 携拷贝 3 存活至 Unsealed 构建窗终。三拷贝=canonical 原文 + CloneStr + SystemToStringStr（后者=newStringCopy=strOwnedAlloc+memCopy 深拷贝，实测 src/std/system.cheng:2657/2800）。
2. **消费面**：facts.sourceTexts 全部读点=plan 文件 620/683（StrictValidateInto 逐行重哈希 CsgCompilerSourceContentCid 与 body 前像 CID）——纯读；无任何写回/逃逸出编译窗的持有者；canonical 池（tables.texts）本身已全量 share 化（builder:490/14341/14347 同文件先例）。
3. **可复用零拷贝先例**：语言级 `share()`（ORC 引用计数共享，规范 docs/cheng-formal-spec.md §0.2，不做隐式拷贝、无悬垂可能）；同文件 builder:490 `share(completeTextInputs[i])`、:14341 `share(tables.texts[row])`（var 参数字段+索引投影，与本臂两改动点同形）在产线已编译运行。**修法选型=①消拷贝（share 视图），非②延长寿命、非③必要拷贝。**

### 修法（wall101.patch，sha256=4b31a1ae…9a6b1，702 行 vs HEAD 累积式含在树前臂 hunks，reverse-check 过）
- builder:10979-10984（1 hunk，净 +4/−2）：`strings.CloneStr(...)` → `share(canonicalSourceTexts[canonicalSourceId])`。
- plan:756-761（1 hunk，净 +4/−2）：`system.SystemToStringStr(...)` → `share(input.sourceTexts[sourceId])`。
- 字节面论证：share 仅 RC+1 与 16 字节 str 结构拷贝，缓冲逐字节同一 ⇒ 全部 CID/前像哈希输入不变 ⇒ 下游判定与发射零变化。零悬垂：ORC 计数持有，无生命周期证明负担；毒化网（wall75）全程零 UAF。

### 门禁与验收实况
| 门 | 结果 |
|---|---|
| 秒级门 cheng_now3 --emit:obj 两改动文件 | 各 rc=2 **既有死因 A/B 对比后零新增**：builder 唯一死因 `expected indexed assignment value`（字节 666848→667100，位移=本臂 +252B，同点同形）；plan 唯一死因 `add(value) borrowed source requires explicit share`（3033→3035，offset 147794→148030，=本臂 +236B，同点同形诊断列全同）；两死点均在本臂 hunk 之后（parser 顺序/分析顺序实证 hunk 先被无错通过），独立秒级门形态伪影，非树态/非本臂 |
| 车头 cheng_w101（clang rc=0，13 既有 format 告警）× zz_v6_w7 | compile rc=0（--emit:obj，6116B） |
| **字节铁门（同名 --out 配对 sha256）** | **ordinary 与 call_fixture 产物三方全同**：driverA=b226dd22…e66a / driverA2=164d5fac…ebec1 / driverB=55c481a9…d6b3c，两独立窗口配对编译，ordinary sha=7b790604…7c44×3、call_fixture sha=e5801ebe…5a7cf×3（含争用窗复跑同哈希） |
| RSS（ordinary 编译峰值，maxrss） | 同窗背靠背：run2 A/B=921.8→684.5MB（−237.3）；run3 A2/B=678.7→716.9MB（+38.2）——**跨窗符号不稳，单样本 maxrss 被同机并行线负载支配（同 driver 同夹具跨窗差达 ±200MB），按 lessons:165 不记性能信用**；−87MB 峰值项的机制层（两份全文深拷贝消除）由补丁差分+字节铁门背书，RSS 信用移交静窗 ≥5 交替中位数复测 |
| 墙钟（ordinary/call_fixture 编译） | run3 静窗：140.61 vs 139.88s、140.94 vs 145.95s（±3%），深拷贝消除属 memcpy 级收益，单样本无信用，同上移交 |
| 四夹具判词回归 user_path_gate.sh | driverB：ordinary PASS(0/0)、call_fixture PASS(0/1)、cold_nested STALE、v6 STALE；driverA2：call_fixture PASS、cold_nested STALE（**核心判词与 B 全同** regalloc_production_emit_failed@nestedFmt__L1 code=10 detail=22 ops=31 slots=22，仅尾随 diag 列因并行线改动相异）、v6 STALE、ordinary 格被租约污染(rc=2，pair 轮已证同产物)。**STALE 双侧对称=树态漂移非本臂**：判别实验 driverA（无补丁，S1 树）×v6 判词与 driverB（有补丁）**逐字全同**（`exact identity schema [freeze] fn=2 op row=1 slot=3 #nev34 slot authority mismatch def_type=20 slot_type=16`），而 A2（S3 树）相异——判词随并行线 primary_object_plan S2→S3（16:17/16:52 落地）移动，与补丁无关 |
| 毒化网 UAF | 全部配对/门禁 stderr+log 扫描零命中（uaf_scan_clean） |

### 烤窗并行线干扰如实记录
A（16:10 指纹）→B（16:24）窗间 primary_object_plan.cheng 落地改动（16:17）；B→A2 窗间 primary 再改（16:52）+exact_def_identity（17:16，不在任何一烤）+regalloc_production_emitter（窗内晚段）。三烤非单变量配对；本臂归因链=①字节铁门三方全同（含并行线改动同在的最强组合下仍逐字节同）②A vs B v6 判词全同判别③秒级门 A/B 零新增死因。附产观察（授权外移交）：增量计划 smoke 夹具在当前树态冷前端 rc=2 `call var projection root is not a live mutable place`（BuildPreviousTables×CsgCompilerTypeRowCidInto，A/B 同死，pre-patch 树实证）；kernel 驱动族对同夹具确定性 139 段错误（A2/B 对称、零输出早崩）；src/core/backend/system_link_exec.cheng 单文件 --emit:obj 在 A2/B 均 139（24s/130MB）——三处同族，疑并行线中间态，非本臂面。

### 交付与统计
- /tmp/oob_ab/wall101.patch（sha256=4b31a1aee62686811fae2340d3e001fb243d0c2a1123cff9821c8c569a69a6b1，702 行，累积式 reverse-check 过；本臂净归属 2 hunk：builder 1 + plan 1）
- git diff --stat 分文件：apply 前 builder +445/−89（534 行）、plan 0 → apply 后 builder +449/−91（540 行）、plan +4/−2（6 行）
- 烤机 sha256：kernel_driver_w101a=b226dd229212feca4536e98d64a4f710da367fbb20a16fc20d3305cb3b15e66a（185018784B，256.59s，maxrss 757MB）；kernel_driver_w101b=55c481a93978838bb272c6c8f462d82cd88eaac09653d2395bf2b49b556d6b3c（185051664B，223.05s，754MB）；kernel_driver_w101a2=164d5fac67b42a960da5b30a6b06e83c44c75788cd9cb98dc8e5e9424faebec1（备用轮）；车头 cheng_w101=387828fc95627dd1…（clang rc=0，bootstrap 快照 5313ea93，窗内 w102 在改）
- /tmp/oob_ab/w101/：三烤 log+指纹 A/B/final、秒级门 pre/post 六 log、pair/ 配对全套（compile/stderr/time+三方产物 sha）、v6_head.o（车头门）
- 探针未落地（增量计划 smoke 在当前树态被并行线打破，mem-probe 不可编译，已按零残留清出 src/tests）；编排者资产（zz_v6_w7.cheng、user_path_gate.* 工作目录）零触碰；未 git commit；主树仅动两授权文件；烤机 3/3 轮；无降级/兜底/弱化守卫
