> **口径迁移（2026-09-08 用户令）**：本文 1GiB 为迁移前最后防线；当前理论极限=768MiB=805,306,368 bytes。

# bake_opt_design — 条目级对象缓存 × 闭包内并行 施工设计（2026-08-31 只读勘察线）

基线：kernel 烤机（车头 system-link-exec 编 `backend_driver_dispatch_min.cheng` 闭包出 183MB exe）
w29 memo 后 **240s**（/tmp/oob_ab/VERIFY_w29_append.md；992s→240s，字节配对 809817d6 双过）。
分相位（/tmp/oob_ab/pm_benchB/bench.rpt）：**parse 相位 163.6s（68.4%）+ codegen 70.2s（29.4%）
+ object emit 0.25s + 链接/签名等 ~5.3s**；报告自算 14 核理论限 **16.8s**
（compile_theory_parallel_limit_ms=16828.523）。闭包规模：238 文件 / 684,317 行 / 33MB /
22,276 函数 / 284.6 万 BodyIR op（pm_benchA/bench.rpt）。

采样归属（/tmp/oob_ab/bake_perf/sample_perfC_postmemo.txt，总 50,521 样本，单线程主线程）：
- materialize（import 函数体逐个 parse+lower）**23,410 = 46.3%**
  （cold_materialize_reachable_function_fixed_point → cold_compile_import_function_direct
  → cold_try_compile_import_function_from_source → cold_parse_fn_in_scratch）
- freeze 证明族 **16,959 = 33.6%**（cold_function_body_store_freeze → cold_freeze_body_rewrites
  → borrow_copy_slot_alias / tuple_valid_uncached / is_live_before_op / op_names 族）
- 入口 parse + 闭包收集等 ~14%；codegen+emit+link 合计 ~6%（该窗口偏 parse 侧）

---

## 一、勘察结论（逐问证据）

### 1. 编译单元结构：整闭包一体，无逐文件对象

- `cold_cmd_system_link_exec`（bootstrap/cheng_cold.c:111421）exe 路径只调**一次**
  `cold_compile_source_to_object(primary_o, source_path,…, reachable_entry_only=true)`
  （cheng_cold.c:112343），产 `<out>.primary.o` 唯一 Cheng 对象；provider（C runtime）5 个
  .o 单独生成（provider_object_count=5，pm_benchA/bench.rpt），最后直接调 ld + codesign
  （107647-107737）。
- 闭包收集：`cold_collect_import_source_closure`（101484；实现 79297，cap=512，
  COLD_IMPORT_SOURCE_CAP 31552）把 238 文件 mmap 进 source snapshot
  （source_snapshot_count=238）。**文件间依赖不在对象层表达**（单对象），在源层表达：
  import 边表 `cold_import_closure_edge_find`（80694）+ 函数精确声明身份
  declaration_origin=(module_source_row, token_byte_offset)（79984-80007、80026-80033）。
- 「逐文件」只发生在**函数体物化**：`cold_materialize_reachable_function_fixed_point`
  （80195）从 main 起调用图 worklist，对每个 import 函数经
  `cold_try_compile_import_function_from_source`（80013）按 declaration_origin 打开所属
  文件 slice，`cold_parse_fn_in_scratch` 现场 parse+lower 成 BodyIR 存入共享 body_store。
- 结论：**条目（文件/函数）级产物边界当前不存在**；「条目级缓存」必须自建条目产物形态。

### 2. 既有缓存地基：四级缓存全在，键是全闭包内容，且被纪律清零

| 机制 | 位置 | 作用 |
|---|---|---|
| CHENG_DISABLE_COLD_OBJECT_CACHE | 86167-86170 | 总闸（唯一活读者） |
| 对象缓存 primary/p2m | 键 86233-86267，restore 86420，store 86445；primary 接入 101495-101557，p2m 81204-81215 | 内容寻址 `artifacts/cold_object_cache/<target>/<sha256>.o` + `.map`(cheng_line_map)/`.hex` sidecar，原子替换（86429-86441），2GiB mtime-LRU 容量（86357-86418） |
| 链接缓存（整 exe） | 107444-107756，键 107213-107268 | 键=schema+triple+ld flags+工具链核 sha+codesign identity+**每个输入 .o 全字节**；命中直接 restore 183MB exe（107461-107472） |
| CHENG_COLD_CACHE_STATS | 107464-107471、107746-107754 | stderr 打 link_cache=hit/store/off + exportc memo 计数（90161-90162） |
| CHENG_COLD_KEEP_PROVIDER_OBJECTS | 113563-113577 | 默认 unlink 全部 provider .o；置 1（或 out 含 `.provider_seed.exe`）保留 |
| CHENG_COLD_MEMORY_MANIFEST_OUT | 598-615、944-947 | BodyIR arena 生命周期事件流（arena_open/body_birth/slab_replace/body_release），事件文法由 Fusion regalloc preflight 验证；`max_active_bodyir_arenas=1` 合同——**多 arena 长寿命并行受此合同约束，worker 短命 arena 不入表（注释 616-619）** |

- 键内容（86248-86264）：schema+target+feature+export_roots+visibility+reachable+
  no_import_bodies+入口路径+入口全文+**闭包每文件（路径+全文 sha）**+工具链指纹
  （86190-86231：编译器 exe sha256 + bootstrap 12 个 C 文件全文）。
  **不含 --out、不含时间戳**；但闭包内任一文件 1 字节变化 → 整键失效 → 全量重编。
- 纪律对应物：`tools/cheng_disk_guard.sh:11` `COLD_CACHE_CAP_KIB` **默认 0**——每次运行
  prune_root 清空 artifacts/cold_object_cache（:184-193），低水位时归零强清（:220 附近）。
  即 AGENTS.md「冷对象缓存不得跨任务保留」的执行器。历史教训 lessons.md:284（缓存遮蔽
  源改动）、:752（缓存命中=假对拍，对拍前必须关缓存）。
- **实测（本线，/tmp/oob_ab/optdesign/fakeroot）**：同一 fixture 两跑 emit:obj，
  第一跑 `[objcache] ready=1 … exists=0` 0.08s 编译+store；第二跑 `exists=1` 直接
  restore 0.10s，产物 sha256 同为 c19e2a09…。缓存链路活着、字节一致、秒级。
- 历史遗迹（勿复活当新发明）：`BACKEND_INCREMENTAL`/`BACKEND_MULTI_MODULE_CACHE`/
  `CHENG_DISABLE_PRIMARY_OBJECT_CACHE` 只被 setenv（15433-15437、16410-16414、115108）
  和 .cheng 门禁钉 0（src/core/tooling/backend_driver_main.cheng:253-254 等），**全仓无
  getenv 读者**——增量/多模块缓存曾存在后被拆除，门禁面防其复活。新设计必须过这层门禁语义。

### 3. 缓存键与 --out 嵌字节：键不含 out，产物含 out 基名；链接侧已中和

- w29 铁证（VERIFY_w29_append.md）：异基名 183MB 产物差 113 字节，全部落在 OSO stabs
  （`.program_support_host_runtime.cheng.<out>.provider.host.o`）、`<out>-55554944<uuid>`
  标签、LC_UUID、ad-hoc 签名。
- 代码自证 cheng_cold.c:107320-107328（byte-contract root fix）：ld 把每个 .o 输入路径
  逐字记入 OSO stabs → strsize/LC_UUID/签名级联随 --out 变；修复=输出目录内 .o 一律以
  常量基名传 ld + cwd 切到输出目录（107345-107358）+ `-oso_prefix <outdir>/`
  （107575-107586，注释明说这是「同源同字节跨 --out 目录」的实际机制）。
- OSO n_value 嵌 .o 的 st_mtime：**已 utime 归零所有输入**（107542-107546，注释自证
  sequential builds 仅此处不同）。
- 对象/链接缓存键均不含 out；`cold_private_object_salt_for_input`（101529）从输入内容
  派生。**残余嵌入 = 输出基名字符串本身**（stabs 内 `<out>` 字样 + 由此派生的 UUID/签名）。
  对象级缓存（.o）不受影响（其内 stabs 记录的是编译期路径，与最终 --out 无关）；
  链接级缓存命中跨 --out 复用的前提正是上述 root fix——同名不同目录已实测逐字节相等
  （VERIFY_w29_append.md：manifest bench exe perfA=perfB=42d3639d…，异目录同名）。
- 改造含义：**条目缓存若引入新落盘 .o，落盘名必须是内容哈希（沿用 86269 模式），
  不得含任务路径**；若未来把基名也从 stabs 抹掉（编 OSO 时用常量名），则链接缓存可
  跨任意 out 复用——列为可选加固，非必需。

### 4. 并行切分点：共享全局一张符号表；freeze/codegen 已并行，materialize 串行是缺口

- 共享可变全局（单进程内）：一张 `Symbols` 符号表（含 function/type/object 行号分配）、
  一个 `ColdFunctionBodyStore`（body_store，mutation_generation 24553）、闭包级 arena、
  文件级 parser 上下文（ColdScopeDirectImports 80093-80096）、ColdErrorJumpStack。
  101688-101690 注释原文：「Parsing still mutates shared Symbols, BodyStore, arena and
  file-scoped parser context. Keep this path serial until each worker owns an isolated
  snapshot and publication is deterministic.」
- **已并行且声明字节确定**（开关 `BACKEND_JOBS`，默认强制 1：15873、16417；上限 16：
  33108；RSS 联动 33096-33098）：
  - freeze：`cold_function_body_store_freeze`（24722 cold_jobs_from_env）strided 分区
    （24689-24691 注释：每个 body 的 rewrites 只读 symbols、只写自己的 body，无共享写），
    worker=`cold_freeze_worker_run`（24700-24715）。
  - codegen：102816-102845 worker 池（per-worker arena+Code，回放共享前缀，
    index-order merge，"Parallel codegen is byte-deterministic … BACKEND_JOBS=1 keeps
    the serial path"，102838-102840）；serial_oracle=BACKEND_JOBS=1 写入报告合同
    （74725-74726 fn_parallel_contract）。
  - **实测（本线，/tmp/oob_ab/optdesign/treerun，车头 cheng_perfB，html-csg
    run-latest.cheng emit:obj）**：BACKEND_JOBS=1 → 22.1s，sha256=bcb9b945…；
    清缓存后 BACKEND_JOBS=4 → 18.5s，**sha256 同为 bcb9b945…**（与 w29 VERIFY 的
    perfA/W1 哈希三方一致）。字节契约在现车头成立；提速仅 16% 因该 fixture codegen
    占比小——瓶颈确在 materialize/freeze。
- **必须串行归并**：符号注册（闭包 prescan/collect，含 alias const 种子序 101534-101544）、
  worklist 依赖序（callee 未物化时 caller parse 需要其签名存在）、最终 Mach-O 布局与
  符号表（单对象直写，emit 0.25s+link 5s，无并行价值）。
- 结论：**并行施工面 = materialize（46.3%）**；freeze（33.6%）与 codegen（29.4%）
  只差「把 BACKEND_JOBS 打开并验守卫」。

### 5. 确定性风险清单（并行/缓存后逐字节一致的条件）

1. **符号 row 分配序**：materialize worklist 是 DFS 序（80218-80283），parse 期间会注册
   generic 特化新行（80153 parsed_index 可为新行）→ row 依赖编译序。并行化必须保证
   发布序=现串行序（index-order publication），否则 BodyIR 内 int32 row 引用漂移。
2. **freeze 幂等性**：rewrites 是变换非查询；条目缓存若存 freeze 前 body，restore 后
   重跑 rewrites 必须逐字节幂等才安全——存 **freeze 完成态**（带 per-body 完成标志）更稳。
   当前 frozen 是 store 级（cold_types.h 无 per-body frozen 标志）。
3. **--out/路径嵌入**：新落盘产物名走内容哈希（§3）；OSO/mtime 已中和（107542-107586）。
4. **环境开关入键**：任何影响发射字节的新 env 必须进键（先例：no_import_bodies_env
   101416-101420 注释 poisoned-hit 教训）。
5. **假对拍**：字节配对验收轮必须 `CHENG_DISABLE_COLD_OBJECT_CACHE=1`（lessons:752；
   本线实测二跑 0.28s restore 同哈希复现了该机制）。缓存轮与对拍轮分开跑。
6. **RSS 守卫**：CHENG_PROCESS_MAX_RSS_BYTES 默认 1GiB（15438/15872/16416），worker
   只在 set 时且仍 fit 才加（33096-33098）。烤机 jobs=1 实测 RSS 750MB
   （pm_benchA report_rss_bytes=750387200）——**并行度阶梯必须实测 RSS 斜率**，这是
   B 线第一验收项。
7. **GEN2/GEN3 固定点约束原文**（docs/cheng-minimal-kernel-plan.md:193-196 D3）：
   「内核源集由纯 Cheng 编译器编译出 GEN2/GEN3 原始字节固定点」「源码冻结窗口……连续
   两代原始字节固定点；全程 1GiB 进程树守卫」「固定点绑定源码/编译器/工具三方哈希」。
   → 并行/缓存改造后，烤机产物必须仍满足：同树态两代逐字节相同 + 与改造前产物逐字节
   相同（字节配对烤机验收即此门的日常形态）。缓存 restore 的产物同样过 183MB 全文件
   sha256 对拍，无豁免。

### 6. 收益模型（迭代轮典型变更面 1-3 文件，基线 240s）

| 场景 | 机制 | 剩余墙钟 | 依据 |
|---|---|---|---|
| 零变更重跑（配对基准确认、验证重放） | 对象+链接缓存命中 | **~1-3s**（键 sha 33MB+4MB ~0.3s；restore 183MB ~0.5s；provider 键计算） | fakeroot 实测 HIT 0.10s（小 fixture）；183MB 拷贝按 NVMe 2GB/s 估 |
| 变更 1-3 文件，仅 A1（无条目缓存） | 键含全闭包 → miss | ~240s（无收益） | 键定义 86258-86259 |
| 变更 1-3 文件，A2 函数体条目缓存 | prescan/collect 仍跑（~14% 相位）+materialize 命中省 ~40%+freeze 省 ~30%+codegen 70s 保留 | **~90-120s** | 采样占比 × 命中率估；codegen 未动 |
| 同上 + B1（BACKEND_JOBS 并行 freeze+codegen） | codegen 70.2→~10-15s、freeze 并行 | **~50-70s** | 理论限 16.8s 为下界；parse 相位串行部分仍存 |
| 同上 + B2（materialize 并行） | 46.3% 摊到 8-14 worker | **~25-40s** | 收敛到理论限 2x 内 |
| A3（per-fn 机器码缓存，可选远期） | codegen 也命中 | **~15-25s** | 需缓存重定位前函数码+patch 表 |

---

## 二、施工设计

### B 线：闭包内并行（14 核天花板）——先做

**B1（零/低代码，0.5-1 代理日）：打开 BACKEND_JOBS 并验守卫**
- 钩子点：烤机命令面加 `BACKEND_JOBS=<8..14>`（开关读点 33106-33111；freeze 24722；
  codegen 102838）。无需改 C 代码。
- 改造面：烤机驱动脚本/命令模板；验收脚本加 RSS 采样（`report_rss_bytes` 已在报告）。
- 步骤：(1) html-csg fixture 阶梯 jobs∈{1,4,8,14} 记 wall+RSS；(2) 全量烤机 jobs=8
  一轮：183MB exe 与 jobs=1 基线逐字节对拍（同名 --out）+ RSS<1GiB；(3) 固定 jobs。
- 风险表：
  | 风险 | 缓解 |
  |---|---|
  | RSS 超 1GiB 守卫 die | 阶梯实测斜率；必要时 jobs=6-8 或申请守卫上浮（需用户拍板，D3 写死 1GiB） |
  | 大闭包下 worker 栈/lease 死锁 | 已有 owner_join/fail_after_drain 面板（101794-101806） |
  | 字节漂移 | 同名对拍轮；漂移即停（serial_oracle 合同 74725） |
- 验收门：字节配对烤机（183MB sha256 与基线同）+ wall 下降实测入档。
- 预期：240s → **~120-150s**（freeze+codegen 并行，materialize 未动）。

**B2（核心工程，3-5 代理日）：materialize 并行**
- 钩子点：101686-101807 既有 import-worker 骨架（`num_import_jobs=1` 钉死处 101691；
  ColdWSDeque/ImportWorkerCtx/cold_import_worker_run 32918；per-worker arena 已建
  101748-101772）+ `cold_worker_lease_reserve(COLD_WORKER_ROLE_IMPORT_BODY)`
  （1615-1707 角色合同）。
- 设计（按 101688 注释的两个前置条件）：
  1. **隔离快照**：每 worker 冷解析器隔离面 = per-worker body arena（已有）+ parser
     scratch 隔离（cold_codegen_scratch_pool/cold_exact_dataflow_workspace 已是
     thread-local 池，33088-33090 release_thread 先例）；
  2. **确定序发布**：保持现 DFS worklist 序为**发布序**——worker 只做「候选 body 的
     parse+lower 到私有暂存」，主线程按 worklist 原序 commit 到共享 body_store；
     特化注册（symbols_add 类副作用）必须在 commit 线程串行重放，row 分配序与串行
     全等。以「row 分配事件流确定」为硬不变量，配 `cold_function_body_store_content_
     fingerprint`（23921）与串行轮对拍。
  3. 分批落地：先并行**无注册副作用**的纯函数体（无 generic/特化），保守准入集 +
     灰度开关（如 `CHENG_IMPORT_PARALLEL=1`），逐步放宽。
- 风险表：
  | 风险 | 等级 | 缓解 |
  |---|---|---|
  | parse 副作用（符号/特化注册）跨线程 | 高 | 副作用函数回主线程串行重放；准入集排除 |
  | row 漂移破坏 BodyIR 引用 | 高 | 发布序=串行序硬不变量 + store 指纹对拍 |
  | shared Symbols 读读并发 ok、读写竞争 | 高 | commit 线程唯一写者；worker 只读已 commit 前缀 |
  | max_active_bodyir_arenas=1 合同 | 中 | worker arena 短命不入 manifest（616-619 先例） |
- 验收门：字节配对烤机 + `BACKEND_JOBS=1` serial oracle 交叉对拍 + html-csg/烤机双 fixture。
- 预期：B1 后 ~130s → **~50-70s**。

### A 线：条目级对象缓存——A1 先行，A2 视 B 线后剩余剖面决策

**A1（低代码，0.5-1 代理日）：任务级缓存存活协议（零变更重跑秒级化）**
- 钩子点：烤机任务脚本设 `CHENG_DISK_GUARD_COLD_CACHE_CAP_KIB=<容量>`（disk_guard.sh:11
  默认 0 即清空）+ 可选 `CHENG_COLD_CACHE_STATS=1`（107464 统计面已有）；
  对拍轮显式 `CHENG_DISABLE_COLD_OBJECT_CACHE=1`（86167）。
- 改造面：仅脚本/协议，C 代码零改。缓存目录沿用 cwd 相对 `artifacts/cold_object_cache`
  （86284）——烤机 cwd=root 时落在树内，任务结束由既有 prune 收走，不违反跨任务禁令
  （cap 归零即本任务内也可控）。
- 协议条款（写进任务纪律）：
  1. 字节配对验收轮禁缓存（防假对拍，lessons:752 + 本线实测复现）；
  2. 迭代轮开缓存仅用于**零变更重跑**与 provider 命中；源变更轮 primary 必 miss，
     不产生假信心；
  3. 缓存命中轮的报告标注 `link_cache=hit`（107466 已打印），与真实编译轮区分入档。
- 风险：缓存被并行 agent 落的陈旧键命中——键含工具链 12 文件+闭包全文件字节
  （86203-86226），陈旧面已覆盖；lessons:284 的遮蔽案发生在指纹机制完善前，现状以
  指纹+对拍轮双保险。
- 预期：零变更重跑 240s → **1-3s**；变更轮无收益（不虚报）。

**A2（大工程，5-8 代理日）：函数体条目缓存（freeze 完成态 BodyIR 落盘）**
- 粒度：函数体（非文件）——文件级 .o 需重构单对象链接模型（对象间符号解析+Mach-O
  多对象归并），与 byte-contract 全链冲突，**不做**（第一性：收益/风险比倒挂）。
- 键（三层校验，任一不符即 miss 回退串行，正确性保全）：
  1. 文件身份：source_row 的 path+文件 sha256；
  2. 函数身份：declaration_origin=(module_source_row, token_byte_offset)（80026-80033
     已是精确身份权威）+ fn 名 + 函数体文本 slice sha；
  3. **符号面指纹**：全闭包 prescan 后的签名/类型/对象面摘要（fn_count+每 fn
     name/arity/kind hash）——「改函数体不动签名面」的迭代轮典型变更必 hit；
     增删符号必 miss（可接受）。特化注册序由符号面指纹兜底校验。
- 产物形态：freeze 完成态 BodyIR 的 SoA 序列化（op/slot/call_arg 数组 + per-body
  frozen 标志）+ restore 时 row 重定向表；内容指纹沿用 cold_body_ir_canonical_hash
  （20186）/cold_function_body_content_fingerprint（23765）。落盘
  `artifacts/cold_object_cache/bodies/<target>/<sha>.bodyir`，容量并入 disk_guard。
- 钩子点：`cold_try_compile_import_function_from_source`（80013）与
  `cold_compile_source_function_direct`（80233 调用点）前置查缓存、后置 store；
  freeze（24629 cold_freeze_body_rewrites）对 restore body 跳过（frozen 标志）。
- 施工顺序依赖：**必须在 B1/B2 落地并重测相位后定稿**（materialize 被并行摊薄后，
  A2 的边际收益需重算；且 A2 的 restore 面要兼容并行发布序）。
- 风险表：
  | 风险 | 等级 | 缓解 |
  |---|---|---|
  | row 重定向遗漏（跨 body 引用） | 高 | restore 后全 store 指纹==串行重编指纹才 publish |
  | freeze 幂等假设破坏 | 中 | 存 freeze 完成态+标志，绝不二次 rewrites |
  | 磁盘膨胀 | 低 | 2GiB LRU 已有（86357），bodies 并入 |
  | 假对拍 | 高 | 同 A1 协议：验收轮禁缓存 |
- 预期：变更迭代轮（与 B 叠加）→ **~25-40s**；零变更走 A1 秒级。

### A3（远期可选，3-4 代理日，暂缓）：per-fn 机器码缓存
- codegen 已 index-order merge+patch rebasing（102816 注释），函数重定位前码+
  patch 表可按 body fingerprint 缓存。收益把 codegen 70s→秒级，但 patch 重放与
  shared-prefix 对齐复杂；待 B2/A2 后按剩余剖面再立项。

---

## 三、排序建议与理由

**B1 → A1 → B2 → (数据) → A2 → (可选) A3**

1. **B1 最先**：零 C 代码、骨架与字节合同全在（实测 BACKEND_JOBS=1/4 同哈希
   bcb9b945 复核通过），半天到一天拿 ~2x，且每轮烤机都受益（缓存在变更轮无收益，
   并行有）。
2. **A1 次之**：纯协议/脚本，把「零变更重跑」从 240s 压到秒级——w 线每轮配对基准
   确认、静默窗口探测都吃这个收益；同时把「验收轮禁缓存」钉成纪律，堵假对拍。
3. **B2 第三**：46.3% 最大单块的并行化，是逼近 14 核理论限 16.8s 的唯一路径；
   骨架已在（101686-101807），核心难点是 row 确定序发布，需要独立灰度开关与
   serial oracle 交叉对拍，故给 3-5 代理日。
4. **A2 缓行、以数据定**：B1/B2 后必须重测相位剖面（同样的 sample 配对窗），
   若 materialize+freeze+codegen 已压到 ~40s 内，A2 的 5-8 代理日可能不划算；
   若迭代轮吞吐仍是瓶颈（烤机轮次频次高），A2 的键/序列化设计本文已备好。
5. 理由一句话：**并行是每一轮都拿的全局收益，缓存只有命中才拿且带假对拍风险面；
   先拿确定收益，再按剩余剖面决定增量投资的落点。**

## 四、验收门（全线统一）

沿用 w29 字节配对烤机协议（VERIFY_w29_append.md）：
- 同树态、同名 `--out`，183MB 产物 sha256 与基线逐字节相等；
- 配对轮 `CHENG_DISABLE_COLD_OBJECT_CACHE=1`；缓存收益单独以
  `CHENG_COLD_CACHE_STATS` 命中轮展示（不混入对拍轮）;
- `CHENG_PROCESS_MAX_RSS_BYTES=1073741824` 守卫全程（D3：1GiB 进程树守卫）；
- GEN2/GEN3 语义：改造前后产物互为字节证据；并行轮加 `BACKEND_JOBS=1` serial
  oracle 交叉对拍（fn_parallel_contract，74725）；
- 秒级门：小 fixture compile=0/run=0（w29 同款 zz_probe 面）。

## 五、本线实验留档（/tmp/oob_ab/optdesign/，只读主树）

- `fakeroot/`：符号链接+真实 fixture 混合根，实测对象缓存 MISS→HIT、字节一致
  （c19e2a09…）、CHENG_CACHE_DIAG 日志面。
- `treerun/`：APFS clone 树（rsync 排除 .git/artifacts），BACKEND_JOBS=1 vs 4
  真编译对拍（22.1s vs 18.5s，sha256 同 bcb9b945…，与 w29 VERIFY 三方一致）；
  含一次意外复现 lessons:752 假对拍（缓存命中 0.28s 同哈希）。
- 实验树用后清理：`rm -rf /tmp/oob_ab/optdesign/fakeroot /tmp/oob_ab/optdesign/treerun`。
