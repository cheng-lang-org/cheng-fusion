# wall117c.VERIFY

## wall117c 报告：cold_nested `exact identity schema [freeze] … has invalid path consume` 墙定性完成=修面在 exact_def_freeze.cheng walker 容忍臂(b)（授权面外，按停手纪律完整移交修法与全列取数）；授权面内交付=exact_def_identity.cheng consume path 取数诊断落树（判词富化，守卫零改动）；ordinary 0/0、call_fixture 0/1、车头 v6 0/0 零回归；v6 驱动只记录（并行线在先）；冷嵌套本臂烤窗被并行 composition/w117b 中间态截停（更早墙 `materialized BodyIR ownership invalid`，结构性非本臂归因）；烤机 3 轮（2 失败如实入账+1 成功）

日期 2026-09-03。授权面=src/core/analysis/exact_def_identity.cheng（唯一）。本臂净变更=该文件 +78/−0（进入时该文件零工作树 diff；w27/85/87b/91/104 hunks 已在 HEAD=ce469ed71）。

### 判定（定性=freeze 域契约偏差，授权面外停手移交；授权面内取数基建落地）
1. **墙形状（now8 判词+静态列联立）**：fn=1(nestedFmt) def=op4（Call，TEMPORARY str 槽2=内层 Fmt 临时串，OwnMove=2，place=1）双消费 op_consumers=2 term_consumers=0：first=op5（Call，cseq1，OwnMove 写结果槽0=外层 join；bod/bor=0/−1 无 source 边、非 CFG_MERGE place → 通道② CSR call-arg MOVE）；second=op12（Call，cseq5，t=−1 无目标、place=0 Invalid、consumer_source_def=4=通道① source 边，且 consume candidate 行全函数唯一=仅它持 source 边）=cleanup 物化 drop-glue 消费行（wall62/w81 在树注释设计形：物化后源仍由 drop unit 消费 cleanup_cfg:12532，版本不结束）。walker 在 block=8 的 op12 处 state=4(CONSUMED)（op5 先消费经支配/join 流入）→ 容忍臂(b) 判拒 → dataflow_valid=0 → 审计死。
2. **定性（C 契约逐字对照=本墙根因）**：C walker 同位容忍臂(b)（bootstrap/cheng_cold.c:55819-55858）在 `(state&CONSUMED)!=0 && recorded>0` 时**无条件 continue**（`oxa_rep`/`oxa_rep_exits`/`oxa_helper` 仅 CHENG_OXA_DIAG 诊断投影不构成门；HEAD 态=工作树态，非并行新改，历史 bulk 提交 f7a88ae28 即此形）；Cheng 端口（exact_def_freeze.cheng:1332-1362，随 f7a88ae28 入树）额外加 `if repExits || pairValid:` 门=端口比契约严。本形 representative=recorded=12==当前检查 op → pairValid 恒 false（first==second 守卫 C cheng_cold.c:52343 / Cheng :1524 同款）且 repExits=false（op12 块 term 非 Return，容忍未触发即证）→ 门必拒，join-move+cleanup-drop 双消费形全灭。车头同输入 compile=0/run=0 pass=语义合法参照。
3. **identity 侧无契约内修臂（穷尽）**：consumer summary/walker/pair 谓词/审计全为 freeze 单实现，identity :2513 经 `freeze.ExactDefFreezeIdentityConsumeEdgeAudit` 原样委托、对 consume path 零独立判定列；C `single_consumer_proved` 快道仅 count==1（本形 count=2）；两 PLAIN 容忍臂 slot2=STR managed 不适用；C `cold_exact_recompute_stale_consume_representatives`（cold_parser.c:36309 定义）仅修死戳（本形 recorded_found=1 活戳不触发）。
4. **修法移交（exact_def_freeze.cheng 单文件 ~6 行，C 55819-55858 对齐零弱化）**：容忍臂(b) 内删 `if repExits || pairValid:` 门，改 state 合并（`(state&LiveTag)!=0 → state=ConsumedTag|(state&UndefinedTag)`）+ `op++;continue` 无条件化；repBlock/repTerm/repExits/pairValid 删除或保留为诊断投影（C 侧即诊断语义）。该臂在共享 walker（点查询 queryOpExcl 同函数），单实现改动即全契约对齐；审计其余分支（recorded_found/brokenWithRecord/PLAIN 臂）与 C 逐字同构零触碰。修面属 freeze 授权线（wall81/w85/w86 同文件先例）。
5. **本臂烤窗被并行中间态截停（如实）**：烤机命令在当前树态不可直用——并行 composition 线 10:09 起改 tools/build_kernel_driver.sh（新增 `--composition-manifest:` 传参）+ bootstrap/kernel_manifest.cheng（entry 改 composition 系文件），冷链 C 侧无该参数（grep 0 命中，cheng_now8 同拒）→ 新脚本秒死 invalid argument；改用 HEAD 版脚本（ROOT 硬编码修正）+ HEAD 版 manifest 隔离。轮 1=新脚本秒死（参数面）；轮 2=主仓共享冷对象缓存 `installed entry verification failed`（并行改源+disk_guard 清扫竞态）；轮 3=CHENG_COLD_OBJECT_CACHE_ROOT 任务级缓存重定位烤成。轮 3 驱动验收：ordinary 0/0、call_fixture 0/1 零回归；cold_nested 死点推进到**更早**的 `ownership body ir production: materialized BodyIR ownership invalid code=15 site=1 index=-1 detail=3 fn=0`（w117b 线 cleanup_cfg.cheng 10:30 / ownership_drop_ir.cheng 10:31 在途中间态；materialize 校验先于 exact-def 审计执行，本臂 hunk 纯 freeze 失败分支 stderr 投影，零执行路径交集=结构性非本臂归因）；v6 死点=`ingress BodyIR ownership invalid code=15 site=2 index=9 … fn=3 op_kind=15`（同样并行中间态，只记录）。本臂墙（freeze consume path）在该烤窗不可达，静置重烤归因协议在案。

### 门禁与验收实况（cwd=仓库根；RSS 零抬帽；租约零冲突）
| 门 | 结果 |
|---|---|
| 车头重建 cheng_w117c（clang bootstrap/cheng_cold.c，10:05 树态） | rc=0（13 warnings 冷链既有噪音），sha256=404b795c…（全文见交付） |
| 秒级门 exact_def_identity.cheng --emit:obj | rc=0 |
| 烤机轮 1（新脚本） | 秒死 invalid argument（并行 composition 参数，冷链未支持） |
| 烤机轮 2（HEAD 脚本+HEAD manifest+主仓缓存） | 死 `cold object cache installed entry verification failed`（并行竞态） |
| 烤机轮 3（同轮 2+CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w117c/cold_cache） | rc=0，kernel_driver_w117c sha256=5b8c17e9…，size 185479456 |
| 车头 × v6（语义参照） | compile=0 / run=0（门过） |
| ordinary × w117c | compile=0 / run=0 不回归 |
| call_fixture × w117c | compile=0 / run=1 契约预期不回归 |
| cold_nested × w117c | compile=1 `materialized BodyIR ownership invalid`（并行中间态更早墙，见判定 5） |
| v6 × w117c（只记录） | compile=1 `ingress BodyIR ownership invalid`（并行中间态） |

### 交付与统计
- /tmp/oob_ab/identity_wall117c.patch（== identity_wall117c_r1.patch，+78/−0 单文件两 hunk，vs HEAD 累积式以当前树态生成，`git apply --check -R` 过）。
- apply 前后 git diff --stat（exact_def_identity.cheng）：apply 前 0 → apply 后 78 insertions(+), 0 deletions。
- 车头 sha256 / 烤机 sha256 见下（交付段补全）。
- VERIFY_w117c_append.md 已 python3 一次性并入共享 VERIFY.md；探针未建（now8 判词+本臂静态联立即取数，富化判词在树供下一烤取证，派发探针条目空转）；他人资产零触碰（zz_v6_w7.cheng、user_path_gate.* 残目录、composition 系在途文件、cleanup_cfg/ownership_drop_ir 在途 M 态均未动）；未 git commit。
