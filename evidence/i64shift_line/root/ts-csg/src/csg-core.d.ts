import { CsgCoreStandard } from "./csg-standard.js";
import type { CsgFact, ExtractOptions, SourceLoc } from "./schema.js";
export declare const CsgCoreSchema: "csg_core";
export declare const CsgCoreFeatures: readonly ["core-facts", "runtime-closure"];
export declare const CsgCoreReportSchema: "csg-core.report";
export declare const CsgCoreSummarySchema: "csg-core.summary";
export declare const CsgCoreRuntimeClosureSchema: "csg-core.runtime-closure";
export interface CsgCoreOptions extends ExtractOptions {
    entryRoots?: string[];
    runtime?: string[];
    emitText?: boolean;
    includeDebugMaps?: boolean;
}
export interface CsgCoreIssue {
    id: string;
    code: string;
    message: string;
    loc?: SourceLoc | undefined;
    owner?: string | undefined;
}
export interface CsgCoreRuntimeRequirement {
    id: string;
    kind: string;
    name: string;
    runtime: string;
    source: string;
    proofs?: string[] | undefined;
    loc?: SourceLoc | undefined;
    owner?: string | undefined;
}
export interface CsgCoreExternalSymbol {
    id: string;
    name: string;
    source: string;
    runtime: string;
}
export interface CsgCoreCounts {
    sourceFiles: number;
    modules: number;
    imports: number;
    exports: number;
    symbols: number;
    types: number;
    functions: number;
    blocks: number;
    terms: number;
    ops: number;
    objectLiterals: number;
    propertyReads: number;
    propertyWrites: number;
    elementReads: number;
    elementWrites: number;
    calls: number;
    data: number;
    runtimeRequirements: number;
    externalSymbols: number;
    unsupported: number;
}
export interface CsgCoreRuntimeClosureGroup {
    id: string;
    runtime: string;
    source: string;
    kind: string;
    name: string;
    count: number;
    providerStatus: "closed" | "open";
    provider?: string | undefined;
    candidateProvider?: string | undefined;
    owners: string[];
    firstLoc?: SourceLoc | undefined;
}
export interface CsgCoreRuntimeClosureBucket {
    id: string;
    runtime: string;
    key: string;
    count: number;
    closedCount: number;
    openCount: number;
    candidateCount: number;
}
export interface CsgCoreRuntimeClosureExternal {
    id: string;
    runtime: string;
    source: string;
    name: string;
    count: number;
    providerStatus: "closed" | "open";
    provider?: string | undefined;
    candidateProvider?: string | undefined;
}
export interface CsgCoreRuntimeClosure {
    schema: typeof CsgCoreRuntimeClosureSchema;
    features: typeof CsgCoreFeatures;
    complete: boolean;
    runtimeRequirementCount: number;
    externalSymbolCount: number;
    closedRequirementCount: number;
    openRequirementCount: number;
    candidateRequirementCount: number;
    closedExternalSymbolCount: number;
    openExternalSymbolCount: number;
    candidateExternalSymbolCount: number;
    groupCount: number;
    byRuntime: CsgCoreRuntimeClosureBucket[];
    byKind: CsgCoreRuntimeClosureBucket[];
    bySource: CsgCoreRuntimeClosureBucket[];
    requirements: CsgCoreRuntimeClosureGroup[];
    externalSymbols: CsgCoreRuntimeClosureExternal[];
}
export interface CsgCoreReport {
    schema: typeof CsgCoreReportSchema;
    standard: typeof CsgCoreStandard;
    features: typeof CsgCoreFeatures;
    complete: boolean;
    profiles: string[];
    profile_set_cid: string;
    factsRoot: string;
    facts_root: string;
    projectRoot: string;
    projectFile?: string | undefined;
    runtimes: string[];
    entryRoots: string[];
    counts: CsgCoreCounts;
    unsupported: CsgCoreIssue[];
    runtimeRequirements: CsgCoreRuntimeRequirement[];
    externalSymbols: CsgCoreExternalSymbol[];
    runtimeClosure: CsgCoreRuntimeClosure;
    diagnostics: string[];
}
export interface CsgCoreSummaryCounts {
    source_files: number;
    modules: number;
    imports: number;
    exports: number;
    symbols: number;
    types: number;
    functions: number;
    blocks: number;
    terms: number;
    ops: number;
    object_literals: number;
    property_reads: number;
    property_writes: number;
    element_reads: number;
    element_writes: number;
    calls: number;
    data: number;
    runtime_requirements: number;
    external_symbols: number;
    unsupported: number;
}
export interface CsgCoreSummaryBucket {
    id: string;
    runtime: string;
    key: string;
    count: number;
    closed_count: number;
    open_count: number;
    candidate_count: number;
}
export interface CsgCoreRuntimeClosureSummary {
    complete: boolean;
    runtime_requirement_count: number;
    external_symbol_count: number;
    closed_requirement_count: number;
    open_requirement_count: number;
    candidate_requirement_count: number;
    closed_external_symbol_count: number;
    open_external_symbol_count: number;
    candidate_external_symbol_count: number;
    group_count: number;
    by_runtime: CsgCoreSummaryBucket[];
    by_kind: CsgCoreSummaryBucket[];
    by_source: CsgCoreSummaryBucket[];
}
export interface CsgCoreSummary {
    schema: typeof CsgCoreSummarySchema;
    standard: typeof CsgCoreStandard;
    features: typeof CsgCoreFeatures;
    complete: boolean;
    profiles: string[];
    profile_set_cid: string;
    facts_root: string;
    project_root: string;
    project_file?: string | undefined;
    runtimes: string[];
    entry_roots: string[];
    counts: CsgCoreSummaryCounts;
    unsupported_count: number;
    runtime_requirement_count: number;
    external_symbol_count: number;
    diagnostic_count: number;
    runtime_closure: CsgCoreRuntimeClosureSummary;
}
export interface CsgCoreIndexFile {
    file: string;
    module_id?: string | undefined;
    fact_count: number;
    symbol_count: number;
    function_count: number;
    call_count: number;
}
export interface CsgCoreIndexSymbol {
    id: string;
    name: string;
    symbol_kind: string;
    file: string;
    line: number;
    column: number;
    exported: boolean;
    fq_name?: string | undefined;
}
export interface CsgCoreIndexFunction {
    id: string;
    name: string;
    symbol?: string | undefined;
    file: string;
    line: number;
    column: number;
    exported: boolean;
    call_count: number;
}
export interface CsgCoreIndexCall {
    id: string;
    file: string;
    line: number;
    column: number;
    owner?: string | undefined;
    callee_text: string;
    callee_kind: string;
    target_ref_id?: string | undefined;
    target_name?: string | undefined;
}
export interface CsgCoreIndex {
    schema: "csg-core.index";
    standard: typeof CsgCoreStandard;
    profiles: string[];
    profile_set_cid: string;
    facts_root: string;
    complete: boolean;
    counts: {
        files: number;
        symbols: number;
        functions: number;
        calls: number;
    };
    files: CsgCoreIndexFile[];
    symbols: CsgCoreIndexSymbol[];
    functions: CsgCoreIndexFunction[];
    calls: CsgCoreIndexCall[];
}
export interface CsgCoreResult {
    facts: CsgFact[];
    diagnostics: string[];
    report: CsgCoreReport;
    text: string;
}
export declare function buildCsgCoreSummary(report: CsgCoreReport): CsgCoreSummary;
export declare function buildCsgCoreIndex(facts: readonly CsgFact[], report: CsgCoreReport): CsgCoreIndex;
export declare function emitCsgCoreFromTs(options: CsgCoreOptions): CsgCoreResult;
