import type { CsgFact } from "./schema.js";
export declare const BundleCsgSchema: "csg-bundle";
export interface BundleCsgOptions {
    bundleDir: string;
    runtime: string[];
    projectRoot?: string;
}
export interface BundleCsgResult {
    facts: CsgFact[];
    diagnostics: string[];
    counts: BundleCsgCounts;
    text: string;
    report: BundleCsgReport;
}
export interface BundleCsgCounts {
    files: number;
    totalFacts: number;
    moduleFacts: number;
    callFacts: number;
    literalFacts: number;
    assetFacts: number;
    routeFacts: number;
    hookFacts: number;
    domApiFacts: number;
}
export interface BundleCsgReport {
    schema: string;
    bundleDir: string;
    files: number;
    totalFacts: number;
    counts: BundleCsgCounts;
    topLiterals: Array<{
        value: string;
        count: number;
        kind: string;
    }>;
    topCalls: Array<{
        name: string;
        count: number;
    }>;
}
export declare function emitBundleCsg(options: BundleCsgOptions): BundleCsgResult;
