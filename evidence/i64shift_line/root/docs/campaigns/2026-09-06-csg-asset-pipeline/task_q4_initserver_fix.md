# task_q4_initserver_fix.md — 反向互发闭环: 鸿蒙 serve accept 崩溃根修 + 真机全链 PASS

日期:2026-09-13。承 task_q3_initserver_loop.md §反向互发复验补录。工作克隆
`/Users/lbcheng/cheng-f24/anchor_clones/quicfix`(Q2/Q3 修复在),主仓 src/quic、
src/libp2p、bootstrap 零改动(全部修复以 patch 落本目录,git add -f,两仓 git
零写操作)。UniMaker 仓零接触。

设备:安卓 DCO-AL00 `GBJ0222B24021692`(WiFi 192.168.1.6,adb,客户端 =
Q2 fetch exe,未动)、鸿蒙 Mate 70 Pro+ `3KN0224C18003262`(192.168.1.2,
DevEco hdc,服务端 = 本轮重编 HAP)。车头 q2fix(quicfix bootstrap);
ohos obj 五件同批重编;真机 WiFi RTT 79~210ms 弱信号时段。

## 1. 根因定位(真机行级打点实证)

### 1.1 旧判词修正: 「flight 只发小包」是表象,真根 = 服务端 accept 首包即崩
Q2 §4 残余①「服务端 flight 只有 len=19/32 小包、无 cert 大包且滞后 4.7s」
本轮证伪为表象:鸿蒙 serve 进程在 accept 处理首包时即
`cheng_orc_release_failure code=registry_miss operation=normal_release
detail=wrong_object_or_owner` → SIGSEGV → 进程死(exit 42)。flight 从未成为
问题——服务端根本活不到 flight 之后。Q3 正向终验(鸿蒙 fetch → 安卓 serve)
只走 fetch 客户端路径,从未在 HAP 内跑过 serve accept,故漏检;补录轮的
「init server parse peer」后无下文 + 「客户端 handshake ! ready」即此崩。

### 1.2 崩点钉位(q4 全链打点,一轮真机)
native_runtime 新增 q4 定位链(acc recv→fill→sv_initial→pre_init→init→
sv_ready→sv_send)+ multiaddress 行级 ma4 打点。真机序列:

```
q4 acc recv len=169 / q4 fill side=1 len=169 / q4 sv_initial slot=0 pn=1
q4 pre_init / init server enter / init server after reset
init server parse peer len=34 text=/ip4/192.168.1.6/udp/34131/quic-v1
ma4 enter / ma4 seg idx=1 text=ip4 / ma4 proto=4 size=4
ma4 vseg text=192.168.1.6 / ma4 vb len=4 / ma4 vb freed
cheng_orc_release_failure registry_miss → SIGSEGV
```

崩点 = parseMultiAddress 首轮迭代作用域收尾。反汇编(ssm1q obj 的
`<cold-drop-object:51>` 助手)证实机制:命名 `Result[Bytes]` 局部经 `Value()`
消费后,作用域尾 drop 助手仍对 Ok 残留执行 release——被消费的
payload ptr 残留 = 1(Bytes 值对象移动毒化),遂 `cheng_mem_release(1)` →
registry_miss。Mac/安卓 exe(driver 直链,provider 自洽)的 mem release 对
非堆指针容忍,同源同驱动不崩;ohos HAP(manual lld 链 + provider heads)
的 release 严查 registry → 必崩。故该缺陷只在 ohos 形态的 serve accept
路径(全栈唯一持有命名 Result[Bytes] 局部的热路径)显形。
Result[MultiAddress]/Result[int32] 命名局部经实证安全(fetch dial 路径与
parseIPv4 内部在 ohos 真机跑通),无需改动。

### 1.3 附带定位: 装机 HAP 的 obj 代际混链(已收口)
Q3 HAP = q2fix 车头新编 ssm1 obj + M6q 代 psb/psh/dbg heads 混链,违反
Q2 §2「纯净同批方可装机」。本轮收口:五件 cheng obj(ssm1d/ssm1q/psb/psh/
dbg)由 q2fix 车头在 quicfix 当前树同批重编(heads 源即克隆树内
program_support_backend / program_support_host_runtime / 
debug_runtime_provider),+ 重编 ssm1_ohos_shim + q2_fdwait_bridge.o 链接
序首位。混链与 1.2 的 drop 缺陷此前叠加,使定位信号混杂。

## 2. 根修(q4 patch,均过 patch_preflight + 主仓 git apply --check)

### 2.1 `q4_multiaddress_result_bytes_drop_registry_miss_fix.patch`
src/quic/multiaddress.cheng:
- 新增 payload 直达形态 `parseProtocolValuePayload/parsePortPayload/
  parseIPv4Payload/parseIPv6Payload`(失败 → 空 Bytes,无 Result[Bytes] 包装),
  `parseProtocolValue` 语义保持(合法输入逐字节同旧路径;错误文案内部化,
  上游仅判 ok)。
- 新增 `readSegmentInto`(bool+out 直达形态),parseMultiAddress 重写为无
  Result[Bytes]/Result[SegmentRead] 命名局部;tail(BytesSlice+MultiAddress
  构造)不变。
- 限频 ma4 诊断打点随源保留(帽 24)。
- 兼带 `import std/strutils as mastrutil`(打点文案用)。

### 2.2 `q4_serve_accept_flight_diag_chain.patch`
src/quic/native_runtime.cheng: q4 定位链打点(acc/fill/sv_initial/pre_init/
init ep/init done/fl begin/fl big/sv_hs/sv_ready,共享帽 48,recv 前打点
独立帽 2)+ sv_send 打点放开 len 门(帽 12)。生产语义无旁路、无兜底;
flight_fail 不限频语义不变。

patch 链:两 patch 叠加于主仓 HEAD + `q3_quic_initserver_stale_loop_pump_
gate_scan_budget_keepalive.patch` 之上(nr 件为 q3 叠加态,合成
q3+q4 patch 过 preflight PASS:ann=0 displaced=0 wedged=0;ma 件直接
preflight PASS;两件对主仓 HEAD+q3 基 `git apply --check` OK)。

## 3. 反向互发真机终验(真实输出,鸿蒙 serve → 安卓 fetch)

形态:鸿蒙 HAP PUBLISH(uitest 187,454)`T_PUBLISH 281ms state=listening` +
`T_SERVE_LOOP OK`;安卓 `q2_fetch 192.168.1.2 4443`(Q2 fetch exe)。

3 轮全 PASS(hilog/adb 原文,sha256 三轮一致且等于权威资产 cid):

```
===ROUND_1===  dial 1375999999 ns  total dial->first-frame ready: 1663999999 ns
  fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B sha256-match=be20ab8ec6be22e984ffc92163bb5b73e2d22e4394b92d44cd127de18d3eb5a6
===ROUND_2===  dial 1823999999 ns  total dial->first-frame ready: 2051999999 ns
  fetch ok ... sha256-match=be20ab8e...(同上)
===ROUND_3===  dial 1320000000 ns  total dial->first-frame ready: 1520000000 ns
  fetch ok ... sha256-match=be20ab8e...(同上)
```

**中位 1664ms**;dial 段 1320~1824ms(真机 WiFi RTT 79~210ms 弱信号窗口);
negotiate 64~236ms、manifest 段 28~36ms、chunk 段 88~136ms。

服务端(同一进程连续 4 连接,RERUN 语义,零重发布):
```
T_SERVE conn=1 resp=OK served headerLen=4625 kfLen=65572 port=4443
T_SERVE conn=2 resp=OK served headerLen=4625 kfLen=65572 port=4443
T_SERVE conn=3 resp=OK served headerLen=4625 kfLen=65572 port=4443
T_SERVE conn=4 resp=OK served headerLen=4625 kfLen=65572 port=4443
```
全 hilog 零 `flight_fail`/`replace_server_session`/`registry_miss`/
`SEGFAULT`;服务端进程存活。q4 sv_send 打点实证 flight 全链在飞:ACK 小包
(19/34/61B)+ 数据大包(1169/1170B × 段流量)——残余①「只有 19/32 小包」
正式闭环为 accept 崩溃表象。

**判词:反向互发闭环达成。鸿蒙 serve → 安卓 fetch 跨设备真机全链 PASS
(3 轮中位 1664ms,sha256 三轮一致,服务端零错误,连续 4 连接无塌缩)。
叠加 Q3 正向(安卓 serve → 鸿蒙 fetch 3 轮 PASS),双向互发闭环。**

## 4. Q2/Q3 精确残余判废
1. 残余①「flight 只发小包无 cert 大包且滞后 4.7s」— 判伪为表象:真根 =
   accept 首包 registry_miss 崩溃(§1.2),flight 从未发出即死;q4 打点实证
   修复后 flight 完整在飞。
2. 残余② InitServerSession 重传 Initial 会话重建循环 — Q3 同 SCID 保会话
   修复有效:本轮真机 `replace_server_session` 零发生,4 连接全 OK。
3. 残余③ 扫描窗口轮数制塌缩 — Q3 墙钟 30s 修复有效:全部连接 negotiate
   在窗口内收敛(64~236ms)。

## 5. BLOCKED 项与如实记录
1. **双 PUBLISH 并发崩溃(未修,登记)**:装机 HAP(自动 publish 版)下
   二次触发 publish → 新旧 accept 线程并发争用 runtime event lock →
   `cheng runtime event lock futex wait failed`(exit 42)。Q3 futex 修复
   仅覆盖 EINTR/EAGAIN;非该二 errno 的竞争路径仍 fail-stop。测试纪律规避
   (冷启后单次 publish);产品化前需 serve_start 与 accept loop 的生命周期
   互斥(登记,不在本使命范围)。
2. **ohos cold 后端 drop 助手缺陷(编译器层,登记主仓后端战役)**:被
   `Value()` 消费后的命名 Result[Bytes] 局部在作用域尾被 release(1)。
   app 层以语义等价形态规避(§2.1);后端层正确修(消费残留不 drop)归
   cold 后端战役,本使命不触碰共享编译器源。
3. 设备操作窗口:鸿蒙真机本轮曾两次离线(锁屏/离开),期间无法测试;
   恢复后 uitest 滑动解锁 + 前台确认后才发坐标点击(设备曾被他人使用,
   前台非目标 App 时绝不注入点击)。
4. 两仓 git 零写操作(仅主仓 patches 目录 add -f);真机操作仅 adb
   push/shell 与 hdc install/aa start/uitest(点击、滑动解锁、截图)/
   power-shell wakeup/hilog/ps;UniMaker 仓零接触。
5. 构建产物任务生命周期:q4 obj/so/HAP 与构建脚本均落 quicfix 克隆
   `.tmp-exec/q4src/`(任务级目录);冷对象缓存未跨任务保留。
