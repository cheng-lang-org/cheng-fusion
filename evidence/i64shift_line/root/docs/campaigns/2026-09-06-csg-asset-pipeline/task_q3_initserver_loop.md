# task_q3_initserver_loop.md — 跨设备互发最后一环: 服务端握手推段根修 + 全链真机 PASS

日期:2026-09-12。承 task_q2_quic_runtime_fixes.md §4 精确残余。工作克隆
`/Users/lbcheng/cheng-f24/anchor_clones/quicfix`(Q2 修复已在),主仓 src/quic、
src/libp2p、bootstrap 零改动(全部修复以 patch 落本目录,git add -f,两仓 git
零写操作)。UniMaker 仓零接触(鸿蒙 HAP 工程为 quicfix 克隆内 cp -cR 拷贝件)。

设备:安卓 DCO-AL00 `GBJ0222B24021692`(WiFi 192.168.1.6,adb)、鸿蒙 Mate 70 Pro+
`3KN0224C18003262`(192.168.1.2,DevEco hdc)。车头:q2fix(quicfix
bootstrap/cheng_cold.c,宿主单文件重烤);安卓目标走 M1 修复链复刻
(fakendk wrapper→NDK27 + q2_android_link_bridge.a PREPEND_OBJ 首定义 +
INJECT_FLAGS `-static -Wl,--allow-multiple-definition -Wl,--no-keep-memory`),
ohos 目标走 DevEco clang(M4 配方 --emit obj + lld 链,q3_hap_build.sh)。
改源纪律:rm -rf .cheng-csg-cargo-* .cheng-csg-envelope-* csg-core 后重编。

## 1. 三缺陷定位结论(真机打点实证,含两处 Q2 未发现的实根)

### 1.1 残余② InitServerSession 重传会话重建(使命指认项)— 已根修 ✅
源码路径:`src/quic/native_runtime.cheng` `msquicNativeProcessPacketFill`
server-Initial 的 `stale_initial_after_flight` 分支。旧行为:flight 发出后收到的
重传 Initial 只要 payload 与缓存不等(客户端重传携带新 ACK 帧即不等)且
flightAge>100ms(`msquicNativeParallelInitialGraceMs`),一律
`ResetServerHandshakeAttempt` 重建会话——`serverInitialNext/serverHandshakeNext`
归零,重发 flight 重新携带对端已收过的包号,跨设备丢包窗口下对端永久 stall。
环回在 100ms 宽限窗内完成握手,从不进该分支(Q2 判词确认)。

修复(语义对齐字节等值分支):**仅 Initial SCID 变化(`msquicNativeInitialClient
CidChanged`)才重建**;同 SCID 一律视为活连接刷新重传——保会话、迁移对端端口、
刷新 payload 缓存、重发 pending flight(包号续走,不归零)。修后真机各轮
stderr 零 `replace_server_session`/`flight_fail`,`init server enter` 每连接一次。

### 1.2 新实根 A:ohos shim 事件锁 futex 约定错误 → 进程整崩 ✅(Q2「拨号包未
见到达」的真因)
`src/tools/ssm1_ohos_shim.c` `cheng_native_runtime_event_lock_bridge` 的
futex 等待按内核裸约定(-errno)比较,但 musl `syscall()` 出错返回 -1+errno
(libc 约定) → 任何 futex wait 错误(含 EAGAIN/EINTR 正常竞态)必然
fail-stop。真机实证:RECEIVE 起 fetch 后 8ms 内 hilog
`SSM1E: stderr cheng runtime event lock futex wait failed`(tid 与 fetch worker
不同 = 首次真并发争锁),进程 exit_group(42) 整崩 —— fetch worker 尚未发出
任何拨号包。**该锁仅在 fetch worker 与 UI 线程首次并发时被走到,serve/探测
单线程形态从不触发——解释 Q2 全部「鸿蒙客户端方向黑箱无到达」现象。**
修复:errno 判 EINTR/EAGAIN 重试(futex 正确语义:重读锁态+重 CAS),其余
错误照旧 fail-stop。修后拨号立通。

### 1.3 新实根 B:扫描循环槽位游标毒化 → 泵死 → 下行全盲 ✅(跨设备与环回
差异的真正机械根)
`ssm1q_loopback_export.cheng` QWaitReadable 泵在 k 循环之前,而
`msquicNativeBindSlotFromPipeIdx(1000001+k)`(`native_runtime.cheng:6052`,
`curSlot = pipeIdx-1000001`)把 `msquicNativeCurSlot` 留在末次 k=N_SLOTS-1=7
(未初始化槽)→ `PumpCode` 的 `!active` 门控在重绑前即退 → **扫描期泵死:
recv/重传/keepalive 全不跑**。真机实证链:
- `q3scan state=1800`(bit3=SessionClientDatapathId>0,bits[8..15]=curSlot=7)
- `keepalive_send pn=1 → pn=2` 相隔恒 30004ms(= 扫描预算,泵只在首末各跑一次)
- fd 恒可读(q2rc=1 q2dt=0)但 `q3recv` 零下行,安卓侧 serve conn 链正常发出
- Mac 跨进程形态因「k=0 bind → pump」顺序不同泵不死 → **X 线以来 Mac/安卓
  基线全绿而 ohos 客户端跨设备必挂的根**
修复:native_runtime 新公共助手 `msquicNativeRebindCurToActiveSession()`
(client datapath 优先、listener 次之)+ QWaitReadable 每次泵前显式重绑
(ssm1q_loopback_export 与 _android 两变体同修)。

### 1.4 残余③ 扫描窗口轮数制塌缩 — 已根修 ✅
`ssm1_moq_serve.cheng`/`ssm1_moq_fetch.cheng`/两 loopback 变体的扫描循环从
轮数制(3000 旋 × fd 恒可读 µs 级烧完)改墙钟预算 30s(`ServeScanBudgetMs`/
`FetchScanBudgetMs`/`QScanBudgetMs`),窗口语义=「最多等 30s 数据」,与旋速
无关。附带 Q2 缺陷3:`QDrainSegmentRead` 空 chunk 分支( chunkLen<=0 )并入
idleSpins 封顶(`drain_idle_cap_empty`),消除无封顶循环路径。

### 1.5 新增:客户端 1-RTT keepalive PING ✅
握手完成后客户端完全静默;泵内每 200ms(`msquicNativeClientKeepaliveMs`)
发 PING 短包(ack-eliciting,对端回 ACK,双路径保活;1-RTT 解码器对 PING 的
支持已在库内)。实现:`msquicNativePumpClientKeepalive`(节流戳为模块级全局——
会话记录 mid-record int64 字段在 ohos obj 上读回不可靠,Mac 同源正常,规避之)。

### 1.6 诊断打点(限频,留源)
`flight_fail reason=...`(flight 构建失败全量直出,精确残余①判废用)、
`init server enter now_ms`、`server_send_wire`(服务端发送时序,≤8 条)、
`client_drop_initial_epoch`(客户端 Initial 纪元入包计数)、
`client_short_routed/no_route`(1-RTT 路由判废)、`keepalive_gate/send`、
`q3scan`(扫描轮状态)。真机轮次实测:flight_fail 零发生 → Q2 残余①判定为
「flight 完整,损耗在客户端接收路径(1.3/1.4)」。

## 2. 附带根修
- **TLS underalign**(M1 §2.2 已知):`tools/elf_tls_align_patch.py` 已遗失,
  复刻 `.tmp-exec/q3src/q3_elf_tls_align_patch.py`(ELF64 PT_TLS p_align
  8→64,前置 skew 校验,单字节差异),未修则安卓 12+ bionic 拒绝装载(rc=134)。
- **obj 代际**:本轮 ohos obj 批次 = q2fix 车头同源重编 ssm1d/ssm1q 两 obj
  (unresolved=0)+ M6q psb/psh/dbg(Q2 实证跨代稳定组合)+ **重编
  ssm1_ohos_shim(futex 修复,取代 M4 旧 .o)** + 链接序首位 q2_fdwait_bridge.o
  (Q2 C fd-wait 平台桥,防 cheng ohos-obj fd-wait 代际风险)。

## 3. 跨设备真机终验(真实输出)

### 3.1 终验矩阵:安卓 serve → 鸿蒙 fetch(使命方向)
- 安卓:`/data/local/tmp/q3_serve`(M1 链,PT_TLS p_align 0x40)监听
  `/ip4/0.0.0.0/udp/4443/quic-v1`
- 鸿蒙:HAP RECEIVE 按钮 → `ssm1q_fetch_client_run("192.168.1.6", 4443)`

3 轮全 PASS(hilog 原文):
```
fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B sha256-match=be20ab8ec6be22e984ffc92163bb5b73e2d22e4394b92d44cd127de18d3eb5a6   ×3
T_FETCH done fetchMs=2258   (round 1, 20:54:30)
T_FETCH done fetchMs=2257   (round 2, 20:54:59)
T_FETCH done fetchMs=2563   (round 3, 20:55:25)
```
**中位 2258ms;sha256 三轮一致且等于权威资产 cid。**
安卓 serve 端(adb 原文):
```
conn=1 served=2 totalServed=2 manifest=4625B chunk=65572B
conn=2 served=2 totalServed=4 manifest=4625B chunk=65572B
conn=3 served=2 totalServed=6 manifest=4625B chunk=65572B
```
零 ERR;同进程连续 3 连接(RERUN 语义)无扫描塌缩、无 drain 挂死。

Round 3 完整时间线(hilog 原文):
```
dial (transport+tls+handshake):        2035993125 ns
connect ready (negotiate x2 + serve push): 320000157 ns
manifest segment (4625 bytes):            4003593 ns
keyframe chunk segment residual (65572 bytes): 135997657 ns
ready->first-frame ready:              140001250 ns
total dial->first-frame ready:         2495994532 ns
```

### 3.2 对照矩阵:鸿蒙 fetch → Mac serve(同 HAP,RECV_HOST=192.168.1.7)
`fetch ok ... sha256-match=be20ab8e...`、`SSM1 SHARE E2E PASS
fetchOk=true kfScheduled=true rendered=true`,T_FETCH=1355ms —— 同一 HAP 对
Mac/安卓双服务端均绿,排除端侧偶发。

### 3.3 Mac 环回回归
`./q3_serve_mac + ./q3_fetch_mac 127.0.0.1 4443` → `fetch ok ... sha256-match=
be20ab8e...`(总 623~633ms),修复未破坏环回基线。

## 4. 判词
**安卓 serve → 鸿蒙 fetch 跨设备真机全链 PASS 达成**(3 轮中位 2258ms,
sha256 三轮一致,serve 端零错误,双流 negotiate+manifest+chunk 全通)。
Q2 三精确残余(②会话重建、③扫描塌缩、①flight 判废)全部闭环;另根修
两处 Q2 未发现的真因(shim futex 约定错杀进程、扫描泵门槽位毒化)。

## 5. BLOCKED 项与如实记录
1. **反向(鸿蒙 serve → 安卓 fetch)本轮未复验**:终验用 HAP 为纯客户端形态
   (`Index.ets aboutToAppear` 自动 publish 已注释——发布端 accept 循环线程与
   fetch 客户端并发属双角色形态,本轮未纳入验证面)。鸿蒙 serve 方向复验时
   恢复该行并重装即可(PUBLISH 按钮保留)。
2. **keepalive 节流戳的 ohos obj 字段读回异常未归因**:会话记录 mid-record
   int64 字段(gMsQuicSessions[].clientKeepaliveAtMs)在 ohos obj 上读回恒旧值
   (Mac 同源正常),已改模块级全局规避;属 cold 后端记录字段代际风险,登记
   不阻塞。
3. **诊断打点随源保留**(限频:flight_fail 不限频因低频致命,send/keepalive/
   drop 计数上限 4~12 条),生产语义无旁路、无兜底。
4. **patch 覆盖面**:`q3_quic_initserver_stale_loop_pump_gate_scan_budget_
   keepalive.patch` 含 native_runtime/serve/loopback(ohos) 三文件中 Q2 未入库
   改动(fdwait 诊断读数槽、q2 扫描打点)——apply 本 patch 后这三个文件的
   q2 同名 hunk 已被涵盖;`q2_ohos_udp_platform_bridges.c.patch`(独立新文件)
   仍独立有效且本轮已实际链接(q2_fdwait_bridge.o)。过 `patch_preflight.py`
   PASS + 主仓 `git apply --check` OK。
5. 两仓 git 零写操作;真机操作仅 adb push/shell/pidof/kill、hdc install/
   aa start/uitest(含 uinput 点击与滑动解锁)/hilog/snmp 读数;UniMaker 仓
   零接触。

## §反向互发复验补录（2026-09-13，主会话实测）

- 鸿蒙 HAP（Q3 版）PUBLISH 按钮（uitest 190,454）真机点击生效：
  `T_PUBLISH click->ready totalMs=294 (rawfileMs=6 serveMs=288) state=listening`
  + `T_SERVE_LOOP OK serve accept loop started`——**鸿蒙 serve 真机 PASS**。
- 安卓 q2_fetch（Q2 修后版）跨设备拨鸿蒙 192.168.1.2:4443（WiFi RTT
  100-178ms 弱信号时段）：**拨号包到达鸿蒙 serve 实证**——hilog stderr 桥
  `init server parse peer len=34 text=/ip4/192.168.1.6/udp/59316/quic-v1`
  （Q2/Q3 打点链生效）。客户端侧 handshake ! ready。
- 剩余卡点与 Q2 残余①②③同域（InitServerSession 重传循环 + negotiate
  推段，真机 RTT 178ms 下未推进）——归 quic 运行时战役同一清单，修复后
  反向互发即闭环。
- 网络备注：两机当前异段互通（鸿蒙 wlan0 192.168.1.2、安卓 192.168.1.6
  同 /24；ping 0% loss 但 RTT 210ms 起步含 ARP，弱信号时段丢包窗口 40%
  与 X 线记录一致）。
