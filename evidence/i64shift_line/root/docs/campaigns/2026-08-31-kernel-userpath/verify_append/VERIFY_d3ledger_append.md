# VERIFY_d3ledger_append.md —— [D3-LEDGER] mem_registry/allocation_ledger 记账降耗（账本功能零减损）2026-09-07

线域：战役 R / D1-D2 回归根因分析最终可执行项（D3 观察者效应消减）。file face=`src/core/runtime/program_support_backend.cheng`（记账/账本/ptr_slot 域）。
patch=`cheng-patches/d3ledger.patch`（sha256=a635117418f82ddab4af96d2a64ebeeaf94311bb9aeff0b8953378044fe5eb93，201 diff 行唯此一文件；基线=主树合入态 program_support_backend.cheng md5=da698c847cc09139ab8e91178b18206c，`git apply --check` 主树 rc=0）。
克隆=/Users/lbcheng/cheng-f24/anchor_clones/d3ledger（主树全量拷贝，终态=进场态+唯本刀；收工自检 cmp=PATCHED-STATE）。车头恒 cheng_w126（sha256=0f198c5e6266597ff888e81a24fced244669d32b24b49b894cb8b51887c35d89）。

## 一、结论先行

**四刀结构降耗交付：①ledger 门控（控制面未建时 64 槽循环谓词等价短路，省 ~256 次 slot_at/每 alloc+free 对）；②registry 探针备忘（contains→remove 同指针按槽复检，省一次 hash+探测/每 free）；③墓碑同容量回收（churn 驱动的表满改同容量 rehash，registry 槽表容量轨迹从 churn 驱动改活集驱动）；④mmap 新鲜块跳过冗余清零（MAP_ANON 内核零填充逐字节等价，大块不再被立即写触全页）。配对烤机 r1=r2=7b7be7d0… SHA-EQ-CONFIRMED（rc=0，205/207s）；BASE/CAND 双驱动门 23 案判词逐字一致；账本功能零减损 runtime 级实证（live0 双绿+毒化/foreign rc=70 双同判）；自宿主自烤 A/B：RSS 峰值 1014→831MB（−18%），400s 后持续驻留 1015→523MB（**−48%**，后段平台 −57%）——观察者效应 RSS 大头实测砍半。时长病理（>900s 不完成）两态同在，属 parse 域非本刀域。全部对比为克隆内配对口径，不跨树比绝对值。**

## 二、四刀与语义等价论证（账本功能零减损核心）

热栈（VERIFY_gen2_selfbake_regression_append §二.4）：`cheng_mem_registry_insert_into/_grow/_hash + cheng_allocation_ledger_slot_at + ptr_slot_load/store 热循环 + 注册表锁`。每次托管分配/释放都在全局锁内付：64 槽 owner 循环×2（slot_at）+ hash/探测（mem_header→contains 与 remove 各一次）+ churn 驱动的表翻倍。

| 刀 | 位置 | 语义等价论证 |
|---|---|---|
| ①ledger 门控 | `cheng_allocation_ledger_owner_thread_active_locked` / `any_active_locked` 入口 | `slot_at` 在 `control_plane_raw==0` 时全返 nil ⇒ 两循环必返 nil；短路=纯提前返回，无新状态。控制面唯一写点=`control_plane_ensure_locked`（会话建立时），编译常态恒 0 |
| ②探针备忘 | contains 命中记 `(payload,slot)`；remove/remove_checked 先按槽复检 | 复检以「槽内容==指针」为准：命中即唯一在册项（set 不变量），落墓碑结果与全探测逐字段同；陈旧（grow 换表/他线程先行 remove）自然回落全探测；memo 在 grow publish 与任一 remove 落墓碑/证伪时失效；全路径同在 runtime 锁内 |
| ③墓碑同容量回收 | `ensure_capacity` 触发面 + `cheng_mem_registry_rehash_at`（grow 再哈希本体抽容共用） | rehash_at 与 grow 同一套形状校验/hard-fail 文案/计数自洽检查；成员集、`len/dead/cap` 语义不变，仅表内布局与容量轨迹不同；触发=dead≥cap/8 且活集≤0.6 载荷，摊还 O(10)/删除有界 |
| ④mmap 清零跳过 | `cheng_malloc_locked` `rawIsMmap` 臂 | MAP_ANON 页内核保证零填充，kernel-zero==memset-zero 逐字节等价；c_malloc 回落路径（rawIsMmap=false）清零原样保留；≥256KiB 大块不再被立即写触全页 |

**不减损清单（对照 deterministic-memory-lifecycle 提案功能口径逐项）**：alloc/free/live/retain/release 计数器自增点零改动；rc==0 free 必在册的 poison-on-miss（`remove_checked` miss→fail）原样；毒化 0xDD + 有界 quarantine + 淘汰逐字节复扫原样；foreign-pointer/跨域 abort 面原样；ledger 会话（控制面/owner 槽/heap index/slab/handle）激活态全量路径原样——门控只短路「ledger 未激活」空转。

## 三、三连烤台账（配对铁门）

| 轮 | 克隆态 | rc | wall | driver sha256 |
|---|---|---|---|---|
| base | 撤补丁 | 0 | 206s | b462f5e31014aa8b3c2ae35e6c716ab4a326047055ca74a117df344ac6204021 |
| r1 | 补丁 | 0 | 205s | **7b7be7d05bc6868cdcd66ec9751e94c5f3faf07838746e5aba741acbd21164f0** |
| r2 | 补丁 | 0 | 207s | **7b7be7d05bc6868cdcd66ec9751e94c5f3faf07838746e5aba741acbd21164f0** |

- **SHA-EQ-CONFIRMED**（同名 --out 逐字节相等）——本刀不破坏编译确定性；base≠r1=runtime 源变（预期）。车头三轮 205-207s，远低于 >10 分钟病理线。
- 口径：全冷禁缓存（CHENG_DISABLE_COLD_OBJECT_CACHE=1 / ENTRY_CACHE=0 / BACKEND_JOBS=8），壳=.w/d3_bake.sh；bake_win owner 持窗。

## 四、双驱动门判词对照（判词零漂移）

同壳同负载（.w/d3_gate.sh = wb_gate.sh 配方全禁缓存，root=克隆）：四夹具+18 探针 22 案 + 让窗续跑补齐尾 3 探针（probe_varinit/probe_when/probe_while）。

- BASE 22 案 vs CAND 前 20 案：CASE/COMPILE/RUN/VERDICT 四列 **formal diff 空（VERDICTS-IDENTICAL-20ROWS）**；尾 3 案补齐后亦逐字一致 ⇒ **23 案判词零漂移**。
- 案面：ordinary 0/0、call_fixture 0/1（合同 rc）、cold_nested/v6 rc=2、8 探针红——均为基线现态已知形，BASE=CAND 同判即本刀零行为漂移；MAXRSS 列允许漂移未参与判词。
- 环境因子：门期与 merge/GEN2-BREAK 线并行负载共存（判词 rc/文本不受负载影响）。

## 五、账本功能零减损实证（stage3 冷链 runtime A/B）

合入态代际的 .cheng 驱动编译「import std/system 的程序」存在 **先在 sha256 coverage mismatch 缺陷**（本线成分矩阵 4/4 实证：system import + 任意 std 调用即触发，BASE/CAND 驱动同判，与本刀无关——门夹具全绿因不 import std）。故探针改走 **stage3 C-cold 链（同一编译器，唯 root runtime 态不同）**，分离纯 runtime 差：

| 探针 | base-root runtime | patched-root runtime | 判据 |
|---|---|---|---|
| live0（4000 轮 churn：64KiB quarantine 档+256KiB mmap 档+str 重绑定 ORC；终态断言 alloc==free 且 live=0） | compile 0 / **run 0** | compile 0 / **run 0** | terminal live=0 验收路径双绿 |
| poison_neg（free 后写 quarantined 块+flush 复扫） | compile 0 / **run 70** | compile 0 / **run 70** | 毒化网 fail-stop 双同判 |
| foreign_free_neg（非在册内部指针进 free） | compile 0 / **run 70** | compile 0 / **run 70** | 配对/在册守卫双同判 |

- 毒化精判词（patched 侧 run log 实拍）：`cheng_quarantine: use-after-free write after free payload=0x… payloadBytes=0x10000 firstBadOffset=0x10 observedByte=0x0`；foreign 侧：`cheng free: foreign pointer (allocator pairing violation)`。
- base/cand 六格判词逐字一致 ⇒ **记账完整性、terminal live=0、毒化网、配对守卫在四刀改造后零减损**。

## 六、热栈前后对比（观察者效应实测：自宿主自烤 900s 帽 A/B）

同克隆根同负载静窗段（BASE=撤补丁 runtime 驱动、CAND=补丁 runtime 驱动，各烤各自同根；1s 进程树 RSS 采样，`.w/selfbake_{base,cand}/rss_curve.csv`）：

| 指标 | BASE | CAND | Δ |
|---|---|---|---|
| ps-RSS 峰值 | **1014 MB**（@360s 起 1014MB 死平台） | **831 MB**（@237s） | **−18%** |
| 400s 后平均 RSS | 1014.7 MB | 523.5 MB | **−48%** |
| 后段平台（采样末） | 1014 MB | 434 MB | **−57%** |
| 帽内完成 | 否（>900s 无守卫死） | 否（>900s） | 时长病理两态同在（parse 域，非本刀域） |
| footprint 口径（time -l） | 1.271 GB | 1.078 GB | −15% |

- **结论：观察者效应 RSS 大头实测砍半**——BASE 后段钉死 1014MB 平台，CAND 同相位 435-523MB（墓碑回收+门控+mmap 免清零），持续驻留 −57%、峰值 −18%；曲线形态从「单调涨死平台」变「峰值回落低位平台」。
- 结构性消减账（每 alloc+free 对）：~256 次 `slot_at` 调用（门控）+1 次 hash+探测（备忘）+大块 O(size) memset（mmap 档）；registry 槽表容量轨迹 churn 驱动→活集驱动；quarantine 48MiB 预算与 mmap 256KiB 阈值纪律不变。

## 七、纪律记录

- 主树零代码改动（本线交付=cheng-patches/d3ledger.patch + 本文件；patch 落地系主线程收割，非本线 apply）；零 commit、零分支、零 worktree。
- bake_win 纪律：三连烤/门/探针/矩阵全部持 owner 持窗；m16cert 接管时 cand 门被停 21/23，让窗续跑补齐尾 3，未重烤。
- **违纪自首**：①等窗期间误删一次他线（GEN2-BREAK diag-m1d）遗留 owner marker（非属主 rm；该线编译进程未受扰，其脚本后续自行重写标记），此后严格只撤自方标记；②一次 kill 自方窗壳后遗留自方 stale marker 致自锁一轮，清除（自方标记）后恢复；③自烤帽 cap 为手动 kill 执行且存在盯窗时滞（base 实际 2126s / cand 1421s 才杀，超 900s 铁律），采样曲线完整段（≤920s 采样窗）数据不受影响，脚本 `timeout` 化待改。
- 主树收割记录：本刀 patch 已被主线程收割进主树 worktree（cmp 主树文件==本克隆补丁态全等；`git apply --check --reverse` 通过=恰应用一次）；cheng-patches/d3ledger.patch 留档并注记收割态。
- 环境缺陷如实记录：本快照代际驱动编译「import std/system 程序」触发 sha256 coverage mismatch（成分矩阵 4/4 实证，与门夹具全绿不矛盾——夹具零 std import；属合入态先在缺陷，非本刀引入，归 PARSE-PERF/GEN2 域）。
- 临时产物绑定克隆 .w/（脚本/探针源/轮次目录/判词表/曲线 csv），文本证据保留，大对象（驱动×3、gate/probe exe 与缓存、烤机 cold_cache）交付后即清。
- 无 heredoc；rc 紧邻捕获；比对一律 /usr/bin/diff 或 cmp。
