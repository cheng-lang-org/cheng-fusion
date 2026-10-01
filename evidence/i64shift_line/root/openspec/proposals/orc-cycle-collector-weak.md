# 纯 ORC + 环收集器 + Weak[T]（propose 阶段，未实施）

## 一页结论

- 环收集器选 **Bacon-Rajan 试删除（同步版）**：只扫"release 后 rc>0"的疑似根子图，不扫全堆、不引入 tracing GC；环对象必然经历一次 rc>0 的 release，候选捕获完备。
- **对象头 8 字节不动**：颜色/CRC/buffered/弱引用登记全部走侧表（复用现有 registry 同款开放寻址哈希），RC 快路径指令序列不变。
- **精确 trace map 是硬前提**：试删除方向上保守扫描不安全（虚增内部边会把活对象误判为环垃圾 → UAF），编译器必须为可成环类型发射字段偏移表；str/bytes 等无管理引用的分配静态判定为 acyclic，完全不走新路径——这就是 str 24 字节值语义零影响的论证。
- `Weak[T]`：`weak(x)` 构造、`upgrade(w): Option[T]` 升级、对象释放（含被环收集器释放）即失效；侧表 control block 实现，无 weak 的对象零开销；Weak 是合法 ZRPC 公共面类型，但禁止跨 FFI/序列化。
- 跨线程边界：v1 收集在全局 runtime 锁内同步执行，`share_mt`/`Arc` 对象视为始终存活的边界根（不试删除、不入候选）；跨线程 Arc 环不收，用 Weak 破，与 Send/Sync 显式边界一致。
- 渐进迁移：trace map 基建先行（默认关）→ `MM_CYCLE=1` opt-in 跑双模式回归 → 默认开（保留 `MM_CYCLE=0` 一个版本周期）→ 移除开关。现有显式破环代码无需改动，文档降级为性能建议。
- **不给 `@no_cycle_collect` 逃逸口**：性能例外由 acyclic 静态判定自动覆盖，逃逸口会把"环必被回收"从语义承诺降级为配置相关行为。
- 验证：fuzz v2 给生成器加 ref 对象图 + 环构造 feature，参考求值器算出可达存活数，程序末尾断言 `memLiveCount()` 一致；同种子同回收批次同终态；快路径零开销以 retain/release 计数不变 + `orc_perf_contract_smoke` 周期对比证明。
- non-goals：不做 tracing GC、不做分代、不改 move/借用语义、不改 str/seq ABI、v1 不收跨线程 Arc 环。

## 1 现状盘点（设计依据）

运行时（`src/core/runtime/program_support_backend.cheng`）：

- `ChengMemHeader = {rc: int32, size: int32}`，8 字节，payload 紧随其后；无 typeId、无颜色位、无弱引用位，两个字段均无空闲位可用。
- `cheng_malloc(size)`：写头（rc=1）、把 payload 指针插入**全局活对象 registry**（开放寻址哈希集合，insert/remove/contains 已生产化）、清零 payload。alloc 不携带任何类型信息。
- `cheng_mem_retain/release`：leaf 全局锁保护；release 归零时直接 `c_free`，**不递归释放子引用**——仓库无 drop glue/析构机制，嵌套引用的配平完全靠容器实现（`seqs.cheng`/`TablePut[str]` 等）与 codegen 写入点插桩。
- 原子路径：`cheng_mem_retain_atomic/release_atomic` 对头部第一字段做 atomic add；release_atomic 归零后拿全局锁并用 registry contains 防双重释放。`Arc[T] = ref {value: T}`（`src/std/sync.cheng`），与普通对象共用同一头部 rc。
- 诊断计数：`cheng_mm_retain/release/alloc/free/live_total`，对应 `memRetainCount` 等 API；检测到计数观察者时 BodyIR retain/release 对消除整体禁用（`primary_object_plan.cheng`）。
- `str = {data, len, store_id, flags}` 24 字节值语义；data 指向纯字节 buffer，buffer 内不含任何管理引用。

规范（`docs/cheng-formal-spec.md` §0.1–0.3）：

- `MM=orc` 固定；§0.1 明文"循环引用最佳实践：显式打断，不内建 tracing GC"、"不定义 tracing-GC pause contract"——本提案落地时这两条需要改写（见 §6）。
- moveHint 规范合同唯一一条：retain/release 省略对可观测行为不可观测；现行生产优化是 BodyIR 相邻 retain/release 对消除（限 fresh malloc 可证明场景）。
- 跨线程：`share` 同线程、`share_mt`/`Arc` 跨线程唯一入口、`@thread_boundary` 白名单边界检查；原子 RC retain relaxed / release release / 归零 acquire fence。
- ZRPC（附录 B）：公共面零裸指针，FFI 仅影子桥接；str 禁止裸露 24 字节布局；边界类型出现在非 ABI 位置 hard-fail。
- FFI 边界跨界持有所有权必须显式 `memRetain/memRelease`（§0.1）——该 retain 计入外部引用，使 FFI 持有的对象在试删除中天然不会被误收。

差分 fuzz 网（`tools/diff_fuzz_test.sh` + `tools/fuzz/cheng_program_gen.c`）：确定性生成器（splitmix64 种子）+ 三方 oracle（内置参考求值器 / cold compiler / pure driver），当前 feature 集只有整数/布尔，无对象无字符串。

## 2 环收集器：同步 Bacon-Rajan 试删除

### 2.1 算法选型依据

选 Bacon-Rajan（2001）试删除系，同步单遍版（不做并发收集器变体）：

- 与纯 RC 正交叠加：只对"疑似环根"做局部图扫描（MarkGray 减内部边 → Scan 判外部引用 → ScanBlack 恢复 / CollectWhite 回收），复杂度 O(疑似子图)，不从全局根扫堆，不违反"无 tracing GC"的工程定位（规范措辞需同步改写为"无全堆 tracing，环收集为 RC 局部补全"）。
- 候选捕获完备性论证：环成员死亡的最后一刻必然是某次 release 后 rc 仍 > 0（环内边撑住计数）——这正是试删除的入队条件，不会漏环。配合 BodyIR 对消除的等价性见 §2.4。
- 工业先例充分：PHP（Zend）、ActionScript、Nim ORC 均为此系；CPython 为同思想变体。无需发明算法。

否决的替代项：(a) 后台并发收集线程——现行 runtime 是全局锁模型，无安全点基建，并发版引入读屏障/写屏障改 RC 快路径，违背零开销目标；(b) 仅靠 Weak + 显式破环——不可证明无泄漏，fuzz 泄漏断言无法闭环。

### 2.2 候选缓冲与触发策略

- 候选入队点：`cheng_mem_release_traced(p)`（见 §5 分流）减一后 rc>0 时，把 payload 插入 **suspect 侧表**（开放寻址哈希集合，复用 registry 实现模式，自带去重 = buffered 标志）。rc 归零仍走原即时释放路径并从 suspect 移除。
- 触发条件（三选一，先到先触发）：
  1. suspect 集合规模阈值：默认 4096，环境变量 `MM_CYCLE_THRESHOLD` 可调；
  2. 自上次收集以来 traced 分配增量超过阈值（防 suspect 长期低水位但环垃圾累积）；
  3. 显式 API `cycleCollect()`（std 暴露），供退出前断言与基准测试用。
- 收集执行点：只在 runtime 入口（`cheng_malloc` 触发检查处 / 显式 API）持全局 runtime 锁 + leaf 锁后执行，天然互斥 alloc/retain/release。不抢占、无异步信号。

### 2.3 精确 trace map（硬前提）

- **保守扫描不安全的论证**：试删除把"子边"用作 CRC 减量。若把 payload 里恰好等于某活对象地址的整数误判为边（registry contains 只能证明"是活对象"，不能证明"是引用"），会虚增该对象的内部边计数、低估外部引用，把有外部引用的活对象判为环垃圾回收 → use-after-free。错误方向不可接受，必须精确。
- 方案：编译器为每个**可达管理引用的 ref 类型**发射 trace map（管理引用字段的偏移表；含 seq 字段时记录元素 stride 与元素内偏移），按 typeId 编号集中到只读数据段。alloc 调用点分流为 `cheng_malloc_traced(size, typeId)`，运行时在 **trace 侧表**记 payload→typeId（不动 8 字节头）。
- acyclic 静态判定：类型引用图上做不动点——类型 T 的所有管理引用字段（递归展开值类型字段）都无法回到任何 ref 类型环，则 T acyclic，不发 trace map、不分流、不进 suspect。str data buffer、bytes、纯标量对象、`int[]`/`str[]` 的 buffer 都属此类（`str[]` 元素是 24 字节值结构，data 指向纯字节 buffer，无回边）。
- 环收集释放语义：CollectWhite 释放环成员时，对**指向环外的边**逐一执行真实 release（用同一 trace map），环内边随成员一起消亡不再单独 release。这与现状"free 不递归"兼容：非环对象的释放路径完全不变。

### 2.4 与 retain/release 对消除（及未来 moveHint）的交互

- 对消除/未来 CFG liveness move 的规范合同是"省略的 retain/release 成对出现且不可观测"。成对省略不改变任何对象的净计数轨迹，只是抹掉"+1 后立即 -1"的毛刺；被省略的 -1 必然对应被省略的 +1，因此**不存在"本应入队的 release 被优化掉"**——对象真正失去一个引用时的 release 永远真实发生，环候选捕获完备性不受优化影响。
- 实现约束：suspect 入队只放在 runtime release 实现内部，不在 codegen 层插桩，优化器无需感知环收集器存在。计数观察者禁用 elision 的现行规则不变。

### 2.5 多线程安全边界

- 收集期间持全局 runtime 锁 + leaf 锁：所有线程的 malloc/retain/release/free 被挡在锁外，图快照一致。
- `share_mt`/`Arc` 对象（atomic RC 路径）：其 rc 可能被锁外线程缓存于寄存器中间状态，且 Send/Sync 规则下只有 Arc 能跨线程——v1 将 Arc 对象登记为 **边界根**（`share_mt` 时在侧表打 atomic 标记）：不入 suspect、MarkGray 遇到即视为外部存活、不减其 CRC、不遍历其子图。效果：含 Arc 的环不会被收（保守方向，安全），纯单线程对象环照常回收。
- 跨线程环的出路是 Weak（§3）：`Arc` 环属于显式共享设计的产物，要求用户用 `Weak` 表达从属方向，与"跨线程必须显式"的语言哲学一致。v2 若需收 Arc 环，前置条件是安全点基建，独立提案。

## 3 Weak[T]

### 3.1 API 面

- `weak(x: T): Weak[T]`：从受管 ref 值构造弱引用；不增加强计数。`T` 必须是 ref 类型（编译期检查）。
- `upgrade(w: Weak[T]): Option[T]`：对象仍存活则原子地 retain 并返回 `Some`，否则 `None`（复用 `src/std/option.cheng` 现有 `Option[T]`）。升级是访问对象的**唯一**途径，`Weak` 不可解引用、不可比较内容、无其它读法。
- 失效语义：对象经任何路径释放（rc 归零即时释放、环收集器 CollectWhite、`Arc` 最后一次原子 release）都在 free 前置失效位；已失效的 `Weak` 永远返回 `None`，可安全复制/丢弃。`Weak` 本身是值语义小结构（内部为 control block 句柄），复制 Weak 增减 weakRc。
- ZRPC 兼容：`Weak[T]` 是合法公共 API 类型——表面无裸指针、无地址泄露，满足零裸指针公共面；但定为**进程内类型**：禁止跨 FFI（不进影子桥接白名单）、禁止序列化，违例按 ZRPC 边界类型 hard-fail 处理（同 str 裸布局规则）。

### 3.2 实现：weak 侧表 + control block

- 不动 8 字节对象头。全局 **weak 侧表**（payload → control block 指针，开放寻址哈希）；control block：`{payload: ptr, weakRc: int32, alive: int32}`，约 16 字节，仅在对象第一次被 `weak()` 时惰性创建。
- `weak(x)`：锁内查/建 control block，weakRc+1，返回句柄。
- `upgrade(w)`：锁内检查 alive；存活则对象 retain（普通对象直接 +1；atomic 对象在锁内仍需 CAS 验证 rc>0 后 +1，防与锁外最后一次原子 release 竞争——objc weak table 同构先例）；返回 `Some/None`。
- 释放钩子：free 路径（三处：即时释放、环收集、atomic 归零）查 weak 侧表，命中则置 alive=0 并摘除 payload 映射；control block 由 weakRc 归零时回收。
- 开销：从未被 weak 的对象**零字节零指令**额外开销（free 路径只多一次"weak 侧表非空才查"的分支，侧表为空时是一次全局变量判零）；被 weak 的对象 16 字节 block + 两个哈希槽。

## 4 渐进迁移

- 阶段 0（本提案 + 基建）：trace map 发射、alloc/release 分流、suspect/weak 侧表落地，`MM_CYCLE` 默认 0——分流后行为与现状逐字节等价（suspect 只积累不收集），先过全量回归与 fuzz 基线。
- 阶段 1（opt-in）：`MM_CYCLE=1` 启用触发；差分 fuzz、production regression、自举链路在两种模式下双跑，泄漏断言只在 =1 模式生效。
- 阶段 2（默认翻转）：fuzz v2 连续 N 轮（建议 ≥10 万种子）零差异 + 自举 fixed point 不变 + 性能合同达标后默认 1，`MM_CYCLE=0` 保留一个版本周期作为故障隔离开关（仅诊断用途，不是语义开关）。
- 阶段 3：移除开关，规范 §0.1 改写为"环由收集器保证回收"。
- 现有显式破环代码：与收集器完全共存（破环让环更早消失、降低收集压力），零迁移成本；规范中"最佳实践：显式打断"降级为性能建议而非正确性要求。
- **不提供 `@no_cycle_collect` 逃逸口**：(a) 语义上"环必被回收"必须是无条件承诺，逃逸口使泄漏断言依赖标注审计，fuzz 失去唯一真值；(b) 性能动机已被 acyclic 静态判定自动覆盖，无需用户标注；(c) 与"禁止降级/兜底"的工程纪律一致。

## 5 运行时与编译器改动面清单

- 对象头：**零改动**（8 字节不变，无新增位）。所有收集器状态（颜色/CRC/buffered）只在收集期间存在于临时侧表，收集结束即清空；常驻侧表只有 trace 映射、suspect 集合、weak 表、atomic 边界标记四张哈希。
- 运行时新增（全部位于平台无关的 `program_support_backend.cheng`；darwin/linux provider 不含 ORC 实现，**零改动**）：
  - `cheng_malloc_traced(size, typeId)`、`cheng_mem_release_traced(p)`（acyclic 分配继续走原 `cheng_malloc/cheng_mem_release`，指令序列不变）；
  - `cheng_cycle_collect()` 与触发检查；`cheng_weak_create/upgrade/release`；
  - 计数器：`cheng_mm_cycle_collect_runs/cycle_collected_total/suspect_live`，并入 `memDiagReset` 体系，供回归断言。
- 编译器：trace map 数据段发射 + typeId 分配；alloc/release 调用点按类型 acyclic 性分流；`weak/upgrade` 的语义检查（仅 ref 类型可 weak、Weak 禁 FFI/序列化边界）；`share_mt` 调用点补 atomic 边界登记。
- str 24 字节零影响论证：str 是值类型不经 `cheng_malloc` 分配自身，布局、ABI、桥接规则全部不涉及；其 data buffer 为 acyclic 分配，alloc/release 路径逐指令不变；字符串容器（`str[]`/`Table[str]`）buffer 同为 acyclic（元素值结构无回边），既有 retain/release 配平闭环不动。唯一交集是"str 字段所在的宿主对象"可能 traced，trace map 对 str 字段记录的是"释放时 release 其 data buffer"边——该边只在宿主死亡时使用，与 str 值语义无关。

## 6 验证计划

- fuzz v2（衔接现有三方 oracle）：`cheng_program_gen.c` 新增 `F_REF_GRAPH` feature——生成 ref 对象类型（含自引用字段）、随机构图（自环/二元环/环+尾巴/DAG 混合/环挂 str 字段）、随机断边与作用域退出；参考求值器维护影子对象图精确计算程序终点的可达存活数；生成程序末尾追加 `cycleCollect()` + `memLiveCount()` 断言。oracle 从三方扩为三方 + 泄漏断言（exit code 体现）。
- 确定性回归：suspect 按入队序扫描、收集批次内按确定序释放 → 同种子同程序保证**同回收批次序列与同终态计数**；最低合同为同终态（`memAllocCount==memFreeCount`、`memLiveCount` 一致），批次序列一致作为强合同纳入 `MM_DIAG` 扩展日志比对。自举链路 `bootstrap --fullspec` 输出 hash 在 `MM_CYCLE=0/1` 下必须一致（编译器自身不依赖收集时机）。
- 影子校验模式：`MM_CYCLE_VERIFY=1` 时收集前用活对象 registry 全量交叉检查（每个候选的 CRC 非负、CollectWhite 集合无 registry 外引用者），fuzz 全程开启，生产关闭。
- 性能预算与零开销证明：
  - RC 快路径：acyclic 分配 retain/release 指令序列与现状逐指令相同（分流在编译期完成），以 `orc_perf_contract_smoke` 周期数对比 + 生成汇编 diff 证明；traced release 的增量（rc>0 时一次哈希入队）以微基准量化，目标 ≤ 现有 leaf lock 开销的 30%。
  - 收集暂停：上界 O(suspect 子图边数)；预算合同——默认阈值下单次收集 ≤1ms/万对象级，纳入 `perf_memory_contract_smoke` 新增 `cycle_collect_pause` 观测项，超限 hard-fail。
  - 内存：四张侧表常驻规模与 traced 活对象数线性，预算合同 ≤ 活对象总头开销的 50%。
- 规范同步：落地时改写 §0.1 两处措辞（"显式打断"→性能建议；"不内建 tracing GC"→"无全堆 tracing，环收集为 RC 局部补全，定义收集暂停观测项"），过 `cheng_skill_consistency_smoke`；不得移除任何门禁同步标记。

## 7 风险与不做的事

风险与缓解：

- trace map 漏边 → 环收不掉（泄漏，可观测）；多边/错边 → UAF（致命）。缓解：trace map 由类型布局单一来源生成（与字段偏移计算同源）、`MM_CYCLE_VERIFY` 影子校验、fuzz v2 图构造覆盖。
- 收集暂停长尾（病态大环）。缓解：阈值触发 + 单次收集候选数上限（超出顺延下次），合同化暂停观测。
- atomic 边界登记遗漏（Arc 对象误入 suspect）→ 并发下 CRC 错乱。缓解：登记点收口在 `share_mt`/`arcClone` 运行时实现内部，fuzz 多线程 smoke 与 `thread_atomic_orc_runtime_gate_smoke` 扩展覆盖。
- 阶段 0 分流本身引入回归。缓解：分流后 `MM_CYCLE=0` 与现状 byte-identical 等价证据（沿用 moveHint 提案的等价证据管线口径）。

non-goals（明确不做）：

- 不做 tracing GC：永不从全局根扫全堆；收集器输入只有 suspect 集合。
- 不做分代/增量/并发收集：v1 同步收集，复杂度换确定性。
- 不改 move/借用语义、不改 `share`/`share_mt`/`Send/Sync` 边界、不改 FFI 显式 retain/release 合同。
- 不改 str/seq ABI 与 24 字节值语义；不动 SABI/ZRPC 既有桥接规则。
- v1 不回收含 `Arc`/atomic 对象的环（边界根保守处理，出路为 Weak）。

## 8 执行记录

- 2026-06-10：propose 阶段文档完成，待用户拍板后进入 apply。
