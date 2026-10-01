# VERIFY_parseperf_4_append —— [KF2-REPLAY] K5a/K1/K2/F2 四刀重放（灭失提交 d35304068/aabd0420e 按案重实现；免窗 A/B 对账成立；配对烤机 sha EQ；判词 12 绿+7 红零漂移；v6 夹具 1GiB 帽线为基座噪声生死线，非刀回归）2026-09-08

date_utc=2026-09-07/08 · 代理=KF2-REPLAY（战役 R K/F2 重放线）· 克隆=/Users/lbcheng/cheng-f24/kfreplay（基线 50f54e69b=主树工作态全量 HEAD 60f4e5b50+他线 WIP）· patch=cheng-patches/parseperf_4.patch（1043 行，sha256=a1407a9e2a5f76ee332a29480c7077615c7e82b6fdd8bea1f091e408c69c2aa0，主树 `git apply --check` rc=0）· 车头=/tmp/cheng_cold_v2（烤机+bench 双通道同车头）

## 结论先行

**四刀（K5a 关键字首字分派+40 对审计守卫/K1 深度扫描融合/K2 types 无分配边界化/F2 intern 单哈希+InternOwned）按原 A/B 账与实施描述重实现并交付 parseperf_4.patch。免窗交错 A/B（3 轮×5 rep×9 形状，min 估计器）：b_decls −32% 与原账精确一致，f_strings −53%（原 −45%）、a_fill −43%（原 −67%，同向同级差<2×）、t5000 −15%（原 −23%）；**d_comments +2%=机制平，原账 +32% 定谳为负载漂移，悬案结案**；v10000 −3% 弱于原账 −11%（本基线已含 parseperf_3 全刀，@ 源树构建占比更大，如实记录不硬凑）。9 形状解析输出 pre/post 逐字节等价。族门：配对烤机 ×2 同名 sha EQ（945f833c057c6ff431c3ad23e0cb4b41d652e3a7295c2574eea6b77e83e5c431 ×2，wall 290/255s，车头树峰 721.5/722.6MiB=768MiB 锚 −6.1%/−5.9%）；判词区 12 绿+7 红对无刀基线门逐字零漂移（红词含 probe_try statement_offset=82/61 与 parseperf_3 期 byte-identical）；四夹具门在无刀基线上官方 1GiB 帽全绿 rc=0（12/7/0 复现认证态），刀态单轮 v6 compile trip 1,074,970,624B 超帽 1.2MiB（0.11%）——交错配对采样证明刀效应仅 +1.4~+6.3MiB 而同码重跑通道噪声 ±20~140MiB、基线 v6 已坐 998.5MiB 帽线，**该 trip 为基座增长（parseperf_3 期 896→现 ~1000+MiB）+噪声生死线，非四刀回归**；诊断门（cap 1280）刀态四夹具 4/4 PASS。**

## 一、刀体（重放对照原实施描述）

| 刀 | 面 | 重放要点 | 原描述对应 |
|---|---|---|---|
| F2 | intern.cheng+parser.cheng 5 热点 | `internPoolIndexPutOwnedCopyHash`（预计算哈希形）+`internPoolIndexProbeFirstEmpty`（一趟探测判 hit/记插入槽）+`internPoolIndexInsertKnownSlot`（无增长直插，share-take/存储写序与 Put 逐字节同）；`Intern` 首见单哈希融合；新增 `InternOwned`（调用方已持新鲜 owned 拷贝免池内二次 CloneStr，单缓冲入库）；5 热点切换=LexSource+forest append node/token/typeSyntax/region 四循环 | 「Find+Put 并一趟+调用方已 owned 免池内二次 CloneStr（5 热点：LexSource/append 4 循环）」；id 序/槽位/探测序不变论证附函数头注 |
| K5a | parser.cheng ParserValueExprKeywordKind | 40 对字典按首字节 17 组分派，组内长度前置+全串比较（原逐对链最坏 40 次全串比较→至多 1 次）；`ParserValueExprKeywordTableAudit` 40 对正对账+43 近失负对账，fail-closed panic，首词法 span 前执行（每进程必过） | 「关键字表首字分派（40 对字典型审计守卫，曾抓漏 enum/import 两对）」——审计表与分派组 1:1，漏组即首 parse panic |
| K1 | parser.cheng ParserMaxQualifiedCallDepthLines | escapeRun 增量跟踪（pos 前连续 '\' 计数奇偶 ≡ ParserQuoteIsEscaped 反向 rescan）消每引号 O(pos) 反扫；调用括号 fast（stop 处即 '('）/前置关键字拒绝 fast（前非空字符 ∉{n,c,d,r} 必拒，六词末字节全在集内）/点限定 fast（start-1≠'.' 必 0）；慢路径委托原 helper，语义逐项对齐论证附函数头注 | 「转义态增量跟踪消每引号反向 rescan；ident/前置关键字/调用括号 fast 路径内联，慢路径委托原 helper，语义逐项对齐」 |
| K2 | parser.cheng ParserReadNormalizedTypeDeclsLines+新 ParserLineCodeSegmentRange | quote 感知 '#' 截断+四字符 trim 折叠 [segStart,segStop) 边界（与 PathTrim(StripLineComment(x)) 切片逐字节同值），消每行 2 次整行拷贝；仅 type-block 候选行物化 TextSlice | 「quote 感知 '#' 截断+四字符 trim 的 [segStart,segStop) 边界，消每行 2 次整行拷贝，type-block 候选行才物化切片」 |

## 二、免窗 A/B 重放对照表（原账=VERIFY_parseperf_1_2_append §七；重放=交错 3 轮×5 rep min，双二进制同车头同探针）

| 形状 | 原账 K 前→K 后 | 原账 Δ | 重放 pre→post | 重放 Δ | 对账 |
|---|---|---|---|---|---|
| a_fill | 1077→350ms | **−67%** | 558→318ms | **−43%** | 同向同级（<2× 止损线内；pre 已含 F 刀，可削底数更小） |
| f_strings | 935→510ms | **−45%** | 400→189ms | **−53%** | 同级 |
| b_decls | 913→621ms | **−32%** | 520→355ms | **−32%** | **精确一致** |
| t5000 | 1131→873ms | −23% | 720→610ms | −15% | 同级 |
| v10000 | 1921→1716ms | −11% | 1774→1728ms | −3% | 弱于原账（@ 树构建占比在 F 刀基线上更大，稀释 parse 切片）——如实报 |
| e_empty | 6→5ms | 地板 | 5→4ms | 地板 | 同地板 |
| d_comments | 280→370ms | **+32% 未定** | 119→121ms | **+2%** | **机制平结案：原 +32% 系负载漂移（静窗终证）** |
| u_complex | — | — | 422→335ms | −21% | 重放新增形状（type-block+dotted+串+注释混合） |
| u_dense(26tok/行) | — | — | 598→443ms | −26% | 重放新增形状 |

正确性旁证：9 形状 shape_detail（ok/decls/lines/typeDecls/maxDepth）pre/post 逐字节同；u_complex maxDepth=3/typeDecls=1250 证明 K1 深度路径与 K2 候选路径均被计费且输出不变。

## 三、族门门禁表

| 门 | 结果 |
|---|---|
| 配对烤机 ×2（同名 kernel_driver，全冷禁缓存，cheng_cold_v2） | **PASS** sha256=945f833c057c6ff431c3ad23e0cb4b41d652e3a7295c2574eea6b77e83e5c431 ×2（wall 290/255s） |
| 车头树峰 vs 768MiB 锚 | 721.5/722.6MiB=**−6.1%/−5.9%**（无刀基线烤 720.7MiB，配对差 +1MiB 级） |
| 四夹具门（无刀基线，官方 1GiB 帽） | **PASS rc=0** pass=4 known_red=0 stale=0，probe 12/7/0——基线复现认证态 |
| 四夹具门（刀态，官方 1GiB 帽） | v6 compile trip 1,074,970,624B>1,073,741,824B（+1.2MiB/0.11%）rc=3；ordinary/call_fixture/cold_nested PASS——归属见四 |
| 四夹具门（刀态，诊断 cap 1280） | **PASS 4/4**（v6=1,051,920KiB；diag2 静窗 max 树峰 900MiB） |
| 判词对基线 TSV（刀态=post 两诊断门并集） | **零漂移**：12 绿+7 红逐字同无刀基线门（唯一差异=暂存路径 PID 数码与子集 summary 口径）；probe_try `statement_offset=82 statement_offset=61`/probe_for `exprIndex=1 kind=2 line=4 surface=..< rootNode=-1 originNode=-1 role=0`/probe_generic `node=4 op=66 ... surface=identity[int32](42)`/probe_array `primary: managed BodyOp borrow owner BodyOp definition missing` 与 parseperf_3 期 gate_g2.log byte-identical |
| patch 纯度 | **PASS** apply --check 主树 rc=0；刀面=parser.cheng/intern.cheng/probes 测量件三文件 |
| 40 对字典审计 | **PASS** 正对账 40 对全命中+负对账 43 近失形全判 Identifier；fail-closed 于首词法 span 执行——烤机/bench/门所有 parse 均已过审计（失配即 panic，无静默路径） |

## 四、v6 穿帽归属（病态处置账 #1）

| 证据 | 数字 |
|---|---|
| post 官方门 v6 trip | 1,074,970,624B（超帽 1.2MiB） |
| pre（无刀）官方门 v6 | 1,022,512KiB=998.5MiB **PASS**（距帽 26MiB） |
| post 诊断门 v6 | 1,051,920KiB（cap 1280 下 PASS） |
| v6 交错配对采样（同通道 3 对） | post−pre=+6.3/+6.2/+1.4MiB（**刀效应 ≈+5MiB/0.5%**） |
| 同码重跑通道噪声 | cold_nested 918,176↔799,762KiB（±118MiB）、call_fixture 846,112↔807,200KiB（±39MiB）、v6 采样三连 1027→937→838MiB（±190MiB 级） |
| parseperf_3 期同夹具 | 896.4MiB——基座其后增长 ~100MiB+（多线 WIP 合入） |

定谳：官方 1GiB 门在现基线为噪声生死线（基线 v6 距帽 26MiB << 通道噪声 ±100MiB），单轮 trip/pass 由噪声决定；四刀配对效应 +5MiB 级，非回归源。哨兵移交主线程：**基座 v6 编译工作集增长需独立刀线处置（ RSS 帽线或 profiles 相棘轮同族）**，本线不动基座。

## 五、病态处置账（kill→取证→修复→重跑）

| # | 判据 | 现象 | 处置 |
|---|---|---|---|
| 1 | post 官方门 rc=3 rss_limit_exceeded | v6 compile 穿 1GiB 帽 1.2MiB | pre 对照门（rc=0 全绿）+交错配对采样定谳=基线坐线+噪声，刀中性（见四） |
| 2 | 诊断门 1 中断 guard_measurement_unavailable | probe_block 起守卫测量基建 flake（53min 重载窗） | 子集 TSV 诊断门 2 补齐 7 缺行，rc=0 收官 |
| 3 | 判词区不完整 | post 官方门 abort 于 v6（探针区未跑） | 两诊断门并集补全 12 绿+7 红全对账 |

## 六、纪律记录

- bake_win 全程持窗（族门/pre 对照门/两诊断门，幽灵锁协议内置）；测量（bench 矩阵/v6 采样）不持窗，交错配对抵窗漂。
- 单件对锚差值栏：编译臂（车头烤机树峰）721.5/722.6MiB vs 768MiB 锚=−6.1%/−5.9%。
- 测量件重建：src/probes/parseperf_bench.cheng 形状生成版（9 形状内存生成+预热 1+R rep，重建参照 VERIFY_parseperf_bench_append.md §三描述；原件随克隆灭失）；pre/post 二进制同探针同车头，探针差异隔离为零。
- 大对象清理：.w 冷对象缓存（cold_bench_pre/post、run_*/cold_cache）、bench/驱动二进制、采样临时目录任务尾清除；文本台账（log/summary/判词区）保留。
- 主树 apply --check rc=0 已验；主线程终验=合入后自烤冒烟+认证 m-tag 烤机（收割协议），v6 帽线哨兵同步移交。

## 七、主线程合入认证（2026-09-08，PP4-CERT 收割追加）

**结论先行：认证门 rc=0 PASS——四夹具 4/4、探针 12 绿+5 红+2 行 rc 账 STALE（判词逐字同红词，定谳=TSV 期望绑定误差非驱动漂移）；树峰 949.85MiB=768MiB 锚 +23.7%（归因 v6 基座驻留哨兵）；F2/K5a/K2 主树源码落地核查=负，patch 对现主树已不可重放——本轮认证对象为配对烤机工件 da7fb56d，非主树源码态，合入收割需主线程重放 patch 后重烤换名。**

### 门表（驱动 sha256 前缀 da7fb56dc64cabc0=主线程 m52/m53 配对 PASS 同名件；bake_win 持窗 owner=PP4-CERT.34004，窗内零并发编译）

| 门 | 结果 |
|---|---|
| 四夹具收官门（官方 1GiB 帽） | **PASS rc=0** summary: pass=4 known_red=0 stale=0（ordinary 725,856KiB / call_fixture 754,032 / cold_nested 846,096 / v6 972,672KiB=949.9MiB 帽内；本线三轮 v6 读数 946,224/951,408/972,672KiB 稳定带，未复现 KF2 期单轮 +1.2MiB trip） |
| 探针区 | **12 绿**（while/enum/tuple/assert/varinit/mod/objctor/break/continue/when/block/sizeof 全 PASS）+ **5 红**（defer「body ir control flow: defer action bytes invalid」/match/generic/array 判词逐字含 TSV 红词；closure rc=1 判红但判词列空，三轮同象）+ **2 STALE**（probe_for/probe_try：判词逐字同红词「normalized expression parser node missing…surface=..< rootNode=-1 originNode=-1 role=0」/「statement_offset=82 statement_offset=61」，进程退出码实测 2，TSV 13:50 版期望 1） |
| 树峰 vs 768MiB 锚 | **996,016,128B=949.85MiB=锚 +23.7%**（>20% 台账归因：峰=v6 夹具基座驻留，§四哨兵项；四刀配对效应 +5MiB 级非峰源）。主线程独立 m52c 轮（15:15 窗）树峰 972,046,336B=927.05MiB=锚 +20.7% 同象 |
| 分相驻留（编译臂逐相） | 夹具带 709→950MiB（v6 峰）；绿探针带 702→794MiB；红探针编译 20→609MiB（closure/defer ~600MiB，for/try/match/generic 20-34MiB 早退）；运行臂 ~5.3MiB/件 |
| 独立复现定谳 | 主线程 m52c 轮与本线轮两独立窗同行同象（probe_for/probe_try 均 rc=2，其余 17 行全同）；09:55 轮（13:50 TSV 定稿前）同两行亦 rc=2——**2 STALE=TSV rc 期望绑定误差（判词零漂移），非驱动行为漂移、非烤机碰撞**；TSV 两行 rc 期望（1→2）修正移交主线程定夺后重冻结 |

### 病态处置账（认证窗三轮）

| # | 判据 | 现象 | 处置 |
|---|---|---|---|
| 1 | 第 1 轮 13min 外壳帽 kill | 帽值误判：门全程 ~19min 非病理，kill 时 14/23 行正常推进 | 帽放宽 40min 重跑（病理判据改日志停滞>10min 人工盯），非门缺陷 |
| 2 | 第 2 轮 probe_break compile 600s 超时 rc=3 | 无锁 run_m60 烤机撞 parent lease（树峰 751MB 帽内，非内存因） | 等静窗+重跑；干净窗 probe_break ~80s PASS |
| 3 | 重试壳 mkdir -p 锁缺口 | 他人持窗时 mkdir -p 仍成功→owner 覆写闯窗（09:55 污染轮 13 stale 同因） | 本线弃用 gate_retry_v2.sh，改原子 mkdir 抢锁执行器 .rebuild/gate_pp4cert_runner.sh（不闯窗不偷锁，busy 谓词按进程 comm 精判） |

### F2/K5a/K2 主树落地核查（负结果，如实入账）

- src/core/lang/intern.cheng 工作树=HEAD 零差异；InternOwned / internPoolIndexPutOwnedCopyHash / internPoolIndexProbeFirstEmpty / internPoolIndexInsertKnownSlot 全树零命中，`git log -S` 全历史零提交。
- parser.cheng 无 parseperf_4 注识（0 处）、无 InternOwned 切换点；ParserValueExprKeywordTableAudit / ParserLineCodeSegmentRange 零命中（现working树 +63/−1 改动为他线 WIP）。
- parseperf_4.patch 对现主树 `git apply --check` **rc=1**：parser.cheng:10601 上下文漂移 + src/probes/parseperf_bench.cheng 缺位（主树现件为本线重建测量件，untracked）。
- 定谳：主线程「已 apply 进主树」与工作树现状不符（apply 后被复写/回退，或仅 --check 未落地）。m52/m53 配对烤机（07:13，candidate_freshness_root=/Users/lbcheng/cheng-lang）时点树态含刀、工件有效；源码落地态已失。**合入收割剩余步=主线程重放 patch（先过 10601 漂移 rebase）+ 重烤换名认证驱动 + 自烤冒烟**；本线零接触主树源码，仅认证工件与台账。
