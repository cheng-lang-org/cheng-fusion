# VERIFY_b3struct_model_append —— [B3STRUCT] metadata 相逐结构 DOD 预算补遗+三刀授权落地模型 2026-09-10

date_utc=2026-09-10 · 代理=B3-STRUCT（战役 R「B3 结构改造授权线」，~300MB 级结构刀授权）· 上游锚=VERIFY_tamem_model_append.md（相 0-6 模型）/VERIFY_ratchet_diag_append.md（vmmap 拆账法）/VERIFY_tamem2_append.md（GEN2 峰定位）/VERIFY_b3meta_append.md（定谳反转+K 刀系+边界图）

## 一、结论先行

**TA-MEM 模型相 3（metadata）原版只有全相包络预算（390-440MB），B3-META 补了实测校准（contexts ~61KB/源），本文按用户三刀授权面把相 3 拆到「逐结构 DOD 预算」级：①contexts 全量权威 ~61KB/源（230 源 ~12.4-14MB）从 metadata 相一直活到 typed-IR 首轮 seal（隔着 forest 合并+expr/facts 循环+TypeArena 生产三大窗）——刀①②的靶心就是这条「全量攒完再压缩」链；②line-intern 文本在 metadata 相内的归还路径是 refcount 逐行 `InternPoolClearTextAt`，相位末 PhaseArenaLineStoreReset 才整批灭 store+pool——刀③把归还点收敛到 dedup 安全边界整批执行；③frozen projection 构建点=TypedExprSealBuildSourceContextIndex（typed_expr seal），输入=完整 build index+全量 contexts，语义权威不可前移——刀①在此约束下做「分批流式写入+逐批释放原格式」。**

## 二、相 3 逐结构 DOD 预算（代码面推导，实测由核账轮回填于 VERIFY_b3struct_append.md §二）

### 2.1 相 3 入口继承（metadata_start 时刻存活域，实测 423.7MB@230 源）

| 结构 | 持有者 | DOD 公式 | 纸面价 | 实测 |
|---|---|---|---|---|
| 二进制底 | 驱动映像 | __TEXT+__DATA+__LINKEDIT | ~190MB | — |
| sourceSnapshots | work.sourceSnapshots[i].text | Σ源字节 | 30.6MB | 30,484,036B ✓ |
| typedSourceTexts | work.typedSourceTexts[i].text | Σ源字节（第二份快照） | ≤30.6MB | 30,484,036B ✓（双快照实锤） |
| exprCallProfiles | work.exprCallProfiles（compact 后） | decls+边+名字句柄 | 47-67MB | decls=17,169 |
| lineInternPool texts | work.lineInternPool.texts | 唯一行数×(~41B+24B 头) | ~24-38MB | pool_logic=21.56MB pool_struct=9.38MB ✓ |
| lineStore | PhaseArena i32 列 | 643,601×4B | 2.6MB | 2,568,292B ✓ |
| reachable set+semantic tables | work.reachableSet 等 | 函数/边列 | ~10-30MB | reachable 段 +63MB（含扫描缓冲） |
| profile 构建域 churn 残留 | MALLOC_SMALL 死页/碎片 | 分配器行为，非结构 | 86-188MB（遗留账 A） | 未单列 |

### 2.2 contexts 逐结构预算（census 全覆盖实测校准）

| 结构 | 行宽 | 文本列 | 预算式 |
|---|---|---|---|
| sourceLineByteStarts/Lengths/OverrideIndexes | 4B×3 | — | 12B×lineCount |
| scopes+signatureScopes | 88B（census 口径；实际行含 loopVar×9 序列+manualConsume 族 ≈396B） | 5 串/行 | 88B×n+Σ串 |
| bindings | 136B | sourcePath+functionName+name+typeText+initValueText（census 漏计第 5 串） | 136B×n+Σ串 |
| importcFunctions | 232B | 6 串/行 | 232B×n+Σ串 |
| importedModules | 48B | qualifier+targetSourcePath | 48B×n+Σ串 |
| typeFields | 96B | ownerType+fieldName+fieldType | 96B×n+Σ串 |
| declared/ref/alias 族 | — | 每条 1 串+3×i32 | Σ串+12B×n |
| enum 族 | — | 2 串+i32 | Σ串+4B×n |
| exprLineColumnHeads/Values/Next | 4B×3 | — | 12B×行数 |
| nameIndex（binding/scope） | buckets+4 列 | entry names | 索引标准价 |
| moduleConst/functionHeader 缓存 | slots+buckets | names+literals/returnTypes | ~2KB/源 |

实测（csg_memgrp，acct2 src=128 累计）：total=6.92MB=0.054MB/源——**contexts 占窗内爬升 1.8%**。

### 2.3 frozen projection 预算（seal 时刻成型）

- 构建点：`TypedExprSealBuildSourceContextIndex` → `typedExprBuildFrozenMetadataProjection(index, contexts, projection, err)`：pass1（路径/行坐标/globalBindings）→ scopes 追加 → pass2（importc/imports/declared/ref/alias/fields/enum/moduleConst）→ 五索引 → callRows 校验。文本 intern 进 projection.internPool（CloneStr 持有）。
- seal 遥测：preSealFullIndexBytes/canonicalIndexBytes/canonicalStoreBytes——本轮插装 `typed_seal` 计量行直接回填（GEN2 窗内 trip 未达 seal，回填待达门轮）。
- **语义权威约束**：projection 构建输入=完整 TypedExprBuildIndex（callDeclarationSealed），index 在 expr/facts 循环后才终态——projection 不可能提前到 metadata 相一次成型 ⇒ 刀形取「分批流式写入+逐批释放原格式」（pass2 逐 context 释放，见刀账）。

### 2.4 line-intern 文本归还路径（刀③靶面，改前现状）

profiles 相每源 intern 入池→profiles 相后 [MEM-EXACT] 索引存储提前归还+texts 压精确容量→metadata 相 refcount 逐行 ClearTextAt（580k 次 str free churn 摊在峰窗）→相位末 PhaseArenaLineStoreReset 整批灭。刀③=删除逐行机制，归还点=相位末边界一处（InternId 只读域契约不动）。

### 2.5 构建期 churn（爬升主体，census 不可见域——本轮已部分定性，详见 VERIFY_b3struct_append.md §五）

- 分组 census 后残余：+2.93MB/源 中 contexts 仅 0.054MB/源；**主体=三段全文件行走查（globalBindings/decls 循环/type 块）的逐轮暂存活块滞留，阶段归因 50.7%/33.1%/14.7%，合计 ~74 万块**。
- 有界 scratch store-barrier 实测仅收回 ~3 块/decl——释放滞后机制未定谳，站点级归因移交（allocation ledger / ORC 审计）。

## 三、三刀授权面→落点映射（落地实录见 VERIFY_b3struct_append.md §三）

| 刀 | 授权原文 | 落点 | 语义权威边界 |
|---|---|---|---|
| ① | compact frozen metadata projection 提前流式构建 | typed_expr.cheng seal 域 | 构建输入=完整 build index 不可前移 ⇒ pass2 逐 context「流式压实+即释」臂 |
| ② | 每 source context 压实后立刻释放全量字符串/数组 | typed_expr.cheng typedExprFrozenProjPass2Rec | facts 循环跨源声明读经 contexts ⇒ 释放点=seal pass2 扫（语义上最早的可行点），全量校验前移护航 |
| ③ | line-intern 文本 dedup 安全边界批量归还 | compiler_csg.cheng refcount 域（删）+PhaseArenaLineStoreReset（边界）；intern.cheng 零改动（InternPoolRelease 即批量原语） | 38669 注释契约不动：InternId 只读域维持到边界 |

## 四、待钉区回填

- ⑦ typedSourceTexts 第二份快照 = 30,484,036B（已钉，双快照实锤）
- ⑧ seal 时刻 projection/compact/derived 字节 = typed_seal 行已插装，GEN2 rc=0 轮回填
- ⑨ 批量归还 vs 逐行归还 RSS 净差 = 已测：同树 A/B 批量臂净 −13MB（含其他刀），单独净值未拆
- ⑩ 相 3 爬升持有者 = 已锁定：三段行走查逐轮暂存滞留（阶段归因表）；站点级定谳移交
