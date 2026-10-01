# task_m6q_ohos_quic_fix.md — M6a 鸿蒙真机 QUIC 环回栈 native 死亡定位与分层修复（M6q）

日期：2026-09-12。承 task_m6a §8 复验补录（调 ssm1qUdpProbe 即 pid 循环重启 58418→61354→
62161、probe 零输出、DfxUnwinder Find map error）。设备 HUAWEI Mate 70 Pro+
（HarmonyOS 6.1.0.135，serial `3KN0224C18003262`）。修复全部发生在 ohosdev 克隆
（`/Users/lbcheng/cheng-f24/anchor_clones/ohosdev`）+ UniMaker ssm1smoke/scripts 本战役
文件；主仓源文件零改动（patches/ 与本文档除外）。真机共 8 轮迭代，全部真实 hilog。

---

## 1. 崩溃定性（两层，均真机实证）

### 1.1 M6a 现象根因 = probe 阻塞 recvfrom → FREEZE 看门狗击杀【已修复+验证】

hilog 历史重读推翻「野指针崩溃」初判：M6a 各轮死亡均为 signal 35（FREEZE）反复触发
→ processdump `dumpCatchTargetTid` + "crash base info is empty"（无 native fault
record）→ appspawn `exit with signal:9`。即**主线程卡死被系统看门狗击杀**，非 SIGSEGV。

机制：`ssm1q_udp_probe` 的 rx socket 为阻塞域，`qProbeRecvfrom` 在环回数据报未送达时
**永久阻塞主线程**（NAPI 同步调用），FREEZE 看门狗 3 次采样后 SIGKILL。

修复（克隆 `src/tools/ssm1q_loopback_export.cheng`）：
- recvfrom 前加 `qProbeWaitReadable(rx,1000)` 门，wait<=0 跳过（有界化）；
- 逐层打点桥 `@importc("cheng_qprobe_tick")`（shim C 侧定义 → OH_LOG）。

验证：观测版真机 6 轮 probe 全部有界返回（01:58 起再无 watchdog pid 循环）。

### 1.2 第二层 = QUIC 握手期 ORC 误释放/SIGSEGV【精确表征，BLOCKED】

probe 解堵后暴露真崩点。三轮变体定性：

| psb 供给 | debug | 死法 | 时机 |
|---|---|---|---|
| M1 代 psb_ohos.o | off | signal 11 SIGSEGV（worker 线程，cppcrash 落档） | dial ~0.3-1.5s |
| M1 代 | on | registry_miss panic（同一损坏的另一种表现） | dial ~0.1-0.3s |
| HEAD 态重编 psb | off | signal 11 SIGSEGV（同位） | dial ~0.4s |
| HEAD+诊断 | off | `m6q orc_miss p=0x1` | dial ~0.4s |

关键证据（03:13 轮，诊断 psb 直出）：
```
m6q orc_miss p=0x0000000000000001 hdr=0xfffffffffffffff9
    len=0x106 dead=0x33 live=0x106 q=0x0
cheng_orc_release_failure code=registry_miss operation=normal_release
```
- **p=0x1**：被当托管指针释放的值是整数 1（非堆地址），registry 表健康
  （len=262/dead=51 一致），quarantine 未命中（从未注册）→ 未初始化值进了指针字段；
- 释放点收束：server 侧 `msquicNativeInitServerSession` 的 parse peer →
  `SetSessionDialAddr`/`MsQuicNativeCopyAddrInto`（`BytesFree(out.data)` 释放槽位旧值）
  区域，debug off 时同位漂移为直接 SIGSEGV（栈垃圾值不同→野指针不同）；
- **与 DRV78 同族**：psb 源内已有同类修复注记「nested ptr 表达式在纯 Cheng backend
  下丢 value/地址物化（store 读未写栈槽）」——本次为 dial 泵路径的又一处；
- 排除项：debug 路径（off 仍崩）、跨线程（serve+fetch 同 worker 串行仍崩，§2.3）、
  psb 代际（M1/HEAD 双版本均崩，仅死法位移）、环回网络层（§2.2 四通道全通）、
  registry 表逻辑（查找/墓碑/grow 语义静态审读自洽）。

### 1.3 判词

M6a 的「调 probe 即死」由 1.1 承担并已根治；1.2 是**冷后端（cheng_cold）代码生成的
DRV78 类误编译**在 QUIC 双角色握手路径的又一实例，属编译器后端战役，M6q 范围内
如实 BLOCKED。p=1 特征 + 释放点函数域 + 三 psb 变体 × debug 开关交叉矩阵已足够
下一战役直接上反汇编定位（无需再造观测）。

## 2. 过程发现（全部真机实测）

### 2.1 观测基础设施（本战役沉淀，clone 内）

- **stderr→hilog 桥**（shim constructor: pipe+dup2+中继线程）：cheng fail-stop 文本、
  QUIC debug 行首次对真机可见——ORC registry_miss 文本即由此捕获；
- **QUIC 栈 debug 开关** `cheng_msquic_native_debug_set`（native_runtime 新导出）+
  `msquicNativeDebugWriteLine` 改走 `cheng_fd_write` 裸写（app .so 内不碰 std/os
  文件层——该层依赖宿主 environ/FILE 状态，M6a 头注已有 getenv 崩溃先例）；
- **probe v2 四通道判别**：A=sendto 127.0.0.1 / B=connect+send 127.0.0.1 /
  C=sendto 本机实 IP / D=connect+send 本机实 IP（UDP connect 8.8.8.8 选路
  getsockname 免发包取 IP），全有界+逐层 rc/errno 打点。

### 2.2 环回 UDP 通道状态（时间变量，probe 已固化常备判别）

- 01:58-02:05 会话：sendto rc=4 但内核丢弃（/proc/net/snmp 实测 OutDatagrams+1、
  InDatagrams/NoPorts/InErrors 全 0）→ 这正是当时 probe 必挂的原因；
- 02:28 起（WiFi 连上，lip=192.168.1.2）：四通道**全部秒达**（wait=1 recv=4）。
  环回可达性与网络态相关，机制未穷尽；probe 输出可作为装机版一键体检。

### 2.3 H1 判别（跨线程 QUIC 状态）否定

shim 新增 `ssm1qServeFetchStart(asset,port,host)`：serve+fetch 同 worker 线程串行
（复刻宿主全绿的单线程形态，主线程零 cheng 活动——shim 对全部 cheng 入口加了
fetch-忙守卫）。miss 依旧 → 排除跨线程，坐落代码生成层。

### 2.4 QUIC 数据面本体在 ohos 可用

03:15 轮 debug trail：client hello（x25519+TLS1.3 CH 169B）真机构建+发出 →
同进程 server 侧 `recv direct len=169` → `init server enter` → 数据面/密码学/
包收发全通。崩溃点在握手 server 会话初始化的内存管理，非协议/网络/密码学层。

### 2.5 ohos provider 冷链重编被卡（结构性发现）

psb（program_support_backend）当前工作树与 HEAD 均无法经车头冷链出 ohos obj：
- 工作树（并行会话 rehash 重构 WIP）：`unresolved function call
  'cheng_mem_release_live_counter_fail'`（depth=2 前向调用不受支持）；
- 加我诊断 hunk 的变体：cheng_cold 直接 SIGSEGV（rc=139）；
- **HEAD 提交态可出 obj**（rc=0）→ M6q 起设备 so 用 HEAD 态重编 psb
  （psb_ohos_m6q.o，a4d865ca…）替换 M1 古董件（自 M1 起从未重编过）。
- 诊断版 psb 另存 `artifacts/mobile_m6a_hap/psb_head_diag_source.cheng` +
  patch（下一轮直接复用）。

## 3. 修复与产物清单

**克隆内源改动（patch 落主仓 patches/）**：
1. `patches/m6q_ssm1q_loopback_export_probe_bounded_diag.patch`（319 行，对主仓现
   文件）：probe 有界化+四通道判别+逐层打点、fetch 打点 100-107+3s 快失败首跳+
   本机实 IP 第二跳重试、q_lip 全局槽；
2. `patches/m6q_native_runtime_debug_set_export_and_fdwrite.patch`（47 行，git diff）：
   `cheng_msquic_native_debug_set` 导出 + debug 写入改 `cheng_fd_write` 裸 fd 直写；
3. `patches/m6q_psb_head_registry_miss_diag.patch`（65 行，对 HEAD psb）：
   registry_miss 现场诊断（p/hdr/len/dead/live/q），供编译器战役复用。

**构建产物（ohosdev artifacts/mobile_m6a_hap/）**：
`psb_ohos_m6q.o` a4d865ca…（HEAD 态+诊断）、`psh_ohos_m6q.o`、`dbg_ohos_m6q.o`
（当前源冷链重编）、`ssm1q_loopback_ohos.o` c38e0f86…、装机
`libssm1napi.so` 4572d498…（46MB，-z defs 闭合，16KB LOAD align 4/4）。

**UniMaker 侧（本战役文件直改，非主仓 patch）**：
`scripts/ssm1_napi_shim.c`：stderr→hilog 桥、`cheng_qprobe_tick` 定义、probe 入口
打点、六 cheng 包装器 fetch-忙守卫、`ssm1qServeFetchStart` 合并入口；
`ssm1smoke/.../Index.ets`：runAll 改走 shareE2E（serve+fetch 同线程）、rerun 移至
receiveFinish 后；`types/libssm1napi/index.d.ts` 增声明。

## 4. 真机时间线（真实，8 轮）

| 时刻 | 轮 | 结果 |
|---|---|---|
| 01:58 | 1 | 有界 probe 首验：进程不再死；sendto rc=4 但 wait=0（内核丢包期）→ 定性 1.1 |
| 02:04-02:05 | 2-3 | 同状复现 + 发现 fetch worker SIGSEGV（cppcrash）/ exit 42（事件锁递归 fail-stop）|
| 02:28-02:29 | 4 | probe v2 四通道全通（lip=192.168.1.2）；debug trail 首现：握手达 server init server，registry_miss 现身 |
| 02:40 | 5 | fd-write 版 debug：miss 仍在（排 std/os 层） |
| 02:57 | 6 | debug OFF：仍 miss（排 debug 路径；守卫下主线程零 cheng 活动） |
| 03:04 | 7 | HEAD 态重编 psb：仍 miss（排 psb 代际） |
| 03:08-03:19 | 8-9 | 诊断 psb：`p=0x1` 实锤；shareE2E 同线程判别：仍崩（排跨线程）；debug trail 收束 parse peer 域 |

每轮可稳定复现：probe OK（全层 rc）→ T_PUBLISH 280-292ms（发布即就绪）→ fetch
stage=1 → dial ~0.1-0.4s 处 worker 死亡（registry_miss 或 SIGSEGV）。

## 5. M6a 秒开终判词

- **秒发**：PASS 维持。T_PUBLISH = 280/284/287/288/290/292ms 六轮稳定
  （rawfile 8-15ms + serve 272-279ms），发布即就绪（listening，宿主侧随后可拉）。
- **秒开**：BLOCKED（§1.2 冷后端误编译，非网络/协议/密码学层）。宿主环回参照
  fetch→首帧 2.3ms 不变；安卓真机跨机 152-156ms（M2）不变。修复路径明确：
  编译器战役对 dial 泵路径做 DRV78 类反汇编定位（观测件已全部就位：
  psb_head_diag + stderr 桥 + stage 打点 + QUIC debug 开关）。
- 已装机状态：观测版 HAP（本诊疗轮最终构建）在机，可一键复跑。

## 6. 待主仓入库清单（patches/，评审后 apply）

1. `m6q_ssm1q_loopback_export_probe_bounded_diag.patch` —— 必入（1.1 根治 + 观测面）
2. `m6q_native_runtime_debug_set_export_and_fdwrite.patch` —— 必入（app .so 安全 debug 面）
3. `m6q_psb_head_registry_miss_diag.patch` —— 编译器战役用（对 HEAD psb，冷链可编译）

## 7. BLOCKED 项与如实记录

1. **秒开数字未出**（§1.2）。崩点：worker 线程 dial 中，`init server parse peer` →
   `SetSessionDialAddr`/`CopyAddrInto` 域，释放 p=0x1；冷后端 DRV78 类误编译待
   编译器战役反汇编定位。
2. **环回 UDP 早间内核丢包**（Out+1/In+0）机制未穷尽（网络态相关，当前全通）；
   probe v2 已固化为常备体检。
3. **psb 冷链重编被并行会话 WIP 卡住**：depth-2 前向调用限制；M6q 用 HEAD 态绕行，
   WIP 落地后需回切并保持 psb/psh/dbg 与闭包同代（建议进 CI 门）。
4. UniMaker shim 直改未出 patch（战役自持文件）；psb 诊断轮曾短暂改注
   program_support_backend.cheng，已还原至并行会话 WIP 态（本文件未入任何 m6q 改动）。
5. 两仓 git 零写操作；hdc 仅 install/shell/file/list；锁屏密码未绕过（等解锁续跑）。
