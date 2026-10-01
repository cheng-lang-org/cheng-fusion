# 任务：SSM1 → MoQ 段流秒开冒烟（opensmoke）

日期：2026-09-11。归属：CSG 资产管线。状态：完成（同进程双端真 QUIC localhost 交付）。

## 1. 目标

验证「秒开」数据面：SSM1 manifest + 首关键帧 chunk 经 cheng libp2p MoQ 段流
取回即渲染就绪。服务侧注册两段，客户侧按「manifest 段 → B 线解析定位首关键
帧 → chunk 段」顺序取回，逐段计时，逐字节断言。

## 2. 交付（files/action/verify/done）

| 项 | 内容 |
| --- | --- |
| files | `src/game/assets/stream/opensmoke.cheng`（夹具单一事实源 + 段范围/首关键帧定位合同 + 槽扫描编排，新增）；`src/tests/csg_ssm1_moq_opensmoke.cheng`（双端链路驱动，新增） |
| action | ① 服务侧把「SSM1 manifest 字节（纯头 484B）+ 载荷 blob 中首关键帧 range」注册为两个 MoQ 段；② 客户侧顺序取回 manifest 段 → `StreamManifestParse` → `NearestKeyframeIndexForTime(0)` 定位 → 取 chunk 段；③ 逐段 monotimes 计时 |
| verify | APFS 锚点克隆 libp2pdev 上车 cheng_w126_re 编译 + exe 真跑 4 轮全 PASS：两段取回字节与源/独立重算期望逐字节一致、B 线对取回 manifest 定位首关键帧成功 |
| done | 时间线输出真实（见 §5）；50ms RTT 外推见 §6；差距如实记录见 §7 |

## 3. 调研结论：两节点取段流最小现役调用序列

模板来源：`libp2p_moq_segment_stream_smoke` + `quic_multistream_moq_av_smoke`
（一条连接两条 stream 各跑一段 MoQ）。落地时序（全部现役公开原语）：

```
qruntime.initMsQuicSettings()                       # allowDatagram=true
listener = InitMsQuicTransport(); setSettings; ConfigureTls
             ; AddrFromHostPort("127.0.0.1", 0); start
client   = InitMsQuicTransport(); setSettings; ConfigureTls
clientLegacy = dial(client, listener.listenAddr)    # 真 QUIC 1-RTT 握手
serverLegacy = accept(listener)
streamClient4 = ConnDeriveStream(clientLegacy, 4, 4)   # 同会话派生流
ClientSendNegotiate(client, streamClient4)          # multistream select 45B
#  —— native runtime 缺陷绕开（见 §7.1）：数据落在 pump 槽而非 token 槽 ——
ks = OpenSmokeWaitReadable(side=1, stream=4, want=45)   # 扫描 AppRecvAvailable
streamServer4 = ConnFromPipeIdx(1000001+ks, 1, 4, 4)    # 按数据槽构造读端
ServerNegotiate(listener, streamServer4)
kc = OpenSmokeWaitReadable(side=0, stream=4, want=45)
clientReader4 = ConnFromPipeIdx(1000001+kc, 0, 4, 4)
ClientReadNegotiateAck(client, clientReader4)
# stream8（chunk 段）同构一套

# 每段一个请求-响应周期（stream4=manifest, stream8=chunk）：
ClientOpen(reader, clientReader4, request)          # 写请求帧（4B len + payload）
ServerReadRequest(streamServer4)                    # 读请求
ServerWriteRequestedRange(streamServer4, backing, request)  # 按 range 写 + shutdown
OsmDrainAll(reader, chunk)                          # 客户端 drain 到长度满足
teardown: 只 ConnClose(dial/accept legacy) + Stop(listener)，流句柄不单独关
```

## 4. 夹具（B 线 v1 冻结合同约束下的形状）

- manifest 段 = 484B 纯头：magic/version/count + 4×chunk 条目（start 0/100/200/300，
  dur 100，kf 1/0/0/1）+ audioRef（即 EOF）。
- 载荷 blob = 480B：4×120B chunk payload，确定性模式 `(i*37+j*11)%251`（客户端
  可独立重算，不依赖服务端源）。
- v1 合同：audioRef 结束必须恰为 EOF（尾部多余字节显式拒绝），payload 范围校验
  以 manifest 文件长度为界（`offset+len <= manifestLen`）→ 声明域 [0,484)，故
  载荷 blob 独立、声明数值适配 484 域。

## 5. 冒烟时间线（真实运行，4 轮）

```
SSM1 opensmoke fixture: chunks=4 manifest=484B blob=480B kfChunk0=[0,120)
PASS server-side registration self-check (parse + locate)
PASS manifest segment fetched byte-exact
PASS B-line parse + first keyframe locate on fetched manifest
PASS keyframe chunk segment fetched byte-exact (expectation + declared range)
SSM1 MoQ opensmoke timeline:
  t0 connect ready (dial+accept+negotiate x2): 478361000 ns
  manifest segment (484 bytes): 7650000 ns
  parse + locate first keyframe: 24000 ns
  keyframe chunk segment (120 bytes): 5792000 ns
  total connect->first-frame ready: 491829000 ns
  ready->first-frame ready: 13468000 ns
csg_ssm1_moq_opensmoke ALL PASS
```

4 轮波动：connect ready 463–492ms；manifest 段 4.4–8.1ms；parse 23–25µs；
chunk 段 5.8–9.3ms；ready→首帧就绪 13.3–13.9ms。connect ready 的大头是槽扫
描轮询的 10ms 步进量化（每方向 ~24 轮），非网络时间。

## 6. 50ms RTT 首帧预算外推

假设：QUIC 1-RTT 请求-响应每段；带宽 50Mbps（移动宽带保守下限，484B/120B 的
传输时间 <0.1ms，可忽略）；冷连接 TLS1.3 握手 1-RTT。

| 场景 | 预算 | 构成 |
| --- | --- | --- |
| 冷连接顺序取回（本次链路形状） | **150ms** | 握手 50 + manifest 50 + chunk 50 |
| 冷连接两流并行取回（stream4/8 本就独立，可同发） | **100ms** | 握手 50 + 并行段 50 |
| 热连接（0-RTT 恢复） | **50ms** | 单 RTT 取回 |

对照本地播放器实测基线 184–307ms：本地实测 ready→首帧 13.3–13.9ms（远低于
基线）；50ms RTT 外推 100–150ms 也低于基线下限 184ms。**结论：秒开预算达标**
（前提是上表假设成立；外推未含服务端磁盘/索引冷缓存与拥塞启动爬坡）。

## 7. 差距与未解决问题（如实）

1. **native runtime 会话槽游标缺陷（根修项，本次只读绕开）**：dial/accept 返回
   的 conn token 恒指槽 0，而 pump 分发把 app 数据写进 pump 槽（实测槽 1），
   app-stream 二级表按全局 `msquicNativeCurSlot` 索引 → 直接用 derive token 读
   恒空（`pipe read timeout`，探针 nonblocking 轮询 3s 0 字节）。workaround =
   扫描 `AppRecvAvailable` 定位数据槽 + `ConnFromPipeIdx` 构造读端。根修应把
   会话槽随连接 token 传递（`src/quic/native_runtime.cheng`），不在本任务范围。
2. **真双进程（twoproc）未交付**：存量门禁冒烟（`libp2p_moq_segment_stream_smoke`、
   `quic_multistream_smoke` 等）在当前编译器世代全部编译不过（§7.3），且 §7.1
   槽缺陷同样影响 twoproc 接收路径；本次交付为同进程双端 localhost 真 QUIC。
3. **编译器合同收紧导致存量失修**：跨模块托管字段实参（如
   `listener.listenAddr` 直传 dial）被拒，须 `QuicCloneMultiAddress` 中转；托管
   局部值禁止声明后赋值（plain local copy 拒绝），Bytes 累积只经 var 形参
   （`bytesAppend`）填充；`BytesSliceView` 借用视图不可绑定局部（用
   `OpenSmokeRangeMatches` 零拷贝对比）；`Result[托管]` 优先直接消费或 var 绑定。
4. `Libp2pMoqSegmentStreamServerHandleRequestedRange` 薄包装在当前编译器下不可
   编（其可达闭包触发 plain-copy 拒绝），以 `ServerReadRequest +
   ServerWriteRequestedRange` 等价组合替代（语义相同：读请求 → range 写 + shutdown）。
5. v1 容器 payload 声明域受「audioRef=EOF + 以 manifest 长度为界」限制，真实
   资产 blob 只能独立于 manifest 文件存在；声明数值适配 manifestLen 域。v2 演进
   点：payload range 锚定到独立 blob 长度（需改 B 线解析合同，须修订 spec）。
