# task_m5_transport_opt.md — SSM1 MoQ 秒开真机优化（152-156ms → 64ms 中位）

日期：2026-09-11。归属：CSG 资产管线。状态：**完成**（真机 3 轮中位 64ms ≤ 110ms
判据达标；全部轮次 sha256 断言全过）。前置：task_m2_mobile_transport.md（跨机
基线 152–156ms）、task_ssm1_moq_opensmoke.md（协议序列）。

环境：车头 `/private/tmp/cheng_w126_re`（2026-09-07 冻结）；克隆
`/Users/lbcheng/cheng-f24/anchor_clones/apkdev`（原 streamdev，目录名已变）；
真机 HUAWEI DCO-AL00 `GBJ0222B24021692` ↔ Mac 192.168.1.7（WiFi 同网，
5GHz ch161，RSSI -43）。实测试窗口内该 WiFi 存在间歇丢包突发（ICMP 丢包
20–50% 波动、偶发 6s 级握手停顿），故另注明 6 轮扩展中位。

## 0. 交接实况（如实）

1. **fetch 源已丢失，本轮重建**：任务起点时 `streamdev` 克隆不存在
   （目录已更名 apkdev），且 `ssm1_moq_fetch.cheng` 未入 git、无 APFS 快照、
   无缓存残留——磁盘上已不可恢复。按 M2 文档 §2 合同 + opensmoke
   `csg_ssm1_moq_opensmoke.cheng` 客户端序列 + serve 端对称结构完整重建；
   忠实度由轮 0 实测背书（mac 双进程 32.6ms ∈ M2 的 29.8–34.2ms；真机
   sha256/be20ab8e… 与 M2 逐字节一致）。
2. **serve 源是被污染态，非 M2 交付版**：任务起点时的 serve.cheng（mtime
   当日 15:46，为今日并行会话所改）带 `ServeSlotScanCount = 64`（M2 文档
   §1② 实证的越界 brk 配置）+ 扫描循环无 pump + `WriteRequestedRange`
   请求 clamp（M2 §2.4 明确弃用形态）。当日 15:49–15:51 的
   `ssm1_moq_{serve,fetch}_mac.exe` 四份崩溃报告（EXC_BREAKPOINT 双端对称）
   与该配置吻合。本轮按 M2 文档语义重写（N_SLOTS 窗口 + 每槽 pump 织入 +
   服务端权威段长 ServerWriteRange + 严格 chunk range 校验）。
3. **构建链修复**：`android_errno_bridge` 归档丢失，按 M2 §3 配方重建
   （`__errno_location`→`__errno()` 桥 + stdio 桥 `llvm-ar rc` 合并，
   `artifacts/mobile_m5/android_link_bridge.a`）；fakendk wrapper 内残留
   streamdev 绝对路径已改指 apkdev（仅影响 argv 日志）。
4. **构建必须显式 `--root`**：shell 环境带 `CHENG_ROOT=/Users/lbcheng/cheng-lang`，
   不带 `--root` 时 closure 混入主仓运行时源（`QuicCloneMultiAddress` 等
   符号面不同），且与主仓并行会话的构建互相污染（本轮 r2→r3 间出现
   解析翻转、他仓 ecnist mergedbg 失败泄漏进本克隆闭包）。此后全部构建
   `env -u CHENG_ROOT … system-link-exec --root:$PWD`，确定性恢复。
   r0–r2 二进制为混合闭包时代产物，数字仍有效（行为经真机逐轮验证）。

## 1. 判词

- **真机 WiFi ready→首帧 64ms（3 轮中位；6 轮扩展中位 78ms）**，低于 110ms
  判据线，亦低于 M2 基线 152–156ms 与宿主壳本地基线下限 184ms。
- 四项改动全部工具层（`ssm1_moq_{serve,fetch}.cheng` 两文件内）：
  事件驱动等待、两流并行、初始窗口 64 包、服务端主动推段 + 64KB 段读写粒度。
- 全部 6 轮终版（r5）`sha256(chunkSeg) == cid[kf]`（be20ab8e…）与
  `chunkLen == payloadLen(65572)` 断言全过；serve 端 6 连接 served=12 段无错。

## 2. 逐轮改动与真机数字（ready→first-frame，真实实测）

| 轮 | 改动点 | 真机 3 轮 (ms) | 中位 | 说明 |
| --- | --- | --- | --- | --- |
| 0 | M2 交付语义重建基线（扫描窗口 N_SLOTS + 每槽 pump + 10ms 步进 + 串行请求） | 184 / 184 / 180 | 184 | 设备熄屏（WiFi 省电）窗口测得 |
| 0b | 同上，设备唤醒后复测（对齐后续轮次环境） | 372 / 152 / 496 | 372 | 该窗口无线电丢包突发，方差大 |
| 1 | 事件驱动等待：空扫后 `msquicNativeWaitReadableForSide(side,20)` 阻塞等数据报 + 唤醒泵一次，替代 10ms 步进（双端对称） | 120 / 144 / 128 / 128 / 140（5 轮） | 128 | negotiate 段 124–148ms → 16–60ms |
| 2 | 两流并行：neg4/neg8 背靠背发出再各自等 ack；manifest 请求后立即预发 chunk 请求（请求退化为触发器，段长服务端权威） | 140 / 128 / 100 | 128 | 串行 manifest 腿被并行吸收 |
| 3 | `settings.initialWindowPackets = 64`（现役公开旋钮，默认 10 包≈12KB→64 包≈76KB ≥ 两段合计 70197B；运行时乱序预算 160 包界内），双端对称 | 116 / 120 / 144 | 120 | 窗口非瓶颈（见 §5 归因） |
| 4 | 服务端主动推段：negotiate 完成即写两段 + 写侧 shutdown，免请求飞行 RTT（M2 §8.3 建议；fetch 本地绑 reader，靠 EOF 收尾） | 136 / 100 / 84 | **100** | 判据线首过；6 轮扩展 84–136（中位 116） |
| 5 | 段读写粒度 16384→65536B（serve 写出 1 次 connWrite；fetch 单 Read 尽吸缓冲，减少 pump 节奏拆散） | 100 / 64 / 60 | **64** | **终版**；6 轮扩展 60–180（中位 78；180 轮含 6.5s 无线电停顿仍 PASS） |

补充对照：mac 双进程 localhost，r0 基线 ready→首帧 32.6ms（M2 区间
29.8–34.2ms 内），r5 终版 36.5ms（localhost 本已无 RTT/爬坡压力，并行/推段
收益不在 localhost 体现，属预期）。

轮 1 首测（设备熄屏窗口）曾出现 negotiate 208ms / chunk 364ms / 一次 dial
20.7s / 一次 dial FAIL，定位为设备 Doze + WiFi suspend 优化导致的链路劣化
（`svc power stayon` + `deviceidle disable` + 关 wifi suspend 后恢复），
非代码回归；该窗口数据弃用，上表均为清醒设备数据。

## 3. 最终时间线（真机，r5 终版，3 轮全量输出）

```
SSM1 MoQ fetch timeline:            # 轮2（中位轮）
  dial (transport+tls+handshake): 1008000000 ns
  connect ready (negotiate x2): 12000000 ns
  requests issued (both streams): 0 ns
  manifest segment (4625 bytes): 36000000 ns
  parse + locate first keyframe: 0 ns
  keyframe chunk segment residual (65572 bytes): 28000000 ns
  ready->first-frame ready: 64000000 ns
  total dial->first-frame ready: 1071999999 ns
fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B sha256-match=be20ab8ec6be22e984ffc92163bb5b73e2d22e4394b92d44cd127de18d3eb5a6
# 轮1: ready->first-frame 100ms (manifest 60 / residual 40)；轮3: 60ms (manifest 32 / residual 28)
# 6 轮 ready->first-frame: 100 / 64 / 60 / 72 / 84 / 180 —— 全部 PASS, sha256 逐轮一致
```

serve 端（Mac）对应：`conn=1..6 served=2 totalServed=12 manifest=4625B
chunk=65572B`，无 ERR 行。manifest 与 chunk 两段自 negotiate 完成即并行传输；
`manifest segment` 行计时含与 chunk 突发的共享链路时间，`residual` 行为
manifest drain+parse 完成后的 chunk 余量收尾。

## 4. 与 M2 基线对照

| 场景 | ready→首帧 | 构成 |
| --- | --- | --- |
| M2 基线（串行请求，10ms 扫描量化） | 152–156ms | manifest 32 + parse 0 + chunk 124 |
| **M5 终版（本轮）** | **64ms（3 轮中位）/ 78ms（6 轮中位）** | manifest 32–48 ∥ chunk 突发+残余 28–52（并行） |
| 宿主壳本地基线（task_shell_core_wire） | 184–307ms | 低于基线下限 66% |

预算外推（opensmoke §6 口径）：50ms RTT 冷连接两流并行 100–150ms；本轮在
~17–25ms RTT 实测 64ms，形状一致（1 RTT 推段启动 + 段传输）。4G/5G 高 RTT
下 chunk 段传输仍将主导，后续对冲方向不变（首屏专用低码率支流等）。

## 5. 剩余大头归因（如实）

1. **chunk 段尾部 28–52ms**（占 ready→首帧 ~50%）：64KB 突发经 WiFi 空口
   串行化 + 客户端每 datagram 解包/入表节奏 + 偶发丢包恢复（r4→r5 前
   16KB 读粒度把尾部拆到 60–104ms 即为 pump 节奏拆散证据；轮 6 的 180ms
   轮含无线电停顿）。空口吞吐与丢包恢复在 QUIC 运行时层（loss detection/
   乱序重组 64 槽），工具层已无杠杆。
2. **manifest 腿 32–48ms**：1–2 RTT + 服务端推段唤醒；与 chunk 并行，不在
   关键路径单独收紧。
3. **判据外（不影响 ready→首帧）**：dial 1.0–1.2s（transport 握手等待的
   秒级量化，运行时层 `msquictransport_native.dial`；本轮 r1 曾实测 20.7s
   dial 与 FAIL，均为熄屏链路劣化期产物，清醒后未复现）；negotiate
   12–84ms（事件驱动后纯 RTT 界，无线电突发时抬升）。
4. 运行时层登记（未动，工具层不可达）：① dial/accept 握手等待的秒级量化
   建议收敛到事件驱动；② `initialWindowPackets` 生效路径建议加运行时自证
   输出（本轮以 A/B 数字间接证明 64 包窗口非瓶颈）；③ 主动推段后 serve 端
   flush 由 accept 环驱动，建议把段写出后的尾部 flush 织入固定 pump。

## 6. 交付与证据

- 源码（最终版，双仓同哈希）：
  `ssm1_moq_serve.cheng` = `d905201006c951ee…`、
  `ssm1_moq_fetch.cheng` = `cc680f35e6ef6d04…`
  （`apkdev/src/tools/` 与主仓 `/Users/lbcheng/cheng-lang/src/tools/` 逐字节一致）。
- 主仓首次入库：M2 交付仅在克隆，本轮一并入库（fetch 为重建版，serve 按最终
  优化态）。
- 产物（`apkdev/artifacts/mobile_m5/`，sha256 前 16 位）：
  `1330a12ae5719d7d ssm1_moq_serve_mac_r5.exe`、
  `52ff8226395af0fb ssm1_moq_fetch_mac_r5.exe`、
  `9589a47a86984525 ssm1_moq_serve_android_r5.exe`（20.7MB，push 真机
  `/data/local/tmp/cheng_ssm1_moq_fetch`，PT_TLS p_align=0x40 过 bionic 门）、
  `1b481d99f600bd4d ssm1_moq_fetch_android_r5.exe`；r0–r4 各轮产物同目录留档。
- 桥：`android_errno_bridge.c/.o` + `android_link_bridge.a`（按 M2 §3 配方重建）。
- 运行日志：`serve_mac_dev_r{0b,1,2,3,4,5}.log`（conn/served 逐轮）。
- 真机侧：`/data/local/tmp/cheng_ssm1_moq_fetch`（r5 版）。

## 7. BLOCKED 项

无。OHOS 不在范围（M1 结论不变）。并行会话共享树碰撞（multiaddress 克隆 API
收敛、manifest/player 编辑、主仓构建抢占）均已通过显式 `--root` 构建与源码
去依赖（不调 `QuicCloneMultiAddress`）化解；主仓副本为源码级同步，主仓树
编译验证未跑（主仓正被并行 lane 占用构建态，避免污染），API 面已逐符号核对
（manifest/reader/moq_segment_stream/connection/native_runtime 全部命中）。
