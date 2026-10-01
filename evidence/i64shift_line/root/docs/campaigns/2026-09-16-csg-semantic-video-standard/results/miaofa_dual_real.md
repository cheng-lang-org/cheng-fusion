# miaofa_dual_real.md — 双真机秒发秒开 L1/L2 正式测量（任务 F-C，2026-09-17）

**判词：L1 接通门 PASS、L2 秒开门 PASS（双方向独立成立）。**
方向 A（Mac serve → 安卓 q2_fetch）与方向 B（安卓 q3_serve → 鸿蒙 HAP fetch）各 10 轮独立 serve/fetch，共 20/20 轮 sha256==cid 完整性 PASS、0 失败：

| 方向 | T_FETCH p50 / p95 / max | 门（p50≤3000/max≤5000） | ready→首帧 p50 | 门 L2（p50≤1000） | 完整性 |
| --- | --- | --- | --- | --- | --- |
| A：Mac→安卓 | 1282 / 3572 / 3572 ms | **PASS** | 86 ms | **PASS** | 10/10，fail=0 |
| B：安卓→鸿蒙 | 1958.5 / 2260 / 2260 ms | **PASS** | 112 ms | **PASS** | 10/10，fail=0 |

口径严格按冻结门 `miaofa_gate_v0.md` §4：方向 A T_FETCH=fetch 工具时间线 `total dial->first-frame ready`（ns→ms）；方向 B T_FETCH=hilog `T_FETCH done fetchMs=`；ready→首帧=时间线 `ready->first-frame ready`。轮次纪律按 §6：每轮独立 serve 进程 + 独立 fetch 发起（方向 B 每轮整应用重启后点击，逐轮 serve PID 全不同）。

---

## 1. 预检（2026-09-17 13:0x–13:1x 实测）

- **IP 复查：三机与冻结门一致，无更新**——安卓 192.168.1.6（`ip route`）、鸿蒙 192.168.1.2（`ifconfig wlan0`）、Mac en0 192.168.1.8。同 /24。
- **ICMP（10/5/4 包窗口实测）**：
  - Mac→安卓：4/5 收包，rtt 8.1/153.0/290.4ms，丢 20%（夜间弱信号窗口，与冻结门记录量级一致）。
  - 鸿蒙灭屏时三向 ICMP 全断（见 §5 环境事件 1）；唤醒后鸿蒙→Mac：0% 丢，5/8/12ms。
  - Mac→鸿蒙唤醒后仍 100% 丢、安卓↔鸿蒙双向 100% 丢：客户端间 ICMP 被过滤；**UDP QUIC 不受影响**（冒烟 + 20 正式轮全通实证）。
- **SHA-256 复核（全部实测）**：

| 件 | 实测 SHA-256 / 大小 | 对照 |
| --- | --- | --- |
| Mac `.scratch/ma/serve_mac`（方向 A 服务端） | `2a6d40db04013d00db791c8eead7d092b230b51aea6c560a4680ac5cd4b1328d`，18,132,560B | **≠ ma_reconnect 登记 0e9410d0**，溯源见下 |
| 安卓 `/data/local/tmp/q2_fetch`（方向 A 客户端） | `d59aef28db9ad91732452788eb9b7208be48fd648f1fcb10896e4944feb042fc`，20,714,032B | =门 §7 登记 ✓ |
| 安卓 `/data/local/tmp/q3_serve`（方向 B 服务端） | `44f11b2efedf7615afd408527fe77754b26f810c711f316261737f7d2fca0004`，20,719,864B | =门 §7 登记 ✓ |
| 载荷（Mac `.scratch/ma/` 与安卓机上双实测） | `c11e2997bbe7039af84f267e5701beb8c6f5fd8ae6d4adf023a6d6050dc1d571`，2,955,365B | =门 §3 ✓ |
| 鸿蒙装机 | `bm dump` 在册 com.example.unimaker = F-B 终版 HAP（71e46d27，libssm1napi.so f5e0c173），RECV_HOST=192.168.1.6 | 与当日安卓 IP 一致 ✓ |

**serve_mac 哈希漂移溯源**：盘上件 mtime 2026-09-17 12:46，与 `.scratch/fb/serve_smokeA1/A2.log`（F-B 冒烟 A'1/A'2 PASS，T_FETCH 1357/1206ms）mtime 12:46 吻合——即 F-B 12:46 重编并用其冒烟验证的同一二进制；F-A 登记 0e9410d0 已被该重编覆盖。当前树 HEAD 已前进（ed55610d3→905f359a7）且含他人未提交改动（src/quic/tls/handshake13.cheng +189，mtime 12:47 晚于 serve_mac 构建时刻，未进该二进制）——**故不从当前树重编**（避免卷入未验证改动），以盘上 F-B 冒烟验证件执行并如实登记。fetch_mac（af0b4ad9）与 F-A 登记一致，本轮未使用。

## 2. 冒烟（正式轮前各 1 轮，判活）

- 方向 A：Mac `./serve_mac huguangsheng.ssm1 4443` → 安卓 `q2_fetch 192.168.1.8 4443`：T_FETCH 1080ms、ready→首帧 60ms、sha256==cid、rc=0。**PASS**（`.scratch/fc/fetchA_smoke.txt`、`serveA_smoke.log`）。
- 方向 B：安卓 `q3_serve` 4443 → 鸿蒙 `aa start -b com.example.unimaker -a Ssm1Ability` + `uitest uiInput click 559 454`（RECEIVE）：T_FETCH fetchMs=2111、ready→首帧 148ms、sha256==cid、E2E PASS、serve conn=1。**PASS**（`.scratch/fc/smokeB_hilog.txt`）。

## 3. 方向 A 正式轮（Mac serve → 安卓 fetch，10 轮）

每轮：pkill 旧 serve → 起新 serve_mac（独立进程，PID 见表）→ 安卓 `timeout 30 q2_fetch`。轮次脚本 `.scratch/fc/run_dirA.sh`。

| 轮 | serve PID | T_FETCH(ms) | ready→首帧(ms) | sha256==cid | serve 端 |
| --- | --- | --- | --- | --- | --- |
| A1 | 72810 | 1124 | 64 | ✓ be20ab8e… | conn=1 served=2，无 ERR |
| A2 | 72882 | 1156 | 76 | ✓ | conn=1 served=2，无 ERR |
| A3 | 72927 | 1276 | 124 | ✓ | conn=1 served=2，无 ERR |
| A4 | 73046 | 1480 | 64 | ✓ | conn=1 served=2，无 ERR |
| A5 | 73122 | 1288 | 92 | ✓ | conn=1 served=2，无 ERR |
| A6 | 73155 | 1180 | 80 | ✓ | conn=1 served=2，无 ERR |
| A7 | 73213 | 1104 | 64 | ✓ | conn=1 served=2，无 ERR |
| A8 | 73247 | 1476 | 236 | ✓ | conn=1 served=2，无 ERR |
| A9 | 73290 | 1332 | 92 | ✓ | conn=1 served=2，无 ERR |
| A10 | 73351 | 3572 | 1752 | ✓ | conn=1 served=2，无 ERR |

- 全轮 fetch rc=0，`fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B`。
- **统计**：T_FETCH p50=1282 / p95=3572（nearest-rank，n=10）/ max=3572 / min=1104 ms；ready→首帧 p50=86 / p95=1752 / max=1752 / min=64 ms。
- **判词：L1 PASS**（p50 1282≤3000，max 3572≤5000，完整性失败 0）；**L2 PASS**（p50 86≤1000）。
- A10 备注：keyframe chunk 段 1668ms 尖峰（夜间弱信号窗口抖动），完整性与断言无影响，按门如实计入，未剔除。

## 4. 方向 B 正式轮（安卓 serve → 鸿蒙 fetch，10 轮）

每轮：安卓 killall→起新 q3_serve（独立进程，机上载荷）→ 鸿蒙 wakeup + `aa force-stop` + `aa start`（整应用重启）→ `hilog -r` 清 → uitest 点击 RECEIVE → 轮询 `fetch_poll DONE` → 落盘该轮 SSM1 hilog。轮次脚本 `.scratch/fc/run_dirB.sh`。

| 轮 | serve PID | T_FETCH fetchMs(ms) | ready→首帧(ms) | sha256==cid | 当轮 E2E | serve 端 |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | 19459 | 1959 | 128.0 | ✓ be20ab8e… | PASS | conn=1 served=2，无 ERR |
| B2 | 19789 | 1656 | 112.0 | ✓ | PASS | conn=1 served=2，无 ERR |
| B3 | 20093 | 1810 | 104.0 | ✓ | PASS | conn=1 served=2，无 ERR |
| B4 | 20411 | 2256 | 128.0 | ✓ | PASS | conn=1 served=2，无 ERR |
| B5 | 20789 | 2260 | 116.0 | ✓ | PASS | conn=1 served=2，无 ERR |
| B6 | 21132 | 1956 | 104.0 | ✓ | PASS | conn=1 served=2，无 ERR |
| B7 | 21673 | 1809 | 100.0 | ✓ | PASS | conn=1 served=2，无 ERR |
| B8 | 22146 | 2108 | 112.0 | ✓ | PASS | conn=1 served=2，无 ERR |
| B9 | 22191 | 2112 | 120.0 | ✓ | PASS | conn=1 served=2，无 ERR |
| B10 | 22218 | 1958 | 84.0 | ✓ | PASS | conn=1 served=2，无 ERR |

- 全轮 `SSM1 SHARE E2E PASS fetchOk=true kfScheduled=true rendered=true`；时间线参照 total dial→first-frame p50=1882 / max=2132 ms。
- **统计**：T_FETCH（门口径 fetchMs）p50=1958.5 / p95=2260 / max=2260 / min=1656 ms；ready→首帧 p50=112 / p95=128 / max=128 / min=84 ms。
- **判词：L1 PASS**（p50 1958.5≤3000，max 2260≤5000，完整性失败 0）；**L2 PASS**（p50 112≤1000）。

## 5. 环境事件与作废轮登记（不静默丢弃）

1. **鸿蒙灭屏深睡**：预检时鸿蒙三向 ICMP 全断、`aa start` 报 10106102（锁屏拒绝启动）。`power-shell wakeup` + `uitest uiInput swipe`（开发者模式无法自动解锁，上滑后无 PIN 直接解锁）后恢复。此后每轮正式轮前固定 wakeup。
2. **客户端间 ICMP 过滤**：唤醒后安卓↔鸿蒙 ICMP 双向 100% 丢、Mac→鸿蒙入向 100% 丢，但门流量为 UDP QUIC 且 20 正式轮全通——记录为网络事实，不影响判词。
3. **void_run1（方向 B 第一组 10 轮，作废重跑）**：轮次脚本 `"$AD"` 整串引号致 adb 调用 `command not found`——安卓 serve 未重启，10 轮 fetch 全部打到冒烟遗留的同一 q3_serve 进程，违反门 §6 独立 serve 纪律。fetch 侧数据本身有效但整组不计入，原始件归档 `.scratch/fc/void_run1/`。修复（`ad()` 函数）后重跑。
4. **void_run2（方向 A 第一组 10 轮，作废重跑）**：同一 bug，fetch 根本未执行（rc=127），serve 进程正常启停无测量意义。归档 `.scratch/fc/void_run2/`，修复后重跑。
5. **方向 A A10 抖动**：见 §3 备注，PASS 计入。
6. **设备遗留态**：Mac serve 进程已清（pgrep 无）；安卓 q3_serve 已清（pidof 无）；鸿蒙应用留在前台（F-B 同款遗留态）；.scratch/fc/ 全部逐轮原始文件保留。

## 6. 结论

1. 冻结门 L1、L2 双方向全部 PASS，无任何放宽：双向各 10 独立轮、T_FETCH p50 1282/1958.5ms（≤3000）、max 3572/2260ms（≤5000）、完整性失败 0、ready→首帧 p50 86/112ms（≤1000）。
2. 历史参照对照：方向 A 数据面 86ms 与 task_m2 的 152ms、F-A 冒烟 76ms 同量级；方向 B ready→首帧 112ms 与 F-B 冒烟 116ms 同量级——测量与先例自洽。
3. 本任务零源码改动：树内唯一新增为 `.scratch/fc/` 测量产物与轮次脚本（任务级临时产物，含两组作废归档）；当前树 HEAD 905f359a7 及未提交改动属其他并行工作流，与本测量无关（正式轮所用二进制均先于其存在）。

## 7. 原始输出文件指针（全部保留于 `.scratch/fc/`）

- 方向 A：`fetchA_r1..10.txt`（fetch 时间线全文）、`serveA_r1..10.log`（serve 侧全文）、冒烟 `fetchA_smoke.txt`/`serveA_smoke.log`。
- 方向 B：`fetchB_r1..10.txt`（该轮 SSM1 hilog 全文，含 fetch_poll DONE 完整时间线与 E2E 判词）、`serveB_r1..10.log`、冒烟 `smokeB_hilog.txt`、锁屏取证 `fc_lock*.jpeg`、按钮坐标 `fc_layout2.json`。
- 作废归档：`void_run1/`（B 第一组）、`void_run2/`（A 第一组）。
- 轮次脚本：`run_dirA.sh`、`run_dirB.sh`（修正后形态）。
