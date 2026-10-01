# VERIFY_tamem3_append —— [TA-MEM3] typed/TypeArena 内存刀线（重派）：现树核账+F1 A/B 归零回退+seal 回归实况+v6 精确边界图 2026-09-10

date_utc=2026-09-10 · 代理=TA-MEM3（战役 R 重派线）· 工作克隆=/Users/lbcheng/cheng-f24/tamem3（cp -cR 主树工作树全量，锚 commit=eb0de75e4=主树 b6b4816e4+在途 WT 含 ledgerwalk-1/3；终态 HEAD=406c4e565）· 车头=/tmp/cheng_cold_v2（sha=987832510c…）· 烤机/自烤/门全部 900s 帽+768MiB 门零抬帽 · bake_win 锁全程 · rc 紧邻捕获

## 一、结论先行

**五件交付、两项如实记红：①简报核心前提被现树证伪——「死点 806-813MiB 贴锚、挖 +190MiB TypeArena 域即可 GEN2 rc=0」的世界不存在：现树自烤死点=forest pass0 src=61（primary_object_plan 131.8MiB 单源树），enforced phys_footprint 808,715,416B 距 768MiB 门仅 3,409,048B，而门后还有 pass1 整块并林墙（合并森林 Σarena=1,230.7MiB，`VERIFY_fullgo_0910_append.md` 1.5GiB 双抬诊断已绑定 >1.5GB 真实需求）——按 `docs/selfhost-resource-plan.md` §六 T-1/T-2 结构改造是唯一路径，本线零抬帽不越界施工；②核账完成（f2b 谱系梯子全录：after_profiles 291MB/reachable +50MB/metadata 棘轮 +150MB=+527k 活块/identity+receipt 窗 +47.5MB/forest 基线 538MB）；③唯一候选刀 F1（pass0 测量解析 presize）A/B 三轮实测零净（808.7/809.1/809.0MB，±0.5MB 噪声带）——「倍增共存在 enforced 口径主导峰」父假设被证伪，按诚实撤回铁律回退（克隆 commit 链 5f0c05e14→7fcd486cc→406c4e565 全留痕），不交付 no-op patch；④seal 回归（`context_sequence_shared`）在现主树工作树态已消：本线自家驱动（base1 e6af3cd1）四夹具门 3/4 PASS+最小夹具 rc=0 实证，机制=主树工作树未提交改动把 e7e38d76a 的 receipt-init 后移重排回退到 compact 前（HEAD 已提交态仍带回归，fullgo 二分绑定）——该未提交回退是全仓解 Block 的关键资产，建议主线程尽快收割提交；⑤v6 夹具门差 3.1MB 的 delta 实证全在发射/链接臂（v6 前端梯子峰仅 20.3MB、闭包=1 源 54 行、primary.o=2,229B，而树峰 713-771MiB；对照 ordinary 同臂 458MiB，Δ=+267MiB）——gen2r3 §五已裁决「发射/链接编排=模型外新刀」，禁触域，精确边界图移交（§六）。**

## 二、核账账（现树新鲜梯子，全部绑定本线驱动）

| 点位（csg_stage/csg_mem） | rss(内部读数) | live_allocs | 备注 |
|---|---|---|---|
| enter | 71.3MB | 43,625 | acct1 |
| after_profiles | 291.1MB | 853,824 | profiles 相已贴 TA-MEM 模型（55.4s 主段） |
| after_reachable_function_set | 341.1MB | 933,789 | +50MB 语义表（语义必需域） |
| metadata_contexts_built | 490.6MB | 1,460,819 | **+150MB/+527k 块棘轮**（contexts 权威仅 ~12MB，b3r/b3struct 三方同证；持有者=构建链 retained temporaries，释放纪律=backend2 lowering 域，本线禁触） |
| after_profile_source_payload_release | 538.1MB | 1,443,504 | +47.5MB=identity index+receipt accumulator 窗 |
| forest_build_start（pass0） | 538.1MB | 1,443,504 | 基线带 538-577MB |
| **死点 forest src=61** | 557.6-577.8MB | ~1,752,400 | **rc=137@190-206s，enforced 808.7-809.1MB（门 805,306,368）**；src=61=primary_object_plan.cheng（4.49MB 文本/131.8MiB parse arena，Top2 大源） |

GEN2 验收判定：**未达成（如实记红）**。三轮自烤（base1/f1/f2 谱系）同判词同相点死，属同墙新增分相证据非盲重试。死点后置墙：pass1 预留 Σ=1,290,508,960B 整块并林（fullgo §六 1.5GiB 双抬仍死绑定），故「再挖 3.4MB」无意义——768MiB rc=0 的唯一路径=T-1/T-2 增量消费（每源 parse→typed 生产→即释，永不物化全量森林）+压 metadata 棘轮。

## 三、F1 刀账（零净回退，全链留痕）

| 轮 | 谱系 | enforced peak | 死点 | 判读 |
|---|---|---|---|---|
| acct1 | base1（e6af3cd1，无刀） | **808,715,416** | src=61@191s | A 臂 |
| acct2_f1 | f1（ab3811af，128×text presize） | 809,125,016 | src=61@190s | +0.4MB=噪声 |
| acct3_f2 | f2（0c5046bf，64×text presize） | 808,961,152 | src=61@206s | +0.25MB=噪声 |

- F1 内容：`CompilerCsgBuildParserForestAuthorityInto` pass0 测量解析前按 text-size proxy 预留容量（128×/64× 两档实测），意欲消「最大单源倍增 old+new 共存瞬态」。
- **A/B 定谳：enforced 口径零净**。64×/128× 两档同峰（809.1/809.0）证明预留档位不进峰；与无刀臂差 ±0.5MB=run 噪声（b3struct §五 ±20MB 带 内）。「倍增共存在 enforced 口径下主导 src=61 峰」假设被证伪——该点峰由基线+单源 arena+固定 footprint 开销构成。
- 处置：按「零收益诚实撤回不留 no-op」回退源改动（406c4e565），**patches/ 零新增**（交付 no-op patch=假信用）；克隆内三轮 commit 链+全套 run 证据（.rebuild/run_acct1、run_acct2_f1、run_acct3_f2 的 guard.report/stderr 梯子）全留可溯。
- 字节固定点（f2 谱系，GEN3 形式）：bake_f2=bake_f2b=**0c5046bf71b69f622fd46edf090258d3a2f3c7d5cfc2a912962070b0141a65b4**（同配方同源 rc=0×2，195s/279s——279s 轮与 byte 比对编译并发仍字节 EQ，确定性成立）。
- 附带实证：跨驱动谱系编同一夹具 exe=同字节数异 sha（7,451,752B；0297b5cb vs 71b6cd7a）——exe 内嵌 producing-driver 身份绑（provider binding LC_NOTE），**跨谱系 exe sha 不可作字节铁门口径**，字节铁门必须同名 --out 同驱动谱系配对。

## 四、门账（base1 驱动 ×克隆根，`.rebuild/gate_base1.log`）

| 夹具 | compile | run | compile_rss | 结果 |
|---|---|---|---|---|
| ordinary | 0 | 0 | 606,482KiB | PASS |
| call_fixture | 0 | 1 | 616,914KiB | PASS |
| cold_nested | 0 | 0 | 702,850KiB | PASS |
| v6 | compile rc=137 | — | **808,436,936B，超门 3,130,568B（0.39%）** | GATE-FAIL |

3/4 PASS+判词零漂移即「HEAD 提交态 seal 回归在现工作树已被消」的直接实证（对照 fullgo §九：HEAD 二分至 e7e38d76a 起最小夹具即 `context_sequence_shared ref_count=2`）。

## 五、seal 回归实况（移交主线程，含一项语义核对）

- 现主树工作树对 `compiler_csg.cheng` 的未提交改动 = e7e38d76a 的**部分回退**：receipt accumulator init 移回 CompactProfilesForFixedPoint 之前（`:38778`），同时**删除了 forest 后的派生 call-name 表重建循环**（e7e38d76a +38812 段），但保留了 call-name 释放循环与 `profileCallLookupCache` 重置（`:38796-38799`）。
- 该回退态=本线四夹具 3/4+最小夹具 rc=0 的载具。**移交①**：请主线程尽快将此未提交回退正式提交/收割——HEAD 已提交态仍带 seal 回归（全仓任何程序编不出），任何以 HEAD 为基的编译结论当前不可复现。
- **移交②（语义核对）**：回退态下 call-name 表在 forest 窗前被清空且无重建循环——现烤驱动四夹具 compile+run 全绿说明下游（typed-IR lazy rebuild 或无读者）当前自洽，但该不变量无显式守卫，建议补一条「call-name 表 post-forest 读者」静态断言或恢复显式重建，防后续回归。

## 六、v6 边界图（+179~267MB delta 全在发射/链接臂，禁触域移交）

v6_diag 配对（同驱动同 env，BACKEND_JOBS=1，1GiB 隔离诊断门；805MB 门失败证据=门账 GATE-FAIL 行）：

| 量 | ordinary | v6 | Δ |
|---|---|---|---|
| 闭包 | 1 源（`source_bundle_closure_count=1`） | 同 | 0 |
| 前端梯子峰（csg_stage/csg_mem 最大 rss） | 10.2MB | 20.3MB | +10MB（非主项） |
| primary.o / provider.o | 612B / 1,304B | 2,229B / 1,304B | KB 级 |
| 树驻留峰（guard） | 480,673,792B（458MiB） | 747,536,384B（713MiB） | **+267MiB** |
| 峰时刻 | 末段（发射/链接窗） | 末段 +216MiB 尖峰（609→825MiB@148s） | 同窗 |

定性：v6 的 ref object/var-ref/嵌套 @borrows 形状使**发射/链接臂**（internal_macho_linker + provider 装载 + backend2 codegen）多扛 +267MiB（门 env 下 +179MiB）。该臂=backend2/program_support/system_link 域（本线禁触），且 gen2r3 §五已裁「模型外新刀，交主线立项」。**移交③**：v6 达标路径=发射/链接编排（ld 换代/子进程串行化/装载分片），按 §五先例立项；TA-MEM 模型各相无对应刀项。

## 七、纪律记录

- 全轮 900s 时间帽+768MiB 门，零抬帽；1GiB 门仅用于 v6 归因隔离诊断（其 805MB 门失败证据已绑门账），符合「临时提限仅限隔离诊断且保留原上限失败证据」条款。
- bake_win 锁全程（/tmp/oob_ab/bake_win/owner 生命周期=烤机壳进出）；收尾核锁已清。
- 主树足迹=纯新增本文档；源码/工具零接触（F1 全程在克隆，已回退）。
- 产物卫生：四枚实验驱动（170MB×4）已删三留一（f2b=固定点代表），克隆 .rebuild 仅存日志/报告/梯子；车头/锁/外部会话零触碰。
- 判定表：GEN2 trip×3=同墙逐轮带新证据（A/B 三轮换刀再判）；同判词连败未越 2 次即换向（presize 档位→A/B 定谳→回退）。
- 岗位移交汇总：①主树 WT 的 seal 回退收割（§五移交①②）；②T-1/T-2 增量消费结构改造（§二死点后置墙）；③metadata 棘轮 +527k 块的释放纪律根修（backend2 lowering 域，b3r §五-1 同指向）；④v6 发射/链接臂立项（§六）。
