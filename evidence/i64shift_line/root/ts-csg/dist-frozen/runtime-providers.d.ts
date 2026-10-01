export type RuntimeProviderStatus = "closed" | "open";
export interface RuntimeRequirementLike {
    kind: string;
    name: string;
    runtime: string;
    source: string;
    proofs?: readonly string[] | undefined;
}
export interface ExternalSymbolLike {
    name: string;
    runtime: string;
    source: string;
}
export interface RuntimeProviderDecision {
    status: RuntimeProviderStatus;
    provider?: string;
    candidateProvider?: string;
}
export declare function runtimeRequirementProviderDecision(item: RuntimeRequirementLike): RuntimeProviderDecision;
export declare function externalSymbolProviderDecision(item: ExternalSymbolLike): RuntimeProviderDecision;
export declare function isClosedRuntimeRequirement(item: RuntimeRequirementLike): boolean;
export declare function isClosedExternalSymbol(item: ExternalSymbolLike): boolean;
export declare function isChengSourceI32MathCall(name: string): boolean;
export declare function isChengSourceI32NumberPredicateCall(name: string): boolean;
export declare function isChengSourceNumberConvertCall(name: string): boolean;
export declare function isChengSourceBooleanCall(name: string): boolean;
export declare function isChengSourceDateCall(name: string): boolean;
export declare function isChengSourceMathRandomCall(name: string): boolean;
export declare function isChengSourceUint8ArrayCall(name: string): boolean;
export declare function isChengSourceConsoleCall(name: string): boolean;
export declare function isChengSourceTimerCall(name: string): boolean;
export declare function isChengSourcePromiseCall(name: string): boolean;
export declare function isChengSourceJsonCall(name: string): boolean;
export declare function isChengSourceProcessCall(name: string): boolean;
export declare function isChengSourceStringConvertCall(name: string): boolean;
export declare function isChengSourceStringLiteralCall(name: string): boolean;
export declare function isChengSourceStringSplitCall(name: string): boolean;
export declare function isChengSourceArrayTypePredicateCall(name: string): boolean;
export declare function isChengSourceArrayFromCall(name: string): boolean;
export declare function isChengSourceArrayIncludesCall(name: string): boolean;
export declare function isChengSourceArrayIndexOfCall(name: string): boolean;
export declare function isChengSourceArrayPredicateCall(name: string): boolean;
export declare function isChengSourceArrayJoinCall(name: string): boolean;
export declare function isChengSourceArrayFilterCall(name: string): boolean;
export declare function isChengSourceArrayMapCall(name: string): boolean;
export declare function isChengSourceArraySliceCall(name: string): boolean;
export declare function isChengSourceArrayConcatCall(name: string): boolean;
export declare function isChengSourceArrayReverseCall(name: string): boolean;
export declare function isChengSourceArraySortCall(name: string): boolean;
export declare function isChengSourceArrayPushCall(name: string): boolean;
export declare function isChengSourceArrayPopCall(name: string): boolean;
export declare function isChengSourceArrayShiftCall(name: string): boolean;
export declare function isChengSourceArrayUnshiftCall(name: string): boolean;
export declare function isChengSourceArrayFillCall(name: string): boolean;
export declare function isChengSourceArrayReduceCall(name: string): boolean;
export declare function isChengSourceArrayFindIndexCall(name: string): boolean;
export declare function isChengSourceArrayFindCall(name: string): boolean;
export declare function isChengSourceArrayAtCall(name: string): boolean;
export declare function isChengSourceArrayIterCall(name: string): boolean;
export declare function isChengSourceObjectFreezeCall(name: string): boolean;
export declare function isChengSourceObjectAssignCall(name: string): boolean;
export declare function isChengSourceObjectValuesCall(name: string): boolean;
export declare function isChengSourceObjectKeyEntryCall(name: string): boolean;
export declare function isChengSourceObjectIsFrozenCall(name: string): boolean;
export declare function isChengSourceObjectDefinePropertyCall(name: string): boolean;
export declare function isChengSourceSupportedRuntimeRequirement(item: RuntimeRequirementLike): boolean;
export declare function isChengSourceSupportedExternalSymbol(item: ExternalSymbolLike): boolean;
