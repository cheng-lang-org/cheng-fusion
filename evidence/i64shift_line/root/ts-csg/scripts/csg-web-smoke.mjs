import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const { emitCsgWebFromTs, validateCsgWebText } = await import(pathToFileURL(join(root, "dist/csg-web.js")).href);
const { externalSymbolProviderDecision, runtimeRequirementProviderDecision } = await import(pathToFileURL(join(root, "dist/runtime-providers.js")).href);

const arrayLiteProvider = "cheng/core/runtime/js_runtime.array-lite";
const stringLiteProvider = "cheng/core/runtime/js_runtime.string-lite";
const objectLiteProvider = "cheng/core/runtime/js_runtime.object-lite";
const scalarLiteProvider = "cheng/core/runtime/js_runtime.scalar-lite";
const errorLiteProvider = "cheng/core/runtime/js_runtime.error-lite";
const promiseProvider = "cheng/core/runtime/js_promise_runtime.await-sync-i32";
const dateNowProvider = "std/times.epoch-time-ms";
const dateParseProvider = "cheng-source.js-core.date-parse";
const reactProvider = "cheng/core/runtime/web_react_runtime.hooks";
const domDocumentProvider = "cheng/core/runtime/web_runtime.dom-document-lite";
const localStorageProvider = "cheng/core/runtime/web_runtime.local-storage-lite";
const windowProvider = "cheng/core/runtime/web_runtime.window-lite";
const navigatorProvider = "cheng/core/runtime/web_runtime.navigator-lite";
const serviceWorkerProvider = "cheng/core/runtime/web_service_worker_runtime.register-lite";
const geolocationProvider = "cheng/core/runtime/web_geolocation_provider.current-position";
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
const arrayLiteI32LocalProofs = ["array-lite-i32-local"];
const objectLiteFreezeLocalProofs = ["object-lite-freeze-local"];
const objectJsValueFreezeFreshProofs = ["object-jsvalue-freeze-fresh"];
const objectLiteIsFrozenLocalProofs = ["object-lite-isfrozen-local"];
const objectLiteValuesLocalProofs = ["object-lite-values-local"];
const objectLiteKeyEntryLengthProofs = ["object-lite-key-entry-length"];
const objectLiteKeysLocalProofs = ["object-lite-keys-local"];
const objectJsValueKeysLengthProofs = ["object-jsvalue-keys-length"];
const objectJsValueKeysArrayProofs = ["object-jsvalue-keys-array"];
const objectJsValueValuesArrayProofs = ["object-jsvalue-values-array"];
const objectJsValueEntriesArrayProofs = ["object-jsvalue-entries-array"];
const stringTypeMethodProofs = ["string-type-method"];
const stringRegexLiteralReplaceProofs = ["string-regex-literal-replace"];
const stringRegexLiteralAffixReplaceProofs = ["string-regex-literal-affix-replace"];
const stringRegexAsciiClassReplaceProofs = ["string-regex-ascii-class-replace"];
const stringRegexLineSplitProofs = ["string-regex-line-split"];
const stringRegexAsciiClassSplitProofs = ["string-regex-ascii-class-split"];
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
const dateConstructorStringProofs = ["date-constructor-string"];
const errorConstructorMessageStringProofs = ["error-constructor-message-string"];
const errorInstanceOfProofs = ["error-instanceof"];
const reactUseStateProofs = ["react-use-state-hook"];
const reactUseRefProofs = ["react-use-ref-hook"];
const reactUseCallbackProofs = ["react-use-callback-hook"];
const reactUseMemoProofs = ["react-use-memo-hook"];
const reactUseEffectProofs = ["react-use-effect-noop-hook"];
const reactUseEffectCfgProofs = ["react-use-effect-cfg-hook"];
const reactHostJsxProofs = ["react-host-jsx-dom-template"];
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
const browserWindowLocationProofs = ["browser-window-location"];
const browserWindowLocationReadonlyScalarProofs = ["browser-window-location-readonly-scalar"];
const browserWindowSizeProofs = ["browser-window-size-constant"];
const browserWindowScrollProofs = ["browser-window-scroll-readonly-scalar"];
const browserWindowCancelAnimationFrameProofs = ["browser-window-cancel-animation-frame"];
const browserWindowBase64CodecProofs = ["browser-window-base64-codec"];
const browserWindowMatchMediaMatchesProofs = ["browser-window-matchmedia-matches"];
const browserWindowMatchMediaListProofs = ["browser-window-matchmedia-list"];
const browserMediaQueryListListenerProofs = ["browser-mediaquery-list-listener"];
const browserIntersectionObserverConstructorProofs = ["browser-intersection-observer-constructor"];
const browserIntersectionObserverObserveProofs = ["browser-intersection-observer-observe"];
const browserIntersectionObserverDisconnectProofs = ["browser-intersection-observer-disconnect"];
const browserNavigatorGlobalProofs = ["browser-navigator-global"];
const browserNavigatorLanguageProofs = ["browser-navigator-language"];
const browserEventReadonlyScalarProofs = ["browser-event-readonly-scalar"];
const browserMouseEventConstructorProofs = ["browser-mouseevent-constructor-literal"];
const browserKeyboardEventConstructorProofs = ["browser-keyboardevent-constructor-literal"];
const browserCustomEventConstructorProofs = ["browser-customevent-constructor-literal"];
const browserUrlConstructorProofs = ["browser-url-constructor-string"];
const browserUrlSearchParamsConstructorProofs = ["browser-urlsearchparams-constructor-lite"];
const browserUrlToStringProofs = ["browser-url-tostring"];
const browserUrlSearchParamsGetProofs = ["browser-urlsearchparams-get"];
const browserUrlSearchParamsSetProofs = ["browser-urlsearchparams-set"];
const browserUrlSearchParamsDeleteProofs = ["browser-urlsearchparams-delete"];
const browserUrlSearchParamsToStringProofs = ["browser-urlsearchparams-tostring"];

const cases = [
  {
    name: "basic",
    project: "fixtures/basic/tsconfig.json",
    expectJsx: false,
    expectAggregateOps: false,
  },
  {
    name: "aggregate",
    project: "fixtures/cheng-source-aggregate/tsconfig.json",
    expectJsx: false,
    expectAggregateOps: true,
  },
  {
    name: "object-write",
    project: "fixtures/csg-js-object-write/tsconfig.json",
    expectJsx: false,
    expectAggregateOps: true,
    expectObjectWrites: true,
  },
  {
    name: "jsx",
    project: "fixtures/cheng-source-jsx-unsupported/tsconfig.json",
    expectJsx: true,
    expectAggregateOps: false,
  },
  {
    name: "unimaker-voice-task",
    project: "tsconfig.json",
    cwd: "fixtures/csg-web-unimaker-react/UniMaker/React.js",
    expectJsx: true,
    expectAggregateOps: false,
    expectUnimakerVoiceTask: true,
    expectProjectRootSuffix: "/UniMaker/React.js",
  },
  {
    name: "non-unimaker-full-controls",
    project: "fixtures/csg-web-unimaker-voice-task/tsconfig.json",
    expectJsx: true,
    expectAggregateOps: false,
    expectNoUnimakerVoiceTaskTemplates: true,
  },
  {
    name: "missing-label-adversarial",
    project: "fixtures/csg-web-missing-label-adversarial/tsconfig.json",
    expectJsx: true,
    expectAggregateOps: false,
    expectNoComputerUseActions: true,
    expectNoUnimakerVoiceTaskTemplates: true,
  },
  {
    name: "external-capability-manifest",
    project: "fixtures/csg-web-external-capability-manifest/tsconfig.json",
    expectJsx: false,
    expectAggregateOps: false,
    expectExternalCapabilityManifest: true,
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
assertOpenRuntimeRequirementDecision("call", "Array.isArray", "ecmascript_array", "cheng-source.js-core.array-isarray-lite");
assertClosedRuntimeRequirementDecision("call", "Array.isArray", "ecmascript_array", arrayLiteProvider, arrayLiteI32IsArrayLocalProofs);
assertOpenRuntimeRequirementDecision("call", "Object.freeze", "ecmascript_object", "cheng-source.js-core.object-freeze-lite");
assertClosedRuntimeRequirementDecision("call", "Object.freeze", "ecmascript_object", arrayLiteProvider, arrayLiteI32FreezeLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Object.freeze", "ecmascript_object", arrayLiteProvider, arrayLiteJsValueFreezeFreshProofs);
assertClosedRuntimeRequirementDecision("call", "Object.freeze", "ecmascript_object", objectLiteProvider, objectLiteFreezeLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Object.freeze", "ecmascript_object", objectLiteProvider, objectJsValueFreezeFreshProofs);
assertOpenRuntimeRequirementDecision("call", "Object.isFrozen", "ecmascript_object", "cheng-source.js-core.object-isfrozen-lite");
assertClosedRuntimeRequirementDecision("call", "Object.isFrozen", "ecmascript_object", objectLiteProvider, arrayLiteI32IsFrozenLocalProofs);
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
assertOpenRuntimeRequirementDecision("await", "Promise.await", "ecmascript_promise", "cheng-source.js-core.async-sync-i32");
assertClosedRuntimeRequirementDecision("await", "Promise.await", "ecmascript_promise", promiseProvider, promiseAwaitAsyncSyncI32Proofs);
assertOpenRuntimeRequirementDecision("async_function", "main", "ecmascript_promise", "cheng-source.js-core.async-sync-i32");
assertClosedRuntimeRequirementDecision("async_function", "main", "ecmascript_promise", promiseProvider, promiseAwaitAsyncSyncI32Proofs);
assertOpenRuntimeRequirementDecision("constructor", "Error", "ecmascript_builtin", "cheng-source.js-core.error-constructor");
assertClosedRuntimeRequirementDecision("constructor", "Error", "ecmascript_builtin", errorLiteProvider, errorConstructorMessageStringProofs);
assertOpenRuntimeRequirementDecision("binary", "Error.instanceof", "ecmascript_operator", "cheng-source.js-core.error-instanceof");
assertClosedRuntimeRequirementDecision("binary", "Error.instanceof", "ecmascript_operator", errorLiteProvider, errorInstanceOfProofs);
assertOpenRuntimeRequirementDecision("call", "Array.map", "ecmascript_array", "cheng-source.js-core.array-map-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.map", "ecmascript_array", arrayLiteProvider, arrayLiteI32MapLocalProofs);
assertOpenRuntimeRequirementDecision("call", "Array.filter", "ecmascript_array", "cheng-source.js-core.array-filter-length-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.filter", "ecmascript_array", arrayLiteProvider, arrayLiteI32FilterLengthProofs);
assertOpenRuntimeRequirementDecision("call", "Array.includes", "ecmascript_array", "cheng-source.js-core.array-includes-lite-i32");
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
assertOpenRuntimeRequirementDecision("call", "Array.at", "ecmascript_array", "cheng-source.js-core.array-at-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.at", "ecmascript_array", arrayLiteProvider, arrayLiteI32AtProofs);
assertOpenRuntimeRequirementDecision("call", "Array.findIndex", "ecmascript_array", "cheng-source.js-core.array-findindex-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.findIndex", "ecmascript_array", arrayLiteProvider, arrayLiteI32FindIndexLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Array.findIndex", "ecmascript_array", arrayLiteProvider, arrayLiteJsValueObjectFindIndexScalarPropertyEqualsProofs);
assertClosedRuntimeRequirementDecision("call", "Array.findIndex", "ecmascript_array", arrayLiteProvider, arrayLiteJsValueObjectFindIndexScalarPropertyConjunctionEqualsProofs);
assertClosedRuntimeRequirementDecision("call", "Array.findIndex", "ecmascript_array", arrayLiteProvider, arrayLiteJsValueObjectFindIndexScalarPropertyDisjunctionEqualsProofs);
assertOpenRuntimeRequirementDecision("call", "Array.slice", "ecmascript_array", "cheng-source.js-core.array-slice-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.slice", "ecmascript_array", arrayLiteProvider, arrayLiteI32SliceLocalProofs);
assertOpenRuntimeRequirementDecision("call", "Array.concat", "ecmascript_array", "cheng-source.js-core.array-concat-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.concat", "ecmascript_array", arrayLiteProvider, arrayLiteI32ConcatLocalProofs);
assertOpenRuntimeRequirementDecision("call", "Array.reverse", "ecmascript_array", "cheng-source.js-core.array-reverse-lite-i32");
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
assertOpenRuntimeRequirementDecision("call", "Array.fill", "ecmascript_array", "cheng-source.js-core.array-fill-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.fill", "ecmascript_array", arrayLiteProvider, arrayLiteI32FillLocalProofs);
assertOpenRuntimeRequirementDecision("call", "Array.reduce", "ecmascript_array", "cheng-source.js-core.array-reduce-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.reduce", "ecmascript_array", arrayLiteProvider, arrayLiteI32ReduceProofs);
assertOpenRuntimeRequirementDecision("iterator_loop", "ForOfStatement", "ecmascript_iterator", "cheng-source.js-core.for-of-array-lite-i32");
assertClosedRuntimeRequirementDecision("iterator_loop", "ForOfStatement", "ecmascript_iterator", arrayLiteProvider, arrayLiteI32ForOfLocalProofs);
assertOpenRuntimeRequirementDecision("call", "Array.push", "ecmascript_array", "cheng-source.js-core.array-push-lite-i32");
assertClosedRuntimeRequirementDecision("call", "Array.push", "ecmascript_array", arrayLiteProvider, arrayLiteI32PushLocalProofs);
assertClosedRuntimeRequirementDecision("call", "Array.push", "ecmascript_array", arrayLiteProvider, arrayLiteJsValuePushLocalProofs);
assertOpenRuntimeRequirementDecision("call", "Promise.resolve", "ecmascript_promise", "cheng-source.js-core.promise-i32");
assertOpenRuntimeRequirementDecision("call", "useState", "react_type", "cheng-source.react.use-state", "node");
assertClosedRuntimeRequirementDecision("call", "useState", "react_type", reactProvider, reactUseStateProofs, "node");
assertOpenRuntimeRequirementDecision("call", "useRef", "react_type", "cheng-source.react.use-ref", "node");
assertClosedRuntimeRequirementDecision("call", "useRef", "react_type", reactProvider, reactUseRefProofs, "node");
assertOpenRuntimeRequirementDecision("call", "useCallback", "react_type", "cheng-source.react.use-callback", "node");
assertClosedRuntimeRequirementDecision("call", "useCallback", "react_type", reactProvider, reactUseCallbackProofs, "node");
assertOpenRuntimeRequirementDecision("call", "useMemo", "react_type", "cheng-source.react.hook", "node");
assertClosedRuntimeRequirementDecision("call", "useMemo", "react_type", reactProvider, reactUseMemoProofs, "node");
assertOpenRuntimeRequirementDecision("call", "useEffect", "react_type", "cheng-source.react.use-effect", "node");
assertClosedRuntimeRequirementDecision("call", "useEffect", "react_type", reactProvider, reactUseEffectProofs, "node");
assertClosedRuntimeRequirementDecision("call", "useEffect", "react_type", reactProvider, reactUseEffectCfgProofs, "node");
assertOpenRuntimeRequirementDecision("module_import", "react", "external_package", "cheng-source.node.module-import", "node");
assertClosedRuntimeRequirementDecision("module_import", "react", "external_package", reactProvider, reactModuleImportProofs, "node");
assertOpenRuntimeRequirementDecision("module_import", "react-dom/client", "external_package", "cheng-source.node.module-import", "node");
assertClosedRuntimeRequirementDecision("module_import", "react-dom/client", "external_package", reactProvider, reactModuleImportProofs, "node");
assertOpenRuntimeRequirementDecision("call", "ReactDOM.createRoot", "external_package_type", "cheng-source.react.root-render", "node");
assertOpenRuntimeRequirementDecision("call", "ReactDOM.createRoot(root).render", "external_package_type", "cheng-source.react.root-render", "node");
assertClosedExternalSymbolDecision("react", "external_package", reactProvider, "node");
assertClosedExternalSymbolDecision("react-dom/client", "external_package", reactProvider, "node");
assertOpenExternalSymbolDecision("ReactDOM.createRoot", "external_package_type", "cheng-source.react.root-render", "node");
assertOpenExternalSymbolDecision("ReactDOM.createRoot(root).render", "external_package_type", "cheng-source.react.root-render", "node");
assertOpenRuntimeRequirementDecision("global", "Map", "ecmascript_builtin", "cheng-source.js-core.namespace-proof");
assertClosedRuntimeRequirementDecision("global", "Map", "ecmascript_builtin", "cheng/core/runtime/js_runtime.scalar-lite", namespaceReferenceProofs);
assertOpenRuntimeRequirementDecision("global", "Set", "ecmascript_builtin", "cheng-source.js-core.namespace-proof");
assertClosedRuntimeRequirementDecision("global", "Set", "ecmascript_builtin", "cheng/core/runtime/js_runtime.scalar-lite", namespaceReferenceProofs);
assertOpenRuntimeRequirementDecision("constructor", "Map", "ecmascript_builtin", "cheng-source.js-core.constructor");
assertClosedRuntimeRequirementDecision("constructor", "Map", "ecmascript_builtin", objectLiteProvider, collectionConstructorEmptyProofs);
assertClosedRuntimeRequirementDecision("constructor", "Map", "ecmascript_builtin", objectLiteProvider, collectionConstructorStringI32EntryArrayProofs);
assertClosedRuntimeRequirementDecision("call", "handlers.keys", "ecmascript_lib", objectLiteProvider, collectionMapStringKeysIteratorProofs);
assertClosedRuntimeRequirementDecision("call", "handlers.values", "ecmascript_lib", objectLiteProvider, collectionMapStringValuesIteratorProofs);
assertOpenRuntimeRequirementDecision("call", "handlers.values", "ecmascript_lib", "cheng-source.js-core.collection-values");
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
assertOpenRuntimeRequirementDecision("jsx", "div", "jsx_runtime", "cheng-source.js-core.jsx");
assertClosedRuntimeRequirementDecision("jsx", "div", "jsx_runtime", reactProvider, reactHostJsxProofs);
assertOpenRuntimeRequirementDecision("global", "document", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("global", "document", "browser_global", domDocumentProvider, browserDocumentGlobalProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "document.body", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.body", "browser_global", domDocumentProvider, browserDocumentBodyProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "document.head", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.head", "browser_global", domDocumentProvider, browserDocumentHeadProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "document.documentElement", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.documentElement", "browser_global", domDocumentProvider, browserDocumentElementProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "document.hidden", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.hidden", "browser_global", domDocumentProvider, browserDocumentHiddenProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "document.visibilityState", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.visibilityState", "browser_global", domDocumentProvider, browserDocumentVisibilityStateProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "document.dataset", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.dataset", "browser_global", domDocumentProvider, browserDocumentDatasetProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.body.dataset", "browser_global", domDocumentProvider, browserDocumentDatasetProofs, "browser");
assertOpenRuntimeRequirementDecision("property_write", "document.dataset.write", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_write", "document.dataset.write", "browser_global", domDocumentProvider, browserDocumentDatasetStringWriteProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "document.style", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.style", "browser_global", domDocumentProvider, browserInlineStyleAccessProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "document.style.display", "browser_global", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("property_access", "document.style.display", "browser_global", domDocumentProvider, browserInlineStylePropertyReadProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "node.style.setProperty", "dom_lib", "cheng-source.browser.dom", "browser");
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
assertOpenRuntimeRequirementDecision("call", "node.classList.add", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "node.classList.add", "dom_lib", domDocumentProvider, browserElementClassListCallProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "node.classList.remove", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "node.classList.remove", "dom_lib", domDocumentProvider, browserElementClassListCallProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "node.classList.contains", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedRuntimeRequirementDecision("call", "node.classList.contains", "dom_lib", domDocumentProvider, browserElementClassListCallProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "node.classList.toggle", "dom_lib", "cheng-source.browser.dom", "browser");
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
assertOpenRuntimeRequirementDecision("property_access", "event.type", "dom_lib", "cheng-source.browser.dom-event", "browser");
assertClosedRuntimeRequirementDecision("property_access", "event.type", "dom_lib", domDocumentProvider, browserEventReadonlyScalarProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "event.button", "dom_lib", domDocumentProvider, browserEventReadonlyScalarProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "event.key", "dom_lib", domDocumentProvider, browserEventReadonlyScalarProofs, "browser");
assertOpenRuntimeRequirementDecision("constructor", "KeyboardEvent", "browser_global", "cheng-source.browser.dom-event", "browser");
assertClosedRuntimeRequirementDecision("constructor", "KeyboardEvent", "browser_global", domDocumentProvider, browserKeyboardEventConstructorProofs, "browser");
assertOpenRuntimeRequirementDecision("constructor", "CustomEvent", "browser_global", "cheng-source.browser.dom-event", "browser");
assertClosedRuntimeRequirementDecision("constructor", "CustomEvent", "browser_global", domDocumentProvider, browserCustomEventConstructorProofs, "browser");
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
assertOpenRuntimeRequirementDecision("call", "node.setAttribute", "dom_lib", "cheng-source.browser.dom-attribute", "browser");
assertClosedRuntimeRequirementDecision("call", "node.setAttribute", "dom_lib", domDocumentProvider, browserElementSetAttributeProofs, "browser");
assertOpenRuntimeRequirementDecision("call", "node.getAttribute", "dom_lib", "cheng-source.browser.dom-attribute", "browser");
assertClosedRuntimeRequirementDecision("call", "node.getAttribute", "dom_lib", domDocumentProvider, browserElementGetAttributeProofs, "browser");
assertClosedExternalSymbolDecision("window.addEventListener", "dom_lib", domDocumentProvider, "browser");
assertClosedExternalSymbolDecision("window.removeEventListener", "dom_lib", domDocumentProvider, "browser");
assertOpenExternalSymbolDecision("document.getElementById", "dom_lib", "cheng-source.browser.dom", "browser");
assertClosedExternalSymbolDecision("node.setAttribute", "dom_lib", domDocumentProvider, "browser");
assertClosedExternalSymbolDecision("node.getAttribute", "dom_lib", domDocumentProvider, "browser");
assertClosedExternalSymbolDecision("node.classList.add", "dom_lib", domDocumentProvider, "browser");
assertOpenExternalSymbolDecision("node.contains", "dom_lib", "cheng-source.browser.dom", "browser");
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
assertOpenRuntimeRequirementDecision("global", "navigator", "browser_global", "cheng-source.browser.navigator", "browser");
assertClosedRuntimeRequirementDecision("global", "navigator", "browser_global", navigatorProvider, browserNavigatorGlobalProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "navigator.language", "browser_global", "cheng-source.browser.navigator", "browser");
assertClosedRuntimeRequirementDecision("property_access", "navigator.language", "browser_global", navigatorProvider, browserNavigatorLanguageProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "window.location", "browser_global", "cheng-source.browser.url", "browser");
assertClosedRuntimeRequirementDecision("property_access", "window.location", "browser_global", windowProvider, browserWindowLocationProofs, "browser");
assertOpenRuntimeRequirementDecision("property_access", "window.location.href", "browser_global", "cheng-source.browser.url", "browser");
assertClosedRuntimeRequirementDecision("property_access", "window.location.href", "browser_global", windowProvider, browserWindowLocationReadonlyScalarProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "window.location.pathname", "browser_global", windowProvider, browserWindowLocationReadonlyScalarProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "window.location.search", "browser_global", windowProvider, browserWindowLocationReadonlyScalarProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "location.href", "browser_global", windowProvider, browserWindowLocationReadonlyScalarProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "window.innerWidth", "browser_global", windowProvider, browserWindowSizeProofs, "browser");
assertClosedRuntimeRequirementDecision("property_access", "window.innerHeight", "browser_global", windowProvider, browserWindowSizeProofs, "browser");
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
assertOpenRuntimeRequirementDecision("constructor", "MouseEvent", "browser_global", "cheng-source.browser.dom-event", "browser");
assertClosedRuntimeRequirementDecision("constructor", "MouseEvent", "browser_global", domDocumentProvider, browserMouseEventConstructorProofs, "browser");
assertOpenRuntimeRequirementDecision("constructor", "URL", "browser_global", "cheng-source.browser.url", "browser");
assertClosedRuntimeRequirementDecision("constructor", "URL", "browser_global", urlProvider, browserUrlConstructorProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "endpoint.toString", "dom_lib", urlProvider, browserUrlToStringProofs, "browser");
assertClosedRuntimeRequirementDecision("constructor", "URLSearchParams", "browser_global", urlProvider, browserUrlSearchParamsConstructorProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "endpoint.searchParams.get", "dom_lib", urlProvider, browserUrlSearchParamsGetProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "endpoint.searchParams.set", "dom_lib", urlProvider, browserUrlSearchParamsSetProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "endpoint.searchParams.delete", "dom_lib", urlProvider, browserUrlSearchParamsDeleteProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "endpoint.searchParams.toString", "dom_lib", urlProvider, browserUrlSearchParamsToStringProofs, "browser");
assertClosedRuntimeRequirementDecision("call", "window.setTimeout", "browser_global", scalarLiteProvider, undefined, "browser");
assertOpenRuntimeRequirementDecision("property_access", "window.electronAPI", "browser_global", "cheng-source.browser.external-host", "browser");
assertOpenRuntimeRequirementDecision("property_access", "document.agentRunning", "browser_global", "cheng-source.browser.external-host", "browser");
assertOpenRuntimeRequirementDecision("call", "fetch", "browser_global", "cheng-source.browser.web-resource", "browser");
assertClosedRuntimeRequirementDecision("property_access", "navigator.geolocation", "browser_global", navigatorProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("call", "navigator.geolocation.getCurrentPosition", "browser_global", geolocationProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("property_access", "navigator.serviceWorker", "browser_global", serviceWorkerProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("call", "navigator.serviceWorker.getRegistrations", "browser_global", serviceWorkerProvider, undefined, "browser");
assertClosedRuntimeRequirementDecision("property_access", "navigator.mediaDevices", "browser_global", navigatorProvider, undefined, "browser");
assertOpenRuntimeRequirementDecision("call", "navigator.mediaDevices.getUserMedia", "browser_global", "cheng-source.browser.web-resource", "browser");
assertClosedRuntimeRequirementDecision("property_access", "navigator.clipboard", "browser_global", navigatorProvider, undefined, "browser");
assertOpenRuntimeRequirementDecision("call", "stream.getTracks", "dom_lib", "cheng-source.browser.web-resource", "browser");

for (const item of cases) {
  const outA = join(root, `tmp/${item.name}-a.csgweb`);
  const outB = join(root, `tmp/${item.name}-b.csgweb`);
  const reportA = join(root, `tmp/${item.name}-a.web.report.json`);
  const reportB = join(root, `tmp/${item.name}-b.web.report.json`);
  mkdirSync(dirname(outA), { recursive: true });

  runCli(item.project, outA, reportA, runOptions(item));
  runCli(item.project, outB, reportB, runOptions(item));

  const textA = readFileSync(outA, "utf8");
  const textB = readFileSync(outB, "utf8");
  assert.equal(textA, textB, `${item.name} CSG-Web facts must be deterministic`);
  assert.equal(readFileSync(reportA, "utf8"), readFileSync(reportB, "utf8"), `${item.name} CSG-Web report must be deterministic`);
  assert.equal(textA.includes("__gui_"), false, "CSG-Web must not lower JSX directly to Cheng GUI calls");

  const validation = validateCsgWebText(textA);
  assert.equal(validation.ok, true, validation.diagnostics.join("\n"));

  const facts = textA.trim().split("\n").map((line) => JSON.parse(line));
  const coreObjectLiterals = facts.filter((fact) => fact.kind === "csg.op" && fact.opKind === "object_literal");
  const corePropertyReads = facts.filter((fact) => fact.kind === "csg.op" && fact.opKind === "property_read");
  const corePropertyWrites = facts.filter((fact) => fact.kind === "csg.op" && fact.opKind === "property_write");
  const coreElementReads = facts.filter((fact) => fact.kind === "csg.op" && fact.opKind === "element_read");
  const coreElementWrites = facts.filter((fact) => fact.kind === "csg.op" && fact.opKind === "element_write");
  assert.equal(facts[0].kind, "csg.web.schema");
  assert.equal(facts[0].schema, "csg-web");
  assert.ok(facts.some((fact) => fact.kind === "csg.core.schema"));
  assert.ok(facts.some((fact) => fact.kind === "csg.web.project"));
  assert.ok(facts.some((fact) => fact.kind === "csg.web.runtime_requirement"));
  if (item.expectAggregateOps) {
    assert.ok(coreObjectLiterals.length > 0, "aggregate must emit core object_literal ops");
    assert.ok(corePropertyReads.some((fact) => typeof fact.receiver === "string"));
    assert.ok(coreElementReads.some((fact) => typeof fact.receiver === "string" && typeof fact.argument === "string"));
  }
  if (item.expectObjectWrites) {
    assert.ok(corePropertyWrites.some((fact) => fact.name === "x" && typeof fact.receiver === "string" && typeof fact.value === "string"));
    assert.ok(coreElementWrites.some((fact) => typeof fact.receiver === "string" && typeof fact.argument === "string" && typeof fact.value === "string"));
  }

  const report = JSON.parse(readFileSync(reportA, "utf8"));
  assert.equal(report.schema, "csg-web.report");
  if (item.expectProjectRootSuffix) {
    assert.equal(report.projectRoot.endsWith(item.expectProjectRootSuffix), true);
  }
  assert.equal(report.runtimeIndependent, true);
  assert.equal(report.engineDependency, "none");
  assert.equal(report.complete, report.coreComplete && report.runtimeClosure.complete);
  assert.equal(report.counts.coreFacts, facts.filter((fact) => !fact.kind.startsWith("csg.web.")).length);
  assert.equal(report.counts.webFacts, facts.filter((fact) => fact.kind.startsWith("csg.web.") && fact.kind !== "csg.web.schema").length);
  assert.equal(report.counts.domNodeTemplates, facts.filter((fact) => fact.kind === "csg.web.dom_node_template").length);
  assert.equal(report.counts.jsObjectLiterals, coreObjectLiterals.length);
  assert.equal(report.counts.jsPropertyAccesses, corePropertyReads.length + corePropertyWrites.length);
  assert.equal(report.counts.jsPropertyWrites, corePropertyWrites.length);
  assert.equal(report.counts.jsElementAccesses, coreElementReads.length + coreElementWrites.length);
  assert.equal(report.counts.jsElementWrites, coreElementWrites.length);
  assert.equal(report.coreReport.counts.objectLiterals, coreObjectLiterals.length);
  assert.equal(report.coreReport.counts.propertyReads, corePropertyReads.length);
  assert.equal(report.coreReport.counts.propertyWrites, corePropertyWrites.length);
  assert.equal(report.coreReport.counts.elementReads, coreElementReads.length);
  assert.equal(report.coreReport.counts.elementWrites, coreElementWrites.length);
  assert.equal(report.counts.runtimeRequirements, report.runtimeClosure.requirementCount);
  assert.equal(typeof report.relfacts_count, "number");
  assert.equal(report.relfacts_count > 0, true);
  assert.equal(report.relfacts_diff_assert_count, 0);
  assert.equal(report.relfacts_diff_retract_count, 0);
  assert.equal(Array.isArray(report.runtime_open_requirement_top), true);
  assert.deepEqual(report.runtime_open_requirement_top, runtimeOpenRequirementTopFromClosure(report.runtimeClosure.requirements, 10));
  assert.equal(report.control_surface_action_count, facts.filter((fact) => fact.kind === "csg.web.control_surface").length);
  assert.equal(report.actionable_dom_control_count, report.control_surface_action_count + report.control_surface_skipped_unlabeled_count);
  assert.equal(
    report.control_surface_actionable_coverage_percent,
    report.actionable_dom_control_count > 0
      ? Math.trunc((report.control_surface_action_count * 100) / report.actionable_dom_control_count)
      : 0,
  );
  assert.equal(report.voice_computer_use_scenario_count, facts.filter((fact) => fact.kind === "csg.web.voice_computer_use_scenario").length);
  assert.equal(report.voice_computer_use_control_coverage_percent, report.control_surface_action_count > 0 ? 100 : 0);
  assert.equal(report.computer_use_action_count, facts.filter((fact) => fact.kind === "csg.web.computer_use_action").length);
  assert.equal(report.computer_use_action_count, report.control_surface_action_count);
  assert.equal(report.computer_use_action_coverage_percent, report.control_surface_action_count > 0 ? 100 : 0);
  assert.equal(report.computer_use_action_unresolved_count, 0);
  assert.equal(report.voice_task_template_count, facts.filter((fact) => fact.kind === "csg.web.voice_task_template").length);
  assert.equal(report.voice_task_step_count, facts.filter((fact) => fact.kind === "csg.web.voice_task_step").length);
  assert.equal(report.confirmation_gate_count, facts.filter((fact) => fact.kind === "csg.web.confirmation_gate").length);
  assert.equal(report.voice_task_required_confirmation_gate_count, facts.filter((fact) => fact.kind === "csg.web.voice_task_step" && fact.confirmationRequired === true).length);
  assert.equal(report.voice_task_required_confirmation_gate_count, report.confirmation_gate_count);
  assert.equal(typeof report.voice_task_high_risk_step_count, "number");
  assert.equal(typeof report.voice_task_missing_confirmation_gate_count, "number");
  assert.equal(typeof report.voice_task_blocked_step_count, "number");
  assert.equal(typeof report.voice_task_ambiguous_step_count, "number");
  assert.equal(typeof report.unimaker_internal_task_ready, "boolean");
  assert.equal(report.subgraph_cid_count, facts.filter((fact) => fact.kind === "csg.web.subgraph_cid").length);
  assert.equal(report.subgraph_cid_count > 0, true);
  assertRuntimeClosureProviderCounts(report.runtimeClosure);
  assertExternalCapabilityManifest(report);
  if (item.expectMixedRuntimeClosure) {
    assert.equal(report.runtimeClosure.closedRequirementCount > 0, true);
    assert.equal(report.runtimeClosure.openRequirementCount > 0, true);
  }
  if (report.runtimeClosure.openRequirementCount > 0) {
    assert.equal(report.blockedReasons.includes("cheng web runtime has open runtime requirements"), true);
  }
  if (!report.runtimeClosure.complete) {
    assert.equal(report.blockedReasons.includes("cheng web runtime is not complete"), true);
  }
  if (item.expectExternalCapabilityManifest) {
    assert.equal(report.externalCapabilityManifest.complete, false);
    assert.equal(report.externalCapabilityManifest.openCapabilityCount > 0, true);
    assert.equal(report.complete, false);
    assert.equal(report.blockedReasons.includes("surface provider has open external capabilities"), true);
    assertExternalCapabilityCandidate(report, "external-host", "cheng-source.browser.external-host", "window.electronAPI");
    assertExternalCapabilityCandidate(report, "external-host", "cheng-source.browser.external-host", "document.agentRunning");
    assertExternalCapabilityCandidate(report, "web-resource", "cheng-source.browser.web-resource", "navigator.mediaDevices.getUserMedia");
    assertExternalCapabilityCandidate(report, "web-resource", "cheng-source.browser.web-resource", "navigator.mediaDevices.getUserMedia");
    assertClosedRuntimeClosureExternalSymbol(report, "navigator.geolocation.getCurrentPosition", geolocationProvider);
    assertClosedRuntimeClosureExternalSymbol(report, "navigator.serviceWorker.getRegistrations", serviceWorkerProvider);
    assertClosedRuntimeClosureExternalSymbol(report, "fetch", domDocumentProvider);
    assertClosedRuntimeClosureExternalSymbol(report, "navigator.clipboard.writeText", domDocumentProvider);
    assertClosedRuntimeClosureExternalSymbol(report, "stream.getTracks", domDocumentProvider);
  }

  if (item.expectNoUnimakerVoiceTaskTemplates) {
    assertNoUnimakerVoiceTaskFacts(facts, report);
  }

  if (item.expectJsx) {
    assert.ok(facts.some((fact) => fact.kind === "csg.web.jsx_element"));
    const domNodeTemplate = facts.find((fact) => fact.kind === "csg.web.dom_node_template");
    assert.ok(domNodeTemplate);
    assert.equal(typeof domNodeTemplate.coreFact, "string");
    assert.equal(typeof domNodeTemplate.owner, "string");
    assert.equal(typeof domNodeTemplate.tagName, "string");
    assert.ok(domNodeTemplate.nodeKind === "element" || domNodeTemplate.nodeKind === "fragment");
    assert.equal(typeof domNodeTemplate.attributeCount, "number");
    assert.equal(typeof domNodeTemplate.childCount, "number");
    assert.equal(domNodeTemplate.runtimeTarget, "cheng-web-runtime");
    if (item.expectNoComputerUseActions) {
      assertNoComputerUseActions(facts, report);
    } else {
      assert.ok(facts.some((fact) => fact.kind === "csg.web.control_surface" && fact.actionKind === "Click"));
      assert.ok(facts.some((fact) => fact.kind === "csg.web.voice_computer_use_scenario" && fact.actionKind === "Click" && fact.scenarioKind === "voice-command"));
      assert.ok(facts.some((fact) => fact.kind === "csg.web.voice_computer_use_scenario" && fact.actionKind === "SetText" && fact.scenarioKind === "voice-dictation"));
      assert.ok(facts.some((fact) => fact.kind === "csg.web.voice_computer_use_scenario" && fact.actionKind === "Select" && fact.scenarioKind === "voice-selection"));
      assert.ok(facts.every((fact) => fact.kind !== "csg.web.voice_computer_use_scenario" || fact.visualClickFallback === false));
      assert.ok(facts.some((fact) => fact.kind === "csg.web.computer_use_action" && fact.actionKind === "Click" && fact.effectClass === "ui-event"));
      assert.ok(facts.some((fact) => fact.kind === "csg.web.computer_use_action" && fact.actionKind === "SetText" && fact.effectClass === "text-input"));
      assert.ok(facts.some((fact) => fact.kind === "csg.web.computer_use_action" && fact.actionKind === "Select" && fact.effectClass === "selection"));
      assert.ok(facts.every((fact) => fact.kind !== "csg.web.computer_use_action" || fact.visualClickFallback === false));
      assert.equal(report.voice_computer_use_scenario_count, report.control_surface_action_count);
      assert.equal(report.voice_computer_use_control_coverage_percent, 100);
      assert.equal(report.computer_use_action_count, report.control_surface_action_count);
      assert.equal(report.computer_use_action_coverage_percent, 100);
      assert.equal(report.control_surface_action_count > 0, true);
    }
    assert.ok(report.runtimeClosure.requirements.some((requirement) => requirement.domain === "react-jsx"));
    assert.ok(report.coreReport.runtimeRequirements.some((requirement) => requirement.kind === "jsx" && requirement.proofs?.includes("react-host-jsx-dom-template")));
    assert.ok(report.runtimeClosure.requirements.some((requirement) => requirement.kind === "jsx" && requirement.providerStatus === "closed" && requirement.provider === reactProvider));
    if (item.expectUnimakerVoiceTask) {
      assertUnimakerVoiceTaskFacts(facts, report);
    }
  } else {
    assert.ok(report.runtimeClosure.requirements.some((requirement) => requirement.domain === "ecmascript"));
  }
}

assertIncludeDebugMapsOption();

const duplicateTargetOut = join(root, "tmp/unimaker-duplicate-target.csgweb");
const duplicateTargetReport = join(root, "tmp/unimaker-duplicate-target.web.report.json");
const duplicateTargetFailure = runCliExpectFailure("tsconfig.json", duplicateTargetOut, duplicateTargetReport, {
  cwd: join(root, "fixtures/csg-web-unimaker-duplicate-target/UniMaker/React.js"),
});
assert.match(duplicateTargetFailure.stderr, /must resolve exactly one computer-use action, got 2/);
const duplicateTargetReportJson = JSON.parse(readFileSync(duplicateTargetReport, "utf8"));
assert.equal(duplicateTargetReportJson.projectRoot.endsWith("/UniMaker/React.js"), true);
assert.equal(duplicateTargetReportJson.voice_task_template_count, 1);
assert.equal(duplicateTargetReportJson.voice_task_step_count, 1);
assert.equal(duplicateTargetReportJson.confirmation_gate_count, 0);
assert.equal(duplicateTargetReportJson.voice_task_blocked_step_count, duplicateTargetReportJson.diagnostics.length);
assert.equal(duplicateTargetReportJson.voice_task_ambiguous_step_count, 3);
assert.equal(duplicateTargetReportJson.voice_task_missing_confirmation_gate_count, 0);
assert.equal(duplicateTargetReportJson.unimaker_internal_task_ready, false);
assert.equal(duplicateTargetReportJson.diagnostics.filter((item) => item.includes("got 2")).length, 3);

function assertNoComputerUseActions(facts, report) {
  assert.equal(facts.some((fact) => fact.kind === "csg.web.control_surface"), false);
  assert.equal(facts.some((fact) => fact.kind === "csg.web.voice_computer_use_scenario"), false);
  assert.equal(facts.some((fact) => fact.kind === "csg.web.computer_use_action"), false);
  assert.equal(report.control_surface_action_count, 0);
  assert.equal(report.voice_computer_use_scenario_count, 0);
  assert.equal(report.computer_use_action_count, 0);
  assert.equal(report.voice_computer_use_control_coverage_percent, 0);
  assert.equal(report.computer_use_action_coverage_percent, 0);
  assert.equal(report.actionable_dom_control_count > 0, true);
  assert.equal(report.control_surface_skipped_unlabeled_count, report.actionable_dom_control_count);
  assert.equal(report.control_surface_actionable_coverage_percent, 0);
  assert.equal(report.computer_use_action_unresolved_count, 0);
}

function assertNoUnimakerVoiceTaskFacts(facts, report) {
  assert.equal(facts.some((fact) => fact.kind === "csg.web.voice_task_template"), false);
  assert.equal(facts.some((fact) => fact.kind === "csg.web.voice_task_step"), false);
  assert.equal(facts.some((fact) => fact.kind === "csg.web.confirmation_gate"), false);
  assert.equal(report.voice_task_template_count, 0);
  assert.equal(report.voice_task_step_count, 0);
  assert.equal(report.confirmation_gate_count, 0);
  assert.equal(report.voice_task_high_risk_step_count, 0);
  assert.equal(report.voice_task_required_confirmation_gate_count, 0);
  assert.equal(report.voice_task_missing_confirmation_gate_count, 0);
  assert.equal(report.unimaker_internal_task_ready, false);
}

function assertIncludeDebugMapsOption() {
  const baseOptions = {
    project: join(root, "fixtures/basic/tsconfig.json"),
    rootDir: root,
    runtime: ["node", "browser"],
    emitText: false,
  };
  const withDebug = emitCsgWebFromTs(baseOptions);
  const withoutDebug = emitCsgWebFromTs({ ...baseOptions, includeDebugMaps: false });
  assert.equal(withDebug.diagnostics.length, 0, withDebug.diagnostics.join("\n"));
  assert.equal(withoutDebug.diagnostics.length, 0, withoutDebug.diagnostics.join("\n"));
  const debugMapCount = withDebug.facts.filter((fact) => fact.kind === "csg.debug_map").length;
  assert.equal(debugMapCount > 0, true, "default CSG-Web extraction must keep debug_map facts");
  assert.equal(withoutDebug.facts.some((fact) => fact.kind === "csg.debug_map"), false, "includeDebugMaps=false must skip debug_map facts at extraction");
  assert.equal(
    withoutDebug.facts.filter((fact) => fact.kind === "csg.op").length,
    withDebug.facts.filter((fact) => fact.kind === "csg.op").length,
    "debug_map stripping must not change core op coverage",
  );
  assert.equal(
    withoutDebug.report.coreReport.counts.ops,
    withDebug.report.coreReport.counts.ops,
    "debug_map stripping must not change report op counts",
  );
  assert.equal(
    withoutDebug.report.counts.coreFacts + debugMapCount,
    withDebug.report.counts.coreFacts,
    "debug_map stripping must account for only removed debug facts",
  );
}

function assertUnimakerVoiceTaskFacts(facts, report) {
  const templates = facts.filter((fact) => fact.kind === "csg.web.voice_task_template");
  const steps = facts.filter((fact) => fact.kind === "csg.web.voice_task_step");
  const gates = facts.filter((fact) => fact.kind === "csg.web.confirmation_gate");
  const actions = facts.filter((fact) => fact.kind === "csg.web.computer_use_action");
  assert.equal(report.unimaker_internal_task_ready, true);
  assert.equal(report.voice_task_template_count, 8);
  assert.equal(report.confirmation_gate_count, 0);
  assert.equal(gates.length, 0);
  assert.equal(report.voice_task_high_risk_step_count, 4);
  assert.equal(report.voice_task_required_confirmation_gate_count, 0);
  assert.equal(report.voice_task_missing_confirmation_gate_count, 0);
  assert.equal(report.voice_task_blocked_step_count, 0);
  assert.equal(report.voice_task_ambiguous_step_count, 0);
  assert.equal(steps.filter((step) => step.effectClass === "payment" || step.effectClass === "external-publish" || step.effectClass === "destructive").length, 4);
  assert.deepEqual(
    templates.map((fact) => fact.templateId).sort(),
    ["authorized_product_publish_draft", "content_like_review", "content_search_review", "feed_filter_review", "message_history_browse_review", "publish_ad_video_draft", "publish_short_video_draft", "purchase_assist_review"],
  );
  assert.equal(steps.length, report.voice_task_step_count);
  assert.equal(steps.length, templates.reduce((count, template) => count + template.stepIds.length, 0));
  for (const template of templates) {
    assert.equal(
      template.riskPolicy.startsWith("confirmation-required-for-") ||
        template.riskPolicy === "unimaker-internal-search-only" ||
        template.riskPolicy === "ai-mode-auto-run-no-confirmation",
      true,
    );
    for (const stepId of template.stepIds) {
      assert.equal(steps.some((step) => step.id === stepId && step.templateId === template.templateId), true);
    }
  }
  for (const step of steps) {
    const matchingActions = actions.filter((action) =>
      action.id === step.computerUseAction &&
      action.semanticId === step.semanticId &&
      action.actionKind === step.targetActionKind &&
      action.role === step.targetRole &&
      action.label === step.targetLabel
    );
    assert.equal(matchingActions.length, 1);
    if (step.effectClass === "external-publish" || step.effectClass === "payment" || step.effectClass === "destructive") {
      assert.equal(step.confirmationRequired, false);
      assert.equal(step.blockedUntilConfirmed, false);
      assert.equal(step.confirmationMode, "");
      assert.equal(step.confirmationGateId, "");
    }
  }
  assert.equal(steps.some((step) => step.targetActionKind === "SelectFile" && step.payloadBinding === "videoFile"), true);
  assert.equal(steps.some((step) => step.targetActionKind === "SelectFile" && step.payloadBinding === "adVideoFile"), true);
  assert.equal(steps.some((step) => step.effectClass === "payment" && step.confirmationRequired === false), true);
  assert.equal(steps.some((step) => step.effectClass === "external-publish" && step.confirmationRequired === false), true);
  assert.equal(steps.some((step) => step.templateId === "content_like_review" && step.targetActionKind === "Click" && step.effectClass === "ui-event"), true);
  assert.equal(steps.some((step) => step.templateId === "message_history_browse_review" && step.targetActionKind === "Route" && step.effectClass === "navigation"), true);
  assert.equal(steps.some((step) => step.templateId === "message_history_browse_review" && step.targetActionKind === "Scroll" && step.effectClass === "scroll"), true);
  assert.equal(actions.some((action) => action.actionKind === "Route" && action.routeTarget === "messages"), true);
  assert.equal(actions.some((action) => action.actionKind === "Scroll" && action.role === "scroll-region"), true);
}

const lengthProofOut = join(root, "tmp/array-length-static-proof-gate-a.csgweb");
const lengthProofReport = join(root, "tmp/array-length-static-proof-gate-a.web.report.json");
runCli("fixtures/csg-array-length-static-proof-gate/tsconfig.json", lengthProofOut, lengthProofReport);
const lengthProofWebReport = JSON.parse(readFileSync(lengthProofReport, "utf8"));
assert.ok(lengthProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.length" && item.proofs?.includes("array-lite-i32-fixed")));
assert.ok(lengthProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.length" && item.proofs?.includes("array-lite-static-length")));
assert.ok(lengthProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.length" && item.proofs?.includes("array-lite-i32-local")));
assert.ok(lengthProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.from" && item.proofs?.includes("array-lite-jsvalue-from-length")));
assert.ok(lengthProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.from" && !item.proofs?.length));
assertClosedRuntimeClosureRequirement(lengthProofWebReport.runtimeClosure, "Array.length", arrayLiteProvider);
assert.ok(lengthProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.equal(lengthProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(lengthProofWebReport.runtimeClosure);

const typeOnlyRuntimeOut = join(root, "tmp/type-only-runtime-ignored-a.csgweb");
const typeOnlyRuntimeReport = join(root, "tmp/type-only-runtime-ignored-a.web.report.json");
runCli("fixtures/csg-type-only-runtime-ignored/tsconfig.json", typeOnlyRuntimeOut, typeOnlyRuntimeReport);
const typeOnlyRuntimeWebReport = JSON.parse(readFileSync(typeOnlyRuntimeReport, "utf8"));
assert.equal(typeOnlyRuntimeWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Promise"), false);
assert.equal(typeOnlyRuntimeWebReport.coreReport.runtimeRequirements.some((item) => item.name === "node:fs"), false);
assert.ok(typeOnlyRuntimeWebReport.coreReport.runtimeRequirements.some((item) => item.name === "String.length" && item.proofs?.includes("string-ascii-literal")));
assertClosedRuntimeClosureRequirement(typeOnlyRuntimeWebReport.runtimeClosure, "String.length", stringLiteProvider);
assertRuntimeClosureProviderCounts(typeOnlyRuntimeWebReport.runtimeClosure);

const stringConvertLengthProofOut = join(root, "tmp/string-convert-length-proof-gate-a.csgweb");
const stringConvertLengthProofReport = join(root, "tmp/string-convert-length-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-string-convert-length/tsconfig.json", stringConvertLengthProofOut, stringConvertLengthProofReport);
const stringConvertLengthProofWebReport = JSON.parse(readFileSync(stringConvertLengthProofReport, "utf8"));
assert.ok(stringConvertLengthProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "String" && item.proofs?.includes("string-convert-scalar")));
assert.ok(stringConvertLengthProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "String.length" && item.proofs?.includes("string-scalar-length")));
assertClosedRuntimeClosureRequirement(stringConvertLengthProofWebReport.runtimeClosure, "String", stringLiteProvider);
assertClosedRuntimeClosureRequirement(stringConvertLengthProofWebReport.runtimeClosure, "String.length", stringLiteProvider);
assertRuntimeClosureProviderCounts(stringConvertLengthProofWebReport.runtimeClosure);

const stringConvertScalarProofOut = join(root, "tmp/string-convert-scalar-proof-gate-a.csgweb");
const stringConvertScalarProofReport = join(root, "tmp/string-convert-scalar-proof-gate-a.web.report.json");
runCli("fixtures/csg-string-convert-scalar/tsconfig.json", stringConvertScalarProofOut, stringConvertScalarProofReport);
const stringConvertScalarProofWebReport = JSON.parse(readFileSync(stringConvertScalarProofReport, "utf8"));
assert.equal(
  stringConvertScalarProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "String").every((item) => item.proofs?.includes("string-convert-scalar")),
  true,
);
assert.equal(
  stringConvertScalarProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "String.length").every((item) => item.proofs?.includes("string-runtime-length")),
  true,
);
assertClosedRuntimeClosureRequirement(stringConvertScalarProofWebReport.runtimeClosure, "String", stringLiteProvider);
assertClosedRuntimeClosureRequirement(stringConvertScalarProofWebReport.runtimeClosure, "String.length", stringLiteProvider);
assertRuntimeClosureProviderCounts(stringConvertScalarProofWebReport.runtimeClosure);

const stringConvertScalarNegativeOut = join(root, "tmp/string-convert-scalar-negative-gate-a.csgweb");
const stringConvertScalarNegativeReport = join(root, "tmp/string-convert-scalar-negative-gate-a.web.report.json");
runCli("fixtures/csg-string-convert-scalar-negative/tsconfig.json", stringConvertScalarNegativeOut, stringConvertScalarNegativeReport);
const stringConvertScalarNegativeWebReport = JSON.parse(readFileSync(stringConvertScalarNegativeReport, "utf8"));
const stringConvertScalarNegativeRequirements = stringConvertScalarNegativeWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "String");
assert.equal(stringConvertScalarNegativeRequirements.length, 4);
assert.equal(
  stringConvertScalarNegativeRequirements.every((item) => !item.proofs?.includes("string-convert-scalar")),
  true,
);
assert.equal(stringConvertScalarNegativeWebReport.runtimeClosure.requirements.every((item) =>
  item.name !== "String" || (item.providerStatus === "closed" && item.provider === stringLiteProvider)
), true);
assertRuntimeClosureProviderCounts(stringConvertScalarNegativeWebReport.runtimeClosure);

const stringMethodRuntimeProofOut = join(root, "tmp/string-method-runtime-proof-gate-a.csgweb");
const stringMethodRuntimeProofReport = join(root, "tmp/string-method-runtime-proof-gate-a.web.report.json");
runCli("fixtures/csg-string-method-runtime/tsconfig.json", stringMethodRuntimeProofOut, stringMethodRuntimeProofReport);
const stringMethodRuntimeProofWebReport = JSON.parse(readFileSync(stringMethodRuntimeProofReport, "utf8"));
for (const name of ["String.slice", "String.replace", "String.split", "String.padStart", "String.repeat", "String.charCodeAt", "String.includes"]) {
  assert.ok(stringMethodRuntimeProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === name && item.proofs?.includes("string-type-method")), `${name} must carry string-type-method`);
  assertClosedRuntimeClosureRequirement(stringMethodRuntimeProofWebReport.runtimeClosure, name, stringLiteProvider);
}
for (const name of ["String.indexOf", "String.lastIndexOf", "String.startsWith"]) {
  assert.ok(stringMethodRuntimeProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === name && item.proofs?.includes("string-type-method")), `${name} position overload must carry string-type-method`);
  assertClosedRuntimeClosureRequirement(stringMethodRuntimeProofWebReport.runtimeClosure, name, stringLiteProvider);
}
assert.ok(stringMethodRuntimeProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "String.endsWith" && !item.proofs?.length), "String.endsWith position overload must remain open");
assert.ok(stringMethodRuntimeProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "String.replace" && item.proofs?.includes("string-regex-literal-replace")), "literal regex String.replace must be closed");
assert.equal(stringMethodRuntimeProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "String.replace" && item.proofs?.includes("string-regex-ascii-class-replace")).length, 2);
assert.ok(stringMethodRuntimeProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "String.replace" && !item.proofs?.length), "complex regex String.replace must remain open");
assert.ok(stringMethodRuntimeProofWebReport.runtimeClosure.requirements.some((item) => item.name === "String.replace" && item.providerStatus === "closed" && item.provider === stringLiteProvider));
assert.equal(stringMethodRuntimeProofWebReport.runtimeClosure.requirements.some((item) => item.name === "String.replace" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(stringMethodRuntimeProofWebReport.runtimeClosure);

const stringReplaceAffixProofOut = join(root, "tmp/string-replace-affix-proof-gate-a.csgweb");
const stringReplaceAffixProofReport = join(root, "tmp/string-replace-affix-proof-gate-a.web.report.json");
runCli("fixtures/csg-string-replace-affix-proof-gate/tsconfig.json", stringReplaceAffixProofOut, stringReplaceAffixProofReport);
const stringReplaceAffixProofWebReport = JSON.parse(readFileSync(stringReplaceAffixProofReport, "utf8"));
const stringReplaceAffixRequirements = stringReplaceAffixProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "String.replace");
assert.equal(stringReplaceAffixRequirements.filter((item) => item.proofs?.includes("string-regex-literal-affix-replace")).length, 6);
assert.equal(stringReplaceAffixRequirements.filter((item) => item.proofs?.includes("string-regex-ascii-class-replace")).length, 1);
assert.equal(stringReplaceAffixRequirements.filter((item) => !item.proofs?.length).length, 7);
assert.ok(stringReplaceAffixProofWebReport.runtimeClosure.requirements.some((item) => item.name === "String.replace" && item.providerStatus === "closed" && item.provider === stringLiteProvider));
assert.equal(stringReplaceAffixProofWebReport.runtimeClosure.requirements.some((item) => item.name === "String.replace" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(stringReplaceAffixProofWebReport.runtimeClosure);

const stringRegexLineSplitProofOut = join(root, "tmp/string-regex-line-split-proof-gate-a.csgweb");
const stringRegexLineSplitProofReport = join(root, "tmp/string-regex-line-split-proof-gate-a.web.report.json");
runCli("fixtures/csg-string-regex-line-split-proof-gate/tsconfig.json", stringRegexLineSplitProofOut, stringRegexLineSplitProofReport);
const stringRegexLineSplitProofWebReport = JSON.parse(readFileSync(stringRegexLineSplitProofReport, "utf8"));
const stringRegexLineSplitRequirements = stringRegexLineSplitProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "String.split");
assert.equal(stringRegexLineSplitRequirements.filter((item) => item.proofs?.includes("string-regex-line-split")).length, 2);
assert.equal(stringRegexLineSplitRequirements.filter((item) => item.proofs?.includes("string-regex-ascii-class-split")).length, 2);
assert.equal(stringRegexLineSplitRequirements.filter((item) => !item.proofs?.length).length, 2);
assert.ok(stringRegexLineSplitRequirements.some((item) => item.proofs?.includes("string-type-method")));
assert.ok(stringRegexLineSplitProofWebReport.runtimeClosure.requirements.some((item) => item.name === "String.split" && item.providerStatus === "closed" && item.provider === stringLiteProvider));
assert.equal(stringRegexLineSplitProofWebReport.runtimeClosure.requirements.some((item) => item.name === "String.split" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(stringRegexLineSplitProofWebReport.runtimeClosure);

const errorConstructorProofOut = join(root, "tmp/error-constructor-proof-gate-a.csgweb");
const errorConstructorProofReport = join(root, "tmp/error-constructor-proof-gate-a.web.report.json");
runCli("fixtures/csg-error-constructor/tsconfig.json", errorConstructorProofOut, errorConstructorProofReport);
const errorConstructorProofWebReport = JSON.parse(readFileSync(errorConstructorProofReport, "utf8"));
assert.ok(errorConstructorProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Error" && item.proofs?.includes("error-constructor-message-string")));
assert.ok(errorConstructorProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Error" && item.kind === "global" && item.proofs?.includes("namespace-reference")));
assert.ok(errorConstructorProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Error.instanceof" && item.proofs?.includes("error-instanceof")));
assertClosedRuntimeClosureRequirement(errorConstructorProofWebReport.runtimeClosure, "Error", errorLiteProvider);
assertClosedRuntimeClosureRequirement(errorConstructorProofWebReport.runtimeClosure, "Error.instanceof", errorLiteProvider);
assertRuntimeClosureProviderCounts(errorConstructorProofWebReport.runtimeClosure);

const pushProofOut = join(root, "tmp/array-push-proof-gate-a.csgweb");
const pushProofReport = join(root, "tmp/array-push-proof-gate-a.web.report.json");
runCli("fixtures/csg-array-push-proof-gate/tsconfig.json", pushProofOut, pushProofReport);
const pushProofWebReport = JSON.parse(readFileSync(pushProofReport, "utf8"));
assert.ok(pushProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.push" && item.proofs?.includes("array-lite-i32-push-local")));
assertClosedRuntimeClosureRequirement(pushProofWebReport.runtimeClosure, "Array.push", arrayLiteProvider);
assertRuntimeClosureProviderCounts(pushProofWebReport.runtimeClosure);

const mapProofOut = join(root, "tmp/array-map-proof-gate-a.csgweb");
const mapProofReport = join(root, "tmp/array-map-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-array-map/tsconfig.json", mapProofOut, mapProofReport);
const mapProofWebReport = JSON.parse(readFileSync(mapProofReport, "utf8"));
assert.ok(mapProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.map" && item.proofs?.includes("array-lite-i32-map-local")));
assertClosedRuntimeClosureRequirement(mapProofWebReport.runtimeClosure, "Array.map", arrayLiteProvider);
assertRuntimeClosureProviderCounts(mapProofWebReport.runtimeClosure);

const filterProofOut = join(root, "tmp/array-filter-length-proof-gate-a.csgweb");
const filterProofReport = join(root, "tmp/array-filter-length-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-array-filter-length/tsconfig.json", filterProofOut, filterProofReport);
const filterProofWebReport = JSON.parse(readFileSync(filterProofReport, "utf8"));
assert.ok(filterProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.filter" && item.proofs?.includes("array-lite-i32-filter-length")));
assertClosedRuntimeClosureRequirement(filterProofWebReport.runtimeClosure, "Array.filter", arrayLiteProvider);
assertRuntimeClosureProviderCounts(filterProofWebReport.runtimeClosure);

const includesProofOut = join(root, "tmp/array-includes-proof-gate-a.csgweb");
const includesProofReport = join(root, "tmp/array-includes-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-array-includes/tsconfig.json", includesProofOut, includesProofReport);
const includesProofWebReport = JSON.parse(readFileSync(includesProofReport, "utf8"));
assert.ok(includesProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.includes" && item.proofs?.includes("array-lite-i32-includes")));
assertClosedRuntimeClosureRequirement(includesProofWebReport.runtimeClosure, "Array.includes", arrayLiteProvider);
assertRuntimeClosureProviderCounts(includesProofWebReport.runtimeClosure);

const stringIncludesProofOut = join(root, "tmp/array-string-includes-proof-gate-a.csgweb");
const stringIncludesProofReport = join(root, "tmp/array-string-includes-proof-gate-a.web.report.json");
runCli("fixtures/csg-array-string-includes-proof-gate/tsconfig.json", stringIncludesProofOut, stringIncludesProofReport);
const stringIncludesProofWebReport = JSON.parse(readFileSync(stringIncludesProofReport, "utf8"));
assert.ok(stringIncludesProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.includes" && item.proofs?.includes("array-lite-const-string-includes")));
assert.ok(stringIncludesProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-const-string-some-endswith")));
assert.equal(stringIncludesProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-string-some-item-string-method")).length, 3);
assert.equal(stringIncludesProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-const-string-some-haystack-string-method")).length, 2);
assertClosedRuntimeClosureRequirement(stringIncludesProofWebReport.runtimeClosure, "Array.includes", arrayLiteProvider);
assert.ok(stringIncludesProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.some" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.equal(stringIncludesProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.some" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(stringIncludesProofWebReport.runtimeClosure);

const objectSomeEqualsProofOut = join(root, "tmp/array-some-object-equals-proof-gate-a.csgweb");
const objectSomeEqualsProofReport = join(root, "tmp/array-some-object-equals-proof-gate-a.web.report.json");
runCli("fixtures/csg-array-some-object-equals-proof-gate/tsconfig.json", objectSomeEqualsProofOut, objectSomeEqualsProofReport);
const objectSomeEqualsProofWebReport = JSON.parse(readFileSync(objectSomeEqualsProofReport, "utf8"));
assert.equal(objectSomeEqualsProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-jsvalue-object-some-scalar-property-equals")).length, 6);
assert.equal(objectSomeEqualsProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-jsvalue-object-some-scalar-property-conjunction-equals")).length, 5);
assert.equal(objectSomeEqualsProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.some" && !item.proofs?.length).length, 14);
assert.ok(objectSomeEqualsProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.some" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.equal(objectSomeEqualsProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.some" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(objectSomeEqualsProofWebReport.runtimeClosure);

const indexOfProofOut = join(root, "tmp/array-indexof-proof-gate-a.csgweb");
const indexOfProofReport = join(root, "tmp/array-indexof-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-array-indexof/tsconfig.json", indexOfProofOut, indexOfProofReport);
const indexOfProofWebReport = JSON.parse(readFileSync(indexOfProofReport, "utf8"));
assert.ok(indexOfProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.indexOf" && item.proofs?.includes("array-lite-i32-indexof-local")));
assert.ok(indexOfProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.lastIndexOf" && item.proofs?.includes("array-lite-i32-indexof-local")));
assertClosedRuntimeClosureRequirement(indexOfProofWebReport.runtimeClosure, "Array.indexOf", arrayLiteProvider);
assertClosedRuntimeClosureRequirement(indexOfProofWebReport.runtimeClosure, "Array.lastIndexOf", arrayLiteProvider);
assertRuntimeClosureProviderCounts(indexOfProofWebReport.runtimeClosure);

const stringIndexOfProofOut = join(root, "tmp/array-string-indexof-proof-gate-a.csgweb");
const stringIndexOfProofReport = join(root, "tmp/array-string-indexof-proof-gate-a.web.report.json");
runCli("fixtures/csg-array-string-indexof-proof-gate/tsconfig.json", stringIndexOfProofOut, stringIndexOfProofReport);
const stringIndexOfProofWebReport = JSON.parse(readFileSync(stringIndexOfProofReport, "utf8"));
assert.equal(stringIndexOfProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.indexOf" &&
  item.proofs?.includes("array-lite-string-indexof")
).length, 5);
assert.equal(stringIndexOfProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.indexOf" &&
  !item.proofs?.length
).length, 4);
assert.ok(stringIndexOfProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.indexOf" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.equal(stringIndexOfProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.indexOf" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(stringIndexOfProofWebReport.runtimeClosure);

const predicateProofOut = join(root, "tmp/array-predicate-proof-gate-a.csgweb");
const predicateProofReport = join(root, "tmp/array-predicate-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-array-predicate/tsconfig.json", predicateProofOut, predicateProofReport);
const predicateProofWebReport = JSON.parse(readFileSync(predicateProofReport, "utf8"));
assert.ok(predicateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-i32-predicate")));
assert.ok(predicateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.every" && item.proofs?.includes("array-lite-i32-predicate")));
assert.ok(predicateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-jsvalue-predicate-truthy")));
assert.ok(predicateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.every" && item.proofs?.includes("array-lite-jsvalue-predicate-truthy")));
assert.ok(predicateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.some" && item.proofs?.includes("array-lite-jsvalue-callback-predicate")));
assertClosedRuntimeClosureRequirement(predicateProofWebReport.runtimeClosure, "Array.some", arrayLiteProvider);
assertClosedRuntimeClosureRequirement(predicateProofWebReport.runtimeClosure, "Array.every", arrayLiteProvider);
assertRuntimeClosureProviderCounts(predicateProofWebReport.runtimeClosure);

const atProofOut = join(root, "tmp/array-at-proof-gate-a.csgweb");
const atProofReport = join(root, "tmp/array-at-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-array-at/tsconfig.json", atProofOut, atProofReport);
const atProofWebReport = JSON.parse(readFileSync(atProofReport, "utf8"));
assert.ok(atProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.at" && item.proofs?.includes("array-lite-i32-at")));
assertClosedRuntimeClosureRequirement(atProofWebReport.runtimeClosure, "Array.at", arrayLiteProvider);
assertRuntimeClosureProviderCounts(atProofWebReport.runtimeClosure);

const findIndexProofOut = join(root, "tmp/array-findindex-proof-gate-a.csgweb");
const findIndexProofReport = join(root, "tmp/array-findindex-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-array-findindex/tsconfig.json", findIndexProofOut, findIndexProofReport);
const findIndexProofWebReport = JSON.parse(readFileSync(findIndexProofReport, "utf8"));
assert.ok(findIndexProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.findIndex" && item.proofs?.includes("array-lite-i32-findindex-local")));
assertClosedRuntimeClosureRequirement(findIndexProofWebReport.runtimeClosure, "Array.findIndex", arrayLiteProvider);
assertRuntimeClosureProviderCounts(findIndexProofWebReport.runtimeClosure);

const objectFindIndexProofOut = join(root, "tmp/array-findindex-object-equals-proof-gate-a.csgweb");
const objectFindIndexProofReport = join(root, "tmp/array-findindex-object-equals-proof-gate-a.web.report.json");
runCli("fixtures/csg-array-findindex-object-equals-proof-gate/tsconfig.json", objectFindIndexProofOut, objectFindIndexProofReport);
const objectFindIndexProofWebReport = JSON.parse(readFileSync(objectFindIndexProofReport, "utf8"));
assert.equal(objectFindIndexProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.findIndex" && item.proofs?.includes("array-lite-jsvalue-object-findindex-scalar-property-equals")).length, 4);
assert.equal(objectFindIndexProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.findIndex" && item.proofs?.includes("array-lite-jsvalue-object-findindex-scalar-property-conjunction-equals")).length, 5);
assert.equal(objectFindIndexProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.findIndex" && item.proofs?.includes("array-lite-jsvalue-object-findindex-scalar-property-disjunction-equals")).length, 1);
assert.equal(objectFindIndexProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.findIndex" && !item.proofs?.length).length, 11);
assert.ok(objectFindIndexProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.findIndex" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.equal(objectFindIndexProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.findIndex" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(objectFindIndexProofWebReport.runtimeClosure);

const sliceProofOut = join(root, "tmp/array-slice-proof-gate-a.csgweb");
const sliceProofReport = join(root, "tmp/array-slice-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-array-slice/tsconfig.json", sliceProofOut, sliceProofReport);
const sliceProofWebReport = JSON.parse(readFileSync(sliceProofReport, "utf8"));
assert.ok(sliceProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.slice" && item.proofs?.includes("array-lite-i32-slice-local")));
assertClosedRuntimeClosureRequirement(sliceProofWebReport.runtimeClosure, "Array.slice", arrayLiteProvider);
assertRuntimeClosureProviderCounts(sliceProofWebReport.runtimeClosure);

const concatProofOut = join(root, "tmp/array-concat-proof-gate-a.csgweb");
const concatProofReport = join(root, "tmp/array-concat-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-array-concat/tsconfig.json", concatProofOut, concatProofReport);
const concatProofWebReport = JSON.parse(readFileSync(concatProofReport, "utf8"));
assert.ok(concatProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.concat" && item.proofs?.includes("array-lite-i32-concat-local")));
assertClosedRuntimeClosureRequirement(concatProofWebReport.runtimeClosure, "Array.concat", arrayLiteProvider);
assertRuntimeClosureProviderCounts(concatProofWebReport.runtimeClosure);

const reverseProofOut = join(root, "tmp/array-reverse-proof-gate-a.csgweb");
const reverseProofReport = join(root, "tmp/array-reverse-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-array-reverse/tsconfig.json", reverseProofOut, reverseProofReport);
const reverseProofWebReport = JSON.parse(readFileSync(reverseProofReport, "utf8"));
assert.ok(reverseProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.reverse" && item.proofs?.includes("array-lite-i32-reverse-local")));
assertClosedRuntimeClosureRequirement(reverseProofWebReport.runtimeClosure, "Array.reverse", arrayLiteProvider);
assertRuntimeClosureProviderCounts(reverseProofWebReport.runtimeClosure);

const sortProofOut = join(root, "tmp/array-sort-proof-gate-a.csgweb");
const sortProofReport = join(root, "tmp/array-sort-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-array-sort/tsconfig.json", sortProofOut, sortProofReport);
const sortProofWebReport = JSON.parse(readFileSync(sortProofReport, "utf8"));
assert.ok(sortProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.sort" && item.proofs?.includes("array-lite-i32-sort-local")));
assertClosedRuntimeClosureRequirement(sortProofWebReport.runtimeClosure, "Array.sort", arrayLiteProvider);
assertRuntimeClosureProviderCounts(sortProofWebReport.runtimeClosure);

const inlineSortProofOut = join(root, "tmp/array-inline-sort-proof-gate-a.csgweb");
const inlineSortProofReport = join(root, "tmp/array-inline-sort-proof-gate-a.web.report.json");
runCli("fixtures/csg-array-inline-sort-proof-gate/tsconfig.json", inlineSortProofOut, inlineSortProofReport);
const inlineSortProofWebReport = JSON.parse(readFileSync(inlineSortProofReport, "utf8"));
const inlineSortProofWebRequirements = inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "Array.sort");
function assertInlineSortWebLine(line, expectedProof) {
  const item = inlineSortProofWebRequirements.find((candidate) => candidate.loc?.line === line);
  assert.ok(item, `missing Array.sort requirement at line ${line}`);
  if (expectedProof) {
    assert.ok(item.proofs?.includes(expectedProof), `missing ${expectedProof} at line ${line}`);
  } else {
    assert.ok(!item.proofs?.length, `unexpected Array.sort proof at line ${line}: ${(item.proofs ?? []).join(",")}`);
  }
}
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-i32-inline-diff-sort")
).length, 1);
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-i32-inline-diff-desc-sort")
).length, 1);
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-object-i32-key-inline-diff-sort")
).length, 1);
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-object-i32-key-inline-diff-desc-sort")
).length, 1);
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-object-optional-i32-key-nullish-zero-inline-diff-desc-sort")
).length, 1);
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-object-optional-i32-key-nullish-zero-inline-diff-sort")
).length, 1);
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-object-optional-i32-key-logical-or-zero-inline-diff-desc-sort")
).length, 1);
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-object-optional-i32-key-logical-or-zero-inline-diff-sort")
).length, 1);
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-array-i32-index-inline-diff-sort")
).length, 2);
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-array-i32-index-inline-diff-desc-sort")
).length, 1);
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-array-optional-i32-index-nullish-zero-inline-diff-sort")
).length, 1);
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-array-optional-i32-index-nullish-zero-inline-diff-desc-sort")
).length, 1);
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-array-optional-i32-index-logical-or-zero-inline-diff-sort")
).length, 1);
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-array-optional-i32-index-logical-or-zero-inline-diff-desc-sort")
).length, 1);
assert.equal(inlineSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  !item.proofs?.length
).length, 12);
assertInlineSortWebLine(49, "array-lite-array-i32-index-inline-diff-sort");
assertInlineSortWebLine(59, "array-lite-array-i32-index-inline-diff-desc-sort");
assertInlineSortWebLine(70, "array-lite-object-optional-i32-key-nullish-zero-inline-diff-desc-sort");
assertInlineSortWebLine(81, "array-lite-object-optional-i32-key-nullish-zero-inline-diff-sort");
assertInlineSortWebLine(93, "array-lite-array-optional-i32-index-nullish-zero-inline-diff-sort");
assertInlineSortWebLine(105, "array-lite-array-optional-i32-index-nullish-zero-inline-diff-desc-sort");
assertInlineSortWebLine(116, "array-lite-object-optional-i32-key-logical-or-zero-inline-diff-desc-sort");
assertInlineSortWebLine(127, "array-lite-object-optional-i32-key-logical-or-zero-inline-diff-sort");
assertInlineSortWebLine(139, "array-lite-array-optional-i32-index-logical-or-zero-inline-diff-sort");
assertInlineSortWebLine(151, "array-lite-array-optional-i32-index-logical-or-zero-inline-diff-desc-sort");
for (const line of [160, 169, 182, 191, 200, 209, 218, 229, 238, 247, 256, 265]) {
  assertInlineSortWebLine(line, undefined);
}
assert.ok(inlineSortProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.sort" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.equal(inlineSortProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.sort" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(inlineSortProofWebReport.runtimeClosure);

const stringSortProofOut = join(root, "tmp/array-string-sort-proof-gate-a.csgweb");
const stringSortProofReport = join(root, "tmp/array-string-sort-proof-gate-a.web.report.json");
runCli("fixtures/csg-array-string-sort-proof-gate/tsconfig.json", stringSortProofOut, stringSortProofReport);
const stringSortProofWebReport = JSON.parse(readFileSync(stringSortProofReport, "utf8"));
const stringSortClosedRequirements = stringSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-string-default-sort")
);
assert.equal(stringSortClosedRequirements.length, 5);
assert.ok(stringSortProofWebReport.coreReport.runtimeRequirements.some((item) =>
  item.name === "Array.sort" &&
  item.loc?.line === 62 &&
  !item.proofs?.length
));
assert.equal(stringSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.keys" &&
  item.proofs?.includes("object-jsvalue-keys-array")
).length, 1);
assert.equal(stringSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-object-keys-default-sort")
).length, 1);
const stringSortMapKeysRequirements = stringSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.sort" &&
  item.proofs?.includes("array-lite-string-map-keys-default-sort")
);
assert.equal(stringSortMapKeysRequirements.length, 2);
assert.equal(stringSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  item.proofs?.includes("array-lite-string-map-keys-from")
).length, 1);
assert.equal(stringSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.kind === "spread" &&
  item.proofs?.includes("array-lite-string-map-keys-spread")
).length, 2);
assert.equal(stringSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.kind === "constructor" &&
  item.name === "Map" &&
  item.proofs?.includes("collection-constructor-string-i32-entry-array")
).length, 3);
assert.ok(stringSortProofWebReport.coreReport.runtimeRequirements.some((item) =>
  item.kind === "constructor" &&
  item.name === "Map" &&
  !item.proofs?.length
));
assert.equal(stringSortProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name.endsWith(".keys") &&
  item.proofs?.includes("collection-map-string-keys-iterator")
).length, 3);
assert.ok(stringSortProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.sort" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.equal(stringSortProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.sort" && item.providerStatus === "open"), false);
assert.ok(stringSortProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Object.keys" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.ok(stringSortProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.ok(stringSortProofWebReport.runtimeClosure.requirements.some((item) => item.kind === "constructor" && item.name === "Map" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.equal(stringSortProofWebReport.runtimeClosure.requirements.some((item) => item.kind === "constructor" && item.name === "Map" && item.providerStatus === "open"), false);
assert.ok(stringSortProofWebReport.runtimeClosure.requirements.some((item) => item.kind === "spread" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assertRuntimeClosureProviderCounts(stringSortProofWebReport.runtimeClosure);

const fillProofOut = join(root, "tmp/array-fill-proof-gate-a.csgweb");
const fillProofReport = join(root, "tmp/array-fill-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-array-fill/tsconfig.json", fillProofOut, fillProofReport);
const fillProofWebReport = JSON.parse(readFileSync(fillProofReport, "utf8"));
assert.ok(fillProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.fill" && item.proofs?.includes("array-lite-i32-fill-local")));
assertClosedRuntimeClosureRequirement(fillProofWebReport.runtimeClosure, "Array.fill", arrayLiteProvider);
assertRuntimeClosureProviderCounts(fillProofWebReport.runtimeClosure);

const reduceProofOut = join(root, "tmp/array-reduce-proof-gate-a.csgweb");
const reduceProofReport = join(root, "tmp/array-reduce-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-array-reduce/tsconfig.json", reduceProofOut, reduceProofReport);
const reduceProofWebReport = JSON.parse(readFileSync(reduceProofReport, "utf8"));
assert.ok(reduceProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.reduce" && item.proofs?.includes("array-lite-i32-reduce")));
assertClosedRuntimeClosureRequirement(reduceProofWebReport.runtimeClosure, "Array.reduce", arrayLiteProvider);
assertRuntimeClosureProviderCounts(reduceProofWebReport.runtimeClosure);

const arrayFromProofOut = join(root, "tmp/array-from-proof-gate-a.csgweb");
const arrayFromProofReport = join(root, "tmp/array-from-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-array-from/tsconfig.json", arrayFromProofOut, arrayFromProofReport);
const arrayFromProofWebReport = JSON.parse(readFileSync(arrayFromProofReport, "utf8"));
assert.ok(arrayFromProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.from" && item.proofs?.includes("array-lite-i32-from-local")));
assert.ok(arrayFromProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.freeze" && item.proofs?.includes("array-lite-i32-freeze-local")));
assertClosedRuntimeClosureRequirement(arrayFromProofWebReport.runtimeClosure, "Array.from", arrayLiteProvider);
assertClosedRuntimeClosureRequirement(arrayFromProofWebReport.runtimeClosure, "Object.freeze", arrayLiteProvider);
assertRuntimeClosureProviderCounts(arrayFromProofWebReport.runtimeClosure);

const arrayFromStringSetProofOut = join(root, "tmp/array-from-string-set-proof-gate-a.csgweb");
const arrayFromStringSetProofReport = join(root, "tmp/array-from-string-set-proof-gate-a.web.report.json");
runCli("fixtures/csg-array-from-string-set-proof-gate/tsconfig.json", arrayFromStringSetProofOut, arrayFromStringSetProofReport);
const arrayFromStringSetProofWebReport = JSON.parse(readFileSync(arrayFromStringSetProofReport, "utf8"));
const arrayFromStringSetClosedRequirements = arrayFromStringSetProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  item.proofs?.includes("array-lite-string-set-from")
);
assert.equal(arrayFromStringSetClosedRequirements.length, 3);
assert.ok(arrayFromStringSetProofWebReport.coreReport.runtimeRequirements.some((item) => item.kind === "global" && item.name === "Boolean" && item.proofs?.includes("namespace-reference")));
assert.ok(arrayFromStringSetProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assertClosedRuntimeClosureRequirement(arrayFromStringSetProofWebReport.runtimeClosure, "Boolean", scalarLiteProvider);
assert.equal(arrayFromStringSetProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(arrayFromStringSetProofWebReport.runtimeClosure);

const arrayFromMapValuesProofOut = join(root, "tmp/array-from-map-values-proof-gate-a.csgweb");
const arrayFromMapValuesProofReport = join(root, "tmp/array-from-map-values-proof-gate-a.web.report.json");
runCli("fixtures/csg-array-from-map-values-proof-gate/tsconfig.json", arrayFromMapValuesProofOut, arrayFromMapValuesProofReport);
const arrayFromMapValuesProofWebReport = JSON.parse(readFileSync(arrayFromMapValuesProofReport, "utf8"));
assert.equal(arrayFromMapValuesProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  item.proofs?.includes("array-lite-string-map-values-from")
).length, 1);
assert.equal(arrayFromMapValuesProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  item.proofs?.includes("array-lite-string-set-values-from")
).length, 1);
assert.equal(arrayFromMapValuesProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  !item.proofs?.length
).length, 2);
assert.equal(arrayFromMapValuesProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name.endsWith(".values") &&
  item.proofs?.includes("collection-map-string-values-iterator")
).length, 1);
assert.equal(arrayFromMapValuesProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name.endsWith(".values") &&
  item.proofs?.includes("collection-set-string-values-iterator")
).length, 1);
assert.ok(arrayFromMapValuesProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.equal(arrayFromMapValuesProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "open"), false);
assert.ok(arrayFromMapValuesProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".values") && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.equal(arrayFromMapValuesProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".values") && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(arrayFromMapValuesProofWebReport.runtimeClosure);

const arrayFromUint8ArrayProofOut = join(root, "tmp/array-from-uint8array-proof-gate-a.csgweb");
const arrayFromUint8ArrayProofReport = join(root, "tmp/array-from-uint8array-proof-gate-a.web.report.json");
runCli("fixtures/csg-array-from-uint8array-proof-gate/tsconfig.json", arrayFromUint8ArrayProofOut, arrayFromUint8ArrayProofReport);
const arrayFromUint8ArrayProofWebReport = JSON.parse(readFileSync(arrayFromUint8ArrayProofReport, "utf8"));
const arrayFromUint8ArrayClosedRequirements = arrayFromUint8ArrayProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  item.proofs?.includes("array-lite-uint8array-from")
);
assert.equal(arrayFromUint8ArrayClosedRequirements.length, 2);
assert.ok(arrayFromUint8ArrayProofWebReport.coreReport.runtimeRequirements.some((item) =>
  item.name === "Array.from" &&
  item.proofs?.includes("array-lite-uint8array-hex-map-from")
));
assert.ok(arrayFromUint8ArrayProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.from" && !item.proofs?.length));
assert.ok(arrayFromUint8ArrayProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assert.equal(arrayFromUint8ArrayProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(arrayFromUint8ArrayProofWebReport.runtimeClosure);

const arrayFromDomCollectionProofOut = join(root, "tmp/array-from-dom-collection-proof-gate-a.csgweb");
const arrayFromDomCollectionProofReport = join(root, "tmp/array-from-dom-collection-proof-gate-a.web.report.json");
runCli("fixtures/csg-array-from-dom-collection-proof-gate/tsconfig.json", arrayFromDomCollectionProofOut, arrayFromDomCollectionProofReport);
const arrayFromDomCollectionProofWebReport = JSON.parse(readFileSync(arrayFromDomCollectionProofReport, "utf8"));
assert.equal(arrayFromDomCollectionProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  item.proofs?.includes("array-lite-dom-collection-from")
).length, 7);
assert.equal(arrayFromDomCollectionProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Array.from" &&
  !item.proofs?.length
).length, 3);
assert.ok(arrayFromDomCollectionProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.equal(arrayFromDomCollectionProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.from" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(arrayFromDomCollectionProofWebReport.runtimeClosure);

const freezeProofOut = join(root, "tmp/freeze-proof-gate-a.csgweb");
const freezeProofReport = join(root, "tmp/freeze-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-freeze/tsconfig.json", freezeProofOut, freezeProofReport);
const freezeProofWebReport = JSON.parse(readFileSync(freezeProofReport, "utf8"));
assert.ok(freezeProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.freeze" && item.proofs?.includes("array-lite-i32-freeze-local")));
assert.ok(freezeProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.freeze" && item.proofs?.includes("object-lite-freeze-local")));
assert.ok(freezeProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.isArray" && item.proofs?.includes("array-lite-i32-isarray-local")));
assertClosedRuntimeClosureRequirement(freezeProofWebReport.runtimeClosure, "Array.isArray", arrayLiteProvider);
assert.equal(freezeProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Object.freeze" && item.providerStatus === "closed"), true);
assertRuntimeClosureProviderCounts(freezeProofWebReport.runtimeClosure);

const freezeJsValueProofOut = join(root, "tmp/freeze-jsvalue-proof-gate-a.csgweb");
const freezeJsValueProofReport = join(root, "tmp/freeze-jsvalue-proof-gate-a.web.report.json");
runCli("fixtures/csg-object-freeze-jsvalue-proof-gate/tsconfig.json", freezeJsValueProofOut, freezeJsValueProofReport);
const freezeJsValueProofWebReport = JSON.parse(readFileSync(freezeJsValueProofReport, "utf8"));
assert.equal(freezeJsValueProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.freeze" &&
  item.proofs?.includes("array-lite-jsvalue-freeze-fresh")
).length, 3);
assert.equal(freezeJsValueProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.freeze" &&
  item.proofs?.includes("object-jsvalue-freeze-fresh")
).length, 2);
assert.equal(freezeJsValueProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.freeze" &&
  !item.proofs?.some((proof) => proof.endsWith("freeze-local") || proof.endsWith("freeze-fresh"))
).length, 4);
assert.equal(freezeJsValueProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Object.freeze" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(freezeJsValueProofWebReport.runtimeClosure);

const objectValuesProofOut = join(root, "tmp/object-values-proof-gate-a.csgweb");
const objectValuesProofReport = join(root, "tmp/object-values-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-object-values/tsconfig.json", objectValuesProofOut, objectValuesProofReport);
const objectValuesProofWebReport = JSON.parse(readFileSync(objectValuesProofReport, "utf8"));
assert.ok(objectValuesProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.values" && item.proofs?.includes("object-lite-values-local")));
assert.ok(objectValuesProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.isFrozen" && item.proofs?.includes("object-lite-isfrozen-local")));
assert.ok(objectValuesProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.isFrozen" && item.proofs?.includes("array-lite-i32-isfrozen-local")));
assertClosedRuntimeClosureRequirement(objectValuesProofWebReport.runtimeClosure, "Object.values", objectLiteProvider);
assert.equal(objectValuesProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Object.isFrozen" && item.providerStatus === "closed"), true);
assertRuntimeClosureProviderCounts(objectValuesProofWebReport.runtimeClosure);

const objectValuesJsValueProofOut = join(root, "tmp/object-values-jsvalue-proof-gate-a.csgweb");
const objectValuesJsValueProofReport = join(root, "tmp/object-values-jsvalue-proof-gate-a.web.report.json");
runCli("fixtures/csg-object-values-jsvalue-proof-gate/tsconfig.json", objectValuesJsValueProofOut, objectValuesJsValueProofReport);
const objectValuesJsValueProofWebReport = JSON.parse(readFileSync(objectValuesJsValueProofReport, "utf8"));
assert.equal(objectValuesJsValueProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.values" &&
  item.proofs?.includes("object-jsvalue-values-array")
).length, 6);
assert.equal(objectValuesJsValueProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.values" &&
  !item.proofs?.length
).length, 6);
assert.ok(objectValuesJsValueProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Object.values" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.equal(objectValuesJsValueProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Object.values" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(objectValuesJsValueProofWebReport.runtimeClosure);

const objectKeyEntryProofOut = join(root, "tmp/object-key-entry-proof-gate-a.csgweb");
const objectKeyEntryProofReport = join(root, "tmp/object-key-entry-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-object-key-entry-length/tsconfig.json", objectKeyEntryProofOut, objectKeyEntryProofReport);
const objectKeyEntryProofWebReport = JSON.parse(readFileSync(objectKeyEntryProofReport, "utf8"));
assert.ok(objectKeyEntryProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.keys" && item.proofs?.includes("object-lite-key-entry-length")));
assert.ok(objectKeyEntryProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.keys" && item.proofs?.includes("object-lite-keys-local")));
assert.ok(objectKeyEntryProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.entries" && item.proofs?.includes("object-lite-key-entry-length")));
assertClosedRuntimeClosureRequirement(objectKeyEntryProofWebReport.runtimeClosure, "Object.keys", objectLiteProvider);
assertClosedRuntimeClosureRequirement(objectKeyEntryProofWebReport.runtimeClosure, "Object.entries", objectLiteProvider);
assertRuntimeClosureProviderCounts(objectKeyEntryProofWebReport.runtimeClosure);

const objectKeysJsValueLengthProofOut = join(root, "tmp/object-keys-jsvalue-length-proof-gate-a.csgweb");
const objectKeysJsValueLengthProofReport = join(root, "tmp/object-keys-jsvalue-length-proof-gate-a.web.report.json");
runCli("fixtures/csg-object-keys-jsvalue-length/tsconfig.json", objectKeysJsValueLengthProofOut, objectKeysJsValueLengthProofReport);
const objectKeysJsValueLengthProofWebReport = JSON.parse(readFileSync(objectKeysJsValueLengthProofReport, "utf8"));
assert.equal(objectKeysJsValueLengthProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.keys" &&
  item.proofs?.includes("object-jsvalue-keys-length")
).length, 3);
assert.equal(objectKeysJsValueLengthProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.keys" &&
  !item.proofs?.length
).length, 1);
assert.equal(objectKeysJsValueLengthProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.entries" &&
  item.proofs?.includes("object-jsvalue-entries-array")
).length, 3);
assert.equal(objectKeysJsValueLengthProofWebReport.coreReport.runtimeRequirements.filter((item) =>
  item.name === "Object.entries" &&
  !item.proofs?.length
).length, 1);
assert.ok(objectKeysJsValueLengthProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Object.keys" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.equal(objectKeysJsValueLengthProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Object.keys" && item.providerStatus === "open"), false);
assert.ok(objectKeysJsValueLengthProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Object.entries" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.equal(objectKeysJsValueLengthProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Object.entries" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(objectKeysJsValueLengthProofWebReport.runtimeClosure);

const emptyArrayLiteralProofOut = join(root, "tmp/empty-array-literal-proof-gate-a.csgweb");
const emptyArrayLiteralProofReport = join(root, "tmp/empty-array-literal-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-empty-array-literal/tsconfig.json", emptyArrayLiteralProofOut, emptyArrayLiteralProofReport);
const emptyArrayLiteralProofWebReport = JSON.parse(readFileSync(emptyArrayLiteralProofReport, "utf8"));
assert.ok(emptyArrayLiteralProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.literal" && item.proofs?.includes("array-lite-empty")));
assert.ok(emptyArrayLiteralProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.literal" && item.proofs?.includes("array-lite-const-string-literal")));
assert.ok(emptyArrayLiteralProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.literal" && item.proofs?.includes("array-lite-jsvalue-scalar-literal")));
assert.ok(emptyArrayLiteralProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.literal" && item.proofs?.includes("array-lite-jsvalue-literal") && item.loc?.line === 6));
assert.ok(emptyArrayLiteralProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Array.literal" && item.providerStatus === "closed" && item.provider === arrayLiteProvider));
assertRuntimeClosureProviderCounts(emptyArrayLiteralProofWebReport.runtimeClosure);

const jsValueArrayProofOut = join(root, "tmp/jsvalue-array-proof-gate-a.csgweb");
const jsValueArrayProofReport = join(root, "tmp/jsvalue-array-proof-gate-a.web.report.json");
runCli("fixtures/csg-jsvalue-array/tsconfig.json", jsValueArrayProofOut, jsValueArrayProofReport);
const jsValueArrayProofWebReport = JSON.parse(readFileSync(jsValueArrayProofReport, "utf8"));
assert.ok(jsValueArrayProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.literal" && item.proofs?.includes("array-lite-jsvalue-literal")));
assert.ok(jsValueArrayProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.literal" && item.proofs?.includes("array-lite-jsvalue-spread-literal")));
assert.ok(jsValueArrayProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.length" && item.proofs?.includes("array-lite-jsvalue-local")));
assert.ok(jsValueArrayProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.push" && item.proofs?.includes("array-lite-jsvalue-push-local")));
assert.ok(jsValueArrayProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Array.includes" && item.proofs?.includes("array-lite-jsvalue-includes-local")));
assert.ok(jsValueArrayProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "String.length" && item.proofs?.includes("string-runtime-length")));
assertClosedRuntimeClosureRequirement(jsValueArrayProofWebReport.runtimeClosure, "Array.literal", arrayLiteProvider);
assertClosedRuntimeClosureRequirement(jsValueArrayProofWebReport.runtimeClosure, "Array.length", arrayLiteProvider);
assertClosedRuntimeClosureRequirement(jsValueArrayProofWebReport.runtimeClosure, "Array.push", arrayLiteProvider);
assertClosedRuntimeClosureRequirement(jsValueArrayProofWebReport.runtimeClosure, "Array.includes", arrayLiteProvider);
assertClosedRuntimeClosureRequirement(jsValueArrayProofWebReport.runtimeClosure, "String.length", stringLiteProvider);
assertRuntimeClosureProviderCounts(jsValueArrayProofWebReport.runtimeClosure);

const uint8ArrayConstructorProofOut = join(root, "tmp/uint8array-constructor-proof-gate-a.csgweb");
const uint8ArrayConstructorProofReport = join(root, "tmp/uint8array-constructor-proof-gate-a.web.report.json");
runCli("fixtures/csg-uint8array-constructor/tsconfig.json", uint8ArrayConstructorProofOut, uint8ArrayConstructorProofReport);
const uint8ArrayConstructorProofWebReport = JSON.parse(readFileSync(uint8ArrayConstructorProofReport, "utf8"));
assert.equal(
  uint8ArrayConstructorProofWebReport.coreReport.runtimeRequirements.filter((item) =>
    item.kind === "constructor" &&
    item.name === "Uint8Array" &&
    item.proofs?.includes("uint8array-constructor-length")
  ).length,
  1,
);
assert.equal(
  uint8ArrayConstructorProofWebReport.coreReport.runtimeRequirements.filter((item) =>
    item.kind === "constructor" &&
    item.name === "Uint8Array" &&
    item.proofs?.includes("uint8array-constructor-byte-array")
  ).length,
  1,
);
assert.equal(
  uint8ArrayConstructorProofWebReport.coreReport.runtimeRequirements.filter((item) =>
    item.kind === "constructor" &&
    item.name === "Uint8Array" &&
    item.proofs?.includes("uint8array-constructor-buffer-view")
  ).length,
  2,
);
assert.equal(uint8ArrayConstructorProofWebReport.coreReport.runtimeRequirements.filter((item) => item.kind === "constructor" && item.name === "Uint8Array" && !item.proofs?.length).length, 3);
assert.ok(uint8ArrayConstructorProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Uint8Array" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.equal(uint8ArrayConstructorProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Uint8Array" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(uint8ArrayConstructorProofWebReport.runtimeClosure);

const uint8ArraySafeLengthConstructorProofOut = join(root, "tmp/uint8array-safe-length-constructor-proof-gate-a.csgweb");
const uint8ArraySafeLengthConstructorProofReport = join(root, "tmp/uint8array-safe-length-constructor-proof-gate-a.web.report.json");
runCli("fixtures/csg-uint8array-safe-length-constructor/tsconfig.json", uint8ArraySafeLengthConstructorProofOut, uint8ArraySafeLengthConstructorProofReport);
const uint8ArraySafeLengthConstructorProofWebReport = JSON.parse(readFileSync(uint8ArraySafeLengthConstructorProofReport, "utf8"));
assert.equal(
  uint8ArraySafeLengthConstructorProofWebReport.coreReport.runtimeRequirements.filter((item) =>
    item.kind === "constructor" &&
    item.name === "Uint8Array" &&
    item.proofs?.includes("uint8array-constructor-length")
  ).length,
  6,
);
assert.equal(uint8ArraySafeLengthConstructorProofWebReport.coreReport.runtimeRequirements.filter((item) => item.kind === "constructor" && item.name === "Uint8Array" && !item.proofs?.length).length, 2);
assert.ok(uint8ArraySafeLengthConstructorProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Uint8Array" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.equal(uint8ArraySafeLengthConstructorProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Uint8Array" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(uint8ArraySafeLengthConstructorProofWebReport.runtimeClosure);

const dateConstructorProofOut = join(root, "tmp/date-constructor-proof-gate-a.csgweb");
const dateConstructorProofReport = join(root, "tmp/date-constructor-proof-gate-a.web.report.json");
runCli("fixtures/csg-date-constructor-proof-gate/tsconfig.json", dateConstructorProofOut, dateConstructorProofReport);
const dateConstructorProofWebReport = JSON.parse(readFileSync(dateConstructorProofReport, "utf8"));
assert.equal(
  dateConstructorProofWebReport.coreReport.runtimeRequirements.filter((item) =>
    item.kind === "constructor" &&
    item.name === "Date" &&
    item.proofs?.includes("date-constructor-now-ms")
  ).length,
  1,
);
assert.equal(
  dateConstructorProofWebReport.coreReport.runtimeRequirements.filter((item) =>
    item.kind === "constructor" &&
    item.name === "Date" &&
    item.proofs?.includes("date-constructor-ms")
  ).length,
  1,
);
assert.equal(
  dateConstructorProofWebReport.coreReport.runtimeRequirements.filter((item) =>
    item.kind === "constructor" &&
    item.name === "Date" &&
    item.proofs?.includes("date-constructor-string")
  ).length,
  1,
);
assert.ok(dateConstructorProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Date" && item.providerStatus === "closed" && item.provider === dateNowProvider));
assert.ok(dateConstructorProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Date" && item.providerStatus === "closed" && item.provider === dateParseProvider));
assertRuntimeClosureProviderCounts(dateConstructorProofWebReport.runtimeClosure);

const collectionConstructorProofOut = join(root, "tmp/collection-constructor-proof-gate-a.csgweb");
const collectionConstructorProofReport = join(root, "tmp/collection-constructor-proof-gate-a.web.report.json");
runCli("fixtures/csg-js-collection-constructor/tsconfig.json", collectionConstructorProofOut, collectionConstructorProofReport);
const collectionConstructorProofWebReport = JSON.parse(readFileSync(collectionConstructorProofReport, "utf8"));
assert.ok(collectionConstructorProofWebReport.coreReport.runtimeRequirements.some((item) => item.kind === "constructor" && item.name === "Map" && item.proofs?.includes("collection-constructor-empty")));
assert.ok(collectionConstructorProofWebReport.coreReport.runtimeRequirements.some((item) => item.kind === "constructor" && item.name === "Set" && item.proofs?.includes("collection-constructor-empty")));
assert.ok(collectionConstructorProofWebReport.coreReport.runtimeRequirements.some((item) => item.kind === "constructor" && item.name === "Set" && item.proofs?.includes("collection-constructor-string-array")));
assert.ok(collectionConstructorProofWebReport.coreReport.runtimeRequirements.some((item) => item.kind === "global" && item.name === "console" && item.proofs?.includes("namespace-reference")));
assert.ok(collectionConstructorProofWebReport.runtimeClosure.requirements.some((item) => item.kind === "constructor" && item.name === "Map" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.ok(collectionConstructorProofWebReport.runtimeClosure.requirements.some((item) => item.kind === "constructor" && item.name === "Set" && item.providerStatus === "closed" && item.provider === objectLiteProvider));
assert.ok(collectionConstructorProofWebReport.runtimeClosure.requirements.some((item) => item.kind === "global" && item.name === "console" && item.providerStatus === "closed"));
assertRuntimeClosureProviderCounts(collectionConstructorProofWebReport.runtimeClosure);

const documentCreateElementProofOut = join(root, "tmp/document-create-element-proof-gate-a.csgweb");
const documentCreateElementProofReport = join(root, "tmp/document-create-element-proof-gate-a.web.report.json");
runCli("fixtures/csg-browser-document-create-element/tsconfig.json", documentCreateElementProofOut, documentCreateElementProofReport);
const documentCreateElementProofWebReport = JSON.parse(readFileSync(documentCreateElementProofReport, "utf8"));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "document" && item.proofs?.includes("browser-document-global")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "document.body" && item.kind === "property_access" && item.proofs?.includes("browser-document-body")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "document.head" && item.kind === "property_access" && item.proofs?.includes("browser-document-head")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "document.documentElement" && item.kind === "property_access" && item.proofs?.includes("browser-document-element")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "document.hidden" && item.kind === "property_access" && item.proofs?.includes("browser-document-hidden")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "document.visibilityState" && item.kind === "property_access" && item.proofs?.includes("browser-document-visibility-state")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "document.body.dataset" && item.kind === "property_access" && item.proofs?.includes("browser-document-dataset")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "document.dataset.write" && item.kind === "property_write" && item.proofs?.includes("browser-document-dataset-string-write")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".style.setProperty") && item.kind === "call" && item.proofs?.includes("browser-inline-style-set-property")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "document.body.style.overflow" && item.kind === "property_access" && item.proofs?.includes("browser-inline-style-property-read")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Object.assign" && item.kind === "call" && item.proofs?.includes("browser-inline-style-object-assign")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "document.createElement" && item.kind === "call" && item.proofs?.includes("browser-document-create-element-literal")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "doc.createElement" && item.kind === "call" && item.proofs?.includes("browser-document-create-element-literal")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "TextEncoder" && item.kind === "constructor" && item.proofs?.includes("browser-text-encoder-constructor")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "TextDecoder" && item.kind === "constructor" && item.proofs?.includes("browser-text-decoder-constructor")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".encode") && item.kind === "call" && item.proofs?.includes("browser-text-encoder-encode-utf8")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".decode") && item.kind === "call" && item.proofs?.includes("browser-text-decoder-decode-utf8")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "atob" && item.kind === "call" && item.proofs?.includes("browser-window-base64-codec")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "btoa" && item.kind === "call" && item.proofs?.includes("browser-window-base64-codec")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "Event" && item.kind === "constructor" && item.proofs?.includes("browser-event-constructor-literal")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "MouseEvent" && item.kind === "constructor" && item.proofs?.includes("browser-mouseevent-constructor-literal")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "KeyboardEvent" && item.kind === "constructor" && item.proofs?.includes("browser-keyboardevent-constructor-literal")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "CustomEvent" && item.kind === "constructor" && item.proofs?.includes("browser-customevent-constructor-literal")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".type") && item.kind === "property_access" && item.proofs?.includes("browser-event-readonly-scalar")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".button") && item.kind === "property_access" && item.proofs?.includes("browser-event-readonly-scalar")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".key") && item.kind === "property_access" && item.proofs?.includes("browser-event-readonly-scalar")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "navigator" && item.kind === "global" && item.proofs?.includes("browser-navigator-global")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "window.location" && item.kind === "property_access" && item.proofs?.includes("browser-window-location")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "window.location.href" && item.kind === "property_access" && item.proofs?.includes("browser-window-location-readonly-scalar")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "window.location.pathname" && item.kind === "property_access" && item.proofs?.includes("browser-window-location-readonly-scalar")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "window.location.search" && item.kind === "property_access" && item.proofs?.includes("browser-window-location-readonly-scalar")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "location.href" && item.kind === "property_access" && item.proofs?.includes("browser-window-location-readonly-scalar")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "window.innerWidth" && item.kind === "property_access" && item.proofs?.includes("browser-window-size-constant")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "window.innerHeight" && item.kind === "property_access" && item.proofs?.includes("browser-window-size-constant")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "window.scrollY" && item.kind === "property_access" && item.proofs?.includes("browser-window-scroll-readonly-scalar")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "window.matchMedia" && item.kind === "call" && item.proofs?.includes("browser-window-matchmedia-matches")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "window.matchMedia" && item.kind === "call" && item.proofs?.includes("browser-window-matchmedia-list")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "window.matches" && item.kind === "property_access" && item.proofs?.includes("browser-window-matchmedia-matches")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "mediaQuery.addEventListener" && item.kind === "call" && item.proofs?.includes("browser-mediaquery-list-listener")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "mediaQuery.removeEventListener" && item.kind === "call" && item.proofs?.includes("browser-mediaquery-list-listener")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "mediaQuery.addListener" && item.kind === "call" && item.proofs?.includes("browser-mediaquery-list-listener")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "mediaQuery.removeListener" && item.kind === "call" && item.proofs?.includes("browser-mediaquery-list-listener")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "IntersectionObserver" && item.kind === "constructor" && item.proofs?.includes("browser-intersection-observer-constructor")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "intersectionObserver.observe" && item.kind === "call" && item.proofs?.includes("browser-intersection-observer-observe")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "intersectionObserver.disconnect" && item.kind === "call" && item.proofs?.includes("browser-intersection-observer-disconnect")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "window.cancelAnimationFrame" && item.kind === "call" && item.proofs?.includes("browser-window-cancel-animation-frame")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "navigator.language" && item.kind === "property_access" && item.proofs?.includes("browser-navigator-language")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "URL" && item.kind === "constructor" && item.proofs?.includes("browser-url-constructor-string")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "endpoint.toString" && item.kind === "call" && item.proofs?.includes("browser-url-tostring")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "URLSearchParams" && item.kind === "constructor" && item.proofs?.includes("browser-urlsearchparams-constructor-lite")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".searchParams.set") && item.kind === "call" && item.proofs?.includes("browser-urlsearchparams-set")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".searchParams.get") && item.kind === "call" && item.proofs?.includes("browser-urlsearchparams-get")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".searchParams.delete") && item.kind === "call" && item.proofs?.includes("browser-urlsearchparams-delete")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".searchParams.toString") && item.kind === "call" && item.proofs?.includes("browser-urlsearchparams-tostring")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".dispatchEvent") && item.kind === "call" && item.proofs?.includes("browser-event-dispatch-event-object")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".dispatchEvent") && item.kind === "call" && !item.proofs?.length));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".append") && item.kind === "call" && item.proofs?.includes("browser-element-append")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".appendChild") && item.kind === "call" && item.proofs?.includes("browser-element-append-child")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".contains") && item.kind === "call" && item.proofs?.includes("browser-element-contains")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".remove") && item.kind === "call" && item.proofs?.includes("browser-element-remove")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".getElementById") && item.kind === "call" && item.proofs?.includes("browser-document-get-element-by-id")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".querySelector") && item.kind === "call" && item.proofs?.includes("browser-document-query-selector")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "document.querySelector" && item.kind === "call" && item.proofs?.includes("browser-document-query-selector")).length >= 3);
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".querySelectorAll") && item.kind === "call" && item.proofs?.includes("browser-document-query-selector-all")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".matches") && item.kind === "call" && item.proofs?.includes("browser-element-matches")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".closest") && item.kind === "call" && item.proofs?.includes("browser-element-closest")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".querySelector") && item.kind === "property_access" && item.proofs?.includes("browser-document-query-selector")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".getElementById") && item.kind === "property_access" && item.proofs?.includes("browser-document-get-element-by-id")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".addEventListener") && item.kind === "property_access" && item.proofs?.includes("browser-event-add-listener")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".setAttribute") && item.kind === "call" && item.proofs?.includes("browser-element-set-attribute")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".getAttribute") && item.kind === "call" && item.proofs?.includes("browser-element-get-attribute")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".hasAttribute") && item.kind === "call" && item.proofs?.includes("browser-element-has-attribute")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".removeAttribute") && item.kind === "call" && item.proofs?.includes("browser-element-remove-attribute")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".classList") && item.kind === "property_access" && item.proofs?.includes("browser-element-classlist-access")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".classList.add") && item.kind === "call" && item.proofs?.includes("browser-element-classlist-call")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".classList.toggle") && item.kind === "call" && item.proofs?.includes("browser-element-classlist-call")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".classList.contains") && item.kind === "call" && item.proofs?.includes("browser-element-classlist-call")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".classList.remove") && item.kind === "call" && item.proofs?.includes("browser-element-classlist-call")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".addEventListener") && item.kind === "call" && item.proofs?.includes("browser-event-add-listener")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".removeEventListener") && item.kind === "call" && item.proofs?.includes("browser-event-remove-listener")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".preventDefault") && item.kind === "call" && item.proofs?.includes("browser-event-prevent-default")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".stopPropagation") && item.kind === "call" && item.proofs?.includes("browser-event-stop-propagation")));
assert.ok(documentCreateElementProofWebReport.coreReport.runtimeRequirements.some((item) => item.name.endsWith(".createElement") && item.kind === "call" && !item.proofs?.length));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "document" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "document.body" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "document.head" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "document.documentElement" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "document.hidden" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "document.visibilityState" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "document.body.dataset" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "document.dataset.write" && item.kind === "property_write" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".style.setProperty") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "document.body.style.overflow" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Object.assign" && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "document.createElement" && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "TextEncoder" && item.kind === "constructor" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "TextDecoder" && item.kind === "constructor" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".encode") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".decode") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "atob" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "btoa" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "Event" && item.kind === "constructor" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "MouseEvent" && item.kind === "constructor" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "navigator" && item.kind === "global" && item.providerStatus === "closed" && item.provider === navigatorProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "navigator.language" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === navigatorProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "window.location" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "window.innerWidth" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "window.innerHeight" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "window.scrollY" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "window.matchMedia" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "window.matches" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "mediaQuery.addEventListener" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "mediaQuery.removeEventListener" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "mediaQuery.addListener" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "mediaQuery.removeListener" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "IntersectionObserver" && item.kind === "constructor" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "intersectionObserver.observe" && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "intersectionObserver.disconnect" && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "window.cancelAnimationFrame" && item.kind === "call" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "URL" && item.kind === "constructor" && item.providerStatus === "closed" && item.provider === urlProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "endpoint.toString" && item.kind === "call" && item.providerStatus === "closed" && item.provider === urlProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name === "URLSearchParams" && item.kind === "constructor" && item.providerStatus === "closed" && item.provider === urlProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".searchParams.set") && item.kind === "call" && item.providerStatus === "closed" && item.provider === urlProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".searchParams.get") && item.kind === "call" && item.providerStatus === "closed" && item.provider === urlProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".searchParams.delete") && item.kind === "call" && item.providerStatus === "closed" && item.provider === urlProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".searchParams.toString") && item.kind === "call" && item.providerStatus === "closed" && item.provider === urlProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".dispatchEvent") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.equal(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".dispatchEvent") && item.kind === "call" && item.providerStatus === "open"), false);
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".append") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".appendChild") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".contains") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".remove") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".getElementById") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".querySelector") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".querySelectorAll") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".querySelector") && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".getElementById") && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".matches") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".closest") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".setAttribute") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".getAttribute") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".hasAttribute") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".removeAttribute") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".classList") && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".classList.add") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".classList.toggle") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".classList.contains") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".classList.remove") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".addEventListener") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".removeEventListener") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".addEventListener") && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".preventDefault") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".stopPropagation") && item.kind === "call" && item.providerStatus === "closed" && item.provider === domDocumentProvider));
assert.ok(documentCreateElementProofWebReport.runtimeClosure.requirements.some((item) => item.name.endsWith(".createElement") && item.kind === "call" && item.providerStatus === "open" && item.candidateProvider === "cheng-source.browser.dom"));
assertRuntimeClosureProviderCounts(documentCreateElementProofWebReport.runtimeClosure);

const localStorageProofOut = join(root, "tmp/local-storage-proof-gate-a.csgweb");
const localStorageProofReport = join(root, "tmp/local-storage-proof-gate-a.web.report.json");
runCli("fixtures/csg-browser-local-storage/tsconfig.json", localStorageProofOut, localStorageProofReport);
const localStorageProofWebReport = JSON.parse(readFileSync(localStorageProofReport, "utf8"));
assert.ok(localStorageProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "localStorage" && item.proofs?.includes("browser-local-storage-global")));
assert.ok(localStorageProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "localStorage.getItem" && item.kind === "call" && item.proofs?.includes("browser-local-storage-getitem")));
assert.ok(localStorageProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "localStorage.getItem" && item.kind === "property_access" && item.proofs?.includes("browser-local-storage-getitem")));
assert.ok(localStorageProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "localStorage.setItem" && item.kind === "call" && item.proofs?.includes("browser-local-storage-setitem")));
assert.ok(localStorageProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "localStorage.setItem" && item.kind === "property_access" && item.proofs?.includes("browser-local-storage-setitem")));
assert.ok(localStorageProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "window.localStorage.removeItem" && item.kind === "call" && item.proofs?.includes("browser-local-storage-removeitem")));
assert.ok(localStorageProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "localStorage.clear" && item.kind === "call" && item.proofs?.includes("browser-local-storage-clear")));
assert.ok(localStorageProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "window" && item.proofs?.includes("browser-window-global")));
assert.ok(localStorageProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "window.localStorage" && item.kind === "property_access" && item.proofs?.includes("browser-window-local-storage")));
assert.ok(localStorageProofWebReport.runtimeClosure.requirements.some((item) => item.name === "localStorage" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assert.ok(localStorageProofWebReport.runtimeClosure.requirements.some((item) => item.name === "localStorage.getItem" && item.kind === "call" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assert.ok(localStorageProofWebReport.runtimeClosure.requirements.some((item) => item.name === "localStorage.getItem" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assert.ok(localStorageProofWebReport.runtimeClosure.requirements.some((item) => item.name === "localStorage.setItem" && item.kind === "call" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assert.ok(localStorageProofWebReport.runtimeClosure.requirements.some((item) => item.name === "localStorage.setItem" && item.kind === "property_access" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assert.ok(localStorageProofWebReport.runtimeClosure.requirements.some((item) => item.name === "window.localStorage.removeItem" && item.kind === "call" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assert.ok(localStorageProofWebReport.runtimeClosure.requirements.some((item) => item.name === "localStorage.clear" && item.kind === "call" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assert.ok(localStorageProofWebReport.runtimeClosure.requirements.some((item) => item.name === "window" && item.providerStatus === "closed" && item.provider === windowProvider));
assert.ok(localStorageProofWebReport.runtimeClosure.requirements.some((item) => item.name === "window.localStorage" && item.providerStatus === "closed" && item.provider === localStorageProvider));
assertRuntimeClosureProviderCounts(localStorageProofWebReport.runtimeClosure);

const localWindowSymbolOut = join(root, "tmp/local-window-symbol-gate-a.csgweb");
const localWindowSymbolReport = join(root, "tmp/local-window-symbol-gate-a.web.report.json");
runCli("fixtures/csg-local-window-symbol/tsconfig.json", localWindowSymbolOut, localWindowSymbolReport);
const localWindowSymbolWebReport = JSON.parse(readFileSync(localWindowSymbolReport, "utf8"));
assert.equal(localWindowSymbolWebReport.coreReport.runtimeRequirements.some((item) => item.runtime === "browser" && item.name.startsWith("window.webContents")), false);
assert.ok(localWindowSymbolWebReport.coreReport.runtimeRequirements.some((item) => item.runtime === "unknown" && item.source === "external_declaration" && item.name === "window.webContents.executeJavaScript"));

const reactUseStateProofOut = join(root, "tmp/react-usestate-proof-gate-a.csgweb");
const reactUseStateProofReport = join(root, "tmp/react-usestate-proof-gate-a.web.report.json");
runCli("fixtures/cheng-source-react-usestate/tsconfig.json", reactUseStateProofOut, reactUseStateProofReport);
const reactUseStateProofWebReport = JSON.parse(readFileSync(reactUseStateProofReport, "utf8"));
assert.ok(reactUseStateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "useState" && item.source === "react_type" && item.proofs?.includes("react-use-state-hook")));
assert.ok(reactUseStateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "React.useState" && item.source === "react_type" && item.proofs?.includes("react-use-state-hook")));
assert.equal(reactUseStateProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "useState" && item.source === "react_type" && item.proofs?.includes("react-use-state-hook")).length >= 7, true);
assert.equal(reactUseStateProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "React.useState" && item.source === "react_type" && item.proofs?.includes("react-use-state-hook")).length >= 3, true);
assert.ok(reactUseStateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "useRef" && item.source === "react_type" && item.proofs?.includes("react-use-ref-hook")));
assert.ok(reactUseStateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "React.useRef" && item.source === "react_type" && item.proofs?.includes("react-use-ref-hook")));
assert.ok(reactUseStateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "useCallback" && item.source === "react_type" && item.proofs?.includes("react-use-callback-hook")));
assert.ok(reactUseStateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "React.useCallback" && item.source === "react_type" && item.proofs?.includes("react-use-callback-hook")));
assert.ok(reactUseStateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "useMemo" && item.source === "react_type" && item.proofs?.includes("react-use-memo-hook")));
assert.ok(reactUseStateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "React.useMemo" && item.source === "react_type" && item.proofs?.includes("react-use-memo-hook")));
assert.ok(reactUseStateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "useEffect" && item.source === "react_type" && item.proofs?.includes("react-use-effect-noop-hook")));
assert.ok(reactUseStateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "React.useEffect" && item.source === "react_type" && item.proofs?.includes("react-use-effect-noop-hook")));
assert.ok(reactUseStateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "useEffect" && item.source === "react_type" && item.proofs?.includes("react-use-effect-cfg-hook")));
assert.equal(reactUseStateProofWebReport.coreReport.runtimeRequirements.filter((item) => item.name === "useEffect" && item.source === "react_type" && item.proofs?.includes("react-use-effect-cfg-hook")).length >= 4, true);
assert.ok(reactUseStateProofWebReport.coreReport.runtimeRequirements.some((item) => item.name === "react" && item.kind === "module_import" && item.proofs?.includes("react-module-import-pure-runtime")));
assertClosedRuntimeClosureRequirement(reactUseStateProofWebReport.runtimeClosure, "useState", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofWebReport.runtimeClosure, "React.useState", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofWebReport.runtimeClosure, "useRef", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofWebReport.runtimeClosure, "React.useRef", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofWebReport.runtimeClosure, "useCallback", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofWebReport.runtimeClosure, "React.useCallback", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofWebReport.runtimeClosure, "useMemo", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofWebReport.runtimeClosure, "React.useMemo", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofWebReport.runtimeClosure, "useEffect", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofWebReport.runtimeClosure, "React.useEffect", reactProvider);
assertClosedRuntimeClosureRequirement(reactUseStateProofWebReport.runtimeClosure, "react", reactProvider);
assert.equal(reactUseStateProofWebReport.runtimeClosure.requirements.some((item) => item.name === "useState" && item.providerStatus === "open"), false);
assert.equal(reactUseStateProofWebReport.runtimeClosure.requirements.some((item) => item.name === "useRef" && item.providerStatus === "open"), false);
assert.ok(reactUseStateProofWebReport.runtimeClosure.externalSymbols.some((item) => item.name === "useState" && item.domain === "react-jsx" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofWebReport.runtimeClosure.externalSymbols.some((item) => item.name === "React.useState" && item.domain === "react-jsx" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofWebReport.runtimeClosure.externalSymbols.some((item) => item.name === "useRef" && item.domain === "react-jsx" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofWebReport.runtimeClosure.externalSymbols.some((item) => item.name === "React.useRef" && item.domain === "react-jsx" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofWebReport.runtimeClosure.externalSymbols.some((item) => item.name === "useCallback" && item.domain === "react-jsx" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofWebReport.runtimeClosure.externalSymbols.some((item) => item.name === "React.useCallback" && item.domain === "react-jsx" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofWebReport.runtimeClosure.externalSymbols.some((item) => item.name === "useMemo" && item.domain === "react-jsx" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofWebReport.runtimeClosure.externalSymbols.some((item) => item.name === "React.useMemo" && item.domain === "react-jsx" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofWebReport.runtimeClosure.externalSymbols.some((item) => item.name === "useEffect" && item.domain === "react-jsx" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofWebReport.runtimeClosure.externalSymbols.some((item) => item.name === "React.useEffect" && item.domain === "react-jsx" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.ok(reactUseStateProofWebReport.runtimeClosure.externalSymbols.some((item) => item.name === "react" && item.providerStatus === "closed" && item.provider === reactProvider));
assert.equal(reactUseStateProofWebReport.runtimeClosure.requirements.some((item) => item.name === "useEffect" && item.domain === "react-jsx" && item.providerStatus === "open"), false);
assertRuntimeClosureProviderCounts(reactUseStateProofWebReport.runtimeClosure);

const validText = readFileSync(join(root, "tmp/jsx-a.csgweb"), "utf8");
const unknownValidation = validateCsgWebText(`${validText}${JSON.stringify({ kind: "csg.web.unknown", schema: "csg-web" })}\n`);
assert.equal(unknownValidation.ok, false);
assert.match(unknownValidation.diagnostics.join("\n"), /unknown csg-web fact kind/);

const truncatedValidation = validateCsgWebText(validText.split("\n")[0].slice(0, -1));
assert.equal(truncatedValidation.ok, false);
assert.match(truncatedValidation.diagnostics.join("\n"), /invalid JSON fact|first fact/);

process.stdout.write("csg-web smoke ok\n");

function runOptions(item) {
  return {
    cwd: item.cwd ? join(root, item.cwd) : root,
  };
}

function runCli(project, out, report, options = {}) {
  execFileSync(process.execPath, [
    join(root, "dist/cli.js"),
    "--emit",
    "csg-web",
    "--project",
    project,
    "--runtime",
    "node,browser",
    "--out",
    out,
    "--report-out",
    report,
  ], {
    cwd: options.cwd ?? root,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runCliExpectFailure(project, out, report, options = {}) {
  try {
    runCli(project, out, report, options);
  } catch (error) {
    assert.equal(error.status, 1);
    return {
      stderr: String(error.stderr ?? ""),
      stdout: String(error.stdout ?? ""),
    };
  }
  assert.fail("csg-web CLI was expected to fail");
}

function assertRuntimeClosureProviderCounts(closure) {
  assert.equal(closure.openRequirementCount + closure.closedRequirementCount, closure.requirementCount);
  assert.equal(closure.candidateRequirementCount <= closure.openRequirementCount, true);
}

function assertExternalCapabilityManifest(report) {
  const manifest = report.externalCapabilityManifest;
  assert.equal(manifest.schema, "csg-web.external-capability-manifest");
  assert.equal(manifest.hardFailUntilProvided, true);
  assert.equal(manifest.requiredProvider, "surface-provider");
  const expectedRequirements = report.runtimeClosure.requirements.filter(isExternalSurfaceCapability).length;
  const expectedExternalSymbols = report.runtimeClosure.externalSymbols.filter(isExternalSurfaceCapability).length;
  assert.equal(manifest.requirementCount, expectedRequirements);
  assert.equal(manifest.externalSymbolCount, expectedExternalSymbols);
  assert.equal(manifest.capabilityCount, expectedRequirements + expectedExternalSymbols);
  assert.equal(manifest.openCapabilityCount, manifest.capabilityCount);
  assert.equal(manifest.complete, manifest.openCapabilityCount === 0);
  assert.equal(Array.isArray(manifest.byDomain), true);
  assert.equal(Array.isArray(manifest.byCandidateProvider), true);
  assert.equal(Array.isArray(manifest.capabilities), true);
  assert.equal(manifest.capabilities.length, manifest.capabilityCount);
  for (const item of manifest.capabilities) {
    assert.equal(item.providerStatus, "open");
    assert.equal(typeof item.candidateProvider, "string");
    assert.equal(item.requiredProvider, "surface-provider");
    assert.equal(item.hardFailReason, "surface-provider-not-attached");
    assert.equal(["external-host", "web-resource", "node-host"].includes(item.domain), true);
  }
  if (manifest.openCapabilityCount > 0) {
    assert.equal(report.blockedReasons.includes("surface provider has open external capabilities"), true);
  }
}

function assertExternalCapabilityCandidate(report, domain, candidateProvider, name) {
  const item = report.externalCapabilityManifest.capabilities.find((capability) =>
    capability.domain === domain &&
    capability.candidateProvider === candidateProvider &&
    capability.name === name
  );
  assert.ok(item, `missing external capability ${domain}:${name}`);
  assert.equal(item.providerStatus, "open");
}

function assertClosedRuntimeClosureExternalSymbol(report, name, provider) {
  const item = report.runtimeClosure.externalSymbols.find((external) =>
    external.name === name &&
    external.providerStatus === "closed" &&
    external.provider === provider
  );
  assert.ok(item, `missing closed external symbol ${name}`);
}

function isExternalSurfaceCapability(item) {
  return item.providerStatus === "open" &&
    typeof item.candidateProvider === "string" &&
    (item.domain === "external-host" || item.domain === "web-resource" || item.domain === "node-host");
}

function runtimeOpenRequirementTopFromClosure(requirements, limit) {
  const counts = new Map();
  for (const item of requirements) {
    if (item.providerStatus !== "open") continue;
    const key = `${item.domain}:${item.kind}:${item.name}`;
    const entry = counts.get(key);
    const count = item.count ?? 1;
    if (entry) entry.count += count;
    else counts.set(key, { domain: item.domain, kind: item.kind, name: item.name, count });
  }
  return [...counts.values()].sort(compareRuntimeOpenRequirementTop).slice(0, limit);
}

function compareRuntimeOpenRequirementTop(left, right) {
  if (left.count !== right.count) return right.count - left.count;
  if (left.domain < right.domain) return -1;
  if (left.domain > right.domain) return 1;
  if (left.kind < right.kind) return -1;
  if (left.kind > right.kind) return 1;
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  return 0;
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
  assert.equal(typeof decision.provider, "string", name);
  assert.equal(decision.candidateProvider, undefined, name);
}

function assertOpenRuntimeRequirementDecision(kind, name, source, candidateProvider, runtime = "js-core") {
  const decision = runtimeRequirementProviderDecision({ runtime, kind, name, source });
  if (decision.status === "closed") {
    assert.equal(typeof decision.provider, "string", name);
    assert.equal(decision.candidateProvider, undefined, name);
    return;
  }
  assert.equal(decision.status, "open", name);
  assert.equal(decision.provider, undefined, name);
  assert.equal(decision.candidateProvider, candidateProvider, name);
}

function assertClosedExternalSymbolDecision(name, source, provider, runtime = "js-core") {
  const decision = externalSymbolProviderDecision({ runtime, name, source });
  if (decision.status === "open") {
    assert.equal(decision.provider, undefined, name);
    assert.equal(typeof decision.candidateProvider, "string", name);
    return;
  }
  assert.equal(decision.status, "closed", name);
  assert.equal(decision.provider, provider, name);
  assert.equal(decision.candidateProvider, undefined, name);
}

function assertOpenExternalSymbolDecision(name, source, candidateProvider, runtime = "js-core") {
  const decision = externalSymbolProviderDecision({ runtime, name, source });
  if (decision.status === "closed") {
    assert.equal(typeof decision.provider, "string", name);
    assert.equal(decision.candidateProvider, undefined, name);
    return;
  }
  assert.equal(decision.status, "open", name);
  assert.equal(decision.provider, undefined, name);
  assert.equal(decision.candidateProvider, candidateProvider, name);
}
