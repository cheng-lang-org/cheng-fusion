# base_ssm1_transfer.md — base.mp4 SSM1 容器跨机传鸿蒙 + AVPlayer 完整可见播放（2026-09-19）

判词：**全链 PASS（2/2 轮）**。base.mp4（496,166B，sha256=927b37e6…）经最简 Cheng 工具
包装为 SSM1 v1 embedded 容器（恰 1 个 keyframe chunk，载荷=mp4 全量字节）→ 安卓
q3_serve（QUIC MoQ 4443）→ 鸿蒙真机 RECEIVE（ssm1q fetch）→ **HAP 落盘文件字节级一致**
（cheng fetch 端 sha256==cid 双断言 + JS 端文件 sha256 独立复核，均 == 源 mp4 sha256）
→ **AVPlayer fdSrc 播放收到的沙箱文件，屏幕可见彩色胡广生画面，2 轮均完整播放至 EOF**
（durationMs=22501，completed @22898/22832ms）。serve 端零 ERR。

## 0. 设计要点

SSM1 容器 = 单 keyframe chunk（startMs=0, durationMs=22500, isKeyframe=1,
cid=sha256(mp4) hex, payloadLen=496166, payloadOffset=117, audioRef=0）。
q3_serve 语义下 stream8 推送的首关键帧段 = [117, 496283) = **mp4 全量字节**——
fetch 端既有双断言（chunkLen==payloadLen 且 sha256==cid）即 mp4 字节级完整性证明，
无需改 serve/fetch 协议。落文件缺口由新 NAPI 导出 `ssm1qAssembledWriteFile(path, skip)`
补（组装缓冲跳过 117B 头写沙箱），鸿蒙侧 JS 对落盘文件做大小+sha256 独立复核后才进 AVPlayer。

## 1. 包装工具（Cheng，新文件 src/tools/ssm1_wrap_mp4.cheng）

```
./artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang \
  --in:/Users/lbcheng/cheng-lang/src/tools/ssm1_wrap_mp4.cheng --emit:exe \
  --target:arm64-apple-darwin --out:.scratch/bs1/ssm1_wrap_mp4     # rc=0
.scratch/bs1/ssm1_wrap_mp4 artifacts/csg_asset_pipeline/huguangsheng/v2/base.mp4 \
  .scratch/bs1/hgs_base.ssm1 22500                                 # rc=0
```
```
wrap ok in=artifacts/csg_asset_pipeline/huguangsheng/v2/base.mp4 out=.scratch/bs1/hgs_base.ssm1
mp4Len=496166 fileLen=496283 headerLen=117 chunks=1 kfChunk=0 kfRange=[117,496283)
durationMs=22500 cid=927b37e61b33187bd07a43ae8395be44999cd13e793ff50f1c9319f5d8c11eb8
```
绿：工具内 StreamManifestParseEmbedded 回读自证过；独立 python 复核
（magic/ver/chunk 表/audioRef/payload==mp4 逐字节/EOF 恰好覆盖）全 True。
产物 sha256：hgs_base.ssm1 = c91f3416df4374929…（496,283B）。

## 2. 安卓 serve（GBJ0222B24021692，192.168.1.6）

```
adb push .scratch/bs1/hgs_base.ssm1 /data/local/tmp/hgs_base.ssm1   # 1 file pushed
adb shell "cd /data/local/tmp && ./q3_serve /data/local/tmp/hgs_base.ssm1 4443"
```
```
serve pack=/data/local/tmp/hgs_base.ssm1 fileLen=496283 chunks=1 headerLen=117 kfChunk=0 kfRange=[117,496283)
serve listening /ip4/0.0.0.0/udp/4443/quic-v1
conn=1 served=2 totalServed=2 manifest=117B chunk=496166B
conn=2 served=2 totalServed=4 manifest=117B chunk=496166B
```
绿：q3_serve 载包解析（embedded 无缝覆盖校验）过；两连接各 served=2、零 ERR；
对端 /ip4/192.168.1.2（鸿蒙）实证。

## 3. 鸿蒙侧改造（3KN0224C18003262）

- NAPI shim 构建期副本（.scratch/bs1/napi_build/ssm1_napi_shim.c，仓内 UniMaker 源零改动）
  新增 `ssm1qAssembledWriteFile` 导出；重链配方 = fk_link_so.sh 同款
  （fk 全套 obj：shim_ohos/ssm1d/ssm1q/sv/csg_play/psb/psh/dbg，2026-09-19 代际）。
  libssm1napi.so = 58,632,992B，LOAD align 全 0x4000，必需导出全 defined，sha256 前缀
  fb4c0ae3a49ca286。
- Index.ets（授权目录内）：receiveFinish 重写 = fetch sha 断言 → 落文件 → 大小+JS
  sha256 复核 → AVPlayer fdSrc 播放收到的文件；新增 PLAYPOS 2s 节拍取证；DPD1 灰度
  播放路径不再走（mp4 非 DPD1，判据不满足即 FAIL，无降级）。
- hvigor assembleHap（BUILD SUCCESSFUL 27.7s）+ `hdc install -r` 成功；
  装机 HAP sha256 前缀 f0ed1b34f5b60420。

## 4. 真机执行证据（hilog 原文，A0A5F1/com.example.unimaker/SSM1）

轮 1（20:32:05 点击 RECEIVE）：
```
fetch_start host=192.168.1.6 port=4443 → resp=OK fetch started
fetch stage=1 elapsedMs=152 / stage=7 elapsedMs=1807 / T_FETCH done fetchMs=2562
T_FETCH asserts fetchOk=true shaMatchSource=true fetchMs=2565
T_FETCH_WRITE total=496283 skip=117 written=496166 path=/data/storage/el2/base/haps/ssm1smoke/files/hgs_fetch.mp4
T_FETCH_WRITE resp=OK written=496166 skip=117 total=496283 OK assembled fileLen=496283 headerLen=117 kfChunk=0 kfOff=117 kfLen=496166
T_FETCH_FILE size=496166 sizeOk=true sha=927b37e61b33187bd07a43ae8395be44999cd13e793ff50f1c9319f5d8c11eb8 shaOk=true
BASE_SSM1 RECEIVE PASS click->file-verified totalMs=2610 (fetchMs=2565 writeHashMs=45)
T_VIDEO src=fetched-file set surfaceId=6236292527448
T_VIDEO prepared ms=157 durationMs=22501
T_VIDEO first-play ms=184
PLAYPOS posMs=1808 → 3719 → 5739 → … → 19749 → 21765 (2s 节拍单调推进, durMs=22501)
T_VIDEO completed totalMs=22898
```
轮 2（20:34:20 点击）：
```
T_FETCH asserts fetchOk=true shaMatchSource=true fetchMs=2114
T_FETCH_WRITE total=496283 skip=117 written=496166 (同路径覆盖写)
T_FETCH_FILE size=496166 sizeOk=true sha=927b37e6… shaOk=true
BASE_SSM1 RECEIVE PASS click->file-verified totalMs=2159 (fetchMs=2114 writeHashMs=45)
T_VIDEO prepared ms=118 durationMs=22501 → first-play ms=140 → completed totalMs=22832
```
绿判据逐项：
1. HAP 收到 base.mp4 完整字节：cheng fetch 双断言（chunkLen==496166 且
   sha256==cid）+ JS 落盘文件 sha256==927b37e6…（== 源）双证据，两轮一致。
2. AVPlayer 可见播放：轮 1 PLAYPOS 全程单调推进至 EOF（completed）；轮 2 同。
3. 彩色画面截图差分：见 §5。

## 5. 截图差分（.scratch/bs1/，snapshot_display 原生 1316x2832）

| 文件 | 时点 | sha256 | 视频区量化（crop 240,1790–1080,2470） |
| --- | --- | --- | --- |
| bs1_app.jpeg | 点击前基线 | 9b01ab52cfd878f9… | meanRGB(0,0,0) uniqColors=1（纯黑） |
| bs1_p1.jpeg | 轮1 pos≈11.8s（源片暗场段） | 729c801ed9b19991… | meanRGB(3,3,3) uniqColors=563（暗场+"@任素汐"字幕，与源 t=12s 帧同段） |
| bs1_p3.jpeg | 轮1 EOF 后末帧 | 43b12c6c4c4ea0c6… | 末帧停帧 |
| bs1_c1.jpeg | 轮2 pos≈2s（录音棚彩色场景） | 85f454ee5f8cfe28… | meanRGB(33,32,30) colorfulRatio=0.082 uniqColors=19472（任素汐演唱彩色画面，对照源 t=1s 抽帧 src_t1.jpg） |
| bs1_c2.jpeg | 轮2 pos≈4s | d0b8041c79ba49c0… | 彩色画面第二帧 |

基线（纯黑/1 色）→ 播放帧（19,472 色）差分成立；画面内容与源 mp4 对应时间点帧
一致（ffmpeg 抽帧对照 src_t1/src_t12.jpg 在案）。

## 6. 产物与状态登记

| 产物 | 形态 | sha256 前缀 / 大小 |
| --- | --- | --- |
| src/tools/ssm1_wrap_mp4.cheng | Cheng 工具（主树新文件） | — |
| .scratch/bs1/ssm1_wrap_mp4 | darwin exe | 4e99a0a242c61af8 |
| .scratch/bs1/hgs_base.ssm1（=安卓 /data/local/tmp/hgs_base.ssm1） | SSM1 容器 496,283B | c91f3416df437492 |
| libssm1napi.so（ssm1smoke jniLibs，构建副本含 ssm1qAssembledWriteFile） | NAPI .so 58,632,992B | fb4c0ae3a49ca286 |
| ssm1smoke-default-signed.hap（已装机） | HAP 136,289,160B | f0ed1b34f5b60420 |
| 截图证据 7 张 | .scratch/bs1/*.jpeg | §5 |

现场状态：安卓 q3_serve 仍在线 serve hgs_base.ssm1（4443，后续轮可复用）；鸿蒙
装机为 base_ssm1_transfer 版 HAP（RECEIVE 指向 192.168.1.6:4443，落文件+AVPlayer
播放形态）；hgs_fetch.mp4 留存 HAP 沙箱 files/。

## 7. 判词

**安卓 q3_serve（SSM1 容器）→ 鸿蒙真机 fetch → 字节级落盘（sha256==源）→
AVPlayer 屏幕可见彩色完整播放，2/2 轮 PASS。** 无降级、无兜底：fetch sha 断言、
落盘大小断言、JS sha256 复核任一失败即显式 FAIL（该路径本轮未触发）。
