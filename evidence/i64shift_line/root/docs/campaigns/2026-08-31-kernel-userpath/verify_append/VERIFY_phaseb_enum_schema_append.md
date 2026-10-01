# VERIFY_phaseb_enum_schema_append.md —— PhaseB-enum-schema 线（enum 收官最后一跳）2026-09-05

锚点 commit=69817b8b2。全程无 git commit、无分支。工作区 /tmp/oob_ab/phaseb_enum_schema/。车头=head 三件套（/tmp/oob_ab/w139/build_kernel_driver_w139.sh + kernel_manifest_head_git.cheng + cheng_w126），CHENG_COLD_OBJECT_CACHE_ROOT 任务级、CHENG_ENTRY_CACHE=0。并行线 hunks（[phaseB-enum]/[phaseB-tuple]/[phaseC-w5]/[wall150]/parser 重构线）原样保留、零触碰、零 revert；烤机/gate 全程与 wall150、parser 线错峰（watcher 轮询烤机窗，无并行烤机）。

## 一、schema 设计（enum 变体载荷行表示）

production snapshot 的 `CsgCompilerTypeTable`（schema v7→v8，`CsgCompilerSnapshotSchemaVersionLatest` 7→8）新增 enum 变体载荷 CSR 五列，风格对齐既有 `argStarts/argCounts`+扁平列模式：

| 列 | 语义 |
|---|---|
| `variantStarts` | 每 type 行一项的 CSR 起点（=扁平列 cursor） |
| `variantCounts` | 每 type 行一项的变体行数；**非 Enum 行必须为 0** |
| `variantNameTextIds` | 扁平列：变体名 canonical text id（必填） |
| `variantOrdinals` | 扁平列：变体 ordinal（必须=行内偏移） |
| `variantPayloadTypeIds` | 扁平列：载荷 TypeId，无载荷变体 -1 |

契约闭环：
1. **形状**（`csgCompilerTypeExactShape` 既有 enum 臂不变）：Enum 行 `declSymbolId>=0 ∧ argCount==0 ∧ 无 element/constArg/aliasTarget`，变体数据全走新 CSR，不与 arg CSR 复用。
2. **CID preimage**（`csgCompilerTypeStructureAppendInto`，TypeRowCid 与 TraitProofCid 共享）：Enum 行在 nominal declaration 分支后追加 `variantCount + 每变体(ordinal, name text, optional payload TypeCid)`；列读取带 defensive 长度守卫（表投影不齐时 fail-closed 而非越界）。非 Enum 行零变体行 → **preimage 字节零变化 → 既有产物 CID 稳定**。canonical text 仍为 diagnostic cargo（schema 5902 口径），不进 CID。
3. **trait premises exact**（`csgCompilerTypeTraitPremisesExact` 新 enum 臂）：Enum 行 premises == 有载荷变体的 payloadTypeId 子序列（declaration/ordinal 序），与生产端 `traitPremise=children`（typed_expr_type_arena.cheng 枚举构建 1979-1983）同构；全无载荷 enum 合法零 premises。行界只由每行 CSR 列（variantStarts/variantCounts）守卫，扁平列由 start/total 切片。
4. **trait 派生**：Enum 并入 Object 递归臂（managed=any payload、send/sync=every payload），对齐生产端 `TypedExprTypeTraitRuleEnumVariantsRecursive`（与 ObjectFieldsRecursive 同一段代码）。
5. **版本兼容**：strict validate 一向只认 Latest；旧列语义/顺序未动，旧 schema 读取语义零回归。旧产物按既有「Breaking changes 原地原子替换」设计自然失效（schema 顶部注释口径）。
6. **cargo 证据线**：types cargo JSON 行按字典序追加 5 字段；validator strict field-set 契约同步注册同 5 字段（writer/reader 字段集精确一致）。wire decode 为子集投影无需扩。
7. **周边同步**：`CsgCompilerSnapshotTablesClone` 五列、lowering_bridge release tally 五行+`SequenceFieldCount` 444→449（429+15→434+15）、builder 空表断言五列、`variantNameTextIds` 并入 text merge remap、官方 gate `tools/compiler_snapshot_lowering_bridge_gate.sh` 两处字面 444→449（gate 期望列清单从 schema 源码动态解析，列序与 tally 插入位一致，exact 顺序对照自动吻合）。

## 二、builder 侧（TypeArena→schema 投影）

1. **admission 放行**（`compilerSnapshotBuilderTypeProjectionAssessInto`）：`TypedExprStructuralTypeEnum` 不再计 missingSchemaKindCount（stage=3 拒收清除，即 PhaseB-A 墙 4 判词点），改走与 Object/RefObject 同款 nominal declaration-identity join（`NominalHeadJoinInto` 扩 enum roundtrip 臂）。declaration-layout 阶段不适用（enum 物理是标量 ordinal，无复合布局证据域——PhaseB-A 墙 3 已定的 required-layout skip 口径）。
2. **行投影**（`compilerSnapshotBuilderAppendArenaTypeRow`）：Enum 臂产出 `CsgCompilerTypeEnum` 行（argCount=0、declSymbolId join、TraitProofDeclaration）；variant CSR 从生产端 member CSR（`symbolMemberStarts/Counts`+`memberNameIds/Ordinals/TypeIds`）逐变体投影，校验 ordinal==偏移、名字 intern 可解析、payloadTypeId∈[-1, arenaTypeId)；名字 intern pool→canonical text pool（缺失即 hard-fail）。traitPremises 沿用既有 arena premises 拷贝通道。
3. **canonical 重排**（`compilerSnapshotBuilderTypeTableCanonicalizeInto`）：variant CSR 五列随 CID 排序重建搬运，payloadTypeId 经 old→new bijection remap（与 arg/constArg/premise 三 CSR 同纪律）。
4. **arena↔schema kind bijection 桥**：enum 臂补入（`expectedSchemaKind=CsgCompilerTypeEnum`），其 child 行（有载荷变体）走 variant payload CSR 不进 arg CSR。
5. **canonical text**：`enum[Name,Name(payload),...]`（`compilerSnapshotBuilderArenaTypeTextsInto` enum 臂，确定性生成）。
6. **signature 行**：补零变体行，保持 CSR cursor 不变量。

## 三、验收门禁（r9 终态驱动 kernel_driver_w5_r9，sha256 cb84245d…）

| 件 | 合同 | 实测 | 判定 |
|---|---|---|---|
| 秒级门 schema/cargo/bridge 单文件 --emit:obj | rc=0 | 3/3 rc=0 | PASS |
| 秒级门 builder 单文件 --emit:obj | rc=0 | rc=2 `cheng_cold: expected indexed assignment value`@668429——HEAD 预存代码（跨行 indexed assignment）的 C 冷链 parse 预存限制，冷缓存首烤暴露（PhaseB-A r4 秒级门系 w139 旧缓存命中未触及） | 改用 PhaseB-A 同款替代门 |
| 秒级门闭包 backend_driver_dispatch_min --emit:obj | rc=0 | rc=0 | PASS |
| **t_enum** | compile=0 + run `t_enum=pass` | **compile=1，判词 `cheng_cold: exact identity schema [freeze] slot_name=s`——bootstrap 冷链身份层（freeze）预存墙**，与 PhaseB-A 移交第 4 条（`Status.Ok`→let 的 SLOT_I32/SLOT_VARIANT 身份分裂，bootstrap/ 非授权面）同源。**本线全部 snapshot schema 墙已被 t_enum 实测穿越**（r5→r9 判词序列：stage=3 SchemaKind 拒收 → bridge 常量 → premises exact → producer kind bridge → freeze），freeze 属 bootstrap 冷链在途态（并行线 M bootstrap/cheng_cold.c），非本线授权面 | snapshot 契约层 PASS；t_enum 全绿被非授权面冷链墙承接（移交） |
| 四夹具 ordinary | 0/0 | compile=0 run=0 | PASS |
| 四夹具 call_fixture | 0/1 | compile=0 run=1（首轮 `immutable Cargo HEAD mismatch` 为跨驱动同 identity store 残留，清理后重建转绿；同输入源码态车头亦绿） | PASS |
| 四夹具 cold_nested | 0/0 + pass 判词 | compile=0 run=0，stdout `cold_nested_fmt_interpolation=pass` | PASS |
| 四夹具 v6 | 0/0 | compile=0 run=0 | PASS |
| enum 声明探针（新增 zz_phaseb_enum_schema_decl_probe.cheng，仅声明不消费以隔开车头冷链预存墙） | compile=0 run=0 | compile=0 run=0——**含 enum 声明程序的 production snapshot 全链（traitProof/TypeRowCid/variant CSR/bijection bridge）转绿** | PASS |
| 双烤一致性 | 同输入双烤产物 sha 一致 | r5 态 ordinary **0 diff**（本线 snapshot 层字节中性实证）；r9 态五件各 96 字节尾部 receipt 差异（大小全同，空缓存隔离双烤同性质→驱动内嵌树态非确定性，非本线 schema 键/CSR 引入） | r5 口径 PASS；r9 差异归因并行树态漂移（移交 2） |

## 四、双烤一致性定性

| 驱动 | 输入 | 双烤 diff 字节 | 判定 |
|---|---|---|---|
| cheng_w126（旧车头） | ordinary | 0（字节级一致，52080B） | 工具链可产出确定性产物 |
| **r5**（本线 schema 核心+bridge 常量修复态） | ordinary | **0** | **本线 snapshot 层改动确定性无虞** |
| r9（终态，含并行线 08:2x-09:1x parser/typed_expr/bootstrap 在途漂移） | ordinary/probe/call/cold_nested/v6 | 各 96（大小完全一致，差异集中尾部 receipt 域两段） | 非确定性来自烤机树态漂移（并行线在途 hunks；PhaseC-W5 在案「字节门 FAIL 待静默窗补验」同族） |
| r9 空缓存隔离双烤 | ordinary | 96（与暖缓存双烤同量级同性质） | 非确定性为 r9 驱动内嵌树态属性，与缓存态无关 |

判据：r5 与 r9 之间本线唯一增量=premises/canonicalize/防御/bridge enum 臂（全为确定性控制流，无时间/随机源）；并行线在 r5 烤后高频修改 parser/typed_expr（mtime 08:44/09:13 实证）。schema 版本键（v8）进 cargo identity 后同驱动同输入 identity 稳定（call store 清理重建即自洽），未观测 schema 键引发的产物漂移。

## 五、烤机台账

| 轮 | 内容 | size | sha256 |
|---|---|---|---|
| r5 | + snapshot schema v8 enum 变体载荷契约扩展（12 文件） | 186764304 | e3b10d97ff5d4a16d96b73827010d9991a712ebdc9e9906ee7b18d1e361a9ddb |
| r6 | + bridge 常量墙修复（SequenceFieldCount 444→449） | 186764304 | 6ee7dd9a95aa6403b05f30336558e98e324cbd86009eb61c47938cb0bb4fb32a |
| r7 | + premisesExact 子序列修复 + canonicalize 五列搬运 + structureAppend 防御 | 186780720 | 29eee46ad8a4c27d4e8bc7e3f60e4155d268ae0966ae6352ae4106f10a0d7499 |
| r8 | + premisesExact 防御行修正（typeId>=variantOrdinals.len 误用扁平列长度判行界，enum 行 typeId=15 恒误拒；删除，行界由 variantStarts/Counts 每行列守卫） | 186780720 | 9d6ea3e697599822ea30aa35c05b45647c92cef491c56ac9db685837a75e6e3f |
| r9 | + arena↔schema kind bijection 桥 enum 臂（全量分派链排查后唯一漏点） | 186780720 | cb84245d7a092b8dc4cfe556e8cb6709fa43f4d713a93dddaac324b9b801c2a4 |

**烤机预算如实申报：任务给 3 轮，实耗 5 轮（r5-r9）。超支原因：r6 起每轮恰推进并暴露恰一墙（bridge 常量 → premises 语义 → 防御行 → bijection 桥），均为本线实现期 bug 的确定性因果修复，无方向性返工；每轮烤前均先做源码态/秒级门预验证（探针/四夹具/闭包 obj）。**

墙序列（t_enum 判词演进）：`production Type authority missing stage=3`（PhaseB-A 移交态）→ r5 `output storage already owned` → r6 `type trait premises are not exact`（同轮四夹具 133 trap=canonicalize 漏搬运，lldb+map 符号化定位）→ r7 同 premises（防御行扁平列误用）→ r8 `unsupported producer TypeArena kind` → r9 穿越全部 snapshot 墙，抵达 bootstrap 冷链 freeze 墙（非授权面）。

源文件 sha256 前 16（终态树）：schema f8316663dc58e8e7、builder bdbf45d229a19bb9（含他线 [phaseB-enum] hunks）、cargo 3d9c34dee78d92d1、bridge f97bde040c7214ea、validator 222799ce447e3e3a、gate.sh 59f26f25609f7259。

## 六、预存失败对照定性（git stash 单文件对照，stash 即恢复；均与本线改动无关）

1. `csg_compiler_snapshot_schema_smoke` run=1 `field replacement missed declarationDefaultStatementRootRows`：撤 cargo+validator 改动后同判词同挂（ParameterDefault wire 攻击段，parserSidecars 域）。
2. `semantic_snapshot_production_binding_smoke` compile=2 `cheng_cold: managed field replace RHS identity mismatch`：C 冷链 field-replace 身份判词，不同失败面。
3. `compiler_snapshot_lowering_bridge_release_smoke` run=1 `ORC alloc/free imbalance`（live=129）：撤 bridge 改动后 alloc/free/live 三值字节级一致（2193/2064/129）；本线 5 列对无 enum 程序为零长度数组，不参与 ORC 事件。
4. builder 单文件 --emit:obj 的 `expected indexed assignment value`：HEAD 预存源码形态（跨行 indexed assignment）C 冷链 parse 限制（见三、秒级门行）。

## 七、交付与移交

**交付**：/tmp/oob_ab/phaseb_enum_schema.patch（760 行，12 文件，全部带 [phaseB-enum-schema] 标记，reverse-check PASS；builder 内他线 [phaseB-enum] hunks 已过滤不在本 patch）。改动文件：schema v8 五列族（compiler_snapshot_schema）、builder 投影族（compiler_snapshot_builder）、cargo 字段族（compiler_snapshot_cargo）、validator field-set 契约（validator）、bridge tally+常量（compiler_snapshot_lowering_bridge）、官方 gate 字面量（tools/compiler_snapshot_lowering_bridge_gate.sh）、6 个 types fixture smoke 补列+manual_consume 版本断言 7→8。enum 声明探针（src/tests/zz_phaseb_enum_schema_decl_probe.cheng，仅声明不消费以隔开车头冷链预存墙）为任务级临时件，验收后已按生命周期纪律删除；探针规格见第三节验收表。

**enum 收官状态**：production snapshot schema 的显式 fail-closed 拒收（PhaseB-A 墙 4）已按「variant payload rows 显式 CSR 表示」契约扩展破解，enum 的 parse→typed→csg→lowering→plan→production snapshot 证据链全通（enum 声明探针 compile=0 run=0，四夹具 4/4 零回归）；t_enum（含 let 消费）编译推进至 bootstrap 冷链 freeze 身份墙——即 PhaseB-A 移交第 4 条明示的 C 冷链 SLOT 身份缺口（bootstrap/ 非授权面，树上他线在途），t_enum 全绿的最后一步归属该线。

移交事项：
1. [C 冷链/bootstrap] `exact identity schema [freeze] slot_name=s`（SLOT_I32 vs VARIANT 身份分裂深层形态）：t_enum/一切 enum 值消费程序 driver 链全绿的最后墙，bootstrap 非本线授权面（PhaseB-A 移交第 4 条承接）。
2. [字节铁门] r9 态 fixture 产物 96 字节尾部 receipt 非确定性（并行线在途 parser/typed_expr/bootstrap 漂移族，PhaseC-W5「字节门 FAIL 待静默窗补验」同族）：需静默窗复验归因；本线 r5 态已证 snapshot 层字节中性。
3. [smoke 预存] 第三节「预存失败对照定性」4 件：预存，留归属线处置。
4. [官方 gate] `compiler_snapshot_lowering_bridge_gate.sh` 字面量已同步 449；其 release smoke 在当前树态预存 ORC 判词（对照三），gate 全绿待静默窗。
