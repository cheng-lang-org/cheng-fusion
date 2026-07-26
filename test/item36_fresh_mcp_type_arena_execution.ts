#!/usr/bin/env bun
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  CHENG_FUSION_FRESH_MCP_TYPE_ARENA_EXECUTION_SCHEMA,
  CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE,
  CHENG_FUSION_TYPE_ARENA_ENTRY_SUBSTRATE_PATH,
  CHENG_FUSION_TYPE_ARENA_OUTPUT_DIR,
  CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE,
  CHENG_FUSION_TYPE_ARENA_QUERY_SUBSTRATE_PATH,
  CHENG_FUSION_TYPE_ARENA_SYMBOL,
  CHENG_FUSION_TYPE_ARENA_TARGET,
  runFreshMcpTypeArenaExecution,
  validateFreshMcpTypeArenaExecutionReport,
  validateFreshMcpTypeArenaSemanticOutputs,
} from "../src/cheng_fusion_fresh_mcp_type_arena_execution.ts";
import { probeFreshChengFusionMcpRuntime } from "../src/cheng_fusion_fresh_mcp_probe.ts";
import {
  CHENG_CURRENT_OFFICIAL_DRIVER,
  CHENG_CURRENT_ROOT,
} from "../src/cheng_current_parser_receipt_ingress.ts";
import { canonicalJson } from "../src/cheng_semantic_matrix_m9023.ts";

const SELF = new URL(import.meta.url).pathname;
const GUARD =
  "/Users/lbcheng/cheng-lang/tools/beat_c_process_group_guard.sh";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function runtimeReseal(value: any): void {
  const payload = { ...value.runtimeIdentity };
  delete payload.receiptRaw32;
  value.runtimeIdentity.receiptRaw32 = hash(canonicalJson(payload));
}

function reportReseal(value: any): void {
  value.semanticRaw32 = hash(canonicalJson(value.semantic));
  value.executionRaw32 = hash(
    canonicalJson({
      guardLimitBytes: value.guardLimitBytes,
      guardMonitorPid: value.guardMonitorPid,
      officialDriver: value.officialDriver,
      sourceFiles: value.sourceFiles,
      generationArtifacts: value.generationArtifacts,
      runtimeReceiptRaw32: value.runtimeIdentity.receiptRaw32,
      steps: value.steps,
      semanticRaw32: value.semanticRaw32,
    }),
  );
  const payload = { ...value };
  delete payload.receiptRaw32;
  value.receiptRaw32 = hash(canonicalJson(payload));
}

if (process.argv.includes("--guard-red-helper")) {
  const report = await runFreshMcpTypeArenaExecution(20000);
  assert.equal(report.status, "HARD_RED");
  assert.match(
    report.reason,
    /artifacts\/backend_driver\/cheng|official_driver/,
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(0);
}

const unguarded = await runFreshMcpTypeArenaExecution(1000);
assert.equal(unguarded.status, "HARD_RED");
assert.equal(
  unguarded.reason,
  "fresh_type_arena_exact_parent_guard_required",
);
assert.equal(unguarded.runtimeIdentity, null);
assert.deepEqual(unguarded.steps, []);

const runtimeReceipt = await probeFreshChengFusionMcpRuntime();
const runtime = runtimeReceipt.runtimeIdentity;
const inputs = [
  {
    root: CHENG_CURRENT_ROOT,
    source: CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE,
    entrySource: CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE,
    outDir: CHENG_FUSION_TYPE_ARENA_OUTPUT_DIR,
    target: CHENG_FUSION_TYPE_ARENA_TARGET,
  },
  {
    kind: "symbol",
    root: CHENG_CURRENT_ROOT,
    file: CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE,
    entrySource: CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE,
    name: CHENG_FUSION_TYPE_ARENA_SYMBOL,
    limit: 256,
  },
  {
    root: CHENG_CURRENT_ROOT,
    file: CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE,
    symbol: CHENG_FUSION_TYPE_ARENA_SYMBOL,
    limit: 256,
  },
] as const;
const toolNames = [
  "cheng_csg_roundtrip",
  "cheng_csg_query",
  "cheng_evidence",
] as const;
const requestIds = [2, 3, 4] as const;
const generationHash = `sha256:${hash("type-arena-generation")}`;
const generationId = generationHash.replace(":", "-");
const generationDir = join(
  CHENG_FUSION_TYPE_ARENA_OUTPUT_DIR,
  ".cheng-csg-generations",
  generationId,
);
function fakePin(path: string, bytesRaw32: string): any {
  return {
    path,
    device: "1",
    inode: "2",
    mode: "33188",
    linkCount: "1",
    byteLength: 64,
    mtimeNs: "1000000000",
    ctimeNs: "1000000000",
    bytesRaw32,
  };
}
const sourceFiles = {
  entrySource: fakePin(
    CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE,
    hash("type-arena-entry-source"),
  ),
  querySource: fakePin(
    CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE,
    hash("type-arena-query-source"),
  ),
};
const factsRaw32 = hash("type-arena-facts");
const generationArtifacts = {
  facts: fakePin(join(generationDir, "current.facts"), factsRaw32),
  manifest: fakePin(
    join(generationDir, "summary.json"),
    hash("type-arena-manifest"),
  ),
};
generationArtifacts.facts.mode = "33060";
generationArtifacts.manifest.mode = "33060";
const semantic = {
  generationId,
  generationHash,
  factsRoot: `sha256:${factsRaw32}`,
  factsPath: generationArtifacts.facts.path,
  queryMatchCount: 1,
  evidenceDeclarationCount: 1,
};
const semanticBase = {
  ...semantic,
  queryMatchCount: 0,
  evidenceDeclarationCount: 0,
};
const queryOutput: any = {
  query: "symbol",
  root: CHENG_CURRENT_ROOT,
  factsPath: semantic.factsPath,
  factsRoot: semantic.factsRoot,
  factsSource: CHENG_FUSION_TYPE_ARENA_QUERY_SUBSTRATE_PATH,
  factsEntrySource: CHENG_FUSION_TYPE_ARENA_ENTRY_SUBSTRATE_PATH,
  name: CHENG_FUSION_TYPE_ARENA_SYMBOL,
  matches: [
    {
      id: "cold:data:1",
      name: CHENG_FUSION_TYPE_ARENA_SYMBOL,
      kind: "csg.symbol",
      symbolKind: "data",
      exported: true,
      loc: {
        file: CHENG_FUSION_TYPE_ARENA_QUERY_SUBSTRATE_PATH,
        recordLine: 42,
      },
    },
  ],
};
const evidenceOutput: any = {
  root: CHENG_CURRENT_ROOT,
  factsPath: semantic.factsPath,
  factsRoot: semantic.factsRoot,
  factsSource: CHENG_FUSION_TYPE_ARENA_QUERY_SUBSTRATE_PATH,
  factsEntrySource: CHENG_FUSION_TYPE_ARENA_ENTRY_SUBSTRATE_PATH,
  symbol: {
    name: CHENG_FUSION_TYPE_ARENA_SYMBOL,
    declarationCount: 1,
    declarationFiles: [
      CHENG_FUSION_TYPE_ARENA_QUERY_SUBSTRATE_PATH,
    ],
    impactRadius: {
      inBoundCallers: 0,
      outBoundCallees: null,
    },
    crossModuleCallers: 0,
    crossModuleCallerFiles: [],
    factsRoot: semantic.factsRoot,
  },
};
assert.deepEqual(
  validateFreshMcpTypeArenaSemanticOutputs(
    semanticBase,
    queryOutput,
    evidenceOutput,
  ),
  semantic,
);
function rejectSemanticShape(
  name: string,
  mutate: (query: any, evidence: any) => void,
  expected: RegExp,
): void {
  const query = clone(queryOutput);
  const evidence = clone(evidenceOutput);
  mutate(query, evidence);
  assert.throws(
    () =>
      validateFreshMcpTypeArenaSemanticOutputs(
        semanticBase,
        query,
        evidence,
      ),
    expected,
    name,
  );
}
rejectSemanticShape(
  "absolute-facts-source",
  (query) =>
    (query.factsSource = CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE),
  /query_semantic_invalid/,
);
rejectSemanticShape(
  "wrong-declaration-file",
  (query) => (query.matches[0].loc.file = "src/core/lang/parser.cheng"),
  /query_exact_declaration_invalid/,
);
rejectSemanticShape(
  "fake-declaration-count",
  (_query, evidence) => (evidence.symbol.declarationCount = 2),
  /evidence_declaration_missing/,
);
rejectSemanticShape(
  "wrong-declaration-symbol-kind",
  (query) => (query.matches[0].symbolKind = "function"),
  /query_exact_declaration_invalid/,
);
rejectSemanticShape(
  "wrong-declaration-kind",
  (query) => (query.matches[0].kind = "cheng_cold.function"),
  /query_exact_declaration_invalid/,
);
rejectSemanticShape(
  "duplicate-declaration-identity",
  (query, evidence) => {
    query.matches.push(clone(query.matches[0]));
    evidence.symbol.declarationCount = 2;
  },
  /query_semantic_invalid/,
);
const report: any = {
  schema: CHENG_FUSION_FRESH_MCP_TYPE_ARENA_EXECUTION_SCHEMA,
  status: "PASS",
  red_count: 0,
  reason: "",
  projectRoot: CHENG_CURRENT_ROOT,
  entrySource: CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE,
  querySource: CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE,
  outputDir: CHENG_FUSION_TYPE_ARENA_OUTPUT_DIR,
  target: CHENG_FUSION_TYPE_ARENA_TARGET,
  symbol: CHENG_FUSION_TYPE_ARENA_SYMBOL,
  guardLimitBytes: 1073741824,
  guardMonitorPid: process.pid,
  officialDriver: {
    path: CHENG_CURRENT_OFFICIAL_DRIVER,
    byteLength: 64,
    bytesRaw32: hash("official-driver"),
  },
  sourceFiles,
  generationArtifacts,
  runtimeIdentity: runtime,
  steps: toolNames.map((toolName, index) => ({
    ordinal: index,
    requestId: requestIds[index],
    toolName,
    inputRaw32: hash(
      canonicalJson(
        index === 0
          ? {
              arguments: inputs[index],
              sourceFiles,
            }
          : {
              arguments: inputs[index],
              sourceFiles,
              generationArtifacts,
            },
      ),
    ),
    outputByteLength: 100 + index,
    outputRaw32: hash(`output-${index}`),
    responseByteLength: 1000 + index,
    responseRaw32: hash(`response-${index}`),
    serverPid: runtime.serverPid,
    runtimeStartedUnixMs: runtime.runtimeStartedUnixMs,
    initializationNonce: runtime.initializationNonce,
    runtimeReceiptRaw32: runtime.receiptRaw32,
  })),
  semantic,
  semanticRaw32: "",
  executionRaw32: "",
  receiptRaw32: "",
};
reportReseal(report);
validateFreshMcpTypeArenaExecutionReport(report, {
  requireCurrentArtifacts: false,
});

function reject(
  name: string,
  mutate: (value: any) => void,
  expected: RegExp,
): void {
  const value = clone(report);
  mutate(value);
  reportReseal(value);
  assert.throws(
    () =>
      validateFreshMcpTypeArenaExecutionReport(value, {
        requireCurrentArtifacts: false,
      }),
    expected,
    name,
  );
}

reject(
  "old-schema",
  (value) =>
    (value.schema =
      "cheng_fusion_fresh_mcp_type_arena_execution.v1"),
  /schema_invalid/,
);
reject(
  "response-deleted-process-exit-mid-sequence",
  (value) => value.steps.pop(),
  /pass_header_invalid/,
);
reject(
  "response-order-swap",
  (value) => {
    [value.steps[0], value.steps[1]] = [
      value.steps[1],
      value.steps[0],
    ];
  },
  /step_0_binding_invalid/,
);
reject(
  "tool-name-swap",
  (value) =>
    (value.steps[1].toolName = "cheng_evidence"),
  /step_1_binding_invalid/,
);
reject(
  "response-replay",
  (value) => {
    value.steps[2].outputRaw32 = value.steps[1].outputRaw32;
    value.steps[2].responseRaw32 = value.steps[1].responseRaw32;
  },
  /response_replay/,
);
reject(
  "step-pid-swap",
  (value) => (value.steps[1].serverPid += 1),
  /step_1_binding_invalid/,
);
reject(
  "step-nonce-swap",
  (value) =>
    (value.steps[1].initializationNonce = hash("other-nonce")),
  /step_1_binding_invalid/,
);
reject(
  "input-replay",
  (value) =>
    (value.steps[2].inputRaw32 = value.steps[1].inputRaw32),
  /step_2_binding_invalid/,
);
reject(
  "source-bytes-drift",
  (value) =>
    (value.sourceFiles.querySource.bytesRaw32 = hash(
      "mutated-query-source",
    )),
  /step_0_binding_invalid/,
);
reject(
  "facts-path-outside-generation",
  (value) => {
    value.generationArtifacts.facts.path = join(
      CHENG_FUSION_TYPE_ARENA_OUTPUT_DIR,
      "current.facts",
    );
    value.semantic.factsPath = value.generationArtifacts.facts.path;
  },
  /facts_pin_invalid/,
);
reject(
  "manifest-pin-drift",
  (value) =>
    (value.generationArtifacts.manifest.bytesRaw32 = hash(
      "mutated-manifest",
    )),
  /step_1_binding_invalid/,
);
const runtimePidSwap = clone(report);
runtimePidSwap.runtimeIdentity.serverPid += 1;
runtimeReseal(runtimePidSwap);
reportReseal(runtimePidSwap);
assert.throws(
  () =>
    validateFreshMcpTypeArenaExecutionReport(runtimePidSwap, {
      requireCurrentArtifacts: false,
    }),
  /step_0_binding_invalid/,
);

const runtimeNonceSwap = clone(report);
runtimeNonceSwap.runtimeIdentity.initializationNonce = hash(
  "runtime-nonce-swap",
);
runtimeReseal(runtimeNonceSwap);
reportReseal(runtimeNonceSwap);
assert.throws(
  () =>
    validateFreshMcpTypeArenaExecutionReport(runtimeNonceSwap, {
      requireCurrentArtifacts: false,
    }),
  /step_0_binding_invalid/,
);

const oldRuntimeSchema = clone(report);
oldRuntimeSchema.runtimeIdentity.schema =
  "cheng_fusion_mcp_runtime_identity.v1";
runtimeReseal(oldRuntimeSchema);
reportReseal(oldRuntimeSchema);
assert.throws(
  () =>
    validateFreshMcpTypeArenaExecutionReport(oldRuntimeSchema, {
      requireCurrentArtifacts: false,
    }),
  /mcp_runtime_identity_header_invalid/,
);

if (!existsSync(CHENG_CURRENT_OFFICIAL_DRIVER)) {
  const work = mkdtempSync(
    join(tmpdir(), "cheng-fresh-type-arena-guard-red-"),
  );
  try {
    const guardReport = join(work, "guard.report");
    const stdout = join(work, "stdout.json");
    const stderr = join(work, "stderr.txt");
    const guarded = spawnSync(
      GUARD,
      [
        "--rss-limit:1073741824",
        "--timeout:20",
        `--report-out:${guardReport}`,
        `--stdout:${stdout}`,
        `--stderr:${stderr}`,
        "--",
        process.execPath,
        SELF,
        "--guard-red-helper",
      ],
      {
        cwd: "/Users/lbcheng/cheng-fusion",
        env: {
          ...process.env,
          BEAT_C_GUARD_MONITOR_PYTHON:
            "/opt/miniconda3/bin/python3",
        },
        encoding: "utf8",
        timeout: 30000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    assert.equal(
      guarded.status,
      0,
      `guarded production RED helper failed: ${guarded.stderr}`,
    );
    const guardedReport = JSON.parse(readFileSync(stdout, "utf8"));
    assert.equal(guardedReport.status, "HARD_RED");
    assert.match(
      guardedReport.reason,
      /artifacts\/backend_driver\/cheng/,
    );
    const guardText = readFileSync(guardReport, "utf8");
    assert.match(guardText, /^status=completed$/m);
    assert.match(
      guardText,
      /^target_env_injected_parent_proof_fd=3$/m,
    );
    assert.match(
      guardText,
      /^target_env_injected_parent_proof_record_sha256=[0-9a-f]{64}$/m,
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

console.log(
  "item36 fresh MCP TypeArena execution: PASS guard/source/artifact/runtime/order/replay mutations; production RED without official driver",
);
