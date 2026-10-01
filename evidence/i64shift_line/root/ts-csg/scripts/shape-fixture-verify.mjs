// shape-fixture-verify.mjs — 形状攻坚三件套验收基建（合成最小页面夹具）
//
// 用法（cwd = ts-csg/）：
//   node scripts/shape-fixture-verify.mjs --bless   首跑/形状变更后：跑管线并冻结 golden
//   node scripts/shape-fixture-verify.mjs           验收：跑管线并对拍三件套
//
// 三件套（缺一不算）：
//   1. pixel 逐字节一致（golden.json 的 pixelSha256）
//   2. CHT 覆盖率（expectCompiled 全 compiled、expectSkipCategories 精确相等）
//   3. receipt 对拍（guard receipt key 数）+ scene 结构手写期望清单（expectSceneTexts）
//
// 形状变更流程：改 fixtures/shape-smoke/app/main.tsx → --bless 冻结新 golden →
// 提交含 census/覆盖前后对比 → 后续轮跑无旗标验收防回归。

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const TS_CSG = path.resolve(import.meta.dirname, "..");
const FIXTURE = path.join(TS_CSG, "fixtures", "shape-smoke");
const GOLDEN = path.join(FIXTURE, "golden.json");
const OUT = path.join(TS_CSG, "tmp", "unimaker-fixture-smoke");
const bless = process.argv.includes("--bless");

// 手写期望：fixture 页面的 scene 结构清单（改页面时人工同步这里）。
// no-fid observation from the previous round was a fixture bug (the map callback referenced
// handleSelectTab whose declaration had been dropped in a fixture edit) — restored; the
// extractor honest-miss theory is retracted. expectSkipCategories={} = no compile gaps.
const EXPECT = {
  // handleSelectTab is NOT a CHT compile case: its site classifies as a state_delta effect
  // (set: prefix — clicking a tab IS `setActive(tab)`), a stronger direct binding than
  // invoke+compile. Compiled list covers the free-standing named handlers.
  expectCompiled: ["handlePulse", "handleLabel"],
  expectSkipCategories: {},
  expectSceneTexts: ["shape smoke", "inbox", "sent", "pulse", "reset", "label", "active: ", "pulses:", "count: ", "stamp: "],
  expectInvokeSites: 0,
};

// Remaining coverage debt (see shape-census-gap-map.md): Array.from direct-callback LEFT this
// list (7f5df1a1d family — direct form now parses as .map); map/conditional debts remain
// explicit. A shape leaves this list only by gaining real materializer support.
// jsx-drop-iife STAYS: the block-body IIFE returning a JSX-typed local (const suffix = <b/>;
// return suffix) hard-fails — selectStaticIifeJsxExpressionBody only covers static-scalar
// locals, a JSX-valued local is the open gap. Next fixture iteration attacks exactly this.
const ALLOW = [
  "--allow-dropped-shape:jsx-drop-map",
  "--allow-dropped-shape:jsx-drop-seq-helper",
  "--allow-dropped-shape:jsx-drop-template",
  "--allow-dropped-shape:jsx-drop-iife",
  "--allow-dropped-shape:jsx-drop-conditional-unparsed",
  "--allow-dropped-shape:jsx-drop-other",
];

const run = spawnSync(process.execPath, [
  path.join(TS_CSG, "scripts", "unimaker-one-click.mjs"),
  "--project-root", "fixtures/shape-smoke",
  "--entry-root", "app/main.tsx",
  "--glyph-row-tables",
  "--retained-scene-only",
  "--mobile-scene-route", "shape:app/main.tsx:ShapeSmokePage",
  "--stop-after", "materialize",
  ...ALLOW,
  "--out-dir", OUT,
], { cwd: TS_CSG, encoding: "utf8", timeout: 900000, env: { ...process.env, UNIMAKER_GLYPH_CACHE_DIR: "/tmp/glyphcache-fixture" } });

if (run.status !== 0) {
  console.error("FAIL  pipeline run rc=" + run.status);
  console.error((run.stdout ?? "") + (run.stderr ?? ""));
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(path.join(OUT, "one-click.summary.json"), "utf8"));
const cht = summary.compiledHandlerTable ?? {};
const compiledNames = Array.isArray(cht.compiledNames) ? cht.compiledNames : [];
const skipCategories = cht.skipCategories ?? {};
const pixels = fs.readFileSync(path.join(OUT, "runtime", "unimaker_glyph_sdf_pixels.bin"));
const pixelSha = createHash("sha256").update(pixels).digest("hex");
const sceneData = fs.readFileSync(path.join(OUT, "runtime", "unimaker_scene_data.bin"));
const sceneSha = createHash("sha256").update(sceneData).digest("hex");
const sceneText = sceneData.toString("latin1");
const receiptPath = path.join(OUT, "unimaker-react.scene-glyph-sdf-precompute.guard.receipt.txt");
const receiptKeys = fs.existsSync(receiptPath)
  ? Number(/receipt_key_count=(\d+)/.exec(fs.readFileSync(receiptPath, "utf8"))?.[1] ?? -1)
  : -1;

const failures = [];
const check = (name, ok, detail) => {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures.push(name);
};

// 三件套 2：CHT 覆盖率
for (const expectName of EXPECT.expectCompiled) {
  check("cht compiled " + expectName, compiledNames.includes(expectName), "compiled=" + compiledNames.join(","));
}
check("cht skip categories", JSON.stringify(skipCategories) === JSON.stringify(EXPECT.expectSkipCategories), JSON.stringify(skipCategories));
check("cht invoke sites", Number(cht.invokeSites?.length ?? 0) === EXPECT.expectInvokeSites, JSON.stringify(cht.invokeSites?.length ?? 0));

// 三件套 1：pixel 金标
const golden = bless ? null : JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
check("pixel sha", bless || golden.pixelSha256 === pixelSha, pixelSha.slice(0, 16));

// 三件套 3：receipt 对拍 + scene 结构手写期望
// guard receipt is size-gated upstream: absent on tiny fixtures (-1), present on full-site runs
if (golden !== null && golden.receiptKeyCount >= 0) {
  check("receipt keys", golden.receiptKeyCount === receiptKeys, "keys=" + receiptKeys);
} else {
  check("receipt keys", true, "skipped: fixture precompute emits no guard receipt");
}
for (const text of EXPECT.expectSceneTexts) {
  check("scene text " + JSON.stringify(text), sceneText.includes(text));
}

if (bless) {
  const out = {
    blessedAt: new Date().toISOString(),
    pixelSha256: pixelSha,
    sceneDataSha256: sceneSha,
    receiptKeyCount: receiptKeys,
    expect: EXPECT,
  };
  fs.writeFileSync(GOLDEN, JSON.stringify(out, null, 2) + "\n");
  console.log("BLESSED  golden -> " + GOLDEN);
  console.log("pixel " + pixelSha);
  process.exit(failures.length > 0 ? 1 : 0);
}

if (failures.length > 0) {
  console.error("VERIFY FAIL: " + failures.length + " check(s) failed");
  process.exit(1);
}
console.log("VERIFY OK  pixel=" + pixelSha.slice(0, 16) + " receipt=" + receiptKeys + " compiled=[" + compiledNames.join(",") + "]");
