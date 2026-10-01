# ma_reconnect.md — 双真机链路重建 + 冒烟（任务 F-A，2026-09-17）

目标：双真机秒发秒开链路重建 + 单轮×2 方向冒烟。S-A 门已先行冻结
（`results/miaofa_gate_v0.md`，本文件所有测量按其口径执行）。

**判词：方向 A（Mac serve → 安卓 fetch）重建完成、冒烟 PASS（ready→首帧 76ms，
sha256==cid，rc=0）。方向 B（安卓 serve → 鸿蒙 fetch）BLOCKED(鸿蒙 native lib
运行时层)：唯一存活的鸿蒙产物（9-13 Q4 版 libssm1napi.so）客户端 negotiate
路径确定复现失败（3/3 跨服务端），且其 serve 角色首个跨设备 accept 即 ORC
registry_miss 崩溃（与 task_x §3.2 同签名）。历史 PASS 客户端产物（Q3 版 HAP，
9-12）已不存在于盘/机，重编链（车头/克隆/obj）全部删除，无法重建。**

---

## 1. 环境实测（冻结门用）

- 设备：安卓 DCO-AL00 `GBJ0222B24021692`（adb USB，transport_id:2）；
  鸿蒙 Mate 70 Pro+ `3KN0224C18003262`（hdc）。Mac en0 = 192.168.1.8。
- IP：安卓 192.168.1.6（`adb shell ip route`，与历史一致）；
  鸿蒙 192.168.1.2（`hdc shell ifconfig wlan0`，与历史一致）。同 /24。
- ICMP（Mac 发起，10 包）：→安卓 33.0/81.1/160.7ms 丢 25%；→鸿蒙 6.0/70.7/122.9ms 丢 0%。
- 安卓→鸿蒙 ICMP（5 包）：0% 丢，8.0/75.2/144.7ms。

## 2. 产物与 SHA-256

| 产物 | 形态 | SHA-256 / 大小 |
| --- | --- | --- |
| Mac serve（当前树重建） | `.scratch/ma/serve_mac`，`artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang --in:src/tools/ssm1_moq_serve.cheng --emit:exe --target:arm64-apple-darwin`，闭包 48,894 行 4.77s | `0e9410d053a615295b91e5cf23a8183f75544ef2a919cae46a62595b3fad4aab`，18,132,560B |
| Mac fetch（当前树重建） | 同上 `ssm1_moq_fetch.cheng`，4.20s | `af0b4ad9e9212612d5cad7b9e810c77f87430e34cd852d9a981eed74a1e66833`，18,178,512B |
| 载荷 | `.scratch/ma/huguangsheng.ssm1`（adb pull 自安卓机） | `c11e2997bbe7039af84f267e5701beb8c6f5fd8ae6d4adf023a6d6050dc1d571`，2,955,365B（与 task_x 登记同包；安卓/鸿蒙机侧文件同日实测同 sha） |
| 安卓 q3_serve（历史 Q3 终验件，机上） | `/data/local/tmp/q3_serve`，2026-09-12 21:00 | `44f11b2efedf7615afd408527fe77754b26f810c711f316261737f7d2fca0004`，20,719,864B |
| 安卓 q2_fetch（历史 Q2/Q4 客户端件，机上） | `/data/local/tmp/q2_fetch`，2026-09-12 17:46 | `d59aef28db9ad91732452788eb9b7208be48fd648f1fcb10896e4944feb042fc`，20,714,032B |
| 鸿蒙 libssm1napi.so（Q4 版，唯一存活） | jniLibs，2026-09-13 11:02 | `4f87596ae6246f51b8dbbd80662d58fc51b335555acb5bfc40cc317230b64d13`，46,179,520B |
| 鸿蒙 ssm1smoke HAP（本任务重打×3） | hvigor assembleHap + 自动签名 | `c23043c408a404cf4c362ac669fa6f42edce4f5d6bd120bfb0238c4398363b53`（终版，auto-publish ON） |

- 安卓 exe 重建不可行：M1 交叉编译链（fakeNDK wrapper/patched_lib/link_bridge.a）
  随 streamdev 克隆删除，全盘 `find` 无存；故安卓侧用机上历史 PASS 件（如实登记）。
- 鸿蒙 HAP 重打只需 ArkTS 层：jniLibs 内 9-13 lib 原样打包，hvigor
  （DevEco Studio 自带）12s 构建签名成功，无需 cheng 车头。
- Index.ets 改动（本任务唯一源码改动，UniMaker 仓）：
  ① auto-publish 处加注释块（先注释回 Q3 纯客户端形态做隔离实验，终版恢复
  auto-publish ON 并留缺陷警告注释）；② RECV_HOST 曾临时改 '192.168.1.8'
  （隔离实验用）后改回 '192.168.1.6'。终版 Index.ets = 原 Q4 形态 + 警告注释。

## 3. 金丝雀（重建件判活）

Mac 本机环回（serve_mac huguangsheng.ssm1 14443 + fetch_mac 127.0.0.1 14443）：

```
ready->first-frame ready: 45056000 ns
total dial->first-frame ready: 811160000 ns
fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B sha256-match=be20ab8e...（cid 全值见门文档）
FETCH_RC=0
serve conn=1 served=2 totalServed=2 manifest=4625B chunk=65572B
```

## 4. 冒烟 A：Mac serve → 安卓 fetch（PASS）

命令：Mac `./serve_mac huguangsheng.ssm1 4443`；安卓 `q2_fetch 192.168.1.8 4443`。

```
SSM1 MoQ fetch timeline:
  dial (transport+tls+handshake): 1179999999 ns
  connect ready (negotiate x2): 28000000 ns
  requests issued (both streams): 0 ns
  manifest segment (4625 bytes): 24000000 ns
  keyframe chunk segment residual (65572 bytes): 52000000 ns
  ready->first-frame ready: 76000000 ns          ← 76ms（<184ms 基线，L2 预算内）
  total dial->first-frame ready: 1283999999 ns   ← T_FETCH 1284ms（<3000ms L1 门）
fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B sha256-match=be20ab8e...（==cid）
ANDROID_RC=0
serve 端：conn=2 served=2 totalServed=2 manifest=4625B chunk=65572B
```

## 5. 冒烟 B：安卓 serve → 鸿蒙 fetch（BLOCKED）

前置：鸿蒙装 Q4 版 HAP（9-13 lib）后自动 publish 即整进程死（见 5.1），故按 Q3
认可程序把 Index.ets auto-publish 注释（纯客户端形态）重打装机。

### 5.1 自动 publish 形态 + RECEIVE = exit 42（Q4 登记残余复现）

hilog 原文（点击 RECEIVE 后）：

```
SSM1: fetch_start host=192.168.1.6 port=4443 / resp=OK fetch started
SSM1: QPROBE step=100 a=4443 b=0 / step=105 a=0 b=0      ← fetch worker 线程
SSM1E: stderr cheng runtime event lock futex wait failed   ← 8ms 内
appspawn: com.example.unimaker with pid 35864 exit with code:42
```

归因：accept 循环线程（自动 publish）与 fetch worker 争用 runtime event lock，
Q3 §1.2 修复仅覆盖 EINTR/EAGAIN，其余 errno fail-stop——Q4 §5.1 已登记未修
（"serve_start 与 accept loop 的生命周期互斥"）。纯客户端形态下不再发生。

### 5.2 纯客户端形态：negotiate_ack_slot_4 确定复现失败

三轮（安卓 q3_serve ×2 + Mac serve_mac ×1）同签名，服务端三种两代全部一致：

```
hilog: fetch stage=1 elapsedMs=152 → stage=4 elapsedMs=1657 →
       fetch_poll DONE rc=25 resp=FAIL negotiate_ack_slot_4 → T_FETCH done fetchMs=5871
安卓 q3_serve: conn=1 ERR chunk_write kfRange=[4625,65572]（conn=2 同）
Mac serve_mac: conn=1 ERR chunk_write kfRange=[4625,65572]
```

服务端握手层全通（`init server parse peer done ok=1`，ACK 小包 19~61B 在飞），
negotiate 两流完成后 chunk 段写出即 ERR；客户端等不到 stream-4 negotiate ack。
失败确定（同签名 3/3），非弱信号瞬态。

隔离判据（归因链）：
- q3_serve 本机环回（q2_fetch 127.0.0.1 4443）：PASS（ready→首帧 48ms，
  sha256==cid，rc=0）→ 服务端本体健康。
- serve_mac ↔ fetch_mac 环回 + 冒烟 A：PASS → Mac 服务端健康。
- 公共失败项 = 鸿蒙 9-13 Q4 版 lib 的客户端 fetch。
- 历史 PASS 客户端 = Q3 版 HAP（9-12，q3_serve 3 轮中位 2258ms）；该产物已被
  9-13 11:02 重编覆盖，全盘 find 仅存 9-13 同一批 4 份副本，无法回退。
- 9-13 lib 的 Q4 当轮验证面 = 鸿蒙 serve + 安卓 client（Q4 §3），ohos 客户端
  跨设备路径在 Q3→Q4 代际（q4 multiaddress 重写 + native_runtime 打点链）后
  未被任何记录验证过——缺陷即在两代之间的某次重编引入，归 quic 运行时/
  编译器层战役清单（与本任务工具层无关）。

### 5.3 可选加测：鸿蒙 serve → 安卓 fetch（FAIL，ORC registry_miss）

恢复 auto-publish（Q4 形态）重打装机，T_PUBLISH 290ms listening + accept loop
started；安卓 `q2_fetch 192.168.1.2 4443` 两轮均 `FAIL dial msquic native:
handshake ! ready`，第二轮后应用死亡，hilog：

```
SSM1E: stderr m6q orc_miss p=0x0000000000000001 hdr=0xfffffffffffffff9 len=0x1c6f
       dead=0xc31 live=0x1c6f cheng_orc_release_failure code=registry_miss
       operation=normal_release detail=wrong_object_or_owner
DFX_SignalHandler signo(6) → appspawn: exit with signal:6
```

与 task_x §3.2 逐字同签名（w126 车头代 ORC registry_miss：跨设备 accept 首包
处理后 ~10s 内 abort）。即当前 9-13 lib 的 serve accept 路径也坏——Q4 §3 的
3/3 PASS 用的构筑件与此盘上 lib 非同代。t_drop_v3 车头 obj 纪律（task_x §6.3）
所需的构筑链已删，无法重编修复。

## 6. 结论与交接

1. 方向 A 重建完成：当前树（HEAD ed55610d3 + 8-31 bootstrap）可出 Mac 双件，
   冒烟数据面 76ms 达 L2 量级；L1 门（双向各 ≥10 轮）待方向 B 恢复后方可执行。
2. 鸿蒙方向 BLOCKED 清单（归运行时层，按 Q-era 分类延续）：
   ① ohos 客户端 negotiate（Q4 代 lib，跨服务端 3/3 确定复现）；
   ② ohos serve accept ORC registry_miss（同 lib，task_x §3.2 同签名）；
   ③ accept-loop 与 fetch worker event-lock 并发 fail-stop（Q4 §5.1 已登记）。
   恢复前提 = 重建 ohos obj 构筑链（车头 t_drop_v3 级 + 克隆 + DevEco 链），
   属编译器/运行时层战役，工具层（Index.ets/shim）无绕过空间。
3. 设备遗留态：鸿蒙装终版 HAP（auto-publish ON，Q4 形态）；安卓 q3_serve 已
   kill，机上历史 exe 与载荷原样未动。Mac 后台 serve 进程已清。
