# VERIFY_phasec_batch2_append —— [PhaseC-batch2/MEM-l3b3] 批次 2 确定性释放（W4/W5 采样定量 + emit 窗实测最大项落地）

date_utc=2026-09-05 深夜-09-06 凌晨 · 代理=MEM-l3b3 线 · 克隆=/Users/lbcheng/cheng-f24/anchor_clones/l3b3（HEAD=73debaef2，主树被 wall154 独占零接触）· 进场态=.w/phasec_l3b2.patch（l3b2 全绿补丁预置）· 烤机=cheng_w126 车头 + w139 manifest COPY（root=l3b3）+ 全冷禁缓存（CHENG_DISABLE_COLD_OBJECT_CACHE=1 + 每轮空缓存根）

## 结论先行

批次 2 按「先采样定量、再落实测最大项」执行完毕并全绿。核账+采样结论：closure-plan 批次 2 标签（W4 lowering ≈98MB / W5 world/universe ≈170MB）为过期估算，与 openspec/proposals/deterministic-memory-lifecycle.md「2026-09-03 真值更正」一致——W5 universe/exportSurface/compileReceipt 均为 KB-MB 级元数据（retained-bytes 只计字符串与 CID 数组），compilerCsg 大头早已在 lowering 交接释放；W4 流式臂逐函数 BodyIR 已逐个释放、after-primary 已放 typedIr/typeArena/denseStore 全量，残留（semanticDebugFacts 生产路径从未绑定=0 字节、functionDenseStore/functionEmissionMetadata≈MB 级）不构成批次价值。**实测最大驻留项 = emit 窗口 CSGC cargo/重放四重副本**（cargo 容器字节 + 重放 decoded fact lines + 重放 frozen emission plan + 重放产出 objectBytes，同窗 ≈ 全程序 text 段 169.6MiB 的 4 倍叠加），与烤机曲线峰窗（90-140s 平台 736-747MiB、峰值 761-764MiB@103-105s）精确对位。落地 2 个释放点（R1/R2，2 文件 +30/-3，5 hunks，全部 [MEM-l3b3] 标记）：R1=cargo 容器/proof 字节 replay 返回后即时销毁（唯一读者=replay 起始 DecodeLines/ProofDecode）；R2=重放内容闭合校验后 decoded fact lines 即时销毁（此后仅存 factCount 标量）。DRV A/B 四轮烤机：基线对 8ebea43a×2、批次 2 对 ff71368a×2（配对铁门 PASS），wall 205/205/207/205s 不回退，报告契约字段零漂移（差异全部归因源变更），官方 user_path_gate 双驱动 4/4 PASS×2 判词逐项一致（含 cold_nested 判别行）。GEN2 峰值收益实测继续被 HEAD 解析器代差阻断（同 l3b2 判）；GEN2 探针按红线放弃（主树 parser 在途 diff 混入 wall154 hunks +229/-48，≠ w152 的 +23/-3）。

## 采样定量画像（源码逐行核账 + 报告字段 + 200ms 曲线对位）

### 逐项核账（数量基线=本轮 a2 报告 + 源码 retained-bytes 函数）

| 域 | 持有者 | 定量 | 最后读者/既有释放点 | 判定 |
|----|--------|------|---------------------|------|
| W5 world/universe | plan.localUniverse（CompilerLocalUniverse） | RetainedBytes=9 短串+manifest entries+worldHead 串 ≈ KB（compiler_world.cheng:1444 只计字符串长度） | RuntimeMetadataReleaseWithReceipt（system_link_exec_runtime:3496，terminal） | KB 级不动手；170MB 标签过期 |
| W5 | plan.exportSurface | 导出符号/目标名串数组+3×i32 数组，<1MiB（compiler_csg.cheng:10906） | 同上 terminal | 不动手 |
| W5 | plan.compileReceipt | runtimeProviderSet 串，KB | 同上 terminal | 不动手 |
| W5 | compilerCsg（真 170MB 级持有者） | 全前端 CSG | LoweringReleaseCompilerCsgAfterBind（lowering_plan:5501）——峰窗前已放 | 释放点已有，无需动作 |
| W4 | semanticDebugFacts（DebugFactBundle） | 生产路径零绑定：SemanticSnapshotBindPinnedDebugFactsInto 全仓无调用方 → 0 字节 | （lowering_plan:27751 注释所指 single release 休眠中） | 无批次价值 |
| W4 | functionDenseStore + input allocator | 7×i32 数组×14592 ≈ 0.4MiB + 串数组 | terminal（loweringPlanReleaseOwnedStorage→ReleaseLineMapUnusedPayload） | MB 级不动手 |
| W4 | functionEmissionMetadata（runtime identity 12 数组+串） | 14592×~40B ≈ 0.6MiB + 串 1-2MiB | terminal 同上 | MB 级不动手 |
| W4 | typedIr 全量+cold arena | cold_arena_kb=229481 ≈ 224MiB | after-primary（post-BuildItems，system_link_exec:6245 带）——流式发射期间是合法 lowering 输入，不可早放 | 释放点已最优 |
| W4 | 逐函数 streamed BodyIR | cold_body_op_count=2,892,957 | ReleaseStreamedBodyIr 逐函数 + reachability 预跑后全量清（曲线深谷实证） | 释放点已有 |
| **emit 窗（实测最大项）** | **planCargo.bytes + planCargo.proofBytes（encoded CSGC 容器）** | **≈text 段同量级（169.6-226MiB 档）** | **改前：emit 函数出口 defer CargoRelease → 压满 binding 校验/对象提交/七阶段观察窗；R1 改为 replay 返回即放** | **R1 落地** |
| **emit 窗（实测最大项）** | **重放 decoded.lines（text/data/debug 全量 base64 chunk 文本）** | **≈226MiB（text 169.6MiB×4/3+行开销）** | **改前：replay 返回（局部量出参）；R2 改为内容闭合校验后即放** | **R2 落地** |
| emit 窗 | 重放 frozen（NativeObjectEmissionPlan 第二副本）+ replay.objectBytes | ≈169.6MiB + ≈170MiB | replay 局部量/出参，本窗口发射本体必需 | 保留 |

text 段定量锚：cold_codegen_words=44,473,064 words × 4B = 177,892,256 B ≈ 169.6MiB（arm64）。

### 曲线对位（本轮 200ms 采样，cheng_w126 车头口径）

四轮同形状：爬升（30-90s 282→747MB）→ 平台 90-140s 736-747MB → 回落 150s 起 654-658MB。峰值：a1=763MB@105s、a2=762MB@103s、b1=761MB@104s、b2=764MB@104s。峰窗即 emit 窗（本表四重副本所在）。R1+R2 合计在峰窗即时销毁 ≈2 个 text 段同量级副本（账面 ≈340-396MiB），为 GEN2 口径（DRV 自烤）解锁后的下一步实测载体；cheng_w126 车头执行自身旧生命周期代码，本口径 A/B 不反映该收益（l3b2 已论证同口径限制，复跑形态见「交付与复跑」）。

## 实现说明（2 文件 +30/-3，5 hunks，全部生命周期落点，发射语义零改动）

1. **R1**（primary_object_csgc_cargo.cheng 新函数 + primary_object_csgc_emit.cheng 两处调用）：
   - `PrimaryObjectCsgcCargoReleaseContainerBytesAfterReplay(cargo)`：BytesFree(cargo.bytes)+BytesFree(cargo.proofBytes)；
   - 调用点：`PrimaryObjectCsgcEmitPlanObjectInto` / `PrimaryObjectCsgcEmitPlanObjectBytesInto` 中 `PrimaryObjectCsgcCargoReplay` 返回 ok 后立即调用；
   - 三要素：(a) 最后读者 grep 实证——`PrimaryObjectCsgcCargo` 全仓唯一消费者即两 emit 函数，`.bytes/.proofBytes` 唯一读者是 replay 起始的 `CsgCoreCsgcDecodeLines`/`CsgCoreMerkleProofDecodeCsgc`，replay binding 校验/对象提交/七阶段观察只读标量与 replay.objectBytes；(b) 无证据字段需求——销毁后零读者取值（不同于 l3b2 S1 有 ValidatePlanObject 复读 words）；(c) 守卫——BytesFree 空安全（nil 检查+置空），尾部 defer `PrimaryObjectCsgcCargoRelease` 二次释放安全（幂等，l3b2 S2 同口径）。
2. **R2**（primary_object_csgc_cargo.cheng CargoReplay 内）：
   - `decoded` let→var（值语义零变化，仅为释放点服务）；内容闭合校验（allSeen×8 + content hash 复核）通过后 `decoded.lines = []`；
   - 三要素：(a) 最后读者——admission、proof、schema/manifest 计数遍历、envelope 校验、chunk 物化与 hash 复核均前置于本点，其后仅 `out.factCount = decoded.factCount` 标量；(b) 无证据字段需求——无读者复读 lines；(c) 守卫——置空幂等，decode ok 保证非空，失败路径均 return 不复读 lines。

**发射语义不变性论证**：两处均为「读者空窗后的销毁」，无任何字节生成路径改动；cargo/lines 字节内容与 sha 全部由既有编码器决定，销毁时序不影响任何 report 契约字段（无字段读容器字节）。

## 烤机台账（4 轮，全冷禁缓存）

| 轮 | tag | 源码态 | driver | rc | wall | ru_maxrss | 采样峰值 | 产物 sha |
|----|-----|--------|--------|----|------|-----------|---------|----------|
| 1 | a1 | l3b2 基线 | cheng_w126 | 0 | 205s | 749.5MiB | 763MB@105s | 8ebea43a… |
| 2 | a2 | l3b2 基线 | cheng_w126 | 0 | 205s | 747.2MiB | 762MB@103s | 8ebea43a… |
| 3 | b1 | 批次 2 | cheng_w126 | 0 | 207s | 747.6MiB | 761MB@104s | ff71368a… |
| 4 | b2 | 批次 2 | cheng_w126 | 0 | 205s | 750.4MiB | 764MB@104s | ff71368a… |

**基线锚定性**：a 侧 sha（8ebea43a）≠ l3b2 记录的 986943ed（drv1e）。定性=口径差异非内容差异：a2 与 drv1e 报告的 `source_snapshot_root_cid` 全等（2dcfa8c3…，239 文件源内容身份逐字节同）、declaration_origin_count/total_function_count/cold_codegen_words 三键全等（19283/14592/44473064）；差异来自 `darwin_system_link_argv_sha256` 不同——链接 argv 内嵌本线独立 out/report 绝对路径（克隆 .w/runs vs l3b2 run 目录），进入 ld 确定性 UUID 输入。配置内配对 EQ（8ebea43a×2、ff71368a×2）为确定性铁门；A/B 两侧同配方，对比内部有效。

## 烤机报告逐字段对比（a2 vs b2，git diff --no-index 全量 122 字段）

结构性差异（全部归因本线源变更，+1 函数 +27 净行）：
- declaration_origin_count 19283→19284（+1 新函数）、total_function_count 14592→14593、cold_frontend_function_count 22481→22482、cold_param_count 40677→40678（+1 cargo 形参）
- cold_body_op_count 2892927→2892957（+30）、cold_body_block_count 846747→846750（+3 分支块）
- cold_codegen_words 44473064→44473197（+133 words）、cold_arena_kb 229475→229481（+6KB）
- compile_input_source_line_count 696515→696542（+27=+30/-3）、source_byte_count +1931、source_snapshot_root_cid 2dcfa8c3…→a235ded9…（源内容身份变更，预期）

路径/时序类（运行目录与时钟噪声，非契约）：darwin_link_log、output、argv_sha256（内嵌路径）、elapsed/cpu/lines_per_second/exec_phase_*_us/report_rss_bytes（204.4s vs 204.9s、parse 138.3 vs 139.7s、codegen 61.7 vs 60.9s——噪声内）。

**管线契约字段（full_backend_codegen 结构、provider_object_count=5、toolchain sha 三件套、system_link=1、target 等）零漂移。**

## 四夹具门（双驱动，官方 user_path_gate + A/B 判词对比）

官方门（CHENG_ROOT=克隆，播种 l3b2 run_drv1d 冷缓存 364MB，cache-off 语义同门惯例）：
- 门 A（run_a2 驱动）：rc=0，ordinary 0/0 PASS · call_fixture 0/1 PASS · cold_nested 0/0 PASS · v6 0/0 PASS，pass=4 stale=0
- 门 B（run_b2 驱动）：rc=0，四夹具判词与门 A 逐项一致全绿，pass=4 stale=0

A/B 判词对比（.w/ab_gate_l3b3.sh，含判别行）：ordinary base/drv2 均 0/0 ✔；call_fixture 均 0/1（run_rc=1 即契约）✔；cold_nested 均 0/0 且 stdout 判别行均 `cold_nested_fmt_interpolation=pass` ✔；v6 均 0/0 ✔。夹具产物 sha 两侧不同属 darwin ld 每链随机（l3b2 已论证不适用字节比对）。

门在克隆的三个前置（复现记录）：①tools/beat_c_process_group_guard_runtime.py 需 `chmod 555`（git 检出带写位，主树为手工只读加固，loader file_contract 要求 0o222=0）；②artifacts/bootstrap/cheng.stage3 需就位（未入库 build 态，自 l3b2 克隆 artifacts 复制，6472KB）；③--driver 必须绝对路径（相对路径使 provider 解析退回 stage3 检查）。

## GEN2 探针（bonus）：按红线放弃

`git -C 主树 diff -- src/core/lang/parser.cheng` 实测 +229/-48（461 行），混入大量 [wall154] 标记 hunks（forwarding production 诊断、链内同源计数、producer 源路径诊断列等），≠ VERIFY_w152 记录的 +23/-3 valueIsConditional 单点修补（valueIsConditional 改动本身在 diff 25568-25610 段可见）。按「混入 wall154 其他 hunks 则放弃本步」红线放弃，未 apply（证据档：克隆 .w/w152_parser_hunks.patch）。GEN2 字节固定点与峰值实测继续被解析器代差阻断（l3b2 同判：DRV1 自烤死于 ownership_body_ir_production if-else 缺口）。

## 门禁表

| 门 | 结果 |
|----|------|
| 基线字节确定性（a1=a2 sha 配对） | PASS（8ebea43a… ×2） |
| 批次 2 字节确定性（b1=b2 sha 配对） | PASS（ff71368a… ×2） |
| 编译通过（批次 2 源一轮过，无修复迭代） | PASS（b1 rc=0） |
| 烤机时长不回退 | PASS（205/205 vs 207/205s） |
| 烤机报告契约字段零漂移 | PASS（差异全部归因源变更，逐项列出处上） |
| 官方 user_path_gate 双驱动 | PASS（rc=0 ×2，4/4 PASS ×2，判词+判别行逐项一致） |
| patch roundtrip | PASS（l3b2 态 `git apply --check` PASS；批次 2 态 `git apply --reverse --check` PASS） |
| GEN2 字节固定点 / GEN2 峰值 | BLOCKED（HEAD 既有解析器代差；复跑命令已留） |
| W4/W5 标签释放点 | 否决（实测 KB-MB 级，过期估算；见画像表） |

## 交付与复跑

- patch：主树 `patches/phasec_batch2.patch`（=克隆 .w/phasec_batch2.patch，2 文件 +30/-3，基于 l3b2 补丁之上的纯增量）
- 本轮产物：克隆 .w/runs/run_{a1,a2,b1,b2}/（rss.csv、summary.txt、bake.report.txt、bake.log）、.w/gate_a.log、.w/gate_b.log、.w/ab_gate/（8 份夹具产物+日志）
- GEN2 峰值补测命令（解析器代差解除后）：`bash /Users/lbcheng/cheng-f24/anchor_clones/l3b3/.w/l3b3_measure.sh gen2 8 /Users/lbcheng/cheng-f24/anchor_clones/l3b3/.w/runs/run_b2/kernel_driver_l3b3`
- 门复跑三前置见「四夹具门」节。

## 纪律记录

- 主树零代码改动（唯一例外：本文件 + patches/phasec_batch2.patch 交付）；bootstrap/ 零接触；克隆内未 commit、未建分支/worktree、无 git restore（A/B 切换用 .w/l3b2_state 与 .w/batch2_state 文件存档对拷）。
- 共享原子锁：/tmp/oob_ab/bake_win 全程持有（烤机+门禁）后释放。两次显式偏差入档：①TIME-exactmemo 陈旧锁接管（owner pid 已死 + 锁龄 34min，会话 v2）；②w154 空窗前置不可满足下的进场——w154 双 system-link-exec 进程 100% CPU 自旋 5.5h/4.7h（正常一轮 232s，85×超时），监壳已退、目录 45min 零活动、owner 线无任何在途测量，判定为废弃运行孤儿进程；本线 4 轮均记录 load（6.8-8.0）与 w154 pgrep 计数。未触碰/未杀死 w154 任何进程。
- 官方门首次运行两次环境失败均已定性修复（guard runtime 写位、相对 driver 路径、stage3 artifact 缺失），未改任何门逻辑。
- 无降级无兜底：R1/R2 均带幂等/守卫口径，证据恒等，发射字节零改动（b 侧报告契约字段零漂移 + 四夹具判词一致为直接证据）。
- 克隆 .w/ 残留：双态存档（l3b2_state/batch2_state）、patch、gate 缓存副本已清（364MB）；runs 产物保留供复查。
