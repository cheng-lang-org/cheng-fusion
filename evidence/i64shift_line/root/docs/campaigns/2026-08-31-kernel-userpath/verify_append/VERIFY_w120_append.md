# wall120.VERIFY

## wall120 报告：v6 `ownership_drop_ir: value definition consumed twice` 墙死亡（①判词富化四元组+actionIndex+双消费坐标→②定性=多 return 边对同一 managed def 的互斥终态边重复消费，排除上游盖章碰撞→③比较域对齐共执行域零弱化，单文件 ownership_drop_ir.cheng）——v6 判词推进至 `cleanup_cfg: ownership binding requires managed local`（cleanup_cfg 属并行 cold_nested 线活跃文件=契约边界，停手完整移交）；ordinary 0/0、call_fixture 0/1 零回归；冷链 v6 参照 0/0 pass；烤机 2/3 轮

日期 2026-09-03。授权面=src/core/analysis/ownership_drop_ir.cheng（派发原文写 src/core/backend/ 为笔误，实际唯一路径 analysis/）。本臂净变更=该文件 +21/−0（vs 本臂中途新 HEAD ce469ed71）。

### 判定（本墙死亡，判词推进至授权面外新契约点，停手移交）
1. **①判词富化**：ownership_drop_ir.cheng `ownershipDropValidateAnalysisPlan` 消费唯一性子句（原 :4618-4634）判词加 Fmt 全列：prev_index/action_index、prev_kind/act_kind（CleanupActionKind）、四元组 origin_kind/origin_id/domain/row、prev_edge/act_edge、prev_op/act_op、prev_place/act_place、prev_consume/act_consume（wall98/wall117 富化先例同款，原文作前缀 grep 仍命中）。秒级门 rc=0（cheng_w120 --emit:obj）。轮 1 烤机 rc=0（driver sha256=c0a4eaaf86f37b91…，后被轮 2 覆盖）。
2. **②定性（富化判词实锤，v6 × w120 全文 /tmp/oob_ab/w120/v6_w120_nextwall 同目录 v6_w120.stderr 轮1版）**：`prev_index=0 action_index=1 prev_kind=3 act_kind=3 origin_kind=1 origin_id=10 domain=2 row=3 prev_edge=2 act_edge=6 prev_op=-1 act_op=-1 prev_place=1 act_place=1`。读法：两个 **DropPlace**（kind=3）对**同一 place=1**（main 的 n）、同一 **TypedExpr 定义 (origin_id=10, domain=2, row=3)**（=wall118 判词的 op=3 `n = new(Node)` Initialize/OwnMove def，单一真实定义）各绑一次 consume，且**边 2 ≠ 边 6**。机理：emit 重放对每条边独立从 `blockOutputs[fromBlock]`（共享 pre-edge 态）发 cleanup（`OwnershipDropAnalyze` 逐边 `ApplyEdge(emitActions=true)`），main 4 个 return 边各自重发同一 DropPlace 消费；全局唯一性扫描跨边比较即炸。**候选②（上游 def 盖章 originId 碰撞）排除**：四元组只对应一个真实定义，双消费来自 drop IR 对多终态边的合法重发，非盖章端污染。wall118 预警的「句柄 place+字段 place」形未现形（prev_place==act_place==1）。
3. **③修法（契约对齐零弱化，+21/−0 单 hunk）**：消费唯一性比较域对齐共执行域——仅当**双方都在不同 return 边上**（`actionTerminalReturn && previousTerminalReturn && edgeId 不同`）跳过比较；return 边为互斥终态，一次执行至多走一条，永不共执行。全部共执行域保留在扫描内：同边、op 域（edgeId<0）对任意、涉任一非 return 边的对——即任何「同边双消费」「跨边串行双消费（非双 return）」检测原样。跨边串行同路径双消费本就由流格守卫：消费性 drop 置 place producer/def facts 清零、join 对不兼容精确定义 hard-fail 不放宽（:4717 注释在案）+ edge replay exceeds fixed point 复演校验。富化判词原样保留（契约点回归时仍全列坐标）。注释 13 行零弱化论证在案。
4. **验收（kernel_driver_w120 sha256=910e0077559a6b5f…，size 185429792，烤机轮 2 rc=0）**：v6 compile rc=1 但 `value definition consumed twice` grep=0（本墙死亡，旧墙族 grep 全 0），判词推进至 `cleanup_cfg: ownership binding requires managed local`（cleanup_cfg.cheng:3027/3022-3028 `cleanupCfgRequireManagedLocal`：CleanupPlan ownership place 绑定只认 LocalStrTag/LocalAggregateTag，v6 的 ref 句柄 local（LocalPtrTag 族）无臂——wall118 story 的 CleanupPlan 侧镜像墙）。ordinary compile=0/run=0、call_fixture compile=0/run=1 零回归。冷链 v6 参照（cheng_w120 --emit:exe）compile=0/run=0 pass。
5. **边界与并行**：cleanup_cfg.cheng 是并行 cold_nested 线（w86r 系）活跃文件（并行快照 commit ce469ed71 中 +872 行在树），撞契约边界即停，未动。烤机 2/3 轮（轮 1 富化、轮 2 定版，均 try1 rc=0）；零抬帽零 rc=125。并行快照 commit ce469ed71（06:32）把在树的前臂 +28/−2 hunk 与本臂富化态一并收进 HEAD——故最终 wall120.patch vs 新 HEAD 恰为本臂修法 +21/−0，apply 前后哈希链在案。

### 门禁与验收实况（cwd=仓库根）
| 门 | 结果 |
|---|---|
| 车头重建 cheng_w120（clang bootstrap/cheng_cold.c） | rc=0，sha256=dbe657c47a5fd3fb…（cheng_final 已被清理，按派发重建条目顶替同源参照） |
| 秒级门 ownership_drop_ir.cheng（富化后/修法后各一次） | rc=0 / rc=0 |
| 烤机轮 1（富化） | rc=0，driver sha256=c0a4eaaf…（轮 2 覆盖，bake1.log 在案） |
| 烤机轮 2（定版） | rc=0，kernel_driver_w120 sha256=910e0077559a6b5fdbed0e51cd2a715a04459a62457120ff0bdffecac21f7824 |
| **v6 × w120** | compile rc=1 判词推进：`consumed twice` grep=0（墙死），新墙=`cleanup_cfg: ownership binding requires managed local` |
| ordinary × w120 | compile=0 / run=0 不回归 |
| call_fixture × w120 | compile=0 / run=1 契约预期不回归 |
| 冷链 v6 × cheng_w120（语义参照） | compile=0 / run=0 pass |
| wall120.patch apply 实证 | HEAD 态 + patch → 与工作树字节全等（APPLY-CHECK PASS） |
| cold_nested × w120（只记录） | 未采——并行线在先，非本臂必采项 |

### 交付与统计
- /tmp/oob_ab/wall120.patch（2149 字节，vs HEAD ce469ed71，单文件单 hunk +21/−0，sha256=1842077211a13d0b…；apply 实证 HEAD+patch==工作树）。轮次补丁：wall120_r1.patch（3391 字节，富化轮，vs 旧 HEAD cdb5b5dd3 含前臂累积，sha256=7e573cba…）、wall120_r2.patch（==wall120.patch）。
- apply 前后 git diff --stat：进入时该文件 +28/−2（前臂在树 hunk，sha256=973bec32…与 wall115 基线逐一相等实证未变）；富化后 +29/−3；修法后（vs 新 HEAD）+21/−0（/tmp/oob_ab/w120/diffstat_post.txt）。
- 产物 /tmp/oob_ab/w120/：v6_w120.stderr（新墙全文）、v6_cold_w120.exe、ordinary_w120.exe/.run、call_fixture_w120.exe/.run、v6/ordinary/call_fixture compile log、bake1.log/bake2.log、diffstat_post.txt、sha256.txt、accept_w120.sh。
- 探针：本臂零探针夹具（富化判词即证据，未建 zz_probe_w120.cheng，派发条目空转）；编排者资产（zz_v6_w7.cheng、user_path_gate.* 残目录）零触碰；未 git commit；烤机 2/3 轮。
- **纪律自查**：曾误在烤机轮 2 进行中对半成品驱动启动验收脚本，当即 pkill 并清除半产物后重跑（无脏数据入台账）；后台复现循环与烤机自抢租约，停循环改引 wall118 存档裸判词实证。

### 移交（授权面外契约点，完整证据）
1. 下一墙=`cleanup_cfg.cheng:3022-3028 cleanupCfgRequireManagedLocal`（判词 `cleanup_cfg: ownership binding requires managed local`，v6 × w120 stderr 全文 /tmp/oob_ab/w120/v6_w120.stderr）。该文件为并行 cold_nested 线（w86r 系）活跃文件，撞边界停手。定性线索：`CleanupPlanBindOwnershipPlace`（:3069 区）→`cleanupCfgStageBindOwnershipPlace`（:3029）→require 臂只认 `LocalStrTag || LocalAggregateTag`（:3024-3027）；v6 的 `var n: Node` ref 句柄 local（LocalPtrTag 族，wall47/wall90 句柄权威同源）缺注册臂。另一调用点 :4972-4973（双 slot require）同域待查。修法面=cleanup_cfg.cheng（+可能 localTypeKinds 投影端），须与并行线合流后动。
2. wall118 遗留 2/3 原样顺延：backend2 管线 ref-owned drop 未实测；owned-ref-return sret ABI 与 pointee 级联深释放均后墙候选。
3. 本臂富化判词已在树并随并行 commit ce469ed71 入 HEAD——后续臂在 cleanup_cfg 侧撞 drop-IR 契约时坐标列直接可用。
