# VERIFY_b3r_churn_append —— [B3R-CHURN] B3' churn 刀 GEN2 突破线：重归因定谳+InternPool 阶梯刀+b3meta 叠刀移植+GEN3 固定点 2026-09-10

date_utc=2026-09-10 · 代理=B3R-CHURN（战役 R「B3' churn 刀」重派线）· 工作克隆=/Users/lbcheng/cheng-f24/b3r（cp -cR 主树 31a806fee+工作树在途 diff；锚 commit=342595c90，即时 commit 三刀）· 车头=/tmp/cheng_cold_v2 · 烤机壳/自烤壳=克隆 .w/{bake_kd.sh,selfbake768.sh,treesample.py,vmwatch.py} · bake_win 锁全程生效 · rc 紧邻捕获 · /usr/bin/diff 口径

## 一、结论先行

**四项交付、一项按红线止损：①重归因定谳——metadata 相实测爬升 3.3-3.4MB/源（三轮 census 铁证），但 typedMetadataContexts 权威驻留仅 ~52KB/源（csg_memgrp census：total 1.69MB@32 源，230 源外推 ~12MB），TA-MEM 模型相 3 原估 12-46MB 成立；爬升主体=MALLOC_SMALL zone 活分配（vmmap 峰窗：SMALL 416MB/allocated 330MB/frag 51.3MB@metadata src≈112 窗），且 metadata 相内 live allocs +421k（≈3.3k/源）远超 contexts 所能解释的 ~250/源——约 3k/源活驻留落在 parser/构建中间域，与 B3-META 边界图定性吻合。②简报原靶 InternPool 阶梯勘误：keys 单份化+87.5% 载荷均已在主树（BIGSRC-SPLIT 009f8c7c8+intern75 38feddb3b），活池阶梯残余=每池 6-12MB 量级（RATCHET-DIAG 的 352MiB 是 annot_release 前遗弃树携带池的账，活池不复现）；本线刀 A（lineInternPool index 提前归还）实测 −6.29MB，与 2^19 槽×12B 理论精确吻合。③刀 C（metadata 相逐源 relief）实测证伪撤除（R2 轮 −10MB 噪声级；B3-META 的 846/915MB 反效果独立同证）——zone 活分配不是 free 页，relief 类刀对墙无效。④GEN3 字节固定点达成：配对烤机 r3bake=r4bake=6b8ca86c…（sha256，rc=0×2）；烤机 resident 峰 743→717MiB 逐轮下移。⑤GEN2「768MiB guard 自烤 rc=0」未达成：R1/R2/R3 三轮 rc=137，fp 撞线值 805.90/806.04/805.91MB（含 R0d 四轮极差 0.4MB，确定性瞬态），死相全部=metadata contexts 相（metadata_contexts_built 标签四轮均未到达）——同判词连败达判定表限，按止损条款移交精确边界图：墙=parser.cheng/构建中间域的 MALLOC_SMALL 活分配棘轮（+b3meta 时代 128MB mmap tier 区域在叠刀后峰窗未复现，VM_ALLOCATE 仅 159MB/144 区），不在本线 file face（intern/compiler_csg 池结构+typed_expr 池结构）内，parser 域施工线接手。**

## 二、重归因账（简报使命 1 定谳，CHENG_CSG_MEM_TRACE 门控通道）

### 2.1 分相梯子（R3 叠刀态自烤，csg_mem/csg_memgrp 通道）

| 点位 | rss(ps) | live | 关键字段 |
|---|---|---|---|
| after_profiles | 362.5MB | 1,502,513 | pool_n=388,739 pool_struct=18.87MB |
| line_index_released（刀 A） | 同点生效 | — | pool_struct 18.87→12.58MB（metadata src=0 实测）=−6.29MB |
| metadata src=0 | 368.4MB | 1,510,237 | snap=typed=30.50MB cache=0 pool_logic=21.56MB line_store=2.57MB |
| metadata src=16 | 431.6MB | 1,574,651 | ctx census total=1.34MB |
| metadata src=32 | 442.0MB | 1,593,241 | ctx total=1.69MB（line_cols=740KB scopes=230KB fields=246KB textcache=416KB） |
| metadata src=48 | 607.4MB | 1,660,415 | 大源簇窗跳变（+165MB/16 源） |
| metadata src=112 | 742.4MB | 1,931,242 | **fp 撞线杀（146s）** |

- **contexts 权威账**：total 1.69MB@32 源=52KB/源→230 源 ~12MB。TA-MEM 模型相 3 原估 12-46MB 成立；TA-MEM2「3.9MB/源=contexts 驻留」判读第三次被独立证伪（B3-META 第二次）。
- **爬升主体账**：metadata 相 live allocs +421k（src0→112，3.3k/源），contexts census 的行/列条目只能解释 ~250/源——约 3k/源活分配在 census 不可见域（构建中间态）。vmmap 峰窗（t115s）：MALLOC_SMALL 416MB（allocated 330MB+frag 51.3MB）、MALLOC_LARGE 36MB、VM_ALLOCATE 159MB/144 区。
- **128MB mmap tier 状态**：b3meta 时代（7 轮战报）大源窗逐个出现的 128MB×4 writable 区域，在本线叠刀态峰窗未复现（VM_ALLOCATE 全区合计 159MB）。两种可能：K1 的 16 源 relief 相序改变了 tier 吐纳，或 tier 出现于 src>112 的更晚窗（R3 未及）。无论哪者，剩余墙均为 parser/arena 域。

### 2.2 简报原靶勘误（InternPool 阶梯）

- 简报子刀①keys 列单份化：**已在主树**（BIGSRC-SPLIT 009f8c7c8，keys 并入 texts 5→4 列，现 intern.cheng 三列 index 无 keys 列）。
- 简报子刀②文本 owned copy 去 double：**同上已消**（keys 即 texts 共享句柄的旧形状已不存在）。
- 简报子刀③capacity 0.7→0.85：**已在主树**（intern75 38feddb3b，87.5% 载荷 doubling）。
- 故活池阶梯残余账=lineInternPool index 三列 2^19 槽×12B=6.29MB（gNormTypePool/typed facts 池均 <1MB 量级，types 1,620）；RATCHET-DIAG 的 352MiB 阶梯=annot_release 前遗弃树携带池的 trip 态账，annot_release 合入后活池不复现。

## 三、刀账（克隆三 commit，全在双 face 文件内）

| 刀 | commit | 内容 | 实测 |
|---|---|---|---|
| 刀 A | b3r 2f0aa1c5e 区段 | profiles 相末（after_profiles 前）`InternPoolReleaseIndexStorage(lineInternPool)`：index 三列提前归还。语义安全=唯一 Intern 写入点在 profiles 相内（compilerCsgProfileLinesInternRec），metadata/reachable 两相仅 LookupIntern 只读，indexMask==0 时 FindInternId 短路返回未命中无再 intern 路径；期末 InternPoolRelease 幂等 | −6.29MB（pool_struct 18.87→12.58MB，csg_mem pool_struct 字段实测，与 2^19×12B 理论精确吻合） |
| 刀 B | 同上 | metadata 相入口 metadata_start/出口 metadata_done csg_mem 标签（env 门控，非 trace 路径零成本） | 四轮 trace 账唯一 metadata 相可见性来源 |
| 刀 C | b3r 第二 commit，**已撤** | metadata 相逐源 ProcessMemoryPressureRelief | 证伪：R2 轮仅 −10MB（噪声级），B3-META 6f43dca41/fbb656071 独立同证反效果（846/915 vs 808）——zone 活分配非 free 页 |
| 叠刀 | b3r 第三 commit | **b3meta churn 刀 K1-K8 三方合并移植**（git apply -3+手工解 3 处冲突+补 WorkingSetMemTraceEmit 定义）：K1 profiles 相 16 源 relief 先行再守卫；K2-K6 typed_expr 零分配行预筛（ParseBindingLine/ModuleConst/CollectDeclaredTypes/globalBindings/ScopeEndLine）；K7 行表物化改 LookupInternShared 池共享；K8 intern 调用点冗余 CloneStr 去除；census 分组插桩（LiveBytes+GroupTraceEmit） | live 斜率 src0→16 +109,747→+64,414（**−41%**，对齐 b3meta −43%）；烤机 resident 峰 743（R0）→717MiB（R3） |

- **语义等价性锚**：K2-K6/K7/K8 逐字节语义锚沿用 B3-META 案卷（VERIFY_b3meta_append.md §三表）；刀 A 的唯一写入窗论证见 §三刀 A 行；census 通道纯 env 门控输出，非 trace 路径零成本。
- 撤刀记录：刀 C 的 Edit 已从工作区完整移除（grep `_metadataRelief` 仅余既有 39476 行非本线 relief 点）。

## 四、验收矩阵

| 项 | 结果 | 判定 |
|---|---|---|
| 烤机（车头编克隆闭包） | r0bake rc=0@196s(峰743MiB) / r1bake rc=0@200s(672MiB) / r2bake rc=0@187s(763MiB) / r3bake rc=0@185s(717MiB) / r4bake rc=0@204s(714MiB) | 5/5 rc=0，900s 帽内，未抬帽 |
| **GEN2 768MiB 自烤 rc=0** | R0d/R1/R2/R3 四轮 rc=137，fp 805.96/805.90/806.04/805.91MB（撞线值极差 0.4MB），死相=metadata contexts 相（metadata_done 标签四轮均未达） | **未达成（止损）** |
| **GEN3 字节固定点** | r3bake sha256=r4bake sha256=6b8ca86c6289ce81ba8142799e60c78e46811528636e0090a2d91176f9851888（同配方同源两轮 rc=0） | **达成** |
| GEN2 rc=0@1GiB 防线 | R3 谱系四轮已证（VERIFY_gen2r3），本线烤机 5/5 rc=0 同带 | 维持 ✓ |
| 四夹具门 | 见 §四.1（驱动快照包根绑定 b3r 克隆，门须 CHENG_ROOT=克隆执行；首跑主树根误配 BASELINE-STALE 已纠正重跑） | 见下 |
| 报告契约 | csg_stage/csg_mem/csg_memgrp 判词零漂移；驱动内建守卫口径不变 | 零漂移 ✓ |

### 四.1 四夹具门（.w/gate_r3b.log，克隆根执行，guard 1GiB 防线）

| 夹具 | 结果 | 台账 |
|---|---|---|
| ordinary | PASS | compile 666,882KiB（651MiB，768 线内） |
| call_fixture | PASS | compile 801,392KiB（782MiB，**超 768 台账线 +14MiB，1GiB 防线内**，随 §五墙一并归因） |
| cold_nested / v6 | BASELINE-STALE（compile rc=1@23MB 级，无判词） | **锚态既有实证**：配对 control（锚态驱动 b1f35e6a=R0 driver，无本线刀）在完全同 env 下 rc=1 同 stderr 同判词 |
| probe 区 | probe_pass=0 probe_red=1 probe_stale=18 | 同上归因 |

- **归因闭合**：rc=1 触发变量=门恒设的 `CHENG_CSG_PLUGIN_ALLOW_NETWORK=0`（单变量复现；去掉该 env 本线驱动与锚态驱动均 rc=0 通过 cold_nested 手动编译）。该失败形态与 R3 线（昨日 4/4 PASS + probe 4 绿）的差属**主树/环境级日间变化**（31a806fee 后在途 diff 与 baseline tsv 刷新），配对 control 证明与本线刀无关——刀相对零漂移成立。
- 门纪律注记：门首跑误用主树根（CHENG_ROOT=主树）与驱动快照包根（b3r）不匹配 → provider hard-fail BASELINE-STALE，判定=环境误配非刀漂移，纠正为克隆根重跑。教训：驱动快照包根绑定必须与门执行根一致。

## 五、止损边界图（移交 parser/arena 施工线，按嫌疑大小序）

1. **MALLOC_SMALL 活分配棘轮**（R3 vmmap 峰窗实测：zone 416MB，allocated 330MB，frag 51.3MB）：metadata 相内 live allocs +3.3k/源且不释放——census 可见的 contexts 只占 ~250/源，**~3k/源活分配持有者是 census 不可见域**，嫌疑=TypedExprBuildMetadataContextFromProfile 内部 per-line 构建链（parser.cheng 逐行 strip/trim/owned-text，与 B3-META §五-2 定性同源）。建议：在该构建路径打分配点级 memTraceEmit（size+序号），锁定后按零分配行分类同范式消 churn 或改池共享。
2. **128MB mmap tier 区域**（b3meta 时代 128MB×4）：叠刀态峰窗未复现（VM_ALLOCATE 159MB/144 区）；若后续轮在 src>112 窗复现，定性归 parser 每源解析树 arena（frontierParsedSources→forest 语义必需链），按 B1 ArenaReserveCapacity 同范式精确容量化或按源释放。
3. **frag 51.3MB（12.3%）**：MALLOC_SMALL 碎片，随 1 削减自然回落，不另起灶。

## 六、纪律记录

- 判定表执行：R1/R2 同判词（rc=137@metadata 相）连败 2 次即换刀向（b3meta 叠刀移植），R3 后三败达止损线，转边界图移交——非盲重试。
- 主树足迹=纯新增两件：patches/b3r_churn.patch+本文档；全部源改动在克隆 b3r（锚 342595c90→HEAD 三 commit，git log 可溯）。主树源码零接触。
- 无 heredoc；脚本一律 Write 落盘后执行；vmwatch 首跑目录竞态（selfbake rm -rf 先于快照写入）已修（exist_ok 重建）并重跑。
- 门首跑 CHENG_ROOT=主树 与驱动快照包根（b3r）不匹配致 provider hard-fail（BASELINE-STALE），判定=环境误配非刀语义漂移，纠正为克隆根重跑；教训=驱动快照包根绑定必须与门执行根一致。
- 大产物：各轮 cold_cache 随壳清理；kernel_driver 保留 r3bake（GEN3 代表）一个，其余轮产物删除（sha 均已录 summary.txt）。
- **违章自首+补救**：收尾清理时误删共享车头 /tmp/cheng_cold_v2（旧代 sha 7f731d4d…）。已按配方 `cc -O2 bootstrap/cheng_cold.c` 当场重造并全烤验证（v2verify rc=0@271s）。注意：新车头 sha=987832510c…（当前树 cheng_cold.c 重编，非旧代字节），且车头换代进入产物字节——v2verify 产物 sha b198363e… ≠ r3bake 6b8ca86c…（同源异车头）。**GEN3 固定点口径=车头代内字节固定**（r3bake=r4bake 同车头同源 EQ 已证）；车头换代后 GEN3 需按新车头重立。后续各线用车头前先核 sha。
