#!/usr/bin/env bun
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {handleMcpRequest} from "../src/cheng_fusion_mcp_server_m9009.ts";
import {
  CID_IDENTITY_CHAIN_AUDIT_SCHEMA,
  runCidIdentityChainAudit,
} from "../src/cheng_cid_identity_chain_audit.ts";
import {
  CID_CURRENT_DRIVER_CONTAINER_PATH,
  CID_CURRENT_DRIVER_RUN_CASE_COMMAND,
  cidCaseTargetArgv,
  verifyCidEvidence,
} from "../src/cheng_cid_identity_chain_evidence.ts";
import {
  probeFreshChengFusionMcpRuntime,
  validateFreshChengFusionMcpRuntimeReceipt,
} from "../src/cheng_fusion_fresh_mcp_probe.ts";
import {
  validateChengFusionMcpRuntimeIdentity,
} from "../src/cheng_fusion_mcp_runtime_identity.ts";

const CLI = fileURLToPath(new URL("../cli.ts", import.meta.url));
const controllerCandidateSha256 = "ab".repeat(32);
assert.deepEqual(
  cidCaseTargetArgv("mcp-controller-binding", controllerCandidateSha256),
  [
    CID_CURRENT_DRIVER_CONTAINER_PATH,
    CID_CURRENT_DRIVER_RUN_CASE_COMMAND,
    "mcp-controller-binding",
    controllerCandidateSha256,
  ],
);

const initialized = await handleMcpRequest({
  jsonrpc: "2.0",
  id: 0,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    _meta: {
      chengFusionRuntimeNonce:
        "0f22a91362f27426828189a01ff0e3c6b33a281b18276537601f2630244348b8",
    },
  },
});
assert.equal(initialized.serverInfo.name, "cheng-fusion");
assert.equal(initialized.serverInfo.version, "current");
validateChengFusionMcpRuntimeIdentity(
  initialized.serverInfo.runtimeIdentity,
  {
    expectedServerPid: process.pid,
    expectedInitializationNonce:
      "0f22a91362f27426828189a01ff0e3c6b33a281b18276537601f2630244348b8",
  },
);
await assert.rejects(
  handleMcpRequest({
    jsonrpc: "2.0",
    id: 99,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
    },
  }),
  /runtime_already_initialized/,
);
const freshRuntime = await probeFreshChengFusionMcpRuntime();
validateFreshChengFusionMcpRuntimeReceipt(freshRuntime);
assert.notEqual(freshRuntime.serverPid, process.pid);
const staleSchema = structuredClone(freshRuntime) as any;
staleSchema.runtimeIdentity.schema = "cheng_fusion_mcp_runtime_identity.v1";
assert.throws(
  () => validateFreshChengFusionMcpRuntimeReceipt(staleSchema),
  /mcp_runtime_identity_header_invalid/,
);
const staleSource = structuredClone(freshRuntime) as any;
staleSource.runtimeIdentity.sources[0].bytesRaw32 =
  "1".repeat(64);
assert.throws(
  () => validateFreshChengFusionMcpRuntimeReceipt(staleSource),
  /mcp_runtime_implementation_identity_drift/,
);

const listed = await handleMcpRequest({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list",
  params: {},
});
const matches = listed.tools.filter((tool: any) =>
  tool.name === "cheng_cid_identity_chain_audit"
);
assert.equal(matches.length, 1);
assert.equal(matches[0].annotations.readOnlyHint, true);
assert.equal(matches[0].inputSchema.type, "object");
assert.deepEqual(matches[0].inputSchema.required, ["manifestPath"]);

assert.throws(
  () => runCidIdentityChainAudit("relative/evidence.json"),
  /absolute canonical path/,
);
const missing = await handleMcpRequest({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: {
    name: "cheng_cid_identity_chain_audit",
    arguments: {manifestPath: "/does/not/exist/evidence.json"},
  },
});
assert.equal(missing.isError, true);
assert.match(missing.content[0].text, /ENOENT|no such file/i);
assert.doesNotMatch(missing.content[0].text, /workspace root/i);
assert.deepEqual(
  missing._meta.chengFusionRuntimeIdentity,
  initialized.serverInfo.runtimeIdentity,
);
const missingCli = spawnSync(process.execPath, [
  CLI,
  "run",
  "cheng_cid_identity_chain_audit",
  "--input",
  JSON.stringify({manifestPath: "/does/not/exist/evidence.json"}),
], {cwd: dirname(CLI), encoding: "utf8"});
assert.equal(missingCli.status, 1, missingCli.stderr);
assert.equal(missingCli.stderr, "");
const missingCliResult = JSON.parse(missingCli.stdout);
assert.equal(missingCliResult.isError, true);
assert.match(missingCliResult.content[0].text, /ENOENT|no such file/i);
assert.doesNotMatch(missingCliResult.content[0].text, /workspace root/i);

const evidence = process.env.CHENG_FUSION_CID_EVIDENCE;
if (evidence) {
  const manifestPath = realpathSync.native(evidence);
  const expected = verifyCidEvidence(manifestPath);
  const called = await handleMcpRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "cheng_cid_identity_chain_audit",
      arguments: {manifestPath},
    },
  });
  assert.equal(called.isError, undefined, called.content?.[0]?.text || "CID MCP audit failed");
  assert.deepEqual(
    called._meta.chengFusionRuntimeIdentity,
    initialized.serverInfo.runtimeIdentity,
  );
  const actual = JSON.parse(called.content[0].text);
  assert.equal(actual.schema, CID_IDENTITY_CHAIN_AUDIT_SCHEMA);
  assert.equal(actual.status, "CID_GREEN_CANDIDATE");
  assert.equal(actual.manifestPath, manifestPath);
  assert.equal(actual.manifestSha256, expected.manifestSha256);
  assert.equal(actual.candidateSha256, expected.candidateSha256);
  assert.deepEqual(actual.caseIds, expected.caseIds);
  const cli = spawnSync(process.execPath, [
    CLI,
    "run",
    "cheng_cid_identity_chain_audit",
    "--input",
    JSON.stringify({manifestPath}),
  ], {cwd: dirname(CLI), encoding: "utf8"});
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stderr, "");
  const cliActual = JSON.parse(cli.stdout);
  assert.equal(cliActual.isError, undefined);
  assert.deepEqual(JSON.parse(cliActual.content[0].text), actual);
  console.log(`item31 CID identity-chain MCP: PASS manifest=${actual.manifestSha256}`);
} else {
  console.log("item31 CID identity-chain MCP wiring: PASS (production evidence pending)");
}
