# factTable arena 评估 (只诊断不修) — 轮四十二 typedExprFactTableEnsureStorage 98.89%

来源: ledger ca68c3982 轮四十二 lldb 采样(225k cheng_malloc)。字节口径归因:
`typedExprFactTableEnsureStorage` 占分配字节数 98.89%，1346 次 × 均值 1.05MB。
本卷只读源码 + 静态推演结案，未执行编译/未起进程 (ps 无残留)。

## 1. 结构与生长策略

### 1.1 `TypedExprFactTable` = 29 列 SoA + 1 个共享 Arena + 1 个 InternPool

`src/core/lang/typed_expr.cheng:129-161`。29 个 `arenamod.ArenaArrayInt32` 列
(exprIdIds...returnRoots，其中 `hasSinks`/`returnRoots` 两列声明但从未被
`TypedExprFactTableAppend` 填充——布尔位打包进了 `callPrefixStyles`，这两列
capacity 恒为 0，不产生分配，非本次问题的一部分)。8 个 str 字段走
`InternPool` 去重存 id，其余 21 个 int32/enum/bool 编码列直接落 Arena。

### 1.2 `typedExprFactTableEnsureStorage` (:2862-2868) 的生长策略 = 定长 1MiB 首块，非按需估算

```
fn typedExprFactTableEnsureStorage(table: var TypedExprFactTable) =
    if table.internPool == nil:
        table.internPool = langintern.InternPoolNew()
    if table.arena.capacityBytes <= 0:
        table.arena = arenamod.ArenaInitDefault(1048576)
```

只在 `capacityBytes<=0`(即整个 table 生命周期的第一次 append)触发一次
`arena_rt_malloc(1048576)`——**固定 1 MiB，与该 table 实际会装多少条 fact
完全无关**，不是倍增、不是精确按需重分配、也不是启发式估算，是纯常量首块。

### 1.3 首块之上还有两层独立的生长(均在 `arena.cheng`，非 ensureStorage 自身)

- **外层 Arena 整体扩容**(`ArenaAllocBytesAligned` :182-198): 若某次
  `ArenaArrayInt32Add` 把 `usedBytes` 顶穿 `capacityBytes`，走
  `growCap = capacityBytes*2` 再 `arena_rt_realloc`——是真倍增摊还，但由
  `ArenaArrayInt32Add`/`TypedExprFactTableAppend` 触发，调用点不是
  ensureStorage 本身。均值 1.05MB(非 1.00MB) 说明 1346 个 table 里只有**少
  数**触顶过 1MB 走到了这层 realloc(2MB/4MB…)，把均值拉高了 5%，绝大多数
  从未超过首块。
- **内层 29 个列各自倍增**(`ArenaArrayInt32Add` :264-289): 每列独立
  `capacity: 8→16→32→...`，每次翻倍要把旧 `len*4` 字节**逐字节拷贝**到 Arena
  内新申请的区域(bump allocator，行 279-280 循环)，旧区域不释放、不复用，
  直到整个 Arena 被 `ArenaRelease` 才连带回收。29 列独立生长意味着同一个
  table 内部存在 29 条几何级数拷贝链，是叠加在"1MiB 定长首块"之上的第二浪
  费维度(细节见 §2)。

### 1.4 旧块是否释放：已释放，非泄漏(呼应轮二十一 dead=0)

`ArenaRelease` (:132-139) 对 `basePtr!=nil` 无条件 `arena_rt_free`。追踪
1346 次 table 实例的生命周期(`src/core/tooling/compiler_csg.cheng`)：

- `CompilerCsgV2AppendSourceExprSlices` (:7702-7817)：对每个
  `(sourceIndex, functionIndex)` 连续 slice 各建一个 `var sliceFacts:
  TypedExprFactTable`(:7766)，用
  `TypedExprBuildFactsAppendSourceExprLayerWithContext` 填入该函数切片的
  facts，随即通过 `TypedExprFactAt` 逐行读出汇入 CSG 累加器
  (`CompilerCsgV2TypedFactAccumulatorAppend` :1899+)，**成功/失败每条路径
  都显式 `texpr.TypedExprFactTableRelease(sliceFacts)`**(:7774/7787/7800/7812)。
- `CompilerCsgConsumeExprSliceIntoTypedFacts` (:7622-7700) 对
  `sourceTypedFacts` 是同一模式(:7654/7667/7680/7692)。

即 **1346 次 = 1346 个"按可达函数切片"临时建的 scratch table**，每个都是
"建→填→逐行读出汇总→立即释放"的一次性生命周期，无一条路径遗漏 Release。
**没有泄漏，1.4GB 级的字节量是纯 churn(分配又立刻归还)，不是常驻 RSS**——
与轮二十一 dead=0 结论一致，也解释了为什么轮四十二把它单独标注为
"非小分配 churn 问题"：它是"大块但短命"的第三种 churn 形态，区别于
GrowByteBuffer 那条"小分配高频"的主凶。

### 1.5 `TypedExprFactTableClone` 不在 1346 次热路径里

全仓唯一调用点 `compiler_csg.cheng:882`，每次 CSG 构建大概率只调一次(整图
克隆/checkpoint 用途)，与本次 1346 次/1.05MB 无关。它头顶的
"Split decl/assign" WIP 注释(:3025-3027)说的是 Cheng 编译器自举时对
`var out: TypedExprFactTable` 空类型局部变量 + 整体赋值的 codegen 帧大小
规避("size=4 Aggregate 太小放不下 internPool FieldStore@24/8 触发 bail=2")
——这是编译器自身代码生成的脆弱点，跟 Arena 效率、跟本次浪费量化完全是两
件事，不要混为一谈。

## 2. 量化浪费

设一个"可达函数切片"table 的真实 payload：每条 fact 在 29 列 SoA 里紧
凑占用 29×4=116 字节(str 字段只存 4 字节 intern id，真正的字符串字节存一
份在 InternPool 里、跨 table 内去重，不计入 Arena 用量)。

### 2.1 首块层面(主浪费，93%+ 的字节量)

- 1346 次 × 1,048,576 字节固定首块 ≈ **1.410 GB** 原始分配量，其中均值
  1.05MB 说明只有极少数切片真的顶穿并触发外层 realloc 到 2MB+；**绝大多数
  切片的 `usedBytes` 远低于 1,048,576**——一个"可达函数"级别的 normalized-
  expr 切片，几十到几百条 fact 是常态(几百条 fact × 116B ≈ 数十 KB)，撑
  到 1MB(≈9000 条 fact)需要单个函数产生 9000 条 typed-expr fact，这在绝
  大多数函数体量下不会发生。
- 也就是说首块本身的**空置率(尾部从未被 usedBytes 触达的字节比例)大概率
  在 90%+ 量级**——1.41GB 里真正被写入过的可能只有大致一到两个数量级更小
  的量(精确空置率需要 §3 提到的运行时口径验证，本卷不做，因为"只诊断不
  修"且要求不起进程；这里给的是数量级推演，不假冒精确实测)。

### 2.2 mmap 层(比字节数更硬的一层成本)

`arena.cheng` 文件头注释(:1-8)明说：**block ≥1MB 是刻意设计，为的是让
`cheng_malloc` 走运行时的 mmap 分级**，这样 `ArenaRelease` 才能真的把页
面还给 OS。这意味着 1346 次 ensureStorage 里的每一次，几乎必然是一次真实
的 `mmap()` 系统调用，配对一次 `arena_rt_free` 触发的 `munmap()`——即
**1346 组 mmap/munmap 系统调用**，与页表建立/拆除、可能的 TLB shootdown
成本绑定。这层成本不随"这块内存到底用了多少字节"而衰减：哪怕 usedBytes
只有 8KB，只要首块选了 1MiB 常量，就照样是一次满血 mmap 调用。字节浪费
和 mmap 调用次数是两个独立可改善的维度，且后者可能是更贵的那个。

### 2.3 内层列级双花(叠加但量级更小)

29 列各自独立倍增 + bump-no-free：对每列而言，几何级数(8+16+32+...+cap/2
= cap-8)意味着该列在达到最终 capacity 前，此前所有中间尺寸的拷贝都变成
Arena 内的死区(不释放直到整表 Release)。29 列合计的"死区拷贝字节"量级
≈ 29 × 该列最终字节数(即比"只分配一次刚好够的空间"多花约 1 倍)。这个浪
费本质上**是任何倍增容器都有的标准 O(1) 摊还代价**，量级远小于 §2.1 的
"1MiB 定长首块 vs 实际几十 KB 需求"——不是本次 98.89% 的主因，是叠加在
主因之上的次要项，值得记录但不该被误当成主凶去修。

### 2.4 一个可直接验证的旁证：同一常量在别处的合理用法

`ArenaInitDefault(1048576)` 在 `typed_expr.cheng` 里一共出现 5 处
(1260/1287/1313/2868/27328)。除 2868(FactTable，本卷对象)外，其余 4 处
全部挂在 `TypedExprIr`(`ir.arena`)上——`TypedExprIrAppendFunctionV2` /
`AppendNodeV2` / `AppendStatementV2` 等(:1254-1314+)，这是**整个编译单元
级别**的 IR(`ir.functions2_*`/`ir.nodes2_*`/`ir.statements2_*`，装的是全
部函数/全部节点/全部语句)，一个进程通常只建一份或极少份，1MiB 摊到"整
个编译单元的全部 IR"上完全合理。**FactTable 把这个为粗粒度(整编译单元)
场景写的常量原样搬到了细粒度(每个可达函数切片)场景**，量级上少说差了
1-2 个数量级，是典型的"抄邻近写法没有为新调用点重新推导常量"根因——不
是设计者故意选大，是复制走样。

## 3. 修复选项评估(不实施)

### (a) 倍增摊还(改小首块 + 让既有外层倍增自然生长)

外层倍增机制(`ArenaAllocBytesAligned` :182-198，`growCap=capacityBytes*2`)
**已经存在**，不用新写。改法 = 把 :2868 这一行的字面量从 `1048576` 降到
一个贴合"单函数切片"量级的小首块(例如 4KB-64KB 区间，需要用真实分布数
据定，见 §4 gap)，交给已有的摊还逻辑往上长。

- 改动面：`typed_expr.cheng:2868` 一行字面量，**不碰 `arena.cheng`**(那
  是共享文件，改了会波及 :1260/1287/1313/27328 的 `TypedExprIr` 场景，
  必须避免)。因为 `ArenaInitDefault` 本身是参数化的，FactTable 这一处的
  字面量是独立调用点，改动天然局部。
- 风险：注释里作者的顾虑("smaller initial blocks force repeated arena
  growth and raise the process high-water RSS")本身是本卷要正面质疑的
  假设——倍增是 O(log n) 次 realloc，每次搬运量之和收敛到约 2× 最终大小
  ，比"每实例硬发 1MiB、90%+ 从不触达"便宜得多；除非有真实测数据显示
  "重复 realloc 本身"(而非字节数)是那次改动想规避的瓶颈(比如 realloc
  跨 mmap 门限来回抖动)，否则这条顾虑目前看是未经验证的直觉。
- 是否合法优化(非兜底)：是。这不是"猜错了还能用、只是慢"的启发式补
  丁——首块大小选择本来就只影响性能不影响正确性(倍增链路本身已经是生产
  路径，不是新增的降级分支)，符合"预估错的行为必须仍正确只是慢"的过审
  门槛。真正要注意的只是**别把 :2868 之外的 4 处 `TypedExprIr` 场景一起
  改了**(那 4 处的粗粒度场景 1MiB 是合理的，不在本次问题范围)。

### (b) 预估容量(按编译单元/函数体量启发式选首块大小)

用切片自身已知的 `sourceExprLayer.exprs.len` (调用 ensureStorage 之前，
`CompilerCsgConsumeExprSliceIntoTypedFacts`/`AppendSourceExprSlices` 已经
拿到了这个切片要处理多少条 expr)作为容量提示，按 `exprCount × 116 字节
×余量系数` 直接一次到位分配，不经过倍增。

- 改动面：比 (a) 稍大——需要把 `typedExprFactTableEnsureStorage` 签名加
  一个"预计条数"参数(或新增一个 `typedExprFactTableEnsureStorageHint`
  变体)，并在两个调用点(:7648 前置知道 `sourceExprLayer.exprs.len`,
  :7768 前置知道 `sliceExprLayer.exprs.len`)把这个数传进去。
  `TypedExprFactTableAppend` 本身不用改。
- 风险 / 非兜底审查：启发式**预估条数**若与实际 append 次数不符——比如
  一条 normalized-expr 在类型检查阶段被跳过/合并，最终 append 次数少于
  `exprs.len`——不影响正确性，只是首块偏大或偏小，偏小时照样滑落到 (a)
  的既有倍增路径兜底，**行为不变只是快慢差异**，合法。真正的风险点是
  "余量系数"选取需要真实分布支撑(见 §4)，选错只影响性价比不影响正确
  性，仍在授权范围内。
- 相比 (a)，(b) 精度更高但改动面多了参数传递，两个调用点都要改；(a) 是
  单常量微调，性价比明显更高，除非 §4 的真实分布测出"函数体量方差极大
  、单一小常量仍然大幅欠配"，否则应该先选 (a)。

### (c) 分段 arena(链式段，不做整体 realloc 搬运)

把 Arena 从"一块连续内存 + 整体 realloc 倍增"改成"链表挂多个固定大小
段，用满一段就新开一段，不做跨段搬运"。

- 这能同时消掉 §2.1(首块常量选择不当)和 §2.3(29 列各自倍增内部拷贝)两
  个浪费维度——因为段一旦分配就不再挪动，`ArenaArrayInt32Add` 的列增长
  不再需要把旧数据拷到新区域，改成跨段索引即可。
  但也要如实说：**§1.4 已经确认这些 table 现在就是显式 Release、非泄漏
  **，分段 arena 解决不了一个不存在的泄漏问题，它解决的是"搬运字节"与
  "常量选型"问题，跟"zero-free 世界旧块不释放"完全不是一回事——这条不
  适用于 FactTable 现状(它是"手动配对释放"的世界，不是"只加不减"的
  ORC 追缴世界)。轮二十一 dead=0 已经定谳这一点，(c) 不该被包装成"解决
  泄漏"的方案，它只能被包装成"减少搬运字节 + 摆脱大块常量首选"的方案。
- 改动面明显最大：`ArenaBytes`/`ArenaArrayInt32` 现在的 `offset` 字段假
  设单一连续地址空间(:41-50 里 `offset: int32` 是"距 basePtr 的字节偏
  移")，`ArenaGetByte`/`ArenaSetByte`/`arenaLoadByte` 全部走
  `arenaBytePtrAt(base, offset)` 单指针加偏移(:52-59)。分段后这些函数
  要变成"段号 + 段内偏移"两段式寻址，波及 `arena.cheng` 全部读写原语，
  而这个文件被 `TypedExprIr`(4 处)、其余可能的调用方共享——按项目"改
  primary_object_plan.cheng 前看 mtime"同款纪律，任何改 `arena.cheng`
  公共 API 都要先摸清全部消费者、且是一次跨越多个模块的 ABI 级改动，不
  是"只诊断不修"这一轮能评估完风险面的规模。
- 与 ORC-registry 交互：这里没有 ORC 参与——Arena 走的是手工
  `arena_rt_malloc`/`arena_rt_free`(:9-16 `@importc`)，不经过 Cheng 自己
  的所有权/引用计数体系("生产 ORC 未完成"，`docs/beat-c.md` 已记录)。
  分段 arena 如果想让"用满一段就新开一段"在极端情况下也不必要地长期存
  活，那才需要操心生命周期追踪；但既然 §1.4 已证实现在是严格配对
  Release，(c) 不会比现状引入新的生命周期风险，只是工程量最大、且必须
  改一个被多方共享的核心运行时文件。

### 三选项性价比结论(不实施，仅供下一步立项参考)

(a) 改动面最小(一行常量)、零风险(不碰共享文件、不改签名)、能吃掉 §2.1
主浪费的绝大部分，应该是第一梯队。(b) 在 (a) 基础上锦上添花，值不值得
做取决于真实函数体量分布(§4 待验证)。(c) 解决的是一个本卷未发现存在
迫切性的"搬运字节"次要问题，改动面/风险都远超前两者，且容易被误包装成
"解决泄漏"(现状没有泄漏)，不建议在没有先做完 (a)/(b) 之前立项。

## 4. 诚实缺口(本卷未验证的部分)

- **没有跑真实编译**：本卷严格只读源码 + 静态推演，1346/1.05MB 的原始
  数字来自轮四十二已经做过的 lldb 采样(引用其结论)，本卷没有重新采样
  复核这两个数字本身，也没有实测真实的"每切片 fact 数分布"(§2.1 的
  "几十到几百条"是基于 29 列×116B/条 的结构推算 + 常识性函数体量估计，
  不是直接测量值)。
- 如果要把 §2.1 的"空置率 90%+"从推演升级为实测结论，需要按任务里提到
  的 lldb malloc 断点法(churn 卷宗现成手法)在真实自举编译上跑一遍，对
  每次 `ensureStorage` 触发的 `arena_rt_malloc` 调用配对记录该 table 最
  终 `usedBytes`，直接算出真实空置率分布 —— 本卷判断这个验证成本值得在
  拍板 (a)/(b) 之前补一次，但按"只诊断不修"的硬纪律没有在本卷执行。
- (a) 选项里"改小到多少字节"需要这份真实分布支撑，本卷只给了方向(常量
  级别不匹配)，没有给出应该改成的具体目标值。
