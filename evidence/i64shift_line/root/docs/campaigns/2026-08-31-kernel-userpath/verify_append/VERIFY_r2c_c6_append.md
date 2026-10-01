# VERIFY_r2c_c6_append — R2-C 族收编施工线（R2-C-FAMILIES）· C6 落地 + C4/C5/C1 定谳

日期 2026-09-06。工作克隆 `/Users/lbcheng/cheng-f24/anchor_clones/r2c`（APFS cp -c，
锚点=主树 13:23 工作态，含并行线在途 hunks；禁 commit/restore 面遵守）。主树只落
campaign `patches/r2c_c6_full.patch` 与本卷。输入：`r2_closure_ops_map.md`（C 族序）、
`VERIFY_ab_prep_append.md`（B 名单修正：9 stray 挂 `system_link_exec:39→backend2_pipeline`
单边）、B8/B9 门面先例（cheng-minimal-kernel-plan.md:605-620）。

## 1. 起点现值复测（克隆内实测，与作战图/AB 卷逐项一致）

| 门 | 结果 |
|---|---|
| Step0 `--require-closure` | rc=0 PASS：96/96、uncovered=0、direct_violations=0、indirect 18/130、divergence 246 |
| 严格门 `--require-strict-closure` | rc=1 FAIL_STRICT **violations=236 = 7(声明不可达)+171(闭包未声明)+13(arch 可达)+45(token 文件/671 行)**；声明 37、闭包 201 |
| `kernel_plugin_manifest_gate.py` | rc=0 PASS（5/4/5; exact; unique） |

## 2. C6 施工（backend2 领地收编 + 断单通道边）

### 2.1 裸 arch import 定谳（逐调用点实测，非照抄作战图）

- `backend2_lower/backend2_lower_slots/backend2_lower_stmt/backend2_lower_util` 四文件的
  `aarch64_encode`+`x86_64_body_emit` import 为**死 import**：`\ba64\.|\bx64body\.` 全文
  命中 **0** 调用点/文件。处置=直接删行（4 文件 × 2 行），无门面需要。
- `backend2_assemble` 实耗 `rvenc.` 仅 2 点（:827 `RvIsaEsp32S31Xlen()`、:828
  `RvIsaXlenOk(emitXlen)`，均为纯函数）。处置=B9 同形单入口门面
  `src/core/backend/codegen_rv_isa_units.cheng`（shared-format）：同名单行转发
  （backend2_assemble 以 `as rvenc` 别名门面，调用点零改动），零间接调用，
  归属表同步 shared-format 桶。

### 2.2 断边与拒收形

- `system_link_exec.cheng:39 import backend2_pipeline as pobj2`【更正 2026-09-10 审计：点名 import `backend2_pipeline` 在 HEAD 该文件 0 命中（该行现为 `object_plan` import），该锚点不可用、正确落点未定位；原文保留为历史证据】 删除（唯一 kernel 侧
  import 点，grep 全 src/core 实证）；两个消费臂改 **fail-closed 拒收**（同文件既有
  unknown-kind / exact-function 拒收形，无兜底臂）：
  1. 七阶段观察臂（`SevenStageReceiptActive() && backendKind==primary`）→
     outErr ` system link exec: backend2 seven-stage observation unit is not in the kernel composition`；
  2. 选中臂（`backendKind==backend2`）→
     outErr ` system link exec: backend2 plan build unit is not in the kernel composition`。
  两臂 abort/return 序与相邻 else 臂逐形一致（`primaryPlanNeedsAbortRelease` 不置位，
  计划未构建）。`sevenStageBackend2Plan` 声明与其 defer 释放守卫保留（守卫旗
  `sevenStageBackend2PlanNeedsRelease` 恒 false，defer 体不可达，其余区域零触碰）。

### 2.3 归属表定桶（撤出 Step1 门盲区）

- schema 最小扩展（两门工具同步）：
  `kernel_plugin_closure_check.py`：BUCKETS 增 `backend2`（非 arch）；覆盖目录
  `COVERED_RELS=(backend, backend2)`；直接违规面 `DIRECT_VIOLATION_SOURCES={kernel,
  backend2}`（backend2 桶 arch 直 import 即违规）；间接 BFS 根仍仅 kernel 桶
  （backend2 独立组合领地不入 kernel 间接边账，口径注记在源码）。
  `kernel_plugin_manifest_gate.py`：TSV 路径前缀放行 `src/core/backend2/`。
- TSV +13 行：门面 1（shared-format）；中立 4（types/cid/frag_codec/plugin_cid，
  shared-format——kernel 侧 primary_object_plan/codegen_contract/compile_skip_cache/
  csg_plugin_pickup 直接消费，无 arch import）；流水线 8（pipeline/lower×4/assemble/
  assembler_lifecycle/fragment_lifecycle，**新桶 backend2**）。

## 3. 静态门验收（C6 施打后克隆实测）

| 门 | 前 | 后 | 边账 |
|---|---|---|---|
| 严格门 violations | 236=7+171+13+45 | **221=7+162+13+39** | −15 = 9 stray + 6 backend2 token 文件（41 行，671→630） |
| 严格闭包文件数 | 201 | **192** | 掉出=9 stray 全集（pipeline/lower/slots/stmt/util/assemble/assembler_lifecycle/fragment_lifecycle/compile_skip_cache），逐一程序化复核 OUT |
| closure_unmanifested | 171 | **162** | 残余=146 中立（AB B 名单）+13 arch+3 过渡门面，与 AB 施打预期（25→16）自洽 |
| arch_reachable | 13 | 13 | backend2 通道非末跳（各 arch 文件 ≥8 通道，余道经 B4/B6/B8/B2 门面），预期内 |
| Step1 `--require-closure` | PASS | **PASS** | direct_violations=0（backend2 入门后 9 条裸 arch 边已被门面/删行清零）、109/109 covered、indirect 18/130 不变 |
| manifest gate | PASS | **PASS** | 5/4/5; exact; unique（backend2 桶不入 plugin expected 集） |

## 4. 烤机配对（全冷禁缓存 ×2 sha EQ + 四夹具门）

- 配方：`.w/r2c_bake.sh`（复刻 w139/w154 通道：d1（sha 31a3dc23…）车头直烤
  `backend_driver_dispatch_min` 入口闭包，`--manifest .w/kernel_manifest_head_git.cheng`），
  env `CHENG_DISABLE_COLD_OBJECT_CACHE=1 CHENG_ENTRY_CACHE=0
  CHENG_PROCESS_MAX_RSS_BYTES=12884901888`、每轮新鲜缓存根、BACKEND_JOBS=8。
- 串行：bake_win 锁——目录被他线当工作区占用（snap_split 先例复现），按其降级
  口径走标记文件 + pgrep 静默门（仅拦他线 driver 构建，夹具小编译不拦）；owner=
  R2-C-FAMILIES。链式两轮 + user_path_gate 一次挂链（nohup 受控分离，pid 落盘
  `.w/chain.pid`，日志 `.w/chain.log`——w154 同款纪律；harness 后台任务 ~1h 强杀，
  两次在飞轮毁于此，故转受控分离）。
- 车头事故与纠偏（主线程 2026-09-06 通报，用户指令）：首两轮误用自家烤出的
  driver 产 `.w/cheng_head_d1` 当车头跑 system-link-exec 编自家闭包——GEN2 式
  自烤长跑（1:47 仍在前端相，撞内存活集墙，注定跑不完），被主线程终止。
  **根因**：选头时只验证了「d1 能编 w154 墙链树」，未对齐任务书的车头指定
  （cheng_w126 认证序列）；d1 是 dispatch_min 闭包的产物，拿产物当车头编同类
  闭包=自举，非门禁配方。**健康 hard 标准（全战役生效）已纳入**：车头烤
  >10 分钟=病理立即 kill+诊断+报告；换 `/tmp/oob_ab/cheng_w126`
  （sha 0f198c5e6266597ff888e81a24fced244669d32b24b49b894cb8b51887c35d89，C 链
  认证编译器）后单轮 ~3.2 分钟，与前述病理形成对照。

### 4.1 链回执（cheng_w126 车头，全冷禁缓存）

| 轮 | rc | 耗时 | out 路径 | driver sha256 |
|---|---|---|---|---|
| c6_r1（19:24:29→19:27:42） | 0 | **3m13s** | .w/driver_c6_r1 | b5d33112fcb74aed4d65ac54c7e31210def95b99fa9ef2a80fdde1f888aa5385 |
| c6_r1b（同路径重烤，新鲜缓存根） | 0 | ~3m | .w/driver_c6_r1 | **b5d33112…（逐字节全等）** |
| c6_r2（异路径 .w/driver_c6_r2） | 0 | 3m16s | .w/driver_c6_r2 | 778895b3…（≠r1，定谳见下） |

- **×2 sha EQ 成立**：c6_r1 × c6_r1b 同命令同 out 路径、各自新鲜缓存根、全冷，
  driver sha256 逐字节相等。c6_r2 与 r1 尺寸全等（170337968B）而字节异，
  定点重烤（c6_r1b）钉死唯一变量=**产物内嵌 out 路径**，非编译非确定性。
- **四夹具门** `tools/user_path_gate.sh --driver .w/driver_c6_r1`：**rc=0**，
  判词逐字同基线（ordinary 0/0、call_fixture 0/1 契约、cold_nested 0/0+
  `cold_nested_fmt_interpolation=pass`、v6 0/0）；probe_summary
  probe_pass=7 / probe_red=12 / **probe_stale=0**（12 红全为基线已知红，
  零漂移）；max_process_tree_peak_bytes=977698816 < rss_cap 1073741824。
- **报告契约字段零漂移**：122 字段集两轮全同；值漂移 34 键全部为计时/量测/
  路径字段（compile_real_cpu_ms、exec_phase_*_us、report_rss_bytes、output、
  darwin_link_log 等）；closure/declared/composition 类契约字段漂移 **0**。
- 报告回执（c6_r1）：`composition_source_closure_count` 等契约键在两轮报告
  逐字段相等；`system_link_exec_runtime_execute=1`、`real_backend_codegen=1`。

## 5. C4/C5/C1 静态定谳（假想切边闭包重算，程序化实测）

方法：在 src/core 全 import 图上切族边，从 kernel entry 重算闭包与 arch 可达
（checker 同构），结合消费点语义定谳。**三族同撞同一结构墙，按止损条款交定性。**

| 族 | 切边 | 闭包/arch 收益 | 定谳 |
|---|---|---|---|
| C4 darwin | system_link_exec_runtime→B9 门面（1 条） | 192→190、arch 13→**12**（darwin_syscall_provider 出闭包） | **止损：留内核消费形态**。消费点 `SystemLinkExecRuntimeMaterializeDarwinSyscallProviderObject`（serial/parallel 双臂 :3032/:3084）织入 provider 物化流水（providerObjectPaths/compileLogPaths/missCount 累加 + HARD_RED 门 + Err 传播契约）；arm64-darwin exe 链接（四夹具正典路径）必走此臂，拔链即四夹具门红。零间接调用范式下无合规机制可承载跨组合消费：B1 fn 槽被 B2 探针证伪（codegen_contract.cheng B2 注：`Result[bool]`/裸 str 复合过槽 registry_miss/SIGSEGV），数据槽（B1 期望字先例）只能载值不能载行为；真正严格形需把 system_link_exec(_runtime) 在 provider 相位开相界（流程产出需求回执→返回→组合根物化→再入），L 级重构，非本线档位 |
| C5 link 暗道 | coff/elf/macho_linker→a64_link 门面（3 条） | 192→191、arch **13→13（零收益）** | **止损：随 C3 捆绑**。aarch64_encode 尚有 B6/adapter 等通道，C5 单独切边 arch 可达数不降，仅 a64_link 门面（过渡门面之一）出闭包（未声明 −1）；而 host darwin 链接（四夹具）实时需要 BlPlaceholder/Adrp/LdrImm 原语。C5 的严格形价值完全挂在 C3（body 布局出闭包）之后，单独动刀=纯能力拆除零门收益 |
| C1 regalloc | emitter→B8、artifacts→B3（2 条） | 192→186、arch 13→**9**（3 adapter+encoder_events 出闭包） | **止损：留内核消费形态**。emitter 是 canonical allocator 唯一生产消费点（工程规范 7），其 recipe 准备是 plan 期深内联调用（frozen 消费+字节回执契约），kernel 闭包内不可移除；严格形=emitter 整体迁插件侧（kernel 只留 regalloc_single_pass 计划权威），牵 debug_emission_receipt 等调用链级联外移，且 B8 A/B 字节门（plan:605-612 先例）需整套重跑。非 S/M 档位可消化 |

C2/C3（writer/body）属同构更大体量（36/32 边），C5 结论已示「单独切边零 arch 收益」
形态，未动刀。

## 6. 严格门残余现值（C6 后）

**221 = 7（死声明，A 族）+ 162（未声明 = 146 中立 B 族 + 13 arch + 3 过渡门面）+ 13（arch 可达）+ 39 token 文件/630 行。**

剩余归属清单（族账）：
- 7 死声明 → AB patch 已固化，主线程施打即消。
- 146 中立未声明 → AB patch 同上（施打前主线程按本卷 §3 的 192 闭包重对账：AB 的
  172 基闭包已被 C6 削到 192，B 名单 146 不受影响，9 stray 已由 C6 消）。
- 13 arch 可达 + 3 过渡门面 → C1/C2/C3/C4/C5，需 §5 定谳的相界重构/插件侧迁移
  （L 级，需主线程排程）。
- 39 token 文件/630 行 → 族 D 收权（C 族后终扫）；C6 已削 backend2 6 文件/41 行。

## 7. 交付物与哈希

| 物 | sha256 |
|---|---|
| patches/r2c_c6_full.patch（9 文件/18 hunks：src 7 + TSV + 两门工具） | ee336d09618e5ca0c0ad8aedf984dc2d1a982ddca3d13b5263e262cab12cccf0 |
| bootstrap/kernel_manifest.cheng（未触碰，与 AB 卷施打前哈希同） | bdcbe0d30eea0831366a0653f7587f7dbc09a537a94a1ae00eebf2af68da2e28 |

补丁回环验证：反向重建 pre_c6 → 施 patch → 与克隆现树逐文件 `cmp` 全等（7/7）。
`.w` 大对象（驱动/缓存根/解析探针）交付后清除，仅留文本台账。

## 8. 边界与风险（如实记录）

1. **行为面变化**：kernel 组合驱动 `--backend backend2` 与七阶段 primary 观察臂由
   「实跑 backend2 流水线」转为 fail-closed 报错。四夹具/烤机配方（primary 默认、
   无七阶段旗）零影响（§4.1 gate rc=0 实证）；GEN2
   `backend2_current_source_seven_stage_producer` 走 --seven-stage+primary，将命中
   观察臂拒收——GEN2-LADDER 需按「backend2 单元交付归二号组合」接线（本卷 §2.2
   文案即其对接面）。
2. **tools schema 扩展**随补丁同交付；他线若先行改同一两文件，主线程施打时按 hunk
   对账（closure_check.py 7 hunks / manifest_gate.py 1 hunk / TSV 1 hunk）。
3. **车头纪律（本线事故教训，全战役 hard 标准）**：配对烤机车头只能是认证序列的
   cheng_w126（或其后继认证头）；任何 driver 产不得当车头；车头烤 >10 分钟=病理，
   立即 kill+诊断+报告，禁止陪坐观察；开工前 ps 审计在飞烤机（etime/pcpu），发现
   他线病理有权 kill 并通报主线程。
4. 静窗仲裁遵守：GEN2-P1 校准窗（~19:35-20:05）内零新烤轮发起；本线 §4 全部烤机
   与夹具门均在窗前完成，窗口内仅做报告比对与文书交付（零编译负载）。


## 主线程合入复验（2026-09-07，收割追加）

r2c_c6_full 九文件全部落地（8 文件 git apply + rv_isa 门面 --include 补施 + manifest_gate.py 57 行区人工对位——whenblock 同文件演进致 hunk 漂移，非语义冲突）。静态门：closure PASS、manifest gate PASS（x86_64=5/aarch64=4/riscv64=5+backend2 桶）、严格门 236→221（unmanifested 171→162、token 45→39）。烤机+全门认证随冷修一并闭环（m29=m30=e6327687，门 rc=0，见 VERIFY_cold_provider_fix_append 合入复验节）。backend2 Step1 门盲区消除。
