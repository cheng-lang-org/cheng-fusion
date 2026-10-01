import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");

const checkedFiles = [
  "docs/csg_web_plan.md",
  "src/core/runtime/js_runtime.cheng",
  "src/core/runtime/js_event_loop_runtime.cheng",
  "src/core/runtime/web_runtime.cheng",
  "src/core/runtime/web_style_runtime.cheng",
  "src/core/runtime/web_layout_runtime.cheng",
  "src/core/runtime/web_style_layout_bridge.cheng",
  "src/core/runtime/web_paint_runtime.cheng",
  "src/core/runtime/web_raster_runtime.cheng",
  "src/core/runtime/web_text_runtime.cheng",
  "src/core/runtime/web_font_runtime.cheng",
  "src/core/runtime/web_react_runtime.cheng",
  "src/tests/js_runtime_value_object_smoke.cheng",
  "src/tests/js_event_loop_smoke.cheng",
  "src/tests/web_runtime_dom_event_smoke.cheng",
  "src/tests/web_runtime_style_smoke.cheng",
  "src/tests/web_runtime_layout_smoke.cheng",
  "src/tests/web_runtime_style_layout_smoke.cheng",
  "src/tests/web_runtime_paint_smoke.cheng",
  "src/tests/web_runtime_raster_smoke.cheng",
  "src/tests/web_runtime_font_fixture.cheng",
  "src/tests/web_runtime_text_smoke.cheng",
  "src/tests/web_runtime_font_smoke.cheng",
  "src/tests/web_react_runtime_smoke.cheng",
  "ts-csg/scripts/js-runtime-smoke.mjs",
  "ts-csg/scripts/js-event-loop-smoke.mjs",
  "ts-csg/scripts/web-runtime-dom-event-smoke.mjs",
  "ts-csg/scripts/web-runtime-style-smoke.mjs",
  "ts-csg/scripts/web-runtime-layout-smoke.mjs",
  "ts-csg/scripts/web-runtime-style-layout-smoke.mjs",
  "ts-csg/scripts/web-runtime-paint-smoke.mjs",
  "ts-csg/scripts/web-runtime-raster-smoke.mjs",
  "ts-csg/scripts/web-runtime-text-smoke.mjs",
  "ts-csg/scripts/web-runtime-font-smoke.mjs",
  "ts-csg/scripts/web-react-runtime-smoke.mjs",
  "ts-csg/scripts/csg-web-materializer-smoke.mjs",
  "ts-csg/src/csg-web-materializer.ts",
  "ts-csg/package.json",
];

const forbidden = [
  { name: "support path", pattern: /\bsupport\// },
  { name: "build gui path", pattern: /\bbuild_gui\b/ },
  { name: "external layout dependency", pattern: /\byoga\b/i },
  { name: "external drawlist dependency", pattern: /\bdrawlist_bridge\b/i },
      { name: "foreign import", pattern: /^[^"]*@importc\b/ },
  { name: "native compiler command", pattern: /\b(?:cc|gcc|clang|c\+\+|g\+\+)\b/ },
  { name: "native source or header reference", pattern: /(?:^|["'\s])[^"'\s]+\.(?:c|cc|cpp|cxx|h|hpp)\b/ },
];

for (const relativePath of checkedFiles) {
  const absolutePath = join(repoRoot, relativePath);
  assert.equal(existsSync(absolutePath), true, `missing pure Cheng runtime scope file: ${relativePath}`);
  const text = readFileSync(absolutePath, "utf8");
  for (const rule of forbidden) {
    assert.ok(
      !rule.pattern.test(text),
      `${relativePath} violates pure Cheng runtime scope: ${rule.name}`,
    );
  }
}

process.stdout.write("pure Cheng runtime scope ok\n");
