# miaofa_gate_v0.md — 双真机秒发秒开验收门（S-A，冻结版）

冻结时间：2026-09-17。本文件写完即冻结；后续所有测量只能按本门执行，未达标如实记 FAIL，不许放宽或改门。

## 1. 设备与连接（2026-09-17 实测）

| 角色 | 设备 | 连接 | 当日实测 IP |
| --- | --- | --- | --- |
| 安卓 | HUAWEI DCO-AL00 `GBJ0222B24021692` | adb USB（transport_id:2） | 192.168.1.6（wlan0，`ip route` 实测，与 2026-09-12/13 历史一致） |
| 鸿蒙 | HUAWEI Mate 70 Pro+ `3KN0224C18003262` | hdc | 192.168.1.2（wlan0，`ifconfig` 实测，与历史一致） |
| Mac（serve/fetch 对照端） | 本机 | en0 | 192.168.1.8（历史 192.168.1.7 已变，同 /24） |

## 2. 网络（同一局域网，实测）

- 三机同 /24（192.168.1.0/24，WiFi）。
- Mac→安卓 ICMP（10 包窗口）：rtt min/avg/max = 33.0/81.1/160.7 ms，丢包 25%（弱信号时段窗口）。
- Mac→鸿蒙 ICMP（10 包窗口）：rtt min/avg/max = 6.0/70.7/122.9 ms，丢包 0%。
- 网络质量备注：当日 WiFi 处于中弱信号时段（Q3/Q4 先例：79–210ms RTT 窗口仍全链 PASS）。按门执行，不因网络质量调整门值。

## 3. 载荷（固定）

- `huguangsheng.ssm1`：2,955,365 B，45 chunks。
- SHA-256 = `c11e2997bbe7039af84f267e5701beb8c6f5fd8ae6d4adf023a6d6050dc1d571`（2026-09-17 安卓机侧与 Mac 拉回件双实测，与 2026-09-12 task_x 登记同包）。
- 首关键帧 chunk 内容 CID（sha256）= `be20ab8ec6be22e984ffc92163bb5b73e2d22e4394b92d44cd127de18d3eb5a6`（历史 M2/Q3/Q4 三轮一致值）。
- 秒开预算参照：manifest 段 4,625 B + 首关键帧 chunk 段 65,572 B。

## 4. 指标定义（口径冻结）

- **T_FETCH**：接收端发起请求（dial 起点）到首关键帧数据落地且 sha256==cid 校验通过的耗时。取值口径：
  - exe 接收端（安卓）：fetch 工具时间线 `total dial->first-frame ready`（ns→ms）。
  - HAP 接收端（鸿蒙）：hilog `T_FETCH done fetchMs=`。
- **ready→首帧就绪**（数据面秒开口径，单独记录）：connect ready（双流 negotiate 完成）到首关键帧数据校验通过。取值口径：fetch 工具时间线 `ready->first-frame ready`；HAP 侧取时间线同名项（如当轮 hilog 有完整时间线）。历史参照：Mac serve→安卓 fetch 152–156ms（task_m2）。

## 5. 门（两档，冻结）

- **L1 接通门**：双向（Mac serve→安卓 fetch、安卓 serve→鸿蒙 fetch）各 ≥10 轮独立 serve/fetch；
  - T_FETCH p50 ≤ 3000 ms 且 max ≤ 5000 ms；
  - 完整性失败（sha256≠cid、段长不符、断言 FAIL）= 0。
- **L2 秒开门**：ready→首帧就绪 p50 ≤ 1000 ms（历史数据面参照 Mac→安卓 152ms）。
- 任一门未达标：如实记 FAIL 并归因，禁止放宽门值或缩减轮次。

## 6. 轮次纪律

- 双向各 ≥10 轮，每轮独立 serve 进程 + 独立 fetch 发起（不允许复用连接计多轮）。
- 每轮记录：T_FETCH、ready→首帧就绪、sha256==cid 结果、异常原文（如有）。
- 环境窗口内中断/设备离线：该轮作废重跑，不静默丢弃。

## 7. 冻结时点重建形态（事实登记，非门值）

- Mac 侧 serve/fetch exe：从当前树（cheng-lang HEAD ed55610d3 + bootstrap artifacts/bootstrap/cheng.stage3，2026-08-31）重建，target arm64-apple-darwin。
- 安卓侧 exe：当前树无 M1 交叉编译链（fakeNDK/patched_lib/link_bridge 随 streamdev 克隆删除），exe 重建不可行；使用设备上历史 PASS 形态 exe（q3_serve=Q3 终验服务端件、q2_fetch=Q2/Q4 终验客户端件），SHA-256 在 ma_reconnect.md 全记录。
- 鸿蒙侧：Q4 版签名 HAP（2026-09-13 11:49 构建，RECV_HOST=192.168.1.6 与当日安卓 IP 一致）hdc install 装机，RECEIVE=纯客户端 fetch。
