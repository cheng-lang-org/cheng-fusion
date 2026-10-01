# task_w_ohos_primitives.md — QUIC 栈 ohos 原语层打通 + M6a 观测版自动全链秒开终数（M6w）

日期：2026-09-12。承 task_m6a §10（udp_probe enter 后主线程冻结、qProbeTick 零输出）与
task_m6q（probe 有界化已修、握手 ORC miss BLOCKED 待编译器根修）。设备 HUAWEI Mate 70 Pro+
（HarmonyOS 6.1.0.135，serial `3KN0224C18003262`）。车头 t_drop_v3（drop 布局指纹根修，
sha256 `038c1cd66cc6f6f474a6887849192fb968c2741c0ef3d921a7e61b0d7bc76d67`）。

**终判：鸿蒙真机 QUIC 环回自动全链 PASS。T_RECEIVE = 2180 / 2174 ms（两轮），
state 非 ERR，灰度上屏 256 级非平场。M6a 秒开闭环达成。**

---

## 1. M6a §10 冻结根因（静态实锤 + 真机复验）

**根修的不是编译器也不是线程：是 09:30 T 线集成轮把 ohosdev 克隆源回退、丢掉了 M6q
probe 有界化补丁。**

- 2026-09-12 09:30 克隆源 `src/tools/ssm1q_loopback_export.cheng`（40,652B）与主仓版
  （49,042B）diff 实证：克隆版丢失 ①probe `waitRc>0` 才 recvfrom 的有界跳过
  ②全部 `qProbeTick` 打点桥 ③fetch 3s 握手超时 + lip 第二跳重试——即 M6q 全部补丁内容；
  09:32 装机 so 的 obj 正是该回退源所编（`nm ssm1q_loopback_ohos.o` 中
  `cheng_qprobe_tick` 引用数 = 0，同时仍引用无界 `cheng_host_recvfrom`）。
- 冻结机制还原：环回报文未达时 `wait=0` → 回退源**无条件**阻塞 recvfrom（绑 127.0.0.1
  的 rx fd）→ 主线程冻结（M6q §1.1 已根治的原病回退）；M6a §10「冻结点早于第一个
  stage」的推断系误读——不是冻结在 socket() 前，是源里根本没有打点可输出。
- 修复 = 克隆源回同步主仓版 + `rm -rf .cheng-csg-core` + t_drop_v3 重编
  （`ssm1q_loopback_ohos.o` a857dae8…，unresolved=0）→ 重链 so
  （e455f548…，46,067,856B，16KB LOAD align 4/4）→ HAP 签名装机。修复后真机 probe
  全层有界返回（§3），冻结消灭。

## 2. 假设判定表（逐条真机实证）

| 假设 | 判定 | 真机/静态证据 |
|---|---|---|
| H1 权限缺失 | **不成立** | `ssm1smoke/ssm1smoke/src/main/module.json5` 已声明 `ohos.permission.INTERNET`（读文件实证，M6a §5.1 后即补）；且本轮 T_PUBLISH listener 就绪（rc=97 state=listening）证明 socket 创建/绑定生效 |
| H2 主线程网络限制 | **不成立** | 主线程同步 NAPI 调 `ssm1qUdpProbe` 全层有界返回：QPROBE step 1-8、60-62、81-83、90-94 共 21 打点全出（10:12:11.934-938，8ms 内跑完），四通道 A/B/C/D 全通。M6q 六轮 probe 亦主线程跑通。线程不是变量；fetch/publish 本就 worker 线程、主线程只轮询，现状即正确形态 |
| H3 C 层直测定位 | **被 probe 直测超越（结论同向）** | probe 本身即 socket 原语直测（socket/bind/sendto/wait/recvfrom 逐层 rc+errno）：rx fd=40、bind=0、send=4、wait=1、recv=4、UDP connect B 通道 rc=0、lip=192.168.1.2（C/D 通道全通）。C/cheng 直测通 → cheng socket 桥无病，无需另造 ssm1ProbeRaw |
| H4 stdio 桥线程性 | **不成立（定性错位）** | `qProbeTick` 走 shim `cheng_qprobe_tick` → OH_LOG 直打（tag SSM1 `QPROBE step=`），不经 stderr 桥；主线程 OH_LOG 已被 `udp_probe enter` 证明可用。零输出真因 = 装机 obj 由无打点源编出（§1 nm 实证），非桥失效 |

## 3. 修复内容（三轮真机迭代）

1. **克隆源回同步主仓版**（§1）：恢复有界 probe + 打点 + 3s 握手超时 + lip 重试 +
   M6b 双缓冲 assembled_copy 合同；t_drop_v3 重编重链。真机一轮：probe/fetch/load/
   协议复跑全 PASS（见 §4 一轮），冻结消灭。
2. **shim g_frameLen 修复**（M6b §4.2 登记的 ohos 同款疏漏，`scripts/ssm1_napi_shim.c`）：
   `ssm1q_first_frame_gray` 返回值是 meta 行长度（84），误存为帧字节数 →
   `ERR frame_meta_invalid`。修为从 meta 解析 w/h 重建 `g_frameLen=w*h*4`。真机二轮：
   meta 解析过，暴露下一层。
3. **shim buffer_geo 守卫精确化**：原判 `height*stride < size` 即拒；ohos 真机 buffer
   size=5,656,576 > 1050*5376=5,644,800（合法对齐垫尾）→ 误判 `ERR buffer_geo`。修为
   blit 越界精确判据 `(blitH-1)*stride + blitW*4 <= size`。真机三轮：render OK。

UniMaker 仓本轮只改 `hongmeng/scripts/ssm1_napi_shim.c`（战役文件）；
Index.ets/module.json5/主仓源零改动。

## 4. 真机终验输出（真实 hilog，hilog 原文存
`ohosdev/artifacts/mobile_m6a_hap/m6w_final_run_hilog.txt`）

**一轮（10:12，pid 12487，冻结修复后首验）**：

```
udp_probe enter
QPROBE step=1 a=44777 b=0 … step=2 a=40 … step=3 a=0 … step=5 a=4 … step=6 a=1 … step=7 a=4
  … step=60 a=0 … step=61 a=4 … step=62 a=1 … step=81/82/83 a=0 … step=90 a=4 … step=91 a=1
  … step=92 a=0 … step=93 a=4 … step=94 a=1 … step=8 a=4 b=1
UDP_PROBE OK udp_probe send=4 wait=1 recv=4 connectB=0 sendB=4 waitB=1 lip=192.168.1.2
  sendC=4 waitC=1 connectD=0 sendD=4 waitD=1
T_PUBLISH worker serve rc=97 resp=OK serve chunks=45 headerLen=4625 kfChunk=0 kfLen=65572 fileLen=2955365 port=4443 state=listening
QPROBE step=100 a=4443 b=0 / step=105 a=0 b=0        ← fetch 入口+addr 层
  dial (transport+tls+handshake): 1299999687 ns
  connect ready (negotiate x2 + serve push): 140001563 ns
  keyframe chunk segment residual (65572 bytes): 3997500 ns
  total dial->first-frame ready: 1443998750 ns
fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B sha256-match=be20ab8ec6be22e984ffc92163bb5b73e2d22e4394b92d44cd127de18d3eb5a6
assemble+load bytes=2955365 resp=OK init chunks=45 durationMs=22500 bufWindowMs=2000 src=memory
cmd=tick 0 → STATE posMs=0 playing=1 … fetch=0 bufferedTo=2000 pre=0,1,2,3
SSM1 SMOKE PASS fetch=[0,1,2,3,20]
```

（dial 数值上：t_drop_v3 车头下 M6q §1.2 的握手 ORC registry_miss/SIGSEGV **未复现**，
fetch 全链 rc=533 OK——drop 布局指纹根修对 dial 泵路径生效。）

**二轮（10:14，pid 14596，shim 双修后，全绿）**：

```
udp_probe OK udp_probe send=4 wait=1 recv=4 connectB=0 sendB=4 waitB=1 lip=192.168.1.2 sendC=4 waitC=1 connectD=0 sendD=4 waitD=1
T_PUBLISH worker serve rc=97 resp=OK serve … state=listening
fetch ok chunks=45 … sha256-match=be20ab8e…(同宿主/安卓 CID)
T_FETCH done fetchMs=1818
render OK render fw=128 fh=256 surfaceW=1316 surfaceH=1050 bufW=1316 bufH=1050 stride=5376 size=5656576 blit=128x256 rc=0
T_RECEIVE click->first-frame-on-screen totalMs=2180 (fetchMs=1819 loadMs=2167 renderMs=13) state=STATE posMs=0 playing=1 … fetch=0 …
SSM1 SHARE E2E PASS fetchOk=true kfScheduled=true rendered=true
SSM1 SMOKE PASS fetch=[0,1,2,3,20]
```

**三轮稳定复跑（10:15，pid 14670，force-stop 冷启）**：

```
T_PUBLISH worker serve rc=97 … state=listening
T_FETCH done fetchMs=1813
render OK … blit=128x256 rc=0
T_RECEIVE click->first-frame-on-screen totalMs=2174 (fetchMs=1815 loadMs=2159 renderMs=15) state=STATE … fetch=0 …
SSM1 SHARE E2E PASS fetchOk=true kfScheduled=true rendered=true
SSM1 SMOKE PASS fetch=[0,1,2,3,20]
```

**灰度上屏截图**（`snapshot_display`，存 `ohosdev/artifacts/mobile_m6a_hap/`
`m6w_round3_render.jpeg` / `m6w_final_render.jpeg`）：blit 区域 R==G==B 灰度像素
**256 个灰度级、min=0 max=255 全幅分布**——非平场铁证（宿主 grayMin=0 grayMax=255 同域）。

## 5. 秒发秒开终判词（口径声明）

- **秒发**：PASS。T_PUBLISH worker 口径 317-330ms（serve_fetch_start→listening），
  发布即就绪，参数与宿主/安卓逐字节一致。
- **秒开**：**PASS——鸿蒙真机秒开闭环达成**。闭环判据逐项：
  - T_RECEIVE = **2180 / 2174 ms**（click→first-frame-on-screen，fetch+load+render），
    两轮一致；
  - state 非 ERR（`STATE posMs=0 … fetch=0`）；
  - fetch=[0,1,2,3,20] 断言 PASS；sha256 与宿主/M5 安卓同 CID（be20ab8e…）；
  - 灰度上屏非平场（截图 256 灰度级）。
  - 构成：fetch 1813-1819ms（其中 **dial ~1300ms 为 M5 §5.③ 已登记的运行时秒级量化**，
    negotiate+推段 140ms，chunk 4ms）+ 装载 ~342ms + 渲染 13-15ms。进一步压缩归
    dial 量化收敛（运行时层登记项），非本战役范围。

## 6. 待主仓入库清单

1. **无新增 patch**。`src/tools/ssm1q_loopback_export.cheng` 本轮真机验证的正是主仓
   已提交版本（M6q 补丁内容 + M6b 双缓冲合同已在库），克隆仅回同步，无源差异需要出
   patch。本文档新增入库。
2. M6q §6 三个 patch 清单维持原判（1、2 必入，3 编译器战役用）；其中
   `m6q_ssm1q_loopback_export_probe_bounded_diag.patch` 的内容已在主仓 HEAD，
   入库评审时可按「已 apply」核销。
3. UniMaker 侧（战役文件自持，非主仓 patch）：`scripts/ssm1_napi_shim.c` 两处修复
   （g_frameLen 重建、buffer_geo 精确判据）；装机 so
   e455f548…（t_drop_v3 代 ssm1q/ssm1d obj + M6q 代 psb/psh/dbg）。

## 7. BLOCKED 项与如实记录

1. **dial ~1.3s 运行时量化**（宿主 0.96s/安卓 1.0s 同族，M5 §5.③/M6b §6 登记）：
   T_RECEIVE 压缩到亚秒的唯一大头，归运行时层，本战役不动。
2. **psb/psh/dbg 仍为 M6q 代**（w126_re-era，psb 源工作树 rehash WIP 未落地不可冷链编），
   与 t_drop_v3 代 ssm1q/ssm1d 混代链接——本轮真机全链两轮 PASS 实证可用；同代纪律
   （M6q §7.3）待 psb WIP 落地后统一回切。
3. **RERUN 二次 fetch**（M6b §8.1 stage=6 停滞族）ohos 侧未复测：当前 runAll 单连接
   形态（每进程一轮 fetch），rerunProtocol 只走内存复跑，不受影响。
4. 环回 UDP 早间内核丢包态（M6q §2.2）本轮未现（10:12-10:15 全通）；probe v2 常备
   体检在位，复现时一键判别。
5. 两仓 git 零写操作；hdc 仅 install/shell/file/list；主仓 src/quic、src/libp2p、
   bootstrap 零改动。
