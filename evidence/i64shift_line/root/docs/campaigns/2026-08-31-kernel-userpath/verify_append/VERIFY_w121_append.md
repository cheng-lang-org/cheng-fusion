# wall121.VERIFY

## wall121 报告：cold_nested/v6 `cleanup_cfg: ownership binding requires managed local` 墙死亡（①判词富化 site+slot 全列→②定性=ref 句柄 local（LocalPtrTag，证明链 mg=2，8/8，tid=17）在 CleanupPlan managed local 准入门缺臂→③契约对齐四臂：require 补 LocalPtrTag + bind kind 双权威映射（slot 存储权威 vs 行 glue 域叶托管标记）+ 物化 drop 目标补臂 + 终审 dense-index 扫描同款对齐，单文件 cleanup_cfg.cheng 净 +63/−12）——cold_nested 判词推进至 `primary exact def freeze validate rejected`（primary/exact-def 域=v6 线领地，授权外停手移交）；v6 判词两连跳推进至同文件同域新墙 `cleanup_cfg: value definition consumed twice`（:8689-8702，wall120 镜像臂，烤机预算尽，修法设计完整移交）；ordinary 0/0、call_fixture 0/1 零回归；冷链 v6 0/0；共享 cold_object_cache 并行污染实锤+任务级缓存隔离配方落地；烤机 3 轮修法 + 1 轮字节全等归因重烤

日期 2026-09-03。授权面=src/core/analysis/cleanup_cfg.cheng（多臂：本墙及同域后续臂）。基线 HEAD=ce469ed71（进入时工作树该文件干净，git status 空）。

### 判定（本墙死亡；v6 同文件新墙暴露，预算尽移交；cold_nested 推进至授权外墙）
1. **①判词富化（轮 1）**：`cleanupCfgRequireManagedLocal` 加 siteTag 参数（1=bind `cleanupCfgStageBindOwnershipPlace`、2/3=schema-match target/source `cleanupCfgRequireMatchingManagedSchemas`）+ slot 全列实况（kind/managedStorage/place/size/align/typeArenaTypeId/slots）入判词，原文前缀保持 grep 连续；同轮富化 bind 侧 `ownership place id invalid` 判词（place/slot/typeRow/slotKind/rowKind/双 typeId/双 size/双 align）。秒级门 rc=0。
2. **②定性（轮 1 驱动实测，/tmp/oob_ab/w121/v6_a4.stderr）**：`cleanup_cfg: ownership binding requires managed local site=1 slot=0 kind=4 managedStorage=2 place=0 size=8 align=8 typeArenaTypeId=17 slots=41`。读法：v6 main 的 `var n: Node` 槽（slot=0）是 **LocalPtrTag=4** ref 句柄托管栈值（mg=2=ManagedTag 证明链在册，8/8=wall47 句柄权威 extent，tid=17=Node 精确 TypeId），死在 site=1（CleanupPlanBindOwnershipPlace 路径）。机理：生产端对每个未消费 OwnMove 值定义无条件 AddPlace（ownership_body_ir_production 值定义扫描不分 kind），ref 句柄定义合法到达准入门；而准入门只认 LocalStrTag/LocalAggregateTag——ref 句柄域（wall47 权威+wall118 cheng_ref_drop_owned/cheng_ref_retain_owned 胶）从未在 CleanupPlan 绑定层注册臂，属端口缺项非设计排除。**cold_nested 同轮实测**（cn_a2.stderr）：全程 str/i32（s0-s9 无一 ptr），不死于本墙，死于 `primary exact def freeze validate rejected`（primary_object_plan.cheng ExactDefCallAuthorityValidateInto+[wall84] dump）——派发时点的 w120 前墙已被 ce469ed71 快照（06:32，晚于 kernel_driver_w120 烤机 06:22）携带的在树各线臂清掉，cold_nested 现行墙在 primary/exact-def 域（v6 线 exact_def_identity/exact_def_derive 领地），按纪律停手完整移交。
3. **③修法（轮 2+轮 3，契约对齐零弱化，全在 cleanup_cfg.cheng）**：
   - **require 臂**：准入门补 `LocalPtrTag`（wall47/wall118 句柄权威链在册的托管存储形态，缺臂=端口缺项）。
   - **bind kind 互证映射**（:3039 区）：`slotKind==rowKind || (slotKind==LocalPtrTag && rowKind==LocalStrTag)`。双权威对齐：slot 列=槽存储 kind 权威（BodyIR 证明链），行 kind 列=glue 域叶托管类标记（唯一生产端 CleanupTypeLayoutIndexRegisterType 对每类型恒注册 LocalStrTag=「按槽地址单次 drop 胶调用」类；wall118 已证 ref 句柄与 str 同一 call-site 约定）。精确 TypeId+size+align 三列等式与跨类错配检测原样保留。
   - **物化 drop 目标臂**（:8739 区）：materialized DropPlace/DropField 目标同款补 LocalPtrTag（wall118 胶消费点）。
   - **终审 dense-index 扫描同款对齐**（cleanupCfgValidateOwnershipActionColumns，轮 3）：与 bind 门同一双权威谓词（auditSlotKind 越界哨兵 -1 保护取列序），绑定门放行的形状终审同判，否则「绑定过、终审必炸」自相矛盾。轮 2 验收实测 v6 恰死于此（`ownership place dense-index drift`），轮 3 修复后 v6 推进——因果闭环。
4. **验收（最终轮，隔离运行缓存，driver sha256=2fb26c6faa1495e10e11b4f6b0ea4b72187e9d30495fbe07fb99ad812694e723，size 185446208）**：`ownership binding requires managed local` 与 `ownership place id invalid` 在 cold_nested+v6 双夹具 grep=0（本墙死亡）。ordinary compile=0/run=0、call_fixture compile=0/run=1 零回归。冷链 v6（cheng_w121 --emit:exe）compile=0/run=0 pass。v6 新墙=`cleanup_cfg: value definition consumed twice`（:8689-8702 消费唯一性扫描，wall120 ownership_drop_ir 修复的 CleanupPlan 侧镜像：多 return 边对同一 TypedExpr 定义重复消费权威；本轮 dense-index 臂修复后按扫描顺序暴露，轮 2 v6 死点即其前置）；cold_nested 现行墙同轮 1（primary exact def validate，确定性复现 3 轮）。
5. **并行污染归因（重要副产品）**：轮 3 首次验收曾现 ordinary `merkle store identity: stage close failed`、v6 回跳 consumed twice 判词——但轮 2→轮 3 全仓源面仅本臂一处改动（find 全仓实证），不可能致此。归因实验：**任务级缓存重烤（CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w121/cache）产出与轮 3 字节全等驱动（sha256 相同）** ⇒ 轮 3 二进制无污染，异常全部来自运行期驱动共享主仓 `artifacts/cold_object_cache` 的并行 disk_guard 实时清扫/他线写入（build_kernel_driver.sh :156 注释自证此风险面）。验收脚本已改用任务级缓存导出，ordinary 即复归 0/0。**后续各线验收建议一律 `export CHENG_COLD_OBJECT_CACHE_ROOT=<任务目录>/cache`，任务末删除**。

### 门禁与验收实况（cwd=仓库根）
| 门 | 结果 |
|---|---|
| 车头重建 cheng_w121（clang bootstrap/cheng_cold.c，cheng_final 已被清理按派发重建） | rc=0，sha256=60043e25756624ba… |
| 秒级门 cleanup_cfg.cheng（轮1富化/轮2修法/轮3终审臂各一次） | rc=0 / rc=0 / rc=0 |
| 烤机轮 1（富化）/轮 2（修法）/轮 3（终审臂） | rc=0，driver sha256=824ef50ec0f74728… / 93f0c07427e072dc… / 2fb26c6faa1495e1… |
| 烤机轮 4（归因重烤，零源改，任务级缓存） | rc=0，与轮 3 **字节全等**（2fb26c6f…）——轮 3 二进制无污染实锤 |
| cold_nested × w121 | compile rc=1，本墙 grep=0；现行墙=`primary exact def freeze validate rejected`（3 轮确定性复现，授权外） |
| v6 × w121 | compile rc=1，本墙 grep=0；两连跳后现行墙=`cleanup_cfg: value definition consumed twice`（同文件同域 :8689-8702） |
| ordinary × w121 | compile=0 / run=0 不回归 |
| call_fixture × w121 | compile=0 / run=1 契约预期不回归 |
| 冷链 v6 × cheng_w121（语义参照） | compile=0 / run=0 pass |
| patch=工作树 diff 实证 | git diff HEAD == cfg_wall121.patch（sha256 675d1785… 双侧相等） |

### 交付与统计
- **/tmp/oob_ab/cfg_wall121.patch**（8948 字节，vs HEAD ce469ed71，单文件单 diff 净 +63/−12，sha256=675d17855ce716309f2134a243e96e21396509f0feb335b5f1313c2375e60ccf；apply 前后：进入时该文件 vs HEAD 为 0 差（git status 干净），apply 后 git diff HEAD --stat=+63/−12 与 patch 内容哈希相等=APPLY-CHECK PASS）。轮次补丁：cfg_wall121_r1.patch（富化轮，4560 字节，sha256=56c2d12d…）、cfg_wall121_r2.patch（修法三臂轮，sha256=67944848…）。
- 产物 /tmp/oob_ab/w121/：v6_a4.stderr（轮 1 富化判词定性全文）、cn_a2.stderr（cold_nested 轮 1 判词）、*_w121.* 终验收全套、*_w121_r2.*（dense-index 中间墙证据）、accept_w121.out/_r3.out/_r3b.out/_final.out（含污染→归因→隔离三段验收记录）、bake1-4 日志、secsgate_r1-r3 日志、v6_cold_w120 同款冷链参照 v6_cold_w121.exe/.run。
- 探针：本臂零探针夹具（富化判词即证据，未建 zz_probe_w121.cheng）；编排者资产（zz_v6_w7.cheng、user_path_gate.*）零触碰；未 git commit；主树仅 cleanup_cfg.cheng 一文件在改。
- 任务缓存 /tmp/oob_ab/w121/cache 已于交付时删除（冷对象缓存不跨任务保留）。

### 移交（下一臂完整设计+授权外证据）
1. **cleanup_cfg `value definition consumed twice`（:8689-8702，同域第 5 臂，烤机预算尽未落）**：wall120 修复（ownership_drop_ir :4619，本臂已核原文）的 CleanupPlan 侧镜像——多 return 边对同一 TypedExpr 定义（wall120 实测 origin_kind=TypedExpr/origin_id=10/domain=2/row=3）从共享 pre-edge 态各自重发 DropPlace 消费。修法设计：:8690 扫描跳过谓词加「双方 edgeId>=0 且 edgeId 不同」（上游 wall120 kind 感知权威已裁决跨 return 边互斥；cleanup_cfg 层仅 edgeId 列可用，同边与 op 域（edgeId<0）对仍留在扫描内；若求与 wall120 逐字同强需增 return-edge 标记 SoA 列，牵动 reserve/add/fingerprint/receipt 四处不变式，建议先落 edgeId 域对齐臂观察）。判词富化建议同 wall120 四元组+双 edgeId 全列入判词。
2. **cold_nested 现行墙=`primary exact def freeze validate rejected`（primary_object_plan.cheng + ExactDefCallAuthorityValidateInto/exact_def_freeze 域）**：v6 线领地，授权外未动。三轮确定性复现同判词，判词已带 [wall84] 全语义列+槽表 dump（stderr 存档 /tmp/oob_ab/w121/cold_nested_w121.stderr 与 cn_a2.stderr）。线索：`exact identity schema [freeze] fn=1 op row=4 kind=2 slot=2 has invalid path consume op_consumers=2 term_consumers=0 first=5 first_kind=2 second=12 second_kind=2 recorded=12 recorded_found=1 dataflow_valid=0`（slot2=str 24B 托管栈值 tid=13）。
3. **共享缓存纪律建议**：本战役各线驱动烤机与验收共用主仓 artifacts/cold_object_cache + 同父产物目录，并行窗口会产生 merkle identity 失败与陈旧阶段命中（本轮 ordinary/v6 假回归实证）；建议各线一律 CHENG_COLD_OBJECT_CACHE_ROOT 任务级隔离 + 验收前静置。
4. wall118/wall120 遗留顺延：backend2 管线 ref-owned drop 未实测；owned-ref-return sret ABI 与 pointee 级联深释放仍后墙候选（cleanup_cfg :4075 owned return snapshot 臂与 :9123 DropField 投影叶臂尚未补 LocalPtrTag——现夹具未触达，后续夹具撞到时按同款双权威论证补臂）。
