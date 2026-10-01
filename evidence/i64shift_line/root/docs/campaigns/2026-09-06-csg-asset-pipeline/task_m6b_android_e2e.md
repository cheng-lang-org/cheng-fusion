# task_m6b_android_e2e.md — UniMaker 安卓侧「发布 CSG 视频→秒发→同机接收→灰度上屏秒开」单机环回 E2E（M6b）

日期：2026-09-12。承 task_m6a_ohos_share_e2e.md 的 M6a 形态（ssm1q 环回导出面 +
PUBLISH/RECEIVE/ALL/RERUN + Surface 灰度上屏 + T_PUBLISH/T_FETCH/T_LOAD/T_RENDER
时间线打点），宿主从鸿蒙 NAPI/XComponent 换成安卓 JNI/SurfaceView。真机 HUAWEI
DCO-AL00（Android 12，serial `GBJ0222B24021692`）。编译克隆
`/Users/lbcheng/cheng-f24/anchor_clones/apkdev`（M5 同仓），车头冻结 C 头
`/private/tmp/cheng_w126_re`（sha256 `3ad3bc972ad7d82c…`，M1/M3 同物）。

---

## 1. 承载与结论

**结论：安卓单机环回 E2E 全链真机 PASS。** 单进程 127.0.0.1 QUIC 真环回，
发布即就绪 345/373ms，环回 fetch sha256 与 M5/M6a 逐字节同 CID
（be20ab8e…），组装→装载（`OK init chunks=45`）→播放核调度
（fetch=[0,1,2,3,20] 断言 PASS）→ANativeWindow 灰度上屏（截图实测灰度
min=21 max=249 非平场）。单次进程内全链 ALL pass=true totalMs=1948/2048ms。

QUIC android 运行时复用 M2/M5 已证通道；本轮风险实际落在 provider 装配与
两处真实 bug（§4），均实证修复/记录。

## 2. 交付物（全部新增，零既有文件修改）

1. **主仓新增** `src/tools/ssm1q_loopback_export_android.cheng`
   （`951954d6d2ab5eb5`）——M6a 环回导出面的 android 变体。与 M6a 原版唯一
   差异 = `ssm1q_assembled_copy` 应答合同（§4.1；原版文件未动，纪律允许仅新增）。
2. **UniMaker 新增** `ssm1android/` 独立 gradle 工程：
   ```
   ssm1android/
     settings.gradle / build.gradle.kts / gradle.properties
     app/build.gradle.kts            # minSdk 24, arm64-v8a, 零依赖, AGP 9 内置 Kotlin
     app/src/main/AndroidManifest.xml  # INTERNET 权限（M6a 同款门禁）
     app/src/main/java/com/cheng/ssm1e2e/MainActivity.kt
                                    # UI 镜像 M6a: PUBLISH/RECEIVE/ALL/RERUN +
                                    # SurfaceView + 等宽日志; 2.5s 自动 ALL;
                                    # SSM1E2E/T_* 打点; sha256/FETCH_SEQ 断言
     app/src/main/cpp/ssm1_jni_shim.c  # JNI 层 (JNI_OnLoad + Java_ 包名类名方法)
     app/src/main/jniLibs/arm64-v8a/libssm1loop.so   (fbf9feceddde9a87, 24.9MB)
     app/src/main/res/raw/huguangsheng.ssm1          (c11e2997bbe7039a, 2,955,365B, M3/M5 同物)
   ```
3. **apkdev 克隆产物** `artifacts/mobile_m6b_android/`：两个导出面 android obj、
   capture wrapper 截留的 driver 自产 provider 对象组（provider/core/host/syscall）、
   桥 C 与 .so、三个设备探针、真机 logcat/截图证据。两仓零 git 写操作。

## 3. 构建链（全部实测命令形态）

```
# ① 导出面 obj（M3 chengCompileObj 同配方; report 必含 real_backend_codegen=1）
cd apkdev && env -u CHENG_ROOT -u CHENG_PKG_ROOTS -u CHENG_PKG_HOME \
  -u CHENG_GUI_ROOT -u CHENG_IDE_ROOT CHENG_PROCESS_MAX_RSS_BYTES=8589934592 \
  CHENG_DISABLE_PRIMARY_OBJECT_CACHE=1 /private/tmp/cheng_w126_re system-link-exec \
  --root:$PWD --in:src/tools/ssm1q_loopback_export_android.cheng --emit:obj \
  --target:aarch64-linux-android \
  --export-roots:ssm1q_serve_start,ssm1q_fetch_run,ssm1q_first_frame_gray,\
ssm1q_assembled_len,ssm1q_assembled_copy,ssm1q_udp_probe,ssm1q_stage \
  --out:artifacts/mobile_m6b_android/ssm1q_loopback_android_v2.o   # unresolved=0
# 同法编 src/tools/ssm1_tick_daemon_export.cheng（ssm1d_cmd,ssm1d_load）

# ② provider 对象组截留：capture wrapper 当 ANDROID_NDK_HOME，对同一源
#    --emit:exe 一次，wrapper 在链接期把 driver 自产的 primary/provider/
#    provider.core/provider.host/provider.syscall 五 obj 复制留存
#    （M1 修复链同 wrapper：PREPEND android_stdio_bridge.o + -Lpatched_lib）。
#    psb/psh 两层文件桥按残余符号面补编：
#    program_support_backend.cheng  --export-roots:cheng_file_handle_*_bridge(7)
#    program_support_host_runtime.cheng --export-roots:cheng_host_{fclose,fread,
#      fseek,ftell,fstat_scalars,openat,read_runtime}

# ③ NDK 链单镜像 .so（lld, -z defs 全闭合）
aarch64-linux-android24-clang -shared -Wl,-soname,libssm1loop.so -Wl,-Bsymbolic \
  -Wl,--allow-multiple-definition -Wl,-z,defs -Wl,-z,now \
  -Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384 \
  -Wl,--version-script,ssm1loop.map -o libssm1loop.so \
  errno桥 stdio桥 getentropy桥 ssm1q_v2.o ssm1d.o provider×4 psb桥 psh桥 jni_shim.o \
  -landroid -llog -ldl -lm
# 验证: 导出恰 20 符号(JNI_OnLoad+10 Java_*+9 cheng); 无 PT_TLS; LOAD align 全
# 0x4000; FLAGS SYMBOLIC BIND_NOW; NEEDED=libandroid/liblog/libdl/libm/libc

# ④ APK：gradle :app:assembleDebug（Gradle 9.4.1 + AGP 9.0.0 内置 Kotlin，
#    JDK 17；debug 签名 keytool 预生成 ~/.android/debug.keystore）
```

关键实证（防再踩）：
- driver exe emit 的 provider 对象组是 android 平台桥唯一齐备来源（47 个残余
  符号全覆盖）；obj emit 只含 primary 闭包，残余面=provider 层+纯 libc。
- provider.syscall.o 里 proc_listpids/proc_pidinfo/sysctlbyname/spawnvp/libc_accept
  是**零重定位死符号**（llvm-objdump -r 实证），bionic 只解析重定位，不阻碍装载。
- bionic API24 无 getentropy：SYS_getrandom(278) 精确等价桥，短读循环，
  内核拒绝即 fail-stop（musl 同路径）。

## 4. 本轮实证修复的两个真实 bug

### 4.1 M6a 源 `ssm1q_assembled_copy` 应答覆写（主仓变体修复）
`q_copy_out(resp, out, cap)` 把 "OK assembled …" 应答行写进 out，覆盖组装跨度
头部前 76 字节，随后 `ssm1d_load` ParseEx embedded 必然
`ERR manifest_load_failed`。真机判别链：raw 字节载 PASS / 文件路径 init PASS /
assembled 载 FAIL，memcmp 实证 head0 `'S'→'O'`（0x53→0x4f）。修复=变体对齐同
文件 `first_frame_gray` 的 `(out,cap,metaOut,metaCap)` 双缓冲合同；修后 memcmp
first_mismatch=70197（恰= 4625+65572 chunk0 尾界，契约内零差异），`OK init
chunks=45` PASS。**ohos 侧同 bug 被 M6a 接收面 BLOCKED 掩盖，从未走到该步**
——登记 M6a 遗留，主仓原版文件未动。

### 4.2 JNI shim 帧长重建（UniMaker 工程内修复）
`ssm1q_first_frame_gray` 返回值=meta 行长度（84），初版 shim 误存为帧字节数
→ `frame_meta_invalid`。修为从 meta 解析 w/h 重建 `g_frameLen=w*h*4`（M6a
ohos shim 同位置同款疏漏，一并登记）。

## 5. 真机时间线（真实实测，logcat 存 artifacts/mobile_m6b_android/）

冷启动自动 ALL（点击等价点=am start，auto 触发）两轮 + headless 探针轮：

```
[run2 02:41:32 pid19376]
rawfile read ok bytes=2955365 readMs=13
surface created w=1212 h=512
T_PUBLISH  click->ready totalMs=345   resp=OK serve chunks=45 headerLen=4625 kfChunk=0 kfLen=65572 fileLen=2955365 port=4443 state=listening
T_FETCH    start->fetch-done totalMs=1207 (polls=8, 150ms 轮询)
  dial (transport+tls+handshake): 999999999 ns
  connect ready (negotiate x2 + serve push): 100000000 ns
  keyframe chunk segment residual (65572 bytes): 4000000 ns
  ready->first-frame ready: 4000000 ns
fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B sha256-match=be20ab8ec6be22e984ffc92163bb5b73e2d22e4394b92d44cd127de18d3eb5a6
SHA256 ASSERT PASS
T_LOAD     fetchDone->load-done ms=364   resp=OK init chunks=45 durationMs=22500 bufWindowMs=2000 src=memory
FETCH_SEQ  got=[0, 1, 2, 3, 20] expect=[0, 1, 2, 3, 20] ASSERT PASS
T_RENDER   loadDone->posted ms=15   resp=OK render fw=128 fh=256 bufW=1212 bufH=512 stridePx=1216 format=4 blit=128x256
==== ALL end pass=true totalMs=1948 ====

[run3 02:42:45 pid19371] 同构: T_PUBLISH 373ms / dial 996ms / ready->first-frame 4ms
/ T_FETCH 1208ms / SHA256 PASS / T_LOAD 438ms / FETCH_SEQ PASS / T_RENDER 7ms
/ ALL end pass=true totalMs=2048
```

截图断言（`m6b_after_render.png`，adb exec-out screencap）：渲染后屏幕灰度像素
（R==G==B）min=21 max=249，**非平场**；blit=128x256 左上角入 1212x512 surface。

## 6. 秒发秒开数字（口径声明）

- **秒发（发布即就绪）**：真机 **345/373ms**（rawfile 13-14ms + 解析+listen
  其余），M6a ohos 292ms 同量级，判据「点击到可被拉取」满足。
- **秒开（接收→首帧上屏）**，分层：
  - 数据面（M5 口径 ready→first-frame）：环回 **4ms**（两轮一致），跨机 M5 为
    64ms——环回无空口，段传输近零。
  - 用户口径（click→首帧 posted）：**1.95/2.05s**。构成=发布 345-373 + fetch
    1207-1208（其中 **dial ~1.0s 为 M5 §5.③ 已登记的运行时秒级量化**，
    工具层不可达；negotiate+推段 100ms；drain 4ms）+ 装载 364-438 + 渲染 7-15。
  - 对冲方向与 M5 同：dial 量化收敛属运行时层登记项。

## 7. 分层判词

| 层 | 判定 | 证据 |
|---|---|---|
| QUIC 环回导出面（android obj） | **通过** | 两导出面 obj unresolved_symbol_count=0；report real_backend_codegen=1/cold_system_link_exec=1 |
| 单镜像 .so（provider 全量） | **通过** | -z defs 全闭合；无 PT_TLS；16KB LOAD align；BIND_NOW；导出面恰 20 符号 |
| 设备 headless 探针（/data/local/tmp） | **通过** | dlopen/dlsym 9 导出全 PASS；serve→fetch→sha256→gray→assemble→load 全链 PASS |
| APK 构建/签名/安装 | **通过** | assembleDebug 成功；apksigner verify Debug 证书；adb install Success |
| so 加载/JNI | **通过** | 真机 JNI_OnLoad ok；SSM1/SSM1E2E 全打点在案 |
| 设备端发布（秒发） | **通过** | T_PUBLISH 345/373ms，listening，参数与宿主/ohos 逐字节一致 |
| 设备端接收+装载+渲染（秒开） | **通过** | sha256 断言 PASS；fetch=[0,1,2,3,20] 断言 PASS；T_RENDER blit 证据；截图灰度非平场 |
| RERUN（同 listener 二次 fetch） | **BLOCKED** | §8.1 |

## 8. BLOCKED 项与如实记录

1. **RERUN 二次 fetch 卡 stage=6（manifest drain）**：同进程第二次 fetch 到达
   drain 后停滞（首 fetch 正常），60s 无 idle-cap FAIL，app 超时兜底退出后
   用上一轮段继续 load/render 全 PASS。单连接形态（每进程一轮 ALL）不受影响。
   指向多连接顺序复用下的 dual-role 槽位/泵纪律（M5 §0.4 同域已知脆弱面），
   归 quic 移植战役清单。
2. **ssm1q_udp_probe 桥阻塞**：/data/local/tmp 探针中 recvfrom 桥挂起（M6a
   ohos 同探针是 crash）。辅助诊断桥，不进 ALL 主链（App 已规避）。
3. **M6a 原版 assembled_copy 覆写 bug**（§4.1）：主仓原版文件按纪律未动，
   android 变体修复；ohos 侧复用原版时需同步。
4. M3 §6-E（.so 分体模块级初始化）本轮未复现：单镜像全链内存态、无文件打开
   路径；文件桥已链入备用。psb 的 puts/cheng_puts 自引用环（M6a §7.3）未触碰
   （宿主 stdio 全归 JNI shim，cheng 侧无 stdio 依赖路径）。
5. 两仓 git 零写操作；UniMaker 全部为新增文件；主仓仅新增 2 文件（变体源+
   本文档）；apkdev 克隆内可改可编纪律内（源同步+产物目录）。
