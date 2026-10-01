# CSG语义视频 B1 互操作对拍报告（独立参考解码器，纯 Cheng）

日期：2026-09-16。结论先行：**互操作对拍 PASS**（rc=0）。独立第二实现为纯 Cheng 的 `src/tools/sv_ref_decoder.cheng`；实现依据只有两份规范文档，未复用生产解析器 `src/core/csg_core/csgc.cheng` 的任何解码函数（独立实现 LEB128、header/directory/字典/事实节解析、section digest 与 claimed directory CID 重算），仅依赖 std 原语（SHA-256、字节缓冲），不 import 任何 `cheng/core/csg_core` 模块。

## 1. 输入绑定

```text
fixture = docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/b1_sample.svblock
bytes   = 4087
sha256  = 796a97dd44d59eece8143d209f5ed24d8f4dc0a33ad04e1f088a3971df9137b2
写入端自报：factCount=12
  contentId           = sha256:ab06b69acf38ebbc362a25cda790fa3b34c31eba15e708705e6b8614160f8882
  claimedDirectoryCid = sha256:3d40a52b198d228d6ca38bce35feb83e20f0769e9783b44e9723b4ae99f3315c
```

## 2. 命令

```sh
artifacts/bootstrap/cheng.stage3 system-link-exec \
  --root:/Users/lbcheng/cheng-lang \
  --in:/Users/lbcheng/cheng-lang/src/tools/sv_ref_decoder.cheng \
  --emit:exe --target:arm64-apple-darwin \
  --out:.scratch/sv_b1/refdec
.scratch/sv_b1/refdec; echo "rc=$?"
```

## 3. 原始输出（全文）

```text
facts=12
sections=11
dictionary=41
directory_cid=sha256:3d40a52b198d228d6ca38bce35feb83e20f0769e9783b44e9723b4ae99f3315c
content_id=sha256:ab06b69acf38ebbc362a25cda790fa3b34c31eba15e708705e6b8614160f8882
 sv_ref_decoder ok
rc=0
```

## 4. 对拍项与结论

| 对拍项 | 结果 |
|---|---|
| header：magic/header_size=64/flags=0/compressed=0/reserved 44B 全零/body_original=4087−64 | PASS |
| 目录区：directory_size=796 覆盖前导+全部目录项，11 节（1 字典 41 项 + 10 事实节），kind 字节升序 | PASS |
| payload 紧邻无 gap/overlap，末节恰达 body 尾 | PASS |
| 11 节 section digest 独立重算逐节对拍（含字典节） | PASS |
| claimed directory CID 独立重算 = 自报（逐字节） | PASS |
| 事实行还原 12 条；fact_count/节 item_count/逐节计数一致；字典 41 项无未使用 | PASS |
| kind 分布 manifest1/entity1/observation1/assertion2/snapshot1/delta2/correction1/dependency1/revision1/receipt1 | PASS |
| 每行 schema=csg_semantic_video::v0.1、顶层键序=字节升序 | PASS |
| manifest contentId = 自报 | PASS |
| 负对照：翻转最后一个非零字节后末节 digest 重算必须失配（判别力自检） | PASS（检出） |

开发期暴露并修正的解码器自身缺陷（均为第二实现侧理解偏差，恰好证明对拍有效）：payload 偏移未加 64B header、字典/事实计数误按 varuint（实为定宽 u32）、目录 CID 前缀中 u16 字段跨位读取、kind 首键行标记匹配。

## 5. 口径说明

- JSON number 拼写：核心 canonicalizer 对整十幂/短系数大数输出科学计数法（90000→9e4、900000→9e5、9000→9e3）。`docs/specs/csg-semantic-video-v0.1.md` §3 的"仅 canonical 十进制整数"指值域为整数（不含分数/浮点字段），拼写从核心 canonical 形；规范文字已同步澄清，本对拍按值相等口径判定。
- 未纳入本轮对拍：节内 Patricia 物理序与字典收录收益公式（写入端规则，属于生产打包层而非字节合同的可观测面）。

## 6. 语言栈声明

应"纯 Cheng 实现、不引入其它语言栈"的要求：本对拍的实现为纯 Cheng（`src/tools/sv_ref_decoder.cheng`）；此前的 Python 草稿解码器与 Python 夹具生成脚本已从 `tools/` 移除，未参与本报告结论。媒体夹具生成使用外部平台工具 ffmpeg/ffprobe（可复现命令已文档化于 `media_fixtures.md`，工具不入仓、不进生产语义路径）。
