# Cheng 原生 GUI 主线计划

本文是 GUI 实施计划。CSG 分层、命名空间、report、tombstone、control surface 以 `docs/csg-core-standard.md` 为唯一标准。

## 目标

闭合两条链路：

```text
Cheng App -> GUI Core -> Layout/Event/A11y -> Render IR -> Surface Provider
```

```text
TS/React -> csg_core -> csg_dialect::web -> Cheng JS/Web Runtime
         -> DOM/CSS/Event/Layout/Paint/Raster -> Surface Provider
```

关键原则：

- 不用 Electron/WebView/Qt/Flutter。
- 不嵌入 Node、V8、Chromium、宿主 JS 引擎。
- JSX 不直接转 GUI 控件。
- 浏览器只做 oracle。
- 生产 lowering 只接受 `complete=true`。

## 当前事实

- `ts-csg` 已有 `csg-core`、`csg-web`、`csg-js`、`relfacts`、`cheng-web-source` 入口。
- `docs/csg-core-standard.md` 已定义 `csg_core`、`csg_dialect::web`、`csg_relfacts::v1`、tombstone、control surface、facts root 和 conformance 工具。
- `ts-csg/package.json` 已有 `smoke:csg-core-conformance`、`smoke:csg-web`、`smoke:web-projects`、`smoke:js-runtime-core`、`smoke:web-runtime-core`。
- 旧 `csg.web.*` fact 名只作为一轮兼容输入；新文档和 validator 必须面向 `csg_dialect::web::*` 标准口径。
- 旧 GUI 文档里的“TS-GUI lowering / JSX -> Cheng Component Tree”已废弃，改为 CSG-Web runtime materialization。

### 现状补丁（2026-07-14 实测）

- `smoke:csg-core-conformance` / `smoke:csg-web` / `smoke:pure-cheng-runtime`：绿。
- `smoke:js-runtime-core` / `smoke:web-runtime-core`：红。根因是 backend `primary_object_plan=not_ready`（pobj 热文件；GUI 线不可改）。
- `src/std/gui.cheng` 仍是裸 `@importc` + `int32` handle 包装；**无** `@ffi_handle` 生产口径；**无** `GuiRun`/`RequestFrame` API。
- Darwin provider（`core_runtime_provider_darwin.cheng`）GUI 是 **handle table + 内存 drawlist 状态**，不是真 Cocoa 窗口；`cheng_poll_event` 恒返回 none。
- 可跑 green（provider 路径，`system-link-exec --emit:exe`）：`gui_window_smoke` / `gui_event_smoke` / `gui_drawlist_render_smoke` / `gui_interactive_smoke`（rc=0）。测试已去掉 `echo`/`assert`（pobj unsupported）与生产入口 `PollEvent` 忙轮询。
- 红：`gui_full_smoke` / `gui_1to1_smoke` → `ReactRuntimeAppendElement` pobj not_ready；`run-host-smokes gui_drawlist_render_smoke` → direct driver 缺 full selfhost command lowering。
- `support/build_cocoa.sh` / 旧 emit:obj+cocoa 双链：链接缺 runtime provider 符号，非生产路径；`cheng-native-gui-link.mjs` 已改默认 emit:exe，`CHENG_GUI_COCOA=1` hard-fail。

## 推进步骤

1. 文档收口
   将 `docs/cheng-native-gui-plan.md`（含 GUI 总览附录 A、TS lowering 附录 B、AI 执行语义附录 C）改成 CSG-Web 标准路线。

2. GUI Platform API
   保留 no-pointer 口径：`@ffi_handle` 管理 Window/Surface/Font/Texture，`@ffi_map` 管理 buffer，`@ffi_out_ptrs` 管理输出参数。现有裸 `@importc` GUI 原型只能作为 legacy smoke。

3. 事件驱动 runtime
   `GuiRun` 只消费 provider 推送的事件队列；无事件时休眠；状态变化后 `RequestFrame`；禁止生产入口调用 `PollEvents`。

4. Cheng Web Runtime
   继续闭合 JSValue、object/property、event loop、Promise、React-compatible reconcile、DOM tree、EventTarget、CSS rule、computed style、layout、paint、raster 子集。未实现语义必须写 report 并 hard-fail。

5. CSG-Web 到 Surface
   `csg_dialect::web` facts 经 Cheng Web runtime 生成 DOM/Layout/Paint/Raster IR，再提交 Surface Provider。不能从 JSX/template facts 直接生成 native Button/Input/List。

6. Runtime Closure
   `coreComplete=false`、`runtimeClosure.complete=false`、`externalCapabilityManifest.complete=false`、tombstone、unsupported 任一出现即阻断 frame materialization。

7. Control Surface
   从 CSG-Web DOM/runtime facts 输出标准 control surface 和 computer-use typed action。Computer Use 只能调用 Click、SetText、Select 等 typed action，并进入同一事件队列。

8. macOS 首闭环
   先闭合 macOS：CoreText 文本、窗口 resize/input/frame present、CSG-Web demo frame hash、点击和输入事件 receipt。

9. 跨端扩展
   Windows/DirectWrite+D3D、Linux/Wayland+HarfBuzz、iOS/UIKit+Metal、Android/Surface+Choreographer 按同一 Provider API 扩展。

## 验收门禁

现有标准门禁：

```sh
cd /Users/lbcheng/cheng-lang/ts-csg
npm run build
npm run smoke:csg-core-conformance
npm run smoke:csg-web
npm run smoke:web-projects
npm run smoke:js-runtime-core
npm run smoke:web-runtime-core

/Users/lbcheng/cheng-lang/tools/csg_core_conformance_test.sh
/Users/lbcheng/cheng-lang/tools/csg_relfacts_conformance_test.sh
/Users/lbcheng/cheng-lang/artifacts/backend_driver/cheng run-host-smokes cheng_skill_consistency_smoke
```

新增 GUI 门禁：

- `native_gui_api_nopointer_smoke`
- `native_gui_event_driven_smoke`
- `native_gui_macos_window_smoke`
- `native_gui_drawlist_smoke`
- `csg_web_surface_render_smoke`
- `csg_web_runtime_closure_hard_fail_smoke`
- `csg_web_control_surface_action_smoke`
- `csg_web_frame_hash_determinism_smoke`

## 禁止项

- 把 `ts-csg` 重写成 Cheng/Rust。
- 把 Web runtime facts 放进 `csg_core`。
- 用 `CHENG_CSG` 或 `CHENGCSG` 替代 CSG-Core。
- 用 tombstone、unsupported、open runtime requirement 生成生产 artifact。
- 用 WebView/Chromium/V8/Node 承载 TS/React 语义。
- 用 JSX 直接映射 native 控件。
- 用截图/OCR/坐标点击操作自有 GUI。

---

## 附录 A：GUI 方向总览（原 cheng-gui 合卷）

GUI 主线：Cheng App → GUI Core → Layout/Event/A11y → Render IR → Cheng Surface Provider。CSG 语义以 `csg-core-standard.md` 为准。

## 附录 B：TS/React 渲染 lowering（原 cheng-gui-ts-lowering 合卷）

TS/TSX 渲染路线：TS/React → ts-csg --emit csg-web → csg_core → csg_dialect::web → Cheng JS/Web Runtime → Cheng React-compatible Runtime → Cheng DOM/CSSOM/Event/Layout/Paint/Raster → Surface Provider。必须遵守 `csg-core-standard.md`。

## 附录 C：AI 原生 GUI 执行语义（原 ai-native-gui-execution-semantics 合卷）

Cheng GUI 目标：人类可视化和 AI 执行共享同一套 typed GUI 语义。人类看到视觉投影，AI 使用动作投影，测试读取观测投影——三者来自同一个结构化 GUI IR 和同一条事件分发路径。

**四个结构化对象**：`GuiStateGraph`（应用状态/路由/焦点/权限/异步任务）、`GuiSurfaceTree`（可见界面的语义树，含稳定 id/角色/文本/布局/样式 token/可执行动作/可访问性标签/隐私等级）、`GuiEvent`（输入事件和系统事件）、`GuiReceipt`（执行回执，含 effect/资源变更/观测快照）。

**落地顺序**：固化 GuiSurfaceTree/GuiEvent/GuiReceipt 的 Cheng typed 模块 → r2c native-gui 输出 semantic surface 和 event replay manifest → surface_frame_rgba_v1 绑定到同一 GuiReceipt。
