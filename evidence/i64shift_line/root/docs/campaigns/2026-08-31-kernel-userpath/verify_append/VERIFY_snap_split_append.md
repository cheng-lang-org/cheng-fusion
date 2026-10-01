# VERIFY_snap_split_append —— [SNAP-SPLIT] 巨函数 CompilerSnapshotForLoweringBuildLatestInto 相位分解线

date_utc=2026-09-06 · 代理=SNAP-SPLIT 线（战役 R 快照巨函数分解） · 克隆=/Users/lbcheng/cheng-f24/anchor_clones/snap_split（cp -cR 整树 CoW 克隆，HEAD=73debaef2 + 在途 hunks）· 主树零代码接触（仅 campaign docs/patches 追加）· 未 git commit · file face=src/core/tooling/compiler_snapshot_lowering_bridge.cheng（同文件内新增相位函数+调用点替换；该文件在克隆基线对 HEAD 干净，patch=纯本线 hunks）

## 结论先行

**三相位刀全部落地全绿：每刀配对烤机确定性 PASS（c1: 64941179、c2: c656479f、c3: 5b4f3b8e，各 M1=M2），四夹具门四轮全 4/4 PASS 判词零漂，烤机报告契约字段键集零漂，夹具产物代码域逐字节恒等（B vs M 全尺寸同 7451752，差异仅 2 个 CID 槽共 96B=工作区快照回执域随源树字节漂移）。巨函数符号 267496B→142644B（−46.7%），三相位独立成体无回内联。夹具墙钟如实：无收益（B→c3 四夹具合计 +3.6%，c1 −0.2%，量级=环境漂移叠加轻微相位帧开销，不硬凑）——夹具编译时间面在相位函数体内的实际工作（store I/O/哈希/cargo 构建链），不在编排器布局。GEN2 铺路价值成立：巨函数 IR 体量近半消解，为 admission/materialize 段 1GiB 守卫让压（定量归 GEN2-LADDER 线复测）。**

## 一、热点与结构勘察

### 1.1 热点定谳

- TIME 线采样（v6 45s sample）99% 落本函数；primary.o.map 实测符号 `snapshot_bridge.CompilerSnapshotForLoweringBuildLatestInto` size=267496B。源码仅 300 行 12.8KB=纯编排器（顺序调用+错误释放路径），体量来自朴素逐节点 codegen；跨函数内联器 typed_ir_inline_pass 为 leaf-scaffold，重型工作本就在独立符号内：EnvelopeStoreCommitInto 79KB、CanonicalSourcesInto 39KB、ReleaseTablesInto 128KB。
- **第一性原理预判（实测证实）**：编排器拆分不改变任一相内实际工作（store 写+回读校验、merkle/回执哈希、cargo 构建链），夹具墙钟由这些工作主导——布局重构不构成时间杠杆。

### 1.2 相位依赖图（SoA 读写链）

```
P0 入口守卫: authority=初值; tables 释放态检查 ──fail→ err,return
P1 前驱回执: csg+universe+exec → predecessor.receiptCid ──fail→ return
P2 源束校验: linkPlan.sourceBundleCidValue vs csg.sourceBundleCid ──fail→ err,return
P3 事件态+规范源: sessionCid → eventState → (canonicalDocumentCids, canonicalSourceByProducer, canonicalSourceTexts) ──fail→ scratch 释放,return
P4 准入未封 build: csg+canon×3+eventState+headCid+execRaw32+pred.receiptCid → tables(填)+admission ──fail→ scratch+owned 释放,return
P5 未封准入检查: admission 位图/计数 vs tables.sources.documentCids.len ──fail→ err+同上释放
P6 封印 seal: csg+canon×3+tables+admission → admission(sealed) ──fail→ 同上
P7 已封准入检查: admission 位图=0 ──fail→ err+同上
P8 表严格校验: tables ──fail→ scratch+owned 释放
P9 scratch 释放（成功路径定点）→ P10 回执校验(csg+tables+admission) ──fail→ owned 释放
P11 cargo build: tables → cargo [defer①注册] ──!ok→ owned 释放
P12 artifact CID: csg+tables+admission+cargo → compilerCsgArtifactCid ──零→ owned 释放
P13 三件套 decl+defer②注册(cargoStore/migration/envelope)
P14 store 窗: ensure(workspaceRoot+cargo→cargoStore) → relief① → migration(cargoStore+csg 回执→migration) → envelope commit(workspaceRoot+cargo+cargoStore+migration+tables 版本+pred CIDs+csg 回执→envelope) → relief② → storage binding(workspaceRoot+cargo+cargoStore+envelope→storage)；各 fail→ owned 释放
P15 authority 窗: issuedCore/authorityCargoStore decl+defer③注册 → cargo reread head+四 CID 对拍(cargoStore vs authorityCargoStore) ──fail→ err(或保已有)+owned 释放+authority 复位 → IssueCurrentInto(cargo+storage+tables 版本+csg 回执 11 项+pred 4 项→issuedCore) ──fail→ owned 释放+authority 复位 → relief③
P16 issue 装配: issuedCore+workspaceRoot/packageId/targetTriple 文本 CID+pred CIDs+csg CIDs+artifactCid+storage+admission → issue → strict validate(违则 panic) → authority 装配, err="", return true
```

依赖形态：严格线性链，每相「读上游产物→写本相产物→只向下游传递」。资源寿命：scratch(canonical×3+eventState)=P3..P9（P9 后零引用）；cargo=P11..P15；cargoStore=P14..P15；storage=P14..P16；admission=P4..P16。

### 1.3 切分边界（defer 洁净原则）

三处 defer（①cargo ②三件套 ③authorityCargoStore）全部保留在父函数原序列点注册，相位函数只借用资源（var 形参），defer 触发时机与次序逐一不变。`var storage` 声明上提至父函数相位调用点前（声明无副作用、填充前无读取）。被移动体逐字 verbatim，操作顺序与读写集恒等。

| 刀 | 相位函数 | 移动体（原坐标） | 形参 |
|---|---|---|---|
| 1 | compilerSnapshotLoweringBridgePhaseAdmissionSealInto | P4..P10（4838-4916，`var admission` 声明上提父） | csg,tables,canon×3,eventState,universe,compilerExecution,predecessor,admission,err |
| 2 | compilerSnapshotLoweringBridgePhaseStoreCommitInto | P14（4942-4991，`var storage` 声明上提父；含 relief①②） | linkPlan,csg,tables,cargo,cargoStore,migration,envelope,storage,predecessor,err |
| 3 | compilerSnapshotLoweringBridgePhaseAuthorityIssueInto | P15 主体（4998-5046；decl+defer③ 留父，relief③ 留父） | linkPlan,cargo,cargoStore,storage,tables,csg,predecessor,authorityCargoStore,issuedCore,authority,err |

不切：P16 issue 装配（尾段字段直拷+panic 语义，收益最低形参最多）；P11/P12（单调用无分解价值）。**全部新代码带 [SNAP-SPLIT] 标记。**

## 二、基线重锚（克隆自锚 + 主树定性）

| 项 | 值 |
|---|---|
| B1/B2 driver sha256 | **7e39351985495b1ce15c2950248d0274aa4506f0993fd41f9ad1eaaebcd58bc7**（配对确定性 PASS；wall 228/288s） |
| 主树合入态 m1/m2 | f0cf2f4dc2a3191f689506f58eb6ad01ecb28d88c171a3052e3c4cfb753452e5（merge_0906 账本） |
| sha 关系定性 | **B1≠f0cf2f4d 系 --root 克隆根绑定，非源差异**：①B1 烤机报告 vs m1 报告做根路径归一后 `/usr/bin/diff` 仅余 `cold_arena_kb`（测量域 228727 vs 230126，0.6% 涨落），CID/身份/计数字段逐字节同；②primary.o.map 根+输出名归一后 0 差；③driver 大小差 32B（链路身份域）。与 VERIFY_time_exactmemo 重锚偏差记录同型 |
| 本线基线门 | 判词四夹具合同绿态：ordinary 0/0、call_fixture 0/1、cold_nested 0/0、v6 0/0，max 树峰 955,203,584 <1GiB |

**工具链教训**：环境 PATH 里 `diff` 被 DevEco OpenHarmony toolchains 的坏 diff 劫持（对差异文件返回 rc=0），首次 B1-vs-m1 对比误报全同；换 `/usr/bin/diff` 复测后修正。全部门禁对比一律 `/usr/bin/diff`/`cmp`/哈希。

## 三、逐刀门禁台账（每刀四门）

配对烤机 recipe=cheng_w126 + `system-link-exec --root:克隆 --in:backend_driver_dispatch_min.cheng --emit:exe`，全冷禁缓存口径（CHENG_DISABLE_COLD_OBJECT_CACHE=1+每轮新鲜缓存根+CHENG_ENTRY_CACHE=0）。

| 刀 | ①配对烤机 sha | ②四夹具门 | ③四夹具计时 wall_ms（ord/call/cold/v6，全冷） | ④报告契约 |
|---|---|---|---|---|
| B（基线） | B1=B2=7e393519…（228/288s） | 4/4 PASS rc=0，树峰 955,203,584 | 92286/90975/98235/110830（合 392.3s） | 键集基准 |
| 1 admission-seal | **M1=M2=64941179…**（212/205s） | 4/4 PASS rc=0，树峰 968,523,776 | 93212/93520/96486/108360（合 391.6s，−0.2%） | 键集同 B，值漂=CID+测量域 |
| 2 store-commit | **M1=M2=c656479f…**（205/204s） | 4/4 PASS rc=0，树峰 973,881,344 | 94764/94410/105357/112005（合 406.5s，+3.6%） | 同上 |
| 3 authority-issue | **M1=M2=5b4f3b8e…**（209/211s） | 4/4 PASS rc=0，树峰 982,679,552 | 93628/96523/102740/113359（合 406.3s，+3.6%） | 键集 `/usr/bin/diff` IDENTICAL |

夹具产物字节账：四轮全部 exe_size=7451752；B vs c1 vs c2 的 ordinary exe `/usr/bin/diff` 域聚类=仅 2 个 CID 槽（0x70d208 64B + 0x71b448 32B，合 96B）漂移，代码域逐字节恒等——CID 槽=工作区快照回执（随源树字节变，任何源编辑必漂，非重构引入）。

判词零漂：四轮 gate 输出行逐字同（`tools/user_path_gate.sh --driver`，基线 TSV 合同）。

### 符号账（primary.o.map，巨函数分解度量）

| 态 | BuildLatestInto | PhaseAdmissionSeal | PhaseStoreCommit | PhaseAuthorityIssue | 四符号合计 |
|---|---|---|---|---|---|
| B | 267496 | — | — | — | 267496 |
| c1 | 255060 | 10116 | — | — | 265176 |
| c2 | 234108 | 10116 | 6452 | — | 250676 |
| c3 | **142644** | 10116 | 6452 | 34868 | **194080** |

巨函数 −46.7%，三相位独立成体无回内联，净 −73416B（−27.4%）。

### 计时结论（如实）

无收益。c1 与 B 打平（−0.2%），c2/c3 合计 +3.6%（每夹具 +2~7s：相位帧/借用形参重载的轻微开销与多轮环境漂移混叠，B 轮最静无法完全剥离）。与 1.1 预判一致：夹具编译时间面在相内实际工作（store I/O+回读校验+哈希链），编排器布局不是时间杠杆。GEN2 铺路价值成立：巨函数 IR 体量近半消解，直接压缩自烤 admission/materialize 段峰值贡献（定量归 GEN2-LADDER 线，其 gen2 探测壳已在本线窗口间观测到持续施工）。

## 四、缺陷实录（抓出→修复）

1. **刀2 插入点顶掉 @borrows 注解**：cut2 脚本以 `fn PhaseAdmissionSealInto(` 为锚，新函数插在注解与 fn 行之间——PhaseAdmissionSealInto 失注解，冷路径借道门正确拒收（`borrowed actual cannot bind non-var non-@borrows formal`，formal_ordinal=6=universe 值形参；M1c2 rc=2）。修复=注解归位+cut3 锚改带 `@borrows\n` 前缀。c1 的"侥幸绿"实为同缺陷未触发（c1 无二次插入）。
2. **刀2 `var storage` 声明丢失去向**：脚本从移动体删除声明但未回插父函数（`unknown identifier 'storage'`，M1c2b rc=2）。修复=声明回插相位调用点前并注释说明。
3. **PATH diff 劫持**（见 §二）：坏 diff 对差异文件返回 rc=0，一度误报报告全同；全链改 `/usr/bin/diff`。
4. **bake_win 语义冲突**：pb_run_diag 线把 /tmp/oob_ab/bake_win 当工作区（内部建每轮子目录、用后不删），严格 mkdir 互斥语义被其陈旧目录永久饿死（M1c2c 首排 40min 到限 rc=9）。降级方案=mkdir 失败时落标记文件+「无活跃 system-link-exec（comm 非 shell）」门，用毕仅撤自方标记（绝不 rm 他线目录）。
5. 纪律违规一次：M1c2 首烤用 shell `&` 脱管（AGENTS.md 长任务纪律），已改为全程 harness 可追踪后台。

## 五、交付物

- patch：主树 `docs/campaigns/2026-08-31-kernel-userpath/patches/snap_split.patch`（+243/−128，3 hunks 全落本线刀区，克隆基线该文件对 HEAD 干净=纯本线 hunks；`git apply --check --reverse` 于施工树 PASS=逐字节对位）。克隆内全量 diff 存 `.w/snap_split.patch`。
- 工作克隆 `.w/`：snap_bake/snap_fixtures/snap_gate_profile 脚本 + snap_cut{1,2,3}.py 手术脚本 + 七轮 run 摘要 + gate/profile 记录 + 本线 B/c3 驱动 binary。大对象已清（缓存根/profile exe/中间轮驱动）。
- 挂接点备注：本线仅动 compiler_snapshot_lowering_bridge.cheng 单文件，与 GEN2-LADDER（backend/materialize 域）、主树在途 hunks 零交叠，合并无 hunk 对位风险。

## 六、纪律记录

- bake_win 全程原子锁（owner=SNAP-SPLIT+pid）；rivals 判别排除 shell 误报；期间 l3b4（w1a/w1c 探测环）、gen2wave（gen2_knife1）、merge_0906 m3、pb_run_diag（diag/diag2）多线交错，除最后一次语义冲突降级外全部让行等待（含一次 40min 到限重排）。
- 全冷禁缓存口径四轮一致；gate/profile 在窗口内串行执行。
- 未 git commit；主树只写 campaign docs/patches；克隆大对象已清。

## 七、主线程合入复验（2026-09-06，收割追加）

1. snap_split.patch（单文件 +243/−128）git apply 干净落地主树；三相位符号（PhaseAuthorityIssue/PhaseAdmissionSeal/PhaseStoreCommit）grep 在位。
2. 配对烤机 m4=m5=282a683eec462a66937b62ff83956a0a31615b0c1cbb3dd2d87b51605ec35973（rc=0，205-207s；sha≠合入前 96c728ce 系工作区快照 CID 槽随源编辑必漂，与本线 clone 内观察同域，非重构引入）。
3. 全门认证（m4 驱动）：rc=0——四夹具 4/4 PASS、探针区 7 绿（PROBE-PASS）+ 12 红（PROBE-RED，判决串逐字命中）+ 0 STALE，树峰 994,951,168B < 1GiB。
4. 基线 tsv 红行两处口径修正：compile-fail 行 run 列须空（非 0）；probe_for/match/try/array 真实编译 rc=2（非 1）。教训：红行注册必须带真实 rc——gate 对期望 rc 精确匹配，错型即 STALE。
