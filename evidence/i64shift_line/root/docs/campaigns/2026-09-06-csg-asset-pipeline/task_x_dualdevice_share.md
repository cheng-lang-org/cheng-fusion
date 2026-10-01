# task_x_dualdevice_share.md — 双真机互发（安卓发布端 serve → 鸿蒙接收端 fetch+装载）跨设备验证

日期：2026-09-12。设备：安卓 HUAWEI DCO-AL00 `GBJ0222B24021692`（WiFi 192.168.1.6）、
鸿蒙 HUAWEI Mate 70 Pro+ `3KN0224C18003262`（WiFi 192.168.1.2），同 /24 直连；
Mac 192.168.1.7 同网（对照拨号用）。

**终判：跨设备互发全链 BLOCKED(运行时层)。** 网络层完全打通（双向 ICMP 0%/有损窗口
实测、安卓→鸿蒙 UDP 数据报到达经 `/proc/net/snmp` 计数实证）；两台真机的 QUIC
**服务端角色**各自卡在 cheng quic 运行时层缺陷（安卓 idle-accept SIGSEGV；鸿蒙
accept 后 negotiate 扫描热旋过早耗尽），客户端角色双端均为已证形态。全部缺陷已
定位到可复现层级并留真机证据，归 quic 运行时层战役清单。

---

## 1. 交付物（全部落地，两仓 git 零写操作）

1. **主仓新增** `src/tools/` 两变体各加两个导出（同名双仓同步至 apkdev/ohosdev 克隆）：
   - `ssm1q_serve_serve_once(out,cap)`：fetch_run 内联 serve 半环（stage 3）原样拆出
     的独立服务半环——accept + 双流 negotiate + 权威推段 + flush + 关闭。使发布进程
     的 listener 可以被**外部**连接服务（原 fetch_run 的 accept 只服务本进程自拨）。
   - `ssm1q_fetch_client_run(host,port,out,cap)`：纯客户端 fetch——无 `!q_listening`
     守卫、无 stage 3 服务半环、无环回 lip 第二跳。stage 4-8 与段/组装全局槽交换
     逐字节同源，sha256==cid 双断言不变；时间线头标 `client fetch`。
   - `QWaitReadable` 诊断增强：pump Err 与扫描窗口耗尽区分（返回 -2/-1，pump 错误
     文本进 `q_lastErr`）。
2. **UniMaker ssm1android（安卓 APK）**：JNI shim 加 `ssm1qServeAcceptStart`
   （服务循环线程：OK 继续服务 / `FAIL serve_accept` 空闲重试（M5 serve exe accept
   主循环同款语义）/ 其余 FAIL fail-stop）+ FetchThreadMain 切 `ssm1q_fetch_client_run`
   （接收端角色）；`ssm1loop.map` 加新 JNI 符号；libssm1loop.so 重链
   （21 导出符号，16KB LOAD align，w126 车头 obj）。
3. **UniMaker hongmeng（鸿蒙 HAP）**：NAPI shim 加 `ssm1qServeAcceptLoopStart`
   （同款服务循环线程，hilog T_SERVE 逐连接上报）+ FetchStart 线程按
   `g_fetchClientMode` 切纯客户端；Index.ets：`RECV_HOST` 常量、publish() 后自动
   起对外 accept 循环、aboutToAppear 自动跑发布（反转拓扑形态）、RECEIVE 按钮
   保留跨设备 client fetch。
4. **真机预置**：安卓 `/data/local/tmp/cheng_ssm1_moq_serve`（M5 r5 serve exe，
   20,663,920B）+ `huguangsheng.ssm1`（2,955,365B，c11e2997… M3/M5/M6b 同包）；
   `/data/local/tmp/cheng_ssm1_moq_fetch`（M5 r5 纯客户端 exe，M5 同物）。

## 2. 网络拓扑确认（全部实测）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 双机 IP | 安卓 192.168.1.6 / 鸿蒙 192.168.1.2（同 /24） | `adb shell ip route` / `hdc ifconfig wlan0` |
| 安卓→鸿蒙 ICMP | 通，0% 丢包，rtt min/avg/max = 9.8/113/193 ms | `ping -c 10` |
| 鸿蒙→安卓 ICMP | 通，实测窗口 40% 丢包（WiFi 有损时段），24/138/463 ms | `ping -c 10`（环境间歇丢包族，M5 §0 同域已知） |
| 安卓→鸿蒙 UDP 到达 | 实证到达鸿蒙 IP 栈：拨号 20s 窗口内 `Udp InDatagrams` +24（背景 20s 增量为 0），socket 0.0.0.0:4443（`/proc/net/udp` :115B）在位 | `/proc/net/snmp` 拨号前后差分 |
| Mac(192.168.1.7) 对照拨号 | 同样 `FAIL dial handshake ! ready`（缺陷在鸿蒙服务路径，非安卓客户端） | mac r5 fetch exe 实测 |

## 3. 真机证据链（真实日志，按时间序）

### 3.1 安卓发布端（M5 r5 serve exe 直跑 + APK 内服务循环，两条路均实证崩溃）

serve exe 直跑（两次独立复测一致）：

```
serve pack=/data/local/tmp/huguangsheng.ssm1 fileLen=2955365 chunks=45 headerLen=4625 kfChunk=0 kfRange=[4625,70197)
serve listening /ip4/0.0.0.0/udp/4443/quic-v1
Segmentation fault            ← listening 后 <1s 崩（无任何连接到达窗口）
```

APK 内服务循环（重编 obj `ssm1q_loopback_android_x.o` unresolved=0 → 重链 → 装机；
`am start` 后自动 serve+accept 循环）：

```
11:18:26.428 SSM1E2E: T_PUBLISH click->ready totalMs=295 resp=OK serve … port=4443 state=listening
11:18:26.430 SSM1   : T_SERVE accept loop started
11:18:26.430 SSM1   : Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x400000000000, tid 15654 (serve 线程)
    backtrace #00 pc 0x5ce580 libssm1loop.so   ← 寄存器 x25/x26 现场为 "FAIL serve_acce…"
                                                 构造中; 崩点指令 ldr w0,[x1], x1=errno 指针=0x400000000000
```

判读：安卓 QUIC 运行时**服务端 idle 扫描路径**（accept 的空扫 + errno 读取）在真机
必崩；exe 与 .so 双形态一致。M5/M6b 时代安卓从未以服务端角色跨机运行，本次首次
暴露。M6b 环回形态不触发（accept 调用时回包已在队列，不走 idle 等待分支）。

### 3.2 鸿蒙发布端（w126 车头构建 → ORC registry_miss；t_drop_v3 重建后存活）

w126 车头 obj 构建的 libssm1napi.so（首版服务循环装机）：安卓拨号包到达并被
处理后 ~0.7s 进程 abort（appspawn `exit with signal:6`），hilog stderr 桥直出：

```
stderr m6q orc_miss p=0x0000000000000001 hdr=0xfffffffffffffff9 … dead=0x4c live=0xe5
      cheng_orc_release_failure code=registry_miss operation=normal_release detail=wrong_object_or_owner
stderr SSM1_SEGFAULT sig=11 addr=0x5abf4b1000 pc=0x5b40d45098 … SSM1_FP11 lr=0x5cc8770008
      （FP11 符号化 = cheng_panic_cstring_and_exit；基址锚 SSM1_BASE lr_fn − 0x4b5dc）
```

以 **t_drop_v3 车头重编重链**（M6q drop 布局指纹根修对本路径同样生效）后：
进程存活、接受跨设备连接（下方 conn=1），ORC miss 消灭。**教训登记：ssm1 鸿蒙链
重编必须用 t_drop_v3 车头，`ssm1_harmony_build.sh` 的 CHENG_DRIVER 默认值
（/private/tmp/cheng_w126_re）已过时。**

### 3.3 鸿蒙发布端（t_drop_v3）：accept 成功，negotiate 扫描热旋过早耗尽（当前最终阻塞点）

```
11:57:08 SSM1: T_PUBLISH … port=4443 state=listening        ← t_drop_v3 构建
11:57:08 SSM1: T_SERVE_LOOP OK serve accept loop started
   （安卓 r5 fetch exe 拨 192.168.1.2:4443，~0.8s 后客户端退出）
11:57:16 SSM1: T_SERVE conn=1 resp=FAIL serve_negotiate_4 detail=scan_failed spins=3000 stream=4
安卓侧（同一时刻）：
FAIL negotiate_ack_slot_4
```

判读：跨设备连接**已被 accept**（conn=1），但服务端 negotiate 扫描
（QWaitReadable：pump→扫槽→`WaitReadableForSide(side,20ms)`）在 <1s 内烧完
QScanMaxSpins=3000（正常应为 3000×20ms≈60s+，即 fd 等待**热返回**——0.07ms/旋），
在客户端 negotiate（握手后 ≥1 RTT 才到）到达前放弃。同代码在 macOS 正常阻塞
（M5 serve 6 连接 60s 级 idle 实证）；鸿蒙 M6q probe 的 wait 步骤均为「数据已在
队列」形态，从未覆盖空等，本次首次暴露。指向 ohos datapath `fd wait` 语义
（poll 对所用 fd 恒即时返回）——`cheng_fd_wait_readable_bridge` 本体为标准 poll，
差异在 datapath 提供给它的 fd 或其状态（归运行时层定位）。

### 3.4 已排除项（逐条真机实证，防再查）

- WiFi 隔离/防火墙：双向 ICMP 通、安卓 UDP 到达鸿蒙 IP 栈（§2 计数差分）——不成立。
- 鸿蒙 listener 未绑/掉绑：t_drop_v3 实例 `/proc/net/udp` 0.0.0.0:115B 在位
  （6s/30s 两次抽检；w126 时代实例曾观察到 5 分钟后 socket 消失，与该实例的
  ORC abort 同因，t_drop_v3 后未复现）。
- 客户端角色：安卓 r5 fetch exe（M5 同物）拨号/断言路径正常工作（两次给出对称
  错误面）；鸿蒙 client fetch 为 W 线已证同源代码。

## 4. 对照表（环回基线 vs 跨设备实测）

| 阶段 | 鸿蒙环回（W 线基线） | 安卓环回（M6b 基线） | 跨设备实测（本轮） |
| --- | --- | --- | --- |
| 发布即就绪 T_PUBLISH | 292-330ms | 345/373ms | 鸿蒙 284-291ms（3 次）✅ |
| QUIC 握手 dial | ~1.3s（量化登记项） | ~1.0s | 跨设备包到达实证（snmp +24/20s 窗口）；握手**服务端侧**中断 ❌ |
| negotiate+推段（数据面） | 140ms | 100ms | 未达（服务端扫描缺陷）❌ |
| sha256 断言 | PASS（环回） | PASS（环回） | 未达 ❌ |
| T_RECEIVE（click→首帧） | 2180/2174ms | 1948/2048ms | 未达 ❌ |
| 服务端存活 | 存活 | 存活 | 安卓：idle 即 SIGSEGV；鸿蒙：t_drop_v3 后存活 ✅（附缺陷 3.3）|

## 5. 判词

- **网络层（WiFi 直连拓扑）：通过。** 双向 ICMP、安卓→鸿蒙 UDP 到达、Mac 对照
  拨号同域排障全部实证。
- **发布即就绪（秒发的发布侧）：通过。** 鸿蒙 284-291ms（安卓 295ms，w126 实测）
  与环回基线同量级。
- **跨设备互发全链：BLOCKED(运行时层)。** 三个运行时缺陷（§3.1/§3.2/§3.3）依次
  拦截，最深处为鸿蒙 negotiate 扫描 fd-wait 热返回。全部为 cheng quic 运行时层
  问题，工具层（本轮新增的 serve_once/fetch_client_run 导出面）已打通到缺陷边界。

## 6. 归运行时层战役清单（本轮新增登记）

1. **安卓服务端 idle-accept SIGSEGV**：accept 空扫/errno 路径读得 0x400000000000
   假指针（exe + .so 双形态复现，crash 现场齐）。M2/M5 时代安卓从未跑服务端跨机，
   属首次暴露的移植面。
2. **鸿蒙 negotiate 扫描 fd-wait 热返回**：`WaitReadableForSide` 在 ohos 即时返回，
   `QScanMaxSpins` 窗口 60s+ 量级塌缩到 <1s。建议从 `msquicNativeDatapathUdpFd`
   返回的 fd 语义与 `cheng_fd_wait_readable_bridge`（标准 poll）的差异查起；
   建议补一条「空等不耗旋」的 datapath 契约测试（环回 probe 永远数据在队，测不出）。
3. **构建纪律（已整改）**：ssm1 鸿蒙链必须 t_drop_v3 车头（w126 obj 在服务路径
   触发 ORC registry_miss → panic）；建议把 `ssm1_harmony_build.sh` 的
   CHENG_DRIVER 默认值切到 t_drop_v3 并在 report 里打印车头哈希。

## 7. BLOCKED 项与如实记录

1. **跨设备 3 轮取中位未达成**（判据：dial/manifest/chunk/sha256-match/T_RECEIVE
   分解 + 环回对照）——被 §6.1/6.3 拦截，数字无从伪造。恢复顺序建议：先修 6.3
   （鸿蒙侧单点），安卓端仍需先修 6.1；两端客户端角色均已在位，服务端缺陷修复后
   预计无需再动工具层即可全链跑通。
2. **安卓 APK（ssm1android）装机态为 11:15 w126 构建**（含 auto-serve，会触发
   §3.1 崩溃；服务循环按钮 SERVE 保留作复现入口）。其 fetch_client_run 接收形态
   已在 shim 就绪但未装机——待 §6.1 修复后一并重编（t_drop_v3 obj）再上。
3. 本轮 Index.ets / MainActivity.kt 与并行 lane（M7/M8 深度管线）发生两次共享文件
   碰撞：MainActivity.kt 本轮改动被对方版本覆盖（本轮已改用不依赖 APK 的 M5 exe
   路径完成安卓侧验证）；Index.ets 本轮改动以最新内容重放成功。后续若重做 APK
   接收面需先 rebase 对方版本。
4. 两仓 git 零写操作；adb/hdc 仅 install/shell/file/list/ping；主仓 src/tools 仅
   两变体文件的新增导出与 QWaitReadable 诊断增强。
