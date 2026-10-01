import type { ChengCsgFactIdentityRow } from "./csg-cheng-bridge.js";
import type { CsgFact } from "./schema.js";
export declare const CsgCoreStandard: "csg_core::v1";
export declare const CsgCoreSchemaName: "csg_core";
export declare const CsgCoreProfile: "csg_core";
export declare const CsgWebProfile: "csg_dialect::web";
export declare const CsgNativeProfile: "csg_dialect::native";
export declare const CsgFinanceProfile: "csg_dialect::finance";
export declare const CsgRelfactsStandard: "csg_relfacts::v1";
export type CsgValidationMode = "strict" | "sandbox";
export interface CsgValidationResult {
    valid: boolean;
    standard: typeof CsgCoreStandard;
    profiles: string[];
    profileSetCid: string;
    profile_set_cid: string;
    factCount: number;
    factsRoot: string;
    facts_root: string;
    complete: boolean;
    unsupportedCount: number;
    tombstoneCount: number;
    errors: string[];
}
export interface CsgDiffResult {
    same: boolean;
    leftRoot: string;
    rightRoot: string;
    added: string[];
    removed: string[];
    changed: string[];
}
export declare function parseCsgFactsText(text: string): CsgFact[];
export declare function canonicalCsgFactsText(facts: readonly CsgFact[]): string;
export declare function csgFactsRoot(facts: readonly CsgFact[]): string;
export declare function validateCsgFacts(facts: readonly CsgFact[], mode?: CsgValidationMode): CsgValidationResult;
export declare function validateCsgFactsAsync(facts: readonly CsgFact[], mode?: CsgValidationMode): Promise<CsgValidationResult>;
export declare function validateCsgCanonicalFactsAsync(facts: readonly CsgFact[], mode?: CsgValidationMode): Promise<CsgValidationResult>;
export interface CsgMergedScanResult {
    validation: CsgValidationResult;
    identities: readonly ChengCsgFactIdentityRow[];
}
/**
 * Single-pass merged scan: one held-CLI process produces the sandbox
 * validation and the per-fact identity rows from one canonical JSONL read.
 * Validation fields and identity rows are byte-identical to running
 * `validateCsgCanonicalFactsAsync` + `chengCsgFactIdentitiesCanonicalAsync`
 * separately; the second full scan of the same fact set is gone.
 */
export declare function mergedCsgScanAsync(facts: readonly CsgFact[]): Promise<CsgMergedScanResult>;
export declare function diffCsgFacts(left: readonly CsgFact[], right: readonly CsgFact[]): CsgDiffResult;
