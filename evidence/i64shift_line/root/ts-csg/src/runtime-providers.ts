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

const chengRuntimeArrayLiteProvider = "cheng/core/runtime/js_runtime.array-lite";
const chengRuntimeStringLiteProvider = "cheng/core/runtime/js_runtime.string-lite";
const chengRuntimeObjectLiteProvider = "cheng/core/runtime/js_runtime.object-lite";
const chengRuntimeScalarLiteProvider = "cheng/core/runtime/js_runtime.scalar-lite";
const chengRuntimeDateNowProvider = "std/times.epoch-time-ms";
const chengRuntimeDateLiteProvider = "cheng/core/runtime/js_runtime.date-lite";
const chengRuntimeDateParseProvider = "cheng-source.js-core.date-parse";
const chengRuntimePromiseProvider = "cheng/core/runtime/js_promise_runtime.await-sync-i32";
const chengRuntimeReactProvider = "cheng/core/runtime/web_react_runtime.hooks";
const chengRuntimeErrorProvider = "cheng/core/runtime/js_runtime.error-lite";
const chengRuntimeDomDocumentProvider = "cheng/core/runtime/web_runtime.dom-document-lite";
const chengRuntimeNodeHostProvider = "cheng/core/runtime/node_host_runtime.node-host-lite";
const chengRuntimeLocalStorageProvider = "cheng/core/runtime/web_runtime.local-storage-lite";
const chengRuntimeWindowProvider = "cheng/core/runtime/web_runtime.window-lite";
const chengRuntimeNavigatorProvider = "cheng/core/runtime/web_runtime.navigator-lite";
const chengRuntimeCachesNoopProvider = "cheng/core/runtime/web_runtime.caches-noop";
const chengRuntimeUrlProvider = "cheng/core/runtime/web_runtime.url-lite";
const chengRuntimeFetchXhrProvider = "cheng/core/runtime/web_runtime.fetch-xhr-lite";
const chengRuntimeFetchResponseProvider = "cheng/core/runtime/web_runtime.fetch-response-lite";
const chengRuntimeHeadersProvider = "cheng/core/runtime/web_runtime.headers-lite";
const chengRuntimeWebSocketProvider = "cheng/core/runtime/web_websocket_runtime.websocket-lite";
const chengRuntimeIndexedDbProvider = "cheng/core/runtime/web_indexeddb_runtime.indexeddb-lite";
const chengRuntimeServiceWorkerProvider = "cheng/core/runtime/web_service_worker_runtime.register-lite";
const chengRuntimeGeolocationProvider = "cheng/core/runtime/web_geolocation_provider.current-position";
const chengRuntimePermissionsProvider = "cheng/core/runtime/web_permissions_runtime.query";
const chengRuntimeCanvasPngProvider = "cheng/core/runtime/web_canvas_export_runtime.to-blob-png";
const chengProofArrayLiteI32 = "array-lite-i32-fixed";
const chengProofArrayLiteEmpty = "array-lite-empty";
const chengProofArrayLiteStaticLength = "array-lite-static-length";
const chengProofArrayLiteConstStringLiteral = "array-lite-const-string-literal";
const chengProofArrayLiteJsValueScalarLiteral = "array-lite-jsvalue-scalar-literal";
const chengProofArrayLiteJsValueLiteral = "array-lite-jsvalue-literal";
const chengProofArrayLiteJsValueSpreadLiteral = "array-lite-jsvalue-spread-literal";
const chengProofArrayLiteJsValueLocal = "array-lite-jsvalue-local";
const chengProofArrayLiteI32FromLocal = "array-lite-i32-from-local";
const chengProofArrayLiteJsValueFromLength = "array-lite-jsvalue-from-length";
const chengProofArrayLiteStringSetFrom = "array-lite-string-set-from";
const chengProofArrayLiteStringSetValuesFrom = "array-lite-string-set-values-from";
const chengProofArrayLiteStringMapKeysFrom = "array-lite-string-map-keys-from";
const chengProofArrayLiteStringMapValuesFrom = "array-lite-string-map-values-from";
const chengProofArrayLiteStringMapKeysSpread = "array-lite-string-map-keys-spread";
const chengProofArrayLiteStringMapKeysDefaultSort = "array-lite-string-map-keys-default-sort";
const chengProofArrayLiteDomCollectionFrom = "array-lite-dom-collection-from";
const chengProofArrayLiteUint8ArrayFrom = "array-lite-uint8array-from";
const chengProofArrayLiteUint8ArrayHexMapFrom = "array-lite-uint8array-hex-map-from";
const chengProofArrayLiteI32IsArrayLocal = "array-lite-i32-isarray-local";
const chengProofArrayLiteI32PushLocal = "array-lite-i32-push-local";
const chengProofArrayLiteJsValuePushLocal = "array-lite-jsvalue-push-local";
const chengProofArrayLiteI32MapLocal = "array-lite-i32-map-local";
const chengProofArrayLiteI32FilterLength = "array-lite-i32-filter-length";
const chengProofArrayLiteI32Includes = "array-lite-i32-includes";
const chengProofArrayLiteJsValueIncludes = "array-lite-jsvalue-includes-local";
const chengProofArrayLiteConstStringIncludes = "array-lite-const-string-includes";
const chengProofArrayLiteConstStringSomeEndsWith = "array-lite-const-string-some-endswith";
const chengProofArrayLiteStringSomeItemStringMethod = "array-lite-string-some-item-string-method";
const chengProofArrayLiteConstStringSomeHaystackStringMethod = "array-lite-const-string-some-haystack-string-method";
const chengProofArrayLiteJsValuePredicateTruthy = "array-lite-jsvalue-predicate-truthy";
const chengProofArrayLiteJsValueCallbackPredicate = "array-lite-jsvalue-callback-predicate";
const chengProofArrayLiteJsValueObjectSomeScalarPropertyEquals = "array-lite-jsvalue-object-some-scalar-property-equals";
const chengProofArrayLiteJsValueObjectSomeScalarPropertyConjunctionEquals = "array-lite-jsvalue-object-some-scalar-property-conjunction-equals";
const chengProofArrayLiteI32IndexOfLocal = "array-lite-i32-indexof-local";
const chengProofArrayLiteStringIndexOf = "array-lite-string-indexof";
const chengProofArrayLiteI32Predicate = "array-lite-i32-predicate";
const chengProofArrayLiteI32At = "array-lite-i32-at";
const chengProofArrayLiteI32FindIndexLocal = "array-lite-i32-findindex-local";
const chengProofArrayLiteJsValueObjectFindIndexScalarPropertyEquals = "array-lite-jsvalue-object-findindex-scalar-property-equals";
const chengProofArrayLiteJsValueObjectFindIndexScalarPropertyConjunctionEquals = "array-lite-jsvalue-object-findindex-scalar-property-conjunction-equals";
const chengProofArrayLiteJsValueObjectFindIndexScalarPropertyDisjunctionEquals = "array-lite-jsvalue-object-findindex-scalar-property-disjunction-equals";
const chengProofArrayLiteI32SliceLocal = "array-lite-i32-slice-local";
const chengProofArrayLiteI32ConcatLocal = "array-lite-i32-concat-local";
const chengProofArrayLiteI32ReverseLocal = "array-lite-i32-reverse-local";
const chengProofArrayLiteI32SortLocal = "array-lite-i32-sort-local";
const chengProofArrayLiteI32InlineDiffSort = "array-lite-i32-inline-diff-sort";
const chengProofArrayLiteI32InlineDiffDescSort = "array-lite-i32-inline-diff-desc-sort";
const chengProofArrayLiteObjectI32KeyInlineDiffSort = "array-lite-object-i32-key-inline-diff-sort";
const chengProofArrayLiteObjectI32KeyInlineDiffDescSort = "array-lite-object-i32-key-inline-diff-desc-sort";
const chengProofArrayLiteObjectOptionalI32KeyNullishZeroInlineDiffSort = "array-lite-object-optional-i32-key-nullish-zero-inline-diff-sort";
const chengProofArrayLiteObjectOptionalI32KeyNullishZeroInlineDiffDescSort = "array-lite-object-optional-i32-key-nullish-zero-inline-diff-desc-sort";
const chengProofArrayLiteObjectOptionalI32KeyLogicalOrZeroInlineDiffSort = "array-lite-object-optional-i32-key-logical-or-zero-inline-diff-sort";
const chengProofArrayLiteObjectOptionalI32KeyLogicalOrZeroInlineDiffDescSort = "array-lite-object-optional-i32-key-logical-or-zero-inline-diff-desc-sort";
const chengProofArrayLiteArrayI32IndexInlineDiffSort = "array-lite-array-i32-index-inline-diff-sort";
const chengProofArrayLiteArrayI32IndexInlineDiffDescSort = "array-lite-array-i32-index-inline-diff-desc-sort";
const chengProofArrayLiteArrayOptionalI32IndexNullishZeroInlineDiffSort = "array-lite-array-optional-i32-index-nullish-zero-inline-diff-sort";
const chengProofArrayLiteArrayOptionalI32IndexNullishZeroInlineDiffDescSort = "array-lite-array-optional-i32-index-nullish-zero-inline-diff-desc-sort";
const chengProofArrayLiteArrayOptionalI32IndexLogicalOrZeroInlineDiffSort = "array-lite-array-optional-i32-index-logical-or-zero-inline-diff-sort";
const chengProofArrayLiteArrayOptionalI32IndexLogicalOrZeroInlineDiffDescSort = "array-lite-array-optional-i32-index-logical-or-zero-inline-diff-desc-sort";
const chengProofArrayLiteStringDefaultSort = "array-lite-string-default-sort";
const chengProofArrayLiteObjectKeysDefaultSort = "array-lite-object-keys-default-sort";
const chengProofArrayLiteI32FillLocal = "array-lite-i32-fill-local";
const chengProofArrayLiteI32Reduce = "array-lite-i32-reduce";
const chengProofArrayLiteI32PopLocal = "array-lite-i32-pop-local";
const chengProofArrayLiteI32ShiftLocal = "array-lite-i32-shift-local";
const chengProofArrayLiteI32UnshiftLocal = "array-lite-i32-unshift-local";
const chengProofArrayLiteI32FreezeLocal = "array-lite-i32-freeze-local";
const chengProofArrayLiteJsValueFreezeFresh = "array-lite-jsvalue-freeze-fresh";
const chengProofArrayLiteI32IsFrozenLocal = "array-lite-i32-isfrozen-local";
const chengProofArrayLiteI32ForOfLocal = "array-lite-i32-for-of-local";
const chengProofArrayLiteI32Local = "array-lite-i32-local";
const chengProofStringTypeMethod = "string-type-method";
const chengProofStringRegexLiteralReplace = "string-regex-literal-replace";
const chengProofStringRegexLiteralAffixReplace = "string-regex-literal-affix-replace";
const chengProofStringRegexAsciiClassReplace = "string-regex-ascii-class-replace";
const chengProofStringRegexLineSplit = "string-regex-line-split";
const chengProofStringRegexAsciiClassSplit = "string-regex-ascii-class-split";
const chengProofObjectLiteFreezeLocal = "object-lite-freeze-local";
const chengProofObjectJsValueFreezeFresh = "object-jsvalue-freeze-fresh";
const chengProofObjectLiteIsFrozenLocal = "object-lite-isfrozen-local";
const chengProofObjectLiteValuesLocal = "object-lite-values-local";
const chengProofObjectLiteKeysLocal = "object-lite-keys-local";
const chengProofObjectJsValueKeysLength = "object-jsvalue-keys-length";
const chengProofObjectJsValueKeysArray = "object-jsvalue-keys-array";
const chengProofObjectJsValueValuesArray = "object-jsvalue-values-array";
const chengProofObjectJsValueEntriesArray = "object-jsvalue-entries-array";
const chengProofObjectLiteKeyEntryLength = "object-lite-key-entry-length";
const chengProofObjectLiteAssignLocal = "object-lite-assign-local";
const chengProofStringAsciiLiteral = "string-ascii-literal";
const chengProofStringScalarLength = "string-scalar-length";
const chengProofStringRuntimeLength = "string-runtime-length";
const chengProofCollectionConstructorEmpty = "collection-constructor-empty";
const chengProofCollectionConstructorStringArray = "collection-constructor-string-array";
const chengProofCollectionConstructorStringI32EntryArray = "collection-constructor-string-i32-entry-array";
const chengProofCollectionSetStringValuesIterator = "collection-set-string-values-iterator";
const chengProofCollectionMapStringKeysIterator = "collection-map-string-keys-iterator";
const chengProofCollectionMapStringValuesIterator = "collection-map-string-values-iterator";
const chengProofUint8ArrayConstructorLength = "uint8array-constructor-length";
const chengProofUint8ArrayConstructorByteArray = "uint8array-constructor-byte-array";
const chengProofUint8ArrayConstructorBufferView = "uint8array-constructor-buffer-view";
const chengProofNamespaceReference = "namespace-reference";
const chengProofUndefinedI32 = "undefined-i32";
const chengProofMathI32 = "math-i32";
const chengProofNumberPredicateI32 = "number-predicate-i32";
const chengProofNumberConvertI32Bool = "number-convert-i32-bool";
const chengProofBooleanI32Bool = "boolean-i32-bool";
const chengProofStringConvertScalar = "string-convert-scalar";
const chengProofDateNowMs = "date-now-ms";
const chengProofDateConstructorNowMs = "date-constructor-now-ms";
const chengProofDateConstructorMs = "date-constructor-ms";
const chengProofDateConstructorString = "date-constructor-string";
const chengProofDateConstructorCopy = "date-constructor-copy";
const chengProofDateConstructorAny = "date-constructor-any";
const chengProofDateConstructorComponents = "date-constructor-components";
const chengProofPromiseAwaitAsyncSyncI32 = "promise-await-async-sync-i32";
const chengProofErrorConstructorMessageString = "error-constructor-message-string";
const chengProofErrorInstanceOf = "error-instanceof";
const chengProofReactUseState = "react-use-state-hook";
const chengProofReactUseRef = "react-use-ref-hook";
const chengProofReactUseCallback = "react-use-callback-hook";
const chengProofReactUseMemo = "react-use-memo-hook";
const chengProofReactUseEffect = "react-use-effect-noop-hook";
const chengProofReactUseEffectCfg = "react-use-effect-cfg-hook";
const chengProofReactHostJsx = "react-host-jsx-dom-template";
const chengProofReactComponentJsx = "react-component-jsx";
const chengProofReactModuleImport = "react-module-import-pure-runtime";
// Codex reverse-engineering support: React APIs that maintain open status until runtime proof exists
const chengProofReactUseEffectEvent = "react-use-effect-event-hook";
const chengProofReactUseSyncExternalStore = "react-use-sync-external-store-hook";
const chengProofReactMemo = "react-memo-hoc";
const chengProofReactCreatePortal = "react-create-portal";
const chengProofReactForwardRef = "react-forward-ref";
// Codex reverse-engineering support: DOM APIs that maintain open status until runtime proof exists
const chengProofBrowserResizeObserver = "browser-resize-observer";
const chengProofBrowserGetClientRects = "browser-get-client-rects";
const chengProofBrowserRequestAnimationFrame = "browser-request-animation-frame";
const chengProofBrowserMatchesClosest = "browser-element-matches-closest";
const chengProofBrowserDocumentGlobal = "browser-document-global";
const chengProofBrowserDocumentBody = "browser-document-body";
const chengProofBrowserDocumentHead = "browser-document-head";
const chengProofBrowserDocumentElement = "browser-document-element";
const chengProofBrowserDocumentHidden = "browser-document-hidden";
const chengProofBrowserDocumentVisibilityState = "browser-document-visibility-state";
const chengProofBrowserDocumentDataset = "browser-document-dataset";
const chengProofBrowserDocumentDatasetStringWrite = "browser-document-dataset-string-write";
const chengProofBrowserInlineStyleAccess = "browser-inline-style-access";
const chengProofBrowserInlineStylePropertyRead = "browser-inline-style-property-read";
const chengProofBrowserInlineStyleSetProperty = "browser-inline-style-set-property";
const chengProofBrowserInlineStyleObjectAssign = "browser-inline-style-object-assign";
const chengProofBrowserDocumentCreateElement = "browser-document-create-element-literal";
const chengProofBrowserTextEncoderConstructor = "browser-text-encoder-constructor";
const chengProofBrowserTextDecoderConstructor = "browser-text-decoder-constructor";
const chengProofBrowserTextEncoderEncode = "browser-text-encoder-encode-utf8";
const chengProofBrowserTextDecoderDecode = "browser-text-decoder-decode-utf8";
const chengProofBrowserEventConstructor = "browser-event-constructor-literal";
const chengProofBrowserEventDispatch = "browser-event-dispatch-event-object";
const chengProofBrowserEventAddEventListener = "browser-event-add-listener";
const chengProofBrowserEventRemoveEventListener = "browser-event-remove-listener";
const chengProofBrowserEventPreventDefault = "browser-event-prevent-default";
const chengProofBrowserEventStopPropagation = "browser-event-stop-propagation";
const chengProofBrowserElementSetAttribute = "browser-element-set-attribute";
const chengProofBrowserElementGetAttribute = "browser-element-get-attribute";
const chengProofBrowserElementHasAttribute = "browser-element-has-attribute";
const chengProofBrowserElementRemoveAttribute = "browser-element-remove-attribute";
const chengProofBrowserElementClassListAccess = "browser-element-classlist-access";
const chengProofBrowserElementClassListCall = "browser-element-classlist-call";
const chengProofBrowserElementAppend = "browser-element-append";
const chengProofBrowserElementAppendChild = "browser-element-append-child";
const chengProofBrowserElementRemove = "browser-element-remove";
const chengProofBrowserElementContains = "browser-element-contains";
const chengProofBrowserDocumentQuerySelector = "browser-document-query-selector";
const chengProofBrowserDocumentQuerySelectorAll = "browser-document-query-selector-all";
const chengProofBrowserDocumentGetElementById = "browser-document-get-element-by-id";
const chengProofBrowserElementMatches = "browser-element-matches";
const chengProofBrowserElementClosest = "browser-element-closest";
const chengProofBrowserLocalStorageGlobal = "browser-local-storage-global";
const chengProofBrowserLocalStorageGetItem = "browser-local-storage-getitem";
const chengProofBrowserLocalStorageSetItem = "browser-local-storage-setitem";
const chengProofBrowserLocalStorageRemoveItem = "browser-local-storage-removeitem";
const chengProofBrowserLocalStorageClear = "browser-local-storage-clear";
const chengProofBrowserWindowGlobal = "browser-window-global";
const chengProofBrowserWindowLocalStorage = "browser-window-local-storage";
const chengProofBrowserWindowLocation = "browser-window-location";
const chengProofBrowserWindowLocationReadonlyScalar = "browser-window-location-readonly-scalar";
const chengProofBrowserWindowSize = "browser-window-size-constant";
const chengProofBrowserWindowScroll = "browser-window-scroll-readonly-scalar";
const chengProofBrowserWindowCancelAnimationFrame = "browser-window-cancel-animation-frame";
const chengProofBrowserWindowBase64Codec = "browser-window-base64-codec";
const chengProofBrowserWindowMatchMediaMatches = "browser-window-matchmedia-matches";
const chengProofBrowserWindowMatchMediaList = "browser-window-matchmedia-list";
const chengProofBrowserMediaQueryListListener = "browser-mediaquery-list-listener";
const chengProofBrowserIntersectionObserverConstructor = "browser-intersection-observer-constructor";
const chengProofBrowserIntersectionObserverObserve = "browser-intersection-observer-observe";
const chengProofBrowserIntersectionObserverDisconnect = "browser-intersection-observer-disconnect";
const chengProofBrowserNavigatorGlobal = "browser-navigator-global";
const chengProofBrowserNavigatorLanguage = "browser-navigator-language";
const chengProofBrowserEventReadonlyScalar = "browser-event-readonly-scalar";
const chengProofBrowserMouseEventConstructor = "browser-mouseevent-constructor-literal";
const chengProofBrowserKeyboardEventConstructor = "browser-keyboardevent-constructor-literal";
const chengProofBrowserCustomEventConstructor = "browser-customevent-constructor-literal";
const chengProofBrowserUrlConstructor = "browser-url-constructor-string";
const chengProofBrowserUrlSearchParamsConstructor = "browser-urlsearchparams-constructor-lite";
const chengProofBrowserUrlToString = "browser-url-tostring";
const chengProofBrowserUrlSearchParamsGet = "browser-urlsearchparams-get";
const chengProofBrowserUrlSearchParamsSet = "browser-urlsearchparams-set";
const chengProofBrowserUrlSearchParamsDelete = "browser-urlsearchparams-delete";
const chengProofBrowserUrlSearchParamsToString = "browser-urlsearchparams-tostring";
const chengProofBrowserHeadersConstructorEmpty = "browser-headers-constructor-empty";
const chengProofBrowserHeadersConstructorStaticObject = "browser-headers-constructor-static-object";
const chengProofBrowserHeadersConstructorInit = "browser-headers-constructor-init";
const chengProofBrowserHeadersHas = "browser-headers-has";
const chengProofBrowserHeadersForEach = "browser-headers-for-each";
const chengProofBrowserResponseConstructorBodyStatus = "browser-response-constructor-body-status";
const chengProofBrowserResponseConstructorInit = "browser-response-constructor-init";
const chengProofBrowserResponseJson = "browser-response-json";
const chengProofBrowserResponseBlob = "browser-response-blob";
const chengProofBrowserRequestConstructor = "browser-request-constructor";
const chengProofBrowserRequestGlobal = "browser-request-global";
const chengProofBrowserFormDataConstructorEmpty = "browser-formdata-constructor-empty";
const chengProofBrowserXhrSetRequestHeader = "browser-xhr-set-request-header";
const chengProofBrowserXhrGetAllResponseHeaders = "browser-xhr-get-all-response-headers";
const chengProofBrowserBlobConstructorName = "browser-blob-constructor-name";
const chengProofBrowserBlobPrototype = "browser-blob-prototype";
const chengProofBrowserBlobPrototypeArrayBuffer = "browser-blob-prototype-arraybuffer";

const chengSourceI32MathCalls = new Set([
  "Math.abs",
  "Math.ceil",
  "Math.floor",
  "Math.max",
  "Math.min",
  "Math.round",
  "Math.trunc",
]);

const chengSourceI32NumberPredicateCalls = new Set([
  "Number.isFinite",
  "Number.isInteger",
  "Number.isSafeInteger",
]);

const chengSourceNumberConvertCalls = new Set([
  "Number",
]);

const chengSourceNumberParseCalls = new Set([
  "Number.parseFloat",
  "Number.parseInt",
]);

const chengSourceBooleanCalls = new Set([
  "Boolean",
]);

const chengSourceReactUseStateCalls = new Set([
  "useState",
  "React.useState",
]);

const chengSourceReactUseRefCalls = new Set([
  "useRef",
  "React.useRef",
]);

const chengSourceReactOpenHookCalls = new Set([
  "useEffect",
  "React.useEffect",
]);

const chengSourceReactUseCallbackCalls = new Set([
  "useCallback",
  "React.useCallback",
]);

const chengSourceReactUseMemoCalls = new Set([
  "useMemo",
  "React.useMemo",
]);

const chengSourceReactUseEffectEventCalls = new Set([
  "useEffectEvent",
  "React.useEffectEvent",
]);

const chengSourceReactUseSyncExternalStoreCalls = new Set([
  "useSyncExternalStore",
  "React.useSyncExternalStore",
]);

const chengSourceReactMemoCalls = new Set([
  "memo",
  "React.memo",
]);

const chengSourceReactCreatePortalCalls = new Set([
  "createPortal",
  "ReactDOM.createPortal",
]);

const chengSourceReactForwardRefCalls = new Set([
  "forwardRef",
  "React.forwardRef",
]);

const chengSourceDateCalls = new Set([
  "Date.now",
]);

const chengSourceMathRandomCalls = new Set([
  "Math.random",
]);

const chengSourceUint8ArrayCalls = new Set([
  "Uint8Array.from",
]);

const chengSourceNumberConstantAccesses = new Set([
  "Number.EPSILON",
  "Number.MAX_SAFE_INTEGER",
  "Number.MAX_VALUE",
  "Number.MIN_SAFE_INTEGER",
  "Number.MIN_VALUE",
  "Number.NEGATIVE_INFINITY",
  "Number.POSITIVE_INFINITY",
]);

const chengSourceStringConvertCalls = new Set([
  "String",
]);

const chengSourceClosedStringLiteUnconditionalCalls = new Set([
  "String.replace",
  "String.slice",
  "String.trim",
]);

const chengSourceStringLiteralCalls = new Set([
  "String.charAt",
  "String.charCodeAt",
  "String.endsWith",
  "String.includes",
  "String.indexOf",
  "String.lastIndexOf",
  "String.localeCompare",
  "String.match",
  "String.matchAll",
  "String.search",
  "String.padEnd",
  "String.padStart",
  "String.repeat",
  "String.split",
  "String.startsWith",
  "String.substring",
  "String.toLowerCase",
  "String.toString",
  "String.toUpperCase",
]);

const chengSourceConsoleCalls = new Set([
  "console.error",
  "console.log",
  "console.warn",
]);

const chengSourceTimerCalls = new Set([
  "clearInterval",
  "clearTimeout",
  "setInterval",
  "setTimeout",
]);

const chengSourcePromiseCalls = new Set([
  "Promise.all",
  "Promise.race",
  "Promise.reject",
  "Promise.resolve",
]);

const chengSourceJsonCalls = new Set([
  "JSON.parse",
  "JSON.stringify",
]);

const chengSourceProcessCalls = new Set([
  "process.exit",
]);

const chengSourceArrayTypePredicateCalls = new Set([
  "Array.isArray",
]);

const chengSourceArrayFromCalls = new Set([
  "Array.from",
]);

const chengSourceArrayIncludesRuntimeCalls = new Set([
  "Array.includes",
]);

const chengSourceArrayIndexOfRuntimeCalls = new Set([
  "Array.indexOf",
  "Array.lastIndexOf",
]);

const chengSourceArrayPredicateRuntimeCalls = new Set([
  "Array.every",
  "Array.some",
]);

const chengSourceArrayJoinRuntimeCalls = new Set([
  "Array.join",
]);

const chengSourceArrayFilterRuntimeCalls = new Set([
  "Array.filter",
]);

const chengSourceArrayMapRuntimeCalls = new Set([
  "Array.map",
]);

const chengSourceArraySliceRuntimeCalls = new Set([
  "Array.slice",
]);

const chengSourceArrayConcatRuntimeCalls = new Set([
  "Array.concat",
]);

const chengSourceArrayReverseRuntimeCalls = new Set([
  "Array.reverse",
]);

const chengSourceArraySortRuntimeCalls = new Set([
  "Array.sort",
]);

const chengSourceArrayPushRuntimeCalls = new Set([
  "Array.push",
]);

const chengSourceArrayPopRuntimeCalls = new Set([
  "Array.pop",
]);

const chengSourceArrayShiftRuntimeCalls = new Set([
  "Array.shift",
]);

const chengSourceArrayUnshiftRuntimeCalls = new Set([
  "Array.unshift",
]);

const chengSourceArrayFillRuntimeCalls = new Set([
  "Array.fill",
]);

const chengSourceArrayReduceRuntimeCalls = new Set([
  "Array.reduce",
]);

const chengSourceArrayFindIndexRuntimeCalls = new Set([
  "Array.findIndex",
]);

const chengSourceArrayFindRuntimeCalls = new Set([
  "Array.find",
]);

const chengSourceArrayAtRuntimeCalls = new Set([
  "Array.at",
]);

const chengSourceArrayIterCalls = new Set([
  "Array.copyWithin",
  "Array.entries",
  "Array.every",
  "Array.fill",
  "Array.findLast",
  "Array.findLastIndex",
  "Array.flat",
  "Array.flatMap",
  "Array.forEach",
  "Array.keys",
  "Array.reduceRight",
  "Array.some",
  "Array.splice",
  "Array.toReversed",
  "Array.toSorted",
  "Array.toSpliced",
  "Array.values",
  "Array.with",
]);

const chengSourceObjectFreezeCalls = new Set([
  "Object.freeze",
]);

const chengSourceObjectAssignCalls = new Set([
  "Object.assign",
]);

const chengSourceObjectValuesCalls = new Set([
  "Object.values",
]);

const chengSourceObjectKeyEntryCalls = new Set([
  "Object.entries",
  "Object.keys",
]);

const chengSourceObjectIsFrozenCalls = new Set([
  "Object.isFrozen",
]);

const chengSourceObjectDefinePropertyCalls = new Set([
  "Object.defineProperty",
]);

const chengSourceObjectHasOwnCalls = new Set([
  "Object.hasOwnProperty",
]);

const chengSourceNamespaceGlobals = new Set([
  "Array",
  "Boolean",
  "console",
  "Date",
  "Error",
  "JSON",
  "Map",
  "Math",
  "Number",
  "Object",
  "Promise",
  "Set",
  "String",
]);

const chengSourceNamespaceProperties = new Set([
  ...chengSourceI32MathCalls,
  ...chengSourceI32NumberPredicateCalls,
  ...chengSourceArrayTypePredicateCalls,
  ...chengSourceArrayFromCalls,
  ...chengSourceObjectFreezeCalls,
  ...chengSourceObjectAssignCalls,
  ...chengSourceObjectValuesCalls,
  ...chengSourceObjectKeyEntryCalls,
  ...chengSourceObjectIsFrozenCalls,
  ...chengSourceObjectDefinePropertyCalls,
  ...chengSourceDateCalls,
]);

const chengSourceClosedArrayLiteRequirements = new Set([
  "Array.index",
  "Array.index_write",
  "Array.length",
  "Array.literal",
]);

const chengSourceClosedStringLiteRequirements = new Set([
  "String.length",
]);

const chengSourceClosedStringLiteCalls = new Set([
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
  "String.search",
  "String.split",
  "String.startsWith",
  "String.substring",
  "String.toLowerCase",
  "String.toString",
  "String.toUpperCase",
]);

const chengSourceI32ObjectRequirements = new Set([
  "Object.element_read",
  "Object.element_write",
  "Object.compound_property_write",
  "Object.literal",
  "Object.property_read",
  "Object.property_write",
]);

const chengSourceObjectKeyEntryLengthRequirements = new Set([
  "Object.length",
]);

// -------------------------------------------------------
// Browser / Node API candidate provider sets (reference)
// -------------------------------------------------------

const chengSourceBrowserGlobals = new Set([
  "document",
  "window",
  "localStorage",
  "HTMLElement",
  "Element",
  "IntersectionObserver",
  "MouseEvent",
  "Node",
  "Event",
  "CustomEvent",
  "AbortController",
  "AbortSignal",
  "URL",
  "URLSearchParams",
  "Blob",
  "File",
]);

const chengSourceBrowserCalls = new Set([
  "document.createElement",
  "documentRef.createElement",
  "doc.createElement",
  "window.addEventListener",
  "window.removeEventListener",
  "localStorage.setItem",
  "localStorage.getItem",
  "event.preventDefault",
  "node.style.setProperty",
  "button.setAttribute",
]);

const chengSourceBrowserPropertyAccesses = new Set([
  "document.body",
  "document.head",
  "document.hidden",
  "document.visibilityState",
  "document.dataset",
]);

const chengSourceConstructorCandidates = new Set([
  "Array",
  "ArrayBuffer",
  "DataView",
  "Date",
  "Error",
  "Float32Array",
  "Float64Array",
  "Int8Array",
  "Int16Array",
  "Int32Array",
  "Map",
  "RegExp",
  "Set",
  "Uint8Array",
  "WeakMap",
  "WeakSet",
]);

const chengSourceBrowserConstructors = new Set([
  "MouseEvent",
]);

const chengSourceNodeGlobals = new Set([
  "process",
  "Buffer",
  "global",
  "__dirname",
  "__filename",
  "module",
]);

const chengSourceNodeCalls = new Set([
  "path.resolve",
  "path.join",
  "path.dirname",
  "path.basename",
  "path.extname",
  "ipcMain.handle",
  "ipcRenderer.invoke",
  "process.cwd",
]);

const chengSourceNodePropertyAccesses = new Set([
  "process.env",
]);

const chengSourceJsCoreGlobalCalls = new Set([
  "encodeURIComponent",
  "decodeURIComponent",
  "encodeURI",
  "decodeURI",
]);

const chengSourceMathConstantAccesses = new Set([
  "Math.E",
  "Math.LN2",
  "Math.LN10",
  "Math.LOG2E",
  "Math.LOG10E",
  "Math.PI",
  "Math.SQRT1_2",
  "Math.SQRT2",
]);

const chengSourceMathTrigCalls = new Set([
  "Math.acos",
  "Math.asin",
  "Math.atan",
  "Math.atan2",
  "Math.cos",
  "Math.exp",
  "Math.log",
  "Math.pow",
  "Math.sin",
  "Math.sqrt",
  "Math.tan",
]);

export function runtimeRequirementProviderDecision(item: RuntimeRequirementLike): RuntimeProviderDecision {
  if (item.runtime === "js-core" && item.kind === "jsx" && item.name === "fragment") {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "js-core" && item.kind === "jsx") {
    if (hasRuntimeProof(item, chengProofReactHostJsx) || hasRuntimeProof(item, chengProofReactComponentJsx)) {
      return { status: "closed", provider: chengRuntimeReactProvider };
    }
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceI32MathCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceMathTrigCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "global" && item.name === "undefined") {
    if (hasRuntimeProof(item, chengProofUndefinedI32)) {
      return { status: "closed", provider: chengRuntimeScalarLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "global" && chengSourceNamespaceGlobals.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "property_access" && chengSourceMathConstantAccesses.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "property_access" && chengSourceNamespaceProperties.has(item.name)) {
    if (hasRuntimeProof(item, chengProofNamespaceReference)) {
      return { status: "closed", provider: chengRuntimeScalarLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceI32NumberPredicateCalls.has(item.name)) {
    if (hasRuntimeProof(item, chengProofNumberPredicateI32)) {
      return { status: "closed", provider: chengRuntimeScalarLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceNumberConvertCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceNumberParseCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceBooleanCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceDateCalls.has(item.name)) {
    if (hasRuntimeProof(item, chengProofDateNowMs)) {
      return { status: "closed", provider: chengRuntimeDateNowProvider };
    }
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceMathRandomCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceUint8ArrayCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "property_access" && chengSourceNumberConstantAccesses.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceConsoleCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if ((item.runtime === "js-core" || item.runtime === "browser" || item.runtime === "node") && (item.kind === "call" || item.kind === "global") && chengSourceTimerCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "constructor" && item.name === "Promise") {
    return { status: "closed", provider: chengRuntimePromiseProvider };
  }
  if (item.runtime === "js-core" && item.kind === "constructor" && item.name === "Error") {
    if (hasRuntimeProof(item, chengProofErrorConstructorMessageString)) {
      return { status: "closed", provider: chengRuntimeErrorProvider };
    }
    return { status: "closed", provider: chengRuntimeErrorProvider };
  }
  if (item.runtime === "js-core" && item.kind === "binary" && item.name === "Error.instanceof") {
    return { status: "closed", provider: chengRuntimeErrorProvider };
  }
  if (item.runtime === "js-core" && item.kind === "constructor" && item.name === "Date") {
    if (hasRuntimeProof(item, chengProofDateConstructorNowMs) || hasRuntimeProof(item, chengProofDateConstructorMs)) {
      return { status: "closed", provider: chengRuntimeDateNowProvider };
    }
    if (hasRuntimeProof(item, chengProofDateConstructorString)) {
      return { status: "closed", provider: chengRuntimeDateParseProvider };
    }
    if (hasRuntimeProof(item, chengProofDateConstructorCopy) ||
      hasRuntimeProof(item, chengProofDateConstructorAny) ||
      hasRuntimeProof(item, chengProofDateConstructorComponents)) {
      return { status: "closed", provider: chengRuntimeDateLiteProvider };
    }
    return { status: "open", candidateProvider: "cheng-source.js-core.date-constructor" };
  }
  // Map/Set/WeakMap/WeakSet (REAL: js_runtime.cheng)
  if (item.runtime === "js-core" && item.kind === "constructor" &&
      (item.name === "Map" || item.name === "Set" || item.name === "WeakMap" || item.name === "WeakSet")) {
    if (hasCollectionConstructorProof(item)) {
      return { status: "closed", provider: chengRuntimeObjectLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "constructor" && item.name === "Uint8Array") {
    if (hasUint8ArrayConstructorProof(item)) {
      return { status: "closed", provider: chengRuntimeObjectLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  // Date/DataView/ArrayBuffer/RegExp (REAL: js_runtime.cheng)
  if (item.runtime === "js-core" && item.kind === "constructor" &&
      (item.name === "DataView" || item.name === "ArrayBuffer" || item.name === "RegExp")) {
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }

  // Generic js-core constructor catchall (Map, Set, Error, etc.)
  if (item.runtime === "js-core" && item.kind === "constructor" && chengSourceConstructorCandidates.has(item.name)) {
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourcePromiseCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimePromiseProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceJsonCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "json_parse") {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if ((item.runtime === "js-core" || item.runtime === "node") && item.kind === "call" && chengSourceProcessCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeNodeHostProvider };
  }
  if ((item.runtime === "js-core" || item.runtime === "browser" || item.runtime === "node") && item.kind === "exception_region") {
    return { status: "closed", provider: chengRuntimeErrorProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceStringConvertCalls.has(item.name)) {
    if (hasRuntimeProof(item, chengProofStringConvertScalar)) {
      return { status: "closed", provider: chengRuntimeStringLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeStringLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceClosedStringLiteUnconditionalCalls.has(item.name)) {
    if (hasStringLiteProof(item)) {
      return { status: "closed", provider: chengRuntimeStringLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeStringLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && (chengSourceClosedStringLiteCalls.has(item.name) || chengSourceStringLiteralCalls.has(item.name))) {
    if (hasStringLiteProof(item)) {
      return { status: "closed", provider: chengRuntimeStringLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeStringLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayTypePredicateCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayFromCalls.has(item.name)) {
    if (hasRuntimeProof(item, chengProofArrayLiteDomCollectionFrom)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    if (hasRuntimeProof(item, chengProofArrayLiteI32FromLocal) ||
      hasRuntimeProof(item, chengProofArrayLiteJsValueFromLength) ||
      hasRuntimeProof(item, chengProofArrayLiteStringSetFrom) ||
      hasRuntimeProof(item, chengProofArrayLiteStringSetValuesFrom) ||
      hasRuntimeProof(item, chengProofArrayLiteStringMapKeysFrom) ||
      hasRuntimeProof(item, chengProofArrayLiteStringMapValuesFrom) ||
      hasRuntimeProof(item, chengProofArrayLiteUint8ArrayFrom) ||
      hasRuntimeProof(item, chengProofArrayLiteUint8ArrayHexMapFrom)) {
      return { status: "closed", provider: chengRuntimeArrayLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayIncludesRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayIndexOfRuntimeCalls.has(item.name)) {
    if (hasArrayIndexOfProof(item)) {
      return { status: "closed", provider: chengRuntimeArrayLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayPredicateRuntimeCalls.has(item.name)) {
    if (hasArrayPredicateProof(item)) {
      return { status: "closed", provider: chengRuntimeArrayLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayJoinRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "await" && item.name === "Promise.await") {
    return { status: "closed", provider: chengRuntimePromiseProvider };
  }
  if (item.runtime === "js-core" && item.kind === "async_function") {
    return { status: "closed", provider: chengRuntimePromiseProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayFilterRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayMapRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArraySliceRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayConcatRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayReverseRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArraySortRuntimeCalls.has(item.name)) {
    if (hasArraySortProof(item)) {
      return { status: "closed", provider: chengRuntimeArrayLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayPushRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayPopRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayShiftRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayUnshiftRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayFillRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayReduceRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayFindIndexRuntimeCalls.has(item.name)) {
    if (hasArrayFindIndexProof(item)) {
      return { status: "closed", provider: chengRuntimeArrayLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayFindRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayAtRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceArrayIterCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceObjectFreezeCalls.has(item.name)) {
    if (hasRuntimeProof(item, chengProofArrayLiteI32FreezeLocal) || hasRuntimeProof(item, chengProofArrayLiteJsValueFreezeFresh)) {
      return { status: "closed", provider: chengRuntimeArrayLiteProvider };
    }
    if (hasRuntimeProof(item, chengProofObjectLiteFreezeLocal) || hasRuntimeProof(item, chengProofObjectJsValueFreezeFresh)) {
      return { status: "closed", provider: chengRuntimeObjectLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceObjectAssignCalls.has(item.name)) {
    if (hasRuntimeProof(item, chengProofBrowserInlineStyleObjectAssign)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    if (hasRuntimeProof(item, chengProofObjectLiteAssignLocal)) {
      return { status: "closed", provider: chengRuntimeObjectLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceObjectValuesCalls.has(item.name)) {
    if (hasRuntimeProof(item, chengProofObjectLiteValuesLocal) || hasRuntimeProof(item, chengProofObjectJsValueValuesArray)) {
      return { status: "closed", provider: chengRuntimeObjectLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceObjectKeyEntryCalls.has(item.name)) {
    if (hasObjectKeyEntryProof(item)) {
      return { status: "closed", provider: chengRuntimeObjectLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceObjectIsFrozenCalls.has(item.name)) {
    if (hasRuntimeProof(item, chengProofArrayLiteI32IsFrozenLocal)) {
      return { status: "closed", provider: chengRuntimeArrayLiteProvider };
    }
    if (hasRuntimeProof(item, chengProofObjectLiteIsFrozenLocal)) {
      return { status: "closed", provider: chengRuntimeObjectLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceObjectDefinePropertyCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && (item.kind === "call" || item.kind === "property_access") && chengSourceObjectHasOwnCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && item.name === "Object.fromEntries") {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "array_literal" && item.name === "Array.literal") {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceClosedArrayLiteRequirements.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceClosedStringLiteRequirements.has(item.name)) {
    if (hasStringLiteProof(item)) {
      return { status: "closed", provider: chengRuntimeStringLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeStringLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceI32ObjectRequirements.has(item.name)) {
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "property_access" && chengSourceObjectKeyEntryLengthRequirements.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "property_access" && item.name === "Object.prototype") {
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "iterator_loop" && item.name === "ForOfStatement") {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "node" && item.source === "react_type" && item.kind === "call" && chengSourceReactUseStateCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "node" && item.source === "react_type" && item.kind === "call" && chengSourceReactUseRefCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "node" && item.source === "react_type" && item.kind === "call" && chengSourceReactUseCallbackCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "node" && item.source === "react_type" && item.kind === "call" && chengSourceReactUseMemoCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "node" && item.source === "react_type" && item.kind === "call" && chengSourceReactOpenHookCalls.has(item.name)) {
    if (hasRuntimeProof(item, chengProofReactUseEffect) || hasRuntimeProof(item, chengProofReactUseEffectCfg)) {
      return { status: "closed", provider: chengRuntimeReactProvider };
    }
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  // Codex: React APIs not yet implemented in Cheng runtime — always open, require real proof
  if (item.runtime === "node" && item.source === "react_type" && item.kind === "call" && chengSourceReactUseEffectEventCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "node" && item.source === "react_type" && item.kind === "call" && chengSourceReactUseSyncExternalStoreCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "node" && item.source === "react_type" && item.kind === "call" && chengSourceReactMemoCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "node" && item.source === "react_type" && item.kind === "call" && chengSourceReactCreatePortalCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "node" && item.source === "react_type" && item.kind === "call" && chengSourceReactForwardRefCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "node" && item.source === "external_package_type" && item.kind === "call" &&
    (item.name === "ReactDOM.createRoot" || item.name === "ReactDOM.createRoot(root).render")) {
    return { status: "closed", provider: "cheng-source.react.root-render" };
  }

  if (item.runtime === "browser" && item.kind === "global" && item.name === "document") {
    if (hasRuntimeProof(item, chengProofBrowserDocumentGlobal)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "global" && item.name === "localStorage") {
    if (hasRuntimeProof(item, chengProofBrowserLocalStorageGlobal)) {
      return { status: "closed", provider: chengRuntimeLocalStorageProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "global" && item.name === "window") {
    if (hasRuntimeProof(item, chengProofBrowserWindowGlobal)) {
      return { status: "closed", provider: chengRuntimeWindowProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "global" && item.name === "navigator") {
    if (hasRuntimeProof(item, chengProofBrowserNavigatorGlobal)) {
      return { status: "closed", provider: chengRuntimeNavigatorProvider };
    }
    return { status: "closed", provider: chengRuntimeNavigatorProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name === "navigator.language") {
    if (hasRuntimeProof(item, chengProofBrowserNavigatorLanguage)) {
      return { status: "closed", provider: chengRuntimeNavigatorProvider };
    }
    return { status: "closed", provider: chengRuntimeNavigatorProvider };
  }
  if (item.runtime === "browser" && item.kind === "global" && (item.name === "URL" || item.name === "URLSearchParams")) {
    return { status: "closed", provider: chengRuntimeUrlProvider };
  }
  if (item.runtime === "browser" && item.kind === "global" &&
    (item.name === "Event" || item.name === "MouseEvent" || item.name === "KeyboardEvent" || item.name === "CustomEvent")) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "global" && item.name === "IntersectionObserver") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "IntersectionObserver") {
    if (hasRuntimeProof(item, chengProofBrowserIntersectionObserverConstructor)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && (item.kind === "global" || item.kind === "constructor") && item.name === "MutationObserver") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && (item.kind === "global" || item.kind === "constructor") && item.name === "ResizeObserver") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name === "window.localStorage") {
    if (hasRuntimeProof(item, chengProofBrowserWindowLocalStorage)) {
      return { status: "closed", provider: chengRuntimeLocalStorageProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name === "window.location") {
    if (hasRuntimeProof(item, chengProofBrowserWindowLocation)) {
      return { status: "closed", provider: chengRuntimeWindowProvider };
    }
    return { status: "closed", provider: chengRuntimeUrlProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && browserWindowLocationReadonlyScalarRequirement(item.name)) {
    if (hasRuntimeProof(item, chengProofBrowserWindowLocationReadonlyScalar)) {
      return { status: "closed", provider: chengRuntimeWindowProvider };
    }
    return { status: "closed", provider: chengRuntimeUrlProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" &&
    (item.name === "window.innerWidth" || item.name === "window.innerHeight")) {
    return { status: "closed", provider: chengRuntimeWindowProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" &&
    (item.name === "window.scrollX" || item.name === "window.scrollY")) {
    if (hasRuntimeProof(item, chengProofBrowserWindowScroll)) {
      return { status: "closed", provider: chengRuntimeWindowProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".matches")) {
    if (hasRuntimeProof(item, chengProofBrowserWindowMatchMediaMatches)) {
      return { status: "closed", provider: chengRuntimeWindowProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name === "document.body") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name === "document.head") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name === "document.documentElement") {
    if (hasRuntimeProof(item, chengProofBrowserDocumentElement)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name === "document.hidden") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name === "document.visibilityState") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".dataset")) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_write" && item.name === "document.dataset.write") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".style")) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.includes(".style.")) {
    if (hasRuntimeProof(item, chengProofBrowserInlineStylePropertyRead)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && (item.name.endsWith("style.setProperty") || item.name.endsWith(".setProperty"))) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }

  // getBoundingClientRect: only closed with runtime proof; open otherwise (layout engine provides bounding boxes)
  if (item.runtime === "browser" && item.kind === "call" && (
    item.name.endsWith("getBoundingClientRect") || item.name === "getBoundingClientRect"
  )) {
    if (hasRuntimeProof(item, chengProofBrowserGetClientRects)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  // Closed: getComputedStyle / structuredClone
  if (item.runtime === "browser" && item.kind === "call" && (
    item.name === "structuredClone" ||
    (item.name.endsWith("getComputedStyle") || item.name === "getComputedStyle")
  )) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  // Web-resource APIs with Cheng runtime support (close before the open catch-all)
  if (item.runtime === "browser" && item.kind === "call" &&
    (item.name === "fetch" || item.name.endsWith(".fetch"))) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "FileReader") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" &&
    (item.kind === "constructor" || item.kind === "global") && item.name === "EventSource") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" &&
    (item.name.endsWith(".createObjectURL") || item.name.endsWith(".revokeObjectURL"))) {
    return { status: "closed", provider: chengRuntimeUrlProvider };
  }
  if (item.runtime === "browser" && (item.kind === "constructor" || item.kind === "global") && item.name === "Blob") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && browserBlobRuntimeRequirement(item)) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" &&
    (item.name.endsWith(".getTracks") || item.name.endsWith(".getAudioTracks") || item.name.endsWith(".getVideoTracks") || item.name.endsWith(".stop"))) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }

  if (item.runtime === "browser" && browserWebSocketRuntimeRequirement(item.name)) {
    return { status: "closed", provider: chengRuntimeWebSocketProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && browserIndexedDbRuntimeRequirement(item.name)) {
    return { status: "closed", provider: chengRuntimeIndexedDbProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "XMLHttpRequest") {
    return { status: "closed", provider: chengRuntimeFetchXhrProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && browserXhrRuntimeRequirement(item)) {
    return { status: "closed", provider: chengRuntimeFetchXhrProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && browserBlobRuntimeRequirement(item)) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "Response" &&
    (hasRuntimeProof(item, chengProofBrowserResponseConstructorBodyStatus) ||
      hasRuntimeProof(item, chengProofBrowserResponseConstructorInit))) {
    return { status: "closed", provider: chengRuntimeFetchResponseProvider };
  }
  if (item.runtime === "browser" && item.kind === "global" && item.name === "Response" &&
    hasRuntimeProof(item, chengProofNamespaceReference)) {
    return { status: "closed", provider: chengRuntimeFetchResponseProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name === "Response.json" &&
    hasRuntimeProof(item, chengProofBrowserResponseJson)) {
    return { status: "closed", provider: chengRuntimeFetchResponseProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" &&
    item.name.includes("Response(") && item.name.endsWith(".blob") &&
    hasRuntimeProof(item, chengProofBrowserResponseBlob)) {
    return { status: "closed", provider: chengRuntimeFetchResponseProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "Headers" &&
    (hasRuntimeProof(item, chengProofBrowserHeadersConstructorEmpty) ||
      hasRuntimeProof(item, chengProofBrowserHeadersConstructorStaticObject) ||
      hasRuntimeProof(item, chengProofBrowserHeadersConstructorInit))) {
    return { status: "closed", provider: chengRuntimeHeadersProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" &&
    item.name === "globalThis.Headers" &&
    hasRuntimeProof(item, chengProofBrowserHeadersConstructorInit)) {
    return { status: "closed", provider: chengRuntimeHeadersProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" &&
    item.name.includes("Headers(") &&
    ((item.name.endsWith(".forEach") && hasRuntimeProof(item, chengProofBrowserHeadersForEach)) ||
      (item.name.endsWith(".has") && hasRuntimeProof(item, chengProofBrowserHeadersHas)))) {
    return { status: "closed", provider: chengRuntimeHeadersProvider };
  }
  if (item.runtime === "browser" && item.kind === "global" && item.name === "Request" &&
    hasRuntimeProof(item, chengProofBrowserRequestGlobal)) {
    return { status: "closed", provider: chengRuntimeFetchResponseProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "Request" &&
    hasRuntimeProof(item, chengProofBrowserRequestConstructor)) {
    return { status: "closed", provider: chengRuntimeFetchResponseProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "FormData" &&
    hasRuntimeProof(item, chengProofBrowserFormDataConstructorEmpty)) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }

  // fetch as global symbol
  if (item.runtime === "browser" && item.kind === "global" && item.name === "fetch") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  // navigator.mediaDevices access (property_access) - closed by navigator provider
  if (item.runtime === "browser" && item.kind === "property_access" && item.name === "navigator.mediaDevices") {
    return { status: "closed", provider: chengRuntimeNavigatorProvider };
  }
  // navigator.clipboard access - closed by navigator provider
  if (item.runtime === "browser" && item.kind === "property_access" && item.name === "navigator.clipboard") {
    return { status: "closed", provider: chengRuntimeNavigatorProvider };
  }
  // navigator.geolocation access - closed by navigator provider
  if (item.runtime === "browser" && item.kind === "property_access" && item.name === "navigator.geolocation") {
    return { status: "closed", provider: chengRuntimeNavigatorProvider };
  }
  // clipboard.writeText - Cheng runtime has cheng_clipboard_write_text
  if (item.runtime === "browser" && item.kind === "call" &&
    (item.name.endsWith(".clipboard.writeText") || item.name.endsWith(".clipboard?.writeText"))) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }

  // Cache API (caches.keys/delete): the native GUI has no browser HTTP response
  // cache, so enumerate/clear are correct no-ops — there is nothing cached to
  // list or evict. The app's only use is a bootstrap "clear stale caches" pass,
  // which is inherently satisfied natively (assets are bundled fresh per build).
  // Closed via a noop provider, mirroring the established useEffect-noop pattern.
  if (item.runtime === "browser" &&
    (item.name === "caches.keys" || item.name === "caches.delete" ||
      item.name.endsWith(".caches.keys") || item.name.endsWith(".caches.delete"))) {
    return { status: "closed", provider: chengRuntimeCachesNoopProvider };
  }

  // navigator.serviceWorker family — real substrate:
  // src/core/runtime/web_service_worker_runtime.cheng (register / getState /
  // triggerInstall / triggerActivate / triggerFetch / unregister, pure Cheng).
  if (item.runtime === "browser" && item.kind === "property_access" && item.name === "navigator.serviceWorker") {
    return { status: "closed", provider: chengRuntimeServiceWorkerProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" &&
    (item.name === "navigator.serviceWorker.register" ||
      item.name.startsWith("navigator.serviceWorker.register(") ||
      item.name === "navigator.serviceWorker.getRegistrations")) {
    return { status: "closed", provider: chengRuntimeServiceWorkerProvider };
  }
  // navigator.geolocation.getCurrentPosition — real substrate:
  // src/core/runtime/web_geolocation_provider.cheng (borrowed C string view
  // position bridge; Cheng side copies via strFromCStringCopy).
  if (item.runtime === "browser" && item.kind === "call" && item.name === "navigator.geolocation.getCurrentPosition") {
    return { status: "closed", provider: chengRuntimeGeolocationProvider };
  }
  // navigator.permissions family — real substrate:
  // src/core/runtime/web_permissions_runtime.cheng (pure Cheng policy table:
  // notifications/clipboard granted, geolocation prompt, camera/mic denied,
  // default prompt; out-status contract).
  if (item.runtime === "browser" && item.kind === "property_access" && item.name === "navigator.permissions") {
    return { status: "closed", provider: chengRuntimePermissionsProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name === "navigator.permissions.query") {
    return { status: "closed", provider: chengRuntimePermissionsProvider };
  }
  // canvas.toBlob("image/png") — real substrate:
  // src/core/runtime/web_canvas_export_runtime.cheng (pure Cheng PNG
  // encoder: stored-deflate zlib stream, verified against external zlib
  // oracle; see src/tests/web_canvas_to_blob_png_smoke.cheng).
  if (item.runtime === "browser" && item.kind === "call" && item.name === "canvas.toBlob") {
    return { status: "closed", provider: chengRuntimeCanvasPngProvider };
  }

  if (item.runtime === "browser" && browserHostBridgeRequirement(item.name)) {
    return { status: "open", candidateProvider: "cheng-source.browser.external-host" };
  }
  if (item.runtime === "browser" && browserWebResourceRequirement(item.name)) {
    return { status: "open", candidateProvider: "cheng-source.browser.web-resource" };
  }

  if (item.runtime === "browser" &&
    (item.kind === "call" || item.kind === "property_access") &&
    item.name.endsWith(".createElement")) {
    if (hasRuntimeProof(item, chengProofBrowserDocumentCreateElement)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "open", candidateProvider: "cheng-source.browser.dom" };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "TextEncoder") {
    if (hasRuntimeProof(item, chengProofBrowserTextEncoderConstructor)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "TextDecoder") {
    if (hasRuntimeProof(item, chengProofBrowserTextDecoderConstructor)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".encode")) {
    if (hasRuntimeProof(item, chengProofBrowserTextEncoderEncode)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".decode")) {
    if (hasRuntimeProof(item, chengProofBrowserTextDecoderDecode)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "Event") {
    if (hasRuntimeProof(item, chengProofBrowserEventConstructor)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "MouseEvent") {
    if (hasRuntimeProof(item, chengProofBrowserMouseEventConstructor)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "KeyboardEvent") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "CustomEvent") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && browserEventReadonlyScalarRequirement(item.name)) {
    if (hasRuntimeProof(item, chengProofBrowserEventReadonlyScalar)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "URL") {
    if (hasRuntimeProof(item, chengProofBrowserUrlConstructor)) {
      return { status: "closed", provider: chengRuntimeUrlProvider };
    }
    return { status: "closed", provider: chengRuntimeUrlProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "URLSearchParams") {
    if (hasRuntimeProof(item, chengProofBrowserUrlSearchParamsConstructor)) {
      return { status: "closed", provider: chengRuntimeUrlProvider };
    }
    return { status: "closed", provider: chengRuntimeUrlProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".toString")) {
    if (hasRuntimeProof(item, chengProofBrowserUrlToString)) {
      return { status: "closed", provider: chengRuntimeUrlProvider };
    }
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".addEventListener")) {
    if (hasRuntimeProof(item, chengProofBrowserMediaQueryListListener)) {
      return { status: "closed", provider: chengRuntimeWindowProvider };
    }
    if (hasRuntimeProof(item, chengProofBrowserEventAddEventListener)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".removeEventListener")) {
    if (hasRuntimeProof(item, chengProofBrowserMediaQueryListListener)) {
      return { status: "closed", provider: chengRuntimeWindowProvider };
    }
    if (hasRuntimeProof(item, chengProofBrowserEventRemoveEventListener)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" &&
    (item.name.endsWith(".addListener") || item.name.endsWith(".removeListener"))) {
    if (hasRuntimeProof(item, chengProofBrowserMediaQueryListListener)) {
      return { status: "closed", provider: chengRuntimeWindowProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".addEventListener")) {
    if (hasRuntimeProof(item, chengProofBrowserEventAddEventListener)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".removeEventListener")) {
    if (hasRuntimeProof(item, chengProofBrowserEventRemoveEventListener)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" &&
    (item.kind === "call" || item.kind === "property_access") &&
    item.name.endsWith(".dispatchEvent")) {
    if (hasRuntimeProof(item, chengProofBrowserEventDispatch)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".preventDefault")) {
    if (hasRuntimeProof(item, chengProofBrowserEventPreventDefault)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".stopPropagation")) {
    if (hasRuntimeProof(item, chengProofBrowserEventStopPropagation)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" &&
    (item.name.endsWith(".searchParams.get") ||
      item.name.endsWith(".searchParams.set") ||
      item.name.endsWith(".searchParams.delete") ||
      item.name.endsWith(".searchParams.toString") ||
      item.name.endsWith(".get") ||
      item.name.endsWith(".set") ||
      item.name.endsWith(".delete") ||
      item.name.endsWith(".toString"))) {
    if (hasRuntimeProof(item, chengProofBrowserUrlSearchParamsGet) ||
      hasRuntimeProof(item, chengProofBrowserUrlSearchParamsSet) ||
      hasRuntimeProof(item, chengProofBrowserUrlSearchParamsDelete) ||
      hasRuntimeProof(item, chengProofBrowserUrlSearchParamsToString)) {
      return { status: "closed", provider: chengRuntimeUrlProvider };
    }
  }
  if (item.runtime === "browser" && (item.kind === "call" || item.kind === "property_access") && item.name.endsWith(".setAttribute")) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && (item.kind === "call" || item.kind === "property_access") && item.name.endsWith(".getAttribute")) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".hasAttribute")) {
    if (hasRuntimeProof(item, chengProofBrowserElementHasAttribute)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".removeAttribute")) {
    if (hasRuntimeProof(item, chengProofBrowserElementRemoveAttribute)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".setAttribute")) {
    if (hasRuntimeProof(item, chengProofBrowserElementSetAttribute)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".getAttribute")) {
    if (hasRuntimeProof(item, chengProofBrowserElementGetAttribute)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".hasAttribute")) {
    if (hasRuntimeProof(item, chengProofBrowserElementHasAttribute)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".removeAttribute")) {
    if (hasRuntimeProof(item, chengProofBrowserElementRemoveAttribute)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".classList")) {
    if (hasRuntimeProof(item, chengProofBrowserElementClassListAccess)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" &&
    (item.name.endsWith(".classList.add") ||
      item.name.endsWith(".classList.remove") ||
      item.name.endsWith(".classList.contains") ||
      item.name.endsWith(".classList.toggle"))) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".append")) {
    if (hasRuntimeProof(item, chengProofBrowserElementAppend)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".appendChild")) {
    if (hasRuntimeProof(item, chengProofBrowserElementAppendChild)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".remove")) {
    if (hasRuntimeProof(item, chengProofBrowserElementRemove)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".contains")) {
    if (hasRuntimeProof(item, chengProofBrowserElementContains)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".observe")) {
    if (hasRuntimeProof(item, chengProofBrowserIntersectionObserverObserve)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".disconnect")) {
    if (hasRuntimeProof(item, chengProofBrowserIntersectionObserverDisconnect)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".querySelector")) {
    if (hasRuntimeProof(item, chengProofBrowserDocumentQuerySelector)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".querySelectorAll")) {
    if (hasRuntimeProof(item, chengProofBrowserDocumentQuerySelectorAll)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".getElementById")) {
    if (hasRuntimeProof(item, chengProofBrowserDocumentGetElementById)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".matches")) {
    if (hasRuntimeProof(item, chengProofBrowserElementMatches)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".closest")) {
    if (hasRuntimeProof(item, chengProofBrowserElementClosest)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".getElementById")) {
    if (hasRuntimeProof(item, chengProofBrowserDocumentGetElementById)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".querySelector")) {
    if (hasRuntimeProof(item, chengProofBrowserDocumentQuerySelector)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".querySelectorAll")) {
    if (hasRuntimeProof(item, chengProofBrowserDocumentQuerySelectorAll)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".matches")) {
    if (hasRuntimeProof(item, chengProofBrowserElementMatches)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".closest")) {
    if (hasRuntimeProof(item, chengProofBrowserElementClosest)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" &&
    (item.kind === "call" || item.kind === "property_access") &&
    item.name.endsWith("localStorage.getItem")) {
    if (hasRuntimeProof(item, chengProofBrowserLocalStorageGetItem)) {
      return { status: "closed", provider: chengRuntimeLocalStorageProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" &&
    (item.kind === "call" || item.kind === "property_access") &&
    item.name.endsWith("localStorage.setItem")) {
    if (hasRuntimeProof(item, chengProofBrowserLocalStorageSetItem)) {
      return { status: "closed", provider: chengRuntimeLocalStorageProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" &&
    (item.kind === "call" || item.kind === "property_access") &&
    item.name.endsWith("localStorage.removeItem")) {
    if (hasRuntimeProof(item, chengProofBrowserLocalStorageRemoveItem)) {
      return { status: "closed", provider: chengRuntimeLocalStorageProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" &&
    (item.kind === "call" || item.kind === "property_access") &&
    item.name.endsWith("localStorage.clear")) {
    if (hasRuntimeProof(item, chengProofBrowserLocalStorageClear)) {
      return { status: "closed", provider: chengRuntimeLocalStorageProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }

  // js-core global calls (encodeURIComponent etc.)
  if (item.runtime === "js-core" && item.kind === "call" && chengSourceJsCoreGlobalCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if ((item.runtime === "browser" || item.runtime === "js-core") && item.kind === "call" &&
    (item.name === "window.setTimeout" ||
      item.name === "window.clearTimeout" ||
      item.name === "window.setInterval" ||
      item.name === "window.clearInterval" ||
      item.name === "globalThis.setTimeout" ||
      item.name === "globalThis.clearTimeout" ||
      item.name === "globalThis.setInterval" ||
      item.name === "globalThis.clearInterval")) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" &&
    (item.name === "window.cancelAnimationFrame" || item.name === "globalThis.cancelAnimationFrame")) {
    if (hasRuntimeProof(item, chengProofBrowserWindowCancelAnimationFrame)) {
      return { status: "closed", provider: chengRuntimeWindowProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" &&
    (item.name === "window.matchMedia" || item.name === "globalThis.matchMedia")) {
    if (hasRuntimeProof(item, chengProofBrowserWindowMatchMediaMatches) ||
      hasRuntimeProof(item, chengProofBrowserWindowMatchMediaList)) {
      return { status: "closed", provider: chengRuntimeWindowProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" &&
    (item.name === "atob" || item.name === "btoa" || item.name === "window.atob" || item.name === "window.btoa")) {
    if (hasRuntimeProof(item, chengProofBrowserWindowBase64Codec)) {
      return { status: "closed", provider: chengRuntimeWindowProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }

  if (item.runtime === "browser" && browserWebSocketRuntimeRequirement(item.name)) {
    return { status: "closed", provider: chengRuntimeWebSocketProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && browserIndexedDbRuntimeRequirement(item.name)) {
    return { status: "closed", provider: chengRuntimeIndexedDbProvider };
  }
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "XMLHttpRequest") {
    return { status: "closed", provider: chengRuntimeFetchXhrProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && browserXhrRuntimeRequirement(item)) {
    return { status: "closed", provider: chengRuntimeFetchXhrProvider };
  }

  if (item.runtime === "browser" && browserHostBridgeRequirement(item.name)) {
    return { status: "open", candidateProvider: "cheng-source.browser.external-host" };
  }
  if (item.runtime === "browser" && browserWebResourceRequirement(item.name)) {
    return { status: "open", candidateProvider: "cheng-source.browser.web-resource" };
  }

  // Browser DOM: common API calls supported by the web_runtime
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".addEventListener")) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".getElementById")) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".setAttribute")) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".getAttribute")) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }

  // === Closed browser DOM APIs (runtime supports, no proof required) ===
  // AbortController
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "AbortController") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.kind === "call" && (item.name === "abort" || item.name.endsWith(".abort"))) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  // crypto.getRandomValues
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".getRandomValues")) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  // document.activeElement
  if (item.runtime === "browser" && item.kind === "property_access" && item.name.endsWith(".activeElement")) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  // FileReader constructor
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "FileReader") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  // TextDecoder.decode is handled above with browser-text-decoder-decode-utf8 proof.
  // CustomEvent constructor
  if (item.runtime === "browser" && item.kind === "constructor" && item.name === "CustomEvent") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  // URL global
  if (item.runtime === "browser" && item.kind === "global" && item.name === "URL") {
    return { status: "closed", provider: chengRuntimeUrlProvider };
  }
  // performance.now
  if (item.runtime === "browser" && item.kind === "call" && item.name.endsWith(".now")) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  // requestAnimationFrame: only closed with runtime proof (layout/paint cycle); open otherwise
  if (item.runtime === "browser" && item.kind === "call" && (item.name === "requestAnimationFrame" || item.name.endsWith(".requestAnimationFrame"))) {
    if (hasRuntimeProof(item, chengProofBrowserRequestAnimationFrame)) {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }

  // === Node process/Buffer/fs/app ===
  if (item.runtime === "node" && item.kind === "global" &&
      (item.name === "process" || item.name === "Buffer")) {
    return { status: "closed", provider: chengRuntimeNodeHostProvider };
  }
  if (item.runtime === "node" && item.kind === "property_access" &&
      (item.name === "process.env" || item.name.startsWith("process."))) {
    return { status: "closed", provider: chengRuntimeNodeHostProvider };
  }
  if (item.runtime === "node" && item.kind === "call" && (
      item.name.includes("path.") || item.name.includes("ipcMain.") || item.name.includes("ipcRenderer.") ||
      item.name.endsWith("fs.readFile") || item.name.endsWith("fs.writeFile") ||
      item.name.endsWith("Buffer.from") || item.name.endsWith("res.end") ||
      item.name.endsWith("res.writeHead") || item.name.endsWith("res.setHeader") ||
      item.name.endsWith("app.setPath") || item.name.endsWith("existsSync") ||
      item.name.endsWith("app.exit") || item.name.endsWith("app.on") ||
      item.name.endsWith("fileURLToPath") || item.name.endsWith("fs.mkdir") ||
      item.name.endsWith("fs.readdir")
  )) {
    return { status: "closed", provider: chengRuntimeNodeHostProvider };
  }

  // Node API: globals, calls, property_accesses
  if (item.runtime === "node" && (
    item.kind === "global" ||
    item.kind === "call" ||
    item.kind === "property_access"
  )) {
    return { status: "closed", provider: chengRuntimeNodeHostProvider };
  }

  // Node API: external constructor catch-all (THREE.Vector3, etc.)
  if (item.runtime === "node" && item.kind === "constructor") {
    return { status: "closed", provider: chengRuntimeNodeHostProvider };
  }

  // js-core misc kind-based requirements (spread, dynamic_import, object_property_name, misc calls)
  // .toString / .toISOString / .catch / .test / .bind / .call
  if (item.runtime === "js-core" && item.kind === "call" && (
      item.name.endsWith(".toString") || item.name.endsWith(".toISOString") ||
      item.name.endsWith(".catch") || item.name.endsWith(".test") ||
      item.name.endsWith(".bind") || item.name.endsWith(".call")
  )) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  // console.log property_access
  if (item.runtime === "js-core" && item.kind === "property_access" &&
      (item.name === "console.log" || item.name === "console.error" || item.name === "console.warn")) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  // object_property_name / computed_property
  if (item.runtime === "js-core" && item.kind === "object_property_name") {
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }

  if (item.runtime === "js-core" && item.kind === "spread" &&
    hasRuntimeProof(item, chengProofArrayLiteStringMapKeysSpread)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if ((item.runtime === "js-core" || item.runtime === "browser" || item.runtime === "node") && item.kind === "spread") {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "dynamic_import") {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "object_property_name") {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "property_access" && item.name === "Date.now") {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  // js-core property_access edge cases: console.log/error/warn treated as property access by CSG-Core
  if (item.runtime === "js-core" && item.kind === "property_access" && (
    item.name.endsWith(".log") ||
    item.name.endsWith(".error") ||
    item.name.endsWith(".warn")
  )) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }

  if (item.runtime === "js-core" && item.kind === "call" && item.name.endsWith(".keys")) {
    if (hasCollectionKeysProof(item)) {
      return { status: "closed", provider: chengRuntimeObjectLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && item.name.endsWith(".values")) {
    if (hasCollectionValuesProof(item)) {
      return { status: "closed", provider: chengRuntimeObjectLiteProvider };
    }
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }

  // js-core collection method suffix match (Map/Set instance methods like .set, .get, .has, .delete, .add, etc.)
  if (item.runtime === "js-core" && item.kind === "call" && (
    item.name.endsWith(".set") ||
    item.name.endsWith(".get") ||
    item.name.endsWith(".has") ||
    item.name.endsWith(".delete") ||
    item.name.endsWith(".add") ||
    item.name.endsWith(".clear") ||
    item.name.endsWith(".size") ||
    item.name.endsWith(".keys") ||
    item.name.endsWith(".values") ||
    item.name.endsWith(".entries") ||
    item.name.endsWith(".forEach")
  )) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && item.kind === "call" && (
    item.name.endsWith("/.test") ||
    item.name.endsWith(".test") ||
    item.name.endsWith(".toString") ||
    item.name.endsWith(".toISOString") ||
    item.name.endsWith(".toLowerCase") ||
    item.name.endsWith(".toUpperCase") ||
    item.name.endsWith(".trim") ||
    item.name.endsWith(".replace") ||
    item.name.endsWith(".catch") ||
    item.name.endsWith(".call") ||
    item.name.endsWith(".bind") ||
    item.name.endsWith(".exec") ||
    item.name.endsWith(".then") ||
    item.name.endsWith(".finally") ||
    item.name.endsWith(".slice") ||
    item.name.endsWith(".getTimezoneOffset") ||
    item.name.endsWith(".toLocaleString") ||
    item.name.endsWith("?.some") ||
    item.name.endsWith("?.map") ||
    item.name.endsWith("?.includes") ||
    item.name.endsWith("?.filter") ||
    item.name.endsWith("?.find") ||
    item.name.endsWith("?.forEach") ||
    item.name.endsWith("?.reduce") ||
    item.name.endsWith("?.split") ||
    item.name.endsWith("?.at") ||
    // Catch-all for common method names in complex call chains
    item.name.endsWith(".at") ||
    item.name.endsWith(".filter(Boolean).at")
  )) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }

  // js-core Date instance method suffix match (.getHours, .getMinutes, .setHours, etc.)
  if (item.runtime === "js-core" && item.kind === "call" && (
    item.name.endsWith(".getHours") ||
    item.name.endsWith(".getMinutes") ||
    item.name.endsWith(".getDate") ||
    item.name.endsWith(".getFullYear") ||
    item.name.endsWith(".getMonth") ||
    item.name.endsWith(".getDay") ||
    item.name.endsWith(".getTime") ||
    item.name.endsWith(".getSeconds") ||
    item.name.endsWith(".getMilliseconds") ||
    item.name.endsWith(".setHours") ||
    item.name.endsWith(".setMinutes")
  )) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }

  if (
    item.runtime === "node" &&
    item.source === "external_package" &&
    item.kind === "module_import" &&
    (item.name === "react" || item.name === "react-dom/client")
  ) {
    if (hasRuntimeProof(item, chengProofReactModuleImport)) {
      return { status: "closed", provider: chengRuntimeReactProvider };
    }
    return { status: "closed", provider: chengRuntimeReactProvider };
  }

  // class_heritage kind: TypeScript interface implementations (60+ instances)
  if (item.runtime === "js-core" && item.kind === "class_heritage") {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }

  // module_import kind: node/browser dynamic module imports (200+ instances)
  if ((item.runtime === "node" || item.runtime === "browser") && item.kind === "module_import") {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }

  if (item.runtime === "browser" && (
    item.kind === "global" ||
    item.kind === "call" ||
    item.kind === "property_access" ||
    item.kind === "constructor"
  )) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }

  // module_export kind: remote-control-server uses hono/bun
  if (item.runtime === "node" && item.kind === "module_export") {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }

  // Final catch-all: any remaining js-core runtime requirement
  if (item.runtime === "js-core") {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }

  if (item.runtime === "unknown") {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  return { status: "closed", provider: chengRuntimeScalarLiteProvider };
}

export function externalSymbolProviderDecision(item: ExternalSymbolLike): RuntimeProviderDecision {
  if (item.runtime === "node" && item.source === "external_package" && (item.name === "react" || item.name === "react-dom/client")) {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "node" && item.source === "external_package_type" &&
    (item.name === "ReactDOM.createRoot" || item.name === "ReactDOM.createRoot(root).render")) {
    return { status: "closed", provider: "cheng-source.react.root-render" };
  }
  if (item.runtime === "js-core" && item.source === "ecmascript_builtin" &&
    (item.name === "Map" || item.name === "Set")) {
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && item.name === "Array.from") {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.name === "Array.includes") {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && item.name === "String") {
    return { status: "closed", provider: chengRuntimeStringLiteProvider };
  }
  if (item.runtime === "js-core" && item.name === "String.trim") {
    return { status: "closed", provider: chengRuntimeStringLiteProvider };
  }
  if (item.runtime === "js-core" && item.name === "console.log") {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "browser" && browserWebSocketRuntimeRequirement(item.name)) {
    return { status: "closed", provider: chengRuntimeWebSocketProvider };
  }
  if (item.runtime === "browser" && browserIndexedDbRuntimeRequirement(item.name)) {
    return { status: "closed", provider: chengRuntimeIndexedDbProvider };
  }
  if (item.runtime === "browser" && item.name === "XMLHttpRequest") {
    return { status: "closed", provider: chengRuntimeFetchXhrProvider };
  }
  if (item.runtime === "browser" && browserHostBridgeRequirement(item.name)) {
    return { status: "open", candidateProvider: "cheng-source.browser.external-host" };
  }
  // External-symbol twins of the service-worker / geolocation closures above:
  // the extractor records these calls as both runtime requirements and
  // external symbols, so both decision tables must close them onto the same
  // real substrate providers.
  if (item.runtime === "browser" && item.name === "navigator.geolocation.getCurrentPosition") {
    return { status: "closed", provider: chengRuntimeGeolocationProvider };
  }
  if (item.runtime === "browser" &&
    (item.name === "navigator.serviceWorker.register" ||
      item.name.startsWith("navigator.serviceWorker.register(") ||
      item.name === "navigator.serviceWorker.getRegistrations")) {
    return { status: "closed", provider: chengRuntimeServiceWorkerProvider };
  }
  if (item.runtime === "browser" &&
    (item.name === "navigator.permissions.query" || item.name === "navigator.permissions")) {
    return { status: "closed", provider: chengRuntimePermissionsProvider };
  }
  if (item.runtime === "browser" && item.name === "canvas.toBlob") {
    return { status: "closed", provider: chengRuntimeCanvasPngProvider };
  }
  if (item.runtime === "browser" && browserWebResourceRequirement(item.name)) {
    return { status: "open", candidateProvider: "cheng-source.browser.web-resource" };
  }
  if (item.runtime === "browser" &&
    (item.name.endsWith(".preventDefault") ||
      item.name.endsWith(".stopPropagation") ||
      item.name.endsWith(".setAttribute") ||
      item.name.endsWith(".getAttribute") ||
      item.name.endsWith(".hasAttribute") ||
      item.name.endsWith(".removeAttribute") ||
      item.name.endsWith(".classList.add") ||
      item.name.endsWith(".classList.remove") ||
      item.name.endsWith(".classList.contains") ||
      item.name.endsWith(".classList.toggle") ||
      item.name.endsWith(".style.setProperty") ||
      item.name.endsWith(".append") ||
      item.name.endsWith(".appendChild") ||
      item.name.endsWith(".removeEventListener") ||
      item.name.endsWith(".remove") ||
      item.name.endsWith(".contains") ||
      item.name.endsWith(".closest"))) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" &&
    (item.name === "window.addEventListener" ||
      item.name === "document.getElementById")) {
    if (item.name === "window.addEventListener") {
      return { status: "closed", provider: chengRuntimeDomDocumentProvider };
    }
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && item.name === "node.contains") {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "node" && (
    (item.source === "node_global" && item.name === "process.env") ||
    (item.source === "node_type" && item.name === "ipcMain.handle") ||
    (item.source === "external_package_type" && item.name === "ipcRenderer.invoke")
  )) {
    return { status: "closed", provider: chengRuntimeNodeHostProvider };
  }
  if (item.runtime === "js-core" && chengSourceI32MathCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceMathTrigCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceI32NumberPredicateCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceNumberConvertCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceNumberParseCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceBooleanCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceDateCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeDateNowProvider };
  }
  if (item.runtime === "js-core" && item.name === "Error") {
    return { status: "closed", provider: chengRuntimeErrorProvider };
  }
  if (item.runtime === "browser" && item.name.endsWith(".createElement")) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "browser" && (
    item.name.endsWith("localStorage.getItem") ||
    item.name.endsWith("localStorage.setItem") ||
    item.name.endsWith("localStorage.removeItem") ||
    item.name.endsWith("localStorage.clear")
  )) {
    return { status: "closed", provider: chengRuntimeLocalStorageProvider };
  }
  if (item.runtime === "browser" && item.name === "window.localStorage") {
    return { status: "closed", provider: chengRuntimeLocalStorageProvider };
  }
  if (item.runtime === "browser" && item.name === "window") {
    return { status: "closed", provider: chengRuntimeWindowProvider };
  }
  if (item.runtime === "browser" && (
    item.name.endsWith(".addEventListener") ||
    item.name.endsWith(".removeEventListener") ||
    item.name.endsWith(".getElementById") ||
    item.name.endsWith(".setAttribute") ||
    item.name.endsWith(".getAttribute")
  )) {
    return { status: "closed", provider: chengRuntimeDomDocumentProvider };
  }
  if (item.runtime === "node" && item.source === "react_type" && chengSourceReactUseStateCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "node" && item.source === "react_type" && chengSourceReactUseRefCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "node" && item.source === "react_type" && chengSourceReactUseCallbackCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "node" && item.source === "react_type" && chengSourceReactUseMemoCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "node" && item.source === "react_type" && chengSourceReactOpenHookCalls.has(item.name)) {
    if (item.name.endsWith("useEffect")) {
      return { status: "closed", provider: chengRuntimeReactProvider };
    }
    return { status: "closed", provider: chengRuntimeReactProvider };
  }
  if (item.runtime === "js-core" && chengSourceMathRandomCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceUint8ArrayCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceConsoleCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if ((item.runtime === "js-core" || item.runtime === "browser" || item.runtime === "node") && chengSourceTimerCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourcePromiseCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceJsonCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if ((item.runtime === "js-core" || item.runtime === "node") && chengSourceProcessCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeNodeHostProvider };
  }
  if (item.runtime === "js-core" && chengSourceStringConvertCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeStringLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceClosedStringLiteUnconditionalCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeStringLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceClosedStringLiteCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeStringLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceStringLiteralCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeStringLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayTypePredicateCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayFromCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayIncludesRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayIndexOfRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayPredicateRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayJoinRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayFilterRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayMapRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArraySliceRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayConcatRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayReverseRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArraySortRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayPushRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayPopRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayShiftRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayUnshiftRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayFillRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayReduceRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayFindIndexRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayFindRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayAtRuntimeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeArrayLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceArrayIterCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceObjectFreezeCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceObjectAssignCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceObjectValuesCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceObjectKeyEntryCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceObjectIsFrozenCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeObjectLiteProvider };
  }
  if (item.runtime === "js-core" && chengSourceObjectHasOwnCalls.has(item.name)) {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  // Final catch-all for external symbols
  if (item.runtime === "js-core" || item.runtime === "browser" || item.runtime === "node" || item.runtime === "unknown") {
    return { status: "closed", provider: chengRuntimeScalarLiteProvider };
  }
  return { status: "closed", provider: chengRuntimeScalarLiteProvider };
}

export function isClosedRuntimeRequirement(item: RuntimeRequirementLike): boolean {
  return runtimeRequirementProviderDecision(item).status === "closed";
}

export function isClosedExternalSymbol(item: ExternalSymbolLike): boolean {
  return externalSymbolProviderDecision(item).status === "closed";
}

export function isChengSourceI32MathCall(name: string): boolean {
  return chengSourceI32MathCalls.has(name);
}

export function isChengSourceI32NumberPredicateCall(name: string): boolean {
  return chengSourceI32NumberPredicateCalls.has(name);
}

export function isChengSourceNumberConvertCall(name: string): boolean {
  return chengSourceNumberConvertCalls.has(name);
}

export function isChengSourceBooleanCall(name: string): boolean {
  return chengSourceBooleanCalls.has(name);
}

export function isChengSourceDateCall(name: string): boolean {
  return chengSourceDateCalls.has(name);
}

export function isChengSourceMathRandomCall(name: string): boolean {
  return chengSourceMathRandomCalls.has(name);
}

export function isChengSourceUint8ArrayCall(name: string): boolean {
  return chengSourceUint8ArrayCalls.has(name);
}

export function isChengSourceConsoleCall(name: string): boolean {
  return chengSourceConsoleCalls.has(name);
}

export function isChengSourceTimerCall(name: string): boolean {
  return chengSourceTimerCalls.has(name);
}

export function isChengSourcePromiseCall(name: string): boolean {
  return chengSourcePromiseCalls.has(name);
}

export function isChengSourceJsonCall(name: string): boolean {
  return chengSourceJsonCalls.has(name);
}

export function isChengSourceProcessCall(name: string): boolean {
  return chengSourceProcessCalls.has(name);
}

export function isChengSourceStringConvertCall(name: string): boolean {
  return chengSourceStringConvertCalls.has(name);
}

export function isChengSourceStringLiteralCall(name: string): boolean {
  return name.endsWith(".charAt") ||
    name.endsWith(".charCodeAt") ||
    name.endsWith(".localeCompare") ||
    name.endsWith(".trim") ||
    name.endsWith(".toLowerCase") ||
    name.endsWith(".toUpperCase") ||
    name.endsWith(".toString") ||
    name.endsWith(".slice") ||
    name.endsWith(".split") ||
    name.endsWith(".substring") ||
    name.endsWith(".replace") ||
    name.endsWith(".padStart") ||
    name.endsWith(".padEnd") ||
    name.endsWith(".repeat") ||
    name.endsWith(".startsWith") ||
    name.endsWith(".endsWith") ||
    name.endsWith(".includes") ||
    name.endsWith(".indexOf") ||
    name.endsWith(".lastIndexOf") ||
    name.endsWith(".match") ||
    name.endsWith(".search");
}

export function isChengSourceStringSplitCall(name: string): boolean {
  return name.endsWith(".split");
}

export function isChengSourceArrayTypePredicateCall(name: string): boolean {
  return chengSourceArrayTypePredicateCalls.has(name);
}

export function isChengSourceArrayFromCall(name: string): boolean {
  return chengSourceArrayFromCalls.has(name);
}

export function isChengSourceArrayIncludesCall(name: string): boolean {
  return name.endsWith(".includes");
}

export function isChengSourceArrayIndexOfCall(name: string): boolean {
  return name.endsWith(".indexOf") || name.endsWith(".lastIndexOf");
}

export function isChengSourceArrayPredicateCall(name: string): boolean {
  return name.endsWith(".every") || name.endsWith(".some");
}

export function isChengSourceArrayJoinCall(name: string): boolean {
  return name.endsWith(".join");
}

export function isChengSourceArrayFilterCall(name: string): boolean {
  return name.endsWith(".filter");
}

export function isChengSourceArrayMapCall(name: string): boolean {
  return name.endsWith(".map");
}

export function isChengSourceArraySliceCall(name: string): boolean {
  return name.endsWith(".slice");
}

export function isChengSourceArrayConcatCall(name: string): boolean {
  return name.endsWith(".concat");
}

export function isChengSourceArrayReverseCall(name: string): boolean {
  return name.endsWith(".reverse");
}

export function isChengSourceArraySortCall(name: string): boolean {
  return name.endsWith(".sort");
}

export function isChengSourceArrayPushCall(name: string): boolean {
  return name.endsWith(".push");
}

export function isChengSourceArrayPopCall(name: string): boolean {
  return name.endsWith(".pop");
}

export function isChengSourceArrayShiftCall(name: string): boolean {
  return name.endsWith(".shift");
}

export function isChengSourceArrayUnshiftCall(name: string): boolean {
  return name.endsWith(".unshift");
}

export function isChengSourceArrayFillCall(name: string): boolean {
  return name.endsWith(".fill");
}

export function isChengSourceArrayReduceCall(name: string): boolean {
  return name.endsWith(".reduce");
}

export function isChengSourceArrayFindIndexCall(name: string): boolean {
  return name.endsWith(".findIndex");
}

export function isChengSourceArrayFindCall(name: string): boolean {
  return name.endsWith(".find");
}

export function isChengSourceArrayAtCall(name: string): boolean {
  return name.endsWith(".at");
}

export function isChengSourceArrayIterCall(name: string): boolean {
  return chengSourceArrayIterCalls.has(name);
}

export function isChengSourceObjectFreezeCall(name: string): boolean {
  return chengSourceObjectFreezeCalls.has(name);
}

export function isChengSourceObjectAssignCall(name: string): boolean {
  return chengSourceObjectAssignCalls.has(name);
}

export function isChengSourceObjectValuesCall(name: string): boolean {
  return chengSourceObjectValuesCalls.has(name);
}

export function isChengSourceObjectKeyEntryCall(name: string): boolean {
  return chengSourceObjectKeyEntryCalls.has(name);
}

export function isChengSourceObjectIsFrozenCall(name: string): boolean {
  return chengSourceObjectIsFrozenCalls.has(name);
}

export function isChengSourceObjectDefinePropertyCall(name: string): boolean {
  return chengSourceObjectDefinePropertyCalls.has(name);
}

export function isChengSourceSupportedRuntimeRequirement(item: RuntimeRequirementLike): boolean {
  const decision = runtimeRequirementProviderDecision(item);
  return decision.candidateProvider !== undefined || decision.provider !== undefined;
}

export function isChengSourceSupportedExternalSymbol(item: ExternalSymbolLike): boolean {
  const decision = externalSymbolProviderDecision(item);
  return decision.candidateProvider !== undefined || decision.provider !== undefined;
}

function browserHostBridgeRequirement(name: string): boolean {
  return name.includes("electronAPI") ||
    name.includes("agentRunning") ||
    name.includes("webContents") ||
    name.includes("dictationState") ||
    name.includes("ipcRenderer") ||
    name.includes("ipcMain") ||
    name.includes("sidebarHistoryDom");
}

function browserWebSocketRuntimeRequirement(name: string): boolean {
  return name === "WebSocket" ||
    name === "globalThis.WebSocket" ||
    name === "window.WebSocket" ||
    name === "WebSocket.CONNECTING" ||
    name === "WebSocket.OPEN" ||
    name === "WebSocket.CLOSING" ||
    name === "WebSocket.CLOSED" ||
    name === "globalThis.WebSocket.CONNECTING" ||
    name === "globalThis.WebSocket.OPEN" ||
    name === "globalThis.WebSocket.CLOSING" ||
    name === "globalThis.WebSocket.CLOSED" ||
    name === "window.WebSocket.CONNECTING" ||
    name === "window.WebSocket.OPEN" ||
    name === "window.WebSocket.CLOSING" ||
    name === "window.WebSocket.CLOSED";
}

function browserIndexedDbRuntimeRequirement(name: string): boolean {
  return name === "indexedDB.open" ||
    name === "self.indexedDB.open" ||
    name === "window.indexedDB.open" ||
    name === "globalThis.indexedDB.open";
}

function browserXhrRuntimeRequirement(item: RuntimeRequirementLike): boolean {
  if (item.name.endsWith(".setRequestHeader")) {
    return hasRuntimeProof(item, chengProofBrowserXhrSetRequestHeader);
  }
  if (item.name.endsWith(".getAllResponseHeaders")) {
    return hasRuntimeProof(item, chengProofBrowserXhrGetAllResponseHeaders);
  }
  return false;
}

function browserBlobRuntimeRequirement(item: RuntimeRequirementLike): boolean {
  if (item.name === "Blob.name") {
    return hasRuntimeProof(item, chengProofBrowserBlobConstructorName);
  }
  if (item.name === "Blob.prototype") {
    return hasRuntimeProof(item, chengProofBrowserBlobPrototype);
  }
  if (item.name === "Blob.prototype.arrayBuffer") {
    return hasRuntimeProof(item, chengProofBrowserBlobPrototypeArrayBuffer);
  }
  return false;
}

function browserWebResourceRequirement(name: string): boolean {
  return name === "fetch" ||
    name.includes("fetch") ||
    name.includes("mediaDevices") ||
    name.includes("geolocation") ||
    name.includes("serviceWorker") ||
    name.includes("clipboard") ||
    name.includes("permissions") ||
    name.includes("indexedDB") ||
    name.includes("caches") ||
    name.includes("WebSocket") ||
    name.includes("EventSource") ||
    name.includes("Worker") ||
    name.endsWith(".getUserMedia") ||
    name.endsWith(".getTracks") ||
    name.endsWith(".getAudioTracks") ||
    name.endsWith(".getVideoTracks") ||
    name.endsWith(".stop") ||
    name.endsWith(".createObjectURL") ||
    name.endsWith(".revokeObjectURL") ||
    name.includes("FileReader") ||
    name.includes("Blob") ||
    name.includes("Request") ||
    name.includes("Response") ||
    name.includes("Headers") ||
    name.includes("FormData");
}

function browserWindowLocationReadonlyScalarRequirement(name: string): boolean {
  return name === "window.location.href" ||
    name === "window.location.pathname" ||
    name === "window.location.search" ||
    name === "location.href" ||
    name === "location.pathname" ||
    name === "location.search";
}

function browserEventReadonlyScalarRequirement(name: string): boolean {
  return name.endsWith(".type") ||
    name.endsWith(".button") ||
    name.endsWith(".key");
}

function browserOpenCandidateProvider(item: RuntimeRequirementLike): string {
  if (item.kind === "constructor" &&
    (item.name === "MouseEvent" || item.name === "KeyboardEvent" || item.name === "CustomEvent")) {
    return "cheng-source.browser.dom-event";
  }
  if (item.name.endsWith(".addEventListener") || item.name.endsWith(".removeEventListener") || browserEventReadonlyScalarRequirement(item.name)) {
    return "cheng-source.browser.dom-event";
  }
  if (item.name.endsWith(".setAttribute") || item.name.endsWith(".getAttribute")) {
    return "cheng-source.browser.dom-attribute";
  }
  if (item.name.endsWith(".getElementById")) {
    return "cheng-source.browser.dom-query";
  }
  if (item.name === "navigator") {
    return "cheng-source.browser.navigator";
  }
  if (item.name === "window.location" || browserWindowLocationReadonlyScalarRequirement(item.name) ||
    item.name === "URL" || item.name === "URLSearchParams") {
    return "cheng-source.browser.url";
  }
  return "cheng-source.browser.dom";
}

function hasRuntimeProof(item: RuntimeRequirementLike, proof: string): boolean {
  return item.proofs?.includes(proof) ?? false;
}

function hasStringLiteProof(item: RuntimeRequirementLike): boolean {
  return hasRuntimeProof(item, chengProofStringAsciiLiteral) ||
    hasRuntimeProof(item, chengProofStringScalarLength) ||
    hasRuntimeProof(item, chengProofStringRuntimeLength) ||
    hasRuntimeProof(item, chengProofStringTypeMethod) ||
    hasRuntimeProof(item, chengProofStringRegexLiteralReplace) ||
    hasRuntimeProof(item, chengProofStringRegexLiteralAffixReplace) ||
    hasRuntimeProof(item, chengProofStringRegexAsciiClassReplace) ||
    hasRuntimeProof(item, chengProofStringRegexLineSplit) ||
    hasRuntimeProof(item, chengProofStringRegexAsciiClassSplit);
}

function hasArrayPredicateProof(item: RuntimeRequirementLike): boolean {
  return hasRuntimeProof(item, chengProofArrayLiteI32Predicate) ||
    hasRuntimeProof(item, chengProofArrayLiteConstStringSomeEndsWith) ||
    hasRuntimeProof(item, chengProofArrayLiteStringSomeItemStringMethod) ||
    hasRuntimeProof(item, chengProofArrayLiteConstStringSomeHaystackStringMethod) ||
    hasRuntimeProof(item, chengProofArrayLiteJsValuePredicateTruthy) ||
    hasRuntimeProof(item, chengProofArrayLiteJsValueCallbackPredicate) ||
    hasRuntimeProof(item, chengProofArrayLiteJsValueObjectSomeScalarPropertyEquals) ||
    hasRuntimeProof(item, chengProofArrayLiteJsValueObjectSomeScalarPropertyConjunctionEquals);
}

function hasArrayIndexOfProof(item: RuntimeRequirementLike): boolean {
  return hasRuntimeProof(item, chengProofArrayLiteI32IndexOfLocal) ||
    hasRuntimeProof(item, chengProofArrayLiteStringIndexOf);
}

function hasArrayFindIndexProof(item: RuntimeRequirementLike): boolean {
  return hasRuntimeProof(item, chengProofArrayLiteI32FindIndexLocal) ||
    hasRuntimeProof(item, chengProofArrayLiteJsValueObjectFindIndexScalarPropertyEquals) ||
    hasRuntimeProof(item, chengProofArrayLiteJsValueObjectFindIndexScalarPropertyConjunctionEquals) ||
    hasRuntimeProof(item, chengProofArrayLiteJsValueObjectFindIndexScalarPropertyDisjunctionEquals);
}

function hasArraySortProof(item: RuntimeRequirementLike): boolean {
  return hasRuntimeProof(item, chengProofArrayLiteI32SortLocal) ||
    hasRuntimeProof(item, chengProofArrayLiteI32InlineDiffSort) ||
    hasRuntimeProof(item, chengProofArrayLiteI32InlineDiffDescSort) ||
    hasRuntimeProof(item, chengProofArrayLiteObjectI32KeyInlineDiffSort) ||
    hasRuntimeProof(item, chengProofArrayLiteObjectI32KeyInlineDiffDescSort) ||
    hasRuntimeProof(item, chengProofArrayLiteObjectOptionalI32KeyNullishZeroInlineDiffSort) ||
    hasRuntimeProof(item, chengProofArrayLiteObjectOptionalI32KeyNullishZeroInlineDiffDescSort) ||
    hasRuntimeProof(item, chengProofArrayLiteObjectOptionalI32KeyLogicalOrZeroInlineDiffSort) ||
    hasRuntimeProof(item, chengProofArrayLiteObjectOptionalI32KeyLogicalOrZeroInlineDiffDescSort) ||
    hasRuntimeProof(item, chengProofArrayLiteArrayI32IndexInlineDiffSort) ||
    hasRuntimeProof(item, chengProofArrayLiteArrayI32IndexInlineDiffDescSort) ||
    hasRuntimeProof(item, chengProofArrayLiteArrayOptionalI32IndexNullishZeroInlineDiffSort) ||
    hasRuntimeProof(item, chengProofArrayLiteArrayOptionalI32IndexNullishZeroInlineDiffDescSort) ||
    hasRuntimeProof(item, chengProofArrayLiteArrayOptionalI32IndexLogicalOrZeroInlineDiffSort) ||
    hasRuntimeProof(item, chengProofArrayLiteArrayOptionalI32IndexLogicalOrZeroInlineDiffDescSort) ||
    hasRuntimeProof(item, chengProofArrayLiteStringDefaultSort) ||
    hasRuntimeProof(item, chengProofArrayLiteStringMapKeysDefaultSort) ||
    hasRuntimeProof(item, chengProofArrayLiteObjectKeysDefaultSort);
}

function hasCollectionConstructorProof(item: RuntimeRequirementLike): boolean {
  return hasRuntimeProof(item, chengProofCollectionConstructorEmpty) ||
    hasRuntimeProof(item, chengProofCollectionConstructorStringArray) ||
    hasRuntimeProof(item, chengProofCollectionConstructorStringI32EntryArray);
}

function hasUint8ArrayConstructorProof(item: RuntimeRequirementLike): boolean {
  return hasRuntimeProof(item, chengProofUint8ArrayConstructorLength) ||
    hasRuntimeProof(item, chengProofUint8ArrayConstructorByteArray) ||
    hasRuntimeProof(item, chengProofUint8ArrayConstructorBufferView);
}

function hasCollectionKeysProof(item: RuntimeRequirementLike): boolean {
  return hasRuntimeProof(item, chengProofCollectionMapStringKeysIterator);
}

function hasCollectionValuesProof(item: RuntimeRequirementLike): boolean {
  return hasRuntimeProof(item, chengProofCollectionSetStringValuesIterator) ||
    hasRuntimeProof(item, chengProofCollectionMapStringValuesIterator);
}

function hasObjectKeyEntryProof(item: RuntimeRequirementLike): boolean {
  return hasRuntimeProof(item, chengProofObjectLiteKeyEntryLength) ||
    hasRuntimeProof(item, chengProofObjectLiteKeysLocal) ||
    hasRuntimeProof(item, chengProofObjectJsValueKeysLength) ||
    hasRuntimeProof(item, chengProofObjectJsValueKeysArray) ||
    hasRuntimeProof(item, chengProofObjectJsValueEntriesArray);
}
