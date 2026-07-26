import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {buildEbnfParserNodeMap} from "../src/cheng_ebnf_parser_node_map.ts";
import {validateTypedExprFormalSpecBinding} from
  "../src/cheng_regalloc_preflight_m9022.ts";

const FUSION_ROOT = join(import.meta.dir, "..");
const CHENG_ROOT = "/Users/lbcheng/cheng-lang";
const formalSpec = readFileSync(
  join(CHENG_ROOT, "docs/cheng-formal-spec.md"),
);
const parser = readFileSync(
  join(CHENG_ROOT, "src/core/lang/parser.cheng"),
);
const producerDeclarations = readFileSync(
  join(
    FUSION_ROOT,
    "fixtures/semantic/ebnf_parser_producer_claims.json",
  ),
);
const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");
const receiptA = sha256("current-formal-profile-receipt-a");
const receiptB = sha256("current-formal-profile-receipt-b");
const sourceSha256 = sha256("current-formal-profile-source");
const manifestSha256 = sha256("current-formal-profile-manifest");
const provisional = buildEbnfParserNodeMap(
  formalSpec,
  parser,
  producerDeclarations,
);
const complete = {
  ...provisional,
  receiptEvidence: {
    inputCount: 2,
    acceptedCount: 2,
    rejectedCount: 0,
    rows: [
      {
        sourcePath: "formal-profile.cheng",
        receiptPath: "formal-profile.official.receipt.json",
        manifestPath: "formal-profile.manifest.json",
        sourceSha256,
        receiptSha256: receiptA,
        manifestSha256,
        accepted: true,
        reason: "",
      },
      {
        sourcePath: "formal-profile.cheng",
        receiptPath: "formal-profile.gen3.receipt.json",
        manifestPath: "formal-profile.manifest.json",
        sourceSha256,
        receiptSha256: receiptB,
        manifestSha256,
        accepted: true,
        reason: "",
      },
    ],
  },
  counts: {
    total: provisional.rows.length,
    MAPPED: provisional.rows.length,
    PARTIAL: 0,
    UNMAPPED: 0,
    requiredObligationCount:
      provisional.counts.requiredObligationCount,
    witnessedRequiredCount:
      provisional.counts.requiredObligationCount,
    missingRequiredCount: 0,
  },
  rows: provisional.rows.map((row) => ({
    ...row,
    status: "MAPPED",
    receipt_ready: true,
    witnessed_required_count: row.required_obligation_count,
    missing_required_count: 0,
    missing_required_obligation_ids: [],
    witness_projections: row.missing_required_obligation_ids.flatMap(
      (obligationId) => [receiptA, receiptB].map((receiptSha256) => ({
        obligation_id: obligationId,
        parser_node_kind:
          row.span_model === "type_syntax_span"
            ? "ParserTypeSyntaxNominal"
            : row.span_model === "pattern_span"
              ? "ParserPatternBinding"
              : row.span_model === "annotation_span"
                ? "ParserAnnotation"
                : row.span_model === "annotation_arg_span"
                  ? "ParserAnnotationArgIdentifier"
                  : "ParserValueExprIdentifier",
        parser_node_identity_sha256:
          sha256(`${row.name}\0${obligationId}`),
        channel: "synthetic-formal-profile-validator",
        receipt_sha256: receiptSha256,
      })),
    ),
    witness_receipt_sha256s: [receiptA, receiptB],
  })),
};
const encodeMap = (value: unknown): Buffer =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const sourceSnapshotSha256 =
  sha256("current-formal-profile-source-snapshot");
const receiptToolClosureSha256 =
  sha256("current-formal-profile-receipt-tool-closure");
const receiptSourcePlanSha256 =
  sha256("current-formal-profile-receipt-source-plan");
const bind = (
  candidateSpec: Buffer | string,
  candidateMap: unknown,
  candidateSourceSnapshotSha256: string,
  expectedProfileIdentitySha256?: string,
  candidateReceiptToolClosureSha256 = receiptToolClosureSha256,
  candidateReceiptSourcePlanSha256 = receiptSourcePlanSha256,
) => validateTypedExprFormalSpecBinding(
  candidateSpec,
  encodeMap(candidateMap),
  parser,
  producerDeclarations,
  {
    sourcePath: join(CHENG_ROOT, "docs/cheng-formal-spec.md"),
    sourceSnapshotSha256: candidateSourceSnapshotSha256,
    receiptToolClosureSha256: candidateReceiptToolClosureSha256,
    receiptSourcePlanSha256: candidateReceiptSourcePlanSha256,
    expectedProfileIdentitySha256,
  },
);

const baseline = bind(formalSpec, complete, sourceSnapshotSha256);
assert.equal(baseline.status, "GREEN", baseline.reason);
assert.equal(baseline.schema, "cheng_current_formal_profile");
assert.doesNotMatch(baseline.schema, /\.v[0-9]+$/);
assert.match(baseline.profileIdentitySha256, /^[0-9a-f]{64}$/);
const expected = baseline.profileIdentitySha256;

const formalBlockMutation = formalSpec.toString("utf8").replace(
  "- 不支持 `*` 导出标记。",
  "- 支持 `*` 导出标记。",
);
assert.notEqual(formalBlockMutation, formalSpec.toString("utf8"));
assert.equal(
  bind(formalBlockMutation, complete, sourceSnapshotSha256, expected)
    .status,
  "UNPROVEN",
);

const manifestMutation = structuredClone(complete);
manifestMutation.receiptEvidence.rows[0].manifestSha256 =
  sha256("mutated-current-formal-profile-manifest");
assert.equal(
  bind(formalSpec, manifestMutation, sourceSnapshotSha256, expected)
    .status,
  "UNPROVEN",
);

const receiptMutation = structuredClone(complete);
receiptMutation.receiptEvidence.rows[0].receiptSha256 =
  sha256("mutated-current-formal-profile-receipt");
assert.equal(
  bind(formalSpec, receiptMutation, sourceSnapshotSha256, expected)
    .status,
  "UNPROVEN",
);

const mapMutation = structuredClone(complete);
mapMutation.rows[0].notes = `${mapMutation.rows[0].notes} mutation`;
assert.equal(
  bind(formalSpec, mapMutation, sourceSnapshotSha256, expected).status,
  "UNPROVEN",
);

const structuredKindMutation = structuredClone(complete);
const typeSyntaxRow = structuredKindMutation.rows.find(
  (row) => row.span_model === "type_syntax_span",
)!;
typeSyntaxRow.witness_projections[0].parser_node_kind =
  "ParserValueTokenIdentifier";
assert.equal(
  bind(
    formalSpec,
    structuredKindMutation,
    sourceSnapshotSha256,
    expected,
  ).status,
  "UNPROVEN",
);

const missingProjectionMutation = structuredClone(complete);
missingProjectionMutation.rows[0].witness_projections.pop();
assert.equal(
  bind(
    formalSpec,
    missingProjectionMutation,
    sourceSnapshotSha256,
    expected,
  ).status,
  "UNPROVEN",
);

const projectionVersionFragmentMutation = structuredClone(complete);
(projectionVersionFragmentMutation.rows[0]
  .witness_projections[0] as any).compatibility = "v1";
assert.equal(
  bind(
    formalSpec,
    projectionVersionFragmentMutation,
    sourceSnapshotSha256,
    expected,
  ).status,
  "UNPROVEN",
);

assert.equal(
  bind(
    formalSpec,
    complete,
    sha256("mutated-current-source-snapshot"),
    expected,
  ).status,
  "UNPROVEN",
);
assert.equal(
  bind(
    formalSpec,
    complete,
    sourceSnapshotSha256,
    expected,
    sha256("mutated-current-formal-receipt-tool-closure"),
  ).status,
  "UNPROVEN",
);
assert.equal(
  bind(
    formalSpec,
    complete,
    sourceSnapshotSha256,
    expected,
    receiptToolClosureSha256,
    sha256("mutated-current-formal-receipt-source-plan"),
  ).status,
  "UNPROVEN",
);

console.log(
  "item22 current formal profile identity: PASS " +
  `productions=${complete.counts.total} ` +
  `obligations=${complete.counts.requiredObligationCount}`,
);
