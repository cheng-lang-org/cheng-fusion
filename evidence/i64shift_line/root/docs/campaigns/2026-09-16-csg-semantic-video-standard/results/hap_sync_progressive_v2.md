# hap_sync_progressive_v2.md — HAP 播放体验双收口：D3 深度 overlay ↔ 播放进度同步量化 + 渐进播放确定性（HAP 内本地 HTTP Range server，真边下边播）（2026-09-20）

判词：**绿（A 同步 500ms chunk 级 + 多时刻差分证 + seek 跟随；B 单实例无重定向 completed 3/3；旧按钮回归 4 轮全绿）**。

- **A（D3:RECV 深度 overlay ↔ 进度同步）**：装机 1000068 基线量化实锤 **overlay 不随进度走**——native blit 表面只采纳前 2 次更新（45 次 flush rc=0，可见内容钉死 DPD1 chunk 1），任务稿「可能只画了首帧」定谳为「画了首帧+第二帧后停更」。修复=D3 overlay 改纯 ArkTS 渲染（Image+PixelMap 逐帧重建，对齐逻辑不变：currentTime → floor(posMs/500) → 对应 chunk）。终版量化：**500ms chunk 级同步**，渲染滞后 latMs 均值 49-58ms（max 501=边界耦合）；**45 chunk 归一灰度内存哈希（FNV-1a32）上机 vs Mac DPD1 重算 45/45 全等 ×4 轮**；posMs≈2/8/15s + seek2s 多时刻截图 overlay 内容逐一对拍命中**当时所在 chunk**（best mad 3.2-5.2 vs 次名 10.8-19.3，8 张全中）；OFF toggle 块消失（50-98% 像素差）；重播 seek 后 DEPTH3 f=1 idx=0 重跟随。
- **B（PROG:RECV 渐进播放确定性）**：@ohos.net.socket TCPSocketServer（SDK 6.0.2(22) 在证）于 **127.0.0.1:4501** 起 HTTP/1.1 Range server（206+Content-Range+Content-Length，缺段阻塞该 Range 直到取到），AVPlayer httpSrc 指向 localhost，边取边播不中断、EOF 确定到达：**3/3 轮单实例零重定向播至 state=completed**，首帧 2,209/2,337/2,510ms（≪全量收完 12,358-13,724ms），PLAYDONE 25,053/25,188/25,377ms ≈ 首帧+22,500ms（Δ216/479/367ms），终文件 496,166B sha256 全等。对照旧「增长文件 fdSrc + 全量后重定向」形：首帧相当（2,142-2,378ms），EOF 由「error 5400103 → 重定向兜底（PLAYDONE 35,456/49,159ms）」变为「单实例直接 completed（PLAYDONE 25.1-25.4s）」。
- **回归（终版构建）**：RECEIVE PASS 2,287ms；RECEIVE:MP4 PASS 2,751ms；SSM2:RECV PLAYDONE 25,704ms；D3:RECV PLAYDONE 35,570ms depthFrames=45 + GHASH 45/45。
- 装机 1000069（versionName 1.0.67，终件 sha256 前16 **41eacdff4d3414ac**）；安卓 serve 本轮自起实例一律 4490+；4443 现场零接触；git 未提交。

## 0. 任务与结论概要

| 项 | 任务口径 | 结果 |
| --- | --- | --- |
| A① 量化现状 | 多时刻截图判断 overlay 是否随进度 | **不随**（钉死 chunk1，native blit 表面 2 次更新后停更） |
| A② 对齐 | currentTime→chunk index→上屏 | 既有 floor(posMs/500) 逻辑正确；显示路径改 ArkTS PixelMap 后生效 |
| A③ 终态 | 500ms 级 + 截图差分 + 45 帧内存哈希对拍 | 45/45 哈希 ×4 轮；8 张截图逐一对拍命中；latMs 均值 ~50ms |
| A④ seek | overlay 跟随（不苛求帧级） | 重播后 f=1 idx=0 重跟随，seek2s=chunk3/4 命中 |
| B① SDK 可用性 | TCPSocketServer 先核 | d.ts since API 10（close since 20），SDK 22 在证，真机可用 |
| B② server | HTTP/1.1 + Range + 206 + content-length | 127.0.0.1:4501，缺段阻塞该 Range，Connection: close |
| B③ 编排 | 多 chunk 取回与伺服并发 | 主媒体 GET 阻塞点按 chunk 到达增量流出，首帧不等全量 |
| B④ 判据 | 首帧 ≪ 全量；单实例不重定向 completed 2/2；PLAYDONE≈首帧+时长 | 3/3 轮全过（首帧 2.2-2.5s；completed 3/3；Δ216/479/367ms） |

## 1. A① 基线量化（1000068，改前装机）

轮次 base1（d3_base.sh）：D3 DECODE PASS 45/45（decodeMs 291）→ PLAYDONE click→eof 33,305ms depthFrames=45。三时刻截图（hilog 轮询滞后致实际 posMs≈20.3/EOF 后/EOF 后）+ 深度 OFF 差分定位 overlay 屏幕矩形 **(441,445)-(571,702)**（131×258 = surface 128×256 × ~1.02）。

内容判定（dpd1_render.py match，crop 内缩后 123×250 对 45 chunk 逐个 NCC+MAD）：

| 截图 | posMs（hilog 反推） | 最佳 chunk | ncc | mad | 其余次名 |
| --- | --- | --- | --- | --- | --- |
| base1_t2 | ≈19.9s（idx 应为 40/41） | **chunk 01** | 0.9809 | **5.33** | 22-38 |
| base1_t8 | EOF 后（应为 idx 44） | **chunk 01** | 0.9843 | **4.55** | 22-38 |

chunk0/1 自身间距 mad 32.6 → 可见内容**精确钉死 chunk 1**（第 2 次 blit），并非近似误判。结论：**native ssm1RenderPixels（OH_NativeWindow request/memset/blit/flush 部分脏区）路径表面只采纳前 2 次更新，其后 43 次 rc=0 flush 均不上屏**。M7/CSG 旧路径（renderPlayFrame/renderDepthFrame）同用该 blit，同样受影响（历轮只验过「块可见」未验过「逐帧内容」，如实登记）。native 修复涉及 cheng 工具链重编 libssm1napi.so，另案登记，不在本任务动。

## 2. A 修复（1000069）

- **显示路径**：D3 overlay 改纯 ArkTS——`d3RenderDepthFrame` 归一灰度→RGBA8888→`image.createPixelMapSync`→`@State d3PixelFrames=[pm]` + `d3PixelRev` 计数 → PlayerCard 内 `Image(d3PixelFrames[0])` 逐帧重建；位置沿用旧 blit 表面坐标占比（32.47%/14.43%/10.39%/36.94%），真机实测屏幕矩形与旧 blit 位完全重合。D3 源下 ssm1view native 面隐藏（M7/CSG 旧路径零改动）。
- **对齐逻辑**（既有，量化验证）：`idx = floor(currentTime/500)`，chunk i 覆盖 [i·500, i·500+500)，与 DPD1 ptsMs==i·500 逐 chunk 对齐；100ms tick，索引变化才重渲。
- **哈希证据链**：解码时逐 chunk FNV-1a32（归一灰度行序字节）入 `d3ChunkHash[45]`，3 行 GHASH 落 hilog；每次渲染 DEPTH3 行带 `hash=` 与 `latMs=posMs-idx·500`。Mac `dpd1_render.py render` 同算法重算 DPD1（round-half-up 对齐 Math.round——**np.round 银行家舍入会翻 6/45 哈希，口径统一后 45/45**）。
- **seek 跟随**：onVideoState playing 时若 d3 深度同步已停（EOF 后重播）则重启同步；EOF/重播路径验证见 §3。
- **UI 缺陷修复**：深度 开/关 与 播放/暂停 两个有状态标签改直接 Text（CtrlButton @Builder 按值传参不随状态刷新——dumpLayout 实证 toggle 后标签停留旧值）。

## 3. A③ 终态量化（4 轮）

| 项 | d3r5 | d3r6 | d3r7（终版构建） | reg_d3 |
| --- | --- | --- | --- | --- |
| GHASH 45/45 | ✓ | ✓ | ✓ | ✓ |
| 渲染数（含 toggle 暂停跳帧） | 45 | 46 | 45 | 45 |
| latMs（渲染滞后=同步误差） | n=45 mean 55 | n=46 mean 58 | n=45 mean 56 max 501 | — |
| DEPTH3 全部 render=ok | ✓ | ✓ | ✓ | ✓ |
| PLAYDONE totalMs | 33,218 | 33,416 | 33,106 | 35,570 |

latMs 全体 n=136 mean≈57ms，除 2 个 chunk 边界耦合值（498/501ms）外 ≤124ms——**同步粒度=500ms chunk 级，典型滞后 ~50-120ms**。

**多时刻截图↔chunk 对拍**（crop=(445,449)-(567,698)，对 45 chunk 全排序）：

| 截图 | 捕获时 posMs（DEPTH3 行反推） | 最佳命中 | mad（best→次名） |
| --- | --- | --- | --- |
| d3r5_t2 / t8 / t15 | ≈3.0s / ≈9.1s / ≈16.6s | chunk 6 / 18 / 33 | 4.0→10.8 / 3.2→19.3 / 4.4→13.7 |
| d3r5_seek2s | 重播后≈2s | chunk 3 | 3.7→13.1 |
| d3r6_t2 / t8 / t15 | ≈2.5s / ≈8.5s / ≈15.5s | chunk 4 / 17 / 31 | 4.1→16.3 / 4.2→14.7 / 4.8→16.9 |
| d3r6_seek2s | 重播后≈2s | chunk 3 | 3.7→13.1 |
| d3r7_t2 / t8 / t15 | ≈4.2s / ≈10.3s / ≈17.7s | chunk 8 / 20 / 35 | 3.4→11.0 / 3.8→16.0 / 5.2→11.7 |
| d3r7_seek2s | 重播后≈2.3s | chunk 4 | 4.1→16.3 |

11/11 张最佳命中 = 捕获时刻所在 500ms 窗口对应 chunk（±1 chunk 均在截图延迟 0.5s 内），且 best mad 3.2-5.2 与次名 10.8-19.3 判别清晰；不同 posMs 的 overlay 帧哈希互不相同且与对应 chunk 内存哈希全等。**OFF toggle：overlay 区 50-98% 像素变化（块消失，三轮实证）。seek：重播后流内第二次 `DEPTH3 f=1 idx=0`（d3r5/r6/r7 count=2）+ f=2..4 重跟随。**

## 4. B 实现（1000069）

- **server**（ArkTS，`socket.constructTCPSocketServerInstance`）：listen 127.0.0.1:4501 → per-connection message 累积 → 解析 GET + Range（`bytes=s-e`/`s-`/`-N`，RFC 7233 子集）→ 有 Range：`206 Partial Content` + `Content-Range: bytes s-e/total` + `Content-Length` + `Accept-Ranges`；无 Range：`200 OK`；越界 416（`Content-Range: bytes */total`）、非法 400。响应体 64KB 切片顺序流出，越过取回前沿即**阻塞该 Range 直到对应字节取回**（waiter 注册表，chunk 回填唤醒；60s 上限断链）；每响应后关闭（Connection: close）。
- **字节源**：内存缓冲 `progBuf[496,166]`——chunk0 前缀（sha==cid0 断言后文件回读）起 65,536B，后台 4491..4497 逐 chunk 取回（封套 cid==索引表 cid 断言 + 文件独立 sha 复核）按 offset 回填**文件+缓冲**，`progHaveBytes` 推进并唤醒阻塞响应；增长文件同步落盘（沙箱拉回+前缀/终验 sha 证据链不变）。
- **播放器**：`AVPlayer.url = http://127.0.0.1:4501/hgs_prog.mp4`（cleartext localhost，既有 HTTP:PLAY 同形）。
- **生命周期**：completed/error/重定向启动/新一轮 PROG:RECV 均关闭 server 并清 waiters（防端口泄漏）——teardown 行落 hilog（served/blocked/errs 计数）。
- 旧「全量后重定向」代码保留为 error 兜底，本形态 3/3 轮未触发。

## 5. B④ 判据轮数字（3/3）

| 项 | pr1 | pr2 | pr3（终版构建） |
| --- | --- | --- | --- |
| PROG PREFIX（65,536B sha==cid0） | 2,135ms | 1,987ms | 2,292ms |
| **PROG FIRSTPLAY（click→首帧，COLLECTED/PLAYDONE 内嵌值）** | **2,337ms** | **2,209ms** | **2,510ms** |
| 首帧截图（blocked GET 后 ~0.9s） | 视频 title 场景可见 | 同 | 同 |
| PROG COLLECTED fullMs（delta） | 12,358（10,021） | 13,724（11,515） | 12,684（10,181） |
| **T_VIDEO state=completed（elapsedMs）** | **22,890ms ✓** | **23,168ms ✓** | **23,077ms ✓** |
| **PROG PLAYDONE click→eof** | **25,053ms** | **25,188ms** | **25,377ms** |
| PLAYDONE −（首帧+22,500） | Δ216ms | Δ479ms | Δ367ms |
| PROG REDIRECT / state=error | 无 / 无 | 无 / 无 | 无 / 无 |
| PROG HTTP teardown | served=2 blocked=1 errs=2 | served=2 blocked=1 errs=1 | served=2 blocked=1 errs=2 |
| 沙箱拉回 496,166B sha256 | 927b37e6…==源 | ==源 | ==源 |

伺服时序（如实）：AVPlayer 全程恰 2 个 GET——moov 探测 `0-8191`（blocked=false，prepare 就绪）+ 主媒体 `8192-496165`（**blocked=true**，响应体随 7 个 chunk 到达增量流出）；首帧在首 chunk 就绪后 ~0.2s 即出，不等全量；全量收完（12.4-13.7s）后播放器已缓冲完所需数据，长连接随后被播放器侧断开（errs=1-2，`2301100 Network is down`——播放器停读断链，不影响播放，无重连需求 served=2）。

**与旧重定向形对照**：

| 形态 | 首帧 | EOF 到达方式 | PLAYDONE（click→EOF） |
| --- | --- | --- | --- |
| 旧：增长文件 fdSrc | 2,142/2,378ms | error 5400103（4 轮实证不可预期）→ 全量后重定向 completed | 35,456 / 49,159ms |
| **新：本地 HTTP Range** | **2,209-2,510ms** | **单实例直接 completed（3/3）** | **25,053 / 25,188 / 25,377ms** |

## 6. 回归（终版构建 41eacdff）

```
RECEIVE（svblock，4444 留机实例）: BASE_SSM1 RECEIVE PASS click->file-verified 2287ms (fetchMs=2263) sha=f240fe88…
RECEIVE:MP4（base，4498 本轮自起）: BASE_SSM1 RECEIVE PASS click->file-verified 2751ms (fetchMs=2719) sha=927b37e6…
SSM2:RECV（4460 留机实例）: SSM2 PLAYDONE click->eof 25704ms（前一轮 25583ms 亦 EOF，判词脚本笔误重跑）
D3:RECV（4480 留机实例）: D3 PLAYDONE click->eof 35570ms depthFrames=45 + GHASH 45/45 + 多时刻 overlay 同步在案
```

Mac 侧金丝雀（mac_fetch）：4490/4491-4497/4498 新起实例 9/9 `fetch ok sha256-match` 与索引表 cid 全等（4490 中途病态重启一次后复测全等）。

## 7. 如实登记与遗留

1. **native blit 停更缺陷（另案）**：`ssm1_napi_shim.c RenderRgbaToSurface` 表面只采纳前 2 次更新（45 次 rc=0 flush 不上屏）。疑似 memset 全缓冲 + 部分脏区 flush 与合成器交互或 fence 语义问题；M7/CSG 旧深度/灰度逐帧路径同受影响。修复需 cheng 工具链重编 libssm1napi.so，本轮未动 native。
2. **ArkUI 三个框架行为实证**（工程事实，供后续轮避坑）：① `@Builder` 按值传参不随状态刷新（标签停留旧值）；② `if` 条件首位为非 state 字段时短路导致整条 if 零 state 依赖、分支永不重建（d3r1/r2/r7 三轮实证，首位换 state 读即愈）；③ `@State` 对平台对象（image.PixelMap）引用赋值观察不可靠、ForEach 对平台对象数组在 Stack 内静默失效——用 `@State number` rev + `Image(frames[0])` 直索引绕开。
3. **hilogd 丢行**：`-Q pidoff/domainoff` 关流控也挡不住洪泛期环形覆盖（FIRSTPLAY 行三轮被吞）——判据行避免依赖突发窗口行，PROG 判据绑 COLLECTED/PLAYDONE 内嵌 firstPlayMs；设备侧流过滤用 `hilog -D`（toybox grep --line-buffered 不生效，块缓冲致 12.8s 级行延迟）。
4. **舍入口径**：深度归一灰度设备侧 Math.round（半值向上）；Mac 对拍工具必须同口径（np.round 银行家舍入曾致 6/45 哈希翻面，半值像素级敏感）。
5. q3_serve 实例病态复现 2 次（4480/4490 `handshake ! ready`），重启即愈——与前轮「进程内 TLS 态被畸形握手打病」同因，实例重启为标准处置。
6. 机上留置：serve 实例 4444/4460/4480/4490-4498 在线；HAP 本地 4501 server 随轮启停（completed 即关）。证据目录 `/Users/lbcheng/UniMaker/.scratch/hapsync_v2/`（终版/备份 Index.ets、构建回执、11 张轮 hilog 流+截图+verdict、ghash 表+45 帧渲染 PNG、沙箱拉回件、dpd1_render.py/img 工具）；git 未提交。
7. 装机链：1000068（530d5201…，备份在案）→ **1000069**（versionName 1.0.67，终件 41eacdff4d3414ac，versionCode 递增）。

## 8. 判词

**绿：A 同步 500ms chunk 级 + 45/45 内存哈希对拍 ×4 轮 + 11 张多时刻截图逐一对拍命中 + seek 跟随；B 本地 HTTP Range server 单实例无重定向 completed 3/3（首帧 2.2-2.5s ≪ 全量 12.4-13.7s，PLAYDONE≈首帧+时长 Δ≤479ms）；回归 4 轮全绿。** 唯一另案边界=native blit 停更缺陷（D3 已绕开，M7/CSG 旧路径受累，修复归 cheng 工具链重编轮）。
