# wallcensus.VERIFY —— kernel_driver_w2 全墙普查线（纯只读枚举，零树编辑/零烤机）

日期 2026-09-04。cwd=仓库根。车头=/tmp/oob_ab/cheng_w126（HEAD C 提取件，sha256=0f198c5e…，编 4 夹具全 0/0=全阶段通行 oracle，本轮实录复证）；kernel 侧=/tmp/oob_ab/w129/kernel_driver_w129_r3（既有二进制，含在树全部修复）。探针/产物全部落 /tmp/oob_ab/wcensus/，src/** 零改动、零 git 写、零烤机。作业期间遭遇 3 波 `parent lease unavailable`（并行 wall131/132 线烤机/编译），全部按纪律串行退避。

## 一、方法 A：两链同夹具对拍（车头 oracle vs kernel_driver_w129_r3）

命令形（照 /tmp/oob_ab/w130/gates_r1.sh 实录）：
`<driver> system-link-exec --root:/Users/lbcheng/cheng-lang --in:src/tests/<fx> --emit:exe --target:arm64-apple-darwin --out:<out>.exe --report-out:<out>.report`，cwd=仓库根。

### 4 夹具 rc 矩阵（本轮实录）

| 夹具 | 车头 cheng_w126 | kernel_driver_w129_r3 |
|---|---|---|
| ordinary_zero_exit_fixture | compile=0 run=0 | compile=0 run=0（本轮复证） |
| call_fixture | compile=0 run=1（契约预期） | compile=0 run=1（本轮复证，契约预期） |
| cold_nested_fmt_interpolation_smoke | compile=0 run=0 `cold_nested_fmt_interpolation=pass` | compile=2，判词见下（本轮复跑与 w129 锚点**逐字一致**，无 detail dump=w129_r3 烤件早于 wall131 富化，符合口径） |
| zz_v6_w7 | compile=0 run=0（语义 oracle：r=7/offset=8/arena.n=108） | compile=1，判词见下（本轮复跑与 w129/w130 锚点**逐字一致**，含 phase=4746 与 wall128 dump） |

### 锚点墙判词实录（kernel 链，/tmp/oob_ab/w129/ + 本轮复跑）

- **cold_nested**：`body_kind=data_reloc_no_fill_record fn=_cheng_program_source_entry abort=data_reloc_no_fill_record primary0=primary_object_machine_words_missing lowering0=-`，伴 `reason=missing_call_target code=6 detail=140 primary_missing=3`；此前两函数 regalloc ledger 全绿（main actions=155 words=104 relocs=26、nestedFmt actions=68 words=66 relocs=13）。
- **v6**：`ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=22 detail=0 fn=3 op_kind=9 op_target=15 op_operands=1 a0=0 vd_slot=15 vd_own=3 … phase=4746` + `wall128_cfg_kill_dump fail_op=22 fail_slot=0 fail_state=-1`。

### 对拍方法校准（锚点回验）

两锚点均与对拍判据一致：车头同夹具 0/0（两墙在 C 链不存在），kernel 链各自挂唯一判词 → 对拍口径=「C 链全绿同一形状在 kernel 链的首个 fail 判词=当前墙；kernel 链已绿打点（lifecycle/ledger）=已过阶段铁证」。纯内部态（C 链编译期不落盘逐阶段 artifact）标注「待修时取证」，未改码加 dump。

### 逐阶段盘点（kernel 链编 exe 全链 15 节点）

1 parse → 2 typed → 3 CSG → 4 lowering → 5 bodyIR 构造 → 6 cleanup_cfg → 7 exact_def derive/freeze → 8 ownership ingress(BodyIrAccessDecode) → 9 ownership materialized 复验(二次 Decode) → 10 regalloc plan+ledger → 11 primary 发射+data reloc fill → 12 对象写出(macho) → 13 链接 → 14 run 退出码契约 → 15 run 值语义。

- ordinary/call：15/15 节点全过（两绿夹具=全链最小形状反证集，14 节点契约 rc 均对齐车头）。
- cold_nested：节点 1–10 全过（ledger 绿为铁证）；节点 11 内挂 data_reloc fill（墙 CN-1）；12–15 未达。
- v6：compute/addCol/main 等前序函数全 15 节点过（kd_v6.log 有 ledger_pre actions=68 words=53 relocs=3 铁证）；outer(fn=3) 挂节点 8（墙 V6-1）；outer 的 9–15 未达。

## 二、方法 B：fail 门全仓普查（骨架）

扫描域=src/core/{lang,tooling,analysis,backend,ir,runtime,backend2}（任务书 6 目录+backend2 全查，runtime/tooling 非 pipeline 文件单独归类）。门=发射可读判词的 fail/abort/reject 点；数组越界 panic 哨兵（`ArenaArrayInt32Get` 等访问器）单列不计语义门。

### 门清单骨架统计（普查脚本与全量 JSON 在 /tmp/oob_ab/wcensus/，gate_census_v5.json + gate_record_v6.json）

| 谓词族 | 发射点 | 说明（判词形态） |
|---|---|---|
| P1-parser语法 | 542 | parser 语法诊断（合法表面不触达） |
| P1-词法intern/诊断artifact/P0-cache | 52 | 词法/诊断 artifact/缓存 |
| P2-typed_expr类型 | 1654 | 类型检查/frag codec |
| S1-结构不变量 | 225 | core_types/phase_arena 等 |
| T-驱动/receipt | 415 | compiler_csg/driver receipt |
| A2-ownership生产(panic) | 106 | `ownership body ir production: …`（ownershipBodyIrFail=panic；ingress 组装 :1377 / materialized 组装 :1948） |
| A3-drop计划 | 478 | drop/ORC 计划 |
| A4-CFG清理 | 1067 | cleanup_cfg panic 门族（含 w129 canonicalize 安全网） |
| A5-exact_def | 85 | derive/freeze/merge/identity |
| A6-ownership四元组 | 210 | bodyIrAccessFail code 1–15（15=Ownership=v6 墙）；判词经 A2 组装两口输出 |
| L1-lowering | 1030 | lowering_plan |
| L2-primary发射 | 1386 | primary_object_plan（含 Record 族 51：data_reloc_no_fill_record、regalloc_production_emit_failed、regalloc_data_reloc_pair/count_mismatch 等） |
| R1-regalloc | 4 | 寄存器生产 artifacts（诊断打点在 L2 判词流） |
| C1-codegen | 12 | a64 编码 |
| C2-链接 | 175 | system_link/native_link |
| O1-对象写出 | 96 | macho/elf/object writer |
| B2-backend2 | 1177 | 第二后端（kernel 编 exe 路径之外，仅 manifest 校验触达） |
| X-非kernel | 74 | wasm/riscv/thunk 等 |
| **合计** | **8773** | 另有 OOB 哨兵 9397（不计墙） |

两锚点回验：CN-1=primary_object_plan.cheng:72462（A2 组装 :1376 侧同名）；V6-1 组装口=ownership_body_ir_production.cheng:1377，四元组源=body_ir_access.cheng（code 常量 1–15 全集在 :50–65）。均在本清单在册。

### 红夹具形状×族可达标注

夹具特征：cold_nested={str 托管、嵌套两级 Fmt 插值、字符串比较、echo、let 绑定 call-result}；v6={object/ref object/Box/Node、new、嵌套字段写、var 形参、@borrows、嵌套调用作 var 实参}。

| 族 | cold_nested | v6 | 依据 |
|---|---|---|---|
| P1/P2/S1/T | 已过 | 已过 | 两夹具都到达 bodyIR 后段 |
| A4-CFG | 已过 | 已过 | w129 修 CFG 墙后两夹具判词均推进 |
| A5/A6/A2 | 已过（两函数 ledger 绿） | **可达=V6-1 实锤** + 修后必扫 | v6 outer 挂 :1377 口 |
| A3 | 远（str 字面量 drop 由 runtime 承担） | 可能（Node/Box ORC） | 形状 |
| L1 | 已过 | 已过（fn0–2） | ledger 前置 |
| L2/R1 | **可达=CN-1 实锤**（data_reloc 域 7 个 Record 门同域） | 可能（outer 发射；无字面量→data reloc 风险低） | 判词 |
| C1/O1/C2 | 可能（12–13 节点未达） | 可能 | 未达 |
| 14/15 run | 可能（值语义） | 可能（v6 自校验 r=7/8/108；历史双链 run=99 前科） | 形状 |
| B2/X | 远 | 远 | 不在编 exe 路径 |

## 三、墙单总表（当前树态，按夹具×阶段）

### cold_nested（红，1 面实锤 + 2 面候选）

| 墙 | 阶段 | 判词预估 | 证据 | 置信 |
|---|---|---|---|---|
| CN-1 data_reloc_no_fill_record（在修，wall131/132 领地） | 11 primary 发射+data reloc | `body_kind=data_reloc_no_fill_record … reason=missing_call_target code=6 detail=140`（嵌套 fmt 数据填装） | 判词实录+门点 :72462；C 链同夹具全绿=kernel 链新域 | 实锤 |
| CN-2 data_reloc 同域次生门 | 11 | `regalloc_data_reloc_pair/count_mismatch` / `data_reloc_structure_mismatch`（:73947–:74080 同域 Record 门） | 同域门点 | 高（同修域联立） |
| CN-3 run 值语义 | 15 | `cold_nested_fmt_interpolation=fail` 或串不等 rc | 修复面=插值数据装配本身，值错风险与修复同源 | 中 |
| （C2/O1 链接域门 82+15 模板） | 12–13 | 判词预估无独立风险源；ordinary/call 已证最小链接形状 | 未达节点 | 低（不计墙单） |

### zz_v6_w7（红，1 面实锤 + 5 面候选）

| 墙 | 阶段 | 判词预估 | 证据 | 置信 |
|---|---|---|---|---|
| V6-1 ingress ownership index=22（在修，编辑线方案甲落列+批 2 镜像） | 8 ownership ingress | `ownership body ir production: ingress … code=15 index=22 … phase=4746`（判词逐字现行） | 判词实录+wall128 dump；C 链 0/0 | 实锤 |
| V6-2 A6 同链剩余扫描 | 8 | 同族判词 index=outer 其后 op（≥22）或他函数 | Decode 一次扫全 ops；A6 族 210 门 30 函数 | 高 |
| V6-3 materialized 复验口 | 9 | `ownership body ir production: materialized BodyIR ownership invalid …`（:1948 口） | :1922 二次 Decode 必经 | 高 |
| V6-4 freeze 消费联立 | 7 | freeze/derive 域判词（argOwnership==OwnMove 通道②与方案甲镜像列联立） | exact_def_freeze.cheng:588–589 | 中 |
| V6-5 A3 drop/ORC 计划 | 7/9 | `ownership drop ir …`（A3 族 350 模板） | Node/Box=new×2 托管释放 | 中 |
| V6-6 outer 发射 | 10–11 | regalloc/primary 域判词；无字面量→data reloc 风险低 | fn0–2 已过同阶段 | 中 |
| V6-7 run 值语义 | 15 | rc=100+r / 200+… （夹具自校验） | 历史双链 run=99 前科 | 中 |

### 绿夹具（反证集）

ordinary、call_fixture：剩余墙=0。全部 15 节点过、rc 契约与车头逐项一致。

## 四、收官进度精确化

口径=「15 节点阶段里程碑，挂点节点记 0.5，按夹具等权平均」（替代 ~85% 外推；候选墙不计入已完成，防假绿）：

- ordinary 15/15 = 100%
- call_fixture 15/15 = 100%
- cold_nested 10.5/15 = 70%（1–10 全过铁证=两函数 ledger 绿 actions=155/68；11 半=两函数词发射过、reloc fill 挂）
- v6 87.5%（按函数加权：(3 函数×15 节点全过 + outer 挂 8 记 7.5)/60 = 52.5/60；3 函数过 ledger 铁证=actions=56/29/68，outer=fn3 挂 ingress）

**加权总分 = (100+100+70+87.5)/4 ≈ 89.4%**。

余墙硬数（普查口径）：两面红夹具实锤余墙各 1 面（CN-1、V6-1，均有归属线在修），修后预判候选 cold_nested 至多 2 面、v6 至多 5 面（全部带判词预估与门点定位，[高]2+[中]3）。若候选全部按预估成立且无新形状，v6 单夹具还需约 3–6 轮修-烤循环；cold_nested 约 1–2 轮。

## 五、修法并行化建议（按文件域分组）

**可并行（互不同文件）**：
1. CN 线：primary_object_plan.cheng data_reloc/call-target 域（wall131/132 已在）——与 v6 线零文件交集。
2. V6 线：core_types.cheng（CallOp 落列）+ exact_def_derive.cheng（批 2 镜像）+ 发射臂（lowering_plan/primary_object_plan 的 AppendCallArgs/NodeEval 道——与 CN 线同文件但不同函数域，需按 hunks 协调，建议 CN 线先行合入后 V6 线 rebase）。
3. 判词富化/观测面（panic 门 dump）：任意analysis/backend 文件，均为只增 fail-closed dump，可随各线自带。

**必须串行**：
- V6-2/V6-3/V6-4/V6-5 全部依赖 V6-1 合入后才能观测（同一 Decode 链顺序触发），不可预修。
- CN-3 依赖 CN-1；V6-7 依赖 V6-1..V6-6。
- 同文件（primary_object_plan.cheng）内 CN 线与 V6-6 发射臂改动必须串行合入，避免 hunks 冲突。

## 六、产物清单（/tmp/oob_ab/wcensus/）

- census_a.sh / census_kd.sh：两链对拍脚本（kd 侧含租约退避；本轮 kd 实录 4 夹具 rc=0/0、0/1、2、1，全程退避 7 次 `parent lease unavailable` 无一误燃）
- lead_*/kd_*：车头与 kernel 链 4 夹具全产物（exe/report/compile log/run log/sidecar；kernel 链另有 .primary.o/.native_link.log，C 链直接 emit 无此 sidecar=两链架构差非墙）
- report 对拍结论：kernel 链 report 多 CID/receipt/semantic digest 域、C 链多 darwin toolchain 域（架构差）；共有语义结果（rc/输出/产物）两链在双绿夹具上全对齐
- gate_census.py → gate_census3.py → gate_family5.py → gate_record6.py：普查脚本链
- gate_census_v5.json / gate_record_v6.json：8773 门点全量数据（file/line/fn/kind/verdict/family）+ 9397 OOB 哨兵标注
