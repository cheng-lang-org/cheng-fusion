# 纯 Cheng 自宿主编译器资源方案（时间与内存）

> 2026-09-06 立稿。本文是**纯 Cheng（.cheng 自宿主管线）编译器资源方案的唯一汇聚点**：
> 吸收 docs/cheng-plan.md 的 P2/P3/P4 条款与 9/5-9/6 全部实测移交
> （VERIFY_phasec_stage2 / gen2_w1 / gen2wave_1 / gen2wave2_1 / selfhost_theoretical_targets），
> 按最新定谳现势化。原档 P1（C 链桥接缓存，标注「桥接级投资、供自宿主平移」）不在本文范围。
> 数据/所有权/指针/C 冷链约束以 `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md` 为准；
> 本文只管时间/RSS 双极限。
> apply authority：task_plan.md 战役 R + 本文件。

## 一、对象与边界

- **对象**：.cheng 驱动管线编自己（GEN2/GEN3 自举路径）——src/core 的 parse→typed→lowering→plan→emit→link 全链。
- **不是对象**：cheng_cold.c/cold_parser.c（C 冷链）。冷链按 R4 只产 GEN1 种子；作为开发回路车头使用（现役车头烤 ~205-225s/轮，缓存命中 7s），**架构级优化禁止投在冷链**（原档战略纠偏；冷链侧两条已封顶结论见 §四边界）。

## 二点五、确定性内存管理锚表（2026-09-08 用户令：全线替换 1GiB 为 768MiB 理论极限）

> **口径迁移（2026-09-08 用户令）**：1GiB 最后防线废弃；所有内存守卫默认值与全部规范文档统一使用 **768MiB = 805,306,368 bytes** 理论极限（唯一权威常量 `tools/memory_model_limits.sh`）。历史 VERIFY 回执中的 1GiB 为迁移前证据，保留原文并标注。

**制度**：守卫默认值=下表理论锚=768MiB；1GiB 最后防线已废弃。差值>20% 开持有者核账，「留给守卫拦」=设计失败。

| 载具/相 | 理论锚（管理线） | 依据 | 终态锚 |
|---|---|---|---|
| 车头烤（35 条目全闭包） | **768MiB** | C 链同闭包实测 717-748MiB+3% 余量（单遍工作集+全局符号表+流缓冲） | 条目化后 200-300MiB |
| 夹具编译（单件） | **768MiB**（复用编译臂锚，实际单件应远低） | 同上；单件工作集更小，台账逐件对锚报差值 | ordinary ≤200MiB（验收口径 4 原值） |
| GEN2/自烤（35 条目） | **768MiB** | 同载具同闭包同工作集——自烤与车头烤是同一逻辑工作 | 条目化后 200-300MiB（Step3 终态） |
| 门禁进程树（四夹具+探针串行） | **768MiB** | 门=编译臂串行复用 | 同上 |
| Linux cgroup v2 守卫 | memory.max=768MiB | 与 Darwin 进程树守卫同口径；R5 回执双口径记录锚差值 | 768MiB |

**台账制度**：每轮烤机/门禁/自烤的 summary 必含「树峰 vs 锚差值」行；>20% 的轮次，该线 VERIFY 必须附持有者核账（谁占的、哪相、下一刀靶）。GEN2 rc=0 的健康形态=**900s 帽内 + 树峰 ≤768MiB 管理线**双达标。

## 二、现状实测（2026-09-06 权威口径）

**双轨账（9/6 静窗定谳，两套数字不可互代）**：

| 轨 | 构成 | 数值 |
|---|---|---|
| **C 头参照烤**（cheng_w126 烤 35 条目） | prescan 2s/entry 3s/admission 184.6s/codegen 66.5s/emit 0.2s | 全冷 205-225s；缓存命中 7s |
| **自宿主自烤**（knife_a 驱动编自家 239 源，静窗 900s 帽三重复核） | 计划/绑定/排序 ~20s；**profiles 逐源 parse 249.4s**；**metadata+forest 段 ≥630s 未触界**（forest append re-intern 串行命门）；下游 reachable/TypeArena/typedIr/graph 未达界 | 全墙 **≥2500-3300s**（p1long 3319s 死于中段） |

其余：夹具单件 76-96s（99% 曾在快照编排——已分解，剩余在相内 store I/O+哈希链）；死点演进 320s→3398s（churn 层清零后）。

**〔2026-09-13 TM1 实测翼相时标注（上表旧值保留）〕**：自宿主相时现势（抬门 3.5-3.6GiB 诊断轮、负载窗，同窗才可比；证据=总账 `design/deterministic_model_derivation.md` §8.75）：计划/绑定/排序 8.9-11.7s；profiles 逐源 parse **32.1-51.7s**（旧 249.4s 已漂移 −200s 级，归因未逐刀拆账）；metadata+forest 段 **260.7-397.2s 走完且 Seal 通过**（旧「≥630s 未触界」）；typed facts 相实测推进到 src≈21-34 即撞 frozen-anchor 族墙（单源 r92_td 0.22-0.26s，全相 ≈52-60s [估计外推]）；抵墙 wall 413-594s——旧「全墙 ≥2500-3300s」是 900s 帽内未触界的外推，与实测抵墙值口径不同不可互代；全链完整墙至今无读数。C 头参照烤旧 35 条目口径已被 234 源闭包带 [199,209]s 取代（§9.2 L1）。

**测量铁则**：①ps-rss 与 footprint 双口径必录（macOS 压缩使 footprint 高出 ps-rss ~600MB）；②**静窗铁则**——负载窗实测会把 210s 烤机压成 3319s/穿帽 1.134GiB（环境内存压力主导，VERIFY_gen2p1_3），一切时间/内存基准只在静窗取数；③正式探针 900s 帽，禁小时级陪跑（车头烤 >10 分钟即病理，lessons.md）。

## 三、架构定谳（路线上的三块墓碑，勿再回头）

1. **波次编译判死**（强于 wall102）：import resolve 需全量注册表、可达性/typedIr 固定点把 profiles/元数据/行池钉到终态——**波界不存在 terminal 死产物**；波界释放=把全局汇点改逐波增量，属 P1 本体而非「分波骨架」。
2. **逐行 churn 层已清零**：`TypedExprContextProcessTypeDeclLineOwned` 族化石删除（type 循环工作集化，每源 2 次往返），ParserStartsWith/PathTrim/行注释全视图化。此层再切无收益。
3. **冷链两条封顶**：materialize 并行骨架在烤机路径是死代码（reachable_only=1 短路）；admission 校验 memo 已平移 .cheng 侧落地（exact-def 三刀，C 链版冻结）。

**当前唯一路线 = P1 汇点增量化**：typedIr/profiles/上下文/行池从「全量累积到 typedIr 固定点终点」改为「按条目增量消费+释放」。前置三件（wall102 同级）：确定性预铸造免铸造化 parse、row 空间显式重映射、isolated snapshot+确定性发布。**字节恒等命门=row 分配保序清单**（VERIFY_gen2wave_1 §：orderedSources 字典序/profile 逐源/intern 池操作序/上下文追加序/可达性行序——分波+全量累积=同一全局操作序已证平凡，增量化的保序论证必须逐结构重做）。

## 四、两座现行墙（P1 的施工对象）

| 墙 | 画像 | 证据 |
|---|---|---|
| ParserForestAuthority intern 池+解析树 | `CompilerCsgBuildParserForestAuthorityInto → ParserValueExprTreeAppendFrom/Impl → langintern.Intern/FindInternId/CloneStr`；knife1 516s 栈，历代轮从未到达的相 | VERIFY_gen2wave2_1 |
| 逐源 typedIr/lowering 循环活集 | knife2 多相交替曲线（752/666/837/679MB 交替），语义必需、terminal 在 typedIr 固定点 | 同上 |

## 五、终态目标（9/6 重校）

- 原旗标 50-70s **系 C 头参照推导，不迁移自宿主管线**（静窗审计证伪：自宿主全墙 ≥2500-3300s，模型数 parse 5s/materialize 25s 来自 C 链）。自宿主时间目标改为**阶梯重推**：
  - **里程碑 T-1（当前）**：消 metadata+forest 段 ~500s 级串行 append（intern 正则化）→ 自宿主全墙降到 ~1500-2000s 级；
  - **里程碑 T-2**：typedIr fixed-point 波次化 → 继续下探；
  - **里程碑 T-3**：codegen 包围段分流（C 头 75.3s→~20s 结论仍有效）+ 下游未达界相的逐相账；
  - 每个里程碑落地后重推下一理论地板，不预设终值。
- 内存/迭代目标不变：ordinary ≤200MiB、自举 ≤768MiB live=0、零变更 ≤3s、1/3 编辑 ≤10s（均待 P1 条目化）。
  **〔2026-09-13 复推对照见 §九：L0 实测带已入 [413,594]s，C 链追平带更新为 [199,209]s（234 源闭包口径）〕**

## 六、施工分解（当前战线）

| 项 | 状态 | 载体 |
|---|---|---|
| **T-1 intern 正则化**（parse-into-forest 串行 append ~500s 级主墙） | **在跑**（PARSE-PERF 线：CloneStr 消除/intern 表升级/批处理/私有池并行四候选，先量化后动手）**〔2026-09-13 现势：停摆，见 §9.4〕** | VERIFY_parseperf_* |
| P1 汇点增量化 | 设计过审；投影证伪后重排为 T-2 配套（typedIr fixed-point 波次化） | VERIFY_gen2p1_2/3 |
| admission exact 校验族数组化 | ✅ 已合入（exact-def 三刀） | patches/time_exactmemo.patch |
| 快照编排分解 | ✅ 已合入（−46.7%，字节恒等） | patches/snap_split.patch |
| frontier 解析缓存逐波释放（F1） | ✅ 合入中（ps-rss 死点 −120MB 实测） | cheng-patches/gen2p1_1.patch |
| emit 窗四重副本释放 | ✅ 已合入（收益待 GEN2 口径实测） | patches/phasec_batch2.patch |
| T2 codegen 包围段分流（C 头 75.3s→~20s） | 设计就绪（P1 §3.2），排 T-1/T-2 后 | VERIFY_gen2p1_2 §3.2 |
| realizer 两处限制 | 边界已定性；被挡死时演进需求单列立项 | VERIFY_gen2wave2_1 §一 |
| store I/O 时间刀（夹具口径） | 待立项（夹具 76-96s 的现行热点） | VERIFY_snap_split §五 |

## 七、GEN2/GEN3 验收串联（rc=0 即刻执行）

gen2 rc=0 ≤768MiB → GEN2 产物自烤第二轮 → sha(DRV1)==sha(GEN2) + 三方哈希绑定 → Step2 组合装配复跑（命令在 VERIFY_step2_execdiff_0906）→ A+B manifest 手术施打（draft 就绪，施打前重跑三道门对账）→ Linux cgroup v2 精确 768MiB 双口径回执（tools/linux_cgroup_guard.sh 已验）。


## 二点六、2026-09-08 运行时状态（768MiB 理论极限生效后）

- 主树守卫已改 768MiB（`tools/memory_model_limits.sh` / `beat_c_process_group_guard.sh`）。
- TA-MEM t6 驱动（`sha256=8e83cd1b…`）在 `selfhost_b12` 克隆纯自烤：
  `rc=137@260s`，**profiles 构建期触帽**；`process_tree_resident_peak_bytes=624,951,296`、
  `process_tree_phys_footprint_peak_bytes=806,700,208`（限 805,306,368）。
- 逐相：`after_profiles` 618.9MB / 3.86M live；`metadata src=128` 1,013MB；
  峰窗已从 forest 前移到 **profiles + metadata contexts**。
- 下一刀：profiles 工作集 intern/增量释放 + metadata contexts 按源惰性构建/用后即释；
  目标 `after_profiles≤392MB`、metadata 峰 ≤768MiB，然后复烤 GEN2/GEN3。
- 证据：`docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_tamem_runtime_analysis_0908.md`。

## 九、2026-09-13 理论下限复推（TM2 理论翼：零烤炉、零源改动、纯只读复算）

> 性质：本节只做三件事——①还原 `13.641×` 的分子/分母与口径；②用今日（9/13）实测常量复推时间阶梯并与旧阶梯对照漂移；③给「病态倍数」的替换算式与占位。**旧文（§二/§五）保留原文不改数值，漂移一律在本节对照表内声明**；两处就地现势标注见 §9.4 尾。定义点：`docs/cheng-rsi-fusion-plan.md` §1.2、`design/time_model_structural.md`（L1 车道交付，同日）、总账 `design/deterministic_model_derivation.md` §③。

### 9.1 `13.641×` 口径还原（定义点 · 分子 · 分母）

- **定义点**：`bootstrap/cheng_cold.c:75967-75970` `compile_theory_parallel_limit_us = ceil(compile_real_cpu_us / hardware_logical_cpus)`（模型标签 `:76016`）。**该量是「本轮实测 CPU ÷ 14 核」的后验折算 = 并行效率倒数，不是算法下限**——此定性已升级为结论（`docs/cheng-plan.md` §七-1「2026-09-13 口径收口」、总账 §3.3、fusion 计划 §1.2）。
- **分子**：`compile_real_elapsed_ms=194117.692`（C 链 kd_fix 烤轮 compile 段 wall，234 源 / 641,945 行 / 30,549,584 B，串行为主：有效并行度 1.026 核）。
- **分母**：`compile_theory_parallel_limit_ms=14229.630` = `ceil(199,214,816 µs 实测CPU / 14 核)`。
- **复算**：`(194,117,692×1000)/14,229,630 = 13,641.66 → 13.641` ✓；等价式 `14 核 / (cpu/elapsed=1.02626) = 13.641` ✓（总账 §3.1 逐位复算在案）。
- **口径声明**：哪个车 = C 链（cheng_cold）烤轮；哪个语料 = 当代 234 源闭包；含不含烤 = C 链烤轮的 compile 段本身（C 链的「烤」就是这次编译）；串行/并行 = 实测单线程为主。**原始件 `.rebuild/auth_fix/` 已清理（本轮 `ls` 确认不存在），文档级证据 = 总账 §3.1 五字段逐位复算**。
- **同式今日读数**：kd_b102 `13.706×`（208.368s/649,715 行）、kd_b501 `13.654×`（199.342s/650,138 行）、kd_d102 `13.701×`（206.119s/650,999 行，cpu 210,614.756ms，`ceil(210,614,756/14)=15,043.912ms`）——全部 `[实测]`。**六代恒 ≈13.6-13.7×**：该量六天不动，因为它只测「并行没起来」（codegen `lowering_parallel_active_workers=0` [实测]），不测算法收敛。

### 9.2 阶梯复推（今日常量代入 · 新旧对照）

> 档名 L0/L0'/L1/L2/L3 沿用 kernel-w2 会话记忆口径；**全 docs grep `L0'`/`L0-L3` 零命中 ⇒ 无原定义处，本小节为复推重钉定义**。与本文 §五 T-1/T-2/T-3 阶梯的对应：L0≈T-0 现状、L1≈C 链常数参照、L2≈T-1/T-2 的逐相判据化、L3≈T-3 后并行档。

| 档 | 定义（本节钉义） | 公式 | 代入（9/13 实测常量） | 结果 | 旧值（9/6 口径）与漂移 |
|---|---|---|---|---|---|
| **L0** | Cheng 链 234 源全闭包门轮 wall（到当前前沿墙为止） | 直接实测 | b604 496s（默认 768MiB 门内）/ b404 594s；带内含抬门轮 c2d 413s、r96 452s | **[413, 594] s** `[实测]` | 9/6 全墙 ≥2500-3300s `[实测+外推]`；漂移 5-7×，**口径警告**：9/6 值是 900s 帽内未触界的外推全墙，9/13 值是实测到前沿墙（src=2 `generic declaration header invalid`），全链完整墙至今无读数 |
| **L0'** | L0 的抬门诊断形态（病态证据，不入达标） | 同上 | rss_guard_env=3,865,470,566：r96 452s / c2c 468s / c2d 413s（C2 硬切 A/B **−55s**） | **[413, 468] s** `[实测·diagnostic]` | 9/6 无此档读数 |
| **L1** | C 链常数追平档：Cheng 链全墙进 C 链同闭包烤 wall 带 | L1 = C 链 234 源烤 wall 带 | b501 199.342s / d200 205s / d102 206.119s / b102 208.368s / d201 209s | **[199, 209] s** `[实测]`；Cheng 距 L1 = **2.00×-2.98×**（c2d 413/206.1=2.00、b404 594/199.3=2.98，中心 ≈2.4×）`[推导]` | 旧「205-225s」是 **35 条目车头闭包**（cheng_w126）口径；今日常数带已换 **234 源闭包**（kd_fix 起即 234 源）⇒ 追平对象按本带统一，旧带不作对比基线 |
| **L2** | 逐相归因档：`T(p)=W_p/B_eff(p)+n_p·c_p`，每相 wall 可归因到结构项或逐世代实测 c_p | 结构项 = Σ W_p/B_ref | C 链：W_parse=31,058,042B ⇒ 9.5ms；W_codegen+W_emit=40,778,747 words×4B=163.1MB ⇒ 99.4ms；**Σ≈0.11s** `[推导]` vs 实测 206.1s ⇒ 1.9×10³×（定性：parse/codegen 全由 n_p·c_p 支配，该倍数不可作收敛判据，c_p 无理论值）。Cheng 森林窗：结构底 30,991,157B ⇒ ≈9.4ms vs 实测 327,648ms ⇒ ≈3.5×10⁴× `[推导，B_ref=3.28GB/s 自洽参照声明]` | 判据化，无单一数值 | 9/6 T-1「~1500-2000s 级」`[估计]` 已被事实越过（口径变更），T-1/T-2 判据由 L1 车道模型接管（森林窗 <120s 仅 29 源档可判定） |
| **L3** | 并行下限档：各相 wall → max(W_p/B_eff, 关键路径) | X = T_wall / T_floor | 现状并行事实：codegen 单线程 `[实测]`、有效并行度 1.0218/14 核 `[推导自 d102 字段]`、BACKEND_JOBS=2 `[实测 .rebuild/d1_line/d1_bake.sh:41]` | **占位**（TM1 实测落账后代入，见 §9.3 判据 C） | 9/6 无此档 |

**闭包漂移底账**（同式读数的分母在动）：行数 641,945（kd_fix）→ 649,715（b102）→ 650,138（b501）→ 650,999（d102）`[实测]`；源字节 30,549,584 → 30,989,631 → 31,058,042 B `[实测]`。任何跨代倍数比较必须先对齐闭包世代。

### 9.3 病态倍数更新建议（算式 · 占位）

- **旧倍数冻结**：`13.641×` 停用为病态倍数（§七-1 口径收口已定性）。同式今日 13.654-13.706× 与其差 <0.5%，无信息量。
- **判据 A（结构流量倍数，病态主判据）**：`X_A = W_impl/W_algo = 6.109×10¹² B / 3.099×10⁷ B ≈ 2.0×10⁵`（等密度假设；无假设上界 5.3×10⁵；region 项未钉在外）`[实测推算，time_model_structural §2.2.2]`。
- **判据 B（并行度倍数，诊断用）**：`X_B = N·T_wall/T_cpu`；d102 代入 = 14×206.119/210.615 = **13.70** `[推导自实测字段]`。语义 = 「并行没用起来」，不进收敛判词。
- **判据 C（TM1 占位）**：`X_C = T_实测(TM1 收割落账值) / 206,118.919 ms`（d102 基准；对带下界用 b501 199,342.183 ms）。**TM1 未落账**：总账 grep `TM1` 零命中，`.rebuild/tm1_line/` 现仅 `harvest_bake_receipts.py`（9/13 11:48，收割 bake 日志回执字段的只读脚本）。TM1 落账后由其回填本判据，本节不代填。
- **判据 C 回填（TM1 落账，2026-09-13）**：总账 §8.75 已落（`.rebuild/tm1_line/` 现含 harvest 脚本 ×2 + REPORT.md）。X_C 全程值**无读数**（自宿主在 typed facts 相 src≈21-34 撞墙截断，无可测全程）；「到前沿墙」口径 X_C = 413-594s ÷ 199.3-206.1s = **2.00-2.98×** `[实测比]`（与 §9.2 L1 行一致）；相级现势：计划/绑定/排序 8.9-11.7s、profiles 32.1-51.7s、并林窗 260.7-397.2s（内含回放免重解析已兑现 −55.3s 同窗 A/B）、typed facts 截断段 + 全相外推 ≈52-60s `[估计]`，逐相表见总账 §8.75。

### 9.4 在跑三线现势核查（2026-09-13 实读）

| 线 | 现势 | 最后证据 | 定谳 |
|---|---|---|---|
| PARSE-PERF | **停摆/stale** | `VERIFY_parseperf_4_append.md`（9/8 16:09） | 负结果在案：patch 未落主树（`git apply --check` rc=1、intern 新符号全树零命中），收割剩余步=主线程重放+重烤认证；其 intern 正则化目标已被三站点缓存线部分接管（token/typeSyntax 已补 `c5f6c6736`，region 未补） |
| R2-C | **活跃尾期/待核（非 stale）** | `VERIFY_r2c_c6_append.md`（9/7 合入复验，严格门 236→221）→ §5.7.12 现势 violations=42（载体 `design/pc_closure_s1_progress.md`，mtime 9/11 03:18） | 9/12-13 无新证据；不能确认仍在跑 |
| WHENBLOCK | **已闭卷（9/6）** | `VERIFY_whenblock_append.md` 主线程合入复验节 | patch 落主树 + typed 契约白名单放行，m14=m15 sha `60c22b96` rc=0，探针 11 绿/8 红，probe_when/probe_block 翻绿；kernel-w2 记忆「在跑」已过时 |

**就地现势标注（旧文保留，仅加标注）**：§六 PARSE-PERF 行加「2026-09-13 现势：停摆，见 §9.4」；§五 阶梯加「2026-09-13 复推对照见 §九」。
