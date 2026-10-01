# 立项：场景流容器 StreamManifest v1

日期：2026-09-08。状态：spec 冻结 v1（演进须修订本文件，不得测试失败后放宽）。
归属：CSG 资产管线（`docs/csg-asset-import-contract.md`）。消费方：CSG 播放器（播放/暂停/倍速/拖拽）。

## 1. 目标

时间轴切片化的场景资产流：一个 manifest 描述有序 chunk 序列（时间区间 + 内容 CID +
载荷位置），播放器按播放头时间定位 chunk、按关键帧 seek。载荷 v1 为不透明字节
（深度网格切片由离线产线后续填充），容器只管时间轴与身份，不解码语义。

## 2. 二进制布局（全部小端）

```
offset 0:  magic[4]        = "SSM1"           # Scene Stream Manifest v1
offset 4:  version: u32    = 1
offset 8:  chunkCount: u32                    # >= 1, 见冻结配额
offset 12: chunk 条目 × chunkCount，每条依次:
             startMs:      i64                # >= 0
             durationMs:   i64                # >= 0
             isKeyframe:   u8                 # 只允许 0 或 1
             cidLen:       u32                # v1 冻结 = 64
             cidHex:       cidLen 字节 ASCII  # 小写 hex 内容 CID
             payloadLen:   i64                # >= 0
             payloadOffset: i64               # >= 0, offset+len <= 文件总长
末尾:      audioTrackRef:
             cidLen:       u32                # 0 = 无音轨; 否则 v1 冻结 = 64
             cidHex:       cidLen 字节 ASCII  # 小写 hex
EOF:       audioTrackRef 结束位置必须恰好等于文件末尾（尾部多余字节显式拒绝）
```

- chunk 条目变长（cidHex 定长 64 但字段保留 cidLen 以便 v2 演进），解析按游标顺序走。
- i64 为 64 位补码小端；读取按两次 u32 组合并正确重建符号（负值随后被范围契约拒绝）。
- 冻结配额（对齐合同 §4 宽整数证明风格）：manifest 文件 ≤ 256MiB；chunkCount ≤ 1,000,000。
  超配额显式拒绝，不截断。

## 3. 语义

- chunk i 覆盖半开区间 `[startMs, startMs+durationMs)`；允许间隙（gap），间隙期间
  播放器保持前一个 chunk 的画面。顺序单调不重叠：`startMs[i] >= startMs[i-1]+durationMs[i-1]`。
- `ChunkIndexForTime(t)`：二分定位「startMs <= t 的最后一个 chunk」；t 早于首 chunk 起点
  返回 -1；t 到达/越过流末尾返回最后一个 chunk（是否已播完由调用方对比总时长判断）。
- `NearestKeyframeIndexForTime(t)`：≤t 的最近关键帧 chunk 索引（关键帧时间 = 该 chunk
  startMs），无则 -1。seek 即从该关键帧 chunk 开始解码。解析期一次性构建前缀
  「最近关键帧索引」数组，查询 O(1)，不做事后启发式扫描。
- payload v1 为不透明字节：容器只校验范围与身份（CID），不解释内容。
- 总时长 = `startMs[last] + durationMs[last]`，解析期派生。

## 4. 错误契约（全部显式 false，无兜底、无部分结果）

| 违反 | 判定 |
|---|---|
| 坏 magic | 前 4 字节 != "SSM1" |
| 坏版本 | version != 1 |
| 截断 | 任一字段读取越过文件末尾（含 cidHex/audioRef 被切） |
| 越界 | payloadOffset < 0 或 payloadLen < 0 或 offset+len 超文件总长（int64 宽域判定防溢出） |
| 超配额 | 文件 > 256MiB 或 chunkCount 越界（0 或 > 1e6） |
| 非法字段 | isKeyframe ∉ {0,1}；chunk cidLen != 64；audio cidLen ∉ {0,64}；cid 含非小写 hex 字节 |
| 时间轴非法 | startMs/durationMs < 0；乱序或重叠；startMs+durationMs 溢出 int64 |
| 尾部垃圾 | audioTrackRef 后仍有剩余字节 |

失败时输出 manifest 保持零值状态（chunkCount=0），不返回半解析结果。

## 5. 交付（files/action/verify/done）

| 项 | 内容 |
|---|---|
| files | `src/game/assets/stream/manifest.cheng`（新增，单一 owner）；`src/tests/csg_scene_stream_smoke.cheng` |
| action | ① 有界读取复用 `reader.AssetReaderLoadBounded`（自定 256MiB 配额）；解析复用 `AssetReaderU32At` 风格，i64 两次 u32 组合；② API：`StreamManifestParse / LoadFile / ChunkCount / ChunkAt / ChunkIndexForTime / NearestKeyframeIndexForTime / TotalDurationMs`，bool+out 参数风格对齐 reader.cheng |
| verify | 冒烟内手工逐字段构造 manifest 字节：解析、t=0/边界/间隙定位、关键帧 seek（含 t 早于首关键帧）、坏 magic/截断/越界等非法输入全部 false；每项 echo PASS |
| done | APFS 锚点克隆（streamdev）上车 cheng_w126_re 编译通过、exe 全 PASS |
