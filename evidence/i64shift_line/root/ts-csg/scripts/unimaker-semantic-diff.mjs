#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const schema = "unimaker.semantic_diff.v2";

const manifestTables = [
  {
    key: "routes",
    label: "route",
    identityFields: ["route_index"],
    compareFields: ["route_index", "route_id"],
  },
  {
    key: "nodes",
    label: "node",
    identityFields: ["route_index", "node_id"],
    compareFields: ["route_index", "node_id", "parent_node_id", "kind", "tag"],
  },
  {
    key: "props",
    label: "prop",
    identityFields: ["route_index", "node_id", "ordinal"],
    compareFields: ["route_index", "node_id", "ordinal", "name", "value", "kind"],
  },
  {
    key: "event_handlers",
    label: "event handler",
    identityFields: ["route_index", "node_id", "event"],
    compareFields: ["route_index", "node_id", "event", "handler", "action", "state_ref"],
  },
  {
    key: "hit_targets",
    label: "hit target",
    identityFields: ["route_index", "node_id", "target_route_index"],
    compareFields: ["route_index", "node_id", "kind", "action", "event", "target_route_index"],
  },
  {
    key: "route_edges",
    label: "route edge",
    identityFields: ["route_index", "node_id", "target_route_index"],
    compareFields: ["route_index", "node_id", "target_route_index"],
  },
  {
    key: "css_declarations",
    label: "css declaration",
    identityFields: ["route_index", "node_id", "property"],
    compareFields: ["route_index", "node_id", "property", "value"],
  },
  {
    key: "layout_constraints",
    label: "layout constraint",
    identityFields: ["route_index", "node_id", "property"],
    compareFields: ["route_index", "node_id", "property", "value"],
  },
];

const tableByKey = new Map(manifestTables.map((table) => [table.key, table]));

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const options = {
    chengManifest: "",
    reactManifest: "",
    summary: "",
    routeEdgeDetails: "",
    output: "",
    maxSamples: 50,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    const readValue = (name) => {
      if (next === undefined || next.startsWith("--")) fail(`missing value for ${name}`);
      i += 1;
      return next;
    };
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--cheng-manifest") {
      options.chengManifest = readValue(arg);
    } else if (arg === "--react-manifest") {
      options.reactManifest = readValue(arg);
    } else if (arg === "--summary") {
      options.summary = readValue(arg);
    } else if (arg === "--route-edge-details") {
      options.routeEdgeDetails = readValue(arg);
    } else if (arg === "--output") {
      options.output = readValue(arg);
    } else if (arg === "--max-samples") {
      const parsed = Number(readValue(arg));
      if (!Number.isInteger(parsed) || parsed < 0) fail(`invalid --max-samples: ${next}`);
      options.maxSamples = parsed;
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function usage() {
  process.stdout.write(`unimaker-semantic-diff.mjs — per-node/per-prop/per-edge semantic manifest diff

Usage:
  node unimaker-semantic-diff.mjs \\
    --cheng-manifest <runtime cheng_semantic_manifest.json> \\
    --react-manifest <unimaker-react.scene-manifest.json> \\
    [--summary <one-click.summary.json>] \\
    [--route-edge-details <unimaker-react.route-edge-details.json>] \\
    [--output <diff.json>] [--max-samples N]

Full mode (recommended): requires both manifest JSON files. Records are joined by
their deterministic array index, then every field in every table is compared.
The identity fields are also reported separately so route/node/prop/edge
reordering and duplication cannot be hidden by an index-only join.

Fallback mode: --react-manifest may be omitted when --summary and/or
--route-edge-details are supplied. Fallback compares aggregate scene counts,
route inventory, node parent/tag structure and the resolved route-edge set,
but cannot perform per-prop/per-handler/css field joins.

Exit status: 0 when every requested check is exact; 1 when any mismatch exists.
`);
}

function readJson(path, label) {
  if (!existsSync(path)) fail(`${label} does not exist: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    fail(`failed to parse ${label} ${path}: ${String(err?.message ?? err)}`);
  }
  return undefined;
}

function readManifest(path, label) {
  const manifest = readJson(path, label);
  for (const table of manifestTables) {
    if (!Array.isArray(manifest[table.key])) {
      fail(`${label} ${path} is missing array "${table.key}"`);
    }
  }
  return manifest;
}

function scalarEqual(left, right) {
  if (typeof left === "number" && typeof right === "number") {
    if (Number.isNaN(left) && Number.isNaN(right)) return true;
    if (left === 0 && right === 0) return true;
    return left === right;
  }
  if (typeof left === "string" && typeof right === "string") return left === right;
  if (typeof left === "boolean" && typeof right === "boolean") return left === right;
  if (left === null || left === undefined || right === null || right === undefined) return left === right;
  return String(left) === String(right);
}

function recordKey(record, fields) {
  return fields.map((field) => {
    const value = record?.[field];
    if (value === undefined || value === null) return "<missing>";
    return String(value);
  }).join("|");
}

function identityKey(record, table) {
  return recordKey(record, table.identityFields);
}

function diffManifestTable(table, reactRecords, chengRecords, maxSamples) {
  const reactCount = reactRecords.length;
  const chengCount = chengRecords.length;
  const checked = Math.min(reactCount, chengCount);
  let mismatchedRecords = 0;
  let mismatchedFields = 0;
  const samples = [];
  const reactIndexMismatches = [];
  const chengIndexMismatches = [];
  const reactIdentityKeys = new Set();
  const chengIdentityKeys = new Set();
  const identityKeyDuplicates = { react: new Set(), cheng: new Set() };

  for (let index = 0; index < checked; index += 1) {
    const react = reactRecords[index];
    const cheng = chengRecords[index];
    if (Number.isInteger(react?.index) && react.index !== index) reactIndexMismatches.push({ index, actual: react.index });
    if (Number.isInteger(cheng?.index) && cheng.index !== index) chengIndexMismatches.push({ index, actual: cheng.index });

    const fieldDiffs = [];
    for (const field of table.compareFields) {
      if (!scalarEqual(react?.[field], cheng?.[field])) {
        fieldDiffs.push({
          field,
          react: react?.[field] ?? null,
          cheng: cheng?.[field] ?? null,
        });
      }
    }

    const reactKey = identityKey(react, table);
    const chengKey = identityKey(cheng, table);
    if (reactIdentityKeys.has(reactKey)) identityKeyDuplicates.react.add(reactKey);
    if (chengIdentityKeys.has(chengKey)) identityKeyDuplicates.cheng.add(chengKey);
    reactIdentityKeys.add(reactKey);
    chengIdentityKeys.add(chengKey);

    if (fieldDiffs.length > 0) {
      mismatchedRecords += 1;
      mismatchedFields += fieldDiffs.length;
      if (samples.length < maxSamples) {
        samples.push({
          index,
          react_identity: reactKey,
          cheng_identity: chengKey,
          field_diffs: fieldDiffs,
        });
      }
    }
  }

  const reactExtras = reactRecords.slice(checked).map((record, offset) => ({
    index: checked + offset,
    identity: identityKey(record, table),
  }));
  const chengExtras = chengRecords.slice(checked).map((record, offset) => ({
    index: checked + offset,
    identity: identityKey(record, table),
  }));

  return {
    react_count: reactCount,
    cheng_count: chengCount,
    count_exact: reactCount === chengCount,
    records_checked: checked,
    mismatched_records: mismatchedRecords,
    mismatched_fields: mismatchedFields,
    exact: reactCount === chengCount && mismatchedRecords === 0,
    index_mismatches: {
      react: reactIndexMismatches,
      cheng: chengIndexMismatches,
    },
    duplicate_identity_keys: {
      react: [...identityKeyDuplicates.react],
      cheng: [...identityKeyDuplicates.cheng],
    },
    react_extras: reactExtras.slice(0, maxSamples),
    cheng_extras: chengExtras.slice(0, maxSamples),
    samples: samples.slice(0, maxSamples),
  };
}

function diffCounts(reactCounts, chengCounts) {
  const checks = [];
  for (const table of manifestTables) {
    const react = reactCounts?.[table.key];
    const cheng = chengCounts?.[table.key];
    const exact = Number.isFinite(react) && Number.isFinite(cheng) && react === cheng;
    checks.push({
      table: table.key,
      react: Number.isFinite(react) ? react : null,
      cheng: Number.isFinite(cheng) ? cheng : null,
      exact,
    });
  }
  return {
    complete: checks.every((check) => check.exact),
    checks,
  };
}

function manifestArrayCounts(manifest) {
  const counts = {};
  for (const table of manifestTables) counts[table.key] = manifest[table.key].length;
  return counts;
}

function compareSummaryCounts(summary, chengCounts) {
  if (!summary?.scene || typeof summary.scene !== "object") return null;
  const mapping = [
    ["routes", "routes"],
    ["nodes", "nodes"],
    ["props", "props"],
    ["event_handlers", "eventHandlers"],
    ["hit_targets", "hitTargets"],
    ["layout_constraints", "layouts"],
  ];
  const checks = [];
  for (const [tableKey, summaryKey] of mapping) {
    const react = summary.scene[summaryKey];
    const cheng = chengCounts[tableKey];
    const exact = Number.isFinite(react) && Number.isFinite(cheng) && react === cheng;
    checks.push({ field: `scene.${summaryKey}`, table: tableKey, react, cheng, exact });
  }
  return {
    complete: checks.every((check) => check.exact),
    checks,
  };
}

function normalizedReactNodeTag(reactNode) {
  return String(reactNode?.tagName ?? "");
}

function normalizedChengNodeTag(chengNode) {
  const tag = String(chengNode?.tag ?? "");
  if (tag.length > 0) return tag;
  const kind = Number(chengNode?.kind ?? -1);
  if (kind === 3) return "text";
  if (kind === 2) return "fragment";
  return "";
}

function compareRouteEdgeDetails(details, chengManifest) {
  const chengNodesByKey = new Map();
  for (const node of chengManifest.nodes) {
    const key = `${Number(node.route_index)}:${Number(node.node_id)}`;
    if (!chengNodesByKey.has(key)) chengNodesByKey.set(key, node);
  }
  const reactNodeKeys = new Set();
  let checkedNodes = 0;
  let mismatchedNodes = 0;
  const nodeSamples = [];
  for (const reactNode of details?.nodes ?? []) {
    const key = `${Number(reactNode.routeIndex)}:${Number(reactNode.nodeId)}`;
    reactNodeKeys.add(key);
    const chengNode = chengNodesByKey.get(key);
    if (!chengNode) continue;
    checkedNodes += 1;
    const fieldDiffs = [];
    const reactParent = Number(reactNode.parentNodeId ?? 0);
    const chengParent = Number(chengNode.parent_node_id ?? 0);
    if (reactParent !== chengParent) {
      fieldDiffs.push({ field: "parent_node_id", react: reactParent, cheng: chengParent });
    }
    const reactTag = normalizedReactNodeTag(reactNode);
    const chengTag = normalizedChengNodeTag(chengNode);
    if (reactTag !== chengTag) {
      fieldDiffs.push({ field: "tag", react: reactTag, cheng: chengTag });
    }
    if (fieldDiffs.length > 0) {
      mismatchedNodes += 1;
      if (nodeSamples.length < 50) {
        nodeSamples.push({ route_index: reactNode.routeIndex, node_id: reactNode.nodeId, field_diffs: fieldDiffs });
      }
    }
  }
  const missingChengNodeKeys = [...reactNodeKeys]
    .filter((key) => !chengNodesByKey.has(key))
    .slice(0, 50);
  const missingReactNodeKeys = [...chengNodesByKey.keys()]
    .filter((key) => !reactNodeKeys.has(key))
    .slice(0, 50);

  const edgeKey = (edge) => `${Number(edge.routeIndex ?? edge.route_index)}:${Number(edge.nodeId ?? edge.node_id)}:${Number(edge.targetRouteIndex ?? edge.target_route_index)}`;
  const chengEdges = new Set(chengManifest.route_edges.map(edgeKey));
  const reactEdges = new Set((details?.routeEdges ?? []).map(edgeKey));
  const missingReactEdges = [...chengEdges].filter((key) => !reactEdges.has(key)).slice(0, 50);
  const missingChengEdges = [...reactEdges].filter((key) => !chengEdges.has(key)).slice(0, 50);

  return {
    route_count: Number(details?.routeCount ?? -1),
    react_nodes: (details?.nodes ?? []).length,
    react_edges: (details?.routeEdges ?? []).length,
    cheng_nodes_compared: checkedNodes,
    mismatched_nodes: mismatchedNodes,
    node_samples: nodeSamples,
    missing_cheng_nodes: missingChengNodeKeys,
    missing_react_nodes: missingReactNodeKeys,
    edges_exact: missingReactEdges.length === 0 && missingChengEdges.length === 0,
    cheng_edge_count: chengEdges.size,
    react_edge_count: reactEdges.size,
    missing_react_edges: missingReactEdges,
    missing_cheng_edges: missingChengEdges,
    complete: mismatchedNodes === 0 && missingChengNodeKeys.length === 0 && missingReactNodeKeys.length === 0 && missingReactEdges.length === 0 && missingChengEdges.length === 0,
  };
}

function compareManifestCountsToSchema(reactManifest, chengManifest) {
  const react = manifestArrayCounts(reactManifest);
  const cheng = manifestArrayCounts(chengManifest);
  const declaredDiff = diffCounts(reactManifest?.counts ?? {}, chengManifest?.counts ?? {});
  const actualDiff = diffCounts(react, cheng);
  return {
    declared_counts_exact: declaredDiff.complete,
    declared_counts_checks: declaredDiff.checks,
    actual_counts_exact: actualDiff.complete,
    actual_counts_checks: actualDiff.checks,
  };
}

function compareManifests(reactManifest, chengManifest, maxSamples) {
  const tables = {};
  let complete = true;
  for (const table of manifestTables) {
    const result = diffManifestTable(
      table,
      reactManifest[table.key],
      chengManifest[table.key],
      maxSamples,
    );
    tables[table.key] = result;
    if (!result.exact) complete = false;
  }
  const counts = compareManifestCountsToSchema(reactManifest, chengManifest);
  if (!counts.declared_counts_exact || !counts.actual_counts_exact) complete = false;
  return { tables, counts, complete };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!options.chengManifest) fail("missing required --cheng-manifest");
  if (!options.reactManifest && !options.summary && !options.routeEdgeDetails) {
    fail("provide --react-manifest for full mode, or --summary/--route-edge-details for fallback mode");
  }

  const chengPath = resolve(options.chengManifest);
  const chengManifest = readManifest(chengPath, "Cheng manifest");
  const report = {
    schema,
    generated_at: new Date().toISOString(),
    mode: options.reactManifest ? "manifest" : "fallback",
    cheng_manifest: chengPath,
    react_manifest: "",
    summary: "",
    route_edge_details: "",
    tables: null,
    counts: null,
    aggregate: null,
    route_edge_details_diff: null,
    complete: true,
  };

  const chengCounts = manifestArrayCounts(chengManifest);

  if (options.reactManifest) {
    report.react_manifest = resolve(options.reactManifest);
    const reactManifest = readManifest(report.react_manifest, "React manifest");
    const result = compareManifests(reactManifest, chengManifest, options.maxSamples);
    report.tables = result.tables;
    report.counts = result.counts;
    report.complete &&= result.complete;
  } else {
    report.react_manifest = "";
  }

  const aggregateChecks = [];
  if (options.summary) {
    report.summary = resolve(options.summary);
    const summary = readJson(report.summary, "summary");
    const summaryDiff = compareSummaryCounts(summary, chengCounts);
    if (summaryDiff) {
      report.aggregate = summaryDiff;
      report.complete &&= summaryDiff.complete;
    } else {
      aggregateChecks.push({ check: "summary.scene", note: "summary has no scene count object" });
    }
  }

  if (options.routeEdgeDetails) {
    report.route_edge_details = resolve(options.routeEdgeDetails);
    const details = readJson(report.route_edge_details, "route-edge details");
    const detailDiff = compareRouteEdgeDetails(details, chengManifest);
    report.route_edge_details_diff = detailDiff;
    report.complete &&= detailDiff.complete;
  }

  if (report.tables) {
    for (const [key, table] of Object.entries(report.tables)) {
      if (table.exact) continue;
      process.stderr.write(`${key}: react=${table.react_count} cheng=${table.cheng_count} checked=${table.records_checked} mismatched_records=${table.mismatched_records} mismatched_fields=${table.mismatched_fields}\n`);
    }
  }
  if (report.counts && !report.counts.actual_counts_exact) {
    process.stderr.write("manifest array counts differ\n");
  }
  if (report.aggregate && !report.aggregate.complete) {
    process.stderr.write("summary aggregate counts differ\n");
  }
  if (report.route_edge_details_diff && !report.route_edge_details_diff.complete) {
    process.stderr.write(`route-edge details differ: nodes_mismatched=${report.route_edge_details_diff.mismatched_nodes}, edges_exact=${report.route_edge_details_diff.edges_exact}\n`);
  }

  const outputPath = options.output ? resolve(options.output) : resolve("unimaker-semantic-diff.json");
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  process.stdout.write(`${report.complete ? "semantic diff ok" : "semantic diff mismatch"} (mode=${report.mode}) → ${outputPath}\n`);
  process.exit(report.complete ? 0 : 1);
}

main();
