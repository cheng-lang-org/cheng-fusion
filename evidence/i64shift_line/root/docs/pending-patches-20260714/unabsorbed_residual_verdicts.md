# UNABSORBED 57 拆分判决（MEDIA_DECODE 11 + 残余 16）

> **争议 D 已定谳 (2026-07-14 09:43 主会话)**: `cheng_resolve_exports` 在 `slice8_genc_handoff/gen_c_keep_134_names.txt:130` = KEEP 域（归 H3 resolve_exports 锁定簇正在攻），非 `[吸收]` 候选桶；`cheng_gui_apply_payloads` 不在 keep/discard 任一名单 = 维持本表 `[吸收候选]` 判定。A/B/C 三条仍待用户拍板。

状态：docs-only 判决表，零源码/工具改动。
口径：`tools/harmony_host_gen_gap_census.sh` 2026-07-14 复跑基线 **113/21/77/57=268**（GEN-EQUAL/GEN-DIFF/ADAPTER-ONLY/UNABSORBED）。UNABSORBED 57 全名单来自 `/tmp/harmony_host_gen_gap_census_report/functions.tsv`。
拆分：**RUNTIME 30 + MEDIA_DECODE 11 + 残余 16 = 57**。RUNTIME 30 的移交包见 `runtime30_provider_harmony_handoff.md`。本文件给 MEDIA_DECODE 11 不生成理由锚表 + 残余 16 逐函数判决表 + 交叉校验 + 预测口径表 + 分类争议。

---

## 1. MEDIA_DECODE 11 — 设计上不生成（逐个理由锚）

判据：OHOS 硬件视频解码三级缓冲管线（OH_AVCodec/OH_AVDemuxer/OH_AVSource/OH_VideoDecoder + NV12→RGBA），生成器 **epilogue 只声明契约钩子签名、不生成函数体**。

| # | 函数（gen.c 行段） | OHOS API 依赖 | 不生成理由锚 |
|---|---|---|---|
| 1 | `cheng_nv12_band` (3233-3292) | NEON intrinsics (`vld1q_u8`/`vqmovun_s16` 等) + 纯算术 | 蓝图 §1 目标架构图：epilogue "媒体/MoQ/命令桥 —— 只声明契约签名，函数体留空/留 weak stub，由适配层实现"；§2.2 MEDIA "39/1897 ... 生成器 epilogue 已声明的钩子名（:24739-24744 现状为空实现占位）" |
| 2 | `cheng_nv12_band_thread` (3293) | `pthread_create` wrapper | 同上（三级缓冲的 worker 线程面） |
| 3 | `cheng_nv12_to_rgba_into` (3296-3324) | `sysconf(_SC_NPROCESSORS_ONLN)`/`pthread_create`/`pthread_join` | 同上 |
| 4 | `cheng_nv12_to_rgba` (3325-3358) | `malloc`/`pthread_create`/`pthread_join` | 同上 |
| 5 | `cheng_dec_on_error` (3360-3363) | `OH_AVCodec*`/`cheng_media_diag` | §2.2 MEDIA "解码线程独立 pthread，FIFO/ring/纹理池三级缓冲跨线程传递"；wave2 定谳 "MEDIA 13 按纪律不生成"（`docs/harmony-host-codegen-migration-plan.md` slice-4 段尾） |
| 6 | `cheng_dec_on_stream_changed` (3364-3366) | `OH_AVCodec*`/`OH_AVFormat*` | 同上 |
| 7 | `cheng_dec_on_need_input` (3367-3385) | `OH_AVDemuxer_ReadSampleBuffer`/`OH_AVBuffer_GetBufferAttr`/`OH_AVBuffer_SetBufferAttr`/`OH_VideoDecoder_PushInputBuffer`/`AVCODEC_BUFFER_FLAGS_EOS` | 同上（ES 入口 push） |
| 8 | `cheng_dec_on_new_output` (3386-3435) | `OH_AVBuffer_GetBufferAttr`/`OH_VideoDecoder_GetOutputDescription`/`OH_AVFormat_GetIntValue`/`OH_MD_KEY_VIDEO_STRIDE`/`OH_MD_KEY_VIDEO_SLICE_HEIGHT`/`OH_AVFormat_Destroy`/`OH_AVBuffer_GetAddr`/`OH_VideoDecoder_FreeOutputBuffer`/`AVCODEC_BUFFER_FLAGS_EOS` | 同上（NV12 抓帧 + EOS 锁存） |
| 9 | `cheng_ohos_decode_first_frame` (3441-3566) | `OH_AVSource_CreateWithFD`/`OH_AVDemuxer_CreateWithSource`/`OH_AVSource_GetSourceFormat`/`OH_AVSource_GetTrackFormat`/`OH_MD_KEY_TRACK_COUNT`/`OH_MD_KEY_TRACK_TYPE`/`MEDIA_TYPE_VID`/`OH_MD_KEY_WIDTH`/`OH_MD_KEY_HEIGHT`/`OH_AVDemuxer_SelectTrackByID`/`OH_VideoDecoder_CreateByMime`/`OH_AVCODEC_MIMETYPE_VIDEO_AVC`/`OH_AVFormat_Create`/`OH_AVFormat_SetIntValue`/`OH_MD_KEY_PIXEL_FORMAT`/`AV_PIXEL_FORMAT_NV12`/`OH_VideoDecoder_Configure` | §1 epilogue "媒体...只声明契约签名，函数体留空/留 weak stub，由适配层实现"；slice-8 路线B 拆分把媒体解码留 adapter.c 域（`cheng_gui_host_adapter.c` MEDIA_DECODE_PIPELINE svars 7 条） |
| 10 | `cheng_ohos_decode_all_frames` (3572-3654) | 同 #9 全套 + 全帧收集/EOS | 同上 |
| 11 | `cheng_stream_on_need_input` (3661-3696) | `OH_AVBuffer_GetAddr`/`OH_AVBuffer_GetCapacity`/`OH_AVBuffer_SetBufferAttr`/`OH_VideoDecoder_PushInputBuffer`/`AVCODEC_BUFFER_FLAGS_SYNC_FRAME`/`pthread_cond_wait`/`pthread_cond_signal`（FIFO 三级缓冲） | §2.2 MEDIA "三级缓冲跨线程传递，主线程只读 `s_stream_tex` 等状态标志（volatile 语义）...解码 worker 线程 → GL 上传必须切回渲染线程（`s_stream_ready` 标志 + tick 内轮询消费，非跨线程直接 GL 调用）" |

**计数 11 ✓**。另 2 个媒体相关函数（`cheng_audio_on_info`/`cheng_stream_fetch_worker`）不归本桶，归残余（见 §2 #9/#10）：前者是 `OH_AVPlayer` 音频管线（独立于视频解码三级缓冲），后者是 MoQ/QUIC 网络拨号 + 解码编排（sourcePeer 域）。

---

## 2. 残余 16 — 逐函数判决表

判决三型：**[吸收]** 可机械吸收进生成器（prologue/驱动骨架，slice-8 终局 gen.c 发射后转 GEN-EQUAL）｜**[H2/H3]** 交错簇归属 H2/H3 域（leak-audit/iometer/VPN/audio/MoQ/publish/resolve_exports 等非 host-codegen 域）｜**[改判]** 真 ADAPTER 应改判（census 误归 UNABSORBED，实为 ADAPTER-ONLY）。

| # | 函数（gen.c 行段） | 现状 svars/gen 信号 | 判决 | 归属域 / 处置 |
|---|---|---|---|---|
| 1 | `__wrap_cheng_malloc` (920-924) | 无 svars/gen/contract；`--wrap` 链接器符号，仅 `CHENG_LEAK_AUDIT` 下编译 | **[H2/H3]** | leak-audit 域（插桩，非 provider 非生成器）；保留手写 gen.c 或随 `CHENG_LEAK_AUDIT` 编译开关独立处置 |
| 2 | `__wrap_cheng_free` (925-930) | 同上 | **[H2/H3]** | 同上 |
| 3 | `c_iometer_call` (1067-1071) | 无 svars/gen/contract；空实现仪表钩子 | **[H2/H3]** | iometer/仪表域（`ENDURANCE_DIAG`）；空 hook，保留手写或随仪表域处置 |
| 4 | `cheng_mobile_protect_callback_ready` (1244-1246) | 无 svars/gen/contract；非 weak（强定义） | **[H2/H3]** | HY2TUN/VPN 域；★争议：linux/darwin provider 有 `@exportc` 同名骨架，严格对照应并 core_runtime_provider_harmony（见 §4 争议 A） |
| 5 | `cheng_mobile_protect_fd` (1248-1250) | 无 svars/gen/contract；weak | **[H2/H3]** | 同上 |
| 6 | `cheng_mobile_udp_debug_event` (1252-1258) | 无 svars/gen/contract；weak；用 `__android_log_print` | **[H2/H3]** | 同上 |
| 7 | `cheng_mobile_udp_fd_wait_readable` (1260-1262) | 无 svars/gen/contract；weak；调 `cheng_fd_wait_readable_bridge` | **[H2/H3]** | 同上 |
| 8 | `cheng_mobile_udp_recvfrom_addr_ptr_bridge` (1264-1273) | 无 svars/gen/contract；weak；调 `cheng_udp_recvfrom_addr_ptr_bridge` | **[H2/H3]** | 同上 |
| 9 | `cheng_audio_on_info` (3700-3710) | 无 svars/gen/contract；`OH_AVPlayer` 回调 | **[H2/H3]** | audio 域（`OH_AVPlayer` 状态回调，独立于视频解码三级缓冲）；★争议：可并 MEDIA_DECODE（见 §4 争议 B） |
| 10 | `cheng_stream_fetch_worker` (3717-3924) | svars refs=`s_app_handle,s_fetch_peer_host,s_fetch_peer_port,s_ff_dial_done/start/index_ns` cats=['ADAPTER','GEN']；dlsym `cheng_scene_media_es_*` | **[H2/H3]** | MoQ/sourcePeer 域（QUIC 拨号 + decoder 编排）；★争议：§2.2 MEDIA 把它列为解码线程（见 §4 争议 C） |
| 11 | `cheng_gui_apply_payloads` (6377-6401) | svars refs=`s_app_handle,s_gui_launch_args_applied,s_gui_resource_manager,s_gui_runtime_payloads_applied` cats=['ADAPTER','GEN']；dlsym + rawfile | **[吸收]** 候选 / **[H2/H3]** | resolve_exports/prologue 域；生成器 prologue 34 KEEP 候选 → slice-8 终局 gen.c 发射可转 GEN-EQUAL；若不吸收则归 H2/H3 resolve_exports 域 |
| 12 | `cheng_gui_resolve_exports` (6403-6426) | svars refs=`s_app_handle,s_gui_app_init,set_window,tick,needs_frame,on_touch,pause,resume` cats=['ADAPTER','GEN']；调 `cheng_resolve_exports`(GEN-EQUAL) | **[吸收]** 候选 / **[H2/H3]** | resolve_exports 域；同上，prologue 34 KEEP 候选 |
| 13 | `cheng_gui_host_begin` (6430-6494) | svars refs=`s_active_density/height/width/window,s_gui_app_id,app_init` cats=['ADAPTER','GEN'] | **[吸收]** | GLUE-DIM 驱动骨架；§2.2 GLUE-DIM "cheng_gui_host_begin/tick/pause/on_back/touch/set_resource_manager 6 个必须保留在生成文件里（驱动骨架，非适配层）" → slice-8 终局 gen.c 发射转 GEN-EQUAL |
| 14 | `cheng_gui_host_tick` (6496-6637) | svars refs=`s_active_height/width/window,s_app_debug_glyph_atlas_fail_*,s_gui_app_*` cats=['ADAPTER','GEN'] | **[吸收]** | 同上（GLUE-DIM 驱动骨架） |
| 15 | `cheng_publish_port_reporter` (6914-6997) | svars refs=`s_own_ip_count,s_own_ip_text,s_runtime_set_state` cats=['GEN']（纯 GEN 但无 gen/contract 匹配 → UNABSORBED） | **[H2/H3]** | publish/MoQ 域（读 `moq_ready.port`/`moq_ready.cid` 文件上报）；非生成器域 |
| 16 | `cheng_gui_host_touch` (7022-7045) | svars refs=`s_app_debug_route_index,s_gui_app_id,on_touch,s_gui_density,s_video_back_btn_*` cats=['ADAPTER','GEN'] | **[吸收]** | GLUE-DIM 驱动骨架；同 #13/#14 |

**判决汇总**：[吸收] 3 确定（#13/#14/#16）+ 2 候选（#11/#12）= 3~5｜[H2/H3] 11~13｜**[改判] 真 ADAPTER 应改判 = 0**。

**[改判]=0 的发现**：残余 16 无一是 census 误归的 ADAPTER-ONLY。census 的 UNABSORBED 判据（无 gen 同名 + 无 contract GLUE extern + 无纯 ADAPTER svars）对这 16 个全部成立——它们要么无任何 svars/gen/contract 信号（wrap/iometer/mobile 8 个），要么 svars 是 ADAPTER+GEN 混合（交错簇，7 个），要么纯 GEN svars 但无 gen/contract 匹配（publish_port_reporter 1 个）。没有"实为纯 ADAPTER 但被 census 漏归"的案例，census 分类口径在这 16 个上无假阴性。

---

## 3. 交叉校验

```
RUNTIME 30 + MEDIA_DECODE 11 + 残余 16 = 57  ✓（= census UNABSORBED 57）
census 全集：GEN-EQUAL 113 + GEN-DIFF 21 + ADAPTER-ONLY 77 + UNABSORBED 57 = 268  ✓
```

残余 16 内部：[吸收] 3 + [吸收候选] 2 + [H2/H3] 11 = 16（按确定判决 [吸收]3+[H2/H3]11+[改判]0=14，加 2 候选得 16）。

---

## 4. 分类争议（需用户拍板）

**争议 A — `cheng_mobile_*` 5 个（#4-#8）归 RUNTIME 还是 H2/H3 VPN 域**：
- rg `core_runtime_provider_linux.cheng`：5 个**全部有 `@exportc` 同名骨架**（:2566-2617 区段）；darwin provider 同样有。
- 严格"与现 provider 对照"判据 → 应并 `core_runtime_provider_harmony`（RUNTIME 实为 **35**）。
- 任务书 ~30 把它们排除 → 隐含 harmony VPN/HY2TUN 独立域切分，但 darwin/linux provider 先例是 mobile_* ∈ core_runtime_provider。
- **影响计数**：选并 → RUNTIME 35 / 残余 11 / MEDIA 11 → 35+11+11=57 仍闭合。选独立 → RUNTIME 30 / 残余 16（本表）。详见 `runtime30_provider_harmony_handoff.md` §5。

**争议 B — `cheng_audio_on_info`（#9）归 MEDIA_DECODE 还是 H2/H3 audio 域**：
- 它是 `OH_AVPlayer` 音频状态回调（`AV_INFO_TYPE_STATE_CHANGE`/`AV_PREPARED`/`OH_AVPlayer_Play`），属媒体但独立于"视频解码三级缓冲"。
- 本表归 H2/H3 audio 域 → MEDIA_DECODE 11（纯视频解码管线）。若并 MEDIA → MEDIA 12 / 残余 15。两者都闭合（11+1 或 16-1）。
- 判据倾向：MEDIA_DECODE 桶的"不生成"锚（§2.2 MEDIA 三级缓冲）是**视频解码**语义，`OH_AVPlayer` 音频不共享三级缓冲模型 → 归 H2/H3 audio 更准。

**争议 C — `cheng_stream_fetch_worker`（#10）归 MEDIA_DECODE 还是 H2/H3 MoQ/sourcePeer 域**：
- 蓝图 §2.2 MEDIA 明文把它列为"解码线程（`cheng_stream_fetch_worker`/`_local_file_worker`/`_prewarm_worker`）"之一 → 倾向 MEDIA。
- 但函数体实测是 QUIC 拨号 + decoder 编排（`extern cheng_scene_media_es_open`/`es_frame_count`/`es_width/height/fps`/`es_stream_loop` dlsym + `s_fetch_peer_host`/`s_fetch_peer_port`/`s_ff_dial_*`）→ 功能上是 MoQ 网络层 + 解码编排，非纯解码。
- 本表归 H2/H3 MoQ/sourcePeer 域。若按 §2.2 字面归 MEDIA → MEDIA 12 / 残余 15。
- 判据倾向：它的 UNABSORBED 根因（无 gen/contract + ADAPTER/GEN 混合 svars）是 MoQ 跨域交错，不是"解码不生成" → 归 H2/H3 更准；但 §2.2 字面先例支持 MEDIA，需用户拍板。

**争议 D — `cheng_gui_apply_payloads`/`cheng_gui_resolve_exports`（#11/#12）[吸收] 还是 [H2/H3]**：
- §2.2 GLUE-DIM 列举的 6 个驱动骨架是 begin/tick/pause/on_back/touch/set_resource_manager——**不含** apply_payloads/resolve_exports。
- 但 slice-8 README 的 prologue 34 KEEP 名单（`gen_c_keep_134_names.txt`）可能含这 2 个（待逐名核对，本轮未展开）。若在 34 KEEP → [吸收]；若不在 → [H2/H3] resolve_exports 域。
- 本表标"候选"，H1 实施前需核对 `gen_c_keep_134_names.txt` 定谳。

---

## 5. 三口径对账 + 预测口径表（若 H1/H2/H3 全落后）

### 5.1 当前口径对账（用户三口径）

| 口径 | 当前值 | 算法 |
|---|---|---|
| **113/268** | 113/268 = 42.2% | GEN-EQUAL / 手写全集 |
| **113/191** | 113/191 = 59.2% | GEN-EQUAL / (全集 − ADAPTER-ONLY) [191 = 268−77] |
| **~70%** | 134/191 = 70.2% | (GEN-EQUAL + GEN-DIFF) / (全集 − ADAPTER-ONLY) — 生成器有对应版本的覆盖率 |

三口径与 wave4 定谳的"三种分母"同构（wave4 当时 93/263=35% / 93/195=48% / 93/(93+32)=74%；现 113/268 / 113/191 / 134/191）。注：README 写的 110/24/77/57 是更早基线，当前复跑是 **113/21/77/57**（wave8 段1-3 吸收 +3 GEN-DIFF→GEN-EQUAL），用户三口径用的是当前 113 口径，对账一致。

### 5.2 预测口径表（H1/H2/H3 全落后）

H1 = core_runtime_provider_harmony 吸收 RUNTIME 30（离开 host census 范围 / 或归 ADAPTER-ONLY provider 域）。
H2 = 残余 [H2/H3] 11~13 个归各自域（leak-audit/iometer/VPN/audio/MoQ/publish/resolve_exports），改判 ADAPTER-ONLY 或离开 host gen.c 范围。
H3 = 残余 [吸收] 3~5 个驱动骨架/prologue 进生成器 → GEN-EQUAL。
终局：UNABSORBED 57 → 0。

两种边界场景（RUNTIME 30 是否留在 census）：

| 口径 | 当前 | H1/H2/H3 全落后（窄：RUNTIME 30 出 census 进 provider） | H1/H2/H3 全落后（宽：RUNTIME 30 归 ADAPTER-ONLY 留 census） |
|---|---|---|---|
| 全集 total | 268 | 238（268−30） | 268 |
| GEN-EQUAL | 113 | 116（113+3 驱动骨架吸收） | 116 |
| GEN-DIFF | 21 | 21 | 21 |
| ADAPTER-ONLY | 77 | 101（77+11 MEDIA+13 H2/H3） | 131（77+30 RUNTIME+11 MEDIA+13 H2/H3） |
| UNABSORBED | 57 | 0 | 0 |
| **口径1** GEN-EQUAL/total | 113/268 = 42.2% | **116/238 = 48.7%** | **116/268 = 43.3%** |
| **口径2** GEN-EQUAL/(total−ADAPTER) | 113/191 = 59.2% | **116/137 = 84.7%** | **116/137 = 84.7%** |
| **口径3** (EQ+DIFF)/(total−ADAPTER) | 134/191 = 70.2% | **137/137 = 100%** | **137/137 = 100%** |

**口径2/口径3 在两场景下相同**（RUNTIME 30 无论"出 census"还是"归 ADAPTER-ONLY"都排除在"生成器相关分母" 191→137 之外），仅口径1（全集分母）随 RUNTIME 去向在 238/268 间分叉。

**headline**：H1/H2/H3 全落后 → **~70% → 100%（口径3，生成器覆盖率封顶）**、**59% → 85%（口径2，逐字节全等率）**、**42% → 43~49%（口径1，含天然手写 ADAPTER 的全集口径）**。口径3 到 100% 的语义是"无函数缺生成器对应版本"，不等于 GEN-DIFF 21 清零（那 21 条是生成器有版本但 body 漂移，归 M3 终局切换的 gen.c 发射域，不在 H1/H2/H3 范围）。

### 5.3 口径引用约束

引用三口径时必须注明分母（同 wave4 考据）：113/268 = 函数级全集口径；113/191 = 排除天然手写 ADAPTER-ONLY 口径；~70% = 生成器有版本口径（EQ+DIFF / 非 ADAPTER 全集）。与 slice-0 的 s_* 静态变量级 326/73% 是**两套完全不同的分母**，不得混引。
