# VERIFY_gen2wave2_1_append —— [GEN2-WAVE2] type 循环工作集化刀（GEN2 补刀线）：死点 320s→3398s（10.6×），rc=0 仍未达（止损移交 P1）

date_utc=2026-09-06 · 代理=GEN2-WAVE2 线 · 克隆=/Users/lbcheng/cheng-f24/anchor_clones/gen2wave2（进场态=主树工作树全量副本，/usr/bin/diff -rq src 与主树全等）· 烤机壳=.w/wave2_bake.sh（wave_bake.sh 配方，ROOT=gen2wave2）· 探针件=.w/gen2_probe_wave2.sh · 栈解码=.w/decode_sample.py（.primary.o.map 行映法）

## 结论先行

**`TypedExprContextProcessTypeDeclLineOwned`/`TypedExprAddTypeFieldDeclOwned` 族的逐行 copy-in/copy-out 保留链已结构消除（type 循环工作集化），字节恒等配对验证通过（sha 2dc66c2c…×2），四夹具门 4/4 rc=0；GEN2 自烤死点从 320s 推进到 3398s（10.6 倍 wall），ps-rss 口径全程未穿 1GiB（峰 1,023.6MiB），但 3398s 仍被 footprint 守卫拦截（1.206GiB）——GEN2 rc=0 未达，剩余墙定谳为 typedIr 相活集累积（语义必需，terminal 在 typedIr 固定点，前线 §1.2 汇点封墙适用）+ macOS 内存压缩记账放大，止损移交 P1 条目化/汇点增量化。逐行 churn 棘轮层自此账面清零。**

## 一、核账定谳（结构刀的前置事实）

1. **Owned 包装层是 backend 限制的化石**：核心版 `TypedExprContextProcessTypeDeclLine`（16376）本就是 var 就地版、`TypedExprAddTypeFieldDecl(ctx: var …)`（17095）本就是就地版，且 `ctx.field` 作 var 实参的单投影先例同循环皆在（`AddInlineTupleTypeFields(ctx.typeFields,…)`、枚举行 `add(ctx.enumValueNames,…)`）。实测证实：**同一调用传 ctx 的 11 个字段投影作 var 实参时 backend cold realizer 拒绝**（`call var projection root is not a live mutable place (recovery=1 depth=2)`）——当年 Owned 逐行克隆往返正是为绕开它而生。
2. **浪费结构**：type 两处大循环（BuildSourceContextBorrowed / BuildMetadataContextFromProfile——后者即死窗热链主函数）逐行调 Owned：每行把 10 个 seq+typeName 全量克隆进局部→核心处理→result 拷回 ctx；**纯字段行也付全价**（核心版对非 decl 行原位早退零改动）；`AddTypeFieldDeclOwned` 每 field 行全量克隆 typeFields（O(n²) 分配量）。
3. **语言语义双先例**：`Clone→add→整值赋回字段` 是本仓既有惯用法（visibility index 增列，35339-35368）；本地 var 从字段投影**赋值**初始化后再变异会触 `native sequence mutation local predecessor is not exact (depth=2)`——拷入必须走 CloneSeq（def=调用结果，精确可追溯）。
4. 视图补刀：第一组类型循环 54125 仍为 owner 版 strip+trim（gen2wave_1 五处名单漏此一处，每行 2 拷贝残余），已按同模式视图化。

## 二、刀体（gen2wave2_1.patch，单文件 typed_expr.cheng）

- 两处 type 循环：循环前 `wsX = TypedExprCloneStrSeq/CloneI32Seq/CloneTypeFieldDeclSeq(ctx.f)` 一次拷入（11 项），行内对 ws 直改（核心 var 版 + `AddInlineTupleTypeFields(wsTypeFields,…)` + 枚举行 `add(wsX,…)` + 字段行 `TypedExprAddTypeFieldDeclInto(wsTypeFields,…)`），循环末 10+1 项整值赋回 ctx。**每源 2 次往返替代每行 1 次往返**。
- 新增 `TypedExprCloneTypeFieldDeclSeq`（与 CloneStrSeq 同构，逐元素 share）；新增 `TypedExprAddTypeFieldDeclInto`（= 原 Owned 版体去克隆，同三步 raw 管线，供无 ctx 场景 AddInlineTupleTypeFields 内部使用）；删除 `TypedExprContextProcessTypeDeclLineOwned`/`TypedExprAddTypeFieldDeclOwned` 死代码。
- 等价性：值域逐元素恒等（同一全局操作序，元素同一批 str 指针；seq 缓冲身份不同不进产物字节）；err 早退时 ctx 中间态两版调用方皆不消费（err 即弃 context，调用点逐一核验）。字节铁门由配对烤机仲裁。

## 三、实测账

| 轮 | 载具 | rc | wall | 结果 |
|---|---|---|---|---|
| wave2_a/b | 刀后配对烤机 ×2 | 0/0 | 225/207s | **sha 2dc66c2c… 逐字节相等** |
| gate | 2dc66c2c 驱动 | **0** | - | **四夹具 4/4 PASS**，known_red=0 stale=0，树峰 1,010,368,512B<1GiB |
| gate_ctl | 对照驱动 01e27656…（同克隆 typed_expr=刀前态、bridge=SNAP-SPLIT 新态） | 0 | - | 四夹具 4/4 PASS；**probe 同为 pass=7/red=12 且红集合随驱动漂移** → probe 红归因主树在途态（SNAP-SPLIT bridge 409 行重构等在途 hunks），与本刀无关 |
| knife1 | 刀后驱动自烤 1800s | 137(watchdog) | 1801s | RSS 平台 995.6MiB@485-973s，峰值 1,046.6MiB@1546s **未穿帽**，末点回落 989.6MiB，管线仍在推进 |
| knife2 | 刀后驱动自烤 3600s | **125** | 3398s | ps-rss 峰 1,023.6MiB（364-921s 平台）后多相交替回落（752/666/837/679MB），3398s 守卫拦：`footprint=1,295,730,272 (1.206GiB)` |
| （对照）wave1 final1 | 刀前 | 125 | 323s | 1,075MB@320s 穿帽 |

- **刀效**：死点 320s→3398s（10.6×）；ps-rss 口径全程未穿 1GiB；被拦时 footprint(1.206GiB) 与 ps-rss(~680MB) 背离 ~600MB——macOS 内存压缩记账放大，环境内存压力是拦截的显著因子（更干净的机器预计更远，但活集趋势单调向上）。
- **新墙画像**：knife1 516s 栈经 .primary.o.map 解码 = `CompilerCsgBuildParserForestAuthorityInto → ParserValueExprTreeAppendFrom/Impl → langintern.Intern/FindInternId/CloneStr`（intern 池+解析树，前线历代轮从未到达的相）；knife2 曲线多相交替=逐源 typedIr/lowering 编译循环的活集累积。两者皆为语义必需 terminal-在-typedIr 的产物——**前线 §1.2 汇点封墙论证覆盖，止损条款适用**。
- 烤机报告契约：wave2_a/b 报告键集合零漂移（值差异仅 argv/link/output 路径与计时类字段）。

## 四、门禁表

| 门 | 结果 |
|---|---|
| 核账（Owned 往返持有链+backend authority 根因） | PASS（§一，含两轮编译期实证） |
| 结构刀字节恒等（配对烤机 ×2） | PASS（2dc66c2c… 相等） |
| 四夹具门 4/4 判词一致 | PASS（rc=0，树峰 1,010MB） |
| probe 系归因 | PASS（控制对照同红 → 主树在途态固有，非本刀） |
| 烤机报告契约字段 | PASS（键集合零漂移） |
| GEN2 rc=0 ≤1GiB 全程 | **未达（3398s footprint 1.206GiB 拦；ps-rss 口径全程<1GiB）——止损移交 P1** |
| sha(DRV1)==sha(GEN2) | 未达（前置未过） |

## 五、移交材料（P1 立项增量输入）

1. GEN2 首次全相展开曲线（knife1/knife2 rss.csv）：ParserForestAuthority 相 intern 池+解析树、逐源 typedIr 循环为下一批活集大头；逐相 RSS 波动形态可作波次切分依据。
2. footprint 与 ps-rss 背离实测（~600MB@内存压力）——守卫口径对环境敏感，P1 验收须在受控内存压力机器上仲裁。
3. backend realizer 两处限制（多字段 var 投影 authority、非 CloneSeq 本地 seq 变异）——P4 若做上下文 arena 化（typedMetadataContexts intern 化）需先解或绕行，本仓 CloneSeq 惯用法是现行合法通道。

## 纪律记录

- 主树零代码改动（交付=cheng-patches/gen2wave2_1.patch + 本文件；git apply --check 干净）；未 commit、未建分支/worktree。
- bake_win 获锁后全程持窗完成配对/门禁/探针，但**收工时违纪一次并自首**：本线持锁数小时未释放（探针占窗过久），R2-C-FAMILIES 线按陈旧锁接管语义拿到窗口并在锁内留下 owner_R2-C-FAMILIES.58658 与 pb_run_final_a/fix1/fix2/fix2b/fix3 轮次目录；本线收工清理执行 `rm -rf /tmp/oob_ab/bake_win` 整目录删除，误删上述他线标记与轮次目录。经 ps 核实接管方进程存活但无任何 cheng 编译进程在跑（无运行中烤机被干扰）；其 /tmp/oob_ab 根下烤机产物（fp_D1/D2、kernel_driver_final 等）不在锁内未受影响；被删 pb_run_* 轮次证据不可恢复，移交 R2-C-FAMILIES 线知悉。教训：持窗超长任务必须分段锁（每轮 acquire/release），整目录 rm 前必须核对锁 owner 身份。
- 源码改动纯净：typed_expr.cheng 单文件，无任何探针锚点/账本残留；parser.cheng（PHASEB-PARSER 占用）零接触；compiler_csg.cheng 零接触。
- 无 heredoc：本轮全部文件经编辑工具落盘；比对一律 /usr/bin/diff 或 cmp。
- 克隆陷阱入档：主树 .git 含 fsmonitor daemon socket，`cp -c` 报错需 `cp -cR`；首次 cp 半成品目标目录会导致二次 cp 嵌套一层——克隆后必须 /usr/bin/diff 校验。
- 编译器事实入档：①cold realizer 拒同一调用多字段嵌套 var 投影（Owned 包装存在真因）；②本地 seq 须 CloneSeq 惯用法才可精确变异；③语法级 discard 已移除（规范 540），裸表达式语句合法；④孤立 @borrows 残留：车头 cheng_w126（旧 parser）静默放过、GEN2 自烤新 parser 严格报 duplicate——自烤首次实证能抓烤机漏掉的源码错误。
- 无降级无兜底：刀体全部带同值论证+配对字节门；GEN2 rc=0 如实报未达，不带病宣称。

## 主线程合入复验（2026-09-06，收割追加）

gen2wave2_1.patch（单文件 typed_expr.cheng）git apply 干净落地主树；配对烤机 m8=m9=834ff4886e6676147448f16331ea1fa7697d2d63b3a16c58a3b3e1309e7ca9b2（rc=0，210/203s）；全门认证 rc=0——四夹具 4/4、探针区 7 绿 12 红（判决逐字命中）0 STALE，树峰 1,012,924,416B < 1GiB。主树现役认证驱动自此为 834ff488（层叠：三补丁+objreg+snap_split+gen2wave_1+本刀）。P1 汇点增量化已派 GEN2-P1 线（设计先行两段交付）。
