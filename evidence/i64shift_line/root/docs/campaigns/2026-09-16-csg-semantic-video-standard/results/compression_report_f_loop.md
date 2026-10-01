# f 闭环 S3：「f 已接通 vs f 未接通」公平压缩基准对照报告（纯计量）

日期：2026-09-17。实现：`src/tools/semantic_f_loop_report.cheng`（新建，编译产物
`.scratch/f2/report`）。纯 Cheng 工具，无新语言栈；ffprobe 仅外部对照不入生产。
全部数字来自真实文件读取与真实 restore 运行，无手填。

## 1. 结论先行

1. **f 已接通行（ballbalance，born-digital）**：同一世界的像素导出
   `ball_balance.mp4` 实测 4,496,279 B（480 帧@24fps，20.0 s，1798 kbps）；
   状态+检查点表示实测冷恢复依赖 28,897 B（世界定义 530 + 3×检查点 payload
   25,332 + 块 3,035）。**同内容同能力比值 = 4496279/28897 ≈ 155.6**
   （`f_loop_ratio_num=4496279 den=28897`），含义是「同一 born-digital 内容：
   像素导出 vs 状态+检查点」，仅对可仿真内容成立，实拍不适用。代价是恢复
   计算：三次真实 restore 全 rc=0、replayCidMatch=1，entry 检查点 ck-1200
   窗口 2800 tick 实测 wall 8175.124 ms（进程内 monotimes，含全链）。
2. **f 未接通行（胡广生 = hgs_faststart.mp4，存量实拍）**：只能回放像素，
   独立计量——源 5,887,367 B / 2093 kbps / 22.5 s，语义块 2,186 B，热增量
   2,186 B，seek 10 s 容器级重读下界 454,624 B（61 样本，从 kf_pts=8000000
   起，与 B3 实测逐一相等）。该行**不与 f 行互除**：两行能力不同（f 行恢复
   世界状态、可重演像素；footage 行只能回放像素）。
3. **固定结论**：`f_on_replaces_pixels_for_simulable_content` /
   `footage_keeps_hybrid_representation` /
   `recovery_compute_traded_for_bytes`（restore_ticks=2800，
   restore_wall_ms=8175.124）。f 接通不改变实拍的混合表示；对可仿真内容，
   f 把「传输像素字节」换成「传输状态字节 + 现场重算」。

## 2. 方法

### 2.1 工具与编译

`semantic_f_loop_report` 三模式，stdout 逐行 k=v，rc=0/1：

```
artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang --in:/Users/lbcheng/cheng-lang/src/tools/semantic_f_loop_report.cheng --emit:exe --target:arm64-apple-darwin --out:.scratch/f2/report
```

一次编译通过（cold_compile_elapsed_ms=8834.282）。f 行的 restore 与
`src/apps/semantic_snapshot` 的 restore 是同一代码路径（同一批模块函数：
validate→decode→payload CID 绑定→世界加载→确定性重放→replayCid 对照→续跑
窗口），wall 时间用 std/monotimes 进程内实测，覆盖 restore 全链（含每 tick
World3dCid 计算，与 CLI 逐 tick echo 同量计算，仅省打印）。footage 行的
seek 与 `src/apps/semantic_player` seek 同一算法（关键帧 GOP 起点到目标
样本的容器级字节下界，无像素解码）。

### 2.2 输入（实测 SHA-256 绑定）

| 输入 | SHA-256（前 8） | 字节 |
|---|---|---|
| fixtures/f1_ball.svblock | 0175b22c | 3035 |
| .scratch/f1/f1_res/ck-1200.payload | fed24d6f | 8444 |
| .scratch/f1/f1_res/ck-2400.payload | 16c89b37 | 8444 |
| .scratch/f1/f1_res/ck-3600.payload | 64721332 | 8444 |
| artifacts/csg_world_video/csgworld/ballbalance.csgworld | b444f023 | 530 |
| artifacts/csg_world_video/ball_film/ball_balance.mp4 | 6640185f | 4496279 |
| artifacts/csg_world_video/ball_film/manifest.txt | 72cf48e5 | 550 |
| fixtures/b2_hgs.svblock | 18dd7e58 | 2186 |
| src/tests/real_media_assets/hgs_faststart.mp4 | da1d2d7b | 5887367 |

工具源 `src/tools/semantic_f_loop_report.cheng` SHA-256
`1cce6eb594dda6de…`，产物 `.scratch/f2/report` SHA-256
`35bbbf0696ff87ab…`。注：源文件裸 SHA 与语义 CID（`sha256:b6bbf351…` 等）
不同是口径而非矛盾——`SvResourceCid` 是域分隔前像哈希
（SvResourceCidDomain + bytes），工具已实测 `source_cid_match=ok` 绑定冻结
manifest。

### 2.3 计量口径（全实测，整数运算，禁浮点）

| 项 | 口径 |
|---|---|
| mp4_bytes / source_bytes | 文件实测字节数 |
| mp4_duration_s | frames/fps（影片 manifest 真实文件），整数拼小数（480/24→"20.0"） |
| mp4_bitrate_kbps | floor(mp4_bytes×8×fps/(frames×1000)) |
| f_loop_cold_bytes | world_def + 3×payload + block（恢复所需全部依赖） |
| f_loop_hot_bytes | block + entry 检查点 payload（已缓存世界定义与其余检查点） |
| restore_ticks / restore_wall_ms | 窗口 tick（=baseline 4000 − 检查点 tick）；monotimes 差，3 位小数毫秒 |
| bitrate_kbps（footage） | floor(source_bytes×8×timescale/(totalTicks×1000)) |
| seek_readahead_bytes | kf 样本到目标样本 size 累加（容器级下界，无像素解码） |

## 3. 原始输出（stdout 原文）

### 3.1 f 已接通行（f-loop 模式，rc=0）

```
$ .scratch/f2/report f-loop --block docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/f1_ball.svblock --world artifacts/csg_world_video/csgworld/ballbalance.csgworld --res-dir .scratch/f1/f1_res --film artifacts/csg_world_video/ball_film/ball_balance.mp4 --film-manifest artifacts/csg_world_video/ball_film/manifest.txt
section=f_snapshot
validator=ok
factsCid=538f3f61b26ecfe59dba02ebe5df68fa6356e590c94e2836e90de72e99e602b7
snapshot_branch=main
payload ck=ck-2400 tick=2400 bytes=8444 cid_match=ok
payload ck=ck-3600 tick=3600 bytes=8444 cid_match=ok
payload ck=ck-1200 tick=1200 bytes=8444 cid_match=ok
film_facts_cid_match=ok
snapshot_block_bytes=3035
snapshot_payload_bytes=25332
world_def_bytes=530
f_loop_cold_bytes=28897
f_loop_cold_scope=world_def_plus_all_checkpoint_payloads_plus_block
f_loop_hot_bytes=11479
f_loop_hot_ck=ck-1200
f_loop_hot_scope=block_plus_entry_checkpoint_world_and_other_checkpoints_cached
section=f_film
mp4_bytes=4496279
source_film_frame_count=480
film_fps=24
mp4_duration_s=20.0
mp4_bitrate_kbps=1798
section=restore
restore ck=ck-1200 ckpt_tick=1200 replay_ticks=1200 restore_ticks=2800 final_tick=4000 replayCidMatch=1 wall_ms=8175.124 servo_ball_slot=0
restore ck=ck-2400 ckpt_tick=2400 replay_ticks=2400 restore_ticks=1600 final_tick=4000 replayCidMatch=1 wall_ms=8402.289 servo_ball_slot=0
restore ck=ck-3600 ckpt_tick=3600 replay_ticks=3600 restore_ticks=400 final_tick=4000 replayCidMatch=1 wall_ms=6348.132 servo_ball_slot=0
section=conclusion
conclusion=f_on_replaces_pixels_for_simulable_content
conclusion=footage_keeps_hybrid_representation
conclusion=recovery_compute_traded_for_bytes restore_ticks=2800 restore_wall_ms=8175.124
rc=0
```

restore 时长第二轮复测（同命令）：7052.502 / 6977.534 / 5066.017 ms，波动
约 −13%/−17%/−20%（同窗口相对比较，绝对值随机器负载漂移）。外部
`/usr/bin/time -p` 交叉：整命令 real 19.25 s vs 三段 monotimes 之和
≈19.1 s + 进程启动，口径吻合。

### 3.2 f 未接通行（footage 模式，rc=0）

```
$ .scratch/f2/report footage --block docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/b2_hgs.svblock --source src/tests/real_media_assets/hgs_faststart.mp4
section=verification
validator=ok
source_cid_match=ok
index_cid_match=ok
reslength_match=ok
section=footage
source_bytes=5887367
duration_sec=22.5
bitrate_kbps=2093
svblock_bytes=2186
hot_transfer_bytes=2186
hot_transfer_scope=svblock_only_source_already_cached
sample_count=675
keyframe_count=6
seek_tick=10000000
seek_kf_pts=8000000
seek_readahead_samples=61
seek_readahead_bytes=454624
seek_readahead_scope=container_level_gop_read_lower_bound_no_pixel_decode
rc=0
```

### 3.3 comparison 模式（公平口径声明原文，rc=0）

```
$ .scratch/f2/report comparison --f-block …/f1_ball.svblock --f-world …/ballbalance.csgworld --f-res-dir .scratch/f1/f1_res --film …/ball_balance.mp4 --film-manifest …/manifest.txt --footage-block …/b2_hgs.svblock --footage-source …/hgs_faststart.mp4
（§3.1 f_snapshot/f_film/restore 段同上，restore 为 entry 一段：wall_ms=8158.369）
（§3.2 verification/footage 段同上）
section=comparison
comparison=fair_scope
f_row_capability=world_state_restore_replayable_pixels
footage_row_capability=pixels_playback_only
cross_row_ratio=not_computed
ratio_scope=f_row_internal_same_born_digital_content_only
f_loop_ratio_num=4496279 den=28897
ratio_meaning=pixel_export_vs_state_plus_checkpoints_simulable_content_only_not_applicable_to_footage
f_loop_cold_scope=world_def_plus_all_checkpoint_payloads_plus_block
f_loop_hot_scope=block_plus_entry_checkpoint_world_and_other_checkpoints_cached
section=conclusion
conclusion=f_on_replaces_pixels_for_simulable_content
conclusion=footage_keeps_hybrid_representation
conclusion=recovery_compute_traded_for_bytes restore_ticks=2800 restore_wall_ms=8158.369
rc=0
```

## 4. 对照表（两行不互除）

### 4.1 f 已接通行内部公平比值（同一 born-digital 世界，同画质同能力）

| 项 | 像素导出 | 状态+检查点 | 比值 |
|---|---|---|---|
| 冷恢复全部依赖 | mp4_bytes=4496279（20.0 s 影片） | f_loop_cold_bytes=28897（530+25332+3035） | **4496279/28897 ≈ 155.6** |
| 热恢复增量 | —（mp4 需整文件或按 GOP 重读） | f_loop_hot_bytes=11479（块 3035 + ck-1200 payload 8444；世界定义与其余检查点已缓存） | 单列，不比 |
| 恢复计算 | 解码像素（本仓无解码桥，未测） | restore 1200 重放 + 2800 续算 tick = 8175.124 ms（含逐 tick World3dCid） | 恢复计算量与传输字节同列，不同质不相比 |

比值含义：同一 born-digital 内容的「像素导出 vs 状态+检查点」两种表示的
字节比。**仅对可仿真内容成立，实拍不适用**；155.6 远低于千倍，SV-08
「千倍压缩不得由局部数据外推」合规。

### 4.2 f 未接通行独立计量（footage，实拍，仅回放能力）

| 项 | 实测 |
|---|---|
| source_bytes | 5887367 |
| duration_sec | 22.5 |
| bitrate_kbps | 2093 |
| svblock_bytes | 2186 |
| hot_transfer_bytes | 2186（源已缓存场景的纯语义增量） |
| seek@10s 重读下界 | 454624（61 样本，kf_pts=8000000） |

f 行与 footage 行**无跨行比值**（`cross_row_ratio=not_computed`）：f 行
28897 B 换来的是世界状态恢复（可重演任意 tick 像素），footage 行 2186 B
增量只带来可查询记录 + 容器级 seek 锚；能力不同，字节不可比。

## 5. 与既有报告数字一致性核对

| 项 | 既有报告 | 本轮实测 | 判定 |
|---|---|---|---|
| b2_hgs.svblock SHA-256 | 18dd7e58…（compression_report §5） | 18dd7e58… | 一致 |
| hgs source_bytes | 5887367（b2_convert/compression_report） | 5887367 | 一致 |
| hgs bitrate_kbps | 2093（compression_report） | 2093 | 一致 |
| hgs duration | 22.5（compression_report） | 22.5 | 一致 |
| seek 10000000 | kf_pts=8000000、61 样本、454624 B（b3_player §5） | 逐一相等 | 一致 |
| f1 块字节 | 3035（f1_snapshot §5） | 3035 | 一致 |
| payload 字节 | 8444×3（f1_snapshot §5） | 8444/8444/8444 | 一致 |
| factsCid | 538f3f61…（f1_snapshot §5，与合同 ballbalance 一致） | 538f3f61…，且影片 manifest factsCid 逐字节匹配（film_facts_cid_match=ok） | 一致 |
| replayCidMatch | 1（f1_snapshot §5） | 3 次 restore 全 1；semantic_snapshot CLI 独立复跑 ck-1200+2800 rc=0、finalTick=4000 | 一致 |
| 块内 snapshot 行序 | CSGC 重排、按 ckpt id 定位（f1_snapshot §7） | 本轮记录序 ck-2400/ck-3600/ck-1200，工具按 tick 升序执行 restore | 一致（重排事实，非固定序） |

外部对照（ffprobe 仅对照、不入生产）：ball_balance.mp4
size=4496279（=mp4_bytes）、nb_frames=480（=source_film_frame_count）、
avg_frame_rate=24/1、流 duration=20.000000（容器 20.010667，本报告按
frames/fps=20.0 帧口径，如实并列）；format bit_rate=1797552 ≈ 1798 kbps
（流口径仅视频轨 1731848，本报告口径为整文件平均）。hgs format
bit_rate=2093286 → floor 2093 与本报告逐一相等。

## 6. §七口径声明

1. **恢复计算量与传输字节同列**：对照表中 f 行的「28897 B 冷依赖 +
   8175.124 ms restore（1200 重放 + 2800 续算 tick）」与 footage 行的
   「454624 B seek 重读」并列展示，分别属于计算轴与传输轴，不同质，
   不构造换算、不互除。
2. **千倍禁用**：本报告唯一的比值是 f 行内部同内容 155.6 倍，远低于
   千倍；语义层新增的可查询/可恢复能力不在字节对比的公平范围内
   （沿 compression_report §6 / SV-08）。f 行热口径 11479 B 是
   「已缓存世界定义与其余检查点」场景的单列数字，未与任何像素量相除。
3. restore wall_ms 含每 tick World3dCid 计算（与 CLI 逐 tick 回显路径同量
   计算，仅省打印），非纯物理推进成本；只可同窗口相对比较，不跨机器外推。

## 7. 诚实边界

- **f 行像素未逐帧 PSNR 对拍**：本轮恢复对拍在状态层（逐 tick
  World3dCid、replayCidMatch=1，沿 F1 S2）；像素层对拍需要 H.264 解码桥，
  属完整 E1 工作，未做不宣称。「恢复可重演像素」由状态层等价 + 同一影片
  导出管线（factsCid 绑定，film_facts_cid_match=ok）支撑到状态边界为止。
- **restore wall 波动**：两轮 −13%~−20%（8175→7052 等），如实并列两轮，
  不取单点当真值。
- **footage 行沿 B2/B3 边界**：无语义提取（caps=common_core），无像素解码；
  seek_readahead_bytes 是容器级需重读字节下界，不等于画质恢复证明。
- **mp4_bitrate_kbps 口径**：整文件平均（含音频轨）；ffprobe 视频流口径
  1731848 单列于 §5，未混用。
- **逐相内存影响**（硬约束卡口径）：新模块仅被本工具 import，无生产运行
  时增量；进程峰值额外持有 = 块 3035 B + payload 8444 B + 影片字节
  （f 模式 4.3 MB / footage 模式 5.6 MB）+ manifest <1 KB + 恢复态结构
  （与既有 semantic_snapshot restore 相同，F1 已计入），KB–MB 量级，
  不触逐相预算门。
