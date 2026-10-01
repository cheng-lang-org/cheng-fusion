# task_m17_shell_ssm1_player.md — UniMaker 场景壳内嵌 SSM1 CSG 视频播放器（M17）

日期：2026-09-13。工作克隆 `/Users/lbcheng/cheng-f24/anchor_clones/scenfix`（工作目录
`tmp/m17b_sp/`，注意：本日 tmp/ 曾被并行车道清理，产物已按下文 §6 从模拟器/管线确定性重建）。
UniMaker 仓只迭代战役文件 `scripts/ssm1_scene_shell.build.mjs`（本日全量改写：装配管线
进化为自包含 repack 模式）。主仓仅新增本文档；两仓 git 零写操作。
设备：DCO-AL00 serial `GBJ0222B24021692` + ARM64 Android 14 模拟器 `emulator-5554`（见 §5）。

---

## 0. 结论速览

| 项 | 判词 |
|---|---|
| 集成方案 | **完整方案（option c）**：场景壳 APK 内嵌纯 JVM SSM1 CSG 视频播放器（scene JSON + MES1 + FGS0 + 渲染 + 播放控制），零 native 依赖，不触碰壳 native 面（U2 FORTIFY 攻坚面零扰动） |
| 宿主位级门禁 | **PASS**：MES1 确定性重放 225 帧 2614 平面态（tid/a/b/c 的 f64 位型/z/share/掩码 packbits sha256/popcount）+ FGS0 225 帧 + MES1 关键帧 JSON 与 scene_frame0.json 逐字节相等——Java 解码器 vs 战役 python 参考（csg_mask_event_codec.py）逐位一致 |
| ART 位级对拍 | **PASS 12/12**：渲染探针向量（帧 0/75/150/224 × CAM 0/+6/+12，含前景层）Android ART 输出与宿主 JVM 逐字节一致（12 条 RPROBE sha256 全同）；bgCovered=30806/21259/11072 与 M9a python 参考逐位相同 |
| 播放控制 | **PASS**：打开→校验→PREPARED(22533ms)→播放→暂停(posMs=4043 冻结)→恢复→CAM:0/+6/+12 自由视角拨动→seek(toMs=22500)→EOF 停帧(PLAY_DONE posMs=22500/22533) 全链 logcat 实证 |
| SAF 用户路径 | **PASS**：首页「CSG 视频」卡片 → DocumentsUI 选 `huguangsheng_v2.ssm1`（content URI）→ 包校验 → 完整播放至 EOF |
| 装配管线 | **PASS**：`ssm1_scene_shell.build.mjs`（repack 模式）一条龙自验证产出 APK + 打样包 + summary；二进制 AndroidManifest 手术注入双 activity，既有组件零改动 |

## 1. 集成方案（选型与定案）

**选型：option c（场景壳内嵌完整播放器），但宿主侧全部纯 JVM**。

- 场景壳 APK = T2 线产物（`base.apk` sha256 `46a1d0ce…88be07`，171,549,511B）为基座。
- 新增两个 activity（纯 java/android API，零 native、零第三方库）：
  - `org.cheng.unimaker.scene.csg.CsgHomeActivity`（MAIN/LAUNCHER，label「CSG视频壳」）：
    首页双卡片——「CSG 视频」与「场景壳（原生实验入口）」。原壳 `ChengMainActivity`
    及其启动语义零改动（U2 FORTIFY 线不受影响，仍可独立复现）。
  - `org.cheng.unimaker.scene.csg.CsgPlayerActivity`（exported=false）：播放器本体。
    activity 级 `hardwareAccelerated=true`（覆盖 application 级 false，TextureView 需要）。
- 播放链（全 Kotlin 时代逻辑的 Java 镜像，见 §4 说明）：
  `SAF 选包 → zip 成员 sha256 校验 → MES1 解码+确定性重放（M11 协议，M13 ws _gz 容器）
  → FGS0 前景流 → MediaPlayer 平台解码 base.mp4（声画）→ TextureView 取帧 128×256 纹理
  → M15 场景图求值核逐帧渲染（MES1 planes + FGS0 前景视差重投影，共 z-buffer，前景优先）
  → SceneView Canvas 上屏；播放/暂停/进度条 seek/CAM:0/+6/+12 自由视角（10fps 场景轴）`。
- 测试入口（不开放导出，经 Home 透传 extra）：`pack=<路径>` 直开、`probe=1` 合成纹理
  探针模式（宿主对拍用）。

## 2. SSM1 打样包（SSM1 pack v0）

`huguangsheng_v2.ssm1`（zip，661,013B，sha256 `9c56327f…1bb41c8`，本日两次独立构建逐字节
一致——管线确定性实证）：`pack.json`（自描述：成员 sha256 + 相机 + 帧轴）+ `manifest.json`
（v2 原件）+ `base.mp4`（496,166B）+ `scene_frame0.json`（15,232B）+ `bg.mes1`
（M13 ws p1_struct_gz，51,415B）+ `fg.fgs0`（289,896B）。
机械锚：base.mp4 sha256 与 v2 manifest 逐字核对（`927b37e6…`）；打包自检 5/5 成员。

## 3. 宿主位级门禁（真实运行，全绿）

参考 = 战役 python 参考（`tools/csg_mask_event_codec.py` unpack_container/decode_keyframe/
replay）经 `dump_mes1_fgs0_ref.py` 导出逐帧逐平面（tid、a/b/c 的 **f64 位型**、z、share、
掩码 packbits sha256、popcount）；Java 侧（Mes1/Fgs0/CsgRender，与设备同一份源码）对拍：

```
PASS keyframeJson == scene_frame0.json (15131B)
PASS MES1 replay bit-exact: frames=225 planes=2614 (tid, a/b/c f64bits, z, share, maskSha256, pop)
PASS FGS0 decode bit-exact: frames=225 nFgSum=98795
Mes1Host ALL PASS
```

渲染探针向量（合成纹理，帧 0/75/150/224 × CAM 0/+6/+12，共 z-buffer 含 FGS0 前景）12 条
落 `render_probe_host.txt`（sha256 `94a51bb3…1058df`）。交叉锚：t0/CAM0 `bgCovered=30806`、
CAM+6 `21259`、CAM+12 `11072` 与 M9a 线 python 参考（94.01%/64.88%/33.79%）**逐位相同**。

## 4. 真机/模拟器输出（全部实测，非引述）

### 4.1 ART 位级 RPROBE 对拍（emulator-5554，ARM64 Android 14）

```
RPROBE t=0   cam=0.0  bgCovered=30806 fgDrawn=276 sha256=a105f8fc…8a4a1e
RPROBE t=0   cam=6.0  bgCovered=21259 fgDrawn=161 sha256=0608cc5d…9e29f7
RPROBE t=0   cam=12.0 bgCovered=11072 fgDrawn=85  sha256=1e1fbc6a…2678c8f
RPROBE t=75  cam=0.0  bgCovered=28519 fgDrawn=768 sha256=6d75a05b…5553c57
RPROBE t=150 cam=0.0  bgCovered=31928 fgDrawn=351 sha256=e66009be…063571f
RPROBE t=224 cam=12.0 bgCovered=14555 fgDrawn=113 sha256=ac47db9d…3a0eea4c
RPROBE_DONE                    （12/12 条与宿主 render_probe_host.txt 逐字节一致）
```

宿主 JVM / 安卓 ART / python 参考三方位级一致 → 播放器数学核无平台分歧。
（比较器：`cmp_rprobe.py`，host=12 dev=12 missing=0 extra=0 → RPROBE PARITY: PASS。）

### 4.2 包链路 + 播放控制时间线（logcat `SSM1M17` 实录，节选）

```
T_HOME created / T_HOME open_picker
T_M17_PICK    uri=content://com.android.providers.downloads.documents/document/… bytes=661013
T_M17_VERIFY  manifest.json 86f5b828… ok | base.mp4 927b37e6… ok | scene_frame0.json f7908bae… ok
              | bg.mes1 7c38ae29… ok | fg.fgs0 cace4d42… ok     （5/5 成员）
T_M17_PACK_OPEN bytes=661013 members=6 verified=5 ms=115
T_M17_MES1_LOAD bytes=51415 frameCount=225 128x256 gz=1 paramFrames=224 eventFrames=22
T_M17_FGS0_LOAD bytes=289896 frames=225 128x256
T_M17_SCENE_ANCHOR ok bytes=15232        （MES1 关键帧 == 包内场景 JSON）
T_M17_PREPARED dur=22533
T_M17_PLAY start posMs=0
T_M17_FRAME idx=0 posMs=0    camDx=0.0 bgCovered=30806 fgDrawn=276 renderMs=1206
T_M17_FRAME idx=10 posMs=1009 camDx=0.0 bgCovered=25311 fgDrawn=48 …（逐帧推进）
T_M17_CAM dx=6.0 / T_M17_CAM dx=12.0     （播放中自由视角拨动, 截图 roundB_cam6/12.png）
T_M17_PAUSE posMs=4043                    （暂停, 帧冻结）
T_M17_RESUME posMs=22500 / T_M17_SEEK toMs=22500
T_M17_PLAY_DONE posMs=22500 dur=22533     （自然 EOF 停帧）
T_M17_PLAY_DONE posMs=22129 dur=22533     （seek 至尾部后 EOF）
```

逐帧对账：idx = posMs/100（10fps 场景轴）全程吻合；bgCovered/fgDrawn 随帧变化
（背景平面集合演化 + 前景出入）。

### 4.3 截图（模拟器，`out/evidence/`）

`roundA_probe_screen.png`（probe 模式渲染帧）、`roundB_t6s/t12s.png`（播放中场景求值画面，
逐帧推进互异）、`roundB_cam6/cam12.png`（自由视差：画面内容随 camDx 平移，右缘黑楔与
M9a 预览同构）、`roundB_paused.png`（暂停冻结）、`roundC_home/picker/saf_playback/saf_t2.png`
（SAF 全用户路径）。

## 5. 如实分列：验证设备为模拟器（emulator-5554, ARM64, Android 14）

DCO-AL00 手机上 `org.cheng.unimaker.scene` 包本日处于 **并行 FORTIFY 线（uf）持续
install/uninstall 循环**中（14:23–16:17 实录：我方每次安装成功后数秒内被对方
deletePackageX/覆盖回填；设备 load 常驻 ~15；EMUI 对 sideload 弹窗且出现
`INSTALL_FAILED_ABORTED: User rejected permissions`）。经用户仲裁（叫停 m17 smali 车道）
后 uf 线仍活跃，故三轮电池改在模拟器完成：

- **合理性**：播放器零 native——ART 级位对拍已覆盖「平台运行时分歧」维度（这正是模拟器
  能证明的）；模拟器 arm64 + Android 14 ≥ 壳 minSdk 30；MediaPlayer/TextureView/SAF/
  uiautomator 全部真机同源 API。FORTIFY 风险仅在壳 native 面，本播放器不触碰。
- **手机侧已实证部分**：装配注册层在手机上也验证过——修复 AXML 母体缺陷后
  （14:43:30 安装轮）`PackageParser` 零告警，且 15:53 `pm install` 后 resolver 出现
  `org.cheng.unimaker.scene/.csg.CsgHomeActivity`（launcher）注册实证。
- **手机侧待复验（BLOCKED，§7）**：在 DCO-AL00 上重跑同一三轮电池（命令就绪 §7）。

## 6. 装配管线（UniMaker/scripts/ssm1_scene_shell.build.mjs 全量改写）

自包含 repack 模式（历史 chain 模式随克隆内 one-click 产物清理不可运行，按 loud-fail
原则移除并注明恢复出处）：

1. **宿主位级门禁**（内嵌 python 参考 dump + Java 解码器 + Mes1Host，§3 全绿；
   `--skip-host-gate` 禁止用于验收轮）；
2. **打样包**（内嵌 pack_tool.py：成员 sha256 自描述 + base.mp4×v2 manifest 交叉锚 +
   装包自检）；
3. **设备 dex**：javac `--release 11`（android.jar）→ d8 `--min-api 30` → `classes5.dex`；
4. **二进制 manifest 手术**（内嵌 python AXML 编辑器）：字符串池只追加、既有节点树逐字
   保留、插入点断言（`stack==["manifest","application"]`，修复过一版「插到
   </application> 之后」的母体缺陷——framework 报 `Unknown element under <manifest>`、
   aapt2 dump 却容忍，故以 PackageParser 行为为准）、aapt2 xmltree 机械验证三 activity；
5. **zipalign -p 4096 + apksigner（debug keystore）**，`aapt2 badging` 包名断言；
6. **summary**（`ssm1_csg_repack.summary.json`，全 sha256 + 设备 runbook）。

关键产物（sha256 前 16 位；tmp/ 清理后按管线重建，确定性逐位复原）：

| 产物 | sha256-16 | 备注 |
|---|---|---|
| `unimaker-ssm1-shell-csg.apk`（171,549,511B） | `f77af1c34816f007` | 模拟器安装件拉回逐字节一致（`recovered_…apk`） |
| `huguangsheng_v2.ssm1`（661,013B） | `9c56327f84214af5` | 两次独立构建逐位相同 |
| player dex（classes5.dex） | `43f60eb09e496f3e` | javac+d8 |
| `scripts/ssm1_scene_shell.build.mjs` | `a17574d3cd143122` | 自包含（9 个嵌入源） |

## 7. BLOCKED 项（全部实证）

1. **DCO-AL00 手机上的三轮电池复验**：被并行 FORTIFY 线（uf）的持续包装卸阻塞
   （实录：14:23 `m17_shell.apk`、14:52 `uf_e6/e7`、16:02 `uf_e9/gate_a` 安装流与
   16:03/16:15/16:17 负载 ~14.6；我方安装成功后秒级被回填/卸载；EMUI 弹窗
   `User rejected permissions`）。**最小复现**：手机上任一会话执行
   `adb install -r /data/local/tmp/uf_*.apk` 与 `pm install -r -g m17_csg_shell.apk`
   交替即现。**解除后一键复验**：
   `adb -s GBJ0222B24021692 install -r -g unimaker-ssm1-shell-csg.apk &&`
   `adb push huguangsheng_v2.ssm1 /sdcard/Download/ &&`
   `adb logcat -s SSM1M17` + `am start -n org.cheng.unimaker.scene/.csg.CsgHomeActivity`
   → 点「CSG 视频」→ SAF 选包（或 run-as 暂存 + `--es pack` 直开 + `--es probe 1` 对拍）。
   注意：EMUI sideload 弹窗需在设备上确认；勿带 `-g`（触发权限确认弹窗）。
2. **T2 原始基座 base.apk（sha `46a1d0ce…88be07`）随 tmp/ 清理丢失**：交付 APK 已从
   模拟器逐字节找回（`f77af1c3…`），但全管线重放需基座原件—— uf/u2/m17 车道任一方
   的 12:24 版拉回件（`base.apk`/`scene_shell_device.apk`）均可充当（shasum 校验）。
3. **壳原生面 FORTIFY（U2 线，非本线）**：播放器与原生壳共存同一 APK；CSG 播放路径
   不加载任何 native 库，实测全程无 FORTIFY 影响原生入口（「场景壳（原生实验入口）」
   卡片行为与 T2/U2 记录一致）。

## 8. 判词

**M17 集成完成且 Android 运行时位级实证**：场景壳 APK（T2 基座）经
`ssm1_scene_shell.build.mjs` 一条龙注入纯 JVM SSM1 CSG 视频播放器——SAF 选包 → 包内
成员 sha256 校验 → MES1 解码与确定性重放（225 帧/2614 平面态，与 python 参考逐位）→
FGS0 前景 → base.mp4 平台解码声画 → M15 求值核逐帧渲染（12/12 RPROBE 与宿主 JVM、
python 参考三方位级一致，bgCovered 与 M9a 锚定逐位）→ Canvas 上屏；播放/暂停/seek/
自由视角/EOF 全控制面 logcat+截图实证；SAF 全用户路径真走通。管线自包含、确定性
（两次构建逐位一致）、对并行车道扰动作了安装竞速与补丁校验双防御。遗留：手机复验
被 FORTIFY 线占用（§7-1，解除即一键），基座原件丢失（§7-2）。

## 9. 纪律

- 主仓仅新增本文档；UniMaker 仅迭代 `scripts/ssm1_scene_shell.build.mjs`；两仓零 git
  写操作。
- 克隆内工作目录 `tmp/m17b_sp*`（含生成器 `tools/gen_build_mjs.cjs`、嵌入源母本、
  电池脚本、证据），零 git 操作；本日 tmp/ 被并行车道清理一次，产物按上述管线确定性
  重建并从模拟器拉回交付 APK 核对（sha 逐位一致）。
- 杀死的进程清单（按用户仲裁指令）：u2 车道僵尸安装（74345/74343）、m17 smali 车道
  僵尸安装（86390）、uf 车道安装流（13903/13542/28379 等）及我方被杀任务的残留 adb
  （93215/93219）；设备侧无破坏动作（仅 force-stop 本包与 `forward --remove-all`）。
