# 全局路线图（global roadmap）

> 定位：跨主线导航（非规范）。**现状数字一律以 gate/report 输出为准**（`tools/ci_gate.sh` / `run-production-regression` / `tools/cold_csg_roundtrip_test.sh` / `tools/k_census.sh`），本文不固化易腐数字，只固化**结构、依赖、判据**。
> 三层权威：规范 `docs/cheng-formal-spec.md` > 实现状态 `docs/cheng-implementation-status.md` > 本导航 + `docs/cheng-plan-full.md`。

> **⚠️ 阶段编号校正（权威源 = `openspec/proposals/cheng-v2-in-place-refactor.md`，8 决议 ↔ 阶段1→2→3→4 主线 + 阶段5/6 伴随线）：** 本文初稿沿用 findings.md 把「阶段1」当成内存收敛战役——**误标**。权威 OpenSpec 总纲明定：
> - **阶段1 = 表达式求值器换文本解析（删文本，最大头）。** done 判据 = `ScalarValueSlotForText`/`CallScalarValueSlotForText`/`ContextScalarValueSlotForText`/`FindTopLevelBinOpTokenLast` 等文本 helper 调用点清零并删除 + wcz 模块测试 < 50。启动基线 2026-06-11：拦路面 lowering_plan 529 / compiler_csg 422。
> - **内存/PhaseArena（26x gap）= 阶段5（伴随线·性能与并行）**，不是阶段1。
> - 阶段2 = 发射单遍 + label 回填；阶段3 = 单态化+诊断列表+verifier；阶段4 = 种子由构建产出（cheng_cold.c 退役 = 真 zero-C 第二支柱）；阶段6 = CSG 事实层。
>
> **据此重映射：本文「路线 A（zero-C 纯路径 0-fallback + 删文本分支）」才是权威阶段1；「路线 B（内存 26x gap）」是阶段5。本会话 11 修 = 阶段1（route A）的真实进度，不是题外话。** 下文凡称「阶段1=内存收敛」处一律读作「阶段5」。

---

## 0. 结论先行（一句话）

从「删文本路径(wcz/gaps→0)」到「纯 Cheng 自举(zero-C)」不是一条线性阶段链，而是**三条切面 + 一个共享根 blocker**收敛到同一个终态。**我们现在在「阶段1（内存收敛）进行中 + zero-C 纯路径覆盖进行中」**，两者都**未 done**，且都卡在**同一个前端弱点：typed_expr 跨模块 struct layout 注册**。`build-backend-driver` 早已 `EXIT=0`，但那是 **cold runtime fallback 兜底**出来的假绿——真 zero-C 离达成还差 (a) 纯路径 0-fallback（已连修 11 个家族，剩 2 个诊断清楚的家族）+ (b) 替换 cold parser/runtime（未启动）。

---

## 1. 主线流程图（需求 → 终态）

```
原始需求：删文本路径 (NODE_EVAL_ONLY oracle 收敛)
   真红线 = wcz=0（零词函数归零），gaps 只是宽集 proxy
        │
        │  目标：让 Cheng 后端 lowering 不再靠 stmtShape 文本特判
        │        真实自举语料上不落 cold emit 回退
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 地基层：自举不动点 e202c0c35424eb36（seed→S1→S2→S3 已确认）          │  ✅ DONE
│  — 但 cold C 仍作为 legacy runtime 链入所有 stage（非 zero-C）        │
└─────────────────────────────────────────────────────────────────────┘
        │
        ├──────────────┬──────────────────────┬─────────────────────────┐
        ▼              ▼                      ▼                         ▼
   切面① K-plan    切面② v2阶段1          切面③ 本会话 zero-C      （共享根 blocker）
   删文本路径       内存 26x gap 收敛       纯路径 0-fallback 覆盖    typed_expr
   wcz→0           (lowering 峰值/Arena)   逐个消 first_missing      跨模块 struct
   17 文本分支     exprLayer 双份→move     /first_zero 家族          layout 注册
   全部待删        + 理论RSS口径           已修 11 族，剩 2 族       ★ 三切面共根
        │              │                      │                         │
        │  [都是"删 cold 后端emit退路"的不同切面，不是并行无关线]       │
        └──────────────┴──────────┬───────────┴─────────────────────────┘
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │ 卡口①：通用 TypedStmt → BodyIR CFG → primary/direct emit  │  进行中
        │  覆盖 var/let、if/guard、for、字符串/数组局部值、          │  (cheng-plan L28
        │  Result/Value 调用参数与多路 return-call                  │   = "下一闭环")
        └──────────────────────────────────────────────────────────┘
                                   │
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │ 卡口②：阶段5 PhaseArena / 阶段间 payload reset            │  未开始
        │  （CSG/lowering/primary 阶段结构共存、分配器不还页         │   = 26x 内存 gap 主体
        │    → 实测峰值 8.05GB ≈ 各阶段 retained 之和，非单阶段）    │   阻塞阶段1 真 done
        └──────────────────────────────────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                          ▼
   ┌─────────────────────┐                  ┌──────────────────────────┐
   │ 里程碑 M1：          │                  │ 里程碑 M2：              │
   │ 纯路径 0-fallback    │                  │ 阶段1 done               │
   │ dispatch_min         │                  │ (内存 26x gap 闭合 +     │
   │ --emit:obj rc=0      │                  │  Darwin lane 实测校准)   │
   │ (无 cold provider)   │                  │                          │
   └─────────────────────┘                  └──────────────────────────┘
              │                                          │
              └────────────────────┬─────────────────────┘
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │ 里程碑 M3：替换 cold parser / runtime                     │  未开始
        │  cheng_cold.c 退役/冻结，stage0 换最小 CSG reader/解释器   │   = 真 zero-C 第二支柱
        └──────────────────────────────────────────────────────────┘
                                   │
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │ 终态：真 zero-C 纯 Cheng 自举                             │
        │  纯路径 0-fallback + 仓库只剩一套语言实现                  │
        │  cold C 降级为最小 CSG reader/emitter（或彻底移除）        │
        └──────────────────────────────────────────────────────────┘
                                   │
                                   ▼   （地基稳后才解锁的远景主线，全部依赖上面卡口①②）
   ┌────────────────────────────────────────────────────────────────────┐
   │ 远景并行主线（本文主线二~七，非阶段制）：                    │
   │  · cold/CSG 后端管线收口（csg_core → csg_dialect → csg_abi）   │
   │  · CSG-Web（unsupported 归零）                                      │
   │  · 性能与并行（Dense IR/SoA/PhaseArena/NoAlias/E-Graph/函数级 ws）  │
   │  · 语言语义收口（moveHint→CFG liveness，提案态需用户确认）         │
   │  · 原生力学/游戏 Runtime（卡 object/fixed-array/string/bytes lower）│
   └────────────────────────────────────────────────────────────────────┘
```

---

## 2. 当前真实位置：「我们在哪」

**我们在：地基层 ✅ 已稳；卡口①（通用 emit 降级）+ 三切面 进行中；卡口②（PhaseArena）未开始。**

### 三个框架的关系（核心澄清：同一目标的三个切面，不是三条并行无关线）

| 切面 | 它消除的"退路" | 现状 | 与其他切面的耦合 |
|---|---|---|---|
| **① K-plan 删文本路径**（wcz→0） | "Cheng 后端落 cold emit"退路 | 进行中。wcz 大幅下降（376→~74 区间，以 census 为准），17 个文本路径子系统**全部 deletableNow=false，一个都没删** | 与③同根：文本特判要被通用 node path 接管，正是卡口① |
| **② v2 阶段1 内存收敛**（26x gap） | （不是删退路，是降资源）lowering 峰值瞬时双份 + 阶段间不释放 | 进行中。**只交付了 exprLayer clone→move（安全收敛）**；gap 主体在阶段5 PhaseArena，未闭合 | 弱耦合③；强依赖卡口②（PhaseArena） |
| **③ 本会话 zero-C 纯路径覆盖**（0-fallback） | "纯路径发不出 → 静默回退 cold runtime provider"退路 | 进行中。已连修 11 个 correctness/miscompile/perf 家族（落 main，三门验证），剩 **2 个诊断清楚的 blocker 家族** | 与①同根（卡口①）；A1 blocker 与 perf-C 同根 |

**判定：三者是同一终态（删 cold 依赖）的不同切面，共享同一个根 blocker** = `typed_expr.cheng` 跨模块 struct layout 注册。
- ① 要删文本分支，必须通用 node path 能接管 → 卡口①。
- ③ 的 blocker A1（零参 struct 构造被误当 call、count=0 never-registered）真根因 = `typed_expr.cheng:11674` 跨模块字段上下文解析不出 struct layout → size=0 → 守卫丢弃。
- perf 真热路径（path normalize 40% + reachable 13%）虽是另一处，但 A1 的"跨模块字段上下文解析退化"与 perf 同属 typed_expr 前端弱点。
- ② 的 lowering 峰值也发生在同一管线，但其 gap 主体（阶段间不释放）独立于①③，落在卡口②。

### 已 done 并验证（地基 + 单点修复）

- ✅ **自举不动点 `e202c0c35424eb36`**：seed→S1→S2→S3 确认，贯穿全程的免费最强预言机。
- ✅ **字数 predictor desync 根治**：大帧族 + 残余硬编码族全 ceiling-aware（逐 op 双发审计 desync=0，corpus 127/127 字节级零回归）。commits `314209302` / `1de40fa62`。
- ✅ **11 个纯路径覆盖修**（correctness/miscompile/perf，落 main，三门全过）：含 FieldLoad/Store 大偏移 udf#0、符号表双登记去重、call functionNames-fallback、零参聚合 zeroinit、ErrorMessage 可达性、`g.field[i]` O(N)→O(1) 地址算术、IndexGet 跨模块退化截断（后端是物理布局权威）。
- ✅ **v2 阶段1 Lane A**：exprLayer clone→move（消 lowering 峰值瞬时双份），本 VM 编进 driver、EXIT=0、定点不变、ci_gate 10/10。
- ✅ **v2 阶段1 Lane B**：assign 三元真分支（`x = cond ? a : f()` 急切求值 miscompile 根除），obj wcz=0/invalidop=0，加反测。
- ✅ **cold_csg 阶段 0-7**：facts 格式固化、roundtrip 1106/1106、provider archive 多 member/export、linkerless exe。
- ✅ **perf 门禁脚本 H**：PASS（exe 模式 + ordinary fixture）。**注意：这不是最终交付**——self obj 三次中位数反超仍卡在下面的 blocker。
- ✅ **三门工具链**：`exec_diff`（归因=0 强制门）、`ci_gate` 10/10、不动点 gate。

### 进行中（有 blocker，未 done）

- 🔵 **K-plan**：wcz 持续下降但 17 文本分支全未删（最接近 #17 Fmt 差 ~5 条）；no_node 前端缺口（5-6 个独立活：local_decl 非标量 / 控制流条件 / call+if_call / assign / return）未补。
- 🔵 **zero-C 纯路径**：剩 2 个家族（见下"剩余工作"M1）。
- 🔵 **v2 阶段1 内存**：只交付 exprLayer move，26x gap 主体（PhaseArena）未动。
- 🔵 **cold_csg 阶段 8-9**：完整 PrimaryObjectPlan 管线未往返；纯 direct backend driver 卡 `os.cheng_fopen/fflush/c_iometer_call` 未解析 patch。阶段 9"删 cold 前端"必须 fixed-point 通过后才允许。

### 未开始

- ⚪ **卡口② PhaseArena / 阶段间 payload reset**（阶段5）——26x 内存 gap 主体。
- ⚪ **M3 替换 cold parser/runtime**（真 zero-C 第二支柱）——A 完成后才够得着。
- ⚪ **远景主线**：CSG-Web、函数级并行默认化（perf witness 唯一标"待实现"原子项）、语义收口（提案态需用户确认）、物理/游戏 Runtime（卡 object/fixed-array/string/bytes lowering）。

---

## 3. 「阶段1 done」判据：定义 + 当前差什么

### 文档定义的阶段1（澄清：不存在线性"阶段1..N"命名）

`docs/cheng-plan-full.md` 是架构蓝图 + 任务矩阵，**没有"阶段1/2/.../N"项目级里程碑命名**（"阶段1/2/3"在那里仅指自举编译管线内部三遍扫描）。**当前实际语境里的"阶段1" = v2 内存收敛战役**（findings.md 头部 2026-06-24 三 lane），其 done = **26x 内存 gap 闭合**。

### 阶段1 done 的真实判据（findings 自己定义）

1. **26x 内存 gap 主体闭合**：实测纯 Cheng 自编译峰值 RSS 从 ~8GB 降到接近理论（dry-compile budget 量级），核心在阶段5 PhaseArena / 阶段间 payload reset。
2. **Darwin-arm64 canonical lane 实测校准**：`full_compile_theory_*` 的 `validation_status` 从 `unvalidated` → `validated`（真实 `system-link-exec` 报告在 Darwin lane 干净跑完一次）。
3. **门禁 + RUN 反测在 canonical lane 复跑**：ci_gate / ABI fuzz / exec_diff RUN / wcz census。

### 当前差什么（诚实：findings 三处显式"不宣称阶段1 done"）

- ❌ **gap 主体未闭合**：只交付了 exprLayer 瞬时双份（安全收敛，单点），不是阶段间不释放这个主体——主体属**卡口②（阶段5 PhaseArena）**，阶段1 单独无法 done。
- ❌ **验收 lane 不具备**：当前 x86_64 cloud VM 不是 canonical lane（不在 `BackendDriverDispatchMinIsTargetSupported` 表内，缺 `backend_driver/cheng` + `bootstrap/cheng.stage3`），无法本机实测峰值 RSS / 跑门禁 RUN。
- ❌ **理论模型全 unvalidated**：`full_compile_theory_*` 从未在真实干净跑通的路径上校准过。

**一句话：阶段1 done 卡在卡口②（PhaseArena），且任何 done 宣称都必须在 Darwin-arm64 canonical lane 实测，本 VM 给不出。**

---

## 4. zero-C 真相对齐（放进路线图终段）

### 假绿 vs 真信号

- ❌ **错框架**：`build-backend-driver --require-rebuild` 一直 `EXIT=0`、`missing=0` ≠ zero-C 达成。改前/改后/HEAD~1 全 EXIT=0，**靠 system-link-exec 对纯路径发不出的函数静默回退 cold runtime provider**（emit 日志 `scope=cold_runtime_provider_system_link`）。自重建从没硬失败，是 fallback 兜着。
- ✅ **真信号**：`dispatch_min --emit:obj` **纯路径** rc=2 的 `first_missing` / `first_zero` 逐个消除。
- ✅ **真 zero-C 定义**（CLAUDE.md §5）= **(a) 纯路径 0-fallback** + **(b) 替换 cold parser/runtime**。

### 真 zero-C 还差什么

**(a) 纯路径 0-fallback**：已连修 11→13 个家族（落 main，三门验证）。

> **⚠️ 剩余家族订正（本会话实测推翻初稿的"11674 size=0 共享根"）：** 初稿沿用旧 memory 说共享根 = `typed_expr.cheng:11674` size=0。**实测推翻：11674 layout 实测 656B 正常，不是 size=0。** 原以为的两个 blocker 已各自归位：
> - **call 解析头部（零参 struct 构造误当 call）= 已修 `90a83652c`**：真根因不是 layout，是 body-IR 调用序列 reloc 循环缺聚合构造器短路（零参 `Type()` 被当真 call 发进 callSequence），补短路即解，与 11674 layout 无关。
> - **真正的跨模块共享根 = `typed_expr.cheng:11838` 的 size=4 退化兜底**（`if !TypedExprContextHasTypeField: sizeBytes=4`）：对内嵌大结构体（`PrimaryObjectIrFunction` 含 `coreir.BodyIR`）的**元素**布局，前端退化返 4、后端真 272 → 不一致。已修 `6eb7a97c3`（#nev25304 IndexGet 读宽 272B 截断）。**修法 = 后端读真 shape（`idxElemStride`），不改前端退化**（后端是物理布局权威，避免级联破坏所有前向声明/跨模块 TypeLayout 调用点）。
>
> **实测剩余规模（wknvqn970，三信号交叉估）：只有 ~120 函数走纯 BodyIR 路径、去重 30 个，真 gap 只在其中。剩 ~10-20 个零字 gap、归并 ~3-5 个族：**
> 1. **族 A（最大最活跃）= 聚合 seq 元素按值作 call-arg**（`loweringParallelResults[i]` 传 `PrimaryObjectIrFunction`，reason-44，`PrimaryBodyIrIndexedMemberAggregateValueSlot`@13583 对模块全局 seq 大聚合元素返 -1）。与 #nev25304 同根（11838 退化），~3-6 处可批量。**正在攻（workflow）。**
> 2. **族 B = 聚合按值 ABI 边角**（sret/间接 ABI，reason 47/48）。
> 3. **族 C = 杂族**（str 三元 805 / ptr-deref 713/715 / cast 803），零散非批量。
> 4. **zero-word 家族（OpSizeAtRaw 漏网臂返 0）**：`CHENG_PRIMARY_OBJECT_FAIL_TRACE=1` 钉死 → 对应臂镜像 emit 实发字数（对称，绝不 return 1 占位会炸 buffer_size_desync）。

**(b) 替换 cold parser/runtime**（CLAUDE.md 真 zero-C 第二支柱，A 完成后才够得着，**未启动**）：cheng_cold.c 退役/冻结，stage0 换最小 CSG reader/解释器，仓库只剩一套语言实现。对应 cold_csg 阶段 9（必须 fixed-point 通过后才允许删 cold 前端）。

---

## 5. 剩余工作分解（到「阶段1 done」与「真 zero-C」各需哪些里程碑）

### 路线 A：到「真 zero-C」（纯后端自洽）

| 里程碑 | 内容 | 依赖 | 工作量粗估 |
|---|---|---|---|
| **M1** 纯路径 0-fallback | 消 2 个剩余家族：① 跨模块 struct layout 注册（typed_expr，解锁 call-head + K-plan 文本分支 + perf 同根）② 18 个 zero-word op 镜像 OpSizeAtRaw | 卡口①（通用 emit 降级） | M（1-2 周），① 是关键路径 |
| **M1.5** K-plan 文本分支首删 | M1 让通用 node path 接管后，某 kind wcz 全局清零即删该文本分支（17 个，oracle 兜底防回归；从最接近的 #17 Fmt 起） | M1 | 增量，逐 kind |
| **M2-csg** cold_csg 阶段 8-9 | 完整 PrimaryObjectPlan 管线往返 + 纯 direct driver 解 `cheng_fopen/fflush/c_iometer_call` patch | M1（纯路径稳） | M |
| **M3** 替换 cold parser/runtime | cheng_cold.c 冻结退役，stage0 换最小 CSG reader/解释器 | M1 + M2-csg + fixed-point 通过 | L（多会话战役） |
| **终态** 真 zero-C | 纯路径 0-fallback + 仓库只剩一套语言实现 | M1+M2-csg+M3 | — |

### 路线 B：到「阶段1 done」（内存 26x gap 闭合）

| 里程碑 | 内容 | 依赖 | 工作量粗估 |
|---|---|---|---|
| **P1**（已 done）exprLayer move | 消 lowering 峰值瞬时双份 | — | ✅ 已落地 |
| **P2** 卡口② PhaseArena | 阶段间 payload reset，CSG/lowering/primary 阶段结构不再共存、分配器还页 | 阶段5 设计 | **L（gap 主体，阶段1 真 done 在此）** |
| **P3** Darwin lane 校准 | 真实 system-link-exec 干净跑完一次，`full_compile_theory_*` validation_status → validated | P2 + Darwin canonical lane(artifact 齐) | M |
| **阶段1 done** | 26x gap 实测闭合 + 校准 + 门禁/RUN 在 Darwin 复跑 | P2+P3 | — |

### 粗排序（关键路径优先）

1. **M1①（跨模块 struct layout 注册）** ← 最高杠杆：同时解锁 zero-C call-head、K-plan 删文本分支、缓解 perf-C 同根弱点。**先做这个。**
2. **M1②（18 个 zero-word op 镜像）** ← 与 M1① 并行可做（只读诊断可并行）。
3. **P2（PhaseArena）** ← 阶段1 done 的唯一主体，独立于 M1，可与 M1 并行推进（不同子系统）。
4. M1.5 / M2-csg ← 跟在 M1 后。
5. **M3 + P3** ← 收尾，依赖前面全绿 + Darwin lane。

---

## 6. 硬约束 / 铁律（推进时必须遵守）

- **生产编译器 = `artifacts/bootstrap/cheng.stage3`（无 regalloc）**；driver（含 regalloc）纯节点后端有 gap → **M1 是解锁 driver 转生产的前置**。
- **后端是物理布局权威**：跨模块退化**不改前端改后端读宽**（`6eb7a97c3` 立的原则）；**禁**硬编 size、**禁**从 callTargets 删函数、**禁** return 1 占位（炸 buffer_size_desync）。
- **no-fallback 红线**：cold runtime provider fallback 是假绿来源，真信号只认 `dispatch_min --emit:obj` 纯路径 rc。
- **并行致命**：blocker 共享 stage0 种子 + exec_diff 装-验-还原到同一 `artifacts/backend_driver/cheng`，**并发 build-verify 会 corrupt**（worktree 隔离也不行，种子 gitignored 不复制）。**只读诊断可并行，build-verify 必串行**；多会话 commit-protect（改完立即提交）是唯一保命法。
- **perf 诊断必须 sample 优先**：代码阅读猜 O(n²) 已两次都错；真热路径 = path normalize 40% + reachable 13%（非 regalloc / 非 typed_expr metadata / 非 Fmt）。
- **canonical 验收 lane = Darwin-arm64**：x86_64 cloud VM 只能交付改动 + 静态/编译/定点/门禁(理论比值)/obj 证据，全门禁与 RUN 反测须 Darwin 复跑。
- **现状数字不固化**：跑 `tools/ci_gate.sh` / `run-production-regression` / `tools/cold_csg_roundtrip_test.sh` / `tools/k_census.sh` 取权威值。

---

## 7. 相关文件索引

- 本图 ← 本文（7 主线）+ `docs/cheng-plan-full.md`（架构/矩阵）+ `findings.md`（实测时间线）+ `task_plan.md`（任务账本）
- K-plan / B深：`docs/beat-c.md §4` §A + `findings.md`（原 k_*  inventory 已合卷）
- cold_csg：`docs/cold_csg_plan.md`
- 核心改动面：`src/core/frontend/typed_expr.cheng`（★ 共享根 blocker，:11674 跨模块字段上下文）、`src/core/backend/lowering_plan.cheng`（:4298 exprLayer move）+ `primary_object_plan.cheng`、`bootstrap/cheng_cold.c`（cold csg / 待退役）
- 工具门：`tools/k_census.sh` / `tools/exec_diff.sh` / `tools/ir_miscompile_perf_gate.sh` / `tools/cold_csg_roundtrip_test.sh` / `tools/ci_gate.sh` / `tools/pure_cheng_perf_gate.sh`
- 反测：`src/tests/exec_diff_corpus/assign_ternary_call.cheng`

> 本全局路线图已吸收原 `docs/roadmap.md`（跨主线导航精简版）。两份路线图主题完全重叠，以本文为权威；`roadmap.md` 已删除。
