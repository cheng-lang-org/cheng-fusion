# task_m2_mobile_transport.md — SSM1 MoQ 秒开跨机验证（Mac serve ↔ 安卓真机 fetch）

日期：2026-09-11。归属：CSG 资产管线。状态：**完成**（跨机真 QUIC 双向断言全 PASS）。
车头 `/private/tmp/cheng_w126_re`（2026-09-07 冻结 C 车头）。克隆根
`/Users/lbcheng/cheng-f24/anchor_clones/streamdev`。真机：HUAWEI DCO-AL00，
serial `GBJ0222B24021692`（HarmonyOS/Android 12，arm64-v8a）。
实验工作区：`streamdev/artifacts/mobile_m2/`（全部产物/桥/日志）。
新增源码（零既有文件改动）：`streamdev/src/tools/ssm1_moq_serve.cheng`、
`streamdev/src/tools/ssm1_moq_fetch.cheng`。

---

## 1. 判词

- **跨机秒开数据面成立**：真机 WiFi 直连（RTT avg 17.4ms）下，dial 后
  ready→首帧就绪 **152–156ms**（3 轮稳定），两段逐字节长度/内容全部断言通过
  （chunk 段 sha256 == 包内内容 CID）。低于宿主壳本地基线下限 184ms。
- **承载判定**：`adb reverse` 不可用（QUIC/UDP 不过 reverse 的 TCP 隧道，
  真机 127.0.0.1 fetch 实录 `FAIL dial msquic native: handshake ! ready`）；
  **WiFi 同网段直连通用**（Mac 192.168.1.7 ↔ 真机 192.168.1.6，QUIC-v1/UDP
  端到端，TLS pinned-leaf 校验直接过）。
- 打通跨进程栈的三处必修（全部在工具层，未改 quic/libp2p 栈源码）：
  ① 双端扫描循环显式 `msquicNativePump(1)`（跨进程无人泵 UDP）；
  ② 扫描窗口精确收敛到会话槽总数 N_SLOTS=8（窗口 64 时 `CurSlot*16+idx`
  越界 `gClientAppStream[128]` → 双端对称 brk 崩溃，lldb 定位
  `msquicNativeClientAppStreamAt`/`ServerAppStreamAt`）；
  ③ 段 drain 的 EOF 语义 = `Err("msquic: stream closed")`（peer shutdown 后
  buffered 空才报，数据不丢），不是 0 字节读。

## 2. 双端设计要点

协议 = opensmoke 现役调用序列的跨进程化（`libp2p_moq_segment_stream` 原语全
保留），stream4 = manifest 全文段、stream8 = 首关键帧 chunk 段，同一 dialed
session 派生，串行多连接（serve 每连接 serve 2 段后打 `conn=N served=2` 继续下一
accept，实测 3 连接）。

### serve（`ssm1_moq_serve.cheng`，argv `<ssm1路径> [port]`，默认 4443）
1. 载包：`AssetReaderLoadBounded`（256MiB 配额）+ `StreamManifestParseEx(embedded)`
   逐字节解析真实包 → `headerLen = payloadOffset[0]`（embedded 合同：payload
   区起点 = header 尾），`kf = NearestKeyframeIndexForTime(0)`。
2. listen `0.0.0.0:port`（`Libp2pQuicAddrFromHostPort` + `Libp2pQuicConfigureTls`
   现役 localhost pinned policy，不做 hostname 匹配，跨机 IP 直连直接过）。
3. 每连接：流4/流8 各 negotiate 三步（客户端 `ClientSendNegotiate` → 服务端
   扫 `AppRecvAvailable(1, sid)` 定位数据槽 + `ConnFromPipeIdx` 构造读端 →
   `ServerNegotiate`）→ `ServerReadRequest` → 段写出。
4. **段写出为服务端权威段长**：manifest 段 = `ServerWriteRange(0, headerLen)`；
   chunk 段 = `ServerWriteRange(kfOffset, kfLen)`，且请求 range 必须与包内
   声明逐字段一致才 serve。不再用 `ServerWriteRequestedRange(请求 clamp)`——
   `CopyRange` 的 clamp 边界是整个包文件，客户端上界请求会涌出 payload 区
   （实测 2.95MB 全包涌出 → 1MiB 流控窗 stall）。
5. Ctrl-C 退出；accept 失败分支 100ms 退避（曾因端口占用+无退避刷出 548MB 日志）。

### fetch（`ssm1_moq_fetch.cheng`，argv `<server地址> [port]`）
地址格式 = quic_transport 现役 dial 形态：IPv4/IPv6 字面量，内部
`Libp2pQuicAddrFromHostPort` 构造 `/ip4/<host>/udp/<port>/quic-v1`。
1. dial（真 QUIC 1-RTT）→ 两流 negotiate（opensmoke 同序每流闭环）→ t_ready。
2. stream4 请求 manifest 段（length = 256MiB 配额上界，服务端权威段长）→
   drain（`connRead` 循环，`Err("msquic: stream closed")` = EOF）→
   `FetchParseManifestHeader` 纯头解析（audioRef 后恰 EOF ⇒ 段长精确性证明）→
   `NearestKeyframeIndexForTime(0)` 定位。
3. stream8 请求该 chunk 段（精确 range）→ drain → 双断言：
   `chunkLen == payloadLen` 且 `sha256(chunkSeg) == cid[kf]`（SSM1 v1 内容
   CID 即 payload sha256 hex，打包器实测一致）。
4. monotimes 时间线 6 项 + 段长度，FAIL 行带诊断（sha256/kfIdx/off/len）。

### 纯头段解析合同分化（工具内复刻，未改 manifest.cheng）
`StreamManifestParse` 的 range 校验以传入字节长度为界（opensmoke v1 域：
payload 声明须落在 manifestLen 内），真实 embedded 全包的 payloadOffset 深达
2.9MB，纯头段过不了该条。fetch 只收得到纯头段，故在工具内复刻头解析合同
（magic/version/count/条目/audioRef 全同款校验，原子读取复用现役导出
`manifest.StreamManifestI64At`/`StreamManifestHexByte`/`reader.AssetReaderU32At`），
range 完整性由 serve 端 embedded 解析背书 + chunk sha256 逐字节断言兜底。
@borrows 标注必须带（裸 fn 返回含 seq 的结构体时 seq 元素为 0xDD 未初始化垃圾）。

### negotiate/段等待的 pump 织入
同进程 opensmoke 里对端 `pipeWrite`/dial 内部 pump 顺带喂本侧会话；独立进程
无人驱动 pump，UDP 包不进协议机、app 数据永不落表（症状 = negotiate 槽 30s
超时）。双端扫描循环每候选槽 `bind(1000001+k) → msquicNativePump(1) →
AppRecvAvailable`，k ∈ [0,8)。

## 3. 编译记录（四产物，真实输出）

mac 侧（车头内部链接器）：
```
/private/tmp/cheng_w126_re system-link-exec --in:src/tools/<file>.cheng \
  --emit:exe --target:arm64-apple-darwin --out:<abs out>
# serve: 闭包 48817 行, 3.65s；fetch: 48903 行, 5.17s
```
android 侧（M1 修复链全量复用：fakeNDK wrapper + stdio 桥 + patched libc.a，
新增 errno 桥）：
```
cd streamdev && rm -rf .cheng-csg-core && find . -maxdepth 2 -name "*.envelope" -exec rm -f {} \;
ANDROID_NDK_HOME=$PWD/artifacts/mobile_m1/fakendk \
PREPEND_OBJ=$PWD/artifacts/mobile_m2/android_link_bridge.a \
INJECT_FLAGS="-L$PWD/artifacts/mobile_m1/patched_lib" \
/private/tmp/cheng_w126_re system-link-exec --in:src/tools/<file>.cheng \
  --emit:exe --target:aarch64-linux-android --out:<abs out>
```
- `android_errno_bridge.c`（新增，M2）：provider.core 引 `__errno_location`
  （glibc 语义），NDK 27 bionic 只有 `__errno()` → `-static` 链接期 undefined
  symbol。桥 `int *__errno_location(void){ return __errno(); }`，与
  `android_stdio_bridge.o` 经 `llvm-ar rc` 合并为 `android_link_bridge.a`
  （wrapper `PREPEND_OBJ` 单词注入，首定义生效）。
- PT_TLS 门禁：fetch_android `p_align = 0x40`（patched libc.a 生效，过
  Android 12 bionic 64 对齐门）。
- 产物（sha256 前 16 位）：
  `3ef9b9f7c6a19d94… ssm1_moq_fetch_android.exe`（20.7MB，
  push 真机 `/data/local/tmp/cheng_ssm1_moq_fetch`）
  `cf272311aa4b7616… ssm1_moq_serve_android.exe`
  `9ef7f7b5ac0e027e… ssm1_moq_fetch_mac.exe`
  `c088c801db195641… ssm1_moq_serve_mac.exe`

## 4. 承载判定（真实尝试）

| 承载 | 结果 | 证据 |
| --- | --- | --- |
| `adb reverse tcp:4443 tcp:4443` + 真机 fetch 127.0.0.1:4443 | ❌ 不可用 | reverse 只转 TCP，QUIC/UDP 端到端不成立；真机实录 `FAIL dial msquic native: handshake ! ready`（45s 内握手不完成）。QUIC over TCP 隧道无通用替代（协议本体就是 UDP），不做 TCP 隧道回退。 |
| WiFi 同网段直连（真机 192.168.1.6 → Mac 192.168.1.7:4443） | ✅ 通用 | 3/3 轮全 PASS；`ping` RTT min/avg/max = 7.3/17.4/27.6ms，0% loss。 |

## 5. 真机时间线（真实输出，3 轮）

```
SSM1 MoQ fetch timeline:            # 轮1
  dial (transport+tls+handshake): 1068000000 ns
  connect ready (negotiate x2): 136000000 ns
  manifest segment (4625 bytes): 32000000 ns
  parse + locate first keyframe: 0 ns        # bionic monotimes 1ms 粒度, 16K 条目 <1ms
  keyframe chunk segment (65572 bytes): 124000000 ns
  ready->first-frame ready: 156000000 ns
  total dial->first-frame ready: 1360000000 ns
fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B sha256-match=be20ab8ec6be22e984ffc92163bb5b73e2d22e4394b92d44cd127de18d3eb5a6
DEVICE_RC=0
# 轮2/轮3: ready->first-frame = 152ms / 152ms; chunk 段 124ms 恒定; 全部 DEVICE_RC=0
```
serve 端对应：`conn=1..3 served=2 totalServed=6 manifest=4625B chunk=65572B`。
mac 双进程 localhost 对照（同工具，3 轮）：ready→首帧 29.8/33.2/34.2ms，
dial 471–490ms（同进程 opensmoke connect ready 463–492ms 量级一致——其大头
同为槽扫描 10ms 步进，非网络时间）。

## 6. 对照结论（秒开判定）

| 场景 | ready→首帧 | 说明 |
| --- | --- | --- |
| macOS 同进程 opensmoke（localhost 真 QUIC） | 13.3–13.9ms | 合成 484B/120B 夹具 |
| Mac 双进程本工具（localhost 真 QUIC，真实 4.6KB/64KB 段） | 29.8–34.2ms | 含跨进程扫描量化 |
| **安卓真机 WiFi 直连（本任务）** | **152–156ms** | 真实 WiFi RTT 7.3–27.6ms |
| 宿主壳本地基线（task_shell_core_wire） | 184–307ms | 秒开对照线 |

**判定：跨机真实 WiFi RTT 下 152–156ms < 184ms 基线下限，秒开预算达标**。
构成：manifest 段 32ms（1 RTT + 服务端读包）+ chunk 段 124ms（65572B over
QUIC 拥塞启动爬坡，≈530KB/s 受初始 cwnd + RTT 量化限制）+ negotiate 136ms
（扫描 10ms 步进 × 跨机 RTT，可优化项）。50ms RTT 外推（opensmoke §6 预算
100–150ms 冷连接）与实测形状一致；4G/5G 更高 RTT 时 chunk 爬坡将主导，需 M3
并行化对冲。

## 7. BLOCKED 项

无。OHOS 不在本次范围（其编译器层阻塞维持 M1 结论不变）。

## 8. M3 建议

1. **两流并行**：stream4/stream8 本就独立，fetch 在发出 manifest 请求后立即
   预发 chunk 请求（首关键帧未知时按「manifest 段长度 = 头 12B 探测 + 上界
   重试」或缓存上一次 manifest），预算可从串行 ~150ms 压到 ~1 RTT + chunk
   传输时间。
2. **扫描量化消除**：negotiate ack/段等待的 10ms 步进扫描是 ready 段大头
   （真机 136ms），换 `connRead` 阻塞读 + 超时或 1ms 步进，预期 -100ms 量级。
3. **拥塞启动**：chunk 段 124ms 受初始 cwnd 爬坡主导；如资产允许，首关键帧
   chunk 拆小/首屏专用低码率支流，或服务端在 negotiate 后主动 push（省 1 RTT 请求）。
4. **栈层登记（未动，跨进程暴露）**：① native runtime 会话槽游标缺陷
   （opensmoke §7.1）在跨进程下影响放大，任何「无 pump 等待」路径都静默饿死，
   根修应把 pump 织入 `AppRecvAvailable`/accept 等待路径；② `ScanSlotCount`
   等常量应以 N_SLOTS 导出而非工具侧硬编码 8；③ `__errno_location`（provider
   core）应在 android provider 平台门禁内由后端生成 `__errno` 直呼。

## 9. 证据文件

`streamdev/artifacts/mobile_m2/`：四个 exe + sha256（本报告 §3）、
`android_errno_bridge.c/.o`、`android_link_bridge.a`、mac/android link.log 与
map。真机侧 `/data/local/tmp/cheng_ssm1_moq_fetch`（+ M1 遗留
huguangsheng.ssm1）。后台 serve 日志（conn=1..3 served=6 段）随会话记录。
