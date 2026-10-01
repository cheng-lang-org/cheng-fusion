#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");

const expectedRoutes = [
  "home_default",
  "content_detail",
  "ecom_main",
  "game_doudizhu",
  "game_mahjong",
  "game_minecraft",
  "game_werewolf",
  "game_xiangqi",
  "home_app_channel",
  "home_graphic_channel",
  "home_bazi_overlay_open",
  "home_search_open",
  "home_sort_open",
  "home_sidebar_open",
  "home_channel_manager_open",
  // Per-card fan-out (v5, 2026-07-10): the pinned fixture's two video cards (胡广生
  // "vid_hgs" / 麦田 "vid1") each get their own home_content_detail_open_<content.id>
  // route instead of sharing one — see applyMobileContentSnapshotToRoutes in
  // unimaker-one-click.mjs. Update alongside the fixture if its content ids change.
  "home_content_detail_open_vid_hgs",
  "home_content_detail_open_vid1",
  "home_image_detail_open_img1",
  "home_ziwei_overlay_open",
  "home_ziwei_archive_open",
  "lang_select",
  "marketplace_main",
  "marketplace_social_picker",
  "message_thread",
  "message_thread_more_panel_open",
  "node_detail",
  "node_published_content",
  "node_thread",
  "node_thread_more_panel_open",
  "publish_ad",
  "publish_content",
  "publish_food",
  "publish_live",
  "publish_product",
  "publish_ride",
  "publish_secondhand",
  "publish_selector",
  "tab_messages",
  "tab_nodes",
  "tab_profile",
  "trading_crosshair",
  "trading_main",
  "update_center_main",
  "publish_movie",
  "publish_graphic",
  "publish_music",
  "publish_novel",
];

const publishRoutes = [
  "publish_content",
  "publish_movie",
  "publish_graphic",
  "publish_music",
  "publish_novel",
  "publish_product",
  "publish_food",
  "publish_ride",
  "publish_secondhand",
  "publish_live",
  "publish_ad",
];

const gameRoutes = [
  "game_doudizhu",
  "game_mahjong",
  "game_werewolf",
  "game_xiangqi",
  "game_minecraft",
];

const requiredEdgesByDomain = {
  home: {
    home_default: [
      "home_sidebar_open",
      "home_search_open",
      "home_sort_open",
      "home_app_channel",
      "home_graphic_channel",
      "ecom_main",
      "home_channel_manager_open",
      "home_content_detail_open_vid_hgs",
      "home_content_detail_open_vid1",
      "node_detail",
      "tab_messages",
      "publish_selector",
      "tab_nodes",
      "tab_profile",
    ],
    home_graphic_channel: ["home_image_detail_open_img1", "node_detail"],
    home_app_channel: ["marketplace_main"],
    home_sidebar_open: ["marketplace_main", "trading_main", "lang_select", "update_center_main"],
  },
  marketplace: {
    marketplace_main: [
      "home_default",
      "home_bazi_overlay_open",
      "home_ziwei_overlay_open",
      ...gameRoutes,
    ],
    marketplace_social_picker: ["message_thread"],
    home_bazi_overlay_open: ["home_default"],
    home_ziwei_overlay_open: ["home_ziwei_archive_open", "home_default"],
    home_ziwei_archive_open: ["home_ziwei_overlay_open", "home_default"],
  },
  publish: {
    publish_selector: ["home_default", ...publishRoutes],
    ...Object.fromEntries(publishRoutes.map((routeId) => [routeId, ["publish_selector"]])),
  },
  messages: {
    tab_messages: ["home_default", "publish_selector", "tab_nodes", "tab_profile"],
    message_thread: ["tab_messages", "message_thread_more_panel_open", "game_xiangqi", "marketplace_social_picker"],
    message_thread_more_panel_open: ["tab_messages", "message_thread", "game_xiangqi", "marketplace_social_picker"],
  },
  nodes: {
    tab_nodes: ["node_detail", "home_default", "tab_messages", "publish_selector", "tab_profile"],
    node_detail: ["node_published_content", "node_thread"],
    node_published_content: ["content_detail"],
    content_detail: ["node_published_content"],
    node_thread: ["node_detail", "node_thread_more_panel_open", "game_xiangqi", "marketplace_social_picker"],
    node_thread_more_panel_open: ["node_detail", "node_thread", "game_xiangqi", "marketplace_social_picker"],
  },
  trading: {
    tab_profile: ["trading_main", "home_default", "tab_messages", "publish_selector", "tab_nodes"],
    trading_main: ["marketplace_main", "trading_crosshair"],
    trading_crosshair: ["marketplace_main"],
    update_center_main: ["marketplace_main"],
  },
  games: {
    ...Object.fromEntries(gameRoutes.map((routeId) => [routeId, ["marketplace_main"]])),
  },
};

// Mirror of the retained-parity gate's EXPECTED_GESTURE_HANDLERS pin (see
// unimaker-retained-parity-gate.mjs): the only legitimate uncompiled-handler category is the
// contracted gesture set (DOM pointer/touch/wheel geometry handlers, invoke:->gesture: rewrite,
// landed 8ed054c56/2ae5d8861). Any other skip category or any drift in the pinned name set is a
// coverage failure — this keeps "zero uncontracted skips" strict instead of the stale skipCount==0
// (which the gesture contract made unsatisfiable and the scene-count assertion masked).
const expectedGestureHandlers = ["handleMouseMove", "handleTouchEnd", "handleTouchMove", "handleTouchStart", "handleWheel"];

const requiredCompiledHandlers = [
  "handleSettingsToggle",
  "handleVideoToggle",
  "handleVideoMuteToggle",
  "handleFullscreen",
  "handleSendComment",
  "handleLike",
  "handleReport",
  "handleCopyDid",
  "handleCopyDidBackup",
];

const requiredSurfaceIds = [
  "component:<anonymous>@components_AppMarketplace",
  "component:PublishTypeSelector",
  "component:PublishVideoWizard",
  "page:HomePage",
  "page:ContentDetailPage",
  "page:MessagesPage",
  "page:ProfilePage",
  "page:ChatPage",
  "page:ChessPage",
  "page:MinecraftPage",
  "page:WerewolfPage",
  "page:TradingPage",
  "page:UpdateCenterPage",
  "page:PublishVideoPage",
  "page:PublishContentPage",
  "page:PublishFoodPage",
  "page:PublishProductPage",
  "page:PublishRidePage",
  "page:PublishSecondhandPage",
  "page:PublishAdPage",
];

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}

let reportPath = "";
try {
  const report = runGate(options);
  mkdirSync(dirname(options.reportOut), { recursive: true });
  writeFileSync(options.reportOut, JSON.stringify(report, null, 2) + "\n", "utf8");
  reportPath = options.reportOut;
} catch (err) {
  process.stderr.write(`unimaker-functional-coverage-gate: ${err?.stack || err?.message || String(err)}\n`);
  process.exit(1);
}

process.stdout.write("unimaker-functional-coverage-gate ok\n");
process.stdout.write(`report: ${reportPath}\n`);

function runGate(o) {
  const summary = readJson(o.summary);
  const retainedGate = readJson(o.retainedGate);
  const guiManifest = o.guiManifest ? readJson(o.guiManifest) : null;

  const snapshotReport = assertContentSnapshotPinned(summary);
  const routeReport = assertRouteCoverage(summary);
  const domainReport = assertDomainEdges(summary.routeReachability?.edgesByRoute ?? {});
  const sceneReport = assertSceneCoverage(summary);
  const handlerReport = assertCompiledHandlers(summary.compiledHandlerTable, retainedGate.cht, summary);
  const retainedReport = assertRetainedGate(retainedGate, summary);
  const prefixReport = assertEffectPrefixConsumers(retainedGate);
  const guiReport = guiManifest ? assertGuiManifest(guiManifest) : null;

  return {
    schema: "unimaker.functional_coverage_gate.v1",
    summary: o.summary,
    retainedGate: o.retainedGate,
    guiManifest: o.guiManifest,
    snapshotReport,
    routeReport,
    domainReport,
    sceneReport,
    handlerReport,
    retainedReport,
    prefixReport,
    guiReport,
  };
}

// Every emitted effect prefix must have a real dispatcher (a WebSceneStrStartsWith arm in
// the shared runtime or the generated app runtime). effectPrefixCounts is a static emission
// census, not execution proof — a prefix nobody dispatches is fabricated coverage that the
// runtime either silently swallows (command fallthrough) or hard-fails (-1 segment).
function assertEffectPrefixConsumers(retainedGate) {
  const effectPrefixExactSegments = ["stop-propagation", "prevent-default"];
  const effectPrefixBuildTimeDescriptors = [
    // file-selected:<ref>:<mode>:<stateRef> is the input's result contract; it is consumed at
    // BUILD time (rewriteSceneFileInputClickHandlers borrows its result segments into the
    // 4-segment file-picker effect). Change events never dispatch natively, so a runtime
    // consumer would be fake coverage, not honesty.
    "file-selected",
    // gesture:<handlerName> marks a handler whose sole input is a continuous DOM pointer/touch/
    // wheel geometry event (React.MouseEvent/WheelEvent/TouchEvent — the 5 TradingKlineChart canvas
    // handlers handleMouseMove/handleWheel/handleTouchStart/handleTouchMove/handleTouchEnd).
    // buildCompiledHandlerTable classifies these by DOM event typeSource and rewrites invoke:->gesture:
    // (see scene-runtime-smoke-source.mjs), and the retained-parity gate pins the exact set in its
    // EXPECTED_GESTURE_HANDLERS lock. The retained runtime dispatches only discrete click/route
    // events and cannot synthesize continuous pointer geometry, so these are deliberately outside
    // the retained parity surface — a runtime dispatcher would be fabricated coverage, not honesty.
    "gesture",
  ];
  const coverage = retainedGate.cht?.actionCoverage;
  assert(coverage && typeof coverage === "object", "effect prefix audit: action coverage missing");
  const prefixes = Object.keys(coverage.effectPrefixCounts ?? {});
  assert(prefixes.length > 0, "effect prefix audit: no effect prefixes recorded");
  const runtimeSourcePath = resolve(packageDir, "..", "src", "core", "runtime", "web_scene_runtime.cheng");
  const generatedRuntimePath = join(String(retainedGate.outDir ?? ""), "unimaker-react.scene-runtime.cheng");
  const generatorPath = join(scriptDir, "scene-runtime-smoke-source.mjs");
  assert(existsSync(runtimeSourcePath), `effect prefix audit: runtime source missing: ${runtimeSourcePath}`);
  assert(existsSync(generatedRuntimePath), `effect prefix audit: generated runtime missing: ${generatedRuntimePath}`);
  const dispatchLines = [];
  for (const path of [runtimeSourcePath, generatedRuntimePath, generatorPath]) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (line.includes("StrStartsWith")) dispatchLines.push(line);
    }
  }
  const missing = [];
  for (const prefix of prefixes) {
    if (effectPrefixExactSegments.includes(prefix)) continue;
    if (effectPrefixBuildTimeDescriptors.includes(prefix)) continue;
    const needle = `"${prefix}:`;
    if (!dispatchLines.some((line) => line.includes(needle))) missing.push(prefix);
  }
  assert.equal(missing.length, 0, `effect prefixes emitted without any runtime dispatcher (fabricated coverage): ${missing.join(", ")}`);
  return {
    prefixCount: prefixes.length,
    exactSegments: effectPrefixExactSegments.filter((p) => prefixes.includes(p)),
    buildTimeDescriptors: effectPrefixBuildTimeDescriptors.filter((p) => prefixes.includes(p)),
  };
}

// The absolute scene thresholds below (routeEdges>=281, mediaPlaybackSlots>=25,
// mediaControlActions>=160, eventHandlers>=1800, hitTargets>=1700) are defined against the
// pinned fixture content snapshot (scripts/unimaker-fixtures/unimaker-pwa-content-snapshot.json:
// 3 contents / 2 video cards by u_android+u1). A summary materialized from an auto-picked
// tmp capture (e.g. a stray ts-csg/tmp/unimaker-pwa-content-snapshot.json left by a
// pwa-publish e2e run, 2 contents / 1 video card) mechanically loses the second home-feed
// card across the 8 feed-embedding routes plus one published-content row: -17 routeEdges,
// -9 mediaPlaybackSlots, -63 mediaControlActions. That is an input drift, not a functional
// regression — fail loudly on the input before the counts so nobody chases phantom features.
function assertContentSnapshotPinned(summary) {
  const snapshot = summary.mobileContentSnapshot;
  assert(snapshot && typeof snapshot === "object", "mobileContentSnapshot missing from one-click summary");
  const fixturePath = resolve(packageDir, "scripts", "unimaker-fixtures", "unimaker-pwa-content-snapshot.json");
  const fixture = readJson(fixturePath);
  const fixtureIds = (fixture.contents ?? []).map((item) => String(item.id)).sort();
  assert(fixtureIds.length > 0, `pinned fixture has no contents: ${fixturePath}`);
  const summaryIds = (snapshot.contentIds ?? []).map(String).sort();
  assert.deepEqual(
    summaryIds,
    fixtureIds,
    `coverage thresholds are pinned to the fixture content snapshot (${fixturePath}); ` +
      `summary was materialized from ${snapshot.source} with contentIds [${summaryIds.join(", ")}] ` +
      `!= fixture [${fixtureIds.join(", ")}]. Re-run the retained parity gate with ` +
      `--mobile-content-snapshot-file scripts/unimaker-fixtures/unimaker-pwa-content-snapshot.json`,
  );
  return { source: String(snapshot.source ?? ""), contentIds: summaryIds, fixture: fixturePath };
}

function assertRouteCoverage(summary) {
  assert.equal(summary.schema, "unimaker.one-click.v1", "bad one-click summary schema");
  assert.equal(summary.domCss?.complete, true, "DOM/CSS coverage must be complete before functional closure");
  assert.equal(Number(summary.domCss?.hardFailureCount ?? -1), 0, "DOM/CSS hard failures remain");
  assert.equal(summary.routeInventory?.complete, true, "route inventory must be complete");
  assertSetEqual(summary.routeInventory?.expectedRoutes ?? [], expectedRoutes, "expected route set");
  assertSetEqual(summary.routeInventory?.generatedRoutes ?? [], expectedRoutes, "generated route set");
  assert.equal(summary.routeReachability?.complete, true, "route reachability must be complete");
  assert.equal(Number(summary.routeReachability?.routeCount ?? -1), expectedRoutes.length, "route count mismatch");
  assert.equal(Number(summary.routeReachability?.reachableRouteCount ?? -1), expectedRoutes.length, "reachable route count mismatch");
  assert.equal(Number(summary.routeReachability?.unreachableRouteCount ?? -1), 0, "unreachable routes remain");
  assert.equal(Number(summary.routeReachability?.routesWithoutIncomingEdgeCount ?? -1), 0, "routes without incoming edge remain");
  const incoming = summary.routeReachability?.incomingEdgeCountByRoute ?? {};
  for (const routeId of expectedRoutes) {
    assert(Number(incoming[routeId] ?? 0) > 0, `${routeId} has no incoming edge`);
  }
  return {
    routeCount: expectedRoutes.length,
    reachableRouteCount: Number(summary.routeReachability?.reachableRouteCount ?? 0),
    edgeCount: Number(summary.routeReachability?.edgeCount ?? 0),
  };
}

function assertDomainEdges(edgesByRoute) {
  const domains = {};
  for (const [domain, edges] of Object.entries(requiredEdgesByDomain)) {
    let checked = 0;
    for (const [from, targets] of Object.entries(edges)) {
      for (const target of targets) {
        assertRouteEdge(edgesByRoute, from, target, domain);
        checked += 1;
      }
    }
    domains[domain] = { requiredEdges: checked };
  }
  return domains;
}

function assertSceneCoverage(summary) {
  const scene = summary.scene ?? {};
  assert(Number(scene.routes ?? 0) >= expectedRoutes.length, "scene route count regressed");
  assert(Number(scene.routeEdges ?? 0) >= 281, "scene route edge count regressed");
  assert(Number(scene.eventHandlers ?? 0) >= 1800, "scene event handler coverage regressed");
  assert(Number(scene.hitTargets ?? 0) >= 1700, "scene hit-target coverage regressed");
  assert(Number(scene.routeHitRects ?? 0) >= 100, "scene route hit-rect coverage regressed");
  assert(Number(scene.mediaAssets ?? 0) >= 2, "scene media assets are incomplete");
  assert(Number(scene.mediaPlaybackSlots ?? 0) >= 25, "scene media playback slots regressed");
  assert(Number(scene.mediaControlActions ?? 0) >= 160, "scene media control actions regressed");
  assert(Number(scene.textLiterals ?? 0) >= 2700, "scene text literal coverage regressed");
  assert.equal(Array.isArray(summary.mobileSceneRoutes), true, "mobileSceneRoutes summary is missing");
  assert.equal(summary.mobileSceneRoutes.length, expectedRoutes.length, "mobileSceneRoutes count mismatch");
  for (const routeId of expectedRoutes) {
    const route = summary.mobileSceneRoutes.find((item) => item.routeId === routeId);
    assert(route, `missing mobileSceneRoutes entry: ${routeId}`);
    assert(typeof route.rootComponent === "string" && route.rootComponent.length > 0, `${routeId} missing rootComponent`);
  }
  return {
    routes: Number(scene.routes ?? 0),
    eventHandlers: Number(scene.eventHandlers ?? 0),
    hitTargets: Number(scene.hitTargets ?? 0),
    mediaControlActions: Number(scene.mediaControlActions ?? 0),
  };
}

function assertCompiledHandlers(summaryCht, gateCht, summary) {
  const tables = [
    ["summary", summaryCht],
    ["retainedGate", gateCht],
  ];
  for (const [label, table] of tables) {
    assert(table && typeof table === "object", `${label} compiled handler table missing`);
    assert.equal(Number(table.invokeSites ?? -1), 0, `${label} live invoke sites remain`);
    assert.equal(Number(table.remainingUncompiledUnique ?? -1), 0, `${label} uncompiled handlers remain`);
    const skipCategories = table.skipCategories ?? {};
    const uncontractedSkipCategories = Object.keys(skipCategories).filter((category) => category !== "gesture");
    assert.deepEqual(uncontractedSkipCategories, [], `${label} uncontracted handler skip categories remain`);
    const gestureNames = [...(table.gestureNames ?? [])].sort();
    assert.deepEqual(gestureNames, expectedGestureHandlers, `${label} gesture handler pin drifted`);
    assert.equal(Number(table.skipCount ?? -1), Number(skipCategories.gesture ?? 0), `${label} skip count does not decompose into the gesture pin`);
    assert.equal(Number(skipCategories.gesture ?? 0), expectedGestureHandlers.length, `${label} gesture skip count != pinned gesture set`);
    for (const name of requiredCompiledHandlers) {
      assert((table.compiledNames ?? []).includes(name), `${label} missing compiled handler: ${name}`);
    }
    assertSceneActionCoverage(label, table.actionCoverage, summary);
  }
  return {
    compiledCount: Number(summaryCht.compiledCount ?? 0),
    compiledNames: summaryCht.compiledNames,
    baselineInvokeSites: Number(summaryCht.baselineInvokeSites ?? 0),
    invokeSites: Number(summaryCht.invokeSites ?? 0),
    actionCoverage: summaryCht.actionCoverage,
  };
}

function assertSceneActionCoverage(label, coverage, summary) {
  assert(coverage && typeof coverage === "object", `${label} scene action coverage missing`);
  assert.equal(coverage.schema, "unimaker.scene_action_coverage.v1", `${label} bad scene action coverage schema`);
  assert.equal(Number(coverage.eventHandlerCount ?? -1), Number(summary.scene?.eventHandlers ?? -2), `${label} event handler action coverage count mismatch`);
  assert.equal(Number(coverage.hitTargetCount ?? -1), Number(summary.scene?.hitTargets ?? -2), `${label} hit-target action coverage count mismatch`);
  assert(Number(coverage.routeHitTargetCount ?? 0) >= Number(summary.scene?.routeHitRects ?? 0), `${label} route hit-target coverage regressed`);
  assert.equal(Number(coverage.emptyActionKindCount ?? -1), 0, `${label} event handlers with empty actionKind remain`);
  assert.equal(Number(coverage.emptyEffectCount ?? -1), 0, `${label} event handlers with empty effect remain`);
  assert.equal(Number(coverage.invokeSegmentCount ?? -1), 0, `${label} invoke effect segments remain`);
  assert.equal(Number(coverage.unknownActionKindCount ?? -1), 0, `${label} unknown actionKind remains`);
  assert.equal(Number(coverage.invalidHitTargetNodeRefCount ?? -1), 0, `${label} hit targets reference missing nodes`);
  assert.equal(Number(coverage.invalidHitTargetRouteRefCount ?? -1), 0, `${label} route hit targets reference missing routes`);
  assert.equal(Number(coverage.eventHitTargetWithoutHandlerAncestorCount ?? -1), 0, `${label} event hit targets lack handler ancestors`);
}

function assertRetainedGate(gate, summary) {
  assert.equal(gate.schema, "unimaker.retained_parity_gate.v1", "bad retained gate schema");
  assert.equal(gate.materialize?.domCssComplete, true, "retained gate DOM/CSS incomplete");
  assert.equal(Number(gate.materialize?.domCssHardFailures ?? -1), 0, "retained gate DOM/CSS hard failures remain");
  assert.equal(gate.materialize?.routeInventoryComplete, true, "retained gate route inventory incomplete");
  assert.equal(gate.materialize?.routeReachabilityComplete, true, "retained gate route reachability incomplete");
  assert.equal(Number(gate.materialize?.routeCount ?? -1), expectedRoutes.length, "retained gate route count mismatch");
  assert.equal(Number(gate.materialize?.reachableRouteCount ?? -1), expectedRoutes.length, "retained gate reachable count mismatch");
  assert.equal(Number(gate.materialize?.edgeCount ?? -1), Number(summary.routeReachability?.edgeCount ?? -2), "retained gate edge count mismatch");
  assert.equal(Number(gate.digest?.routeCount ?? -1), expectedRoutes.length, "digest route count mismatch");
  assert.equal(Number(gate.digest?.renderedRoutes ?? -1), expectedRoutes.length, "digest rendered route count mismatch");
  assert.equal(Number(gate.digest?.renderBlockedCount ?? -1), 0, "render-blocked routes remain");
  assert.equal(Number(gate.digest?.runtimeEdgeCount ?? -1), Number(gate.digest?.factEdgeCount ?? -2), "runtime/fact edge count mismatch");
  assert.equal(Number(gate.digest?.verifiedEdges ?? -1), Number(gate.digest?.runtimeEdgeCount ?? -2), "not every runtime edge is verified");
  assert.equal(Number(gate.digest?.stateGatedCount ?? -1), 0, "state-gated route edges remain");
  assert.equal(Number(gate.digest?.issueCount ?? -1), 0, "retained digest edge issues remain");
  assert.equal(Number(gate.digest?.runtimeHitRectCount ?? -1), Number(summary.scene?.routeHitRects ?? -2), "runtime/fact hit rect count mismatch");
  assert.equal(Number(gate.digest?.acceptedHitRects ?? gate.digest?.verifiedHitRects ?? -1), Number(gate.digest?.runtimeHitRectCount ?? -2), "not every explicit hit rect is verified or explained by painter-order occlusion");
  assert.equal(Number(gate.digest?.hitRectIssueCount ?? -1), 0, "retained digest hit-rect issues remain");
  return gate.digest;
}

function assertGuiManifest(manifest) {
  assert.equal(manifest.schema, "unimaker.gui-surfaces.v2", "bad GUI manifest schema");
  assert(Number(manifest.count ?? 0) >= 172, "GUI surface count regressed");
  assert.equal(Number(manifest.selectedCount ?? -1), Number(manifest.count ?? -2), "GUI manifest did not select every surface");
  const surfaces = Array.isArray(manifest.surfaces) ? manifest.surfaces : [];
  const byId = new Set(surfaces.map((surface) => String(surface.id ?? "")));
  for (const id of requiredSurfaceIds) {
    assert(byId.has(id), `missing GUI surface: ${id}`);
  }
  const byKind = groupCount(surfaces.map((surface) => String(surface.kind ?? "")));
  assert(Number(byKind.page ?? 0) >= 27, "page surface coverage regressed");
  assert(Number(byKind.page_mobile ?? 0) >= 27, "mobile page surface coverage regressed");
  assert(Number(byKind.shell_page ?? 0) >= 27, "shell page surface coverage regressed");
  assert(Number(byKind.component ?? 0) >= 90, "component surface coverage regressed");
  return {
    count: Number(manifest.count ?? 0),
    selectedCount: Number(manifest.selectedCount ?? 0),
    byKind,
  };
}

function assertRouteEdge(edgesByRoute, from, target, domain) {
  const targets = Array.isArray(edgesByRoute[from]) ? edgesByRoute[from] : [];
  assert(targets.includes(target), `${domain} missing route edge ${from} -> ${target}`);
}

function assertSetEqual(actual, expected, label) {
  const actualSet = new Set(actual.map(String));
  const expectedSet = new Set(expected.map(String));
  const missing = [...expectedSet].filter((item) => !actualSet.has(item));
  const extra = [...actualSet].filter((item) => !expectedSet.has(item));
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, `${label} mismatch`);
}

function groupCount(values) {
  const out = {};
  for (const value of values) out[value] = Number(out[value] ?? 0) + 1;
  return out;
}

function readJson(path) {
  if (!path) throw new Error("empty JSON path");
  if (!existsSync(path)) throw new Error(`missing JSON file: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseArgs(args) {
  const parsed = {
    summary: resolve(packageDir, "tmp", "unimaker-retained-gate-functional-current", "one-click.summary.json"),
    retainedGate: resolve(packageDir, "tmp", "unimaker-retained-gate-functional-current", "unimaker-retained-parity-gate.report.json"),
    guiManifest: resolve(packageDir, "tmp", "unimaker-gui-matrix-functional-current", "gui-surfaces.manifest.json"),
    reportOut: resolve(packageDir, "tmp", "unimaker-functional-coverage-current", "unimaker-functional-coverage-gate.report.json"),
    help: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) throw new Error(`missing value for ${arg}`);
      return args[i];
    };
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--summary") parsed.summary = resolve(next());
    else if (arg === "--retained-gate") parsed.retainedGate = resolve(next());
    else if (arg === "--gui-manifest") parsed.guiManifest = resolve(next());
    else if (arg === "--no-gui-manifest") parsed.guiManifest = "";
    else if (arg === "--report-out") parsed.reportOut = resolve(next());
    else throw new Error(`unknown argument: ${arg}`);
  }
  return parsed;
}

function helpText() {
  return `Usage: node scripts/unimaker-functional-coverage-gate.mjs [flags]

Validates UniMaker retained GUI functional coverage from existing JSON reports.

Flags:
  --summary <path>          one-click.summary.json
  --retained-gate <path>    unimaker-retained-parity-gate.report.json
  --gui-manifest <path>     gui-surfaces.manifest.json
  --no-gui-manifest         skip GUI surface validation
  --report-out <path>       output report JSON
`;
}
