# ssm2_hybrid_container.md — SSM2 混合载荷容器：base.mp4（像素）+ hgs_l2_planes.svblock（CSG 语义平面）一次传输（2026-09-20）

判词：**绿（Mac 全链 + 安卓真机全链）**。SSM2 v1 复合容器
`artifacts/csg_asset_pipeline/huguangsheng/ssm2/hgs_ssm2.ssm2`（**582,340B，
sha256=`1eb20a17e77cb2b8…`**）内嵌双载荷：`video/mp4` 496,166B
（`927b37e6…`）+ `application/x-csg-svblock` 85,960B（`f240fe88…`）。
Mac 侧构建→解封→逐载荷 sha256 对拍（==源）→svblock 喂 validator 绿→mp4/svblock
与源 `cmp` 逐字节等，负例 10/10 拒收；安卓真机（DCO-AL00）当代树重编驱动**机上解封
同绿**（validator ok + 对机上源件 cmp 双字节等）；q3_serve 以 4451 独立实例
serve SSM2 容器（冻结 SSM1 传输封套承载），Mac fetch 2/2 轮
`chunk=582340B sha256-match=1eb20a17…`，serve 回执零 ERR。深度载荷（DPD1）
盘上无冻结容器件，本轮双载荷落地，如实标注。

## 0. SSM2 v1 格式（最小增量设计，冻结合同）

设计约束：①自描述复合 manifest（载荷数 + 各载荷 kind/字节数/sha256/偏移）；
②**不改** schema.cheng 既有 11 记录类型（svblock 是输入）；③传输复用既有冻结
q3_serve/ssm1q 通道（F-H4c：载包合同排他 SSM1 魔数），SSM2 以自有魔数独立成格式，
经 SSM1 单关键帧封套承载（封套只管传输，语义容器是 SSM2）。

布局（全小端）：

```
u8[4] magic = "SSM2"
u32   version = 1
u32   payloadCount = N (1..64)
N 条目 (每条 kindLen+84 字节):
  u32    kindLen (1..128)
  u8[kindLen] kind (ASCII, MIME 形)
  i64    byteLen (>=1)
  u8[64] sha256 (载荷字节 sha256, 64 小写 hex = 载荷内容 CID)
  i64    offset (载荷在容器内绝对偏移)
载荷区: 按条目顺序无缝拼接, offset[0]=条目区末, 末条终点==EOF
容器总长 <= 256MiB (与 SSM1 manifest 配额同源)
```

本容器实侧：headerLen=214，payload[0] offset=214，payload[1] offset=496,380。

## 1. 工具（新文件，两条独立实现互证）

| 件 | 说明 | sha256 前 16 |
| --- | --- | --- |
| `tools/ssm2_pack.py` | 构建器（python）：kind:path 列表 → SSM2；构建后独立回读自证；**字节确定**（同输入二次构建哈希全等，pack_recheck.out） | fc4c1f7f052fa52f |
| `src/tools/ssm2_unseal.cheng` | 解封验证器（Cheng，darwin+android 双平台同一源）：严格解析（任一非法显式失败非零退出）→ 逐载荷 sha256 与容器 cid 逐字节对拍 + expected 参数对拍 → svblock kind 喂 `validator.SvValidate` 全量规则 → 载荷落盘 | 4df83b432575f771 |
| `.scratch/ssm2/ssm2_unseal` | darwin arm64 exe（cheng.stage3 `05af823e…`，rc=0） | 7cf70ee7630d11e4 |
| `.scratch/ssm2/ssm2_unseal_android` | aarch64-linux-android PIE exe（PB 配方：obj+cheng_prog_main 改名+shstrtab 修复；**psb/psh/dbg 按当代树重编**——program_support_backend.cheng 9/19 23:21 晚于旧 objs；stdio/rss 桥复用 PB 物料；llvm-nm undefined 恰 127 项全 bionic API28，cheng 侧残余=0） | 89886b5ff80105a6 |

## 2. Mac 全链（绿）

构建（§1 packer）→ 解封（darwin exe，expected 双哈希入参）：

```
payload[0] kind=video/mp4 bytes=496166 offset=214
  sha256=927b37e61b33187bd07a43ae8395be44999cd13e793ff50f1c9319f5d8c11eb8
  cidMatch=1 expectedMatch=1 svblockValidator=n/a
payload[1] kind=application/x-csg-svblock bytes=85960 offset=496380
  sha256=f240fe8832cd29de625402a4a374236f9364bc4b269dbca249643e8f52944599
  cidMatch=1 expectedMatch=1 svblockValidator=ok
ssm2 ok payloads=2 headerLen=214 fileLen=582340
  containerSha256=1eb20a17e77cb2b8c57045939af6e20fc19dc6cb091021a08d74fbcaf90ee629
```

- svblock validator 绿：`svblockValidator=ok`（= `validator.SvValidate` §2/§4/§9
  全量规则，error 路径本轮未触发）。
- 独立对拍（越出工具断言）：`cmp` 提取件 vs 源 → `MP4_BYTE_EQUAL` /
  `SVBLOCK_BYTE_EQUAL`；`shasum` 提取件 == 源哈希（unseal_mac.out + shell 复核）。
- 负例 10/10 拒收（negative.sh/negative.out）：magic 破坏、version 破坏、载荷字节
  翻转、截断、尾部垃圾、payloadCount 虚增、svblock 载荷翻转、expected 不匹配、
  expected 个数不符、kindLen 超界——每例非零退出且错误码精确
  （`ERR magic`/`ERR version`/`cidMatch=0`/`ERR payload_range`/`ERR eof_garbage`/
  `ERR expect_count`/`ERR kindlen_range`）。

## 3. 安卓真机（DCO-AL00 / GBJ0222B24021692，192.168.1.6）

机上解封（当代树驱动，容器 `/data/local/tmp/hgs_ssm2.ssm2` 机上
sha256sum==`1eb20a17…` 与 Mac push 件一致）：

```
payload[0] … cidMatch=1 expectedMatch=1 svblockValidator=n/a
payload[1] … cidMatch=1 expectedMatch=1 svblockValidator=ok
ssm2 ok payloads=2 headerLen=214 fileLen=582340 containerSha256=1eb20a17… UNSEAL_RC=0
927b37e6…  /data/local/tmp/ssm2_out/payload_0.bin
f240fe88…  /data/local/tmp/ssm2_out/payload_1.bin
MP4_ONDEV_BYTE_EQUAL   (cmp vs /data/local/tmp/hgs_base.mp4)
SVB_ONDEV_BYTE_EQUAL   (cmp vs /data/local/tmp/hgs_l2_planes_android.svblock)
```

即机上验证升到六路对拍：Mac 源 == 容器 cid == 机上容器 sha256sum ==
机上提取件 sha256 == 机上既有 mp4/svblock 源件 cmp 字节等。

## 4. serve 腿（q3_serve 4451 独立实例 + Mac fetch 2/2）

传输封套：`.scratch/bs1/ssm1_wrap_mp4`（= base 线登记同件 4e99a0a242c61af8）包
SSM2 容器 → `hgs_ssm2.ssm1` 582,457B（sha256=`c55de971100fc039…`，cid=容器哈希
`1eb20a17…`，恰 1 kf chunk，kfRange=[117,582457)）。封套是纯传输壳：取回字节即
SSM2 容器本体，serve/fetch 协议零改动（SSM2 hybrid 原生 serving 仍属 §22.2 另案）。

serve 端（4451，按轮起停，未触 4443 现场进程 3570/7287）：

```
serve pack=/data/local/tmp/hgs_ssm2.ssm1 fileLen=582457 chunks=1 headerLen=117
serve listening /ip4/0.0.0.0/udp/4451/quic-v1
conn=1 served=2 totalServed=2 manifest=117B chunk=582340B
conn=2 served=2 totalServed=4 manifest=117B chunk=582340B    （ERR=0 行）
```

fetch 端（Mac，`.scratch/fh/mac_fetch`（F-H 代 darwin 件，sha256 前缀
332e69c77210e4a5），轮前先对 4443 基线做 canary 一轮
`sha256-match=927b37e6…` 证工具活性）：

```
r1/r2: fetch ok chunks=1 kfChunk=0 manifest=117B chunk=582340B
       sha256-match=1eb20a17e77cb2b8c57045939af6e20fc19dc6cb091021a08d74fbcaf90ee629
```

两轮 chunk 字节 582,340 == SSM2 容器字节数，sha256 三方全等
（Mac 容器 == 机上容器 == fetch 断言）。取回对象解封已在 §2/§3 双机证毕
（同哈希传递闭合）。

## 5. 证据与产物清单（.scratch/ssm2/）

| 件 | 说明 |
| --- | --- |
| pack.out / pack_recheck.out | 构建回执 + 字节确定性复核 |
| unseal_mac.out | Mac 解封全链判定输出 |
| negative.sh / negative.out | 负例 10 例 + 全拒收回执 |
| ondevice_unseal.out | 机上解封判定输出 + sha256sum + cmp |
| wrap_envelope.out | 传输封套 wrap 回执 |
| serve_4451.log | serve 端回执全文（ERR=0） |
| fetch_r1.out / fetch_r2.out | Mac fetch 两轮判定行 |
| psb/psh/dbg/shim/link 构建日志 | 当代树 android 驱动物料 |
| 产物容器 | `artifacts/csg_asset_pipeline/huguangsheng/ssm2/hgs_ssm2.ssm2` |

## 6. 如实标注与遗留

1. **深度载荷缺席**：DPD1 深度层（sv_semplane_container.md §4 所述 packed
   933,888B）盘上无冻结容器件（planetrack/、campaign、artifacts 全查无），本轮
   双载荷落地；格式对载荷数无上限假设（N≤64 配额），三载荷 = 再加一条目，零结构
   改动。深度容器冻结后重跑 packer 即扩容。
2. **跨机消费腿未接线**：鸿蒙 HAP 解封消费（AVPlayer 播内嵌 mp4 + 语义
   validator）属 HAP 独占面，待反向/索引线完成后接线；本轮交付到
   「容器 + Mac/安卓全链绿 + serve 就绪」，与任务边界一致。
3. **SSM2 原生 serving 未做**：现役 q3_serve 载包合同排他 SSM1 魔数（F-H4c），
   4451 实例经 SSM1 封套 serve SSM2 容器；原生 SSM2 serving（serve 端协议扩展）
   维持 §22.2 另案口径，本轮零 serve/fetch 协议改动。
4. 机上留置：`/data/local/tmp/{hgs_ssm2.ssm2, hgs_ssm2.ssm1, ssm2_unseal,
   ssm2_out/}`；4451 实例已按轮清零（netstat 复核 RELEASED），4443 现场
   （pid 3570/7287）零扰动。git 未提交（按纪律）。
