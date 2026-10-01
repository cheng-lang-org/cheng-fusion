# VERIFY_parseperf_1_2_append —— [PARSE-PERF] forest append re-intern 二次墙刀 + profiles 相每源 3 树解析砍 2 刀（族门一 PASS）+ 每源成本模型与 K 刀单

date_utc=2026-09-07 · 代理=PARSE-PERF 线（parser 成熟度一次性战役 M1 批次）· 克隆=/Users/lbcheng/cheng-f24/anchor_clones/parseperf（基线 commit c61bd4466=主树工作树全量冻结态；d36acff65=parseperf_1；cadd914f6+2r=parseperf_2）· patch=cheng-patches/parseperf_1_2.patch（403 行，git apply --check 主树干净）· 测量件=parseperf_bench 探针（双世界 A/B）+ mini-world overlay 驱动计费通道

## 结论先行

**M1+parseperf_2 两刀过族门一：配对烤机 cut_a2/cut_b2 sha EQ（32ca4cca…×2，同名 kernel_driver 约定——per-tag 输出名经 LC_UUID+签名区 111 字节差污染 sha 已实锤修复），四夹具门 pass=4 known_red=0 stale=0 树峰 1.02GB<1GiB，烤机报告契约 122 行零漂移，判词对 m14 认证 TSV 零漂移（probe_when/block STALE=克隆点早于 m14 修复的继承态，base 与 cut 同错同文；probe_try 判词向认证 TSV 对齐=错误暴露点从 profiles 相冗余树解析后移，根因 statement_offset 逐字保留）。刀体：①forest append token/typeSyntax 循环逐行全源 CloneStr+Intern（O(行数×源长)）改每源一次 remap 缓存（intern 池变更序不变）；②importc 列提取从全树解析改 token-only 走查（同词法器，构造性恒等）；③无 @ 字节源跳过注解应用树解析（保守超集守卫）；④text 直传消每源 2 次全文 rejoin。实测成本模型（mini-world 计费）：基线 10k 行源 ≈4.6s（split 251ms+join 1431ms+join 1104ms+types 268ms+depth 段 1116ms+edges 430ms），cut 后 1412ms；每源超线性主墙剩余=行扫描多趟调用礼金（形状矩阵：空行 5ms/注释行 275ms/let 行 620ms/@源树构建额外 ~1.2s）+ 大源树构建超线性项（10.5k 行实源 ≥15min 卡死，非本线刀域）。K 刀单（K1 深度扫描/K2 types/K3 分割/K4 edges/K5 lex 快路径）已立，bench A/B 通道免窗可测。**

## 一、刀体与字节论证

| 刀 | 文件 | 论证 |
|---|---|---|
| parseperf_1（M1） | parser.cheng +41/-8 | token 循环与 typeSyntax 循环逐行 `Intern(CloneStr(整份源文本))` 改 `remappedFullSourceIds` 每源一次缓存；被替换的逐行查找=纯函数（FindInternId 命中返回同值），池变更序=首见序不变；node 循环 CloneStrRange 语义缓存独立保留（长度列≠str 长角角形态无条件保形） |
| parseperf_2 A1 | parser.cheng | ParserNormalizedImportcTargetColumnsInto 弃全树解析改 token-only 走查：同一 LexSource 产 token 列（kind/line/col 构造性恒等），跳过语句事件+nodes+12 道严格验证（列提取从不消费） |
| parseperf_2 A1b | parser.cheng | 无 @ 字节 → 注解应用循环体不可能触发（词法器只从 @ 字节产 @ token）→ 整段树解析跳过；有 @ 字节走原路径（保守超集守卫） |
| parseperf_2 直传 | parser.cheng+typed_expr.cheng+tests | text 贯穿（6+1+3 处调用方），ParserSourceTextFromLines 全文 rejoin 消除（split/join 往返字节恒等） |

行为面变更（诚实报备）：畸形源的报错暴露点后移（原 profiles 相树解析前置拒绝 → 后续相同根因拒绝），probe_try 判词由包装形态变为 m14 认证 TSV 同形态；合法源输出零变化（族门+TSV 对账仲裁）。

## 二、族门一门禁表

| 门 | 结果 |
|---|---|
| 配对烤机 ×2（同名 --out，全冷禁缓存，cheng_w126 车头 246/262s） | **PASS**：sha256=32ca4cca8f84ce58e9dc786de57d95d5d169f2076c58c1ae900544b66c64d952 ×2 |
| 四夹具门 | **PASS**：pass=4 known_red=0 stale=0，树峰 1,020,149,760<1GiB |
| 判词对 m14 认证 TSV | **PASS**（probe_red 8 分布与认证一致；when/block STALE=继承态见结论先行；probe_try 向认证对齐） |
| 烤机报告契约 | **PASS**：两轮 122 行，diff 仅 argv sha/link log/output 路径+计时字段 |
| patch 纯度 | **PASS**：parseperf_1_2.patch git apply --check 主树干净；刀面=parser/typed_expr/tests 三文件 |

## 三、每源成本模型（实测，测量件=parseperf_bench+mini-world overlay 驱动）

基线世界 10k 行源（≈400KB）profiles 相解析 ≈4.6s：
split 251ms ＋ join#1（importc 扫描前全文 rejoin，ByteBuffer 线性增长致 O(n²) 拷贝）1431ms ＋ join#2（注解应用前 rejoin）1104ms ＋ types 268ms ＋ depth 段 1116ms ＋ edges 段 ~430ms；其中 importc 列与注解应用各含一次全树解析。
cut 世界同源 1412ms（joins/树解析已消）。形状矩阵（cut 世界，10k 行）：空行 5ms（骨架地板）｜注释行 275ms｜let 填充行 620ms｜+字符串 690ms｜1k decl 960ms｜@源（触发全树构建）1412ms。**行扫描多趟×逐调用礼金=剩余主墙；大源（10.5k 行 415KB 实源）树构建超线性 ≥15min 卡死（基线与 cut 同卡，独立于 forest append，非闭包成员，根因待逐段计费定谳）。**

## 四、K 刀单（下一步，bench A/B 逐项实测）

K1 深度扫描（ParserMaxQualifiedCallDepthLines 段 1116ms 级）→ K2 types 扫描（268ms 级）→ K3 SplitChar（251ms 级，行视图化是大契约缓行）→ K4 edges 段 → K5 lex/tokenizer 快路径（关键字首字分派+列批分配）。里程碑：常规 2-3k 行源 parse ≤0.05s/源；收益趋平两轮即交诚实分布。

## 五、纪律记录

- 自首：探针 overlay 首版引用声明前变量（编译 rc=2，35s 空转）；烤机壳 per-tag 输出名破坏配对 sha（LC_UUID 实锤，111 字节差）；探针超时退窗分支缺锚点剥离（一次 parser.cheng 脏态，git checkout HEAD 还原洁净）。三处均已修。
- 阻断移交：主树态自烤 plan 装配期败（import edge owner outside exact closure idx=53 owner=std/result，fdcaf7a8 洁净驱动×洁净世界 34s 复现，diag_base 现场保留已移交 PHASEB-PARSER 根修）；本线测量改道 bench+mini-world 通道。
- 烤机全程 bake_win 排队（PHASEB-PARSER bv6/bv7/d1、D3-LEDGER、主线程 m12/m14 在前，未越权）；测量运行（bench/驱动直跑）不在烤机锁域。
- 世界态：克隆 src/ 零脏（HEAD=parseperf_2r）；探针 overlay 应用/剥离以 /usr/bin/diff 对 .w/*.baseline 核验；bench 探针件在 src/probes/ 不进编译闭包。

## 六、K 轮追加（parseperf_3，克隆 commit 78653f472，编译验证 rc=0；计时 A/B 待静窗）

K5a 关键字表首字分派（40 对字典型审计守卫，曾抓漏 enum/import 两对后修正）｜K1 ParserMaxQualifiedCallDepthLines 融合重写（转义态增量跟踪消每引号反向 rescan；ident/前置关键字拒绝集/调用括号 fast 路径内联，慢路径委托原 helper，语义逐项对齐）｜K2 types 扫描无分配边界化（quote 感知 '#' 截断+四字符 trim 的 [segStart,segStop) 边界，消每行 2 次整行拷贝，type-block 候选行才物化切片）。
测量轮受他人并发裸烤污染（窗口空闲但 4 个未持窗 system-link-exec 在飞）：形状数字不可用作 accept/reject（D 形状反向 +41% 为噪声嫌疑）；静窗复测为族门二前置。主树已含 parseperf_1_2（m16/m17 合入落地，本 patch 在新基线上不再适用属预期）。

## 七、K 轮 A/B 定谳（免窗交错通道，min 估计器，双二进制 bench_cut=parseperf_2 态 vs bench_knife=K 后态）

| 形状 | K 前 min | K 后 min | Δ |
|---|---|---|---|
| a_fill（let 填充 10k 行） | 1077ms | 350ms | **-67%（3.1×）** |
| f_strings（let+串 10k 行） | 935ms | 510ms | **-45%** |
| b_decls（1k decl+10k 行） | 913ms | 621ms | **-32%** |
| t5000（5k 行+@） | 1131ms | 873ms | -23% |
| v10000（10k 行+@） | 1921ms | 1716ms | -11% |
| e_empty（空行 10k） | 6ms | 5ms | 地板 |
| d_comments（注释 10k 行） | 280ms | 370ms | +32% 未定（不触发 K1 内联主路径，机制应平/更快；负载漂移嫌疑，族门二静窗终证） |

判定：K5a/K1/K2 保留；收益集中于 ident/关键字密集行（K1+K5a 主收益），@ 源收益被树构建超线性项稀释（巨源定谳后另有空间）。族门二（配对×2+四夹具，持窗含门新规）待静窗执行。

## 主线程合入复验（2026-09-07，收割追加）

parseperf_1_2.patch git apply 干净落地主树；配对烤机 m16=m17=dc2dc67015d2557b02074e029f89a6874e0533e8ed87ba6f55e0e25cfd6c53c1（rc=0，210/219s）；全门认证 rc=0——四夹具 4/4、探针 11 绿 8 红 0 STALE，**树峰 909,443,072B（较 m14 认证 1,001MB 降 ~92MB，parse 刀内存实益）**；夹具编译 RSS 同步可见下移（ordinary 760→689MB）。主树现役认证驱动自此为 dc2dc670。

**A1 栈形 bug 实录（GEN2-BREAK 起点账抓出，合入协议缺口实证一号）**：A1 的 token-only importc 走查把「@importc 后下一 token」当目标——@importc 后栈着另一注解时（entry 形 @borrows/@importc/@ffi_handle 三连）错绑到注解 @ 行 → 自烤 rc=2 `parser annotation: invalid @importc`（230s，RSS 峰 919.8MB 未穿帽）。门链（w126 车头配对/四夹具/m16 认证）全用旧 parser 车头或无栈形夹具，**自烤是刀代码首次对真闭包执行**——「合入后自烤冒烟」收割协议的实证有效性一号。修法=importc 分支跳过同组注解找真目标（GEN2-BREAK 克隆内实施，8 行两形探针复现；栈形修复后从硬错变正确绑定，非栈形逐字节不变），修复件随其 checkpoint 交付。

## 八、forest 弹核账（GEN2 打穿链第二弹前置审计，2026-09-07）

**任务书**：自烤 400s 死段 100% 卡 forest append 逐 token 再 intern（decode 采样 Intern 60%+CloneStr 40%），RSS 364MB（森林 intern 池文本），目标 630s→100s 级。

**核账定谳（三重）**：
1. **时点存疑（已询主线程）**：decode 轮驱动若不含已合入的 parseperf_1_2（m16/m17），其「逐 token 再 intern」主墙正是 M1 remap 缓存的消灭对象，需新 decode 复测后墙，避免对已消的墙挥刀。
2. **免重 intern/池瘦身路已证死**：森林池 key=multiline 重写后全源文本（parserInputText，非 snapshot 原文），快照索引只保证 path 唯一不保证文本唯一（「arena 追加免哈希」预证不闭合）；森林池内容消费面=ProjectSpan 行投影+行级消费（typed/receipt/csg 多模块），改池内容=改产物字节面。
3. **现行成本结构（bench 实测）**：parse 线性 ~5µs/KB（小源 p50=15ms），内容敏感——connmanager（99 decls/1230 行/39KB）94µs/KB=20×（decl/表达式复杂度驱动树构建成本）；带@源（触发全树）vs 同规模无@差值≈1.37s/10k 行=树解析+append 本体。刀后态（parseperf_2）全管线每源全树解析只剩 forest 相一次。

**刀形预案（待新 decode 定序）**：F1=树构建常数族（LogicalLineEnd 每行多趟 token 访问器礼金——43 处 TokenLineAt/TokenKindAt 逐 token 调用、复杂度敏感路径）；F2=Intern 三件套常数（调用方 CloneStr+池内 hash+exact 全 O(len)，可并一趟）；F3=profiles/forest 两相文本管线合一（复用 rewrite 产物）。

## 九、m1d 新墙账+F 刀首批（2026-09-07，克隆=refresh d35304068→aabd0420e→f97c2efe5）

**m1d 分相账（K+F2 态驱动，900s 帽自烤，暗区 4 锚点）**：
| 段 | 耗时 | RSS |
|---|---|---|
| enter→after_profiles | **99s**（原始 249.4s→m2d 140.4s→**本刀态 99s，累计 -60%**） | 615MB |
| metadata_contexts | **16s**（非主墙；+155MB RSS 贡献） | 770MB |
| source_identity_index | 0.04s | — |
| **forest authority（死段）** | **~615s（734s 总墙-其余），RSS 段内穿门 rc=125** | 770MB→破门 |

**F1 内部构成定谳（免窗 overlay 驱动×复杂形状 13.3k 行）**：树读=事件生产 **75%**（2953ms）+验证 17%（658ms）+词法 8%（305ms）；@ 源树读跑两遍（profiles 注解慢路径+forest）。split_enter 记账 571.9s（剔除时钟伪影）=未埋点树工作主体。

**F 刀首批交付（克隆 commit）**：
- F2（aabd0420e）：intern 首见路径单哈希+InternOwned 免池内二次 CloneStr（5 热点切换），存储字节/探测序/id 序不变；
- F1a（f97c2efe5）：LogicalLineEnd 热循环扁平化（携带态+裸 arena 读），events 段实测 **-15%**。

**下一段**：F1b=ProcessStatementCoreRange 递归族（events 段剩余 85% 的所在）；F3=两相文本管线合一；族门二（K+F2+F1a 一起，持窗含门新规）。std/system coverage mismatch 缺陷哨兵：m1d 全程未触发（239 源含 std/system 链），本代驱动态无此缺陷征象。

## 十、F1b 定位 verdict + 交接协议两条（2026-09-07）

**F1b 定位（macOS sample×shape_u_complex 4s 采栈，primary.o.map 解码）**：热帧 ~40% 在 arena 列原语（arenaLoadU32 376/ArenaArrayInt32Add 274/ArenaArrayInt32Get 290/arenaStoreU32 240/共 3172 采样）；**包装层 arenaLoadU32(376) 比 @importc 原语 cheng_u32_load_at(141) 热 2.7×**——每次 SoA 列读=双重函数调用+arena.basePtr ref 字段重复解引用。主帧=BackendDriverDispatchMinSystemLinkExecWorker（13MB 内联单体，worker 全量内联形态）。刀形单：①token 行批量读（kind/line/start/end 四列一次调用，4 wrapper→1）②热消费循环直连原语（arena.cheng 域内 wrapper 直通化）③basePtr 循环外提（域内）。红线遵守：ptr 不出 arena.cheng 公开面。

**coverage mismatch 哨兵注记（D3 线线索归档）**：m1d 自烤全程（239 源含 std/system 链）与族门一四夹具门均未触发 sha256 coverage mismatch；D3 线复现形=「编 import std/system 的用户程序」——**形态待定性：非自烤路径、特定 import 形触发**，以 D3 线成分矩阵（4/4 实证）为引，本线两个门均为阴性哨兵。

**幽灵锁协议（后续线沿用）**：bake_win 锁心=owner 文件；目录存在但 owner 缺失且目录 mtime>60s=幽灵锁，允许 rmdir 接管后重新 mkdir 竞争（PARSE-PERF acquire 实现于 .w/pp_m1d.sh，约 00:25 实战解过一次 40min 死锁）。

## 十一、F1b-1 实测否决记录（2026-09-07）

**刀**：arena.cheng 五点 wrapper 直连（Get/Set/Add/AddReserved/Add-grow 拷贝的 arenaLoadU32/arenaStoreU32 → @importc 原语直呼，签名零变化）。
**实测**：shape_u_complex events 段 2499ms(F1a 后)→2675ms——噪声带内无正信号。
**判读**：sample 解码的「wrapper 2.7× 热于原语」为帧归因偏差（sample 计叶子/自帧方式），C 链早已内联单行 wrapper，双重调用开销不存在。**实测否决即弃，已 revert（src/ 零脏于 f97c2efe5）**。教训入账：sample 帧热度差≠可削开销，刀必须过 A/B 才算数。
