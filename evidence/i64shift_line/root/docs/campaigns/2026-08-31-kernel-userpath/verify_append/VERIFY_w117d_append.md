# wall117d.VERIFY

## wall117d 报告：cold_nested freeze consume path 墙死亡（exact_def_freeze.cheng 容忍臂(b) 删 `if repExits || pairValid:` 端口加严门，对齐 C 契约无条件 continue）——cold_nested 判词推进至 `csg compiler snapshot: value-definition producer authority drift`（csg_core 域=契约边界，停手完整移交）；ordinary 0/0、call_fixture 0/1 零回归；冷链车头 v6 0/0；v6 驱动只记录（lowering_plan 域判词，并行线在先）；烤机 1/3 轮一次过；零租约冲突

日期 2026-09-03。授权面=src/core/analysis/exact_def_freeze.cheng（唯一）。本臂净变更=该文件 +11/−28（进入时该文件工作树零 diff，w81/w94/w86 hunks 已在 HEAD=e64a45629）。

### 判定与机理
1. **修法按 w117c 移交原样落地**：walker 容忍臂(b)（exact_def_freeze.cheng:1332-1362）外门 `(state&ConsumedTag)!=0 && recorded>0` 与 C 契约（bootstrap/cheng_cold.c:55819-55858）逐字同构零触碰；删端口自加的 `if repExits || pairValid:` 门（C 同位 rep/rep_exits/oxa_helper 仅 CHENG_OXA_DIAG 诊断投影不构成门）；臂内改 state 合并（`(state&LiveTag)!=0 → ConsumedTag|(state&UndefinedTag)`）+ `op++;continue` 无条件化；representative/repBlock/repTerm/repExits/pairValid 投影列删除（Cheng 端无诊断发射点，纯查询助手 `exactDefFreezeMutuallyExclusiveConsumerPairValid` 调用删除与 C 诊断语义严格等价；:2598 wall86 导出仍引用助手，零死符号）。守卫零弱化=对齐 C 契约。blame 归因=f7a88ae28（与 w117c 移交一致）。
2. **本墙死亡实证**：cold_nested × kernel_driver_w117d 判词 log 中 `invalid path consume`/`exact identity schema` grep=0（2 次编译逐字节确定性复现）；双消费形（op5=join MOVE 通道② + op12=cleanup drop 通道①）经容忍臂(b) 无条件 continue 放行，dataflow 审计不再拒。
3. **下一墙（契约边界，停手移交）**：cold_nested 新判词=`csg compiler snapshot: value-definition producer authority drift`（compile rc=2）。发射点=src/core/csg_core/compiler_snapshot_schema.cheng:11530-11535：valueDefinitions[definitionRow] 与 typedNodes[definingTypedNodeId] 交叉校验（index 界/functionId 归属/producedValueDefinitionRows 反向指针/ownershipKinds 相等/proofKind 值域）任一不成立即判 drift，判词零列（无 definitionRow/definingTypedNodeId/functionId 实况）。定性要点：①夹具语义合法性由车头参照证明（cheng_final2 同输入 compile=0/run=0 输出 `cold_nested_fmt_interpolation=pass`，C walker 同为无条件 continue 形）；②本臂仅放行此前死于 freeze 墙的程序形状，快照校验系编译推进后新可达的下一墙，非本臂引入（本臂 hunk 只在 freeze 失败分支减代码，与 snapshot 表零交集）；③修面候选=csg_core/compiler_snapshot_schema.cheng（判词富化先行，wall98/wall117c 先例同款：加 definitionRow/definingTypedNodeId/functionId/ownershipKinds/proofKind 全列）+ 上游 producer 盖章端（typedNodes.producedValueDefinitionRows/ownershipKinds 写侧）二选一定性。**全部在 freeze 授权面外 → 按「撞契约边界即停」停手**；烤机预算 1/3 轮余量充足，可直接进下一臂。
4. **v6 驱动只记录**：v6 × kernel_driver_w117d compile rc=2，判词=`lowering plan: compiler csg semantic parameter type drift function=addCol line=30 index=0 expected=@borrow:Box actual=Box`（lowering_plan.cheng 域，v6 线并行领地在先，零触碰）。
5. **车头烤制偏离（如实归因）**：派发命令 `clang bootstrap/cheng_cold.c` 在当前树态不可用——工作树 C=并行 composition 线在途大改（vs HEAD +1519/−237，22 hunks），其新增 cheng_cold.c:108660 `fexecve` 调用在 macOS 结构性不可编译（SDK unistd.h 无声明、libSystem 无符号、HEAD 零 fexecve；-D_DARWIN_C_SOURCE 同死；exec 安全部拒打桩）。降级=HEAD 同源自洽工具链：`git show HEAD:bootstrap/cheng_cold.c` 提取件（-I bootstrap 解析 cold_parser.h/cold_parser.c 等，均 HEAD=工作树）烤 cheng_w117d + HEAD 版 build_kernel_driver.sh（ROOT 硬编码修正为仓库根，w117c 同配方）+ HEAD 版 kernel_manifest.cheng + `CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w117d/cold_cache` 任务级缓存隔离。秒级门双跑：cheng_final2（派发所指 cheng_final 已被他线清理，用现存最新 final 车头 09:11）与 cheng_w117d 各 rc=0。

### 门禁与验收实况（cwd=仓库根；RSS 零抬帽）
| 门 | 结果 |
|---|---|
| 车头 cheng_w117d（HEAD C 提取件 clang -std=c11 -O2） | rc=0，sha256=046eb18f741c9fef54ee935d8cc657519e162861571cefccb81e399e45701d2f |
| 秒级门 exact_def_freeze.cheng --emit:obj（cheng_final2 / cheng_w117d） | 双 rc=0 |
| 烤机轮 1（HEAD 脚本+HEAD manifest+任务级冷缓存） | rc=0 一次过，entries=35，kernel_driver_w117d sha256=b9b25e45ff788399d4bf6a0addf8a837508b2ef194e0cafa9a93f2be9feb9e9c，size 185989456，烤机 1/3 轮 |
| 车头 × v6（冷链门） | compile=0 / run=0 |
| 车头 × cold_nested（语义参照） | compile=0 / run=0，输出 `cold_nested_fmt_interpolation=pass` |
| cold_nested × w117d | compile rc=2 `csg compiler snapshot: value-definition producer authority drift`（本墙死亡，判词推进，2 次逐字节确定性；`invalid path consume`/`exact identity schema` grep=0） |
| ordinary × w117d | compile=0 / run=0 不回归 |
| call_fixture（zz_call_fixture_w7）× w117d | compile=0 / run=1 契约预期不回归 |
| v6 × w117d（并行线在先只记录） | compile rc=2 `lowering plan: compiler csg semantic parameter type drift`（lowering_plan 域） |

### 交付与统计
- /tmp/oob_ab/freeze_wall117d.patch（== freeze_wall117d_r1.patch，单轮收敛，单文件单 hunk +11/−28，vs HEAD 累积式以当前树态生成，`git apply --check -R` 过；sha256=2db57792ea82aec0d6fec992d5f03fcef05a3d0e7ea7af3608a25afff06da174）。
- apply 前 git diff --stat（exact_def_freeze.cheng）=0 → apply 后 11 insertions(+), 28 deletions(-)。
- 车头 cheng_w117d sha256=046eb18f…45701d2f；烤机 kernel_driver_w117d sha256=b9b25e45…feb9e9c。
- 零探针夹具（确定性判词+静态发射点定位即取数，zz_probe_w117d.cheng 未建）；主树仅 exact_def_freeze.cheng 一文件在改；他人资产零触碰（zz_v6_w7.cheng、composition 系在途文件、cleanup_cfg/ownership_drop_ir/typed_expr 等他线 M 态、user_path_gate.* 均未动）；未 git commit。
