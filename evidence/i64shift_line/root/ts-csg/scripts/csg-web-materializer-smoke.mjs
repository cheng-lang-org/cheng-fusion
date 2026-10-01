import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { chengSmokeEnv } from "./cheng-smoke-env.mjs";
import { prepareFontCascadeBase64 } from "./font-subset.mjs";
import { analyzeSceneDomCssCoverage } from "./scene-dom-css-coverage.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const fixtureProject = join(packageDir, "fixtures", "csg-web-materializer-basic", "tsconfig.json");
const tmpDir = join(packageDir, "tmp", "csg-web-materializer-basic");
const factsPath = join(tmpDir, "basic.csgweb");
const reportPath = join(tmpDir, "basic.web.report.json");
const chengSourcePath = join(tmpDir, "basic.materialized.cheng");
const exePath = join(tmpDir, "basic_materialized");
const compileReportPath = join(tmpDir, "basic.materialized.report.txt");
const cheng = join(repoRoot, "artifacts", "bootstrap", "cheng.stage3");
const marker = "csg_web_materializer_basic ok";
const expectedDefaultVideoAssetCid = "65f2e11c133e12d43ad37589e7a70d9d00f5a876f3cc90cb49cdcaa5978a0c3b";
const expectedDefaultVideoBundleCid = "4c64c1301438ad2184628318fe530dbb5573ac2f5a7d1c8c98f69fd5f8387fa6";
const expectedDefaultVideoManifestCid = "7543e824934d837f0037c3a8814c57c15891469f3657fe85614cb3112e23c6b7";
const expectedDefaultVideoPosterCid = "4b3a1c3a8b955ad30f34593797dec7d079c2a6fe929368e6ca12a1829246c0ab";
const expectedDefaultVideoInitSegmentCid = "613413811dd03e1e2208b10bb28fe26a20cc600da3aeb78d0f27942a1c875c27";
const placeholderDefaultVideoCidPrefix = "bafy-unimaker-truth-video";
const huiwenCjkFontPath = "/Users/lbcheng/Library/Fonts/匯文明朝體.ttf";
const hex64Pattern = /^[0-9a-f]{64}$/;
const sha256SignaturePattern = /^sha256:[0-9a-f]{64}$/;
const generatedFactPaths = [factsPath];

function cleanupGeneratedFactFiles() {
  for (const filePath of generatedFactPaths) {
    rmSync(filePath, { force: true });
  }
}

process.on("exit", cleanupGeneratedFactFiles);

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

function mediaAssetContentByteLength(mediaAsset) {
  const objects = Array.isArray(mediaAsset?.objects) ? mediaAsset.objects : [];
  assert(objects.length > 0, "media asset objects must be present for content byte length");
  let maxEnd = 0;
  for (const object of objects) {
    const byteOffset = Number(object?.byteOffset ?? -1);
    const byteLength = Number(object?.byteLength ?? 0);
    assert(Number.isInteger(byteOffset) && byteOffset >= 0, "media asset object byteOffset must be non-negative");
    assert(Number.isInteger(byteLength) && byteLength > 0, "media asset object byteLength must be positive");
    maxEnd = Math.max(maxEnd, byteOffset + byteLength);
  }
  assert(maxEnd > 0, "media asset content byte length must be positive");
  return maxEnd;
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

function assertPcm16WavPayload(bytes, label) {
  assert(Buffer.isBuffer(bytes), `${label} payload must be a Buffer`);
  assert(bytes.length >= 44, `${label} wav payload must carry a header and at least one sample`);
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", `${label} must start with RIFF`);
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, `${label} RIFF size must match payload length`);
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE", `${label} must be WAVE`);
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "fmt ", `${label} must contain fmt chunk first`);
  assert.equal(bytes.readUInt32LE(16), 16, `${label} fmt chunk must be PCM sized`);
  assert.equal(bytes.readUInt16LE(20), 1, `${label} wav format must be PCM`);
  assert.equal(bytes.readUInt16LE(22), 1, `${label} fixture must be mono`);
  assert.equal(bytes.readUInt16LE(34), 16, `${label} fixture must be pcm_s16le`);
  assert.equal(bytes.subarray(36, 40).toString("ascii"), "data", `${label} must contain data chunk`);
  const pcmBytes = bytes.readUInt32LE(40);
  assert.equal(pcmBytes, bytes.length - 44, `${label} data chunk length must match payload tail`);
  assert(pcmBytes > 0 && pcmBytes % 2 === 0, `${label} pcm data must contain whole s16 samples`);
}

function sceneGraphIndex(sceneFacts) {
  const routesById = new Map();
  const nodesByTemplate = new Map();
  const nodesByRouteAndId = new Map();
  const layoutsByRouteAndNode = new Map();
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
    if (fact.kind === "csg.web.media_asset") assetsByCid.set(String(fact.assetCid ?? ""), fact);
  }
  return { routesById, nodesByTemplate, nodesByRouteAndId, layoutsByRouteAndNode, assetsByCid };
}

function sceneNodeLayouts(index, node) {
  return index.layoutsByRouteAndNode.get(`${Number(node?.routeIndex ?? -1)}:${Number(node?.nodeId ?? -1)}`) ?? [];
}

function sceneNodeHasLayout(index, node, propName, propValue) {
  return sceneNodeLayouts(index, node).some((fact) => fact.propName === propName && fact.propValue === propValue);
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

function sceneRouteMediaSlots(sceneFacts, index, routeId) {
  const route = index.routesById.get(routeId);
  if (!route) return [];
  const routeIndex = Number(route.routeIndex ?? -1);
  return sceneFacts
    .filter((fact) => fact.kind === "csg.web.media_playback_slot")
    .map((slot) => ({ slot, node: index.nodesByTemplate.get(String(slot.nodeTemplate ?? "")), asset: index.assetsByCid.get(String(slot.assetCid ?? "")) }))
    .filter((entry) => Number(entry.node?.routeIndex ?? -1) === routeIndex);
}

function assertHomeMediaSlotsStayInMasonryAndDetailVideoCanFullscreen(sceneFacts, options = {}) {
  const requireDetailFullscreen = options.requireDetailFullscreen ?? true;
  const index = sceneGraphIndex(sceneFacts);
  const homeSlots = sceneRouteMediaSlots(sceneFacts, index, "home_default");
  assert.equal(homeSlots.length, 2, "home_default must expose video/image cards in the masonry feed");
  for (const { slot, node } of homeSlots) {
    assert(node, `home media slot must bind an existing scene node: ${slot.slotId}`);
    assert.notEqual(Number(node.parentNodeId ?? 0), 0, "home media slot must not bind the route root");
    assert.equal(sceneNodeHasMasonryAncestor(index, node), true, "home media slot must stay under the masonry layout tree");
    const masonryAncestor = sceneNearestMasonryAncestor(index, node);
    const masonryItem = sceneDirectMasonryItemAncestor(index, node);
    assert(masonryItem, "home media slot must sit inside a direct masonry item");
    assert.equal(Number(masonryItem?.parentNodeId ?? -1), Number(masonryAncestor?.nodeId ?? -2), "home media card wrapper must be a direct masonry item");
    assert.equal(masonryItem?.tagName, "div", "home media card wrapper must be a real div item, not a fragment wrapper");
    assert.equal(slot.objectFit, "cover", "home media slot must preserve React ContentCard object-cover semantics");
    assert.equal(sceneNodeHasFullscreenFixedSelfOrAncestor(index, node), false, "home media slot must not be a fullscreen fixed surface");
  }
  if (!requireDetailFullscreen) return;

  const detailVideoSlots = ["home_content_detail_open", "content_detail"]
    .flatMap((routeId) => sceneRouteMediaSlots(sceneFacts, index, routeId))
    .filter(({ asset, node }) => Number(asset?.kindCode ?? 0) === 1 && !sceneNodeHasMasonryAncestor(index, node));
  assert(detailVideoSlots.length >= 1, "content detail route must expose a dedicated video surface outside the masonry feed");
  assert.equal(detailVideoSlots.some(({ node }) => sceneNodeHasFullscreenFixedSelfOrAncestor(index, node)), true, "content detail video surface must be inside a fullscreen fixed detail shell");
}

function parseJsonlFacts(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function renderJsonlFacts(facts) {
  return `${facts.map((fact) => JSON.stringify(fact)).join("\n")}\n`;
}

function assertSceneDomCssMediaVariantCoverage() {
  const sceneFacts = [
    {
      kind: "csg.web.scene.css_variant_rule",
      id: "media.variant.rule",
      routeId: "home_default",
      routeIndex: 0,
      nodeId: 1,
      className: "sm:p-4",
      data: {
        declarations: [
          { propertyName: "padding-left", propertyValue: "16px" },
          { propertyName: "padding-right", propertyValue: "16px" },
          { propertyName: "padding-top", propertyValue: "16px" },
          { propertyName: "padding-bottom", propertyValue: "16px" },
          { propertyName: "border-radius", propertyValue: "16px" },
          { propertyName: "justify-content", propertyValue: "center" },
          { propertyName: "margin-left", propertyValue: "auto" },
          { propertyName: "max-width", propertyValue: "448px" },
        ],
        variantChain: [{ kind: "media", name: "sm", raw: "sm", ordinal: 0 }],
      },
    },
  ];
  const wide = analyzeSceneDomCssCoverage(sceneFacts, { viewportWidth: 1024 });
  assert.equal(wide.complete, true, "active sm media layout declarations must be covered");
  assert.equal(wide.hardFailureCount, 0, "active sm media layout declarations must not hard-fail");
  assert.equal(wide.counts.runtimeUnsupportedVariantConditions, 0);
  assert.equal(wide.counts.runtimeUnsupportedDeclarations, 0);
  const narrow = analyzeSceneDomCssCoverage(sceneFacts, { viewportWidth: 390 });
  assert.equal(narrow.hardFailureCount, 0, "inactive sm media declarations must not hard-fail");
  assert.equal(narrow.counts.inactiveMediaVariantRules, 1);
}

function createElementKeysByTag(chengSource, tagName) {
  const keys = [];
  let key = 0;
  for (const line of chengSource.split(/\r?\n/)) {
    const element = /if !react\.CreateElement\(runtime, "([^"]+)"/.exec(line);
    if (element) {
      if (element[1] === tagName) keys.push(key);
      key += 1;
      continue;
    }
    if (/if !react\.CreateText\(runtime, /.test(line)) key += 1;
  }
  return keys;
}

function inlineStyleBlockForKey(chengSource, key) {
  const marker = `let __k_${key} = ${key}`;
  const start = chengSource.indexOf(marker);
  if (start < 0) return "";
  const nextKey = chengSource.indexOf("\n    let __k_", start + marker.length);
  const nextFn = chengSource.indexOf("\nfn __csg_", start + marker.length);
  let end = chengSource.length;
  if (nextKey >= 0 && nextKey < end) end = nextKey;
  if (nextFn >= 0 && nextFn < end) end = nextFn;
  return chengSource.slice(start, end);
}

function functionBlock(chengSource, functionName) {
  const marker = `fn ${functionName}(`;
  const start = chengSource.indexOf(marker);
  if (start < 0) return "";
  const next = chengSource.indexOf("\nfn ", start + marker.length);
  return chengSource.slice(start, next >= 0 ? next : chengSource.length);
}

function chengString(value) {
  return JSON.stringify(String(value));
}

function materializerSmokeFontFaces() {
  const faces = [
    { path: huiwenCjkFontPath, weight: 400 },
    { path: huiwenCjkFontPath, weight: 700, duplicateGlyphs: true },
    { path: "/System/Library/Fonts/Supplemental/Arial.ttf", weight: 400 },
  ];
  return faces.filter((face) => existsSync(face.path));
}

async function prepareMaterializerSmokeFonts(sourceText) {
  const faces = materializerSmokeFontFaces();
  assert.equal(faces.some((face) => face.path === huiwenCjkFontPath), true, "materializer smoke needs 匯文明朝體 for Han glyphs");
  const prepared = await prepareFontCascadeBase64({
    fontFaces: faces,
    sourceText,
    outDir: join(tmpDir, "font-smoke"),
    label: "materializer",
    maxBytes: 1024 * 1024,
    timeoutMs: 120000,
    requireFullCoverage: true,
  });
  assert(prepared.base64s.length > 0, "materializer smoke font subset must produce base64");
  return { base64s: prepared.base64s, weights: prepared.base64Weights, families: prepared.base64Families };
}

function emitSceneRuntimeSmokeSource(sceneFacts) {
  const routes = sceneFacts.filter((fact) => fact.kind === "csg.web.scene.route")
    .sort((left, right) => Number(left.routeIndex) - Number(right.routeIndex));
  const layers = sceneFacts.filter((fact) => fact.kind === "csg.web.scene.layer")
    .sort((left, right) => Number(left.routeIndex) - Number(right.routeIndex) || Number(left.ordinal) - Number(right.ordinal));
  const nodes = sceneFacts.filter((fact) => fact.kind === "csg.web.scene.node")
    .sort((left, right) => Number(left.nodeId) - Number(right.nodeId));
  const resources = sceneFacts.filter((fact) => fact.kind === "csg.web.scene.resource")
    .sort((left, right) => Number(left.ordinal) - Number(right.ordinal));
  const layouts = sceneFacts.filter((fact) => fact.kind === "csg.web.scene.layout")
    .sort((left, right) => Number(left.routeIndex) - Number(right.routeIndex) || Number(left.nodeId) - Number(right.nodeId) || Number(left.ordinal) - Number(right.ordinal));
  const paints = sceneFacts.filter((fact) => fact.kind === "csg.web.scene.paint")
    .sort((left, right) => Number(left.routeIndex) - Number(right.routeIndex) || Number(left.nodeId) - Number(right.nodeId) || Number(left.ordinal) - Number(right.ordinal));
  const edges = sceneFacts.filter((fact) => fact.kind === "csg.web.scene.route_edge");
  const cssVariantRules = sceneFacts.filter((fact) => fact.kind === "csg.web.scene.css_variant_rule")
    .sort((left, right) => Number(left.routeIndex) - Number(right.routeIndex) || Number(left.nodeId) - Number(right.nodeId) || sceneCssRuleOrdinal(left) - sceneCssRuleOrdinal(right));
  const rasterResourceCount = resources.filter((resource) => Array.isArray(resource.pixels)).length;
  const svgDisplayListCount = new Set(paints
    .filter((paint) => String(paint.opKind ?? "") === "svg_icon")
    .map((paint) => String(paint.resourceId ?? "")))
    .size;
  const textRunCount = paints.filter((paint) => scenePaintKindIsText(String(paint.opKind ?? ""))).length;
  const routeIndexById = new Map(routes.map((route) => [String(route.routeId), Number(route.routeIndex)]));
  const rootsByRoute = new Map();
  for (const node of nodes) {
    if (Number(node.parentNodeId) !== 0) continue;
    const routeIndex = Number(node.routeIndex);
    if (!rootsByRoute.has(routeIndex)) rootsByRoute.set(routeIndex, Number(node.nodeId));
  }
  const homeToMessages = edges.find((edge) => edge.routeId === "home_default" && edge.targetRouteId === "tab_messages");
  assert(homeToMessages, "scene runtime smoke needs a home_default -> tab_messages route edge");
  const sourceRouteIndex = Number(homeToMessages.routeIndex);
  const targetRouteIndex = routeIndexById.get(String(homeToMessages.targetRouteId));
  assert.equal(typeof targetRouteIndex, "number", "route edge target must resolve");
  const shellReuseRouteIndex = routeIndexById.get("home_search_open");
  assert.equal(typeof shellReuseRouteIndex, "number", "scene runtime smoke needs home_search_open route facts");
  const sourceLayers = layers.filter((layer) => Number(layer.routeIndex) === sourceRouteIndex);

  let code = 1;
  const lines = [
    "import cheng/core/runtime/web_scene_runtime as scene",
    "import cheng/core/runtime/web_font_runtime as font",
    "",
    "fn main(): int32 =",
    "    var __csgFontClosureAnchor: font.WebFontFace",
    "    font.WebFontInitEmpty(__csgFontClosureAnchor)",
    "    var graph: scene.WebSceneGraph",
    "    scene.WebSceneGraphInit(graph)",
  ];
  for (const resource of resources) {
    lines.push(
      `    if !scene.WebSceneAddResource(graph, ${chengString(resource.resourceKind ?? "")}, ${chengString(resource.resourceId ?? "")}, ${chengString(resource.source ?? "")}, ${chengString(resource.data ?? "")}, ${chengString(resource.hash ?? "")}, ${Number(resource.byteSize ?? 0)}, ${Number(resource.fontWeight ?? 0)}, ${Number(resource.fontFamily ?? 0)}):`,
    );
    lines.push(`        return ${code++}`);
    if (Array.isArray(resource.pixels) && Number(resource.width) > 0 && Number(resource.height) > 0) {
      const pixelsName = `resource_${Number(resource.ordinal) || resources.indexOf(resource)}_pixels`;
      lines.push(`    var ${pixelsName}: int32[]`);
      for (const pixel of resource.pixels) {
        lines.push(`    add(${pixelsName}, ${scenePixelExpr(pixel)})`);
      }
      lines.push(`    if !scene.WebSceneSetResourceRasterPixels(graph, ${chengString(resource.resourceKind ?? "")}, ${chengString(resource.resourceId ?? "")}, ${Number(resource.width)}, ${Number(resource.height)}, ${pixelsName}):`);
      lines.push(`        return ${code++}`);
    }
  }
  for (const route of routes) {
    const routeIndex = Number(route.routeIndex);
    const rootNodeId = rootsByRoute.get(routeIndex) ?? 0;
    lines.push(`    if !scene.WebSceneAddRouteExpectedIndex(graph, ${chengString(route.routeId)}, ${rootNodeId}, ${Number(routeIndex) * 100 + 1}, ${routeIndex}):`);
    lines.push(`        return ${code++}`);
  }
  for (const layer of layers) {
    lines.push(`    if !scene.WebSceneAddLayer(graph, ${Number(layer.routeIndex)}, ${Number(layer.layerId)}, ${chengString(layer.name ?? "")}, ${Number(layer.ordinal ?? 0)}):`);
    lines.push(`        return ${code++}`);
  }
  for (const node of nodes) {
    lines.push(
      `    if !scene.WebSceneAddNode(graph, ${Number(node.routeIndex)}, ${Number(node.nodeId)}, ${Number(node.parentNodeId)}, ${node.nodeKind === "text" ? 3 : 2}, ${chengString(node.tagName ?? "")}, ${chengString(node.text ?? "")}, ${Number(node.layerId ?? 0)}):`,
    );
    lines.push(`        return ${code++}`);
  }
  for (const layout of layouts) {
    lines.push(`    if !scene.WebSceneAddLayoutConstraint(graph, ${Number(layout.routeIndex)}, ${Number(layout.nodeId)}, ${Number(layout.ordinal)}, ${chengString(layout.propName ?? "")}, ${chengString(layout.propValue ?? "")}):`);
    lines.push(`        return ${code++}`);
  }
  for (const paint of paints) {
    lines.push(
      `    if !scene.WebSceneAddPaintOp(graph, ${Number(paint.routeIndex)}, ${Number(paint.nodeId)}, ${Number(paint.ordinal)}, ${scenePaintKindExpr(String(paint.opKind ?? ""))}, ${sceneColorArg(paint.color)}, ${Number(paint.radius ?? 0)}, ${Number(paint.width ?? 0)}, ${Number(paint.height ?? 0)}, ${chengString(paint.resourceId ?? "")}, ${chengString(paint.text ?? "")}):`,
    );
    lines.push(`        return ${code++}`);
    if (String(paint.opKind ?? "") === "svg_icon" && Array.isArray(paint.data)) {
      for (const primitive of paint.data) {
        lines.push(`    if !${sceneSvgPrimitiveCall(paint, primitive)}:`);
        lines.push(`        return ${code++}`);
      }
    }
  }
  for (const edge of edges) {
    const edgeTarget = routeIndexById.get(String(edge.targetRouteId));
    if (edgeTarget === undefined) continue;
    lines.push(`    if !scene.WebSceneAddRouteEdge(graph, ${Number(edge.routeIndex)}, ${Number(edge.nodeId)}, ${edgeTarget}):`);
    lines.push(`        return ${code++}`);
  }
  for (const rule of cssVariantRules) {
    const ruleOrdinal = sceneCssRuleOrdinal(rule);
    lines.push(`    if !scene.WebSceneAddCssVariantRule(graph, ${Number(rule.routeIndex)}, ${Number(rule.nodeId)}, ${ruleOrdinal}, ${chengString(rule.className ?? "")}, ${chengString(rule.data?.selectorText ?? "")}, ${chengString(rule.data?.specificity ?? "")}, ${Number(rule.data?.ruleOrder ?? ruleOrdinal)}):`);
    lines.push(`        return ${code++}`);
    for (const condition of sceneCssVariantConditions(rule)) {
      lines.push(`    if !scene.WebSceneAddCssVariantConditionFull(graph, ${Number(rule.routeIndex)}, ${Number(rule.nodeId)}, ${ruleOrdinal}, ${Number(condition.ordinal ?? 0)}, ${chengString(condition.kind ?? "")}, ${chengString(condition.name ?? condition.raw ?? "")}, ${chengString(condition.attributeName ?? "")}, ${chengString(condition.attributeValue ?? "")}, ${chengString(condition.modifier ?? "")}, ${chengString(condition.selector ?? "")}):`);
      lines.push(`        return ${code++}`);
    }
    for (const [declIndex, declaration] of sceneCssDeclarations(rule).entries()) {
      lines.push(`    if !scene.WebSceneAddCssDeclaration(graph, ${Number(rule.routeIndex)}, ${Number(rule.nodeId)}, ${ruleOrdinal}, ${declIndex}, ${chengString(declaration.propertyName ?? "")}, ${chengString(declaration.propertyValue ?? "")}, ${Boolean(declaration.important) ? "true" : "false"}):`);
      lines.push(`        return ${code++}`);
    }
  }
  lines.push(`    if !scene.WebSceneSetActiveRouteById(graph, "home_default"):`);
  lines.push(`        return ${code++}`);
  lines.push("    scene.WebSceneClearDirty(graph)");
  lines.push(`    if !scene.WebSceneApplyRouteEdge(graph, ${Number(homeToMessages.nodeId)}):`);
  lines.push(`        return ${code++}`);
  lines.push(`    if scene.WebSceneActiveRouteIndex(graph) != ${targetRouteIndex}:`);
  lines.push(`        return ${code++}`);
  lines.push(`    if scene.WebSceneLayerCount(graph) != ${layers.length}:`);
  lines.push(`        return ${code++}`);
  lines.push(`    if scene.WebSceneResourceCount(graph) != ${resources.length}:`);
  lines.push(`        return ${code++}`);
  lines.push("    var imageAtlas: scene.WebSceneImageAtlas");
  lines.push("    if !scene.WebSceneBuildImageAtlasFromResources(graph, imageAtlas):");
  lines.push(`        return ${code++}`);
  if (rasterResourceCount > 0) {
    lines.push(`    if scene.WebSceneImageAtlasTextureCount(imageAtlas) != ${rasterResourceCount}:`);
    lines.push(`        return ${code++}`);
  }
  lines.push("    var svgAtlas: scene.WebSceneSvgDisplayListAtlas");
  lines.push("    if !scene.WebSceneBuildSvgDisplayListAtlasFromPaintOps(graph, svgAtlas):");
  lines.push(`        return ${code++}`);
  lines.push(`    if scene.WebSceneSvgDisplayListCount(svgAtlas) != ${svgDisplayListCount}:`);
  lines.push(`        return ${code++}`);
  lines.push("    var glyphAtlas: scene.WebSceneGlyphAtlas");
  lines.push("    if !scene.WebSceneBuildGlyphAtlasFromPaintOps(graph, glyphAtlas):");
  lines.push(`        return ${code++}`);
  lines.push(`    if scene.WebSceneGlyphAtlasRunCount(glyphAtlas) != ${textRunCount}:`);
  lines.push(`        return ${code++}`);
  if (textRunCount > 0) {
    lines.push("    if scene.WebSceneGlyphAtlasGlyphCount(glyphAtlas) <= 0:");
    lines.push(`        return ${code++}`);
    lines.push("    if scene.WebSceneGlyphAtlasSdfPixelCount(glyphAtlas) <= 0:");
    lines.push(`        return ${code++}`);
    lines.push("    if scene.WebSceneGlyphAtlasGlyphSdfPixelCountAt(glyphAtlas, 0) <= 0:");
    lines.push(`        return ${code++}`);
    lines.push("    var sceneSmokeSdfHasInk = false");
    lines.push("    for sdfIndex in 0..<scene.WebSceneGlyphAtlasSdfPixelCount(glyphAtlas):");
    lines.push("        let sdfPixel = scene.WebSceneGlyphAtlasSdfPixelAt(glyphAtlas, sdfIndex)");
    lines.push("        if sdfPixel < 0 || sdfPixel > 255:");
    lines.push(`            return ${code++}`);
    lines.push("        if sdfPixel > 0:");
    lines.push("            sceneSmokeSdfHasInk = true");
    lines.push("    if !sceneSmokeSdfHasInk:");
    lines.push(`        return ${code++}`);
  }
  lines.push(`    if scene.WebSceneLayoutCount(graph) != ${layouts.length}:`);
  lines.push(`        return ${code++}`);
  lines.push(`    if scene.WebScenePaintCount(graph) != ${paints.length}:`);
  lines.push(`        return ${code++}`);
  lines.push(`    if scene.WebSceneCssVariantRuleCount(graph) != ${cssVariantRules.length}:`);
  lines.push(`        return ${code++}`);
  lines.push("    var transitionPlan: scene.WebSceneLayerTransitionPlan");
  lines.push(`    if !scene.WebSceneBuildRouteTransitionPlan(graph, ${Number(homeToMessages.routeIndex)}, ${targetRouteIndex}, transitionPlan):`);
  lines.push(`        return ${code++}`);
  lines.push("    if scene.WebSceneTransitionActionCount(transitionPlan) <= 0:");
  lines.push(`        return ${code++}`);
  lines.push("    if scene.WebSceneTransitionReusedLayerCount(transitionPlan) + scene.WebSceneTransitionReplacedLayerCount(transitionPlan) + scene.WebSceneTransitionDroppedLayerCount(transitionPlan) != scene.WebSceneTransitionActionCount(transitionPlan):");
  lines.push(`        return ${code++}`);
  lines.push("    var transitionCacheCommands: scene.WebScenePaintCommandBuffer");
  for (const layer of sourceLayers) {
    lines.push(`    if !scene.WebSceneBuildRouteLayerPaintCommands(graph, ${sourceRouteIndex}, ${Number(layer.layerId)}, transitionCacheCommands):`);
    lines.push(`        return ${code++}`);
    lines.push(`    if !scene.WebSceneLayerCacheMarkValid(graph, ${sourceRouteIndex}, ${Number(layer.layerId)}, transitionCacheCommands):`);
    lines.push(`        return ${code++}`);
  }
  lines.push("    var shellTransitionPlan: scene.WebSceneLayerTransitionPlan");
  lines.push(`    if !scene.WebSceneBuildRouteTransitionPlan(graph, ${sourceRouteIndex}, ${shellReuseRouteIndex}, shellTransitionPlan):`);
  lines.push(`        return ${code++}`);
  lines.push("    if scene.WebSceneTransitionReusedLayerCount(shellTransitionPlan) <= 0:");
  lines.push(`        return ${code++}`);
  lines.push("    if scene.WebSceneTransitionReplacedLayerCount(shellTransitionPlan) <= 0:");
  lines.push(`        return ${code++}`);
  lines.push("    var shellTransitionFrame: scene.WebSceneCompositorFrame");
  lines.push("    if !scene.WebSceneBuildCompositorFrameForRouteTransitionPlanWithFullAtlases(graph, shellTransitionPlan, imageAtlas, svgAtlas, glyphAtlas, shellTransitionFrame):");
  lines.push(`        return ${code++}`);
  lines.push("    if scene.WebSceneCompositorLayerCount(shellTransitionFrame) != scene.WebSceneTransitionActionCount(shellTransitionPlan):");
  lines.push(`        return ${code++}`);
  lines.push("    var shellFrameReuseLayers = 0");
  lines.push("    var shellFrameReplaceLayers = 0");
  lines.push("    for layerIndex in 0..<scene.WebSceneCompositorLayerCount(shellTransitionFrame):");
  lines.push("        let action = scene.WebSceneCompositorLayerTransitionActionAt(shellTransitionFrame, layerIndex)");
  lines.push("        if action == scene.WebSceneLayerTransitionReuse:");
  lines.push("            shellFrameReuseLayers = shellFrameReuseLayers + 1");
  lines.push("            if scene.WebSceneCompositorLayerCommandCountAt(shellTransitionFrame, layerIndex) != 0:");
  lines.push(`                return ${code++}`);
  lines.push(`            if scene.WebSceneCompositorLayerCacheRouteAt(shellTransitionFrame, layerIndex) != ${sourceRouteIndex}:`);
  lines.push(`                return ${code++}`);
  lines.push("        elif action == scene.WebSceneLayerTransitionReplace:");
  lines.push("            shellFrameReplaceLayers = shellFrameReplaceLayers + 1");
  lines.push("            if scene.WebSceneCompositorLayerCommandCountAt(shellTransitionFrame, layerIndex) <= 0:");
  lines.push(`                return ${code++}`);
  lines.push(`            if scene.WebSceneCompositorLayerCacheRouteAt(shellTransitionFrame, layerIndex) != ${shellReuseRouteIndex}:`);
  lines.push(`                return ${code++}`);
  lines.push("    if shellFrameReuseLayers != scene.WebSceneTransitionReusedLayerCount(shellTransitionPlan):");
  lines.push(`        return ${code++}`);
  lines.push("    if shellFrameReplaceLayers != scene.WebSceneTransitionReplacedLayerCount(shellTransitionPlan):");
  lines.push(`        return ${code++}`);
  lines.push("    if scene.WebSceneCompositorGpuCommandCount(shellTransitionFrame) <= 0:");
  lines.push(`        return ${code++}`);
  lines.push("    var commandBuffer: scene.WebScenePaintCommandBuffer");
  lines.push(`    if !scene.WebSceneBuildActiveRoutePaintCommands(graph, ${targetRouteIndex * 100 + 1}, commandBuffer):`);
  lines.push(`        return ${code++}`);
  lines.push("    if scene.WebScenePaintCommandCount(commandBuffer) <= 0:");
  lines.push(`        return ${code++}`);
  lines.push("    var gpuBuffer: scene.WebSceneGpuCommandBuffer");
  lines.push(`    if !scene.WebSceneBuildActiveRouteGpuCommandsWithFullAtlases(graph, ${targetRouteIndex * 100 + 1}, imageAtlas, svgAtlas, glyphAtlas, gpuBuffer):`);
  lines.push(`        return ${code++}`);
  lines.push("    if scene.WebSceneGpuCommandCount(gpuBuffer) <= 0:");
  lines.push(`        return ${code++}`);
  lines.push("    if scene.WebSceneDirtyCount(graph) != 2:");
  lines.push(`        return ${code++}`);
  lines.push("    var frame: scene.WebSceneCompositorFrame");
  lines.push("    if !scene.WebSceneBuildCompositorFrameForDirtySpanWithFullAtlases(graph, 1, imageAtlas, svgAtlas, glyphAtlas, frame):");
  lines.push(`        return ${code++}`);
  lines.push("    if scene.WebSceneCompositorLayerCount(frame) <= 0:");
  lines.push(`        return ${code++}`);
  lines.push("    if scene.WebSceneCompositorGpuCommandCount(frame) <= 0:");
  lines.push(`        return ${code++}`);
  lines.push("    echo(\"web_scene_csgc_runtime_smoke ok\")");
  lines.push("    return 0");
  lines.push("");
  return lines.join("\n");
}

function scenePaintKindExpr(opKind) {
  if (opKind === "fill") return "scene.WebScenePaintFill";
  if (opKind === "border") return "scene.WebScenePaintBorder";
  if (opKind === "text_color") return "scene.WebScenePaintTextColor";
  if (opKind === "text") return "scene.WebScenePaintText";
  if (opKind === "placeholder_text") return "scene.WebScenePaintPlaceholderText";
  if (opKind === "svg_icon") return "scene.WebScenePaintSvgIcon";
  if (opKind === "image") return "scene.WebScenePaintImage";
  throw new Error(`unsupported scene paint op kind in smoke: ${opKind}`);
}

function scenePaintKindIsText(opKind) {
  return opKind === "text" || opKind === "placeholder_text";
}

function sceneCssRuleOrdinal(rule) {
  return Number(rule?.data?.ruleOrder ?? rule?.ordinal ?? 0);
}

function sceneCssVariantConditions(rule) {
  const conditions = rule?.data?.variantChain;
  return Array.isArray(conditions) ? conditions : [];
}

function sceneCssDeclarations(rule) {
  const declarations = rule?.data?.declarations;
  return Array.isArray(declarations) ? declarations : [];
}

function sceneColorArg(color) {
  if (color === undefined || color === null || color === "") return "Int64(0)";
  if (typeof color !== "string" || !/^0x[0-9a-fA-F]+$/.test(color)) {
    throw new Error(`unsupported scene paint color in smoke: ${String(color)}`);
  }
  return `Int64(${BigInt(color).toString(10)})`;
}

function sceneSvgPrimitiveCall(paint, primitive) {
  if (!primitive || typeof primitive !== "object") {
    throw new Error("invalid scene svg primitive in smoke");
  }
  const base = `graph, ${Number(paint.routeIndex)}, ${Number(paint.nodeId)}, ${Number(paint.ordinal)}`;
  if (primitive.kind === "Line") {
    return `scene.WebSceneAddPaintSvgLine(${base}, ${sceneSvgCoord(primitive.x1)}, ${sceneSvgCoord(primitive.y1)}, ${sceneSvgCoord(primitive.x2)}, ${sceneSvgCoord(primitive.y2)})`;
  }
  if (primitive.kind === "Circle") {
    return `scene.WebSceneAddPaintSvgCircle(${base}, ${sceneSvgCoord(primitive.cx)}, ${sceneSvgCoord(primitive.cy)}, ${sceneSvgCoord(primitive.r)})`;
  }
  if (primitive.kind === "Ellipse") {
    return `scene.WebSceneAddPaintSvgEllipse(${base}, ${sceneSvgCoord(primitive.cx)}, ${sceneSvgCoord(primitive.cy)}, ${sceneSvgCoord(primitive.rx)}, ${sceneSvgCoord(primitive.ry)})`;
  }
  if (primitive.kind === "Rect") {
    return `scene.WebSceneAddPaintSvgRect(${base}, ${sceneSvgCoord(primitive.x)}, ${sceneSvgCoord(primitive.y)}, ${sceneSvgCoord(primitive.width)}, ${sceneSvgCoord(primitive.height)})`;
  }
  if (primitive.kind === "Triangle") {
    return `scene.WebSceneAddPaintSvgTriangle(${base}, ${sceneSvgCoord(primitive.x1)}, ${sceneSvgCoord(primitive.y1)}, ${sceneSvgCoord(primitive.x2)}, ${sceneSvgCoord(primitive.y2)}, ${sceneSvgCoord(primitive.x3)}, ${sceneSvgCoord(primitive.y3)})`;
  }
  throw new Error(`unsupported scene svg primitive kind in smoke: ${String(primitive.kind)}`);
}

function sceneSvgCoord(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`invalid scene svg coordinate in smoke: ${String(value)}`);
  }
  return Math.round(n * 100);
}

function scenePixelExpr(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`invalid scene pixel in smoke: ${String(value)}`);
  }
  const unsigned = n >>> 0;
  return `int32(0x${unsigned.toString(16).padStart(8, "0").toUpperCase()})`;
}

function withProjectRoot(facts, projectRoot) {
  let updated = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (nextFact.kind === "csg.web.project" || nextFact.kind === "csg.project") {
      nextFact.projectRoot = projectRoot;
      updated = true;
    }
    return nextFact;
  });
  if (updated) return nextFacts;
  return [
    ...nextFacts,
    {
      kind: "csg.web.project",
      id: "csg.web.project.local-asset-smoke",
      projectRoot,
    },
  ];
}

function withAddedDomTemplateProp(facts, prop) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.nodeKind === "text") {
      return structuredClone(fact);
    }

    added = true;
    const props = Array.isArray(fact.props) ? fact.props : [];
    const nextFact = structuredClone(fact);
    nextFact.props = [...props, prop];
    if (typeof nextFact.attributeCount === "number") {
      nextFact.attributeCount += 1;
    }
    return nextFact;
  });

  assert.equal(added, true, "expected a csg.web.dom_node_template fact for hard-fail smoke");
  return nextFacts;
}

function withAddedDomTemplateProps(facts, props) {
  return props.reduce((current, prop) => withAddedDomTemplateProp(current, prop), facts);
}

function withFirstDomTemplateProps(facts, props) {
  let updated = false;
  const nextFacts = facts.map((fact) => {
    if (updated || fact.kind !== "csg.web.dom_node_template" || fact.nodeKind === "text") {
      return structuredClone(fact);
    }
    updated = true;
    const nextFact = structuredClone(fact);
    const existing = Array.isArray(nextFact.props) ? nextFact.props : [];
    const names = new Set(props.map((prop) => prop.name));
    nextFact.props = [
      ...existing.filter((prop) => !names.has(prop.name)),
      ...props,
    ];
    nextFact.attributeCount = nextFact.props.length;
    return nextFact;
  });
  assert.equal(updated, true, "expected a csg.web.dom_node_template fact for prop replace smoke");
  return nextFacts;
}

function withFirstDomTemplateTagAndProps(facts, tagName, props) {
  let updated = false;
  const nextFacts = facts.map((fact) => {
    if (updated || fact.kind !== "csg.web.dom_node_template" || fact.nodeKind === "text") {
      return structuredClone(fact);
    }
    updated = true;
    const nextFact = structuredClone(fact);
    nextFact.tagName = tagName;
    const existing = Array.isArray(nextFact.props) ? nextFact.props : [];
    const names = new Set(props.map((prop) => prop.name));
    nextFact.props = [
      ...existing.filter((prop) => !names.has(prop.name)),
      ...props,
    ];
    nextFact.attributeCount = nextFact.props.length;
    return nextFact;
  });
  assert.equal(updated, true, "expected a csg.web.dom_node_template fact for tag/prop replace smoke");
  return nextFacts;
}

function withDefaultMediaContentChildren(facts, contents) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.nodeKind === "text") {
      return structuredClone(fact);
    }

    added = true;
    const children = Array.isArray(fact.children) ? fact.children : [];
    const nextFact = structuredClone(fact);
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 2000,
        tagName: "ResponsiveMasonry",
        props: [{
          kind: "attribute",
          ordinal: 0,
          name: "columnsCountBreakPoints",
          valueKind: "expression",
          value: "{\"0\":2,\"520\":3,\"840\":4,\"1120\":5,\"1440\":6}",
          expression: "{\"0\":2,\"520\":3,\"840\":4,\"1120\":5,\"1440\":6}",
        }],
        children: [{
          kind: "element",
          ordinal: 0,
          tagName: "Masonry",
          props: [{
            kind: "attribute",
            ordinal: 0,
            name: "gutter",
            valueKind: "string",
            value: "8px",
          }],
          children: contents.map((content, index) => ({
            kind: "element",
            ordinal: index,
            tagName: "div",
            props: [{
              kind: "attribute",
              ordinal: 0,
              name: "content",
              valueKind: "expression",
              value: JSON.stringify(content),
              staticValue: content,
            }, {
              kind: "attribute",
              ordinal: 1,
              name: "data-csg-media-node",
              valueKind: "string",
              value: "content-card",
            }, {
              kind: "attribute",
              ordinal: 2,
              name: "onClick",
              valueKind: "expression",
              value: "() => onClick?.(content)",
              expression: "() => onClick?.(content)",
            }],
            children: [],
          })),
        }],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });

  assert.equal(added, true, "expected a csg.web.dom_node_template fact for media content smoke");
  return nextFacts;
}

function withMasonryTemplateChild(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || nextFact.kind !== "csg.web.dom_node_template" || nextFact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    nextFact.owner = "csg.fn.local-file-owner";
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 1200,
        tagName: "ResponsiveMasonry",
        props: [{
          kind: "attribute",
          ordinal: 0,
          name: "columnsCountBreakPoints",
          valueKind: "expression",
          value: "{\"0\":2,\"520\":3,\"840\":4,\"1120\":5,\"1440\":6}",
          expression: "{\"0\":2,\"520\":3,\"840\":4,\"1120\":5,\"1440\":6}",
        }],
        children: [{
          kind: "element",
          ordinal: 0,
          tagName: "Masonry",
          props: [{
            kind: "attribute",
            ordinal: 0,
            name: "gutter",
            valueKind: "string",
            value: "8px",
          }],
          children: [
            { kind: "element", ordinal: 0, tagName: "article", props: [], children: [{ kind: "text", ordinal: 0, text: "card-a" }] },
            { kind: "element", ordinal: 1, tagName: "article", props: [], children: [{ kind: "text", ordinal: 0, text: "card-b" }] },
          ],
        }],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });

  assert.equal(added, true, "expected a section template for masonry smoke");
  return nextFacts;
}

function withVirtualizedMasonryTemplateChild(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || nextFact.kind !== "csg.web.dom_node_template" || nextFact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 1210,
        tagName: "VirtualizedMasonry",
        props: [{
          kind: "attribute",
          ordinal: 0,
          name: "items",
          valueKind: "expression",
          value: "displayContents",
          staticValue: [
            { id: "a", title: "card-a" },
            { id: "b", title: "card-b" },
          ],
        }, {
          kind: "attribute",
          ordinal: 1,
          name: "renderItem",
          valueKind: "expression",
          value: "(item) => <article className=\"probe-card\">card</article>",
        }, {
          kind: "attribute",
          ordinal: 2,
          name: "itemKey",
          valueKind: "expression",
          value: "(item) => item.id",
        }, {
          kind: "attribute",
          ordinal: 3,
          name: "minColumnWidth",
          valueKind: "expression",
          value: "180",
          staticValue: 180,
        }, {
          kind: "attribute",
          ordinal: 4,
          name: "minColumns",
          valueKind: "expression",
          value: "2",
          staticValue: 2,
        }, {
          kind: "attribute",
          ordinal: 5,
          name: "maxColumns",
          valueKind: "expression",
          value: "6",
          staticValue: 6,
        }, {
          kind: "attribute",
          ordinal: 6,
          name: "gap",
          valueKind: "expression",
          value: "8",
          staticValue: 8,
        }, {
          kind: "attribute",
          ordinal: 7,
          name: "estimatedItemHeight",
          valueKind: "expression",
          value: "200",
          staticValue: 200,
        }],
        children: [],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });

  assert.equal(added, true, "expected a section template for virtualized masonry smoke");
  return nextFacts;
}

function withStateDefaultStyleTemplateProp(facts) {
  let added = false;
  let owner = "csg.web.materializer.state-style-owner";
  const nextFacts = facts.map((fact) => {
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return structuredClone(fact);
    }

    added = true;
    const nextFact = structuredClone(fact);
    owner = typeof nextFact.owner === "string" && nextFact.owner.length > 0
      ? nextFact.owner
      : owner;
    if (typeof nextFact.owner !== "string" || nextFact.owner.length === 0) {
      nextFact.owner = owner;
    }
    const props = Array.isArray(nextFact.props) ? nextFact.props : [];
    nextFact.props = [
      ...props,
      {
        kind: "attribute",
        ordinal: 1004,
        name: "style",
        valueKind: "expression",
        value: "{ transform: `translateX(${offsetX}px)`, touchAction: \"pan-y\" }",
        expression: "{ transform: `translateX(${offsetX}px)`, touchAction: \"pan-y\" }",
      },
    ];
    if (typeof nextFact.attributeCount === "number") {
      nextFact.attributeCount += 1;
    }
    return nextFact;
  });

  assert.equal(added, true, "expected a section template for state style smoke");
  return [
    ...nextFacts,
    {
      kind: "csg.binding",
      id: "csg.binding.state-style-offset-x",
      owner,
      declarationKind: "const",
      name: "offsetX",
      path: [{ kind: "index", index: 0 }],
      defaultInitializerKind: "StaticJsonValue",
      defaultInitializer: "0",
      type: "number",
    },
  ];
}

function withPlaceholderInputRoot(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 999,
        tagName: "input",
        props: [
          {
            kind: "attribute",
            ordinal: 0,
            name: "className",
            valueKind: "string",
            value: "w-full placeholder:text-gray-300",
          },
          {
            kind: "attribute",
            ordinal: 1,
            name: "placeholder",
            valueKind: "string",
            value: "输入标题",
          },
        ],
        children: [],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for placeholder input smoke");
  return nextFacts;
}

function withStaticMapChild(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "expression",
        ordinal: 999,
        expression: "languages.map((lang, i) => (<button key={i}><div><div>{lang.nativeName}</div><div>{lang.name}</div><div>{i}</div><div>{i === 0 ? 23 : i * 2 - 1}</div><div>{lang.shortLabel.split(' ')[0]}</div><div>{LANGUAGE_SHORT[lang.code]}</div></div></button>))",
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for static map smoke");
  nextFacts.push(
    {
      kind: "csg.data",
      id: "csg.data.static-map-smoke.languages",
      dataKind: "static_string_object_array",
      value: {
        bindingName: "languages",
        sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx",
        items: [
          { code: "en", name: "English", nativeName: "English", shortLabel: "Alpha Primary" },
          { code: "ja", name: "Japanese", nativeName: "日本語", shortLabel: "Beta Secondary" },
        ],
      },
    },
    {
      kind: "csg.data",
      id: "csg.data.static-map-smoke.language-short",
      dataKind: "static_json_value",
      value: {
        bindingName: "LANGUAGE_SHORT",
        sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx",
        value: { en: "EN", ja: "JA" },
      },
    },
  );
  return nextFacts;
}

function withInlineLiteralAsCastMapChild(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "expression",
        ordinal: 985,
        expression: "[{ key: 'chart' as BaziTab, label: '盘面' }, { key: 'assist' as BaziTab, label: '辅助' }, { key: 'tips' as BaziTab, label: '提示' }, { key: 'archive' as BaziTab, label: '档案' }].map(tab => (<button key={tab.key}>{tab.label}</button>))",
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for inline literal map smoke");
  return nextFacts;
}

// Bazi 排盘 result: a useState-with-setter object whose fields are rendered via dotted
// member access text bindings ({result.dayGan} etc). The materializer must produce a
// flat-KV textStateRef of the full dotted path so the scene runtime can bind each field.
function withBaziResultStateAndChildren(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      { kind: "expression", ordinal: 981, expression: "result.dayGan" },
      { kind: "expression", ordinal: 982, expression: "result.gender" },
      { kind: "expression", ordinal: 983, expression: "result.shiShen.hourGan" },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 3;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for bazi result binding smoke");
  nextFacts.push(
    {
      kind: "csg.op",
      id: "csg.op.bazi-result-use-state",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "call",
      ordinal: 970,
      callee: "useState",
      argumentCount: 0,
      arguments: [],
    },
    {
      kind: "csg.op",
      id: "csg.op.bazi-result-binding",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "binding_extract",
      ordinal: 971,
      source: "csg.op.bazi-result-use-state",
      name: "result",
      path: [{ kind: "index", index: 0 }],
    },
    {
      kind: "csg.op",
      id: "csg.op.bazi-result-setter-binding",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "binding_extract",
      ordinal: 972,
      source: "csg.op.bazi-result-use-state",
      name: "setResult",
      path: [{ kind: "index", index: 1 }],
    },
  );
  return nextFacts;
}

function withAvatarInitialExpressionChild(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "expression",
        ordinal: 999,
        expression: "avatarInitial(content.userName)",
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for avatar initial smoke");
  return nextFacts;
}

function withContentCardLocationLabelExpressionChild(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "expression",
        ordinal: 1000,
        expression: "locationLabel",
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for ContentCard location smoke");
  return nextFacts;
}

function withStaticMapStateSwitchChild(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "expression",
        ordinal: 1001,
        expression: "switchItems.map((item) => (<button key={item.id} onClick={() => setPublishNoticeOpen(!publishNoticeOpen)} className={`relative h-6 w-11 ${publishNoticeOpen ? 'bg-purple-500' : 'bg-gray-300'}`}><span className={`absolute ${publishNoticeOpen ? 'translate-x-5' : 'translate-x-0'}`}>{item.label}</span></button>))",
      },
      {
        kind: "expression",
        ordinal: 1002,
        expression: "publishNoticeOpen && (<div className=\"mt-2\"><span>展开内容</span></div>)",
      },
      {
        kind: "expression",
        ordinal: 1003,
        expression: "(<button onClick={() => setAddressDraft((prev) => ({ ...prev, isDefault: !prev.isDefault }))} className={`relative ${addressDraft.isDefault ? 'bg-purple-500' : 'bg-gray-300'}`}>默认地址</button>)",
      },
      {
        kind: "expression",
        ordinal: 10031,
        expression: "(<input value={addressDraft.receiver} onChange={(e) => setAddressDraft((prev) => ({ ...prev, receiver: e.target.value }))} />)",
      },
      {
        kind: "expression",
        ordinal: 10032,
        expression: "[t.profile_tagSchool, t.profile_tagHome, t.profile_tagDelivery].map((tag) => (<button key={tag} onClick={() => setAddressDraft((prev) => ({ ...prev, tag: prev.tag === tag ? '' : tag }))}>{tag}</button>))",
      },
      {
        kind: "expression",
        ordinal: 10033,
        expression: "(<button onClick={handleSaveAddress}>保存地址</button>)",
      },
      {
        kind: "expression",
        ordinal: 1004,
        expression: "(<button onClick={() => setProfileDraft({ ...profileDraft, isDefault: !profileDraft.isDefault })} className={`relative ${profileDraft.isDefault ? 'text-purple-500' : 'text-gray-600'}`}>资料默认</button>)",
      },
      {
        kind: "expression",
        ordinal: 1005,
        expression: "(<button onClick={() => handleRemovePaymentQr('wechat')}>删除微信</button>)",
      },
      {
        kind: "expression",
        ordinal: 1006,
        expression: "(<button onClick={() => handleRemovePaymentQr('alipay')}>删除支付宝</button>)",
      },
      {
        kind: "expression",
        ordinal: 1007,
        expression: "(<div><input type=\"file\" ref={wechatQrInputRef} onChange={(e) => handlePaymentQrUpload('wechat', e)} accept=\"image/*\" className=\"hidden\" /><img src={wechatQr} alt=\"微信收款码\" /><button onClick={() => wechatQrInputRef.current?.click()}>选择微信</button></div>)",
      },
      {
        kind: "expression",
        ordinal: 1008,
        expression: "(<div><input type=\"file\" ref={alipayQrInputRef} onChange={(e) => handlePaymentQrUpload('alipay', e)} accept=\"image/*\" className=\"hidden\" /><img src={alipayQr} alt=\"支付宝收款码\" /><button onClick={() => alipayQrInputRef.current?.click()}>选择支付宝</button></div>)",
      },
      {
        kind: "expression",
        ordinal: 1009,
        expression: "(<button onClick={() => {/* use current location */ }} className=\"px-3 py-1\">使用当前位置</button>)",
      },
      {
        kind: "expression",
        ordinal: 1010,
        expression: "(<button onClick={() => toggleFeature('dex_clob_v1', !dexClobEnabled)} className={`relative ${dexClobEnabled ? 'bg-purple-600' : 'bg-gray-200'}`}>DEX CLOB</button>)",
      },
      {
        kind: "expression",
        ordinal: 1011,
        expression: "(<div><input type=\"file\" ref={localFileInputRef} accept=\"image/*\" className=\"hidden\" /><button onClick={handleOpenLocalFile}>打开本地图片</button></div>)",
      },
      {
        kind: "expression",
        ordinal: 1012,
        expression: "(<button onClick={toggleOriginUnit}>{errandOriginUnit === 'km' ? t.profile_rangeUnit : t.profile_rangeUnitM}</button>)",
      },
      {
        kind: "expression",
        ordinal: 1013,
        expression: "(<input value={originInput} onBlur={() => { const n = Number(originInput); if (!originInput || isNaN(n) || n < originSliderMin) { saveErrandOriginM(originFromDisplay(originSliderMin)); setOriginInput(String(originSliderMin)); } else if (n > originSliderMax) { saveErrandOriginM(originFromDisplay(originSliderMax)); setOriginInput(String(originSliderMax)); } else { const rounded = errandOriginUnit === 'km' ? Math.round(n) : Math.round(n / 100) * 100; saveErrandOriginM(originFromDisplay(rounded)); setOriginInput(String(rounded)); } }} />)",
      },
      {
        kind: "expression",
        ordinal: 1014,
        expression: "SPEAKING_LANGUAGES.map((lang) => { const selected = speakingPartnerLangs.includes(lang.code); return (<button key={lang.code} onClick={() => { const next = selected ? speakingPartnerLangs.filter((c) => c !== lang.code) : [...speakingPartnerLangs, lang.code]; saveSpeakingLangs(next); }}>{lang.label}</button>); })",
      },
      {
        kind: "expression",
        ordinal: 1015,
        expression: "(<div><input type=\"file\" ref={publishImagesInputRef} onChange={handleImageSelect} accept=\"image/*\" className=\"hidden\" /><button onClick={() => publishImagesInputRef.current?.click()}>添加图片</button></div>)",
      },
      {
        kind: "expression",
        ordinal: 1016,
        expression: "(<div><input type=\"file\" ref={adCoverInputRef} onChange={handleCoverSelect} accept=\"image/*,video/*\" className=\"hidden\" /><img src={adCover} alt=\"广告封面\" /><button onClick={() => adCoverInputRef.current?.click()}>广告封面</button></div>)",
      },
      {
        kind: "expression",
        ordinal: 1017,
        expression: "(<div><input type=\"file\" ref={fileInputRef} onChange={handleFileSelect} accept=\"image/*\" className=\"hidden\" /><button onClick={() => fileInputRef.current?.click()}>发布媒体</button></div>)",
      },
      {
        kind: "expression",
        ordinal: 1018,
        expression: "PUBLISH_TAGS.map((tag) => (<button key={tag} onClick={() => applyInlineTagSuggestion(tag)}>#{tag}</button>))",
      },
      {
        kind: "expression",
        ordinal: 1019,
        expression: "(<button onClick={() => { localStorage.setItem('app_locale', 'zh-CN'); localStorage.setItem('app_language_set', 'true'); onSelect('zh-CN'); }}>跳过，使用简体中文</button>)",
      },
      {
        kind: "expression",
        ordinal: 1020,
        expression: "(<input value={ridePhone} onChange={(e) => saveRidePhone(e.target.value)} />)",
      },
      {
        kind: "expression",
        ordinal: 1021,
        expression: "isKeyboardOpen && (<div className=\"fixed bottom-0 left-0 right-0 bg-gray-100 rounded-t-xl\"><div className=\"flex items-center justify-between\"><span>车牌键盘</span><button onClick={(e) => { e.stopPropagation(); setIsKeyboardOpen(false); }}>关闭</button></div><div>{showProvinces ? (<button>省键</button>) : (<button>字母键</button>)}</div><div>{Array.from({ length: 3 }).map((_, i) => { const isNewEnergy = i === 2; const char = value[i] || ''; const isSelected = false; return (<button key={i} onClick={(e) => { e.stopPropagation(); setActiveIndex(i); }}><span>{i}</span><span>{char}</span>{isNewEnergy && !char && !isSelected && <span>新能源</span>}</button>); })}</div><div>{ALPHANUMERIC_KEYBOARD.map((row, i) => (<div key={i} className=\"flex gap-1\">{row.map((char) => (<button key={char} data-csg-license-plate-value-ref=\"licensePlate\" data-csg-license-plate-active-index-ref=\"activeIndex\" onClick={(e) => { e.stopPropagation(); handleKeyClick(char); }}>{char}</button>))}{i === 1 && (<button data-csg-license-plate-value-ref=\"licensePlate\" data-csg-license-plate-active-index-ref=\"activeIndex\" onClick={(e) => { e.stopPropagation(); handleDelete(); }}>删除</button>)}</div>))}</div></div>)",
      },
      {
        kind: "expression",
        ordinal: 1022,
        expression: "marketplaceApps.map((app) => { const unlocked = appUnlocked(app); return (<div key={app.id} data-app-id={app.id} className={`badge ${unlocked ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{app.name}</div>); })",
      },
      {
        kind: "expression",
        ordinal: 1023,
        expression: "images.length < 9 && (<button onClick={() => publishImagesInputRef.current?.click()}><span>{images.length}/9</span></button>)",
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 23;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for static map state switch smoke");
  nextFacts.push({
    kind: "csg.data",
    id: "csg.data.static-map-state-switch.items",
    dataKind: "static_string_object_array",
    value: {
      bindingName: "switchItems",
      sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx",
      items: [{ id: "notice", label: "发布须知" }],
    },
  });
  nextFacts.push({
    kind: "csg.data",
    id: "csg.data.static-map-state-switch.marketplace-apps",
    dataKind: "static_json_value",
    value: {
      bindingName: "marketplaceApps",
      sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx",
      value: [
        { id: "free-app", name: "免费应用", price: "free" },
        { id: "paid-app", name: "付费应用", price: 12 },
        { id: "blocked-app", name: "未解锁应用", price: 18 },
      ],
    },
  });
  nextFacts.push({
    kind: "csg.data",
    id: "csg.data.static-map-state-switch.entitlements",
    dataKind: "static_json_value",
    value: {
      bindingName: "entitlements",
      sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx",
      value: {
        "paid-app": true,
        "blocked-app": false,
      },
    },
  });
  nextFacts.push({
    kind: "csg.data",
    id: "csg.data.static-map-state-switch.errand-origin-label",
    dataKind: "static_json_value",
    value: {
      bindingName: "errandOriginUnitLabel",
      sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx",
      value: "km",
    },
  });
  nextFacts.push({
    kind: "csg.data",
    id: "csg.data.static-map-state-switch.speaking-languages",
    dataKind: "static_string_object_array",
    value: {
      bindingName: "SPEAKING_LANGUAGES",
      sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx",
      items: [{ code: "en-US", label: "English" }],
    },
  });
  nextFacts.push({
    kind: "csg.data",
    id: "csg.data.static-map-state-switch.publish-tags",
    dataKind: "static_json_value",
    value: {
      bindingName: "PUBLISH_TAGS",
      sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx",
      value: ["日常"],
    },
  });
  nextFacts.push({
    kind: "csg.data",
    id: "csg.data.static-map-state-switch.keyboard",
    dataKind: "static_json_value",
    value: {
      bindingName: "ALPHANUMERIC_KEYBOARD",
      sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx",
      value: [["1", "2"], ["A", "B"]],
    },
  });
  nextFacts.push({
    kind: "csg.data",
    id: "csg.data.ride-phone-empty",
    value: "",
  });
  nextFacts.push({
    kind: "csg.data",
    id: "csg.data.active-index-zero",
    dataKind: "number",
    value: 0,
  });
  nextFacts.push({
    kind: "csg.data",
    id: "csg.data.license-plate-empty",
    dataKind: "static_json_value",
    value: {
      bindingName: "value",
      sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx",
      value: "",
    },
  });
  nextFacts.push(
    {
      kind: "csg.function",
      id: "csg.fn.save-ride-phone",
      name: "saveRidePhone",
      exported: false,
      async: false,
      generator: false,
      parameters: [{ index: 0, name: "v", type: "string" }],
    },
    {
      kind: "csg.op",
      id: "csg.op.local-file-open-function-value",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "function_value",
      ordinal: 1,
      functionKind: "ArrowFunction",
      targetFunction: "csg.fn.local-file-open",
    },
    {
      kind: "csg.op",
      id: "csg.op.local-file-open-local-write",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "local_write",
      ordinal: 2,
      name: "handleOpenLocalFile",
      value: "csg.op.local-file-open-function-value",
    },
    {
      kind: "csg.op",
      id: "csg.op.save-ride-phone-function-value",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "function_value",
      ordinal: 3,
      functionKind: "ArrowFunction",
      targetFunction: "csg.fn.save-ride-phone",
    },
    {
      kind: "csg.op",
      id: "csg.op.save-ride-phone-local-write",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "local_write",
      ordinal: 4,
      name: "saveRidePhone",
      value: "csg.op.save-ride-phone-function-value",
    },
    {
      kind: "csg.op",
      id: "csg.op.ride-phone-empty-literal",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "literal",
      ordinal: 5,
      literalKind: "string",
      data: "csg.data.ride-phone-empty",
    },
    {
      kind: "csg.op",
      id: "csg.op.ride-phone-use-state",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "call",
      ordinal: 6,
      callee: "useState",
      argumentCount: 1,
      arguments: ["csg.op.ride-phone-empty-literal"],
    },
    {
      kind: "csg.op",
      id: "csg.op.ride-phone-binding",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "binding_extract",
      ordinal: 7,
      source: "csg.op.ride-phone-use-state",
      name: "ridePhone",
      path: [{ kind: "index", index: 0 }],
    },
    {
      kind: "csg.op",
      id: "csg.op.ride-phone-setter-binding",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "binding_extract",
      ordinal: 8,
      source: "csg.op.ride-phone-use-state",
      name: "setRidePhone",
      path: [{ kind: "index", index: 1 }],
    },
    {
      kind: "csg.op",
      id: "csg.op.keyboard-open-use-state",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "call",
      ordinal: 90,
      callee: "useState",
      argumentCount: 0,
      arguments: [],
    },
    {
      kind: "csg.op",
      id: "csg.op.keyboard-open-binding",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "binding_extract",
      ordinal: 91,
      source: "csg.op.keyboard-open-use-state",
      name: "isKeyboardOpen",
      path: [{ kind: "index", index: 0 }],
      defaultInitializer: "false",
    },
    {
      kind: "csg.op",
      id: "csg.op.keyboard-open-setter-binding",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "binding_extract",
      ordinal: 92,
      source: "csg.op.keyboard-open-use-state",
      name: "setIsKeyboardOpen",
      path: [{ kind: "index", index: 1 }],
    },
    {
      kind: "csg.op",
      id: "csg.op.active-index-use-state",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "call",
      ordinal: 93,
      callee: "useState",
      argumentCount: 0,
      arguments: [],
    },
    {
      kind: "csg.op",
      id: "csg.op.active-index-binding",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "binding_extract",
      ordinal: 94,
      source: "csg.op.active-index-use-state",
      name: "activeIndex",
      path: [{ kind: "index", index: 0 }],
      defaultInitializer: "0",
    },
    {
      kind: "csg.op",
      id: "csg.op.active-index-setter-binding",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "binding_extract",
      ordinal: 95,
      source: "csg.op.active-index-use-state",
      name: "setActiveIndex",
      path: [{ kind: "index", index: 1 }],
    },
    {
      kind: "csg.op",
      id: "csg.op.show-provinces-left",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "identifier",
      ordinal: 96,
      name: "activeIndex",
    },
    {
      kind: "csg.op",
      id: "csg.op.show-provinces-right",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "literal",
      ordinal: 97,
      data: "csg.data.active-index-zero",
    },
    {
      kind: "csg.op",
      id: "csg.op.show-provinces-binary",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "binary",
      ordinal: 98,
      left: "csg.op.show-provinces-left",
      right: "csg.op.show-provinces-right",
      operator: "EqualsEqualsEqualsToken",
    },
    {
      kind: "csg.op",
      id: "csg.op.show-provinces-write",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "local_write",
      ordinal: 99,
      name: "showProvinces",
      value: "csg.op.show-provinces-binary",
    },
    {
      kind: "csg.op",
      id: "csg.op.save-ride-phone-param",
      function: "csg.fn.save-ride-phone",
      block: "csg.block.save-ride-phone-entry",
      opKind: "identifier",
      ordinal: 0,
      name: "v",
    },
    {
      kind: "csg.op",
      id: "csg.op.save-ride-phone-set",
      function: "csg.fn.save-ride-phone",
      block: "csg.block.save-ride-phone-entry",
      opKind: "call",
      ordinal: 1,
      callee: "setRidePhone",
      argumentCount: 1,
      arguments: ["csg.op.save-ride-phone-param"],
    },
    {
      kind: "csg.op",
      id: "csg.op.local-file-open-ref",
      function: "csg.fn.local-file-open",
      block: "csg.block.local-file-open-entry",
      opKind: "identifier",
      ordinal: 0,
      name: "localFileInputRef",
    },
    {
      kind: "csg.op",
      id: "csg.op.local-file-open-current",
      function: "csg.fn.local-file-open",
      block: "csg.block.local-file-open-entry",
      opKind: "property_read",
      ordinal: 1,
      receiver: "csg.op.local-file-open-ref",
      name: "current",
    },
    {
      kind: "csg.op",
      id: "csg.op.local-file-open-click",
      function: "csg.fn.local-file-open",
      block: "csg.block.local-file-open-entry",
      opKind: "call",
      ordinal: 2,
      callee: "localFileInputRef.current?.click",
      receiver: "csg.op.local-file-open-current",
      memberName: "click",
      argumentCount: 0,
      arguments: [],
    },
    {
      kind: "csg.data",
      id: "csg.data.publish-ad-cover-empty",
      dataKind: "static_json_value",
      value: "",
    },
    {
      kind: "csg.function",
      id: "csg.fn.publish-image-select",
      name: "handleImageSelect",
      exported: false,
      async: true,
      generator: false,
      parameters: [{ index: 0, name: "e", type: "ChangeEvent<HTMLInputElement>" }],
    },
    {
      kind: "csg.function",
      id: "csg.fn.publish-image-next",
      name: "<anonymous>",
      exported: false,
      async: false,
      generator: false,
      parameters: [{ index: 0, name: "prev", type: "string[]" }],
    },
    {
      kind: "csg.function",
      id: "csg.fn.publish-image-map-item",
      name: "<anonymous>",
      exported: false,
      async: false,
      generator: false,
      parameters: [{ index: 0, name: "item", type: "PreparedImage" }],
    },
    {
      kind: "csg.function",
      id: "csg.fn.publish-cover-select",
      name: "handleCoverSelect",
      exported: false,
      async: true,
      generator: false,
      parameters: [{ index: 0, name: "e", type: "ChangeEvent<HTMLInputElement>" }],
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-images-use-state-arg",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "array_literal",
      ordinal: 10,
      elementCount: 0,
      elements: [],
      spreadFlags: [],
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-images-use-state",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "call",
      ordinal: 11,
      callee: "useState",
      argumentCount: 1,
      arguments: ["csg.op.publish-images-use-state-arg"],
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-images-binding",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "binding_extract",
      ordinal: 12,
      source: "csg.op.publish-images-use-state",
      name: "images",
      path: [{ kind: "index", index: 0 }],
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-images-setter-binding",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "binding_extract",
      ordinal: 13,
      source: "csg.op.publish-images-use-state",
      name: "setImages",
      path: [{ kind: "index", index: 1 }],
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-ad-cover-empty-literal",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "literal",
      ordinal: 14,
      literalKind: "string",
      data: "csg.data.publish-ad-cover-empty",
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-ad-cover-use-state",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "call",
      ordinal: 15,
      callee: "useState",
      argumentCount: 1,
      arguments: ["csg.op.publish-ad-cover-empty-literal"],
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-ad-cover-binding",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "binding_extract",
      ordinal: 16,
      source: "csg.op.publish-ad-cover-use-state",
      name: "adCover",
      path: [{ kind: "index", index: 0 }],
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-ad-cover-setter-binding",
      function: "csg.fn.local-file-owner",
      block: "csg.block.local-file-owner-entry",
      opKind: "binding_extract",
      ordinal: 17,
      source: "csg.op.publish-ad-cover-use-state",
      name: "setAdCover",
      path: [{ kind: "index", index: 1 }],
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-images-prepare",
      function: "csg.fn.publish-image-select",
      block: "csg.block.publish-image-select-entry",
      opKind: "call",
      ordinal: 0,
      callee: "preparePublishImages",
      argumentCount: 1,
      arguments: [],
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-images-next-function",
      function: "csg.fn.publish-image-select",
      block: "csg.block.publish-image-select-entry",
      opKind: "function_value",
      ordinal: 1,
      functionKind: "ArrowFunction",
      targetFunction: "csg.fn.publish-image-next",
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-images-set-call",
      function: "csg.fn.publish-image-select",
      block: "csg.block.publish-image-select-entry",
      opKind: "call",
      ordinal: 2,
      callee: "setImages",
      argumentCount: 1,
      arguments: ["csg.op.publish-images-next-function"],
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-image-prev",
      function: "csg.fn.publish-image-next",
      block: "csg.block.publish-image-next-entry",
      opKind: "identifier",
      ordinal: 0,
      name: "prev",
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-image-map-function",
      function: "csg.fn.publish-image-next",
      block: "csg.block.publish-image-next-entry",
      opKind: "function_value",
      ordinal: 1,
      functionKind: "ArrowFunction",
      targetFunction: "csg.fn.publish-image-map-item",
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-image-prepared-map",
      function: "csg.fn.publish-image-next",
      block: "csg.block.publish-image-next-entry",
      opKind: "call",
      ordinal: 2,
      callee: "prepared.map",
      argumentCount: 1,
      arguments: ["csg.op.publish-image-map-function"],
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-image-next-array",
      function: "csg.fn.publish-image-next",
      block: "csg.block.publish-image-next-entry",
      opKind: "array_literal",
      ordinal: 3,
      elementCount: 2,
      elements: ["csg.op.publish-image-prev", "csg.op.publish-image-prepared-map"],
      spreadFlags: [true, true],
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-image-item",
      function: "csg.fn.publish-image-map-item",
      block: "csg.block.publish-image-map-item-entry",
      opKind: "identifier",
      ordinal: 0,
      name: "item",
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-image-item-data-url",
      function: "csg.fn.publish-image-map-item",
      block: "csg.block.publish-image-map-item-entry",
      opKind: "property_read",
      ordinal: 1,
      receiver: "csg.op.publish-image-item",
      name: "dataUrl",
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-cover-prepare",
      function: "csg.fn.publish-cover-select",
      block: "csg.block.publish-cover-select-entry",
      opKind: "call",
      ordinal: 0,
      callee: "preparePublishImage",
      argumentCount: 1,
      arguments: [],
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-cover-data-url",
      function: "csg.fn.publish-cover-select",
      block: "csg.block.publish-cover-select-entry",
      opKind: "property_read",
      ordinal: 1,
      receiver: "csg.op.publish-cover-prepare",
      name: "dataUrl",
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-cover-set-call",
      function: "csg.fn.publish-cover-select",
      block: "csg.block.publish-cover-select-entry",
      opKind: "call",
      ordinal: 2,
      callee: "setAdCover",
      argumentCount: 1,
      arguments: ["csg.op.publish-cover-data-url"],
    },
  );
  const mediaStates = [
    ["mediaFiles", "setMediaFiles"],
    ["mediaPreviews", "setMediaPreviews"],
    ["mediaPayloads", "setMediaPayloads"],
    ["mediaAspectRatios", "setMediaAspectRatios"],
    ["mediaFastEntries", "setMediaFastEntries"],
  ];
  for (let i = 0; i < mediaStates.length; i += 1) {
    const [stateName, setterName] = mediaStates[i];
    nextFacts.push(
      {
        kind: "csg.op",
        id: `csg.op.publish-media-${stateName}-use-state-arg`,
        function: "csg.fn.local-file-owner",
        block: "csg.block.local-file-owner-entry",
        opKind: "array_literal",
        ordinal: 100 + i * 4,
        elementCount: 0,
        elements: [],
        spreadFlags: [],
      },
      {
        kind: "csg.op",
        id: `csg.op.publish-media-${stateName}-use-state`,
        function: "csg.fn.local-file-owner",
        block: "csg.block.local-file-owner-entry",
        opKind: "call",
        ordinal: 101 + i * 4,
        callee: "useState",
        argumentCount: 1,
        arguments: [`csg.op.publish-media-${stateName}-use-state-arg`],
      },
      {
        kind: "csg.op",
        id: `csg.op.publish-media-${stateName}-binding`,
        function: "csg.fn.local-file-owner",
        block: "csg.block.local-file-owner-entry",
        opKind: "binding_extract",
        ordinal: 102 + i * 4,
        source: `csg.op.publish-media-${stateName}-use-state`,
        name: stateName,
        path: [{ kind: "index", index: 0 }],
      },
      {
        kind: "csg.op",
        id: `csg.op.publish-media-${setterName}-binding`,
        function: "csg.fn.local-file-owner",
        block: "csg.block.local-file-owner-entry",
        opKind: "binding_extract",
        ordinal: 103 + i * 4,
        source: `csg.op.publish-media-${stateName}-use-state`,
        name: setterName,
        path: [{ kind: "index", index: 1 }],
      },
    );
  }
  nextFacts.push(
    {
      kind: "csg.function",
      id: "csg.fn.publish-media-file-select",
      name: "handleFileSelect",
      exported: false,
      async: true,
      generator: false,
      parameters: [{ index: 0, name: "e", type: "ChangeEvent<HTMLInputElement>" }],
    },
    {
      kind: "csg.op",
      id: "csg.op.publish-media-prepare",
      function: "csg.fn.publish-media-file-select",
      block: "csg.block.publish-media-file-select-entry",
      opKind: "call",
      ordinal: 0,
      callee: "preparePublishImage",
      argumentCount: 1,
      arguments: [],
    },
  );
  for (let i = 0; i < mediaStates.length; i += 1) {
    const [, setterName] = mediaStates[i];
    nextFacts.push({
      kind: "csg.op",
      id: `csg.op.publish-media-${setterName}-call`,
      function: "csg.fn.publish-media-file-select",
      block: "csg.block.publish-media-file-select-entry",
      opKind: "call",
      ordinal: 1 + i,
      callee: setterName,
      argumentCount: 1,
      arguments: ["csg.op.publish-media-prepare"],
    });
  }
  return nextFacts;
}

// A social tab panel whose per-tab body is `{snapshot.<field>.length === 0 ? <empty> : <map>}`.
// The snapshot is a useState seeded from an opaque store getter, so its collections are empty on
// first paint — the materializer must select the empty-state branch and hang it off the tab's
// runtime equals visibility, while the runtime `.map(...)` list stays a runtime-data gap.
function withSocialSnapshotTabComponent(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") return nextFact;
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      { kind: "element", ordinal: 1207, tagName: "SocialTabPanel", props: [], children: [] },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for social tab smoke");
  const fn = "csg.function.social-tab-panel";
  const block = "csg.block.social-tab-panel";
  nextFacts.push(
    { kind: "csg.op", id: "csg.op.st-tab-use-state", function: fn, block, opKind: "call", ordinal: 0, callee: "useState", argumentCount: 0, arguments: [] },
    { kind: "csg.op", id: "csg.op.st-tab-binding", function: fn, block, opKind: "binding_extract", ordinal: 1, source: "csg.op.st-tab-use-state", name: "tab", path: [{ kind: "index", index: 0 }], defaultInitializer: "conversations" },
    { kind: "csg.op", id: "csg.op.st-tab-setter", function: fn, block, opKind: "binding_extract", ordinal: 2, source: "csg.op.st-tab-use-state", name: "setTab", path: [{ kind: "index", index: 1 }] },
    { kind: "csg.op", id: "csg.op.st-snap-use-state", function: fn, block, opKind: "call", ordinal: 3, callee: "useState", argumentCount: 0, arguments: [] },
    { kind: "csg.op", id: "csg.op.st-snap-binding", function: fn, block, opKind: "binding_extract", ordinal: 4, source: "csg.op.st-snap-use-state", name: "socialSnapshot", path: [{ kind: "index", index: 0 }] },
    { kind: "csg.op", id: "csg.op.st-snap-setter", function: fn, block, opKind: "binding_extract", ordinal: 5, source: "csg.op.st-snap-use-state", name: "setSocialSnapshot", path: [{ kind: "index", index: 1 }] },
    { kind: "csg.web.js_function_ref", id: "csg.web.js_function_ref.social-tab-panel", coreFact: fn, name: "SocialTabPanel" },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.social-tab-panel-root",
      coreFact: "csg.jsx.social-tab-panel-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "div",
      attributeCount: 0,
      childCount: 1,
      owner: fn,
      props: [],
      children: [
        {
          kind: "expression",
          ordinal: 0,
          expression: "tab === 'contacts' ? (<div className=\"tab-body\">{socialSnapshot.contacts.length === 0 ? (<div className=\"empty\"><span>社交空态占位</span></div>) : socialSnapshot.contacts.map((c) => (<div><span>{c.peerId}</span></div>))}</div>) : null",
        },
      ],
    },
  );
  return nextFacts;
}

// MessagesPage-style sub-tab branches: `{tab === 'conversations'|'contacts'|'moments'|
// 'notifications' ? (<static body>) : null}` siblings. Each branch must lower to a runtime
// visibility node gated on the `tab` state equality (conditionalStateRef=tab,
// conditionalStateValue=<tab value>), not fold to the initial 'conversations' value and drop the
// other three tabs. The conversations body carries a runtime `conversations.map(...)` list
// (runtime array → the list content is a runtime-data gap), so the branch must still keep its
// tab-gated container node even when the map child cannot be statically enumerated.
function withMessageSubTabBranchesComponent(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") return nextFact;
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      { kind: "element", ordinal: 1025, tagName: "MessageSubTabBranches", props: [], children: [] },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for message sub-tab branches smoke");
  const fn = "csg.function.message-sub-tab-branches";
  const block = "csg.block.message-sub-tab-branches";
  const useStateField = (name, ordinalBase, initId, valueName, setterName) => [
    { kind: "csg.op", id: `csg.op.mstb-${name}-use-state`, function: fn, block, opKind: "call", ordinal: ordinalBase, callee: "useState", argumentCount: 1, arguments: [initId] },
    { kind: "csg.op", id: `csg.op.mstb-${name}-binding`, function: fn, block, opKind: "binding_extract", ordinal: ordinalBase + 1, source: `csg.op.mstb-${name}-use-state`, name: valueName, path: [{ kind: "index", index: 0 }] },
    { kind: "csg.op", id: `csg.op.mstb-${name}-setter`, function: fn, block, opKind: "binding_extract", ordinal: ordinalBase + 2, source: `csg.op.mstb-${name}-use-state`, name: setterName, path: [{ kind: "index", index: 1 }] },
  ];
  nextFacts.push(
    { kind: "csg.op", id: "csg.op.mstb-lit-conversations", function: fn, block, opKind: "literal", ordinal: 1, literalKind: "string", value: "'conversations'" },
    { kind: "csg.op", id: "csg.op.mstb-conv-array-empty", function: fn, block, opKind: "array_literal", ordinal: 2, elementCount: 0, elements: [], spreadFlags: [] },
    ...useStateField("tab", 10, "csg.op.mstb-lit-conversations", "tab", "setTab"),
    ...useStateField("conversations", 20, "csg.op.mstb-conv-array-empty", "conversations", "setConversations"),
    { kind: "csg.web.js_function_ref", id: "csg.web.js_function_ref.message-sub-tab-branches", coreFact: fn, name: "MessageSubTabBranches" },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.message-sub-tab-branches-root",
      coreFact: "csg.jsx.message-sub-tab-branches-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "div",
      attributeCount: 0,
      childCount: 4,
      owner: fn,
      props: [],
      children: [
        { kind: "expression", ordinal: 0, expression: "tab === 'conversations' ? (<div className=\"tab-conv\">{conversations.map((c) => (<div><span>{c.name}</span></div>))}</div>) : null" },
        { kind: "expression", ordinal: 1, expression: "tab === 'contacts' ? (<div className=\"tab-contacts\"><span>联系人</span></div>) : null" },
        { kind: "expression", ordinal: 2, expression: "tab === 'moments' ? (<div className=\"tab-moments\"><span>动态</span></div>) : null" },
        { kind: "expression", ordinal: 3, expression: "tab === 'notifications' ? (<div className=\"tab-notif\"><span>通知</span></div>) : null" },
      ],
    },
  );
  return nextFacts;
}

// ProfilePage on-mount fetchPeerId polling: `peerId = useState('')` plus a
// `setInterval(fetchPeerId, 1000)` call (the polling effect that never gets degraded, leaving
// peerId empty and "定位中…" shown forever). The materializer must detect this pattern and
// synthesize a `profile_peer_id_refresh:peerId` command effect on the profile-tab navigation
// click (the auto-added bottom-nav profile button), degrading the polling to a single
// fetch-on-enter. No template is needed — the detection scans the op graph and the bottom-nav
// profile button is injected by the mobile shell on every bottom-nav route.
function withProfilePeerIdPollingFacts(facts) {
  const fn = "csg.function.profile-peer-id-owner";
  const block = "csg.block.profile-peer-id-owner";
  const nextFacts = [...facts];
  nextFacts.push(
    { kind: "csg.op", id: "csg.op.ppid-lit-empty", function: fn, block, opKind: "literal", ordinal: 0, literalKind: "string", value: "''" },
    { kind: "csg.op", id: "csg.op.ppid-peerid-use-state", function: fn, block, opKind: "call", ordinal: 1, callee: "useState", argumentCount: 1, arguments: ["csg.op.ppid-lit-empty"] },
    { kind: "csg.op", id: "csg.op.ppid-peerid-binding", function: fn, block, opKind: "binding_extract", ordinal: 2, source: "csg.op.ppid-peerid-use-state", name: "peerId", path: [{ kind: "index", index: 0 }] },
    { kind: "csg.op", id: "csg.op.ppid-peerid-setter", function: fn, block, opKind: "binding_extract", ordinal: 3, source: "csg.op.ppid-peerid-use-state", name: "setPeerId", path: [{ kind: "index", index: 1 }] },
    { kind: "csg.op", id: "csg.op.ppid-fetchpeerid", function: fn, block, opKind: "identifier", ordinal: 4, name: "fetchPeerId" },
    { kind: "csg.op", id: "csg.op.ppid-lit-1000", function: fn, block, opKind: "literal", ordinal: 5, literalKind: "number", value: "1000" },
    { kind: "csg.op", id: "csg.op.ppid-setinterval", function: fn, block, opKind: "call", ordinal: 6, callee: "setInterval", argumentCount: 2, arguments: ["csg.op.ppid-fetchpeerid", "csg.op.ppid-lit-1000"] },
  );
  return nextFacts;
}

function withStaticConditionalJsxChild(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "expression",
        ordinal: 999,
        expression: "showNav && (<nav className=\"relative shrink-0 bg-white\"><button className={`flex h-[42px] w-full ${currentTab === 'home' ? 'text-purple-500' : 'text-gray-600'}`}><span>{t.nav_home}</span></button></nav>)",
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for static conditional JSX smoke");
  return nextFacts;
}

function withRegionPolicyConditionalChildren(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "expression",
        ordinal: 1100,
        expression: "isDomestic ? (<span>国内节点</span>) : (<span>境外节点</span>)",
      },
      {
        kind: "expression",
        ordinal: 1101,
        expression: "policyGroupId === 'INTL' && (<span>RWAD</span>)",
      },
      {
        kind: "expression",
        ordinal: 1102,
        expression: "peerId || t.profile_locating",
      },
      {
        kind: "expression",
        ordinal: 1103,
        expression: "rwadSyncing ? t.profile_loading : t.profile_refreshChainBalance",
      },
      {
        kind: "expression",
        ordinal: 1104,
        expression: `!isDomestic && (
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div><span className="text-sm font-medium text-gray-800">RWAD</span></div>
              <span className="text-lg font-semibold text-purple-600">{rwadBalance.toFixed(0)}</span>
            </div>
            <button disabled={rwadSyncing} className="flex-1 py-2 rounded-lg text-sm font-medium border bg-purple-600 text-white border-purple-600">
              {rwadSyncing ? t.profile_loading : t.profile_refreshChainBalance}
            </button>
	            <button onClick={() => { void handleToggleRwadNfcReceive(); }} disabled={rwadNfcReceiveBusy} className={\`w-full py-2 rounded-lg text-sm font-medium border \${rwadNfcReceiveActive ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-700 border-emerald-300'} disabled:opacity-60 disabled:cursor-not-allowed\`}>
              {rwadNfcReceiveActive ? t.profile_rwadNfcReceiveStop : t.profile_rwadNfcReceiveStart}
            </button>
            {showRwadMigrationHint && (
              <p className="text-[11px] text-orange-600 mt-1">{t.profile_rwadMigrationHint}</p>
            )}
          </div>
        )`,
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 5;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for region policy smoke");
  return nextFacts;
}

function withEmptyReactChildExpressions(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "expression",
        ordinal: 1200,
        expression: "didActionHint && (<div className=\"text-xs\">{didActionHint}</div>)",
      },
      {
        kind: "expression",
        ordinal: 1201,
        expression: "rwadSyncHint",
      },
      {
        kind: "expression",
        ordinal: 1202,
        expression: "showDomainTransfer && (<div>Domain registration required</div>)",
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 3;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for empty React child expression smoke");
  nextFacts.push(
    {
      kind: "csg.data",
      id: "csg.data.empty-react-child.did-action-hint",
      dataKind: "static_json_value",
      value: { bindingName: "didActionHint", value: "" },
    },
    {
      kind: "csg.data",
      id: "csg.data.empty-react-child.rwad-sync-hint",
      dataKind: "static_json_value",
      value: { bindingName: "rwadSyncHint", value: "" },
    },
    {
      kind: "csg.data",
      id: "csg.data.empty-react-child.show-domain-transfer",
      dataKind: "static_json_value",
      value: { bindingName: "showDomainTransfer", value: false },
    },
  );
  return nextFacts;
}

function withImportedPublishTypesStaticMapChild(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "expression",
        ordinal: 1000,
        expression: "publishTypes.map(({ type, labelKey, fallbackLabel, icon, from, to, border }) => (<button key={type} onClick={() => onSelect(type)} className={`p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl flex flex-col ${border}`}><div className={`w-12 h-12 bg-gradient-to-br ${from} ${to} rounded-xl`}><img src={`${publishIconBase}/${icon}`} alt=\"\" className=\"h-6 w-6\" /></div><div className=\"text-center\"><div className=\"font-semibold text-gray-800 text-xs\">{t[labelKey] || fallbackLabel}</div></div></button>))",
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for imported publishTypes map smoke");
  nextFacts.push({
    kind: "csg.data",
    id: "csg.data.static-map-smoke.publish-types",
    dataKind: "static_string_object_array",
    value: {
      bindingName: "publishTypes",
      sourceFile: "fixtures/csg-web-materializer-basic/src/metadata.ts",
      items: [
        { type: "content", labelKey: "publish_content", fallbackLabel: "视频", icon: "ic_publish_video.svg", from: "from-purple-500", to: "to-purple-600", border: "hover:border-purple-300" },
        { type: "movie", labelKey: "publish_movie", fallbackLabel: "电影", icon: "ic_publish_movie.svg", from: "from-slate-500", to: "to-slate-700", border: "hover:border-slate-300" },
        { type: "graphic", labelKey: "publish_graphic", fallbackLabel: "图文", icon: "ic_publish_graphic.svg", from: "from-cyan-500", to: "to-teal-600", border: "hover:border-cyan-300" },
      ],
    },
  });
  return nextFacts;
}

function withDerivedHomeChannelsBlockMapChild(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "expression",
        ordinal: 1002,
        expression: "sortedTabKeys.map((key) => { const tab = categoryTabs.find(t => t.key === key); if (!tab) return null; const count = unreadCounts[key] || 0; return (<button key={key} className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm ${activeCategory === key ? 'bg-purple-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}><span>{getTabLabel(tab)}</span>{count > 0 && (<span className={`ml-1 w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full ${activeCategory === key ? 'bg-white text-purple-500' : 'bg-red-500 text-white'}`}>{count > 99 ? '99' : count}</span>)}</button>); })",
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for derived home channels map smoke");
  nextFacts.push({
    kind: "csg.data",
    id: "csg.data.static-map-smoke.home-publish-types",
    dataKind: "static_string_object_array",
    value: {
      bindingName: "publishTypes",
      sourceFile: "fixtures/csg-web-materializer-basic/src/publish/metadata.ts",
      items: [
        { type: "content", labelKey: "publish_content", fallbackLabel: "视频", icon: "ic_publish_video.svg", from: "from-purple-500", to: "to-purple-600", border: "hover:border-purple-300" },
        { type: "graphic", labelKey: "publish_graphic", fallbackLabel: "图文", icon: "ic_publish_graphic.svg", from: "from-cyan-500", to: "to-teal-600", border: "hover:border-cyan-300" },
        { type: "novel", labelKey: "publish_novel", fallbackLabel: "小说", icon: "ic_publish_novel.svg", from: "from-violet-500", to: "to-violet-700", border: "hover:border-violet-300" },
      ],
    },
  });
  return nextFacts;
}

function withPublishContentKindExpressionChildren(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      { kind: "expression", ordinal: 1001, expression: "contentKindLabel" },
      { kind: "expression", ordinal: 1002, expression: "labelForContentPublishKind(contentKind)" },
      { kind: "expression", ordinal: 1003, expression: "fileLabelForContentPublishKind(contentKind)" },
      { kind: "expression", ordinal: 1004, expression: "acceptForContentPublishKind(contentKind)" },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 4;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for publish content kind smoke");
  return nextFacts;
}

function withStaticJoinChild(facts) {
  let added = false;
  let owner = "csg.web.materializer.static-join-owner";
  const sourceFile = "fixtures/csg-web-materializer-basic/src/main.tsx";
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    owner = typeof nextFact.owner === "string" && nextFact.owner.length > 0 ? nextFact.owner : owner;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "expression",
        ordinal: 1001,
        expression: "summaryLines.join('\\n')",
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for static join smoke");
  nextFacts.push(
    { kind: "csg.data", id: "csg.data.static-join.kind", dataKind: "string", value: "kind=static_join" },
    {
      kind: "csg.function",
      id: "csg.function.static-join-callback",
      name: "<anonymous>",
      exported: false,
      async: false,
      generator: false,
      parameters: [],
      returnType: "string[]",
      loc: { file: sourceFile, line: 50, column: 32, start: 5000, end: 5200 },
    },
    {
      kind: "csg.op",
      id: "csg.op.static-join-literal",
      function: "csg.function.static-join-callback",
      block: "csg.block.static-join-callback",
      opKind: "literal",
      literalKind: "string",
      data: "csg.data.static-join.kind",
      ordinal: 0,
      loc: { file: sourceFile, line: 51, column: 5, start: 5010, end: 5028 },
    },
    {
      kind: "csg.op",
      id: "csg.op.static-join-phase-id",
      function: "csg.function.static-join-callback",
      block: "csg.block.static-join-callback",
      opKind: "identifier",
      name: "phase",
      ordinal: 1,
      loc: { file: sourceFile, line: 52, column: 13, start: 5038, end: 5043 },
    },
    {
      kind: "csg.op",
      id: "csg.op.static-join-phase-template",
      function: "csg.function.static-join-callback",
      block: "csg.block.static-join-callback",
      opKind: "template",
      parts: ["phase=", ""],
      spanCount: 1,
      spanOpIds: ["csg.op.static-join-phase-id"],
      ordinal: 2,
      loc: { file: sourceFile, line: 52, column: 5, start: 5030, end: 5045 },
    },
    {
      kind: "csg.op",
      id: "csg.op.static-join-array",
      function: "csg.function.static-join-callback",
      block: "csg.block.static-join-callback",
      opKind: "array_literal",
      elementCount: 2,
      elements: ["csg.op.static-join-literal", "csg.op.static-join-phase-template"],
      ordinal: 3,
      loc: { file: sourceFile, line: 50, column: 38, start: 5006, end: 5190 },
    },
    {
      kind: "csg.op",
      id: "csg.op.static-join-return",
      function: "csg.function.static-join-callback",
      block: "csg.block.static-join-callback",
      opKind: "return",
      value: "csg.op.static-join-array",
      ordinal: 4,
      loc: { file: sourceFile, line: 50, column: 38, start: 5006, end: 5200 },
    },
    {
      kind: "csg.op",
      id: "csg.op.static-join-function-value",
      function: owner,
      block: "csg.block.static-join-owner",
      opKind: "function_value",
      functionKind: "ArrowFunction",
      ordinal: 20,
      loc: { file: sourceFile, line: 50, column: 32, start: 5000, end: 5200 },
    },
    {
      kind: "csg.op",
      id: "csg.op.static-join-deps",
      function: owner,
      block: "csg.block.static-join-owner",
      opKind: "array_literal",
      elementCount: 0,
      elements: [],
      ordinal: 21,
      loc: { file: sourceFile, line: 53, column: 7, start: 5202, end: 5204 },
    },
    {
      kind: "csg.op",
      id: "csg.op.static-join-use-memo",
      function: owner,
      block: "csg.block.static-join-owner",
      opKind: "call",
      callee: "useMemo",
      argumentCount: 2,
      arguments: ["csg.op.static-join-function-value", "csg.op.static-join-deps"],
      returnType: "string[]",
      ordinal: 22,
      loc: { file: sourceFile, line: 50, column: 24, start: 4992, end: 5205 },
    },
    {
      kind: "csg.op",
      id: "csg.op.static-join-local-write",
      function: owner,
      block: "csg.block.static-join-owner",
      opKind: "local_write",
      declarationKind: "const",
      name: "summaryLines",
      typeText: "string[]",
      value: "csg.op.static-join-use-memo",
      ordinal: 23,
      loc: { file: sourceFile, line: 50, column: 9, start: 4977, end: 4990 },
    },
  );
  return nextFacts;
}

function withManyStyledInlineChildren(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || nextFact.kind !== "csg.web.dom_node_template" || nextFact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    const extraChildren = [];
    for (let i = 0; i < 18; i += 1) {
      extraChildren.push({
        kind: "element",
        ordinal: 1000 + i,
        tagName: "div",
        props: [{
          kind: "attribute",
          ordinal: 0,
          name: "className",
          valueKind: "string",
          value: "w-16 px-4 py-4 mb-2 bg-gray-50 rounded-xl text-gray-400",
        }],
        children: [{ kind: "text", ordinal: 0, text: `chunk-${i}` }],
      });
    }
    nextFact.children = [...children, ...extraChildren];
    if (typeof nextFact.childCount === "number") nextFact.childCount += extraChildren.length;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for styled chunk smoke");
  return nextFacts;
}

function withSurrogateTextChild(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || nextFact.kind !== "csg.web.dom_node_template" || nextFact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      { kind: "text", ordinal: 2999, text: "\ud83d test" },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for surrogate text smoke");
  return nextFacts;
}

function withNestedPaddedFullWidthChild(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || nextFact.kind !== "csg.web.dom_node_template" || nextFact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 2000,
        tagName: "div",
        props: [{
          kind: "attribute",
          ordinal: 0,
          name: "className",
          valueKind: "string",
          value: "mx-auto w-full max-w-sm px-4 sm:px-8",
        }],
        children: [{
          kind: "element",
          ordinal: 0,
          tagName: "div",
          props: [{
            kind: "attribute",
            ordinal: 0,
            name: "className",
            valueKind: "string",
            value: "w-full pr-1",
          }],
          children: [{
            kind: "element",
            ordinal: 0,
            tagName: "button",
            props: [{
              kind: "attribute",
              ordinal: 0,
              name: "className",
              valueKind: "string",
              value: "w-full p-4 rounded-xl bg-gray-50",
            }],
            children: [{ kind: "text", ordinal: 0, text: "Nested" }],
          }],
        }],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for nested full-width smoke");
  return nextFacts;
}

function withLucideIconChildren(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || nextFact.kind !== "csg.web.dom_node_template" || nextFact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 998,
        tagName: "div",
        props: [{
          kind: "attribute",
          ordinal: 0,
          name: "className",
          valueKind: "string",
          value: "w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center",
        }],
        children: [{
          kind: "element",
          ordinal: 0,
          tagName: "Globe",
          props: [
            { kind: "attribute", ordinal: 0, name: "size", valueKind: "string", value: "32" },
            { kind: "attribute", ordinal: 1, name: "className", valueKind: "string", value: "text-purple-600" },
          ],
          children: [],
        }, {
          kind: "element",
          ordinal: 1,
          tagName: "Check",
          props: [
            { kind: "attribute", ordinal: 0, name: "size", valueKind: "string", value: "20" },
            { kind: "attribute", ordinal: 1, name: "className", valueKind: "string", value: "text-purple-500" },
          ],
          children: [],
        }, {
          kind: "element",
          ordinal: 2,
          tagName: "Play",
          props: [
            { kind: "attribute", ordinal: 0, name: "size", valueKind: "string", value: "15" },
            { kind: "attribute", ordinal: 1, name: "fill", valueKind: "string", value: "currentColor" },
            { kind: "attribute", ordinal: 2, name: "className", valueKind: "string", value: "text-white fill-current" },
          ],
          children: [],
        }],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for lucide icon smoke");
  return nextFacts;
}

function withAbsoluteFractionalSizeChild(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || nextFact.kind !== "csg.web.dom_node_template" || nextFact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 997,
        tagName: "div",
        props: [{
          kind: "attribute",
          ordinal: 0,
          name: "className",
          valueKind: "string",
          value: "relative w-20 h-20 bg-white",
        }],
        children: [{
          kind: "element",
          ordinal: 0,
          tagName: "div",
          props: [{
            kind: "attribute",
            ordinal: 0,
            name: "className",
            valueKind: "string",
            value: "absolute top-1 right-1 w-1.5 h-1.5 bg-purple-500 rounded-full",
          }],
          children: [],
        }],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for absolute fractional-size smoke");
  return nextFacts;
}

function withPngImageChild(facts, src, loc = undefined, className = "w-16 h-16") {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || nextFact.kind !== "csg.web.dom_node_template" || nextFact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 997,
        tagName: "img",
        ...(loc ? { loc } : {}),
        props: [
          { kind: "attribute", ordinal: 0, name: "src", valueKind: "string", value: src },
          { kind: "attribute", ordinal: 1, name: "alt", valueKind: "string", value: "probe" },
          { kind: "attribute", ordinal: 2, name: "className", valueKind: "string", value: className },
        ],
        children: [],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for PNG image smoke");
  return nextFacts;
}

function withSvgConstImageChild(facts, src) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || nextFact.kind !== "csg.web.dom_node_template" || nextFact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 996,
        tagName: "img",
        props: [
          { kind: "attribute", ordinal: 0, name: "src", valueKind: "expression", expression: "ERROR_IMG_SRC" },
          { kind: "attribute", ordinal: 1, name: "alt", valueKind: "string", value: "svg-probe" },
          { kind: "attribute", ordinal: 2, name: "className", valueKind: "string", value: "w-16 h-16" },
        ],
        children: [],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for SVG image smoke");
  return [
    ...nextFacts,
    {
      kind: "csg.symbol",
      id: "csg.symbol.error-img-src",
      name: "ERROR_IMG_SRC",
      symbolKind: "variable",
      declarationKind: "const",
      type: JSON.stringify(src),
      initializerKind: "StringLiteral",
      exported: false,
    },
  ];
}

function makePngDataUrl(width, height, argbPixels) {
  assert.equal(argbPixels.length, width * height);
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]));
    const row = Buffer.alloc(width * 4);
    for (let x = 0; x < width; x += 1) {
      const argb = argbPixels[y * width + x] >>> 0;
      const offset = x * 4;
      row[offset] = (argb >>> 16) & 0xff;
      row[offset + 1] = (argb >>> 8) & 0xff;
      row[offset + 2] = argb & 0xff;
      row[offset + 3] = (argb >>> 24) & 0xff;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function makeJpegBuffer(width, height, argbPixels) {
  assert.equal(argbPixels.length, width * height);
  const sharp = (await import("sharp")).default;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < argbPixels.length; i += 1) {
    const argb = argbPixels[i] >>> 0;
    const offset = i * 4;
    rgba[offset] = (argb >>> 16) & 0xff;
    rgba[offset + 1] = (argb >>> 8) & 0xff;
    rgba[offset + 2] = argb & 0xff;
    rgba[offset + 3] = (argb >>> 24) & 0xff;
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).jpeg({ quality: 96 }).toBuffer();
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(0, 8 + data.length);
  return out;
}

function withComponentSlotChild(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 1002,
        tagName: "SlotButton",
        props: [
          { kind: "attribute", ordinal: 0, name: "className", valueKind: "string", value: "bg-blue-500 text-white" },
        ],
        children: [
          { kind: "text", ordinal: 0, text: "Forwarded" },
        ],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for component slot smoke");
  nextFacts.push(
    {
      kind: "csg.web.js_function_ref",
      id: "csg.web.js_function_ref.slot-button",
      coreFact: "csg.function.slot-button",
      name: "SlotButton",
      loc: { file: "fixtures/csg-web-materializer-basic/src/SlotButton.tsx", line: 1, column: 1, start: 1, end: 20 },
    },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.slot-button-root",
      coreFact: "csg.jsx.slot-button-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "Comp",
      attributeCount: 2,
      childCount: 1,
      owner: "csg.function.slot-button",
      props: [
        { kind: "attribute", ordinal: 0, name: "data-slot", valueKind: "string", value: "button" },
        { kind: "spread", ordinal: 1, expression: "props" },
      ],
      children: [
        { kind: "expression", ordinal: 0, expression: "children" },
      ],
      loc: { file: "fixtures/csg-web-materializer-basic/src/SlotButton.tsx", line: 2, column: 3, start: 21, end: 80 },
    },
  );
  return nextFacts;
}

function withForwardedHandlerFnComponent(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 1003,
        tagName: "ForwardedHandlerPanel",
        props: [
          {
            kind: "attribute",
            ordinal: 0,
            name: "onRefresh",
            valueKind: "expression",
            value: "() => { void refreshSelectedNodeContents(selectedNodeContentOwner.peerId, true); }",
            expression: "() => { void refreshSelectedNodeContents(selectedNodeContentOwner.peerId, true); }",
            handlerFn: "csg.function.forwarded-refresh-handler",
          },
        ],
        children: [],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for forwarded handler smoke");
  nextFacts.push(
    {
      kind: "csg.web.js_function_ref",
      id: "csg.web.js_function_ref.forwarded-handler-panel",
      coreFact: "csg.function.forwarded-handler-panel",
      name: "ForwardedHandlerPanel",
    },
    {
      kind: "csg.binding",
      id: "csg.binding.forwarded-handler-panel.on-refresh",
      owner: "csg.function.forwarded-handler-panel",
      declarationKind: "parameter",
      name: "onRefresh",
      path: [{ kind: "property", name: "onRefresh" }],
      type: "() => void",
    },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.forwarded-handler-panel-root",
      coreFact: "csg.jsx.forwarded-handler-panel-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "RefreshButton",
      attributeCount: 1,
      childCount: 0,
      owner: "csg.function.forwarded-handler-panel",
      props: [
        {
          kind: "attribute",
          ordinal: 0,
          name: "onRefresh",
          valueKind: "expression",
          value: "onRefresh",
          expression: "onRefresh",
        },
      ],
      children: [],
    },
    {
      kind: "csg.web.js_function_ref",
      id: "csg.web.js_function_ref.refresh-button",
      coreFact: "csg.function.refresh-button",
      name: "RefreshButton",
    },
    {
      kind: "csg.binding",
      id: "csg.binding.refresh-button.on-refresh",
      owner: "csg.function.refresh-button",
      declarationKind: "parameter",
      name: "onRefresh",
      path: [{ kind: "property", name: "onRefresh" }],
      type: "() => void",
    },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.refresh-button-root",
      coreFact: "csg.jsx.refresh-button-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "button",
      attributeCount: 1,
      childCount: 1,
      owner: "csg.function.refresh-button",
      props: [
        {
          kind: "attribute",
          ordinal: 0,
          name: "onClick",
          valueKind: "expression",
          value: "onRefresh",
          expression: "onRefresh",
        },
      ],
      children: [
        { kind: "text", ordinal: 0, text: "Refresh" },
      ],
    },
    {
      kind: "csg.function",
      id: "csg.function.forwarded-refresh-handler",
      name: "__forwarded_refresh_handler",
    },
  );
  return nextFacts;
}

// A publish component whose button folds `disabled={!canPublish || isPublishing}` to a static
// true at build time (empty form). The materializer must keep the handler, front it with a
// guard_state chain reproducing canPublish's conjunction, and suppress the native disabled prop.
function withPublishGuardPanelComponent(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") return nextFact;
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      { kind: "element", ordinal: 1007, tagName: "PublishGuardPanel", props: [], children: [] },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for publish guard smoke");
  const fn = "csg.function.publish-guard-panel";
  const block = "csg.block.publish-guard-panel";
  const useStateField = (name, ordinalBase, initId, valueName, setterName) => [
    { kind: "csg.op", id: `csg.op.pg-${name}-use-state`, function: fn, block, opKind: "call", ordinal: ordinalBase, callee: "useState", argumentCount: 1, arguments: [initId] },
    { kind: "csg.op", id: `csg.op.pg-${name}-binding`, function: fn, block, opKind: "binding_extract", ordinal: ordinalBase + 1, source: `csg.op.pg-${name}-use-state`, name: valueName, path: [{ kind: "index", index: 0 }] },
    { kind: "csg.op", id: `csg.op.pg-${name}-setter`, function: fn, block, opKind: "binding_extract", ordinal: ordinalBase + 2, source: `csg.op.pg-${name}-use-state`, name: setterName, path: [{ kind: "index", index: 1 }] },
  ];
  nextFacts.push(
    { kind: "csg.data", id: "csg.data.pg-empty", dataKind: "static_json_value", value: { bindingName: "pgEmpty", sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx", value: "" } },
    { kind: "csg.op", id: "csg.op.pg-empty-literal", function: fn, block, opKind: "literal", ordinal: 0, literalKind: "string", data: "csg.data.pg-empty" },
    ...useStateField("title", 10, "csg.op.pg-empty-literal", "title", "setTitle"),
    ...useStateField("description", 20, "csg.op.pg-empty-literal", "description", "setDescription"),
    ...useStateField("is-publishing", 30, "csg.op.pg-empty-literal", "isPublishing", "setIsPublishing"),
    // canPublish = title && description
    { kind: "csg.op", id: "csg.op.pg-title-id", function: fn, block, opKind: "identifier", ordinal: 40, name: "title" },
    { kind: "csg.op", id: "csg.op.pg-description-id", function: fn, block, opKind: "identifier", ordinal: 41, name: "description" },
    { kind: "csg.op", id: "csg.op.pg-canpublish-and", function: fn, block, opKind: "binary", ordinal: 42, left: "csg.op.pg-title-id", right: "csg.op.pg-description-id", operator: "AmpersandAmpersandToken" },
    { kind: "csg.op", id: "csg.op.pg-canpublish-write", function: fn, block, opKind: "local_write", ordinal: 43, name: "canPublish", declarationKind: "const", value: "csg.op.pg-canpublish-and" },
    { kind: "csg.web.js_function_ref", id: "csg.web.js_function_ref.publish-guard-panel", coreFact: fn, name: "PublishGuardPanel" },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.publish-guard-panel-root",
      coreFact: "csg.jsx.publish-guard-panel-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "button",
      attributeCount: 3,
      childCount: 1,
      owner: fn,
      props: [
        { kind: "attribute", ordinal: 0, name: "onClick", valueKind: "expression", value: "handlePublish", expression: "handlePublish" },
        { kind: "attribute", ordinal: 1, name: "disabled", valueKind: "expression", value: "!canPublish || isPublishing", expression: "!canPublish || isPublishing" },
        // A compound ternary — canPublish is itself a derived local const, not a bare
        // dynamicStateRef — that must lower to the SAME title/description/isPublishing
        // conjunction the guard chain above resolves, not silently drop the css_variant_rule.
        { kind: "attribute", ordinal: 2, name: "className", valueKind: "expression", value: "px-5 py-2 rounded-full bg-gray-200 text-gray-400", expression: "`px-5 py-2 rounded-full ${canPublish && !isPublishing ? 'bg-purple-500 text-white' : 'bg-gray-200 text-gray-400'}`" },
      ],
      children: [{ kind: "text", ordinal: 0, text: "发布" }],
    },
  );
  return nextFacts;
}

// A publish component whose canPublish requires a media *array* to be non-empty via a
// `hasRequiredMedia = mediaFiles.some(...)` derived-const (mirrors PublishVideoPage). mediaFiles
// stores a JSON-array string, and an empty array "[]" is a truthy *string*, so the media conjunct
// must lower to guard_state:mediaFiles=__array_nonempty rather than =__truthy — otherwise the
// publish button would unlock with no media selected.
function withPublishMediaGuardPanelComponent(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") return nextFact;
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      { kind: "element", ordinal: 1017, tagName: "PublishMediaGuardPanel", props: [], children: [] },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for publish media guard smoke");
  const fn = "csg.function.publish-media-guard-panel";
  const block = "csg.block.publish-media-guard-panel";
  const useStateField = (name, ordinalBase, initId, valueName, setterName) => [
    { kind: "csg.op", id: `csg.op.pmg-${name}-use-state`, function: fn, block, opKind: "call", ordinal: ordinalBase, callee: "useState", argumentCount: 1, arguments: [initId] },
    { kind: "csg.op", id: `csg.op.pmg-${name}-binding`, function: fn, block, opKind: "binding_extract", ordinal: ordinalBase + 1, source: `csg.op.pmg-${name}-use-state`, name: valueName, path: [{ kind: "index", index: 0 }] },
    { kind: "csg.op", id: `csg.op.pmg-${name}-setter`, function: fn, block, opKind: "binding_extract", ordinal: ordinalBase + 2, source: `csg.op.pmg-${name}-use-state`, name: setterName, path: [{ kind: "index", index: 1 }] },
  ];
  nextFacts.push(
    { kind: "csg.data", id: "csg.data.pmg-empty", dataKind: "static_json_value", value: { bindingName: "pmgEmpty", sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx", value: "" } },
    { kind: "csg.op", id: "csg.op.pmg-empty-literal", function: fn, block, opKind: "literal", ordinal: 0, literalKind: "string", data: "csg.data.pmg-empty" },
    ...useStateField("title", 10, "csg.op.pmg-empty-literal", "title", "setTitle"),
    ...useStateField("media-files", 20, "csg.op.pmg-empty-literal", "mediaFiles", "setMediaFiles"),
    ...useStateField("is-publishing", 30, "csg.op.pmg-empty-literal", "isPublishing", "setIsPublishing"),
    ...useStateField("publish-notice", 35, "csg.op.pmg-empty-literal", "publishNoticeOpen", "setPublishNoticeOpen"),
    ...useStateField("is-preparing-media", 38, "csg.op.pmg-empty-literal", "isPreparingMedia", "setIsPreparingMedia"),
    // hasRequiredMedia = mediaFiles.some((file) => getMediaType(file) === 'video')
    { kind: "csg.op", id: "csg.op.pmg-mediafiles-id", function: fn, block, opKind: "identifier", ordinal: 40, name: "mediaFiles" },
    { kind: "csg.op", id: "csg.op.pmg-media-callback", function: fn, block, opKind: "identifier", ordinal: 41, name: "getMediaType" },
    { kind: "csg.op", id: "csg.op.pmg-media-some", function: fn, block, opKind: "call", ordinal: 42, memberName: "some", receiver: "csg.op.pmg-mediafiles-id", argumentCount: 1, arguments: ["csg.op.pmg-media-callback"] },
    { kind: "csg.op", id: "csg.op.pmg-hasmedia-write", function: fn, block, opKind: "local_write", ordinal: 43, name: "hasRequiredMedia", declarationKind: "const", value: "csg.op.pmg-media-some" },
    // canPublish = title && hasRequiredMedia && publishNoticeOpen
    { kind: "csg.op", id: "csg.op.pmg-title-id", function: fn, block, opKind: "identifier", ordinal: 44, name: "title" },
    { kind: "csg.op", id: "csg.op.pmg-hasmedia-id", function: fn, block, opKind: "identifier", ordinal: 45, name: "hasRequiredMedia" },
    { kind: "csg.op", id: "csg.op.pmg-notice-id", function: fn, block, opKind: "identifier", ordinal: 46, name: "publishNoticeOpen" },
    { kind: "csg.op", id: "csg.op.pmg-canpublish-media-and", function: fn, block, opKind: "binary", ordinal: 47, left: "csg.op.pmg-title-id", right: "csg.op.pmg-hasmedia-id", operator: "AmpersandAmpersandToken" },
    { kind: "csg.op", id: "csg.op.pmg-canpublish-and", function: fn, block, opKind: "binary", ordinal: 48, left: "csg.op.pmg-canpublish-media-and", right: "csg.op.pmg-notice-id", operator: "AmpersandAmpersandToken" },
    { kind: "csg.op", id: "csg.op.pmg-canpublish-write", function: fn, block, opKind: "local_write", ordinal: 49, name: "canPublish", declarationKind: "const", value: "csg.op.pmg-canpublish-and" },
    { kind: "csg.web.js_function_ref", id: "csg.web.js_function_ref.publish-media-guard-panel", coreFact: fn, name: "PublishMediaGuardPanel" },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.publish-media-guard-panel-root",
      coreFact: "csg.jsx.publish-media-guard-panel-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "button",
      attributeCount: 3,
      childCount: 1,
      owner: fn,
      props: [
        { kind: "attribute", ordinal: 0, name: "onClick", valueKind: "expression", value: "handlePublish", expression: "handlePublish" },
        { kind: "attribute", ordinal: 1, name: "disabled", valueKind: "expression", value: "!canPublish || isPublishing || isPreparingMedia", expression: "!canPublish || isPublishing || isPreparingMedia" },
        { kind: "attribute", ordinal: 2, name: "className", valueKind: "string", value: "px-5 py-2 rounded-full" },
      ],
      children: [{ kind: "text", ordinal: 0, text: "发布" }],
    },
  );
  return nextFacts;
}

// A publish_product component whose canPublish is a mode-conditional ternary
// (`mode === 'csv' ? csvText.length>0 && csvPreview!==null : title.trim().length>0 &&
// Number.isFinite(Number.parseFloat(price)) && Number.parseFloat(price) > 0`) and whose button
// folds `disabled={!canPublish || isPublishing}` to a static true. The materializer must lower
// the ternary to a single `guard_any` segment with the csv/manual mode groups, collapse the
// isFinite+parseFloat>0 conjunct to `__num_positive`, resolve the manual complement from the
// setMode('csv')/setMode('manual') calls, and keep isPublishing as a separate guard_state segment.
function withPublishProductModeGuardPanelComponent(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") return nextFact;
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      { kind: "element", ordinal: 1024, tagName: "PublishProductModeGuardPanel", props: [], children: [] },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for publish product mode guard smoke");
  const fn = "csg.function.publish-product-mode-guard-panel";
  const block = "csg.block.publish-product-mode-guard-panel";
  const useStateField = (name, ordinalBase, initId, valueName, setterName) => [
    { kind: "csg.op", id: `csg.op.ppmode-${name}-use-state`, function: fn, block, opKind: "call", ordinal: ordinalBase, callee: "useState", argumentCount: 1, arguments: [initId] },
    { kind: "csg.op", id: `csg.op.ppmode-${name}-binding`, function: fn, block, opKind: "binding_extract", ordinal: ordinalBase + 1, source: `csg.op.ppmode-${name}-use-state`, name: valueName, path: [{ kind: "index", index: 0 }] },
    { kind: "csg.op", id: `csg.op.ppmode-${name}-setter`, function: fn, block, opKind: "binding_extract", ordinal: ordinalBase + 2, source: `csg.op.ppmode-${name}-use-state`, name: setterName, path: [{ kind: "index", index: 1 }] },
  ];
  nextFacts.push(
    { kind: "csg.op", id: "csg.op.ppmode-lit-csv", function: fn, block, opKind: "literal", ordinal: 1, literalKind: "string", value: "'csv'" },
    { kind: "csg.op", id: "csg.op.ppmode-lit-empty", function: fn, block, opKind: "literal", ordinal: 2, literalKind: "string", value: "''" },
    { kind: "csg.op", id: "csg.op.ppmode-lit-null", function: fn, block, opKind: "literal", ordinal: 3, literalKind: "keyword", value: "null" },
    { kind: "csg.op", id: "csg.op.ppmode-lit-false", function: fn, block, opKind: "literal", ordinal: 4, literalKind: "boolean", value: "false" },
    { kind: "csg.op", id: "csg.op.ppmode-lit-zero", function: fn, block, opKind: "literal", ordinal: 5, literalKind: "number", value: "0" },
    { kind: "csg.op", id: "csg.op.ppmode-lit-manual", function: fn, block, opKind: "literal", ordinal: 6, literalKind: "string", value: "'manual'" },
    ...useStateField("mode", 10, "csg.op.ppmode-lit-csv", "mode", "setMode"),
    ...useStateField("csvtext", 20, "csg.op.ppmode-lit-empty", "csvText", "setCsvText"),
    ...useStateField("csvpreview", 30, "csg.op.ppmode-lit-null", "csvPreview", "setCsvPreview"),
    ...useStateField("title", 40, "csg.op.ppmode-lit-empty", "title", "setTitle"),
    ...useStateField("price", 50, "csg.op.ppmode-lit-empty", "price", "setPrice"),
    ...useStateField("ispublishing", 60, "csg.op.ppmode-lit-false", "isPublishing", "setIsPublishing"),
    { kind: "csg.op", id: "csg.op.ppmode-setmode-csv", function: fn, block, opKind: "call", ordinal: 70, callee: "setMode", argumentCount: 1, arguments: ["csg.op.ppmode-lit-csv"] },
    { kind: "csg.op", id: "csg.op.ppmode-setmode-manual", function: fn, block, opKind: "call", ordinal: 71, callee: "setMode", argumentCount: 1, arguments: ["csg.op.ppmode-lit-manual"] },
    { kind: "csg.op", id: "csg.op.ppmode-id-mode", function: fn, block, opKind: "identifier", ordinal: 80, name: "mode" },
    { kind: "csg.op", id: "csg.op.ppmode-id-csvtext", function: fn, block, opKind: "identifier", ordinal: 81, name: "csvText" },
    { kind: "csg.op", id: "csg.op.ppmode-id-csvpreview", function: fn, block, opKind: "identifier", ordinal: 82, name: "csvPreview" },
    { kind: "csg.op", id: "csg.op.ppmode-id-title", function: fn, block, opKind: "identifier", ordinal: 83, name: "title" },
    { kind: "csg.op", id: "csg.op.ppmode-id-price", function: fn, block, opKind: "identifier", ordinal: 84, name: "price" },
    { kind: "csg.op", id: "csg.op.ppmode-id-number", function: fn, block, opKind: "identifier", ordinal: 85, name: "Number" },
    { kind: "csg.op", id: "csg.op.ppmode-csvtext-length", function: fn, block, opKind: "property_read", ordinal: 90, name: "length", receiver: "csg.op.ppmode-id-csvtext" },
    { kind: "csg.op", id: "csg.op.ppmode-csvtext-gt", function: fn, block, opKind: "binary", ordinal: 91, left: "csg.op.ppmode-csvtext-length", right: "csg.op.ppmode-lit-zero", operator: "GreaterThanToken" },
    { kind: "csg.op", id: "csg.op.ppmode-csvpreview-ne-null", function: fn, block, opKind: "binary", ordinal: 92, left: "csg.op.ppmode-id-csvpreview", right: "csg.op.ppmode-lit-null", operator: "ExclamationEqualsEqualsToken" },
    { kind: "csg.op", id: "csg.op.ppmode-csv-branch-and", function: fn, block, opKind: "binary", ordinal: 93, left: "csg.op.ppmode-csvtext-gt", right: "csg.op.ppmode-csvpreview-ne-null", operator: "AmpersandAmpersandToken" },
    { kind: "csg.op", id: "csg.op.ppmode-title-trim", function: fn, block, opKind: "call", ordinal: 100, memberName: "trim", receiver: "csg.op.ppmode-id-title", argumentCount: 0, arguments: [] },
    { kind: "csg.op", id: "csg.op.ppmode-title-trim-length", function: fn, block, opKind: "property_read", ordinal: 101, name: "length", receiver: "csg.op.ppmode-title-trim" },
    { kind: "csg.op", id: "csg.op.ppmode-title-gt", function: fn, block, opKind: "binary", ordinal: 102, left: "csg.op.ppmode-title-trim-length", right: "csg.op.ppmode-lit-zero", operator: "GreaterThanToken" },
    { kind: "csg.op", id: "csg.op.ppmode-parsefloat-price", function: fn, block, opKind: "call", ordinal: 110, memberName: "parseFloat", receiver: "csg.op.ppmode-id-number", argumentCount: 1, arguments: ["csg.op.ppmode-id-price"] },
    { kind: "csg.op", id: "csg.op.ppmode-isfinite-price", function: fn, block, opKind: "call", ordinal: 111, memberName: "isFinite", receiver: "csg.op.ppmode-id-number", argumentCount: 1, arguments: ["csg.op.ppmode-parsefloat-price"] },
    { kind: "csg.op", id: "csg.op.ppmode-price-gt", function: fn, block, opKind: "binary", ordinal: 112, left: "csg.op.ppmode-parsefloat-price", right: "csg.op.ppmode-lit-zero", operator: "GreaterThanToken" },
    { kind: "csg.op", id: "csg.op.ppmode-manual-inner-and", function: fn, block, opKind: "binary", ordinal: 113, left: "csg.op.ppmode-title-gt", right: "csg.op.ppmode-isfinite-price", operator: "AmpersandAmpersandToken" },
    { kind: "csg.op", id: "csg.op.ppmode-manual-outer-and", function: fn, block, opKind: "binary", ordinal: 114, left: "csg.op.ppmode-manual-inner-and", right: "csg.op.ppmode-price-gt", operator: "AmpersandAmpersandToken" },
    { kind: "csg.op", id: "csg.op.ppmode-mode-eq-csv", function: fn, block, opKind: "binary", ordinal: 120, left: "csg.op.ppmode-id-mode", right: "csg.op.ppmode-lit-csv", operator: "EqualsEqualsEqualsToken" },
    { kind: "csg.op", id: "csg.op.ppmode-canpublish-conditional", function: fn, block, opKind: "expression", ordinal: 121, expressionKind: "ConditionalExpression", condition: "csg.op.ppmode-mode-eq-csv", whenTrue: "csg.op.ppmode-csv-branch-and", whenFalse: "csg.op.ppmode-manual-outer-and" },
    { kind: "csg.op", id: "csg.op.ppmode-canpublish-write", function: fn, block, opKind: "local_write", ordinal: 122, name: "canPublish", declarationKind: "const", value: "csg.op.ppmode-canpublish-conditional" },
    { kind: "csg.web.js_function_ref", id: "csg.web.js_function_ref.publish-product-mode-guard-panel", coreFact: fn, name: "PublishProductModeGuardPanel" },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.publish-product-mode-guard-panel-root",
      coreFact: "csg.jsx.publish-product-mode-guard-panel-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "button",
      attributeCount: 3,
      childCount: 1,
      owner: fn,
      props: [
        { kind: "attribute", ordinal: 0, name: "onClick", valueKind: "expression", value: "handlePublish", expression: "handlePublish" },
        { kind: "attribute", ordinal: 1, name: "disabled", valueKind: "expression", value: "!canPublish || isPublishing", expression: "!canPublish || isPublishing" },
        { kind: "attribute", ordinal: 2, name: "className", valueKind: "string", value: "px-5 py-2 rounded-full" },
      ],
      children: [{ kind: "text", ordinal: 0, text: "发布" }],
    },
  );
  return nextFacts;
}

function withPublishLiveStartGuardPanelComponent(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") return nextFact;
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      { kind: "element", ordinal: 1027, tagName: "PublishLiveStartGuardPanel", props: [], children: [] },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for publish live start guard smoke");
  const fn = "csg.function.publish-live-start-guard-panel";
  const block = "csg.block.publish-live-start-guard-panel";
  const useStateField = (name, ordinalBase, initId, valueName, setterName) => [
    { kind: "csg.op", id: `csg.op.plg-${name}-use-state`, function: fn, block, opKind: "call", ordinal: ordinalBase, callee: "useState", argumentCount: 1, arguments: [initId] },
    { kind: "csg.op", id: `csg.op.plg-${name}-binding`, function: fn, block, opKind: "binding_extract", ordinal: ordinalBase + 1, source: `csg.op.plg-${name}-use-state`, name: valueName, path: [{ kind: "index", index: 0 }] },
    { kind: "csg.op", id: `csg.op.plg-${name}-setter`, function: fn, block, opKind: "binding_extract", ordinal: ordinalBase + 2, source: `csg.op.plg-${name}-use-state`, name: setterName, path: [{ kind: "index", index: 1 }] },
  ];
  nextFacts.push(
    { kind: "csg.data", id: "csg.data.plg-empty", dataKind: "static_json_value", value: { bindingName: "plgEmpty", sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx", value: "" } },
    { kind: "csg.op", id: "csg.op.plg-empty-literal", function: fn, block, opKind: "literal", ordinal: 0, literalKind: "string", data: "csg.data.plg-empty" },
    ...useStateField("title", 10, "csg.op.plg-empty-literal", "title", "setTitle"),
    ...useStateField("is-starting", 20, "csg.op.plg-empty-literal", "isStarting", "setIsStarting"),
    { kind: "csg.web.js_function_ref", id: "csg.web.js_function_ref.publish-live-start-guard-panel", coreFact: fn, name: "PublishLiveStartGuardPanel" },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.publish-live-start-guard-panel-root",
      coreFact: "csg.jsx.publish-live-start-guard-panel-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "button",
      attributeCount: 3,
      childCount: 1,
      owner: fn,
      props: [
        { kind: "attribute", ordinal: 0, name: "onClick", valueKind: "expression", value: "handleStartLive", expression: "handleStartLive" },
        { kind: "attribute", ordinal: 1, name: "disabled", valueKind: "expression", value: "!title.trim() || isStarting", expression: "!title.trim() || isStarting" },
        { kind: "attribute", ordinal: 2, name: "className", valueKind: "string", value: "w-full py-4 rounded-full" },
      ],
      children: [{ kind: "text", ordinal: 0, text: "开始直播" }],
    },
  );
  return nextFacts;
}

function withOwnerLocalHelperChangeComponent(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 1004,
        tagName: "OwnerHelperPanel",
        props: [],
        children: [],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for owner helper smoke");
  nextFacts.push(
    {
      kind: "csg.web.js_function_ref",
      id: "csg.web.js_function_ref.owner-helper-panel",
      coreFact: "csg.function.owner-helper-panel",
      name: "OwnerHelperPanel",
    },
    {
      kind: "csg.op",
      id: "csg.op.owner-helper-panel.helper-value",
      function: "csg.function.owner-helper-panel",
      block: "csg.block.owner-helper-panel.root",
      opKind: "function_value",
      ordinal: 0,
      functionKind: "ArrowFunction",
      targetFunction: "csg.function.owner-helper-change",
    },
    {
      kind: "csg.op",
      id: "csg.op.owner-helper-panel.helper-write",
      function: "csg.function.owner-helper-panel",
      block: "csg.block.owner-helper-panel.root",
      opKind: "local_write",
      ordinal: 1,
      name: "handleFileChange",
      value: "csg.op.owner-helper-panel.helper-value",
    },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.owner-helper-panel-root",
      coreFact: "csg.jsx.owner-helper-panel-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "input",
      attributeCount: 3,
      childCount: 0,
      owner: "csg.function.owner-helper-panel",
      props: [
        { kind: "attribute", ordinal: 0, name: "type", valueKind: "string", value: "file" },
        { kind: "attribute", ordinal: 1, name: "accept", valueKind: "string", value: "image/*" },
        {
          kind: "attribute",
          ordinal: 2,
          name: "onChange",
          valueKind: "expression",
          value: "(event) => { void handleFileChange(event); }",
          expression: "(event) => { void handleFileChange(event); }",
        },
      ],
      children: [],
    },
    {
      kind: "csg.function",
      id: "csg.function.owner-helper-change",
      name: "<anonymous>",
      owner: "csg.function.owner-helper-panel",
      parameters: [{ index: 0, name: "event", optional: false, rest: false, typeSource: "ChangeEvent<HTMLInputElement>" }],
      returnType: "Promise<void>",
      async: true,
      generator: false,
      exported: false,
    },
  );
  return nextFacts;
}

function withNumericCastInputHelperComponent(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 1004,
        tagName: "NumericCastInputPanel",
        props: [],
        children: [],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for numeric cast input smoke");
  nextFacts.push(
    {
      kind: "csg.web.js_function_ref",
      id: "csg.web.js_function_ref.numeric-cast-input-panel",
      coreFact: "csg.function.numeric-cast-input-panel",
      name: "NumericCastInputPanel",
    },
    {
      kind: "csg.data",
      id: "csg.data.numeric-cast-year",
      dataKind: "static_json_value",
      value: 1990,
    },
    {
      kind: "csg.op",
      id: "csg.op.numeric-cast-year-literal",
      function: "csg.function.numeric-cast-input-panel",
      block: "csg.block.numeric-cast-input-panel.root",
      opKind: "literal",
      ordinal: 0,
      literalKind: "number",
      data: "csg.data.numeric-cast-year",
    },
    {
      kind: "csg.op",
      id: "csg.op.numeric-cast-year-use-state",
      function: "csg.function.numeric-cast-input-panel",
      block: "csg.block.numeric-cast-input-panel.root",
      opKind: "call",
      ordinal: 1,
      callee: "useState",
      argumentCount: 1,
      arguments: ["csg.op.numeric-cast-year-literal"],
    },
    {
      kind: "csg.op",
      id: "csg.op.numeric-cast-year-binding",
      function: "csg.function.numeric-cast-input-panel",
      block: "csg.block.numeric-cast-input-panel.root",
      opKind: "binding_extract",
      ordinal: 2,
      source: "csg.op.numeric-cast-year-use-state",
      name: "year",
      path: [{ kind: "index", index: 0 }],
    },
    {
      kind: "csg.op",
      id: "csg.op.numeric-cast-year-setter-binding",
      function: "csg.function.numeric-cast-input-panel",
      block: "csg.block.numeric-cast-input-panel.root",
      opKind: "binding_extract",
      ordinal: 3,
      source: "csg.op.numeric-cast-year-use-state",
      name: "setYear",
      path: [{ kind: "index", index: 1 }],
    },
    {
      kind: "csg.op",
      id: "csg.op.numeric-cast-helper-value",
      function: "csg.function.numeric-cast-input-panel",
      block: "csg.block.numeric-cast-input-panel.root",
      opKind: "function_value",
      ordinal: 4,
      functionKind: "ArrowFunction",
      targetFunction: "csg.function.numeric-cast-year-change",
    },
    {
      kind: "csg.op",
      id: "csg.op.numeric-cast-helper-write",
      function: "csg.function.numeric-cast-input-panel",
      block: "csg.block.numeric-cast-input-panel.root",
      opKind: "local_write",
      ordinal: 5,
      name: "handleYearChange",
      value: "csg.op.numeric-cast-helper-value",
    },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.numeric-cast-input-root",
      coreFact: "csg.jsx.numeric-cast-input-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "input",
      attributeCount: 3,
      childCount: 0,
      owner: "csg.function.numeric-cast-input-panel",
      props: [
        { kind: "attribute", ordinal: 0, name: "type", valueKind: "string", value: "number" },
        { kind: "attribute", ordinal: 1, name: "value", valueKind: "expression", value: "year", expression: "year" },
        {
          kind: "attribute",
          ordinal: 2,
          name: "onChange",
          valueKind: "expression",
          value: "(event) => { void handleYearChange(event); }",
          expression: "(event) => { void handleYearChange(event); }",
        },
      ],
      children: [],
    },
    {
      kind: "csg.function",
      id: "csg.function.numeric-cast-year-change",
      name: "<anonymous>",
      owner: "csg.function.numeric-cast-input-panel",
      parameters: [{ index: 0, name: "event", optional: false, rest: false, typeSource: "ChangeEvent<HTMLInputElement>" }],
      returnType: "void",
      async: false,
      generator: false,
      exported: false,
    },
    {
      kind: "csg.op",
      id: "csg.op.numeric-cast-event",
      function: "csg.function.numeric-cast-year-change",
      block: "csg.block.numeric-cast-year-change.root",
      opKind: "identifier",
      ordinal: 0,
      name: "event",
    },
    {
      kind: "csg.op",
      id: "csg.op.numeric-cast-target",
      function: "csg.function.numeric-cast-year-change",
      block: "csg.block.numeric-cast-year-change.root",
      opKind: "property_read",
      ordinal: 1,
      receiver: "csg.op.numeric-cast-event",
      name: "target",
    },
    {
      kind: "csg.op",
      id: "csg.op.numeric-cast-value",
      function: "csg.function.numeric-cast-year-change",
      block: "csg.block.numeric-cast-year-change.root",
      opKind: "property_read",
      ordinal: 2,
      receiver: "csg.op.numeric-cast-target",
      name: "value",
    },
    {
      kind: "csg.op",
      id: "csg.op.numeric-cast-number",
      function: "csg.function.numeric-cast-year-change",
      block: "csg.block.numeric-cast-year-change.root",
      opKind: "call",
      ordinal: 3,
      callee: "Number",
      argumentCount: 1,
      arguments: ["csg.op.numeric-cast-value"],
    },
    {
      kind: "csg.op",
      id: "csg.op.numeric-cast-set-year",
      function: "csg.function.numeric-cast-year-change",
      block: "csg.block.numeric-cast-year-change.root",
      opKind: "call",
      ordinal: 4,
      callee: "setYear",
      argumentCount: 1,
      arguments: ["csg.op.numeric-cast-number"],
    },
  );
  return nextFacts;
}

function withConditionalReturnComponent(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 1003,
        tagName: "ConditionalPanel",
        props: [],
        children: [],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for conditional return smoke");
  nextFacts.push(
    {
      kind: "csg.web.js_function_ref",
      id: "csg.web.js_function_ref.conditional-panel",
      coreFact: "csg.function.conditional-panel",
      name: "ConditionalPanel",
    },
    {
      kind: "csg.binding",
      id: "csg.binding.conditional-panel.mode",
      owner: "csg.function.conditional-panel",
      declarationKind: "parameter",
      name: "mode",
      path: [{ kind: "property", name: "mode" }],
      defaultInitializer: "\"mobile\"",
    },
    { kind: "csg.data", id: "csg.data.conditional-panel.none", dataKind: "string", value: "none" },
    { kind: "csg.data", id: "csg.data.conditional-panel.mobile", dataKind: "string", value: "mobile" },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.none-literal",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "literal",
      literalKind: "string",
      data: "csg.data.conditional-panel.none",
      ordinal: 0,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.mode-id",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "identifier",
      name: "mode",
      ordinal: 1,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.mode-eq-none",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "binary",
      operator: "EqualsEqualsEqualsToken",
      left: "csg.op.conditional-panel.mode-id",
      right: "csg.op.conditional-panel.none-literal",
      ordinal: 2,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.none-jsx",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.none-body",
      opKind: "jsx",
      tagName: "div",
      ordinal: 3,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.none-return",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.none-body",
      opKind: "return",
      value: "csg.op.conditional-panel.none-jsx",
      ordinal: 4,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.none-block",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.none-wrapper",
      opKind: "block",
      nestedBlock: "csg.block.conditional-panel.none-body",
      ordinal: 5,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.none-branch",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "branch_if",
      condition: "csg.op.conditional-panel.mode-eq-none",
      thenBlock: "csg.block.conditional-panel.none-wrapper",
      ordinal: 6,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.is-mobile-id",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "identifier",
      name: "isMobile",
      ordinal: 7,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.primary-local-write",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "local_write",
      declarationKind: "const",
      name: "primaryMobile",
      value: "csg.op.conditional-panel.is-mobile-id",
      ordinal: 8,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.mode-mobile-id",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "identifier",
      name: "mode",
      ordinal: 9,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.mobile-literal",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "literal",
      literalKind: "string",
      data: "csg.data.conditional-panel.mobile",
      ordinal: 10,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.mode-eq-mobile",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "binary",
      operator: "EqualsEqualsEqualsToken",
      left: "csg.op.conditional-panel.mode-mobile-id",
      right: "csg.op.conditional-panel.mobile-literal",
      ordinal: 11,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.secondary-local-write",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "local_write",
      declarationKind: "const",
      name: "secondaryMobile",
      value: "csg.op.conditional-panel.mode-eq-mobile",
      ordinal: 12,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.primary-mobile-id",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "identifier",
      name: "primaryMobile",
      ordinal: 13,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.secondary-mobile-id",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "identifier",
      name: "secondaryMobile",
      ordinal: 14,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.mobile-condition",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "binary",
      operator: "BarBarToken",
      left: "csg.op.conditional-panel.primary-mobile-id",
      right: "csg.op.conditional-panel.secondary-mobile-id",
      ordinal: 15,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.mobile-jsx",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.mobile-body",
      opKind: "jsx",
      tagName: "div",
      ordinal: 16,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.mobile-return",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.mobile-body",
      opKind: "return",
      value: "csg.op.conditional-panel.mobile-jsx",
      ordinal: 17,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.mobile-block",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.mobile-wrapper",
      opKind: "block",
      nestedBlock: "csg.block.conditional-panel.mobile-body",
      ordinal: 18,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.mobile-branch",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "branch_if",
      condition: "csg.op.conditional-panel.mobile-condition",
      thenBlock: "csg.block.conditional-panel.mobile-wrapper",
      ordinal: 19,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.desktop-jsx",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "jsx",
      tagName: "div",
      ordinal: 20,
    },
    {
      kind: "csg.op",
      id: "csg.op.conditional-panel.desktop-return",
      function: "csg.function.conditional-panel",
      block: "csg.block.conditional-panel.root",
      opKind: "return",
      value: "csg.op.conditional-panel.desktop-jsx",
      ordinal: 21,
    },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.conditional-panel-none-root",
      coreFact: "csg.jsx.conditional-panel-none-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "div",
      attributeCount: 0,
      childCount: 1,
      owner: "csg.function.conditional-panel",
      props: [],
      children: [{ kind: "text", ordinal: 0, text: "none branch" }],
    },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.conditional-panel-mobile-root",
      coreFact: "csg.jsx.conditional-panel-mobile-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "div",
      attributeCount: 0,
      childCount: 1,
      owner: "csg.function.conditional-panel",
      props: [],
      children: [{ kind: "text", ordinal: 0, text: "mobile branch" }],
    },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.conditional-panel-desktop-root",
      coreFact: "csg.jsx.conditional-panel-desktop-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "div",
      attributeCount: 0,
      childCount: 1,
      owner: "csg.function.conditional-panel",
      props: [],
      children: [{ kind: "text", ordinal: 0, text: "desktop branch" }],
    },
  );
  return nextFacts;
}

function withSourceRootConditionalStateComponent(facts) {
  const nextFacts = structuredClone(facts);
  nextFacts.push(
    {
      kind: "csg.function",
      id: "csg.function.source-state-root",
      name: "SourceStateRoot",
      exported: true,
      loc: { file: "fixtures/csg-web-materializer-basic/src/SourceStateRoot.tsx", line: 1, column: 1, start: 1, end: 20 },
    },
    {
      kind: "csg.web.js_function_ref",
      id: "csg.web.js_function_ref.source-state-root",
      coreFact: "csg.function.source-state-root",
      name: "SourceStateRoot",
      loc: { file: "fixtures/csg-web-materializer-basic/src/SourceStateRoot.tsx", line: 1, column: 1, start: 1, end: 20 },
    },
    {
      kind: "csg.op",
      id: "csg.op.source-state-root.use-state",
      function: "csg.function.source-state-root",
      block: "csg.block.source-state-root.root",
      opKind: "call",
      callee: "useState",
      arguments: [],
      ordinal: 0,
    },
    {
      kind: "csg.op",
      id: "csg.op.source-state-root.is-live",
      function: "csg.function.source-state-root",
      block: "csg.block.source-state-root.root",
      opKind: "binding_extract",
      source: "csg.op.source-state-root.use-state",
      name: "isLive",
      path: [{ kind: "index", index: 0 }],
      defaultInitializer: "false",
      ordinal: 1,
    },
    {
      kind: "csg.op",
      id: "csg.op.source-state-root.is-live-id",
      function: "csg.function.source-state-root",
      block: "csg.block.source-state-root.root",
      opKind: "identifier",
      name: "isLive",
      ordinal: 2,
    },
    {
      kind: "csg.op",
      id: "csg.op.source-state-root.not-live",
      function: "csg.function.source-state-root",
      block: "csg.block.source-state-root.root",
      opKind: "unary",
      operator: "ExclamationToken",
      operand: "csg.op.source-state-root.is-live-id",
      ordinal: 3,
    },
    {
      kind: "csg.op",
      id: "csg.op.source-state-root.prep-jsx",
      function: "csg.function.source-state-root",
      block: "csg.block.source-state-root.prep-body",
      opKind: "jsx",
      tagName: "div",
      ordinal: 4,
    },
    {
      kind: "csg.op",
      id: "csg.op.source-state-root.prep-return",
      function: "csg.function.source-state-root",
      block: "csg.block.source-state-root.prep-body",
      opKind: "return",
      value: "csg.op.source-state-root.prep-jsx",
      ordinal: 5,
    },
    {
      kind: "csg.op",
      id: "csg.op.source-state-root.prep-block",
      function: "csg.function.source-state-root",
      block: "csg.block.source-state-root.prep-wrapper",
      opKind: "block",
      nestedBlock: "csg.block.source-state-root.prep-body",
      ordinal: 6,
    },
    {
      kind: "csg.op",
      id: "csg.op.source-state-root.prep-branch",
      function: "csg.function.source-state-root",
      block: "csg.block.source-state-root.root",
      opKind: "branch_if",
      condition: "csg.op.source-state-root.not-live",
      thenBlock: "csg.block.source-state-root.prep-wrapper",
      ordinal: 7,
    },
    {
      kind: "csg.op",
      id: "csg.op.source-state-root.live-jsx",
      function: "csg.function.source-state-root",
      block: "csg.block.source-state-root.root",
      opKind: "jsx",
      tagName: "div",
      ordinal: 8,
    },
    {
      kind: "csg.op",
      id: "csg.op.source-state-root.live-return",
      function: "csg.function.source-state-root",
      block: "csg.block.source-state-root.root",
      opKind: "return",
      value: "csg.op.source-state-root.live-jsx",
      ordinal: 9,
    },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.source-state-root-prep",
      coreFact: "csg.jsx.source-state-root-prep",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "div",
      attributeCount: 0,
      childCount: 1,
      owner: "csg.function.source-state-root",
      props: [],
      children: [{ kind: "text", ordinal: 0, text: "source prep branch" }],
      loc: { file: "fixtures/csg-web-materializer-basic/src/SourceStateRoot.tsx", line: 4, column: 5, start: 100, end: 160 },
    },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.source-state-root-live",
      coreFact: "csg.jsx.source-state-root-live",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "div",
      attributeCount: 0,
      childCount: 1,
      owner: "csg.function.source-state-root",
      props: [],
      children: [{ kind: "text", ordinal: 0, text: "source live branch" }],
      loc: { file: "fixtures/csg-web-materializer-basic/src/SourceStateRoot.tsx", line: 8, column: 3, start: 180, end: 240 },
    },
  );
  return nextFacts;
}

function withOwnerLocalObjectComponentProp(facts) {
  let added = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (added || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    added = true;
    nextFact.owner = "csg.function.local-object-parent";
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      {
        kind: "element",
        ordinal: 1004,
        owner: "csg.function.local-object-parent",
        coreFact: "csg.jsx.local-object-policy-usage",
        tagName: "PolicyPanel",
        props: [{ kind: "attribute", ordinal: 0, name: "content", valueKind: "expression", expression: "truthContent" }],
        children: [],
      },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(added, true, "expected a section template for owner local object component prop smoke");
  nextFacts.push(
    { kind: "csg.data", id: "csg.data.local-object.id", dataKind: "string", value: "truth-content" },
    { kind: "csg.data", id: "csg.data.local-object.title", dataKind: "string", value: "Visible content" },
    { kind: "csg.data", id: "csg.data.local-object.tombstoned", dataKind: "string", value: "tombstoned" },
    {
      kind: "csg.web.js_function_ref",
      id: "csg.web.js_function_ref.policy-panel",
      coreFact: "csg.function.policy-panel",
      name: "PolicyPanel",
    },
    {
      kind: "csg.binding",
      id: "csg.binding.policy-panel.content",
      owner: "csg.function.policy-panel",
      declarationKind: "parameter",
      name: "content",
      path: [{ kind: "property", name: "content" }],
    },
    {
      kind: "csg.op",
      id: "csg.op.local-object.id-literal",
      function: "csg.function.local-object-parent",
      block: "csg.block.local-object-parent",
      opKind: "literal",
      data: "csg.data.local-object.id",
      ordinal: 0,
    },
    {
      kind: "csg.op",
      id: "csg.op.local-object.title-literal",
      function: "csg.function.local-object-parent",
      block: "csg.block.local-object-parent",
      opKind: "literal",
      data: "csg.data.local-object.title",
      ordinal: 1,
    },
    {
      kind: "csg.op",
      id: "csg.op.local-object.dynamic-call",
      function: "csg.function.local-object-parent",
      block: "csg.block.local-object-parent",
      opKind: "call",
      callee: "Date.now",
      argumentCount: 0,
      arguments: [],
      ordinal: 2,
    },
    {
      kind: "csg.op",
      id: "csg.op.local-object.object",
      function: "csg.function.local-object-parent",
      block: "csg.block.local-object-parent",
      opKind: "object_literal",
      properties: [
        { name: "id", value: "csg.op.local-object.id-literal" },
        { name: "title", value: "csg.op.local-object.title-literal" },
        { name: "timestamp", value: "csg.op.local-object.dynamic-call" },
      ],
      ordinal: 3,
    },
    {
      kind: "csg.op",
      id: "csg.op.local-object.local-write",
      function: "csg.function.local-object-parent",
      block: "csg.block.local-object-parent",
      opKind: "local_write",
      declarationKind: "const",
      name: "truthContent",
      value: "csg.op.local-object.object",
      ordinal: 4,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.content-id-1",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.root",
      opKind: "identifier",
      name: "content",
      ordinal: 0,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.tombstoned-read",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.root",
      opKind: "property_read",
      receiver: "csg.op.policy-panel.content-id-1",
      name: "tombstoned",
      ordinal: 1,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.tombstoned-write",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.root",
      opKind: "local_write",
      name: "tombstoned",
      value: "csg.op.policy-panel.tombstoned-read",
      ordinal: 2,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.content-id-2",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.root",
      opKind: "identifier",
      name: "content",
      ordinal: 3,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.access-policy-read",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.root",
      opKind: "property_read",
      receiver: "csg.op.policy-panel.content-id-2",
      name: "accessPolicy",
      ordinal: 4,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.tombstoned-literal",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.root",
      opKind: "literal",
      data: "csg.data.local-object.tombstoned",
      ordinal: 5,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.access-policy-eq",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.root",
      opKind: "binary",
      operator: "EqualsEqualsEqualsToken",
      left: "csg.op.policy-panel.access-policy-read",
      right: "csg.op.policy-panel.tombstoned-literal",
      ordinal: 6,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.restricted-write",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.root",
      opKind: "local_write",
      name: "restricted",
      value: "csg.op.policy-panel.access-policy-eq",
      ordinal: 7,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.tombstoned-id",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.root",
      opKind: "identifier",
      name: "tombstoned",
      ordinal: 8,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.restricted-id",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.root",
      opKind: "identifier",
      name: "restricted",
      ordinal: 9,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.blocked-condition",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.root",
      opKind: "binary",
      operator: "BarBarToken",
      left: "csg.op.policy-panel.tombstoned-id",
      right: "csg.op.policy-panel.restricted-id",
      ordinal: 10,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.blocked-jsx",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.blocked-body",
      opKind: "jsx",
      tagName: "div",
      ordinal: 11,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.blocked-return",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.blocked-body",
      opKind: "return",
      value: "csg.op.policy-panel.blocked-jsx",
      ordinal: 12,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.blocked-block",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.blocked-wrapper",
      opKind: "block",
      nestedBlock: "csg.block.policy-panel.blocked-body",
      ordinal: 13,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.blocked-branch",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.root",
      opKind: "branch_if",
      condition: "csg.op.policy-panel.blocked-condition",
      thenBlock: "csg.block.policy-panel.blocked-wrapper",
      ordinal: 14,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.visible-jsx",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.root",
      opKind: "jsx",
      tagName: "div",
      ordinal: 15,
    },
    {
      kind: "csg.op",
      id: "csg.op.policy-panel.visible-return",
      function: "csg.function.policy-panel",
      block: "csg.block.policy-panel.root",
      opKind: "return",
      value: "csg.op.policy-panel.visible-jsx",
      ordinal: 16,
    },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.policy-panel-blocked-root",
      coreFact: "csg.op.policy-panel.blocked-jsx",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "div",
      owner: "csg.function.policy-panel",
      props: [],
      children: [{ kind: "text", ordinal: 0, text: "policy blocked" }],
    },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.policy-panel-visible-root",
      coreFact: "csg.op.policy-panel.visible-jsx",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "div",
      owner: "csg.function.policy-panel",
      props: [],
      children: [{ kind: "text", ordinal: 0, text: "policy visible" }],
    },
  );
  return nextFacts;
}

function withOwnerScopedComponentProp(facts) {
  let patchedRoot = false;
  const nextFacts = facts.map((fact) => {
    const nextFact = structuredClone(fact);
    if (patchedRoot || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") {
      return nextFact;
    }
    patchedRoot = true;
    nextFact.owner = "csg.function.owner-scoped-parent";
    const children = Array.isArray(nextFact.children) ? nextFact.children : [];
    nextFact.children = [
      ...children,
      { kind: "element", ordinal: 1004, coreFact: "csg.jsx.owner-scoped-child-usage" },
    ];
    if (typeof nextFact.childCount === "number") nextFact.childCount += 1;
    return nextFact;
  });
  assert.equal(patchedRoot, true, "expected a section template for owner-scoped component prop smoke");
  nextFacts.push(
    {
      kind: "csg.binding",
      id: "csg.binding.owner-scoped-parent.show-child",
      owner: "csg.function.owner-scoped-parent",
      declarationKind: "const",
      name: "showChildGate",
      path: [],
      defaultInitializer: "false",
    },
    {
      kind: "csg.web.js_function_ref",
      id: "csg.web.js_function_ref.owner-scoped-child",
      coreFact: "csg.function.owner-scoped-child",
      name: "OwnerScopedChild",
    },
    {
      kind: "csg.binding",
      id: "csg.binding.owner-scoped-child.open",
      owner: "csg.function.owner-scoped-child",
      declarationKind: "parameter",
      name: "open",
      path: [{ kind: "property", name: "open" }],
    },
    {
      kind: "csg.data",
      id: "csg.data.owner-scoped-child-null-guard",
      dataKind: "component_null_guard",
      value: {
        functionId: "csg.function.owner-scoped-child",
        paramName: "open",
        predicate: "falsy",
      },
    },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.owner-scoped-child-usage",
      coreFact: "csg.jsx.owner-scoped-child-usage",
      domain: "react-component",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "OwnerScopedChild",
      attributeCount: 2,
      childCount: 0,
      owner: "csg.function.owner-scoped-parent",
      props: [
        { kind: "attribute", ordinal: 0, name: "open", valueKind: "expression", expression: "showChildGate" },
        { kind: "attribute", ordinal: 1, name: "activeOrder", valueKind: "expression", expression: "tabOrder" },
      ],
      children: [],
    },
    {
      kind: "csg.binding",
      id: "csg.binding.owner-scoped-child.active-order",
      owner: "csg.function.owner-scoped-child",
      declarationKind: "parameter",
      name: "activeOrder",
      path: [{ kind: "property", name: "activeOrder" }],
    },
    {
      kind: "csg.web.dom_node_template",
      id: "csg.web.dom_node_template.owner-scoped-child-root",
      coreFact: "csg.jsx.owner-scoped-child-root",
      domain: "dom-html",
      runtimeTarget: "cheng-web-runtime",
      nodeKind: "element",
      tagName: "div",
      attributeCount: 0,
      childCount: 2,
      owner: "csg.function.owner-scoped-child",
      props: [],
      children: [
        { kind: "text", ordinal: 0, text: "owner-scoped child visible" },
        {
          kind: "expression",
          ordinal: 1,
          expression: "activeOrder.map((type) => { const def = categoryTabs.find(p => p.key === type); if (!def) return null; return (<span data-channel-type={type}>{t[def.labelKey] || def.fallbackLabel}</span>); })",
        },
      ],
    },
    {
      kind: "csg.data",
      id: "csg.data.owner-scoped-publish-types",
      dataKind: "static_string_object_array",
      value: {
        bindingName: "publishTypes",
        sourceFile: "fixtures/csg-web-materializer-basic/src/metadata.ts",
        items: [
          { type: "content", labelKey: "publish_content", fallbackLabel: "视频" },
          { type: "graphic", labelKey: "publish_graphic", fallbackLabel: "图文" },
          { type: "novel", labelKey: "publish_novel", fallbackLabel: "小说" },
        ],
      },
    },
  );
  return nextFacts;
}

function withEarlierSmallTemplateInSameSource(facts) {
  const nextFacts = facts.map((fact) => structuredClone(fact));
  nextFacts.push({
    kind: "csg.web.dom_node_template",
    id: "csg.web.dom_node_template.earlier-small-root-smoke",
    coreFact: "csg.jsx.earlier-small-root-smoke",
    domain: "dom-html",
    runtimeTarget: "cheng-web-runtime",
    nodeKind: "element",
    tagName: "span",
    attributeCount: 0,
    childCount: 1,
    owner: "",
    loc: {
      file: "src/main.tsx",
      line: 1,
      column: 1,
      start: 1,
      end: 8,
    },
    props: [],
    children: [{ kind: "text", ordinal: 0, text: "thin" }],
  });
  return nextFacts;
}

function withClosedOverlayRoot(facts) {
  const nextFacts = facts.map((fact) => structuredClone(fact));
  nextFacts.push({
    kind: "csg.web.dom_node_template",
    id: "csg.web.dom_node_template.closed-overlay-root-smoke",
    coreFact: "csg.jsx.closed-overlay-root-smoke",
    domain: "react-component",
    runtimeTarget: "cheng-web-runtime",
    nodeKind: "element",
    tagName: "SheetPrimitive.Root",
    attributeCount: 1,
    childCount: 2,
    owner: "csg.function.closed-overlay-root-smoke",
    loc: {
      file: "src/closed-overlay.tsx",
      line: 1,
      column: 1,
      start: 1,
      end: 180,
    },
    props: [
      { kind: "attribute", ordinal: 0, name: "open", valueKind: "expression", expression: "sheetOpen" },
    ],
    children: [
      {
        kind: "element",
        ordinal: 0,
        tagName: "SheetPrimitive.Trigger",
        props: [],
        children: [{ kind: "text", ordinal: 0, text: "Open sheet" }],
      },
      {
        kind: "element",
        ordinal: 1,
        tagName: "SheetPrimitive.Content",
        props: [
          { kind: "attribute", ordinal: 0, name: "className", valueKind: "string", value: "fixed inset-0 bg-white" },
        ],
        children: [{ kind: "text", ordinal: 0, text: "Hidden sheet body" }],
      },
    ],
  });
  return nextFacts;
}

function assertMaterializerHardFail(name, text, expectedDiagnostic) {
  const validation = validateCsgWebText(text);
  assert.equal(validation.ok, true, `${name} csg-web validation failed:\n${validation.diagnostics.join("\n")}`);

  const result = materializeCsgWebFactsToChengSource(text);
  const errorReport = result.diagnostics.join("\n").trim();
  assert.notEqual(errorReport, "", `${name} error report must be non-empty`);
  assert.match(errorReport, expectedDiagnostic);
  assert.equal(result.text, "", `${name} must not emit Cheng source after materializer failure`);
  assert.equal(result.counts.elements, 0, `${name} must not count materialized elements after failure`);
  assert.equal(result.counts.textLiterals, 0, `${name} must not count materialized text after failure`);
  assert.equal(result.counts.props, 0, `${name} must not count materialized props after failure`);
}

assert.equal(existsSync(fixtureProject), true, `missing fixture project: ${fixtureProject}`);
assert.equal(existsSync(cheng), true, `missing stage3 Cheng compiler: ${cheng}`);

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

execFileSync("npm", ["run", "build"], {
  cwd: packageDir,
  stdio: ["ignore", "pipe", "pipe"],
});

execFileSync(process.execPath, [
  "dist/cli.js",
  "--emit",
  "csg-web",
  "--project",
  fixtureProject,
  "--runtime",
  "node,browser",
  "--out",
  factsPath,
  "--report-out",
  reportPath,
], {
  cwd: packageDir,
  stdio: ["ignore", "pipe", "pipe"],
});

const { validateCsgWebText } = await import(pathToFileURL(join(packageDir, "dist", "csg-web.js")).href);
const {
  materializeCsgWebFactsToChengSource,
  createCsgWebMaterializerSession,
  emitCsgWebSceneFactsFromFactArray,
  CsgWebMaterializerMarker,
  defaultMobileRouteContents,
  defaultMobileRouteMusicContent,
  defaultMobileRouteMediaPayloadAssetsForFacts,
} = await import(pathToFileURL(join(packageDir, "dist", "csg-web-materializer.js")).href);
const { csgcWriteFacts } = await import(pathToFileURL(join(packageDir, "dist", "csgc-writer.js")).href);
const { csgcReadFacts } = await import(pathToFileURL(join(packageDir, "dist", "csgc-reader.js")).href);
const csgCoreSchemaFact = Object.freeze({
  kind: "csg.core.schema",
  schema: "csg_core",
  features: ["core-facts"],
});

function mediaSurfaceTopologyFacts(routeId, layoutMode) {
  const layouts = layoutMode === "masonry"
    ? [{ nodeId: 2, propName: "display", propValue: "masonry" }]
    : [
      { nodeId: 2, propName: "position", propValue: "fixed" },
      { nodeId: 2, propName: "left", propValue: "0px" },
      { nodeId: 2, propName: "right", propValue: "0px" },
      { nodeId: 2, propName: "top", propValue: "0px" },
      { nodeId: 2, propName: "bottom", propValue: "0px" },
    ];
  return [
    { kind: "csg.web.schema", language: "typescript", schema: "csg-web", features: [], extends: "csg-core" },
    { kind: "csg.core.schema", language: "typescript", schema: "csg-core", features: [] },
    {
      kind: "csg.web.dom_node_template",
      id: "scene.node.media.template",
      tagName: "div",
      nodeKind: "element",
      domain: "dom-html",
      props: [],
      children: [],
    },
    {
      kind: "csg.web.scene.route",
      id: `scene.route.${routeId}`,
      routeId,
      routeIndex: 0,
      rootNodeId: 1,
      rootTemplate: "scene.node.root",
    },
    {
      kind: "csg.web.scene.node",
      id: "scene.node.root",
      routeId,
      routeIndex: 0,
      nodeId: 1,
      parentNodeId: 0,
      ordinal: 0,
      nodeKind: "element",
      tagName: "div",
    },
    {
      kind: "csg.web.scene.node",
      id: "scene.node.container",
      routeId,
      routeIndex: 0,
      nodeId: 2,
      parentNodeId: 1,
      ordinal: 0,
      nodeKind: "element",
      tagName: "div",
    },
    {
      kind: "csg.web.scene.node",
      id: "scene.node.media",
      routeId,
      routeIndex: 0,
      nodeId: 3,
      parentNodeId: 2,
      ordinal: 0,
      nodeKind: "element",
      tagName: "div",
    },
    ...layouts.map((layout, ordinal) => ({
      kind: "csg.web.scene.layout",
      id: `scene.layout.${routeId}.${ordinal}`,
      routeId,
      routeIndex: 0,
      nodeId: layout.nodeId,
      ordinal,
      propName: layout.propName,
      propValue: layout.propValue,
    })),
    {
      kind: "csg.web.media_asset",
      id: "media.asset.topology.video",
      assetCid: "asset-cid-topology-video",
      bundleCid: "bundle-cid-topology-video",
      mime: "video/mp4",
      kindCode: 1,
      durationMs: "22000",
      codec: "avc1.640028",
      posterCid: "poster-cid-topology-video",
      initSegmentCid: "init-cid-topology-video",
      initSegmentByteLength: 12,
      keyframeIndex: "0:init-cid-topology-video",
      transport: "moq",
      fecScheme: "lt_xor_v1:experimental",
      contentSignature: "sig-topology-video",
      catalogCid: "catalog-cid-topology-video",
      catalogKey: "catalog-key-topology-video",
      rebuildTemplateCid: "template-cid-topology-video",
      rebuildTemplateKey: "template-key-topology-video",
      objectTargetBytes: 4096,
      sourceBlockBytes: 1024,
      objectCount: 1,
      dropletCount: 1,
      objects: [{ objectIndex: 0, objectId: "o0", objectCid: "object-cid", byteOffset: 0, byteLength: 12, sourceBlockBytes: 4, sourceBlockCount: 3, priority: 0 }],
      droplets: [{ objectIndex: 0, dropletIndex: 0, kindCode: 1, key: "d0", peerId: "peer-a", cid: "droplet-cid", degree: 1, blockIndexes: [0] }],
    },
    {
      kind: "csg.web.media_playback_slot",
      id: "media.slot.topology.video",
      slotId: "slot-topology-video",
      assetFact: "media.asset.topology.video",
      assetCid: "asset-cid-topology-video",
      manifestCid: "manifest-cid-topology-video",
      nodeTemplate: "scene.node.media",
      providerKind: "media-decode-provider",
      stateRef: "media:slot-topology-video",
      decodeProvider: "macos-videotoolbox-codec-provider",
      textureProvider: "metal-surface-texture-provider",
      audioProvider: "macos-coreaudio-provider",
      objectFit: "cover",
    },
  ];
}

assert.deepEqual(
  createCsgWebMaterializerSession(mediaSurfaceTopologyFacts("node_published_content", "masonry")).diagnostics,
  [],
  "published content video may only sit in the masonry list before opening detail",
);
const publishedFullscreenSession = createCsgWebMaterializerSession(mediaSurfaceTopologyFacts("node_published_content", "fullscreen"));
assert.equal(
  publishedFullscreenSession.diagnostics.some((diagnostic) => diagnostic.includes("scene media slot slot-topology-video on node_published_content must stay under masonry layout")),
  true,
  "published content video must hard-fail when detached from masonry",
);
assert.equal(
  publishedFullscreenSession.diagnostics.some((diagnostic) => diagnostic.includes("scene media slot slot-topology-video on node_published_content must not be fullscreen")),
  true,
  "published content video must not occupy fullscreen before detail",
);
assert.deepEqual(
  createCsgWebMaterializerSession(mediaSurfaceTopologyFacts("content_detail", "fullscreen")).diagnostics,
  [],
  "content detail video must be allowed to use fullscreen",
);
const detailMasonrySession = createCsgWebMaterializerSession(mediaSurfaceTopologyFacts("content_detail", "masonry"));
assert.equal(
  detailMasonrySession.diagnostics.some((diagnostic) => diagnostic.includes("scene media slot slot-topology-video on content_detail detail video must not stay under masonry layout")),
  true,
  "content detail video must not remain in the list masonry slot",
);
assert.equal(
  detailMasonrySession.diagnostics.some((diagnostic) => diagnostic.includes("scene media slot slot-topology-video on content_detail detail video must be fullscreen")),
  true,
  "content detail video must hard-fail unless fullscreen",
);

const factsText = readFileSync(factsPath, "utf8");
const validation = validateCsgWebText(factsText);
assert.equal(validation.ok, true, validation.diagnostics.join("\n"));
const facts = parseJsonlFacts(factsText);
assertSceneDomCssMediaVariantCoverage();
const materializerSmokeFontSource = [
  factsText,
  renderJsonlFacts(withRegionPolicyConditionalChildren(withAddedDomTemplateProp(facts, {
    kind: "attribute",
    ordinal: 999,
    name: "className",
    valueKind: "string",
    value: "bg-gray-50 rounded-xl px-4 flex items-end",
  }))),
  "境外节点 国内节点 定位中 加载中 刷新链上余额 NFC 收款 开始接收 RWAD 余额已切换 首页 消息 节点 我 Open sheet Hidden sheet body",
].join("\n");
const materializerSmokeFonts = await prepareMaterializerSmokeFonts(materializerSmokeFontSource);

const report = JSON.parse(readFileSync(reportPath, "utf8"));
assert.equal(report.schema, "csg-web.report");
assert.equal(report.counts.jsxElements, 3);
assert.equal(report.counts.domNodeTemplates, 3);
assert.equal(report.runtimeIndependent, true);
assert.equal(report.engineDependency, "none");

const materialized = materializeCsgWebFactsToChengSource(factsText, { frameLimit: 1, pureCheng: true });
assert.deepEqual(materialized.diagnostics, []);
assert.equal(materialized.marker, CsgWebMaterializerMarker);
assert.equal(materialized.counts.elements, 3);
assert.equal(materialized.counts.textLiterals, 2);
assert.equal(materialized.counts.props, 4);
const chengSource = materialized.text;
assert.match(chengSource, new RegExp(CsgWebMaterializerMarker));
assert.doesNotMatch(chengSource, /0xFFFF0000/, "basic materialized source must not contain diagnostic full-viewport red");
{
  const sectionKeys = createElementKeysByTag(chengSource, "section");
  assert.ok(sectionKeys.length > 0, "basic fixture should contain a section element");
  for (const key of sectionKeys) {
    const styleBlock = inlineStyleBlockForKey(chengSource, key);
    assert.doesNotMatch(styleBlock, /"width", "24px"/, "HTML section must not be materialized as a Lucide icon");
    assert.doesNotMatch(styleBlock, /"height", "24px"/, "HTML section must not be materialized as a Lucide icon");
    assert.doesNotMatch(styleBlock, /WebPaintRegisterIconStyle/, "HTML section must not register icon paint");
  }
}
writeFileSync(chengSourcePath, chengSource, "utf8");

{
  const result = materializeCsgWebFactsToChengSource(factsText, {
    frameLimit: 1,
    pureCheng: true,
    fontBase64s: materializerSmokeFonts.base64s,
    fontWeights: materializerSmokeFonts.weights,
    fontFamilies: materializerSmokeFonts.families,
  });
  assert.deepEqual(result.diagnostics, []);
  assert.match(result.text, /RasterPaintOpsWithFontCascade8WeightedFamily/);
  assert.match(result.text, /, 3, 400, 700, 400, 400, 400, 400, 400, 400, 0, 0, 0, 0, 0, 0, 0, 0\):/);
}

{
  // event handler props are not static DOM attributes; behavior is covered by runtime requirements.
  const result = materializeCsgWebFactsToChengSource(
    renderJsonlFacts(withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 999,
      name: "onClick",
      valueKind: "expression",
      expression: "handleClick",
    })),
  );
  assert.deepEqual(result.diagnostics, []);
  assert.doesNotMatch(result.text, /onClick/);
}

{
  // Static JSX expressions such as App bottom nav conditionals are materialized as DOM, not blank text.
  const result = materializeCsgWebFactsToChengSource(
    renderJsonlFacts(withStaticConditionalJsxChild(facts)),
    { staticExpressionValues: { showNav: true, currentTab: "home" } },
  );
  assert.deepEqual(result.diagnostics, []);
  assert.match(result.text, /"nav"/);
  assert.match(result.text, /首页/);
  assert.match(result.text, /text-purple-500/);
}

{
  // style prop is now accepted
  const result = materializeCsgWebFactsToChengSource(
    renderJsonlFacts(withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 999,
      name: "style",
      valueKind: "expression",
      expression: "buttonStyle",
    })),
  );
  assert.deepEqual(result.diagnostics, []);
  assert.match(result.text, /style/);
}

{
  // dynamic prop expression is now accepted (converted to string)
  const result = materializeCsgWebFactsToChengSource(
    renderJsonlFacts(withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 999,
      name: "data-dynamic",
      valueKind: "expression",
      expression: "dynamicLabel",
    })),
  );
  assert.deepEqual(result.diagnostics, []);
  assert.match(result.text, /data-dynamic/);
}

{
  // Tailwind arbitrary viewport height maps to a concrete CSS length for mobile sheets.
  const result = materializeCsgWebFactsToChengSource(
    renderJsonlFacts(withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 999,
      name: "className",
      valueKind: "string",
      value: "w-full h-[70vh]",
    })),
    { viewport: "390x844" },
  );
  assert.deepEqual(result.diagnostics, []);
  assert.match(result.text, /WebDocumentSetInlineStyleValue\(document, __s, "height", "591px"\)/);
}

  {
    // static object-array map expressions are materialized from CSG data, not emitted as raw JSX text.
    const result = materializeCsgWebFactsToChengSource(renderJsonlFacts(withStaticMapChild(facts)));
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /日本語/);
    assert.match(result.text, /Japanese/);
    assert.match(result.text, /react\.CreateText\(runtime, "0"/);
    assert.match(result.text, /react\.CreateText\(runtime, "1"/);
    assert.match(result.text, /react\.CreateText\(runtime, "23"/);
    assert.match(result.text, /Alpha/);
    assert.match(result.text, /Beta/);
    assert.match(result.text, /react\.CreateText\(runtime, "EN"/);
    assert.match(result.text, /react\.CreateText\(runtime, "JA"/);
    assert.doesNotMatch(result.text, /languages\.map/);
  }

  {
    // Inline literal object-array with `as` casts maps 1:1 (BaziPage bottom tabs):
    // the receiver is a literal, not an identifier, so no csg.data entry exists.
    const result = materializeCsgWebFactsToChengSource(renderJsonlFacts(withInlineLiteralAsCastMapChild(facts)));
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /盘面/);
    assert.match(result.text, /辅助/);
    assert.match(result.text, /提示/);
    assert.match(result.text, /档案/);
    assert.doesNotMatch(result.text, /\.map\(/);
  }

  {
    // ContentCard avatar fallback uses avatarInitial(content.userName); it must
    // resolve to the real first character, not the unresolved-expression marker.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withAvatarInitialExpressionChild(facts)),
      { staticExpressionValues: { content: { userName: "胡广生" } } },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /react\.CreateText\(runtime, "胡"/);
    assert.doesNotMatch(result.text, /react\.CreateText\(runtime, "\.\.\."/);
  }

  {
    // ContentCard locationLabel must match React: formatContentLocationLabel(location) wins over locationHint.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withContentCardLocationLabelExpressionChild(facts)),
      {
        staticExpressionValues: {
          content: {
            location: {
              public: {
                country: "中国",
                province: "广东省",
                city: "深圳市",
                district: "南山区",
                displayLevel: "city",
              },
              precise: {
                latitude: 22.54286,
                longitude: 114.05956,
              },
            },
            locationHint: "错误回退地址",
          },
        },
      },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /react\.CreateText\(runtime, "中国广东省深圳市"/);
    assert.doesNotMatch(result.text, /错误回退地址/);
    assert.doesNotMatch(result.text, /南山区/);
  }

  {
    // Empty structured location falls through to ContentCard locationHint.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withContentCardLocationLabelExpressionChild(facts)),
      {
        staticExpressionValues: {
          content: {
            location: {
              precise: {
                latitude: 22.54286,
                longitude: 114.05956,
              },
            },
            locationHint: "中国河南省三门峡市陕州区",
          },
        },
      },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /react\.CreateText\(runtime, "中国河南省三门峡市陕州区"/);
  }

  {
    // Absolute Tailwind fractional sizing must materialize small positioned dots, not stretch to the parent.
    const result = materializeCsgWebFactsToChengSource(renderJsonlFacts(withAbsoluteFractionalSizeChild(facts)));
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /WebDocumentSetInlineStyleValue\(document, __s, "position", "absolute"\)/);
    assert.match(result.text, /WebDocumentSetInlineStyleValue\(document, __s, "top", "4px"\)/);
    assert.match(result.text, /WebDocumentSetInlineStyleValue\(document, __s, "right", "4px"\)/);
    assert.match(result.text, /WebDocumentSetInlineStyleValue\(document, __s, "width", "6px"\)/);
    assert.match(result.text, /WebDocumentSetInlineStyleValue\(document, __s, "height", "6px"\)/);
  }

  {
    // Imported static object-array maps with destructured callback params materialize the real JSX shape.
    const assetProjectRoot = join(tmpDir, "publish-types-map-project");
    const assetDir = join(assetProjectRoot, "public", "publish-icons");
    mkdirSync(assetDir, { recursive: true });
    writeFileSync(join(assetDir, "ic_publish_video.svg"), '<svg width="24" height="24" stroke="#000" opacity=".3" fill="none"><line x1="4" y1="4" x2="20" y2="20"/></svg>', "utf8");
    writeFileSync(join(assetDir, "ic_publish_movie.svg"), '<svg width="24" height="24" stroke="#000" opacity=".3" fill="none"><rect x="4" y="4" width="16" height="16"/></svg>', "utf8");
    writeFileSync(join(assetDir, "ic_publish_graphic.svg"), '<svg width="24" height="24" stroke="#000" opacity=".3" fill="none"><path d="M4 4h16v16H4z"/></svg>', "utf8");
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withProjectRoot(withImportedPublishTypesStaticMapChild(facts), assetProjectRoot)),
      { rawPixelDump: true },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /视频/);
    assert.match(result.text, /电影/);
    assert.match(result.text, /图文/);
    assert.match(result.text, /from-purple-500/);
    assert.match(result.text, /from-cyan-500/);
    assert.match(result.text, /to-slate-700/);
    assert.match(result.text, /to-teal-600/);
    assert.match(result.text, /linear-gradient\(to bottom right,0xFFA855F7,0xFF9333EA\)/);
    assert.match(result.text, /grid-cols-4\{grid-template-columns:25% 25% 25% 25%\}/);
    assert.match(result.text, /WebPaintRegisterIconStyle/);
    assert.doesNotMatch(result.text, /publishTypes\.map/);
    assert.doesNotMatch(result.text, /publishIconBase/);
  }

  {
    // HomePage derives category tabs from publishTypes/homeChannels and supports block-return JSX maps.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withDerivedHomeChannelsBlockMapChild(facts)),
      { staticExpressionValues: { activeCategory: "content" } },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /视频/);
    assert.match(result.text, /小说/);
    assert.match(result.text, /应用/);
    assert.ok(result.text.indexOf('"应用"') < result.text.indexOf('"视频"'), "initial smart sort should place app tab before content");
    assert.match(result.text, /bg-purple-500 text-white/);
    assert.match(result.text, /bg-red-500 text-white/);
    assert.match(result.text, /WebPaintRegisterBorderCornerStyle/);
    assert.match(result.text, /int32\(0xFFE5E7EB\), 1, 1, 1, 1, 9999, 9999, 9999, 9999\)/);
    assert.match(result.text, /"1"/);
    assert.doesNotMatch(result.text, /sortedTabKeys\.map/);
    assert.doesNotMatch(result.text, /categoryTabs\.find/);
    assert.doesNotMatch(result.text, /unreadCounts/);
  }

  {
    // Static useMemo string arrays joined in JSX are materialized from CSG ops.
    const result = materializeCsgWebFactsToChengSource(renderJsonlFacts(withStaticJoinChild(facts)));
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /kind=static_join/);
    assert.match(result.text, /phase=\{phase\}/);
    assert.doesNotMatch(result.text, /summaryLines\.join/);
  }

  {
    // dump-mode raster keeps Tailwind background colors after dump helpers are split out of main().
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withAddedDomTemplateProp(facts, {
        kind: "attribute",
        ordinal: 999,
        name: "className",
        valueKind: "string",
        value: "bg-gray-50 rounded-xl text-gray-400",
      })),
      { rawPixelDump: true },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /WebPaintRegisterFillCornerStyle/);
    assert.match(result.text, /0xFFF9FAFB/);
    assert.match(result.text, /0xFFF9FAFB\), 12, 12, 12, 12\)/);
    assert.match(result.text, /WebPaintRegisterTextColor/);
    assert.match(result.text, /0xFF9CA3AF/);
    assert.match(result.text, /WebPaintBuildOpsFromLayoutTreeWithRegistry/);
    assert.doesNotMatch(result.text, /WebPaintBuildOpsFromLayoutTree\(tree, ops\)/);
  }

  {
    // Tailwind bg-opacity-* composes with plain bg-* colors for modal overlays.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withAddedDomTemplateProp(facts, {
        kind: "attribute",
        ordinal: 999,
        name: "className",
        valueKind: "string",
        value: "fixed inset-0 bg-black bg-opacity-50",
      })),
      { rawPixelDump: true },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /WebPaintRegisterFillCornerStyle/);
    assert.match(result.text, /int32\(0x80000000\), 0, 0, 0, 0\)/);
    assert.match(result.text, /\.col-span-2\{grid-column:span 2 \/ span 2\}/);
    assert.match(result.text, /\.transform\{transform:translateX\(0px\)\}/);
  }

  {
    // Tailwind arbitrary hex colors are first-class paint colors, not white fallthroughs.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withAddedDomTemplateProp(facts, {
        kind: "attribute",
        ordinal: 999,
        name: "className",
        valueKind: "string",
        value: "bg-[#F6F7F9] rounded-xl text-[#123]/75",
      })),
      { rawPixelDump: true },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /WebPaintRegisterFillCornerStyle/);
    assert.match(result.text, /0xFFF6F7F9/);
    assert.match(result.text, /0xFFF6F7F9\), 12, 12, 12, 12\)/);
    assert.match(result.text, /WebPaintRegisterTextColor/);
    assert.match(result.text, /0xBF112233/);
  }

  {
    // Lucide icon components are materialized as explicit pure-Cheng paint icon ops.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withLucideIconChildren(facts)),
      { rawPixelDump: true },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /WebPaintRegisterIconStyle/);
    assert.match(result.text, /PaintIconKindSvg/);
    assert.match(result.text, /WebPaintRegisterIconPrimitive/);
    assert.match(result.text, /PaintSvgPrimitiveTriangle/);
    assert.match(result.text, /0xFF9333EA/);
    assert.match(result.text, /0xFFA855F7/);
    assert.match(result.text, /"width", "32px"/);
    assert.match(result.text, /"height", "32px"/);
    assert.match(result.text, /"width", "20px"/);
    assert.match(result.text, /"height", "20px"/);
  }

  {
    // PNG data URLs are decoded to exact pixels; placeholder colors are forbidden.
    const pngDataUrl = makePngDataUrl(2, 2, [
      0xffff0000,
      0xff00ff00,
      0xff0000ff,
      0x80ffffff,
    ]);
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withPngImageChild(facts, pngDataUrl)),
      { rawPixelDump: true },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /RasterImageCacheRegister\(surface\.imageCache, [0-9]+, 2, 2, __csgImgPixels\)/);
    assert.match(result.text, /int32\(0xFFFF0000\)/);
    assert.match(result.text, /int32\(0xFF00FF00\)/);
    assert.match(result.text, /int32\(0xFF0000FF\)/);
    assert.match(result.text, /int32\(0x80FFFFFF\)/);
    assert.doesNotMatch(result.text, /0xFF3B82F6/);
  }

  {
    // Public project assets use the same exact PNG decoder as data URLs.
    const pngDataUrl = makePngDataUrl(2, 2, [
      0xffff0000,
      0xff00ff00,
      0xff0000ff,
      0x80ffffff,
    ]);
    const assetProjectRoot = join(tmpDir, "asset-project");
    const assetDir = join(assetProjectRoot, "public", "assets");
    mkdirSync(assetDir, { recursive: true });
    writeFileSync(join(assetDir, "probe.png"), Buffer.from(pngDataUrl.split(",")[1], "base64"));
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withProjectRoot(withPngImageChild(facts, "/assets/probe.png?cache=1#v"), assetProjectRoot)),
      { rawPixelDump: true },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /RasterImageCacheRegister\(surface\.imageCache, [0-9]+, 2, 2, __csgImgPixels\)/);
    assert.match(result.text, /int32\(0xFFFF0000\)/);
    assert.match(result.text, /int32\(0x80FFFFFF\)/);
  }

  {
    // Local JPEG assets use the real raster decoder and register decoded pixels.
    const assetProjectRoot = join(tmpDir, "jpeg-asset-project");
    const assetDir = join(assetProjectRoot, "public", "assets");
    mkdirSync(assetDir, { recursive: true });
    writeFileSync(join(assetDir, "probe.jpg"), await makeJpegBuffer(2, 2, [
      0xffff0000,
      0xff00ff00,
      0xff0000ff,
      0xffffffff,
    ]));
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withProjectRoot(withPngImageChild(facts, "/assets/probe.jpg"), assetProjectRoot)),
      { rawPixelDump: true },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /RasterImageCacheRegister\(surface\.imageCache, [0-9]+, 2, 2, __csgImgPixels\)/);
    assert.doesNotMatch(result.text, /0xFF3B82F6/);
  }

  {
    // JPEG data URLs use the same real raster decoder as local JPEG assets.
    const jpegDataUrl = `data:image/jpeg;base64,${(await makeJpegBuffer(2, 2, [
      0xffff0000,
      0xff00ff00,
      0xff0000ff,
      0xffffffff,
    ])).toString("base64")}`;
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withPngImageChild(facts, jpegDataUrl)),
      { rawPixelDump: true },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /RasterImageCacheRegister\(surface\.imageCache, [0-9]+, 2, 2, __csgImgPixels\)/);
    assert.doesNotMatch(result.text, /0xFF3B82F6/);
  }

  {
    // h-full keeps percentage semantics for nested media instead of expanding to viewport height.
    const pngDataUrl = makePngDataUrl(2, 2, [
      0xffff0000,
      0xff00ff00,
      0xff0000ff,
      0xffffffff,
    ]);
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withPngImageChild(facts, pngDataUrl, undefined, "w-full h-full object-cover")),
      { rawPixelDump: true },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /"height", "100%"/);
    assert.doesNotMatch(result.text, /"height", "768px"/);
    assert.doesNotMatch(result.text, /"height", "844px"/);
  }

  {
    // SVG data URLs from static string consts are materialized as explicit paint primitives.
    const svgDataUrl = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg==";
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withSvgConstImageChild(facts, svgDataUrl)),
      { rawPixelDump: true },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /WebPaintRegisterIconStyle/);
    assert.match(result.text, /PaintIconKindSvg/);
    assert.match(result.text, /WebPaintRegisterIconPrimitive/);
    assert.match(result.text, /int32\(0x4D000000\)/);
    assert.doesNotMatch(result.text, /RasterImageCacheRegister/);
  }

  {
    // Relative project SVG assets are resolved from the JSX source file directory.
    const assetProjectRoot = join(tmpDir, "relative-svg-project");
    const assetDir = join(assetProjectRoot, "app", "components");
    mkdirSync(assetDir, { recursive: true });
    writeFileSync(
      join(assetDir, "probe.svg"),
      '<svg width="24" height="24" stroke="#000" opacity=".3" fill="none"><line x1="4" y1="4" x2="20" y2="20"/></svg>',
      "utf8",
    );
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withProjectRoot(
        withPngImageChild(facts, "./probe.svg", { file: "app/components/Card.tsx", line: 10, column: 5 }),
        assetProjectRoot,
      )),
      { rawPixelDump: true },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /WebPaintRegisterIconStyle/);
    assert.match(result.text, /WebPaintRegisterIconPrimitive/);
    assert.match(result.text, /int32\(0x4D000000\)/);
    assert.doesNotMatch(result.text, /RasterImageCacheRegister/);
  }

  assertMaterializerHardFail(
    "unsupported image src",
    renderJsonlFacts(withPngImageChild(facts, "http://example.invalid/image.png")),
    /img src unsupported: remote_image_protocol_unsupported:http:/,
  );

  {
    // Component usage-site children must be substituted into wrapper render roots.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withComponentSlotChild(facts)),
      { rawPixelDump: true },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.counts.elements, 5);
    assert.equal(result.counts.textLiterals, 3);
    assert.match(result.text, /"button"/);
    assert.match(result.text, /"Forwarded"/);
    assert.doesNotMatch(result.text, /"Comp"/);
  }

  {
    // Components with conditional returns must materialize exactly one statically reachable branch.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withConditionalReturnComponent(facts)),
      { rootSource: "src/main.tsx", staticExpressionValues: { isMobile: false } },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /"mobile branch"/);
    assert.doesNotMatch(result.text, /"none branch"/);
    assert.doesNotMatch(result.text, /"desktop branch"/);
  }

  {
    // Source-root routes must use component return semantics before choosing among same-file JSX roots.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withSourceRootConditionalStateComponent(facts)),
      { rootSource: "fixtures/csg-web-materializer-basic/src/SourceStateRoot.tsx" },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /"source prep branch"/);
    assert.doesNotMatch(result.text, /"source live branch"/);
  }

  {
    // Component props can come from owner-scope local object writes with missing JS properties.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withOwnerLocalObjectComponentProp(facts)),
      { rootSource: "src/main.tsx" },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /"policy visible"/);
    assert.doesNotMatch(result.text, /"policy blocked"/);
  }

  {
    // Component props must resolve usage-site expressions from the owning template scope.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withOwnerScopedComponentProp(facts)),
      { rootSource: "src/main.tsx", staticExpressionValues: { showChildGate: true } },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /"owner-scoped child visible"/);
    assert.match(result.text, /"视频"/);
    assert.match(result.text, /"小说"/);
    assert.doesNotMatch(result.text, /"OwnerScopedChild"/);
    assert.doesNotMatch(result.text, /activeOrder\.map/);
  }

  {
    // React child semantics: false/null/undefined/empty string do not render text.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withEmptyReactChildExpressions(facts)),
      { rootSource: "src/main.tsx" },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.doesNotMatch(result.text, /Bio-DID ready for verification/);
    assert.doesNotMatch(result.text, /RWAD balance: 1,234\.567/);
    assert.doesNotMatch(result.text, /Domain registration required/);
    assert.doesNotMatch(result.text, /CreateText\(runtime, "",/);
  }

  {
    // Source-root selection must choose the page-sized JSX subtree, not the first tiny JSX in a file.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withEarlierSmallTemplateInSameSource(facts)),
      { rootSource: "src/main.tsx" },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.counts.elements, 3);
    assert.match(result.text, /"section"/);
    assert.doesNotMatch(result.text, /"thin"/);
  }

  {
    // Mobile route apps render only the active route and wire touch into route state.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withRegionPolicyConditionalChildren(withAddedDomTemplateProp(facts, {
        kind: "attribute",
        ordinal: 999,
        name: "className",
        valueKind: "string",
        value: "bg-gray-50 rounded-xl px-4 flex items-end",
      }))),
      {
        mobileAppExports: true,
        viewport: "390x844",
        mobileInitialRoute: "home_default",
        fontBase64s: materializerSmokeFonts.base64s,
        fontWeights: materializerSmokeFonts.weights,
        fontFamilies: materializerSmokeFonts.families,
        mobileRoutes: [
          { routeId: "home_default", rootSource: "src/main.tsx", staticExpressionValues: { policyGroupId: "INTL", isDomestic: false, peerId: "peer-route", rwadSyncing: false, rwadBalance: 7, rwadNfcReceiveActive: false, rwadNfcReceiveBusy: false, showRwadMigrationHint: false } },
          { routeId: "home_search_open", rootSource: "src/main.tsx" },
          { routeId: "home_sort_open", rootSource: "src/main.tsx" },
          { routeId: "home_channel_manager_open", rootSource: "src/main.tsx" },
          { routeId: "home_content_detail_open", rootSource: "src/main.tsx" },
          { routeId: "tab_messages", rootSource: "src/main.tsx" },
          { routeId: "publish_selector", rootSource: "src/main.tsx" },
        ],
      },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /fn __csg_route_0_root_0/);
    const route0Block = functionBlock(result.text, "__csg_route_0_root_0");
    assert.match(result.text, /境外节点/);
    assert.match(result.text, /RWAD/);
    assert.match(route0Block, /peer-route/);
    assert.match(route0Block, /"7"/);
    assert.match(route0Block, /刷新链上余额/);
    assert.match(route0Block, /NFC 收款/);
    assert.doesNotMatch(route0Block, /国内节点/);
    assert.doesNotMatch(route0Block, /定位中/);
    assert.doesNotMatch(route0Block, /加载中/);
    assert.doesNotMatch(route0Block, /开始接收/);
    assert.doesNotMatch(route0Block, /RWAD 余额已切换/);
    assert.match(result.text, /fn __csg_route_1_root_0/);
    assert.match(result.text, /fn __csg_route_3_root_0/);
    assert.doesNotMatch(result.text, /fn __csg_route_runtime_index\(globalKey: int32\): int32 =/);
    assert.match(result.text, /var __csgMobileFontsLoaded: bool/);
    assert.match(result.text, /fn __csg_mobile_load_font_0\(\): bool =/);
    assert.match(result.text, /fn __csg_mobile_load_font_1\(\): bool =/);
    assert.match(result.text, /fn __csg_mobile_ensure_fonts_loaded\(\): bool =/);
    assert.match(result.text, /if __csgMobileFontsLoaded:\n        return true/);
    assert.match(result.text, /if !__csg_mobile_load_font_0\(\):\n        return false/);
    assert.match(result.text, /WebLayoutSetFontCascade8WeightedFamily\(__csgFontFace_0, __csgFontFace_1, __csgFontFace_2, __csgFontFace_3, __csgFontFace_4, __csgFontFace_5, __csgFontFace_6, __csgFontFace_7, 3, 400, 700, 400, 400, 400, 400, 400, 400, 0, 0, 0, 0, 0, 0, 0, 0\):/);
    {
      const mainBlock = functionBlock(result.text, "main");
      assert.match(mainBlock, /if !__csg_mobile_ensure_fonts_loaded\(\):\n        return \d+/);
      assert.doesNotMatch(mainBlock, /WebFontLoadSfntBase64/);
    }
    assert.match(result.text, /fn __csg_styles_r0_0\(document: var web\.WebDocument, runtime: var react\.ReactRuntime\) =/);
    assert.match(result.text, /fn __csg_styles_r1_0\(document: var web\.WebDocument, runtime: var react\.ReactRuntime\) =/);
    assert.match(result.text, /if __csgMobileRouteIndex == 1:[\s\S]*__csg_styles_r1_0\(document, runtime\)[\s\S]*else:[\s\S]*__csg_styles_r0_0\(document, runtime\)/);
    assert.match(result.text, /let __k_\d+ = \d+\n    if __k_\d+ >= 0 && __k_\d+ < runtime\.elementNodeIds\.len:/);
    assert.match(result.text, /"display", "flex"/);
    assert.match(result.text, /if __csgMobileRouteIndex == 1:[\s\S]*let __csgPaintKey_\d+ = \d+/);
    assert.match(result.text, /__csgMobileRouteIndex = 0/);
    assert.match(result.text, /fn cheng_app_init\(\): uint64 =\n    __csgMobileRendered = false\n    __csgMobileRouteIndex = 0\n    __csgMobileWindowWidth = 390\n    __csgMobileWindowHeight = 844/);
    assert.match(result.text, /__csgMobileWindowWidth = 390/);
    assert.match(result.text, /__csgMobileWindowHeight = 844/);
    assert.doesNotMatch(result.text, /int32\(y\)/);
    assert.match(result.text, /if action != 1:/);
    assert.doesNotMatch(result.text, /action != 0 && action != 1/);
    assert.match(result.text, /"data-csg-route", "home_default"/);
    assert.match(result.text, /"data-csg-route", "tab_messages"/);
    assert.match(result.text, /"data-csg-route", "publish_selector"/);
    assert.match(result.text, /fn __csg_mobile_rebuild_route_targets\(document: var web\.WebDocument\): bool =/);
    assert.match(result.text, /fn __csg_mobile_route_index_for_id\(routeId: str\): int32 =/);
    assert.match(result.text, /fn __csg_mobile_cache_route_hit_map\(document: var web\.WebDocument\): bool =/);
    assert.match(result.text, /fn __csg_mobile_present_cached_route\(\): bool =/);
    assert.match(result.text, /fn __csg_mobile_prewarm_next_route\(\): bool =/);
    assert.match(result.text, /@exportc\("cheng_app_needs_frame"\)/);
    assert.match(result.text, /import cheng\/core\/runtime\/web_scene_runtime as scene/);
    assert.match(result.text, /@importc\("cheng_mobile_host_present_gpu_commands"\)/);
    assert.doesNotMatch(result.text, /@importc\("cheng_mobile_host_present"\)/);
    assert.doesNotMatch(result.text, /fn __csg_mobile_host_present\(/);
    assert.match(result.text, /var __csgMobileGpuCommandBytes: rawbytes\.Bytes/);
    assert.match(result.text, /fn __csg_mobile_pack_i32\(bytes: var rawbytes\.Bytes, byteOffset: int32, value: int32\) =/);
    assert.match(result.text, /scene\.WebSceneEncodeGpuCommandHostBatch\(gpuBuffer, hostGpuBatch\)/);
    assert.match(result.text, /scene\.WebSceneBuildGpuCommandsFromPaintCommands\(__csgPaintCommandBuffer, __csgGpuCommandBuffer\)/);
    assert.match(result.text, /__csg_mobile_host_present_gpu_commands\(__csgMobileGpuCommandBytes\.data, commandCount, scene\.WebSceneGpuHostBatchStrideI32, width, height\)/);
    assert.match(result.text, /@exportc\("cheng_app_debug_gpu_command_count"\)/);
    assert.match(result.text, /@exportc\("cheng_app_debug_gpu_batch_bytes"\)/);
    assert.match(result.text, /@exportc\("cheng_app_debug_gpu_batch_stride"\)/);
    {
      const rasterBlock = functionBlock(result.text, "__csg_dump_raster");
      assert.match(rasterBlock, /scene\.WebScenePaintCommandBufferInit\(__csgPaintCommandBuffer\)/);
      assert.match(rasterBlock, /__csg_mobile_capture_paint_stats\(ops\)[\s\S]*scene\.WebSceneBuildGpuCommandsFromPaintCommands/);
      assert.match(rasterBlock, /__csg_mobile_present_gpu_commands\(__csgGpuCommandBuffer, 390, 844\)/);
      assert.doesNotMatch(rasterBlock, /RasterPaintOps/);
      assert.doesNotMatch(rasterBlock, /RasterDrawImageImpl/);
      assert.doesNotMatch(rasterBlock, /__csg_mobile_present_surface/);
    }
    assert.match(result.text, /if __csgMobileSuppressPresent:\n        return true/);
    assert.doesNotMatch(result.text, /if __csgMobilePrewarmLastStatus == 0 && __csg_mobile_has_pending_route_prewarm\(\):/);
    assert.match(result.text, /var __csgMobileRouteFrameBytes: rawbytes\.Bytes/);
    assert.match(result.text, /var __csgMobileRouteFrameReadyBytes: rawbytes\.Bytes/);
    assert.doesNotMatch(result.text, /rawbytes\.BytesCopyRangeInto\(__csgMobileRouteFrameBytes, cacheOffset, __csgMobileFrameBytes, 0, __csgMobileRouteCacheFrameBytes\)/);
    assert.doesNotMatch(result.text, /rawbytes\.BytesSet\(__csgMobileRouteFrameReadyBytes, routeReadyIndex, 1\)/);
    assert.doesNotMatch(result.text, /rawbytes\.BytesCopyRangeInto\(__csgMobileFrameBytes, 0, __csgMobileRouteFrameBytes, cacheOffset, frameBytes\)/);
    assert.doesNotMatch(result.text, /if __csg_mobile_present_cached_route\(\):\n        __csgMobileLastMainStatus = 0\n        __csgMobileRendered = true\n        return/);
    assert.match(result.text, /@exportc\("cheng_app_debug_route_frame_ready"\)/);
    assert.match(result.text, /fn __csg_mobile_apply_hit_route\(xMilli: int32, yMilli: int32\): bool =/);
    assert.match(result.text, /if __csg_mobile_apply_cached_hit_route\(xMilli, yMilli\):\n        return true/);
    assert.match(result.text, /if yPx >= 759600:[\s\S]*return __csg_mobile_apply_route\("tab_profile"\)[\s\S]*if __csg_mobile_apply_hit_route\(xMilli, yMilli\):\n        return true/);
    assert.doesNotMatch(result.text, /if __csg_mobile_apply_hit_route\(xMilli, yMilli\):\n        return true[\s\S]{0,600}if yPx >= 759600:/);
    assert.match(result.text, /rawbytes\.BytesSet\(bytes, byteOffset, value & 255\)/);
    assert.match(result.text, /rawbytes\.BytesSet\(bytes, byteOffset \+ 3, \(value >> 24\) & 255\)/);
    assert.doesNotMatch(result.text, /__csgMobileFrameBytes/);
    assert.match(result.text, /panic\("cheng_app_on_touch float ABI is disabled/);
    assert.match(result.text, /@exportc\("cheng_app_on_touch_milli"\)/);
    assert.match(result.text, /if routeId == "home_search_open":\n        return 1/);
    assert.match(result.text, /if routeId == "home_sort_open":\n        return 2/);
    assert.match(result.text, /if routeId == "home_channel_manager_open":\n        return 3/);
    assert.match(result.text, /if routeId == "home_content_detail_open":\n        return 4/);
    assert.match(result.text, /let nextRoute = __csg_mobile_route_index_for_id\(routeId\)\n    if nextRoute < 0:\n        return false\n    return __csg_mobile_set_route_index\(nextRoute\)/);
    assert.match(result.text, /return __csg_mobile_apply_route\("tab_messages"\)/);
    assert.match(result.text, /if __csg_mobile_handle_touch_milli\(action, xMilli, yMilli\):\n        __csgMobileRendered = false/);
  }

  {
    // Publish mobile routes inject route-specific content kind props before materializing JSX text.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withPublishContentKindExpressionChildren(facts)),
      {
        mobileAppExports: true,
        viewport: "390x844",
        mobileInitialRoute: "publish_content",
        mobileRoutes: [
          { routeId: "publish_content", rootSource: "src/main.tsx" },
          { routeId: "publish_movie", rootSource: "src/main.tsx" },
          { routeId: "publish_graphic", rootSource: "src/main.tsx" },
          { routeId: "publish_music", rootSource: "src/main.tsx" },
          { routeId: "publish_novel", rootSource: "src/main.tsx" },
        ],
      },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /视频/);
    assert.match(result.text, /电影/);
    assert.match(result.text, /图文/);
    assert.match(result.text, /音乐/);
    assert.match(result.text, /小说/);
    assert.match(result.text, /音频/);
    assert.match(result.text, /图片/);
    assert.match(result.text, /文稿/);
    assert.match(result.text, /image\/\*/);
    assert.match(result.text, /audio\/\*/);
    assert.doesNotMatch(result.text, /contentKindLabel/);
    assert.doesNotMatch(result.text, /fileLabelForContentPublishKind/);
  }

  {
    // Headless mobile raw-pixel oracle must not require Android host render symbols.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(facts),
      {
        mobileAppExports: true,
        rawPixelDump: true,
        viewport: "390x844",
        mobileInitialRoute: "home_default",
        mobileRoutes: [
          { routeId: "home_default", rootSource: "src/main.tsx" },
          { routeId: "tab_messages", rootSource: "src/main.tsx" },
        ],
      },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.doesNotMatch(result.text, /@importc\("cheng_mobile_host_present_gpu_commands"\)/);
    assert.doesNotMatch(result.text, /__csg_mobile_host_present_gpu_commands\(/);
    assert.match(result.text, /raster\.RasterPaintOps\(surface, ops\)/);
    assert.match(result.text, /---CHENG_SCREENSHOT_DUMP---/);
    assert.match(result.text, /raster\.WebRasterDumpPixels\(surface\)/);
    assert.doesNotMatch(result.text, /__csg_mobile_present_gpu_commands\(__csgGpuCommandBuffer, 390, 844\)/);
  }

  {
    // Mobile scene facts precompile route graph, node tree, props, layout, paint, and resources into CSGC.
    const scenePngDataUrl = makePngDataUrl(2, 2, [
      0xff010203,
      0xff040506,
      0xff070809,
      0xff0a0b0c,
    ]);
    const sceneFactsInput = withLucideIconChildren(withDefaultMediaContentChildren(withPngImageChild(withRegionPolicyConditionalChildren(withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 999,
      name: "className",
      valueKind: "string",
      value: "bg-gray-50 rounded-xl px-4 flex items-end",
    })), scenePngDataUrl), defaultMobileRouteContents()));
    const scene = emitCsgWebSceneFactsFromFactArray(sceneFactsInput, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      fontBase64s: materializerSmokeFonts.base64s,
      fontWeights: materializerSmokeFonts.weights,
      fontFamilies: materializerSmokeFonts.families,
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx", staticExpressionValues: { policyGroupId: "INTL", isDomestic: false, peerId: "peer-route", rwadSyncing: false, rwadBalance: 7, rwadNfcReceiveActive: false, rwadNfcReceiveBusy: false, showRwadMigrationHint: false } },
        { routeId: "home_search_open", rootSource: "src/main.tsx" },
        { routeId: "home_sort_open", rootSource: "src/main.tsx" },
        { routeId: "home_channel_manager_open", rootSource: "src/main.tsx" },
        { routeId: "home_content_detail_open_truth_content", rootSource: "src/main.tsx" },
        { routeId: "home_image_detail_open_truth_image_content", rootSource: "src/main.tsx" },
        { routeId: "tab_messages", rootSource: "src/main.tsx" },
        { routeId: "publish_selector", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.counts.routes, 8);
    assert.equal(scene.counts.inputFacts, sceneFactsInput.length);
    assert.equal(scene.counts.nodes > 0, true);
    assert.equal(scene.counts.props > 0, true);
    assert.equal(scene.counts.styles > 0, true);
    assert.equal(scene.counts.layouts > 0, true);
    assert.equal(scene.counts.paints > 0, true);
    assert.equal(scene.counts.textLiterals > 0, true);
    assert.equal(scene.counts.layers, 16);
    assert.equal(scene.counts.routeEdges >= 3, true);
    assert.equal(scene.counts.routeHitRects > 0, true);
    assert.equal(scene.counts.hitTargets > 0, true);
    assert.equal(scene.counts.mediaAssets >= 2, true);
    assert.equal(scene.counts.mediaPlaybackSlots >= 2, true);
    assert.equal(scene.counts.mediaControlActions >= 11, true);
    assert.equal(scene.counts.resources >= 2, true);
    assert.equal(scene.facts[0]?.kind, "csg.web.scene.schema");
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "home_default" && fact.width === 390 && fact.height === 844), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.node" && fact.routeId === "home_default" && fact.nodeKind === "element"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.style" && fact.propName === "display" && fact.propValue === "flex"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.layout" && fact.propName === "padding-left" && fact.propValue === "16px"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "fill" && fact.color === "0xFFF9FAFB"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "text" && fact.text.length > 0), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "svg_icon" && fact.resourceId === "Plus" && Array.isArray(fact.data)), true);
    const playSvgPaint = scene.facts.find((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "svg_icon" && fact.resourceId === "Play.fill-current");
    assert.equal(Array.isArray(playSvgPaint?.data), true, "filled Play icon must carry SVG primitive data");
    assert.equal(playSvgPaint.data.length, 4, "filled Play icon must carry one fill triangle plus three stroke lines");
    assert.equal(playSvgPaint.data.some((primitive) => primitive.kind === "Triangle"), true, "filled Play icon must materialize a triangle primitive");
    assert.equal(playSvgPaint.data.filter((primitive) => primitive.kind === "Line").length, 3, "filled Play icon must preserve stroke outline lines");
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "image" && String(fact.resourceId).startsWith("image.")), true);
	    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.propName === "data-csg-route" && fact.propValue === "tab_messages"), true);
	    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.hit_target" && fact.targetKind === "route" && fact.targetRouteId === "tab_messages"), true);
	    assert.equal(scene.facts.some((fact) =>
	      fact.kind === "csg.web.scene.event_handler" &&
	      fact.eventName === "click" &&
	      fact.actionKind === "command" &&
	      fact.stateRef === "rwadNfcReceiveActive" &&
	      fact.effect === "rwad_nfc_receive_toggle:peerId:wallets:rwadNfcReceiveActive:rwadNfcReceiveBusy:rwadNfcReceiveExpiresAt:rwadSyncHint" &&
	      String(fact.handler ?? "").replace(/\s+/g, " ").trim() === "() => { void handleToggleRwadNfcReceive(); }"
	    ), true);
	    assert.equal(scene.facts.some((fact) =>
	      fact.kind === "csg.web.scene.event_handler" &&
	      String(fact.effect ?? "").includes("invoke:handleToggleRwadNfcReceive")
	    ), false);
	    assert.equal(JSON.stringify(scene.facts).includes(placeholderDefaultVideoCidPrefix), false);
    const mediaAsset = scene.facts.find((fact) => fact.kind === "csg.web.media_asset" && fact.assetCid === expectedDefaultVideoAssetCid);
    assertSceneMediaAssetShape(mediaAsset, "video");
    assert.equal(mediaAsset?.bundleCid, expectedDefaultVideoBundleCid);
    assert.equal(mediaAsset?.posterCid, expectedDefaultVideoPosterCid);
    assert.equal(mediaAsset?.initSegmentCid, expectedDefaultVideoInitSegmentCid);
    assert.equal(mediaAsset?.keyframeIndex, "mp4:mdat=821:first=829");
    assert.equal(mediaAsset?.transport, "moq");
    assert.equal(mediaAsset?.fecScheme, "lt_xor_v1:experimental");
    assert.equal(mediaAsset?.kindCode, 1);
    assert.equal(mediaAsset?.objectCount, 2);
    assert.equal(mediaAsset?.dropletCount, 3);
    const videoSlot = assertSceneMediaSlotAndActions(scene.facts, mediaAsset, ["OpenAsset", "Play", "Pause", "Seek", "EditAsset", "PublishAsset", "ShareAsset"], "video");
    assert.equal(videoSlot?.manifestCid, expectedDefaultVideoManifestCid);
    assert.equal(videoSlot?.providerKind, "media-decode-provider");
    assert.equal(videoSlot?.decodeProvider, "macos-videotoolbox-codec-provider");
    assert.equal(videoSlot?.textureProvider, "metal-surface-texture-provider");
    assert.equal(videoSlot?.objectFit, "cover");
    const defaultVideoPosterPayloads = defaultMobileRouteMediaPayloadAssetsForFacts([{
      kind: "csg.web.media_asset",
      id: "csg.web.media_asset.video-poster-smoke",
      assetCid: expectedDefaultVideoAssetCid,
      posterCid: expectedDefaultVideoPosterCid,
      mime: "video/mp4",
      kindCode: 1,
    }]);
    const defaultVideoPosterPayload = defaultVideoPosterPayloads.find((payload) => payload.role === "poster" && payload.assetCid === expectedDefaultVideoPosterCid);
    assert(defaultVideoPosterPayload, "video media surface must write its poster PNG payload asset");
    assert.equal(defaultVideoPosterPayload?.relPath, `runtime/media/assets/${expectedDefaultVideoPosterCid}.png`);
    assert.equal(defaultVideoPosterPayload?.mime, "image/png");
    const imageAsset = scene.facts.find((fact) => fact.kind === "csg.web.media_asset" && fact.kindCode === 2 && fact.mime === "image/png");
    assertSceneMediaAssetShape(imageAsset, "image");
    assert.equal(imageAsset?.codec, "png");
    assert.equal(imageAsset?.keyframeIndex, "image:png:single-frame");
    const imageSlot = assertSceneMediaSlotAndActions(scene.facts, imageAsset, ["OpenAsset", "EditAsset", "PublishAsset", "ShareAsset"], "image");
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.media_control_action" && fact.slotId === imageSlot?.slotId && (fact.actionKind === "Play" || fact.actionKind === "Pause" || fact.actionKind === "Seek")), false, "image media slot must not expose playback timeline actions");
    assert.equal(imageSlot?.decodeProvider, "image-raster-provider");
    assert.equal(imageSlot?.textureProvider, "surface-texture-provider");
    assert.equal(imageSlot?.audioProvider, "none");
    assert.equal(imageSlot?.objectFit, "cover");
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "home_image_detail_open_truth_image_content"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.route_edge" && fact.routeId === "home_default" && fact.targetRouteId === "home_image_detail_open_truth_image_content"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.hit_target" && fact.routeId === "home_default" && fact.targetKind === "route" && fact.targetRouteId === "home_image_detail_open_truth_image_content"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.media_asset" && fact.kindCode === 3 && fact.mime === "audio/wav"), false);
    const defaultAudioPosterBytes = readFileSync(join(packageDir, "fixtures", "media", "unimaker-default-image.png"));
    const defaultAudioPosterCid = createHash("sha256").update(defaultAudioPosterBytes).digest("hex");
    const audioPosterPayloads = defaultMobileRouteMediaPayloadAssetsForFacts([{
      kind: "csg.web.media_asset",
      id: "csg.web.media_asset.audio-poster-smoke",
      assetCid: "0".repeat(64),
      posterCid: defaultAudioPosterCid,
      mime: "audio/wav",
      kindCode: 3,
    }]);
    const audioPosterPayload = audioPosterPayloads.find((payload) => payload.role === "poster" && payload.assetCid === defaultAudioPosterCid);
    assert(audioPosterPayload, "audio media surface must write its poster PNG payload asset");
    assert.equal(audioPosterPayload?.relPath, `runtime/media/assets/${defaultAudioPosterCid}.png`);
    assert.equal(audioPosterPayload?.mime, "image/png");

    const audioSceneInput = withDefaultMediaContentChildren(withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 1001,
      name: "className",
      valueKind: "string",
      value: "bg-gray-50 rounded-xl px-4 flex items-end",
    }), [defaultMobileRouteMusicContent()]);
    const audioScene = emitCsgWebSceneFactsFromFactArray(audioSceneInput, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      fontBase64s: materializerSmokeFonts.base64s,
      fontWeights: materializerSmokeFonts.weights,
      fontFamilies: materializerSmokeFonts.families,
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(audioScene.diagnostics, []);
    const audioAsset = audioScene.facts.find((fact) => fact.kind === "csg.web.media_asset" && fact.kindCode === 3 && fact.mime === "audio/wav");
    assertSceneMediaAssetShape(audioAsset, "audio");
    assert.equal(audioAsset?.codec, "pcm_s16le");
    assert.equal(audioAsset?.keyframeIndex, "audio:wav:pcm16:seek:0");
    const audioSlot = assertSceneMediaSlotAndActions(audioScene.facts, audioAsset, ["OpenAsset", "Play", "Pause", "Seek", "EditAsset", "PublishAsset", "ShareAsset"], "audio");
    assert.equal(audioSlot?.decodeProvider, "audio-codec-provider");
    assert.equal(audioSlot?.textureProvider, "surface-texture-provider");
    assert.equal(audioSlot?.audioProvider, "coreaudio-output-provider");
    assert.equal(audioSlot?.objectFit, "cover");
    const audioPayloads = defaultMobileRouteMediaPayloadAssetsForFacts(audioScene.facts);
    const audioPayload = audioPayloads.find((payload) => payload.role === "asset" && payload.kind === "music" && payload.mime === "audio/wav");
    assert(audioPayload, "audio media facts must write a WAV payload asset");
    assert.equal(audioPayload?.assetCid, audioAsset?.assetCid, "audio payload CID must match CSG media asset");
    assert.equal(audioPayload?.relPath, `runtime/media/assets/${audioAsset?.assetCid}.wav`);
    assert.equal(createHash("sha256").update(audioPayload?.bytes ?? Buffer.alloc(0)).digest("hex"), audioAsset?.assetCid);
    assertPcm16WavPayload(audioPayload?.bytes, "audio media");
    const audioCoverPayload = audioPayloads.find((payload) => payload.role === "poster" && payload.assetCid === audioAsset?.posterCid);
    assert(audioCoverPayload, "audio media facts must write a PNG cover payload asset");
    assert.equal(audioCoverPayload?.mime, "image/png");

    assertHomeMediaSlotsStayInMasonryAndDetailVideoCanFullscreen(scene.facts, { requireDetailFullscreen: false });
    const homeNodesByTemplate = new Map(scene.facts
      .filter((fact) => fact.kind === "csg.web.scene.node" && fact.routeId === "home_default")
      .map((fact) => [String(fact.id), fact]));
    const homeMediaSlots = scene.facts.filter((fact) =>
      fact.kind === "csg.web.media_playback_slot" &&
      homeNodesByTemplate.has(String(fact.nodeTemplate))
    );
    assert.equal(homeMediaSlots.length, 2);
    assert.equal(homeMediaSlots.some((slot) => homeNodesByTemplate.get(String(slot.nodeTemplate))?.parentNodeId === 0), false);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.layer" && fact.routeId === "home_default" && fact.name === "fixed"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.route_edge" && fact.targetRouteId === "tab_messages"), true);
    const tabMessagesHitRect = scene.facts.find((fact) => fact.kind === "csg.web.scene.route_hit_rect" && fact.routeId === "home_default" && fact.targetRouteId === "tab_messages");
    assert.equal(tabMessagesHitRect?.x, 78);
    assert.equal(tabMessagesHitRect?.y, 760);
    assert.equal(tabMessagesHitRect?.width, 78);
    assert.equal(tabMessagesHitRect?.height, 84);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.resource" && fact.resourceKind === "font_subset" && fact.fontWeight === 700), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.resource" && fact.resourceKind === "svg_icon" && fact.resourceId === "Plus"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.resource" && fact.resourceKind === "png_image_data" && String(fact.resourceId).startsWith("image.")), true);
    const scenePngResource = scene.facts.find((fact) => fact.kind === "csg.web.scene.resource" && fact.resourceKind === "png_image_data" && String(fact.resourceId).startsWith("image."));
    assert.equal(scenePngResource?.width, 2);
    assert.equal(scenePngResource?.height, 2);
    assert.equal(scenePngResource?.pixelCount, 4);
    assert.equal(Array.isArray(scenePngResource?.pixels), true);
    assert.equal(((scenePngResource?.pixels?.[3] ?? 0) >>> 0), 0xff0a0b0c);

    const { factsBuffer, stats } = csgcWriteFacts(scene.facts);
    assert.equal(stats.factCount, scene.facts.length);
    assert.equal("version" in stats, false);
    assert.equal(stats.flags, 0);
    assert.equal(factsBuffer.includes(Buffer.from("\"kind\":\"csg.web.scene.node\"", "utf8")), false);
    const roundtrip = csgcReadFacts(factsBuffer);
    assert.equal("version" in roundtrip.header, false);
    assert.equal(roundtrip.header.headerSize, 64);
    assert.equal(roundtrip.header.factCount, scene.facts.length);
    assert.equal(roundtrip.facts.length, scene.facts.length);
    const { factsBuffer: reorderedFactsBuffer, stats: reorderedStats } =
      csgcWriteFacts([...scene.facts].reverse());
    assert.equal(reorderedStats.factCount, scene.facts.length);
    assert.equal("version" in reorderedStats, false);
    assert.equal(reorderedStats.flags, 0);
    assert.equal(reorderedFactsBuffer.equals(factsBuffer), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "publish_selector"), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.layer" && fact.routeId === "home_default" && fact.name === "content"), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.node" && fact.routeId === "home_default" && typeof fact.layerId === "number"), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.style" && fact.propName === "padding-left" && fact.propValue === "16px"), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.layout" && fact.propName === "padding-left" && fact.propValue === "16px"), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "fill" && fact.color === "0xFFF9FAFB" && typeof fact.radius === "number" && fact.radius > 0), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "fill" && fact.radius >= 12), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "svg_icon" && fact.resourceId === "Plus" && Array.isArray(fact.data)), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "svg_icon" && fact.resourceId === "Play.fill-current" && Array.isArray(fact.data) && fact.data.length === 4 && fact.data.some((primitive) => primitive.kind === "Triangle") && fact.data.filter((primitive) => primitive.kind === "Line").length === 3), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "image" && String(fact.resourceId).startsWith("image.")), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.node" && typeof fact.className === "string" && fact.className.includes("bg-gray-50")), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.route_edge" && fact.targetRouteId === "publish_selector"), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.route_hit_rect" && fact.targetRouteId === "tab_messages" && fact.x === 78 && fact.y === 760), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.hit_target" && fact.targetKind === "route" && fact.targetRouteId === "tab_messages"), true);
    assert.equal(JSON.stringify(roundtrip.facts).includes(placeholderDefaultVideoCidPrefix), false);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.media_asset" && fact.assetCid === expectedDefaultVideoAssetCid && fact.bundleCid === expectedDefaultVideoBundleCid && fact.objectCount === 2 && fact.dropletCount === 3), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.media_playback_slot" && fact.assetCid === expectedDefaultVideoAssetCid && fact.manifestCid === expectedDefaultVideoManifestCid && String(fact.nodeTemplate ?? "").startsWith("csg.web.scene.node.")), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.media_control_action" && fact.actionKind === "Pause" && fact.payloadSchema === "unimaker.media.lifecycle.runtime.v1"), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.media_asset" && fact.kindCode === 2 && fact.mime === "image/png" && fact.keyframeIndex === "image:png:single-frame"), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.media_asset" && fact.kindCode === 3 && fact.mime === "audio/wav"), false);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.media_control_action" && fact.actionKind === "ShareAsset" && fact.guard === `assetCid:${imageAsset?.assetCid}`), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.media_control_action" && fact.actionKind === "EditAsset" && fact.guard === `assetCid:${imageAsset?.assetCid}`), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.media_control_action" && fact.actionKind === "PublishAsset" && fact.guard === `assetCid:${mediaAsset?.assetCid}`), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.media_control_action" && fact.actionKind === "Seek" && fact.guard === `assetCid:${mediaAsset?.assetCid}`), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.resource" && fact.resourceKind === "png_image_data" && String(fact.resourceId).startsWith("image.")), true);
    const roundtripPngResource = roundtrip.facts.find((fact) => fact.kind === "csg.web.scene.resource" && fact.resourceKind === "png_image_data" && String(fact.resourceId).startsWith("image."));
    assert.equal(roundtripPngResource?.width, 2);
    assert.equal(roundtripPngResource?.height, 2);
    assert.equal(roundtripPngResource?.pixelCount, 4);
    assert.equal(Array.isArray(roundtripPngResource?.pixels), true);
    assert.equal(((roundtripPngResource?.pixels?.[3] ?? 0) >>> 0), 0xff0a0b0c);
    const compressedRoundtripPngResource = compressedRoundtrip.facts.find((fact) => fact.kind === "csg.web.scene.resource" && fact.resourceKind === "png_image_data" && String(fact.resourceId).startsWith("image."));
    assert.equal(compressedRoundtrip.facts.some((fact) => fact.kind === "csg.web.scene.route" && fact.routeId === "home_default"), true);
    assert.equal(compressedRoundtrip.facts.some((fact) => fact.kind === "csg.web.scene.style" && fact.propName === "padding-left" && fact.propValue === "16px"), true);
    assert.equal(compressedRoundtrip.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "svg_icon" && fact.resourceId === "Plus" && Array.isArray(fact.data)), true);
    assert.equal(compressedRoundtrip.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "svg_icon" && fact.resourceId === "Play.fill-current" && Array.isArray(fact.data) && fact.data.length === 4 && fact.data.some((primitive) => primitive.kind === "Triangle") && fact.data.filter((primitive) => primitive.kind === "Line").length === 3), true);
    assert.equal(compressedRoundtrip.facts.some((fact) => fact.kind === "csg.web.scene.route_edge" && fact.targetRouteId === "tab_messages"), true);
    assert.equal(compressedRoundtrip.facts.some((fact) => fact.kind === "csg.web.scene.route_hit_rect" && fact.targetRouteId === "tab_messages" && fact.width === 78 && fact.height === 84), true);
    assert.equal(compressedRoundtrip.facts.some((fact) => fact.kind === "csg.web.scene.hit_target" && fact.targetKind === "route" && fact.targetRouteId === "tab_messages"), true);
    assert.equal(JSON.stringify(compressedRoundtrip.facts).includes(placeholderDefaultVideoCidPrefix), false);
    assert.equal(compressedRoundtrip.facts.some((fact) => fact.kind === "csg.web.media_asset" && fact.assetCid === expectedDefaultVideoAssetCid && fact.initSegmentCid === expectedDefaultVideoInitSegmentCid && Number(fact.initSegmentByteLength ?? 0) > 0), true);
    assert.equal(compressedRoundtrip.facts.some((fact) => fact.kind === "csg.web.media_playback_slot" && fact.decodeProvider === "macos-videotoolbox-codec-provider"), true);
    assert.equal(compressedRoundtrip.facts.some((fact) => fact.kind === "csg.web.media_control_action" && fact.actionKind === "Seek"), true);
    assert.equal(compressedRoundtrip.facts.some((fact) => fact.kind === "csg.web.media_asset" && fact.kindCode === 2 && fact.mime === "image/png" && hex64Pattern.test(String(fact.assetCid ?? ""))), true);
    assert.equal(compressedRoundtrip.facts.some((fact) => fact.kind === "csg.web.media_asset" && fact.kindCode === 3 && fact.mime === "audio/wav"), false);
    assert.equal(compressedRoundtripPngResource?.pixelCount, 4);
    assert.equal(Array.isArray(compressedRoundtripPngResource?.pixels), true);
    assert.equal(((compressedRoundtripPngResource?.pixels?.[3] ?? 0) >>> 0), 0xff0a0b0c);
    const openLifecycleEvent = {
      kind: "csg.web.media_lifecycle_event",
      id: "media.lifecycle.open.default-video",
      eventKind: "OpenAsset",
      eventCid: "open-event-cid",
      slotId: String(videoSlot?.slotId ?? ""),
      assetCid: expectedDefaultVideoAssetCid,
      bundleCid: expectedDefaultVideoBundleCid,
      manifestCid: expectedDefaultVideoManifestCid,
      kindCode: 1,
      payloadSchema: "unimaker.media.lifecycle.runtime.v1",
      payload: expectedDefaultVideoManifestCid,
      transport: "moq",
      dispatch: "event-queue",
      guard: `assetCid:${expectedDefaultVideoAssetCid}`,
      sourceStateCode: 0,
      resultStateCode: 1,
      statusCode: 1,
      objectCount: Number(mediaAsset?.objectCount ?? 0),
      dropletCount: Number(mediaAsset?.dropletCount ?? 0),
      trace: "media-lifecycle-event",
    };
    const lifecycleEvent = {
      kind: "csg.web.media_lifecycle_event",
      id: "media.lifecycle.publish.default-video",
      eventKind: "PublishAsset",
      eventCid: "publish-event-cid",
      slotId: String(videoSlot?.slotId ?? ""),
      assetCid: expectedDefaultVideoAssetCid,
      bundleCid: expectedDefaultVideoBundleCid,
      manifestCid: expectedDefaultVideoManifestCid,
      kindCode: 1,
      payloadSchema: "unimaker.media.lifecycle.runtime.v1",
      payload: expectedDefaultVideoAssetCid,
      transport: "moq",
      dispatch: "event-queue",
      guard: `assetCid:${expectedDefaultVideoAssetCid}`,
      sourceStateCode: 4,
      resultStateCode: 6,
      statusCode: 1,
      objectCount: Number(mediaAsset?.objectCount ?? 0),
      dropletCount: Number(mediaAsset?.dropletCount ?? 0),
      trace: "media-lifecycle-event",
    };
    const lifecycleRoundtrip = csgcReadFacts(
      csgcWriteFacts([csgCoreSchemaFact, openLifecycleEvent, lifecycleEvent]).factsBuffer,
    );
    assert.deepEqual(lifecycleRoundtrip.facts[0], openLifecycleEvent);
    assert.deepEqual(lifecycleRoundtrip.facts[1], lifecycleEvent);
    const frameReceipt = {
      kind: "csg.web.media_frame_receipt",
      id: "media.frame.default-video",
      receiptKind: "Frame",
      slotId: String(videoSlot?.slotId ?? ""),
      assetCid: expectedDefaultVideoAssetCid,
      manifestCid: expectedDefaultVideoManifestCid,
      kindCode: 1,
      firstFrameCid: expectedDefaultVideoPosterCid,
      firstImageCid: "",
      firstAudioCid: "",
      audioDataCid: "",
      bytesReady: 68,
      initSegmentCid: "",
      initBytesReady: 0,
      sourceCode: 1,
      verified: true,
      textureProvider: "metal-surface-texture-provider",
      textureHandle: "42",
      textureReady: true,
      decodedWidth: 390,
      decodedHeight: 844,
      pixelFormat: 111,
      pixelBufferHandle: "0",
      audioProvider: "",
      sampleRateHz: 0,
      channelCount: 0,
      bitsPerSample: 0,
      pcmDataOffset: 0,
      pcmDataBytes: 0,
      startedAtMs: "1000",
      elapsedMs: "16",
      openToMediaMs: "26",
      trace: "platform-decode->surface-frame-receipt",
    };
    const frameReceiptIdentity = {
      kind: "csg.web.media_receipt_identity",
      id: "media.receipt.default-video",
      receiptFactId: frameReceipt.id,
      receiptCid: "frame-default-video-receipt-cid",
      receiptKind: frameReceipt.receiptKind,
      slotId: frameReceipt.slotId,
      assetCid: frameReceipt.assetCid,
      manifestCid: frameReceipt.manifestCid,
      trace: frameReceipt.trace,
    };
    const frameReceiptRoundtrip = csgcReadFacts(
      csgcWriteFacts([csgCoreSchemaFact, frameReceipt, frameReceiptIdentity]).factsBuffer,
    );
    assert.deepEqual(frameReceiptRoundtrip.facts[0], frameReceipt);
    assert.deepEqual(frameReceiptRoundtrip.facts[1], frameReceiptIdentity);
    const videoDeliveryBytes = Number(mediaAsset?.initSegmentByteLength ?? 0);
    assert(videoDeliveryBytes > 0, "video delivery bytes must come from initSegmentByteLength");
    const deliveryReceipt = {
      kind: "csg.web.media_delivery_receipt",
      id: "media.delivery.default-video",
      receiptCid: "delivery-default-video-receipt-cid",
      receiptKind: "RemoteFrame",
      slotId: String(videoSlot?.slotId ?? ""),
      assetCid: expectedDefaultVideoAssetCid,
      bundleCid: expectedDefaultVideoBundleCid,
      manifestCid: expectedDefaultVideoManifestCid,
      kindCode: 1,
      transport: "moq",
      publishEventCid: lifecycleEvent.eventCid,
      openEventCid: openLifecycleEvent.eventCid,
      firstMediaCid: expectedDefaultVideoInitSegmentCid,
      sourceCode: 2,
      announcedBytes: 512,
      transferredBytes: videoDeliveryBytes,
      bytesReady: videoDeliveryBytes,
      objectCount: Number(mediaAsset?.objectCount ?? 0),
      dropletCount: Number(mediaAsset?.dropletCount ?? 0),
      remoteFetchMs: "18",
      openToMediaMs: "26",
      budgetMs: "1000",
      statusCode: 1,
      verified: true,
      guard: `assetCid:${expectedDefaultVideoAssetCid}`,
      trace: "open->remote-frame-delivery",
    };
    const imageOpenLifecycleEvent = {
      ...openLifecycleEvent,
      id: "media.lifecycle.open.default-image",
      eventCid: "open-image-event-cid",
      slotId: String(imageSlot?.slotId ?? ""),
      assetCid: String(imageAsset?.assetCid ?? ""),
      bundleCid: String(imageAsset?.bundleCid ?? ""),
      manifestCid: String(imageSlot?.manifestCid ?? ""),
      kindCode: 2,
      payload: String(imageSlot?.manifestCid ?? ""),
      objectCount: Number(imageAsset?.objectCount ?? 0),
      dropletCount: Number(imageAsset?.dropletCount ?? 0),
      guard: `assetCid:${imageAsset?.assetCid}`,
    };
    const imagePublishLifecycleEvent = {
      ...lifecycleEvent,
      id: "media.lifecycle.publish.default-image",
      eventCid: "publish-image-event-cid",
      slotId: String(imageSlot?.slotId ?? ""),
      assetCid: String(imageAsset?.assetCid ?? ""),
      bundleCid: String(imageAsset?.bundleCid ?? ""),
      manifestCid: String(imageSlot?.manifestCid ?? ""),
      kindCode: 2,
      payload: String(imageAsset?.assetCid ?? ""),
      objectCount: Number(imageAsset?.objectCount ?? 0),
      dropletCount: Number(imageAsset?.dropletCount ?? 0),
      guard: `assetCid:${imageAsset?.assetCid}`,
    };
    const audioOpenLifecycleEvent = {
      ...openLifecycleEvent,
      id: "media.lifecycle.open.default-audio",
      eventCid: "open-audio-event-cid",
      slotId: String(audioSlot?.slotId ?? ""),
      assetCid: String(audioAsset?.assetCid ?? ""),
      bundleCid: String(audioAsset?.bundleCid ?? ""),
      manifestCid: String(audioSlot?.manifestCid ?? ""),
      kindCode: 3,
      payload: String(audioSlot?.manifestCid ?? ""),
      objectCount: Number(audioAsset?.objectCount ?? 0),
      dropletCount: Number(audioAsset?.dropletCount ?? 0),
      guard: `assetCid:${audioAsset?.assetCid}`,
    };
    const audioPublishLifecycleEvent = {
      ...lifecycleEvent,
      id: "media.lifecycle.publish.default-audio",
      eventCid: "publish-audio-event-cid",
      slotId: String(audioSlot?.slotId ?? ""),
      assetCid: String(audioAsset?.assetCid ?? ""),
      bundleCid: String(audioAsset?.bundleCid ?? ""),
      manifestCid: String(audioSlot?.manifestCid ?? ""),
      kindCode: 3,
      payload: String(audioAsset?.assetCid ?? ""),
      objectCount: Number(audioAsset?.objectCount ?? 0),
      dropletCount: Number(audioAsset?.dropletCount ?? 0),
      guard: `assetCid:${audioAsset?.assetCid}`,
    };
    const imageDeliveryBytes = mediaAssetContentByteLength(imageAsset);
    const imageDeliveryReceipt = {
      kind: "csg.web.media_delivery_receipt",
      id: "media.delivery.default-image",
      receiptCid: "delivery-default-image-receipt-cid",
      receiptKind: "RemoteImage",
      slotId: String(imageSlot?.slotId ?? ""),
      assetCid: String(imageAsset?.assetCid ?? ""),
      bundleCid: String(imageAsset?.bundleCid ?? ""),
      manifestCid: String(imageSlot?.manifestCid ?? ""),
      kindCode: 2,
      transport: "moq",
      publishEventCid: "publish-image-event-cid",
      openEventCid: "open-image-event-cid",
      firstMediaCid: String(imageAsset?.assetCid ?? ""),
      sourceCode: 4,
      announcedBytes: imageDeliveryBytes,
      transferredBytes: imageDeliveryBytes,
      bytesReady: imageDeliveryBytes,
      objectCount: Number(imageAsset?.objectCount ?? 0),
      dropletCount: Number(imageAsset?.dropletCount ?? 0),
      remoteFetchMs: "19",
      openToMediaMs: "20",
      budgetMs: "1000",
      statusCode: 1,
      verified: true,
      guard: `assetCid:${imageAsset?.assetCid}`,
      trace: "open->remote-image-delivery",
    };
    const audioDeliveryBytes = mediaAssetContentByteLength(audioAsset);
    assert.equal(audioDeliveryBytes, audioPayload?.bytes?.length, "audio delivery bytes must match the WAV payload length");
    const audioDeliveryReceipt = {
      kind: "csg.web.media_delivery_receipt",
      id: "media.delivery.default-audio",
      receiptCid: "delivery-default-audio-receipt-cid",
      receiptKind: "RemoteAudio",
      slotId: String(audioSlot?.slotId ?? ""),
      assetCid: String(audioAsset?.assetCid ?? ""),
      bundleCid: String(audioAsset?.bundleCid ?? ""),
      manifestCid: String(audioSlot?.manifestCid ?? ""),
      kindCode: 3,
      transport: "moq",
      publishEventCid: "publish-audio-event-cid",
      openEventCid: "open-audio-event-cid",
      firstMediaCid: String(audioAsset?.initSegmentCid ?? ""),
      sourceCode: 4,
      announcedBytes: audioDeliveryBytes,
      transferredBytes: audioDeliveryBytes,
      bytesReady: audioDeliveryBytes,
      objectCount: Number(audioAsset?.objectCount ?? 0),
      dropletCount: Number(audioAsset?.dropletCount ?? 0),
      remoteFetchMs: "21",
      openToMediaMs: "22",
      budgetMs: "1000",
      statusCode: 1,
      verified: true,
      guard: `assetCid:${audioAsset?.assetCid}`,
      trace: "open->remote-audio-delivery",
    };
    const deliveryReceiptRoundtrip = csgcReadFacts(
      csgcWriteFacts([
        csgCoreSchemaFact,
        deliveryReceipt,
        imageDeliveryReceipt,
        audioDeliveryReceipt,
      ]).factsBuffer,
    );
    assert.deepEqual(deliveryReceiptRoundtrip.facts, [deliveryReceipt, imageDeliveryReceipt, audioDeliveryReceipt]);
    const frameReceiptEnvelope = [
      { kind: "csg.web.schema", language: "typescript", schema: "csg-web", features: [], extends: "csg-core" },
      { kind: "csg.core.schema", language: "typescript", schema: "csg-core", features: [] },
      { kind: "csg.web.dom_node_template", id: "template.video", tagName: "video", nodeKind: "element", domain: "dom-html", props: [], children: [] },
    ];
    assert.deepEqual(createCsgWebMaterializerSession([...frameReceiptEnvelope, mediaAsset, videoSlot, frameReceipt, frameReceiptIdentity]).diagnostics, []);
    const missingFrameIdentitySession = createCsgWebMaterializerSession([...frameReceiptEnvelope, mediaAsset, videoSlot, frameReceipt]);
    assert.equal(missingFrameIdentitySession.diagnostics.some((diagnostic) => diagnostic.includes("media frame receipt media.frame.default-video identity missing")), true);
    const emptyFrameIdentityCidSession = createCsgWebMaterializerSession([
      ...frameReceiptEnvelope,
      mediaAsset,
      videoSlot,
      frameReceipt,
      {
        ...frameReceiptIdentity,
        id: "media.receipt.empty-cid",
        receiptCid: "",
      },
    ]);
    assert.equal(emptyFrameIdentityCidSession.diagnostics.some((diagnostic) => diagnostic.includes("csg.web.media_receipt_identity receiptCid must be a non-empty string")), true);
    const duplicateFrameIdentityCidSession = createCsgWebMaterializerSession([
      ...frameReceiptEnvelope,
      mediaAsset,
      videoSlot,
      frameReceipt,
      frameReceiptIdentity,
      {
        ...frameReceipt,
        id: "media.frame.duplicate-video",
      },
      {
        ...frameReceiptIdentity,
        id: "media.receipt.duplicate-cid",
        receiptFactId: "media.frame.duplicate-video",
      },
    ]);
    assert.equal(duplicateFrameIdentityCidSession.diagnostics.some((diagnostic) => diagnostic.includes("media receipt identity receiptCid duplicate")), true);
    assert.deepEqual(createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      mediaAsset,
      videoSlot,
      openLifecycleEvent,
      lifecycleEvent,
      deliveryReceipt,
      imageAsset,
      imageSlot,
      imageOpenLifecycleEvent,
      imagePublishLifecycleEvent,
      imageDeliveryReceipt,
      audioAsset,
      audioSlot,
      audioOpenLifecycleEvent,
      audioPublishLifecycleEvent,
      audioDeliveryReceipt,
    ]).diagnostics, []);
    const invalidDeliveryReceiptCidSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      mediaAsset,
      videoSlot,
      openLifecycleEvent,
      lifecycleEvent,
      {
        ...deliveryReceipt,
        id: "media.delivery.invalid-receipt-cid",
        receiptCid: "",
      },
    ]);
    assert.equal(invalidDeliveryReceiptCidSession.diagnostics.some((diagnostic) => diagnostic.includes("csg.web.media_delivery_receipt receiptCid must be a non-empty string")), true);
    const duplicateDeliveryReceiptCidSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      mediaAsset,
      videoSlot,
      openLifecycleEvent,
      lifecycleEvent,
      deliveryReceipt,
      {
        ...deliveryReceipt,
        id: "media.delivery.duplicate-receipt-cid",
      },
    ]);
    assert.equal(duplicateDeliveryReceiptCidSession.diagnostics.some((diagnostic) => diagnostic.includes("media delivery receiptCid duplicate")), true);
    const invalidLifecyclePayloadSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      mediaAsset,
      videoSlot,
      {
        ...openLifecycleEvent,
        id: "media.lifecycle.invalid-open-payload",
        payload: "wrong-manifest-cid",
      },
    ]);
    assert.equal(invalidLifecyclePayloadSession.diagnostics.some((diagnostic) => diagnostic.includes("open payload must equal manifestCid")), true);
    const invalidLifecycleGuardSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      mediaAsset,
      videoSlot,
      {
        ...lifecycleEvent,
        id: "media.lifecycle.invalid-guard",
        guard: "assetCid:other-asset-cid",
      },
    ]);
    assert.equal(invalidLifecycleGuardSession.diagnostics.some((diagnostic) => diagnostic.includes("guard must bind assetCid")), true);
    const invalidLifecycleTraceSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      mediaAsset,
      videoSlot,
      {
        ...openLifecycleEvent,
        id: "media.lifecycle.invalid-trace",
        trace: "",
      },
    ]);
    assert.equal(invalidLifecycleTraceSession.diagnostics.some((diagnostic) => diagnostic.includes("csg.web.media_lifecycle_event trace must be a non-empty string")), true);
    const duplicateLifecycleCidSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      mediaAsset,
      videoSlot,
      openLifecycleEvent,
      {
        ...lifecycleEvent,
        id: "media.lifecycle.duplicate-cid",
        eventCid: openLifecycleEvent.eventCid,
      },
    ]);
    assert.equal(duplicateLifecycleCidSession.diagnostics.some((diagnostic) => diagnostic.includes("media lifecycle eventCid duplicate")), true);
    const invalidImageReceiptSession = createCsgWebMaterializerSession([{
      ...frameReceiptEnvelope[0],
    }, {
      ...frameReceiptEnvelope[1],
    }, {
      ...frameReceiptEnvelope[2],
    }, {
      ...frameReceipt,
      id: "media.frame.invalid-image",
      receiptKind: "Image",
      kindCode: 2,
      firstFrameCid: "",
      firstImageCid: String(imageAsset?.assetCid ?? ""),
      textureHandle: "0",
      textureReady: true,
      decodedWidth: 2,
      decodedHeight: 2,
      bitsPerSample: 8,
      trace: "first-image->surface-texture-provider->image-receipt",
    }]);
    assert.equal(invalidImageReceiptSession.diagnostics.some((diagnostic) => diagnostic.includes("Image receipt textureReady")), true);
    const invalidFrameReceiptCidSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      mediaAsset,
      videoSlot,
      {
        ...frameReceipt,
        id: "media.frame.invalid-cid",
        firstFrameCid: "wrong-frame-cid",
      },
    ]);
    assert.equal(invalidFrameReceiptCidSession.diagnostics.some((diagnostic) => diagnostic.includes("firstFrameCid must match asset source CID")), true);
    const invalidDeliveryReceiptSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      mediaAsset,
      videoSlot,
      openLifecycleEvent,
      lifecycleEvent,
      {
        ...deliveryReceipt,
        id: "media.delivery.invalid-slow",
        openToMediaMs: "1001",
      },
    ]);
    assert.equal(invalidDeliveryReceiptSession.diagnostics.some((diagnostic) => diagnostic.includes("media delivery openToMediaMs")), true);
    const invalidDeliveryReadyBytesSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      mediaAsset,
      videoSlot,
      openLifecycleEvent,
      lifecycleEvent,
      {
        ...deliveryReceipt,
        id: "media.delivery.invalid-ready-bytes",
        transferredBytes: Number(deliveryReceipt.bytesReady ?? 0) + 1,
        bytesReady: Number(deliveryReceipt.bytesReady ?? 0) + 1,
      },
    ]);
    assert.equal(invalidDeliveryReadyBytesSession.diagnostics.some((diagnostic) => diagnostic.includes("bytesReady must match asset init segment byte length")), true);
    const invalidDeliveryGuardSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      mediaAsset,
      videoSlot,
      openLifecycleEvent,
      lifecycleEvent,
      {
        ...deliveryReceipt,
        id: "media.delivery.invalid-guard",
        guard: "assetCid:other-asset-cid",
      },
    ]);
    assert.equal(invalidDeliveryGuardSession.diagnostics.some((diagnostic) => diagnostic.includes("guard must bind assetCid") || diagnostic.includes("guard mismatch")), true);
    const invalidImageDeliverySourceSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      imageAsset,
      imageSlot,
      imageOpenLifecycleEvent,
      imagePublishLifecycleEvent,
      {
        ...imageDeliveryReceipt,
        id: "media.delivery.invalid-image-source",
        sourceCode: 2,
      },
    ]);
    assert.equal(invalidImageDeliverySourceSession.diagnostics.some((diagnostic) => diagnostic.includes("media delivery sourceCode")), true);
    const invalidImageDeliveryReadyBytesSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      imageAsset,
      imageSlot,
      imageOpenLifecycleEvent,
      imagePublishLifecycleEvent,
      {
        ...imageDeliveryReceipt,
        id: "media.delivery.invalid-image-ready-bytes",
        transferredBytes: Number(imageDeliveryReceipt.bytesReady ?? 0) + 1,
        bytesReady: Number(imageDeliveryReceipt.bytesReady ?? 0) + 1,
      },
    ]);
    assert.equal(invalidImageDeliveryReadyBytesSession.diagnostics.some((diagnostic) => diagnostic.includes("bytesReady must match asset content byte length")), true);
    const invalidAudioDeliveryReadyBytesSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      audioAsset,
      audioSlot,
      audioOpenLifecycleEvent,
      audioPublishLifecycleEvent,
      {
        ...audioDeliveryReceipt,
        id: "media.delivery.invalid-audio-ready-bytes",
        transferredBytes: Number(audioDeliveryReceipt.bytesReady ?? 0) + 1,
        bytesReady: Number(audioDeliveryReceipt.bytesReady ?? 0) + 1,
      },
    ]);
    assert.equal(invalidAudioDeliveryReadyBytesSession.diagnostics.some((diagnostic) => diagnostic.includes("bytesReady must match asset content byte length")), true);
    const invalidImageControlActionSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      imageAsset,
      imageSlot,
      {
        kind: "csg.web.media_control_action",
        id: "media.action.invalid-image-play",
        slotId: String(imageSlot?.slotId ?? ""),
        actionKind: "Play",
        payloadSchema: "unimaker.media.lifecycle.runtime.v1",
        dispatch: "event-queue",
        guard: `assetCid:${imageAsset?.assetCid}`,
        trace: "invalid-image-play",
      },
    ]);
    assert.equal(invalidImageControlActionSession.diagnostics.some((diagnostic) => diagnostic.includes("image assets cannot expose playback timeline actions")), true);
    const controlActionFact = {
      kind: "csg.web.media_control_action",
      id: "media.action.default-video-play",
      slotId: String(videoSlot?.slotId ?? ""),
      actionKind: "Play",
      payloadSchema: "unimaker.media.lifecycle.runtime.v1",
      dispatch: "event-queue",
      guard: `assetCid:${expectedDefaultVideoAssetCid}`,
      trace: "typed-action:Play",
    };
    const controlReceiptFact = {
      kind: "csg.web.media_control_receipt",
      id: "media.control.receipt.default-video-play",
      receiptCid: "control-default-video-play-receipt-cid",
      slotId: String(videoSlot?.slotId ?? ""),
      assetCid: expectedDefaultVideoAssetCid,
      kindCode: 1,
      actionKind: "Play",
      payloadSchema: "unimaker.media.lifecycle.runtime.v1",
      payload: "",
      dispatch: "event-queue",
      sourceStateCode: 1,
      resultStateCode: 2,
      statusCode: 1,
      guard: `assetCid:${expectedDefaultVideoAssetCid}`,
      trace: "typed-action:Play",
    };
    assert.deepEqual(createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      mediaAsset,
      videoSlot,
      controlActionFact,
      controlReceiptFact,
    ]).diagnostics, []);
    const invalidControlReceiptCidSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      mediaAsset,
      videoSlot,
      controlActionFact,
      {
        ...controlReceiptFact,
        id: "media.control.receipt.empty-cid",
        receiptCid: "",
      },
    ]);
    assert.equal(invalidControlReceiptCidSession.diagnostics.some((diagnostic) => diagnostic.includes("csg.web.media_control_receipt receiptCid must be a non-empty string")), true);
    const duplicateControlReceiptCidSession = createCsgWebMaterializerSession([
      frameReceiptEnvelope[0],
      frameReceiptEnvelope[1],
      frameReceiptEnvelope[2],
      mediaAsset,
      videoSlot,
      controlActionFact,
      controlReceiptFact,
      {
        ...controlReceiptFact,
        id: "media.control.receipt.duplicate-cid",
      },
    ]);
    assert.equal(duplicateControlReceiptCidSession.diagnostics.some((diagnostic) => diagnostic.includes("media control receiptCid duplicate")), true);

    const sceneRuntimeSourcePath = join(tmpDir, "scene-runtime-from-csgc.cheng");
    const sceneRuntimeExePath = join(tmpDir, "scene_runtime_from_csgc");
    const sceneRuntimeReportPath = join(tmpDir, "scene-runtime-from-csgc.report.txt");
    writeFileSync(sceneRuntimeSourcePath, emitSceneRuntimeSmokeSource(compressedRoundtrip.facts), "utf8");
    execFileSync(cheng, [
      "system-link-exec",
      `--root:${repoRoot}`,
      `--in:${sceneRuntimeSourcePath}`,
      "--emit:exe",
      "--target:arm64-apple-darwin",
      `--out:${sceneRuntimeExePath}`,
      `--report-out:${sceneRuntimeReportPath}`,
    ], {
      cwd: repoRoot,
      env: chengSmokeEnv({
        CHENG_PROCESS_MAX_RSS_BYTES: "8589934592",
        BACKEND_INCREMENTAL: "0",
        BACKEND_MULTI_MODULE_CACHE: "0",
        CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
      }, cheng, repoRoot),
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
    const sceneRuntimeOutput = execFileSync(sceneRuntimeExePath, [], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.match(sceneRuntimeOutput, /web_scene_csgc_runtime_smoke ok/);
  }

  {
    // Event handlers retain route targets and state deltas as structured facts.
    const routeHandlerFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 999,
      name: "onClick",
      valueKind: "expression",
      value: "() => setShowSearch(!showSearch)",
      expression: "() => setShowSearch(!showSearch)",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(routeHandlerFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
        { routeId: "home_search_open", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.counts.eventHandlers, 2);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "home_default" && fact.eventName === "click" && fact.targetRouteId === "home_search_open"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "home_default" && fact.eventName === "click" && fact.targetRouteId === "home_search_open" && fact.actionKind === "route" && fact.stateRef === "showSearch" && fact.effect === "route:home_search_open;toggle:showSearch" && fact.data?.action?.stateDeltas?.[0]?.effect === "toggle:showSearch"), true);
    const { factsBuffer } = csgcWriteFacts(scene.facts);
    const roundtrip = csgcReadFacts(factsBuffer);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "home_default" && fact.eventName === "click" && fact.targetRouteId === "home_search_open" && fact.actionKind === "route" && fact.stateRef === "showSearch" && fact.effect === "route:home_search_open;toggle:showSearch"), true);
  }

  {
    // Bazi 排盘 result fields bound via dotted member access ({result.dayGan},
    // {result.shiShen.hourGan}) must each become a scene node carrying the full
    // dotted path as its flat-KV textStateRef.
    const baziFacts = withBaziResultStateAndChildren(facts);
    const scene = emitCsgWebSceneFactsFromFactArray(baziFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    for (const boundRef of ["result.dayGan", "result.gender", "result.shiShen.hourGan"]) {
      assert.equal(
        scene.facts.some((fact) => fact.kind === "csg.web.scene.node" && fact.textStateRef === boundRef),
        true,
        `bazi ${boundRef} must produce a scene node textStateRef=${boundRef}`,
      );
    }
  }

  {
    // A snapshot tab body `{snapshot.field.length === 0 ? <empty> : <map>}` materializes its
    // empty-state branch (runtime store collections are empty on first paint) hung off the tab's
    // runtime equals visibility; the runtime `.map(...)` list stays a gap.
    const socialFacts = withSocialSnapshotTabComponent(facts);
    const scene = emitCsgWebSceneFactsFromFactArray(socialFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    const emptyPaint = scene.facts.find((f) =>
      f.kind === "csg.web.scene.paint" && f.routeId === "home_default" && f.text === "社交空态占位");
    assert.notEqual(emptyPaint, undefined, "snapshot empty-state branch must materialize");
    const nodesById = new Map(scene.facts
      .filter((f) => f.kind === "csg.web.scene.node" && f.routeId === "home_default")
      .map((n) => [`${n.routeIndex}:${n.nodeId}`, n]));
    let ancestorCond;
    let cur = nodesById.get(`${emptyPaint.routeIndex}:${emptyPaint.nodeId}`);
    for (let guard = 0; guard < 4000 && cur !== undefined; guard += 1) {
      if (cur.conditionalStateRef !== undefined) { ancestorCond = `${cur.conditionalStateRef}==${cur.conditionalStateValue}`; break; }
      if (cur.parentNodeId === undefined || cur.parentNodeId === 0) break;
      cur = nodesById.get(`${cur.routeIndex}:${cur.parentNodeId}`);
    }
    assert.equal(ancestorCond, "tab==contacts", "empty-state node must show/hide under the tab equals condition");
  }

  {
    // MessagesPage sub-tab branches: each `{tab === '<value>' ? <body> : null}` sibling must
    // materialize its own runtime visibility node gated on the tab equality — not fold to the
    // initial 'conversations' value and drop the other three tabs. The conversations body holds a
    // runtime `conversations.map(...)` list (runtime array → list content is a runtime-data gap),
    // yet the tab-gated container node must still exist so the runtime can populate it.
    const msgFacts = withMessageSubTabBranchesComponent(facts);
    const scene = emitCsgWebSceneFactsFromFactArray(msgFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    for (const tabValue of ["conversations", "contacts", "moments", "notifications"]) {
      const tabNode = scene.facts.some((fact) =>
        fact.kind === "csg.web.scene.node" &&
        fact.routeId === "home_default" &&
        fact.conditionalStateRef === "tab" &&
        fact.conditionalStateValue === tabValue);
      assert.equal(tabNode, true, `message sub-tab branch tab===${tabValue} must materialize a runtime visibility node gated on tab equality`);
    }
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.paint" && fact.routeId === "home_default" && fact.text === "联系人"), true,
      "contacts tab body must paint its static content");
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.paint" && fact.routeId === "home_default" && fact.text === "动态"), true,
      "moments tab body must paint its static content");
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.paint" && fact.routeId === "home_default" && fact.text === "通知"), true,
      "notifications tab body must paint its static content");
  }

  {
    // ProfilePage on-mount fetchPeerId polling must degrade to a single profile_peer_id_refresh
    // command effect on the profile-tab navigation click. The bottom-nav profile button is
    // auto-injected on every bottom-nav route, so the synthesized command event_handler must
    // appear with targetRouteId=tab_profile. Without the polling facts (base scene) no such
    // handler is synthesized, proving the detection is conditional.
    const pollingFacts = withProfilePeerIdPollingFacts(facts);
    const scene = emitCsgWebSceneFactsFromFactArray(pollingFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.eventName === "click" &&
      fact.actionKind === "command" &&
      fact.effect === "profile_peer_id_refresh:peerId" &&
      fact.targetRouteId === "tab_profile"
    ), true, "profile-tab nav click must carry a profile_peer_id_refresh:peerId command effect when the fetchPeerId polling pattern is present");
    // Base scene (no polling facts) must NOT synthesize the refresh handler — detection is gated
    // on the setInterval(fetchPeerId) + peerId runtime-state pattern, not the route alone.
    const baseScene = emitCsgWebSceneFactsFromFactArray(facts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.equal(baseScene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.effect === "profile_peer_id_refresh:peerId"
    ), false, "profile_peer_id_refresh must not be synthesized without the fetchPeerId polling pattern");
  }

  {
    // Publish button whose disabled folds to a static true keeps its handler, fronted by a
    // guard_state chain reproducing canPublish's conjunction, and drops the native disabled prop.
    const publishFacts = withPublishGuardPanelComponent(facts);
    const scene = emitCsgWebSceneFactsFromFactArray(publishFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    const publishHandler = scene.facts.find((f) =>
      f.kind === "csg.web.scene.event_handler" &&
      f.routeId === "home_default" &&
      f.eventName === "click" &&
      String(f.effect ?? "").includes("external-publish"));
    assert.notEqual(publishHandler, undefined, "publish button must keep its click handler");
    assert.equal(
      publishHandler.effect,
      "guard_state:title=__truthy;guard_state:description=__truthy;guard_state:isPublishing=__falsy;external-publish:content;location_capture:publish:locationMessage:locationStatus:locationMessage",
      "publish handler must be fronted by the canPublish/isPublishing guard chain",
    );
    // The unblocked publish button must NOT emit a native disabled=true prop (would block the click).
    const disabledTrueProp = scene.facts.some((f) =>
      f.kind === "csg.web.scene.prop" &&
      f.nodeId === publishHandler.nodeId &&
      f.propName === "disabled" &&
      f.propValue === "true");
    assert.equal(disabledTrueProp, false, "unblocked publish button must not carry native disabled=true");
    // The button's className ternary (`canPublish && !isPublishing ? purple : gray`) must lower
    // to a compound css_variant_rule — canPublish is a derived local const (title && description),
    // not a bare dynamicStateRef, so the css-conditional path must drill into its definition via
    // the same op-graph walk as the guard chain above, instead of silently emitting zero rules
    // (the disabled-visual-not-linked bug: click works but the button stays frozen gray).
    const publishClassRules = scene.facts.filter((f) =>
      f.kind === "csg.web.scene.css_variant_rule" && f.nodeId === publishHandler.nodeId);
    const purpleRule = publishClassRules.find((f) => f.className === "bg-purple-500 text-white");
    assert.notEqual(purpleRule, undefined, "publish button must emit a css_variant_rule for its unlocked (purple) className");
    assert.equal(purpleRule.data.variantCount, 3, "canPublish && !isPublishing must lower to 3 AND conditions (title, description, isPublishing)");
    const conditionKey = (c) => `${c.name}=${c.attributeValue}`;
    assert.deepEqual(
      purpleRule.data.variantChain.map(conditionKey).sort(),
      ["description=__truthy", "isPublishing=false", "title=__truthy"],
      "publish button's purple css_variant_rule conditions must match the guard chain's conjunction exactly",
    );
    assert.equal(purpleRule.data.variantChain.every((c) => c.kind === "state"), true);
  }

  {
    // A publish button whose canPublish requires a non-empty media *array* (hasRequiredMedia =
    // mediaFiles.some(...)) must gate the media conjunct via __array_nonempty, not __truthy — the
    // empty-array string "[]" is truthy but has zero items, so __truthy would falsely unlock.
    const publishFacts = withPublishMediaGuardPanelComponent(facts);
    const scene = emitCsgWebSceneFactsFromFactArray(publishFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    const publishHandler = scene.facts.find((f) =>
      f.kind === "csg.web.scene.event_handler" &&
      f.routeId === "home_default" &&
      f.eventName === "click" &&
      String(f.effect ?? "").includes("external-publish"));
    assert.notEqual(publishHandler, undefined, "media publish button must keep its click handler");
    assert.equal(
      publishHandler.effect,
      "guard_state:title=__truthy;guard_state:mediaFiles=__array_nonempty;guard_state:publishNoticeOpen=__truthy;guard_state:isPublishing=__falsy;guard_state:isPreparingMedia=__falsy;external-publish:content;location_capture:publish:locationMessage:locationStatus:locationMessage",
      "media publish handler must gate the mediaFiles array via __array_nonempty",
    );
    const disabledTrueProp = scene.facts.some((f) =>
      f.kind === "csg.web.scene.prop" &&
      f.nodeId === publishHandler.nodeId &&
      f.propName === "disabled" &&
      f.propValue === "true");
    assert.equal(disabledTrueProp, false, "unblocked media publish button must not carry native disabled=true");
  }

  {
    // publish_product's manual/csv mode canPublish ternary must lower to a single guard_any
    // segment (csv group AND manual group, |-separated OR), with isFinite+parseFloat>0 collapsed
    // to __num_positive and the manual complement resolved from setMode('csv')/setMode('manual').
    // isPublishing stays a separate guard_state segment; the publish kind is `product`.
    const publishFacts = withPublishProductModeGuardPanelComponent(facts);
    const scene = emitCsgWebSceneFactsFromFactArray(publishFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "publish_product",
      mobileRoutes: [
        { routeId: "publish_product", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    const publishHandler = scene.facts.find((f) =>
      f.kind === "csg.web.scene.event_handler" &&
      f.routeId === "publish_product" &&
      f.eventName === "click" &&
      String(f.effect ?? "").includes("external-publish:product"));
    assert.notEqual(publishHandler, undefined, "publish_product button must keep its click handler with external-publish:product");
    assert.equal(
      publishHandler.effect,
      "guard_any:mode=csv,csvText=__truthy,csvPreview=__truthy|mode=manual,title=__trim_nonempty,price=__num_positive;guard_state:isPublishing=__falsy;external-publish:product",
      "publish_product handler must lower the mode ternary to a single guard_any segment with the manual complement and __num_positive collapse",
    );
    const disabledTrueProp = scene.facts.some((f) =>
      f.kind === "csg.web.scene.prop" &&
      f.nodeId === publishHandler.nodeId &&
      f.propName === "disabled" &&
      f.propValue === "true");
    assert.equal(disabledTrueProp, false, "unblocked publish_product button must not carry native disabled=true");
  }

  {
    // Component-prop callbacks keep the usage-site handler function id when rendered by a child component.
    const forwardedHandlerFacts = withForwardedHandlerFnComponent(facts);
    const scene = emitCsgWebSceneFactsFromFactArray(forwardedHandlerFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "home_default" && fact.eventName === "click" && fact.propName === "onClick" && fact.handlerFn === "csg.function.forwarded-refresh-handler"), true);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "home_default" &&
      fact.actionKind === "command" &&
      fact.stateRef === "selectedNodeContents" &&
      fact.effect === "node_contents_refresh:selectedNodeContentOwner:selectedNodeContents:selectedNodeContentLoading:nativeError"
    ), true);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      String(fact.effect ?? "").includes("invoke:refreshSelectedNodeContents")
    ), false);
  }

  {
    // Explicit route rootComponent still inherits the JSX usage props from rootSource.
    const forwardedHandlerFacts = withForwardedHandlerFnComponent(facts);
    const scene = emitCsgWebSceneFactsFromFactArray(forwardedHandlerFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "forwarded_root",
      mobileRoutes: [
        { routeId: "forwarded_root", rootSource: "src/main.tsx", rootComponent: "ForwardedHandlerPanel" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "forwarded_root" && fact.eventName === "click" && fact.propName === "onClick" && fact.handlerFn === "csg.function.forwarded-refresh-handler"), true);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "forwarded_root" &&
      fact.actionKind === "command" &&
      fact.stateRef === "selectedNodeContents" &&
      fact.effect === "node_contents_refresh:selectedNodeContentOwner:selectedNodeContents:selectedNodeContentLoading:nativeError"
    ), true);
  }

  {
    // Local helper wrapper event handlers recover the owning component's function_value target.
    const localHelperFacts = withOwnerLocalHelperChangeComponent(facts);
    const scene = emitCsgWebSceneFactsFromFactArray(localHelperFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "home_default" && fact.eventName === "change" && fact.propName === "onChange" && fact.handlerFn === "csg.function.owner-helper-change"), true);
  }

  {
    // Numeric input helpers like `setYear(Number(event.target.value))` must
    // retain the text-input state write. The runtime parses numeric consumers on
    // read; the input node itself needs `=event.target.value` to focus and open IME.
    const numericCastFacts = withNumericCastInputHelperComponent(facts);
    const scene = emitCsgWebSceneFactsFromFactArray(numericCastFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "home_default" &&
      fact.eventName === "change" &&
      fact.propName === "onChange" &&
      fact.handlerFn === "csg.function.numeric-cast-year-change"
    ), true);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "home_default" &&
      fact.eventName === "change" &&
      fact.actionKind === "state_delta" &&
      fact.stateRef === "year" &&
      fact.effect === "set:year=event.target.value"
    ), true);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "home_default" &&
      fact.handlerFn === "csg.function.numeric-cast-year-change" &&
      fact.effect === "text_input:change"
    ), false);
  }

  {
    // Home content node buttons must carry the concrete peer id into node_detail.
    const nodeDetailFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 996,
        name: "title",
        valueKind: "string",
        value: "u_android",
      },
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "handleNodeClick",
        expression: "handleNodeClick",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(nodeDetailFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
        { routeId: "node_detail", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "home_default" && fact.eventName === "click" && fact.handler === "handleNodeClick" && fact.targetRouteId === "node_detail" && fact.actionKind === "route" && fact.stateRef === "nodeDetailPeerId" && fact.effect === "prevent-default;stop-propagation;home_node_detail:u_android" && fact.data?.action?.stateDeltas?.[0]?.effect === "home_node_detail:u_android"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && String(fact.effect ?? "").includes("invoke:handleNodeClick")), false);
  }

  {
    // ContentCard intent is node-specific: video warms/opens media, image keeps React's no-op branch.
    const videoIntentFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 996,
        name: "data-csg-static-item-type",
        valueKind: "string",
        value: "video",
      },
      {
        kind: "attribute",
        ordinal: 997,
        name: "onMouseEnter",
        valueKind: "expression",
        value: "handleIntent",
        expression: "handleIntent",
      },
      {
        kind: "attribute",
        ordinal: 998,
        name: "onTouchStart",
        valueKind: "expression",
        value: "handleIntent",
        expression: "handleIntent",
      },
    ]);
    const videoScene = emitCsgWebSceneFactsFromFactArray(videoIntentFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(videoScene.diagnostics, []);
    const videoIntentEvents = videoScene.facts.filter((fact) => fact.kind === "csg.web.scene.event_handler" && fact.handler === "handleIntent");
    assert.equal(videoIntentEvents.length, 2);
    assert.equal(videoIntentEvents.every((fact) => (fact.eventName === "mouseEnter" || fact.eventName === "touchStart") && fact.actionKind === "media_lifecycle" && fact.effect === "media_lifecycle:OpenAsset"), true);

    const imageIntentFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 996,
        name: "data-csg-static-item-type",
        valueKind: "string",
        value: "image",
      },
      {
        kind: "attribute",
        ordinal: 997,
        name: "onMouseEnter",
        valueKind: "expression",
        value: "handleIntent",
        expression: "handleIntent",
      },
      {
        kind: "attribute",
        ordinal: 998,
        name: "onTouchStart",
        valueKind: "expression",
        value: "handleIntent",
        expression: "handleIntent",
      },
    ]);
    const imageScene = emitCsgWebSceneFactsFromFactArray(imageIntentFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(imageScene.diagnostics, []);
    const imageIntentEvents = imageScene.facts.filter((fact) => fact.kind === "csg.web.scene.event_handler" && fact.handler === "handleIntent");
    assert.equal(imageIntentEvents.length, 2);
    assert.equal(imageIntentEvents.every((fact) => (fact.eventName === "mouseEnter" || fact.eventName === "touchStart") && fact.actionKind === "command" && fact.effect === "no_op:content-intent"), true);
  }

  {
    // LicensePlateInput root onChange is a component callback, not a DOM change event.
    const licensePlateCallbackFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 996,
        name: "data-csg-license-plate-value-ref",
        valueKind: "string",
        value: "licensePlate",
      },
      {
        kind: "attribute",
        ordinal: 997,
        name: "onChange",
        valueKind: "expression",
        value: "saveRideLicensePlate",
        expression: "saveRideLicensePlate",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(licensePlateCallbackFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.propName === "onChange" && fact.propValue === "saveRideLicensePlate"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.handler === "saveRideLicensePlate"), false);
  }

  {
    // A statically disabled native control has an onClick prop in React, but a
    // user click cannot activate it in the DOM. The retained scene must keep the
    // prop fact for fidelity while omitting runtime hit/event facts.
    const disabledButtonFacts = withFirstDomTemplateTagAndProps(facts, "button", [
      {
        kind: "attribute",
        ordinal: 996,
        name: "disabled",
        valueKind: "boolean",
        value: true,
      },
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "handleImportBioDid",
        expression: "handleImportBioDid",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(disabledButtonFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.propName === "disabled" && String(fact.propValue) === "true"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.handler === "handleImportBioDid"), false);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.hit_target" && fact.actionName === "onClick"), false);

    const enabledButtonFacts = withFirstDomTemplateTagAndProps(facts, "button", [
      {
        kind: "attribute",
        ordinal: 996,
        name: "disabled",
        valueKind: "boolean",
        value: false,
      },
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "handleCreateBioDid",
        expression: "handleCreateBioDid",
      },
    ]);
    const enabledScene = emitCsgWebSceneFactsFromFactArray(enabledButtonFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(enabledScene.diagnostics, []);
    assert.equal(enabledScene.facts.some((fact) => (
      fact.kind === "csg.web.scene.event_handler" &&
      fact.handler === "handleCreateBioDid" &&
      fact.actionKind === "command" &&
      fact.effect === "profile_bio_did_create:didBusy:didActionHint:didText:peerId:didBackupPayload:showDidRecoverySheet:showDidBackupSheet"
    )), true);
    assert.equal(enabledScene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "invoke:handleCreateBioDid"), false);

    const didImportButtonFacts = withFirstDomTemplateTagAndProps(facts, "button", [
      {
        kind: "attribute",
        ordinal: 996,
        name: "disabled",
        valueKind: "expression",
        value: true,
        expression: "didBusy || !didRecoveryInput.trim()",
      },
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "() => { void handleImportDeviceDid(); }",
        expression: "() => { void handleImportDeviceDid(); }",
      },
    ]);
    const didImportScene = emitCsgWebSceneFactsFromFactArray(didImportButtonFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(didImportScene.diagnostics, []);
    assert.equal(didImportScene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.propName === "disabled" && String(fact.propValue) === "true"), false);
    assert.equal(didImportScene.facts.some((fact) => (
      fact.kind === "csg.web.scene.event_handler" &&
      String(fact.handler ?? "").includes("handleImportDeviceDid") &&
      fact.actionKind === "command" &&
      fact.effect === "guard_state:didBusy=__falsy;guard_state:didRecoveryInput=__trim_nonempty;profile_bio_did_import:didBusy:didActionHint:didText:peerId:didRecoveryInput:showDidRecoverySheet:didBackupPayload"
    )), true);
    assert.equal(didImportScene.facts.some((fact) => fact.kind === "csg.web.scene.hit_target" && fact.actionName === "onClick"), true);

    const expressionDisabledFacts = withFirstDomTemplateTagAndProps(facts, "button", [
      {
        kind: "attribute",
        ordinal: 996,
        name: "disabled",
        valueKind: "expression",
        value: "asiBusy || !dexSigner",
        expression: "asiBusy || !dexSigner",
      },
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "() => { void toggleAsiSession(); }",
        expression: "() => { void toggleAsiSession(); }",
      },
    ]);
    const expressionDisabledScene = emitCsgWebSceneFactsFromFactArray(expressionDisabledFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "trading_main",
      mobileRoutes: [
        { routeId: "trading_main", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(expressionDisabledScene.diagnostics, []);
    assert.equal(expressionDisabledScene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.propName === "disabled" && String(fact.propValue) === "true"), true);
    assert.equal(expressionDisabledScene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && String(fact.handler ?? "").includes("toggleAsiSession")), false);
    assert.equal(expressionDisabledScene.facts.some((fact) => fact.kind === "csg.web.scene.hit_target" && fact.actionName === "onClick"), false);

    const trimDisabledFacts = withPublishLiveStartGuardPanelComponent(facts);
    const trimDisabledScene = emitCsgWebSceneFactsFromFactArray(trimDisabledFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "publish_live",
      mobileRoutes: [
        { routeId: "publish_live", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(trimDisabledScene.diagnostics, []);
    const liveStartHandler = trimDisabledScene.facts.find((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "publish_live" &&
      fact.handler === "handleStartLive");
    assert.notEqual(liveStartHandler, undefined, "publish_live start button must keep its guarded native handler");
    assert.equal(
      liveStartHandler.effect,
      "guard_state:title=__truthy;guard_state:isStarting=__falsy;external-publish:live",
      "publish_live start button must lower trim disabled condition to guard_state and carry live payload",
    );
    assert.equal(
      trimDisabledScene.facts.some((fact) =>
        fact.kind === "csg.web.scene.prop" &&
        fact.routeId === "publish_live" &&
        fact.nodeId === liveStartHandler.nodeId &&
        fact.propName === "disabled" &&
        String(fact.propValue) === "true"),
      false,
      "guarded publish_live start button must not emit native disabled=true",
    );
  }

  {
    const toggleSelectAllFacts = withFirstDomTemplateTagAndProps(facts, "button", [
      {
        kind: "attribute",
        ordinal: 996,
        name: "data-csg-static-array",
        valueKind: "string",
        value: "filteredNodes",
      },
      {
        kind: "attribute",
        ordinal: 997,
        name: "data-csg-static-item-peerId",
        valueKind: "string",
        value: "peer-a",
      },
      {
        kind: "attribute",
        ordinal: 998,
        name: "onClick",
        valueKind: "expression",
        value: "toggleSelectAll",
        expression: "toggleSelectAll",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(toggleSelectAllFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "tab_nodes",
      mobileRoutes: [
        { routeId: "tab_nodes", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "tab_nodes" &&
      fact.handler === "toggleSelectAll" &&
      fact.actionKind === "state_delta" &&
      fact.stateRef === "selectedPeerIds" &&
      fact.effect === "string_set_toggle_all_static:selectedPeerIds:filteredNodes:peerId"
    ), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "invoke:toggleSelectAll"), false);
  }

  {
    // Marketplace social picker buttons carry static app ids and must toggle the social-app state.
    const socialPickerFacts = withFirstDomTemplateTagAndProps(facts, "button", [{
        kind: "attribute",
        ordinal: 996,
        name: "className",
        valueKind: "string",
        value: "p-2 rounded-full transition-colors bg-gray-100 text-gray-400 hover:bg-gray-200",
      }, {
        kind: "attribute",
        ordinal: 997,
        name: "data-csg-static-item-id",
        valueKind: "string",
        value: "bazi",
      }, {
        kind: "attribute",
        ordinal: 998,
        name: "onClick",
        valueKind: "expression",
        value: "(e) => toggleSocialApp(e, app)",
        expression: "(e) => toggleSocialApp(e, app)",
      },
    ]);
    const mainScene = emitCsgWebSceneFactsFromFactArray(socialPickerFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "marketplace_main",
      mobileRoutes: [
        { routeId: "marketplace_main", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(mainScene.diagnostics, []);
    assert.equal(mainScene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "marketplace_main" && fact.actionKind === "state_delta" && fact.stateRef === "social_added_apps_v1" && fact.effect === "stop-propagation;social_app:toggle:bazi"), true);
    assert.equal(mainScene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && String(fact.effect ?? "").includes("toggleSocialApp")), false);
    assert.equal(mainScene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.routeId === "marketplace_main" && fact.propName === "data-csg-state-set-ref" && fact.propValue === "social_added_apps_v1"), true);
    assert.equal(mainScene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.routeId === "marketplace_main" && fact.propName === "data-csg-state-set-item" && fact.propValue === "bazi"), true);
    assert.equal(mainScene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.routeId === "marketplace_main" && fact.propName === "data-csg-style-selected-background-color" && String(fact.propValue ?? "").length > 0), true);
    assert.equal(mainScene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.routeId === "marketplace_main" && fact.propName === "data-csg-style-selected-color"), false);

    const scene = emitCsgWebSceneFactsFromFactArray(socialPickerFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "marketplace_social_picker",
      mobileRoutes: [
        { routeId: "marketplace_social_picker", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "marketplace_social_picker" && fact.actionKind === "state_delta" && fact.stateRef === "social_added_apps_v1" && fact.effect === "stop-propagation;social_app:toggle:bazi"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && String(fact.effect ?? "").includes("toggleSocialApp")), false);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.routeId === "marketplace_social_picker" && fact.propName === "data-csg-state-set-ref" && fact.propValue === "social_added_apps_v1"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.routeId === "marketplace_social_picker" && fact.propName === "data-csg-state-set-item" && fact.propValue === "bazi"), true);
  }

  {
    // Bazi recalculation must be a structured pure-Cheng runtime effect, not an opaque React invoke.
    const baziFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 997,
      name: "onClick",
      valueKind: "expression",
      value: "handleCalculate",
      expression: "handleCalculate",
      source: "app/components/BaziPage.tsx:266:21",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(baziFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    const handler = scene.facts.find((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "home_default" &&
      fact.eventName === "click" &&
      fact.handler === "handleCalculate"
    );
    assert(handler, "BaziPage handleCalculate must materialize across retained route snapshots");
    assert.equal(handler.actionKind, "state_delta");
    assert.equal(handler.stateRef, "result");
    assert.match(String(handler.effect ?? ""), /^bazi_calculate:result:activeDayunIdx:year:month:day:hour:minute:gender:timezone:longitude:useTrueSolarTime:lateZiBoundary:\d{4}$/);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && String(fact.source ?? "").includes("app/components/BaziPage.tsx:") && String(fact.effect ?? "").includes("invoke:handleCalculate")), false);
  }

  {
    // Ziwei recalculation must be a structured pure-Cheng runtime effect, not an opaque React invoke.
    const ziweiFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 997,
      name: "onClick",
      valueKind: "expression",
      value: "handleCalculate",
      expression: "handleCalculate",
      source: "app/components/ZiweiPage.tsx:250:21",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(ziweiFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    const handler = scene.facts.find((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "home_default" &&
      fact.eventName === "click" &&
      fact.handler === "handleCalculate"
    );
    assert(handler, "ZiweiPage handleCalculate must materialize across retained route snapshots");
    assert.equal(handler.actionKind, "state_delta");
    assert.equal(handler.stateRef, "result");
    assert.equal(handler.effect, "ziwei_calculate:result:year:month:day:shichen:gender:calendarType:minute:timezone:longitude:useTrueSolarTime:lateZiBoundary");
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && String(fact.source ?? "").includes("app/components/ZiweiPage.tsx:") && String(fact.effect ?? "").includes("invoke:handleCalculate")), false);
  }

  {
    // Chat more-panel app buttons use entry.appId, but the static map has already
    // materialized that app id onto the node; route launch must compile from it.
    const chatMoreAppFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "data-csg-static-item-appId",
        valueKind: "string",
        value: "chess",
      },
      {
        kind: "attribute",
        ordinal: 998,
        name: "onClick",
        valueKind: "expression",
        value: "() => void handleLaunchApp(entry.appId)",
        expression: "() => void handleLaunchApp(entry.appId)",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(chatMoreAppFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "message_thread_more_panel_open",
      mobileRoutes: [
        { routeId: "message_thread_more_panel_open", rootSource: "src/main.tsx" },
        { routeId: "game_xiangqi", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread_more_panel_open" && fact.actionKind === "route" && fact.targetRouteId === "game_xiangqi" && fact.effect === "route:game_xiangqi"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread_more_panel_open" && String(fact.effect ?? "").includes("handleLaunchApp(entry.appId)")), false);
  }

  {
    const minecraftResetFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 997,
      name: "onClick",
      valueKind: "expression",
      value: "resetWorld",
      expression: "resetWorld",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(minecraftResetFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "game_minecraft",
      mobileRoutes: [
        { routeId: "game_minecraft", rootSource: "src/main.tsx" },
      ],
    });
    const expected = "set:placedCubes=[];set:removedKeys=[];set:particles=[]";
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "game_minecraft" &&
      fact.eventName === "click" &&
      fact.actionKind === "state_delta" &&
      fact.stateRef === "placedCubes" &&
      fact.effect === expected
    ), true);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "game_minecraft" &&
      String(fact.effect ?? "").includes("resetWorld")
    ), false);
  }

  for (const spec of [
    {
      routeId: "game_mahjong",
      tail: ";set:selectedTile=null;set:autoPlaying=false",
      assertGame(game) {
        assert.equal(Array.isArray(game.hands), true);
        assert.equal(game.hands[0].length, 14);
        assert.equal(game.wall.length, 83);
        assert.equal(game.currentPlayer, 0);
        assert.equal(game.phase, "PLAYING");
      },
    },
    {
      routeId: "game_werewolf",
      tail: ";set:selectedTarget=null;set:poisonTarget=null;set:showPoisonPicker=false;set:isRevealed=false",
      assertGame(game) {
        assert.equal(Array.isArray(game.players), true);
        assert.equal(game.players.length, 9);
        assert.equal(game.phase, "ROLE_REVEAL");
        assert.equal(game.humanId, 0);
      },
    },
    {
      routeId: "game_xiangqi",
      tail: ";set:legalMoves=[];set:thinking=false",
      assertGame(game) {
        assert.equal(Array.isArray(game.board), true);
        assert.equal(game.board.length, 10);
        assert.equal(game.board.every((row) => Array.isArray(row) && row.length === 9), true);
        assert.equal(game.currentSide, "red");
        assert.equal(game.phase, "PLAYING");
      },
    },
  ]) {
    const restartFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 997,
      name: "onClick",
      valueKind: "expression",
      value: "restart",
      expression: "restart",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(restartFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: spec.routeId,
      mobileRoutes: [
        { routeId: spec.routeId, rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    const fact = scene.facts.find((candidate) =>
      candidate.kind === "csg.web.scene.event_handler" &&
      candidate.routeId === spec.routeId &&
      candidate.eventName === "click" &&
      candidate.actionKind === "state_delta" &&
      candidate.stateRef === "game" &&
      String(candidate.effect ?? "").startsWith("set:game={") &&
      String(candidate.effect ?? "").endsWith(spec.tail)
    );
    assert.notEqual(fact, undefined);
    const encodedGame = String(fact.effect).slice("set:game=".length, String(fact.effect).indexOf(";"));
    spec.assertGame(JSON.parse(encodedGame));
    assert.equal(scene.facts.some((candidate) =>
      candidate.kind === "csg.web.scene.event_handler" &&
      candidate.routeId === spec.routeId &&
      String(candidate.effect ?? "").includes("invoke:restart")
    ), false);
  }

  for (const side of ["BUY", "SELL"]) {
    const tradingSubmitFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 997,
      name: "onClick",
      valueKind: "expression",
      value: `() => { void submitOrder('${side}'); }`,
      expression: `() => { void submitOrder('${side}'); }`,
    });
    const scene = emitCsgWebSceneFactsFromFactArray(tradingSubmitFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "trading_main",
      mobileRoutes: [
        { routeId: "trading_main", rootSource: "src/main.tsx" },
      ],
    });
    const expected = "set:orderNotice=请先连接 RWAD 钱包用于 DEX 签名。";
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "trading_main" &&
      fact.eventName === "click" &&
      fact.actionKind === "state_delta" &&
      fact.stateRef === "orderNotice" &&
      fact.effect === expected
    ), true);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "trading_main" &&
      String(fact.effect ?? "").includes(`submitOrder('${side}')`)
    ), false);
  }

  for (const { key, stateRef } of [
    { key: "redPacket", stateRef: "showRedPacketModal" },
  ]) {
    const chatMoreActionFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "data-csg-static-item-key",
        valueKind: "string",
        value: key,
      },
      {
        kind: "attribute",
        ordinal: 998,
        name: "onClick",
        valueKind: "expression",
        value: "() => handleMorePanelAction(entry.key)",
        expression: "() => handleMorePanelAction(entry.key)",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(chatMoreActionFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "message_thread_more_panel_open",
      mobileRoutes: [
        { routeId: "message_thread_more_panel_open", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread_more_panel_open" && fact.actionKind === "state_delta" && fact.stateRef === stateRef && fact.effect === `set:${stateRef}=true`), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread_more_panel_open" && String(fact.effect ?? "").includes("handleMorePanelAction(entry.key)")), false);
  }

  {
    // 位置 action captures a high-accuracy GPS fix (mirrors ChatPage useEffect on modal open)
    // and opens the modal via the openModalRef segment — a native location_capture command,
    // no longer a bare set:showLocationModal=true state delta.
    const chatLocationActionFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "data-csg-static-item-key",
        valueKind: "string",
        value: "location",
      },
      {
        kind: "attribute",
        ordinal: 998,
        name: "onClick",
        valueKind: "expression",
        value: "() => handleMorePanelAction(entry.key)",
        expression: "() => handleMorePanelAction(entry.key)",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(chatLocationActionFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "message_thread_more_panel_open",
      mobileRoutes: [
        { routeId: "message_thread_more_panel_open", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread_more_panel_open" && fact.actionKind === "command" && fact.stateRef === "showLocationModal" && fact.effect === "location_capture:chat:locationPreview:locationFetching:locationHint:showLocationModal:locationName"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread_more_panel_open" && String(fact.effect ?? "").includes("handleMorePanelAction(entry.key)")), false);
  }

  {
    const sendRedPacketFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "handleSendRedPacket",
        expression: "handleSendRedPacket",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(sendRedPacketFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "message_thread_more_panel_open",
      mobileRoutes: [
        { routeId: "message_thread_more_panel_open", rootSource: "src/main.tsx" },
      ],
    });
    const effect = "chat_red_packet_send:messages:redPacketAmount:redPacketMessage:showRedPacketModal:showMorePanel:恭喜发财，大吉大利";
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread_more_panel_open" && fact.actionKind === "state_delta" && fact.stateRef === "messages" && fact.effect === effect), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread_more_panel_open" && String(fact.effect ?? "").includes("handleSendRedPacket")), false);
  }

  {
    const sendTextFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "() => handleSendText()",
        expression: "() => handleSendText()",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(sendTextFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "message_thread",
      mobileRoutes: [
        { routeId: "message_thread", rootSource: "src/main.tsx" },
      ],
    });
    const effect = "chat_text_send:messages:inputText:showMorePanel";
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread" && fact.actionKind === "state_delta" && fact.stateRef === "messages" && fact.effect === effect), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread" && String(fact.effect ?? "").includes("handleSendText")), false);
  }

  {
    const voiceMessageFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 996,
        name: "data-csg-static-item-key",
        valueKind: "string",
        value: "voiceMessage",
      },
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "() => handleMorePanelAction(entry.key)",
        expression: "() => handleMorePanelAction(entry.key)",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(voiceMessageFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "message_thread",
      mobileRoutes: [
        { routeId: "message_thread", rootSource: "src/main.tsx" },
      ],
    });
    const effect = "chat_voice_message_unsupported:speechBusy:speechHint:当前设备不支持录音";
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread" && fact.actionKind === "state_delta" && fact.stateRef === "speechHint" && fact.effect === effect), true);
  }

  {
    const startSpeechFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "() => void handleStartSpeechInput()",
        expression: "() => void handleStartSpeechInput()",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(startSpeechFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "message_thread",
      mobileRoutes: [
        { routeId: "message_thread", rootSource: "src/main.tsx" },
      ],
    });
    const effect = "chat_speech_input_start_unsupported:speechBusy:speechSupported:isAsiConversation:speechHint:当前设备不支持麦克风 ASR:当前设备不支持录音";
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread" && fact.actionKind === "state_delta" && fact.stateRef === "speechHint" && fact.effect === effect), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread" && String(fact.effect ?? "").includes("handleStartSpeechInput")), false);
  }

  for (const handler of ["toggleMicrophone", "toggleCamera"]) {
    const callMediaToggleFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: handler,
        expression: handler,
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(callMediaToggleFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "message_thread",
      mobileRoutes: [
        { routeId: "message_thread", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread" && fact.actionKind === "command" && fact.effect === "no_op:chat-call-media-toggle"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread" && String(fact.effect ?? "").includes(`invoke:${handler}`)), false);
  }

  {
    const callOverlayPrimaryFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "() => void handleCallOverlayPrimaryAction()",
        expression: "() => void handleCallOverlayPrimaryAction()",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(callOverlayPrimaryFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "message_thread",
      mobileRoutes: [
        { routeId: "message_thread", rootSource: "src/main.tsx" },
      ],
    });
    const effect = "set:callOverlayState=ended;set:callErrorText=通话已结束";
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread" && fact.actionKind === "state_delta" && fact.stateRef === "callOverlayState" && fact.effect === effect), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread" && String(fact.effect ?? "").includes("handleCallOverlayPrimaryAction")), false);
  }

  for (const { handler, effect } of [
    { handler: "() => { void refreshProofStatus(); }", effect: "no_op:content-payment-free-content-refresh-proof" },
    { handler: "() => { void preparePaymentFlow(); }", effect: "no_op:content-payment-free-content" },
    { handler: "() => { void handleSubmitPaymentProof(); }", effect: "no_op:content-payment-free-content-submit-proof" },
  ]) {
    const contentPaymentFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: handler,
        expression: handler,
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(contentPaymentFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "content_detail",
      mobileRoutes: [
        { routeId: "content_detail", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "content_detail" && fact.actionKind === "command" && fact.effect === effect), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "content_detail" && String(fact.effect ?? "").startsWith("invoke:")), false);
  }

  {
    const clearPublishedFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "handleClearPublishedContents",
        expression: "handleClearPublishedContents",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(clearPublishedFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "tab_profile",
      mobileRoutes: [
        { routeId: "tab_profile", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "tab_profile" &&
      fact.actionKind === "command" &&
      fact.stateRef === "clearPublishedJob" &&
      fact.effect === "clear_published_contents:peerId:clearPublishedJob:clearingPublished:publishedClearHint" &&
      fact.data?.action?.stateDeltas?.some((delta) => delta.stateRef === "publishedClearHint")
    ), true);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      String(fact.effect ?? "").includes("invoke:handleClearPublishedContents")
    ), false);
  }

  {
    const contentDeleteFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "handleDelete",
        expression: "handleDelete",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(contentDeleteFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_image_detail_open",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
        { routeId: "home_image_detail_open", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "home_image_detail_open" &&
      fact.actionKind === "command" &&
      fact.stateRef === "deleteBusy" &&
      fact.effect === "content_delete:content:deleteBusy:deleteMessage:home_default" &&
      fact.data?.action?.stateDeltas?.some((delta) => delta.stateRef === "deleteMessage")
    ), true);
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "home_image_detail_open" &&
      String(fact.effect ?? "").includes("invoke:handleDelete")
    ), false);
  }

  for (const key of ["voiceCall", "videoCall"]) {
    const videoCallFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 996,
        name: "data-csg-static-item-key",
        valueKind: "string",
        value: key,
      },
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "() => handleMorePanelAction(entry.key)",
        expression: "() => handleMorePanelAction(entry.key)",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(videoCallFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "message_thread",
      mobileRoutes: [
        { routeId: "message_thread", rootSource: "src/main.tsx" },
      ],
    });
    const effect = "chat_video_call_unsupported:actionBlockHint:当前设备不支持 WebRTC 通话";
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread" && fact.actionKind === "state_delta" && fact.stateRef === "actionBlockHint" && fact.effect === effect), true);
  }

  {
    const scrollFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "onScroll",
        valueKind: "expression",
        value: "handleMessagesScroll",
        expression: "handleMessagesScroll",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(scrollFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "message_thread",
      mobileRoutes: [
        { routeId: "message_thread", rootSource: "src/main.tsx" },
      ],
    });
    const effect = "chat_messages_scroll_stick_to_bottom:stickToBottomRef:48";
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread" && fact.eventName === "scroll" && fact.actionKind === "state_delta" && fact.stateRef === "ref:stickToBottomRef" && fact.effect === effect), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread" && String(fact.effect ?? "").includes("handleMessagesScroll")), false);
  }

  {
    const sendLocationFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "() => void handleSendLocation()",
        expression: "() => void handleSendLocation()",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(sendLocationFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "message_thread_more_panel_open",
      mobileRoutes: [
        { routeId: "message_thread_more_panel_open", rootSource: "src/main.tsx" },
      ],
    });
    const effect = "chat_location_send:messages:locationName:locationFetching:locationHint:showLocationModal:showMorePanel:当前设备不支持 GPS 定位:GPS 定位失败，已发送手动位置";
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread_more_panel_open" && fact.actionKind === "state_delta" && fact.stateRef === "messages" && fact.effect === effect), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "message_thread_more_panel_open" && String(fact.effect ?? "").includes("handleSendLocation")), false);
  }

  {
    const chatMoreTouchFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "className",
        valueKind: "string",
        value: "overflow-hidden",
      },
      {
        kind: "attribute",
        ordinal: 998,
        name: "onTouchStart",
        valueKind: "expression",
        value: "handleMorePanelTouchStart",
        expression: "handleMorePanelTouchStart",
      },
      {
        kind: "attribute",
        ordinal: 999,
        name: "onTouchEnd",
        valueKind: "expression",
        value: "handleMorePanelTouchEnd",
        expression: "handleMorePanelTouchEnd",
      },
      {
        kind: "attribute",
        ordinal: 1000,
        name: "onTouchCancel",
        valueKind: "expression",
        value: "handleMorePanelTouchCancel",
        expression: "handleMorePanelTouchCancel",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(chatMoreTouchFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "message_thread_more_panel_open",
      mobileRoutes: [
        { routeId: "message_thread_more_panel_open", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.eventName === "touchStart" && fact.actionKind === "state_delta" && fact.effect === "more_panel_touch_start:morePanelPage:morePanelPages:morePanelTouchStartRef"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.eventName === "touchEnd" && fact.actionKind === "state_delta" && fact.effect === "more_panel_touch_end:morePanelPage:morePanelPages:morePanelTouchStartRef"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.eventName === "touchCancel" && fact.actionKind === "state_delta" && fact.effect === "more_panel_touch_cancel:morePanelTouchStartRef"), true);
    assert.equal(scene.facts.some((fact) => String(fact.effect ?? "").includes("invoke:handleMorePanelTouch")), false);
  }

  {
    const chatMoreTrackFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "className",
        valueKind: "string",
        value: "flex transition-transform duration-200 ease-out",
      },
      {
        kind: "attribute",
        ordinal: 998,
        name: "style",
        valueKind: "string",
        value: "transform:translateX(-0%)",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(chatMoreTrackFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "message_thread_more_panel_open",
      mobileRoutes: [
        { routeId: "message_thread_more_panel_open", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.propName === "data-csg-more-panel-page-transform-ref" && fact.propValue === "morePanelPage"), true);
  }

  {
    const conversationRowFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 990,
        name: "className",
        valueKind: "string",
        value: "relative z-10 w-full bg-white transition-transform duration-150",
      },
      {
        kind: "attribute",
        ordinal: 991,
        name: "style",
        valueKind: "string",
        value: "transform:translateX(0px)",
      },
      {
        kind: "attribute",
        ordinal: 992,
        name: "data-csg-static-array",
        valueKind: "string",
        value: "conversations",
      },
      {
        kind: "attribute",
        ordinal: 993,
        name: "data-csg-static-item-id",
        valueKind: "string",
        value: "ASI_BOT",
      },
      {
        kind: "attribute",
        ordinal: 994,
        name: "onPointerDown",
        valueKind: "expression",
        value: "(event) => { if (!event.isPrimary) { return; } startXRef.current = event.clientX; startYRef.current = event.clientY; axisLockRef.current = null; draggingRef.current = true; movedRef.current = false; event.currentTarget.setPointerCapture(event.pointerId); }",
        expression: "(event) => { if (!event.isPrimary) { return; } startXRef.current = event.clientX; startYRef.current = event.clientY; axisLockRef.current = null; draggingRef.current = true; movedRef.current = false; event.currentTarget.setPointerCapture(event.pointerId); }",
      },
      {
        kind: "attribute",
        ordinal: 995,
        name: "onPointerMove",
        valueKind: "expression",
        value: "(event) => { if (!draggingRef.current) { return; } const deltaX = event.clientX - startXRef.current; const deltaY = event.clientY - startYRef.current; if (axisLockRef.current === null) { if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) { return; } axisLockRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'; } if (axisLockRef.current !== 'x') { return; } movedRef.current = true; const nextOffset = Math.max(-SWIPE_DELETE_WIDTH, Math.min(0, deltaX)); updateOffset(nextOffset); event.preventDefault(); }",
        expression: "(event) => { if (!draggingRef.current) { return; } const deltaX = event.clientX - startXRef.current; const deltaY = event.clientY - startYRef.current; if (axisLockRef.current === null) { if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) { return; } axisLockRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'; } if (axisLockRef.current !== 'x') { return; } movedRef.current = true; const nextOffset = Math.max(-SWIPE_DELETE_WIDTH, Math.min(0, deltaX)); updateOffset(nextOffset); event.preventDefault(); }",
      },
      {
        kind: "attribute",
        ordinal: 996,
        name: "onPointerUp",
        valueKind: "expression",
        value: "() => { if (!draggingRef.current) { return; } draggingRef.current = false; axisLockRef.current = null; if (!movedRef.current) { return; } if (Math.abs(offsetRef.current) >= SWIPE_OPEN_THRESHOLD) { openRow(); } else { closeRow(); } }",
        expression: "() => { if (!draggingRef.current) { return; } draggingRef.current = false; axisLockRef.current = null; if (!movedRef.current) { return; } if (Math.abs(offsetRef.current) >= SWIPE_OPEN_THRESHOLD) { openRow(); } else { closeRow(); } }",
      },
      {
        kind: "attribute",
        ordinal: 997,
        name: "onPointerCancel",
        valueKind: "expression",
        value: "() => { draggingRef.current = false; axisLockRef.current = null; if (Math.abs(offsetRef.current) >= SWIPE_OPEN_THRESHOLD) { openRow(); } else { closeRow(); } }",
        expression: "() => { draggingRef.current = false; axisLockRef.current = null; if (Math.abs(offsetRef.current) >= SWIPE_OPEN_THRESHOLD) { openRow(); } else { closeRow(); } }",
      },
      {
        kind: "attribute",
        ordinal: 998,
        name: "onClick",
        valueKind: "expression",
        value: "() => { if (Math.abs(offsetRef.current) > 8) { closeRow(); return; } onOpen(); }",
        expression: "() => { if (Math.abs(offsetRef.current) > 8) { closeRow(); return; } onOpen(); }",
      },
      {
        kind: "attribute",
        ordinal: 999,
        name: "onClick",
        valueKind: "expression",
        value: "() => { handleDeleteConversation(conversation.id); }",
        expression: "() => { handleDeleteConversation(conversation.id); }",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(conversationRowFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "tab_messages",
      mobileRoutes: [
        { routeId: "tab_messages", rootSource: "src/main.tsx" },
        { routeId: "message_thread", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.propName === "data-csg-conversation-row-offset-id" && fact.propValue === "ASI_BOT"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.eventName === "pointerDown" && fact.actionKind === "state_delta" && fact.effect === "conversation_row_pointer_down:ASI_BOT"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.eventName === "pointerMove" && fact.actionKind === "state_delta" && fact.effect === "conversation_row_pointer_move:ASI_BOT"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.eventName === "pointerUp" && fact.actionKind === "state_delta" && fact.effect === "conversation_row_pointer_end:ASI_BOT:up"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.eventName === "pointerCancel" && fact.actionKind === "state_delta" && fact.effect === "conversation_row_pointer_end:ASI_BOT:cancel"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.eventName === "click" && fact.actionKind === "state_delta" && fact.effect === "conversation_row_click:selectedId:ASI_BOT:message_thread"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.eventName === "click" && fact.actionKind === "state_delta" && fact.effect === "conversation_row_delete:conversations:selectedId:ASI_BOT"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "tab_messages" && String(fact.effect ?? "").includes("draggingRef.current")), false);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "tab_messages" && String(fact.effect ?? "").includes("handleDeleteConversation")), false);
  }

  {
    const stopPropagationFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 997,
      name: "onClick",
      valueKind: "expression",
      value: "e => e.stopPropagation()",
      expression: "e => e.stopPropagation()",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(stopPropagationFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_channel_manager_open",
      mobileRoutes: [
        { routeId: "home_channel_manager_open", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "home_channel_manager_open" && fact.eventName === "click" && fact.actionKind === "stop_propagation" && fact.effect === "stop-propagation"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "invoke:e => e.stopPropagation()"), false);
  }

  {
    const removeColorFacts = withAddedDomTemplateProp(
      withAddedDomTemplateProp(
        withAddedDomTemplateProp(
          withAddedDomTemplateProp(facts, {
            kind: "attribute",
            ordinal: 994,
            name: "data-csg-static-array",
            valueKind: "string",
            value: "colors",
          }),
          {
            kind: "attribute",
            ordinal: 995,
            name: "data-csg-static-index-name",
            valueKind: "string",
            value: "i",
          },
        ),
        {
          kind: "attribute",
          ordinal: 996,
          name: "data-csg-static-item-i",
          valueKind: "string",
          value: "2",
        },
      ),
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: "() => setColors(colors.filter((_, idx) => idx !== i))",
        expression: "() => setColors(colors.filter((_, idx) => idx !== i))",
      },
    );
    const scene = emitCsgWebSceneFactsFromFactArray(removeColorFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "publish_product",
      mobileRoutes: [
        { routeId: "publish_product", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "publish_product" && fact.actionKind === "state_delta" && fact.stateRef === "colors" && fact.effect === "string_array_remove_index:colors:2"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && String(fact.effect ?? "").includes("setColors(colors.filter")), false);
  }

  {
    for (const spec of [
      { handler: "addColor", stateRef: "colors", draftRef: "newColor" },
      { handler: "addSize", stateRef: "sizes", draftRef: "newSize" },
    ]) {
      const addSkuFacts = withAddedDomTemplateProp(facts, {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: spec.handler,
        expression: spec.handler,
      });
      const scene = emitCsgWebSceneFactsFromFactArray(addSkuFacts, {
        mobileAppExports: true,
        viewport: "390x844",
        mobileInitialRoute: "publish_product",
        mobileRoutes: [
          { routeId: "publish_product", rootSource: "src/main.tsx" },
        ],
      });
      assert.deepEqual(scene.diagnostics, []);
      assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "publish_product" && fact.actionKind === "state_delta" && fact.stateRef === spec.stateRef && fact.effect === `string_array_add_unique_trim:${spec.stateRef}:${spec.draftRef}`), true);
      assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === `invoke:${spec.handler}`), false);
    }
    for (const spec of [
      { handler: "(e) => e.key === 'Enter' && addColor()", stateRef: "colors", draftRef: "newColor" },
      { handler: "(e) => e.key === 'Enter' && addSize()", stateRef: "sizes", draftRef: "newSize" },
    ]) {
      const addSkuKeyFacts = withAddedDomTemplateProp(facts, {
        kind: "attribute",
        ordinal: 997,
        name: "onKeyPress",
        valueKind: "expression",
        value: spec.handler,
        expression: spec.handler,
      });
      const scene = emitCsgWebSceneFactsFromFactArray(addSkuKeyFacts, {
        mobileAppExports: true,
        viewport: "390x844",
        mobileInitialRoute: "publish_product",
        mobileRoutes: [
          { routeId: "publish_product", rootSource: "src/main.tsx" },
        ],
      });
      assert.deepEqual(scene.diagnostics, []);
      assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "publish_product" && fact.eventName === "keyPress" && fact.actionKind === "state_delta" && fact.stateRef === spec.stateRef && fact.effect === `guard_key:Enter;string_array_add_unique_trim:${spec.stateRef}:${spec.draftRef}`), true);
      assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === `invoke:${spec.handler}`), false);
    }
  }

  {
    const homeDistanceSource = "app/components/HomePage.tsx:636:5";
    const homeDistanceTrackFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 990,
        name: "ref",
        valueKind: "expression",
        value: "distanceTrackRef",
        expression: "distanceTrackRef",
      },
      {
        kind: "attribute",
        ordinal: 991,
        name: "onPointerDown",
        valueKind: "expression",
        value: "onPointerDown",
        expression: "onPointerDown",
        source: homeDistanceSource,
      },
      {
        kind: "attribute",
        ordinal: 992,
        name: "onPointerMove",
        valueKind: "expression",
        value: "onPointerMove",
        expression: "onPointerMove",
        source: homeDistanceSource,
      },
      {
        kind: "attribute",
        ordinal: 993,
        name: "onPointerUp",
        valueKind: "expression",
        value: "onPointerUp",
        expression: "onPointerUp",
        source: homeDistanceSource,
      },
      {
        kind: "attribute",
        ordinal: 994,
        name: "onPointerCancel",
        valueKind: "expression",
        value: "onPointerUp",
        expression: "onPointerUp",
        source: homeDistanceSource,
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(homeDistanceTrackFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "home_default" && fact.eventName === "pointerDown" && fact.actionKind === "state_delta" && fact.stateRef === "distanceValue" && fact.effect === "prevent-default;set:ref:distanceRangeDragging=true;distance_slider_x:distanceValue:distanceMin:distanceMax"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "home_default" && fact.eventName === "pointerMove" && fact.actionKind === "state_delta" && fact.stateRef === "distanceValue" && fact.effect === "guard_state:ref:distanceRangeDragging=true;distance_slider_x:distanceValue:distanceMin:distanceMax"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "home_default" && fact.eventName === "pointerUp" && fact.actionKind === "state_delta" && fact.stateRef === "ref:distanceRangeDragging" && fact.effect === "set:ref:distanceRangeDragging=false"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "home_default" && fact.eventName === "pointerCancel" && fact.actionKind === "state_delta" && fact.stateRef === "ref:distanceRangeDragging" && fact.effect === "set:ref:distanceRangeDragging=false"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && ["invoke:onPointerDown", "invoke:onPointerMove", "invoke:onPointerUp"].includes(String(fact.effect ?? ""))), false);

    const thumbHandler = "(e) => {\n                        e.stopPropagation();\n                        e.preventDefault();\n                        isDragging.current = true;\n                        (e.target as HTMLElement).setPointerCapture(e.pointerId);\n                      }";
    const homeDistanceThumbFacts = withFirstDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 990,
        name: "className",
        valueKind: "literal",
        value: "absolute w-7 h-7 cursor-grab",
        expression: "\"absolute w-7 h-7 cursor-grab\"",
      },
      {
        kind: "attribute",
        ordinal: 991,
        name: "style",
        valueKind: "expression",
        value: "{ left: `${pct}%` }",
        expression: "{ left: `${pct}%` }",
      },
      {
        kind: "attribute",
        ordinal: 992,
        name: "onPointerDown",
        valueKind: "expression",
        value: thumbHandler,
        expression: thumbHandler,
        source: homeDistanceSource,
      },
    ]);
    const thumbScene = emitCsgWebSceneFactsFromFactArray(homeDistanceThumbFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(thumbScene.diagnostics, []);
    assert.equal(thumbScene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "home_default" && fact.eventName === "pointerDown" && fact.actionKind === "state_delta" && fact.stateRef === "ref:distanceRangeDragging" && fact.effect === "stop-propagation;prevent-default;set:ref:distanceRangeDragging=true"), true);
    assert.equal(thumbScene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === `invoke:${thumbHandler.replace(/\s+/g, " ").trim()}`), false);
  }

  {
    const doudizhuCardClickHandler = "() => { if (suppressNextClickRef.current) { suppressNextClickRef.current = false; return; } if (!isMyTurn || roomBusy) { return; } applyCardSelection(card.id); }";
    const doudizhuCardDragBeginHandler = "(event) => { event.preventDefault(); beginHandDrag(card.id); }";
    const doudizhuCardDragEnterHandler = "(event) => { if (!dragSelectRef.current.active) { return; } const target = document .elementFromPoint(event.clientX, event.clientY) ?.closest<HTMLElement>('[data-ddz-card-id]'); const cardId = Number(target?.dataset.ddzCardId); if (Number.isFinite(cardId)) { enterHandDrag(cardId); } }";
    const doudizhuHandFacts = withAddedDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 990,
        name: "className",
        valueKind: "literal",
        value: "relative flex items-end justify-center overflow-hidden rounded-[20px] border px-2",
        expression: "\"relative flex items-end justify-center overflow-hidden rounded-[20px] border px-2\"",
      },
      {
        kind: "attribute",
        ordinal: 991,
        name: "onPointerMove",
        valueKind: "expression",
        value: doudizhuCardDragEnterHandler,
        expression: doudizhuCardDragEnterHandler,
      },
    ]);
    const handScene = emitCsgWebSceneFactsFromFactArray(doudizhuHandFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "game_doudizhu",
      mobileRoutes: [
        { routeId: "game_doudizhu", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(handScene.diagnostics, []);
    assert.equal(handScene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "game_doudizhu" && fact.eventName === "pointerMove" && fact.actionKind === "state_delta" && fact.stateRef === "selectedIds" && fact.effect === "guard_state:ref:dragSelectActive=true;doudizhu_card_drag_enter_at:selectedIds:data-ddz-card-id"), true);
    assert.equal(handScene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === `invoke:${doudizhuCardDragEnterHandler}`), false);

    const doudizhuCardStyle = {
      width: 52,
      height: 72,
      borderRadius: 12,
      background: "linear-gradient(180deg, #FFFDF7, #FFF8EE 48%, #F1E1C6)",
      borderColor: "#DCC19B",
      color: "#111827",
      transform: "none",
      opacity: 1,
      padding: 4,
      boxShadow: "0 9px 18px #1D0C0838, inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -7px 12px rgba(87,55,23,0.10)",
      marginLeft: 0,
    };
    const doudizhuCardFacts = withAddedDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 993,
        name: "selected",
        valueKind: "expression",
        value: "selectedIds.has(card.id)",
        expression: "selectedIds.has(card.id)",
      },
      {
        kind: "attribute",
        ordinal: 994,
        name: "style",
        valueKind: "expression",
        value: JSON.stringify(doudizhuCardStyle),
        expression: JSON.stringify(doudizhuCardStyle),
        staticValue: doudizhuCardStyle,
      },
      {
        kind: "attribute",
        ordinal: 995,
        name: "data-ddz-card-id",
        valueKind: "expression",
        value: "52",
        expression: "52",
      },
      {
        kind: "attribute",
        ordinal: 996,
        name: "disabled",
        valueKind: "expression",
        value: "false",
        expression: "false",
      },
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: doudizhuCardClickHandler,
        expression: doudizhuCardClickHandler,
      },
      {
        kind: "attribute",
        ordinal: 998,
        name: "onPointerDown",
        valueKind: "expression",
        value: doudizhuCardDragBeginHandler,
        expression: doudizhuCardDragBeginHandler,
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(doudizhuCardFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "game_doudizhu",
      mobileRoutes: [
        { routeId: "game_doudizhu", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "game_doudizhu" && fact.eventName === "click" && fact.actionKind === "state_delta" && fact.stateRef === "selectedIds" && fact.effect === "doudizhu_card_click:selectedIds:52"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "game_doudizhu" && fact.eventName === "pointerDown" && fact.actionKind === "state_delta" && fact.stateRef === "selectedIds" && fact.effect === "prevent-default;doudizhu_card_drag_begin:selectedIds:52"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === `invoke:${doudizhuCardClickHandler}`), false);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === `invoke:${doudizhuCardDragBeginHandler}`), false);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.propName === "data-csg-state-set-ref" && fact.propValue === "selectedIds"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.propName === "data-csg-style-selected-transform" && fact.propValue === "translateY(-6px)"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.style" && fact.propName === "border-color" && fact.propValue === "0xFFDCC19B"), true);

    const disabledDoudizhuFacts = withAddedDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 995,
        name: "data-ddz-card-id",
        valueKind: "expression",
        value: "52",
        expression: "52",
      },
      {
        kind: "attribute",
        ordinal: 996,
        name: "disabled",
        valueKind: "expression",
        value: "true",
        expression: "true",
      },
      {
        kind: "attribute",
        ordinal: 997,
        name: "onClick",
        valueKind: "expression",
        value: doudizhuCardClickHandler,
        expression: doudizhuCardClickHandler,
      },
      {
        kind: "attribute",
        ordinal: 998,
        name: "onPointerDown",
        valueKind: "expression",
        value: doudizhuCardDragBeginHandler,
        expression: doudizhuCardDragBeginHandler,
      },
    ]);
    const disabledScene = emitCsgWebSceneFactsFromFactArray(disabledDoudizhuFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "game_doudizhu",
      mobileRoutes: [
        { routeId: "game_doudizhu", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(disabledScene.diagnostics, []);
    assert.equal(disabledScene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "doudizhu_card_click:selectedIds:52"), false);
    assert.equal(disabledScene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "prevent-default;doudizhu_card_drag_begin:selectedIds:52"), false);
  }

  {
    const dappSlowPlaybackKeyHandler = "(event) => { if (event.key === 'Enter') { commitSlowPlaybackMultiplier(); } }";
    const dappSlowPlaybackFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 997,
      name: "onKeyDown",
      valueKind: "expression",
      value: dappSlowPlaybackKeyHandler,
      expression: dappSlowPlaybackKeyHandler,
    });
    const scene = emitCsgWebSceneFactsFromFactArray(dappSlowPlaybackFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_sidebar_open",
      mobileRoutes: [
        { routeId: "home_sidebar_open", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "home_sidebar_open" && fact.eventName === "keyDown" && fact.actionKind === "state_delta" && fact.stateRef === "settings.slowPlaybackMultiplier" && fact.effect === "guard_key:Enter;dapp_slow_playback_commit:settings.slowPlaybackMultiplier:slowPlaybackDraft"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === `invoke:${dappSlowPlaybackKeyHandler}`), false);
  }

  {
    const commentKeyDownFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 997,
      name: "onKeyDown",
      valueKind: "expression",
      value: "handleCommentKeyDown",
      expression: "handleCommentKeyDown",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(commentKeyDownFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_image_detail_open",
      mobileRoutes: [
        { routeId: "home_image_detail_open", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "home_image_detail_open" && fact.eventName === "keyDown" && fact.actionKind === "command" && fact.effect === "guard_key:Enter;prevent-default;invoke:handleSendComment"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "invoke:handleCommentKeyDown"), false);
  }

  {
    const nodeRemarkCancelFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 997,
      name: "onClick",
      valueKind: "expression",
      value: "handleCancelRemark",
      expression: "handleCancelRemark",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(nodeRemarkCancelFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "node_detail",
      mobileRoutes: [
        { routeId: "node_detail", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "node_detail" && fact.eventName === "click" && fact.handler === "handleCancelRemark" && fact.actionKind === "state_delta" && fact.stateRef === "remarkDraft" && fact.effect === "node_remark_cancel:nodeRemarks:remarkDraft:editingRemark:nodeDetailPeerId"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "node_detail" && fact.handler === "handleCancelRemark" && fact.effect === "set:editingRemark=false"), false);
  }

  {
    const nodeRemarkSaveFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 997,
      name: "onClick",
      valueKind: "expression",
      value: "handleSaveRemark",
      expression: "handleSaveRemark",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(nodeRemarkSaveFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "node_detail",
      mobileRoutes: [
        { routeId: "node_detail", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "node_detail" && fact.eventName === "click" && fact.handler === "handleSaveRemark" && fact.actionKind === "state_delta" && fact.stateRef === "nodeRemarks" && fact.effect === "node_remark_save:nodeRemarks:remarkDraft:editingRemark:nodeDetailPeerId:unimaker_node_remarks_v1"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "node_detail" && fact.effect === "invoke:handleSaveRemark"), false);
  }

  {
    const nodeRemarkKeyDownFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 997,
      name: "onKeyDown",
      valueKind: "expression",
      value: "(event) => { if (event.key === 'Enter') { event.preventDefault(); handleSaveRemark(); } else if (event.key === 'Escape') { event.preventDefault(); handleCancelRemark(); } }",
      expression: "(event) => { if (event.key === 'Enter') { event.preventDefault(); handleSaveRemark(); } else if (event.key === 'Escape') { event.preventDefault(); handleCancelRemark(); } }",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(nodeRemarkKeyDownFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "node_detail",
      mobileRoutes: [
        { routeId: "node_detail", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "node_detail" && fact.eventName === "keyDown" && fact.actionKind === "state_delta" && fact.stateRef === "nodeRemarks" && fact.effect === "node_remark_keydown:nodeRemarks:remarkDraft:editingRemark:nodeDetailPeerId:unimaker_node_remarks_v1"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "node_detail" && fact.effect.includes("invoke:handleSaveRemark")), false);
  }

  {
    for (const spec of [
      { prop: "onTouchStart", eventName: "touchStart", handler: "(e) => { e.stopPropagation(); jumpPressedRef.current = true; }", value: "true" },
      { prop: "onTouchEnd", eventName: "touchEnd", handler: "(e) => { e.stopPropagation(); jumpPressedRef.current = false; }", value: "false" },
    ]) {
      const refMutationFacts = withAddedDomTemplateProp(facts, {
        kind: "attribute",
        ordinal: 997,
        name: spec.prop,
        valueKind: "expression",
        value: spec.handler,
        expression: spec.handler,
      });
      const scene = emitCsgWebSceneFactsFromFactArray(refMutationFacts, {
        mobileAppExports: true,
        viewport: "390x844",
        mobileInitialRoute: "game_minecraft",
        mobileRoutes: [
          { routeId: "game_minecraft", rootSource: "src/main.tsx" },
        ],
      });
      assert.deepEqual(scene.diagnostics, []);
      assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "game_minecraft" && fact.eventName === spec.eventName && fact.actionKind === "state_delta" && fact.stateRef === "ref:jumpPressedRef" && fact.effect === `stop-propagation;set:ref:jumpPressedRef=${spec.value}`), true);
      assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === `invoke:${spec.handler}`), false);
    }
  }

  {
    // Publish close controls must be retained as route edges, not inert command invokes.
    const closeFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 998,
      name: "onClick",
      valueKind: "expression",
      value: "onClose",
      expression: "onClose",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(closeFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "publish_content",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
        { routeId: "publish_selector", rootSource: "src/main.tsx" },
        { routeId: "publish_content", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.route_edge" && fact.routeId === "publish_content" && fact.targetRouteId === "publish_selector"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.route_edge" && fact.routeId === "publish_selector" && fact.targetRouteId === "home_default"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "publish_content" && fact.actionKind === "route" && fact.effect === "route:publish_selector"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.hit_target" && fact.routeId === "publish_content" && fact.targetKind === "route" && fact.targetRouteId === "publish_selector"), true);
  }

  {
    const backFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 998,
      name: "onClick",
      valueKind: "expression",
      value: "() => void handleBackPress()",
      expression: "() => void handleBackPress()",
    });
    for (const spec of [
      { routeId: "message_thread", targetRouteId: "tab_messages" },
      { routeId: "message_thread_more_panel_open", targetRouteId: "tab_messages" },
      { routeId: "node_thread", targetRouteId: "node_detail" },
      { routeId: "node_thread_more_panel_open", targetRouteId: "node_detail" },
    ]) {
      const scene = emitCsgWebSceneFactsFromFactArray(backFacts, {
        mobileAppExports: true,
        viewport: "390x844",
        mobileInitialRoute: spec.routeId,
        mobileRoutes: [
          { routeId: spec.routeId, rootSource: "src/main.tsx" },
          { routeId: spec.targetRouteId, rootSource: "src/main.tsx" },
        ],
      });
      assert.deepEqual(scene.diagnostics, []);
      assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.route_edge" && fact.routeId === spec.routeId && fact.targetRouteId === spec.targetRouteId), true);
      assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === spec.routeId && fact.actionKind === "route" && fact.targetRouteId === spec.targetRouteId && fact.effect === `route:${spec.targetRouteId}`), true);
      assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === spec.routeId && fact.effect === "invoke:() => void handleBackPress()"), false);
    }
  }

  {
    const confirmFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 998,
      name: "onClick",
      valueKind: "expression",
      value: "handleConfirm",
      expression: "handleConfirm",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(confirmFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "lang_select",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
        { routeId: "lang_select", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.route_edge" && fact.routeId === "lang_select" && fact.targetRouteId === "home_default"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "lang_select" && fact.handler === "handleConfirm" && fact.actionKind === "route" && fact.targetRouteId === "home_default" && fact.effect === "guard_state:selected=__truthy;route:home_default"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "lang_select" && fact.handler === "handleConfirm" && fact.effect === "invoke:handleConfirm"), false);
  }

  {
    const publishTopicFacts = withAddedDomTemplateProps(facts, [
      {
        kind: "attribute",
        ordinal: 997,
        name: "onKeyUp",
        valueKind: "expression",
        value: "handleContentCursorChange",
        expression: "handleContentCursorChange",
      },
      {
        kind: "attribute",
        ordinal: 998,
        name: "onClick",
        valueKind: "expression",
        value: "insertInlineTopicMarker",
        expression: "insertInlineTopicMarker",
      },
    ]);
    const scene = emitCsgWebSceneFactsFromFactArray(publishTopicFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "publish_video",
      mobileRoutes: [
        { routeId: "publish_video", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "publish_video" && fact.eventName === "keyUp" && fact.actionKind === "state_delta" && fact.stateRef === "activeTagTrigger" && fact.effect === "publish_tag_cursor:content:activeTagTrigger"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "publish_video" && fact.eventName === "click" && fact.actionKind === "state_delta" && fact.stateRef === "content" && fact.effect === "publish_topic_marker:content:activeTagTrigger"), true);
    assert.equal(scene.facts.some((fact) => String(fact.effect ?? "").includes("invoke:handleContentCursorChange")), false);
    assert.equal(scene.facts.some((fact) => String(fact.effect ?? "").includes("invoke:insertInlineTopicMarker")), false);
  }

  {
    // Local no-arg handlers that call onClose, such as LiveStreamPage.handleEndLive, are close controls too.
    const localCloseFacts = [
      ...withAddedDomTemplateProp(facts, {
        kind: "attribute",
        ordinal: 998,
        name: "onClick",
        valueKind: "expression",
        value: "handleClose",
        expression: "handleClose",
      }),
      {
        kind: "csg.op",
        id: "csg.web.materializer.local-close.fn-value",
        function: "csg.web.materializer.local-close.owner",
        block: "csg.web.materializer.local-close.owner.block",
        opKind: "function_value",
        ordinal: 500,
        functionKind: "ArrowFunction",
        targetFunction: "csg.web.materializer.local-close.target",
      },
      {
        kind: "csg.op",
        id: "csg.web.materializer.local-close.write",
        function: "csg.web.materializer.local-close.owner",
        block: "csg.web.materializer.local-close.owner.block",
        opKind: "local_write",
        ordinal: 501,
        name: "handleClose",
        value: "csg.web.materializer.local-close.fn-value",
      },
      {
        kind: "csg.op",
        id: "csg.web.materializer.local-close.call",
        function: "csg.web.materializer.local-close.target",
        block: "csg.web.materializer.local-close.target.block",
        opKind: "call",
        ordinal: 0,
        callee: "onClose",
        argumentCount: 0,
        arguments: [],
      },
    ];
    const scene = emitCsgWebSceneFactsFromFactArray(localCloseFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "publish_live",
      mobileRoutes: [
        { routeId: "publish_selector", rootSource: "src/main.tsx" },
        { routeId: "publish_live", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.route_edge" && fact.routeId === "publish_live" && fact.targetRouteId === "publish_selector"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "publish_live" && fact.actionKind === "route" && fact.effect === "route:publish_selector"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.hit_target" && fact.routeId === "publish_live" && fact.targetKind === "route" && fact.targetRouteId === "publish_selector"), true);
  }

  {
    // Static JSX map props must preserve the raw className expression so state CSS variants are not lost.
    const scene = emitCsgWebSceneFactsFromFactArray(withStaticMapStateSwitchChild(facts), {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
        { routeId: "lang_select", rootSource: "src/main.tsx" },
        { routeId: "publish_graphic", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    const freeAppProp = scene.facts.find((fact) =>
      fact.kind === "csg.web.scene.prop" &&
      fact.routeId === "home_default" &&
      fact.propName === "data-app-id" &&
      fact.propValue === "free-app");
    assert(freeAppProp, "static map appUnlocked smoke must render the free app node");
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.prop" &&
      fact.routeId === freeAppProp.routeId &&
      fact.nodeId === freeAppProp.nodeId &&
      fact.propName === "className" &&
      String(fact.propValue ?? "").includes("bg-green-100 text-green-700")
    ), true, "appUnlocked(app) must classify price='free' as unlocked");
    const paidAppProp = scene.facts.find((fact) =>
      fact.kind === "csg.web.scene.prop" &&
      fact.routeId === "home_default" &&
      fact.propName === "data-app-id" &&
      fact.propValue === "paid-app");
    assert(paidAppProp, "static map appUnlocked smoke must render the paid app node");
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.prop" &&
      fact.routeId === paidAppProp.routeId &&
      fact.nodeId === paidAppProp.nodeId &&
      fact.propName === "className" &&
      String(fact.propValue ?? "").includes("bg-green-100 text-green-700")
    ), true, "appUnlocked(app) must unlock paid apps only when entitlement value is truthy");
    const blockedAppProp = scene.facts.find((fact) =>
      fact.kind === "csg.web.scene.prop" &&
      fact.routeId === "home_default" &&
      fact.propName === "data-app-id" &&
      fact.propValue === "blocked-app");
    assert(blockedAppProp, "static map appUnlocked smoke must render the false-entitlement app node");
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.prop" &&
      fact.routeId === blockedAppProp.routeId &&
      fact.nodeId === blockedAppProp.nodeId &&
      fact.propName === "className" &&
      String(fact.propValue ?? "").includes("bg-amber-100 text-amber-700")
    ), true, "appUnlocked(app) must keep false entitlement values locked");
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "publishNoticeOpen" && fact.effect === "toggle:publishNoticeOpen"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.css_variant_rule" && fact.className === "bg-purple-500" && fact.data?.variantChain?.[0]?.kind === "state" && fact.data?.variantChain?.[0]?.name === "publishNoticeOpen" && fact.data?.variantChain?.[0]?.attributeValue === "true"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.css_variant_rule" && fact.className === "bg-gray-300" && fact.data?.variantChain?.[0]?.kind === "state" && fact.data?.variantChain?.[0]?.name === "publishNoticeOpen" && fact.data?.variantChain?.[0]?.attributeValue === "false"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.css_variant_rule" && fact.className === "translate-x-5" && fact.data?.variantChain?.[0]?.name === "publishNoticeOpen" && fact.data?.variantChain?.[0]?.attributeValue === "true"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.css_variant_rule" && fact.className === "translate-x-0" && fact.data?.variantChain?.[0]?.name === "publishNoticeOpen" && fact.data?.variantChain?.[0]?.attributeValue === "false"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.node" && fact.conditionalStateRef === "publishNoticeOpen" && fact.conditionalStateValue === "true"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.text === "展开内容"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "addressDraft.isDefault" && fact.effect === "toggle:addressDraft.isDefault"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "addressDraft.receiver" && fact.effect === "set:addressDraft.receiver=e.target.value"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.text === "学校"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.text === "秒送/外卖"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "addressDraft.tag" && fact.effect === "string_value_toggle:addressDraft.tag:学校"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "addressDraft.tag" && fact.effect === "string_value_toggle:addressDraft.tag:秒送/外卖"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.handler === "handleSaveAddress" && fact.actionKind === "state_delta" && fact.stateRef === "addresses" && fact.effect === "profile_address_save:addresses:addressDraft:editingAddressId:showAddressEditor:addressError:请完整填写收货信息:profile_addresses_v2"), true);
    if (scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.propName === "data-csg-profile-address-list-ref" && fact.propValue === "addresses")) {
      assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.propName === "data-csg-profile-address-storage-key" && fact.propValue === "profile_addresses_v2"), true);
    }
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "profileDraft.isDefault" && fact.effect === "toggle:profileDraft.isDefault"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "wechatQr" && fact.effect === "set:wechatQr=false"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "alipayQr" && fact.effect === "set:alipayQr=false"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "file-selected:wechatQrInputRef:data-url:wechatQr"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "file-selected:alipayQrInputRef:data-url:alipayQr"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "file-picker:wechatQrInputRef:image:data-url:wechatQr"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "file-picker:alipayQrInputRef:image:data-url:alipayQr"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "no_op:click"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "file-picker:localFileInputRef:image"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "file-selected:publishImagesInputRef:data-url-array-append:images"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "file-picker:publishImagesInputRef:image:data-url-array-append:images"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "file-selected:adCoverInputRef:data-url:adCover"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.effect === "file-picker:adCoverInputRef:image-video:data-url:adCover"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "publish_graphic" && fact.effect === "file-selected:fileInputRef:media-selection:graphic"), true);
	    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "publish_graphic" && fact.effect === "file-picker:fileInputRef:image:media-selection:graphic"), true);
	    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.node" && fact.routeId === "publish_graphic" && fact.conditionalStateRef === "mediaFiles" && fact.conditionalStateValue === "__array_nonempty"), true);
	    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.routeId === "publish_graphic" && fact.propName === "src" && fact.valueKind === "state-src:mediaPreviews"), true);
	    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.resource" && fact.resourceKind === "dynamic_image_state" && fact.resourceId === "image.state.mediaPreviews"), true);
	    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.routeId === "publish_graphic" && fact.text === "已选择"), true);
	    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.routeId === "publish_graphic" && fact.text === "首帧"), true);
	    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.routeId === "publish_graphic" && fact.propName === "data-csg-media-selection-name-ref" && fact.propValue === "mediaDisplayNames"), true);
	    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.routeId === "publish_graphic" && fact.propName === "data-csg-media-selection-name-ref" && fact.propValue === "mediaFiles"), false);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "dexClobEnabled" && fact.effect === "toggle:dexClobEnabled"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.css_variant_rule" && fact.className === "bg-purple-600" && fact.data?.variantChain?.[0]?.name === "dexClobEnabled" && fact.data?.variantChain?.[0]?.attributeValue === "true"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.css_variant_rule" && fact.className === "bg-gray-200" && fact.data?.variantChain?.[0]?.name === "dexClobEnabled" && fact.data?.variantChain?.[0]?.attributeValue === "false"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "errandOriginUnit" && fact.effect === "distance_unit_toggle:errandOriginUnit:originInput:errandOriginUnitLabel:3:3000"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "originInput" && fact.effect === "distance_range_blur:errandOriginUnit:originInput:errandOriginMeters:1:20:100:20000"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "speakingPartnerLangs" && fact.effect === "string_list_toggle:speakingPartnerLangs:en-US"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "content" && fact.effect === "publish_tag_toggle:content:日常"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.routeId === "lang_select" && fact.actionKind === "route" && fact.targetRouteId === "home_default" && fact.effect === "route:home_default"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "ridePhone" && fact.effect === "set:ridePhone=e.target.value"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.node" && fact.conditionalStateRef === "isKeyboardOpen" && fact.conditionalStateValue === "true"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.node" && fact.conditionalStateRef === "activeIndex" && fact.conditionalStateValue === "__falsy"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.node" && fact.conditionalStateRef === "activeIndex" && fact.conditionalStateValue === "__truthy"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.text === "车牌键盘"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.text === "省键"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.text === "字母键"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.text === "2"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.text === "新能源"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.text === "A"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "isKeyboardOpen" && fact.effect === "set:isKeyboardOpen=false"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "activeIndex" && fact.effect === "set:activeIndex=2"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "licensePlate" && fact.effect === "license_plate_key:licensePlate:activeIndex:A"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.actionKind === "state_delta" && fact.stateRef === "licensePlate" && fact.effect === "license_plate_delete:licensePlate:activeIndex"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && String(fact.effect ?? "").includes("handleKeyClick")), false);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.node" && fact.textStateRef === "errandOriginUnitLabel"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.text === "km"), true);
  }

  {
    // Task1: publish_food `{images.length < 9 && <camera add button>}` must
    // materialize the `&&` condition as a live array-length visibility gate
    // (not a static freeze from the empty initial array), and the button's
    // onClick must keep the file-picker click effect. The `{images.length}/9`
    // span lowers to a dynamic textStateRef="images.length" plus the literal
    // "/9" paint.
    const scene = emitCsgWebSceneFactsFromFactArray(withStaticMapStateSwitchChild(facts), {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
        { routeId: "lang_select", rootSource: "src/main.tsx" },
        { routeId: "publish_graphic", rootSource: "src/main.tsx" },
      ],
    });
    const cameraButton = scene.facts.find((fact) =>
      fact.kind === "csg.web.scene.node" &&
      fact.routeId === "home_default" &&
      fact.conditionalStateRef === "images" &&
      fact.conditionalStateValue === "__array_length_lt:9" &&
      fact.tagName === "button");
    assert(cameraButton, "publish_food camera add button must materialize as a conditional node gated on images.length < 9");
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.event_handler" &&
      fact.routeId === "home_default" &&
      fact.nodeId === cameraButton.nodeId &&
      fact.eventName === "click" &&
      fact.effect === "file-picker:publishImagesInputRef:image:data-url-array-append:images"
    ), true, "publish_food camera add button onClick must keep the file-picker click effect");
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.node" &&
      fact.routeId === "home_default" &&
      fact.nodeKind === "text" &&
      fact.textStateRef === "images.length"
    ), true, "publish_food `{images.length}/9` span must bind the dynamic count as textStateRef=images.length");
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.paint" &&
      fact.routeId === "home_default" &&
      fact.text === "/9"
    ), true, "publish_food `{images.length}/9` span must keep the literal /9 suffix paint");
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.node" &&
      fact.routeId === "lang_select" &&
      fact.conditionalStateRef === "images" &&
      fact.conditionalStateValue === "__array_length_lt:9"
    ), true, "publish_food camera add button array-length gate must replicate across routes");
  }

  {
    // Per-value "selected" highlight (market category pill / message tab / any
    // selected state): a mapped className switching on `selectedCategory === cat.id`
    // must lower to per-item string-equality state CSS variants — the highlighted
    // value plus a `__not:<value>` else rule — so the highlight follows the live
    // selection instead of baking statically onto the initial item.
    const categories = [
      { id: "hot", name: "热门" }, { id: "rec", name: "推荐" }, { id: "new", name: "最新" },
      { id: "near", name: "附近" }, { id: "follow", name: "关注" }, { id: "all", name: "全部" },
    ];
    let addedCategoryMap = false;
    const highlightFacts = facts.map((fact) => {
      const next = structuredClone(fact);
      if (addedCategoryMap || fact.kind !== "csg.web.dom_node_template" || fact.tagName !== "section") return next;
      addedCategoryMap = true;
      next.children = [
        ...(Array.isArray(next.children) ? next.children : []),
        { kind: "expression", ordinal: 970, expression: "categories.map((cat) => (<button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`px-3 py-1 ${selectedCategory === cat.id ? 'bg-purple-600 text-white' : 'bg-gray-100'}`}>{cat.name}</button>))" },
        // Sibling conditional keeps selectedCategory a live runtime state ref — the
        // same registration the real market page gets from its category content filter.
        { kind: "expression", ordinal: 971, expression: "selectedCategory === 'hot' ? (<div>热门内容</div>) : (<div>其他内容</div>)" },
      ];
      if (typeof next.childCount === "number") next.childCount += 2;
      return next;
    });
    assert.equal(addedCategoryMap, true, "expected a section template for category highlight smoke");
    highlightFacts.push(
      { kind: "csg.data", id: "csg.data.category-highlight.items", dataKind: "static_string_object_array", value: { bindingName: "categories", sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx", items: categories } },
      { kind: "csg.data", id: "csg.data.category-highlight.default", dataKind: "static_json_value", value: { bindingName: "__selectedCategory_default", sourceFile: "fixtures/csg-web-materializer-basic/src/main.tsx", value: "hot" } },
      { kind: "csg.op", id: "csg.op.category-highlight-literal", function: "csg.fn.category-owner", block: "csg.block.category-owner-entry", opKind: "literal", ordinal: 5, literalKind: "string", data: "csg.data.category-highlight.default" },
      { kind: "csg.op", id: "csg.op.category-highlight-use-state", function: "csg.fn.category-owner", block: "csg.block.category-owner-entry", opKind: "call", ordinal: 6, callee: "useState", argumentCount: 1, arguments: ["csg.op.category-highlight-literal"] },
      { kind: "csg.op", id: "csg.op.category-highlight-value-binding", function: "csg.fn.category-owner", block: "csg.block.category-owner-entry", opKind: "binding_extract", ordinal: 7, source: "csg.op.category-highlight-use-state", name: "selectedCategory", path: [{ kind: "index", index: 0 }] },
      { kind: "csg.op", id: "csg.op.category-highlight-setter-binding", function: "csg.fn.category-owner", block: "csg.block.category-owner-entry", opKind: "binding_extract", ordinal: 8, source: "csg.op.category-highlight-use-state", name: "setSelectedCategory", path: [{ kind: "index", index: 1 }] },
    );
    const scene = emitCsgWebSceneFactsFromFactArray(highlightFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [{ routeId: "home_default", rootSource: "src/main.tsx" }],
    });
    assert.deepEqual(scene.diagnostics, []);
    const highlightRules = scene.facts.filter((fact) =>
      fact.kind === "csg.web.scene.css_variant_rule" &&
      fact.data?.variantChain?.[0]?.kind === "state" &&
      fact.data?.variantChain?.[0]?.name === "selectedCategory");
    // 6 pills × (highlighted value + __not:value else) = 12 value-keyed variants.
    assert.equal(highlightRules.length, 12);
    for (const category of categories) {
      assert.equal(scene.facts.some((fact) =>
        fact.kind === "csg.web.scene.css_variant_rule" &&
        fact.className === "bg-purple-600 text-white" &&
        fact.data?.variantChain?.[0]?.name === "selectedCategory" &&
        fact.data?.variantChain?.[0]?.attributeValue === category.id), true, `highlight variant for ${category.id}`);
      assert.equal(scene.facts.some((fact) =>
        fact.kind === "csg.web.scene.css_variant_rule" &&
        fact.className === "bg-gray-100" &&
        fact.data?.variantChain?.[0]?.name === "selectedCategory" &&
        fact.data?.variantChain?.[0]?.attributeValue === `__not:${category.id}`), true, `else variant for ${category.id}`);
    }
  }

  {
    // Input placeholders are retained as dedicated scene text paint.
    const scene = emitCsgWebSceneFactsFromFactArray(withPlaceholderInputRoot(facts), {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "placeholder_text" && fact.text === "输入标题"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.css_variant_rule" && fact.className === "placeholder:text-gray-300" && fact.data?.variantChain?.[0]?.name === "placeholder"), true);
    const { factsBuffer } = csgcWriteFacts(scene.facts);
    const roundtrip = csgcReadFacts(factsBuffer);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "placeholder_text" && fact.text === "输入标题"), true);
  }

  {
    // Plain JSX child expressions can inline owner-local no-arg helper render functions.
    const loc = { file: "src/helper.tsx", line: 1, column: 1, start: 0, end: 1 };
    const localHelperFacts = [
      facts.find((fact) => fact.kind === "csg.web.schema"),
      facts.find((fact) => fact.kind === "csg.core.schema"),
      { kind: "csg.function", id: "fn.helper.root", loc, name: "HelperRoot", owner: "", async: false, generator: false, exported: true, parameters: [] },
      { kind: "csg.web.js_function_ref", id: "web.fn.helper.root", coreFact: "fn.helper.root", loc, name: "HelperRoot", async: false, generator: false, exported: true, parameters: [] },
      { kind: "csg.web.dom_node_template", id: "template.helper.root", coreFact: "core.helper.root", loc, owner: "fn.helper.root", tagName: "section", nodeKind: "element", props: [], children: [{ kind: "expression", ordinal: 0, expression: "renderAddMediaTile()" }] },
      { kind: "csg.op", id: "op.helper.local", loc, function: "fn.helper.root", block: "block.helper.root", opKind: "local_write", ordinal: 1, name: "renderAddMediaTile", value: "op.helper.function_value" },
      { kind: "csg.op", id: "op.helper.function_value", loc, function: "fn.helper.root", block: "block.helper.root", opKind: "function_value", ordinal: 0, targetFunction: "fn.helper.tile" },
      { kind: "csg.function", id: "fn.helper.tile", loc, name: "<anonymous>", owner: "fn.helper.root", async: false, generator: false, exported: false, parameters: [] },
      { kind: "csg.op", id: "op.helper.tile.jsx", loc, function: "fn.helper.tile", block: "block.helper.tile", opKind: "jsx", ordinal: 0, tagName: "button", attributeCount: 0, props: [], children: [{ kind: "text", ordinal: 0, text: "视频" }] },
      { kind: "csg.op", id: "op.helper.tile.return", loc, function: "fn.helper.tile", block: "block.helper.tile", opKind: "return", ordinal: 1, value: "op.helper.tile.jsx" },
      { kind: "csg.web.dom_node_template", id: "template.helper.tile", coreFact: "core.helper.tile", loc, owner: "fn.helper.tile", tagName: "button", nodeKind: "element", props: [], children: ["视频"] },
    ].filter(Boolean);
    const scene = emitCsgWebSceneFactsFromFactArray(localHelperFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "helper_home",
      mobileRoutes: [
        { routeId: "helper_home", rootSource: "src/helper.tsx", rootComponent: "HelperRoot" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "text" && fact.text === "视频"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "text" && fact.text === "..."), false);
  }

  {
    // SVG <img> sources are retained as vector display-list paint, not raster image paint.
    const svgDataUrl = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg==";
    const scene = emitCsgWebSceneFactsFromFactArray(withSvgConstImageChild(facts, svgDataUrl), {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
      mobileRoutes: [
        { routeId: "home_default", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    const svgPaint = scene.facts.find((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "svg_icon" && String(fact.resourceId).startsWith("image."));
    assert.equal(Boolean(svgPaint), true);
    assert.equal(Array.isArray(svgPaint?.data), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "image" && fact.resourceId === svgPaint?.resourceId), false);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.resource" && fact.resourceKind === "svg_icon" && fact.resourceId === svgPaint?.resourceId), true);
    const { factsBuffer } = csgcWriteFacts(scene.facts);
    const roundtrip = csgcReadFacts(factsBuffer);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "svg_icon" && fact.resourceId === svgPaint?.resourceId && Array.isArray(fact.data)), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.paint" && fact.opKind === "image" && fact.resourceId === svgPaint?.resourceId), false);
  }

  {
    // Publish upload anchors are semantic DOM markers; without a real manifest they must not become media playback surfaces.
    const anchorFacts = withAddedDomTemplateProp(withAddedDomTemplateProp(withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 997,
      name: "data-csg-media-role",
      valueKind: "string",
      value: "publish-media-preview",
    }), {
      kind: "attribute",
      ordinal: 998,
      name: "data-csg-media-kind",
      valueKind: "string",
      value: "video",
    }), {
      kind: "attribute",
      ordinal: 999,
      name: "data-csg-media-routes",
      valueKind: "string",
      value: "publish_content,publish_movie,publish_graphic,publish_music,publish_novel",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(anchorFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "publish_content",
      mobileRoutes: [
        { routeId: "publish_content", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.node" && fact.routeId === "publish_content" && fact.tagName === "button"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.media_playback_slot"), false);

    let replacedGraphicMediaKind = false;
    const graphicAnchorFacts = anchorFacts.map((fact) => {
      const nextFact = structuredClone(fact);
      if (replacedGraphicMediaKind || nextFact.kind !== "csg.web.dom_node_template" || !Array.isArray(nextFact.props)) {
        return nextFact;
      }
      nextFact.props = nextFact.props.map((prop) => {
        if (prop.name !== "data-csg-media-kind") return prop;
        replacedGraphicMediaKind = true;
        return { ...prop, value: "image" };
      });
      return nextFact;
    });
    assert.equal(replacedGraphicMediaKind, true, "expected graphic publish anchor media kind prop to be replaceable");
    const graphicScene = emitCsgWebSceneFactsFromFactArray(graphicAnchorFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "publish_graphic",
      mobileRoutes: [
        { routeId: "publish_graphic", rootSource: "src/main.tsx" },
      ],
    });
    assert.deepEqual(graphicScene.diagnostics, []);
    assert.equal(graphicScene.facts.some((fact) => fact.kind === "csg.web.scene.node" && fact.routeId === "publish_graphic" && fact.tagName === "button"), true);
    assert.equal(graphicScene.facts.some((fact) => fact.kind === "csg.web.media_playback_slot"), false);

    const wrongGraphicScene = emitCsgWebSceneFactsFromFactArray(anchorFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "publish_graphic",
      mobileRoutes: [
        { routeId: "publish_graphic", rootSource: "src/main.tsx" },
      ],
    });
    assert.equal(
      wrongGraphicScene.diagnostics.some((diagnostic) => diagnostic.includes("CSG media role publish-media-preview on publish_graphic must declare data-csg-media-kind=image")),
      true,
      "publish_graphic upload anchor must hard-fail when it still reports video",
    );
  }

  {
    // Retained scene facts must preserve dynamic React style and handler facts.
    const interactiveFacts = withAddedDomTemplateProp(withAddedDomTemplateProp(withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 997,
      name: "className",
      valueKind: "string",
      value: "unimaker-app-shell grid col-span-2 col-span-3 transform transition-transform duration-150 translate-x-0 touch-none overflow-x-hidden overflow-y-auto opacity-[0.03] placeholder-gray-500 animate-in slide-in-from-bottom hover:bg-blue-600 focus:bg-blue-600 active:scale-95 disabled:opacity-50 data-[state=open]:hover:bg-accent aria-disabled:pointer-events-none group-hover/item:text-red-500 peer-focus/input:border-blue-500 [&>svg]:size-4 [&>span:last-child]:truncate",
    }), {
      kind: "attribute",
      ordinal: 998,
      name: "style",
      valueKind: "expression",
      value: '{ transform: `translateX(${offsetX}px)`, touchAction: "pan-y" }',
    }), {
      kind: "attribute",
      ordinal: 999,
      name: "onPointerDown",
      valueKind: "expression",
      value: "(event) => setOffsetX(0)",
      expression: "(event) => setOffsetX(0)",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(interactiveFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.prop" && fact.propName === "onPointerDown" && String(fact.propValue).includes("setOffsetX")), true);
    assert.equal(scene.counts.eventHandlers, 1);
    assert.equal(scene.counts.hitTargets >= 1, true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.propName === "onPointerDown" && fact.eventName === "pointerDown" && String(fact.handler).includes("setOffsetX")), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.propName === "onPointerDown" && fact.actionKind === "state_delta" && fact.stateRef === "offsetX" && fact.effect === "set:offsetX=0" && fact.data?.action?.stateDeltas?.[0]?.setterName === "setOffsetX"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.hit_target" && fact.targetKind === "event" && fact.actionName === "onPointerDown" && fact.eventName === "pointerDown"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.style" && fact.propName === "transform" && fact.propValue === "translateX(${offsetX}px)" && fact.valueKind === "css-template"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.style" && fact.propName === "touch-action" && fact.propValue === "pan-y"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.layout" && fact.propName === "overflow-x" && fact.propValue === "hidden"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.layout" && fact.propName === "overflow-y" && fact.propValue === "auto"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.style" && fact.propName === "transition-property" && fact.propValue === "transform"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.style" && fact.propName === "transition-duration" && fact.propValue === "150ms"), true);
    assert.equal(scene.counts.cssUtilities > 0, true);
    const cssVariantFacts = scene.facts.filter((fact) => fact.kind === "csg.web.scene.css_variant_rule");
    assert.equal(cssVariantFacts.length > 0, true);
    const cssUtilityFacts = scene.facts.filter((fact) => fact.kind === "csg.web.scene.css_utility");
    assert.equal(cssUtilityFacts.length > 0, true);
    const hoverUtilityFact = cssUtilityFacts.find((fact) => fact.className === "hover:bg-blue-600");
    assert.equal(hoverUtilityFact?.data?.baseUtility, "bg-blue-600");
    assert.equal(hoverUtilityFact?.data?.declarations?.some((decl) => decl.propertyName === "background-color" && decl.propertyValue === "0xFF2563EB"), true);
    assert.equal(cssUtilityFacts.some((fact) => fact.className === "opacity-[0.03]" && fact.data?.declarations?.some((decl) => decl.propertyName === "opacity" && decl.propertyValue === "0.03")), true);
    assert.equal(cssUtilityFacts.some((fact) => fact.className === "placeholder-gray-500" && fact.data?.declarations?.some((decl) => decl.propertyName === "color" && decl.propertyValue === "0xFF6B7280")), true);
    assert.equal(cssUtilityFacts.some((fact) => fact.className === "animate-in" && fact.data?.declarations?.some((decl) => decl.propertyName === "animation-name" && decl.propertyValue === "enter")), true);
    assert.equal(cssUtilityFacts.some((fact) => fact.className === "slide-in-from-bottom" && fact.data?.declarations?.some((decl) => decl.propertyName === "animation-name" && decl.propertyValue === "enter")), true);
    assert.equal(cssUtilityFacts.some((fact) => fact.className === "col-span-2" && fact.data?.declarations?.some((decl) => decl.propertyName === "grid-column" && decl.propertyValue === "span 2 / span 2")), true);
    assert.equal(cssUtilityFacts.some((fact) => fact.className === "col-span-3" && fact.data?.declarations?.some((decl) => decl.propertyName === "grid-column" && decl.propertyValue === "span 3 / span 3")), true);
    assert.equal(cssUtilityFacts.some((fact) => fact.className === "transform" && fact.data?.declarations?.some((decl) => decl.propertyName === "transform" && decl.propertyValue === "translateX(0px)")), true);
    assert.equal(cssUtilityFacts.some((fact) => fact.className === "unimaker-app-shell" && fact.data?.declarations?.some((decl) => decl.propertyName === "line-height" && decl.propertyValue === "1.5")), true);
    const variantFactFor = (className) => cssVariantFacts.find((fact) => fact.className === className);
    assert.equal(["hover:bg-blue-600", "focus:bg-blue-600", "active:scale-95", "disabled:opacity-50"].every((className) => {
      const fact = variantFactFor(className);
      return Array.isArray(fact?.data?.variantChain) && fact.data.variantChain.length === 1;
    }), true);
    const hoverVariantFact = variantFactFor("hover:bg-blue-600");
    assert.equal(hoverVariantFact?.data?.selectorText, ".hover\\:bg-blue-600:hover");
    assert.equal(hoverVariantFact?.data?.specificity, "0,2,0");
    assert.equal(hoverVariantFact?.data?.declarations?.some((decl) => decl.propertyName === "background-color" && decl.propertyValue === "0xFF2563EB"), true);
    const dataHoverFact = variantFactFor("data-[state=open]:hover:bg-accent");
    assert.equal(dataHoverFact?.data?.variantCount, 2);
    assert.equal(dataHoverFact?.data?.variantChain?.[0]?.kind, "data");
    assert.equal(dataHoverFact?.data?.variantChain?.[0]?.attributeName, "data-state");
    assert.equal(dataHoverFact?.data?.variantChain?.[0]?.attributeValue, "open");
    assert.equal(dataHoverFact?.data?.variantChain?.[1]?.name, "hover");
    const ariaFact = variantFactFor("aria-disabled:pointer-events-none");
    assert.equal(ariaFact?.data?.variantChain?.[0]?.kind, "aria");
    assert.equal(ariaFact?.data?.variantChain?.[0]?.attributeName, "aria-disabled");
    const groupFact = variantFactFor("group-hover/item:text-red-500");
    assert.equal(groupFact?.data?.variantChain?.[0]?.kind, "group");
    assert.equal(groupFact?.data?.variantChain?.[0]?.modifier, "item");
    const peerFact = variantFactFor("peer-focus/input:border-blue-500");
    assert.equal(peerFact?.data?.variantChain?.[0]?.kind, "peer");
    assert.equal(peerFact?.data?.variantChain?.[0]?.modifier, "input");
    const arbitraryFact = variantFactFor("[&>span:last-child]:truncate");
    assert.equal(arbitraryFact?.data?.variantChain?.[0]?.selector, "&>span:last-child");
    const { factsBuffer } = csgcWriteFacts(scene.facts);
    const roundtrip = csgcReadFacts(factsBuffer);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.propName === "onPointerDown" && fact.eventName === "pointerDown" && String(fact.handler).includes("setOffsetX")), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.propName === "onPointerDown" && fact.actionKind === "state_delta" && fact.stateRef === "offsetX" && fact.effect === "set:offsetX=0"), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.hit_target" && fact.targetKind === "event" && fact.actionName === "onPointerDown" && fact.eventName === "pointerDown"), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.css_utility" && fact.className === "hover:bg-blue-600" && fact.data?.declarations?.some((decl) => decl.propertyName === "background-color" && decl.propertyValue === "0xFF2563EB")), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.css_utility" && fact.className === "col-span-2" && fact.data?.declarations?.some((decl) => decl.propertyName === "grid-column" && decl.propertyValue === "span 2 / span 2")), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.css_variant_rule" && fact.className === "data-[state=open]:hover:bg-accent" && fact.data?.variantCount === 2), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.css_variant_rule" && fact.className === "group-hover/item:text-red-500" && fact.data?.variantChain?.[0]?.modifier === "item"), true);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.css_variant_rule" && fact.className === "peer-focus/input:border-blue-500" && fact.data?.variantChain?.[0]?.modifier === "input"), true);
    const { factsBuffer: repeatedFactsBuffer } = csgcWriteFacts(scene.facts);
    assert.equal(repeatedFactsBuffer.equals(factsBuffer), true);
    const repeatedRoundtrip = csgcReadFacts(repeatedFactsBuffer);
    assert.equal(repeatedRoundtrip.facts.some((fact) => fact.kind === "csg.web.scene.css_variant_rule" && fact.className === "[&>span:last-child]:truncate" && fact.data?.variantChain?.[0]?.selector === "&>span:last-child"), true);
  }

  {
    // Object method calls named setX are commands, not React state setters.
    const commandFacts = withAddedDomTemplateProp(facts, {
      kind: "attribute",
      ordinal: 999,
      name: "onClick",
      valueKind: "expression",
      value: "() => api.setOffsetX(0)",
      expression: "() => api.setOffsetX(0)",
    });
    const scene = emitCsgWebSceneFactsFromFactArray(commandFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.counts.eventHandlers, 1);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.event_handler" && fact.propName === "onClick" && fact.actionKind === "command" && fact.stateRef === undefined && fact.effect === "invoke:() => api.setOffsetX(0)"), true);
  }

  {
    // Owner-scoped useState defaults are enough to materialize initial inline styles.
    const stateStyleFacts = withStateDefaultStyleTemplateProp(facts);
    const scene = emitCsgWebSceneFactsFromFactArray(stateStyleFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.style" && fact.propName === "transform" && fact.propValue === "translateX(0px)" && fact.valueKind !== "css-template"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.style" && fact.propName === "transform" && fact.valueKind === "css-template"), false);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.style" && fact.propName === "touch-action" && fact.propValue === "pan-y"), true);
    const { factsBuffer } = csgcWriteFacts(scene.facts);
    const roundtrip = csgcReadFacts(factsBuffer);
    assert.equal(roundtrip.facts.some((fact) => fact.kind === "csg.web.scene.style" && fact.propName === "transform" && fact.propValue === "translateX(0px)" && fact.valueKind !== "css-template"), true);
  }

  {
    // Closed overlay roots keep triggers but do not materialize portal/content surfaces.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withClosedOverlayRoot(facts)),
      {
        rootSource: "src/closed-overlay.tsx",
        staticExpressionValues: { sheetOpen: false },
      },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /"Open sheet"/);
    assert.doesNotMatch(result.text, /"Hidden sheet body"/);
    assert.doesNotMatch(result.text, /"fixed inset-0 bg-white"/);
  }

  {
    // More than one inline-style chunk must still be called from the public DOM dump entry.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withManyStyledInlineChildren(facts)),
      { rawPixelDump: true },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /fn __csg_styles_1\(document: var web\.WebDocument, runtime: var react\.ReactRuntime\) =/);
    const dumpStart = result.text.indexOf("fn __csg_dump_dom_styles");
    const layoutStart = result.text.indexOf("fn __csg_dump_layout");
    const callIndex = result.text.indexOf("    __csg_styles_1(document, runtime)", dumpStart);
    assert.notEqual(dumpStart, -1);
    assert.notEqual(layoutStart, -1);
    assert.notEqual(callIndex, -1);
    assert.equal(callIndex < layoutStart, true, "style chunk call must be inside __csg_dump_dom_styles");
  }

  {
    // Responsive Tailwind padding is materialized for the 1024px oracle viewport.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withAddedDomTemplateProp(facts, {
        kind: "attribute",
        ordinal: 999,
        name: "className",
        valueKind: "string",
        value: "mx-auto w-16 px-4 sm:px-8",
      })),
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /"padding-left", "32px"/);
    assert.match(result.text, /"padding-right", "32px"/);
    assert.match(result.text, /"margin-left", "128px"/);
  }

  {
    // React masonry components must become explicit Cheng DOM/layout facts.
    const masonryFacts = withMasonryTemplateChild(facts);
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(masonryFacts),
    );
    assert.deepEqual(result.diagnostics, []);
    assert.doesNotMatch(result.text, /CreateElement\(runtime, "Masonry"/);
    assert.doesNotMatch(result.text, /CreateElement\(runtime, "ResponsiveMasonry"/);
    assert.match(result.text, /"display", "masonry"/);
    assert.match(result.text, /"gap", "8px"/);
    assert.match(result.text, /"data-csg-layout-kind", "masonry"/);
    assert.match(result.text, /"data-csg-masonry-min-column-width", "180"/);
    assert.match(result.text, /"data-csg-masonry-min-columns", "2"/);
    assert.match(result.text, /"data-csg-masonry-max-columns", "6"/);
    assert.match(result.text, /"data-csg-masonry-estimated-item-height", "200"/);
    const scene = emitCsgWebSceneFactsFromFactArray(masonryFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
    });
    assert.deepEqual(scene.diagnostics, []);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.layout" && fact.propName === "display" && fact.propValue === "masonry"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.layout" && fact.propName === "data-csg-masonry-min-column-width" && fact.propValue === "180"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.layout" && fact.propName === "data-csg-masonry-min-columns" && fact.propValue === "2"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.layout" && fact.propName === "data-csg-masonry-max-columns" && fact.propValue === "2"), true);
    assert.equal(scene.facts.some((fact) => fact.kind === "csg.web.scene.layout" && fact.propName === "data-csg-masonry-estimated-item-height" && fact.propValue === "200"), true);
  }

  {
    // VirtualizedMasonry must materialize browser block/flex fill width explicitly.
    const virtualizedFacts = withVirtualizedMasonryTemplateChild(facts);
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(virtualizedFacts),
    );
    assert.deepEqual(result.diagnostics, []);
    const scene = emitCsgWebSceneFactsFromFactArray(virtualizedFacts, {
      mobileAppExports: true,
      viewport: "390x844",
      mobileInitialRoute: "home_default",
    });
    assert.deepEqual(scene.diagnostics, []);
    const masonryDisplay = scene.facts.find((fact) => fact.kind === "csg.web.scene.layout" && fact.propName === "display" && fact.propValue === "masonry");
    assert(masonryDisplay, "VirtualizedMasonry must emit a masonry layout node");
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.layout" &&
      Number(fact.routeIndex ?? -1) === Number(masonryDisplay.routeIndex ?? -2) &&
      Number(fact.nodeId ?? -1) === Number(masonryDisplay.nodeId ?? -2) &&
      fact.propName === "width" &&
      fact.propValue === "100%"
    ), true, "VirtualizedMasonry masonry node must fill its scroll container width");
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.layout" &&
      Number(fact.routeIndex ?? -1) === Number(masonryDisplay.routeIndex ?? -2) &&
      Number(fact.nodeId ?? -1) === Number(masonryDisplay.nodeId ?? -2) &&
      fact.propName === "data-csg-masonry-model" &&
      fact.propValue === "virtualized-react"
    ), true, "VirtualizedMasonry masonry node must preserve React virtualized column semantics");
    const itemNode = scene.facts.find((fact) =>
      fact.kind === "csg.web.scene.node" &&
      Number(fact.routeIndex ?? -1) === Number(masonryDisplay.routeIndex ?? -2) &&
      Number(fact.parentNodeId ?? -1) === Number(masonryDisplay.nodeId ?? -2) &&
      fact.tagName === "div"
    );
    assert(itemNode, "VirtualizedMasonry must emit explicit direct masonry item wrappers");
    assert.equal(scene.facts.some((fact) =>
      fact.kind === "csg.web.scene.layout" &&
      Number(fact.routeIndex ?? -1) === Number(itemNode.routeIndex ?? -2) &&
      Number(fact.nodeId ?? -1) === Number(itemNode.nodeId ?? -2) &&
      fact.propName === "width" &&
      fact.propValue === "100%"
    ), true, "VirtualizedMasonry direct item wrappers must not inherit a squeezed width");
  }

  {
    // Tailwind truncate must survive CSG-Web materialization into retained scene styles.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withAddedDomTemplateProp(facts, {
        kind: "attribute",
        ordinal: 999,
        name: "className",
        valueKind: "string",
        value: "truncate",
      })),
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /"overflow", "hidden"/);
    assert.match(result.text, /"text-overflow", "ellipsis"/);
    assert.match(result.text, /"white-space", "nowrap"/);
  }

  {
    // Tailwind flex-shrink-0 must survive into retained scene flex layout.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withAddedDomTemplateProp(facts, {
        kind: "attribute",
        ordinal: 999,
        name: "className",
        valueKind: "string",
        value: "flex-shrink-0",
      })),
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /"flex-shrink", "0"/);
  }

  {
    // Cheng source strings are emitted as UTF-8 scalar text, not JSON \\u surrogate escapes.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withSurrogateTextChild(facts)),
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /� test/);
    assert.doesNotMatch(result.text, /\\u[dD][0-9a-fA-F]{3}/);
  }

  {
    // Nested w-full stays a percentage; layout resolves it against the real parent box.
    const result = materializeCsgWebFactsToChengSource(
      renderJsonlFacts(withNestedPaddedFullWidthChild(facts)),
    );
    assert.deepEqual(result.diagnostics, []);
    assert.match(result.text, /"width", "384px"/);
    assert.match(result.text, /"width", "100%"/);
    assert.doesNotMatch(result.text, /"width", "320px"/);
    assert.doesNotMatch(result.text, /"width", "316px"/);
  }

  {
    // unsupported_ref facts produce diagnostics but materialization continues.
    const result = materializeCsgWebFactsToChengSource(renderJsonlFacts([
      ...facts,
      {
        kind: "csg.web.unsupported_ref",
        id: "csg.web.unsupported_ref.materializer-hard-fail.dynamic-expression",
        coreFact: "csg.unsupported.materializer-hard-fail.dynamic-expression",
        code: "jsx.dynamic_expression",
        message: "dynamic JSX expression cannot be materialized to static Cheng web source",
      },
    ]));
    assert.equal(result.diagnostics.length > 0, true, "unsupported ref must produce diagnostics");
    assert.match(result.diagnostics.join("\n"), /unsupported csg-web fact: jsx\.dynamic_expression dynamic JSX expression cannot be materialized to static Cheng web source/);
    assert.notEqual(result.text, "", "materialization must produce output despite non-fatal diagnostics");
  }

execFileSync(cheng, [
  "system-link-exec",
  `--root:${repoRoot}`,
  `--in:${chengSourcePath}`,
  "--emit:exe",
  "--target:arm64-apple-darwin",
  `--out:${exePath}`,
  `--report-out:${compileReportPath}`,
], {
  cwd: repoRoot,
  env: chengSmokeEnv({}, cheng, repoRoot),
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 30000,
  maxBuffer: 32 * 1024 * 1024,
});

const output = execFileSync(exePath, [], {
  cwd: repoRoot,
  encoding: "utf8",
  timeout: 10000,
  maxBuffer: 32 * 1024 * 1024,
});

assert.match(output, new RegExp(CsgWebMaterializerMarker));
assert.doesNotMatch(output, /first=-65536/, "basic materialized runtime must not render diagnostic full-viewport red");
process.stdout.write(output);
