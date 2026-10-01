# 深度预览：SSM1 chunk DPD1 → PGM 灰度图（每 chunk 可成画证明）

日期：2026-09-11。归属：CSG 资产管线。上游：`task_ssm1_pack.md`（DPD1 payload
规格，冻结）；解析复用 `src/game/assets/stream/manifest.cheng`（只读未动）。
消费方：csg_player 光栅化接线（上游线，窗口化 + CPU 光栅化已存在，本任务不动）。

## 1. 目标与结论

证明「每个 chunk 都能变画面」：纯 Cheng 读 SSM1 包内任一 chunk 的 DPD1 深度帧，
归一化为灰度 PGM 落盘，与 Python 参考实现逐字节一致。实战包
（huguangsheng.ssm1，45 chunks 128×256，depthScale=54）chunk 0 / 20 实测通过。

## 2. 管线（src/tools/ssm1_depth_preview.cheng）

```
ssm1_depth_preview.exe <stream.ssm1> <chunkIndex> <out.pgm>
AssetReaderLoadBounded (256MiB 配额)
  → StreamManifestParseEx(embedded)            # payload 区无缝覆盖校验复用 B 线
  → StreamManifestChunkAt(idx)                 # 范围外显式拒绝
  → BytesSliceView(payloadOffset, payloadLen)  # 零拷贝视图, 宽域证明后收窄 int32
  → DPD1 头 36B 逐字段校验
  → w*h 个 uint16 小端深度 (AssetReaderU16At)
  → min/max (raw 域; scale>0 时与实域同序)
  → g = (v-minV)*255/(maxV-minV)               # 定点整数式, 向下取整
  → PGM P5: "P5\n<w> <h>\n255\n" + 灰度字节    # os.WriteFileBytesResult
```

- 灰度公式：实域公式 `g=(v/scale-minV/scale)*255/((maxV-minV)/scale)` 两侧同乘
  正 scale 后与 raw 域定点式恒等，Python 对拍同式逐字节一致（见 §4）。
- DPD1 头校验清单（任一违反显式 ERR 退出 1，无兜底）：magic "DPD1"、version=1、
  depthBits=16、reserved=0、depthScale∈[1,2^31-1]、w,h∈[1,65536]、
  `36 + w*h*2 == payloadLen`（宽域 int64）、`ptsMs == chunk.startMs`（spec §2）、
  平场 `max==min` 拒绝（灰度映射无定义）。
- chunkIndex 解析严格全串（可选负号 + 数字，int32 溢出显式拒绝，`12x` 类不静默截断）。
- 偏移收窄证明：manifest parse 已 enforce 文件 ≤ 256MiB 且 payloadOffset+len ≤ 文件长，
  收窄 int32 前在 int64 域复检。

## 3. 与 csg_player 光栅化对接点（建议，留上游线）

- 公共入口：播放器按 `StreamManifestChunkIndexForTime` / `NearestKeyframeIndexForTime`
  定位后，从 `payloadOffset` 切 `BytesSliceView` 零拷贝视图；本工具的
  `Dpd1ParseHeader`（头校验）+ `AssetReaderU16At(view, 36 + i*2)`（深度读取）即
  最小复用面，建议提炼为共享形态而非复制。
- 深度→画面两条路：
  1. 顶点位移：网格顶点 `z = v / depthScale`（实域深度），生成 mesh 交上游
     CPU 光栅化；256×128 网格每 chunk 一次解析，秒开预算内可行。
  2. 纹理投影：深度作为 r16uint 纹理上传，shader 内 `v / depthScale` 反定点；
     适合与彩色/纹理帧复合。
- payloadCrc32：本工具未验（打包侧 `ssm1_parse_check.py` 已验，D 项位级对拍）；
  建议播放器公共入口统一验一次 CRC 再分发视图，避免每个消费方重复实现
  CRC-32/IEEE。
- 灰度映射可复用为 debug 可视化层（深度→亮度），正式画面走上游光栅化。

## 4. 验证（2026-09-11 真跑）

编译：`cp -cR cheng-lang → cheng-f24/anchor_clones/renderdev`（新文件随克隆带入），
`env -u CHENG_ROOT -u CHENG_PKG_ROOTS -u CHENG_PKG_HOME -u CHENG_GUI_ROOT -u CHENG_IDE_ROOT
/private/tmp/cheng_w126_re system-link-exec --root:<克隆根> --in:<克隆根>/src/tools/ssm1_depth_preview.cheng
--emit:exe --target:arm64-apple-darwin --out:<克隆根>/artifacts/csg_asset_pipeline/depth_preview.exe`
（一次通过，cold_compile 4673ms；未触发重编，无需清 .cheng-csg-core）。

两帧输出（包：streamdev/artifacts/csg_asset_pipeline/huguangsheng.ssm1，sha256
c11e2997…）：

| chunk | frameIndex | ptsMs | w×h | scale | minRaw/maxRaw | 实域 min/max | PGM |
|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 128×256 | 54 | 23168/60011 | 429.04/1111.31 | depth_chunk000.pgm (32,783 B) |
| 20 | 20 | 10000 | 128×256 | 54 | 17206/53359 | 318.63/988.13 | depth_chunk020.pgm (32,783 B) |

`sips -s format png` 转PNG 成功（depth_chunk000/020.png），画面为人物深度剪影，
两帧姿态不同。Python 对拍（struct + numpy 独立解析同包同 chunk）：45 chunk 头
全字段 + CRC32 + payload 区无缝全部有效；两帧参考 PGM 与 Cheng 输出逐字节一致
（`byteEqual=True`，且 sha256 相同：chunk0 = 1d260503…，chunk20 = e10b66cc…）；
`assert min<max` 通过（非平场）。

负例（全部显式 ERR，退出码 1）：

| 输入 | 输出 |
|---|---|
| 5 字节截断包（坏 magic 形态） | `ERR StreamManifest embedded parse failed` |
| 完整文件首字节改 'X' | `ERR StreamManifest embedded parse failed` |
| chunkIndex=-1 | `ERR chunk index out of range: -1 (count=45)` |
| chunkIndex=45 | `ERR chunk index out of range: 45 (count=45)` |
| chunkIndex=abc | `ERR chunkIndex is not a valid int32` |

产物绑定（sha256）：
- `src/tools/ssm1_depth_preview.cheng` = f16dad06a6f14ca942d7b9852ee8e8fd4de4187635be7e278881c8b87a516167
- `renderdev/.../depth_preview.exe` = 581af5b168d348a8882b60111f97f2b4b3bfcb9eb4133194b9999bec8b8bceb0
- `renderdev/.../depth_chunk000.pgm` = 1d26050310ae5d7ac0f0b4fb0a1c008b441d37768a2bb01fc46161731c2bc076
- `renderdev/.../depth_chunk020.pgm` = e10b66cc67450b6133482a5d3059e4f2aa9ad0f014805cf0aefedc75b84f5259

## 5. 边界

只新增：`src/tools/ssm1_depth_preview.cheng`、本文件、renderdev 克隆、
`renderdev/artifacts/csg_asset_pipeline/` 下 PGM/PNG（含 ref/ 参考 PGM）。
manifest.cheng 只读；对拍辅助函数全部在工具文件内；临时脚本/坏包走任务级
scratch（已随命令清理）；未动 git。

## 6. 未解决问题

- payloadCrc32 消费侧未验：工具按任务范围只做头结构校验；CRC 校验归属播放器
  公共入口（见 §3 建议），避免多处实现 CRC-32/IEEE。
- 深度→画面仅到灰度图为止；顶点位移/纹理投影归上游 csg_player 光栅化线。
- 实测包 depthScale=54（本批 auto 推导），灰度映射对 scale 无假设（正缩放即等价），
  但包内若出现 scale≤0 依赖头校验显式拒绝，无静默路径。
