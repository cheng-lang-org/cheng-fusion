# fb_ohos_rebuild.md — ohos obj 构筑链重建 + negotiate_ack_slot_4 定位清偿（任务 F-B，2026-09-17）

**判词：ohos obj 构筑链在当前树（HEAD ed55610d3 + `artifacts/bootstrap/cheng.stage3`）完整重建成功。
negotiate_ack_slot_4 缺陷在当前树新鲜构建上复现（4/4 确定复现），根因定位并清偿：
`ssm1q_loopback_export.cheng` QWaitReadable 纯客户端形"轮首单泵"依赖遗留 cur 槽，
pump 的 active/closed gate 判到非 active 槽 → 全程空转零收包。修复（纯客户端回退
exe 形"每 bind 一泵"）后：**Mac serve → 鸿蒙 fetch PASS ×2、安卓 q3_serve → 鸿蒙
fetch PASS ×1**（T_FETCH 1206–1962ms，ready→首帧 92–116ms，sha256==cid 全过）。
冻结门 L1 的"安卓 serve → 鸿蒙 fetch"方向解锁。ohos serve 方向（门外附加）仍有一
个独立缺陷（accept 应答握手不通），已精确登记，见 §7。**

---

## 1. 构筑链重建（当前树 driver，无需车头/克隆）

### 1.1 driver ohos obj 发射（步骤 1：可行性）

```
./artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang \
  --in:src/tools/ssm1_moq_serve.cheng --emit:obj --target:aarch64-linux-ohos \
  --out:.scratch/fb/probe_serve_ohos.o --report-out:.scratch/fb/probe_serve_ohos.report.txt
```

- 报告：`target=aarch64-linux-ohos`、`emit=obj`、`unresolved_symbol_count=0`、
  `cold_frontend_function_count=4443`、`cold_body_op_count=90662`。
- `llvm-readelf -h`：ELF64 / AArch64 / REL（relocatable）✓。11,144,624B。
- fetch 闭包同法可编（4404 函数，unresolved=0）。
- `--emit:exe --target:aarch64-linux-ohos` 被驱动显式拒绝：
  `error=OHOS AArch64 executable emit unsupported; use --emit:obj`（在案，预期内）。

### 1.2 provider 闭包与 exe 链接（步骤 2）

主 obj 只带 `main` + 程序逻辑；bridge/provider 层单独成 obj 后 DevEco clang 链接：

```
PSB=src/core/runtime/program_support_backend.cheng     → psb_ohos.o   (8,989,032B, unresolved=0)
PSH=src/core/runtime/program_support_host_runtime.cheng → psh_ohos.o  (25,546,948B, unresolved=0)
DBG=src/core/runtime/debug_runtime_provider.cheng       → dbg_ohos.o  (36 defined fns, unresolved=0)
```

`core_runtime_provider_linux.cheng` 冷编不可用（`expected pointer store value`，
stage2/stage3 同崩，task_m1 §5 早已登记同签名；compiler_main.direct 则被
`ZRPC_PUBLIC_RAW_POINTER_TYPE_FORBIDDEN` 门禁正确拦截）——**不需要**：其 bridge 面
由既有 `src/tools/ssm1_ohos_shim.c`（Q3/Q4 真机验证过的 C shim，平台工具允许面）
补齐，链接残差实测=仅 libc（calloc/free/usleep）。

```
OH=aarch64-unknown-linux-ohos-clang (DevEco llvm/bin, clang-15)
$OH -O2 -fPIC -ffunction-sections -Dmain=fb_shim_unused_main -c src/tools/ssm1_ohos_shim.c -o shim_ohos.o
$OH -march=armv8-a -pie -Wl,--allow-multiple-definition -Wl,--gc-sections \
   -o serve_ohos probe_serve_ohos.o psb_ohos.o psh_ohos.o dbg_ohos.o shim_ohos.o   # RC=0
$OH (同上, fetch_ohos.o)  -o fetch_ohos                                            # RC=0
```

产物（.scratch/fb/）：`serve_ohos` 45,352,312B、`fetch_ohos` 45,432,120B——
`ELF 64-bit LSB pie executable, ARM aarch64, interpreter /lib/ld-musl-aarch64.so.1,
NEEDED libc.so`，零 cheng 残差。已知登记项复现并按 M1 配方处理：
psb/psh 重复定义 `cheng_host_fd_at`/`cheng_host_close_fd_if_valid`（`--allow-multiple-definition`）；
shim 的 daemon `main` 引用 `ssm1d_cmd`（`-Dmain` 改名 + `-ffunction-sections` + `--gc-sections` 收集）。

### 1.3 真机执行 = 平台策略层封死（确定性，非本次可解）

hdc 推入 /data/local/tmp + chmod 755 后：直接执行 RC=126、
`/lib/ld-musl-aarch64.so.1 <exe>` 亦 RC=126（sh 域对 data_local_tmp 标签拒绝 exec，
loader 也不可 exec）。与 task_m4_ohos_smoke.md §4 的 7 种尝试全封逐字同签名，
今日复测一致。**standalone exe 路线在 ohos 真机不可达 = 平台策略事实**，
按预案回退 HAP/NAPI 形态（历史 Q3/Q4 验证形态）。

### 1.4 libssm1napi.so 重建（当前树闭包，无需 UniMaker 车头）

```
export 闭包: ssm1_tick_daemon_export.cheng → ssm1d_export_ohos.o    (unresolved=0)
            ssm1q_loopback_export.cheng   → ssm1q_loopback_ohos.o (unresolved=0)
NAPI shim : UniMaker hongmeng/scripts/ssm1_napi_shim.c → ssm1_napi_shim.o
$OH -shared -fPIC -O2 -Wl,-soname,libssm1napi.so -Wl,-Bsymbolic \
    -Wl,--allow-multiple-definition -Wl,-z,defs -Wl,-z,max-page-size=16384 \
    -Wl,-z,common-page-size=16384 -o libssm1napi.so \
    ssm1_napi_shim.o shim_ohos.o ssm1d_export_ohos.o ssm1q_loopback_ohos.o \
    psb_ohos.o psh_ohos.o dbg_ohos.o \
    -lace_napi.z -lace_ndk.z -lnative_window -lhilog_ndk.z -ldl -lm        # RC=0
```

验证：LOAD align 全 0x4000（16KB 门过）；9 个 NAPI 必需导出
（ssm1d_cmd/ssm1d_load/ssm1q_serve_start/ssm1q_fetch_run/ssm1q_fetch_client_run/
ssm1q_first_frame_gray/ssm1q_assembled_len/ssm1q_assembled_copy/ssm1q_serve_serve_once）
全 defined；导入面 = napi/OH_* / libc ✓。
NAPI shim 编译两处既有警告按平台层处理（m16b include 顺序：`.scratch/fb/napi_build/`
副本补一行前置声明 + `-Wno-error`，仓内 UniMaker 源未改动；声明副本仅构建期工件）。

HAP 重打（hvigor，DevEco 自带，DEVECO_SDK_HOME 显式设置，12s/次）+ `hdc install -r`。
rawfile 载荷 huguangsheng.ssm1 sha=c11e2997…（与冻结门同包）。

## 2. 缺陷复现（当前树新鲜构建，确定性）

装机即复现，与 ma_reconnect §5.2 同签名，跨服务端一致：

```
hilog: fetch_start host=192.168.1.8 → stage=1 elapsedMs=153 → stage=4 elapsedMs=1506
       → fetch_poll DONE rc=25 resp=FAIL negotiate_ack_slot_4 → T_FETCH done fetchMs=5420
Mac serve_mac: conn=1 ERR chunk_write kfRange=[4625,65572]     （服务端两代一致）
```

隔离判据：同源 darwin 目标（昨日 serve_mac/fetch_mac）PASS；鸿蒙 HAP 内
ALL 环回（同进程 serve+fetch 全链）**全通**（224 帧播完 eof）→ 数据面/解密/
shim 锁/代码生成在 lo 上全通；只有跨机（wlan0）客户端收包死。

## 3. 根因定位（证据链，全部真机实测）

诊断手段（平台工具允许面，用后已移除）：`.scratch/fb/udp_debug_event.c`
强符号覆盖 psb 弱 no-op `cheng_mobile_udp_debug_event` + psh `cheng_host_poll`
（链接序先于 psh.o 生效；`--allow-multiple-definition` 保首定义，故 glue 必须排第一位）+
`QWaitReadable` 失败路径带出 `q_lastErr`。

证据链：
1. `FAIL negotiate_ack_slot_4 lastErr=scan_exhausted spins=3000 stream=4`（rc=68）
   —— 3000 spin 扫描耗尽（非 pump Err）；3000 spin 仅 4.06s ≈ 1.35ms/spin。
2. `/proc/net/udp`（uid 20020306）：客户端 UDP 套接字 **rx_queue=0x8AC0=35520B
   积压、drops=0** —— 服务端重传全部堆在内核队列，应用一个都没 recv。
3. host_poll 全量记录：scan 的 poll(fd,20ms) **每次 rc=1 revents=POLLIN 瞬时返回**
   （fd 恒可读，spin 快的原因）；3000 spin 期间 **pump 内部的 poll(0)/recvfrom 一次
   都没发生**（等 wait 后本应出现的 kind=7/kind=9 事件为零）。
4. `msquicNativePumpCode` 入口 gate：`if ! gMsQuicSessions[msquicNativeCurSlot].active
   (或 closed): return None` —— **静默空转**。cur 由上一轮迭代的
   `msquicNativeBindSlotFromPipeIdx(1000001+k)` 遗留；QWaitReadable（loopback 形）
   每轮只在**轮首** pump 一次，第一轮的 cur = negotiate 发送路径遗留值，
   在鸿蒙上指向非 active 槽 → 此后每轮 gate 判死、永不收包。
5. 对照：M5 exe 形 `FetchWaitReadable`（ssm1_moq_fetch.cheng）是"**每 bind 一泵**"
   —— bind 后 cur 即为被扫槽，pump gate 恒有 active 会话 → android/Mac exe 真机
   全部 PASS。两形语义差异 + ohos 首轮遗留 cur 落点 = 缺陷触发面；
   lo 环回不死是因为第一轮 spin 0 就在槽里见到数据（无需泵）。

**根因结论：当前树代码缺陷（loopback export 的纯客户端扫描形与 native_runtime
pump 的 cur-slot gate 语义不匹配），非 ohos 目标代码生成缺陷、非设备环境。**
归 quic 运行时/工具层，修复在允许面文件内。

## 4. 修复（src/tools/ssm1q_loopback_export.cheng，非共享文件）

`QWaitReadable`：`! q_listening`（纯客户端，无跨槽错读风险）时回退 M5 exe 形
——每 bind 一泵 + wait 后 wake 泵；双角色（q_listening=true）保持轮首单泵原形
逐字节不变。另：FAIL negotiate_ack_slot_4/8 行附 `lastErr={q_lastErr}`
（scan_pump_err/scan_exhausted/scan_bind_pump_err 文本），FAIL 行带诊断属工具
既有规范。诊断探针 `msquicNativeSetDebugTls13(true)` 已从源码移除（还原）。

```
git diff --stat: src/tools/ssm1q_loopback_export.cheng | 21 insertions(+), 4 deletions(-)
```

修复后首轮即 PASS（诊断构建）：T_FETCH 1359ms、ready→首帧 92ms、
sha256-match=be20ab8e…（==cid）、播放 render OK、"SSM1 SHARE E2E PASS"。

## 5. 冒烟数字（正式件，门口径；每轮独立 serve 进程+独立 fetch）

正式 lib sha256 = `f5e0c173e450a621d463af130125859d6cfbb254a8c2cc464956e9db3fb87502`
（46,196,312B）。

| 轮 | 方向 | 服务端 | T_FETCH | ready→首帧 | sha256==cid | 服务端 |
| --- | --- | --- | --- | --- | --- | --- |
| A'1 | Mac→鸿蒙 | serve_mac (PID 50089) | 1357ms | 96ms | ✓ be20ab8e… | conn=1 served=2，无 ERR |
| A'2 | Mac→鸿蒙 | serve_mac (PID 50331，独立进程) | 1206ms | 100ms | ✓ | conn=1 served=2，无 ERR |
| B1 | 安卓→鸿蒙 | 机上 q3_serve (Q3 终验件) | 1962ms | 116ms | ✓ | conn=1 served=2，无 ERR |

- B1 即冻结门 L1 第二方向（安卓 serve → 鸿蒙 fetch）——**由 BLOCKED 转为 PASS**。
- 安卓侧 q2_fetch（机上历史件）：本轮作 C 方向客户端用，FAIL 见 §7（属鸿蒙
  serve 方向，与 L1 门两方向无关）。
- 附带现象（与传输无关，既有登记）：RECEIVE 成功后 auto depth 层
  `play_asset_reject rc=-13`（Q4 期既知，播放主链不受影响）。

## 6. 产物与 SHA-256 登记

| 产物 | 形态 | SHA-256 / 大小 |
| --- | --- | --- |
| libssm1napi.so（当前树闭包正式件） | NAPI .so | `f5e0c173e450a621d463af130125859d6cfbb254a8c2cc464956e9db3fb87502`，46,196,312B |
| 终版装机 HAP（纯客户端，RECV_HOST=192.168.1.6） | signed HAP | `71e46d2703c54645c921b40d32ca4a49f5dedbca0a855ac7fc6f3d4ba4601728` |
| serve_ohos / fetch_ohos（实验件，真机策略封存） | AArch64 PIE exe | 45,352,312B / 45,432,120B（.scratch/fb/） |
| obj 中间件 | ohos obj ×7 | .scratch/fb/（probe_serve/fetch_ohos、psb/psh/dbg/shim/ssm1d/ssm1q） |
| 被覆盖件 | Q4 lib（4f87596a…，46,179,520B） | 已被本重建替代（ma_reconnect 登记其 negotiate 3/3 FAIL + serve ORC 崩） |

UniMaker 侧改动登记（平台壳层，Index.ets 一处 + jniLibs 替换）：
`aboutToAppear` 自动 publish 注释（纯客户端装机形态，恢复方法=取消注释）；
`RECV_HOST='192.168.1.6'`（指向安卓 serve，终版态）。

## 7. 遗留缺陷登记（ohos serve 方向，门外附加方向，未解）

ohos HAP serve（auto-publish ON，正式 lib）+ 任意当前树客户端
（Mac fetch_mac / 安卓 q2_fetch）→ 客户端 `FAIL dial msquic native: handshake ! ready`，
鸿蒙侧 T_SERVE 零 accept 日志。实测：listener 0.0.0.0:4443 套接字在位；
accept 循环阻塞收包实为 **EAGAIN 自旋**（fd 非阻塞，waitMs=-1 路径 event8
err=11 连发 22040 次）；安卓客户端 169B Initial **成功收到一次**（kind=9 a=169）
但其后握手应答未完成、客户端重传不可见（rx_queue=0）。判定：serve accept/握手
应答路径存在独立缺陷（与 §3 客户端缺陷同族但不同点：pump/应答在 accept 半环的
推进），需要与 §3 同规模的专项插桩定位（BuildPacket/Flush/send_to 面无事件暴露，
本轮诊断胶水未覆盖）。历史对照：Q4 lib 同方向为 ORC registry_miss 崩（ma_reconnect
§5.3），本重建后不再崩、改为确定性握手失败——严重度下降，仍未通。

## 8. 现场状态

- 鸿蒙 3KN0224C18003262：终版 HAP（71e46d27）装机，纯客户端形态，RECEIVE 指向
  192.168.1.6:4443；/data/local/tmp 诊断临时件已清（fb_* exe/截图/hilog）。
- 安卓 GBJ0222B24021692：q3_serve 已 kill；机上 q2_fetch、q3_serve、载荷原样。
- Mac：serve 进程已清；.scratch/ma 双件未动。
- cheng-lang 树：唯一改动 = src/tools/ssm1q_loopback_export.cheng（§4 diff）。
- 编译缓存：.cheng-csg-core 未清（obj 复编走增量，报告内含 freshness 字段）。

## 9. 结论

1. ohos obj 构筑链解锁：当前树 driver + DevEco LLVM 全链可复产（无需已删车头/克隆）。
2. negotiate_ack_slot_4 根因清偿，鸿蒙接收方向（Mac→鸿蒙、安卓→鸿蒙）双通，
   L1 门第二方向解锁；≥10 轮正式计数留给门执行轮（本任务为冒烟轮）。
3. 鸿蒙 serve 方向独立缺陷已登记（§7），解锁需下一专项。
