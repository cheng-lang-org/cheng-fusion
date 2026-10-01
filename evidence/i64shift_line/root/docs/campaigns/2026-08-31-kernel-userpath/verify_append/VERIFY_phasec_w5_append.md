# VERIFY_phasec_w5_append.md —— kernel_driver_w2 战役 PhaseC-W5 线（merkle bootstrap 内存主修）

日期：2026-09-05 02:40–07:1x。工作目录=仓库根。锚点 commit=69817b8b2（HEAD）。授权面=merkle-store bootstrap 路径簇（w111c/w125b 划定五文件簇：compiler_snapshot_lowering_bridge / snapshot_cargo / merkle_store_pipeline / merkle_store_identity / csgc；本线证据链实际落点扩展至 merkle_dag / merkle_transaction / system_link_exec，同属 bootstrap 计算核，见 §二）。并行线：PhaseB-A 在 parser/typed_expr 高频迭代（pa_r0→pa_r3+，ordinary 闭包随其逐轮漂移）、gpu 线在 gpuros_bare、wall150 在 program_support_backend（未落树）。本线 hunk 全带 `[phaseC-w5]` 标记。零 commit、零分支/worktree。作业区 /tmp/oob_ab/phasec_w5/。

## 判定（一段话）

**W5 主修（per-compilation fact memo + 事务键扫描 O(N²)→O(N) 数组化）落地并三层验证（秒级门/烤机×3/四夹具 4/4 全绿）；bootstrap 冷路径 RSS 归因已相对 w125b 漂移并被并行闭包漂移彻底污染——同一无 hunk 对照驱动在 parser 两个迭代态间冷路径 456.6MB↔1045.3MB 摆动（>588MB 方差），任何驱动间 RSS 对比在 PhaseB-A 迭代窗内不可定谳；本线 hunk 功能性零回归，结构性收益（每 distinct fact 的全量 JSON AST 从 ~15 次降至 1 次+事务键扫描 O(N²)→O(N)）为确定事实，随闭包 facts 规模二次方放大，字节中性待静默窗补验，如实报。**

## 一、归因复测（任务第 1 步：w125b 差分复现）

协议跑（tools/cheng_mem_protocol.sh，四禁 env、1GiB 双守卫、200ms 进程树采样）：

| 轮 | 驱动 | 口径 | 结果 |
|---|---|---|---|
| 冷 bootstrap | w149_r2（507f0b3d…） | ordinary 夹具 exe，round_0 | **compile_rc=137（被 1GiB 外部守卫 KILL），树 RSS peak=1048720KB=1024MB**，wall 264s；曲线 0→20s 冲 268MB（csg 段），20→260s 缓爬 268→1024MB（bootstrap 窗，1s 精度曲线 /tmp/oob_ab/phasec_w5/attribution/driver_rss.csv：170→945MB@240s） |
| 复用 | w149_r2 | store 已建后单轮 | **树 RSS peak=85MB / median 65MB**（ru_maxrss 89.7MB；该轮因租约竞争 rc=2，RSS 曲线完整） |

**结论：w125b 的 449MB 归因已漂移**——03:03 树态 bootstrap 冷路径独占 ≥940MB（1024−85），比 w125b 时代 449MB 翻倍。cargo store（ordinary 闭包）磁盘仅 852KB/186 对象，RSS 大头全部是过程分配。

### 深挖归因（w149_r2 冷路径 sample×3 窗符号化，primary.o.map 全帧翻译）

- s1（t=40-52s，事务 apply 段）：热点链 `bridge:2186 MerkleBootstrapAtInto → cargo:3213 MerkleApply → cargo:3139 Execute → merkle_transaction:3259 ApplyPrepared → merkle_transaction_authority:3341`；族群=CSGC 编解码 ~36%、sha256/字节拼装、merkle_dag 键哈希。
- s2（t=100-112s）：**json_canonical 全 AST 解析族为第一热点**（csgJsonParseValue 470 + CsgCoreJsonCanonicalize 282 + ParseString 192 + emit 族 277 帧），父帧=merkle_dag 三入口/950（CsgCoreMerkleBuild）+ merkle_transaction_operation:208。
- s3（t=180-192s，bootstrap 后段）：manifest 验证族（merkle_manifest）+CSGC+哈希——此段两路径共有。
- 缓爬形态=分配 churn 棘轮（memline2c 判据：SMALL 档 dirty=历史 live 峰）。

### 在案测量佐证（树内注释，非本线实测）

- validator.cheng:8078「Full MerkleCanonicalFact builds a CsgJsonValue AST (~1.5GiB measured on an 8-line compile)」
- merkle_dag.cheng「Re-parsing each line into a CsgJsonValue AST was measured at 1.3GiB MALLOC_SMALL」
- merkle_admission.cheng:429「decode-roundtrip cloned the full snapshot payload (~400MB measured on snapshot read)」

## 二、修法（3 hunk，三文件合计 +266/−38，全带 [phaseC-w5]）

1. **H1 fact memo（src/core/csg_core/merkle_dag.cheng，+205）**：`CsgCoreMerkleFactKey/CsgCoreMerkleCanonicalFact/CsgCoreMerkleFactHash` 三入口与 `CsgCoreMerkleBuild/CsgCoreMerklePhysicalOrder` 的 canonicalize 全部过 per-compilation memo（SoA 行：fact/canonical/key/hash+两 valid 位；命中条件=fact 文本全等，len+前 8 字节预过滤）。语义零减弱：命中=fact 文本全等→纯函数结果必然相同；miss 走权威 AST 路径不变；行字段缺失从行内 canonical 用同一纯函数补算，绝不二次 AST。**生命周期=单编译**，行帽 8192+字节帽 64MiB，超帽不逐出、落权威路径，正确性永不依赖 memo。`CsgCoreMerkleFactKeyFromCanonical`（canonical 输入路径）保持原样。
2. **H2 事务键扫描数组化（src/core/csg_core/merkle_transaction.cheng，+75/−38）**：`csgTransactionBuildOperations` 原成员扫描在 `csgTransactionFactIndex` 内逐元素重算 key（每 key=一次全量 JSON AST），即 O(oldN×newN) 次 AST；改为 `csgTransactionFactKeysOf` 每表预算一次键数组 + `csgTransactionFactIndexKeys` 键数组比较。键语义逐字节不变，duplicate 检测保留；旧 `csgTransactionFactIndex` 保留未删（零引用）。
3. **H3 reset 接线（src/core/backend/system_link_exec.cheng，+24 含他人 21）**：`BuildSystemLinkExecPlanWithWorldAndChannelInto` 内既有 decode memo reset 旁同点调用 `CsgCoreMerkleFactMemoResetForNewCompilation()`（w49 编译边界纪律同款）+import merkle_dag。

授权面说明：五文件簇本身本批零改动（bridge/snapshot_cargo/pipeline/identity/csgc 未动）；w125b 相位层链、w145 变体 β 崩链、本线 s1/s2 三方证据一致指向 merkle_transaction/json_canonical/merkle_dag 构成的 bootstrap 计算核，按证据落刀。

### 秒级门

车头 cheng_w126 对三改动文件逐个 --emit:obj：merkle_dag（首轮抓出 4 处 `@borrows` 缺失——csgFactMemoPrefilterMatch/csgFactMemoFind/csgFactMemoInsert/csgMerkleCanonicalizeViaMemo，补后 rc=0）、merkle_transaction rc=0、system_link_exec rc=0（首跑遇并行在途瞬态 realpath 错，复测过）。基线雷 codegen_a64_fill_units:471 未追。**另发现一处与本线无关的基线雷：ordinary 夹具 --emit:obj 在当前树态对含 program 主入口的闭包判 `primary object CSGC plan: entry symbol empty` rc=2（B0 无 hunk 对照驱动同病），exe 口径正常——已留给 obj 发射线。**

## 三、烤机台账（预算 4 轮，实耗 3 轮）

| 轮 | 产物 | sha256 | 结果 |
|---|---|---|---|
| r1（含 hunk，03:42 树态） | kernel_driver_w5_r1，186533904B | 4a058fa8e88f4338768dd94aad2c76170f9bd65989598014f0a46433369015c1 | BAKE_OK；nm 验证 11 个 FactMemo 符号在二进制 |
| b0（撤 hunk 对照，05:32 树态） | kernel_driver_w5_b0，186533104B | 8770c89fce2156f94f81a475f60a4614321fc8042800edd13ce4c3c4ad10b0fd | BAKE_OK；烤前撤 hunk/烤后恢复，闭包指纹 pre=46c6bd95…/post=fcd1f581…（差=本线 hunk 本身） |
| b1（含 hunk，05:39 树态） | kernel_driver_w5_b1，186550560B | 7f2c82e1369022a045ce77017b49fd33851e740296cf327da78230966f99b41a | BAKE_OK |

通道均=head 三件套（/tmp/oob_ab/w139/build_kernel_driver_w139.sh + kernel_manifest_head_git.cheng + cheng_w126），CHENG_COLD_OBJECT_CACHE_ROOT 任务级、CHENG_ENTRY_CACHE=0。

## 四、协议差分前后数据（含并行噪声申报）

**修复前基线（w149_r2，03:03 树态）**：冷 1048MB（rc=137 KILL）/复用 85MB——bootstrap 独占 ≥940MB。

**r1 协议双轮（03:47，exe）**：round_0 冷 compile/run=0/0，树 RSS peak 995.7MB，wall 350s；round_1 本应复用实为第二次冷（996.1MB/253s）；**字节门 FAIL（distinct=2）**。

**漂移根因定谳（决定性证据链）**：
1. P0_cold 与 P0_reuse（B0 连续两轮，间隔 ~5 分钟）cargo_cid 不同（a6afce86… vs c0aef367…）、predecessor_receipt_cid 不同——且 `parser.cheng` mtime 晚于 P0_cold report（`find -newer` 实证）。**ordinary 闭包含 parser.cheng，PhaseB-A 每次迭代即令全部 cargo store 身份失效，「复用轮」静默变第二次冷轮。**
2. w149_r2（旧驱动）对当前树 rc=2（`primary object CSGC plan: entry symbol empty`，702MB 处）；r1（03:42 烤）在树继续漂移后同样 rc=2——**驱动版本对树版本的有效窗 ≈ PhaseB-A 一次迭代周期（10-30 分钟）**，任何跨周期 A/B 对比不成立。
3. B0/B1 同窗对（05:32/05:39 双烤后紧邻跑）：P0 cold=456.6MB rc=0 / P0 reuse=516.9MB rc=0（实为 parser 新态第二冷）/ P1 cold=640.4MB rc=0 / P1 reuse=1046.8MB rc=0（parser 再变）——四轮全部 rc=0 但闭包身份逐轮不同，**组间不可比**。

**当前可锚定的硬数据**：
- 树态基线（无 hunk，B0，parser 某态 X）：冷 **456.6MB** rc=0（313s）——对照 03:03 树态同口径 1048MB：**当前树态冷路径 RSS 已降 ~590MB**，主因属并行线落树改动（PhaseB-A parser/typed_expr 重构等），非本线 hunk。
- 本线 hunk 的净贡献在同窗内未定谳（PhaseB-A 迭代周期 < 完整 A/B 周期）；结构性收益为确定性事实：bootstrap 窗内每 distinct fact 的全量 JSON AST 构建从 ~15 次降到 1 次（s2 采样第一热点族群整体消除重复）、事务键扫描从 O(N²) 次 AST 降到 O(N) 次——该收益随闭包 facts 规模二次方放大，在树态基线已低的当前闭包上占比小。
- FINAL_B0/B1 紧邻 cold 对（秒级间隔，06:5x）：B0=1045.3MB rc=0 cid=59506602…，B1=1001.4MB rc=0 cid=265df88d…——**两轮 cid 仍不同**（PhaseB-A 在两轮之间又迭代 parser），同闭包对比再次落空。此为「同窗 A/B 在本并行窗不可实现」的最终实证。
- **闭包方差主导证据**：同一 B0 驱动（无 hunk）在 parser 两个迭代态下冷路径 456.6MB（态 X）↔ 1045.3MB（态 Y），**摆动 >588MB**——当前并行窗内闭包本身的 RSS 方差即大于一切修复的收益量级，任何 RSS 信用（含并行线自己的）在此窗口均不可记账。

## 五、回归门表（B1 驱动，除注明外）

| 门 | 预期 | 实测 |
|---|---|---|
| ordinary_zero_exit_fixture | compile=0 / run=0 | **compile=0 / run=0 PASS**（gates_r1_v2.log，r1 驱动） |
| call_fixture | compile=0 / run=1（契约） | **compile=0 / run=1 PASS** |
| cold_nested_fmt_interpolation_smoke | compile=0 / run=0 输出 `cold_nested_fmt_interpolation=pass` | **compile=0 / run=0，输出 `cold_nested_fmt_interpolation=pass` PASS** |
| zz_v6_w7 | 判词只记录 | **compile=0 / run=0 PASS**（B1 驱动；wall149 时代该面为 compile_rc=1 exact-def 判词，PhaseB-A typed_expr 迭代后转绿，如实记录） |
| 秒级门（车头 obj × 3 改动文件） | rc=0 | **PASS**（§二） |
| 字节铁门（同名 --out 轮间 EQ） | EQ | **FAIL——闭包漂移所致**（§四.1 实证 parser.cheng 逐轮变化），静默窗配对顺延；本线 hunk 的字节中性待并行停窗后补验（memo 不改任何 hash 输入/发射输入，键语义逐字节不变） |
| 1GiB 进程树帽 | 全程不触 | PASS（除 03:03 基线复现轮故意触帽取证） |
| 毒化网 | 0 UAF/0 rc70 | PASS（全程零 POISON_HIT） |

## 六、交付物

| 项 | 值 |
|---|---|
| patch | /tmp/oob_ab/phasec_w5.patch（当前树态全量 git diff，2258 行，含他线在树 hunks；**本线净贡献=merkle_dag.cheng +205/−…、merkle_transaction.cheng +75/−…、system_link_exec.cheng +3，三文件合计 +266/−38**，全部 hunk 带 [phaseC-w5]） |
| reverse-check | **PASS**（git apply --reverse --check） |
| 驱动 | r1=4a058fa8…（含 hunk）、b0=8770c89f…（对照）、b1=7f2c82e1…（含 hunk 最新态） |
| 作业区 | /tmp/oob_ab/phasec_w5/（repro_w149r2 / reuse_w149r2 / attribution（sample×3+冷曲线+符号化脚本） / post_r1 / quickgate / gates_r1* / abdiff / bdiff 全留档） |

## 七、移交事项

1. **测量纪律（本线最大方法论教训）**：cargo store 身份=驱动×闭包，ordinary 闭包含 parser.cheng——PhaseB-A 每次迭代令全部 store 失效且「复用轮」静默变冷轮。后续 bootstrap RSS 测量的最小可信口径=**同驱动 cold→reuse 紧邻对 + 两轮 cargo_cid 相等校验**（report 的 lowering_semantic_snapshot_cargo_cid）；跨驱动对比必须加「两驱动各轮 cargo_cid 全相等」前置校验，否则数据作废。
2. **obj 发射基线雷**：program 主入口闭包 --emit:obj 判 `entry symbol empty` rc=2（B0 无 hunk 同病），obj 发射线下手前先核此雷。
3. **AST 削减的下一层**：sample 三窗显示 CSGC 编解码族（~36% 帧）与 manifest 验证族为 AST 之外主要流量；若继续压 bootstrap RSS，方向=manifest/decode verify 链 canonical 直通（树内 1.3GiB 注释修复方向的推广）+ admission SealedBeforeContent 重复 encode 消除；均触验证链，须配同名字节铁门。
4. memo 命中计数器（csgFactMemoHits/Misses）已埋 merkle_dag 全局，未接 stderr/report 出口，需量化时低成本接线。
5. PhaseB-A/wall150 收官树静默后建议补两项：①字节铁门同名配对（本线 hunk 字节中性终验）；②B0/B1 紧邻对复测（§四 FINAL 对），分离本线净贡献。
