// Exact private-child structural gate for the bounded m9024 semantic pipeline model.
// This proves the finite model/source materializer only. Missing parser and real
// seven-stage compiler receipts remain explicit RED evidence.
import {createHash} from "node:crypto";
import {readFileSync, realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {
  CHENG_REAL_PIPELINE_RECEIPT_PROTOCOL,
  CHENG_SOURCE_MATERIALIZER_BYTES_SHA256,
  buildBaseSemanticSourceBundle,
  buildChengGrammarObligationContract,
  buildGrammarSourceCoverageReceipt,
  buildPipelineProfileSourceBundle,
  derivePipelineCoverageContract,
  generatePipelineMatrix,
  validateBaseSemanticSourceBundle,
  validateChengGrammarObligationContract,
  validatePipelineMatrix,
  validatePipelineProfileSourceBundle,
} from "./cheng_semantic_pipeline_matrix_m9024.ts";
import {canonicalJson, enumerateSemanticUniverse, sha256} from "./cheng_semantic_matrix_m9023.ts";

const RECEIPT_SCHEMA = "cheng_semantic_pipeline_structural_gate_receipt";
const EXPECTED_JOINED_ASSIGNMENT_COUNT = 3_991_680;
const EXPECTED_LEGAL_JOINED_COUNT = 285_336;
const EXPECTED_MATRIX_CASE_COUNT = 2_927;

function requiredEnv(name: string): string {
  const value = process.env[name] ?? "";
  if (value.length === 0) throw new Error(`missing ${name}`);
  return value;
}

function requiredSha(name: string): string {
  const value = requiredEnv(name);
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`invalid ${name}`);
  return value;
}

function exactFile(pathValue: string, expectedSha256: string, label: string): Readonly<{path: string; sha256: string}> {
  const path = realpathSync.native(pathValue);
  if (path !== pathValue) throw new Error(`${label} path is not canonical`);
  const actual = sha256(readFileSync(path));
  if (actual !== expectedSha256) throw new Error(`${label} SHA-256 mismatch`);
  return {path, sha256: actual};
}

function aggregateRoot(rows: readonly string[]): string {
  const hash = createHash("sha256");
  for (const row of rows) hash.update(row, "utf8");
  return hash.digest("hex");
}

async function main(): Promise<void> {
  const formalSpec = exactFile(requiredEnv("CHENG_M9024_FORMAL_SPEC_PATH"), requiredSha("CHENG_M9024_FORMAL_SPEC_SHA256"), "formal spec");
  const driver = exactFile(requiredEnv("CHENG_M9024_DRIVER_PATH"), requiredSha("CHENG_M9024_DRIVER_SHA256"), "cold driver");
  const bun = exactFile(requiredEnv("CHENG_M9024_BUN_PATH"), requiredSha("CHENG_M9024_BUN_SHA256"), "private Bun");
  const guard = exactFile(requiredEnv("CHENG_M9024_GUARD_PATH"), requiredSha("CHENG_M9024_GUARD_SHA256"), "private guard");
  const toolchainManifest = exactFile(requiredEnv("CHENG_M9024_TOOLCHAIN_MANIFEST_PATH"), requiredSha("CHENG_M9024_TOOLCHAIN_MANIFEST_SHA256"), "private toolchain manifest");
  if (realpathSync.native(process.execPath) !== bun.path) throw new Error("semantic gate is not running under the bound private Bun");

  const gateSource = exactFile(fileURLToPath(import.meta.url), requiredSha("CHENG_M9024_GATE_SOURCE_SHA256"), "semantic gate source");
  const modelSource = exactFile(fileURLToPath(new URL("./cheng_semantic_matrix_m9023.ts", import.meta.url)), requiredSha("CHENG_M9024_MODEL_SOURCE_SHA256"), "m9023 source");
  const pipelineSource = exactFile(fileURLToPath(new URL("./cheng_semantic_pipeline_matrix_m9024.ts", import.meta.url)), requiredSha("CHENG_M9024_PIPELINE_SOURCE_SHA256"), "m9024 source");
  if (pipelineSource.sha256 !== CHENG_SOURCE_MATERIALIZER_BYTES_SHA256) throw new Error("m9024 materializer bytes binding mismatch");

  const formalSpecBytes = readFileSync(formalSpec.path);
  const grammar = buildChengGrammarObligationContract(formalSpecBytes);
  const generatedGrammarCounts = validateChengGrammarObligationContract(formalSpecBytes, grammar);
  if (generatedGrammarCounts.obligationCount !== grammar.obligations.length ||
      generatedGrammarCounts.requiredCount !== grammar.requiredCount ||
      generatedGrammarCounts.obligationRootSha256 !== grammar.obligationRootSha256) {
    throw new Error("formal grammar obligation count mismatch");
  }
  const grammarReceipt = buildGrammarSourceCoverageReceipt(grammar, []);
  if (grammarReceipt.status !== "red_required_source_witnesses_missing" || grammarReceipt.missingRequiredCount !== grammar.requiredCount || grammarReceipt.witnessedRequiredCount !== 0) {
    throw new Error("missing parser evidence did not remain RED");
  }

  const coverage = derivePipelineCoverageContract();
  if (coverage.joinedAssignmentCount !== EXPECTED_JOINED_ASSIGNMENT_COUNT || coverage.legalJoinedCount !== EXPECTED_LEGAL_JOINED_COUNT || coverage.classifierAgreementCount !== EXPECTED_JOINED_ASSIGNMENT_COUNT) {
    throw new Error("bounded m9024 joined-domain count mismatch");
  }
  const matrix = generatePipelineMatrix("regalloc-preflight-m9024");
  validatePipelineMatrix(matrix);
  if (matrix.cases.length !== EXPECTED_MATRIX_CASE_COUNT) throw new Error("bounded m9024 matrix case count mismatch");

  const baseUniverse = enumerateSemanticUniverse();
  const baseBundleRows: string[] = [];
  for (const testCase of baseUniverse.legalCases) {
    const bundle = buildBaseSemanticSourceBundle(testCase, grammar);
    validateBaseSemanticSourceBundle(testCase, grammar, bundle);
    baseBundleRows.push(`${testCase.caseId}\0${bundle.manifestSha256}\n`);
  }
  const profileBundleRows: string[] = [];
  for (const testCase of matrix.cases) {
    if (testCase.expected !== "accept") continue;
    const bundle = buildPipelineProfileSourceBundle(testCase, grammar);
    validatePipelineProfileSourceBundle(testCase, grammar, bundle);
    profileBundleRows.push(`${testCase.profileCaseId}\0${bundle.manifestSha256}\n`);
  }
  const baseSourceBundleRootSha256 = aggregateRoot(baseBundleRows);
  const profileSourceBundleRootSha256 = aggregateRoot(profileBundleRows);
  const sourceBundleRootSha256 = sha256(`${baseSourceBundleRootSha256}\0${profileSourceBundleRootSha256}\n`);
  const privateSourceSetSha256 = requiredSha("CHENG_M9024_PRIVATE_SOURCE_SET_SHA256");
  const realPipelineProtocolSha256 = sha256(canonicalJson(CHENG_REAL_PIPELINE_RECEIPT_PROTOCOL));
  if (CHENG_REAL_PIPELINE_RECEIPT_PROTOCOL.implemented !== false) throw new Error("real pipeline receipt protocol unexpectedly claims implementation");

  const payload = {
    schema: RECEIPT_SCHEMA,
    structuralStatus: "GREEN",
    parserEvidenceStatus: "RED",
    realPipelineReceiptStatus: "RED",
    overallStatus: "RED",
    formalSpecSha256: formalSpec.sha256,
    gateSourceSha256: gateSource.sha256,
    semanticModelSourceSha256: modelSource.sha256,
    pipelineModelSourceSha256: pipelineSource.sha256,
    materializerBytesSha256: CHENG_SOURCE_MATERIALIZER_BYTES_SHA256,
    privateSourceSetSha256,
    driverSha256: driver.sha256,
    bunSha256: bun.sha256,
    guardSha256: guard.sha256,
    privateToolchainManifestSha256: toolchainManifest.sha256,
    grammarObligationRootSha256: grammar.obligationRootSha256,
    grammarObligationCount: grammar.obligations.length,
    grammarRequiredCount: grammar.requiredCount,
    grammarMissingRequiredCount: grammarReceipt.missingRequiredCount,
    grammarSourceCoverageReceiptSha256: grammarReceipt.receiptSha256,
    parserEvidenceRootSha256: grammarReceipt.parserEvidenceRootSha256,
    baseLegalCount: coverage.baseLegalCount,
    profileAssignmentCount: coverage.profileAssignmentCount,
    joinedAssignmentCount: coverage.joinedAssignmentCount,
    legalJoinedCount: coverage.legalJoinedCount,
    classifierAgreementCount: coverage.classifierAgreementCount,
    classifierAgreementSha256: coverage.classifierAgreementSha256,
    coverageContractSha256: coverage.contractSha256,
    matrixCaseCount: matrix.cases.length,
    matrixAcceptCount: matrix.manifest.acceptCount,
    matrixRejectCount: matrix.manifest.rejectCount,
    matrixManifestSha256: matrix.manifest.manifestSha256,
    matrixCoverageReceiptSha256: matrix.coverage.receiptSha256,
    baseSourceBundleCount: baseBundleRows.length,
    profileSourceBundleCount: profileBundleRows.length,
    baseSourceBundleRootSha256,
    profileSourceBundleRootSha256,
    sourceBundleRootSha256,
    realPipelineProtocolSha256,
  } as const;
  const receipt = {...payload, receiptSha256: sha256(canonicalJson(payload))};
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 70;
});
