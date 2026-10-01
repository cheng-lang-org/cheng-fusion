# VERIFY_parseperf_3_append —— [PARSE-PERF] F1a 重放+F1b 列访问常数三刀+F3 单次树读机制（族门二 PASS；F3 累积实测负收益默认关，机制与账留存）2026-09-08

date_utc=2026-09-07/08 · 代理=PARSE-PERF 收尾官（前线会话丢失后重建轮）· 克隆=/Users/lbcheng/cheng-f24/anchor_clones/parseperf（基线 55979da69=主树 01098da25 工作树全量含他线稳定 WIP parser+771 行；HEAD 4ca62c079）· patch=cheng-patches/parseperf_3.patch（1190 行，sha256=734b0e43b7b2aa9126f1600c860bf5134cf3683b4976f102befb803d4bb00e26，主树 `git apply --check` rc=0）· 车头=cheng_cold_v2（族门）/cheng_w126_re（bench）· 提交链=66afe4675(三刀)+05e34275f(探针重建)+c41145c7c/88ecbcbb4/f5adf52f8/2410bf38c(病态处置)+4ca62c079(处置)

## 结论先行

**族门二 PASS：配对烤机 ×2 sha 恒等（0a7132426cf2fb2599c321c0ce4add1d0c2bf669adf025cd5b5d0ea4050827a9 ×2，cheng_cold_v2 车头，wall=316/310s，车头树峰 688.4/690.2MiB=768MiB 锚 −10.3%/−10.1%）；四夹具门 pass=4 known_red=0 stale=0，probe_pass=12 probe_red=7 probe_stale=0——判词对 m14 认证 TSV 零漂移（for/match/closure/generic/try/array 七红逐字吻合）。实测账：F1b+F1a 使 39,169 行 parser.cheng 自源 profiles 相 6936→5361ms 与 5175→4880ms 两对实测（−6%~−23% 噪声带），树读栈采样成本降 ~7.6×（62 次整树读共 21s≈0.34s/源）；F3 单次树读机制正确性过门但 profiles 相内 TreeAppendFrom 累积实测 12.6s/源（m1d3：62 源 779.5s，对照禁累积 0.68s/源）净损一个量级——**默认已关**（`work.parserForestAccumulate=false`，回落既有逐源解析语义分毫不差），机制+账留存，持有者=profiles 相 forest append 上下文敏感放大（权威循环折算 ~2.6s/源→本相位 5×），为下一病灶刀靶。目标「10k 行源 parse ≤0.05s」未达：post 态 10k 行折算 ≈1.37s（parser.cheng 口径 137µs/行），残余墙=行扫描多趟调用礼金+树读体+（基座新增）profiles 相 RSS 棘轮。K5a/K1/K2/F2 刀随原克隆清扫灭失，待重放（commit 文案在）。**

## 一、事故与重建（背景一行）

原克隆 9 月 7 日 16:48-16:56 被并发 `rm -rf` 连根删除（含未交付 K/F2/F1a 提交 f97c2efe5 与 .w 全套），不可恢复（无 APFS 用户快照）。按 B 方案减配重建：主树 01098da25 工作树全量克隆（55979da69）→ F1a 按原文重放 → F1b/F3 新落 → 计费探针按原文重写。损失清单与决策记录见当日子代理报告。

## 二、刀体

| 刀 | 面 | 论证 |
|---|---|---|
| F1a 重放 | parser.cheng LogicalLineEnd | 携带态 prevLine/prevKind+裸列读替换每迭代 4 次带 panic 访问器；原脚本逐字重放，锚点全中 |
| F1b① | parserTokenIdentityRowAt（九列 1 call）+parserTokenKindColumnAt（行首双列 1 call） | validate 每行 7-9 次访问器→1 call；shape/索引契约由函数头断言先行证明，值逐字节同访问器 |
| F1b② | 直通化：FindTopLevelKind/FindMatchingToken/typeSyntax parseRange+parsePrimary/ParseParameterDefaults | 入口一次守卫替代每迭代 RequireToken+边界 panic；合法输入逐字节同值，非法范围仍入口 panic（同 RequireToken 文案，不放宽判词） |
| F1b③ | basePtr/列外提 | 纯读扫描循环（两 Find+F1a 环）arena 基址+post-lex 冻结列提出循环；含分配循环只外提冻结列、基址逐调用取 |
| F3 机制 | KeepTree 管线（ExactInto/WithExternal 树外移变体）→profiles 循环逐源累积（compilerCsgAccumulateParserForest）→BuildParserForestAuthorityInto 接管 | annotation 树读（采样=profiles 相 100% 成本）就地升级为权威累积森林，每源单次树读；producer 行同序（wall154）；单源免 append；**实测负收益，默认 `parserForestAccumulate=false` 关闭**（见四） |

F 刀全程未动 arena.cheng 公开面（红线）；三处冷链借用/准入拒绝按 RSI 规约过墙（见五病态处置账），正解归编译器战役。

## 三、族门二门禁表

| 门 | 结果 |
|---|---|
| 配对烤机 ×2（同名 kernel_driver，全冷禁缓存，cheng_cold_v2） | **PASS** sha256=0a7132426cf2fb2599c321c0ce4add1d0c2bf669adf025cd5b5d0ea4050827a9 ×2（wall 316/310s） |
| 树峰 vs 768MiB 锚（新规） | 车头 688.4/690.2MiB=**−10.3%/−10.1%**；门进程树峰 939934968B=896.4MiB=**+16.7%（v6 夹具，帽内超锚，持有者核账见六）** |
| 四夹具门 | **PASS** pass=4 known_red=0 stale=0（ordinary 683MiB/call_fixture 805MiB/cold_nested 738MiB/v6 896MiB） |
| 判词对 m14 认证 TSV | **PASS** probe_pass=12 probe_red=7 probe_stale=0（for `surface=..< rootNode=-1`、match/closure/generic/try `statement_offset=82 statement_offset=61`、array `FieldGet layout` 逐字吻合） |
| patch 纯度 | **PASS** parseperf_3.patch 主树 apply --check rc=0；刀面=parser.cheng/compiler_csg.cheng/probes 探针三文件 |

## 四、F3 累积实测账（m1d3/m1d4 对照，900s/500s 帽）

| 轮 | 态 | 结果 |
|---|---|---|
| m1d3 | 累积 ON+分相锚点 | 自烤 903s 穿帽 kill，死在 profiles 相尾（62/239 源）；profile_enter 段 **779.5s/62=12.6s/源**；树读四段合计仅 21s（0.34s/源=F1b/F1a 实效 7.6×） |
| m1d4 | 累积 OFF（诊断 overlay） | 自烤 136s **RSS 守卫 trip 1.003GiB**（基座 profiles 相 ~200 源棘轮，先于 forest 段的存量病灶——非本刀回归，主树基座即如此） |

对照定谳：累积路径每源 +12s（append 在 profiles 相上下文敏感放大 5×：权威循环折算 ~2.6s/源）；禁累积快速但撞基座 RSS 棘轮。**故 F3 机制保留、默认关**；翻开关的前置=下一刀清 profiles 相 append 持有者（或 append 本体 O(累积) 重 адаптация）。F3 正确性已由 m1d3 状态过门证明（sha 2cbf1d53×2，当时判词亦零漂移）。

## 五、病态处置账（kill→取证→修复→重跑）

| # | 判据 | 现象 | 修复 |
|---|---|---|---|
| 1 | 烤 rc=2 errno=2 | parseperf_bench 探针件随旧克隆灭失 | 按原文重写（05e34275f） |
| 2 | 烤 rc=2 `borrowed actual cannot bind non-var non-@borrows formal`（caller=TokensStrictValidateInto） | parserTokenIdentityRowAt 缺 @borrows（账房同判） | 一行 @borrows（c41145c7c） |
| 3 | 烤 rc=2 `body-store-freeze: BodyIR exact identity schema is invalid`（fn=BuildOrderedSourceProfilesRec） | F3 累积块嵌套分支 store 形状触发冷链证书缺陷族 | 块抽独立 compilerCsgAccumulateParserForest，小 body 过墙（88ecbcbb4） |
| 4 | 烤 rc=2 `borrowed actual`（ordinal=6 stableWorkspaceRoot） | 行号迁移暴露 borrowed→值形参 | 调用点 CloneStr ×3（f5adf52f8） |
| 5 | 烤 rc=2 depth=2 borrowed call argument（Rec 体内） | helper 收 borrowed sourcePath | helper 加 @borrows+activeText CloneStr owned（2410bf38c） |
| 6 | 审计自烤账无效 | 剥离函数被脚本手术误删，自烤带锚编译 | 杀 42615→修剥离→树态核零脏→重跑 |
| 7 | A/B pre 态污染 | .f1b 备份实为部分 F1b 态 | pre 改 git 基线 55979da69，A/B 语义=整批合并账 |

## 六、树峰 vs 锚（768MiB 管理线）与持有者

| 对象 | 树峰 | vs 锚 | 归因 |
|---|---|---|---|
| 车头烤 g2a/g2b（终态） | 688.4/690.2MiB | −10.3%/−10.1% | 达标 |
| 门进程树峰（v6 夹具，最重） | 896.4MiB | **+16.7%** | 持有者=基座他线 WIP parser(+771 行)+闭包编译工作集；对照：F3 累积 ON 轮 v6=1003MiB（+30.6%），累积关闭已回收 ~107MiB |
| m1d4 全量自烤（诊断） | 1.003GiB trip | +30.6% | **基座 profiles 相 RSS 棘轮**（旧 m1d 基座同病但死在 forest 1.088GiB；本基座提前至 profiles ~200 源）——下一病灶刀靶（归主线程派刀） |

## 七、基线对照与待重放

- m1d 权威账（旧克隆，旧基座）：profiles 99s/metadata 16s/forest ~615s（split_enter 段 571.9s 实测）。本轮重建基座（他线 WIP+资产管线合入）上 profiles 相本身已 RSS 棘轮化，frozen 对比口径失效——本 VERIFY 一律以克隆内 pre/post 同基线 A/B 为准。
- **K5a/K1/K2/F2 待重放**（原提交 d35304068/aabd0420e 随克隆灭失，commit 文案在：K5a 关键字首字分派/K1 深度扫描融合/K2 types 无分配边界化/F2 intern 单哈希+InternOwned）。重放后与 F1b 叠加再攻 500ms 线。
- 残余墙序（实测）：①profiles 相 append 持有者（F3 开关前置）②基座 profiles RSS 棘轮（帽前病灶）③行扫描多趟调用礼金 ④树读体（已被 F1b 砍 7.6×，绝对值已小）。

## 八、纪律记录

- 全程 bake_win 锁排队（主线程 m31/seqfg 多轮门前置，未越权；两次幽灵锁按协议接管均为主线程进程已死后）。
- 测量运行（bench 直跑/采样）不在烤机锁域；三次 bench 账中全量走查口径（900s 帽内 walk+read 墙压顶，parse 只累积 6.6-7.2s）作废不采信，单源 filter 口径为准。
- 交割后大对象清理责任：.w 冷缓存/bench 二进制/驱动二进制/审计日志按纪律清除，文本台账保留。
- 探针 overlay（apply_anchors.py 重建版）仅诊断轮使用，门禁/配对轮均核残零。
