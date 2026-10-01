# 2026-09-20 kernel-slab-pass1：幸存关键线档案镜像（证据抢救转正）

> 背景 hazard：`.rebuild/` 遭外部清扫连环灭失（此前 orcd11_line/slabdesign_line/x2cut_line 已丢，本收割窗口再丢 wdfs/copyback/branchb/prefabC/trioverdict/xterritory/closure_ruling/modelanchor/timemodel/quietwin/guardfix/pfhard 各线档案及 slabk1/slabk2 的 REPORT）。本目录 = mirror_line 抢救动作的转正落点：`archive/` 下逐份复制幸存原件（`/usr/bin/diff` 逐份核验 IDENTICAL，原文照录不加不改）；已灭失件在下方逐条登记「已灭失 + 现存权威替代物」。收割日 2026-09-20/21。

## 已镜像（9 份，字节恒等）

| 档案 | 原件 | 一句话结论 | 关键 sha | 状态 |
|---|---|---|---|---|
| `archive/m3fix_line_REPORT.md` | `.rebuild/m3fix_line/REPORT.md` | merge pass-0 全量 234/234 穿越主档：D6 精确 reserve + X2 段相序重排，B1 瞬态 −103 MiB 实证，src=61 @663.8 MiB，确定性门 234/234 逐字节；含 §5.5 分支 B verdict 同步 | 刀 `1c1b9148b`/`4f25fca0a`/`69fa6c349`；kd_m3fixd6 `25a9a598`；D6 patch `5122146b` | **已入库并推送** |
| `archive/p1phase1_line_REPORT.md` | `.rebuild/p1phase1_line/REPORT.md` | 墙 (a) phase-1 两刀：exact-index 延迟 + D6v2 预量道兼产，floor **713.2 MiB** 落预测带 [688.7,714.7]，穿越 src=13/15/16（wall-b 关闭），**爬深 src=63**，KILLED_PASS1_EXPECTED（预期形态） | 刀一 `56571f10e`、刀二 `2be4b0162`；kd `d62622f1` | **已入库并推送** |
| `archive/slabk1_line_segment_readings.txt` | `.rebuild/slabk1_line/segment_readings.txt` | 刀 1 烤后 in-compiler 对拍轮原始读数：234/234 源、46484 段重放、mismatch_total=0；真实段常数 D≈23242 段/闭包、max_seg_arena=**40.06 MiB**、med 16.5KB | 驱动 `ea607c40`（诊断轮载体） | 刀 1 **已入库 b6213616d**；读数归刀 2 消费 |
| `archive/slabk1_line_SLABK1_ATTRIB.md` | `.rebuild/slabk1_line/SLABK1_ATTRIB.md` | slab 役刀 1（parser 分段纯新增 +642/−0）施压档案=**已灭失的 slabk1 REPORT 的权威替代物**：行为不变四重证明 + lex 续行诊断零命中 + 段常数钉定 | patch `b3bb41ca…`；kd_slabk1_b `ea607c40…`；commit `b6213616d` | **已入库** |
| `archive/slabk1_line_CENSUS_DIAG.md` | `.rebuild/slabk1_line/CENSUS_DIAG.md` | 零烤静态回放普查（5802 文件/闭包 234 全零错）诊断附录，SLABK1_ATTRIB 佐证件 | — | 佐证件 |
| `archive/slabk2_line_SLABK2_ATTRIB.md` | `.rebuild/slabk2_line/SLABK2_ATTRIB.md` | slab 役刀 2（度量道分段化+索引 per-decl/per-seg base 列 +337 全 additive）施压档案=**已灭失的 slabk2 REPORT 的权威替代物**：零烤面全绿（preflight 三联 PASS/施加态字节恒等/恒等式定理三门/A/B 回放器形态 234 零错）+ (iv-f) 三判据重算 **713.2+40.06+3.0=756.26≤768（余 11.74）→ IVF_VERDICT=PASS_knife3_gate_open** | 三补丁 `38062235…`/`2c370c64…`/`1c772184…`；锚 HEAD `b6213616d` | 零烤面收讫；烤制+证明链排队（在飞） |
| `archive/slabk2_line_patch_shas.txt` | `.rebuild/slabk2_line/patch_shas.txt` | 刀 2 三冻结补丁 sha256 账 | 同上 | 零烤面收讫 |
| `archive/slabk2_line_ivf_recalc.txt` | `.rebuild/slabk2_line/ivf_recalc.txt` | (iv-f) 三判据重算账本（判据一/二/三 + 停线门 62/51.8 MiB 双门未触） | — | PASS_knife3_gate_open |
| `archive/slabk2_line_ab_replay_form.txt` | `.rebuild/slabk2_line/ab_replay_form.txt` | 零烤 A/B 回放器形态账（闭包 234/234 回放零错、construct_hits=0、静态口径 20829 段/max_seg_bytes=466261） | — | 零烤面收讫 |

## 已镜像·第二批（17 份，字节恒等，2026-09-21 转正；防每小时 GC 扫线）

| 档案 | 原件 | 一句话结论 | 关键 sha | 状态 |
|---|---|---|---|---|
| `archive/c1knife_line_C1KNIFE_ATTRIB.md` | `.rebuild/c1knife_line/C1KNIFE_ATTRIB.md` | C1 刀归因档：`std/result.cheng:51` `fn Ok[T]` 声明名 token 被行扫描 ResultIntrinsic 臂误识别成 kind=5 表达式行 → fail-closed；刀=声明名 token 精确 (line,col) 排除谓词，parser.cheng 单域 2 hunk 净增 37 | 刀 commit `b44d1d139`；patch sha `cc9aaa67`；镜像 `e4d854e8` | **刀已入库 b44d1d139**；档案转正 |
| `archive/duowall_line_DUOWALL_DESIGN.md` | `.rebuild/duowall_line/DUOWALL_DESIGN.md` | U 组两新墙施工级刀设计（零烤）：墙①BC3 PatternIterator 组行 + 墙②W4 static-arg setEnv 位点；含与预登记档案的行号漂移对账（判词站点 :22146→:22785，drift +639） | 坐标基准 HEAD `a8d072457`；镜像 `f620f22c` | 设计件；施工=D1 刀+预建三刀线 |
| `archive/prestage_line_PRESTAGE_DELIVERY.md` | `.rebuild/prestage_line/PRESTAGE_DELIVERY.md` | typed_expr 三刀预建交付（零烤/零 commit/活树零写入）：duo1 enum_conv + duo2 rhs_guard + se3 postfix_arg；SE1/SE2 红夹具按家族定义重建（PREFAB_C §S-E 原件已灭失的权威替代链在案） | 基座 `5bdb73644`；三 patch sha `171582e8`/`41e45039`/`d2d8e578`；镜像 `0128c215` | 预建件在库 |
| `archive/prestage_line_sha256sums.txt` | `.rebuild/prestage_line/sha256sums.txt` | 预建三冻结件 sha256 账（三 patch+三构建器+回放/预检/探针件，12 条） | 同上；镜像 `d73cc871` | 账本 |
| `archive/d1knife_line_d1_typed_expr_pattern_iterator_group.patch`（同前缀共 6 件：patch/REPLAY/DELIVERY/MANIFEST/range_hits/non_range） | `.rebuild/d1knife_line/` | D1 刀冻结件+回放账：BC3 墙① PatternIterator 声明局部组行注册+注册即消费；typed_expr 单文件 6 hunk +184/−3；红臂判词三源一致、零增量判定 | patch sha `2d56a5ff`；基线 f0b068a7b/0dbde57f9（typed_expr 基线 sha 同 `60e25288`）；镜像同 `2d56a5ff` | 预建件（落库等预建三刀提交窗）。注：MANIFEST 中 `replay_range_form_hits.txt` 条目与现档漂移（账 `93b9016b` → 实测 `81e37892`，其余 9 条全 OK），两版清单均已镜像存照 |
| `archive/overload_line_OVERLOAD_DESIGN.md` | `.rebuild/overload_line/OVERLOAD_DESIGN.md` | overload 歧义族裁决定谳：result.cheng:103 特化 `Error(Result[bool])` 与 :109 泛型 `Error[T]` 同 arity 同秩 → ambiguous fail-closed；③结构冗余成立（双体逐 token 相同）；修法=源侧去重单 hunk −7 行删特化保留泛型（零编译器改动，镜像 W4-os 工艺）；spec 真缺口（同名/特化-泛型 tie 秩规则）走条文化提案 | 冻结机 `05af823e` + kd_c1_b `d86f1bb3`；镜像 `374c1cdf` | 裁决定谳；去重刀待施（去重 patch 在 overload_line 原目录，非本批清单） |
| `archive/errdedup_line_preflight_receipt.txt` | `.rebuild/errdedup_line/preflight_receipt.txt` | 去重刀预检回执：**FAIL-by-design**——删特化块连带丢失 `@borrows on declaration Error` 注解归属（ann=0/displaced=2/wedged=0），按三道机械预检纪律实登记，不以文本级补丁绕过 | 镜像 `9e2b6e57` | FAIL-by-design 实登记 |
| `archive/w4os_line_os_cheng_w4_migration.patch` | `.rebuild/w4os_line/os_cheng_w4_migration.patch` | W4-os 规范迁移冻结件：跨模块裸调未导出名违反 §1.4 → 迁移至导出包装 StrToCStringTemp（os.cheng 单文件） | **已入库 f0b068a7b**；镜像 `fa0ffaed` | 已入库；os.cheng.new/.orig 工作副本未镜像（commit+patch 可重建） |
| `archive/lottery_line_LOTTERY_CENSUS.md` | `.rebuild/lottery_line/LOTTERY_CENSUS.md` | aarch64 布局彩票家族普查**无罪定谳**：WDFS 刀后编译器字节恒等（`ac41af29e..HEAD` bootstrap 零 diff）→「新布局抽彩」不可能由重烤新触发；活症状（TLS 握手相 60% 挂死）=新 hunk（a85e5b5f9 泵门）BodyIR 面，非编译器彩票 | 窗口铁证 `ac41af29e..HEAD` 零 diff；镜像 `dc4ffaa9` | 无罪定谳 |
| `archive/diffforensic_line_DIFF_FORENSIC.md` | `.rebuild/diffforensic_line/DIFF_FORENSIC.md` | A/B 差分**定谳**：同编译器 kd_abv_1 下全对象 2315 函数指令流差分=恰 2 函数（PumpCodeUnlocked +125/DialPumpReadyCode +6）且逐指令语义忠实，三已知误译模式不现形；padding 敏感（10/10→1/10）真臂在恒等面外，样本须 VPN lane 补交 | A=`3772443b`（HEAD c03ad5470）/B=`c5618d91`；kd_abv_1 `751af957`；镜像 `22fff570` | 定谳；真臂样本待补 |
| `archive/guardv2_line_CHANNEL_AUTHORITY.md` | `.rebuild/guardv2_line/CHANNEL_AUTHORITY.md` | guard 三通道权威表 v2 交接件：§1 幸存权威转述（超门 fail-stop=beat_c 通道 A/埋点=通道 B/rusage maxrss 峰值权威）+ §2 追加 v2 行（additive 只增不改） | 原件 guardfix_line 已灭失（第一批登记）；镜像 `b692698a` | 交接件转正 |
| `archive/guardv2_line_VERIFY_beat_c_v2.txt` | `.rebuild/guardv2_line/VERIFY_beat_c_v2.txt` | beat_c v2 零烤合成 spike 验证账：V7 shim 单元契约 7 PASS（receipt schema/maxrss/exec-fail/相对路径拒绝）+V1/V2 spike 列 A/B 命中全 PASS | guard sha `9ad616ed`、v2 sha `b4bb2103`、shim 源 `72e8ba21`；镜像 `b42405f7` | 验证账收讫 |

在库登记（活树在位，不镜像）：`tools/beat_c_v2_process_group_guard.sh`（被 `.gitignore` `*.sh` 拦截，工作树未跟踪）+ `tools/beat_c_v2_rusage_wait_shim.c`（未跟踪）——权威 sha 以 `archive/guardv2_line_VERIFY_beat_c_v2.txt` 账为准（guard `9ad616ed`/shim 源 `72e8ba21`）。



## 已灭失 + 现存权威替代物（原线档案不在磁盘）

| 灭失件 | 现存权威替代物 | 结论与关键 sha | 状态 |
|---|---|---|---|
| `.rebuild/slabk1_line/REPORT.md` | `archive/slabk1_line_SLABK1_ATTRIB.md`（同目录幸存，已镜像） | max_seg_arena=40.06 MiB 钉定；刀 1 入库 `b6213616d` | 已入库 |
| `.rebuild/slabk2_line/REPORT.md` | `archive/slabk2_line_SLABK2_ATTRIB.md` + 同目录三账本（已镜像） | 零烤全绿 + (iv-f) PASS_knife3_gate_open | 在飞（烤制链排队） |
| `.rebuild/wdfs_line/REPORT.md` | commit `ac41af29e` 全文（红绿账逐项在 commit message）+ 抢救副本 `.tmp-exec/vpn-rewind-verify/`（b_c*.txt 原始件） | VPN bug①③ 根修：aarch64 loop-plan peephole 边界检查 scratch R3→R2（迭代子布局彩票）；夹具 scan32 sum=1 红→3040 绿；knife 三烤反汇编 sha `0fa2beda` 全等；VPN 闭包 4 烤 .o 同 sha `c5618d91` | **已入库 ac41af29e** |
| `.rebuild/copyback_line/REPORT.md` | 无独立存活副本；结论以本行转述为准（bug② 免刀——对照 bug①③ 的 peephole 根修，bug② 无需动刀、无入库物） | bug② 免刀 | 免刀（零入库物） |
| `.rebuild/branchb_line/VERDICT_branchb_w1_retest.txt`（verdict sha `23a3780f`） | m3fix REPORT §5.5（=`archive/m3fix_line_REPORT.md`，逐字转述表）+ 看板 2026-09-20 晚改判行 | 分支 B 复测 **bin=no（3/3）+三新判词**：c1=normalized expression parser node missing kind=5 @std/result.cheng:51；c3=unresolved structural Call callee=range；c6=resolved call missing concrete type __cheng_cstrlen @cmdline:178；旧 W1/W3 判词不复现=累计刀生效 | 复测结论已转正看板 |
| `.rebuild/prefabC_line/PREFAB_C.md`（7 哨兵夹具清单） | **在库夹具本体** `src/a9_wall_probe/c0.cheng…c6.cheng`（git 跟踪，清单实物未灭失） | c0–c6 七哨兵夹具（c1/c3/c6 即分支 B 复测夹具） | 在库 |
| `.rebuild/trioverdict_line/TRIO_VERDICT.md`（c1/c3/c6 三族裁处） | m3fix REPORT §5.5 + 看板「分支 B W1/W3/W2 改判」行（本次落库）；墙位登记处=cheng-rsi-fusion-plan §3.3 | 三新族判点归属改判（见 branchb 行） | 裁处结论已转正看板 |
| `.rebuild/xterritory_line/RULING.md` | commit `a6264c0a8` 全文（裁决三重结构证据：红证 b1fbc7e83 双前提互斥+op79 击穿）+ 看板 T-K 行 | FunctionAddress 跨领土死前提判废；施工=csg_core schema 1 hunk（+6/−2）；冻结件 patch sha `dd905bc3`（fix_line 目录同灭失，刀已入库） | **已入库 a6264c0a8**（green 待 T-E 爬坡消费） |
| `.rebuild/closure_ruling_line/CLOSURE_KIND_RULING.md` | commit `bcfb0c01a` 全文（D1 死前提判死留锚，纯注释零行为）+ 看板 kind 前提普查行 | 死前提 3（D1/D2/D3）/高击穿 1（F1/F2）/留验 R1-R3；born 三钉 a7ee2da19/f681cad2b；F1/F2 预制件补丁 sha `6c733b7a`（closure_fix_line 同灭失，未入库，待爬坡触达前按看板行重建） | D1 留锚**已入库 bcfb0c01a** |
| `.rebuild/modelanchor_line/MODEL_ANCHOR.md` | `docs/campaigns/2026-08-31-kernel-userpath/design/memory_model_constraints.md`（R(k) 补锚与 X2 价修正全文在卡，commit `fe4f233c7`） | R(k)=reachable 函数集驻留新模型项 76.3–76.6 MiB/234 源、斜率 0.326–0.328 MiB/源；X2 价修正 473,175 B/源（段净）；待钉区顺增⑥ | **已入库 fe4f233c7** |
| `.rebuild/timemodel_line/TIME_MODEL.md`（M4 时间模型） | 看板 §M4（typed-facts 相 1348-1463s 实测、Top-3 刀、L1 路径）+ `design/time_model_structural.md`（L1 结构化模型） | M4 时间档读数与刀序转述 | 转述在库 |
| `.rebuild/quietwin_line/JUDGE_M4.md` | 看板 §仪器栏「静窗五项一发」行（JUDGE_M4 三态判定表转述；quietwin_retest.sh 同灭失） | T-E 绿后一发五项静窗复验判据 | 判据转述在库 |
| `.rebuild/guardfix_line/CHANNEL_AUTHORITY.md` | 看板 §仪器栏「guard 三通道权威表」行（通道 A/B/C 权威全文转述） | 超门 fail-stop=beat_c；埋点=通道 B；rusage maxrss 峰值权威+ps 只作下界 | 权威表转述在库 |
| `.rebuild/pfhard_line/HARDENING.md` | **硬化版本体在位** `.rebuild/s1b_step3/r9/patch_preflight.py`（仍属易失区）+ 看板 preflight 硬化行 | 杂注解线伪声明误报根修（annotation_map 声明归属）；165 件同语料回归唯一翻转 W2 移除件 FAIL→PASS、零 PASS→FAIL | 本体在位（建议下轮随转正件落 docs） |
| `.rebuild/staticarg_line/REPORT.md`（static-arg :1809 红→绿定谳主档，第二批收割时已灭失） | commit `45d342fb9` 全文（三刀归因/红绿账/验收全在 commit message，HEAD 祖先已核）+ DUOWALL_DESIGN 墙②节预登记引用 | call 静态实参定型 `TypedExprStaticExprTypeAtLevel` 无 if-expr 臂 → :1809 判点；三刀（成员1值形实参清场 + 成员2地基臂×2）已落库；d1 爬深 5 轮全闭包 234 源穿越实证 | **已入库 45d342fb9**（档案灭失，commit 为权威替代物） |
| `.rebuild/c36_line/`（C3+C6 双臂烤制档案，含 C36KNIFE_ATTRIB/bake_wrap.log/A·B 臂盘，第二批收割时已灭失） | commit `a8d072457` 全文（红臂判词逐字复现+墙位前进+四合同 primary.o 双臂恒等 4/4 全在 commit message）+ TRIO_VERDICT §三/看板 branchb 改判行（第一批已转正）+ DUOWALL_DESIGN 判点原始件节 | C3 for 头 LoopSource 直根 call 认领 + C6 importc 兼容矩阵 ptr→cstring 臂；双臂烤制 A sha `1ef301ff`/B sha `591eb422`；preflight 换头重建逐字节同 sha `0447be81`/`0baab732` | **已入库 a8d072457**（档案灭失，commit 为权威替代物） |

## 背景灭失（本任务前已丢，登记备查）

- `.rebuild/orcd11_line/`：ORCD11 地址级仪器与绿证档案——判据以 commit `c92975786` 全文 + 看板「2026-09-19/20 收割链回填」节转述为准（kd_orcd11f sha `50e05eb6`）。
- `.rebuild/slabdesign_line/SLAB_DESIGN.md`：slab 三刀设计书——刀 1/刀 2 范围按 SLABK1_ATTRIB/SLABK2_ATTRIB「施工依据」条款转述执行，刀 3 带 62 MiB 停线门。
- `.rebuild/x2cut_line/REPORT.md`：X2 projection 预测先行判 RED（无 slab 下界证明 773.8>768）——结论以 m3fix REPORT §5 重裁一转述为准。

## 账本回填（同一 commit）

- `findings.md`：GEN blocker 销账（oracle V1/V2/V3 commitment 已支持）+ D7/D8/D9 勘正 + 192-Join 修复集 5/8 分叉教训。
- `docs/campaigns/2026-08-31-kernel-userpath/design/milestone_board.md`：分支 B W1/W3/W2 改判 + 2026-09-20 晚收割链追加。
- `lessons.md`：两条候选（修复集与 git 提交态分叉 / 排除法归因链可全错）。
