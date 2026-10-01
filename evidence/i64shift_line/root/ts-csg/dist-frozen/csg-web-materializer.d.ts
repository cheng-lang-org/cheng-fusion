import type { CsgFact } from "./schema.js";
export declare const CsgWebMaterializerMarker: "csg_web_materializer ok";
export interface CsgWebMaterializerCounts {
    facts: number;
    elements: number;
    textLiterals: number;
    props: number;
}
export type SceneImagePixelAsset = {
    imageId: number;
    srcWidth: number;
    srcHeight: number;
    pixels: number[];
};
export interface CsgWebMaterializerResult {
    diagnostics: string[];
    text: string;
    marker: typeof CsgWebMaterializerMarker;
    counts: CsgWebMaterializerCounts;
    /** Decoded static <img> rasters referenced by the generated paint registry.
     * Shipped via the scene data asset (CSD1 v6 image section) instead of being
     * inlined as per-pixel statements - the inline form produced 4.5M add()
     * calls (~250MB of source) and blew the compile budget. */
    imageAssets: SceneImagePixelAsset[];
}
export declare const CsgWebSceneFactsMarker: "csg_web_scene_facts ok";
export interface CsgWebSceneFactsCounts {
    inputFacts: number;
    routes: number;
    nodes: number;
    props: number;
    styles: number;
    layouts: number;
    paints: number;
    resources: number;
    layers: number;
    routeEdges: number;
    routeHitRects: number;
    eventHandlers: number;
    hitTargets: number;
    mediaAssets: number;
    mediaPlaybackSlots: number;
    mediaControlActions: number;
    cssUtilities: number;
    cssVariantRules: number;
    textLiterals: number;
}
export interface CsgWebSceneFactsResult {
    diagnostics: string[];
    facts: CsgFact[];
    marker: typeof CsgWebSceneFactsMarker;
    counts: CsgWebSceneFactsCounts;
}
export interface CsgWebDefaultMobileRouteMediaPayloadAsset {
    assetCid: string;
    kind: "video" | "image" | "music";
    kindCode: number;
    mime: string;
    role: "asset" | "poster";
    relPath: string;
    bytes: Buffer;
    byteCount: number;
    sha256: string;
}
export interface CsgWebMaterializerOptions {
    frameLimit?: number;
    dumpMode?: boolean;
    rawPixelDump?: boolean;
    /** Headless multi-route dump: one process loops every mobile route and emits one screenshot dump each. Default off; existing callers unchanged. */
    mobileMultiFrameDump?: boolean;
    pureCheng?: boolean;
    mobileAppExports?: boolean;
    mobileInitialRoute?: string;
    mobileRoutes?: readonly CsgWebMaterializerMobileRoute[];
    mobileVideoFile?: string;
    mobileVideoPosterFile?: string;
    mobileImageFile?: string;
    viewport?: string;
    rootText?: string;
    rootSource?: string;
    rootComponent?: string;
    fontBase64?: string;
    fontBase64s?: string[];
    fontWeights?: number[];
    fontFamilies?: number[];
    staticExpressionValues?: Record<string, StaticExpressionValue>;
    /** Flattened single-class CSS rules (`.class{prop:value;...}`) consulted as a fallback
     *  for class utilities the built-in Tailwind table doesn't know (e.g. app token colors). */
    extraCssText?: string;
    /** Current-HEAD Merkle manifest required to authorize section-local CSGC reads. */
    csgcManifestPath?: string;
    /** Codex surfaces only: fall back to the last render-root candidate when every guard is
     *  statically undecidable (pre-guard-derivation behavior). UniMaker keeps the hard error. */
    undecidableGuardFallback?: boolean;
}
export interface CsgWebMaterializerMobileRoute {
    routeId: string;
    rootText?: string;
    rootSource: string;
    rootComponent?: string;
    underlayRoute?: string;
    staticExpressionValues?: Record<string, StaticExpressionValue>;
}
export interface CsgWebMaterializerSession {
    readonly factCount: number;
    readonly diagnostics: readonly string[];
}
type DefaultMobileRouteMediaOptions = {
    mobileVideoFile?: string;
    mobileVideoPosterFile?: string;
    mobileImageFile?: string;
};
type StaticExpressionValue = string | number | boolean | null | StaticExpressionValue[] | {
    [key: string]: StaticExpressionValue;
};
export declare function materializeCsgWebFactsToChengSource(text: string, options?: CsgWebMaterializerOptions): CsgWebMaterializerResult;
export declare function materializeCsgWebFactArrayToChengSource(facts: readonly CsgFact[], options?: CsgWebMaterializerOptions): CsgWebMaterializerResult;
export declare function createCsgWebMaterializerSession(rawFacts: readonly CsgFact[]): CsgWebMaterializerSession;
export declare function materializeCsgWebSessionToChengSource(session: CsgWebMaterializerSession, options?: CsgWebMaterializerOptions): CsgWebMaterializerResult;
export declare function emitCsgWebSceneFacts(text: string, options?: CsgWebMaterializerOptions): CsgWebSceneFactsResult;
export declare function emitCsgWebSceneFactsFromFactArray(facts: readonly CsgFact[], options?: CsgWebMaterializerOptions): CsgWebSceneFactsResult;
export declare function emitCsgWebSessionToSceneFacts(session: CsgWebMaterializerSession, options?: CsgWebMaterializerOptions): CsgWebSceneFactsResult;
export declare const materializeCsgWebToChengSource: typeof materializeCsgWebFactsToChengSource;
export declare const doudizhuTruthRandomSeed = 338994;
export declare function doudizhuCardLabel(card: {
    suit: string;
    rank: number;
}): string;
export declare function doudizhuSuitColor(card: {
    suit: string;
    rank: number;
}): string;
export declare function defaultMobileRouteContents(mediaOptions?: DefaultMobileRouteMediaOptions): StaticExpressionValue[];
export declare function defaultMobileRouteMusicContent(): StaticExpressionValue;
export declare function defaultMobileRouteMediaPayloadAssetsForFacts(facts: readonly CsgFact[], mediaOptions?: DefaultMobileRouteMediaOptions, additionalVideoMediaOptions?: readonly DefaultMobileRouteMediaOptions[]): CsgWebDefaultMobileRouteMediaPayloadAsset[];
export declare function setAllowDroppedJsxShapes(signatures: readonly string[]): void;
export {};
