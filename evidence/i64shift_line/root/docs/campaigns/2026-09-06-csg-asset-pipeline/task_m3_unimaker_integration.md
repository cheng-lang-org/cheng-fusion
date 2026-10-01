# task_m3_unimaker_integration.md — SSM1 本地播放核集成进 UniMaker 场景壳（M3）

日期：2026-09-11。设备：华为 DCO-AL00，serial `GBJ0222B24021692`（HarmonyOS/Android 12 adb 兼容层）。
编译工作区：`/Users/lbcheng/cheng-f24/anchor_clones/apkdev`（streamdev 的 `cp -cR` 克隆，未动 streamdev 本体）。
冻结 C 车头：`/private/tmp/cheng_w126_re`（sha256 `3ad3bc972ad7d82c…`，M1 同款）。
两仓纪律：主仓仅新增 `src/tools/ssm1_unimaker_provider.cheng` + 本文档；UniMaker 仓仅新增
`scripts/ssm1_scene_shell.build.mjs`（+ 失败 run 的 evidence 目录）；两仓零 commit、零既有文件修改。

---

## 1. 场景壳装配机制（读 apk-build + 源码盘点结论）

`ts-csg/scripts/unimaker-apk-build.mjs`（4133 行）一条龙：

1. **输入**：`--one-click-out-dir`（unimaker-one-click.mjs 产物：`unimaker-react.scene-runtime.cheng`
   场景源 + `runtime/unimaker_scene_data.bin` + glyph SDF 像素 + computer-use manifest + media assets）。
2. **scene .so**：`cheng system-link-exec --emit:obj --target:aarch64-linux-android` 编场景源 →
   NDK `ld.lld -shared -z now --allow-shlib-undefined` 链 `libcheng_unimaker_scene.so` →
   `patchelf --add-needed libcheng_scene_runtime_provider.so`（**双分配器约束：provider 依赖 +
   BIND_NOW**，见 L148-150 注释原文 "two allocators in one process crash the render thread"）。
3. **scene runtime provider**：编 `program_support_backend.cheng`，导出根
   `ANDROID_SCENE_RUNTIME_PROVIDER_ROOTS`（cheng_malloc/free/mem_* / file bridges / 原子量 /
   driver_c_new_string 等纯 Cheng 原语），`-Bsymbolic -z now`。
4. **壳工程**：mobile-shell 工具（`mobile_shell_android_tool_main.cheng` 编出）`build-probe
   --android-native-mode prebuilt` 生成 Kotlin Activity（全屏 SurfaceView）+ 手写 C 宿主
   `cheng_generated_android_host.c` + gradle 工程 → `gradle :app:assembleDebug` 产 app-debug.apk。
5. **host provider relink**：编 psb/cp/host_runtime 三个 obj（bridge/cp 走 objcopy localize）重打
   `libcheng_generated_android_host.so`；MoQ publisher `.so`（独立 Bsymbolic + version script）。
6. **social overlay**：ChengLibp2pNative.kt + 编 `unimaker_android_social_group_backend.cheng` 为
   `libchenglibp2p.so`（**链接挂 `-l:libcheng_scene_runtime_provider.so -l:libcheng_generated_android_host.so`
   `-Wl,-z,defs`，DT_NEEDED 双依赖 = 新 .so 接线先例**），再跑一次 gradle 重打包。
7. **验包**：verifyApkPayloads 逐 entry 校 dynsym；headless-capture 可执行物从 APK 抽 .so 平铺链接。
   装后：`adb install -r -g` → `cmd package resolve-activity` → `am start` → 点击烟测 + 截图 +
   `logcat -s ChengMobile ChengSurfaceView`（run_pure_gui_prod_closedloop.sh 模式）。

**本战役接线结论：SSM1 provider 不需要子进程/不需要 UI**，按 social backend 同形态做成独立
`.so` + DT_NEEDED 挂 provider 即为最小面；provider 需要的导出根是 apk-build 默认根的**超集**
（+`cheng_file_handle_read_all_bridge`，SSM1 manifest 读包需要；apk-build 现成的
`--scene-runtime-provider-so` 预制入口可无损接入，无需改 apk-build）。

## 2. 导出面（主仓新增 `src/tools/ssm1_unimaker_provider.cheng`）

风格逐条对齐既有先例（`unimaker_android_social_group_backend.cheng` 的 @exportc/cstring/int64 句柄、
`unimaker_compat_ffi.cheng` 的 strdup+free 字符串所有权对）：

```
ssm1_open(path: cstring) -> int64   # 载包 + PlayerInit(bufWindow=2000) + 立即 play; 失败回 0; handle=槽位+1
ssm1_tick(h: int64, dtMs: int32) -> cstring   # daemon 同款 STATE 行; 错误回 "ERR <原因>"
ssm1_seek(h: int64, targetMs: int32) -> cstring # 关键帧吸附; "OK seek posMs=N" / "ERR seek_out_of_range"
ssm1_close(h: int64) -> int32       # 0=ok, 1=invalid_handle
ssm1_string_free(p: void*)          # 消费方释放返回串(libc heap; 先例 libp2p_string_free)
```

所有权：`strToCStringTemp` 的 cheng-heap 临时串 strdup 成 libc 串返回后**立即 cheng_free 归还**
（分配器对称，高频 tick 零泄漏零跨分配器 free）。状态：模块级 var 定长槽表（4 槽；场景壳
scene-runtime .so 同为 obj emit + 模块级 var，先例充分）；链接纪律 `-Bsymbolic` + version script
（除 ssm1_* 五导出全 local，`cheng_global_*` 槽不跨 .so 抢占）。

## 3. 装配脚本（UniMaker 新增 `scripts/ssm1_scene_shell.build.mjs`）

四步编排（复用/调用 unimaker-apk-build.mjs，不修改它）：
①克隆内编**超集导出根**的 `libcheng_scene_runtime_provider.so`（经 `--scene-runtime-provider-so` 交 apk-build）；
②编 `ssm1_unimaker_provider.cheng` → `libssm1_unimaker_provider.so`（`-Bsymbolic -z now -z defs
-z max-page-size=16384` + version script + DT_NEEDED provider，`-z defs` 链接期即证无游离符号）；
③调 unimaker-apk-build.mjs（`--keep-build-tree`）→ ssm1 .so 落 jniLibs → gradle 重打包 →
`unimaker-ssm1-shell.apk`；④产真机 dlopen 探针。产物 sha256 落 `<out>/ssm1_scene_shell.summary.json`。

运行要点（全部实测踩定）：apk-build 必须在**克隆内**跑（driver 包根=`--root`，`cheng_cold` 拒包根外
源路径，one-click 产物须复制进 `<clone>/src/` 下）；`--cheng` 用 backend_driver/cheng 或
w126_re（见 §5 墙）；`CHENG_ALLOW_UNVERIFIED_RSS_GUARD=1` 免 chengSmokeEnv 的 RSS 探针
（backend_driver/cheng 7/16 版早于该探针合同）；mobile-shell 工具用冻结车头预编后经
`--mobile-shell-tool` 注入。

## 4. 产物与真机验证（真实输出）

产物（sha256 前 16 位）：
- `libssm1_unimaker_provider_bridged.so` `d706b3ee4d60ae5a`（ssm1 provider .so；DT_NEEDED=
  provider+host，BIND_NOW，exports 恰 ssm1_open/tick/seek/close/string_free，无 TLS 段）
- `libcheng_scene_runtime_provider_bridged.so` `27b81a32d9fbf4dd`（超集根 provider，M1 stdio 桥内联）
- `host_w126/libcheng_generated_android_host.so` `de4f473a942c9f19`（w126_re-era host：
  hr.o + cp_local.o + linux_intrinsics.o + moq host_bridge.c）
- `device/ssm1_provider_android_static6` `ec5cdf8e39935ff5`（静态验证 exe，M1 fakeNDK+TLS 链）
- 数据包：`artifacts/csg_asset_pipeline/huguangsheng/pack/stream.ssm1` `c11e2997bbe7039a`（45 chunks）

**真机 L2 — .so 加载层 PASS**（`/data/local/tmp` 三 .so + 动态探针）：
```
$ LD_LIBRARY_PATH=/data/local/tmp ./cheng_ssm1_provider_probe \
    /data/local/tmp/libssm1_unimaker_provider.so /data/local/tmp/huguangsheng.ssm1
PASS dlopen
PASS dlsym ssm1_open tick seek string_free close
```
（dlopen 经 DT_NEEDED 自动拉起 provider；provider 的 cheng_malloc/free 分配器同进程单例实测：
prim_probe STEP2 malloc=0xb40000703260a008、STEP3 free ok。）

**真机 L3 — C ABI 调用层 PASS（静态链路，M1 同款配置）**：
```
$ /data/local/tmp/cheng_ssm1_provider_static6
PASS open handle=1
STATE posMs=0 playing=1 rate=10 eof=0 fetch=0 bufferedTo=2000 pre=0,1,2,3
STATE posMs=500 playing=1 rate=10 eof=0 fetch=1 bufferedTo=2500 pre=1,2,3,4
STATE posMs=1000 playing=1 rate=10 eof=0 fetch=2 bufferedTo=3000 pre=2,3,4,5
STATE posMs=1500 playing=1 rate=10 eof=0 fetch=3 bufferedTo=3500 pre=3,4,5,6
OK seek posMs=12000
STATE posMs=12000 playing=1 rate=10 eof=0 fetch=20 bufferedTo=14000 pre=24,25,26,27
PASS close rc=0
PASS reopen handle=1 close=0
STATE posMs=300 playing=1 rate=10 eof=0 fetch=0 bufferedTo=2300 pre=0,1,2,3,4
PASS third handle=1 tick300 close=0
DEVICE_RC=0
```
与 M1 daemon 参考序列逐字段一致（fetch 0→1→2→3、seek 12000 吸附 chunk 20、pre=24,25,26,27）。
宿主侧（macOS）同源探针输出亦逐行一致。口径注意：bionic stdout 全缓冲且该运行时退出不冲刷，
逐行打印必须显式 `C_fflush`（M1 DaemonEmit 即如此；本轮探针初版漏 flush 造成"假静默"假象，
已定位并修复——不是写入失败）。

## 5. 分层判词

| 层 | 判词 | 证据 |
|---|---|---|
| L-1 导出面 + 播放核逻辑 | **PASS** | 宿主探针 + 真机静态探针 STATE 行与 M1 daemon 逐字段一致；真包 45 chunks |
| L2 .so 在安卓进程可加载 | **PASS（机制层）** | 真机 dlopen/dlsym PASS；DT_NEEDED 链自动拉起；分配器单例 malloc/free 实测 |
| L2.5 .so 形态内全调用链 | **BLOCKED（独立开放项）** | ssm1_open 在三 .so 分体下静默 exit(1)（§6-E）；静态单体重复同一调用全 PASS |
| L1 APK 装载（org.cheng.unimaker.scene 新壳） | **BLOCKED（上游）** | 基座壳重建撞 §6-A~D 四道墙，逐墙有命令输出 |
| L4 UI 可见/点击烟测 | **本轮未达** | 依赖 L1 |

## 6. BLOCKED 项（全部实证，非推测）

- **A. 8/26 存量场景源 × 现役编译器借用合同**：`unimaker-react.scene-runtime.cheng`（20260826 产物）
  在 bootstrap/cheng.stage3(8/31) 与 w126_re(9/7) 下报
  `borrowed actual cannot bind non-var non-@borrows formal`（__chtJsonOf_*/__csg_scene_* 等
  生成 helper 家族，违规点跨 std/json——8/26 版 `NewJString` 无 @borrows，现行版已有）。
  机械注解不可收敛（注解后借出性级联到下一层调用方，三种违规类轮换出现）。
- **B. backend_driver/cheng(7/16, a979322b) 零值初始化禁令**：对场景闭包的
  `web_scene_media_block_cache.cheng` 等 runtime 文件报
  `[cheng_seed] redundant explicit default init`（该文件 8/27 起自带 12 处零值初始化，8/30 commit
  同样带）。8/30 dapanyouxuan 成功包的闭包不含这些文件（其场景不 import blockcache），
  UniMaker 场景闭包必含 → 该 driver 对 UniMaker 场景闭包**无解**。
- **C. 现行 React 树再生一-click 硬失败（上游漂移）**：现行 materializer 对
  `app/components/EcomFeedPage.tsx:112 shape=jsx-drop-map` 直接 throw（8/26 同形态可过）；
  `--allow-dropped-shape:*` 放行后又在事实发射期涌出 ~9911 条 `type.any` 诊断后进程静默死亡
  （12GB heap 后不再死，转 D）。
- **D. glyph-sdf-precompute 工具静默构建失败**：one-click 的
  `unimaker-react.scene-glyph-sdf-precompute` exe 在 w126_re 与默认 stage3 下均无输出 rc=1
  （link.log 0 字节、receipt 空、源文件被 one-click 清理后无法复现），1-route 最小场景同样命中。
- **E. .so 分体的运行时初始化合同（M3 独立开放项）**：三 .so（ssm1+provider+host）链
  dlopen/dlsym/分配器全通，但 `ssm1_open` 内文件打开静默 exit(1)；同一逻辑在静态单体
  （M1 fakeNDK+stdio 桥+TLS 补丁链）全绿。疑为静态 exe 启动代码执行的模块级初始化在 .so 分体
  无调用方（文件句柄注册表/锁初始化）；需按壳真实 app-init 序列接线后复核，禁止 C 补丁冒充。
- **复现脚本**：`UniMaker/scripts/ssm1_scene_shell.build.mjs`（阶段①②与全部校验已绿；
  阶段③卡 §5 L1）。上游解阻后（A/B/C/D 任一修复路径）该脚本即产 `unimaker-ssm1-shell.apk`
  走完 L1/L4。

## 7. 关键过程发现（防再踩）

1. `cheng_cold` 拒绝包根外与 `<root>/src/` 外的入口源（one-click 产物必须落 `<root>/src/` 下；
   8/30 dapanyouxuan 即放 `cheng-lang/src/.tmp-exec/`）。
2. driver 对子进程（clang wrapper）**清洗环境变量**——fakeNDK wrapper 的 PREPEND_OBJ/INJECT_FLAGS
   环境注入失效，须把注入**硬编码进 wrapper**；wrapper 的 argv 日志只记**入站**（prepend 前），
   判定注入生效要看出站日志或直接 nm 产物。
3. driver 的 exe 链接结果按**语义哈希**缓存：注释级 cache-bust 无效，须真实代码变更。
4. bionic stdout 全缓冲且 Cheng 运行时退出路径不冲刷：设备侧逐行输出必须显式 C_fflush
   （假静默≠写入失败，rc=0 的静默成功先查 flush）。
5. `unimaker-one-click.mjs` 支持 `--mobile-scene-route <id>:<tsx>:<Component>` 显式路由
   （绕开 47 路由目录做最小壳的入口已探明，本轮同样卡 D）。
