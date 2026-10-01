# Phase C（内存架构推进）预研盘点报告

日期 2026-09-04。纯只读盘点：零树编辑、零烤机、零驱动运行。
依据卷宗：`docs/memory-time-limits-plan.md`（2026-09-03 权威更正版）、`docs/pure-cheng-kernel-closure-plan.md`（Phase A-F 总图）、`openspec/proposals/deterministic-memory-lifecycle.md`（apply authority）、`docs/campaigns/2026-08-31-kernel-userpath/verify_append/*`、`/tmp/oob_ab/borrow_fix.VERIFY.md`（wall70-89 主卷）、`/tmp/oob_ab/memline2b/REPORT.md`、`/tmp/oob_ab/memline2c/RESIDUAL_ROOT_CAUSE.md`、`/tmp/oob_ab/memline3/`（w111c/batch2/w125b）、`task_plan.md` 战役 R、`lessons.md`。

---

## 一、三栏台账

### 1.1 已完成（有实测数字）

| 项 | 交付卷 | 实测数字 | 状态边界 |
|---|---|---|---|
| **L1 毒化/隔离**（wall75，09-01） | borrow_fix.VERIFY.md:4141 | free 填 0xDD + 48MiB FIFO quarantine（淘汰复扫+header 互证，UAF 即证据行+_exit(70)）；`program_support_backend.cheng` +222/−2；四夹具 **0 UAF / 0 exit70**；字节铁门 ON/OFF ordinary sha 相等（7da7e171…）；机制 C 级自证（阳性 70/阴性 0） | 默认开；贴帽夹具用 16MB 预算（v6 rc=125→缩容重测过，未抬帽）；遗留：driver 正常退出路径接 `cheng_quarantine_flush` |
| **L3 批次 1 = W1 快照提交链 digest 修复**（wall88/88r，09-02） | borrow_fix.VERIFY.md:4609 | ordinary RSS **1042MB→723MB（−319MB，−30.6%）**；毒化 ON 683MB；禁缓存 736MB；primary.o 配对 EQ；1GiB 帽内。5 hunk +28/−7（csgc +20/−3、merkle_dag +4/−1、merkle_store_codec 本线 +4/−1） | 挂起：AppendText ~6MB 待语法解；w88 原始 patch/产物已被 /tmp 清理回收，卷宗在 VERIFY |
| **W2 源文本三拷贝 share 化**（wall101，09-02；w111c 09-03 重认证） | verify_append/VERIFY_w111c（/tmp 卷 VERIFY.md:2） | CloneStr/newStringCopy 两分配点消拷贝（预期峰值 −87MB 项）；字节铁门三方全同 GREEN；wall111c 补丁逐字节同哈希=零漂移 | RSS 机制收益因并行满载窗噪声未记信用（静窗中位数复测未做） |
| **W4/W5/W2 批次 2 审计**（wall111c，09-02/03） | /tmp/oob_ab/memline3/VERIFY_w111c_append.md（**未入库仓库**） | W4 ~98MB 估计**不成立**（实测 csg_to_lowering 相 +91.5MB 是整相流量，lowering 三段释放合同完备、receipt 硬门在位）；W5 ~170MB 摊派不成立→真凶重定向 merkle bootstrap；W2 重认证过 | zero-hunk 审计轮；附赠发现：MallocStackLogging 归因跑触发 receipt underflow panic（lowering_plan.cheng:27866，移交） |
| **W5 merkle bootstrap 差分定量 + 3 relief 点**（wall125b，09-03） | verify_append/VERIFY_w125b_append.md | **bootstrap 路径独占 ~449MB/170s**（run1 226.4s/683.5MB vs run2 复用 56.2s/234.3MB）；3 相边界 `ProcessMemoryPressureRelief` +18 行编译门过（A 烤 1081s rc=0） | **配对验收被 ts-csg 管线迁移阻断**（rc=9 0xDD fail-closed，无补丁 B 同病=非本批）；字节铁门/RSS 对比/判词回归顺延；**未 commit** |
| **P1 条目缓存 Phase 1**（wall89，09-02） | borrow_fix.VERIFY.md:4640 | 缓存根任务级化（CHENG_COLD_OBJECT_CACHE_ROOT）+键纯净（schema v4、root-relative、跨 checkout 复用）+CHENG_ENTRY_CACHE 命令面；**零变更命中 6.04s vs 全冷 275.13s（45.5x）**，三方 sha 相等 | **P2（改 1-3 文件部分命中）已裁决取消**：C 链单对象模型无安全路径；秒级迭代收益只能在自宿主 .cheng 管线重建 |
| **C 链 materialize 并行定性**（wall102，09-02） | verify_append/VERIFY_w102_append.md | materialize 占全烤 **34-36%**（76.6-81.9s/225.3s）；并行三墙钉死（row 铸造=parse 序 / 解析器全局非线程安全 / fork COW 不成立）；既有 BACKEND_JOBS=8 仅 −12.3%；late-patch N² 修法被字节铁门否决回滚（−24.8s 弃） | 战略纠偏依据：架构级并行不在 C 链投资（P2 移 .cheng 驱动管线） |
| **残余驻留物理定性**（memline2b/2c，09-03） | /tmp/oob_ab/memline2b/REPORT.md、memline2c/RESIDUAL_ROOT_CAUSE.md | 新基线峰 **902MB**（tree-sampler 进程树口径）/949MB（rusage 含 cc/ld）：__TEXT ~200MB 恒定 + **MALLOC_SMALL dirty ~627MB 唯一动态大头**；账面仅 ~5MB（125 倍记账缺口）；分配器仿真钉死：**churn 不推高 dirty、free/relief 不归还 OS**（SMALL 档 dirty=历史 live 峰水位）；w88 批次1 见效机理=降分配流量即降 live 峰 | live 高（假说 a）/free 滞留（假说 b）判别实验（liveprobe/malloc_history）未抢到窗口，未定谳 |
| **内存测量基建**（memline2b/2c 沉淀） | memline2c 产物清单 | tree_rss.sh 进程树口径、200ms 全程曲线、vmmap MALLOC_SMALL 时序、churn_sim/live_sim 仿真判据、四 env 同禁口径 | /tmp 生命周期，正式化需落 tools/（Phase C 开工项） |

**L2「证明系统完备性（70+ 面）」定位说明**：任务背景所述 L2 清单在在卷文档中未检索到原文（"70+" 无命中）。在卷近似物：wallcensus 全墙普查（17 谓词族 ~8700 发射点、15 节点契约链、C 链 oracle 对拍法）、w111c lifecycle receipt 硬门、wall75 毒化自证、各线三层证据制度（计数器/相位/采样）。**建议编排者补挂 L2 清单原文，避免台账悬空。**

### 1.2 在途

| 项 | 现状 | 卡点 |
|---|---|---|
| 四夹具收官（Phase A，Phase C 先决） | ordinary 0/0 ✅、call 0/1 ✅、cold_nested 0/0 pass ✅（wall140 收官）；v6 推进至 `captured-old release authority mismatch`（wall141，修面=ownership_drop_ir.cheng odir 流格） | 最后一墙；基线 tsv 仍是旧态（cold_nested compile=1 / v6 compile=2），全绿后须更新入库 |
| wall125b 配对补验 | 脚本就绪（pair_verify_w125b.sh，40×45s 租约退避） | 等 ts-csg 管线迁移安装完成；脚本在 /tmp 有生命周期风险 |
| 内存线未 commit hunk | w125b 3 hunk（+18 行）等在主树 | 需随批次正式落卷 |
| **堆腐复发定谳**（memline2b §③） | kernel_driver_w117 SIGSEGV ×2，同签名 `0x8100000000000004`，链=cheng_free←csgJsonParseValue/csgJsonParseString 释放路径，野 header=str 头 data 指针被改脏；嫌疑 W1 memo merkle_store_codec +279 行 diff（now5 无此崩） | 未 A/B 定位、未修；毒化网在位（poison-on-miss 钩子 program_support_backend.cheng:1656 现成） |
| deterministic-memory-lifecycle M1 生产观测 | 提案 2026-09-03 真值更正：**blocked**（dirty 核心与分散 cleanup 未收敛；W1 历史 SIGSEGV 未清不得计完成） | 与 R3 生命周期分片合流 |

### 1.3 未动

| 项 | 依据 |
|---|---|
| W5 merkle bootstrap **主修**（分段释放 + store 对象零拷贝验证；449MB 窗本体） | w111c 移交 + w125b 只落 relief 点 |
| P2 物化并行（.cheng 驱动管线：确定性预铸造/行重映射 + 工作池化） | wall102 移交 1；memory-time-limits-plan P2 |
| P4 mmap 驻留 + import 图按需物化（mapped reader 未成为 snapshot 唯一只读本体） | memory-time-limits-plan P4 + lifecycle 提案 09-03 更正 |
| live/alloc/free 三数打进 report 尾行（共同第一步，一行改动） | memline2c §7 |
| lowering_terminal_release 相 RSS 恒 0（终态释放相不可测） | memline2b §① |
| 兜筐行更名 `allocator_small_tier_dirty` + 主要持有者补账面 | memline2c §0/§5 |
| 假说 a 修法：内核快照/世界装载 arena/mmap tier 化（0-10s +197MB 爆发段） | memline2c §7 |
| 假说 b 修法：SMALL 档自管 mmap 池显式页归还（macOS relief 已证无效）+ 高频 churn 结构 arena 化 | memline2c §3/§7 |
| AppendText ~6MB 语法解 | wall88r 挂起项 |
| P5 验证增量化 + 世代修剪 | memory-time-limits-plan（等证据政策裁决） |
| R3 终值门（cold≤40s / zero≤3s / 1-3 file≤10s / ordinary≤200MiB / cgroup v2 1GiB） | task_plan.md 战役 R、lifecycle 提案 |
| 秒级迭代的自宿主重建（wall89 ENTRY_CACHE_DESIGN 平移 .cheng） | wall89 卷（/tmp 原设计文档已被清理，重建源=wall89 卷 + patches/ 内 cheng_cold.c 条目缓存开关段） |

---

## 二、剩余项分解（files / action / verify / done / 收益 / 风险）

### C-0 测量与账本地基（先行，小时级）

- **files**：`src/core/tooling/system_link_exec_runtime.cheng`（report 尾行）、lowering 相位账（lowering_plan.cheng 计时填充点旁）、report 兜筐行命名处。
- **action**：① `cheng_mm_live_total/alloc_total/free_total` 三数进 report 尾行（memline2c 判别随每次编译自动完成）；② 补 `lowering_terminal_release` RSS 采样；③ 兜筐行更名 + 双值（relief 前/后）。
- **verify**：ordinary 一轮编译 report 含三数且与外部采样对账 ±5%；字节铁门同名配对 EQ（report 文件不进产物字节）。
- **done**：此后每次编译自带 live 三数，假说 a/b 判别无需外部 attach。
- **收益**：不直接降 MB，但决定后续所有修法分叉方向（防 1-2 代理日错投）。
- **风险**：极低。

### C-1 W5 merkle bootstrap 主修【头号收益】

- **files**：`src/core/tooling/compiler_snapshot_lowering_bridge.cheng`、`snapshot_cargo.cheng`、`merkle_store_pipeline.cheng`、`merkle_store_identity.cheng`、`csgc`（w111c/w125b 划定的五文件簇；先落卷 w125b 在树 3 hunk）。
- **action**：① bootstrap 复验分段释放（W1 相边界物理释放模式推广：每 186 对象批/每相边界 ArenaRelease/munmap 真归还）；② store 对象零拷贝验证（mmap/只读映射替代 JSON receipt 解析树全量驻留）；③ FindRequest 全链创世遍历的索引化（1006 代 head 链每读全遍历是 no-weakening 设计，只能加精确 CID 索引不能减验证）。
- **verify**：同名 --out 配对字节铁门 EQ；四夹具判词回归；1GiB 进程树帽；毒化网 0 UAF；bootstrap 冷路径 vs 复用路径差分复测（对标 run1/run2 口径）。
- **done**：ordinary 冷路径 RSS 峰 ≤600MB 量级（bootstrap 窗 ~449MB 中可释放部分收口）；二轮编译维持 56s 量级不回退。
- **收益**：**RSS −300~450MB + 二次编译路径已证 226s→56s**；同时是 memline2c 曲线 10-45s 快爬段（214→405MB）的主解。
- **风险**：FindRequest 逐代重读重哈希是验证强度设计，索引化必须零减弱；mmap 引入新类 UAF（毒化网+quarantine 已就位为缓解）；堆腐嫌疑同在 merkle_store_codec 解析释放路径——**先做 C-3 定谳再动本项**。

### C-2 堆腐定谳（correctness，优先于一切 RSS 项）

- **files**：只读对拍 `merkle_store_codec.cheng`（W1 memo +279 行）、`json_canonical.cheng`、`program_support_backend.cheng`（毒化钩子）。
- **action**：poison-on-miss 断言接 `csgJsonParseValue/csgJsonParseString` 释放路径；A/B 烤 now5 树态 vs 当前树态定位引入补丁。
- **verify**：复现件确定性爆 70 或洗清；`crash_evidence/*.ips` 同签名归档。
- **done**：同签名 SIGSEGV 定谳（引入补丁点名或判误采样）并修复/回滚。
- **收益**：解除 C-1/C-4 在同一文件簇动刀的正确性地雷。
- **风险**：非确定性复现（2 次/日密度），需留毒化网长窗。

### C-3 假说 a/b 分叉修法（等 C-0 判别）

- **假说 a（live 高）files**：内核快照装载（`compiler_snapshot_builder.cheng` 系）、world 装载、CSG 全程中间物 → 迁 arena（≥1MB mmap tier，`ArenaRelease` 真归还语义已存在，src/core/runtime/arena.cheng）。
- **假说 b（live 低）files**：`src/core/runtime/program_support_backend.cheng` 分配器（<1MB 块 backing 换自管 mmap 池 + madvise(MADV_FREE_REUSABLE)）、arena.cheng。
- **action**：a=相位强制重叠窗外的结构进 mmap tier arena；b=阶段边界（primary_release/lowering_terminal_release/报告组装前）显式页归还。
- **verify**：同名配对字节 EQ + 四夹具 + 1GiB 帽 + 全程 RSS 曲线（200ms 采样）回落段可见。
- **done**：ordinary 峰进入 <600MB（a/b 任一落地后量得）；无判词回归。
- **收益**：627MB SMALL dirty 量级收口（上限）；同时服务 R3 ordinary≤200MiB 终值。
- **风险**：b 的自管池是分配器级改动（触所有托管值）；a 触编译器主干文件，须与 Phase B 文件面互斥核查。

### C-4 P2 物化并行（.cheng 驱动管线）【全量时间最大杠杆，必须串行】

- **files**：自宿主驱动 .cheng 管线的物化/快照模块（compiler_snapshot_builder 系）；前置=确定性预铸造或行空间显式重映射层（跨 parser/符号身份层，wall102 移交）。
- **action**：预铸造使 parse 免铸造化（或 row 重映射）→ 物化工作池化 + 符号 row 保 DFS 序 + index-order merge；BACKEND_JOBS 语义扩展到物化相。
- **verify**：BACKEND_JOBS=1/4 同名 --out sha256 EQ（先例 ec4cd0e7 同名门）+ 1GiB 帽（并行 worker 内存记账）+ 四夹具 + 20 次 live=0（lifecycle 提案）。
- **done**：全量自宿主编译时间同比例下降（对标 materialize 34-36% + freeze 28% 压缩空间）；字节固定点不破。
- **收益**：烤机 240s→~130s 目标（C 链 275s 基线按比例）。
- **风险**：**战略约束（用户明确纠正）：架构级投资必须指向 .cheng 驱动管线，C 链仅限桥接级**——wall102 三墙已证 C 链不可行，本项开工前提=Phase B 特征覆盖（while/for 等）让 .cheng 管线能深跑闭包；DOD/确定性红线（并行发射 index-order）。

### C-5 P4 mmap 驻留 + import 图按需物化【战役级，Step 3 前提】

- **files**：cargo store（内容寻址磁盘态已有，583MB/694 目录）、compiler snapshot reader、`atomic_tree_readonly_mapped_region_gate` 先例。
- **action**：mmap 只读映射替代全量内存物化 + import 图驱动闭包子集物化（对标 C 冷链 cap-512 惰性收集）+ 接线后 CID 校验。
- **verify**：损坏 hard-fail；字节铁门（mmap 不改发射输入）；RSS 工作集曲线随 import 子集缩放；四夹具+闭包编译。
- **done**：ordinary RSS 进入 100-200MB 工作集区间方向；Step 3 自举 1GiB 守卫可行性成立。
- **收益**：终值门（200MiB）的唯一路径；条目=缓存粒度+并行单元+驻留路由三合一。
- **风险**：新类 UAF（毒化网在位）；战役级工作量；必须在 C-1 落地后（否则 mmap 的对象仍被 bootstrap 全量驻留覆盖收益）。

### C-6 杂项收口（随批搭车）

- 基线 tsv 全绿更新入库（等 v6 收官，伴 VERIFY）；AppendText ~6MB 语法解；quarantine flush 出口；P5（等证据政策裁决）；wall125b 补验落卷。

---

## 三、Phase C 标准测量协议（开工 checklist）

1. **cwd=仓库根**（W-ORD=进程 cwd 解析 provider 裸名缺陷，README/lessons 在案）。
2. **四 env 同禁**（memline2b §修复3，防共享冷缓存 ±300MiB 摆动）：
   `BACKEND_INCREMENTAL=0 BACKEND_MULTI_MODULE_CACHE=0 CHENG_DISABLE_PRIMARY_OBJECT_CACHE=1 CHENG_DISABLE_COLD_OBJECT_CACHE=1`；
   烤机配方等价面：`CHENG_ENTRY_CACHE=0`（build_kernel_driver.sh:150 翻译为冷缓存总闸，配对轮禁缓存=lessons:752 缓存命中即同哈希假编译）。
3. **任务级缓存根**：`CHENG_COLD_OBJECT_CACHE_ROOT=$CHENG_TASK_TMPDIR/cold_object_cache`（build_kernel_driver.sh:153 已自动；冷对象缓存不跨任务保留，工程规范 8）。
4. **1GiB 进程树帽**：`CHENG_PROCESS_MAX_RSS_BYTES=1073741824`（唯一合法通道，legacy 名硬拒，lessons:186）；守卫在工具自身实现、整棵进程树轮询超限 KILL（lessons:185）；**首次越界值不是自然峰值，禁阈值微调**（lessons:187）；**禁抬帽**（lessons:48，贴帽夹具 quarantine 用 16MB 预算）。
5. **RSS 采样法**：内置 `rss_bytes`=ru_maxrss 生命周期高水位只升不降（lessons:166）——看回落/分段必须外部 200ms 进程树采样（tree_rss.sh 先例）+ report 相位账对账；终态释放相采样缺口修复前（C-0）注明口径。
6. **字节铁门**：必须**同名 --out** 配对（__LINKEDIT 嵌输出 basename，w102 实证差恰 108B=UUID/签名级联）；配对窗口树指纹恒定（w101 反例）；配对轮禁缓存；primary.o 级 EQ 可作 runtime 差异隔离口径。
7. **性能信用**：≥5 轮交替中位数、静窗（并行满载窗数据一律不记信用，lessons:165 + w111c +6.5~266MB 偏移先例）；冷编译/热全量/增量命中分开报告（lessons:163）。
8. **树静默窗口**：诊断采样绑「树静默+同版本驱动独占 store」窗口（混版本驱动并发互造 immutable Cargo HEAD mismatch，memline2c §6）；开跑前用 cheng_tree_quiesce_probe 判定。
9. **毒化网常开**：默认 L1 quarantine 开；贴帽 16MB；MallocStackLogging 类归因工具在高竞争树有崩溃/失真前科（rc=139/rc=1，memline2b/2c/w111c 三卷在案）——用前绑静默窗。
10. **产物纪律**：探针/日志全落任务 scratch（tools/cheng_scratch_scope.sh 生命周期），src/tests 零残留；烤机 stderr 文件落盘（w102 教训：build.log 吞 stderr）。

---

## 四、优先序建议（收益/工作量 + 并行性）

| 序 | 项 | 收益 | 工作量 | 并行性 |
|---|---|---|---|---|
| P0 | C-0 测量账本地基（live 三数+终态相采样+兜筐更名） | 决定性（定分叉） | <1 日 | **立即可做，与一切并行** |
| P1 | C-2 堆腐定谳（merkle_store_codec 嫌疑） | correctness 地雷排除 | ≤1 日定性 | 与 Phase B 并行（只读+烤机窗） |
| P2 | C-1 W5 merkle bootstrap 主修（先落卷 w125b 3 hunk） | **−300~450MB + 二次编译 4x**（头号） | 2-4 代理日 | **可与 Phase B 并行**（snapshot/merkle 簇 vs parser/typed_expr 前端面；若 B2 触 lowering_plan 需文件面互斥协调） |
| P3 | C-3 假说 a/b 修法 | 627MB SMALL dirty 收口 | 各 1-2 日 | 等 C-0 判别出方向；a 与 Phase B 主干文件冲突风险高，倾向串行 |
| P4 | 基线 tsv 更新+杂项收口 | 制度收口 | 小时级 | 等 v6 收官（串行尾巴） |
| P5 | C-4 P2 物化并行（.cheng 管线） | 烤机时间最大杠杆 | 3-5 代理日 | **必须串行**：等 Phase B 特征解锁 .cheng 管线深跑 |
| P6 | C-5 P4 mmap+按需物化 | 100-200MB 终值 + Step 3 前提 | 战役级 | 等 C-1 落地；与 Phase D 拉动对齐 |

关键串行链：**四夹具收官(v6) → C-0 → C-2 → C-1 → (C-3 判别) → C-5**；与 Phase B 并行窗=P0/P1/P2 三项。
C 冷链战略约束贯穿：所有架构级投资（并行、条目缓存秒级迭代、mmap 驻留）指向 .cheng 驱动管线；C 链只做桥接级（缓存根/命令面/烤机配方已就位，不再加深）。

## 五、口径注

- 「723MB」=wall88r 时代 ordinary 峰（禁缓存 736MB）；memline2c 新基线 902MB 含 w102-w117 墙修复扩大的编译流量 + 采样口径修正（memline2c §5：两数仅方向性可比）。当前报告 RSS 一律注明口径（进程树采样 vs rusage vs 内置高水位）。
- 基线 tsv（user_path_baseline.tsv）仍是收官前旧态，全绿更新是显式在途项，非遗漏。
