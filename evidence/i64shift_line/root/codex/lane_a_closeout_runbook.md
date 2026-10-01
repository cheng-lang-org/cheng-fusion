# Lane A 收口 runbook(2026-07-23 主 agent 编制;每步可机械执行)

## 0. lane 落定判据(全满足才启动)
- `ls -l src/core/lang/parser.cheng src/core/lang/typed_expr.cheng src/core/tooling/compiler_csg.cheng` mtime 全部静默 >60min
- `ps aux | grep -E "cheng_(cold|stage)|system-link-exec" | grep -v grep` 无进程
- `git diff --stat` 连续两次(隔 10min)行数不变

## 1. 重烤(烤机锁纪律)
```
mkdir /tmp/cheng_bake.lock   # 抢不到等 30s,15min 超时上报
/tmp/cold_fix1/cheng system-link-exec --root:TREE --in:src/core/tooling/backend_driver_dispatch_min.cheng \
  --emit:exe --target:arm64-apple-darwin --out:/tmp/official_final/cheng --report-out:/tmp/official_final/report.txt
rmdir /tmp/cheng_bake.lock
```
种子失窃(/tmp 被清)时退 artifacts/backend_driver/cheng 并记录。

## 2. 五连板(全绿才进 3)
fixtures: pv=/tmp/b_verify/plainvar.cheng sp=/tmp/b_verify/struct_probe.cheng rri=/tmp/b_verify/rri_id_probe.cheng canary=src/tests/ordinary_zero_exit_fixture.cheng rb=/tmp/rb.cheng
- 红 → 按 codex/findings_lane_a_board_20260723.md 四闸修法方向修(Int32Ptr 守卫罩 Constructor/Call、type 块别名行 stamp、静态实参定型补臂、解析双路径签名行回填)→ 回 1。
- /tmp fixture 失窃按台账内容重写。

## 3. 冻结(需用户确认 git 操作)
- 产出 current-source-manifest.txt(源哈希清单)到 report 目录;冻结=树不再动,任何后续改动回 1 重烤。
- git commit/tag 由用户拍板,我不动。

## 4. official 装回 + compiler_main 烤 + receipts 重产
- official driver 装入 artifacts/backend_driver/cheng(覆盖钉死件,git 可逆;先 cp 备份到 /tmp)。
- receipts: compiler_parser_receipt 链重产 959 项真实 parser receipt(前置: 权威计划 §2 要求 UNMAPPED 清零、映射由正式 EBNF+parser producer+真实 receipt 自动生成、禁止人工填 MAPPED;我复核现态 8 UNMAPPED,其中 typeExpr/pattern 实有 SoA 节点属映射过时,注解参数为真实语言缺口)。
- 七阶段(官方合同 stage 名): `typed_expr → csg → lowering → primary → primary_regalloc → backend2 → backend2_regalloc`,同一 source identity;删列/换身份/换 ingress/篡改 action/fragment 均 hard-fail。执行: `CHENG_COMPILER_EXECUTION_STAGE_RECEIPT_COMPILER=artifacts/backend_driver/cheng bash tools/compiler_execution_stage_receipt_gate.sh` 需 7/7;failstop 契约: tools/seven_stage_receipt_failstop_contract_smoke.sh。
- 1GiB 硬门形态(权威计划 §4): Linux cgroup v2 memory.max=1073741824、swap=0 对完整进程树;Darwin process-tree 采样只作辅助画像;ledger live=0、ORC alloc==free,成功与失败路径同要求。
- 生产 target(权威计划 §5): Darwin arm64、Linux AArch64、Linux x86_64 真实架构环境;其他 target 本轮不计,未实现组合 hard-fail,禁回旧 emitter。

## 5. GEN2/GEN3 原始字节固定点(MCP)
`cheng_ignition_chain action=start`: seed=official driver、**treeRoot 必须显式传冻结树绝对路径**(matrix defaultRoot=/Users/lbcheng/cheng-f24/tree 是别树,不传就跑错树)、stages={gen2:true,gen3:true,oracle:true,terminal:true}、**rssCapBytes=1073741824(精确 1GiB,非默认 12GiB)**、gen3RssCapBytes 按需上调(实测 gen2 代 bake 峰 14-16GB,超 1GiB 时该项单独放宽并记录)。
- matrix 已预检(fixtures/ignition/matrix.json): 111 entries,probe 标签×11、terminal 标签×2(triv_station/vardecl5_station),满足工具硬校验。
- action=status 轮询至 completionConsistent,done.verdict 须固定点成功;GEN2/GEN3 原始字节(masked-byte)一致。

## 6. RELEASE_GREEN(MCP,release 模式)
`cheng_regalloc_preflight mode=release`: 备齐 backend2VersionManifest(+sha)、baselineManifest(+sha)、execDiffLock/gen3Lock/jobsLock/targetEmitLock(四锁+sha)、officialBuildReceipt、officialManifest、officialDriver、gen2Driver、gen3Driver、releaseWorkRoot(仓外空目录)、memoryManifest(cold_bodyir_memory_manifest.v1,缺=UNPROVEN 不得算绿)。
- 现有度预检(18:2x): tools/backend2_version_manifest.rec 在;source manifest 生成器=tools/regalloc_production_gate.sh + regalloc_production_evidence.sh;锁校验器=tools/regalloc_external_lock_validator.py;baseline/official 两 manifest 与四锁按设计在收口时现产(锁必须 fresh,预产无效)。

## 7. 性能门(官方合同,openspec/proposals/cheng语言生产就绪计划.md §5)
- ABBA/BAAB 采样;编译墙钟与 process-tree peak 相对 immutable baseline 回归 ≤5%,组间噪声 ≤10%;12 次采样全部低于 1GiB;spill density 低于 baseline 且 ≤250000 ppm;__TEXT 小于 baseline 且 __TEXT/clang ≤ 2.0。
- 对拍基线锚 codex/perf_baseline_20260723.md(超理论倍率轴);immutable baseline 以冻结点那次为准。
- profile instrumentation 未接线(Lane E 实证),裁决口径=link_run_timing_only,不伪造 schema。
- 快照侧性能验收(VSS §3): 真实开发循环墙钟 -40%、文件读取 -50%、冷构建额外开销 ≤1%;30 seeds × 30 transitions 冷编译对拍 + object/run/debug/ORC 等价。

## 8. 发布沉淀(cheng-fusion 正式仓)
- evidence_deposit.py 落证据 + evidence_verify.py 复验;fixtures/ignition matrix 绑定官方 driver 哈希;cid_identity_chain_verify.ts 跑通。
- 全部证据绑定源码/编译器/工具哈希,禁假绿(AGENTS.md 工程规范 6)。

## 阻塞登记(现状)
- Lane C(1GiB RSS)未齐 → 5 的 gen3RssCapBytes/内存门受限。
- Lane B 未齐 → 4 的 959 receipts 缺域(复核: 124 productions 57/59/8,8 项未映射中 6 项是注解参数语言特性级缺口、2 项 variant 不节点化;59 partial 在 lane 在飞面)。
- 四闸未修 → 2 红。

## 9. 协调态(18:2x 更新,来自 lane progress.md)
- 外部 lane = 「Cheng 生产就绪统一闭环」执行体(OpenSpec applying),正在做 snapshot11 冻结前置与 receipts 面;其 G0 审计明示:检测到我的 official_new15 烤机进程(4.7GiB)与热文件变动时,不并发启动重门、不烤正式 source manifest/release evidence。
- 互斥协议: lane 的重门等我清场,我的重烤等 lane 收弧。当前(18:2x)双方场上均无重进程。
- 我方纪律: lane 活跃期不发起任何 driver 级重烤;Lane A 收口第 1 步(重烤)与 lane 的 snapshot11 冻结应收敛为同一次,禁止两边各冻一份。收口前读 progress.md 最新条确认 lane 已声明冻结点。

## 10. 统一计划映射(18:3x,来自 lane task_plan.md「生产就绪统一闭环」G0-G5)
lane 的 G 计划与本 runbook 是同一收口的两种粒度,执行时以 G 计划为骨架、本 runbook 为操作细则:
- G0 冻结基线 ≡ 本 runbook 0-3(落定判据+重烤+五连板+冻结);G0 明示等待外部编译/热文件写入结束(含我方 Lane C 的插桩编译)——顺序天然正确: Lane C/D 修复先齐,再一次冻结。
- G1 EBNF ≡ Lane B(lane 自持,36 UNMAPPED 清零;我复核现态 8)。
- G2 snapshot missingFactBitmap=509 ≡ VSS 线(lane 自持)。
- G3 memory/ORC LifetimeLedger ≡ Lane C(agent-61)的后续段;C 的归因产出直接喂 G3。
- G4 regalloc(body_ir_adapter 唯一,双后端消费+七阶段+209+ exec-diff+jobs+16×3 target emit+GEN2/GEN3)≡ Lane D(agent-62)+本 runbook 4-6;D 的四证审计与 P1/P2/B1 残留清单即 G4 勾选证据。
- G5 release 三架构 ≡ 本 runbook 6-8。
结论: 不另起收口仪式;lane 落定后我以 G 计划 checklist 逐格亲验,本 runbook 提供每格的命令级细则。

## 11. 权威计划对齐(18:5x,openspec/proposals/cheng语言生产就绪计划.md 全量比对)
- 性能门已替换为官方合同(§7);七阶段 stage 名、1GiB cgroup 形态、三生产 target 已并入(§4)。
- EBNF: 权威计划明示"36 来自过时映射,执行第一步必须重算真实缺口"——我的复核(8 UNMAPPED)即该重算的第一刀;typeExpr/pattern 的 SoA 节点已存在,映射自动生成器(fusion ebnf_parser_node_map_gen.ts)重跑即可转正,真实语言缺口只余注解参数簇。
- Lane C 定位修正: C 的 cold 侧修复(限定名零分配比较+emit-set 合一,1.26GiB→816MiB)解开的是 CSG 1GiB 阻塞与 G0 冻结的前置,不等于 G3 全量;G3(LifetimeLedger 接真实物理 owner + CFG cleanup + ORC 平衡 + Linux cgroup)仍是 lane 的后段大弧,C 的归因方法学可复用。
- G4 清理清单合并: Lane D 的 P1(primary 旧 residency 规划器驻留)/P2(x64 无 adapter)/B1(backend2 死启发式) + 权威计划 §5 点名的 post-seal source scan、文本类型/layout 推断、take-last/单层 alias 非权威路径,合并为同一份 regalloc 清除单。
- 默认约束(§11): 任一源码漂移/缺失真实回执/用户态采样冒充硬上限/历史证据未绑当前哈希 → 整轮发布失败。与 AGENTS.md 第 6 条同级,作为每格验收的兜底判据。
