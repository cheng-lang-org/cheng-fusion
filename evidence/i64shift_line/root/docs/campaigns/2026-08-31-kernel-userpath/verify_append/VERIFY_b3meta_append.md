# VERIFY_b3meta_append —— [B3-META] metadata contexts 相结构改造：定谳反转+churn 刀落地+精确边界图移交 2026-09-09

date_utc=2026-09-09 · 代理=B3-META（战役 R「B3 metadata contexts 相结构改造线」）· 克隆=/Users/lbcheng/cheng-f24/b3meta（cp -cR 主树 9a28ec0ff+工作态，基线 commit f9893c2d1）· 车头=/tmp/cheng_cold_v2（sha 7f731d4d…）· bake_win 锁全程生效 · 判定表生效（>10min 病理 kill 零记录，全部轮次自行收敛）

## 一、结论先行

**三项交付、一项止损：①持有者定谳反转——分组字节 census（CHENG_CSG_MEM_TRACE 门控插桩）铁证 typedMetadataContexts 驻留仅 ~61KB/源（48 源累计 2.92MB，230 源外推 ~14MB，dense lines=0 证实），TA-MEM2「3.9MB/源=contexts 全量驻留」判读作废，TA-MEM 模型相 3 原估 12-46MB 才是对的；实测斜率的 ~98% 是构建期逐行扫描的整行串拷贝 churn（ModuleConst 3 拷贝/行、CollectDeclaredTypes 2/行、globalBindings 2/行、ParseBindingLine 2/行、ScopeEndLine 1-2/行、行表物化 1/行 ≈11-12 次分配/行）卡死 MALLOC_SMALL zone，ProcessMemoryPressureRelief 不可回收。②churn 刀落地六处（全部在我双 face 文件内，语义逐字节等价预筛/池共享）：GEN2 实测 live-alloc 斜率 −43%、profiles 相斜率 −25%（src=128：496→349MB）、metadata_start −28MB（655.9→627.7MB），配对四夹具门判词逐夹具零漂移、探针判词零漂移。③「GEN2 自烤 ≤768MiB rc=0」未达成——7 轮 trip 散布 807-915MB，均在大源字典序簇窗（src≈33-48），且逐源 relief 被实测证伪（846/915 vs 808，已 revert）。④按止损条款移交精确边界图：窗内真驻留=runtime mmap tier 128MB×4 区域（pool 关闭对照不消失，非 contexts/池/census 所见任何结构，嫌疑=parser.cheng 每源解析树的 arena 存储——profiles→forest 窗语义必需，归 parser/arena/forest 域）+ MALLOC_SMALL 130-220MB（parser.cheng 逐行 churn，与我已切的 typed_expr 侧同型）。**

## 二、持有者定谳（census 铁证）

### 2.1 分组 census 梯子（knife 前 gen2_census2 / 刀后 gen2_knife1，veh 内建 census）

| 点位 | rss | contexts total | 大头分解（knife 后 src=32 全字段） |
|---|---|---|---|
| metadata_start | 655.9MB（刀前）/ 627.7MB（刀后） | — | — |
| metadata src=16 | 684.1 / 702.2 | 1.34MB | line_cols=0.62MB scopes=185KB(1091个) fields=148KB(1047) |
| metadata src=32 | 692.8 / 712.4 | 1.69MB | line_cols=740KB scopes=230KB(1378) fields=246KB(1759) textcache=416KB(194 const) |
| metadata src=48 | 795.6 / (808.9 trip) | 2.92MB | 全字段 KB-MB 级；lines=0、cold=0、exprcol=0、nameidx=0、over_n=0 |

**contexts 全量 230 源外推 ~14MB；同窗 RSS 斜率 +2.9-6.4MB/源——contexts 占比 ~2%。** ctx.lines 空（D3 后语境不再持 dense lines）与 census 实测一致。

### 2.2 churn 刀效果（alloc 级实测）

- metadata 窗 live-alloc 斜率：src0→16 +112,214 → +64,406（**−43%**）。
- profiles 相斜率：src=128 处 496.3MB → 349.5MB（**−147MB**）；profiles src=0 起点即 241.8 → 157.6MB（ParseBindingLine 在 parser/profile 构建侧的同函数受益）。
- metadata_start：655.9 → 627.7MB（**−28MB**）。
- 但 GEN2 守卫判词不变（见 §四）——削减量被 runtime mmap tier 增量吞没。

## 三、churn 刀账（全部落在 typed_expr.cheng + compiler_csg.cheng 双 face）

| # | commit | 刀形 | 语义等价性锚 |
|---|---|---|---|
| K1 | 371ee9afa | profiles 相 relief 先行再守卫（对齐 metadata 相既有纪律） | 同频同判，仅剥未-relief 的 churn 假峰（845.6→807.0 一轮实测） |
| K2 | 3e76fc5bc | TypedExprParseBindingLine 头 token 预筛（全部调用点受益） | trim 集/注释语义逐字节复刻（typedExprLineFirstContentByte/HeadKeywordKind）；kind=2 即 Len(trimmed)<=Len(prefix) 亦 false |
| K3 | 3e76fc5bc | TypedExprModuleConstEntryForLine 预筛 | 缩进+!inConstBlock ⇒ entryText 恒空；顶格 token 非 "const" ⇒ 状态复位+false；kind=2 ⇒ inConstBlock=true+false |
| K4 | 3e76fc5bc | TypedExprCollectDeclaredTypeNames 状态机前置 | 非缩进首字节非 't' ⇒ 仅无条件复位块；缩进 !inTypeBlock/enum-深缩进两 continue 前移（trim 无副作用） |
| K5 | 3e76fc5bc | globalBindings var 块状态机零分配 | trimmed==""（首内容 '#'）不改状态；"var" 行尾精确置位；' '/'\t'/'\r' 尾随歧义走慢路径 |
| K6 | 3e76fc5bc | TypedExprFunctionScopeEndLine 字节括号计数 | SlashAware 切点引号状态机逐句同构；[0,切点) 计数 ≡ PathTrim(剥注释)计数（空白无括号） |
| K7 | 3e76fc5bc | 行表物化改 LookupInternShared | 池内共享句柄 verified element-share idiom；池释放点（CompactProfilesForFixedPoint 38903）晚于 metadata 相，存活域正确 |
| K8 | d5de6a0c5 | intern 调用点冗余 CloneStr 去除 | Intern 内部自 CloneStr 持有；share 句柄满足 owned actual 绑定 |
| R1 | fbb656071 | **回退** 6f43dca41（metadata 相逐源 relief+guard） | 实测反效果（846/915 vs 808）：relief 抖动推高 footprint |

配套诊断件：census 分组插桩（compilerCsgMetadataContextsGroupTraceEmit，CHENG_CSG_MEM_TRACE 门控，非 trace 路径零成本）+ b3_selfbake.sh/b3_selfbake_full.sh（t2 范式移植）。

## 四、GEN2 铁门战报（768MiB 门，7 轮全 rc=125，同墙各带新证据）

| 轮 | 车头态 | trip footprint | 增量证据 |
|---|---|---|---|
| gen2_census | 基线（census 插桩） | 845,595,776 | profiles 相大源窗裸 guard 先炸；census 未及 metadata |
| gen2_census2 | +K1 | 806,978,712 | 到 metadata src≈52；census 梯子到手（定谳反转） |
| gen2_knife1 | +K2-K7 | 808,879,232 | alloc −43%；首源 churn +31→+0.2MB；距门 3.6MB |
| gen2_fullvm | 同上+全 vmmap | 806,470,856 | vmmap 全图：VM_ALLOCATE 574MB/175 区，128MB×3 相邻区 |
| gen2_knife2 | +逐源 relief | 846,464,152 | 逐源 relief 反效果（证伪） |
| nopool1 | +CHENG_DISABLE_LINE_POOL=1 对照 | 821,740,672 | 128MB 区非行池机制 |
| gen2_veh6 | R1 回退+K8 | 843,515,080 | 终态判词不变 |

散布 807-915MB（±50MB 级 run 方差），最佳单轮距门 1.7MB，无一过门。

## 五、精确边界图（止损移交，按嫌疑大小序）

1. **runtime mmap tier 128MB×4 区域**（writable VM_ALLOCATE SM=PRV，全脏，地址相邻，随大源窗逐个出现，profiles 后期→metadata 窗累积）：cheng_malloc ≥1MB mmap tier（arena.cheng 注释自证）的某使用者。**排除项**：contexts（census 2.92MB）、行池（nopool 对照不消失）、lineStore（retained 2.6MB）、pool 索引（25MB 级）。**嫌疑**：parser.cheng 每源解析树的 arena 存储（frontierParsedSources→forest merge 语义必需链，profiles 建树→B1 forest 合并消费）——128MB 粒度=单块 mmap 直配，非倍增对。**建议**：在 parser 每源建树路径与 core_runtime_provider 的 mmap 分配/释放路径打 process-map 级 tag（vmmap region 注入不可行，可在分配点 memTraceEmit size+序号），锁定后按 B1 ArenaReserveCapacity 同范式精确容量化或按源释放。
2. **MALLOC_SMALL 130-220MB**：parser.cheng 逐行 strip/trim/owned-text churn——与我在 typed_expr 侧已切的同型（ParserStripLineComment 每次 owned 拷贝 + PathTrim 二次拷贝）。**建议**：parser 侧复用我的零分配行分类原语（可上移为共享 util）。
3. **langintern 池索引增长**：390K 条目时 indexKeys/vals/states/occupied 各自倍增，mmap tier 粒度可疑（128MB 区候选之一，nopool 仅省 ~16MB 说明非主量）。归 D3/langintern 域复核 InternPoolIndex 容量策略。
4. **v6/cold_nested 夹具**：与 GEN2 同 mass 机制（tamem_runtime_analysis 已证 v6 单源 CSG 仅 20MB、墙在 primary object emit）——我的刀不触达，判词与配对 control 一致。

## 六、零漂移验证（配对双驱动，同机同门）

- **四夹具门**（tools/user_path_gate.sh，768MiB 帽）：knife 驱动（veh6，sha 8c5f16a4…）vs 配对 control（刀前基线驱动 b52707d8，同 f9893c2d1 树）：
  ordinary PASS/PASS（761,136 vs 755,488 KiB，刀 −5.6MB）；call_fixture PASS/PASS（768,656 vs 782,752 KiB，+13.8MB 噪声带）；cold_nested 双双 rss_limit_exceeded ABORT（805.7 vs 807.6MB，超门 0.4/2.3MB）；v6 双轮因 ABORT 未达。**判词逐夹具一致，RSS 差在 ±14MB 噪声带——刀相对零漂移成立。**
- **探针**：tamem_repro_ifexpr → rc=2 `reachable entry missing: main`，与 t5/m60 代判词逐字一致。
- **配对烤机**：veh6 bootstrap rc=0（wall=189s，230 源全量，report_rss=720,601,088）；control bootstrap rc=0（b52707d8）。产物 sha 双归档于 .w/b3/self_*/summary.txt。
- 注：四夹具绝对值 vs VERIFY_tamem_runtime_analysis 的 m60c 表（ordinary 652MB）高出 ~86-136MB，为 m60c→当前 HEAD 的树级增长（两驱动同带，非本线刀致），归因栏随 boundary map 移交。

## 七、模型相 3 补遗（入 TA-MEM 模型的校准条目）

```
WS_3 = WS_2'（metadata_start 实测 627.7-655.9MB，随树态漂移）
     + Σ_source ctx_i 驻留
         ctx_i ≈ 12B×lineCount（sourceLineByteStarts/Lengths/OverrideIndexes）
              + ~170B×scopeCount（88B 行 + 5 串）＋ 136B+4串×bindCount
              + 96B+3串×fieldCount ＋ moduleConst 缓存 ~2KB/源 ＋ 其余 KB 级
         实测（csg_memgrp，48 源累计）= 2.92MB ⇒ ~61KB/源 ⇒ 230 源 ~14MB
         ——TA-MEM 模型原估 12-46MB 正确；「3.9MB/源驻留」判读作废
     + 相构建 churn 驻留（MALLOC_SMALL/mmap tier，relief 不可回收部分）
         刀前 ~2.9-6.4MB/源（逐行扫描 ~11-12 次分配/行 × 40-70B × zone 放大）
         刀后 alloc −43%，但被 §五-1 的 128MB tier 增量掩盖
```

待钉区⑥（移交）：128MB mmap tier 的使用者定谳（见 §五-1）。

## 八、纪律记录

- 全程默认 1GiB 门与 768MiB 管理线，无抬帽轮；rc=125 为判定表内预期产物，逐轮附新增证据（census 梯子/vmmap 全图/nopool 对照），非同判词盲重试。
- **违章一次自首**：nopool 诊断壳写入时误用 heredoc（违反壳纪律红线；本环境未卡死但不可再犯），已即时自纠，后续全部单行/文件写入。
- 主树足迹=纯新增两件：patches/b3meta.patch + 本文档（源码零接触）；全部源改动在克隆 /Users/lbcheng/cheng-f24/b3meta（基线 f9893c2d1 → HEAD，git log 可溯）。
- 大产物清理：各轮 cold_cache 已随壳清理；kernel_driver 产物保留 veh6/control 两个代表（sha 已录），其余轮次产物在 .w/b3/ 就地归档未删（含 census/vmmap 全图证据）。
