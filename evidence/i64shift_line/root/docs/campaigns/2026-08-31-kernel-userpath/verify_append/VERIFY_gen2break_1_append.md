# VERIFY_gen2break_1_append —— [GEN2-BREAK] 起点账+A1 栈形 bug 定谳与克隆内修复：自烤 rc=2 invalid @importc 墙已穿，现墙=metadata/forest 相 RSS 破门

date_utc=2026-09-06T21:05Z · 代理=GEN2-BREAK · 克隆=/Users/lbcheng/cheng-f24/anchor_clones/gen2break（cp -cR 主树工作树全量，src/bootstrap/tools 三面 /usr/bin/diff -rq 全等）· 脚本壳=克隆 .w/g2b_{head_bake,selfbake,diag}.sh（bake_win 锁内，900s 帽，双口径采样）· 交付件=patches/parseperf_a1_stackfix.patch + fixtures/g2b_probe_{stacked,plain}_importc.cheng

## 一、结论先行

**parseperf_2 A1 刀（ParserNormalizedImportcTargetColumnsInto token-only 走查）的注解组语义缺陷定谳并克隆内修复：@importc(...) 后栈另一条注解时（entry backend_driver_dispatch_min.cheng:244-247 的 @borrows/@importc/@ffi_handle 三连），token-only 走查把「下一 token」当声明目标，错记到下一注解的 @ 行列，fn 行 structuralImportc=false → `parser annotation: invalid @importc` 硬拒。修复=importc 分支显式跳过同组后续注解（@ name [args]）找真声明目标 token，重建旧全树走查 annotationTargetTokenIndexes 的组绑定语义；非栈形输入列值逐字节不变（同一 token 坐标，构造性恒等）。修复后自烤 m0 判词消失（m1/m1d 证实），当前墙推进为 metadata/forest 相 RSS 破门（rc=125@497-499s，guard 1.080GiB）。**

## 二、起点账（三方哈希，.w/three_way_hash.txt）

| 项 | 值 |
|---|---|
| 源聚哈希（src+bootstrap 排序逐文件聚合） | 16fb209361c02c6ccb20d4c52ca67080b84f608d7867c2051fe39f2503b25137 |
| git 态 | HEAD=759062096 + 181 脏文件工作树（历史构建口径：工作树非 archive） |
| seed 驱动 cheng_w126 | 0f198c5e6266597ff888e81a24fced244669d32b24b49b894cb8b51887c35d89 |
| head（修前，w126×克隆） | 8907cfa3ac3554eba00500c1beaece468a498435a295dcce3fc871af535f90d6（rc=0@210s） |
| head（修后，w126×修复克隆） | 2beb6cd639a2e3a17fe1ab4ea353c50d933a14bd2cf22de4868b9cfc82bbbcc8（rc=0@231s） |
| darwin ld | 765e5fa4e30980ddf2803c8a973b20fcc63e403098d2dd9b6cefa38e0cde3c2e |

## 三、实测链

| 轮 | 驱动 | rc | wall | 死点 |
|---|---|---|---|---|
| head bake（修前） | cheng_w126 种子 | 0 | 210s | —（head=8907cfa3） |
| m0 自烤 | 8907cfa3 | 2 | 230s | `compiler csg: normalized decl read failed: …backend_driver_dispatch_min.cheng: parser annotation: invalid @importc`（RSS 峰 919.8MB 未穿帽） |
| 探针 A/B | 8907cfa3 | 2/2 | <5s | 栈式探针=同判词逐字命中；平式探针=过 importc 读（死于探针过简的无关墙） |
| head bake（修后） | cheng_w126 种子 | 0 | 231s | —（head=2beb6cd6） |
| 探针（修后） | 2beb6cd6 | 2 | <5s | invalid @importc 消失，死点后移（ffi handle owner——探针过简固有，非 importc） |
| m1 自烤 | 2beb6cd6 | 125 | 497s | `compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=1205224840 limit_bytes=1073741824` |
| m1d 诊断自烤 | 2beb6cd6 | 125 | 499s | 同上（rss_bytes=1158759792）；**分相账见 §四** |

m1d 双口径：ps-rss 15s 采样峰 914,416KB（893.0MiB，平台后撞守卫回落）；/usr/bin/time maxrss=1,161,592,832B（1.082GiB）；guard 内账 1,158,759,792B（1.080GiB）。ps-rss 与 guard 差 ~185MB=macOS 记账口径差（compressed/footprint 面），与 gen2wave2 knife2 背离形态一致。

## 四、分相账（m1d，CHENG_COMPILER_CSG_STDERR=1 带内 csg_stage）

```
after_binding_import_rebuild  since_ms=5329   rss=256,377,576  live_allocs=131,829
after_sort_sources(合计~9s)                  rss=270,779,136  live_allocs=182,111
after_profiles                since_ms=169342 rss=507,200,472  live_allocs=2,520,481
（此后无新 stage marker → 死于 profiles 之后的 metadata/forest 段）
```

- **profiles（parse）相完成**：169.3s，507MB，2.52M 活分配。对照 GEN2-P1 修前世界 249.4s——parseperf 刀实收 ~80s（-32%）。
- **死相=metadata/forest 段**：profiles 后 321s 无 stage 完成，RSS 507MB→1.080GiB 撞守卫。该段即 GEN2-P1 定名的「metadata+forest（含 forest append re-intern 串行命门）」与 pb_parser vmmap 证据的 mem_registry 记账热点（program_support_backend.cheng:1427-1597）叠加区——D3-LEDGER 与 GEN2-P1 新 T1 的靶区。
- 34s import-edge 判词（plan 装配）在本世界未再现：m0/m1/m1d 均穿 plan 装配关（after_sort_sources 前 ~9s 达成），PHASEB-PARSER 静态对账「当前态两侧匹配」获实测背书。

## 五、为何四道门没抓住（协议缺口记录，自烤冒烟入收割协议实证一号）

1. 配对烤机（cut_a2/cut_b2）用 cheng_w126 车头=旧 C parser，刀代码被编译进产物但**从未被烤机自身执行**；
2. 四夹具门与 m14/m16 认证驱动确实执行了刀代码，但夹具均为小文件、**无 @importc 后栈注解形**；
3. 唯一覆盖栈形 @importc 的源=驱动闭包自身（entry+其 import 面）——只有自烤（现树驱动×现树）才首次执行到。结论：**parseperf 类 parser 刀的验收必须含一轮自烤冒烟**（rc 或判词级即可，无需跑穿），否则「编译过+夹具绿」不证明刀在真闭包上语义不变。

## 六、修复论证（patches/parseperf_a1_stackfix.patch，49 行）

- 刀面=parser.cheng 单点：importc 分支从「groupLimit 即目标」改为「groupLimit 起跳过连续注解组（@ name [args]，复用既有 name-missing/close-mismatch 判词）后取真目标 token」。
- 非栈形恒等：非栈形时循环体零次执行，targetToken≡groupLimit，坐标逐字节同旧值（构造性）；栈形从硬错（fail-closed）变正确绑定，无放行面新增。
- 语义权威=HEAD 版全树走查 annotationTargetTokenIndexes（注解组→声明关键字绑定），token-only 版显式重建同语义。

## 七、纪律记录

- 主树零源码改动（patch+fixtures+本卷为唯一落点；合入由主线程执行）。
- 自首×1：bake_win 一次误抢（owner 行 "main-thread m16cert 94050" 的 m16cert 词内数字 16 被当 pid）。修复=取首个纯数字字段。影响=与 m16cert 并发窗内四夹具仍全 PASS（certify2 日志），无污染证据；已通报主线程。
- 采样器自修×2：初版采到 timeout 包装进程（非编译器本体）→改子树 max-rss 走查；走查 tr 尾空格产空行致 ps 拒列→sed 滤空行。m1 曲线缺失（以 time maxrss+guard+手动三点补），m1d 起双口径完整。
- 长烤纪律遵守：全部轮次 900s 帽（GEN2/GEN3 收割轮的 3600s 例外未启用）；每轮锁内 acquire/release（m1d 释放时检测 owner 变更正确跳过）。
- 无 heredoc；比对一律 /usr/bin/diff 或 cmp；探针/轮次目录在克隆 .w/ 与 src/probes/，主树无临时产物。

## 八、下一步（GEN2-BREAK 续链）

1. 等 D3-LEDGER（mem_registry 记账降耗）与 GEN2-P1 新 T1（typed_expr/csg per-entry）合入主树后，主线程通知→克隆刷新→复测增量（判据：metadata/forest 段 RSS 峰值与 497s 死点位移）。
2. RSS 穿帽后即入 GEN2 rc=0 收割（3600s 帽长烤轮，起跑前广播）→GEN3 固定点→下游三项串联。

## 九、vmmap 死相段构成拆分（2026-09-07 授权诊断轮，.w/vmmap_diag/）

复现轮 rc=125@499s（guard 1.126GiB，profiles 168.2s@571MB，与 m1d 一致）；400s 处采 vmmap 全量（pid 41377，ps-rss 837MB）。**dirty+swapped 口径（=guard footprint 同族）构成**：

| 成分 | 量 | 证据 |
|---|---|---|
| MALLOC 区合计 | **518MB** | DefaultMallocZone 407.3MB dirty+110.4MB swapped；分配计数 3,884,868；**碎片 25%=127.4MB**；另 MALLOC_LARGE freed-but-dirty 尸体 96MB（16+16+32+32）+活块 64MB |
| VM_ALLOCATE 合计 | **428MB / 231 段** | 含 **registry 表 64MB（2^23 槽×8B，单一 pow2 区域全 dirty 全满）** + arena 段（~4.4MB×多+12/24MB 段）≈364MB |
| 固定面（libs text/data、栈、页表） | ~180MB | __LINKEDIT 574M virtual/223.7M resident 等 |

**裁决：registry 表不是主质量**（已 64MB 全满，live 2.52M 只需 33.5MB 封顶）。D3 刀 3 收益上限重构=表封顶 −30MB + 免 grow 尸体（96MB freed-dirty LARGE 中旧表嫌疑大）≈ **−126MB 量级；单独不足穿墙**（守卫触发点距 1GiB 至少 −185MB，且进程未封顶继续涨）。**主质量=MALLOC 区（碎片+尸体+SMALL 110MB swapped）+arena 语义活集 364MB**——后者正是 T1 波次释放/F1 族靶区。合入序维持 D3 先（确定性收益+CPU），但 GEN2 rc=0 需 D3+T1 叠加，主线程排期勿按「D3 单独穿墙」预期。

诊断纪律：授权窗内单轮单快照；锁排队自动接（D3 resume 释放后）；采样器双口径全程；无源码改动。

## 十、m2 增量账（D3 合入后，2026-09-07）

克隆原地刷新（.w 证据/脚本保全；src/bootstrap 与主树全等，闭包面 src/core 自 m18 认证时刻 05:23 零漂移——05:23 后改动全在 rsi/game 非闭包域）。m2 world：源聚哈希 d5ce3f5e14c10db4422c314a2b6476a8b6209ede8575a8581b8f07ae95c5492a；head=7138d45a0808548f9dbc919d4a25be3cb40defd0da25a650090c8b19ac9b2e20（w126×克隆 rc=0@249s；首次烤制 rc=2 codegen worker 瞬态崩，同环境重试即过，判非确定性问题）。

| 轮 | rc | wall | 死点 | RSS 账 |
|---|---|---|---|---|
| m1（D3 前） | 125 | 497s | guard 1.122GiB@497s | 单调涨；time maxrss 1.162GiB |
| m1d（D3 前，分相） | 125 | 499s | guard 1.080GiB | profiles 169.3s@507MB；metadata/forest +330s 撞墙 |
| **m2（D3 后）** | 124 | 900s | **超时，无守卫触发** | ps-rss 峰 882.5MiB；time maxrss 957MiB；曲线多相震荡（903→471→751→607→269→408MB）=波次释放生效 |
| **m2d（D3 后，分相）** | 125 | 868s | guard 1.128GiB@868s（trip rss_bytes 1.211GiB） | ps-rss 峰 1066.6MiB；time maxrss 1.095GiB；profiles 140.4s@586MB（-29s vs m1d） |

**D3 实收定谳**：①死点 499s→868-900s+（+370~400s）；②profiles 相 169→140s（刀 1/2 记账 CPU）；③RSS 形态从单调涨死变为大幅震荡+漂移向上（同容 rehash 免尸体+波次释放可见）；④**单独不够**：metadata/forest 相在 m2d 868s 时仍未走完（16 个 csg_stage 标记停在 after_profiles 与 m1d 同位），两轮互证——m2 900s 超时未穿帽 / m2d 868s 穿帽=震荡峰值随进度上漂，编译总时长 >900s 时最终仍触 1GiB。**与 §九 vmmap 预判一致：GEN2 rc=0 需要 forest 弹（PARSE-PERF 新墙账/GEN2-P1 T1 波次化）合入后合击**；按主线程裁定，本轮不进 3600s 长烤。
