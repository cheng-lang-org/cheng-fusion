#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import v8 from "node:v8";
import vm from "node:vm";
import { gzipSync } from "node:zlib";
import { chengSmokeEnv } from "./cheng-smoke-env.mjs";
import { discoverDefaultSystemFontFaces, discoverDefaultSystemFontFiles, gb2312HanGlyphInventory, prepareFontCascadeBase64 } from "./font-subset.mjs";
import {
  generatedExecutableProcessTreeLimitBytes,
  runCommand,
  runGeneratedExecutable,
  startManagedProcess,
} from "./process-runner.mjs";
import { execSync } from "node:child_process";

const unimakerChengMaxRssBytes = "8589934592";
const oneClickSignalExitCode = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
};
let oneClickTerminatingSignal = "";

class OneClickFailure extends Error {}

export function createRunResourceManifest() {
  const trackedFiles = new Set();
  const signalHandlers = new Map();
  let exitHandler = null;
  let cleanupInProgress = false;
  let cleanupComplete = false;

  function normalizedFilePath(filePath) {
    assert.equal(typeof filePath, "string", "tracked resource path must be a string");
    assert(filePath.length > 0, "tracked resource path must not be empty");
    return resolve(filePath);
  }

  function registerFile(filePath) {
    assert.equal(cleanupComplete, false, "cannot register a resource after cleanup");
    const normalized = normalizedFilePath(filePath);
    trackedFiles.add(normalized);
    return filePath;
  }

  function registerFiles(filePaths) {
    for (const filePath of filePaths) registerFile(filePath);
    return filePaths;
  }

  function releaseFile(filePath) {
    if (cleanupComplete) return;
    const normalized = normalizedFilePath(filePath);
    assert(trackedFiles.has(normalized), `cannot release untracked resource: ${normalized}`);
    trackedFiles.delete(normalized);
  }

  function removeFiles(filePaths) {
    if (cleanupComplete) return;
    const normalizedPaths = filePaths.map((filePath) => normalizedFilePath(filePath));
    for (const filePath of normalizedPaths) {
      assert(trackedFiles.has(filePath), `cannot remove untracked resource: ${filePath}`);
    }
    const errors = [];
    for (const filePath of normalizedPaths.reverse()) {
      try {
        rmSync(filePath, { force: true });
        trackedFiles.delete(filePath);
      } catch (error) {
        errors.push(new Error(`failed to remove tracked resource: ${filePath}`, { cause: error }));
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "failed to remove tracked resources");
  }

  function cleanup() {
    if (cleanupComplete || cleanupInProgress) return;
    cleanupInProgress = true;
    try {
      removeFiles([...trackedFiles]);
      cleanupComplete = true;
    } finally {
      cleanupInProgress = false;
    }
  }

  function installSignalHandlers() {
    if (signalHandlers.size > 0) return;
    if (exitHandler === null) {
      exitHandler = () => cleanup();
      process.once("exit", exitHandler);
    }
    for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"]) {
      const handler = () => {
        oneClickTerminatingSignal = signal;
        uninstallSignalHandlers();
        const exitCode = oneClickSignalExitCode[signal];
        if (process.listenerCount(signal) === 0) {
          cleanup();
          process.exit(exitCode);
          return;
        }
        // process-runner owns active child groups and exits after TERM→KILL. This
        // referenced timer is only a hard upper bound for any other listener.
        setTimeout(() => process.exit(exitCode), 3500);
      };
      signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }
  }

  function uninstallSignalHandlers() {
    for (const [signal, handler] of signalHandlers) process.off(signal, handler);
    signalHandlers.clear();
  }

  function uninstallExitHandler() {
    if (exitHandler === null) return;
    process.off("exit", exitHandler);
    exitHandler = null;
  }

  return {
    registerFile,
    registerFiles,
    releaseFile,
    removeFiles,
    cleanup,
    installSignalHandlers,
    uninstallSignalHandlers,
    uninstallExitHandler,
    get trackedFileCount() {
      return trackedFiles.size;
    },
  };
}

const cacheLockHolderSource = `process.stdout.write("locked\\n"); setInterval(() => {}, 1000);`;

function cacheDirectoryLockCommand(lockPath) {
  if (process.platform === "darwin") {
    return {
      file: "/usr/bin/lockf",
      args: ["-k", "-t", "60", lockPath, process.execPath, "-e", cacheLockHolderSource],
    };
  }
  if (process.platform === "linux") {
    return {
      file: "/usr/bin/flock",
      args: ["-x", "-w", "60", lockPath, process.execPath, "-e", cacheLockHolderSource],
    };
  }
  fail(`cache directory lock has no production holder on ${process.platform}`);
}

export async function withCacheDirectoryLock(cacheDir, operation) {
  assert.equal(typeof operation, "function", "cache lock operation must be a function");
  mkdirSync(cacheDir, { recursive: true });
  const lockPath = join(cacheDir, ".cache.lock");
  const lockCommand = cacheDirectoryLockCommand(lockPath);
  if (!existsSync(lockCommand.file)) {
    fail(`cache directory lock helper missing: ${lockCommand.file}`);
  }
  const managed = startManagedProcess(lockCommand.file, lockCommand.args, {
    drainStdout: false,
    drainStderr: false,
  });
  const waitPromise = managed.wait();
  let stderr = "";
  managed.child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
    if (stderr.length > 65536) stderr = stderr.slice(-65536);
  });
  try {
    await new Promise((resolveReady, rejectReady) => {
      let stdout = "";
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        managed.child.stdout?.off("data", onData);
        callback(value);
      };
      const onData = (chunk) => {
        stdout += chunk.toString("utf8");
        if (stdout.includes("locked\n")) finish(resolveReady);
      };
      const timeout = setTimeout(() => {
        finish(rejectReady, new Error(`cache lock acquisition timed out: ${lockPath}`));
      }, 61000);
      managed.child.stdout?.on("data", onData);
      waitPromise.then(({ code, signal }) => {
        finish(rejectReady, new Error(`cache lock holder exited before acquisition: path=${lockPath} code=${code} signal=${signal ?? ""} stderr=${stderr.trim()}`));
      }, (error) => finish(rejectReady, error));
    });
    const result = operation();
    assert.equal(result instanceof Promise, false, "cache lock operation must be synchronous");
    return result;
  } finally {
    await managed.stop({ signal: "SIGTERM", killDelayMs: 1000 });
  }
}

// Compile Cheng source to native executable via --emit:obj + cc linking.
// This avoids the cold compiler --emit:exe crash/plan-not-ready issues.
// Desktop headless exe: no host provides the mobile GPU-present ABI, so the
// whole present family (compositor/media-surface become reachable once a
// scene has enough layers) is replaced with local no-ops. The declarations
// live in the retained scene-runtime module, not the entry, so callers must
// stub BOTH texts. APK/mobile-shell paths link the real host and are unaffected.
function stubHostPresentFamilyForDesktopExe(text) {
  for (const hostFn of [
    "cheng_mobile_host_present_gpu_commands",
    "cheng_mobile_host_present_compositor_frame",
    "cheng_mobile_host_present_overlay_refresh",
    "cheng_mobile_host_present_media_surface_commands",
    "cheng_mobile_host_prepare_media_surface_texture",
  ]) {
    const re = new RegExp(
      `@importc\\("${hostFn}"\\)\\nfn (\\w+)\\(([^)]*)\\)(\\s*:\\s*\\w+)?\\n`,
    );
    text = text.replace(
      re,
      (_m, name, params, ret) => {
        const returnsInt = (ret ?? "").trim().length > 0;
        return `fn ${name}(${params})${ret ?? ""} =\n${returnsInt ? "    return 0\n" : "    return\n"}`;
      },
    );
  }
  return text;
}
async function compileChengToExe(cheng, repoRoot, sourceRel, exePath, reportPath, opts = {}) {
  const sourceAbs = join(repoRoot, sourceRel);
  const objPath = exePath + ".o";
  const wrapperCPath = exePath + ".wrapper.c";
  const wrapperOPath = exePath + ".wrapper.o";
  const compilerStderrPath = reportPath + ".stderr";
  const resourceManifest = opts.resourceManifest;
  assert(resourceManifest, "compileChengToExe requires a run resource manifest");
  const compilerTemporaryPaths = [objPath, wrapperCPath, wrapperOPath];
  resourceManifest.registerFiles(compilerTemporaryPaths);
  try {
  const env = chengSmokeEnv({
    CHENG_NO_BACKEND_DRIVER_HANDOFF: "1",
    CHENG_BACKEND_DRIVER_HANDOFF: "0",
    CHENG_PROCESS_MAX_RSS_BYTES: unimakerChengMaxRssBytes,
    BACKEND_INCREMENTAL: "0",
    BACKEND_MULTI_MODULE_CACHE: "0",
    CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
  }, cheng, repoRoot);

  if (opts.emitMode === "exe") {
    try {
      await runCommand(cheng, [
        "system-link-exec",
        `--root:${repoRoot}`,
        `--in:${sourceRel}`,
        "--emit:exe",
        "--link-providers",
        "--target:arm64-apple-darwin",
        `--out:${exePath}`,
        `--report-out:${reportPath}`,
      ], {
        cwd: repoRoot,
        env,
        timeout: opts.timeout || 600000,
        stderrPath: compilerStderrPath,
      });
    } catch (error) {
      if (existsSync(compilerStderrPath)) {
        process.stderr.write(`Cheng compiler stderr at: ${compilerStderrPath}\n`);
      }
      throw error;
    }
    if (!existsSync(exePath)) {
      throw new Error(`Cheng --emit:exe produced no output: ${exePath}`);
    }
    return exePath;
  }

  // Step 1: Cheng --emit:obj
  try {
    await runCommand(cheng, [
      "system-link-exec",
      `--root:${repoRoot}`,
      `--in:${sourceRel}`,
      "--emit:obj",
      "--target:arm64-apple-darwin",
      `--out:${objPath}`,
      `--report-out:${reportPath}`,
    ], {
      cwd: repoRoot,
      env,
      timeout: opts.timeout || 600000,
      stderrPath: compilerStderrPath,
    });
  } catch (error) {
    if (existsSync(compilerStderrPath)) {
      process.stderr.write(`Cheng compiler stderr at: ${compilerStderrPath}\n`);
    }
    throw error;
  }

  if (!existsSync(objPath)) {
    throw new Error(`Cheng --emit:obj produced no output: ${objPath}`);
  }

  // Step 2: Find the main symbol
  let mainSymbol = null;
  try {
    const nmOut = execSync(`nm "${objPath}"`, { encoding: "utf8", timeout: 10000 });
    for (const line of nmOut.split("\n")) {
      const m = line.match(/ T _?(cheng_.*_main__L\d+)/);
      if (m) { mainSymbol = m[1].replace(/^_/, ''); break; }
    }
  } catch (e) {
    // nm might fail, try without it
  }

  // Step 3: Link with cc
  // Headless-desktop shim: the cold backend lowers some str copy patterns to the
  // driver intrinsic `driver_c_new_string_copy_n`, whose production definition
  // lives in the mobile-shell provider (mirroring core_runtime_provider_darwin).
  // The desktop link carries no provider objects, so link a shim mirroring the
  // provider semantics exactly (fresh n+1 buffer, memcpy, NUL terminator; abort
  // on oversize) — same judgment as stubHostPresentFamily.
  const driverShimCPath = exePath + ".driver_shim.c";
  const driverShimOPath = exePath + ".driver_shim.o";
  writeFileSync(driverShimCPath, `#include <stdlib.h>\n#include <string.h>\n#include <limits.h>\nchar *driver_c_new_string_copy_n(void *raw, int n) {\n  if (n < 0 || n >= INT32_MAX) { abort(); }\n  char *out = (char *)malloc((size_t)n + 1);\n  if (out == NULL) { return out; }\n  if (raw != NULL && n > 0) { memcpy(out, raw, (size_t)n); }\n  out[n] = '\\0';\n  return out;\n}\n`, "utf8");
  if (resourceManifest) {
    resourceManifest.registerFile(driverShimCPath);
    resourceManifest.registerFile(driverShimOPath);
  }
  execSync(`cc -arch arm64 -c -o "${driverShimOPath}" "${driverShimCPath}"`, { timeout: 30000 });
  if (mainSymbol) {
    // Need a C wrapper
    writeFileSync(wrapperCPath, `extern int ${mainSymbol}(void);\nint main(int argc, char **argv) { return ${mainSymbol}(); }\n`, "utf8");
    execSync(`cc -arch arm64 -c -o "${wrapperOPath}" "${wrapperCPath}"`, { timeout: 30000 });
    execSync(`cc -arch arm64 -o "${exePath}" "${wrapperOPath}" "${driverShimOPath}" "${objPath}"`, { timeout: 30000 });
  } else {
    // Direct _main symbol (C-compatible entry bridge)
    execSync(`cc -arch arm64 -o "${exePath}" "${driverShimOPath}" "${objPath}"`, { timeout: 30000 });
  }

  if (!existsSync(exePath)) {
    throw new Error(`cc linking produced no output: ${exePath}`);
  }
  return exePath;
  } finally {
    resourceManifest.removeFiles(compilerTemporaryPaths);
  }
}
import {
  analyzeSceneDomCssCoverage,
  sceneDomCssCoverageFailureMessages,
  writeSceneDomCssCoverageReport,
} from "./scene-dom-css-coverage.mjs";
import { parseSceneGlyphSdfPrecomputeOutput } from "./scene-glyph-sdf-precompute-output.mjs";
import {
  buildSceneMobileDataAsset,
  buildReactSceneSemanticManifest,
  buildM2HomeWiring,
  buildNodesRowWiring,
  buildCompiledHandlerTable,
  emitSceneGlyphSdfAtlasPrecomputeSource,
  emitSceneMobileRuntimeSource,
  sceneMobileDataAssetRelPath,
  sceneMobileGlyphSdfPixelAssetRelPath,
} from "./scene-runtime-smoke-source.mjs";
import {
  writeGlyphRowTableSidecarFiles,
  finalizeGlyphRowMode,
  readInterpreterTemplate,
} from "./glyph-row-tables.mjs";
import { splitGeneratedChengSourceIntoParts } from "./scene-runtime-smoke-source.mjs";
import {
  sceneSourcePartsManifestName,
  verifySplitPartsAgainstMonolith,
} from "./s-split-equivalence-smoke.mjs";
import { summarizeSceneActionCoverage } from "./scene-action-coverage.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const defaultProjectRoot = "/Users/lbcheng/UniMaker/React.js";
// Per-card fan-out (csg-web-materializer.ts's contentRouteTargetForNode, landed a2789b33f)
// gives every video card its own content id + route + sourcePeer, but the single global
// --mobile-video-file design predates that: it baked ONE video's manifest (hence ONE
// assetCid) into EVERY video-type card regardless of content id, so a real multi-peer feed
// (胡广生's own hgs_faststart.mp4 vs 麦田's own maitian.mp4) ended up with both cards
// content-addressing whatever single file resolveMobileVideoFileOption auto-selected —
// device-verified to silently pick the unrelated content-smoke-video-cmaf.mp4 smoke fixture
// and bake its CID into the 胡广生 card, which then failed the runtime ES content-match
// check for real. This map is the only production wiring for defaultProjectRoot's known
// real cards; any other content id must come through --mobile-video-file-map or
// resolveMobileVideoFileForContentId fails loudly instead of silently reusing one shared
// file across an ambiguous fan-out.
const defaultProjectMobileVideoFileByContentId = new Map([
  ["vid_hgs", join(repoRoot, "src", "tests", "real_media_assets", "hgs_faststart.mp4")],
  ["vid1", join(repoRoot, "platform", "harmony", "ChengGuiDemo", "entry", "src", "main", "resources", "rawfile", "maitian.mp4")],
]);
const webSceneRuntimeSourcePath = join(repoRoot, "src/core/runtime/web_scene_runtime.cheng");
const sceneRuntimeSmokeSourcePath = join(scriptDir, "scene-runtime-smoke-source.mjs");
// v8: resource payloads left the generated source (sidecar .b64 + argv); keys now mix a
// payload fingerprint so any byte drift in font data rotates entries even when facts match.
const glyphSdfPrecomputeCacheSchema = "unimaker.glyph_sdf_precompute_cache.v8";
const glyphSdfPrecomputeCacheRetainKeys = 1;
const glyphSdfPixelOutputPlaceholder = "$CHENG_GLYPH_SDF_PIXEL_OUTPUT";
const unimakerDistributedContentStorageKey = "unimaker_distributed_contents_v1";
const mobileContentSnapshotSchema = "unimaker.pwa.content_snapshot.v1";
const mobileContentSnapshotRouteIds = new Set([
  "home_default",
  "home_graphic_channel",
  "home_content_detail_open",
  "home_image_detail_open",
  "node_published_content",
  "content_detail",
]);
const unimakerReactRouteCatalog = [
  { routeId: "home_default", rootSource: "app/components/HomePage.tsx", rootComponent: "HomePage" },
  { routeId: "content_detail", rootSource: "app/components/ContentDetailPage.tsx", rootComponent: "ContentDetailPage" },
  { routeId: "ecom_main", rootSource: "app/components/EcomFeedPage.tsx", rootComponent: "EcomFeedPage", rootText: "未找到相关商品" },
  { routeId: "game_doudizhu", rootSource: "app/components/DouDiZhuPage.tsx", rootComponent: "DouDiZhuPage" },
  { routeId: "game_mahjong", rootSource: "app/components/MahjongPage.tsx", rootComponent: "MahjongPage" },
  { routeId: "game_minecraft", rootSource: "app/components/MinecraftPage.tsx", rootComponent: "MinecraftPage" },
  { routeId: "game_werewolf", rootSource: "app/components/WerewolfPage.tsx", rootComponent: "WerewolfPage" },
  { routeId: "game_xiangqi", rootSource: "app/components/ChessPage.tsx", rootComponent: "ChessPage" },
  { routeId: "home_app_channel", rootSource: "app/components/HomePage.tsx", rootComponent: "HomePage" },
  { routeId: "home_graphic_channel", rootSource: "app/components/HomePage.tsx", rootComponent: "HomePage" },
  { routeId: "home_bazi_overlay_open", rootSource: "app/components/BaziPage.tsx", rootComponent: "BaziPage" },
  { routeId: "home_search_open", rootSource: "app/components/HomePage.tsx", rootComponent: "HomePage" },
  { routeId: "home_sort_open", rootSource: "app/components/HomePage.tsx", rootComponent: "HomePage" },
  { routeId: "home_sidebar_open", rootSource: "app/components/HomePage.tsx", rootComponent: "HomePage" },
  { routeId: "home_channel_manager_open", rootSource: "app/components/HomePage.tsx", rootComponent: "HomePage" },
  { routeId: "home_content_detail_open", rootSource: "app/components/HomePage.tsx", rootComponent: "HomePage" },
  { routeId: "home_image_detail_open", rootSource: "app/components/HomePage.tsx", rootComponent: "HomePage" },
  { routeId: "home_ziwei_overlay_open", rootSource: "app/components/ZiweiPage.tsx", rootComponent: "ZiweiPage", underlayRoute: "home_default" },
  {
    routeId: "home_ziwei_archive_open",
    rootSource: "app/components/ZiweiPage.tsx",
    rootComponent: "ZiweiPage",
    underlayRoute: "home_default",
    staticExpressionValues: {
      activeMainTab: "档案",
      activeTopView: "main",
    },
  },
  { routeId: "lang_select", rootSource: "app/components/LanguageSelector.tsx", rootComponent: "LanguageSelector" },
  { routeId: "marketplace_main", rootSource: "app/components/AppMarketplace.tsx", rootComponent: "AppMarketplace", rootText: "应用市场" },
  {
    routeId: "marketplace_social_picker",
    rootSource: "app/components/AppMarketplace.tsx",
    rootComponent: "AppMarketplace",
    rootText: "管理快捷入口",
    staticExpressionValues: {
      mode: "social-picker",
      socialPickerMode: true,
    },
  },
  { routeId: "message_thread", rootSource: "app/components/ChatPage.tsx", rootComponent: "ChatPage" },
  { routeId: "message_thread_more_panel_open", rootSource: "app/components/ChatPage.tsx", rootComponent: "ChatPage" },
  { routeId: "node_detail", rootSource: "app/components/NodesPage.tsx", rootComponent: "NodeDetail" },
  { routeId: "node_published_content", rootSource: "app/components/NodesPage.tsx", rootComponent: "NodePublishedContentPage" },
  { routeId: "node_thread", rootSource: "app/components/ChatPage.tsx", rootComponent: "ChatPage" },
  { routeId: "node_thread_more_panel_open", rootSource: "app/components/ChatPage.tsx", rootComponent: "ChatPage" },
  { routeId: "publish_ad", rootSource: "app/components/PublishAdPage.tsx", rootComponent: "PublishAdPage" },
  { routeId: "publish_content", rootSource: "app/components/PublishVideoPage.tsx", rootComponent: "PublishVideoPage" },
  { routeId: "publish_food", rootSource: "app/components/PublishFoodPage.tsx", rootComponent: "PublishFoodPage" },
  { routeId: "publish_live", rootSource: "app/components/LiveStreamPage.tsx", rootComponent: "LiveStreamPage" },
  { routeId: "publish_product", rootSource: "app/components/PublishProductPage.tsx", rootComponent: "PublishProductPage" },
  { routeId: "publish_ride", rootSource: "app/components/PublishRidePage.tsx", rootComponent: "PublishRidePage" },
  { routeId: "publish_secondhand", rootSource: "app/components/PublishSecondhandPage.tsx", rootComponent: "PublishSecondhandPage" },
  { routeId: "publish_selector", rootSource: "app/components/PublishTypeSelector.tsx", rootComponent: "PublishTypeSelector", underlayRoute: "home_default" },
  { routeId: "tab_messages", rootSource: "app/components/MessagesPage.tsx", rootComponent: "MessagesPage" },
  { routeId: "tab_nodes", rootSource: "app/components/NodesPage.tsx", rootComponent: "NodesPage" },
  { routeId: "tab_profile", rootSource: "app/components/ProfilePage.tsx", rootComponent: "ProfilePage" },
  { routeId: "trading_crosshair", rootSource: "app/components/TradingPage.tsx", rootComponent: "TradingPage" },
  { routeId: "trading_main", rootSource: "app/components/TradingPage.tsx", rootComponent: "TradingPage" },
  { routeId: "update_center_main", rootSource: "app/components/UpdateCenterPage.tsx", rootComponent: "UpdateCenterPage" },
  { routeId: "publish_movie", rootSource: "app/components/PublishVideoPage.tsx", rootComponent: "PublishVideoPage" },
  { routeId: "publish_graphic", rootSource: "app/components/PublishVideoPage.tsx", rootComponent: "PublishVideoPage" },
  { routeId: "publish_music", rootSource: "app/components/PublishVideoPage.tsx", rootComponent: "PublishVideoPage" },
  { routeId: "publish_novel", rootSource: "app/components/PublishVideoPage.tsx", rootComponent: "PublishVideoPage" },
];
const defaultUniMakerMobileSceneRoutes = [
  ...unimakerReactRouteCatalog,
];

async function runOneClick(argv) {
const runResources = createRunResourceManifest();
runResources.installSignalHandlers();
try {
const options = parseArgs(argv);
if (options.help) {
  process.stdout.write(helpText());
  return;
}
const collectStageGarbage = createStageGarbageCollector();
if (options.fontFiles.length === 0) {
  const faces = discoverDefaultSystemFontFaces();
  if (faces.length > 0) {
    options.fontFaces = faces;
    options.fontFile = faces[0].path;
    options.fontFiles = discoverDefaultSystemFontFiles();
    process.stderr.write(`  auto-discovered font faces: ${faces.map((face) => `${face.path}@${face.weight}`).join(", ")}\n`);
  }
}

const projectRoot = resolvePath(options.projectRoot || defaultProjectRoot);
// Codex surfaces: many components' render-branch conditions are dynamic by construction (hook
// data), so the guard derivation makes them statically undecidable — fall back to the last
// render-root candidate (pre-guard behavior) instead of erroring them all to empty. UniMaker
// keeps the hard error (its guards are statically resolvable by construction).
if (resolve(projectRoot) !== resolve(defaultProjectRoot)) options.undecidableGuardFallback = true;
options.mobileVideoFile = resolveMobileVideoFileOption(options, projectRoot);
options.mobileImageFile = resolveMobileImageFileOption(options, projectRoot);
let mobileSceneRoutes = resolveMobileSceneRoutes(options, projectRoot);
if (!options.viewportExplicit && mobileSceneRoutes.length > 0) {
  options.viewport = "390x844";
}
const outDir = resolvePath(options.outDir ?? join(packageDir, "tmp", `unimaker-one-click-${Date.now()}-${process.pid}-${randomUUID()}`));
mkdirSync(outDir, { recursive: true });
const mobileContentSnapshot = await resolveMobileContentSnapshotOption(options, projectRoot, mobileSceneRoutes, outDir);
const beforeSnapshotPruneRouteCount = mobileSceneRoutes.length;
mobileSceneRoutes = pruneMobileSceneRoutesForContentSnapshot(mobileSceneRoutes, mobileContentSnapshot);
if (mobileSceneRoutes.length !== beforeSnapshotPruneRouteCount) {
  process.stderr.write(`  pruned content-unreachable mobile routes: ${beforeSnapshotPruneRouteCount - mobileSceneRoutes.length}\n`);
}
// Recomputed after applyMobileContentSnapshotToRoutes fans the content-detail template
// route out into one route per card (below) — this initial value only covers the
// pre-fanout catalog (used before the snapshot is applied).
let expectedMobileSceneRouteIds = expectedUniMakerMobileSceneRouteIds(projectRoot, options, mobileSceneRoutes);
const mobileSceneInitialRoute = options.mobileSceneInitialRoute ||
  mobileSceneRoutes[0]?.routeId ||
  "";
if (options.retainedSceneOnly) {
  if (options.stopAfter !== "materialize" && options.stopAfter !== "extract") {
    fail("--retained-scene-only requires --stop-after materialize or extract");
  }
  if (options.stopAfter === "materialize" && mobileSceneRoutes.length === 0) {
    fail("--retained-scene-only requires mobile scene routes for materialize");
  }
}
const projectTsConfig = join(projectRoot, "tsconfig.json");
const entryRoots = options.entryRoots.length > 0
  ? options.entryRoots
  : ["app/main.tsx", "app/App.tsx", "app/libp2p/index.ts"];

const jsonlFactsPath = join(outDir, "unimaker-react.csgweb");
const csgcFactsPath = join(outDir, "unimaker-react.csgc");
const sceneFactsPath = join(outDir, "unimaker-react.scene.csgc");
const sceneRuntimeSourcePath = join(outDir, "unimaker-react.scene-runtime.cheng");
const sceneGlyphSdfPrecomputeSourcePath = join(outDir, "unimaker-react.scene-glyph-sdf-precompute.cheng");
const sceneGlyphSdfPrecomputeExePath = join(outDir, "unimaker-react.scene-glyph-sdf-precompute");
const sceneGlyphSdfPrecomputeReportPath = join(outDir, "unimaker-react.scene-glyph-sdf-precompute.report.txt");
const sceneGlyphSdfPrecomputeOutputPath = join(outDir, "unimaker-react.scene-glyph-sdf-precompute.out");
const sceneGlyphSdfPrecomputePixelOutputPath = join(outDir, "unimaker-react.scene-glyph-sdf-precompute.pixels.bin");
const sceneGlyphSdfPrecomputeGuardReceiptPath = join(outDir, "unimaker-react.scene-glyph-sdf-precompute.guard.receipt.txt");
const sceneGlyphSdfPrecomputeGuardStderrPath = join(outDir, "unimaker-react.scene-glyph-sdf-precompute.guard.stderr.txt");
const sceneGlyphSdfPrecomputeCacheDirOverride = process.env.UNIMAKER_GLYPH_CACHE_DIR || "";
const sceneGlyphSdfPrecomputeCacheDir = sceneGlyphSdfPrecomputeCacheDirOverride
  ? join(sceneGlyphSdfPrecomputeCacheDirOverride)
  : join(packageDir, "tmp", "unimaker-glyph-sdf-precompute-cache");
// Campaign C R1: row-table glyph mode activates via --glyph-row-tables flag;
// legacy statement mode is the default fallback via UNIMAKER_GLYPH_STATEMENTS.
const useGlyphRowTables = process.argv.includes("--glyph-row-tables")
  && process.env.UNIMAKER_GLYPH_STATEMENTS !== "1";
// Multi-lane isolation: concurrent lanes sharing this checkout each prune the
// shared cache to their own key (retain-N), wiping entries mid-run. A lane that
// opts in via UNIMAKER_EXTRACT_CACHE_DIR gets a private cache directory; the
// default stays the shared path.
const extractCacheDir = String(process.env.UNIMAKER_EXTRACT_CACHE_DIR ?? "").trim()
  || join(packageDir, "tmp", "extract-cache");
const extractCacheSchema = "unimaker.extract-cache.v1";
const extractCacheRetainKeys = options.keepExtractCache ? 1 : 0;
const sceneMobileDataAssetPath = join(outDir, sceneMobileDataAssetRelPath);
const sceneGlyphSdfPixelAssetPath = join(outDir, sceneMobileGlyphSdfPixelAssetRelPath);
const computerUseManifestRelPath = "runtime/unimaker_computer_use_manifest.json";
const computerUseManifestPath = join(outDir, computerUseManifestRelPath);
const webReportPath = join(outDir, "unimaker-react.web.report.json");
const fullWebReportPath = join(outDir, "unimaker-react.web.report.full.json.gz");
const domCssCoveragePath = join(outDir, "unimaker-react.dom-css.coverage.json");
const routeReachabilityPath = join(outDir, "unimaker-react.route-reachability.json");
const routeEdgeDetailsPath = join(outDir, "unimaker-react.route-edge-details.json");
const sceneManifestPath = join(outDir, "unimaker-react.scene-manifest.json");
const sourcePath = join(outDir, "unimaker-react.cheng");
const exePath = join(outDir, "unimaker-react");
const compileReportPath = join(outDir, "unimaker-react.compile.report.txt");
const runGuardReceiptPath = join(outDir, "unimaker-react.run.guard.receipt.txt");
const runGuardStdoutPath = options.runOutputFile ?? join(outDir, "unimaker-react.run.stdout.txt");
const runGuardStderrPath = join(outDir, "unimaker-react.run.stderr.txt");
const processTreeGuardPath = join(repoRoot, "tools", "beat_c_process_group_guard.sh");
const cheng = resolvePath(options.cheng ?? join(repoRoot, "artifacts", "bootstrap", "cheng.stage3"));
const intermediateFactPaths = [
  jsonlFactsPath,
  csgcFactsPath,
  join(outDir, "unimaker-react.csgc.debug"),
  sceneFactsPath,
];

assert.equal(existsSync(projectTsConfig), true, `missing UniMaker tsconfig: ${projectTsConfig}`);
if (!existsSync(cheng)) fail(`missing Cheng compiler: ${cheng}`);

const startedAt = Date.now();
const stageTimings = [];
memoryTrace("start");

// Step 1: CSG-Web extraction
process.stderr.write(`[1/4] Extracting CSG-Web facts from UniMaker React.js...\n`);
if (!existsSync(join(packageDir, "dist", "csg-web.js"))) {
  await runCommand("npm", ["run", "build"], {
    cwd: packageDir,
    timeout: options.buildTimeoutMs,
  });
}
mkdirSync(outDir, { recursive: true });
memoryTrace("after npm build");
const { emitCsgWebFromTsAsync } = await import(pathToFileURL(join(packageDir, "dist", "csg-web.js")).href);

const skipPrimaryCsgcWrite = options.retainedSceneOnly &&
  !options.keepIntermediateFacts &&
  (options.emit === "csgc" || options.emit === "both");
const includeExtractDebugMaps = !options.noDebug && !skipPrimaryCsgcWrite;
const extractOptions = {
  project: projectTsConfig,
  rootDir: projectRoot,
  runtime: options.runtime,
  entryRoots,
  emitText: options.emit === "jsonl" || options.emit === "both",
  includeDebugMaps: includeExtractDebugMaps,
};
// Content-addressed extract cache (retained-scene-only production path only).
// A cache hit skips the entire TS Program + type check (~14s) and replays the
// prior facts/report/text. The key covers every input that can change the facts:
// extractor code (dist *.js), TypeScript version + compilerOptions, every project
// source file in the tsconfig include closure, tsconfig/references, the dependency
// lockfile, and the extract-relevant CLI options. Any change → different key → miss.
const extractCacheEnabled = options.retainedSceneOnly;
const extractCacheKeyOverride = String(process.env.UNIMAKER_RETAINED_EXTRACT_CACHE_KEY_OVERRIDE ?? "").trim();
let extractResult;
let extractCacheInfo = null;
if (extractCacheEnabled) {
  const keyInfo = await computeExtractCacheKey(extractOptions);
  const extractCacheKey = /^[0-9a-f]{64}$/u.test(extractCacheKeyOverride) ? extractCacheKeyOverride : keyInfo.key;
  if (extractCacheKey !== keyInfo.key) {
    process.stderr.write(`  extract cache: explicit key override ${extractCacheKey.slice(0, 16)} (computed ${keyInfo.key.slice(0, 16)}); using retained facts from the prior validated extraction\n`);
  }
  memoryTrace("after extract cache key");
  const cached = await withCacheDirectoryLock(extractCacheDir, () => {
    const value = readExtractCache(extractCacheKey);
    if (value !== null) pruneExtractCache(extractCacheKey);
    return value;
  });
  if (cached !== null) {
    extractResult = cached;
    extractCacheInfo = {
      schema: extractCacheSchema,
      cacheHit: true,
      cacheKey: extractCacheKey,
      sourceFileCount: keyInfo.sourceFileCount,
      cacheDir: extractCacheDir,
      cacheBytes: cached.cacheBytes,
    };
    process.stderr.write(`  extract cache: hit key=${extractCacheKey.slice(0, 16)} facts=${extractResult.facts.length} (skipped TS program)\n`);
  } else if (extractCacheKey !== keyInfo.key) {
    fail(`extract cache: explicit key override ${extractCacheKey.slice(0, 16)} has no retained facts file in ${extractCacheDir}`);
  } else {
    extractResult = await emitCsgWebFromTsAsync(extractOptions);
    let cacheBytes = 0;
    if (extractResult.diagnostics.length === 0) {
      cacheBytes = await withCacheDirectoryLock(extractCacheDir, () => writeExtractCache(extractCacheKey, extractResult));
      process.stderr.write(`  extract cache: miss key=${extractCacheKey.slice(0, 16)} facts=${extractResult.facts.length} → wrote ${(cacheBytes / 1048576).toFixed(1)}MB\n`);
    }
    extractCacheInfo = {
      schema: extractCacheSchema,
      cacheHit: false,
      cacheKey: extractCacheKey,
      sourceFileCount: keyInfo.sourceFileCount,
      cacheDir: extractCacheDir,
      cacheBytes,
    };
  }
} else {
  extractResult = await emitCsgWebFromTsAsync(extractOptions);
}

if (extractResult.diagnostics.length > 0 && !options.tolerateDiagnostics) {
  fail(`CSG-Web diagnostics:\n${extractResult.diagnostics.join("\n")}`);
}
if (extractResult.diagnostics.length > 0) {
  process.stderr.write(`  tolerated ${extractResult.diagnostics.length} extract diagnostic(s) (--tolerate-diagnostics)\n`);
}
memoryTrace("after extract");

const extractedFactCount = extractResult.facts.length;
let primaryFactsPath = "";
let materializerInput = "";
if (options.emit === "jsonl" || options.emit === "both") {
  if (extractResult.text.length === 0) fail("JSONL emit requested but extractor did not materialize facts text");
  writeFileSync(jsonlFactsPath, extractResult.text, "utf8");
  primaryFactsPath = jsonlFactsPath;
  materializerInput = extractResult.text;
}
writeFileSync(webReportPath, JSON.stringify(compactWebReport(extractResult.report), null, 2) + "\n", "utf8");
if (options.fullReport) {
  writeFileSync(fullWebReportPath, gzipSync(JSON.stringify(extractResult.report)));
}
const computerUseManifest = writeComputerUseManifest(
  computerUseManifestPath,
  computerUseManifestRelPath,
  extractResult.facts,
  extractResult.report,
);
process.stderr.write(`  computer-use manifest: templates=${computerUseManifest.counts.voiceTaskTemplates}, actions=${computerUseManifest.counts.computerUseActions} → ${computerUseManifestPath}\n`);
collectStageGarbage();
memoryTrace("after web report");

let materializerDebugFactsCompacted = false;
let materializerDebugFactsRemoved = 0;
function compactExtractDebugFactsForMaterializer() {
  if (materializerDebugFactsCompacted) return;
  materializerDebugFactsCompacted = true;
  materializerDebugFactsRemoved = compactDebugMapFactsForMaterializer(extractResult.facts);
  if (materializerDebugFactsRemoved > 0) {
    process.stderr.write(`  materializer input: removed ${materializerDebugFactsRemoved} debug_map facts after writing debug sidecar\n`);
  }
}

if (skipPrimaryCsgcWrite) {
  compactExtractDebugFactsForMaterializer();
  process.stderr.write(`  csgc: skipped retained-scene-only\n`);
  collectStageGarbage();
  memoryTrace("after retained scene-only csgc skip");
} else if (options.emit === "csgc" || options.emit === "both") {
  const { csgcWriteFacts, csgcWriteDebugFile } = await import(pathToFileURL(join(packageDir, "dist", "csgc-writer.js")).href);

  // Held-pack content cache (2026-08-31, device-line build-speed campaign):
  // csgcWriteDebugFile + csgcWriteFacts each invoke the held CLI pack on the
  // SAME facts array (~12-15 min per pack, single-core). Pack once, reuse for
  // both writes, and persist by a sha256 fingerprint of the canonical fact
  // stream so identical-input rebuilds skip the pack entirely. Cache keys are
  // exact content hashes — a stale hit is impossible by construction.
  const bridge = await import(pathToFileURL(join(packageDir, "dist", "csg-cheng-bridge.js")).href);
  const { createHash } = await import("node:crypto");
  // artifacts/ is the retained zone (tmp/ gets hygiene-swept, which would
  // silently discard the pack cache every sweep).
  const heldPackCacheDir = join(repoRoot, "artifacts", "held-pack-cache");
  mkdirSync(heldPackCacheDir, { recursive: true });
  const fpHash = createHash("sha256");
  for (const fact of extractResult.facts) {
    fpHash.update(JSON.stringify(fact));
    fpHash.update("\n");
  }
  const packFingerprint = fpHash.digest("hex");
  const packCacheCsgc = join(heldPackCacheDir, `${packFingerprint}.csgc`);
  const packCacheMeta = join(heldPackCacheDir, `${packFingerprint}.json`);
  let packBytes;
  let packStats;
  const packT0 = Date.now();
  if (existsSync(packCacheCsgc) && existsSync(packCacheMeta)) {
    packBytes = readFileSync(packCacheCsgc);
    packStats = JSON.parse(readFileSync(packCacheMeta, "utf8"));
    process.stderr.write(`  held-pack cache HIT ${packFingerprint.slice(0, 12)}: ${packBytes.length} bytes (${packStats.factCount} facts) — saved ~2x held CLI pack\n`);
  } else {
    const packed = bridge.chengCsgPackFacts(extractResult.facts);
    packBytes = Buffer.from(packed.bytes);
    packStats = {
      factCount: packed.factCount,
      headerSize: packed.headerSize,
      flags: packed.flags,
      canonicalJsonlBytes: packed.canonicalJsonlBytes,
      heldLauncher: "verified-at-pack-time",
      packedAtMs: packT0,
    };
    const tmpCsgc = packCacheCsgc + ".tmp";
    writeFileSync(tmpCsgc, packBytes);
    renameSync(tmpCsgc, packCacheCsgc);
    writeFileSync(packCacheMeta, JSON.stringify(packStats), "utf8");
    process.stderr.write(`  held-pack cache MISS ${packFingerprint.slice(0, 12)}: packed ${packBytes.length} bytes (${packStats.factCount} facts) in ${((Date.now() - packT0) / 1000) | 0}s — stored for reuse\n`);
  }

  // Build write options from CLI flags
  const writeOpts = {};
  const autoSeparate = (options.emit === "csgc" || options.emit === "both") && !options.noSeparateDebug;
  if (options.noDebug) {
    writeOpts.includeDebugMaps = false;
  } else if (options.separateDebug || autoSeparate) {
    writeOpts.separateDebug = true;
  }
  const separateDebug = writeOpts.separateDebug === true;
  if (separateDebug && !options.noDebug) {
    const debugPath = join(outDir, "unimaker-react.csgc.debug");
    writeFileSync(debugPath, packBytes);
    process.stderr.write(`  csgc.debug: ${packBytes.length} bytes\n`);
  }
  collectStageGarbage();
  memoryTrace("after csgc debug sidecar");

  if (options.noDebug || separateDebug) {
    compactExtractDebugFactsForMaterializer();
  }

  const mainWriteOpts = separateDebug
    ? { ...writeOpts, writeSeparateDebugBuffer: false }
    : writeOpts;
  {
    const factsBuffer = packBytes;
    const stats = packStats;
    writeFileSync(csgcFactsPath, factsBuffer);
    primaryFactsPath = csgcFactsPath;
    materializerInput = csgcFactsPath;
    void mainWriteOpts;
    process.stderr.write(`  csgc: ${stats.byteSize} bytes (${stats.factCount} facts)\n`);
  }
  collectStageGarbage();
  memoryTrace("after csgc main");

  compactExtractDebugFactsForMaterializer();
}
memoryTrace("after csgc/shards");

const webReport = extractResult.report;
const closure = webReport.runtimeClosure;
process.stderr.write(`  facts: ${extractedFactCount} facts\n`);
process.stderr.write(`  source files: ${webReport.counts.sourceFiles}\n`);
process.stderr.write(`  JS functions: ${webReport.counts.jsFunctions}\n`);
process.stderr.write(`  JSX elements: ${webReport.counts.jsxElements}\n`);
process.stderr.write(`  DOM node templates: ${webReport.counts.domNodeTemplates}\n`);
process.stderr.write(`  runtime requirements: ${closure.requirementCount} total, ${closure.openRequirementCount} open\n`);
process.stderr.write(`  external symbols: ${closure.externalSymbolCount} total, ${closure.openExternalSymbolCount} open\n`);

if (options.stopAfter === "extract") {
  const removedIntermediateFacts = cleanupIntermediateFactFiles();
  if (removedIntermediateFacts.length > 0) {
    process.stderr.write(`  removed intermediate facts: ${removedIntermediateFacts.map((file) => file.replace(outDir + "/", "")).join(", ")}\n`);
  }
  process.stdout.write(`unimaker-one-click extract ok\n`);
  process.stdout.write(`facts: ${options.keepIntermediateFacts ? primaryFactsPath : ""}\n`);
  process.stdout.write(`web report: ${webReportPath}\n`);
  return;
}

compactExtractDebugFactsForMaterializer();
memoryTrace("before materializer session");

// Step 2: Validation + Materialization
process.stderr.write(`[2/4] Materializing CSG-Web facts to Cheng source...\n`);
const { validateCsgWebText } = await import(pathToFileURL(join(packageDir, "dist", "csg-web.js")).href);
const {
  createCsgWebMaterializerSession,
  defaultMobileRouteContents,
  defaultMobileRouteMediaPayloadAssetsForFacts,
  materializeCsgWebSessionToChengSource,
  setAllowDroppedJsxShapes,
  emitCsgWebSessionToSceneFacts,
} = await import(pathToFileURL(join(packageDir, "dist", "csg-web-materializer.js")).href);
// Coverage meter: dropped JSX child shapes fail unless explicitly allow-listed here.
setAllowDroppedJsxShapes(options.allowDroppedShapes);

if (options.emit === "jsonl" || options.emit === "both") {
  const validation = validateCsgWebText(extractResult.text);
  if (!validation.ok) {
    fail(`CSG-Web validation failed:\n${validation.diagnostics.join("\n")}`);
  }
}

const materializerSession = createCsgWebMaterializerSession(extractResult.facts);
memoryTrace("after materializer session");
const mobileMediaOptions = await resolveMobileMediaOptionsForSnapshot(mobileContentSnapshot, outDir, options);
// Per-card fan-out: each distinct video content id in the snapshot gets its own real source
// file (see resolveMobileVideoFileMapForSnapshot's comment) instead of every card sharing
// mobileMediaOptions.mobileVideoFile's single auto-selected asset.
const mobileVideoFileMapForSnapshot = resolveMobileVideoFileMapForSnapshot(mobileContentSnapshot, options, projectRoot);
// Poster half of the same fan-out (resolveMobileVideoPosterFileMapForSnapshot's comment):
// each distinct video content id resolves its OWN poster PNG from ITS OWN tinyPreview/coverMedia.
const mobileVideoPosterFileMapForSnapshot = await resolveMobileVideoPosterFileMapForSnapshot(mobileContentSnapshot, outDir);
if (mobileContentSnapshot !== null) {
  mobileSceneRoutes = applyMobileContentSnapshotToRoutes(
    mobileSceneRoutes,
    mobileContentSnapshot.contents,
    defaultMobileRouteContents(mobileMediaOptions),
    mobileMediaOptions,
    mobileVideoFileMapForSnapshot,
    mobileVideoPosterFileMapForSnapshot,
    mobileContentSnapshot.nodes,
  );
  // The fan-out above can replace one template route with N per-card routes (or drop it
  // to 0) — re-derive the expected route id set from the POST-fanout route list so the
  // route inventory gate (below) checks against what was actually asked for.
  expectedMobileSceneRouteIds = expectedUniMakerMobileSceneRouteIds(projectRoot, options, mobileSceneRoutes);
  process.stderr.write(`  PWA content snapshot: ${mobileContentSnapshot.contents.length} items from ${mobileContentSnapshot.source}\n`);
  if (mobileVideoPosterFileMapForSnapshot.size > 0) {
    process.stderr.write(`  per-card video posters: ${[...mobileVideoPosterFileMapForSnapshot.entries()].map(([id, path]) => `${id}=${path}`).join(", ")}\n`);
  }
  if (mobileVideoFileMapForSnapshot.size > 0) {
    process.stderr.write(`  per-card video assets: ${[...mobileVideoFileMapForSnapshot.entries()].map(([id, path]) => `${id}=${path}`).join(", ")}\n`);
  }
}
let materialized = {
  diagnostics: [],
  text: "",
  marker: "",
  counts: {
    facts: extractedFactCount,
    elements: 0,
    textLiterals: 0,
    props: 0,
  },
};
const extraCssText = options.cssFiles.length > 0 ? options.cssFiles.map((file) => readFileSync(file, "utf8")).join("\n") : "";
if (extraCssText.length > 0) process.stderr.write(`  extra css: ${extraCssText.length} chars from ${options.cssFiles.length} file(s)\n`);
if (!options.retainedSceneOnly) {
  materialized = materializeCsgWebSessionToChengSource(materializerSession, {
    frameLimit: options.frameLimit,
    dumpMode: options.dump,
    rawPixelDump: options.rawPixelDump,
    extraCssText,
    mobileMultiFrameDump: options.mobileMultiFrameDump,
    pureCheng: true,
    mobileAppExports: mobileSceneRoutes.length > 0,
    mobileInitialRoute: mobileSceneInitialRoute,
    mobileRoutes: mobileSceneRoutes,
    mobileVideoFile: options.mobileVideoFile,
    mobileVideoPosterFile: mobileMediaOptions.mobileVideoPosterFile,
    mobileImageFile: options.mobileImageFile,
    viewport: options.viewport,
    rootText: options.rootText,
    rootSource: options.rootSource,
    undecidableGuardFallback: options.undecidableGuardFallback,
    fontBase64: "",
  });
  if (materialized.diagnostics.length > 0) {
    reportStageDiagnostics("Materializer diagnostics", materialized.diagnostics);
  }
}
memoryTrace(options.retainedSceneOnly ? "after retained scene-only source skip before font" : "after materialize without embedded font");
const sceneFactsForFontText = emitCsgWebSessionToSceneFacts(materializerSession, {
  frameLimit: options.frameLimit,
  dumpMode: options.dump,
  rawPixelDump: options.rawPixelDump,
  extraCssText,
  pureCheng: true,
  mobileAppExports: mobileSceneRoutes.length > 0,
  mobileInitialRoute: mobileSceneInitialRoute,
  mobileRoutes: mobileSceneRoutes,
  mobileVideoFile: options.mobileVideoFile,
  mobileVideoPosterFile: mobileMediaOptions.mobileVideoPosterFile,
  mobileImageFile: options.mobileImageFile,
  viewport: options.viewport,
  rootText: options.rootText,
  rootSource: options.rootSource,
  undecidableGuardFallback: options.undecidableGuardFallback,
  fontBase64s: [],
  fontWeights: [],
  fontFamilies: [],
});
if (sceneFactsForFontText.diagnostics.length > 0) {
  reportStageDiagnostics("Scene fact diagnostics before font embedding", sceneFactsForFontText.diagnostics);
}
memoryTrace("after scene facts for font");
const dynamicStateTextGlyphInventory = collectDynamicStateTextGlyphInventory(projectRoot, sceneFactsForFontText.facts);
const computerUseTextGlyphInventory = process.env.UNIMAKER_NO_GB2312_FLOOR === "1" ? "" : "小优胡广生二手广告视频短视频发布搜索距离最近公里标题文案描述商品购买点赞喜欢内容消息聊天记录翻看打开页面这条个并";
// Runtime-generated text (geocoded addresses, peer names, typed input) can
// carry any standard Chinese char; bake the GB2312 floor into the subsets so
// on-demand rasterization always finds a face (device glyph_fail=773 root).
// Iteration knob: the GB2312 floor (~6763 Han glyphs ≈ 92% of the emitted cheng
// source and the dominant compile-time cost) is only needed for CJK user content.
// UNIMAKER_NO_GB2312_FLOOR=1 drops it for Latin-only iteration loops (keep it for
// 1:1 parity builds).
const runtimeGeneratedTextGlyphInventory = process.env.UNIMAKER_NO_GB2312_FLOOR === "1" ? "" : gb2312HanGlyphInventory();
const preparedFont = await prepareFontCascadeBase64({
  fontFaces: options.fontFaces.length > 0 ? options.fontFaces : options.fontFiles,
  sourceText: [
    materialized.text,
    sceneFactsTextForFontSubset(sceneFactsForFontText.facts),
    dynamicStateTextGlyphInventory,
    computerUseTextGlyphInventory,
    runtimeGeneratedTextGlyphInventory,
  ].filter((part) => part.length > 0).join("\n"),
  outDir,
  label: "unimaker-react",
  subset: options.fontSubset,
  maxBytes: options.fontMaxBytes,
  timeoutMs: options.fontSubsetTimeoutMs,
  fontNumber: options.fontNumber,
  requireFullCoverage: true,
  cascadeTolerantText: runtimeGeneratedTextGlyphInventory,
  weight400OnlyText: runtimeGeneratedTextGlyphInventory,
});
memoryTrace("after font prepare");
if (preparedFont.base64s.length > 0) {
  process.stderr.write(`  font ${preparedFont.info.mode}: ${preparedFont.info.byteSize} bytes (${preparedFont.info.base64Chars} base64 chars, faces=${preparedFont.base64s.length})\n`);
  if (!options.retainedSceneOnly) {
    materialized = materializeCsgWebSessionToChengSource(materializerSession, {
    frameLimit: options.frameLimit,
    dumpMode: options.dump,
    rawPixelDump: options.rawPixelDump,
    extraCssText,
    mobileMultiFrameDump: options.mobileMultiFrameDump,
    pureCheng: true,
    mobileAppExports: mobileSceneRoutes.length > 0,
    mobileInitialRoute: mobileSceneInitialRoute,
    mobileRoutes: mobileSceneRoutes,
    mobileVideoFile: options.mobileVideoFile,
    mobileVideoPosterFile: mobileMediaOptions.mobileVideoPosterFile,
    mobileImageFile: options.mobileImageFile,
    viewport: options.viewport,
    rootText: options.rootText,
    rootSource: options.rootSource,
    undecidableGuardFallback: options.undecidableGuardFallback,
    fontBase64s: preparedFont.base64s,
    fontWeights: preparedFont.base64Weights,
    fontFamilies: preparedFont.base64Families,
    });
    if (materialized.diagnostics.length > 0) {
      reportStageDiagnostics("Materializer diagnostics after font embedding", materialized.diagnostics);
    }
  }
  memoryTrace(options.retainedSceneOnly ? "after retained scene-only source skip with embedded font" : "after materialize with embedded font");
}

const sceneFacts = injectPreparedFontResourcesIntoSceneFacts(sceneFactsForFontText, preparedFont);
memoryTrace("after final scene facts");
const routeInventory = analyzeMobileSceneRouteInventory(sceneFacts.facts, expectedMobileSceneRouteIds, mobileSceneRoutes);
if (routeInventory.required && !routeInventory.complete) {
  fail(`UniMaker route inventory incomplete: missingExpected=${routeInventory.missingExpectedRoutes.join(",") || "none"}, missingRequested=${routeInventory.missingRequestedRoutes.join(",") || "none"}`);
}
const routeReachability = analyzeMobileSceneRouteReachability(sceneFacts.facts, mobileSceneInitialRoute, options.mobileSceneDirectRoutes);
writeFileSync(routeReachabilityPath, JSON.stringify(routeReachability, null, 2) + "\n", "utf8");
const routeEdgeDetails = buildSceneRouteEdgeDetails(sceneFacts.facts);
writeFileSync(routeEdgeDetailsPath, JSON.stringify(routeEdgeDetails, null, 2) + "\n", "utf8");
const domCssCoverage = analyzeSceneDomCssCoverage(sceneFacts.facts, {
  viewport: options.viewport,
  expectedRoutes: expectedMobileSceneRouteIds,
});
writeSceneDomCssCoverageReport(domCssCoveragePath, domCssCoverage);
if (options.requireDomCssCoverage && !domCssCoverage.complete) {
  fail(`${sceneDomCssCoverageFailureMessages(domCssCoverage).join("\n")}\ncoverage report: ${domCssCoveragePath}`);
}
const { csgcWriteFacts: csgcWriteSceneFacts } = await import(pathToFileURL(join(packageDir, "dist", "csgc-writer.js")).href);
let sceneWriteStats = null;
function writeCurrentSceneFactsCsgc() {
  if (options.retainedSceneOnly && !options.keepIntermediateFacts) {
    return {
      byteSize: 0,
      factCount: sceneFacts.facts.length,
      skipped: true,
    };
  }
  if (options.keepIntermediateFacts) {
    // Post-CHT census mirror (see the stop-after scene-facts dump): the packed csgc
    // round-trips the production-authority held CLI, so offline gates read this
    // plain-JSONL mirror of the exact in-memory fact set being packed.
    writeFileSync(join(outDir, "unimaker-react.scene.debug.jsonl"), sceneFacts.facts.map((f) => JSON.stringify(f)).join("\n") + "\n");
    process.stderr.write(`  scene debug jsonl: ${sceneFacts.facts.length} facts (post-CHT)\n`);
  }
  const sceneWrite = csgcWriteSceneFacts(sceneFacts.facts, { includeDebugMaps: false });
  writeFileSync(sceneFactsPath, sceneWrite.factsBuffer);
  return sceneWrite.stats;
}
function logSceneFactsCsgcStats(stats) {
  const prefix = stats?.skipped ? "skipped retained-scene-only" : `${stats.byteSize} bytes`;
  process.stderr.write(`  scene csgc: ${prefix} (${stats.factCount} facts, routes=${sceneFacts.counts.routes}, nodes=${sceneFacts.counts.nodes}, layouts=${sceneFacts.counts.layouts}, paints=${sceneFacts.counts.paints})\n`);
}
let glyphSdfPrecomputeInfo = null;
let mediaPayloadAssets = [];
let compiledHandlerTableSummary = null;
if (process.env.UNIMAKER_WRITE_SCENE_DATA_BEFORE_GLYPH === "1") {
  const debugSceneDataAsset = writeSceneMobileDataAsset(sceneFacts.facts, sceneMobileDataAssetPath, materialized.imageAssets ?? []);
  process.stderr.write(`  scene data asset (pre-glyph debug): bytes=${debugSceneDataAsset.byteCount}, crc32=${debugSceneDataAsset.crc32Hex} → ${sceneMobileDataAssetPath}\n`);
}
  process.stderr.write(`  DOM/CSS coverage: complete=${domCssCoverage.complete}, hardFailures=${domCssCoverage.hardFailureCount} → ${domCssCoveragePath}\n`);
  if (routeInventory.required) {
    process.stderr.write(`  route inventory: complete=${routeInventory.complete}, expected=${routeInventory.expectedRouteCount}, generated=${routeInventory.generatedRouteCount}\n`);
  }
  process.stderr.write(`  route reachability: complete=${routeReachability.complete}, reachable=${routeReachability.reachableRouteCount}/${routeReachability.routeCount}, edges=${routeReachability.edgeCount} → ${routeReachabilityPath}\n`);
  if (!routeReachability.complete) {
    process.stderr.write(`  route unreachable: withoutIncomingEdge=${routeReachability.unreachableWithoutIncomingEdgeRouteCount}, withIncomingEdge=${routeReachability.unreachableWithIncomingEdgeRouteCount}\n`);
  }
  memoryTrace("after dom/css and route reachability");
  if (options.stopAfter === "scene-facts") {
    sceneWriteStats = writeCurrentSceneFactsCsgc();
    if (options.keepIntermediateFacts) {
      // Census/debug facility: plain-JSONL mirrors of the in-memory fact sets. The
      // held-CLI unpack path is production-authority-gated (and the installed CLI
      // rejects newer pack shapes), so offline measurement scripts read these.
      writeFileSync(join(outDir, "unimaker-react.core.debug.jsonl"), extractResult.facts.map((f) => JSON.stringify(f)).join("\n") + "\n");
      writeFileSync(join(outDir, "unimaker-react.scene.debug.jsonl"), sceneFacts.facts.map((f) => JSON.stringify(f)).join("\n") + "\n");
      process.stderr.write(`  debug jsonl: core=${extractResult.facts.length} scene=${sceneFacts.facts.length}\n`);
    }
    collectStageGarbage();
    memoryTrace("after scene csgc");
    logSceneFactsCsgcStats(sceneWriteStats);
    const removedIntermediateFactsAfterSceneFacts = cleanupIntermediateFactFiles();
    if (removedIntermediateFactsAfterSceneFacts.length > 0) {
      process.stderr.write(`  removed intermediate facts: ${removedIntermediateFactsAfterSceneFacts.map((file) => file.replace(outDir + "/", "")).join(", ")}\n`);
    }
    const sceneFactsElapsedMs = Date.now() - startedAt;
    const sceneFactsSummaryPath = join(outDir, "one-click.summary.json");
    writeFileSync(sceneFactsSummaryPath, JSON.stringify({
      schema: "unimaker.one-click.v1",
      projectRoot,
      entryRoots,
      facts: options.keepIntermediateFacts ? primaryFactsPath : "",
      factsFormat: options.emit,
      intermediateFactsKept: options.keepIntermediateFacts,
      webReport: webReportPath,
      fullWebReport: options.fullReport ? fullWebReportPath : "",
      domCssCoverage: domCssCoveragePath,
      routeReachability: routeReachabilityPath,
      routeEdgeDetails: routeEdgeDetailsPath,
      sceneFacts: options.keepIntermediateFacts ? sceneFactsPath : "",
      scene: sceneFacts.counts,
      domCss: {
        complete: domCssCoverage.complete,
        hardFailureCount: domCssCoverage.hardFailureCount,
        counts: domCssCoverage.counts,
      },
      routeInventory,
      routeReachability,
      mobileSceneRoutes: serializeMobileSceneRoutes(mobileSceneRoutes),
      mobileContentSnapshot: mobileContentSnapshotSummary(mobileContentSnapshot),
      mobileVideoFile: options.mobileVideoFile,
      mobileVideoPosterFile: mobileMediaOptions.mobileVideoPosterFile,
      mobileImageFile: options.mobileImageFile,
      materialized: materialized.counts,
      elapsedMs: sceneFactsElapsedMs,
      stage: "scene-facts",
      extractCache: extractCacheInfo,
      stageTimings,
    }, null, 2) + "\n", "utf8");
    process.stdout.write(`unimaker-one-click scene-facts ok\n`);
    process.stdout.write(`scene facts: ${options.keepIntermediateFacts ? sceneFactsPath : ""}\n`);
    process.stdout.write(`summary: ${sceneFactsSummaryPath}\n`);
    return;
  }
  if (mobileSceneRoutes.length > 0) {
    const glyphSdfAtlas = await precomputeSceneGlyphSdfAtlas(sceneFacts.facts, {
      initialRoute: mobileSceneInitialRoute,
      dynamicStateTextGlyphInventory,
      computerUseTextGlyphInventory,
      cheng,
      outDir,
      timeoutMs: options.glyphSdfPrecomputeTimeoutMs,
      emitMode: options.glyphSdfPrecomputeEmit,
      requireCacheHit: options.requireGlyphSdfPrecomputeCacheHit,
      keepDebugArtifacts: options.keepGlyphSdfPrecomputeDebug,
    });
    glyphSdfPrecomputeInfo = glyphSdfAtlas.precomputeInfo ?? null;
    memoryTrace("after glyph sdf precompute");
    // CHT: transpile invoke-fallback handlers into compiled Cheng (rewrites their effect
    // invoke:→compiled: IN PLACE before serialization, so the .bin carries the compiled tag).
    const compiledHandlerTable = await buildCompiledHandlerTable(extractResult.facts, sceneFacts.facts, { projectRoot });
    compiledHandlerTableSummary = summarizeCompiledHandlerTable(compiledHandlerTable, sceneFacts.facts);
    process.stderr.write(`  CHT: compiled ${compiledHandlerTable.count} handler(s)${compiledHandlerTable.count > 0 ? " [" + compiledHandlerTable.names.join(", ") + "]" : ""}\n`);
    const sceneManifest = buildReactSceneSemanticManifest(sceneFacts.facts);
    writeFileSync(sceneManifestPath, JSON.stringify(sceneManifest, null, 2) + "\n", "utf8");
    process.stderr.write(`  React scene manifest: routes=${sceneManifest.counts.routes}, nodes=${sceneManifest.counts.nodes}, props=${sceneManifest.counts.props}, eventHandlers=${sceneManifest.counts.event_handlers}, hitTargets=${sceneManifest.counts.hit_targets}, edges=${sceneManifest.counts.route_edges}, cssDecls=${sceneManifest.counts.css_declarations}, layouts=${sceneManifest.counts.layout_constraints} → ${sceneManifestPath}\n`);
    sceneWriteStats = writeCurrentSceneFactsCsgc();
    collectStageGarbage();
    memoryTrace("after scene csgc");
    logSceneFactsCsgcStats(sceneWriteStats);
    const sceneDataAsset = writeSceneMobileDataAsset(sceneFacts.facts, sceneMobileDataAssetPath, materialized.imageAssets ?? []);
    const glyphSdfPixelAsset = writeGlyphSdfPixelAsset(glyphSdfAtlas, sceneGlyphSdfPixelAssetPath);
    mediaPayloadAssets = writeDefaultSceneMediaPayloadAssets(
      sceneFacts.facts,
      outDir,
      (facts) => defaultMobileRouteMediaPayloadAssetsForFacts(
        facts,
        mobileMediaOptions,
        [...mobileVideoFileMapForSnapshot.entries()].map(([contentId, videoFile]) => ({
          ...mobileMediaOptions,
          mobileVideoFile: videoFile,
          mobileVideoPosterFile: mobileVideoPosterFileMapForSnapshot.get(contentId) || mobileMediaOptions.mobileVideoPosterFile,
        })),
      ),
    );
    const m2WiringCode = await buildM2HomeWiring(extractResult.facts, sceneFacts.facts);
    process.stderr.write(`  M2 wiring: ${m2WiringCode.split("\n").length} lines (reactive search/sort engine)\n`);
    const nodesWiringCode = await buildNodesRowWiring(extractResult.facts, sceneFacts.facts);
    process.stderr.write(`  nodes wiring: ${nodesWiringCode.length > 0 ? nodesWiringCode.split("\n").length : 0} lines (tab_nodes row rebind)\n`);
    let sceneRuntimeSource = emitSceneMobileRuntimeSource(sceneFacts.facts, {
      initialRoute: mobileSceneInitialRoute,
      viewport: options.viewport,
      sceneDataAsset,
      glyphSdfAtlas,
      glyphSdfPixelAsset,
      m2WiringCode,
      nodesWiringCode,
      compiledHandlerCode: compiledHandlerTable.code,
      needsJsonNode: compiledHandlerTable.needsJsonNode === true,
      // Mechanism 22: gates the overlay-app nav-stack push injection at the route-edge apply
      // path; the pop/close helper itself is emitted inside compiledHandlerTable.code.
      propCloseApp: compiledHandlerTable.needsPropCloseApp === true,
      // deferred-effect (setTimeout) + recv-done (await-split) resume cases share the async-frame
      // switch; asyncRecvDone gates the real-QUIC-done-signal runtime variant + the social wiring.
      asyncResumeCases: [...(compiledHandlerTable.asyncResumeCases || []), ...(compiledHandlerTable.recvDoneCases || [])],
      asyncRecvDone: compiledHandlerTable.asyncRecvDone === true,
      computerUseManifest,
    });
    memoryTrace("after scene runtime source");
    const semanticManifestBlockPath = join(scriptDir, "scene-semantic-manifest-block.cheng");
    if (existsSync(semanticManifestBlockPath)) {
      const semanticManifestBlock = readFileSync(semanticManifestBlockPath, "utf8");
      sceneRuntimeSource = `${sceneRuntimeSource}\n// @generated per-node/per-prop/per-edge semantic manifest diff exports\n${semanticManifestBlock}`;
      process.stderr.write(`  semantic manifest block: appended ${semanticManifestBlock.length} chars from ${semanticManifestBlockPath}\n`);
    } else {
      process.stderr.write(`  semantic manifest block: MISSING ${semanticManifestBlockPath}; runtime manifest diff exports will be absent\n`);
    }
    // Missing-record-type declaration pass: wiring builders reference app record
    // families (DistributedContent/WalletEntry/Piece/...) through injected or
    // derived type text without declaring them, and the cold linker hard-fails
    // every undeclared slot type (repro cold_parser "managed producer lacks exact
    // TypeId", repro pointer-field "requires -> not ." on an undeclared local).
    // Scan the final source for used-but-undeclared record names from the facts
    // type_decl set and emit their decl blocks transitively (member types map and
    // register through the same pass).
    {
      const { TranspilerFactIndex, TypeMapper } = await import(pathToFileURL(join(packageDir, "dist", "csg-cheng-transpiler.js")).href);
      const declared = new Set();
      for (const m of sceneRuntimeSource.matchAll(/^    ([A-Za-z0-9_]+) =$/gm)) declared.add(m[1]);
      for (const m of sceneRuntimeSource.matchAll(/^type ([A-Za-z0-9_]+)/gm)) declared.add(m[1]);
      const usedNames = new Set();
      for (const m of sceneRuntimeSource.matchAll(/:\s*([A-Z][A-Za-z0-9_]*)(\[\])?/g)) usedNames.add(m[1]);
      const missingTypes = [...usedNames].filter((n) => !declared.has(n) && !n.startsWith("Q_") && !String(n).startsWith("ChtInlineObj_"));
      if (missingTypes.length > 0) {
        const declIndex = new TranspilerFactIndex(extractResult.facts);
        const declTypes = new TypeMapper(declIndex);
        const emitted = [];
        for (const n of missingTypes) {
          if (!declIndex.typeDeclByName.has(n)) continue;
          declTypes.map(n);
          emitted.push(n);
        }
        const declCode = declTypes.emitStructs().code;
        // emitStructs dumps every usedStruct — including TRANSITIVE members already
        // declared elsewhere in the runtime (CHT inline-object blocks, Q_ aliases,
        // wiring-emitted families). Duplicate same-name decls split the cold layout
        // resolution (repro DistributedContentComment field-store layout mismatch),
        // so re-emit only the units whose name is genuinely absent, dropping
        // compiler-synthesized twins entirely.
        const units = [];
        let curUnit = null;
        for (const ln of declCode.split("\n")) {
          if (ln === "type" || ln.trim().length === 0) continue;
          const nm = ln.match(/^    ([A-Za-z0-9_]+) =$/);
          if (nm !== null) { curUnit = { name: nm[1], lines: [ln] }; units.push(curUnit); continue; }
          if (curUnit !== null) curUnit.lines.push(ln);
        }
        const keptUnits = units.filter((u) => {
          if (u.name.startsWith("Q_") || u.name.startsWith("ChtInlineObj_") || u.name.startsWith("ChtUnion_")) return false;
          if (declared.has(u.name)) return false;
          // late-kept units may satisfy an earlier unit's member — refresh the check
          return true;
        });
        const keptLines = keptUnits.flatMap((u) => u.lines);
        const declCode2 = keptLines.length > 0 ? ["type", ...keptLines].join("\n") : "";
        if (declCode2.length > 0) {
          sceneRuntimeSource = `${sceneRuntimeSource}\n\n# ===== missing record type declarations (assembly pass) =====\n${declCode2}\n`;
          process.stderr.write(`  missing record type decls: emitted ${keptUnits.length}: ${keptUnits.map((u) => u.name).join(", ")}\n`);
        } else {
          process.stderr.write(`  missing record type decls: ${missingTypes.length} used-undeclared names produced no decl (${missingTypes.slice(0, 6).join(", ")})\n`);
        }
      }
    }
    writeFileSync(sceneRuntimeSourcePath, sceneRuntimeSource, "utf8");
    // managed-args pass v3+: rewrite CSG-emitted runtime to satisfy the exact
    // consumption discipline (entry snapshots, per-use fresh rebuilds, str
    // copies, chained extractors). Failure is fatal — an unpassable runtime
    // cannot compile downstream anyway (Let it crash).
    {
      const { spawnSync } = await import("node:child_process");
      const passScript = join(scriptDir, "materialize-managed-args-pass.mjs");
      const passRun = spawnSync(process.execPath, [passScript, sceneRuntimeSourcePath], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
      const topoScript = join(scriptDir, "materialize-type-topo-pass.mjs");
      const topoRun = spawnSync(process.execPath, [topoScript, sceneRuntimeSourcePath], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
      if (topoRun.status !== 0) {
        process.stderr.write(topoRun.stdout ?? "");
        process.stderr.write(topoRun.stderr ?? "");
        throw new Error(`type-topo-pass failed on ${sceneRuntimeSourcePath}`);
      }
      process.stderr.write(`  type-topo-pass: ${(topoRun.stdout ?? "").trim()}\n`);
      if (passRun.status !== 0) {
        process.stderr.write(passRun.stdout ?? "");
        process.stderr.write(passRun.stderr ?? "");
        throw new Error(`managed-args-pass failed on ${sceneRuntimeSourcePath}`);
      }
      process.stderr.write(`  managed-args-pass: ${(passRun.stdout ?? "").trim().split("\n").pop() ?? ""}\n`);
      const rewritten = readFileSync(sceneRuntimeSourcePath, "utf8");
      process.stderr.write(`  retained scene runtime source (pass-adjusted): ${rewritten.length} chars\n`);
    }
    process.stderr.write(`  scene data asset: bytes=${sceneDataAsset.byteCount}, crc32=${sceneDataAsset.crc32Hex} → ${sceneMobileDataAssetPath}\n`);
    const glyphCacheLabel = glyphSdfPrecomputeInfo?.cacheHit ? " cache=hit" : " cache=miss";
    process.stderr.write(`  glyph SDF precompute: glyphs=${glyphSdfAtlas.glyphCount}, runs=${glyphSdfAtlas.runCount}, pixels=${glyphSdfAtlas.pixels.length}${glyphCacheLabel}\n`);
    process.stderr.write(`  glyph SDF pixel asset: bytes=${glyphSdfPixelAsset.byteCount}, crc32=${glyphSdfPixelAsset.crc32Hex} → ${sceneGlyphSdfPixelAssetPath}\n`);
    process.stderr.write(`  media payload assets: ${mediaPayloadAssets.map((asset) => `${asset.kind}:${asset.byteCount}b:${asset.assetCid.slice(0, 12)}`).join(", ")}\n`);
    process.stderr.write(`  retained scene runtime source: ${sceneRuntimeSource.length} chars → ${sceneRuntimeSourcePath}\n`);
  }

if (sceneWriteStats === null) {
  sceneWriteStats = writeCurrentSceneFactsCsgc();
  collectStageGarbage();
  memoryTrace("after scene csgc");
  logSceneFactsCsgcStats(sceneWriteStats);
}

if (!options.retainedSceneOnly) {
  writeFileSync(sourcePath, materialized.text, "utf8");
}
  // CSG emitter places shared scene-runtime helpers (font faces, image pixels)
  // in the retained runtime module while emitting UNQUALIFIED call sites into
  // the entry source, which does not even import that module. The resolver
  // does not resolve bare cross-module names, so qualify every such call and
  // add the runtime import explicitly.
  {
    let entryText = materialized.text;
    const needsQualify = /(^|[^\w.])__csg_scene_[a-z0-9_]*\(/.test(entryText);
    const hasImport = /^import cheng\/\.tmp-exec\/unimaker-react_scene_runtime as csgSceneRuntime$/m.test(entryText);
    if (needsQualify && !hasImport) {
      const lines = entryText.split("\n");
      const fi = lines.findIndex((l) => l.startsWith("import "));
      lines.splice(fi < 0 ? 0 : fi, 0, "import cheng/.tmp-exec/unimaker-react_scene_runtime as csgSceneRuntime");
      entryText = lines
        .join("\n")
        .split("csgSceneRuntime.__csg_scene_")
        .join("__csg_scene_") // normalize first so reruns never double-qualify
        .split("__csg_scene_")
        .join("csgSceneRuntime.__csg_scene_");
      writeFileSync(sourcePath, entryText, "utf8");
      process.stderr.write("  entry: qualified scene-runtime helper calls (+runtime import)\n");
    }
  }
  // r26: transform regression gate. The four business-side transforms above +
  // inside materialize-managed-args-pass.mjs took weeks to derive; a silent
  // regression costs a 2h compile before anyone notices. Fail fast instead.
  {
    const { spawnSync } = await import("node:child_process");
    const smokeScript = join(scriptDir, "materialize-transform-smoke.mjs");
    const smokeArgs = [smokeScript, sceneRuntimeSourcePath];
    if (!options.retainedSceneOnly) smokeArgs.push(sourcePath);
    // Zero compiled CHT handlers → the runtime carries no CHT type blocks, so
    // managed-args snapshot / 2-D flatten markers are unsatisfiable by
    // construction (static fixture pages). The gate must not false-fail them.
    if (!compiledHandlerTableSummary || compiledHandlerTableSummary.compiledCount === 0) {
      smokeArgs.push("--expect-no-cht");
      process.stderr.write("  transform smoke: CHT-marker checks skipped (0 CHT handlers compiled)\n");
    }
    const smokeRun = spawnSync(process.execPath, smokeArgs, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    process.stderr.write(smokeRun.stdout ?? "");
    if (smokeRun.status !== 0) {
      process.stderr.write(smokeRun.stderr ?? "");
      throw new Error("transform smoke check failed after materialize - refusing to hand broken sources to the compiler");
    }
  }
  // Campaign C / Lane S (2026-08-27): default retained-scene-only emission is
  // the structural multi-part split of the giant scene runtime source. The
  // monolith exists only as the transient input of the two rewrite passes and
  // the transform smoke above; once they validated it, it is cut into parts
  // whose on-disk concatenation is proven byte-identical to the monolith minus
  // its leading import block (external cmp -s + git diff --no-index, both must
  // return 0), then deleted so no big second copy lingers.
  // --emit-monolithic-source restores the pre-split artifact shape for
  // contrast/rollback. Pure structure: no runtime logic or effect strings are
  // touched here.
  let sceneSourcePartsReceipt = null;
  if (options.retainedSceneOnly && !options.emitMonolithicSource) {
    const monolithText = readFileSync(sceneRuntimeSourcePath, "utf8");
    const split = splitGeneratedChengSourceIntoParts(monolithText, {
      moduleStemBase: "unimaker_react_scene_runtime",
    });
    for (const part of split.parts) {
      writeFileSync(join(outDir, part.fileName), part.fileText, "utf8");
    }
    const manifestPath = join(outDir, sceneSourcePartsManifestName);
    writeFileSync(manifestPath, JSON.stringify({
      schema: split.schema,
      moduleStemBase: split.moduleStemBase,
      sourceSha256: split.sourceSha256,
      sourceByteLength: split.sourceByteLength,
      sourceLineCount: split.sourceLineCount,
      leadingImportLines: split.leadingImportLines,
      sansLeadingImportsSha256: split.sansLeadingImportsSha256,
      sansLeadingImportsByteLength: split.sansLeadingImportsByteLength,
      mergeSpec: { bodyJoinSeparatorAcrossParts: "\\n", perPartHeaderLineCountRecorded: true },
      partCount: split.partCount,
      parts: split.parts.map((part) => ({
        fileName: part.fileName,
        moduleStem: part.moduleStem,
        alias: part.alias,
        headerLineCount: part.headerLineCount,
        headerLines: part.headerLines,
        bodyLineCount: part.bodyLineCount,
        bodyFirstLine: part.bodyFirstLine,
        bodyLastLine: part.bodyLastLine,
        fileSha256: part.fileSha256,
        fileByteLength: part.fileByteLength,
      })),
    }, null, 2) + "\n", "utf8");
    const proof = verifySplitPartsAgainstMonolith({
      outDir,
      monolithPath: sceneRuntimeSourcePath,
      scratchRoot: join(outDir, `.split-proof-${process.pid}`),
    });
    rmSync(sceneRuntimeSourcePath, { force: true });
    sceneSourcePartsReceipt = {
      manifestPath,
      partCount: split.partCount,
      sourceSha256: split.sourceSha256,
      mergedEquivalentProof: { cmpRc: proof.cmpRc, gitDiffRc: proof.gitDiffRc },
    };
    process.stderr.write(`  scene runtime source split: ${split.partCount} parts -> ${outDir}/ (monolith equivalence cmp=0 git-diff-no-index=0, manifest=${sceneSourcePartsManifestName})\n`);
  }
memoryTrace(options.retainedSceneOnly ? "after retained scene-only Cheng source skip" : "after write Cheng source");
process.stderr.write(`  elements: ${materialized.counts.elements}\n`);
process.stderr.write(`  text literals: ${materialized.counts.textLiterals}\n`);
process.stderr.write(`  props: ${materialized.counts.props}\n`);
if (options.retainedSceneOnly) {
  process.stderr.write(`  Cheng source: skipped retained-scene-only\n`);
} else {
  process.stderr.write(`  Cheng source: ${materialized.text.length} chars → ${sourcePath}\n`);
}
const removedIntermediateFactsAfterMaterialize = cleanupIntermediateFactFiles();
if (removedIntermediateFactsAfterMaterialize.length > 0) {
  process.stderr.write(`  removed intermediate facts: ${removedIntermediateFactsAfterMaterialize.map((file) => file.replace(outDir + "/", "")).join(", ")}\n`);
}
const retainedPrimaryFactsPath = options.keepIntermediateFacts ? primaryFactsPath : "";
const retainedJsonlFactsPath = options.keepIntermediateFacts && (options.emit === "jsonl" || options.emit === "both") ? jsonlFactsPath : "";
const retainedSceneFactsPath = options.keepIntermediateFacts ? sceneFactsPath : "";

if (options.stopAfter === "materialize") {
  const materializeElapsedMs = Date.now() - startedAt;
  const materializeSummaryPath = join(outDir, "one-click.summary.json");
  writeFileSync(materializeSummaryPath, JSON.stringify({
    schema: "unimaker.one-click.v1",
    projectRoot,
    entryRoots,
    facts: retainedPrimaryFactsPath,
    factsFormat: options.emit,
    intermediateFactsKept: options.keepIntermediateFacts,
    webReport: webReportPath,
    fullWebReport: options.fullReport ? fullWebReportPath : "",
    domCssCoverage: domCssCoveragePath,
    routeReachability: routeReachabilityPath,
    routeEdgeDetails: routeEdgeDetailsPath,
    sceneManifest: mobileSceneRoutes.length > 0 ? sceneManifestPath : "",
    sceneFacts: retainedSceneFactsPath,
    scene: sceneFacts.counts,
    domCss: {
      complete: domCssCoverage.complete,
      hardFailureCount: domCssCoverage.hardFailureCount,
      counts: domCssCoverage.counts,
    },
    routeInventory,
    routeReachability,
    mobileSceneRoutes: serializeMobileSceneRoutes(mobileSceneRoutes),
    mobileContentSnapshot: mobileContentSnapshotSummary(mobileContentSnapshot),
    mobileVideoFile: options.mobileVideoFile,
    mobileVideoPosterFile: mobileMediaOptions.mobileVideoPosterFile,
    mobileImageFile: options.mobileImageFile,
    source: options.retainedSceneOnly ? "" : sourcePath,
    executable: "",
    compileReport: "",
    materializedSource: {
      skipped: options.retainedSceneOnly,
      path: options.retainedSceneOnly ? "" : sourcePath,
    },
    font: preparedFont.info,
    glyphSdfPrecompute: mobileSceneRoutes.length > 0 ? {
      source: options.keepGlyphSdfPrecomputeDebug && !glyphSdfPrecomputeInfo?.cacheHit ? sceneGlyphSdfPrecomputeSourcePath : "",
      executable: options.keepGlyphSdfPrecomputeDebug && !glyphSdfPrecomputeInfo?.cacheHit ? sceneGlyphSdfPrecomputeExePath : "",
      report: options.keepGlyphSdfPrecomputeDebug ? sceneGlyphSdfPrecomputeReportPath : "",
      output: options.keepGlyphSdfPrecomputeDebug ? sceneGlyphSdfPrecomputeOutputPath : "",
      debugArtifactsKept: options.keepGlyphSdfPrecomputeDebug,
      cache: glyphSdfPrecomputeInfo,
      sceneDataAsset: sceneMobileDataAssetPath,
      pixelAsset: sceneGlyphSdfPixelAssetPath,
    } : null,
    computerUseManifest,
    compiledHandlerTable: compiledHandlerTableSummary,
    mediaPayloadAssets,
    materialized: materialized.counts,
    viewport: options.viewport,
    sceneSourceParts: sceneSourcePartsReceipt,
    run: false,
    runStatus: -1,
    elapsedMs: materializeElapsedMs,
    extractCache: extractCacheInfo,
    stageTimings,
  }, null, 2) + "\n", "utf8");
  process.stdout.write(`unimaker-one-click materialize ok\n`);
  process.stdout.write(`source: ${options.retainedSceneOnly ? "" : sourcePath}\n`);
  process.stdout.write(`scene facts: ${retainedSceneFactsPath}\n`);
  process.stdout.write(`summary: ${materializeSummaryPath}\n`);
  if (preparedFont.info) process.stdout.write(`font: ${preparedFont.info.path}\n`);
  return;
}

// The cold compiler's expression parsing/symbol resolution scales superlinearly
// with single-file size (236k-line generated source exceeded 46 CPU-minutes in
// parse alone while a half-size file parsed proportionally faster), so large
// generated programs are split across several module files compiled as one
// program. Cross-module lowercase calls and shared globals resolve without
// qualification once every module is loaded via the import graph.
function splitGeneratedChengSource(text, dirAbs, baseName, extraImports = []) {
  const lines = text.split("\n");
  const headerImports = [];
  let idx = 0;
  while (idx < lines.length && (lines[idx].startsWith("import ") || lines[idx] === "")) {
    if (lines[idx].startsWith("import ")) headerImports.push(lines[idx]);
    idx += 1;
  }
  const segments = [];
  const entrySegments = [];
  const fnSegments = [];
  let pending = [];
  while (idx < lines.length) {
    const line = lines[idx];
    if (line.startsWith("@") || line.startsWith("fn ")) {
      const seg = [...pending];
      pending = [];
      let sawExportC = false;
      let fnName = "";
      let atBody = false;
      while (idx < lines.length) {
        const l = lines[idx];
        if (!atBody && l.startsWith("@")) {
          if (l.startsWith("@exportc")) sawExportC = true;
          seg.push(l); idx += 1; continue;
        }
        if (!atBody && l.startsWith("fn ")) { atBody = true; fnName = l.slice(3).replace(/\(.*/, "").trim(); seg.push(l); idx += 1; continue; }
        if (atBody && (l === "" || l.startsWith(" ") || l.startsWith("\t"))) { seg.push(l); idx += 1; continue; }
        break;
      }
      if (sawExportC || fnName === "main" || !fnName) entrySegments.push(seg);
      else fnSegments.push(seg);
      continue;
    }
    if (line === "" || line.startsWith("//")) { pending.push(line); idx += 1; continue; }
    // top-level var/let/const or anything else stays in the entry module
    entrySegments.push([...pending, line]);
    pending = [];
    idx += 1;
  }
  if (pending.length > 0) entrySegments.push(pending);
  const totalBytes = fnSegments.reduce((acc, seg) => acc + seg.join("\n").length, 0);
  const partCount = Math.max(2, Math.min(24, Math.ceil(totalBytes / 2500000)));
  const parts = Array.from({ length: partCount }, () => []);
  const partBytes = new Array(partCount).fill(0);
  for (const seg of fnSegments) {
    const segBytes = seg.join("\n").length;
    let target = 0;
    for (let p = 1; p < partCount; p += 1) if (partBytes[p] < partBytes[target]) target = p;
    parts[target].push(seg);
    partBytes[target] += segBytes;
  }
  const written = [];
  const importLines = [];
  const activeParts = [];
  for (let p = 0; p < partCount; p += 1) {
    if (parts[p].length === 0) continue;
    activeParts.push(p);
  }
  // Cross-module calls that pass var arguments require the calling module to
  // import the callee module directly, so every pair of parts is mutually
  // imported (import cycles are accepted by the module loader).
  for (const p of activeParts) {
    const fileName = `${baseName}_part_${p}.cheng`;
    const abs = join(dirAbs, fileName);
    const peerImports = activeParts
      .filter((q) => q !== p)
      .map((q) => `import cheng/.tmp-exec/${baseName}_part_${q} as unimakerPart${q}`);
    writeFileSync(abs, [...headerImports, ...extraImports, ...peerImports, ...parts[p].flat(), ""].join("\n"), "utf8");
    if (process.env.UNIMAKER_COMPILE_INPUTS_DIR !== undefined) {
      copyFileSync(abs, join(process.env.UNIMAKER_COMPILE_INPUTS_DIR, fileName));
    }
    written.push(abs);
    importLines.push(`import cheng/.tmp-exec/${fileName.replace(/\.cheng$/, "")} as unimakerPart${p}`);
  }
  const entryLines = [
    ...headerImports,
    ...extraImports,
    ...importLines,
    "",
    ...entrySegments.flat(),
    "",
  ];
  return { entryText: entryLines.join("\n"), partPaths: written };
}

// Step 3: Compile (--emit:obj + cc link, avoids cold compiler --emit:exe issues)
process.stderr.write(`[3/4] Compiling Cheng source to native executable...\n`);
const compileSourceRel = `src/.tmp-exec/unimaker_one_click_${Date.now()}_${process.pid}_${randomUUID()}.cheng`;
const compileSourceAbs = join(repoRoot, compileSourceRel);
runResources.registerFile(compileSourceAbs);
if (process.env.UNIMAKER_KEEP_COMPILE_INPUTS === "1") {
  // M3 compile-wall bisection facility: preserve the exact assembled entry+parts
  // so the cold-parser rejection can be reproduced offline without pipeline reruns.
  process.env.UNIMAKER_COMPILE_INPUTS_DIR = join(outDir, "compile-inputs");
  mkdirSync(process.env.UNIMAKER_COMPILE_INPUTS_DIR, { recursive: true });
}
const extraCompileFiles = [];
try {
  mkdirSync(dirname(compileSourceAbs), { recursive: true });
  let compileText = materialized.text;
  if (process.env.UNIMAKER_COMPILE_INPUTS_DIR !== undefined) {
    writeFileSync(join(process.env.UNIMAKER_COMPILE_INPUTS_DIR, "entry.cheng"), compileText, "utf8");
  }
  if (options.emitMode === "exe" && mobileSceneRoutes.length > 0) {
    // Desktop standalone exe: no host provides the mobile GPU-present ABI, so
    // replace the single @importc declaration with a local no-op fn (headless
    // present). APK/mobile-shell paths link the real host and are unaffected.
    compileText = stubHostPresentFamilyForDesktopExe(compileText);
  }
  const compileByteLength = Buffer.byteLength(compileText, "utf8");
  let compileEntryRel = compileSourceRel;
  const compileBaseName = compileSourceRel.replace(/^.*\//, "").replace(/\.cheng$/, "");
  const extraImports = [];
  // The retained scene runtime module (globals + data loader + helper fns) is a
  // required part of the program: the materialized app source calls its helpers.
  if (existsSync(sceneRuntimeSourcePath)) {
    const runtimeModuleRel = `src/.tmp-exec/${compileBaseName}_scene_runtime.cheng`;
    const runtimeModuleAbs = join(repoRoot, runtimeModuleRel);
    copyFileSync(sceneRuntimeSourcePath, runtimeModuleAbs);
    // Desktop exe: stub the present family inside the runtime module too
    // (its importc declarations are unreachable from the entry text).
    writeFileSync(runtimeModuleAbs, stubHostPresentFamilyForDesktopExe(readFileSync(runtimeModuleAbs, "utf8")), "utf8");
    // @borrows annotation pass (2026-08-31, device-line multi-route campaign):
    // the rebind/CHT helper families take borrow-view str/str[] projections of
    // call results (shown[idx].field); spec 0.2.1 requires @borrows on the
    // callee for borrowed actuals to bind. Annotate pure-value-formal helpers
    // (str/str[]/bool/int/float formals) — escape violations still fail closed
    // in the checker, so this cannot mask a real escape.
    {
      let modText = readFileSync(runtimeModuleAbs, "utf8");
      const exported = new Set();
      for (const m0 of modText.matchAll(/@exportc\("[^"]*"\)\nfn ([A-Za-z0-9_]+)\(/g)) {
        exported.add(m0[1]);
      }
      // Only managed-typed formals need @borrows (borrow views exist for
      // str/str[]/JsonNode/struct values). A primitive formal (bool/int/float)
      // annotated @borrows trips the exact-identity schema (formal ownership
      // flips vs the call's owned actual) — measured 2026-09-01 __cht_apply.
      const PRIM = /^(bool|int32|int64|u32|u64|float32|float64|f32|f64|i32|i64|usize)$/;
      modText = modText.replace(/\nfn ([A-Za-z0-9_]+)\(([^)]*)\)/g, (m0, fname, params) => {
        if (exported.has(fname) || fname.startsWith("cheng_")) return m0;
        if (modText.includes(`\n@borrows\nfn ${fname}(`)) return m0;
        const formals = params.split(",").map((q) => q.trim()).filter((q) => q.length > 0);
        if (formals.length === 0) return m0;
        // annotate iff at least one formal is managed (str/str[]/JsonNode/struct):
        // those receive borrow views; fns with only primitive formals have
        // nothing to borrow and stay unannotated (chtBoolToStr precedent).
        const anyManaged = formals.some((q) => {
          const t = q.split(":").pop().trim();
          return !PRIM.test(t);
        });
        return anyManaged ? `\n@borrows\nfn ${fname}(${params})` : m0;
      });
      // --scene-social-transport-stub: for the group-create stub backend the
      // social transport has no peer (no gossipsub/QUIC inbound), yet the async
      // pump transport bindings + moment-issue handlers statically pull the
      // QUIC/msquic closure into the scene and trip the cold provenance
      // certifier. Stub the three binding bodies and neutralize the moment
      // issue call statements so the social module leaves the closure entirely.
      if (options.sceneSocialTransportStub === true) {
        let stubbed = 0;
        modText = modText
          .replace(/\nfn __asyncRecvTryAck\(side: int32, streamId: int64, ackLen: int32\): int32 =\n    return social\.WebSceneSocialRecvTryAck\(side, streamId, ackLen\)/,
            () => { stubbed += 1; return "\nfn __asyncRecvTryAck(side: int32, streamId: int64, ackLen: int32): int32 =\n    return 0"; })
          .replace(/\nfn __asyncSendSide\(\): int32 =\n    return social\.WebSceneSocialSendSide\(\)/,
            () => { stubbed += 1; return "\nfn __asyncSendSide(): int32 =\n    return 0"; })
          .replace(/\nfn __asyncSendStream\(\): int64 =\n    return social\.WebSceneSocialSendStream\(\)/,
            () => { stubbed += 1; return "\nfn __asyncSendStream(): int64 =\n    return 0"; });
        modText = modText.replace(/^    social\.WebSceneSocialMoment[A-Za-z]+\([^\n]*\)$/gm, () => { stubbed += 1; return "    0"; });
        if (stubbed < 6) {
          fail(`scene-social-transport-stub: expected >=6 stub sites, matched ${stubbed} — generator shape drifted, refusing to half-stub`);
        }
        process.stderr.write(`  social transport stub: ${stubbed} sites neutralized (QUIC closure out)\n`);
      }
      writeFileSync(runtimeModuleAbs, modText, "utf8");
    }
    runResources.registerFile(runtimeModuleAbs);
    extraCompileFiles.push(runtimeModuleAbs);
    const runtimeImport = `import cheng/.tmp-exec/${compileBaseName}_scene_runtime as csgSceneRuntime`;
    extraImports.push(runtimeImport);
    compileText = `${runtimeImport}\n${compileText}`;
  }
  if (compileByteLength > 6000000) {
    const split = splitGeneratedChengSource(compileText, dirname(compileSourceAbs), compileBaseName, extraImports);
    writeFileSync(compileSourceAbs, split.entryText, "utf8");
    for (const partAbs of split.partPaths) {
      runResources.registerFile(partAbs);
      extraCompileFiles.push(partAbs);
    }
    process.stderr.write(`  source split: entry + ${split.partPaths.length} module part(s) (${compileByteLength} bytes)\n`);
  } else {
    if (process.env.UNIMAKER_COMPILE_INPUTS_DIR !== undefined) {
      writeFileSync(join(process.env.UNIMAKER_COMPILE_INPUTS_DIR, "entry.final.cheng"), compileText, "utf8");
      const runtimeFinal = join(repoRoot, "src/.tmp-exec", `${compileBaseName}_scene_runtime.cheng`);
      if (existsSync(runtimeFinal)) {
        copyFileSync(runtimeFinal, join(process.env.UNIMAKER_COMPILE_INPUTS_DIR, "scene_runtime.final.cheng"));
      }
    }
    writeFileSync(compileSourceAbs, compileText, "utf8");
  }
  try {
    await compileChengToExe(cheng, repoRoot, compileEntryRel, exePath, compileReportPath, {
      timeout: options.compileTimeoutMs,
      resourceManifest: runResources,
      emitMode: options.emitMode,
    });
  } catch (err) {
    process.stderr.write(`Compilation failed. Materialized source at: ${sourcePath}\n`);
    process.stderr.write(`Report at: ${compileReportPath}\n`);
    throw err;
  }
} finally {
  runResources.removeFiles([compileSourceAbs, ...extraCompileFiles]);
}
process.stderr.write(`  executable: ${exePath}\n`);

// Step 4: Run
let runOutput = "";
let runStatus = -1;
let runGuardReceipt = null;
if (options.run) {
  process.stderr.write(`[4/4] Running...\n`);
  try {
    let guardedRun;
    if (process.env.UNIMAKER_UNGUARDED === "1") {
      const { spawnSync } = await import("node:child_process");
      const direct = spawnSync(exePath, [], {
        cwd: repoRoot,
        env: { ...process.env },
        encoding: "utf8",
        maxBuffer: options.runMaxBufferBytes,
        timeout: options.runTimeoutMs,
      });
      if (direct.error) throw direct.error;
      if (direct.status !== 0) throw new Error(`direct run failed (${direct.status}): ${String(direct.stderr).slice(0, 2000)}`);
      guardedRun = { output: options.runOutputFile === undefined ? direct.stdout : "", receipt: null };
      if (runGuardStdoutPath) {
        rmSync(runGuardStdoutPath, { force: true }); // the guard seals its outputs read-only
        writeFileSync(runGuardStdoutPath, direct.stdout, "utf8");
      }
    } else {
      guardedRun = await runGeneratedExecutable(exePath, [], {
        guardPath: processTreeGuardPath,
        cwd: repoRoot,
        env: {},
        timeout: options.runTimeoutMs,
        maxBuffer: options.runMaxBufferBytes,
        receiptPath: runGuardReceiptPath,
        stdoutPath: runGuardStdoutPath,
        stderrPath: runGuardStderrPath,
        returnOutput: options.runOutputFile === undefined,
      });
    }
    runOutput = guardedRun.output;
    runGuardReceipt = guardedRun.receipt;
    runStatus = 0;
  } catch (err) {
    runStatus = err.status ?? -1;
    runOutput = err.stdout ?? "";
    if (err.stderr) process.stderr.write(err.stderr);
    process.stderr.write(`run failure detail: ${String(err?.message ?? err).slice(0, 500)}
`);
  }
}

const elapsedMs = Date.now() - startedAt;

// Summary
const summary = {
  schema: "unimaker.one-click.v1",
  projectRoot,
  entryRoots,
  facts: retainedPrimaryFactsPath,
  factsFormat: options.emit,
  jsonlFacts: retainedJsonlFactsPath,
  intermediateFactsKept: options.keepIntermediateFacts,
  webReport: webReportPath,
  fullWebReport: options.fullReport ? fullWebReportPath : "",
  domCssCoverage: domCssCoveragePath,
  routeReachability: routeReachabilityPath,
  routeEdgeDetails: routeEdgeDetailsPath,
  sceneManifest: mobileSceneRoutes.length > 0 ? sceneManifestPath : "",
  sceneFacts: retainedSceneFactsPath,
  scene: sceneFacts.counts,
  domCss: {
    complete: domCssCoverage.complete,
    hardFailureCount: domCssCoverage.hardFailureCount,
    counts: domCssCoverage.counts,
  },
  routeInventory,
  routeReachability,
  mobileSceneRoutes: serializeMobileSceneRoutes(mobileSceneRoutes),
  mobileContentSnapshot: mobileContentSnapshotSummary(mobileContentSnapshot),
  mobileVideoFile: options.mobileVideoFile,
  mobileVideoPosterFile: mobileMediaOptions.mobileVideoPosterFile,
  mobileImageFile: options.mobileImageFile,
  source: sourcePath,
  executable: exePath,
  compileReport: compileReportPath,
    font: preparedFont.info,
    glyphSdfPrecompute: mobileSceneRoutes.length > 0 ? {
      source: options.keepGlyphSdfPrecomputeDebug && !glyphSdfPrecomputeInfo?.cacheHit ? sceneGlyphSdfPrecomputeSourcePath : "",
      executable: options.keepGlyphSdfPrecomputeDebug && !glyphSdfPrecomputeInfo?.cacheHit ? sceneGlyphSdfPrecomputeExePath : "",
      report: options.keepGlyphSdfPrecomputeDebug ? sceneGlyphSdfPrecomputeReportPath : "",
      output: options.keepGlyphSdfPrecomputeDebug ? sceneGlyphSdfPrecomputeOutputPath : "",
      debugArtifactsKept: options.keepGlyphSdfPrecomputeDebug,
      cache: glyphSdfPrecomputeInfo,
      sceneDataAsset: sceneMobileDataAssetPath,
      pixelAsset: sceneGlyphSdfPixelAssetPath,
    } : null,
    computerUseManifest,
    compiledHandlerTable: compiledHandlerTableSummary,
    mediaPayloadAssets,
    materialized: materialized.counts,
  frameLimit: options.frameLimit,
  dumpMode: options.dump,
  rawPixelDump: options.rawPixelDump,
  runOutputFile: options.runOutputFile,
  generatedExecutableProcessTreeLimitBytes,
  runProcessTreeGuard: runGuardReceipt,
  viewport: options.viewport,
  run: options.run,
  runStatus,
  elapsedMs,
  csgWeb: {
    sourceFiles: webReport.counts.sourceFiles,
    jsFunctions: webReport.counts.jsFunctions,
    jsxElements: webReport.counts.jsxElements,
    domNodeTemplates: webReport.counts.domNodeTemplates,
    runtimeRequirements: closure.requirementCount,
    openRuntimeRequirements: closure.openRequirementCount,
    openExternalSymbols: closure.openExternalSymbolCount,
    complete: webReport.complete,
  },
  topOpenDomains: summarizeOpenDomains(closure.requirements, 10),
  extractCache: extractCacheInfo,
  stageTimings,
};

const summaryPath = join(outDir, "one-click.summary.json");
writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");

process.stdout.write(`\n=== UniMaker One-Click Summary ===\n`);
process.stdout.write(`total elapsed: ${elapsedMs}ms\n`);
process.stdout.write(`extraction: ${webReport.counts.sourceFiles} files, ${webReport.counts.jsxElements} JSX elements, ${webReport.counts.domNodeTemplates} DOM templates\n`);
process.stdout.write(`materialized: ${materialized.counts.elements} elements, ${materialized.counts.textLiterals} text, ${materialized.counts.props} props\n`);
process.stdout.write(`scene facts: ${sceneFacts.counts.routes} routes, ${sceneFacts.counts.nodes} nodes, ${sceneFacts.counts.props} props, ${sceneFacts.counts.styles} styles, ${sceneFacts.counts.layouts} layouts, ${sceneFacts.counts.paints} paints, ${sceneFacts.counts.resources}${retainedSceneFactsPath ? ` → ${retainedSceneFactsPath}` : " (intermediate file removed)"}\n`);
if (routeInventory.required) {
  process.stdout.write(`route inventory: complete=${routeInventory.complete}, expected=${routeInventory.expectedRouteCount}, generated=${routeInventory.generatedRouteCount}\n`);
}
if (mobileContentSnapshot !== null) {
  process.stdout.write(`PWA content snapshot: ${mobileContentSnapshot.contents.length} items from ${mobileContentSnapshot.source}\n`);
}
process.stdout.write(`route reachability: complete=${routeReachability.complete}, reachable=${routeReachability.reachableRouteCount}/${routeReachability.routeCount}, withoutIncomingEdge=${routeReachability.unreachableWithoutIncomingEdgeRouteCount}, withIncomingEdge=${routeReachability.unreachableWithIncomingEdgeRouteCount}\n`);
process.stdout.write(`open requirements: ${closure.openRequirementCount} runtime + ${closure.openExternalSymbolCount} external\n`);
process.stdout.write(`top open domains: ${formatSummary(summary.topOpenDomains)}\n`);
process.stdout.write(`compile+link: ${exePath}\n`);
process.stdout.write(`run status: ${runStatus}\n`);
process.stdout.write(`source: ${options.retainedSceneOnly ? "" : sourcePath}\n`);
process.stdout.write(`summary: ${summaryPath}\n`);

if (runOutput.trim().length > 0) {
  process.stdout.write(`\n--- run output ---\n`);
  process.stdout.write(runOutput);
} else if (options.runOutputFile) {
  process.stdout.write(`run output: ${options.runOutputFile}\n`);
}

if ((materialized.diagnostics.length === 0 || options.tolerateDiagnostics) && (!options.run || runStatus === 0)) {
  process.stdout.write(`\nunimaker-one-click ok\n`);
} else {
  process.stdout.write(`\nunimaker-one-click compiled but run exited ${runStatus}\n`);
  process.exitCode = 1;
}

function parseArgs(args) {
  const parsed = {
    runtime: ["node", "browser"],
    viewport: "1024x768",
    viewportExplicit: false,
    frameLimit: 600,
    run: true,
    dump: false,
    buildTimeoutMs: 120000,
    compileTimeoutMs: 300000,
    runTimeoutMs: 60000,
    runMaxBufferBytes: 32 * 1024 * 1024,
    emit: "csgc",
    rawPixelDump: false,
    mobileMultiFrameDump: false,
    rootText: "",
    rootSource: "",
    fontFile: "",
    fontFiles: [],
    fontFaces: [],
    separateDebug: false,
    noSeparateDebug: false,
    noDebug: false,
    fullReport: false,
    memoryTrace: false,
    tolerateDiagnostics: false,
    allowDroppedShapes: [],
    sceneSocialTransportStub: false,
    emitMode: "exe",
    cssFiles: [],
    projectRoot: "",
    entryRoots: [],
    stopAfter: "",
    fontSubset: true,
    // 6MB: CJK default 匯文明朝體 carries full-coverage subsets at weight 400+700
    // The GB2312 runtime-text floor puts ~6.7k Ming glyphs (~3KB each) into
    // the weight-400 匯文明朝體 subset (~13.4MB). Deliberate: complete
    // standard-Chinese coverage for geocoded/typed/remote text under the
    // chosen typeface. Bold faces stay small (weight400OnlyText).
    fontMaxBytes: 16 * 1024 * 1024,
    fontSubsetTimeoutMs: 120000,
    glyphSdfPrecomputeTimeoutMs: 180000,
    glyphSdfPrecomputeEmit: "exe",
    requireGlyphSdfPrecomputeCacheHit: false,
    fontNumber: null,
    mobileSceneRoutes: [],
    mobileSceneRoutesDefaultCatalog: false,
    mobileSceneDirectRoutes: [],
    mobileSceneInitialRoute: "",
    mobileVideoFile: "",
    mobileVideoFileMap: {},
    mobileImageFile: "",
    mobileContentSnapshotFile: "",
    mobileContentSnapshotJson: "",
    mobileContentSnapshotCdpBaseUrl: "",
    mobileContentSnapshotCdpWsEndpoint: "",
    mobileContentSnapshotCdpRoute: "",
    mobileContentSnapshotCdpTimeoutMs: 120000,
    requireDomCssCoverage: false,
    keepIntermediateFacts: false,
    keepGlyphSdfPrecomputeDebug: false,
    keepExtractCache: false,
    retainedSceneOnly: false,
    emitMonolithicSource: false,
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
    else if (arg === "--project-root") parsed.projectRoot = next();
    else if (arg === "--entry-root") parsed.entryRoots.push(next());
    else if (arg === "--stop-after") parsed.stopAfter = next();
    else if (arg === "--viewport") {
      parsed.viewport = parseViewport(next());
      parsed.viewportExplicit = true;
    }
    else if (arg === "--frame-limit") parsed.frameLimit = positiveInteger(next(), "--frame-limit");
    else if (arg === "--cheng") parsed.cheng = next();
    else if (arg === "--glyph-sdf-precompute-emit") {
      const value = next();
      if (value !== "obj-link" && value !== "exe") fail(`invalid --glyph-sdf-precompute-emit: ${value}`);
      parsed.glyphSdfPrecomputeEmit = value;
    }
    else if (arg === "--no-run") parsed.run = false;
    else if (arg === "--emit") parsed.emit = next();
    else if (arg === "--keep-intermediate-facts") parsed.keepIntermediateFacts = true;
    else if (arg === "--keep-glyph-sdf-precompute-debug") parsed.keepGlyphSdfPrecomputeDebug = true;
    else if (arg === "--keep-extract-cache") parsed.keepExtractCache = true;
    else if (arg === "--dump") parsed.dump = true;
    else if (arg === "--no-dump") parsed.dump = false;
    else if (arg === "--raw-pixels") {
      parsed.dump = true;
      parsed.rawPixelDump = true;
      parsed.runMaxBufferBytes = 256 * 1024 * 1024;
    }
    else if (arg === "--mobile-scene-multi-frame-dump") parsed.mobileMultiFrameDump = true;
    else if (arg === "--root-text") parsed.rootText = next();
    else if (arg === "--root-source") parsed.rootSource = next();
    else if (arg === "--font-file") {
      const value = resolvePath(next());
      parsed.fontFile = value;
      parsed.fontFiles.push(value);
    }
    else if (arg === "--font-fallback-file") parsed.fontFiles.push(resolvePath(next()));
    else if (arg === "--no-font-subset") parsed.fontSubset = false;
    else if (arg === "--font-max-bytes") parsed.fontMaxBytes = positiveInteger(next(), "--font-max-bytes");
    else if (arg === "--font-subset-timeout-ms") parsed.fontSubsetTimeoutMs = positiveInteger(next(), "--font-subset-timeout-ms");
    else if (arg === "--glyph-sdf-precompute-timeout-ms") parsed.glyphSdfPrecomputeTimeoutMs = positiveInteger(next(), "--glyph-sdf-precompute-timeout-ms");
    else if (arg === "--require-glyph-sdf-precompute-cache-hit" || arg === "--require-glyph-cache-hit") parsed.requireGlyphSdfPrecomputeCacheHit = true;
    else if (arg === "--font-number") parsed.fontNumber = nonNegativeInteger(next(), "--font-number");
    else if (arg === "--mobile-scene-route") parsed.mobileSceneRoutes.push(parseMobileSceneRoute(next()));
    else if (arg === "--mobile-scene-routes-default-catalog") parsed.mobileSceneRoutesDefaultCatalog = true;
    else if (arg === "--mobile-scene-direct-route") parsed.mobileSceneDirectRoutes.push(next().trim());
    else if (arg === "--mobile-scene-initial-route") parsed.mobileSceneInitialRoute = next().trim();
    else if (arg === "--mobile-video-file") parsed.mobileVideoFile = resolvePath(next());
    else if (arg === "--mobile-video-file-map") parsed.mobileVideoFileMap = parseMobileVideoFileMapJson(next());
    else if (arg === "--mobile-image-file") parsed.mobileImageFile = resolvePath(next());
    else if (arg === "--mobile-content-snapshot-file" || arg === "--pwa-content-snapshot-file") parsed.mobileContentSnapshotFile = resolvePath(next());
    else if (arg === "--mobile-content-snapshot-json" || arg === "--pwa-content-snapshot-json") parsed.mobileContentSnapshotJson = next();
    else if (arg === "--mobile-content-snapshot-cdp-base-url" || arg === "--pwa-content-snapshot-cdp-base-url") parsed.mobileContentSnapshotCdpBaseUrl = next().trim();
    else if (arg === "--mobile-content-snapshot-cdp-ws-endpoint" || arg === "--pwa-content-snapshot-cdp-ws-endpoint") parsed.mobileContentSnapshotCdpWsEndpoint = next().trim();
    else if (arg === "--mobile-content-snapshot-cdp-route" || arg === "--pwa-content-snapshot-cdp-route") parsed.mobileContentSnapshotCdpRoute = next().trim();
    else if (arg === "--mobile-content-snapshot-cdp-timeout-ms" || arg === "--pwa-content-snapshot-cdp-timeout-ms") parsed.mobileContentSnapshotCdpTimeoutMs = positiveInteger(next(), arg);
    else if (arg === "--require-dom-css-coverage") parsed.requireDomCssCoverage = true;
    else if (arg === "--retained-scene-only") parsed.retainedSceneOnly = true;
    else if (arg === "--emit-monolithic-source") parsed.emitMonolithicSource = true;
    else if (arg === "--glyph-row-tables") parsed.glyphRowTables = true;
    else if (arg === "--separate-debug") parsed.separateDebug = true;
    else if (arg === "--no-separate-debug") parsed.noSeparateDebug = true;
    else if (arg === "--no-debug") parsed.noDebug = true;
    else if (arg === "--full-report") parsed.fullReport = true;
    else if (arg === "--memory-trace") parsed.memoryTrace = true;
    else if (arg === "--tolerate-diagnostics") parsed.tolerateDiagnostics = true;
    else if (arg.startsWith("--allow-dropped-shape:")) parsed.allowDroppedShapes.push(arg.slice("--allow-dropped-shape:".length));
    else if (arg === "--scene-social-transport-stub") parsed.sceneSocialTransportStub = true;
    else if (arg === "--emit-mode") parsed.emitMode = next();
    else if (arg === "--css") parsed.cssFiles.push(resolvePath(next()));
    else if (arg === "--run-output-file") parsed.runOutputFile = resolvePath(next());
    else if (arg === "--build-timeout-ms") parsed.buildTimeoutMs = positiveInteger(next(), "--build-timeout-ms");
    else if (arg === "--compile-timeout-ms") parsed.compileTimeoutMs = Number(next());
    else if (arg === "--run-timeout-ms") parsed.runTimeoutMs = Number(next());
    else fail(`unknown argument: ${arg}`);
  }
  if (parsed.emit !== "jsonl" && parsed.emit !== "csgc" && parsed.emit !== "both") {
    fail(`--emit must be jsonl, csgc, or both`);
  }
  if (parsed.emitMode !== "obj" && parsed.emitMode !== "exe") {
    fail(`--emit-mode must be obj or exe`);
  }
  if (parsed.stopAfter !== "" && parsed.stopAfter !== "extract" && parsed.stopAfter !== "scene-facts" && parsed.stopAfter !== "materialize") {
    fail(`--stop-after must be extract, scene-facts, or materialize`);
  }
  return parsed;
}

async function resolveMobileContentSnapshotOption(options, projectRoot, mobileSceneRoutes, outDir) {
  const cliJson = String(options.mobileContentSnapshotJson ?? "").trim();
  if (cliJson.length > 0) return parseMobileContentSnapshotText(cliJson, "cli-json");

  const envJson = String(process.env.UNIMAKER_PWA_CONTENT_SNAPSHOT_JSON ?? "").trim();
  if (envJson.length > 0) return parseMobileContentSnapshotText(envJson, "env:UNIMAKER_PWA_CONTENT_SNAPSHOT_JSON");

  const cliFile = String(options.mobileContentSnapshotFile ?? "").trim();
  if (cliFile.length > 0) return readMobileContentSnapshotFile(cliFile, "cli-file");

  const envFile = String(process.env.UNIMAKER_PWA_CONTENT_SNAPSHOT_FILE ?? "").trim();
  if (envFile.length > 0) return readMobileContentSnapshotFile(resolvePath(envFile), "env-file");

  if (!mobileRoutesRequirePwaContentSnapshot(projectRoot, mobileSceneRoutes)) return null;

  const candidates = defaultMobileContentSnapshotCandidates(projectRoot);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readMobileContentSnapshotFile(candidate, "auto-file");
  }
  const cdpSnapshot = await resolveMobileContentSnapshotViaCdp(options, mobileSceneRoutes, outDir);
  if (cdpSnapshot !== null) return cdpSnapshot;
  fail([
    "UniMaker retained mobile content routes require a current PWA content snapshot.",
    `Pass --mobile-content-snapshot-file <json> or write one of:`,
    ...candidates.map((candidate) => `  ${candidate}`),
    `or pass --mobile-content-snapshot-cdp-base-url and --mobile-content-snapshot-cdp-ws-endpoint.`,
  ].join("\n"));
}

async function resolveMobileContentSnapshotViaCdp(options, mobileSceneRoutes, outDir) {
  const baseUrl = String(options.mobileContentSnapshotCdpBaseUrl || process.env.UNIMAKER_PWA_CONTENT_SNAPSHOT_CDP_BASE_URL || "").trim();
  const browserWsEndpoint = String(options.mobileContentSnapshotCdpWsEndpoint || process.env.UNIMAKER_PWA_CONTENT_SNAPSHOT_CDP_WS_ENDPOINT || "").trim();
  if (baseUrl.length === 0 && browserWsEndpoint.length === 0) return null;
  if (baseUrl.length === 0 || browserWsEndpoint.length === 0) {
    fail("CDP PWA content snapshot requires both base URL and browser websocket endpoint");
  }
  const route = String(options.mobileContentSnapshotCdpRoute || process.env.UNIMAKER_PWA_CONTENT_SNAPSHOT_CDP_ROUTE || "").trim() ||
    mobileSceneRoutes.find((item) => mobileContentSnapshotRouteIds.has(item.routeId))?.routeId ||
    "home_default";
  const snapshotPath = join(outDir, "unimaker-pwa-content-snapshot.json");
  const factsPath = join(outDir, "unimaker-cdp-content-snapshot.jsonl");
  process.stderr.write(`  extracting PWA content snapshot via CDP route=${route} base=${baseUrl}\n`);
  await runCommand(process.execPath, [
    join(scriptDir, "unimaker-cdp-resolved-facts.mjs"),
    "--base-url", baseUrl,
    "--browser-ws-endpoint", browserWsEndpoint,
    "--route", route,
    "--viewport", options.viewport,
    "--out", factsPath,
    "--write-content-snapshot-file", snapshotPath,
    "--settle-ms", "1200",
  ], {
    cwd: packageDir,
    timeout: options.mobileContentSnapshotCdpTimeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!existsSync(snapshotPath)) fail(`CDP PWA content snapshot was not written: ${snapshotPath}`);
  return readMobileContentSnapshotFile(snapshotPath, "cdp");
}

function summarizeCompiledHandlerTable(table, sceneFacts = []) {
  if (!table) return null;
  const skipCategories = {};
  for (const skip of table.skips || []) {
    const reason = String(skip.reason || "unknown");
    const category = reason.includes(":") ? reason.slice(0, reason.indexOf(":")) : reason;
    skipCategories[category] = (skipCategories[category] || 0) + 1;
  }
  const invokeNames = sceneEventHandlerEffectNames(sceneFacts, "invoke:");
  const compiledEffectNames = sceneEventHandlerEffectNames(sceneFacts, "compiled:");
  const compiledNames = [...(table.names || [])];
  const remainingUncompiledNames = [...new Set(invokeNames)]
    .filter((name) => !compiledNames.includes(name))
    .sort();
  return {
    schema: "unimaker.compiled_handler_table.v1",
    compiledCount: Number(table.count || 0),
    compiledNames,
    gestureSites: sceneEventHandlerEffectNames(sceneFacts, "gesture:").length,
    gestureNames: [...(table.gestureNames || [])],
    baselineInvokeSites: invokeNames.length + compiledEffectNames.length,
    invokeSites: invokeNames.length,
    compiledAway: compiledEffectNames.length,
    remainingUncompiledUnique: remainingUncompiledNames.length,
    remainingUncompiledNames,
    skipCount: (table.skips || []).length,
    skipCategories,
    asyncResumeCount: (table.asyncResumeCases || []).length,
    recvDoneCount: (table.recvDoneCases || []).length,
    actionCoverage: summarizeSceneActionCoverage(sceneFacts),
  };
}

function sceneEventHandlerEffectNames(facts, prefix) {
  const names = [];
  for (const fact of facts || []) {
    if (fact?.kind !== "csg.web.scene.event_handler" || typeof fact.effect !== "string") continue;
    for (const segment of fact.effect.split(";")) {
      if (segment.startsWith(prefix)) names.push(segment.slice(prefix.length));
    }
  }
  return names;
}

function mobileRoutesRequirePwaContentSnapshot(projectRoot, mobileSceneRoutes) {
  if (resolve(projectRoot) !== resolve(defaultProjectRoot)) return false;
  return mobileSceneRoutes.some((route) => mobileContentSnapshotRouteIds.has(route.routeId));
}

function defaultMobileContentSnapshotCandidates(projectRoot) {
  return uniqueStrings([
    join(projectRoot, ".tmp", "unimaker-pwa-content-snapshot.json"),
    join(projectRoot, "artifacts", "unimaker-pwa-content-snapshot.json"),
    join(packageDir, "tmp", "unimaker-pwa-content-snapshot.json"),
  ], (candidate) => resolve(candidate));
}

function readMobileContentSnapshotFile(path, sourceKind) {
  if (!existsSync(path)) fail(`missing PWA content snapshot file: ${path}`);
  return parseMobileContentSnapshotText(readFileSync(path, "utf8"), `${sourceKind}:${path}`);
}

function parseMobileContentSnapshotText(text, source) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`invalid PWA content snapshot JSON from ${source}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const contents = normalizeMobileContentSnapshotContents(extractMobileContentSnapshotContents(parsed, source), source);
  const video = contents.find((item) => item.type === "video");
  const image = contents.find((item) => item.type === "image");
  if (video === undefined && image === undefined) fail(`PWA content snapshot ${source} has no visible media content item`);
  const nodes = normalizeMobileContentSnapshotNodes(isPlainObject(parsed) ? parsed.nodes : undefined, source);
  return {
    schema: mobileContentSnapshotSchema,
    source,
    storageKey: unimakerDistributedContentStorageKey,
    contents,
    nodes,
    videoId: video?.id ?? "",
    imageId: image?.id ?? "",
  };
}

// Optional "nodes" anchor row(s) for the tab_nodes route (NodesPage.tsx's
// filteredNodes list): a single, structurally-complete placeholder Node
// literal, unrolled statically so the row's title/subtitle text nodes exist
// for the runtime bridge (cheng_app_nodes_update_utf8) to rebind by node
// matcher, mirroring the feed cardSlots anchor mechanism. Absent when the
// fixture predates this field (nodes list stays static-empty, unchanged).
function normalizeMobileContentSnapshotNodes(rawNodes, source) {
  if (!Array.isArray(rawNodes)) return [];
  return rawNodes.map((item, index) => normalizeMobileContentSnapshotNodeItem(item, index, source));
}

function normalizeMobileContentSnapshotNodeItem(item, index, source) {
  if (!isPlainObject(item)) fail(`PWA content snapshot ${source} nodes[${index}] must be an object`);
  const peerId = requiredSnapshotString(item, "peerId", source, index);
  const profileDefaults = {
    osName: "unknown", osVersion: "--", cpuModel: "unknown", cpuFrequencyMHz: 0, cpuCores: 0,
    memoryFrequencyMHz: 0, memoryTotalBytes: 0, memoryAvailableBytes: 0, diskType: "unknown",
    diskTotalBytes: 0, diskAvailableBytes: 0, gpuModel: "unknown", gpuVramTotalBytes: 0,
    gpuVramAvailableBytes: 0, gpuComputeScore: 0, uplinkBps: 0, downlinkBps: 0,
    uplinkTotalBytes: 0, downlinkTotalBytes: 0, totalTransferBytes: 0, relayBottleneckBps: 0,
    isRelayed: false,
  };
  return {
    peerId,
    nickname: typeof item.nickname === "string" ? item.nickname : "",
    avatar: typeof item.avatar === "string" ? item.avatar : "",
    domain: typeof item.domain === "string" ? item.domain : "",
    status: item.status === "online" ? "online" : "offline",
    latency: typeof item.latency === "number" ? item.latency : 0,
    connections: typeof item.connections === "number" ? item.connections : 0,
    bandwidth: typeof item.bandwidth === "string" ? item.bandwidth : "-- / --",
    systemProfile: { ...profileDefaults, ...(isPlainObject(item.systemProfile) ? item.systemProfile : {}) },
    multiaddrs: Array.isArray(item.multiaddrs) ? item.multiaddrs.filter((v) => typeof v === "string") : [],
    sources: Array.isArray(item.sources) ? item.sources.filter((v) => typeof v === "string") : [],
    joinedAt: typeof item.joinedAt === "number" ? item.joinedAt : 0,
    location: typeof item.location === "string" ? item.location : "--",
    region: typeof item.region === "string" ? item.region : "--",
    uptime: typeof item.uptime === "string" ? item.uptime : "--",
    services: Array.isArray(item.services) ? item.services.filter((v) => typeof v === "string") : [],
    description: typeof item.description === "string" ? item.description : "",
    lastSeenAt: typeof item.lastSeenAt === "number" ? item.lastSeenAt : 0,
    deliveryModes: Array.isArray(item.deliveryModes) ? item.deliveryModes.filter((v) => typeof v === "string") : [],
    capabilities: Array.isArray(item.capabilities) ? item.capabilities.filter((v) => typeof v === "string") : [],
  };
}

function extractMobileContentSnapshotContents(parsed, source) {
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "string") return parseMobileContentSnapshotStorageValue(parsed, source);
  if (!isPlainObject(parsed)) fail(`PWA content snapshot ${source} must be an array or object`);
  if (Array.isArray(parsed.contents)) return parsed.contents;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (typeof parsed[unimakerDistributedContentStorageKey] === "string") {
    return parseMobileContentSnapshotStorageValue(parsed[unimakerDistributedContentStorageKey], source);
  }
  const localStorageValue = parsed.localStorage;
  if (isPlainObject(localStorageValue) && typeof localStorageValue[unimakerDistributedContentStorageKey] === "string") {
    return parseMobileContentSnapshotStorageValue(localStorageValue[unimakerDistributedContentStorageKey], source);
  }
  fail(`PWA content snapshot ${source} does not contain contents/items/${unimakerDistributedContentStorageKey}`);
}

function parseMobileContentSnapshotStorageValue(value, source) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) fail(`PWA localStorage ${unimakerDistributedContentStorageKey} from ${source} is not an array`);
    return parsed;
  } catch (error) {
    fail(`invalid PWA localStorage ${unimakerDistributedContentStorageKey} JSON from ${source}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeMobileContentSnapshotContents(items, source) {
  if (!Array.isArray(items) || items.length === 0) fail(`PWA content snapshot ${source} has no content items`);
  return items
    .map((item, index) => normalizeMobileContentSnapshotItem(item, index, source))
    .filter((item) => item.tombstoned !== true && item.viewerCanAccess !== false && item.accessPolicy !== "restricted" && item.accessPolicy !== "tombstoned")
    .sort(compareSnapshotContentForFeed);
}

function normalizeMobileContentSnapshotItem(item, index, source) {
  const normalized = normalizeSnapshotStaticValue(item, `${source}.contents[${index}]`);
  if (!isPlainObject(normalized)) fail(`PWA content snapshot ${source} item ${index} must be an object`);
  const id = requiredSnapshotString(normalized, "id", source, index);
  const type = requiredSnapshotString(normalized, "type", source, index);
  if (!["text", "image", "audio", "video", "music"].includes(type)) {
    fail(`PWA content snapshot ${source} item ${index} has unsupported type: ${type}`);
  }
  const publishCategory = canonicalizeSnapshotPublishCategory(requiredSnapshotString(normalized, "publishCategory", source, index));
  if (publishCategory.length === 0) {
    fail(`PWA content snapshot ${source} item ${index} has unsupported publishCategory: ${normalized.publishCategory}`);
  }
  normalized.publishCategory = publishCategory;
  requiredSnapshotString(normalized, "userId", source, index);
  requiredSnapshotString(normalized, "userName", source, index);
  if (typeof normalized.avatar !== "string") fail(`PWA content snapshot ${source} item ${index} missing string avatar`);
  requiredSnapshotStringField(normalized, "content", source, index);
  requiredSnapshotNumber(normalized, "likes", source, index);
  requiredSnapshotNumber(normalized, "comments", source, index);
  requiredSnapshotNumber(normalized, "timestamp", source, index);
  if (normalized.publishedAt !== undefined) requiredSnapshotNumber(normalized, "publishedAt", source, index);
  if ((type === "video" || type === "image") &&
      typeof normalized.media !== "string" &&
      typeof normalized.coverMedia !== "string" &&
      typeof normalized.tinyPreview !== "string") {
    fail(`PWA content snapshot ${source} item ${index} (${id}) has no media/coverMedia/tinyPreview`);
  }
  return normalized;
}

function requiredSnapshotString(record, key, source, index) {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`PWA content snapshot ${source} item ${index} missing non-empty string ${key}`);
  }
  return value;
}

function requiredSnapshotStringField(record, key, source, index) {
  const value = record[key];
  if (typeof value !== "string") {
    fail(`PWA content snapshot ${source} item ${index} missing string ${key}`);
  }
  return value;
}

function requiredSnapshotNumber(record, key, source, index) {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`PWA content snapshot ${source} item ${index} missing finite number ${key}`);
  }
  return value;
}

function normalizeSnapshotStaticValue(value, label) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`PWA content snapshot ${label} has non-finite number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => normalizeSnapshotStaticValue(item, `${label}[${index}]`));
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (key.length === 0) fail(`PWA content snapshot ${label} has empty object key`);
      if (item === undefined) fail(`PWA content snapshot ${label}.${key} is undefined`);
      out[key] = normalizeSnapshotStaticValue(item, `${label}.${key}`);
    }
    return out;
  }
  fail(`PWA content snapshot ${label} has unsupported value type`);
}

function compareSnapshotContentForFeed(left, right) {
  const rightTime = Math.max(Number(right.publishedAt ?? 0), Number(right.timestamp ?? 0));
  const leftTime = Math.max(Number(left.publishedAt ?? 0), Number(left.timestamp ?? 0));
  if (rightTime !== leftTime) return rightTime - leftTime;
  return String(right.id ?? "").localeCompare(String(left.id ?? ""));
}

function pruneMobileSceneRoutesForContentSnapshot(routes, snapshot) {
  if (snapshot === null) return routes;
  const hasVideo = snapshot.contents.some((item) => item.type === "video");
  const hasImage = snapshot.contents.some((item) => item.type === "image");
  return routes.filter((route) => {
    if (route.routeId === "home_content_detail_open") return hasVideo;
    if (route.routeId === "home_image_detail_open") return hasImage;
    return true;
  });
}

function canonicalizeSnapshotPublishCategory(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  switch (normalized) {
    case "内容":
    case "短视频":
    case "content":
    case "short_video":
    case "short-video":
    case "video":
      return "content";
    case "电影":
    case "movie":
    case "film":
      return "movie";
    case "图文":
    case "圖片文字":
    case "圖文":
    case "graphic":
    case "image":
    case "image_text":
    case "image-text":
    case "imagetext":
    case "image_text_post":
      return "graphic";
    case "音乐":
    case "music":
    case "audio":
      return "music";
    case "小说":
    case "novel":
    case "book":
      return "novel";
    case "product":
    case "ecommerce":
    case "shop":
      return "product";
    case "food":
      return "food";
    case "ride":
      return "ride";
    case "secondhand":
      return "secondhand";
    case "live":
      return "live";
    case "ad":
      return "ad";
    default:
      return "";
  }
}

// Per-card fan-out: replace the single template "home_content_detail_open" /
// "home_image_detail_open" catalog route with one route PER video/image content, each
// carrying that content's own static values (so its own sourcePeer/media reach the
// device host, not whichever content happened to be find()-picked first — the bug that
// made every card on the feed land on the same route and play the same baked video,
// see cheng_gui_host.c's CHENG_ROUTE_MAITIAN_LOCAL comment trail). The routeId suffix
// must match contentRouteTargetForNode's algorithm in csg-web-materializer.ts
// (sanitizeContentRouteIdSuffix there) exactly, or the card's click handler target
// resolves to a route that was never registered.
function applyMobileContentSnapshotToRoutes(routes, contents, defaultContents, mediaOptions, videoFileMap, posterFileMap, nodes) {
  const routeValues = buildMobileContentSnapshotStaticValues(contents, defaultContents, mediaOptions, videoFileMap, posterFileMap, nodes);
  const expanded = [];
  for (const route of routes) {
    const perContentContents = route.routeId === "home_content_detail_open" ? routeValues.videoContents
      : route.routeId === "home_image_detail_open" ? routeValues.imageContents
      : null;
    if (perContentContents !== null) {
      for (const content of perContentContents) {
        expanded.push(contentDetailRouteForSnapshotContent(route, content, routeValues));
      }
      continue;
    }
    const injected = routeStaticValuesForPwaContentSnapshot(route.routeId, routeValues);
    expanded.push(Object.keys(injected).length === 0 ? route : {
      ...route,
      staticExpressionValues: {
        ...(route.staticExpressionValues ?? {}),
        ...injected,
      },
    });
  }
  return expanded;
}

function contentDetailRouteForSnapshotContent(templateRoute, content, routeValues) {
  const baseValues = routeStaticValuesForPwaContentSnapshot(templateRoute.routeId, routeValues);
  return {
    ...templateRoute,
    routeId: contentDetailRouteIdForContent(templateRoute.routeId, content),
    staticExpressionValues: {
      ...(templateRoute.staticExpressionValues ?? {}),
      ...baseValues,
      ...contentDetailStaticValues(content),
      // HomePage.tsx's own render logic (e.g. the `selectedContent` init in HomePage())
      // keys off a literal 'home_content_detail_open'/'home_image_detail_open' string
      // comparison against initialTruthRoute — independent of the NAVIGATION route id
      // above, which is now content-suffixed. Pin it to the un-suffixed base id so this
      // per-card route still resolves to the same fullscreen-detail branch the template
      // route used to. Mirrors normalizeMobileRouteHomeDefaults's fallback in
      // csg-web-materializer.ts (this explicit value takes precedence over it there).
      initialTruthRoute: templateRoute.routeId,
      resolvedTruthRoute: templateRoute.routeId,
    },
  };
}

function contentDetailRouteIdForContent(baseRouteId, content) {
  const suffix = sanitizeContentRouteIdSuffix(String(content.id ?? ""));
  if (suffix.length === 0) fail(`content id "${content.id}" has no usable route-suffix characters`);
  return `${baseRouteId}_${suffix}`;
}

// Keep in lockstep with sanitizeContentRouteIdSuffix in csg-web-materializer.ts — the
// materializer computes the SAME suffix independently from the card's own content.id to
// target this route, so the two algorithms must stay byte-for-byte identical.
function sanitizeContentRouteIdSuffix(id) {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function buildMobileContentSnapshotStaticValues(contents, defaultContents, mediaOptions, videoFileMap, posterFileMap, nodes) {
  const imageTemplate = defaultContents.find((item) => isPlainObject(item) && item.type === "image");
  const imageManifest = mediaManifestFromTemplateContent(imageTemplate, "image");
  // Per-card fan-out: each video content id resolves its manifest (hence its assetCid) from
  // ITS OWN source file (videoFileMap, built by resolveMobileVideoFileMapForSnapshot) instead
  // of every video card sharing defaultContents' single global video template — that sharing
  // is exactly the bug that baked the wrong content-smoke-video CID into a real per-card feed.
  const videoManifestCache = new Map();
  const videoManifestForContentId = (contentId) => {
    const cached = videoManifestCache.get(contentId);
    if (cached !== undefined) return cached;
    const videoFile = videoFileMap.get(contentId);
    if (typeof videoFile !== "string" || videoFile.length === 0) {
      fail(`no resolved video source file for content id "${contentId}" (resolveMobileVideoFileMapForSnapshot gap)`);
    }
    // Poster half of the same per-card fan-out (resolveMobileVideoPosterFileMapForSnapshot):
    // falls back to mediaOptions.mobileVideoPosterFile (always "" on the snapshot path) only
    // when this content id has no base64 preview of its own to derive a poster from.
    const posterFile = posterFileMap.get(contentId);
    const videoTemplate = defaultMobileRouteContents({
      ...mediaOptions,
      mobileVideoFile: videoFile,
      mobileVideoPosterFile: typeof posterFile === "string" && posterFile.length > 0 ? posterFile : mediaOptions.mobileVideoPosterFile,
    })
      .find((item) => isPlainObject(item) && item.type === "video");
    const manifest = mediaManifestFromTemplateContent(videoTemplate, "video");
    videoManifestCache.set(contentId, manifest);
    return manifest;
  };
  const enrichedContents = contents.map((content) => {
    if (content.type === "video") return contentWithMediaManifest(content, videoManifestForContentId(String(content.id ?? "")));
    if (content.type === "image") return contentWithMediaManifest(content, imageManifest);
    return content;
  });
  const videoContents = enrichedContents.filter((item) => item.type === "video");
  const imageContents = enrichedContents.filter((item) => item.type === "image");
  const videoContent = videoContents[0];
  const imageContent = imageContents[0];
  if (videoContent === undefined && imageContent === undefined) fail("PWA content snapshot has no media content after normalization");
  return {
    contents: enrichedContents,
    videoContent,
    imageContent,
    videoContents,
    imageContents,
    nodes: Array.isArray(nodes) ? nodes : [],
  };
}

async function resolveMobileMediaOptionsForSnapshot(snapshot, outDir, parsedOptions) {
  const mediaOptions = {
    mobileVideoFile: parsedOptions.mobileVideoFile,
    mobileVideoPosterFile: "",
    mobileImageFile: parsedOptions.mobileImageFile,
  };
  if (snapshot === null) return mediaOptions;
  const video = snapshot.contents.find((item) => item.type === "video");
  if (video === undefined) fail("PWA content snapshot has no video content for media asset extraction");
  // Per-card poster extraction now lives in resolveMobileVideoPosterFileMapForSnapshot (keyed
  // by content id) — this function used to extract only contents[0]'s (the first find()-picked
  // video's) preview into this single global mediaOptions.mobileVideoPosterFile, which then got
  // reused as EVERY video card's poster regardless of content id, the poster-side twin of the
  // bug resolveMobileVideoFileMapForSnapshot already fixed for the video source file itself.
  return mediaOptions;
}

function snapshotPreviewMediaSource(content) {
  for (const key of ["tinyPreview", "coverMedia"]) {
    const value = content[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "";
}

async function writeSnapshotDataImageAsPng(dataUrl, outDir, label) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) fail(`PWA snapshot ${label} must be a base64 data image`);
  const encoded = match[2].replace(/\s+/g, "");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0) fail(`PWA snapshot ${label} data image is empty`);
  let pngBytes;
  let metadata;
  try {
    const sharp = (await import("sharp")).default;
    metadata = await sharp(bytes, { failOn: "error" }).rotate().metadata();
    pngBytes = await sharp(bytes, { failOn: "error" }).rotate().png().toBuffer();
  } catch (error) {
    fail(`PWA snapshot ${label} image decode failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!metadata || !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height) || metadata.width <= 0 || metadata.height <= 0) {
    fail(`PWA snapshot ${label} image has invalid dimensions`);
  }
  const sha256 = createHash("sha256").update(pngBytes).digest("hex");
  const outputPath = join(outDir, "pwa-snapshot-media", `${label}-${sha256}.png`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, pngBytes);
  return outputPath;
}

// Resolves EACH distinct video content id present in a PWA content snapshot to its own real
// poster PNG, extracted from THAT content's own tinyPreview/coverMedia — the poster-side twin
// of resolveMobileVideoFileMapForSnapshot (video source file fan-out). Before this, every video
// card's rendered posterCid (and thus its runtime/media/assets/<posterCid>.png texture) was
// locked to whichever content happened to be find()-picked first by the old single-poster
// extraction in resolveMobileMediaOptionsForSnapshot, independent of that card's own already-
// per-card-correct assetCid.
async function resolveMobileVideoPosterFileMapForSnapshot(snapshot, outDir) {
  const map = new Map();
  if (snapshot === null) return map;
  const videoContents = snapshot.contents.filter((item) => isPlainObject(item) && item.type === "video");
  const videoContentIds = uniqueStrings(videoContents.map((item) => String(item.id ?? "")));
  for (const contentId of videoContentIds) {
    const content = videoContents.find((item) => String(item.id ?? "") === contentId);
    const previewSource = snapshotPreviewMediaSource(content);
    if (previewSource.length === 0 || !previewSource.startsWith("data:image/")) {
      if (videoContentIds.length > 1) {
        fail(
          `per-card video poster fan-out has ${videoContentIds.length} distinct video content ids but content id ` +
          `"${contentId}" carries no base64 tinyPreview/coverMedia to derive its own poster from (a single shared ` +
          `poster can no longer be reused across an ambiguous multi-card feed once more than one video content id exists)`,
        );
      }
      continue;
    }
    map.set(contentId, await writeSnapshotDataImageAsPng(previewSource, outDir, `video-poster-${contentId}`));
  }
  return map;
}

function mediaManifestFromTemplateContent(content, label) {
  if (!isPlainObject(content) || !isPlainObject(content.extra) || !isPlainObject(content.extra.mediaManifest)) {
    fail(`default retained ${label} media manifest is missing`);
  }
  return content.extra.mediaManifest;
}

function contentWithMediaManifest(content, manifest) {
  const extra = isPlainObject(content.extra) ? content.extra : {};
  // Per-card peer透传: the snapshot carries extra.sourcePeer.{host,port} per content;
  // fold it into this content's private manifest copy so each card's media slot dials
  // its own publisher (胡广生 192.168.1.3 / 麦田 192.168.1.4) instead of a shared写死 IP.
  const sourcePeer = isPlainObject(extra.sourcePeer) ? extra.sourcePeer : null;
  const peerHost = sourcePeer !== null && typeof sourcePeer.host === "string" ? sourcePeer.host : "";
  const peerPort = sourcePeer !== null && Number.isInteger(sourcePeer.port) ? sourcePeer.port : 0;
  const mediaManifest = (peerHost.length > 0 || peerPort > 0)
    ? { ...manifest, peerHost, peerPort }
    : manifest;
  return {
    ...content,
    extra: {
      ...extra,
      mediaManifest,
    },
  };
}

function routeStaticValuesForPwaContentSnapshot(routeId, routeValues) {
  const values = {};
  if (routeId.startsWith("home_")) {
    const activeCategory = homeRouteInitialCategory(routeId);
    const displayContents = activeCategory.length > 0
      ? routeValues.contents.filter((content) => content.publishCategory === activeCategory)
      : [];
    values.activeCategory = activeCategory;
    values.truthContent = routeValues.videoContent;
    values.distributedContents = routeValues.contents;
    values.deferredDistributedContents = routeValues.contents;
    values.mergedContents = routeValues.contents;
    values.displayContents = displayContents;
    if (routeId === "home_content_detail_open") {
      if (routeValues.videoContent === undefined) fail("home_content_detail_open requires visible video content");
      Object.assign(values, contentDetailStaticValues(routeValues.videoContent));
    }
    if (routeId === "home_image_detail_open") {
      if (routeValues.imageContent === undefined) fail("home_image_detail_open requires visible image content");
      Object.assign(values, contentDetailStaticValues(routeValues.imageContent));
    }
  }
  if (routeId === "content_detail") {
    Object.assign(values, contentDetailStaticValues(routeValues.videoContent ?? routeValues.imageContent));
  }
  if (routeId === "node_published_content") {
    values.items = routeValues.contents;
    values.selectedNodeContents = routeValues.contents;
    values.selectedNodeContent = null;
    values.truthContent = routeValues.videoContent ?? routeValues.imageContent;
  }
  if (routeId === "tab_nodes" && routeValues.nodes.length > 0) {
    // Anchor row(s) for NodesPage.tsx's filteredNodes list: same bypass as
    // displayContents above (inject the post-filter identifier directly)
    // since nodes have no active search/filter by default in this fixture.
    values.nodes = routeValues.nodes;
    values.filteredNodes = routeValues.nodes;
  }
  return values;
}

function homeRouteInitialCategory(routeId) {
  if (routeId === "home_app_channel") return "app";
  const channelMatch = routeId.match(/^home_([a-z]+)_channel$/);
  if (channelMatch) return channelMatch[1];
  return "content";
}

function contentDetailStaticValues(content) {
  const contentType = typeof content.type === "string" ? content.type : "";
  const media = typeof content.media === "string" ? content.media : "";
  const displayImages = contentType === "image" && media.length > 0 ? [media] : [];
  const contentExtra = isPlainObject(content.extra) ? content.extra : null;
  return {
    content,
    truthContent: content,
    selectedContent: content,
    contentExtra,
    contentType,
    images: displayImages,
    displayImages,
    imageIndex: 0,
    resolvedVideoSrc: contentType === "video" ? media : "",
    videoLoadState: contentType === "video" ? "ready" : "idle",
    videoLoadMessage: "",
    videoSegmentAppended: 1,
    videoSegmentTotal: 1,
    isVideoPlaying: contentType === "video",
    isPaid: false,
    isPurchased: false,
    price: 0,
    needsPaywall: false,
  };
}

function mobileContentSnapshotSummary(snapshot) {
  if (snapshot === null) return null;
  return {
    schema: snapshot.schema,
    source: snapshot.source,
    storageKey: snapshot.storageKey,
    contentCount: snapshot.contents.length,
    videoId: snapshot.videoId,
    imageId: snapshot.imageId,
    contentIds: snapshot.contents.map((item) => item.id),
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function precomputeSceneGlyphSdfAtlas(sceneFacts, options) {
  const debugArtifactPaths = [
    sceneGlyphSdfPrecomputeSourcePath,
    sceneGlyphSdfPrecomputeExePath,
    sceneGlyphSdfPrecomputeReportPath,
    sceneGlyphSdfPrecomputeReportPath + ".stderr",
    sceneGlyphSdfPrecomputeOutputPath,
    sceneGlyphSdfPrecomputePixelOutputPath,
  ];
  if (!options.keepDebugArtifacts) runResources.registerFiles(debugArtifactPaths);
  let processTreeGuardReceipt = null;
  try {
  const sourceOptions = {
    initialRoute: options.initialRoute,
    dynamicStateTextGlyphInventory: options.dynamicStateTextGlyphInventory,
    computerUseTextGlyphInventory: options.computerUseTextGlyphInventory,
    viewport: options.viewport,
  };
  const runtimeSourceText = readFileSync(webSceneRuntimeSourcePath, "utf8");
  const runtimeSourceHash = sha256Text(runtimeSourceText);
  const dependencySeedSourceText = emitSceneGlyphSdfAtlasPrecomputeSource(glyphSdfPrecomputeDependencySeedFacts(), {
    ...sourceOptions,
    pixelOutputPath: glyphSdfPixelOutputPlaceholder,
  });
  // Externalized payload sidecars (theoretical-limit lane). One-time cost per key: write the
  // exact base64 payloads the emitter would otherwise inline; exe reads them via argv[1].
  const glyphInputsDirAbs = join(outDir, "glyph-precompute-inputs");
  const glyphSortedFontResources = sceneFacts.filter((fact) =>
      fact.kind === "csg.web.scene.resource" && String(fact.resourceKind ?? "") === "font_subset")
    .sort((left, right) => Number(left.ordinal ?? 0) - Number(right.ordinal ?? 0) || String(left.resourceId ?? "").localeCompare(String(right.resourceId ?? "")));
  assert(glyphSortedFontResources.length > 0, "glyph SDF precompute requires font_subset resources");
  mkdirSync(glyphInputsDirAbs, { recursive: true });
  const glyphSidecarPaths = [];
  const glyphPayloadFingerprint = createHash("sha256");
  glyphSortedFontResources.forEach((res, idx) => {
    const payload = String(res.data ?? "");
    const sidecarPath = join(glyphInputsDirAbs, `glyph-input-${idx}.b64`);
    writeFileSync(sidecarPath, payload, "utf8");
    runResources.registerFile(sidecarPath);
    glyphSidecarPaths.push(sidecarPath);
    glyphPayloadFingerprint.update(`${idx}:${payload.length}:${createHash("sha256").update(payload).digest("hex")}
`);
  });
    if (useGlyphRowTables && options.resourceInputsExternal === true) {
    const rowSide = writeGlyphRowTableSidecarFiles(sceneFacts, glyphInputsDirAbs, { writeFileSync }, { join });
    for (const rp of rowSide.files) { runResources.registerFile(rp); glyphSidecarPaths.push(rp); }
    process.stderr.write(`  glyph row tables: nodes=${rowSide.counts.nodes} layouts=${rowSide.counts.layouts} paints=${rowSide.counts.paints}\n`);
  }
const glyphDataFingerprintHex = glyphPayloadFingerprint.digest("hex");
  const runtimeDependencyInfo = extractGlyphSdfPrecomputeRuntimeDependency(runtimeSourceText, dependencySeedSourceText);
  const cacheInputHashBase = glyphSdfPrecomputeCacheInputHash(sceneFacts, sourceOptions, dependencySeedSourceText);
  const cacheInputHash = sha256Text(`input:${cacheInputHashBase}\nresource-data:${glyphDataFingerprintHex}\n`);
  const cacheKey = sha256Text([
    `${glyphSdfPrecomputeCacheSchema}\n`,
    `runtime-deps:${runtimeDependencyInfo.hash}\n`,
    `input:${cacheInputHash}\n`,
  ].join(""));
  const cacheOutputPath = join(sceneGlyphSdfPrecomputeCacheDir, `${cacheKey}.out`);
  const cachePixelPath = join(sceneGlyphSdfPrecomputeCacheDir, `${cacheKey}.pixels.bin`);
  mkdirSync(sceneGlyphSdfPrecomputeCacheDir, { recursive: true });
  memoryTrace("after glyph precompute cache key");
  const cachedAtlas = await withCacheDirectoryLock(sceneGlyphSdfPrecomputeCacheDir, () => {
    if (!existsSync(cacheOutputPath)) return null;
    const cachedOutput = readFileSync(cacheOutputPath, "utf8");
    const output = materializeGlyphSdfPrecomputeOutput(cachedOutput, sceneGlyphSdfPrecomputePixelOutputPath);
    writeFileSync(sceneGlyphSdfPrecomputeOutputPath, output, "utf8");
    if (existsSync(cachePixelPath)) {
      copyFileSync(cachePixelPath, sceneGlyphSdfPrecomputePixelOutputPath);
    }
    const parsed = parseSceneGlyphSdfPrecomputeOutput(output, {
      pixelFilePath: existsSync(sceneGlyphSdfPrecomputePixelOutputPath) ? sceneGlyphSdfPrecomputePixelOutputPath : undefined,
    });
    parsed.precomputeInfo = {
      schema: glyphSdfPrecomputeCacheSchema,
      cacheHit: true,
      cacheKey,
      cacheOutputPath,
      runtimeSourceHash,
      runtimeDependencyHash: runtimeDependencyInfo.hash,
      runtimeDependencyDeclarationCount: runtimeDependencyInfo.declarationCount,
      runtimeDependencyMissingSymbols: runtimeDependencyInfo.missingSymbols,
      cacheInputHash,
      processTreeGuard: null,
    };
    writeFileSync(sceneGlyphSdfPrecomputeReportPath, [
      "glyph_sdf_precompute_cache=hit",
      `glyph_sdf_precompute_cache_key=${cacheKey}`,
      `glyph_sdf_precompute_runtime_source_hash=${runtimeSourceHash}`,
      `glyph_sdf_precompute_runtime_dependency_hash=${runtimeDependencyInfo.hash}`,
      `glyph_sdf_precompute_runtime_dependency_declarations=${runtimeDependencyInfo.declarationCount}`,
      `glyph_sdf_precompute_cache_input_hash=${cacheInputHash}`,
      `glyph_sdf_precompute_cache_output=${cacheOutputPath}`,
      `glyph_sdf_precompute_cache_pixels=${cachePixelPath}`,
      "",
    ].join("\n"), "utf8");
    pruneGlyphSdfPrecomputeCache(sceneGlyphSdfPrecomputeCacheDir, cacheKey);
    return parsed;
  });
  if (cachedAtlas !== null) {
    memoryTrace("after glyph precompute cache hit");
    return cachedAtlas;
  }

  if (options.requireCacheHit) {
    writeFileSync(sceneGlyphSdfPrecomputeReportPath, [
      "glyph_sdf_precompute_cache=miss",
      `glyph_sdf_precompute_cache_key=${cacheKey}`,
      `glyph_sdf_precompute_runtime_source_hash=${runtimeSourceHash}`,
      `glyph_sdf_precompute_runtime_dependency_hash=${runtimeDependencyInfo.hash}`,
      `glyph_sdf_precompute_runtime_dependency_declarations=${runtimeDependencyInfo.declarationCount}`,
      `glyph_sdf_precompute_cache_input_hash=${cacheInputHash}`,
      `glyph_sdf_precompute_cache_output=${cacheOutputPath}`,
      `glyph_sdf_precompute_cache_pixels=${cachePixelPath}`,
      "glyph_sdf_precompute_cache_required=true",
      "",
    ].join("\n"), "utf8");
    fail(`glyph SDF precompute cache miss for key ${cacheKey}; prewarm or rerun without --require-glyph-sdf-precompute-cache-hit`);
  }

  const cacheSourceText = emitSceneGlyphSdfAtlasPrecomputeSource(sceneFacts, {
    ...sourceOptions,
    pixelOutputPath: glyphSdfPixelOutputPlaceholder,
    resourceInputsExternal: true,
  });
  const fullSourceRuntimeDependencyInfo = extractGlyphSdfPrecomputeRuntimeDependency(runtimeSourceText, cacheSourceText);
  // The dependency seed must COVER the generated source's runtime-symbol closure — hash equality
  // is the UniMaker-scene case (full text scene); a codex shell scene (no text paints) closes
  // over a strict subset, which the seed already contains. Subset is the real contract.
  {
    const seedNames = new Set(runtimeDependencyInfo.names);
    const uncovered = fullSourceRuntimeDependencyInfo.names.filter((name) => !seedNames.has(name));
    assert.deepEqual(uncovered, [], "glyph SDF precompute dependency seed must cover the generated source dependency closure");
  }
  memoryTrace("after glyph precompute source");
  let sourceText = cacheSourceText.replaceAll(glyphSdfPixelOutputPlaceholder, sceneGlyphSdfPrecomputePixelOutputPath);
  // Campaign C R1: strip family paragraphs + inject interpreter + swap dispatch
  if (useGlyphRowTables) {
    const glyphInputsDir = join(outDir, "glyph-precompute-inputs");
    mkdirSync(glyphInputsDir, { recursive: true });
    const rowSide = writeGlyphRowTableSidecarFiles(sceneFacts, glyphInputsDir, { writeFileSync }, { join });
    for (const rp of rowSide.files) { runResources.registerFile(rp); glyphSidecarPaths.push(rp); }
    sourceText = finalizeGlyphRowMode(sourceText, readInterpreterTemplate(import.meta.url));
    process.stderr.write(`  glyph row-table finalize: nodes=${rowSide.counts.nodes} layouts=${rowSide.counts.layouts} paints=${rowSide.counts.paints}\n`);
  }
  writeFileSync(sceneGlyphSdfPrecomputeSourcePath, sourceText, "utf8");
  if (process.env.UNIMAKER_KEEP_PRECOMPUTE_SOURCE === "1") {
    writeFileSync(`/tmp/precompute_source_${process.pid}.cheng`, sourceText, "utf8");
    process.stderr.write(`precompute source copied to /tmp/precompute_source_${process.pid}.cheng\n`);
  }
  const compileSourceRel = `src/.gen/unimaker_scene_glyph_sdf_precompute_${Date.now()}_${process.pid}_${randomUUID()}.cheng`;
  const compileSourceAbs = join(repoRoot, compileSourceRel);
  runResources.registerFile(compileSourceAbs);
  try {
    mkdirSync(dirname(compileSourceAbs), { recursive: true });
    writeFileSync(compileSourceAbs, sourceText, "utf8");
    await compileChengToExe(options.cheng, repoRoot, compileSourceRel, sceneGlyphSdfPrecomputeExePath, sceneGlyphSdfPrecomputeReportPath, {
      timeout: options.timeoutMs,
      emitMode: options.emitMode,
      resourceManifest: runResources,
    }).catch((err) => {
      process.stderr.write(`glyph precompute compile failed: ${err.message}\n${err.stderr ? String(err.stderr).slice(0, 4000) : ""}\n`);
      throw err;
    });
  } finally {
    if (process.env.UNIMAKER_KEEP_PRECOMPUTE_SOURCE !== "1") runResources.removeFiles([compileSourceAbs]);
    else process.stderr.write(`keeping precompute source: ${compileSourceAbs}\n`);
  }
  memoryTrace("after glyph precompute compile");

  let guardedRun;
  if (process.env.UNIMAKER_UNGUARDED === "1") {
    // Escape hatch while the beat guard's receipt finalize is broken upstream:
    // run the precompute directly (same exe, same stdout capture, no receipt).
    const { spawnSync } = await import("node:child_process");
    const direct = spawnSync(sceneGlyphSdfPrecomputeExePath, [glyphInputsDirAbs], {
      cwd: repoRoot,
      env: { ...process.env },
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: options.timeoutMs,
    });
    if (direct.error) throw direct.error;
    if (direct.status !== 0) throw new Error(`glyph precompute direct run failed (${direct.status}): ${String(direct.stderr).slice(0, 2000)}`);
    writeFileSync(sceneGlyphSdfPrecomputeOutputPath, direct.stdout, "utf8");
    guardedRun = { receipt: null };
  } else {
    // Prior failed runs leave guard outputs behind; this run owns the out-dir,
    // so stale receipts must not block regeneration.
    for (const staleGuardPath of [sceneGlyphSdfPrecomputeGuardReceiptPath, sceneGlyphSdfPrecomputeOutputPath, sceneGlyphSdfPrecomputeGuardStderrPath, sceneGlyphSdfPrecomputePixelOutputPath]) {
      if (existsSync(staleGuardPath)) rmSync(staleGuardPath, { force: true });
    }
    guardedRun = await runGeneratedExecutable(sceneGlyphSdfPrecomputeExePath, [glyphInputsDirAbs], {
      guardPath: processTreeGuardPath,
      cwd: repoRoot,
      env: {},
      timeout: options.timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      receiptPath: sceneGlyphSdfPrecomputeGuardReceiptPath,
      stdoutPath: sceneGlyphSdfPrecomputeOutputPath,
      stderrPath: sceneGlyphSdfPrecomputeGuardStderrPath,
      returnOutput: false,
    });
  }
  processTreeGuardReceipt = guardedRun.receipt;
  // Payloads live on in the cache entry (.out + pixels); transient sidecars are done.
  for (const sidecarPath of glyphSidecarPaths) rmSync(sidecarPath, { force: true });
  memoryTrace("after glyph precompute run");
  const output = readFileSync(sceneGlyphSdfPrecomputeOutputPath, "utf8");
  const parsed = parseSceneGlyphSdfPrecomputeOutput(output, {
    pixelFilePath: existsSync(sceneGlyphSdfPrecomputePixelOutputPath) ? sceneGlyphSdfPrecomputePixelOutputPath : undefined,
  });
  await withCacheDirectoryLock(sceneGlyphSdfPrecomputeCacheDir, () => {
    const cacheTempPath = join(sceneGlyphSdfPrecomputeCacheDir, `${cacheKey}.${process.pid}.${randomUUID()}.tmp`);
    runResources.registerFile(cacheTempPath);
    writeFileSync(cacheTempPath, normalizeGlyphSdfPrecomputeOutput(output, sceneGlyphSdfPrecomputePixelOutputPath), "utf8");
    renameSync(cacheTempPath, cacheOutputPath);
    runResources.releaseFile(cacheTempPath);
    if (existsSync(sceneGlyphSdfPrecomputePixelOutputPath)) {
      const cachePixelTempPath = join(sceneGlyphSdfPrecomputeCacheDir, `${cacheKey}.${process.pid}.${randomUUID()}.pixels.tmp`);
      runResources.registerFile(cachePixelTempPath);
      copyFileSync(sceneGlyphSdfPrecomputePixelOutputPath, cachePixelTempPath);
      renameSync(cachePixelTempPath, cachePixelPath);
      runResources.releaseFile(cachePixelTempPath);
    }
    pruneGlyphSdfPrecomputeCache(sceneGlyphSdfPrecomputeCacheDir, cacheKey);
  });
  parsed.precomputeInfo = {
    schema: glyphSdfPrecomputeCacheSchema,
    cacheHit: false,
    cacheKey,
    cacheOutputPath,
    runtimeSourceHash,
    runtimeDependencyHash: runtimeDependencyInfo.hash,
    runtimeDependencyDeclarationCount: runtimeDependencyInfo.declarationCount,
    runtimeDependencyMissingSymbols: runtimeDependencyInfo.missingSymbols,
    cacheInputHash,
    processTreeGuard: processTreeGuardReceipt,
  };
  return parsed;
  } finally {
    if (!options.keepDebugArtifacts) runResources.removeFiles(debugArtifactPaths);
  }
}

function glyphSdfPrecomputeDependencySeedFacts() {
  return [
    { kind: "csg.web.scene.route", routeId: "glyph_seed", routeIndex: 0, ordinal: 0, width: 390, height: 844 },
    { kind: "csg.web.scene.layer", routeId: "glyph_seed", routeIndex: 0, layerId: 1, ordinal: 0, name: "content" },
    {
      kind: "csg.web.scene.resource",
      ordinal: 0,
      resourceKind: "font_subset",
      resourceId: "font.0",
      source: "",
      data: "AA==",
      hash: sha256Text("glyph-seed-font"),
      byteSize: 1,
      fontWeight: 400,
      fontFamily: 0,
    },
    {
      kind: "csg.web.scene.node",
      routeId: "glyph_seed",
      routeIndex: 0,
      nodeId: 1,
      parentNodeId: 0,
      ordinal: 0,
      nodeKind: "text",
      tagName: "",
      text: "A",
      layerId: 1,
      conditionalStateRef: "",
      conditionalStateValue: "",
      textStateRef: "",
    },
    {
      kind: "csg.web.scene.layout",
      routeId: "glyph_seed",
      routeIndex: 0,
      nodeId: 1,
      ordinal: 0,
      propName: "font-size",
      propValue: "16px",
    },
    {
      kind: "csg.web.scene.paint",
      routeId: "glyph_seed",
      routeIndex: 0,
      nodeId: 1,
      ordinal: 0,
      x: 0,
      y: 0,
      opKind: "text",
      color: "0xFF000000",
      radius: 0,
      width: 0,
      height: 0,
      resourceId: "",
      text: "A",
    },
  ];
}

function glyphSdfPrecomputeCacheInputHash(sceneFacts, sourceOptions, dependencySeedSourceText) {
  const sceneRuntimeSmokeSourceHash = sha256Text(readFileSync(sceneRuntimeSmokeSourcePath, "utf8"));
  const hash = createHash("sha256");
  hashStructuredValue(hash, {
    schema: "unimaker.glyph_sdf_precompute_input.v1",
    generator: {
      sceneRuntimeSmokeSourceHash,
      dependencySeedSourceHash: sha256Text(dependencySeedSourceText),
    },
    options: {
      initialRoute: String(sourceOptions.initialRoute ?? ""),
      dynamicStateTextGlyphInventory: String(sourceOptions.dynamicStateTextGlyphInventory ?? ""),
      computerUseTextGlyphInventory: String(sourceOptions.computerUseTextGlyphInventory ?? ""),
      viewport: sourceOptions.viewport ?? null,
      pixelOutputPath: glyphSdfPixelOutputPlaceholder,
    },
    facts: glyphSdfPrecomputeRelevantFacts(sceneFacts),
  });
  return hash.digest("hex");
}

function glyphSdfPrecomputeRelevantFacts(sceneFacts) {
  return {
    routes: sceneFacts
      .filter((fact) => fact?.kind === "csg.web.scene.route")
      .sort((left, right) => Number(left.routeIndex) - Number(right.routeIndex))
      .map((fact) => pickDefinedFactFields(fact, ["routeId", "routeIndex"])),
    layers: sceneFacts
      .filter((fact) => fact?.kind === "csg.web.scene.layer")
      .sort((left, right) => Number(left.routeIndex) - Number(right.routeIndex) || Number(left.ordinal) - Number(right.ordinal))
      .map((fact) => pickDefinedFactFields(fact, ["routeIndex", "layerId", "ordinal", "name"])),
    nodes: sceneFacts
      .filter((fact) => fact?.kind === "csg.web.scene.node")
      .sort((left, right) => Number(left.routeIndex) - Number(right.routeIndex) || Number(left.nodeId) - Number(right.nodeId))
      .map((fact) => pickDefinedFactFields(fact, [
        "routeIndex",
        "nodeId",
        "parentNodeId",
        "nodeKind",
        "tagName",
        "text",
        "layerId",
        "conditionalStateRef",
        "conditionalStateValue",
        "textStateRef",
      ])),
    resources: sceneFacts
      .filter((fact) => fact?.kind === "csg.web.scene.resource" && String(fact.resourceKind ?? "") === "font_subset")
      .sort((left, right) => Number(left.ordinal ?? 0) - Number(right.ordinal ?? 0) || String(left.resourceId ?? "").localeCompare(String(right.resourceId ?? "")))
      .map((fact) => pickDefinedFactFields(fact, [
        "ordinal",
        "resourceKind",
        "resourceId",
        "source",
        "data",
        "hash",
        "byteSize",
        "fontWeight",
        "fontFamily",
        "width",
        "height",
        "pixels",
      ])),
    layouts: sceneFacts
      .filter((fact) => fact?.kind === "csg.web.scene.layout")
      .sort((left, right) => Number(left.routeIndex) - Number(right.routeIndex) || Number(left.nodeId) - Number(right.nodeId) || Number(left.ordinal) - Number(right.ordinal))
      .map((fact) => pickDefinedFactFields(fact, ["routeIndex", "nodeId", "ordinal", "propName", "propValue"])),
    paints: sceneFacts
      .filter((fact) => fact?.kind === "csg.web.scene.paint" && scenePaintKindIsTextForCacheInput(fact.opKind))
      .sort((left, right) => Number(left.routeIndex) - Number(right.routeIndex) || Number(left.nodeId) - Number(right.nodeId) || Number(left.ordinal) - Number(right.ordinal))
      .map((fact) => pickDefinedFactFields(fact, [
        "routeIndex",
        "nodeId",
        "ordinal",
        "x",
        "y",
        "opKind",
        "color",
        "radius",
        "width",
        "height",
        "resourceId",
        "text",
      ])),
  };
}

function scenePaintKindIsTextForCacheInput(opKind) {
  const text = String(opKind ?? "");
  return text === "text" || text === "placeholder_text";
}

function pickDefinedFactFields(fact, fields) {
  const out = {};
  for (const field of fields) {
    if (fact[field] !== undefined) out[field] = fact[field];
  }
  return out;
}

function hashStructuredValue(hash, value) {
  if (value === undefined) {
    hash.update("u;");
    return;
  }
  if (value === null) {
    hash.update("n;");
    return;
  }
  if (Array.isArray(value)) {
    hash.update(`a${value.length};`);
    for (const item of value) hashStructuredValue(hash, item);
    return;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    hash.update(`o${keys.length};`);
    for (const key of keys) {
      hash.update(`k${Buffer.byteLength(key, "utf8")}:${key};`);
      hashStructuredValue(hash, value[key]);
    }
    return;
  }
  const text = String(value);
  hash.update(`${typeof value}${Buffer.byteLength(text, "utf8")}:${text};`);
}

function normalizeGlyphSdfPrecomputeOutput(output, pixelOutputPath) {
  return rewriteGlyphSdfPrecomputePixelFile(output, pixelOutputPath, glyphSdfPixelOutputPlaceholder);
}

function materializeGlyphSdfPrecomputeOutput(output, pixelOutputPath) {
  return rewriteGlyphSdfPrecomputePixelFile(output, undefined, pixelOutputPath);
}

function rewriteGlyphSdfPrecomputePixelFile(output, expectedPixelPath, nextPixelPath) {
  const lines = output.split(/\r?\n/);
  let replaced = false;
  for (let index = 0; index + 1 < lines.length; index += 1) {
    if (lines[index].trim() !== "pixels_file") continue;
    const current = lines[index + 1].trim();
    if (expectedPixelPath === undefined || current === expectedPixelPath || current === glyphSdfPixelOutputPlaceholder) {
      lines[index + 1] = nextPixelPath;
      replaced = true;
    }
  }
  return replaced ? lines.join("\n") : output;
}

function pruneGlyphSdfPrecomputeCache(cacheDir, activeCacheKey) {
  const keys = new Map();
  for (const entry of readdirSync(cacheDir)) {
    const cached = /^([0-9a-f]{64})\.(out|pixels\.bin)$/u.exec(entry);
    if (cached) {
      const key = cached[1];
      const path = join(cacheDir, entry);
      const mtimeMs = statSync(path).mtimeMs;
      keys.set(key, Math.max(Number(keys.get(key) ?? 0), mtimeMs));
      continue;
    }
    // Temporary cache files belong to another run's resource manifest until
    // that run atomically renames them. Cache pruning must never delete them.
  }
  const retainedKeys = new Set([...keys.entries()]
    .sort((left, right) => {
      if (left[0] === activeCacheKey) return -1;
      if (right[0] === activeCacheKey) return 1;
      return right[1] - left[1] || left[0].localeCompare(right[0]);
    })
    .slice(0, glyphSdfPrecomputeCacheRetainKeys)
    .map(([key]) => key));
  for (const entry of readdirSync(cacheDir)) {
    const cached = /^([0-9a-f]{64})\.(out|pixels\.bin)$/u.exec(entry);
    if (cached && !retainedKeys.has(cached[1])) {
      rmSync(join(cacheDir, entry), { force: true });
    }
  }
}

function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function extractGlyphSdfPrecomputeRuntimeDependency(runtimeSourceText, precomputeSourceText) {
  const declarations = parseWebSceneRuntimeDeclarations(runtimeSourceText);
  const seeds = webSceneSymbolsInText(precomputeSourceText)
    .filter((name) => declarations.has(name));
  const missingSymbols = webSceneSymbolsInText(precomputeSourceText)
    .filter((name) => !declarations.has(name));
  if (missingSymbols.length > 0) {
    fail(`glyph SDF precompute references runtime symbols missing from ${webSceneRuntimeSourcePath}: ${missingSymbols.join(",")}`);
  }

  const used = new Set();
  const queue = [...seeds];
  for (let read = 0; read < queue.length; read += 1) {
    const name = queue[read];
    if (used.has(name)) continue;
    const declaration = declarations.get(name);
    if (declaration === undefined) continue;
    used.add(name);
    for (const referenced of webSceneSymbolsInText(declaration.text)) {
      if (!used.has(referenced) && declarations.has(referenced)) queue.push(referenced);
    }
  }

  const names = Array.from(used).sort();
  const dependencyText = [
    "web_scene_runtime.glyph_sdf_precompute_dependency.v1",
    ...names.map((name) => `${name}\n${declarations.get(name).text}`),
    "",
  ].join("\n");
  return {
    hash: sha256Text(dependencyText),
    declarationCount: names.length,
    missingSymbols,
    names,
  };
}

function parseWebSceneRuntimeDeclarations(runtimeSourceText) {
  const lines = runtimeSourceText.split(/\n/);
  const declarations = new Map();
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const fnMatch = line.match(/^fn\s+(WebScene[A-Za-z0-9_]*)\b/);
    if (fnMatch) {
      const start = index;
      index += 1;
      while (index < lines.length && !isChengTopLevelDeclarationStart(lines[index])) index += 1;
      declarations.set(fnMatch[1], { text: lines.slice(start, index).join("\n") });
      continue;
    }
    const varMatch = line.match(/^var\s+(WebScene[A-Za-z0-9_]*)\b/);
    if (varMatch) {
      declarations.set(varMatch[1], { text: line });
      index += 1;
      continue;
    }
    if (line.trim() === "const") {
      index = parseWebSceneConstDeclarations(lines, index + 1, declarations);
      continue;
    }
    if (line.trim() === "type") {
      index = parseWebSceneTypeDeclarations(lines, index + 1, declarations);
      continue;
    }
    index += 1;
  }
  return declarations;
}

function parseWebSceneConstDeclarations(lines, index, declarations) {
  while (index < lines.length && !isChengTopLevelDeclarationStart(lines[index])) {
    const match = lines[index].match(/^\s+(WebScene[A-Za-z0-9_]*)\b/);
    if (match) declarations.set(match[1], { text: `const ${lines[index].trim()}` });
    index += 1;
  }
  return index;
}

function parseWebSceneTypeDeclarations(lines, index, declarations) {
  while (index < lines.length && !isChengTopLevelDeclarationStart(lines[index])) {
    const match = lines[index].match(/^    (WebScene[A-Za-z0-9_]*)\s*=/);
    if (!match) {
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    while (
      index < lines.length &&
      !isChengTopLevelDeclarationStart(lines[index]) &&
      !lines[index].match(/^    WebScene[A-Za-z0-9_]*\s*=/)
    ) {
      index += 1;
    }
    declarations.set(match[1], { text: `type\n${lines.slice(start, index).join("\n")}` });
  }
  return index;
}

function isChengTopLevelDeclarationStart(line) {
  return /^(const|type|var|fn)\b/.test(line);
}

function webSceneSymbolsInText(text) {
  return uniqueStrings(Array.from(text.matchAll(/\b(WebScene[A-Za-z0-9_]*)\b/g), (match) => match[1]));
}

function resolveMobileSceneRoutes(options, projectRoot) {
  if (options.mobileSceneRoutes.length > 0) {
    return options.mobileSceneRoutes.map((route) => normalizeMobileSceneRoute(route, projectRoot));
  }
  if (options.mobileSceneRoutesDefaultCatalog) return defaultUniMakerMobileSceneRoutes;
  if (resolve(projectRoot) !== resolve(defaultProjectRoot)) return [];
  return defaultUniMakerMobileSceneRoutes;
}

function resolveMobileVideoFileOption(options, projectRoot) {
  if (typeof options.mobileVideoFile === "string" && options.mobileVideoFile.trim().length > 0) {
    return resolvePath(options.mobileVideoFile.trim());
  }
  if (resolve(projectRoot) === resolve(defaultProjectRoot)) {
    const pwaVideoCandidates = uniqueStrings([
      join(projectRoot, "public", "pwa-smoke", "content-smoke-video-cmaf.mp4"),
      join(projectRoot, "dist", "pwa-smoke", "content-smoke-video-cmaf.mp4"),
      join(projectRoot, "public", "pwa-smoke", "胡广生.mp4"),
      join(projectRoot, "dist", "pwa-smoke", "胡广生.mp4"),
      join(projectRoot, "public", "pwa-smoke", "麦田.mp4"),
      join(projectRoot, "dist", "pwa-smoke", "麦田.mp4"),
    ]);
    for (const candidate of pwaVideoCandidates) {
      if (!existsSync(candidate)) continue;
      process.stderr.write(`  auto-selected mobile video asset: ${candidate}\n`);
      return candidate;
    }
    fail(`default UniMaker mobile video asset requires a playback-grade MP4 with audio. Checked:\n${pwaVideoCandidates.join("\n")}`);
  }
  const manifestPath = join(projectRoot, "asset_manifest_v1.json");
  if (!existsSync(manifestPath)) return "";
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`invalid UniMaker asset manifest ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const videoEntry = entries.find((entry) =>
    entry &&
    entry.kind === "video" &&
    typeof entry.path === "string" &&
    entry.path.trim().length > 0
  );
  if (videoEntry === undefined) return "";
  const relPath = normalizeAssetManifestRelPath(videoEntry.path);
  const expectedHash = typeof videoEntry.content_hash === "string" ? videoEntry.content_hash.trim().toLowerCase() : "";
  const candidates = uniqueStrings([
    join(projectRoot, relPath),
    relPath.startsWith("public/") ? join(projectRoot, "dist", relPath.slice("public/".length)) : "",
    join(projectRoot, "android", "app", "src", "main", "assets", relPath),
    join(projectRoot, "android", "app", "build", "intermediates", "assets", "debug", "mergeDebugAssets", relPath),
  ].filter((candidate) => candidate.length > 0), (candidate) => resolve(candidate));
  const hashMismatches = [];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    if (/^[0-9a-f]{64}$/.test(expectedHash)) {
      const actualHash = sha256File(candidate);
      if (actualHash !== expectedHash) {
        hashMismatches.push(`${candidate} sha256=${actualHash}`);
        continue;
      }
    }
    process.stderr.write(`  auto-selected mobile video asset: ${candidate}\n`);
    return candidate;
  }
  if (hashMismatches.length > 0) {
    fail(`UniMaker asset manifest video hash mismatch for ${relPath}; expected ${expectedHash}; candidates:\n${hashMismatches.join("\n")}`);
  }
  fail(`UniMaker asset manifest declares video ${relPath}, but no local file was found. Checked:\n${candidates.join("\n")}`);
}

// Resolves EACH distinct video content id present in a PWA content snapshot to its own real
// source file, so per-card fan-out bakes N distinct content-addressed CIDs instead of one
// shared (and possibly wrong) CID. Pairs with defaultMobileRouteMediaPayloadAssetsForFacts's
// additionalVideoMediaOptions parameter, which writes the matching bytes for every distinct
// video assetCid the fanned-out routes actually end up emitting.
function resolveMobileVideoFileMapForSnapshot(snapshot, options, projectRoot) {
  const map = new Map();
  if (snapshot === null) return map;
  const videoContentIds = uniqueStrings(
    snapshot.contents
      .filter((item) => isPlainObject(item) && item.type === "video")
      .map((item) => String(item.id ?? "")),
  );
  for (const contentId of videoContentIds) {
    map.set(contentId, resolveMobileVideoFileForContentId(contentId, options, projectRoot, videoContentIds.length));
  }
  return map;
}

function resolveMobileVideoFileForContentId(contentId, options, projectRoot, distinctVideoContentCount) {
  const explicit = options.mobileVideoFileMap[contentId];
  if (typeof explicit === "string" && explicit.length > 0) {
    if (!existsSync(explicit)) fail(`--mobile-video-file-map["${contentId}"] does not exist: ${explicit}`);
    return explicit;
  }
  if (resolve(projectRoot) === resolve(defaultProjectRoot)) {
    const known = defaultProjectMobileVideoFileByContentId.get(contentId);
    if (known !== undefined) {
      if (!existsSync(known)) fail(`default per-card mobile video asset for content id "${contentId}" is missing: ${known}`);
      return known;
    }
  }
  if (distinctVideoContentCount <= 1) {
    // No fan-out ambiguity — the whole snapshot only ever names one video content id, so the
    // single global --mobile-video-file (or its auto-selected default) unambiguously belongs
    // to it. Preserves pre-fan-out single-card behavior byte for byte.
    return options.mobileVideoFile;
  }
  fail(
    `per-card video fan-out has ${distinctVideoContentCount} distinct video content ids but no real source file ` +
    `is mapped for content id "${contentId}" (a single --mobile-video-file can no longer be reused across an ` +
    `ambiguous multi-card feed once more than one video content id exists) — pass ` +
    `--mobile-video-file-map '{"${contentId}":"/path/to/real.mp4",...}' or extend ` +
    `defaultProjectMobileVideoFileByContentId in unimaker-one-click.mjs`,
  );
}

function resolveMobileImageFileOption(options, projectRoot) {
  if (typeof options.mobileImageFile === "string" && options.mobileImageFile.trim().length > 0) {
    return resolvePath(options.mobileImageFile.trim());
  }
  if (resolve(projectRoot) !== resolve(defaultProjectRoot)) return "";
  const pwaImageCandidates = uniqueStrings([
    join(projectRoot, "public", "pwa-smoke", "content-smoke-image.png"),
    join(projectRoot, "dist", "pwa-smoke", "content-smoke-image.png"),
  ], (candidate) => resolve(candidate));
  for (const candidate of pwaImageCandidates) {
    if (!existsSync(candidate)) continue;
    process.stderr.write(`  auto-selected mobile image asset: ${candidate}\n`);
    return candidate;
  }
  return "";
}

function normalizeAssetManifestRelPath(value) {
  const rel = value.trim().replaceAll("\\", "/").replace(/^\/+/, "").replace(/^\.\//, "");
  if (rel.length === 0 || rel.includes("..")) fail(`invalid UniMaker asset manifest path: ${value}`);
  return rel;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

// --- Extract cache (content-addressed) ---------------------------------------

// Fold a file's content into the running hash. Missing files fold a distinct
// marker so appearance/disappearance also changes the key.
function hashFileInto(hash, label, absPath) {
  if (!existsSync(absPath)) {
    hash.update(`F0:${label}\n`);
    return;
  }
  const buf = readFileSync(absPath);
  hash.update(`F1:${label}:${buf.length}\n`);
  hash.update(buf);
}

// Fold every *.js under dir (recursively, sorted) into the hash. This pins the
// extractor version to the actual transpiled code rather than a version string,
// so any change to the compiled extractor invalidates the cache even if dist is
// concurrently rebuilt.
function hashDistJsInto(hash, dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(current, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && entry.name.endsWith(".js")) files.push(child);
    }
  };
  walk(dir);
  files.sort();
  hash.update(`DISTJS:${files.length}\n`);
  for (const file of files) hashFileInto(hash, file.slice(dir.length + 1), file);
}

async function computeExtractCacheKey(extractOpts) {
  const ts = (await import("typescript")).default;
  const configDiagnostics = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(projectTsConfig, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => configDiagnostics.push(diagnostic),
  });
  if (!parsed) {
    fail(`extract cache: failed to parse tsconfig ${projectTsConfig}`);
  }
  if ((parsed.errors ?? []).length > 0 || configDiagnostics.length > 0) {
    const messages = [...configDiagnostics, ...(parsed.errors ?? [])]
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    fail(`extract cache: tsconfig ${projectTsConfig} has errors:\n${messages.join("\n")}`);
  }
  const hash = createHash("sha256");
  hash.update(`${extractCacheSchema}\n`);
  hash.update(`ts:${ts.version}\n`);
  hashDistJsInto(hash, join(packageDir, "dist"));
  hash.update(`compilerOptions:${JSON.stringify(parsed.options)}\n`);
  hash.update(`extract:${JSON.stringify({
    projectRoot,
    projectTsConfig,
    rootDir: extractOpts.rootDir,
    runtime: extractOpts.runtime,
    entryRoots: extractOpts.entryRoots,
    emitText: extractOpts.emitText,
    includeDebugMaps: extractOpts.includeDebugMaps,
  })}\n`);
  hashFileInto(hash, "tsconfig", projectTsConfig);
  for (const reference of parsed.projectReferences ?? []) {
    hashFileInto(hash, `ref:${reference.path}`, reference.path);
  }
  // Dependency proxy: node_modules .d.ts (React types, etc.) are read by the TS
  // program for type-derived facts. Hashing the whole tree is prohibitive, so we
  // fold the manifest + lockfile — a change to any installed dependency version
  // shows up there.
  hashFileInto(hash, "package.json", join(projectRoot, "package.json"));
  for (const lock of ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]) {
    hashFileInto(hash, lock, join(projectRoot, lock));
  }
  const sourceFiles = [...parsed.fileNames].sort();
  hash.update(`sources:${sourceFiles.length}\n`);
  for (const file of sourceFiles) hashFileInto(hash, file, file);
  return { key: hash.digest("hex"), sourceFileCount: sourceFiles.length };
}

function extractCachePath(key) {
  return join(extractCacheDir, `${key}.v8bin`);
}

function readExtractCache(key) {
  const path = extractCachePath(key);
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  let decoded;
  try {
    decoded = v8.deserialize(buf);
  } catch {
    return null;
  }
  if (!decoded || decoded.schema !== extractCacheSchema || decoded.key !== key) return null;
  if (!Array.isArray(decoded.facts) || typeof decoded.text !== "string" || decoded.report === undefined || decoded.report === null) {
    return null;
  }
  return {
    facts: decoded.facts,
    diagnostics: Array.isArray(decoded.diagnostics) ? decoded.diagnostics : [],
    report: decoded.report,
    text: decoded.text,
    cacheBytes: buf.length,
  };
}

function writeExtractCache(key, result) {
  mkdirSync(extractCacheDir, { recursive: true });
  const buf = v8.serialize({
    schema: extractCacheSchema,
    key,
    facts: result.facts,
    diagnostics: result.diagnostics,
    report: result.report,
    text: result.text,
  });
  const tempPath = join(extractCacheDir, `${key}.${process.pid}.${randomUUID()}.tmp`);
  runResources.registerFile(tempPath);
  writeFileSync(tempPath, buf);
  renameSync(tempPath, extractCachePath(key));
  runResources.releaseFile(tempPath);
  pruneExtractCache(key);
  return buf.length;
}

function pruneExtractCache(activeKey) {
  const entries = [];
  for (const name of readdirSync(extractCacheDir)) {
    const cached = /^([0-9a-f]{64})\.v8bin$/u.exec(name);
    if (cached) {
      entries.push([cached[1], statSync(join(extractCacheDir, name)).mtimeMs]);
      continue;
    }
    // Temporary cache files belong to another run's resource manifest until
    // that run atomically renames them. Cache pruning must never delete them.
  }
  const retained = new Set(entries
    .sort((left, right) => {
      if (left[0] === activeKey) return -1;
      if (right[0] === activeKey) return 1;
      return right[1] - left[1] || left[0].localeCompare(right[0]);
    })
    .slice(0, extractCacheRetainKeys)
    .map(([key]) => key));
  for (const name of readdirSync(extractCacheDir)) {
    const cached = /^([0-9a-f]{64})\.v8bin$/u.exec(name);
    if (cached && !retained.has(cached[1])) {
      rmSync(join(extractCacheDir, name), { force: true });
    }
  }
}

function normalizeMobileSceneRoute(route, projectRoot) {
  const out = { ...route };
  if (resolve(projectRoot) !== resolve(defaultProjectRoot)) return out;
  const catalogRoute = unimakerReactRouteCatalog.find((candidate) =>
    candidate.routeId === out.routeId && candidate.rootSource === out.rootSource
  );
  if (catalogRoute === undefined) return out;
  if (out.rootComponent === undefined && catalogRoute.rootComponent !== undefined) out.rootComponent = catalogRoute.rootComponent;
  if (out.rootText === undefined && catalogRoute.rootText !== undefined) out.rootText = catalogRoute.rootText;
  if (out.staticExpressionValues === undefined && catalogRoute.staticExpressionValues !== undefined) {
    out.staticExpressionValues = catalogRoute.staticExpressionValues;
  }
  return out;
}

function serializeMobileSceneRoutes(routes) {
  return routes.map((route) => {
    const out = {
      routeId: route.routeId,
      rootSource: route.rootSource,
    };
    if (route.rootComponent !== undefined && route.rootComponent.length > 0) out.rootComponent = route.rootComponent;
    if (route.rootText !== undefined && route.rootText.length > 0) out.rootText = route.rootText;
    if (route.staticExpressionValues !== undefined && Object.keys(route.staticExpressionValues).length > 0) {
      out.staticExpressionValues = route.staticExpressionValues;
    }
    return out;
  });
}

function collectDynamicStateTextGlyphInventory(projectRoot, sceneFacts) {
  projectRoot;
  const stateRefs = new Set(sceneFacts
    .filter((fact) => fact.kind === "csg.web.scene.node" && String(fact.textStateRef ?? "").length > 0)
    .map((fact) => String(fact.textStateRef)));
  if (stateRefs.size === 0) {
    return "";
  }
  const codepoints = new Set();
  for (let code = 32; code <= 126; code += 1) codepoints.add(code);
  for (const codepoint of collectSceneEventStateDeltaGlyphCodepoints(sceneFacts)) codepoints.add(codepoint);
  return String.fromCodePoint(...Array.from(codepoints).sort((left, right) => left - right));
}

function collectSceneEventStateDeltaGlyphCodepoints(sceneFacts) {
  const codepoints = new Set();
  for (const fact of sceneFacts) {
    if (!fact || typeof fact !== "object") continue;
    if (fact.kind !== "csg.web.scene.event_handler") continue;
    const stateDeltas = fact.data?.action?.stateDeltas;
    if (!Array.isArray(stateDeltas)) continue;
    for (const delta of stateDeltas) {
      if (!delta || typeof delta !== "object") continue;
      const literal = staticStateDeltaStringLiteral(String(delta.argument ?? ""));
      if (literal === undefined) continue;
      for (const char of literal) {
        const codepoint = char.codePointAt(0);
        if (dynamicStateGlyphCodepointAllowed(codepoint)) codepoints.add(codepoint);
      }
    }
  }
  return codepoints;
}

function staticStateDeltaStringLiteral(argument) {
  const trimmed = String(argument ?? "").trim();
  const match = trimmed.match(/^'([^'\\]*)'$|^"([^"\\]*)"$/);
  if (!match) return undefined;
  return match[1] ?? match[2] ?? "";
}

function dynamicStateGlyphCodepointAllowed(codepoint) {
  if (!Number.isInteger(codepoint) || codepoint <= 0) return false;
  if (codepoint >= 0x3400 && codepoint <= 0x4dbf) return true;
  if (codepoint >= 0x4e00 && codepoint <= 0x9fff) return true;
  if (codepoint >= 0xf900 && codepoint <= 0xfaff) return true;
  return false;
}

function writeGlyphSdfPixelAsset(glyphSdfAtlas, outputPath) {
  assert(glyphSdfAtlas && glyphSdfAtlas.pixels, "glyph SDF atlas pixels are required");
  const bytes = glyphSdfPixelsToBuffer(glyphSdfAtlas.pixels);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, bytes);
  const crc32 = crc32Bytes(bytes);
  return {
    relPath: sceneMobileGlyphSdfPixelAssetRelPath,
    path: outputPath,
    byteCount: bytes.length,
    crc32,
    crc32Hex: `0x${crc32.toString(16).padStart(8, "0")}`,
  };
}

function glyphSdfPixelsToBuffer(pixels) {
  if (Buffer.isBuffer(pixels)) return pixels;
  if (ArrayBuffer.isView(pixels)) return Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  assert(Array.isArray(pixels), "glyph SDF atlas pixels must be a byte array");
  const bytes = Buffer.alloc(pixels.length);
  for (let index = 0; index < pixels.length; index += 1) {
    const value = Number(pixels[index]);
    assert(Number.isInteger(value) && value >= 0 && value <= 255, `glyph SDF pixel[${index}] must fit uint8`);
    bytes[index] = value;
  }
  return bytes;
}

function writeDefaultSceneMediaPayloadAssets(sceneFacts, outDir, payloadFactory) {
  const payloads = payloadFactory(sceneFacts);
  const receipts = [];
  for (const payload of payloads) {
    assert(/^[0-9a-f]{64}$/.test(payload.assetCid), `media payload assetCid must be a sha256 CID: ${payload.assetCid}`);
    assert(payload.relPath.startsWith("runtime/media/assets/"), `media payload relPath must stay under runtime/media/assets: ${payload.relPath}`);
    assert(Buffer.isBuffer(payload.bytes), `media payload bytes are required for ${payload.assetCid}`);
    assert(payload.bytes.length > 0, `media payload must be non-empty for ${payload.assetCid}`);
    const sha256 = createHash("sha256").update(payload.bytes).digest("hex");
    assert.equal(sha256, payload.assetCid, `media payload bytes must match assetCid for ${payload.assetCid}`);
    assert.equal(payload.sha256, payload.assetCid, `media payload receipt sha256 must match assetCid for ${payload.assetCid}`);
    const outputPath = join(outDir, payload.relPath);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, payload.bytes);
    receipts.push({
      assetCid: payload.assetCid,
      kind: payload.kind,
      kindCode: payload.kindCode,
      mime: payload.mime,
      role: payload.role ?? "asset",
      relPath: payload.relPath,
      byteCount: payload.bytes.length,
      sha256,
    });
  }
  return receipts;
}

function writeSceneMobileDataAsset(sceneFacts, outputPath, imageAssets = []) {
  const asset = buildSceneMobileDataAsset(sceneFacts, imageAssets);
  assert(asset && Buffer.isBuffer(asset.buffer), "scene mobile data asset buffer is required");
  assert(asset.buffer.length > 0, "scene mobile data asset must be non-empty");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, asset.buffer);
  const crc32 = crc32Bytes(asset.buffer);
  return {
    relPath: sceneMobileDataAssetRelPath,
    path: outputPath,
    byteCount: asset.buffer.length,
    crc32,
    crc32Hex: `0x${crc32.toString(16).padStart(8, "0")}`,
    counts: asset.counts,
  };
}

var crc32Table;

function getCrc32Table() {
  if (crc32Table !== undefined) return crc32Table;
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    table[i] = c >>> 0;
  }
  crc32Table = table;
  return table;
}

function crc32Bytes(bytes) {
  let crc = 0xffffffff;
  const table = getCrc32Table();
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function expectedUniMakerMobileSceneRouteIds(projectRoot, options, mobileSceneRoutes) {
  if (options.mobileSceneRoutes.length > 0) return [];
  if (resolve(projectRoot) !== resolve(defaultProjectRoot)) return [];
  return mobileSceneRoutes.map((route) => route.routeId);
}

function analyzeMobileSceneRouteInventory(sceneFacts, expectedRouteIds, requestedRoutes) {
  const routeFacts = Array.isArray(sceneFacts)
    ? sceneFacts.filter((fact) => fact?.kind === "csg.web.scene.route")
    : [];
  const generatedRoutes = uniqueStrings(routeFacts.map((fact) => String(fact.routeId ?? "")).filter((routeId) => routeId.length > 0));
  const requestedRouteIds = uniqueStrings((requestedRoutes ?? []).map((route) => String(route.routeId ?? "")).filter((routeId) => routeId.length > 0));
  const expectedRoutes = uniqueStrings(expectedRouteIds ?? []);
  const generatedSet = new Set(generatedRoutes);
  const expectedSet = new Set(expectedRoutes);
  const missingExpectedRoutes = expectedRoutes.filter((routeId) => !generatedSet.has(routeId));
  const missingRequestedRoutes = requestedRouteIds.filter((routeId) => !generatedSet.has(routeId));
  return {
    schema: "unimaker.route_inventory.v1",
    required: expectedRoutes.length > 0,
    complete: missingExpectedRoutes.length === 0 && missingRequestedRoutes.length === 0,
    expectedRouteCount: expectedRoutes.length,
    expectedRoutes,
    requestedRouteCount: requestedRouteIds.length,
    requestedRoutes: requestedRouteIds,
    generatedRouteCount: generatedRoutes.length,
    generatedRoutes,
    missingExpectedRoutes,
    missingRequestedRoutes,
    extraGeneratedRoutes: expectedRoutes.length > 0 ? generatedRoutes.filter((routeId) => !expectedSet.has(routeId)) : [],
  };
}

function analyzeMobileSceneRouteReachability(sceneFacts, initialRouteId, directRouteIds = []) {
  const facts = Array.isArray(sceneFacts) ? sceneFacts : [];
  const routeIds = uniqueStrings(facts
    .filter((fact) => fact?.kind === "csg.web.scene.route")
    .map((fact) => String(fact.routeId ?? ""))
    .filter((routeId) => routeId.length > 0));
  const routeSet = new Set(routeIds);
  const normalizedDirectRoutes = uniqueStrings(
    (Array.isArray(directRouteIds) ? directRouteIds : [])
      .map((routeId) => String(routeId ?? "").trim())
      .filter((routeId) => routeId.length > 0 && routeSet.has(routeId))
  );
  const edgeFacts = facts.filter((fact) => fact?.kind === "csg.web.scene.route_edge");
  const edgeMap = new Map();
  const routeIndexById = new Map(facts
    .filter((fact) => fact?.kind === "csg.web.scene.route")
    .map((fact) => [String(fact.routeId ?? ""), Number(fact.routeIndex)]));
  const routeEdges = [];
  const incomingEdgeCountByRoute = {};
  for (const routeId of routeIds) edgeMap.set(routeId, []);
  for (const routeId of routeIds) incomingEdgeCountByRoute[routeId] = 0;
  for (const fact of edgeFacts) {
    const routeId = String(fact.routeId ?? "");
    const targetRouteId = String(fact.targetRouteId ?? "");
    if (!routeSet.has(routeId) || !routeSet.has(targetRouteId)) continue;
    const routeIndex = Number(fact.routeIndex);
    const nodeId = Number(fact.nodeId);
    const targetRouteIndex = routeIndexById.get(targetRouteId);
    if (Number.isInteger(routeIndex) && Number.isInteger(nodeId) && nodeId > 0 && Number.isInteger(targetRouteIndex)) {
      routeEdges.push({
        routeId,
        routeIndex,
        nodeId,
        targetRouteId,
        targetRouteIndex,
      });
    }
    const list = edgeMap.get(routeId) ?? [];
    if (!list.includes(targetRouteId)) list.push(targetRouteId);
    edgeMap.set(routeId, list);
    incomingEdgeCountByRoute[targetRouteId] = (incomingEdgeCountByRoute[targetRouteId] ?? 0) + 1;
  }

  const initial = routeSet.has(initialRouteId) ? initialRouteId : routeIds[0] ?? "";
  const reachable = new Set();
  const queue = [];
  for (const rootRouteId of uniqueStrings([initial, ...normalizedDirectRoutes])) {
    if (rootRouteId.length > 0 && routeSet.has(rootRouteId)) {
      reachable.add(rootRouteId);
      queue.push(rootRouteId);
    }
  }
  for (let read = 0; read < queue.length; read += 1) {
    const routeId = queue[read];
    for (const targetRouteId of edgeMap.get(routeId) ?? []) {
      if (reachable.has(targetRouteId)) continue;
      reachable.add(targetRouteId);
      queue.push(targetRouteId);
    }
  }
  const reachableRoutes = routeIds.filter((routeId) => reachable.has(routeId));
  const unreachableRoutes = routeIds.filter((routeId) => !reachable.has(routeId));
  const routesWithoutIncomingEdge = routeIds.filter((routeId) => routeId !== initial && (incomingEdgeCountByRoute[routeId] ?? 0) === 0);
  const unreachableWithoutIncomingEdgeRoutes = unreachableRoutes.filter((routeId) => (incomingEdgeCountByRoute[routeId] ?? 0) === 0);
  const unreachableWithIncomingEdgeRoutes = unreachableRoutes.filter((routeId) => (incomingEdgeCountByRoute[routeId] ?? 0) > 0);
  const edgesByRoute = {};
  for (const routeId of routeIds) edgesByRoute[routeId] = edgeMap.get(routeId) ?? [];
  return {
    schema: "unimaker.route-reachability.v1",
    initialRouteId: initial,
    directRouteIds: normalizedDirectRoutes,
    directRouteCount: normalizedDirectRoutes.length,
    complete: unreachableRoutes.length === 0,
    routeCount: routeIds.length,
    edgeCount: edgeFacts.length,
    reachableRouteCount: reachableRoutes.length,
    unreachableRouteCount: unreachableRoutes.length,
    routesWithoutIncomingEdgeCount: routesWithoutIncomingEdge.length,
    unreachableWithoutIncomingEdgeRouteCount: unreachableWithoutIncomingEdgeRoutes.length,
    unreachableWithIncomingEdgeRouteCount: unreachableWithIncomingEdgeRoutes.length,
    reachableRoutes,
    unreachableRoutes,
    routesWithoutIncomingEdge,
    unreachableWithoutIncomingEdgeRoutes,
    unreachableWithIncomingEdgeRoutes,
    incomingEdgeCountByRoute,
    edgesByRoute,
    routeEdges,
  };
}

function buildSceneRouteEdgeDetails(sceneFacts) {
  const facts = Array.isArray(sceneFacts) ? sceneFacts : [];
  const routeFacts = facts.filter((fact) => fact?.kind === "csg.web.scene.route");
  const routeIdsByIndex = new Map();
  const routeIndexById = new Map();
  for (const fact of routeFacts) {
    const routeId = String(fact.routeId ?? "");
    const routeIndex = Number(fact.routeIndex);
    if (routeId.length === 0 || !Number.isInteger(routeIndex)) continue;
    routeIdsByIndex.set(routeIndex, routeId);
    routeIndexById.set(routeId, routeIndex);
  }

  const nodeDetails = new Map();
  for (const fact of facts) {
    if (fact?.kind === "csg.web.scene.node") {
      const routeIndex = Number(fact.routeIndex);
      const nodeId = Number(fact.nodeId);
      if (!Number.isInteger(routeIndex) || !Number.isInteger(nodeId) || nodeId <= 0) continue;
      const key = `${routeIndex}:${nodeId}`;
      const prev = nodeDetails.get(key) ?? {};
      nodeDetails.set(key, {
        ...prev,
        routeIndex,
        routeId: routeIdsByIndex.get(routeIndex) ?? "",
        nodeId,
        parentNodeId: Number(fact.parentNodeId ?? prev.parentNodeId ?? 0),
        tagName: String(fact.tagName ?? fact.nodeKind ?? fact.elementName ?? prev.tagName ?? ""),
        componentName: String(fact.componentName ?? fact.component ?? prev.componentName ?? ""),
        source: String(fact.source ?? fact.ownerSource ?? prev.source ?? ""),
        conditionalStateRef: String(fact.conditionalStateRef ?? prev.conditionalStateRef ?? ""),
        conditionalStateValue: String(fact.conditionalStateValue ?? prev.conditionalStateValue ?? ""),
      });
      continue;
    }
    if (fact?.kind === "csg.web.scene.paint" && String(fact.text ?? "").length > 0) {
      const routeIndex = Number(fact.routeIndex);
      const nodeId = Number(fact.nodeId);
      if (!Number.isInteger(routeIndex) || !Number.isInteger(nodeId) || nodeId <= 0) continue;
      const key = `${routeIndex}:${nodeId}`;
      const prev = nodeDetails.get(key) ?? {
        routeIndex,
        routeId: routeIdsByIndex.get(routeIndex) ?? "",
        nodeId,
      };
      const existing = String(prev.text ?? "");
      nodeDetails.set(key, {
        ...prev,
        text: existing.length > 0 ? existing : String(fact.text ?? ""),
      });
      continue;
    }
    if (fact?.kind === "csg.web.scene.event_handler") {
      const routeIndex = Number(fact.routeIndex);
      const nodeId = Number(fact.nodeId);
      if (!Number.isInteger(routeIndex) || !Number.isInteger(nodeId) || nodeId <= 0) continue;
      const key = `${routeIndex}:${nodeId}`;
      const prev = nodeDetails.get(key) ?? {
        routeIndex,
        routeId: routeIdsByIndex.get(routeIndex) ?? "",
        nodeId,
      };
      const handlers = Array.isArray(prev.handlers) ? [...prev.handlers] : [];
      handlers.push({
        eventName: String(fact.eventName ?? ""),
        effect: String(fact.effect ?? ""),
      });
      nodeDetails.set(key, { ...prev, handlers });
    }
  }

  const routeEdges = [];
  for (const fact of facts) {
    if (fact?.kind !== "csg.web.scene.route_edge") continue;
    const routeId = String(fact.routeId ?? "");
    const targetRouteId = String(fact.targetRouteId ?? "");
    const routeIndex = Number(fact.routeIndex ?? routeIndexById.get(routeId));
    const targetRouteIndex = Number(routeIndexById.get(targetRouteId));
    const nodeId = Number(fact.nodeId);
    if (!Number.isInteger(routeIndex) || !Number.isInteger(targetRouteIndex) || !Number.isInteger(nodeId) || nodeId <= 0) continue;
    routeEdges.push({
      routeId,
      routeIndex,
      nodeId,
      targetRouteId,
      targetRouteIndex,
    });
  }

  const nodes = [...nodeDetails.values()]
    .map((node) => {
      const conditionalChain = sceneNodeConditionalChain(nodeDetails, node.routeIndex, node.nodeId);
      return {
        ...node,
        handlers: Array.isArray(node.handlers) ? node.handlers : [],
        stateConditional: conditionalChain.length > 0,
        conditionalChain,
      };
    })
    .sort((a, b) => (a.routeIndex - b.routeIndex) || (a.nodeId - b.nodeId));

  return {
    schema: "unimaker.route-edge-details.v1",
    routeCount: routeFacts.length,
    routeEdges,
    nodes,
  };
}

function sceneNodeConditionalChain(nodeDetails, routeIndex, nodeId) {
  const out = [];
  const seen = new Set();
  let current = Number(nodeId);
  while (current > 0) {
    const key = `${routeIndex}:${current}`;
    if (seen.has(key)) break;
    seen.add(key);
    const node = nodeDetails.get(key);
    if (!node) break;
    const stateRef = String(node.conditionalStateRef ?? "");
    if (stateRef.length > 0) {
      out.push({
        nodeId: current,
        stateRef,
        stateValue: String(node.conditionalStateValue ?? ""),
      });
    }
    current = Number(node.parentNodeId ?? 0);
  }
  return out;
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const item = String(value ?? "").trim();
    if (item.length === 0 || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function parseMobileSceneRoute(value) {
  const parts = value.split(":");
  if (parts.length < 2) {
    fail(`--mobile-scene-route must be routeId:rootSource[:rootComponent[:rootText]]`);
  }
  const routeId = parts[0].trim();
  const rootSource = parts[1].trim();
  if (routeId.length === 0 || rootSource.length === 0) {
    fail(`--mobile-scene-route must be routeId:rootSource[:rootComponent[:rootText]]`);
  }
  const rootComponent = parts.length >= 3 ? parts[2].trim() : "";
  const rootText = parts.length >= 4 ? parts.slice(3).join(":").trim() : "";
  const route = { routeId, rootSource };
  if (rootComponent.length > 0) route.rootComponent = rootComponent;
  if (rootText.length > 0) route.rootText = rootText;
  return route;
}

function parseMobileVideoFileMapJson(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    fail(`--mobile-video-file-map must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isPlainObject(parsed)) fail(`--mobile-video-file-map must be a JSON object of content id -> path`);
  const map = {};
  for (const [contentId, path] of Object.entries(parsed)) {
    if (typeof path !== "string" || path.trim().length === 0) {
      fail(`--mobile-video-file-map["${contentId}"] must be a non-empty path string`);
    }
    map[contentId] = resolvePath(path.trim());
  }
  return map;
}

function compactDebugMapFactsForMaterializer(facts) {
  let write = 0;
  let removed = 0;
  for (let read = 0; read < facts.length; read += 1) {
    const fact = facts[read];
    if (fact && fact.kind === "csg.debug_map") {
      removed += 1;
      continue;
    }
    facts[write] = fact;
    write += 1;
  }
  facts.length = write;
  return removed;
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

function createStageGarbageCollector() {
  if (typeof globalThis.gc === "function") return () => globalThis.gc();
  v8.setFlagsFromString("--expose_gc");
  const exposedGc = vm.runInNewContext("gc");
  assert.equal(typeof exposedGc, "function", "Node GC hook must be available for staged UniMaker materialization");
  return () => exposedGc();
}

function memoryTrace(label) {
  const usage = process.memoryUsage();
  stageTimings.push({ label, elapsedMs: Date.now() - startedAt, rss: usage.rss });
  if (!options.memoryTrace) return;
  process.stderr.write(
    `  memory ${label}: rss=${formatMiB(usage.rss)} heapUsed=${formatMiB(usage.heapUsed)} heapTotal=${formatMiB(usage.heapTotal)} external=${formatMiB(usage.external)} arrayBuffers=${formatMiB(usage.arrayBuffers)} elapsedMs=${Date.now() - startedAt}\n`,
  );
}

function cleanupIntermediateFactFiles() {
  if (options.keepIntermediateFacts) return [];
  const removed = [];
  for (const file of intermediateFactPaths) {
    if (!existsSync(file)) continue;
    rmSync(file, { force: true });
    removed.push(file);
  }
  return removed;
}

function formatMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MiB`;
}

function resolvePath(value) {
  if (!value) return value;
  return resolve(process.cwd(), value);
}

function parseViewport(value) {
  if (!/^\d+x\d+$/.test(value)) fail(`invalid viewport: ${value}`);
  return value;
}

function summarizeOpenDomains(requirements, limit) {
  const counts = new Map();
  for (const item of requirements) {
    if (item.providerStatus !== "open") continue;
    counts.set(item.domain, (counts.get(item.domain) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function formatSummary(items) {
  if (items.length === 0) return "none";
  return items.map((item) => `${item.name}=${item.count}`).join(", ");
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
    control_surface_action_count: report.control_surface_action_count,
    actionable_dom_control_count: report.actionable_dom_control_count,
    control_surface_skipped_unlabeled_count: report.control_surface_skipped_unlabeled_count,
    control_surface_actionable_coverage_percent: report.control_surface_actionable_coverage_percent,
    voice_computer_use_scenario_count: report.voice_computer_use_scenario_count,
    voice_computer_use_control_coverage_percent: report.voice_computer_use_control_coverage_percent,
    computer_use_action_count: report.computer_use_action_count,
    computer_use_action_coverage_percent: report.computer_use_action_coverage_percent,
    computer_use_action_unresolved_count: report.computer_use_action_unresolved_count,
    voice_task_template_count: report.voice_task_template_count,
    voice_task_step_count: report.voice_task_step_count,
    confirmation_gate_count: report.confirmation_gate_count,
    voice_task_high_risk_step_count: report.voice_task_high_risk_step_count,
    voice_task_required_confirmation_gate_count: report.voice_task_required_confirmation_gate_count,
    voice_task_missing_confirmation_gate_count: report.voice_task_missing_confirmation_gate_count,
    voice_task_blocked_step_count: report.voice_task_blocked_step_count,
    voice_task_ambiguous_step_count: report.voice_task_ambiguous_step_count,
    unimaker_internal_task_ready: report.unimaker_internal_task_ready,
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
    coreReport: compactCoreReport(report.coreReport),
  };
}

function writeComputerUseManifest(path, relPath, facts, report) {
  const manifestFacts = facts
    .filter((fact) => computerUseManifestFactKind(String(fact?.kind ?? "")))
    .map((fact) => stripManifestFact(fact))
    .sort((left, right) =>
      String(left.kind ?? "").localeCompare(String(right.kind ?? "")) ||
      String(left.id ?? "").localeCompare(String(right.id ?? ""))
    );
  const templateIds = manifestFacts
    .filter((fact) => fact.kind === "csg.web.voice_task_template")
    .map((fact) => String(fact.templateId ?? ""))
    .filter((id) => id.length > 0)
    .sort();
  const manifest = {
    schema: "unimaker.computer_use_manifest.v1",
    sourceProjectRoot: report.projectRoot,
    automationPath: "voice-input -> intent -> typed-action -> runtime-event",
    visualClickFallback: false,
    riskPolicy: {
      aiModeRequiresConfirmation: false,
      externalPublishPaymentDestructiveRequiresExplicitUserOperation: true,
    },
    counts: {
      controlSurfaces: numberOrZero(report.control_surface_action_count),
      voiceComputerUseScenarios: numberOrZero(report.voice_computer_use_scenario_count),
      computerUseActions: numberOrZero(report.computer_use_action_count),
      computerUseActionCoveragePercent: numberOrZero(report.computer_use_action_coverage_percent),
      voiceTaskTemplates: numberOrZero(report.voice_task_template_count),
      voiceTaskSteps: numberOrZero(report.voice_task_step_count),
      confirmationGates: numberOrZero(report.confirmation_gate_count),
      blockedSteps: numberOrZero(report.voice_task_blocked_step_count),
      ambiguousSteps: numberOrZero(report.voice_task_ambiguous_step_count),
      missingConfirmationGates: numberOrZero(report.voice_task_missing_confirmation_gate_count),
      unimakerInternalTaskReady: report.unimaker_internal_task_ready === true,
    },
    templateIds,
    facts: manifestFacts,
  };
  const text = stableJsonText(manifest);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
  const summary = {
    schema: manifest.schema,
    relPath,
    path,
    byteCount: Buffer.byteLength(text, "utf8"),
    sha256: createHash("sha256").update(text).digest("hex"),
    counts: manifest.counts,
    templateIds,
  };
  Object.defineProperty(summary, "runtimeFacts", {
    value: manifestFacts,
    enumerable: false,
  });
  return summary;
}

function computerUseManifestFactKind(kind) {
  return kind === "csg.web.control_surface" ||
    kind === "csg.web.voice_computer_use_scenario" ||
    kind === "csg.web.computer_use_action" ||
    kind === "csg.web.voice_task_template" ||
    kind === "csg.web.voice_task_step" ||
    kind === "csg.web.confirmation_gate";
}

function stripManifestFact(fact) {
  const out = {};
  for (const [key, value] of Object.entries(fact)) {
    if (key === "loc") continue;
    out[key] = value;
  }
  return out;
}

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function stableJsonText(value) {
  return JSON.stringify(sortJsonValue(value), null, 2) + "\n";
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map((item) => sortJsonValue(item));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortJsonValue(value[key]);
  }
  return out;
}

function compactCoreReport(coreReport) {
  if (!coreReport || typeof coreReport !== "object") return coreReport;
  return {
    schema: coreReport.schema,
    complete: coreReport.complete,
    counts: coreReport.counts,
    blockedReasons: coreReport.blockedReasons,
    runtimeClosure: coreReport.runtimeClosure
      ? {
          complete: coreReport.runtimeClosure.complete,
          requirementCount: coreReport.runtimeClosure.requirementCount,
          externalSymbolCount: coreReport.runtimeClosure.externalSymbolCount,
          openRequirementCount: coreReport.runtimeClosure.openRequirementCount,
          openExternalSymbolCount: coreReport.runtimeClosure.openExternalSymbolCount,
          byDomain: coreReport.runtimeClosure.byDomain,
        }
      : undefined,
  };
}

function sceneFactsTextForFontSubset(facts) {
  const texts = [];
  for (const fact of facts) {
    if (!fact || typeof fact !== "object") continue;
    const kind = String(fact.kind ?? "");
    if ((kind === "csg.web.scene.node" || kind === "csg.web.scene.paint") &&
        typeof fact.text === "string" &&
        fact.text.length > 0) {
      texts.push(fact.text);
    }
  }
  return texts.join("\n");
}

function injectPreparedFontResourcesIntoSceneFacts(sceneFactsResult, preparedFont) {
  const base64s = Array.isArray(preparedFont?.base64s) ? preparedFont.base64s : [];
  if (base64s.length === 0) return sceneFactsResult;
  assert(sceneFactsResult && Array.isArray(sceneFactsResult.facts), "scene facts result is required");
  const facts = sceneFactsResult.facts;
  const existingResourceFacts = facts.filter((fact) => fact?.kind === "csg.web.scene.resource");
  if (existingResourceFacts.some((fact) => String(fact.resourceKind ?? "") === "font_subset")) {
    throw new Error("font_subset resources already exist before font injection");
  }
  for (const fact of existingResourceFacts) {
    const ordinal = Number(fact.ordinal);
    if (!Number.isInteger(ordinal) || ordinal < 0) {
      throw new Error(`scene resource has invalid ordinal before font injection: ${String(fact.id ?? "")}`);
    }
    fact.ordinal = ordinal + base64s.length;
  }

  const existingResourceKeys = new Set(existingResourceFacts.map((fact) => `${String(fact.resourceKind ?? "")}:${String(fact.resourceId ?? "")}`));
  const fontFacts = base64s.map((data, index) => {
    const resourceKind = "font_subset";
    const resourceId = `font.${index}`;
    const key = `${resourceKind}:${resourceId}`;
    if (existingResourceKeys.has(key)) throw new Error(`duplicate scene font resource: ${key}`);
    existingResourceKeys.add(key);
    const bytes = Buffer.from(String(data), "base64");
    return {
      kind: "csg.web.scene.resource",
      id: `csg.web.scene.resource.${sha256Text(key).slice(0, 16)}`,
      ordinal: index,
      resourceKind,
      resourceId,
      data: String(data),
      byteSize: bytes.length,
      hash: createHash("sha256").update(bytes).digest("hex"),
      fontWeight: Number(preparedFont.base64Weights?.[index] ?? 400),
      fontFamily: Number(preparedFont.base64Families?.[index] ?? 0),
    };
  });

  const projectIndex = facts.findIndex((fact) => fact?.kind === "csg.web.scene.project");
  if (projectIndex < 0) throw new Error("scene project fact missing before font injection");
  const projectFact = facts[projectIndex];
  const oldProjectResourceCount = Number(projectFact.resourceCount);
  if (!Number.isInteger(oldProjectResourceCount) || oldProjectResourceCount !== existingResourceFacts.length) {
    throw new Error(`scene project resourceCount mismatch before font injection: ${String(projectFact.resourceCount)} vs ${existingResourceFacts.length}`);
  }
  projectFact.resourceCount = oldProjectResourceCount + fontFacts.length;
  if (sceneFactsResult.counts) {
    const oldCount = Number(sceneFactsResult.counts.resources);
    if (!Number.isInteger(oldCount) || oldCount !== existingResourceFacts.length) {
      throw new Error(`scene counts.resources mismatch before font injection: ${String(sceneFactsResult.counts.resources)} vs ${existingResourceFacts.length}`);
    }
    sceneFactsResult.counts.resources = oldCount + fontFacts.length;
  }
  facts.splice(projectIndex + 1, 0, ...fontFacts);
  return sceneFactsResult;
}

function fail(message) {
  throw new OneClickFailure(message);
}

function reportStageDiagnostics(label, diagnostics) {
  if (!options.tolerateDiagnostics) fail(`${label}:\n${diagnostics.join("\n")}`);
  process.stderr.write(`  ${label}: tolerated ${diagnostics.length} diagnostic(s)\n`);
  const shown = diagnostics.slice(0, 200);
  for (const diagnostic of shown) process.stderr.write(`    [tolerated] ${diagnostic}\n`);
  if (diagnostics.length > shown.length) process.stderr.write(`    [tolerated] ... and ${diagnostics.length - shown.length} more (suppressed)\n`);
}

function helpText() {
  return `unimaker-one-click — UniMaker React.js CSG one-click transpile + run

Usage:
  node scripts/unimaker-one-click.mjs [--out-dir <dir>] [--no-run] [--no-dump]

Options:
  --out-dir <dir>          output directory
  --project-root <dir>     project root (default: /Users/lbcheng/UniMaker/React.js)
  --entry-root <path>      entry root relative to project root (repeatable; default: UniMaker entries)
  --stop-after <stage>     stop after extract, scene-facts, or materialize for targeted smoke validation
  --tolerate-diagnostics   print and count materializer/scene-facts diagnostics instead of failing
  --emit-mode <kind>       compile via obj+cc (default) or direct --emit:exe --link-providers
  --css <file>             extra flattened CSS rules for class utilities the built-in Tailwind table lacks (repeatable)
  --viewport <w>x<h>       oracle viewport (default: 1024x768, UniMaker mobile scene default: 390x844)
  --frame-limit <n>        GUI frames to run before exit (default: 600)
  --no-run                 compile only, skip execution
  --emit <kind>            csgc (default), jsonl, or both
  --keep-intermediate-facts
                           keep generated .csgc/.csgweb fact files for debugging
  --keep-glyph-sdf-precompute-debug
                           keep glyph precompute source/executable/report/raw output for debugging
  --keep-extract-cache     keep one content-addressed TS extraction cache entry under ts-csg/tmp
  --dump                   include bounded DOM/layout/screenshot dump in run output
  --raw-pixels             include full screenshot rows for oracle comparison
  --mobile-scene-multi-frame-dump
                           (requires --raw-pixels + >1 --mobile-scene-route) loop the compiled
                           binary over every mobile route in one process, emitting one
                           ---CHENG_ROUTE_FRAME--- + routeId + screenshot dump per route instead
                           of requiring one compile per route
  --run-output-file <path> write generated app stdout to a file
  --no-dump                skip DOM/layout/raster dump in generated code
  --font-file <path>       subset and embed this TrueType glyf/loca font into generated Cheng
  --font-fallback-file <path>
                           add another TrueType glyf/loca fallback face for missing glyphs
  --no-font-subset         embed the full font, still checked by --font-max-bytes
  --font-max-bytes <bytes> hard-fail when embedded font payload exceeds budget (default: 2097152)
  --glyph-sdf-precompute-timeout-ms <n>
                           build-time glyph SDF atlas precompute timeout (default: 180000)
  --glyph-sdf-precompute-emit <obj-link|exe>
                           Cheng compile mode for glyph SDF precompute (default: exe)
  --require-glyph-sdf-precompute-cache-hit
                           hard-fail instead of cold-compiling glyph SDF precompute on cache miss
  --font-number <n>        TTC/OTC face index override for subsetting
  --mobile-scene-route <route:source[:component[:text]]>
                           add a precompiled mobile scene route with optional selector metadata
  --mobile-scene-initial-route <id>
                           initial route id for the mobile scene graph
  --mobile-video-file <path>
                           use this local MP4 as UniMaker's default video media asset
  --mobile-video-file-map <json>
                           per-card video override for content-snapshot fan-out: JSON object
                           mapping content.id -> local MP4 path (e.g. '{"vid_hgs":"/path/a.mp4"}').
                           Once a content snapshot carries more than one distinct video content
                           id, each id needs its own real source file to bake its own content-
                           addressed CID; this (or the built-in default-project-root mapping)
                           is the only way to supply that — --mobile-video-file alone is used
                           for a single shared card and as the fallback default entry.
  --mobile-image-file <path>
                           use this local PNG as UniMaker's default image media asset
  --mobile-content-snapshot-file <path>
                           use current PWA ${unimakerDistributedContentStorageKey} JSON snapshot for retained mobile feed
  --mobile-content-snapshot-json <json>
                           inline current PWA content snapshot JSON
  --mobile-content-snapshot-cdp-base-url <url>
                           real PWA base URL used to export ${unimakerDistributedContentStorageKey} through CDP
  --mobile-content-snapshot-cdp-ws-endpoint <url>
                           existing Chromium websocket endpoint for the real PWA session
  --mobile-content-snapshot-cdp-route <id>
                           truth route used while exporting the CDP snapshot (default: first content route)
  --require-dom-css-coverage
                           hard-fail when scene DOM/CSS facts include unsupported runtime coverage
  --retained-scene-only    for retained mobile APK/gate output: skip generic Cheng source generation and require --stop-after materialize
  --emit-monolithic-source keep the single-file scene runtime source instead of the default structural multi-part split (contrast/rollback)
  --cheng <path>           path to Cheng backend driver
  --build-timeout-ms       npm build timeout (default: 120000)
  --compile-timeout-ms     compilation timeout (default: 300000)
  --run-timeout-ms         run timeout (default: 60000)
  --separate-debug         write debug to separate .csgwebc.debug file (auto-enabled for --emit csgc/both)
  --no-separate-debug      disable automatic debug separation for csgc/both emit
  --no-debug               skip debug_map entirely in production binary
  --full-report            write full extraction report as .json.gz
  --memory-trace           print per-stage Node memory usage for optimization diagnostics
`;
}
} finally {
  runResources.uninstallSignalHandlers();
  if (process.env.KEEP_TMP_ON_FAIL === "1") {
    process.stderr.write("  KEEP_TMP_ON_FAIL=1: skipping cleanup\n");
  } else {
    runResources.cleanup();
  }
  runResources.uninstallExitHandler();
}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runOneClick(process.argv.slice(2));
  } catch (error) {
    if (oneClickTerminatingSignal) {
      process.exitCode = oneClickSignalExitCode[oneClickTerminatingSignal];
    } else if (error instanceof OneClickFailure) {
      process.stderr.write(`unimaker-one-click: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
