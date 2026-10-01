#!/usr/bin/env bun
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {
  SEMANTIC_SNAPSHOT_AUDIT_INPUT_SPECS,
  SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_GATE_PATH,
  auditPublishedCandidateGateRouting,
  captureSemanticSnapshotAuditInputs,
  composePublishedCandidateExecutionReceipt,
  verifyPublishedCandidateGateStdout,
  verifySemanticSnapshotAuditInputs,
} from "../src/cheng_semantic_snapshot_audit.ts";

const CHENG_ROOT = realpathSync.native(
  process.env.CHENG_FUSION_SEMANTIC_SNAPSHOT_ROOT ||
    "/Users/lbcheng/cheng-lang");
const FORMAL_SPEC_PATH = "docs/cheng-formal-spec.md";

function digest(raw: Buffer | string) {
  return createHash("sha256").update(raw).digest("hex");
}

function stdoutEntry(rawText:string) {
  const raw = Buffer.from(rawText, "utf8");
  return {raw, sha256: digest(raw), bytes: raw.length};
}

console.log("[A] formal spec has one outer authority and one inner closure route");
const formalSpecs = SEMANTIC_SNAPSHOT_AUDIT_INPUT_SPECS.filter(
  (spec: any) => spec.path === FORMAL_SPEC_PATH);
assert.equal(formalSpecs.length, 1);
assert.equal(formalSpecs[0].role, "formal_language_spec");
const gateSource = readFileSync(
  join(CHENG_ROOT, SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_GATE_PATH),
  "utf8");
const guardRaw = readFileSync(
  join(CHENG_ROOT, "tools/beat_c_process_group_guard.sh"));
assert.equal(
  auditPublishedCandidateGateRouting(gateSource, digest(guardRaw)).status,
  "pass");
const gateWithoutFormalSpecClosure = gateSource.replace(
  "src bootstrap cheng-package.toml cheng.lock.toml \\\n    docs/cheng-formal-spec.md",
  "src bootstrap cheng-package.toml cheng.lock.toml");
assert.notEqual(gateWithoutFormalSpecClosure, gateSource);
assert.throws(
  () => auditPublishedCandidateGateRouting(
    gateWithoutFormalSpecClosure, digest(guardRaw)),
  /routing missing: src bootstrap cheng-package.toml cheng.lock.toml docs\/cheng-formal-spec\.md/);
const gateWithoutFormalSpecReceipt = gateSource.replace(
  "printf 'formal_spec_sha256=%s\\n' \"$(sha_file \"$FORMAL_SPEC\")\"\n",
  "");
assert.notEqual(gateWithoutFormalSpecReceipt, gateSource);
assert.throws(
  () => auditPublishedCandidateGateRouting(
    gateWithoutFormalSpecReceipt, digest(guardRaw)),
  /routing missing: formal_spec_sha256=%s/);

console.log("[B] missing, same-byte replacement and runtime drift all fail");
const fixtureRoot = realpathSync.native(mkdtempSync(
  join(tmpdir(), "cheng-semantic-formal-spec-closure-")));
try {
  for (const spec of SEMANTIC_SNAPSHOT_AUDIT_INPUT_SPECS) {
    const path = join(fixtureRoot, spec.path);
    mkdirSync(dirname(path), {recursive: true});
    writeFileSync(path, `fixture:${spec.path}\n`);
  }
  const formalPath = join(fixtureRoot, FORMAL_SPEC_PATH);
  const formalRaw = readFileSync(formalPath);

  unlinkSync(formalPath);
  assert.throws(
    () => captureSemanticSnapshotAuditInputs(fixtureRoot),
    /ENOENT/);
  writeFileSync(formalPath, formalRaw);

  const replacementBaseline =
    captureSemanticSnapshotAuditInputs(fixtureRoot);
  const displacedFormalPath = join(
    fixtureRoot, "docs/cheng-formal-spec.displaced");
  renameSync(formalPath, displacedFormalPath);
  writeFileSync(formalPath, formalRaw);
  assert.throws(
    () => verifySemanticSnapshotAuditInputs(
      fixtureRoot, replacementBaseline,
      "formal spec same-byte replacement mutation"),
    /input drift during formal spec same-byte replacement mutation: docs\/cheng-formal-spec\.md/);
  unlinkSync(formalPath);
  renameSync(displacedFormalPath, formalPath);

  const driftBaseline = captureSemanticSnapshotAuditInputs(fixtureRoot);
  writeFileSync(formalPath, Buffer.concat([
    formalRaw,
    Buffer.from("# runtime drift\n", "utf8"),
  ]));
  assert.throws(
    () => verifySemanticSnapshotAuditInputs(
      fixtureRoot, driftBaseline,
      "after published candidate gate"),
    /input drift during after published candidate gate: docs\/cheng-formal-spec\.md/);
  writeFileSync(formalPath, formalRaw);

  console.log("[C] stdout and execution receipts bind the same formal spec hash");
  const baseline = captureSemanticSnapshotAuditInputs(fixtureRoot);
  const formalSpecSha256 =
    baseline.byPath.get(FORMAL_SPEC_PATH)!.sha256;
  const gateText = [
    "lsp_multifile_exact_snapshot_acceptance_gate_status=pass",
    `source_sha256=${baseline.byPath.get("src/tests/lsp_multifile_exact_snapshot_acceptance_smoke.cheng")!.sha256}`,
    `gate_sha256=${baseline.byPath.get(SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_GATE_PATH)!.sha256}`,
    `compiler_sha256=${"1".repeat(64)}`,
    `compiler_source_sha256=${baseline.byPath.get("bootstrap/cheng_cold.c")!.sha256}`,
    `formal_spec_sha256=${formalSpecSha256}`,
    `lsp_module_sha256=${baseline.byPath.get("src/core/tooling/lsp_server.cheng")!.sha256}`,
    `query_projection_module_sha256=${baseline.byPath.get("src/core/tooling/semantic_snapshot_query_projection.cheng")!.sha256}`,
    `compiler_csg_module_sha256=${baseline.byPath.get("src/core/tooling/compiler_csg.cheng")!.sha256}`,
    `source_closure_cid=${"2".repeat(64)}`,
    `object_sha256=${"3".repeat(64)}`,
    `lsp_multifile_exact_snapshot_acceptance_status=pass published=1 source_version=6 documents=3 open_documents=3 binding_receipt=${"4".repeat(64)} query_projection=${"5".repeat(64)} open_document_universe=${"7".repeat(64)} snapshot_payload=${"8".repeat(64)}`,
  ].join("\n") + "\n";
  const gateRaw = Buffer.from(gateText, "utf8");
  const runtimeReceipt = verifyPublishedCandidateGateStdout(
    {raw: gateRaw, sha256: digest(gateRaw), bytes: gateRaw.length},
    baseline,
    "6".repeat(64));
  assert.equal(runtimeReceipt.formalSpecSha256, formalSpecSha256);
  assert.equal(runtimeReceipt.snapshotPayloadCid, "8".repeat(64));
  const executionReceipt = composePublishedCandidateExecutionReceipt(
    runtimeReceipt,
    {status: "pass", receiptCid: "9".repeat(64)},
    "6".repeat(64));
  assert.equal(executionReceipt.formalSpecSha256, formalSpecSha256);
  assert.throws(
    () => composePublishedCandidateExecutionReceipt(
      {...runtimeReceipt, formalSpecSha256: undefined},
      {status: "pass", receiptCid: "9".repeat(64)},
      "6".repeat(64)),
    /formal spec SHA-256/);
  assert.throws(
    () => composePublishedCandidateExecutionReceipt(
      {...runtimeReceipt, snapshotPayloadCid: "a".repeat(64)},
      {status: "pass", receiptCid: "9".repeat(64)},
      "6".repeat(64)),
    /runtime receipt CID does not bind its complete authority/);

  const missingSnapshotPayloadText = gateText.replace(
    ` snapshot_payload=${"8".repeat(64)}`, "");
  assert.notEqual(missingSnapshotPayloadText, gateText);
  assert.throws(
    () => verifyPublishedCandidateGateStdout(
      stdoutEntry(missingSnapshotPayloadText),
      baseline,
      "6".repeat(64)),
    /runtime publication receipt is malformed/);
  const aliasedSnapshotPayloadText = gateText.replace(
    `snapshot_payload=${"8".repeat(64)}`,
    `snapshot_payload=${"4".repeat(64)}`);
  assert.notEqual(aliasedSnapshotPayloadText, gateText);
  assert.throws(
    () => verifyPublishedCandidateGateStdout(
      stdoutEntry(aliasedSnapshotPayloadText),
      baseline,
      "6".repeat(64)),
    /publication identities are empty or aliased/);
  const legacySnapshotPayloadFieldText = gateText.replace(
    `snapshot_payload=${"8".repeat(64)}`,
    `snapshot_payload=${"8".repeat(64)} snapshot_payload_cid=${"9".repeat(64)}`);
  assert.notEqual(legacySnapshotPayloadFieldText, gateText);
  assert.throws(
    () => verifyPublishedCandidateGateStdout(
      stdoutEntry(legacySnapshotPayloadFieldText),
      baseline,
      "6".repeat(64)),
    /runtime publication receipt is malformed/);

  const missingFormalLine = gateText
    .split("\n")
    .filter((line) => !line.startsWith("formal_spec_sha256="))
    .join("\n");
  assert.throws(
    () => verifyPublishedCandidateGateStdout(
      {
        raw: Buffer.from(missingFormalLine, "utf8"),
        sha256: digest(missingFormalLine),
        bytes: Buffer.byteLength(missingFormalLine),
      },
      baseline,
      "6".repeat(64)),
    /field set is not the unique current schema/);
  const replacedFormalLine = gateText.replace(
    `formal_spec_sha256=${formalSpecSha256}`,
    `formal_spec_sha256=${"9".repeat(64)}`);
  assert.throws(
    () => verifyPublishedCandidateGateStdout(
      {
        raw: Buffer.from(replacedFormalLine, "utf8"),
        sha256: digest(replacedFormalLine),
        bytes: Buffer.byteLength(replacedFormalLine),
      },
      baseline,
      "6".repeat(64)),
    /formal_spec_sha256 is not bound/);
} finally {
  rmSync(fixtureRoot, {recursive: true, force: true});
}

console.log("item30 semantic snapshot formal spec closure mutations: PASS");
