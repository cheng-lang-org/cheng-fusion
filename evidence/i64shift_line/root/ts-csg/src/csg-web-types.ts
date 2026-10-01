/**
 * csg-web-types.ts
 *
 * TypeScript type definitions for the CSG-Web fact schema.
 * Mirrors `src/core/ir/csg_web_facts.cheng` as the single source
 * of truth. Every fact kind used by ts-csg's --emit csg-web is
 * formalised as a TypeScript interface.
 *
 * Conventions:
 *   - Interface names match the Cheng type names (CsgWeb*).
 *   - Optional fields use `?:` — the same field may be absent or
 *     `undefined` at runtime, matching the Cheng `?` suffix.
 *   - `readonly` is applied where the runtime treats the fact as
 *     immutable after emission.
 */

// ---------------------------------------------------------------------------
// Shared leaf types
// ---------------------------------------------------------------------------

export interface CsgWebSourceLoc {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly start: number;
  readonly end: number;
}

export interface CsgWebFunctionParameter {
  readonly index: number;
  readonly name: string;
  readonly optional?: boolean;
  readonly rest?: boolean;
  readonly typeSource?: string;
}

// ---------------------------------------------------------------------------
// Module header / schema metadata
// ---------------------------------------------------------------------------

export const CSG_WEB_SCHEMA_VERSION = 1;

export const CSG_WEB_FEATURE_JS = 0x01;
export const CSG_WEB_FEATURE_REACT = 0x02;
export const CSG_WEB_FEATURE_DOM = 0x04;
export const CSG_WEB_FEATURE_CSS = 0x08;
export const CSG_WEB_FEATURE_EVENT = 0x10;
export const CSG_WEB_FEATURE_LAYOUT = 0x20;
export const CSG_WEB_FEATURE_PAINT = 0x40;

export interface CsgWebModuleHeader {
  readonly schemaVersion: number;
  readonly featureBits: number;
  readonly sourcePath: string;
  readonly timestamp: number;
  readonly contentHash: string;
}

// ---------------------------------------------------------------------------
// Fact discriminator
// ---------------------------------------------------------------------------

export type CsgWebFactKindTag =
  | "csg.web.schema"
  | "csg.web.project"
  | "csg.web.module_import_ref"
  | "csg.web.js_function_ref"
  | "csg.web.js_call_ref"
  | "csg.web.js_class_ref"
  | "csg.web.js_class_heritage_ref"
  | "csg.web.jsx_element"
  | "csg.web.dom_node_template"
  | "csg.web.control_surface"
  | "csg.web.voice_computer_use_scenario"
  | "csg.web.computer_use_action"
  | "csg.web.voice_task_template"
  | "csg.web.voice_task_step"
  | "csg.web.confirmation_gate"
  | "csg.web.subgraph_cid"
  | "csg.web.runtime_requirement"
  | "csg.web.external_symbol"
  | "csg.web.unsupported_ref"
  | "csg.web.media_asset"
  | "csg.web.media_playback_slot"
  | "csg.web.media_control_action"
  | "csg.web.media_control_receipt"
  | "csg.web.media_lifecycle_event"
  | "csg.web.media_frame_receipt"
  | "csg.web.media_receipt_identity"
  | "csg.web.media_delivery_receipt";

// ---------------------------------------------------------------------------
// Schema fact   "csg.web.schema"
// ---------------------------------------------------------------------------

export interface CsgWebSchemaFact {
  readonly kind: "csg.web.schema";
  readonly language: string;     // "typescript"
  readonly schema: "csg-web";
  readonly features: readonly string[];
  readonly extends: string;      // "csg-core"
}

// ---------------------------------------------------------------------------
// Project fact  "csg.web.project"
// ---------------------------------------------------------------------------

export interface CsgWebProjectFact {
  readonly kind: "csg.web.project";
  readonly id: string;
  readonly coreSchema: string;       // "csg-core"
  readonly projectRoot: string;
  readonly projectFile?: string;
  readonly runtimes: readonly string[];
  readonly entryRoots: readonly string[];
  readonly engineDependency: "none" | string;
  readonly runtimeTarget: "cheng-web-runtime" | string;
  readonly coreFactCount: number;
}

// ---------------------------------------------------------------------------
// Module import ref  "csg.web.module_import_ref"
// ---------------------------------------------------------------------------

export interface CsgWebModuleImportRefFact {
  readonly kind: "csg.web.module_import_ref";
  readonly id: string;
  readonly coreFact: string;
  readonly module: string;
  readonly moduleName: string;
  readonly importKind: string;
  readonly runtime: string;
  readonly loc?: CsgWebSourceLoc;
}

// ---------------------------------------------------------------------------
// Function ref  "csg.web.js_function_ref"
// ---------------------------------------------------------------------------

export interface CsgWebJsFunctionRefFact {
  readonly kind: "csg.web.js_function_ref";
  readonly id: string;
  readonly coreFact: string;
  readonly name: string;
  readonly async: boolean;
  readonly generator: boolean;
  readonly exported: boolean;
  readonly parameters: readonly CsgWebFunctionParameter[];
  readonly returnType: string;
  readonly loc?: CsgWebSourceLoc;
}

// ---------------------------------------------------------------------------
// Call ref  "csg.web.js_call_ref"
// ---------------------------------------------------------------------------

export interface CsgWebJsCallRefFact {
  readonly kind: "csg.web.js_call_ref";
  readonly id: string;
  readonly coreFact: string;
  readonly owner?: string;
  readonly targetText?: string;
  readonly argumentCount: number;
  readonly optionalChain?: boolean;
  readonly receiver?: string;
  readonly memberName?: string;
  readonly loc?: CsgWebSourceLoc;
}

// ---------------------------------------------------------------------------
// Class ref  "csg.web.js_class_ref"
// ---------------------------------------------------------------------------

export interface CsgWebJsClassRefFact {
  readonly kind: "csg.web.js_class_ref";
  readonly id: string;
  readonly coreFact: string;
  readonly name: string;
  readonly symbol: string;
  readonly exported: boolean;
  readonly abstract: boolean;
  readonly typeParameters: readonly unknown[];
  readonly heritageCount: number;
  readonly loc?: CsgWebSourceLoc;
}

// ---------------------------------------------------------------------------
// Class heritage ref  "csg.web.js_class_heritage_ref"
// ---------------------------------------------------------------------------

export interface CsgWebJsClassHeritageRefFact {
  readonly kind: "csg.web.js_class_heritage_ref";
  readonly id: string;
  readonly coreFact: string;
  readonly class: string;
  readonly heritageKind: string;
  readonly expression: string;
  readonly target?: string;
  readonly typeArguments: readonly unknown[];
  readonly loc?: CsgWebSourceLoc;
}

// ---------------------------------------------------------------------------
// JSX element fact  "csg.web.jsx_element"
// ---------------------------------------------------------------------------

export interface CsgWebJsxProp {
  readonly kind?: string;
  readonly ordinal?: number;
  readonly name: string;
  readonly value: string;
  readonly valueKind?: string;
}

export interface CsgWebJsxChild {
  readonly kind?: string;
  readonly ordinal?: number;
  readonly ref?: string;
  readonly coreFact?: string;
  readonly text?: string;
}

export interface CsgWebJsxElementFact {
  readonly kind: "csg.web.jsx_element";
  readonly id: string;
  readonly coreFact: string;
  readonly owner: string;
  readonly tagName: string;
  readonly jsxKind: string;
  readonly attributeCount: number;
  readonly childCount: number;
  readonly props: readonly CsgWebJsxProp[];
  readonly children: readonly CsgWebJsxChild[];
  readonly lowering: "react-compatible-runtime" | string;
  readonly loc?: CsgWebSourceLoc;
}

// ---------------------------------------------------------------------------
// DOM node template  "csg.web.dom_node_template"
// ---------------------------------------------------------------------------

export interface CsgWebDomNodeTemplateFact {
  readonly kind: "csg.web.dom_node_template";
  readonly id: string;
  readonly coreFact: string;
  readonly owner: string;
  readonly tagName: string;
  readonly nodeKind: "element" | "text" | string;
  readonly domain: string;
  readonly attributeCount: number;
  readonly childCount: number;
  readonly props: readonly CsgWebJsxProp[];
  readonly children: readonly CsgWebJsxChild[];
  readonly runtimeTarget: "cheng-web-runtime" | string;
  readonly loc?: CsgWebSourceLoc;
}

// ---------------------------------------------------------------------------
// Control surface fact  "csg.web.control_surface"
// ---------------------------------------------------------------------------

export interface CsgWebControlSurfaceFact {
  readonly kind: "csg.web.control_surface";
  readonly id: string;
  readonly coreFact: string;
  readonly nodeTemplate: string;
  readonly owner: string;
  readonly role: string;
  readonly label: string;
  readonly stateRef: string;
  readonly actionKind: "Click" | "SetText" | "Select" | "SelectFile" | "Toggle" | string;
  readonly payloadSchema: string;
  readonly effect: string;
  readonly guard: string;
  readonly trace: string;
  readonly sourceFile: string;
  readonly sourceLine: number;
}

// ---------------------------------------------------------------------------
// Voice computer-use scenario  "csg.web.voice_computer_use_scenario"
// ---------------------------------------------------------------------------

export interface CsgWebVoiceComputerUseScenarioFact {
  readonly kind: "csg.web.voice_computer_use_scenario";
  readonly id: string;
  readonly controlSurface: string;
  readonly nodeTemplate: string;
  readonly scenarioKind: "voice-command" | "voice-dictation" | "voice-selection" | "voice-toggle" | string;
  readonly role: string;
  readonly label: string;
  readonly actionKind: "Click" | "SetText" | "Select" | "SelectFile" | "Toggle" | string;
  readonly payloadSchema: string;
  readonly utteranceTemplate: string;
  readonly computerUseMode: "typed-control-action";
  readonly automationPath: string;
  readonly eventEffect: string;
  readonly dispatch: "event-system";
  readonly visualClickFallback: false;
  readonly hardFailReason: "surface-provider-not-attached";
  readonly trace: string;
}

// ---------------------------------------------------------------------------
// Computer-use action  "csg.web.computer_use_action"
// ---------------------------------------------------------------------------

export interface CsgWebComputerUseActionFact {
  readonly kind: "csg.web.computer_use_action";
  readonly id: string;
  readonly controlSurface: string;
  readonly semanticId: string;
  readonly nodeTemplate: string;
  readonly owner: string;
  readonly role: string;
  readonly label: string;
  readonly actionKind: "Click" | "SetText" | "Select" | "SelectFile" | "Toggle" | string;
  readonly payloadSchema: string;
  readonly effectClass: string;
  readonly guard: string;
  readonly trace: string;
  readonly dispatch: "event-system";
  readonly visualClickFallback: false;
  readonly sourceFile: string;
  readonly sourceLine: number;
}

// ---------------------------------------------------------------------------
// Voice task template  "csg.web.voice_task_template"
// ---------------------------------------------------------------------------

export interface CsgWebVoiceTaskTemplateFact {
  readonly kind: "csg.web.voice_task_template";
  readonly id: string;
  readonly templateId: string;
  readonly taskKind: string;
  readonly utterancePatterns: readonly string[];
  readonly stepIds: readonly string[];
  readonly riskPolicy: string;
}

// ---------------------------------------------------------------------------
// Voice task step  "csg.web.voice_task_step"
// ---------------------------------------------------------------------------

export interface CsgWebVoiceTaskStepFact {
  readonly kind: "csg.web.voice_task_step";
  readonly id: string;
  readonly templateId: string;
  readonly stepIndex: number;
  readonly computerUseAction: string;
  readonly semanticId: string;
  readonly targetActionKind: string;
  readonly targetRole: string;
  readonly targetLabel: string;
  readonly targetSourceFile: string;
  readonly payloadBinding: string;
  readonly effectClass: string;
  readonly confirmationRequired: boolean;
  readonly confirmationGateId: string;
  readonly confirmationMode: string;
  readonly blockedUntilConfirmed: boolean;
  readonly guard: string;
  readonly trace: string;
}

// ---------------------------------------------------------------------------
// Confirmation gate  "csg.web.confirmation_gate"
// ---------------------------------------------------------------------------

export interface CsgWebConfirmationGateFact {
  readonly kind: "csg.web.confirmation_gate";
  readonly id: string;
  readonly voiceTaskStep: string;
  readonly templateId: string;
  readonly computerUseAction: string;
  readonly semanticId: string;
  readonly effectClass: string;
  readonly confirmationMode: "explicit-user-confirmation" | string;
  readonly blockedUntilConfirmed: true;
  readonly confirmIntent: string;
}

// ---------------------------------------------------------------------------
// Subgraph CID fact  "csg.web.subgraph_cid"
// ---------------------------------------------------------------------------

export interface CsgWebSubgraphCidFact {
  readonly kind: "csg.web.subgraph_cid";
  readonly id: string;
  readonly sourceFact: string;
  readonly sourceKind: string;
  readonly cid: string;
  readonly target: string;
}

// ---------------------------------------------------------------------------
// Runtime requirement  "csg.web.runtime_requirement"
// ---------------------------------------------------------------------------

export interface CsgWebRuntimeRequirementFact {
  readonly kind: "csg.web.runtime_requirement";
  readonly id: string;
  readonly coreRequirement: string;
  readonly domain: string;
  readonly requirementKind: string; // maps to "kind" in CsgWebRuntimeRequirement
  readonly name: string;
  readonly runtime: string;
  readonly source: string;
  readonly providerStatus: "closed" | "open";
  readonly provider?: string;
  readonly candidateProvider?: string;
  readonly loc?: CsgWebSourceLoc;
  readonly owner?: string;
}

// ---------------------------------------------------------------------------
// External symbol  "csg.web.external_symbol"
// ---------------------------------------------------------------------------

export interface CsgWebExternalSymbolFact {
  readonly kind: "csg.web.external_symbol";
  readonly id: string;
  readonly coreExternalSymbol: string;
  readonly domain: string;
  readonly name: string;
  readonly runtime: string;
  readonly source: string;
  readonly providerStatus: "closed" | "open";
  readonly provider?: string;
  readonly candidateProvider?: string;
}

// ---------------------------------------------------------------------------
// Unsupported ref  "csg.web.unsupported_ref"
// ---------------------------------------------------------------------------

export interface CsgWebUnsupportedRefFact {
  readonly kind: "csg.web.unsupported_ref";
  readonly id: string;
  readonly coreFact: string;
  readonly code: string;
  readonly message: string;
  readonly owner?: string;
  readonly loc?: CsgWebSourceLoc;
}

// ---------------------------------------------------------------------------
// Surface owner  "csg.web.surface_owner"
// Links a TS source file/component to its DOM footprint via data attributes.
// ---------------------------------------------------------------------------

export interface CsgWebSurfaceOwnerFact {
  readonly kind: "csg.web.surface_owner";
  readonly id: string;
  readonly surface: string;          // e.g. "main-home", "main-thread-detail"
  readonly ownerFile: string;        // TS source file path
  readonly component?: string;       // React component or function name
  readonly className?: string;       // CSS class anchor
  readonly dataAttr?: string;        // data-* attribute anchor
  readonly sourceLoc?: CsgWebSourceLoc;
  readonly isKey: boolean;           // true if this owner is required for the surface
}

// ---------------------------------------------------------------------------
// Truth ref  "csg.web.truth_ref"
// Points to the ground-truth JSON snapshot for a surface region.
// ---------------------------------------------------------------------------

export interface CsgWebTruthRefFact {
  readonly kind: "csg.web.truth_ref";
  readonly id: string;
  readonly surface: string;          // e.g. "main-home"
  readonly nodeRef: string;          // e.g. "ground-truth/main-home/dom.json#<nodeId>"
  readonly geometryRef?: string;     // e.g. "ground-truth/main-home/geometry.json#<nodeId>"
  readonly cssRef?: string;          // e.g. "ground-truth/main-home/css.json#<nodeId>"
  readonly screenshotRef?: string;   // e.g. "ground-truth/main-home/screenshot.png"
  readonly ownerFact: string;        // -> CsgWebSurfaceOwnerFact.id
}

// ---------------------------------------------------------------------------
// Pixel region  "csg.web.pixel_region"
// Named UI region with bounding box, linked to an owner for visual diff attribution.
// ---------------------------------------------------------------------------

export interface CsgWebPixelRegionFact {
  readonly kind: "csg.web.pixel_region";
  readonly id: string;
  readonly surface: string;          // e.g. "main-home"
  readonly region: string;           // e.g. "sidebar", "topbar", "composer", "conversation", "modal"
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly ownerFact: string;        // -> CsgWebSurfaceOwnerFact.id
  readonly truthRef?: string;        // -> CsgWebTruthRefFact.id
}

// ---------------------------------------------------------------------------
// Media asset  "csg.web.media_asset"
// Verified manifest boundary for file-backed video/image/audio assets.
// ---------------------------------------------------------------------------

export interface CsgWebMediaObjectDescriptor {
  readonly objectIndex: number;
  readonly objectId: string;
  readonly objectCid: string;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly sourceBlockBytes: number;
  readonly sourceBlockCount: number;
  readonly priority: number;
}

export interface CsgWebMediaDropletDescriptor {
  readonly objectIndex: number;
  readonly dropletIndex: number;
  readonly kindCode: number;
  readonly key: string;
  readonly peerId: string;
  readonly cid: string;
  readonly degree: number;
  readonly blockIndexes: readonly number[];
}

export interface CsgWebMediaAssetFact {
  readonly kind: "csg.web.media_asset";
  readonly id: string;
  readonly assetCid: string;
  readonly bundleCid: string;
  readonly mime: string;
  readonly kindCode: 1 | 2 | 3;
  readonly durationMs: string;        // exact decimal int64 string
  readonly codec: string;
  readonly posterCid?: string;
  readonly initSegmentCid?: string;
  readonly initSegmentByteLength: number;
  readonly keyframeIndex?: string;
  readonly transport: "moq" | string;
  readonly fecScheme: "lt_xor_v1:experimental" | string;
  readonly contentSignature: string;
  readonly catalogCid: string;
  readonly catalogKey: string;
  readonly rebuildTemplateCid: string;
  readonly rebuildTemplateKey: string;
  readonly objectTargetBytes: number;
  readonly sourceBlockBytes: number;
  readonly objectCount: number;
  readonly dropletCount: number;
  readonly objects: readonly CsgWebMediaObjectDescriptor[];
  readonly droplets: readonly CsgWebMediaDropletDescriptor[];
}

// ---------------------------------------------------------------------------
// Media playback slot  "csg.web.media_playback_slot"
// GUI-facing slot only; decoding and handles stay in providers.
// ---------------------------------------------------------------------------

export interface CsgWebMediaPlaybackSlotFact {
  readonly kind: "csg.web.media_playback_slot";
  readonly id: string;
  readonly slotId: string;
  readonly assetFact: string;
  readonly assetCid: string;
  readonly manifestCid: string;
  readonly nodeTemplate?: string;
  readonly providerKind: "media-decode-provider" | string;
  readonly stateRef: string;
  readonly decodeProvider: string;
  readonly textureProvider: string;
  readonly audioProvider: string;
  readonly objectFit?: string;
  readonly peerHost?: string;
  readonly peerPort?: number;
}

// ---------------------------------------------------------------------------
// Media control action  "csg.web.media_control_action"
// Event-queue commands allowed for media slots.
// ---------------------------------------------------------------------------

export interface CsgWebMediaControlActionFact {
  readonly kind: "csg.web.media_control_action";
  readonly id: string;
  readonly slotId: string;
  readonly actionKind: "Play" | "Pause" | "Seek" | "OpenAsset" | "EditAsset" | "PublishAsset" | "ShareAsset";
  readonly payloadSchema: string;
  readonly dispatch: "event-queue" | string;
  readonly guard: string;
  readonly trace: string;
}

// ---------------------------------------------------------------------------
// Media control receipt  "csg.web.media_control_receipt"
// Runtime receipt for Agent/user typed media actions.
// ---------------------------------------------------------------------------

export interface CsgWebMediaControlReceiptFact {
  readonly kind: "csg.web.media_control_receipt";
  readonly id: string;
  readonly receiptCid: string;
  readonly slotId: string;
  readonly assetCid: string;
  readonly kindCode: 1 | 2 | 3;
  readonly actionKind: "Play" | "Pause" | "Seek" | "OpenAsset" | "EditAsset" | "PublishAsset" | "ShareAsset";
  readonly payloadSchema: string;
  readonly payload: string;
  readonly dispatch: "event-queue" | string;
  readonly sourceStateCode: number;
  readonly resultStateCode: number;
  readonly statusCode: number;
  readonly guard: string;
  readonly trace: string;
}

// ---------------------------------------------------------------------------
// Media lifecycle event  "csg.web.media_lifecycle_event"
// Runtime Edit/Publish receipts projected into the CSG-Web fact bus.
// ---------------------------------------------------------------------------

export interface CsgWebMediaLifecycleEventFact {
  readonly kind: "csg.web.media_lifecycle_event";
  readonly id: string;
  readonly eventKind: "OpenAsset" | "EditAsset" | "PublishAsset";
  readonly eventCid: string;
  readonly slotId: string;
  readonly assetCid: string;
  readonly bundleCid: string;
  readonly manifestCid: string;
  readonly kindCode: 1 | 2 | 3;
  readonly payloadSchema: string;
  readonly payload: string;
  readonly transport: string;
  readonly dispatch: "event-queue" | string;
  readonly guard: string;
  readonly sourceStateCode: number;
  readonly resultStateCode: number;
  readonly statusCode: number;
  readonly objectCount: number;
  readonly dropletCount: number;
  readonly trace: string;
}

// ---------------------------------------------------------------------------
// Media frame receipt  "csg.web.media_frame_receipt"
// First-frame / first-image / first-audio runtime receipt projected to CSG-Web.
// ---------------------------------------------------------------------------

export interface CsgWebMediaFrameReceiptFact {
  readonly kind: "csg.web.media_frame_receipt";
  readonly id: string;
  readonly receiptKind: "Frame" | "Image" | "Audio";
  readonly slotId: string;
  readonly assetCid: string;
  readonly manifestCid: string;
  readonly kindCode: 1 | 2 | 3;
  readonly firstFrameCid: string;
  readonly firstImageCid: string;
  readonly firstAudioCid: string;
  readonly audioDataCid: string;
  readonly bytesReady: number;
  readonly initSegmentCid: string;
  readonly initBytesReady: number;
  readonly sourceCode: number;
  readonly verified: boolean;
  readonly textureProvider: string;
  readonly textureHandle: string;
  readonly textureReady: boolean;
  readonly decodedWidth: number;
  readonly decodedHeight: number;
  readonly pixelFormat: number;
  readonly pixelBufferHandle: string;
  readonly audioProvider: string;
  readonly sampleRateHz: number;
  readonly channelCount: number;
  readonly bitsPerSample: number;
  readonly pcmDataOffset: number;
  readonly pcmDataBytes: number;
  readonly startedAtMs: string;
  readonly elapsedMs: string;
  readonly openToMediaMs: string;
  readonly trace: string;
}

// ---------------------------------------------------------------------------
// Media receipt identity  "csg.web.media_receipt_identity"
// Immutable ledger identity for first-frame / first-image / first-audio receipts.
// ---------------------------------------------------------------------------

export interface CsgWebMediaReceiptIdentityFact {
  readonly kind: "csg.web.media_receipt_identity";
  readonly id: string;
  readonly receiptFactId: string;
  readonly receiptCid: string;
  readonly receiptKind: "Frame" | "Image" | "Audio";
  readonly slotId: string;
  readonly assetCid: string;
  readonly manifestCid: string;
  readonly trace: string;
}

// ---------------------------------------------------------------------------
// Media delivery receipt  "csg.web.media_delivery_receipt"
// Remote publish/open/first-media proof projected to CSG-Web.
// ---------------------------------------------------------------------------

export interface CsgWebMediaDeliveryReceiptFact {
  readonly kind: "csg.web.media_delivery_receipt";
  readonly id: string;
  readonly receiptCid: string;
  readonly receiptKind: "RemoteFrame" | "RemoteImage" | "RemoteAudio";
  readonly slotId: string;
  readonly assetCid: string;
  readonly bundleCid: string;
  readonly manifestCid: string;
  readonly kindCode: 1 | 2 | 3;
  readonly transport: "moq" | string;
  readonly publishEventCid: string;
  readonly openEventCid: string;
  readonly firstMediaCid: string;
  readonly sourceCode: number;
  readonly announcedBytes: number;
  readonly transferredBytes: number;
  readonly bytesReady: number;
  readonly objectCount: number;
  readonly dropletCount: number;
  readonly remoteFetchMs: string;
  readonly openToMediaMs: string;
  readonly budgetMs: string;
  readonly statusCode: number;
  readonly verified: boolean;
  readonly guard: string;
  readonly trace: string;
}

// ---------------------------------------------------------------------------
// Union type — every csg-web fact is exactly one of the above
// ---------------------------------------------------------------------------

export type CsgWebFact =
  | CsgWebSchemaFact
  | CsgWebProjectFact
  | CsgWebModuleImportRefFact
  | CsgWebJsFunctionRefFact
  | CsgWebJsCallRefFact
  | CsgWebJsClassRefFact
  | CsgWebJsClassHeritageRefFact
  | CsgWebJsxElementFact
  | CsgWebDomNodeTemplateFact
  | CsgWebControlSurfaceFact
  | CsgWebVoiceComputerUseScenarioFact
  | CsgWebComputerUseActionFact
  | CsgWebVoiceTaskTemplateFact
  | CsgWebVoiceTaskStepFact
  | CsgWebConfirmationGateFact
  | CsgWebSubgraphCidFact
  | CsgWebRuntimeRequirementFact
  | CsgWebExternalSymbolFact
  | CsgWebUnsupportedRefFact
  | CsgWebSurfaceOwnerFact
  | CsgWebTruthRefFact
  | CsgWebPixelRegionFact
  | CsgWebMediaAssetFact
  | CsgWebMediaPlaybackSlotFact
  | CsgWebMediaControlActionFact
  | CsgWebMediaControlReceiptFact
  | CsgWebMediaLifecycleEventFact
  | CsgWebMediaFrameReceiptFact
  | CsgWebMediaReceiptIdentityFact
  | CsgWebMediaDeliveryReceiptFact;

// ---------------------------------------------------------------------------
// Report / closure / counts types
// ---------------------------------------------------------------------------

export interface CsgWebRuntimeClosureBucket {
  readonly id: string;
  readonly domain: string;
  readonly count: number;
  readonly closedCount: number;
  readonly openCount: number;
  readonly candidateCount: number;
}

export interface CsgWebRuntimeRequirementItem {
  readonly id: string;
  readonly coreRequirement: string;
  readonly domain: string;
  readonly kind: string;
  readonly name: string;
  readonly runtime: string;
  readonly source: string;
  readonly providerStatus: "closed" | "open";
  readonly provider?: string;
  readonly candidateProvider?: string;
  readonly loc?: CsgWebSourceLoc;
  readonly owner?: string;
}

export interface CsgWebExternalSymbolItem {
  readonly id: string;
  readonly coreExternalSymbol: string;
  readonly domain: string;
  readonly name: string;
  readonly runtime: string;
  readonly source: string;
  readonly providerStatus: "closed" | "open";
  readonly provider?: string;
  readonly candidateProvider?: string;
}

export interface CsgWebRuntimeClosure {
  readonly schema: "csg-web.runtime-closure";
  readonly features: readonly string[];
  readonly complete: boolean;
  readonly requirementCount: number;
  readonly externalSymbolCount: number;
  readonly openRequirementCount: number;
  readonly openExternalSymbolCount: number;
  readonly closedRequirementCount: number;
  readonly closedExternalSymbolCount: number;
  readonly candidateRequirementCount: number;
  readonly candidateExternalSymbolCount: number;
  readonly domainCount: number;
  readonly byDomain: readonly CsgWebRuntimeClosureBucket[];
  readonly requirements: readonly CsgWebRuntimeRequirementItem[];
  readonly externalSymbols: readonly CsgWebExternalSymbolItem[];
}

export interface CsgWebExternalCapabilityManifestItem {
  readonly id: string;
  readonly capabilityKind: "runtime_requirement" | "external_symbol";
  readonly domain: string;
  readonly kind?: string;
  readonly name: string;
  readonly runtime: string;
  readonly source: string;
  readonly providerStatus: "open";
  readonly candidateProvider: string;
  readonly requiredProvider: "surface-provider";
  readonly hardFailReason: "surface-provider-not-attached";
  readonly loc?: CsgWebSourceLoc;
  readonly owner?: string;
}

export interface CsgWebExternalCapabilityManifestBucket {
  readonly id: string;
  readonly domain: string;
  readonly candidateProvider: string;
  readonly count: number;
  readonly requirementCount: number;
  readonly externalSymbolCount: number;
}

export interface CsgWebExternalCapabilityManifest {
  readonly schema: "csg-web.external-capability-manifest";
  readonly complete: boolean;
  readonly hardFailUntilProvided: true;
  readonly requiredProvider: "surface-provider";
  readonly capabilityCount: number;
  readonly openCapabilityCount: number;
  readonly requirementCount: number;
  readonly externalSymbolCount: number;
  readonly byDomain: readonly CsgWebExternalCapabilityManifestBucket[];
  readonly byCandidateProvider: readonly CsgWebExternalCapabilityManifestBucket[];
  readonly capabilities: readonly CsgWebExternalCapabilityManifestItem[];
}

export interface CsgWebCounts {
  readonly coreFacts: number;
  readonly webFacts: number;
  readonly sourceFiles: number;
  readonly modules: number;
  readonly jsFunctions: number;
  readonly jsCalls: number;
  readonly jsClasses: number;
  readonly jsObjectLiterals: number;
  readonly jsPropertyAccesses: number;
  readonly jsPropertyWrites: number;
  readonly jsElementAccesses: number;
  readonly jsElementWrites: number;
  readonly jsxElements: number;
  readonly domNodeTemplates: number;
  readonly moduleImports: number;
  readonly runtimeRequirements: number;
  readonly externalSymbols: number;
  readonly unsupported: number;
}

export interface CsgWebReport {
  readonly schema: "csg-web.report";
  readonly features: readonly string[];
  readonly complete: boolean;
  readonly coreComplete: boolean;
  readonly runtimeImplemented: boolean;
  readonly runtimeIndependent: boolean;
  readonly engineDependency: string;
  readonly oracleUse: readonly string[];
  readonly projectRoot: string;
  readonly projectFile?: string;
  readonly runtimes: readonly string[];
  readonly entryRoots: readonly string[];
  readonly counts: CsgWebCounts;
  readonly runtimeClosure: CsgWebRuntimeClosure;
  readonly externalCapabilityManifest: CsgWebExternalCapabilityManifest;
  readonly blockedReasons: readonly string[];
  readonly relfacts_count: number;
  readonly relfacts_diff_assert_count: number;
  readonly relfacts_diff_retract_count: number;
  readonly runtime_open_requirement_top: readonly unknown[];
  readonly control_surface_action_count: number;
  readonly actionable_dom_control_count: number;
  readonly control_surface_skipped_unlabeled_count: number;
  readonly control_surface_actionable_coverage_percent: number;
  readonly voice_computer_use_scenario_count: number;
  readonly voice_computer_use_control_coverage_percent: number;
  readonly computer_use_action_count: number;
  readonly computer_use_action_coverage_percent: number;
  readonly computer_use_action_unresolved_count: number;
  readonly voice_task_template_count: number;
  readonly voice_task_step_count: number;
  readonly confirmation_gate_count: number;
  readonly voice_task_high_risk_step_count: number;
  readonly voice_task_required_confirmation_gate_count: number;
  readonly voice_task_missing_confirmation_gate_count: number;
  readonly voice_task_blocked_step_count: number;
  readonly voice_task_ambiguous_step_count: number;
  readonly unimaker_internal_task_ready: boolean;
  readonly subgraph_cid_count: number;
  readonly coreReport: unknown;
  readonly diagnostics: readonly string[];
}
