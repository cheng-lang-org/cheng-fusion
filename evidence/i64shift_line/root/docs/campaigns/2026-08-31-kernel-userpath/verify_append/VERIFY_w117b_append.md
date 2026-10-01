
## wall117b 报告：v6 `cleanup_cfg: value definition consumed twice` 墙（:8668-8689 消费唯一性扫描）修法落地（①判词富化 wall120 同款双消费坐标全列→②定性=多 return 终态边从共享 pre-edge 态逐边重发同一 TypedExpr 定义消费的 CleanupPlan 侧扫描缺互斥域（wall120 ownership_drop_ir 同族镜像，wall121 移交设计）→③契约对齐修法：plan 域内 return 边权威反查 helper（exitKinds/exitOwnershipEdgeIds 零新列）+ 扫描跳过谓词「双方 terminal-return 且边不同」，同边/op 域/非 return 边对全留扫描，单文件 cleanup_cfg.cheng 净 +40/−1）——ordinary 0/0、call_fixture 0/1、冷链 v6 0/0 零回归；v6 直证被并行 csg 线中间态上游墙挡（ingress→csg lowering plan 两连跳，r3 驱动+w117d 臂驱动双驱动同判词交叉实证），烤机 3/3 用尽，本墙死亡判据移交秒级复验

### 1. 基线与树态归因（进场上树态与派发判词不符，已归因）
- 进入时树态：cleanup_cfg.cheng 在树 diff +63/−12（wall121 全臂含 dense-index 对齐映射）。**10:01 并行线把 dense-index 审计的对齐映射收紧为严格等值**（+63→+42/−12，-[wall121] auditKindAligned 臂）；**10:30 该线继续原位加固**（require/物化 drop 目标两臂补 managedStorage==ManagedTag + typeArenaTypeId>=0 证明要求，+42→+53/−12 含本臂富化）。本臂全程未动其 hunks。
- kernel_driver_now8（烤于 08:02）实为 w121 轮 1 陈旧态（判词含 site/slot/kind 富化但无 LocalPtrTag 臂）：v6×now8 实测 rc=1 `cleanup_cfg: ownership binding requires managed local site=1 slot=0 kind=4 ...`（/tmp/oob_ab/w117b/v6_now8.compile.log），非派发所称 consumed twice——派发时点判词（user_path_gate.71857/ug_v6.stderr 尾行 consumed twice）出自更晚树态的驱动。
- cheng_final 已被清理，按派发重建条目以 cheng_w117b 顶替（clang bootstrap/cheng_cold.c，多次随并行线 bootstrap 再生重烤：03dde846→985c10cf→3696aa74）。

### 2. 烤机通道事故与隔离配方扩充（并行线接线中途实录）
- 派发烤机命令 `tools/build_kernel_driver.sh --manifest bootstrap/kernel_manifest.cheng` 被并行线 10:08-10:14 改造为 composition schema（manifest 换 compiler_composition_kernel_main 入口 + 脚本硬性 `--composition-manifest` 回执面），而 bootstrap/cheng_cold.c 再生物（10:31/10:47/10:54）始终无该 flag 解析（grep 计 0，33 处命中全是 decomposition）——脚本路径对所有线死的，烤机 1 首试 rc=2 `[cheng_cold] system-link-exec invalid argument: --composition-manifest`。
- 改用脚本内核同款直呼（HEAD manifest 的 entry=backend_driver_dispatch_min.cheng 逐字核对）+ `CHENG_COLD_OBJECT_CACHE_ROOT` 任务级隔离（wall121 配方），烤成 r1。
- **缓存权威配方扩充（10:54 起新 cheng_cold.c）**：`cold_object_cache_directory_current/payload_identity` 要求缓存目录与全部产物 payload `gid==egid`、目录无组/他写位（755）、文件 644、nlink==1。/tmp/oob_ab 树是 gid 0(wheel) ⇒ 本任务子树 `chgrp -R staff /tmp/oob_ab/w117b` 后烤通；kernel_fixed_out 共享产物目录同病，最终驱动烤在本任务目录再拷贝落位（cp+chgrp）。失败样本：`cold object cache path authority failed`（gid）、`cold object cache store payload identity failed`（产物 gid）。共享目录 gid 态对其他线同炸，编排者宜统筹。

### 3. ①富化+③修法（单文件 cleanup_cfg.cheng，两编辑）
- 富化：:8689 消费唯一性扫描判词加 wall120 同款全列 prev_index/action_index/prev_kind/act_kind/origin_kind/origin_id/domain/row/prev_edge/act_edge/prev_op/act_op/prev_place/act_place/prev_consume/act_consume（原文前缀 grep 连续）。秒级门 rc=0。
- 修法（契约对齐零弱化）：新增 `cleanupCfgOwnershipActionEdgeIsReturn(plan, edgeId)`——动作只在 exit 入队时落 plan（cleanupCfgStageQueueOwnershipExit 同点写 exitKinds 与 exitOwnershipEdgeIds），据此反查终态性；未命中/同边混 kind 一律按非 return 处理（fail-closed）。扫描跳过谓词与 wall120 逐字同构：`!(actionTerminalReturn && previousTerminalReturn && edgeId != previousEdgeId)`——一条执行至多经一条 return 边，不同 return 边对同一定义的消费互斥合法；同边重发、op 域（edgeId<0）与任何含非 return 边的对留扫描内；同路径跨顺序边双消费仍由流格拒绝。零新 SoA 列（不动 reserve/add/fingerprint/receipt 四处不变式；wall121 移交的「增 return-edge 标记列」方案不必动）。
- 秒级门（r1/r2 两态、新旧两车头）全部 rc=0。

### 4. 验收（r2 定版驱动 sha256=9dac12c7d5fcdb285936fc7143cdbfc02ce4dfc64d750677057c7e9fe9abaab0，size 186005872，烤于 11:05 树态闭包）
| 门 | 结果 |
|---|---|
| v6 × r2 驱动 | compile rc=1，判词=`lowering plan: compiler csg semantic parameter type drift function=addCol line=30 index=0 expected=@borrow:Box actual=Box`——并行线 csg/lowering 中间态上游墙（先于 cleanup_cfg），本墙不可达 |
| ordinary × r2 | compile=0 / run=0 零回归 |
| call_fixture × r2 | compile=0 / run=1 契约预期零回归 |
| 冷链 v6 × cheng_w117b | compile=0 / run=0 pass（语义参照） |
| cold_nested × r2（只记录） | compile rc=1 `csg compiler snapshot: value-definition producer authority drift`——同为他线 csg 域中间态 |
| v6 × r1 驱动（富化版，10:39 树态闭包） | rc=1 `ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=9 ...`——该线 ingress 中间态（其后 10:37-10:54 再落地） |

- 探针 zz_probe_w117b.cheng 两形（str 字面量形/ref OwnMove 形）均死于他线上游中间态墙（`lowering ownership transport: managed temporary definition missing`、`lowering plan: call target exact TypedExpr identity missing`），按「用后删」已删；A/B 对烤同被挡，未浪费预算。

### 5. 判定与遗留
- 本墙修法已完整落树并通过秒级门+零回归面；consumed twice 域的死亡直证待并行 csg 线落地后由任一新烤驱动对 v6 秒级复验（判据：`grep "consumed twice" = 0`）。烤机 3/3 用尽（r1 富化 16c082d8、r2 定版 9dac12c7、r3 归因重烤 2e4697b9）。
- **r3 归因重烤（11:49，sha256=2e4697b92f49ea7d1d0e73858aae12b1a07e1660e71a98b372c6c97c8e23b10c，size 185989456，11:37 静置态闭包）**：v6 仍死 `lowering plan: compiler csg semantic parameter type drift function=addCol line=30 index=0 expected=@borrow:Box actual=Box`；**交叉实证**：并行 w117d 臂驱动（11:42 烤，sha256=b9b25e45…）同刻 v6 run 死于逐字相同判词——当前树态下任何驱动均不可达 cleanup_cfg，csg 漂移墙是全战役现役最前墙（csg 线领地）。
- 权威链终审（本臂注释断言逐条核实）：exitKinds 写入值在 queue 路径受 `cleanupCfgPreflightOwnershipEdgeContract`（:7846，调用点 :7901）强制 `edge.kind != kind → fail`——helper 判定与 wall120 的 `ir.edges[edgeId].kind` 权威逐点同源，域对齐无弱化。
- 移交后续臂：现役上游墙（csg 线领地）= `lowering plan: compiler csg semantic parameter type drift`（v6 与 w117d 臂双证）；cold_nested 同刻死于 `csg compiler snapshot: value-definition producer authority drift`（同族域）。
- 产物 /tmp/oob_ab/w117b/：v6_now8/v6_r1/v6_w117b/v6_r3 compile log、accept_w117b.out、bake1/bake2/bake3 log、secsgate 各态 log、entry_probe、树态三快照（entry/pre_r2/pre_arm 基准文件 + pre.diff/mid.diff/final_check.diff）、三驱动 sha256、make_clean_patches.py。
- 补丁三件套：/tmp/oob_ab/cfg_wall117b.patch（合并，本臂净 +40/−1，3 hunks，apply-dry rc=0，基准=pre_arm 快照 32b3e8ec）+ cfg_wall117b_r1.patch（富化轮全文件 git diff 态）+ cfg_wall117b_r2.patch（修法轮净 2 hunks）。
- 任务缓存 /tmp/oob_ab/w117b/cache 于交付时删除（不跨任务保留）。
