import { type CsgCoreOptions, type CsgCoreReport } from "./csg-core.js";
import type { CsgFact, SourceLoc } from "./schema.js";
export declare const CsgJsSchema: "csg-js";
export declare const CsgJsFeatures: readonly ["js-structured-facts", "runtime-closure"];
export declare const CsgJsReportSchema: "csg-js.report";
export interface CsgJsOptions extends CsgCoreOptions {
}
export type CsgJsRuntimeDomain = "ecmascript" | "object" | "prototype" | "promise" | "module" | "exception" | "iterator" | "json" | "timer" | "console" | "node" | "browser" | "external";
export interface CsgJsRuntimeRequirement {
    id: string;
    coreRequirement: string;
    domain: CsgJsRuntimeDomain;
    kind: string;
    name: string;
    runtime: string;
    source: string;
    providerStatus: "closed" | "open";
    provider?: string | undefined;
    candidateProvider?: string | undefined;
    loc?: SourceLoc | undefined;
    owner?: string | undefined;
}
export interface CsgJsExternalSymbol {
    id: string;
    coreExternalSymbol: string;
    domain: CsgJsRuntimeDomain;
    name: string;
    runtime: string;
    source: string;
    providerStatus: "closed" | "open";
    provider?: string | undefined;
    candidateProvider?: string | undefined;
}
export interface CsgJsRuntimeClosureBucket {
    id: string;
    domain: CsgJsRuntimeDomain;
    count: number;
    closedCount: number;
    openCount: number;
    candidateCount: number;
}
export interface CsgJsRuntimeClosure {
    schema: "csg-js.runtime-closure";
    features: typeof CsgJsFeatures;
    complete: boolean;
    requirementCount: number;
    externalSymbolCount: number;
    openRequirementCount: number;
    openExternalSymbolCount: number;
    closedRequirementCount: number;
    closedExternalSymbolCount: number;
    candidateRequirementCount: number;
    candidateExternalSymbolCount: number;
    domainCount: number;
    byDomain: CsgJsRuntimeClosureBucket[];
    requirements: CsgJsRuntimeRequirement[];
    externalSymbols: CsgJsExternalSymbol[];
}
export interface CsgJsCounts {
    coreFacts: number;
    jsFacts: number;
    sourceFiles: number;
    modules: number;
    functions: number;
    calls: number;
    classes: number;
    classHeritage: number;
    objectLiterals: number;
    propertyAccesses: number;
    propertyWrites: number;
    elementAccesses: number;
    elementWrites: number;
    moduleImports: number;
    runtimeRequirements: number;
    externalSymbols: number;
    unsupported: number;
}
export interface CsgJsReport {
    schema: typeof CsgJsReportSchema;
    features: typeof CsgJsFeatures;
    complete: false;
    coreComplete: boolean;
    runtimeImplemented: false;
    projectRoot: string;
    projectFile?: string | undefined;
    runtimes: string[];
    entryRoots: string[];
    counts: CsgJsCounts;
    runtimeClosure: CsgJsRuntimeClosure;
    blockedReasons: string[];
    coreReport: CsgCoreReport;
    diagnostics: string[];
}
export interface CsgJsResult {
    facts: CsgFact[];
    diagnostics: string[];
    report: CsgJsReport;
    text: string;
}
export interface CsgJsValidationResult {
    ok: boolean;
    diagnostics: string[];
    facts: CsgFact[];
}
export declare function emitCsgJsFromTs(options: CsgJsOptions): CsgJsResult;
export declare function validateCsgJsText(text: string): CsgJsValidationResult;
