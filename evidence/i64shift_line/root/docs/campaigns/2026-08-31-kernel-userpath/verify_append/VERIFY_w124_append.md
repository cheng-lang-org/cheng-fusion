# wall124.VERIFY

## wall124 报告：cold_nested `exact identity schema [freeze] fn=0 op row=13 managed borrow projection is broken parent_live=0` 墙死亡（w123 移交修法落地：exact_def_identity.cheng 单文件单臂 [wall124] owned-entry-root 整值借视直等第三臂 = wall27 形状子句逐字保留 + entry 所有权互证改接 Move/Plain + 借主槽写者集扫描活性证据，纯增量 fail-closed 零弱化）——cold_nested 判词推进至 `fn=1 op row=4 consume edge is broken … recorded=-1 recorded_found=0 dataflow_valid=1`（exact_def_freeze.cheng :928 判词 / :2028 audit :2075 brokenNoRecord 门，落戳权威在 derive 批 2 CSR 臂 / cleanup_cfg 物化域=授权面外契约边界，停手完整移交）；ordinary compile=0/run=0、call_fixture compile=0/run=1、车头 v6 compile=0、车头 cold_nested compile=0/run=0 `cold_nested_fmt_interpolation=pass` 零回归；v6 驱动 rc=2 `lowering plan: compiler csg semantic parameter type drift function=addCol` 同 w122 记录态（并行线领地只记录）；烤机 2/3 轮（r1 死于在树 ts-csg 迁移在途缺口 `--composition-manifest` 归因既有非本臂，r2 head 三件套成）

日期 2026-09-03。授权面=src/core/analysis/exact_def_identity.cheng 单文件。车头=/tmp/oob_ab/cheng_w124（HEAD 提取件 bootstrap/cheng_cold.c `clang -std=c11 -O2 -I bootstrap`，sha256=4fe804dec98f86c548c822e188fa1d1913470a6e6f386452ad49b45f36074bcd；在途直烤 rc=0 但运行死于 `cold object cache store payload identity failed (recovery=0 depth=1)` 树态缺口，w122/w123 同记，按其配方降级 HEAD 提取件；cheng_final 资产已不在，秒级门/参照门以 cheng_w124 执行）。基线复现驱动=kernel_fixed_out/kernel_driver_w122 sha256 前缀 4054f823，进场实测判词=wall123 移交态逐字（`fn=0 op row=13 … parent_live=0 parent_slot=-1 …` + wall84 全列 dump；派发文引 `fn=1 … has invalid path consume` 系 w121 时代线索判词混入，以本轮进场实测为准）。

### 判定（本墙死亡，判词推进至授权外契约边界，同域无残留臂）
1. **修法按 w123 spec 全量落地**：exact_def_identity.cheng `exactDefIdentityBorrowProjectionDefinitionValid` 的 paramBorrowViewProjection 前置（:1990 域）新增同域第三臂 `exactDefIdentityOwnedParamBorrowViewProjectionValid`，接入既有双臂析取。臂形=**owned entry 根整值借视直等**：①仅 entry 形参根（entryParameterSlotIds 在界，全局地址根不放行）；②形状子句与 wall27 直等臂逐字同款（基座直等 operands[0]==借主槽 / FieldLoad 4 操作数 / operands[1]==vds==target 双直等 / off==0 / width==借主槽全宽 / TypeId 双等）；③entry 所有权互证改接 owned 双形态 eo∈{OwnMove,OwnPlain}，且要求冻结封印在册方可读（较 wall27 未封印跳过子句更严，fail-closed 方向）；④owned 根特有活性证据=借主槽写者集扫描（exactDefIdentityIdentityViewSlotTerminalValid 同款写者集原语：def 写 valueDefSlot==借主槽 ∨ store 族写 store 族 kind && target==借主槽），体内零写者即原值未重绑、贯穿全函数，共享借视语义健全（cold_nested fn=0 s0 实况零写者；车头同输入 0/0 pass 为语义参照）。不合形一律 return false 交回原主门与原判词；本臂只可能把「现拒绝形」翻为放行（false 分支落点与改动前逐字节同路），绿路径零弱化。
2. **本墙死亡实锤**：kernel_driver_w124 编 cold_nested，fn=0 的 op13 `managed borrow projection is broken` 判词消失，fn=0（nestedFmt，ops=31）整函数过 identity 批 3，验证推进到 fn=1。
3. **同域无残留**：fn=1 无 entry 形参（entry_params=0），其新墙为 Call 定义行的消费边审计，与 BORROW_PROJECTION 臂族无关；本臂授权域（identity BORROW_PROJECTION / exact_def_identity.cheng）在两函数上均无后续假门。

### 下一墙定性（授权外契约边界，完整移交）
判词：`cheng_cold: exact identity schema [freeze] fn=1 op row=4 consume edge is broken consumers=1 term_consumers=0 first=5 first_kind=2 second=-1 second_kind=-1 recorded=-1 recorded_found=0 dataflow_valid=1` + `primary exact def freeze validate rejected fn=1 ops=16 slots=10 sealed=1 entry_params=0`（stderr 存档 /tmp/oob_ab/w124/cn_w124_compile.log，含 fn=1 全列 dump）。
- 解码：def 行 4（o4: k=2 Call, t=2, vds=2, vdo=2 Move, opk=1）定义 slot2（s2: tk=3 LocalStr tid=13 sz=24 esk=2 Object 托管）；唯一消费者行 5（o5: k=2 Call, t=0, vds=0）；valueDefConsumeOpIndexPlusOne==0 → recorded=-1/recorded_found=0；dataflowValid=1；slotStorage=Object 非 Plain → `plainSingleConstructorMove` 豁免不成立 → exact_def_freeze.cheng :2075 `brokenNoRecord` 门（单消费者无落戳必拒）发 :928 判词。
- 机理：托管 Object 槽单构造 move 必须落 consume 戳；本形 lowering/derive 未落（「lowering call 的 CSR 戳在 derive 批 2 臂已落」契约，exact_def_freeze.cheng :2139 注释锚定；ApplyOwned 物化落戳点见 cleanup_cfg.cheng :9983/:10313/:12275/:12333 域）。修面=exact_def_derive.cheng 批 2 CSR 落戳臂或 exact_def_freeze.cheng 审计容忍臂（后者须先证缺戳为合法形），两文件均不在本轮授权面，按纪律停手。
- 注：派发文引的 w121 线索判词（`fn=1 op row=4 … has invalid path consume op_consumers=2 … recorded=12 … dataflow_valid=0`）与本次推进墙同一 fn/row/slot 坐标但审计支不同（其时 fn=1 体有双消费者 {5,12}，今体 16 ops 单消费者零落戳）——w121 后各线（wall122 侧车同步、lowering/cleanup 各臂）已改写 fn=1 体，非同一定位可复用旧修法 spec，须按本轮 dump 重定性。

### 门禁与验收实况（cwd=仓库根；RSS 零抬帽；零探针夹具残留）
| 门 | 结果 |
|---|---|
| 秒级门（车头编 exact_def_identity.cheng obj） | 改前 rc=0 / 改后 rc=0 |
| cold_nested × kernel_driver_w124 | compile rc=1，**本墙判词消失**，推进 fn=1 consume-edge 墙（判词原文在上节） |
| cold_nested × 车头 cheng_w124 | compile=0 / run=0，输出 `cold_nested_fmt_interpolation=pass`（语义参照，改前改后各跑一致） |
| ordinary_zero_exit × w124 | compile=0 / run=0 不回归 |
| zz_call_fixture_w7 × w124 | compile=0 / run=1 契约预期不回归 |
| zz_v6_w7 × 车头 | compile rc=0（回归门过） |
| zz_v6_w7 × w124 | rc=2 `lowering plan: compiler csg semantic parameter type drift function=addCol line=30 index=0 expected=@borrow:Box actual=Box`，与 w122 记录态同域（并行线领地，只记录） |
| 烤机 | 2/3 轮。r1（在树脚本+在途直烤车头）build_rc=2 `[cheng_cold] system-link-exec invalid argument: --composition-manifest:bootstrap/kernel_manifest.cheng`——在树 tools/build_kernel_driver.sh（15:17 ts-csg 迁移态）要求 composition 感知车头，而在树/HEAD cheng_cold.c 均无该旗标（grep 计 0）=既有迁移缺口归因；r2 改 head 三件套（HEAD 脚本+ROOT 修正一行=复刻 w121b 修正版 /tmp/oob_ab/w121b/build_kernel_driver_w121b.sh、HEAD kernel_manifest、cheng_w124）+ CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w124/cold_cache 任务级隔离，rc=0 |

### 交付与统计
- **主树单文件**：src/core/analysis/exact_def_identity.cheng 进场 sha256=6bbe859d1489595379b1afc25bb6cdb5bfd80c2740464bbf11a36f6b354f1e73（=wall123 进场态 +78 既有 hunks）→ 离场 fa05801d680d0d2082358da195321fd2cca7267495f3c7982331bb9b6ff50b77；git diff --stat（vs HEAD）apply 前 `78 insertions(+)` → apply 后 `161 insertions(+), 3 deletions(-)`（既有各线 +78，本臂净增 ≈ +83/−3）；其余文件零触碰（git status M 集合与进场一致，未 git commit）。
- 补丁：/tmp/oob_ab/identity_wall124_r1.patch 与最终合并 /tmp/oob_ab/identity_wall124.patch 字节全等，sha256=e844e14ff3424686368cccf6020d5d9c6b842cbe0091c15ce460319e42995357，202 行；`git apply --reverse --check` rc=0（当前树态自证）；forward check 在已应用树上按预期 fail。
- 烤机产物：kernel_driver_w124 sha256=01b9a5e066a2b039b6ba99344c535f9cdc764ddb59c9e7122af4bffc05032614（size 186022384，r2 head 三件套烤于本臂终态树）。
- 作业目录 /tmp/oob_ab/w124/：进出场全部编译/运行 log（cn_base、cn_w124_compile、ordinary/call/v6 × 车头+w124、tc_base/tc 秒级门、bake_r1/r2）、cheng_cold_head.c 提取件、head 三件套（build_kernel_driver_w124.sh、kernel_manifest_head.cheng、cold_cache/）。零探针夹具（wall123 定性闭合+driver dump 全列已足证，zz_probe_w124.cheng 未创建）；他人资产（含 user_path_gate.* 工作目录）零触碰。
