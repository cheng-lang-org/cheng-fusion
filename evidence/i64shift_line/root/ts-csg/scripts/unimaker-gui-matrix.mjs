#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chengSmokeEnv } from "./cheng-smoke-env.mjs";
import { discoverDefaultSystemFontFaces, discoverDefaultSystemFontFiles, prepareFontCascadeBase64 } from "./font-subset.mjs";
import { runCommand } from "./process-runner.mjs";

const require = createRequire(import.meta.url);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const projectRoot = "/Users/lbcheng/UniMaker/React.js";
const projectTsConfig = join(projectRoot, "tsconfig.json");
const appPath = join(projectRoot, "app", "App.tsx");
const entryRoots = ["app/main.tsx", "app/App.tsx", "app/libp2p/index.ts"];

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}
const runId = `${Date.now()}-${process.pid}-${randomUUID()}`;
const ownedArtifacts = new Set();
let runLockDir = "";
let runLockOwned = false;
let terminatingSignal = "";
installMatrixCleanupHooks();
if (options.fontFiles.length === 0) {
  const faces = discoverDefaultSystemFontFaces();
  if (faces.length > 0) {
    options.fontFaces = faces;
    options.fontFile = faces[0].path;
    options.fontFiles = discoverDefaultSystemFontFiles();
    process.stderr.write(`  auto-discovered font faces: ${faces.map((face) => `${face.path}@${face.weight}`).join(", ")}\n`);
  }
}

assert.equal(existsSync(projectTsConfig), true, `missing UniMaker tsconfig: ${projectTsConfig}`);
assert.equal(existsSync(appPath), true, `missing UniMaker App.tsx: ${appPath}`);

const outDir = resolvePath(options.outDir ?? join(packageDir, "tmp", `unimaker-gui-matrix-${runId}`));
mkdirSync(outDir, { recursive: true });
acquireRunLock(outDir);
const workDir = options.keepIntermediates
  ? outDir
  : join(outDir, `.unimaker-gui-matrix-work-${runId}`);
if (!options.keepIntermediates) {
  registerOwnedArtifact(workDir);
  mkdirSync(workDir, { recursive: true });
}

const cheng = resolvePath(options.cheng ?? join(repoRoot, "artifacts", "backend_driver", "cheng"));
if (!options.manifestOnly && !existsSync(cheng)) fail(`missing Cheng compiler: ${cheng}`);

let factsPath = "";
let webReportPath = "";
let manifestPath = "";
try {
const startedAt = Date.now();
process.stderr.write(`[1/3] Building ts-csg and extracting UniMaker CSG-Web once...\n`);
await runCommand("npm", ["run", "build"], {
  cwd: packageDir,
  timeout: options.buildTimeoutMs,
});

const { emitCsgWebFromTs } = require(join(packageDir, "dist", "csg-web.js"));
const {
  createCsgWebMaterializerSession,
  materializeCsgWebSessionToChengSource,
} = require(join(packageDir, "dist", "csg-web-materializer.js"));
const { csgcWriteFacts } = require(join(packageDir, "dist", "csgc-writer.js"));

const extractResult = emitCsgWebFromTs({
  project: projectTsConfig,
  runtime: ["browser", "node"],
  entryRoots,
  emitText: false,
});
if (extractResult.diagnostics.length > 0) {
  fail(`CSG-Web diagnostics:\n${extractResult.diagnostics.join("\n")}`);
}

factsPath = join(workDir, "unimaker-react.csgc");
webReportPath = join(outDir, "unimaker-react.web.report.json");
const encodedFacts = csgcWriteFacts(extractResult.facts);
registerOwnedArtifact(factsPath);
writeFileSync(factsPath, encodedFacts.factsBuffer);
writeFileSync(webReportPath, JSON.stringify(compactWebReport(extractResult.report), null, 2) + "\n", "utf8");

const discovered = discoverSurfacesFromFacts(extractResult.facts, extractResult.report);
assertUniqueSurfaceIds(discovered, "discovered");
const selected = selectSurfaces(discovered, options);
if (selected.length === 0) fail(`no GUI surfaces selected from ${discovered.length} discovered roots`);

// When --full-page is set, add shell (App.tsx) and mobile (390x844) variants for page surfaces
if (options.fullPage) {
  const pageSurfaces = selected.filter((s) => s.kind === "page");
  if (pageSurfaces.length > 0) {
    process.stderr.write(`  full-page: generating shell + mobile variants for ${pageSurfaces.length} page surfaces\n`);
    for (const s of pageSurfaces) {
      const name = s.id.split(":").slice(1).join(":") || s.id;
      // Shell variant: render App.tsx at mobile viewport (app bottom nav context)
      selected.push({
        ...s,
        id: `shell:${name}`,
        kind: "shell_page",
        rootSource: "app/App.tsx",
        rootText: "",
        renderViewport: "390x844",
        fullPage: true,
      });
      // Mobile variant: render the page itself at mobile viewport
      selected.push({
        ...s,
        id: `mobile:${name}`,
        kind: "page_mobile",
        renderViewport: "390x844",
        fullPage: true,
      });
    }
  }
}
assertUniqueSurfaceIds(selected, "selected");
const materializerSession = createCsgWebMaterializerSession(extractResult.facts);
const fatalDiags = materializerSession.diagnostics.filter(d => !d.startsWith("unsupported ")); if (fatalDiags.length > 0) {
  fail(`CSG-Web materializer session failed:\n${fatalDiags.join("\n")}`);
}
manifestPath = join(outDir, "gui-surfaces.manifest.json");
writeFileSync(manifestPath, JSON.stringify({
  schema: "unimaker.gui-surfaces.v2",
  projectRoot,
  entryRoots,
  source: {
    facts: options.keepIntermediates ? factsPath : "",
    report: webReportPath,
    factCount: extractResult.facts.length,
  },
  count: discovered.length,
  selectedCount: selected.length,
  surfaces: discovered,
}, null, 2) + "\n", "utf8");

process.stderr.write(`  surfaces: ${selected.length}/${discovered.length}\n`);
process.stderr.write(`  facts: ${extractResult.facts.length}\n`);
process.stderr.write(`  source files: ${extractResult.report.counts.sourceFiles}\n`);
process.stderr.write(`  DOM templates: ${extractResult.report.counts.domNodeTemplates}\n`);

if (options.manifestOnly) {
  cleanupOwnedArtifact(factsPath);
  process.stdout.write(`unimaker-gui-matrix manifest ok surfaces=${discovered.length} selected=${selected.length}\n`);
  process.stdout.write(`manifest: ${manifestPath}\n`);
  process.exit(0);
}

process.stderr.write(`[2/3] Materializing + compiling selected GUI surfaces...\n`);
const results = [];
for (let index = 0; index < selected.length; index += 1) {
  const surface = selected[index];
  const safeId = uniqueSurfaceFileName(surface, index);
  const surfaceDir = join(workDir, safeId);
  mkdirSync(surfaceDir, { recursive: true });
  const sourcePath = join(surfaceDir, "surface.cheng");
  const exePath = join(surfaceDir, "surface");
  const compileReportPath = join(surfaceDir, "surface.compile.report.txt");
  const runOutputPath = join(surfaceDir, "surface.run.stdout.txt");
  const renderViewport = surface.renderViewport ?? options.viewport;
  const result = {
    ...surface,
    status: "pending",
    source: sourcePath,
    executable: exePath,
    compileReport: compileReportPath,
    runOutput: options.run ? runOutputPath : "",
    renderViewport,
    materialized: null,
    coverage: null,
    font: null,
    error: "",
    androidBinary: false,
    screenshot: "",
    intermediatesKept: options.keepIntermediates,
  };
  results.push(result);
  let compileSourceAbs = "";

  process.stderr.write(`  [${index + 1}/${selected.length}] ${surface.id} <- ${surface.rootSource} @${renderViewport}\n`);
  try {
    let materialized = materializeCsgWebSessionToChengSource(materializerSession, {
      frameLimit: options.frameLimit,
      dumpMode: options.dump,
      rawPixelDump: false,
      pureCheng: true,
      viewport: renderViewport,
      rootText: surface.rootText,
      rootSource: surface.rootSource,
      fontBase64: "",
      staticExpressionValues: surface.staticExpressionValues ?? {},
    });
    const fatalDiags = materialized.diagnostics.filter(d => !d.startsWith("unsupported ")); if (fatalDiags.length > 0) {
      result.status = "materialize_failed";
      result.error = fatalDiags.join("\n");
      if (options.failFast) throw new Error(result.error);
      continue;
    }
    const preparedFont = await prepareFontCascadeBase64({
      fontFaces: options.fontFaces.length > 0 ? options.fontFaces : options.fontFiles.map((item) => resolvePath(item)),
      sourceText: materialized.text,
      outDir: surfaceDir,
      label: safeId,
      subset: options.fontSubset,
      maxBytes: options.fontMaxBytes,
      timeoutMs: options.fontSubsetTimeoutMs,
      fontNumber: options.fontNumber,
    });
    result.font = preparedFont.info;
    if (preparedFont.base64s.length > 0) {
      process.stderr.write(`    font ${preparedFont.info.mode}: ${preparedFont.info.byteSize} bytes (${preparedFont.info.base64Chars} base64 chars, faces=${preparedFont.base64s.length})\n`);
      materialized = materializeCsgWebSessionToChengSource(materializerSession, {
        frameLimit: options.frameLimit,
        dumpMode: options.dump,
        rawPixelDump: false,
        pureCheng: true,
        viewport: options.viewport,
        rootText: surface.rootText,
        rootSource: surface.rootSource,
        fontBase64s: preparedFont.base64s,
        fontWeights: preparedFont.base64Weights,
        fontFamilies: preparedFont.base64Families,
        staticExpressionValues: surface.staticExpressionValues ?? {},
      });
      const fatalDiags = materialized.diagnostics.filter(d => !d.startsWith("unsupported ")); if (fatalDiags.length > 0) {
        result.status = "materialize_failed";
        result.error = fatalDiags.join("\n");
        if (options.failFast) throw new Error(result.error);
        continue;
      }
    }
    result.materialized = materialized.counts;
    result.coverage = coverageForMaterializedCounts(materialized.counts, options);
    writeFileSync(sourcePath, materialized.text, "utf8");

    const compileSourceRel = `.tmp-exec/unimaker_gui_matrix/${process.pid}_${Date.now()}_${safeId}.cheng`;
    compileSourceAbs = join(repoRoot, compileSourceRel);
    registerOwnedArtifact(compileSourceAbs);
    mkdirSync(dirname(compileSourceAbs), { recursive: true });
    writeFileSync(compileSourceAbs, materialized.text, "utf8");
    await runCommand(cheng, [
      "system-link-exec",
      `--root:${repoRoot}`,
      `--in:${compileSourceRel}`,
      "--emit:exe",
      `--target:${options.android ? "aarch64-linux-android" : "arm64-apple-darwin"}`,
      `--out:${exePath}`,
      `--report-out:${compileReportPath}`,
    ], {
      cwd: repoRoot,
      env: chengSmokeEnv({
        CHENG_PROCESS_MAX_RSS_BYTES: options.maxRssBytes,
        BACKEND_INCREMENTAL: "0",
        BACKEND_MULTI_MODULE_CACHE: "0",
        CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
      }),
      timeout: options.compileTimeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });

    if (options.android) {
      const patchScript = resolve(repoRoot, "scripts", "patch_elf_syscall.sh");
      await runCommand("bash", [patchScript, exePath], {
        cwd: repoRoot,
        timeout: 30000,
      });
      result.androidBinary = true;
    }

    if (options.run) {
      if (options.android) {
        let adbDevice = "";
        try {
          const adbOutput = await runCommand("adb", ["devices"], { timeout: 5000, encoding: "utf8" });
          const lines = adbOutput.trim().split("\n");
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2 && parts[1] === "device") {
              adbDevice = parts[0];
              break;
            }
          }
        } catch {
          // ADB binary not found or device error
        }
        if (adbDevice) {
          const dest = `/data/local/tmp/cheng_surface_${process.pid}_${index}`;
          const remoteScreenshot = `/sdcard/cheng_ss_${process.pid}_${index}.png`;
          try {
            await runCommand("adb", ["-s", adbDevice, "push", exePath, dest], {
              timeout: options.runTimeoutMs,
            });
            await runCommand("adb", ["-s", adbDevice, "shell", "chmod", "755", dest], { timeout: 10000 });
            await runCommand("adb", ["-s", adbDevice, "shell", dest], {
              timeout: options.runTimeoutMs,
              maxBuffer: 32 * 1024 * 1024,
              stdoutPath: runOutputPath,
            });
            const ssPath = join(surfaceDir, "surface.screenshot.png");
            // Pause briefly so screen updates settle before capture
            await new Promise(r => setTimeout(r, 500));
            await runCommand("adb", ["-s", adbDevice, "shell", "screencap", "-p", remoteScreenshot], { timeout: 10000 });
            await runCommand("adb", ["-s", adbDevice, "pull", remoteScreenshot, ssPath], { timeout: 10000 });
            result.screenshot = promoteSurfaceScreenshot(ssPath, safeId);
          } catch (adbErr) {
            throw new Error(`adb (device=${adbDevice}): ${adbErr.message ?? String(adbErr)}`);
          } finally {
            await runCommand("adb", ["-s", adbDevice, "shell", "rm", "-f", dest, remoteScreenshot], { timeout: 10000 });
          }
        } else {
          process.stderr.write(`    (no ADB device, skipping deploy)\n`);
        }
      } else {
        await runCommand(exePath, [], {
          cwd: repoRoot,
          encoding: "utf8",
          timeout: options.runTimeoutMs,
          maxBuffer: 32 * 1024 * 1024,
          stdoutPath: runOutputPath,
        });
      }
    }
    result.status = "ok";
    if (options.failThin && result.coverage.status === "thin") {
      result.status = "thin_surface";
      result.error = result.coverage.reason;
    }
  } catch (err) {
    result.status = result.status === "pending" ? "failed" : result.status;
    result.error = err.message ?? String(err);
    result.errorStack = err.stack ?? "";
    process.stderr.write(`    [error] ${err.stack ?? err.message}\n`);
    if (terminatingSignal || options.failFast) throw err;
  } finally {
    cleanupOwnedArtifact(compileSourceAbs);
    cleanupSurfaceArtifacts(surfaceDir, result);
    writeMatrixReport(outDir, discovered, selected, results, startedAt);
  }
}

process.stderr.write(`[3/3] Writing matrix report...\n`);
cleanupOwnedArtifact(factsPath);
cleanupOwnedArtifact(workDir);
const reportPath = writeMatrixReport(outDir, discovered, selected, results, startedAt);
const okCount = results.filter((item) => item.status === "ok").length;
const failed = results.filter((item) => item.status !== "ok");
const thinCount = results.filter((item) => item.coverage?.status === "thin").length;

process.stdout.write(`unimaker-gui-matrix surfaces ${okCount}/${results.length} ok, thin=${thinCount}\n`);
process.stdout.write(`manifest: ${manifestPath}\n`);
process.stdout.write(`report: ${reportPath}\n`);
if (failed.length > 0) {
  process.stdout.write(`failed: ${failed.map((item) => `${item.id}:${item.status}`).join(", ")}\n`);
  process.exitCode = 1;
}
} catch (err) {
  if (terminatingSignal) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 600));
  }
  throw err;
} finally {
  try {
    cleanupOwnedArtifacts();
  } finally {
    releaseRunLock();
  }
}

function writeMatrixReport(baseDir, allSurfaces, selectedSurfaces, currentResults, started) {
  for (const result of currentResults) {
    if (result.screenshot) {
      assert.equal(existsSync(result.screenshot), true, `matrix report screenshot does not exist: ${result.screenshot}`);
    }
  }
  const report = {
    schema: "unimaker.gui-matrix.v1",
    projectRoot,
    entryRoots,
    elapsedMs: Date.now() - started,
    totalSurfaces: allSurfaces.length,
    selectedSurfaces: selectedSurfaces.length,
    ok: currentResults.filter((item) => item.status === "ok").length,
    failed: currentResults.filter((item) => item.status !== "ok").length,
    thin: currentResults.filter((item) => item.coverage?.status === "thin").length,
    facts: options.keepIntermediates ? factsPath : "",
    webReport: webReportPath,
    manifest: manifestPath,
    fontFile: options.fontFile ? resolvePath(options.fontFile) : "",
    fontFiles: options.fontFiles.map((item) => resolvePath(item)),
    fontSubset: options.fontSubset,
    fontMaxBytes: options.fontMaxBytes,
    fontNumber: options.fontNumber,
    intermediatesKept: options.keepIntermediates,
    results: currentResults,
  };
  const reportPath = join(baseDir, "gui-matrix.report.json");
  const reportTempPath = join(baseDir, `.gui-matrix.report.${process.pid}-${randomUUID()}.tmp`);
  try {
    writeFileSync(reportTempPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    renameSync(reportTempPath, reportPath);
  } finally {
    rmSync(reportTempPath, { force: true });
  }
  return reportPath;
}

function coverageForMaterializedCounts(counts, parsed) {
  if (counts.elements < parsed.minElements && counts.textLiterals < parsed.minTextLiterals) {
    return {
      status: "thin",
      minElements: parsed.minElements,
      minTextLiterals: parsed.minTextLiterals,
      reason: `materialized elements ${counts.elements} < ${parsed.minElements} and text literals ${counts.textLiterals} < ${parsed.minTextLiterals}`,
    };
  }
  return {
    status: "ok",
    minElements: parsed.minElements,
    minTextLiterals: parsed.minTextLiterals,
    reason: "",
  };
}

function discoverSurfacesFromFacts(facts, report) {
  const diagnostics = [];
  if (!Array.isArray(facts) || facts.length === 0) fail("CSG-Web extraction produced no facts");
  if (!report || report.schema !== "csg-web.report") fail("CSG-Web extraction produced no csg-web.report");

  const templates = new Map();
  const templatesByCoreFact = new Map();
  const functionById = new Map();
  for (const fact of facts) {
    if (fact.kind === "csg.web.js_function_ref") {
      const coreFact = stringValue(fact.coreFact);
      const name = stringValue(fact.name);
      const file = sourceFileOfFact(fact);
      if (coreFact && name && file) functionById.set(coreFact, { name, file });
    }
    if (fact.kind !== "csg.web.dom_node_template") continue;
    const id = stringValue(fact.id);
    const coreFact = stringValue(fact.coreFact);
    const file = sourceFileOfFact(fact);
    if (!id) diagnostics.push("csg.web.dom_node_template missing id");
    if (!coreFact) diagnostics.push(`csg.web.dom_node_template ${id ?? "<unknown>"} missing coreFact`);
    if (!file) diagnostics.push(`csg.web.dom_node_template ${id ?? "<unknown>"} missing loc.file`);
    if (id) templates.set(id, fact);
    if (coreFact) templatesByCoreFact.set(coreFact, fact);
  }
  if (diagnostics.length > 0) fail(`invalid CSG-Web DOM template facts:\n${diagnostics.join("\n")}`);
  if (templates.size === 0) fail("CSG-Web facts contain no csg.web.dom_node_template roots");
  const componentUsageStaticExpressions = collectComponentUsageStaticExpressions(templates.values());

  const referenced = new Set();
  for (const template of templates.values()) collectReferencedChildren(template, templatesByCoreFact, referenced, diagnostics);
  if (diagnostics.length > 0) fail(`invalid CSG-Web DOM template children:\n${diagnostics.join("\n")}`);

  const explicitRoots = Array.from(templates.values()).filter((fact) => fact.root === true || fact.isRoot === true);
  const rootPool = explicitRoots.length > 0
    ? explicitRoots
    : Array.from(templates.values()).filter((fact) => {
        const id = stringValue(fact.id);
        return id && !referenced.has(id);
      });
  const selectableRoots = rootPool.filter(isSelectableRootTemplate);
  if (selectableRoots.length === 0) fail(`CSG-Web facts contain no selectable root templates; templateCount=${templates.size}`);

  const rootsBySource = new Map();
  for (const root of selectableRoots) {
    const source = sourceFileOfFact(root);
    if (!source) continue;
    const current = rootsBySource.get(source) ?? [];
    current.push(root);
    rootsBySource.set(source, current);
  }

  const surfaces = [];
  for (const [rootSource, roots] of rootsBySource) {
    const root = roots.slice().sort((left, right) => {
      const leftSize = templateSubtreeSize(left, templates, templatesByCoreFact, new Set());
      const rightSize = templateSubtreeSize(right, templates, templatesByCoreFact, new Set());
      if (leftSize !== rightSize) return rightSize - leftSize;
      return templateLocStart(left) - templateLocStart(right);
    })[0];
    const rootTemplate = stringValue(root.id);
    const rootOwner = stringValue(root.owner);
    const owner = rootOwner ? functionById.get(rootOwner) : undefined;
    const componentName = owner?.name ?? componentNameFromSource(rootSource);
    if (!componentName) fail(`cannot derive component name for materializer root ${rootTemplate} source=${rootSource}`);
    const kind = componentName.endsWith("Page") ? "page" : "component";
    const rootTextCandidate = firstTemplateText(root, templates, templatesByCoreFact, new Set()) ?? "";
    // Per-page static defaults to make pages visually populated
    const PAGE_DEFAULTS = {
      ProfilePage: {
        sidebarOpen: true, showAddresses: true, showWallet: true, showErrandPanel: true,
        nodeExpanded: true, paymentExpanded: true, orderExpanded: true,
        peerId: "12D3KooWExamplePeerIdForDemo",
        didText: "did:cheng:example-did-for-profile-page",
        publishedContentCount: 12, showDidRecoverySheet: false, showDidBackupSheet: false,
        domainName: "example.cheng", showRidePanel: false, showVpnPanel: true,
        showDistributedPanel: true, showSpeakingPanel: false,
      },
      HomePage: { activeCategory: "all", showSearch: false },
    };
    const staticExpressionValues = kind === "page"
      ? { ...PAGE_DEFAULTS[componentName] ?? {}, ...(componentUsageStaticExpressions.get(componentName) ?? {}) }
      : {};
    const baseId = `${kind}:${componentName}`;
    const surface = {
      id: baseId,
      baseId,
      kind,
      route: "",
      rootSource,
      rootText: "",
      rootTextCandidate,
      expectedUrl: "",
      rootTemplate,
      ownerFunction: rootOwner ?? "",
      ownerName: owner?.name ?? "",
      staticExpressionValues,
      subtreeSize: templateSubtreeSize(root, templates, templatesByCoreFact, new Set()),
    };
    surfaces.push(surface);
  }

  if (surfaces.length === 0) fail(`no materializable root sources found; selectableRootCount=${selectableRoots.length}`);
  uniquifySurfaceIds(surfaces);
  return surfaces.sort((left, right) => left.id.localeCompare(right.id));
}

function uniquifySurfaceIds(surfaces) {
  const groups = new Map();
  for (const surface of surfaces) {
    const current = groups.get(surface.id) ?? [];
    current.push(surface);
    groups.set(surface.id, current);
  }
  const used = new Set(surfaces.map((surface) => surface.id));
  for (const [baseId, group] of groups) {
    if (group.length <= 1) continue;
    used.delete(baseId);
    const sorted = group.slice().sort((left, right) => left.rootSource.localeCompare(right.rootSource));
    for (const surface of sorted) {
      let nextId = `${baseId}@${surfaceIdSourceSuffix(surface.rootSource)}`;
      let suffixIndex = 2;
      while (used.has(nextId)) {
        nextId = `${baseId}@${surfaceIdSourceSuffix(surface.rootSource)}_${suffixIndex}`;
        suffixIndex = suffixIndex + 1;
      }
      surface.id = nextId;
      used.add(nextId);
    }
  }
}

function surfaceIdSourceSuffix(rootSource) {
  const withoutExt = rootSource.replace(/\.[^/.]+$/, "");
  return withoutExt
    .replace(/^app\//, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "source";
}

function assertUniqueSurfaceIds(surfaces, label) {
  const seen = new Map();
  const duplicates = [];
  for (const surface of surfaces) {
    const previous = seen.get(surface.id);
    if (previous) {
      duplicates.push(`${surface.id}: ${previous.rootSource}, ${surface.rootSource}`);
    } else {
      seen.set(surface.id, surface);
    }
  }
  if (duplicates.length > 0) {
    fail(`duplicate ${label} GUI surface ids:\n${duplicates.join("\n")}`);
  }
}

function probeMaterializableSurfaces(surfaces, probeMaterializer) {
  for (const surface of surfaces) {
    const probeDiagnostics = probeMaterializer(surface);
    if (probeDiagnostics.length > 0) {
      fail(`materializer rejected discovered root ${surface.id} source=${surface.rootSource} text=${JSON.stringify(surface.rootText)}:\n${probeDiagnostics.join("\n")}`);
    }
  }
}

function selectSurfaces(surfaces, parsed) {
  let selected = surfaces;
  if (parsed.kind !== "all") {
    selected = selected.filter((surface) => surface.kind === parsed.kind);
  }
  if (parsed.routes.length > 0) {
    const wanted = new Set(parsed.routes.flatMap((route) => {
      if (route.includes(":")) return [route];
      return [`page:${route}`, `component:${route}`, route];
    }));
    selected = selected.filter((surface) => wanted.has(surface.id) || wanted.has(surface.baseId) || wanted.has(surface.route) || wanted.has(surface.ownerName));
  }
  if (parsed.offset > 0) selected = selected.slice(parsed.offset);
  if (parsed.limit > 0) selected = selected.slice(0, parsed.limit);
  return selected;
}

function collectComponentUsageStaticExpressions(templates) {
  const selected = new Map();
  for (const fact of templates) {
    const tagName = stringValue(fact.tagName);
    if (!tagName || !isComponentTagName(tagName)) continue;
    const staticProps = staticPropsFromFact(fact);
    const staticExpressionValues = deriveStaticExpressionValues(tagName, staticProps);
    if (Object.keys(staticExpressionValues).length === 0) continue;
    const source = sourceFileOfFact(fact) ?? "";
    const score = (source === "app/App.tsx" ? 1000000 : 0) +
      Object.keys(staticExpressionValues).length * 1000 -
      templateLocStart(fact);
    const previous = selected.get(tagName);
    if (!previous || score > previous.score) {
      selected.set(tagName, { score, values: staticExpressionValues });
    }
  }
  return new Map(Array.from(selected.entries()).map(([name, entry]) => [name, entry.values]));
}

function staticPropsFromFact(fact) {
  const out = {};
  const props = fact.props ?? fact.attributes ?? fact.properties;
  if (!Array.isArray(props)) return out;
  for (const prop of props) {
    if (!isObject(prop) || prop.kind === "spread") continue;
    const name = stringValue(prop.name);
    if (!name) continue;
    const kind = stringValue(prop.valueKind);
    if (kind === "string" && typeof prop.value === "string") out[name] = prop.value;
    else if (kind === "boolean" && typeof prop.value === "boolean") out[name] = String(prop.value);
    else if (kind === "number" && typeof prop.value === "number") out[name] = String(prop.value);
  }
  return out;
}

function deriveStaticExpressionValues(componentName, staticProps) {
  const out = { ...staticProps };
  if (componentName === "ChatPage" && Object.prototype.hasOwnProperty.call(staticProps, "chatAvatar")) {
    const avatar = String(staticProps.chatAvatar ?? "").trim();
    out.resolvedChatAvatar = avatar.startsWith("https://api.dicebear.com/7.x/identicon/") ? "" : avatar;
  }
  return out;
}

function isComponentTagName(tagName) {
  return /^[A-Z]/.test(tagName);
}

function collectReferencedChildren(fact, templatesByCoreFact, referenced, diagnostics) {
  const children = fact.children;
  if (children === undefined) return;
  if (!Array.isArray(children)) {
    diagnostics.push(`children must be an array on ${stringValue(fact.id) ?? "<unknown>"}`);
    return;
  }
  for (const child of children) {
    if (!isObject(child)) continue;
    if (typeof child.ref === "string") referenced.add(child.ref);
    if (typeof child.coreFact === "string") {
      const target = templatesByCoreFact.get(child.coreFact);
      const targetId = stringValue(target?.id);
      if (targetId) referenced.add(targetId);
    }
  }
}

function isSelectableRootTemplate(fact) {
  const nodeKind = stringValue(fact.nodeKind) ?? "element";
  return nodeKind === "element" || nodeKind === "fragment";
}

function templateSubtreeSize(fact, templates, templatesByCoreFact, visiting) {
  const id = stringValue(fact.id);
  if (id) {
    if (visiting.has(id)) return 0;
    visiting.add(id);
  }
  let size = 1;
  const children = fact.children;
  if (Array.isArray(children)) {
    for (const child of children) size += childSubtreeSize(child, templates, templatesByCoreFact, visiting);
  }
  if (id) visiting.delete(id);
  return size;
}

function childSubtreeSize(value, templates, templatesByCoreFact, visiting) {
  if (!isObject(value)) return 1;
  if (typeof value.ref === "string") {
    const target = templates.get(value.ref);
    if (target) return templateSubtreeSize(target, templates, templatesByCoreFact, visiting);
  }
  if (typeof value.coreFact === "string") {
    const target = templatesByCoreFact.get(value.coreFact);
    if (target) return templateSubtreeSize(target, templates, templatesByCoreFact, visiting);
  }
  const children = value.children;
  if (!Array.isArray(children)) return 1;
  return 1 + children.reduce((sum, child) => sum + childSubtreeSize(child, templates, templatesByCoreFact, visiting), 0);
}

function firstTemplateText(fact, templates, templatesByCoreFact, visiting) {
  const id = stringValue(fact.id);
  if (id) {
    if (visiting.has(id)) return undefined;
    visiting.add(id);
  }
  const ownText = textValueFromObject(fact);
  if (ownText) {
    if (id) visiting.delete(id);
    return ownText;
  }
  const children = fact.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const text = firstChildText(child, templates, templatesByCoreFact, visiting);
      if (text) {
        if (id) visiting.delete(id);
        return text;
      }
    }
  }
  if (id) visiting.delete(id);
  return undefined;
}

function firstChildText(value, templates, templatesByCoreFact, visiting) {
  if (typeof value === "string") return usefulText(value);
  if (!isObject(value)) return undefined;
  const direct = textValueFromObject(value);
  if (direct) return direct;
  if (typeof value.ref === "string") {
    const target = templates.get(value.ref);
    if (target) return firstTemplateText(target, templates, templatesByCoreFact, visiting);
  }
  if (typeof value.coreFact === "string") {
    const target = templatesByCoreFact.get(value.coreFact);
    if (target) return firstTemplateText(target, templates, templatesByCoreFact, visiting);
  }
  const children = value.children;
  if (!Array.isArray(children)) return undefined;
  for (const child of children) {
    const text = firstChildText(child, templates, templatesByCoreFact, visiting);
    if (text) return text;
  }
  return undefined;
}

function textValueFromObject(value) {
  if (!isObject(value)) return undefined;
  for (const key of ["text", "textContent", "value"]) {
    const text = usefulText(value[key]);
    if (text) return text;
  }
  return undefined;
}

function usefulText(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return undefined;
  if (isStylePayloadText(trimmed)) return undefined;
  return trimmed.length > 80 ? trimmed.slice(0, 80) : trimmed;
}

function isStylePayloadText(text) {
  if (text.startsWith("@keyframes ") || text.startsWith("@media ") || text.startsWith("@supports ")) return true;
  if (/^[.#]?[a-zA-Z0-9_-]+\s*\{/.test(text)) return true;
  if (/^(from|to|\d+%)\s*\{/.test(text)) return true;
  if (/^[a-zA-Z-]+\s*:\s*[^;]+;/.test(text)) return true;
  return false;
}

function sourceFileOfFact(fact) {
  const loc = fact?.loc;
  if (!isObject(loc)) return undefined;
  return stringValue(loc.file);
}

function templateLocStart(fact) {
  const loc = fact?.loc;
  if (!isObject(loc) || typeof loc.start !== "number") return Number.MAX_SAFE_INTEGER;
  return loc.start;
}

function componentNameFromSource(source) {
  const name = source.split("/").pop()?.replace(/\.[cm]?[tj]sx?$/, "");
  return name || undefined;
}

function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeFileName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "surface";
}

function uniqueSurfaceFileName(surface, index) {
  const id = safeFileName(surface.id);
  const source = safeFileName(surface.rootSource || "unknown").slice(0, 120);
  return `${String(index + 1).padStart(3, "0")}_${id}_${source}`;
}

function parseArgs(args) {
  const parsed = {
    routes: [],
    kind: "all",
    viewport: "1024x768",
    frameLimit: 600,
    limit: 0,
    offset: 0,
    run: true,
    dump: true,
    manifestOnly: false,
    failFast: false,
    failThin: false,
    minElements: 2,
    minTextLiterals: 2,
    maxRssBytes: "2147483648",
    buildTimeoutMs: 120000,
    compileTimeoutMs: 300000,
    runTimeoutMs: 60000,
    fontFile: "",
    fontFiles: [],
    fontFaces: [],
    fontSubset: true,
    fontMaxBytes: 2 * 1024 * 1024,
    fontSubsetTimeoutMs: 120000,
    fontNumber: null,
    android: false,
    fullPage: false,
    keepIntermediates: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) fail(`missing value for ${arg}`);
      return args[i];
    };
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--out-dir") parsed.outDir = next();
    else if (arg === "--route" || arg === "--surface") parsed.routes.push(next());
    else if (arg === "--kind" || arg === "--surface-kind") parsed.kind = parseSurfaceKind(next());
    else if (arg === "--limit") parsed.limit = positiveInteger(next(), "--limit");
    else if (arg === "--offset") parsed.offset = nonNegativeInteger(next(), "--offset");
    else if (arg === "--viewport") parsed.viewport = parseViewport(next());
    else if (arg === "--frame-limit") parsed.frameLimit = positiveInteger(next(), "--frame-limit");
    else if (arg === "--cheng") parsed.cheng = next();
    else if (arg === "--font-file") {
      const value = next();
      parsed.fontFile = value;
      parsed.fontFiles.push(value);
    }
    else if (arg === "--font-fallback-file") parsed.fontFiles.push(next());
    else if (arg === "--no-font-subset") parsed.fontSubset = false;
    else if (arg === "--font-max-bytes") parsed.fontMaxBytes = positiveInteger(next(), "--font-max-bytes");
    else if (arg === "--font-subset-timeout-ms") parsed.fontSubsetTimeoutMs = positiveInteger(next(), "--font-subset-timeout-ms");
    else if (arg === "--font-number") parsed.fontNumber = nonNegativeInteger(next(), "--font-number");
    else if (arg === "--no-run") parsed.run = false;
    else if (arg === "--android") parsed.android = true;
    else if (arg === "--dump") parsed.dump = true;
    else if (arg === "--full-page") parsed.fullPage = true;
    else if (arg === "--manifest-only") parsed.manifestOnly = true;
    else if (arg === "--keep-intermediates" || arg === "--keep-debug-artifacts") parsed.keepIntermediates = true;
    else if (arg === "--fail-fast") parsed.failFast = true;
    else if (arg === "--fail-thin") parsed.failThin = true;
    else if (arg === "--min-elements") parsed.minElements = positiveInteger(next(), "--min-elements");
    else if (arg === "--min-text-literals") parsed.minTextLiterals = positiveInteger(next(), "--min-text-literals");
    else if (arg === "--max-rss-bytes") parsed.maxRssBytes = String(positiveInteger(next(), "--max-rss-bytes"));
    else if (arg === "--build-timeout-ms") parsed.buildTimeoutMs = positiveInteger(next(), "--build-timeout-ms");
    else if (arg === "--compile-timeout-ms") parsed.compileTimeoutMs = positiveInteger(next(), "--compile-timeout-ms");
    else if (arg === "--run-timeout-ms") parsed.runTimeoutMs = positiveInteger(next(), "--run-timeout-ms");
    else fail(`unknown argument: ${arg}`);
  }
  return parsed;
}

function parseSurfaceKind(value) {
  if (value === "all" || value === "page" || value === "component") return value;
  fail(`--kind must be all, page, or component`);
}

function parseViewport(value) {
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) fail(`invalid viewport: ${value}`);
  return value;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${name} must be a positive integer`);
  return parsed;
}

function nonNegativeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) fail(`${name} must be a non-negative integer`);
  return parsed;
}

function resolvePath(value) {
  if (!value) return value;
  return resolve(process.cwd(), value);
}

function installMatrixCleanupHooks() {
  process.once("exit", () => {
    try {
      cleanupOwnedArtifacts();
    } finally {
      releaseRunLock();
    }
  });
  const signalExitCode = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 };
  for (const signal of Object.keys(signalExitCode)) {
    process.once(signal, () => {
      terminatingSignal = signal;
      if (process.listenerCount(signal) === 0) {
        process.exit(signalExitCode[signal]);
      }
      setTimeout(() => process.exit(signalExitCode[signal]), 3500);
    });
  }
}

function acquireRunLock(baseDir) {
  runLockDir = join(baseDir, ".unimaker-gui-matrix.lock");
  try {
    mkdirSync(runLockDir);
    runLockOwned = true;
    writeFileSync(join(runLockDir, "owner.json"), JSON.stringify({ pid: process.pid, runId }) + "\n", "utf8");
  } catch (err) {
    if (runLockOwned) releaseRunLock();
    if (err?.code === "EEXIST") {
      fail(`matrix output directory is already locked by another run: ${runLockDir}`);
    }
    throw err;
  }
}

function releaseRunLock() {
  if (!runLockOwned || !runLockDir) return;
  rmSync(runLockDir, { recursive: true, force: true });
  runLockOwned = false;
}

function registerOwnedArtifact(path) {
  if (!options.keepIntermediates && path) ownedArtifacts.add(path);
}

function cleanupOwnedArtifact(path) {
  if (options.keepIntermediates || !path) return;
  rmSync(path, { recursive: true, force: true });
  ownedArtifacts.delete(path);
}

function cleanupSurfaceArtifacts(surfaceDir, result) {
  if (options.keepIntermediates) return;
  rmSync(surfaceDir, { recursive: true, force: true });
  result.source = "";
  result.executable = "";
  result.compileReport = "";
  result.runOutput = "";
  result.font = summarizeRemovedFontArtifacts(result.font);
  result.intermediatesKept = false;
}

function promoteSurfaceScreenshot(sourcePath, safeId) {
  assert.equal(existsSync(sourcePath), true, `ADB screenshot was not pulled: ${sourcePath}`);
  assert.equal(statSync(sourcePath).size > 0, true, `ADB screenshot is empty: ${sourcePath}`);
  const screenshotDir = join(outDir, "screenshots");
  mkdirSync(screenshotDir, { recursive: true });
  const durablePath = join(screenshotDir, `${safeId}.png`);
  renameSync(sourcePath, durablePath);
  assert.equal(existsSync(durablePath), true, `failed to promote screenshot: ${durablePath}`);
  return durablePath;
}

function summarizeRemovedFontArtifacts(info) {
  if (!info) return null;
  return {
    mode: info.mode ?? "",
    byteSize: Number(info.byteSize ?? 0),
    base64Chars: Number(info.base64Chars ?? 0),
    glyphCount: Number(info.glyphCount ?? 0),
    maxBytes: Number(info.maxBytes ?? 0),
    faceCount: Array.isArray(info.fonts) ? info.fonts.length : 1,
    artifactsKept: false,
  };
}

function cleanupOwnedArtifacts() {
  if (options.keepIntermediates) return;
  for (const path of ownedArtifacts) rmSync(path, { recursive: true, force: true });
  ownedArtifacts.clear();
}

function compactWebReport(report) {
  const closure = report.runtimeClosure ?? {};
  return {
    schema: report.schema,
    projectRoot: report.projectRoot,
    projectFile: report.projectFile,
    entryRoots: report.entryRoots,
    complete: report.complete,
    counts: report.counts,
    runtimes: report.runtimes,
    blockedReasons: report.blockedReasons,
    runtimeClosure: {
      schema: closure.schema,
      complete: closure.complete,
      requirementCount: closure.requirementCount,
      externalSymbolCount: closure.externalSymbolCount,
      openRequirementCount: closure.openRequirementCount,
      openExternalSymbolCount: closure.openExternalSymbolCount,
      closedRequirementCount: closure.closedRequirementCount,
      closedExternalSymbolCount: closure.closedExternalSymbolCount,
      candidateRequirementCount: closure.candidateRequirementCount,
      candidateExternalSymbolCount: closure.candidateExternalSymbolCount,
      domainCount: closure.domainCount,
      byDomain: closure.byDomain,
    },
    runtime_open_requirement_top: report.runtime_open_requirement_top,
  };
}

function fail(message) {
  process.stderr.write(`unimaker-gui-matrix: ${message}\n`);
  process.exit(1);
}

function helpText() {
  return `unimaker-gui-matrix — discover and run UniMaker GUI surfaces through CSG-Web + pure Cheng

Usage:
  node scripts/unimaker-gui-matrix.mjs [--out-dir <dir>] [--route <route>] [--limit <n>] [--no-run]
  node scripts/unimaker-gui-matrix.mjs --manifest-only

Key options:
  --route <id>          Run a route such as lang_select or a full id such as component:BaziPage.
  --kind <kind>         Select all, page, or component surfaces (default: all).
  --limit <n>           Run first n discovered surfaces.
  --manifest-only       Only discover/write the GUI surface manifest.
  --keep-intermediates  Keep generated Cheng sources, binaries, pixels, and font subsets.
  --no-run              Compile every selected surface but do not execute it.
  --android             Cross-compile for aarch64-linux-android, patch syscalls, deploy via ADB.
  --full-page           Generate additional shell (App.tsx at 390x844) and mobile (page at 390x844)
                        variants for each page surface to show app shell context.
  --font-file <path>    Subset and embed this TrueType glyf/loca font into each Cheng surface.
  --font-fallback-file <path>
                        Add another TrueType glyf/loca fallback face for missing glyphs.
  --no-font-subset      Embed the full font, still checked by --font-max-bytes.
  --font-max-bytes <n>  Hard-fail when embedded font payload exceeds budget (default: 2097152).
  --font-number <n>     TTC/OTC face index override for subsetting.
  --fail-thin           Exit non-zero when a surface is below --min-elements and --min-text-literals.
  --min-elements <n>    Minimum materialized element count for coverage marker (default: 2).
  --min-text-literals <n>
                         Minimum materialized text literal count for coverage marker (default: 2).
`;
}
