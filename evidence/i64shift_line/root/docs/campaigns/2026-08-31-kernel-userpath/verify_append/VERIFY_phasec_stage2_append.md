# VERIFY_phasec_stage2_append —— [PhaseC-stage2] 时间极限双刀（materialize 并行 + memo/条目缓存平移）

date_utc=2026-09-05 · 代理=PhaseC-stage2 线 · 克隆=/Users/lbcheng/cheng-f24/anchor_clones/l3b2（HEAD=73debaef2 + [phaseC-l3b2] 四文件工作区 hunks 原样保留，未触碰）· 主树零接触 · 全程未 git commit · 烤机车头=C 冷链编译器（bootstrap/cheng_cold.c cc 重编，30s 迭代通道）· manifest=/tmp/oob_ab/w139/kernel_manifest_head_git.cheng（35 条目）· 口径=全冷禁缓存（CHENG_DISABLE_COLD_OBJECT_CACHE=1 + 空任务缓存根）

## 结论先行

**基线复现 264s/274s 双轮、产物 sha 四连逐字节相等（4133c3f0…）后定谳：C 链车头烤机的 50–70s 理论目标在当前单对象+reachable_only 管线结构上不可达，两刀均撞结构性边界，按任务书止损条款停手完整移交。** 移交核心=本轮拿到的第一份 primary 编译逐相权威账本（探针实测）：prescan 2.0s / entry parse 3.1s / **admission 段（materialize fixed-point + freeze 契约准入）184.6s（72%）** / codegen 66.5s（BACKEND_JOBS=8 已并行）/ emit 0.2s。三大块（materialize ~145s、freeze 准入 ~40s、codegen 包围段 ~59s）各自需要架构级前置，无一处是 2 刀级改动可吃。字节铁门全程零破坏（所有轮次产物 sha 与基线逐字节一致），四夹具 functional A/B 8/8 逐项一致全绿。交付 patch（+69/−4，全部为相位诊断探针、骨架 env 化与 stderr 落盘修复，默认语义零变化，sha 四连 EQ 背书）。

## 一、结构性事实（本轮新证，全部可复跑）

1. **烤机 primary 编译走 to_object 且 reachable_only=1**（探针实测 `skeleton_gate export_roots=0 reachable_only=1 imports=289`）：system-link-exec 的 primary 调用点（cheng_cold.c:115607 等）因 provider_objects 非空恒传 reachable_entry_only=true。
2. **既有 materialize 并行骨架（per-worker arena + lease + wsdeque + recovery，103416 块）在烤机路径上是死代码**：其 gate `!has_export_roots && !reachable_only && …` 被 reachable_only=1 短路；烤机 materialize 实际走 103859–103865 的第二套 materialize_roots fixed-point 循环，该循环无任何并行骨架。任务书「worker 隔离前提成立」的前提在该路径上不成立。
3. **wall102 三墙复核在位**：materialize 期间泛型特化铸造（symbols_add_fn 分配序=parse 序）、冷解析器全局（ColdErrorRecoveryEnabled/ColdStrictImportBodyUnresolvedHit/ColdScopeDirectImports）写点未变、fork COW 不成立；骨架注释原样保留「Parsing still mutates shared Symbols, BodyStore, arena and file-scoped parser context. Keep this path serial until each worker owns an isolated snapshot and publication is deterministic.」
4. **materialize/准入的热点不是 parse 语法，是 cold_exact_* 权威校验族**（sample 实测占比 ~57%）：cold_exact_var_projection_definition_valid ↔ cold_exact_call_var_out_definition_valid(_impl) 互递归 + O(span) sole-lineage 扫描 + cold_bodyir_exact_identity_schema_valid（freeze 准入段同族）。这些谓词是历次墙的验证层，热点在 body 可变窗口内，memo 化需 mutation-epoch 失效机制=符号身份层架构级改动（验证零弱化红线内不可轻动）。

## 二、两刀处置

### 刀 1：materialize 相并行 → 停手移交（结构性不可行已实证）

- 实验链（4 个车头二进制，全部 cc 秒级重编）：v2/v3 相位探针 → num_import_jobs 接 BACKEND_JOBS（骨架 env 化）→ bootstrap bridge child_env 白名单透传修复（BACKEND_JOBS/CHENG_COLD_PHASE_DIAG 达到 fork+exec 子进程；wall154 领地零接触）。
- 实测：r2/r2b/r3/r4 四轮 worker 池形态烤机全部零加速（264–293s vs 基线 264/274s）且 sha 四连 EQ——因为骨架 gate 被 reachable_only=1 短路，worker 池从未启动（最终由 r4 stderr 落盘修复后的 skeleton_gate 探针行钉死）。
- 结论：materialize 并行的真前提=(a) 确定性预铸造免铸造化 parse、(b) row 空间显式重映射、(c) isolated snapshot + deterministic publication（wall102 移交原文），均跨 cold_parser.c/符号身份层，非本线 2 刀可完成。**materialize_roots fixed-point 循环（103864）+ freeze 准入（:103982 前）是后续立项的准确落点。**

### 刀 2：memo/条目缓存平移 → 部分已在位（实证）+ 部分裁决维持（移交）

- **顶层条目缓存已在烤机路径生效**（wall89 P1 既有落地，本轮复核）：空缓存根全冷 264s vs 播种缓存命中轮 **7s**（本线首个作废轮 s2_base 实测：CHENG_ENTRY_CACHE=0 在简化 bake 脚本未翻译成禁缓存总闸，冷缓存命中直接恢复产物，sha=drv1e 产物 986943ed…——内容寻址键跨二进制正确性的正面证据；注意这同时暴露「简化测量壳的禁缓存口径有洞」，正式口径必须显式 CHENG_DISABLE_COLD_OBJECT_CACHE=1，本线全部正式轮已显式设置）。
- **「变更条目重编」的部分命中维持 P2 裁决取消**：单对象模型 + reachable_only 管线（本轮 gate 证据补强）下无安全部分命中路径，与 phase_c_recon 台账一致。
- **W5 fact memo 的烤机同类=cold_exact_* 权威校验重复查询**（sample 定量：19,736 树节点次、互递归形态）——memo 键=(body, definition) 在 parse 可变窗口内不 sound；安全边界=exact_frozen 之后，但热点在冻结前。移交 spec：需 body mutation-epoch 计数器（append/回填点递增）+ (body_epoch, definition) 键控 memo，语义恒等可由字节铁门验收。此项是 145s materialize + 40s 准入段的唯一非架构级候选，但工程量与误伤风险（验证层）超出本线预算。

## 三、primary 编译逐相账本（r4 轮探针实测，官方口径首次落卷）

| 相 | 时长 | 占比 | 状态 |
|---|---|---|---|
| signature prescan + import 闭包 | 2.02s | 0.8% | 单遍 edge-table（已优化） |
| @borrow_result 契约预编译 | 0.18s | 0.1% | — |
| entry 源 parse | 3.07s | 1.2% | — |
| **admission 段 = materialize fixed-point（~145s）+ 可达选择 + check_unique + freeze 契约准入（~40s）** | **184.57s** | **71.9%** | 串行；热点=cold_exact_* 校验族（sample ~57%） |
| codegen_program（BACKEND_JOBS=8） | 66.52s | 25.9% | 已并行；wall102 实测 cpu/wall=1.12x，包围段串行 |
| emit（对象写出） | 0.21s | 0.1% | — |
| wall 合计 | 264s（driver real 292s 系 r3 轮含脚本尾巴，r4 纯净 264s） | | |

**50–70s 差距分析**：即便 materialize+准入 185s 按 8 worker 理想并行压到 ~25s，总时长 ≈ 5 + 25 + 66.5 + 0.2 + link ≈ 97s，仍超 70s；达标需同时完成 (1) materialize 隔离并行、(2) exact 校验 memo/数组化、(3) codegen 包围段（证书/admission/确定性归并）分流——三项均为架构级，单阶段 2 刀不可达。50–70s 的正确载体是 .cheng selfhost_direct 管线接管烤机路径后（C-4 立项前提），而非 C 链继续压缩。

## 四、字节铁门与门禁表

产物字节铁门（同名 --out，全冷禁缓存，产物=kernel_driver）：

| 轮 | 车头 | 形态 | sha256 |
|---|---|---|---|
| r1b 基线 | cheng_s2_diag（探针版） | 串行 | 4133c3f0f5d3edcfdcd278e9bf7c8fc9d35a0af9cd4cb38d8d303212171f2160 |
| r1c 基线配对 | 同上 | 串行 | 4133c3f0…（== r1b） |
| r2 | cheng_s2_par | 骨架 env 化 | 4133c3f0…（== 基线） |
| r2b | 同上 | +bridge env 透传前 | 4133c3f0… |
| r3 | 同上 | +bridge env 透传 | 4133c3f0…（sha 从产物文件实取） |
| r4 | 同上 | +stderr 落盘修复 | 4133c3f0… |

四夹具 functional A/B（基线驱动 run_s2_base2 vs 刀版驱动 run_s2_matpar3，cwd=克隆根，禁缓存）：

| 夹具 | base compile/run | matpar compile/run | 判定 |
|---|---|---|---|
| ordinary | 0/0 | 0/0 | PASS |
| call_fixture | 0/1（契约） | 0/1（契约） | PASS |
| cold_nested | 0/0 + `cold_nested_fmt_interpolation=pass` | 0/0 + 同判别行 | PASS |
| v6 | 0/0 | 0/0 | PASS |

| 门 | 结果 |
|----|------|
| 基线复现（280s 级） | PASS（264s/274s 双轮） |
| 基线字节确定性（同名配对） | PASS（4 连 EQ） |
| 四夹具 functional A/B | PASS（8/8 逐项一致） |
| 刀 1 materialize 并行（时长） | BLOCKED（骨架在烤机路径为死代码；真前提=架构级三项） |
| 刀 2 条目缓存命中 | PASS（7s 命中复核，wall89 P1 在位） |
| 刀 2 变更条目部分命中 | BLOCKED（P2 裁决维持 + 本轮 gate 证据补强） |
| 刀 2 W5 fact memo | BLOCKED（安全 memo 边界=冻结后，热点在可变窗；spec 已移交） |
| 50–70s 端到端 | BLOCKED（见逐相账本差距分析；97s 为仅 materialize 理想并行下的理论下限） |

## 五、烤机台账（7 轮：1 作废 + 6 有效；r3 轮 rc=1 为脚本尾巴死因、编译本体 rc=0 且产物有效）

| 轮 | tag | 车头 | rc | wall | ru_maxrss | 产物 sha | 备注 |
|----|-----|------|----|------|-----------|----------|------|
| r1 | s2_base | cheng_w126（l3b2 壳） | 0 | **7s** | 196MB | 986943ed… | **作废**：播种缓存命中（假全冷）；暴露简化壳禁缓存口径洞=交付知识 |
| r1b | s2_base | cheng_s2_diag | 0 | 264s | 759MB | 4133c3f0… | 基线① |
| r1c | s2_base2 | cheng_s2_diag | 0 | 274s | 751MB | 4133c3f0… | 基线②配对 |
| r2 | s2_matpar | cheng_s2_par | 0 | 273s | 742MB | 4133c3f0… | 骨架 env 化；零加速（gate 短路） |
| r2b | s2_matpar2 | cheng_s2_par | 0 | 282s | 734MB | 4133c3f0… | 同上配对 |
| r3 | s2_matpar3 | cheng_s2_par | 1* | 293s | 741MB | 4133c3f0… | *rc=1=测量壳在轮中热替换致 STDERR_LOG unbound（教训：禁热替换运行中脚本）；编译本体 292.4s real rc=0、产物 sha 实取 EQ |
| r4 | s2_matpar4 | cheng_s2_par | 0 | 264s | 763MB | 4133c3f0… | 终验：skeleton_gate 探针钉死 reachable_only=1 短路；逐相账本产出 |

## 六、交付与复跑

- patch：/tmp/oob_ab/phasec_stage2.patch（bootstrap/cheng_cold.c 单文件 +69/−4；`git apply --reverse --check` PASS）。内容=①to_object/to_macho 相位探针（CHENG_COLD_PHASE_DIAG 门控，默认零输出）；②materialize 并行骨架 num_import_jobs 接 cold_jobs_from_env()（默认 1=原串行）；③bridge 子进程 env 透传（父进程设了对应变量才附加，否则 child_env 与原白名单一致）；④skeleton_gate/import_skeleton 诊断行。**默认语义零变化，r2–r4 sha 四连 EQ 为证。**
- 数据卷：/tmp/oob_ab/phasec_stage2/（run_s2_base2、run_s2_matpar3/4、ab_gate、primary_phases.log、samples/ 四份 sample、全部测量与探针脚本）。
- 复跑：`bash /tmp/oob_ab/phasec_stage2/s2_measure.sh <tag> 8 <车头>`（cwd 任意，壳内 cd 克隆根；禁缓存口径内建）。
- 探针复跑相位账本：烤后 `grep -oE "cold_phase_diag phase=[a-z_]+ delta_us=[0-9]+" run_*/kernel_driver_s2.stderr.log | head -6`。

## 七、移交（按收益序）

1. **exact 校验族 memo/数组化**（W5 模式平移的正靶）：mutation-epoch 失效 + (body_epoch, definition) 键控 memo；靶函数=cold_exact_var_projection_definition_valid / cold_exact_call_var_out_definition_valid(_impl) / cold_exact_var_projection_carrier_valid / cold_exact_owned_local_authority_valid / cold_exact_var_projection_edge_structure_valid / cold_bodyir_exact_identity_schema_valid（sample 样卷 /tmp/oob_ab/phasec_stage2/samples/）。预期吃 materialize ~145s + 准入 ~40s 的大头；验收=字节铁门同名配对 EQ + 四夹具。
2. **materialize_roots fixed-point 循环（cheng_cold.c:103864）并行化**：前提=wall102 三项架构前置（预铸造/row 重映射/isolated snapshot），落点已由本轮 gate 探针钉死；既有骨架（103416）可作 worker 池底座但必须改 gate。
3. **codegen 包围段分流**（wall102 移交 3 维持）：66.5s、压缩率 1.12x。
4. **测量口径修正**：l3b2_measure.sh 系（含本轮继承的壳）CHENG_ENTRY_CACHE=0 不翻译成禁缓存总闸，禁缓存轮必须显式 CHENG_DISABLE_COLD_OBJECT_CACHE=1（本轮 r1 作废轮的教训，建议 lessons 补条目）；另：严禁热替换运行中的 bash 脚本（r3 rc=1 死因）。

## 八、纪律记录

- 主树零接触（wall154 独占未动）；克隆工作区仅追加 bootstrap/cheng_cold.c 本线 hunks，[phaseC-l3b2] 四文件 hunks 原样保留；未 git commit。
- 临时目录=克隆 .w/s2/（大产物已清，脚本与样卷归档 /tmp/oob_ab/phasec_stage2/）；任务级缓存根随 run 目录创建即焚。
- 无降级无兜底：patch 内全部为门控诊断与默认恒等的开关；两刀的不可达结论均以实测数据+既裁证据闭环，非硬凑。
- 本线 heredoc 违纪一次（add_phase_probe 首版调试期），当场改用脚本文件方式并复检，未造成树态影响，已记 lessons 候选。
