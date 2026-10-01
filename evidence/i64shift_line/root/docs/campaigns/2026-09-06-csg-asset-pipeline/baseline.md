# CSG 资产管线基线（A1）

冻结日 2026-09-06。本文只记实测事实；每项标注 已测/不支持/阻塞。

## 1. 编译与运行环境（已测）

- 机器：darwin 25.5.0 arm64。磁盘 34Gi 可用（克隆治理纪律生效中）。
- 主仓：`/Users/lbcheng/cheng-lang`，HEAD `759062096`，工作区含多线未提交改动（compiler_csg/parser/exact_def 等由并行会话活跃编辑，20:43 仍有写入）。
- 本线冻结克隆：`/Users/lbcheng/cheng-f24/anchor_clones/csgasset`（HEAD 态 `git reset --hard`，隔离原子树锁；本线唯一编译工作区）。

## 2. 编译工具链配方（已测，本线开发/验证环）

```bash
C=/Users/lbcheng/cheng-f24/anchor_clones/csgasset
cd $C && env -u CHENG_ROOT -u CHENG_PKG_ROOTS -u CHENG_PKG_HOME -u CHENG_GUI_ROOT -u CHENG_IDE_ROOT \
  $C/cheng system-link-exec --root:$C --in:$C/src/tests/<f>.cheng --emit:exe \
  --link-providers --target:arm64-apple-darwin --out:$C/artifacts/csg_asset_pipeline/<f>.exe
```

- 座驾 `./cheng`（sha256 前16 a979322bfe90f691）= 2026-09-05 fishing A1 全绿同一座驾。
- `CHENG_ROOT` 等全局环境变量必须 unset：cold source snapshot 以 cwd 作包根做前缀校验，克隆内不 unset 即死（最小复现：克隆内带 env 跑金丝雀 → `cold source snapshot source path leaves package root`）。
- `--link-providers` 需要桥接面 stage root `artifacts/backend_driver/bridge_surface_source/<包名>/`；克隆包名 `csgasset` 的镜像须从 `cheng-lang/` 镜像补齐（已做，5959 文件）。
- 入口源文件必须在包根 `src/` 下（模块身份推导），且用绝对路径 `--in:`。
- 单次编译 ~60–90s（自宿主现烤编译器），IO 全程独占原子树锁，禁止与其他线并行共用目录。

## 3. 语言子集实测矩阵（座驾 a979，已测 2026-09-06）

GREEN：const 块、let-str 字面量、let-调用结果、`var x:T`+赋值、`var x = <int 字面量>`、assert(两参)、fn 常量、seq add/for、`@borrows` str 形参、`Fmt"{str变量}"`、strings/strutils/os/cmdline 导入。

RED（禁用形态，最小复现 `src/tests/zz_asset_probe/`）：
- `let x = <int 字面量>`、`let a: int64 = <字面量>`、`var b: bytes`（无初始化声明）→ 编译器 SIGILL 静默（crc=132）。规避：int 用 `var`；bytes 用 `let x = os.ReadFile(...)`。
- `Fmt"{1}"`（整型参数插值）→ 需要桥接面 provider；镜像补齐后待复测，稳妥形态用 `strings.IntToStr` 先转 str。
- 空体 `fn main(): int32 = return 0` 编译产物运行 SIGILL（本座驾特有；185MB 生产驱动金丝雀为绿 run_rc=0）。

生产驱动 `artifacts/backend_driver/cheng`（0e7ca635ce10c845，9/2）：金丝雀绿；HEAD 自宿主对 const 块红（parser-owned global coverage mismatch parser=N metadata=0）、let+assert 红（ingress BodyIR ownership invalid）、`var s: str = call()` 红（prebound statement root has no role）。根因=parser-owned-global 迁移在飞（并行会话 19:05–20:43 活跃编辑 compiler_csg/parser），归属编译器线；本线在红集合收敛前用座驾配方开发，收敛后用生产驱动复验。

## 4. 系统 codec 与验证工具（已测）

- ffmpeg/ffprobe 8.1：样例创作（源资产创作边界）+ 交付验证独立解码基准。
- Khronos gltf-validator（npm）：GLB 独立验证，仅验证用。

## 5. 真实样例（已冻结，sha256 见 capabilities.json）

- `fixtures/glb/static_box.glb`：官方 validator 0 错 0 警。层级/双实例/非均匀缩放/PBR/摄影机。
- `fixtures/glb/skin_anim.glb`：官方 validator 0 错（6 个良性零权重警告）。3 关节 skin+IBM+权重+morph+LINEAR 动画。
- `fixtures/media/sample_440hz_2s.wav`：PCM s16le 48k 单声道 2s，含 LIST/INFO 附加块。
- `fixtures/media/sample_cfr_1s.mp4`：H.264 24fps CFR + AAC，1.0s/24 帧。
- `fixtures/media/sample_vfr_bframes.mp4`：实测 VFR（帧距 2/24 跳变）+B帧33/P14/I1。
- `fixtures/media/sample_offset_start.mp4`：实测 start_time=0.5/0.476（非零起始+编辑列表+AAC priming）。
- 生成器：`fixtures/tools/gen_glb_fixtures.py`（确定性，重跑逐字节同）。

## 6. 不支持/阻塞项

- Blender/UE 源样例：阻塞（本机无源软件）。真实资产验收在其到位前不得宣称；取得路径见 capabilities.json `blocked_sources`。构造 GLB 夹具仅授予解析器正反例资格。
- UE morph 动画：导出器不支持，不伪造；morph 由独立合法 GLB 样例覆盖（skin_anim.glb）。
- CUBICSPLINE 插值、sparse accessor、压缩扩展、外部 URI 资源：首期明确不支持，导入显式拒绝。
- 生产权威链（activation/replay 权限链、GEN 固定点）：未闭合，最终发布前置项，本线不重复建设，沿用既有主线。

## 7. 预算（冻结，见 capabilities.json budgets_frozen）

导入进程树 ≤2GiB、暂存 ≤8GiB、GLB ≤256MiB/≤100 万三角形/≤256 关节/≤4096² 纹理、媒体 ≤1GiB、GLB 导入+校验+封签 ≤120s、媒体原字节扫描 ≤120s、取消确认 ≤2s。与正式编译 1GiB 门分账。
