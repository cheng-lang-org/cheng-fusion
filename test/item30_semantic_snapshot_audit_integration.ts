#!/usr/bin/env bun
import assert from "node:assert/strict";
import {realpathSync} from "node:fs";
import {handleMcpRequest} from "../src/cheng_fusion_mcp_server_m9009.ts";
import {
  SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES,
  SEMANTIC_SNAPSHOT_AUDIT_SCHEMA,
  SEMANTIC_SNAPSHOT_AUDIT_SCOPE,
} from "../src/cheng_semantic_snapshot_audit.ts";

const root = realpathSync.native(process.env.CHENG_FUSION_SEMANTIC_SNAPSHOT_ROOT || "/Users/lbcheng/cheng-lang");

console.log("[A] the unique registry advertises one root-required mutating audit tool");
const listed = await handleMcpRequest({jsonrpc: "2.0", id: 1, method: "tools/list", params: {}});
const matches = listed.tools.filter((tool:any) => tool.name === "cheng_semantic_snapshot_audit");
assert.equal(matches.length, 1);
assert.equal(matches[0].annotations.readOnlyHint, false);
assert.equal(matches[0].inputSchema.type, "object");
assert.equal(matches[0].inputSchema.properties.root.type, "string");

console.log("[B] explicit root works without activated workspace roots and runs all three exact 1 GiB guards");
const called = await handleMcpRequest({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: {
    name: "cheng_semantic_snapshot_audit",
    arguments: {root, scope: SEMANTIC_SNAPSHOT_AUDIT_SCOPE},
  },
});
assert.equal(called.isError, undefined, called.content?.[0]?.text || "semantic snapshot audit failed");
const result = JSON.parse(called.content[0].text);
assert.equal(result.schema, SEMANTIC_SNAPSHOT_AUDIT_SCHEMA);
assert.equal(result.status, "pass");
assert.equal(result.scope, SEMANTIC_SNAPSHOT_AUDIT_SCOPE);
assert.equal(result.root, root);
assert.equal(result.memoryLimitBytes, SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES);
assert.equal(result.structuralAudit.status, "pass");
assert.equal(result.gates.length, 3);
assert.deepEqual(result.gates.map((gate:any) => gate.name), ["core", "production", "rejection"]);
for (const gate of result.gates) {
  assert.equal(gate.exitCode, 0);
  assert.match(gate.sourceSha256, /^[0-9a-f]{64}$/);
  assert.match(gate.guardReceipt.receiptCid, /^[0-9a-f]{64}$/);
  assert.equal(gate.guardReceipt.memoryLimitBytes, SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES);
  if (gate.guardReceipt.guardScope === "whole_gate_process_tree") {
    assert.ok(gate.guardReceipt.memorySampleCount > 0);
    assert.ok(gate.guardReceipt.processTreePeakBytes <= SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES);
  } else {
    assert.equal(gate.guardReceipt.guardScope, "each_external_process_tree");
    assert.equal(gate.guardReceipt.guardedCommandCount, 5);
    assert.equal(gate.guardReceipt.perProcessTimeoutSeconds, 180);
    assert.match(gate.guardReceipt.routingReceiptCid, /^[0-9a-f]{64}$/);
  }
  assert.match(gate.stdout, /_gate_status=pass\n/);
}
assert.match(result.sourceSetCid, /^[0-9a-f]{64}$/);
assert.match(result.auditCid, /^[0-9a-f]{64}$/);

console.log(`item30 semantic snapshot audit integration: PASS auditCid=${result.auditCid}`);
