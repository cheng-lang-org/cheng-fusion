#!/usr/bin/env node
/**
 * scene-paint-inline-probe.mjs — LIVE_MIRROR_CAMPAIGN P4 语义轨 paint 覆盖探针。
 *
 * 语义轨(非 mobileAppExports)提取链此前对 inline style(background-color/color/
 * border/opacity)不产出 csg.web.scene.paint facts, 语义 bin 热换像素闭环缺前端。
 * 本探针以 fixtures/scene-hotswap-basic(纯 inline style JSX)驱动 emitCsgWebFromTs,
 * 断言四个背景色的 fill paint facts 精确产出。
 *
 * 用法: node scripts/scene-paint-inline-probe.mjs   (exit 0|1)
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const fixture = join(packageDir, "fixtures", "scene-hotswap-basic");
const project = join(fixture, "tsconfig.json");
if (!existsSync(project)) {
  process.stderr.write("scene-paint-inline-probe: missing fixture tsconfig: " + project + "\n");
  process.exit(1);
}

const { emitCsgWebFromTs } = await import(pathToFileURL(join(packageDir, "dist", "csg-web.js")).href);
const { emitCsgWebSceneFactsFromFactArray } = await import(
  pathToFileURL(join(packageDir, "dist", "csg-web-materializer.js")).href
);
const extracted = emitCsgWebFromTs({
  project,
  runtime: ["browser"],
  entryRoots: ["src/main.tsx"],
  emitText: false,
});
if (extracted.diagnostics.length) {
  process.stderr.write("scene-paint-inline-probe: diagnostics: " + extracted.diagnostics.join(" | ").slice(0, 400) + "\n");
  process.exit(1);
}
// 语义轨 scene 前置: 提取 facts → materializer 场景物化(与 P1 热换 loader 同 schema)。
const scene = emitCsgWebSceneFactsFromFactArray(extracted.facts, { viewport: "390x844" });
if (scene.diagnostics.length) {
  process.stderr.write("scene-paint-inline-probe: scene diagnostics: " + scene.diagnostics.join(" | ").slice(0, 400) + "\n");
  process.exit(1);
}

const paints = scene.facts.filter((fact) => fact.kind === "csg.web.scene.paint");
const fills = new Set(paints.filter((fact) => fact.opKind === "fill").map((fact) => fact.color));

const expected = ["0xFF101418", "0xFF3366CC", "0xFF33CC66", "0xFFCC3333"];
const missing = expected.filter((color) => !fills.has(color));
if (missing.length > 0) {
  process.stderr.write(
    "scene-paint-inline-probe: FAIL missing fill paints: " + missing.join(",") +
    " (fills=" + [...fills].sort().join(",") + ", total paint facts=" + paints.length + ")\n",
  );
  process.exit(1);
}
process.stdout.write(
  "scene-paint-inline-probe: PASS paint facts=" + paints.length +
  " fills=" + [...fills].sort().join(",") + "\n",
);
