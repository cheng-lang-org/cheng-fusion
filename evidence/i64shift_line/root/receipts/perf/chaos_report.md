# Chaos Report — VPN 中途杀服务端（dosg cheng-hy2-tun restart）

- 设备: GBJ0222B24021692（蜂窝 + VPN 已连接, session=7 起点）
- 出口: root@dosg, 单元 cheng-hy2-tun（ExecStart=/root/cheng-lang/artifacts/apps/vpn-proxy-server exit, Restart=always RestartSec=3s）
- 端点: https://unimaker.fun/perf/index.html（探测）、/perf/payload20m.bin `-r 0-5242880`（负载）
- 注入手段: 仅 `systemctl restart cheng-hy2-tun`；未碰 nginx / 手机 UI 开关 / force-stop

## 一、注入时刻与时序（实测 epoch）

| 事件 | 时刻 |
|---|---|
| 负载 start | ts=1787775410 |
| 注入（systemctl restart 发出并被 ssh 返回） | ts=1787775455 = **T+45.0s**，remote UTC **20:17:39** |
| 负载结束 | ts=1787775503（T+93，含尾请求收尾） |

journalctl 对照：20:17:39 Stopping→Stopped→Started（同秒）→ 主进程即刻 `exit status=1/FAILURE`；此后每 3 秒 systemd 自动重启，连续 **20 次** Main process exited（应用日志统一报 `tcp syscall: bind failed: address already in use (98)`）；**20:18:43** 第 21 次 Started 成功并稳定至今。控制面 crash-loop 持续 **64 秒**。

## 二、两个口径的服务端下线时长

- systemd 控制面视角（含本次 restart 生效到出现稳定实例）：**64 秒**（20:17:39 → 20:18:43）。
- 数据面/客户端可感知视角：**0 秒中断**——轮询首轮（注入后 +4s）即 200，横跨注入点的全部负载请求均成功。

`port_listen`（`ss -H -ltn 'sport = :7443' | wc -l`）在整个轮询期为 **0**，阶段 D 终态复查才变为 1（TCP 7443 LISTEN 0.0.0.0:7443；UDP 7443 有监听）。

## 三、客户端可用性轮询（chaos_poll.csv）

| elapsed_s(自注入) | port_listen | tunnel_fetch |
|---|---|---|
| 4 | 0 | OK(200) |
| 14 | 0 | OK(200) |

恢复判定（连续 2 次 OK）：recovery_seconds = **20**（ssh+adb+curl 往返开销计入区间）。首次 FAIL 不存在 → **客户端不可用时长 = 0 秒**。终态复测（阶段 D 后）：index.html → `200 1.84s`。

## 四、并行负载统计（4 路 × 90s，chaos_load_*.csv）

行格式 `off_s code size time_total`：

| lane | 请求数 | ok(2xx) | 非2xx | 成功字节 | 平均耗时 | 最大耗时 |
|---|---|---|---|---|---|---|
| 1 | 17 | 17 | 0 | 85.0MB | 5.43s | 7.85s |
| 2 | 17 | 17 | 0 | 85.0MB | 5.44s | 7.34s |
| 3 | 16 | 16 | 0 | 80.0MB | 5.70s | 10.40s |
| 4 | 16 | 16 | 0 | 80.0MB | 5.57s | 9.69s |

- 合计：**66 请求 / 66 成功 / 0 失败**，错误码分布仅 `66 × HTTP 206`（range 部分内容，size 恒为 5242881B）。
- 隧道总吞吐：330MB ≈ **0.32GB / 90s**。
- 按 10s 分桶成功率：9 个桶（0s–89s）全部 100%；含注入点的 40s–49s 桶 7/7 成功、50s–59s 桶 7/7 成功，**失败集中处：无**。

## 五、恢复后终态

- dosg: `systemctl is-active` = **active**；NRestarts = **20**；journalctl 近 10min `error|fail` 计数 = **40**（即本次 20 次 FAILED × 2 行型式构成主体，systemd 记录；应用自身日志文件无时间戳）。
- server log tail（`vpn-proxy-server.log` 尾部特征行）：`vpn-proxy protocol hy2-tun-v1 / exit dns resolver 8.8.8.8 / fixed policy ok / tcp syscall: bind failed: address already in use (98)` 反复出现，最后一组对应 20:18:43 前的失败启动。
- 应用 UI（uiautomator dump，receipts/perf/uic_dump.xml）：**“已连接”**，`core: connected`，**session 仍为 7（未递增）**，`protect: calls=202 ok=202 fail=0`。无需等待重试（UI 首查即为已连接）。
- 当前唯一相关进程：pid 764455（20:18 启动），无双实例并存痕迹。

## 六、异常清单（全部来自实测）

1. 【高危·待审计】restart 该单元触发了 64 秒控制面瘫痪（20 次 exit-1 crash-loop，EADDRINUSE），但端到端隧道全程零中断（负载 66/66 成功 + 探测全 200）。这意味着实际承载流量的转发路径与 cheng-hy2-tun 单元的存活状态脱钩——systemd 下当前未见第二进程持有端口，占住 7443 导致 bind 失败的持有者未能回溯定位。regalloc 式结论：**流水线名字不等于接线**，本单元疑似不是实际数据面的承接者，需后续核对 NAT/转发链路与其它常驻组件。
2. `port_listen(TCP 7443)` 在 crash-loop 整个窗口恒为 0，直至稳定实例出现才为 1；若以该指标作健康探针会在"表面正常"期漏报，健康检查应以端到端 fetch 为准。
3. `vpn-proxy-server.log` 由 StandardOutput append 写入但无时间戳，无法与 journalctl 对齐单次启动；建议加时间戳输出。
4. 统计口径：range 下载成功码为 206 而非 200，首版统计脚本曾误判为 66 全失败，已修正后重出（本文件数字均为修正口径）。
5. 本次 session 未自动递增（仍为 7）：客户端未经历重建路径——与其完全未感知故障一致，未能覆盖"客户端自愈"分支。

## 附：产物文件

- receipts/perf/chaos_load_1..4.csv、chaos_poll.csv、uic_dump.xml
- timestamps: chaos_start_ts.txt=1787775410、chaos_inject_ts.txt=1787775455、chaos_inject_remote_utc.txt=20:17:39、chaos_end_ts.txt=1787775503
- 脚本: chaos_load_driver.sh、chaos_kill_poll.sh、chaos_stats.sh
