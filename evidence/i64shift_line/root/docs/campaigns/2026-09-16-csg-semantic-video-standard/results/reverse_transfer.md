# reverse_transfer.md — 反向腿打通：鸿蒙真机 serve → 安卓真机 fetch 落盘（2026-09-20）

判词：**绿。反向腿 5/5 轮全 PASS**（svblock 5 轮 + base.mp4 2 轮，其中 svblock
r1/r2 为 64 包初始窗 exe 佐证轮，正式判据 r3/r4/r5 与 mp4 r1/r2 为同一最终
exe=1024 包窗）。每轮独立 HAP serve 实例（app 重启）+ 安卓 C 宿主 fetch 落盘，
判据四重：cheng 侧 sha256==cid 断言（fetch ok 行）+ WRITE_OK 落盘字节数 +
设备端 sha256sum + Mac 拉回件 sha256，全部与源全等。装机后正向两腿回归仍绿
（base 2760ms / svblock 1828ms，size+shaOk 双断言过）。

## 0. 结论数字

| 轮 | 载荷 | fetchMs(wall) | 字节 | sha256（前16） | 三方 |
| --- | --- | --- | --- | --- | --- |
| svb r1 | svblock | 1957 | 85,960 | f240fe8832cd29de | 全等 |
| svb r2 | svblock | 1902 | 85,960 | f240fe8832cd29de | 全等 |
| svb r3（终 exe） | svblock | 2094 | 85,960 | f240fe8832cd29de | 全等 |
| svb r4（终 exe） | svblock | 1923 | 85,960 | f240fe8832cd29de | 全等 |
| svb r5（1000059 sanity） | svblock | 1929 | 85,960 | f240fe8832cd29de | 全等 |
| mp4 r1（终 exe） | base.mp4 | 2461 | 496,166 | 927b37e61b33187b | 全等 |
| mp4 r2（终 exe） | base.mp4 | 2525 | 496,166 | 927b37e61b33187b | 全等 |

- svblock 源 sha256=f240fe8832cd29de625402a4a374236f9364bc4b269dbca249643e8f52944599
  （85,960B，SSM1 容器 6705c3cc… 86,077B = .scratch/bs3 同一件）。
- base.mp4 源 sha256=927b37e61b33187bd07a43ae8395be44999cd13e793ff50f1c9319f5d8c11eb8
  （496,166B，SSM1 容器 c91f3416… 496,283B = .scratch/bs1 同一件）。
- 三方 = cheng fetch 断言（`fetch ok … sha256-match=<cid>`）== 安卓设备端
  `sha256sum`（落盘 /data/local/tmp/rev_fetch_r{N}_{svb,mp4}，7 件留存）==
  Mac `adb pull` 拉回件 shasum（.scratch/rev/rev_fetch_r*_*.bin）。

## 1. 能力核实（任务第一个问题：HAP serve 闭包能力是否存在 → 存在）

- 导出面在证：`ssm1q_serve_start(data,len,port)`（ParseEx embedded 合同 +
  listen 0.0.0.0:port）+ `ssm1q_serve_serve_once`（accept 切片）+ NAPI
  `ssm1qServeStart`/`ssm1qServeAcceptLoopStart`（shim 线程循环，T_SERVE conn=N
  回执）。跨机受理 §18（F-J）3/3 历史在证。
- HAP serve 载荷 = 内存字节 → 本次以 **rawfile 内嵌容器**注入
  （rev_svblock.ssm1 / rev_base.ssm1，打包进 HAP，包内哈希与 Mac 盘上件逐字节
  同值）。备选的 hdc file send 直写沙箱被实证拒绝（/data/app/el2/... files/
  目录 770 属主 app uid，hdc shell permission denied）。
- 安卓 fetch 端落盘缺口：在证 q2_fetch_new（ssm1q_client_probe.cheng 的
  android exe）只做内存 sha256==cid 断言、无落盘 → 新建落盘通道（§2）。

## 2. 安卓端落盘通道（q2_fetch_h，C 宿主形 = fg sv_fetch_android_fixed 先例）

- 构建：`src/tools/ssm1q_fetch_file_probe.cheng`（client_probe 副本 + 两处变更：
  ①`QInitialWindowPackets 64→1024`（见 §4）；②main 保留裸探针形）→
  stage3 `--emit:obj --target:aarch64-linux-android`（unresolved=0）→
  `.scratch/rev/rev_fetch_harness.c`（C main：fetch_client_run →
  assembled_len/assembled_copy → 按 kfOff/kfLen 写 [payload] 到盘）→ NDK r27
  `aarch64-linux-android28-clang -pie` 链接 + .scratch/pb 冻结 provider 集
  （psb/psh/dbg/intrinsics/shim/rss/stdio）+ `rev_qprobe_bridge.c`（诊断打点
  →logcat）。exe=q2_fetch_h 45,784,112B。
- **宿主形选择依据（非绕过）**：cheng wrapper-main exe 形（--emit:obj + pb
  provider 集，q2_fetch_new 同构流程）实测 reply 时间线 str 内存腐坏
  （应答=0xDD 毒值，削版对照排除了 main 因素）；C 宿主直调 @exportc =
  fg_android_verify 5/5 与 ohos NAPI 两侧在证形态。如实登记，归编译器/构建流
  战役待查。

## 3. 泵门修复缺位发现与清偿（本轮核心工程增量）

- 首轮反向 serve 起来后安卓拨号恒死：鸿蒙端 UDP 4450 rx_queue 拨号前
  0x940 → 拨号中 0x7840（30KB 积压）+ serve 侧 T_SERVE 全 idle + 客户端
  `FAIL dial msquic native: handshake ! ready` —— §18 rx 积压签名复现。
- 定谳：在机 .so（fb4c0ae3…，fk/fj_pc 代 obj）的 ssm1q obj = **泵门修复前代**
  （fj_pc/ssm1q 13:29 Sep 18 建于 F-J 修复轮之前；fk Sep 19 重编与之字节同一，
  即沿用了未含修复的克隆源）。正向腿从不用 HAP serve → 缺位从未暴露。
- 清偿：从主树 HEAD（含 F-H5 数据面存在性判定，`src/quic/native_runtime.cheng`
  msquicNativePumpCodeUnlocked）现烤 `ssm1q_head_ohos.o`（11,944,637B，比 fk
  件大 16B=修复增量；unresolved=0），fj_pc 其余 obj 沿用（sv/sd/ph 改名冻结件
  1493/83/2 在件），gate1 门检唯一冲突对 ssm1q×csg_play=92 类型符号按 §18.4
  同技术 llvm-objcopy `csgobj_` 前缀改名（重定位随符号索引），bs1 shim 构建副本
  （含 ssm1qAssembledWriteFile）重链：
  **libssm1napi.so = 58,646,080B，16KB LOAD align 4/4 0x4000，14 必需导出全
  defined，cheng 残余 undefined=0，sha256 前缀 69430c0104ce0fcb**。
  换件后反向首轮即通（rx 积压消失，accept 正常受理）。
- 装机链：1000057（HAP 0f584280…，Index.ets REV 键+RECEIVE:MP4+rawfile，so 未
  换→发现泵门缺位）→ 1000058（HAP 520717f2…，so 换 69430c01…，反向判据轮）→
  1000059（HAP 69d733546298dbd0…，BASE_PORT 4443→4445 正向回归用，反向
  sanity r5 复验）。已知好件备份：.scratch/rev/{Index.ets.bak_1000056,
  app.json5.bak_1000056, hap_backup_1000056_4ec36958.hap,
  libssm1napi.so.pre_rev_fk_era(=fb4c0ae3)}。

## 4. base.mp4 首轮 negotiate_ack_4 卡死 → 初始窗清偿

- 496KB 单 keyframe chunk 首两轮稳定 `FAIL negotiate_ack_4`（86KB svblock 恰
  过）。差异变量=载荷体积 vs 客户端 QUIC 初始流/连接窗
  `QInitialWindowPackets=64`（~90KB），496KB 超窗致流 8 推送堵死拖垮协商面。
- 清偿：探针副本 `QInitialWindowPackets 64→1024`（~1.2MB ≥ 496,166B）后 2/2
  PASS。注：HAP 端 fetch 客户端（正向 496KB 历绿）不在此窗形，无需同改。

## 5. 正向两腿回归（1000059 终态装机件，2/2 绿）

| 腿 | 判据 | 结果 |
| --- | --- | --- |
| base（RECEIVE:MP4 → 安卓 4445 实例 serve hgs_base.ssm1） | `BASE_SSM1 RECEIVE PASS totalMs=2760 (fetchMs=2715)` + `size=496166 sizeOk=true sha=927b37e6… shaOk=true` | PASS |
| svblock（RECEIVE → 安卓 4444 实例 serve hgs_l2_planes.ssm1） | `BASE_SSM1 RECEIVE PASS totalMs=1828 (fetchMs=1809)` + `fetchOk=true shaMatchSource=true` + `size=85960 sizeOk=true sha=f240fe88… shaOk=true` | PASS |

## 6. 现场损失登记（如实）

- **安卓 4443 现场（pid 7287，serve hgs_base.ssm1）进程内 TLS 状态因病损坏**：
  本轮诊断期，我的第一代 exe（泵门无关的 tls13 客户端面腐坏，§2）对 4443 发出
  畸形握手后，该进程对所有后续客户端（含在证 q2_fetch_new）持续返回
  `FAIL dial tls13 certificate_verify`，未自愈。端口/文件（hgs_base.ssm1
  c91f3416…）/二进制均未动、进程未杀。正向 base 回归改走同冻结二进制同载荷
  的 4445 实例（7287 与他线 4452 进程全程未触）。修复该现场需重启 7287（本轮
  无权操作，移交用户）。
- 他线现场（pid 3570，4452 hgs_base_indexed.ssm1）零接触。

## 7. 变更面与证据清单

| 面 | 内容 |
| --- | --- |
| cheng-lang 主树 | 新文件 `src/tools/ssm1q_fetch_file_probe.cheng`（client_probe 副本+窗 1024+注释；未 commit）；其余 src 零改动 |
| UniMaker（授权目录） | Index.ets（REV:SVB/REV:MP4/RECEIVE:MP4 三键+serveRawfile/receiveBase 链+常量；既有键零改动）、app.json5（1000056→1000059）、rawfile+rev_svblock.ssm1/rev_base.ssm1、jniLibs so 换 69430c01… |
| 安卓设备新增 | /data/local/tmp/{q2_fetch_h, q2_fetch_file*, q2f_plain, rev_fetch_r1..r5_*（7 交付物）}；临时探针件已清 |
| 鸿蒙设备 | 装机终态 1000059（HAP 69d733546298dbd0…）；沙箱 hgs_fetch.mp4/hgs_fetch_base.mp4 留存 |
| 现场清理 | 我的 4444/4445 实例已杀、诊断快照 .rebuild/clone_roots/rev_sep18 已删 |
| 证据目录 | .scratch/rev/（轮输出 r*_*.txt、hilog raw、拉回件 rev_fetch_r*_*.bin、脚本 rev_round.sh/fwd_round.sh/gate1.py/rev_link_so.sh/mk_csg_rmap.py、obj/so candidate、备份件） |

遗留欠账（另案）：①编译器/构建流——cheng wrapper-main exe 形 reply 内存腐坏
（§2）与 psb 现源 stage3 segfault（§24.2 在案）同报编译器战役；②鸿蒙 HAP
serve 方向的泵门修复此前仅在 §18 轮次 .so 存在、fk/fj_pc 代 obj 缺位——
.obj 代际与源树的溯源纪律欠账；③安卓 4443 现场 7287 需用户重启恢复；④
q3_serve 载包合同仍排他 SSM1（SSM2 hybrid serving 仍待立项，§21/§22 不变）。
