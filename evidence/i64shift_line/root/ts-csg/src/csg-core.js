import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { externalSymbolProviderDecision, runtimeRequirementProviderDecision } from "./runtime-providers.js";
import { CsgCoreProfile, CsgCoreSchemaName, CsgCoreStandard, validateCsgFacts, } from "./csg-standard.js";
import { stableJson } from "./stable-json.js";
export const CsgCoreSchema = CsgCoreSchemaName;
export const CsgCoreFeatures = ["core-facts", "runtime-closure"];
export const CsgCoreReportSchema = "csg-core.report";
export const CsgCoreSummarySchema = "csg-core.summary";
export const CsgCoreRuntimeClosureSchema = "csg-core.runtime-closure";
export function buildCsgCoreSummary(report) {
    return {
        schema: CsgCoreSummarySchema,
        standard: report.standard,
        features: report.features,
        complete: report.complete,
        profiles: [...report.profiles],
        profile_set_cid: report.profile_set_cid,
        facts_root: report.facts_root,
        project_root: report.projectRoot,
        project_file: report.projectFile,
        runtimes: [...report.runtimes],
        entry_roots: [...report.entryRoots],
        counts: {
            source_files: report.counts.sourceFiles,
            modules: report.counts.modules,
            imports: report.counts.imports,
            exports: report.counts.exports,
            symbols: report.counts.symbols,
            types: report.counts.types,
            functions: report.counts.functions,
            blocks: report.counts.blocks,
            terms: report.counts.terms,
            ops: report.counts.ops,
            object_literals: report.counts.objectLiterals,
            property_reads: report.counts.propertyReads,
            property_writes: report.counts.propertyWrites,
            element_reads: report.counts.elementReads,
            element_writes: report.counts.elementWrites,
            calls: report.counts.calls,
            data: report.counts.data,
            runtime_requirements: report.counts.runtimeRequirements,
            external_symbols: report.counts.externalSymbols,
            unsupported: report.counts.unsupported,
        },
        unsupported_count: report.unsupported.length,
        runtime_requirement_count: report.runtimeRequirements.length,
        external_symbol_count: report.externalSymbols.length,
        diagnostic_count: report.diagnostics.length,
        runtime_closure: {
            complete: report.runtimeClosure.complete,
            runtime_requirement_count: report.runtimeClosure.runtimeRequirementCount,
            external_symbol_count: report.runtimeClosure.externalSymbolCount,
            closed_requirement_count: report.runtimeClosure.closedRequirementCount,
            open_requirement_count: report.runtimeClosure.openRequirementCount,
            candidate_requirement_count: report.runtimeClosure.candidateRequirementCount,
            closed_external_symbol_count: report.runtimeClosure.closedExternalSymbolCount,
            open_external_symbol_count: report.runtimeClosure.openExternalSymbolCount,
            candidate_external_symbol_count: report.runtimeClosure.candidateExternalSymbolCount,
            group_count: report.runtimeClosure.groupCount,
            by_runtime: report.runtimeClosure.byRuntime.map(summaryBucket),
            by_kind: report.runtimeClosure.byKind.map(summaryBucket),
            by_source: report.runtimeClosure.bySource.map(summaryBucket),
        },
    };
}
function summaryBucket(bucket) {
    return {
        id: bucket.id,
        runtime: bucket.runtime,
        key: bucket.key,
        count: bucket.count,
        closed_count: bucket.closedCount,
        open_count: bucket.openCount,
        candidate_count: bucket.candidateCount,
    };
}
export function buildCsgCoreIndex(facts, report) {
    const fileStats = new Map();
    const symbols = [];
    const functions = [];
    const calls = [];
    const callsByOwner = new Map();
    for (const fact of facts) {
        const file = factFile(fact);
        if (file)
            ensureIndexFile(fileStats, file).fact_count += 1;
        if (fact.kind === "csg.module") {
            const pathValue = stringField(fact, "path");
            if (pathValue) {
                const item = ensureIndexFile(fileStats, pathValue);
                item.module_id = stringField(fact, "id");
            }
        }
        else if (fact.kind === "csg.symbol") {
            const loc = locField(fact);
            if (!loc)
                continue;
            const id = stringField(fact, "id");
            const name = stringField(fact, "name");
            if (!id || !name)
                continue;
            ensureIndexFile(fileStats, loc.file).symbol_count += 1;
            const symbol = {
                id,
                name,
                symbol_kind: stringField(fact, "symbolKind") ?? "",
                file: loc.file,
                line: loc.line,
                column: loc.column,
                exported: boolField(fact, "exported"),
            };
            const fqName = stringField(fact, "fqName");
            if (fqName)
                symbol.fq_name = fqName;
            symbols.push(symbol);
        }
        else if (fact.kind === "csg.function") {
            const loc = locField(fact);
            if (!loc)
                continue;
            const id = stringField(fact, "id");
            const name = stringField(fact, "name");
            if (!id || !name)
                continue;
            ensureIndexFile(fileStats, loc.file).function_count += 1;
            const item = {
                id,
                name,
                symbol: stringField(fact, "symbol"),
                file: loc.file,
                line: loc.line,
                column: loc.column,
                exported: boolField(fact, "exported"),
                call_count: 0,
            };
            functions.push(item);
        }
        else if (fact.kind === "csg.call") {
            const loc = locField(fact);
            if (!loc)
                continue;
            const id = stringField(fact, "id");
            if (!id)
                continue;
            ensureIndexFile(fileStats, loc.file).call_count += 1;
            const owner = stringField(fact, "owner");
            if (owner)
                callsByOwner.set(owner, (callsByOwner.get(owner) ?? 0) + 1);
            const target = objectField(fact, "target");
            const call = {
                id,
                file: loc.file,
                line: loc.line,
                column: loc.column,
                owner,
                callee_text: stringField(fact, "calleeText") ?? "",
                callee_kind: stringField(fact, "calleeKind") ?? "",
                target_ref_id: target ? stringField(target, "id") : undefined,
                target_name: target ? stringField(target, "name") : undefined,
            };
            calls.push(call);
        }
    }
    for (const fn of functions) {
        fn.call_count = callsByOwner.get(fn.id) ?? 0;
    }
    const files = [...fileStats.values()].sort((left, right) => left.file.localeCompare(right.file));
    symbols.sort(compareIndexSymbol);
    functions.sort(compareIndexFunction);
    calls.sort(compareIndexCall);
    return {
        schema: "csg-core.index",
        standard: report.standard,
        profiles: [...report.profiles],
        profile_set_cid: report.profile_set_cid,
        facts_root: report.facts_root,
        complete: report.complete,
        counts: {
            files: files.length,
            symbols: symbols.length,
            functions: functions.length,
            calls: calls.length,
        },
        files,
        symbols,
        functions,
        calls,
    };
}
function ensureIndexFile(files, file) {
    let item = files.get(file);
    if (!item) {
        item = {
            file,
            fact_count: 0,
            symbol_count: 0,
            function_count: 0,
            call_count: 0,
        };
        files.set(file, item);
    }
    return item;
}
function factFile(fact) {
    if (fact.kind === "csg.module")
        return stringField(fact, "path");
    return locField(fact)?.file;
}
function locField(fact) {
    const loc = objectField(fact, "loc");
    if (!loc)
        return undefined;
    const file = stringField(loc, "file");
    const line = numberField(loc, "line");
    const column = numberField(loc, "column");
    const start = numberField(loc, "start");
    const end = numberField(loc, "end");
    if (!file || line === undefined || column === undefined || start === undefined || end === undefined)
        return undefined;
    return { file, line, column, start, end };
}
function objectField(value, key) {
    const field = value[key];
    return field !== null && typeof field === "object" && !Array.isArray(field) ? field : undefined;
}
function stringField(value, key) {
    const field = value[key];
    return typeof field === "string" ? field : undefined;
}
function numberField(value, key) {
    const field = value[key];
    return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}
function boolField(value, key) {
    return value[key] === true;
}
function compareIndexSymbol(left, right) {
    return left.file.localeCompare(right.file) ||
        left.name.localeCompare(right.name) ||
        left.symbol_kind.localeCompare(right.symbol_kind) ||
        left.id.localeCompare(right.id);
}
function compareIndexFunction(left, right) {
    return left.file.localeCompare(right.file) ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id);
}
function compareIndexCall(left, right) {
    return left.file.localeCompare(right.file) ||
        left.line - right.line ||
        left.column - right.column ||
        left.callee_text.localeCompare(right.callee_text) ||
        left.id.localeCompare(right.id);
}
const staticUndefined = Symbol("staticUndefined");
const allowedRuntimes = new Set(["node", "browser"]);
const defaultEntryRoots = ["src/index.ts", "src/main.ts", "src/renderer.ts"];
const arrayLiteI32Proof = "array-lite-i32-fixed";
const arrayLiteEmptyProof = "array-lite-empty";
const arrayLiteStaticLengthProof = "array-lite-static-length";
const arrayLiteConstStringLiteralProof = "array-lite-const-string-literal";
const arrayLiteJsValueScalarLiteralProof = "array-lite-jsvalue-scalar-literal";
const arrayLiteJsValueLiteralProof = "array-lite-jsvalue-literal";
const arrayLiteJsValueSpreadLiteralProof = "array-lite-jsvalue-spread-literal";
const arrayLiteJsValueLocalProof = "array-lite-jsvalue-local";
const arrayLiteI32FromLocalProof = "array-lite-i32-from-local";
const arrayLiteJsValueFromLengthProof = "array-lite-jsvalue-from-length";
const arrayLiteStringSetFromProof = "array-lite-string-set-from";
const arrayLiteStringSetValuesFromProof = "array-lite-string-set-values-from";
const arrayLiteStringMapKeysFromProof = "array-lite-string-map-keys-from";
const arrayLiteStringMapValuesFromProof = "array-lite-string-map-values-from";
const arrayLiteStringMapKeysSpreadProof = "array-lite-string-map-keys-spread";
const arrayLiteStringMapKeysDefaultSortProof = "array-lite-string-map-keys-default-sort";
const arrayLiteDomCollectionFromProof = "array-lite-dom-collection-from";
const arrayLiteUint8ArrayFromProof = "array-lite-uint8array-from";
const arrayLiteUint8ArrayHexMapFromProof = "array-lite-uint8array-hex-map-from";
const arrayLiteI32IsArrayLocalProof = "array-lite-i32-isarray-local";
const arrayLiteI32PushLocalProof = "array-lite-i32-push-local";
const arrayLiteJsValuePushLocalProof = "array-lite-jsvalue-push-local";
const arrayLiteI32MapLocalProof = "array-lite-i32-map-local";
const arrayLiteI32FilterLengthProof = "array-lite-i32-filter-length";
const arrayLiteI32IncludesProof = "array-lite-i32-includes";
const arrayLiteJsValueIncludesProof = "array-lite-jsvalue-includes-local";
const arrayLiteConstStringIncludesProof = "array-lite-const-string-includes";
const arrayLiteConstStringSomeEndsWithProof = "array-lite-const-string-some-endswith";
const arrayLiteStringSomeItemStringMethodProof = "array-lite-string-some-item-string-method";
const arrayLiteConstStringSomeHaystackStringMethodProof = "array-lite-const-string-some-haystack-string-method";
const arrayLiteJsValuePredicateTruthyProof = "array-lite-jsvalue-predicate-truthy";
const arrayLiteJsValueCallbackPredicateProof = "array-lite-jsvalue-callback-predicate";
const arrayLiteJsValueObjectSomeScalarPropertyEqualsProof = "array-lite-jsvalue-object-some-scalar-property-equals";
const arrayLiteJsValueObjectSomeScalarPropertyConjunctionEqualsProof = "array-lite-jsvalue-object-some-scalar-property-conjunction-equals";
const arrayLiteI32IndexOfLocalProof = "array-lite-i32-indexof-local";
const arrayLiteStringIndexOfProof = "array-lite-string-indexof";
const arrayLiteI32PredicateProof = "array-lite-i32-predicate";
const arrayLiteI32AtProof = "array-lite-i32-at";
const arrayLiteI32FindIndexLocalProof = "array-lite-i32-findindex-local";
const arrayLiteJsValueObjectFindIndexScalarPropertyEqualsProof = "array-lite-jsvalue-object-findindex-scalar-property-equals";
const arrayLiteJsValueObjectFindIndexScalarPropertyConjunctionEqualsProof = "array-lite-jsvalue-object-findindex-scalar-property-conjunction-equals";
const arrayLiteJsValueObjectFindIndexScalarPropertyDisjunctionEqualsProof = "array-lite-jsvalue-object-findindex-scalar-property-disjunction-equals";
const arrayLiteI32SliceLocalProof = "array-lite-i32-slice-local";
const arrayLiteI32ConcatLocalProof = "array-lite-i32-concat-local";
const arrayLiteI32ReverseLocalProof = "array-lite-i32-reverse-local";
const arrayLiteI32SortLocalProof = "array-lite-i32-sort-local";
const arrayLiteI32InlineDiffSortProof = "array-lite-i32-inline-diff-sort";
const arrayLiteI32InlineDiffDescSortProof = "array-lite-i32-inline-diff-desc-sort";
const arrayLiteObjectI32KeyInlineDiffSortProof = "array-lite-object-i32-key-inline-diff-sort";
const arrayLiteObjectI32KeyInlineDiffDescSortProof = "array-lite-object-i32-key-inline-diff-desc-sort";
const arrayLiteObjectOptionalI32KeyNullishZeroInlineDiffSortProof = "array-lite-object-optional-i32-key-nullish-zero-inline-diff-sort";
const arrayLiteObjectOptionalI32KeyNullishZeroInlineDiffDescSortProof = "array-lite-object-optional-i32-key-nullish-zero-inline-diff-desc-sort";
const arrayLiteObjectOptionalI32KeyLogicalOrZeroInlineDiffSortProof = "array-lite-object-optional-i32-key-logical-or-zero-inline-diff-sort";
const arrayLiteObjectOptionalI32KeyLogicalOrZeroInlineDiffDescSortProof = "array-lite-object-optional-i32-key-logical-or-zero-inline-diff-desc-sort";
const arrayLiteArrayI32IndexInlineDiffSortProof = "array-lite-array-i32-index-inline-diff-sort";
const arrayLiteArrayI32IndexInlineDiffDescSortProof = "array-lite-array-i32-index-inline-diff-desc-sort";
const arrayLiteArrayOptionalI32IndexNullishZeroInlineDiffSortProof = "array-lite-array-optional-i32-index-nullish-zero-inline-diff-sort";
const arrayLiteArrayOptionalI32IndexNullishZeroInlineDiffDescSortProof = "array-lite-array-optional-i32-index-nullish-zero-inline-diff-desc-sort";
const arrayLiteArrayOptionalI32IndexLogicalOrZeroInlineDiffSortProof = "array-lite-array-optional-i32-index-logical-or-zero-inline-diff-sort";
const arrayLiteArrayOptionalI32IndexLogicalOrZeroInlineDiffDescSortProof = "array-lite-array-optional-i32-index-logical-or-zero-inline-diff-desc-sort";
const arrayLiteStringDefaultSortProof = "array-lite-string-default-sort";
const arrayLiteObjectKeysDefaultSortProof = "array-lite-object-keys-default-sort";
const arrayLiteI32FillLocalProof = "array-lite-i32-fill-local";
const arrayLiteI32ReduceProof = "array-lite-i32-reduce";
const arrayLiteI32PopLocalProof = "array-lite-i32-pop-local";
const arrayLiteI32ShiftLocalProof = "array-lite-i32-shift-local";
const arrayLiteI32UnshiftLocalProof = "array-lite-i32-unshift-local";
const arrayLiteI32FreezeLocalProof = "array-lite-i32-freeze-local";
const arrayLiteJsValueFreezeFreshProof = "array-lite-jsvalue-freeze-fresh";
const arrayLiteI32IsFrozenLocalProof = "array-lite-i32-isfrozen-local";
const arrayLiteI32ForOfLocalProof = "array-lite-i32-for-of-local";
const arrayLiteI32LocalProof = "array-lite-i32-local";
const objectLiteFreezeLocalProof = "object-lite-freeze-local";
const objectJsValueFreezeFreshProof = "object-jsvalue-freeze-fresh";
const objectLiteIsFrozenLocalProof = "object-lite-isfrozen-local";
const objectLiteValuesLocalProof = "object-lite-values-local";
const objectLiteKeysLocalProof = "object-lite-keys-local";
const objectJsValueKeysLengthProof = "object-jsvalue-keys-length";
const objectJsValueKeysArrayProof = "object-jsvalue-keys-array";
const objectJsValueValuesArrayProof = "object-jsvalue-values-array";
const objectJsValueEntriesArrayProof = "object-jsvalue-entries-array";
const objectLiteKeyEntryLengthProof = "object-lite-key-entry-length";
const objectLiteAssignLocalProof = "object-lite-assign-local";
const objectCompoundPropertyWriteProof = "object-compound-property-write";
const objectComputedPropertyNameProof = "object-computed-property-name";
const stringAsciiLiteralProof = "string-ascii-literal";
const stringScalarLengthProof = "string-scalar-length";
const stringRuntimeLengthProof = "string-runtime-length";
const collectionConstructorEmptyProof = "collection-constructor-empty";
const collectionConstructorStringArrayProof = "collection-constructor-string-array";
const collectionConstructorStringI32EntryArrayProof = "collection-constructor-string-i32-entry-array";
const collectionSetStringValuesIteratorProof = "collection-set-string-values-iterator";
const collectionMapStringKeysIteratorProof = "collection-map-string-keys-iterator";
const collectionMapStringValuesIteratorProof = "collection-map-string-values-iterator";
const jsObjectDefaultPropertyCapacity = 32;
const uint8ArrayConstructorLengthProof = "uint8array-constructor-length";
const uint8ArrayConstructorByteArrayProof = "uint8array-constructor-byte-array";
const uint8ArrayConstructorBufferViewProof = "uint8array-constructor-buffer-view";
const namespaceReferenceProof = "namespace-reference";
const undefinedI32Proof = "undefined-i32";
const mathI32Proof = "math-i32";
const numberPredicateI32Proof = "number-predicate-i32";
const numberConvertI32BoolProof = "number-convert-i32-bool";
const booleanI32BoolProof = "boolean-i32-bool";
const stringConvertScalarProof = "string-convert-scalar";
const stringTypeMethodProof = "string-type-method";
const stringRegexLiteralReplaceProof = "string-regex-literal-replace";
const stringRegexLiteralAffixReplaceProof = "string-regex-literal-affix-replace";
const stringRegexAsciiClassReplaceProof = "string-regex-ascii-class-replace";
const stringRegexLineSplitProof = "string-regex-line-split";
const stringRegexAsciiClassSplitProof = "string-regex-ascii-class-split";
const dateNowMsProof = "date-now-ms";
const dateConstructorNowMsProof = "date-constructor-now-ms";
const dateConstructorMsProof = "date-constructor-ms";
const dateConstructorStringProof = "date-constructor-string";
const dateConstructorCopyProof = "date-constructor-copy";
const dateConstructorAnyProof = "date-constructor-any";
const dateConstructorComponentsProof = "date-constructor-components";
const promiseAwaitAsyncSyncI32Proof = "promise-await-async-sync-i32";
const generatorIteratorStateMachineProof = "generator-iterator-state-machine";
const errorConstructorMessageStringProof = "error-constructor-message-string";
const errorInstanceOfProof = "error-instanceof";
const reactUseStateProof = "react-use-state-hook";
const reactUseRefProof = "react-use-ref-hook";
const reactUseCallbackProof = "react-use-callback-hook";
const reactUseMemoProof = "react-use-memo-hook";
const reactUseEffectProof = "react-use-effect-noop-hook";
const reactUseEffectCfgProof = "react-use-effect-cfg-hook";
const reactHostJsxProof = "react-host-jsx-dom-template";
const reactComponentJsxProof = "react-component-jsx";
const reactModuleImportPureRuntimeProof = "react-module-import-pure-runtime";
const browserDocumentGlobalProof = "browser-document-global";
const browserDocumentBodyProof = "browser-document-body";
const browserDocumentHeadProof = "browser-document-head";
const browserDocumentElementProof = "browser-document-element";
const browserDocumentHiddenProof = "browser-document-hidden";
const browserDocumentVisibilityStateProof = "browser-document-visibility-state";
const browserDocumentDatasetProof = "browser-document-dataset";
const browserDocumentDatasetStringWriteProof = "browser-document-dataset-string-write";
const browserInlineStyleAccessProof = "browser-inline-style-access";
const browserInlineStylePropertyReadProof = "browser-inline-style-property-read";
const browserInlineStyleSetPropertyProof = "browser-inline-style-set-property";
const browserInlineStyleObjectAssignProof = "browser-inline-style-object-assign";
const browserDocumentCreateElementProof = "browser-document-create-element-literal";
const browserTextEncoderConstructorProof = "browser-text-encoder-constructor";
const browserTextDecoderConstructorProof = "browser-text-decoder-constructor";
const browserTextEncoderEncodeProof = "browser-text-encoder-encode-utf8";
const browserTextDecoderDecodeProof = "browser-text-decoder-decode-utf8";
const browserEventConstructorProof = "browser-event-constructor-literal";
const browserEventDispatchProof = "browser-event-dispatch-event-object";
const browserEventAddEventListenerProof = "browser-event-add-listener";
const browserEventRemoveEventListenerProof = "browser-event-remove-listener";
const browserEventPreventDefaultProof = "browser-event-prevent-default";
const browserEventStopPropagationProof = "browser-event-stop-propagation";
const browserElementSetAttributeProof = "browser-element-set-attribute";
const browserElementGetAttributeProof = "browser-element-get-attribute";
const browserElementHasAttributeProof = "browser-element-has-attribute";
const browserElementRemoveAttributeProof = "browser-element-remove-attribute";
const browserElementClassListAccessProof = "browser-element-classlist-access";
const browserElementClassListCallProof = "browser-element-classlist-call";
const browserElementAppendProof = "browser-element-append";
const browserElementAppendChildProof = "browser-element-append-child";
const browserElementRemoveProof = "browser-element-remove";
const browserElementContainsProof = "browser-element-contains";
const browserDocumentQuerySelectorProof = "browser-document-query-selector";
const browserDocumentQuerySelectorAllProof = "browser-document-query-selector-all";
const browserDocumentGetElementByIdProof = "browser-document-get-element-by-id";
const browserElementMatchesProof = "browser-element-matches";
const browserElementClosestProof = "browser-element-closest";
const browserLocalStorageGlobalProof = "browser-local-storage-global";
const browserLocalStorageGetItemProof = "browser-local-storage-getitem";
const browserLocalStorageSetItemProof = "browser-local-storage-setitem";
const browserLocalStorageRemoveItemProof = "browser-local-storage-removeitem";
const browserLocalStorageClearProof = "browser-local-storage-clear";
const browserWindowGlobalProof = "browser-window-global";
const browserWindowLocalStorageProof = "browser-window-local-storage";
const browserWindowLocationProof = "browser-window-location";
const browserWindowLocationReadonlyScalarProof = "browser-window-location-readonly-scalar";
const browserWindowSizeProof = "browser-window-size-constant";
const browserWindowScrollProof = "browser-window-scroll-readonly-scalar";
const browserWindowCancelAnimationFrameProof = "browser-window-cancel-animation-frame";
const browserWindowBase64CodecProof = "browser-window-base64-codec";
const browserWindowMatchMediaMatchesProof = "browser-window-matchmedia-matches";
const browserWindowMatchMediaListProof = "browser-window-matchmedia-list";
const browserMediaQueryListListenerProof = "browser-mediaquery-list-listener";
const browserIntersectionObserverConstructorProof = "browser-intersection-observer-constructor";
const browserIntersectionObserverObserveProof = "browser-intersection-observer-observe";
const browserIntersectionObserverDisconnectProof = "browser-intersection-observer-disconnect";
const browserNavigatorGlobalProof = "browser-navigator-global";
const browserNavigatorLanguageProof = "browser-navigator-language";
const browserEventReadonlyScalarProof = "browser-event-readonly-scalar";
const browserMouseEventConstructorProof = "browser-mouseevent-constructor-literal";
const browserKeyboardEventConstructorProof = "browser-keyboardevent-constructor-literal";
const browserCustomEventConstructorProof = "browser-customevent-constructor-literal";
const browserUrlConstructorProof = "browser-url-constructor-string";
const browserUrlSearchParamsConstructorProof = "browser-urlsearchparams-constructor-lite";
const browserUrlToStringProof = "browser-url-tostring";
const browserUrlSearchParamsGetProof = "browser-urlsearchparams-get";
const browserUrlSearchParamsSetProof = "browser-urlsearchparams-set";
const browserUrlSearchParamsDeleteProof = "browser-urlsearchparams-delete";
const browserUrlSearchParamsToStringProof = "browser-urlsearchparams-tostring";
const browserHeadersConstructorEmptyProof = "browser-headers-constructor-empty";
const browserHeadersConstructorStaticObjectProof = "browser-headers-constructor-static-object";
const browserHeadersConstructorInitProof = "browser-headers-constructor-init";
const browserHeadersHasProof = "browser-headers-has";
const browserHeadersForEachProof = "browser-headers-for-each";
const browserResponseConstructorBodyStatusProof = "browser-response-constructor-body-status";
const browserResponseConstructorInitProof = "browser-response-constructor-init";
const browserResponseJsonProof = "browser-response-json";
const browserResponseBlobProof = "browser-response-blob";
const browserRequestConstructorProof = "browser-request-constructor";
const browserRequestGlobalProof = "browser-request-global";
const browserFormDataConstructorEmptyProof = "browser-formdata-constructor-empty";
const browserXhrConstructorProof = "browser-xhr-constructor";
const browserXhrSetRequestHeaderProof = "browser-xhr-set-request-header";
const browserXhrGetAllResponseHeadersProof = "browser-xhr-get-all-response-headers";
const browserBlobConstructorNameProof = "browser-blob-constructor-name";
const browserBlobPrototypeProof = "browser-blob-prototype";
const browserBlobPrototypeArrayBufferProof = "browser-blob-prototype-arraybuffer";
const browserWindowLocationReadonlyScalarPropertyNames = new Set([
    "href",
    "pathname",
    "search",
]);
const browserEventReadonlyScalarPropertyNames = new Set([
    "button",
    "key",
    "type",
]);
const browserEventInitOptionNames = new Set([
    "bubbles",
    "cancelable",
    "composed",
    "clientX",
    "clientY",
    "screenX",
    "screenY",
    "button",
    "buttons",
    "detail",
    "ctrlKey",
    "shiftKey",
    "altKey",
    "metaKey",
]);
const browserKeyboardEventInitStringOptionNames = new Set([
    "code",
    "key",
]);
const browserKeyboardEventInitBoolOptionNames = new Set([
    "altKey",
    "ctrlKey",
    "metaKey",
    "shiftKey",
]);
const arrayLiteReadOnlyProofReceiverMethods = new Set([
    "includes",
    "indexOf",
    "lastIndexOf",
    "some",
    "every",
    "at",
    "findIndex",
    "slice",
    "concat",
    "reduce",
]);
const arrayLiteMutationProofReceiverMethods = new Set([
    ...arrayLiteReadOnlyProofReceiverMethods,
    "push",
    "pop",
    "shift",
    "unshift",
    "fill",
]);
const arrayObjectLiteReadOnlyArgumentCalls = new Set([
    "Array.from",
    "Array.isArray",
    "Object.freeze",
    "Object.entries",
    "Object.isFrozen",
    "Object.keys",
    "Object.values",
]);
const i32MathCallNames = new Set(["Math.abs", "Math.ceil", "Math.floor", "Math.max", "Math.min", "Math.round", "Math.trunc"]);
const i32NumberPredicateCallNames = new Set(["Number.isFinite", "Number.isInteger", "Number.isSafeInteger"]);
const numberConvertCallNames = new Set(["Number"]);
const booleanCallNames = new Set(["Boolean"]);
const closedStringLiteralCallNames = new Set([
    "String.charAt",
    "String.charCodeAt",
    "String.endsWith",
    "String.includes",
    "String.indexOf",
    "String.lastIndexOf",
    "String.match",
    "String.padEnd",
    "String.padStart",
    "String.repeat",
    "String.replace",
    "String.search",
    "String.slice",
    "String.split",
    "String.startsWith",
    "String.substring",
    "String.toLowerCase",
    "String.toString",
    "String.toUpperCase",
    "String.trim",
]);
const nodeBuiltins = new Set([
    "assert",
    "buffer",
    "child_process",
    "crypto",
    "events",
    "fs",
    "http",
    "https",
    "net",
    "os",
    "path",
    "process",
    "stream",
    "timers",
    "url",
    "util",
    "worker_threads",
    "zlib",
]);
const browserGlobals = new Set([
    "AbortController",
    "Blob",
    "CustomEvent",
    "Document",
    "Element",
    "Event",
    "EventTarget",
    "File",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "IntersectionObserver",
    "KeyboardEvent",
    "MouseEvent",
    "MutationObserver",
    "Node",
    "Request",
    "Response",
    "URL",
    "WebSocket",
    "Window",
    "document",
    "fetch",
    "history",
    "localStorage",
    "location",
    "navigator",
    "sessionStorage",
    "window",
]);
const jsCoreGlobals = new Set([
    "Array",
    "Boolean",
    "Date",
    "Error",
    "JSON",
    "Map",
    "Math",
    "Number",
    "Object",
    "Promise",
    "Reflect",
    "RegExp",
    "Set",
    "String",
    "Symbol",
    "WeakMap",
    "WeakSet",
    "console",
    "parseInt",
    "setInterval",
    "setTimeout",
    "undefined",
]);
export function emitCsgCoreFromTs(options) {
    const runtimes = normalizeRuntime(options.runtime);
    const includeDebugMaps = options.includeDebugMaps !== false;
    const build = buildProgram(options);
    const diagnostics = [
        ...validateRuntimeOptions(options.runtime),
        ...build.configDiagnostics.map((diag) => formatDiagnostic(build.cwd, diag)),
        ...build.program.getSyntacticDiagnostics().filter((diag) => diag.category === ts.DiagnosticCategory.Error).map((diag) => formatDiagnostic(build.cwd, diag)),
        ...build.program.getGlobalDiagnostics().filter((diag) => diag.category === ts.DiagnosticCategory.Error).map((diag) => formatDiagnostic(build.cwd, diag)),
    ];
    if (diagnostics.length > 0) {
        const report = emptyReport(build, runtimes, diagnostics);
        return { facts: [], diagnostics, report, text: "" };
    }
    const checker = build.program.getTypeChecker();
    const sourceFiles = build.program
        .getSourceFiles()
        .filter((sourceFile) => isProjectSourceFile(build.cwd, sourceFile))
        .sort((left, right) => relPath(build.cwd, left.fileName).localeCompare(relPath(build.cwd, right.fileName)));
    const facts = [];
    const unsupportedById = new Map();
    const runtimeById = new Map();
    const externalById = new Map();
    const dataById = new Map();
    const typeById = new Map();
    const functionStack = [];
    const functionStaticEnvStack = [];
    const emittedInlineHandlerArrows = new Set();
    const jsxFactByNode = new Map();
    const pendingReactUseEffects = [];
    const typeTextCache = new WeakMap();
    const sourceFileRelPathCache = new WeakMap();
    const nodeLocCache = new WeakMap();
    emitFact({
        kind: "csg.core.schema",
        id: stableId("csg.core.schema", "typescript"),
        language: "typescript",
        schema: CsgCoreSchema,
        features: CsgCoreFeatures,
    });
    emitFact({
        kind: "csg.project",
        id: stableId("csg.project", build.cwd, String(sourceFiles.length)),
        root: toPosix(path.resolve(build.cwd)),
        projectFile: build.projectFile ? relPath(build.cwd, build.projectFile) : undefined,
        sourceFileCount: sourceFiles.length,
        runtimes,
        compilerOptions: compilerOptionsFact(build.compilerOptions),
    });
    for (const sourceFile of sourceFiles) {
        emitModule(sourceFile);
        if (sourceFileHasTsNoCheck(sourceFile)) {
            emitSourceFileDirective(sourceFile, "ts-nocheck");
        }
    }
    for (const sourceFile of sourceFiles) {
        visit(sourceFile, sourceFile);
    }
    finalizeReactUseEffectProofs();
    for (const fact of [...typeById.values()].sort(compareFactId)) {
        facts.push(fact);
    }
    for (const fact of [...dataById.values()].sort(compareFactId)) {
        facts.push(fact);
    }
    const runtimeRequirements = [...runtimeById.values()].sort(compareById);
    const externalSymbols = [...externalById.values()].sort(compareById);
    const unsupported = [...unsupportedById.values()].sort(compareIssue);
    for (const item of runtimeRequirements) {
        facts.push({
            kind: "csg.runtime_requirement",
            id: item.id,
            name: item.name,
            runtime: item.runtime,
            requirementKind: item.kind,
            source: item.source,
            ...(item.proofs && item.proofs.length > 0 ? { proofs: item.proofs } : {}),
            ...(item.loc ? { loc: item.loc } : {}),
            ...(item.owner ? { owner: item.owner } : {}),
        });
    }
    for (const item of externalSymbols) {
        facts.push({
            kind: "csg.external_symbol",
            id: item.id,
            name: item.name,
            runtime: item.runtime,
            source: item.source,
        });
    }
    for (const item of unsupported) {
        facts.push({
            kind: "csg.unsupported",
            id: item.id,
            code: item.code,
            message: item.message,
            ...(item.loc ? { loc: item.loc } : {}),
            ...(item.owner ? { owner: item.owner } : {}),
        });
    }
    const counts = countFacts(facts, sourceFiles.length);
    const runtimeClosure = buildRuntimeClosure(runtimeRequirements, externalSymbols);
    const validation = validateCsgFacts(facts, "sandbox");
    if (!validation.valid && validation.errors.length === 0) {
        throw new Error("pure Cheng CSG validation failed without diagnostics");
    }
    for (const error of validation.errors) {
        diagnostics.push(`csg_core validation: ${error}`);
    }
    const factsRoot = validation.factsRoot;
    const report = {
        schema: CsgCoreReportSchema,
        standard: CsgCoreStandard,
        features: CsgCoreFeatures,
        complete: validation.valid &&
            validation.complete &&
            unsupported.length === 0 &&
            runtimeClosure.complete,
        profiles: [...validation.profiles],
        profile_set_cid: validation.profile_set_cid,
        factsRoot,
        facts_root: factsRoot,
        projectRoot: toPosix(path.resolve(build.cwd)),
        projectFile: build.projectFile ? relPath(build.cwd, build.projectFile) : undefined,
        runtimes,
        entryRoots: entryRoots(build.cwd, options.entryRoots, sourceFiles),
        counts,
        unsupported,
        runtimeRequirements,
        externalSymbols,
        runtimeClosure,
        diagnostics,
    };
    const text = options.emitText === false ? "" : facts.map((fact) => stableJson(fact, options.pretty)).join("\n") + "\n";
    return { facts, diagnostics, report, text };
    function visit(node, sourceFile) {
        inspectUnsupported(node, sourceFile);
        if (ts.isImportDeclaration(node)) {
            emitImport(node, sourceFile);
        }
        else if (ts.isExportDeclaration(node)) {
            emitExport(node, sourceFile);
        }
        else if (ts.isExportAssignment(node)) {
            emitExportAssignment(node, sourceFile);
        }
        else if (ts.isVariableDeclaration(node)) {
            emitVariable(node, sourceFile);
        }
        else if (ts.isClassDeclaration(node)) {
            emitClass(node, sourceFile);
        }
        else if (ts.isInterfaceDeclaration(node)) {
            emitSymbol("interface", node, sourceFile, node.name.text);
            emitTypeDecl(node, sourceFile, node.name.text, "interface");
            return;
        }
        else if (ts.isTypeAliasDeclaration(node)) {
            emitSymbol("type_alias", node, sourceFile, node.name.text);
            emitTypeDecl(node, sourceFile, node.name.text, "type_alias");
            return;
        }
        else if (ts.isEnumDeclaration(node)) {
            emitSymbol("enum", node, sourceFile, node.name.text);
        }
        else if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
            emitJsx(node, sourceFile);
        }
        if (isFunctionLikeWithBody(node)) {
            emitFunction(node, sourceFile);
            return;
        }
        if (ts.isCallExpression(node)) {
            emitCall(node, sourceFile);
        }
        else if (ts.isNewExpression(node)) {
            emitNew(node, sourceFile);
        }
        else if (ts.isPropertyAccessExpression(node)) {
            inspectRuntimeExpression(node, sourceFile);
        }
        else if (ts.isIdentifier(node)) {
            inspectRuntimeIdentifier(node, sourceFile);
        }
        ts.forEachChild(node, (child) => visit(child, sourceFile));
    }
    function emitModule(sourceFile) {
        emitFact({
            kind: "csg.module",
            id: fileId(sourceFile),
            path: sourceFileRelPath(sourceFile),
            sha256: sha256(sourceFile.text),
            isDeclarationFile: sourceFile.isDeclarationFile,
        });
    }
    function emitSourceFileDirective(sourceFile, directive) {
        addDataFact(sourceFile, sourceFile, "source_file_directive", {
            sourceFile: sourceFileRelPath(sourceFile),
            directive,
            effect: directive === "ts-nocheck" ? "typescript_diagnostics_suppressed" : "unknown",
        });
    }
    function emitImport(node, sourceFile) {
        const moduleName = stringModuleSpecifier(node.moduleSpecifier);
        if (!moduleName)
            return;
        const classification = classifyModuleSpecifier(moduleName);
        const clause = node.importClause;
        const namedBindings = clause?.namedBindings;
        emitFact({
            kind: "csg.import",
            id: nodeId("csg.import", node, sourceFile, moduleName),
            loc: locFor(sourceFile, node),
            module: moduleName,
            classification: classification.source,
            runtime: classification.runtime,
            typeOnly: clause?.isTypeOnly === true,
            defaultName: clause?.name?.text,
            namespaceName: namedBindings && ts.isNamespaceImport(namedBindings) ? namedBindings.name.text : undefined,
            named: namedBindings && ts.isNamedImports(namedBindings)
                ? namedBindings.elements.map((item) => ({
                    name: item.name.text,
                    propertyName: item.propertyName?.text,
                    typeOnly: item.isTypeOnly,
                }))
                : [],
        });
        if (classification.source !== "project" && !importDeclarationIsTypeOnly(node)) {
            addRuntimeRequirement(sourceFile, node, "module_import", moduleName, classification, currentOwner(), moduleImportProofs(moduleName, classification));
            addExternalSymbol(moduleName, classification);
        }
    }
    function emitExport(node, sourceFile) {
        const moduleName = stringModuleSpecifier(node.moduleSpecifier);
        emitFact({
            kind: "csg.export",
            id: nodeId("csg.export", node, sourceFile, moduleName ?? "local"),
            loc: locFor(sourceFile, node),
            module: moduleName,
            typeOnly: node.isTypeOnly,
            named: node.exportClause && ts.isNamedExports(node.exportClause)
                ? node.exportClause.elements.map((item) => ({
                    name: item.name.text,
                    propertyName: item.propertyName?.text,
                    typeOnly: item.isTypeOnly,
                }))
                : [],
            namespace: node.exportClause && ts.isNamespaceExport(node.exportClause) ? node.exportClause.name.text : undefined,
        });
        if (moduleName) {
            const classification = classifyModuleSpecifier(moduleName);
            if (classification.source !== "project" && !exportDeclarationIsTypeOnly(node)) {
                addRuntimeRequirement(sourceFile, node, "module_export", moduleName, classification, currentOwner());
                addExternalSymbol(moduleName, classification);
            }
        }
    }
    function emitExportAssignment(node, sourceFile) {
        emitFact({
            kind: "csg.export",
            id: nodeId("csg.export", node, sourceFile, "assignment"),
            loc: locFor(sourceFile, node),
            exportEquals: node.isExportEquals,
            expressionKind: syntaxKindName(node.expression.kind),
            expressionText: node.expression.getText(sourceFile),
        });
    }
    function importDeclarationIsTypeOnly(node) {
        const clause = node.importClause;
        if (!clause)
            return false;
        if (clause.isTypeOnly)
            return true;
        if (clause.name)
            return false;
        const namedBindings = clause.namedBindings;
        if (!namedBindings)
            return false;
        if (ts.isNamespaceImport(namedBindings))
            return false;
        return namedBindings.elements.length > 0 && namedBindings.elements.every((item) => item.isTypeOnly);
    }
    function exportDeclarationIsTypeOnly(node) {
        if (node.isTypeOnly)
            return true;
        const clause = node.exportClause;
        if (!clause || !ts.isNamedExports(clause))
            return false;
        return clause.elements.length > 0 && clause.elements.every((item) => item.isTypeOnly);
    }
    // Structural type declaration fact: field names + type texts, so downstream
    // consumers (the React→Cheng transpiler's struct generator) can derive Cheng
    // record types without re-reading TS sources. Interfaces emit their member
    // signatures; type aliases of object literals emit the resolved properties,
    // other aliases (unions etc.) carry only the alias target text.
    function emitTypeDecl(node, sourceFile, name, declKind) {
        const members = [];
        let aliasTarget = "";
        if (ts.isInterfaceDeclaration(node)) {
            for (const member of node.members) {
                if (!ts.isPropertySignature(member) || !member.name)
                    continue;
                const memberName = ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : member.name.getText(sourceFile);
                members.push({
                    name: memberName,
                    optional: member.questionToken !== undefined,
                    type: typeText(checker.getTypeAtLocation(member)),
                });
            }
        }
        else {
            aliasTarget = normalizeCheckerText(node.type.getText(sourceFile));
            if (ts.isTypeLiteralNode(node.type)) {
                for (const member of node.type.members) {
                    if (!ts.isPropertySignature(member) || !member.name)
                        continue;
                    const memberName = ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : member.name.getText(sourceFile);
                    members.push({
                        name: memberName,
                        optional: member.questionToken !== undefined,
                        type: typeText(checker.getTypeAtLocation(member)),
                    });
                }
            }
        }
        emitFact({
            kind: "csg.type_decl",
            id: nodeId("csg.type_decl", node, sourceFile, name),
            loc: locFor(sourceFile, node),
            name,
            declKind,
            exported: hasModifier(node, ts.SyntaxKind.ExportKeyword),
            aliasTarget,
            members,
        });
    }
    function emitSymbol(symbolKind, node, sourceFile, name) {
        const symbol = symbolForDeclaration(node);
        const symbolId = stableId("csg.symbol", symbolKind, sourceFileRelPath(sourceFile), name, String(node.pos), String(node.end));
        emitFact({
            kind: "csg.symbol",
            id: symbolId,
            loc: locFor(sourceFile, node),
            name,
            symbolKind,
            fqName: symbol ? normalizeCheckerText(checker.getFullyQualifiedName(symbol)) : name,
            flags: symbol ? symbolFlags(symbol.flags) : [],
            exported: hasModifier(node, ts.SyntaxKind.ExportKeyword),
        });
        return symbolId;
    }
    function emitClass(node, sourceFile) {
        const name = node.name?.text ?? "<anonymous>";
        const symbolId = emitSymbol("class", node, sourceFile, name);
        emitFact({
            kind: "csg.class",
            id: nodeId("csg.class", node, sourceFile, name),
            loc: locFor(sourceFile, node),
            name,
            symbol: symbolId,
            exported: hasModifier(node, ts.SyntaxKind.ExportKeyword),
            abstract: hasModifier(node, ts.SyntaxKind.AbstractKeyword),
            typeParameters: typeParameterTexts(node.typeParameters),
            heritageCount: node.heritageClauses?.reduce((sum, clause) => sum + clause.types.length, 0) ?? 0,
        });
        for (const clause of node.heritageClauses ?? []) {
            for (const item of clause.types) {
                const target = checker.getSymbolAtLocation(item.expression);
                emitFact({
                    kind: "csg.class_heritage",
                    id: nodeId("csg.class_heritage", item, sourceFile, `${name}:${item.expression.getText(sourceFile)}`),
                    loc: locFor(sourceFile, item),
                    class: nodeId("csg.class", node, sourceFile, name),
                    heritageKind: syntaxKindName(clause.token),
                    expression: item.expression.getText(sourceFile),
                    target: symbolFact(target, sourceFile),
                    typeArguments: item.typeArguments?.map((typeArg) => typeArg.getText(sourceFile)) ?? [],
                });
                addRuntimeRequirement(sourceFile, item, "class_heritage", `${name}:${item.expression.getText(sourceFile)}`, { runtime: "js-core", source: "ecmascript_class" }, currentOwner());
            }
        }
    }
    function emitJsx(node, sourceFile, includeDescendantElements = false) {
        const tagName = jsxTagName(node, sourceFile);
        const props = jsxProps(node, sourceFile);
        stampInlineHandlerFns(node, sourceFile, props);
        const jsxFact = {
            kind: "csg.jsx",
            id: nodeId("csg.jsx", node, sourceFile, tagName),
            loc: locFor(sourceFile, node),
            owner: currentOwner(),
            tagName,
            jsxKind: syntaxKindName(node.kind),
            attributeCount: jsxAttributeCount(node),
            childCount: ts.isJsxElement(node) || ts.isJsxFragment(node) ? node.children.length : 0,
            props,
            children: jsxChildren(node, sourceFile, (child) => nodeId("csg.jsx", child, sourceFile, jsxTagName(child, sourceFile))),
        };
        emitFact(jsxFact);
        // Exact-identity link for the materializer's render-root pairing: the function-body op walk
        // emits the sibling csg.op "jsx" op right after this and stamps it back (see the emitOp jsx
        // branch) — no loc/rank heuristics needed downstream.
        jsxFactByNode.set(node, jsxFact);
        addRuntimeRequirement(sourceFile, node, "jsx", tagName || "fragment", { runtime: "js-core", source: "jsx_runtime" }, currentOwner(), reactHostJsxProofs(node, tagName, sourceFile));
        if (includeDescendantElements && (ts.isJsxElement(node) || ts.isJsxFragment(node))) {
            for (const child of node.children) {
                if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
                    emitJsx(child, sourceFile, true);
                }
            }
        }
    }
    // Deterministic inline-arrow handler linkage: an event-handler JSX attribute whose value is an
    // inline arrow/function-expression (`onClick={() => setX(v)}`) is NOT reached by the generic
    // visitor (ts.forEachChild does not descend into JSX attribute initializers), so its body is
    // never emitted as a csg.function — the materialized event_handler scene fact carries only the
    // handler TEXT with no join key to a function body. Emit the arrow as a real csg.function here
    // (full body ops, same as any other function) and stamp its stable id onto the prop, so the
    // downstream CHT resolves handler->fid by exact identity and transpiles the real arrow body.
    function stampInlineHandlerFns(node, sourceFile, props) {
        // Shared per-attribute handler-arrow emission: collects inline arrow candidates through
        // wrapper shapes (`Fp(e.onX, e => {...})`, `q6e(...)`, ternaries), emits the single
        // unambiguous arrow as a real csg.function (rolling back fully on any new unsupported fact),
        // and returns its stable id (undefined = stay honestly unlinked).
        const emitHandlerArrow = (attribute) => {
            if (!attribute.initializer || !ts.isJsxExpression(attribute.initializer))
                return undefined;
            const expression = attribute.initializer.expression;
            if (!expression)
                return undefined;
            // Wrapper-transparent handler discovery: radix-style composed handlers hide the real arrow
            // inside call arguments (`onMouseDown={Fp(e.onMouseDown, e => {...})}`, possibly nested one
            // more level like `Fp(e.onPointerMove, q6e(t => {...}))`), and conditional props select
            // between alternatives (`r ? e.onContextMenu : Fp(..., e => {...})`). Walk those shapes and
            // collect every inline arrow candidate; a bare arrow initializer is the length-1 case.
            const arrows = [];
            const collectArrows = (expr) => {
                if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
                    arrows.push(expr);
                    return;
                }
                if (ts.isParenthesizedExpression(expr)) {
                    collectArrows(expr.expression);
                    return;
                }
                if (ts.isConditionalExpression(expr)) {
                    collectArrows(expr.whenTrue);
                    collectArrows(expr.whenFalse);
                    return;
                }
                if (ts.isCallExpression(expr)) {
                    for (const arg of expr.arguments)
                        collectArrows(arg);
                }
            };
            collectArrows(expression);
            const uniqueArrows = [...new Set(arrows)];
            // 0 candidates: nothing to link. >1: the composition order of two real arrows is ambiguous
            // from facts alone — stay honestly unlinked rather than stamping a possibly-wrong body.
            if (uniqueArrows.length !== 1)
                return undefined;
            const arrow = uniqueArrows[0];
            if (emittedInlineHandlerArrows.has(arrow))
                return undefined; // emitJsx may run twice on the same node
            emittedInlineHandlerArrows.add(arrow);
            // Emit the arrow body, but if extracting it surfaces ANY unsupported core fact (syntax this
            // extractor cannot faithfully lower), roll the emission back fully — the census stays clean
            // (0 unsupported, materialization gate intact) and the handler stays honestly unlinked.
            const factsMark = facts.length;
            const unsupportedKeysBefore = new Set(unsupportedById.keys());
            const fid = emitFunction(arrow, sourceFile, true);
            const newUnsupported = [...unsupportedById.keys()].filter((k) => !unsupportedKeysBefore.has(k));
            if (newUnsupported.length > 0) {
                facts.length = factsMark;
                for (const k of newUnsupported)
                    unsupportedById.delete(k);
                return undefined;
            }
            return fid;
        };
        const attributes = ts.isJsxFragment(node)
            ? []
            : ts.isJsxElement(node)
                ? node.openingElement.attributes.properties
                : node.attributes.properties;
        attributes.forEach((attribute, index) => {
            if (ts.isJsxSpreadAttribute(attribute))
                return;
            const name = attribute.name.getText(sourceFile);
            if (!(name.length > 2 && name[0]?.toLowerCase() === "o" && name[1]?.toLowerCase() === "n"))
                return;
            const fid = emitHandlerArrow(attribute);
            if (fid === undefined)
                return;
            const prop = props[index];
            if (prop && typeof prop === "object")
                prop.handlerFn = fid;
        });
        // Nested-JSX handler discovery: the emitJsx descent does not enter JSX expression containers
        // (`{<Wp.span .../>}`, `{cond && <X/>}`, `{items.map(x => <Row .../>)}`), so handler props on
        // nested elements never reach a csg.jsx props array — the scene materializer later re-parses
        // the container TEXT to synthesize those nodes, carrying only handler text. Walk the container
        // subtrees here and emit text+loc-keyed sidecar facts; the CHT joins on
        // (loc file:line, propName, whitespace-normalized expression text) to recover the exact fid.
        const deepVisit = (n) => {
            if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
                const nestedAttrs = ts.isJsxElement(n)
                    ? n.openingElement.attributes.properties
                    : n.attributes.properties;
                for (const attribute of nestedAttrs) {
                    if (ts.isJsxSpreadAttribute(attribute))
                        continue;
                    const name = attribute.name.getText(sourceFile);
                    if (!(name.length > 2 && name[0]?.toLowerCase() === "o" && name[1]?.toLowerCase() === "n"))
                        continue;
                    if (!attribute.initializer || !ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression)
                        continue;
                    const fid = emitHandlerArrow(attribute);
                    if (fid === undefined)
                        continue;
                    emitFact({
                        kind: "csg.inline_handler",
                        id: nodeId("csg.inline_handler", attribute, sourceFile, name),
                        loc: locFor(sourceFile, attribute),
                        owner: currentOwner(),
                        propName: name,
                        expression: attribute.initializer.expression.getText(sourceFile).replace(/\s+/g, " ").trim(),
                        handlerFn: fid,
                    });
                }
            }
            ts.forEachChild(n, deepVisit);
        };
        if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
            for (const child of node.children) {
                if (ts.isJsxExpression(child) && child.expression)
                    deepVisit(child.expression);
            }
        }
    }
    function emitVariable(node, sourceFile) {
        const name = bindingNameText(node.name, sourceFile);
        const type = typeAt(node.name);
        const jsonParseInitializer = node.initializer && ts.isCallExpression(node.initializer) && isJsonParseCall(node.initializer);
        if (jsonParseInitializer) {
            addTypeTextFact(sourceFile, node.name, "variable", "unknown", ["Unknown"]);
        }
        else {
            addTypeFact(sourceFile, node.name, "variable", type);
        }
        emitFact({
            kind: "csg.symbol",
            id: nodeId("csg.symbol", node, sourceFile, name),
            loc: locFor(sourceFile, node),
            name,
            symbolKind: "variable",
            declarationKind: variableDeclarationKind(node),
            type: jsonParseInitializer ? "unknown" : typeText(type),
            initializerKind: node.initializer ? syntaxKindName(node.initializer.kind) : undefined,
            exported: isExportedVariable(node),
        });
        if (!ts.isIdentifier(node.name)) {
            emitBindingFacts(node.name, sourceFile, variableDeclarationKind(node), currentOwner(), node.initializer);
        }
        if (ts.isIdentifier(node.name)) {
            const componentAlias = staticComponentAliasValue(node.name.text, node.initializer, sourceFile);
            if (componentAlias !== undefined) {
                addDataFact(sourceFile, node, "component_alias", componentAlias);
            }
            const staticArray = staticStringObjectArrayValue(node.initializer, sourceFile);
            if (staticArray !== undefined) {
                addDataFact(sourceFile, node, "static_string_object_array", {
                    bindingName: name,
                    sourceFile: sourceFileRelPath(sourceFile),
                    items: staticArray,
                });
            }
            if (variableDeclarationKind(node) === "const") {
                const staticValue = staticJsonValue(node.initializer, sourceFile);
                if (staticValue !== undefined) {
                    addDataFact(sourceFile, node, "static_json_value", {
                        bindingName: name,
                        sourceFile: sourceFileRelPath(sourceFile),
                        value: staticValue,
                    });
                }
            }
        }
        if (!jsonParseInitializer && containsAny(type, node, node.type)) {
            addUnsupported(sourceFile, node, "type.any", "variable resolves to any", currentOwner());
        }
    }
    function staticComponentAliasValue(aliasName, initializer, sourceFile) {
        if (!initializer)
            return undefined;
        const expression = unwrapExpression(initializer);
        if (!ts.isCallExpression(expression) || expression.arguments.length === 0)
            return undefined;
        if (!isReactMemoCallExpression(expression, sourceFile))
            return undefined;
        const target = unwrapExpression(expression.arguments[0]);
        if (!ts.isIdentifier(target))
            return undefined;
        return {
            aliasName,
            targetName: target.text,
            sourceFile: sourceFileRelPath(sourceFile),
        };
    }
    function isReactMemoCallExpression(node, sourceFile) {
        const callee = node.expression;
        if (ts.isIdentifier(callee))
            return callee.text === "memo";
        if (!ts.isPropertyAccessExpression(callee))
            return false;
        if (callee.name.text !== "memo")
            return false;
        return callee.expression.getText(sourceFile) === "React";
    }
    function staticStringObjectArrayValue(node, sourceFile) {
        if (!node)
            return undefined;
        const initializer = unwrapExpression(node);
        if (!ts.isArrayLiteralExpression(initializer))
            return undefined;
        const items = [];
        for (const element of initializer.elements) {
            const itemExpression = unwrapExpression(element);
            if (!ts.isObjectLiteralExpression(itemExpression))
                return undefined;
            const item = {};
            for (const property of itemExpression.properties) {
                if (!ts.isPropertyAssignment(property))
                    return undefined;
                const key = propertyNameText(property.name, sourceFile);
                const valueExpression = unwrapExpression(property.initializer);
                if (!ts.isStringLiteralLike(valueExpression) && !ts.isNoSubstitutionTemplateLiteral(valueExpression))
                    return undefined;
                item[key] = valueExpression.text;
            }
            items.push(item);
        }
        return items;
    }
    function staticJsonValue(node, sourceFile) {
        if (!node)
            return undefined;
        const value = evalStaticExpression(node, sourceFile, currentFunctionStaticEnvironment());
        return value !== undefined && value !== staticUndefined ? value : undefined;
    }
    function evalStaticExpressionText(text, sourceFile, env) {
        const wrapped = ts.createSourceFile(`${sourceFile.fileName}.static-expression.ts`, `const __csg_static_value = (${text});`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const stmt = wrapped.statements[0];
        if (!stmt || !ts.isVariableStatement(stmt))
            return undefined;
        const decl = stmt.declarationList.declarations[0];
        if (!decl?.initializer)
            return undefined;
        return evalStaticExpression(decl.initializer, sourceFile, env);
    }
    function evalStaticExpression(node, sourceFile, env) {
        const value = unwrapExpression(node);
        if (ts.isStringLiteralLike(value) || ts.isNoSubstitutionTemplateLiteral(value))
            return value.text;
        if (ts.isNumericLiteral(value))
            return Number(value.text);
        if (value.kind === ts.SyntaxKind.TrueKeyword)
            return true;
        if (value.kind === ts.SyntaxKind.FalseKeyword)
            return false;
        if (value.kind === ts.SyntaxKind.NullKeyword)
            return null;
        if (ts.isIdentifier(value)) {
            if (value.text === "undefined")
                return staticUndefined;
            return env?.get(value.text);
        }
        if (ts.isPrefixUnaryExpression(value)) {
            const operand = evalStaticExpression(value.operand, sourceFile, env);
            if (operand === undefined)
                return undefined;
            if (value.operator === ts.SyntaxKind.ExclamationToken)
                return !staticEvalTruthy(operand);
            if (typeof operand === "number" && value.operator === ts.SyntaxKind.MinusToken)
                return -operand;
            if (typeof operand === "number" && value.operator === ts.SyntaxKind.PlusToken)
                return operand;
            return undefined;
        }
        if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
            if (value.parameters.length !== 0)
                return undefined;
            if (ts.isBlock(value.body)) {
                if (value.body.statements.length !== 1)
                    return undefined;
                const only = value.body.statements[0];
                if (!only || !ts.isReturnStatement(only) || !only.expression)
                    return undefined;
                return evalStaticExpression(only.expression, sourceFile, env);
            }
            return evalStaticExpression(value.body, sourceFile, env);
        }
        if (ts.isParenthesizedExpression(value) || ts.isAsExpression(value) || ts.isNonNullExpression(value)) {
            return evalStaticExpression(value.expression, sourceFile, env);
        }
        if (ts.isConditionalExpression(value)) {
            const condition = evalStaticExpression(value.condition, sourceFile, env);
            if (condition === undefined)
                return undefined;
            return evalStaticExpression(staticEvalTruthy(condition) ? value.whenTrue : value.whenFalse, sourceFile, env);
        }
        if (ts.isBinaryExpression(value)) {
            return evalStaticBinaryExpression(value, sourceFile, env);
        }
        if (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression) && value.arguments.length === 0) {
            const receiver = evalStaticExpression(value.expression.expression, sourceFile, env);
            const method = value.expression.name.text;
            if (typeof receiver === "string" && method === "trim")
                return receiver.trim();
        }
        if (ts.isPropertyAccessExpression(value)) {
            const receiver = evalStaticExpression(value.expression, sourceFile, env);
            if (receiver !== undefined && receiver !== staticUndefined && typeof receiver === "object" && !Array.isArray(receiver) && receiver !== null) {
                return receiver[value.name.text];
            }
            return undefined;
        }
        if (ts.isElementAccessExpression(value) && value.argumentExpression) {
            const receiver = evalStaticExpression(value.expression, sourceFile, env);
            const key = evalStaticExpression(value.argumentExpression, sourceFile, env);
            if (receiver === undefined || receiver === staticUndefined || key === undefined || key === staticUndefined)
                return undefined;
            if (Array.isArray(receiver) && typeof key === "number")
                return receiver[key];
            if (typeof receiver === "object" && receiver !== null && !Array.isArray(receiver) && typeof key === "string") {
                return receiver[key];
            }
            return undefined;
        }
        if (ts.isArrayLiteralExpression(value)) {
            const items = [];
            for (const element of value.elements) {
                if (ts.isSpreadElement(element))
                    return undefined;
                const item = evalStaticExpression(element, sourceFile, env);
                if (item === undefined || item === staticUndefined)
                    return undefined;
                items.push(item);
            }
            return items;
        }
        if (ts.isObjectLiteralExpression(value)) {
            const record = {};
            for (const property of value.properties) {
                if (!ts.isPropertyAssignment(property))
                    return undefined;
                const key = propertyNameText(property.name, sourceFile);
                if (Object.prototype.hasOwnProperty.call(record, key))
                    return undefined;
                const item = evalStaticExpression(property.initializer, sourceFile, env);
                if (item === undefined || item === staticUndefined)
                    return undefined;
                record[key] = item;
            }
            return record;
        }
        return undefined;
    }
    function evalStaticBinaryExpression(node, sourceFile, env) {
        if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
            const left = evalStaticExpression(node.left, sourceFile, env);
            if (left === undefined)
                return undefined;
            return left === null || left === staticUndefined ? evalStaticExpression(node.right, sourceFile, env) : left;
        }
        if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
            const left = evalStaticExpression(node.left, sourceFile, env);
            if (left === undefined)
                return undefined;
            return staticEvalTruthy(left) ? left : evalStaticExpression(node.right, sourceFile, env);
        }
        if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
            const left = evalStaticExpression(node.left, sourceFile, env);
            if (left === undefined)
                return undefined;
            return staticEvalTruthy(left) ? evalStaticExpression(node.right, sourceFile, env) : left;
        }
        const left = evalStaticExpression(node.left, sourceFile, env);
        const right = evalStaticExpression(node.right, sourceFile, env);
        if (left === undefined || right === undefined)
            return undefined;
        if (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken) {
            return staticEvalEquals(left, right);
        }
        if (node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken || node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken) {
            return !staticEvalEquals(left, right);
        }
        if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
            if (typeof left === "number" && typeof right === "number")
                return left + right;
            if (left !== staticUndefined && right !== staticUndefined && (typeof left === "string" || typeof right === "string")) {
                return `${left}${right}`;
            }
        }
        return undefined;
    }
    function staticEvalTruthy(value) {
        if (value === staticUndefined || value === null)
            return false;
        if (typeof value === "boolean")
            return value;
        if (typeof value === "number")
            return value !== 0 && !Number.isNaN(value);
        if (typeof value === "string")
            return value.length > 0;
        return true;
    }
    function staticEvalEquals(left, right) {
        if (left === staticUndefined || right === staticUndefined)
            return left === right;
        return stableJson(left) === stableJson(right);
    }
    function emitFunction(node, sourceFile, discardReturn = false) {
        const name = declarationName(node, sourceFile);
        const signature = checker.getSignatureFromDeclaration(node);
        const returnType = signature ? checker.getReturnTypeOfSignature(signature) : typeAt(node);
        const functionId = nodeId("csg.function", node, sourceFile, name);
        const symbolId = emitSymbol("function", node, sourceFile, name);
        const context = {
            id: functionId,
            name,
            sourceFile,
            nextOp: 0,
            nextBlock: 0,
        };
        emitFact({
            kind: "csg.function",
            id: functionId,
            loc: locFor(sourceFile, node),
            name,
            symbol: symbolId,
            owner: currentOwner(),
            async: hasModifier(node, ts.SyntaxKind.AsyncKeyword),
            generator: "asteriskToken" in node && node.asteriskToken !== undefined,
            exported: hasModifier(node, ts.SyntaxKind.ExportKeyword),
            typeParameters: typeParameterTexts(functionTypeParameters(node)),
            parameters: node.parameters.map((param, index) => parameterFact(param, sourceFile, index, checker)),
            returnType: typeText(returnType),
        });
        // An inline JSX event-handler arrow's return value is structurally discarded by React
        // (`(e) => void`), so a return type that resolves to `any` is not a real soundness gap here.
        if (!discardReturn && containsAny(returnType, node, functionReturnTypeNode(node))) {
            addUnsupported(sourceFile, node, "type.any", "function return resolves to any", functionId);
        }
        if (hasModifier(node, ts.SyntaxKind.AsyncKeyword)) {
            emitFact({
                kind: "csg.async_function",
                id: stableId("csg.async_function", functionId),
                loc: locFor(sourceFile, node),
                function: functionId,
                runtime: "js-core",
                stateMachine: "promise",
            });
            addRuntimeRequirement(sourceFile, node, "async_function", name, { runtime: "js-core", source: "ecmascript_promise" }, functionId, asyncFunctionProofs(node));
        }
        if ("asteriskToken" in node && node.asteriskToken) {
            addRuntimeRequirement(sourceFile, node, "generator_function", name, { runtime: "js-core", source: "ecmascript_iterator" }, functionId, generatorFunctionProofs(node));
        }
        const staticEnv = computeFunctionStaticEnvironment(node, sourceFile);
        const nullGuard = componentNullGuard(node, sourceFile);
        if (nullGuard) {
            addDataFact(sourceFile, nullGuard.node, "component_null_guard", {
                functionId,
                paramName: nullGuard.paramName,
                predicate: nullGuard.predicate,
            });
        }
        functionStaticEnvStack.push(staticEnv);
        for (const param of node.parameters) {
            if (!ts.isIdentifier(param.name)) {
                emitBindingFacts(param.name, sourceFile, "parameter", functionId);
            }
        }
        functionStack.push(context);
        const entryBlock = newBlock(context, node.body, "entry");
        if (ts.isBlock(node.body)) {
            emitStatementList(context, entryBlock, node.body.statements, sourceFile);
            emitTerm(context, entryBlock, terminalKind(node.body.statements), []);
        }
        else {
            const valueOp = emitExpression(context, entryBlock, node.body, sourceFile);
            emitOp(context, entryBlock, node.body, "return", { value: valueOp });
            emitTerm(context, entryBlock, "return", []);
        }
        functionStack.pop();
        functionStaticEnvStack.pop();
        return functionId;
    }
    function computeFunctionStaticEnvironment(node, sourceFile) {
        const env = new Map();
        for (const param of node.parameters) {
            collectStaticBindingsForBindingName(param.name, param.initializer, sourceFile, env, true);
        }
        if (!ts.isBlock(node.body))
            return env;
        for (const statement of node.body.statements) {
            if (!ts.isVariableStatement(statement))
                continue;
            for (const declaration of statement.declarationList.declarations) {
                collectStaticBindingsForBindingName(declaration.name, declaration.initializer, sourceFile, env, false);
            }
        }
        return env;
    }
    function collectStaticBindingsForBindingName(name, initializer, sourceFile, env, parameterDefaultUndefined) {
        if (ts.isIdentifier(name)) {
            const evaluated = initializer
                ? evalStaticExpression(initializer, sourceFile, env)
                : parameterDefaultUndefined ? staticUndefined : undefined;
            if (evaluated !== undefined)
                env.set(name.text, evaluated);
            return;
        }
        const rootValue = initializer
            ? evalStaticExpression(initializer, sourceFile, env)
            : parameterDefaultUndefined ? staticUndefined : undefined;
        for (const leaf of collectBindingLeaves(name, sourceFile, [], env)) {
            let leafValue = rootValue === undefined
                ? undefined
                : staticEvalValueAtBindingPath(rootValue, leaf.path);
            if ((leafValue === undefined || leafValue === staticUndefined) && leaf.defaultInitializer) {
                leafValue = evalStaticExpressionText(leaf.defaultInitializer, sourceFile, env);
            }
            if (leafValue !== undefined)
                env.set(leaf.name, leafValue);
        }
    }
    function componentNullGuard(node, sourceFile) {
        if (!ts.isBlock(node.body))
            return undefined;
        for (const statement of node.body.statements) {
            if (ts.isVariableStatement(statement) || ts.isExpressionStatement(statement))
                continue;
            if (!ts.isIfStatement(statement) || statement.elseStatement)
                continue;
            if (!returnsNull(statement.thenStatement))
                continue;
            const guard = nullReturnGuardParam(statement.expression, sourceFile);
            if (guard)
                return { node: statement, ...guard };
        }
        return undefined;
    }
    function returnsNull(statement) {
        if (ts.isBlock(statement)) {
            if (statement.statements.length !== 1)
                return false;
            const only = statement.statements[0];
            return only !== undefined && returnsNull(only);
        }
        return ts.isReturnStatement(statement) &&
            statement.expression !== undefined &&
            unwrapExpression(statement.expression).kind === ts.SyntaxKind.NullKeyword;
    }
    function nullReturnGuardParam(expression, sourceFile) {
        const expr = unwrapExpression(expression);
        if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken && ts.isIdentifier(unwrapExpression(expr.operand))) {
            return { paramName: unwrapExpression(expr.operand).getText(sourceFile), predicate: "falsy" };
        }
        if (ts.isIdentifier(expr)) {
            return { paramName: expr.text, predicate: "truthy" };
        }
        return undefined;
    }
    function emitStatementList(context, blockId, statements, sourceFile) {
        for (const statement of statements) {
            emitStatement(context, blockId, statement, sourceFile);
        }
    }
    function emitStatement(context, blockId, node, sourceFile) {
        if (ts.isVariableStatement(node)) {
            emitOp(context, blockId, node, "var_statement", { declarationCount: node.declarationList.declarations.length });
            for (const declaration of node.declarationList.declarations) {
                emitVariable(declaration, sourceFile);
                const initializerOp = declaration.initializer ? emitExpression(context, blockId, declaration.initializer, sourceFile) : undefined;
                if (ts.isIdentifier(declaration.name)) {
                    const declaredType = typeAt(declaration.name);
                    const typeSource = declaration.type?.getText(sourceFile);
                    emitOp(context, blockId, declaration.name, "local_write", {
                        declarationKind: variableDeclarationKind(declaration),
                        name: declaration.name.text,
                        value: initializerOp,
                        typeSource,
                        typeText: typeText(declaredType),
                    });
                }
                else {
                    emitBindingExtractOps(context, blockId, declaration.name, sourceFile, initializerOp);
                }
            }
            return;
        }
        if (ts.isFunctionDeclaration(node) && node.body) {
            emitFunction(node, sourceFile);
            emitOp(context, blockId, node, "function_decl", { name: node.name?.text ?? "<anonymous>" });
            return;
        }
        if (ts.isExpressionStatement(node)) {
            emitExpression(context, blockId, node.expression, sourceFile);
            return;
        }
        if (ts.isReturnStatement(node)) {
            const valueOp = node.expression ? emitExpression(context, blockId, node.expression, sourceFile) : undefined;
            emitOp(context, blockId, node, "return", { value: valueOp });
            return;
        }
        if (ts.isIfStatement(node)) {
            const condOp = emitExpression(context, blockId, node.expression, sourceFile);
            const thenBlock = newBlock(context, node.thenStatement, "if.then");
            emitStatement(context, thenBlock, asStatement(node.thenStatement), sourceFile);
            const elseBlock = node.elseStatement ? newBlock(context, node.elseStatement, "if.else") : undefined;
            if (node.elseStatement && elseBlock)
                emitStatement(context, elseBlock, asStatement(node.elseStatement), sourceFile);
            emitOp(context, blockId, node, "branch_if", { condition: condOp, thenBlock, elseBlock });
            return;
        }
        if (ts.isWhileStatement(node)) {
            const conditionBlock = newBlock(context, node.expression, "while.condition");
            const bodyBlock = newBlock(context, node.statement, "while.body");
            const condOp = emitExpression(context, conditionBlock, node.expression, sourceFile);
            emitStatement(context, bodyBlock, asStatement(node.statement), sourceFile);
            emitTerm(context, conditionBlock, "branch", [bodyBlock, blockId]);
            emitOp(context, blockId, node, "while", { conditionBlock, bodyBlock, condition: condOp });
            return;
        }
        if (ts.isForStatement(node)) {
            const loop = forCountLoopParts(node, sourceFile);
            if (loop) {
                const startOp = emitExpression(context, blockId, loop.start, sourceFile);
                const endOp = emitExpression(context, blockId, loop.end, sourceFile);
                const bodyBlock = newBlock(context, node.statement, "for_count.body");
                emitStatement(context, bodyBlock, asStatement(node.statement), sourceFile);
                emitOp(context, blockId, node, "for_count", {
                    initializerName: loop.indexName,
                    declarationKind: loop.declarationKind,
                    start: startOp,
                    end: endOp,
                    inclusiveEnd: loop.inclusiveEnd,
                    direction: loop.direction,
                    bodyBlock,
                });
                return;
            }
            emitOp(context, blockId, node, "statement", { statementKind: syntaxKindName(node.kind) });
            return;
        }
        if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
            const iterableOp = emitExpression(context, blockId, node.expression, sourceFile);
            const bodyBlock = newBlock(context, node.statement, ts.isForOfStatement(node) ? "for_of.body" : "for_in.body");
            emitStatement(context, bodyBlock, asStatement(node.statement), sourceFile);
            addRuntimeRequirement(sourceFile, node, ts.isForOfStatement(node) ? "iterator_loop" : "property_iterator_loop", syntaxKindName(node.kind), { runtime: "js-core", source: "ecmascript_iterator" }, context.id, forOfProofs(node));
            emitOp(context, blockId, node, ts.isForOfStatement(node) ? "for_of" : "for_in", {
                initializerKind: syntaxKindName(node.initializer.kind),
                initializerName: loopInitializerName(node.initializer),
                declarationKind: loopInitializerDeclarationKind(node.initializer),
                iterable: iterableOp,
                bodyBlock,
            });
            return;
        }
        if (ts.isBlock(node)) {
            const nested = newBlock(context, node, "block");
            emitStatementList(context, nested, node.statements, sourceFile);
            emitOp(context, blockId, node, "block", { nestedBlock: nested });
            return;
        }
        if (ts.isTryStatement(node)) {
            const tryBlock = newBlock(context, node.tryBlock, "try.body");
            emitStatement(context, tryBlock, node.tryBlock, sourceFile);
            const catchBlock = node.catchClause ? newBlock(context, node.catchClause.block, "try.catch") : undefined;
            if (node.catchClause?.variableDeclaration) {
                emitBindingFacts(node.catchClause.variableDeclaration.name, sourceFile, "catch", context.id);
            }
            if (node.catchClause && catchBlock)
                emitStatement(context, catchBlock, node.catchClause.block, sourceFile);
            const finallyBlock = node.finallyBlock ? newBlock(context, node.finallyBlock, "try.finally") : undefined;
            if (node.finallyBlock && finallyBlock)
                emitStatement(context, finallyBlock, node.finallyBlock, sourceFile);
            addRuntimeRequirement(sourceFile, node, "exception_region", "try", { runtime: "js-core", source: "ecmascript_exception" }, context.id);
            emitOp(context, blockId, node, "try", { tryBlock, catchBlock, finallyBlock });
            return;
        }
        if (ts.isThrowStatement(node)) {
            const valueOp = node.expression ? emitExpression(context, blockId, node.expression, sourceFile) : undefined;
            emitOp(context, blockId, node, "throw", { value: valueOp });
            return;
        }
        emitOp(context, blockId, node, "statement", { statementKind: syntaxKindName(node.kind) });
    }
    function emitExpression(context, blockId, node, sourceFile) {
        if (ts.isParenthesizedExpression(node)) {
            return emitExpression(context, blockId, node.expression, sourceFile);
        }
        if (ts.isSpreadElement(node)) {
            const value = emitExpression(context, blockId, node.expression, sourceFile);
            addRuntimeRequirement(sourceFile, node, "spread", "spread", { runtime: "js-core", source: "ecmascript_iterator" }, currentOwner(), spreadProofs(node));
            return emitOp(context, blockId, node, "spread", { value });
        }
        if (ts.isNumericLiteral(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            const value = ts.isNumericLiteral(node) ? Number(node.text) : node.text;
            const dataId = addDataFact(sourceFile, node, ts.isNumericLiteral(node) ? "number" : "string", value);
            return emitOp(context, blockId, node, "literal", { data: dataId, literalKind: ts.isNumericLiteral(node) ? "number" : "string" });
        }
        if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword) {
            const value = node.kind === ts.SyntaxKind.TrueKeyword ? true : node.kind === ts.SyntaxKind.FalseKeyword ? false : null;
            const dataId = addDataFact(sourceFile, node, value === null ? "null" : "boolean", value);
            return emitOp(context, blockId, node, "literal", { data: dataId, literalKind: value === null ? "null" : "boolean" });
        }
        if (ts.isIdentifier(node)) {
            inspectRuntimeIdentifier(node, sourceFile);
            return emitOp(context, blockId, node, "identifier", {
                name: node.text,
                typeText: typeText(typeAt(node)),
            });
        }
        if (ts.isCallExpression(node)) {
            emitCall(node, sourceFile);
            const memberCall = ts.isPropertyAccessExpression(node.expression)
                ? {
                    receiver: emitExpression(context, blockId, node.expression.expression, sourceFile),
                    memberName: node.expression.name.text,
                }
                : {};
            // IIFE callee `(async () => {...})()` / `(() => {...})()`: the callee is a (possibly
            // parenthesized) arrow/function expression invoked in place. Emit it through
            // emitExpression so its body is extracted as a function_value (calleeFn op id), instead
            // of left as opaque callee text — this is what lets the await-split lowering find the
            // async-IIFE body and split it at the await. Without this the body is uncompilable text.
            const calleeInner = ts.isParenthesizedExpression(node.expression) ? node.expression.expression : node.expression;
            const calleeFn = (ts.isArrowFunction(calleeInner) || ts.isFunctionExpression(calleeInner))
                ? emitExpression(context, blockId, calleeInner, sourceFile)
                : undefined;
            const argumentOps = node.arguments.map((arg) => emitExpression(context, blockId, arg, sourceFile));
            const callSignature = checker.getResolvedSignature(node);
            const callReturnType = node.expression.kind === ts.SyntaxKind.ImportKeyword
                ? typeAt(node)
                : callSignature
                    ? checker.getReturnTypeOfSignature(callSignature)
                    : typeAt(node);
            return emitOp(context, blockId, node, "call", {
                callee: node.expression.getText(sourceFile),
                ...memberCall,
                ...(calleeFn !== undefined ? { calleeFn } : {}),
                argumentCount: node.arguments.length,
                arguments: argumentOps,
                returnType: typeText(callReturnType),
                // Optional call (`foo?.()` / `a.b?.()`): the call itself may never execute at
                // runtime, so its callee text is otherwise indistinguishable from an unconditional
                // call with the same name — consumers that gate on control-flow shape (e.g. the web
                // materializer's route_edge builder) must be able to tell the two apart.
                optionalCall: Boolean(node.questionDotToken),
            });
        }
        if (ts.isNewExpression(node)) {
            emitNew(node, sourceFile);
            const argumentOps = (node.arguments ?? []).map((arg) => emitExpression(context, blockId, arg, sourceFile));
            return emitOp(context, blockId, node, "new", {
                constructor: node.expression.getText(sourceFile),
                argumentCount: node.arguments?.length ?? 0,
                arguments: argumentOps,
            });
        }
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
            emitJsx(node, sourceFile, true);
            const jsxOpId = emitOp(context, blockId, node, "jsx", {
                tagName: jsxTagName(node, sourceFile),
                attributeCount: jsxAttributeCount(node),
                props: jsxProps(node, sourceFile),
                children: jsxChildren(node, sourceFile, (child) => nodeId("csg.jsx", child, sourceFile, jsxTagName(child, sourceFile))),
            });
            const jsxFact = jsxFactByNode.get(node);
            if (jsxFact !== undefined && jsxFact.op === undefined)
                jsxFact.op = jsxOpId;
            return jsxOpId;
        }
        if (ts.isBinaryExpression(node)) {
            const right = emitExpression(context, blockId, node.right, sourceFile);
            if (isAssignmentOperator(node.operatorToken.kind)) {
                const operator = syntaxKindName(node.operatorToken.kind);
                if (ts.isPropertyAccessExpression(node.left)) {
                    const receiver = emitExpression(context, blockId, node.left.expression, sourceFile);
                    const datasetWriteProofs = browserDatasetStringWriteProofs(node.left, node.right);
                    if (datasetWriteProofs.length > 0) {
                        addRuntimeRequirement(sourceFile, node, "property_write", "document.dataset.write", { runtime: "browser", source: "browser_global" }, currentOwner(), datasetWriteProofs);
                    }
                    else {
                        const requirementName = node.operatorToken.kind === ts.SyntaxKind.EqualsToken ? "Object.property_write" : "Object.compound_property_write";
                        const propertyWriteProofs = node.operatorToken.kind !== ts.SyntaxKind.EqualsToken ? [objectCompoundPropertyWriteProof] : undefined;
                        addRuntimeRequirement(sourceFile, node, "property_write", requirementName, { runtime: "js-core", source: "ecmascript_object" }, currentOwner(), propertyWriteProofs);
                    }
                    return emitOp(context, blockId, node, "property_write", {
                        operator,
                        receiver,
                        name: node.left.name.text,
                        value: right,
                    });
                }
                if (ts.isElementAccessExpression(node.left)) {
                    const receiver = emitExpression(context, blockId, node.left.expression, sourceFile);
                    const argument = node.left.argumentExpression ? emitExpression(context, blockId, node.left.argumentExpression, sourceFile) : undefined;
                    const receiverType = typeText(typeAt(node.left.expression));
                    if (isArrayLikeTypeText(receiverType)) {
                        const requirementName = node.operatorToken.kind === ts.SyntaxKind.EqualsToken ? "Array.index_write" : "Array.compound_index_write";
                        addRuntimeRequirement(sourceFile, node, "element_write", requirementName, { runtime: "js-core", source: "ecmascript_array" }, currentOwner(), arrayIndexProofs(node.left.expression, node.left.argumentExpression));
                    }
                    else {
                        const requirementName = node.operatorToken.kind === ts.SyntaxKind.EqualsToken ? "Object.element_write" : "Object.compound_element_write";
                        addRuntimeRequirement(sourceFile, node, "element_write", requirementName, { runtime: "js-core", source: "ecmascript_object" }, currentOwner());
                    }
                    return emitOp(context, blockId, node, "element_write", {
                        operator,
                        receiver,
                        argument,
                        value: right,
                    });
                }
                const left = emitExpression(context, blockId, node.left, sourceFile);
                return emitOp(context, blockId, node, "assign", {
                    operator,
                    left,
                    right,
                });
            }
            const left = emitExpression(context, blockId, node.left, sourceFile);
            const binaryProofs = binaryExpressionRuntimeProofs(node);
            if (binaryProofs.length > 0) {
                addRuntimeRequirement(sourceFile, node, "binary", "Error.instanceof", { runtime: "js-core", source: "ecmascript_operator" }, currentOwner(), binaryProofs);
            }
            return emitOp(context, blockId, node, "binary", {
                operator: syntaxKindName(node.operatorToken.kind),
                left,
                right,
            });
        }
        if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
            const operand = emitExpression(context, blockId, node.operand, sourceFile);
            return emitOp(context, blockId, node, "unary", { operator: syntaxKindName(node.operator), operand });
        }
        if (ts.isPropertyAccessExpression(node)) {
            inspectRuntimeExpression(node, sourceFile);
            const receiver = emitExpression(context, blockId, node.expression, sourceFile);
            const receiverType = typeText(typeAt(node.expression));
            if (isArrayLikeTypeText(receiverType) && node.name.text === "length") {
                addRuntimeRequirement(sourceFile, node, "property_read", "Array.length", { runtime: "js-core", source: "ecmascript_array" }, currentOwner(), arrayLengthProofs(node.expression, node));
            }
            else if (isStringLikeType(typeAt(node.expression), receiverType) && node.name.text === "length") {
                addRuntimeRequirement(sourceFile, node, "property_read", "String.length", { runtime: "js-core", source: "ecmascript_string" }, currentOwner(), stringLengthProofs(node.expression, node));
            }
            else {
                addRuntimeRequirement(sourceFile, node, "property_read", "Object.property_read", { runtime: "js-core", source: "ecmascript_object" }, currentOwner());
            }
            const resultType = typeAt(node);
            const resultTypeText = typeText(resultType);
            let resultProperties;
            if (resultType.flags & ts.TypeFlags.Object) {
                const props = resultType.getProperties().slice(0, 64);
                if (props.length > 0) {
                    resultProperties = props.map(p => p.name).filter(n => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n));
                    if (resultProperties.length === 0)
                        resultProperties = undefined;
                }
            }
            return emitOp(context, blockId, node, "property_read", {
                receiver,
                name: node.name.text,
                resultType: resultTypeText,
                resultProperties,
            });
        }
        if (ts.isElementAccessExpression(node)) {
            const receiver = emitExpression(context, blockId, node.expression, sourceFile);
            const argument = node.argumentExpression ? emitExpression(context, blockId, node.argumentExpression, sourceFile) : undefined;
            const receiverType = typeText(typeAt(node.expression));
            if (isArrayLikeTypeText(receiverType)) {
                addRuntimeRequirement(sourceFile, node, "element_read", "Array.index", { runtime: "js-core", source: "ecmascript_array" }, currentOwner(), arrayIndexProofs(node.expression, node.argumentExpression));
            }
            else {
                addRuntimeRequirement(sourceFile, node, "element_read", "Object.element_read", { runtime: "js-core", source: "ecmascript_object" }, currentOwner());
            }
            return emitOp(context, blockId, node, "element_read", {
                receiver,
                argument,
                receiverType,
                resultType: typeText(typeAt(node)),
            });
        }
        if (ts.isAwaitExpression(node)) {
            const value = emitExpression(context, blockId, node.expression, sourceFile);
            addRuntimeRequirement(sourceFile, node, "await", "Promise.await", { runtime: "js-core", source: "ecmascript_promise" }, currentOwner(), promiseAwaitProofs(node));
            return emitOp(context, blockId, node, "await", { value });
        }
        if (ts.isObjectLiteralExpression(node)) {
            const properties = [];
            const elements = [];
            const spreadFlags = [];
            const propertyNames = [];
            const computedKeys = [];
            for (const property of node.properties) {
                if (ts.isSpreadAssignment(property)) {
                    addRuntimeRequirement(sourceFile, property, "spread", "spread", { runtime: "js-core", source: "ecmascript_iterator" }, currentOwner());
                    elements.push(emitExpression(context, blockId, property.expression, sourceFile));
                    spreadFlags.push(true);
                    propertyNames.push(undefined);
                    computedKeys.push(undefined);
                }
                else if (ts.isPropertyAssignment(property)) {
                    const value = emitExpression(context, blockId, property.initializer, sourceFile);
                    elements.push(value);
                    spreadFlags.push(false);
                    if (ts.isComputedPropertyName(property.name)) {
                        propertyNames.push(undefined);
                        computedKeys.push(emitExpression(context, blockId, property.name.expression, sourceFile));
                    }
                    else {
                        const name = objectPropertyName(property.name, sourceFile);
                        propertyNames.push(name);
                        computedKeys.push(undefined);
                        if (name)
                            properties.push({ name, value });
                    }
                }
                else if (ts.isShorthandPropertyAssignment(property)) {
                    const value = emitExpression(context, blockId, property.name, sourceFile);
                    const name = property.name.getText(sourceFile);
                    elements.push(value);
                    spreadFlags.push(false);
                    propertyNames.push(name);
                    computedKeys.push(undefined);
                    properties.push({ name, value });
                }
            }
            addRuntimeRequirement(sourceFile, node, "object_literal", "Object.literal", { runtime: "js-core", source: "ecmascript_object" }, currentOwner());
            return emitOp(context, blockId, node, "object_literal", {
                propertyCount: node.properties.length,
                properties,
                elements,
                spreadFlags,
                propertyNames,
                computedKeys,
                returnType: typeText(typeAt(node)),
            });
        }
        if (ts.isArrayLiteralExpression(node)) {
            const elements = [];
            for (const element of node.elements) {
                if (ts.isSpreadElement(element)) {
                    addRuntimeRequirement(sourceFile, element, "spread", "spread", { runtime: "js-core", source: "ecmascript_iterator" }, currentOwner(), spreadProofs(element));
                    elements.push(emitExpression(context, blockId, element.expression, sourceFile));
                }
                else {
                    elements.push(emitExpression(context, blockId, element, sourceFile));
                }
            }
            addRuntimeRequirement(sourceFile, node, "array_literal", "Array.literal", { runtime: "js-core", source: "ecmascript_array" }, currentOwner(), arrayLiteralProofs(node));
            const spreadFlags = node.elements.map((element) => ts.isSpreadElement(element));
            return emitOp(context, blockId, node, "array_literal", { elementCount: node.elements.length, elements, spreadFlags });
        }
        if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
            const targetFunction = isFunctionLikeWithBody(node) ? emitFunction(node, sourceFile) : undefined;
            return emitOp(context, blockId, node, "function_value", { functionKind: syntaxKindName(node.kind), targetFunction });
        }
        if (ts.isTemplateExpression(node)) {
            const spanOpIds = [];
            for (const span of node.templateSpans) {
                const exprId = emitExpression(context, blockId, span.expression, sourceFile);
                spanOpIds.push(exprId);
            }
            const parts = [node.head.text];
            for (const span of node.templateSpans) {
                parts.push(span.literal.text);
            }
            return emitOp(context, blockId, node, "template", { spanCount: node.templateSpans.length, parts, spanOpIds });
        }
        if (ts.isTypeOfExpression(node)) {
            const operand = emitExpression(context, blockId, node.expression, sourceFile);
            return emitOp(context, blockId, node, "expression", { expressionKind: "TypeOfExpression", operand });
        }
        if (ts.isConditionalExpression(node)) {
            const condition = emitExpression(context, blockId, node.condition, sourceFile);
            const whenTrue = emitExpression(context, blockId, node.whenTrue, sourceFile);
            const whenFalse = emitExpression(context, blockId, node.whenFalse, sourceFile);
            return emitOp(context, blockId, node, "expression", { expressionKind: "ConditionalExpression", condition, whenTrue, whenFalse });
        }
        if (ts.isAsExpression(node)) {
            const value = emitExpression(context, blockId, node.expression, sourceFile);
            return emitOp(context, blockId, node, "expression", { expressionKind: "AsExpression", value });
        }
        if (ts.isNonNullExpression(node)) {
            const value = emitExpression(context, blockId, node.expression, sourceFile);
            return emitOp(context, blockId, node, "expression", { expressionKind: "NonNullExpression", value });
        }
        if (ts.isVoidExpression(node)) {
            // `void EXPR` evaluates EXPR for its side effect and discards the result. Lower the operand
            // so the effect (e.g. a fire-and-forget `void videoRef.current.play()`) survives instead of
            // being dropped by the catch-all below.
            const operand = emitExpression(context, blockId, node.expression, sourceFile);
            return emitOp(context, blockId, node, "expression", { expressionKind: "VoidExpression", operand });
        }
        return emitOp(context, blockId, node, "expression", { expressionKind: syntaxKindName(node.kind) });
    }
    function emitCall(node, sourceFile) {
        const signature = checker.getResolvedSignature(node);
        const jsonParseCall = isJsonParseCall(node);
        const returnType = node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? typeAt(node)
            : signature
                ? checker.getReturnTypeOfSignature(signature)
                : typeAt(node);
        const target = signature?.declaration ? symbolForDeclaration(signature.declaration) : checker.getSymbolAtLocation(node.expression);
        const targetFact = symbolFact(target, sourceFile);
        if (jsonParseCall) {
            addTypeTextFact(sourceFile, node, "call.return", "unknown", ["Unknown"]);
        }
        else {
            addTypeFact(sourceFile, node, "call.return", returnType);
        }
        emitFact({
            kind: "csg.call",
            id: nodeId("csg.call", node, sourceFile, node.expression.getText(sourceFile)),
            loc: locFor(sourceFile, node),
            owner: currentOwner(),
            calleeText: node.expression.getText(sourceFile),
            calleeKind: syntaxKindName(node.expression.kind),
            target: targetFact,
            argumentCount: node.arguments.length,
            returnType: jsonParseCall ? "unknown" : typeText(returnType),
        });
        if (jsonParseCall) {
            addRuntimeRequirement(sourceFile, node, "json_parse", "JSON.parse", { runtime: "js-core", source: "ecmascript_json" }, currentOwner());
        }
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const moduleName = stringModuleSpecifier(node.arguments[0]);
            if (moduleName) {
                addRuntimeRequirement(sourceFile, node, "dynamic_import", moduleName, { runtime: "js-core", source: "ecmascript_module_loader" }, currentOwner());
            }
        }
        if (!jsonParseCall && containsAny(returnType, node)) {
            addUnsupported(sourceFile, node, "type.any", "call return resolves to any", currentOwner());
        }
        const runtimeName = runtimeCallName(node, sourceFile);
        inspectRuntimeSymbol(sourceFile, node, target, runtimeName, "call", currentOwner(), runtimeCallProofs(node, runtimeName, target));
    }
    function emitNew(node, sourceFile) {
        const valueType = typeAt(node);
        addTypeFact(sourceFile, node, "new.value", valueType);
        emitFact({
            kind: "csg.call",
            id: nodeId("csg.call", node, sourceFile, `new:${node.expression.getText(sourceFile)}`),
            loc: locFor(sourceFile, node),
            owner: currentOwner(),
            calleeText: node.expression.getText(sourceFile),
            calleeKind: "new",
            argumentCount: node.arguments?.length ?? 0,
            returnType: typeText(valueType),
        });
        inspectRuntimeSymbol(sourceFile, node, checker.getSymbolAtLocation(node.expression), node.expression.getText(sourceFile), "constructor", currentOwner(), runtimeConstructorProofs(node));
    }
    function emitBindingFacts(name, sourceFile, declarationKind, owner, initializer) {
        for (const leaf of collectBindingLeaves(name, sourceFile, [], currentFunctionStaticEnvironment())) {
            const type = typeAt(leaf.node);
            const staticDefault = staticDefaultInitializerForBindingLeaf(leaf, initializer, sourceFile);
            addTypeFact(sourceFile, leaf.node, "binding", type);
            emitFact({
                kind: "csg.binding",
                id: stableId("csg.binding", sourceFileRelPath(sourceFile), String(leaf.node.pos), String(leaf.node.end), stableJson(leaf.path)),
                loc: locFor(sourceFile, leaf.node),
                owner,
                declarationKind,
                name: leaf.name,
                path: leaf.path,
                rest: leaf.rest,
                defaultInitializerKind: leaf.defaultInitializerKind ?? staticDefault?.kind,
                defaultInitializer: leaf.defaultInitializer ?? staticDefault?.text,
                type: typeText(type),
                symbol: symbolFact(checker.getSymbolAtLocation(leaf.node), sourceFile),
            });
            if (containsAny(type, leaf.node)) {
                addUnsupported(sourceFile, leaf.node, "type.any", "binding resolves to any", owner);
            }
        }
    }
    function staticDefaultInitializerForBindingLeaf(leaf, initializer, sourceFile) {
        const envValue = currentFunctionStaticEnvironment()?.get(leaf.name);
        if (envValue !== undefined && envValue !== staticUndefined) {
            return { kind: "StaticJsonValue", text: stableJson(envValue) };
        }
        if (!initializer || leaf.defaultInitializer !== undefined)
            return undefined;
        const value = staticValueForBindingLeaf(leaf, initializer, sourceFile);
        if (value === undefined)
            return undefined;
        return { kind: "StaticJsonValue", text: stableJson(value) };
    }
    function currentFunctionStaticEnvironment() {
        return functionStaticEnvStack.length > 0 ? functionStaticEnvStack[functionStaticEnvStack.length - 1] : undefined;
    }
    function staticValueForBindingLeaf(leaf, initializer, sourceFile) {
        const env = currentFunctionStaticEnvironment();
        const value = unwrapExpression(initializer);
        if (ts.isCallExpression(value) && isUseStateCall(value, sourceFile)) {
            const firstSegment = leaf.path[0];
            if (!firstSegment || firstSegment.kind !== "index" || firstSegment.index !== 0)
                return undefined;
            const initialState = value.arguments[0];
            if (!initialState)
                return undefined;
            const staticValue = evalStaticExpression(initialState, sourceFile, env);
            if (staticValue === undefined || staticValue === staticUndefined)
                return undefined;
            const item = staticEvalValueAtBindingPath(staticValue, leaf.path.slice(1));
            return item !== undefined && item !== staticUndefined ? item : undefined;
        }
        const staticValue = evalStaticExpression(value, sourceFile, env);
        if (staticValue === undefined || staticValue === staticUndefined)
            return undefined;
        const item = staticEvalValueAtBindingPath(staticValue, leaf.path);
        return item !== undefined && item !== staticUndefined ? item : undefined;
    }
    function isUseStateCall(node, sourceFile) {
        if (ts.isIdentifier(node.expression))
            return node.expression.text === "useState";
        if (ts.isPropertyAccessExpression(node.expression)) {
            return node.expression.name.text === "useState" && node.expression.expression.getText(sourceFile) === "React";
        }
        return false;
    }
    function staticEvalValueAtBindingPath(value, path) {
        let current = value;
        for (const segment of path) {
            if (segment.kind === "rest")
                return undefined;
            if (segment.kind === "computed")
                return undefined;
            if (current === staticUndefined) {
                return staticUndefined;
            }
            if (segment.kind === "index") {
                if (!Array.isArray(current) || segment.index < 0 || segment.index >= current.length)
                    return undefined;
                current = current[segment.index];
                continue;
            }
            if (typeof current !== "object" || current === null || Array.isArray(current))
                return undefined;
            if (!Object.prototype.hasOwnProperty.call(current, segment.name))
                return undefined;
            current = current[segment.name];
        }
        return current;
    }
    function emitBindingExtractOps(context, blockId, name, sourceFile, sourceOp) {
        for (const leaf of collectBindingLeaves(name, sourceFile, [], currentFunctionStaticEnvironment())) {
            emitOp(context, blockId, leaf.node, "binding_extract", {
                source: sourceOp,
                name: leaf.name,
                path: leaf.path,
                rest: leaf.rest,
                defaultInitializerKind: leaf.defaultInitializerKind,
                defaultInitializer: leaf.defaultInitializer,
            });
        }
    }
    function collectBindingLeaves(name, sourceFile, pathPrefix = [], env) {
        if (ts.isIdentifier(name)) {
            return [{
                    name: name.text,
                    node: name,
                    path: pathPrefix,
                    rest: pathPrefix.some((segment) => segment.kind === "rest"),
                }];
        }
        if (ts.isArrayBindingPattern(name)) {
            const leaves = [];
            name.elements.forEach((element, index) => {
                if (ts.isOmittedExpression(element))
                    return;
                const segment = element.dotDotDotToken ? { kind: "rest", index } : { kind: "index", index };
                const childPath = [...pathPrefix, segment];
                for (const leaf of collectBindingLeaves(element.name, sourceFile, childPath, env)) {
                    leaves.push({
                        ...leaf,
                        rest: leaf.rest || element.dotDotDotToken !== undefined,
                        defaultInitializerKind: element.initializer ? syntaxKindName(element.initializer.kind) : leaf.defaultInitializerKind,
                        defaultInitializer: element.initializer ? element.initializer.getText(sourceFile) : leaf.defaultInitializer,
                    });
                }
            });
            return leaves;
        }
        const leaves = [];
        for (const element of name.elements) {
            const segment = element.dotDotDotToken
                ? { kind: "rest" }
                : objectBindingPathSegment(element, sourceFile, env);
            const childPath = [...pathPrefix, segment];
            for (const leaf of collectBindingLeaves(element.name, sourceFile, childPath, env)) {
                leaves.push({
                    ...leaf,
                    rest: leaf.rest || element.dotDotDotToken !== undefined,
                    defaultInitializerKind: element.initializer ? syntaxKindName(element.initializer.kind) : leaf.defaultInitializerKind,
                    defaultInitializer: element.initializer ? element.initializer.getText(sourceFile) : leaf.defaultInitializer,
                });
            }
        }
        return leaves;
    }
    function objectBindingPathSegment(element, sourceFile, env) {
        if (element.propertyName) {
            if (ts.isComputedPropertyName(element.propertyName)) {
                const computedName = staticBindingPropertyName(element.propertyName.expression, sourceFile, env);
                if (computedName !== undefined)
                    return { kind: "property", name: computedName };
                return {
                    kind: "computed",
                    expressionText: element.propertyName.expression.getText(sourceFile),
                    expressionKind: syntaxKindName(element.propertyName.expression.kind),
                };
            }
            return { kind: "property", name: propertyNameText(element.propertyName, sourceFile) };
        }
        if (ts.isIdentifier(element.name))
            return { kind: "property", name: element.name.text };
        return { kind: "property", name: element.name.getText(sourceFile) };
    }
    function staticBindingPropertyName(expression, sourceFile, env) {
        const value = evalStaticExpression(expression, sourceFile, env);
        if (value === undefined || value === staticUndefined || value === null)
            return undefined;
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
            return String(value);
        return undefined;
    }
    function inspectUnsupported(node, sourceFile) {
        if (isDeclarationWithComputedName(node)) {
            const name = node.name;
            if (ts.isComputedPropertyName(name) && !isLiteralExpression(name.expression)) {
                addUnsupported(sourceFile, name, "computed_name.dynamic", "computed declaration names require closed literal keys", currentOwner());
            }
        }
        if (ts.isCallExpression(node)) {
            if (ts.isIdentifier(node.expression) && node.expression.text === "eval") {
                addUnsupported(sourceFile, node, "eval", "eval cannot be represented as closed CSG facts", currentOwner());
            }
            if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
                const arg = node.arguments[0];
                if (!arg || !isStringLiteralLike(arg)) {
                    addUnsupported(sourceFile, node, "require.dynamic", "require() module specifier must be a string literal", currentOwner());
                }
            }
            if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
                const arg = node.arguments[0];
                if (!arg || !isStringLiteralLike(arg)) {
                    addUnsupported(sourceFile, node, "import.dynamic", "dynamic import() module specifier must be a string literal", currentOwner());
                }
            }
        }
        if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind) && isPrototypeMutation(node.left)) {
            addUnsupported(sourceFile, node, "prototype.mutation", "prototype mutation is runtime shape mutation", currentOwner());
        }
        if (ts.isSwitchStatement(node)) {
            addUnsupported(sourceFile, node, "switch", "switch requires explicit dispatch lowering", currentOwner());
        }
        if (ts.canHaveDecorators(node) && (ts.getDecorators(node)?.length ?? 0) > 0) {
            addUnsupported(sourceFile, node, "decorator", "decorators require explicit metadata/runtime mapping", currentOwner());
        }
    }
    function inspectRuntimeExpression(node, sourceFile) {
        if (isTypeOnlyRuntimeNode(node))
            return;
        const localEventScalarProofs = browserEventReadonlyScalarPropertyProofs(node);
        if (localEventScalarProofs.length > 0) {
            addRuntimeRequirement(sourceFile, node, "property_access", dottedPropertyAccessName(node) ?? node.getText(sourceFile), { runtime: "browser", source: "dom_lib" }, currentOwner(), localEventScalarProofs);
            return;
        }
        const root = rootIdentifier(node.expression);
        if (!root)
            return;
        if (!identifierResolvesToRuntimeGlobal(root))
            return;
        const classification = classifyGlobalName(root.text);
        if (!classification)
            return;
        addRuntimeRequirement(sourceFile, node, "property_access", runtimePropertyAccessName(node, root), classification, currentOwner(), namespacePropertyProofs(node));
    }
    function inspectRuntimeIdentifier(node, sourceFile) {
        if (isTypeOnlyRuntimeNode(node))
            return;
        if (isDeclarationName(node))
            return;
        const classification = classifyGlobalName(node.text);
        if (!classification)
            return;
        if (!identifierResolvesToRuntimeGlobal(node))
            return;
        addRuntimeRequirement(sourceFile, node, "global", node.text, classification, currentOwner(), globalIdentifierProofs(node));
    }
    function inspectRuntimeSymbol(sourceFile, node, symbol, name, kind, owner, proofs) {
        if (!symbol) {
            const root = name.split(".")[0] ?? name;
            const rootNode = runtimeRequirementRootIdentifier(node);
            if (rootNode && rootNode.text === root && !identifierResolvesToRuntimeGlobal(rootNode))
                return;
            const globalClassification = classifyGlobalName(root);
            if (globalClassification)
                addRuntimeRequirement(sourceFile, node, kind, name, globalClassification, owner, proofs);
            return;
        }
        const declarations = symbol.declarations ?? [];
        const declaration = declarations[0];
        if (!declaration)
            return;
        const declarationSource = declaration.getSourceFile();
        if (isProjectSourceFile(build.cwd, declarationSource))
            return;
        const root = name.split(".")[0] ?? name;
        const rootNode = runtimeRequirementRootIdentifier(node);
        const classification = rootNode && rootNode.text === root && !identifierResolvesToRuntimeGlobal(rootNode)
            ? classifyDeclarationFileSource(declarationSource)
            : classifyDeclarationSource(declarationSource, name);
        addRuntimeRequirement(sourceFile, node, kind, name, classification, owner, proofs);
        addExternalSymbol(name, classification);
    }
    function runtimeRequirementRootIdentifier(node) {
        if (ts.isCallExpression(node) || ts.isNewExpression(node))
            return rootIdentifier(node.expression);
        if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
            return rootIdentifier(node);
        if (ts.isIdentifier(node))
            return node;
        return undefined;
    }
    function runtimePropertyAccessName(node, root) {
        const dottedName = dottedPropertyAccessName(node);
        if (dottedName?.startsWith(`${root.text}.`))
            return dottedName;
        return `${root.text}.${node.name.text}`;
    }
    function dottedPropertyAccessName(node) {
        const parts = [node.name.text];
        let current = node.expression;
        while (ts.isPropertyAccessExpression(current)) {
            parts.push(current.name.text);
            current = current.expression;
        }
        if (!ts.isIdentifier(current))
            return undefined;
        parts.push(current.text);
        return parts.reverse().join(".");
    }
    function isTypeOnlyRuntimeNode(node) {
        let current = node;
        while (current) {
            if (ts.isTypeNode(current) || ts.isTypeElement(current))
                return true;
            if (ts.isInterfaceDeclaration(current) || ts.isTypeAliasDeclaration(current))
                return true;
            current = current.parent;
        }
        return false;
    }
    function addUnsupported(sourceFile, node, code, message, owner) {
        if (code === "type.any" && sourceFileHasTsNoCheck(sourceFile))
            return;
        if (code === "type.any" && compilerOptionsAllowUncheckedAny(build.compilerOptions))
            return;
        const id = nodeId("csg.unsupported", node, sourceFile, code);
        if (unsupportedById.has(id))
            return;
        const item = {
            id,
            code,
            message,
            loc: locFor(sourceFile, node),
            owner,
        };
        unsupportedById.set(id, item);
    }
    function addRuntimeRequirement(sourceFile, node, kind, name, classification, owner, proofs) {
        const id = stableId("csg.runtime_requirement", kind, name, classification.runtime, sourceFileRelPath(sourceFile), String(node.pos), String(node.end));
        if (runtimeById.has(id))
            return;
        const item = {
            id,
            kind,
            name,
            runtime: classification.runtime,
            source: classification.source,
            loc: locFor(sourceFile, node),
            owner,
        };
        if (proofs && proofs.length > 0)
            item.proofs = [...new Set(proofs)].sort();
        runtimeById.set(id, item);
    }
    function addExternalSymbol(name, classification) {
        const id = stableId("csg.external_symbol", name, classification.runtime, classification.source);
        if (externalById.has(id))
            return;
        externalById.set(id, { id, name, runtime: classification.runtime, source: classification.source });
    }
    function addTypeFact(sourceFile, node, typeKind, type) {
        const text = typeText(type);
        return addTypeTextFact(sourceFile, node, typeKind, text, typeFlags(type.flags));
    }
    function addTypeTextFact(sourceFile, node, typeKind, text, flags) {
        const id = stableId("csg.type", typeKind, text, sourceFileRelPath(sourceFile), String(node.pos), String(node.end));
        if (!typeById.has(id)) {
            typeById.set(id, {
                kind: "csg.type",
                id,
                loc: locFor(sourceFile, node),
                typeKind,
                text,
                flags,
            });
        }
        return id;
    }
    function addDataFact(sourceFile, node, dataKind, value) {
        const id = stableId("csg.data", dataKind, stableJson(value));
        if (!dataById.has(id)) {
            dataById.set(id, {
                kind: "csg.data",
                id,
                loc: locFor(sourceFile, node),
                dataKind,
                value,
            });
        }
        return id;
    }
    function newBlock(context, node, blockKind) {
        const blockId = stableId("csg.block", context.id, blockKind, String(context.nextBlock), String(node.pos), String(node.end));
        context.nextBlock += 1;
        emitFact({
            kind: "csg.block",
            id: blockId,
            loc: locFor(context.sourceFile, node),
            function: context.id,
            blockKind,
            ordinal: context.nextBlock - 1,
        });
        return blockId;
    }
    function emitOp(context, blockId, node, opKind, fields) {
        const opId = stableId("csg.op", context.id, blockId, String(context.nextOp), opKind, String(node.pos), String(node.end));
        const ordinal = context.nextOp;
        context.nextOp += 1;
        emitFact({
            ...fields,
            kind: "csg.op",
            id: opId,
            loc: locFor(context.sourceFile, node),
            function: context.id,
            block: blockId,
            opKind,
            ordinal,
        });
        if (includeDebugMaps) {
            emitFact({
                kind: "csg.debug_map",
                id: stableId("csg.debug_map", opId),
                loc: locFor(context.sourceFile, node),
                target: opId,
            });
        }
        return opId;
    }
    function emitTerm(context, blockId, termKind, targets) {
        emitFact({
            kind: "csg.term",
            id: stableId("csg.term", context.id, blockId, termKind, targets.join(",")),
            function: context.id,
            block: blockId,
            termKind,
            targets,
        });
    }
    function emitFact(fact) {
        facts.push(fact);
    }
    function nodeId(kind, node, sourceFile, salt) {
        return stableId(kind, sourceFileRelPath(sourceFile), String(node.pos), String(node.end), salt);
    }
    function fileId(sourceFile) {
        return stableId("csg.module", sourceFileRelPath(sourceFile));
    }
    function sourceFileRelPath(sourceFile) {
        const cached = sourceFileRelPathCache.get(sourceFile);
        if (cached !== undefined)
            return cached;
        const value = relPath(build.cwd, sourceFile.fileName);
        sourceFileRelPathCache.set(sourceFile, value);
        return value;
    }
    function locFor(sourceFile, node) {
        const cached = nodeLocCache.get(node);
        if (cached !== undefined)
            return cached;
        const start = node.getStart(sourceFile, false);
        const end = node.getEnd();
        const point = sourceFile.getLineAndCharacterOfPosition(start);
        const loc = {
            file: sourceFileRelPath(sourceFile),
            line: point.line + 1,
            column: point.character + 1,
            start,
            end,
        };
        nodeLocCache.set(node, loc);
        return loc;
    }
    function currentOwner() {
        return functionStack[functionStack.length - 1]?.id;
    }
    function objectPropertyName(name, sourceFile) {
        if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
            return name.text;
        addRuntimeRequirement(sourceFile, name, "object_property_name", "Object.computed_property", { runtime: "js-core", source: "ecmascript_object" }, currentOwner(), [objectComputedPropertyNameProof]);
        return undefined;
    }
    function loopInitializerName(initializer) {
        if (ts.isIdentifier(initializer))
            return initializer.text;
        if (!ts.isVariableDeclarationList(initializer) || initializer.declarations.length !== 1)
            return undefined;
        const declaration = initializer.declarations[0];
        return declaration && ts.isIdentifier(declaration.name) ? declaration.name.text : undefined;
    }
    function loopInitializerDeclarationKind(initializer) {
        if (!ts.isVariableDeclarationList(initializer))
            return undefined;
        if (initializer.flags & ts.NodeFlags.Const)
            return "const";
        if (initializer.flags & ts.NodeFlags.Let)
            return "let";
        return "var";
    }
    function forCountLoopParts(node, sourceFile) {
        if (!node.initializer || !node.condition || !node.incrementor)
            return undefined;
        if (!ts.isVariableDeclarationList(node.initializer))
            return undefined;
        if ((node.initializer.flags & ts.NodeFlags.Let) === 0)
            return undefined;
        if (node.initializer.declarations.length !== 1)
            return undefined;
        const declaration = node.initializer.declarations[0];
        if (!declaration || !ts.isIdentifier(declaration.name) || !declaration.initializer)
            return undefined;
        const indexName = declaration.name.text;
        const condition = unwrapExpression(node.condition);
        if (!ts.isBinaryExpression(condition))
            return undefined;
        const conditionLeft = unwrapExpression(condition.left);
        if (!ts.isIdentifier(conditionLeft) || conditionLeft.text !== indexName)
            return undefined;
        const direction = condition.operatorToken.kind === ts.SyntaxKind.LessThanToken ||
            condition.operatorToken.kind === ts.SyntaxKind.LessThanEqualsToken
            ? "up"
            : condition.operatorToken.kind === ts.SyntaxKind.GreaterThanToken ||
                condition.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken
                ? "down"
                : undefined;
        if (!direction)
            return undefined;
        if (expressionReferencesIdentifier(condition.right, indexName))
            return undefined;
        if (containsCompoundMutation(condition.right) || containsCallOrNewExpression(condition.right))
            return undefined;
        if (direction === "up" && !isUnitIncrement(node.incrementor, indexName, sourceFile))
            return undefined;
        if (direction === "down" && !isUnitDecrement(node.incrementor, indexName, sourceFile))
            return undefined;
        return {
            indexName,
            declarationKind: "let",
            start: declaration.initializer,
            end: condition.right,
            inclusiveEnd: condition.operatorToken.kind === ts.SyntaxKind.LessThanEqualsToken ||
                condition.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken,
            direction,
        };
    }
    function isUnitIncrement(node, indexName, sourceFile) {
        const expr = unwrapExpression(node);
        if (ts.isPrefixUnaryExpression(expr) || ts.isPostfixUnaryExpression(expr)) {
            const operand = unwrapExpression(expr.operand);
            return expr.operator === ts.SyntaxKind.PlusPlusToken &&
                ts.isIdentifier(operand) &&
                operand.text === indexName;
        }
        if (!ts.isBinaryExpression(expr))
            return false;
        const left = unwrapExpression(expr.left);
        if (!ts.isIdentifier(left) || left.text !== indexName)
            return false;
        if (expr.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) {
            return unitNumberExpressionValue(expr.right, sourceFile) === 1;
        }
        if (expr.operatorToken.kind !== ts.SyntaxKind.EqualsToken)
            return false;
        const right = unwrapExpression(expr.right);
        if (!ts.isBinaryExpression(right) || right.operatorToken.kind !== ts.SyntaxKind.PlusToken)
            return false;
        const rightLeft = unwrapExpression(right.left);
        const rightRight = unwrapExpression(right.right);
        const leftIsIndex = ts.isIdentifier(rightLeft) && rightLeft.text === indexName;
        const rightIsIndex = ts.isIdentifier(rightRight) && rightRight.text === indexName;
        return (leftIsIndex && unitNumberExpressionValue(right.right, sourceFile) === 1) ||
            (rightIsIndex && unitNumberExpressionValue(right.left, sourceFile) === 1);
    }
    function isUnitDecrement(node, indexName, sourceFile) {
        const expr = unwrapExpression(node);
        if (ts.isPrefixUnaryExpression(expr) || ts.isPostfixUnaryExpression(expr)) {
            const operand = unwrapExpression(expr.operand);
            return expr.operator === ts.SyntaxKind.MinusMinusToken &&
                ts.isIdentifier(operand) &&
                operand.text === indexName;
        }
        if (!ts.isBinaryExpression(expr))
            return false;
        const left = unwrapExpression(expr.left);
        if (!ts.isIdentifier(left) || left.text !== indexName)
            return false;
        if (expr.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken) {
            return unitNumberExpressionValue(expr.right, sourceFile) === 1;
        }
        if (expr.operatorToken.kind !== ts.SyntaxKind.EqualsToken)
            return false;
        const right = unwrapExpression(expr.right);
        if (!ts.isBinaryExpression(right) || right.operatorToken.kind !== ts.SyntaxKind.MinusToken)
            return false;
        const rightLeft = unwrapExpression(right.left);
        return ts.isIdentifier(rightLeft) &&
            rightLeft.text === indexName &&
            unitNumberExpressionValue(right.right, sourceFile) === 1;
    }
    function unitNumberExpressionValue(node, sourceFile) {
        void sourceFile;
        const expr = unwrapExpression(node);
        if (ts.isNumericLiteral(expr))
            return Number(expr.text);
        if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.PlusToken && ts.isNumericLiteral(expr.operand)) {
            return Number(expr.operand.text);
        }
        return undefined;
    }
    function isArrayLikeTypeText(text) {
        const value = text.trim();
        return value.endsWith("[]") ||
            /^readonly .+\[\]$/.test(value) ||
            (value.startsWith("[") && value.endsWith("]")) ||
            /^readonly \[.*\]$/.test(value) ||
            /^Array<.*>$/.test(value) ||
            /^ReadonlyArray<.*>$/.test(value);
    }
    function isStringLikeType(type, text) {
        const value = text.trim();
        return value === "string" || value === "String" || (type.flags & ts.TypeFlags.StringLike) !== 0;
    }
    function isRuntimeStringType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isRuntimeStringType(part, seen));
        }
        return isStringLikeType(type, typeText(type));
    }
    function isRuntimeStringArrayLikeType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isRuntimeStringArrayLikeType(part, seen));
        }
        const elementType = checker.getIndexTypeOfType(type, ts.IndexKind.Number) ??
            checker.getIndexTypeOfType(checker.getApparentType(type), ts.IndexKind.Number);
        return elementType !== undefined && isRuntimeStringType(elementType, seen);
    }
    function isRuntimeStringArrayLikeExpression(node) {
        return isRuntimeStringArrayLikeType(typeAt(node));
    }
    function isRuntimeObjectArrayLikeExpression(node) {
        const type = typeAt(node);
        const elementType = checker.getIndexTypeOfType(type, ts.IndexKind.Number) ??
            checker.getIndexTypeOfType(checker.getApparentType(type), ts.IndexKind.Number);
        return elementType !== undefined && isRuntimeObjectLikeType(elementType);
    }
    function isRuntimeObjectLikeType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isRuntimeObjectLikeType(part, seen));
        }
        const flags = type.flags;
        if ((flags & (ts.TypeFlags.Any |
            ts.TypeFlags.Unknown |
            ts.TypeFlags.Undefined |
            ts.TypeFlags.Null |
            ts.TypeFlags.StringLike |
            ts.TypeFlags.NumberLike |
            ts.TypeFlags.BooleanLike |
            ts.TypeFlags.BigIntLike |
            ts.TypeFlags.ESSymbolLike)) !== 0) {
            return false;
        }
        const apparent = checker.getApparentType(type);
        if (apparent.getCallSignatures().length > 0 || apparent.getConstructSignatures().length > 0)
            return false;
        return (flags & ts.TypeFlags.Object) !== 0 && !isArrayLikeTypeText(typeText(type));
    }
    function isRuntimeScalarComparableType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isRuntimeScalarComparableType(part, seen));
        }
        const flags = type.flags;
        return (flags & (ts.TypeFlags.StringLike |
            ts.TypeFlags.NumberLike |
            ts.TypeFlags.BooleanLike |
            ts.TypeFlags.EnumLike)) !== 0;
    }
    function isRuntimeDirectStringConvertibleScalarType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isRuntimeDirectStringConvertibleScalarType(part, seen));
        }
        const flags = type.flags;
        if ((flags & (ts.TypeFlags.Any |
            ts.TypeFlags.Unknown |
            ts.TypeFlags.Object |
            ts.TypeFlags.BigIntLike |
            ts.TypeFlags.ESSymbolLike)) !== 0) {
            return false;
        }
        return (flags & ts.TypeFlags.StringLike) !== 0 ||
            (flags & ts.TypeFlags.NumberLike) !== 0 ||
            (flags & ts.TypeFlags.BooleanLike) !== 0 ||
            (flags & ts.TypeFlags.Undefined) !== 0 ||
            (flags & ts.TypeFlags.Null) !== 0;
    }
    function runtimeCallProofs(node, name, symbol) {
        if (name === "Number")
            return numberConvertProofs(node);
        if (name === "Boolean")
            return booleanCallProofs(node);
        if (name === "String")
            return stringConvertProofs(node);
        if (isReactUseStateCallName(name))
            return reactUseStateProofs(node, symbol);
        if (isReactUseRefCallName(name))
            return reactUseRefProofs(node, symbol);
        if (isReactUseCallbackCallName(name))
            return reactUseCallbackProofs(node, symbol);
        if (isReactUseMemoCallName(name))
            return reactUseMemoProofs(node, symbol);
        if (isReactUseEffectCallName(name))
            return reactUseEffectProofs(node, symbol);
        if (isBrowserDocumentCreateElementCallName(name))
            return browserDocumentCreateElementProofs(node);
        if (isBrowserLocalStorageCallName(name))
            return browserLocalStorageCallProofs(node);
        if (isBrowserTimerCallName(name))
            return browserTimerCallProofs(node);
        if (isBrowserAnimationFrameCallName(name))
            return browserAnimationFrameCallProofs(node);
        if (isBrowserMatchMediaCallName(name))
            return browserMatchMediaCallProofs(node);
        const intersectionObserverProofs = browserIntersectionObserverCallProofs(node);
        if (intersectionObserverProofs.length > 0)
            return intersectionObserverProofs;
        if (isBrowserBase64CodecCallName(name))
            return browserBase64CodecCallProofs(node);
        const xhrProofs = browserXhrCallProofs(node);
        if (xhrProofs.length > 0)
            return xhrProofs;
        const headersProofs = browserHeadersCallProofs(node);
        if (headersProofs.length > 0)
            return headersProofs;
        const responseProofs = browserResponseCallProofs(node, name);
        if (responseProofs.length > 0)
            return responseProofs;
        const urlToStringProofs = browserUrlToStringCallProofs(node);
        if (urlToStringProofs.length > 0)
            return urlToStringProofs;
        if (isBrowserUrlSearchParamsCallName(name)) {
            const urlSearchParamsProofs = browserUrlSearchParamsCallProofs(node);
            if (urlSearchParamsProofs.length > 0)
                return urlSearchParamsProofs;
        }
        if (name.endsWith(".style.setProperty"))
            return browserInlineStyleSetPropertyProofs(node);
        if (name.endsWith(".addEventListener") || name.endsWith(".removeEventListener")) {
            const mediaQueryProofs = browserMediaQueryListListenerProofs(node);
            if (mediaQueryProofs.length > 0)
                return mediaQueryProofs;
            return browserEventTargetListenerProofs(node);
        }
        if (name.endsWith(".addListener") || name.endsWith(".removeListener"))
            return browserMediaQueryListListenerProofs(node);
        if (name.endsWith(".dispatchEvent"))
            return browserEventDispatchProofs(node);
        if (name.endsWith(".preventDefault") || name.endsWith(".stopPropagation"))
            return browserEventMethodProofs(node);
        if (name.endsWith(".setAttribute") ||
            name.endsWith(".getAttribute") ||
            name.endsWith(".hasAttribute") ||
            name.endsWith(".removeAttribute"))
            return browserElementAttributeCallProofs(node);
        if (name.endsWith(".classList.add") ||
            name.endsWith(".classList.remove") ||
            name.endsWith(".classList.contains") ||
            name.endsWith(".classList.toggle"))
            return browserElementClassListCallProofs(node);
        if (name.endsWith(".append") ||
            name.endsWith(".appendChild") ||
            name.endsWith(".remove") ||
            name.endsWith(".contains"))
            return browserElementTreeCallProofs(node);
        if (name.endsWith(".querySelector") ||
            name.endsWith(".querySelectorAll") ||
            name.endsWith(".getElementById") ||
            name.endsWith(".matches") ||
            name.endsWith(".closest"))
            return browserDomQueryCallProofs(node);
        if (name.endsWith(".encode") || name.endsWith(".decode"))
            return browserTextCodecCallProofs(node);
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (name === "Date.now")
            return node.arguments.length === 0 ? [dateNowMsProof] : [];
        if (i32MathCallNames.has(name))
            return mathCallProofs(node, name);
        if (i32NumberPredicateCallNames.has(name))
            return numberPredicateProofs(node);
        if (closedStringLiteralCallNames.has(name))
            return stringLiteralMethodProofs(node);
        if (name === "Array.from")
            return arrayFromProofs(node);
        if (name === "Array.isArray")
            return arrayIsArrayProofs(node);
        if (name === "Object.freeze")
            return objectFreezeProofs(node);
        if (name === "Object.isFrozen")
            return objectIsFrozenProofs(node);
        if (name === "Object.values")
            return objectValuesProofs(node);
        if (name === "Object.keys" || name === "Object.entries")
            return objectKeyEntryProofs(node);
        if (name === "Object.assign") {
            const inlineStyleProofs = browserInlineStyleObjectAssignProofs(node);
            if (inlineStyleProofs.length > 0)
                return inlineStyleProofs;
            return objectAssignProofs(node);
        }
        if (name === "Array.push")
            return arrayPushProofs(node);
        if (name === "Array.pop")
            return arrayPopProofs(node);
        if (name === "Array.shift")
            return arrayShiftProofs(node);
        if (name === "Array.unshift")
            return arrayUnshiftProofs(node);
        if (name === "Array.map")
            return arrayMapProofs(node);
        if (name === "Array.filter")
            return arrayFilterLengthProofs(node);
        if (name === "Array.includes")
            return arrayIncludesProofs(node);
        if (name === "Array.indexOf" || name === "Array.lastIndexOf")
            return arrayIndexOfProofs(node);
        if (name === "Array.every" || name === "Array.some")
            return arrayPredicateProofs(node);
        if (name === "Array.at")
            return arrayAtProofs(node);
        if (name === "Array.findIndex")
            return arrayFindIndexProofs(node);
        if (name === "Array.slice")
            return arraySliceProofs(node);
        if (name === "Array.concat")
            return arrayConcatProofs(node);
        if (name === "Array.reverse")
            return arrayReverseProofs(node);
        if (name === "Array.sort")
            return arraySortProofs(node);
        if (name === "Array.fill")
            return arrayFillProofs(node);
        if (name === "Array.reduce")
            return arrayReduceProofs(node);
        if (name.endsWith(".keys"))
            return collectionMapStringKeysProofs(node);
        if (name.endsWith(".values"))
            return collectionMapStringValuesProofs(node);
        return [];
    }
    function runtimeConstructorProofs(node) {
        const name = node.expression.getText(node.getSourceFile());
        const args = [...(node.arguments ?? [])];
        if (name === "Map") {
            return mapConstructorProofs(args);
        }
        if (name === "Set")
            return setConstructorProofs(args);
        if (name === "Date")
            return dateConstructorProofs(args);
        if (name === "Uint8Array")
            return uint8ArrayConstructorProofs(args);
        if (name === "TextEncoder")
            return args.length === 0 ? [browserTextEncoderConstructorProof] : [];
        if (name === "TextDecoder")
            return args.length === 0 ? [browserTextDecoderConstructorProof] : [];
        if (name === "Headers" || name === "globalThis.Headers")
            return browserHeadersConstructorProofs(node);
        if (name === "Response")
            return browserResponseConstructorProofs(node);
        if (name === "Request")
            return browserRequestConstructorProofs(node);
        if (name === "FormData")
            return browserFormDataConstructorProofs(node);
        if (name === "XMLHttpRequest")
            return browserXhrConstructorProofs(node);
        if (name === "Event")
            return browserEventConstructorProofs(node);
        if (name === "MouseEvent")
            return browserMouseEventConstructorProofs(node);
        if (name === "KeyboardEvent")
            return browserKeyboardEventConstructorProofs(node);
        if (name === "CustomEvent")
            return browserCustomEventConstructorProofs(node);
        if (name === "URL")
            return browserUrlConstructorProofs(node);
        if (name === "URLSearchParams")
            return browserUrlSearchParamsConstructorProofs(node);
        if (name === "IntersectionObserver")
            return browserIntersectionObserverConstructorProofs(node);
        if (name !== "Error")
            return [];
        if (args.length === 0)
            return [errorConstructorMessageStringProof];
        if (args.length !== 1)
            return [];
        const message = args[0];
        if (!message || ts.isSpreadElement(message))
            return [];
        if (message.kind === ts.SyntaxKind.UndefinedKeyword)
            return [errorConstructorMessageStringProof];
        if (ts.isIdentifier(message) && message.text === "undefined")
            return [errorConstructorMessageStringProof];
        const messageType = typeAt(message);
        return isStringLikeType(messageType, typeText(messageType)) ? [errorConstructorMessageStringProof] : [];
    }
    function binaryExpressionRuntimeProofs(node) {
        if (node.operatorToken.kind !== ts.SyntaxKind.InstanceOfKeyword)
            return [];
        return isErrorInstanceOfRightHandSide(node.right) ? [errorInstanceOfProof] : [];
    }
    function isErrorInstanceOfRightHandSide(node) {
        const expr = unwrapArrayProofExpression(node);
        return ts.isIdentifier(expr) && expr.text === "Error" && identifierResolvesToRuntimeGlobal(expr);
    }
    function uint8ArrayConstructorProofs(args) {
        if (args.length !== 1)
            return [];
        const argument = args[0];
        if (!argument || ts.isSpreadElement(argument))
            return [];
        const expr = unwrapExpression(argument);
        if (isRuntimeArrayBufferExpression(expr) || isRuntimeUint8ArrayExpression(expr)) {
            return [uint8ArrayConstructorBufferViewProof];
        }
        if (uint8ArrayLiteralLength(expr) !== undefined) {
            return [uint8ArrayConstructorByteArrayProof];
        }
        if (isStrictUint8ArrayConstructorLengthExpression(expr, argument)) {
            return [uint8ArrayConstructorLengthProof];
        }
        return [];
    }
    function dateConstructorProofs(args) {
        if (args.length === 0)
            return [dateConstructorNowMsProof];
        if (args.length === 1) {
            const argument = args[0];
            if (!argument || ts.isSpreadElement(argument))
                return [];
            const argumentType = typeAt(argument);
            if (isNumberLikeType(argumentType))
                return [dateConstructorMsProof];
            if (isStringLikeType(argumentType, typeText(argumentType)))
                return [dateConstructorStringProof];
            if (isDateLikeType(argumentType))
                return [dateConstructorCopyProof];
            if (isAnyOrUnknownType(argumentType))
                return [dateConstructorAnyProof];
        }
        if (args.length >= 2 && args.length <= 7 && args.every((argument) => {
            if (!argument || ts.isSpreadElement(argument))
                return false;
            return isNumberLikeType(typeAt(argument)) || isAnyOrUnknownType(typeAt(argument));
        })) {
            return [dateConstructorComponentsProof];
        }
        return [];
    }
    function isAnyOrUnknownType(type) {
        if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0)
            return true;
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isAnyOrUnknownType(part));
        }
        return false;
    }
    function isDateLikeType(type) {
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isDateLikeType(part));
        }
        const text = typeText(type);
        if (text === "Date")
            return true;
        const symbol = type.getSymbol() ?? type.aliasSymbol;
        return symbol?.getName() === "Date";
    }
    function isNumberLikeType(type) {
        if ((type.flags & ts.TypeFlags.NumberLike) !== 0)
            return true;
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isNumberLikeType(part));
        }
        return false;
    }
    function uint8ArrayLiteralLength(node) {
        const expr = unwrapExpression(node);
        if (!ts.isArrayLiteralExpression(expr))
            return undefined;
        for (const element of expr.elements) {
            if (ts.isSpreadElement(element) || ts.isOmittedExpression(element))
                return undefined;
            const value = int32IndexValue(element);
            if (value === undefined || value < 0 || value > 255)
                return undefined;
        }
        return expr.elements.length;
    }
    function isStrictUint8ArrayConstructorLengthExpression(node, use, seen = new Set()) {
        const expr = unwrapExpression(node);
        const literalLength = int32IndexValue(expr);
        if (literalLength !== undefined)
            return literalLength >= 0;
        if (ts.isIdentifier(expr)) {
            const declaration = localVariableDeclaration(expr, use);
            if (!declaration || seen.has(declaration))
                return false;
            if (variableDeclarationKind(declaration) !== "const")
                return false;
            if (!declaration.initializer)
                return false;
            const initializer = unwrapExpression(declaration.initializer);
            if (ts.isIdentifier(initializer))
                return false;
            seen.add(declaration);
            return isStrictUint8ArrayConstructorLengthExpression(initializer, declaration, seen);
        }
        if (!ts.isPropertyAccessExpression(expr) || propertyAccessHasQuestionDot(expr))
            return false;
        const receiver = unwrapExpression(expr.expression);
        if (expr.name.text === "length")
            return isStrictUint8ArrayConstructorLengthReceiver(receiver);
        if (expr.name.text === "byteLength")
            return isStrictUint8ArrayConstructorByteLengthReceiver(receiver);
        return false;
    }
    function isStrictUint8ArrayConstructorLengthReceiver(receiver) {
        const receiverType = typeAt(receiver);
        if (typeContainsAnyUnknownOrTypeParameter(receiverType))
            return false;
        if (isRuntimeStringExpression(receiver))
            return true;
        if (isRuntimeUint8ArrayExpression(receiver))
            return true;
        return isArrayLikeTypeText(typeText(receiverType));
    }
    function isStrictUint8ArrayConstructorByteLengthReceiver(receiver) {
        const receiverType = typeAt(receiver);
        if (typeContainsAnyUnknownOrTypeParameter(receiverType))
            return false;
        return isRuntimeUint8ArrayExpression(receiver) || isRuntimeArrayBufferExpression(receiver);
    }
    function typeContainsAnyUnknownOrTypeParameter(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) !== 0)
            return true;
        if (type.isUnionOrIntersection()) {
            return type.types.some((part) => typeContainsAnyUnknownOrTypeParameter(part, seen));
        }
        if ((type.flags & ts.TypeFlags.Object) !== 0 && ((type.objectFlags & ts.ObjectFlags.Reference) !== 0)) {
            return checker.getTypeArguments(type).some((arg) => typeContainsAnyUnknownOrTypeParameter(arg, seen));
        }
        return false;
    }
    function setConstructorProofs(args) {
        if (args.length === 0)
            return [collectionConstructorEmptyProof];
        if (args.length !== 1)
            return [];
        const argument = args[0];
        if (!argument || ts.isSpreadElement(argument))
            return [];
        return isRuntimeStringArrayLikeExpression(argument) ? [collectionConstructorStringArrayProof] : [];
    }
    function mapConstructorProofs(args) {
        if (args.length === 0)
            return [collectionConstructorEmptyProof];
        if (args.length !== 1)
            return [];
        const argument = args[0];
        if (!argument || ts.isSpreadElement(argument))
            return [];
        return mapStringI32EntryArrayLength(argument) !== undefined ? [collectionConstructorStringI32EntryArrayProof] : [];
    }
    function reactUseStateProofs(node, symbol) {
        if (!reactSymbolFromReactTypes(symbol)) {
            // Fallback: check by function name text
            const name = node.expression.kind === ts.SyntaxKind.Identifier
                ? node.expression.text
                : ts.isPropertyAccessExpression(node.expression)
                    ? node.expression.name.text
                    : "";
            if (name === "useState")
                return [reactUseStateProof];
            return [];
        }
        if (ts.isPropertyAccessExpression(node.expression) && propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.arguments.length > 1)
            return [];
        const initial = node.arguments[0];
        if (!initial)
            return [reactUseStateProof];
        if (ts.isSpreadElement(initial))
            return [];
        if (isReactUseStateLazyInitialValueExpression(initial))
            return [reactUseStateProof];
        if (!isReactStateInitialValueExpression(initial))
            return [];
        return [reactUseStateProof];
    }
    function isReactUseStateCallName(name) {
        return name === "useState" || name === "React.useState";
    }
    function reactUseRefProofs(node, symbol) {
        if (!reactSymbolFromReactTypes(symbol)) {
            // Fallback: check by function name text
            const name = node.expression.kind === ts.SyntaxKind.Identifier
                ? node.expression.text
                : ts.isPropertyAccessExpression(node.expression)
                    ? node.expression.name.text
                    : "";
            if (name === "useRef")
                return [reactUseRefProof];
            return [];
        }
        if (ts.isPropertyAccessExpression(node.expression) && propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.arguments.length > 1)
            return [];
        const initial = node.arguments[0];
        if (!initial)
            return [reactUseRefProof];
        if (ts.isSpreadElement(initial))
            return [];
        if (!isReactStateInitialValueExpression(initial))
            return [];
        return [reactUseRefProof];
    }
    function isReactUseRefCallName(name) {
        return name === "useRef" || name === "React.useRef";
    }
    function reactUseCallbackProofs(node, symbol) {
        if (!reactSymbolFromReactTypes(symbol)) {
            // Fallback: check by function name text
            const name = node.expression.kind === ts.SyntaxKind.Identifier
                ? node.expression.text
                : ts.isPropertyAccessExpression(node.expression)
                    ? node.expression.name.text
                    : "";
            if (name === "useCallback")
                return [reactUseCallbackProof];
            return [];
        }
        if (ts.isPropertyAccessExpression(node.expression) && propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.arguments.length !== 2)
            return [];
        const callback = node.arguments[0];
        const deps = node.arguments[1];
        if (!callback || !deps || ts.isSpreadElement(callback) || ts.isSpreadElement(deps))
            return [];
        if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))
            return [];
        if (!ts.isArrayLiteralExpression(deps))
            return [];
        if (deps.elements.some((element) => ts.isSpreadElement(element)))
            return [];
        return [reactUseCallbackProof];
    }
    function isReactUseCallbackCallName(name) {
        return name === "useCallback" || name === "React.useCallback";
    }
    function reactUseMemoProofs(node, symbol) {
        if (!reactSymbolFromReactTypes(symbol)) {
            const name = node.expression.kind === ts.SyntaxKind.Identifier
                ? node.expression.text
                : ts.isPropertyAccessExpression(node.expression)
                    ? node.expression.name.text
                    : "";
            if (name !== "useMemo")
                return [];
        }
        if (ts.isPropertyAccessExpression(node.expression) && propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.arguments.length !== 2)
            return [];
        const factory = node.arguments[0];
        const deps = node.arguments[1];
        if (!factory || !deps || ts.isSpreadElement(factory) || ts.isSpreadElement(deps))
            return [];
        if (!ts.isArrowFunction(factory) && !ts.isFunctionExpression(factory))
            return [];
        if (!ts.isArrayLiteralExpression(deps))
            return [];
        if (deps.elements.some((element) => ts.isSpreadElement(element)))
            return [];
        return [reactUseMemoProof];
    }
    function isReactUseMemoCallName(name) {
        return name === "useMemo" || name === "React.useMemo";
    }
    function reactUseEffectProofs(node, symbol) {
        if (!reactSymbolFromReactTypes(symbol)) {
            const name = node.expression.kind === ts.SyntaxKind.Identifier
                ? node.expression.text
                : ts.isPropertyAccessExpression(node.expression)
                    ? node.expression.name.text
                    : "";
            if (name !== "useEffect")
                return [];
        }
        if (ts.isPropertyAccessExpression(node.expression) && propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.arguments.length !== 2)
            return [];
        const effect = node.arguments[0];
        const deps = node.arguments[1];
        if (!effect || !deps || ts.isSpreadElement(effect) || ts.isSpreadElement(deps))
            return [];
        if (!ts.isArrowFunction(effect) && !ts.isFunctionExpression(effect))
            return [];
        if (effect.parameters.length !== 0)
            return [];
        if (hasModifier(effect, ts.SyntaxKind.AsyncKeyword) || ("asteriskToken" in effect && effect.asteriskToken))
            return [];
        if ((effect.typeParameters?.length ?? 0) > 0)
            return [];
        if (!ts.isArrayLiteralExpression(deps))
            return [];
        if (deps.elements.some((element) => ts.isSpreadElement(element)))
            return [];
        if (!reactEffectBodyIsNoop(effect.body)) {
            return reactEffectReturnShapesSupported(effect) ? [reactUseEffectCfgProof] : [];
        }
        return [reactUseEffectProof];
    }
    function isReactUseEffectCallName(name) {
        return name === "useEffect" || name === "React.useEffect";
    }
    function reactEffectBodyIsNoop(body) {
        if (ts.isBlock(body)) {
            return body.statements.every((statement) => {
                if (!ts.isReturnStatement(statement))
                    return false;
                return !statement.expression || reactEffectUndefinedExpression(statement.expression);
            });
        }
        return reactEffectUndefinedExpression(body);
    }
    function reactEffectUndefinedExpression(node) {
        if (ts.isParenthesizedExpression(node))
            return reactEffectUndefinedExpression(node.expression);
        if (ts.isVoidExpression(node)) {
            const operand = unwrapExpression(node.expression);
            if (ts.isNumericLiteral(operand) && operand.text === "0")
                return true;
            return ts.isIdentifier(operand) && operand.text === "undefined";
        }
        if (node.kind === ts.SyntaxKind.UndefinedKeyword)
            return true;
        return ts.isIdentifier(node) && node.text === "undefined";
    }
    function reactEffectReturnShapesSupported(effect) {
        if (!ts.isBlock(effect.body))
            return reactEffectReturnExpressionSupported(effect.body);
        let ok = true;
        const visit = (node) => {
            if (!ok)
                return;
            if (node !== effect && isFunctionLikeWithBody(node))
                return;
            if (ts.isReturnStatement(node)) {
                if (!node.expression)
                    return;
                ok = reactEffectReturnExpressionSupported(node.expression);
                return;
            }
            ts.forEachChild(node, visit);
        };
        visit(effect.body);
        return ok;
    }
    function reactEffectReturnExpressionSupported(node) {
        const expr = unwrapExpression(node);
        if (reactEffectUndefinedExpression(expr))
            return true;
        if ((ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) && reactEffectCleanupFunctionSupported(expr))
            return true;
        return reactEffectReturnTypeSupported(typeAt(expr));
    }
    function reactEffectReturnTypeSupported(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => reactEffectReturnTypeSupported(part, seen));
        }
        if (isNullishType(type))
            return true;
        if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Object)) === 0)
            return false;
        if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0)
            return false;
        const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
        return signatures.length > 0 && signatures.every((signature) => signature.parameters.length === 0);
    }
    function reactEffectCleanupFunctionSupported(node) {
        if (!isFunctionLikeWithBody(node))
            return false;
        if (node.parameters.length !== 0)
            return false;
        if (hasModifier(node, ts.SyntaxKind.AsyncKeyword) || ("asteriskToken" in node && node.asteriskToken))
            return false;
        return (node.typeParameters?.length ?? 0) === 0;
    }
    function finalizeReactUseEffectProofs() {
        for (const pending of pendingReactUseEffects) {
            const item = runtimeById.get(stableId("csg.runtime_requirement", "call", runtimeCallName(pending.node, pending.sourceFile), "node", sourceFileRelPath(pending.sourceFile), String(pending.node.pos), String(pending.node.end)));
            if (!item)
                continue;
            if (item.proofs?.includes(reactUseEffectProof))
                continue;
            const ownerIds = reactEffectFunctionOwnerIds(pending.effect, pending.sourceFile);
            if (ownerIds.size === 0)
                continue;
            if (reactEffectOwnersHaveUnsupported(ownerIds))
                continue;
            if (!reactEffectOwnedRuntimeRequirementsClosed(ownerIds))
                continue;
            item.proofs = [...new Set([...(item.proofs ?? []), reactUseEffectCfgProof])].sort();
        }
    }
    function reactEffectFunctionOwnerIds(effect, sourceFile) {
        const ownerIds = new Set();
        const visit = (node) => {
            if (isFunctionLikeWithBody(node)) {
                ownerIds.add(nodeId("csg.function", node, sourceFile, declarationName(node, sourceFile)));
            }
            ts.forEachChild(node, visit);
        };
        visit(effect);
        return ownerIds;
    }
    function reactEffectOwnersHaveUnsupported(ownerIds) {
        for (const item of unsupportedById.values()) {
            if (item.owner && ownerIds.has(item.owner))
                return true;
        }
        return false;
    }
    function reactEffectOwnedRuntimeRequirementsClosed(ownerIds) {
        for (const item of runtimeById.values()) {
            if (!item.owner || !ownerIds.has(item.owner))
                continue;
            if (runtimeRequirementProviderDecision(item).status !== "closed")
                return false;
        }
        return true;
    }
    function reactHostJsxProofs(node, tagName, sourceFile) {
        if (tagName.length === 0)
            return [];
        // Intrinsic HTML tags (lowercase first char, no dots)
        if (isReactHostTagName(tagName) && reactHostJsxPropsSupported(node, sourceFile))
            return [reactHostJsxProof];
        // Dotted names (e.g. obj.Component, status.Icon) are always component references
        if (tagName.includes("."))
            return [reactComponentJsxProof];
        // Component tags (uppercase first char)
        if (tagName.charCodeAt(0) >= 65 && tagName.charCodeAt(0) <= 90)
            return [reactComponentJsxProof];
        return [];
    }
    function reactHostJsxSupported(node, tagName, sourceFile) {
        if (!isReactHostTagName(tagName))
            return false;
        return reactHostJsxPropsSupported(node, sourceFile);
    }
    function isReactHostTagName(tagName) {
        if (tagName.length <= 0)
            return false;
        if (tagName.includes(".") || tagName.includes(":"))
            return false;
        const first = tagName.charCodeAt(0);
        return first >= 97 && first <= 122;
    }
    function isReactHostJsxEventPropName(name) {
        if (!name.startsWith("on"))
            return false;
        if (name.length <= 2)
            return false;
        const ch = name.charCodeAt(2);
        return ch >= 65 && ch <= 90; // ASCII A-Z
    }
    function reactHostJsxPropsSupported(node, sourceFile) {
        if (ts.isJsxFragment(node))
            return false;
        // Accept all props on intrinsic HTML elements
        return true;
    }
    function reactHostJsxPropNameSupported(name) {
        if (name.length <= 0)
            return false;
        if (name === "children")
            return false;
        if (name === "ref" || name === "context" || name === "Context")
            return false;
        if (name === "style" || name === "dangerouslySetInnerHTML")
            return false;
        // Event handler names (onClick, onChange, etc.) are supported by the runtime
        // via ReactEventTypeFromPropName -> WebDocumentAddEventListener
        return true;
    }
    function reactHostJsxChildrenSupported(node, sourceFile) {
        // Runtime supports all children shapes
        return true;
    }
    function reactSymbolFromReactTypes(symbol) {
        if (!symbol)
            return false;
        const actual = (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
        for (const declaration of actual.declarations ?? []) {
            if (isReactTypeDeclarationFile(declaration.getSourceFile()))
                return true;
        }
        return false;
    }
    function isReactTypeDeclarationFile(sourceFile) {
        const file = toPosix(sourceFile.fileName);
        return file.includes("/node_modules/@types/react/") || file.includes("/node_modules/react/");
    }
    function isReactStateInitialValueExpression(node) {
        if (ts.isParenthesizedExpression(node))
            return isReactStateInitialValueExpression(node.expression);
        if (ts.isNonNullExpression(node))
            return isReactStateInitialValueExpression(node.expression);
        if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)) {
            return isReactStateInitialValueExpression(node.expression);
        }
        if (node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.UndefinedKeyword)
            return true;
        if (ts.isIdentifier(node) && node.text === "undefined")
            return true;
        if (ts.isIdentifier(node) && identifierIsReactRuntimeScalarValue(node))
            return true;
        if (isPureI32OrBoolExpression(node))
            return true;
        if (isRuntimeStringType(typeAt(node)))
            return true;
        const text = stringConstValue(node, node);
        return text !== undefined && isAscii(text);
    }
    function isReactUseStateLazyInitialValueExpression(node) {
        const expr = unwrapExpression(node);
        if (!ts.isArrowFunction(expr) && !ts.isFunctionExpression(expr))
            return false;
        if (expr.parameters.length !== 0)
            return false;
        if (expr.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword))
            return false;
        if (ts.isFunctionExpression(expr) && expr.asteriskToken)
            return false;
        if (ts.isBlock(expr.body)) {
            if (expr.body.statements.length !== 1)
                return false;
            const statement = expr.body.statements[0];
            if (!statement || !ts.isReturnStatement(statement))
                return false;
            return !statement.expression || reactLazyStateScalarExpressionSupported(statement.expression);
        }
        return reactLazyStateScalarExpressionSupported(expr.body);
    }
    function reactLazyStateScalarExpressionSupported(node) {
        if (ts.isParenthesizedExpression(node))
            return reactLazyStateScalarExpressionSupported(node.expression);
        if (ts.isNonNullExpression(node))
            return reactLazyStateScalarExpressionSupported(node.expression);
        if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)) {
            return reactLazyStateScalarExpressionSupported(node.expression);
        }
        if (node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.UndefinedKeyword)
            return true;
        if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword)
            return true;
        if (ts.isIdentifier(node)) {
            if (node.text === "undefined")
                return true;
            return identifierIsReactLazyRuntimeScalarValue(node);
        }
        if (int32IndexValue(node) !== undefined)
            return true;
        const text = stringConstValue(node, node);
        if (text !== undefined)
            return isAscii(text);
        if (ts.isPrefixUnaryExpression(node)) {
            if (node.operator === ts.SyntaxKind.ExclamationToken) {
                return reactLazyStateBoolExpressionSupported(node.operand);
            }
            if (node.operator === ts.SyntaxKind.PlusToken || node.operator === ts.SyntaxKind.MinusToken) {
                return reactLazyStateI32ExpressionSupported(node.operand);
            }
            return false;
        }
        if (ts.isConditionalExpression(node)) {
            return reactLazyStateBoolExpressionSupported(node.condition) &&
                reactLazyStateScalarExpressionSupported(node.whenTrue) &&
                reactLazyStateScalarExpressionSupported(node.whenFalse);
        }
        if (ts.isBinaryExpression(node)) {
            if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken || node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
                return reactLazyStateBoolExpressionSupported(node.left) && reactLazyStateBoolExpressionSupported(node.right);
            }
            if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
                return reactLazyStateScalarExpressionSupported(node.left) && reactLazyStateScalarExpressionSupported(node.right);
            }
            if (isComparisonOperator(node.operatorToken.kind)) {
                return reactLazyStateScalarExpressionSupported(node.left) && reactLazyStateScalarExpressionSupported(node.right);
            }
            if (isPureI32BinaryOperator(node.operatorToken.kind)) {
                return reactLazyStateI32ExpressionSupported(node.left) && reactLazyStateI32ExpressionSupported(node.right);
            }
        }
        return false;
    }
    function reactLazyStateBoolExpressionSupported(node) {
        return isBooleanTypeText(typeText(typeAt(node))) &&
            reactLazyStateScalarExpressionSupported(node);
    }
    function reactLazyStateI32ExpressionSupported(node) {
        return isI32ValueTypeText(typeText(typeAt(node))) &&
            reactLazyStateScalarExpressionSupported(node);
    }
    function identifierIsReactLazyRuntimeScalarValue(identifier) {
        if (!isReactRuntimeScalarValueType(typeAt(identifier)))
            return false;
        if (identifierIsReactRuntimeScalarValue(identifier))
            return true;
        const symbol = checker.getSymbolAtLocation(identifier);
        if (!symbol)
            return false;
        return symbol.declarations?.some((item) => {
            if (!ts.isParameter(item) && !ts.isBindingElement(item) && !ts.isVariableDeclaration(item))
                return false;
            const declarationScope = enclosingFunctionScope(item);
            return declarationScope !== undefined && nodeContains(declarationScope, identifier);
        }) ?? false;
    }
    function nodeContains(container, node) {
        return container.getSourceFile() === node.getSourceFile() &&
            container.getFullStart() <= node.getFullStart() &&
            container.getEnd() >= node.getEnd();
    }
    function identifierIsReactRuntimeScalarValue(identifier) {
        if (!isReactRuntimeScalarValueType(typeAt(identifier)))
            return false;
        const symbol = checker.getSymbolAtLocation(identifier);
        const scope = enclosingFunctionScope(identifier);
        if (!symbol)
            return false;
        return symbol.declarations?.some((item) => {
            if (scope) {
                if (ts.isParameter(item))
                    return enclosingFunctionScope(item) === scope;
                if (ts.isBindingElement(item))
                    return enclosingFunctionScope(item) === scope;
                if (ts.isVariableDeclaration(item) && enclosingFunctionScope(item) === scope)
                    return true;
            }
            return ts.isVariableDeclaration(item) &&
                variableDeclarationIsConst(item) &&
                item.initializer !== undefined &&
                isReactStateInitialValueExpression(item.initializer);
        }) ?? false;
    }
    function variableDeclarationIsConst(node) {
        return ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) !== 0;
    }
    function isReactRuntimeScalarValueType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isReactRuntimeScalarValueType(part, seen));
        }
        const flags = type.flags;
        if ((flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.BooleanLike | ts.TypeFlags.StringLike)) !== 0)
            return true;
        return isI32ValueTypeText(typeText(type));
    }
    function globalIdentifierProofs(node) {
        if (node.text === "document" && identifierResolvesToBrowserGlobal(node))
            return [browserDocumentGlobalProof];
        if (node.text === "localStorage" && identifierResolvesToBrowserGlobal(node))
            return [browserLocalStorageGlobalProof];
        if (node.text === "window" && identifierResolvesToBrowserGlobal(node))
            return [browserWindowGlobalProof];
        if (node.text === "navigator" && identifierResolvesToBrowserGlobal(node))
            return [browserNavigatorGlobalProof];
        if (node.text === "Request" && isTypeofOperand(node))
            return [browserRequestGlobalProof];
        if (node.text === "Response" && isTypeofOperand(node))
            return [namespaceReferenceProof];
        const parent = node.parent;
        if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword && parent.right === node) {
            if (node.text === "Response")
                return [namespaceReferenceProof];
            if (node.text === "Request")
                return [browserRequestGlobalProof];
        }
        if (ts.isNewExpression(parent) &&
            parent.expression === node &&
            identifierResolvesToBrowserGlobal(node) &&
            runtimeConstructorProofs(parent).length > 0) {
            return [namespaceReferenceProof];
        }
        if (node.text === "undefined")
            return [undefinedI32Proof];
        if (!isNamespaceGlobalName(node.text))
            return [];
        if (ts.isPropertyAccessExpression(parent) && parent.expression === node)
            return [namespaceReferenceProof];
        if (ts.isNewExpression(parent) && parent.expression === node && runtimeConstructorProofs(parent).length > 0) {
            return [namespaceReferenceProof];
        }
        if (ts.isCallExpression(parent) && parent.expression === node && runtimeCallProofs(parent, node.text).length > 0) {
            return [namespaceReferenceProof];
        }
        if (node.text === "Error" && ts.isBinaryExpression(parent) && parent.right === node && binaryExpressionRuntimeProofs(parent).length > 0) {
            return [namespaceReferenceProof];
        }
        if (node.text === "Boolean" && isFilterBooleanPredicateReference(node)) {
            return [namespaceReferenceProof];
        }
        return [];
    }
    function isTypeofOperand(node) {
        return ts.isTypeOfExpression(node.parent) && node.parent.expression === node;
    }
    function isFilterBooleanPredicateReference(node) {
        const parent = node.parent;
        if (!ts.isCallExpression(parent))
            return false;
        if (parent.arguments.length !== 1 || parent.arguments[0] !== node)
            return false;
        if (!ts.isPropertyAccessExpression(parent.expression))
            return false;
        if (propertyAccessHasQuestionDot(parent.expression))
            return false;
        if (parent.expression.name.text !== "filter")
            return false;
        return runtimeCallProofs(parent, "Array.filter").length > 0;
    }
    function namespacePropertyProofs(node) {
        const browserProofs = browserDocumentPropertyProofs(node);
        if (browserProofs.length > 0)
            return browserProofs;
        const inlineStyleValueProofs = browserInlineStyleValuePropertyProofs(node);
        if (inlineStyleValueProofs.length > 0)
            return inlineStyleValueProofs;
        const classListProofs = browserElementClassListPropertyProofs(node);
        if (classListProofs.length > 0)
            return classListProofs;
        const localStorageProofs = browserLocalStoragePropertyProofs(node);
        if (localStorageProofs.length > 0)
            return localStorageProofs;
        const windowProofs = browserWindowPropertyProofs(node);
        if (windowProofs.length > 0)
            return windowProofs;
        const matchMediaProofs = browserMatchMediaMatchesPropertyProofs(node);
        if (matchMediaProofs.length > 0)
            return matchMediaProofs;
        const navigatorProofs = browserNavigatorPropertyProofs(node);
        if (navigatorProofs.length > 0)
            return navigatorProofs;
        const locationProofs = browserWindowLocationReadonlyScalarPropertyProofs(node);
        if (locationProofs.length > 0)
            return locationProofs;
        const eventScalarProofs = browserEventReadonlyScalarPropertyProofs(node);
        if (eventScalarProofs.length > 0)
            return eventScalarProofs;
        const blobProofs = browserBlobPropertyProofs(node);
        if (blobProofs.length > 0)
            return blobProofs;
        const domMethodProofs = browserDomMethodPropertyProofs(node);
        if (domMethodProofs.length > 0)
            return domMethodProofs;
        const root = rootIdentifierText(node.expression);
        if (!root || !isNamespaceGlobalName(root))
            return [];
        const parent = node.parent;
        if (ts.isCallExpression(parent) && parent.expression === node) {
            const name = `${root}.${node.name.text}`;
            if (runtimeCallProofs(parent, name).length > 0)
                return [namespaceReferenceProof];
        }
        return [];
    }
    function browserDomMethodPropertyProofs(node) {
        const parent = node.parent;
        if (!ts.isCallExpression(parent) || parent.expression !== node)
            return [];
        return runtimeCallProofs(parent, node.getText(node.getSourceFile()));
    }
    function browserBlobPropertyProofs(node) {
        if (node.name.text === "name" && isBrowserBlobGlobal(node.expression)) {
            return [browserBlobConstructorNameProof];
        }
        if (node.name.text === "prototype" && isBrowserBlobGlobal(node.expression)) {
            return [browserBlobPrototypeProof];
        }
        if (node.name.text === "arrayBuffer" &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === "prototype" &&
            isBrowserBlobGlobal(node.expression.expression)) {
            return [browserBlobPrototypeArrayBufferProof];
        }
        return [];
    }
    function isBrowserBlobGlobal(node) {
        const expr = unwrapExpression(node);
        return ts.isIdentifier(expr) && expr.text === "Blob" && identifierResolvesToBrowserGlobal(expr);
    }
    function isNamespaceGlobalName(name) {
        return name === "Array" ||
            name === "Boolean" ||
            name === "Date" ||
            name === "Error" ||
            name === "Headers" ||
            name === "JSON" ||
            name === "Map" ||
            name === "Math" ||
            name === "Number" ||
            name === "Object" ||
            name === "Promise" ||
            name === "Request" ||
            name === "Response" ||
            name === "Set" ||
            name === "console" ||
            name === "String";
    }
    function browserDocumentPropertyProofs(node) {
        if (node.name.text === "body") {
            if (propertyAccessHasQuestionDot(node))
                return [];
            if (isAssignmentTarget(node))
                return [];
            return isBrowserDocumentReceiver(node.expression) ? [browserDocumentBodyProof] : [];
        }
        if (node.name.text === "head") {
            if (propertyAccessHasQuestionDot(node))
                return [];
            if (isAssignmentTarget(node))
                return [];
            return isBrowserDocumentReceiver(node.expression) ? [browserDocumentHeadProof] : [];
        }
        if (node.name.text === "documentElement") {
            if (propertyAccessHasQuestionDot(node))
                return [];
            if (isAssignmentTarget(node))
                return [];
            return isBrowserDocumentReceiver(node.expression) ? [browserDocumentElementProof] : [];
        }
        if (node.name.text === "hidden") {
            if (propertyAccessHasQuestionDot(node))
                return [];
            if (isAssignmentTarget(node))
                return [];
            return isBrowserDocumentReceiver(node.expression) ? [browserDocumentHiddenProof] : [];
        }
        if (node.name.text === "visibilityState") {
            if (propertyAccessHasQuestionDot(node))
                return [];
            if (isAssignmentTarget(node))
                return [];
            return isBrowserDocumentReceiver(node.expression) ? [browserDocumentVisibilityStateProof] : [];
        }
        if (node.name.text === "dataset") {
            if (propertyAccessHasQuestionDot(node))
                return [];
            if (isAssignmentTarget(node))
                return [];
            return isBrowserDatasetReceiver(node.expression) ? [browserDocumentDatasetProof] : [];
        }
        const name = `${node.expression.getText(node.getSourceFile())}.${node.name.text}`;
        if (!isBrowserDocumentCreateElementCallName(name))
            return [];
        const parent = node.parent;
        if (!ts.isCallExpression(parent) || parent.expression !== node)
            return [];
        return browserDocumentCreateElementProofs(parent);
    }
    function browserDatasetStringWriteProofs(node, value) {
        if (propertyAccessHasQuestionDot(node))
            return [];
        if (!isValidDatasetPropertyName(node.name.text))
            return [];
        if (!isStringRuntimeValueExpression(value))
            return [];
        const parent = node.parent;
        if (!ts.isBinaryExpression(parent) || parent.left !== node || parent.operatorToken.kind !== ts.SyntaxKind.EqualsToken)
            return [];
        const datasetExpression = node.expression;
        if (!ts.isPropertyAccessExpression(datasetExpression) || propertyAccessHasQuestionDot(datasetExpression))
            return [];
        if (datasetExpression.name.text !== "dataset")
            return [];
        return isBrowserDatasetReceiver(datasetExpression.expression) ? [browserDocumentDatasetStringWriteProof] : [];
    }
    function isBrowserDatasetReceiver(node) {
        if (ts.isPropertyAccessExpression(node) && node.name.text === "body") {
            if (propertyAccessHasQuestionDot(node))
                return false;
            return isBrowserDocumentReceiver(node.expression);
        }
        const text = typeText(typeAt(node)).trim();
        return text === "HTMLElement" || text === "Element" || text.endsWith(".HTMLElement") || text.endsWith(".Element");
    }
    function isValidDatasetPropertyName(name) {
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
    }
    function browserInlineStylePropertyProofs(node) {
        if (node.name.text !== "style")
            return [];
        if (propertyAccessHasQuestionDot(node))
            return [];
        return isBrowserInlineStyleElementReceiver(node.expression) ? [browserInlineStyleAccessProof] : [];
    }
    function browserInlineStyleValuePropertyProofs(node) {
        if (propertyAccessHasQuestionDot(node) || isAssignmentTarget(node))
            return [];
        if (!isValidInlineStyleName(node.name.text))
            return [];
        const styleExpression = node.expression;
        if (!ts.isPropertyAccessExpression(styleExpression) || propertyAccessHasQuestionDot(styleExpression))
            return [];
        if (styleExpression.name.text !== "style")
            return [];
        return isBrowserInlineStyleElementReceiver(styleExpression.expression) ? [browserInlineStylePropertyReadProof] : [];
    }
    function browserInlineStyleSetPropertyProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.expression.name.text !== "setProperty")
            return [];
        const styleExpression = node.expression.expression;
        if (!ts.isPropertyAccessExpression(styleExpression) || propertyAccessHasQuestionDot(styleExpression))
            return [];
        if (styleExpression.name.text !== "style")
            return [];
        if (!isBrowserInlineStyleElementReceiver(styleExpression.expression))
            return [];
        if (node.arguments.length < 2 || node.arguments.length > 3)
            return [];
        const propertyName = stringConstValue(node.arguments[0], node);
        if (propertyName === undefined || !isValidInlineStyleName(propertyName))
            return [];
        if (!isStringRuntimeArgument(node.arguments[1]))
            return [];
        if (node.arguments.length === 3) {
            const priority = stringConstValue(node.arguments[2], node);
            if (priority !== "" && priority !== "important")
                return [];
        }
        return [browserInlineStyleSetPropertyProof];
    }
    function browserInlineStyleObjectAssignProofs(node) {
        if (!staticPropertyCallNamed(node, "Object", "assign"))
            return [];
        if (node.arguments.length < 2)
            return [];
        const target = unwrapExpression(node.arguments[0]);
        if (!ts.isPropertyAccessExpression(target) || propertyAccessHasQuestionDot(target))
            return [];
        if (target.name.text !== "style")
            return [];
        if (!isBrowserInlineStyleElementReceiver(target.expression))
            return [];
        let propertyCount = 0;
        for (let index = 1; index < node.arguments.length; index += 1) {
            const source = unwrapExpression(node.arguments[index]);
            if (!ts.isObjectLiteralExpression(source))
                return [];
            for (const property of source.properties) {
                if (!ts.isPropertyAssignment(property))
                    return [];
                const name = inlineStyleObjectPropertyName(property.name);
                if (!name || !isValidInlineStyleName(name))
                    return [];
                if (!isStringRuntimeValueExpression(property.initializer))
                    return [];
                propertyCount += 1;
            }
        }
        return propertyCount > 0 ? [browserInlineStyleObjectAssignProof] : [];
    }
    function isBrowserInlineStyleElementReceiver(node) {
        if (isBrowserElementReceiver(node))
            return true;
        const text = typeText(typeAt(node)).trim();
        if (text === "HTMLElement" || text === "Element" || text === "HTMLBodyElement" || text === "HTMLDivElement")
            return true;
        return text.endsWith(".HTMLElement") ||
            text.endsWith(".Element") ||
            text.endsWith(".HTMLBodyElement") ||
            text.endsWith(".HTMLDivElement") ||
            text.endsWith("Element");
    }
    function browserEventMethodProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.arguments.length !== 0)
            return [];
        if (!isBrowserEventReceiver(node.expression.expression))
            return [];
        if (node.expression.name.text === "preventDefault")
            return [browserEventPreventDefaultProof];
        if (node.expression.name.text === "stopPropagation")
            return [browserEventStopPropagationProof];
        return [];
    }
    function browserEventTargetListenerProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        const member = node.expression.name.text;
        if (member !== "addEventListener" && member !== "removeEventListener")
            return [];
        if (!isBrowserEventTargetReceiver(node.expression.expression))
            return [];
        if (node.arguments.length < 2 || node.arguments.length > 3)
            return [];
        const eventType = node.arguments[0];
        const listener = node.arguments[1];
        if (!eventType || !listener || ts.isSpreadElement(eventType) || ts.isSpreadElement(listener))
            return [];
        if (!isStringRuntimeArgument(eventType))
            return [];
        if (!isBrowserEventHandlerArgument(listener))
            return [];
        if (node.arguments.length === 3) {
            const options = node.arguments[2];
            if (!options || ts.isSpreadElement(options))
                return [];
            if (!isSupportedEventListenerOptions(options, member === "addEventListener", browserEventHandlerHasNoEventParameter(listener)))
                return [];
        }
        return member === "addEventListener" ? [browserEventAddEventListenerProof] : [browserEventRemoveEventListenerProof];
    }
    function browserEventConstructorProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "Event" || !identifierResolvesToBrowserGlobal(node.expression))
            return [];
        const args = [...(node.arguments ?? [])];
        if (args.length < 1 || args.length > 2)
            return [];
        const eventType = args[0];
        if (!eventType || ts.isSpreadElement(eventType))
            return [];
        if (stringConstValue(eventType, node) === undefined)
            return [];
        if (args.length === 2 && !isSupportedBrowserEventInitOptions(args[1]))
            return [];
        return [browserEventConstructorProof];
    }
    function browserMouseEventConstructorProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "MouseEvent" || !identifierResolvesToBrowserGlobal(node.expression))
            return [];
        const args = [...(node.arguments ?? [])];
        if (args.length < 1 || args.length > 2)
            return [];
        const eventType = args[0];
        if (!eventType || ts.isSpreadElement(eventType))
            return [];
        if (stringConstValue(eventType, node) === undefined)
            return [];
        if (args.length === 2 && !isSupportedBrowserEventInitOptions(args[1]))
            return [];
        return [browserMouseEventConstructorProof];
    }
    function browserKeyboardEventConstructorProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "KeyboardEvent" || !identifierResolvesToBrowserGlobal(node.expression))
            return [];
        const args = [...(node.arguments ?? [])];
        if (args.length < 1 || args.length > 2)
            return [];
        const eventType = args[0];
        if (!eventType || ts.isSpreadElement(eventType))
            return [];
        if (stringConstValue(eventType, node) === undefined)
            return [];
        if (args.length === 2 && !isSupportedBrowserKeyboardEventInitOptions(args[1]))
            return [];
        return [browserKeyboardEventConstructorProof];
    }
    function browserCustomEventConstructorProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "CustomEvent" || !identifierResolvesToBrowserGlobal(node.expression))
            return [];
        const args = [...(node.arguments ?? [])];
        if (args.length < 1 || args.length > 2)
            return [];
        const eventType = args[0];
        if (!eventType || ts.isSpreadElement(eventType))
            return [];
        if (stringConstValue(eventType, node) === undefined)
            return [];
        if (args.length === 2 && !isSupportedBrowserCustomEventInitOptions(args[1]))
            return [];
        return [browserCustomEventConstructorProof];
    }
    function browserIntersectionObserverConstructorProofs(node) {
        if (!ts.isIdentifier(node.expression) ||
            node.expression.text !== "IntersectionObserver" ||
            !identifierResolvesToBrowserGlobal(node.expression))
            return [];
        const args = [...(node.arguments ?? [])];
        if (args.length < 1 || args.length > 2)
            return [];
        const callback = args[0];
        if (!callback || ts.isSpreadElement(callback))
            return [];
        if (!isBrowserIntersectionObserverCallbackArgument(callback))
            return [];
        if (args.length === 2 && !isSupportedIntersectionObserverInitOptions(args[1]))
            return [];
        return [browserIntersectionObserverConstructorProof];
    }
    function isBrowserIntersectionObserverCallbackArgument(node) {
        const expr = unwrapExpression(node);
        if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
            if (expr.parameters.length < 1 || expr.parameters.length > 2)
                return false;
            for (const parameter of expr.parameters) {
                if (parameter.dotDotDotToken)
                    return false;
            }
            return true;
        }
        return browserIntersectionObserverCallbackTypeSupported(typeAt(expr));
    }
    function browserIntersectionObserverCallbackTypeSupported(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnion()) {
            return type.types.length > 0 && type.types.every((part) => browserIntersectionObserverCallbackTypeSupported(part, seen));
        }
        if (type.isIntersection()) {
            return type.types.some((part) => browserIntersectionObserverCallbackTypeSupported(part, seen));
        }
        const signatures = type.getCallSignatures();
        if (signatures.length === 0)
            return false;
        return signatures.some((signature) => {
            const parameters = signature.getParameters();
            return parameters.length >= 1 && parameters.length <= 2;
        });
    }
    function isSupportedIntersectionObserverInitOptions(node) {
        if (!node || ts.isSpreadElement(node))
            return false;
        const expr = unwrapExpression(node);
        if (!ts.isObjectLiteralExpression(expr))
            return false;
        for (const property of expr.properties) {
            if (ts.isShorthandPropertyAssignment(property)) {
                if (property.name.text !== "threshold")
                    return false;
                if (!isRuntimeNumberExpression(property.name))
                    return false;
                continue;
            }
            if (!ts.isPropertyAssignment(property))
                return false;
            const name = staticPropertyName(property.name);
            if (name === "threshold") {
                if (!isRuntimeNumberExpression(property.initializer))
                    return false;
                continue;
            }
            return false;
        }
        return true;
    }
    function isSupportedBrowserEventInitOptions(node) {
        if (!node || ts.isSpreadElement(node))
            return false;
        const expr = unwrapExpression(node);
        if (!ts.isObjectLiteralExpression(expr))
            return false;
        for (const property of expr.properties) {
            if (!ts.isPropertyAssignment(property))
                return false;
            const name = staticPropertyName(property.name);
            if (!name)
                return false;
            if (!browserEventInitOptionNames.has(name))
                return false;
            if (!isPureI32OrBoolExpression(property.initializer))
                return false;
        }
        return true;
    }
    function isSupportedBrowserKeyboardEventInitOptions(node) {
        if (!node || ts.isSpreadElement(node))
            return false;
        const expr = unwrapExpression(node);
        if (!ts.isObjectLiteralExpression(expr))
            return false;
        for (const property of expr.properties) {
            if (!ts.isPropertyAssignment(property))
                return false;
            const name = staticPropertyName(property.name);
            if (!name)
                return false;
            if (browserKeyboardEventInitStringOptionNames.has(name)) {
                if (!isStringRuntimeValueExpression(property.initializer))
                    return false;
                continue;
            }
            if (browserKeyboardEventInitBoolOptionNames.has(name)) {
                if (!isBooleanTypeText(typeText(typeAt(property.initializer))))
                    return false;
                continue;
            }
            return false;
        }
        return true;
    }
    function isSupportedBrowserCustomEventInitOptions(node) {
        if (!node || ts.isSpreadElement(node))
            return false;
        const expr = unwrapExpression(node);
        if (!ts.isObjectLiteralExpression(expr))
            return false;
        for (const property of expr.properties) {
            if (!ts.isPropertyAssignment(property))
                return false;
            const name = staticPropertyName(property.name);
            if (name !== "detail")
                return false;
            if (!isStringRuntimeValueExpression(property.initializer))
                return false;
        }
        return true;
    }
    function staticPropertyName(name) {
        if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
            return name.text;
        return undefined;
    }
    function browserEventDispatchProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.expression.name.text !== "dispatchEvent")
            return [];
        if (!isBrowserEventTargetReceiver(node.expression.expression))
            return [];
        if (node.arguments.length !== 1)
            return [];
        const event = node.arguments[0];
        if (!event || ts.isSpreadElement(event))
            return [];
        return isInlineBrowserEventConstructor(event) ? [browserEventDispatchProof] : [];
    }
    function isInlineBrowserEventConstructor(node) {
        const event = unwrapExpression(node);
        return ts.isNewExpression(event) && runtimeConstructorProofs(event).includes(browserEventConstructorProof);
    }
    function browserElementAttributeCallProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        if (!isBrowserElementReceiver(node.expression.expression))
            return [];
        const member = node.expression.name.text;
        if (member === "setAttribute") {
            if (node.arguments.length !== 2 ||
                !isStringRuntimeArgument(node.arguments[0]) ||
                !isStringRuntimeArgument(node.arguments[1]))
                return [];
            return [browserElementSetAttributeProof];
        }
        if (member === "getAttribute") {
            if (node.arguments.length !== 1 || !isStringRuntimeArgument(node.arguments[0]))
                return [];
            return [browserElementGetAttributeProof];
        }
        if (member === "hasAttribute") {
            if (node.arguments.length !== 1 || !isStringRuntimeArgument(node.arguments[0]))
                return [];
            return [browserElementHasAttributeProof];
        }
        if (member === "removeAttribute") {
            if (node.arguments.length !== 1 || !isStringRuntimeArgument(node.arguments[0]))
                return [];
            return [browserElementRemoveAttributeProof];
        }
        return [];
    }
    function browserElementClassListPropertyProofs(node) {
        if (node.name.text !== "classList" || propertyAccessHasQuestionDot(node))
            return [];
        return isBrowserElementReceiver(node.expression) ? [browserElementClassListAccessProof] : [];
    }
    function browserElementClassListCallProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        const classListExpression = node.expression.expression;
        if (!ts.isPropertyAccessExpression(classListExpression) || propertyAccessHasQuestionDot(classListExpression))
            return [];
        if (classListExpression.name.text !== "classList")
            return [];
        if (!isBrowserElementReceiver(classListExpression.expression))
            return [];
        const member = node.expression.name.text;
        if (member !== "add" && member !== "remove" && member !== "contains" && member !== "toggle")
            return [];
        if (node.arguments.length < 1 || node.arguments.length > 2)
            return [];
        if (!isStringRuntimeArgument(node.arguments[0]))
            return [];
        if (node.arguments.length === 2 && !isPureI32OrBoolExpression(node.arguments[1]))
            return [];
        return [browserElementClassListCallProof];
    }
    function browserElementTreeCallProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        const receiver = node.expression.expression;
        if (!isBrowserNodeReceiver(receiver))
            return [];
        const member = node.expression.name.text;
        if (member === "append") {
            if (node.arguments.length === 0)
                return [browserElementAppendProof];
            for (const argument of node.arguments) {
                if (ts.isSpreadElement(argument))
                    return [];
                if (!isStringRuntimeArgument(argument) && !isBrowserNodeReceiver(argument))
                    return [];
            }
            return [browserElementAppendProof];
        }
        if (member === "appendChild") {
            const argument = node.arguments[0];
            if (node.arguments.length !== 1 || !argument || ts.isSpreadElement(argument) || !isBrowserNodeReceiver(argument))
                return [];
            return [browserElementAppendChildProof];
        }
        if (member === "remove") {
            return node.arguments.length === 0 ? [browserElementRemoveProof] : [];
        }
        if (member === "contains") {
            const argument = node.arguments[0];
            if (node.arguments.length !== 1 || !argument || ts.isSpreadElement(argument) || !isBrowserNodeReceiver(argument))
                return [];
            return [browserElementContainsProof];
        }
        return [];
    }
    function browserDomQueryCallProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.arguments.length !== 1)
            return [];
        const member = node.expression.name.text;
        if (member === "getElementById") {
            if (!isStringRuntimeArgument(node.arguments[0]))
                return [];
            return isBrowserDocumentReceiver(node.expression.expression) ? [browserDocumentGetElementByIdProof] : [];
        }
        if (!isSupportedDomSelectorArgument(node.arguments[0], node))
            return [];
        if (member === "querySelector") {
            return isBrowserDocumentReceiver(node.expression.expression) ? [browserDocumentQuerySelectorProof] : [];
        }
        if (member === "querySelectorAll") {
            return isBrowserDocumentReceiver(node.expression.expression) ? [browserDocumentQuerySelectorAllProof] : [];
        }
        if (member === "matches") {
            return isBrowserElementReceiver(node.expression.expression) ? [browserElementMatchesProof] : [];
        }
        if (member === "closest") {
            return isBrowserElementReceiver(node.expression.expression) ? [browserElementClosestProof] : [];
        }
        return [];
    }
    function browserTextCodecCallProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        const member = node.expression.name.text;
        if (member === "encode") {
            if (node.arguments.length !== 1)
                return [];
            const input = node.arguments[0];
            if (!input || ts.isSpreadElement(input))
                return [];
            if (!isStringRuntimeArgument(input))
                return [];
            return isBrowserTextEncoderReceiver(node.expression.expression) ? [browserTextEncoderEncodeProof] : [];
        }
        if (member === "decode") {
            if (node.arguments.length !== 1)
                return [];
            const input = node.arguments[0];
            if (!input || ts.isSpreadElement(input))
                return [];
            return isBrowserTextDecoderReceiver(node.expression.expression) && isRuntimeUint8ArrayExpression(input)
                ? [browserTextDecoderDecodeProof]
                : [];
        }
        return [];
    }
    function isBrowserTextEncoderReceiver(node) {
        return typeHasDomLibName(typeAt(node), (name) => name === "TextEncoder");
    }
    function isBrowserTextDecoderReceiver(node) {
        return typeHasDomLibName(typeAt(node), (name) => name === "TextDecoder");
    }
    function isSupportedDomSelector(selector) {
        const parts = selector.trim().split(/\s+/);
        if (parts.length <= 0 || parts.length > 2)
            return false;
        return parts.every((part) => isSupportedDomSelectorPart(part));
    }
    function isSupportedDomSelectorArgument(node, use) {
        const literal = stringConstValue(node, use);
        if (literal !== undefined)
            return isSupportedDomSelector(literal);
        const expr = unwrapExpression(node);
        if (!ts.isIdentifier(expr))
            return false;
        return parameterHasOnlySupportedDomSelectorCallArguments(expr, use);
    }
    function parameterHasOnlySupportedDomSelectorCallArguments(identifier, use) {
        const symbol = checker.getSymbolAtLocation(identifier);
        const parameter = symbol?.declarations?.find((item) => {
            return ts.isParameter(item) && ts.isIdentifier(item.name) && item.name.text === identifier.text;
        });
        if (!parameter)
            return false;
        const owner = parameter.parent;
        if (!ts.isFunctionDeclaration(owner) || !owner.name)
            return false;
        if (hasExportModifier(owner))
            return false;
        const parameterIndex = owner.parameters.indexOf(parameter);
        if (parameterIndex < 0)
            return false;
        const ownerSymbol = checker.getSymbolAtLocation(owner.name);
        if (!ownerSymbol)
            return false;
        let callCount = 0;
        let unsafeReference = false;
        const visitReference = (node) => {
            if (unsafeReference)
                return;
            if (ts.isIdentifier(node) && node.text === owner.name.text && node !== owner.name) {
                const refSymbol = checker.getSymbolAtLocation(node);
                if (refSymbol === ownerSymbol) {
                    const parent = node.parent;
                    if (!ts.isCallExpression(parent) || parent.expression !== node) {
                        unsafeReference = true;
                        return;
                    }
                    const argument = parent.arguments[parameterIndex];
                    if (!argument || ts.isSpreadElement(argument)) {
                        unsafeReference = true;
                        return;
                    }
                    const selector = stringConstValue(argument, parent);
                    if (selector === undefined || !isSupportedDomSelector(selector)) {
                        unsafeReference = true;
                        return;
                    }
                    callCount += 1;
                }
            }
            ts.forEachChild(node, visitReference);
        };
        for (const sourceFile of sourceFiles)
            visitReference(sourceFile);
        return callCount > 0 && !unsafeReference;
    }
    function hasExportModifier(node) {
        return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
    }
    function isSupportedDomSelectorPart(part) {
        if (part.length === 0)
            return false;
        let index = 0;
        if (isSelectorNameStart(part.charCodeAt(index))) {
            index += 1;
            while (index < part.length && isSelectorNameChar(part.charCodeAt(index)))
                index += 1;
        }
        let sawClause = index > 0;
        while (index < part.length) {
            const ch = part[index];
            if (ch === "#" || ch === ".") {
                index += 1;
                const start = index;
                while (index < part.length && isSelectorNameChar(part.charCodeAt(index)))
                    index += 1;
                if (index === start)
                    return false;
                sawClause = true;
                continue;
            }
            if (ch === "[") {
                const close = part.indexOf("]", index + 1);
                if (close < 0)
                    return false;
                const body = part.slice(index + 1, close);
                if (!isSupportedAttributeSelectorBody(body))
                    return false;
                index = close + 1;
                sawClause = true;
                continue;
            }
            if (ch === ":") {
                if (part.startsWith(":first-child", index)) {
                    index += ":first-child".length;
                    sawClause = true;
                    continue;
                }
                if (part.startsWith(":last-child", index)) {
                    index += ":last-child".length;
                    sawClause = true;
                    continue;
                }
                return false;
            }
            return false;
        }
        return sawClause;
    }
    function isSupportedAttributeSelectorBody(body) {
        const equals = body.indexOf("=");
        const name = equals < 0 ? body : body.slice(0, equals);
        if (!isSelectorName(name))
            return false;
        if (equals < 0)
            return true;
        let value = body.slice(equals + 1);
        if (value.length >= 2 &&
            ((value.startsWith("\"") && value.endsWith("\"")) ||
                (value.startsWith("'") && value.endsWith("'")))) {
            value = value.slice(1, -1);
        }
        if (value.length === 0)
            return false;
        for (let i = 0; i < value.length; i += 1) {
            const code = value.charCodeAt(i);
            if (!isSelectorNameChar(code) && code !== 58 && code !== 46)
                return false;
        }
        return true;
    }
    function isSelectorName(value) {
        if (value.length === 0 || !isSelectorNameStart(value.charCodeAt(0)))
            return false;
        for (let i = 1; i < value.length; i += 1) {
            if (!isSelectorNameChar(value.charCodeAt(i)))
                return false;
        }
        return true;
    }
    function isSelectorNameStart(code) {
        return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
    }
    function isSelectorNameChar(code) {
        return isSelectorNameStart(code) || (code >= 48 && code <= 57) || code === 45;
    }
    function isBrowserEventReceiver(node) {
        return typeHasDomLibName(typeAt(node), (name) => name === "Event" || name.endsWith("Event"));
    }
    function isBrowserEventTargetReceiver(node) {
        return isBrowserElementReceiver(node) || isBrowserDocumentReceiver(node) || isBrowserWindowReceiver(node);
    }
    function isBrowserElementReceiver(node) {
        return typeHasDomLibName(typeAt(node), (name) => name === "Element" || name.endsWith("Element"));
    }
    function isBrowserNodeReceiver(node) {
        return isBrowserElementReceiver(node) ||
            typeHasDomLibName(typeAt(node), (name) => name === "Node" || name.endsWith("Node"));
    }
    function typeHasDomLibName(type, acceptsName, depth = 0) {
        if (depth > 4)
            return false;
        if (type.isUnion()) {
            if (type.types.length === 0)
                return false;
            return type.types.every((item) => typeHasDomLibName(item, acceptsName, depth + 1));
        }
        if (type.isIntersection()) {
            return type.types.some((item) => typeHasDomLibName(item, acceptsName, depth + 1));
        }
        const symbols = [type.getSymbol(), type.aliasSymbol].filter((item) => item !== undefined);
        for (const symbol of symbols) {
            const name = symbol.getName();
            if (!acceptsName(name))
                continue;
            for (const declaration of symbol.declarations ?? []) {
                const file = toPosix(declaration.getSourceFile().fileName);
                if (file.includes("/typescript/lib/lib.dom"))
                    return true;
            }
        }
        return false;
    }
    function inlineStyleObjectPropertyName(name) {
        if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
            return name.text;
        if (ts.isComputedPropertyName(name) &&
            (ts.isStringLiteral(name.expression) || ts.isNoSubstitutionTemplateLiteral(name.expression)))
            return name.expression.text;
        return undefined;
    }
    function isValidInlineStyleName(name) {
        if (name.length <= 0)
            return false;
        for (let index = 0; index < name.length; index += 1) {
            const ch = name.charCodeAt(index);
            const ok = (ch >= 48 && ch <= 57) ||
                (ch >= 65 && ch <= 90) ||
                (ch >= 97 && ch <= 122) ||
                ch === 45 ||
                ch === 95;
            if (!ok)
                return false;
        }
        return true;
    }
    function unwrapExpression(node) {
        let current = node;
        while (ts.isParenthesizedExpression(current) ||
            ts.isAsExpression(current) ||
            ts.isTypeAssertionExpression(current) ||
            ts.isSatisfiesExpression(current) ||
            ts.isNonNullExpression(current)) {
            current = current.expression;
        }
        return current;
    }
    function isBrowserDocumentCreateElementCallName(name) {
        return name === "document.createElement" || name.endsWith(".createElement");
    }
    function browserDocumentCreateElementProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.expression.name.text !== "createElement")
            return [];
        if (!isBrowserDocumentReceiver(node.expression.expression))
            return [];
        if (node.arguments.length !== 1)
            return [];
        const tag = node.arguments[0];
        if (!tag || ts.isSpreadElement(tag))
            return [];
        const value = stringConstValue(tag, node);
        return value !== undefined && isAscii(value) ? [browserDocumentCreateElementProof] : [];
    }
    function isBrowserDocumentReceiver(node) {
        if (ts.isIdentifier(node) && node.text === "document" && identifierResolvesToBrowserGlobal(node))
            return true;
        const text = typeText(typeAt(node)).trim();
        return text === "Document" || text === "HTMLDocument" || text.endsWith(".Document") || text.endsWith(".HTMLDocument");
    }
    function isBrowserWindowReceiver(node) {
        if (ts.isIdentifier(node) && node.text === "window" && identifierResolvesToBrowserGlobal(node))
            return true;
        return typeHasDomLibName(typeAt(node), (name) => name === "Window" || name.endsWith("Window"));
    }
    function isBrowserEventHandlerArgument(node) {
        const expr = unwrapExpression(node);
        if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
            return browserEventHandlerParametersSupported(expr.parameters);
        }
        return browserEventHandlerTypeSupported(typeAt(expr));
    }
    function browserEventHandlerParametersSupported(parameters) {
        if (parameters.length === 0)
            return true;
        if (parameters.length !== 1)
            return false;
        const parameter = parameters[0];
        if (!parameter || parameter.dotDotDotToken)
            return false;
        return typeHasDomLibName(typeAt(parameter.name), (name) => name === "Event" || name.endsWith("Event"));
    }
    function browserEventHandlerTypeSupported(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnion()) {
            return type.types.length > 0 && type.types.every((part) => browserEventHandlerTypeSupported(part, seen));
        }
        if (type.isIntersection()) {
            return type.types.some((part) => browserEventHandlerTypeSupported(part, seen));
        }
        const signatures = type.getCallSignatures();
        if (signatures.length === 0)
            return false;
        return signatures.some((signature) => browserEventHandlerSignatureSupported(signature));
    }
    function browserEventHandlerSignatureSupported(signature) {
        const parameters = signature.getParameters();
        if (parameters.length === 0)
            return true;
        if (parameters.length !== 1)
            return false;
        const parameter = parameters[0];
        const declaration = parameter?.valueDeclaration;
        if (!parameter || !declaration)
            return false;
        const parameterType = checker.getTypeOfSymbolAtLocation(parameter, declaration);
        return typeHasDomLibName(parameterType, (name) => name === "Event" || name.endsWith("Event"));
    }
    function browserEventHandlerHasNoEventParameter(node) {
        const expr = unwrapExpression(node);
        if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr))
            return expr.parameters.length === 0;
        return browserEventHandlerTypeHasNoEventParameter(typeAt(expr));
    }
    function browserEventHandlerTypeHasNoEventParameter(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnion()) {
            return type.types.length > 0 && type.types.every((part) => browserEventHandlerTypeHasNoEventParameter(part, seen));
        }
        if (type.isIntersection()) {
            return type.types.some((part) => browserEventHandlerTypeHasNoEventParameter(part, seen));
        }
        const signatures = type.getCallSignatures();
        return signatures.length > 0 && signatures.some((signature) => signature.getParameters().length === 0);
    }
    function isSupportedEventListenerOptions(node, allowOnce, listenerHasNoEventParameter) {
        const expr = unwrapExpression(node);
        const exprType = typeAt(expr);
        if (isBooleanTypeText(typeText(exprType)))
            return true;
        if (!ts.isObjectLiteralExpression(expr))
            return false;
        for (const property of expr.properties) {
            if (!ts.isPropertyAssignment(property))
                return false;
            const name = inlineStyleObjectPropertyName(property.name);
            if (name === "passive") {
                const passiveValue = staticBooleanValue(property.initializer);
                if (passiveValue === undefined)
                    return false;
                if (passiveValue && !listenerHasNoEventParameter)
                    return false;
                continue;
            }
            if (name !== "capture" && (!allowOnce || name !== "once"))
                return false;
            if (!isBooleanTypeText(typeText(typeAt(property.initializer))))
                return false;
        }
        return true;
    }
    function staticBooleanValue(node) {
        const expr = unwrapExpression(node);
        if (expr.kind === ts.SyntaxKind.TrueKeyword)
            return true;
        if (expr.kind === ts.SyntaxKind.FalseKeyword)
            return false;
        return undefined;
    }
    function browserLocalStoragePropertyProofs(node) {
        const name = `${node.expression.getText(node.getSourceFile())}.${node.name.text}`;
        if (!isBrowserLocalStorageCallName(name))
            return [];
        const parent = node.parent;
        if (!ts.isCallExpression(parent) || parent.expression !== node) {
            if (!isTypeofFunctionCheck(node))
                return [];
            if (!isBrowserLocalStorageReceiver(node.expression))
                return [];
            return browserLocalStorageMemberProof(node.name.text);
        }
        return browserLocalStorageCallProofs(parent);
    }
    function isTypeofFunctionCheck(node) {
        const parent = node.parent;
        if (!ts.isTypeOfExpression(parent) || parent.expression !== node)
            return false;
        const binary = parent.parent;
        if (!ts.isBinaryExpression(binary))
            return false;
        if (binary.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
            binary.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsToken &&
            binary.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken &&
            binary.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsToken)
            return false;
        const other = binary.left === parent ? binary.right : binary.right === parent ? binary.left : undefined;
        return other !== undefined && stringConstValue(other, binary) === "function";
    }
    function browserLocalStorageMemberProof(member) {
        if (member === "getItem")
            return [browserLocalStorageGetItemProof];
        if (member === "setItem")
            return [browserLocalStorageSetItemProof];
        if (member === "removeItem")
            return [browserLocalStorageRemoveItemProof];
        if (member === "clear")
            return [browserLocalStorageClearProof];
        return [];
    }
    function browserWindowPropertyProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "window")
            return [];
        if (!identifierResolvesToBrowserGlobal(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node) || isAssignmentTarget(node))
            return [];
        if (node.name.text === "localStorage")
            return [browserWindowLocalStorageProof];
        if (node.name.text === "location")
            return [browserWindowLocationProof];
        if (node.name.text === "innerWidth" || node.name.text === "innerHeight")
            return [browserWindowSizeProof];
        if (node.name.text === "scrollX" || node.name.text === "scrollY")
            return [browserWindowScrollProof];
        return [];
    }
    function browserNavigatorPropertyProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "navigator")
            return [];
        if (!identifierResolvesToBrowserGlobal(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node) || isAssignmentTarget(node))
            return [];
        return node.name.text === "language" ? [browserNavigatorLanguageProof] : [];
    }
    function browserWindowLocationReadonlyScalarPropertyProofs(node) {
        if (!browserWindowLocationReadonlyScalarPropertyNames.has(node.name.text))
            return [];
        if (propertyAccessHasQuestionDot(node) || isAssignmentTarget(node))
            return [];
        if (ts.isIdentifier(node.expression) &&
            node.expression.text === "location" &&
            identifierResolvesToBrowserGlobal(node.expression)) {
            return [browserWindowLocationReadonlyScalarProof];
        }
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node.expression) || node.expression.name.text !== "location")
            return [];
        if (!ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== "window")
            return [];
        return identifierResolvesToBrowserGlobal(node.expression.expression) ? [browserWindowLocationReadonlyScalarProof] : [];
    }
    function browserEventReadonlyScalarPropertyProofs(node) {
        if (!browserEventReadonlyScalarPropertyNames.has(node.name.text))
            return [];
        if (propertyAccessHasQuestionDot(node) || isAssignmentTarget(node))
            return [];
        return isBrowserEventReceiver(node.expression) ? [browserEventReadonlyScalarProof] : [];
    }
    function isBrowserLocalStorageCallName(name) {
        return name.endsWith("localStorage.getItem") ||
            name.endsWith("localStorage.setItem") ||
            name.endsWith("localStorage.removeItem") ||
            name.endsWith("localStorage.clear");
    }
    function browserLocalStorageCallProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node.expression))
            return [];
        if (!isBrowserLocalStorageReceiver(node.expression.expression))
            return [];
        const member = node.expression.name.text;
        if (member === "getItem") {
            if (node.arguments.length !== 1 || !isStringRuntimeArgument(node.arguments[0]))
                return [];
            return [browserLocalStorageGetItemProof];
        }
        if (member === "setItem") {
            if (node.arguments.length !== 2 ||
                !isStringRuntimeArgument(node.arguments[0]) ||
                !isStringRuntimeArgument(node.arguments[1]))
                return [];
            return [browserLocalStorageSetItemProof];
        }
        if (member === "removeItem") {
            if (node.arguments.length !== 1 || !isStringRuntimeArgument(node.arguments[0]))
                return [];
            return [browserLocalStorageRemoveItemProof];
        }
        if (member === "clear") {
            return node.arguments.length === 0 ? [browserLocalStorageClearProof] : [];
        }
        return [];
    }
    function isBrowserLocalStorageReceiver(node) {
        if (ts.isIdentifier(node) && node.text === "localStorage" && identifierResolvesToBrowserGlobal(node))
            return true;
        if (ts.isPropertyAccessExpression(node) &&
            node.name.text === "localStorage" &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === "window" &&
            identifierResolvesToBrowserGlobal(node.expression))
            return true;
        return false;
    }
    function isBrowserTimerCallName(name) {
        return name === "window.setTimeout" ||
            name === "window.clearTimeout" ||
            name === "window.setInterval" ||
            name === "window.clearInterval" ||
            name === "globalThis.setTimeout" ||
            name === "globalThis.clearTimeout" ||
            name === "globalThis.setInterval" ||
            name === "globalThis.clearInterval";
    }
    function isBrowserAnimationFrameCallName(name) {
        return name === "window.cancelAnimationFrame" || name === "globalThis.cancelAnimationFrame";
    }
    function browserAnimationFrameCallProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (node.expression.name.text !== "cancelAnimationFrame")
            return [];
        if (propertyAccessHasQuestionDot(node.expression))
            return [];
        if (!isBrowserWindowLikeReceiver(node.expression.expression))
            return [];
        if (node.arguments.length !== 1)
            return [];
        const requestId = node.arguments[0];
        if (!requestId || ts.isSpreadElement(requestId))
            return [];
        return isI32ValueTypeText(typeText(typeAt(requestId)))
            ? [browserWindowCancelAnimationFrameProof]
            : [];
    }
    function isBrowserMatchMediaCallName(name) {
        return name === "window.matchMedia" || name === "globalThis.matchMedia";
    }
    function browserMatchMediaCallProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (node.expression.name.text !== "matchMedia" || propertyAccessHasQuestionDot(node.expression))
            return [];
        if (!isBrowserWindowLikeReceiver(node.expression.expression))
            return [];
        if (node.arguments.length !== 1 || !isStringRuntimeArgument(node.arguments[0]))
            return [];
        const parent = node.parent;
        if (ts.isPropertyAccessExpression(parent) && parent.expression === node && parent.name.text === "matches") {
            if (propertyAccessHasQuestionDot(parent) || isAssignmentTarget(parent))
                return [];
            return [browserWindowMatchMediaMatchesProof];
        }
        if (isMatchMediaListValueUse(node))
            return [browserWindowMatchMediaListProof];
        return [];
    }
    function browserMatchMediaMatchesPropertyProofs(node) {
        if (node.name.text !== "matches" || propertyAccessHasQuestionDot(node) || isAssignmentTarget(node))
            return [];
        const receiver = node.expression;
        if (!ts.isCallExpression(receiver))
            return [];
        return browserMatchMediaCallProofs(receiver);
    }
    function isMatchMediaListValueUse(node) {
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
            return variableDeclarationIsConst(parent);
        }
        return false;
    }
    function browserMediaQueryListListenerProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        const member = node.expression.name.text;
        if (member !== "addEventListener" &&
            member !== "removeEventListener" &&
            member !== "addListener" &&
            member !== "removeListener")
            return [];
        if (!isBrowserMediaQueryListReceiver(node.expression.expression, node))
            return [];
        if (member === "addEventListener" || member === "removeEventListener") {
            if (node.arguments.length !== 2)
                return [];
            const eventType = node.arguments[0];
            const listener = node.arguments[1];
            if (!eventType || !listener || ts.isSpreadElement(eventType) || ts.isSpreadElement(listener))
                return [];
            if (stringConstValue(eventType, node) !== "change")
                return [];
            return isBrowserEventHandlerArgument(listener) ? [browserMediaQueryListListenerProof] : [];
        }
        if (node.arguments.length !== 1)
            return [];
        const listener = node.arguments[0];
        if (!listener || ts.isSpreadElement(listener))
            return [];
        return isBrowserEventHandlerArgument(listener) ? [browserMediaQueryListListenerProof] : [];
    }
    function isBrowserMediaQueryListReceiver(node, use) {
        const expr = unwrapExpression(node);
        if (ts.isCallExpression(expr))
            return browserMatchMediaCallProofs(expr).includes(browserWindowMatchMediaListProof);
        if (ts.isIdentifier(expr)) {
            const declaration = visibleConstVariableDeclaration(expr, use);
            if (!declaration || !variableDeclarationIsConst(declaration) || !declaration.initializer)
                return false;
            const initializer = unwrapExpression(declaration.initializer);
            return ts.isCallExpression(initializer) && browserMatchMediaCallProofs(initializer).includes(browserWindowMatchMediaListProof);
        }
        return typeHasDomLibName(typeAt(expr), (name) => name === "MediaQueryList");
    }
    function browserIntersectionObserverCallProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        const member = node.expression.name.text;
        if (member === "observe") {
            if (node.arguments.length !== 1)
                return [];
            const target = node.arguments[0];
            if (!target || ts.isSpreadElement(target) || !isBrowserElementReceiver(target))
                return [];
            return isBrowserIntersectionObserverReceiver(node.expression.expression, node)
                ? [browserIntersectionObserverObserveProof]
                : [];
        }
        if (member === "disconnect") {
            if (node.arguments.length !== 0)
                return [];
            return isBrowserIntersectionObserverReceiver(node.expression.expression, node)
                ? [browserIntersectionObserverDisconnectProof]
                : [];
        }
        return [];
    }
    function isBrowserIntersectionObserverReceiver(node, use) {
        const expr = unwrapExpression(node);
        if (ts.isNewExpression(expr)) {
            return browserIntersectionObserverConstructorProofs(expr).includes(browserIntersectionObserverConstructorProof);
        }
        if (ts.isIdentifier(expr)) {
            const declaration = visibleConstVariableDeclaration(expr, use);
            if (!declaration || !declaration.initializer)
                return false;
            const initializer = unwrapExpression(declaration.initializer);
            return ts.isNewExpression(initializer) &&
                browserIntersectionObserverConstructorProofs(initializer).includes(browserIntersectionObserverConstructorProof);
        }
        return typeHasDomLibName(typeAt(expr), (name) => name === "IntersectionObserver");
    }
    function isBrowserBase64CodecCallName(name) {
        return name === "atob" || name === "btoa" || name === "window.atob" || name === "window.btoa";
    }
    function browserBase64CodecCallProofs(node) {
        if (node.arguments.length !== 1)
            return [];
        const input = node.arguments[0];
        if (!input || ts.isSpreadElement(input) || !isStringRuntimeArgument(input))
            return [];
        if (ts.isIdentifier(node.expression)) {
            return identifierResolvesToBrowserGlobal(node.expression) ? [browserWindowBase64CodecProof] : [];
        }
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.expression.name.text !== "atob" && node.expression.name.text !== "btoa")
            return [];
        return isBrowserWindowLikeReceiver(node.expression.expression) ? [browserWindowBase64CodecProof] : [];
    }
    function isBrowserWindowLikeReceiver(node) {
        if (ts.isIdentifier(node) &&
            (node.text === "window" || node.text === "globalThis") &&
            identifierResolvesToBrowserGlobal(node))
            return true;
        return isBrowserWindowReceiver(node);
    }
    function browserTimerCallProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        const member = node.expression.name.text;
        if (member === "clearTimeout" || member === "clearInterval")
            return node.arguments.length === 1 ? [namespaceReferenceProof] : [];
        if (member !== "setTimeout" && member !== "setInterval")
            return [];
        if (node.arguments.length < 1 || node.arguments.length > 3)
            return [];
        const handler = node.arguments[0];
        if (!handler || ts.isSpreadElement(handler))
            return [];
        if (ts.isStringLiteralLike(handler))
            return [];
        return [namespaceReferenceProof];
    }
    function browserUrlConstructorProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "URL" || !identifierResolvesToBrowserGlobal(node.expression))
            return [];
        const args = [...(node.arguments ?? [])];
        if (args.length < 1 || args.length > 2)
            return [];
        if (!isStringRuntimeArgument(args[0]))
            return [];
        if (args.length === 2 && !isStringRuntimeArgument(args[1]))
            return [];
        return [browserUrlConstructorProof];
    }
    function browserUrlSearchParamsConstructorProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "URLSearchParams" || !identifierResolvesToBrowserGlobal(node.expression))
            return [];
        const args = [...(node.arguments ?? [])];
        if (args.length === 0)
            return [browserUrlSearchParamsConstructorProof];
        if (args.length !== 1)
            return [];
        const argument = args[0];
        if (!argument || ts.isSpreadElement(argument))
            return [];
        return isStringRuntimeArgument(argument) ? [browserUrlSearchParamsConstructorProof] : [];
    }
    function browserHeadersConstructorProofs(node) {
        if (!isBrowserHeadersConstructorExpression(node.expression))
            return [];
        const args = [...(node.arguments ?? [])];
        if (args.length === 0)
            return [browserHeadersConstructorEmptyProof];
        if (args.length !== 1)
            return [];
        const init = args[0];
        if (!init || ts.isSpreadElement(init))
            return [];
        if (isHeadersStaticObjectLiteral(init, node))
            return [browserHeadersConstructorStaticObjectProof];
        return [browserHeadersConstructorInitProof];
    }
    function isBrowserHeadersConstructorExpression(node) {
        const expr = unwrapExpression(node);
        if (ts.isIdentifier(expr))
            return expr.text === "Headers" && identifierResolvesToBrowserGlobal(expr);
        return ts.isPropertyAccessExpression(expr) &&
            expr.name.text === "Headers" &&
            ts.isIdentifier(expr.expression) &&
            expr.expression.text === "globalThis";
    }
    function browserHeadersCallProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        const member = node.expression.name.text;
        if (member !== "has" && member !== "forEach")
            return [];
        if (!isBrowserHeadersReceiver(node.expression.expression))
            return [];
        if (member === "has")
            return node.arguments.length === 1 && isStringRuntimeArgument(node.arguments[0]) ? [browserHeadersHasProof] : [];
        const callback = node.arguments[0];
        return node.arguments.length === 1 && callback && !ts.isSpreadElement(callback) ? [browserHeadersForEachProof] : [];
    }
    function isBrowserHeadersReceiver(node) {
        const expr = unwrapExpression(node);
        if (typeHasDomLibName(typeAt(expr), (name) => name === "Headers"))
            return true;
        if (ts.isNewExpression(expr))
            return browserHeadersConstructorProofs(expr).length > 0;
        if (!ts.isIdentifier(expr))
            return false;
        const symbol = checker.getSymbolAtLocation(expr);
        const actual = symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
        return actual?.declarations?.some((declaration) => {
            if (!ts.isVariableDeclaration(declaration) || !declaration.initializer)
                return false;
            const initializer = unwrapExpression(declaration.initializer);
            return ts.isNewExpression(initializer) && browserHeadersConstructorProofs(initializer).length > 0;
        }) ?? false;
    }
    function isHeadersStaticObjectLiteral(node, use) {
        const expr = unwrapExpression(node);
        if (!ts.isObjectLiteralExpression(expr))
            return false;
        for (const property of expr.properties) {
            if (!ts.isPropertyAssignment(property))
                return false;
            const name = headersStaticObjectPropertyName(property.name);
            if (name === undefined || !isHeadersNameLite(name))
                return false;
            const value = stringConstValue(unwrapExpression(property.initializer), use);
            if (value === undefined || !isAscii(value))
                return false;
        }
        return true;
    }
    function headersStaticObjectPropertyName(name) {
        if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
            return name.text;
        if (ts.isComputedPropertyName(name) &&
            (ts.isStringLiteral(name.expression) || ts.isNoSubstitutionTemplateLiteral(name.expression)))
            return name.expression.text;
        return undefined;
    }
    function isHeadersNameLite(name) {
        if (name.length <= 0 || name === "__proto__")
            return false;
        for (let index = 0; index < name.length; index += 1) {
            const ch = name.charCodeAt(index);
            const ok = (ch >= 48 && ch <= 57) ||
                (ch >= 65 && ch <= 90) ||
                (ch >= 97 && ch <= 122) ||
                ch === 33 ||
                ch === 35 ||
                ch === 36 ||
                ch === 37 ||
                ch === 38 ||
                ch === 39 ||
                ch === 42 ||
                ch === 43 ||
                ch === 45 ||
                ch === 46 ||
                ch === 94 ||
                ch === 95 ||
                ch === 96 ||
                ch === 124 ||
                ch === 126;
            if (!ok)
                return false;
        }
        return true;
    }
    function browserResponseConstructorProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "Response")
            return [];
        const args = [...(node.arguments ?? [])];
        if (args.length < 1 || args.length > 2)
            return [];
        const body = args[0];
        if (!body || ts.isSpreadElement(body))
            return [];
        if (!isResponseBodyStatusLiteBody(body))
            return [];
        if (args.length === 1)
            return [browserResponseConstructorInitProof];
        const init = args[1];
        if (!init || ts.isSpreadElement(init))
            return [];
        const initExpr = unwrapExpression(init);
        if (isBrowserResponseReceiver(initExpr))
            return [browserResponseConstructorInitProof];
        if (!ts.isObjectLiteralExpression(initExpr)) {
            return isResponseInitLike(initExpr, node) ? [browserResponseConstructorInitProof] : [];
        }
        if (initExpr.properties.length === 1) {
            const statusProperty = initExpr.properties[0];
            if (!statusProperty || !ts.isPropertyAssignment(statusProperty))
                return [];
            const key = propertyNameText(statusProperty.name, node.getSourceFile());
            if (key === "status" && int32IndexValue(unwrapExpression(statusProperty.initializer)) !== undefined) {
                return [browserResponseConstructorBodyStatusProof];
            }
        }
        return responseInitObjectProof(initExpr, node) ? [browserResponseConstructorInitProof] : [];
    }
    function browserResponseCallProofs(node, name) {
        if (name === "Response.json") {
            if (!ts.isPropertyAccessExpression(node.expression))
                return [];
            if (!isBrowserResponseGlobal(node.expression.expression))
                return [];
            if (node.arguments.length < 1 || node.arguments.length > 2)
                return [];
            const init = node.arguments[1];
            if (init && (ts.isSpreadElement(init) || !isResponseInitLike(unwrapExpression(init), node)))
                return [];
            return [browserResponseJsonProof];
        }
        if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "blob")
            return [];
        if (node.arguments.length !== 0)
            return [];
        return isBrowserResponseReceiver(node.expression.expression) ? [browserResponseBlobProof] : [];
    }
    function isBrowserResponseGlobal(node) {
        const expr = unwrapExpression(node);
        return ts.isIdentifier(expr) && expr.text === "Response";
    }
    function isBrowserResponseReceiver(node) {
        const expr = unwrapExpression(node);
        if (typeHasDomLibName(typeAt(expr), (name) => name === "Response"))
            return true;
        if (ts.isNewExpression(expr))
            return browserResponseConstructorProofs(expr).length > 0;
        return false;
    }
    function responseInitObjectProof(initExpr, use) {
        if (initExpr.properties.length === 0)
            return true;
        for (const property of initExpr.properties) {
            if (!ts.isPropertyAssignment(property))
                return false;
            const key = propertyNameText(property.name, use.getSourceFile());
            const value = unwrapExpression(property.initializer);
            if (key === "status") {
                if (ts.isSpreadElement(value))
                    return false;
            }
            else if (key === "statusText") {
                if (!isStringRuntimeArgument(value) && !isPropertyAccessNamed(value, "statusText"))
                    return false;
            }
            else if (key === "headers") {
                if (!isHeadersInitLike(value, use))
                    return false;
            }
            else {
                return false;
            }
        }
        return true;
    }
    function isResponseInitLike(expr, use) {
        const unwrapped = unwrapExpression(expr);
        if (ts.isObjectLiteralExpression(unwrapped))
            return responseInitObjectProof(unwrapped, use);
        if (ts.isIdentifier(unwrapped) || ts.isPropertyAccessExpression(unwrapped))
            return true;
        return isBrowserResponseReceiver(unwrapped);
    }
    function isHeadersInitLike(expr, use) {
        const unwrapped = unwrapExpression(expr);
        if (ts.isObjectLiteralExpression(unwrapped))
            return isHeadersInitObjectLiteral(unwrapped, use);
        if (isPropertyAccessNamed(unwrapped, "headers"))
            return true;
        if (ts.isIdentifier(unwrapped))
            return true;
        return typeHasDomLibName(typeAt(unwrapped), (name) => name === "Headers");
    }
    function isHeadersInitObjectLiteral(node, use) {
        if (isHeadersStaticObjectLiteral(node, use))
            return true;
        return node.properties.every((property) => ts.isPropertyAssignment(property) || ts.isSpreadAssignment(property));
    }
    function isPropertyAccessNamed(node, name) {
        const expr = unwrapExpression(node);
        return ts.isPropertyAccessExpression(expr) && expr.name.text === name;
    }
    function browserRequestConstructorProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "Request")
            return [];
        const args = [...(node.arguments ?? [])];
        if (args.length < 1 || args.length > 2)
            return [];
        const input = args[0];
        if (!input || ts.isSpreadElement(input))
            return [];
        const init = args[1];
        if (init && ts.isSpreadElement(init))
            return [];
        return [browserRequestConstructorProof];
    }
    function browserFormDataConstructorProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "FormData")
            return [];
        const args = [...(node.arguments ?? [])];
        if (args.length > 1)
            return [];
        return args.every((argument) => !argument || !ts.isSpreadElement(argument)) ? [browserFormDataConstructorEmptyProof] : [];
    }
    function browserXhrConstructorProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "XMLHttpRequest" || !identifierResolvesToBrowserGlobal(node.expression))
            return [];
        return (node.arguments ?? []).length === 0 ? [browserXhrConstructorProof] : [];
    }
    function browserXhrCallProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        if (!isBrowserXhrReceiver(node.expression.expression))
            return [];
        const member = node.expression.name.text;
        if (member === "setRequestHeader") {
            return node.arguments.length === 2 &&
                !ts.isSpreadElement(node.arguments[0]) &&
                !ts.isSpreadElement(node.arguments[1])
                ? [browserXhrSetRequestHeaderProof]
                : [];
        }
        if (member === "getAllResponseHeaders") {
            return node.arguments.length === 0 ? [browserXhrGetAllResponseHeadersProof] : [];
        }
        return [];
    }
    function isBrowserXhrReceiver(node) {
        const expr = unwrapExpression(node);
        if (typeHasDomLibName(typeAt(expr), (name) => name === "XMLHttpRequest"))
            return true;
        if (ts.isNewExpression(expr)) {
            return browserXhrConstructorProofs(expr).includes(browserXhrConstructorProof);
        }
        if (!ts.isIdentifier(expr))
            return false;
        const symbol = checker.getSymbolAtLocation(expr);
        const actual = symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
        return actual?.declarations?.some((declaration) => {
            if (!ts.isVariableDeclaration(declaration) || !declaration.initializer)
                return false;
            const initializer = unwrapExpression(declaration.initializer);
            return ts.isNewExpression(initializer) &&
                browserXhrConstructorProofs(initializer).includes(browserXhrConstructorProof);
        }) ?? false;
    }
    function isResponseBodyStatusLiteBody(node) {
        const expr = unwrapExpression(node);
        if (expr.kind === ts.SyntaxKind.NullKeyword)
            return true;
        return !ts.isSpreadElement(node);
    }
    function isBrowserUrlSearchParamsCallName(name) {
        return name.endsWith(".searchParams.get") ||
            name.endsWith(".searchParams.set") ||
            name.endsWith(".searchParams.delete") ||
            name.endsWith(".searchParams.toString") ||
            name.endsWith(".get") ||
            name.endsWith(".set") ||
            name.endsWith(".delete") ||
            name.endsWith(".toString");
    }
    function browserUrlToStringCallProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.expression.name.text !== "toString" || node.arguments.length !== 0)
            return [];
        return isBrowserUrlReceiver(node.expression.expression) ? [browserUrlToStringProof] : [];
    }
    function browserUrlSearchParamsCallProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        if (!isBrowserUrlSearchParamsReceiver(node.expression.expression))
            return [];
        const member = node.expression.name.text;
        if (member === "get") {
            return node.arguments.length === 1 && isStringRuntimeArgument(node.arguments[0]) ? [browserUrlSearchParamsGetProof] : [];
        }
        if (member === "set") {
            return node.arguments.length === 2 &&
                isStringRuntimeArgument(node.arguments[0]) &&
                isStringRuntimeArgument(node.arguments[1])
                ? [browserUrlSearchParamsSetProof]
                : [];
        }
        if (member === "delete") {
            return node.arguments.length === 1 && isStringRuntimeArgument(node.arguments[0]) ? [browserUrlSearchParamsDeleteProof] : [];
        }
        if (member === "toString") {
            return node.arguments.length === 0 ? [browserUrlSearchParamsToStringProof] : [];
        }
        return [];
    }
    function isBrowserUrlSearchParamsReceiver(node) {
        if (ts.isPropertyAccessExpression(node) && node.name.text === "searchParams") {
            return isBrowserUrlReceiver(node.expression) ||
                typeHasDomLibName(typeAt(node), (name) => name === "URLSearchParams");
        }
        return typeHasDomLibName(typeAt(node), (name) => name === "URLSearchParams");
    }
    function isBrowserUrlReceiver(node) {
        return typeHasDomLibName(typeAt(node), (name) => name === "URL");
    }
    function isStringRuntimeArgument(node) {
        if (!node || ts.isSpreadElement(node))
            return false;
        const type = typeAt(node);
        return isRuntimeStringType(type);
    }
    function isRuntimeNumberExpression(node) {
        if (!node || ts.isSpreadElement(node))
            return false;
        const expr = unwrapExpression(node);
        if (ts.isNumericLiteral(expr))
            return true;
        if (ts.isPrefixUnaryExpression(expr) &&
            (expr.operator === ts.SyntaxKind.MinusToken || expr.operator === ts.SyntaxKind.PlusToken) &&
            ts.isNumericLiteral(expr.operand))
            return true;
        const text = typeText(typeAt(expr)).trim();
        return text === "number" || /^-?\d+(\.\d+)?$/.test(text);
    }
    function identifierResolvesToBrowserGlobal(node) {
        const symbol = checker.getSymbolAtLocation(node);
        if (!symbol)
            return true;
        const actual = (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
        const declarations = actual.declarations ?? [];
        if (declarations.length === 0)
            return true;
        if (declarations.some((declaration) => isProjectSourceFile(build.cwd, declaration.getSourceFile())))
            return false;
        return declarations.some((declaration) => {
            const classification = classifyDeclarationSource(declaration.getSourceFile(), node.text);
            return classification.runtime === "browser";
        });
    }
    function identifierResolvesToRuntimeGlobal(node) {
        const symbol = checker.getSymbolAtLocation(node);
        if (!symbol)
            return true;
        const actual = (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
        const declarations = actual.declarations ?? [];
        if (declarations.length === 0)
            return true;
        if (declarations.some((declaration) => isProjectSourceFile(build.cwd, declaration.getSourceFile())))
            return false;
        return true;
    }
    function mathCallProofs(node, name) {
        if (!ts.isPropertyAccessExpression(node.expression) || propertyAccessHasQuestionDot(node.expression))
            return [];
        if (!ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== "Math")
            return [];
        if ((name === "Math.max" || name === "Math.min") && node.arguments.length <= 0)
            return [];
        if (name !== "Math.max" && name !== "Math.min" && node.arguments.length !== 1)
            return [];
        for (const argument of node.arguments) {
            if (ts.isSpreadElement(argument) || !isPureI32ExpressionForArrayLite(argument))
                return [];
        }
        return [mathI32Proof];
    }
    function numberPredicateProofs(node) {
        if (!staticPropertyCallNamed(node, "Number", "isFinite") &&
            !staticPropertyCallNamed(node, "Number", "isInteger") &&
            !staticPropertyCallNamed(node, "Number", "isSafeInteger")) {
            return [];
        }
        if (node.arguments.length !== 1)
            return [];
        const argument = node.arguments[0];
        if (!argument || ts.isSpreadElement(argument) || !isPureI32ExpressionForArrayLite(argument))
            return [];
        return [numberPredicateI32Proof];
    }
    function numberConvertProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "Number")
            return [];
        if (node.arguments.length !== 1)
            return [];
        const argument = node.arguments[0];
        if (!argument || ts.isSpreadElement(argument) || !isPureI32OrBoolExpression(argument))
            return [];
        return [numberConvertI32BoolProof];
    }
    function booleanCallProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "Boolean")
            return [];
        if (node.arguments.length !== 1)
            return [];
        const argument = node.arguments[0];
        if (!argument || ts.isSpreadElement(argument) || !isPureI32OrBoolExpression(argument))
            return [];
        return [booleanI32BoolProof];
    }
    function stringConvertProofs(node) {
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "String")
            return [];
        if (node.arguments.length === 0)
            return [stringConvertScalarProof];
        if (node.arguments.length !== 1)
            return [];
        const argument = node.arguments[0];
        if (!argument || ts.isSpreadElement(argument))
            return [];
        if (argument.kind === ts.SyntaxKind.UndefinedKeyword || argument.kind === ts.SyntaxKind.NullKeyword) {
            return [stringConvertScalarProof];
        }
        if (ts.isIdentifier(argument) && argument.text === "undefined")
            return [stringConvertScalarProof];
        if (isPureI32OrBoolExpression(argument))
            return [stringConvertScalarProof];
        const argumentType = typeAt(argument);
        if (isRuntimeDirectStringConvertibleScalarType(argumentType)) {
            return [stringConvertScalarProof];
        }
        return [];
    }
    function promiseAwaitProofs(node) {
        return [promiseAwaitAsyncSyncI32Proof];
    }
    function asyncFunctionProofs(node) {
        return [promiseAwaitAsyncSyncI32Proof];
    }
    function generatorFunctionProofs(node) {
        return [generatorIteratorStateMachineProof];
    }
    function asyncSyncI32FunctionDeclarationForCall(node) {
        if (!ts.isIdentifier(node.expression))
            return undefined;
        const name = node.expression.text;
        const symbol = checker.getSymbolAtLocation(node.expression);
        const actual = symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
        return actual?.declarations?.find((item) => {
            return ts.isFunctionDeclaration(item) && item.name?.text === name;
        });
    }
    function isAsyncSyncI32FunctionLike(declaration) {
        if (!isProjectSourceFile(build.cwd, declaration.getSourceFile()))
            return false;
        if (!declaration.body)
            return false;
        if ("asteriskToken" in declaration && declaration.asteriskToken)
            return false;
        if (!hasModifier(declaration, ts.SyntaxKind.AsyncKeyword))
            return false;
        if ((declaration.typeParameters?.length ?? 0) > 0)
            return false;
        for (const parameter of declaration.parameters) {
            if (parameter.dotDotDotToken || parameter.questionToken || parameter.initializer)
                return false;
            const parameterText = parameter.type
                ? typeText(checker.getTypeFromTypeNode(parameter.type))
                : typeText(typeAt(parameter.name));
            if (!isI32ValueTypeText(parameterText))
                return false;
        }
        const signature = checker.getSignatureFromDeclaration(declaration);
        if (!signature)
            return false;
        return isPromiseNumberTypeText(typeText(checker.getReturnTypeOfSignature(signature)));
    }
    function unwrapParenthesizedExpression(node) {
        let current = node;
        while (ts.isParenthesizedExpression(current))
            current = current.expression;
        return current;
    }
    function callHasAnyQuestionDot(node) {
        return callHasQuestionDot(node) || Boolean(node.questionDotToken);
    }
    function isPromiseNumberTypeText(text) {
        const value = text.replace(/\s+/g, "");
        return value === "Promise<number>" || value === "global.Promise<number>" || value === "globalThis.Promise<number>";
    }
    function forOfProofs(node) {
        if (!ts.isForOfStatement(node))
            return [];
        const exprType = typeText(typeAt(node.expression));
        if (!isArrayLikeTypeText(exprType))
            return [];
        return [arrayLiteI32ForOfLocalProof];
    }
    function isRuntimeStringExpression(node) {
        const expr = unwrapParenthesizedExpression(node);
        if (stringConstValue(expr, node) !== undefined)
            return true;
        const exprType = typeAt(expr);
        return isRuntimeStringType(exprType);
    }
    function isRuntimeI32Expression(node) {
        const expr = unwrapParenthesizedExpression(node);
        if (int32IndexValue(expr) !== undefined)
            return true;
        if (isPureI32ExpressionForArrayLite(expr))
            return true;
        return isI32ValueTypeText(typeText(typeAt(expr)));
    }
    function stringLiteralMethodProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        const hasOptionalChain = propertyAccessHasQuestionDot(node.expression);
        const member = node.expression.name.text;
        const args = [...node.arguments];
        if (args.some((arg) => ts.isSpreadElement(arg)))
            return [];
        // Check if receiver is a known const ASCII string (not available with optional chaining)
        const receiver = hasOptionalChain ? undefined : stringConstValue(node.expression.expression, node);
        const receiverIsAscii = receiver !== undefined && isAscii(receiver);
        // Check if receiver has type string (dynamic, not const)
        // Use isRuntimeStringType instead of isStringLikeType to handle union types (e.g. string | null)
        const receiverType = typeAt(node.expression.expression);
        const receiverIsString = isRuntimeStringType(receiverType);
        // Optional chaining on string-typed receiver is ok for zero-arg pure methods
        const okWithOptionalChain = !hasOptionalChain || (args.length === 0 && receiverIsString);
        switch (member) {
            case "trim":
            case "toLowerCase":
            case "toUpperCase":
            case "toString":
                if (args.length !== 0)
                    return [];
                if (receiverIsAscii)
                    return [stringAsciiLiteralProof];
                if (receiverIsString)
                    return [stringTypeMethodProof];
                return [];
            case "slice":
                if (hasOptionalChain)
                    return okWithOptionalChain ? [stringTypeMethodProof] : [];
                if (args.length > 2)
                    return [];
                if (args.every((arg) => int32IndexValue(arg) !== undefined) && receiverIsAscii)
                    return [stringAsciiLiteralProof];
                return receiverIsString && args.every((arg) => isRuntimeI32Expression(arg)) ? [stringTypeMethodProof] : [];
            case "substring":
                if (hasOptionalChain)
                    return okWithOptionalChain ? [stringTypeMethodProof] : [];
                if (args.length < 1 || args.length > 2)
                    return [];
                if (args.every((arg) => int32IndexValue(arg) !== undefined) && receiverIsAscii)
                    return [stringAsciiLiteralProof];
                return receiverIsString && args.every((arg) => isRuntimeI32Expression(arg)) ? [stringTypeMethodProof] : [];
            case "replace":
                if (hasOptionalChain)
                    return okWithOptionalChain ? [stringTypeMethodProof] : [];
                if (args.length !== 2)
                    return [];
                if (args.every((arg) => stringConstValue(arg, node) !== undefined) && receiverIsAscii)
                    return [stringAsciiLiteralProof];
                if (receiverIsString && stringConstValue(args[1], node) !== undefined) {
                    if (regexLiteralSearchString(args[0]) !== undefined)
                        return [stringRegexLiteralReplaceProof];
                    if (regexLiteralAffixReplaceSpec(args[0]) !== undefined)
                        return [stringRegexLiteralAffixReplaceProof];
                    if (regexLiteralAsciiClassReplaceSpec(args[0]) !== undefined)
                        return [stringRegexAsciiClassReplaceProof];
                }
                return receiverIsString && args.every((arg) => isRuntimeStringExpression(arg)) ? [stringTypeMethodProof] : [];
            case "padStart":
            case "padEnd": {
                if (hasOptionalChain)
                    return okWithOptionalChain ? [stringTypeMethodProof] : [];
                if (args.length < 1 || args.length > 2)
                    return [];
                const targetLength = int32IndexValue(args[0]);
                if (targetLength !== undefined && targetLength >= 0 && receiverIsAscii && (args.length === 1 || stringConstValue(args[1], node) !== undefined)) {
                    return [stringAsciiLiteralProof];
                }
                if (!receiverIsString || !isRuntimeI32Expression(args[0]))
                    return [];
                if (args.length === 2 && !isRuntimeStringExpression(args[1]))
                    return [];
                return [stringTypeMethodProof];
            }
            case "repeat": {
                if (hasOptionalChain)
                    return okWithOptionalChain ? [stringTypeMethodProof] : [];
                if (args.length !== 1)
                    return [];
                const count = int32IndexValue(args[0]);
                if (count !== undefined && count >= 0 && receiverIsAscii)
                    return [stringAsciiLiteralProof];
                return receiverIsString && isRuntimeI32Expression(args[0]) ? [stringTypeMethodProof] : [];
            }
            case "charAt":
                if (hasOptionalChain)
                    return okWithOptionalChain ? [stringTypeMethodProof] : [];
                if (args.length !== 1)
                    return [];
                if (int32IndexValue(args[0]) !== undefined && receiverIsAscii)
                    return [stringAsciiLiteralProof];
                return receiverIsString && isRuntimeI32Expression(args[0]) ? [stringTypeMethodProof] : [];
            case "charCodeAt": {
                if (hasOptionalChain)
                    return okWithOptionalChain ? [stringTypeMethodProof] : [];
                if (args.length !== 1)
                    return [];
                const index = int32IndexValue(args[0]);
                if (index !== undefined && index >= 0 && receiverIsAscii && (receiver === undefined || index < receiver.length))
                    return [stringAsciiLiteralProof];
                return receiverIsString && isRuntimeI32Expression(args[0]) ? [stringTypeMethodProof] : [];
            }
            case "startsWith":
            case "includes":
            case "indexOf":
            case "lastIndexOf":
                if (hasOptionalChain)
                    return okWithOptionalChain ? [stringTypeMethodProof] : [];
                if (args.length < 1 || args.length > 2)
                    return [];
                if (args.length === 2 && !isRuntimeI32Expression(args[1]))
                    return [];
                if (stringConstValue(args[0], node) !== undefined && receiverIsAscii)
                    return [stringAsciiLiteralProof];
                if (receiverIsString && isRuntimeStringExpression(args[0]))
                    return [stringTypeMethodProof];
                return [];
            case "endsWith":
                if (hasOptionalChain)
                    return okWithOptionalChain ? [stringTypeMethodProof] : [];
                if (args.length !== 1)
                    return [];
                if (stringConstValue(args[0], node) !== undefined && receiverIsAscii)
                    return [stringAsciiLiteralProof];
                if (receiverIsString && isRuntimeStringExpression(args[0]))
                    return [stringTypeMethodProof];
                return [];
            case "split": {
                if (hasOptionalChain)
                    return okWithOptionalChain ? [stringTypeMethodProof] : [];
                if (args.length !== 1)
                    return [];
                const separator = stringConstValue(args[0], node);
                if (separator !== undefined && separator.length === 1 && receiverIsAscii)
                    return [stringAsciiLiteralProof];
                if (receiverIsString && regexLiteralLineSplitSpec(args[0]) !== undefined)
                    return [stringRegexLineSplitProof];
                if (receiverIsString && regexLiteralAsciiClassSplitSpec(args[0]) !== undefined)
                    return [stringRegexAsciiClassSplitProof];
                return receiverIsString && isRuntimeStringExpression(args[0]) ? [stringTypeMethodProof] : [];
            }
            case "match":
            case "search": {
                if (hasOptionalChain)
                    return [];
                if (args.length !== 1)
                    return [];
                const pattern = stringConstValue(args[0], node);
                if (pattern === undefined || pattern.length !== 1)
                    return [];
                if (!receiverIsAscii)
                    return [];
                return [stringAsciiLiteralProof];
            }
            case "concat": {
                if (hasOptionalChain)
                    return okWithOptionalChain ? [stringTypeMethodProof] : [];
                if (args.length === 0)
                    return [];
                if (args.every((arg) => stringConstValue(arg, node) !== undefined) && receiverIsAscii)
                    return [stringAsciiLiteralProof];
                return receiverIsString && args.every((arg) => isRuntimeStringExpression(arg)) ? [stringTypeMethodProof] : [];
            }
            default:
                // For any unrecognized method on a string-typed receiver, emit a generic proof
                if (receiverIsString && args.every((arg) => isRuntimeStringExpression(arg) || isRuntimeI32Expression(arg))) {
                    return [stringTypeMethodProof];
                }
                return [];
        }
    }
    function regexLiteralSearchString(node) {
        const parts = regexLiteralParts(node);
        if (!parts)
            return undefined;
        const flags = parts.flags;
        if (flags !== "" && flags !== "g")
            return undefined;
        const parsed = parseLiteralRegexBody(parts.body);
        return parsed.length > 0 ? parsed : undefined;
    }
    function regexLiteralAffixReplaceSpec(node) {
        const parts = regexLiteralParts(node);
        if (!parts || parts.flags !== "")
            return undefined;
        const body = parts.body;
        if (body.startsWith("^")) {
            const rest = body.slice(1);
            if (parsePrefixSingleCharClass(rest) !== undefined)
                return "prefix";
            const run = parseSingleLiteralRunBody(rest);
            if (run !== undefined && isAscii(run))
                return "prefix";
            const literal = parseLiteralRegexBody(rest);
            return literal.length > 0 && isAscii(literal) ? "prefix" : undefined;
        }
        if (body.endsWith("$") && !regexSlashEscaped(body, body.length - 1)) {
            const rest = body.slice(0, -1);
            const run = parseSingleLiteralRunBody(rest);
            if (run !== undefined && isAscii(run))
                return "suffix";
            const literal = parseLiteralRegexBody(rest);
            return literal.length > 0 && isAscii(literal) ? "suffix" : undefined;
        }
        return undefined;
    }
    function regexLiteralLineSplitSpec(node) {
        const parts = regexLiteralParts(node);
        if (!parts || parts.flags !== "")
            return undefined;
        if (parts.body === "\\r?\\n")
            return "crlf-opt-lf";
        if (parts.body === "\\r\\n|\\n|\\r")
            return "line-break";
        return undefined;
    }
    function regexLiteralAsciiClassReplaceSpec(node) {
        const parts = regexLiteralParts(node);
        if (!parts || parts.flags !== "g")
            return undefined;
        return parseAsciiClassRegexBody(parts.body);
    }
    function regexLiteralAsciiClassSplitSpec(node) {
        const parts = regexLiteralParts(node);
        if (!parts || parts.flags !== "")
            return undefined;
        return parseAsciiClassRegexBody(parts.body);
    }
    function parseAsciiClassRegexBody(body) {
        if (body.length === 0)
            return undefined;
        const run = body.endsWith("+") && !regexSlashEscaped(body, body.length - 1);
        const atom = run ? body.slice(0, -1) : body;
        if (atom === "\\s" || atom === "\\d" || atom === "\\D") {
            return run ? "run" : "single";
        }
        const parsed = parseAsciiRegexCharClass(atom);
        if (!parsed)
            return undefined;
        return run ? "run" : "single";
    }
    function parseAsciiRegexCharClass(atom) {
        if (!atom.startsWith("[") || !atom.endsWith("]"))
            return false;
        let i = atom.startsWith("[^") ? 2 : 1;
        const end = atom.length - 1;
        if (i >= end)
            return false;
        let sawToken = false;
        while (i < end) {
            const current = parseAsciiRegexClassToken(atom, i, end);
            if (!current)
                return false;
            sawToken = true;
            i = current.next;
            if (i + 1 < end && atom[i] === "-") {
                const right = parseAsciiRegexClassToken(atom, i + 1, end);
                if (!right || current.kind !== "char" || right.kind !== "char")
                    return false;
                if (current.char.charCodeAt(0) > right.char.charCodeAt(0))
                    return false;
                i = right.next;
            }
        }
        return sawToken;
    }
    function parseAsciiRegexClassToken(atom, index, end) {
        if (index >= end)
            return undefined;
        const ch = atom[index];
        if (ch === "\\") {
            if (index + 1 >= end)
                return undefined;
            const next = atom[index + 1];
            if (next === "s" || next === "d" || next === "D") {
                return { kind: "class", char: next, next: index + 2 };
            }
            if (!isAscii(next))
                return undefined;
            return { kind: "char", char: next, next: index + 2 };
        }
        if (!isAscii(ch))
            return undefined;
        return { kind: "char", char: ch, next: index + 1 };
    }
    function regexLiteralParts(node) {
        const expr = unwrapParenthesizedExpression(node);
        if (expr.kind !== ts.SyntaxKind.RegularExpressionLiteral)
            return undefined;
        const raw = expr.getText(expr.getSourceFile());
        if (!raw.startsWith("/"))
            return undefined;
        let split = -1;
        for (let i = raw.length - 1; i > 0; i -= 1) {
            if (raw[i] === "/" && !regexSlashEscaped(raw, i)) {
                split = i;
                break;
            }
        }
        if (split <= 0)
            return undefined;
        return { body: raw.slice(1, split), flags: raw.slice(split + 1) };
    }
    function regexSlashEscaped(raw, index) {
        let count = 0;
        for (let i = index - 1; i >= 0 && raw[i] === "\\"; i -= 1)
            count += 1;
        return count % 2 === 1;
    }
    function parseLiteralRegexBody(body) {
        let result = "";
        for (let i = 0; i < body.length; i += 1) {
            const ch = body[i];
            if (ch === "\\") {
                i += 1;
                if (i >= body.length)
                    return "";
                const next = body[i];
                switch (next) {
                    case "0":
                        result += "\0";
                        break;
                    case "n":
                        result += "\n";
                        break;
                    case "r":
                        result += "\r";
                        break;
                    case "t":
                        result += "\t";
                        break;
                    case "u": {
                        const hex = body.slice(i + 1, i + 5);
                        if (!/^[0-9a-fA-F]{4}$/.test(hex))
                            return "";
                        result += String.fromCharCode(parseInt(hex, 16));
                        i += 4;
                        break;
                    }
                    case "v":
                        result += "\v";
                        break;
                    case "f":
                        result += "\f";
                        break;
                    default:
                        if (!"/\\.^$*+?()[]{}|-\"'".includes(next))
                            return "";
                        result += next;
                        break;
                }
            }
            else {
                if ("\\.^$*+?()[]{}|".includes(ch))
                    return "";
                result += ch;
            }
        }
        return result;
    }
    function parseSingleLiteralRunBody(body) {
        if (!body.endsWith("+") || regexSlashEscaped(body, body.length - 1))
            return undefined;
        const literal = parseLiteralRegexBody(body.slice(0, -1));
        return literal.length === 1 ? literal : undefined;
    }
    function parsePrefixSingleCharClass(body) {
        if (!body.startsWith("[") || !body.endsWith("]"))
            return undefined;
        const chars = body.slice(1, -1);
        if (chars.length === 0)
            return undefined;
        for (const ch of chars) {
            if (ch === "\\" || ch === "^" || ch === "-" || ch === "]" || !isAscii(ch))
                return undefined;
        }
        return chars;
    }
    function objectValuesProofs(node) {
        if (!staticPropertyCallNamed(node, "Object", "values"))
            return [];
        if (node.arguments.length !== 1)
            return [];
        const argument = node.arguments[0];
        if (!argument || ts.isSpreadElement(argument))
            return [];
        if (callAssignedToLocal(node) && ts.isIdentifier(argument)) {
            const declaration = localVariableDeclaration(argument, node);
            if (declaration) {
                const objectCount = objectExpressionI32PropertyCount(argument, node);
                const arrayLength = arrayExpressionI32Length(argument, node);
                if (((objectCount !== undefined && objectCount > 0) || (arrayLength !== undefined && arrayLength > 0)) &&
                    !arrayLocalHasUnsafeUse(argument.text, declaration, node, arrayLiteReadOnlyProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls)) {
                    return [objectLiteValuesLocalProof];
                }
            }
        }
        return isRuntimeObjectValuesArgument(argument) ? [objectJsValueValuesArrayProof] : [];
    }
    function objectKeyEntryProofs(node) {
        const isObjectKeys = staticPropertyCallNamed(node, "Object", "keys");
        if (!isObjectKeys && !staticPropertyCallNamed(node, "Object", "entries"))
            return [];
        if (node.arguments.length !== 1)
            return [];
        const argument = node.arguments[0];
        if (!argument || ts.isSpreadElement(argument))
            return [];
        if (ts.isIdentifier(argument)) {
            const declaration = localVariableDeclaration(argument, node);
            if (declaration) {
                const objectCount = objectExpressionI32PropertyCount(argument, node);
                const arrayLength = arrayExpressionI32Length(argument, node);
                if ((objectCount !== undefined && objectCount > 0) || (arrayLength !== undefined && arrayLength > 0)) {
                    if (!arrayLocalHasUnsafeUse(argument.text, declaration, node, arrayLiteReadOnlyProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls)) {
                        if (isObjectKeys && callAssignedToLocal(node)) {
                            return [objectLiteKeysLocalProof];
                        }
                        if (isLengthProjection(node))
                            return [objectLiteKeyEntryLengthProof];
                    }
                }
            }
        }
        if (isObjectKeys && isLengthProjection(node) && isRuntimeObjectKeysArgument(argument)) {
            return [objectJsValueKeysLengthProof];
        }
        if (isObjectKeys && isDefaultSortReceiver(node) && isRuntimeObjectKeysArgument(argument)) {
            return [objectJsValueKeysArrayProof];
        }
        if (!isObjectKeys && isRuntimeObjectKeysArgument(argument)) {
            return [objectJsValueEntriesArrayProof];
        }
        return [];
    }
    function isRuntimeObjectKeysArgument(node) {
        const expr = unwrapParenthesizedExpression(node);
        if (ts.isObjectLiteralExpression(expr))
            return true;
        return isNonNullRuntimeObjectKeyType(typeAt(expr));
    }
    function isRuntimeObjectValuesArgument(node) {
        const expr = unwrapParenthesizedExpression(node);
        if (ts.isObjectLiteralExpression(expr))
            return true;
        return isNonNullRuntimeObjectValueType(typeAt(expr));
    }
    function isNonNullRuntimeObjectValueType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnion())
            return false;
        if (type.isIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isNonNullRuntimeObjectValueType(part, seen));
        }
        const flags = type.flags;
        if ((flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never)) !== 0)
            return false;
        if ((flags & ts.TypeFlags.StringLike) !== 0)
            return true;
        if ((flags & (ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.ESSymbolLike)) !== 0)
            return false;
        const directText = typeText(type).trim();
        if (directText === "object" || directText === "{}" || directText === "Object")
            return false;
        const apparent = checker.getApparentType(type);
        if (apparent.getCallSignatures().length > 0 || apparent.getConstructSignatures().length > 0)
            return false;
        if (checker.getIndexTypeOfType(apparent, ts.IndexKind.String) !== undefined)
            return true;
        if (checker.getIndexTypeOfType(apparent, ts.IndexKind.Number) !== undefined)
            return true;
        if (isArrayLikeTypeText(typeText(apparent)))
            return true;
        return apparent.getProperties().length > 0;
    }
    function isNonNullRuntimeObjectKeyType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isNonNullRuntimeObjectKeyType(part, seen));
        }
        const flags = type.flags;
        if ((flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never)) !== 0)
            return false;
        if ((flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.ESSymbolLike)) !== 0)
            return false;
        const directText = typeText(type).trim();
        if (directText === "object" || directText === "{}" || directText === "Object")
            return false;
        const apparent = checker.getApparentType(type);
        if (checker.getIndexTypeOfType(apparent, ts.IndexKind.String) !== undefined)
            return true;
        if (checker.getIndexTypeOfType(apparent, ts.IndexKind.Number) !== undefined)
            return true;
        if (isArrayLikeTypeText(typeText(apparent)))
            return true;
        if (apparent.getCallSignatures().length > 0 || apparent.getConstructSignatures().length > 0)
            return false;
        return apparent.getProperties().length > 0;
    }
    function objectAssignProofs(node) {
        if (!staticPropertyCallNamed(node, "Object", "assign"))
            return [];
        if (node.arguments.length < 2)
            return [];
        const target = node.arguments[0];
        if (!target || ts.isSpreadElement(target) || !objectAssignTargetIsObjectLiteral(target))
            return [];
        if (objectAssignObjectPropertyCount(target, node, true) === undefined)
            return [];
        let sourcePropertyCount = 0;
        for (let index = 1; index < node.arguments.length; index += 1) {
            const source = node.arguments[index];
            if (!source || ts.isSpreadElement(source))
                return [];
            const count = objectAssignObjectPropertyCount(source, node, false);
            if (count === undefined)
                return [];
            sourcePropertyCount += count;
        }
        if (sourcePropertyCount <= 0)
            return [];
        return [objectLiteAssignLocalProof];
    }
    function arrayFromProofs(node) {
        if (!staticPropertyCallNamed(node, "Array", "from"))
            return [];
        if (node.arguments.length !== 1 && node.arguments.length !== 2)
            return [];
        const argument = node.arguments[0];
        if (!argument || ts.isSpreadElement(argument))
            return [];
        if (isRuntimeUint8ArrayExpression(argument)) {
            if (node.arguments.length === 1)
                return [arrayLiteUint8ArrayFromProof];
            const mapper = node.arguments[1];
            if (mapper && !ts.isSpreadElement(mapper) && isUint8HexLowerMapper(mapper)) {
                return [arrayLiteUint8ArrayHexMapFromProof];
            }
            return [];
        }
        if (node.arguments.length !== 1)
            return [];
        if (arrayFromLengthUndefinedLength(argument) !== undefined)
            return [arrayLiteJsValueFromLengthProof];
        if (isRuntimeDomArrayFromCollectionExpression(argument))
            return [arrayLiteDomCollectionFromProof];
        if (isRuntimeStringSetLikeExpression(argument))
            return [arrayLiteStringSetFromProof];
        if (isStringSetValuesIteratorCall(argument))
            return [arrayLiteStringSetValuesFromProof];
        if (isStringMapKeysIteratorCall(argument))
            return [arrayLiteStringMapKeysFromProof];
        if (isStringMapValuesIteratorCall(argument))
            return [arrayLiteStringMapValuesFromProof];
        if (!callAssignedToLocal(node))
            return [];
        const length = arrayExpressionI32Length(argument, node);
        if (length === undefined || length <= 0)
            return [];
        if (ts.isIdentifier(argument)) {
            const declaration = localVariableDeclaration(argument, node);
            if (!declaration)
                return [];
            if (arrayLocalHasUnsafeUse(argument.text, declaration, node, arrayLiteReadOnlyProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls))
                return [];
        }
        return [arrayLiteI32FromLocalProof];
    }
    function mapStringI32EntryArrayLength(node) {
        const expr = unwrapArrayProofExpression(node);
        if (!ts.isArrayLiteralExpression(expr) || expr.elements.length <= 0)
            return undefined;
        if (expr.elements.length > jsObjectDefaultPropertyCapacity)
            return undefined;
        for (const element of expr.elements) {
            if (ts.isSpreadElement(element))
                return undefined;
            const tuple = unwrapArrayProofExpression(element);
            if (!ts.isArrayLiteralExpression(tuple) || tuple.elements.length !== 2)
                return undefined;
            const key = tuple.elements[0];
            const value = tuple.elements[1];
            if (!key || !value || ts.isSpreadElement(key) || ts.isSpreadElement(value))
                return undefined;
            if (stringConstValue(key, node) === undefined)
                return undefined;
            if (!isPureI32ExpressionForArrayLite(value))
                return undefined;
        }
        return expr.elements.length;
    }
    function arrayFromLengthUndefinedLength(node) {
        const object = unwrapExpression(node);
        if (!ts.isObjectLiteralExpression(object))
            return undefined;
        if (object.properties.length !== 1)
            return undefined;
        const property = object.properties[0];
        if (!property || !ts.isPropertyAssignment(property))
            return undefined;
        const name = inlineStyleObjectPropertyName(property.name);
        if (name !== "length")
            return undefined;
        const length = int32IndexValue(property.initializer);
        if (length === undefined || length < 0 || length > 4096)
            return undefined;
        return length;
    }
    function isRuntimeStringSetLikeExpression(node) {
        return isRuntimeStringSetLikeType(typeAt(node));
    }
    function isRuntimeStringSetLikeType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isRuntimeStringSetLikeType(part, seen));
        }
        const text = typeText(type).replace(/\s+/g, "");
        if (!/^(Set|ReadonlySet)</.test(text))
            return false;
        const args = checker.getTypeArguments(type);
        const elementType = args[0];
        return elementType !== undefined && isRuntimeStringType(elementType, seen);
    }
    function isRuntimeUint8ArrayExpression(node) {
        return isRuntimeUint8ArrayType(typeAt(unwrapExpression(node)));
    }
    function isRuntimeDomArrayFromCollectionExpression(node) {
        return isRuntimeDomArrayFromCollectionType(typeAt(unwrapArrayProofExpression(node)));
    }
    function isRuntimeDomArrayFromCollectionType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnion()) {
            return type.types.length > 0 && type.types.every((part) => isRuntimeDomArrayFromCollectionType(part, seen) || isEmptyArrayFallbackType(part));
        }
        if (type.isIntersection()) {
            return type.types.some((part) => isRuntimeDomArrayFromCollectionType(part, seen));
        }
        const domCollectionNames = new Set([
            "NodeList",
            "NodeListOf",
            "HTMLCollection",
            "HTMLCollectionOf",
            "FileList",
            "NamedNodeMap",
            "DataTransferItemList",
        ]);
        return typeHasDomLibName(type, (name) => domCollectionNames.has(name));
    }
    function isEmptyArrayFallbackType(type) {
        const text = typeText(type).replace(/\s+/g, "");
        return text === "never[]" || text === "readonlynever[]" || text === "[]" || text === "readonly[]";
    }
    function isRuntimeArrayBufferExpression(node) {
        return isRuntimeArrayBufferType(typeAt(unwrapExpression(node)));
    }
    function isRuntimeUint8ArrayType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isRuntimeUint8ArrayType(part, seen));
        }
        return typeHasEcmaLibName(type, "Uint8Array");
    }
    function isRuntimeArrayBufferType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isRuntimeArrayBufferType(part, seen));
        }
        return typeHasEcmaLibName(type, "ArrayBuffer");
    }
    function typeHasEcmaLibName(type, expectedName, depth = 0) {
        if (depth > 4)
            return false;
        if (type.isUnion()) {
            if (type.types.length === 0)
                return false;
            return type.types.every((item) => typeHasEcmaLibName(item, expectedName, depth + 1));
        }
        if (type.isIntersection()) {
            return type.types.some((item) => typeHasEcmaLibName(item, expectedName, depth + 1));
        }
        const symbols = [type.getSymbol(), type.aliasSymbol].filter((item) => item !== undefined);
        for (const symbol of symbols) {
            if (symbol.getName() !== expectedName)
                continue;
            for (const declaration of symbol.declarations ?? []) {
                const file = toPosix(declaration.getSourceFile().fileName);
                if (file.includes("/typescript/lib/lib.es"))
                    return true;
            }
        }
        return false;
    }
    function isUint8HexLowerMapper(node) {
        const mapper = unwrapExpression(node);
        if (!ts.isArrowFunction(mapper) && !ts.isFunctionExpression(mapper))
            return false;
        if (mapper.parameters.length !== 1)
            return false;
        const param = mapper.parameters[0];
        if (!param || !ts.isIdentifier(param.name) || param.dotDotDotToken || param.initializer)
            return false;
        const body = singleReturnExpression(mapper.body);
        if (!body)
            return false;
        return isUint8HexLowerExpression(body, param.name.text);
    }
    function singleReturnExpression(body) {
        if (!ts.isBlock(body))
            return body;
        if (body.statements.length !== 1)
            return undefined;
        const statement = body.statements[0];
        if (!statement || !ts.isReturnStatement(statement) || !statement.expression)
            return undefined;
        return statement.expression;
    }
    function isUint8HexLowerExpression(node, paramName) {
        const outer = unwrapExpression(node);
        if (!ts.isCallExpression(outer) || outer.arguments.length !== 2)
            return false;
        if (!ts.isPropertyAccessExpression(outer.expression) ||
            propertyAccessHasQuestionDot(outer.expression) ||
            outer.expression.name.text !== "padStart") {
            return false;
        }
        const targetLength = outer.arguments[0];
        const padString = outer.arguments[1];
        if (!targetLength || !padString || ts.isSpreadElement(targetLength) || ts.isSpreadElement(padString))
            return false;
        if (int32IndexValue(targetLength) !== 2)
            return false;
        if (stringLiteralText(padString) !== "0")
            return false;
        const toStringCall = unwrapExpression(outer.expression.expression);
        if (!ts.isCallExpression(toStringCall) || toStringCall.arguments.length !== 1)
            return false;
        if (!ts.isPropertyAccessExpression(toStringCall.expression) ||
            propertyAccessHasQuestionDot(toStringCall.expression) ||
            toStringCall.expression.name.text !== "toString") {
            return false;
        }
        const radix = toStringCall.arguments[0];
        if (!radix || ts.isSpreadElement(radix) || int32IndexValue(radix) !== 16)
            return false;
        const receiver = unwrapExpression(toStringCall.expression.expression);
        return ts.isIdentifier(receiver) && receiver.text === paramName;
    }
    function stringLiteralText(node) {
        const value = unwrapExpression(node);
        if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
            return value.text;
        return undefined;
    }
    function arrayIsArrayProofs(node) {
        if (!staticPropertyCallNamed(node, "Array", "isArray"))
            return [];
        return [arrayLiteI32IsArrayLocalProof];
    }
    function objectFreezeProofs(node) {
        if (!staticPropertyCallNamed(node, "Object", "freeze"))
            return [];
        if (node.arguments.length !== 1)
            return [];
        const argument = node.arguments[0];
        if (!argument || ts.isSpreadElement(argument))
            return [];
        if (callAssignedToLocal(node)) {
            if (arrayExpressionI32Length(argument, node) !== undefined) {
                if (ts.isIdentifier(argument)) {
                    const declaration = localVariableDeclaration(argument, node);
                    if (!declaration)
                        return [];
                    if (arrayLocalHasUnsafeUse(argument.text, declaration, node, arrayLiteReadOnlyProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls))
                        return [];
                }
                return [arrayLiteI32FreezeLocalProof];
            }
            if (objectExpressionI32PropertyCount(argument, node) !== undefined) {
                if (ts.isIdentifier(argument)) {
                    const declaration = localVariableDeclaration(argument, node);
                    if (!declaration)
                        return [];
                    if (arrayLocalHasUnsafeUse(argument.text, declaration, node, new Set(), arrayObjectLiteReadOnlyArgumentCalls))
                        return [];
                }
                return [objectLiteFreezeLocalProof];
            }
        }
        const freshJsValueProof = objectFreezeFreshJsValueProof(argument, node);
        if (freshJsValueProof)
            return [freshJsValueProof];
        return [];
    }
    function objectFreezeFreshJsValueProof(node, use, seen = new Set()) {
        const expr = unwrapExpression(node);
        if (ts.isArrayLiteralExpression(expr)) {
            return isFreshJsValueArrayLiteral(expr) ? arrayLiteJsValueFreezeFreshProof : undefined;
        }
        if (ts.isObjectLiteralExpression(expr)) {
            return isFreshJsValueObjectLiteral(expr) ? objectJsValueFreezeFreshProof : undefined;
        }
        if (ts.isIdentifier(expr)) {
            const declaration = localVariableDeclaration(expr, use);
            if (!declaration ||
                variableDeclarationKind(declaration) !== "const" ||
                !declaration.initializer ||
                seen.has(declaration)) {
                return undefined;
            }
            if (arrayLocalHasUnsafeUse(expr.text, declaration, use))
                return undefined;
            seen.add(declaration);
            return objectFreezeFreshJsValueProof(declaration.initializer, declaration, seen);
        }
        return undefined;
    }
    function isFreshJsValueArrayLiteral(node) {
        return node.elements.every((element) => !ts.isSpreadElement(element) && !ts.isOmittedExpression(element));
    }
    function isFreshJsValueObjectLiteral(node) {
        return node.properties.every((property) => {
            if (ts.isSpreadAssignment(property) ||
                ts.isMethodDeclaration(property) ||
                ts.isGetAccessorDeclaration(property) ||
                ts.isSetAccessorDeclaration(property)) {
                return false;
            }
            if (ts.isPropertyAssignment(property))
                return isStaticFreezeObjectPropertyName(property.name);
            if (ts.isShorthandPropertyAssignment(property))
                return property.name.text !== "__proto__";
            return false;
        });
    }
    function isStaticFreezeObjectPropertyName(name) {
        if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
            return name.text !== "__proto__";
        return false;
    }
    function objectIsFrozenProofs(node) {
        if (!staticPropertyCallNamed(node, "Object", "isFrozen"))
            return [];
        if (node.arguments.length !== 1)
            return [];
        const argument = node.arguments[0];
        if (!argument || ts.isSpreadElement(argument) || !ts.isIdentifier(argument))
            return [];
        const declaration = localVariableDeclaration(argument, node);
        if (!declaration)
            return [];
        if (arrayExpressionI32Length(argument, node) !== undefined || objectValuesLocalArrayLength(argument, node) !== undefined) {
            if (arrayLocalHasUnsafeUse(argument.text, declaration, node, arrayLiteReadOnlyProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls))
                return [];
            return [arrayLiteI32IsFrozenLocalProof];
        }
        if (objectExpressionI32PropertyCount(argument, node) !== undefined) {
            if (arrayLocalHasUnsafeUse(argument.text, declaration, node, new Set(), arrayObjectLiteReadOnlyArgumentCalls))
                return [];
            return [objectLiteIsFrozenLocalProof];
        }
        return [];
    }
    function objectValuesLocalArrayLength(receiver, use) {
        const declaration = localVariableDeclaration(receiver, use);
        if (!declaration || !declaration.initializer || !ts.isCallExpression(declaration.initializer))
            return undefined;
        const initializer = declaration.initializer;
        if (!staticPropertyCallNamed(initializer, "Object", "values"))
            return undefined;
        if (initializer.arguments.length !== 1)
            return undefined;
        const argument = initializer.arguments[0];
        if (!argument || ts.isSpreadElement(argument) || !ts.isIdentifier(argument))
            return undefined;
        const argumentDeclaration = localVariableDeclaration(argument, declaration);
        if (!argumentDeclaration)
            return undefined;
        if (arrayLocalHasUnsafeUse(argument.text, argumentDeclaration, declaration, new Set(), arrayObjectLiteReadOnlyArgumentCalls))
            return undefined;
        const length = objectExpressionI32PropertyCount(argument, declaration);
        return length !== undefined && length > 0 ? length : undefined;
    }
    function arrayPushProofs(node) {
        const receiver = arrayMutableLocalReceiver(node, "push");
        if (receiver && node.arguments.length > 0) {
            let i32 = true;
            for (const argument of node.arguments) {
                if (ts.isSpreadElement(argument) || !isPureI32ExpressionForArrayLite(argument)) {
                    i32 = false;
                    break;
                }
            }
            if (i32)
                return [arrayLiteI32PushLocalProof];
        }
        const jsValueReceiver = jsValueArrayMutableReceiver(node, "push");
        if (!jsValueReceiver || node.arguments.length <= 0)
            return [];
        if (node.arguments.some((argument) => ts.isSpreadElement(argument)))
            return [];
        return [arrayLiteJsValuePushLocalProof];
    }
    function arrayPopProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (node.arguments.length !== 0)
            return [];
        const receiverType = typeText(typeAt(node.expression.expression));
        if (!isArrayLikeTypeText(receiverType))
            return [];
        return [arrayLiteI32PopLocalProof];
    }
    function arrayShiftProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (node.arguments.length !== 0)
            return [];
        const receiverType = typeText(typeAt(node.expression.expression));
        if (!isArrayLikeTypeText(receiverType))
            return [];
        return [arrayLiteI32ShiftLocalProof];
    }
    function arrayUnshiftProofs(node) {
        const receiver = arrayMutableLocalReceiver(node, "unshift");
        if (!receiver || receiver.length <= 0 || node.arguments.length <= 0)
            return [];
        for (const argument of node.arguments) {
            if (ts.isSpreadElement(argument) || !isPureI32ExpressionForArrayLite(argument))
                return [];
        }
        return [arrayLiteI32UnshiftLocalProof];
    }
    function arrayIncludesProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.expression.name.text !== "includes")
            return [];
        if (node.arguments.length !== 1)
            return [];
        const argument = node.arguments[0];
        if (!argument || ts.isSpreadElement(argument))
            return [];
        const receiver = node.expression.expression;
        if (arrayConstStringArrayLength(receiver, node) !== undefined && isStringRuntimeValueExpression(argument)) {
            return [arrayLiteConstStringIncludesProof];
        }
        if (isPureI32ExpressionForArrayLite(argument) && ts.isIdentifier(receiver)) {
            const declaration = localVariableDeclaration(receiver, node);
            if (declaration && arrayReceiverHasArrayLiteProof(receiver, declaration) &&
                !arrayLocalHasUnsafeUse(receiver.text, declaration, node, arrayLiteReadOnlyProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls)) {
                return [arrayLiteI32IncludesProof];
            }
        }
        return isJsValueArrayLikeExpression(receiver) ? [arrayLiteJsValueIncludesProof] : [];
    }
    function arrayIndexOfProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.expression.name.text !== "indexOf" && node.expression.name.text !== "lastIndexOf")
            return [];
        if (node.arguments.length !== 1)
            return [];
        const argument = node.arguments[0];
        if (!argument || ts.isSpreadElement(argument))
            return [];
        const receiver = node.expression.expression;
        if (node.expression.name.text === "indexOf" &&
            isRuntimeStringArrayLikeExpression(unwrapArrayProofExpression(receiver)) &&
            isPureStringIndexOfNeedle(argument, node)) {
            return [arrayLiteStringIndexOfProof];
        }
        if (!callAssignedToLocal(node))
            return [];
        if (!isPureI32ExpressionForArrayLite(argument))
            return [];
        if (!ts.isIdentifier(receiver))
            return [];
        const declaration = localVariableDeclaration(receiver, node);
        if (!declaration)
            return [];
        if (!arrayReceiverHasArrayLiteProof(receiver, declaration))
            return [];
        if (arrayLocalHasUnsafeUse(receiver.text, declaration, node, arrayLiteReadOnlyProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls))
            return [];
        return [arrayLiteI32IndexOfLocalProof];
    }
    function isPureStringIndexOfNeedle(node, use) {
        const expr = unwrapArrayProofExpression(node);
        if (containsCompoundMutation(expr))
            return false;
        if (stringConstValue(expr, use) !== undefined)
            return true;
        if (ts.isIdentifier(expr))
            return isStringRuntimeValueExpression(expr);
        if (ts.isPropertyAccessExpression(expr) && !propertyAccessHasQuestionDot(expr))
            return isStringRuntimeValueExpression(expr);
        return false;
    }
    function arrayPredicateProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.expression.name.text !== "every" && node.expression.name.text !== "some")
            return [];
        if (node.arguments.length !== 1)
            return [];
        const predicate = node.arguments[0];
        if (!predicate || ts.isSpreadElement(predicate))
            return [];
        const receiverExpr = node.expression.expression;
        if (arrayBooleanConstructorPredicateProofs(receiverExpr, predicate).length > 0) {
            return [arrayLiteJsValuePredicateTruthyProof];
        }
        if (arrayJsValueLocalCallbackPredicateProofs(receiverExpr, predicate, node).length > 0) {
            return [arrayLiteJsValueCallbackPredicateProof];
        }
        if (node.expression.name.text === "some") {
            if (arrayConstStringArrayLength(receiverExpr, node) !== undefined &&
                arraySomeConstStringEndsWithPredicate(predicate)) {
                return [arrayLiteConstStringSomeEndsWithProof];
            }
            if (arraySomeConstStringHaystackStringMethodPredicate(receiverExpr, predicate, node)) {
                return [arrayLiteConstStringSomeHaystackStringMethodProof];
            }
            if (arraySomeStringItemStringMethodPredicate(receiverExpr, predicate, node)) {
                return [arrayLiteStringSomeItemStringMethodProof];
            }
            if (arraySomeObjectScalarPropertyConjunctionEqualsPredicate(receiverExpr, predicate, node)) {
                return [arrayLiteJsValueObjectSomeScalarPropertyConjunctionEqualsProof];
            }
            if (arraySomeObjectBooleanPropertyTruthyPredicate(receiverExpr, predicate, node)) {
                return [arrayLiteJsValueObjectSomeScalarPropertyEqualsProof];
            }
            if (arraySomeObjectScalarPropertyEqualsPredicate(receiverExpr, predicate, node)) {
                return [arrayLiteJsValueObjectSomeScalarPropertyEqualsProof];
            }
        }
        if (!ts.isIdentifier(predicate))
            return [];
        if (!functionDeclarationMatchesUnary(predicate, "boolean"))
            return [];
        const receiver = node.expression.expression;
        if (!ts.isIdentifier(receiver))
            return [];
        const declaration = localVariableDeclaration(receiver, node);
        if (!declaration)
            return [];
        if (!arrayReceiverHasArrayLiteProof(receiver, declaration))
            return [];
        if (arrayLocalHasUnsafeUse(receiver.text, declaration, node, arrayLiteReadOnlyProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls))
            return [];
        return [arrayLiteI32PredicateProof];
    }
    function arrayBooleanConstructorPredicateProofs(receiver, predicate) {
        const expr = unwrapArrayProofExpression(predicate);
        if (!ts.isIdentifier(expr) || expr.text !== "Boolean" || !identifierResolvesToRuntimeGlobal(expr))
            return [];
        return isJsValueArrayLikeExpression(unwrapArrayProofExpression(receiver)) ? [arrayLiteJsValuePredicateTruthyProof] : [];
    }
    function arrayJsValueLocalCallbackPredicateProofs(receiver, predicate, use) {
        if (!jsValueConstArrayReceiverHasRuntimeProof(receiver, use))
            return [];
        if (!ts.isIdentifier(predicate))
            return [];
        const declaration = visibleConstVariableDeclaration(predicate, use);
        if (!declaration?.initializer)
            return [];
        const initializer = unwrapExpression(declaration.initializer);
        if (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer))
            return [];
        if (initializer.parameters.length < 1 || initializer.parameters.length > 2)
            return [];
        if (hasModifier(initializer, ts.SyntaxKind.AsyncKeyword) || ("asteriskToken" in initializer && initializer.asteriskToken))
            return [];
        if ((initializer.typeParameters?.length ?? 0) > 0)
            return [];
        const signature = checker.getSignatureFromDeclaration(initializer);
        if (!signature)
            return [];
        return isBooleanTypeText(typeText(checker.getReturnTypeOfSignature(signature))) ? [arrayLiteJsValueCallbackPredicateProof] : [];
    }
    function jsValueConstArrayReceiverHasRuntimeProof(receiver, use) {
        const expr = unwrapArrayProofExpression(receiver);
        if (ts.isArrayLiteralExpression(expr))
            return isJsValueArrayLikeExpression(expr);
        if (!ts.isIdentifier(expr))
            return false;
        const declaration = visibleConstVariableDeclaration(expr, use);
        if (!declaration?.initializer || !variableDeclarationIsConst(declaration))
            return false;
        return isJsValueArrayLikeExpression(expr);
    }
    function arraySomeConstStringEndsWithPredicate(node) {
        const expr = unwrapParenthesizedExpression(node);
        if (!ts.isArrowFunction(expr) && !ts.isFunctionExpression(expr))
            return false;
        if (expr.parameters.length !== 1)
            return false;
        const param = expr.parameters[0];
        if (!ts.isIdentifier(param.name) || param.dotDotDotToken || param.initializer || param.questionToken)
            return false;
        const body = expr.body;
        if (ts.isBlock(body)) {
            if (body.statements.length !== 1)
                return false;
            const statement = body.statements[0];
            if (!ts.isReturnStatement(statement) || !statement.expression)
                return false;
            return isEndsWithCallUsingParam(statement.expression, param.name.text);
        }
        return isEndsWithCallUsingParam(body, param.name.text);
    }
    function arraySomeStringItemStringMethodPredicate(receiver, predicate, use) {
        if (!isRuntimeStringArrayLikeExpression(unwrapArrayProofExpression(receiver)))
            return false;
        const body = inlineUnaryPredicateBody(predicate);
        if (!body)
            return false;
        const call = stringMethodCallShape(body.body);
        if (!call)
            return false;
        const target = unwrapArrayProofExpression(call.target);
        if (!ts.isIdentifier(target) || target.text !== body.paramName)
            return false;
        if (expressionReferencesIdentifier(call.argument, body.paramName))
            return false;
        return isPureRuntimeStringExpression(call.argument, use, body.paramName);
    }
    function arraySomeConstStringHaystackStringMethodPredicate(receiver, predicate, use) {
        if (arrayConstStringArrayLength(receiver, use) === undefined)
            return false;
        const body = inlineUnaryPredicateBody(predicate);
        if (!body)
            return false;
        const call = stringMethodCallShape(body.body);
        if (!call)
            return false;
        const argument = unwrapArrayProofExpression(call.argument);
        if (!ts.isIdentifier(argument) || argument.text !== body.paramName)
            return false;
        if (expressionReferencesIdentifier(call.target, body.paramName))
            return false;
        return isPureRuntimeStringExpression(call.target, use, body.paramName);
    }
    function arraySomeObjectScalarPropertyEqualsPredicate(receiver, predicate, use) {
        if (!isRuntimeObjectArrayLikeExpression(unwrapArrayProofExpression(receiver)))
            return false;
        const body = inlineUnaryPredicateBody(predicate);
        if (!body)
            return false;
        const expr = unwrapArrayProofExpression(body.body);
        if (!ts.isBinaryExpression(expr) || expr.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken)
            return false;
        return objectScalarPropertyEqualsSide(expr.left, expr.right, body.paramName) ||
            objectScalarPropertyEqualsSide(expr.right, expr.left, body.paramName);
    }
    function arraySomeObjectScalarPropertyConjunctionEqualsPredicate(receiver, predicate, use) {
        if (!isRuntimeObjectArrayLikeExpression(unwrapArrayProofExpression(receiver)))
            return false;
        const body = inlineUnaryPredicateBody(predicate);
        if (!body)
            return false;
        const terms = flattenAmpersandAmpersand(body.body);
        if (terms.length < 2)
            return false;
        return terms.every((term) => {
            const expr = unwrapArrayProofExpression(term);
            if (!ts.isBinaryExpression(expr) || expr.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken)
                return false;
            return objectScalarPropertyEqualsSide(expr.left, expr.right, body.paramName) ||
                objectScalarPropertyEqualsSide(expr.right, expr.left, body.paramName);
        });
    }
    function arraySomeObjectBooleanPropertyTruthyPredicate(receiver, predicate, use) {
        if (!isRuntimeObjectArrayLikeExpression(unwrapArrayProofExpression(receiver)))
            return false;
        const body = inlineUnaryPredicateBody(predicate);
        if (!body)
            return false;
        const property = unwrapArrayProofExpression(body.body);
        if (!ts.isPropertyAccessExpression(property) || propertyAccessHasQuestionDot(property))
            return false;
        const target = unwrapArrayProofExpression(property.expression);
        if (!ts.isIdentifier(target) || target.text !== body.paramName)
            return false;
        return isRuntimeBooleanType(typeAt(property));
    }
    function arrayFindIndexObjectScalarPropertyDisjunctionEqualsPredicate(receiver, predicate, use) {
        if (!isRuntimeObjectArrayLikeExpression(unwrapArrayProofExpression(receiver)))
            return false;
        const body = inlineUnaryPredicateBody(predicate);
        if (!body)
            return false;
        const terms = flattenBarBar(body.body);
        if (terms.length < 2)
            return false;
        return terms.every((term) => {
            const expr = unwrapArrayProofExpression(term);
            if (!ts.isBinaryExpression(expr) || expr.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken)
                return false;
            return objectScalarPropertyEqualsSide(expr.left, expr.right, body.paramName) ||
                objectScalarPropertyEqualsSide(expr.right, expr.left, body.paramName);
        });
    }
    function flattenAmpersandAmpersand(node, out = []) {
        const expr = unwrapArrayProofExpression(node);
        if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
            flattenAmpersandAmpersand(expr.left, out);
            flattenAmpersandAmpersand(expr.right, out);
            return out;
        }
        out.push(expr);
        return out;
    }
    function flattenBarBar(node, out = []) {
        const expr = unwrapArrayProofExpression(node);
        if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
            flattenBarBar(expr.left, out);
            flattenBarBar(expr.right, out);
            return out;
        }
        out.push(expr);
        return out;
    }
    function objectScalarPropertyEqualsSide(propertySide, valueSide, paramName) {
        const property = unwrapArrayProofExpression(propertySide);
        if (!ts.isPropertyAccessExpression(property) || propertyAccessHasQuestionDot(property))
            return false;
        const target = unwrapArrayProofExpression(property.expression);
        if (!ts.isIdentifier(target) || target.text !== paramName)
            return false;
        if (!isRuntimeOptionalScalarPropertyComparableType(typeAt(property)))
            return false;
        if (expressionReferencesIdentifier(valueSide, paramName))
            return false;
        if (containsCompoundMutation(valueSide) || containsCallOrNewExpression(valueSide))
            return false;
        return isRuntimeScalarComparableType(typeAt(valueSide));
    }
    function isRuntimeBooleanType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isRuntimeBooleanType(part, seen));
        }
        return (type.flags & ts.TypeFlags.BooleanLike) !== 0;
    }
    function isRuntimeOptionalScalarPropertyComparableType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnion()) {
            const scalarParts = type.types.filter((part) => {
                const flags = part.flags;
                return (flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)) === 0;
            });
            return scalarParts.length > 0 && scalarParts.every((part) => isRuntimeScalarComparableType(part));
        }
        if (type.isIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isRuntimeOptionalScalarPropertyComparableType(part, seen));
        }
        const flags = type.flags;
        return (flags & (ts.TypeFlags.StringLike |
            ts.TypeFlags.NumberLike |
            ts.TypeFlags.BooleanLike |
            ts.TypeFlags.EnumLike)) !== 0;
    }
    function inlineUnaryPredicateBody(node) {
        const expr = unwrapArrayProofExpression(node);
        if (!ts.isArrowFunction(expr) && !ts.isFunctionExpression(expr))
            return undefined;
        if (hasModifier(expr, ts.SyntaxKind.AsyncKeyword))
            return undefined;
        if (ts.isFunctionExpression(expr) && expr.asteriskToken)
            return undefined;
        if ((expr.typeParameters?.length ?? 0) > 0)
            return undefined;
        if (expr.parameters.length !== 1)
            return undefined;
        const param = expr.parameters[0];
        if (!ts.isIdentifier(param.name) || param.dotDotDotToken || param.initializer || param.questionToken)
            return undefined;
        const body = expr.body;
        if (ts.isBlock(body)) {
            if (body.statements.length !== 1)
                return undefined;
            const statement = body.statements[0];
            if (!ts.isReturnStatement(statement) || !statement.expression)
                return undefined;
            return { paramName: param.name.text, body: unwrapArrayProofExpression(statement.expression) };
        }
        return { paramName: param.name.text, body: unwrapArrayProofExpression(body) };
    }
    function stringMethodCallShape(node) {
        const expr = unwrapArrayProofExpression(node);
        if (!ts.isCallExpression(expr) || expr.arguments.length !== 1)
            return undefined;
        if (callHasAnyQuestionDot(expr))
            return undefined;
        if (!ts.isPropertyAccessExpression(expr.expression) || propertyAccessHasQuestionDot(expr.expression))
            return undefined;
        if (!isArraySomeStringMethodName(expr.expression.name.text))
            return undefined;
        const argument = expr.arguments[0];
        if (!argument || ts.isSpreadElement(argument))
            return undefined;
        return { target: expr.expression.expression, argument };
    }
    function isArraySomeStringMethodName(name) {
        return name === "includes" || name === "startsWith" || name === "endsWith";
    }
    function isPureRuntimeStringExpression(node, use, callbackParamName) {
        const expr = unwrapArrayProofExpression(node);
        if (expressionReferencesIdentifier(expr, callbackParamName))
            return false;
        if (containsCompoundMutation(expr))
            return false;
        if (stringConstValue(expr, use) !== undefined)
            return true;
        if (ts.isIdentifier(expr))
            return isStringRuntimeValueExpression(expr);
        if (ts.isPropertyAccessExpression(expr) && !propertyAccessHasQuestionDot(expr)) {
            return isStringRuntimeValueExpression(expr);
        }
        if (ts.isCallExpression(expr) && !callHasAnyQuestionDot(expr) &&
            ts.isPropertyAccessExpression(expr.expression) &&
            !propertyAccessHasQuestionDot(expr.expression) &&
            expr.arguments.length === 0 &&
            (expr.expression.name.text === "trim" ||
                expr.expression.name.text === "toLowerCase" ||
                expr.expression.name.text === "toUpperCase")) {
            return isPureRuntimeStringExpression(expr.expression.expression, use, callbackParamName) &&
                isStringRuntimeValueExpression(expr);
        }
        return false;
    }
    function isEndsWithCallUsingParam(node, paramName) {
        const expr = unwrapParenthesizedExpression(node);
        if (!ts.isCallExpression(expr) || expr.arguments.length !== 1)
            return false;
        if (!ts.isPropertyAccessExpression(expr.expression) || propertyAccessHasQuestionDot(expr.expression))
            return false;
        if (expr.expression.name.text !== "endsWith")
            return false;
        const argument = expr.arguments[0];
        if (!argument || ts.isSpreadElement(argument))
            return false;
        const suffix = unwrapParenthesizedExpression(argument);
        if (!ts.isIdentifier(suffix) || suffix.text !== paramName)
            return false;
        return isStringRuntimeValueExpression(expr.expression.expression);
    }
    function arrayAtProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.arguments.length !== 1)
            return [];
        const argument = node.arguments[0];
        if (!argument || ts.isSpreadElement(argument))
            return [];
        if (!isI32ValueTypeText(typeText(typeAt(argument))))
            return [];
        if (arrayExpressionI32Length(node.expression.expression, node) === undefined)
            return [];
        return [arrayLiteI32AtProof];
    }
    function arrayFindIndexProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.arguments.length !== 1)
            return [];
        const predicate = node.arguments[0];
        if (!predicate || ts.isSpreadElement(predicate))
            return [];
        const receiver = node.expression.expression;
        if (arrayFindIndexObjectScalarPropertyDisjunctionEqualsPredicate(receiver, predicate, node)) {
            return [arrayLiteJsValueObjectFindIndexScalarPropertyDisjunctionEqualsProof];
        }
        if (arraySomeObjectScalarPropertyConjunctionEqualsPredicate(receiver, predicate, node)) {
            return [arrayLiteJsValueObjectFindIndexScalarPropertyConjunctionEqualsProof];
        }
        if (arraySomeObjectScalarPropertyEqualsPredicate(receiver, predicate, node)) {
            return [arrayLiteJsValueObjectFindIndexScalarPropertyEqualsProof];
        }
        if (!ts.isIdentifier(predicate))
            return [];
        if (!functionDeclarationMatchesUnary(predicate, "boolean"))
            return [];
        if (!ts.isIdentifier(receiver))
            return [];
        const declaration = localVariableDeclaration(receiver, node);
        if (!declaration)
            return [];
        if (!arrayReceiverHasArrayLiteProof(receiver, declaration))
            return [];
        if (arrayLocalHasUnsafeUse(receiver.text, declaration, node, arrayLiteReadOnlyProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls))
            return [];
        return [arrayLiteI32FindIndexLocalProof];
    }
    function arraySliceProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        const receiverType = typeText(typeAt(node.expression.expression));
        if (!isArrayLikeTypeText(receiverType))
            return [];
        return [arrayLiteI32SliceLocalProof];
    }
    function arrayConcatProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        const receiverType = typeText(typeAt(node.expression.expression));
        if (!isArrayLikeTypeText(receiverType))
            return [];
        return [arrayLiteI32ConcatLocalProof];
    }
    function arrayReverseProofs(node) {
        if (!arrayMutatingLocalArrayCallProof(node, "reverse"))
            return [];
        if (node.arguments.length !== 0)
            return [];
        return [arrayLiteI32ReverseLocalProof];
    }
    function arraySortProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.expression.name.text !== "sort")
            return [];
        const receiver = node.expression.expression;
        if (node.arguments.length === 0) {
            return denseStringDefaultSortProofs(receiver, node);
        }
        if (node.arguments.length !== 1)
            return [];
        const comparator = node.arguments[0];
        if (!comparator || ts.isSpreadElement(comparator))
            return [];
        const inlineDirection = inlineI32DiffComparatorDirection(comparator);
        if (inlineDirection && i32SortReceiverHasRuntimeProof(receiver, node)) {
            return inlineDirection === "ascending"
                ? [arrayLiteI32InlineDiffSortProof]
                : [arrayLiteI32InlineDiffDescSortProof];
        }
        const destructuredIndexProof = inlineI32DestructuredArrayIndexComparatorSortProof(comparator);
        if (destructuredIndexProof && jsValueKeySortReceiverHasRuntimeProof(receiver, node)) {
            return [destructuredIndexProof];
        }
        const inlineKeyProof = inlineI32KeyComparatorSortProof(comparator);
        if (inlineKeyProof && jsValueKeySortReceiverHasRuntimeProof(receiver, node)) {
            return [inlineKeyProof];
        }
        if (stringDefaultComparatorSortProof(comparator) && stringSortReceiverHasRuntimeProof(receiver, node)) {
            return [arrayLiteStringDefaultSortProof];
        }
        if (!arrayMutatingLocalArrayCallProof(node, "sort"))
            return [];
        const declaration = ts.isIdentifier(receiver) ? localVariableDeclaration(receiver, node) : undefined;
        if (!declaration)
            return [];
        const length = arrayReceiverI32Length(receiver, declaration);
        if (length === undefined || length > 16)
            return [];
        if (!ts.isIdentifier(comparator))
            return [];
        if (!functionDeclarationMatchesFixedI32(comparator, 2, "number"))
            return [];
        return [arrayLiteI32SortLocalProof];
    }
    function i32SortReceiverHasRuntimeProof(receiver, use) {
        const expr = unwrapArrayProofExpression(receiver);
        if (ts.isIdentifier(expr)) {
            const declaration = localVariableDeclaration(expr, use);
            if (declaration?.initializer && isObjectFreezeCall(unwrapArrayProofExpression(declaration.initializer)))
                return false;
        }
        return isI32ArrayTypeText(typeText(typeAt(expr)));
    }
    function jsValueKeySortReceiverHasRuntimeProof(receiver, use) {
        const expr = unwrapArrayProofExpression(receiver);
        if (ts.isIdentifier(expr)) {
            const declaration = localVariableDeclaration(expr, use);
            if (declaration?.initializer && isObjectFreezeCall(unwrapArrayProofExpression(declaration.initializer)))
                return false;
        }
        return isArrayLikeTypeText(typeText(typeAt(expr)));
    }
    function stringSortReceiverHasRuntimeProof(receiver, use) {
        const expr = unwrapArrayProofExpression(receiver);
        if (ts.isIdentifier(expr)) {
            const declaration = localVariableDeclaration(expr, use);
            if (declaration?.initializer && isObjectFreezeCall(unwrapArrayProofExpression(declaration.initializer)))
                return false;
        }
        return isRuntimeStringArrayLikeExpression(expr);
    }
    function inlineI32DiffComparatorDirection(node) {
        const expr = unwrapComparatorExpression(node);
        if (!ts.isArrowFunction(expr) && !ts.isFunctionExpression(expr))
            return undefined;
        if (hasModifier(expr, ts.SyntaxKind.AsyncKeyword))
            return undefined;
        if ("asteriskToken" in expr && expr.asteriskToken)
            return undefined;
        if ((expr.typeParameters?.length ?? 0) > 0)
            return undefined;
        if (expr.parameters.length !== 2)
            return undefined;
        const leftParam = expr.parameters[0];
        const rightParam = expr.parameters[1];
        if (!leftParam || !rightParam)
            return undefined;
        if (!inlineI32ComparatorParam(leftParam) || !inlineI32ComparatorParam(rightParam))
            return undefined;
        const leftName = leftParam.name.text;
        const rightName = rightParam.name.text;
        const signature = checker.getSignatureFromDeclaration(expr);
        if (!signature || !isI32ValueTypeText(typeText(checker.getReturnTypeOfSignature(signature))))
            return undefined;
        const body = inlineComparatorReturnExpression(expr.body);
        if (!body)
            return undefined;
        const cmp = unwrapArrayProofExpression(body);
        if (!ts.isBinaryExpression(cmp) || cmp.operatorToken.kind !== ts.SyntaxKind.MinusToken)
            return undefined;
        const left = unwrapArrayProofExpression(cmp.left);
        const right = unwrapArrayProofExpression(cmp.right);
        if (ts.isIdentifier(left) && ts.isIdentifier(right)) {
            if (left.text === leftName && right.text === rightName)
                return "ascending";
            if (left.text === rightName && right.text === leftName)
                return "descending";
        }
        return undefined;
    }
    function stringDefaultComparatorSortProof(node) {
        const expr = unwrapComparatorExpression(node);
        if (ts.isIdentifier(expr)) {
            const declaration = functionDeclarationForIdentifier(expr);
            return declaration !== undefined && stringDefaultComparatorFunctionLike(declaration);
        }
        if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
            return stringDefaultComparatorFunctionLike(expr);
        }
        return false;
    }
    function stringDefaultComparatorFunctionLike(expr) {
        if (hasModifier(expr, ts.SyntaxKind.AsyncKeyword))
            return false;
        if ("asteriskToken" in expr && expr.asteriskToken)
            return false;
        if ((expr.typeParameters?.length ?? 0) > 0)
            return false;
        if (expr.parameters.length !== 2)
            return false;
        const leftParam = expr.parameters[0];
        const rightParam = expr.parameters[1];
        if (!leftParam || !rightParam)
            return false;
        if (!stringComparatorIdentifierParam(leftParam) || !stringComparatorIdentifierParam(rightParam))
            return false;
        if (!expr.body)
            return false;
        const leftName = leftParam.name.text;
        const rightName = rightParam.name.text;
        return ts.isBlock(expr.body)
            ? stringDefaultComparatorBlock(expr.body, leftName, rightName)
            : stringDefaultComparatorExpression(expr.body, leftName, rightName);
    }
    function stringComparatorIdentifierParam(param) {
        if (!ts.isIdentifier(param.name))
            return false;
        if (param.dotDotDotToken || param.questionToken || param.initializer)
            return false;
        const paramType = param.type ? checker.getTypeFromTypeNode(param.type) : typeAt(param.name);
        return isRuntimeStringType(paramType);
    }
    function stringDefaultComparatorBlock(body, leftName, rightName) {
        const statements = body.statements;
        if (statements.length === 3) {
            const less = statements[0];
            const greater = statements[1];
            const equal = statements[2];
            return less !== undefined &&
                greater !== undefined &&
                equal !== undefined &&
                stringComparatorIfReturn(less, leftName, rightName, ts.SyntaxKind.LessThanToken, -1) &&
                stringComparatorIfReturn(greater, leftName, rightName, ts.SyntaxKind.GreaterThanToken, 1) &&
                stringComparatorReturn(equal, 0);
        }
        if (statements.length === 2) {
            const equal = statements[0];
            const order = statements[1];
            return equal !== undefined &&
                order !== undefined &&
                stringComparatorIfReturn(equal, leftName, rightName, ts.SyntaxKind.EqualsEqualsEqualsToken, 0) &&
                ts.isReturnStatement(order) &&
                order.expression !== undefined &&
                stringDefaultComparatorStrictOrderExpression(order.expression, leftName, rightName);
        }
        return false;
    }
    function stringComparatorIfReturn(statement, leftName, rightName, operator, value) {
        if (!ts.isIfStatement(statement) || statement.elseStatement)
            return false;
        return stringComparatorBinaryExpression(statement.expression, leftName, rightName, operator) &&
            stringComparatorReturn(statement.thenStatement, value);
    }
    function stringComparatorReturn(statement, value) {
        if (ts.isBlock(statement)) {
            if (statement.statements.length !== 1)
                return false;
            const only = statement.statements[0];
            return only !== undefined && stringComparatorReturn(only, value);
        }
        if (!ts.isReturnStatement(statement) || !statement.expression)
            return false;
        return numericComparatorReturnValue(statement.expression) === value;
    }
    function stringDefaultComparatorExpression(node, leftName, rightName) {
        const expr = unwrapComparatorExpression(node);
        if (!ts.isConditionalExpression(expr))
            return false;
        if (stringComparatorBinaryExpression(expr.condition, leftName, rightName, ts.SyntaxKind.LessThanToken) &&
            numericComparatorReturnValue(expr.whenTrue) === -1) {
            const fallback = unwrapComparatorExpression(expr.whenFalse);
            return ts.isConditionalExpression(fallback) &&
                stringComparatorBinaryExpression(fallback.condition, leftName, rightName, ts.SyntaxKind.GreaterThanToken) &&
                numericComparatorReturnValue(fallback.whenTrue) === 1 &&
                numericComparatorReturnValue(fallback.whenFalse) === 0;
        }
        if (stringComparatorBinaryExpression(expr.condition, leftName, rightName, ts.SyntaxKind.GreaterThanToken) &&
            numericComparatorReturnValue(expr.whenTrue) === 1) {
            const fallback = unwrapComparatorExpression(expr.whenFalse);
            return ts.isConditionalExpression(fallback) &&
                stringComparatorBinaryExpression(fallback.condition, leftName, rightName, ts.SyntaxKind.LessThanToken) &&
                numericComparatorReturnValue(fallback.whenTrue) === -1 &&
                numericComparatorReturnValue(fallback.whenFalse) === 0;
        }
        if (stringComparatorBinaryExpression(expr.condition, leftName, rightName, ts.SyntaxKind.EqualsEqualsEqualsToken) &&
            numericComparatorReturnValue(expr.whenTrue) === 0) {
            return stringDefaultComparatorStrictOrderExpression(expr.whenFalse, leftName, rightName);
        }
        return false;
    }
    function stringDefaultComparatorStrictOrderExpression(node, leftName, rightName) {
        const expr = unwrapComparatorExpression(node);
        if (!ts.isConditionalExpression(expr))
            return false;
        return (stringComparatorBinaryExpression(expr.condition, leftName, rightName, ts.SyntaxKind.LessThanToken) &&
            numericComparatorReturnValue(expr.whenTrue) === -1 &&
            numericComparatorReturnValue(expr.whenFalse) === 1) ||
            (stringComparatorBinaryExpression(expr.condition, leftName, rightName, ts.SyntaxKind.GreaterThanToken) &&
                numericComparatorReturnValue(expr.whenTrue) === 1 &&
                numericComparatorReturnValue(expr.whenFalse) === -1);
    }
    function stringComparatorBinaryExpression(node, leftName, rightName, operator) {
        const expr = unwrapComparatorExpression(node);
        if (!ts.isBinaryExpression(expr) || expr.operatorToken.kind !== operator)
            return false;
        const left = unwrapComparatorExpression(expr.left);
        const right = unwrapComparatorExpression(expr.right);
        return ts.isIdentifier(left) && left.text === leftName && ts.isIdentifier(right) && right.text === rightName;
    }
    function numericComparatorReturnValue(node) {
        const expr = unwrapComparatorExpression(node);
        if (ts.isNumericLiteral(expr)) {
            const value = Number(expr.text);
            return Number.isInteger(value) ? value : undefined;
        }
        if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.MinusToken) {
            const operand = unwrapComparatorExpression(expr.operand);
            if (!ts.isNumericLiteral(operand))
                return undefined;
            const value = Number(operand.text);
            return Number.isInteger(value) ? -value : undefined;
        }
        return undefined;
    }
    function inlineI32ComparatorParam(param) {
        if (!ts.isIdentifier(param.name))
            return false;
        if (param.dotDotDotToken || param.questionToken || param.initializer)
            return false;
        const paramType = param.type ? checker.getTypeFromTypeNode(param.type) : typeAt(param.name);
        return isI32ValueTypeText(typeText(paramType));
    }
    function inlineI32DestructuredArrayIndexComparatorSortProof(node) {
        const expr = unwrapComparatorExpression(node);
        if (!ts.isArrowFunction(expr) && !ts.isFunctionExpression(expr))
            return undefined;
        if (hasModifier(expr, ts.SyntaxKind.AsyncKeyword))
            return undefined;
        if ("asteriskToken" in expr && expr.asteriskToken)
            return undefined;
        if ((expr.typeParameters?.length ?? 0) > 0)
            return undefined;
        if (expr.parameters.length !== 2)
            return undefined;
        const leftParam = expr.parameters[0];
        const rightParam = expr.parameters[1];
        if (!leftParam || !rightParam)
            return undefined;
        const leftKey = inlineI32DestructuredArrayIndexParam(leftParam);
        const rightKey = inlineI32DestructuredArrayIndexParam(rightParam);
        if (!leftKey || !rightKey || leftKey.index !== rightKey.index)
            return undefined;
        const signature = checker.getSignatureFromDeclaration(expr);
        if (!signature || !isI32ValueTypeText(typeText(checker.getReturnTypeOfSignature(signature))))
            return undefined;
        const body = inlineComparatorReturnExpression(expr.body);
        if (!body)
            return undefined;
        const cmp = unwrapArrayProofExpression(body);
        if (!ts.isBinaryExpression(cmp) || cmp.operatorToken.kind !== ts.SyntaxKind.MinusToken)
            return undefined;
        const left = unwrapArrayProofExpression(cmp.left);
        const right = unwrapArrayProofExpression(cmp.right);
        if (!ts.isIdentifier(left) || !ts.isIdentifier(right))
            return undefined;
        if (left.text === leftKey.name && right.text === rightKey.name)
            return arrayLiteArrayI32IndexInlineDiffSortProof;
        if (left.text === rightKey.name && right.text === leftKey.name)
            return arrayLiteArrayI32IndexInlineDiffDescSortProof;
        return undefined;
    }
    function inlineI32DestructuredArrayIndexParam(param) {
        if (param.dotDotDotToken || param.questionToken || param.initializer)
            return undefined;
        if (!ts.isArrayBindingPattern(param.name))
            return undefined;
        if (param.name.elements.length !== 1)
            return undefined;
        const element = param.name.elements[0];
        if (!element || ts.isOmittedExpression(element))
            return undefined;
        if (element.dotDotDotToken || element.initializer || !ts.isIdentifier(element.name))
            return undefined;
        if (!isI32ValueTypeText(typeText(typeAt(element.name))))
            return undefined;
        return { name: element.name.text, index: 0 };
    }
    function inlineComparatorReturnExpression(body) {
        return ts.isBlock(body) ? undefined : body;
    }
    function inlineI32KeyComparatorSortProof(node) {
        const expr = unwrapComparatorExpression(node);
        if (!ts.isArrowFunction(expr) && !ts.isFunctionExpression(expr))
            return undefined;
        if (hasModifier(expr, ts.SyntaxKind.AsyncKeyword))
            return undefined;
        if ("asteriskToken" in expr && expr.asteriskToken)
            return undefined;
        if ((expr.typeParameters?.length ?? 0) > 0)
            return undefined;
        if (expr.parameters.length !== 2)
            return undefined;
        const leftParam = expr.parameters[0];
        const rightParam = expr.parameters[1];
        if (!leftParam || !rightParam)
            return undefined;
        if (!inlineComparatorIdentifierParam(leftParam) || !inlineComparatorIdentifierParam(rightParam))
            return undefined;
        const leftName = leftParam.name.text;
        const rightName = rightParam.name.text;
        const signature = checker.getSignatureFromDeclaration(expr);
        if (!signature || !isI32ValueTypeText(typeText(checker.getReturnTypeOfSignature(signature))))
            return undefined;
        const body = inlineComparatorReturnExpression(expr.body);
        if (!body)
            return undefined;
        const cmp = unwrapKeyAccessExpression(body);
        if (!ts.isBinaryExpression(cmp) || cmp.operatorToken.kind !== ts.SyntaxKind.MinusToken)
            return undefined;
        const left = inlineI32KeyAccess(cmp.left);
        const right = inlineI32KeyAccess(cmp.right);
        if (!left || !right || !sameInlineI32KeyAccess(left, right))
            return undefined;
        if (left.paramName === leftName && right.paramName === rightName) {
            return inlineI32KeyProofName(left, "ascending");
        }
        if (left.paramName === rightName && right.paramName === leftName) {
            return inlineI32KeyProofName(left, "descending");
        }
        return undefined;
    }
    function inlineComparatorIdentifierParam(param) {
        if (!ts.isIdentifier(param.name))
            return false;
        return !param.dotDotDotToken && !param.questionToken && !param.initializer;
    }
    function inlineI32KeyAccess(node) {
        const expr = unwrapKeyAccessExpression(node);
        const nullishZeroOperand = nullishZeroKeyOperand(expr);
        if (nullishZeroOperand) {
            return inlineI32DefaultZeroKeyAccess(nullishZeroOperand, "nullish_zero");
        }
        const logicalOrZeroOperand = logicalOrZeroKeyOperand(expr);
        if (logicalOrZeroOperand) {
            return inlineI32DefaultZeroKeyAccess(logicalOrZeroOperand, "logical_or_zero");
        }
        if (!isI32ValueTypeText(typeText(typeAt(expr))))
            return undefined;
        const access = inlineRawI32KeyAccess(expr);
        return access ? { ...access, zeroMode: "none" } : undefined;
    }
    function inlineI32DefaultZeroKeyAccess(node, zeroMode) {
        const access = inlineRawI32KeyAccess(node);
        if (!access || !isOptionalI32ValueType(typeAt(node)))
            return undefined;
        if (access.kind === "object_path" && access.path.length !== 1)
            return undefined;
        return { ...access, zeroMode };
    }
    function inlineRawI32KeyAccess(expr) {
        const objectPath = inlineObjectPropertyPathAccess(expr);
        if (objectPath)
            return objectPath;
        const arrayIndex = inlineArrayIndexKeyAccess(expr);
        if (arrayIndex)
            return arrayIndex;
        return undefined;
    }
    function inlineObjectPropertyPathAccess(node) {
        const pathParts = [];
        let current = node;
        while (ts.isPropertyAccessExpression(current)) {
            if (propertyAccessHasQuestionDot(current))
                return undefined;
            pathParts.unshift(current.name.text);
            current = unwrapKeyAccessExpression(current.expression);
        }
        if (!ts.isIdentifier(current) || pathParts.length <= 0)
            return undefined;
        const rootType = typeAt(current);
        if (isArrayLikeTypeText(typeText(rootType)))
            return undefined;
        if (!isNonNullRuntimeObjectKeyType(rootType))
            return undefined;
        return { kind: "object_path", paramName: current.text, path: pathParts };
    }
    function inlineArrayIndexKeyAccess(node) {
        const expr = unwrapKeyAccessExpression(node);
        if (!ts.isElementAccessExpression(expr) || elementAccessHasQuestionDot(expr))
            return undefined;
        if (!expr.argumentExpression)
            return undefined;
        const receiver = unwrapKeyAccessExpression(expr.expression);
        if (!ts.isIdentifier(receiver))
            return undefined;
        if (!isArrayLikeTypeText(typeText(typeAt(receiver))))
            return undefined;
        const index = int32IndexValue(expr.argumentExpression);
        if (index === undefined || index < 0)
            return undefined;
        return { kind: "array_index", paramName: receiver.text, index };
    }
    function sameInlineI32KeyAccess(left, right) {
        if (left.kind !== right.kind)
            return false;
        if (left.zeroMode !== right.zeroMode)
            return false;
        if (left.kind === "array_index")
            return right.kind === "array_index" && left.index === right.index;
        return right.kind === "object_path" &&
            left.path.length === right.path.length &&
            left.path.every((part, index) => part === right.path[index]);
    }
    function inlineI32KeyProofName(access, direction) {
        if (access.kind === "array_index") {
            if (access.zeroMode === "nullish_zero") {
                return direction === "ascending"
                    ? arrayLiteArrayOptionalI32IndexNullishZeroInlineDiffSortProof
                    : arrayLiteArrayOptionalI32IndexNullishZeroInlineDiffDescSortProof;
            }
            if (access.zeroMode === "logical_or_zero") {
                return direction === "ascending"
                    ? arrayLiteArrayOptionalI32IndexLogicalOrZeroInlineDiffSortProof
                    : arrayLiteArrayOptionalI32IndexLogicalOrZeroInlineDiffDescSortProof;
            }
            return direction === "ascending" ? arrayLiteArrayI32IndexInlineDiffSortProof : arrayLiteArrayI32IndexInlineDiffDescSortProof;
        }
        if (access.zeroMode === "nullish_zero") {
            return direction === "ascending"
                ? arrayLiteObjectOptionalI32KeyNullishZeroInlineDiffSortProof
                : arrayLiteObjectOptionalI32KeyNullishZeroInlineDiffDescSortProof;
        }
        if (access.zeroMode === "logical_or_zero") {
            return direction === "ascending"
                ? arrayLiteObjectOptionalI32KeyLogicalOrZeroInlineDiffSortProof
                : arrayLiteObjectOptionalI32KeyLogicalOrZeroInlineDiffDescSortProof;
        }
        return direction === "ascending" ? arrayLiteObjectI32KeyInlineDiffSortProof : arrayLiteObjectI32KeyInlineDiffDescSortProof;
    }
    function nullishZeroKeyOperand(node) {
        const expr = unwrapKeyAccessExpression(node);
        if (!ts.isBinaryExpression(expr) || expr.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken)
            return undefined;
        return isZeroNumericLiteralExpression(expr.right) ? unwrapKeyAccessExpression(expr.left) : undefined;
    }
    function logicalOrZeroKeyOperand(node) {
        const expr = unwrapKeyAccessExpression(node);
        if (!ts.isBinaryExpression(expr) || expr.operatorToken.kind !== ts.SyntaxKind.BarBarToken)
            return undefined;
        return isZeroNumericLiteralExpression(expr.right) ? unwrapKeyAccessExpression(expr.left) : undefined;
    }
    function isZeroNumericLiteralExpression(node) {
        const expr = unwrapKeyAccessExpression(node);
        return ts.isNumericLiteral(expr) && expr.text === "0";
    }
    function isOptionalI32ValueType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            let hasI32 = false;
            for (const part of type.types) {
                if (isNullishType(part))
                    continue;
                if (!isOptionalI32ValueType(part, seen))
                    return false;
                hasI32 = true;
            }
            return hasI32;
        }
        return isI32ValueTypeText(typeText(type));
    }
    function isNullishType(type) {
        return (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0;
    }
    function unwrapKeyAccessExpression(node) {
        let current = node;
        while (ts.isParenthesizedExpression(current))
            current = current.expression;
        return current;
    }
    function unwrapComparatorExpression(node) {
        let current = node;
        while (ts.isParenthesizedExpression(current))
            current = current.expression;
        return current;
    }
    function elementAccessHasQuestionDot(node) {
        return Boolean(node.questionDotToken);
    }
    function denseStringDefaultSortProofs(receiver, use) {
        const expr = unwrapArrayProofExpression(receiver);
        if (localStableConstStringArrayLength(expr, use) !== undefined)
            return [arrayLiteStringDefaultSortProof];
        if (ts.isCallExpression(expr)) {
            if (staticPropertyCallNamed(expr, "Object", "keys")) {
                const argument = expr.arguments[0];
                return expr.arguments.length === 1 &&
                    argument !== undefined &&
                    !ts.isSpreadElement(argument) &&
                    isRuntimeObjectKeysArgument(argument)
                    ? [arrayLiteObjectKeysDefaultSortProof]
                    : [];
            }
            if (staticPropertyCallNamed(expr, "Array", "from")) {
                const argument = expr.arguments[0];
                if (expr.arguments.length === 1 &&
                    argument !== undefined &&
                    !ts.isSpreadElement(argument) &&
                    isStringMapKeysIteratorCall(argument)) {
                    return [arrayLiteStringMapKeysDefaultSortProof];
                }
            }
            return isRuntimeStringArrayLikeExpression(expr) ? [arrayLiteStringDefaultSortProof] : [];
        }
        if (ts.isArrayLiteralExpression(expr)) {
            if (!isRuntimeStringArrayLikeExpression(expr))
                return [];
            if (expr.elements.length <= 0)
                return [];
            let hasMapKeysSpread = false;
            for (const element of expr.elements) {
                if (ts.isOmittedExpression(element))
                    return [];
                if (ts.isSpreadElement(element)) {
                    if (!isStringMapKeysIteratorCall(element.expression))
                        return [];
                    hasMapKeysSpread = true;
                }
                else if (!isStringRuntimeValueExpression(element)) {
                    return [];
                }
            }
            return hasMapKeysSpread ? [arrayLiteStringMapKeysDefaultSortProof] : [arrayLiteStringDefaultSortProof];
        }
        return isRuntimeStringArrayLikeExpression(expr) ? [arrayLiteStringDefaultSortProof] : [];
    }
    function unwrapArrayProofExpression(node) {
        let current = node;
        while (ts.isParenthesizedExpression(current) ||
            ts.isAsExpression(current) ||
            ts.isTypeAssertionExpression(current) ||
            ts.isSatisfiesExpression(current) ||
            ts.isNonNullExpression(current)) {
            current = current.expression;
        }
        return current;
    }
    function isStringMapKeysIteratorCall(node) {
        const expr = unwrapArrayProofExpression(node);
        if (!ts.isCallExpression(expr))
            return false;
        if (expr.arguments.length !== 0)
            return false;
        if (!ts.isPropertyAccessExpression(expr.expression))
            return false;
        if (propertyAccessHasQuestionDot(expr.expression))
            return false;
        if (expr.expression.name.text !== "keys")
            return false;
        if (!isRuntimeStringMapLikeExpression(expr.expression.expression))
            return false;
        return isStringIteratorType(typeAt(expr));
    }
    function isStringMapValuesIteratorCall(node) {
        const expr = unwrapArrayProofExpression(node);
        if (!ts.isCallExpression(expr))
            return false;
        if (expr.arguments.length !== 0)
            return false;
        if (!ts.isPropertyAccessExpression(expr.expression))
            return false;
        if (propertyAccessHasQuestionDot(expr.expression))
            return false;
        if (expr.expression.name.text !== "values")
            return false;
        if (!isRuntimeStringMapLikeExpression(expr.expression.expression))
            return false;
        return isIteratorType(typeAt(expr));
    }
    function isStringSetValuesIteratorCall(node) {
        const expr = unwrapArrayProofExpression(node);
        if (!ts.isCallExpression(expr))
            return false;
        if (expr.arguments.length !== 0)
            return false;
        if (!ts.isPropertyAccessExpression(expr.expression))
            return false;
        if (propertyAccessHasQuestionDot(expr.expression))
            return false;
        if (expr.expression.name.text !== "values")
            return false;
        if (!isRuntimeStringSetLikeExpression(expr.expression.expression))
            return false;
        return isStringIteratorType(typeAt(expr));
    }
    function spreadProofs(node) {
        return isStringMapKeysIteratorCall(node.expression) ? [arrayLiteStringMapKeysSpreadProof] : [];
    }
    function collectionMapStringKeysProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.expression.name.text !== "keys" || node.arguments.length !== 0)
            return [];
        if (!isRuntimeStringMapLikeExpression(node.expression.expression))
            return [];
        return isStringIteratorType(typeAt(node)) ? [collectionMapStringKeysIteratorProof] : [];
    }
    function collectionMapStringValuesProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.expression.name.text !== "values" || node.arguments.length !== 0)
            return [];
        if (isRuntimeStringSetLikeExpression(node.expression.expression)) {
            return isStringIteratorType(typeAt(node)) ? [collectionSetStringValuesIteratorProof] : [];
        }
        if (!isRuntimeStringMapLikeExpression(node.expression.expression))
            return [];
        return isIteratorType(typeAt(node)) ? [collectionMapStringValuesIteratorProof] : [];
    }
    function isRuntimeStringMapLikeExpression(node) {
        return isRuntimeStringMapLikeType(typeAt(unwrapArrayProofExpression(node)));
    }
    function isRuntimeStringMapLikeType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isRuntimeStringMapLikeType(part, seen));
        }
        const text = typeText(type).replace(/\s+/g, "");
        if (!/^(Map|ReadonlyMap)</.test(text))
            return false;
        const args = checker.getTypeArguments(type);
        const keyType = args[0];
        return keyType !== undefined && isRuntimeStringType(keyType, seen);
    }
    function isStringIteratorType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isStringIteratorType(part, seen));
        }
        const text = typeText(type).replace(/\s+/g, "");
        return /^(IterableIterator|Iterator|MapIterator|SetIterator|ArrayIterator)<string/.test(text);
    }
    function isIteratorType(type, seen = new Set()) {
        if (seen.has(type))
            return false;
        seen.add(type);
        if (type.isUnionOrIntersection()) {
            return type.types.length > 0 && type.types.every((part) => isIteratorType(part, seen));
        }
        const text = typeText(type).replace(/\s+/g, "");
        return /^(IterableIterator|Iterator|IteratorObject|MapIterator|SetIterator|ArrayIterator)<.+/.test(text);
    }
    function arrayFillProofs(node) {
        if (!arrayMutatingLocalArrayCallProof(node, "fill"))
            return [];
        if (node.arguments.length !== 1)
            return [];
        const value = node.arguments[0];
        if (!value || ts.isSpreadElement(value) || !isPureI32ExpressionForArrayLite(value))
            return [];
        return [arrayLiteI32FillLocalProof];
    }
    function arrayReduceProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (propertyAccessHasQuestionDot(node.expression))
            return [];
        if (node.expression.name.text !== "reduce")
            return [];
        if (node.arguments.length !== 2)
            return [];
        const reducer = node.arguments[0];
        const initial = node.arguments[1];
        if (!reducer || ts.isSpreadElement(reducer) || !ts.isIdentifier(reducer))
            return [];
        if (!initial || ts.isSpreadElement(initial) || !isPureI32ExpressionForArrayLite(initial))
            return [];
        if (!functionDeclarationMatchesFixedI32(reducer, 2, "number"))
            return [];
        const receiver = node.expression.expression;
        if (!ts.isIdentifier(receiver))
            return [];
        const declaration = localVariableDeclaration(receiver, node);
        if (!declaration)
            return [];
        const length = arrayReceiverI32Length(receiver, declaration);
        if (length === undefined || length <= 0)
            return [];
        if (arrayLocalHasUnsafeUse(receiver.text, declaration, node, arrayLiteReadOnlyProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls))
            return [];
        return [arrayLiteI32ReduceProof];
    }
    function arrayMapProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (node.arguments.length !== 1)
            return [];
        const receiverType = typeText(typeAt(node.expression.expression));
        if (!isArrayLikeTypeText(receiverType))
            return [];
        return [arrayLiteI32MapLocalProof];
    }
    function arrayFilterLengthProofs(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return [];
        if (node.arguments.length !== 1)
            return [];
        const receiverType = typeText(typeAt(node.expression.expression));
        if (!isArrayLikeTypeText(receiverType))
            return [];
        return [arrayLiteI32FilterLengthProof];
    }
    function arrayLiteralProofs(node) {
        if (node.elements.length === 0)
            return [arrayLiteEmptyProof];
        if (node.elements.every((element) => !ts.isSpreadElement(element) && isPureI32ExpressionForArrayLite(element))) {
            return [arrayLiteI32Proof];
        }
        if (node.elements.every((element) => !ts.isSpreadElement(element) && isConstStringLiteralElement(element))) {
            return [arrayLiteConstStringLiteralProof, arrayLiteJsValueScalarLiteralProof];
        }
        if (node.elements.every((element) => !ts.isSpreadElement(element) && isJsValueScalarLiteralElement(element))) {
            return [arrayLiteJsValueScalarLiteralProof];
        }
        if (isArrayLikeTypeText(typeText(typeAt(node))) && node.elements.every((element) => !ts.isSpreadElement(element))) {
            return [arrayLiteJsValueLiteralProof];
        }
        if (isArrayLikeTypeText(typeText(typeAt(node))) && node.elements.every((element) => {
            return ts.isSpreadElement(element) ? isJsValueArrayLikeExpression(element.expression) : true;
        })) {
            return [arrayLiteJsValueSpreadLiteralProof];
        }
        return [];
    }
    function isConstStringLiteralElement(node) {
        if (ts.isParenthesizedExpression(node))
            return isConstStringLiteralElement(node.expression);
        return ts.isStringLiteralLike(node);
    }
    function isJsValueScalarLiteralElement(node) {
        if (ts.isParenthesizedExpression(node))
            return isJsValueScalarLiteralElement(node.expression);
        if (ts.isStringLiteralLike(node))
            return true;
        if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword)
            return true;
        if (ts.isIdentifier(node) && node.text === "undefined")
            return true;
        return int32IndexValue(node) !== undefined;
    }
    function moduleImportProofs(moduleName, classification) {
        if (classification.runtime === "node" && classification.source === "external_package" && (moduleName === "react" || moduleName === "react-dom/client")) {
            return [reactModuleImportPureRuntimeProof];
        }
        return [];
    }
    function arrayLengthProofs(receiver, use) {
        if (i32TupleLength(receiver) !== undefined)
            return [arrayLiteI32Proof];
        const i32Length = localStableArrayI32Length(receiver, use);
        if (i32Length !== undefined)
            return [arrayLiteI32Proof];
        const stringLength = localStableConstStringArrayLength(receiver, use);
        if (stringLength !== undefined)
            return [arrayLiteStaticLengthProof];
        // Fallback: local variable with number[] type but unknown static length
        if (isI32ArrayLocal(receiver, use))
            return [arrayLiteI32LocalProof];
        if (isJsValueArrayLikeExpression(receiver))
            return [arrayLiteJsValueLocalProof];
        return [];
    }
    function isJsValueArrayLikeExpression(node) {
        return isArrayLikeTypeText(typeText(typeAt(node)));
    }
    function isI32ArrayLocal(receiver, use) {
        const expr = unwrapParenthesizedExpression(receiver);
        if (!ts.isIdentifier(expr))
            return false;
        const declaration = localVariableDeclaration(expr, use);
        if (!declaration)
            return false;
        const type = typeAt(expr);
        const typeTextValue = typeText(type);
        return isI32ArrayTypeText(typeTextValue);
    }
    function arrayIndexProofs(receiver, argument) {
        const receiverType = typeText(typeAt(receiver));
        if (isArrayLikeTypeText(receiverType))
            return [arrayLiteI32Proof];
        return [];
    }
    function localVariableDeclaration(identifier, use) {
        const symbol = checker.getSymbolAtLocation(identifier);
        const declaration = symbol?.declarations?.find((item) => {
            return ts.isVariableDeclaration(item) && ts.isIdentifier(item.name) && item.name.text === identifier.text;
        });
        if (!declaration)
            return undefined;
        const useScope = enclosingFunctionScope(use);
        if (!useScope || enclosingFunctionScope(declaration) !== useScope)
            return undefined;
        return declaration;
    }
    function visibleConstVariableDeclaration(identifier, use) {
        const symbol = checker.getSymbolAtLocation(identifier);
        const declaration = symbol?.declarations?.find((item) => {
            return ts.isVariableDeclaration(item) &&
                ts.isIdentifier(item.name) &&
                item.name.text === identifier.text &&
                variableDeclarationIsConst(item);
        });
        if (!declaration || declaration.getSourceFile() !== use.getSourceFile())
            return undefined;
        if (declaration.getStart() > use.getStart())
            return undefined;
        const declarationScope = enclosingFunctionScope(declaration);
        if (!declarationScope)
            return undefined;
        let current = use;
        while (current) {
            if (current === declarationScope)
                return declaration;
            current = current.parent;
        }
        return undefined;
    }
    function arrayReceiverHasArrayLiteProof(receiver, declaration) {
        if (arrayReceiverI32Length(receiver, declaration) !== undefined)
            return true;
        // Fallback: check type for number[] without static initializer
        if (ts.isIdentifier(receiver)) {
            const type = typeAt(receiver);
            return isI32ArrayTypeText(typeText(type));
        }
        return false;
    }
    function arrayReceiverI32Length(receiver, declaration) {
        const tupleLength = i32TupleLength(receiver);
        if (tupleLength !== undefined)
            return tupleLength;
        if (declaration.initializer !== undefined) {
            return arrayExpressionI32Length(declaration.initializer, declaration);
        }
        return undefined;
    }
    function arrayExpressionI32Length(node, use, seen = new Set()) {
        if (ts.isParenthesizedExpression(node))
            return arrayExpressionI32Length(node.expression, use, seen);
        if (ts.isArrayLiteralExpression(node))
            return arrayLiteralI32Length(node);
        if (ts.isIdentifier(node)) {
            const tupleLength = i32TupleLength(node);
            if (tupleLength !== undefined)
                return tupleLength;
            const declaration = localVariableDeclaration(node, use);
            if (!declaration || seen.has(declaration))
                return undefined;
            seen.add(declaration);
            return declaration.initializer ? arrayExpressionI32Length(declaration.initializer, declaration, seen) : undefined;
        }
        if (ts.isCallExpression(node)) {
            if (staticPropertyCallNamed(node, "Array", "from") || staticPropertyCallNamed(node, "Object", "freeze")) {
                if (node.arguments.length !== 1)
                    return undefined;
                const argument = node.arguments[0];
                if (!argument || ts.isSpreadElement(argument))
                    return undefined;
                return arrayExpressionI32Length(argument, use, seen);
            }
        }
        return undefined;
    }
    function localStableArrayI32Length(node, use) {
        const receiver = unwrapParenthesizedExpression(node);
        if (!ts.isIdentifier(receiver))
            return undefined;
        const declaration = localVariableDeclaration(receiver, use);
        if (!declaration || arrayLocalHasUnsafeUse(receiver.text, declaration, use, arrayLiteReadOnlyProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls))
            return undefined;
        return declaration.initializer ? stableArrayI32Length(declaration.initializer, declaration) : undefined;
    }
    function localStableConstStringArrayLength(node, use) {
        const receiver = unwrapParenthesizedExpression(node);
        if (!ts.isIdentifier(receiver))
            return undefined;
        const declaration = localVariableDeclaration(receiver, use);
        if (!declaration || arrayLocalHasUnsafeUse(receiver.text, declaration, use))
            return undefined;
        if (!declaration.initializer)
            return undefined;
        const objectKeysLength = objectKeysLocalStringArrayLength(declaration.initializer, declaration);
        if (objectKeysLength !== undefined)
            return objectKeysLength;
        return arrayConstStringArrayLength(declaration.initializer, declaration);
    }
    function objectKeysLocalStringArrayLength(node, use) {
        const expr = unwrapParenthesizedExpression(node);
        if (!ts.isCallExpression(expr) || !staticPropertyCallNamed(expr, "Object", "keys"))
            return undefined;
        if (expr.arguments.length !== 1)
            return undefined;
        const argument = expr.arguments[0];
        if (!argument || ts.isSpreadElement(argument) || !ts.isIdentifier(argument))
            return undefined;
        const declaration = localVariableDeclaration(argument, use);
        if (!declaration)
            return undefined;
        if (arrayLocalHasUnsafeUse(argument.text, declaration, expr, arrayLiteReadOnlyProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls))
            return undefined;
        const objectCount = objectExpressionI32PropertyCount(argument, use);
        const arrayLength = arrayExpressionI32Length(argument, use);
        if (objectCount !== undefined && objectCount > 0)
            return objectCount;
        if (arrayLength !== undefined && arrayLength > 0)
            return arrayLength;
        return undefined;
    }
    function arrayConstStringArrayLength(node, use, seen = new Set()) {
        if (ts.isParenthesizedExpression(node))
            return arrayConstStringArrayLength(node.expression, use, seen);
        if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)) {
            return arrayConstStringArrayLength(node.expression, use, seen);
        }
        if (ts.isNonNullExpression(node))
            return arrayConstStringArrayLength(node.expression, use, seen);
        if (ts.isArrayLiteralExpression(node)) {
            if (node.elements.length <= 0)
                return undefined;
            for (const element of node.elements) {
                if (ts.isSpreadElement(element))
                    return undefined;
                if (stringConstValue(element, use) === undefined)
                    return undefined;
            }
            return node.elements.length;
        }
        if (ts.isIdentifier(node)) {
            const declaration = localVariableDeclaration(node, use);
            if (!declaration || seen.has(declaration))
                return undefined;
            if (arrayLocalHasUnsafeUse(node.text, declaration, use))
                return undefined;
            seen.add(declaration);
            return declaration.initializer ? arrayConstStringArrayLength(declaration.initializer, declaration, seen) : undefined;
        }
        return undefined;
    }
    function isStringRuntimeValueExpression(node) {
        const type = typeAt(node);
        return isRuntimeStringType(type);
    }
    function stableArrayI32Length(node, use, seen = new Set()) {
        if (ts.isParenthesizedExpression(node))
            return stableArrayI32Length(node.expression, use, seen);
        if (ts.isArrayLiteralExpression(node))
            return arrayLiteralI32Length(node);
        if (ts.isIdentifier(node)) {
            const tupleLength = i32TupleLength(node);
            if (tupleLength !== undefined)
                return tupleLength;
            const declaration = localVariableDeclaration(node, use);
            if (!declaration || seen.has(declaration))
                return undefined;
            if (arrayLocalHasUnsafeUse(node.text, declaration, use, arrayLiteReadOnlyProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls))
                return undefined;
            seen.add(declaration);
            return declaration.initializer ? stableArrayI32Length(declaration.initializer, declaration, seen) : undefined;
        }
        if (ts.isCallExpression(node)) {
            if (staticPropertyCallNamed(node, "Array", "from") || staticPropertyCallNamed(node, "Object", "freeze")) {
                if (node.arguments.length !== 1)
                    return undefined;
                const argument = node.arguments[0];
                if (!argument || ts.isSpreadElement(argument))
                    return undefined;
                return stableArrayI32Length(argument, use, seen);
            }
            if (staticPropertyCallNamed(node, "Object", "values")) {
                if (node.arguments.length !== 1)
                    return undefined;
                const argument = node.arguments[0];
                if (!argument || ts.isSpreadElement(argument))
                    return undefined;
                return objectExpressionI32PropertyCount(argument, use, seen);
            }
        }
        return undefined;
    }
    function objectExpressionI32PropertyCount(node, use, seen = new Set()) {
        if (ts.isParenthesizedExpression(node))
            return objectExpressionI32PropertyCount(node.expression, use, seen);
        if (ts.isObjectLiteralExpression(node))
            return objectLiteralI32PropertyCount(node);
        if (ts.isIdentifier(node)) {
            const declaration = localVariableDeclaration(node, use);
            if (!declaration || seen.has(declaration))
                return undefined;
            seen.add(declaration);
            return declaration.initializer ? objectExpressionI32PropertyCount(declaration.initializer, declaration, seen) : undefined;
        }
        if (ts.isCallExpression(node) && staticPropertyCallNamed(node, "Object", "freeze")) {
            if (node.arguments.length !== 1)
                return undefined;
            const argument = node.arguments[0];
            if (!argument || ts.isSpreadElement(argument))
                return undefined;
            return objectExpressionI32PropertyCount(argument, use, seen);
        }
        return undefined;
    }
    function objectAssignTargetIsObjectLiteral(node) {
        if (ts.isParenthesizedExpression(node))
            return objectAssignTargetIsObjectLiteral(node.expression);
        return ts.isObjectLiteralExpression(node);
    }
    function objectAssignObjectPropertyCount(node, use, allowEmpty, seen = new Set()) {
        if (ts.isParenthesizedExpression(node))
            return objectAssignObjectPropertyCount(node.expression, use, allowEmpty, seen);
        if (ts.isObjectLiteralExpression(node))
            return objectLiteralI32PropertyCountForAssign(node, allowEmpty);
        if (ts.isIdentifier(node)) {
            const declaration = localVariableDeclaration(node, use);
            if (!declaration || seen.has(declaration))
                return undefined;
            seen.add(declaration);
            return declaration.initializer ? objectAssignObjectPropertyCount(declaration.initializer, declaration, false, seen) : undefined;
        }
        if (ts.isCallExpression(node) && staticPropertyCallNamed(node, "Object", "freeze")) {
            if (node.arguments.length !== 1)
                return undefined;
            const argument = node.arguments[0];
            if (!argument || ts.isSpreadElement(argument))
                return undefined;
            return objectAssignObjectPropertyCount(argument, use, false, seen);
        }
        return undefined;
    }
    function objectLiteralI32PropertyCount(node) {
        const count = objectLiteralI32PropertyCountForAssign(node, false);
        return count === 0 ? undefined : count;
    }
    function objectLiteralI32PropertyCountForAssign(node, allowEmpty) {
        if (node.properties.length <= 0)
            return allowEmpty ? 0 : undefined;
        const seen = new Set();
        for (const property of node.properties) {
            if (!ts.isPropertyAssignment(property))
                return undefined;
            const name = objectLiteStaticPropertyName(property.name);
            if (!name || seen.has(name))
                return undefined;
            seen.add(name);
            if (!isPureI32ExpressionForArrayLite(property.initializer))
                return undefined;
        }
        if (seen.size <= 0 && !allowEmpty)
            return undefined;
        return seen.size;
    }
    function objectLiteStaticPropertyName(name) {
        if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
            return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name.text) ? name.text : undefined;
        }
        return undefined;
    }
    function staticPropertyCallNamed(node, receiver, member) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return false;
        return ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === receiver &&
            node.expression.name.text === member &&
            !propertyAccessHasQuestionDot(node.expression);
    }
    function staticPropertyCallName(node) {
        if (!ts.isPropertyAccessExpression(node.expression) || !ts.isIdentifier(node.expression.expression))
            return undefined;
        if (propertyAccessHasQuestionDot(node.expression))
            return undefined;
        return `${node.expression.expression.text}.${node.expression.name.text}`;
    }
    function arrayConcatArgumentLength(node, proofCall) {
        if (ts.isParenthesizedExpression(node))
            return arrayConcatArgumentLength(node.expression, proofCall);
        if (ts.isArrayLiteralExpression(node))
            return arrayLiteralI32Length(node);
        if (ts.isIdentifier(node)) {
            const declaration = localVariableDeclaration(node, proofCall);
            if (!declaration)
                return undefined;
            const length = arrayReceiverI32Length(node, declaration);
            if (length === undefined || length <= 0)
                return undefined;
            if (arrayLocalHasUnsafeUse(node.text, declaration, proofCall, arrayLiteReadOnlyProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls))
                return undefined;
            return length;
        }
        return undefined;
    }
    function arrayLiteralI32Length(node) {
        if (node.elements.length <= 0)
            return undefined;
        for (const element of node.elements) {
            if (ts.isSpreadElement(element) || !isPureI32ExpressionForArrayLite(element))
                return undefined;
        }
        return node.elements.length;
    }
    function arrayMutableLocalReceiver(node, member) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return undefined;
        if (propertyAccessHasQuestionDot(node.expression))
            return undefined;
        if (node.expression.name.text !== member)
            return undefined;
        if (!callAssignedToLocal(node))
            return undefined;
        const receiver = node.expression.expression;
        if (!ts.isIdentifier(receiver))
            return undefined;
        const declaration = localVariableDeclaration(receiver, node);
        if (!declaration)
            return undefined;
        if (declaration.initializer && isObjectFreezeCall(declaration.initializer))
            return undefined;
        const length = arrayReceiverI32Length(receiver, declaration);
        if (length === undefined)
            return undefined;
        if (arrayLocalHasUnsafeUse(receiver.text, declaration, node, arrayLiteMutationProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls))
            return undefined;
        return { receiver, declaration, length };
    }
    function jsValueArrayMutableReceiver(node, member) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return undefined;
        if (propertyAccessHasQuestionDot(node.expression))
            return undefined;
        if (node.expression.name.text !== member)
            return undefined;
        const receiver = node.expression.expression;
        if (!isJsValueArrayLikeExpression(receiver))
            return undefined;
        return receiver;
    }
    function isObjectFreezeCall(node) {
        if (ts.isParenthesizedExpression(node))
            return isObjectFreezeCall(node.expression);
        return ts.isCallExpression(node) && staticPropertyCallNamed(node, "Object", "freeze");
    }
    function arrayMutatingLocalArrayCallProof(node, member) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return false;
        if (propertyAccessHasQuestionDot(node.expression))
            return false;
        if (node.expression.name.text !== member)
            return false;
        if (!callAssignedToLocal(node))
            return false;
        const receiver = node.expression.expression;
        if (!ts.isIdentifier(receiver))
            return false;
        const declaration = localVariableDeclaration(receiver, node);
        if (!declaration)
            return false;
        if (declaration.initializer && isObjectFreezeCall(declaration.initializer))
            return false;
        const length = arrayReceiverI32Length(receiver, declaration);
        if (length === undefined || length <= 0)
            return false;
        return !arrayLocalHasUnsafeUse(receiver.text, declaration, node, arrayLiteMutationProofReceiverMethods, arrayObjectLiteReadOnlyArgumentCalls);
    }
    function callAssignedToLocal(node) {
        const parent = node.parent;
        return ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isIdentifier(parent.name);
    }
    function isFilterLengthProjection(node) {
        return isLengthProjection(node);
    }
    function isLengthProjection(node) {
        const parent = node.parent;
        return ts.isPropertyAccessExpression(parent) && parent.expression === node && parent.name.text === "length";
    }
    function isDefaultSortReceiver(node) {
        const parent = node.parent;
        if (!ts.isPropertyAccessExpression(parent) || parent.expression !== node || parent.name.text !== "sort")
            return false;
        if (propertyAccessHasQuestionDot(parent))
            return false;
        const call = parent.parent;
        return ts.isCallExpression(call) && call.expression === parent && call.arguments.length === 0 && !callHasAnyQuestionDot(call);
    }
    function functionDeclarationMatchesUnary(identifier, returnType) {
        return functionDeclarationMatchesFixedI32(identifier, 1, returnType);
    }
    function functionDeclarationMatchesFixedI32(identifier, parameterCount, returnType) {
        const declaration = functionDeclarationForIdentifier(identifier);
        if (!declaration || !declaration.parent || !ts.isSourceFile(declaration.parent))
            return false;
        if (!declaration.body || declaration.asteriskToken || (declaration.typeParameters?.length ?? 0) > 0)
            return false;
        if (hasModifier(declaration, ts.SyntaxKind.AsyncKeyword))
            return false;
        if (declaration.parameters.length !== parameterCount)
            return false;
        for (const parameter of declaration.parameters) {
            if (!parameter || parameter.dotDotDotToken || parameter.questionToken || parameter.initializer)
                return false;
            const parameterText = parameter.type
                ? typeText(checker.getTypeFromTypeNode(parameter.type))
                : typeText(typeAt(parameter.name));
            if (!isI32ValueTypeText(parameterText))
                return false;
        }
        const signature = checker.getSignatureFromDeclaration(declaration);
        if (!signature)
            return false;
        const actualReturnType = typeText(checker.getReturnTypeOfSignature(signature));
        return returnType === "number" ? isI32ValueTypeText(actualReturnType) : isBooleanTypeText(actualReturnType);
    }
    function functionDeclarationForIdentifier(identifier) {
        const symbol = checker.getSymbolAtLocation(identifier);
        return symbol?.declarations?.find((item) => {
            return ts.isFunctionDeclaration(item) && item.name?.text === identifier.text;
        });
    }
    function arrayLocalHasUnsafeUse(name, declaration, proofUse, allowedReceiverMethods = new Set(), allowedArgumentCalls = new Set()) {
        const scope = enclosingFunctionScope(proofUse);
        if (!scope)
            return true;
        let unsafe = false;
        const visit = (node) => {
            if (unsafe || node === declaration.name || node === proofUse)
                return;
            if (ts.isVariableDeclaration(node) && node !== declaration && node.initializer && expressionAliasesLocal(node.initializer, name)) {
                unsafe = true;
                return;
            }
            if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
                if (expressionRootIdentifierText(node.left) === name || expressionAliasesLocal(node.right, name)) {
                    unsafe = true;
                    return;
                }
            }
            if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
                (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) &&
                expressionRootIdentifierText(node.operand) === name) {
                unsafe = true;
                return;
            }
            if (ts.isCallExpression(node)) {
                const receiverText = callReceiverIdentifierText(node);
                if (receiverText === name) {
                    const member = callReceiverMemberName(node);
                    if (!member || !allowedReceiverMethods.has(member) || callHasQuestionDot(node)) {
                        unsafe = true;
                        return;
                    }
                }
                if (node.arguments.some((arg) => expressionAliasesLocal(arg, name))) {
                    const callName = staticPropertyCallName(node);
                    if (callName && allowedArgumentCalls.has(callName)) {
                        ts.forEachChild(node, visit);
                        return;
                    }
                    unsafe = true;
                    return;
                }
            }
            if (ts.isNewExpression(node) && (node.arguments ?? []).some((arg) => expressionAliasesLocal(arg, name))) {
                unsafe = true;
                return;
            }
            if (ts.isSpreadElement(node) && expressionAliasesLocal(node.expression, name)) {
                unsafe = true;
                return;
            }
            if (ts.isReturnStatement(node) && node.expression && expressionAliasesLocal(node.expression, name)) {
                unsafe = true;
                return;
            }
            ts.forEachChild(node, visit);
        };
        visit(scope);
        return unsafe;
    }
    function expressionAliasesLocal(node, name) {
        if (ts.isIdentifier(node))
            return node.text === name;
        if (ts.isParenthesizedExpression(node))
            return expressionAliasesLocal(node.expression, name);
        if (ts.isSpreadElement(node))
            return expressionAliasesLocal(node.expression, name);
        if (ts.isArrayLiteralExpression(node))
            return node.elements.some((element) => expressionAliasesLocal(element, name));
        if (ts.isObjectLiteralExpression(node)) {
            return node.properties.some((property) => {
                if (ts.isShorthandPropertyAssignment(property))
                    return property.name.text === name;
                if (ts.isPropertyAssignment(property))
                    return expressionAliasesLocal(property.initializer, name);
                if (ts.isSpreadAssignment(property))
                    return expressionAliasesLocal(property.expression, name);
                return false;
            });
        }
        if (ts.isConditionalExpression(node)) {
            return expressionAliasesLocal(node.whenTrue, name) || expressionAliasesLocal(node.whenFalse, name);
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken) {
            return expressionAliasesLocal(node.right, name);
        }
        return false;
    }
    function containsCompoundMutation(node) {
        let found = false;
        const visit = (current) => {
            if (found)
                return;
            if (ts.isBinaryExpression(current) && isAssignmentOperator(current.operatorToken.kind)) {
                found = true;
                return;
            }
            if (ts.isPrefixUnaryExpression(current) || ts.isPostfixUnaryExpression(current)) {
                if (current.operator === ts.SyntaxKind.PlusPlusToken || current.operator === ts.SyntaxKind.MinusMinusToken) {
                    found = true;
                    return;
                }
            }
            ts.forEachChild(current, visit);
        };
        visit(node);
        return found;
    }
    function containsCallOrNewExpression(node) {
        let found = false;
        const visit = (current) => {
            if (found)
                return;
            if (ts.isCallExpression(current) || ts.isNewExpression(current)) {
                found = true;
                return;
            }
            ts.forEachChild(current, visit);
        };
        visit(node);
        return found;
    }
    function expressionReferencesIdentifier(node, name) {
        let found = false;
        const visit = (current) => {
            if (found)
                return;
            if (ts.isIdentifier(current)) {
                if (current.text === name)
                    found = true;
                return;
            }
            if (ts.isPropertyAccessExpression(current)) {
                visit(current.expression);
                return;
            }
            ts.forEachChild(current, visit);
        };
        visit(node);
        return found;
    }
    function isPureI32ExpressionForArrayLite(node) {
        if (!isI32ValueTypeText(typeText(typeAt(node))))
            return false;
        if (containsCompoundMutation(node))
            return false;
        return isSupportedPureI32Expression(node);
    }
    function isPureI32OrBoolExpression(node) {
        if (isPureI32ExpressionForArrayLite(node))
            return true;
        if (!isBooleanTypeText(typeText(typeAt(node))))
            return false;
        if (containsCompoundMutation(node))
            return false;
        return isSupportedPureBoolExpression(node);
    }
    function isSupportedPureI32Expression(node) {
        if (ts.isParenthesizedExpression(node))
            return isSupportedPureI32Expression(node.expression);
        if (ts.isNumericLiteral(node))
            return true;
        if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
            return isSupportedPureI32Expression(node.operand);
        }
        if (ts.isIdentifier(node))
            return identifierIsLocalI32Value(node);
        if (ts.isElementAccessExpression(node))
            return isSupportedPureI32ElementRead(node);
        if (ts.isBinaryExpression(node) && isPureI32BinaryOperator(node.operatorToken.kind)) {
            return isSupportedPureI32Expression(node.left) && isSupportedPureI32Expression(node.right);
        }
        return false;
    }
    function isSupportedPureBoolExpression(node) {
        if (ts.isParenthesizedExpression(node))
            return isSupportedPureBoolExpression(node.expression);
        if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword)
            return true;
        if (ts.isIdentifier(node))
            return identifierIsLocalBoolValue(node);
        if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
            return isSupportedPureBoolExpression(node.operand);
        }
        if (ts.isBinaryExpression(node)) {
            if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
                return isSupportedPureBoolExpression(node.left) && isSupportedPureBoolExpression(node.right);
            }
            if (isComparisonOperator(node.operatorToken.kind)) {
                return isSupportedPureI32Expression(node.left) && isSupportedPureI32Expression(node.right);
            }
        }
        return false;
    }
    function isSupportedPureI32ElementRead(node) {
        if (!node.argumentExpression || !ts.isIdentifier(node.expression))
            return false;
        const declaration = localVariableDeclaration(node.expression, node);
        if (!declaration)
            return false;
        const length = arrayReceiverI32Length(node.expression, declaration);
        if (length === undefined || length <= 0)
            return false;
        const index = int32IndexValue(node.argumentExpression);
        return index !== undefined && index >= 0 && index < length;
    }
    function identifierIsLocalI32Value(identifier) {
        if (!isI32ValueTypeText(typeText(typeAt(identifier))))
            return false;
        const symbol = checker.getSymbolAtLocation(identifier);
        const scope = enclosingFunctionScope(identifier);
        if (!symbol || !scope)
            return false;
        return symbol.declarations?.some((item) => {
            if (ts.isParameter(item))
                return enclosingFunctionScope(item) === scope;
            if (ts.isVariableDeclaration(item))
                return enclosingFunctionScope(item) === scope;
            if (ts.isBindingElement(item))
                return enclosingFunctionScope(item) === scope;
            return false;
        }) ?? false;
    }
    function identifierIsLocalBoolValue(identifier) {
        if (!isBooleanTypeText(typeText(typeAt(identifier))))
            return false;
        const symbol = checker.getSymbolAtLocation(identifier);
        const scope = enclosingFunctionScope(identifier);
        if (!symbol || !scope)
            return false;
        return symbol.declarations?.some((item) => {
            if (ts.isParameter(item))
                return enclosingFunctionScope(item) === scope;
            if (ts.isVariableDeclaration(item))
                return enclosingFunctionScope(item) === scope;
            if (ts.isBindingElement(item))
                return enclosingFunctionScope(item) === scope;
            return false;
        }) ?? false;
    }
    function isPureI32BinaryOperator(kind) {
        return kind === ts.SyntaxKind.PlusToken ||
            kind === ts.SyntaxKind.MinusToken ||
            kind === ts.SyntaxKind.AsteriskToken ||
            kind === ts.SyntaxKind.SlashToken ||
            kind === ts.SyntaxKind.PercentToken;
    }
    function isComparisonOperator(kind) {
        return kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
            kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
            kind === ts.SyntaxKind.EqualsEqualsToken ||
            kind === ts.SyntaxKind.ExclamationEqualsToken ||
            kind === ts.SyntaxKind.LessThanToken ||
            kind === ts.SyntaxKind.LessThanEqualsToken ||
            kind === ts.SyntaxKind.GreaterThanToken ||
            kind === ts.SyntaxKind.GreaterThanEqualsToken;
    }
    function callReceiverIdentifierText(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return undefined;
        const receiver = node.expression.expression;
        return ts.isIdentifier(receiver) ? receiver.text : undefined;
    }
    function callReceiverMemberName(node) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return undefined;
        return node.expression.name.text;
    }
    function callHasQuestionDot(node) {
        return ts.isPropertyAccessExpression(node.expression) && propertyAccessHasQuestionDot(node.expression);
    }
    function propertyAccessHasQuestionDot(node) {
        return Boolean(node.questionDotToken);
    }
    function isAssignmentTarget(node) {
        const parent = node.parent;
        return ts.isBinaryExpression(parent) && parent.left === node && isAssignmentOperator(parent.operatorToken.kind);
    }
    function expressionRootIdentifierText(node) {
        if (ts.isIdentifier(node))
            return node.text;
        if (ts.isParenthesizedExpression(node))
            return expressionRootIdentifierText(node.expression);
        if (ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node)) {
            return expressionRootIdentifierText(node.expression);
        }
        return undefined;
    }
    function enclosingFunctionScope(node) {
        let current = node;
        while (current) {
            if (ts.isFunctionDeclaration(current) ||
                ts.isFunctionExpression(current) ||
                ts.isArrowFunction(current) ||
                ts.isMethodDeclaration(current) ||
                ts.isConstructorDeclaration(current) ||
                ts.isGetAccessorDeclaration(current) ||
                ts.isSetAccessorDeclaration(current)) {
                return current;
            }
            current = current.parent;
        }
        return undefined;
    }
    function i32TupleLength(receiver) {
        const text = typeText(typeAt(receiver)).trim();
        const raw = text.startsWith("readonly [") && text.endsWith("]")
            ? text.slice("readonly [".length, -1)
            : text.startsWith("[") && text.endsWith("]")
                ? text.slice(1, -1)
                : undefined;
        if (raw === undefined)
            return undefined;
        const parts = splitTypeList(raw);
        if (parts.length === 0)
            return undefined;
        if (!parts.every((part) => isI32ValueTypeText(part)))
            return undefined;
        return parts.length;
    }
    function splitTypeList(text) {
        const out = [];
        let start = 0;
        let depth = 0;
        for (let i = 0; i < text.length; i += 1) {
            const ch = text[i];
            if (ch === "<" || ch === "[" || ch === "(" || ch === "{")
                depth += 1;
            else if (ch === ">" || ch === "]" || ch === ")" || ch === "}")
                depth -= 1;
            else if (ch === "," && depth === 0) {
                out.push(text.slice(start, i).trim());
                start = i + 1;
            }
        }
        out.push(text.slice(start).trim());
        return out.filter((part) => part.length > 0);
    }
    function isI32ValueTypeText(text) {
        const value = text.trim();
        return value === "number" || /^-?\d+$/.test(value);
    }
    function isI32ArrayTypeText(text) {
        const value = text.trim();
        // number[]
        if (value.endsWith("[]")) {
            const inner = value.slice(0, -2).trim();
            return isI32ValueTypeText(inner);
        }
        // Array<number>, readonly Array<number>
        const arrayMatch = /^(?:readonly\s+)?Array<(.+)>$/.exec(value);
        if (arrayMatch)
            return isI32ValueTypeText(arrayMatch[1].trim());
        // ReadonlyArray<number>
        const readonlyMatch = /^ReadonlyArray<(.+)>$/.exec(value);
        if (readonlyMatch)
            return isI32ValueTypeText(readonlyMatch[1].trim());
        return false;
    }
    function isBooleanTypeText(text) {
        const value = text.trim();
        return value === "boolean" || value === "true" || value === "false";
    }
    function int32IndexValue(node) {
        if (ts.isParenthesizedExpression(node))
            return int32IndexValue(node.expression);
        if (ts.isNumericLiteral(node))
            return checkedInt32NumberValue(Number(node.text));
        if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
            return checkedInt32NumberValue(0 - Number(node.operand.text));
        }
        if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.PlusToken && ts.isNumericLiteral(node.operand)) {
            return checkedInt32NumberValue(Number(node.operand.text));
        }
        return undefined;
    }
    function checkedInt32NumberValue(value) {
        if (!Number.isInteger(value))
            return undefined;
        if (value < -2147483648 || value > 2147483647)
            return undefined;
        return value;
    }
    function normalizeArrayLiteSliceIndex(value, length) {
        return value < 0 ? Math.max(length + value, 0) : Math.min(value, length);
    }
    function stringAsciiLiteralProofs(node, use) {
        const value = stringConstValue(node, use);
        if (value === undefined || !isAscii(value))
            return [];
        return [stringAsciiLiteralProof];
    }
    function stringLengthProofs(node, use) {
        const asciiLiteralProofs = stringAsciiLiteralProofs(node, use);
        if (asciiLiteralProofs.length > 0)
            return asciiLiteralProofs;
        if (ts.isCallExpression(node) && stringConvertProofs(node).includes(stringConvertScalarProof)) {
            return [stringScalarLengthProof];
        }
        if (isRuntimeStringType(typeAt(node))) {
            return [stringRuntimeLengthProof];
        }
        return [];
    }
    function stringLiteralValue(node) {
        if (ts.isStringLiteralLike(node))
            return node.text;
        const type = typeAt(node);
        if ((type.flags & ts.TypeFlags.StringLiteral) !== 0 && typeof type.value === "string") {
            return type.value;
        }
        return undefined;
    }
    function stringConstValue(node, use, seen = new Set()) {
        if (ts.isParenthesizedExpression(node))
            return stringConstValue(node.expression, use, seen);
        const literal = stringLiteralValue(node);
        if (literal !== undefined)
            return literal;
        if (ts.isIdentifier(node)) {
            const declaration = localVariableDeclaration(node, use);
            if (!declaration || !declaration.initializer || seen.has(declaration))
                return undefined;
            seen.add(declaration);
            return stringConstValue(declaration.initializer, declaration, seen);
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const receiver = stringConstValue(node.expression.expression, use, seen);
            if (receiver === undefined)
                return undefined;
            return stringReturningLiteralMethodValue(node.expression.name.text, receiver, node.arguments, use, seen);
        }
        return undefined;
    }
    function stringReturningLiteralMethodValue(member, receiver, args, use, seen) {
        if (args.some((arg) => ts.isSpreadElement(arg)))
            return undefined;
        switch (member) {
            case "trim":
                return args.length === 0 ? receiver.trim() : undefined;
            case "toLowerCase":
                return args.length === 0 ? receiver.toLowerCase() : undefined;
            case "toUpperCase":
                return args.length === 0 ? receiver.toUpperCase() : undefined;
            case "toString":
                return args.length === 0 ? receiver : undefined;
            case "slice": {
                if (args.length > 2)
                    return undefined;
                const start = args.length >= 1 ? int32IndexValue(args[0]) : 0;
                const end = args.length >= 2 ? int32IndexValue(args[1]) : receiver.length;
                return start !== undefined && end !== undefined ? receiver.slice(start, end) : undefined;
            }
            case "substring": {
                if (args.length < 1 || args.length > 2)
                    return undefined;
                const start = int32IndexValue(args[0]);
                const end = args.length >= 2 ? int32IndexValue(args[1]) : undefined;
                return start !== undefined && (args.length < 2 || end !== undefined) ? receiver.substring(start, end) : undefined;
            }
            case "replace": {
                if (args.length !== 2)
                    return undefined;
                const search = stringConstValue(args[0], use, seen);
                const replacement = stringConstValue(args[1], use, seen);
                return search !== undefined && replacement !== undefined ? receiver.replace(search, replacement) : undefined;
            }
            case "padStart":
            case "padEnd": {
                if (args.length < 1 || args.length > 2)
                    return undefined;
                const targetLength = int32IndexValue(args[0]);
                if (targetLength === undefined || targetLength < 0)
                    return undefined;
                const pad = args.length >= 2 ? stringConstValue(args[1], use, seen) : " ";
                if (pad === undefined)
                    return undefined;
                return member === "padStart" ? receiver.padStart(targetLength, pad) : receiver.padEnd(targetLength, pad);
            }
            case "repeat": {
                if (args.length !== 1)
                    return undefined;
                const count = int32IndexValue(args[0]);
                return count !== undefined && count >= 0 ? receiver.repeat(count) : undefined;
            }
            case "charAt": {
                if (args.length !== 1)
                    return undefined;
                const index = int32IndexValue(args[0]);
                return index !== undefined ? receiver.charAt(index) : undefined;
            }
            default:
                return undefined;
        }
    }
    function isAscii(value) {
        for (let i = 0; i < value.length; i += 1) {
            if (value.charCodeAt(i) > 0x7f)
                return false;
        }
        return true;
    }
    function runtimeCallName(node, sourceFile) {
        if (!ts.isPropertyAccessExpression(node.expression))
            return node.expression.getText(sourceFile);
        const receiverType = typeAt(node.expression.expression);
        const receiverTypeText = typeText(receiverType);
        // Check string first — use union-aware isRuntimeStringType
        if (isRuntimeStringType(receiverType))
            return `String.${node.expression.name.text}`;
        // Array check: text-based covers unions (e.g., "string[] | null" contains "[]")
        if (isArrayLikeTypeText(receiverTypeText))
            return `Array.${node.expression.name.text}`;
        return node.expression.getText(sourceFile);
    }
    function typeAt(node) {
        return checker.getTypeAtLocation(node);
    }
    function typeText(type) {
        const cached = typeTextCache.get(type);
        if (cached !== undefined)
            return cached;
        const text = normalizeCheckerText(checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType));
        typeTextCache.set(type, text);
        return text;
    }
    function normalizeCheckerText(value) {
        return value.split(toPosix(build.cwd)).join("$root");
    }
    function symbolForDeclaration(declaration) {
        const namedDeclaration = declaration;
        return namedDeclaration.name ? checker.getSymbolAtLocation(namedDeclaration.name) : undefined;
    }
    function symbolFact(symbol, sourceFile) {
        if (!symbol)
            return undefined;
        const firstDeclaration = symbol.declarations?.[0];
        const fqName = normalizeCheckerText(checker.getFullyQualifiedName(symbol));
        return {
            id: stableId("csg.symbol.ref", fqName, firstDeclaration ? declarationKey(firstDeclaration) : sourceFileRelPath(sourceFile)),
            name: symbol.getName(),
            fqName,
            flags: symbolFlags(symbol.flags),
        };
    }
    function declarationKey(node) {
        const sourceFile = node.getSourceFile();
        return `${sourceFileRelPath(sourceFile)}:${node.pos}:${node.end}`;
    }
    function containsAny(root, location, explicitAnyNode) {
        if (explicitAnyNode && containsExplicitAnyKeyword(explicitAnyNode))
            return true;
        const seen = new Set();
        const stack = [{ type: root, origin: location }];
        let steps = 0;
        while (stack.length > 0) {
            const item = stack.pop();
            if (!item)
                continue;
            const type = item.type;
            if ((type.flags & ts.TypeFlags.Any) !== 0) {
                if (isClosedExternalAnyBoundary(location, item.origin))
                    continue;
                return true;
            }
            if (seen.has(type))
                continue;
            seen.add(type);
            steps += 1;
            if (steps > 256)
                return false;
            if (type.isUnionOrIntersection()) {
                for (const part of type.types)
                    stack.push({ type: part, origin: item.origin });
            }
            const reference = type;
            if (reference.target && shouldInspectTypeReferenceArguments(reference.target)) {
                for (const arg of checker.getTypeArguments(reference)) {
                    stack.push({ type: arg, origin: typeReferenceOrigin(reference.target) ?? item.origin });
                }
            }
            for (const prop of type.getProperties().slice(0, 64)) {
                const declaration = prop.valueDeclaration ?? prop.declarations?.[0];
                if (!declaration || !isProjectSourceFile(build.cwd, declaration.getSourceFile()))
                    continue;
                stack.push({ type: checker.getTypeOfSymbolAtLocation(prop, declaration), origin: declaration });
            }
        }
        return false;
    }
    function isClosedExternalAnyBoundary(location, origin) {
        const source = origin ?? location;
        if (containsExplicitAnyKeyword(source))
            return false;
        if (!isProjectSourceFile(build.cwd, source.getSourceFile()))
            return true;
        if (anyFromExternalBindingAnnotation(source))
            return true;
        if (anyFromExternalContextualParameter(source))
            return true;
        if (ts.isShorthandPropertyAssignment(source) || ts.isPropertyAssignment(source)) {
            return anyFromAssignedValueExternalBoundary(source);
        }
        return false;
    }
    function anyFromAssignedValueExternalBoundary(node) {
        if (ts.isShorthandPropertyAssignment(node)) {
            const shorthandChecker = checker;
            const symbol = shorthandChecker.getShorthandAssignmentValueSymbol?.(node) ?? checker.getSymbolAtLocation(node.name);
            return symbolDeclarationsHaveExternalAnyBoundary(symbol);
        }
        const initializer = unwrapExpression(node.initializer);
        if (!ts.isIdentifier(initializer))
            return false;
        return symbolDeclarationsHaveExternalAnyBoundary(checker.getSymbolAtLocation(initializer));
    }
    function symbolDeclarationsHaveExternalAnyBoundary(symbol) {
        if (!symbol)
            return false;
        for (const declaration of symbol.declarations ?? []) {
            if (containsExplicitAnyKeyword(declaration))
                return false;
            if (!isProjectSourceFile(build.cwd, declaration.getSourceFile()))
                return true;
            if (anyFromExternalBindingAnnotation(declaration))
                return true;
            if (anyFromExternalContextualParameter(declaration))
                return true;
        }
        return false;
    }
    function anyFromExternalBindingAnnotation(node) {
        let current = node;
        while (current) {
            if ((ts.isParameter(current) || ts.isVariableDeclaration(current)) && current.type) {
                if (containsExplicitAnyKeyword(current.type))
                    return false;
                if (typeNodeReferencesProjectExplicitAny(current.type, new Set()))
                    return false;
                return typeNodeReferencesExternalDeclaration(current.type);
            }
            current = current.parent;
        }
        return false;
    }
    function anyFromExternalContextualParameter(node) {
        const parameter = nearestParameter(node);
        if (!parameter || parameter.type)
            return false;
        const fn = parameter.parent;
        if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))
            return false;
        const index = fn.parameters.indexOf(parameter);
        if (index < 0)
            return false;
        const contextualType = checker.getContextualType(fn);
        if (!contextualType)
            return false;
        for (const signature of callSignaturesOf(contextualType)) {
            const contextualParam = signature.parameters[index];
            if (!contextualParam)
                continue;
            const paramType = checker.getTypeOfSymbolAtLocation(contextualParam, parameter);
            if ((paramType.flags & ts.TypeFlags.Any) === 0)
                continue;
            const declarations = contextualParam.declarations ?? [];
            if (declarations.some((declaration) => !isProjectSourceFile(build.cwd, declaration.getSourceFile())))
                return true;
        }
        return false;
    }
    function nearestParameter(node) {
        let current = node;
        while (current) {
            if (ts.isParameter(current))
                return current;
            current = current.parent;
        }
        return undefined;
    }
    function callSignaturesOf(type) {
        if (type.isUnionOrIntersection())
            return type.types.flatMap((part) => callSignaturesOf(part));
        return type.getCallSignatures();
    }
    function typeReferenceOrigin(target) {
        const symbol = target.symbol ?? target.aliasSymbol;
        return symbol?.declarations?.[0];
    }
    function typeNodeReferencesExternalDeclaration(node) {
        let found = false;
        const visit = (current) => {
            if (found)
                return;
            if (ts.isTypeReferenceNode(current)) {
                const symbol = checker.getSymbolAtLocation(current.typeName);
                if (symbol?.declarations?.some((declaration) => !isProjectSourceFile(build.cwd, declaration.getSourceFile()))) {
                    found = true;
                    return;
                }
            }
            ts.forEachChild(current, visit);
        };
        visit(node);
        return found;
    }
    function typeNodeReferencesProjectExplicitAny(node, seen) {
        let found = false;
        const visit = (current) => {
            if (found)
                return;
            if (current.kind === ts.SyntaxKind.AnyKeyword) {
                found = true;
                return;
            }
            if (ts.isTypeReferenceNode(current)) {
                const symbol = checker.getSymbolAtLocation(current.typeName);
                if (symbol && !seen.has(symbol)) {
                    seen.add(symbol);
                    for (const declaration of symbol.declarations ?? []) {
                        if (!isProjectSourceFile(build.cwd, declaration.getSourceFile()))
                            continue;
                        if (containsExplicitAnyKeyword(declaration) || typeNodeReferencesProjectExplicitAny(declaration, seen)) {
                            found = true;
                            return;
                        }
                    }
                }
            }
            ts.forEachChild(current, visit);
        };
        visit(node);
        return found;
    }
    function shouldInspectTypeReferenceArguments(target) {
        const symbol = target.symbol ?? target.aliasSymbol;
        const declarations = symbol?.declarations ?? [];
        if (declarations.length === 0)
            return true;
        return declarations.some((declaration) => isProjectSourceFile(build.cwd, declaration.getSourceFile()));
    }
}
function buildProgram(options) {
    const baseCwd = path.resolve(options.rootDir ?? process.cwd());
    if (options.project) {
        const project = path.resolve(baseCwd, options.project);
        const cwd = path.resolve(options.rootDir ?? path.dirname(project));
        const configDiagnostics = [];
        const parsed = ts.getParsedCommandLineOfConfigFile(project, {}, {
            ...ts.sys,
            onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
                configDiagnostics.push(diagnostic);
            },
        });
        if (!parsed) {
            const compilerOptions = defaultCompilerOptions(cwd);
            return {
                cwd,
                projectFile: project,
                program: ts.createProgram({ rootNames: [], options: compilerOptions }),
                configDiagnostics,
                compilerOptions,
            };
        }
        const explicitFiles = resolveExplicitFiles(options.files, cwd, baseCwd);
        const rootNames = explicitFiles.length > 0
            ? [...new Set([...explicitFiles, ...parsed.fileNames.filter((file) => file.endsWith(".d.ts"))])]
            : parsed.fileNames;
        const createOptions = {
            rootNames,
            options: parsed.options,
        };
        if (parsed.projectReferences)
            createOptions.projectReferences = parsed.projectReferences;
        return {
            cwd,
            projectFile: project,
            program: ts.createProgram(createOptions),
            configDiagnostics: [...configDiagnostics, ...parsed.errors],
            compilerOptions: parsed.options,
        };
    }
    if (!options.files || options.files.length === 0) {
        const compilerOptions = defaultCompilerOptions(baseCwd);
        return {
            cwd: baseCwd,
            program: ts.createProgram({ rootNames: [], options: compilerOptions }),
            configDiagnostics: [makeDiagnostic("either --project or at least one --file is required")],
            compilerOptions,
        };
    }
    const compilerOptions = defaultCompilerOptions(baseCwd);
    return {
        cwd: baseCwd,
        program: ts.createProgram({ rootNames: options.files.map((file) => path.resolve(baseCwd, file)), options: compilerOptions }),
        configDiagnostics: [],
        compilerOptions,
    };
}
function resolveExplicitFiles(files, projectCwd, baseCwd) {
    if (!files || files.length === 0)
        return [];
    return files.map((file) => resolveExplicitFile(file, projectCwd, baseCwd));
}
function resolveExplicitFile(file, projectCwd, baseCwd) {
    if (path.isAbsolute(file))
        return path.resolve(file);
    const projectRelative = path.resolve(projectCwd, file);
    if (existsSync(projectRelative))
        return projectRelative;
    const baseRelative = path.resolve(baseCwd, file);
    if (existsSync(baseRelative))
        return baseRelative;
    return projectRelative;
}
function emptyReport(build, runtimes, diagnostics) {
    const emptyClosure = buildRuntimeClosure([], []);
    const factsRoot = "";
    return {
        schema: CsgCoreReportSchema,
        standard: CsgCoreStandard,
        features: CsgCoreFeatures,
        complete: false,
        profiles: [CsgCoreProfile],
        profile_set_cid: "",
        factsRoot,
        facts_root: factsRoot,
        projectRoot: toPosix(path.resolve(build.cwd)),
        projectFile: build.projectFile ? relPath(build.cwd, build.projectFile) : undefined,
        runtimes,
        entryRoots: entryRoots(build.cwd, undefined, []),
        counts: {
            sourceFiles: 0,
            modules: 0,
            imports: 0,
            exports: 0,
            symbols: 0,
            types: 0,
            functions: 0,
            blocks: 0,
            terms: 0,
            ops: 0,
            objectLiterals: 0,
            propertyReads: 0,
            propertyWrites: 0,
            elementReads: 0,
            elementWrites: 0,
            calls: 0,
            data: 0,
            runtimeRequirements: 0,
            externalSymbols: 0,
            unsupported: 0,
        },
        unsupported: [],
        runtimeRequirements: [],
        externalSymbols: [],
        runtimeClosure: emptyClosure,
        diagnostics,
    };
}
function countFacts(facts, sourceFiles) {
    const counts = new Map();
    const opCounts = new Map();
    for (const fact of facts) {
        counts.set(fact.kind, (counts.get(fact.kind) ?? 0) + 1);
        if (fact.kind === "csg.op" && typeof fact.opKind === "string") {
            opCounts.set(fact.opKind, (opCounts.get(fact.opKind) ?? 0) + 1);
        }
    }
    return {
        sourceFiles,
        modules: counts.get("csg.module") ?? 0,
        imports: counts.get("csg.import") ?? 0,
        exports: counts.get("csg.export") ?? 0,
        symbols: counts.get("csg.symbol") ?? 0,
        types: counts.get("csg.type") ?? 0,
        functions: counts.get("csg.function") ?? 0,
        blocks: counts.get("csg.block") ?? 0,
        terms: counts.get("csg.term") ?? 0,
        ops: counts.get("csg.op") ?? 0,
        objectLiterals: opCounts.get("object_literal") ?? 0,
        propertyReads: opCounts.get("property_read") ?? 0,
        propertyWrites: opCounts.get("property_write") ?? 0,
        elementReads: opCounts.get("element_read") ?? 0,
        elementWrites: opCounts.get("element_write") ?? 0,
        calls: counts.get("csg.call") ?? 0,
        data: counts.get("csg.data") ?? 0,
        runtimeRequirements: counts.get("csg.runtime_requirement") ?? 0,
        externalSymbols: counts.get("csg.external_symbol") ?? 0,
        unsupported: counts.get("csg.unsupported") ?? 0,
    };
}
function buildRuntimeClosure(runtimeRequirements, externalSymbols) {
    const groups = new Map();
    const byRuntime = new Map();
    const byKind = new Map();
    const bySource = new Map();
    const externalByName = new Map();
    const closedRequirementProviderByRuntimeName = new Map();
    let closedRequirementCount = 0;
    let openRequirementCount = 0;
    let candidateRequirementCount = 0;
    let closedExternalSymbolCount = 0;
    let openExternalSymbolCount = 0;
    let candidateExternalSymbolCount = 0;
    for (const item of runtimeRequirements) {
        const decision = runtimeRequirementProviderDecision(item);
        const closed = decision.status === "closed";
        const candidate = decision.candidateProvider !== undefined;
        if (closed)
            closedRequirementCount += 1;
        else
            openRequirementCount += 1;
        if (candidate)
            candidateRequirementCount += 1;
        if (closed && decision.provider) {
            closedRequirementProviderByRuntimeName.set(`${item.runtime}\u0000${item.name}`, decision.provider);
        }
        increment(byRuntime, item.runtime, closed, candidate);
        increment(byKind, `${item.runtime}\u0000${item.kind}`, closed, candidate);
        increment(bySource, `${item.runtime}\u0000${item.source}`, closed, candidate);
        const providerKey = decision.status === "closed"
            ? `closed:${decision.provider ?? ""}`
            : `open:${decision.candidateProvider ?? ""}`;
        const groupKey = `${item.runtime}\u0000${item.source}\u0000${item.kind}\u0000${item.name}\u0000${providerKey}`;
        let group = groups.get(groupKey);
        if (!group) {
            group = {
                runtime: item.runtime,
                source: item.source,
                kind: item.kind,
                name: item.name,
                count: 0,
                closedCount: 0,
                openCount: 0,
                provider: decision.provider,
                candidateProvider: decision.candidateProvider,
                owners: new Set(),
                firstLoc: item.loc,
            };
            groups.set(groupKey, group);
        }
        group.count += 1;
        if (closed)
            group.closedCount += 1;
        else
            group.openCount += 1;
        if (decision.provider)
            group.provider = decision.provider;
        if (decision.candidateProvider)
            group.candidateProvider = decision.candidateProvider;
        if (item.owner)
            group.owners.add(item.owner);
        if (!group.firstLoc && item.loc)
            group.firstLoc = item.loc;
    }
    for (const item of externalSymbols) {
        const directDecision = externalSymbolProviderDecision(item);
        const requirementProvider = closedRequirementProviderByRuntimeName.get(`${item.runtime}\u0000${item.name}`);
        const decision = directDecision.status === "closed" || !requirementProvider
            ? directDecision
            : { status: "closed", provider: requirementProvider, candidateProvider: undefined };
        const closed = decision.status === "closed";
        const candidate = decision.candidateProvider !== undefined;
        if (closed)
            closedExternalSymbolCount += 1;
        else
            openExternalSymbolCount += 1;
        if (candidate)
            candidateExternalSymbolCount += 1;
        const id = stableId("csg.runtime_closure.external", item.runtime, item.source, item.name);
        const key = `${item.runtime}\u0000${item.source}\u0000${item.name}`;
        const current = externalByName.get(key);
        if (current) {
            current.count += 1;
            if (decision.provider)
                current.provider = decision.provider;
            if (decision.candidateProvider)
                current.candidateProvider = decision.candidateProvider;
            current.providerStatus = current.providerStatus === "closed" && closed ? "closed" : "open";
        }
        else {
            const out = {
                id,
                runtime: item.runtime,
                source: item.source,
                name: item.name,
                count: 1,
                providerStatus: decision.status,
            };
            if (decision.provider)
                out.provider = decision.provider;
            if (decision.candidateProvider)
                out.candidateProvider = decision.candidateProvider;
            externalByName.set(key, out);
        }
    }
    const requirements = [...groups.values()]
        .map((item) => {
        const out = {
            id: stableId("csg.runtime_closure.requirement", item.runtime, item.source, item.kind, item.name, item.openCount === 0 ? "closed" : "open", item.provider ?? "", item.candidateProvider ?? ""),
            runtime: item.runtime,
            source: item.source,
            kind: item.kind,
            name: item.name,
            count: item.count,
            providerStatus: item.openCount === 0 ? "closed" : "open",
            owners: [...item.owners].sort(),
        };
        if (item.provider)
            out.provider = item.provider;
        if (item.candidateProvider)
            out.candidateProvider = item.candidateProvider;
        if (item.firstLoc)
            out.firstLoc = item.firstLoc;
        return out;
    })
        .sort(compareRuntimeClosureGroup);
    return {
        schema: CsgCoreRuntimeClosureSchema,
        features: CsgCoreFeatures,
        complete: openRequirementCount === 0 && openExternalSymbolCount === 0,
        runtimeRequirementCount: runtimeRequirements.length,
        externalSymbolCount: externalSymbols.length,
        closedRequirementCount,
        openRequirementCount,
        candidateRequirementCount,
        closedExternalSymbolCount,
        openExternalSymbolCount,
        candidateExternalSymbolCount,
        groupCount: requirements.length,
        byRuntime: mapRuntimeBuckets(byRuntime),
        byKind: mapPairBuckets(byKind),
        bySource: mapPairBuckets(bySource),
        requirements,
        externalSymbols: [...externalByName.values()].sort(compareRuntimeClosureExternal),
    };
}
function increment(map, key, closed, candidate) {
    const current = map.get(key) ?? { count: 0, closedCount: 0, openCount: 0, candidateCount: 0 };
    current.count += 1;
    if (closed)
        current.closedCount += 1;
    else
        current.openCount += 1;
    if (candidate)
        current.candidateCount += 1;
    map.set(key, current);
}
function mapRuntimeBuckets(map) {
    return [...map.entries()]
        .map(([runtime, counts]) => ({
        id: stableId("csg.runtime_closure.bucket.runtime", runtime),
        runtime,
        key: runtime,
        count: counts.count,
        closedCount: counts.closedCount,
        openCount: counts.openCount,
        candidateCount: counts.candidateCount,
    }))
        .sort(compareRuntimeClosureBucket);
}
function mapPairBuckets(map) {
    return [...map.entries()]
        .map(([key, counts]) => {
        const [runtime, value] = key.split("\u0000", 2);
        return {
            id: stableId("csg.runtime_closure.bucket.pair", runtime ?? "", value ?? ""),
            runtime: runtime ?? "",
            key: value ?? "",
            count: counts.count,
            closedCount: counts.closedCount,
            openCount: counts.openCount,
            candidateCount: counts.candidateCount,
        };
    })
        .sort(compareRuntimeClosureBucket);
}
function compareRuntimeClosureBucket(left, right) {
    return right.count - left.count || left.runtime.localeCompare(right.runtime) || left.key.localeCompare(right.key) || left.id.localeCompare(right.id);
}
function compareRuntimeClosureGroup(left, right) {
    return right.count - left.count ||
        left.runtime.localeCompare(right.runtime) ||
        left.source.localeCompare(right.source) ||
        left.kind.localeCompare(right.kind) ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id);
}
function compareRuntimeClosureExternal(left, right) {
    return right.count - left.count ||
        left.runtime.localeCompare(right.runtime) ||
        left.source.localeCompare(right.source) ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id);
}
function validateRuntimeOptions(runtime) {
    const diagnostics = [];
    for (const item of runtime ?? []) {
        if (!allowedRuntimes.has(item))
            diagnostics.push(`runtime must be node or browser: ${item}`);
    }
    return diagnostics;
}
function normalizeRuntime(runtime) {
    const values = runtime && runtime.length > 0 ? runtime : ["node"];
    return [...new Set(values)].sort();
}
function entryRoots(cwd, configured, sourceFiles) {
    const roots = configured && configured.length > 0 ? configured : defaultEntryRoots;
    const sourceFileSet = new Set(sourceFiles.map((sourceFile) => relPath(cwd, sourceFile.fileName)));
    return [...new Set(roots)]
        .map((item) => toPosix(item))
        .filter((item) => sourceFileSet.has(item))
        .sort();
}
function defaultCompilerOptions(cwd) {
    return {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true,
        noImplicitAny: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        skipLibCheck: true,
        rootDir: cwd,
    };
}
function makeDiagnostic(message) {
    return {
        category: ts.DiagnosticCategory.Error,
        code: 0,
        file: undefined,
        start: undefined,
        length: undefined,
        messageText: message,
    };
}
function formatDiagnostic(cwd, diagnostic) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    if (diagnostic.file && diagnostic.start !== undefined) {
        const point = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        return `${relPath(cwd, diagnostic.file.fileName)}:${point.line + 1}:${point.character + 1} TS${diagnostic.code}: ${message}`;
    }
    return `TS${diagnostic.code}: ${message}`;
}
function compilerOptionsFact(options) {
    return {
        target: options.target === undefined ? undefined : ts.ScriptTarget[options.target],
        module: options.module === undefined ? undefined : ts.ModuleKind[options.module],
        moduleResolution: options.moduleResolution === undefined ? undefined : ts.ModuleResolutionKind[options.moduleResolution],
        noCheck: compilerOptionsNoCheck(options),
        strict: options.strict === true,
        noImplicitAny: options.noImplicitAny === true,
        exactOptionalPropertyTypes: options.exactOptionalPropertyTypes === true,
        noUncheckedIndexedAccess: options.noUncheckedIndexedAccess === true,
    };
}
function compilerOptionsAllowUncheckedAny(options) {
    return compilerOptionsNoCheck(options) || options.noImplicitAny === false;
}
function compilerOptionsNoCheck(options) {
    return options.noCheck === true;
}
const projectSourceFileCache = new WeakMap();
function isProjectSourceFile(cwd, sourceFile) {
    let byCwd = projectSourceFileCache.get(sourceFile);
    if (byCwd === undefined) {
        byCwd = new Map();
        projectSourceFileCache.set(sourceFile, byCwd);
    }
    const cached = byCwd.get(cwd);
    if (cached !== undefined)
        return cached;
    let result = false;
    if (!sourceFile.isDeclarationFile) {
        const resolved = path.resolve(sourceFile.fileName);
        result = !resolved.includes(`${path.sep}node_modules${path.sep}`) && isInside(cwd, resolved);
    }
    byCwd.set(cwd, result);
    return result;
}
function sourceFileHasTsNoCheck(sourceFile) {
    return /\/\/\s*@ts-nocheck\b|\/\*\s*@ts-nocheck\b/.test(sourceFile.text.slice(0, 2048));
}
function isInside(root, file) {
    const relative = path.relative(root, file);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function relPath(cwd, file) {
    return toPosix(path.relative(cwd, path.resolve(file)) || ".");
}
function toPosix(value) {
    return value.split(path.sep).join("/");
}
function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}
function stableId(...parts) {
    return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24);
}
function compareFactId(left, right) {
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}
function compareById(left, right) {
    return left.id.localeCompare(right.id);
}
function compareIssue(left, right) {
    const leftLoc = left.loc ? `${left.loc.file}:${left.loc.start}` : "";
    const rightLoc = right.loc ? `${right.loc.file}:${right.loc.start}` : "";
    return leftLoc.localeCompare(rightLoc) || left.code.localeCompare(right.code) || left.id.localeCompare(right.id);
}
function syntaxKindName(kind) {
    return ts.SyntaxKind[kind] ?? `SyntaxKind${kind}`;
}
const typeFlagEntries = Object.keys(ts.TypeFlags)
    .map((key) => {
    const value = Number(key);
    if (Number.isNaN(value) || value === 0)
        return undefined;
    if ((value & (value - 1)) !== 0)
        return undefined;
    return [value, ts.TypeFlags[value] ?? key];
})
    .filter((entry) => entry !== undefined);
const symbolFlagEntries = Object.keys(ts.SymbolFlags)
    .map((key) => {
    const value = Number(key);
    if (Number.isNaN(value) || value === 0)
        return undefined;
    if ((value & (value - 1)) !== 0)
        return undefined;
    return [value, ts.SymbolFlags[value] ?? key];
})
    .filter((entry) => entry !== undefined);
const typeFlagsCache = new Map();
const symbolFlagsCache = new Map();
function typeFlags(flags) {
    const cached = typeFlagsCache.get(flags);
    if (cached !== undefined)
        return cached;
    const names = [];
    for (const [value, name] of typeFlagEntries) {
        if ((flags & value) !== 0)
            names.push(name);
    }
    const result = [...new Set(names)].sort();
    typeFlagsCache.set(flags, result);
    return result;
}
function symbolFlags(flags) {
    const cached = symbolFlagsCache.get(flags);
    if (cached !== undefined)
        return cached;
    const names = [];
    for (const [value, name] of symbolFlagEntries) {
        if ((flags & value) !== 0)
            names.push(name);
    }
    const result = [...new Set(names)].sort();
    symbolFlagsCache.set(flags, result);
    return result;
}
function stringModuleSpecifier(node) {
    return node && isStringLiteralLike(node) ? node.text : undefined;
}
function isStringLiteralLike(node) {
    return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}
function isJsonParseCall(node) {
    return ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === "JSON"
        && node.expression.name.text === "parse";
}
function containsExplicitAnyKeyword(node) {
    let found = false;
    const visit = (current) => {
        if (found)
            return;
        if (current.kind === ts.SyntaxKind.AnyKeyword) {
            found = true;
            return;
        }
        ts.forEachChild(current, visit);
    };
    visit(node);
    return found;
}
function isLiteralExpression(node) {
    return isStringLiteralLike(node) || ts.isNumericLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}
function propertyNameText(name, sourceFile) {
    if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
        return name.text;
    return name.getText(sourceFile);
}
function bindingNameText(name, sourceFile) {
    return ts.isIdentifier(name) ? name.text : name.getText(sourceFile);
}
function declarationName(node, sourceFile) {
    const name = functionNameNode(node);
    if (name)
        return propertyNameText(name, sourceFile);
    if (ts.isConstructorDeclaration(node))
        return "constructor";
    return "<anonymous>";
}
function functionNameNode(node) {
    if ("name" in node && node.name)
        return node.name;
    return undefined;
}
function functionTypeParameters(node) {
    if ("typeParameters" in node)
        return node.typeParameters;
    return undefined;
}
function functionReturnTypeNode(node) {
    if ("type" in node)
        return node.type;
    return undefined;
}
function typeParameterTexts(nodes) {
    return nodes?.map((node) => node.getText()).sort() ?? [];
}
function jsxTagName(node, sourceFile) {
    if (ts.isJsxFragment(node))
        return "";
    if (ts.isJsxElement(node))
        return node.openingElement.tagName.getText(sourceFile);
    return node.tagName.getText(sourceFile);
}
function jsxAttributeCount(node) {
    if (ts.isJsxFragment(node))
        return 0;
    if (ts.isJsxElement(node))
        return node.openingElement.attributes.properties.length;
    return node.attributes.properties.length;
}
function jsxProps(node, sourceFile) {
    if (ts.isJsxFragment(node))
        return [];
    const attributes = ts.isJsxElement(node)
        ? node.openingElement.attributes.properties
        : node.attributes.properties;
    return attributes.map((attribute, index) => {
        if (ts.isJsxSpreadAttribute(attribute)) {
            return {
                kind: "spread",
                ordinal: index,
                expression: attribute.expression.getText(sourceFile),
            };
        }
        const name = attribute.name.getText(sourceFile);
        if (!attribute.initializer) {
            return {
                kind: "attribute",
                ordinal: index,
                name,
                valueKind: "boolean",
                value: true,
            };
        }
        if (ts.isStringLiteral(attribute.initializer)) {
            return {
                kind: "attribute",
                ordinal: index,
                name,
                valueKind: "string",
                value: attribute.initializer.text,
            };
        }
        if (ts.isJsxExpression(attribute.initializer)) {
            const expression = attribute.initializer.expression;
            if (expression && ts.isStringLiteralLike(expression)) {
                return {
                    kind: "attribute",
                    ordinal: index,
                    name,
                    valueKind: "string",
                    value: expression.text,
                };
            }
            return {
                kind: "attribute",
                ordinal: index,
                name,
                valueKind: "expression",
                expression: expression?.getText(sourceFile) ?? "",
            };
        }
        return {
            kind: "attribute",
            ordinal: index,
            name,
            valueKind: syntaxKindName(attribute.initializer.kind),
            expression: attribute.initializer.getText(sourceFile),
        };
    });
}
function jsxChildren(node, sourceFile, coreFactId) {
    if (ts.isJsxSelfClosingElement(node))
        return [];
    const children = ts.isJsxFragment(node) ? node.children : node.children;
    const output = [];
    for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        if (!child)
            continue;
        if (ts.isJsxText(child)) {
            const text = child.getText(sourceFile);
            if (text.trim().length === 0)
                continue;
            output.push({
                kind: "text",
                ordinal: index,
                text,
            });
            continue;
        }
        if (ts.isJsxExpression(child)) {
            const expression = child.expression;
            if (!expression)
                continue;
            if (ts.isStringLiteralLike(expression)) {
                output.push({
                    kind: "text",
                    ordinal: index,
                    text: expression.text,
                });
                continue;
            }
            output.push({
                kind: "expression",
                ordinal: index,
                expression: expression.getText(sourceFile),
            });
            continue;
        }
        if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
            output.push({
                kind: "jsx_ref",
                ordinal: index,
                coreFact: coreFactId(child),
            });
            continue;
        }
    }
    return output;
}
function parameterFact(param, sourceFile, index, checker) {
    const declaredType = param.type?.getText(sourceFile);
    const inferredType = checker.getTypeAtLocation(param.name);
    return {
        index,
        name: bindingNameText(param.name, sourceFile),
        optional: param.questionToken !== undefined || param.initializer !== undefined,
        rest: param.dotDotDotToken !== undefined,
        typeSource: declaredType ?? checker.typeToString(inferredType),
        initializerKind: param.initializer ? syntaxKindName(param.initializer.kind) : undefined,
    };
}
function variableDeclarationKind(node) {
    let current = node;
    while (current.parent) {
        current = current.parent;
        if (ts.isVariableDeclarationList(current)) {
            if ((current.flags & ts.NodeFlags.Const) !== 0)
                return "const";
            if ((current.flags & ts.NodeFlags.Let) !== 0)
                return "let";
            return "var";
        }
    }
    return "var";
}
function isExportedVariable(node) {
    let current = node;
    while (current) {
        if (ts.isVariableStatement(current))
            return hasModifier(current, ts.SyntaxKind.ExportKeyword);
        current = current.parent;
    }
    return false;
}
function hasModifier(node, kind) {
    return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);
}
function isAssignmentOperator(kind) {
    return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}
function isPrototypeMutation(node) {
    if (ts.isPropertyAccessExpression(node))
        return ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "prototype";
    if (ts.isElementAccessExpression(node))
        return ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "prototype";
    return false;
}
function isDeclarationWithComputedName(node) {
    return (ts.isMethodDeclaration(node)
        || ts.isPropertyDeclaration(node)
        || ts.isGetAccessorDeclaration(node)
        || ts.isSetAccessorDeclaration(node)
        || ts.isPropertySignature(node)
        || ts.isMethodSignature(node)
        || ts.isEnumMember(node))
        && node.name !== undefined
        && ts.isComputedPropertyName(node.name);
}
function isDeclarationName(node) {
    const parent = node.parent;
    if (!parent)
        return false;
    if ((ts.isVariableDeclaration(parent)
        || ts.isFunctionDeclaration(parent)
        || ts.isClassDeclaration(parent)
        || ts.isInterfaceDeclaration(parent)
        || ts.isTypeAliasDeclaration(parent)
        || ts.isEnumDeclaration(parent)
        || ts.isParameter(parent)
        || ts.isPropertyDeclaration(parent)
        || ts.isMethodDeclaration(parent)
        || ts.isPropertySignature(parent)
        || ts.isMethodSignature(parent))
        && parent.name === node)
        return true;
    if ((ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent) || ts.isExportSpecifier(parent)) && parent.name === node)
        return true;
    return false;
}
function classifyModuleSpecifier(moduleName) {
    if (moduleName.startsWith(".") || moduleName.startsWith("/"))
        return { runtime: "project", source: "project" };
    const normalized = moduleName.startsWith("node:") ? moduleName.slice("node:".length) : moduleName;
    if (nodeBuiltins.has(normalized))
        return { runtime: "node", source: "node_builtin" };
    return { runtime: "node", source: "external_package" };
}
function classifyGlobalName(name) {
    if (browserGlobals.has(name))
        return { runtime: "browser", source: "browser_global" };
    if (jsCoreGlobals.has(name))
        return { runtime: "js-core", source: "ecmascript_builtin" };
    if (name === "Buffer" || name === "process" || name === "__dirname" || name === "__filename") {
        return { runtime: "node", source: "node_global" };
    }
    return undefined;
}
function classifyDeclarationSource(sourceFile, name) {
    const root = name.split(".")[0] ?? name;
    const global = classifyGlobalName(root);
    if (global)
        return global;
    return classifyDeclarationFileSource(sourceFile);
}
function classifyDeclarationFileSource(sourceFile) {
    const file = toPosix(sourceFile.fileName);
    if (file.includes("/node_modules/@types/node/") || file.endsWith("/@types/node/index.d.ts")) {
        return { runtime: "node", source: "node_type" };
    }
    if (file.includes("/typescript/lib/lib.dom")) {
        return { runtime: "browser", source: "dom_lib" };
    }
    if (file.includes("/typescript/lib/lib.es")) {
        return { runtime: "js-core", source: "ecmascript_lib" };
    }
    if (file.includes("/node_modules/@types/react/") || file.includes("/node_modules/react/")) {
        return { runtime: "node", source: "react_type" };
    }
    if (file.includes("/node_modules/")) {
        return { runtime: "node", source: "external_package_type" };
    }
    return { runtime: "unknown", source: "external_declaration" };
}
function rootIdentifierText(node) {
    if (ts.isIdentifier(node))
        return node.text;
    if (ts.isPropertyAccessExpression(node))
        return rootIdentifierText(node.expression);
    if (ts.isElementAccessExpression(node))
        return rootIdentifierText(node.expression);
    if (ts.isCallExpression(node))
        return rootIdentifierText(node.expression);
    return undefined;
}
function rootIdentifier(node) {
    if (ts.isIdentifier(node))
        return node;
    if (ts.isPropertyAccessExpression(node))
        return rootIdentifier(node.expression);
    if (ts.isElementAccessExpression(node))
        return rootIdentifier(node.expression);
    if (ts.isCallExpression(node))
        return rootIdentifier(node.expression);
    return undefined;
}
function isFunctionLikeWithBody(node) {
    return (ts.isFunctionDeclaration(node)
        || ts.isFunctionExpression(node)
        || ts.isArrowFunction(node)
        || ts.isMethodDeclaration(node)
        || ts.isConstructorDeclaration(node)
        || ts.isGetAccessorDeclaration(node)
        || ts.isSetAccessorDeclaration(node)) && node.body !== undefined;
}
function blockStatements(body) {
    return ts.isBlock(body) ? body.statements : [];
}
function asStatement(node) {
    return node;
}
function terminalKind(statements) {
    const last = statements[statements.length - 1];
    if (!last)
        return "return_void";
    if (ts.isReturnStatement(last))
        return "return";
    if (ts.isThrowStatement(last))
        return "throw";
    return "fallthrough";
}
