# 纯 Cheng 编译器最小内核方案（总纲）

> 2026-09-06 定稿。本文是「纯 Cheng 最小内核 + 按架构组合的代码生成单元」的**唯一权威总纲**：
> 汇聚结构维度（cheng-minimal-kernel-plan.md）、资源维度（memory-time-limits-plan.md、
> selfhost-resource-plan.md）、闭环路线（pure-cheng-kernel-closure-plan.md）与战役 R 全部实测，
> 现势化到 2026-09-06。历史细节以各分档与战役 VERIFY 为准；本文与分档冲突时以本文为准。
> 数据/所有权/指针/C 冷链维度以 `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md` 为准。
> apply authority：openspec/proposals/pure-cheng-minimal-kernel.md + task_plan.md 战役 R + 本文件。

## 0. 使命

把 Cheng 编译器收敛为**纯 Cheng 最小内核 + 按架构组合的代码生成单元**：驱动能正确编译自己——
768MiB 理论极限进程树守卫内产出连续两代原始字节固定点（GEN2==GEN3），四用户夹具+严格闭包全绿；
C 冷链（cheng_cold.c/cold_parser.c）退出编译路径，降级为 GEN1 种子证据。

## 1. 验收口径（done 的唯一定义）

| # | 口径 | 判据 |
|---|---|---|
| 1 | **GEN2/GEN3** | 内核源集由纯 Cheng 驱动编译：不同 inode、raw cmp+SHA-256 逐字节相等，绑定源码/编译器/工具三方哈希；full_backend_codegen=1、cold_system_link_exec=0；Linux cgroup v2 精确 768MiB + Darwin 原生双口径 |
| 2 | **闭包纯净** | kernel manifest 零 arch 模块；严格门=声明源集对真实可达源零超出（基线 201 core+13 arch 可达，须归零）；kernel 不可达 arch |
| 3 | **组合面** | 本机安装面=内核+恰一插件；每组合真实导入恰一插件；缺件 fail-closed 报 `codegen_plugin_missing=<triple>`，离线无缓存同报，篡改单字节必拒收 |
| 4 | **资源** | 全冷串行 ≤40s、零变更 ≤3s、1/3 文件编辑 ≤10s、ordinary ≤200MiB、完整自举 ≤768MiB 且终态 live=0 |
| 5 | **语言面** | 四夹具 4/4（ordinary 0/0、call_fixture 0/1、cold_nested 0/0、v6 0/0）+ 正式语法探针逐项判决入基线 |

## 2. 不变量（全程铁律）

- **字节铁门**：每刀配对轮产物同名 `--out` sha256 相等；禁缓存口径=显式 `CHENG_DISABLE_COLD_OBJECT_CACHE=1` + 每轮空缓存根（`CHENG_ENTRY_CACHE=0` 不是总闸）。
- **验证强度零减弱、守卫零弱化**；禁降级/兜底/启发式；非法形 hard-fail 不静默（如 str=nil 走门禁+规范迁移）。
- **DOD + Arena + SoA + int32 索引身份**；物理地址只在借用证明后瞬时生成；ZRPC/身份禁走捷径。
- **ZRPC 无指针 + 无 C 冷链**：kernel 闭包零指针类型/操作（平台 provider 边界按 `@abi_internal` 独立审计、基线只减）；C 冷链只产 GEN1，GEN2+ 路径 `cold_system_link_exec=0`、产物 `_cold_` 符号=0。
- **结论绑哈希才成立**：单 smoke/临时仓/未绑定报告不算完成；缺失记 RED/blocked，不得 SKIP 成绿。
- **烤机串行、文件面互斥才可并行**（bake_win 原子锁；锁内只放 owner 文件，非属主禁 rm -rf）。
- **内存守卫 trip 禁抬帽**：正式结论一律默认帽下取数，根因优先。

## 3. 架构

### 3.1 组合模型（已定）

- **D1 编译期组合**：per-triple 产出一个驱动=内核+该架构单元静态链接（manifest 组合）；进程内 dlopen 非目标（击穿 Arena/int32 身份与所有权证明体系，且 fail-fast 前移到构建期）。
- **D2 CSG 链签发**：插件为 capability 交易对象；CID 四元组绑定 source-closure 哈希+编译器哈希+target triple+契约版本；本地构建产物必须产出同构 receipt；离线无缓存 fail-closed。
- **契约**：`codegen_contract.cheng` 是内核↔代码生成单元唯一耦合面；kernel→arch 直接 import 违规即构建失败（ci_gate 常驻）。

### 3.2 面

- **内核面**：dispatch/请求（backend_driver_dispatch_min、compiler_request/runtime）、前端（parser、typed_expr）、中端（ir/*）、后端骨架（lowering_plan、primary_object_plan/emit、regalloc_single_pass、system_link_plan/exec、line_map/debug、backend2 canonical 管线）、取件客户端（backend2_cid）。
- **插件面**：x86_64（5 文件）、aarch64（4）、riscv64（5）、wasm32（后续）；归属表 tools/kernel_plugin_attribution.tsv 精确双向覆盖。
- **组合装配参数面在 .cheng 侧**（composition_manifest.cheng）；冷链无此参数（架构既定：C 只产 GEN1）。

### 3.3 自举阶梯

```
GEN1 = C 冷链烤出的现役驱动（种子，可退役）
 → GEN2 = 驱动自烤（编译自己的 35 条目内核闭包）rc=0 ≤768MiB
 → GEN3 = GEN2 产物再自烤，sha(DRV1)==sha(GEN2) 原始字节固定点
 → manifest 扩容至真实闭包（严格门归零态）后的固定点复验
 → 双口径回执（Linux cgroup v2 + Darwin 原生）→ 原子发布入 cheng-fusion
```

## 4. 现状总账（2026-09-06，逐口径）

### 口径 1：GEN2/GEN3 —— **约 20%**

- parse 代差墙已越（wall152 修复+wall154 parser hunks+PhaseB 合力）：自烤从 78-117s 即死推进到 3398s 仍在推进。
- 768MiB 理论极限墙定谳为**架构性**（原 1GiB 最后防线已废弃）：单遍全量物化活集下限 >768MiB（语义必需活集 terminal 钉在 typedIr 固定点）。逐行 churn 层与 emit 窗四重副本已清（账面），**剩余唯一路线=P1 汇点增量化**（typedIr/profiles/上下文/行池按条目增量消费+释放），前置=wall102 三件（预铸造/row 重映射/isolated snapshot），字节恒等命门=row 分配保序清单（gen2wave_1 已列）。
- 死点演进：320s→3398s（10.6×）；ps-rss 全程未穿原 1GiB 口径；新 768MiB 管理线为当前验收线，footprint 与 ps-rss 背离 ~600MB（macOS 压缩记账，双口径铁则）。
- Linux 守卫基建已验（tools/linux_cgroup_guard.sh + 独立 validator，双轮实测）；Darwin 口径=现役探针。
- 主树现役认证驱动=834ff488（层叠：三补丁+objreg+snap_split+gen2wave_1+gen2wave2_1，每跳配对字节门+全门 rc=0）。

### 口径 2：闭包纯净 —— **约 45%**

- 现值：严格门违规 236→**83**（AB draft 克隆验证：7 死声明修剪+146 扩容；B 名单修正 155→146，9 文件系 system_link_exec.cheng:39→backend2_pipeline 单边误可达归 C6）。
- 130 条间接边全部坍缩到 7 门面 13 切边——有限工程，B8/B9 门面范式成熟。
- backend2 四文件裸 import arch 不在归属表门内=Step1 门盲区（C6 收口即消除）。
- 施工：R2-C-FAMILIES 线在跑（C6 断边→C4→C5→C1→C2/C3）；A+B draft 即插即用（施打前排程=守卫穿后；施打前必须重跑三道门对账）。

### 口径 3：组合面 —— **约 90%**

- ✅ 清单一致性门 rc=0（5/4/5 双向覆盖）；✅ 缺件 `codegen_plugin_missing=<triple>` 逐字对拍；✅ **篡改门+离线门建成并接进 ci_gate**（pickup_tamper_gate 8 腿/pickup_offline_gate 3 腿，触发点冻结 backend2_plugin_cid.cheng:157-165 等）；✅ 取件两臂收口案 A。
- ⏸ 在线→组合→exec_diff 等价臂：BLOCKED（组合装配死同一内存守卫，原 1GiB 口径），守卫穿后复跑（命令在 VERIFY_step2_execdiff_0906）。

### 口径 4：资源 —— **约 25%**

- 车头烤 205-225s（≤40s 目标的前提=P1+条目缓存）；缓存命中 7s（零变更 ≤3s 的前身）；夹具单件 76-96s（99% 曾在快照巨函数——已分解，剩余在相内 store I/O+哈希链，时间刀二期待立项）。
- ordinary 释放点已落（emit 窗四重副本 R1/R2+S1-S4），收益实测待 GEN2 口径解锁。
- 自举 ≤768MiB：车头口径树峰 966-998MB **未达新管理线**，待 P1 条目化；自烤口径见口径 1。
- 终态 live=0：毒化网/quarantine 在位，terminal 账本属 P1 后验收。

### 口径 5：语言面 —— **约 50%**

- 四夹具 4/4 ✅ + **19 探针全部判决入基线棘轮**（7 绿 12 红带逐字判决+真实 rc，gate 机器把守）。
- 12 红缺口施工元组在案（VERIFY_phaseb_recensus_append §五）：`..<` for-range（13.5k hits）、W2 预绑通杀墙 break/continue/defer（5.4k）、seq FieldGet 布局权威（连坐数组+.len 族 42k）、when/block（一件修两红）、match else、generic[T]、closure（typed 结构值 case=12）、try/except（唯一需 EH 新 op）、sizeof 实参形。
- PHASEB-PARSER 线在攻 W2+match；bc3 挖出 242 行未合入先行实现已归档待其裁决（audit_bc3.patch）。

### 口径 6：ZRPC/数据/所有权 —— **约 15%**

- kernel 闭包 260 文件；`tools/zrpc_kernel_gate.py` 实测 977 行指针/内存 API：
  kernel_core 319 + shared_format 28（`--require-zero-kernel-core` RED=347）、
  provider 626、plugin 2、other 2；C 冷链源码引用 9（`--no-cold` RED）；
  `artifacts/bootstrap/cheng.stage3` `_cold_` 符号 1,795。
- 资产：`phase_arena`/`compiler_dense_store` 已 SoA/Arena 化；`lifetime_ledger` 独立；
  `body_ir_lifecycle` 242 处 `cheng_seq_free` 待迁 ORC drop；
  `ownership/borrow_checker/borrow_ir` 未接生产 lowering/codegen。
- 施工方案与 Z0-Z8 见 `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md`；
  当前不宣称完成。

## 5. 路线墓碑（已判死，防回头）

| 判死项 | 定谳 | 证据 |
|---|---|---|
| 波次编译骨架 | 波界无 terminal 死产物（import 全量注册表+typedIr 固定点钉终态）；波次释放=P1 本体 | VERIFY_gen2wave_1 |
| 逐行 churn 层续切 | Owned 化石已删、读视图已尽，此层再切无收益 | VERIFY_gen2wave2_1 |
| 冷链 admission memo | 已平移 .cheng 侧落地（exact-def 三刀）；C 链版冻结 | VERIFY_phasec_stage2/time_exactmemo |
| 冷链 materialize 并行 | 骨架在烤机路径死代码（reachable_only=1 短路）；真前提=wall102 三项 | VERIFY_phasec_stage2 |
| 机制级内存减压（PressureRelief） | vmmap 归还真实生效但活产物主导，死点不动 | VERIFY_gen2_w1 |
| mmap-slab（T1） | 已证伪 | 编译器 RSS 战役档 |
| Fill 主族物理迁出（B6c） | 165 共享中立符号强迁不可行；留内核经门面消费 | kernel-split-blueprint §7 |
| dlopen 进程内装载（D1） | 非目标 | cheng-minimal-kernel-plan D1 |
| W4≈98MB/W5≈170MB 估算 | 作废（KB-MB 级/早已放/零绑定）；实测最大=emit 窗四重副本（已落 R1/R2） | VERIFY_phasec_batch2 |
| .cheng 侧 mutation-epoch | 非必需（验证族密封体单遍） | VERIFY_time_exactmemo |
| 内存守卫抬帽 | 用户裁决禁抬帽，根因优先 | lessons.md 8/31 |

## 6. 现行施工战线（live）

| 线 | 口径 | 领地 | 交付节奏 |
|---|---|---|---|
| GEN2-P1 | 1 | typed_expr/compiler_csg/system_link_exec（parser 域零接触） | 两段：设计（汇点清单+row 重映射+字节恒等论证）→ 首个可证增量切面 |
| PHASEB-PARSER | 5 | parser.cheng/compiler_parser_receipt | W2 预绑墙+match 翻绿（含 bc3 先行工作裁决） |
| R2-C-FAMILIES | 2 | backend2/backend 门面+归属表 | C6 断边→C4→C5→C1→C2/C3，每族 checkpoint |

收割协议：每 checkpoint 亲验（patch 文件面+roundtrip+门禁表）→ 合入主树 → 配对烤机 ×2 + 全门认证（四夹具+19 探针棘轮）→ VERIFY 追加合入节。

## 7. 剩余工作分解（做完一项划一项）

**A. GEN2 rc=0（关键路径，口径 1/4）**
- GEN2-P1 两段交付；字节铁门=增量化产物与全局累积版逐字节恒等。
- done：gen2 rc=0 ≤768MiB（双口径记录）；止损=交精确边界图+realizer 演进需求清单。

**B. GEN3 固定点（口径 1，rc=0 即刻串）**
- GEN2 产物自烤第二轮 → sha(DRV1)==sha(GEN2) → 三方哈希绑定回执。

**C. 严格门归零（口径 2）**
- C 族收编落地（在跑）→ A+B 手术施打（守卫穿后；施打前重跑三道门）→ 严格门残余 83→0 → kernel manifest 对真实闭包零超出。

**D. Step2 收口 + Step4 在线臂（口径 3）**
- 组合装配复跑（build_plugin_driver + exec_diff 全集）→ 在线取件臂接进 pickup 门。

**E. 语言面 12 红（口径 5）**
- 按普查排序垂直切片：for-range → seq FieldGet → when/block → generic/closure/sizeof（typed/csg 域，待攻坚线让出）→ try/except（EH op）。每件=探针翻绿+基线行刷新。

**F. 资源四指标（口径 4）**
- P1 落地后：条目缓存平移（零变更 ≤3s/1/3 编辑 ≤10s）、store I/O 时间刀（≤40s）、ordinary 口径复测（≤200MiB）、terminal live=0 账本。

**G. R5 发布（前置=A-E）**
- 双口径正式回执（Linux cgroup v2 + Darwin 原生）→ publisher/CI → cheng-fusion 原子落仓 → OpenSpec archive → 本文档逐步打勾。

**H. ZRPC/DoD/SoA/Arena/ORC 收敛（方案见 `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md` §5 Z0-Z8）**
- Z0 gate/基线冻结 → Z1 SoA 表收口 → Z2 Arena handle → Z3 kernel_core 指针清零 →
  Z4 shared_format/plugin → Z5 platform provider 边界 → Z6 ORC 生产接线 →
  Z7 C 冷链退出 → Z8 发布。
- done：`zrpc_kernel_gate.py --require-zero-kernel-core`/`--require-zero-closure`/`--no-cold`
  三绿；ORC `alloc==free`/`live=0`；GEN2==GEN3 + `_cold_`=0 + `cold_system_link_exec=0`。

## 8. 风险登记

| 风险 | 概率 | 缓解 |
|---|---|---|
| P1 row 重映射撞 realizer 现限制（已知两处：call var projection root / native sequence mutation predecessor） | 中 | 止损条款：交边界图+realizer 演进需求单列立项，不硬改 |
| manifest 扩容 37→~201 后烤机闭包变大出新墙 | 高 | 排程后置（守卫穿后）；扩容前重跑三道门对账 |
| footprint 环境放大因子污染测量 | 中 | 双口径铁则+趋势判读+静默窗口 |
| 并行线 merge 冲突 | 中 | 文件面互斥+patch 队列+hunk 级对位 |
| 墙后未知墙（阶梯本质） | 高 | 逐墙 checkpoint+毒化网+常驻回归门 |

## 9. 文档地图

| 文档 | 维度 |
|---|---|
| 本文 | 总纲（现势权威） |
| docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md | 数据/所有权/指针/C 冷链维度（Z0-Z8，ZRPC/无 cold 门禁） |
| docs/cheng-minimal-kernel-plan.md | 结构维度（Step0-5 详档，含 Step0 归属/冷生物处置/自举固定点距离史） |
| docs/memory-time-limits-plan.md | 资源维度总口径 + P1 冷链桥接缓存 |
| docs/selfhost-resource-plan.md | 纯 Cheng 自宿主资源方案现势版 |
| docs/pure-cheng-kernel-closure-plan.md | Phase A-F 闭环路线（9/3 版，Phase A 已由本文口径 5 吸收） |
| docs/campaigns/2026-08-31-kernel-userpath/ | 战役档案：VERIFY_*.md 全部回执、patches/ 补丁队列、selfhost_o2_census.md、r2_closure_ops_map.md、fixtures/ 探针 |
| task_plan.md 战役 R | R0-R5 分片执行账 |
