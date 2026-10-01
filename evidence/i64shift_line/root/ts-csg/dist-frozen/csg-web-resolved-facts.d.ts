/**
 * Runtime-resolved browser facts collected from the UniMaker PWA truth route.
 *
 * This file intentionally does not extend the CSGC schema. The collector emits
 * JSONL facts for offline inspection and later schema design.
 */
export declare const UNIMAKER_CDP_RESOLVED_FACTS_SCHEMA = "unimaker.cdp.resolved_facts.v1";
export declare const UNIMAKER_CDP_RESOLVED_STYLE_PROPERTIES: readonly ["display", "position", "box-sizing", "width", "height", "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left", "font-family", "font-size", "font-weight", "line-height", "color", "background-color", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-radius", "opacity", "overflow-x", "overflow-y", "transform", "z-index"];
export type UniMakerCdpResolvedStyleProperty = typeof UNIMAKER_CDP_RESOLVED_STYLE_PROPERTIES[number];
export type UniMakerCdpResolvedFactKind = "unimaker.cdp.resolved_facts.run" | "unimaker.cdp.resolved_facts.route_state" | "unimaker.cdp.resolved_facts.viewport" | "unimaker.cdp.resolved_facts.dom_node_summary" | "unimaker.cdp.resolved_facts.computed_style" | "unimaker.cdp.resolved_facts.layout_rect" | "unimaker.cdp.resolved_facts.resource_natural_size" | "unimaker.cdp.resolved_facts.document_fonts" | "unimaker.cdp.resolved_facts.runtime_state_hash";
export interface UniMakerCdpResolvedViewport {
    readonly width: number;
    readonly height: number;
    readonly deviceScaleFactor: number;
    readonly isMobile: boolean;
    readonly userAgent: string;
    readonly userAgentMobile: boolean;
    readonly devicePixelRatio: number;
    readonly visualViewport?: {
        readonly width: number;
        readonly height: number;
        readonly scale: number;
        readonly offsetLeft: number;
        readonly offsetTop: number;
    };
}
export interface UniMakerCdpResolvedRouteState {
    readonly expectedRoute: string;
    readonly actualRouteState: string;
    readonly renderReady: boolean;
    readonly semanticNodesLoaded: boolean;
    readonly truthMode: boolean;
    readonly truthRoute: string;
    readonly documentReadyState: string;
    readonly title: string;
    readonly href: string;
}
export interface UniMakerCdpResolvedRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
}
export interface UniMakerCdpResolvedDomNode {
    readonly ordinal: number;
    readonly selector: string;
    readonly tagName: string;
    readonly nodeName: string;
    readonly id: string;
    readonly className: string;
    readonly role: string;
    readonly ariaLabel: string;
    readonly text: string;
    readonly attributes: readonly UniMakerCdpResolvedAttribute[];
    readonly childElementCount: number;
    readonly depth: number;
    readonly visible: boolean;
    readonly interactive: boolean;
}
export interface UniMakerCdpResolvedAttribute {
    readonly name: string;
    readonly value: string;
}
export interface UniMakerCdpResolvedCdpSnapshotSummary {
    readonly documentCount: number;
    readonly nodeCount: number;
    readonly layoutNodeCount: number;
    readonly textBoxCount: number;
}
export interface UniMakerCdpResolvedPerformanceResource {
    readonly name: string;
    readonly initiatorType: string;
    readonly transferSize: number;
    readonly encodedBodySize: number;
    readonly decodedBodySize: number;
    readonly durationMs: number;
    readonly responseStatus?: number;
}
export interface UniMakerCdpResolvedNaturalResource {
    readonly ordinal: number;
    readonly selector: string;
    readonly tagName: string;
    readonly source: string;
    readonly currentSource: string;
    readonly complete?: boolean;
    readonly naturalWidth?: number;
    readonly naturalHeight?: number;
    readonly videoWidth?: number;
    readonly videoHeight?: number;
    readonly readyState?: number;
    readonly canvasWidth?: number;
    readonly canvasHeight?: number;
    readonly svgWidth?: number;
    readonly svgHeight?: number;
    readonly rect: UniMakerCdpResolvedRect;
}
export interface UniMakerCdpResolvedBackgroundResource {
    readonly ordinal: number;
    readonly selector: string;
    readonly urls: readonly string[];
    readonly rect: UniMakerCdpResolvedRect;
}
export interface UniMakerCdpResolvedFontFace {
    readonly family: string;
    readonly style: string;
    readonly weight: string;
    readonly stretch: string;
    readonly status: string;
    readonly display: string;
    readonly unicodeRange: string;
}
interface UniMakerCdpResolvedBaseFact {
    readonly schema: typeof UNIMAKER_CDP_RESOLVED_FACTS_SCHEMA;
    readonly kind: UniMakerCdpResolvedFactKind;
    readonly projectRoot: string;
    readonly route: string;
    readonly capturedAt: string;
    readonly url: string;
}
export interface UniMakerCdpResolvedRunFact extends UniMakerCdpResolvedBaseFact {
    readonly kind: "unimaker.cdp.resolved_facts.run";
    readonly routes: readonly string[];
    readonly viewport: string;
    readonly mode: "started-dev-server" | "connected-base-url";
}
export interface UniMakerCdpResolvedRouteStateFact extends UniMakerCdpResolvedBaseFact {
    readonly kind: "unimaker.cdp.resolved_facts.route_state";
    readonly routeState: UniMakerCdpResolvedRouteState;
}
export interface UniMakerCdpResolvedViewportFact extends UniMakerCdpResolvedBaseFact {
    readonly kind: "unimaker.cdp.resolved_facts.viewport";
    readonly viewport: UniMakerCdpResolvedViewport;
}
export interface UniMakerCdpResolvedDomNodeSummaryFact extends UniMakerCdpResolvedBaseFact {
    readonly kind: "unimaker.cdp.resolved_facts.dom_node_summary";
    readonly cdpSnapshot: UniMakerCdpResolvedCdpSnapshotSummary;
    readonly documentNodeCount: number;
    readonly visibleNodeCount: number;
    readonly nodes: readonly UniMakerCdpResolvedDomNode[];
}
export interface UniMakerCdpResolvedComputedStyleFact extends UniMakerCdpResolvedBaseFact {
    readonly kind: "unimaker.cdp.resolved_facts.computed_style";
    readonly nodeOrdinal: number;
    readonly selector: string;
    readonly tagName: string;
    readonly styles: Readonly<Record<UniMakerCdpResolvedStyleProperty | string, string>>;
}
export interface UniMakerCdpResolvedLayoutRectFact extends UniMakerCdpResolvedBaseFact {
    readonly kind: "unimaker.cdp.resolved_facts.layout_rect";
    readonly nodeOrdinal: number;
    readonly selector: string;
    readonly tagName: string;
    readonly rect: UniMakerCdpResolvedRect;
}
export interface UniMakerCdpResolvedResourceNaturalSizeFact extends UniMakerCdpResolvedBaseFact {
    readonly kind: "unimaker.cdp.resolved_facts.resource_natural_size";
    readonly performanceResources: readonly UniMakerCdpResolvedPerformanceResource[];
    readonly naturalResources: readonly UniMakerCdpResolvedNaturalResource[];
    readonly backgroundResources: readonly UniMakerCdpResolvedBackgroundResource[];
}
export interface UniMakerCdpResolvedDocumentFontsFact extends UniMakerCdpResolvedBaseFact {
    readonly kind: "unimaker.cdp.resolved_facts.document_fonts";
    readonly status: string;
    readonly faceCount: number;
    readonly faces: readonly UniMakerCdpResolvedFontFace[];
}
export interface UniMakerCdpResolvedRuntimeStateHashFact extends UniMakerCdpResolvedBaseFact {
    readonly kind: "unimaker.cdp.resolved_facts.runtime_state_hash";
    readonly hashAlgorithm: "sha256";
    readonly runtimeStateHash: string;
    readonly hashedFactKinds: readonly UniMakerCdpResolvedFactKind[];
}
export type UniMakerCdpResolvedFact = UniMakerCdpResolvedRunFact | UniMakerCdpResolvedRouteStateFact | UniMakerCdpResolvedViewportFact | UniMakerCdpResolvedDomNodeSummaryFact | UniMakerCdpResolvedComputedStyleFact | UniMakerCdpResolvedLayoutRectFact | UniMakerCdpResolvedResourceNaturalSizeFact | UniMakerCdpResolvedDocumentFontsFact | UniMakerCdpResolvedRuntimeStateHashFact;
export {};
