# CSG 语义视频战役总收口（FINAL）

日期：2026-09-20。范围：本战役 9/16–9/20 全弧线交接文档。证据入口：`progress.md`（全程记录）+ `results/` 33 篇报告（按时间线）。本文所有数字带来源报告文件名；设计文档 `docs/csg-semantic-video-core-design.md` 顶部「实现状态（2026-09-20）」节指向本文对应节。

## 1. 一句话结论

实拍素材（胡广生 base.mp4 496,166B）已达成「存量→CSG 语义记录（结构 L0 + 深度 L1 + 平面级 L2）+ 纯 Cheng QUIC/libp2p 通道跨机双向传输（安卓↔鸿蒙真机，逐字节 sha256==cid 对拍）+ 像素与语义同容器一次传输（SSM2 三载荷 3,533,186B）+ 渐进起播（首帧早于全量收完约 10s）+ 真机可见完整播放至 EOF」的可验证形态。压缩口径分两条如实陈述：**born-digital 口径**——可仿真内容的像素导出 vs 状态闭包 = 155.6:1（同内容同画质同能力，恢复侧付出重演计算）；**实拍语义侧口径**——语义容器不含任何像素/音频字节，还原不出画面，85,960B vs mp4 = 5.77:1、vs 逐帧 RGB = 257.3:1（语义侧摘要比值，非重建压缩比）。对象级语义（L3）与识别模型未接线：实拍可见画面走像素载荷（mp4），语义侧是结构+深度+平面级的 degraded 表示（results/sv_semplane_container.md、compression_report_f_loop.md、semantic_conversion_feasibility.md）。

## 2. 弧线叙事

### 2.1 格式层（B1，9/16）
`semantic_video/{schema,writer,reader,validator}.cheng` 四模块 + 六 smoke（roundtrip 字节级一致、负例 13 例、原子提交、夹具导出、时间合同、时钟映射）全绿；独立第二实现为纯 Cheng 的 `sv_ref_decoder.cheng`（不复用生产解析器任何解码函数），对冻结夹具 b1_sample.svblock（4,087B、factCount=12）互操作对拍 PASS。规范冻结合同落码，旧读取端对未知 kind 按 sv_unknown_kind 拒绝的前向兼容语义成立（interop_ref.md、progress.md 9/16 B1 节）。

### 2.2 存量转换（B2/E1-lite，9/16–17）
`source_index.cheng` 独立解析 stsz/stco/co64/stsc + convert 管线，两真实样例（sample.mp4 15,610B/14 样本/1 关键帧；hgs_faststart.mp4 5,887,367B/675 样本/6 关键帧+音频）产出 svblock（1,392B/2,186B），ffprobe 与 Python 独立重推对照一致、字节确定（results/b2_convert.md）。E1-lite 纯计量：同能力回放下无压缩增益（hgs 冷包 5,889,553B = 原片+语义增量 2,186B，热增量 bp=3；sample 热开销 8.91%），三结论固定 = playback_no_gain / hot_increment_is_semantic_only / fair_ratio_not_claimed（results/compression_report.md）。

### 2.3 播放器（B3/F3，9/16–17）
`semantic_player` 验证链（源 CID+索引 CID 双重绑定）→ info/query/seek/play 全部证据回溯到源文件字节（每步实读 offset:size），损坏源结构化拒绝（results/b3_player.md）；`semantic_hub` 七模式单入口（verify-footage/verify-snap/restore/query/seek/chain），合并块五段链 chain=ok，六路负例拒绝（results/f3_hub.md）。边界：仓内无 H.264 解码桥，此代播放器播记录时间轴+证据锚，像素呈现走后继真机渲染线。

### 2.4 f 闭环（F1/S1–S5 + 像素门，9/17–19）
sv-snap.v1 位级 float64 编解码 174 字段，快照块 3,035B + 三检查点 payload 8,444B×3；三恢复点（ck-1200/2400/3600）续跑 3,800/2,600/1,400 tick 逐 tick World3dCid 与直通全等（results/f1_snapshot.md）。公平基准：ball_balance.mp4 4,496,279B vs 状态闭包 28,897B = 155.6:1（born-digital 限定），footage 行独立计量不互除，restore 2,800 tick wall 8,175.124ms（两轮 -13%~-20%）（results/compression_report_f_loop.md）。S5 硬围栏探测：实拍对象提取 = feasible-with-external-frames，纯 Cheng 无像素字节出口、朴素启发式不稳（results/f5_extraction_probe.md）。像素层补齐：T-A 12/12 采样帧 + T-G 全帧 7,803 对同 tick 帧 SHA 全等（mismatched=0），恢复确定性从状态层传递到像素级（fe_hap_libp2p.md §20、results/pixel_gate_full.md）。注意：f1 夹具原 worldCid 系 1 扫早退 bug 轨迹上录制，已由物理修复失效并重录（见 §2.9）。

### 2.5 跨机双向（F-A…F-J + 真机播放，9/17–20）
验收门先冻结后测量（L1 双向各≥10 轮 T_FETCH p50≤3000/max≤5000ms、L2 ready→首帧 p50≤1000ms；载荷 huguangsheng.ssm1 2,955,365B）（results/miaofa_gate_v0.md）；双真机正式测量 20/20 全 PASS——方向A（Mac→安卓）T_FETCH p50=1,282/max=3,572ms、ready→首帧 p50=86ms；方向B（安卓→鸿蒙）p50=1,958.5/max=2,260ms、p50=112ms，零放宽（results/ma_reconnect.md、miaofa_dual_real.md）。libp2p 压缩闭包 28,897B：安卓宿主 5/5（results/fg_android_verify.md）、跨机×HAP 3/3（SV_FETCH_MS 1,744/1,784/1,688；真根因=多闭包 obj 链接类型符号冲突 1,486 个，fe_hap_libp2p.md §10）。ohos serve 方向五层清偿（exit(42)→裸 futex 被设备策略封死→dual-role 互踩→send 链 TOCTOU→泵门改数据面存在性判定）后，鸿蒙 serve→安卓 fetch 跨机历史首次 3/3 全绿（wall 1,874/1,789/1,739ms），自连 3/3（fe_hap_libp2p.md §12–§18）。耐久 100/100 轮：T_FETCH p50=1,809ms、RSS Δ=-0.89%（results/td_durability.md）。可见播放线：base.mp4 经 SSM1 封套跨机→AVPlayer 完整播至 EOF（2/2+复现 2/2，results/base_ssm1_transfer.md、base_ssm1_transfer_repro.md）；CSG 仿真世界真机播放 240 帧 3/3（fe_hap_libp2p.md §24）；深度流完整播放 posMs 0→22,500 eof=true（fe_hap_libp2p.md §23）。边界实证两轮：跨机流内是纯 DPD1 深度容器（0 mp4 box）、q3_serve 载包合同排他 SSM1 魔数（fe_hap_libp2p.md §21/§22）。

### 2.6 语义记录（9/19）
L2 平面级语义（387 条 RANSAC 平面轨道）以正式一等记录类型 `csg_semantic_video::plane` 入容器，规范 §9 增补（既有 10 kind 零改动）；容器 85,960B（sha256 f240fe88…），10,490 次字段对拍 0 差异，Mac/安卓真机双机产物同哈希；诚实口径压缩比 5.77:1 vs base.mp4、257.3:1 vs 逐帧 RGB（results/sv_semplane_container.md）。svblock 复用 SSM1 封套通道跨机 2/2 绿，四路对拍全等（results/svblock_transfer.md）。

### 2.7 SSM2（9/20）
SSM2 v1 复合容器（自有魔数，复合 manifest=载荷数+各载荷 kind/byteLen/sha256/offset）实现「一次传输=完整语义视频」：双载荷 582,340B（mp4+svblock）Mac 全链+安卓真机+serve 腿 2/2 全绿，负例 10/10 精确拒收（results/ssm2_hybrid_container.md）；三载荷 3,533,186B 扩容（+深度 DPD1 2,950,740B，45 chunk 结构/crc32/npy 源逐位 1,474,560/1,474,560 对拍全过，负例 2/2）（results/ssm2_depth_payload.md）。HAP 解封消费 5 轮全 PASS（unseal 5–7ms、payload[0] 播至 EOF 25,068–25,656ms、沙箱三件拉回逐一对拍）（results/hap_ssm2_progressive.md）。

### 2.8 渐进（9/20）
base.mp4 的 SSM1 传输从「单 chunk 全量收完才能播」升级为 8×64KiB 索引容器（headerLen=824B），首 chunk 65,536B 含 ftyp+moov+mdat 首段=起播就绪前缀（ffprobe rc=0、前缀独立解码 50 帧、拼回与源逐字节等），起播字节收益 7.57×（线上口径 7.48×）（results/chunked_progressive_ssm1.md）。HAP 真机仅收 chunk0 即起播：firstPlay 2,378/2,142ms ≪ 全量收完 12,618/11,913ms（提前 10,240/9,771ms），后台 7 chunk 逐个 QUIC 取回回填，终文件 sha==源（results/hap_ssm2_progressive.md）。

### 2.9 夹具防线（9/20）
f3_hub 预存红定谳为夹具过期而非回归：557e8e8d9 修复 base pass 1 扫早退 bug（真 96 扫）使 9/17 夹具 worldCid 永久失配，factsCid 零漂移（results/f3hub_snap_cid_triage.md）。重录夹具（3,129B，d31b44c6…；factsCid 逐字节等作零漂移锚）并落地机械防线：规范 §2 既有 x- 条款落 `x-physicsBaseline`（tick8 探针指纹），缺键/失配负例均报「夹具基线过期」而非裸 cid_mismatch（results/f1_fixture_rerecord.md）；防线接进 semantic_snapshot restore（results/hub_cli_baseline_wiring.md）与 semantic_hub verify-snap/restore/chain 快照臂（results/semantic_hub_guard_wiring.md）。

### 2.10 UI（9/20）
25 键胶囊墙（PROBE/CAM:+12/DEMO 三键屏外出屏实锤）重构为正经视频应用形态：顶栏（双设备状态点+版本）、16:9 播放器主角卡（AVPlayer+深度 overlay 双层+sha 校验角标）、控制条、五组 Tabs（传输 10/播放 3/场景·相机 6/采集 4/诊断 2）2 列操作卡、可折叠日志抽屉。纯表现层：业务 handler 逐字未动，25 键全量保留，装机 versionCode 1000068，回归 2/2 + D3 三载荷点验全绿（results/hap_ui_redesign.md）。

## 3. 指标总表

口径列：仿真=Mac 离线/夹具层；真机=安卓/鸿蒙真机实测；语义侧=不含像素字节；像素级=逐帧渲染字节比对。诊断=静态归因/指纹。

| # | 指标 | 数值 | 口径 | 来源报告 |
|---|---|---|---|---|
| 1 | born-digital 公平比值 | 155.6:1（4,496,279B 像素导出 / 28,897B 状态闭包，同内容同画质同能力，仅可仿真内容） | 仿真 | compression_report_f_loop.md |
| 2 | 实拍语义侧比值 vs mp4 | 5.77:1（85,960B / 496,166B，语义侧不含像素） | 语义侧 | sv_semplane_container.md |
| 3 | 实拍语义侧比值 vs 逐帧 RGB | 257.3:1（85,960B / 22,118,400B） | 语义侧 | sv_semplane_container.md |
| 4 | 存量转换语义增量 | hgs 热增量 2,186B（bp=3）、冷包 5,889,553B；sample 热开销 8.91% | 语义侧 | compression_report.md |
| 5 | f 恢复计算代价 | 8,175.124ms / 2,800 tick（复测两轮 -13%~-20%，同窗口相对比较） | 仿真 | compression_report_f_loop.md |
| 6 | 5bit 深度打包（第 4 档，未入容器） | 3.16×（total 933,888B < 983,040B 门；MAD16=389 有损） | 仿真 | progress.md（9/19 F-L 节） |
| 7 | 冻结门方向A（Mac→安卓） | T_FETCH p50=1,282 / max=3,572ms；ready→首帧 p50=86ms；完整性 10/10 | 真机 | miaofa_dual_real.md |
| 8 | 冻结门方向B（安卓→鸿蒙） | T_FETCH p50=1,958.5 / max=2,260ms；ready→首帧 p50=112ms；完整性 10/10 | 真机 | miaofa_dual_real.md |
| 9 | T-D 耐久 100 轮 | fetchOk+sha256-match 100/100；T_FETCH p50=1,809 / p95=2,260 / max=2,864ms；RSS Δ=-0.89% | 真机 | td_durability.md |
| 10 | libp2p 跨机×HAP fetch | 3/3：SV_FETCH_MS 1,744/1,784/1,688ms、28,897B、F0..F4 ok | 真机 | fe_hap_libp2p.md §10 |
| 11 | libp2p 安卓宿主 fetch+restore | 5/5（均值 1,198ms，修复前基线 1,208ms）；设备本机 restore 3/3（replayCidMatch=1） | 真机 | fg_android_verify.md |
| 12 | 跨机 serve 方向（鸿蒙→安卓） | 3/3：wall 1,874/1,789/1,739ms（泵门修复后历史首次） | 真机 | fe_hap_libp2p.md §18 |
| 13 | 鸿蒙自连（dual-role 同进程） | 3/3：fetchMs 1,807/1,809/1,805ms、首帧上屏 2,166/2,171/2,245ms、四守卫全零 | 真机 | fe_hap_libp2p.md §17.5 |
| 14 | 反向腿（鸿蒙 serve→安卓 fetch 落盘） | svblock 5 轮 + base.mp4 2 轮全 PASS，fetchMs 1,902–2,525ms，四重对拍全等 | 真机 | reverse_transfer.md |
| 15 | base.mp4 整文件 QUIC→AVPlayer | fetchMs 2,565/2,114ms、completed 22,898/22,832ms；复现轮 3,467/2,568ms、completed 22,831/22,828ms；三方 sha 全等 | 真机 | base_ssm1_transfer.md、base_ssm1_transfer_repro.md |
| 16 | svblock 跨机传输 | 2/2：fetchMs 1,815/1,664ms、85,960B 四路全等（含在机 sha256sum） | 真机 | svblock_transfer.md |
| 17 | SSM2 双载荷 serve 腿 | Mac fetch 2/2：chunk=582,340B sha256-match=1eb20a17… | 真机 | ssm2_hybrid_container.md |
| 18 | SSM2 三载荷 serve 腿 | Mac fetch 1/1：chunk=3,533,186B sha256-match=c074b1ed… | 真机 | ssm2_depth_payload.md |
| 19 | HAP SSM2 解封消费 | 5/5：fetchMs 2,263–2,713ms、unseal 5–7ms、EOF 25,068–25,656ms | 真机 | hap_ssm2_progressive.md |
| 20 | HAP 渐进起播 | 2/2：firstPlay 2,378/2,142ms ≪ 全量收完 12,618/11,913ms（提前 10,240/9,771ms）；重定向 PLAYDONE 35,456/49,159ms | 真机 | hap_ssm2_progressive.md |
| 21 | 渐进起播字节收益（Mac 侧） | 65,536/496,166=7.57×（线上 66,360/496,283=7.48×）；ready→首帧就绪 114ms；前缀可解 50 帧 | 仿真+真机通道 | chunked_progressive_ssm1.md |
| 22 | 端到端现场演示（QUIC/ssm1q） | 3/3：click→first-frame-on-screen 2,331/2,634/2,493ms（口径=fetch 数据面+首帧渲染） | 真机 | progress.md（9/18 演示节） |
| 23 | 深度流完整播放（1000050） | posMs 0→22,500 eof=true frames=45、PLAYDONE t=25,080ms | 真机 | fe_hap_libp2p.md §23 |
| 24 | CSG 世界真机播放（F-K） | 3/3：240 帧轨迹单调、CSGDONE wall≈25.6s、每轮 4 截图 4/4 互异 | 真机 | fe_hap_libp2p.md §24 |
| 25 | UI 重构回归（1000068） | RECEIVE 1,828ms PASS；SSM2 PLAYDONE 25,166ms；D3 PLAYDONE 33,451ms depthFrames=45 | 真机 | hap_ui_redesign.md |
| 26 | 像素门采样版（T-A） | 12/12 帧 PPM 字节逐字节一致（2,764,816B/帧）；渲染器自重渲染 2/2 | 像素级 | fe_hap_libp2p.md §20 |
| 27 | 像素门全帧版（T-G） | 7,803 对同 tick 帧 SHA 全等 mismatched=0；直通臂 4,981/5,001 distinct（强门）；spot check 3/3 byte_equal | 像素级 | pixel_gate_full.md |
| 28 | f 快照恢复对拍 | 三恢复点续跑 3,800/2,600/1,400 tick 逐 tick World3dCid 与直通全等 | 仿真 | f1_snapshot.md |
| 29 | 语义容器跨机字节确定 | 10,490 次字段对拍 0 差异；Mac/安卓双机同哈希 f240fe88… | 仿真+真机 | sv_semplane_container.md |
| 30 | 深度载荷冻结 | 45/45 chunk 头/crc32/尺寸校验；npy 源逐位 1,474,560/1,474,560 吻合 | 仿真 | ssm2_depth_payload.md |
| 31 | SSM2 负例拒收 | 双载荷 10/10、三载荷 2/2，错误码精确（ERR magic/payload_range/cidMatch=0 等） | 仿真 | ssm2_hybrid_container.md、ssm2_depth_payload.md |
| 32 | 双实现对拍（B1 互操作） | sv_ref_decoder 独立实现对 b1_sample.svblock（4,087B/facts=12）PASS | 仿真 | interop_ref.md |
| 33 | 夹具基线防线 | 负例双演练（缺键/伪造）均报「夹具基线过期」，无 cid_mismatch | 仿真 | f1_fixture_rerecord.md、semantic_hub_guard_wiring.md |
| 34 | exe 0xDD 定量指纹与三臂判决 | 毒字节数==rc 值 68/535/529 逐一相等零杂字节；判决夹具实跑臂2/3=72（修法实锤）、臂1=139（UAF 崩溃形） | 诊断 | exe_dd_poison_triage.md、exe_dd_verdict_run.md |

## 4. 能力矩阵

通道方向 × 载荷 × 形态 → 绿在哪轮哪个报告。svblock=语义平面容器（85,960B）；mp4=base.mp4（496,166B）；深度=huguangsheng.ssm1 深度流（2,955,365B）或 DPD1 载荷；闭包=libp2p sv 快照闭包（28,897B，5 文件）。

| 通道方向 | 载荷 | 形态 | 判定 | 绿在哪轮/报告 |
|---|---|---|---|---|
| Mac→安卓 | 闭包 | libp2p 一次请求（sv-closure） | 绿 3/3 + 修复后 5/5 | F-D G3（progress.md 9/17）；fg_android_verify.md §2 |
| 安卓→鸿蒙 | 闭包 | libp2p HAP L2P:FETCH | 绿 3/3 | fe_hap_libp2p.md §10.3 |
| Mac→安卓 | 深度 | QUIC ssm1q，fetch 取 manifest+首关键帧 chunk | 绿 10/10（L1/L2 门） | miaofa_dual_real.md §3 |
| 安卓→鸿蒙 | 深度 | 同上 | 绿 10/10 + 耐久 100/100 | miaofa_dual_real.md §4；td_durability.md |
| 鸿蒙→安卓 | 深度 | QUIC ssm1q | 绿 3/3（泵门修复+当代客户端） | fe_hap_libp2p.md §18.6 |
| 鸿蒙自连 | 深度 | QUIC ssm1q 同进程 dual-role | 绿 3/3 | fe_hap_libp2p.md §17.5 |
| Mac→鸿蒙 | 深度 | QUIC ssm1q | 绿冒烟 ×2（1,357/1,206ms） | fb_ohos_rebuild.md §5 |
| 安卓→鸿蒙 | mp4 | SSM1 单 kf 封套（载荷=mp4 全量）整文件→AVPlayer | 绿 2/2 + 复现 2/2 | base_ssm1_transfer.md；base_ssm1_transfer_repro.md |
| 安卓→鸿蒙 | svblock | SSM1 单 kf 封套整文件 | 绿 2/2 | svblock_transfer.md |
| 鸿蒙→安卓 | svblock + mp4 | 同封套，安卓落盘 | 绿 5+2 轮 | reverse_transfer.md §0 |
| 安卓→鸿蒙 | SSM2 双载荷（mp4+svblock，582,340B） | SSM1 封套承载→HAP 解封消费 | 绿 serve 2/2 + HAP 5/5 | ssm2_hybrid_container.md §4；hap_ssm2_progressive.md §4 |
| 安卓→鸿蒙 | SSM2 三载荷（+深度 DPD1，3,533,186B） | SSM1 封套承载→HAP 解封+深度解码 45/45 | 绿 serve 1/1 + HAP D3 点验 | ssm2_depth_payload.md §4；hap_ui_redesign.md §6 |
| 安卓→鸿蒙 | mp4 索引容器（8×64KiB，496,990B） | QUIC 渐进（chunk0 起播+后台回填+全量后重定向） | 绿 Mac 侧证据 + HAP 2/2 | chunked_progressive_ssm1.md；hap_ssm2_progressive.md §4 腿B |
| 鸿蒙→安卓 | 深度（旧客户端 q2_fetch） | QUIC ssm1q | 红（negotiate_ack_slot_4 旧客户端形）→ 经当代客户端+泵门修复转绿（上行第 5 行） | fe_hap_libp2p.md §10.4/§15.6/§16.5 → §18 |

## 5. 诚实边界全集

语义能力边界：
1. 识别模型未接线：记录块零 assertion、caps 仅 common_core；「纯语义」指不携带媒体字节，不指语义丰富度（b2_convert.md §6、compression_report.md §7）。
2. 实拍语义侧是 degraded 表示：L0 结构（轨级实体非画面对象）+L1 相对深度（MiDaS affine-invariant，非度量深度，不能标米）+L2 平面级（平面≠语义对象，无类别无实例分离）；L3 对象级 blocked（semantic_conversion_feasibility.md §2）。
3. 深度/平面级泛化仅胡广生一件素材实测，无跨素材证明；M16A 采集受限（设备共用致 inferMs 升高与 corr 负值，非管线缺陷）（semantic_conversion_feasibility.md、progress.md 9/19 并行收口节）。
4. 实拍可见画面走像素载荷（mp4），语义侧还原不出画面；born-digital 155.6:1 不适用实拍、两口径禁止混用（sv_semplane_container.md §4）。
5. 朴素启发式对象提取在本素材上两轮均不稳（提到脸非人物、暗帧失败），无 GT 不构成准确率，不再试第三轮（f5_extraction_probe.md）。
6. 纯 Cheng 拿不到像素字节：首帧桥只出句柄（CVPixelBuffer/Metal），无 CPU/GPU 字节出口、无多帧解码桥（f5_extraction_probe.md §步1b/§步3）。

压缩与表示口径边界：
7. 同能力纯回放下无压缩增益（playback_no_gain），千倍话术禁用（compression_report.md §6）；跨行（f 行 vs footage 行）不互除（compression_report_f_loop.md §4）。
8. 容器比源提取 JSON 大 21%——价值在合同/验证/跨机确定，不在字节极小化（sv_semplane_container.md §4）。
9. restore wall 波动 -13%~-20%，只可同窗口相对比较（compression_report_f_loop.md §6）。
10. 5bit 深度层为有损合成（MAD16=389），scratch 生命周期件不入容器；容器入的是 DPD1 无损定点层（ssm2_depth_payload.md §6、progress.md 9/19 F-L 节）。
11. 渐进容器 chunk startMs 为名义均分，仅供解析器单调性校验；真实时间线在 moov，seek 不按 startMs（chunked_progressive_ssm1.md §2）。

正确性与防线边界：
12. x-physicsBaseline 指纹仅覆盖 tick8 前显形的物理默认行为变更；tick8 后显形的变更穿透防线落裸 cid_mismatch，防线按构造尽力非全知（f1_fixture_rerecord.md §6、semantic_hub_guard_wiring.md §4）。
13. chain 级「缺键」负例不可构造（chain 双族前置先以 sv_res_type_mismatch 拒纯快照旧块）；chain 快照臂防线由失配路+同函数体传导证明（semantic_hub_guard_wiring.md §4）。
14. exe 形 0xDD 毒值：三臂判决夹具已用 08-31 冻结 stage3 实跑——CloneStrRange 一行修运行时实锤（臂2/3=72 'H' 完好）、悬挂视图 UAF 崩溃形实锤（臂1=139 SIGSEGV）；「221 静默毒签名」形态当前无驱动可复现（毒制度晚于冻结件、当代 knife 被 typed-expr 红挡），待 kernel lane 修红后当代驱动重跑；CloneStrRange 两处落地未动手（exe_dd_poison_triage.md §5/§6、exe_dd_verdict_run.md）。
15. 编译门红归 kernel lane：kd_orcd10 knife 对 hub 闭包预存崩溃（registry_miss/0xDD 签名，HEAD 无接线源同崩）；repo 根 ./cheng 已死（金丝雀 rc=139）；typed-expr/parser 活红挡「std str 局部进表达式」当代驱动编译（冻结 stage3 接受同形状，exe_dd_verdict_run.md §3 为旁证）（semantic_hub_guard_wiring.md、exe_dd_poison_triage.md §7）。
16. 像素门/世界恢复仅覆盖 ballbalance 仿真世界（born-digital）；实拍的混合表示（世界态+实拍纹理/几何流）另论（fe_hap_libp2p.md §24.4）。
17. 缺省自碰撞关时该场景为静止不动点（弱门陷阱），已开启 SelfCollision(1) 强门并冻结 distinct<2 判据（fe_hap_libp2p.md §20.3、pixel_gate_full.md）。
18. MoQ publisher 编译断裂（media_asset_manifest 闭包），MoQ-over-QUIC 秒发秒开指标未采集；归编译器 lane（progress.md 9/19 两节）。
19. F5 探测不构成提取能力验收、误差门未冻结、不进主线（f5_extraction_probe.md 声明）。

协议与传输边界：
20. q3_serve 载包合同排他 SSM1 魔数；fetch 取回模型只有「manifest+首关键帧 chunk」语义、无整文件取回；SSM2 原生 serving 未做（经 SSM1 封套承载）（fe_hap_libp2p.md §21/§22、ssm2_hybrid_container.md §6）。
21. 端到端演示 3/3 的口径=fetch 数据面+首帧渲染，不含持续可见播放；可见播放由后续 1000050/重定向线另行收口（progress.md 9/19 更正节、fe_hap_libp2p.md §23）。
22. AVPlayer 对零占位增长文件终态 = error 5400103 而非 completed（4 轮实证位置不可预期），属平台播放器行为；EOF 判据经「全量后重定向」收口（hap_ssm2_progressive.md §5.1）。

平台行为边界（详见 §6 归属表）：
23. hilog APP 通道被设备整体静默（stderr 桥绕行）、鸿蒙深睡/灭屏 ICMP 断与 PIN 墙、安卓 doze 节流 UDP、EMUI 查杀 shell 宿主 ART 后台进程、鸿蒙 standalone exe 执行被平台策略封死、裸 futex 被华为真机策略封死（fe_hap_libp2p.md §9.1/§11.3/§12/§13.2/§25.3、miaofa_dual_real.md §5、fb_ohos_rebuild.md §1.3、hap_ssm2_progressive.md §5.3）。
24. q3_serve 进程内 TLS 态可被畸形握手打病（cert_verify 持续失败，重启即愈）；安卓 4443 现场（pid 7287）病损需用户重启恢复（reverse_transfer.md §6、hap_ssm2_progressive.md §5.3）。

## 6. 遗留与归属

| 事项 | 归属 | 出处 |
|---|---|---|
| SSM2 原生 serving（serve 端协议扩展、整文件取回语义）待立项 | 本战役 | ssm2_hybrid_container.md §6、reverse_transfer.md §7 |
| exe 0xDD：CloneStrRange 两处落地 + 221 形当代驱动复跑（判决夹具已实跑，臂2/3=72 修法实锤、臂1=139 崩溃形实锤） | 本战役（221 形复跑随 kernel lane typed-expr 红解锁） | exe_dd_poison_triage.md §5–§7、exe_dd_verdict_run.md |
| 安卓 4443 现场（pid 7287）TLS 病损需重启恢复 | 本战役所致，需用户操作 | reverse_transfer.md §6 |
| M16A 安卓相机第三轮真机回归（APK 就绪，约 0.5 人日+设备协调） | 本战役 | c1_camera_blockers.md §2 |
| L3 对象级语义（分割模型集成+像素字节出口+真值标注） | 本战役（新立项） | semantic_conversion_feasibility.md §3、f5_extraction_probe.md |
| 纯 Cheng 解码像素字节出口+多帧解码桥 | 本战役（新立项） | f5_extraction_probe.md §步3 |
| 5bit 有损深度层冻结后入容器 | 本战役（待冻结） | ssm2_depth_payload.md §6 |
| 渐进「边下边播」原生 EOF（现靠全量后重定向） | 本战役/平台厂商 | hap_ssm2_progressive.md §5.1 |
| 多闭包 obj 链接类型符号命名空间冲突（1,486 符号/链接面 objcopy 绕行） | kernel lane（编译器战役） | fe_hap_libp2p.md §10.1、§13.1 |
| wrapper-main exe 形 ownership 门应对「@borrow_result 视图逃逸」报错（现静默毒） | kernel lane | exe_dd_poison_triage.md §5/§7 |
| stage3 冷路径路径敏感 segfault（嵌套 .scratch 触发）；对当前 psb 源 segfault×5+静默 no-op | kernel lane | fe_hap_libp2p.md §18.2、§24.2 |
| kd_orcd10 knife 对 hub 闭包预存崩溃；repo 根 ./cheng 死亡；typed-expr/parser 活红 | kernel lane | semantic_hub_guard_wiring.md、exe_dd_poison_triage.md §6–§7 |
| MoQ publisher 编译断裂（media_asset_manifest 闭包） | kernel lane | progress.md 9/19 两节 |
| 裸 `return` 续行 `+` 静默截断（语言级根治） | kernel lane（编译器战役） | hub_cli_baseline_wiring.md §3 |
| 复用进程二次 PUBLISH 的 orc 族 | kernel lane | fe_hap_libp2p.md §16.4 轮2、§17.7 |
| 鸿蒙 M16B 相机帧源三路全断（HAL 视频流 0 帧/ImageReceiver YUV 白名单/AVImageGenerator 5400106） | 平台厂商 | c1_camera_blockers.md §1/§3 |
| 华为真机策略封死裸 futex（SIGSYS 31）；standalone exe 执行封死 | 平台厂商 | fe_hap_libp2p.md §13.2；fb_ohos_rebuild.md §1.3 |
| hilog APP 通道被设备整体静默 | 平台厂商 | fe_hap_libp2p.md §9.1、§24.3 |
| AVPlayer 零占位增长文件 error 5400103；EMUI 查杀 ART app_process；安卓 doze 节流 UDP；深睡/PIN 墙/ICMP 过滤 | 平台厂商 | hap_ssm2_progressive.md §5.1/§5.3；fe_hap_libp2p.md §25.3；miaofa_dual_real.md §5 |
| git 未提交（semantic_video 系工具/夹具/SSM2 产物等多笔按纪律挂起） | 本战役（待用户处置） | sv_semplane_container.md §8、ssm2_hybrid_container.md §6、ssm2_depth_payload.md §5、reverse_transfer.md §7 |

## 7. 交接索引

- 全程记录：`progress.md`（9/16–9/20 逐节）。
- 冻结门与验收定义：results/miaofa_gate_v0.md（先冻结后测量的样板）。
- 设计文档：`docs/csg-semantic-video-core-design.md`（顶部实现状态节指向本文）。
- 规范：`docs/specs/csg-semantic-video-v0.1.md`（§2 x- 扩展键、§9 平面记录增补）。
- 夹具：`fixtures/`（b1_sample/b2_sample/b2_hgs 现行有效；f1_ball.svblock 为 9/20 重录版 d31b44c6…，旧 0175b22c 版已失效）。
