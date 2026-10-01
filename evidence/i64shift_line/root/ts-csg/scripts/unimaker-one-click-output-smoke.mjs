#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { discoverDefaultSystemFontFaces, prepareFontBase64, prepareFontCascadeBase64 } from "./font-subset.mjs";
import { runCommand } from "./process-runner.mjs";
import { chengSmokeEnv } from "./cheng-smoke-env.mjs";
import { parseSceneGlyphSdfPrecomputeOutput } from "./scene-glyph-sdf-precompute-output.mjs";
import {
  buildSceneMobileDataAsset,
  emitSceneRuntimeSmokeSource,
  sceneMobileGlyphSdfPixelAssetRelPath,
} from "./scene-runtime-smoke-source.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const fixtureRoot = join(packageDir, "fixtures", "csg-web-unimaker-voice-task");
const smokeRoot = join(packageDir, "tmp", `unimaker-one-click-output-smoke-${process.pid}-${randomUUID()}`);
const defaultOut = join(smokeRoot, "default");
const fullOut = join(smokeRoot, "full");
const fontOut = join(smokeRoot, "font-materialize");
const fontCacheHitOut = join(smokeRoot, "font-materialize-cache-hit");
const homeMediaLayoutOut = join(smokeRoot, "home-media-layout");
const publishGraphicOut = join(smokeRoot, "publish-graphic");
const marketplaceInitialOut = join(smokeRoot, "marketplace-initial");
const realUniMakerProjectRoot = "/Users/lbcheng/UniMaker/React.js";
const realUniMakerPwaImagePath = join(realUniMakerProjectRoot, "public", "pwa-smoke", "content-smoke-image.png");
const realUniMakerPwaVideoPosterPath = join(realUniMakerProjectRoot, "public", "pwa-smoke", "content-smoke-video-cover.png");
const realUniMakerPwaContentSnapshotSchema = "unimaker.pwa.content_snapshot.v1";
const realUniMakerPwaContentStorageKey = "unimaker_distributed_contents_v1";
const realUniMakerSnapshotVideoTitle = "content-sync-video-output-smoke";
const realUniMakerSnapshotImageTitle = "content-sync-image-output-smoke";
// Per-card fan-out (v5, 2026-07-10): applyMobileContentSnapshotToRoutes suffixes
// home_content_detail_open/home_image_detail_open with the tapped content's own id
// (contentDetailRouteIdForContent in unimaker-one-click.mjs) instead of leaving one
// route shared by every card. writePwaContentSnapshotFixture below is this file's
// single-video/single-image fixture, so its content ids determine these routes.
const realUniMakerSnapshotVideoDetailRouteId = "home_content_detail_open_content_sync_video_output_smoke_id";
const realUniMakerSnapshotImageDetailRouteId = "home_image_detail_open_content_sync_image_output_smoke_id";
const placeholderDefaultVideoCidPrefix = "bafy-unimaker-truth-video";
const huiwenCjkFontPath = "/Users/lbcheng/Library/Fonts/匯文明朝體.ttf";
const hex64Pattern = /^[0-9a-f]{64}$/;
const sha256SignaturePattern = /^sha256:[0-9a-f]{64}$/;
const smokeOptions = parseSmokeArgs(process.argv.slice(2));
let terminatingSignal = "";

installSmokeCleanupHooks();

function assertSceneMediaAssetShape(mediaAsset, label) {
  assert.equal(hex64Pattern.test(String(mediaAsset?.assetCid ?? "")), true, `${label} assetCid must be a real CID`);
  assert.equal(hex64Pattern.test(String(mediaAsset?.bundleCid ?? "")), true, `${label} bundleCid must be a real CID`);
  assert.equal(hex64Pattern.test(String(mediaAsset?.posterCid ?? "")), true, `${label} posterCid must be a real CID`);
  assert.equal(hex64Pattern.test(String(mediaAsset?.initSegmentCid ?? "")), true, `${label} initSegmentCid must be a real CID`);
  assert.equal(Number(mediaAsset?.initSegmentByteLength ?? 0) > 0, true, `${label} initSegmentByteLength must be positive`);
  assert.equal(sha256SignaturePattern.test(String(mediaAsset?.contentSignature ?? "")), true, `${label} contentSignature must be a sha256 signature`);
  assert.equal(hex64Pattern.test(String(mediaAsset?.catalogCid ?? "")), true, `${label} catalogCid must be a real CID`);
  assert.equal(hex64Pattern.test(String(mediaAsset?.rebuildTemplateCid ?? "")), true, `${label} rebuildTemplateCid must be a real CID`);
  assert.equal(Number(mediaAsset?.objectCount ?? 0) > 0, true, `${label} objectCount must be positive`);
  assert.equal(Number(mediaAsset?.dropletCount ?? 0) > 0, true, `${label} dropletCount must be positive`);
  assert.equal(Array.isArray(mediaAsset?.objects), true, `${label} objects must be present`);
  assert.equal((mediaAsset?.objects ?? []).every((object) => hex64Pattern.test(String(object.objectCid ?? "")) && hex64Pattern.test(String(object.sha256 ?? ""))), true, `${label} objects must carry real CIDs`);
  assert.equal(Array.isArray(mediaAsset?.droplets), true, `${label} droplets must be present`);
  assert.equal((mediaAsset?.droplets ?? []).every((droplet) => hex64Pattern.test(String(droplet.cid ?? "")) && hex64Pattern.test(String(droplet.sha256 ?? ""))), true, `${label} droplets must carry real CIDs`);
}

function assertSceneMediaSlotAndActions(sceneFacts, mediaAsset, expectedActions, label) {
  const slot = sceneFacts.find((fact) => fact.kind === "csg.web.media_playback_slot" && fact.assetCid === mediaAsset?.assetCid);
  assert.equal(hex64Pattern.test(String(slot?.manifestCid ?? "")), true, `${label} playback slot must carry manifestCid`);
  assert.equal(String(slot?.nodeTemplate ?? "").startsWith("csg.web.scene.node."), true, `${label} playback slot must bind a scene node template`);
  for (const actionKind of expectedActions) {
    assert.equal(sceneFacts.some((fact) => fact.kind === "csg.web.media_control_action" && fact.slotId === slot?.slotId && fact.actionKind === actionKind && fact.dispatch === "event-queue" && fact.payloadSchema === "unimaker.media.lifecycle.runtime.v1"), true, `${label} must expose ${actionKind} typed action`);
  }
  return slot;
}

function sceneGraphIndex(sceneFacts) {
  const routesById = new Map();
  const nodesByTemplate = new Map();
  const nodesByRouteAndId = new Map();
  const layoutsByRouteAndNode = new Map();
  const propsByRouteAndNode = new Map();
  const assetsByCid = new Map();
  for (const fact of sceneFacts) {
    if (fact.kind === "csg.web.scene.route") routesById.set(String(fact.routeId ?? ""), fact);
    if (fact.kind === "csg.web.scene.node") {
      nodesByTemplate.set(String(fact.id ?? ""), fact);
      nodesByRouteAndId.set(`${Number(fact.routeIndex ?? -1)}:${Number(fact.nodeId ?? -1)}`, fact);
    }
    if (fact.kind === "csg.web.scene.layout") {
      const key = `${Number(fact.routeIndex ?? -1)}:${Number(fact.nodeId ?? -1)}`;
      const layouts = layoutsByRouteAndNode.get(key) ?? [];
      layouts.push(fact);
      layoutsByRouteAndNode.set(key, layouts);
    }
    if (fact.kind === "csg.web.scene.prop") {
      const key = `${Number(fact.routeIndex ?? -1)}:${Number(fact.nodeId ?? -1)}`;
      const props = propsByRouteAndNode.get(key) ?? [];
      props.push(fact);
      propsByRouteAndNode.set(key, props);
    }
    if (fact.kind === "csg.web.media_asset") assetsByCid.set(String(fact.assetCid ?? ""), fact);
  }
  return { routesById, nodesByTemplate, nodesByRouteAndId, layoutsByRouteAndNode, propsByRouteAndNode, assetsByCid };
}

function sceneNodeLayouts(index, node) {
  return index.layoutsByRouteAndNode.get(`${Number(node?.routeIndex ?? -1)}:${Number(node?.nodeId ?? -1)}`) ?? [];
}

function sceneNodeHasLayout(index, node, propName, propValue) {
  return sceneNodeLayouts(index, node).some((fact) => fact.propName === propName && fact.propValue === propValue);
}

function sceneNodeLayoutNumber(index, node, propName) {
  const fact = sceneNodeLayouts(index, node).find((item) => item.propName === propName);
  const value = Number(fact?.propValue ?? NaN);
  return Number.isFinite(value) ? value : NaN;
}

function sceneNodeProps(index, node) {
  return index.propsByRouteAndNode.get(`${Number(node?.routeIndex ?? -1)}:${Number(node?.nodeId ?? -1)}`) ?? [];
}

function sceneNodePropValue(index, node, propName) {
  return String(sceneNodeProps(index, node).find((item) => item.propName === propName)?.propValue ?? "");
}

function sceneNodeHasMasonryAncestor(index, node) {
  let current = node;
  const seen = new Set();
  while (current && Number(current.parentNodeId ?? 0) !== 0) {
    const key = `${Number(current.routeIndex ?? -1)}:${Number(current.nodeId ?? -1)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (sceneNodeHasLayout(index, current, "display", "masonry")) return true;
    current = index.nodesByRouteAndId.get(`${Number(current.routeIndex ?? -1)}:${Number(current.parentNodeId ?? -1)}`);
  }
  return false;
}

function sceneEffectHasSegment(effect, prefix) {
  return String(effect ?? "")
    .split(";")
    .map((part) => part.trim())
    .some((part) => part.startsWith(prefix));
}

function assertSceneClickEventHasHitTarget(sceneFacts, eventFact, label) {
  assert(eventFact, `${label} click event must exist`);
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.hit_target" &&
    fact.routeId === eventFact.routeId &&
    Number(fact.routeIndex ?? -1) === Number(eventFact.routeIndex ?? -2) &&
    Number(fact.nodeId ?? -1) === Number(eventFact.nodeId ?? -2) &&
    fact.eventName === "click"
  ), true, `${label} click event must have a matching hit target on the same node`);
}

// A click handler that ALSO navigates (confirm/cancel buttons calling onBack()) gets a
// route-kind hit target on the same node; the runtime's route apply path replays the event
// effect before switching routes (WebSceneApplyRouteEdge), so delta+navigation stay one tap.
function assertSceneClickEventHasNavigationHitTarget(sceneFacts, eventFact, label) {
  assert(eventFact, `${label} click event must exist`);
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.hit_target" &&
    fact.routeId === eventFact.routeId &&
    Number(fact.routeIndex ?? -1) === Number(eventFact.routeIndex ?? -2) &&
    Number(fact.nodeId ?? -1) === Number(eventFact.nodeId ?? -2) &&
    (fact.eventName === "click" ||
      (fact.targetKind === "route" && String(fact.targetRouteId ?? "") === String(eventFact.targetRouteId ?? "")))
  ), true, `${label} click event must have a matching click or same-target route hit target on the same node`);
}

function sceneNearestMasonryAncestor(index, node) {
  let current = node;
  const seen = new Set();
  while (current && Number(current.parentNodeId ?? 0) !== 0) {
    const key = `${Number(current.routeIndex ?? -1)}:${Number(current.nodeId ?? -1)}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    if (sceneNodeHasLayout(index, current, "display", "masonry")) return current;
    current = index.nodesByRouteAndId.get(`${Number(current.routeIndex ?? -1)}:${Number(current.parentNodeId ?? -1)}`);
  }
  return undefined;
}

function sceneDirectMasonryItemAncestor(index, node) {
  let current = node;
  let child = undefined;
  const seen = new Set();
  while (current && Number(current.parentNodeId ?? 0) !== 0) {
    const key = `${Number(current.routeIndex ?? -1)}:${Number(current.nodeId ?? -1)}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    if (sceneNodeHasLayout(index, current, "display", "masonry")) return child;
    child = current;
    current = index.nodesByRouteAndId.get(`${Number(current.routeIndex ?? -1)}:${Number(current.parentNodeId ?? -1)}`);
  }
  return undefined;
}

function sceneNodeHasInsetZero(index, node) {
  return sceneNodeHasLayout(index, node, "left", "0px") &&
    sceneNodeHasLayout(index, node, "right", "0px") &&
    sceneNodeHasLayout(index, node, "top", "0px") &&
    sceneNodeHasLayout(index, node, "bottom", "0px");
}

function sceneNodeHasFullscreenFixedSelfOrAncestor(index, node) {
  let current = node;
  const seen = new Set();
  while (current && Number(current.parentNodeId ?? 0) !== 0) {
    const key = `${Number(current.routeIndex ?? -1)}:${Number(current.nodeId ?? -1)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (sceneNodeHasLayout(index, current, "position", "fixed") && sceneNodeHasInsetZero(index, current)) return true;
    current = index.nodesByRouteAndId.get(`${Number(current.routeIndex ?? -1)}:${Number(current.parentNodeId ?? -1)}`);
  }
  return false;
}

function sceneNodeHasConditionalSelfOrAncestor(index, node) {
  let current = node;
  const seen = new Set();
  while (current && Number(current.parentNodeId ?? 0) !== 0) {
    const key = `${Number(current.routeIndex ?? -1)}:${Number(current.nodeId ?? -1)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (String(current.conditionalStateRef ?? "").length > 0) return true;
    current = index.nodesByRouteAndId.get(`${Number(current.routeIndex ?? -1)}:${Number(current.parentNodeId ?? -1)}`);
  }
  return false;
}

function sceneJsonTopLevelArrayItemCount(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : undefined;
  } catch {
    return undefined;
  }
}

function sceneConditionMatchesState(conditionalStateValue, stateValue) {
  const expected = String(conditionalStateValue ?? "");
  const actual = String(stateValue ?? "");
  if (expected.length === 0 || expected === "__truthy") return actual.length > 0 && actual !== "false";
  if (expected === "__falsy") return actual.length === 0 || actual === "false";
  if (expected === "__trim_nonempty") return actual.trim().length > 0;
  if (expected === "__array_nonempty") return (sceneJsonTopLevelArrayItemCount(actual) ?? 0) > 0;
  if (expected.startsWith("__array_length_lt:")) {
    const bound = Number.parseInt(expected.slice("__array_length_lt:".length), 10);
    return Number.isInteger(bound) && (sceneJsonTopLevelArrayItemCount(actual) ?? 0) < bound;
  }
  if (expected.startsWith("__array_length_gte:")) {
    const bound = Number.parseInt(expected.slice("__array_length_gte:".length), 10);
    return Number.isInteger(bound) && (sceneJsonTopLevelArrayItemCount(actual) ?? 0) >= bound;
  }
  if (expected.startsWith("__not:")) return actual !== expected.slice("__not:".length);
  return actual === expected;
}

function sceneNodeVisibleForStateSelfOrAncestor(index, node, stateValues) {
  let current = node;
  const seen = new Set();
  while (current && Number(current.parentNodeId ?? 0) !== 0) {
    const key = `${Number(current.routeIndex ?? -1)}:${Number(current.nodeId ?? -1)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const stateRef = String(current.conditionalStateRef ?? "");
    if (stateRef.length > 0 && !sceneConditionMatchesState(current.conditionalStateValue, stateValues[stateRef] ?? "")) return false;
    current = index.nodesByRouteAndId.get(`${Number(current.routeIndex ?? -1)}:${Number(current.parentNodeId ?? -1)}`);
  }
  return true;
}

function sceneRouteMediaSlots(sceneFacts, index, routeId) {
  const route = index.routesById.get(routeId);
  if (!route) return [];
  const routeIndex = Number(route.routeIndex ?? -1);
  return sceneFacts
    .filter((fact) => fact.kind === "csg.web.media_playback_slot")
    .map((slot) => ({ slot, node: index.nodesByTemplate.get(String(slot.nodeTemplate ?? "")), asset: index.assetsByCid.get(String(slot.assetCid ?? "")) }))
    .filter((entry) => Number(entry.node?.routeIndex ?? -1) === routeIndex);
}

function sceneRouteHasMasonryLayout(index, routeId) {
  const route = index.routesById.get(routeId);
  if (!route) return false;
  const routeIndex = Number(route.routeIndex ?? -1);
  for (const layouts of index.layoutsByRouteAndNode.values()) {
    if (layouts.some((fact) =>
      Number(fact.routeIndex ?? -1) === routeIndex &&
      fact.propName === "display" &&
      fact.propValue === "masonry"
    )) {
      return true;
    }
  }
  return false;
}

function assertHomeMediaSlotsStayInMasonryAndDetailVideoCanFullscreen(sceneFacts) {
  const index = sceneGraphIndex(sceneFacts);
  const homeSlots = sceneRouteMediaSlots(sceneFacts, index, "home_default");
  assert.equal(homeSlots.length, 2, "home_default must expose the current PWA video and image cards in the masonry feed");
  for (const { slot, node, asset } of homeSlots) {
    const assetKind = Number(asset?.kindCode ?? 0);
    assert(assetKind === 1 || assetKind === 2, "home_default must render only PWA content media slots");
    assert(node, `home media slot must bind an existing scene node: ${slot.slotId}`);
    assert.notEqual(Number(node.parentNodeId ?? 0), 0, "home media slot must not bind the route root");
    assert.equal(sceneNodeHasMasonryAncestor(index, node), true, "home media slot must stay under the masonry layout tree");
    const masonryAncestor = sceneNearestMasonryAncestor(index, node);
    assert.equal(sceneNodeHasLayout(index, masonryAncestor, "data-csg-masonry-model", "virtualized-react"), true, "home VirtualizedMasonry must preserve React virtualized column semantics");
    const masonryItem = sceneDirectMasonryItemAncestor(index, node);
    assert(masonryItem, "home media slot must sit inside a direct masonry item");
    assert.equal(Number(masonryItem?.parentNodeId ?? -1), Number(masonryAncestor?.nodeId ?? -2), "home media card wrapper must be a direct masonry item");
    assert.equal(masonryItem?.tagName, "div", "home media card wrapper must be a real div item, not a fragment wrapper");
    assert.equal(slot.objectFit, "cover", "home media slot must preserve React ContentCard object-cover semantics");
    const expectedAspectRatio = Number(slot.kindCode ?? asset?.kindCode ?? 0) === 1 ? 1.4 : 0.75;
    assert(Math.abs(sceneNodeLayoutNumber(index, node, "aspect-ratio") - expectedAspectRatio) < 0.001, "home media slot must bind the internal ContentCard aspect-ratio box");
    assert.equal(sceneNodeHasFullscreenFixedSelfOrAncestor(index, node), false, "home media slot must not be a fullscreen fixed surface");
  }

  for (const routeId of [realUniMakerSnapshotVideoDetailRouteId, "content_detail"]) {
    const routeVideoSlots = sceneRouteMediaSlots(sceneFacts, index, routeId)
      .filter(({ asset }) => Number(asset?.kindCode ?? 0) === 1);
    assert(routeVideoSlots.length >= 1, `${routeId} must expose a dedicated video surface`);
    for (const { node } of routeVideoSlots) {
      assert.equal(sceneNodeHasMasonryAncestor(index, node), false, `${routeId} video surface must not stay in the background masonry feed`);
      assert.equal(sceneNodeHasFullscreenFixedSelfOrAncestor(index, node), true, `${routeId} video surface must be inside a fullscreen fixed detail shell`);
    }
  }

  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route_edge" &&
    fact.routeId === "home_default" &&
    fact.targetRouteId === realUniMakerSnapshotImageDetailRouteId
  ), true, "home image card must open the image detail route");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.hit_target" &&
    fact.routeId === "home_default" &&
    fact.targetKind === "route" &&
    fact.targetRouteId === realUniMakerSnapshotImageDetailRouteId
  ), true, "home image card must expose an image detail hit target");
  const imageDetailSlots = sceneRouteMediaSlots(sceneFacts, index, realUniMakerSnapshotImageDetailRouteId)
    .filter(({ asset, node }) => Number(asset?.kindCode ?? 0) === 2 && !sceneNodeHasMasonryAncestor(index, node));
  assert(imageDetailSlots.length >= 1, "home image detail route must expose a dedicated image surface outside the masonry feed");
  assert.equal(imageDetailSlots.some(({ node }) => node?.tagName === "img" && sceneNodePropValue(index, node, "src").startsWith("p2pmedia://")), true, "home image detail route must bind the content image img src, not an empty auxiliary image");
  assert.equal(imageDetailSlots.some(({ node }) => sceneNodePropValue(index, node, "alt") === "支付截图"), false, "home image detail route must not mistake payment proof screenshots for content media");
  const imageDetailAutoHeightContentImages = [...index.nodesByRouteAndId.values()].filter((node) =>
    node.routeId === realUniMakerSnapshotImageDetailRouteId &&
    node.tagName === "img" &&
    sceneNodeHasLayout(index, node, "height", "auto") &&
    sceneNodePropValue(index, node, "alt") !== "支付截图"
  );
  assert(imageDetailAutoHeightContentImages.length >= 1, "home image detail route must keep the auto-height content image node");
  assert.equal(imageDetailAutoHeightContentImages.every((node) => sceneNodeLayouts(index, node).some((fact) => fact.propName === "aspect-ratio")), true, "auto-height content image must carry intrinsic aspect-ratio for retained layout");
  const imageDetailVideoSlots = sceneRouteMediaSlots(sceneFacts, index, realUniMakerSnapshotImageDetailRouteId)
    .filter(({ asset, node }) => Number(asset?.kindCode ?? 0) === 1 && !sceneNodeHasMasonryAncestor(index, node));
  assert.equal(imageDetailVideoSlots.length, 0, "home image detail route must not reuse the video detail surface");
}

function assertPublishedContentDataOpensFullscreenVideoDetail(sceneFacts) {
  const index = sceneGraphIndex(sceneFacts);
  assert(index.routesById.has("node_published_content"), "published content data route must be materialized");
  assert(index.routesById.has("content_detail"), "published content detail target route must be materialized");
  assert.equal(sceneRouteHasMasonryLayout(index, "node_published_content"), true, "published content data route must render its media list in masonry before opening detail");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route_edge" &&
    fact.routeId === "node_published_content" &&
    fact.targetRouteId === "content_detail"
  ), true, "published content data route must open the content_detail route");

  for (const { node } of sceneRouteMediaSlots(sceneFacts, index, "node_published_content")) {
    assert.equal(sceneNodeHasMasonryAncestor(index, node), true, "published content data list media must stay under the masonry layout tree");
    const masonryAncestor = sceneNearestMasonryAncestor(index, node);
    const masonryItem = sceneDirectMasonryItemAncestor(index, node);
    assert(masonryItem, "published content data media must sit inside a direct masonry item");
    assert.equal(Number(masonryItem?.parentNodeId ?? -1), Number(masonryAncestor?.nodeId ?? -2), "published content data card wrapper must be a direct masonry item");
    assert.equal(sceneNodeHasFullscreenFixedSelfOrAncestor(index, node), false, "published content data list media must not be fullscreen");
  }
  const publishedVideoSlots = sceneRouteMediaSlots(sceneFacts, index, "node_published_content")
    .filter(({ asset, node }) => Number(asset?.kindCode ?? 0) === 1 && sceneNodeHasMasonryAncestor(index, node));
  assert(publishedVideoSlots.length >= 1, "published content data route must expose the video as a masonry media slot");

  const detailVideoSlots = sceneRouteMediaSlots(sceneFacts, index, "content_detail")
    .filter(({ asset, node }) => Number(asset?.kindCode ?? 0) === 1 && !sceneNodeHasMasonryAncestor(index, node));
  assert(detailVideoSlots.length >= 1, "published content detail route must expose the selected video surface");
  assert.equal(detailVideoSlots.some(({ node }) => sceneNodeHasFullscreenFixedSelfOrAncestor(index, node)), true, "published content detail video must be fullscreen");
}

function mediaSurfaceLayoutExpectationsForUniMakerHome(sceneFacts) {
  const index = sceneGraphIndex(sceneFacts);
  const homeVideo = sceneRouteMediaSlots(sceneFacts, index, "home_default")
    .find(({ asset, node }) =>
      Number(asset?.kindCode ?? 0) === 1 &&
      sceneNodeHasMasonryAncestor(index, node) &&
      !sceneNodeHasFullscreenFixedSelfOrAncestor(index, node)
    );
  assert(homeVideo, "home_default must expose a video surface in the masonry feed");
  const expectations = [{
    routeId: "home_default",
    kindCode: 1,
    slotId: homeVideo?.slot.slotId,
    mode: "not-fullscreen",
    viewportWidth: 390,
    viewportHeight: 844,
  }];
  const publishedVideo = sceneRouteMediaSlots(sceneFacts, index, "node_published_content")
    .find(({ asset, node }) =>
      Number(asset?.kindCode ?? 0) === 1 &&
      sceneNodeHasMasonryAncestor(index, node) &&
      !sceneNodeHasFullscreenFixedSelfOrAncestor(index, node)
    );
  assert(publishedVideo, "node_published_content must expose a video surface in the masonry feed");
  expectations.push({
    routeId: "node_published_content",
    kindCode: 1,
    slotId: publishedVideo?.slot.slotId,
    mode: "not-fullscreen",
    viewportWidth: 390,
    viewportHeight: 844,
  });
  for (const routeId of [realUniMakerSnapshotVideoDetailRouteId, "content_detail"]) {
    const detailVideo = sceneRouteMediaSlots(sceneFacts, index, routeId)
      .find(({ asset, node }) =>
        Number(asset?.kindCode ?? 0) === 1 &&
        !sceneNodeHasMasonryAncestor(index, node) &&
        sceneNodeHasFullscreenFixedSelfOrAncestor(index, node)
      );
    assert(detailVideo, `${routeId} must expose a fullscreen video surface`);
    expectations.push({
      routeId,
      kindCode: 1,
      slotId: detailVideo?.slot.slotId,
      mode: "fullscreen",
      viewportWidth: 390,
      viewportHeight: 844,
    });
  }
  return expectations;
}

function assertRetainedMediaLifecycleFacts(sceneFacts, sceneDataBytes) {
  assert.equal(sceneFacts.some((fact) => JSON.stringify(fact).includes(placeholderDefaultVideoCidPrefix)), false, "retained scene facts must not carry placeholder UniMaker video CIDs");
  assertPublishContentVideoPlaybackSlotWhenRouteExists(sceneFacts);
  const mediaAssets = sceneFacts.filter((fact) => fact.kind === "csg.web.media_asset");
  assert(mediaAssets.length >= 2, "retained scene facts must include video and image media assets");
  const videoAsset = mediaAssets.find((fact) => fact.kindCode === 1 && fact.mime === "video/mp4");
  assertSceneMediaAssetShape(videoAsset, "video");
  assert.equal(videoAsset?.kindCode, 1, "retained scene facts must carry the video kindCode");
  assert.equal(videoAsset?.mime, "video/mp4", "retained scene facts must carry the video MIME");
  assert.equal(hex64Pattern.test(String(videoAsset?.initSegmentCid ?? "")), true, "retained scene facts must carry the real UniMaker video init segment CID");
  assert.equal(Number(videoAsset?.initSegmentByteLength ?? 0) > 0, true, "retained scene facts must carry the UniMaker video init segment byte length");
  const videoSlot = assertSceneMediaSlotAndActions(sceneFacts, videoAsset, ["OpenAsset", "Play", "Pause", "Seek", "EditAsset", "PublishAsset", "ShareAsset"], "video");
  assert.equal(videoSlot?.decodeProvider, "macos-videotoolbox-codec-provider", "video slot must use the platform codec provider");
  assert.equal(videoSlot?.objectFit, "cover", "video slot must carry object-fit cover");
  const imageAsset = mediaAssets.find((fact) => fact.kindCode === 2 && fact.mime === "image/png");
  assertSceneMediaAssetShape(imageAsset, "image");
  assert.equal(imageAsset?.codec, "png", "retained scene facts must carry the image codec");
  assert.equal(imageAsset?.keyframeIndex, "image:png:single-frame", "retained scene facts must carry the image frame index");
  const imageSlot = assertSceneMediaSlotAndActions(sceneFacts, imageAsset, ["OpenAsset", "EditAsset", "PublishAsset", "ShareAsset"], "image");
  assert.equal(imageSlot?.decodeProvider, "image-raster-provider", "image slot must use the image raster provider");
  assert.equal(imageSlot?.audioProvider, "none", "image slot must not bind an audio provider");
  assert.equal(imageSlot?.objectFit, "cover", "image slot must carry object-fit cover");
  assert.equal(mediaAssets.some((fact) => fact.kindCode === 3 && fact.mime === "audio/wav"), false, "home retained scene facts must not restore the removed audio mock card");
  for (const mediaAsset of [videoAsset, imageAsset]) {
    assert.equal(sceneDataBytes.includes(Buffer.from(String(mediaAsset?.assetCid ?? ""))), true, "retained scene data asset must carry every media asset CID");
  }
}

function assertRetainedMediaSceneAssets(outDir, sceneFacts, summary, files) {
  const sceneDataBytes = readFileSync(join(outDir, "runtime", "unimaker_scene_data.bin"));
  const expectedSceneDataAsset = buildSceneMobileDataAsset(sceneFacts);
  assert.equal(Buffer.compare(sceneDataBytes, expectedSceneDataAsset.buffer), 0, "retained scene data asset must exactly match scene CSG facts");
  assert.equal(summary.mobileContentSnapshot?.schema, realUniMakerPwaContentSnapshotSchema, "real UniMaker media smoke must report the PWA content snapshot schema");
  assert.equal(summary.mobileContentSnapshot?.storageKey, realUniMakerPwaContentStorageKey, "real UniMaker media smoke must report the PWA content storage key");
  assert(summary.mobileContentSnapshot?.contentIds?.includes("content-sync-video-output-smoke-id"), "real UniMaker media smoke must report the PWA video content id");
  assert(summary.mobileContentSnapshot?.contentIds?.includes("content-sync-image-output-smoke-id"), "real UniMaker media smoke must report the PWA image content id");
  assertHomeContentCardDerivedTextFacts(sceneFacts, join(outDir, "pwa-content-snapshot.json"));
  assertRetainedMediaLifecycleFacts(sceneFacts, sceneDataBytes);
  const mediaPayloadReceipts = summary.mediaPayloadAssets ?? [];
  assert(mediaPayloadReceipts.length >= 2, "real UniMaker media smoke must write video and image media payload assets");
  const videoAsset = sceneFacts.find((fact) => fact.kind === "csg.web.media_asset" && fact.kindCode === 1 && fact.mime === "video/mp4");
  assertSceneMediaAssetShape(videoAsset, "video");
  const videoPayloadReceipt = mediaPayloadReceipts.find((asset) => asset.assetCid === videoAsset.assetCid);
  assert(videoPayloadReceipt, "real UniMaker media smoke must write the selected UniMaker video payload receipt");
  assert.equal(videoPayloadReceipt.relPath, `runtime/media/assets/${videoAsset.assetCid}.mp4`, "video payload receipt must use assetCid path");
  const videoPosterReceipt = mediaPayloadReceipts.find((asset) => asset.role === "poster" && asset.assetCid === videoAsset.posterCid);
  assert(videoPosterReceipt, "real UniMaker media smoke must write the selected UniMaker video poster PNG receipt");
  assert.equal(videoPosterReceipt.relPath, `runtime/media/assets/${videoAsset.posterCid}.png`, "video poster payload receipt must use posterCid PNG path");
  const expectedVideoPosterBytes = readFileSync(realUniMakerPwaVideoPosterPath);
  const expectedVideoPosterSha = createHash("sha256").update(expectedVideoPosterBytes).digest("hex");
  assert.equal(videoAsset.posterCid, expectedVideoPosterSha, "retained scene facts must carry the PWA video poster CID");
  assert.equal(videoPosterReceipt.byteCount, expectedVideoPosterBytes.length, "video poster payload receipt must use the PWA poster bytes");
  const imageAsset = sceneFacts.find((fact) => fact.kind === "csg.web.media_asset" && fact.kindCode === 2 && fact.mime === "image/png");
  assertSceneMediaAssetShape(imageAsset, "image");
  const imagePayloadReceipt = mediaPayloadReceipts.find((asset) => asset.assetCid === imageAsset.assetCid);
  assert(imagePayloadReceipt, "real UniMaker media smoke must write the selected UniMaker image payload receipt");
  assert.equal(imagePayloadReceipt.relPath, `runtime/media/assets/${imageAsset.assetCid}.png`, "image payload receipt must use assetCid path");
  assert.equal(resolve(summary.mobileImageFile ?? ""), resolve(realUniMakerPwaImagePath), "real UniMaker media smoke must select the PWA image asset");
  const expectedImageBytes = readFileSync(realUniMakerPwaImagePath);
  const expectedImageSha = createHash("sha256").update(expectedImageBytes).digest("hex");
  assert.equal(imageAsset.assetCid, expectedImageSha, "retained scene facts must carry the PWA image asset CID");
  assert.equal(imagePayloadReceipt.byteCount, expectedImageBytes.length, "image payload receipt must use the PWA image bytes");
  assert(imagePayloadReceipt.byteCount > 77, "image payload must not use the 77-byte placeholder PNG");
  for (const receipt of mediaPayloadReceipts) {
    assert.equal(hex64Pattern.test(String(receipt.assetCid ?? "")), true, "media payload receipt assetCid must be a sha256 CID");
    assert.equal(receipt.sha256, receipt.assetCid, "media payload receipt sha256 must match assetCid");
    assert(String(receipt.relPath ?? "").startsWith("runtime/media/assets/"), "media payload receipt must stay under runtime/media/assets");
    const payloadPath = join(outDir, receipt.relPath);
    assert(files.some((file) => file === payloadPath), `media payload asset must be listed: ${receipt.relPath}`);
    const payloadBytes = readFileSync(payloadPath);
    assert(payloadBytes.length > 0, `media payload asset must be non-empty: ${receipt.relPath}`);
    assert.equal(payloadBytes.length, receipt.byteCount, `media payload receipt byteCount must match file bytes: ${receipt.relPath}`);
    assert.equal(createHash("sha256").update(payloadBytes).digest("hex"), receipt.assetCid, `media payload bytes must hash to assetCid: ${receipt.relPath}`);
  }
  assert.equal(sceneDataBytes.includes(Buffer.from(String(videoAsset.assetCid))), true, "retained scene data asset must carry the real UniMaker video asset CID");
  assert.equal(sceneDataBytes.includes(Buffer.from(String(imageAsset.assetCid))), true, "retained scene data asset must carry the real UniMaker image asset CID");
  assert.equal(sceneDataBytes.includes(Buffer.from(placeholderDefaultVideoCidPrefix)), false, "retained scene data asset must not carry placeholder UniMaker video CIDs");
  assert(expectedSceneDataAsset.counts.mediaAssets >= 2, "retained scene data asset must include video and image media assets");
  assert(expectedSceneDataAsset.counts.mediaPlaybackSlots >= 2, "retained scene data asset must include media playback slots");
  assert(expectedSceneDataAsset.counts.mediaControlActions >= 11, "retained scene data asset must include playback, edit, publish, and share typed media control actions");
}

function assertHomeContentCardDerivedTextFacts(sceneFacts, contentSnapshotPath) {
  const snapshot = JSON.parse(readFileSync(contentSnapshotPath, "utf8"));
  const contents = Array.isArray(snapshot?.contents) ? snapshot.contents : [];
  assert(contents.length >= 2, "home_default content card text smoke requires the PWA content snapshot items");
  const routeText = sceneRouteTextPaints(sceneFacts, "home_default");
  for (const content of contents) {
    const title = typeof content?.title === "string" ? content.title.trim() : "";
    const body = typeof content?.content === "string" ? content.content.trim() : "";
    const displayTitle = title.length > 0 ? title : body;
    assert(routeText.includes(displayTitle), `home_default must render ContentCard display title: ${displayTitle}`);
    // PWA ContentCard.tsx: authorDisplayName = userName || (peerTail ? `节点 ${peerTail}` : "")
    // — the peer tail is the fallback author label, not an additional chip.
    const userName = typeof content?.userName === "string" ? content.userName.trim() : "";
    const peerTail = homeContentCardPeerTail(content?.userId);
    const authorDisplayName = userName.length > 0 ? userName : (peerTail.length > 0 ? `节点 ${peerTail}` : "");
    if (authorDisplayName.length > 0) {
      assert(routeText.includes(authorDisplayName), `home_default must render ContentCard author display name: ${authorDisplayName}`);
    }
    const likeLabel = homeContentCardCompactCount(content?.likes);
    if (likeLabel.length > 0) {
      assert(routeText.includes(likeLabel), `home_default must render ContentCard like count: ${likeLabel}`);
    }
    const locationLabel = homeContentCardLocationLabel(content);
    if (locationLabel.length > 0) {
      assert(routeText.includes(locationLabel), `home_default must render ContentCard location label: ${locationLabel}`);
    }
  }
  assert.equal(routeText.includes("试看 ¥0"), false, "home_default must not inherit publish-form paid state into ContentCard video cards");
  assert.equal(routeText.includes("试听 ¥0"), false, "home_default must not inherit publish-form paid state into ContentCard audio cards");
}

function homeContentCardCompactCount(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return "";
  if (numberValue >= 10000) return `${Math.floor(numberValue / 10000)}万`;
  return `${Math.floor(numberValue)}`;
}

function homeContentCardPeerTail(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (normalized.length === 0) return "";
  return normalized.length <= 6 ? normalized : normalized.slice(-6);
}

function homeContentCardLocationLabel(content) {
  const formatted = homeContentCardFormatLocationLabel(content?.location);
  if (formatted.length > 0) return formatted;
  return homeContentCardText(content?.locationHint);
}

function homeContentCardFormatLocationLabel(location) {
  const root = homeContentCardRecord(location);
  if (!root) return "";
  const publicLocation = homeContentCardRecord(root.public) ?? root;
  const preciseLocation = homeContentCardRecord(root.precise) ?? root;
  const country = homeContentCardText(publicLocation.country);
  const province = homeContentCardText(publicLocation.province);
  const city = homeContentCardText(publicLocation.city);
  const district = homeContentCardText(publicLocation.district);
  const latitude = homeContentCardFiniteNumber(preciseLocation.latitude);
  const longitude = homeContentCardFiniteNumber(preciseLocation.longitude);
  if (!country && !province && !city && !district && latitude === null && longitude === null) return "";
  const displayLevel = homeContentCardText(publicLocation.displayLevel);
  const parts = homeContentCardDedupeLocationParts([
    homeContentCardCountryDisplayName(country),
    displayLevel === "country" ? "" : province,
    displayLevel === "country" || displayLevel === "province" ? "" : city,
    displayLevel && displayLevel !== "district" ? "" : district,
  ]);
  if (parts.length === 0) return "";
  const normalizedCountry = country.trim().toLowerCase();
  const isChina = normalizedCountry === "cn" || normalizedCountry === "china" || normalizedCountry === "中国" || normalizedCountry === "中华人民共和国";
  return isChina ? parts.join("") : parts.join(" · ");
}

function homeContentCardRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function homeContentCardText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function homeContentCardFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function homeContentCardDedupeLocationParts(values) {
  const out = [];
  for (const row of values) {
    const value = row.trim();
    if (!value || out.includes(value)) continue;
    out.push(value);
  }
  return out;
}

function homeContentCardCountryDisplayName(country) {
  const trimmed = country.trim();
  if (!trimmed) return "";
  if (!/^[A-Za-z]{2}$/.test(trimmed)) return trimmed;
  try {
    const display = new Intl.DisplayNames(["zh-CN"], { type: "region" });
    return display.of(trimmed.toUpperCase()) ?? trimmed.toUpperCase();
  } catch {
    return trimmed.toUpperCase();
  }
}

function assertPublishContentVideoPlaybackSlotWhenRouteExists(sceneFacts) {
  const publishRoute = sceneFacts.find((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "publish_content");
  if (!publishRoute) return;
  const publishRouteIndex = Number(publishRoute.routeIndex);
  const nodesByTemplate = new Map(
    sceneFacts
      .filter((fact) => fact.kind === "csg.web.scene.node")
      .map((fact) => [String(fact.id ?? ""), fact]),
  );
  const videoAssetCids = new Set(
    sceneFacts
      .filter((fact) => fact.kind === "csg.web.media_asset" && Number(fact.kindCode ?? 0) === 1)
      .map((fact) => String(fact.assetCid ?? "")),
  );
  const publishVideoSlot = sceneFacts.find((fact) => {
    if (fact.kind !== "csg.web.media_playback_slot") return false;
    if (!videoAssetCids.has(String(fact.assetCid ?? ""))) return false;
    const node = nodesByTemplate.get(String(fact.nodeTemplate ?? ""));
    return Number(node?.routeIndex ?? -1) === publishRouteIndex;
  });
  assert(publishVideoSlot, "publish_content route must bind a real video media playback slot");
  assert.equal(hex64Pattern.test(String(publishVideoSlot.manifestCid ?? "")), true, "publish_content video playback slot must carry manifestCid");
  assert.equal(publishVideoSlot.decodeProvider, "macos-videotoolbox-codec-provider", "publish_content video slot must use platform codec provider");
}

function assertPublishGraphicRouteFacts(sceneFacts) {
  const publishRoute = sceneFacts.find((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "publish_graphic");
  assert(publishRoute, "publish_graphic route must be materialized");
  const publishRouteIndex = Number(publishRoute.routeIndex);
  const routeTextPaints = sceneFacts
    .filter((fact) => fact.kind === "csg.web.scene.paint" && Number(fact.routeIndex ?? -1) === publishRouteIndex && fact.opKind === "text")
    .map((fact) => String(fact.text ?? ""))
    .filter((text) => text.length > 0);
  assert(routeTextPaints.includes("发布图文") || (routeTextPaints.includes("发布") && routeTextPaints.includes("图文")), "publish_graphic route must render the graphic publish title");
  assert(routeTextPaints.includes("图片"), "publish_graphic route must render the image upload label");
  assert(routeTextPaints.includes("已选择"), "publish_graphic route must render selected media state after file picker returns");
  assert(routeTextPaints.some((text) => text.includes("图文记录")), "publish_graphic route must carry graphic tag suggestions");
  assert(routeTextPaints.some((text) => text.includes("图片分享")), "publish_graphic route must carry graphic image-share tag suggestions");
  assert(routeTextPaints.some((text) => text.includes("该图文内容的原创所有权")), "publish_graphic route must use graphic original-rights text");
  assert(routeTextPaints.some((text) => text.includes("原始图片")), "publish_graphic route must ask for original image proof");
  assert.equal(routeTextPaints.some((text) => text.includes("该视频的原创所有权")), false, "publish_graphic route must not keep video original-rights text");
  assert.equal(routeTextPaints.some((text) => text.includes("原始视频")), false, "publish_graphic route must not ask for original video proof");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.prop" &&
    Number(fact.routeIndex ?? -1) === publishRouteIndex &&
    fact.propName === "data-csg-media-kind" &&
    fact.propValue === "image"
  ), true, "publish_graphic route must mark upload media kind as image");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.prop" &&
    Number(fact.routeIndex ?? -1) === publishRouteIndex &&
    fact.propName === "accept" &&
    fact.propValue === "image/*"
  ), true, "publish_graphic route must keep image/* file accept facts");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.node" &&
    Number(fact.routeIndex ?? -1) === publishRouteIndex &&
    fact.conditionalStateRef === "mediaFiles" &&
    fact.conditionalStateValue === "__array_nonempty"
  ), true, "publish_graphic route must expose a visible node bound to selected mediaFiles");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.prop" &&
    Number(fact.routeIndex ?? -1) === publishRouteIndex &&
    fact.propName === "src" &&
    fact.valueKind === "state-src:mediaPreviews"
  ), true, "publish_graphic route must bind selected media cover frame to mediaPreviews");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.resource" &&
    fact.resourceKind === "dynamic_image_state" &&
    fact.resourceId === "image.state.mediaPreviews"
  ), true, "publish_graphic route must expose mediaPreviews as a dynamic image resource");
  const nodesByTemplate = new Map(
    sceneFacts
      .filter((fact) => fact.kind === "csg.web.scene.node")
      .map((fact) => [String(fact.id ?? ""), fact]),
  );
  const videoAssetCids = new Set(
    sceneFacts
      .filter((fact) => fact.kind === "csg.web.media_asset" && Number(fact.kindCode ?? 0) === 1)
      .map((fact) => String(fact.assetCid ?? "")),
  );
  const graphicVideoSlot = sceneFacts.find((fact) => {
    if (fact.kind !== "csg.web.media_playback_slot") return false;
    if (!videoAssetCids.has(String(fact.assetCid ?? ""))) return false;
    const node = nodesByTemplate.get(String(fact.nodeTemplate ?? ""));
    return Number(node?.routeIndex ?? -1) === publishRouteIndex;
  });
  assert.equal(graphicVideoSlot, undefined, "publish_graphic route must not keep a video playback slot for its image upload entry");
}

function sceneRouteTextPaints(sceneFacts, routeId) {
  const index = sceneGraphIndex(sceneFacts);
  const route = index.routesById.get(routeId);
  assert(route, `${routeId} route must be materialized`);
  const routeIndex = Number(route.routeIndex ?? -1);
  return sceneFacts
    .filter((fact) => fact.kind === "csg.web.scene.paint" && Number(fact.routeIndex ?? -1) === routeIndex && fact.opKind === "text")
    .map((fact) => String(fact.text ?? ""))
    .filter((text) => text.length > 0);
}

function sceneRouteUnconditionalTextPaints(sceneFacts, routeId) {
  const index = sceneGraphIndex(sceneFacts);
  const route = index.routesById.get(routeId);
  assert(route, `${routeId} route must be materialized`);
  const routeIndex = Number(route.routeIndex ?? -1);
  return sceneFacts
    .filter((fact) => fact.kind === "csg.web.scene.paint" && Number(fact.routeIndex ?? -1) === routeIndex && fact.opKind === "text")
    .filter((fact) => !sceneNodeHasConditionalSelfOrAncestor(index, index.nodesByRouteAndId.get(`${routeIndex}:${Number(fact.nodeId ?? -1)}`)))
    .map((fact) => String(fact.text ?? ""))
    .filter((text) => text.length > 0);
}

function sceneRouteVisibleTextPaintsForState(sceneFacts, routeId, stateValues) {
  const index = sceneGraphIndex(sceneFacts);
  const route = index.routesById.get(routeId);
  assert(route, `${routeId} route must be materialized`);
  const routeIndex = Number(route.routeIndex ?? -1);
  return sceneFacts
    .filter((fact) => fact.kind === "csg.web.scene.paint" && Number(fact.routeIndex ?? -1) === routeIndex && fact.opKind === "text")
    .filter((fact) => sceneNodeVisibleForStateSelfOrAncestor(index, index.nodesByRouteAndId.get(`${routeIndex}:${Number(fact.nodeId ?? -1)}`), stateValues))
    .map((fact) => String(fact.text ?? ""))
    .filter((text) => text.length > 0);
}

function assertMarketplaceInitialRouteDoesNotStackOverlays(sceneFacts) {
  const index = sceneGraphIndex(sceneFacts);
  const route = index.routesById.get("marketplace_main");
  assert(route, "marketplace_main route must be materialized");
  const routeIndex = Number(route.routeIndex ?? -1);
  const routeText = sceneRouteVisibleTextPaintsForState(sceneFacts, "marketplace_main", {
    mode: "marketplace",
    pendingSocialPick: "false",
    showPaySheet: "false",
    showReviewConsole: "false",
  });
  const joinedText = routeText.join("\n");
  for (const hiddenOverlayText of [
    "购买",
    "支付渠道",
    "刷新核验状态",
    "已支付，提交凭证",
    "确认添加",
    "添加到节点消息页社交扩展栏后，将自动返回当前会话。",
  ]) {
    assert.equal(joinedText.includes(hiddenOverlayText), false, `marketplace_main initial route must not stack hidden overlay text: ${hiddenOverlayText}`);
  }
  assert.equal(routeText.filter((text) => text === "支付核验台").length, 1, "marketplace_main initial route must only render the payment console entry button");
  const reviewConsoleOpenHandler = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "marketplace_main" &&
    String(fact.handler ?? "").includes("setShowReviewConsole(true)")
  );
  assert(reviewConsoleOpenHandler, "marketplace_main payment console entry handler must be materialized");
  assert.equal(reviewConsoleOpenHandler.actionKind, "state_delta", "payment console entry must update showReviewConsole state, not navigate to another route");
  assert.equal(reviewConsoleOpenHandler.effect, "set:showReviewConsole=true", "payment console entry must only set showReviewConsole=true");
  assert.equal(reviewConsoleOpenHandler.targetRouteId ?? "", "", "payment console entry must not target governance_main");
  const reviewConsoleCloseHandler = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "marketplace_main" &&
    fact.propName === "onClick" &&
    String(fact.handler ?? "").includes("setShowReviewConsole(false)")
  );
  assert(reviewConsoleCloseHandler, "payment console close button must inherit the parent onClose callback");
  assert.equal(reviewConsoleCloseHandler.actionKind, "state_delta", "payment console close button must update showReviewConsole state");
  assert.equal(reviewConsoleCloseHandler.effect, "set:showReviewConsole=false", "payment console close button must only set showReviewConsole=false");
  const fullscreenFixedNodes = [...index.nodesByRouteAndId.values()].filter((node) =>
    Number(node.routeIndex ?? -1) === routeIndex &&
    !sceneNodeHasConditionalSelfOrAncestor(index, node) &&
    sceneNodeHasLayout(index, node, "position", "fixed") &&
    sceneNodeHasInsetZero(index, node)
  );
  assert.equal(fullscreenFixedNodes.length, 0, "marketplace_main initial route must not materialize hidden fullscreen fixed overlays");
}

function assertMarketplaceSocialPickerRouteMaterialized(sceneFacts) {
  const index = sceneGraphIndex(sceneFacts);
  const route = index.routesById.get("marketplace_social_picker");
  assert(route, "marketplace_social_picker route must be materialized");
  const routeIndex = Number(route.routeIndex ?? -1);
  const routeText = sceneRouteUnconditionalTextPaints(sceneFacts, "marketplace_social_picker");
  const joinedText = routeText.join("\n");
  assert(joinedText.includes("管理快捷入口"), "marketplace_social_picker route must render the social shortcut manager header");
  assert.equal(joinedText.includes("支付核验台"), false, "marketplace_social_picker route must not render the browse-mode payment console entry");
  assert.equal(joinedText.includes("确认添加"), false, "marketplace_social_picker initial route must not stack the pending shortcut confirmation dialog");

  const pickedText = sceneRouteVisibleTextPaintsForState(sceneFacts, "marketplace_social_picker", {
    pendingSocialPick: "bazi",
    showPaySheet: "false",
    showReviewConsole: "false",
  }).join("\n");
  assert(pickedText.includes("确认添加"), "marketplace_social_picker must render the pending shortcut confirmation dialog after an app card is selected");
  assert(pickedText.includes("添加到节点消息页社交扩展栏后，将自动返回当前会话。"), "social shortcut confirmation dialog must render the React body copy");
  assert(pickedText.includes("取消"), "social shortcut confirmation dialog must render the cancel action");

  for (const textStateRef of ["pendingSocialPick.icon", "pendingSocialPick.name", "pendingSocialPick.description"]) {
    const textNode = [...index.nodesByRouteAndId.values()].find((node) =>
      Number(node.routeIndex ?? -1) === routeIndex &&
      node.textStateRef === textStateRef &&
      sceneNodeVisibleForStateSelfOrAncestor(index, node, { pendingSocialPick: "bazi" })
    );
    assert(textNode, `social shortcut confirmation dialog must bind ${textStateRef}`);
  }

  const pickBaziHandler = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "marketplace_social_picker" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "pendingSocialPick" &&
    String(fact.effect ?? "").includes("set:pendingSocialPick=bazi") &&
    String(fact.effect ?? "").includes("set:pendingSocialPick.name=八字排盘")
  );
  assertSceneClickEventHasHitTarget(sceneFacts, pickBaziHandler, "marketplace_social_picker bazi app card");

  const confirmHandler = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "marketplace_social_picker" &&
    fact.handler === "handleConfirmSocialShortcut" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "social_added_apps_v1" &&
    fact.targetRouteId === "message_thread" &&
    String(fact.effect ?? "").includes("social_app:toggle_state:pendingSocialPick") &&
    String(fact.effect ?? "").includes("set:pendingSocialPick=false")
  );
  assertSceneClickEventHasNavigationHitTarget(sceneFacts, confirmHandler, "social shortcut confirmation confirm button");
  assert.equal(
    sceneNodeVisibleForStateSelfOrAncestor(index, index.nodesByRouteAndId.get(`${routeIndex}:${Number(confirmHandler?.nodeId ?? -1)}`), { pendingSocialPick: "bazi" }),
    true,
    "social shortcut confirmation confirm button must be hidden until pendingSocialPick is truthy",
  );

  const cancelHandler = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "marketplace_social_picker" &&
    fact.handler === "handleCancelSocialShortcut" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "pendingSocialPick" &&
    fact.targetRouteId === "message_thread" &&
    fact.effect === "set:pendingSocialPick=false" &&
    sceneNodeVisibleForStateSelfOrAncestor(index, index.nodesByRouteAndId.get(`${routeIndex}:${Number(fact.nodeId ?? -1)}`), { pendingSocialPick: "bazi" })
  );
  assertSceneClickEventHasNavigationHitTarget(sceneFacts, cancelHandler, "social shortcut confirmation cancel button");
}

function assertMarketplaceRouteEntryResetsOverlayState(sceneFacts) {
  const marketplaceEntry = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "home_app_channel" &&
    fact.targetRouteId === "marketplace_main"
  );
  assert(marketplaceEntry, "home_app_channel must expose the route edge into marketplace_main");
  assert.equal(marketplaceEntry.actionKind, "route", "marketplace_main entry must be a route action");
  for (const resetEffect of [
    "set:showPaySheet=false",
    "set:showReviewConsole=false",
    "set:pendingSocialPick=false",
  ]) {
    assert(String(marketplaceEntry.effect ?? "").includes(resetEffect), `marketplace_main entry must reset leaked overlay state: ${resetEffect}`);
  }
}

function assertMarketplaceSocialPickerReachableFromChatMorePanel(sceneFacts) {
  const openMorePanel = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "message_thread" &&
    fact.targetRouteId === "message_thread_more_panel_open"
  );
  assert(openMorePanel, "message_thread must route its more button into message_thread_more_panel_open");
  assert.equal(openMorePanel.actionKind, "route", "message_thread more button must be represented as a state-route edge");

  const pickerEntry = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "message_thread_more_panel_open" &&
    fact.targetRouteId === "marketplace_social_picker"
  );
  assert(pickerEntry, "message_thread_more_panel_open must expose the add shortcut edge into marketplace_social_picker");
  assert.equal(pickerEntry.actionKind, "route", "marketplace_social_picker entry must be a route action");
  for (const resetEffect of [
    "set:showPaySheet=false",
    "set:showReviewConsole=false",
    "set:pendingSocialPick=false",
  ]) {
    assert(String(pickerEntry.effect ?? "").includes(resetEffect), `marketplace_social_picker entry must reset leaked overlay state: ${resetEffect}`);
  }
}

function assertMessageThreadMorePanelActionModals(sceneFacts) {
  const index = sceneGraphIndex(sceneFacts);
  for (const { key, stateRef, actionKind, effect } of [
    { key: "redPacket", stateRef: "showRedPacketModal", actionKind: "state_delta", effect: "set:showRedPacketModal=true" },
    // location now captures a high-accuracy GPS fix via a native command (mirrors
    // materializer-smoke): actionKind=command, effect=location_capture:... — no longer a
    // bare set:showLocationModal=true state delta.
    { key: "location", stateRef: "showLocationModal", actionKind: "command", effect: "location_capture:chat:locationPreview:locationFetching:locationHint:showLocationModal:locationName" },
  ]) {
    const buttonProp = sceneFacts.find((fact) => {
      if (fact.kind !== "csg.web.scene.prop") return false;
      if (fact.routeId !== "message_thread_more_panel_open") return false;
      if (fact.propName !== "data-csg-static-item-key" || fact.propValue !== key) return false;
      const node = index.nodesByRouteAndId.get(`${Number(fact.routeIndex ?? -1)}:${Number(fact.nodeId ?? -1)}`);
      return node?.tagName === "button";
    });
    assert(buttonProp, `message_thread_more_panel_open must materialize the ${key} action button`);
    const handler = sceneFacts.find((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "message_thread_more_panel_open" &&
      fact.nodeId === buttonProp.nodeId &&
      fact.eventName === "click"
    );
    assert(handler, `message_thread_more_panel_open ${key} button must have a click handler`);
    assert.equal(handler.actionKind, actionKind, `message_thread_more_panel_open ${key} click actionKind must be ${actionKind}`);
    assert.equal(handler.stateRef, stateRef, `message_thread_more_panel_open ${key} click must target ${stateRef}`);
    assert.equal(handler.effect, effect, `message_thread_more_panel_open ${key} click effect must be ${effect}`);
  }
}

function assertMessageThreadRedPacketSendEffect(sceneFacts) {
  const effect = "chat_red_packet_send:messages:redPacketAmount:redPacketMessage:showRedPacketModal:showMorePanel:恭喜发财，大吉大利";
  const handler = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "message_thread_more_panel_open" &&
    fact.eventName === "click" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "messages" &&
    fact.effect === effect
  );
  assert(handler, "message_thread_more_panel_open must compile handleSendRedPacket to a retained red packet send effect");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "message_thread_more_panel_open" &&
    String(fact.effect ?? "").includes("handleSendRedPacket")
  ), false, "message_thread_more_panel_open must not leave handleSendRedPacket as an opaque invoke");
}

function assertMessageThreadLocationSendEffect(sceneFacts) {
  const effect = "chat_location_send:messages:locationName:locationFetching:locationHint:showLocationModal:showMorePanel:当前设备不支持 GPS 定位:GPS 定位失败，已发送手动位置";
  const handler = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "message_thread_more_panel_open" &&
    fact.eventName === "click" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "messages" &&
    fact.effect === effect
  );
  assert(handler, "message_thread_more_panel_open must compile handleSendLocation to a retained no-GPS fallback location effect");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "message_thread_more_panel_open" &&
    String(fact.effect ?? "").includes("handleSendLocation")
  ), false, "message_thread_more_panel_open must not leave handleSendLocation as an opaque invoke");
  const locationInput = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "message_thread_more_panel_open" &&
    fact.eventName === "change" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "locationName" &&
    (fact.effect === "set:locationName=e.target.value" || fact.effect === "set:locationName=event.target.value")
  );
  assert(locationInput, "message_thread_more_panel_open must bind locationName input to retained state");
}

// The location modal preview `{locationPreview || '等待定位'}` and the footer hint `{locationHint}`
// must materialize as retained text bindings whose refs MATCH the location_capture:chat writeback
// slots. Regression guard for the state-name mismatch where the capture wrote previewRef=locationName
// while the preview <p> bound locationPreview, so the popup was frozen on 等待定位 on a real GPS fix.
function assertMessageThreadLocationModalBindings(sceneFacts) {
  const routeId = "message_thread_more_panel_open";
  const captureHandler = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === routeId &&
    typeof fact.effect === "string" &&
    fact.effect.startsWith("location_capture:chat:")
  );
  assert(captureHandler, `${routeId} must carry a location_capture:chat command`);
  const parts = String(captureHandler.effect).split(":");
  // location_capture : chat : previewRef : statusRef : messageRef : openModalRef : nameRef
  const previewRef = parts[2];
  const messageRef = parts[4];
  const nameRef = parts[6];
  assert.equal(previewRef, "locationPreview", "location_capture:chat previewRef must be locationPreview");
  assert.equal(messageRef, "locationHint", "location_capture:chat messageRef must be locationHint");
  assert.equal(nameRef, "locationName", "location_capture:chat nameRef (send default) must be locationName");
  const textNodeFor = (ref) => sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.node" &&
    fact.nodeKind === "text" &&
    fact.routeId === routeId &&
    fact.textStateRef === ref
  );
  const previewNode = textNodeFor(previewRef);
  assert(previewNode, `${routeId} must materialize a preview text node bound to ${previewRef}`);
  assert.equal(previewNode.text, "等待定位", "location preview fallback text must be 等待定位");
  const hintNode = textNodeFor(messageRef);
  assert(hintNode, `${routeId} must materialize a hint text node bound to ${messageRef}`);
}

// Bazi 排盘 date inputs (`onChange={e => setYear(Number(e.target.value))}`) must lower to a
// state_delta carrying =e.target.value. Only then does the runtime treat the node as a focusable
// text field (WebSceneNodeAcceptsTextInput) so a tap registers a hit and raises the soft keyboard.
// Regression guard for the numeric-cast wrapper being dropped to an inert text_input:change command.
function assertBaziDateInputsAcceptTextInput(sceneFacts) {
  const routeId = "home_bazi_overlay_open";
  for (const stateRef of ["year", "month", "day"]) {
    const handler = sceneFacts.find((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === routeId &&
      fact.eventName === "change" &&
      fact.actionKind === "state_delta" &&
      fact.stateRef === stateRef &&
      typeof fact.effect === "string" &&
      fact.effect.includes("=e.target.value")
    );
    assert(handler, `${routeId} ${stateRef} date input must lower to a set:${stateRef}=e.target.value text-input state_delta (focusable/IME), not an inert text_input:change command`);
  }
}

function assertMessageThreadSynccastEffects(sceneFacts) {
  const expectedEffects = [
    "synccast_control:pause:chatId:isGroup:localPeerId:movieRoomState:movieStatusHint",
    "synccast_control:play:chatId:isGroup:localPeerId:movieRoomState:movieStatusHint",
    "synccast_refresh:chatId:isGroup:localPeerId:movieRoomState:movieStatusHint",
  ];
  for (const effect of expectedEffects) {
    const handler = sceneFacts.find((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "message_thread" &&
      fact.eventName === "click" &&
      fact.actionKind === "command" &&
      fact.stateRef === "movieRoomState" &&
      fact.effect === effect
    );
    assert(handler, `message_thread must compile synccast handler to retained command effect: ${effect}`);
  }
  for (const opaque of [
    "handleSynccastControl",
    "refreshSynccastState",
  ]) {
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "message_thread" &&
      String(fact.effect ?? "").includes(opaque)
    ), false, `message_thread must not leave ${opaque} as an opaque invoke`);
  }
}

function assertMessageThreadSendAndMoreButtonsAreStateSplit(sceneFacts) {
  const sendButton = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.node" &&
    fact.routeId === "message_thread" &&
    fact.tagName === "button" &&
    fact.conditionalStateRef === "inputText" &&
    fact.conditionalStateValue === "__truthy"
  );
  assert(sendButton, "message_thread must materialize the Send button for non-empty inputText");

  const sendIcon = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.node" &&
    fact.routeId === "message_thread" &&
    fact.tagName === "Send" &&
    fact.parentNodeId === sendButton.nodeId
  );
  assert(sendIcon, "message_thread Send button must keep its Send icon in the scene graph");

  const sendHandler = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "message_thread" &&
    fact.nodeId === sendButton.nodeId &&
    fact.eventName === "click" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "messages" &&
    fact.effect === "chat_text_send:messages:inputText:showMorePanel"
  );
  assert(sendHandler, "message_thread Send button must compile handleSendText to retained chat_text_send");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "message_thread" &&
    String(fact.effect ?? "").includes("handleSendText")
  ), false, "message_thread must not leave handleSendText as an opaque invoke");

  const moreButton = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.node" &&
    fact.routeId === "message_thread" &&
    fact.tagName === "button" &&
    fact.conditionalStateRef === "inputText" &&
    fact.conditionalStateValue === "__falsy"
  );
  assert(moreButton, "message_thread must keep the More button for empty inputText");

  const voiceMessageEffect = "chat_voice_message_unsupported:speechBusy:speechHint:当前设备不支持录音";
  const startSpeechEffect = "chat_speech_input_start_unsupported:speechBusy:speechSupported:isAsiConversation:speechHint:当前设备不支持麦克风 ASR:当前设备不支持录音";
  const videoCallUnsupportedEffect = "chat_video_call_unsupported:actionBlockHint:当前设备不支持 WebRTC 通话";
  const messagesScrollEffect = "chat_messages_scroll_stick_to_bottom:stickToBottomRef:48";
  const callMediaToggleNoOpEffect = "no_op:chat-call-media-toggle";
  const callOverlayEndEffect = "set:callOverlayState=ended;set:callErrorText=通话已结束";
  for (const routeId of ["message_thread", "message_thread_more_panel_open"]) {
    const messagesScrollHandler = sceneFacts.find((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === routeId &&
      fact.eventName === "scroll" &&
      fact.actionKind === "state_delta" &&
      fact.stateRef === "ref:stickToBottomRef" &&
      fact.effect === messagesScrollEffect
    );
    assert(messagesScrollHandler, `${routeId} messages scroller must compile handleMessagesScroll to retained stick-to-bottom ref effect`);
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === routeId &&
      String(fact.effect ?? "").includes("handleMessagesScroll")
    ), false, `${routeId} must not leave handleMessagesScroll as an opaque invoke`);

    const voiceMessageNodeProp = sceneFacts.find((fact) =>
      fact.kind === "csg.web.scene.prop" &&
      fact.routeId === routeId &&
      fact.propName === "data-csg-static-item-key" &&
      fact.propValue === "voiceMessage"
    );
    assert(voiceMessageNodeProp, `${routeId} must expose the voiceMessage more-panel entry`);
    const voiceMessageHandler = sceneFacts.find((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === routeId &&
      fact.nodeId === voiceMessageNodeProp.nodeId &&
      fact.eventName === "click" &&
      fact.actionKind === "state_delta" &&
      fact.stateRef === "speechHint" &&
      fact.effect === voiceMessageEffect
    );
    assert(voiceMessageHandler, `${routeId} voiceMessage entry must compile to retained unsupported-recording speech hint`);

    const startSpeechHandler = sceneFacts.find((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === routeId &&
      fact.eventName === "click" &&
      fact.actionKind === "state_delta" &&
      fact.stateRef === "speechHint" &&
      fact.effect === startSpeechEffect
    );
    assert(startSpeechHandler, `${routeId} microphone button must compile handleStartSpeechInput to retained unsupported speech hint`);
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === routeId &&
      String(fact.effect ?? "").includes("handleStartSpeechInput")
    ), false, `${routeId} must not leave handleStartSpeechInput as an opaque invoke`);

    for (const key of ["voiceCall", "videoCall"]) {
      const callNodeProp = sceneFacts.find((fact) =>
        fact.kind === "csg.web.scene.prop" &&
        fact.routeId === routeId &&
        fact.propName === "data-csg-static-item-key" &&
        fact.propValue === key
      );
      assert(callNodeProp, `${routeId} must expose the ${key} more-panel entry`);
      const callHandler = sceneFacts.find((fact) =>
        fact.kind === "csg.web.scene.event_handler" &&
        fact.routeId === routeId &&
        fact.nodeId === callNodeProp.nodeId &&
        fact.eventName === "click" &&
        fact.actionKind === "state_delta" &&
        fact.stateRef === "actionBlockHint" &&
        fact.effect === videoCallUnsupportedEffect
      );
      assert(callHandler, `${routeId} ${key} entry must compile to retained WebRTC unsupported hint`);
    }
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === routeId &&
      String(fact.effect ?? "").includes("handleMorePanelAction")
    ), false, `${routeId} must not leave more-panel action entries as opaque invokes`);
  }
  for (const routeId of ["message_thread", "message_thread_more_panel_open", "node_thread", "node_thread_more_panel_open"]) {
    const routeExists = sceneFacts.some((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === routeId);
    if (!routeExists) continue;
    const overlayPrimaryHandlers = sceneFacts.filter((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === routeId &&
      String(fact.handler ?? "").replace(/\s+/g, " ").trim() === "() => void handleCallOverlayPrimaryAction()"
    );
    assert(overlayPrimaryHandlers.length > 0, `${routeId} must expose the call overlay primary action`);
    assert(overlayPrimaryHandlers.every((fact) =>
      fact.actionKind === "state_delta" &&
      fact.stateRef === "callOverlayState" &&
      fact.effect === callOverlayEndEffect
    ), `${routeId} call overlay primary action must compile to retained hang-up UI state`);
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === routeId &&
      String(fact.effect ?? "").includes("handleCallOverlayPrimaryAction")
    ), false, `${routeId} must not leave call overlay primary action as opaque invoke`);

    const callToggleHandlers = sceneFacts.filter((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === routeId &&
      (fact.handler === "toggleMicrophone" || fact.handler === "toggleCamera")
    );
    assert(callToggleHandlers.length > 0, `${routeId} must expose call media toggle handlers when the overlay branch is retained`);
    assert(callToggleHandlers.every((fact) =>
      fact.actionKind === "command" &&
      fact.effect === callMediaToggleNoOpEffect
    ), `${routeId} call media toggles must compile to localStreamRef-null no-op`);
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === routeId &&
      (String(fact.effect ?? "").includes("invoke:toggleMicrophone") || String(fact.effect ?? "").includes("invoke:toggleCamera"))
    ), false, `${routeId} must not leave call media toggles as opaque invoke`);
  }
}

function assertConversationRowSwipeFacts(sceneFacts) {
  const bindingIds = sceneFacts
    .filter((fact) =>
      fact.kind === "csg.web.scene.prop" &&
      fact.routeId === "tab_messages" &&
      fact.propName === "data-csg-conversation-row-offset-id"
    )
    .map((fact) => String(fact.propValue ?? ""));
  if (bindingIds.length === 0) return;
  const effects = new Set(sceneFacts
    .filter((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "tab_messages")
    .map((fact) => String(fact.effect ?? "")));
  for (const itemId of bindingIds) {
    for (const expected of [
      `conversation_row_pointer_down:${itemId}`,
      `conversation_row_pointer_move:${itemId}`,
      `conversation_row_pointer_end:${itemId}:up`,
      `conversation_row_pointer_end:${itemId}:cancel`,
      `conversation_row_click:selectedId:${itemId}:message_thread`,
      `conversation_row_delete:conversations:selectedId:${itemId}`,
    ]) {
      assert(effects.has(expected), `tab_messages conversation row must emit structured effect ${expected}`);
    }
  }
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_messages" &&
    String(fact.effect ?? "").includes("draggingRef.current")
  ), false, "tab_messages conversation row drag handlers must not remain invoke effects");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_messages" &&
    String(fact.effect ?? "").includes("handleDeleteConversation")
  ), false, "tab_messages conversation delete handler must not remain an invoke effect");
}

function assertPublishTopicFacts(sceneFacts) {
  const editorRoutes = new Set(["publish_content", "publish_movie", "publish_graphic", "publish_music", "publish_novel"]);
  const hasPublishEditorRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    editorRoutes.has(String(fact.routeId ?? ""))
  );
  if (!hasPublishEditorRoute) return;
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    editorRoutes.has(String(fact.routeId ?? "")) &&
    fact.eventName === "click" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "content" &&
    fact.effect === "publish_topic_marker:content:activeTagTrigger"
  ), true, "publish pages must compile inline topic marker insertion into a structured effect");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    editorRoutes.has(String(fact.routeId ?? "")) &&
    (fact.eventName === "click" || fact.eventName === "keyUp" || fact.eventName === "select") &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "activeTagTrigger" &&
    fact.effect === "publish_tag_cursor:content:activeTagTrigger"
  ), true, "publish pages must compile content cursor sync into a structured effect");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    editorRoutes.has(String(fact.routeId ?? "")) &&
    (String(fact.effect ?? "").includes("invoke:handleContentCursorChange") ||
      String(fact.effect ?? "").includes("invoke:insertInlineTopicMarker"))
  ), false, "publish topic cursor and marker handlers must not remain invoke effects");
}

function assertNodeRemarkFacts(sceneFacts) {
  const hasNodeDetailRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "node_detail"
  );
  if (!hasNodeDetailRoute) return;
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "node_detail" &&
    fact.eventName === "click" &&
    fact.handler === "handleCancelRemark" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "remarkDraft" &&
    fact.effect === "node_remark_cancel:nodeRemarks:remarkDraft:editingRemark:nodeDetailPeerId"
  ), true, "node detail cancel remark must restore the saved remark draft and close edit mode");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "node_detail" &&
    fact.handler === "handleCancelRemark" &&
    (fact.effect === "set:editingRemark=false" || fact.effect === "text_input_reset:remarkDraft;set:editingRemark=false")
  ), false, "node detail cancel remark must not use the old partial reset effects");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "node_detail" &&
    fact.eventName === "click" &&
    fact.handler === "handleSaveRemark" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "nodeRemarks" &&
    fact.effect === "node_remark_save:nodeRemarks:remarkDraft:editingRemark:nodeDetailPeerId:unimaker_node_remarks_v1"
  ), true, "node detail save remark must compile to the native remark-save effect");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "node_detail" &&
    fact.handler === "handleSaveRemark" &&
    String(fact.effect ?? "").includes("invoke:handleSaveRemark")
  ), false, "node detail save remark must not remain an invoke effect");
}

function assertProfileDomainTransferFacts(sceneFacts) {
  const hasProfileRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "tab_profile"
  );
  if (!hasProfileRoute) return;
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.eventName === "click" &&
    fact.handler === "handleTransferDomain" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "domainTransferTarget" &&
    fact.effect === "profile_domain_transfer:domainTransferTarget:domainName:showDomainTransfer:domainError:请输入有效的目标地址或 PeerId"
  ), true, "profile domain transfer must lower to a structured state effect");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    String(fact.effect ?? "").includes("invoke:handleTransferDomain")
  ), false, "profile domain transfer must not remain an invoke fallback");
}

function assertProfileRegionPolicyRefreshFacts(sceneFacts) {
  const hasProfileRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "tab_profile"
  );
  if (!hasProfileRoute) return;
  const effect = "region_policy_refresh:regionPolicy:policyGroupId:isDomestic";
  const handler = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_profile" &&
    fact.eventName === "click" &&
    fact.actionKind === "command" &&
    fact.stateRef === "regionPolicy" &&
    fact.effect === effect &&
    fact.data?.action?.stopPropagation === true
  );
  assert(handler, "profile refresh IP must lower to a structured region policy command effect");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_profile" &&
    String(fact.effect ?? "").includes("ensureRegionPolicy(true).then(setRegionPolicy)")
  ), false, "profile refresh IP must not remain an opaque ensureRegionPolicy invoke");
}

function assertNodePublishedContentsRefreshFacts(sceneFacts) {
  const hasRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "node_published_content"
  );
  if (!hasRoute) return;
  const handlers = sceneFacts.filter((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "node_published_content" &&
    String(fact.handler ?? "").replace(/\s+/g, " ").trim() === "() => { void refreshSelectedNodeContents(selectedNodeContentOwner.peerId, true); }"
  );
  assert(handlers.length > 0, "node published content refresh button must expose refreshSelectedNodeContents handler");
  assert(handlers.every((fact) =>
    fact.actionKind === "command" &&
    fact.stateRef === "selectedNodeContents" &&
    fact.effect === "node_contents_refresh:selectedNodeContentOwner:selectedNodeContents:selectedNodeContentLoading:nativeError" &&
    fact.data?.action?.stateDeltas?.some((delta) => delta.stateRef === "selectedNodeContentLoading")
  ), "node published content refresh must compile to structured node_contents_refresh command");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "node_published_content" &&
    String(fact.effect ?? "").includes("invoke:refreshSelectedNodeContents")
  ), false, "node published content refresh must not remain opaque invoke");
}

function assertProfileRwadNfcReceiveToggleFacts(sceneFacts) {
  const hasProfileRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "tab_profile"
  );
  if (!hasProfileRoute) return;
  const effect = "rwad_nfc_receive_toggle:peerId:wallets:rwadNfcReceiveActive:rwadNfcReceiveBusy:rwadNfcReceiveExpiresAt:rwadSyncHint";
  const handlers = sceneFacts.filter((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_profile" &&
    fact.eventName === "click" &&
    String(fact.handler ?? "").replace(/\s+/g, " ").trim() === "() => { void handleToggleRwadNfcReceive(); }"
  );
  assert(handlers.length > 0, "profile RWAD NFC receive buttons must expose handleToggleRwadNfcReceive handlers");
  assert(handlers.every((fact) =>
    fact.actionKind === "command" &&
    fact.stateRef === "rwadNfcReceiveActive" &&
    fact.effect === effect &&
    fact.data?.action?.stateDeltas?.some((delta) => delta.stateRef === "rwadNfcReceiveBusy") &&
    fact.data?.action?.stateDeltas?.some((delta) => delta.stateRef === "rwadSyncHint")
  ), "profile RWAD NFC receive handlers must compile to structured rwad_nfc_receive_toggle commands");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_profile" &&
    String(fact.effect ?? "").includes("invoke:handleToggleRwadNfcReceive")
  ), false, "profile RWAD NFC receive must not remain opaque invoke");
}

function assertProfileClearPublishedContentsFacts(sceneFacts) {
  const hasProfileRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "tab_profile"
  );
  if (!hasProfileRoute) return;
  const effect = "clear_published_contents:peerId:clearPublishedJob:clearingPublished:publishedClearHint";
  const handlers = sceneFacts.filter((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_profile" &&
    fact.eventName === "click" &&
    String(fact.handler ?? "").replace(/\s+/g, " ").trim() === "handleClearPublishedContents"
  );
  assert(handlers.length > 0, "profile clear published button must expose handleClearPublishedContents");
  assert(handlers.every((fact) =>
    fact.actionKind === "command" &&
    fact.stateRef === "clearPublishedJob" &&
    fact.effect === effect &&
    fact.data?.action?.stateDeltas?.some((delta) => delta.stateRef === "clearingPublished") &&
    fact.data?.action?.stateDeltas?.some((delta) => delta.stateRef === "publishedClearHint")
  ), "profile clear published handler must compile to structured clear_published_contents command");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_profile" &&
    String(fact.effect ?? "").includes("invoke:handleClearPublishedContents")
  ), false, "profile clear published must not remain opaque invoke");
}

function assertProfileAddressDraftInputFacts(sceneFacts) {
  const hasProfileRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "tab_profile"
  );
  if (!hasProfileRoute) return;
  for (const field of ["receiver", "phone", "region", "detail"]) {
    const stateRef = `addressDraft.${field}`;
    const effect = `set:${stateRef}=e.target.value`;
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "tab_profile" &&
      fact.eventName === "change" &&
      fact.actionKind === "state_delta" &&
      fact.stateRef === stateRef &&
      fact.effect === effect
    ), true, `profile address ${field} input must lower to a structured state effect`);
  }
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_profile" &&
    String(fact.handler ?? "").includes("setAddressDraft((prev) => ({ ...prev,") &&
    String(fact.handler ?? "").includes("e.target.value") &&
    fact.actionKind !== "state_delta"
  ), false, "profile address field inputs must not remain text_input command fallbacks");
}

function assertProfileAddressTagFacts(sceneFacts) {
  const hasProfileRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "tab_profile"
  );
  if (!hasProfileRoute) return;
  const tags = ["学校", "家", "公司", "购物", "秒送/外卖", "自定义"];
  for (const tag of tags) {
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.paint" &&
      fact.routeId === "tab_profile" &&
      fact.text === tag
    ), true, `profile address tag ${tag} must render as a scene paint fact`);
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "tab_profile" &&
      fact.eventName === "click" &&
      fact.actionKind === "state_delta" &&
      fact.stateRef === "addressDraft.tag" &&
      fact.effect === `string_value_toggle:addressDraft.tag:${tag}`
    ), true, `profile address tag ${tag} must lower to a structured toggle effect`);
  }
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_profile" &&
    String(fact.handler ?? "").includes("prev.tag === tag ? '' : tag") &&
    fact.actionKind !== "state_delta"
  ), false, "profile address tag buttons must not remain invoke fallbacks");
}

function assertProfileAddressSaveFacts(sceneFacts) {
  const hasProfileRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "tab_profile"
  );
  if (!hasProfileRoute) return;
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_profile" &&
    fact.eventName === "click" &&
    fact.handler === "handleSaveAddress" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "addresses" &&
    fact.effect === "profile_address_save:addresses:addressDraft:editingAddressId:showAddressEditor:addressError:请完整填写收货信息:profile_addresses_v2"
  ), true, "profile address save must lower to a structured state effect");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_profile" &&
    String(fact.effect ?? "").includes("invoke:handleSaveAddress")
  ), false, "profile address save must not remain an invoke fallback");
}

function assertProfileAddressListFacts(sceneFacts) {
  const hasProfileRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "tab_profile"
  );
  if (!hasProfileRoute) return;
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.prop" &&
    fact.routeId === "tab_profile" &&
    fact.propName === "data-csg-profile-address-list-ref" &&
    fact.propValue === "addresses"
  ), true, "profile address list container must retain addresses repeat binding");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.prop" &&
    fact.routeId === "tab_profile" &&
    fact.propName === "data-csg-profile-address-storage-key" &&
    fact.propValue === "profile_addresses_v2"
  ), true, "profile address list container must retain React localStorage key");
}

function assertContentNodeDetailClickFacts(sceneFacts) {
  const hasNodeDetailRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "node_detail"
  );
  if (!hasNodeDetailRoute) return;
  const handlers = sceneFacts.filter((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.eventName === "click" &&
    fact.handler === "handleNodeClick"
  );
  assert(handlers.length > 0, "content node buttons must compile handleNodeClick facts");
  for (const handler of handlers) {
    assert.equal(handler.actionKind, "route", "content node click must remain a route action");
    assert.equal(handler.targetRouteId, "node_detail", "content node click must target node_detail");
    assert.equal(handler.stateRef, "nodeDetailPeerId", "content node click must expose nodeDetailPeerId as primary state");
    const effect = String(handler.effect ?? "");
    const match = /(?:^|;)home_node_detail:([A-Za-z0-9_-]+)(?:;|$)/.exec(effect);
    assert(match, "content node click must carry a concrete peer id in home_node_detail effect");
    assert(effect.includes("prevent-default"), "content node click must preserve preventDefault");
    assert(effect.includes("stop-propagation"), "content node click must preserve stopPropagation");
    const titleProp = sceneFacts.find((fact) =>
      fact.kind === "csg.web.scene.prop" &&
      fact.routeId === handler.routeId &&
      Number(fact.nodeId ?? -1) === Number(handler.nodeId ?? -2) &&
      fact.propName === "title"
    );
    assert(titleProp, "content node click source node must retain title peer id prop");
    assert.equal(titleProp.propValue, match[1], "content node click peer id must come from the button title prop");
    assert.equal(handler.data?.action?.stateDeltas?.[0]?.stateRef, "nodeDetailPeerId", "content node click data must expose nodeDetailPeerId delta");
  }
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    String(fact.effect ?? "").includes("invoke:handleNodeClick")
  ), false, "content node click must not remain invoke:handleNodeClick");
}

function assertContentDetailFreePaymentHandlers(sceneFacts) {
  const expected = new Map([
    ["() => { void refreshProofStatus(); }", "no_op:content-payment-free-content-refresh-proof"],
    ["() => { void preparePaymentFlow(); }", "no_op:content-payment-free-content"],
    ["() => { void handleSubmitPaymentProof(); }", "no_op:content-payment-free-content-submit-proof"],
  ]);
  for (const routeId of ["content_detail", realUniMakerSnapshotVideoDetailRouteId, realUniMakerSnapshotImageDetailRouteId]) {
    const hasRoute = sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.route" &&
      fact.routeId === routeId
    );
    if (!hasRoute) continue;
    for (const [handlerText, effect] of expected.entries()) {
      const handlers = sceneFacts.filter((fact) =>
        fact.kind === "csg.web.scene.event_handler" &&
        fact.routeId === routeId &&
        String(fact.handler ?? "").replace(/\s+/g, " ").trim() === handlerText
      );
      assert(handlers.length > 0, `${routeId} must expose retained content payment handler ${handlerText}`);
      assert(handlers.every((fact) =>
        fact.actionKind === "command" &&
        fact.effect === effect
      ), `${routeId} content payment handler ${handlerText} must compile to ${effect}`);
    }
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === routeId &&
      /refreshProofStatus|preparePaymentFlow|handleSubmitPaymentProof/.test(String(fact.handler ?? "")) &&
      String(fact.effect ?? "").startsWith("invoke:")
    ), false, `${routeId} content payment handlers must not remain opaque invokes`);
  }
}

function assertContentDetailDeleteFacts(sceneFacts) {
  const expected = new Map([
    ["content_detail", "node_published_content"],
    [realUniMakerSnapshotVideoDetailRouteId, "home_default"],
    [realUniMakerSnapshotImageDetailRouteId, "home_default"],
  ]);
  const retainedHandlers = sceneFacts.filter((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    expected.has(String(fact.routeId ?? "")) &&
    fact.eventName === "click" &&
    String(fact.handler ?? "").replace(/\s+/g, " ").trim() === "handleDelete"
  );
  const hasAnyContentDetailRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    expected.has(String(fact.routeId ?? ""))
  );
  if (!hasAnyContentDetailRoute) return;
  assert(retainedHandlers.length > 0, "content detail routes must expose at least one retained content delete handler when delete UI is materialized");
  for (const [routeId, closeRouteId] of expected.entries()) {
    const effect = `content_delete:content:deleteBusy:deleteMessage:${closeRouteId}`;
    const handlers = retainedHandlers.filter((fact) => fact.routeId === routeId);
    if (handlers.length === 0) continue;
    assert(handlers.every((fact) =>
      fact.actionKind === "command" &&
      fact.stateRef === "deleteBusy" &&
      fact.effect === effect &&
      fact.data?.action?.stateDeltas?.some((delta) => delta.stateRef === "deleteMessage")
    ), `${routeId} content delete must compile to structured content_delete command`);
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === routeId &&
      String(fact.effect ?? "").includes("invoke:handleDelete")
    ), false, `${routeId} content delete must not remain opaque invoke`);
  }
}

function assertProfileLicensePlateCallbackFacts(sceneFacts) {
  const hasProfileRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "tab_profile"
  );
  if (!hasProfileRoute) return;
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    String(fact.handler ?? "").includes("saveRideLicensePlate")
  ), false, "LicensePlateInput parent onChange callback must not be materialized as a DOM change invoke");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_profile" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "rideLicensePlate" &&
    String(fact.effect ?? "").startsWith("license_plate_key:rideLicensePlate:activeIndex:")
  ), true, "profile ride license plate keyboard must write rideLicensePlate through structured key effects");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_profile" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "rideLicensePlate" &&
    fact.effect === "license_plate_delete:rideLicensePlate:activeIndex"
  ), true, "profile ride license plate keyboard must write rideLicensePlate through structured delete effect");
}

function assertProfileDidAndTradingHandlerFacts(sceneFacts) {
  const hasProfileRoute = sceneFacts.some((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "tab_profile");
  if (hasProfileRoute) {
    const didOpenEvent = sceneFacts.find((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "tab_profile" &&
      fact.eventName === "click" &&
      String(fact.handler ?? "").replace(/\s+/g, " ").trim() === "handleOpenDidEntry" &&
      fact.actionKind === "command" &&
      fact.effect === "profile_bio_did_open_entry:didActionHint:didText:didBackupPayload:showDidBackupSheet:didRecoveryInput:showDidRecoverySheet"
    );
    assert.equal(Boolean(didOpenEvent), true, "profile DID entry button must lower to structured recovery-sheet command");
    assertSceneClickEventHasHitTarget(sceneFacts, didOpenEvent, "profile DID entry");
    const didImportEvent = sceneFacts.find((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "tab_profile" &&
      fact.eventName === "click" &&
      String(fact.handler ?? "").includes("handleImportDeviceDid") &&
      fact.actionKind === "command" &&
      sceneEffectHasSegment(fact.effect, "profile_bio_did_import:")
    );
    assert.equal(String(didImportEvent?.effect ?? ""), "guard_state:didBusy=__falsy;guard_state:didRecoveryInput=__trim_nonempty;profile_bio_did_import:didBusy:didActionHint:didText:peerId:didRecoveryInput:showDidRecoverySheet:didBackupPayload", "profile DID import button must lower to guarded native device-auth import command");
    assertSceneClickEventHasHitTarget(sceneFacts, didImportEvent, "profile DID import");
    const didCreateEvent = sceneFacts.find((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "tab_profile" &&
      fact.eventName === "click" &&
      String(fact.handler ?? "").replace(/\s+/g, " ").trim() === "() => { void handleCreateBioDid(); }" &&
      fact.actionKind === "command" &&
      fact.effect === "profile_bio_did_create:didBusy:didActionHint:didText:peerId:didBackupPayload:showDidRecoverySheet:showDidBackupSheet"
    );
    assert.equal(Boolean(didCreateEvent), true, "profile DID create button must lower to structured profile_bio_did_create command");
    assertSceneClickEventHasHitTarget(sceneFacts, didCreateEvent, "profile DID create");
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "tab_profile" &&
      fact.eventName === "change" &&
      String(fact.handler ?? "").includes("handleDidQrImageChange") &&
      fact.actionKind === "command" &&
      fact.effect === "file-selected:didQrImageInputRef:qr-text:didRecoveryInput"
    ), true, "profile DID QR input change must lower to qr-text file-selected command");
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "tab_profile" &&
      String(fact.effect ?? "").includes("invoke:handleOpenDidEntry")
    ), false, "profile DID entry must not remain opaque invoke");
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "tab_profile" &&
      String(fact.effect ?? "").includes("invoke:handleImportDeviceDid")
    ), false, "profile DID import must not remain opaque invoke");
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "tab_profile" &&
      String(fact.effect ?? "").includes("invoke:handleCreateBioDid")
    ), false, "profile DID create must not remain opaque invoke");
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "tab_profile" &&
      String(fact.effect ?? "").includes("invoke:(event) => { void handleDidQrImageChange(event); }")
    ), false, "profile DID QR change must not remain opaque invoke");
  }
  const tradingRoutes = new Set(["trading_main", "trading_crosshair"]);
  const hasTradingRoute = sceneFacts.some((fact) => fact.kind === "csg.web.scene.route" && tradingRoutes.has(String(fact.routeId ?? "")));
  if (hasTradingRoute) {
    const effect = "trading_refresh:selectedPair:interval:loading:dexHealth:loadError:pairs:candles:externalOrderBook:externalTrades:externalUpdatedAt";
    for (const routeId of tradingRoutes) {
      const handlers = sceneFacts.filter((fact) =>
        fact.kind === "csg.web.scene.event_handler" &&
        fact.routeId === routeId &&
        fact.eventName === "click" &&
        fact.handler === "handleRefresh"
      );
      if (handlers.length === 0) continue;
      assert(handlers.every((fact) =>
        fact.actionKind === "command" &&
        fact.stateRef === "loading" &&
        fact.effect === effect
      ), `${routeId} refresh button must lower to structured trading_refresh command`);
    }
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      tradingRoutes.has(String(fact.routeId ?? "")) &&
      String(fact.effect ?? "").includes("invoke:handleRefresh")
    ), false, "trading refresh must not remain opaque invoke");
  }
}

function assertStaticDisabledControlsAreNotInteractive(sceneFacts) {
  const disabledControlTags = new Set(["button", "input", "select", "textarea", "fieldset", "optgroup", "option"]);
  const nodes = new Map();
  const propsByNode = new Map();
  for (const fact of sceneFacts) {
    if (fact.kind !== "csg.web.scene.node") continue;
    nodes.set(`${fact.routeId}:${fact.nodeId}`, fact);
  }
  for (const fact of sceneFacts) {
    if (fact.kind !== "csg.web.scene.prop") continue;
    const key = `${fact.routeId}:${fact.nodeId}`;
    const props = propsByNode.get(key) ?? [];
    props.push(fact);
    propsByNode.set(key, props);
  }
  const disabledControls = [];
  for (const fact of sceneFacts) {
    if (fact.kind !== "csg.web.scene.prop") continue;
    if (fact.propName !== "disabled") continue;
    if (String(fact.propValue ?? "").trim() !== "true") continue;
    const node = nodes.get(`${fact.routeId}:${fact.nodeId}`);
    if (!node || !disabledControlTags.has(String(node.tagName ?? ""))) continue;
    const props = propsByNode.get(`${fact.routeId}:${fact.nodeId}`) ?? [];
    if (props.some((prop) => prop.propName === "data-csg-state-set-disabled-ref")) continue;
    disabledControls.push(`${fact.routeId}:${fact.nodeId}`);
  }
  if (disabledControls.length === 0) return;
  const disabledSet = new Set(disabledControls);
  const badEvents = sceneFacts.filter((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    disabledSet.has(`${fact.routeId}:${fact.nodeId}`)
  );
  assert.deepEqual(badEvents.map((fact) => `${fact.routeId}:${fact.nodeId}:${fact.handler}`), [], "statically disabled native controls must not export event handlers");
  const badHits = sceneFacts.filter((fact) =>
    fact.kind === "csg.web.scene.hit_target" &&
    disabledSet.has(`${fact.routeId}:${fact.nodeId}`)
  );
  assert.deepEqual(badHits.map((fact) => `${fact.routeId}:${fact.nodeId}:${fact.actionName}`), [], "statically disabled native controls must not export hit targets");
}

function assertPublishLiveDisabledStartFacts(sceneFacts) {
  const hasRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "publish_live"
  );
  if (!hasRoute) return;
  const liveStartHandler = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "publish_live" &&
    String(fact.handler ?? "").includes("handleStartLive")
  );
  assert.notEqual(liveStartHandler, undefined, "publish_live start button must export guarded live publish handler");
  assert.equal(
    liveStartHandler.effect,
    "guard_state:title=__truthy;guard_state:isStarting=__falsy;external-publish:live",
    "publish_live start handler must carry live external-publish payload",
  );
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.prop" &&
    fact.routeId === "publish_live" &&
    fact.nodeId === liveStartHandler.nodeId &&
    fact.propName === "disabled" &&
    String(fact.propValue ?? "").trim() === "true"
  ), false, "publish_live guarded start button must not materialize native disabled=true");
}

function assertPublishContentExternalPublishGuardFacts(sceneFacts) {
  const hasRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "publish_content"
  );
  if (!hasRoute) return;
  const publishHandler = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "publish_content" &&
    String(fact.effect ?? "").includes("external-publish:content")
  );
  assert.notEqual(publishHandler, undefined, "publish_content publish button must export the native external-publish handler");
  assert.equal(
    publishHandler.effect,
    "guard_state:title=__trim_nonempty;guard_state:mediaFiles=__array_nonempty;guard_state:publishNoticeOpen=__truthy;guard_state:isPublishing=__falsy;guard_state:isPreparingMedia=__falsy;external-publish:content;location_capture:publish:locationMessage:locationStatus:locationMessage",
    "publish_content native publish must match PWA canPublish and media-preparation guards",
  );
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.prop" &&
    fact.routeId === "publish_content" &&
    fact.nodeId === publishHandler.nodeId &&
    fact.propName === "disabled" &&
    String(fact.propValue ?? "").trim() === "true"
  ), false, "publish_content guarded publish button must not materialize native disabled=true");
}

function assertNodesToggleSelectAllFacts(sceneFacts) {
  const hasTabNodes = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "tab_nodes"
  );
  if (!hasTabNodes) return;
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_nodes" &&
    fact.handler === "toggleSelectAll" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "selectedPeerIds" &&
    fact.effect === "string_set_toggle_all_static:selectedPeerIds:filteredNodes:peerId"
  ), true, "tab_nodes toggleSelectAll must compile to structured selectedPeerIds effect");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_nodes" &&
    fact.effect === "invoke:toggleSelectAll"
  ), false, "tab_nodes toggleSelectAll must not remain invoke:toggleSelectAll");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.prop" &&
    fact.routeId === "tab_nodes" &&
    fact.propName === "data-csg-static-array" &&
    fact.propValue === "filteredNodes"
  ), true, "tab_nodes must carry filteredNodes static array metadata for toggleSelectAll runtime execution");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.prop" &&
    fact.routeId === "tab_nodes" &&
    fact.propName === "data-csg-static-item-peerId"
  ), true, "tab_nodes must carry peerId metadata for toggleSelectAll runtime execution");
}

function assertNodesSelectedPeerDerivedFacts(sceneFacts) {
  const hasTabNodes = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "tab_nodes"
  );
  if (!hasTabNodes) return;
  const propKey = (fact) => `${fact.routeId}:${fact.nodeId}`;
  const propsByNode = new Map();
  for (const fact of sceneFacts) {
    if (fact.kind !== "csg.web.scene.prop") continue;
    const key = propKey(fact);
    const props = propsByNode.get(key) ?? [];
    props.push(fact);
    propsByNode.set(key, props);
  }
  const selectedPeerNodes = sceneFacts.filter((fact) =>
    fact.kind === "csg.web.scene.prop" &&
    fact.routeId === "tab_nodes" &&
    fact.propName === "data-csg-state-set-ref" &&
    fact.propValue === "selectedPeerIds"
  );
  assert(selectedPeerNodes.length > 0, "tab_nodes selected peer rows must carry selectedPeerIds style bindings");
  for (const binding of selectedPeerNodes) {
    const props = propsByNode.get(propKey(binding)) ?? [];
    assert(props.some((prop) => prop.propName === "data-csg-state-set-item-kind" && prop.propValue === "string"), "selectedPeerIds style binding must be a string set item");
    assert(props.some((prop) => prop.propName === "data-csg-style-selected-background-color"), "selectedPeerIds style binding must carry selected background color");
    assert(props.some((prop) => prop.propName === "data-csg-style-unselected-background-color"), "selectedPeerIds style binding must carry unselected background color");
    assert(props.some((prop) => prop.propName === "data-csg-style-selected-border-color"), "selectedPeerIds style binding must carry selected border color");
    assert(props.some((prop) => prop.propName === "data-csg-style-unselected-border-color"), "selectedPeerIds style binding must carry unselected border color");
  }
  const disabledBinding = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.prop" &&
    fact.routeId === "tab_nodes" &&
    fact.propName === "data-csg-state-set-disabled-ref" &&
    fact.propValue === "selectedPeerIds"
  );
  assert(disabledBinding, "tab_nodes create group button must carry dynamic selectedPeerIds disabled binding");
  const disabledProps = propsByNode.get(propKey(disabledBinding)) ?? [];
  assert(disabledProps.some((prop) => prop.propName === "disabled" && prop.propValue === "true"), "dynamic disabled button must preserve initial disabled=true state");
  assert(disabledProps.some((prop) => prop.propName === "data-csg-style-selected-background-color"), "dynamic disabled button must carry selected background color");
  assert(disabledProps.some((prop) => prop.propName === "data-csg-style-unselected-background-color"), "dynamic disabled button must carry unselected background color");
  assert(disabledProps.some((prop) => prop.propName === "data-csg-style-selected-color"), "dynamic disabled button must carry selected text color");
  assert(disabledProps.some((prop) => prop.propName === "data-csg-style-unselected-color"), "dynamic disabled button must carry unselected text color");
  const createGroupHandler = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_nodes" &&
    fact.nodeId === disabledBinding.nodeId &&
    fact.handler === "handleCreateGroup"
  );
  assert(createGroupHandler, "dynamic create group button must retain its click handler after selectedPeerIds enables it");
  assert(createGroupHandler.actionKind === "command", "dynamic create group button must be a host command");
  assert(createGroupHandler.effect === "social_group_create_selected:selectedPeerIds:filteredNodes:peerId", "handleCreateGroup must lower to structured social group command");
  assert(!String(createGroupHandler.effect ?? "").startsWith("invoke:"), "handleCreateGroup must not regress to invoke fallback");
  assert(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.hit_target" &&
    fact.routeId === "tab_nodes" &&
    fact.nodeId === disabledBinding.nodeId
  ), true, "dynamic create group button must retain its hit target after selectedPeerIds enables it");
  const countBinding = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.prop" &&
    fact.routeId === "tab_nodes" &&
    fact.propName === "data-csg-state-set-count-ref" &&
    fact.propValue === "selectedPeerIds"
  );
  assert(countBinding, "tab_nodes selected count text must carry selectedPeerIds count binding");
  const countProps = propsByNode.get(propKey(countBinding)) ?? [];
  assert(countProps.some((prop) => prop.propName === "data-csg-state-set-count-prefix" && prop.propValue === "已选择 "), "selected count text must preserve prefix");
  assert(countProps.some((prop) => prop.propName === "data-csg-state-set-count-suffix" && prop.propValue === " 个"), "selected count text must preserve suffix");
}

function assertPublishProductCsvFacts(sceneFacts) {
  const hasPublishProductRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "publish_product"
  );
  if (!hasPublishProductRoute) return;
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "publish_product" &&
    fact.eventName === "click" &&
    fact.actionKind === "command" &&
    fact.effect === "file-picker:csvInputRef:text-document:product-csv:csvText"
  ), true, "publish product CSV picker click must request product-csv result mode");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "publish_product" &&
    fact.eventName === "change" &&
    fact.handler === "handleCsvSelect" &&
    fact.actionKind === "command" &&
    fact.effect === "file-selected:csvInputRef:product-csv:csvText"
  ), true, "publish product CSV input change must compile to product-csv file-selected effect");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "publish_product" &&
    String(fact.effect ?? "").includes("invoke:handleCsvSelect")
  ), false, "publish product CSV input change must not remain invoke:handleCsvSelect");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.node" &&
    fact.routeId === "publish_product" &&
    fact.conditionalStateRef === "csvPreview" &&
    fact.conditionalStateValue === "__truthy"
  ), true, "publish product CSV preview block must materialize with csvPreview visibility");
  for (const stateRef of ["csvFileName", "csvPreview.productCount", "csvPreview.skuCount", "csvPreview.firstTitle"]) {
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.node" &&
      fact.routeId === "publish_product" &&
      fact.nodeKind === "text" &&
      fact.textStateRef === stateRef
    ), true, `publish product CSV UI must bind text state ${stateRef}`);
  }
}

function assertPublishFoodCameraAddImageFacts(sceneFacts) {
  const route = sceneFacts.find((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "publish_food");
  if (!route) return;
  const routeIndex = Number(route.routeIndex);
  // React truth (PublishFoodPage.tsx:135-140): `{images.length < 9 && (<button onClick={() =>
  // fileInputRef.current?.click()}>…)}` — the add-image camera button must stay a live
  // runtime gate on the images array, not a static drop or freeze.
  const cameraButton = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.node" &&
    Number(fact.routeIndex ?? -1) === routeIndex &&
    fact.tagName === "button" &&
    fact.conditionalStateRef === "images" &&
    fact.conditionalStateValue === "__array_length_lt:9"
  );
  assert(cameraButton, "publish_food camera add-image button must materialize under images.length<9 runtime gate");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    Number(fact.routeIndex ?? -1) === routeIndex &&
    Number(fact.nodeId ?? -1) === Number(cameraButton.nodeId) &&
    fact.eventName === "click" &&
    fact.actionKind === "command" &&
    fact.effect === "file-picker:fileInputRef:image:data-url-array-append:images"
  ), true, "publish_food camera button click must open the image file picker appending to images");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    Number(fact.routeIndex ?? -1) === routeIndex &&
    fact.eventName === "change" &&
    fact.handler === "handleImageSelect" &&
    fact.effect === "file-selected:fileInputRef:data-url-array-append:images"
  ), true, "publish_food file input change must append selected images to the images array state");
}

function assertPublishProductModeBranchGuardFacts(sceneFacts) {
  const route = sceneFacts.find((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "publish_product");
  if (!route) return;
  // React truth (PublishProductPage.tsx:232-234,248): canPublish = mode==='csv'
  //   ? csvText.length>0 && csvPreview!==null
  //   : title.trim().length>0 && Number.isFinite(parseFloat(price)) && parseFloat(price)>0;
  // both mode branches must survive as conditional guard_when groups — folding by the mode
  // initial value would permanently lock the manual-mode publish button.
  const publishHandler = sceneFacts.find((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "publish_product" &&
    String(fact.effect ?? "").includes("external-publish:product")
  );
  assert(publishHandler, "publish_product publish button must export the native external-publish handler");
  assert.equal(
    publishHandler.effect,
    "guard_any:mode=csv,csvText=__truthy,csvPreview=__truthy|mode=__not:csv,title=__trim_nonempty,price=__num_positive;guard_state:isPublishing=__falsy;external-publish:product",
    "publish_product publish button must carry both csv and manual mode guard groups",
  );
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.prop" &&
    fact.routeId === "publish_product" &&
    fact.nodeId === publishHandler.nodeId &&
    fact.propName === "disabled" &&
    String(fact.propValue ?? "").trim() === "true"
  ), false, "publish_product guarded publish button must not materialize native disabled=true");
  // Mode tabs must stay live state deltas so the runtime can actually switch branches.
  for (const mode of ["csv", "manual"]) {
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "publish_product" &&
      fact.eventName === "click" &&
      fact.actionKind === "state_delta" &&
      fact.effect === `set:mode=${mode}`
    ), true, `publish_product mode tab must switch mode to ${mode}`);
  }
  // Manual-mode form: the branch block gates on mode==='manual' equality, and the
  // title/price inputs write their states.
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.node" &&
    fact.routeId === "publish_product" &&
    fact.conditionalStateRef === "mode" &&
    fact.conditionalStateValue === "manual"
  ), true, "publish_product manual mode block must materialize under mode=manual equality condition");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.node" &&
    fact.routeId === "publish_product" &&
    fact.conditionalStateRef === "mode" &&
    fact.conditionalStateValue === "csv"
  ), true, "publish_product csv mode block must materialize under mode=csv equality condition");
  for (const stateRef of ["title", "price"]) {
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "publish_product" &&
      fact.eventName === "change" &&
      fact.actionKind === "state_delta" &&
      fact.effect === `set:${stateRef}=e.target.value`
    ), true, `publish_product manual form must bind the ${stateRef} input to state`);
  }
}

function assertMinecraftResetWorldFacts(sceneFacts) {
  const hasMinecraftRoute = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.route" &&
    fact.routeId === "game_minecraft"
  );
  if (!hasMinecraftRoute) return;
  const expected = "set:placedCubes=[];set:removedKeys=[];set:particles=[]";
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "game_minecraft" &&
    fact.eventName === "click" &&
    fact.actionKind === "state_delta" &&
    fact.stateRef === "placedCubes" &&
    fact.effect === expected
  ), true, "game_minecraft resetWorld must compile to deterministic retained state resets");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "game_minecraft" &&
    String(fact.effect ?? "").includes("resetWorld")
  ), false, "game_minecraft resetWorld handler must not remain an invoke effect");
}

function assertGameRestartFacts(sceneFacts) {
  const specs = [
    {
      routeId: "game_mahjong",
      tail: ";set:selectedTile=null;set:autoPlaying=false",
      message: "game_mahjong restart must reset normal-route ready game, selectedTile and autoPlaying",
      assertGame(game) {
        assert.equal(Array.isArray(game.hands), true, "game_mahjong restart game must include hands");
        assert.equal(game.hands[0].length, 14, "game_mahjong restart local hand must contain the initial drawn tile");
        assert.equal(game.wall.length, 83, "game_mahjong restart wall must have one tile drawn");
        assert.equal(game.currentPlayer, 0, "game_mahjong restart currentPlayer must be 0");
        assert.equal(game.phase, "PLAYING", "game_mahjong restart phase must be PLAYING");
      },
    },
    {
      routeId: "game_werewolf",
      tail: ";set:selectedTarget=null;set:poisonTarget=null;set:showPoisonPicker=false;set:isRevealed=false",
      message: "game_werewolf restart must reset game and local picker state",
      assertGame(game) {
        assert.equal(Array.isArray(game.players), true, "game_werewolf restart game must include players");
        assert.equal(game.players.length, 9, "game_werewolf restart game must include 9 seats");
        assert.equal(game.phase, "ROLE_REVEAL", "game_werewolf restart phase must be ROLE_REVEAL");
        assert.equal(game.humanId, 0, "game_werewolf restart humanId must be 0");
      },
    },
    {
      routeId: "game_xiangqi",
      tail: ";set:legalMoves=[];set:thinking=false",
      message: "game_xiangqi restart must reset single-player game, legalMoves and thinking",
      assertGame(game) {
        assert.equal(Array.isArray(game.board), true, "game_xiangqi restart game must include board");
        assert.equal(game.board.length, 10, "game_xiangqi restart board must have 10 rows");
        assert.equal(game.board.every((row) => Array.isArray(row) && row.length === 9), true, "game_xiangqi restart board rows must have 9 columns");
        assert.equal(game.currentSide, "red", "game_xiangqi restart currentSide must be red");
        assert.equal(game.phase, "PLAYING", "game_xiangqi restart phase must be PLAYING");
      },
    },
  ];
  for (const spec of specs) {
    const hasRoute = sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.route" &&
      fact.routeId === spec.routeId
    );
    if (!hasRoute) continue;
    const fact = sceneFacts.find((candidate) =>
      candidate.kind === "csg.web.scene.event_handler" &&
      candidate.routeId === spec.routeId &&
      candidate.eventName === "click" &&
      candidate.handler === "restart" &&
      candidate.actionKind === "state_delta" &&
      candidate.stateRef === "game" &&
      String(candidate.effect ?? "").startsWith("set:game={") &&
      String(candidate.effect ?? "").endsWith(spec.tail)
    );
    assert.notEqual(fact, undefined, spec.message);
    const effect = String(fact.effect);
    const separator = effect.indexOf(";");
    assert.notEqual(separator, -1, `${spec.routeId} restart effect must include follow-up state resets`);
    spec.assertGame(JSON.parse(effect.slice("set:game=".length, separator)));
    assert.equal(sceneFacts.some((candidate) =>
      candidate.kind === "csg.web.scene.event_handler" &&
      candidate.routeId === spec.routeId &&
      String(candidate.effect ?? "").includes("invoke:restart")
    ), false, `${spec.routeId} restart handler must not remain an invoke effect`);
  }
}

function assertTradingSubmitOrderFacts(sceneFacts) {
  const expected = "set:orderNotice=请先连接 RWAD 钱包用于 DEX 签名。";
  for (const routeId of ["trading_main", "trading_crosshair"]) {
    const hasRoute = sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.route" &&
      fact.routeId === routeId
    );
    if (!hasRoute) continue;
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.prop" &&
      fact.routeId === routeId &&
      fact.propName === "disabled" &&
      fact.propValue === "true"
    ), true, `${routeId} ASI session button must materialize initial disabled=true when dexSigner is null`);
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === routeId &&
      String(fact.handler ?? "").includes("toggleAsiSession")
    ), false, `${routeId} disabled ASI session button must not export toggleAsiSession handler`);
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.node" &&
      fact.routeId === routeId &&
      fact.nodeKind === "text" &&
      fact.textStateRef === "orderNotice"
    ), true, `${routeId} must expose orderNotice text binding`);
    for (const side of ["BUY", "SELL"]) {
      assert.equal(sceneFacts.some((fact) =>
        fact.kind === "csg.web.scene.event_handler" &&
        fact.routeId === routeId &&
        fact.handler === `() => { void submitOrder('${side}'); }` &&
        fact.eventName === "click" &&
        fact.actionKind === "state_delta" &&
        fact.stateRef === "orderNotice" &&
        fact.effect === expected
      ), true, `${routeId} submitOrder(${side}) must compile to deterministic no-signer orderNotice`);
      assert.equal(sceneFacts.some((fact) =>
        fact.kind === "csg.web.scene.event_handler" &&
        fact.routeId === routeId &&
        fact.handler === `() => { void submitOrder('${side}'); }` &&
        String(fact.effect ?? "").includes(`submitOrder('${side}')`)
      ), false, `${routeId} submitOrder(${side}) must not remain an invoke effect`);
    }
  }
}

function sceneRouteEdgeKey(fact) {
  return `${Number(fact.routeIndex)}:${Number(fact.nodeId)}:${String(fact.targetRouteId ?? "")}`;
}

function assertEveryRouteEdgeHasStructuredHitTarget(sceneFacts) {
  const routesById = new Set(sceneFacts
    .filter((fact) => fact.kind === "csg.web.scene.route")
    .map((fact) => String(fact.routeId ?? "")));
  const edges = sceneFacts.filter((fact) => fact.kind === "csg.web.scene.route_edge");
  const rawEdgeKeys = new Set();
  const edgeKeys = new Set();
  for (const edge of edges) {
    assert(routesById.has(String(edge.routeId ?? "")), `route edge source route must resolve: ${String(edge.routeId ?? "")}`);
    const key = sceneRouteEdgeKey(edge);
    assert.equal(rawEdgeKeys.has(key), false, `route edge must be unique: ${key}`);
    rawEdgeKeys.add(key);
    if (routesById.has(String(edge.targetRouteId ?? ""))) edgeKeys.add(key);
  }

  const hitTargetCounts = new Map();
  for (const hitTarget of sceneFacts) {
    if (hitTarget.kind !== "csg.web.scene.hit_target" || hitTarget.targetKind !== "route") continue;
    const key = sceneRouteEdgeKey(hitTarget);
    assert(rawEdgeKeys.has(key), `route hit target must have a matching route edge: ${key}`);
    if (!routesById.has(String(hitTarget.targetRouteId ?? ""))) continue;
    hitTargetCounts.set(key, (hitTargetCounts.get(key) ?? 0) + 1);
  }
  for (const key of edgeKeys) {
    assert.equal(hitTargetCounts.get(key) ?? 0, 1, `route edge must have exactly one structured route hit target: ${key}`);
  }

  const hitRectCounts = new Map();
  for (const hitRect of sceneFacts) {
    if (hitRect.kind !== "csg.web.scene.route_hit_rect") continue;
    const key = sceneRouteEdgeKey(hitRect);
    assert(edgeKeys.has(key), `route hit rect must have a matching route edge: ${key}`);
    assert.equal(hitTargetCounts.get(key) ?? 0, 1, `route hit rect must be backed by a structured route hit target: ${key}`);
    assert(Number(hitRect.width) > 0 && Number(hitRect.height) > 0, `route hit rect must have positive size: ${key}`);
    hitRectCounts.set(key, (hitRectCounts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of hitRectCounts.entries()) {
    assert.equal(count, 1, `route hit rect must be unique: ${key}`);
  }
}

function assertGlyphSdfPrecomputeRleParserSmoke() {
  const parsed = parseSceneGlyphSdfPrecomputeOutput([
    "csg_scene_glyph_sdf_atlas_v2",
    "atlas_stride", "8",
    "glyph_stride", "12",
    "run_stride", "9",
    "run_glyph_stride", "2",
    "atlas_entry_count", "1",
    "glyph_count", "1",
    "run_count", "1",
    "run_glyph_count", "1",
    "atlas_len", "8",
    "atlas_begin", "1", "0", "0", "0", "0", "0", "0", "0", "atlas_end",
    "glyph_len", "12",
    "glyph_begin", "65", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "glyph_end",
    "run_len", "9",
    "run_begin", "1", "0", "0", "0", "0", "0", "0", "0", "0", "run_end",
    "run_glyph_len", "2",
    "run_glyph_begin", "0", "0", "run_glyph_end",
    "pixels_len", "6",
    "pixels_rle_begin", "0", "3", "255", "2", "7", "1", "pixels_rle_end",
    "",
  ].join("\n"));
  assert.deepEqual(parsed.pixels, [0, 0, 0, 255, 255, 7], "glyph SDF RLE pixels must decode to exact bytes");
}

function assertGlyphSdfPrecomputePixelFileParserSmoke() {
  const pixelPath = join(smokeRoot, "glyph-pixels-parser-smoke.bin");
  mkdirSync(smokeRoot, { recursive: true });
  writeFileSync(pixelPath, Buffer.from([0, 4, 255, 7]));
  const parsed = parseSceneGlyphSdfPrecomputeOutput([
    "csg_scene_glyph_sdf_atlas_v2",
    "atlas_stride", "8",
    "glyph_stride", "12",
    "run_stride", "9",
    "run_glyph_stride", "2",
    "atlas_entry_count", "1",
    "glyph_count", "1",
    "run_count", "1",
    "run_glyph_count", "1",
    "atlas_len", "8",
    "atlas_begin", "1", "0", "0", "0", "0", "0", "0", "0", "atlas_end",
    "glyph_len", "12",
    "glyph_begin", "65", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "glyph_end",
    "run_len", "9",
    "run_begin", "1", "0", "0", "0", "0", "0", "0", "0", "0", "run_end",
    "run_glyph_len", "2",
    "run_glyph_begin", "0", "0", "run_glyph_end",
    "pixels_len", "4",
    "pixels_file", pixelPath,
    "",
  ].join("\n"));
  assert(Buffer.isBuffer(parsed.pixels), "glyph SDF pixel file parser must preserve bytes as Buffer");
  assert(parsed.pixels.equals(Buffer.from([0, 4, 255, 7])), "glyph SDF pixel file must decode to exact bytes");
}

function assertMobileShellGlyphSdfShaderRangeContract() {
  const sourceText = readFileSync(join(repoRoot, "src", "core", "tooling", "mobile_shell_codegen.cheng"), "utf8");
  const correctedRangeCount = sourceText.match(/glUniform1f\(s_gl_text_px_range_loc, 2\.0f \* \(float\)glyph_atlas->px_range\);/g)?.length ?? 0;
  assert(correctedRangeCount >= 2, "Android host text SDF shader must decode the full signed distance range");
  assert.doesNotMatch(sourceText, /glUniform1f\(s_gl_text_px_range_loc, \(float\)glyph_atlas->px_range\);/, "Android host text SDF shader must not use half-range alpha decoding");
  const directGlyphLookupCount = sourceText.match(/&s_glyph_sdf_glyphs\[glyph_id - 1\]/g)?.length ?? 0;
  const directRunLookupCount = sourceText.match(/&s_glyph_sdf_runs\[glyph_run_id - 1\]/g)?.length ?? 0;
  assert(directGlyphLookupCount >= 2, "mobile hosts must resolve contiguous glyph ids by exact O(1) index");
  assert(directRunLookupCount >= 2, "mobile hosts must resolve contiguous glyph-run ids by exact O(1) index");
  assert.doesNotMatch(sourceText, /s_glyph_sdf_glyphs\[i\]\.glyph_id == glyph_id/, "mobile glyph lookup must not linearly scan the full atlas for every drawn glyph");
  assert.doesNotMatch(sourceText, /s_glyph_sdf_runs\[i\]\.glyph_run_id == glyph_run_id/, "mobile glyph-run lookup must not linearly scan every run for each text command");
  const touchDrainBody = sourceText.match(/static int cheng_android_drain_input_ring\(ChengAndroidShellRuntime\* runtime\) \{\{[\s\S]*?\n    \}\}\n\n    static jboolean native_tick/)?.[0] ?? "";
  assert.match(touchDrainBody, /cheng_android_touch_trace_enabled\(\)/, "Android touch diagnostics must call the explicit runtime trace gate");
  assert.match(sourceText, /if \(touchTraceEnabled\) \{\{[\s\S]*Log\.i\("cheng-mobile-shell", "touch event action=/, "Android UI-thread touch logs must share the explicit trace gate");
  assert.match(sourceText, /s_touch_trace_enabled = __system_property_get\("debug\.cheng\.touch\.trace"[\s\S]*return s_touch_trace_enabled;/, "Android host must cache the touch trace property once per process");
  assert.match(sourceText, /s_touch_deep_trace_enabled = __system_property_get\("debug\.cheng\.touch\.deep"[\s\S]*return s_touch_deep_trace_enabled;/, "expensive touch FFI diagnostics must require a separate deep-trace property");
  assert.match(touchDrainBody, /if \(!touch_deep_trace_enabled\) \{\{[\s\S]*input_touch action=%d dur_us=%lld[\s\S]*continue;/, "lightweight touch timing must skip deep debug probes and formatting");
  assert.match(sourceText, /tap_trace t1[\s\S]*tap_trace t2 frame=%d/, "tap reaction timing must use dedicated pending-tap t1/t2 markers");
  assert.match(touchDrainBody, /if \(!touch_trace_enabled\) \{\{[\s\S]*?continue;/, "production touch dispatch must skip debug FFI probes and log formatting");
  assert.doesNotMatch(touchDrainBody, /invalidate_cached_compositor_frame\("input_event"\)/, "touch dispatch must not invalidate compositor caches before knowing that state changed");
  assert.match(touchDrainBody, /s_input_events_since_tick\+\+;/, "Android input dispatch must retain processed events until the next native tick");
  assert.match(touchDrainBody, /drained_event_count > 0 && s_app_needs_frame != NULL && s_app_needs_frame\(runtime->app_id\) != 0[\s\S]*s_input_pending_frame_invalidation = 1;/, "input drain must request compositor invalidation only when Cheng requests a new frame");
  assert.match(sourceText, /int drained_input_events = s_input_events_since_tick;[\s\S]*s_input_events_since_tick = 0;[\s\S]*if \(s_input_pending_frame_invalidation\)/, "native tick must consume the cross-drain input and invalidation signals exactly once");
}

function assertCoreRuntimePerfContracts() {
  const fontText = readFileSync(join(repoRoot, "src", "core", "runtime", "web_font_runtime.cheng"), "utf8");
  const fingerprintBody = fontText.match(/fn WebFontDataFingerprint\(data: int32\[\]\): int32 =[\s\S]*?\n\n/)?.[0] ?? "";
  assert.match(fingerprintBody, /directoryByteCount = 12 \+ tableCount \* 16[\s\S]*for i in 0\.\.<directoryByteCount:/, "font face fingerprint must hash the SFNT directory, not every byte in a multi-megabyte CJK subset");
  assert.doesNotMatch(fingerprintBody, /for i in 0\.\.<data\.len:/, "font face startup must not rescan the complete font payload");

  const layoutText = readFileSync(join(repoRoot, "src", "core", "runtime", "web_layout_runtime.cheng"), "utf8");
  const sceneText = readFileSync(join(repoRoot, "src", "core", "runtime", "web_scene_runtime.cheng"), "utf8");
  assert.match(layoutText, /firstBoxIndexByNodeId: int32\[\][\s\S]*visibleBoxIndexByNodeId: int32\[\]/, "layout runtime must retain exact node-to-box indexes");
  assert.match(layoutText, /fn WebLayoutFindBestBoxIndex\(tree: var WebLayoutTree, nodeId: int32\): int32 =/, "layout runtime must expose indexed best-box lookup");
  assert.match(sceneText, /fn WebSceneFindLayoutBoxIndex\(tree: var layout\.WebLayoutTree, nodeId: int32\): int32 =[\s\S]*return layout\.WebLayoutFindBestBoxIndex\(tree, nodeId\)/, "scene paint projection must use indexed layout-box lookup");
}

assert.equal(existsSync(smokeRoot), false, `smoke root collision: ${smokeRoot}`);
mkdirSync(smokeRoot, { recursive: true });

try {
  assertGlyphSdfPrecomputeRleParserSmoke();
  assertGlyphSdfPrecomputePixelFileParserSmoke();
  assertMobileShellGlyphSdfShaderRangeContract();
  assertCoreRuntimePerfContracts();

  await runOneClick(defaultOut, []);
  assertDefaultOutputs(defaultOut);

  await runOneClick(fullOut, ["--full-report"]);
  assertFullReportOnlyWhenRequested(defaultOut, fullOut);
  await assertFontSubsetSmoke();
  await assertDefaultFontCascadeSmoke();
  await assertOneClickFontMaterializeSmoke(fontOut);
  await assertOneClickGlyphCacheHitSmoke(fontCacheHitOut);
  await assertOneClickHomeMediaLayoutSmoke(homeMediaLayoutOut);
  await assertOneClickPublishGraphicSmoke(publishGraphicOut);
  await assertOneClickMarketplaceInitialSmoke(marketplaceInitialOut);

  process.stdout.write("unimaker-one-click-output-smoke ok\n");
} catch (err) {
  if (terminatingSignal) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 600));
  }
  throw err;
} finally {
  cleanupSmokeRoot();
}

function parseSmokeArgs(args) {
  const parsed = { keepIntermediates: false };
  for (const arg of args) {
    if (arg === "--keep-intermediates" || arg === "--keep-debug-artifacts") {
      parsed.keepIntermediates = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function cleanupSmokeRoot() {
  if (smokeOptions.keepIntermediates) return;
  rmSync(smokeRoot, { recursive: true, force: true });
}

function installSmokeCleanupHooks() {
  process.once("exit", cleanupSmokeRoot);
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

async function runOneClick(outDir, extraArgs) {
  await runCommand("node", [
    "scripts/unimaker-one-click.mjs",
    "--project-root", fixtureRoot,
    "--entry-root", "app/components/PublishProductPage.tsx",
    "--out-dir", outDir,
    "--stop-after", "extract",
    ...extraArgs,
    ...(process.env.CHENG_BIN_OVERRIDE ? ["--cheng", resolve(process.env.CHENG_BIN_OVERRIDE)] : []),
  ], {
    cwd: packageDir,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function assertDefaultOutputs(outDir) {
  const files = listFiles(outDir);
  assert.equal(files.some((file) => file.endsWith("unimaker-react.csgc")), false, "default one-click must remove primary CSGC after extraction");
  assert.equal(files.some((file) => file.endsWith("unimaker-react.scene.csgc")), false, "extract-only one-click must not write scene CSGC before materialize");
  assert(files.some((file) => file.endsWith("unimaker-react.web.report.json")), "default one-click must write compact report");
  assert.equal(files.some((file) => file.endsWith(".csgweb")), false, "default one-click must not write .csgweb JSONL");
  assert.equal(files.some((file) => file.endsWith(".csgweb.jsonl")), false, "default one-click must not write .csgweb.jsonl");
  assert.equal(existsSync(join(outDir, "unimaker-react.web.report.full.json.gz")), false, "default one-click must not write full report");

  const compactPath = join(outDir, "unimaker-react.web.report.json");
  const compactText = readFileSync(compactPath, "utf8");
  assert(compactText.length < 64 * 1024, "compact report must stay small for the targeted fixture");
  const compact = JSON.parse(compactText);
  assert.equal(compact.projectRoot, fixtureRoot, "compact report must preserve the requested project root");
  assert(compact.entryRoots.includes("app/components/PublishProductPage.tsx"), "compact report must preserve the requested entry root");
  assert.equal(compact.runtimeClosure.requirements, undefined, "compact report must omit full runtime requirement rows");
  assert.equal(compact.runtimeClosure.externalSymbols, undefined, "compact report must omit full external symbol rows");
}

function assertFullReportOnlyWhenRequested(defaultOutDir, fullOutDir) {
  assert.equal(existsSync(join(defaultOutDir, "unimaker-react.web.report.full.json.gz")), false, "full report must be absent by default");

  const fullPath = join(fullOutDir, "unimaker-react.web.report.full.json.gz");
  assert.equal(existsSync(fullPath), true, "--full-report must write full report");

  const compactBytes = readFileSync(join(fullOutDir, "unimaker-react.web.report.json")).length;
  const fullBytes = gunzipSync(readFileSync(fullPath)).length;
  assert(fullBytes > compactBytes, "full report must be larger than compact report for the targeted fixture");
}

async function assertFontSubsetSmoke() {
  const fontFile = firstExistingFont([
    "/System/Library/Fonts/SFNSMono.ttf",
    "/System/Library/Fonts/Geneva.ttf",
    "/System/Library/Fonts/Menlo.ttc",
  ]);
  if (!fontFile) return;
  const originalBytes = readFileSync(fontFile).length;
  const prepared = await prepareFontBase64({
    fontFile,
    sourceText: "fn main() = echo(\"Hello UniMaker 123\")",
    outDir: join(smokeRoot, "font-subset"),
    label: "smoke",
    maxBytes: 128 * 1024,
    timeoutMs: 60000,
  });
  assert(prepared.base64.length > 0, "font subset smoke must produce base64");
  assert.equal(prepared.info.mode, "subset", "font subset smoke must use subset mode");
  assert(prepared.info.byteSize > 0, "font subset smoke must write bytes");
  assert(prepared.info.byteSize < originalBytes, "font subset must be smaller than original font");
  assert(prepared.info.byteSize <= 128 * 1024, "font subset must respect byte budget");
}

async function assertDefaultFontCascadeSmoke() {
  const faces = discoverDefaultSystemFontFaces();
  if (faces.length === 0) return;
  const prepared = await prepareFontCascadeBase64({
    fontFaces: faces,
    sourceText: "Hello UniMaker 首页 消息 123",
    outDir: join(smokeRoot, "font-cascade"),
    label: "cascade",
    maxBytes: 512 * 1024,
    timeoutMs: 60000,
  });
  assert(prepared.base64s.length > 0, "default font cascade smoke must produce at least one face");
  assert.equal(prepared.base64Weights.length, prepared.base64s.length, "font cascade weights must align to faces");
  assert.equal(prepared.base64Families.length, prepared.base64s.length, "font cascade families must align to faces");
  assert(prepared.base64Weights.some((weight) => weight === 700), "default font cascade must include a real bold face");
  if (existsSync("/System/Library/Fonts/SFNS.ttf")) {
    assert.equal(prepared.info.fonts[0].source, "/System/Library/Fonts/SFNS.ttf", "default font cascade must prefer SFNS for -apple-system text");
  }
  assert(prepared.info.fonts.some((font) => font.source === huiwenCjkFontPath), "default font cascade must include 匯文明朝體 for Han text");
  assert.equal(prepared.info.fonts.some((font) => String(font.source ?? "").includes("STHeiti")), false, "default font cascade must not use STHeiti for Han text");
}

async function assertOneClickFontMaterializeSmoke(outDir) {
  assert.equal(existsSync(huiwenCjkFontPath), true, "font materialize smoke requires 匯文明朝體");
  await runOneClick(outDir, [
    "--font-file", huiwenCjkFontPath,
    "--font-fallback-file", "/System/Library/Fonts/Supplemental/Arial.ttf",
    "--font-fallback-file", "/System/Library/Fonts/Supplemental/Songti.ttc",
    "--stop-after", "materialize",
    "--keep-intermediate-facts",
    "--keep-glyph-sdf-precompute-debug",
    "--require-dom-css-coverage",
    "--mobile-scene-route", "home_default:app/components/PublishProductPage.tsx::授权商品源",
    "--mobile-scene-route", "tab_messages:app/components/PublishProductPage.tsx",
    "--mobile-scene-route", "publish_selector:app/components/PublishProductPage.tsx",
    "--mobile-scene-initial-route", "home_default",
  ]);
  const files = listFiles(outDir);
  const summary = JSON.parse(readFileSync(join(outDir, "one-click.summary.json"), "utf8"));
  assert.equal(summary.glyphSdfPrecompute?.debugArtifactsKept, true, "explicit glyph debug run must record retained debug artifacts");
  const glyphCacheHit = summary.glyphSdfPrecompute?.cache?.cacheHit === true;
  const hasPrecomputeSource = files.some((file) => file.endsWith("unimaker-react.scene-glyph-sdf-precompute.cheng"));
  assert(files.some((file) => file.endsWith("unimaker-react.cheng")), "font materialize smoke must write Cheng source");
  assert(files.some((file) => file.endsWith("unimaker-react.scene.csgc")), "font materialize smoke must write precompiled scene CSGC");
  assert(files.some((file) => file.endsWith("unimaker-react.dom-css.coverage.json")), "font materialize smoke must write DOM/CSS coverage report");
  assert(files.some((file) => file.endsWith("unimaker-react.scene-runtime.cheng")), "font materialize smoke must write retained scene runtime Cheng source");
  if (!glyphCacheHit) {
    assert(hasPrecomputeSource, "font materialize smoke must write glyph SDF precompute source on cache miss");
  } else {
    assert.equal(String(summary.glyphSdfPrecompute?.source ?? ""), "", "glyph SDF cache hit summary must not point at an unwritten precompute source");
  }
  assert(files.some((file) => file.endsWith("unimaker-react.scene-glyph-sdf-precompute.out")), "font materialize smoke must write glyph SDF precompute output");
  assert(files.some((file) => file.endsWith("runtime/unimaker_scene_data.bin")), "font materialize smoke must write retained scene data asset");
  assert(files.some((file) => file.endsWith("runtime/unimaker_glyph_sdf_pixels.bin")), "font materialize smoke must write glyph SDF pixel asset");
  assert(files.some((file) => file.endsWith("runtime/unimaker_computer_use_manifest.json")), "font materialize smoke must write computer-use manifest asset");
  let precomputeSourceText = "";
  if (hasPrecomputeSource) {
    precomputeSourceText = readFileSync(join(outDir, "unimaker-react.scene-glyph-sdf-precompute.cheng"), "utf8");
    assert.doesNotMatch(precomputeSourceText, /WebSceneApplyAllRouteLayoutsToPaintOps/, "glyph SDF precompute must not run full-route layout before atlas construction");
    assert.match(precomputeSourceText, /WebSceneApplyRouteLayoutToPaintOps/, "glyph SDF precompute must layout the initial route before atlas construction");
  }
  assert(files.some((file) => file.endsWith(".subset.ttf")), "font materialize smoke must write a subset font");
  assert.equal(files.some((file) => file.endsWith(".csgweb")), false, "font materialize smoke must not write .csgweb JSONL");
  const { csgcReadFacts } = await import(pathToFileURL(join(packageDir, "dist", "csgc-reader.js")).href);
  const scenePath = join(outDir, "unimaker-react.scene.csgc");
  const scene = csgcReadFacts(readFileSync(scenePath));
  const coverage = JSON.parse(readFileSync(join(outDir, "unimaker-react.dom-css.coverage.json"), "utf8"));
  const reachability = JSON.parse(readFileSync(join(outDir, "unimaker-react.route-reachability.json"), "utf8"));
  const webReport = JSON.parse(readFileSync(join(outDir, "unimaker-react.web.report.json"), "utf8"));
  const computerUseManifest = JSON.parse(readFileSync(join(outDir, "runtime/unimaker_computer_use_manifest.json"), "utf8"));
  const hasVoiceTaskTemplates = Number(computerUseManifest.counts?.voiceTaskTemplates ?? 0) > 0;
  assert.equal(summary.viewport, "390x844", "mobile scene one-click default viewport must be 390x844");
  assert.equal(webReport.computer_use_action_coverage_percent, 100, "compact web report must retain computer-use coverage");
  if (hasVoiceTaskTemplates) {
    assert.equal(webReport.unimaker_internal_task_ready, true, "compact web report must retain UniMaker task readiness");
  }
  assert.equal(summary.computerUseManifest.relPath, "runtime/unimaker_computer_use_manifest.json", "summary must expose computer-use manifest relPath");
  assert.equal(summary.computerUseManifest.counts.computerUseActionCoveragePercent, 100, "summary computer-use manifest must prove full action coverage");
  if (hasVoiceTaskTemplates) {
    assert.equal(summary.computerUseManifest.counts.unimakerInternalTaskReady, true, "summary computer-use manifest must prove UniMaker internal task readiness");
    assert.equal(summary.computerUseManifest.templateIds.includes("publish_ad_video_draft"), true, "summary computer-use manifest must include ad video template");
    assert.equal(summary.computerUseManifest.templateIds.includes("feed_filter_review"), true, "summary computer-use manifest must include feed filter template");
  }
  assert.equal(computerUseManifest.schema, "unimaker.computer_use_manifest.v1", "computer-use manifest must use current schema");
  assert.equal(computerUseManifest.visualClickFallback, false, "computer-use manifest must forbid visual click fallback");
  const computerUseFacts = Array.isArray(computerUseManifest.facts) ? computerUseManifest.facts : [];
  assert.equal(computerUseFacts.every((fact) =>
    fact.kind !== "csg.web.voice_computer_use_scenario" || fact.visualClickFallback === false
  ), true, "computer-use manifest voice scenarios must forbid visual click fallback");
  assert.equal(computerUseFacts.every((fact) =>
    fact.kind !== "csg.web.computer_use_action" || fact.visualClickFallback === false
  ), true, "computer-use manifest actions must forbid visual click fallback");
  assert.equal(computerUseManifest.counts.blockedSteps, 0, "computer-use manifest must not leave blocked steps");
  assert.equal(computerUseManifest.counts.ambiguousSteps, 0, "computer-use manifest must not leave ambiguous steps");
  if (hasVoiceTaskTemplates) {
    assert.equal(computerUseManifest.templateIds.includes("publish_ad_video_draft"), true, "computer-use manifest must include ad video template");
    assert.equal(computerUseManifest.templateIds.includes("feed_filter_review"), true, "computer-use manifest must include feed filter template");
  }
  assert.equal(computerUseManifest.counts.computerUseActions, webReport.computer_use_action_count, "computer-use manifest action count must match web report");
  assert.equal(coverage.schema, "unimaker.dom_css_coverage.v1", "DOM/CSS coverage report must use current schema");
  assert.equal(coverage.complete, true, "fixture DOM/CSS coverage must be complete under strict mode");
  assert.equal(coverage.hardFailureCount, 0, "fixture DOM/CSS coverage must have no hard failures");
  assert.equal(reachability.schema, "unimaker.route-reachability.v1", "route reachability report must use current schema");
  assert.equal(reachability.complete, true, "fixture routes must be reachable from the initial route");
  assert.equal(reachability.unreachableWithoutIncomingEdgeRouteCount, 0, "reachable fixture must have no route without an incoming UI edge");
  assert.equal(reachability.unreachableWithIncomingEdgeRouteCount, 0, "reachable fixture must have no disconnected route subgraph");
  assert.equal(typeof reachability.incomingEdgeCountByRoute.tab_messages, "number", "reachability report must include incoming edge counts");
  const homeRouteSummary = summary.mobileSceneRoutes.find((route) => route.routeId === "home_default");
  assert.equal(homeRouteSummary?.rootText, "授权商品源", "summary must preserve explicit mobile route rootText selectors");
  assert.equal(typeof summary.glyphSdfPrecompute.cache.cacheHit, "boolean", "glyph precompute summary must expose cache state");
  assert.equal(summary.glyphSdfPrecompute.cache.cacheKey.length, 64, "glyph precompute cache key must be sha256 hex");
  assert.equal(summary.glyphSdfPrecompute.cache.runtimeDependencyHash.length, 64, "glyph precompute cache must expose runtime dependency hash");
  assert.equal(summary.glyphSdfPrecompute.cache.runtimeDependencyDeclarationCount > 0, true, "glyph precompute cache must expose runtime dependency declaration count");
  assert.equal(existsSync(summary.glyphSdfPrecompute.output), true, "glyph precompute output must exist on cache hit or miss");
  if (hasPrecomputeSource) {
    assert.match(precomputeSourceText, /fn __csg_precompute_load_full_scene_glyph_inventory/, "glyph SDF precompute must load a full-scene glyph inventory");
    assert.match(precomputeSourceText, /fn __csg_precompute_append_full_scene_glyph_inventory/, "glyph SDF precompute must append full-scene glyph inventory across font sizes");
    assert.doesNotMatch(precomputeSourceText, /WebSceneSetActiveRouteById/, "glyph SDF precompute cache must not depend on initial route");
    assert.doesNotMatch(precomputeSourceText, /WebSceneAddRouteEdge/, "glyph SDF precompute cache must not depend on route edges");
    assert.doesNotMatch(precomputeSourceText, /WebScenePaintGradientFill/, "glyph SDF precompute cache must not depend on non-text paint facts");
    if (scene.facts.some((fact) => fact.kind === "csg.web.scene.node" && String(fact.conditionalStateRef ?? "").length > 0)) {
      assert.match(precomputeSourceText, /WebSceneGlyphAtlasAppendGlyphInventoryCodepoints/, "glyph SDF precompute must append conditional text codepoints without requiring active state layout");
    }
  }
  assert.equal("version" in scene.header, false, "scene CSGC header must not expose a format version");
  assert.equal(scene.header.headerSize, 64, "scene CSGC must use the single unversioned header shape");
  assert.equal(scene.header.factCount, scene.facts.length, "scene CSGC header fact count must match decoded facts");
  assertConversationRowSwipeFacts(scene.facts);
  assertPublishTopicFacts(scene.facts);
  assertNodeRemarkFacts(scene.facts);
  assertProfileDomainTransferFacts(scene.facts);
  assertProfileRegionPolicyRefreshFacts(scene.facts);
  assertProfileRwadNfcReceiveToggleFacts(scene.facts);
  assertProfileClearPublishedContentsFacts(scene.facts);
  assertNodePublishedContentsRefreshFacts(scene.facts);
  assertProfileAddressDraftInputFacts(scene.facts);
  assertProfileAddressTagFacts(scene.facts);
  assertProfileAddressSaveFacts(scene.facts);
  assertProfileAddressListFacts(scene.facts);
  assertContentNodeDetailClickFacts(scene.facts);
  assertContentDetailFreePaymentHandlers(scene.facts);
  assertContentDetailDeleteFacts(scene.facts);
  assertProfileLicensePlateCallbackFacts(scene.facts);
  assertProfileDidAndTradingHandlerFacts(scene.facts);
  assertStaticDisabledControlsAreNotInteractive(scene.facts);
  assertPublishLiveDisabledStartFacts(scene.facts);
  assertPublishContentExternalPublishGuardFacts(scene.facts);
  assertNodesToggleSelectAllFacts(scene.facts);
  assertNodesSelectedPeerDerivedFacts(scene.facts);
  assertPublishProductCsvFacts(scene.facts);
  assertMinecraftResetWorldFacts(scene.facts);
  assertGameRestartFacts(scene.facts);
  assertTradingSubmitOrderFacts(scene.facts);
  await assertRetainedSceneMobileSource(outDir, scene.facts, summary, files);
  assert.equal(scene.facts.filter((fact) => fact.kind === "csg.web.scene.route").length, 3, "font materialize smoke must precompile all requested scene routes");
  assert.equal(scene.facts.filter((fact) => fact.kind === "csg.web.scene.layer").length, 6, "font materialize smoke must precompile per-route scene layers");
  assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.style" && fact.propName === "display"), true, "scene CSGC must include precompiled style facts");
  assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.layout" && fact.propName === "display"), true, "scene CSGC must include precompiled layout facts");
  assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "text"), true, "scene CSGC must include precompiled paint facts");
  assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "home_default"), true, "scene CSGC must include home route");
  assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "home_default" && fact.width === 390 && fact.height === 844), true, "mobile scene default route size must be 390x844");
  assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "tab_messages"), true, "scene CSGC must include messages route");
  assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.layer" && fact.routeId === "home_default" && fact.name === "fixed"), true, "scene CSGC must include fixed layer");
  assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.route_edge" && fact.targetRouteId === "tab_messages"), true, "scene CSGC must include route edges");
  assertEveryRouteEdgeHasStructuredHitTarget(scene.facts);
  const tabMessagesHitRect = scene.facts.find((fact) => fact.kind === "csg.web.scene.route_hit_rect" && fact.routeId === "home_default" && fact.targetRouteId === "tab_messages");
  assert.equal(tabMessagesHitRect?.x, 78, "scene CSGC must precompile messages tab hit rect x");
  assert.equal(tabMessagesHitRect?.y, 760, "scene CSGC must precompile messages tab hit rect y");
  assert.equal(tabMessagesHitRect?.width, 78, "scene CSGC must precompile messages tab hit rect width");
  assert.equal(tabMessagesHitRect?.height, 84, "scene CSGC must precompile messages tab hit rect height");
  await assertSceneCsgcDrivesRetainedRuntime(outDir, scene.facts);
  cleanupGeneratedFactFiles(outDir);
  assertNoGeneratedFactFiles(outDir);
}

async function assertOneClickGlyphCacheHitSmoke(outDir) {
  assert.equal(existsSync(huiwenCjkFontPath), true, "glyph cache smoke requires 匯文明朝體");
  await runOneClick(outDir, [
    "--font-file", huiwenCjkFontPath,
    "--font-fallback-file", "/System/Library/Fonts/Supplemental/Arial.ttf",
    "--font-fallback-file", "/System/Library/Fonts/Supplemental/Songti.ttc",
    "--stop-after", "materialize",
    "--require-dom-css-coverage",
    "--viewport", "390x844",
    "--mobile-scene-route", "home_default:app/components/PublishProductPage.tsx::授权商品源",
    "--mobile-scene-route", "tab_messages:app/components/PublishProductPage.tsx",
    "--mobile-scene-route", "publish_selector:app/components/PublishProductPage.tsx",
    "--mobile-scene-initial-route", "home_default",
    "--require-glyph-sdf-precompute-cache-hit",
  ]);
  const summary = JSON.parse(readFileSync(join(outDir, "one-click.summary.json"), "utf8"));
  assert.equal(summary.glyphSdfPrecompute.cache.cacheHit, true, "required glyph precompute cache hit run must hit cache");
  assert.equal(summary.glyphSdfPrecompute.debugArtifactsKept, false, "default glyph cache run must not retain debug artifacts");
  assert.equal(summary.glyphSdfPrecompute.source, "", "default glyph cache run summary must clear the source path");
  assert.equal(summary.glyphSdfPrecompute.executable, "", "cache hit run must not compile a glyph precompute executable");
  assert.equal(summary.glyphSdfPrecompute.report, "", "default glyph cache run summary must clear the report path");
  assert.equal(summary.glyphSdfPrecompute.output, "", "default glyph cache run summary must clear the raw output path");
  assert.notEqual(summary.glyphSdfPrecompute.sceneDataAsset, "", "default glyph cache run must retain the production scene data asset path");
  assert.notEqual(summary.glyphSdfPrecompute.pixelAsset, "", "default glyph cache run must retain the production glyph pixel asset path");
  assert.equal(existsSync(summary.glyphSdfPrecompute.sceneDataAsset), true, "default glyph cache run scene data asset must exist");
  assert.equal(existsSync(summary.glyphSdfPrecompute.pixelAsset), true, "default glyph cache run glyph pixel asset must exist");
  const files = listFiles(outDir);
  assert.equal(files.some((file) => file.endsWith("unimaker-react.scene-glyph-sdf-precompute.cheng")), false, "default glyph cache run must delete precompute source");
  assert.equal(files.some((file) => file.endsWith("unimaker-react.scene-glyph-sdf-precompute.out")), false, "default glyph cache run must delete precompute raw output");
}

function writePwaContentSnapshotFixture(path) {
  mkdirSync(dirname(path), { recursive: true });
  const peerId = "12D3KooWDode1D7fBs5zNLvKW97hVyMxpGRnusNC";
  const contents = [
    {
      id: "content-sync-video-output-smoke-id",
      type: "video",
      publishCategory: "content",
      userId: peerId,
      userName: "UniMaker 节点",
      avatar: "",
      title: realUniMakerSnapshotVideoTitle,
      content: `pwa-content-media-smoke:video:output-smoke:${realUniMakerSnapshotVideoTitle}`,
      media: "p2pmedia://content-sync-video-output-smoke/content-smoke-video-cmaf.mp4",
      coverMedia: "p2pmedia://content-sync-video-output-smoke/content-smoke-video-cover.jpg",
      mediaItems: ["p2pmedia://content-sync-video-output-smoke/content-smoke-video-cmaf.mp4"],
      likes: 11,
      comments: 3,
      timestamp: 2_000,
      publishedAt: 2_000,
      extra: {
        smokeNs: "output-smoke",
        smokeMediaKind: "video",
        smokeTitle: realUniMakerSnapshotVideoTitle,
      },
    },
    {
      id: "content-sync-image-output-smoke-id",
      type: "image",
      publishCategory: "content",
      userId: peerId,
      userName: "UniMaker 节点",
      avatar: "",
      title: realUniMakerSnapshotImageTitle,
      content: `pwa-content-media-smoke:image:output-smoke:${realUniMakerSnapshotImageTitle}`,
      media: "p2pmedia://content-sync-image-output-smoke/content-smoke-image.png",
      coverMedia: "p2pmedia://content-sync-image-output-smoke/content-smoke-image.png",
      mediaItems: ["p2pmedia://content-sync-image-output-smoke/content-smoke-image.png"],
      likes: 7,
      comments: 2,
      timestamp: 1_000,
      publishedAt: 1_000,
      extra: {
        smokeNs: "output-smoke",
        smokeMediaKind: "image",
        smokeTitle: realUniMakerSnapshotImageTitle,
      },
    },
  ];
  writeFileSync(path, JSON.stringify({
    schema: realUniMakerPwaContentSnapshotSchema,
    storageKey: realUniMakerPwaContentStorageKey,
    capturedAt: "2026-06-11T00:00:00.000Z",
    contents,
  }, null, 2) + "\n", "utf8");
}

function assertSceneUsesPwaContentSnapshot(sceneFacts) {
  const text = JSON.stringify(sceneFacts);
  assert(text.includes(realUniMakerSnapshotVideoTitle), "retained scene facts must consume the PWA video content snapshot title");
  assert(text.includes(realUniMakerSnapshotImageTitle), "retained scene facts must consume the PWA image content snapshot title");
  assert.equal(text.includes("UniMaker 视频内容"), false, "retained scene facts must not keep the old static video title");
  assert.equal(text.includes("UniMaker 图片内容"), false, "retained scene facts must not keep the old static image title");
  assert.equal(text.includes("通过 cheng-libp2p 发布的视频内容"), false, "retained scene facts must not keep the old static video body");
  assert.equal(text.includes("通过 Cheng/CSG 媒体账本发布的图片内容"), false, "retained scene facts must not keep the old static image body");
}

function assertCommentKeyDownUsesCompiledSendComment(sceneFacts) {
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.eventName === "keyDown" &&
    fact.actionKind === "command" &&
    fact.effect === "guard_key:Enter;prevent-default;compiled:handleSendComment"
  ), true, "comment Enter keydown must dispatch the compiled handleSendComment handler");
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.eventName === "keyDown" &&
    fact.effect === "invoke:handleCommentKeyDown"
  ), false, "comment Enter keydown must not remain as an uncompiled handleCommentKeyDown invoke");
}

function assertBaziCalculateUsesStructuredEffect(sceneFacts) {
  const handlers = sceneFacts.filter((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.eventName === "click" &&
    fact.handler === "handleCalculate" &&
    String(fact.source ?? "").includes("app/components/BaziPage.tsx:")
  );
  assert(handlers.length >= 4, "BaziPage recalculation handlers must be present in retained route snapshots");
  for (const handler of handlers) {
    assert.equal(handler.actionKind, "state_delta", "handleCalculate must be a retained state_delta effect");
    assert.equal(handler.stateRef, "result", "handleCalculate must target result state");
    assert.match(String(handler.effect ?? ""), /^bazi_calculate:result:activeDayunIdx:year:month:day:hour:minute:gender:timezone:longitude:useTrueSolarTime:lateZiBoundary:\d{4}$/, "handleCalculate must use the structured bazi_calculate effect");
  }
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    String(fact.source ?? "").includes("app/components/BaziPage.tsx:") &&
    String(fact.effect ?? "").includes("invoke:handleCalculate")
  ), false, "BaziPage handleCalculate must not remain as an opaque invoke in any retained route snapshot");
}

function assertZiweiCalculateUsesStructuredEffect(sceneFacts) {
  const handlers = sceneFacts.filter((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.eventName === "click" &&
    fact.handler === "handleCalculate" &&
    String(fact.source ?? "").includes("app/components/ZiweiPage.tsx:")
  );
  assert(handlers.length >= 4, "ZiweiPage recalculation handlers must be present in retained route snapshots");
  for (const handler of handlers) {
    assert.equal(handler.actionKind, "state_delta", "Ziwei handleCalculate must be a retained state_delta effect");
    assert.equal(handler.stateRef, "result", "Ziwei handleCalculate must target result state");
    assert.equal(String(handler.effect ?? ""), "ziwei_calculate:result:year:month:day:shichen:gender:calendarType:minute:timezone:longitude:useTrueSolarTime:lateZiBoundary", "Ziwei handleCalculate must use the structured ziwei_calculate effect");
  }
  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    String(fact.source ?? "").includes("app/components/ZiweiPage.tsx:") &&
    String(fact.effect ?? "").includes("invoke:handleCalculate")
  ), false, "ZiweiPage handleCalculate must not remain as an opaque invoke in any retained route snapshot");
}

function assertAstrologyArchiveSaveUsesStructuredEffect(sceneFacts) {
  const baziArchiveEffect = /^astrology_archive_save:bazi:archives:archiveHint:result:year:month:day:hour:minute:gender:timezone:longitude:useTrueSolarTime:lateZiBoundary:bindDidOnSave:didUser:\d{4}$/;
  const baziHandlers = sceneFacts.filter((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.eventName === "click" &&
    baziArchiveEffect.test(String(fact.effect ?? ""))
  );
  assert(baziHandlers.length >= 1, "BaziPage save archive handler must be present in retained route snapshots");
  for (const handler of baziHandlers) {
    assert.equal(handler.actionKind, "state_delta", "Bazi handleSaveArchive must be a retained state_delta effect");
    assert.equal(handler.stateRef, "archives", "Bazi handleSaveArchive must target archives state");
    assert.match(String(handler.effect ?? ""), baziArchiveEffect, "Bazi handleSaveArchive must use the structured astrology_archive_save effect");
  }

  // ZiweiPage's archive panel lives behind renderMainContent()'s activeMainTab==='档案' branch.
  // The home_ziwei_archive_open route seeds {activeTopView:'main', activeMainTab:'档案'}; the
  // component-condition visibility selector now resolves those route-authoritative tab guards
  // statically (settings branch pruned as unreachable), so the archive panel and its onSave→
  // handleSaveArchive button materialize with real source and recognize as the structured effect.
  const ziweiArchiveEffect = "astrology_archive_save:ziwei:archives:archiveHint:result:year:month:day:shichen:minute:gender:calendarType:timezone:longitude:useTrueSolarTime:lateZiBoundary:bindDidOnSave:didUser";
  const ziweiHandlers = sceneFacts.filter((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.eventName === "click" &&
    String(fact.effect ?? "") === ziweiArchiveEffect
  );
  assert(ziweiHandlers.length >= 1, "ZiweiPage save archive handler must be present in retained route snapshots");
  for (const handler of ziweiHandlers) {
    assert.equal(handler.actionKind, "state_delta", "Ziwei handleSaveArchive must be a retained state_delta effect");
    assert.equal(handler.stateRef, "archives", "Ziwei handleSaveArchive must target archives state");
    assert.equal(String(handler.effect ?? ""), ziweiArchiveEffect, "Ziwei handleSaveArchive must use the structured astrology_archive_save effect");
  }

  assert.equal(sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    (String(fact.source ?? "").includes("app/components/BaziPage.tsx:") || String(fact.source ?? "").includes("app/components/ZiweiPage.tsx:")) &&
    String(fact.effect ?? "").includes("invoke:handleSaveArchive")
  ), false, "Astrology handleSaveArchive must not remain as an opaque invoke in any retained route snapshot");
}

async function assertOneClickHomeMediaLayoutSmoke(outDir) {
  assert.equal(existsSync(join(realUniMakerProjectRoot, "app/components/HomePage.tsx")), true, "real UniMaker HomePage fixture is required for home media layout smoke");
  assert.equal(existsSync(join(realUniMakerProjectRoot, "app/components/ContentDetailPage.tsx")), true, "real UniMaker ContentDetailPage fixture is required for home media layout smoke");
  assert.equal(existsSync(join(realUniMakerProjectRoot, "app/components/BaziPage.tsx")), true, "real UniMaker BaziPage fixture is required for handler coverage smoke");
  assert.equal(existsSync(join(realUniMakerProjectRoot, "app/components/ZiweiPage.tsx")), true, "real UniMaker ZiweiPage fixture is required for handler coverage smoke");
  const contentSnapshotPath = join(outDir, "pwa-content-snapshot.json");
  writePwaContentSnapshotFixture(contentSnapshotPath);
  await runCommand("node", [
    "scripts/unimaker-one-click.mjs",
    "--project-root", realUniMakerProjectRoot,
    "--out-dir", outDir,
    "--stop-after", "materialize",
    "--keep-intermediate-facts",
    "--keep-glyph-sdf-precompute-debug",
    "--viewport", "390x844",
    "--mobile-scene-route", "home_default:app/components/HomePage.tsx",
    "--mobile-scene-route", "home_content_detail_open:app/components/HomePage.tsx",
    "--mobile-scene-route", "home_image_detail_open:app/components/HomePage.tsx",
    "--mobile-scene-route", "node_published_content:app/components/NodesPage.tsx:NodePublishedContentPage",
    "--mobile-scene-route", "content_detail:app/components/ContentDetailPage.tsx",
    "--mobile-scene-route", "home_bazi_overlay_open:app/components/BaziPage.tsx",
    "--mobile-scene-route", "home_ziwei_overlay_open:app/components/ZiweiPage.tsx",
    "--mobile-scene-route", "home_ziwei_archive_open:app/components/ZiweiPage.tsx",
    "--mobile-scene-initial-route", "home_default",
    "--mobile-content-snapshot-file", contentSnapshotPath,
    "--font-file", huiwenCjkFontPath,
    "--font-fallback-file", "/System/Library/Fonts/Supplemental/Arial.ttf",
    "--font-fallback-file", "/System/Library/Fonts/Supplemental/Songti.ttc",
    "--font-fallback-file", "/System/Library/Fonts/Apple Symbols.ttf",
    ...(process.env.CHENG_BIN_OVERRIDE ? ["--cheng", resolve(process.env.CHENG_BIN_OVERRIDE)] : []),
  ], {
    cwd: packageDir,
    encoding: "utf8",
    timeout: 300000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const { csgcReadFacts } = await import(pathToFileURL(join(packageDir, "dist", "csgc-reader.js")).href);
  const scene = csgcReadFacts(readFileSync(join(outDir, "unimaker-react.scene.csgc")));
  assertHomeMediaSlotsStayInMasonryAndDetailVideoCanFullscreen(scene.facts);
  assertPublishedContentDataOpensFullscreenVideoDetail(scene.facts);
  assertSceneUsesPwaContentSnapshot(scene.facts);
  assertCommentKeyDownUsesCompiledSendComment(scene.facts);
  assertBaziCalculateUsesStructuredEffect(scene.facts);
  assertZiweiCalculateUsesStructuredEffect(scene.facts);
  assertAstrologyArchiveSaveUsesStructuredEffect(scene.facts);
  assertContentDetailFreePaymentHandlers(scene.facts);
  assertContentDetailDeleteFacts(scene.facts);
  assertPublishTopicFacts(scene.facts);
  assertNodeRemarkFacts(scene.facts);
  assertProfileDomainTransferFacts(scene.facts);
  assertProfileRegionPolicyRefreshFacts(scene.facts);
  assertProfileRwadNfcReceiveToggleFacts(scene.facts);
  assertProfileClearPublishedContentsFacts(scene.facts);
  assertNodePublishedContentsRefreshFacts(scene.facts);
  assertProfileAddressDraftInputFacts(scene.facts);
  assertProfileAddressTagFacts(scene.facts);
  assertProfileAddressSaveFacts(scene.facts);
  assertProfileAddressListFacts(scene.facts);
  assertContentNodeDetailClickFacts(scene.facts);
  assertProfileLicensePlateCallbackFacts(scene.facts);
  assertProfileDidAndTradingHandlerFacts(scene.facts);
  assertStaticDisabledControlsAreNotInteractive(scene.facts);
  assertPublishLiveDisabledStartFacts(scene.facts);
  assertPublishContentExternalPublishGuardFacts(scene.facts);
  assertNodesToggleSelectAllFacts(scene.facts);
  assertNodesSelectedPeerDerivedFacts(scene.facts);
  assertPublishProductCsvFacts(scene.facts);
  assertMinecraftResetWorldFacts(scene.facts);
  assertGameRestartFacts(scene.facts);
  assertTradingSubmitOrderFacts(scene.facts);
  const summary = JSON.parse(readFileSync(join(outDir, "one-click.summary.json"), "utf8"));
  assertRetainedMediaSceneAssets(outDir, scene.facts, summary, listFiles(outDir));
  await assertSceneCsgcDrivesRetainedRuntime(outDir, scene.facts, {
    mediaSurfaceLayoutExpectations: mediaSurfaceLayoutExpectationsForUniMakerHome(scene.facts),
    mediaControlProbe: false,
    stopAfterMediaSurfaceLayoutExpectations: true,
  });
  cleanupGeneratedFactFiles(outDir);
  assertNoGeneratedFactFiles(outDir);
}

async function assertOneClickPublishGraphicSmoke(outDir) {
  assert.equal(existsSync(join(realUniMakerProjectRoot, "app/components/PublishVideoPage.tsx")), true, "real UniMaker PublishVideoPage fixture is required for publish graphic smoke");
  assert.equal(existsSync(join(realUniMakerProjectRoot, "app/components/PublishFoodPage.tsx")), true, "real UniMaker PublishFoodPage fixture is required for publish food camera smoke");
  assert.equal(existsSync(join(realUniMakerProjectRoot, "app/components/PublishProductPage.tsx")), true, "real UniMaker PublishProductPage fixture is required for publish product guard smoke");
  await runCommand("node", [
    "scripts/unimaker-one-click.mjs",
    "--project-root", realUniMakerProjectRoot,
    "--out-dir", outDir,
    "--stop-after", "scene-facts",
    "--keep-intermediate-facts",
    "--require-dom-css-coverage",
    "--viewport", "390x844",
    "--mobile-scene-route", "publish_graphic:app/components/PublishVideoPage.tsx",
    "--mobile-scene-route", "publish_selector:app/components/PublishProductPage.tsx",
    "--mobile-scene-route", "publish_food:app/components/PublishFoodPage.tsx",
    "--mobile-scene-route", "publish_product:app/components/PublishProductPage.tsx",
    "--mobile-scene-initial-route", "publish_graphic",
    "--font-file", huiwenCjkFontPath,
    "--font-fallback-file", "/System/Library/Fonts/Supplemental/Arial.ttf",
    "--font-fallback-file", "/System/Library/Fonts/Supplemental/Songti.ttc",
    "--font-fallback-file", "/System/Library/Fonts/Apple Symbols.ttf",
  ], {
    cwd: packageDir,
    encoding: "utf8",
    timeout: 300000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const { csgcReadFacts } = await import(pathToFileURL(join(packageDir, "dist", "csgc-reader.js")).href);
  const scene = csgcReadFacts(readFileSync(join(outDir, "unimaker-react.scene.csgc")));
  assertPublishGraphicRouteFacts(scene.facts);
  const publishFoodRoute = scene.facts.find((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "publish_food");
  assert(publishFoodRoute, "publish_food route must be materialized");
  assertPublishFoodCameraAddImageFacts(scene.facts);
  const publishProductRoute = scene.facts.find((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "publish_product");
  assert(publishProductRoute, "publish_product route must be materialized");
  assertPublishProductModeBranchGuardFacts(scene.facts);
  assertPublishProductCsvFacts(scene.facts);
  cleanupGeneratedFactFiles(outDir);
  assertNoGeneratedFactFiles(outDir);
}

async function assertOneClickMarketplaceInitialSmoke(outDir) {
  assert.equal(existsSync(join(realUniMakerProjectRoot, "app/components/AppMarketplace.tsx")), true, "real UniMaker AppMarketplace fixture is required for marketplace initial smoke");
  await runCommand("node", [
    "scripts/unimaker-one-click.mjs",
    "--project-root", realUniMakerProjectRoot,
    "--out-dir", outDir,
    "--stop-after", "scene-facts",
    "--keep-intermediate-facts",
    "--require-dom-css-coverage",
    "--viewport", "390x844",
    "--mobile-scene-route", "home_app_channel:app/components/HomePage.tsx",
    "--mobile-scene-route", "marketplace_main:app/components/AppMarketplace.tsx::应用市场",
    "--mobile-scene-route", "home_bazi_overlay_open:app/components/BaziPage.tsx",
    "--mobile-scene-route", "message_thread:app/components/ChatPage.tsx",
    "--mobile-scene-route", "message_thread_more_panel_open:app/components/ChatPage.tsx",
    "--mobile-scene-route", "marketplace_social_picker:app/components/AppMarketplace.tsx",
    "--mobile-scene-initial-route", "marketplace_main",
  ], {
    cwd: packageDir,
    encoding: "utf8",
    timeout: 300000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const { csgcReadFacts } = await import(pathToFileURL(join(packageDir, "dist", "csgc-reader.js")).href);
  const scene = csgcReadFacts(readFileSync(join(outDir, "unimaker-react.scene.csgc")));
  assertMarketplaceInitialRouteDoesNotStackOverlays(scene.facts);
  assertMarketplaceSocialPickerRouteMaterialized(scene.facts);
  assertMarketplaceRouteEntryResetsOverlayState(scene.facts);
  assertMarketplaceSocialPickerReachableFromChatMorePanel(scene.facts);
  assertMessageThreadMorePanelActionModals(scene.facts);
  assertMessageThreadRedPacketSendEffect(scene.facts);
  assertMessageThreadLocationSendEffect(scene.facts);
  assertMessageThreadLocationModalBindings(scene.facts);
  assertBaziDateInputsAcceptTextInput(scene.facts);
  assertMessageThreadSynccastEffects(scene.facts);
  assertMessageThreadSendAndMoreButtonsAreStateSplit(scene.facts);
  cleanupGeneratedFactFiles(outDir);
  assertNoGeneratedFactFiles(outDir);
}

async function assertRetainedSceneMobileSource(outDir, sceneFacts, summary, files) {
  const sourcePath = join(outDir, "unimaker-react.scene-runtime.cheng");
  const sourceText = readFileSync(sourcePath, "utf8");
  assert.match(sourceText, /import cheng\/core\/runtime\/web_scene_runtime as scene/, "retained mobile source must use scene runtime");
  assert.match(sourceText, /@importc\("cheng_mobile_host_present_gpu_commands"\)/, "retained mobile source must call GPU host ABI");
  assert.match(sourceText, /@importc\("cheng_mobile_host_present_media_surface_commands"\)/, "retained mobile source must call media surface host ABI");
  assert.match(sourceText, /@importc\("cheng_mobile_host_prepare_media_surface_texture"\)/, "retained mobile source must call media surface prepare ABI");
  assert.match(sourceText, /@importc\("cheng_host_social_synccast_control"\)/, "retained mobile source must call synccast control host ABI");
  assert.match(sourceText, /@importc\("cheng_host_social_synccast_refresh"\)/, "retained mobile source must call synccast refresh host ABI");
  assert.match(sourceText, /@importc\("cheng_host_region_policy_refresh"\)/, "retained mobile source must call region policy host ABI");
  assert.match(sourceText, /@importc\("cheng_host_profile_peer_id_refresh"\)/, "retained mobile source must call profile peer id host ABI");
  assert.match(sourceText, /__csg_scene_apply_profile_peer_id_refresh/, "retained mobile source must consume the profile peer id refresh effect");
  assert.match(sourceText, /@importc\("cheng_host_node_contents_refresh"\)/, "retained mobile source must call node contents refresh host ABI");
  assert.match(sourceText, /@importc\("cheng_host_clear_published_contents"\)/, "retained mobile source must call clear published host ABI");
  assert.match(sourceText, /@importc\("cheng_host_content_delete"\)/, "retained mobile source must call content delete host ABI");
  assert.match(sourceText, /fn cheng_host_publish\(selectedMediaPathRaw: cstring, publishKindRaw: cstring, publishPayloadJsonRaw: cstring\): void/, "retained mobile source must pass structured publish payload to host ABI");
  assert.match(sourceText, /cheng\.scene\.external_publish\.v1/, "retained mobile source must tag native publish payload schema");
  assert.match(sourceText, /scenePublishPayload|__csg_scene_publish_payload_json/, "retained mobile source must preserve publish form state in native publish payload");
  assert.match(sourceText, /@importc\("cheng_host_profile_bio_did_create"\)/, "retained mobile source must call profile device DID host ABI");
  assert.match(sourceText, /@importc\("cheng_host_profile_bio_did_import"\)/, "retained mobile source must call profile device DID import host ABI");
  assert.match(sourceText, /@importc\("cheng_host_trading_refresh"\)/, "retained mobile source must call trading refresh host ABI");
  assert.match(sourceText, /@importc\("cheng_host_rwad_nfc_receive_toggle"\)/, "retained mobile source must call RWAD NFC receive host ABI");
  if (sceneFacts.some((fact) => fact.kind === "csg.web.scene.event_handler" && String(fact.effect ?? "").startsWith("region_policy_refresh:"))) {
    assert.match(sourceText, /region_policy_refresh:regionPolicy:policyGroupId:isDomestic/, "retained mobile source must preserve region policy refresh effect");
  }
  if (sceneFacts.some((fact) => fact.kind === "csg.web.scene.event_handler" && String(fact.effect ?? "").startsWith("node_contents_refresh:"))) {
    assert.match(sourceText, /node_contents_refresh:selectedNodeContentOwner:selectedNodeContents:selectedNodeContentLoading:nativeError/, "retained mobile source must preserve node contents refresh effect");
  }
  if (sceneFacts.some((fact) => fact.kind === "csg.web.scene.event_handler" && String(fact.effect ?? "").startsWith("clear_published_contents:"))) {
    assert.match(sourceText, /clear_published_contents:peerId:clearPublishedJob:clearingPublished:publishedClearHint/, "retained mobile source must preserve clear published effect");
    assert.match(sourceText, /已向全网下架/, "retained mobile source must preserve clear published success hint");
    assert.match(sourceText, /后台正在检查已发布内容/, "retained mobile source must preserve clear published running hint");
  }
  if (sceneFacts.some((fact) => fact.kind === "csg.web.scene.event_handler" && String(fact.effect ?? "").startsWith("content_delete:"))) {
    assert.match(sourceText, /content_delete:content:deleteBusy:deleteMessage:/, "retained mobile source must preserve content delete effect");
    assert.match(sourceText, /确认下架这条发布内容？相关视频资产会一起回收。/, "retained mobile source must preserve React content delete confirm copy");
    assert.match(sourceText, /已下架，回收/, "retained mobile source must preserve React content delete reclaimed asset copy");
  }
  if (sceneFacts.some((fact) => fact.kind === "csg.web.scene.event_handler" && sceneEffectHasSegment(fact.effect, "profile_bio_did_create:"))) {
    assert.match(sourceText, /profile_bio_did_create:didBusy:didActionHint:didText:peerId:didBackupPayload:showDidRecoverySheet:showDidBackupSheet/, "retained mobile source must preserve profile DID create effect");
    assert.match(sourceText, /DID 已创建/, "retained mobile source must preserve React DID create success hint");
  }
  if (sceneFacts.some((fact) => fact.kind === "csg.web.scene.event_handler" && sceneEffectHasSegment(fact.effect, "profile_bio_did_open_entry:"))) {
    assert.match(sourceText, /profile_bio_did_open_entry:didActionHint:didText:didBackupPayload:showDidBackupSheet:didRecoveryInput:showDidRecoverySheet/, "retained mobile source must preserve profile DID entry effect");
  }
  if (sceneFacts.some((fact) => fact.kind === "csg.web.scene.event_handler" && sceneEffectHasSegment(fact.effect, "profile_bio_did_import:"))) {
    assert.match(sourceText, /profile_bio_did_import:didBusy:didActionHint:didText:peerId:didRecoveryInput:showDidRecoverySheet:didBackupPayload/, "retained mobile source must preserve profile DID import effect");
    assert.match(sourceText, /DID 已恢复/, "retained mobile source must preserve React DID import success hint");
  }
  if (sceneFacts.some((fact) => fact.kind === "csg.web.scene.event_handler" && String(fact.effect ?? "").startsWith("trading_refresh:"))) {
    assert.match(sourceText, /trading_refresh:selectedPair:interval:loading:dexHealth:loadError:pairs:candles:externalOrderBook:externalTrades:externalUpdatedAt/, "retained mobile source must preserve trading refresh effect");
    assert.match(sourceText, /行情暂时不可用，请稍后重试。/, "retained mobile source must preserve React trading offline copy");
  }
  if (sceneFacts.some((fact) => fact.kind === "csg.web.scene.event_handler" && String(fact.effect ?? "").startsWith("rwad_nfc_receive_toggle:"))) {
    assert.match(sourceText, /rwad_nfc_receive_toggle:peerId:wallets:rwadNfcReceiveActive:rwadNfcReceiveBusy:rwadNfcReceiveExpiresAt:rwadSyncHint/, "retained mobile source must preserve RWAD NFC receive effect");
    assert.match(sourceText, /NFC 收款模式已开启，请让对方手机贴近读取收款地址/, "retained mobile source must preserve RWAD NFC receive started hint");
    assert.match(sourceText, /NFC 收款模式已关闭/, "retained mobile source must preserve RWAD NFC receive stopped hint");
    assert.match(sourceText, /检测到系统钱包拦截，已为你打开 NFC 支付设置，请将默认支付应用切换后重试/, "retained mobile source must preserve RWAD NFC payment settings hint");
  }
  assert.match(sourceText, /已同步播放/, "retained mobile source must preserve React synccast play success hint");
  assert.match(sourceText, /已同步暂停/, "retained mobile source must preserve React synccast pause success hint");
  assert.match(sourceText, /同步控制失败，请检查网络连接/, "retained mobile source must preserve React synccast failure hint");
  assert.match(sourceText, /slotId: cstring, assetCid: cstring, manifestCid: cstring, posterCid: cstring/, "retained mobile source must expose media CIDs through cstring ABI parameters");
  assert.doesNotMatch(sourceText, /slotHash: int32, assetHash: int32, manifestHash: int32/, "retained mobile prepare ABI must not pass hash stack parameters");
  assert.match(sourceText, /var __csgSceneMediaSurfacePrepareStatuses: int32\[\]/, "retained mobile source must keep Cheng-side media prepare receipt status rows");
  assert.match(sourceText, /var __csgSceneMediaSurfacePrepareSlotHashes: int32\[\]/, "retained mobile source must keep Cheng-side media prepare receipt slot identity rows");
  assert.match(sourceText, /var __csgSceneMediaSurfacePrepareManifestHashes: int32\[\]/, "retained mobile source must keep Cheng-side media prepare receipt manifest identity rows");
  assert.match(sourceText, /let slotIdRaw: cstring = strToCStringTemp\(slotId\)/, "retained mobile source must explicitly lower media slot id to cstring before host ABI");
  assert.match(sourceText, /let assetCidRaw: cstring = strToCStringTemp\(assetCid\)/, "retained mobile source must explicitly lower media asset CID to cstring before host ABI");
  assert.match(sourceText, /let manifestCidRaw: cstring = strToCStringTemp\(manifestCid\)/, "retained mobile source must explicitly lower media manifest CID to cstring before host ABI");
  assert.match(sourceText, /let posterCidRaw: cstring = strToCStringTemp\(posterCid\)/, "retained mobile source must explicitly lower media poster CID to cstring before host ABI");
  assert.match(sourceText, /@importc\("cheng_mobile_host_upload_image_atlas"\)/, "retained mobile source must upload image atlas ABI");
  assert.match(sourceText, /@importc\("cheng_mobile_host_upload_glyph_sdf_atlas"\)/, "retained mobile source must upload glyph SDF atlas ABI");
  assert.match(sourceText, /@importc\("cheng_mobile_host_upload_glyph_sdf_atlas_bytes"\)/, "retained mobile source must upload glyph SDF pixel asset bytes ABI");
  assert.match(sourceText, /@importc\("cheng_mobile_host_set_ink_fade"\)/, "retained mobile source must set ink fade ABI");
  assert.match(sourceText, /@importc\("cheng_mobile_host_upload_ink_field"\)/, "retained mobile source must upload ink field ABI");
  assert.match(sourceText, /@importc\("cheng_mobile_host_present_overlay_refresh"\)/, "retained mobile source must present overlay refresh ABI");
  assert.match(sourceText, /@importc\("cheng_mobile_host_trace_step"\)/, "retained mobile source must expose app init stage trace ABI");
  assert.match(sourceText, /@importc\("cheng_mobile_host_upload_svg_display_list_atlas"\)/, "retained mobile source must upload SVG display-list atlas ABI");
  assert.match(sourceText, /@importc\("cheng_mobile_host_present_compositor_frame"\)/, "retained mobile source must call compositor host ABI");
  assert.match(sourceText, /import std\/strutils as strutil/, "retained mobile source must import strutils for React trim-equivalent runtime text selection");
  assert.match(sourceText, /WebSceneGraphInit\(__csgSceneGraph\)/, "retained mobile source must build a scene graph");
  assert.match(sourceText, /WebSceneBuildImageAtlasFromResources/, "retained mobile source must build image atlas");
  assert.match(sourceText, /WebSceneEncodeImageAtlasHostBatch/, "retained mobile source must encode image atlas host batches");
  assert.match(sourceText, /WebSceneBuildSvgDisplayListAtlasFromPaintOps/, "retained mobile source must build SVG display-list atlas");
  assert.match(sourceText, /WebSceneEncodeSvgDisplayListHostBatch/, "retained mobile source must encode SVG display-list host batches");
  assert.match(sourceText, /WebSceneLoadPrecomputedGlyphSdfAtlasHostBatches/, "retained mobile source must load a precomputed glyph SDF atlas");
  assert.doesNotMatch(sourceText, /WebSceneBuildGlyphAtlasFromPaintOps/, "retained mobile source must not build glyph SDF on device startup");
  assert.match(sourceText, /__csg_scene_ensure_route_runtime_ready/, "retained mobile source must lazily prepare route runtime state");
  assert.match(sourceText, /var __csgScenePendingRouteNode: int32/, "retained mobile source must queue navigation outside the touch callback");
  assert.match(sourceText, /fn __csg_scene_request_route_to_node\(nodeId: int32\): int32 =[\s\S]*__csgScenePendingRouteNode = nodeId[\s\S]*__csgSceneRendered = false[\s\S]*return 1/, "route request must switch logical state, queue one frame, and return without layout work");
  const routeRequestBody = sourceText.match(/fn __csg_scene_request_route_to_node\(nodeId: int32\): int32 =[\s\S]*?\n\n/)?.[0] ?? "";
  assert.doesNotMatch(routeRequestBody, /__csg_scene_ensure_route_runtime_ready|WebSceneApplyRouteLayoutToPaintOps|__csg_scene_refresh_transition_stats/, "touch-time route request must not synchronously build layout, glyphs, or compositor transitions");
  assert.match(sourceText, /fn cheng_app_tick\(appId: uint64, deltaTime: float\) =[\s\S]*if __csgScenePendingRouteNode > 0:[\s\S]*__csg_scene_commit_pending_route\(\)/, "next frame tick must commit queued navigation before presentation");
  assert.match(sourceText, /var __csgScenePendingEventNode: int32/, "retained mobile source must queue click effects outside the touch callback");
  const eventRequestBody = sourceText.match(/fn __csg_scene_request_event_to_node\(nodeId: int32\): int32 =[\s\S]*?\n\n/)?.[0] ?? "";
  assert.doesNotMatch(eventRequestBody, /__csg_scene_apply_event_to_node|__csg_scene_refresh_effect_dirty_frame|__csg_scene_prepare_active_route_media_surfaces/, "touch-time event request must not synchronously rebuild layout, compositor, or media");
  assert.match(sourceText, /fn cheng_app_tick\(appId: uint64, deltaTime: float\) =[\s\S]*if __csgScenePendingEventNode > 0:[\s\S]*__csg_scene_commit_pending_event\(\)/, "next frame tick must commit queued click effects before presentation");
  assert.match(sourceText, /if __csgSceneTopKind == 2:[\s\S]*__csg_scene_request_event_to_node\(__csgSceneTopNode\)/, "touch release must queue event work instead of executing handlers synchronously");
  assert.match(sourceText, /if action == 0:[\s\S]*__csgScenePrewarmCursor = __csgScenePrewarmLimit[\s\S]*__csg_scene_top_interaction/, "real input must cancel remaining idle route prewarm before hit testing");
  assert.match(sourceText, /if downNodeId > 0 && __csgSceneTopKind > 0:/, "pointer down must apply :active only to route, event, or text-input targets");
  assert.match(sourceText, /WebSceneNodeHasCssVariantRule\(__csgSceneGraph, downRoute, downNodeId\)[\s\S]*WebSceneSetNodeInteractionState/, "pointer down must skip CSS state work for nodes without interaction variants");
  assert.match(sourceText, /fn __csg_scene_invalidate_route_runtime\(routeIndex: int32\): bool =[\s\S]*if readyIndex == routeIndex:[\s\S]*add\(nextReady, 0\)[\s\S]*add\(nextReady, __csgSceneRouteRuntimeReady\[readyIndex\]\)/, "route navigation must invalidate only the target route while preserving warm route caches");
  assert.match(sourceText, /WebSceneAddStateRouteDependency\(__csgSceneGraph,/, "retained runtime must register facts-driven state-to-route dependencies");
  assert.match(sourceText, /var __csgSceneRouteRuntimeStateVersions: int32\[\]/, "route caches must track the route state revision they materialized");
  assert.match(sourceText, /currentStateVersion = scene\.WebSceneRouteStateVersion\(__csgSceneGraph, routeIndex\)[\s\S]*__csgSceneRouteRuntimeStateVersions\[routeIndex\] == currentStateVersion/, "route cache hits must require the exact route-scoped React state revision");
  const effectRefreshBody = sourceText.match(/fn __csg_scene_refresh_effect_dirty_frame\(nodeId: int32\): bool =[\s\S]*?\n\n/)?.[0] ?? "";
  assert.doesNotMatch(effectRefreshBody, /__csgSceneRouteRuntimeReady = \[\]/, "one state effect must not eagerly discard every prewarmed route");
  assert.match(effectRefreshBody, /__csg_scene_invalidate_route_runtime\(activeRoute\)/, "state effects must rebuild the active route immediately while preserving unrelated route revisions");
  if (sourceText.includes("fn __m2SyncTick()")) {
    assert.match(sourceText, /fn __m2ConsumeRebuiltRoute\(\): int32 =[\s\S]*__csgSceneRuntimeRebuiltRoutePlusOne - 1/, "M2 replay must be scoped to the route that facts-driven layout rebuilt");
  }
  const routeCommitBody = sourceText.match(/fn __csg_scene_commit_pending_route\(\): int32 =[\s\S]*?\n\n/)?.[0] ?? "";
  assert.doesNotMatch(routeCommitBody, /__csgSceneRouteRuntimeReady = \[\]/, "route commit must not discard every prewarmed route");
  assert.doesNotMatch(routeCommitBody, /__csg_scene_invalidate_route_runtime\(__csgSceneRouteCommitTo\)/, "route commit must preserve a target route whose React state revision is still current");
  if (sourceText.includes("fn __m2SyncTick()")) {
    assert.match(routeCommitBody, /__csg_scene_apply_route_enter_effects\(__csgSceneRouteCommitTo\)[\s\S]*__m2SyncTick\(\)[\s\S]*__csg_scene_ensure_route_runtime_ready\(__csgSceneRouteCommitTo\)/, "route commit must apply dynamic state before checking the versioned target cache");
  } else {
    assert.match(routeCommitBody, /__csg_scene_apply_route_enter_effects\(__csgSceneRouteCommitTo\)[\s\S]*__csg_scene_ensure_route_runtime_ready\(__csgSceneRouteCommitTo\)/, "route commit must check the versioned target cache after route-enter effects");
  }
  assert.match(sourceText, /WebSceneRefreshStateTextGlyphRunsForRoute/, "retained mobile source must refresh dynamic state text glyph runs");
  if (sourceText.includes("handleVideoToggle")) {
    assert.match(sourceText, /fn __csg_scene_sync_video_click_media_control\(activeRoute: int32, nodeId: int32, effect: str\): int32 =[\s\S]*let slotIndex = scene\.WebSceneFindMediaPlaybackSlotIndexForNodeOrAncestor\(__csgSceneGraph, activeRoute, nodeId\)[\s\S]*if slotIndex < 0:[\s\S]*return 0[\s\S]*let currentState = __csgSceneGraph\.mediaPlaybackSlots\[slotIndex\]\.playbackState/, "compiled video click sync must ignore non-media nodes and read retained playback state");
    assert.match(sourceText, /if playing:[\s\S]*currentState == scene\.WebSceneMediaPlaybackPlaying \|\| currentState == scene\.WebSceneMediaPlaybackSeeked:[\s\S]*return 1[\s\S]*currentState == scene\.WebSceneMediaPlaybackClosed:[\s\S]*WebSceneApplyMediaControlForNode\(__csgSceneGraph, activeRoute, nodeId, "OpenAsset", true\)[\s\S]*WebSceneApplyMediaControlForNode\(__csgSceneGraph, activeRoute, nodeId, "Play", true\)/, "compiled video click sync must only open media from Closed and must not reopen paused playback");
    assert.match(sourceText, /currentState == scene\.WebSceneMediaPlaybackPaused \|\| currentState == scene\.WebSceneMediaPlaybackClosed:[\s\S]*return 1[\s\S]*WebSceneApplyMediaControlForNode\(__csgSceneGraph, activeRoute, nodeId, "Pause", true\)/, "compiled video click sync must avoid duplicate pause receipts");
    assert.match(sourceText, /fn __cht_video_apply_control\(handle: int64, actionKind: str\): bool =[\s\S]*let state = __csgSceneGraph\.mediaPlaybackSlots\[slotIndex\]\.playbackState[\s\S]*if actionKind == "Play":[\s\S]*if state != scene\.WebSceneMediaPlaybackClosed:[\s\S]*return false[\s\S]*WebSceneApplyMediaControl\(__csgSceneGraph, slotId, "OpenAsset"\)/, "compiled React video bridge must not use OpenAsset as a paused-play fallback");
    assert.match(sourceText, /if !__csg_scene_refresh_effect_dirty_frame\(nodeId\):[\s\S]*let __videoSyncStatus = __csg_scene_sync_video_click_media_control\(activeRoute, nodeId, __chtEffect\)[\s\S]*__csgSceneLastEventApplyStatus = -7/, "compiled video click must synchronize media slot after dirty-frame refresh, and hard-fail if sync fails");
  }
  const hasContentLocationOpen = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    String(fact.effect ?? "").startsWith("content_location_open:")
  );
  if (hasContentLocationOpen) {
    assert.equal(sceneFacts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      String(fact.effect ?? "").includes("handleLocationClick")
    ), false, "content location handlers must be rewritten from React handleLocationClick to native map commands");
    assert.match(sourceText, /@importc\("cheng_host_open_content_location"\)/, "retained mobile source must expose the native content-location map ABI");
    assert.match(sourceText, /fn chengOpenContentLocation\(contentJson: str\): int32 =[\s\S]*cheng_host_open_content_location\(strToCStringTemp\(contentJson\)\)/, "content location open must call the native map bridge with retained content JSON");
    assert.match(sourceText, /if scene\.WebSceneStrStartsWith\(__pubEffect, "content_location_open:"\):[\s\S]*let __contentLocationStatus = chengOpenContentLocation\(__contentLocationPayload\)[\s\S]*return 1/, "event dispatch must handle content location commands before generic click effects");
    if (sourceText.includes("fn __m2OpenContentLocationPoint")) {
      assert.match(sourceText, /fn __m2OpenContentLocationPoint\(xMilli: int32, yMilli: int32\): int32 =[\s\S]*__m2OpenHomeCardLocationPoint\(xMilli, yMilli\)[\s\S]*__m2OpenDetailLocationPoint\(xMilli, yMilli\)/, "dynamic M2 location hit-test must try GPS rows before media playback fallback");
    }
  }
  if (sourceText.includes("fn __m2RebindHomeList")) {
    assert.match(sourceText, /t[0-9]+ = shown\[[0-9]+\]\.title[\s\S]*if strutil\.Strip\(t[0-9]+\)\.len <= 0:[\s\S]*t[0-9]+ = shown\[[0-9]+\]\.content/, "home ContentCard runtime rebind must match React displayTitle title.trim fallback to content");
    assert.match(sourceText, /c\.locationHint = /, "home ContentCard runtime rebind seed must carry locationHint for S2 feed cards");
    assert.match(sourceText, /c\.f_type = "video"[\s\S]*c\.userName = [\s\S]*c\.media = "p2pmedia:\/\/[^"]+"[\s\S]*c\.mediaItems = \["p2pmedia:\/\/[^"]+"\]/, "home ContentCard runtime seed must preserve React content type, media source, mediaItems, and author fields");
    assert.match(sourceText, /@exportc\("cheng_app_distributed_contents_update_utf8"\)/, "home distributed feed must expose event-driven host update ABI");
    assert.match(sourceText, /@exportc\("cheng_app_debug_m2_contents_len"\)[\s\S]*@exportc\("cheng_app_debug_m2_shown_len"\)[\s\S]*@exportc\("cheng_app_debug_m2_media_kind"\)/, "home distributed feed must expose M2 rebind diagnostics for Android parity debugging");
    assert.match(sourceText, /fn __m2ApplyDistributedContentsJson\(raw: str\): bool =/, "home distributed feed must parse host JSON into __m2Contents");
    assert.match(sourceText, /fn __m2CloneStr\(value: str\): str =[\s\S]*NewStringCopy\(StrDataPtr\(value\), n\)[\s\S]*fn __m2JsonStr\(node: json\.JsonNode, key: str\): str =[\s\S]*return __m2CloneStr\(value\)[\s\S]*json\.JsonNodeTryGetStr\(arr\.a\[i\], item\):[\s\S]*add\(out, __m2CloneStr\(item\)\)/, "distributed feed JSON strings stored in M2 state must be owned copies");
    assert.match(sourceText, /fn __m2MergeDistributedContents\(next: DistributedContent\[\]\): bool =[\s\S]*__m2FindContentIndexById\(__m2Contents, incoming\.id\)[\s\S]*remove\(__m2Contents, existingIndex\)[\s\S]*__m2Contents\[existingIndex\] = incoming[\s\S]*add\(__m2Contents, incoming\)/, "home distributed feed update must merge by content id and use tombstones for deletion");
    assert.match(sourceText, /let changed = __m2MergeDistributedContents\(next\)[\s\S]*if !changed:[\s\S]*return true[\s\S]*__m2TitlesPrimed = false/, "empty distributed snapshots must not clear compiled PWA content seeds");
    assert.match(sourceText, /fn __m2CanonicalHomeCategory\(value: str\): str =[\s\S]*normalized == ".*video.*"[\s\S]*return "content"/, "home ContentCard runtime must canonicalize React video/category aliases to publishCategory keys");
    assert.match(sourceText, /fn __m2EnsureHomeState\(\) =[\s\S]*homeStateInit\(\)[\s\S]*setActiveCategory\("content"\)[\s\S]*scene\.WebSceneSetStateValue\(__csgSceneGraph, "activeCategory", "content"\)/, "home ContentCard runtime must seed scene activeCategory to React's default content channel independently from feed data");
    assert.match(sourceText, /fn __m2ApplyDistributedContentsJson\(raw: str\): bool =[\s\S]*__m2EnsureContents\(\)[\s\S]*let itemsNode = __m2DistributedContentItemsNode/, "distributed snapshots must initialize compiled PWA content seeds before applying host deltas");
    assert.match(sourceText, /maxTimestamp = c\.timestamp[\s\S]*__m2NowMs = maxTimestamp \+ int64\(3600000\)[\s\S]*jsSetNowMs\(__m2NowMs\)/, "home distributed feed update must advance JS now to the dynamic feed timestamp range");
    assert.match(sourceText, /out\.f_type = __m2JsonStr\(node, "type"\)[\s\S]*out\.publishCategory = category[\s\S]*out\.locationHint = __m2JsonStr\(node, "locationHint"\)/, "home distributed feed parser must carry core React Content fields");
    assert.match(sourceText, /fn __m2ContentMediaSource\(media0: str, mediaItems0: str\[\], coverMedia0: str\): str =[\s\S]*mediaItems0\[0\][\s\S]*coverMedia0/, "home distributed feed must derive media source from React content fields");
    assert.match(sourceText, /WebSceneUpdateLocalMediaPlaybackSlot\(__csgSceneGraph, "unimaker\.truth\.video\.slot\.0\.[0-9]+", m[0-9]+, __m2ContentMimeForKind\(mediaKind[0-9]+\), mediaKind[0-9]+\)/, "home ContentCard runtime rebind must update local media playback slot");
    assert.match(sourceText, /fn __m2ObserveRouteApply\(\) =[\s\S]*if __csgSceneLastRouteApplyTo == 0:[\s\S]*__m2TitlesPrimed = false[\s\S]*__home_dirty = true/, "home ContentCard runtime rebind must invalidate cached paint after route rebuild returns home");
    assert.match(sourceText, /fn __m2SyncTick\(\) =\n    if !__csgSceneInitialized:/, "M2 sync must not be gated by __csgSceneRendered because rebind itself dirties the frame");
    assert.match(sourceText, /__m2DebugContentsLen = __m2Contents\.len[\s\S]*__m2DebugShownLen = shown\.len[\s\S]*__m2DebugRebindApplied = 1/, "home ContentCard runtime rebind diagnostics must report contents, shown list, and applied state");
    assert.match(sourceText, /fn __m2RebindActiveDetail\(\): bool =[\s\S]*__m2SelectHomeCardNode\(__csgSceneLastRouteApplyNode\)[\s\S]*WebSceneUpdateLocalMediaPlaybackSlot\(__csgSceneGraph, "unimaker\.truth\.video\.slot\.[0-9]+\.[0-9]+", mediaSource, mediaMime, mediaKind\)[\s\S]*WebSceneSetNodePropValue\(__csgSceneGraph, [0-9]+, [0-9]+, "src", mediaSource\)/, "detail route runtime rebind must update selected local media source and slot");
    assert.match(sourceText, /fn __m2RebindActiveDetail\(\): bool =[\s\S]*if mediaKind == 1 && mediaSource\.len > 0:[\s\S]*WebSceneSetStateValue\(__csgSceneGraph, "resolvedVideoSrc", mediaSource\)/, "detail route runtime rebind must open video DOM for any non-empty video source, including p2pmedia payloads");
    assert.match(sourceText, /fn __m2RebindActiveDetail\(\): bool =[\s\S]*if mediaKind == 1 && mediaSource\.len > 0:[\s\S]*if __m2IsLocalMediaSource\(mediaSource\):[\s\S]*WebSceneUpdateLocalMediaPlaybackSlot\(__csgSceneGraph, "unimaker\.truth\.video\.slot\.[0-9]+\.[0-9]+", mediaSource, mediaMime, mediaKind\)/, "detail route runtime rebind must restrict local slot mutation to real local media sources");
    assert.match(sourceText, /fn __m2RebindActiveDetail\(\): bool =[\s\S]*WebSceneSetStateValue\(__csgSceneGraph, "resolvedVideoSrc", mediaSource\)[\s\S]*WebSceneSetStateValue\(__csgSceneGraph, "videoLoadState", "ready"\)[\s\S]*__csg_scene_invalidate_route_runtime\([0-9]+\)[\s\S]*__csg_scene_ensure_route_runtime_ready\([0-9]+\)/, "detail route runtime rebind must set React video visibility state before rebuilding only the detail layout");
    assert.match(sourceText, /fn __m2RebindActiveDetail\(\): bool =[\s\S]*__csg_scene_ensure_route_runtime_ready\([0-9]+\)[\s\S]*__m2ApplyTextNode\([0-9]+, [0-9]+, title\)/, "detail route runtime rebind must apply dynamic text after conditional video layout is rebuilt");
    assert.match(sourceText, /fn __csg_scene_commit_pending_route\(\): int32 =[\s\S]*__csgSceneLastRouteApplyStatus = 1[\s\S]*__m2SyncTick\(\)[\s\S]*__csg_scene_ensure_route_runtime_ready\(__csgSceneRouteCommitTo\)/, "queued route commit must run M2 rebind before presenting the target frame");
    assert.match(sourceText, /__csgSceneMediaUploadDone = false/, "dynamic media rebind must force media surface command upload");
    if (sourceText.includes("__m2LastLocation")) {
      assert.match(sourceText, /l[0-9]+ = strutil\.Strip\(shown\[[0-9]+\]\.locationHint\)/, "home ContentCard runtime location rebind must read locationHint");
      assert.match(sourceText, /WebSceneApplyTextControlPaintValue\(__csgSceneGraph, 0, [0-9]+, l[0-9]+\)/, "home ContentCard runtime location rebind must update the location paint node");
    }
  }
  assert.match(sourceText, /__csg_scene_find_route_hit_target_node/, "retained mobile source must route dynamic layout hit targets");
  assert.match(sourceText, /fn __csg_scene_find_descendant_event_target_within_box\(routeIndex: int32, rootNodeId: int32, xMilli: int32, yMilli: int32, eventName: str\): int32 =/, "retained mobile source must resolve child click targets inside a top-level hit box");
  assert.match(sourceText, /scene\.WebSceneNodeInSubtree\(__csgSceneGraph, rootNodeId, boxNodeId\)[\s\S]*scene\.WebSceneNodeInSubtree\(__csgSceneGraph, rootNodeId, eventNode\)/, "retained mobile child hit resolution must stay inside the blocking subtree");
  assert.match(sourceText, /@exportc\("cheng_app_on_back"\)/, "retained mobile source must export host-callable back handling");
  assert.match(sourceText, /@exportc\("cheng_app_text_input_utf8"\)/, "retained mobile source must expose text input state updates");
  assert.match(sourceText, /@exportc\("cheng_app_text_input_cursor_utf8"\)/, "retained mobile source must expose cursor-aware text input state updates");
  assert.match(sourceText, /@exportc\("cheng_mobile_host_runtime_export_scene_state_snapshot_utf8"\)/, "retained mobile source must expose scene state snapshot export ABI");
  assert.match(sourceText, /@exportc\("cheng_mobile_host_runtime_restore_scene_state_snapshot_utf8"\)/, "retained mobile source must expose scene state snapshot restore ABI");
  assert.match(sourceText, /"schema", "cheng\.scene\.state_snapshot\.v1"/, "retained mobile source must tag lifecycle scene snapshot schema");
  assert.match(sourceText, /json\.JsonSetFieldStr\(states, stateRef, scene\.WebSceneStateValueForRef\(__csgSceneGraph, stateRef\)\)/, "retained mobile source must snapshot concrete scene state values");
  assert.match(sourceText, /scene\.WebSceneSeedStateValue\(__csgSceneGraph, stateRef, value\)/, "retained mobile source must restore concrete scene state values without per-state binding side effects");
  assert.match(sourceText, /fn __csg_scene_present_dirty_frame\(\): bool =[\s\S]*__csg_scene_prepare_active_route_media_surfaces\(activeRoute, viewportWidth, viewportHeight\)[\s\S]*__csg_scene_present_compositor_frame\(__csgSceneDirtyFrame, viewportWidth, viewportHeight\)/, "retained mobile dirty frames must prepare media textures before compositor present");
  assert.match(sourceText, /fn __csg_scene_present_transition_frame\(\): bool =[\s\S]*__csg_scene_prepare_active_route_media_surfaces\(activeRoute, viewportWidth, viewportHeight\)[\s\S]*__csg_scene_present_compositor_frame\(__csgSceneTransitionFrame, viewportWidth, viewportHeight\)/, "retained mobile transition frames must prepare media textures before compositor present");
  assert.match(sourceText, /fn __csg_scene_restore_text_input_bindings_for_route\(routeIndex: int32\): bool =/, "retained mobile source must rebind restored text input state after picker runtime recreation");
  assert.match(sourceText, /scene\.WebSceneFindTextInputNodeForStateRef\(__csgSceneGraph, routeIndex, stateRef\)[\s\S]*scene\.WebSceneApplyTextControlPaintValue\(__csgSceneGraph, routeIndex, nodeId, value\)/, "retained mobile source must project restored input state back into input and textarea paint");
  assert.match(sourceText, /return "mediaPreviews"/, "retained mobile source must snapshot mediaPreviews truthy state for picker cover frames");
  assert.match(sourceText, /return "mediaFiles"/, "retained mobile source must snapshot selected media files");
  assert.match(sourceText, /return "title"/, "retained mobile source must snapshot publish title text");
  assert.match(sourceText, /@exportc\("cheng_mobile_host_runtime_apply_product_csv_selection"\)/, "retained mobile source must expose product CSV file selection ABI");
  assert.match(sourceText, /WebSceneApplyProductCsvSelection/, "retained mobile source must apply product CSV selection through Cheng scene runtime");
  assert.match(sourceText, /cheng_app_computer_use_compile_text_utf8/, "retained mobile source must expose native computer-use text compiler");
  assert.match(sourceText, /cheng_app_computer_use_gui_replay_start/, "retained mobile source must expose native computer-use GUI replay start");
  assert.match(sourceText, /fn cheng_app_computer_use_gui_replay_tick\(deltaMs: int32\): int32 =/, "retained mobile source must expose native computer-use GUI replay tick");
  assert.match(sourceText, /fn __csg_cu_apply_gui_replay_step\(templateCode: int32, stepIndex: int32\): bool =/, "retained mobile source must apply GUI replay steps through CSG semantic state");
  assert.match(sourceText, /cheng_app_debug_computer_use_gui_replay_active/, "retained mobile source must expose GUI replay active diagnostics");
  assert.match(sourceText, /cheng_app_debug_computer_use_gui_replay_step_index/, "retained mobile source must expose GUI replay step-index diagnostics");
  assert.match(sourceText, /cheng_app_debug_computer_use_gui_replay_step_count/, "retained mobile source must expose GUI replay step-count diagnostics");
  assert.match(sourceText, /cheng_app_debug_computer_use_gui_replay_applied_count/, "retained mobile source must expose GUI replay applied-count diagnostics");
  assert.match(sourceText, /cheng_app_debug_computer_use_gui_replay_last_status/, "retained mobile source must expose GUI replay last-status diagnostics");
  assert.match(sourceText, /cheng_app_debug_computer_use_manifest_ready/, "retained mobile source must expose computer-use manifest readiness");
  assert.match(sourceText, /cheng_app_debug_computer_use_last_title_utf8/, "retained mobile source must expose parsed publish title for host media selection");
  assert.match(sourceText, /cheng_app_computer_use_media_selection_result_with_preview_utf8/, "retained mobile source must accept host MediaStore video selection results with cover-frame readiness");
  assert.match(sourceText, /fn cheng_app_computer_use_media_selection_result_with_preview_utf8\(uriRaw: cstring, nameRaw: cstring, localPathRaw: cstring, sizeBytes: int64, durationMs: int64, status: int32, previewReady: int32\): int32 =/, "retained mobile source must expose the MediaStore local-path plus cover-frame ABI");
  assert.match(sourceText, /computerUseSelectedVideoUri/, "retained mobile source must write host-selected video uri into runtime state");
  assert.match(sourceText, /computerUseSelectedVideoLocalPath/, "retained mobile source must write host-copied video local path into runtime state");
  assert.match(sourceText, /computerUseSelectedVideoSizeBytes/, "retained mobile source must write host-copied video byte size into runtime state");
  assert.match(sourceText, /WebSceneApplyMediaSelectionPayloadWithPreview\(__csgSceneGraph, "content", localPath, previewInstalled\)/, "computer-use selected short video must populate mediaFiles and cover-frame state through the production media selection path");
  assert.match(sourceText, /WebSceneApplyMediaSelectionPayloadWithPreview\(__csgSceneGraph, "content", localPath, previewInstalled\)[\s\S]*__csg_scene_refresh_effect_dirty_frame\(0\)/, "computer-use selected short video must relayout state-conditional media preview DOM");
  assert.match(sourceText, /WebSceneApplyMediaSelectionPayloadWithPreview\(__csgSceneGraph, "content", localPath, previewInstalled\)[\s\S]*__csg_scene_capture_location_for_segment\("location_capture:publish:locationMessage:locationStatus:locationMessage"\)[\s\S]*chengPublish\(localPath, "content", publishLocationHint\)/, "computer-use selected short video must trigger the production publish bridge after media and location are ready");
  assert.match(sourceText, /cheng_app_debug_computer_use_last_media_local_path_byte_len/, "retained mobile source must expose host-copied video local path diagnostics");
  assert.match(sourceText, /fn __csg_scene_effect_is_native_intercepted\(effect: str\): bool =[\s\S]*external-publish:/, "native command effects must be recognized before compiled React handlers");
  if (sourceText.includes("let __chtHidx = scene.WebSceneFindEventHandlerForNodeEvent(__csgSceneGraph, activeRoute, nodeId, \"click\")")) {
    assert.match(sourceText, /if !__csg_scene_effect_is_native_intercepted\(__chtEffect\) && scene\.WebSceneEventEffectGuardsPass\(__csgSceneGraph, __chtEffect\):/, "compiled handler prepass must not consume native command effects such as external-publish");
  }
  if (sourceText.includes("external-publish:")) {
    assert.match(sourceText, /__pubLocReady = scene\.WebSceneStateValueForRef\(__csgSceneGraph, __pubStatusRef\) == "ready"[\s\S]*if !__pubLocReady:[\s\S]*let __pubCapStatus = __csg_scene_capture_location_for_segment\(__pubLocSeg\)/, "external publish must use existing ready location state before attempting a fresh capture");
    assert.match(sourceText, /let __pubPublishSeg = __csg_scene_effect_segment_with_prefix\(__pubEffect, "external-publish:"\)[\s\S]*let __pubKind = __csg_scene_effect_part_after_prefix\(__pubPublishSeg, "external-publish:", 0\)/, "external publish kind must be parsed from its own effect segment");
    assert.doesNotMatch(sourceText, /let __pubKind = __csg_scene_effect_part_after_prefix\(__pubEffect, "external-publish:", 0\)/, "external publish kind must not include following semicolon-delimited effect segments");
  }
  assert.match(sourceText, /cheng_app_debug_computer_use_chat_bridge_ready/, "retained mobile source must expose Xiaoyou chat computer-use bridge diagnostics");
  assert.match(sourceText, /fn __csg_cu_submit_chat_text\(text: str\): int32 =[\s\S]*cheng_app_computer_use_compile_text_utf8\(raw, __csg_cu_current_execution_mode\(\), __csg_cu_current_slow_permille\(\)\)/, "Xiaoyou chat send must compile text through current computer-use mode and slow setting");
  assert.match(sourceText, /fn __csg_cu_apply_computer_use_settings_click\(activeRoute: int32, nodeId: int32\): int32 =[\s\S]*__csgComputerUseExecutionMode = 1/, "sidebar human mode must update retained computer-use execution mode");
  assert.match(sourceText, /fn __csg_cu_apply_settings_text_input\(routeIndex: int32, nodeId: int32, value: str\): int32 =[\s\S]*__csgComputerUseCurrentSlowPermille = __csg_cu_parse_slow_permille\(value\)/, "sidebar slow playback input must update retained slow permille");
  assert.match(sourceText, /fn __csg_cu_skip_delimiters\(text: str, start: int32\): int32 =/, "retained mobile computer-use parser must skip delimiters after field markers");
  assert.match(sourceText, /__csg_cu_extract_until_punctuation\(text, __csg_cu_skip_delimiters\(text, index \+ marker\.len\)\)/, "retained mobile computer-use parser must accept marker-space-value fields");
  assert.match(sourceText, /fn __csg_cu_extract_tail_after_marker\(text: str, marker: str\): str =[\s\S]*return __csg_cu_trim_delimiters\(strings\.SliceBytes\(text, start, text\.len - start\)\)[\s\S]*var value = __csg_cu_extract_tail_after_marker\(text, "文案"\)[\s\S]*value = __csg_cu_extract_tail_after_marker\(text, "描述"\)/, "retained mobile computer-use parser must keep multi-word publish descriptions");
  assert.match(sourceText, /cheng_app_debug_computer_use_current_slow_permille/, "retained mobile source must expose current slow playback diagnostics for Android host");
  const currentSlowPermilleFn = sourceText.match(/fn __csg_cu_current_slow_permille\(\): int32 =[\s\S]*?\n\n/)?.[0] ?? "";
  assert.doesNotMatch(currentSlowPermilleFn, /__csg_scene_build|WebSceneNodePropValue/, "current slow diagnostics must read retained state without rebuilding or reading the scene graph");
  assert.match(sourceText, /let implicitRaw = __csg_cu_strip_suffix_once\(raw, "的"\)/, "native computer-use title extraction must strip the implicit 的 before 视频/广告视频 suffixes");
  assert.match(sourceText, /if \(__csg_cu_contains\(text, "广告"\)[\s\S]*\n        __csg_cu_set_last_task\(2, [0-9]+, [0-9]+, [0-9]+\)[\s\S]*\n    if \(__csg_cu_contains\(text, "短视频"\)/, "ad video computer-use task stats must be scoped inside its intent branch");
  assert.doesNotMatch(sourceText, /\n    __csg_cu_set_last_task\([1-8], [0-9]+, [0-9]+, [0-9]+\)\n        if !__csg_cu_apply_/, "computer-use task stats must not escape intent branches");
  const hasMessageThreadRoute = sceneFacts.some((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "message_thread");
  if (hasMessageThreadRoute) {
    assert.match(sourceText, /cheng_app_debug_computer_use_chat_bridge_ready\(\): int32 =\n    return 1/, "retained mobile source must expose a ready Xiaoyou chat computer-use bridge when the chat route exists");
    assert.match(sourceText, /fn __csg_cu_apply_chat_send\(activeRoute: int32, nodeId: int32\): int32 =[\s\S]*WebSceneNodePropValue\(__csgSceneGraph, [0-9]+, [0-9]+, "value"\)/, "Xiaoyou chat send must read the retained chat input value");
  }
  const hasSocialGroupCreateHandler = sceneFacts.some((fact) =>
    fact.kind === "csg.web.scene.event_handler" &&
    fact.routeId === "tab_nodes" &&
    fact.handler === "handleCreateGroup" &&
    fact.effect === "social_group_create_selected:selectedPeerIds:filteredNodes:peerId"
  );
  if (hasSocialGroupCreateHandler) {
    assert.match(sourceText, /fn __csg_scene_apply_social_group_create\(activeRoute: int32\): int32 =/, "retained mobile source must lower handleCreateGroup into a Cheng social group command");
    assert.match(sourceText, /WebSceneSetStateValue\(__csgSceneGraph, "chatId", strings\.ConcatStr\("group:", groupId\)\)/, "social group create success must project React chatSession id into group chatId state");
    assert.match(sourceText, /WebSceneSetStateValue\(__csgSceneGraph, "chatName", createdName\)/, "social group create success must project React chatSession name into chatName state");
    assert.match(sourceText, /WebSceneSetStateValue\(__csgSceneGraph, "isGroup", "true"\)/, "social group create success must project React chatSession isGroup state");
    assert.match(sourceText, /WebSceneSetStateValue\(__csgSceneGraph, "showSocialExtensions", "false"\)/, "social group ChatPage must match React showSocialExtensions={!chatSession.isGroup}");
    assert.match(sourceText, /WebSceneSetActiveRouteById\(__csgSceneGraph, "node_thread"\)/, "social group create success must route into the retained ChatPage");
    assert.match(sourceText, /fromRoute == [0-9]+ && scene\.WebSceneStrStartsWith\(scene\.WebSceneStateValueForRef\(__csgSceneGraph, "chatId"\), "group:"\):[\s\S]*backTarget = [0-9]+/, "system back from group ChatPage must return to tab_nodes instead of node_detail");
  }
  assert.match(sourceText, /publish_ad_video_draft/, "retained mobile source must embed ad video computer-use template");
  assert.match(sourceText, /feed_filter_review/, "retained mobile source must embed feed filter computer-use template");
  assert.match(sourceText, /content_like_review/, "retained mobile source must embed content like computer-use template");
  assert.match(sourceText, /message_history_browse_review/, "retained mobile source must embed message history browse computer-use template");
  assert.match(sourceText, /fn __csg_cu_apply_route_action\(routeId: str, routeIndex: int32\): bool =/, "retained mobile computer-use must implement the generic route navigation action");
  assert.match(sourceText, /fn __csg_cu_apply_scroll_action\(routeIndex: int32, deltaY: int32\): bool =[\s\S]*WebSceneRouteContentScrollMax\(__csgSceneGraph, routeIndex\)[\s\S]*WebSceneSetContentScrollY\(__csgSceneGraph, routeIndex, targetScrollY\)/, "retained mobile computer-use must implement the generic scroll action through clamped scene content scroll");
  assert.match(sourceText, /if templateCode == 7:[\s\S]*?__csg_cu_apply_content_like\(\)/, "retained mobile replay dispatch must cover the content like template");
  assert.match(sourceText, /if templateCode == 8:[\s\S]*?__csg_cu_apply_route_action\("tab_messages"[\s\S]*?__csg_cu_apply_scroll_action\(/, "retained mobile replay dispatch must cover the message browse route and scroll steps");
  assert.match(sourceText, /__csg_cu_contains\(text, "点赞"\)/, "retained mobile computer-use text compiler must classify like intents");
  assert.match(sourceText, /__csg_cu_contains\(text, "聊天记录"\)/, "retained mobile computer-use text compiler must classify message browse intents");
  assert.match(sourceText, /__csg_cu_prepare_route\("publish_content"/, "retained mobile computer-use must drive semantic publish route");
  assert.match(sourceText, /fn __csg_cu_text_control_state_ref\(routeIndex: int32, nodeId: int32\): str =/, "retained mobile computer-use must map known text controls to React state refs");
  assert.match(sourceText, /WebSceneSetStateValue\(__csgSceneGraph, stateRef, value\)/, "retained mobile computer-use text controls must update React state refs");
  const computerUseTextControlFn = sourceText.match(/fn __csg_cu_apply_text_control\(routeIndex: int32, nodeId: int32, value: str\): bool =[\s\S]*?\n\n/)?.[0] ?? "";
  assert.match(computerUseTextControlFn, /WebSceneSetStateValue\(__csgSceneGraph, stateRef, value\)[\s\S]*WebSceneSetNodePropValue\(__csgSceneGraph, routeIndex, nodeId, "value", value\)[\s\S]*WebSceneApplyTextControlPaintValue/, "retained mobile computer-use controlled inputs must update state and visible DOM paint in one write");
  assert.doesNotMatch(computerUseTextControlFn, /WebSceneSetStateValue\(__csgSceneGraph, stateRef, value\)[\s\S]*return true[\s\S]*WebSceneSetNodePropValue/, "retained mobile computer-use controlled inputs must not return before updating visible DOM paint");
  assert.match(sourceText, /WebSceneApplyTextControlPaintValue/, "retained mobile computer-use must update retained text controls");
  assert.doesNotMatch(sourceText, /ASI 助手|我是 ASI \(Artificial Super Intelligence\)/, "retained mobile source must use Xiaoyou assistant copy");
  assert.match(sourceText, /cheng_app_media_control/, "retained mobile source must expose typed media control actions");
  if (sourceText.includes("handleVideoToggle")) {
    assert.match(sourceText, /elif scene\.WebSceneStrStartsWith\(effect, "invoke:"\):[\s\S]*__chtName = strings\.SliceBytes\(effect, 7, len\(effect\) - 7\)/, "compiled React dispatcher must accept retained invoke effects for compiled handlers");
    assert.match(sourceText, /scene\.WebSceneStrStartsWith\(effect, "invoke:"\):[\s\S]*return effect[\s\S]*scene\.WebSceneStrStartsWith\(segment, "invoke:"\):[\s\S]*return segment/, "compiled handler prepass must extract invoke effect segments before generic scalar handling");
    assert.match(sourceText, /fn __cht_video_apply_control\(handle: int64, actionKind: str\): bool =[\s\S]*WebSceneApplyMediaControl\(__csgSceneGraph, slotId, actionKind\)/, "compiled React video handlers must dispatch typed media controls");
    assert.doesNotMatch(sourceText, /cheng_host_video_play_slot|cheng_host_video_pause_slot|cheng_host_video_paused/, "compiled React video handlers must not use inert host video stubs");
  }
  assert.match(sourceText, /WebSceneHasActiveRouteMediaPlayback/, "retained mobile source must keep frame demand while media is playing");
  assert.match(sourceText, /WebSceneApplyMediaControlWithPayload/, "retained mobile source must route media action payloads through CSG receipts");
  assert.match(sourceText, /cheng_app_debug_media_receipt_action_code_at/, "retained mobile source must expose media receipt action diagnostics");
  assert.match(sourceText, /cheng_app_debug_media_receipt_status_at/, "retained mobile source must expose media receipt status diagnostics");
  assert.match(sourceText, /cheng_app_debug_media_receipt_state_at/, "retained mobile source must expose media receipt playback state diagnostics");
  assert.match(sourceText, /cheng_app_debug_media_receipt_kind_at/, "retained mobile source must expose media receipt kind diagnostics");
  assert.doesNotMatch(sourceText, /WebSceneApplyAllRouteLayoutsToPaintOps/, "retained mobile source must not apply every route layout at startup");
  assert.match(sourceText, /WebSceneApplyRouteLayoutToPaintOps[\s\S]*WebSceneApplyCssVariantRulesToPaintOps/, "retained mobile source must apply CSS after route layout establishes base geometry");
  assert.match(sourceText, /var __csgSceneViewportWidth: int32/, "retained mobile source must keep runtime viewport width");
  assert.match(sourceText, /var __csgSceneViewportHeight: int32/, "retained mobile source must keep runtime viewport height");
  assert.match(sourceText, /fn __csg_scene_invalidate_viewport_runtime\(\): bool =[\s\S]*WebSceneInvalidateAllLayerCaches/, "retained mobile source must invalidate layer caches when viewport changes");
  assert.match(sourceText, /WebSceneApplyRouteLayoutToPaintOps\(__csgSceneGraph, routeIndex, viewportWidth, viewportHeight\)/, "retained mobile route layout must consume runtime viewport");
  assert.match(sourceText, /__csg_scene_present_compositor_frame\(routeFrame, viewportWidth, viewportHeight\)/, "retained mobile active route present must consume runtime viewport");
  assert.match(sourceText, /cheng_app_set_window[\s\S]*__csgSceneViewportWidth = physicalW[\s\S]*__csgSceneViewportHeight = physicalH/, "retained mobile set_window must update runtime viewport");
  assert.doesNotMatch(sourceText, /WebSceneApplyRouteLayoutToPaintOps\(__csgSceneGraph, routeIndex, 390, 844\)/, "retained mobile route layout must not be locked to the offline default viewport");
  assert.doesNotMatch(sourceText, /__csg_scene_present_compositor_frame\(routeFrame, 390, 844\)/, "retained mobile active route present must not be locked to the offline default viewport");
  assert.match(sourceText, /WebSceneGlyphAtlasFontSdfAtlasIdAt/, "retained mobile source must expose glyph SDF atlas id");
  assert.match(sourceText, /WebSceneGlyphAtlasGlyphSdfSpreadPxAt/, "retained mobile source must expose glyph SDF spread");
  assert.match(sourceText, /WebSceneGlyphAtlasGlyphSdfPxRangeAt/, "retained mobile source must expose glyph SDF px range");
  assert.match(sourceText, /WebSceneGlyphAtlasSdfPixelCount/, "retained mobile source must expose glyph SDF pixel data");
  assert.match(sourceText, /WebSceneEncodeGlyphSdfAtlasHostBatch/, "retained mobile source must encode glyph SDF atlas host batches");
  assert.match(sourceText, /WebSceneEncodeGlyphSdfMetadataHostBatch/, "retained mobile source must encode glyph SDF metadata host batches");
  assert.match(sourceText, /currentRunCount == __csgSceneLastGlyphSdfRunCount[\s\S]*currentRunGlyphCount == __csgSceneLastGlyphSdfRunGlyphCount/, "retained mobile glyph upload cache must include metadata counts, not only SDF pixel version");
  assert.match(sourceText, /WebSceneLoadPrecomputedGlyphSdfAtlasHostBatchesWithoutPixels/, "retained mobile source must load precomputed glyph metadata without materializing pixel words when pixel asset is present");
  assert.match(sourceText, /__csg_mobile_host_trace_step\(__csgSceneBuildStep\)/, "retained mobile source must trace build stages during app init");
  assert.match(sourceText, /WebSceneGraphPrepareCapacity\(__csgSceneGraph, capacityPlan\)/, "retained mobile source must preallocate scene graph arrays from asset counts");
  assert.doesNotMatch(sourceText, /__csgSceneGlyphAdoptPixels/, "retained mobile source must not adopt glyph pixel asset into int32[] at startup");
  assert.doesNotMatch(sourceText, /rawbytes\.BytesGet\(__csgSceneGlyphSdfPixelBytes, pixelIndex\)/, "retained mobile source must not convert glyph pixel asset bytes into int32 words");
  assert.doesNotMatch(sourceText, /WebSceneGlyphAtlasSdfPixelAt\(__csgSceneGlyphAtlas, pixelIndex\)/, "retained mobile source must not repack glyph pixel asset bytes on upload");
  assert.match(sourceText, /__csg_mobile_host_upload_image_atlas/, "retained mobile source must submit image atlas before image replay");
  assert.match(sourceText, /__csg_mobile_host_upload_svg_display_list_atlas/, "retained mobile source must submit SVG display-list atlas before icon replay");
  assert.match(sourceText, /__csg_mobile_host_upload_glyph_sdf_atlas_bytes/, "retained mobile source must submit glyph SDF pixel asset bytes before text replay");
  assert.match(sourceText, /WebSceneBuildCompositorFrameForRouteWithFullAtlases/, "retained mobile source must build atlas-backed active route compositor frames");
  assert.match(sourceText, /WebSceneEncodeGpuCommandHostBatch/, "retained mobile source must encode host GPU batches");
  assert.match(sourceText, /WebSceneBuildRouteMediaSurfaceCommands/, "retained mobile source must build media surface commands for the active route");
  assert.match(sourceText, /WebSceneEncodeMediaSurfaceCommandHostBatch/, "retained mobile source must encode media surface host batches");
  assert.match(sourceText, /__csg_scene_prepare_media_surface_textures/, "retained mobile source must prepare media textures before presenting host batches");
  assert.match(sourceText, /__csg_mobile_host_prepare_media_surface_texture\(kindCode, surfaceKindHostCode, textureProviderHostCode, slotIdRaw, assetCidRaw, manifestCidRaw, posterCidRaw, width, height, peerHostRaw, peerPort, playbackState\)/, "retained mobile source must pass cstring-lowered media IDs + per-card peer透传 + playback state through the prepare ABI");
  assert.match(sourceText, /__csg_scene_record_media_surface_prepare\(1, mediaSurfaceCommands, mediaSurfaceIndex, mediaSurfaceCommandCount\)/, "retained mobile source must record successful media prepare receipts in Cheng");
  assert.match(sourceText, /__csg_scene_record_media_surface_prepare\(10, mediaSurfaceCommands, mediaSurfaceIndex, mediaSurfaceCommandCount\)/, "retained mobile source must record failed media prepare receipts in Cheng");
  assert.match(sourceText, /WebSceneMediaSurfacePosterCidAt/, "retained mobile source must include poster cid in media surface prepare");
  assert.match(sourceText, /__csg_scene_prepare_active_route_media_surfaces/, "retained mobile source must prepare media surfaces during active route presentation");
  assert.match(sourceText, /__csg_mobile_host_present_media_surface_commands/, "retained mobile source must submit media surface batches to the host ABI");
  assert.match(sourceText, /__csgSceneLastMediaSurfaceStatus = 10/, "retained mobile source must expose media surface provider failure as a distinct media status");
  assert.match(sourceText, /let mediaSurfacePrepared = __csg_scene_prepare_active_route_media_surfaces/, "retained mobile source must not let media overlay prepare control the main route frame");
  // Media surfaces are in-frame GPU commands now (paint order), so dirty/transition presents may
  // hard-fail on prepare failure; only the main route frame must keep the recorded
  // `let mediaSurfacePrepared` form so the prime stage diagnostics survive the failure path.
  const presentActiveRouteBody = sourceText.match(/fn __csg_scene_present_active_route\(\): bool =[\s\S]*?\n\nfn /)?.[0] ?? "";
  assert.match(presentActiveRouteBody, /let mediaSurfacePrepared = __csg_scene_prepare_active_route_media_surfaces/, "main route frame presentation body must capture media prepare into the recorded diagnostic form");
  assert.doesNotMatch(presentActiveRouteBody, /if !__csg_scene_prepare_active_route_media_surfaces[\s\S]{0,120}return false/, "retained mobile source must not block the main route frame on media overlay failure");
  assert.match(sourceText, /WebSceneLayerCacheMarkValid/, "retained mobile source must maintain layer caches");
  assert.match(sourceText, /WebSceneBuildRouteTransitionPlan/, "retained mobile source must compute route transition plans");
  assert.match(sourceText, /WebSceneBuildCompositorFrameForRouteTransitionPlanWithFullAtlases/, "retained mobile source must compute compositor transition frames");
  assert.doesNotMatch(sourceText, /WebInkTransitionStartAtLastTap/, "retained mobile navigation must not inject a non-React route animation");
  assert.match(sourceText, /WebSceneBuildCompositorFrameForDirtySpanWithFullAtlases/, "retained mobile source must compute dirty subtree compositor frames");
  assert.match(sourceText, /__csg_scene_present_active_route\(\): bool =[\s\S]*WebSceneBuildCompositorFrameForRouteWithFullAtlases[\s\S]*__csg_scene_present_compositor_frame\(routeFrame/, "retained mobile active route presentation must populate compositor layer caches");
  assert.match(sourceText, /WebSceneEncodeCompositorFrameHostBatch/, "retained mobile source must encode compositor layer host batches");
  assert.match(sourceText, /WebSceneApplyCssVariantRulesToPaintOps/, "retained mobile source must apply stateful CSS declarations to paint ops");
  assert.match(sourceText, /WebSceneAddMediaAsset/, "retained mobile source must load CSG media asset facts");
  assert.match(sourceText, /WebSceneAddMediaPlaybackSlot/, "retained mobile source must bind media playback slots to retained nodes");
  assert.match(sourceText, /WebSceneAddMediaControlAction/, "retained mobile source must load typed media control actions");
  const sceneDataBytes = readFileSync(join(outDir, "runtime", "unimaker_scene_data.bin"));
  const expectedSceneDataAsset = buildSceneMobileDataAsset(sceneFacts);
  assert.equal(Buffer.compare(sceneDataBytes, expectedSceneDataAsset.buffer), 0, "retained scene data asset must exactly match scene CSG facts");
  assert.match(sourceText, /__csg_scene_present_compositor_frame/, "retained mobile source must present compositor transition frames");
  assert.match(sourceText, /__csg_scene_present_transition_frame/, "retained mobile source must present pending transition frames before full route frames");
  assert.match(sourceText, /__csgSceneHasPendingTransitionFrame/, "retained mobile source must track pending transition frames");
  assert.match(sourceText, /__csgSceneHasPendingDirtyFrame/, "retained mobile source must track pending dirty frames");
  assert.match(sourceText, /__csg_scene_refresh_dirty_subtree/, "retained mobile source must refresh state dirty subtrees");
  assert.match(sourceText, /__csg_scene_refresh_css_state_dirty/, "retained mobile source must refresh CSS state dirty subtrees");
  assert.match(sourceText, /__csg_scene_find_event_hit_target_node/, "retained mobile source must hit-test event targets from route layout boxes");
  assert.match(sourceText, /__csg_scene_apply_event_hit_target/, "retained mobile source must apply event target effects on touch release");
  const coordinateEventApply = sourceText.match(/fn __csg_scene_apply_event_hit_target[\s\S]*?fn __csg_scene_apply_text_input_focus/)?.[0] ?? "";
  assert.match(coordinateEventApply, /return __csg_scene_apply_event_to_node\(nodeId\)/, "coordinate event dispatch must use the unified node event dispatcher");
  assert.doesNotMatch(coordinateEventApply, /WebSceneApplyNodeEventEffect/, "coordinate event dispatch must not bypass compiled/native command handlers");
  assert.match(sourceText, /WebSceneApplyNodeEventEffect/, "retained mobile source must consume structured event handler effects");
  assert.match(sourceText, /fn __csg_scene_apply_key_event_to_node\(nodeId: int32, eventName: str, eventKey: str\): int32 =/, "retained mobile source must dispatch structured key events by node");
  assert.match(sourceText, /__csg_scene_find_event_hit_target_node\(xMilli, yMilli, "touchStart"\)/, "retained mobile touch down must dispatch React touchStart handlers");
  assert.match(sourceText, /__csg_scene_event_hit_target_ancestor\(upRoute, releaseNodeId, "touchEnd"\)/, "retained mobile touch release must dispatch React touchEnd handlers independently of pointerUp");
  assert.match(sourceText, /__csg_scene_event_hit_target_ancestor\(cancelRoute, cancelNodeId, "touchCancel"\)/, "retained mobile touch cancel must dispatch React touchCancel handlers");
  assert.match(sourceText, /WebSceneStateValueForRef\(__csgSceneGraph, "ref:touchClickSuppressed"\)/, "retained mobile touch release must suppress click after a consumed swipe");
  assert.match(sourceText, /@exportc\("cheng_app_debug_apply_node_key_event"\)/, "retained mobile source must expose key event diagnostics");
  assert.match(sourceText, /fn __csg_scene_clear_text_input_focus\(\)/, "retained mobile source must be able to clear text focus without stealing click dispatch");
  assert.match(sourceText, /@exportc\("cheng_app_clear_text_input_focus"\)/, "retained mobile source must export host-callable text focus clearing");
  assert.match(sourceText, /fn cheng_app_clear_text_input_focus\(\): int32 =[\s\S]*__csg_scene_clear_text_input_focus\(\)/, "host text focus clearing must clear Cheng focused node state");
  const touchRelease = sourceText.match(/fn cheng_app_on_touch_milli[\s\S]*?@exportc\("cheng_app_text_input_utf8"\)/)?.[0] ?? "";
  assert.doesNotMatch(touchRelease, /no-winner fallback|baked hitRects are the no-winner fallback/, "retained mobile touch release must not use a no-winner fallback path");
  assert.doesNotMatch(touchRelease, /let hitStatus = __csg_scene_apply_route_hit_rect/, "retained mobile touch release must not route through static hit rect fallback");
  assert.doesNotMatch(touchRelease, /let eventHitStatus = __csg_scene_apply_event_hit_target/, "retained mobile touch release must not re-scan event targets after arbitration");
  assert(touchRelease.includes("__csg_scene_top_interaction(xMilli, yMilli)"), "retained mobile touch release must use single-pass arbitration");
  assert(touchRelease.includes("__csg_scene_request_route_to_node(__csgSceneTopNode)"), "retained mobile touch release must queue the route winner");
  assert(touchRelease.includes("__csg_scene_request_event_to_node(__csgSceneTopNode)"), "retained mobile touch release must queue the event winner");
  assert(touchRelease.includes("let textFocusStatus = __csg_scene_apply_text_input_focus(xMilli, yMilli)"), "retained mobile touch release must preserve text focus default action when no route or event wins");
  const topInteraction = sourceText.match(/fn __csg_scene_top_interaction[\s\S]*?fn __csg_scene_apply_route_to_node/)?.[0] ?? "";
  assert.match(topInteraction, /WebSceneBoxRangeStart\(__csgSceneGraph, activeRoute\)[\s\S]*WebSceneBoxRangeEnd\(__csgSceneGraph, activeRoute\)/, "retained mobile hit arbitration must scan only the active route box range");
  assert.doesNotMatch(topInteraction, /__csg_scene_find_descendant_(route|event)_target_within_box/, "retained mobile hit arbitration must not rescan the route box range for every candidate");
  assert(
    topInteraction.indexOf("__csg_scene_event_hit_target_ancestor(activeRoute, boxNodeId, \"click\")") >= 0 &&
      topInteraction.indexOf("__csg_scene_event_hit_target_ancestor(activeRoute, boxNodeId, \"click\")") <
        topInteraction.indexOf("__csg_scene_route_hit_target_ancestor(activeRoute, boxNodeId)"),
    "retained mobile top interaction must dispatch child click events before ancestor route hits",
  );
  assert(
    topInteraction.includes("if eventNode != 0 && eventNode != routeNode:"),
    "retained mobile top interaction must let child events beat ancestor routes without swallowing same-node route clicks",
  );
  assert(touchRelease.includes("let textFocusStatus = __csg_scene_apply_text_input_focus"), "retained mobile touch release must keep text input focus as default action");
  assert(
    touchRelease.indexOf("__csg_scene_apply_route_to_node(__csgSceneTopNode)") <
      touchRelease.indexOf("let textFocusStatus = __csg_scene_apply_text_input_focus") &&
      touchRelease.indexOf("__csg_scene_apply_event_to_node(__csgSceneTopNode)") <
        touchRelease.indexOf("let textFocusStatus = __csg_scene_apply_text_input_focus"),
    "retained mobile touch release must dispatch the route/event winner before text input default focus",
  );
  assert.match(sourceText, /__csg_scene_present_dirty_frame/, "retained mobile source must present dirty frames before full route frames");
  assert.match(sourceText, /cheng_app_debug_mark_dirty_subtree/, "retained mobile source must expose a dirty subtree diagnostic entrypoint");
  assert.match(sourceText, /@exportc\("cheng_app_on_touch"\)/, "retained mobile source must export the complete app touch ABI");
  assert.match(sourceText, /@exportc\("cheng_app_scroll_by"\)/, "retained mobile source must export scroll_by ABI");
  assert.match(sourceText, /@exportc\("cheng_app_scroll_get"\)/, "retained mobile source must export scroll_get ABI");
  assert.match(sourceText, /panic\("cheng_app_on_touch float ABI is disabled/, "retained mobile source must hard-fail the disabled float touch ABI");
  assert.match(sourceText, /@exportc\("cheng_app_pause"\)/, "retained mobile source must export app pause ABI");
  assert.match(sourceText, /@exportc\("cheng_app_resume"\)/, "retained mobile source must export app resume ABI");
  assert.match(sourceText, /if __csgScenePaused:\n        return 0/, "retained mobile source must stop frame demand while paused");
  assert.match(sourceText, /fn cheng_app_resume\(appId: uint64\)[\s\S]*__csgScenePaused = false[\s\S]*__csgSceneRendered = false/, "retained mobile source must request a fresh frame after resume");
  assert.match(sourceText, /cheng_app_debug_glyph_sdf_atlas_id/, "retained mobile source must expose glyph SDF atlas diagnostics");
  assert.match(sourceText, /cheng_app_debug_layout_fail_code/, "retained mobile source must expose layout failure diagnostics");
  assert.match(sourceText, /cheng_app_debug_layout_fail_route_index/, "retained mobile source must expose layout failure route diagnostics");
  assert.match(sourceText, /cheng_app_debug_layout_fail_node_id/, "retained mobile source must expose layout failure node diagnostics");
  assert.match(sourceText, /cheng_app_debug_image_atlas_upload_pixel_count/, "retained mobile source must expose image atlas upload diagnostics");
  assert.match(sourceText, /cheng_app_debug_svg_display_list_upload_primitive_count/, "retained mobile source must expose SVG display-list upload diagnostics");
  assert.match(sourceText, /cheng_app_debug_glyph_sdf_pixel_count/, "retained mobile source must expose glyph SDF pixel diagnostics");
  assert.match(sourceText, /cheng_app_debug_glyph_sdf_atlas_upload_pixel_count/, "retained mobile source must expose glyph SDF atlas upload diagnostics");
  assert.match(sourceText, /cheng_app_debug_glyph_sdf_atlas_upload_glyph_count/, "retained mobile source must expose glyph SDF metadata upload diagnostics");
  assert.match(sourceText, /cheng_app_debug_text_command_count/, "retained mobile source must expose retained text command count diagnostics");
  assert.match(sourceText, /cheng_app_debug_text_command_x_at/, "retained mobile source must expose retained text command x diagnostics");
  assert.match(sourceText, /cheng_app_debug_text_command_font_atlas_at/, "retained mobile source must expose retained text font atlas diagnostics");
  assert.match(sourceText, /cheng_app_debug_text_command_glyph_run_at/, "retained mobile source must expose retained text glyph run diagnostics");
  assert.match(sourceText, /cheng_app_debug_dirty_present_layer_count/, "retained mobile source must expose dirty compositor layer diagnostics");
  assert.match(sourceText, /cheng_app_debug_css_variant_rule_count/, "retained mobile source must expose CSS variant rule diagnostics");
  assert.match(sourceText, /cheng_app_debug_css_variant_condition_count/, "retained mobile source must expose CSS condition diagnostics");
  assert.match(sourceText, /cheng_app_debug_css_declaration_count/, "retained mobile source must expose CSS declaration diagnostics");
  assert.match(sourceText, /if __csgSceneHasPendingTransitionFrame:[\s\S]*__csg_scene_present_transition_frame\(\)[\s\S]*if __csgSceneHasPendingDirtyFrame:[\s\S]*__csg_scene_present_dirty_frame\(\)[\s\S]*__csg_scene_present_active_route\(\)/, "retained mobile tick must submit pending dirty frames before full route frames");
  assert.match(sourceText, /if __csgSceneHasPendingTransitionFrame:[\s\S]*__csg_scene_present_transition_frame\(\)[\s\S]*__csgSceneRendered = false[\s\S]*return/, "retained mobile tick must request a stable route frame after a transition frame");
  assert.match(sourceText, /if __csgSceneRouteCommitTo != __csgSceneRouteCommitFrom:[\s\S]*__csg_scene_refresh_transition_stats\(__csgSceneRouteCommitFrom, __csgSceneRouteCommitTo\)/, "retained route-node navigation must emit a transition frame so old route layers are dropped");
  assert.match(sourceText, /cheng_app_debug_transition_present_gpu_command_count/, "retained mobile source must expose transition present diagnostics");
  assert.match(sourceText, /cheng_app_debug_transition_present_layer_count/, "retained mobile source must expose transition compositor layer diagnostics");
  assert.match(sourceText, /cheng_app_debug_media_surface_command_count/, "retained mobile source must expose media surface command diagnostics");
  assert.match(sourceText, /cheng_app_debug_media_surface_batch_stride/, "retained mobile source must expose media surface batch stride diagnostics");
  assert.match(sourceText, /cheng_app_debug_media_surface_status/, "retained mobile source must expose media surface status diagnostics");
  assert.match(sourceText, /cheng_app_debug_media_surface_prepare_receipt_count/, "retained mobile source must expose media surface prepare receipt count");
  assert.match(sourceText, /__csg_scene_media_surface_prepare_receipts_match_active_route/, "retained mobile source must self-check media prepare receipts against active route commands");
  assert.match(sourceText, /cheng_app_debug_media_surface_prepare_identity_ok/, "retained mobile source must expose media surface prepare identity self-check");
  assert.match(sourceText, /__csgSceneMediaSurfacePrepareStatuses\[mediaSurfaceIndex\] != 1/, "retained mobile prepare self-check must require ready prepare receipts");
  assert.match(sourceText, /__csgSceneMediaSurfacePrepareSlotHashes\[mediaSurfaceIndex\] != hostMediaSurfaceBatch\[wordBase \+ 12\]/, "retained mobile prepare self-check must compare slot identity");
  assert.match(sourceText, /__csgSceneMediaSurfacePrepareManifestHashes\[mediaSurfaceIndex\] != hostMediaSurfaceBatch\[wordBase \+ 14\]/, "retained mobile prepare self-check must compare manifest identity");
  assert.match(sourceText, /__csgSceneMediaSurfacePrepareWidths\[mediaSurfaceIndex\] != hostMediaSurfaceBatch\[wordBase \+ 8\]/, "retained mobile prepare self-check must compare surface width");
  assert.match(sourceText, /cheng_app_debug_media_surface_prepare_slot_hash_at/, "retained mobile source must expose media surface prepare slot identity");
  assert.match(sourceText, /cheng_app_debug_media_surface_prepare_asset_hash_at/, "retained mobile source must expose media surface prepare asset identity");
  assert.match(sourceText, /cheng_app_debug_media_surface_prepare_manifest_hash_at/, "retained mobile source must expose media surface prepare manifest identity");
  assert.match(sourceText, /cheng_app_debug_media_surface_prepare_poster_hash_at/, "retained mobile source must expose media surface prepare poster identity");
  assert.match(sourceText, /cheng_app_debug_media_surface_prepare_width_at/, "retained mobile source must expose media surface prepare width");
  assert.match(sourceText, /cheng_app_debug_media_surface_prepare_height_at/, "retained mobile source must expose media surface prepare height");
  assert.match(sourceText, /cheng_app_debug_compositor_layer_batch_stride/, "retained mobile source must expose compositor layer host stride diagnostics");
  assert.match(sourceText, /WebSceneApplyRouteEdge/, "retained mobile source must switch active route graph");
  assert.match(sourceText, /__csgSceneHitRectRouteIndexes/, "retained mobile source must load precompiled route hit rect facts as diagnostics");
  assert.match(sourceText, /WebSceneNodePointerEventsEnabled/, "retained mobile hit testing must respect pointer-events");
  assert.match(sourceText, /cheng_app_debug_touch_hit_index/, "retained mobile source must expose touch hit diagnostics");
  assert.match(sourceText, /cheng_app_debug_last_event_hit_node_id/, "retained mobile source must expose event hit node diagnostics");
  assert.match(sourceText, /cheng_app_debug_last_event_hit_status/, "retained mobile source must expose event hit status diagnostics");
  assert.match(sourceText, /cheng_app_debug_last_event_apply_status/, "retained mobile source must expose event apply diagnostics");
  assert.match(sourceText, /cheng_app_debug_state_publish_notice_open/, "retained mobile source must expose publish notice state diagnostics");
  assert.match(sourceText, /cheng_app_debug_state_is_original/, "retained mobile source must expose original switch state diagnostics");
  assert.match(sourceText, /cheng_app_debug_state_is_paid/, "retained mobile source must expose paid switch state diagnostics");
  assert.doesNotMatch(sourceText, /web_react_runtime/, "retained mobile source must not materialize React at runtime");
  assert.doesNotMatch(sourceText, /web_layout_runtime/, "retained mobile source must not run layout runtime directly");
  assert.doesNotMatch(sourceText, /web_raster_runtime/, "retained mobile source must not raster-paint pixels directly");
  assert.doesNotMatch(sourceText, /WebLayoutParentOf/, "retained mobile source must not scan layout ancestors for touch routing");
  assert.doesNotMatch(sourceText, /WebDocumentGetAttribute/, "retained mobile source must not scan DOM attributes for touch routing");
  assert.doesNotMatch(sourceText, /WebPaintBuildOpsFromLayoutTreeWithRegistry/, "retained mobile source must not rebuild paint ops from layout");
  assert.doesNotMatch(sourceText, /RasterPaintOps/, "retained mobile source must not software-raster paint ops");
  const cheng = process.env.CHENG_BIN_OVERRIDE ? resolve(process.env.CHENG_BIN_OVERRIDE) : join(repoRoot, "artifacts", "bootstrap", "cheng.stage3");
  const objectPath = join(outDir, "unimaker-react.scene-runtime.android.o");
  const reportPath = join(outDir, "unimaker-react.scene-runtime.android.report.txt");
  await runCommand(cheng, [
    "system-link-exec",
    `--root:${repoRoot}`,
    `--in:${sourcePath}`,
    "--emit:obj",
    "--target:aarch64-linux-android",
    `--out:${objectPath}`,
    `--report-out:${reportPath}`,
  ], {
    cwd: repoRoot,
    env: chengSmokeEnv({
      CHENG_PROCESS_MAX_RSS_BYTES: "8589934592",
      BACKEND_INCREMENTAL: "0",
      BACKEND_MULTI_MODULE_CACHE: "0",
      CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
    }, cheng, repoRoot),
    encoding: "utf8",
    timeout: 240000,
    maxBuffer: 64 * 1024 * 1024,
  });
  assertAndroidRetainedSceneCompile(objectPath, reportPath);
}

async function assertAndroidRetainedSceneCompile(objectPath, reportPath) {
  const reportText = readFileSync(reportPath, "utf8");
  assert.equal(reportField(reportText, "target"), "aarch64-linux-android", "retained scene compile must target Android AArch64");
  assert.equal(reportField(reportText, "emit"), "obj", "retained scene compile must emit an object file");
  assert.equal(reportField(reportText, "real_backend_codegen"), "1", "retained scene compile must use real backend codegen");
  assert.equal(reportField(reportText, "linkerless_image"), "1", "retained scene compile must materialize a linkerless image object");
  assert(statSync(objectPath).size > 256 * 1024, "retained scene Android object must be a real generated app object");

  const symbols = await runCommand("nm", ["-g", objectPath], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.match(symbols, /\bT cheng_app_init\b/, "retained scene Android object must export app init ABI");
  assert.match(symbols, /\bT cheng_app_tick\b/, "retained scene Android object must export app tick ABI");
  assert.match(symbols, /\bT cheng_app_on_touch\b/, "retained scene Android object must export app touch ABI");
  assert.match(symbols, /\bT cheng_app_on_back\b/, "retained scene Android object must export app back ABI");
  assert.match(symbols, /\bT cheng_app_text_input_utf8\b/, "retained scene Android object must export app text input ABI");
  assert.match(symbols, /\bT cheng_app_text_input_cursor_utf8\b/, "retained scene Android object must export cursor-aware app text input ABI");
  assert.match(symbols, /\bT cheng_app_clear_text_input_focus\b/, "retained scene Android object must export app text focus clear ABI");
  assert.match(symbols, /\bT cheng_app_scroll_by\b/, "retained scene Android object must export scroll_by ABI");
  assert.match(symbols, /\bT cheng_app_scroll_get\b/, "retained scene Android object must export scroll_get ABI");
  assert.match(symbols, /\bT cheng_app_debug_media_surface_command_count\b/, "retained scene Android object must export media surface diagnostics");
  assert.match(symbols, /\bT cheng_app_debug_media_surface_status\b/, "retained scene Android object must export media surface status diagnostics");
  assert.match(symbols, /\bT cheng_app_debug_media_surface_prepare_identity_ok\b/, "retained scene Android object must export media surface prepare identity self-check");
  assert.match(symbols, /\bT cheng_app_debug_media_surface_prepare_receipt_count\b/, "retained scene Android object must export media surface prepare receipt count");
  assert.match(symbols, /\bT cheng_app_debug_media_surface_prepare_slot_hash_at\b/, "retained scene Android object must export media surface prepare slot identity");
  assert.match(symbols, /\bT cheng_app_debug_media_surface_prepare_manifest_hash_at\b/, "retained scene Android object must export media surface prepare manifest identity");
  assert.match(symbols, /\bT cheng_app_debug_media_receipt_action_code_at\b/, "retained scene Android object must export media receipt action diagnostics");
  assert.match(symbols, /\bT cheng_app_debug_media_receipt_status_at\b/, "retained scene Android object must export media receipt status diagnostics");
  assert.match(symbols, /\bT cheng_app_debug_media_receipt_state_at\b/, "retained scene Android object must export media receipt state diagnostics");
  assert.match(symbols, /\bT cheng_app_debug_media_receipt_kind_at\b/, "retained scene Android object must export media receipt kind diagnostics");
  assert.match(symbols, /\bT cheng_app_debug_text_command_count\b/, "retained scene Android object must export text command count diagnostics");
  assert.match(symbols, /\bT cheng_app_debug_text_command_x_at\b/, "retained scene Android object must export text command x diagnostics");
  assert.match(symbols, /\bT cheng_app_debug_text_command_font_atlas_at\b/, "retained scene Android object must export text command font atlas diagnostics");
  assert.match(symbols, /\bT cheng_app_debug_text_command_glyph_run_at\b/, "retained scene Android object must export text command glyph run diagnostics");
  assert.match(symbols, /\bT cheng_app_debug_last_event_hit_node_id\b/, "retained scene Android object must export event hit node diagnostics");
  assert.match(symbols, /\bT cheng_app_debug_last_event_apply_status\b/, "retained scene Android object must export event apply diagnostics");
  assert.match(symbols, /\bT cheng_app_debug_state_publish_notice_open\b/, "retained scene Android object must export publish notice state diagnostics");
  assert.match(symbols, /\bT cheng_app_debug_state_show_review_console\b/, "retained scene Android object must export review console state diagnostics");
  assert.match(symbols, /\bU cheng_mobile_host_present_media_surface_commands\b/, "retained scene Android object must import media surface host ABI");
  assert.match(symbols, /\bU cheng_mobile_host_prepare_media_surface_texture\b/, "retained scene Android object must import media surface prepare host ABI");
  assert.match(symbols, /\bU cheng_mobile_host_present_compositor_frame\b/, "retained scene Android object must import compositor host ABI");
  assert.match(symbols, /\bU cheng_mobile_host_trace_step\b/, "retained scene Android object must import trace step host ABI");
  assert.match(symbols, /\bU cheng_mobile_host_upload_glyph_sdf_atlas_bytes\b/, "retained scene Android object must import glyph atlas byte host ABI");
  assert.match(symbols, /\bU cheng_mobile_host_set_ink_fade\b/, "retained scene Android object must import ink fade host ABI");
  assert.match(symbols, /\bU cheng_mobile_host_upload_ink_field\b/, "retained scene Android object must import ink field host ABI");
  assert.match(symbols, /\bU cheng_mobile_host_present_overlay_refresh\b/, "retained scene Android object must import overlay refresh host ABI");
}

function reportField(reportText, key) {
  const prefix = `${key}=`;
  for (const line of reportText.split(/\r?\n/)) {
    if (line.startsWith(prefix)) return line.slice(prefix.length);
  }
  return undefined;
}

async function assertSceneCsgcDrivesRetainedRuntime(outDir, sceneFacts, options = {}) {
  const cheng = process.env.CHENG_BIN_OVERRIDE ? resolve(process.env.CHENG_BIN_OVERRIDE) : join(repoRoot, "artifacts", "bootstrap", "cheng.stage3");
  const sourcePath = join(outDir, "one-click-scene-runtime-smoke.cheng");
  const exePath = join(outDir, "one-click-scene-runtime-smoke");
  const reportPath = join(outDir, "one-click-scene-runtime-smoke.report.txt");
  const precomputeOutputPath = join(outDir, "unimaker-react.scene-glyph-sdf-precompute.out");
  const glyphSdfAtlas = parseSceneGlyphSdfPrecomputeOutput(readFileSync(precomputeOutputPath, "utf8"));
  const glyphSdfPixelAssetPath = join(outDir, sceneMobileGlyphSdfPixelAssetRelPath);
  const glyphSdfPixelAsset = readGlyphSdfPixelAsset(glyphSdfPixelAssetPath, glyphSdfAtlas);
  const marker = "one_click_scene_runtime_smoke ok";
  const sourceText = emitSceneRuntimeSmokeSource(sceneFacts, {
    marker,
    glyphSdfAtlas,
    glyphSdfPixelAsset,
    mediaSurfaceLayoutExpectations: options.mediaSurfaceLayoutExpectations,
    mediaControlProbe: options.mediaControlProbe,
    stopAfterMediaSurfaceLayoutExpectations: options.stopAfterMediaSurfaceLayoutExpectations,
  });
  const hasCssVariantRules = sceneFacts.some((fact) => fact.kind === "csg.web.scene.css_variant_rule");
  const hasMediaPlaybackSlots = sceneFacts.some((fact) => fact.kind === "csg.web.media_playback_slot");
  assert.match(sourceText, /WebSceneEncodeGpuCommandHostBatch/, "scene runtime smoke must encode host GPU command batches");
  if (hasMediaPlaybackSlots) {
    assert.match(sourceText, /WebSceneEncodeMediaSurfaceCommandHostBatch/, "scene runtime smoke must encode media surface host batches");
  }
  assert.match(sourceText, /WebSceneLoadPrecomputedGlyphSdfAtlasHostBatches/, "scene runtime smoke must load precomputed glyph SDF atlas");
  assert.doesNotMatch(sourceText, /WebSceneBuildGlyphAtlasFromPaintOps/, "scene runtime smoke must not build glyph SDF during retained runtime verification");
  assert.match(sourceText, /WebSceneEncodeGlyphSdfAtlasHostBatch/, "scene runtime smoke must encode glyph SDF atlas host batches");
  assert.match(sourceText, /WebSceneEncodeGlyphSdfMetadataHostBatch/, "scene runtime smoke must encode glyph SDF metadata host batches");
  assert.match(sourceText, /WebSceneBuildRouteTransitionPlan/, "scene runtime smoke must cover retained route transitions");
  assert.match(sourceText, /WebSceneBuildCompositorFrameForRouteTransitionPlanWithFullAtlases/, "scene runtime smoke must cover compositor transition frames");
  assert.match(sourceText, /WebSceneBuildCompositorFrameForDirtySpanWithFullAtlases/, "scene runtime smoke must cover dirty subtree compositor frames");
  assert.match(sourceText, /WebSceneEncodeCompositorFrameHostBatch/, "scene runtime smoke must encode compositor host layer batches");
  assert.match(sourceText, /WebSceneApplyCssVariantRulesToPaintOps/, "scene runtime smoke must apply CSS variant declarations");
  if (hasCssVariantRules) {
    assert.match(sourceText, /WebSceneAddCssVariantRule/, "scene runtime smoke must load CSS variant rules");
    assert.match(sourceText, /WebSceneAddCssVariantConditionFull/, "scene runtime smoke must load complete CSS variant conditions");
    assert.match(sourceText, /WebSceneAddCssDeclaration/, "scene runtime smoke must load CSS declarations");
  }
  writeFileSync(sourcePath, sourceText, "utf8");
  await runCommand(cheng, [
    "system-link-exec",
    `--root:${repoRoot}`,
    `--in:${sourcePath}`,
    "--emit:exe",
    "--target:arm64-apple-darwin",
    `--out:${exePath}`,
    `--report-out:${reportPath}`,
  ], {
    cwd: repoRoot,
    env: chengSmokeEnv({
      CHENG_PROCESS_MAX_RSS_BYTES: "8589934592",
      BACKEND_INCREMENTAL: "0",
      BACKEND_MULTI_MODULE_CACHE: "0",
      CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
    }, cheng, repoRoot),
    encoding: "utf8",
    timeout: 240000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = await runCommand(exePath, [], {
    cwd: outDir,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.match(output, new RegExp(marker), "scene CSGC must drive retained runtime atlas/layer/GPU smoke");
}

function readGlyphSdfPixelAsset(assetPath, glyphSdfAtlas) {
  assert(existsSync(assetPath), "scene runtime smoke requires glyph SDF pixel asset");
  assert(glyphSdfAtlas && glyphSdfAtlas.pixels, "glyph SDF atlas pixels are required");
  const bytes = readFileSync(assetPath);
  const expectedBytes = glyphSdfPixelsToBuffer(glyphSdfAtlas.pixels);
  assert.equal(bytes.length, expectedBytes.length, "glyph SDF pixel asset byte count must match precompute output");
  assert(bytes.equals(expectedBytes), "glyph SDF pixel asset bytes must match precompute output");
  const crc32 = crc32Bytes(bytes);
  return {
    relPath: sceneMobileGlyphSdfPixelAssetRelPath,
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

function crc32Bytes(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function firstExistingFont(paths) {
  for (const path of paths) {
    if (existsSync(path)) return path;
  }
  return "";
}

function listFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
      } else {
        out.push(path);
      }
    }
  }
  return out;
}

function cleanupGeneratedFactFiles(outDir) {
  for (const name of [
    "unimaker-react.csgc",
    "unimaker-react.csgc.debug",
    "unimaker-react.csgweb",
    "unimaker-react.scene.csgc",
  ]) {
    rmSync(join(outDir, name), { force: true });
  }
}

function assertNoGeneratedFactFiles(outDir) {
  const files = listFiles(outDir);
  assert.equal(files.some((file) =>
    file.endsWith("unimaker-react.csgc") ||
    file.endsWith("unimaker-react.csgc.debug") ||
    file.endsWith("unimaker-react.csgweb") ||
    file.endsWith("unimaker-react.scene.csgc")
  ), false, "one-click smoke must delete generated CSG fact intermediates after reading them");
}
