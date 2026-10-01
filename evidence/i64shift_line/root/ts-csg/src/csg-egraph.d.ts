import type { CsgFact } from "./schema.js";
import type { CsgRelfact } from "./csg-relfacts.js";
export declare const CsgEgraphSchema: "csg-egraph";
export interface EgraphRewriteCandidate {
    kind: "cse" | "constant_fold" | "dead_code" | "licm" | "inline";
    location: string;
    description: string;
    safety: "proven" | "candidate" | "unsafe";
    beforeCost: number;
    afterCost: number;
}
export interface EgraphAnalysisResult {
    schema: typeof CsgEgraphSchema;
    candidates: EgraphRewriteCandidate[];
    candidateCount: number;
    provenCount: number;
    totalCostReduction: number;
}
export declare function analyzeEgraphCandidates(_relfacts: readonly CsgRelfact[], _coreFacts: readonly CsgFact[]): EgraphAnalysisResult;
export declare function egraphReportToText(report: EgraphAnalysisResult): string;
