#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const restoredRoot = "/Users/lbcheng/codex-desktop-rehost/restored-source";

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}

const surfaceNames = options.surfaces.length > 0
  ? options.surfaces
  : ["main-home", "main-thread-detail"];

const outDir = resolvePath(options.outDir ?? join(packageDir, "tmp", `codex-gate-${Date.now()}`));
mkdirSync(outDir, { recursive: true });

assert.equal(existsSync(restoredRoot), true, `missing restored-source root: ${restoredRoot}`);

const startedAt = Date.now();
const surfaceResults = [];

// Step 1: Run CSG-Web extraction on Codex TS owner files
process.stderr.write(`[1/3] Extracting CSG-Web facts from Codex restored-source...\n`);
execFileSync("npm", ["run", "build"], { cwd: packageDir, stdio: ["ignore", "pipe", "pipe"] });

const { emitCsgWebFromTs } = await import(pathToFileURL(join(packageDir, "dist", "csg-web.js")).href);

// Collect TS owner files from restored-source
const ownerEntryRoots = [
  "apps/webview/src/main.tsx",
  "apps/webview/src/App.tsx",
  "source/react-ts/renderer/app-shell.tsx",
  "source/react-ts/renderer/thread-detail-view.tsx",
  "source/react-ts/renderer/thread-sidebar-view.tsx",
  "source/react-ts/renderer/sidebar-project-groups.tsx",
];

// Filter to files that exist
const existingEntries = ownerEntryRoots.filter((entry) =>
  existsSync(join(restoredRoot, entry))
);

if (existingEntries.length === 0) {
  process.stderr.write(`  WARNING: no Codex TS owner files found. Check restoredRoot.\n`);
}

let csgFacts = [];
let csgReport = null;
let csgDiags = [];

if (existingEntries.length > 0 && options.extract !== false) {
  // Use csg-specific tsconfig (extends webview, adds allowImportingTsExtensions)
  const csgTsconfig = join(restoredRoot, "tsconfig.csg.json");
  const tsconfigPath = existsSync(csgTsconfig) ? csgTsconfig : join(restoredRoot, "apps/webview/tsconfig.json");

  if (!existsSync(tsconfigPath)) {
    process.stderr.write(`  WARNING: no tsconfig found for Codex extraction\n`);
  } else {
    try {
      const result = emitCsgWebFromTs({
        project: tsconfigPath,
        runtime: ["browser", "node"],
        entryRoots: existingEntries,
      });
      csgFacts = result.facts;
      csgReport = result.report;
      csgDiags = result.diagnostics ?? [];
      process.stderr.write(`  facts: ${csgFacts.length} extracted, ${csgDiags.length} diagnostics\n`);
      if (csgReport) {
        const closure = csgReport.runtimeClosure;
        process.stderr.write(`  runtime requirements: ${closure?.requirementCount ?? 0} total, ${closure?.openRequirementCount ?? 0} open\n`);
        process.stderr.write(`  source files: ${csgReport.counts?.sourceFiles ?? 0}\n`);
        // Summarize top open domains
        if (closure?.byDomain) {
          const top5 = closure.byDomain.slice(0, 5);
          for (const d of top5) {
            process.stderr.write(`    ${d.domain}: ${d.count} open\n`);
          }
        }
      }
    } catch (err) {
      process.stderr.write(`  CSG extraction failed: ${err.message}\n`);
      if (!options.allowExtractFailure) throw err;
    }
  }
} else {
  process.stderr.write(`  CSG extraction skipped (no entry files or --no-extract)\n`);
}

// Step 2: Generate surface_owner / truth_ref / pixel_region facts from ground-truth
process.stderr.write(`[2/3] Building surface owner + truth ref + pixel region facts...\n`);

const groundTruthDir = join(restoredRoot, "ground-truth");
const surfaceFacts = [];

for (const surfaceName of surfaceNames) {
  const surfaceDir = join(groundTruthDir, surfaceName);
  if (!existsSync(surfaceDir)) {
    process.stderr.write(`  surface ${surfaceName}: ground-truth dir not found, skipping\n`);
    surfaceResults.push({
      surface: surfaceName,
      status: "missing_ground_truth",
      ownerCount: 0,
      truthRefCount: 0,
      pixelRegionCount: 0,
      keyOwnersMissing: [],
    });
    continue;
  }

  const domPath = join(surfaceDir, "dom.json");
  const geometryPath = join(surfaceDir, "geometry.json");
  const cssPath = join(surfaceDir, "css.json");
  const screenshotPath = join(surfaceDir, "screenshot.png");
  const manifestPath = join(surfaceDir, "manifest.json");

  const hasDom = existsSync(domPath);
  const hasGeometry = existsSync(geometryPath);
  const hasScreenshot = existsSync(screenshotPath);

  let domNodesRaw = null;
  let geometryNodes = null;
  let surfaceMeta = {};

  if (hasDom) {
    try { domNodesRaw = JSON.parse(readFileSync(domPath, "utf8")); } catch (_) { /* keep empty */ }
  }
  if (hasGeometry) {
    try { geometryNodes = JSON.parse(readFileSync(geometryPath, "utf8")); } catch (_) { /* keep empty */ }
  }
  if (existsSync(manifestPath)) {
    try { surfaceMeta = JSON.parse(readFileSync(manifestPath, "utf8")); } catch (_) { /* keep empty */ }
  }

  // Flatten dom.json tree into nodeId -> { tag, className } map
  const domNodeMap = new Map();
  function flattenDom(node, map) {
    if (!node || typeof node !== "object") return;
    if (typeof node.id === "number") {
      map.set(node.id, {
        tag: node.tag ?? "",
        className: node.className ?? node.attributes?.class ?? "",
        id: node.attributes?.id ?? "",
      });
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) flattenDom(child, map);
    }
  }
  if (domNodesRaw) flattenDom(domNodesRaw, domNodeMap);
  const domNodeCount = domNodeMap.size;

  // Generate truth_ref fact for this surface
  const truthRefId = `csg.web.truth_ref.${surfaceName}`;
  surfaceFacts.push({
    kind: "csg.web.truth_ref",
    id: truthRefId,
    surface: surfaceName,
    nodeRef: hasDom ? `ground-truth/${surfaceName}/dom.json` : "",
    geometryRef: hasGeometry ? `ground-truth/${surfaceName}/geometry.json` : "",
    cssRef: existsSync(cssPath) ? `ground-truth/${surfaceName}/css.json` : "",
    screenshotRef: hasScreenshot ? `ground-truth/${surfaceName}/screenshot.png` : "",
    ownerFact: `csg.web.surface_owner.${surfaceName}`,
  });

  // Generate surface_owner fact
  // Map each TS owner file to this surface
  const ownerFileMapping = {
    "main-home": [
      "apps/webview/src/App.tsx",
      "apps/webview/src/home-official-layout.ts",
      "source/react-ts/renderer/app-shell.tsx",
    ],
    "main-thread-detail": [
      "apps/webview/src/App.tsx",
      "apps/webview/src/thread-official-layout.ts",
      "source/react-ts/renderer/thread-detail-view.tsx",
      "source/react-ts/renderer/thread-sidebar-view.tsx",
    ],
  };

  const ownerFiles = ownerFileMapping[surfaceName] ?? [];
  for (const file of ownerFiles) {
    const ownerId = `csg.web.surface_owner.${surfaceName}.${basename(file, ".tsx").replace(/\./g, "_")}`;
    surfaceFacts.push({
      kind: "csg.web.surface_owner",
      id: ownerId,
      surface: surfaceName,
      ownerFile: file,
      component: basename(file),
      isKey: file.includes("official-layout") || file.includes("app-shell"),
      sourceLoc: { file: join(restoredRoot, file), line: 1, column: 1 },
    });
  }

  // Generate pixel_region facts from geometry data
  // geometry.json format: { "<nodeId>": { content: {x,y,width,height}, padding: {...}, border: {...}, margin: {...} } }
  let pixelCount = 0;

  if (geometryNodes && typeof geometryNodes === "object" && !Array.isArray(geometryNodes)) {
    for (const [nodeIdStr, geom] of Object.entries(geometryNodes)) {
      if (!geom || typeof geom !== "object") continue;
      const content = geom.content;
      if (!content || typeof content.x !== "number") continue;

      const nodeId = parseInt(nodeIdStr, 10);
      const domNode = domNodeMap.get(nodeId);
      const cls = domNode?.className ?? "";
      const tag = domNode?.tag ?? "";

      // Classify region from DOM node
      let region = "content";
      if (cls.includes("sidebar") || cls.includes("left-panel") || tag === "aside") region = "sidebar";
      else if (cls.includes("topbar") || cls.includes("header") || tag === "header") region = "topbar";
      else if (cls.includes("composer") || cls.includes("bottom-panel") || cls.includes("input-panel")) region = "composer";
      else if (cls.includes("conversation") || cls.includes("thread") || cls.includes("chat") || cls.includes("main-content")) region = "conversation";
      else if (cls.includes("modal") || cls.includes("overlay") || cls.includes("dialog")) region = "modal";
      else if (cls.includes("footer") || tag === "footer") region = "footer";
      else if (cls.includes("root") || cls.includes("app-shell")) region = "root";

      // Only emit regions with meaningful size (>= 50px in either dimension)
      if (content.width < 50 && content.height < 50) continue;

      const regionId = `csg.web.pixel_region.${surfaceName}.${region}.${pixelCount}`;
      const ownerId = `csg.web.surface_owner.${surfaceName}.${basename(ownerFiles[0] ?? "unknown", ".tsx").replace(/\./g, "_")}`;

      surfaceFacts.push({
        kind: "csg.web.pixel_region",
        id: regionId,
        surface: surfaceName,
        region,
        x: Math.round(content.x),
        y: Math.round(content.y),
        width: Math.round(content.width),
        height: Math.round(content.height),
        ownerFact: ownerId,
        truthRef: truthRefId,
      });
      pixelCount += 1;
    }
  }

  const keyOwners = ownerFiles.filter((f) => f.includes("official-layout") || f.includes("app-shell"));
  const keyOwnersMissing = options.relaxed
    ? []
    : keyOwners.filter((f) => !existsSync(join(restoredRoot, f)));

  surfaceResults.push({
    surface: surfaceName,
    status: keyOwnersMissing.length > 0 ? "key_owners_missing" : "ok",
    ownerCount: ownerFiles.length,
    truthRefCount: 1,
    pixelRegionCount: pixelCount,
    domNodeCount,
    geometryNodeCount: geometryNodes ? Object.keys(geometryNodes).length : 0,
    hasScreenshot,
    keyOwnersMissing,
  });
}

// Write combined facts
const allFacts = [...csgFacts, ...surfaceFacts];
const factsPath = join(outDir, "codex-gate.csgweb");
const factsText = allFacts.map((f) => JSON.stringify(f)).join("\n") + "\n";
writeFileSync(factsPath, factsText, "utf8");

// Step 3: Generate report
process.stderr.write(`[3/3] Generating gate report...\n`);

const elapsedMs = Date.now() - startedAt;
const allOk = surfaceResults.every((r) => r.status === "ok");

const gateReport = {
  schema: "codex-gate.report.v1",
  generatedAtUnixMs: startedAt,
  elapsedMs,
  restoredRoot,
  surfaces: surfaceResults,
  allOk,
  facts: factsPath,
  totalFacts: allFacts.length,
  csgFacts: csgFacts.length,
  surfaceFacts: surfaceFacts.length,
  surfaceOwnerCount: surfaceFacts.filter((f) => f.kind === "csg.web.surface_owner").length,
  truthRefCount: surfaceFacts.filter((f) => f.kind === "csg.web.truth_ref").length,
  pixelRegionCount: surfaceFacts.filter((f) => f.kind === "csg.web.pixel_region").length,
  csgReport: csgReport ? {
    complete: csgReport.complete,
    openRequirements: csgReport.runtimeClosure?.openRequirementCount ?? 0,
    totalRequirements: csgReport.runtimeClosure?.requirementCount ?? 0,
    sourceFiles: csgReport.counts?.sourceFiles ?? 0,
    jsFunctions: csgReport.counts?.jsFunctions ?? 0,
    jsxElements: csgReport.counts?.jsxElements ?? 0,
    domNodeTemplates: csgReport.counts?.domNodeTemplates ?? 0,
    topOpenDomains: (csgReport.runtimeClosure?.byDomain ?? []).slice(0, 10).map((d) => ({ domain: d.domain, count: d.count })),
  } : null,
  csgDiagnosticCount: csgDiags.length,
  csgDiagnosticSample: csgDiags.slice(0, 20),
};

const reportPath = join(outDir, "codex-gate.report.json");
writeFileSync(reportPath, JSON.stringify(gateReport, null, 2) + "\n", "utf8");

// Print summary
process.stdout.write(`\n=== Codex Gate Summary ===\n`);
process.stdout.write(`elapsed: ${elapsedMs}ms\n`);
process.stdout.write(`all surfaces ok: ${allOk}\n`);
for (const r of surfaceResults) {
  const statusIcon = r.status === "ok" ? "ok" : "FAIL";
  process.stdout.write(`  ${r.surface}: ${statusIcon} (${r.ownerCount} owners, ${r.truthRefCount} truth refs, ${r.pixelRegionCount} pixel regions, ${r.domNodeCount} DOM nodes)\n`);
  if (r.keyOwnersMissing.length > 0) {
    process.stdout.write(`    key owners missing: ${r.keyOwnersMissing.join(", ")}\n`);
  }
}
process.stdout.write(`facts: ${factsPath}\n`);
process.stdout.write(`report: ${reportPath}\n`);

if (allOk) {
  process.stdout.write(`\ncodex-gate ok\n`);
} else {
  process.stdout.write(`\ncodex-gate blocked: key owners missing for ${surfaceResults.filter((r) => r.status !== "ok").map((r) => r.surface).join(", ")}\n`);
  process.exitCode = 1;
}

function parseArgs(args) {
  const parsed = {
    surfaces: [],
    extract: true,
    relaxed: false,
    allowExtractFailure: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) fail(`missing value for ${arg}`);
      return args[i];
    };
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--surface") parsed.surfaces.push(next());
    else if (arg === "--out-dir") parsed.outDir = next();
    else if (arg === "--no-extract") parsed.extract = false;
    else if (arg === "--relaxed") parsed.relaxed = true;
    else if (arg === "--allow-extract-failure") parsed.allowExtractFailure = true;
    else fail(`unknown argument: ${arg}`);
  }
  return parsed;
}

function resolvePath(value) {
  if (!value) return value;
  return resolve(process.cwd(), value);
}

function fail(message) {
  process.stderr.write(`codex-gate: ${message}\n`);
  process.exit(1);
}

function helpText() {
  return `codex-gate — Codex restored-source CSG surface owner + truth ref gate

Usage:
  node scripts/codex-gate.mjs [--surface <name>] [--out-dir <dir>]

Options:
  --surface <name>        surface to gate (default: main-home, main-thread-detail)
  --out-dir <dir>         output directory
  --no-extract            skip CSG-Web extraction (use only ground-truth facts)
  --relaxed               don't hard-fail when key owner files are missing
  --allow-extract-failure continue even if CSG extraction fails
`;
}
