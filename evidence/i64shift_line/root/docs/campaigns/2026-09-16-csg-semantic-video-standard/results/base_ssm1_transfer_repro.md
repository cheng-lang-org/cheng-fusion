# base_ssm1_transfer_repro.md — base.mp4 纯 QUIC 通道（ssm1q）跨机传输复现 2/2（2026-09-19）

判词：**绿（2/2 轮）**。本任务此前已有一轮完整执行（base_ssm1_transfer.md，2/2 PASS）；
本次执行先对其全部盘上证据做哈希复核（逐一吻合，无假绿），再在双真机上**新跑 2 轮独立
复现**（每轮独立 q3_serve 实例 + 应用重启）。链路与前报同构：base.mp4（496,166B，
sha256=927b37e61b33187b…）经 ssm1_wrap_mp4.cheng 包装为 SSM1 v1 单 keyframe chunk 容器
（载荷=mp4 全量字节，cid=源 sha256）→ 安卓 DCO-AL00 q3_serve（QUIC/ssm1q，4443）→
鸿蒙 Mate 70 Pro+ HAP RECEIVE（ssm1q fetch + sha 双断言）→ ssm1qAssembledWriteFile 落
HAP 沙箱 → JS 端大小+sha256 复核 → AVPlayer fdSrc 完整播放至 EOF，屏幕可见彩色画面。

## 0. 前序证据复核（防"报告先行"）

- .scratch/bs1/ 7 张截图 sha256 与前报 §5 逐一吻合（bs1_app=9b01ab52…、bs1_c1=85f454ee…、
  bs1_c2=d0b8041c…、bs1_p1/p2=729c801e…、bs1_p3/p4=43b12c6c…）。
- hgs_base.ssm1（Mac 盘上件）sha256=c91f3416df437492… == 安卓 /data/local/tmp/hgs_base.ssm1
  （机上 sha256sum 实测同值）== 前报 §6 登记。
- base.mp4 源 sha256=927b37e61b33187bd07a43ae8395be44999cd13e793ff50f1c9319f5d8c11eb8
  （Mac 实测==前报）。
- hilog 缓冲内仍留存前报两轮原文（20:32/20:34，pid 61744，fetchMs=2565/2114，
  T_FETCH_FILE sha=927b37e6… 两轮）——与前报 §4 逐行吻合。

## 1. 每轮关键数字（本次新跑两轮，hilog 原文 .scratch/bs2/r1.hilog.txt / r2.hilog.txt）

| 项 | 轮 1（21:16，pid 18264） | 轮 2（21:20，pid 20424） |
| --- | --- | --- |
| serve 实例 | 独立新起，pack 解析过，listening udp/4443 | 独立新起，同左 |
| 传输耗时 fetchMs | 3467 | 2568 |
| click→file-verified | 3518ms | 2620ms |
| 落盘字节数 | 496,166B（written=496166, total=496283, skip=117） | 同左 |
| cheng 端双断言 | fetchOk=true shaMatchSource=true | 同左 |
| JS 端文件复核 | size=496166 sizeOk=true sha=927b37e6…11eb8 shaOk=true | 同左 |
| prepared（首帧就绪） | 103ms（dur=22501） | 112ms |
| first-play（首帧时间） | 130ms | 128ms |
| PLAYPOS 轨迹 | 2s 节拍 11 点单调 → posMs=21781 | → posMs=21769 |
| EOF | T_VIDEO completed totalMs=22831 | 22828 |
| serve 回执 | conn=1 served=2 manifest=117B chunk=496166B，对端 /ip4/192.168.1.2 | 同左 |

## 2. sha256 三方对拍（超越 hilog 断言的独立复核）

沙箱落盘文件用 `hdc file recv` 拉回 Mac 独立哈希：

```
hgs_fetch_r1.mp4  927b37e61b33187bd07a43ae8395be44999cd13e793ff50f1c9319f5d8c11eb8
hgs_fetch_r2.mp4  927b37e61b33187bd07a43ae8395be44999cd13e793ff50f1c9319f5d8c11eb8
源 base.mp4       927b37e61b33187bd07a43ae8395be44999cd13e793ff50f1c9319f5d8c11eb8
```

三轮全等：Mac 源 == 鸿蒙沙箱件（轮 1、轮 2 各自独立拉回）== serve 容器内嵌载荷。

## 3. 截图差分（.scratch/bs2/，snapshot_display 1316x2832，视频区 crop 240,1790–1080,2470）

| 文件 | 时点 | uniqColors | colorfulRatio |
| --- | --- | --- | --- |
| bs2_r1_base / bs2_r2_base | 点击前基线 | 1（纯黑） | 0.000 |
| bs2_r1_s5 / bs2_r2_s5 | 播放 ~2.3s（录音棚彩色场景） | 22556 / 22454 | 0.059 / 0.065 |
| bs2_r1_s8 / bs2_r2_s8 | 播放 ~5.3s | 19487 / 18610 | 0.075 / 0.066 |
| bs2_r1_s15 / bs2_r2_s15 | 播放 ~12.3s | 24528 / 25313 | 0.070 / 0.069 |

基线 1 色 → 播放帧 1.8 万–2.5 万色，两轮画面均随播放位置演化（彩色可见视频成立）。

## 4. 证据文件清单

- .scratch/bs2/r1.hilog.txt、r2.hilog.txt（判据行全文；r1.hilog.raw/r2.hilog.raw 为全量缓冲）
- .scratch/bs2/hgs_fetch_r1.mp4、hgs_fetch_r2.mp4（沙箱拉回件，各 496,166B）
- .scratch/bs2/bs2_r{1,2}_{base,s5,s8,s15}.jpeg（8 张截图）
- .scratch/bs2/r2_serve_start.txt；安卓机 /data/local/tmp/hgs_serve_r{1,2}.log（serve 回执）
- 前序执行证据：results/base_ssm1_transfer.md、.scratch/bs1/（本次已哈希复核）

## 5. 现场状态

- 装机 HAP：com.example.unimaker versionCode=1000055（base_ssm1_transfer 形态：RECEIVE=
  fetch→断言→落文件→复核→AVPlayer fdSrc；RECV_HOST=192.168.1.6 与安卓当前 IP 实测一致）。
- 安卓 q3_serve（pid 7287）仍在线 serve /data/local/tmp/hgs_base.ssm1（4443）。
- 本任务零源码改动（复现轮未改任何文件；包装工具 ssm1_wrap_mp4.cheng 与 HAP 均为前序
  交付物，本次仅驱动）。

## 6. 判词

**绿：2/2 轮。QUIC（ssm1q）通道整文件传输 496,166B，两端 sha256 对拍全等，AVPlayer
fdSrc 本地播放完整走完（posMs 单调推进至 EOF，completed 22831/22828ms），彩色画面
截图差分成立。**「安卓 q3_serve → 鸿蒙 AVPlayer 可见完整播放」已完成 HTTP 直连路径
（fe_hap_libp2p.md §25/H1）到 CSG QUIC 通道路径的升级，HTTP 通道不再被依赖。

遗留缺口（不阻塞本判词）：①SSM1 容器当前为"单 keyframe chunk 全量载荷"最简封装，
尚未利用 chunk 级 CID/索引做渐进式秒开（mp4 faststart 场景下 moov 前置已够用）；
②鸿蒙 serve→安卓方向、以及 SSM2 混合载荷（深度+mp4 同容器）仍待立项。
