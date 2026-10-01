export type CsgFact = {
    [key: string]: unknown;
};
export type TranspileDiagnostic = {
    functionId: string;
    functionName: string;
    opId: string;
    reason: string;
};
export type TranspileFunctionResult = {
    ok: boolean;
    name: string;
    code: string;
    preludeUsed: Set<string>;
    structsUsed: Set<string>;
    diagnostics: TranspileDiagnostic[];
};
type OpFact = CsgFact & {
    id: string;
    opKind: string;
    block?: string;
    ordinal?: number;
};
export type HandleTeardownBridge = {
    bridgeFn: string;
    eventProps: readonly string[];
    closeMethod: string;
};
export declare class TranspilerFactIndex {
    readonly opsById: Map<string, OpFact>;
    readonly opsByBlock: Map<string, OpFact[]>;
    readonly functionById: Map<string, CsgFact>;
    readonly functionByName: Map<string, CsgFact>;
    readonly dataById: Map<string, unknown>;
    readonly typeDeclByName: Map<string, CsgFact>;
    readonly constLiterals: Map<string, string>;
    readonly constLiteralTypes: Map<string, string>;
    readonly catchParamsByFunction: Map<string, Set<string>>;
    constructor(facts: readonly CsgFact[], functionAliases?: ReadonlyMap<string, string>, baseIndex?: TranspilerFactIndex);
    readonly aliasNames: Set<string>;
    private applyFunctionAliases;
}
export declare class TypeMapper {
    readonly usedStructs: Set<string>;
    private readonly index;
    constructor(index: TranspilerFactIndex);
    map(typeSource: string): {
        type?: string;
        reason?: string;
    };
    zeroValueOf(chengType: string): string;
    emitStructs(): {
        code: string;
        diagnostics: string[];
    };
}
export declare function stripImportPrefixes(t: string): string;
export declare class ChengFunctionTranspiler {
    private readonly index;
    private readonly types;
    private readonly diagnostics;
    private readonly preludeUsed;
    private fnId;
    private fnName;
    private readonly localTypes;
    private readonly constBindings;
    private tmpCounter;
    readonly monomorphRequests: Array<{
        name: string;
        mangled: string;
        overrides: Map<number, string>;
    }>;
    readonly jsonStructEncoderRequests: Set<string>;
    private jsonStructEncoderName;
    private jsonArrayEncoderName;
    readonly auxiliaryFunctions: string[];
    deferredFrameKind: number | undefined;
    deferredResumeCallbackFid: string | undefined;
    deferredMs: number;
    recvDoneFrameKind: number | undefined;
    recvDoneResumeCallbackFid: string | undefined;
    private readonly externNames;
    private readonly stateSetterNames;
    private readonly hostBridges;
    private readonly hostObjects;
    private readonly boxRefSlots;
    private readonly objBoxRefSlots;
    private readonly setBoxRefSlots;
    private readonly arrBoxRefSlots;
    private readonly structBoxRefSlots;
    private readonly recvDoneSendBridges;
    private readonly handleTeardownBridges;
    private readonly setterTypes;
    private readonly propCallbacks;
    private readonly refStateMirrors;
    private handleAliasSource;
    private functionHasOtherWriteToName;
    constructor(index: TranspilerFactIndex, types: TypeMapper, externNames?: ReadonlySet<string>, stateSetterNames?: ReadonlySet<string>, hostBridges?: ReadonlyMap<string, string>, hostObjects?: ReadonlySet<string>, boxRefSlots?: ReadonlyMap<string, string>, objBoxRefSlots?: ReadonlyMap<string, ReadonlyMap<string, string>>, setBoxRefSlots?: ReadonlyMap<string, string>, recvDoneSendBridges?: ReadonlyMap<string, string>, arrBoxRefSlots?: ReadonlyMap<string, string>, structBoxRefSlots?: ReadonlyMap<string, string>, handleTeardownBridges?: ReadonlyMap<string, HandleTeardownBridge>, refStateMirrors?: ReadonlySet<string>, propCallbacks?: ReadonlyMap<string, string>, setterTypes?: ReadonlyMap<string, string>);
    narrowAnyReturnToVoid: boolean;
    setterEmitNames: ReadonlyMap<string, string>;
    setterStateNames: ReadonlyMap<string, string>;
    boxRefGlobalNames: ReadonlyMap<string, string>;
    preferredEventParamType: string | undefined;
    propCalleeAliases: ReadonlyMap<string, string>;
    private chengScalarToTsType;
    private objectLiteralShape;
    private synthStructName;
    private synthesizeObjectStruct;
    private objBoxRefPresentVar;
    private objBoxRefFieldVar;
    private objBoxRefCurrentName;
    private objBoxRefFieldAccess;
    private boxRefCurrentName;
    private boxRefSlotVar;
    private setBoxRefCurrentName;
    private arrBoxRefCurrentName;
    private structBoxRefCurrentName;
    private structBoxRefPresentExpr;
    private refStateMirrorCurrentName;
    private resolveStatementBlockOps;
    private tryFoldHandleTeardown;
    private matchSetTimeoutDeferred;
    private matchAsyncIifeAwait;
    private lowerAsyncIifeAwaitSplit;
    emitDeferredResumeBody(callbackFid: string): string[] | undefined;
    emitAsyncResumeBody(innerFid: string): string[] | undefined;
    private hostObjectCurrentRead;
    private hostVideoRefCurrentName;
    private typeDeclFieldOf;
    private optionalAbsentFieldType;
    private zeroValueExprFor;
    private isUndefinedishOperand;
    private hostVideoHandleExpr;
    private hostFullscreenElementRead;
    private injectedFvNames;
    private tryMarkStack;
    private catchParamStack;
    private currentReturnType;
    private returnTypeWithOverrides;
    private returnTypeNarrowedForInstance;
    transpileWithInjectedParams(functionId: string, emitName: string, freeVarTypes: ReadonlyMap<string, string>, paramTypes?: ReadonlyMap<string, string>, paramOverrides?: ReadonlyMap<number, string>): TranspileFunctionResult;
    transpile(functionId: string, emitNameOverride?: string, paramOverrides?: ReadonlyMap<number, string>): TranspileFunctionResult;
    private result;
    private fail;
    private freshVar;
    private entryBlockOf;
    private emitBlock;
    private emitBlockInner;
    private emitLogicalStatement;
    private emitStatementOperand;
    private emitCondition;
    private inferLocalType;
    private exprType;
    private emitExpr;
    private resolveArrowReturnExpr;
    private resolveZeroArgLocalReturnExpr;
    private emitArrowBindings;
    private exprTypeUnderRenames;
    private inlineArrowExpr;
    private renameStack;
    private emitExprWithRenames;
    private renameOf;
    private emitCall;
    private compileBlockArrowHelper;
    private emitArrayMethod;
    private inlineArrowCondition;
    private exprTypeWithBinding;
}
export declare function mapParamType(facts: readonly CsgFact[], typeSource: string, baseIndex?: TranspilerFactIndex): string | undefined;
export declare function transpileClosure(facts: readonly CsgFact[], closureFunctionId: string, emitName: string, freeVarTypes: ReadonlyMap<string, string>, externImpls?: ReadonlyMap<string, string>, stateSetterNames?: ReadonlySet<string>, paramTypes?: ReadonlyMap<string, string>, hostBridges?: ReadonlyMap<string, string>, hostObjects?: ReadonlySet<string>, boxRefSlots?: ReadonlyMap<string, string>, objBoxRefSlots?: ReadonlyMap<string, ReadonlyMap<string, string>>, setBoxRefSlots?: ReadonlyMap<string, string>, deferredFrameKind?: number, recvDoneFrameKind?: number, recvDoneSendBridges?: ReadonlyMap<string, string>, localFunctionAliases?: ReadonlyMap<string, string>, baseIndex?: TranspilerFactIndex, arrBoxRefSlots?: ReadonlyMap<string, string>, structBoxRefSlots?: ReadonlyMap<string, string>, handleTeardownBridges?: ReadonlyMap<string, HandleTeardownBridge>, refStateMirrors?: ReadonlySet<string>, propCallbacks?: ReadonlyMap<string, string>, setterTypes?: ReadonlyMap<string, string>, narrowAnyReturnToVoid?: boolean, setterEmitNames?: ReadonlyMap<string, string>, setterStateNames?: ReadonlyMap<string, string>, boxRefGlobalNames?: ReadonlyMap<string, string>, propCalleeAliases?: ReadonlyMap<string, string>): {
    code: string;
    results: TranspileFunctionResult[];
    structDiagnostics: string[];
    deferred?: {
        kind: number;
        resumeFnName: string;
        ms: number;
    };
    recvDone?: {
        kind: number;
        resumeFnName: string;
    };
    jsonStructEncoders: string[];
};
export type StateSlot = {
    stateName: string;
    setterName: string;
    chengType: string;
    slotVar: string;
    initialExpr: string;
};
export declare function emitStateSlots(facts: readonly CsgFact[], componentFunctionId: string, prefix: string, wanted: readonly string[], baseIndex?: TranspilerFactIndex): {
    code: string;
    slots: StateSlot[];
    diagnostics: string[];
};
export declare function transpileFunctions(facts: readonly CsgFact[], functionNames: readonly string[]): {
    code: string;
    results: TranspileFunctionResult[];
    structDiagnostics: string[];
};
export {};
