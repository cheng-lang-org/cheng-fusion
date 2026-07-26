#!/usr/bin/env bun
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  CHENG_PIPELINE_PROFILE_AXIS_ORDER,
  CHENG_REAL_PIPELINE_RECEIPT_PROTOCOL,
  CHENG_SEMANTIC_PIPELINE_PROFILE_SCHEMA,
  CHENG_SEMANTIC_PIPELINE_PROFILE_SCHEMA_SHA256,
  CHENG_SOURCE_MATERIALIZER_BYTES_SHA256,
  RealPipelineReceiptUnavailableError,
  baseCaseForPipelineCase,
  buildBaseSemanticSourceBundle,
  buildChengGrammarObligationContract,
  buildGrammarSourceCoverageReceipt,
  buildPipelineProfileSourceBundle,
  classifyPipelineProfile,
  deltaReduceFailingPipelineCases,
  derivePipelineCoverageContract,
  enumeratePipelineProfileAssignments,
  executeSourceBoundSevenStageRunner,
  generatePipelineMatrix,
  lintChengPublicSource,
  mutateSourceBundle,
  proofClassifyPipelineProfile,
  requireGrammarSourceClosure,
  validateBaseSemanticSourceBundle,
  validateChengGrammarObligationContract,
  validatePipelineCoverage,
  validatePipelineMatrix,
  validatePipelineProfileSourceBundle,
  type ChengSemanticSourceBundle,
  type GrammarSourceWitness,
  type PipelineProfileAxisName,
  type PipelineProfileCase,
} from "../src/cheng_semantic_pipeline_matrix_m9024.ts";
import {enumerateSemanticUniverse, sha256} from "../src/cheng_semantic_matrix_m9023.ts";

async function main() {
  const formalSpecPath = process.env.CHENG_FORMAL_SPEC_PATH ?? "/Users/lbcheng/cheng-lang/docs/cheng-formal-spec.md";
  const formalSpec = readFileSync(formalSpecPath);

  console.log("[A] formal EBNF is mechanically decomposed and unbounded grammar remains explicitly RED");
  const grammar = buildChengGrammarObligationContract(formalSpec);
  const generatedGrammarCounts = validateChengGrammarObligationContract(formalSpec, grammar);
  assert.deepEqual(generatedGrammarCounts, {
    obligationCount: grammar.obligations.length,
    requiredCount: grammar.obligations.filter(
      (entry) => entry.disposition === "required",
    ).length,
    obligationRootSha256: grammar.obligationRootSha256,
  });
  assert.throws(
    () => validateChengGrammarObligationContract(formalSpec, {...grammar, schema: "cheng_formal_grammar_obligations.v1"} as any),
    /contract mismatch/,
  );
  assert.ok(grammar.productionCount > 50);
  assert.ok(grammar.requiredCount > 0 && grammar.excludedCount > 0);
  for (const kind of ["production", "choice", "optional", "repetition", "recursion"] as const) {
    assert.ok(grammar.obligations.some((entry) => entry.kind === kind), `missing grammar obligation kind ${kind}`);
  }
  const recursionFixture = buildChengGrammarObligationContract(`fixture\n\`\`\`ebnf\nA ::= B ;\nB ::= A | "b" ;\nC ::= A ;\nD ::= D | "d" ;\n\`\`\``);
  const recursiveProductions = [...new Set(
    recursionFixture.obligations.filter((entry) => entry.kind === "recursion").map((entry) => entry.production),
  )].sort();
  assert.deepEqual(recursiveProductions, ["A", "B", "D"]);
  assert.equal(recursionFixture.obligations.filter((entry) => entry.kind === "recursion").length, 12);
  assert.equal(grammar.closureStatus, "red_source_witness_and_real_pipeline_receipts_required");
  const grammarReceipt = buildGrammarSourceCoverageReceipt(grammar, []);
  assert.equal(grammarReceipt.status, "red_required_source_witnesses_missing");
  assert.equal(grammarReceipt.missingRequiredCount, grammar.requiredCount);
  assert.equal(grammarReceipt.witnessedRequiredCount, 0);
  assert.throws(() => requireGrammarSourceClosure(grammarReceipt), /GRAMMAR_SOURCE_WITNESSES_REQUIRED/);
  const firstRequiredGrammarObligation = grammar.obligations.find((entry) => entry.disposition === "required");
  assert.ok(firstRequiredGrammarObligation);
  const forgedSpanOnlySource = "main()\n";
  const forgedSpanOnlyWitness = {
    obligationId: firstRequiredGrammarObligation.obligationId,
    relativePath: "forged_span_only.cheng",
    sourceSha256: sha256(forgedSpanOnlySource),
    tokenStart: 0,
    tokenEnd: 1,
    tokenSha256: sha256("main"),
    witnessSha256: "0".repeat(64),
  } as unknown as GrammarSourceWitness;
  assert.throws(
    () => buildGrammarSourceCoverageReceipt(grammar, [forgedSpanOnlyWitness], [
      {relativePath: "forged_span_only.cheng", source: forgedSpanOnlySource},
    ]),
    /grammar parser span receipt missing/,
  );
  assert.throws(
    () => validateChengGrammarObligationContract(Buffer.concat([formalSpec, Buffer.from("\nmutated\n")]), grammar),
    /contract mismatch/,
  );

  console.log("[B] complete bounded join uses independent classifiers and independent projection encoders");
  const coverage = derivePipelineCoverageContract();
  const baseUniverse = enumerateSemanticUniverse();
  assert.equal(coverage.baseLegalCount, baseUniverse.legalCases.length);
  assert.equal(coverage.profileAssignmentCount, enumeratePipelineProfileAssignments().length);
  assert.equal(coverage.joinedAssignmentCount, coverage.baseLegalCount * coverage.profileAssignmentCount);
  assert.equal(coverage.classifierAgreementCount, coverage.joinedAssignmentCount);
  assert.ok(coverage.legalJoinedCount > 0);
  assert.ok(coverage.critical.length > 0 && coverage.pairwise.length > 0 && coverage.higherOrder.length > 0);
  assert.equal(coverage.negative.length, 7);
  const matrix = generatePipelineMatrix("item24-phase2-seed");
  assert.equal(matrix.manifest.seed, "item24-phase2-seed");
  assert.match(matrix.manifest.manifestSha256, /^[0-9a-f]{64}$/);
  validatePipelineMatrix(matrix);
  assert.throws(
    () => validatePipelineMatrix({...matrix, schema: "cheng_semantic_pipeline_matrix.v1"} as any),
    /invalid pipeline matrix schema/,
  );
  assert.equal(matrix.manifest.rejectCount, coverage.negative.length);
  assert.ok(matrix.cases.filter((entry) => entry.expected === "reject").every((entry) => entry.violationCodes.length === 1));
  assert.deepEqual(
    matrix.cases.filter((entry) => entry.expected === "reject").flatMap((entry) => entry.violationCodes).sort(),
    coverage.negative.map((entry) => entry.slice("negative|".length)).sort(),
  );
  const boolBase = baseUniverse.legalCases.find((entry) => entry.dimensions.type === "bool");
  assert.ok(boolBase);
  const profile = {useSite: "condition", targetPlace: "local", abiBoundary: "internal", lifetime: "branch", regallocPressure: "low"} as const;
  assert.deepEqual(classifyPipelineProfile(boolBase, profile), proofClassifyPipelineProfile(boolBase, profile));
  const nonBoolBase = baseUniverse.legalCases.find((entry) => entry.dimensions.type === "str");
  assert.ok(nonBoolBase);
  assert.deepEqual(classifyPipelineProfile(nonBoolBase, profile).violations, ["M9024_C01_CONDITION_REQUIRES_BOOL"]);
  const missingCritical = matrix.cases.filter((entry) => entry.profileCaseId !== matrix.cases.find((candidate) => candidate.expected === "accept")?.profileCaseId);
  assert.throws(() => validatePipelineCoverage(missingCritical), /coverage incomplete/);

  console.log("[C] all 1,584 legal m9023 cases materialize deterministic, linted Cheng source bundles");
  assert.match(CHENG_SOURCE_MATERIALIZER_BYTES_SHA256, /^[0-9a-f]{64}$/);
  const firstBase = baseUniverse.legalCases[0];
  assert.ok(firstBase);
  let firstBaseBundle: ChengSemanticSourceBundle | null = null;
  let baseBundleCount = 0;
  let sawResult = false;
  let sawNested = false;
  let sawManagedSequence = false;
  let sawFixed = false;
  for (const baseCase of baseUniverse.legalCases) {
    const bundle = buildBaseSemanticSourceBundle(baseCase, grammar);
    baseBundleCount += 1;
    if (baseCase.caseId === firstBase.caseId) firstBaseBundle = bundle;
    assert.equal(bundle.caseId, baseCase.caseId);
    assert.equal(bundle.semanticCaseSha256, baseCase.semanticSha256);
    assert.equal(bundle.materializerBytesSha256, CHENG_SOURCE_MATERIALIZER_BYTES_SHA256);
    assert.equal(bundle.grammarObligationRootSha256, grammar.obligationRootSha256);
    assert.ok(bundle.sourceFiles.every((entry) => entry.lint.passed));
    assert.ok(bundle.sourceFiles.some((entry) => entry.source.includes(bundle.expectedRuntimeMarker)));
    sawResult ||= bundle.sourceFiles.some((entry) => entry.source.includes("Result[str]"));
    sawNested ||= bundle.sourceFiles.some((entry) => entry.source.includes("OuterText(inner: InnerText"));
    sawManagedSequence ||= bundle.sourceFiles.some((entry) => entry.source.includes("TextBox[]"));
    sawFixed ||= bundle.sourceFiles.some((entry) => entry.source.includes("str[2]"));
  }
  assert.equal(baseBundleCount, baseUniverse.legalCases.length);
  assert.ok(sawResult && sawNested && sawManagedSequence && sawFixed);
  assert.ok(firstBaseBundle);
  validateBaseSemanticSourceBundle(firstBase, grammar, firstBaseBundle);
  assert.throws(() => validateBaseSemanticSourceBundle(firstBase, grammar, mutateSourceBundle(firstBaseBundle, "source_bytes_replace")), /bundle identity/);
  assert.throws(() => validateBaseSemanticSourceBundle(firstBase, grammar, mutateSourceBundle(firstBaseBundle, "case_binding_swap")), /bundle identity/);
  assert.throws(() => validateBaseSemanticSourceBundle(firstBase, grammar, mutateSourceBundle(firstBaseBundle, "materializer_binding_swap")), /bundle identity/);
  assert.throws(() => validateBaseSemanticSourceBundle(firstBase, grammar, mutateSourceBundle(firstBaseBundle, "grammar_root_swap")), /bundle identity/);
  assert.equal(lintChengPublicSource("fn ok(value: var int32) =\n    value = 1\n").passed, true);
  assert.equal(
    lintChengPublicSource(
      "type Managed = ref object:\n    value: int32\n",
    ).passed,
    true,
  );
  assert.equal(
    lintChengPublicSource("type Raw = ref int32\n").passed,
    false,
  );
  assert.equal(lintChengPublicSource("@importc(\"bad\")\nfn bad(value: ptr) =\n    value = value\n").passed, false);

  console.log("[D] every selected critical/pairwise/higher-order witness has source-changing profile templates and verified token spans");
  const firstProfile = matrix.cases.find((entry): entry is PipelineProfileCase => entry.expected === "accept");
  assert.ok(firstProfile);
  let firstProfileBundle: ChengSemanticSourceBundle | null = null;
  let profileBundleCount = 0;
  let sawAddressEscapeBoundary = false;
  const templateIds = new Map<PipelineProfileAxisName, Set<string>>();
  for (const axis of CHENG_PIPELINE_PROFILE_AXIS_ORDER) templateIds.set(axis, new Set());
  for (const testCase of matrix.cases) {
    if (testCase.expected !== "accept") continue;
    const bundle = buildPipelineProfileSourceBundle(testCase, grammar);
    profileBundleCount += 1;
    if (testCase.profileCaseId === firstProfile.profileCaseId) firstProfileBundle = bundle;
    assert.equal(bundle.profileAxisSourceWitnesses.length, CHENG_PIPELINE_PROFILE_AXIS_ORDER.length);
    for (const witness of bundle.profileAxisSourceWitnesses) {
      assert.ok(witness.tokenStart >= 0 && witness.tokenEnd > witness.tokenStart);
      assert.match(witness.renderedTokenSha256, /^[0-9a-f]{64}$/);
      assert.match(witness.witnessSha256, /^[0-9a-f]{64}$/);
      templateIds.get(witness.axis)?.add(witness.templateId);
      if (witness.axis === "regallocPressure" && witness.value === "address_escape") {
        const entry = bundle.sourceFiles.find((sourceFile) => sourceFile.relativePath === witness.relativePath);
        assert.ok(entry);
        assert.ok(entry.source.includes("ProfilePressureEscape(pressure_escape_value)"));
        sawAddressEscapeBoundary = true;
      }
    }
  }
  assert.equal(profileBundleCount, matrix.manifest.acceptCount);
  for (const axis of CHENG_PIPELINE_PROFILE_AXIS_ORDER) {
    const expectedLegalValues = axis === "abiBoundary" ? 1 : CHENG_SEMANTIC_PIPELINE_PROFILE_SCHEMA.axes[axis].length;
    assert.equal(templateIds.get(axis)?.size, expectedLegalValues, `profile axis ${axis} did not change an actual source template`);
  }
  assert.equal(sawAddressEscapeBoundary, true);
  assert.ok(matrix.cases.some((entry) => entry.violationCodes.includes("M9024_C03_PUBLIC_IMPORTC_FORBIDDEN")));
  assert.ok(matrix.cases.some((entry) => entry.violationCodes.includes("M9024_C04_PUBLIC_EXPORT_FORBIDDEN")));
  assert.ok(firstProfileBundle);
  validatePipelineProfileSourceBundle(firstProfile, grammar, firstProfileBundle);
  assert.throws(() => validatePipelineProfileSourceBundle(firstProfile, grammar, mutateSourceBundle(firstProfileBundle, "axis_span_drop")), /bundle identity/);
  assert.equal(baseCaseForPipelineCase(firstProfile).caseId, firstProfile.baseCaseId);

  console.log("[E] reducer preserves legality; grammar closure and real seven-stage receipts cannot false-green");
  const reductionInput = matrix.cases.filter((entry) => entry.expected === "accept").slice(0, 24);
  const target = reductionInput[11];
  assert.ok(target);
  const reduced = await deltaReduceFailingPipelineCases(reductionInput, async (cases) => cases.some((entry) => entry.profileCaseId === target.profileCaseId));
  assert.equal(reduced.reducedCases.length, 1);
  assert.equal(reduced.reducedCases[0]?.profileCaseId, target.profileCaseId);
  assert.equal(CHENG_REAL_PIPELINE_RECEIPT_PROTOCOL.implemented, false);
  assert.equal(CHENG_REAL_PIPELINE_RECEIPT_PROTOCOL.schema, "cheng_real_source_bound_seven_stage_protocol");
  assert.equal(CHENG_REAL_PIPELINE_RECEIPT_PROTOCOL.receiptSchema, "cheng.compiler.execution_stage_bundle");
  assert.deepEqual(CHENG_REAL_PIPELINE_RECEIPT_PROTOCOL.requiredStages, ["typed_expr", "csg", "lowering", "primary", "primary_regalloc", "backend2", "backend2_regalloc"]);
  assert.deepEqual(CHENG_REAL_PIPELINE_RECEIPT_PROTOCOL.sourceBindings, [
    "case_id",
    "source_bundle_raw32",
    "materializer_bytes_raw32",
    "grammar_obligation_root_raw32",
    "compiler_source_closure_raw32",
    "driver_bytes_raw32",
    "toolchain_manifest_raw32",
    "command_manifest_raw32",
    "target_triple",
  ]);
  await assert.rejects(
    () => executeSourceBoundSevenStageRunner(matrix, {oracleEcho: true}),
    (error: unknown) => error instanceof RealPipelineReceiptUnavailableError && error.code === "REAL_PIPELINE_RUNNER_REQUIRED",
  );

  console.log(JSON.stringify({
    grammarObligations: grammar.obligations.length,
    grammarRequiredMissing: grammarReceipt.missingRequiredCount,
    joinedAssignments: coverage.joinedAssignmentCount,
    legalJoined: coverage.legalJoinedCount,
    matrixCases: matrix.cases.length,
    baseSourceBundles: baseBundleCount,
    profileSourceBundles: profileBundleCount,
  }));
  console.log("item24 semantic pipeline matrix: PASS");
}

main().catch((error) => {
  console.error("item24 semantic pipeline matrix: FAIL", error);
  process.exit(1);
});
