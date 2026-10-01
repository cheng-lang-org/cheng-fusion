# task_mes1_stream_protocol —— MES1-Stream v1（MST1）：场景图事件逐消息即时序列化 + 流式传输协议（CSG 直播协议基础）

日期：2026-09-13
工具：`tools/csg_mes1_stream.py`（宿主 python/numpy 纯实现；MES1 打包侧复用 M11 编解码器 `csg_mask_event_codec.py` 原路径，事件记录字节与状态迁移函数 `apply_events` 与容器版完全同一份代码；全部数字真实运行）
产物：`artifacts/csg_asset_pipeline/mes1stream/`
上游：M11（MES1 协议 v1：事件类型/可逆性/体积账，p1_struct_lz 43,565B PASS）、M13（warm-start GT × MES1 组合收口，p1_struct_g sha `dd31fb7f…` / gz `7c38ae29…` / lz `63498ec4…` 三档 sha 锚定）、M10（定谳：事件化是唯一治本路径）、SSM1 pack / MoQ opensmoke（chunk 帧化与传输锚点）

## 1. 流式语义

**从「拍完打包」到「边生成边推」**：MES1 容器要求全部 225 帧事件编码完才能落盘消费；MST1 把同一事件序列改为**有序消息序列**，事件在生成的瞬间（每 100ms tick）即被序列化推流。

- **保序**：每消息带 `seqNum`（u32，流内从 0 起严格连续 +1）。接收端断言连续性，跳号 = 硬失败（不做插值兜底，let it crash）。
- **语法自包含**：每消息字节单独可完整解析（payload 全字段走查至恰好耗尽，不依赖前后消息的 framing 状态）。语义为增量（需当前场景图状态），由 seq 保序 + 按序重放保证。
- **状态机**：接收端从 MANIFEST 建立帧 0 全量态（内嵌关键帧），此后按 seq 逐消息应用事件；**「从第一个 PlaneBorn 开始构建」的纯增量形态同样合法**——MANIFEST 允许 `keyLen=0`（无关键帧），帧 0 全量改由 ts=0 的 PLANE_BORN 建立。两形态已实测逐位同构（§5-③）。
- **确定性**：按序重放得到确定性的场景图状态序列；本协议的可逆性判据 = 流重放状态与打包容器重放状态**225 帧逐位一致**（参数 f64 精确相等 + z/share 相等 + 掩码 array_equal）。

## 2. 消息格式（全小端）

```
消息 = [u8 msgType][u32 seqNum][u32 timestampMs][payload]        # 头 9B
msgType ∈ {0=MANIFEST, 1=PLANE_BORN, 2=PLANE_DEATH, 3=PLANE_MUTATE, 4=NOOP, 5=EOS}
timestampMs = 帧×100（10fps；225 帧 → ts ∈ {0, 100, …, 22400}，EOS 在 22500）
```

| 消息 | payload | 说明 |
|----|----|----|
| MANIFEST | `magic "MST1"` + `ver u16=1` + `W/H/frameCount u16×3` + `paramsMode u8` + `maskEnc u8` + `qmin/qmax f64`（量化域）+ `camLen u32 + 相机模型 JSON`（pinhole-disparity: f=180.0/cx=63.5/cy=127.5/disparityBaseline=4000.0）+ `keyLen u32 + KeyBlob`（首关键帧全量 = MES1 KeyBlob 原样，v0 消费者锚点兼容；keyLen=0 → 无关键帧形态） | 唯一全量锚；自包含建立帧 0 态 |
| PLANE_DEATH | `n u8 + n×tid u16` | 结构事件 |
| PLANE_BORN | `n u8 + n×(MES1 Add 记录原样)` | tid u16 + a,b,c f64 + z u8 + shareCenti u16 + runCount u16 + runs；出生平面全参+全掩码，像素精确 |
| PLANE_MUTATE | `maskEnc u8`（与 MANIFEST 冗余声明，**换取单消息自包含解码**）+ `n u8 + n×(MES1 Mutate 记录原样)` | tid + flags(bit0 掩码Δ, bit1 参数Δ) + 按需字段；**逐帧参数 Δ 也走本消息**（flags=2 记录，与 MES1 参数流语义同构），因此协议没有独立的 PARAM 消息类型 |
| NOOP | 空 | 显式心跳：每 100ms tick 至少一条消息（容器版 NoOp 是隐式零字节）；用于 tick 对齐与断流检测 |
| EOS | `u32 totalMessages`（含自身）+ `u32 frameCount` | 流终结，与 MANIFEST 对账 |

事件记录字节**原样复用 MES1**（Add/Mutate/参数Δ flags 按需字段编码不变），状态迁移复用容器版同一 `apply_events`——这是逐位可逆的结构保证，不是事后对拍。

## 3. 帧化适配（SSM1 chunk / MoQ 段）

**chunk profile（存储/seek 对齐，与 SSM1 容器兼容）**：chunk = 独立 MoQ 对象/SSM1 chunk payload，与 DPD1 并列注册，1000ms/chunk：

```
offset 0:  magic "MST1"        # chunk payload 自描述
offset 4:  version u8 = 1
offset 5:  comp u8             # 0 原样 / 1 gzip / 2 lzma（作用于 msgs 区）
offset 6:  reserved u16 = 0
offset 8:  rawLen u32          # msgs 区压缩前字节数（lzma raw 解压必需）
offset 12: chunkIndex u32
offset 16: startTsMs u32
offset 20: msgCount u16
offset 22: msgs 区: msgCount × [u32 msgLen + msg]
```

- chunk 0 = MANIFEST（相当于 SSM1 manifest + 首关键帧段，opensmoke 已验证的两段取回形状）；chunk k≥1 = 帧 10(k-1)+1..10k 的全部 tick 消息；EOS 归末 chunk。胡广生 225 帧 = **24 chunk**（1+23）。
- chunk 内消息数/边界自描述，**每个 chunk 可独立解析**（语义仍需前置状态；随机访问由「最近 MANIFEST 重同步点 + 按序重放」满足，与容器版重放语义一致）。
- cid 沿用 SSM1 规则：sha256(chunk payload 全字节)。

**live profile（最低延迟）**：不加帧化，**每消息 = 1 个 MoQ 对象 / QUIC datagram**（9B 头 + payload；典型 tick 消息 ~134B，事件帧尖峰 ≤5,529B = 4 个千字级 frame）。

## 4. 延迟分析（序列化侧实测，传输侧为设计预算）

- **首帧延迟 = 1 个 MANIFEST 消息的序列化 + 传输**。实测序列化 **7.2µs**（7,135B = 关键帧 7,001 + 量化域/相机/长度字段 125）；对比打包版首帧需等待全部 107,670B body 编码完才可开始传输。
- **传输**：7,135B ≤ 6 个 ~1,200B QUIC frame，单 RTT 内传完；本机预算 **<5ms 是设计目标**。锚点：SSM1 MoQ opensmoke 实测段取回 5.8–9.3ms（libp2p stream 每段一个请求-响应周期形状，含每段 1 RTT；datagram 化可省段请求开销）。**端到端首帧 <5ms 未实测（无真机），见 §8。**
- **稳态吞吐**：每 100ms 一个 tick 消息（10fps 采样）。224 tick 实测：p1 mean=502.4B/tick、p95=4,255B（结构事件帧尖峰）、max=5,529B；p0 mean=375.2B/tick。全流 121,210B / 22.5s ≈ **5.4KB/s**（raw），per-chunk lzma 后 ≈ 2.2KB/s。
- **生成侧序列化开销可忽略**：每消息 mean 0.65µs / p95 1.46µs / max 5.83µs（p0 口径）——事件「生成即推流」不构成产线瓶颈；解码侧全流重放 5.3–14.4ms（225 帧）。
- 打包版 vs 流式首帧：打包版首帧可用 ≥ 编码全程（M13 实测全链 9.6s GT + 编码）+ 全容器传输；流式首帧 = 1 消息。**直播语义只有流式可达。**

## 5. Roundtrip 可逆性验证（真实运行输出）

源 = 磁盘 sha 锚定的打包容器（严禁伪造）：p1_struct_g `dd31fb7f…`（M13 主变体，paramsMode=frame/global）与 p0_struct `097604a8…`（M11 全事件化反证变体，paramsMode=event/bbox，天然覆盖 NOOP/bbox/param-in-mutate 路径）。`mes1stream_run.log` 原文：

```
---- 源 p1_struct_g (容器 114717B sha dd31fb7f58e55941…) ----
消息 249 条 ({MANIFEST:1, PLANE_BORN:15, PLANE_MUTATE:224, PLANE_DEATH:8, EOS:1}), 消息字节 119686, chunk 24 个
解码[raw]: 14.4 ms, 状态逐位匹配打包版=True
解码[gzc]: 13.6 ms, 状态逐位匹配打包版=True
解码[lzc]: 15.0 ms, 状态逐位匹配打包版=True
二次解码确定性: True
反向重打包: 114717B ≡ 原容器 True (sha dd31fb7f58e55941…)
首帧(MANIFEST): 7135B 序列化 7.2 µs
每消息序列化: mean=0.65 µs p95=1.46 µs max=2.83 µs
tick(100ms)负载: 224 tick, mean=502.4B p95=4255B max=5529B

---- 源 p0_struct (容器 88993B sha 097604a8853cef84…) ----
消息 249 条 ({MANIFEST:1, PLANE_BORN:15, PLANE_MUTATE:22, NOOP:202, PLANE_DEATH:8, EOS:1}), 消息字节 91188, chunk 24 个
解码[raw]: 5.3 ms, 状态逐位匹配打包版=True
解码[gzc]: 5.9 ms, 状态逐位匹配打包版=True
解码[lzc]: 7.1 ms, 状态逐位匹配打包版=True
二次解码确定性: True
反向重打包: 88993B ≡ 原容器 True (sha 097604a8853cef84…)
首帧(MANIFEST): 7135B 序列化 4.0 µs

---- 变体 p1_struct_g_nokf (MANIFEST keyLen=0, 帧0=PLANE_BORN) ----
无关键帧变体状态 ≡ 关键帧变体(225 帧逐位): True; 帧0平面数=5

---- 体积对照 (同一事件内容) ----
none : 流式 121210B vs 打包 114717B (Δ+6493, 1.057×)
gzip : 流式 58041B vs 打包 51415B (Δ+6626, 1.129×)
lzma : 流式 49579B vs 打包 43565B (Δ+6014, 1.138×)
```

判据链（全 PASS，两源 × 七项）：① 流解码重放状态 ≡ 打包容器重放状态（225 帧逐位，三种 chunk 压缩变体一致）；② 流→容器**反向重打包 ≡ 原容器字节**（sha256 一致——双向逐位）；③ 无关键帧变体 ≡ 关键帧变体逐位；④ 每消息/每 chunk 独立可解析；⑤ 二次解码确定性；⑥ seq 严格连续；⑦ EOS 对账。

## 6. 体积账：流式 vs 打包 overhead（同一事件内容，p1 主变体）

| 口径 | 打包（MES1 容器） | 流式（MST1 chunk） | Δ | 比 |
|----|----|----|----|----|
| 无压缩 | 114,717B | 121,210B | +6,493B | 1.057× |
| gzip | 51,415B | 58,041B | +6,626B | 1.129× |
| lzma | **43,565B** | **49,579B** | +6,014B | 1.138× |

Δ+6,493B（raw）精确分解（合计校验 = 6,493 ✓）：

| 项 | 字节 |
|----|----|
| chunk 帧化（22B×24 chunk + 4B len 前缀×249） | +1,524 |
| 消息头 9B×249 | +2,241 |
| MANIFEST 相对容器 header+kdir+keyBlob | +125（相机模型 JSON 83 + MST1 声明/长度字段 42） |
| MUTATE 消息 maskEnc 冗余声明 + n 字节 | +448 |
| 参数记录 flags 重复声明 +1B×2,594 − 参数帧 n 字节×224 | +2,370 |
| DEATH/BORN 消息 n 字节 | +23 |
| EOS payload | +8 |
| 容器 header+kdir 下线 | −46 |
| EventDir + REC_HDR 下线（seq/帧化取代目录） | −200 |

结论：**流式化 overhead ≈ +5.7%（raw），换首帧从「全容器编码完」降到「1 消息」**。流式无法做整流 lzma（容器版 43,565B 依赖整 body 上下文），per-chunk（1000ms 窗口）lzma 49,579B 仍过 <50KB 判据。NOOP 心跳成本 = 9B/条（p0 变体 202 条 = 1,818B，占 p0 raw 流 2.0%）。后续编码空间（v1.1，沿 M11 §7）：varint run + 变长 Δ 在流式下收益相同，另可评估 mutMask 的 per-chunk 字典。

## 7. MoQ/QUIC 对接设计（只设计，不实现）

- **Track 布局**：单订阅两组——`mst1-manifest`（单对象，可靠）+ `mst1-events`（按序可靠 group）。live profile：group=tick chunk 索引、object=tick 内消息序号，每消息一对象；chunk profile：每 chunk 一对象（与 SSM1 chunk 索引 1:1，cid 可先经 SSM1 容器离线分发、直播期在线生成）。
- **QUIC 映射**：典型 tick 消息 ~134B → 单 datagram（RFC 9221）；事件帧尖峰 ≤5,529B → 4 frame/1 RTT。事件消息走可靠流（事件丢失 = 状态机断链，必须重传而非跳过）；NOOP 心跳可走 unreliable datagram（丢了等下一 tick，语义恒等）。禁用 FEC/启发式补洞——seq 跳号硬失败由 QUIC 可靠重传兜底。
- **按序重组**：接收端按对象序交付 → seq 连续性断言 → 状态机；EOS `totalMessages` 对账终结。
- **中途加入（late join）**：v1 单 epoch，MANIFEST 只在流头；joiner 等下一个 MANIFEST 重同步点。v1.1 设计位：MANIFEST 周期重发（如每 300 chunk/5min 或按 join 请求），携带 epoch，joiner 从最近 MANIFEST 重放——事件稀疏（22/224）使重放成本 ≈ 一个关键帧 + 数十条 mutate。
- **与现有栈接线**：SSM1 容器侧只需注册新 chunk payload 类型 MST1（magic 自描述，manifest 条目结构/尾规则/cid 不变，同 task_ssm1_pack 的 B 线适配口径）；cheng 侧 MoQ 段取回机制（task_ssm1_moq_opensmoke 已打通的 manifest 段 → chunk 段顺序取回）原样复用。

## 8. BLOCKED / 后续

- **端到端首帧 <5ms 未验证（无真机）**：序列化侧已实测 µs 级；传输侧只有 opensmoke 的 libp2p 段取回锚点（5.8–9.3ms/段，含每段 1 RTT 请求-响应）。<5ms 需 datagram 化取回路径，待 M2/M5 传输栈上真机量测。
- Cheng 侧编解码接线不在本任务范围（同 M11/M13 口径，宿主 python 参考实现）。
- 非阻塞后续：①中途加入的 MANIFEST 周期重发（v1.1 epoch）；②varint run/变长 Δ（M11 §7 同项，流式同收益）；③跨素材事件密度复核（事件密度同时主导流式 tick 尖峰分布）。

## 9. 产物清单

```
tools/csg_mes1_stream.py                        MST1 参考编解码器（容器↔消息双向 + 帧化 + 七项判据链）
docs/campaigns/2026-09-06-csg-asset-pipeline/task_mes1_stream_protocol.md   本文
artifacts/csg_asset_pipeline/mes1stream/
  mst1_p1_struct_g.{raw,gzc,lzc}.bin   p1 流（chunk 对象序列）：121,210 / 58,041 / 49,579B
  mst1_p0_struct.{raw,gzc,lzc}.bin     p0 流（NOOP 路径）：92,712 / 36,832 / 29,700B
  mst1_p1_struct_g_nokf.raw.bin        无关键帧变体流（帧0=PLANE_BORN）
  mes1stream_report.json               全部真实数字（判据链/体积/延迟/overhead 模型）
  mes1stream_run.log                   完整运行日志（§5 引用原文）
```
