# task_m4b_ohos_hap.md — SSM1 播放核编进鸿蒙 HAP，真机安装验证（M4 真机执行的解）

日期：2026-09-11。承 `task_m4_ohos_smoke.md`：ohos obj/exe/宿主协议四层已绿，唯真机 exec 被量产
SELinux 策略封死，解法定为「HAP 壳签名安装（native lib 随包）」。本任务落地该解。
设备：HUAWEI Mate 70 Pro+（HarmonyOS 6.1.0.135），serial `3KN0224C18003262`。
车头 `/private/tmp/cheng_w126_re`（sha256 `3ad3bc972ad7d82c…`，与 M1/M4 记录一致）。

UniMaker 仓**零修改零删除**：全部产物为新增文件（独立 hvigor 工程 `hongmeng/ssm1smoke/` +
两个脚本）；根 `build-profile.json5` 的 modules 列表不可改，故 ssm1smoke 做成**自带
build-profile 的独立 hvigor 工程**，签名材料复用工程现有调试证书（`default_hongmeng_*.p12/.p7b/.cer`）。
主仓本任务零源码改动。

---

## 1. 车道要点（UniMaker/hongmeng 只读勘察结论）

- **构建**：hvigor 6.23.5（`node /Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw.js
  assembleHap -p product=default -p buildMode=debug --no-daemon`，`release_hongmeng.sh` 先例）。
  工程级 `hvigor-config.json5.modelVersion` 必须与根 `oh-package.json5.modelVersion` 一致
  （5.0.0，下限 MINIMUM_MODEL_VERSION=5.0.0），缺一即 `00303024 PROJECT_STRUCTURE_AND_CONFIGURATION`。
- **签名**：`build-profile.json5 → app.signingConfigs[default]`，material 指向
  `~/.ohos/config/default_hongmeng_yfNrpLzB10wt3A-dlcAuA3YjN0lpj3kHnpyFDPXkhvw=.{cer,p7b,p12}`。
  p7b 实扫：`"type":"debug", "bundle-name":"com.example.unimaker"`, 绑定单台设备 UDID。
  即 bundleName 被调试 profile 钉死为 `com.example.unimaker`，新 HAP 必须沿用。
- **NAPI 先例**（`entry/src/main/cpp/`）：CMakeLists 里 IMPORTED 预编译 so
  （`add_library(chenglibp2p SHARED IMPORTED GLOBAL)`）+ NAPI 模块 C++ 注册
  （`napi_module{nm_modname}` + `__attribute__((constructor)) napi_module_register`）；
  ArkTS 侧 `oh-package.json5 dependencies "libxxx.so": "file:./types/libxxx"` + `import from 'libxxx.so'`。
  NAPI so 放 `src/main/jniLibs/arm64-v8a`；16KB 门 flags
  `-Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384`。
- **hdc 链**：`hdc -t <serial> install -r <hap>` + `hdc shell aa start -b com.example.unimaker -a <ability>`。
- **关键新知识（M4b 实测）**：hvigor 6.x **不再自动打包 `src/main/jniLibs/{abi}` 下的裸预编译 so**
  （clean 重建后 HAP 内仍无 libs/；hvigor 全树无 `jniLibs` 字样）。唯一已验证通道是
  externalNativeOptions 激活 native 任务链后经 CMake IMPORTED 依赖进包
  （entry 的 `libchenglibp2p.so` 即此路径，`release_hongmeng.sh` 的 HAP 内容校验为证）。

## 2. NAPI 装配（UniMaker 仓新增文件）

脚本 `hongmeng/scripts/ssm1_harmony_build.sh`（照 `build_cheng_libp2p_harmony.sh` 形态）：

1. M4 产物 hash 收据（复用前校验）：`ssm1_ohos_shim.o db29918f…`、`psb_ohos.o bc83e689…`、
   `psh_ohos.o 9ff8bff9…`、`dbg_ohos.o 5c6fef94…`。
2. 车头重编导出闭包 obj（源未改，未动 `.cheng-csg-core`）：
   `/private/tmp/cheng_w126_re system-link-exec --root <ohosdev克隆> --in
   src/tools/ssm1_tick_daemon_export.cheng --emit obj --target aarch64-linux-ohos`
   → `unresolved_symbol_count=0`，产物 sha256 `1eefa344d8a429cf…` **与 M4 记录逐位一致**（确定性复现）。
3. NAPI shim：`hongmeng/scripts/ssm1_napi_shim.c`（纯 C，无 libc++）。`ssm1Cmd(line): string`
   包装 `ssm1d_cmd(line, out, cap)`（out 为 64KB 静态缓冲，rc>0 返回应答，0 返回空串，
   <0 返回 `ssm1d_cmd error rc=N` 并 OH_LOG ERROR）；`napi_module nm_modname="ssm1napi"`
   + constructor 注册；每条命令 `OH_LOG_Print(LOG_APP, INFO, 0x0000, "SSM1",
   "cmd=%{public}s rc=%{public}d resp=%{public}s", …)` 打点。
4. DevEco clang-15 链 `libssm1napi.so`（34.6MB）：
   `-shared -fPIC -Wl,-Bsymbolic -Wl,--allow-multiple-definition -Wl,-z,defs
   -Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384 -lace_napi.z -lhilog_ndk.z -ldl -lm`，
   输入 = napi_shim.o + M4 shim.o + export obj + psb/psh/dbg obj。**-z defs 全闭合通过**。
5. 校验：LOAD align 全 0x4000（4/4 过 16KB 门）；`ssm1d_cmd` 已定义、
   `napi_module_register`/`OH_LOG_Print` 未定义面（ace/hilog stub 供给）；SONAME 正确。
   产物 sha256 `fd3dc7c364fa6b4f…`，落 `ssm1smoke/src/main/jniLibs/arm64-v8a/`。

HAP 模块 `hongmeng/ssm1smoke/`（独立工程，bundle `com.example.unimaker`，module `ssm1smoke`，
versionCode 1000001）：

- `src/main/cpp/CMakeLists.txt`：IMPORTED `ssm1napi` + 最小 `ssm1_stub.c` 链接（把预编译 so
  拽进包，entry 先例）；module build-profile 加 `externalNativeOptions { abiFilters: ["arm64-v8a"] }`。
- `ets/pages/Index.ets`：rawfile `huguangsheng.ssm1` → `getRawFileContentSync` → 应用沙箱
  `filesDir/huguangsheng.ssm1`（应用内 copy 装载，替代 hdc 直推沙箱）；按钮触发 + 启动 2s 后
  自动执行协议序列 `init <sandbox> 2000 / play / tick 0 / tick 500×3 / seek 12000 / tick 0 / quit`
  （同 M4 §4 序列）；逐条 `ssm1Cmd` + hilog；解析全部 STATE 行的 fetch 序列与
  `[0,1,2,3,20]` 比对，输出 `SSM1 SMOKE PASS/FAIL`。
- 依赖声明：`oh-package.json5 dependencies "libssm1napi.so": "file:./types/libssm1napi"`（d.ts）。

## 3. 构建签名过程（真实输出）

- 首次构建连续踩掉三个结构错：缺根 `oh-package.json5`（00308018 ENOENT）→ 补；
  根包缺 `modelVersion`（00303024 需升级）→ 补 5.0.0；`fs` 非 `@kit.CoreFileKit` 导出 →
  照 entry 先例改 `import { fileIo as fs }`。
- `assembleHap` **BUILD SUCCESSFUL in 7 s 17 ms**（含 `SignHap ... after 1 s 314 ms`）。
- 首包缺失 `libssm1napi.so`（jniLibs 不被 hvigor 6 自动打包，见 §1）→ externalNativeOptions
  方案后 HAP 内容实查：
  ```
  34448488  libs/arm64-v8a/libssm1napi.so     ← hvigor strip 后
      4480  libs/arm64-v8a/libssm1stub.so
  2955365   resources/rawfile/huguangsheng.ssm1
  ```
- 进包 so 复检：`ssm1d_cmd` 导出（T）、NEEDED 仅 `libace_napi.z.so / libhilog_ndk.z.so / libc.so`。
- 签名：无独立验证工具情况下以 `hdc install` 的签名校验为判（见 §4）。
- 产物：`ssm1smoke/build/default/outputs/default/ssm1smoke-default-signed.hap`。

## 4. 真机验证（设备断连，安装层未执行）

任务开始时设备在线（`hdc list targets` → `3KN0224C18003262`，并实测 `bm dump -n
com.example.unimaker` 返回「failed to get information」= 设备上该 bundle 未安装，全新安装无
versionCode 冲突）。准备 install 时设备已从 USB 消失：

```
$ hdc -t 3KN0224C18003262 install -r ssm1smoke-default-signed.hap
[Fail][E001005] Device not found or connected
$ hdc list targets
[Empty]
```

恢复尝试（全部真实执行）：`hdc kill -r` / `hdc kill && hdc start` 重启 hdc server、
间隔 30s/60s/120s/180s/240s/5min/5min 共 7 轮重探、`system_profiler SPUSBDataType` 两查均无
Huawei/Mate 设备 → **USB 物理层断连（设备被拔出或关机），非 hdc/驱动层、非 SELinux 策略层**。
累计等待约 25 分钟未恢复，按纪律如实 BLOCKED，未伪造任何 hilog 输出。

设备回连后一键复验（无需重编）：

```
HDC=.../openharmony/toolchains/hdc
$HDC -t 3KN0224C18003262 install -r \
  /Users/lbcheng/UniMaker/hongmeng/ssm1smoke/ssm1smoke/build/default/outputs/default/ssm1smoke-default-signed.hap
$HDC -t 3KN0224C18003262 shell aa start -b com.example.unimaker -a Ssm1Ability
$HDC -t 3KN0224C18003262 shell hilog | grep SSM1   # 断言 STATE fetch=0,1,2,3,20 与 SSM1 SMOKE PASS
```

页面加载 2s 后自动跑协议（无需触屏），也可点 `RUN SSM1 PROTOCOL` 按钮重跑；
资产由应用自身从 rawfile 拷入沙箱 `filesDir/huguangsheng.ssm1`（不依赖 hdc 推送沙箱路径）。

## 5. 分层判词

| 层 | 判定 | 证据 |
|---|---|---|
| 车头编 ohos obj | **通过** | RC=0，`unresolved_symbol_count=0`，sha256 与 M4 逐位一致（§2.2） |
| NAPI so 链接 | **通过** | -z defs 全闭合，16KB LOAD align 4/4，ssm1d_cmd 导出 + NAPI/hilog 导入面正确（§2.4-2.5） |
| HAP 构建 | **通过** | assembleHap BUILD SUCCESSFUL，libs/rawfile 内容实查（§3） |
| 签名（构建侧） | **通过** | SignHap 成功；产物 zip 尾部布局与真机装过的 ChengHy2TunVpn entry-default-signed.hap 同构（§3 末） |
| 安装 | **BLOCKED（设备物理断连）** | `hdc install` → `[Fail][E001005]`，USB 层无设备，25 分钟 7 轮重探未恢复（§4） |
| so 加载 / NAPI 调用 / 协议全中 | **未执行（依赖安装层）** | M4 宿主同链路协议已绿（task_m4 §5），设备侧断言待 §4 一键复验 |

## 6. BLOCKED 项与如实记录

1. **安装/加载/协议三层未上机（设备物理断连，非平台策略）**：与 M4 的「SELinux 拒 exec」性质
   不同——本次是 USB 设备消失（`[E001005]` + `system_profiler` 无 Huawei 设备）。签名 HAP 已就绪，
   设备回连后按 §4 三条命令即可完成闭环，无需重编。
2. **hvigor 6.x 不自动打包裸 jniLibs（新知识，非阻塞）**：已用 externalNativeOptions + CMake
   IMPORTED 先例通道解决（§1/§2）；纯预编译 so 的 HAP 接入应固定走此通道。
3. 主仓/UniMaker 既有文件零改动：UniMaker 侧全部为新增（`hongmeng/ssm1smoke/` 工程 19 文件 +
   `scripts/ssm1_harmony_build.sh` + `scripts/ssm1_napi_shim.c`）；主仓仅本任务文档。两仓 git 未动。

## §7 真机终验 PASS（2026-09-11，设备回连后实测）

首轮安装后 L3 撞真机沙箱怪癖：rawfile 读正常（2,955,365B），但 fileIo 对
el2 haps 沙箱三目录（files/cache/temp）openSync 一律 13900020 ENOTDIR
（mkdir 还报 EEXIST，互斥证据）。**根治=内存装载路径**，绕开文件系统：

- `ssm1_tick_daemon_export.cheng` 新增 `@exportc ssm1d_load(data, len,
  bufWindowMs, out, cap)`：逐字节入 BytesBuilder → ParseEx embedded →
  PlayerInit，一步 load+init（应答行带 src=memory）
- NAPI shim 新增 `ssm1LoadBytes(Uint8Array|ArrayBuffer, bufWindowMs)`
  （typedarray 判定失败时回退 arraybuffer——真机实测 typedarray 判定不中）
- ArkTS `runProtocol` 直传 rawfile 字节，不再落盘

真机 hilog 终验输出（AArch64 真机 3KN0224C18003262，HAP 内 NAPI so）：
```
load -> OK init chunks=45 durationMs=22500 bufWindowMs=2000 src=memory
STATE posMs=0    fetch=0  pre=0,1,2,3
STATE posMs=500  fetch=1  pre=1,2,3,4
STATE posMs=1000 fetch=2  pre=2,3,4,5
STATE posMs=1500 fetch=3  pre=3,4,5,6
OK seek posMs=12000 → STATE posMs=12000 fetch=20 pre=24,25,26,27
SSM1 SMOKE PASS fetch=[0,1,2,3,20]
```

**M4b 终判词：六层全绿**（obj/so/HAP 构建/签名安装/so 加载/NAPI 调用/协议
全中）。纯 Cheng SSM1 播放核在鸿蒙真机 HAP 内达成。
