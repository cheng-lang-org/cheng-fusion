export const CsgEgraphSchema = "csg-egraph";
export function analyzeEgraphCandidates(_relfacts, _coreFacts) {
    const candidates = [];
    // For now, return an empty analysis - the E-Graph infrastructure
    // is established but actual rewrite discovery requires the cold compiler
    // to participate in the equivalence proof contract.
    //
    // Per better-plan.md:
    // - Candidates come from csg_relfacts::v1
    // - Only proven-safe rewrites enter BodyIR/cold rewrite set
    // - Equivalence contract: same facts input, .o output must match
    // - Mutable slots excluded from CSE/hash dedup
    // - LICM read-only until loop invariant/alias/side effect facts exist
    return {
        schema: CsgEgraphSchema,
        candidates,
        candidateCount: 0,
        provenCount: 0,
        totalCostReduction: 0,
    };
}
export function egraphReportToText(report) {
    const lines = [
        `schema: ${report.schema}`,
        `candidates: ${report.candidateCount}`,
        `proven: ${report.provenCount}`,
        `cost_reduction_estimate: ${report.totalCostReduction}`,
    ];
    if (report.candidates.length > 0) {
        lines.push("--- candidates ---");
        for (const c of report.candidates) {
            lines.push(`${c.safety}\t${c.kind}\t${c.location}\t${c.description}`);
        }
    }
    return lines.join("\n");
}
