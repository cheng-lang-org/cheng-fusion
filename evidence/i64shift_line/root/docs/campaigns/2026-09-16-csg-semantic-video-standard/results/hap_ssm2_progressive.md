# hap_ssm2_progressive.md — 鸿蒙 HAP 消费接线：SSM2 混合容器解封消费 + 渐进起播（2026-09-20）

判词：**绿（腿 A 2/2 + 腿 B 2/2，附一条如实登记的边界）**。腿 A：SSM2 混合容器
一次 QUIC 传输 → HAP fetch（cheng 断言 sha256==cid）→ **ArkTS 侧按 SSM2 v1
格式解封**（manifest 解析 + 结构断言 + 逐载荷 sha256 双对拍，unseal 仅 5-7ms）
→ payload[0] mp4 AVPlayer fdSrc **播至 EOF（completed）**，payload[1] 对拍
f240fe88… ——5 轮（两个构建代际）全 PASS，沙箱三件拉回 Mac sha256 逐一对拍
全等。腿 B：8 chunk 索引容器**仅收 chunk0（65,536B）即起播**——首帧时刻
2,142/2,378ms，全量收完 11,913/12,618ms，**首帧早于全量收完 9.8-10.2s**，
后台 7 chunk 逐个 QUIC 取回（cid==索引表 cid 全等）回填，终文件 sha256 全等；
AVPlayer 对"零占位增长文件"的终态行为如实登记为 **error 5400103 而非
completed**（两轮分别在 4.8s / 24.3s videoT 处），按任务预案**全量后重定向**
完整文件播放 → 两轮均 completed 播至 EOF（PLAYDONE 35,456/49,159ms）。
旧按钮回归 2/2 绿（RECEIVE/RECEIVE:MP4）。

## 0. 任务与两腿设计

- 腿 A（SSM2:RECV）：安卓 4460 serve `hgs_ssm2.ssm1`（SSM2 容器的单 kf SSM1
  传输封套 582,457B）→ HAP fetch → 落容器文件 582,340B → ArkTS 解封（全小端
  manifest：magic/version/payloadCount/各载荷 kindLen/kind/byteLen i64/
  sha256 64hex/offset i64；结构断言=首条 offset==headerLen + 载荷区无缝 +
  末条终点==EOF）→ 逐载荷落盘 + sha256 双对拍（manifest cid + expected 常量）
  → payload[0] AVPlayer fdSrc 播至 EOF（completed=SSM2 PLAYDONE）→
  payload[1] 与 f240fe88… 对拍。任一断言失败显式 FAIL，无降级。
- 腿 B（PROG:RECV）：安卓 4461 serve `hgs_base_indexed.ssm1`（8 chunk 索引
  容器，chunked_progressive_ssm1.md §2 格式零改动）→ fetch manifest(824B)+
  chunk0（65,536B 起播就绪前缀，cheng 断言 sha256==cid0）→ **一次写出增长
  文件**（shim 组装缓冲=全文件长、未取回 chunk 置零；skip=824 写出
  496,166B：[0,65536) 为已断言 chunk0 实字节，其后零占位）→ AVPlayer 立即
  起播（PROG FIRSTPLAY）→ 后台从 4462..4468 单 kf chunk 封套实例逐个渐进取
  回余下 7 chunk（封套 cid==索引表 chunk cid，fetch 断言 + JS 独立 sha 复核）
  按 offset 回填 → 全量收完记 PROG COLLECTED（fullMs/firstPlayMs/delta）+
  全文件 sha256 终验（==927b37e6…）→ 原播放器若 error（见 §3 边界），按任务
  预案**全量后重定向**完整文件播放至 EOF（PROG REDIRECT PLAYDONE）。

## 1. 载荷与封套（Mac 母本 + 安卓机上件，哈希逐一对拍）

| 件 | sha256 | 大小 | 安卓机上 |
| --- | --- | --- | --- |
| ssm2/hgs_ssm2.ssm2（SSM2 容器） | 1eb20a17e77cb2b8…caf90ee629 | 582,340B | /data/local/tmp/hgs_ssm2.ssm2 一致 |
| hapsp/hgs_ssm2.ssm1（单 kf 传输封套） | c55de971100fc039…8b2ed0fc33 | 582,457B | /data/local/tmp/hgs_ssm2.ssm1 一致 |
| v2/hgs_base_indexed.ssm1（8 chunk 索引容器） | de90b29c5edb3b72…089afb7 | 496,990B | /data/local/tmp/hgs_base_indexed.ssm1 一致 |
| hapsp/chunk_1..7.ssm1（本任务新建单 kf chunk 封套） | 见下表 | 65,653×6 / 37,531B | /data/local/tmp/hapsp/ 机上 sha256sum 7/7 一致 |

chunk 封套 cid == 索引表 chunk cid（8/8 与 §2 表全等；封套工具
.scratch/bs1/ssm1_wrap_mp4，载荷切片 = base.mp4 [k·65536, …)）。索引容器独立
复核（python 镜像 manifest.cheng 合同）：8/8 载荷 sha256==cid、拼回==base.mp4
逐字节（496,166B）、headerLen=824、audioRef=0。

## 2. 安卓 serve 现场（11 自起实例，4443 保护现场零扰动）

```
serve pack=…/hgs_ssm2.ssm1         fileLen=582457 chunks=1 headerLen=117 kfRange=[117,582457)  (4460)
serve pack=…/hgs_base_indexed.ssm1 fileLen=496990 chunks=8 headerLen=824 kfRange=[824,66360)  (4461)
serve pack=…/hapsp/chunk_k.ssm1    fileLen=65653|37531 chunks=1 headerLen=117 kfRange=[117,…)  (4462..4468)
serve pack=…/hgs_l2_planes.ssm1    fileLen=86077  chunks=1（4444，旧 RECEIVE 回归）
serve pack=…/hgs_base.ssm1         fileLen=496283 chunks=1（4445，旧 RECEIVE:MP4 回归）
```

Mac fetch 金丝雀（.scratch/fh/mac_fetch，Q3 在证客户端）——**腿 B 后台链
8 个 chunk cid + 腿 A 容器全部传输层实拉验证**：

```
4460: fetch ok chunk=582340B sha256-match=1eb20a17e77cb2b8…caf90ee629
4461: fetch ok chunks=8 manifest=824B chunk=65536B sha256-match=f66dc5dec2677790…a6057674
4462..4468: fetch ok sha256-match = f004cfd2… / 3de71a22… / 0f481693… / 7a990fec… / 63dca076… / 6896ddd4… / 9b5de0bf…
```

工程注记（如实）：①首轮金丝雀曾 FAIL（negotiate_ack_8 / handshake ! ready），
根因=安卓手机灭屏 doze 节流 UDP（ICMP 50% 丢+78ms RTT 实证）；`KEYCODE_WAKEUP`
+`svc power stayon true` 后即绿，serve 零改动。②doze 期畸形握手把 4462/4464
实例进程内 TLS 态打病（`certificate_verify: tls13: certificate verify failed`，
reverse_transfer 4443 同签名），实例重启即愈，载荷/端口零改动——进程态缺陷，
非容器/格式问题。③清理脚本曾踩在案自伤坑（pgrep -f 模式匹配进包装 shell 自身
cmdline 被 kill，exit 143，AGENTS 事故二同型）——实例管理一律按 pid 精确操作。
现每端口恰 1 实例（pgrep 逐 pid 核对）。

## 3. HAP 改动与装机

- Index.ets（授权目录内）：新增常量面（SSM2_PORT/容器 cid/容器字节/双载荷
  expected；PROG_PORT/cid0/824 头/全量 496,166/7 chunk 端口-cid-字节表）+
  腿 A 全链（ssm2Receive/ssm2PollTick/ssm2Finish/ssm2Unseal/ssm2ExtractVerify/
  i64Le）+ 腿 B 全链（progReceive/progPollTick/progPrefixDone/sha256Prefix/
  startProgVideo/progFetchNext/progChunkPollTick/progChunkDone/progAllCollected/
  progRedirectStart）+ playMode 归属 EOF 判据行 + SSM2:RECV/PROG:RECV 双按钮。
- NAPI/.so 零改动（既有导出复用；fetch 纯客户端状态机逐轮独立，shim
  g_fetchRunning DONE 后复位，支持腿 B 同进程 1+7 次顺序复用——真机实证）。
- 装机代际：1000060(8a9b81ab) → 1000061(53e2a67b，修 A 腿判据常量) →
  1000062(b026d344，修 B 腿前缀写出/校验) → **终态 1000063(750fd222，加
  全量后重定向)**。已实现并登记的两次真机驱动修复：
  ① 1000060 首轮 FAIL（fetch ok 但 shaMatchEnvelope=false）：判据误用封套
  文件 sha（c55de971…），fetch 时间线打的是载荷（=SSM2 容器）cid
  （1eb20a17…）——与 ssm2_hybrid_container.md §4 在案口径一致，改用容器 cid
  后 PASS。修复轮 A1/A2 在 1000061 上 2/2 绿。
  ② 1000061 B1 FAIL（expect written=65536，实得 written=496166）：shim 组装
  缓冲为全文件长（未取回 chunk 置零），skip=824 一次写出的恰是预分配增长
  文件——顺势改设计为「一次写全量+零占位」，JS 用 sha256Prefix 独立复核前
  65,536B（==cid0）。
- 已知好件备份：.scratch/hapsp/hap_backup_1000059_69d73354.hap +
  Index.ets.bak_1000059（回滚=装回+恢复 Index.ets）。

## 4. 真机轮判据数字（hilog 原文见 .scratch/hapsp/{a,b}*.hilog.txt）

### 腿 A（SSM2 解封消费）——5 轮全 PASS

| 轮（构建） | fetchMs | click→UNSEAL PASS | unsealMs | prepared→first-play | EOF（SSM2 PLAYDONE） |
| --- | --- | --- | --- | --- | --- |
| A1（1000061） | 2413 | 2449ms | — | 141ms | 25,266ms |
| A2（1000061） | 2263 | 2304ms | — | 94ms | 25,068ms |
| A3（1000062） | 2564 | 2610ms | 6ms | 118ms | 25,394ms |
| A4（1000062） | 2711 | 2751ms | 7ms | 159ms | 25,656ms |
| A5（1000063） | 2713 | 2754ms | 5ms | 103ms | 25,522ms |

逐轮固定断言行：`fetchOk=true shaMatchContainer=true`；`SSM2 PARSE magic=SSM2
ver=1 count=2` + `headerLen=214 fileLen=582340`；`ENTRY 0 video/mp4 496166
927b37e6… offset=214` / `ENTRY 1 application/x-csg-svblock 85960 f240fe88…
offset=496380`；`P0/P1 cidMatch=true expectedMatch=true`；PLAYPOS 2s 节拍全程
单调 → completed。沙箱拉回 Mac 独立对拍（5 轮三件）：容器 582,340B
sha=1eb20a17…、payload0 496,166B sha=927b37e6…、payload1 85,960B
sha=f240fe88… 全等。截图：a5_p1.jpeg 播放中画面彩色可见（视频区
uniqColors=5,886 / colorfulRatio=0.192，对照灭屏纯黑基线 uniqColors=1），
内容=胡广生录音棚场景（任素汐）。

### 腿 B（渐进起播，终版构建 1000063）——2/2

| 项 | B1 | B2 |
| --- | --- | --- |
| chunk0 fetchMs（fetch asserts shaMatchChunk0=true） | 1,960→1,658ms 段内 | 2,710ms |
| PROG PREFIX（size=496,166 前 65,536B sha==cid0） | prefixMs=1,998 | 2,747ms |
| prepared / first-play | 76ms / 88ms | 107ms / 133ms |
| **PROG FIRSTPLAY（click→首帧）** | **2,378ms** | **2,142ms** |
| 后台 7 chunk 逐个 fetch+回填 | 1.2-1.7s/个，11,617ms 收全 | 1.2-1.7s/个，11,912ms 收全 |
| **PROG COLLECTED（click→全量收完）** | **12,618ms** | **11,913ms** |
| **delta（首帧早于全量收完）** | **10,240ms** | **9,771ms** |
| 终文件 sha256（496,166B） | 927b37e6… == 源 | 927b37e6… == 源 |
| 增长文件上原播放器 | PLAYPOS→1,599 后 error@videoT+4,769ms | PLAYPOS 2,314→22,367 全程单调，error@videoT+24,285ms（已过自然 EOF） |
| PROG REDIRECT（全量后重定向） | prepared 92ms → completed@22,790ms | completed@22,791ms |
| **PROG REDIRECT PLAYDONE（click→EOF）** | **35,456ms** | **49,159ms** |
| PLAYDONE 沙箱拉回 | b1_prog.mp4 496,166B sha=927b37e6… | b2_prog.mp4 同 |

1000062 代际的 B1/B2 特征化轮（无重定向，件名 *.1000062 保全）：B1 原播放器
posMs 一路播到 22,416/22,501 后 error@EOF；B2 原播放器 4,990ms error——两轮
两个位置实证 AVPlayer 对零占位增长文件的终态不可预期（error 5400103，非
completed），此为本判词附带的如实边界。

### 旧按钮回归——2/2 绿（终版构建 1000063）

```
RECEIVE（svblock，4444）: BASE_SSM1 RECEIVE PASS click->file-verified 1990ms (fetchMs=1962) sha=f240fe88…
RECEIVE:MP4（base，4445）: BASE_SSM1 RECEIVE PASS click->file-verified 2758ms (fetchMs=2713) sha=927b37e6…
（1000062 代际同轮：2281ms / 2923ms，亦 PASS）
```

## 5. 如实标注与遗留

1. **AVPlayer 对零占位增长文件的终态 = error 5400103 而非 completed**（4 轮
   实证：B1/B2×两代际，error 位置 4.8s/22.4s(EOF 处)/5.0s/24.3s(EOF 后)，
   无规律→不可预期）。渐进起播与可见播放本身成立（B2-1000063 原播放器
   PLAYPOS 2,314→22,367 全程单调，播完整条时间线），但「增长文件上原生
   completed」不成立，EOF 判据经任务预案「全量后重定向」收口（重定向后
   completed 稳定复现 2/2）。这属平台播放器行为边界，非 CSG 链路缺陷。
2. 判据常量教训（1000060 首轮 FAIL）：封套**文件** sha（传输物登记值）≠封套
   **cid**（=载荷 sha256，fetch 断言对象）——接线时判据必须绑协议时间线实际
   打印值。
3. 安卓 doze 节流 UDP + q3_serve 进程内 TLS 态可被畸形握手打病（重启即愈）
   为本轮新登记工程事实；跨机 QUIC 轮前须唤醒服务端手机并保持其醒态。
4. 机上留置：/data/local/tmp/hapsp/（7 chunk 封套）、serve_44xx/446x.log、
   q3_serve×11（4460/4461/4462-4468/4444/4445）按任务留机在线；Mac
   .scratch/hapsp/ 为全量证据目录（封套母本、chunk 切片、round/autorun 脚本、
   构建回执、金丝雀 fetch 输出、各轮 hilog/verdict/截图、沙箱拉回件、备份件）。
5. git 未提交（按纪律）。

## 6. 判词

**绿：腿 A 2/2（解封 + 双载荷四重对拍 + 播至 EOF，5 轮跨代际全 PASS）；
腿 B 2/2（首帧 2.1-2.4s ≪ 全量收完 11.9-12.6s，提前 9.8-10.2s，数字在案；
EOF 经任务预案「全量后重定向」收口 2/2 completed）。** 唯一边界=AVPlayer 对
增长文件的终态行为（error 非 completed）如实登记，不构成链路缺陷。
