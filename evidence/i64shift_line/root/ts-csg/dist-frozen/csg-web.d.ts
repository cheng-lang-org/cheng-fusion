import { type RuntimeOpenRequirementTop } from "./csg-relfacts.js";
import { type CsgCoreOptions, type CsgCoreReport } from "./csg-core.js";
import type { CsgFact, SourceLoc } from "./schema.js";
export declare const CsgWebSchema: "csg-web";
export declare const CsgWebFeatures: readonly ["web-facts", "js-semantics", "dom-css-runtime-closure", "dom-node-templates", "voice-computer-use-scenarios", "typed-computer-use-actions", "voice-task-templates", "surface-owner-attribution", "truth-ref-linkage", "pixel-region-mapping"];
export declare const CsgWebReportSchema: "csg-web.report";
export interface CsgWebOptions extends CsgCoreOptions {
    /**
     * Materialize JSONL text in the result. Keep this enabled for CLI/backward
     * compatibility, but production binary flows should consume `facts` directly.
     */
    emitText?: boolean;
}
export interface CsgWebRuntimeClosureBucket {
    id: string;
    domain: string;
    count: number;
    closedCount: number;
    openCount: number;
    candidateCount: number;
}
export interface CsgWebRuntimeRequirement {
    id: string;
    coreRequirement: string;
    domain: string;
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
export interface CsgWebExternalSymbol {
    id: string;
    coreExternalSymbol: string;
    domain: string;
    name: string;
    runtime: string;
    source: string;
    providerStatus: "closed" | "open";
    provider?: string | undefined;
    candidateProvider?: string | undefined;
}
export interface CsgWebRuntimeClosure {
    schema: "csg-web.runtime-closure";
    features: typeof CsgWebFeatures;
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
    byDomain: CsgWebRuntimeClosureBucket[];
    requirements: CsgWebRuntimeRequirement[];
    externalSymbols: CsgWebExternalSymbol[];
}
export interface CsgWebExternalCapabilityManifestItem {
    id: string;
    capabilityKind: "runtime_requirement" | "external_symbol";
    domain: string;
    kind?: string | undefined;
    name: string;
    runtime: string;
    source: string;
    providerStatus: "open";
    candidateProvider: string;
    requiredProvider: "surface-provider";
    hardFailReason: "surface-provider-not-attached";
    loc?: SourceLoc | undefined;
    owner?: string | undefined;
}
export interface CsgWebExternalCapabilityManifestBucket {
    id: string;
    domain: string;
    candidateProvider: string;
    count: number;
    requirementCount: number;
    externalSymbolCount: number;
}
export interface CsgWebExternalCapabilityManifest {
    schema: "csg-web.external-capability-manifest";
    complete: boolean;
    hardFailUntilProvided: true;
    requiredProvider: "surface-provider";
    capabilityCount: number;
    openCapabilityCount: number;
    requirementCount: number;
    externalSymbolCount: number;
    byDomain: CsgWebExternalCapabilityManifestBucket[];
    byCandidateProvider: CsgWebExternalCapabilityManifestBucket[];
    capabilities: CsgWebExternalCapabilityManifestItem[];
}
export interface CsgWebCounts {
    coreFacts: number;
    webFacts: number;
    sourceFiles: number;
    modules: number;
    jsFunctions: number;
    jsCalls: number;
    jsClasses: number;
    jsObjectLiterals: number;
    jsPropertyAccesses: number;
    jsPropertyWrites: number;
    jsElementAccesses: number;
    jsElementWrites: number;
    jsxElements: number;
    domNodeTemplates: number;
    moduleImports: number;
    runtimeRequirements: number;
    externalSymbols: number;
    unsupported: number;
    surfaceOwners: number;
    truthRefs: number;
    pixelRegions: number;
}
export interface CsgWebReport {
    schema: typeof CsgWebReportSchema;
    features: typeof CsgWebFeatures;
    complete: boolean;
    coreComplete: boolean;
    runtimeImplemented: false;
    runtimeIndependent: true;
    engineDependency: "none";
    oracleUse: string[];
    projectRoot: string;
    projectFile?: string | undefined;
    runtimes: string[];
    entryRoots: string[];
    counts: CsgWebCounts;
    runtimeClosure: CsgWebRuntimeClosure;
    externalCapabilityManifest: CsgWebExternalCapabilityManifest;
    blockedReasons: string[];
    relfacts_count: number;
    relfacts_diff_assert_count: number;
    relfacts_diff_retract_count: number;
    runtime_open_requirement_top: RuntimeOpenRequirementTop[];
    control_surface_action_count: number;
    actionable_dom_control_count: number;
    control_surface_skipped_unlabeled_count: number;
    control_surface_actionable_coverage_percent: number;
    voice_computer_use_scenario_count: number;
    voice_computer_use_control_coverage_percent: number;
    computer_use_action_count: number;
    computer_use_action_coverage_percent: number;
    computer_use_action_unresolved_count: number;
    voice_task_template_count: number;
    voice_task_step_count: number;
    confirmation_gate_count: number;
    voice_task_high_risk_step_count: number;
    voice_task_required_confirmation_gate_count: number;
    voice_task_missing_confirmation_gate_count: number;
    voice_task_blocked_step_count: number;
    voice_task_ambiguous_step_count: number;
    unimaker_internal_task_ready: boolean;
    subgraph_cid_count: number;
    coreReport: CsgCoreReport;
    diagnostics: string[];
}
export interface CsgWebResult {
    facts: CsgFact[];
    diagnostics: string[];
    report: CsgWebReport;
    /** JSONL facts text. Empty when `emitText` is false. */
    text: string;
}
export interface CsgWebValidationResult {
    ok: boolean;
    diagnostics: string[];
    facts: CsgFact[];
}
/** Serial engine (unchanged public behavior): validate blocks, then identities. */
export declare function emitCsgWebFromTs(options: CsgWebOptions): CsgWebResult;
/**
 * Merged-scan extract engine: one held-CLI process (`merged-scan --mode
 * sandbox --canonical-input`) produces the sandbox validation and the
 * per-fact identity rows from a single canonical JSONL read of the core
 * facts. The CLI derives those rows from the validation's internal bound DAG
 * build, so the second full per-line scan of `fact-identities` (and this
 * side's second stableJson serialization of the whole fact set) is gone.
 * Subgraph sources resolve to rows by object identity into `phase.facts`;
 * only the few web-fact sources (not part of the validated fact set) still
 * go through the standalone canonical `fact-identities` scan. Output equals
 * `emitCsgWebFromTs` byte for byte.
 */
export declare function emitCsgWebFromTsAsync(options: CsgWebOptions): Promise<CsgWebResult>;
export declare function validateCsgWebText(text: string): CsgWebValidationResult;
