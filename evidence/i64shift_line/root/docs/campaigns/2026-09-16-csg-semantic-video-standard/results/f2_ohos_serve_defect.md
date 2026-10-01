# f2_ohos_serve_defect.md — ohos serve 方向缺陷根因 + serve accept 半环修复（任务 f2/T2，2026-09-17）

**判词：F-B §7 的 ohos serve 缺陷拆成两层。**
1. **serve accept 半环缺陷（本轮 Mac 级复现并修复）**：阻塞 accept（`waitMs=-1`）在非阻塞
   fd 上是 EAGAIN 忙转（≈1 次/ms，§7 的 event8×22040 就是它），且半开握手挂死时**永无超时、
   零日志、不泵定时器**——客户端首包之后只要收不到任何后续包，T_SERVE 线程就无声消失。
   修复：两个 serve 形态（exe 主循环 + HAP `ssm1q_serve_serve_once`）改有界
   `AcceptGlobalTimed` 切片轮 + 空闲泵。Mac 探针全绿（基线/丢 flight 自愈/挂死后二次客户端恢复）。
2. **首包之后的客户端数据报未到达鸿蒙 listener socket（上游面，登记给 T1）**：Mac 探针证明
   当前树客户端首 Initial=169B（与 §7 实测逐字同值）且每 250ms 稳定重传（一次拨号 107 包）；
   §7 服务端 1ms/次的 recvfrom 自旋却只见到 1 个 event9、rx_queue=0——**包根本没到 socket**，
   不是服务端没收。谁吃了重传（旧 q2 客户端无重传 / wlan 省电 / 陈旧 IP 首包残留）由 §5
   证伪实验在真机裁决。只要后续包能到，服务端既有 resend 路径可自愈（探针 A 实证）。

排除项（有反证，勿再查）：服务端 flight 未发出/发错地址/ohos 代码生成/TLS 源码回归——
同 lib 同进程环回握手 PASS（F-B §2）、9/12 同代码鸿蒙 serve 跨机握手 PASS（task_x §3.3）、
git 9/12→今 serve 路径仅 2 个 TLS 提交（叶子 pin=客户端侧、PSK=VPN 面）。

---

## 1. serve 循环全链（读码结论）

路径：`ssm1_moq_serve.cheng` 主循环 / `ssm1q_loopback_export.cheng ssm1q_serve_serve_once`
→ `msquictransport_native.accept` → `MsQuicNativeAccept` → `msquicNativeAcceptTimed(-1)`
→ `msquicNativeAcceptBlocking`（src/quic/native_runtime.cheng:5669）→
`msquicNativeRecvDatagramDirectInto(id, **-1**, …)`（:4422）。

关键分支：
- `waitMs=-1` **跳过 poll 等待**（`:4430 if waitMs >= 0` 门），直接 recvfrom；而 bind 时
  `udpEnableNonblock` 已把 fd 设非阻塞（datapath_udp.cheng:587）→ 每次(recvfrom→EAGAIN→
  `SleepMs(1)`)=event8 err=11 一发。**该忙转在 darwin/android 同样存在**，只是别处握手
  秒过，看不见。
- `AcceptBlocking` 全程**不调 pump**：无 server-flight 重传（`msquicNativePumpRetransmit`
  只在 pump 里）、无握手 deadline（那是 `AcceptTimed(waitMs>=0)` 分支 :5755-5787 的机器）。
  flight 只在处理 Initial 时内联发一次；唯一恢复路径=客户端重传 Initial 触发
  `same_initial_after_flight` resend（ProcessPacketFill :4074-4089）。
- 握手应答构造/发送（`InitServerSession`→`ProcessServerInitialDirect`→`SendServerFlight`
  →`SendWire`→`MsQuicDatapathGlobalSendUdp`）逐环核对：cur slot 由 dcid 路由绑新会话槽、
  clientAddrText 先写后读、fromId=SessionListenerDatapathId 在 StartListener 里已设
  （:5081 既有修复）——**无槽漂移窗口**。

## 2. Mac 级探针（.scratch/t2d/，本轮实测）

产物：`serve_mac`/`fetch_mac`（当前树，arm64-apple-darwin exe）+ `udp_proxy.py`
（用户态单向丢包代理，免 sudo）。载荷 `.scratch/ma/huguangsheng.ssm1`。

| 探针 | 场景 | 结果 |
| --- | --- | --- |
| 基线 | 127.0.0.1 直连 | PASS，sha256=be20ab8e…（与 F-B A' 轮同值） |
| A | **丢前 2 个 server→client 包**（32B ACK-Initial + 722B Handshake flight 全丢） | 客户端 250ms 重传 Initial → 服务端 resend 路径补发 → 握手+传输 **PASS**（自愈存在且好使） |
| B | **只放行客户端第 1 个包**（§7 形态） | 客户端实际发出 **107** 包（首发 **169B**，与 §7「169B Initial」同值）；服务端日志停在 `listening`，**25s 零输出零超时**（=§7「T_SERVE 零 accept 日志」的生成器） |
| CPU | 空闲 5s cputime | 旧 accept 0.18s vs 修复后 0.04s（忙转≈1 次/ms 实锤，量级 ~5% 核，非满核） |

## 3. 根因假说（排序）

- **H1（首位，上游面→T1）**：首包之后的客户端数据报未到达 ohos listener socket。
  证据：§7 服务端以 ~1ms 节奏 recvfrom（必吃掉任何到达包并逐个记 event9）却只有 1 个
  event9、rx_queue=0；探针 B 证明当前树客户端会发 107 包。候选子因：
  a) §7 实测客户端是旧 q2_fetch（机上历史件），其 Initial 重传行为未验证；
  b) wlan 省电/AP 上行丢弃（首包后链路未保温）；
  c) 首包是陈旧排队残留/拨号 IP 过期（event9 的 from= 与客户端实 IP 对不上即坐实）。
- **H2（本轮已修复）**：serve accept 半环忙转+无超时+零日志+不泵。即使 H1 解决，
  任何一次半开挂死仍会把 T_SERVE 线程无声吞掉——必须修，已修（§4）。
- **H3（排除）**：服务端 flight 未发出/发错/代码生成/TLS 回归。反证：环回 PASS（同 lib）、
  task_x §3.3 旧构建跨机握手 PASS、git 9/12→今无 serve 路径源变化、sendto/pton/protect
  等原语均被 ohos 客户端方向（B1 PASS）实证可用。

## 4. 候选修复（已落地，2 个允许文件，待真机验证）

1. `src/tools/ssm1_moq_serve.cheng`（exe 形）：主循环 `accept(listener)` →
   `AcceptGlobalTimed(ServeAcceptSliceMs=20)`；空闲切片（ErrorText=="msquic: accept timeout"）
   泵一次 `msquicNativePump(1)` 后继续等；真错误才 `ERR accept`+100ms 退避。
2. `src/tools/ssm1q_loopback_export.cheng`（HAP 形，§7 实际形态）：`ssm1q_serve_serve_once`
   同法改 `AcceptGlobalTimed(QServeAcceptSliceMs=100)`；空闲 → 泵一次 + 返回
   `FAIL serve_accept idle`（NAPI 线程既有「FAIL serve_accept 空闲重试」合同不变）。

修复后语义：握手进行中仍在 accept 内推进（同旧）；半开挂死由 accept 内部 20s handshake
deadline 回收 → 返回空闲切片 → 泵+重入；忙转消失（poll 等待）；T_SERVE 每≤100ms 有日志。
注：ohos `cheng_fd_wait_readable` 热返回（task_x §3.3 登记）会让切片内 poll 退化为即时
返回，但切片轮语义仍正确（每轮泵），CPU 代价不高于旧忙转；poll 本体修复归运行时层。

**验证（Mac 级，全过）**：修复后 serve 重编，基线 PASS；探针 A（丢 flight）自愈 PASS；
探针 B 后第二客户端恢复 PASS（stalled→recycle→served=2，sha256 PASS）；空闲 CPU 0.18→0.04s/5s。
**ohos obj 双件重编过**：`ssm1_moq_serve` obj、`ssm1q_loopback_ohos.o`
（11,924,235B，sha256 前 16=3c8b6a0066c5e0ee，unresolved=0，.scratch/t2d/）。

## 5. 真机验证步骤（给 T1）

1. 按 fb_ohos_rebuild.md §1.4 重链 libssm1napi.so（换入新 `ssm1q_loopback_ohos.o`，
   其余 obj 原样），HAP 重装，auto-publish ON，**保留 §3 同款 udp_debug 胶水一轮**。
2. 跑 serve 方向（当前树 Mac fetch_mac / 安卓新 fetch exe → 鸿蒙 serve），读 hilog：
   - 应见 T_SERVE 周期性 `FAIL serve_accept idle`（可观测性判据；不再无声消失）；
   - 统计 event9 次数并核对 from= 地址 vs 客户端实 IP：event9>1 且仍 FAIL → 抓 event1/2
     （sendto）查 flight 发射面；event9==1 → H1 坐实，进 3。
3. H1 子因证伪：a) 换当前树客户端重跑（排除 q2 旧件）；b) serve 期间对链路灌 ping
   （排除省电）；c) 首包 from= 异常则清场换 IP 重跑（排除残留/过期 IP）。
4. 握手若通、卡在 negotiate 扫描 <1s 耗尽 → task_x §3.3 的 fd-wait 热返回（运行时层，
   非本修复范围），按其 §6.2 清偿。

## 6. 产物

| 项 | 值 |
| --- | --- |
| 修改 | src/tools/ssm1_moq_serve.cheng、src/tools/ssm1q_loopback_export.cheng（各 +12/-1 行级） |
| Mac 件 | .scratch/t2d/{serve_mac,serve_mac2,fetch_mac,udp_proxy.py} |
| ohos obj | .scratch/t2d/ssm1q_loopback_ohos.o（3c8b6a0066c5e0ee…）、probe_serve_ohos2.o（unresolved=0 双件） |
| 探针日志 | .scratch/t2d/*_{base,pa,pb}.log |
