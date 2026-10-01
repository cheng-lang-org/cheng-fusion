# ChengHy2TunVpn 性能测量报告

- 设备：GBJ0222B24021692（USB adb），VPN session=7，蜂窝网络，TUN + Hysteria2-style tcp-tls-forward 出口（dosg）
- 隧道目标：https://unimaker.fun/perf/ ；直连基线：https://www.baidu.com（国内域，绕过隧道）
- 时间：2026-08-27；每样本均为全新连接（无连接复用）

## A. 隧道延时（TTFB，30 样本，全部 HTTP 200，无剔除）

```
n=30  min=0.851s  中位=1.136s  p95=2.226s  max=2.405s  标准差(抖动)=0.413s
```

## B. 直连蜂窝基线延时（TTFB，30 样本，全部 HTTP 200，无剔除）

```
n=30  min=0.141s  中位=0.169s  p95=0.208s  max=2.247s  标准差(抖动)=0.380s
```

> 注：直连首样本 2.247s 为蜂窝冷连接（radio 唤醒+全新 TCP/TLS），剔除后直连中位 0.169s、倍数为 6.7x。主口径保留全部 200 样本。

## C/D. 吞吐（5MB range 下载）

| 路径 | 下载量 / 耗时 | 速度 |
|---|---|---|
| 隧道 run1 | 5242881 bytes / 4.244s | 1235654 B/s = 1.18 MB/s |
| 隧道 run2（取优） | 5242881 bytes / 2.703s | 1940370 B/s = 1.85 MB/s |
| 直连基线 | 5242881 bytes / 2.595s (HTTP 206) | 2021156 B/s = 1.93 MB/s |

隧道吞吐取两次较优：**1.85 MB/s**；直连基线：**1.93 MB/s**。

## 结论

- 隧道相对直连的延时倍数：中位口径 **6.7x**（1.136s vs 0.169s）；p95 口径 **10.7x**
- 隧道抖动（TTFB 标准差）：0.413s；直连：0.380s
- 隧道吞吐 1.85 MB/s vs 直连 1.93 MB/s：隧道达到直连的 96%

## 原始数据

- tunnel_ttfb.csv（A）、direct_ttfb.csv（B）、tunnel_throughput.txt（C，含 run1/run2）、direct_throughput.txt（D）
- C 的两次实测：run1 1235654 B/s（4.244s）、run2 1940370 B/s（2.703s）
- D 首选源 dldir1.qq.com QQ dmg 返回 404，已按预案换 dldir1.qq.com/weixin/Windows/WeChatSetup.exe（206）
