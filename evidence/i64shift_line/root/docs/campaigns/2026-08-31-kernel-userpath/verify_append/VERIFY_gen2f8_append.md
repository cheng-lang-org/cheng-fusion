# VERIFY_gen2f8_append —— [GEN2-FINAL8] GEN2 死相诊断+定点刀：8MB 前提证伪，实墙=profiles 双尖峰+metadata/forest 段（B3 域）2026-09-09

date_utc=2026-09-09 · 代理=GEN2-FINAL8（战役 R「GEN2 死相诊断+定点刀」）· 克隆=/Users/lbcheng/cheng-f24/gen2f8（cp -cR g2retest 全刀态，commit 756b08517 基线+14a1fd45f IFEXPR 施打）· 车头=/tmp/cheng_cold_v2（sha 7f731d4d…）· 守卫口径=驱动内建 phys_footprint（os.ProcessRssBytes，Darwin 含 compressed）· 全轮 bake_win 锁+900s 帽，零抬帽

## 一、结论先行

**「forest 段 8.25MB 超线」的使命前提在当前世界被证伪，8MB 级定点刀不存在。实测（三轮自洽驱动+一轮 m52 锚点对复现）：①当前根（239 源/2.89M body ops，比 m52 时代 +9.6% ops）上 profiles 相自身工作集已贴/穿 768MiB 线——自洽 DRV（f8drv2）三轮 after_profiles = 785.96/807.26/808.63MiB（249-250s，4.17M 活分配，±23MB 噪声带，全部 ≥805,306,368 线下不可能稳定通过）；②m52 驱动（da7fb56d，768MiB env 限值）79s 即死于 profiles 相内（trip 810,861,768），615s forest 账不复现；③profiles 后 metadata/forest 段再 +270~290MB（after_profile_lookup 标记始终未达，默认 1GiB 内建守卫 trip rc=125@356-371s）。逐源轨迹定谳 profiles 相双尖峰：**typed_expr.cheng profile 载荷独占 +125.5MB（1684 decls）、parser.cheng +50.3MB（962 decls）**——own_walls/typed3 合入使两大源暴涨，任何驱动代际的 profiles 相都被顶到线上。rc=0@768MiB 需要 profiles −50MB 且 metadata/forest 段 −300MB（B3 contexts 生命周期重构域），按止损条款交相构成账+候选刀清单，不硬凑。**

## 二、世界锚定（与使命锚点的偏差如实入账）

| 项 | 使命锚点 | 实测 | 处置 |
|---|---|---|---|
| 主树现态 | 全刀态可烤 | **intern.cheng 在途坏态**（0×indexKeys vs compiler_csg.cheng 引用 31 处），冷链烤机 rc=2 `unknown field 'indexKeys'`（.w/f8/run_f8drv0） | 弃用；锚定 g2retest（intern.cheng 11:02 态，31×indexKeys，编译一致） |
| IFEXPR 修复 | 已在驱动态 | g2retest 原始态无（0×valueIsConditional），自烤 rc=2 `if expression else missing`@69s（ownership_body_ir_production.cheng）；修复只在 ifexpr 克隆 | 施打 ifexpr_fix.patch 两 hunk（commit 14a1fd45f），复烤过墙 |
| m52 驱动×g2retest=615s/813.9MB@forest | 锚点收据 | 复现轮 79s 死于 profiles 相内（810.9MB vs 768MiB env 限值） | 前提证伪；813.9MB 收据=±23MB 噪声带内的一次采样（见 §五） |

## 三、分相构成账（自洽世界，gen2f8 根 × f8drv2 系驱动）

| 相/点位 | RSS（footprint 口径） | 时刻 | live_allocs | 备注 |
|---|---:|---:|---:|---|
| after_sort_sources | 268.4MB | ~52s | 109,374 | profiles 循环起点 |
| profiles src=128 | 544.4MB | — | 2,401,392 | 线性爬升段 |
| **profiles src=140（parser.cheng 已处理）** | **572.0MB** | — | — | **+50.3MB 尖峰（962 decls）** |
| **profiles src=143（typed_expr.cheng 已处理）** | **697.5MB** | — | — | **+125.5MB 尖峰（1684 decls）** |
| profiles 循环末（src=238） | 753.8MB | ~248s | 4,112,000 | |
| after_profiles（三轮带） | **785.96 / 807.26 / 808.63MB** | 249-250s | 4,168,921~4,168,963 | **768MiB 线在此相内** |
| metadata/forest 段 | +270~290MB，无新标记 | 死前 ~110s | — | after_profile_lookup 未达（contexts/forest 段） |
| 内建守卫 trip（默认 1GiB） | 1,074.3~1,076.0MB | 356-371s | — | rc=125；768MiB env 限值下死点前移至 profiles 段内 |

探针=compiler_csg.cheng profiles 循环内 env 门控 DebugLine（每源 RSS/decls），诊断后已还原，交付 patch 不含。

## 四、死相持有者分解（vmmap --summary 峰窗）

| 轮/窗 | footprint(峰) | VM_ALLOCATE（arena mmap 层） | MALLOC | 固定面 |
|---|---|---|---|---|
| m52anchor@ps794MB（profiles 死窗） | 782.5M（825.7M） | **823.7M virtual / 553.3M dirty / 199 段** | SMALL 184M virt/167.2M dirty；LARGE 20M 活+24M 空尸 | __TEXT 157M resident+__LINKEDIT 等 ~180M |
| diag2@ps800MB（profiles 中段） | 639.7M（767.6M） | 412.6M / 157 段 | SMALL 173.3M dirty；DefaultMallocZone 1.36M allocs，分配 133.7M，**碎片 65M（33%）** | 同上 |

定性：profiles 相 ~550-600MB 驻留 arena 段（VM_ALLOCATE，段数随源增但有吐纳）+ ~170MB MALLOC 活集（33% 碎片）——双尖峰源（typed_expr/parser 的 decl/call 载荷+str/CID 列）与全闭包 +9.6% ops 的背景增长叠加，把 profiles 相顶到线上；metadata/forest 段的 +270~290MB 攀升者=typedMetadataContexts 全量驻留（tamem2 实测 1.2-3.9MB/源，B3 未施工）+forest 合并 arena（B1 精确容量两阶段化不在本世界，现形=逐源 parse+AppendFrom）。

## 五、813,958,320 收据的定谳（使命死点）

m52 驱动 × 当前根，profiles 相在 typed_expr/parser 尖峰窗即达 ~805-811MB。协调人三轮收据（805.45/810.5/813.9MB，限值 805,306,368）与本席 m52 复现轮（810.9MB@79s profiles 内）同属一个 ±23MB 噪声带上的不同采样点：噪声低时 profiles 擦线而过、死在 forest 段（=813.9MB@615s 收据）；噪声高时死在 profiles 段内（=本席 79s）。**该死点不是单相单持有者的定点问题，而是整树工作集压线（profiles）+metadata/forest 段超配（+270~290MB）的复合态。**

## 六、候选刀清单（按判刀序，含依赖审计）

| # | 刀 | 持有者 file:line（gen2f8 态） | 实价 | 可行性 |
|---|---|---|---|---|
| 1 | **B3：metadata contexts 生命周期**（即取即用/分片驻留，expr 层改读 lookup 而非 contexts 本体） | compiler_csg.cheng compilerCsgBuildMetadataContextsRec(:36556)+typed_expr.cheng contexts 消费面（:36774/:36825/:37033/:37158/:37231） | metadata/forest 段 −270~290MB（观测攀升全量） | **rc=0 唯一决定性刀**；TA-MEM2 已移交，expr 层读取重构=跨日工程 |
| 2 | B1：forest 精确容量两阶段合并（先 ΣArenaUsed 后一次成型） | compiler_csg.cheng CompilerCsgBuildParserForestAuthorityInto(:33016) 森林合并循环 | 消 T≈450-530MB 的倍增/过冲风险 | 模型价；需先有 #1 让 run 活到 forest 后才可实测 |
| 3 | 行表释放点前移+forest 后置 | reset 调用 compiler_csg.cheng:39062→CompactProfilesForFixedPoint(:38640) 后；forest build+typedContextLookup(:38506-38524) 后移过 compact | ~90MB（lineStore+lineInternPool）在 forest 窗白驻 | **依赖审计已完成**：行表最后读者=BuildReachableFunctionSet(:38530)；compact(:38640)→:39062 之间零读者（grep 全量核verify）；森林/lookup 只读 profile 的 migrationSourceSyntax 位（compact 保行结构）；abort 面 teardown(:35890) 幂等。 Helps post-reachable 窗，不救 profiles 尖峰【更正 2026-09-10 审计：`:39062` 在 HEAD 为轮次上界注释、非 reset 调用（该行整组行号偏低：本文档 `:38640`↔HEAD `:38823`、`:38530`↔`:38684`）；固定点尾部释放组现址 `:39104`（实读 `CompilerCsgNormalizedExprLayerTerminalRelease(work.exprLayer)`）/`:39107-39108`（实读 `CompilerCsgFrontierParsedSourceStoreRelease(work.frontierParsedSources)`）；所述「行表释放点前移+forest 后置」已在 HEAD 落地（compact `:38823`、deferred forest `:38828` 起）】 |
| 4 | profiles 载荷 SoA/intern 化（双尖峰源） | parser.NormalizedExprCallProfile/NormalizedFunctionDecl 载荷列 | typed_expr.cheng −125.5MB、parser.cheng −50.3MB | decl 结构本体仅 ~200B，质量在 str/CID 载荷列；需 parser 线 owner 施工 |

## 七、交付物与证据链

- `patches/gen2f8.patch`（主树 patches/，新增，sha256=2bc6aa4cfc39965d7e26a2ff01364b42351170f6e15d49622368cd80d8531ea7）= ifexpr_fix.patch 两 hunk 相对 g2retest 态的施打 diff（parser.cheng +39/−2 域）；它解自烤 rc=2 if-expr 墙，是任何后续 GEN2 轮的前置件。
- 克隆 gen2f8：commit 756b08517（g2retest 基线）→ 14a1fd45f（IFEXPR）；诊断探针已还原，工作树 src/ 零漂移。
- 证据：.w/f8/{g2f8_bake.sh,g2f8_selfbake.sh,g2f8_selfbake_m52.sh} + run_f8drv0（主树坏态 rc=2）/run_f8drv2（DRV 收据 rc=0 wall=207s sha=15b7fd87…）/self_diag2/self_diag3/self_diag5（三轮分相曲线+stage 账+vmmap 16 张）/self_m52anchor（768MiB env 复现）+self_diag1（IFEXPR 墙 rc=2 判词）。
- DRV=f8drv2（.w/f8/run_f8drv2/kernel_driver，sha256=15b7fd870fcbe1049a6a4e6fad9c43bd6a1d95f27ea2bf05752226f08485fcb6，车头 7f731d4d 烤制 rc=0）。
- GEN2 rc=0 未达成（如实记红）；GEN3 固定点比对因 GEN2 未过无法执行。

## 八、纪律记录

- 主树零代码接触：仅 patches/gen2f8.patch 与本文档两件新增。
- 违章自首×1：写 m52 复现壳时误用一次 heredoc 落盘（AGENTS shell 纪律），事后 bash -n 验证未卡壳、脚本正确；已改回 Write 落盘，后续零再犯。
- 全轮 900s 帽零抬帽：诊断轮用驱动内建默认 1GiB 守卫取全程分相账（非抬帽放行，是守卫默认值）；768MiB 判定一律按 805,306,368 env 限值复现轮与三轮 after_profiles 实测判。
- 探针纪律：profiles 循环 env 门控 DebugLine 属战术探针，诊断完成即还原（git diff 零残留），证据留存于 diag3/diag5 日志。
- 大对象清理：7 个 170MB 级驱动二进制已删（sha 均已录），保留 f8drv2 代表件与全套文本/曲线/vmmap 证据（217MB）。
