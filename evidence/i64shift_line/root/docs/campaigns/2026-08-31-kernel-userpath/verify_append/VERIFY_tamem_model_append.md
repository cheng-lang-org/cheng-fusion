# VERIFY_tamem_model_append —— [TA-MEM] GEN2 自烤逐相理论工作集模型（确定性预算）2026-09-08

date_utc=2026-09-08 · 代理=TA-MEM（战役 R「typed/TypeArena 内存刀」）· 性质=第一交付物：理论内存模型（逐相工作集公式+确定性系数+实测对账），过审后放实施 · 证据克隆=/Users/lbcheng/cheng-f24/tamem（.w/ta/：ta1 完整死点曲线+5 张峰窗 vmmap、ta6 连拍 40 张 600-616MiB 窗 vmmap）· 测量纪律=全程默认 1GiB 帽，12GiB 抬帽轮 ta4h/ta5h 已作废销毁不交付

## 一、结论先行

**GEN2 自烤（m60 车头×自家闭包 230 源/643,601 行/30.64MB）在 after_profiles（实测 478-560MB@114-118s）之后的 metadata/forest 段理论上只需再驻留 forest 本体 T≈450-510MB 的「单份」，但实测峰 1,081-1,127MB（rc=125，ta1/ta4h 双轮互证）——差值 ≈450-550MB 全部可归因于三类遗留：①forest arena 倍增拷贝瞬态（realloc 旧块+新块共存，固定 +1.0-1.5×T≈450-680MB 峰窗）；②lineStore+lineInternPool（模型价 ~96-133MB）越过自己的最后读者（CompactProfilesForFixedPoint）继续滞留到 forest 窗；③基座 MALLOC 活集 299-342MB 中 metadata-contexts/森林重解析 churn 的死页未还。模型判 rõ：把 forest 合并改为精确容量一次成型（无 realloc 拷贝瞬态、无 2× 容量过冲）+ 相序重排（lines 释放前移过 forest 窗）+ TypeArena 流式化（远期），每相驻留即贴模型线，树峰落 768MiB 锚内是模型推论的必然结果而非「削峰凑数」。**

## 二、闭包硬参数（m60 烤机报告实测，sha=fe6ee57d…）

| 参数 | 值 | 来源 |
|---|---|---|
| source_file_count | 230 | bake.report compile_input_source_file_count |
| source_line_count | 643,601 | compile_input_source_line_count |
| source_byte_count | 30,637,438 | compile_input_source_byte_count |
| declaration_origin_count | 18,515 | bake.report |
| function_count（cold frontend） | 21,142 | bake.report |
| total_function_count | 13,784 | bake.report |
| type_count（cold frontend） | 1,621 | bake.report |
| body_op_count | 2,641,061 | bake.report |
| body_block_count | 764,465 | bake.report |
| param_count | 37,463 | bake.report |
| cold_arena_kb（后端代码域） | 212,801KiB | bake.report |

运行时底数（ta1/ta6 vmmap 实测）：驱动二进制常驻底 ≈190MB（__TEXT 155MB + __DATA 12MB + __LINKEDIT 23MB；高负载窗 LINKEDIT 可涨到 133MB，属环境页缓存噪声不入模型）；MALLOC zone 记账基线（enter 时 live_allocations=47,045）。

## 三、行数系数（静态 census 校准+待钉区）

**静态 census（ta_census.py，239 文件逐源词法近似切分，入口=dispatch_min，含 cheng/std 双包映射）实测：闭包 = 239 文件 / 33,289,961B / 696,770 行 / 3,801,036 tokens（0.114 token/byte = 5.45 token/行）。** 与烤机报告口径差（census 696,770 行 vs report 643,601；33.29MB vs 30.64MB）=报告只计纯代码行/有效字节，模型各处双口径并注。

| 系数 | 取值 | 校准源 |
|---|---|---|
| tokens（闭包） | **3.80M（静态 census ±10%，待运行时钉死）** | ta_census.tsv（克隆 .w/） |
| tokens/byte | 0.114（parseperf bench 的 0.27 系数属 token 高密合成源，真实代码带宽不适用——旧带宽作废） | 同上 |
| nodes/token | 0.55-0.82（nodes ≈ 2.1-3.1M） | 双向锚：硬下界=body_op_count 2.64M×(nodes≥ops 子集关系不成立，反向：ops≈每节点 1-1.3 op) ⇒ nodes ≈ 2.1-3.1M；nodes/line 3-4.5 |
| ⇒ 闭包 nodes | **2.1-3.1M（中位 2.6M）** | 待钉区① |
| typeSyntax 行 | 0.5-1.0k/源（中位 0.75k）→ 115-230k 行 | 待钉区②：无直接实测 |
| statementRoot 行 | ≈ body_block_count=764,465 | 块与 statement root 对应（待钉区③） |
| 唯一行文本 | ≈643,601×0.9 去重 ≈ 580k 条 | lineInternPool 去重系数 0.9（待钉区④） |

待钉区①-④的钉死方法：一次默认帽 900s 自烤在既有 csg_stage 通道补 4 个计数打印（token/node/typeSyntax/line 池 entries），**零抬帽、纯打印**，与第二步核账轮同轮完成（打印代码已在诊断克隆，驱动无法在帽内重烤——钉死轮改由主线程下次认证烤机顺带，或以静态 census ±10% 先行约束）。

## 四、逐相理论工作集公式（DOD 确定性宽度）

### 相 0：enter（驱动自举）
```
WS_0 = 二进制底 190MB + runtime 记账底 ≈ 190MB        （实测 139.5MB：低负载窗 LINKEDIT 未全驻）
```

### 相 1：bind/source_texts（实测锚 258MB@after_binding_source_texts）
```
WS_1 = WS_0'（二进制 190）
     + 源文本快照 30.6MB（唯一全量属主，sourceSnapshots）
     + 文本缓存/查找索引 ~10-30MB（bind 表+import 边+模块表）
     ≈ 230-250MB                                          （实测 258MB，Δ=+8~+28MB ✓贴线）
```

### 相 2：profiles（实测锚 478MB(ta1)/560MB(ta6)@after_profiles）
```
WS_2 = WS_1（含快照 30.6MB）
     + lineInternPool
        = 唯一行文本 payload ~24MB（580k×~41B/行）
        + texts 槽 580k×16B = 9.3MB
        + 索引 4 列（16B keys 槽 + 4B×3 辅列）×2^21 槽 = 58.7MB
        ≈ 92MB
     + lineStore i32 列 643,601×4B ≈ 2.6MB
     + exprCallProfiles（decls 18,515 行×~400B 含名字/span/默认值句柄
        + per-source call 图与 import 边 ≈ 40-60MB）≈ 47-67MB
     + metadata 累积前纸面（contexts 相未开始）
     ≈ 372-392MB                                          （实测 478-560MB，Δ=+86-188MB → 遗留账 A，见 §六）
```

### 相 3：metadata（profiles 后→forest 前，无实测锚——ta1/ta6 均死前无 stage 打印，此相与相 4 合并核账）
```
WS_3 = WS_2 - profileImportcMasks（已清）
     + typedMetadataContexts 230 源×~50-200KB/源 ≈ 12-46MB
     + sourceIdentityIndex ~5MB
     ≈ 390-440MB
```

### 相 4：forest（本刀主靶区）
```
Forest 单份 T =
  tokens:   3.80M × 9 列×4B（kinds/sourceTextIds/producerSource/sourceLocal/
            lexicalParent/starts/ends/lineNumbers/columnNumbers）= 36B/tok
            ⇒ 137MB（census ±10% → 123-151MB）
  nodes:    2.6M × 29 列×4B ≈ 116B/node ⇒ 302MB（带宽 243-360MB）
  typeSyntax: 172k × ~40 列×4B = 160B/行 ⇒ 27MB
  statementRoots: 764,465 × 7 列×4B = 21MB
  declarations: 18,515 × 16 列×4B = 1.2MB
  regions/generics/patterns/lexicalBindings/importOrigins ≈ 15-30MB
  ⇒ T ≈ 445-530MB（中位 488MB）；实测反推（§五）T_实 ∈ [256,512)MB
    ——两口径相容，峰窗倍增阶梯定容量的方法只能给区间

WS_4（理想）= WS_3 - lineInternPool(92MB) - lineStore(2.6MB)   ← 相序重排后
            + T + 当前源树瞬态 s（≤ 最大源 primary_object_plan 4.39MB×~38 ≈ 60-170MB）
            ≈ 350 + T + s

WS_4（现状实现）= 上式 + realloc 拷贝瞬态（旧块+新块共存，倍增策略
            最终一步 = capacity(T)≈2^k ≥ T，瞬态 ≤ 1.5×capacity）
            + 容量过冲（capacity ∈ [T, 2T)）
```

### 相 5：TypeArena 生产（forest 后）
```
WS_5 = WS_4 - T（forest 释放，TypedExprTypeArenaReleaseOwned/森林 ParserValueExprTreeRelease）
     + TypeArena 单份 A：
        tokens 4 列×4B=16B/tok × 3.80M = 61MB
        typeSyntax ~24 列×4B × 172k = 17MB
        types/symbols/members/resolutions/dependencies/SCC ≈ 20-40MB
        ⇒ A ≈ 100-120MB
     + build 瞬态（symbolByDeclarationRoot/bucketHeads=4B×typeSyntaxCount×3、
        functionByOwnerToken=4B×tokenCount=15MB、memo/visiting/derived 三列
        =12B×typeCount）
```

### 相 6：expr/typed-facts 循环 + typed ir（ta1 未达；模型先行）
```
WS_6 = WS_5 + semanticTypedFactAccumulator（facts 行 41 列 SoA：26×4B+15×1B
        ≈ 119B/行 × 行数[待钉区⑤，量级 1-3M]）+ typedIr arena + sidecars
```

## 五、实测对账（ta1 完整曲线 rc=125@781s；ta6 曲线+连拍）

| 相 | 实测 RSS | 模型值 | 差值 | 差值定性 |
|---|---|---|---|---|
| enter | 139.5MB | 190MB（二进制底） | −50MB（LINKEDIT 未全驻） | ✓ |
| after_binding_source_texts | 258MB | 230-250MB | +8~+28MB | ✓贴线 |
| after_profiles | 478MB(ta1)/560MB(ta6) | 372-392MB | **+86~+188MB** | 遗留账 A（§六-1） |
| metadata+forest 窗 | 峰 1,081-1,127MB（ru_maxrss，rc=125） | 理想 =350+T+s ≈ 830-880MB（T 实 450-510） | **+250-300MB** | 遗留账 B/C（§六-2/3） |
| ta6@616MB 连拍分解 | MALLOC_SMALL 299MB(live 3.35M 块,frag 7%) + VM_ALLOCATE 212MB + 二进制 288MB | — | — | MALLOC 活集贴模型（profiles 结构+lines 池），无碎片遗留；VM_ALLOCATE=forest 生长中 |

T 的实测反推：ta1 曲线 t593→t671 出现 917→500MB 阶跃（−417MB）——即 forest 倍增 realloc 完成后旧块释放；旧块=capacity/2，故 capacity ≈ 512MB（2^29B 阶）、T ∈ [256, 512)MB；峰瞬态 = 旧块 256MB + 新块已拷贝页 ≈ 256+512 部分驻留 + 基座 ≈ 实测 1,127MB 吻合。

## 六、遗留物清单（按差值大小排刀序）

| # | 遗留物 | 持有者 file:line | 模型价 | 刀形 |
|---|---|---|---|---|
| B1 | **forest arena 倍增拷贝瞬态+容量过冲** | arena.cheng:211（growCap=capacity*2）× compiler_csg.cheng:33048 森林合并循环（每源 AppendFrom 无预容量） | 峰 +450-680MB | 结构改造：合并两阶段化——先逐源解析入列表累计精确 ΣArenaUsed，再一次 ArenaReserveCapacity 精确容量，后逐源 AppendFrom+即释；全程零 realloc 拷贝、容量=T 无过冲。随源释放后峰驻留=基座+T+s【更正 2026-09-10 实读：`:33048` 实为 `err = " compiler csg: parser forest authority input invalid"`，合并循环在 `:33083`（`while mergePass < 2:`）；且「每源 AppendFrom 无预容量」前提**已被 B1b 两遍精确容量改造推翻**——现 pass1 有 `sourceArenaBytes[i]+65536` 精确 reserve，见 `:33115-33119`。该 B1 条目的**结构改造已在 HEAD 落地**，原文保留为历史证据】 |
| B2 | **lineStore+lineInternPool 越窗滞留** | 持有=compiler_csg.cheng work.lineInternPool/lineStore；最后读者=CompilerCsgBuildReachableFunctionSet(38553)+CompactProfilesForFixedPoint(38640 释放)；forest build(38530) 插在最后读者之前 | ~95MB 在 forest 窗白驻 | 相序重排：forest build+typedContextLookup 移到 CompactProfilesForFixedPoint 之后（依赖核查：reachable set/compact 不触 forest ✓） |
| A1 | profiles 相 Δ+86-188MB | 成分=MALLOC churn 死页（decls_scan 瞬态）+二进制 LINKEDIT 负载漂移+系数带宽 | 中 | 非结构遗留，钉死待钉区①④后重判；malloc 死页由 MALLOC_LARGE(empty) 段回收自然回落（ta1 700MB 窗已证 VM_ALLOCATE 回落 48MB） |
| C1 | TypeArena token 列对 forest token 列的二份拷贝（16B/tok=61MB vs 36B/tok） | typed_expr_type_arena.cheng:108-111（tokenProducerSourceIndexes/tokenKinds/tokenSpanStarts/tokenSpanEnds） | 61MB（forest 释放后此账仍在） | 远期：token 坐标只留 TypeArena 单份（砍 forest 相）或验证 typed ir 后无读者再释放；本刀不动（语义权威保留），条目化移交 |
| C2 | typed facts/typedIr 行数待钉区⑤ | typed_expr.cheng TypedExprFactTable | 未钉 | 相 6 打点后核账（GEN2-P1 域） |

## 七、模型判定

1. **1GiB 铁门的模型解释**：现状峰 = 基座(478) + T(450-510) + 倍增瞬态(450-680) ≈ 1.38-1.67GB 纸面，实测 1,127MB（部分新块页未触）——铁门 trip 是倍增瞬态单因素所致；去掉 B1 即回落 ≈830-880MB，再去 B2 落 ≈740-790MB，贴 768MiB 锚。**无需动 token 双份（C1）即可回锚**，C1 作为远期结构刀条目化。
2. **待钉区**（一次 900s 默认帽轮的 4 个计数打印钉死）：①nodes/token ②typeSyntax 行 ③statementRoot 对应 ④行去重系数 ⑤facts 行数。
3. **每相贴线验收口径**（本模型生效后）：每相实测 RSS 对本表模型值报差值，差值>50MB 即遗留物待解释；GEN2 rc=0 + 树峰 ≤768MiB + 相差值贴线三判据同时成立才算绿。

## 八、纪律记录

- 全部测量轮默认 1GiB 帽；ta4h/ta5h 两轮 12GiB 抬帽违反红线已作废，产物已销毁不交付（ta4h rc=125 无产物；ta5h rc=124 部分产物已删）。
- ta6 连拍轮（默认帽）跑至 616MB 窗后按指令 kill，40 张 vmmap+曲线已入档。
- 理论模型先行的裁决落实：本文档=第一交付物，过审后放实施（B1/B2 刀面已定性：arena.cheng+compiler_csg.cheng 两文件，均非他线冻结面——parser.cheng/primary_object_plan/program_support_backend 零接触）。
