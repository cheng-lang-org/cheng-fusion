# chaos2 混沌对抗验证报告

日期：2026-08-27（时序用本地 UTC+8，服务器日志引用为 UTC）
对象：Android VPN `org.cheng.hy2tunvpn`（adb 序列 GBJ0222B24021692，蜂窝网络）+ 出口 dosg(165.245.176.65) 唯一监督者 `cheng-hy2-tun.service`
注入：`systemctl restart cheng-hy2-tun`（唯一允许手段），负载期间 T+45 执行一次，事后补救性再执行一次

## 结论

**判定：FAIL。** 服务端具备自愈能力（两次注入均以约 65 秒崩溃循环后恢复 LISTEN）；但客户端隧道在服务端恢复后永不自动重连，补救性服务端重启也无法踢活，隧道从注入起持续不可用直至终态。应用 UI 显示“已连接”、session id 保持 7 未递增——客户端状态机对链路死亡完全失察。

## 时序表（相对注入）

| # | 事件 | 本地时钟 | 相对注入 |
|---|------|----------|----------|
| 1 | 负载启动（4 路 adb curl 循环，各 90 秒） | 04:53:34 | -46s（T0） |
| 2 | 注入发起（ssh systemctl restart） | 04:54:20 | T+0 |
| 3 | 服务端 restart 完成 | 04:54:24 | +4s |
| 4 | 客户端首次 FAIL（generate_204 → 000） | 04:54:24 | +4s |
| 5 | 服务端崩溃循环：bind EADDRINUSE，systemd 自动拉起共 20 次（日志 UTC 20:54:29–20:55:28，RestartSec=3s） | 04:54:29–04:55:28 | +9s～+68s |
| 6 | 服务端 LISTEN 恢复（轮询首次 port_listen=1） | 04:55:26 | +66s |
| 7 | 轮询窗口结束（60 次 ×3s，tunnel_code 全 000），客户端未恢复 | 05:06:59 | +759s |
| 8 | 终态单点实测 probe（max-time 8）：000 | ≈05:08 | ≈+13min |
| 9 | 补救性二次 restart 完成（delay=0s） | 05:11:43 | — |
| 10 | 二次后复现崩溃循环 20 次，LISTEN 于重启完成后 ~65s 恢复（UTC 21:12:48 计数到 20 并稳定） | 05:12:48 | — |
| 11 | 二次恢复观察窗 15 次 / 165 秒，probe 全部 000（ consec_ok 始终 0 ），RECOVERY_FAILED | 05:14:24 | — |

关键指标：
- 注入 → 服务端 LISTEN 恢复：**+66s**（轮询粒度 3s；journal 显示真实稳定点约 +68s）
- 客户端首次 FAIL：**+4s**
- 客户端恢复 OK：**从未发生**（759s 轮询窗 + 13min 后单点实测 + 二次重启后 165s 观察窗均为 000）
- 总不可用秒数：**≥22 分钟且延续至报告时刻（未恢复）**

## 阶段 B 负载统计（4 路 CSV，90 秒真负载 1MiB 分段下载）

| 流 | 总请求 | 成功 206 | 失败 | 字节 |
|----|--------|----------|------|------|
| chaos2_load_1.csv | 3 | 0 | 3 | 0 |
| chaos2_load_2.csv | 43 | 41 | 2 | 42,991,657 |
| chaos2_load_3.csv | 43 | 41 | 2 | 42,991,657 |
| chaos2_load_4.csv | 15 | 12 | 3 | 12,582,924 |
| **合计** | **104** | **94** | **10** | **98,566,238（94.00 MiB）** |

- 失败码全部为 `000`（超时/连接失败）；流 1 的 3 次请求全部耗满 max-time≈30s 饿死。
- 成功样本耗时 min=0.510s avg=0.664s max=2.974s。
- 局限：CSV 无时间戳，10 次 000 无法精确归因到注入前后；末尾存在正常 206 与隧道已死的generate_204 结果并存，说明失败分布跨窗口，需下一轮加时间戳字段定位。

## 阶段 D 终态

服务端：
```
systemctl is-active -> active
NRestarts -> 20   （最近一个崩溃周期的计数；每轮注入恰好累计 20 次后绑定成功）
ss: LISTEN 0 16 0.0.0.0:7443 users:(("vpn-proxy-serve",pid=781690,fd=3))   [TCP]
ss: UNCONN 0.0.0.0:7443 users:(("vpn-proxy-serve",pid=<当时实例>,fd=4))      [UDP/QUIC]
本机 -> 165.245.176.65:7443 TCP 握手 OK（公网可达性正常）
```

手机应用（单次 uiautomator dump，文本摘录）：
```
已连接 / 极速
core: connected
session: 7          ← 相对基准 7 未递增：链路死亡+两次服务端重启，客户端未重建任何新会话
protect: calls=307 ok=307 fail=0
tun packets: rx=3561 tx=2091；tun fd wait=49224 ready=3564
last: rx=tcp:52958->443 198.18.0.135（fake-ip）
dns: rx ... q=1 ans=0 rcode=0 csum=1 a=0.0.0.0    ← 应答 0 条、地址 0.0.0.0
TEST GOOGLE: google: not tested ; rx: 0 / tx: 0
```

## 异常清单

- **A1 服务端 bind 竞态崩溃循环（复现率 2/2）**：restart 后旧周期遗留 socket（TIME_WAIT/并发残连）导致新进程 `tcp syscall: bind failed: address already in use (98)`，Exit=1，`Restart=always`(3s) 连续拉起 20 次才绑定成功；第二次注入前无任何业务连接仍复现（疑公网扫描残连参与占坑）。LISTEN 缺位恒定约 65–68 秒。修复方向：监听 socket 加 SO_REUSEADDR 或启动期重试绑定，而不是靠 systemd 盲拉。
- **A2 客户端永不自动重连（核心缺陷）**：+4s 断链后，服务端 LISTEN 恢复 +66s 起、直至终态 20+ 分钟、以及补救性二次重启后的 165s 观察窗，generate_204 探测持续 000。服务端侧两轮 restart 均无法触发客户端重建会话。
- **A3 客户端状态假阳性**：UI/核心自认 “已连接”、session 固定 7 不递增、测试行 rx/tx=0、DNS 应答 a=0.0.0.0/ans=0；状态机缺少“上游会话失效”检测与自愈入口。
- **A4 负载路 starving 不均衡**：同参数 4 路在 90s 内产出 3/43/43/15 个请求，其中一路全 30s 超时；蜂窝带宽与 adb shell 串行化下调度极度倾斜，压测工具本身需按流加时间戳与独立超时再校准。
- **A5 可观测性缺口**：journal 只有 systemd 启停行，进程退出原因只落在 append 日志 vpn-proxy-server.log，且退出码 1 无 stderr 栈；排障需双源拼图。

## 产物

- 轮询原始数据：receipts/perf/chaos2_poll.csv（elapsed,port_listen,tunnel_code）
- 负载原始数据：receipts/perf/chaos2_load_{1..4}.csv
- 编排脚本：receipts/perf/chaos2_run.sh、chaos2_recover.sh；统计脚本 chaos2_stats.py
- UI dump：receipts/perf/chaos2_uidump.xml
