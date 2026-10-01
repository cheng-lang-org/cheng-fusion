# T-D 耐久切片：安卓 serve + 鸿蒙 RECEIVE fetch 100 轮加载/卸载

日期：2026-09-19 04:20–05:47（约 85 分钟，Mac 侧脚本驱动 adb/hdc）
设备：安卓 DCO-AL00（GBJ0222B24021692，192.168.1.6，/data/local/tmp/q3_serve + huguangsheng.ssm1）；鸿蒙 Mate 70 Pro+（3KN0224C18003262，192.168.1.2，HAP com.example.unimaker versionCode 1000044，Ssm1Ability）
驱动：`.scratch/td/durability.sh`（START END 可分段）；逐轮产物 `.scratch/td/applog_r<R>.txt`、`rounds.log`、`rounds_summary.txt`、`fetchms.txt`、`rss.txt`、`incidents.log`

## 1. 前置核验

| 项 | 值 | 结论 |
| --- | --- | --- |
| 载荷 | huguangsheng.ssm1 = 2,955,365B，sha256=c11e2997bbe7039af84f267e5701beb8c6f5fd8ae6d4adf023a6d6050dc1d571（机上实测） | 与任务书一致 |
| serve 件 | q3_serve 20,719,864B 在机可执行 | OK |
| HAP | versionCode 1000044（RECEIVE fetch 形，fetch_start host=192.168.1.6） | 符合 1000042+ |
| RECEIVE 坐标 | uitest dumpLayout bounds=[389,384][729,524] → 中心 (559,454) | 与任务书一致 |
| 跨机 UDP | 冒烟轮 fetch ok 实证（ICMP 被路由器过滤，按预案以 fetch 实测代替） | OK |
| hdc 发现 | 开始时 `hdc list targets`=[Empty]，`hdc kill` 重启服务后目标回归 | 与历史 §2 同形，已恢复 |

## 2. 冻结判据逐条判定 → 全绿

| 判据 | 阈值 | 实测 | 判定 |
| --- | --- | --- | --- |
| fetchOk=true + sha256-match 轮数 | ≥95/100 | **100/100**（每轮含 `fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B sha256-match=be20ab8e…eb5a6` + `SSM1 SHARE E2E PASS fetchOk=true kfScheduled=true rendered=true`，均 100 条） | **PASS** |
| T_FETCH p50 | ≤3000ms | **1809ms**（p95=2260ms，min=1505ms，max=2864ms，mean=1889ms，n=100） | **PASS** |
| 连续失败熔断 | ≥3 轮停 | 0 失败，未触发 | PASS |
| RSS 无单调增长 | 末10均值 ≤ 首10均值×1.2 | 首10均值=141,132KB，末10均值=139,874KB，**Δ=-0.89%**；全程 138,072–145,248KB 区间平稳波动 | **PASS** |

## 3. 逐 10 轮汇总（T_FETCH ms / VmRSS KB）

| 轮段 | pass/10 | fetchMs min–max | 中位 | RSS 均值 | serve 实例(pid) |
| --- | --- | --- | --- | --- | --- |
| 001–010 | 10 | 1657–2410 | 1885 | 141,132 | 15288 |
| 011–020 | 10 | 1655–2711 | 1958 | 141,019 | 16396 |
| 021–030 | 10 | 1805–2262 | 1958 | 140,043 | 17542 |
| 031–040 | 10 | 1658–2263 | 1882 | 139,970 | 18837 |
| 041–050 | 10 | 1657–1959 | 1807 | 140,529 | 20012 |
| 051–060 | 10 | 1656–1957 | 1659 | 140,020 | 21513 |
| 061–070 | 10 | 1505–2259 | 1807 | 139,512 | 23140 |
| 071–080 | 10 | 1805–2864 | 1882 | 139,657 | 28153 |
| 081–090 | 10 | 1657–2259 | 1810 | 139,342 | 30550（跨中断续跑同一实例） |
| 091–100 | 10 | 1806–2107 | 1883 | 139,874 | 2813 |

RSS 无单调增长：10 段均值在 139.3–141.1MB 间往复，末段低于首段。

## 4. serve 生命周期边界（每 10 轮重启）

- 10 次边界重启（r=1,11,…,91）全部一次成功（listening=1），当轮 fetch PASS，无跨重启连接残留失败。
- 设备侧 serve 日志逐段核对：每实例 `conn=10 totalServed=20`（10 连接×每连接 2 次 serve），唯一例外 r81 段 `conn=11`——该实例跨外部中断（见 §6）多收 1 次连接，客户端侧该窗口 10/10 轮 fetch 全 ok，零客户端可见影响。

## 5. 异常轮全文

无。0 失败、0 恢复轮、0 传输掉线、0 serve 死亡（incidents.log 0 行）。

固定伴随行（非缺陷，登记备查）：每轮 PASS 行之后固定出现 2 行 `ERR play_asset_reject rc=-13 bytes=2955365` + `T_DEPTH play_set_asset ERR play_asset_reject`（E2E PASS 之后的 rawfile 深度探针路径），100/100 轮逐轮恒定出现，与判据无关，无轮间差异。

## 6. 运行中断记录（如实）

- r=82 完成后（05:19），后台驱动进程被执行环境终止（非测试失败、非设备掉线）；r=83 起原参数续跑，r81 段 serve 实例 30550 存活延续使用（无重启空窗），r=91 边界照常重启。82 轮与 18 轮数据同格式落盘，未删轮。
- 后半程 hdc 单轮耗时由 ~22s 渐增至 ~60–90s（传输层变慢），每轮 10s 判读窗与判据不变，T_FETCH 无劣化趋势（r91–100 中位 1883ms 与 r1–10 的 1885ms 持平）。

## 7. 判读方法（可复现）

每轮：wakeup+setmode 602+上滑 → `aa force-stop`×2（间歇失效对策）→ `aa start` → 3s → click(559,454) → 10s 窗 → `hilog -x` 按「设备侧时间戳 ≥ 本轮起点」过滤 A0A5F1/com.example.unimaker 行（避免跨轮混叠）→ PASS 当且仅当含完整 `sha256-match=be20ab8e…` 的 `fetch ok` 行；RSS 每轮 `pidof`+`/proc/pid/status VmRSS`（逐轮采样，100 样本）。锁屏对策：应用先 force-stop，故解锁滑萌发生在无应用态，规避 §18.6「已解锁盲滑最小化应用」教训。

结论：**T-D 耐久切片绿。100/100 轮 fetchOk+sha256-match，T_FETCH p50=1809ms，RSS 平稳（-0.89%），serve 生命周期边界无回归，无空闲轮询回归迹象（serve 侧 EAGAIN 轮询形态与单轮一致，客户端 msquic 每轮独立连接收尾正常）。**
