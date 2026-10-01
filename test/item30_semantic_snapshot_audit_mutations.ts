#!/usr/bin/env bun
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {handleMcpRequest} from "../src/cheng_fusion_mcp_server_m9009.ts";
import {
  SEMANTIC_SNAPSHOT_AUDIT_INPUT_SPECS,
  SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_GATE_PATH,
  GATE_SPECS,
  auditSemanticSnapshotProductionClosure,
  auditPublishedCandidateGateRouting,
  auditInternallyGuardedGate,
  auditColdCompilerIncludeClosure,
  auditSemanticSnapshotStructure,
  composePublishedCandidateExecutionReceipt,
  captureSemanticSnapshotAuditInputs,
  cleanupPublishedCandidateNextPathAuthority,
  createPublishedCandidateNextPathAuthority,
  publishedCandidateNextEnvironment,
  runSemanticSnapshotAudit,
  semanticSnapshotProductionClosureOuterAuditCid,
  semanticSnapshotPublishedCandidateReceiptBindingCid,
  validatePublishedCandidateNextPathAuthority,
  verifyPublishedCandidateNextArtifactBindings,
  verifyPublishedCandidateGateStdout,
  verifySemanticSnapshotAuditInputs,
} from "../src/cheng_semantic_snapshot_audit.ts";

const CHENG_ROOT = realpathSync.native(process.env.CHENG_FUSION_SEMANTIC_SNAPSHOT_ROOT || "/Users/lbcheng/cheng-lang");
const CORE_PATH = join(CHENG_ROOT, "src/core/tooling/semantic_snapshot.cheng");
const PRODUCTION_PATH = join(CHENG_ROOT, "src/core/tooling/semantic_snapshot_production.cheng");
const coreSource = readFileSync(CORE_PATH, "utf8");
const productionSource = readFileSync(PRODUCTION_PATH, "utf8");
const builderSource = readFileSync(join(CHENG_ROOT, "src/core/tooling/compiler_snapshot_builder.cheng"), "utf8");
const lspSource = readFileSync(join(CHENG_ROOT, "src/core/tooling/lsp_server.cheng"), "utf8");
const schemaSource = readFileSync(join(CHENG_ROOT, "src/core/csg_core/compiler_snapshot_schema.cheng"), "utf8");
const cargoSource = readFileSync(join(CHENG_ROOT, "src/core/csg_core/compiler_snapshot_cargo.cheng"), "utf8");
const cargoValidatorSource = readFileSync(join(CHENG_ROOT, "src/core/csg_core/validator.cheng"), "utf8");
const compilerFactsSource = readFileSync(join(CHENG_ROOT, "src/core/backend/compiler_facts.cheng"), "utf8");
const typedExprSource = readFileSync(join(CHENG_ROOT, "src/core/lang/typed_expr.cheng"), "utf8");
const compilerCsgSource = readFileSync(join(CHENG_ROOT, "src/core/tooling/compiler_csg.cheng"), "utf8");
const lspVersionIsolationSmokeSource = readFileSync(
  join(CHENG_ROOT, "src/tests/lsp_multifile_exact_snapshot_acceptance_smoke.cheng"), "utf8");
const primaryObjectPlanSource = readFileSync(join(CHENG_ROOT, "src/core/backend/primary_object_plan.cheng"), "utf8");
const directObjectEmitSource = readFileSync(join(CHENG_ROOT, "src/core/backend/direct_object_emit.cheng"), "utf8");
const machoObjectWriterSource = readFileSync(join(CHENG_ROOT, "src/core/backend/macho_object_writer.cheng"), "utf8");
const closureSources = Object.freeze({
  builderSource,
  lspSource,
  schemaSource,
  cargoSource,
  cargoValidatorSource,
  compilerFactsSource,
  typedExprSource,
  compilerCsgSource,
  lspVersionIsolationSmokeSource,
  primaryObjectPlanSource,
  directObjectEmitSource,
  machoObjectWriterSource,
});

function injectBeforeNextFunction(source:string, functionName:string, statement:string) {
  const start = source.indexOf(`fn ${functionName}(`);
  assert.notEqual(start, -1, `missing mutation target ${functionName}`);
  const next = source.indexOf("\nfn ", start + functionName.length + 4);
  const end = next < 0 ? source.length : next;
  return `${source.slice(0, end)}\n    ${statement}\n${source.slice(end)}`;
}

function replaceExactlyOnce(
  source:string,
  needle:string,
  replacement:string,
  label:string,
) {
  assert.notEqual(needle, replacement, `${label} replacement is unchanged`);
  assert.equal(
    source.split(needle).length - 1,
    1,
    `${label} mutation target is not unique`,
  );
  return source.replace(needle, replacement);
}

function digest(raw:Buffer|string) {
  return createHash("sha256").update(raw).digest("hex");
}

function stdoutEntry(rawText:string) {
  const raw = Buffer.from(rawText, "utf8");
  return {raw, sha256: digest(raw), bytes: raw.length};
}

function frameCidPart(value:string|number|boolean) {
  const raw = Buffer.from(String(value), "utf8");
  const size = Buffer.allocUnsafe(4);
  size.writeUInt32BE(raw.length, 0);
  return [size, raw];
}

function executionReceiptCid(receipt:any) {
  const parts = [
    "cheng.semantic_snapshot.published_candidate_execution_receipt",
    receipt.sourceSetCid,
    receipt.runtimeReceiptCid,
    receipt.routingReceiptCid,
    receipt.sourceVersion,
    receipt.documentCount,
    receipt.openDocumentCount,
    receipt.compilerSha256,
    receipt.formalSpecSha256,
    receipt.sourceClosureCid,
    receipt.objectSha256,
    receipt.bindingReceiptCid,
    receipt.queryProjectionCid,
    receipt.openDocumentUniverseCid,
    receipt.snapshotPayloadCid,
    receipt.stdoutSha256,
  ];
  const hash = createHash("sha256");
  for (const framed of parts.flatMap(frameCidPart)) hash.update(framed);
  return hash.digest("hex");
}

console.log("[A] production sources satisfy the independent structural audit");
const baselineStructure = auditSemanticSnapshotStructure(coreSource, productionSource);
assert.equal(baselineStructure.status, "pass");
assert.match(baselineStructure.receiptCid, /^[0-9a-f]{64}$/);
const compilerInputs = captureSemanticSnapshotAuditInputs(CHENG_ROOT);
assert.equal(
  compilerInputs.byPath.get("docs/cheng-formal-spec.md")?.role,
  "formal_language_spec");
assert.equal(auditColdCompilerIncludeClosure(compilerInputs).status, "pass");
await assert.rejects(
  runSemanticSnapshotAudit(CHENG_ROOT, "atomic_publish", 120, true),
  /only valid for production_closure/);
await assert.rejects(
  runSemanticSnapshotAudit(CHENG_ROOT, "production_closure", 120, true),
  /timeoutSeconds must be at least 1230/);

console.log("[A1] published candidate NEXT paths have one exact private authority");
{
  const authority = createPublishedCandidateNextPathAuthority();
  try {
    const env = publishedCandidateNextEnvironment(authority, {
      PATH: "/usr/bin:/bin",
    });
    assert.equal(
      validatePublishedCandidateNextPathAuthority(
        authority, env, false).length,
      0,
    );
    const envNames = [
      "CHENG_LSP_PUBLISHED_BINDING_NEXT",
      "CHENG_LSP_PUBLISHED_QUERY_PROJECTION_NEXT",
      "CHENG_LSP_PUBLISHED_OPEN_DOCUMENT_UNIVERSE_NEXT",
      "CHENG_LSP_PUBLISHED_SNAPSHOT_NEXT",
    ];
    const paths = envNames.map((name) => env[name]);
    assert.equal(new Set(paths).size, 4);

    const missingEnv = {...env};
    delete missingEnv[envNames[0]];
    assert.throws(
      () => validatePublishedCandidateNextPathAuthority(
        authority, missingEnv, false),
      /environment authority set invalid/);

    const swappedEnv = {...env};
    [swappedEnv[envNames[0]], swappedEnv[envNames[1]]] =
      [swappedEnv[envNames[1]], swappedEnv[envNames[0]]];
    assert.throws(
      () => validatePublishedCandidateNextPathAuthority(
        authority, swappedEnv, false),
      /path authority invalid/);

    assert.throws(
      () => publishedCandidateNextEnvironment(authority, {
        CHENG_LSP_PUBLISHED_LEGACY_NEXT: "/tmp/legacy.next",
      }),
      /extra authority/);

    for (let index = 0; index < 3; index += 1) {
      writeFileSync(paths[index], `published-next-${index}\n`);
    }
    assert.throws(
      () => validatePublishedCandidateNextPathAuthority(
        authority, env, true),
      /artifact path set invalid/);

    writeFileSync(paths[3], "published-next-3\n");
    const extraPath = join(authority.root, "unexpected.next");
    writeFileSync(extraPath, "unexpected\n");
    assert.throws(
      () => validatePublishedCandidateNextPathAuthority(
        authority, env, true),
      /artifact path set invalid/);
    rmSync(extraPath);

    const entries = validatePublishedCandidateNextPathAuthority(
      authority, env, true);
    const byRole = new Map(entries.map((entry) => [
      entry.role,
      entry.sha256,
    ]));
    const runtimeReceipt = {
      bindingReceiptCid: byRole.get("published_binding_next"),
      queryProjectionCid:
        byRole.get("published_query_projection_next"),
      openDocumentUniverseCid:
        byRole.get("published_open_document_universe_next"),
      snapshotPayloadCid: byRole.get("published_snapshot_next"),
    };
    assert.doesNotThrow(() =>
      verifyPublishedCandidateNextArtifactBindings(
        entries, runtimeReceipt));
    assert.throws(
      () => verifyPublishedCandidateNextArtifactBindings(entries, {
        ...runtimeReceipt,
        bindingReceiptCid: runtimeReceipt.queryProjectionCid,
      }),
      /artifact CID drift/);

    const replacement = `${paths[0]}.replacement`;
    copyFileSync(paths[0], replacement);
    renameSync(replacement, paths[0]);
    assert.throws(
      () => validatePublishedCandidateNextPathAuthority(
        authority, env, true, entries),
      /artifact identity drift/);
  } finally {
    cleanupPublishedCandidateNextPathAuthority(authority);
  }
}

console.log("[A2] production closure proves exact contracts without hiding real publication blockers");
const closure = auditSemanticSnapshotProductionClosure(closureSources);
assert.equal(closure.status, "incomplete");
assert.equal(closure.observations.moduleSymbolCoordinateContractExact, true);
assert.equal(closure.observations.referenceOwnerSymbolColumnExact, true);
assert.equal(closure.observations.referenceOwnerSourceFunctionTargetKindExact, true);
assert.equal(closure.observations.referenceBuilderOwnerRemapExact, true);
assert.equal(closure.observations.referenceCargoBindingExact, true);
assert.equal(closure.observations.compilerReferenceFactProjectionExact, true);
assert.equal(closure.observations.lspReferenceIdentityExact, true);
assert.equal(closure.observations.referenceIdentityNoTextOrNameArity, true);
assert.equal(closure.observations.referenceOwnerIdentityContractExact, true);
assert.equal(closure.observations.builderProjectsModuleSymbols, true);
assert.equal(closure.observations.exactCallProjection, true);
assert.equal(closure.observations.lspSixQueryUncompletedVersionRejection, true);
assert.equal(closure.observations.machoDwarfSectionRelocationConsumptionExact, true);
assert.equal(closure.observations.publishedCandidateEvidence, false);
assert.ok(!closure.blockers.includes("builder_missing_module_symbol_projection"));
assert.ok(!closure.blockers.includes("builder_missing_parser_declaration_stream_consumption"));
assert.ok(!closure.blockers.includes("builder_missing_parser_pattern_stream_consumption"));
assert.ok(!closure.blockers.includes("builder_symbol_count_equals_function_count"));
assert.ok(!closure.blockers.includes("builder_rejects_non_function_symbols"));
assert.ok(!closure.blockers.includes("admission_forces_all_fact_domains_missing"));
assert.ok(!closure.blockers.includes("admission_requires_blocked_receipt"));
assert.ok(!closure.blockers.includes("lsp_missing_production_stage_candidate"));
assert.ok(!closure.blockers.includes("lsp_missing_production_commit_candidate"));
assert.ok(!closure.blockers.includes("lsp_rejection_only_producer"));
assert.equal(closure.observations.candidatePublicationRequiresZeroMissingFacts, true);
assert.equal(closure.observations.publishedCandidateFixtureMultifileExact, true);
assert.ok(closure.blockers.includes("no_published_candidate_evidence"));
assert.ok(!closure.blockers.some((blocker:string) => blocker.includes("reference_")));

console.log("[A2.1] a real gate receipt closes publication evidence and mutations hard-fail");
const gateSource = readFileSync(
  join(CHENG_ROOT, SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_GATE_PATH), "utf8");
assert.equal(auditPublishedCandidateGateRouting(
  gateSource,
  compilerInputs.byPath.get("tools/beat_c_process_group_guard.sh")!.sha256).status, "pass");
const gateWithoutFormalSpecClosure = gateSource.replace(
  "src bootstrap cheng-package.toml cheng.lock.toml \\\n    docs/cheng-formal-spec.md",
  "src bootstrap cheng-package.toml cheng.lock.toml");
assert.notEqual(gateWithoutFormalSpecClosure, gateSource);
assert.throws(
  () => auditPublishedCandidateGateRouting(
    gateWithoutFormalSpecClosure,
    compilerInputs.byPath.get("tools/beat_c_process_group_guard.sh")!.sha256),
  /published candidate gate routing missing: src bootstrap cheng-package.toml cheng.lock.toml docs\/cheng-formal-spec\.md/);
const publishedGateText = [
  "lsp_multifile_exact_snapshot_acceptance_gate_status=pass",
  `source_sha256=${compilerInputs.byPath.get("src/tests/lsp_multifile_exact_snapshot_acceptance_smoke.cheng")!.sha256}`,
  `gate_sha256=${compilerInputs.byPath.get(SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_GATE_PATH)!.sha256}`,
  `compiler_sha256=${"1".repeat(64)}`,
  `compiler_source_sha256=${compilerInputs.byPath.get("bootstrap/cheng_cold.c")!.sha256}`,
  `formal_spec_sha256=${compilerInputs.byPath.get("docs/cheng-formal-spec.md")!.sha256}`,
  `lsp_module_sha256=${compilerInputs.byPath.get("src/core/tooling/lsp_server.cheng")!.sha256}`,
  `query_projection_module_sha256=${compilerInputs.byPath.get("src/core/tooling/semantic_snapshot_query_projection.cheng")!.sha256}`,
  `compiler_csg_module_sha256=${compilerInputs.byPath.get("src/core/tooling/compiler_csg.cheng")!.sha256}`,
  `source_closure_cid=${"2".repeat(64)}`,
  `object_sha256=${"3".repeat(64)}`,
  `lsp_multifile_exact_snapshot_acceptance_status=pass published=1 source_version=6 documents=3 open_documents=3 binding_receipt=${"4".repeat(64)} query_projection=${"5".repeat(64)} open_document_universe=${"7".repeat(64)} snapshot_payload=${"8".repeat(64)}`,
].join("\n") + "\n";
const publishedGateRaw = Buffer.from(publishedGateText, "utf8");
const publishedStdoutReceipt = verifyPublishedCandidateGateStdout(
  {raw: publishedGateRaw, sha256: digest(publishedGateRaw), bytes: publishedGateRaw.length},
  compilerInputs,
  "6".repeat(64));
assert.equal(publishedStdoutReceipt.status, "validated");
assert.equal(publishedStdoutReceipt.sourceVersion, 6);
assert.equal(publishedStdoutReceipt.snapshotPayloadCid, "8".repeat(64));
assert.equal(
  publishedStdoutReceipt.formalSpecSha256,
  compilerInputs.byPath.get("docs/cheng-formal-spec.md")!.sha256);
const publishedReceipt = composePublishedCandidateExecutionReceipt(
  publishedStdoutReceipt,
  auditPublishedCandidateGateRouting(
    gateSource,
    compilerInputs.byPath.get("tools/beat_c_process_group_guard.sh")!.sha256),
  "6".repeat(64));
const closureWithPublishedReceipt = auditSemanticSnapshotProductionClosure(
  closureSources, publishedReceipt);
assert.equal(closureWithPublishedReceipt.observations.publishedCandidateEvidence, true);
assert.equal(
  closureWithPublishedReceipt.observations
    .publishedCandidateGateProvenanceExact,
  false);
assert.ok(!closureWithPublishedReceipt.blockers.includes("no_published_candidate_evidence"));
assert.equal(executionReceiptCid(publishedReceipt), publishedReceipt.receiptCid);
const productionClosureWithSyntheticReceipt =
  auditSemanticSnapshotProductionClosure(
    closureSources, publishedReceipt, true);
assert.equal(
  productionClosureWithSyntheticReceipt.observations
    .publishedCandidateEvidence,
  false);
assert.ok(productionClosureWithSyntheticReceipt.blockers.includes(
  "no_published_candidate_evidence"));
assert.notEqual(
  productionClosureWithSyntheticReceipt.receiptCid,
  closureWithPublishedReceipt.receiptCid);
const changedRuntimePayloadReceipt = {
  ...publishedStdoutReceipt,
  snapshotPayloadCid: "a".repeat(64),
};
assert.throws(
  () => composePublishedCandidateExecutionReceipt(
    changedRuntimePayloadReceipt,
    auditPublishedCandidateGateRouting(
      gateSource,
      compilerInputs.byPath.get("tools/beat_c_process_group_guard.sh")!.sha256),
    "6".repeat(64)),
  /runtime receipt CID does not bind its complete authority/);
const executionWithoutSnapshotPayload = {...publishedReceipt};
delete executionWithoutSnapshotPayload.snapshotPayloadCid;
assert.equal(auditSemanticSnapshotProductionClosure(
  closureSources,
  executionWithoutSnapshotPayload).observations.publishedCandidateEvidence,
false);
const changedExecutionPayloadReceipt = {
  ...publishedReceipt,
  snapshotPayloadCid: "a".repeat(64),
};
changedExecutionPayloadReceipt.receiptCid =
  executionReceiptCid(changedExecutionPayloadReceipt);
const changedExecutionPayloadClosure = auditSemanticSnapshotProductionClosure(
  closureSources, changedExecutionPayloadReceipt);
assert.equal(
  changedExecutionPayloadClosure.observations.publishedCandidateEvidence,
  false);
assert.ok(changedExecutionPayloadClosure.blockers.includes(
  "no_published_candidate_evidence"));
const publishedCandidatePresenceVariants = [
  null,
  {receiptCid: ""},
  {receiptCid: "0".repeat(64)},
  {status: "pass", receiptCid: "9".repeat(64)},
  publishedReceipt,
];
const publishedCandidateBindingCids =
  publishedCandidatePresenceVariants.map((receipt) =>
    semanticSnapshotPublishedCandidateReceiptBindingCid(receipt));
assert.equal(
  new Set(publishedCandidateBindingCids).size,
  publishedCandidatePresenceVariants.length);
const publishedCandidateClosureCids =
  publishedCandidatePresenceVariants.map((receipt) =>
    auditSemanticSnapshotProductionClosure(
      closureSources, receipt).receiptCid);
assert.equal(
  new Set(publishedCandidateClosureCids).size,
  publishedCandidatePresenceVariants.length);
const publishedCandidateOuterAuditCids =
  publishedCandidatePresenceVariants.map((receipt) =>
    semanticSnapshotProductionClosureOuterAuditCid(
      "1".repeat(64),
      "2".repeat(64),
      "3".repeat(64),
      "4".repeat(64),
      receipt));
assert.equal(
  new Set(publishedCandidateOuterAuditCids).size,
  publishedCandidatePresenceVariants.length);
assert.equal(auditSemanticSnapshotProductionClosure(
  closureSources,
  {...publishedReceipt, formalSpecSha256: undefined})
  .observations.publishedCandidateEvidence,
false);
assert.equal(auditSemanticSnapshotProductionClosure(
  closureSources,
  {status: "pass", receiptCid: "9".repeat(64)}).observations.publishedCandidateEvidence,
false);
assert.throws(() => verifyPublishedCandidateGateStdout(
  {raw: Buffer.from(publishedGateText.replace("published=1", "published=0")), sha256: "7".repeat(64), bytes: publishedGateRaw.length},
  compilerInputs,
  "6".repeat(64)), /runtime publication receipt is malformed/);
const missingSnapshotPayloadText = publishedGateText.replace(
  ` snapshot_payload=${"8".repeat(64)}`, "");
assert.notEqual(missingSnapshotPayloadText, publishedGateText);
assert.throws(() => verifyPublishedCandidateGateStdout(
  stdoutEntry(missingSnapshotPayloadText),
  compilerInputs,
  "6".repeat(64)), /runtime publication receipt is malformed/);
const aliasedSnapshotPayloadText = publishedGateText.replace(
  `snapshot_payload=${"8".repeat(64)}`,
  `snapshot_payload=${"4".repeat(64)}`);
assert.notEqual(aliasedSnapshotPayloadText, publishedGateText);
assert.throws(() => verifyPublishedCandidateGateStdout(
  stdoutEntry(aliasedSnapshotPayloadText),
  compilerInputs,
  "6".repeat(64)), /publication identities are empty or aliased/);
const legacySnapshotPayloadFieldText = publishedGateText.replace(
  `snapshot_payload=${"8".repeat(64)}`,
  `snapshot_payload=${"8".repeat(64)} snapshot_payload_cid=${"9".repeat(64)}`);
assert.notEqual(legacySnapshotPayloadFieldText, publishedGateText);
assert.throws(() => verifyPublishedCandidateGateStdout(
  stdoutEntry(legacySnapshotPayloadFieldText),
  compilerInputs,
  "6".repeat(64)), /runtime publication receipt is malformed/);
assert.throws(() => verifyPublishedCandidateGateStdout(
  {raw: Buffer.from(publishedGateText.replace(
    `lsp_module_sha256=${compilerInputs.byPath.get("src/core/tooling/lsp_server.cheng")!.sha256}`,
    `lsp_module_sha256=${"8".repeat(64)}`)), sha256: "7".repeat(64), bytes: publishedGateRaw.length},
  compilerInputs,
  "6".repeat(64)), /lsp_module_sha256 is not bound/);
assert.throws(() => verifyPublishedCandidateGateStdout(
  {raw: Buffer.from(publishedGateText.replace(
    `formal_spec_sha256=${compilerInputs.byPath.get("docs/cheng-formal-spec.md")!.sha256}`,
    `formal_spec_sha256=${"8".repeat(64)}`)), sha256: "7".repeat(64), bytes: publishedGateRaw.length},
  compilerInputs,
  "6".repeat(64)), /formal_spec_sha256 is not bound/);
assert.throws(() => verifyPublishedCandidateGateStdout(
  {raw: Buffer.from(`${publishedGateText}extra=field\n`), sha256: "7".repeat(64), bytes: publishedGateRaw.length + 12},
  compilerInputs,
  "6".repeat(64)), /field set is not the unique current schema/);

const zeroMissingRouteMutation = lspSource.replace(
  "admission.missingFactBitmap == 0:",
  "admission.missingFactBitmap != 0:");
assert.notEqual(zeroMissingRouteMutation, lspSource);
const zeroMissingRouteAudit = auditSemanticSnapshotProductionClosure({
  ...closureSources,
  lspSource: zeroMissingRouteMutation,
}, publishedReceipt);
assert.equal(zeroMissingRouteAudit.observations.publishedCandidateEvidence, false);
assert.ok(zeroMissingRouteAudit.blockers.includes(
  "lsp_publication_not_guarded_by_zero_missing_facts"));

const admissionRequiresBlockedMutation = builderSource.replace(
  "receipt.admissionBlocked !=\n           (receipt.missingFactBitmap != 0)",
  "!receipt.admissionBlocked || receipt.missingFactBitmap == 0");
assert.notEqual(admissionRequiresBlockedMutation, builderSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  builderSource: admissionRequiresBlockedMutation,
}).blockers.includes("admission_requires_blocked_receipt"));

console.log("[A3] static module and published names cannot manufacture closure evidence");
const staticSpoof = auditSemanticSnapshotProductionClosure({
  ...closureSources,
  lspVersionIsolationSmokeSource: `${lspVersionIsolationSmokeSource}
# published=1 is source text, not a publication receipt
`,
});
assert.equal(staticSpoof.observations.builderProjectsModuleSymbols, true);
assert.equal(staticSpoof.observations.publishedCandidateEvidence, false);
assert.ok(staticSpoof.blockers.includes("no_published_candidate_evidence"));

console.log("[A4] exact contract mutations fail their own independent checks");
const moduleContractMutation = schemaSource.replace(
  "nameText != modulePathText || nameSpan != -1 ||",
  "nameText != modulePathText || false ||");
assert.notEqual(moduleContractMutation, schemaSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  schemaSource: moduleContractMutation,
}).blockers.includes("schema_missing_exact_module_symbol_coordinate_discriminator"));

const moduleProjectionMutation = builderSource.replace(
  "add(tables.symbols.symbolKinds, schema.CsgCompilerSymbolModule)",
  "add(tables.symbols.symbolKinds, schema.CsgCompilerSymbolFunction)");
assert.notEqual(moduleProjectionMutation, builderSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  builderSource: moduleProjectionMutation,
}).blockers.includes("builder_missing_module_symbol_projection"));
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  builderSource: moduleProjectionMutation,
}).blockers.includes("builder_rejects_non_function_symbols"));

const callProjectionMutation = compilerCsgSource.replace(
  "texpr.TypedExprIrCallDeclarationBuildIndex(typedIr)",
  "texpr.TypedExprIrCallDeclarationApproximateIndex(typedIr)");
assert.notEqual(callProjectionMutation, compilerCsgSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  compilerCsgSource: callProjectionMutation,
}).blockers.includes("compiler_missing_exact_call_projection"));

const sixQueryMutation = lspVersionIsolationSmokeSource.replace(
  "lsp.LspWorkspaceExactDiagnosticsInto(\n               workspace, uri, diagnostics, err)",
  "lsp.LspWorkspaceRemovedDiagnosticsInto(\n               workspace, uri, diagnostics, err)");
assert.notEqual(sixQueryMutation, lspVersionIsolationSmokeSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  lspVersionIsolationSmokeSource: sixQueryMutation,
}).blockers.includes("lsp_missing_uncompleted_version_six_query_rejection"));

for (const uriName of ["uriMain", "uriHelper"]) {
  const immutablePublishedFixtureUriMutation =
    lspVersionIsolationSmokeSource.replace(
      `    var ${uriName} =`, `    let ${uriName} =`);
  assert.notEqual(
    immutablePublishedFixtureUriMutation,
    lspVersionIsolationSmokeSource);
  assert.ok(auditSemanticSnapshotProductionClosure({
    ...closureSources,
    lspVersionIsolationSmokeSource:
      immutablePublishedFixtureUriMutation,
  }).blockers.includes(
    "published_candidate_fixture_not_exact_multifile"));
}

const coexistingImmutablePublishedFixtureUriMutation =
  `${lspVersionIsolationSmokeSource}
fn LegacyPublishedFixtureUriBindings(): bool =
    let uriMain = "legacy-main"
    let uriHelper = "legacy-helper"
    return len(uriMain) + len(uriHelper) > 0
`;
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  lspVersionIsolationSmokeSource:
    coexistingImmutablePublishedFixtureUriMutation,
}).blockers.includes(
  "published_candidate_fixture_not_exact_multifile"));

const duplicateMutablePublishedFixtureUriMutation =
  `${lspVersionIsolationSmokeSource}
fn DuplicatePublishedFixtureUriBindings(): bool =
    var uriMain = "duplicate-main"
    var uriHelper = "duplicate-helper"
    return len(uriMain) + len(uriHelper) > 0
`;
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  lspVersionIsolationSmokeSource:
    duplicateMutablePublishedFixtureUriMutation,
}).blockers.includes(
  "published_candidate_fixture_not_exact_multifile"));

const machoMutation = machoObjectWriterSource.replace(
  '"__debug_info"', '"__debug_fake"');
assert.notEqual(machoMutation, machoObjectWriterSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  machoObjectWriterSource: machoMutation,
}).blockers.includes("macho_missing_real_dwarf_section_relocation_consumption"));

const builderWithoutPatternStream = builderSource.replaceAll(
  "patternProducerSourceIds", "removedPatternProducerSourceIds");
assert.ok(auditSemanticSnapshotProductionClosure(
  {...closureSources, builderSource: builderWithoutPatternStream}).blockers.includes(
    "builder_missing_parser_pattern_stream_consumption"));

const referenceColumnMutation = schemaSource.replace(
  "    CsgCompilerReferenceTable =\n        sourceIds: int32[]\n        spanIds: int32[]\n        ownerFunctionIds: int32[]\n        ownerSymbolIds: int32[]",
  "    CsgCompilerReferenceTable =\n        sourceIds: int32[]\n        spanIds: int32[]\n        ownerFunctionIds: int32[]");
assert.notEqual(referenceColumnMutation, schemaSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  schemaSource: referenceColumnMutation,
}).blockers.includes("schema_missing_reference_owner_symbol_id_column"));

const referenceOwnerBindingMutation = schemaSource.replace(
  "snapshot.symbols.sourceIds[ownerSymbol] != source",
  "snapshot.symbols.sourceIds[ownerSymbol] == source");
assert.notEqual(referenceOwnerBindingMutation, schemaSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  schemaSource: referenceOwnerBindingMutation,
}).blockers.includes(
  "schema_missing_exact_reference_owner_source_function_target_kind_binding"));

let exactReferenceRelationMutationCount = 0;
const exactReferenceRelationMutations = [
  replaceExactlyOnce(
    schemaSource,
    "snapshot.symbols.functionIds[ownerSymbol] != ownerFunction",
    "snapshot.symbols.functionIds[ownerSymbol] == ownerFunction",
    "reference owner Symbol/function relation",
  ),
  replaceExactlyOnce(
    schemaSource,
    "snapshot.symbols.symbolKinds[ownerSymbol] !=\n"
      + "                CsgCompilerSymbolModule",
    "snapshot.symbols.symbolKinds[ownerSymbol] !=\n"
      + "                CsgCompilerSymbolType",
    "reference owner module kind",
  ),
  replaceExactlyOnce(
    schemaSource,
    "snapshot.symbols.symbolKinds[ownerSymbol] !=\n"
      + "                CsgCompilerSymbolType",
    "snapshot.symbols.symbolKinds[ownerSymbol] !=\n"
      + "                CsgCompilerSymbolModule",
    "reference owner type kind",
  ),
  replaceExactlyOnce(
    schemaSource,
    "snapshot.symbols.symbolKinds[ownerSymbol] !=\n"
      + "                CsgCompilerSymbolFunction",
    "snapshot.symbols.symbolKinds[ownerSymbol] !=\n"
      + "                CsgCompilerSymbolType",
    "reference owner function kind",
  ),
  replaceExactlyOnce(
    schemaSource,
    "referenceKind == CsgCompilerReferenceCall &&\n"
      + "            snapshot.symbols.symbolKinds[target] !=\n"
      + "                CsgCompilerSymbolFunction",
    "referenceKind == CsgCompilerReferenceCall &&\n"
      + "            snapshot.symbols.symbolKinds[target] !=\n"
      + "                CsgCompilerSymbolType",
    "call reference target kind",
  ),
  replaceExactlyOnce(
    schemaSource,
    "referenceKind == CsgCompilerReferenceType &&\n"
      + "            snapshot.symbols.symbolKinds[target] != "
      + "CsgCompilerSymbolType",
    "referenceKind == CsgCompilerReferenceType &&\n"
      + "            snapshot.symbols.symbolKinds[target] != "
      + "CsgCompilerSymbolFunction",
    "type reference target kind",
  ),
  replaceExactlyOnce(
    schemaSource,
    "referenceKind == CsgCompilerReferenceImport &&\n"
      + "            snapshot.symbols.symbolKinds[target] !=\n"
      + "                CsgCompilerSymbolModule",
    "referenceKind == CsgCompilerReferenceImport &&\n"
      + "            snapshot.symbols.symbolKinds[target] !=\n"
      + "                CsgCompilerSymbolType",
    "import reference target kind",
  ),
  replaceExactlyOnce(
    schemaSource,
    "snapshot.references.ownerSymbolIds[reference] !=\n"
      + "               snapshot.functions.symbolIds[caller]",
    "snapshot.references.ownerSymbolIds[reference] !=\n"
      + "               snapshot.references.targetSymbolIds[reference]",
    "call reference owner Symbol link",
  ),
];
for (const mutation of exactReferenceRelationMutations) {
  const mutationAudit = auditSemanticSnapshotProductionClosure({
    ...closureSources,
    schemaSource: mutation,
  });
  assert.ok(mutationAudit.blockers.includes(
    "schema_missing_exact_reference_owner_source_function_target_kind_binding"));
  exactReferenceRelationMutationCount++;
}
assert.equal(exactReferenceRelationMutationCount, 8);

const referenceCargoMutation = cargoSource.replace(
  "snapshot.references.ownerSymbolIds)\n    csgCompilerCargoAppend(out, \",\\\"referenceKinds\\\":\")",
  "snapshot.references.ownerFunctionIds)\n    csgCompilerCargoAppend(out, \",\\\"referenceKinds\\\":\")");
assert.notEqual(referenceCargoMutation, cargoSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  cargoSource: referenceCargoMutation,
}).blockers.includes("cargo_missing_exact_reference_owner_symbol_binding"));

let cargoExecutableSpoofMutationCount = 0;
for (const cargoSpoofMutation of [
  injectBeforeNextFunction(
    referenceCargoMutation,
    "csgCompilerCargoReferencesLine",
    "# csgCompilerCargoAppendIntArray("
      + "out, snapshot.references.ownerSymbolIds)",
  ),
  injectBeforeNextFunction(
    referenceCargoMutation,
    "csgCompilerCargoReferencesLine",
    "let cargoExecutableSpoof = "
      + "\"csgCompilerCargoAppendIntArray("
      + "out, snapshot.references.ownerSymbolIds)\"",
  ),
]) {
  assert.ok(auditSemanticSnapshotProductionClosure({
    ...closureSources,
    cargoSource: cargoSpoofMutation,
  }).blockers.includes("cargo_missing_exact_reference_owner_symbol_binding"));
  cargoExecutableSpoofMutationCount++;
}

const referenceBuilderRemapMutation = builderSource.replace(
  "newByOld[tables.references.ownerSymbolIds[row]]",
  "newByOld[tables.references.targetSymbolIds[row]]");
assert.notEqual(referenceBuilderRemapMutation, builderSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  builderSource: referenceBuilderRemapMutation,
}).blockers.includes("builder_missing_exact_reference_owner_symbol_remap"));

const referenceCargoDecodeMutation = cargoValidatorSource.replace(
  'lines[16], "ownerSymbolIds",\n           facts.snapshot.references.ownerSymbolIds, err)',
  'lines[16], "ownerSymbolIds",\n           facts.snapshot.references.ownerFunctionIds, err)');
assert.notEqual(referenceCargoDecodeMutation, cargoValidatorSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  cargoValidatorSource: referenceCargoDecodeMutation,
}).blockers.includes("cargo_missing_exact_reference_owner_symbol_binding"));

for (const cargoDecodeSpoofMutation of [
  injectBeforeNextFunction(
    referenceCargoDecodeMutation,
    "csgCompilerWireDecodeInto",
    "# csgCompilerWireIntArrayField("
      + "lines[16], \"ownerSymbolIds\", "
      + "facts.snapshot.references.ownerSymbolIds, err)",
  ),
  injectBeforeNextFunction(
    referenceCargoDecodeMutation,
    "csgCompilerWireDecodeInto",
    "let cargoDecodeExecutableSpoof = "
      + "\"csgCompilerWireIntArrayField("
      + "lines[16], ownerSymbolIds, "
      + "facts.snapshot.references.ownerSymbolIds, err)\"",
  ),
]) {
  assert.ok(auditSemanticSnapshotProductionClosure({
    ...closureSources,
    cargoValidatorSource: cargoDecodeSpoofMutation,
  }).blockers.includes("cargo_missing_exact_reference_owner_symbol_binding"));
  cargoExecutableSpoofMutationCount++;
}

const referenceCargoLegacyDecodeMutation = cargoValidatorSource
  .replace("facts.snapshot.references.sourceIds", "facts.referenceSourceIds")
  .replace("facts.snapshot.references.spanIds", "facts.referenceSpanIds")
  .replace("facts.snapshot.references.ownerFunctionIds", "facts.referenceOwnerFunctionIds")
  .replace("facts.snapshot.references.ownerSymbolIds", "facts.referenceOwnerSymbolIds")
  .replace("facts.snapshot.references.targetSymbolIds", "facts.referenceTargetSymbolIds")
  .replace("facts.snapshot.references.referenceKinds", "facts.referenceKinds");
assert.notEqual(referenceCargoLegacyDecodeMutation, cargoValidatorSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  cargoValidatorSource: referenceCargoLegacyDecodeMutation,
}).blockers.includes("cargo_missing_exact_reference_owner_symbol_binding"));

for (const legacyBinding of [
  "facts.referenceSourceIds",
  "facts.referenceSpanIds",
  "facts.referenceOwnerFunctionIds",
  "facts.referenceOwnerSymbolIds",
  "facts.referenceTargetSymbolIds",
  "facts.referenceKinds",
]) {
  const referenceCargoLegacyCoexistMutation = injectBeforeNextFunction(
    cargoValidatorSource,
    "csgCompilerWireDecodeInto",
    `let legacyReferenceBinding = ${legacyBinding}`);
  assert.notEqual(referenceCargoLegacyCoexistMutation, cargoValidatorSource);
  assert.ok(auditSemanticSnapshotProductionClosure({
    ...closureSources,
    cargoValidatorSource: referenceCargoLegacyCoexistMutation,
  }).blockers.includes("cargo_missing_exact_reference_owner_symbol_binding"));
}

const referenceCargoLegacyOutsideDecoderMutation =
  `${cargoValidatorSource}
fn LegacyReferenceCargoReadOutsideDecoder(
        facts: var CsgCoreChengCompilerWireFacts): int32 =
    return facts.referenceOwnerSymbolIds.len
`;
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  cargoValidatorSource: referenceCargoLegacyOutsideDecoderMutation,
}).blockers.includes("cargo_missing_exact_reference_owner_symbol_binding"));
cargoExecutableSpoofMutationCount++;
assert.equal(cargoExecutableSpoofMutationCount, 5);

const referenceCargoLegacyCommentOnlyMutation = injectBeforeNextFunction(
  cargoValidatorSource,
  "csgCompilerWireDecodeInto",
  "# legacy schema text is not executable: facts.referenceOwnerSymbolIds");
assert.deepEqual(
  auditSemanticSnapshotProductionClosure({
    ...closureSources,
    cargoValidatorSource: referenceCargoLegacyCommentOnlyMutation,
  }).blockers,
  auditSemanticSnapshotProductionClosure(closureSources).blockers);

const referenceCompilerFactMutation = compilerFactsSource.replace(
  "let ownerSymbolId = snapshot.references.ownerSymbolIds[row]",
  "let ownerSymbolId = snapshot.references.targetSymbolIds[row]");
assert.notEqual(referenceCompilerFactMutation, compilerFactsSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  compilerFactsSource: referenceCompilerFactMutation,
}).blockers.includes(
  "compiler_fact_missing_exact_reference_owner_symbol_projection"));

for (const referenceCidOwnershipMutation of [
  compilerFactsSource.replace(
    "reference.ownerSymbolCid =\n"
      + "        layout.FixedBytes32Copy(\n"
      + "            snapshot.symbols.symbolCids[ownerSymbolId])",
    "reference.ownerSymbolCid =\n"
      + "        snapshot.symbols.symbolCids[ownerSymbolId]"),
  compilerFactsSource.replace(
    "snapshot.symbols.symbolCids[ownerSymbolId])",
    "snapshot.symbols.symbolCids[target])"),
  compilerFactsSource.replace(
    "snapshot.symbols.declKeyCids[ownerSymbolId])",
    "snapshot.symbols.declKeyCids[target])"),
  compilerFactsSource.replace(
    "snapshot.symbols.symbolCids[target])",
    "snapshot.symbols.symbolCids[ownerSymbolId])"),
  compilerFactsSource.replace(
    "reference.targetDeclKeyCid =\n"
      + "        layout.FixedBytes32Copy(snapshot.symbols.declKeyCids[target])\n",
    ""),
]) {
  assert.notEqual(referenceCidOwnershipMutation, compilerFactsSource);
  assert.ok(auditSemanticSnapshotProductionClosure({
    ...closureSources,
    compilerFactsSource: referenceCidOwnershipMutation,
  }).blockers.includes(
    "compiler_fact_missing_exact_reference_owner_symbol_projection"));
}

const referenceTargetDeclIdentityMutation = compilerFactsSource.replace(
  "reference.targetDeclId = snapshot.symbols.declIds[target]",
  "reference.targetDeclId = snapshot.symbols.declIds[ownerSymbolId]");
assert.notEqual(referenceTargetDeclIdentityMutation, compilerFactsSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  compilerFactsSource: referenceTargetDeclIdentityMutation,
}).blockers.includes(
  "compiler_fact_missing_exact_reference_owner_symbol_projection"));

const referenceDisplayOwnershipMutation = compilerFactsSource.replace(
  "system.SystemToStringStr(snapshot.texts[targetNameTextId])",
  "snapshot.texts[targetNameTextId]");
assert.notEqual(referenceDisplayOwnershipMutation, compilerFactsSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  compilerFactsSource: referenceDisplayOwnershipMutation,
}).blockers.includes(
  "compiler_fact_missing_exact_reference_owner_symbol_projection"));

const compilerReferenceTextIdentityMutation = compilerFactsSource.replace(
  "    reference.ownerFunctionId = ownerFunctionId",
  "    let targetNameIdentity = snapshot.texts[\n"
    + "        snapshot.symbols.nameTextIds[target]]\n"
    + "    let arity = 1\n"
    + "    reference.ownerFunctionId = ownerFunctionId");
assert.notEqual(compilerReferenceTextIdentityMutation, compilerFactsSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  compilerFactsSource: compilerReferenceTextIdentityMutation,
}).blockers.includes("reference_identity_uses_text_or_name_arity"));

const referenceLspMutation = lspSource.replace(
  "ownerSymbolIdOut = compilerFact.referenceFact.ownerSymbolId",
  "ownerSymbolIdOut = compilerFact.referenceFact.targetSymbolId");
assert.notEqual(referenceLspMutation, lspSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  lspSource: referenceLspMutation,
}).blockers.includes("lsp_missing_exact_reference_owner_symbol_consumption"));

const referenceTextIdentityMutation = lspSource.replace(
  'panic("lsp_snapshot_reference_id_out_of_range")\n    let compilerFact',
  'panic("lsp_snapshot_reference_id_out_of_range")\n    let targetName = "guessed"\n    let arity = 1\n    let compilerFact');
assert.notEqual(referenceTextIdentityMutation, lspSource);
assert.ok(auditSemanticSnapshotProductionClosure({
  ...closureSources,
  lspSource: referenceTextIdentityMutation,
}).blockers.includes("reference_identity_uses_text_or_name_arity"));

const listed = await handleMcpRequest({jsonrpc: "2.0", id: 30, method: "tools/list", params: {}});
const registered = listed.tools.filter((tool:any) => tool.name === "cheng_semantic_snapshot_audit");
assert.equal(registered.length, 1);
assert.deepEqual(registered[0].inputSchema.properties.scope.enum, ["atomic_publish", "production_closure"]);
const closureCall = await handleMcpRequest({
  jsonrpc: "2.0",
  id: 31,
  method: "tools/call",
  params: {
    name: "cheng_semantic_snapshot_audit",
    arguments: {scope: "production_closure"},
    workspaceRoots: [CHENG_ROOT],
  },
});
assert.equal(closureCall.isError, undefined, closureCall.content?.[0]?.text || "production closure audit failed");
const closureResult = JSON.parse(closureCall.content[0].text);
assert.equal(closureResult.status, "incomplete");
assert.deepEqual(closureResult.productionClosureAudit.blockers, closure.blockers);
assert.match(closureResult.auditCid, /^[0-9a-f]{64}$/);

console.log("[B] restored fallible API is rejected");
const restoredApi = `${coreSource}\nfn SemanticSnapshotStorePublishCandidateInto(store: int32): bool =\n    return true\n`;
assert.throws(() => auditSemanticSnapshotStructure(restoredApi, productionSource), /removed fallible semantic snapshot API survived/);

console.log("[C] allocation in a terminal Commit is rejected");
const commitAdd = injectBeforeNextFunction(coreSource, "SemanticSnapshotStoreCommitCandidateInto", "add(store.states, SemanticSnapshotStateReleased)");
assert.throws(() => auditSemanticSnapshotStructure(commitAdd, productionSource), /forbidden call add/);

console.log("[D] full mapping scan in exact reclaim is rejected");
const reclaimScan = injectBeforeNextFunction(productionSource, "SemanticSnapshotProductionStoreReclaimSnapshotInto", "semanticSnapshotProductionStoreMappingsStrictValidNoAlloc(store)");
assert.throws(() => auditSemanticSnapshotStructure(coreSource, reclaimScan), /historical mapping scan/);

console.log("[E] recoverable Commit return is rejected");
const commitReturnFalse = injectBeforeNextFunction(productionSource, "SemanticSnapshotProductionCommitCandidateInto", "return false");
assert.throws(() => auditSemanticSnapshotStructure(coreSource, commitReturnFalse), /return false/);

console.log("[F] internally guarded gates reject limit, direct-execution and command-substitution bypasses");
const productionGateSpec = GATE_SPECS.find((gate:any) => gate.name === "production");
assert.ok(productionGateSpec);
const productionGateSource = readFileSync(join(CHENG_ROOT, productionGateSpec.sourcePath), "utf8");
const guardSha256 = compilerInputs.byPath.get("tools/beat_c_process_group_guard.sh")?.sha256;
assert.ok(guardSha256);
const routing = auditInternallyGuardedGate(productionGateSource, productionGateSpec, guardSha256);
assert.equal(routing.guardScope, "each_external_process_tree");
assert.equal(routing.guardedCommandCount, 5);
assert.throws(
  () => auditInternallyGuardedGate(productionGateSource.replace("--rss-limit:1073741824", "--rss-limit:536870912"), productionGateSpec, guardSha256),
  /does not enforce the fixed exact 1 GiB/,
);
assert.throws(
  () => auditInternallyGuardedGate(`${productionGateSource}\n"$COMPILER" system-link-exec --root:"$ROOT"\n`, productionGateSpec, guardSha256),
  /unguarded compile/,
);
assert.throws(
  () => auditInternallyGuardedGate(productionGateSource.replace('EXE="$WORK/semantic_snapshot_production_binding_smoke"', 'EXE="$(printf injected)"'), productionGateSpec, guardSha256),
  /command substitution/,
);

console.log("[G] a gate input generation drift is rejected even if bytes could be restored later");
const fixtureRaw = mkdtempSync(join(tmpdir(), "cheng-semantic-snapshot-audit-mutation-"));
const fixtureRoot = realpathSync.native(fixtureRaw);
try {
  for (const spec of SEMANTIC_SNAPSHOT_AUDIT_INPUT_SPECS) {
    const destination = join(fixtureRoot, spec.path);
    mkdirSync(dirname(destination), {recursive: true});
    copyFileSync(join(CHENG_ROOT, spec.path), destination);
  }
  const captured = captureSemanticSnapshotAuditInputs(fixtureRoot);
  const gatePath = join(fixtureRoot, "tools/semantic_snapshot_core_gate.sh");
  writeFileSync(gatePath, Buffer.concat([readFileSync(gatePath), Buffer.from("\n# mutation\n")]));
  assert.throws(
    () => verifySemanticSnapshotAuditInputs(fixtureRoot, captured, "mutation test"),
    /input drift during mutation test: tools\/semantic_snapshot_core_gate\.sh/,
  );
} finally {
  rmSync(fixtureRoot, {recursive: true, force: true});
}

console.log(
  "item30 semantic snapshot audit mutations: PASS "
    + `exact_reference_relations=${exactReferenceRelationMutationCount} `
    + `cargo_executable_scope=${cargoExecutableSpoofMutationCount}`,
);
