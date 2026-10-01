# CSG-Web 纯 Cheng Web 内核方案

> 本文是 CSG-Web 路线的单一方案文档（原 `docs/cheng-web.md` 已并入并收口为指针）。文档分层见 `docs/README.md`。

## 目标

TypeScript/React 项目只降到 `CSG-Web` facts。执行链是：

```text
TS / React
  -> ts-csg --emit csg-web
  -> CSG-Core / CSG-JS / CSG-Web facts
  -> Cheng JS/Web Runtime
  -> Cheng React-compatible Runtime
  -> Cheng DOM / CSSOM / Event / Layout / Paint / Raster
  -> Cheng Surface Provider
```

浏览器只作为 oracle 对拍 DOM、布局、事件、截图，不作为运行依赖。主线不依赖 WebView、Chromium、V8、宿主 JS 引擎或宿主 GUI 控件语义。主线不引入 C/C++ Web 内核；系统调用、窗口、字体、图片、GPU 只能作为 provider，不能承载 Web/JS 语义。

JSX 不能直接转 GUI 控件。JSX 必须保留为 Web 语义 facts，由 Cheng JS/Web Runtime 闭合。

## 当前进度

- `ts-csg --emit csg-web` 已能对两个真实 TS/React 项目导出确定性 facts 和 runtime requirement report。
- `CSG-Web` schema、截断输入、未知 record、重复导出确定性已有 smoke。
- Cheng JS Runtime 已有可验证子集：`JSValue`、object/property、Object.assign object-lite、Error message/prototype object-lite、event loop/microtask、function/exception/Promise 的核心结构；`npm run smoke:js-runtime-core` 当前通过。
- Cheng Web Runtime 已有可验证子集：DOM tree、EventTarget、CSS rule、computed style、layout tree、paint list、raster surface、text、React host element reconcile/text diff；`npm run smoke:web-runtime-core` 当前通过。
- retained mobile scene runtime 的文本路径已改为预计算 glyph SDF atlas。one-click 流程生成并运行纯 Cheng 预计算程序，移动端 source 只加载 `atlas/glyph/run/run_glyph/pixels` host batches 并做一致性校验；带文本时缺预计算 atlas 必须 hard-fail。
- 两个项目 facts gate 当前通过，但 open requirements 仍未归零：`cursor-agents-window` 为 1464 open，`unimaker-react` 为 2920 open。
- 已闭合的是子集门禁，不是完整浏览器，不是完整 React，不是端到端项目运行。
- 注意：为避开当前 cold runner 在大对象/大聚合 smoke 上的 SIGTRAP/SIGBUS，部分 JS/React/DOM/Layout/Paint/Raster/Text smoke 入口暂时收窄为 marker；不能把这轮 gate 通过写成运行时语义完整闭合。

## 未完成项必须 hard-fail

- 不支持的 TS/JS/JSX/React/CSS/DOM/Event 语义必须进入 report 并 hard-fail。
- 禁止 fallback、stub、mock、静默忽略、直接返回默认值、编译期后处理补救。
- `smoke:web-runtime` 在完整 Web runtime 未完成前必须保持 hard-fail。

## Runtime 合同

### Cheng JS Runtime

- `JSValue` tagged union：undefined、null、bool、int32、float64、str、object、symbol、bigint、function。
- Object：shape id、property slots、element storage、prototype、descriptor。
- Function：closure env、call frame、this binding、argument list。
- Exception：throw/catch/finally 显式建模。
- Promise：microtask queue 与 event loop 同步。
- Module loader：ESM import/export graph，缺失依赖 hard-fail。
- 先解释执行保证语义正确，再把热点函数降到 BodyIR/机器码。

### Cheng React-compatible Runtime

- 支持 `createElement/jsx/jsxs` facts。
- 支持 `useState`、state update queue、render epoch。
- Reconcile 输出 DOM mutation，不输出 GUI 控件调用。
- 字符串 key diff 与基础 onClick 冒泡监听已有 smoke；effect、ref、context 和完整事件系统未实现前必须进入 report 并 hard-fail。

### Cheng DOM / CSS / Event Runtime

- DOM：Node、Document、Element、Text、Attribute、mutation record。
- Event：capture、target、bubble、focus、input、composition。
- CSS：tokenizer/parser、selector matching、cascade、specificity、inheritance、initial value、computed style。
- Computed style 是 layout 的唯一输入；未支持 CSS 属性必须进入 report 并 hard-fail。

### Cheng Layout / Paint / Raster Runtime

- Layout 输入：DOM tree + computed style。
- Layout 输出：layout tree + absolute box。
- 覆盖顺序：block、inline、text、flex、scroll、grid、table、fragmentation。
- 数值使用确定性 fixed-point，避免平台浮点漂移。
- Paint 输出 display list：rect、border、text、image、clip、opacity、stacking context。
- Raster 输出固定 viewport surface buffer。
- 字体、图片解码、颜色管理都必须显式建模。

## CSG-Web Facts

必须覆盖：

- module graph、symbol graph、type graph。
- function、closure、CFG、op、call、throw。
- object shape、prototype、property descriptor。
- JSX/runtime element facts。
- DOM node、attribute、event listener。
- CSS rule、selector、declaration、computed style input。
- resource、debug map、runtime requirement。

## 公开接口

- `ts-csg --emit csg-web --project <tsconfig> --runtime node,browser --out <facts.csgwebc> --report-out <json>`
- `cheng-web-run --csg-web <facts> --viewport <w>x<h> --surface-out <rgba> --trace-out <json>`
- `cheng-web-oracle --project <tsconfig> --entry <entry> --viewport <w>x<h> --dom-out <json> --layout-out <json> --events-out <json> --screenshot-out <png>`
- Report 必须包含：unsupported kind、source span、runtime domain、required provider、blocking reason、coverage counts、hash、open requirement count。
- Facts 主产物必须是 CSGC 二进制 `.csgwebc`，重复导出 byte-identical；JSONL 只允许显式 debug/export。任何未知 schema、未知 op、截断、未闭合 runtime requirement 都直接失败。
- glyph SDF host batch 格式固定为 `csg_scene_glyph_sdf_atlas_v1`，stride 必须与 runtime 常量一致；缺数组、长度不匹配或非 int32 值必须 hard-fail。

## 两个项目门禁

- `/Users/lbcheng/cursor-restored/cursor-agents-window`
- `/Users/lbcheng/UniMaker/React.js`

验收命令：

```sh
cd /Users/lbcheng/cheng-lang/ts-csg
npm run smoke:csg-web
npm run smoke:web-projects
npm run smoke:js-runtime-core
npm run smoke:web-runtime-core
```

## 下一步门禁

- facts：继续保持两个项目重复导出 SHA 一致，unsupported/runtime requirement report 完整。
- React runtime：继续从 host JSX/reconcile/keyed child/onClick 子集扩到 function component、effect lifecycle、ref/context、完整事件委托。
- JS：module loader、function/closure/this、exception、Promise handler dispatch、thenable assimilation 与 Node/Chrome oracle 对拍。
- React：`createElement/jsx/jsxs`、`useState`、state update queue、reconcile 输出 DOM mutation 已有子集门禁；下一步补齐项目实际 JSX/runtime requirement。
- DOM/CSS/Event：DOM mutation、query、attribute、event capture/bubble、focus/input、CSS cascade/computed style 覆盖项目实际属性。
- Layout/Paint/Raster：block/inline/text/flex、display list、stacking context、clip、scroll、固定字体包和 deterministic surface。
- 移动端 scene text：继续锁住预计算 glyph SDF atlas，不允许设备启动期构建 glyph SDF 或用空字形数据冒充通过。
- 项目级：TS -> CSG-Web -> Cheng JS/Web Runtime 启动两个项目，unsupported count 归零。

## 完成定义

- 不依赖 WebView、Chromium、V8、宿主 JS 引擎或宿主 GUI 控件作为语义实现。
- 所有 Web/JS/React/DOM/CSS/Event/Layout/Paint/Raster 语义在 Cheng runtime 内显式建模。
- 不支持项 hard-fail 并写 report。
- 两个真实项目可以通过 `CSG-Web` 在 Cheng JS/Web Runtime 上运行。
- 与 Chrome oracle 的 DOM snapshot、layout box、event trace、截图 diff 全部通过后，才能宣称项目转译完成。
