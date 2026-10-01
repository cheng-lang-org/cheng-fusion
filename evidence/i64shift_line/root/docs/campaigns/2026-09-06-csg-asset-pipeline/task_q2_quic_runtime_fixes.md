# task_q2_quic_runtime_fixes.md — QUIC 运行时三缺陷修复（X 线双真机互发拦截点）

日期：2026-09-12。承 task_x_dualdevice_share.md §6 三缺陷清单。工作克隆
`/Users/lbcheng/cheng-f24/anchor_clones/quicfix`（cp -cR 主仓快照；改源 rm .cheng-csg-core；
envelope 清理；全程 quicfix 内可改可编）。主仓 src/quic、src/libp2p、bootstrap 零直接改动
（全部修复以 patch 落本目录，git add -f，两仓 git 零写操作）。UniMaker 仓零接触
（鸿蒙 HAP 工程为 cp -cR 拷贝件，置于 quicfix/.tmp-exec/q2hap/）。

设备：安卓 DCO-AL00 `GBJ0222B24021692`（WiFi 192.168.1.6）、鸿蒙 Mate 70 Pro+
`3KN0224C18003262`（192.168.1.2，DevEco hdc）。车头：quicfix 内 cc -O2 单文件重烤
（`bootstrap/cheng_cold.c`，内含 cold_parser.c），宿主编译 3.3MB 可执行；安卓目标走
M1 修复链复刻（fakendk wrapper→NDK27 + patched_lib/libc.a + stdio/errno 桥 .a
PREPEND_OBJ 首定义）；ohos 目标走 DevEco clang（M4 配方 --emit:obj + lld 链）。

---

## 1. 缺陷1（安卓 idle-accept SIGSEGV）：根因闭环 + 修复 + 真机验证 ✅

### 根因（二进制级实锤）
`bootstrap/cheng_cold.c` `cold_emit_linux_aarch64_errno_location_provider` 生成
`movz x11, #0x4000, lsl #32`，注释误算为 0x4000000000，实际常量 = **0x400000000000**
（4096 倍）——超出 aarch64 39-bit 用户 VA（top 0x7fffffffff），mmap(MAP_FIXED_NOREPLACE)
恒 ENOMEM，**生成器不检查返回值**仍把该地址当 errno cell 返回。idle-accept 空扫的
recv EAGAIN 是全进程第一次走 `cheng_native_errno_code_bridge` 读 cell 的路径 →
`ldr w0,[x1], x1=0x400000000000` → SIGSEGV fault addr 逐位吻合 task_x §3.1 真机现场。
环回不触发（accept 时数据已在队列，recv 成功不读 errno）；客户端只在已失败路径读
errno，故 M5 时代从未暴露。

对从真机 pull 回的 M5 r5 serve exe 反汇编实锤：
```
0000000000789928 <cheng_linux_errno_cell_location>:
  789928: d2c8000b   mov x11, #0x400000000000   // =70368744177664
```

### 修复（q2_bootstrap_cold_errno_cell_imm16_mmap_and_annotation_comment_fix.patch）
1. imm16 0x4000 → **0x40**（真实 cell 0x4000000000）；x64 版值本来就正确，不动。
2. aarch64 与 x64 两 provider 均补 **mmap 失败检查**：失败返回 NULL，让 errno bridge
   按既有三级 fallback（raw cell → __errno_location → last-errno tracker）走，
   永不泄漏假指针。

### 真机验证（真实输出）
- 修复版 fdwait probe（安卓直跑）：`bind rc=0 fd=3`；`errno_cell_probe=0`（读 cell
  不崩且值合法）；DEVICE_RC=0。
- 修复版 serve exe 二进制复核：`mov x11, #0x4000000000`（=274877906944）✓。
- **idle-accept 存活**：`timeout 12 q2_serve …` → listening 后 8s 检查点进程存活
  （`__arm64_sys_nanosleep` 正常睡眠态），SERVE_EXIT=124（外层 timeout 杀，非 crash）。
  对照：旧 M5 r5 serve exe listening 后 <1s SIGSEGV（两次独立复测，task_x §3.1）。

---

## 2. 缺陷2（「ohos fd-wait 热返回」）：定性修正 + 平台桥修复 + 残余阻塞点 ✅/⚠️

### 定性修正（C shim 打点实证，修正 task_x 判词）
在鸿蒙 HAP 内以链接序首位注入 C 桥（`q2_ohos_udp_platform_bridges.c.patch`：
`cheng_mobile_udp_fd_wait_readable` 平台实现 + `libc_sendto` 截获 + 双向限频打点），
真机实测：

```
Q2FW fd=39 to=20 rc=1 rev=0x1 errno=0     ← poll 20ms 立即 rc=1 POLLIN（连续 8 次）
Q2ST fd=39 len=19 rc=19 errno=0 to=192.168.1.6:46767 alen=16   ← sendto 全部成功
```

**poll 原语没有 bug**：fd=39（listener UDP fd）恒 POLLIN 是因为**客户端 Initial
重传风暴持续到达**（跨设备 WiFi 有损窗口下客户端握手不推进 → PTO 重传）→ 扫描
循环「空等」实为「每轮都有真数据」。真正问题在握手链下游（见残余阻塞点）。
task_x「poll 对所用 fd 恒即时返回」的定性予以修正。

### 修复件（已落 patch，等待全链通后闭环验证）
1. `q2_ohos_udp_platform_bridges.c.patch`（新增文件）：fd-wait 平台原语 C 实现
   （契约 1/0/-errno 同 provider，musl poll，限频打点）——ohos 形态的 fd-wait 从此
   走 C 平台桥（M4 shim 同款模式），天然免疫 cheng ohos-obj codegen 代际风险。
2. `q2_quic_fdwait_diag_scan_and_errno_readout.patch`：native_runtime 增
   `msquicNativeLastFdWait{Rc,Fd,DtMs}` 诊断读数槽 + getter（跨模块 var 全局直读会
   触发 cold 后端 "cold assignment value must be int64" 限制，必须走函数访问）；
   QWaitReadable/ServeAcceptStream 失败路径带出 q2heat/q2rc/q2fd/q2dt。

### 附带根修发现（本轮最重的隐性缺陷）：obj 代际混链 → registry_miss/SIGSEGV
- 用不同车头/不同树态编的 cheng obj **混链**（如 HEAD 树新编 loopback + M6q 代
  psb/psh），鸿蒙真机 accept 首包即 `cheng_orc_release_failure registry_miss` →
  SIGSEGV（崩链符号化：`parseMultiAddress → cold-drop-object:51 → cheng_mem_release
  → mem_header_is_ledger`，addr=0xfffffffffffffffd=-3）。
- **纯净同批**（同车头同树同批全 5 obj）方可装机；真机复现过的可存活的「M6q 套件」
  在 ohosdev/artifacts/mobile_m6a_hap/（ssm1q_loopback_ohos.o 11,901,665B 等，
  t_drop_v3 车头 11:56 编）。byte-parity 可作同代判据。
- **t_drop_v3 车头已丢失**（orcfix/.tmp-exec 不存在），其源态 = ohosdev 工作树
  12:08 前版本，与现存 12:08 版本仍有 layout 差（clean obj 11,899,890 vs M6q
  11,901,665）。**登记：车头必须任务级归档（含源快照哈希），防再丢**。
- 混链期间同轮定位出：主仓 HEAD cold 后端缺「annotation 附着 comment-only 行修复」
  （ohosdev WIP 123 行 diff 中的 2026-09-12 silent-ownership-flip lesson 修复），
  已并入 bootstrap patch。

---

## 3. 缺陷3（RERUN 二次 fetch stage=6）：定位推进，修复待验证 ⚠️

- 复现入口在位：真机 T_SERVE conn=1→4 逐连接 `scan_failed spins=3000`
  （二次连接叠加在缺陷2 链上，无法单独立测）。
- 源码定位：`QDrainSegmentRead` 的 `chunkLen <= 0 → return true` 分支**不计
  idleSpins**（L263-264），构成无封顶循环路径——与 M6b「60s 无 idle-cap FAIL」
  吻合（Read 恒空 chunk 时 drain 永不退出）。
- 修复方向（下一轮）：该分支并入 idleSpins 计数 + 时间 deadline；RERUN 专测
  待缺陷2 链通后执行。

---

## 4. 跨设备互发全链：BLOCKED（最后一环 = 鸿蒙服务端 negotiate 推段）

| 矩阵 | 结果 |
| --- | --- |
| 安卓 client → Mac serve（基线复跑） | **全绿**：dial 1.2s、sha256-match=be20ab8e…、conn=1 served=2 —— 环境窗口质量良好，客户端与服务端（Mac 形态）双验证 |
| 安卓 client → 鸿蒙 serve(4443) | accept 成功（T_SERVE conn=1..4），negotiate 扫描 3000 旋耗尽 FAIL；服务端 sendto 全成功、客户端 In +17 收到 flight；**客户端 handshake 仍不 ready / negotiate ack 不回** |
| 鸿蒙 client → 安卓 serve | fetch_start OK；拨号包未见到达（安卓 Out/In 无增量），受鸿蒙→安卓方向 WiFi 有损窗口影响，未到达服务端 accept |

精确残余诊断（下一轮切入顺序）：
1. 服务端 flight 内容与时序：Q2ST 观测只有 len=19/32 小包、首次 flight 滞后约 4.7s，
   未见带 cert 的大 flight 包——打点限频重置后抓全 flight 序列，判定「flight 不完整」
   还是「客户端判废」。
2. `InitServerSession` 对重传 Initial 的会话重建循环（stale_initial_after_flight
   分支）在跨设备丢包窗口下反复重置会话 → negotiate 永远饥饿（环回
   clientDatapathId>0 跳过该分支故不触发——环回/跨设备差异的根）。
3. 扫描窗口改时限制（轮数制在有真数据轮时 60s 预算塌缩）。
4. 鸿蒙真机环回 ALL（127.0.0.1 全链）作为不依赖 WiFi 的服务端栈完整性验收
   （本轮因设备锁屏/按钮触发未完成，M6a 以来首次可测窗口）。

---

## 5. 待主仓入库清单（patch 已 add -f，均过 git apply --check）

| patch | 内容 |
| --- | --- |
| `q2_bootstrap_cold_errno_cell_imm16_mmap_and_annotation_comment_fix.patch` | 缺陷1 根修（imm16 0x40 + aarch64/x64 mmap 失败检查）+ annotation 附着 comment-only 行修复（silent-ownership-flip lesson 的 cold 后端侧） |
| `q2_quic_fdwait_diag_scan_and_errno_readout.patch` | native_runtime fd-wait 诊断读数槽 + getter；QWaitReadable/ServeAcceptStream 失败路径 q2 打点 |
| `q2_ohos_udp_platform_bridges.c.patch`（新文件） | ohos/安卓共用的 UDP 平台桥 C 实现：fd-wait（poll 契约 1/0/-errno）+ libc_sendto 截获打点版（生产版去打点段） |

apply 前按纪律跑 `python3 .rebuild/s1b_step3/r9/patch_preflight.py <patch>` 并确认
`bootstrap/cheng_cold.c` 冻结窗口（主仓 bootstrap 有并行会话 WIP：identity group
谓词改动不在本 patch 内，两集合互不重叠、可独立 apply）。

## 6. BLOCKED 项与如实记录

1. **跨设备 3 轮中位未达成**：最后一环 = 鸿蒙服务端 negotiate 推段（§4 残余诊断
   1-3），数字无从伪造。Mac serve 基线复跑全绿，环境窗口健康，阻塞点已收敛到
   鸿蒙 cheng 服务端栈的握手 flight 链。
2. **q2fix 车头与 t_drop_v3 非 byte-同代**（clean obj 差 1775B）：本轮 HAP 验证
   走「M6q 套件 + C shim 桥」组合达成；带 cheng 层打点的全套 obj 仍差一个与
   t_drop_v3 byte-同代的车头（其源快照已随 orcfix 清理丢失）。车头/源快照任务级
   归档已登记为战役纪律（§2 附带发现）。
3. **主仓 src/WIP 与克隆同步**：主仓工作树 34 个 src WIP 文件（并行会话）曾整批
   进入 quicfix 克隆，本轮已还原至 HEAD 后再施加本任务 3 文件改动；主仓 apply
   本 patch 不受 WIP 影响（无重叠文件）。
4. 两仓 git 零写操作（仅主仓 patches 目录 add -f）；真机操作仅 adb push/shell/
   ping/snmp 读数与 hdc install/shell/uitest（含一次滑动解锁）；UniMaker 仓零接触。
