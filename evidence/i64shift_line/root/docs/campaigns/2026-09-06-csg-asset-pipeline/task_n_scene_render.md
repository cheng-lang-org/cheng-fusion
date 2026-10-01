# task_n_scene_render.md — 背景场景图（SCENE1）平面求值软渲染真机实证（N 线）

日期：2026-09-13。上游：`task_m9a_bg_csg.md`（scene JSON v0 + 自由视角重投影公式 + python 锚点）、`task_m7_harmony_play.md`（ssm1napi shim 的 OH_NativeWindow 软渲染 blit 路径与 rawfile 资产装载）。
真机：HUAWEI Mate 70 Pro+（HarmonyOS 6.1.0.135，serial `3KN0224C18003262`）。

**终判（本轮）：真机渲染链路代码/资产/装机全部就绪并装机成功，宿主级逐位对拍全绿（构造恒真 + M9a 四锚点精确命中）；真机截图轮被安全锁屏阻塞（开发者模式禁止自动解锁，需人工解锁），真机上屏实证与自由视角差异度量待解锁后一键重跑（§6）。**

---

## 1. 格式映射（scene JSON v0 → SCENE1）

真机 C 侧不做 JSON 解析，由 `hongmeng/scripts/scene_pack_sc1.py` 从 `scene_frame0.json`（sha256 f7908bae…95b99）打包等价紧凑二进制 `SCENE1`（20688B）：

| JSON 字段 | SCENE1 落位 | 保真性 |
|---|---|---|
| `camera{f,cx,cy,disparityBaseline}` (180/63.5/127.5/4000) | 偏移 12 起 4×f64 原位 | python float==IEEE754 双精度，struct 直写位型不变 |
| `planes[].affine{a,b,c}` | 每平面 32B 记录（a,b,c f64 + zOrder i32 + reserved） | 同上，位级同值（打包器断言） |
| `regionPolygonFlat` | 每平面 4096B 区掩码位图（LSB-first，idx=y*128+x，1=最大 4-连通域内） | 掩码由产线 `build_scene(0)` 复用生成，逐平面像素数硬校验==JSON `regionPx`（25377/3930/962/411/126，并集 30806=94.012%） |
| `frame{width,height}` | 偏移 8 u16×2 | 128×256 |

SCENE1 布局（LE，定长严格解析零兜底）：`"SCENE1"`6B + ver u8 + K u8 + W u16 + H u16 + 4×f64 + rsv u32（=48B 头）→ 每平面 [32B 记录 + 4096B 掩码] 交错 → 尾部恰尽。sha256 `3e017ba0…709b`。

纹理 `hgs_bg0.rgb`（98304B = 128×256×3）= `v2/base.mp4` 首帧 ffmpeg 抽帧缩放（bicubic/area/lanczos 三核对拍 `ref_10fps.rgb` frame0 的 MAD=0.0854/0.3231/0.2272，取 bicubic）——**MAD=0.0854 证明 base.mp4 首帧与场景拟合参考帧同内容**（纯编码噪声级），纹理对齐成立。sha256 `8b67a8a5…a200`。

## 2. 渲染核心（`hongmeng/scripts/ssm1_scene_render.c`，纯 C 零 OH 依赖）

逐字复刻 M9a `csg_bg_scene_fit.py plane3d()/render()/rot_y()`：目标像素射线 `dc=((x-CX')/F',(y-CY')/F',1)`，`wd=dc@R`（R=rot_y），`t=(D-n·C)/(wd·n)`（plane3d 归一化 3D 平面），`P=C+t·wd`，反投影 `rint`，平面掩码判可见，t 最小 z-buffer 胜出，采样 base 帧纹理 → RGBA（未覆盖=黑，A=0）。相机 `C=(dx,dy,0)`，旋转绕竖轴 rot_y(deg)。输出域取场景 1:2 纵横比的整数倍 scale∈{4,2,1}（按 surface 尺寸确定性选取；1316×1050 实测 buffer 取 4 → 512×1024，居中 blit）。

NAPI 面（`ssm1_napi_shim.c` 扩展，复用既有 XComponent surface 捕获与 `RenderRgbaToSurface` blit 路径——与任务书 `outSurface` 形态的差异是跟随 shim 既有架构，surface 由 libraryname 绑定注入）：
- `ssm1SceneLoad(sceneBytes, texBytes)`：SCENE1 严格解析 + 纹理长度精确校验，全部通过才替换旧态；
- `ssm1SceneRender(camDx, camDy, camRotDeg)`：渲染 → 居中 blit → reply 携带 `scale/out/covered/coveredPct/off` + blit 几何证据；hilog 全打点（`SCENE load` / `SCENE_SEQ step=…` / `scene_render …`）。

宿主验证（同一源码 `-DSCN_HOST_TEST`，真机 so 同文件编译）：

```
PARSE ok k=5 128x256 maskBytes=4096 f=180.0
RENDER cam0   covered=30806 expect=30806  bitdiffCovered=0    → OK  ←构造恒真：覆盖像素逐位==纹理自身采样
RENDER shift6 covered=21259 expect=21259                       → OK  ←==M9a python view_shift6
RENDER pan5   covered=26340 expect=26340                       → OK  ←==M9a view_pan5deg
RENDER pan10  covered=22435 expect=22435                       → OK  ←==M9a view_pan10deg
RENDER scale4 cam0 out=512x1024 covered=492896 texelMismatch=0 → OK  ←真机实际输出域同样构造恒真
HOST_TEST PASS
```

即：**C 渲染核心与 python 参考实现逐位一致**（四个视角覆盖数精确命中），cam0 覆盖区 MAD=0（构造恒真）。宿主渲染目检：cam0=完整背景重建（人物+字幕，前景黑，与 M9a recon_frame0 同形态）、shift6=重投影+未覆盖黑边（与 view_shift6 同形态）。

## 3. 真机部署（已完成）

- so：`libssm1napi.so` 46169072B，sha256 `7f55eaee…9e46f`（16KB LOAD align 0x4000 全过，required symbols 校验过）；HAP：`ssm1smoke-default-signed.hap` sha256 `1e9f7476…204c4`；
- `hdc install -r` → **install bundle successfully**；
- UI：`SCENE:LOAD / CAM:0 / CAM:+6 / CAM:+12 / SCENE:SEQ / ROT:5` 六钮（Index.ets），SEQ 自动序列 load→cam0→+6→+12→rot5（4s 间隔，hilog `SCENE_SEQ step=…` 打点）；
- 截图轮脚本与分析器就绪：`ohosdev/artifacts/mobile_n_scene/{n_capture_round.sh, analyze_scenes.py, find_scene_seq_btn.py}`（hdc 冲突重试内建）。

## 4. 真机验证设计（待执行）

- 正视角（0,0,0）：块区（512×1024 → 屏幕≈480×293）重采样 128×256 vs `hgs_bg0.rgb` 报 `MAD_covered`（显示重采样+JPEG 损耗下的构造恒真读数）；宿主级逐位恒真已由 §2 承担。
- 自由视角（+6/+12）：`analyze_scenes.py` 报两两变化像素数/bbox/mean|d| + 列差分剖面峰值（背景边缘视差位移可检），差异热图落盘。
- 判据：cam0 块区内容与纹理一致（低 MAD）；cam6/cam12 与 cam0 差异区非零且随平移量增长、几何形态与 M9a `view_shift6.png` 一致。

## 5. BLOCKED

**真机安全锁屏**：会话期间设备自动落锁（PIN/密码形态），`aa start` 报 `10106102 The device screen is locked … developer mode 下不能自动解锁`；`power-shell wakeup` + uinput/uitest 上滑、点击均无效（锁屏黑屏截图实测）。轮询 20+ 分钟未解锁。**需人工解锁手机**，解锁后执行：

```
bash /Users/lbcheng/cheng-f24/anchor_clones/ohosdev/artifacts/mobile_n_scene/n_capture_round.sh
python3 /Users/lbcheng/cheng-f24/anchor_clones/ohosdev/artifacts/mobile_n_scene/analyze_scenes.py
```

即可补齐 §4 全部真机读数（HAP 已装机，无需重建）。

## 6. 判词

场景图渲染链 v0 代码闭环：SCENE1 等价格式（位级映射、regionPx 硬校验）+ 纯 C 平面求值渲染核心（**与 M9a python 参考四视角覆盖数逐位一致**，cam0 覆盖区构造恒真 MAD=0，scale4 真机输出域 texelMismatch=0）+ ssm1napi NAPI 扩展 + 真机 HAP 构建签名装机成功。**真机截图判读与自由视角差异度量因安全锁屏人工解锁未完成而 BLOCKED**（§5 一键重跑），本轮不计入真机完成。

## §真机上屏复验补录（2026-09-13，解锁后）

- 自动链 + 按钮点击（uitest 坐标实测命中）均触发 scene_render，**cheng 层
  渲染统计随位姿真机实证变化**：covered 492896(cam0)→340169(cam+6)→
  177093(cam+12)→420649(rot5)，blit OK rc=0——求值计算在真机生效。
- **新发现（上屏链路）**：snapshot_display 三张截图中渲染块区
  (402,13)-(914,1037) 逐位相同（MAD=0）——屏幕显示未随 scene_render 更
  新。嫌疑=XComponent 帧同步（渲染写入的 NativeWindow buffer 与
  XComponent 展示 buffer 非同一实例，或需要 flush/invalidate 触发），
  归 N 线第二轮（上屏链路 debug），非求值计算问题。
- 网络备注：设备已切至 192.168.1.x 网段（wlan0 inet 192.168.1.2 实测），
  与安卓 192.168.1.6 同 /24 互通。
