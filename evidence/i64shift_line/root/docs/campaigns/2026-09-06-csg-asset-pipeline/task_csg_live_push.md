# Task CSG 直播推流端 (MES1 事件流 → MLV1 UDP 直播)

日期: 2026-09-13。主仓新增: `tools/csg_live_push.py`、`tools/csg_live_pull.py`、本文档。
真机: DCO-AL00 (GBJ0222B24021692, Android 12, aarch64, WiFi 192.168.1.6)。

## 1. 格式定稿: MES1-Live v1 (MLV1)

逐事件独立编码、可流式传输。一个 UDP datagram = 一条消息, 每条消息除首帧
MANIFEST 外不依赖前后消息。载荷直接复用 M11 MES1 容器的事件/参数二进制编码
(位语义不变), 推流端只做容器→消息转封装。

消息头 19B (小端): `magic u32 "MLV1" | type u8 | seq u32 | frame u16 | tMs u32 | payloadLen u32`
- type: 0=MANIFEST 1=EVENT 2=PARAMS 3=EOS; seq 从 0 逐消息递增 (连续性判据);
  tMs = frame*100 (10fps 播放时间戳)。

| type | payload |
|---|---|
| MANIFEST | `W u16, H u16, frameCount u16, paramsMode u8, maskMode u8, maskEnc u8, keyGz u8, trig f32, qmin f64, qmax f64, keyBlobLen u32` + keyBlob (MES1 KeyBlob 原样: gzip(u32 jsonLen + SSM scene v0 JSON + 逐平面全帧 RLE 掩码)) |
| EVENT | MES1 EventSection 事件记录原样: REC_HDR(nRem,nAdd,nMut u8×3) + removes[tid u16] + adds[tid u16 + a,b,c f64 + z u8 + shareCenti u16 + runCount u16 + runs] + mutates[tid u16 + flags u8 + 按需参数Δ(FP16 相对当前态) + 按需掩码Δ RLE(global=全帧 / bbox=窗口)] |
| PARAMS | MES1 参数帧记录原样: `n u8` + n×`tid u16, fl u8, 按需字段`。空参数帧不发 |
| EOS | `eventFrames u16, paramFrames u16` (发送方计数, 接收端对账) |

可靠性 (ARQ): 增量状态流丢一条即破坏后续 delta 语义。接收端发现 seq 缺口即回
`"NACK" + u32 seq` datagram; 推流端缓存全部已发 datagram 并重发 (首发与补发同一
socket)。接收端按 seq 严格序应用 (洞后消息缓存不应用, 补齐后冲刷), 消息只应用
一次。PC 端以 `--loss 0.05` 受控注入首发丢包验证了该路径 (非直播默认)。

源容器: `bg_mask_event_p1_struct_g.mes1` (114,717B, M11/M13 交付, gzFlags=0
paramsMode=0, 事件区/参数流可按目录独立切出)。不重跑 GT 拟合, 推流秒级启动。

## 2. 实现

- **推流端** `tools/csg_live_push.py`: MES1 容器拆包 (header/KeyBlob/EventDir/
  ParamStream/EventSection 独立切出) → MLV1 消息 → 按 10fps 直播节奏 UDP 推送
  (绝对时刻表防漂移) → NACK 服务 → `--log` 落盘推流日志。`--speed` 可加速,
  `--loss` 为受控注入测试参数。
- **PC 拉流端** `tools/csg_live_pull.py`: 纯 python (无 numpy) int 位图解码器,
  RLE/事件语义与 M11/M9C 逐位同构 (300 组随机掩码 + 100 组 bbox XOR 对拍
  PASS)。逐事件解码 → 累积场景图状态 → 首帧渲染回调 + 每 N=5 事件渲染回调
  (场景图快照 JSON: 全平面 a,b,c,z,share,maskPx) → `--frame-fp` 逐帧状态指纹
  (t=0..224 全帧) → `--compare` 与打包容器 M11 replay 逐帧比对 → 延迟统计。
- **真机拉流端** (C, aarch64): 与 python 版同构的 C 最小实现 (NDK 27
  clang, 链接系统 libz), inflate KeyBlob → JSON 微扫描 (affine a,b,c +
  inlierSharePct) + RLE 位图 → 同样的 ARQ/回调/打点 → 统计 JSON。
  C 源码为任务级临时产物 (验证后已删, 未入主仓); 真机判据以末态
  (a,b,c 全精度 f64 + z/share + 掩码像素数) 与 PC 逐帧指纹对账。

## 3. 验证结果 (全部真实运行)

对账基准 (M11/M13 落档): 结构事件帧 22, removes 9 / adds 15 / mutates 212,
paramFrames 224 / paramRecs 2594, 末态平面 11。

| 判据 | PC python (无损) | PC python (+5% 注入丢包) | 真机 (无 ARQ, 第 1 轮) | 真机 (ARQ, 第 3 轮) |
|---|---|---|---|---|
| 消息 | 248 收 248, retrans 0 | 248 收 248, retrans 26 | **丢 2 条** (EVENT f166 + 1 PARAMS) | 248 收 248, retrans 0 |
| 事件序号连续 | PASS | PASS | FAIL (gaps=2, 状态破坏) | PASS |
| 计数对账 + eosMatch | PASS | PASS | FAIL (21/224) | PASS (22/224, 9/15/212) |
| `--compare` 225 帧逐帧 vs 打包容器 | **PASS** (mismatch 0) | **PASS** | - | - (真机以末态对账) |
| 真机末态 vs PC 逐帧指纹 t=224 | - | - | - | **PASS** (11 平面 f64 参数 + 掩码逐位) |

第 1 轮暴露: WiFi UDP 首发即丢 2/248 (~0.8%), 增量流丢 1 条即状态永久错位 →
ARQ 为必需语义 (非兜底), 第 3 轮同一路径零丢失。C 端 ARQ 另经 5% 注入
(nacks 38, retrans 26) 验证末态 PASS。

## 4. 延迟数字 (真实)

- **PC 同机 (python)**: 首帧到达→首帧渲染 (MANIFEST 解码+场景图建立+首快照)
  **0.755–0.851 ms**; 事件应用 309 μs 均值 / 453 μs 峰值 (无损轮), 467 μs /
  1834 μs (5% 丢包轮含重排); 调度抖动 (到达间隔-发送间隔, 时钟无关差分)
  mean 0.425 ms / max 1.182 ms。
- **真机 (C, WiFi WiFi 推流)**: 首帧到达→首帧渲染 **0.445 ms**; 事件应用
  **33.5 μs** 均值 / 277.8 μs 峰值; 渲染回调时间线 (相对首帧到达): f0
  0.4 ms → f17 1723 ms → f60 5973 ms → f103 10383 ms → f188 18839 ms
  (与 10fps 播放节奏一致)。
- 跨设备绝对单向延迟: 本机环境跨进程 monotonic 被逐进程虚拟化 (实测两进程
  基准不同), 真实 e2e 不可测——如实不报, 不虚构。直播"到达→渲染"打点即
  任务定义的延迟口径。
- 流体积: 248 条消息 119,287B (22.5s 直播), 源视频 5,887,651B 的 ~2%。

## 5. 判词

**PASS**。CSG 直播推拉端到端闭环: PC 按 10fps 直播节奏把胡广生包的 MES1
事件流推给真机, 真机逐事件解码累积场景图, 事件序号连续、计数对账一致、
末态场景图与打包版逐位一致, 每 5 事件渲染回调节奏正确。格式 MLV1 定稿:
逐事件独立、自描述、除首帧 MANIFEST 外零前置依赖, 载荷与 MES1 打包位级
同构 (拉流端解码器与打包容器 replay 225 帧逐帧 PASS)。

遗留 (非阻塞): 真机 C 拉流器源码为一次性验证产物已删, 若要常驻真机需
将其转正入仓 (本次主仓文件白名单不允许); 跨设备绝对 e2e 需时钟同步
(如 NTP/PTP 或回传打点) 才可测。
