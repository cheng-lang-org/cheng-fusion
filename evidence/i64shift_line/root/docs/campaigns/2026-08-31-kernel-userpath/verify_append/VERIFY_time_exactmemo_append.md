# VERIFY_time_exactmemo_append —— [TIME-exactmemo] .cheng 侧 exact-def 准入族数组化/会话索引三刀

date_utc=2026-09-05 深夜至 09-06 凌晨 · 代理=TIME-exactmemo 线（战役 R 编译时间线） · 克隆=/Users/lbcheng/cheng-f24/anchor_clones/time_memo（HEAD=73debaef2 干净检出 + bootstrap/cheng_cold.c stage2 诊断探针 hunks + 本线 analysis 三文件 hunks）· 主树代码零接触（仅 campaign docs/patches 追加）· 未 git commit · file face=src/core/analysis/{exact_def_merge,exact_def_freeze,exact_def_call_authority}.cheng

## 结论先行

**三刀全部落地并通过门禁链：六件 exact_def smoke（stage3 编译运行）全绿；exact_def 门族与 HEAD 基线逐字节同过同败（6/6 零差，失败 4 门为 stage3 陈旧预存漂移）；配对烤机确定性 PASS（B1=B2=b06d1e34，M1=M2=b45b0e06）；user_path_gate 四夹具双驱动 4/4 PASS 判词逐字全同。** 时间收益如实：四夹具 compile wall 量级无可见收益（B→M −0%~+5% 噪声内），收益面在大体准入（census F1-F3）——驱动编译 exact_def 模块自身 smoke 实测基线即 >26min CPU 不收敛（能力墙新数据点，且为基线驱动非 memo 驱动），A/B 不可完成，标注待复测。途中抓出并修复 S1 stamp 索引的跨块覆盖缺陷（P7 leg 实证），修复后为纯 CSR lockstep 形。

## 一、落刀明细（file:line 锚点，全部 [TIME-exactmemo] 标记）

| 刀 | 位置 | 改法 | 语义恒等论证 |
|---|---|---|---|
| S1 merge lattice | exact_def_merge.cheng（workspace 类型块 +566 latticeBuild + 定点内层原 704-713） | 每块 slot→末定义行 CSR（starts/slots/rows，块内去重槽插入排序升序）+ 定点重访 lockstep 查表，O(S×O_block)/visit → O(S+D_b)/visit | 构建按块内 op 升序覆盖写=原内层扫描的末匹配 op；slots 升序与 slot 升序对齐；未命中槽保持 states[slot]（原扫描无定义不覆盖同值）；出域/OwnInvalid 行原扫描永不匹配同跳过 |
| S2b 消费者摘要批表 | exact_def_freeze.cheng（workspace +consumerSummaries 列 + :865 批表构建器 + ConsumeEdgeAudit 入口重建读行） | per-def 全 ops 重扫（O(defs×ops)）→ 单遍 consumer 侧反枚举批表，审计入口一次成型 | 候选集={sourceDefRow}∪argDefOpRows[call 窗]∪{mergeSecondInputRow} 为谓词三放行通道的必要集，去重后调用**同一谓词本体**判定（不重推导豁免），(def,consumer) 判定逐位同；consumer 升序=原 op 升序，first/second/last/count 同值；terminalCount 由 terms 单遍归并出域跳过（原永不匹配同值） |
| S3 CurrentDefBefore CSR 限界 | exact_def_call_authority.cheng（:315 原形保留 + :337 Indexed 形 + 相位入口建索引 + 4 站点切换） | 全 op 行倒扫 O(span) → 该槽定义行 CSR 倒序枚举，O(候选数)；(def,consumer) reaches 谓词与短路点不变 | CSR 行恰为 valueDefSlot==slot 过滤的全部命中行（升序），倒序截 <beforeOp=同一候选序列首命中逐位同；域前提=五站点 slot∈[0,localSlots.len) 全有守卫（出域行在 derive/freeze 槽列索引先行不可达）；**原形保留**给夹具直接引用的 BorrowResultVarRootCallValid（src/tests:869 位置参数契约，签名不可动，src/tests 非 file face） |
| 转发出口 | exact_def_freeze.cheng（批 3 同源出口段 +ExactDefFreezeIdentitySlotDefinitionIndexBuild） | freeze:1894 CSR 构建器纯转发导出，零逻辑新增 | 与本段既有出口同例 |

密封体单遍前提核实：三刀索引全部为「每次 latticeBuild/审计入口/相位入口就地重建、会话内只读、无跨体残留」——比 census M1-M3 的跨相位共享更保守，body/sidecar 在 validate 内零写前提仅被**读取**而非依赖（索引生命周期≤单次构建函数），故「密封体」论断即使局部失效也不产生脏读。C 侧 mutation-epoch 机制按普查定谳在 .cheng 侧不需要，未实现。

## 二、S1 缺陷实录（抓出→修复→实证）

首版 S1 用 slot 级 stamp/pos（每 slot 仅存一份），多块同槽定义时后块覆盖前块的 stamp/pos → 前块 gen 丢失。merge smoke P7（global shadow 同槽双臂体）静默红（end b1 应为 op1 实为 Consumed，探针 dump 定位），HEAD 基线对拍确认系我引入。修复为纯 per-block CSR + lockstep（无跨块状态），P7 双断言 entryState=1/-2 恢复，九腿全绿。教训：slot 级 stamp 只能表达「最后一块」，定点循环按块查表必须块粒度键。

## 三、门禁台账

| 门 | 结果 | 证据 |
|---|---|---|
| 六件 exact_def smoke（stage3 编译运行） | 6/6 全绿 | merge/freeze/call_authority/identity/derive/materialize 各 UNIT_OK，compile rc=0 run rc=0 |
| exact_def 门族 HEAD 同源对拍 | 6/6 输出零差 | merge/call_authority/derive 双态 PASS；freeze/identity/materialize 双态**同腿同 md5 同败**（got 08944…/b4a99…/6f93f…/6dcf8…/32e9e…/5bdce… 全同）=stage3（8/31 旧件）vs HEAD 门期望的预存漂移，与本线无关且构成负例判词零漂的强对拍 |
| 配对烤机确定性 | PASS | B1=B2=b06d1e348e0e…f136713（HEAD 模块态）；M1=M2=b45b0e06e804…0e7da74（memo 模块态）；B≠M 预期内（源异产物异，门=各态内配对 EQ） |
| user_path_gate 四夹具 | 双驱动 4/4 PASS 判词逐字全同 | B1/M1 驱动各 rc=0；ordinary 0/0、call_fixture 0/1、cold_nested 0/0、v6 0/0，max 树峰 919MB/941MB 均 <1GiB 帽 |
| 大体准入 A/B | 不可完成（止损） | 基线 B1 驱动编译 exact_def_merge_smoke（import 3k 行分析模块过 .cheng 准入）>26min CPU 99.6% 不收敛——**基线能力墙**，与 memo 改动无关（卡死即基线驱动） |

### 重锚偏差记录（派单前提过期）

派单期望基线 sha=4133c3f0（stage2 线账本）。实测本克隆烤机=b06d1e34≠4133c3f0。归因查证：①bake report 与 stage2 轮逐字节同；②四份 .o.map 路径归一化后逐字节同（代码等价）；③段表逐行同；④二进制内无路径串。剩余差异在链接层细节（符号表/UUID 域，大小差 176B）——sha 与烤机 --root 树身份绑定超出 manifest/report 表面（旁证：w153 主树烤=72223b77 亦非 4133c3f0；4133c3f0 系 l3b2 克隆根绑定值，不可跨根复现）。按派单预案改以**本克隆自基线**复锚（B1=B2 双轮确定性），对照门全部改用克隆内 B/M 配对。

## 四、画像与时间账（诚实值）

- 四夹具 per-fixture compile wall（kernel 驱动，全冷，w154 双进程在飞 load≈7.5 污染口径，B/M 背靠背同条件）：B=76.4/74.9/80.8/91.8s，M=77.1/76.2/83.2/96.0s（ordinary/call_fixture/cold_nested/v6）——**小体夹具无可见收益**（体量数 op，索引构建开销不摊回）。
- 采样（v6，45s macOS sample）：99% 落 `CompilerSnapshotForLoweringBuildLatestInto`（267KB 巨函数）——夹具编译时间面在快照构建不在 exact-def 校验体。
- 收益面=大体准入：唯一可用探针（驱动编译自家分析模块 smoke）基线即 >26min 不收敛，无法在本线预算内完成 M 侧配对。**收益定性成立（census F1-F3 的 O(S×O_block)/O(defs×ops)/O(span) 三形态已被本线数组化），定量待复测**。复跑命令：
  - 重烤 memo 驱动：`bash .w/tm_bake_round.sh tmM3 mine`（cwd=克隆根，锁 bake_win）
  - 基线对照：`bash .w/tm_bake_round.sh tmB3 head`
  - 大体计时：`timeout 600 .w/tm/run_*/kernel_driver_tm system-link-exec --in:$CLONE/src/tests/exact_def_merge_smoke.cheng --out:...`（配对 B/M 计时，建议 GEN2 后或准入增量化后再跑）
- 烤机逐相（tmM1，CHENG_COLD_PHASE_DIAG）：prescan+parse≈5s，admission≈127s，codegen≈65s，总 wall 199-203s（负载污染，stage2 无负载基线 264s 系不同克隆根不可直比）。

## 五、交付物

- patch：`docs/campaigns/2026-08-31-kernel-userpath/patches/time_exactmemo.patch`（本线 analysis 三文件 +224/−15；`git apply --check` 于净 HEAD PASS 已验；bootstrap 探针 hunks 不在内，仍归 stage2 交卷）。克隆内全量 diff 另存 `.w/time_exactmemo.patch`。
- 工作克隆 `.w/`：tm_measure/tm_bake_round/tm_fixture_profile/tm_driver_smoke_ab/tm_swap_* 脚本 + 四轮 run 摘要 + memo 驱动 binary（kernel_driver_memo_m1, sha=b45b0e06）。
- 挂接点备注：typed_expr.cheng:50624（census S5）本线未动（主树 wall154 在途 hunks，merge 时需 hunk 级对位）；primary_object_plan 四文件 MEM 线领地零接触。

## 六、纪律记录

- 主树零代码接触（stage3 与 guard runtime 文件系只读拷贝/权限位对齐 0555——guard file_contract 要求 monitor runtime 无写位，git clone 不保该位，属环境修复非代码改动）；未 commit；bake_win 原子锁全程遵守（MEM-l3b3 持锁期等待，获锁后四轮连烤，用毕释放）。
- w154 异常长烤（单进程 >4h 未止）贯穿本线测量窗：wall 数全部标注污染口径；正确性门（sha/判词/字节对拍）负载无关不受影响。静默等待累计 >40min 后按止损条款推进。
- 违纪一次： midpoint 用过一次 heredoc 内联 python 做四站点文本替换（应落盘 .py 再执行），当场完成未返工，已记 lessons 候选；其余全部编辑器落盘。
- 临时产物：克隆 .w/ 下，大对象已清（四轮驱动/缓存/map），scripts+摘要+memo 驱动保留至验收。
