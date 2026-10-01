# chunked_progressive_ssm1.md — base.mp4 多 chunk 索引化：仅首 chunk 起播就绪 + 首屏字节量化（2026-09-20）

判词：**绿**。base.mp4（496,166B，sha256=927b37e6…11eb8）的 SSM1 传输从"单 chunk 全量收完才能播"
升级为**多 chunk+索引表**：8 chunks × 64KiB（尾 37,414B），headerLen=824B，**首 chunk 65,536B 内含
ftyp+moov+mdat 首段 = 起播就绪前缀**。Mac 侧三重证据全过：①仅 65,536B 前缀 ffprobe rc=0 识别
h264+aac 双轨、时长 22.5s（与全量元数据逐项一致）；②前缀独立解码出首帧 PNG（胡广生标题卡）且可
连续解码 50 帧（0→1.66s）；③逐 chunk sha256==cid 全过、拼回全量与源逐字节等。安卓 4452 自起
q3_serve 实例（机上真 Cheng 解析器 parse 回执 chunks=8 kfRange=[824,66360)），Mac fetch 实拉回执
**manifest 824B + 首 chunk 65,536B 即断言全过**（sha256-match=f66dc5de…），serve 侧 conn=1 served=2。
**首屏字节收益：65,536 / 496,166 = 7.57×**（线上口径 66,360B vs 496,283B = 7.48×）。
真机渐进起播待 HAP 接线（HAP 本轮他线独占，未改未装机）。

## 1. box 顺序核验（无需 faststart 派生件）

python 解析（.scratch/cpx1/build_indexed.py，无外部工具）：

```
ftyp off=0      size=32      end=32
moov off=32     size=25805   end=25837   (mvhd + trak×2 + udta)
free off=25837  size=8       end=25845
mdat off=25845  size=470321  end=496166
```

**moov 在前 = 原生 faststart，直接分块，未产出 hgs_base_faststart.mp4 派生件**（如实标注：无派生，
载荷哈希与源一致 927b37e6…11eb8）。轨道样本表：video avc1 timescale=15360 675 样本
（首样本=首关键帧 stss sync#1，off=25853 size=3,099B）；audio mp4a timescale=44100 970 样本
（首样例 off=29093 size=23B）。**首关键帧止于 28,952B、音频首样例止于 29,116B，均在 64KiB 首 chunk 内。**

## 2. 多 chunk SSM1 索引格式（供 HAP 接线线直接用）

冻结合同零改动（src/game/assets/stream/manifest.cheng，SSM1 v1 embedded 形态），"索引表"即合同
既有 chunk 表的最小增量用法——从 1 条变 N 条：

```
header（全小端）: "SSM1" + ver u32=1 + chunkCount u32
  + N × chunk 条目(101B): startMs i64 + durationMs i64 + isKeyframe u8
                        + cidLen u32=64 + cid 64B 小写hex + payloadLen i64 + payloadOffset i64
  + audioRef u32（0=无音轨引用；本容器音轨在 mp4 载荷内）
payload 区: chunk 按序从 headerLen 起无缝恰好覆盖至 EOF（解析器硬校验）
headerLen = 12 + 101×N + 4   # 本容器 N=8 → 824B
```

- **chunk 大小 64KiB 自选理由**：①首 chunk 需容下 25,845B 容器头前缀 + mdat 首段（首关键帧 GOP），
  64KiB 实测余量 36.4KiB；②manifest 开销 101B/条 ≈ 0.15%，8 条仅 808B；③与既有 45-chunk DPD1
  先例（胡广生.ssm1 均值 ~65.7KiB/chunk）同量级；④粒度足够渐进补流 + 逐 chunk 完整性校验。
- **首 chunk 起播条件**：isKeyframe=1 且含 ftyp+moov 完整 + mdat 首段（moov 提供全部样本表；
 mdat 首段含首视频关键帧与音频首样例）。
- **时间字段口径（如实）**：字节域 chunk 不与时间轴天然对齐，startMs/durationMs 取名义均分
  （0..22,500ms，7×2,812+2,816），仅供解析器单调性校验与 totalDurationMs；真实时间线在 chunk0 的
  moov，seek 走 moov 样本表 + 按字节 offset 取 chunk，不按 startMs。
- **cid 语义**：每 chunk cid = 该 chunk 载荷 sha256 hex（fetch 端断言 sha256(chunk)==cid[kf]）；
  chunk 载荷 == 源 mp4 同区间字节，故拼回 = 源。

### 实际 chunk 表（hgs_base_indexed.ssm1，sha256=de90b29c5edb3b72…，496,990B）

| # | startMs | durMs | kf | containerOff | len | cid 前 16 |
|---|---|---|---|---|---|---|
| 0 | 0 | 2812 | 1 | 824 | 65536 | f66dc5dec2677790 |
| 1 | 2812 | 2812 | 0 | 66360 | 65536 | f004cfd27b03a68d |
| 2 | 5624 | 2812 | 0 | 131896 | 65536 | 3de71a22596d14d4 |
| 3 | 8436 | 2812 | 0 | 197432 | 65536 | 0f4816933c34f975 |
| 4 | 11248 | 2812 | 0 | 262968 | 65536 | 7a990fec3451ea7b |
| 5 | 14060 | 2812 | 0 | 328504 | 65536 | 63dca076d7f076ab |
| 6 | 16872 | 2812 | 0 | 394040 | 65536 | 6896ddd47dfd37a3 |
| 7 | 19684 | 2816 | 0 | 459576 | 37414 | 9b5de0bf5fde0385 |

（containerOff − 824 = mp4 源字节 offset；HAP 渐进接线：先收 chunk0 → 落 65,536B 前缀给
AVPlayer/fd 起播 → 按 offset 顺序补 chunk 追加，每 chunk 用 cid 校验后落盘。）

## 3. Mac 渐进证据（核心判据）

1. **仅首 chunk 可识别**：`ffprobe` 输入 chunk0_prefix.mp4（= 容器 [824,66360) = 源前 65,536B）：
   rc=0，`codec_name=h264`(video) + `codec_name=aac`(audio)、nb_streams=2、`duration=22.500000`、
   `format_name=mov,mp4,m4a,3gp,3g2,mj2` —— 与源全量 ffprobe 逐项一致
   （ffprobe_prefix.txt / ffprobe_source.txt）。起播就绪=容器级元数据+首 GOP 齐备。
2. **仅首 chunk 可起播解码**：`ffmpeg -i chunk0_prefix.mp4 -frames:v 1` rc=0 出
   chunk0_frame0.png（47,268B，sha256=92869b9d6fe6c4f9…，画面=《胡广生》标题卡任素汐）；
   前缀内可连续解码 **50 帧（time=0→1.66s）**，其后报错点=前缀截断边界（"Error splitting the
   input into NAL units"=数据尽头，非损坏）。截帧用 ffmpeg（与 ffplay 同 libav 解码路径，无头
   环境取帧的等价工具；ffplay 在机可用但窗口形态不适合取证）。
3. **逐 chunk 完整性**：8/8 chunk sha256==cid 全过（python 镜像 manifest.cheng 合同回读解析：
   magic/ver/count/时间轴单调/无缝恰好覆盖，PASS）。
4. **拼回等价**：8 chunk 载荷按序拼接 == 源 base.mp4 逐字节相等（496,166B）。
5. **真通道交叉证据**：Mac fetch 客户端（ssm1_moq_fetch，本任务 stage3 编译，
   sha256=b361985ef9abc0a3…）实收 chunk0 的 sha256 断言值 f66dc5dec2677790… == Mac 侧
   chunk0_prefix.mp4 哈希 —— ffprobe/解码证据的字节与线上传输字节同一。

## 4. 安卓 serve 回执（4452 自起实例，4443 现场零扰动）

```
adb push hgs_base_indexed.ssm1 /data/local/tmp/   # 机上 sha256sum == de90b29c… == Mac 盘上件
serve pack=/data/local/tmp/hgs_base_indexed.ssm1 fileLen=496990 chunks=8 headerLen=824 kfChunk=0 kfRange=[824,66360)
serve listening /ip4/0.0.0.0/udp/4452/quic-v1
conn=1 served=2 totalServed=2 manifest=824B chunk=65536B   # 对端 /ip4/192.168.1.8（Mac fetch）
```

- **serve 代码零改动**：复用 pid 同款 q3_serve，多 chunk 容器 parse/下发由既有 SSM1 合同直接支持
  （45-chunk DPD1 先例同构），无需 serve 端多 chunk 改动——评估结论：**最小改动 = 0**。
- Mac fetch 实拉（1 轮）：`fetch ok chunks=8 kfChunk=0 manifest=824B chunk=65536B
  sha256-match=f66dc5dec2677790…`；**ready→首帧就绪 114ms**（首连 dial 1.67s 为冷启动主导，
  非本判据口径）。
- 受保护现场未动：q3_serve pid 7287（4443，hgs_base.ssm1）全程存活在线；本任务实例 pid 3570
  （4452）与之共存，实例按任务留机在线供 HAP 接线复用。

## 5. 首屏字节量化

| 口径 | 单 chunk 旧容器（base_ssm1_transfer） | 多 chunk 新容器（本任务） | 收益 |
|---|---|---|---|
| 起播所需载荷字节 | 496,166B（全量） | **65,536B（chunk0）** | **7.57×** |
| 线上传输字节（manifest+首 kf chunk） | 117+496,166=496,283B | 824+65,536=**66,360B** | 7.48× |
| 首帧就绪位置 | 全量收完后（fetchMs 2568–3467 后） | 首 chunk 收完即就绪（Mac 实测 ready→首帧就绪 114ms） | 首帧不再等全量 |

## 6. 产物与证据登记

| 产物 | sha256 前 16 | 大小 |
| --- | --- | --- |
| artifacts/csg_asset_pipeline/huguangsheng/v2/hgs_base_indexed.ssm1 | de90b29c5edb3b72 | 496,990B（=安卓机上件，逐字节同哈希） |
| .scratch/cpx1/chunk0_prefix.mp4（=chunk0 载荷=源前 65,536B） | f66dc5dec2677790 | 65,536B |
| .scratch/cpx1/chunk0_frame0.png（前缀首帧） | 92869b9d6fe6c4f9 | 47,268B |
| .scratch/cpx1/ssm1_moq_fetch（darwin fetch 客户端，stage3 编译） | b361985ef9abc0a3 | 18,179,440B |
| .scratch/cpx1/build_indexed.py（构建+回读校验+拼回脚本） | — | — |
| .scratch/cpx1/{ffprobe_prefix,ffprobe_source,ffmpeg_count}.txt、receipt.json、serve_4452.log | — | — |

登记注记：.scratch/cpx1 已按纪律尝试 disk_guard 注册，返回 75（锁被其它 lane 活跃 guard 持有；
既有 bs1/bs2 等任务目录同样未入租约表），目录体量 ~2MB 自含边界，不阻塞。

## 7. 边界与遗留（如实）

1. **本判据口径 = Mac 端 ffprobe/ffmpeg 起播就绪证据 + 真通道（安卓 serve/Mac fetch）chunk0
   下发回执。真机（鸿蒙）渐进起播待 HAP 接线**——HAP 本轮他线独占，零改动零装机。接线要点
   （§2 索引格式即交付面）：现 HAP fetch 双断言（chunkLen==payloadLen 且 sha256==cid[kf]）对本
   容器**语义兼容**（chunk0 即 kf chunk，断言对象自动变为 65,536B/cid0），但"落 65,536B 即起播 +
   后续 chunk 渐进追加"需 HAP 落盘/播放策略增量（AVPlayer 对截断 mp4 的起播与边下边播形态由
   接线轮实证，本轮不预记 PASS）。
2. 名义时间片口径见 §2（seek 不依赖 chunk startMs）。
3. 本任务零主树 src 改动；新增产物仅容器（artifacts/）与本证据目录。
