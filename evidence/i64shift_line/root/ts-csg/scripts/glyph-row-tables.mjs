// Campaign C R1 — glyph precompute row-table mode.
// Byte-parity anchors: fixtures/glyph-rowtables-golden-r10/* and verified
// surgical product /tmp/r12_fixed.cheng (2.19s rc=0; receipt 62,635 lines;
// pixels 34,836,480B identical to cache golden).
//
// Table encoding contract:
//   ints    : decimal ASCII + ","
//   strings : RAW UTF-8 bytes of the value (no escaping anywhere; real NBSP,
//             newlines, quotes travel as their own bytes), length-prefixed by
//             BYTE count.
//   row     : "<payloadByteLen>:<payload>"
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

export function buildGlyphRowTableBuffers(sceneFacts) {
  const sortByNode = (l, r) => Number(l.routeIndex) - Number(r.routeIndex) || Number(l.nodeId) - Number(r.nodeId);
  const sortByOrd = (l, r) => sortByNode(l, r) || Number(l.ordinal) - Number(r.ordinal);
  const nodes = [...sceneFacts].filter((f) => f.kind === "csg.web.scene.node").sort(sortByNode);
  const layouts = [...sceneFacts].filter((f) => f.kind === "csg.web.scene.layout").sort(sortByOrd);
  const paintsAll = [...sceneFacts]
    .filter((f) => f.kind === "csg.web.scene.paint" && ["text", "placeholder_text"].includes(String(f.opKind ?? "")))
    .sort(sortByOrd);
  const counts = {};

  const strField = (value) => {
    const body = Buffer.from(String(value ?? ""), "utf8");
    return Buffer.concat([Buffer.from(String(body.length) + ":"), body]);
  };
  const intField = (value) => Buffer.from(Number(value ?? 0) + ",", "utf8");

  const emitFamily = (name, list, toksOf) => {
    counts[name] = list.length;
    const parts = [];
    for (const item of list) {
      const toks = toksOf(item);
      const strs = name === "nodes" ? [4,5,7,8,9] : name === "layouts" ? [3,4] : [10,11];
      let payload = Buffer.alloc(0);
      for (let j = 0; j < toks.length; j++) {
        if (strs.includes(j)) {
          const body = Buffer.from(String(toks[j] ?? ""), "utf8");
          payload = Buffer.concat([payload, Buffer.from(String(body.length) + ":"), body]);
        } else {
          payload = Buffer.concat([payload, Buffer.from(Number(toks[j] ?? 0) + ",", "utf8")]);
        }
      }
      parts.push(Buffer.from(String(payload.length) + ":"), payload);
    }
    return Buffer.concat(parts);
  };

  const nodesBuf = emitFamily("nodes", nodes, (n) => [
    n.routeIndex, n.nodeId, n.parentNodeId,
    n.nodeKind === "text" ? 3 : 2,
    n.tagName, n.text, n.layerId,
    n.conditionalStateRef, n.conditionalStateValue, n.textStateRef,
  ]);
  const layoutsBuf = emitFamily("layouts", layouts, (l) => [
    l.routeIndex, l.nodeId, l.ordinal,
    l.propName, l.propValue,
  ]);
  const paintsBuf = emitFamily("paints", paintsAll, (p) => {
    let colorInt = 0;
    const c = p.color;
    if (c !== undefined && c !== null && c !== "") {
      if (typeof c !== "string" || !/^0x[0-9a-fA-F]+$/.test(c)) {
        throw new Error("unsupported paint color: " + String(c));
      }
      colorInt = Number(BigInt(c));
    }
    return [
      p.routeIndex, p.nodeId, p.ordinal, p.x, p.y,
      p.opKind === "placeholder_text" ? 1 : 0,
      colorInt,
      p.radius, p.width, p.height,
      p.resourceId, p.text,
    ];
  });
  void nodesBuf; void layoutsBuf; void paintsBuf;
  return { nodesBuf, layoutsBuf, paintsBuf, counts };
}

export function writeGlyphRowTableSidecarFiles(sceneFacts, dir, fsLike, pathLike) {
  const built = buildGlyphRowTableBuffers(sceneFacts);
  const pairs = [
    ["nodesBuf", "rows-nodes.bin"],
    ["layoutsBuf", "rows-layouts.bin"],
    ["paintsBuf", "rows-paints.bin"],
  ];
  const files = [];
  for (const [builtKey, fileName] of pairs) {
    const path = pathLike.join(dir, fileName);
    fsLike.writeFileSync(path, built[builtKey]);
    files.push(path);
  }
  return { files, counts: built.counts };
}

// Text-side transform over the JOINED statement-form monolith.
// Strips three family definition paragraphs; injects interpreter + argv
// plumbing; swaps dispatches to layers-after position. Inventory family is
// preserved automatically (different fn-name prefix).
export function finalizeGlyphRowMode(srcText, interpSource) {
  const lines = srcText.split("\n");
  const famRe = /^fn __csg_precompute_load_(nodes|layouts|paints)(?:_[0-9]+)?\(graph: var scene\.WebSceneGraph\): int32 =$/;
  const out = [];
  let skipping = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!skipping && famRe.test(line)) { skipping = true; continue; }
    if (skipping) {
      if (line === "") skipping = false;
      continue;
    }
    out.push(line);
  }
  let joined = out.join("\n");
  const mkBlock = (callLine) => [
    callLine,
    "    if loadStatus != 0:",
    "        return __csg_precompute_fail(loadStatus)",
    "",
  ].join("\n");
  joined = [mkBlock("    loadStatus = __csg_precompute_load_nodes(graph)"),
            mkBlock("    loadStatus = __csg_precompute_load_layouts(graph)"),
            mkBlock("    loadStatus = __csg_precompute_load_paints(graph)")]
    .reduce((acc, blk) => acc.split(blk).join(""), joined);
  const layersBlk = ["    loadStatus = __csg_precompute_load_layers(graph)",
                     "    if loadStatus != 0:",
                     "        return __csg_precompute_fail(loadStatus)",
                     ""].join("\n");
  const rowsBlock = ["    loadStatus = __csg_precompute_load_row_tables(graph, csgInputsDir)",
                     "    if loadStatus != 0:",
                     "        return __csg_precompute_fail(loadStatus)",
                     ""].join("\n");
  assert(joined.includes(layersBlk), "row-mode: layers dispatch anchor missing");
  joined = joined.replace(layersBlk, layersBlk.slice(0, -1) + "\n" + rowsBlock);
  const routesAnchor = "\nfn __csg_precompute_load_routes(graph: var scene.WebSceneGraph): int32 =\n";
  assert(joined.includes(routesAnchor), "row-mode: routes anchor missing");
  joined = joined.replace(routesAnchor, interpSource + routesAnchor);

  // Inject cmdline import + argv plumbing into main (row-mode shells read
  // resource payloads and row tables from the inputs directory via argv[1]).
  const cmdlineImportAnchor = 'import std/strings as strings';
  if (!joined.includes('import std/cmdline as cmdline')) {
    joined = joined.replace(cmdlineImportAnchor,
      cmdlineImportAnchor + '\nimport std/cmdline as cmdline');
  }
  const mainGraphAnchor = '    var graph: scene.WebSceneGraph\n';
  assert(joined.includes(mainGraphAnchor), "row-mode: main graph anchor missing");
  const argvLines = [
    "    if cmdline.ParamCount() < 2:",
    "        return __csg_precompute_fail(990001)",
    "    var csgInputsDir: str = cmdline.ParamStr(1)",
    "",
  ].join("\n");
  joined = joined.replace(mainGraphAnchor, mainGraphAnchor + argvLines);
  return joined;
}

export function readInterpreterTemplate(selfUrl) {
  return readFileSync(new URL("./glyph-row-interpreter.cheng", selfUrl), "utf8");
}
