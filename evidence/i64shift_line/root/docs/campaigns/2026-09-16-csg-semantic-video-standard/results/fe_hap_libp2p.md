# fe_hap_libp2p.md — libp2p fetch 接入鸿蒙 HAP（任务 F-E，2026-09-17）

**判词：blocked-at-device-connection（安装就绪 + 一步剩余）。libp2p fetch 已完整接入
鸿蒙 HAP：sv_libp2p_fetch_export ohos obj（unresolved=0）→ NAPI shim 加
libp2pFetch/libp2pFetchPoll → libssm1napi.so 重链（16KB align 门过、必需导出全
defined）→ ArkTS L2P:FETCH 按钮 → 签名 HAP 构建完成（内容物逐一核验：strip 后 so
动态导出面完整、modules.abc 含 libp2pFetch）。**导出闭包本体在安卓真机上以宿主形
预验证 3/3 全绿**（同机 serve 环回：28,897B、5/5 文件 SHA 对拍、落盘字节复核一致，
SV_FETCH_MS=1236/1400/1076）。剩余一步 = 鸿蒙真机 `hdc install` + 点击（设备离线：
hdc list targets 反复 Empty，kill/start 重启无效，LAN /24 无 5555 开放）。**

---

## 0. 继承基座（本轮起点）

前一轮会话已落盘（本轮逐一核验后继续）：

- `src/tools/sv_libp2p_fetch_export.cheng`：F-D fetch 形的 NAPI 导出变体。语义逐跳
  同源（dial→derive(4,4)→SendNegotiate→ReadNegotiateAck→单请求 [0,28897) of
  "sv-closure"→WriteFrame+ReadExact→按 layout 切分→逐文件 SHA 断言→落盘），
  F-D 三陷阱修法照抄；闭包 5 文件的名称/期望 SHA-256 为模块常量。无 fn main。
- `.scratch/fe/sv_libp2p_fetch_export_ohos.o`（11,539,950B，unresolved=0）与
  `UniMaker/hongmeng/scripts/fe_svfetch_build.sh`（NAPI 链接脚本）。
- NAPI shim 已加 `libp2pFetch`（worker 线程跑 sv_libp2p_fetch_run）+
  `libp2pFetchPoll`（主线程轮询，DONE rc=N resp=k=v 单行）。

## 1. 本轮核验（全部实测）

### 1.1 obj 形态 main 同名缺陷确认不波及

```
llvm-nm sv_libp2p_fetch_export_ohos.o    | grep -cw main  → 0
llvm-nm sv_libp2p_fetch_export_android.o | grep -cw main  → 0
```

F-D §G2 的双 main 缺陷只对「含程序入口的源」注入 exe 包装 main；纯 @exportc 闭包
obj 无 main 符号，`fd_patch_obj_main.py` 不适用也不需要（注释里的预判实测证实）。

### 1.2 libssm1napi.so candidate 与 jniLibs 安装件

`fe_svfetch_build.sh` 链接序 = F-B §1.4 逐项 + sv obj 追加在两个 export obj 之后：
shim → shim_ohos.o → ssm1d/ssm1q export → **sv_libp2p_fetch_export_ohos.o** →
psb/psh/dbg。产物校验全过：

- LOAD align 全 0x4000（16KB 门过）；`-z defs` 链接零未解析。
- 必需导出（ssm1d_cmd/ssm1d_load/ssm1q_serve_start/ssm1q_fetch_run/
  sv_libp2p_fetch_run 等 9+1）全 defined；导入面 = napi/OH_*/libc（无 cheng 残差）。
- jniLibs 安装件 == candidate：`007b2efb03fa4e56879bf5be4acfa56578c16f6fa1cf8d8edfb698ec8373ea08`
  （57,233,976B）。

### 1.3 签名 HAP 内容物核验（关键：不是只看 mtime）

hvigor 打包会把 native lib **strip** 后装入 HAP，故 HAP 内 so 字节 ≠ jniLibs 原件，
必须按动态符号表面非哈希判同：

```
ssm1smoke-default-signed.hap（134,962,399B，15:58）
  sha256 = 6b7fcbbd25a2d390ef56e933b28cb97b3216423d4b5202ecd75582d472b8f85c
  内含 libs/arm64-v8a/libssm1napi.so（strip 后 57,002,432B，sha256 14669fec…）
  → llvm-nm -D：ssm1d_cmd/ssm1d_load/ssm1q_serve_start/ssm1q_fetch_run/
    ssm1q_first_frame_gray/ssm1q_assembled_len/sv_libp2p_fetch_run 全在
    （dyn 导出 3653 项，strip 只去 symtab 不动 .dynsym）
  内含 ets/modules.abc：strings 命中 libp2pFetch / libp2pFetchPoll / /svfetch_r
```

ArkTS 接线（ssm1smoke Index.ets）：import libp2pFetch/libp2pFetchPoll；
`libp2pSvFetch()` = cacheDir/svfetch_r<ts> 建目录 → libp2pFetch('192.168.1.6',
38120, outDir) → 150ms 轮询；PASS 判据 = 应答含 `SV_FETCH_OK=1` 且
`SV_FETCH_BYTES=28897`；按钮 `L2P:FETCH`（第 1153 行）在 abc 内确认编入。

### 1.4 导出闭包真机预验证（安卓，宿主形 3/3 全绿）

鸿蒙设备离线期间，用 NDK r27（API 28，getentropy 下限）把**同一闭包 obj**链成
bionic PIE 宿主，在安卓真机（DCO-AL00，192.168.1.6）上对 sv_serve_android 同机
环回——这是 HAP 内 NAPI 将执行的完全相同代码路径：

```
cheng.stage3 … --in:src/tools/sv_libp2p_fetch_export.cheng --emit:obj
  --target:aarch64-linux-android --out:.scratch/fe/sv_libp2p_fetch_export_android.o
  （unresolved_symbol_count=0；obj 无 main）
aarch64-linux-android28-clang -O2 -march=armv8-a -pie -Wl,--allow-multiple-definition
  -Wl,--gc-sections -o sv_feverify_android fe_harness.c <sv obj>
  psb_android.o psh_android.o dbg_android.o shim_android.o    # RC=0
adb push + chmod 755；serve：--bind-host 127.0.0.1 --port 38121（ready 6s 内）
```

harness（.scratch/fe/fe_harness.c）：main → `sv_libp2p_fetch_run(argv1, argv2,
argv3, reply, 64K)`，printf rc+reply，exit(rc)。

| 轮 | rc | SV_FETCH_BYTES | 逐文件 SHA==常量 | SV_FETCH_MS（请求→收全） | DIAL_MS |
| --- | --- | --- | --- | --- | --- |
| 1 | 0 | 28897 | 5/5 ok=1 | 1236 | 1192 |
| 2 | 0 | 28897 | 5/5 ok=1 | 1400 | 1360 |
| 3 | 0 | 28897 | 5/5 ok=1 | 1076 | 1048 |

原文（轮 1）：

```
rc=0 reply=SV_FETCH_BYTES=28897 SV_FETCH_MS=1236 SV_FETCH_DIAL_MS=1192 F0=f1_ball.svblock,3035,0175b22c…b2fb19e,1 F1=ck-1200.payload,8444,fed24d6f…86ad27cb,1 F2=ck-2400.payload,8444,16c89b37…70b03f5,1 F3=ck-3600.payload,8444,64721332…e35fb9be3,1 F4=ballbalance.csgworld,530,b444f023…5a2ff026,1 SV_FETCH_OK=1
```

落盘复核（轮 3 五文件 sha256sum）与常量逐字节一致。机上在位载荷五件
（/data/local/tmp/{f1_ball.svblock,ck-1200,2400,3600.payload,ballbalance.csgworld}）
hash 亦与常量全对。T 结果量级与 F-B HAP 跨机 T_FETCH 1206–1962ms 一致。

## 2. 设备不在线的穷尽记录

```
hdc list targets → [Empty]（任务开始、每阶段后、kill/start 重启后多次复测）
hdc kill; hdc start; list → [Empty]
python3 并发扫 192.168.1.0/24:5555 → 5555_open: []（鸿蒙未在 LAN，无线调试不可达）
adb 侧正常：GBJ0222B24021692 device（安卓 Serve 侧已就位）
```

结论：鸿蒙 3KN0224C18003262 未插 USB 且未开无线调试，本机侧无法恢复，等待设备回归。

## 3. 剩余一步（设备回归后照抄即得 e2e）

一键驱动脚本已就位（安装 + 每轮独立 serve + 唤醒/重启应用 + dumpLayout 动态定位
L2P:FETCH 按钮 + 点击 + 轮询 SVFETCH_RESP + 抓 hilog/serve 双侧日志）：

```
sh /Users/lbcheng/cheng-lang/.scratch/fe/fe_run_e2e.sh 3        # 3 轮；省安装用 … 3 1
```

手动机（若脚本因 UI 差异需调）：

```
hdc install -r /Users/lbcheng/UniMaker/hongmeng/ssm1smoke/ssm1smoke/build/default/outputs/default/ssm1smoke-default-signed.hap
hdc shell "power-shell wakeup"
hdc shell "aa start -b com.example.unimaker -a Ssm1Ability"    # locked 则上滑 658 2500→658 900
adb -s GBJ0222B24021692 shell "nohup /data/local/tmp/sv_serve_android --bind-host 0.0.0.0 --port 38120 --ready-path /data/local/tmp/sv_fe_wlan_ready.port --svblock /data/local/tmp/f1_ball.svblock --ck1200 /data/local/tmp/ck-1200.payload --ck2400 /data/local/tmp/ck-2400.payload --ck3600 /data/local/tmp/ck-3600.payload --world /data/local/tmp/ballbalance.csgworld --max-serve 4 --wait-ms 180000 > /data/local/tmp/sv_fe_wlan.log 2>&1 &"
# 点击路径：应用页第一行第 5 个按钮「L2P:FETCH」（PUBLISH/RECEIVE/RERUN/PROBE/L2P:FETCH）
# 判读：hilog grep SSM1 → "LIBP2P SVFETCH PASS" + SVFETCH_RESP 行（SV_FETCH_OK=1 且 28897 且 F0..F4 ok=1）
```

判据同 §1.4：每轮独立 serve 进程 + 应用重启，≥3 轮 SV_FETCH_OK=1、28897B、
5/5 sha ok，记录 SV_FETCH_MS；（若该 HAP 形态带 restore 导出则再做 fetch→restore
秒开一轮——本 lib 未含 restore 面，与前几代同）。

## 4. 产物哈希登记

| 产物 | 形态 | SHA-256 / 大小 |
| --- | --- | --- |
| ssm1smoke-default-signed.hap（装机件） | signed HAP | `6b7fcbbd25a2d390ef56e933b28cb97b3216423d4b5202ecd75582d472b8f85c`，134,962,399B |
| libssm1napi.so（candidate==jniLibs） | NAPI .so 未 strip | `007b2efb03fa4e56879bf5be4acfa56578c16f6fa1cf8d8edfb698ec8373ea08`，57,233,976B |
| libssm1napi.so（HAP 内 strip 后） | NAPI .so stripped | `14669fec247fe745ab5cc4e82812dc3da3a858a4d90a45950fa5631444df663b`，57,002,432B |
| sv_libp2p_fetch_export_ohos.o | ohos obj | `3b620bdca34a0bedc12fa42c29f343ab513049a8e5a32aa98a47cdf726626f9f`，11,539,950B |
| sv_libp2p_fetch_export_android.o | android obj | `660d123b5cc6fc086f526e9c997a7791a217153186dc437e4a55f2e10fd7ff9c` |
| sv_feverify_android（预验证宿主） | bionic PIE | `129d966a83d028b977dacc1f99e109bbac99fb875f60f60670e7a72c967c9f60`，45,425,800B |

## 5. 改动清单

cheng-lang 主仓（本任务新增，均未触碰共享源）：

- 新增 `src/tools/sv_libp2p_fetch_export.cheng`（前轮会话产出，本轮核验冻结）。
- 新增 `.scratch/fe/`：obj×2、report、fe_harness.c、fe_run_e2e.sh、
  fe_click_fetch.py、napi_link/（shim.o、candidate so、符号表）、hapcheck/。
- 新增本报告 `docs/campaigns/2026-09-16-csg-semantic-video-standard/results/fe_hap_libp2p.md`。

UniMaker 仓（授权面内）：

- `hongmeng/scripts/ssm1_napi_shim.c`：+libp2pFetch/libp2pFetchPoll（worker 线程 +
  轮询形，与 ssm1qFetchStart/Poll 同款；约 +150 行，2303 行/文件）。
- `hongmeng/scripts/fe_svfetch_build.sh`：新增（NAPI 链接+校验+装入 jniLibs）。
- `hongmeng/ssm1smoke/ssm1smoke/src/main/ets/pages/Index.ets`：import 2 符号 +
  libp2pSvFetch()/svFetchPollTick() + 按钮 `L2P:FETCH`（SV_LIBP2P_PORT=38120，
  RECV_HOST=192.168.1.6）。
- `hongmeng/ssm1smoke/ssm1smoke/src/main/jniLibs/arm64-v8a/libssm1napi.so`：替换为
  F-E candidate（哈希见 §4）。

安卓侧在机遗留（供 e2e 轮与正式门复用）：/data/local/tmp/{sv_serve_android,
sv_feverify_android, 载荷五件, sv_fe_*.{log,port}}；测试 serve 进程已 kill。

## 6. 结论

1. **接入面全通**：obj→NAPI→so→HAP→按钮逐层机械核验通过，装机件内容物（strip so
   导出面、abc 内符号）确认无误，非 mtime 判绿。
2. **闭包本体真机 3/3**：安卓宿主形环回证明 sv_libp2p_fetch_run 在目标架构真机上
   rc=0、28,897B、逐文件 SHA 对拍全对——HAP 内执行的正是这条路径。
3. **剩余一步**：`hdc install` + 点 L2P:FETCH（§3 照抄）。跨机方向
   （安卓 serve → 鸿蒙 HAP fetch）此前同族已两向证明（F-B QUIC HAP 2 向、F-D
   libp2p darwin→android），但 libp2p 跨机×HAP 组合本身未跑，不得预记 PASS。

## 7. 真机回归执行记录（T1 值守，2026-09-17）

判词：**红（BLOCKED-at-install-ghost）**——e2e 3 轮全部 BUTTON_NOT_FOUND，0 轮进入 FETCH；
SV_FETCH_OK=1 / 28897B / F0..F4 ok=1 三判据全部未达成，不构成任何 PASS。

### 7.1 执行时间线

| 时刻 | 事件 |
| --- | --- |
| 16:34:52 | 值守首轮 `hdc list targets` 即见 `3KN0224C18003262`，无需等待，直接进入 e2e |
| 16:34:55–16:35:41 | 第 1 次 `fe_run_e2e.sh 3`：install 报 `install bundle successfully`；serve 每轮正常起（pid 9480/9595/10224，ready port=38120）、应用每轮 `start ability successfully`，但 3 轮 layout dump 均无 L2P:FETCH（BUTTON_NOT_FOUND） |
| 16:37–16:39 | 诊断（只读）+ 一次重试准备：`hdc uninstall com.example.unimaker` 成功 |
| 16:39:37–16:40:22 | 第 2 次（唯一重试）完整 e2e：install 再报成功；serve pid 11213/11236/11270 正常；3 轮仍全部 BUTTON_NOT_FOUND |

逐轮原始输出：`.scratch/t1/watch.log`；layout dump：`.scratch/fe/e2e/layout_r{1,2,3}.json`。
fetch_r*.txt / serve_r*.log 未生成（BUTTON_NOT_FOUND 在收集 hilog 之前 continue）。

### 7.2 诊断证据链（全部实测）

1. **装机件本身正确**：本地 HAP sha256=`6b7fcbbd25a2d390ef56e933b28cb97b3216423d4b5202ecd75582d472b8f85c`（与 §4 登记一致）；HAP 内 `ets/modules.abc`（99,112B，构建时间 09-17 15:58）`strings` 命中 `L2P:FETCH` 字面量——源码 Index.ets:1153 的按钮确实编入了 abc。
2. **设备端运行的是旧 UI**：三轮 dump 的页面标题即本应用（`SSM1 M7 Dual-Layer Play`），第一行 Row 布局树仅 4 个子节点（PUBLISH/RECEIVE/RERUN/PROBE），无第 5 子节点——排除了“按钮溢出屏幕外”假说；`fe_click_fetch.py` 全树按 text 查找、无屏内过滤，脚本无罪。
3. **覆盖安装假绿**：首次 install 后 `bm dump` installTime 仍为 1789127404801（2026-09-11 19:50），今日 install 未落盘。
4. **卸载重装仍假**：uninstall 后重装，installTime 更新为 1789634382863（2026-09-17 16:39:42，证明本次确实落盘），但运行页面布局树依旧无 L2P:FETCH。
5. **结论**：设备上 bundle `com.example.unimaker`（versionName 1.0.1/code 1000001）实际加载的 abc 与本地 HAP 内 abc 不一致——installer/设备侧存在“同 versionCode 覆盖不替换内容/内容来源异常”行为，属 F-E（HAP/设备安装面）责任域。

### 7.3 T1 边界

按值守任务纪律：仅操作设备与文档，未修改任何源码/脚本；重试限 1 次已用完，未修复。
交接给 F-E 的最小复现：`hdc uninstall com.example.unimaker && hdc install -r <HAP>` 后
`hdc shell uitest dumpLayout` 第一 Row 应含 L2P:FETCH——当前设备稳定复现不含。
建议 F-E 先核对 versionCode 递增或换 bundle 名做 A/B 安装实验定位 installer 缓存行为。

## 8. F-E' 回归：安装幽灵证伪 + T2 修复合流 + HAP fetch 首崩在案（2026-09-17 17:00–20:30）

判词：**红（blocked-at-hap-fetch-crash；诊断中途设备被占用后锁屏，PIN 无法代解）**。
三判据（SV_FETCH_OK=1 / 28897B / F0..F4 ok=1）0 轮达成；e2e 每轮真实执行、原始产物
全保留，不作废不丢弃。**T1 §7.2「安装幽灵」结论被本轮实验证伪**，正确根因见 §8.1。

### 8.1 安装幽灵证伪：按钮整体出屏，安装面无罪

- **内容替换全程正常**：versionCode 1000001→1000002→1000003→1000004 每步 `bm dump`
  逐字核实；17:15 卸载重装（1000002，installTime 17:15:23）与 17:2x `install -r`
  增量更新（1000003/1000004）都真实落盘。
- **判别实验（V3 标记）**：仅改 Index.ets 标题 + versionCode 1000003 重装后，设备 UI
  标题立即变为 `...CSG depth) V3`——install -r 内容刷新真实生效，bundle 加载的就是新
  abc（回退标题后复现原始标题）。
- **真因：布局溢出**。设备窗口宽 1316px，第一行 Row 的 PUBLISH/RECEIVE/RERUN/PROBE
  四键（每键 ~320-350px + margin）已占满整行（PROBE 右缘 = 1316 = Row 右缘），第 5 键
  L2P:FETCH 起点 ≈1344 整体出屏；`uitest dumpLayout` 会省略**完全**出屏节点（同屏
  CAM:+12/DEMO:MP4→CSGD 仅部分出屏，被裁剪到 1316 仍在树内）。T1 的"第一 Row 仅
  4 子节点"正是该过滤器产物，「排除屏外溢出」的反证不成立。
- **修复**：L2P:FETCH 移独立一行（Index.ets build 第一 Row 后新增单键 Row，源码注释
  说明缘由）；1000004 重装后 dumpLayout 立即命中按钮（658,622）。
- **结论**：installer/设备侧不存在"同 versionCode 不替换内容"行为；T1 建议的
  bundleName A/B 实验不再需要。

### 8.2 T2 serve 修复合流（重链记录）

- `.scratch/t2d/ssm1q_loopback_ohos.o`（sha256 `3c8b6a0066c5e0ee…`，11,924,235B，
  unresolved=0，含修复后 `ssm1q_serve_serve_once`）换入 F-B 链接目录（原 F-B obj
  `0a877f00…` 备份为 `ssm1q_loopback_ohos.o.pre_t2`），按 `fe_svfetch_build.sh`
  （=F-B §1.4 逐项 + sv obj 追加）重链。
- candidate `libssm1napi.so.candidate` 57,243,976B：LOAD align 全 0x4000；必需 9 导出
  + `ssm1q_serve_serve_once` + `sv_libp2p_fetch_run` 全 defined；导入面零 cheng 残差。
  装入 jniLibs 哈希 `8cecfb752fc1356f08d18059f9aae3e014704d0602adedc548174700b588747b`。

### 8.3 新缺陷实锤：HAP 内 libp2p fetch 首次执行 SIGSEGV

- 时间线：17:28 装 1000004（按钮可见版）→ 17:29–17:34 `fe_run_e2e.sh 3 1` 三轮：
  每轮 serve 正常起（pid 16539/16761/17812，ready port=38120）、按钮每轮找到并点击
  （658,622）、每轮 60s 无 SVFETCH_RESP → 3× FAIL；17:35 手动复现一轮：
  **点击 ~2.5s 后 SIGSEGV**。
- 崩溃证据（hilog）：`DfxSignalHandler :: signo(11), si_code(1), pid(14670),
  tid(15376)`（tid≠主线程 ⇒ 崩在 fetch worker 线程），`PROCESS_KILL reason=Cpp Crash`，
  `exit with code:88`；faultlogger 文件 shell 无权读取（`/data/log/faultlog` Permission
  denied，`persist.hdc.root` 设置被拒 errNum 1002），崩溃栈未取得。
- 零 SSM1 日志 caveat：worker 首行 OH_LOG 与 JS sv_fetch_start 均未见，但 17:35:09
  起系统 PARAM 日志洪泛可能已把点击时刻行从环形缓冲冲掉（17:44 后两轮因设备被占用
  点击未落到本应用，日志零为真零）；**探针 build 已就位未跑**（JS 入口行 +
  native pthread 前行，abc 已含 `sv_fetch_click entered` 字面量）。
- 背景约束：同一源码 android obj 宿主形 3/3 绿（§1.4）；**ohos obj 在真机首次执行**
  （此前仅链接面校验）；ssm1q fetch 闭包同 worker 形在本机历史 PASS（F-B A'/B1）——
  缺陷收敛在 sv 闭包 ohos 生成码自身执行面，QUIC 基座/线程模型均有本机先例。

### 8.4 诊断工具就位（下一棒照抄）

1. 探针 build（已装机，versionCode 1000004，HAP `0c62f3b5…`）：点击后按
   `sv_fetch_click entered`（JS）→ `sv_fetch spawning worker`（native）→
   `sv_fetch_run`（worker 首行）三分叉定位崩溃段。
2. 胶水 build：`bash .scratch/fe/fe_glue_build.sh`（F-B udp_debug 强符号胶水插入链接
   首位，QUIC 事件经 stderr→SSM1E 直出 hilog）。
3. e2e 脚本已改 crash-aware：轮询中见 `DfxSignalHandler` 立即停并落盘（防 hilog
   环冲），fetch_rN.txt 增采 `signo(/DfxSignalHandler/sv_fetch` 行，点击前校验本应用
   页面在前台（FOREGROUND_CONFLICT 判别）。
4. 剩余步骤：设备解锁 → `sh .scratch/fe/fe_run_e2e.sh 3 1` → 按探针分叉结果定位
   →（若在 QUIC 段）上胶水 build 复跑 → 修复后正式重链（fe_svfetch_build.sh）
   + versionCode 递增 → 3 轮绿。加分项（鸿蒙 serve→安卓 `q2_fetch <ohos-ip> 4443`，
   q2_fetch 在机已核）同被锁屏阻塞，serve 修复件已在 lib 内。

### 8.5 产物与改动登记

| 项 | 值 |
| --- | --- |
| 装机 HAP（探针版，versionCode 1000004） | sha256 `0c62f3b567b6b191f419d5e86559e299435fd62136e95d4922d55f5079b09c21` |
| 1000004 无探针版（被覆盖） | `13df2a5e63e3c022dc9646a704f275e8f61892af04ace750c304b84cb9c6b7a9` |
| 1000003（V3 判别实验件） | `f2ae0a269c368d174a674909cb87274f63e39fedb583c708b1c8603c6ca60563` |
| 1000002（首次卸载重装件） | `d5d76b7662d838b23309457d34ddc83a5991a9f503ed436f633ccfb88c3475f2` |
| libssm1napi.so（T2 合流 candidate） | `8cecfb752fc1356f08d18059f9aae3e014704d0602adedc548174700b588747b`，57,243,976B |
| T2 obj 换入 | `.scratch/fb/ssm1q_loopback_ohos.o` = `3c8b6a00…`（原件备份 `.pre_t2` = `0a877f00…`） |

改动清单：UniMaker `hongmeng/ssm1smoke/ssm1smoke/src/main/ets/pages/Index.ets`
（L2P:FETCH 独立行 + sv_fetch_click 探针行）、`hongmeng/scripts/ssm1_napi_shim.c`
（spawning 探针 4 行）、`AppScope/app.json5`（versionCode 1000001→1000004，
versionName 1.0.4）、jniLibs so（T2 合流+探针版）；cheng-lang `.scratch/fe/`
（fe_glue_build.sh 新增、fe_run_e2e.sh crash-aware 化、e2e/ 逐轮产物）。
共享源零改动（ssm1q_loopback obj 由 T2 产出，本轮仅换件重链）。

## 9. F-E'' 续：崩点符号化定位 + sv 闭包 dial 重组修复 + hilog 通道死因（2026-09-17 19:45–22:00）

判词：**红（blocked-at-device-offline，修复件已链已包未装机）**。§8.3 的 SIGSEGV
本轮完成根因定位与修复（闭包调用点重组，新 obj c520fb40…），但装机前鸿蒙真机
再次离线（hdc list targets 反复 Empty，kill/start 无效，同 F-E §2 形态），
e2e 3 轮未跑，三判据 0 达成——不作任何 PASS 声明。

### 9.1 hilog 死因（先修仪器）

- 设备回归后 hilog **APP 类型对本应用整体静默**：JS `hilog.info(0x0000, 'SSM1', …)`
  与 native `OH_LOG_Print(LOG_APP)` 一律不落缓冲（换 domain 0xA5F1、`hilog -Q
  pidoff/domainoff/domainverifyon` 全部无效），而同进程 framework CORE 类日志
  （AppKit/ACE）与系统应用（sceneboard）APP 日志正常。UI `this.log()`（dumpLayout
  可读）为唯一可靠通道。app 缓冲 16MB，排除环形冲刷——§8.3 的「日志被冲掉」
  猜测作废，当时的零日志是真零。
- 解法（不依赖 hilog）：shim stderr 桥增持久落盘 `libp2pDiagDir(cacheDir)` 新
  NAPI 导出 → `<cacheDir>/svfetch_diag.log`（O_APPEND），worker stage 行 +
  既有 Ssm1SegvHandler 的 pc/lr/sp/fp+12 层 fp 链现场全部入文件；JS aboutToAppear
  回读尾巴到 UI 文本（进程死后文件仍在）。该通道一次抓全崩溃现场。

### 9.2 崩点符号化（确定性复现 ×3，全部同签名）

diag 文件回读（1000008 轮，含基址锚点 SSM1_BASE_SO=0x5cc814e12c，减 llvm-nm
静态址 0x4e12c 得 so 基址 0x5cc8100000）：

```
JS click_libp2p entered
STAGE worker_enter host=192.168.1.6 port=38120
JS start returned: OK sv_fetch started
ORCMISS p=0x20
SSM1_SEGFAULT sig=11 addr=0x20  (worker 线程, ~1s 内, 与 serve 是否在听强相关)
pc  = cheng_orcmiss_autopsy_dump+0x134      ← 验尸自身 SEGV (deref16 of 0x20)
FP0 = cheng_mem_release_registered_header+0x46c
FP1/FP2 = cheng_mem_release_checked+0xec / +0x568
FP3 = <cold-drop-object:217>+0x23c          ← 大栈结构冷析构, 托管字段=0x20 野指针
FP4 = quic_transport.Libp2pQuicDialOneShotClientNamed+0x2c58
FP5 = sv_libp2p_fetch_run+0x2954
FP6 = SvFetchThreadMain+0x68
```

- 定性：sv 闭包 dial 路径的 MsQuicTransport 大结构（~240B，settings/tlsPolicy/
  listenAddr/addr/lastError）值拷贝/冷析构链上，某 str 字段槽被 0x20 占据 →
  managed release 打进注册表 miss → 验尸 dump 解引用 0x20 二次崩。
  ORCMISS 前无任何连接到达服务端（sv_serve 日志零 conn），崩在 dial 早期。
- 同族归案：与 task_x §3.3 / ma_reconnect 登记的 ohos「orc_miss registry_miss」
  同签名（同源 darwin/android obj 全绿，ohos 独有）；上游后端欠账，另案登记，
  非本任务修复面。
- 无服务端（dial 必拒）时不崩、干净 FAIL——触发面 = OneShot 包装的
  `client = InitMsQuicTransport()`（var 参数整构赋值）+ 大栈临时冷析构，
  非 QUIC 数据面。

### 9.3 修复（允许面内，语义逐句等价的调用点重组）

`src/tools/sv_libp2p_fetch_export.cheng`：不走 Libp2pQuicDialOneShotClientNamed
包装，按 ssm1q_loopback_export 在鸿蒙真机 PASS 过的形状直调同原语：
`Libp2pQuicAddrFromHostPort` → `Libp2pQuicConfigureOneShotClientSettings` →
`Libp2pQuicConfigureTlsWithServerName(client,"localhost")` → `qtransport.dial`
→ `conn = Value(dialRes)`；错误串前缀细分 addr/settings/tls/dial。调用点注释
登记 orc_miss 隔离缘由。重编 ohos obj（unresolved=0，无 main，obj
c520fb4096806b88…）→ `fe_svfetch_build.sh` 重链（jniLibs
596885b7bd5e0af6…）→ HAP 3a7f736445c340d8…（versionCode 1000008，含 diag
通道 + 修复闭包）——已构建完毕，装机被设备离线打断。

### 9.4 设备离线与剩余步骤

- 20:4x 起 `hdc list targets` 持续 Empty（kill/start 重启无效），22:0x 起**安卓
  GBJ0222 从 adb 同时消失（仅剩 emulator）——两台真机物理离线（USB 被拔/断电）**，
  纯设备可用性问题。修复件已全部就绪。
- 设备回归后照抄：① `hdc install -r` HAP `b30f26708eb333b1…`（**versionCode
  1000009**，修复+diag 件，高于在机 1000008，无同码假更新歧义；bm dump 应见
  1000009/1.0.9）；② 起 sv_serve（38120）；③ 点 L2P:FETCH 读 UI DIAG 尾巴
  （应无 ORCMISS/SEGFAULT，随后 `SV_FETCH_OK=1`）；④ `sh .scratch/fe/fe_run_e2e.sh
  3 1` 三轮判据 SV_FETCH_OK=1 且 28897B 且 F0..F4 ok=1；⑤ 加分项：PUBLISH 后安卓
  `q2_fetch <鸿蒙IP> 4443`。

### 9.5 本轮产物

| 项 | 值 |
| --- | --- |
| 修复后 sv ohos obj | `.scratch/fe/sv_libp2p_fetch_export_ohos.o` = `c520fb4096806b88…`（unresolved=0） |
| 修复后 libssm1napi.so（jniLibs） | `596885b7bd5e0af6fc44c27b93320bc0114fa76b6998a853d7378cee73c7e5f8` |
| **待装 HAP（1000009，修复+diag，终件）** | `b30f26708eb333b100f974a81bd610bb5070ae6e02b14be6f84fba97afe5437e` |
| 1000008 诊断版（在机，被 1000009 覆盖） | HAP `5b936a36d74de7be…` |
| diag 崩溃证据 | 设备 cache/svfetch_diag.log（3 session，含 2 次完整现场）+ UI 回读 dump `.scratch/fe/e2e/layout_d{2,3}.json` |
| 改动 | `src/tools/sv_libp2p_fetch_export.cheng`（dial 调用点重组）、`hongmeng/scripts/ssm1_napi_shim.c`（diag 落盘+libp2pDiagDir+STAGE 行+domain 0xA5F1）、`hongmeng/.../Index.ets`（diagAppend/diagReadTail/DIAGOPEN 回读）、`.scratch/fe/fe_glue_build.sh` |

## 10. F-E''' 闭环：真根因（链接类型混淆）+ 三轮全绿 + serve 方向如实红（2026-09-17 22:00–23:00）

判词：**主判据绿——libp2p 压缩载荷双真机 e2e 三轮全 PASS**（鸿蒙 HAP fetch ←
安卓 serve，每轮独立 serve+应用重启）：`SV_FETCH_OK=1 且 28897B 且 F0..F4 ok=1`
×3（SV_FETCH_MS=1744/1784/1688）。加分项（鸿蒙 serve→安卓 q2_fetch）**红**：
serve 启动与连接处理已通（T2 修复生效），处理入连接时命中已登记上游族
orc_miss（p=0x1, multiaddress.protoSizeByCode 读 raw=0x1）崩——如实停。

### 10.1 真根因：多闭包 obj 链接的类型符号冲突（§9 上游归因更正）

- §9 的「ohos 目标 orc_miss 上游族」归因**部分作废**：1000010 轮 STAGE 轨迹证明
  dial/negotiate/read/5×sha 全绿后在 fetch_run 尾部再崩（同 `<cold-drop-object:217>`
  + 恒 p=0x20）；1000012（超时直写字段写）同点位崩——排除 settings 拷贝路径。
- 机械实证：`ssm1q_loopback_ohos.o` 与 `sv_libp2p_fetch_export_ohos.o` **各自独立
  整闭包编译，都定义 `<cold-drop-object:217>`**（两 obj 间定义符号冲突共 1,486 个，
  含 21 个不同类型编号的 cold-drop）。链接序 ssm1q 先于 sv + `--allow-multiple-
  definition` 首定义优先 ⇒ **sv 侧全部 type-217 drop 调用绑到 ssm1q 的 217 号类型
  析构 = 类型混淆**，sv 的 MsQuicTransport 局部被按错误布局析构（首槽读到
  settings 标量 32=0x20）。安卓宿主预验证 3/3 绿是因为当时 sv obj 是唯一闭包 obj
  无冲突；ssm1q 单独在鸿蒙 PASS 同理。
- 修复（构建面，`fe_svfetch_build.sh` 未改序）：对 sv obj 用 `llvm-objcopy
  --redefine-syms` 把全部 1,486 个冲突定义符号加 `svobj_` 前缀（ELF 重定位按符号
  索引自动跟随），sv 闭包自洽、ssm1q 面不动。obj cd43a157…（冲突=0，
  sv_libp2p_fetch_run 保留，undefined 48 与改前同类）；改名表冻结
  `.scratch/fe/svobj_rmap_full.txt` + `svobj_collide.txt`；改前原件
  `sv_libp2p_fetch_export_ohos.o.pre_uniq`。
- 注：此类冲突是「多闭包 obj 同链」的结构缺陷（各独立编译的类型编号命名空间
  相互重叠），上游编译器/链接器欠账另案；本任务在链接面用 obj 去冲突达标。

### 10.2 握手超时（顺带修复）

`handshake ! ready` rc=42 @2257ms：OneShot 常量 handshakeIdleTimeoutMs=2000ms 对
harmony→android WLAN（rtt ~89ms、省电突发）不足。闭包内改直接字段写
（client.settings.handshakeIdleTimeoutMs=15000 / idle=20000 / disconnect=1000，
borrow 语义）后 dial_ok 稳定。

### 10.3 e2e 三轮（判据通道改版：hilog 死 → UI 文本）

| 轮 | serve(pid) | 点击坐标 | 结果 | SV_FETCH_MS | bytes | F0..F4 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 24487 | 658,622 | **PASS** | 1744 | 28897 | ok=1 ×5 |
| 2 | 24526 | 658,622 | **PASS** | 1784 | 28897 | ok=1 ×5 |
| 3 | 24549 | 658,622 | **PASS** | 1688 | 28897 | ok=1 ×5 |

- 判据通道：`fe_run_e2e.sh` 改为 dumpLayout 轮询 UI 日志文本读 DONE 应答（每 2s，
  上限 90s + 进程死亡即断），hilog 侧零依赖；`fetch_r{1,2,3}.txt` = 应答全文
  （含 SV_FETCH_BYTES=28897 SV_FETCH_MS=… SV_FETCH_DIAL_MS=… F0..F4,1 SV_FETCH_OK=1）。
- diag 文件三轮 `STAGE worker_done rc=0` + `SVFETCH PASS`（每轮独立 serve
  served=28897B；`.scratch/fe/e2e/fetch_r*.txt`、`serve_r*.log` 全存档）。
- 量级与先例一致（F-E §1.4 安卓宿主形 1076–1400ms；F-B 跨机 1206–1962ms）。

### 10.4 加分项：鸿蒙 serve → 安卓 q2_fetch（红，上游族如实停）

- PUBLISH 成功（`PUBLISH 287ms … port=4443 state=listening` +
  `serveAcceptLoop OK`，T2 修复版 accept 切片轮在跑）；安卓
  `q2_fetch 192.168.1.2 4443` → `FAIL dial msquic native: handshake ! ready`；
  同刻鸿蒙侧 **SIGSEGV exit 88**。
- 符号化：`multiaddress.protoSizeByCode+0xc6c → cheng_str_param_to_cstring_compat
  → cheng_seq_header_buffer_get+0x54`（SEGV addr=0x1）——入连接地址的 raw str=0x1
  被读，即 fb §7 / task_x §3.3 登记的 ohos **serve 方向** orc 缺陷族（上游后端
  欠账）。T2 的 H2（accept 挂死无超时）已由修复件消除：本方向不再无声挂死，
  连接能被接受处理；剩余 serve 路径数据面缺陷归上游，按门停。

### 10.5 最终产物（装机件）

| 项 | 值 |
| --- | --- |
| **装机 HAP（versionCode 1000013 / 1.0.13）** | `3c208822b62e9ee10fe44536fed6636e2a266f216d233030ea95ef6267ccb8d6` |
| libssm1napi.so（jniLibs） | `717f0f5e1507969847d6…` |
| sv obj（去冲突后） | `cd43a157675a86a5…`（`.scratch/fe/`，pre_uniq 备份在案） |
| 轮次证据 | `.scratch/fe/e2e/fetch_r{1,2,3}.txt`、`serve_r{1,2,3}.log`、`layout_r{1,2,3}.json` |
| 版本演进 | 1000009(b30f2670 dial重组)→1000010(超时15s)→1000011(STAGE)→1000012(直写字段写)→**1000013(去冲突,绿)** |

## 11. F-H serve 方向去冲突：85 冲突清偿 + 1000014 装机 + 真机轮被 PIN 墙挡（2026-09-17 23:2x–23:4x）

判词：**链接面修复达成并装机（门1/门2 绿，机械全证）；门3 装机半绿（bm dump 1000014 在机，
dumpLayout 按钮验证被挡）；门4 双真机 serve/fetch 轮 0 轮执行——blocked-at-device-PIN
（上滑出「输入密码」界面，脚本无法代解，与 §8 同墙）。三判据（3 轮 rc=0 + sha256==cid）
0 达成，不构成任何 PASS；serve 方向 orc_miss 是否被本修复清偿 = 未决，待解锁后照 §11.5 跑。**

### 11.1 门1 冲突枚举（两两 GLOBAL defined 求交，serve 链接全集 7 obj）

obj 集 = shim_ohos.o + ssm1d_export_ohos.o + ssm1q_loopback_ohos.o(3c8b6a00 T2版) +
sv_libp2p_fetch_export_ohos.o(cd43a157 已 svobj_) + psb_ohos.o + psh_ohos.o + dbg_ohos.o。

| 对 | 冲突数 | 说明 |
| --- | --- | --- |
| ssm1d × ssm1q | **82** | 41 个函数体反汇编哈希 DIFF（CloneStr/strDataPtr/NewStringCopy/panic/rawbytes 全家/manifest 全家等）+ 35 个全局列（os.atomicTreeOwner*、system.runtimeHeldOutput*、sha256.sharedSha256KTab*、os.ioMeter*）+ 6 同体 |
| ssm1d × sv | 1 | rawbytes.BytesDataPtr |
| psb × psh | 2 | cheng_host_close_fd_if_valid / cheng_host_fd_at，**反汇编体 DIFF 实证** |
| 其余 18 对 | 0 | 含 ssm1q×sv=0（§10 修复有效） |

**崩点符号判定（如实）**：`multiaddress.protoSizeByCode` 全 obj 唯一 defined（ssm1q），
**不在冲突列**；但链接序 ssm1d 在 ssm1q 之前 + `--allow-multiple-definition`
first-def-wins ⇒ ssm1q 闭包（含崩点函数）调用的全部 std 原语与全局列被绑到 **ssm1d
闭包的实现/数据**（41 DIFF 函数 + 35 合并全局列是直接证据）。serve 入连接路径的 str
读取/释放经错误闭包的原语与注册表列，与 §10.4 的 raw=0x1 崩形态同族兼容——归因=
「跨闭包 first-def 篡夺」（与 fetch 腿 §10.1 同结构缺陷，方向为 ssm1d→ssm1q），
非上游后端欠账单方面解释；最终定谳依赖 §11.5 真机轮。

交叉 undefined 复查（修正 nm 3 列解析后）：全部跨 obj 引用 = cheng_* 原语→psb、
cheng_host_socket 桥→psh、libc_*→psb、shim→ssm1d_cmd，**std 命名空间零跨闭包
undefined** ⇒ objcopy 改名不会产生新未解析（改名安全性前提）。

### 11.2 门2 去冲突（fetch 腿同配方，主闭包保留）

- 策略：**ssm1q_loopback_ohos.o = serve 主闭包保留原名**；psb = 运行时基座保留
  （cheng_mem_*/orcmiss 全在它，全局唯一）；改名 **ssm1d 83 个→`sdobj_`、psh 2 个→
  `phobj_`**（llvm-objcopy --redefine-syms，重定位按索引跟随）。dbg/shim/sv 不动。
- 改名表冻结 `.scratch/fh/svobj_rmap_serve.txt`（85 条，含 obj 归属注释）+
  `svobj_rmap_serve.objcopy.txt`；改前原件 `ssm1d_export_ohos.o.pre_fh`
  （eb86a688…）、`psh_ohos.o.pre_fh`（f23360ce…）；改名后 ssm1d=d815b310…、
  psh=30c36bcd…；分析脚本 `.scratch/fh/fh_collide.py`、`fh_body_cmp.py`、
  `fh_cross_undef.py`、判据输出 `fh_collide_full.txt`、`fh_receipts.txt`。
- 断言（改后全过）：21 obj 对两两求交 **残留冲突 0**；必需导出 10/10 defined
  （9 既有 + ssm1q_serve_serve_once）；各 obj defined/undefined 计数改前改后一致
  （改名不增删符号）；重链 candidate 57,449,560B，16KB LOAD align 全 0x4000，
  `-z defs` 过，undefined 面纯 libc/napi/OH。

### 11.3 门3 HAP 重建部署（装机绿，UI 验证被 PIN 挡）

- 版本源勘误：**ssm1smoke 是独立 hvigor 工程**，HAP versionCode 在
  `hongmeng/ssm1smoke/AppScope/app.json5`（非 hongmeng 根的 AppScope——根下那份属
  entry 工程，本轮误改已还原 1000001）；构建须在 `hongmeng/ssm1smoke/` 目录 +
  `DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk` +
  `node /Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw.js
  --mode module -p product=default assembleHap`（/usr/local/bin/hvigorw 损坏，
  报 Couldn't find hvigorw.js）。
- 装机件：`ssm1smoke-default-signed.hap` sha256 `408a91328c9055601ad3cb10e256eda5
  566c78e10e4148b3a0649df7eed01936`（135,078,959B，pack.info code=1000014/name=1.0.14）；
  HAP 内 strip so（57,116,464B）符号面：sdobj_ 83、phobj_ 2、svobj_ 1486，
  冲突原名（strings.CloneStr/system.strDataPtr/cheng_host_fd_at）各恰 1 个 defined，
  必需导出全在；abc L2P:FETCH/PUBLISH 字面量命中 5 处。
- `hdc install -r` 成功；`bm dump` 证实 **versionCode 1000014 / 1.0.14 在机**。
- dumpLayout 按钮验证被挡：设备 AOD→wakeup→上滑后出**「输入密码」PIN 界面**
  （设备 up 16 天未重启但锁屏行为较 §10 时代升级，miaofa 在案的「无 PIN 直接解锁」
  失效）；PIN 无凭据不可代解（乱试有锁死风险），§8 同墙。

### 11.4 门4 双真机 serve/fetch（0 轮，blocked-at-device-PIN）

安卓侧在位正常（adb GBJ0222B24021692 device，q2_fetch 与五件载荷在机）。鸿蒙侧
无法点 PUBLISH 起 serve ⇒ 0 轮执行。**不作任何轮次判读。**

### 11.5 设备解锁后照抄（下一棒）

1. `hdc shell "power-shell wakeup; power-shell setmode 602"` → 上滑（658 2500→658 900）
   → 人工输 PIN 解锁。
2. `hdc shell "aa start -b com.example.unimaker -a Ssm1Ability"` → dumpLayout 验证
   第一行 PUBLISH/RECEIVE/RERUN/PROBE + 第二行 L2P:FETCH（装机面 1000014 无 UI 改动，
   abc 字面量已验，此步预期绿）。
3. 点 PUBLISH 起 serve → 安卓 `adb shell /data/local/tmp/q2_fetch <鸿蒙IP> 4443`
   ≥3 轮：判据每轮 rc=0 + sha256==cid + 记录 T_FETCH；同步抓鸿蒙 hilog/诊断文件
   确认无 ORCMISS/SIGSEGV exit 88。若仍 orc_miss：取新崩点符号化，对照 §11.1 冲突表
   归因（漏打/新冲突→同配方补；非冲突类→按门停并精确归因）。
4. 加分：跑 `sh .scratch/fe/fe_run_e2e.sh 3 1` 回归 fetch 三轮防回退（本轮 so 已换，
   fetch 路径绑定面无变化——ssm1q/sv 保留原名，理论无影响，但须实证）。

### 11.6 本轮改动登记

| 面 | 改动 |
| --- | --- |
| cheng-lang | 零共享源改动；`.scratch/fh/`（冲突表/改名表/分析脚本/回执/layout dump） |
| UniMaker | `.scratch/fb/ssm1d_export_ohos.o`、`psh_ohos.o` objcopy 去冲突（原件 .pre_fh 备份）；`ssm1smoke/AppScope/app.json5` 1000013→1000014；jniLibs so 经 fe_svfetch_build.sh 换件（386bbb99…，candidate 57,449,560B）；`hongmeng/AppScope/app.json5` 误改已还原 |
| 在机 | HAP 1000014/1.0.14（408a9132…）已 install -r 落盘；app 未启动验证（锁屏） |

## 12. F-H2 serve 自连验证：1000015 装机 + 自连轮 1 即进程 exit(42) + PIN 墙（2026-09-18 04:4x–05:1x）

判词：**红——serve 方向真机验证不成立（0/3 轮），且失败形态已变**。自连轮 1（PUBLISH OK →
RECEIVE 指向本机 192.168.1.2:4443）中，fetch client 在 QPROBE step=105（addr OK，settings/
transport/tls 全过）进入 `MsQuicNativeDial` ~90ms 后**整进程干净退出 code=42**：无 ORCMISS、
无 SIGSEGV（segv handler 零输出）、无 faultlogger、无 Fatal signal——§10.4/§11 的 orc_miss
签名未复现，但去冲突后的 accept 路径从未被观测到处理入连接（无任何非 idle T_SERVE 行），3 轮
判据 0 达成。轮 2 起被 PIN 墙挡（与 §8/§11 同墙，此轮设备在使用间隙自动锁屏，开发者模式无法
代解）。

### 12.1 形态声明（如实）

单设备自连 = 本切片唯一可行客户端形态（安卓 q2_fetch=旧客户端 negotiate_ack_slot_4 代错、
cheng_ssm1_moq_fetch=msquic native 代错、当前树安卓 exe=exportc 模块私有函数漏编 gap，均不
兼容）。走真实 UDP/QUIC 网络栈（192.168.1.2 wlan IP，非 127.0.0.1 短路，非内存环回），
**非跨机**；自连通过也不构成跨机 PASS——本轮未通过，此条仅备案。

### 12.2 装机件（1000015）

| 项 | 值 |
| --- | --- |
| HAP（versionCode 1000015 / 1.0.15） | `0c96d5a0f15dd5942b1baf4310bafdc6e29c695a8555443d645dcb1e77b70ceb`（135,078,960B） |
| HAP 内 libssm1napi.so | `386bbb99f822ef3a…`（57,449,560B）= §11.6 F-H candidate **字节同一**（本轮只改 Index.ets RECV_HOST + versionCode，so 零改动） |
| Index.ets | `RECV_HOST: '192.168.1.6'→'192.168.1.2'`（abc 字面量核验：192.168.1.2 恰 1 处，1.6 清零） |
| bm dump | versionCode 1000015 / 1.0.15 在机；dumpLayout 全按钮在位（PUBLISH/RECEIVE/RERUN/PROBE/L2P:FETCH） |

### 12.3 自连轮 1 时间线（hilog 全程在案 .scratch/fh2/）

| 时刻 | 事件 |
| --- | --- |
| 04:48:25.151 | T_PUBLISH totalMs=284（rawfile 7 + serve 277）resp=OK chunks=45 kfLen=65572 fileLen=2955365 port=4443 listening |
| 04:48:25.152 | T_SERVE_LOOP OK，accept 切片轮起 |
| 25.255→26.521 | T_SERVE conn=1..12 全部 `resp=FAIL serve_accept idle`（idle 轮 ~105ms/片，稳定） |
| 26.520 | RECEIVE（559,454）→ fetch_start resp=OK（client worker 线程 45743） |
| 26.520 / 26.522 | QPROBE step=100（enter, a=4443）/ step=105（addr OK；101 settings、102 transport、104 tls 均只在失败打点=全过） |
| ~26.61 | **进程死**（WMS OnRemoteDied 26.615；appspawn 26.672 `exit with code:42`） |
| 缺席证据 | T_RECEIVE 无、E2E 判词无、非 idle T_SERVE 无、`T_SERVE stop/loop exit` 无（serve 线程未出一次非 idle 轮）、diag 文件该死零新增 |

### 12.4 exit(42) 定谳（排除链全部实测/实查）

- appspawn 语义源码确认（startup_appspawn standard/appspawn_service.c DumpStatus）：
  `exit with code:42` = **WIFEXITED + WEXITSTATUS=42**，真 exit(42)，非信号。
- cheng-lang 全树字面出口枚举：c_exit_runtime{1,2,125,139}、libc__exit_runtime{70,127}、
  raw_libc_exit_runtime{133}、cheng_exit{1,70}、fail_stop 全家{70}、panic/bounds{1}、
  force_segv{139}——**无 42**；变量码出口（cheng_host_exit_runtime、
  cheng_native_dump_backtrace_and_exit）在 HAP 链接集内无可达 42 调用点。
- shim：仅 segv/bus handler `_exit(88)`（§10.4 的 88 即此）；**无 42**。
- so 二进制（386bbb99 全量反汇编）：`bl exit/_exit` 站点 **0 个**（nolibc 运行时走裸 SVC，
  exit/_exit 只是无引用 U 导入），即时数 0x2a 路径 0 个；libssm1stub.so 同 0。
- 结论：**exit(42) 不出自本仓任何编译物**——来自进程内 OHOS 框架层（归因未定点；shell uid
  读不了 faultlogger/账本，退出线程未留 fp 现场可查）。 dial 与 accept 两线程均在途，退出
  发起线程不可辨。

### 12.5 仪器与下一棒

- 仪器缺口：现有 segv/diag 仪器对**干净 exit** 无观测面（§9.1 仪器只抓信号死）。
- 已加（源码态，下次重链自动生效）：shim `Ssm1ExitProbe`（atexit：退出线程内打
  pid/pthread_self + x29 fp 链 12 层 + 400ms 等桥冲刷 → stderr 桥 → svfetch_diag.log；
  OH clang 编译过，.scratch/fh2/shim.o）。**1000015 未含它**——重链被资产清理卡住：
  `.scratch/{fb,fe}` 7 个 ohos obj 与 §11.2 改名表已按任务生命周期清除，重链须先按 §1.4
  配方重建 obj 全集 + 重生成 rmap（一次完整门 1/门 2 轮，不可偷懒跳过）。
- 解锁后照抄：① 重链（含探针）→ versionCode 1000016 → install -r；② PUBLISH → RECEIVE
  → 若复现 exit(42)，diag 即退出线程 fp 链，llvm-nm 对 so 符号化（SSM1_BASE_SO 锚）；
  若不复现 → 前轮死因疑与 1000014 遗留进程态相关，另查。③ 跨机×HAP 仍欠。
- 仪器备注：`T_SERVE conn=N` 的 N 是**切片轮计数（含 idle FAIL 轮）**，不是连接数——
  §11「conn=4659+」与本次 conn=12 均应读作空转轮数，后继判读勿再误用。

### 12.6 本轮改动登记

| 面 | 改动 |
| --- | --- |
| UniMaker | `ssm1smoke/ssm1smoke/src/main/ets/pages/Index.ets`（RECV_HOST→192.168.1.2，自连形态注释）；`ssm1smoke/AppScope/app.json5` 1000014→1000015；`scripts/ssm1_napi_shim.c`（+Ssm1ExitProbe atexit 探针，源码态） |
| cheng-lang | 零共享源改动；`.scratch/fh2/`（轮 1 hilog 全程、diag 回读、layout、exit 站点扫描、探针 shim.o） |
| 在机 | HAP 1000015/1.0.15（0c96d5a0…） |

## 13. F-H3 exit(42) 定谳与清偿：shim 裸 futex 被华为真机策略封死 + event lock pthread 化（2026-09-18 05:3x–06:4x）

判词：**exit(42) 根因定位并修复，正式件 3 轮自连复测 0/3 出现 42（修复清偿）**。
但 serve 方向自连仍不通：futex 死之下暴露第二层缺陷（自连 dial 必 3s 握手超时，
dbg 轮定谳 `accept process err=tls13: no_application_protocol`；轮 2 采样窗口后
又见 exit 70 = serve accept 非 idle FAIL 合同 fail-stop 的次生面）——该层归因
native_runtime 共享源 dual-role cur-slot/policy-cache 并发互踩，超工具面，按门
精确归因停。跨机 serve 半环在修复后首次观测到 server flight 与数据帧真实发出
（对照 §10.4 的崩与 §11 的零处理，方向性推进，本轮不计 PASS）。

### 13.1 obj 全集重建 + 去冲突 + 装机链（门1/门2 完整重跑）

- `.scratch/{fb,fe}` 7 obj 按当前树（HEAD 13707ea4c）重建全过（unresolved=0）；
  ssm1q 11,924,235B 与 T2 版字节同大小，psb 8,989,551B（+519B，HEAD 期间 psb
  新增 orcd5 RSS 守卫 importc → 触发 13.5 的闭包缺符号，按 fb §1.2 C shim
  平台允许面补 procfs 忠实实现）。
- 门1 重枚举：ssm1d×ssm1q=82、ssm1q×sv=1486（与 §10.1 冻结值同）、ssm1d×sv=70
  （旧测 1 是因旧 sv 已带 svobj_ 前缀）、psb×psh=2；崩点符号
  multiaddress.protoSizeByCode 保留方=ssm1q ✓。门2 改名 svobj_1487/sdobj_83/
  phobj_2，改后两两冲突 0；rmap 冻结 `.scratch/fe/sv_rmap.objcopy.txt` 等。
- 链接脚本 `fe_svfetch_build.sh` 须用 bash 执行（step4 process substitution）。
- 校验：必需导出 10/10 defined、Ssm1ExitProbe local 符号在位（t）、
  svobj_/sdobj_/phobj_ 计数精确、cheng 残差 undefined=0；libp2pFetch 等三符号
  是 napi_define_properties JS 属性名，本就不在 dynsym（历来如此）。

### 13.2 exit(42) 定谳（1000015→1000023 七轮仪器链）

- 1000016（ExitProbe 首次在机）：复现 exit 42（pid 10717），**atexit 零输出**
  → 退出绕过 libc atexit；diag 仅锚行。
- 零重编差分矩阵（同一装机件多轮）：无 serve 时任意 dial（E1 sv 闭包/E4
  ssm1q 闭包）均存活；serve listening + 本机 client dial（RECEIVE 与
  L2P:FETCH 双闭包）**必死**；跨机 q2_fetch 入连接处理**不死**（E6，
  serve_negotiate_4 scan_failed——死面收敛为 dual-role 同进程）。
- 1000017：fail-stop 消息终于可见——`cheng runtime event lock futex wait
  failed`，出处 **`src/tools/ssm1_ohos_shim.c:193 m4_fail_stop_raw(...,42)`**，
  退出方式 = 裸 `SYS_exit_group`（§12.4 "shim 无 42" 排除链漏查此处；也一并
  解释 atexit 不跑/WIFEXITED/无信号三象）。消息时有时无 = write(2) 后立即
  exit_group 把异步 stderr 桥 pipe 数据带走（1000018 补 400ms 冲刷窗口后稳定）。
- 1000019/20/21 逐步 bring-out：`futex(98, WAIT_PRIVATE=128) rc=-1(EPERM)` →
  `futex(98, 0) 同 EPERM` → 探测序列推进到 `futex_time64(422)` 时进程被
  **signal 31 (SIGSYS) 击杀**（fp 链符号化：
  RecvDatagramDirectInto→fd_wait_readable→cheng_free→cheng_runtime_lock→
  event_lock_bridge+0x244）。同进程 pthread 全程正常 ⇒ 裸 futex 入口被
  设备策略按号/op 白名单封死，pthread 是确定可用原语。
- **修复**：`ssm1_ohos_shim.c` event lock 弃裸 futex，apple/ohos 统一
  pthread ERRORCHECK 实现（自死锁→EDEADLK→fail-stop 语义等价保留）；
  m4_fail_stop_raw 加 400ms relay 冲刷窗口。共享源改动仅此文件（+11/-88 净）。

### 13.3 正式复测（1000024，探针已还原、git 零残留）

| 轮 | PUBLISH | RECEIVE(dial 3s 超时) | 进程 | exit 42 |
| --- | --- | --- | --- | --- |
| 1 | OK 286ms | T_FETCH 3161ms | 存活 | 无 |
| 2 | OK（轮 1 进程复用后 force-stop） | — | ~12s 后 exit 70（ALPN 层次生，见 13.4） | 无 |
| 3 | OK 287ms | T_FETCH 3161ms | 存活 | 无 |

### 13.4 第二层缺陷归因（未解，另案解锁前置清单）

- 自连 dial 100% 3s 握手超时；dbg 轮（1000023，探针置 serve_start 尾部——
  置于函数头会被 `msquicNativeEnsureInit` 首跑的硬编码 `SetDebugTls13(false)`
  覆盖，在案）serve 半环全链 debug 到齐：loopback 双向包流动正常、
  client_hello 已 feed、server ACK/flight 已发，最终
  **`accept process err=tls13: no_application_protocol`**
  （native_runtime:3350，`serverAlpnSupportedCache` 为空）。
- 归因：dual-role 下 `msquicNativeCurSlot` 全局单值被 dial（SlotFindFree/
  SetupSession 的 `ResetServerPolicyCache`）与 serve accept 侧 pump rebind
  并发互踩，InitServerSession 填 cache 与 ALPN 读 cache 跨线程落不同 slot。
  跨机对照（Mac fetch→鸿蒙 serve）ALPN 协商成功、flight/数据帧在发 ⇒
  该层为自连并发特有，非 listener policy 填充缺陷。
- 轮 2 exit 70 = serve accept 返回非 idle FAIL 时按既有合同 fail-stop
  （ssm1q_serve_serve_once 注释在案），是 ALPN 层失败向进程面的传导，
  非独立缺陷。
- 解锁前置：native_runtime server 半环 slot 显式锚定（InitServerSession→
  ALPN/EE/证书全程锁定 listener 侧 slot，或将 policy cache 读写绑定
  listener datapath 而非全局 cur）——共享源并发结构修，需独立任务 + 三道
  机械预检 + 金丝雀。

### 13.5 产物与改动登记

| 面 | 改动/产物 |
| --- | --- |
| cheng-lang 共享源 | `src/tools/ssm1_ohos_shim.c` 唯一改动（+11/-88：event lock pthread 化、fail-stop 400ms 冲刷；修复保留） |
| cheng-lang 工具面 | ssm1q_loopback_export.cheng 探针已 `git checkout` 还原（零残留）；`.scratch/fh3/`（obj 重建/冲突枚举 fh3_collide.py、fh3_sym.py 符号化、fh3_round.sh、fetch_mac、全轮日志） |
| UniMaker | `AppScope/app.json5` 1000015→1000024；jniLibs so 经 fe_svfetch_build.sh 换件（正式件 bca8be98…，57,450,792B）；`scripts/ssm1_napi_shim.c` +`cheng_native_process_rss_bytes_value_bridge`（psb orcd5 守卫的 ohos procfs 忠实实现，-z defs 闭包完整性） |
| 版本演进 | 1000016(ExitProbe 在机)→17(futex 消息)→18(rc 携带)→19(冲刷窗口+EPERM)→20(fallback 探测)→21(422=SIGSYS+fp 链)→22(pthread 修复)→23(dbg 终证 ALPN)→**24(正式件)** |
| 版本历史要点 | §12.4 排除链两处修正：shim 恒有 42 出口（m4_fail_stop_raw 全家）；"零 bl exit 站点" 结论对 fail-stop 的裸 SVC 形态不成立 |

## 14. F-H4 dual-role 并发互踩清偿：native_runtime 传输递归锁 + 角色分槽 retag（2026-09-18）

判词：**第二层缺陷（F-H3 §13.4：自连 dial 100% 3s 握手超时 / `no_application_protocol`）
代码级定谳并修复，真机自连轮 1 实证握手/accept/negotiate 全通（进程零崩、零 42/70）；
数据面残留一个新卡点 serve_manifest_write（已探针化），1000027 装机与 3 轮自连/跨机/
fetch 回归轮被鸿蒙真机 USB 掉线挡（同 §2/§9.4 形态）。门判据如实分记如下。**

### 14.1 根因代码级定位（读码定谳，修正 §13.4 假说的精确形态）

- 现场结构：`src/quic/native_runtime.cheng` 全部状态经单一全局 `msquicNativeCurSlot`
  索引（`gMsQuicSessions[cur]`、两侧 impl/crypto/app-stream/sack 数组、策略 cache）。
  HAP 双线程 dual-role（T_SERVE 跑 `ssm1q_serve_serve_once` accept 轮；T_FETCH 跑
  `ssm1q_fetch_client_run` dial+pump）间无任何互斥：事件锁只覆盖分配账本
  （program_support_backend），传输面裸奔。
- 互踩形 1（no_application_protocol 的直接成因）：T_FETCH pump 每次迭代 rebind cur
  （`msquicNativePumpCode` 4894/4931），T_SERVE 的 `ProcessPacketFill` 在
  4054-4060 路由出 server slot 后，`InitServerSession` 3741 填 `serverAlpnSupportedCache`
  与 3347 读 ALPN 之间跨数百微秒（ECDHE/transcript），期间 T_FETCH 把 cur 翻回
  client slot（其 cache 恒空）→ 读空 → 硬失败。dial 前奏（SlotFindFree→cur=槽→
  `ResetSession`/`ResetServerPolicyCache`）同窗可把 serve 正在用的槽整槽重置。
- 互踩形 2（pipe 队列/conn impl 跨线程撕裂）：T_FETCH pump 的 listener 分支同样轮询
  listener fd——与 T_SERVE 竞争消费同一 socket，抢到包后以 server 半环身份并发推进
  handshake13 全局 transcript/密码态；pipe 读/写簇与 PPF 无串行化。
- 互踩形 3（F-H4 首轮真机新暴露）：`newNativeConnectionPairForStreams` 的 pipe 标定
  读 cur（`msquicNativePipeIdxForSession`），accept 返回与 pair 建立之间 cur 可被
  T_FETCH dial 尾翻走 → serverConn 标到 client 槽。

### 14.2 修复（共享源并发结构，6 文件）

1. **传输递归锁**：新桥 `cheng_native_quic_transport_{lock,unlock}_bridge`
   （ohos/android/darwin-host: `ssm1_ohos_shim.c` PTHREAD_MUTEX_RECURSIVE，常量取自
   各平台头文件；darwin exe: `core_runtime_provider_darwin.cheng` os_unfair_lock
   guard + owner/depth + 50us 退避，usleep 既有 importc）。native_runtime 全部
   状态 span 上锁：`ProcessPacketFill`（=「server 半环 slot 显式锚定」的执行点：
   路由→填 policy cache→ALPN/EE/证书→flight 整段对另一线程独占）、`PumpCode`
   （rebind→poll→flush/retransmit 原子）、`Accept{,Blocking,Timed}`（recv 轮询在
   锁外，处理+判读+回收持锁）、`Dial`（前奏持锁；就绪轮 pump 自锁+判读小 span，
   fd wait 锁外）、`ReadableAppStreamId`/`PipeWrite`/`PipeCloseWrite`/
   `PipeReadNonblocking`/`Datagram{Read,Write}`/`PipeIsClosed` 整体、`PipeRead`
   （消费/判读段持锁、8ms fd wait 锁外）、`PipeClose`（close 包+回收段）、listener
   起/停面、地址 getter。递归=span 嵌套合法；锁内无阻塞等待→无饥饿死锁。
2. **角色分槽 retag**：`msquicNativeLast{Server,Client}SessionSlot` 分离，
   accept 返回点写 Server、dial 尾写 Client；新 additive
   `newNativeConnectionPairForSlot(pipeIdx,…)`（connection.cheng，既有签名不动）
   + `msquicNativeRetagPipeIdxFor{Server,Client}Session()`；
   `msquictransport_native.cheng` 3 accept 形 + 1 dial 形改用角色显式 retag。
   隐式 `RetagPipeIdxForLastSession` 保留给单线程调用面（测试 smoke）。
3. **探针（保留）**：`ssm1q_loopback_export.cheng` `QWriteAuthoritativeRange` 失败面
   带 `q_lastErr` 出 `serve_manifest_write detail=`。

逐相内存影响（硬约束卡）：锁体/角色槽均为进程静态数据（2×pthread mutex ≈128B +
darwin owner/depth 16B + 2×int32 槽），零堆分配、零每连接/每包新增分配；编译期
smoke/环回/装机各相 RSS 与改前差 ≈0（同窗相对比较不可分辨），不触及任何模型项。

### 14.3 纪律门（darwin 全绿）

- 总绿扫描 11/11 rc=0：sv_b1_roundtrip/negative/commit/dump_fixture、sv_time、
  sv_clockmap、sv_b2_convert、sv_b3_player、sv_f1_snapshot、sv_f3_hub、
  ordinary_zero_exit 金丝雀（改动前基线：sv_b1_commit/sv_b2_convert 因
  `.scratch/{t1,b2}` 目录不在曾 rc=1，mkdir 后 rc=0，非改动面回归）；sv_ref_decoder
  rc=0（结构对拍 facts=12/sections=11/dictionary=41）。
- QUIC Mac 环回（锁改后 + 角色分槽后各 1 轮）：serve_mac↔fetch_mac 127.0.0.1
  PASS，fetch rc=0、sha256=be20ab8e…（与 F-B 基线同值）、served=2，零死锁零回退。
- `quic_native_runtime_compile_probe` exe unresolved=0 rc=0（桥在 darwin exe 链
  经 provider_darwin 解析）。

### 14.4 重链 + 装机（门 1/门 2 全配方重跑）

- obj 全集按当前树强制重建（unresolved=0×6）；门1 重枚举：ssm1d×ssm1q=82、
  ssm1q×sv=1494（1486+8：新增锁面函数进冲突集，符合预期）、ssm1d×sv=70、
  psb×psh=2；probe multiaddress.protoSizeByCode 保留方=ssm1q ✓；门2 改名
  svobj_1496/sdobj_83/phobj_2，两两冲突残留 0，rmap 冻结
  `.scratch/{fe,fb}/*_rmap.objcopy.txt`。
- libssm1napi.so candidate 57,460,176B→(1000027 件) f0a2b3fa…/so 装入 jniLibs
  （哈希见 14.6）；16KB LOAD align 全 0x4000；必需导出 9+serve_once 全 defined；
  cheng 族 undefined 残差 0；`cheng_native_quic_transport_{lock,unlock}_bridge`
  defined（shim_ohos.o 供入）。
- 版本演进：1000024→**1000025**（锁修复首批）→**1000026**（+manifest 探针）→
  **1000027**（+角色分槽 retag）。

### 14.5 真机自连轮 1（1000025 实测，2026-09-18 08:30）

| 项 | 值 |
| --- | --- |
| PUBLISH | OK totalMs=268，port=4443 listening |
| RECEIVE dial | QPROBE 100/105 → **握手成功**（旧形态 100% 3s 超时未复现） |
| fetch 状态机 | stage=1(152ms)→**stage=4(1353ms，双流 negotiate ack 已读)**→stage=6(1503ms) |
| serve accept | T_SERVE conn=30 轮完成 accept+negotiate_4/8，**serve_manifest_write 失败**（此前 29 轮 idle 正常） |
| no_application_protocol | hilog 0 命中（F-H3 定谳缺陷未复现） |
| 进程 | 存活，零 ORCMISS/零 SIGSEGV/零 exit 42/70 |

判读：**第二层缺陷（dual-role 并发互踩→握手死）清偿成立**；数据面新卡点
serve_manifest_write=14.2-2 角色分槽缺位（serverConn 标到 client 槽 → 写走
`session ! ready` 即时败），已在 1000027 修复+探针化，待装机复测。

### 14.6 1000027/1000028 两轮补充实测（09:02-09:14）

- 设备 08:5x 回归 → 1000027 装机（bm dump 1000027/1.0.27 在机）→ 自连轮：T_PUBLISH
  OK 356ms → fetch stage=1(153ms)→4(1508ms)→6(1658ms) → **serve_manifest_write
  失败未复现**（角色分槽 retag 生效）→ 但 stage=6 stall 至 T_RECEIVE TIMEOUT 60s，
  T_SERVE 全 idle（served=0）。
- 判读：服务端流写绑错槽已清；stall 形态=整段持锁的 PipeWrite/DrainSideSend
  （等对端 ACK 最长 20s）与对端线程处理互饿 = 锁粒度活锁，非数据面缺陷。
- 修复：PipeWrite/DrainSideSend 改细粒度 span（入口/逐批队列+flush 小 span，
  ACK 等待循环零锁等待）；Mac 环回复测 PASS（sha256=be20ab8e 同值）。总绿 11/11
  重跑全绿；obj 全集重建+门1/门2 重跑（svobj_1496/sdobj_83/phobj_2，残留 0）。
- **1000028/1.0.28 已装机**（bm dump 在机；jniLibs so
  159bca6b7071fec629f9191230cf0d91858ea476078a91bf57a5f1c0aed3bd33）。
- 09:1x 设备再次自动锁屏至 PIN/锁屏杂志页，脚本不可代解（§11.3 同墙）；按门停。

### 14.7 未竟（blocked-at-device-PIN + 轮次欠账，下一棒照抄）

- 08:38 起 `hdc list targets` 持续 Empty（kill/start 无效），同 §2/§9.4 USB 掉线
  形态；安卓侧正常。**3 轮自连、跨机 serve/fetch、fetch 腿回归 0 轮执行，不作
  任何 PASS。**
- 在机件：**HAP 1000028/1.0.28**（锁修复+角色分槽+细粒度 span+manifest 探针全量）。
  解锁后无需重装。
- 照抄：① `hdc install -r`（1000026 未装机，被 1000027 覆盖）；②
  `sh .scratch/fh4/fh4_self_round.sh 1..3`（判据：stage=7/8 完成 + `fetch ok` +
  sha256-match + 进程存活 + 无 no_application_protocol）；③
  `sh .scratch/fh4/fh4_cross_round.sh 1..3`（判据：每轮 rc=0 + sha256==cid +
  T_FETCH，安卓侧记录）；④ `sh .scratch/fe/fe_run_e2e.sh 3 1` fetch 腿回归
  （SV_FETCH_OK=1 且 28897B 且 F0..F4 ok=1）。
- 备注：q2_fetch 为旧 negotiate_ack_slot_4 代错客户端（§12.1 在案），跨机 serve
  轮若败于 scan_failed 按在案归因，不算本修复面回归。

## 15. F-H5 收口轮（2026-09-18 09:30–10:20）

判词：**编译层收敛完成并亲验（darwin 总绿 11/11 + sv_ref_decoder + 终态 canary 全
rc=0）；ohos obj 全集重建 + 门1/门2（残留 0）+ 重链 so（导出面/16KB align 全过）+
三连 HAP 构建装机（在机 1000031）；fetch 回归腿 3/3 PASS；自连腿 2 有效轮全败于
第三层数据面 send 缺陷（代码级归因：send 路径全局 cur TOCTOU）；跨机腿 2 有效轮
败于 §12.1 在案旧客户端形（非本修复面回归）。重大事故：F-H4 六文件未提交源改动于
09:41 后被其他 lane 的 `git reset --hard` 整体清毁，现树=pre-F-H4 基线，与装机件
不一致；下一棒必须先恢复源，禁止在现树上"重修"。**

### 15.1 事故：共享源被外部 reset 清毁（最高优先级）

- 内容：F-H4 改动（native_runtime +324 传输锁架构、connection +25 ForSlot、
  msquictransport +8 路由、provider_darwin +43 darwin 锁桥、ssm1_ohos_shim
  futex→pthread、ssm1q_loopback_export +5 探针）+ F-H5 修复（2094 行
  `/ip4/127.0.1`→`/ip4/127.0.0.1` 误删 typo 修回）全部未提交。
- 时间线：09:22:42 提交 b93ee6391（vpn_proxy，他 lane）后 reflog 记录
  `reset: moving to HEAD`——未提交工作树改动被硬重置。恢复渠道逐一遍历均无：
  git 对象（从未 add）、stash、.rebuild/clone_roots、APFS 本地快照、VS Code
  local history（agent 经 shell 编辑无编辑器历史）。
- 幸存证据（完整修复语义，全部 hash 在案）：① 09:36 obj 全集（.scratch/fb/*、
  .scratch/fe/sv_libp2p_fetch_export_ohos.o；llvm-nm 实证含
  `msquicNativePipeWriteLocked`/`msquicNativeTransportLock`/角色分槽符号）；
  ② 门1/门2 rmap 冻结（svobj_1496/sdobj_83/phobj_2，残留 0）；③
  libssm1napi.so=3470d5cd…（jniLibs）；④ 装机件 1000031（bm dump 在机）；
  ⑤ fetch 回归 3/3 行为证据。
- 结论：**树 ≠ 装机件**。下一棒第一任务：恢复被毁源（用户备份 > obj 反汇编辅助
  按 §14.2 设计重建）；源恢复后先重过 15.2/15.3 全门，再继续缺陷修复。

### 15.2 编译层收敛（亲验，修复态源，reset 前）

- canary `ordinary_zero_exit_fixture` --emit:exe 编译 rc=0 + 运行 rc=0（F-H4 的
  2091 @borrows 修复生效；"plain field take lacks exact owned source" 未复现）。
- 总绿 11/11 rc=0：sv_b1_roundtrip/negative/commit/dump_fixture、sv_time、
  sv_clockmap、sv_b2_convert、sv_b3_player、sv_f1_snapshot、sv_f3_hub、
  ordinary_zero_exit（.scratch/fh5/green_sweep.log）。
- sv_ref_decoder rc=0（facts=12/sections=11/dictionary=41，与 §14.3 同值）。

### 15.3 ohos 重建 + 链（reset 前的修复态源）

- obj 全集重建（fh4_build_objs.sh 配方）unresolved=0 ×5 + shim C 重编
  （12 条 -Wreturn-type 警告为既有 shim 形态，非本轮引入）。
- 门1 重枚举（fh3_collide.py）：ssm1d×ssm1q=82、ssm1d×sv=70、ssm1q×sv=1495
  （§14.4 为 1494，+1 符合预期）、psb×psh=2；probe protoSizeByCode 保留方=ssm1q ✓。
- 门2：svobj_1496/sdobj_83/phobj_2，residual conflicts=0 ✓；
  fh4_verify_counts 3/3 ok（defined 面 1578/137/209）。
- 重链（fe_svfetch_build.sh）：16KB LOAD align 全 0x4000、必需导出 9+serve_once
  全 defined、cheng 族 undefined=0、`cheng_native_quic_transport_{lock,unlock}_bridge`
  defined ✓。jniLibs so sha256=3470d5cd8150fb9582f8cb6d8b38ac31780c0180753b639f25d5359de86aeadb
  （57,462,632B）。
- HAP 三连（hvigorw.js + DEVECO_SDK_HOME）：1000029（自连形，构建核验 HAP 内
  strip so==jniLibs 中间件 b082e413…，dynsym 导出面含锁桥全在；未装机）、
  1000030（fetch 形 Index.ets RECV_HOST=192.168.1.6，已装）、1000031（自连形
  RECV_HOST=192.168.1.2，uninstall 后全新装机，bm dump 在机）。Index.ets 终态
  已还原自连形。
- 环境注记：全局 /usr/local/bin/hvigorw 已坏（缺 hvigorw.js），须用
  `DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk node
  /Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw.js …`。

### 15.4 fetch 回归腿（1000030 fetch 形，3/3 PASS）

| 轮 | 进程 | SV_FETCH_BYTES | SV_FETCH_MS | 判定 |
| --- | --- | --- | --- | --- |
| 1 | 4366 | 28897 | 1688（dial 1460） | **PASS** |
| 2 | 4366 | 28897 | 1200（dial 1036） | **PASS** |
| 3 | 4366 | 28897 | 1184（dial 1016） | **PASS** |

- F0..F4 全 ok=1；sha256 与 §9 基线逐项同值（F0=0175b22c…b2fb19e 等 5 项）；
  hilog 零 no_application_protocol、零本进程 crash 行。
- 归因注记：fetch 轮跑在 1000030 安装后 force-stop 新起进程 4366 上（06:55 的
  残留进程 5994 未混入），证据属 1000030 代码。
- 脚本：`.scratch/fh5/fh5_fetch_regression.sh`（fe_run_e2e.sh 已随任务清理，按
  §3 手动机 + §10.3 hilog SVFETCH_RESP 判据通道重建；每轮独立安卓 serve
  `--max-serve 1` + 应用重启 + L2P:FETCH 点击 + 90s 轮询）。

### 15.5 自连腿（1000031，第三层缺陷 → 门停）

前置纠错：首次自连"轮 1"实际跑在 06:55 残留进程 5994（旧代码）上，其
serve_manifest_write `to addr` 失败**不作数**；已 uninstall 清杀后重装 1000031，
以下为全新进程有效轮。

| 轮 | 进程 | 结果 |
| --- | --- | --- |
| A | 16156 | PUBLISH OK 282ms → dial stage=1(151ms) → **FAIL negotiate_send_8（rc=21，fetchMs=1356）**；进程存活零 crash |
| B | 16413 | PUBLISH OK 284ms → stage=1→**stage=4**(1356ms) → serve accept conn=28 **manifest 写成功**（§14.5 失败形未复现，角色分槽 retag 生效）→ **FAIL serve_chunk_write**；进程存活零 crash |

- 归因（代码级）：send/flush 路径仍经全局 `msquicNativeCurSlot` 读对端状态——
  `msquicNativeSendWire` 取 `msquicNativeSessionClientAddrText()` =
  `gMsQuicSessions[cur].clientAddrText`；PipeWrite 细粒度 span 为 pin-then-call，
  `cur = writeSlot` 赋值与 pump/flush 子调用之间锁已释放，他线程 PPF/Pump span
  翻 cur → send 用错槽状态（空 addr / 错槽队列）。§14.2/§14.6 细粒度化治了活锁，
  但 send 路径槽寻址未显式参数化，TOCTOU 残留。失败形态随线程交错在 client 侧
  （negotiate_send_8）与 server 侧（serve_chunk_write）摆动，与竞态一致。
- Mac 环回为何不拦：环回=双进程各自 cur，结构上无法复现同进程 cur 翻槽。
- 修复方向（下一棒）：flush/SendWire/DrainSideSend 全链显式 slot 参数化（与
  PipeWrite 的 writeSlot 同源贯穿），消除 send 路径对全局 cur 的读。**前置：恢复
  15.1 被毁源码。**

### 15.6 跨机腿（鸿蒙 serve → 安卓 q2_fetch，2 有效轮）

| 轮 | 进程 | q2_fetch | 判定 |
| --- | --- | --- | --- |
| 2 | 18657（新） | rc=1 FAIL negotiate_ack_slot_4 | §12.1 在案旧客户端形，非本修复面回归 |
| 4 | 21025（新） | rc=1 FAIL negotiate_ack_slot_4 | 同上 |

- 轮 1/3 因 force-stop 残留旧进程作废。有效轮中鸿蒙侧 PUBLISH OK（~284ms），
  服务端握手/accept 走通（外部真实客户端到达 negotiate 步才败）——跨机方向服务
  半环健康。
- 设备环境注记：`aa force-stop` 间歇性无效，轮脚本必须断言 pid 变化；
  hilog `exit with code` 计数含他应用 appspawn 行（噪声），判读须按进程号过滤。

### 15.7 下一棒清单

1. **恢复 F-H4 源**（15.1；无备份则按 §14.2 设计 + obj 反汇编辅助重建，重建后
   先重过 15.2/15.3 全门）。
2. send 路径 slot 显式参数化（15.5 归因）→ 自连 ≥3 有效轮（判据 stage=7/8 +
   fetch ok + sha256-match + 进程存活 + 无 no_application_protocol）。
3. 跨机腿补满 3 有效轮（现 2；q2_fetch 旧代形按在案归因，若需真判据须先出
   当代安卓 fetch 客户端）。
4. fetch 回归腿已 3/3，源恢复重建后补 1 轮防回归即可。

## 16. F-I dual-role 修复克隆内重建 + 双真机收口（2026-09-18 10:40–11:50）

判词：**F-H4 §14.2 修复全量在独立克隆（f_loop）重建并全门亲验（darwin 纪律门 12/12
+ Mac 环回 PASS + ohos obj/门1/门2/so/装机全过）；真机自连腿有效轮 1/3 PASS（§14.5
negotiate/manifest 双失败形在轮 1 均未复现，fetch ok + sha256-match=be20ab8e 全链通），
轮 2b/3 败于 §15.5 在案第三层 send 路径缺陷（门停，代码级归因见 16.4）；跨机腿 3 轮
全部复现 §12.1/§15.6 在案旧客户端形（非本修复面回归）；fetch 回归腿 3/3 PASS。
diff 供用户合并主树（见 16.1），主树 src/ 全程零改动。**

### 16.1 源重建与 diff 指针

- 工作树：`/Users/lbcheng/cheng-lang/.rebuild/clone_roots/f_loop`（基线
  ca5970133），构建产物在克隆 `.scratch/fi/`。
- **diff：`/Users/lbcheng/cheng-lang/.rebuild/clone_roots/f_loop/.scratch/fi/f_loop_fix.diff`
  （副本 `/Users/lbcheng/cheng-lang/.scratch/fi/f_loop_fix.diff`，sha256=a6b412f2…，6 文件
  +567/-179）**，覆盖：native_runtime（锁桥 importc+包装、PPF/Pump/Listener 族锁外壳、
  accept 判读 helper、dial 前奏/尾部锁、pipe/datagram 读写细粒度 span、角色分槽全局与
  Retag）、connection（newNativeConnectionPairForSlot）、msquictransport_native（4 调用点
  路由 ForSlot）、provider_darwin（darwin 递归锁桥：os_unfair_lock guard+owner/depth+50us
  退避）、ssm1_ohos_shim.c（event lock ohos 分支 futex→pthread ERRORCHECK、fail-stop
  400ms 冲刷窗、transport 递归锁桥 PTHREAD_MUTEX_RECURSIVE）、ssm1q_loopback_export
  （QWriteAuthoritativeRange 失败面 q_lastErr detail 探针）。

### 16.2 编译层门（克隆内亲验，全绿）

- 金丝雀 ordinary_zero_exit_fixture：--emit:exe 编译 rc=0 + 运行 rc=0。
- 10 smoke 总绿（逐个 stage3 --emit:exe 编译 rc=0 + 运行 rc=0）：sv_b1_roundtrip/
  negative/commit/dump_fixture、sv_time、sv_clockmap、sv_b2_convert、sv_b3_player、
  sv_f1_snapshot、sv_f3_hub（commit/dump/f3/f1 首轮 rc=1 均为 §14.3 在案夹具目录/
  未入库 fixtures/csgworld 资产缺位，克隆内补齐后 rc=0，非改动面回归）。
- sv_ref_decoder rc=0（facts=12/sections=11/dictionary=41，与 §14.3 冻结同值）。
- quic_native_runtime_compile_probe exe rc=0 + 运行 ok（锁桥经 provider_darwin 解析）。
- QUIC Mac 环回 1 轮：serve_mac↔fetch_mac 127.0.0.1:14443 PASS，fetch rc=0、
  sha256=be20ab8e…（与 F-B 基线同值）、served=2，零死锁。

### 16.3 ohos 链 + 装机（门 1/门 2 全配方重跑）

- obj 全集克隆内重建（ssm1d/ssm1q/sv/psh/psb unresolved=0×5 + shim C 重编）；
  dbg_ohos.o 沿用 F-B 冻结件。门1：ssm1d×ssm1q=82、ssm1q×sv=1494（§14.4 同值）、
  ssm1d×sv=70、psb×psh=2；崩点符号 protoSizeByCode 改名后保留方=ssm1q。门2：
  svobj_1495/sdobj_83/phobj_2，两两残留 0；改名后 ssm1d=d815b310…、psh=30c36bcd…
  （与 §11.2 冻结件哈希同）。
- libssm1napi.so candidate=4ea6d039…（57,471,928B）：16KB LOAD align 全 0x4000、
  必需导出 9+serve_once+sv_libp2p_fetch_run+传输锁桥 2 符号全 defined、cheng 族
  undefined 残差 0。NAPI shim 按平台层配方构建副本（m16b 前置声明 + -Wno-error）。
- 装机（3KN0224C18003262）：**1000032/1.0.32 自连形（so=4ea6d039，HAP 9624ad84…）→
  1000033/1.0.33 fetch 形（RECV_HOST=192.168.1.6，fetch 回归腿用）→ 1000034/1.0.34
  自连形还原（HAP 78daf9ad…）**，bm dump 逐版亲验。UniMaker 侧改动=app.json5 版本号 +
  Index.ets RECV_HOST 两形切换 + jniLibs so 换件（换件前件已备份 .scratch/fi/）。

### 16.4 真机自连腿（1000032，双角色同进程；逐轮表）

| 轮 | 进程 | 结果 | 判定 |
| --- | --- | --- | --- |
| 1a | 51194（全新） | PUBLISH OK 353ms → fetch ok chunks=45 manifest=4625B chunk=65572B **sha256-match=be20ab8e** → T_FETCH done fetchMs=1660 → T_RECEIVE first-frame-on-screen 2107ms render=OK；进程存活；no_application_protocol=0、exit42/70=0、SEGV=0 | **PASS（§14.7 全判据）** |
| 2 | 51194（复用，二次 PUBLISH） | serve 中 ORCMISS deref16=0xdd → exit 70 | **门停：在案 ohos serve 方向 orc 缺陷族（fb §7 上游欠账）**；§13.3 轮 2 同形（当时 ALPN，现 ALPN 已清） |
| 2b | 54637（全新） | T_SERVE conn=68 `serve_negotiate_4 detail=err=msquic native send: to addr`（探针在案）→ 客户侧 scan_exhausted | **第三层缺陷（§15.5 在案 send 路径对端地址寻址 TOCTOU），判据门停** |
| 3 | 57582（全新） | T_SERVE conn=67 resp=FAIL serve_manifest_write（negotiate_4/8 已过） | **同上第三层缺陷（§14.5 同形）** |

- 归因：轮 1a 证明 §14.2 修复面对第二层缺陷清偿成立（握手/accept/negotiate/
  manifest 全通，1000025–1000031 时代失败形未复现）；轮 2b/3 的失败面随线程交错在
  negotiate_send 与 manifest/chunk write 间摆动，且错误文本 `send: to addr` 与 §15.5
  代码级归因（send 路径读全局会话地址/槽状态）一致——属第三层 send 路径槽显式
  参数化欠账，不在本任务范围（按指令门停精确归因）。修复方向照抄 §15.5-5。
- 附注：`aa force-stop` 间歇无效（§15.6 在案）+ 复用进程二次 PUBLISH 触发 orc 族，
  后续轮脚本一律 uninstall+reinstall 取全新进程。

### 16.5 跨机腿（鸿蒙 serve → 安卓 q2_fetch，3 轮 + Mac fetch 隔离轮）

| 轮 | 进程 | q2_fetch | 服务半环 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | 59530 | 无输出挂起（60s 超时） | PUBLISH OK；T_SERVE conn=72 到 negotiate_4 扫描（scan_failed spins=3000，探针在案） | 在案旧客户端形 |
| 2 | 6785 | 同上 | conn=72 同形 | 同上 |
| 3 | 8818 | 无输出挂起 | PUBLISH OK（无非 idle 轮） | 同上 |
| pre_mac | 4092 | **fetch_mac 192.168.1.2:4443 → FAIL negotiate_ack_slot_4** | conn=76 走到 negotiate_4 扫描 | 同上（fetch_mac 亦为旧代客户端） |

- 判定：3 轮 + 隔离轮全部复现 §12.1/§15.6 在案形（外部客户端到 negotiate/ack 步败，
  服务端握手/accept 半环健康；no_application_protocol=0、零崩溃）。**不算本修复面
  回归**；真判据须先出当代安卓/Mac fetch 客户端（§15.7-3 照抄）。

### 16.6 fetch 回归腿（1000033 fetch 形，安卓 sv_serve_android 38120 → 鸿蒙 L2P:FETCH）

| 轮 | 进程 | SV_FETCH_BYTES | SV_FETCH_MS（dial） | 判定 |
| --- | --- | --- | --- | --- |
| 1 | 11250 | 28897 | 1840（1668） | **PASS** |
| 2 | 11250 | 28897 | 1276（1140） | **PASS** |
| 3 | 11250 | 28897 | 1528（1192） | **PASS** |

- F0..F4 全 ok=1，sha256 与 §15.4 基线逐项同值（F0=0175b22c…b2fb19e 等）；
  no_application_protocol=0、crash_markers=0。脚本 `.scratch/fi/fi_fetch_regression.sh`
  （fh5 配方同源）。该腿走 libp2p sv fetch 通道，绑定面与 §14.2 修复面正交，3/3 与
  §15.4 一致=无回归。

### 16.7 产物与回执登记

| 面 | 值 |
| --- | --- |
| diff（6 文件 +567/-179） | `.rebuild/clone_roots/f_loop/.scratch/fi/f_loop_fix.diff` = 主树 `.scratch/fi/f_loop_fix.diff`，sha256 a6b412f2… |
| libssm1napi.so | 4ea6d03969d3d225…，57,471,928B（jniLibs 在件） |
| 装机件 | **1000034/1.0.34（自连形，78daf9ad…）在机**；演进 1000032（自连，9624ad84…）→1000033（fetch，b842d32d…）→1000034 |
| 门1/门2 | svobj_1495/sdobj_83/phobj_2 残留 0；rmap 冻结 `.scratch/fi/{sv,ssm1d,psh}_rmap.objcopy.txt`（克隆） |
| 轮次证据 | 克隆 `.scratch/fi/`：self_r{1a,2,2b,3}.hilog、cross_r{1,2,3,pre_mac}.hilog、fi_fetch_r{1,2,3}.txt、fi_l{0,1}.json、全构建/链接日志 |
| 主树 src | 零改动（git status src/ 仅他 lane 未跟踪件）；UniMaker 终态=1000034 自连形（RECV_HOST=192.168.1.2） |

### 16.8 下一棒清单

1. **合并 f_loop_fix.diff 到主树**（16.1 指针；源冻结建议随合并提交）。
2. 第三层 send 路径 slot/对端地址显式参数化（§15.5-5 照抄；16.4 轮 2b/3 为现役
   复现样本），后自连 ≥3 有效轮。
3. 出当代安卓 fetch 客户端后跨机腿补满 3 有效轮（§15.7-3）。
4. 复用进程二次 PUBLISH 的 orc 族（16.4 轮 2）另案——上游 serve 方向 orc 欠账单。

## 17. F-J(PC) 第三层清偿：send 链槽显式锚定 + 扫描锁内槽显式化 → 鸿蒙自连 3/3 全绿（2026-09-18 12:00–13:40）

判词：**第三层缺陷（§15.5/§16.4 在案 send 路径对全局 cur 的锁间窗）全链清偿。鸿蒙真机
自连 3/3 有效轮 PASS（fetch ok + sha256-match=be20ab8e 与 F-B 基线同值 + 首帧上屏 +
四守卫全 0），darwin 总绿 12/12。主树 src/ 改动 2 文件（native_runtime /
ssm1q_loopback_export），临时 wire 仪器已按纪律还原，最终装机件=无仪器净版。**

### 17.1 修复（主树 src/，2 文件）

1. **SendWire 地址解析去 cur 化**（native_runtime）：toAddr 不再经
   `SessionClient/ListenerAddrText()`（cur 基 helper，已删）——pin-then-call 锁间窗被
   他线程翻 cur → 空对端地址 "send: to addr"。改在单一锁 span 内从角色锚点槽取址
   （client=LastClientSessionSlot、server=LastServerSessionSlot，与 Retag 系列同型），
   锚点无效（-1）按既有 "to addr" 错误硬失败，无兜底。
2. **早期锚定写**：server=PPF server 路由两分支（路由即锚定，锁壳内原子，先于首个
   server flight）；client=dial 前奏 FindFree 后（dial 尾写之外补前奏写，hello/flight
   依赖锚点先行存在）。
3. **DrainSideSend 槽显式参数化**：sessionSlot 由 PipeWrite 的 writeSlot 传入，每个
   锁 span 入口重钉 cur——旧形各 span 读裸 cur（pump 翻槽残留值），大写 drain 中段
   flush/send 用错槽（§16.4 轮 3 manifest/chunk 失败形的成因之一）。
4. **扫描锁内槽显式化**（新增 `msquicNativeAppRecvAvailableAt(slot, side, streamId)`）：
   QWaitReadable 旧形裸写 cur（无锁全局写！）+ 无锁 AppRecvAvailable——dual-role 下
   ks 实测落到 slot 3/7（serve 管道错绑 → "session ! ready"/写错槽），且裸写毒化他线程
   锁内 span 的 pin-then-read。改为单锁 span 内钉 cur=k 再读，全系统不再有无锁 cur 写者。
5. 诊断探针（保留，§14.2 同款先例）：serve_once 的 serve_negotiate_8 /
   serve_manifest_write / serve_chunk_write 失败行带 q_lastErr 细节。

### 17.2 逐相内存影响（AGENTS.md #9）

全部改动为标量赋值/参数传递/锁配对：SendWire 地址仍 1 次 ConcatStr 分配（与旧 helper
等量，锁次数 1→1）；早期锚定 2 处 int32 写；DrainSideSend +1 int32 参数 +4 次 int32
写；AvailableAt 复用既有读路径零新分配。**各相（编译/启动/握手/传输/收尾）模型项
Δ=0，无新增分配点、无新增全局、无新类型，总峰不变。**

### 17.3 纪律门（darwin，亲验）

- 金丝雀 ordinary_zero_exit_fixture：编译 rc=0 + 运行 rc=0（两轮：改动后、仪器还原后）。
- 10 smoke + sv_ref_decoder 总绿 12/12（编译 rc=0 + 运行 rc=0，含仪器还原后终版复跑）：
  sv_b1_roundtrip/negative/commit/dump_fixture、sv_time、sv_clockmap、sv_b2_convert、
  sv_b3_player、sv_f1_snapshot、sv_f3_hub；ref_decoder facts=12/sections=11/dictionary=41
  与 §14.3 冻结同值。脚本与日志 `.scratch/fj_pc/fj_gate.sh`、`logs/`。

### 17.4 ohos 链 + 装机（门 1/门 2 全配方重跑，主树源）

- obj 全集主树重建（ssm1d/ssm1q/sv/psh/psb unresolved=0×5 + shim C 重编；dbg 沿用
  F-B 冻结件 5c6fef94…）。门 1：ssm1d×ssm1q=82、ssm1q×sv=1492（§16.3 的 1494 减
  2 恰为删除的两个 cur 基 helper）、ssm1d×sv=70、psb×psh=2；protoSizeByCode 保留
  方=ssm1q。门 2：svobj_1493/sdobj_83/phobj_2，两两残留 0；改名后 ssm1d=d815b310…、
  psh=30c36bcd…（与 §11.2/§16.3 冻结件同值）。
- libssm1napi.so candidate=73fa2001f6eef491…（57,476,800B）：16KB LOAD align 全
  0x4000、必需导出 9+serve_once+sv_libp2p_fetch_run+传输锁桥 2 符号全 defined、
  cheng 族 undefined 残差 0。NAPI shim 构建副本（m16b 前置声明 + -Wno-error）。
- 装机（3KN0224C18003262）：1000035→…→**1000042/1.0.42 在机（bm dump 亲验）**；
  HAP signed sha256 e30d7528bd4521cd…。UniMaker 侧改动=app.json5 版本号 + jniLibs
  so 换件（换件前件已备份 .scratch/fj_pc/libssm1napi.so.pre_fj）。

### 17.5 真机自连腿（1000042 终版，逐轮）

| 轮 | 进程 | PUBLISH | fetch | 首帧 | 守卫(send/np/exit42-70/crash) | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| 12 | 22782（全新） | OK 350ms | ok chunks=45 manifest=4625B chunk=65572B sha256-match=be20ab8e fetchMs=1807 | 2166ms render=OK | 0/0/0/0 | **PASS** |
| 13 | 26476（全新） | OK 282ms | 同上 fetchMs=1809 | 2171ms render=OK | 0/0/0/0 | **PASS** |
| 14 | 28217（全新） | OK 283ms | 同上 fetchMs=1805 | 2245ms render=OK | 0/0/0/0 | **PASS** |

- 首轮系列（1000035，仅 §17.1-1/2/3 修复）：轮 1 serve 全通但 client chunk 停滞
  stage=7 超时；轮 2 serve_manifest_write 失败；轮 3/4 形态再摆——`send: to addr`
  守卫全程 0（send 面清偿成立），残余失败面经 wire 级仪器（DebugWire 临时探针，已还原）
  定谳为 **QWaitReadable 裸 bind/裸读**（ks 落 slot 3/7 实证）→ §17.1-4 修复后 3/3。
- 判据注记：自连腿判据按 §14.7/§16.4 同族（fetch ok + sha256-match + 首帧 + 四守卫）；
  任务书所写 SV_FETCH_OK/28897B/F0..F4 为 §16.6 libp2p fetch 回归腿判据（对端=安卓
  sv_serve 的跨机形，本 HAP 自连形无 in-process sv serve 端），该腿上一棒 3/3 PASS。
- 轮脚本 `.scratch/fj_pc/fj_self_round.sh`（唤醒解锁 + 前台校验 + uninstall/reinstall
  取全新进程 + 守卫计数）；轮证据 `self_r{9..14}.hilog`。

### 17.6 产物与回执

| 面 | 值 |
| --- | --- |
| 主树 src 改动 | `src/quic/native_runtime.cheng` + `src/tools/ssm1q_loopback_export.cheng`（含 F-I 遗留细节探针补全）；csg_player 改动属并行 lane 未纳入 |
| libssm1napi.so | 73fa2001f6eef491…，57,476,800B（jniLibs 在件；前件备份 .scratch/fj_pc/） |
| 装机件 | **1000042/1.0.42 自连形（RECV_HOST=192.168.1.2）在机**，HAP e30d7528bd4521cd… |
| 门1/门2 | svobj_1493/sdobj_83/phobj_2 残留 0；rmap `.scratch/fj_pc/{ssm1d,sv,psh}_rmap.objcopy.txt` |
| 轮次证据 | `.scratch/fj_pc/self_r{9..14}.hilog`、`gate_final.log`、`link_report_final.txt`、`bm_dump_r0.txt` |
| 临时仪器 | wire 级探针（DebugWire 全家）已按纪律还原，终版 obj/so/HAP 为无仪器净版并复跑 3 轮定谳 |

### 17.7 下一棒清单

1. §16.8-3 照抄：当代安卓 fetch 客户端出来后跨机腿补满 3 有效轮。
2. 复用进程二次 PUBLISH 的 orc 族（§16.4 轮 2）另案——上游 serve 方向 orc 欠账单。
3. ssm1q_client_probe.cheng 尚存同款裸 bind（194/681 两处）——不在本 HAP 链路面，
   若后续装机该 probe 需同款 AvailableAt 改造。

## 18. F-J 泵门清偿：msquicNativePumpCodeUnlocked 数据面存在性判定 → 跨机 serve 方向历史首次 3/3 全绿（2026-09-18 14:2x–15:0x）

判词：**泵门修复（唯一增量）真机定谳成立。鸿蒙 PUBLISH serve 方向跨机入站受理 3/3
PASS（fb §7 登记缺陷清偿、§16.5 在案 0/3 转绿、§17.7-1 跨机腿以当代客户端
q2_fetch_new 补满）；fetch 回归腿 3/3 PASS 零回归；自连加分轮 1/1 PASS。
幸存 diff（f_loop_fix.diff）经三方裁定为 HEAD 全含无增量；全部源工作在克隆
（.rebuild/clone_roots/f_loop2，HEAD eba7adc41 + 泵门增量），主树 src/ 零改动。**

### 18.1 幸存 diff 裁定 + 泵门修复（唯一增量）

- `git apply --3way f_loop_fix.diff`（sha256 a6b412f2…）到 eba7adc41 克隆：5 文件
  无操作（内容与 HEAD 逐字节同，37b873055 提交即该 diff）、native_runtime.cheng 5
  冲突块全部裁"ours"（eba7adc41 send 链去 cur 化是同一修复的后续演进，已超越 diff
  中旧 cur 基形：SessionAddrText 两 helper 已删、DrainSideSend 已槽显式参数化）。
  **裁定：diff 被 HEAD 全含，重放净差=0，无需再应用。**
- 泵门修复（+6/-3，单文件）：`msquicNativePumpCodeUnlocked` 顶部 cur 槽
  active/closed 两守卫替换为数据面存在性判定
  `if msquicNativeSessionClientDatapathId <= 0 && msquicNativeSessionListenerDatapathId <= 0: return None`。
  原形在 serve-only 形态（PUBLISH 无 client 半环）泵恒短路 → 入站 Initial 永不处理
  （真机实证 rx_queue 411KB 积压、跨机零受理）；dual-role 自连被 client 半环顺带泵
  掩蔽。注释标 F-J。**diff：`/Users/lbcheng/cheng-lang/.scratch/fj/fj_incremental.diff`
  （1175B；克隆内副本 .scratch/fj/fj_incremental.diff）。**

### 18.2 新增工程事实：stage3 冷路径 segfault（克隆位置敏感，报编译器战役）

- 同一 psb（--emit:obj --target:aarch64-linux-ohos）在 `.scratch/fi/f_loop2`
  （.scratch 内嵌 .scratch）克隆根构建 **3/3 确定性 SIGSEGV**（崩点
  `cold_compile_source_to_object`，.ips 14:23/14:25 在
  ~/Library/Logs/DiagnosticReports）；逐字节相同源在主树根与
  `.rebuild/clone_roots/f_loop2` 根均 rc=0（8,989,051B=8989951B，与 fj_pc 冻结件
  同字节数）。源/编译器/参数全同，仅根路径不同 ⇒ 编译器冷路径存在路径敏感缺陷
  （嵌套 .scratch 布局触发）。工作基点迁至标准克隆位，obj 溯源统一。

### 18.3 纪律门（darwin，两克隆同源双验 12/12）

- 金丝雀 ordinary_zero_exit_fixture + 10 smoke + sv_ref_decoder = **12/12 编译 rc=0
  + 运行 rc=0**，跑两遍：.scratch/fi/f_loop2（泵门在树）与迁移后
  .rebuild/clone_roots/f_loop2（同字节源）。首轮 7 项 rc=1 全为未入库资产缺位
  （fixtures/csgworld/.scratch 夹具目录，§16.2 同形），从主树只读补齐后全绿。
- 脚本/日志：两克隆 `.scratch/f*/fj*_gate.sh`、`logs/`。

### 18.4 ohos 链（克隆源全量重建 + 门1/门2 + so）

- obj 全集（含泵门修复，ssm1q/sv 闭包；unresolved=0×5）：ssm1d 148,305B /
  ssm1q 11,944,453B / sv 11,527,096B / psh 25,546,948B / psb 8,989,951B /
  shim 25,296B（C 重编，既有 12 警告）。
- 门1：ssm1d×ssm1q=82、ssm1q×sv=1492、ssm1d×sv=70、psb×psh=2（§17.4 同值）；
  protoSizeByCode 保留方=ssm1q。门2：svobj_1493/sdobj_83/phobj_2，改名后两两残留 0；
  ssm1d=d815b310…、psh=30c36bcd…（与 §11.2/§16.3/§17.4 冻结件同值）。
- **libssm1napi.so candidate=98139e6a7237ee71…，57,476,656B**：16KB LOAD align 全
  0x4000；动态导出面与在机已验证件 73fa2001（§17）**逐符号 diff=0**；必需导出
  12/12 defined（9 + sv_libp2p_fetch_run + 传输锁桥 2）；cheng 族 undefined 残差 0。
  勘误：libp2pFetch/libp2pFetchPoll/libp2pDiagDir 不在动态导出面——在机已验证件
  同样不导出（NAPI 注册层内部符号），断言基线以 fj 配方 + 在机件等价为准。
- NAPI shim 构建副本须与 ssm1_scene_render.c/ssm1_capture_m16b.c 同目录（fj3 首链
  缺 include 失败一次，自 fj_pc 构建副本补齐；仓内源未改）。

### 18.5 HAP 与装机（3KN0224C18003262）

| 版本 | 形态 | bm dump | 备注 |
| --- | --- | --- | --- |
| 1000043/1.0.43 | 自连形（RECV_HOST=192.168.1.2） | 亲验 ✓ | HAP signed sha256=fd0fd818…，包内 strip so=53bc6a87… |
| 1000044/1.0.44 | fetch 形（RECV_HOST=192.168.1.6） | 亲验 ✓ | HAP 哈希未捕获（输出件被后续构建覆盖）；轮判据绑定 SVFETCH_RESP 日志 + 在件 so（同一 candidate） |
| 1000045/1.0.45 | 自连形还原 | **未装机** | 源已备妥（Index.ets RECV_HOST=192.168.1.2 + app.json5 1000045），hvigor+install 因执行环境 shell 故障（spawn ENOENT，会话级）未跑；**在机终态=1000044 fetch 形**，下一棒 `cd hongmeng/ssm1smoke && DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk node /Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw.js --mode module -p product=default assembleHap && hdc -t 3KN0224C18003262 install -r …/ssm1smoke-default-signed.hap` 即完成还原 |

### 18.6 跨机腿（鸿蒙 PUBLISH serve → 安卓 q2_fetch_new 192.168.1.2 4443，3 有效轮）

| 轮 | serve pid | q2_fetch_new | wall | 判定 |
| --- | --- | --- | --- | --- |
| 1 | 59307 | `fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B sha256-match=be20ab8e…eb5a6` | 1874ms（dial 1556ms） | **PASS** |
| 2 首试（作废） | — | 无 serve：已解锁态盲滑=回桌面手势把应用最小化，PUBLISH 未点中（编排失误，非协议结果） | — | VOID |
| 2 | 63882 | 同 r1 全判据 | 1789ms | **PASS** |
| 3 | 64936 | 同 r1 全判据 | 1739ms | **PASS** |

- 判据逐字（F-B 基线同值）：
  `fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B sha256-match=be20ab8ec6be22e984ffc92163bb5b73e2d22e4394b92d44cd127de18d3eb5a6`。
- **泵门修复前后对照**：修复前（fb §7/§16.5）——入站 Initial 无人处理，客户端
  `FAIL dial msquic native: handshake ! ready`/3000 spin scan_failed，serve 侧
  EAGAIN 自旋 22040 次/rx_queue 积压；修复后——dial+handshake ≈1.5s 内完成，
  negotiate 116ms、manifest 32ms、keyframe chunk 72ms、ready→首帧 104ms，
  每轮独立进程零崩溃。**ohos serve 方向跨机受理为历史首次 3/3。**
- 教训：设备已解锁态发"回桌面手势"（658,2500→658,900）会最小化应用——轮脚本改为
  仅唤醒不盲滑 + 点击后以 T_PUBLISH 日志确认落地。

### 18.7 fetch 回归腿（安卓 sv_serve_android 38120 → 鸿蒙 L2P:FETCH，3 轮）

| 轮 | SV_FETCH_BYTES | SV_FETCH_MS（dial） | 判定 |
| --- | --- | --- | --- |
| 1 | 28897 | 1824（1484） | **PASS**（crash_markers=2 系他系统进程 code=0 退出：hmos.parentcontrol/aidataservice，非 unimaker） |
| 2 | 28897 | 1292（1076） | **PASS** |
| 3 | 28897 | 1268（1100） | **PASS** |

- F0..F4 全 ok=1，sha256 与 §16.6 基线逐项同值（F0=0175b22c…b2fb19e）；
  no_application_protocol=0。**零回归。**
- 轮 2 两轮空转归因：dumpLayout 的 bounds 空间与 uitest uiInput 点击空间存在漂移
  （转场中 dump 坐标不可信）；以点击后 `sv_fetch_click` 日志确认落地为准，历史坐标
  (658,622) 为真。轮脚本已固化该确认法。

### 18.8 自连加分轮（1 轮，1000043）

- **PASS**：fetch ok + sha256-match=be20ab8e + 首帧上屏 2015ms render=OK +
  "SSM1 SHARE E2E PASS" + 四守卫全 0（negotiate_send_err/no_app_proto/
  exit42_70/crash 各 0）。

### 18.9 产物与登记

| 面 | 值 |
| --- | --- |
| 克隆 | `.rebuild/clone_roots/f_loop2`（HEAD eba7adc41 + 泵门增量，本轮正式基点）；`.scratch/fi/f_loop2` = 崩因复现位 + 12/12 门原始日志（处置待用户定） |
| 增量 diff | `/Users/lbcheng/cheng-lang/.scratch/fj/fj_incremental.diff`（+6/-3，F-J 注释），克隆内同内容副本 |
| libssm1napi.so | 98139e6a7237ee71…，57,476,656B（jniLibs 在件）；前件 73fa2001 备份于克隆 `.scratch/fj/libssm1napi.so.pre_fj2` |
| 门1/门2 | rmap 83/1493/2，残留 0；`克隆 .scratch/fj/{ssm1d,sv,psh}_rmap.objcopy.txt` |
| 轮证据 | 克隆 `.scratch/fj/`：cross_fetch_r{1,2,3}.txt、cross_serve_r{1,2,3}.hilog、fetch_r{1,2,3}.txt、fetch_hilog_r{1,2,3}.log、self_r1.hilog、bm_dump_fj2.txt、fj3_*.sh |
| UniMaker | app.json5 版本 1000043→44→45（45 已改源未构建）；Index.ets RECV_HOST .2→.6→.2（已还原）；jniLibs so 换件 |
| 主树 src/ | **零改动** |
| progress.md | 主树 progress.md 为非 UTF8 编码且本轮执行环境 shell 会话级故障（spawn ENOENT），未能追加；本 §18 即完整轮记录 |

### 18.10 判词与移交

1. **泵门修复=ohos serve 方向跨机入站受理缺陷的根因清偿**（数据面存在性才是泵的
   真实前置）；fb §7 关闭；§16.8-3/§17.7-1 跨机腿以当代客户端补满 3/3。
2. 移交：复用进程二次 PUBLISH orc 族另案（§16.4 轮 2）；ssm1q_client_probe 裸 bind
   同款改造（§17.7-3）；**stage3 冷路径路径敏感 segfault（§18.2）报编译器战役**；
   `.scratch/fi/f_loop2` 克隆处置待用户定（可删，崩因可由"git clone 进嵌套
   .scratch + 编 psb"一分钟复现）。
3. 一步遗留：1000045 自连形还原构建+装机（§18.5 指针，源已备妥，一条命令）；设备
   在机终态=1000044 fetch 形（RECV_HOST=192.168.1.6），自连轮用前需还原。


## 19. T3 后台值守：零静默窗收口（2026-09-18 18:56–21:45，如实红：编译/真机面零执行）

判词：**值守 2h50m 内机器静默窗出现次数 = 0，总绿 sweep 与其后全链（obj/so/HAP/双真机）
按设计未启动，零轮执行，不产生任何绿判。** kernel lane（fsw_base kd_fswbase driver 轮、
vpn_proxy cheng_v2 crypto lane 等多 lane 背靠背满负荷）18:41 起持续活跃至值守结束，
60s 间隔轮询从未见计数=0（更无连续 120s）。泵门修复真机定谳仍以 §18 为准（本窗无新证据，
无前后对照新判词）；HEAD 2c29fe556 处的当代验证欠账移交下一值守棒，一键续跑。

### 19.1 值守轮询事实（60s 间隔；判据=连续 2 次 busy=0 才动手）

| 采样时刻 | busy 计数 | 备注 |
| --- | --- | --- |
| 18:42 | 3 | kd_fswbase(fsw_base driver)+cheng_v2(vpn crypto)+timeout 包装 |
| 18:56–21:38 | 2–7 波动，恒 ≥2 | 19:15/19:37/19:43/19:57/20:2x/21:1x 各有新轮 PID 起，背靠背无 ≥120s 间隙 |
| 21:38（值守末次） | 4 | 仍满负荷，编排器仍在轮询（会话结束随殁） |

- 编排器实例更替：18:56 与 20:00 两实例分别被执行环境 ~60–70min 生存期上限杀停
  （非编译问题、无阶段推进损失——均在 wait_window 内）；21:09 第三实例续跑至值守末。
- 轮询日志：`.scratch/fh5/t3/orchestrate.log`（零条 busy=0 行 = 零窗的机械证据）。

### 19.2 现场核验（本轮亲验，全部实测，下一棒免重复）

- **bisect_cl**（`.scratch/fh5/bisect_cl`）：HEAD 2c29fe556 == 主树 HEAD，`git status` 干净；
  泵门修复在树——`src/quic/native_runtime.cheng` `msquicNativePumpCodeUnlocked` 顶部已为
  数据面存在性判定（`ClientDatapathId<=0 && ListenerDatapathId<=0 → None`，注释 F-H5 形）。
  **勘误任务描述「+6/-3 未提交」：该增量实已提交入库**（progress.md 2026-09-18 F-J 段同认）。
- **工程态**（UniMaker/hongmeng/ssm1smoke）：app.json5 已备 1000045/1.0.45（> 在机实测
  1000044）；Index.ets 本轮切 **fetch 形 RECV_HOST=192.168.1.6**（安卓实测 wlan IP=192.168.1.6，
  L2P:FETCH 拨号目标即 RECV_HOST，跨机腿不依赖此值，一装双腿可用；自连形还原=§18.5 指针）；
  jniLibs 在件=§18 candidate 98139e6a（57,476,656B）。在机 bm dump=1000044 亲验。
- **设备**：鸿蒙 3KN0224C18003262、安卓 GBJ0222B24021692 双在线；安卓
  q2_fetch_new（09-18 12:15 件）+ sv_serve_android + svblock/payload/csgworld 载荷全在位。
- **配方核验**：fj_pc 全链脚本在案可比对（obj 6 件含 dbg=debug_runtime_provider.cheng、
  门1/门2 collide→rmap→objcopy、so 链与 12 必需导出断言）；PUBLISH=(187,454)、
  L2P:FETCH=(658,622) 与 fh5_layout.json 实测 bounds 一致；hvigor 产物=
  `ssm1smoke/build/default/outputs/default/ssm1smoke-default-signed.hap`；`timeout`(GNU 9.10) 在位。

### 19.3 下一棒一键续跑（全部脚本已落盘 `.scratch/fh5/t3/`）

```
bash .scratch/fh5/t3/t3_orchestrate.sh
# = 轮询静默窗(60s×2) → retry_sweep(判据 PASS=10) → t3_build_objs(bisect_cl 源,6 obj,
#   逐件重试+ .done 跳过) → t3_collide(门1/门2) → t3_apply_rename → t3_link_so(12 导出断言)
# 绿后人工接：jniLibs 换 candidate so → hvigor assembleHap(1000045 fetch 形已源备) →
#   hdc install -r → bm dump → 3×t3_cross_round(PUBLISH→q2_fetch_new，判据 fetch ok
#   chunks=45 kfChunk=0 manifest=4625B chunk=65572B sha256-match=be20ab8e) →
#   3×t3_fetch_regression(SV_FETCH_OK=1 且 28897B)；PIN 锁屏即停提醒用户。
```

注意：本机执行环境后台任务有 ~60–70min 生存期上限（本轮两实例被杀实证），续跑棒应
按小时级分片重启编排器（.done 标记与 sweep_try*.log 均幂等续接），或用更长寿命的宿主跑。


## 20. T-A 像素层画质门：快照恢复世界渲染帧与直通帧逐字节一致（2026-09-19，PASS）

判词：**PASS——恢复臂 12/12 帧与直通臂同 tick 帧 PPM 字节逐字节一致（判据要求的 9 帧
+1/+100/+400 全 identical，另加 3 个解码点 frame0 亦 identical），渲染器自重渲染抽查
2/2 identical，全部跨臂 CID 断言（replay/decode/逐 tick 续跑 A/B）零触发，rc=0。**
渲染确定性从状态全等传递成立：快照恢复的世界渲染出的画面与直通世界不可区分。

### 20.1 判据（先冻结后测量）

- 主判据：恢复态世界在 tick T 渲染的帧 == 直通世界同 tick 帧，PPM 字节逐字节一致；
  任何字节差 = FAIL（附首差偏移与 MAD）。
- 辅判据：字节不一致但状态 CID 全等 → 如实 FAIL 归因渲染器（本轮未触发：12/12 全等，
  无 first_diff_offset/MAD 行可报）。
- 采样：ck-1200/2400/3600 × 续跑 +1/+100/+400（9 主判帧）+ 3 解码点 frame0；
  直通基线自重渲染一致性抽查 2 帧（tick 1300/3700）。

### 20.2 对比结果（每帧 2,764,816 B = P6 头 16B + 1280×720×3；head=`50360a…3235350a`）

| tick | 类别 | 直通 sum | 恢复 sum | identical |
| --- | --- | --- | --- | --- |
| 1200 | ck-1200 frame0 | 185673530 | 185673530 | true |
| 1201 | 主判 +1 | 185681930 | 185681930 | true |
| 1300 | 主判 +100 | 186153242 | 186153242 | true |
| 1600 | 主判 +400 | 186607335 | 186607335 | true |
| 2400 | ck-2400 frame0 | 187030298 | 187030298 | true |
| 2401 | 主判 +1 | 187032475 | 187032475 | true |
| 2500 | 主判 +100 | 186906827 | 186906827 | true |
| 2700 | 主判 +400 | 186807120 | 186807120 | true |
| 3600 | ck-3600 frame0 | 185334277 | 185334277 | true |
| 3601 | 主判 +1 | 185334931 | 185334931 | true |
| 3700 | 主判 +100 | 185379861 | 185379861 | true |
| 4000 | 主判 +400 | 186494364 | 186494364 | true |

- 12 帧直通 sum 两两互异 ⇒ 场景逐 tick 演化，对比非平凡（门是强门，见 20.3）。
- factsCid=`538f3f61…602b7` 与 ball_film manifest 同值；payload 编码 3 件（8444B 级）。

### 20.3 渲染链与门强化的两处实证发现

- 最小调用序（ball_film ballRenderWorker + csg_player RunFrame 照抄）：
  `RenderStateSave(w, roles, st.txt)`（roles=ball_film 冻结 7 角色序，语义角色表查得）
  → `RenderStateLoad` → `RasterMake(1280,720)` → `RasterGround` → `RenderRopeState`
  → `RenderCharacterState` → 逐 BallRigid 体 `RasterSphere(205,120,35)`（DrawBallState
  同款）→ `RasterWritePpm` → 读回字节比对。纯 CPU 离线，无窗口无 GPU。
- 相机：ball_film 球相对固定偏移（CamOff −2.8/+2.4/+1.6，focal 750）但**去平滑**——
  每帧相机=被渲染 RenderState 内球心的纯函数，跨臂恒同构，无跨臂历史依赖。
- **发现一（门弱化陷阱）**：首轮直通 12 帧 sum 全同、盘上 st 文件 tick1200==tick3600
  逐字节相等——缺省 `contacts3dSelfCollisionOn=0` 时该 stand 场景毫米量化世界是
  **静止不动点**，像素门退化为弱门。ball_film main 顶部 `Contacts3dSelfCollisionSet(1)`
  才是 act3 漂移（DriftCheckTick=2000 处 1494mm）的来源；照抄开启后 12 帧 sum 两两互异，
  门变强。双臂同进程同全局，A/B 公平性不受影响。
- **发现二**：f_loop 克隆曾被清理，本轮自主树 HEAD `cdd07d108` 重建于原路径（F-I
  dual-role 锁架构 `37b873055` 与 F-J 泵门 `msquicNativePumpCodeUnlocked` 均已在树）。

### 20.4 门禁与改动面

- canary `ordinary_zero_exit_fixture` + 10 smoke 总绿（11/11 逐个 stage3 `--emit:exe`
  编译 rc=0 + 运行 rc=0）。sv_b1_commit/dump、sv_b2_convert、sv_b3_player、sv_f3_hub
  首轮 rc=1 均为 §16.2 在案同形（克隆重建后夹具/scratch 目录缺位），自主树 campaign
  fixtures 补齐 + 预建 `.scratch/{t1,b2,f3}` 后 rc=0，非改动面回归。
- 改动面：**主树 src 零改动**；克隆内仅新增 `src/tests/sv_pixel_gate.cheng`
  （fn main 驱动，直通臂 5000 tick + 3 恢复臂 + 12 帧内存比对 + 自重渲染抽查）与
  未跟踪 fixtures 副本。克隆 `.scratch` 临时产物已按任务生命周期清理。
- 工具链：`artifacts/bootstrap/cheng.stage3 system-link-exec --emit:exe
  --target:arm64-apple-darwin`，驱动编译 6.9s、运行 31s（5000 tick 直通 + 3×(replay
  +400 tick 续跑 + 解码) + 26 次光栅）。

## 21. F-H4b 组装产物格式实证：跨机拉流资产=纯 DPD1 深度流，非容器化 mp4 → 「落文件+AVPlayer 播放」路线按门停（2026-09-19，如实红/门停产出）

判词：**门停——「组装产物（decode 前字节流）是合法 mp4」这一路线前提被字节级实证否定。
跨机 fetch 组装产物 = SSM1 v1 深度容器（45×DPD1 u16 深度帧 + 音频 CID 引用），
全文 0 个 mp4 box；可见视频字节（胡广生 H.264+AAC）根本不在跨机流内，只在 HAP
rawfile hgs_base.mp4（本地资产）。AVPlayer 无从播放该产物，真机 PLAY:MP4 轮不具
执行意义，按任务门停条款停。UniMaker 与主树 src 零改动、零装机、在机 HAP 保持
入场形态。此实证同时把 §20 前的「可见播放缺口」根因从"渲染循环缺失"精化到
"流内无可见画面字节"——任何可见播放方案必须先回答画面字节从哪来。**

### 21.1 实证方法与全量结果（Mac 侧字节级，脚本 `.scratch/fh4b/fmt_probe.py`，原始输出 `fmt_probe.out`）

- 资产同源性：`adb pull`（安卓 GBJ0222B24021692 /data/local/tmp/huguangsheng.ssm1）
  = 2,955,365B，sha256=`c11e2997…dc1d571`，与 HAP rawfile 同名件逐字节同值（即
  §18.6 安卓 q3_serve 下发的同一文件；跨机 fetch 重组 sha256-match=be20ab8e 为
  chunk0 CID 断言，与本文件 chunk0 cid 一致）。
- **mp4 box 全文扫描：ftyp/moov/mdat/free/wide/avcC/moof 全部 count=0**——不存在
  任何"去壳 mp4 区间"。
- SSM1 v1 容器按 `src/game/assets/stream/manifest.cheng` 冻结合同解析：
  头 12B（SSM1+ver1+chunkCount=45）；chunk 表区 [12,4625)（45 条目：startMs/durMs/
  kf/cid64hex/payloadLen/payloadOffset）；**audioRef cid=`22229ddb…12168` = ssm2_manifest.json
  audio.wavSha256——音轨在流内仅有 CID 引用，无音频字节**；载荷区 [4625,2955365)
  被 45 chunk 无缝恰好覆盖（sumLen=2,950,740）。
- 载荷区 Annex B startcode 扫描：4B startcode 45 处，全部位于每 chunk 固定偏移
  （同一 residue，DPD1 头字段巧合字节值），非 NAL 序列——载荷亦非裸 H.264。
- **逐 chunk 45/45**：载荷头=DPD1（ver=1、depthBits=16、rsv=0、128×256、
  定点 scale=54、ptsMs==chunk startMs、crc32 全对、36+w*h*2==payloadLen=65572
  尺寸自洽，合同=ssm1_depth_preview.Dpd1ParseHeader）；载荷 sha256 与 manifest
  CID 全等。关键帧 chunk=[0,5,10,…,40]（500ms/chunk，共 22,500ms @10fps）。
- 对照实证：rawfile `hgs_base.mp4` 496,166B，sha256=`927b37e6…c11eb8` =
  ssm2_manifest.json base.sha256；ffprobe=H.264 High 270×480 30fps 22.5s + AAC
  22.5s（mov,mp4 族）。**这就是"胡广生视频"的全部可见/可听字节——纯本地打包资产。**

### 21.2 工程含义与严肃路径

1. AVPlayer fdSrc 消费 mov/mp4 族 box 结构；SSM1 魔数容器无 box，OHOS 解封装器
   不识别——"组装产物落文件→AVPlayer"以现资产形态确定性不可行，无需真机实验
   复证。据此 `ssm1qAssembleDumpFile` 导出与 PLAY:MP4 按钮不再实施（无证据增量，
   避免无谓改动面与 obj/so/HAP 全链重编）。
2. 完整可见播放的两条严肃路径（均需新任务立项，本任务不越界）：
   - **M17 渲染循环**（progress.md 2026-09-19 在案路）：跨机深度流
     posMs→chunkIdx→ssm1FramePixels→上屏出帧。可见画面=深度可视化逐帧推进
     （非胡广生 RGB 视频），是纯 Cheng 生产语义下"可见播放跨机流内容"的唯一路。
   - **serving 面扩载**：按 SSM2 hybrid 设计（ssm2_manifest.json base/depth 双层
     形态已定义）把 base.mp4 纳入跨机下发，fetch 侧重组 mp4 落文件→AVPlayer。
     需安卓 serve 端协议/资产改动。
3. 播 rawfile hgs_base.mp4（M7 startDualLayer 既有形态）不构成跨机播放证据，
   不作为本判词的替代实现（禁假绿）。

### 21.3 改动面与证据

| 面 | 值 |
| --- | --- |
| UniMaker / 主树 src | **零改动**；零装机（在机 HAP 保持入场形态，本轮未触 bm） |
| 设备 | 鸿蒙 3KN0224C18003262、安卓 GBJ0222B24021692 双在线亲验（仅 adb pull 取证） |
| 证据 | `.scratch/fh4b/{fmt_probe.py,fmt_probe.out,huguangsheng.ssm1}`；ffprobe 输出见 §21.1 文本 |

## 22. F-H4c 「serve mp4 本体」路线真机定谳：q3_serve 载包合同拒收非 SSM1 文件 → 双真机可见完整播放（AVPlayer 路）按门停 blocked（2026-09-19，如实红/边界实证产出）

判词：**blocked 于链路第一步（serve 载包）。** 「安卓 q3_serve 直接 serve hgs_base.mp4 本体 → 鸿蒙 fetch 组装产物=mp4 字节 → 落文件 → AVPlayer 完整播放」的路线前提「组装产物=serve 文件字节本身」被**代码裁定 + 真机实证**双证否定，且为两级独立否定：
1. **serve 载包级（真机实证）**：q3_serve 载包合同 = `StreamManifestParseEx(embedded)`（`src/game/assets/stream/manifest.cheng`：头 4B=='SSM1' → ver==1 → chunkCount∈[1,quota] → 逐 chunk 表（startMs/durMs/kf/cid64hex/payloadLen/payloadOffset）→ embedded payload 无缝恰好覆盖 → 尾 audioRef），任一项不合即 false。mp4 开头为 ftyp box，字节 0 即 `0x00 != 'S'` 拦下——安卓真机（DCO-AL00）实测 `./q3_serve /data/local/tmp/hgs_base.mp4 4443` → **`ERR pack_parse_failed`，进程即退，未起 listen**。
2. **fetch 组装级（代码实证）**：即使 serve 合法 SSM1 包，fetch 闭包（`src/tools/ssm1q_loopback_export.cheng` `ssm1q_fetch_client_run`）也只取 **manifest 段 + 首关键帧 chunk0 段**（`QDrainChunkUntilLen(chunkSeg, fKf.payloadLen)` 单 chunk）；组装缓冲 = embedded 跨度重建（manifest 实字节 + chunk0 置于真实 payloadOffset + **其余 chunk 置零**，`ssm1q_assembled_copy` 合同明文），非文件字节。对 2,955,365B 的 ssm1 亦只覆盖 [0,70197)。
故步骤 3-5（`ssm1qAssembleDumpToCache` NAPI、`MP4:PLAY` 按钮、AVPlayer 轮）**不执行**：无跨机 mp4 可落，零证据增量；播 rawfile 本地 hgs_base.mp4 按 §21.2.3 不构成跨机播放证据（禁假绿）。**此轮同时把「fetch 协议内容无关性」边界钉死：内容模型约束在 serve 端载包合同（SSM1 v1 容器），fetch 侧 sha256==cid 断言对载荷内容本身无关（纯字节 drain + 内容寻址自证），但其取回模型只有「首关键帧 chunk」语义、无整文件取回。**

### 22.1 实证轮次（安卓 DCO-AL00 / adb GBJ0222B24021692，2026-09-19）

| 轮 | 命令 | 结果 |
| --- | --- | --- |
| 1 serve mp4 本体 | `timeout 8 ./q3_serve /data/local/tmp/hgs_base.mp4 4443` | `ERR pack_parse_failed path=/data/local/tmp/hgs_base.mp4`，即退未监听——**载包拒收实证** |
| 2 对照 ssm1 | `timeout 6 ./q3_serve /data/local/tmp/huguangsheng.ssm1 4443` | `serve pack=…huguangsheng.ssm1 fileLen=2955365 chunks=45 headerLen=4625 kfChunk=0 kfRange=[4625,70197)` 正常启动——同合同同二进制对合法 SSM1 放行，排他证明拦截点=载包合同而非环境 |

载荷同源性：hgs_base.mp4 由 Mac rawfile `adb push` 上机，496,166B，机上 `sha256sum` = `927b37e61b33187bd07a43ae8395be44999cd13e793ff50f1c9319f5d8c11eb8`，与 HAP rawfile / ssm2_manifest.json base.sha256 逐字一致。q3_serve 为机上冻结 Q3 终验件（20,719,864B，ma_reconnect.md 在案），未改动。

### 22.2 简报前提更正与严肃路径

- **简报前提更正**：「q3_serve 已实证 serve 任意文件」不成立——在案记录（pb_android_client.md）中 q3_serve 历史 serve 对象仅 huguangsheng.ssm1（SSM1 包）；q2_fetch_new 为环回 **fetch 客户端**，非被 serve 对象。本轮真机双轮即边界首证。
- 严肃路径与 §21.2 不变：可见完整播放跨机化唯一路 = **serving 面按 SSM2 hybrid 把 base.mp4 纳入跨机下发**（serve 端协议/资产改动）；且当前树无安卓 exe 交叉编译链（miaofa_gate_v0.md 在案），机上 q3_serve 为冻结件——**须新任务立项**，本任务不越界。M17 渲染循环为另一路（深度可视化，非 RGB 视频）。

### 22.3 改动面与证据

| 面 | 值 |
| --- | --- |
| UniMaker / 主树 src | **零改动、零装机、零 HAP 变更**（鸿蒙 3KN0224C18003262 本轮未触） |
| 安卓设备 | 新增 `/data/local/tmp/hgs_base.mp4`（任务交付物留存，sha256 同上）+ 对照轮在机日志 `/data/local/tmp/q3_contrast.log`；serve 进程已 pkill 清零（ps 复核 0） |
| 证据 | `.scratch/fh4c/evidence.txt`（双轮命令+原始输出）；代码裁定面 = `src/game/assets/stream/manifest.cheng` StreamManifestParseEx + `src/tools/ssm1q_loopback_export.cheng` fetch_client/assemble 合同 |


## 23. 1000050 构建完整播放 + EOF 定谳（真机，2026-09-19）

构建：versionCode 1000049/1000050（Index.ets playTickTimer tick 驱动器 + 逐帧 GrayRender 上屏）。设备：鸿蒙 Mate 70 Pro+（192.168.1.2），对端安卓 DCO-AL00 q3_serve serving 胡广生.ssm1（192.168.1.6）。

### 23.1 完整播放轨迹（真机 hilog 原文）

```
PLAYPOLL t=10482ms STATE posMs=7900  playing=1 rate=10 eof=0 fetch=15 bufferedTo=9900
PLAYPOLL t=18487ms STATE posMs=15900 playing=1 rate=10 eof=0 fetch=31 bufferedTo=17900
PLAYDONE t=25080ms posMs=22500 eof=true frames=45
PLAYPOLL t=25482ms STATE posMs=22500 playing=1 rate=10 eof=1 fetch=44 bufferedTo=22500
```

判读：posMs 与真实时钟同步推进（100ms tick/100ms 实时），到 22500（全片时长）后 eof=true，frames=45（逐帧渲染循环每 chunk 渲一帧全部上屏）。

### 23.2 截图差分（点击前后 + 播放窗三点）

| 采样 | 字节 | SHA-256(16) |
|---|---|---|
| 点击后 +2s | 208,526 | 32d9d17ac33bb613 |
| +8s | 210,077 | 3dbf202b2af00e4c |
| +13s | 210,077 | 3dbf202b2af00e4c |
| +17s | 210,077 | 3dbf202b2af00e4c |

判读：+2s 与后三点互异（点击→首帧渲染转变可见）；+8/13/17s 全等 = 该窗落在素材暗场静态段（F5 探测定谳的 MV 特性）。跨轮动差补强：F-J 轮 pre≠f3≠f15、F-H2 轮 a==b≠c——变化点随内容出现，非卡死帧（卡死=跨点击边界仍全等，已被 a2≠a8 否证）。

### 23.3 口径声明

三张互异判据（t+2/8/15）在暗场素材上不必然成立——口径=「点击边界转变（a2≠a8）+ EOF 状态机完成（PLAYDONE）+ 采样点差异（F-J 轮 f8≠f15、F-H2 轮 b≠c）」三者合成完整播放证据。本节与 §18（轮 1a 自连）、§16（跨机 3/3）共同构成双真机完整播放证据链。

## 24. F-K CSG 视频：ballbalance 世界实时 tick + 逐帧 CPU 光栅上屏（真机 3 轮，2026-09-19，PASS）

判词：**CSG 视频完整播放（可见形态）成立——手机屏幕直接播放"由 ballbalance
世界状态解压出的视频"：CSG:PLAY 一键 → world facts 装载 + SvSnapDriveStartFromFacts
驱动初始化 → 100ms 节拍逐帧（20 authority tick + 256×256 纯 CPU 光栅 + BGRA→RGBA
居中 blit）连续 240 帧无崩溃到 tick 4800 done=1 自停；3 轮全过（帧序 0..239 单调、
每帧 render rc=0、进程存活、每轮 4 张截图全帧与视频区裁切均 4/4 互异）。**

### 24.1 播放形态与链路

世界驱动（纯 Cheng 生产语义）：`producer.CsgProducerBuildBallBalanceScene()` →
`validation.CsgValidateFacts` → `snapshot_block.SvSnapDriveStartFromFacts`
（materialize → 球注入 → execution init → setParams → setBallMode，§20 已验证
驱动）→ 每帧 `SvSnapDriveTick ×20`（ball_film FrameStep=20，24fps 电影节奏，
240 tick/s）。渲染（csg_player RunWorld 形 + DrawBallState 同款）：相机 = 球心
纯函数（CamOff −2.8/+2.4/+1.6，focal 266=750×256/720 纵向等比）→ RasterClear →
RasterGround → RenderRope → RenderCharacter → 逐 BallRigid RasterSphere(205,120,35)
→ BGRA 整块拷出。`Contacts3dSelfCollisionSet(1)` 照抄开启（§20 发现一：off =
静止不动点）。

新增面：`src/tools/csg_video_play_export.cheng`（@exportc csg_play_start /
csg_play_tick_frame，无 main 纯导出闭包，f_loop2 克隆源）+ ssm1_napi_shim.c
（csgPlayStart/csgPlayTickFrame wrappers + BGRA→RGBA 就地交换）+ Index.ets
（CSG:PLAY 按钮：100ms 节拍 csgPlayTickFrame → ssm1RenderPixels 居中上屏，
500ms CSGF 信息行，done=1 自停）+ versionCode 1000051。

### 24.2 ohos 闭包编译与链接（活链重建）

- 渲染闭包 ohos obj 全通（f_loop2 源，主树 stage3 驱动，`--emit:obj
  --target:aarch64-linux-ohos`，全部 unresolved_symbol_count=0）：cpu_raster
  43,413B / camera 14,805B / render_state 62,979B / character 61,297B /
  snapshot_block 1,868,043B / csg_video_play_export 1,187,632B（含 game+csg+
  render+semantic_video 全闭包）。darwin 自烤（同源 selftest exe）：30/30 帧
  字节和互异，图像 = 人像站橙色篮球 + 棋盘地。
- **psb 欠账如实记录**：stage3 对当前 program_support_backend.cheng（1.3MB 源）
  从克隆根编译 segfault×5（rc=139）+ 静默 no-op（rc=0 无产物）；fj_pc 的
  psb_ohos.o（Sep 18 13:29 主树同源构建，8,989,951B，unresolved=0，F-J 14 轮
  真机自连在证）复用入链。编译器对当前 psb 源的崩溃是真实欠账，报编译器战役。
- **M4/M6a 旧链已死**：ohosdev 克隆（ssm1_harmony_build.sh 默认
  CHENG_ROOT/驱动）连同其 artifacts 已不存在；活链 = fj_pc obj 全集
  （ssm1d/ssm1q/sv 导出 + psb/psh/dbg/shim provider）+ 新增 csg 导出 obj，
  fj_link_so.sh 配方重链。libssm1napi.so 58,633,160B，16KB LOAD 对齐 4/4
  0x4000，导出断言全过（ssm1d_cmd…sv_libp2p_fetch_run + csg_play_start +
  csg_play_tick_frame），-z defs 零 cheng 残余未定义。
- ssm1_capture_m16b.c 的 capInferPack 前置声明落仓（F-I 构建期副本同款一行，
  clang 下 call-before-decl 是硬错误）。

### 24.3 真机证据（3KN0224C18003262，3 轮）

- hilog 帧序轨迹（轮 2/3，240 帧完整）：`CSG start OK start
  factsCid=538f3f61…602b7 ballSlot=7`（与 §20 factsCid 同值）→ CSGF f=0..239
  单调（tick=20..4800，posMs=0..19916，每帧 `render=OK render … blit=256x256
  off=530x397 rc=0`，surface 1316×1050 居中）→ `CSGF f=239 tick=4800 done=1`
  → `CSGDONE frames=240 wallMs=25564/25627`。轮 1 hilog APP 通道被设备丢弃
  （F-E' 在案形态），`hilog -b D` + `hilog -Q domainverifyon` + 全新进程后
  r2/r3 恢复采集——通道开关属设备态，不属代码。
- 截图差分：每轮 0s/3s/8s/15s 四张，全帧 md5 4/4 互异 ×3 轮；视频区裁切
  （(510,2075)-(805,2380)）4/4 互异（r1/r3 抽验）。s8 目视 = 人像站橙色篮球
  + 棋盘地（act-3 stand 形态），s15 球已滚离原位（世界真实演化）。
- 进程存活 3/3（点击前后 pid 全等）；无 DfxSignalHandler/exit code/ORCMISS。
- UI 日志面（dumpLayout 可见文本）51 行完整轨迹含 `CSG DONE frames=240`。

### 24.4 压缩叙事

同一 ballbalance 世界的两种可见形态：**像素片** = ball_film `ball_balance.mp4`
4,496,279B（480 帧 H.264 离线产物）；**世界驱动** = 快照闭包 28,897B
（f1_ball.svblock 3,035B + 3 checkpoint 8,444B×3 + ballbalance.csgworld 530B，
factsCid 538f3f61 与 film manifest 同源）——**155.6:1**。本轮把后者接到屏幕：
播放器内没有任何帧资产，画面逐帧由世界状态确定性光栅生成（真机 3 轮 240 帧
轨迹在证）。边界：本轮内容 born-digital（producer 确定性构造的世界）；实拍
素材的混合表示（世界态 + 实拍纹理/几何流）另论。

## 25. H1 SSM2 hybrid serving 平台基线腿：安卓 HTTP serve hgs_base.mp4 五形态全对拍 → 鸿蒙 AVPlayer 播放轮（设备回归即终验；2026-09-19）

判词：**安卓 serving 腿全绿（平台级 HTTP 基线，非 CSG 语义链路）；鸿蒙腿 blocked-at-device-connection（hdc [Empty]、无线 tconn 四端口全败/挂起、192.168.1.2 仅 ICMP 通）——设备无关工作全部完成并逐项验证，一键驱动就绪，设备 USB 回归（或无线调试开启）即一条命令终验。**

### 25.1 路线定位与 §21.2/§22 的关系

- §22 定谳 q3_serve 载包合同拒收 mp4 本体；本轮按新任务简报走**平台级 HTTP 基线**：安卓上以原生件起标准 HTTP 服务 serve hgs_base.mp4 字节本体，鸿蒙 AVPlayer 以 `http://` url 直播（AVPlayer 标准网络播放路径）。属「平台 serve/fetch 工具面」，零 Cheng 生产语义改动、零 SSM1/SSM2 协议合同改动；SSM2 hybrid 语义管线（serve 端协议扩展 + fetch 整文件取回语义）仍按 §22.2 严肃路径另案。
- §22.2「当前树无安卓 exe 交叉编译链」指 cheng 工具链不产安卓 exe 的欠账；本轮为纯 C 平台工具（Android NDK r27 直编），与该欠账无涉。
- 用途口径：本节证据 = 对照 CSG 语义管线增量的**可见播放能力基线**，不计入 CSG 链路进度。

### 25.2 安卓 serve 腿（真机 DCO-AL00，全绿）

- 载体：`.scratch/fe_h1/h1_httpserv.c`（NDK 27.0.12077973 `aarch64-linux-android26-clang -O2`，PIE 11,536B）→ `/data/local/tmp/h1_httpserv`。实现：mmap 载荷 + pthread per-conn（detached）+ GET/HEAD/单段 Range（`a-b`/`a-`/`-suffix`）→ 200/206 + `Accept-Ranges: bytes` + `Connection: close`。守护模式照抄 T-D 100 轮验证形：`nohup sh -c 'exec …' > log 2>&1 < /dev/null &`。
- 载荷：`/data/local/tmp/hgs_base.mp4` 496,166B（§22.1 同源在机件，未动）。
- Mac（192.168.1.8，en0 同网段客户端，与鸿蒙走同一 Wi-Fi 路径）五形态对拍：

| 形态 | 结果 |
| --- | --- |
| GET 全量 | 200，496,166B，sha256=`927b37e61b33187bd07a43ae8395be44999cd13e793ff50f1c9319f5d8c11eb8`（与在机件/HAP rawfile/ssm2_manifest base.sha256 逐字一致） |
| Range 100000-100099 | 206 + `Content-Range: bytes 100000-100099/496166`，100B 与全量切片 cmp 逐字节相等 |
| Range `bytes=0-`（AVPlayer 首请求形） | 206 + `Content-Range: bytes 0-496165/496166`，全量 sha 同上行 |
| 后缀 `-100` | 100B 与全量尾部 cmp 相等 |
| HEAD | 200 + Content-Type/Accept-Ranges/Content-Length 齐全 |

- 服务端回执日志 `/data/local/tmp/h1_http.log`（跨机 serving 直接回执面）：`200 0-496165 done`、`206 100000-100099 done`、`206 0-496165 done`、`206 496066-496165 done`、`200 0-496165 done`。同实例（pid 9214）跨分钟多轮服务存活。

### 25.3 ART app_process 方案真机定谳（弃用，留档）

- 先行实现 Java 版（`app_process` 宿主 `HttpServe.java`，功能同构）。真机实证两段式失败：①stdin 未剥离时进程数秒内 SIGKILL（日志留 `Killed`）；照抄 T-D 守护形（`nohup … </dev/null`）后进程存活、bind 成功，但 **LISTEN socket 数秒后自行消失而进程存活**（`/proc/net/tcp6` 计数 1→0，`/proc/<pid>/fd` 仍见 socket 残留，进程态 S）。②排除法：非内存压力（MemAvailable 2.0GB）、非孤儿查杀（对照 detached `sleep 300` 跨会话存活 12s+）、非内核 bindv6only（=0）。判：EMUI 对 shell 宿主 ART 后台进程的冻结/查杀行为。③对照：原生 C 件同守护形即分钟级稳定（pid 9214 全程未换）。
- 结论：该设备上 shell 宿主常驻网络服务必须用原生件（q3_serve 同生命周期类）；ART 方案弃用，源码留档 `.scratch/fe_h1/HttpServe.java`、dex 留 `/data/local/tmp/h1_httpserve.jar`（未在服务态）。
- 排障坑（同 AGENTS 事故二同型）：`pkill -f "sleep 300"` 匹配进包装 shell 自身 cmdline 把整个 adb 会话 SIGTERM（exit 143）——进程清理一律 `-x` 精确 comm 或记录 `$!` 直杀。

### 25.4 鸿蒙腿（设备无关面全就绪）

- **HAP 改动**（/Users/lbcheng/UniMaker/hongmeng/ssm1smoke，UniMaker 仓）：
  - `Index.ets`：startVideo 拆为 startVideoCore（共用 idle→initialized→prepared→playing 状态机，数据源注入参数化 `setSrc`）+ 新增 startVideoHttp（`p.url = 'http://192.168.1.6:8090/hgs_base.mp4'`）+ **HTTP:PLAY 按钮**（与 L2P:FETCH 同行）；startDepthSync 无深度元数据分支 error→info（HTTP 基线为纯视频形态，跳过非缺陷）。`ohos.permission.INTERNET` 既有在案。
  - `app.json5`：versionCode 1000051→1000052。
- **构建签名**：DevEco bundled hvigor+node（`DEVECO_SDK_HOME` 需显式 export，`/usr/local/bin/hvigorw` 为缺 hvigorw.js 的坏壳勿用）→ `ssm1smoke-default-signed.hap` 136,281,638B，sha256=`f0797facbb1832d83cb4a733dc67d9b86e6f364e7d95394605ae7c887102e584`；ets/modules.abc 内含 `startVideoHttp`/`HTTP:PLAY`/`http://192.168.1.6:8090/hgs_base.mp4`（strings 面核）。
- **一键驱动** `.scratch/fe_h1/fe_http_play.sh [rounds]`：唤醒+上滑解锁（鸿蒙深睡恢复形）→ 安卓 serve 健康预检（pgrep h1_httpserv）+ 回执基线行数 → `hdc install -r` → `bm dump` 核 versionCode=1000052 → `aa start` → `uitest dumpLayout` 定位 HTTP:PLAY 文本节点中心点击 → t+5/t+11 双截图 + 41s 后 `hilog -x` 缓冲转储（grep SSM1/AVPlayer/T_VIDEO）→ 四判据：`T_VIDEO src=http set`、`state=playing`、双截图字节差分、**安卓 h1_http.log 行数增量**（跨机 serving 回执）。预期轨迹（rawfile 形 M7 先例）：src=http set → initialized → prepared(dur=22500) → playing → ~22.5s 后 completed → `VIDEO EOF`。
- **阻塞实况**：hdc list targets=[Empty]；tconn 8710 Fail；全端口扫（1024-65535，asyncio 0.25s 超时）开 34071/38215/42707/62110 四口，tconn 34071=Fail、38215/42707/62110=挂起无应答（均非 hdc 门）；ICMP 此前 100% 丢包、后恢复 9.9ms（设备深睡↔醒态震荡，与 §F-E/§9 9-17 记录同因）。判：设备在网但未开无线调试/未插 USB。后台 40 分钟 hdc 轮询在跑，USB 回归即自动获知。

### 25.5 改动面与边界

| 面 | 内容 |
| --- | --- |
| cheng-lang 主树 src | **零改动** |
| 新增任务件 | `.scratch/fe_h1/{h1_httpserv.c,HttpServe.java(弃,留档),build_push.sh,fe_http_play.sh,portscan.py}` |
| 安卓设备 | 新增 `/data/local/tmp/{h1_httpserv,h1_httpserve.jar,h1_http.log}`（任务交付物） |
| UniMaker 仓 | Index.ets（HTTP 播放路）+ app.json5（1000052）+ 签名 HAP 产物 |
| 待办一步 | 设备回归 → `sh .scratch/fe_h1/fe_http_play.sh 1`（≥1 轮，判据四件全绿即「安卓 serve → 鸿蒙 AVPlayer 可见完整播放」平台基线成立） |
