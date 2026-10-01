# A1 冻结样例清单

日期：2026年9月16日。SHA-256 与媒体属性为冻结时点实测（shasum -a 256 / ffprobe）。样例只进入测试与验收，不进入生产语义路径；路径相对仓库根。

## 真实存量片

| 样例 | SHA-256 | 大小 | 属性 |
|---|---|---|---|
| `src/tests/real_media_assets/hgs_faststart.mp4` | `da1d2d7bd1fada3b4cbfd159edb67008b232497bc56fb53308ac9199de1e73f0` | 588736 B | h264 1304x2320 30fps，timebase 1/1000000，start 0；aac 44100Hz |
| `src/tests/network_milestone_assets/sample.mp4` | `e3f510bde0950db20fef19a27ddf5033f420fad7e481527a8bb2dfb0396ab77e` | 15610 B | h264 320x570 12fps，timebase 1/12288，start 0，时长 1.166667s |
| `ts-csg/fixtures/media/unimaker-default-video-2frame.mp4` | `65f2e11c133e12d43ad37589e7a70d9d00f5a876f3cc90cb49cdcaa5978a0c3b` | 2077 B | h264 16x16 25fps，timebase 1/12800，时长 0.04s（2帧边界样例） |
| `artifacts/csg_asset_pipeline/movie/source.mp4` | `3a22909a075d064bc8e5566f9016ec0d2354c2b455868589c1a0b2624c7b11a9` | 211776546 B | 长片压力样例（202MB）；仅用于分窗读取测试，不整片载入内存 |

## 边界用途

- `sample.mp4` timebase 1/12288 与 `hgs_faststart.mp4` 1/1000000 构成非同名义时间基对照；B1 时间换算测试用两者验证 int64 tick + 有理 timebase 防溢出。
- 2帧样例验证最小编解码往返；长片验证有界窗口读取（§八 内存表"读取/解码"相）。

## 尚缺样例（A2 后补齐，不假装已存在）

- VFR、B帧、非零起点、长时轴、音频填充专项边界样例（§九 媒体边界组）：待 A2 冻结生成脚本后产出并补录哈希。
- 实采 RGB/深度+音频（原生采集组）：待 C1 设备核验后采集。
- 人工真值标注（语义有效验收）：待冻结标注规程后建立。

以上缺项对应验收组不得用现有样例冒充通过。
