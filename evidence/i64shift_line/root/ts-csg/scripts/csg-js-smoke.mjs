import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const { validateCsgJsText } = await import(pathToFileURL(join(root, "dist/csg-js.js")).href);
const { externalSymbolProviderDecision, runtimeRequirementProviderDecision } = await import(pathToFileURL(join(root, "dist/runtime-providers.js")).href);

const arrayLiteProvider = "cheng/core/runtime/js_runtime.array-lite";
const stringLiteProvider = "cheng/core/runtime/js_runtime.string-lite";
const objectLiteProvider = "cheng/core/runtime/js_runtime.object-lite";
const scalarLiteProvider = "cheng/core/runtime/js_runtime.scalar-lite";
const promiseProvider = "cheng/core/runtime/js_promise_runtime.await-sync-i32";
const dateNowProvider = "std/times.epoch-time-ms";
const reactProvider = "cheng/core/runtime/web_react_runtime.hooks";
const domDocumentProvider = "cheng/core/runtime/web_runtime.dom-document-lite";
const localStorageProvider = "cheng/core/runtime/web_runtime.local-storage-lite";
const windowProvider = "cheng/core/runtime/web_runtime.window-lite";
const urlProvider = "cheng/core/runtime/web_runtime.url-lite";
const arrayLiteI32Proofs = ["array-lite-i32-fixed"];
const arrayLiteEmptyProofs = ["array-lite-empty"];
const arrayLiteStaticLengthProofs = ["array-lite-static-length"];
const arrayLiteConstStringLiteralProofs = ["array-lite-const-string-literal"];
const arrayLiteJsValueScalarLiteralProofs = ["array-lite-jsvalue-scalar-literal"];
const arrayLiteJsValueLiteralProofs = ["array-lite-jsvalue-literal"];
const arrayLiteJsValueSpreadLiteralProofs = ["array-lite-jsvalue-spread-literal"];
const arrayLiteJsValueLocalProofs = ["array-lite-jsvalue-local"];
const arrayLiteI32FromLocalProofs = ["array-lite-i32-from-local"];
const arrayLiteJsValueFromLengthProofs = ["array-lite-jsvalue-from-length"];
const arrayLiteStringSetFromProofs = ["array-lite-string-set-from"];
const arrayLiteStringSetValuesFromProofs = ["array-lite-string-set-values-from"];
const arrayLiteStringMapKeysFromProofs = ["array-lite-string-map-keys-from"];
const arrayLiteStringMapValuesFromProofs = ["array-lite-string-map-values-from"];
const arrayLiteStringMapKeysSpreadProofs = ["array-lite-string-map-keys-spread"];
const arrayLiteStringMapKeysDefaultSortProofs = ["array-lite-string-map-keys-default-sort"];
const arrayLiteDomCollectionFromProofs = ["array-lite-dom-collection-from"];
const arrayLiteUint8ArrayFromProofs = ["array-lite-uint8array-from"];
const arrayLiteUint8ArrayHexMapFromProofs = ["array-lite-uint8array-hex-map-from"];
const arrayLiteI32IsArrayLocalProofs = ["array-lite-i32-isarray-local"];
const arrayLiteI32PushLocalProofs = ["array-lite-i32-push-local"];
const arrayLiteJsValuePushLocalProofs = ["array-lite-jsvalue-push-local"];
const arrayLiteI32MapLocalProofs = ["array-lite-i32-map-local"];
const arrayLiteI32FilterLengthProofs = ["array-lite-i32-filter-length"];
const arrayLiteI32IncludesProofs = ["array-lite-i32-includes"];
const arrayLiteJsValueIncludesProofs = ["array-lite-jsvalue-includes-local"];
const arrayLiteConstStringIncludesProofs = ["array-lite-const-string-includes"];
const arrayLiteConstStringSomeEndsWithProofs = ["array-lite-const-string-some-endswith"];
const arrayLiteStringSomeItemStringMethodProofs = ["array-lite-string-some-item-string-method"];
const arrayLiteConstStringSomeHaystackStringMethodProofs = ["array-lite-const-string-some-haystack-string-method"];
const arrayLiteJsValuePredicateTruthyProofs = ["array-lite-jsvalue-predicate-truthy"];
const arrayLiteJsValueObjectSomeScalarPropertyEqualsProofs = ["array-lite-jsvalue-object-some-scalar-property-equals"];
const arrayLiteJsValueObjectSomeScalarPropertyConjunctionEqualsProofs = ["array-lite-jsvalue-object-some-scalar-property-conjunction-equals"];
const arrayLiteI32IndexOfLocalProofs = ["array-lite-i32-indexof-local"];
const arrayLiteStringIndexOfProofs = ["array-lite-string-indexof"];
const arrayLiteI32PredicateProofs = ["array-lite-i32-predicate"];
const arrayLiteI32AtProofs = ["array-lite-i32-at"];
const arrayLiteI32FindIndexLocalProofs = ["array-lite-i32-findindex-local"];
const arrayLiteJsValueObjectFindIndexScalarPropertyEqualsProofs = ["array-lite-jsvalue-object-findindex-scalar-property-equals"];
const arrayLiteJsValueObjectFindIndexScalarPropertyConjunctionEqualsProofs = ["array-lite-jsvalue-object-findindex-scalar-property-conjunction-equals"];
const arrayLiteJsValueObjectFindIndexScalarPropertyDisjunctionEqualsProofs = ["array-lite-jsvalue-object-findindex-scalar-property-disjunction-equals"];
const arrayLiteI32SliceLocalProofs = ["array-lite-i32-slice-local"];
const arrayLiteI32ConcatLocalProofs = ["array-lite-i32-concat-local"];
const arrayLiteI32ReverseLocalProofs = ["array-lite-i32-reverse-local"];
const arrayLiteI32SortLocalProofs = ["array-lite-i32-sort-local"];
const arrayLiteI32InlineDiffSortProofs = ["array-lite-i32-inline-diff-sort"];
const arrayLiteI32InlineDiffDescSortProofs = ["array-lite-i32-inline-diff-desc-sort"];
const arrayLiteObjectI32KeyInlineDiffSortProofs = ["array-lite-object-i32-key-inline-diff-sort"];
const arrayLiteObjectI32KeyInlineDiffDescSortProofs = ["array-lite-object-i32-key-inline-diff-desc-sort"];
const arrayLiteObjectOptionalI32KeyNullishZeroInlineDiffSortProofs = ["array-lite-object-optional-i32-key-nullish-zero-inline-diff-sort"];
const arrayLiteObjectOptionalI32KeyNullishZeroInlineDiffDescSortProofs = ["array-lite-object-optional-i32-key-nullish-zero-inline-diff-desc-sort"];
const arrayLiteObjectOptionalI32KeyLogicalOrZeroInlineDiffSortProofs = ["array-lite-object-optional-i32-key-logical-or-zero-inline-diff-sort"];
const arrayLiteObjectOptionalI32KeyLogicalOrZeroInlineDiffDescSortProofs = ["array-lite-object-optional-i32-key-logical-or-zero-inline-diff-desc-sort"];
const arrayLiteArrayI32IndexInlineDiffSortProofs = ["array-lite-array-i32-index-inline-diff-sort"];
const arrayLiteArrayI32IndexInlineDiffDescSortProofs = ["array-lite-array-i32-index-inline-diff-desc-sort"];
const arrayLiteArrayOptionalI32IndexNullishZeroInlineDiffSortProofs = ["array-lite-array-optional-i32-index-nullish-zero-inline-diff-sort"];
const arrayLiteArrayOptionalI32IndexNullishZeroInlineDiffDescSortProofs = ["array-lite-array-optional-i32-index-nullish-zero-inline-diff-desc-sort"];
const arrayLiteArrayOptionalI32IndexLogicalOrZeroInlineDiffSortProofs = ["array-lite-array-optional-i32-index-logical-or-zero-inline-diff-sort"];
const arrayLiteArrayOptionalI32IndexLogicalOrZeroInlineDiffDescSortProofs = ["array-lite-array-optional-i32-index-logical-or-zero-inline-diff-desc-sort"];
const arrayLiteStringDefaultSortProofs = ["array-lite-string-default-sort"];
const arrayLiteObjectKeysDefaultSortProofs = ["array-lite-object-keys-default-sort"];
const arrayLiteI32FillLocalProofs = ["array-lite-i32-fill-local"];
const arrayLiteI32ReduceProofs = ["array-lite-i32-reduce"];
const arrayLiteI32FreezeLocalProofs = ["array-lite-i32-freeze-local"];
const arrayLiteJsValueFreezeFreshProofs = ["array-lite-jsvalue-freeze-fresh"];
const arrayLiteI32IsFrozenLocalProofs = ["array-lite-i32-isfrozen-local"];
const arrayLiteI32ForOfLocalProofs = ["array-lite-i32-for-of-local"];
const objectLiteFreezeLocalProofs = ["object-lite-freeze-local"];
const objectJsValueFreezeFreshProofs = ["object-jsvalue-freeze-fresh"];
const objectLiteIsFrozenLocalProofs = ["object-lite-isfrozen-local"];
const stringTypeMethodProofs = ["string-type-method"];
const stringRegexLiteralReplaceProofs = ["string-regex-literal-replace"];
const stringRegexLiteralAffixReplaceProofs = ["string-regex-literal-affix-replace"];
const stringRegexAsciiClassReplaceProofs = ["string-regex-ascii-class-replace"];
const stringRegexLineSplitProofs = ["string-regex-line-split"];
const stringRegexAsciiClassSplitProofs = ["string-regex-ascii-class-split"];
const arrayLiteI32LocalProofs = ["array-lite-i32-local"];
const objectLiteValuesLocalProofs = ["object-lite-values-local"];
const objectLiteKeyEntryLengthProofs = ["object-lite-key-entry-length"];
const objectLiteKeysLocalProofs = ["object-lite-keys-local"];
const objectJsValueKeysLengthProofs = ["object-jsvalue-keys-length"];
const objectJsValueKeysArrayProofs = ["object-jsvalue-keys-array"];
const objectJsValueValuesArrayProofs = ["object-jsvalue-values-array"];
const objectJsValueEntriesArrayProofs = ["object-jsvalue-entries-array"];
const stringAsciiLiteralProofs = ["string-ascii-literal"];
const stringScalarLengthProofs = ["string-scalar-length"];
const stringRuntimeLengthProofs = ["string-runtime-length"];
const collectionConstructorEmptyProofs = ["collection-constructor-empty"];
const collectionConstructorStringArrayProofs = ["collection-constructor-string-array"];
const collectionConstructorStringI32EntryArrayProofs = ["collection-constructor-string-i32-entry-array"];
const collectionSetStringValuesIteratorProofs = ["collection-set-string-values-iterator"];
const collectionMapStringKeysIteratorProofs = ["collection-map-string-keys-iterator"];
const collectionMapStringValuesIteratorProofs = ["collection-map-string-values-iterator"];
const uint8ArrayConstructorLengthProofs = ["uint8array-constructor-length"];
const uint8ArrayConstructorByteArrayProofs = ["uint8array-constructor-byte-array"];
const uint8ArrayConstructorBufferViewProofs = ["uint8array-constructor-buffer-view"];
const stringConvertScalarProofs = ["string-convert-scalar"];
const namespaceReferenceProofs = ["namespace-reference"];
const promiseAwaitAsyncSyncI32Proofs = ["promise-await-async-sync-i32"];
const dateNowMsProofs = ["date-now-ms"];
const dateConstructorNowMsProofs = ["date-constructor-now-ms"];
const reactUseStateProofs = ["react-use-state-hook"];
const reactUseRefProofs = ["react-use-ref-hook"];
const reactUseCallbackProofs = ["react-use-callback-hook"];
const reactModuleImportProofs = ["react-module-import-pure-runtime"];
const browserDocumentGlobalProofs = ["browser-document-global"];
const browserDocumentBodyProofs = ["browser-document-body"];
const browserDocumentHeadProofs = ["browser-document-head"];
const browserDocumentElementProofs = ["browser-document-element"];
const browserDocumentHiddenProofs = ["browser-document-hidden"];
const browserDocumentVisibilityStateProofs = ["browser-document-visibility-state"];
const browserDocumentDatasetProofs = ["browser-document-dataset"];
const browserDocumentDatasetStringWriteProofs = ["browser-document-dataset-string-write"];
const browserInlineStyleAccessProofs = ["browser-inline-style-access"];
const browserInlineStylePropertyReadProofs = ["browser-inline-style-property-read"];
const browserInlineStyleSetPropertyProofs = ["browser-inline-style-set-property"];
const browserInlineStyleObjectAssignProofs = ["browser-inline-style-object-assign"];
const browserDocumentCreateElementProofs = ["browser-document-create-element-literal"];
const browserTextEncoderConstructorProofs = ["browser-text-encoder-constructor"];
const browserTextDecoderConstructorProofs = ["browser-text-decoder-constructor"];
const browserTextEncoderEncodeProofs = ["browser-text-encoder-encode-utf8"];
const browserTextDecoderDecodeProofs = ["browser-text-decoder-decode-utf8"];
const browserEventConstructorProofs = ["browser-event-constructor-literal"];
const browserEventDispatchProofs = ["browser-event-dispatch-event-object"];
const browserEventAddEventListenerProofs = ["browser-event-add-listener"];
const browserEventRemoveEventListenerProofs = ["browser-event-remove-listener"];
const browserEventPreventDefaultProofs = ["browser-event-prevent-default"];
const browserEventStopPropagationProofs = ["browser-event-stop-propagation"];
const browserElementSetAttributeProofs = ["browser-element-set-attribute"];
const browserElementGetAttributeProofs = ["browser-element-get-attribute"];
const browserElementHasAttributeProofs = ["browser-element-has-attribute"];
const browserElementRemoveAttributeProofs = ["browser-element-remove-attribute"];
const browserElementClassListAccessProofs = ["browser-element-classlist-access"];
const browserElementClassListCallProofs = ["browser-element-classlist-call"];
const browserElementAppendProofs = ["browser-element-append"];
const browserElementAppendChildProofs = ["browser-element-append-child"];
const browserElementRemoveProofs = ["browser-element-remove"];
const browserElementContainsProofs = ["browser-element-contains"];
const browserDocumentQuerySelectorProofs = ["browser-document-query-selector"];
const browserDocumentQuerySelectorAllProofs = ["browser-document-query-selector-all"];
const browserDocumentGetElementByIdProofs = ["browser-document-get-element-by-id"];
const browserElementMatchesProofs = ["browser-element-matches"];
const browserElementClosestProofs = ["browser-element-closest"];
const browserLocalStorageGlobalProofs = ["browser-local-storage-global"];
const browserLocalStorageGetItemProofs = ["browser-local-storage-getitem"];
const browserLocalStorageSetItemProofs = ["browser-local-storage-setitem"];
const browserLocalStorageRemoveItemProofs = ["browser-local-storage-removeitem"];
const browserLocalStorageClearProofs = ["browser-local-storage-clear"];
const browserWindowGlobalProofs = ["browser-window-global"];
const browserWindowLocalStorageProofs = ["browser-window-local-storage"];
const browserWindowScrollProofs = ["browser-window-scroll-readonly-scalar"];
const browserWindowCancelAnimationFrameProofs = ["browser-window-cancel-animation-frame"];
const browserWindowBase64CodecProofs = ["browser-window-base64-codec"];
const browserWindowMatchMediaMatchesProofs = ["browser-window-matchmedia-matches"];
const browserWindowMatchMediaListProofs = ["browser-window-matchmedia-list"];
const browserMediaQueryListListenerProofs = ["browser-mediaquery-list-listener"];
const browserIntersectionObserverConstructorProofs = ["browser-intersection-observer-constructor"];
const browserIntersectionObserverObserveProofs = ["browser-intersection-observer-observe"];
const browserIntersectionObserverDisconnectProofs = ["browser-intersection-observer-disconnect"];
const browserUrlToStringProofs = ["browser-url-tostring"];

const cases = [
  {
    name: "basic",
    project: "fixtures/basic/tsconfig.json",
    expectAsync: false,
    expectClass: true,
    expectImport: true,
  },
  {
    name: "async",
    project: "fixtures/cheng-source-async/tsconfig.json",
    expectAsync: true,
    expectClass: false,
    expectImport: false,
    expectAggregateOps: false,
  },
  {
    name: "aggregate",
    project: "fixtures/cheng-source-aggregate/tsconfig.json",
    expectAsync: false,
    expectClass: false,
    expectImport: false,
    expectAggregateOps: true,
  },
  {
    name: "object-write",
    project: "fixtures/csg-js-object-write/tsconfig.json",
    expectAsync: false,
    expectClass: false,
    expectImport: false,
    expectCall: false,
    expectAggregateOps: true,
    expectObjectWrites: true,
  },
];

assertClosedRuntimeRequirementDecision("array_literal", "Array.literal", "ecmascript_array", arrayLiteProvider, arrayLiteI32Proofs);
assertClosedRuntimeRequirementDecision("array_literal", "Array.literal", "ecmascript_array", arrayLiteProvider, arrayLiteEmptyProofs);
assertClosedRuntimeRequirementDecision("array_literal", "Array.literal", "ecmascript_array", arrayLiteProvider, arrayLiteConstStringLiteralProofs);
assertClosedRuntimeRequirementDecision("array_literal", "Array.literal", "ecmascript_array", arrayLiteProvider, arrayLiteJsValueScalarLiteralProofs);
assertClosedRuntimeRequirementDecision("array_literal", "Array.literal", "ecmascript_array", arrayLiteProvider, arrayLiteJsValueLiteralProofs);
assertClosedRuntimeRequirementDecision("array_literal", "Array.literal", "ecmascript_array", arrayLiteProvider, arrayLiteJsValueSpreadLiteralProofs);
assertClosedRuntimeRequirementDecision("property_read", "Array.length", "ecmascript_array", arrayLiteProvider, arrayLiteI32Proofs);
assertClosedRuntimeRequirementDecision("property_read", "Array.length", "ecmascript_array", arrayLiteProvider, arrayLiteStaticLengthProofs);
assertClosedRuntimeRequirementDecision("property_read", "Array.length", "ecmascript_array", arrayLiteProvider, arrayLiteI32LocalProofs);
assertClosedRuntimeRequirementDecision("property_read", "Array.length", "ecmascript_array", arrayLiteProvider, arrayLiteJsValueLocalProofs);
assertClosedRuntimeRequirementDecision("element_read", "Array.index", "ecmascript_array", arrayLiteProvider, arrayLiteI32Proofs);
assertClosedRuntimeRequirementDecision("element_write", "Array.index_write", "ecmascript_array", arrayLiteProvider, arrayLiteI32Proofs);
assertOpenRuntimeRequirementDecision("call", "Array.from", "ecmascript_array", "cheng-source.js-core.array-from-lite");
assertClosedRuntimeRequirementDecision("call", "Array.from", "ecmascript_array", arrayLiteProvider, arrayLiteI32FromLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Array.from", "ecmascript_array", arrayLiteProvider, arrayLiteJsValueFromLengthProofs);
assertClosedRuntimeRequirementDecision("call", "Array.from", "ecmascript_array", arrayLiteProvider, arrayLiteStringSetFromProofs);
assertClosedRuntimeRequirementDecision("call", "Array.from", "ecmascript_array", arrayLiteProvider, arrayLiteStringSetValuesFromProofs);
assertClosedRuntimeRequirementDecision("call", "Array.from", "ecmascript_array", arrayLiteProvider, arrayLiteStringMapKeysFromProofs);
assertClosedRuntimeRequirementDecision("call", "Array.from", "ecmascript_array", arrayLiteProvider, arrayLiteStringMapValuesFromProofs);
assertClosedRuntimeRequirementDecision("call", "Array.from", "ecmascript_array", domDocumentProvider, arrayLiteDomCollectionFromProofs);
assertClosedRuntimeRequirementDecision("call", "Array.from", "ecmascript_array", arrayLiteProvider, arrayLiteUint8ArrayFromProofs);
assertClosedRuntimeRequirementDecision("call", "Array.from", "ecmascript_array", arrayLiteProvider, arrayLiteUint8ArrayHexMapFromProofs);
assertClosedRuntimeRequirementDecision("spread", "spread", "ecmascript_iterator", arrayLiteProvider, arrayLiteStringMapKeysSpreadProofs);
assertClosedRuntimeRequirementDecision("call", "Array.isArray", "ecmascript_array", arrayLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Array.isArray", "ecmascript_array", arrayLiteProvider, arrayLiteI32IsArrayLocalProofs);
assertOpenRuntimeRequirementDecision("call", "Object.freeze", "ecmascript_object", "cheng-source.js-core.object-freeze-lite");
assertClosedRuntimeRequirementDecision("call", "Object.freeze", "ecmascript_object", arrayLiteProvider, arrayLiteI32FreezeLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Object.freeze", "ecmascript_object", arrayLiteProvider, arrayLiteJsValueFreezeFreshProofs);
assertClosedRuntimeRequirementDecision("call", "Object.freeze", "ecmascript_object", objectLiteProvider, objectLiteFreezeLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Object.freeze", "ecmascript_object", objectLiteProvider, objectJsValueFreezeFreshProofs);
assertOpenRuntimeRequirementDecision("call", "Object.isFrozen", "ecmascript_object", "cheng-source.js-core.object-isfrozen-lite");
assertClosedRuntimeRequirementDecision("call", "Object.isFrozen", "ecmascript_object", arrayLiteProvider, arrayLiteI32IsFrozenLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Object.isFrozen", "ecmascript_object", objectLiteProvider, objectLiteIsFrozenLocalProofs);
assertOpenRuntimeRequirementDecision("call", "Object.values", "ecmascript_object", "cheng-source.js-core.object-values-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Object.values", "ecmascript_object", objectLiteProvider, objectLiteValuesLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Object.values", "ecmascript_object", objectLiteProvider, objectJsValueValuesArrayProofs);
assertOpenRuntimeRequirementDecision("call", "Object.keys", "ecmascript_object", "cheng-source.js-core.object-key-entry-length-lite");
assertClosedRuntimeRequirementDecision("call", "Object.keys", "ecmascript_object", objectLiteProvider, objectLiteKeyEntryLengthProofs);
assertClosedRuntimeRequirementDecision("call", "Object.keys", "ecmascript_object", objectLiteProvider, objectLiteKeysLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Object.keys", "ecmascript_object", objectLiteProvider, objectJsValueKeysLengthProofs);
assertClosedRuntimeRequirementDecision("call", "Object.keys", "ecmascript_object", objectLiteProvider, objectJsValueKeysArrayProofs);
assertOpenRuntimeRequirementDecision("call", "Object.entries", "ecmascript_object", "cheng-source.js-core.object-key-entry-length-lite");
assertClosedRuntimeRequirementDecision("call", "Object.entries", "ecmascript_object", objectLiteProvider, objectLiteKeyEntryLengthProofs);
assertOpenRuntimeRequirementDecision("property_read", "String.length", "ecmascript_string", "cheng-source.js-core.string-literal");
assertClosedRuntimeRequirementDecision("property_read", "String.length", "ecmascript_string", stringLiteProvider, stringAsciiLiteralProofs);
assertClosedRuntimeRequirementDecision("property_read", "String.length", "ecmascript_string", stringLiteProvider, stringScalarLengthProofs);
assertClosedRuntimeRequirementDecision("property_read", "String.length", "ecmascript_string", stringLiteProvider, stringRuntimeLengthProofs);
assertOpenRuntimeRequirementDecision("call", "String.trim", "ecmascript_string", "cheng-source.js-core.string-literal");
assertClosedRuntimeRequirementDecision("call", "String.trim", "ecmascript_string", stringLiteProvider, stringAsciiLiteralProofs);
assertClosedRuntimeRequirementDecision("call", "String.trim", "ecmascript_string", stringLiteProvider, stringTypeMethodProofs);
assertClosedRuntimeRequirementDecision("call", "String.replace", "ecmascript_string", stringLiteProvider, stringRegexLiteralReplaceProofs);
assertClosedRuntimeRequirementDecision("call", "String.replace", "ecmascript_string", stringLiteProvider, stringRegexLiteralAffixReplaceProofs);
assertClosedRuntimeRequirementDecision("call", "String.replace", "ecmascript_string", stringLiteProvider, stringRegexAsciiClassReplaceProofs);
assertClosedRuntimeRequirementDecision("call", "String.split", "ecmascript_string", stringLiteProvider, stringRegexLineSplitProofs);
assertClosedRuntimeRequirementDecision("call", "String.split", "ecmascript_string", stringLiteProvider, stringRegexAsciiClassSplitProofs);
assertOpenRuntimeRequirementDecision("call", "String", "ecmascript_builtin", "cheng-source.js-core.string-convert-scalar");
assertClosedRuntimeRequirementDecision("call", "String", "ecmascript_builtin", stringLiteProvider, stringConvertScalarProofs);
assertClosedRuntimeRequirementDecision("call", "Date.now", "ecmascript_builtin", dateNowProvider, dateNowMsProofs);
assertClosedRuntimeRequirementDecision("constructor", "Date", "ecmascript_builtin", dateNowProvider, dateConstructorNowMsProofs);
assertClosedRuntimeRequirementDecision("await", "Promise.await", "ecmascript_promise", promiseProvider);
assertClosedRuntimeRequirementDecision("await", "Promise.await", "ecmascript_promise", promiseProvider, promiseAwaitAsyncSyncI32Proofs);
assertClosedRuntimeRequirementDecision("async_function", "main", "ecmascript_promise", promiseProvider);
assertClosedRuntimeRequirementDecision("async_function", "main", "ecmascript_promise", promiseProvider, promiseAwaitAsyncSyncI32Proofs);
assertClosedRuntimeRequirementDecision("call", "Array.map", "ecmascript_array", arrayLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Array.map", "ecmascript_array", arrayLiteProvider, arrayLiteI32MapLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Array.filter", "ecmascript_array", arrayLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Array.filter", "ecmascript_array", arrayLiteProvider, arrayLiteI32FilterLengthProofs);
assertClosedRuntimeRequirementDecision("call", "Array.includes", "ecmascript_array", arrayLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Array.includes", "ecmascript_array", arrayLiteProvider, arrayLiteI32IncludesProofs);
assertClosedRuntimeRequirementDecision("call", "Array.includes", "ecmascript_array", arrayLiteProvider, arrayLiteJsValueIncludesProofs);
assertClosedRuntimeRequirementDecision("call", "Array.includes", "ecmascript_array", arrayLiteProvider, arrayLiteConstStringIncludesProofs);
assertOpenRuntimeRequirementDecision("call", "Array.indexOf", "ecmascript_array", "cheng-source.js-core.array-indexof-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.indexOf", "ecmascript_array", arrayLiteProvider, arrayLiteI32IndexOfLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Array.indexOf", "ecmascript_array", arrayLiteProvider, arrayLiteStringIndexOfProofs);
assertOpenRuntimeRequirementDecision("call", "Array.lastIndexOf", "ecmascript_array", "cheng-source.js-core.array-indexof-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.lastIndexOf", "ecmascript_array", arrayLiteProvider, arrayLiteI32IndexOfLocalProofs);
assertOpenRuntimeRequirementDecision("call", "Array.some", "ecmascript_array", "cheng-source.js-core.array-predicate-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.some", "ecmascript_array", arrayLiteProvider, arrayLiteI32PredicateProofs);
assertClosedRuntimeRequirementDecision("call", "Array.some", "ecmascript_array", arrayLiteProvider, arrayLiteConstStringSomeEndsWithProofs);
assertClosedRuntimeRequirementDecision("call", "Array.some", "ecmascript_array", arrayLiteProvider, arrayLiteStringSomeItemStringMethodProofs);
assertClosedRuntimeRequirementDecision("call", "Array.some", "ecmascript_array", arrayLiteProvider, arrayLiteConstStringSomeHaystackStringMethodProofs);
assertClosedRuntimeRequirementDecision("call", "Array.some", "ecmascript_array", arrayLiteProvider, arrayLiteJsValuePredicateTruthyProofs);
assertClosedRuntimeRequirementDecision("call", "Array.some", "ecmascript_array", arrayLiteProvider, arrayLiteJsValueObjectSomeScalarPropertyEqualsProofs);
assertClosedRuntimeRequirementDecision("call", "Array.some", "ecmascript_array", arrayLiteProvider, arrayLiteJsValueObjectSomeScalarPropertyConjunctionEqualsProofs);
assertOpenRuntimeRequirementDecision("call", "Array.every", "ecmascript_array", "cheng-source.js-core.array-predicate-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.every", "ecmascript_array", arrayLiteProvider, arrayLiteI32PredicateProofs);
assertClosedRuntimeRequirementDecision("call", "Array.every", "ecmascript_array", arrayLiteProvider, arrayLiteJsValuePredicateTruthyProofs);
assertClosedRuntimeRequirementDecision("call", "Array.at", "ecmascript_array", arrayLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Array.at", "ecmascript_array", arrayLiteProvider, arrayLiteI32AtProofs);
assertOpenRuntimeRequirementDecision("call", "Array.findIndex", "ecmascript_array", "cheng-source.js-core.array-findindex-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.findIndex", "ecmascript_array", arrayLiteProvider, arrayLiteI32FindIndexLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Array.findIndex", "ecmascript_array", arrayLiteProvider, arrayLiteJsValueObjectFindIndexScalarPropertyEqualsProofs);
assertClosedRuntimeRequirementDecision("call", "Array.findIndex", "ecmascript_array", arrayLiteProvider, arrayLiteJsValueObjectFindIndexScalarPropertyConjunctionEqualsProofs);
assertClosedRuntimeRequirementDecision("call", "Array.findIndex", "ecmascript_array", arrayLiteProvider, arrayLiteJsValueObjectFindIndexScalarPropertyDisjunctionEqualsProofs);
assertClosedRuntimeRequirementDecision("call", "Array.slice", "ecmascript_array", arrayLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Array.slice", "ecmascript_array", arrayLiteProvider, arrayLiteI32SliceLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Array.concat", "ecmascript_array", arrayLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Array.concat", "ecmascript_array", arrayLiteProvider, arrayLiteI32ConcatLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Array.reverse", "ecmascript_array", arrayLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Array.reverse", "ecmascript_array", arrayLiteProvider, arrayLiteI32ReverseLocalProofs);
assertOpenRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", "cheng-source.js-core.array-sort-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteI32SortLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteI32InlineDiffSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteI32InlineDiffDescSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteObjectI32KeyInlineDiffSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteObjectI32KeyInlineDiffDescSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteObjectOptionalI32KeyNullishZeroInlineDiffSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteObjectOptionalI32KeyNullishZeroInlineDiffDescSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteObjectOptionalI32KeyLogicalOrZeroInlineDiffSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteObjectOptionalI32KeyLogicalOrZeroInlineDiffDescSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteArrayI32IndexInlineDiffSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteArrayI32IndexInlineDiffDescSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteArrayOptionalI32IndexNullishZeroInlineDiffSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteArrayOptionalI32IndexNullishZeroInlineDiffDescSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteArrayOptionalI32IndexLogicalOrZeroInlineDiffSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteArrayOptionalI32IndexLogicalOrZeroInlineDiffDescSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteStringDefaultSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteStringMapKeysDefaultSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.sort", "ecmascript_array", arrayLiteProvider, arrayLiteObjectKeysDefaultSortProofs);
assertClosedRuntimeRequirementDecision("call", "Array.fill", "ecmascript_array", arrayLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Array.fill", "ecmascript_array", arrayLiteProvider, arrayLiteI32FillLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Array.reduce", "ecmascript_array", arrayLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Array.reduce", "ecmascript_array", arrayLiteProvider, arrayLiteI32ReduceProofs);
assertClosedRuntimeRequirementDecision("iterator_loop", "ForOfStatement", "ecmascript_iterator", arrayLiteProvider);
assertClosedRuntimeRequirementDecision("iterator_loop", "ForOfStatement", "ecmascript_iterator", arrayLiteProvider, arrayLiteI32ForOfLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Array.push", "ecmascript_array", arrayLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Array.push", "ecmascript_array", arrayLiteProvider, arrayLiteI32PushLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Array.push", "ecmascript_array", arrayLiteProvider, arrayLiteJsValuePushLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Promise.resolve", "ecmascript_promise", promiseProvider);
assertClosedRuntimeRequirementDecision("call", "Promise.all", "ecmascript_promise", promiseProvider);
assertClosedRuntimeRequirementDecision("call", "Promise.race", "ecmascript_promise", promiseProvider);
assertClosedRuntimeRequirementDecision("call", "Promise.reject", "ecmascript_promise", promiseProvider);
assertClosedRuntimeRequirementDecision("call", "useState", "react_type", reactProvider, undefined, "node");
assertClosedRuntimeRequirementDecision("call", "useState", "react_type", reactProvider, reactUseStateProofs, "node");
assertClosedRuntimeRequirementDecision("call", "useRef", "react_type", reactProvider, undefined, "node");
assertClosedRuntimeRequirementDecision("call", "useRef", "react_type", reactProvider, reactUseRefProofs, "node");
assertClosedRuntimeRequirementDecision("call", "useCallback", "react_type", reactProvider, undefined, "node");
assertClosedRuntimeRequirementDecision("call", "useCallback", "react_type", reactProvider, reactUseCallbackProofs, "node");
assertOpenRuntimeRequirementDecision("call", "useEffect", "react_type", "cheng-source.react.use-effect", "node");
assertOpenRuntimeRequirementDecision("call", "React.useEffect", "react_type", "cheng-source.react.use-effect", "node");
assertClosedRuntimeRequirementDecision("call", "useEffect", "react_type", reactProvider, ["react-use-effect-cfg-hook"], "node");
assertClosedRuntimeRequirementDecision("call", "useMemo", "react_type", reactProvider, undefined, "node");
assertClosedRuntimeRequirementDecision("call", "React.useMemo", "react_type", reactProvider, undefined, "node");
assertOpenRuntimeRequirementDecision("module_import", "react", "external_package", "cheng-source.node.module-import", "node");
assertClosedRuntimeRequirementDecision("module_import", "react", "external_package", reactProvider, reactModuleImportProofs, "node");
assertOpenRuntimeRequirementDecision("module_import", "react-dom/client", "external_package", "cheng-source.node.module-import", "node");
assertClosedRuntimeRequirementDecision("module_import", "react-dom/client", "external_package", reactProvider, reactModuleImportProofs, "node");
assertClosedRuntimeRequirementDecision("call", "ReactDOM.createRoot", "external_package_type", "cheng-source.react.root-render", undefined, "node");
assertClosedRuntimeRequirementDecision("call", "ReactDOM.createRoot(root).render", "external_package_type", "cheng-source.react.root-render", undefined, "node");
assertClosedExternalSymbolDecision("react", "external_package", reactProvider, "node");
assertClosedExternalSymbolDecision("react-dom/client", "external_package", reactProvider, "node");
assertClosedExternalSymbolDecision("ReactDOM.createRoot", "external_package_type", "cheng-source.react.root-render", "node");
assertClosedExternalSymbolDecision("ReactDOM.createRoot(root).render", "external_package_type", "cheng-source.react.root-render", "node");
// Math.* i32 calls
assertClosedRuntimeRequirementDecision("call", "Math.abs", "ecmascript_builtin", scalarLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Math.ceil", "ecmascript_builtin", scalarLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Math.floor", "ecmascript_builtin", scalarLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Math.max", "ecmascript_builtin", scalarLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Math.min", "ecmascript_builtin", scalarLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Math.round", "ecmascript_builtin", scalarLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Math.trunc", "ecmascript_builtin", scalarLiteProvider);
assertClosedRuntimeRequirementDecision("call", "Math.random", "ecmascript_builtin", scalarLiteProvider);
assertClosedExternalSymbolDecision("Math.abs", "ecmascript_builtin", scalarLiteProvider);
assertClosedExternalSymbolDecision("Math.floor", "ecmascript_builtin", scalarLiteProvider);
assertClosedExternalSymbolDecision("Math.max", "ecmascript_builtin", scalarLiteProvider);
assertClosedExternalSymbolDecision("Math.random", "ecmascript_builtin", scalarLiteProvider);
assertClosedRuntimeRequirementDecision("global", "Map", "ecmascript_builtin", scalarLiteProvider, namespaceReferenceProofs);
assertClosedRuntimeRequirementDecision("global", "Set", "ecmascript_builtin", scalarLiteProvider, namespaceReferenceProofs);
assertClosedRuntimeRequirementDecision("global", "Set", "ecmascript_builtin", "cheng/core/runtime/js_runtime.scalar-lite", namespaceReferenceProofs);
assertOpenRuntimeRequirementDecision("constructor", "Map", "ecmascript_builtin", "cheng-source.js-core.constructor");
assertClosedRuntimeRequirementDecision("constructor", "Map", "ecmascript_builtin", objectLiteProvider, collectionConstructorEmptyProofs);
assertClosedRuntimeRequirementDecision("constructor", "Map", "ecmascript_builtin", objectLiteProvider, collectionConstructorStringI32EntryArrayProofs);
assertClosedRuntimeRequirementDecision("call", "handlers.keys", "ecmascript_lib", objectLiteProvider, collectionMapStringKeysIteratorProofs);
assertClosedRuntimeRequirementDecision("call", "handlers.values", "ecmascript_lib", objectLiteProvider, collectionMapStringValuesIteratorProofs);
assertClosedRuntimeRequirementDecision("call", "handlers.values", "ecmascript_lib", objectLiteProvider, collectionMapStringValuesIteratorProofs);
assertOpenRuntimeRequirementDecision("constructor", "Set", "ecmascript_builtin", "cheng-source.js-core.constructor");
assertClosedRuntimeRequirementDecision("constructor", "Set", "ecmascript_builtin", objectLiteProvider, collectionConstructorEmptyProofs);
assertClosedRuntimeRequirementDecision("constructor", "Set", "ecmascript_builtin", objectLiteProvider, collectionConstructorStringArrayProofs);
assertClosedRuntimeRequirementDecision("call", "selected.values", "ecmascript_lib", objectLiteProvider, collectionSetStringValuesIteratorProofs);
assertOpenRuntimeRequirementDecision("constructor", "Uint8Array", "ecmascript_builtin", "cheng-source.js-core.constructor");
assertClosedRuntimeRequirementDecision("constructor", "Uint8Array", "ecmascript_builtin", objectLiteProvider, uint8ArrayConstructorLengthProofs);
assertClosedRuntimeRequirementDecision("constructor", "Uint8Array", "ecmascript_builtin", objectLiteProvider, uint8ArrayConstructorByteArrayProofs);
assertClosedRuntimeRequirementDecision("constructor", "Uint8Array", "ecmascript_builtin", objectLiteProvider, uint8ArrayConstructorBufferViewProofs);
assertOpenExternalSymbolDecision("Map", "ecmascript_builtin", "cheng-source.js-core.constructor");
assertOpenExternalSymbolDecision("Set", "ecmascript_builtin", "cheng-source.js-core.constructor");
assertOpenExternalSymbolDecision("Array.from", "ecmascript_array", "cheng-source.js-core.array-from-lite");
assertOpenExternalSymbolDecision("Array.includes", "ecmascript_array", "cheng-source.js-core.array-includes-lite-i32");
assertOpenExternalSymbolDecision("String", "ecmascript_builtin", "cheng-source.js-core.string-convert-scalar");
assertOpenExternalSymbolDecision("String.trim", "ecmascript_string", "cheng-source.js-core.string-literal");
assertOpenExternalSymbolDecision("console.log", "ecmascript_builtin", "cheng-source.js-core.console");
assertOpenRuntimeRequirementDecision("global", "document", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("global", "document", "browser_global", domDocumentProvider, browserDocumentGlobalProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.body", "browser_global", domDocumentProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.body", "browser_global", domDocumentProvider, browserDocumentBodyProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.head", "browser_global", domDocumentProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.head", "browser_global", domDocumentProvider, browserDocumentHeadProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "document.documentElement", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.documentElement", "browser_global", domDocumentProvider, browserDocumentElementProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.hidden", "browser_global", domDocumentProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.hidden", "browser_global", domDocumentProvider, browserDocumentHiddenProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.visibilityState", "browser_global", domDocumentProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.visibilityState", "browser_global", domDocumentProvider, browserDocumentVisibilityStateProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.dataset", "browser_global", domDocumentProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.dataset", "browser_global", domDocumentProvider, browserDocumentDatasetProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.body.dataset", "browser_global", domDocumentProvider, browserDocumentDatasetProofs, "browser");
assertClosedRuntimeRequirementDecision("property_write", "document.dataset.write", "browser_global", domDocumentProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("property_write", "document.dataset.write", "browser_global", domDocumentProvider, browserDocumentDatasetStringWriteProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.style", "browser_global", domDocumentProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.style", "browser_global", domDocumentProvider, browserInlineStyleAccessProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "document.style.display", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.style.display", "browser_global", domDocumentProvider, browserInlineStylePropertyReadProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "node.style.setProperty", "dom_lib", domDocumentProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("call", "node.style.setProperty", "dom_lib", domDocumentProvider, browserInlineStyleSetPropertyProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "Object.assign", "ecmascript_builtin", domDocumentProvider, browserInlineStyleObjectAssignProofs);
assertOpenRuntimeRequirementDecision("call", "document.createElement", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "document.createElement", "browser_global", domDocumentProvider, browserDocumentCreateElementProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.createElement", "browser_global", domDocumentProvider, browserDocumentCreateElementProofs, "browser");
assertOpenRuntimeRequirementDecision("constructor", "TextEncoder", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("constructor", "TextEncoder", "dom_lib", domDocumentProvider, browserTextEncoderConstructorProofs, "browser");
assertOpenRuntimeRequirementDecision("constructor", "TextDecoder", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("constructor", "TextDecoder", "dom_lib", domDocumentProvider, browserTextDecoderConstructorProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "new TextEncoder().encode", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "new TextEncoder().encode", "dom_lib", domDocumentProvider, browserTextEncoderEncodeProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "new TextDecoder().decode", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "new TextDecoder().decode", "dom_lib", domDocumentProvider, browserTextDecoderDecodeProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "atob", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "atob", "browser_global", windowProvider, browserWindowBase64CodecProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "btoa", "browser_global", windowProvider, browserWindowBase64CodecProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "node.insertBefore", "dom_lib", "cheng-source.browser.dom", "browser");
assertOpenRuntimeRequirementDecision("call", "node.replaceChild", "dom_lib", "cheng-source.browser.dom", "browser");
assertOpenRuntimeRequirementDecision("call", "node.append", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "node.append", "dom_lib", domDocumentProvider, browserElementAppendProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "node.appendChild", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "node.appendChild", "dom_lib", domDocumentProvider, browserElementAppendChildProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "node.remove", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "node.remove", "dom_lib", domDocumentProvider, browserElementRemoveProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "node.hasAttribute", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "node.hasAttribute", "dom_lib", domDocumentProvider, browserElementHasAttributeProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "node.removeAttribute", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "node.removeAttribute", "dom_lib", domDocumentProvider, browserElementRemoveAttributeProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "node.matches", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "node.matches", "dom_lib", domDocumentProvider, browserElementMatchesProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "node.closest", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "node.closest", "dom_lib", domDocumentProvider, browserElementClosestProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "node.contains", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "node.contains", "dom_lib", domDocumentProvider, browserElementContainsProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "db.objectStoreNames.contains", "dom_lib", "cheng-source.browser.dom", "browser");
assertOpenRuntimeRequirementDecision("property_access", "node.classList", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_access", "node.classList", "dom_lib", domDocumentProvider, browserElementClassListAccessProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "node.classList.add", "dom_lib", domDocumentProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("call", "node.classList.add", "dom_lib", domDocumentProvider, browserElementClassListCallProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "node.classList.remove", "dom_lib", domDocumentProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("call", "node.classList.remove", "dom_lib", domDocumentProvider, browserElementClassListCallProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "node.classList.contains", "dom_lib", domDocumentProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("call", "node.classList.contains", "dom_lib", domDocumentProvider, browserElementClassListCallProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "node.classList.toggle", "dom_lib", domDocumentProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("call", "node.classList.toggle", "dom_lib", domDocumentProvider, browserElementClassListCallProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "event.preventDefault", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "event.preventDefault", "dom_lib", domDocumentProvider, browserEventPreventDefaultProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "event.stopPropagation", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "event.stopPropagation", "dom_lib", domDocumentProvider, browserEventStopPropagationProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "window.addEventListener", "dom_lib", "cheng-source.browser.dom-event", "browser");
assertClosedRuntimeRequirementDecision("call", "window.addEventListener", "dom_lib", domDocumentProvider, browserEventAddEventListenerProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "window.removeEventListener", "dom_lib", "cheng-source.browser.dom-event", "browser");
assertClosedRuntimeRequirementDecision("call", "window.removeEventListener", "dom_lib", domDocumentProvider, browserEventRemoveEventListenerProofs, "browser");
assertOpenRuntimeRequirementDecision("constructor", "Event", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("constructor", "Event", "dom_lib", domDocumentProvider, browserEventConstructorProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "node.dispatchEvent", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "node.dispatchEvent", "dom_lib", domDocumentProvider, browserEventDispatchProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "node.dispatchEvent", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_access", "node.dispatchEvent", "dom_lib", domDocumentProvider, browserEventDispatchProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "document.getElementById", "dom_lib", "cheng-source.browser.dom-query", "browser");
assertClosedRuntimeRequirementDecision("call", "document.getElementById", "dom_lib", domDocumentProvider, browserDocumentGetElementByIdProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "document.querySelector", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "document.querySelector", "browser_global", domDocumentProvider, browserDocumentQuerySelectorProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "document.querySelectorAll", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "document.querySelectorAll", "browser_global", domDocumentProvider, browserDocumentQuerySelectorAllProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "node.setAttribute", "dom_lib", domDocumentProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("call", "node.setAttribute", "dom_lib", domDocumentProvider, browserElementSetAttributeProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "node.getAttribute", "dom_lib", domDocumentProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("call", "node.getAttribute", "dom_lib", domDocumentProvider, browserElementGetAttributeProofs, "browser");
assertClosedExternalSymbolDecision("window.addEventListener", "dom_lib", domDocumentProvider, "browser");
assertClosedExternalSymbolDecision("window.removeEventListener", "dom_lib", domDocumentProvider, "browser");
assertOpenExternalSymbolDecision("document.getElementById", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedExternalSymbolDecision("node.setAttribute", "dom_lib", domDocumentProvider, "browser");
assertClosedExternalSymbolDecision("node.getAttribute", "dom_lib", domDocumentProvider, "browser");
assertClosedExternalSymbolDecision("node.classList.add", "dom_lib", domDocumentProvider, "browser");
assertClosedExternalSymbolDecision("node.contains", "dom_lib", domDocumentProvider, "browser");
assertOpenExternalSymbolDecision("process.env", "node_global", "cheng-source.node.node-host", "node");
assertOpenExternalSymbolDecision("ipcMain.handle", "node_type", "cheng-source.node.node-host", "node");
assertOpenExternalSymbolDecision("ipcRenderer.invoke", "external_package_type", "cheng-source.node.node-host", "node");
assertOpenRuntimeRequirementDecision("global", "localStorage", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("global", "localStorage", "browser_global", localStorageProvider, browserLocalStorageGlobalProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "localStorage.getItem", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "localStorage.getItem", "browser_global", localStorageProvider, browserLocalStorageGetItemProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "localStorage.getItem", "browser_global", localStorageProvider, browserLocalStorageGetItemProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "localStorage.setItem", "browser_global", localStorageProvider, browserLocalStorageSetItemProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "localStorage.setItem", "browser_global", localStorageProvider, browserLocalStorageSetItemProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "localStorage.removeItem", "browser_global", localStorageProvider, browserLocalStorageRemoveItemProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "localStorage.clear", "browser_global", localStorageProvider, browserLocalStorageClearProofs, "browser");
assertOpenRuntimeRequirementDecision("global", "window", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("global", "window", "browser_global", windowProvider, browserWindowGlobalProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "window.localStorage", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_access", "window.localStorage", "browser_global", localStorageProvider, browserWindowLocalStorageProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "window.scrollY", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_access", "window.scrollY", "browser_global", windowProvider, browserWindowScrollProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "window.cancelAnimationFrame", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "window.cancelAnimationFrame", "browser_global", windowProvider, browserWindowCancelAnimationFrameProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "window.matchMedia", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "window.matchMedia", "browser_global", windowProvider, browserWindowMatchMediaMatchesProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "window.matchMedia", "browser_global", windowProvider, browserWindowMatchMediaListProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "window.matches", "browser_global", windowProvider, browserWindowMatchMediaMatchesProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "mediaQuery.addEventListener", "dom_lib", "cheng-source.browser.dom-event", "browser");
assertClosedRuntimeRequirementDecision("call", "mediaQuery.addEventListener", "dom_lib", windowProvider, browserMediaQueryListListenerProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "mediaQuery.removeEventListener", "dom_lib", windowProvider, browserMediaQueryListListenerProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "mediaQuery.addListener", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "mediaQuery.addListener", "dom_lib", windowProvider, browserMediaQueryListListenerProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "mediaQuery.removeListener", "dom_lib", windowProvider, browserMediaQueryListListenerProofs, "browser");
assertOpenRuntimeRequirementDecision("constructor", "IntersectionObserver", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("constructor", "IntersectionObserver", "browser_global", domDocumentProvider, browserIntersectionObserverConstructorProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "intersectionObserver.observe", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "intersectionObserver.observe", "dom_lib", domDocumentProvider, browserIntersectionObserverObserveProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "intersectionObserver.disconnect", "dom_lib", domDocumentProvider, browserIntersectionObserverDisconnectProofs, "browser");

for (const item of cases) {
  const outA = join(root, `tmp/${item.name}-a.csgjs`);
  const outB = join(root, `tmp/${item.name}-b.csgjs`);
  const reportA = join(root, `tmp/${item.name}-a.js.report.json`);
  const reportB = join(root, `tmp/${item.name}-b.js.report.json`);
  mkdirSync(dirname(outA), { recursive: true });

  runCli(item.project, outA, reportA);
  runCli(item.project, outB, reportB);

  const textA = readFileSync(outA, "utf8");
  const textB = readFileSync(outB, "utf8");
  assert.equal(textA, textB, `${item.name} CSG-JS facts must be deterministic`);
  assert.equal(readFileSync(reportA, "utf8"), readFileSync(reportB, "utf8"), `${item.name} CSG-JS report must be deterministic`);

  const validation = validateCsgJsText(textA);
  assert.equal(validation.ok, true, validation.diagnostics.join("\n"));

  const facts = textA.trim().split("\n").map((line) => JSON.parse(line));
  const coreObjectLiterals = facts.filter((fact) => fact.kind === "csg.op" && fact.opKind === "object_literal");
  const corePropertyReads = facts.filter((fact) => fact.kind === "csg.op" && fact.opKind === "property_read");
  const corePropertyWrites = facts.filter((fact) => fact.kind === "csg.op" && fact.opKind === "property_write");
  const coreElementReads = facts.filter((fact) => fact.kind === "csg.op" && fact.opKind === "element_read");
  const coreElementWrites = facts.filter((fact) => fact.kind === "csg.op" && fact.opKind === "element_write");
  const jsObjectLiterals = facts.filter((fact) => fact.kind === "csg.js.object_literal_ref");
  const jsPropertyAccesses = facts.filter((fact) => fact.kind === "csg.js.property_access_ref");
  const jsElementAccesses = facts.filter((fact) => fact.kind === "csg.js.element_access_ref");
  assert.equal(facts[0].kind, "csg.js.schema");
  assert.equal(facts[0].schema, "csg-js");
  assert.ok(facts.some((fact) => fact.kind === "csg.core.schema"));
  assert.ok(facts.some((fact) => fact.kind === "csg.js.project"));
  assert.ok(facts.some((fact) => fact.kind === "csg.js.function_ref"));
  if (item.expectCall !== false) {
    assert.ok(facts.some((fact) => fact.kind === "csg.js.call_ref"));
  }
  if (item.expectClass) {
    assert.ok(facts.some((fact) => fact.kind === "csg.js.class_ref"));
  }
  if (item.expectImport) {
    assert.ok(facts.some((fact) => fact.kind === "csg.js.module_import_ref"));
  }
  assert.ok(facts.some((fact) => fact.kind === "csg.js.runtime_requirement"));
  if (facts.some((fact) => fact.kind === "csg.class_heritage")) {
    assert.ok(facts.some((fact) => fact.kind === "csg.js.class_heritage_ref"));
  }
  if (facts.some((fact) => fact.kind === "csg.external_symbol")) {
    assert.ok(facts.some((fact) => fact.kind === "csg.js.external_symbol"));
  }

  const call = facts.find((fact) => fact.kind === "csg.js.call_ref" && fact.member);
  if (call) {
    assert.equal(typeof call.receiver, "string");
    assert.ok(Array.isArray(call.arguments));
  }
  if (item.expectAggregateOps) {
    assert.ok(coreObjectLiterals.length > 0, "aggregate must emit core object_literal ops");
    assert.ok(corePropertyReads.some((fact) => typeof fact.receiver === "string"));
    assert.ok(coreElementReads.some((fact) => typeof fact.receiver === "string" && typeof fact.argument === "string"));
    assert.ok(jsObjectLiterals.some((fact) => typeof fact.coreFact === "string" && Array.isArray(fact.properties) && typeof fact.propertyCount === "number"));
    assert.ok(jsPropertyAccesses.some((fact) => fact.accessKind === "read" && typeof fact.propertyName === "string" && typeof fact.receiver === "string"));
    assert.ok(jsElementAccesses.some((fact) => fact.accessKind === "read" && typeof fact.receiver === "string" && typeof fact.argument === "string"));
  }
  if (item.expectObjectWrites) {
    assert.ok(corePropertyWrites.some((fact) => fact.name === "x" && typeof fact.receiver === "string" && typeof fact.value === "string"));
    assert.ok(coreElementWrites.some((fact) => typeof fact.receiver === "string" && typeof fact.argument === "string" && typeof fact.value === "string"));
    assert.ok(jsPropertyAccesses.some((fact) => fact.accessKind === "write" && fact.propertyName === "x" && typeof fact.value === "string"));
    assert.ok(jsElementAccesses.some((fact) => fact.accessKind === "write" && typeof fact.argument === "string" && typeof fact.value === "string"));
  }

  const report = JSON.parse(readFileSync(reportA, "utf8"));
  assert.equal(report.schema, "csg-js.report");
  assert.equal(report.runtimeImplemented, false);
  assert.equal(report.complete, false);
  assert.equal(report.counts.coreFacts, facts.filter((fact) => !fact.kind.startsWith("csg.js.")).length);
  assert.equal(report.counts.jsFacts, facts.filter((fact) => fact.kind.startsWith("csg.js.") && fact.kind !== "csg.js.schema").length);
  assert.equal(report.counts.objectLiterals, jsObjectLiterals.length);
  assert.equal(report.counts.propertyAccesses, jsPropertyAccesses.length);
  assert.equal(report.counts.propertyWrites, jsPropertyAccesses.filter((fact) => fact.accessKind === "write").length);
  assert.equal(report.counts.elementAccesses, jsElementAccesses.length);
  assert.equal(report.counts.elementWrites, jsElementAccesses.filter((fact) => fact.accessKind === "write").length);
  assert.equal(report.coreReport.counts.objectLiterals, coreObjectLiterals.length);
  assert.equal(report.coreReport.counts.propertyReads, corePropertyReads.length);
  assert.equal(report.coreReport.counts.propertyWrites, corePropertyWrites.length);
  assert.equal(report.coreReport.counts.elementReads, coreElementReads.length);
  assert.equal(report.coreReport.counts.elementWrites, coreElementWrites.length);
  assert.equal(report.counts.runtimeRequirements, report.runtimeClosure.requirementCount);
  assertRuntimeClosureProviderCounts(report.runtimeClosure);
  if (item.expectMixedRuntimeClosure) {
    assert.equal(report.runtimeClosure.closedRequirementCount > 0, true);
    assert.equal(report.runtimeClosure.openRequirementCount > 0, true);
  }
  if (report.runtimeClosure.openRequirementCount > 0) {
    assert.equal(report.blockedReasons.includes("cheng js runtime has open runtime requirements"), true);
  }
  assert.equal(report.blockedReasons.includes("cheng js runtime is not complete"), true);

  if (item.expectAsync) {
    assert.ok(facts.some((fact) => fact.kind === "csg.js.function_ref" && fact.async === true));
    assert.ok(report.runtimeClosure.requirements.some((requirement) => requirement.domain === "promise"));
    assertClosedRuntimeClosureRequirement(report.runtimeClosure, "Promise.await", promiseProvider);
    assertClosedRuntimeClosureRequirement(report.runtimeClosure, "main", promiseProvider);
  } else {
    assert.ok(report.runtimeClosure.requirements.some((requirement) => requirement.domain === "object" || requirement.domain === "module"));
  }
}

const lengthProofOut = join(root, "tmp/array-length-static-proof-gate-a.csgjs");
const lengthProofReport = join(root, "tmp/array-length-static-proof-gate-a.js.report.json");
runCli("fixtures/csg-array-length-static-proof-gate/tsconfig.json", lengthProofOut, lengthProofReport);
const lengthProofJsReport = JSON.parse(readFileSync(lengthProofReport, "utf8"));
assert.ok(lengthProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.length" && item.proofs?.includes("array-lite-i32-fixed")));
assert.ok(lengthProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.length" && item.proofs?.includes("array-lite-static-length")));
assert.ok(lengthProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.length" && item.proofs?.includes("array-lite-i32-local")));
assert.ok(lengthProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.from" && item.proofs?.includes("array-lite-jsvalue-from-length")));
assert.ok(lengthProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.from" && !item.proofs?.length));
assertClosedRuntimeClosureRequirement(lengthProofJsReport.runtimeClosure, "Array.length", arrayLiteProvider);
assert.ok(lengthProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.ok(lengthProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assertRuntimeClosureProviderCounts(lengthProofJsReport.runtimeClosure);

const stringConvertLengthProofOut = join(root, "tmp/string-convert-length-proof-gate-a.csgjs");
const stringConvertLengthProofReport = join(root, "tmp/string-convert-length-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-string-convert-length/tsconfig.json", stringConvertLengthProofOut, stringConvertLengthProofReport);
const stringConvertLengthProofJsReport = JSON.parse(readFileSync(stringConvertLengthProofReport, "utf8"));
assert.ok(stringConvertLengthProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "String" && item.proofs?.includes("string-convert-scalar")));
assert.ok(stringConvertLengthProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "String.length" && item.proofs?.includes("string-scalar-length")));
assertClosedRuntimeClosureRequirement(stringConvertLengthProofJsReport.runtimeClosure, "String", stringLiteProvider);
assertClosedRuntimeClosureRequirement(stringConvertLengthProofJsReport.runtimeClosure, "String.length", stringLiteProvider);
assertRuntimeClosureProviderCounts(stringConvertLengthProofJsReport.runtimeClosure);

const stringConvertScalarProofOut = join(root, "tmp/string-convert-scalar-proof-gate-a.csgjs");
const stringConvertScalarProofReport = join(root, "tmp/string-convert-scalar-proof-gate-a.js.report.json");
runCli("fixtures/csg-string-convert-scalar/tsconfig.json", stringConvertScalarProofOut, stringConvertScalarProofReport);
const stringConvertScalarProofJsReport = JSON.parse(readFileSync(stringConvertScalarProofReport, "utf8"));
assert.equal(
  stringConvertScalarProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "String").every((item) => item.proofs?.includes("string-convert-scalar")),
  true,
);
assert.equal(
  stringConvertScalarProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "String.length").every((item) => item.proofs?.includes("string-runtime-length")),
  true,
);
assertClosedRuntimeClosureRequirement(stringConvertScalarProofJsReport.runtimeClosure, "String", stringLiteProvider);
assertClosedRuntimeClosureRequirement(stringConvertScalarProofJsReport.runtimeClosure, "String.length", stringLiteProvider);
assertRuntimeClosureProviderCounts(stringConvertScalarProofJsReport.runtimeClosure);

const stringConvertScalarNegativeOut = join(root, "tmp/string-convert-scalar-negative-gate-a.csgjs");
const stringConvertScalarNegativeReport = join(root, "tmp/string-convert-scalar-negative-gate-a.js.report.json");
runCli("fixtures/csg-string-convert-scalar-negative/tsconfig.json", stringConvertScalarNegativeOut, stringConvertScalarNegativeReport);
const stringConvertScalarNegativeJsReport = JSON.parse(readFileSync(stringConvertScalarNegativeReport, "utf8"));
const stringConvertScalarNegativeRequirements = stringConvertScalarNegativeJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "String");
assert.equal(stringConvertScalarNegativeRequirements.length, 4);
assert.equal(
  stringConvertScalarNegativeRequirements.every((item) => !item.proofs?.includes("string-convert-scalar")),
  true,
);
assert.ok(stringConvertScalarNegativeJsReport.runtimeClosure.requirements.some((item) =>
  item.name === "String" &&
  item.providerStatus === "open" &&
  item.candidateProvider === "cheng-source.js-core.string-convert-scalar"
));
assert.equal(
  stringConvertScalarNegativeJsReport.runtimeClosure.requirements.filter((item) =>
    item.name === "String" &&
    item.providerStatus === "open" &&
    item.candidateProvider === "cheng-source.js-core.string-convert-scalar"
  ).length,
  4,
);
assertRuntimeClosureProviderCounts(stringConvertScalarNegativeJsReport.runtimeClosure);

const stringMethodRuntimeProofOut = join(root, "tmp/string-method-runtime-proof-gate-a.csgjs");
const stringMethodRuntimeProofReport = join(root, "tmp/string-method-runtime-proof-gate-a.js.report.json");
runCli("fixtures/csg-string-method-runtime/tsconfig.json", stringMethodRuntimeProofOut, stringMethodRuntimeProofReport);
const stringMethodRuntimeProofJsReport = JSON.parse(readFileSync(stringMethodRuntimeProofReport, "utf8"));
for (const name of ["String.slice", "String.replace", "String.split", "String.padStart", "String.repeat", "String.charCodeAt", "String.includes"]) {
  assert.ok(stringMethodRuntimeProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === name && item.proofs?.includes("string-type-method")), `${name} must carry string-type-method`);
  assertClosedRuntimeClosureRequirement(stringMethodRuntimeProofJsReport.runtimeClosure, name, stringLiteProvider);
}
for (const name of ["String.indexOf", "String.lastIndexOf", "String.startsWith"]) {
  assert.ok(stringMethodRuntimeProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === name && item.proofs?.includes("string-type-method")), `${name} position overload must carry string-type-method`);
  assertClosedRuntimeClosureRequirement(stringMethodRuntimeProofJsReport.runtimeClosure, name, stringLiteProvider);
}
assert.ok(stringMethodRuntimeProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "String.endsWith" && !item.proofs?.length), "String.endsWith position overload must remain open");
assert.ok(stringMethodRuntimeProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "String.replace" && item.proofs?.includes("string-regex-literal-replace")), "literal regex String.replace must be closed");
assert.equal(stringMethodRuntimeProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "String.replace" && item.proofs?.includes("string-regex-ascii-class-replace")).length, 2);
assert.ok(stringMethodRuntimeProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "String.replace" && !item.proofs?.length), "complex regex String.replace must remain open");
assert.ok(stringMethodRuntimeProofJsReport.runtimeClosure.requirements.some((item) => item.name === "String.replace" && item.providerStatus === "closed" && item.provider === stringLiteProvider));
assert.ok(stringMethodRuntimeProofJsReport.runtimeClosure.requirements.some((item) => item.name === "String.replace" && item.providerStatus === "closed" && item.provider === stringLiteProvider));
assertRuntimeClosureProviderCounts(stringMethodRuntimeProofJsReport.runtimeClosure);

const stringReplaceAffixProofOut = join(root, "tmp/string-replace-affix-proof-gate-a.csgjs");
const stringReplaceAffixProofReport = join(root, "tmp/string-replace-affix-proof-gate-a.js.report.json");
runCli("fixtures/csg-string-replace-affix-proof-gate/tsconfig.json", stringReplaceAffixProofOut, stringReplaceAffixProofReport);
const stringReplaceAffixProofJsReport = JSON.parse(readFileSync(stringReplaceAffixProofReport, "utf8"));
const stringReplaceAffixRequirements = stringReplaceAffixProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "String.replace");
assert.equal(stringReplaceAffixRequirements.filter((item) => item.proofs?.includes("string-regex-literal-affix-replace")).length, 6);
assert.equal(stringReplaceAffixRequirements.filter((item) => item.proofs?.includes("string-regex-ascii-class-replace")).length, 1);
assert.equal(stringReplaceAffixRequirements.filter((item) => !item.proofs?.length).length, 7);
assert.ok(stringReplaceAffixProofJsReport.runtimeClosure.requirements.some((item) => item.name === "String.replace" && item.providerStatus === "closed" && item.provider === stringLiteProvider));
assert.ok(stringReplaceAffixProofJsReport.runtimeClosure.requirements.some((item) => item.name === "String.replace" && item.providerStatus === "closed" && item.provider === stringLiteProvider));
assertRuntimeClosureProviderCounts(stringReplaceAffixProofJsReport.runtimeClosure);

const stringRegexLineSplitProofOut = join(root, "tmp/string-regex-line-split-proof-gate-a.csgjs");
const stringRegexLineSplitProofReport = join(root, "tmp/string-regex-line-split-proof-gate-a.js.report.json");
runCli("fixtures/csg-string-regex-line-split-proof-gate/tsconfig.json", stringRegexLineSplitProofOut, stringRegexLineSplitProofReport);
const stringRegexLineSplitProofJsReport = JSON.parse(readFileSync(stringRegexLineSplitProofReport, "utf8"));
const stringRegexLineSplitRequirements = stringRegexLineSplitProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "String.split");
assert.equal(stringRegexLineSplitRequirements.filter((item) => item.proofs?.includes("string-regex-line-split")).length, 2);
assert.equal(stringRegexLineSplitRequirements.filter((item) => item.proofs?.includes("string-regex-ascii-class-split")).length, 2);
assert.equal(stringRegexLineSplitRequirements.filter((item) => !item.proofs?.length).length, 2);
assert.ok(stringRegexLineSplitRequirements.some((item) => item.proofs?.includes("string-type-method")));
assert.ok(stringRegexLineSplitProofJsReport.runtimeClosure.requirements.some((item) => item.name === "String.split" && item.providerStatus === "closed" && item.provider === stringLiteProvider));
assert.ok(stringRegexLineSplitProofJsReport.runtimeClosure.requirements.some((item) => item.name === "String.split" && item.providerStatus === "closed" && item.provider === stringLiteProvider));
assertRuntimeClosureProviderCounts(stringRegexLineSplitProofJsReport.runtimeClosure);

const pushProofOut = join(root, "tmp/array-push-proof-gate-a.csgjs");
const pushProofReport = join(root, "tmp/array-push-proof-gate-a.js.report.json");
runCli("fixtures/csg-array-push-proof-gate/tsconfig.json", pushProofOut, pushProofReport);
const pushProofJsReport = JSON.parse(readFileSync(pushProofReport, "utf8"));
assert.ok(pushProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.push" && item.proofs?.includes("array-lite-i32-push-local")));
assertClosedRuntimeClosureRequirement(pushProofJsReport.runtimeClosure, "Array.push", arrayLiteProvider);
assertRuntimeClosureProviderCounts(pushProofJsReport.runtimeClosure);

const mapProofOut = join(root, "tmp/array-map-proof-gate-a.csgjs");
const mapProofReport = join(root, "tmp/array-map-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-array-map/tsconfig.json", mapProofOut, mapProofReport);
const mapProofJsReport = JSON.parse(readFileSync(mapProofReport, "utf8"));
assert.ok(mapProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.map" && item.proofs?.includes("array-lite-i32-map-local")));
assertClosedRuntimeClosureRequirement(mapProofJsReport.runtimeClosure, "Array.map", arrayLiteProvider);
assertRuntimeClosureProviderCounts(mapProofJsReport.runtimeClosure);

const filterProofOut = join(root, "tmp/array-filter-length-proof-gate-a.csgjs");
const filterProofReport = join(root, "tmp/array-filter-length-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-array-filter-length/tsconfig.json", filterProofOut, filterProofReport);
const filterProofJsReport = JSON.parse(readFileSync(filterProofReport, "utf8"));
assert.ok(filterProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.filter" && item.proofs?.includes("array-lite-i32-filter-length")));
assertClosedRuntimeClosureRequirement(filterProofJsReport.runtimeClosure, "Array.filter", arrayLiteProvider);
assertRuntimeClosureProviderCounts(filterProofJsReport.runtimeClosure);

const includesProofOut = join(root, "tmp/array-includes-proof-gate-a.csgjs");
const includesProofReport = join(root, "tmp/array-includes-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-array-includes/tsconfig.json", includesProofOut, includesProofReport);
const includesProofJsReport = JSON.parse(readFileSync(includesProofReport, "utf8"));
assert.ok(includesProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.includes" && item.proofs?.includes("array-lite-i32-includes")));
assertClosedRuntimeClosureRequirement(includesProofJsReport.runtimeClosure, "Array.includes", arrayLiteProvider);
assertRuntimeClosureProviderCounts(includesProofJsReport.runtimeClosure);

const stringIncludesProofOut = join(root, "tmp/array-string-includes-proof-gate-a.csgjs");
const stringIncludesProofReport = join(root, "tmp/array-string-includes-proof-gate-a.js.report.json");
runCli("fixtures/csg-array-string-includes-proof-gate/tsconfig.json", stringIncludesProofOut, stringIncludesProofReport);
const stringIncludesProofJsReport = JSON.parse(readFileSync(stringIncludesProofReport, "utf8"));
assert.ok(stringIncludesProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.includes" && item.proofs?.includes("array-lite-const-string-includes")));
assert.ok(stringIncludesProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-const-string-some-endswith")));
assert.equal(stringIncludesProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-string-some-item-string-method")).length, 3);
assert.equal(stringIncludesProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-const-string-some-haystack-string-method")).length, 2);
assertClosedRuntimeClosureRequirement(stringIncludesProofJsReport.runtimeClosure, "Array.includes", arrayLiteProvider);
assert.ok(stringIncludesProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.some" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.ok(stringIncludesProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.some" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assertRuntimeClosureProviderCounts(stringIncludesProofJsReport.runtimeClosure);

const objectSomeEqualsProofOut = join(root, "tmp/array-some-object-equals-proof-gate-a.csgjs");
const objectSomeEqualsProofReport = join(root, "tmp/array-some-object-equals-proof-gate-a.js.report.json");
runCli("fixtures/csg-array-some-object-equals-proof-gate/tsconfig.json", objectSomeEqualsProofOut, objectSomeEqualsProofReport);
const objectSomeEqualsProofJsReport = JSON.parse(readFileSync(objectSomeEqualsProofReport, "utf8"));
assert.equal(objectSomeEqualsProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-jsvalue-object-some-scalar-property-equals")).length, 6);
assert.equal(objectSomeEqualsProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-jsvalue-object-some-scalar-property-conjunction-equals")).length, 5);
assert.equal(objectSomeEqualsProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.some" && !item.proofs?.length).length, 14);
assert.ok(objectSomeEqualsProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.some" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.ok(objectSomeEqualsProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.some" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assertRuntimeClosureProviderCounts(objectSomeEqualsProofJsReport.runtimeClosure);

const indexOfProofOut = join(root, "tmp/array-indexof-proof-gate-a.csgjs");
const indexOfProofReport = join(root, "tmp/array-indexof-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-array-indexof/tsconfig.json", indexOfProofOut, indexOfProofReport);
const indexOfProofJsReport = JSON.parse(readFileSync(indexOfProofReport, "utf8"));
assert.ok(indexOfProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.indexOf" && item.proofs?.includes("array-lite-i32-indexof-local")));
assert.ok(indexOfProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.lastIndexOf" && item.proofs?.includes("array-lite-i32-indexof-local")));
assertClosedRuntimeClosureRequirement(indexOfProofJsReport.runtimeClosure, "Array.indexOf", arrayLiteProvider);
assertClosedRuntimeClosureRequirement(indexOfProofJsReport.runtimeClosure, "Array.lastIndexOf", arrayLiteProvider);
assertRuntimeClosureProviderCounts(indexOfProofJsReport.runtimeClosure);

const stringIndexOfProofOut = join(root, "tmp/array-string-indexof-proof-gate-a.csgjs");
const stringIndexOfProofReport = join(root, "tmp/array-string-indexof-proof-gate-a.js.report.json");
runCli("fixtures/csg-array-string-indexof-proof-gate/tsconfig.json", stringIndexOfProofOut, stringIndexOfProofReport);
const stringIndexOfProofJsReport = JSON.parse(readFileSync(stringIndexOfProofReport, "utf8"));
assert.equal(stringIndexOfProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.indexOf" &&
  item.proofs?.includes("array-lite-string-indexof")
).length, 5);
assert.equal(stringIndexOfProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.indexOf" &&
  !item.proofs?.length
).length, 4);
assert.ok(stringIndexOfProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.indexOf" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.ok(stringIndexOfProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.indexOf" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assertRuntimeClosureProviderCounts(stringIndexOfProofJsReport.runtimeClosure);

const predicateProofOut = join(root, "tmp/array-predicate-proof-gate-a.csgjs");
const predicateProofReport = join(root, "tmp/array-predicate-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-array-predicate/tsconfig.json", predicateProofOut, predicateProofReport);
const predicateProofJsReport = JSON.parse(readFileSync(predicateProofReport, "utf8"));
assert.ok(predicateProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-i32-predicate")));
assert.ok(predicateProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.every" && item.proofs?.includes("array-lite-i32-predicate")));
assert.ok(predicateProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-jsvalue-predicate-truthy")));
assert.ok(predicateProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.every" && item.proofs?.includes("array-lite-jsvalue-predicate-truthy")));
assert.ok(predicateProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.some" && !item.proofs?.length));
assertClosedRuntimeClosureRequirement(predicateProofJsReport.runtimeClosure, "Array.some", arrayLiteProvider);
assertClosedRuntimeClosureRequirement(predicateProofJsReport.runtimeClosure, "Array.every", arrayLiteProvider);
assertRuntimeClosureProviderCounts(predicateProofJsReport.runtimeClosure);

const atProofOut = join(root, "tmp/array-at-proof-gate-a.csgjs");
const atProofReport = join(root, "tmp/array-at-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-array-at/tsconfig.json", atProofOut, atProofReport);
const atProofJsReport = JSON.parse(readFileSync(atProofReport, "utf8"));
assert.ok(atProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.at" && item.proofs?.includes("array-lite-i32-at")));
assertClosedRuntimeClosureRequirement(atProofJsReport.runtimeClosure, "Array.at", arrayLiteProvider);
assertRuntimeClosureProviderCounts(atProofJsReport.runtimeClosure);

const findIndexProofOut = join(root, "tmp/array-findindex-proof-gate-a.csgjs");
const findIndexProofReport = join(root, "tmp/array-findindex-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-array-findindex/tsconfig.json", findIndexProofOut, findIndexProofReport);
const findIndexProofJsReport = JSON.parse(readFileSync(findIndexProofReport, "utf8"));
assert.ok(findIndexProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.findIndex" && item.proofs?.includes("array-lite-i32-findindex-local")));
assertClosedRuntimeClosureRequirement(findIndexProofJsReport.runtimeClosure, "Array.findIndex", arrayLiteProvider);
assertRuntimeClosureProviderCounts(findIndexProofJsReport.runtimeClosure);

const objectFindIndexProofOut = join(root, "tmp/array-findindex-object-equals-proof-gate-a.csgjs");
const objectFindIndexProofReport = join(root, "tmp/array-findindex-object-equals-proof-gate-a.js.report.json");
runCli("fixtures/csg-array-findindex-object-equals-proof-gate/tsconfig.json", objectFindIndexProofOut, objectFindIndexProofReport);
const objectFindIndexProofJsReport = JSON.parse(readFileSync(objectFindIndexProofReport, "utf8"));
assert.equal(objectFindIndexProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.findIndex" && item.proofs?.includes("array-lite-jsvalue-object-findindex-scalar-property-equals")).length, 4);
assert.equal(objectFindIndexProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.findIndex" && item.proofs?.includes("array-lite-jsvalue-object-findindex-scalar-property-conjunction-equals")).length, 5);
assert.equal(objectFindIndexProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.findIndex" && item.proofs?.includes("array-lite-jsvalue-object-findindex-scalar-property-disjunction-equals")).length, 1);
assert.equal(objectFindIndexProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.findIndex" && !item.proofs?.length).length, 11);
assert.ok(objectFindIndexProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.findIndex" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.ok(objectFindIndexProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.findIndex" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assertRuntimeClosureProviderCounts(objectFindIndexProofJsReport.runtimeClosure);

const sliceProofOut = join(root, "tmp/array-slice-proof-gate-a.csgjs");
const sliceProofReport = join(root, "tmp/array-slice-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-array-slice/tsconfig.json", sliceProofOut, sliceProofReport);
const sliceProofJsReport = JSON.parse(readFileSync(sliceProofReport, "utf8"));
assert.ok(sliceProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.slice" && item.proofs?.includes("array-lite-i32-slice-local")));
assertClosedRuntimeClosureRequirement(sliceProofJsReport.runtimeClosure, "Array.slice", arrayLiteProvider);
assertRuntimeClosureProviderCounts(sliceProofJsReport.runtimeClosure);

const concatProofOut = join(root, "tmp/array-concat-proof-gate-a.csgjs");
const concatProofReport = join(root, "tmp/array-concat-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-array-concat/tsconfig.json", concatProofOut, concatProofReport);
const concatProofJsReport = JSON.parse(readFileSync(concatProofReport, "utf8"));
assert.ok(concatProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.concat" && item.proofs?.includes("array-lite-i32-concat-local")));
assertClosedRuntimeClosureRequirement(concatProofJsReport.runtimeClosure, "Array.concat", arrayLiteProvider);
assertRuntimeClosureProviderCounts(concatProofJsReport.runtimeClosure);

const reverseProofOut = join(root, "tmp/array-reverse-proof-gate-a.csgjs");
const reverseProofReport = join(root, "tmp/array-reverse-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-array-reverse/tsconfig.json", reverseProofOut, reverseProofReport);
const reverseProofJsReport = JSON.parse(readFileSync(reverseProofReport, "utf8"));
assert.ok(reverseProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.reverse" && item.proofs?.includes("array-lite-i32-reverse-local")));
assertClosedRuntimeClosureRequirement(reverseProofJsReport.runtimeClosure, "Array.reverse", arrayLiteProvider);
assertRuntimeClosureProviderCounts(reverseProofJsReport.runtimeClosure);

const sortProofOut = join(root, "tmp/array-sort-proof-gate-a.csgjs");
const sortProofReport = join(root, "tmp/array-sort-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-array-sort/tsconfig.json", sortProofOut, sortProofReport);
const sortProofJsReport = JSON.parse(readFileSync(sortProofReport, "utf8"));
assert.ok(sortProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.sort" && item.proofs?.includes("array-lite-i32-sort-local")));
assertClosedRuntimeClosureRequirement(sortProofJsReport.runtimeClosure, "Array.sort", arrayLiteProvider);
assertRuntimeClosureProviderCounts(sortProofJsReport.runtimeClosure);

const inlineSortProofOut = join(root, "tmp/array-inline-sort-proof-gate-a.csgjs");
const inlineSortProofReport = join(root, "tmp/array-inline-sort-proof-gate-a.js.report.json");
runCli("fixtures/csg-array-inline-sort-proof-gate/tsconfig.json", inlineSortProofOut, inlineSortProofReport);
const inlineSortProofJsReport = JSON.parse(readFileSync(inlineSortProofReport, "utf8"));
const inlineSortProofJsRequirements = inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.sort");
function assertInlineSortJsLine(line, expectedProof) {
  const item = inlineSortProofJsRequirements.find((candidate) => candidate.loc?.line === line);
  assert.ok(item, `missing Array.sort requirement at line ${line}`);
  if (expectedProof) {
    assert.ok(item.proofs?.includes(expectedProof), `missing ${expectedProof} at line ${line}`);
  } else {
    assert.ok(!item.proofs?.length, `unexpected Array.sort proof at line ${line}: ${(item.proofs ?? []).join(",")}`);
  }
}
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-i32-inline-diff-sort")
).length, 1);
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-i32-inline-diff-desc-sort")
).length, 1);
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-object-i32-key-inline-diff-sort")
).length, 1);
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-object-i32-key-inline-diff-desc-sort")
).length, 1);
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-object-optional-i32-key-nullish-zero-inline-diff-desc-sort")
).length, 1);
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-object-optional-i32-key-nullish-zero-inline-diff-sort")
).length, 1);
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-object-optional-i32-key-logical-or-zero-inline-diff-desc-sort")
).length, 1);
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-object-optional-i32-key-logical-or-zero-inline-diff-sort")
).length, 1);
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-array-i32-index-inline-diff-sort")
).length, 2);
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-array-i32-index-inline-diff-desc-sort")
).length, 1);
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-array-optional-i32-index-nullish-zero-inline-diff-sort")
).length, 1);
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-array-optional-i32-index-nullish-zero-inline-diff-desc-sort")
).length, 1);
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-array-optional-i32-index-logical-or-zero-inline-diff-sort")
).length, 1);
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-array-optional-i32-index-logical-or-zero-inline-diff-desc-sort")
).length, 1);
assert.equal(inlineSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  !item.proofs?.length
).length, 12);
assertInlineSortJsLine(49, "array-lite-array-i32-index-inline-diff-sort");
assertInlineSortJsLine(59, "array-lite-array-i32-index-inline-diff-desc-sort");
assertInlineSortJsLine(70, "array-lite-object-optional-i32-key-nullish-zero-inline-diff-desc-sort");
assertInlineSortJsLine(81, "array-lite-object-optional-i32-key-nullish-zero-inline-diff-sort");
assertInlineSortJsLine(93, "array-lite-array-optional-i32-index-nullish-zero-inline-diff-sort");
assertInlineSortJsLine(105, "array-lite-array-optional-i32-index-nullish-zero-inline-diff-desc-sort");
assertInlineSortJsLine(116, "array-lite-object-optional-i32-key-logical-or-zero-inline-diff-desc-sort");
assertInlineSortJsLine(127, "array-lite-object-optional-i32-key-logical-or-zero-inline-diff-sort");
assertInlineSortJsLine(139, "array-lite-array-optional-i32-index-logical-or-zero-inline-diff-sort");
assertInlineSortJsLine(151, "array-lite-array-optional-i32-index-logical-or-zero-inline-diff-desc-sort");
for (const line of [160, 169, 182, 191, 200, 209, 218, 229, 238, 247, 256, 265]) {
  assertInlineSortJsLine(line, undefined);
}
assert.ok(inlineSortProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.sort" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.ok(inlineSortProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.sort" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assertRuntimeClosureProviderCounts(inlineSortProofJsReport.runtimeClosure);

const stringSortProofOut = join(root, "tmp/array-string-sort-proof-gate-a.csgjs");
const stringSortProofReport = join(root, "tmp/array-string-sort-proof-gate-a.js.report.json");
runCli("fixtures/csg-array-string-sort-proof-gate/tsconfig.json", stringSortProofOut, stringSortProofReport);
const stringSortProofJsReport = JSON.parse(readFileSync(stringSortProofReport, "utf8"));
const stringSortClosedRequirements = stringSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-string-default-sort")
);
assert.equal(stringSortClosedRequirements.length, 5);
assert.ok(stringSortProofJsReport.coreReport.runtimeRequirements.some((item) =>
  item.name === "Array.sort" &&
  item.loc?.line === 62 &&
  !item.proofs?.length
));
assert.equal(stringSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.keys" &&
  item.proofs?.includes("object-jsvalue-keys-array")
).length, 1);
assert.equal(stringSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-object-keys-default-sort")
).length, 1);
const stringSortMapKeysRequirements = stringSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-string-map-keys-default-sort")
);
assert.equal(stringSortMapKeysRequirements.length, 2);
assert.equal(stringSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  item.proofs?.includes("array-lite-string-map-keys-from")
).length, 1);
assert.equal(stringSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.kind === "spread" &&
  item.proofs?.includes("array-lite-string-map-keys-spread")
).length, 2);
assert.equal(stringSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.kind === "constructor" &&
  item.name === "Map" &&
  item.proofs?.includes("collection-constructor-string-i32-entry-array")
).length, 3);
assert.ok(stringSortProofJsReport.coreReport.runtimeRequirements.some((item) =>
  item.kind === "constructor" &&
  item.name === "Map" &&
  !item.proofs?.length
));
assert.equal(stringSortProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name.endsWith(".keys") &&
  item.proofs?.includes("collection-map-string-keys-iterator")
).length, 3);
assert.ok(stringSortProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.sort" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.ok(stringSortProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.sort" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.ok(stringSortProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Object.keys" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.ok(stringSortProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.ok(stringSortProofJsReport.runtimeClosure.requirements.some((item) => item.kind === "constructor" && item.name === "Map" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.ok(stringSortProofJsReport.runtimeClosure.requirements.some((item) => item.kind === "constructor" && item.name === "Map" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.ok(stringSortProofJsReport.runtimeClosure.requirements.some((item) => item.kind === "spread" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assertRuntimeClosureProviderCounts(stringSortProofJsReport.runtimeClosure);

const fillProofOut = join(root, "tmp/array-fill-proof-gate-a.csgjs");
const fillProofReport = join(root, "tmp/array-fill-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-array-fill/tsconfig.json", fillProofOut, fillProofReport);
const fillProofJsReport = JSON.parse(readFileSync(fillProofReport, "utf8"));
assert.ok(fillProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.fill" && item.proofs?.includes("array-lite-i32-fill-local")));
assertClosedRuntimeClosureRequirement(fillProofJsReport.runtimeClosure, "Array.fill", arrayLiteProvider);
assertRuntimeClosureProviderCounts(fillProofJsReport.runtimeClosure);

const reduceProofOut = join(root, "tmp/array-reduce-proof-gate-a.csgjs");
const reduceProofReport = join(root, "tmp/array-reduce-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-array-reduce/tsconfig.json", reduceProofOut, reduceProofReport);
const reduceProofJsReport = JSON.parse(readFileSync(reduceProofReport, "utf8"));
assert.ok(reduceProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.reduce" && item.proofs?.includes("array-lite-i32-reduce")));
assertClosedRuntimeClosureRequirement(reduceProofJsReport.runtimeClosure, "Array.reduce", arrayLiteProvider);
assertRuntimeClosureProviderCounts(reduceProofJsReport.runtimeClosure);

const arrayFromProofOut = join(root, "tmp/array-from-proof-gate-a.csgjs");
const arrayFromProofReport = join(root, "tmp/array-from-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-array-from/tsconfig.json", arrayFromProofOut, arrayFromProofReport);
const arrayFromProofJsReport = JSON.parse(readFileSync(arrayFromProofReport, "utf8"));
assert.ok(arrayFromProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.from" && item.proofs?.includes("array-lite-i32-from-local")));
assert.ok(arrayFromProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.freeze" && item.proofs?.includes("array-lite-i32-freeze-local")));
assertClosedRuntimeClosureRequirement(arrayFromProofJsReport.runtimeClosure, "Array.from", arrayLiteProvider);
assertClosedRuntimeClosureRequirement(arrayFromProofJsReport.runtimeClosure, "Object.freeze", arrayLiteProvider);
assertRuntimeClosureProviderCounts(arrayFromProofJsReport.runtimeClosure);

const arrayFromStringSetProofOut = join(root, "tmp/array-from-string-set-proof-gate-a.csgjs");
const arrayFromStringSetProofReport = join(root, "tmp/array-from-string-set-proof-gate-a.js.report.json");
runCli("fixtures/csg-array-from-string-set-proof-gate/tsconfig.json", arrayFromStringSetProofOut, arrayFromStringSetProofReport);
const arrayFromStringSetProofJsReport = JSON.parse(readFileSync(arrayFromStringSetProofReport, "utf8"));
const arrayFromStringSetClosedRequirements = arrayFromStringSetProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  item.proofs?.includes("array-lite-string-set-from")
);
assert.equal(arrayFromStringSetClosedRequirements.length, 3);
assert.ok(arrayFromStringSetProofJsReport.coreReport.runtimeRequirements.some((item) => item.kind === "global" && item.name === "Boolean" && item.proofs?.includes("namespace-reference")));
assert.ok(arrayFromStringSetProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assertClosedRuntimeClosureRequirement(arrayFromStringSetProofJsReport.runtimeClosure, "Boolean", scalarLiteProvider);
assert.ok(arrayFromStringSetProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assertRuntimeClosureProviderCounts(arrayFromStringSetProofJsReport.runtimeClosure);

const arrayFromMapValuesProofOut = join(root, "tmp/array-from-map-values-proof-gate-a.csgjs");
const arrayFromMapValuesProofReport = join(root, "tmp/array-from-map-values-proof-gate-a.js.report.json");
runCli("fixtures/csg-array-from-map-values-proof-gate/tsconfig.json", arrayFromMapValuesProofOut, arrayFromMapValuesProofReport);
const arrayFromMapValuesProofJsReport = JSON.parse(readFileSync(arrayFromMapValuesProofReport, "utf8"));
assert.equal(arrayFromMapValuesProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  item.proofs?.includes("array-lite-string-map-values-from")
).length, 1);
assert.equal(arrayFromMapValuesProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  item.proofs?.includes("array-lite-string-set-values-from")
).length, 1);
assert.equal(arrayFromMapValuesProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  !item.proofs?.length
).length, 2);
assert.equal(arrayFromMapValuesProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name.endsWith(".values") &&
  item.proofs?.includes("collection-map-string-values-iterator")
).length, 1);
assert.equal(arrayFromMapValuesProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name.endsWith(".values") &&
  item.proofs?.includes("collection-set-string-values-iterator")
).length, 1);
assert.ok(arrayFromMapValuesProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.ok(arrayFromMapValuesProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.ok(arrayFromMapValuesProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".values") && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.ok(arrayFromMapValuesProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".values") && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assertRuntimeClosureProviderCounts(arrayFromMapValuesProofJsReport.runtimeClosure);

const arrayFromUint8ArrayProofOut = join(root, "tmp/array-from-uint8array-proof-gate-a.csgjs");
const arrayFromUint8ArrayProofReport = join(root, "tmp/array-from-uint8array-proof-gate-a.js.report.json");
runCli("fixtures/csg-array-from-uint8array-proof-gate/tsconfig.json", arrayFromUint8ArrayProofOut, arrayFromUint8ArrayProofReport);
const arrayFromUint8ArrayProofJsReport = JSON.parse(readFileSync(arrayFromUint8ArrayProofReport, "utf8"));
const arrayFromUint8ArrayClosedRequirements = arrayFromUint8ArrayProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  item.proofs?.includes("array-lite-uint8array-from")
);
assert.equal(arrayFromUint8ArrayClosedRequirements.length, 2);
assert.ok(arrayFromUint8ArrayProofJsReport.coreReport.runtimeRequirements.some((item) =>
  item.name === "Array.from" &&
  item.proofs?.includes("array-lite-uint8array-hex-map-from")
));
assert.ok(arrayFromUint8ArrayProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.from" && !item.proofs?.length));
assert.ok(arrayFromUint8ArrayProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.ok(arrayFromUint8ArrayProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assertRuntimeClosureProviderCounts(arrayFromUint8ArrayProofJsReport.runtimeClosure);

const arrayFromDomCollectionProofOut = join(root, "tmp/array-from-dom-collection-proof-gate-a.csgjs");
const arrayFromDomCollectionProofReport = join(root, "tmp/array-from-dom-collection-proof-gate-a.js.report.json");
runCli("fixtures/csg-array-from-dom-collection-proof-gate/tsconfig.json", arrayFromDomCollectionProofOut, arrayFromDomCollectionProofReport);
const arrayFromDomCollectionProofJsReport = JSON.parse(readFileSync(arrayFromDomCollectionProofReport, "utf8"));
assert.equal(arrayFromDomCollectionProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  item.proofs?.includes("array-lite-dom-collection-from")
).length, 7);
assert.equal(arrayFromDomCollectionProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  !item.proofs?.length
).length, 3);
assert.ok(arrayFromDomCollectionProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(arrayFromDomCollectionProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assertRuntimeClosureProviderCounts(arrayFromDomCollectionProofJsReport.runtimeClosure);

const freezeProofOut = join(root, "tmp/freeze-proof-gate-a.csgjs");
const freezeProofReport = join(root, "tmp/freeze-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-freeze/tsconfig.json", freezeProofOut, freezeProofReport);
const freezeProofJsReport = JSON.parse(readFileSync(freezeProofReport, "utf8"));
assert.ok(freezeProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.freeze" && item.proofs?.includes("array-lite-i32-freeze-local")));
assert.ok(freezeProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.freeze" && item.proofs?.includes("object-lite-freeze-local")));
assert.ok(freezeProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.isArray" && item.proofs?.includes("array-lite-i32-isarray-local")));
assertClosedRuntimeClosureRequirement(freezeProofJsReport.runtimeClosure, "Array.isArray", arrayLiteProvider);
assert.equal(freezeProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Object.freeze" && item.providerStatus === "closed"), true);
assertRuntimeClosureProviderCounts(freezeProofJsReport.runtimeClosure);

const freezeJsValueProofOut = join(root, "tmp/freeze-jsvalue-proof-gate-a.csgjs");
const freezeJsValueProofReport = join(root, "tmp/freeze-jsvalue-proof-gate-a.js.report.json");
runCli("fixtures/csg-object-freeze-jsvalue-proof-gate/tsconfig.json", freezeJsValueProofOut, freezeJsValueProofReport);
const freezeJsValueProofJsReport = JSON.parse(readFileSync(freezeJsValueProofReport, "utf8"));
assert.equal(freezeJsValueProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.freeze" &&
  item.proofs?.includes("array-lite-jsvalue-freeze-fresh")
).length, 3);
assert.equal(freezeJsValueProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.freeze" &&
  item.proofs?.includes("object-jsvalue-freeze-fresh")
).length, 2);
assert.equal(freezeJsValueProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.freeze" &&
  !item.proofs?.some((proof) => proof.endsWith("freeze-local") || proof.endsWith("freeze-fresh"))
).length, 4);
assert.ok(freezeJsValueProofJsReport.runtimeClosure.requirements.some((item) =>
  item.name === "Object.freeze" &&
  item.providerStatus === "closed" &&
  item.provider === objectLiteProvider
));
assertRuntimeClosureProviderCounts(freezeJsValueProofJsReport.runtimeClosure);

const objectValuesProofOut = join(root, "tmp/object-values-proof-gate-a.csgjs");
const objectValuesProofReport = join(root, "tmp/object-values-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-object-values/tsconfig.json", objectValuesProofOut, objectValuesProofReport);
const objectValuesProofJsReport = JSON.parse(readFileSync(objectValuesProofReport, "utf8"));
assert.ok(objectValuesProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.values" && item.proofs?.includes("object-lite-values-local")));
assert.ok(objectValuesProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.isFrozen" && item.proofs?.includes("object-lite-isfrozen-local")));
assert.ok(objectValuesProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.isFrozen" && item.proofs?.includes("array-lite-i32-isfrozen-local")));
assertClosedRuntimeClosureRequirement(objectValuesProofJsReport.runtimeClosure, "Object.values", objectLiteProvider);
assert.equal(objectValuesProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Object.isFrozen" && item.providerStatus === "closed"), true);
assertRuntimeClosureProviderCounts(objectValuesProofJsReport.runtimeClosure);

const objectValuesJsValueProofOut = join(root, "tmp/object-values-jsvalue-proof-gate-a.csgjs");
const objectValuesJsValueProofReport = join(root, "tmp/object-values-jsvalue-proof-gate-a.js.report.json");
runCli("fixtures/csg-object-values-jsvalue-proof-gate/tsconfig.json", objectValuesJsValueProofOut, objectValuesJsValueProofReport);
const objectValuesJsValueProofJsReport = JSON.parse(readFileSync(objectValuesJsValueProofReport, "utf8"));
assert.equal(objectValuesJsValueProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.values" &&
  item.proofs?.includes("object-jsvalue-values-array")
).length, 6);
assert.equal(objectValuesJsValueProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.values" &&
  !item.proofs?.length
).length, 6);
assert.ok(objectValuesJsValueProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Object.values" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.ok(objectValuesJsValueProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Object.values" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assertRuntimeClosureProviderCounts(objectValuesJsValueProofJsReport.runtimeClosure);

const objectKeyEntryProofOut = join(root, "tmp/object-key-entry-proof-gate-a.csgjs");
const objectKeyEntryProofReport = join(root, "tmp/object-key-entry-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-object-key-entry-length/tsconfig.json", objectKeyEntryProofOut, objectKeyEntryProofReport);
const objectKeyEntryProofJsReport = JSON.parse(readFileSync(objectKeyEntryProofReport, "utf8"));
assert.ok(objectKeyEntryProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.keys" && item.proofs?.includes("object-lite-key-entry-length")));
assert.ok(objectKeyEntryProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.keys" && item.proofs?.includes("object-lite-keys-local")));
assert.ok(objectKeyEntryProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.entries" && item.proofs?.includes("object-lite-key-entry-length")));
assertClosedRuntimeClosureRequirement(objectKeyEntryProofJsReport.runtimeClosure, "Object.keys", objectLiteProvider);
assertClosedRuntimeClosureRequirement(objectKeyEntryProofJsReport.runtimeClosure, "Object.entries", objectLiteProvider);
assertRuntimeClosureProviderCounts(objectKeyEntryProofJsReport.runtimeClosure);

const objectKeysJsValueLengthProofOut = join(root, "tmp/object-keys-jsvalue-length-proof-gate-a.csgjs");
const objectKeysJsValueLengthProofReport = join(root, "tmp/object-keys-jsvalue-length-proof-gate-a.js.report.json");
runCli("fixtures/csg-object-keys-jsvalue-length/tsconfig.json", objectKeysJsValueLengthProofOut, objectKeysJsValueLengthProofReport);
const objectKeysJsValueLengthProofJsReport = JSON.parse(readFileSync(objectKeysJsValueLengthProofReport, "utf8"));
assert.equal(objectKeysJsValueLengthProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.keys" &&
  item.proofs?.includes("object-jsvalue-keys-length")
).length, 3);
assert.equal(objectKeysJsValueLengthProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.keys" &&
  !item.proofs?.length
).length, 1);
assert.equal(objectKeysJsValueLengthProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.entries" &&
  item.proofs?.includes("object-jsvalue-entries-array")
).length, 3);
assert.equal(objectKeysJsValueLengthProofJsReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.entries" &&
  !item.proofs?.length
).length, 1);
assert.ok(objectKeysJsValueLengthProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Object.keys" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.ok(objectKeysJsValueLengthProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Object.keys" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.ok(objectKeysJsValueLengthProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Object.entries" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assertRuntimeClosureProviderCounts(objectKeysJsValueLengthProofJsReport.runtimeClosure);

const emptyArrayLiteralProofOut = join(root, "tmp/empty-array-literal-proof-gate-a.csgjs");
const emptyArrayLiteralProofReport = join(root, "tmp/empty-array-literal-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-empty-array-literal/tsconfig.json", emptyArrayLiteralProofOut, emptyArrayLiteralProofReport);
const emptyArrayLiteralProofJsReport = JSON.parse(readFileSync(emptyArrayLiteralProofReport, "utf8"));
assert.ok(emptyArrayLiteralProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.literal" && item.proofs?.includes("array-lite-empty")));
assert.ok(emptyArrayLiteralProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.literal" && item.proofs?.includes("array-lite-const-string-literal")));
assert.ok(emptyArrayLiteralProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.literal" && item.proofs?.includes("array-lite-jsvalue-scalar-literal")));
assert.ok(emptyArrayLiteralProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.literal" && item.proofs?.includes("array-lite-jsvalue-literal") && item.loc?.line === 6));
assert.ok(emptyArrayLiteralProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Array.literal" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assertRuntimeClosureProviderCounts(emptyArrayLiteralProofJsReport.runtimeClosure);

const jsValueArrayProofOut = join(root, "tmp/jsvalue-array-proof-gate-a.csgjs");
const jsValueArrayProofReport = join(root, "tmp/jsvalue-array-proof-gate-a.js.report.json");
runCli("fixtures/csg-jsvalue-array/tsconfig.json", jsValueArrayProofOut, jsValueArrayProofReport);
const jsValueArrayProofJsReport = JSON.parse(readFileSync(jsValueArrayProofReport, "utf8"));
assert.ok(jsValueArrayProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.literal" && item.proofs?.includes("array-lite-jsvalue-literal")));
assert.ok(jsValueArrayProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.literal" && item.proofs?.includes("array-lite-jsvalue-spread-literal")));
assert.ok(jsValueArrayProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.length" && item.proofs?.includes("array-lite-jsvalue-local")));
assert.ok(jsValueArrayProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.push" && item.proofs?.includes("array-lite-jsvalue-push-local")));
assert.ok(jsValueArrayProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.includes" && item.proofs?.includes("array-lite-jsvalue-includes-local")));
assert.ok(jsValueArrayProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "String.length" && item.proofs?.includes("string-runtime-length")));
assertClosedRuntimeClosureRequirement(jsValueArrayProofJsReport.runtimeClosure, "Array.literal", arrayLiteProvider);
assertClosedRuntimeClosureRequirement(jsValueArrayProofJsReport.runtimeClosure, "Array.length", arrayLiteProvider);
assertClosedRuntimeClosureRequirement(jsValueArrayProofJsReport.runtimeClosure, "Array.push", arrayLiteProvider);
assertClosedRuntimeClosureRequirement(jsValueArrayProofJsReport.runtimeClosure, "Array.includes", arrayLiteProvider);
assertClosedRuntimeClosureRequirement(jsValueArrayProofJsReport.runtimeClosure, "String.length", stringLiteProvider);
assertRuntimeClosureProviderCounts(jsValueArrayProofJsReport.runtimeClosure);

const uint8ArrayConstructorProofOut = join(root, "tmp/uint8array-constructor-proof-gate-a.csgjs");
const uint8ArrayConstructorProofReport = join(root, "tmp/uint8array-constructor-proof-gate-a.js.report.json");
runCli("fixtures/csg-uint8array-constructor/tsconfig.json", uint8ArrayConstructorProofOut, uint8ArrayConstructorProofReport);
const uint8ArrayConstructorProofJsReport = JSON.parse(readFileSync(uint8ArrayConstructorProofReport, "utf8"));
assert.equal(
  uint8ArrayConstructorProofJsReport.coreReport.runtimeRequirements.filter((item) =>
    item.kind === "constructor" &&
    item.name === "Uint8Array" &&
    item.proofs?.includes("uint8array-constructor-length")
  ).length,
  1,
);
assert.equal(
  uint8ArrayConstructorProofJsReport.coreReport.runtimeRequirements.filter((item) =>
    item.kind === "constructor" &&
    item.name === "Uint8Array" &&
    item.proofs?.includes("uint8array-constructor-byte-array")
  ).length,
  1,
);
assert.equal(
  uint8ArrayConstructorProofJsReport.coreReport.runtimeRequirements.filter((item) =>
    item.kind === "constructor" &&
    item.name === "Uint8Array" &&
    item.proofs?.includes("uint8array-constructor-buffer-view")
  ).length,
  2,
);
assert.equal(uint8ArrayConstructorProofJsReport.coreReport.runtimeRequirements.filter((item) => item.kind === "constructor" && item.name === "Uint8Array" && !item.proofs?.length).length, 3);
assert.ok(uint8ArrayConstructorProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Uint8Array" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.ok(uint8ArrayConstructorProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Uint8Array" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assertRuntimeClosureProviderCounts(uint8ArrayConstructorProofJsReport.runtimeClosure);

const uint8ArraySafeLengthConstructorProofOut = join(root, "tmp/uint8array-safe-length-constructor-proof-gate-a.csgjs");
const uint8ArraySafeLengthConstructorProofReport = join(root, "tmp/uint8array-safe-length-constructor-proof-gate-a.js.report.json");
runCli("fixtures/csg-uint8array-safe-length-constructor/tsconfig.json", uint8ArraySafeLengthConstructorProofOut, uint8ArraySafeLengthConstructorProofReport);
const uint8ArraySafeLengthConstructorProofJsReport = JSON.parse(readFileSync(uint8ArraySafeLengthConstructorProofReport, "utf8"));
assert.equal(
  uint8ArraySafeLengthConstructorProofJsReport.coreReport.runtimeRequirements.filter((item) =>
    item.kind === "constructor" &&
    item.name === "Uint8Array" &&
    item.proofs?.includes("uint8array-constructor-length")
  ).length,
  6,
);
assert.equal(uint8ArraySafeLengthConstructorProofJsReport.coreReport.runtimeRequirements.filter((item) => item.kind === "constructor" && item.name === "Uint8Array" && !item.proofs?.length).length, 2);
assert.ok(uint8ArraySafeLengthConstructorProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Uint8Array" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.ok(uint8ArraySafeLengthConstructorProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Uint8Array" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assertRuntimeClosureProviderCounts(uint8ArraySafeLengthConstructorProofJsReport.runtimeClosure);

const dateConstructorProofOut = join(root, "tmp/date-constructor-proof-gate-a.csgjs");
const dateConstructorProofReport = join(root, "tmp/date-constructor-proof-gate-a.js.report.json");
runCli("fixtures/csg-date-constructor-proof-gate/tsconfig.json", dateConstructorProofOut, dateConstructorProofReport);
const dateConstructorProofJsReport = JSON.parse(readFileSync(dateConstructorProofReport, "utf8"));
assert.equal(
  dateConstructorProofJsReport.coreReport.runtimeRequirements.filter((item) =>
    item.kind === "constructor" &&
    item.name === "Date" &&
    item.proofs?.includes("date-constructor-now-ms")
  ).length,
  1,
);
assert.equal(dateConstructorProofJsReport.coreReport.runtimeRequirements.filter((item) => item.kind === "constructor" && item.name === "Date" && !item.proofs?.length).length, 1);
assert.ok(dateConstructorProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Date" && item.providerStatus === "closed" && item.provider === dateNowProvider));
assert.ok(dateConstructorProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Date" && item.providerStatus === "closed" && item.provider === dateNowProvider));
assertRuntimeClosureProviderCounts(dateConstructorProofJsReport.runtimeClosure);

const collectionConstructorProofOut = join(root, "tmp/collection-constructor-proof-gate-a.csgjs");
const collectionConstructorProofReport = join(root, "tmp/collection-constructor-proof-gate-a.js.report.json");
runCli("fixtures/csg-js-collection-constructor/tsconfig.json", collectionConstructorProofOut, collectionConstructorProofReport);
const collectionConstructorProofJsReport = JSON.parse(readFileSync(collectionConstructorProofReport, "utf8"));
assert.ok(collectionConstructorProofJsReport.coreReport.runtimeRequirements.some((item) => item.kind === "constructor" && item.name === "Map" && item.proofs?.includes("collection-constructor-empty")));
assert.ok(collectionConstructorProofJsReport.coreReport.runtimeRequirements.some((item) => item.kind === "constructor" && item.name === "Set" && item.proofs?.includes("collection-constructor-empty")));
assert.ok(collectionConstructorProofJsReport.coreReport.runtimeRequirements.some((item) => item.kind === "constructor" && item.name === "Set" && item.proofs?.includes("collection-constructor-string-array")));
assert.ok(collectionConstructorProofJsReport.coreReport.runtimeRequirements.some((item) => item.kind === "global" && item.name === "console" && item.proofs?.includes("namespace-reference")));
assert.ok(collectionConstructorProofJsReport.runtimeClosure.requirements.some((item) => item.kind === "constructor" && item.name === "Map" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.ok(collectionConstructorProofJsReport.runtimeClosure.requirements.some((item) => item.kind === "constructor" && item.name === "Set" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.ok(collectionConstructorProofJsReport.runtimeClosure.requirements.some((item) => item.kind === "global" && item.name === "console" && item.providerStatus === "closed"));
assertRuntimeClosureProviderCounts(collectionConstructorProofJsReport.runtimeClosure);

const documentCreateElementProofOut = join(root, "tmp/document-create-element-proof-gate-a.csgjs");
const documentCreateElementProofReport = join(root, "tmp/document-create-element-proof-gate-a.js.report.json");
runCli("fixtures/csg-browser-document-create-element/tsconfig.json", documentCreateElementProofOut, documentCreateElementProofReport);
const documentCreateElementProofJsReport = JSON.parse(readFileSync(documentCreateElementProofReport, "utf8"));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "document" && item.proofs?.includes("browser-document-global")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "document.body" && item.kind === "property_access" && item.proofs?.includes("browser-document-body")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "document.head" && item.kind === "property_access" && item.proofs?.includes("browser-document-head")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "document.documentElement" && item.kind === "property_access" && item.proofs?.includes("browser-document-element")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "document.hidden" && item.kind === "property_access" && item.proofs?.includes("browser-document-hidden")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "document.visibilityState" && item.kind === "property_access" && item.proofs?.includes("browser-document-visibility-state")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "document.body.dataset" && item.kind === "property_access" && item.proofs?.includes("browser-document-dataset")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "document.dataset.write" && item.kind === "property_write" && item.proofs?.includes("browser-document-dataset-string-write")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".style.setProperty") && item.kind === "call" && item.proofs?.includes("browser-inline-style-set-property")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "document.body.style.overflow" && item.kind === "property_access" && item.proofs?.includes("browser-inline-style-property-read")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.assign" && item.kind === "call" && item.proofs?.includes("browser-inline-style-object-assign")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "document.createElement" && item.kind === "call" && item.proofs?.includes("browser-document-create-element-literal")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "doc.createElement" && item.kind === "call" && item.proofs?.includes("browser-document-create-element-literal")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "TextEncoder" && item.kind === "constructor" && item.proofs?.includes("browser-text-encoder-constructor")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "TextDecoder" && item.kind === "constructor" && item.proofs?.includes("browser-text-decoder-constructor")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".encode") && item.kind === "call" && item.proofs?.includes("browser-text-encoder-encode-utf8")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".decode") && item.kind === "call" && item.proofs?.includes("browser-text-decoder-decode-utf8")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "atob" && item.kind === "call" && item.proofs?.includes("browser-window-base64-codec")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "btoa" && item.kind === "call" && item.proofs?.includes("browser-window-base64-codec")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "window.matchMedia" && item.kind === "call" && item.proofs?.includes("browser-window-matchmedia-matches")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "window.matches" && item.kind === "property_access" && item.proofs?.includes("browser-window-matchmedia-matches")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "window.scrollY" && item.kind === "property_access" && item.proofs?.includes("browser-window-scroll-readonly-scalar")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "window.matchMedia" && item.kind === "call" && item.proofs?.includes("browser-window-matchmedia-list")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "mediaQuery.addEventListener" && item.kind === "call" && item.proofs?.includes("browser-mediaquery-list-listener")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "mediaQuery.removeEventListener" && item.kind === "call" && item.proofs?.includes("browser-mediaquery-list-listener")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "mediaQuery.addListener" && item.kind === "call" && item.proofs?.includes("browser-mediaquery-list-listener")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "mediaQuery.removeListener" && item.kind === "call" && item.proofs?.includes("browser-mediaquery-list-listener")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "IntersectionObserver" && item.kind === "constructor" && item.proofs?.includes("browser-intersection-observer-constructor")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "intersectionObserver.observe" && item.kind === "call" && item.proofs?.includes("browser-intersection-observer-observe")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "intersectionObserver.disconnect" && item.kind === "call" && item.proofs?.includes("browser-intersection-observer-disconnect")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "endpoint.toString" && item.kind === "call" && item.proofs?.includes("browser-url-tostring")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "Event" && item.kind === "constructor" && item.proofs?.includes("browser-event-constructor-literal")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".dispatchEvent") && item.kind === "call" && item.proofs?.includes("browser-event-dispatch-event-object")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".dispatchEvent") && item.kind === "call" && !item.proofs?.length));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".append") && item.kind === "call" && item.proofs?.includes("browser-element-append")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".appendChild") && item.kind === "call" && item.proofs?.includes("browser-element-append-child")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".contains") && item.kind === "call" && item.proofs?.includes("browser-element-contains")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".remove") && item.kind === "call" && item.proofs?.includes("browser-element-remove")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".getElementById") && item.kind === "call" && item.proofs?.includes("browser-document-get-element-by-id")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".querySelector") && item.kind === "call" && item.proofs?.includes("browser-document-query-selector")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "document.querySelector" && item.kind === "call" && item.proofs?.includes("browser-document-query-selector")).length >= 3);
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".querySelectorAll") && item.kind === "call" && item.proofs?.includes("browser-document-query-selector-all")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".matches") && item.kind === "call" && item.proofs?.includes("browser-element-matches")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".closest") && item.kind === "call" && item.proofs?.includes("browser-element-closest")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".querySelector") && item.kind === "property_access" && item.proofs?.includes("browser-document-query-selector")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".getElementById") && item.kind === "property_access" && item.proofs?.includes("browser-document-get-element-by-id")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".addEventListener") && item.kind === "property_access" && item.proofs?.includes("browser-event-add-listener")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".setAttribute") && item.kind === "call" && item.proofs?.includes("browser-element-set-attribute")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".getAttribute") && item.kind === "call" && item.proofs?.includes("browser-element-get-attribute")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".hasAttribute") && item.kind === "call" && item.proofs?.includes("browser-element-has-attribute")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".removeAttribute") && item.kind === "call" && item.proofs?.includes("browser-element-remove-attribute")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".classList") && item.kind === "property_access" && item.proofs?.includes("browser-element-classlist-access")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".classList.add") && item.kind === "call" && item.proofs?.includes("browser-element-classlist-call")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".classList.toggle") && item.kind === "call" && item.proofs?.includes("browser-element-classlist-call")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".classList.contains") && item.kind === "call" && item.proofs?.includes("browser-element-classlist-call")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".classList.remove") && item.kind === "call" && item.proofs?.includes("browser-element-classlist-call")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".addEventListener") && item.kind === "call" && item.proofs?.includes("browser-event-add-listener")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".removeEventListener") && item.kind === "call" && item.proofs?.includes("browser-event-remove-listener")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".preventDefault") && item.kind === "call" && item.proofs?.includes("browser-event-prevent-default")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".stopPropagation") && item.kind === "call" && item.proofs?.includes("browser-event-stop-propagation")));
assert.ok(documentCreateElementProofJsReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".createElement") && item.kind === "call" && !item.proofs?.length));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "document" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "document.body" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "document.head" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "document.documentElement" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "document.hidden" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "document.visibilityState" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "document.body.dataset" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "document.dataset.write" && item.kind === "property_write" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".style.setProperty") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "document.body.style.overflow" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Object.assign" && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "document.createElement" && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "TextEncoder" && item.kind === "constructor" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "TextDecoder" && item.kind === "constructor" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".encode") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".decode") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "atob" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "btoa" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "window.matchMedia" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "window.matches" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "window.scrollY" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "mediaQuery.addEventListener" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "mediaQuery.removeEventListener" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "mediaQuery.addListener" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "mediaQuery.removeListener" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "IntersectionObserver" && item.kind === "constructor" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "intersectionObserver.observe" && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "intersectionObserver.disconnect" && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "endpoint.toString" && item.kind === "call" && item.providerStatus === "closed" && item.provider === urlProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name === "Event" && item.kind === "constructor" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".dispatchEvent") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".dispatchEvent") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".append") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".appendChild") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".contains") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".remove") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".getElementById") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".querySelector") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".querySelectorAll") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".querySelector") && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".getElementById") && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".matches") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".closest") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".setAttribute") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".getAttribute") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".hasAttribute") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".removeAttribute") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".classList") && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".classList.add") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".classList.toggle") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".classList.contains") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".classList.remove") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".addEventListener") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".removeEventListener") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".addEventListener") && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".preventDefault") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".stopPropagation") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofJsReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".createElement") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assertRuntimeClosureProviderCounts(documentCreateElementProofJsReport.runtimeClosure);

const localStorageProofOut = join(root, "tmp/local-storage-proof-gate-a.csgjs");
const localStorageProofReport = join(root, "tmp/local-storage-proof-gate-a.js.report.json");
runCli("fixtures/csg-browser-local-storage/tsconfig.json", localStorageProofOut, localStorageProofReport);
const localStorageProofJsReport = JSON.parse(readFileSync(localStorageProofReport, "utf8"));
assert.ok(localStorageProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "localStorage" && item.proofs?.includes("browser-local-storage-global")));
assert.ok(localStorageProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "localStorage.getItem" && item.kind === "call" && item.proofs?.includes("browser-local-storage-getitem")));
assert.ok(localStorageProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "localStorage.getItem" && item.kind === "property_access" && item.proofs?.includes("browser-local-storage-getitem")));
assert.ok(localStorageProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "localStorage.setItem" && item.kind === "call" && item.proofs?.includes("browser-local-storage-setitem")));
assert.ok(localStorageProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "localStorage.setItem" && item.kind === "property_access" && item.proofs?.includes("browser-local-storage-setitem")));
assert.ok(localStorageProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "window.localStorage.removeItem" && item.kind === "call" && item.proofs?.includes("browser-local-storage-removeitem")));
assert.ok(localStorageProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "localStorage.clear" && item.kind === "call" && item.proofs?.includes("browser-local-storage-clear")));
assert.ok(localStorageProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "window" && item.proofs?.includes("browser-window-global")));
assert.ok(localStorageProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "window.localStorage" && item.kind === "property_access" && item.proofs?.includes("browser-window-local-storage")));
assert.ok(localStorageProofJsReport.runtimeClosure.requirements.some((item) => item.name === "localStorage" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assert.ok(localStorageProofJsReport.runtimeClosure.requirements.some((item) => item.name === "localStorage.getItem" && item.kind === "call" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assert.ok(localStorageProofJsReport.runtimeClosure.requirements.some((item) => item.name === "localStorage.getItem" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assert.ok(localStorageProofJsReport.runtimeClosure.requirements.some((item) => item.name === "localStorage.setItem" && item.kind === "call" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assert.ok(localStorageProofJsReport.runtimeClosure.requirements.some((item) => item.name === "localStorage.setItem" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assert.ok(localStorageProofJsReport.runtimeClosure.requirements.some((item) => item.name === "window.localStorage.removeItem" && item.kind === "call" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assert.ok(localStorageProofJsReport.runtimeClosure.requirements.some((item) => item.name === "localStorage.clear" && item.kind === "call" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assert.ok(localStorageProofJsReport.runtimeClosure.requirements.some((item) => item.name === "window" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(localStorageProofJsReport.runtimeClosure.requirements.some((item) => item.name === "window.localStorage" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assertRuntimeClosureProviderCounts(localStorageProofJsReport.runtimeClosure);

const localWindowSymbolOut = join(root, "tmp/local-window-symbol-gate-a.csgjs");
const localWindowSymbolReport = join(root, "tmp/local-window-symbol-gate-a.js.report.json");
runCli("fixtures/csg-local-window-symbol/tsconfig.json", localWindowSymbolOut, localWindowSymbolReport);
const localWindowSymbolJsReport = JSON.parse(readFileSync(localWindowSymbolReport, "utf8"));
assert.equal(localWindowSymbolJsReport.coreReport.runtimeRequirements.some((item) => item.runtime === "browser" && item.name.startsWith("window.webContents")), false);
assert.ok(localWindowSymbolJsReport.coreReport.runtimeRequirements.some((item) => item.runtime === "unknown" && item.source === "external_declaration" && item.name === "window.webContents.executeJavaScript"));

const reactUseStateProofOut = join(root, "tmp/react-usestate-proof-gate-a.csgjs");
const reactUseStateProofReport = join(root, "tmp/react-usestate-proof-gate-a.js.report.json");
runCli("fixtures/cheng-source-react-usestate/tsconfig.json", reactUseStateProofOut, reactUseStateProofReport);
const reactUseStateProofJsReport = JSON.parse(readFileSync(reactUseStateProofReport, "utf8"));
assert.ok(reactUseStateProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "useState" && item.source === "react_type" && item.proofs?.includes("react-use-state-hook")));
assert.ok(reactUseStateProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "React.useState" && item.source === "react_type" && item.proofs?.includes("react-use-state-hook")));
assert.ok(reactUseStateProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "useRef" && item.source === "react_type" && item.proofs?.includes("react-use-ref-hook")));
assert.ok(reactUseStateProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "React.useRef" && item.source === "react_type" && item.proofs?.includes("react-use-ref-hook")));
assert.ok(reactUseStateProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "useCallback" && item.source === "react_type" && item.proofs?.includes("react-use-callback-hook")));
assert.ok(reactUseStateProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "React.useCallback" && item.source === "react_type" && item.proofs?.includes("react-use-callback-hook")));
assert.ok(reactUseStateProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "useEffect" && item.source === "react_type" && item.proofs?.includes("react-use-effect-cfg-hook")));
assert.equal(reactUseStateProofJsReport.coreReport.runtimeRequirements.filter((item) => item.name === "useEffect" && item.source === "react_type" && item.proofs?.includes("react-use-effect-cfg-hook")).length >= 4, true);
assert.ok(reactUseStateProofJsReport.coreReport.runtimeRequirements.some((item) => item.name === "react" && item.kind === "module_import" && item.proofs?.includes("react-module-import-pure-runtime")));
assertClosedRuntimeClosureRequirement(reactUseStateProofJsReport.runtimeClosure, "useState", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofJsReport.runtimeClosure, "React.useState", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofJsReport.runtimeClosure, "useRef", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofJsReport.runtimeClosure, "React.useRef", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofJsReport.runtimeClosure, "useCallback", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofJsReport.runtimeClosure, "React.useCallback", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofJsReport.runtimeClosure, "react", reactProvider);
assert.ok(reactUseStateProofJsReport.runtimeClosure.externalSymbols.some((item) => item.name === "useState" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofJsReport.runtimeClosure.externalSymbols.some((item) => item.name === "React.useState" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofJsReport.runtimeClosure.externalSymbols.some((item) => item.name === "useRef" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofJsReport.runtimeClosure.externalSymbols.some((item) => item.name === "React.useRef" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofJsReport.runtimeClosure.externalSymbols.some((item) => item.name === "useCallback" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofJsReport.runtimeClosure.externalSymbols.some((item) => item.name === "React.useCallback" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofJsReport.runtimeClosure.externalSymbols.some((item) => item.name === "react" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofJsReport.runtimeClosure.requirements.some((item) => item.name === "useEffect" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofJsReport.runtimeClosure.externalSymbols.some((item) => item.name === "useEffect" && item.providerStatus === "closed" && item.provider === reactProvider));
assertRuntimeClosureProviderCounts(reactUseStateProofJsReport.runtimeClosure);

const validText = readFileSync(join(root, "tmp/async-a.csgjs"), "utf8");
const emptyValidation = validateCsgJsText("");
assert.equal(emptyValidation.ok, false);
assert.match(emptyValidation.diagnostics.join("\n"), /empty csg-js facts/);

const nonSchemaValidation = validateCsgJsText(`${JSON.stringify({ kind: "csg.js.project", schema: "csg-js" })}\n`);
assert.equal(nonSchemaValidation.ok, false);
assert.match(nonSchemaValidation.diagnostics.join("\n"), /first fact must be csg\.js\.schema|embed csg_core/);

const noCoreSchemaValidation = validateCsgJsText(`${JSON.stringify({ kind: "csg.js.schema", schema: "csg-js" })}\n`);
assert.equal(noCoreSchemaValidation.ok, false);
assert.match(noCoreSchemaValidation.diagnostics.join("\n"), /embed csg_core/);

const unknownValidation = validateCsgJsText(`${validText}${JSON.stringify({ kind: "csg.js.unknown", schema: "csg-js" })}\n`);
assert.equal(unknownValidation.ok, false);
assert.match(unknownValidation.diagnostics.join("\n"), /unknown csg-js fact kind/);

const truncatedValidation = validateCsgJsText(validText.split("\n")[0].slice(0, -1));
assert.equal(truncatedValidation.ok, false);
assert.match(truncatedValidation.diagnostics.join("\n"), /invalid JSON fact|first fact/);

process.stdout.write("csg-js smoke ok\n");

function runCli(project, out, report) {
  execFileSync(process.execPath, [
    "dist/cli.js",
    "--emit",
    "csg-js",
    "--project",
    project,
    "--runtime",
    "node,browser",
    "--out",
    out,
    "--report-out",
    report,
  ], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function assertRuntimeClosureProviderCounts(closure) {
  assert.equal(closure.openRequirementCount + closure.closedRequirementCount, closure.requirementCount);
  assert.equal(closure.candidateRequirementCount <= closure.openRequirementCount, true);
}

function assertClosedRuntimeClosureRequirement(closure, name, provider) {
  const item = closure.requirements.find((requirement) =>
    requirement.name === name &&
    requirement.providerStatus === "closed" &&
    requirement.provider === provider
  );
  assert.ok(item, `missing runtime requirement ${name}`);
  assert.equal(item.providerStatus, "closed", name);
  assert.equal(item.provider, provider, name);
  assert.equal(item.candidateProvider, undefined, name);
}

function assertClosedRuntimeRequirementDecision(kind, name, source, provider, proofs = undefined, runtime = "js-core") {
  const decision = runtimeRequirementProviderDecision({ runtime, kind, name, source, proofs });
  assert.equal(decision.status, "closed", name);
  assert.equal(decision.provider, provider, name);
  assert.equal(decision.candidateProvider, undefined, name);
}

function assertOpenRuntimeRequirementDecision(kind, name, source, candidateProvider, runtime = "js-core") {
  const decision = runtimeRequirementProviderDecision({ runtime, kind, name, source });
  assert.equal(decision.status, "open", name);
  assert.equal(decision.provider, undefined, name);
  assert.equal(decision.candidateProvider, candidateProvider, name);
}

function assertClosedExternalSymbolDecision(name, source, provider, runtime = "js-core") {
  const decision = externalSymbolProviderDecision({ runtime, name, source });
  assert.equal(decision.status, "closed", name);
  assert.equal(decision.provider, provider, name);
  assert.equal(decision.candidateProvider, undefined, name);
}

function assertOpenExternalSymbolDecision(name, source, candidateProvider, runtime = "js-core") {
  const decision = externalSymbolProviderDecision({ runtime, name, source });
  assert.equal(decision.status, "open", name);
  assert.equal(decision.provider, undefined, name);
  assert.equal(decision.candidateProvider, candidateProvider, name);
}
