# wall111b.VERIFY

## wall111b 报告：cold_nested `ownership body ir production: materialized BodyIR ownership invalid` 墙死亡——定性=物化后 final decode 的 CFG 借主活性门拒「借视 current 而借主被 drop 单元杀死」（lattice 契约缺口：借视无任何终结机制）；修法=[wall111b] 借主死亡传播 sweep（body_ir_access CfgApplyOpTransfers Kill 变更相，净 +28/−0）+ [wall111b] final-decode 判词富化（production 末门，净 +19/−1）；判词推进至 exact_def freeze 墙（ApplyOwned 全链含 final decode/managed-replace 通过的下游阶段=推进实锤；该墙在 exact_def_freeze.cheng=w118 线正编辑领地，按契约边界停手完整移交）；ordinary/call_fixture/v6 记录见文末；烤机 3 轮

日期 2026-09-03。授权面=守卫文件 src/core/analysis/ownership_body_ir_production.cheng（判词站点）+ src/core/ir/body_ir_access.cheng（fail 门所在，wall111/wall116 同文件系）。主树净变更=两文件 [wall111b] 双 hunk（净 +47/−1）。

### ① 定墙（实测）
- 任务书所指 kernel_driver_now6 已被他线清理；实测用当前树态最新全量驱动 kernel_driver_w117（03:45 烤，sha256=c2dbf549…f5c58，wall117 patch 在树经 `git apply --check -R` 验证）。
- cold_nested 判词（主树根）：`ownership body ir production: materialized BodyIR ownership invalid`（裸文本）——wall113 移交的 ingress 墙已被 wall116 待物化 admit+w117 线清掉，死点移至 ApplyOwned 末尾**物化后 final decode 重审**（ownership_body_ir_production.cheng :1798-1801）。

### ② 富化取数
- [wall111b] 判词富化（wall82 ingress 同款、fail 路径专属）：final decode fail 站点补四元组+op 全语义权威列+槽表投影。随烤机驱动（轮 1，kernel_driver_w111b_probe，sha256=524c74cc…1b75）实测（主树租约被并行线长占，走 /private/tmp 快照根独立租约，wall114 通道）：
  `code=15 site=2 index=10 detail=1 fn=1 op_kind=2 op_target=-1 op_operands=1 a0=4 vd_slot=-1 vd_own=0 vd_row=-1 vd_node=-1 vd_origin=0 vd_origin_id=-1 bo_row=-1 bo_domain=0 bo_def_row=-1 consume_plus1=0 action_row=0 src_domain=2 src_row=5 slots=10 sealed=1 s0/s2/s4:tk=3:pk=0:mg=2:tid=13`
- 结构解码：index=10=物化 drop 单元 callOp（OwnInvalid 全哨兵+source=(BodyOp,5)+action_row=0，与 cleanupCfgAppendOwnershipDropUnit 盖戳逐列吻合）；detail=1 经全文件 ErrorOwnership fail 站点 detail 表达式逐一排除后唯一吻合=bodyIrAccessCfgApplyOpTransfers validate 尾借主活性门（detail=borrowOwnerOrdinal）。

### ③ 定性
- 死因：作用域出口 cleanup drop 单元 Kill 借主 def（ordinal 1）时，`actual == "…"` 比较产生的**借视 def（OwnBorrowShared）仍处 CFG lattice current 态**→「current 借视的借主必须仍 current」门 RED。
- 管线级缺口：借视 def 禁止携带 consume link（托管 def 审 OwnBorrowShared∧cp1!=0 即 fail）⇒ lattice 本无任何借视终结机制 ⇒ 凡「借用后于作用域出口释放借主」的合法程序必死此门，与程序合法性无关（cold_nested 为战役首个触达 final decode 的该形夹具）。

### ④ 修法（契约对齐零弱化）
- [wall111b] 借主死亡传播（body_ir_access.cheng CfgApplyOpTransfers Kill 变更相，单 hunk 净 +28/−0 全带标记）：owner 被 Consumed 同相内 fixpoint sweep 所有 borrowOwner==owner 的 current 借视一并 Consumed。契约依据=词法作用域（借视随借主作用域终结）+借视无 consume link 契约（lattice 唯一可行终结相）。
- 零弱化自证：①此前可过形处必无 current 借视（有则旧门已 RED），传播对其零触；②传播后对已终结借视的任何后续 Use 走 states[slot]!=ordinal 原判词 RED（悬空借用守卫面原样保留）；③Kill 合法性预检/Gen 借主预检零改动；④validate 与 replay 两相同步应用，不动点语义一致；⑤fixpoint 单调必终止。
- [wall111b] 判词富化 hunk 作为永久交付保留（wall82 先例，原文本前缀 grep 仍命中）。

### ⑤ 判词推进实锤
- 轮 2（kernel_driver_w111b，04:53 真实树烤，sha256=e1dc6a77…f4b9）与轮 3（kernel_driver_w111b_snap，快照树烤，sha256=95fd9330…1b75）冷嵌套判词均推进为 `cheng_cold: exact identity schema [freeze] fn=1 op row=4 kind=2 slot=2 has invalid path consume op_consumers=2 … recorded=12 recorded_found=1 dataflow_valid=0`（exact_def_freeze.cheng :889）。
- 推进因果链：primary_object_plan.cheng :65806 注记「derive 在 ApplyOwned 前落戳；freeze 验证在物化后（consume 戳为终态）」+ :65883 ApplyOwned → :65885 ExactDefFreezeSidecarSyncAppended 顺序——freeze 判词只在 **ApplyOwned 整体成功（含 final decode=本墙、managed-replace verify）之后**可达 ⇒ final decode 已通过=本墙死亡实锤。sweep 前无任何借视终结机制，本轮唯一 decode 行为变更=本 hunk（w118 未触碰 body_ir_access），归因成立。
- 同域多臂检查：final decode 的 OwnBorrowShared 臂/canonical-consume 臂/CFG 层无其他「权威时序」形残留；借视传播 sweep 已覆盖链式借视。

### ⑥ 下一墙定性（授权边界停手移交）
- freeze 墙：`exact identity schema [freeze] fn=1 op row=4 slot=2 consume op_consumers=2（first=5 second=12）recorded=12 recorded_found=1 dataflow_valid=0`——物化 IR 上某托管 def 的 consume 图出现双消费路径而侧车 recorded 单消费，dataflow 交叉审 RED。
- 修面=exact_def_freeze/exact_def_identity（w118 线 04:46 正编辑领地，其 now7 驱动 04:39 先于其编辑、其自身验收尚未覆盖 04:46 态）。按「病根若定性为须改其他文件，停手完整移交」停手。移交证据：双驱动判词全文（/tmp/oob_ab/w111b/cold_nested_real.compile.log 与 cold_nested_w111bs.compile.log）、物化 IR 列戳（本节②）、管线顺序注记（:65806）。

### ⑦ 门禁与验收实况（详见文末补记）
- 秒级门：cheng_w111b（clang 重建，13 warnings 冷链既有噪音）对两改动文件 `--emit:obj` 均 rc=0。
- 烤机 3 轮：轮1 probe 富化取数（524c74cc…1b75）；轮2 fix 真实树（e1dc6a77…f4b9）；轮3 快照树（95fd9330…1b75）。真实根 acceptance 因并行线（w118/memline2b/2c/w111c）持续持有 os atomic tree 租约，90-150s 退避多次 `parent lease unavailable`，最终以长退避循环取得（见文末补记实录）。

### ⑧ 交付与统计
- /tmp/oob_ab/wall111b.patch（累计式 vs HEAD 双文件，`git apply --check -R` 对当前树干净）；/tmp/oob_ab/wall111b_r1.patch（净增量双 hunk，反向 apply 干净）。
- git diff --stat（两文件 apply 后现状，含在树 w82/w108/w111/w116 hunks）：ownership_body_ir_production.cheng +162/−10、body_ir_access.cheng +281/−18；本线净归属 +47/−1（numstat）。
- 产物 /tmp/oob_ab/w111b/：probe/snap 双驱动判词日志、快照物证、make_r1.py/build_patch.py 补丁复现脚本、bia_pre|post/prod_pre|post 四态存档、accept 脚本与双根验收日志。
- 他人文件零触碰（w117/w118/memline2b/2c 工作目录、zz_v6_w7.cheng、user_path_gate.*）；未创建探针夹具；未 git commit。烤机 3 轮（预算内）。

### 文末补记（真实根验收实录与归因，2026-09-03 07:15 收口）
- 真实根租约：w118/memline2b/2c/w111c 四线同窗持续持锁，本线两轮验收循环（exe 轮 8×100s×4 夹具、obj 轮 6×90s×4 夹具）共 40+ 次尝试，除下述三次外全部 `parent lease unavailable`（日志 /tmp/oob_ab/w111b/*_real.obj.stderr 等）。
- call_fixture × bake2（真实根 obj）：compile=2 `primary object CSGC plan: native object emission plan: entry symbol empty`——已通过 ApplyOwned（含 final decode 与 sweep 无操作形）与 exact_def freeze，死于 primary 发射规划。归因=w111c 线 primary_object_plan 04:39-04:53 窗口中间态（其驱动 w111c_a 05:12/w111c_b 05:28 在烤），非本臂：call_fixture 无 borrow+drop 形，sweep 对其 lattice 逐位无操作；该夹具以 now7（04:39 树）于 05:31 真实根通过。
- v6 × bake2（真实根 obj）：compile=1 `ownership_drop_ir: value definition consumed twice`——v6=w118 线夹具，判词与其 04:46 exact_def 及同窗改动相关（w117 期该夹具判词为 production drop-glue authority）；sweep 无 IR/plan 副作用，非本臂因果。
- ordinary × bake2：未获租约。结构零回归论证：sweep 仅在「Kill 发生且存在 current 派生借视」场景追加 Consumed——该场景在旧 lattice 下必 RED，故对任何曾通过编译的夹具 lattice 逐位不变、判词不变。他线最近实证：now7 于 05:19 真实根 ordinary compile=0/run=0。
- cold_nested 判词推进的双驱动实证：bake2（真实树 04:53 烤）与 bake3（快照树烤）一致推进至 exact_def freeze 墙；快照根全判词存 /tmp/oob_ab/w111b/cold_nested_w111bs.stderr。
- 烤机 3/3 轮（probe 524c74cc…1b75 / fix e1dc6a77…f4b9 / 快照 95fd9330…1b75），预算内收口。
- 快照根 /private/tmp/oob_ab_w111b_snap 实验毕即删；本线探针夹具未创建；patch 与 sha256 见⑧。
