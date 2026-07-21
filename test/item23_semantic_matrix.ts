#!/usr/bin/env bun
import assert from "node:assert/strict";
import {
  CHENG_SEMANTIC_AXIS_ORDER,
  CHENG_SEMANTIC_MODEL_SCHEMA,
  CHENG_SEMANTIC_MODEL_SCHEMA_SHA256,
  CHENG_SEMANTIC_REAL_RUNNER_PROTOCOL,
  SemanticPipelineRunnerUnavailableError,
  type SemanticAxisName,
  type SemanticCase,
  type SemanticTypeName,
  buildSemanticContractLedger,
  buildSemanticMaterializationRecipe,
  buildSemanticMatrixShard,
  canonicalJson,
  classifySemanticDimensions,
  deltaReduceFailingSemanticCases,
  deriveSemanticCoverageContract,
  enumerateSemanticUniverse,
  executeSemanticMatrixShard,
  generateSemanticMatrix,
  mutateSemanticContractLedger,
  proofClassifySemanticDimensions,
  reproduceSemanticCase,
  semanticCaseCoverageTokens,
  validateSemanticContractLedger,
  validateSemanticCoverage,
  validateSemanticMatrix,
  validateSemanticMatrixShard,
} from "../src/cheng_semantic_matrix_m9023.ts";

async function main() {
  console.log("[A] bounded schema covers the required semantic axes without an infinite-grammar claim");
  for (const axis of [
    "type", "ownership", "valueCategory", "storage", "fieldPath", "callIdentity", "overload",
    "moduleScope", "resultTransport", "controlFlow", "alias", "sourceSurface",
  ] as const satisfies readonly SemanticAxisName[]) assert.ok(CHENG_SEMANTIC_AXIS_ORDER.includes(axis), `missing semantic axis ${axis}`);
  assert.equal(CHENG_SEMANTIC_MODEL_SCHEMA.infiniteGrammarClaim, false);
  assert.equal(CHENG_SEMANTIC_MODEL_SCHEMA.generalCoverage.strength, 2);
  assert.match(CHENG_SEMANTIC_MODEL_SCHEMA_SHA256, /^[0-9a-f]{64}$/);
  assert.deepEqual(CHENG_SEMANTIC_MODEL_SCHEMA.publicSurface.allowedBorrowSyntax, "var T implicit borrow");
  assert.ok(!canonicalJson(CHENG_SEMANTIC_MODEL_SCHEMA.axes).includes("raw_pointer"));
  const requiredTypes = ["i64", "f64", "bool", "seq_str", "managed_object_seq", "fixed_str", "nested_inline_object_str", "result_str"] as const satisfies readonly SemanticTypeName[];
  for (const type of requiredTypes) {
    assert.ok(CHENG_SEMANTIC_MODEL_SCHEMA.axes.type.includes(type), `missing required type family ${type}`);
  }
  assert.equal(CHENG_SEMANTIC_REAL_RUNNER_PROTOCOL.implemented, false);
  assert.ok(CHENG_SEMANTIC_REAL_RUNNER_PROTOCOL.sourceBindings.includes("case_source_bytes_sha256"));

  console.log("[B] seed generation is byte-deterministic and independently proves exhaustive critical + pairwise + negative coverage");
  const suiteA = generateSemanticMatrix("item23-seed-a");
  const suiteARepeat = generateSemanticMatrix("item23-seed-a");
  const suiteB = generateSemanticMatrix("item23-seed-b");
  assert.equal(canonicalJson(suiteA), canonicalJson(suiteARepeat));
  assert.notEqual(suiteA.manifest.manifestSha256, suiteB.manifest.manifestSha256);
  assert.equal(suiteA.manifest.generator, "deterministic_weighted_set_cover_non_minimal.v1");
  assert.ok(suiteA.cases.some((entry) => entry.expected === "accept"));
  assert.ok(suiteA.cases.some((entry) => entry.expected === "reject"));
  const matrixReceipt = validateSemanticMatrix(suiteA);
  assert.equal(matrixReceipt.manifestSha256, suiteA.manifest.manifestSha256);
  const coverage = deriveSemanticCoverageContract();
  assert.ok(coverage.critical.length > 0 && coverage.twise.length > 0 && coverage.negative.length > 0);
  assert.equal(coverage.classifierAgreementCount, coverage.assignmentCount);
  assert.match(coverage.classifierAgreementSha256, /^[0-9a-f]{64}$/);
  assert.equal(validateSemanticCoverage(suiteA.cases).contractSha256, coverage.contractSha256);
  const universe = enumerateSemanticUniverse();
  assert.ok(universe.assignmentCount > universe.legalCases.length && universe.legalCases.length > suiteA.cases.length);
  assert.equal(universe.negativeCases.length, 10);
  assert.equal(new Set(universe.negativeCases.map((entry) => entry.caseId)).size, 10);
  assert.ok(universe.negativeCases.every((entry) => entry.violationCodes.length === 1));
  assert.deepEqual(
    [...new Set(universe.negativeCases.flatMap((entry) => entry.violationCodes))].sort(),
    coverage.negative.map((token) => token.slice("negative|".length)).sort(),
  );
  const classifierMutationBase = universe.legalCases.find((entry) => entry.dimensions.type === "str" && entry.dimensions.valueCategory === "ident");
  assert.ok(classifierMutationBase);
  const classifierMutation = {...classifierMutationBase.dimensions, resultTransport: "value_register" as const};
  const primaryMutationVerdict = classifySemanticDimensions(classifierMutation);
  const proofMutationVerdict = proofClassifySemanticDimensions(classifierMutation);
  assert.deepEqual(primaryMutationVerdict, proofMutationVerdict);
  assert.deepEqual(primaryMutationVerdict.violations, ["RESULT_TRANSPORT_EXACT"]);
  const firstCase = suiteA.cases[0];
  assert.ok(firstCase);
  assert.equal(reproduceSemanticCase(firstCase.caseId).semanticSha256, firstCase.semanticSha256);
  assert.ok(!canonicalJson(firstCase).includes("sourceNodeIndex"));

  console.log("[B2] every legal model has a deterministic, pointer-free materialization recipe");
  for (const testCase of universe.legalCases) {
    const recipe = buildSemanticMaterializationRecipe(testCase);
    assert.equal(recipe.recipeSha256, buildSemanticMaterializationRecipe(testCase).recipeSha256);
    assert.equal(recipe.usesRawPointerSyntax, false);
    if (["object_str", "nested_inline_object_str", "result_str"].includes(testCase.dimensions.type)) {
      assert.notEqual(testCase.dimensions.valueCategory, "literal");
    }
    if (testCase.dimensions.alias === "self_alias") {
      assert.equal(testCase.dimensions.storage, "global");
      assert.notEqual(testCase.dimensions.ownership, "Owned");
      assert.ok(["ident", "field", "index"].includes(testCase.dimensions.valueCategory));
    }
  }

  console.log("[C] coverage proof does not trust the generator manifest");
  const criticalToken = coverage.critical[0];
  assert.ok(criticalToken);
  const missingCritical = suiteA.cases.filter((entry) => !semanticCaseCoverageTokens(entry).includes(criticalToken));
  assert.throws(() => validateSemanticCoverage(missingCritical), /coverage incomplete/);
  const forgedSetCoverReceipt = {...suiteA, cases: missingCritical};
  assert.throws(() => validateSemanticMatrix(forgedSetCoverReceipt), /coverage incomplete/);
  const negativeToken = coverage.negative[0];
  assert.ok(negativeToken);
  const missingNegative = suiteA.cases.filter((entry) => !semanticCaseCoverageTokens(entry).includes(negativeToken));
  assert.throws(() => validateSemanticCoverage(missingNegative), /coverage incomplete/);
  const manifestMutation = {...suiteA, manifest: {...suiteA.manifest, seed: "mutated-after-generation"}};
  assert.throws(() => validateSemanticMatrix(manifestMutation), /manifest mismatch/);

  console.log("[D] deterministic shards are disjoint, complete, and parent-bound");
  const shardCount = 7;
  const shards = Array.from({length: shardCount}, (_, index) => buildSemanticMatrixShard(suiteA, index, shardCount));
  for (const shard of shards) validateSemanticMatrixShard(suiteA, shard);
  const shardedIds = shards.flatMap((shard) => shard.cases.map((entry) => entry.caseId));
  assert.equal(new Set(shardedIds).size, suiteA.cases.length);
  assert.deepEqual([...shardedIds].sort(), suiteA.cases.map((entry) => entry.caseId).sort());
  const firstShard = shards[0];
  assert.ok(firstShard);
  const shardMutation = {...firstShard, manifest: {...firstShard.manifest, parentManifestSha256: "0".repeat(64)}};
  assert.throws(() => validateSemanticMatrixShard(suiteA, shardMutation), /manifest or membership mismatch/);

  console.log("[E] symbolic ownership/layout/call contract makes all required mutations RED");
  const ownedCase = universe.legalCases.find((entry) => entry.dimensions.type === "str" && entry.dimensions.ownership === "Owned" && entry.dimensions.storage === "global" && entry.dimensions.valueCategory === "call");
  const callCase = universe.legalCases.find((entry) => entry.dimensions.valueCategory === "call" && entry.dimensions.overload === "same_name_same_arity" && entry.dimensions.moduleScope === "imported_module");
  const fieldCase = universe.legalCases.find((entry) => entry.dimensions.fieldPath === "ref_boundary_field");
  assert.ok(ownedCase && callCase && fieldCase);
  const ownedLedger = buildSemanticContractLedger(ownedCase);
  const callLedger = buildSemanticContractLedger(callCase);
  const fieldLedger = buildSemanticContractLedger(fieldCase);
  validateSemanticContractLedger(ownedCase, ownedLedger);
  validateSemanticContractLedger(callCase, callLedger);
  validateSemanticContractLedger(fieldCase, fieldLedger);
  assert.throws(() => validateSemanticContractLedger(ownedCase, mutateSemanticContractLedger(ownedLedger, "ownership_swap")), /oracle mismatch/);
  assert.throws(() => validateSemanticContractLedger(callCase, mutateSemanticContractLedger(callLedger, "call_identity_swap")), /oracle mismatch/);
  assert.throws(() => validateSemanticContractLedger(fieldCase, mutateSemanticContractLedger(fieldLedger, "field_offset_proof_drop")), /oracle mismatch/);
  assert.throws(() => validateSemanticContractLedger(ownedCase, mutateSemanticContractLedger(ownedLedger, "stage_omission")), /stage omission/);

  console.log("[F] delta reduction preserves both the supplied failure predicate and semantic legality");
  const reductionInput = universe.legalCases.slice(0, 24);
  const targetCase = reductionInput[17];
  assert.ok(targetCase);
  const targetCaseId = targetCase.caseId;
  const reduced = await deltaReduceFailingSemanticCases(reductionInput, async (cases:readonly SemanticCase[]) => cases.some((entry) => entry.caseId === targetCaseId));
  assert.equal(reduced.reducedCases.length, 1);
  assert.equal(reduced.reducedCases[0]?.caseId, targetCaseId);
  assert.equal(reduced.semanticLegalityPreserved, true);
  assert.equal(reduced.failurePredicatePreserved, true);
  const illegalCase = universe.negativeCases[0];
  const reductionFirstCase = reductionInput[0];
  assert.ok(illegalCase && reductionFirstCase);
  await assert.rejects(() => deltaReduceFailingSemanticCases([illegalCase], async () => true), /only semantically legal/);
  await assert.rejects(() => deltaReduceFailingSemanticCases([reductionFirstCase], async () => false), /does not preserve/);

  console.log("[G] absent exact real-pipeline receipts hard-fail instead of manufacturing success");
  const singleShard = buildSemanticMatrixShard(suiteA, 0, 1);
  await assert.rejects(
    () => executeSemanticMatrixShard(suiteA, singleShard, null),
    (error:unknown) => error instanceof SemanticPipelineRunnerUnavailableError && error.code === "REAL_PIPELINE_RUNNER_REQUIRED",
  );
  await assert.rejects(
    () => executeSemanticMatrixShard(suiteA, singleShard, {kind: "cheng-real-structured-pipeline.v1", oracleEcho: true}),
    (error:unknown) => error instanceof SemanticPipelineRunnerUnavailableError && error.code === "REAL_PIPELINE_RUNNER_REQUIRED",
  );

  console.log("item23 semantic matrix: PASS");
}

main().catch((error) => {
  console.error("item23 semantic matrix: FAIL", error);
  process.exit(1);
});
