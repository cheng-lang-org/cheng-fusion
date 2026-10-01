# svblock_transfer.md — CSG 语义平面容器 hgs_l2_planes.svblock 跨机 QUIC 传输 2/2（2026-09-19）

判词：**绿（2/2 轮）**。CSG 语义平面容器 hgs_l2_planes.svblock（85,960B，
sha256=f240fe8832cd29de625402a4a374236f9364bc4b269dbca249643e8f52944599）复用
base.mp4 已验证的 SSM1 包装通道完成安卓真机 → 鸿蒙真机纯 Cheng libp2p QUIC 传输：
`ssm1_wrap_mp4.cheng` 单 keyframe chunk 封装（载荷=svblock 全量字节，cid=源 sha256）
→ 安卓 DCO-AL00 q3_serve（4444，独立实例）→ 鸿蒙 Mate 70 Pro+ HAP RECEIVE
（ssm1q fetch + sha 双断言）→ ssm1qAssembledWriteFile 落 HAP 沙箱 85,960B → JS 端
大小+sha256 复核 → `hdc file recv` 拉回 Mac 独立 sha256 对拍。两轮三方（Mac 源 ==
鸿蒙落盘件 == 容器 cid）全等 f240fe88…。机制零新发明，HAP 仅换判据常量。

## 0. 通道复用说明

- 封装：`./.scratch/bs1/ssm1_wrap_mp4 artifacts/.../hgs_l2_planes.svblock
  .scratch/bs3/hgs_l2_planes.ssm1 1000` → `wrap ok mp4Len=85960 fileLen=86077
  headerLen=117 chunks=1 kfChunk=0 kfRange=[117,86077) cid=f240fe88…`（rc=0）。
  容器 sha256=6705c3cc4e38cf36…（86077B）。独立 python 结构复核
  （verify_ssm1.py）：magic=SSM1、ver=1、chunks=1、cid==期望哈希、payload 逐字节
  ==源 svblock、EOF 恰好覆盖、payload sha256==cid，全 True（verify_ssm1.out）。
- 端口：安卓侧既有 q3_serve（pid 7287）占 4443 serve hgs_base.ssm1（base.mp4 线
  可复现现场），本任务实例换 **4444**，HAP `MOQ_PORT` 同步 4444。两轮 serve 实例
  独立起停（serve_r1.log / serve_r2.log），全程未触碰 7287。
- HAP 判据常量（这是与 base_ssm1_transfer 形态的唯一差异）：
  `EXPECTED_MP4_SHA256 = f240fe88…599`、`EXPECTED_MP4_BYTES = 85960`
  （Index.ets；abc 面核：新哈希在、旧哈希 927b37e6… 已清除）。

## 1. 变更面与装机

| 件 | 内容 | sha256 前缀 |
| --- | --- | --- |
| UniMaker Index.ets | 3 常量（sha/bytes/port）+注释 | — |
| AppScope/app.json5 | versionCode 1000055→1000056 | — |
| ssm1smoke-default-signed.hap（已装机 1000056） | hvigor assembleHap BUILD SUCCESSFUL 24.7s | 4ec36958ecccc3de |
| 已知好件备份 | .scratch/bs3/hap_backup_1000055_f0ed1b34.hap + Index.ets.bak_1000055 | f0ed1b34f5b60420 |

so 零改动（ssm1qAssembledWriteFile 等导出原样复用）；安卓机上容器
/data/local/tmp/hgs_l2_planes.ssm1 机上 sha256sum=6705c3cc… 与 Mac push 件一致。

## 2. 每轮关键数字（hilog 原文 r1.hilog.txt / r2.hilog.txt）

| 项 | 轮 1（22:19，pid 47798） | 轮 2（22:21，pid 48326） |
| --- | --- | --- |
| serve 实例 | 独立新起 4444，pack 解析过 | 独立新起 4444，同左 |
| fetchMs | 1815 | 1664 |
| click→file-verified | 1832ms | 1679ms |
| dial→first-frame ready | 1696ms（ready→首帧就绪 144ms） | 1632ms（100ms） |
| cheng 端断言 | fetchOk=true shaMatchSource=true，`sha256-match=f240fe88…` | 同左 |
| 落盘 | written=85960 skip=117 total=86077 | 同左 |
| JS 复核 | size=85960 sizeOk=true sha=f240fe88… shaOk=true | 同左 |
| serve 回执 | conn=1 served=2 totalServed=2 manifest=117B chunk=85960B | 同左 |

预期内伴随行（非缺陷）：落盘件为 svblock 非 mp4，AVPlayer prepare 失败
（code 5400102/5400106，T_VIDEO state=error）——传输 PASS 判据在其之前已落，
无降级路径，本任务不以播放为判据。

## 3. sha256 三方对拍（超越 hilog 断言的独立复核）

沙箱落盘件 `hdc file recv`（物理路径 /data/app/el2/100/base/com.example.unimaker/
haps/ssm1smoke/files/hgs_fetch.mp4；/data/storage 挂载路径对 shell 拒绝，轮 1 探明）
拉回 Mac：

```
hgs_fetch_r1.svblock  f240fe8832cd29de625402a4a374236f9364bc4b269dbca249643e8f52944599  (85,960B)
hgs_fetch_r2.svblock  f240fe8832cd29de625402a4a374236f9364bc4b269dbca249643e8f52944599  (85,960B)
Mac 源 hgs_l2_planes.svblock  f240fe8832cd29de625402a4a374236f9364bc4b269dbca249643e8f52944599  (85,960B)
```

两轮三方全等。结构断言（拉回落盘件，Mac 侧）：首 8 字节 `43 53 47 43 40 00 00 00`
= "CSGC" magic + ver 64，与源 svblock 一致；鸿蒙在机探针同值（§4）。

## 4. 加分项：鸿蒙端在机结构断言（已落地）

轮 2 后设备进入灭屏深睡、hdc [Empty]（H1/T-D 同形震荡）；有界后台轮询
（bs3_struct_wait.sh）于 22:31:43 设备回归后在机直读沙箱物理路径（ondevice_struct.txt）：

```
magic+hdr(8B): 43 53 47 43 40 00 00 00   ("CSGC" + ver 64)
bytes: 85960
sha256sum: f240fe8832cd29de625402a4a374236f9364bc4b269dbca249643e8f52944599
```

在机 magic+字节数+设备端 sha256sum 三项全过——对拍升级为四路（Mac 源 == 鸿蒙落盘件
（轮 1/2 拉回）== 容器 cid == 鸿蒙在机 sha256sum）全等。

## 5. 证据文件清单（.scratch/bs3/）

- r1.hilog.txt / r2.hilog.txt（判据行全文）+ r1.hilog.raw / r2.hilog.raw（全量缓冲）
- hgs_fetch_r1.svblock / hgs_fetch_r2.svblock（沙箱拉回件，各 85,960B）
- hgs_l2_planes.ssm1（Mac 盘上容器）+ verify_ssm1.py / verify_ssm1.out
- serve_r1.log / serve_r2.log（pack 解析 + listening 4444 + conn/served 回执）
- r{1,2}_start.txt、bs3_layout_r{1,2}.json、r{1,2}_recv.txt、r{1,2}.macsha.txt
- hap_backup_1000055_f0ed1b34.hap、Index.ets.bak_1000055（回滚件）
- bs3_round.sh / find_btn.py / bs3_struct_wait.sh（驱动）

## 6. 现场状态与判词

- 安卓：仅 base 线 q3_serve（pid 7287，4443，hgs_base.ssm1 c91f3416…）存活；
  4444 两实例已按轮清零；hgs_l2_planes.ssm1 留机（6705c3cc…）。
- 鸿蒙：装机 1000056（svblock 判据形态）；回滚=装回备份 HAP（f0ed1b34，1000055）。
- **判词绿：2/2 轮 QUIC 传输 85,960B，两端 sha256 对拍全等 f240fe88…599，
  base.mp4 线现场零扰动。语义容器跨机通道与 base.mp4 同机制收口。**

遗留缺口：①鸿蒙 serve 方向、SSM2 混合载荷（svblock+mp4 同容器）仍待立项
（fe_hap_libp2p.md §21/§22 在案）。
