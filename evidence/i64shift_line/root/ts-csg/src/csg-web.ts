import { createHash } from "node:crypto";
import * as ts from "typescript";

import {
  countRelationFactsFromFacts,
  type RuntimeOpenRequirementTop,
} from "./csg-relfacts.js";
import {
  emitCsgCoreFromTs,
  emitCsgCoreFromTsDeferred,
  CsgCoreSchema,
  type CsgCoreExternalSymbol,
  type CsgCoreOptions,
  type CsgCoreReport,
  type CsgCoreReportBase,
  type CsgCoreRuntimeClosureExternal,
  type CsgCoreRuntimeClosureGroup,
  type CsgCoreRuntimeRequirement,
} from "./csg-core.js";
import { runtimeRequirementProviderDecision } from "./runtime-providers.js";
import { mergedCsgScanAsync } from "./csg-standard.js";
import { chengCsgFactIdentitiesCanonicalAsync } from "./csg-cheng-bridge.js";
import { chengCsgFactIdentities, type ChengCsgFactIdentity } from "./csg-facts-identity.js";
import type { CsgFact, SourceLoc } from "./schema.js";
import { stableJson } from "./stable-json.js";

export const CsgWebSchema = "csg-web" as const;
export const CsgWebFeatures = [
  "web-facts",
  "js-semantics",
  "dom-css-runtime-closure",
  "dom-node-templates",
  "voice-computer-use-scenarios",
  "typed-computer-use-actions",
  "voice-task-templates",
  "surface-owner-attribution",
  "truth-ref-linkage",
  "pixel-region-mapping",
] as const;
export const CsgWebReportSchema = "csg-web.report" as const;

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

type ProviderDecision = {
  providerStatus: "closed" | "open";
  provider?: string | undefined;
  candidateProvider?: string | undefined;
};

interface VoiceTaskStepSpec {
  targetActionKind: string;
  targetRole: string;
  targetLabel: string;
  targetSourceFile?: string;
  payloadBinding: string;
  effectClass: string;
  confirmationRequired: boolean;
}

interface VoiceTaskTemplateSpec {
  templateId: string;
  taskKind: string;
  utterancePatterns: readonly string[];
  riskPolicy: string;
  steps: readonly VoiceTaskStepSpec[];
}

interface VoiceTaskFactBuildResult {
  facts: CsgFact[];
  diagnostics: string[];
  templateCount: number;
  stepCount: number;
  confirmationGateCount: number;
  highRiskStepCount: number;
  requiredConfirmationGateCount: number;
  missingConfirmationGateCount: number;
  blockedStepCount: number;
  ambiguousStepCount: number;
  unimakerInternalTaskReady: boolean;
}

interface ControlSurfaceCoverage {
  actionableDomControlCount: number;
  skippedUnlabeledCount: number;
  coveragePercent: number;
}

interface DomTemplateIndex {
  byCoreFact: Map<string, CsgFact>;
}

const unimakerVoiceTaskTemplateSpecs: readonly VoiceTaskTemplateSpec[] = [
  {
    templateId: "publish_short_video_draft",
    taskKind: "publish-short-video-draft",
    utterancePatterns: ["帮我发布一个短视频", "发布短视频草稿", "准备短视频发布"],
    riskPolicy: "ai-mode-auto-run-no-confirmation",
    steps: [
      {
        targetActionKind: "SelectFile",
        targetRole: "file-input",
        targetLabel: "ref:fileInputRef",
        targetSourceFile: "app/components/PublishVideoPage.tsx",
        payloadBinding: "videoFile",
        effectClass: "file-selection",
        confirmationRequired: false,
      },
      {
        targetActionKind: "SetText",
        targetRole: "textbox",
        targetLabel: "expr:t.pub_title",
        targetSourceFile: "app/components/PublishVideoPage.tsx",
        payloadBinding: "title",
        effectClass: "text-input",
        confirmationRequired: false,
      },
      {
        targetActionKind: "SetText",
        targetRole: "textbox",
        targetLabel: "expr:t.pubContent_sharePlaceholder",
        targetSourceFile: "app/components/PublishVideoPage.tsx",
        payloadBinding: "description",
        effectClass: "text-input",
        confirmationRequired: false,
      },
      {
        targetActionKind: "Click",
        targetRole: "button",
        targetLabel: "expr:isPublishing ? t.common_loading : t.pub_publish",
        targetSourceFile: "app/components/PublishVideoPage.tsx",
        payloadBinding: "confirmPublish",
        effectClass: "external-publish",
        confirmationRequired: false,
      },
    ],
  },
  {
    templateId: "publish_ad_video_draft",
    taskKind: "publish-ad-video-draft",
    utterancePatterns: ["帮我发布广告的视频", "发布广告视频草稿", "准备广告视频发布"],
    riskPolicy: "ai-mode-auto-run-no-confirmation",
    steps: [
      {
        targetActionKind: "SelectFile",
        targetRole: "file-input",
        targetLabel: "ref:coverInputRef",
        targetSourceFile: "app/components/PublishAdPage.tsx",
        payloadBinding: "adVideoFile",
        effectClass: "file-selection",
        confirmationRequired: false,
      },
      {
        targetActionKind: "SetText",
        targetRole: "textbox",
        targetLabel: "expr:t.pub_title",
        targetSourceFile: "app/components/PublishAdPage.tsx",
        payloadBinding: "title",
        effectClass: "text-input",
        confirmationRequired: false,
      },
      {
        targetActionKind: "SetText",
        targetRole: "textbox",
        targetLabel: "expr:t.pub_description",
        targetSourceFile: "app/components/PublishAdPage.tsx",
        payloadBinding: "description",
        effectClass: "text-input",
        confirmationRequired: false,
      },
      {
        targetActionKind: "Click",
        targetRole: "button",
        targetLabel: "expr:isPublishing ? t.common_loading : t.pub_publish",
        targetSourceFile: "app/components/PublishAdPage.tsx",
        payloadBinding: "confirmPublish",
        effectClass: "external-publish",
        confirmationRequired: false,
      },
    ],
  },
  {
    templateId: "authorized_product_publish_draft",
    taskKind: "authorized-product-publish-draft",
    utterancePatterns: ["帮我从授权商品源生成发布草稿", "发布授权商品草稿", "导入商品并生成草稿"],
    riskPolicy: "ai-mode-auto-run-no-confirmation",
    steps: [
      {
        targetActionKind: "Click",
        targetRole: "button",
        targetLabel: "expr:t.pubProduct_csvMode",
        targetSourceFile: "app/components/PublishProductPage.tsx",
        payloadBinding: "authorizedProductSource",
        effectClass: "ui-event",
        confirmationRequired: false,
      },
      {
        targetActionKind: "SetText",
        targetRole: "textbox",
        targetLabel: "expr:t.pubProduct_productNamePh",
        targetSourceFile: "app/components/PublishProductWizard.tsx",
        payloadBinding: "productTitle",
        effectClass: "text-input",
        confirmationRequired: false,
      },
      {
        targetActionKind: "SetText",
        targetRole: "textbox",
        targetLabel: "expr:t.pubProduct_productDescPh",
        targetSourceFile: "app/components/PublishProductWizard.tsx",
        payloadBinding: "productDescription",
        effectClass: "text-input",
        confirmationRequired: false,
      },
      {
        targetActionKind: "SetNumber",
        targetRole: "spinbutton",
        targetLabel: "0.00",
        targetSourceFile: "app/components/PublishProductWizard.tsx",
        payloadBinding: "price",
        effectClass: "number-input",
        confirmationRequired: false,
      },
      {
        targetActionKind: "Click",
        targetRole: "button",
        targetLabel: "expr:isPublishing ? t.common_loading : t.pub_publish",
        targetSourceFile: "app/components/PublishProductPage.tsx",
        payloadBinding: "confirmPublish",
        effectClass: "external-publish",
        confirmationRequired: false,
      },
    ],
  },
  {
    templateId: "purchase_assist_review",
    taskKind: "purchase-assist-review",
    utterancePatterns: ["帮我买这个商品", "帮我购买商品", "搜索商品并准备购买"],
    riskPolicy: "ai-mode-auto-run-no-confirmation",
    steps: [
      {
        targetActionKind: "SetText",
        targetRole: "textbox",
        targetLabel: "搜索商品...",
        targetSourceFile: "app/components/EcomFeedPage.tsx",
        payloadBinding: "query",
        effectClass: "text-input",
        confirmationRequired: false,
      },
      {
        targetActionKind: "Click",
        targetRole: "button",
        targetLabel: "加入购物车",
        targetSourceFile: "app/components/EcomProductDetailPage.tsx",
        payloadBinding: "addToCart",
        effectClass: "ui-event",
        confirmationRequired: false,
      },
      {
        targetActionKind: "Click",
        targetRole: "button",
        targetLabel: "expr:isPurchased ? '已购买' : '立即购买'",
        targetSourceFile: "app/components/EcomProductDetailPage.tsx",
        payloadBinding: "confirmBeforePayment",
        effectClass: "payment",
        confirmationRequired: false,
      },
    ],
  },
  {
    templateId: "content_search_review",
    taskKind: "content-search-review",
    utterancePatterns: ["搜索内容", "帮我搜索", "搜一下"],
    riskPolicy: "unimaker-internal-search-only",
    steps: [
      {
        targetActionKind: "SetText",
        targetRole: "textbox",
        targetLabel: "搜索商品...",
        targetSourceFile: "app/components/EcomFeedPage.tsx",
        payloadBinding: "query",
        effectClass: "text-input",
        confirmationRequired: false,
      },
    ],
  },
  {
    templateId: "feed_filter_review",
    taskKind: "feed-filter-review",
    utterancePatterns: ["查看距离最近的二手", "查看5公里内的二手", "按距离筛选内容"],
    riskPolicy: "unimaker-internal-search-only",
    steps: [
      {
        targetActionKind: "SetText",
        targetRole: "textbox",
        targetLabel: "expr:t.home_search",
        targetSourceFile: "app/components/HomePage.tsx",
        payloadBinding: "query",
        effectClass: "text-input",
        confirmationRequired: false,
      },
      {
        targetActionKind: "Click",
        targetRole: "button",
        targetLabel: "home-category",
        targetSourceFile: "app/components/HomePage.tsx",
        payloadBinding: "category",
        effectClass: "ui-event",
        confirmationRequired: false,
      },
      {
        targetActionKind: "Click",
        targetRole: "button",
        targetLabel: "home-sort-distance",
        targetSourceFile: "app/components/HomePage.tsx",
        payloadBinding: "sortByDistance",
        effectClass: "ui-event",
        confirmationRequired: false,
      },
      {
        targetActionKind: "SetNumber",
        targetRole: "spinbutton",
        targetLabel: "home-distance-max-km",
        targetSourceFile: "app/components/HomePage.tsx",
        payloadBinding: "distanceKm",
        effectClass: "number-input",
        confirmationRequired: false,
      },
    ],
  },
  {
    templateId: "content_like_review",
    taskKind: "content-like-review",
    utterancePatterns: ["给这条内容点赞", "点赞这个内容", "喜欢这个内容"],
    riskPolicy: "ai-mode-auto-run-no-confirmation",
    steps: [
      {
        targetActionKind: "Click",
        targetRole: "button",
        targetLabel: "expr:formatNumber(likeCount)",
        targetSourceFile: "app/components/ContentDetailPage.tsx",
        payloadBinding: "like",
        effectClass: "ui-event",
        confirmationRequired: false,
      },
    ],
  },
  {
    templateId: "message_history_browse_review",
    taskKind: "message-history-browse-review",
    utterancePatterns: ["打开消息页面", "翻看聊天记录", "查看消息并翻看聊天记录"],
    riskPolicy: "ai-mode-auto-run-no-confirmation",
    steps: [
      {
        targetActionKind: "Route",
        targetRole: "button",
        targetLabel: "expr:t.nav_messages",
        targetSourceFile: "app/App.tsx",
        payloadBinding: "targetTab",
        effectClass: "navigation",
        confirmationRequired: false,
      },
      {
        targetActionKind: "Scroll",
        targetRole: "scroll-region",
        targetLabel: "ref:messagesScrollRef",
        targetSourceFile: "app/components/ChatPage.tsx",
        payloadBinding: "scrollDelta",
        effectClass: "scroll",
        confirmationRequired: false,
      },
    ],
  },
];

const allowedWebFactKinds = new Set([
  "csg.web.schema",
  "csg.web.project",
  "csg.web.module_import_ref",
  "csg.web.js_function_ref",
  "csg.web.js_call_ref",
  "csg.web.js_class_ref",
  "csg.web.js_class_heritage_ref",
  "csg.web.jsx_element",
  "csg.web.dom_node_template",
  "csg.web.control_surface",
  "csg.web.voice_computer_use_scenario",
  "csg.web.computer_use_action",
  "csg.web.voice_task_template",
  "csg.web.voice_task_step",
  "csg.web.confirmation_gate",
  "csg.web.subgraph_cid",
  "csg.web.runtime_requirement",
  "csg.web.external_symbol",
  "csg.web.unsupported_ref",
  "csg.web.surface_owner",
  "csg.web.truth_ref",
  "csg.web.pixel_region",
  "csg.web.media_asset",
  "csg.web.media_playback_slot",
  "csg.web.media_control_action",
  "csg.web.media_control_receipt",
  "csg.web.media_lifecycle_event",
  "csg.web.media_frame_receipt",
  "csg.web.media_receipt_identity",
  "csg.web.media_delivery_receipt",
]);

const intrinsicHtmlTags = new Set([
  "a",
  "abbr",
  "address",
  "area",
  "article",
  "aside",
  "audio",
  "b",
  "base",
  "bdi",
  "bdo",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "datalist",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "embed",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "hr",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "legend",
  "li",
  "link",
  "main",
  "map",
  "mark",
  "menu",
  "meta",
  "meter",
  "nav",
  "noscript",
  "object",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "picture",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "script",
  "search",
  "section",
  "select",
  "slot",
  "small",
  "source",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "track",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
]);

interface CsgWebSubgraphSource {
  fact: CsgFact;
  sourceId: string;
  sourceKind: string;
}

interface CsgWebBuildContext {
  options: CsgWebOptions;
  schemaFact: CsgFact;
  webFacts: CsgFact[];
  runtimeRequirements: CsgWebRuntimeRequirement[];
  externalSymbols: CsgWebExternalSymbol[];
  controlSurfaceFacts: CsgFact[];
  controlSurfaceCoverage: ReturnType<typeof buildControlSurfaceCoverage>;
  voiceComputerUseScenarioFacts: CsgFact[];
  computerUseActionFacts: CsgFact[];
  voiceTaskFacts: ReturnType<typeof buildVoiceTaskFacts>;
  subgraphSources: CsgWebSubgraphSource[];
}

/**
 * Everything the web pipeline can compute from the core facts alone. Consumes
 * only validation-independent report fields (`CsgCoreReportBase`), so it can
 * run while the held-CLI `validate` scan is still in flight.
 */
function buildCsgWebBuildContext(
  options: CsgWebOptions,
  coreFacts: readonly CsgFact[],
  report: CsgCoreReportBase,
): CsgWebBuildContext {
  const requirementDecisionByKey = new Map<string, ProviderDecision>();
  for (const group of report.runtimeClosure.requirements) {
    requirementDecisionByKey.set(requirementKey(group), decisionFromRequirementGroup(group));
  }
  const externalDecisionByKey = new Map<string, ProviderDecision>();
  for (const external of report.runtimeClosure.externalSymbols) {
    externalDecisionByKey.set(externalKey(external), decisionFromExternalGroup(external));
  }

  const webFacts: CsgFact[] = [];
  const runtimeRequirements: CsgWebRuntimeRequirement[] = [];
  const externalSymbols: CsgWebExternalSymbol[] = [];

  const schemaFact: CsgFact = {
    kind: "csg.web.schema",
    language: "typescript",
    schema: CsgWebSchema,
    features: CsgWebFeatures,
    extends: CsgCoreSchema,
  };

  webFacts.push({
    kind: "csg.web.project",
    id: stableId("csg.web.project", report.projectRoot, report.projectFile ?? ""),
    coreSchema: CsgCoreSchema,
    projectRoot: report.projectRoot,
    projectFile: report.projectFile,
    runtimes: report.runtimes,
    entryRoots: report.entryRoots,
    engineDependency: "none",
    runtimeTarget: "cheng-web-runtime",
    coreFactCount: coreFacts.length,
  });

  for (const fact of coreFacts) {
    switch (fact.kind) {
      case "csg.import":
        webFacts.push(webFact({
          kind: "csg.web.module_import_ref",
          id: stableId("csg.web.module_import_ref", stringField(fact, "id")),
          coreFact: fact.id,
          loc: fact.loc,
          module: fact.module,
          moduleName: fact.moduleName,
          importKind: fact.importKind,
          runtime: fact.runtime,
        }));
        break;
      case "csg.function":
        webFacts.push(webFact({
          kind: "csg.web.js_function_ref",
          id: stableId("csg.web.js_function_ref", stringField(fact, "id")),
          coreFact: fact.id,
          loc: fact.loc,
          name: fact.name,
          owner: fact.owner,
          async: fact.async,
          generator: fact.generator,
          exported: fact.exported,
          parameters: fact.parameters,
          returnType: fact.returnType,
        }));
        break;
      case "csg.call":
        webFacts.push(webFact({
          kind: "csg.web.js_call_ref",
          id: stableId("csg.web.js_call_ref", stringField(fact, "id")),
          coreFact: fact.id,
          loc: fact.loc,
          owner: fact.owner,
          targetText: fact.calleeText,
          argumentCount: fact.argumentCount,
          optionalChain: fact.optionalChain,
          receiver: fact.receiver,
          memberName: fact.memberName,
        }));
        break;
      case "csg.class":
        webFacts.push(webFact({
          kind: "csg.web.js_class_ref",
          id: stableId("csg.web.js_class_ref", stringField(fact, "id")),
          coreFact: fact.id,
          loc: fact.loc,
          name: fact.name,
          symbol: fact.symbol,
          exported: fact.exported,
          abstract: fact.abstract,
          typeParameters: fact.typeParameters,
          heritageCount: fact.heritageCount,
        }));
        break;
      case "csg.class_heritage":
        webFacts.push(webFact({
          kind: "csg.web.js_class_heritage_ref",
          id: stableId("csg.web.js_class_heritage_ref", stringField(fact, "id")),
          coreFact: fact.id,
          loc: fact.loc,
          class: fact.class,
          heritageKind: fact.heritageKind,
          expression: fact.expression,
          target: fact.target,
          typeArguments: fact.typeArguments,
        }));
        break;
      case "csg.jsx":
        webFacts.push(webFact({
          kind: "csg.web.jsx_element",
          id: stableId("csg.web.jsx_element", stringField(fact, "id")),
          coreFact: fact.id,
          loc: fact.loc,
          owner: fact.owner,
          tagName: fact.tagName,
          jsxKind: fact.jsxKind,
          attributeCount: fact.attributeCount,
          childCount: fact.childCount,
          props: fact.props,
          children: fact.children,
          lowering: "react-compatible-runtime",
        }));
        webFacts.push(webFact({
          kind: "csg.web.dom_node_template",
          id: stableId("csg.web.dom_node_template", stringField(fact, "id")),
          coreFact: fact.id,
          loc: fact.loc,
          owner: stringField(fact, "owner"),
          tagName: domTemplateTagName(fact),
          nodeKind: domTemplateNodeKind(fact),
          domain: domTemplateDomain(fact),
          attributeCount: fact.attributeCount,
          childCount: fact.childCount,
          props: domTemplateProps(fact),
          children: domTemplateChildren(fact),
          runtimeTarget: "cheng-web-runtime",
        }));
        break;
      case "csg.runtime_requirement": {
        const requirement = webRequirementFromFact(fact, requirementDecisionByKey);
        runtimeRequirements.push(requirement);
        webFacts.push(webFact({
          kind: "csg.web.runtime_requirement",
          id: requirement.id,
          coreRequirement: requirement.coreRequirement,
          domain: requirement.domain,
          requirementKind: requirement.kind,
          name: requirement.name,
          runtime: requirement.runtime,
          source: requirement.source,
          providerStatus: requirement.providerStatus,
          provider: requirement.provider,
          candidateProvider: requirement.candidateProvider,
          loc: requirement.loc,
          owner: requirement.owner,
        }));
        break;
      }
      case "csg.external_symbol": {
        const external = webExternalFromFact(fact, externalDecisionByKey);
        externalSymbols.push(external);
        webFacts.push(webFact({
          kind: "csg.web.external_symbol",
          ...external,
        }));
        break;
      }
      case "csg.unsupported":
        webFacts.push(webFact({
          kind: "csg.web.unsupported_ref",
          id: stableId("csg.web.unsupported_ref", stringField(fact, "id")),
          coreFact: fact.id,
          loc: fact.loc,
          code: fact.code,
          message: fact.message,
          owner: fact.owner,
        }));
        break;
      default:
        break;
    }
  }

  const domTemplateIndex = buildDomTemplateIndex(webFacts);
  let controlSurfaceCoverage = buildControlSurfaceCoverage(webFacts, domTemplateIndex);
  const controlSurfaceFacts = buildControlSurfaceFacts(webFacts, domTemplateIndex);
  const embeddedControlSurfaceFacts = buildEmbeddedComputerUseControlSurfaceFacts(webFacts, controlSurfaceFacts);
  controlSurfaceCoverage = controlSurfaceCoverageWithEmbedded(controlSurfaceCoverage, embeddedControlSurfaceFacts.length);
  for (const fact of embeddedControlSurfaceFacts) {
    controlSurfaceFacts.push(fact);
  }
  controlSurfaceFacts.sort((left, right) => compareText(String(left.id ?? ""), String(right.id ?? "")));
  for (const fact of controlSurfaceFacts) webFacts.push(fact);
  const voiceComputerUseScenarioFacts = buildVoiceComputerUseScenarioFacts(controlSurfaceFacts);
  for (const fact of voiceComputerUseScenarioFacts) webFacts.push(fact);
  const computerUseActionFacts = buildComputerUseActionFacts(controlSurfaceFacts);
  for (const fact of computerUseActionFacts) webFacts.push(fact);
  const voiceTaskFacts = buildVoiceTaskFacts(computerUseActionFacts, report.projectRoot);
  for (const fact of voiceTaskFacts.facts) webFacts.push(fact);
  return {
    options,
    schemaFact,
    webFacts,
    runtimeRequirements,
    externalSymbols,
    controlSurfaceFacts,
    controlSurfaceCoverage,
    voiceComputerUseScenarioFacts,
    computerUseActionFacts,
    voiceTaskFacts,
    subgraphSources: collectSubgraphIdentitySources(coreFacts, webFacts),
  };
}

/**
 * Post-scan assembly: consumes the subgraph identities and the finalized core
 * result. Identical fact/report bytes to the previous inline serial pipeline.
 */
function finishCsgWebResult(
  core: { facts: CsgFact[]; diagnostics: string[]; report: CsgCoreReport },
  context: CsgWebBuildContext,
  identities: readonly ChengCsgFactIdentity[],
): CsgWebResult {
  const subgraphCidFacts = buildSubgraphCidFactsFromIdentities(context.subgraphSources, identities);
  for (const fact of subgraphCidFacts) context.webFacts.push(fact);
  const surfaceOwnerFacts = buildSurfaceOwnerFacts(context.webFacts, core.facts, core.report.projectRoot);
  for (const fact of surfaceOwnerFacts) context.webFacts.push(fact);
  const truthRefFacts = buildTruthRefFacts(surfaceOwnerFacts);
  for (const fact of truthRefFacts) context.webFacts.push(fact);
  const pixelRegionFacts = buildPixelRegionFacts(surfaceOwnerFacts, truthRefFacts);
  for (const fact of pixelRegionFacts) context.webFacts.push(fact);
  const coreFactCount = core.facts.length;
  const relfactsCount = countRelationFactsFromFacts(core.facts) + countRelationFactsFromFacts(context.webFacts);
  const runtimeClosure = buildWebRuntimeClosure(context.runtimeRequirements, context.externalSymbols);
  const externalCapabilityManifest = buildExternalCapabilityManifest(context.runtimeRequirements, context.externalSymbols);
  const blockedReasons = buildBlockedReasons(core.report, runtimeClosure, externalCapabilityManifest);
  const runtimeOpenRequirementTop = runtimeOpenRequirementTopFromRequirements(runtimeClosure.requirements, 10);
  const report: CsgWebReport = {
    schema: CsgWebReportSchema,
    features: CsgWebFeatures,
    complete: core.report.complete && runtimeClosure.complete,
    coreComplete: core.report.complete,
    runtimeImplemented: false,
    runtimeIndependent: true,
    engineDependency: "none",
    oracleUse: ["node-for-js-oracle", "chrome-for-web-oracle"],
    projectRoot: core.report.projectRoot,
    projectFile: core.report.projectFile,
    runtimes: core.report.runtimes,
    entryRoots: core.report.entryRoots,
    counts: countWebFacts(core.report, coreFactCount, context.webFacts, context.runtimeRequirements, context.externalSymbols),
    runtimeClosure,
    externalCapabilityManifest,
    blockedReasons,
    relfacts_count: relfactsCount,
    relfacts_diff_assert_count: 0,
    relfacts_diff_retract_count: 0,
    runtime_open_requirement_top: runtimeOpenRequirementTop,
    control_surface_action_count: context.controlSurfaceFacts.length,
    actionable_dom_control_count: context.controlSurfaceCoverage.actionableDomControlCount,
    control_surface_skipped_unlabeled_count: context.controlSurfaceCoverage.skippedUnlabeledCount,
    control_surface_actionable_coverage_percent: context.controlSurfaceCoverage.coveragePercent,
    voice_computer_use_scenario_count: context.voiceComputerUseScenarioFacts.length,
    voice_computer_use_control_coverage_percent: context.controlSurfaceFacts.length > 0
      ? Math.trunc((context.controlSurfaceFacts.length * 100) / context.controlSurfaceFacts.length)
      : 0,
    computer_use_action_count: context.computerUseActionFacts.length,
    computer_use_action_coverage_percent: context.controlSurfaceFacts.length > 0
      ? Math.trunc((context.computerUseActionFacts.length * 100) / context.controlSurfaceFacts.length)
      : 0,
    computer_use_action_unresolved_count: context.controlSurfaceFacts.length - context.computerUseActionFacts.length,
    voice_task_template_count: context.voiceTaskFacts.templateCount,
    voice_task_step_count: context.voiceTaskFacts.stepCount,
    confirmation_gate_count: context.voiceTaskFacts.confirmationGateCount,
    voice_task_high_risk_step_count: context.voiceTaskFacts.highRiskStepCount,
    voice_task_required_confirmation_gate_count: context.voiceTaskFacts.requiredConfirmationGateCount,
    voice_task_missing_confirmation_gate_count: context.voiceTaskFacts.missingConfirmationGateCount,
    voice_task_blocked_step_count: context.voiceTaskFacts.blockedStepCount,
    voice_task_ambiguous_step_count: context.voiceTaskFacts.ambiguousStepCount,
    unimaker_internal_task_ready: context.voiceTaskFacts.unimakerInternalTaskReady,
    subgraph_cid_count: subgraphCidFacts.length,
    coreReport: core.report,
    diagnostics: core.diagnostics.concat(context.voiceTaskFacts.diagnostics),
  };

  const allFacts = core.facts;
  allFacts.unshift(context.schemaFact);
  for (const fact of context.webFacts) allFacts.push(fact);

  return {
    facts: allFacts,
    diagnostics: core.diagnostics.concat(context.voiceTaskFacts.diagnostics),
    report,
    text: context.options.emitText === false ? "" : allFacts.map((fact) => stableJson(fact, context.options.pretty)).join("\n") + "\n",
  };
}

/** Serial engine (unchanged public behavior): validate blocks, then identities. */
export function emitCsgWebFromTs(options: CsgWebOptions): CsgWebResult {
  const core = emitCsgCoreFromTs(options);
  const context = buildCsgWebBuildContext(options, core.facts, core.report);
  const identities = chengCsgFactIdentities(context.subgraphSources.map((source) => source.fact));
  return finishCsgWebResult(core, context, identities);
}

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
export async function emitCsgWebFromTsAsync(options: CsgWebOptions): Promise<CsgWebResult> {
  const phase = emitCsgCoreFromTsDeferred(options);
  if (phase.kind === "failed") {
    const core = phase.result;
    const context = buildCsgWebBuildContext(options, core.facts, core.report);
    const identities = chengCsgFactIdentities(context.subgraphSources.map((source) => source.fact));
    return finishCsgWebResult(core, context, identities);
  }
  const scanPromise = mergedCsgScanAsync(phase.facts);
  const context = buildCsgWebBuildContext(options, phase.facts, phase.reportBase);
  const lineIndexByFact = new Map<CsgFact, number>();
  for (let index = 0; index < phase.facts.length; index += 1) {
    const fact = phase.facts[index];
    if (fact !== undefined && !lineIndexByFact.has(fact)) {
      lineIndexByFact.set(fact, index);
    }
  }
  const deferredFacts: CsgFact[] = [];
  const sourceRowIndexes = context.subgraphSources.map((source): number => {
    const rowIndex = lineIndexByFact.get(source.fact);
    if (rowIndex === undefined) {
      deferredFacts.push(source.fact);
      return -1;
    }
    return rowIndex;
  });
  const [scan, deferredRows] = await Promise.all([
    scanPromise,
    deferredFacts.length > 0
      ? chengCsgFactIdentitiesCanonicalAsync(deferredFacts)
      : Promise.resolve([]),
  ]);
  if (!scan.validation.valid) {
    // Validation failure: the CLI skips the identity rows (the bound DAG is
    // only built for a valid fact set). Preserve the old pipeline behavior —
    // identities are content-only and stay computable for an invalid fact
    // set, and the finalized report carries the validation errors.
    const identities = await chengCsgFactIdentitiesCanonicalAsync(
      context.subgraphSources.map((source) => source.fact),
    );
    return finishCsgWebResult(phase.finalize(scan.validation), context, identities);
  }
  let deferredCursor = 0;
  const identities = sourceRowIndexes.map((rowIndex) => {
    if (rowIndex < 0) {
      const row = deferredRows[deferredCursor];
      deferredCursor += 1;
      if (!row) {
        throw new Error("pure Cheng web subgraph identity is missing");
      }
      return row;
    }
    const row = scan.identities[rowIndex];
    if (!row) {
      throw new Error("pure Cheng web subgraph identity is missing");
    }
    return row;
  });
  return finishCsgWebResult(phase.finalize(scan.validation), context, identities);
}

export function validateCsgWebText(text: string): CsgWebValidationResult {
  const diagnostics: string[] = [];
  const facts: CsgFact[] = [];
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { ok: false, diagnostics: ["empty csg-web facts"], facts };
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    try {
      const fact = JSON.parse(line) as CsgFact;
      facts.push(fact);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(`line ${index + 1}: invalid JSON fact: ${message}`);
    }
  }

  const first = facts[0];
  if (!first || first.kind !== "csg.web.schema" || first.schema !== CsgWebSchema) {
    diagnostics.push("first fact must be csg.web.schema with schema=csg-web");
  }
  if (!facts.some((fact) => fact.kind === "csg.core.schema")) {
    diagnostics.push(`csg-web facts must embed ${CsgCoreSchema} schema facts`);
  }
  for (const fact of facts) {
    if (fact.kind.startsWith("csg.web.") && !allowedWebFactKinds.has(fact.kind)) {
      diagnostics.push(`unknown csg-web fact kind: ${fact.kind}`);
    }
  }
  return { ok: diagnostics.length === 0, diagnostics, facts };
}

function webRequirementFromFact(
  fact: CsgFact,
  decisions: ReadonlyMap<string, ProviderDecision>,
): CsgWebRuntimeRequirement {
  const runtime = stringField(fact, "runtime");
  const source = stringField(fact, "source");
  const kind = stringField(fact, "requirementKind", "kind");
  const name = stringField(fact, "name");
  const decision = decisionFromRequirementFact(fact, runtime, source, kind, name) ??
    decisions.get(requirementKey({ runtime, source, kind, name })) ??
    { providerStatus: "open" as const };
  return {
    id: stableId("csg.web.runtime_requirement", stringField(fact, "id")),
    coreRequirement: stringField(fact, "id"),
    domain: runtimeDomain(runtime, source, kind, name),
    kind,
    name,
    runtime,
    source,
    providerStatus: decision.providerStatus,
    provider: decision.provider,
    candidateProvider: decision.candidateProvider,
    loc: fact.loc,
    owner: typeof fact.owner === "string" ? fact.owner : undefined,
  };
}

function webExternalFromFact(
  fact: CsgFact,
  decisions: ReadonlyMap<string, ProviderDecision>,
): CsgWebExternalSymbol {
  const runtime = stringField(fact, "runtime");
  const source = stringField(fact, "source");
  const name = stringField(fact, "name");
  const decision = decisions.get(externalKey({ runtime, source, name })) ?? { providerStatus: "open" as const };
  return {
    id: stableId("csg.web.external_symbol", stringField(fact, "id")),
    coreExternalSymbol: stringField(fact, "id"),
    domain: runtimeDomain(runtime, source, "external_symbol", name),
    name,
    runtime,
    source,
    providerStatus: decision.providerStatus,
    provider: decision.provider,
    candidateProvider: decision.candidateProvider,
  };
}

function buildWebRuntimeClosure(
  requirements: readonly CsgWebRuntimeRequirement[],
  externalSymbols: readonly CsgWebExternalSymbol[],
): CsgWebRuntimeClosure {
  const byDomain = new Map<string, { count: number; closedCount: number; openCount: number; candidateCount: number }>();
  let openRequirementCount = 0;
  let openExternalSymbolCount = 0;
  let closedRequirementCount = 0;
  let closedExternalSymbolCount = 0;
  let candidateRequirementCount = 0;
  let candidateExternalSymbolCount = 0;

  for (const item of requirements) {
    const closed = item.providerStatus === "closed";
    const candidate = item.candidateProvider !== undefined;
    if (closed) closedRequirementCount += 1;
    else openRequirementCount += 1;
    if (candidate) candidateRequirementCount += 1;
    incrementDomain(byDomain, item.domain, closed, candidate);
  }
  for (const item of externalSymbols) {
    const closed = item.providerStatus === "closed";
    const candidate = item.candidateProvider !== undefined;
    if (closed) closedExternalSymbolCount += 1;
    else openExternalSymbolCount += 1;
    if (candidate) candidateExternalSymbolCount += 1;
    incrementDomain(byDomain, item.domain, closed, candidate);
  }

  const buckets = [...byDomain.entries()]
    .map(([domain, value]) => ({
      id: stableId("csg.web.runtime_domain", domain),
      domain,
      count: value.count,
      closedCount: value.closedCount,
      openCount: value.openCount,
      candidateCount: value.candidateCount,
    }))
    .sort(compareByDomain);

  return {
    schema: "csg-web.runtime-closure",
    features: CsgWebFeatures,
    complete: openRequirementCount === 0 && openExternalSymbolCount === 0,
    requirementCount: requirements.length,
    externalSymbolCount: externalSymbols.length,
    openRequirementCount,
    openExternalSymbolCount,
    closedRequirementCount,
    closedExternalSymbolCount,
    candidateRequirementCount,
    candidateExternalSymbolCount,
    domainCount: buckets.length,
    byDomain: buckets,
    requirements: [...requirements].sort(compareById),
    externalSymbols: [...externalSymbols].sort(compareById),
  };
}

function runtimeOpenRequirementTopFromRequirements(
  requirements: readonly CsgWebRuntimeRequirement[],
  limit: number,
): RuntimeOpenRequirementTop[] {
  const counts = new Map<string, RuntimeOpenRequirementTop>();
  for (const item of requirements) {
    if (item.providerStatus !== "open") continue;
    const key = `${item.domain}:${item.kind}:${item.name}`;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { domain: item.domain, kind: item.kind, name: item.name, count: 1 });
  }
  return [...counts.values()].sort(compareRuntimeOpenRequirementTop).slice(0, limit);
}

function compareRuntimeOpenRequirementTop(left: RuntimeOpenRequirementTop, right: RuntimeOpenRequirementTop): number {
  if (left.count !== right.count) return right.count - left.count;
  if (left.domain < right.domain) return -1;
  if (left.domain > right.domain) return 1;
  if (left.kind < right.kind) return -1;
  if (left.kind > right.kind) return 1;
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  return 0;
}

function buildExternalCapabilityManifest(
  requirements: readonly CsgWebRuntimeRequirement[],
  externalSymbols: readonly CsgWebExternalSymbol[],
): CsgWebExternalCapabilityManifest {
  const capabilities: CsgWebExternalCapabilityManifestItem[] = [];
  for (const item of requirements) {
    if (!isOpenExternalCapability(item)) continue;
    capabilities.push({
      id: stableId("csg.web.external_capability", "runtime_requirement", item.id),
      capabilityKind: "runtime_requirement",
      domain: item.domain,
      kind: item.kind,
      name: item.name,
      runtime: item.runtime,
      source: item.source,
      providerStatus: "open",
      candidateProvider: item.candidateProvider,
      requiredProvider: "surface-provider",
      hardFailReason: "surface-provider-not-attached",
      loc: item.loc,
      owner: item.owner,
    });
  }
  for (const item of externalSymbols) {
    if (!isOpenExternalCapability(item)) continue;
    capabilities.push({
      id: stableId("csg.web.external_capability", "external_symbol", item.id),
      capabilityKind: "external_symbol",
      domain: item.domain,
      name: item.name,
      runtime: item.runtime,
      source: item.source,
      providerStatus: "open",
      candidateProvider: item.candidateProvider,
      requiredProvider: "surface-provider",
      hardFailReason: "surface-provider-not-attached",
    });
  }
  const sortedCapabilities = capabilities.sort(compareExternalCapability);
  return {
    schema: "csg-web.external-capability-manifest",
    complete: sortedCapabilities.length === 0,
    hardFailUntilProvided: true,
    requiredProvider: "surface-provider",
    capabilityCount: sortedCapabilities.length,
    openCapabilityCount: sortedCapabilities.length,
    requirementCount: sortedCapabilities.filter((item) => item.capabilityKind === "runtime_requirement").length,
    externalSymbolCount: sortedCapabilities.filter((item) => item.capabilityKind === "external_symbol").length,
    byDomain: buildExternalCapabilityBuckets(sortedCapabilities, "domain"),
    byCandidateProvider: buildExternalCapabilityBuckets(sortedCapabilities, "candidateProvider"),
    capabilities: sortedCapabilities,
  };
}

function buildBlockedReasons(
  coreReport: CsgCoreReport,
  closure: CsgWebRuntimeClosure,
  externalManifest: CsgWebExternalCapabilityManifest,
): string[] {
  const reasons: string[] = [];
  if (!closure.complete) reasons.push("cheng web runtime is not complete");
  if (coreReport.diagnostics.length > 0) reasons.push("typescript diagnostics are present");
  if (coreReport.unsupported.length > 0) reasons.push("csg-core contains unsupported semantics");
  if (closure.openRequirementCount > 0) reasons.push("cheng web runtime has open runtime requirements");
  if (closure.openExternalSymbolCount > 0) reasons.push("cheng web runtime has open external symbols");
  if (externalManifest.openCapabilityCount > 0) reasons.push("surface provider has open external capabilities");
  return reasons.sort();
}

function isOpenExternalCapability<T extends Pick<CsgWebRuntimeRequirement | CsgWebExternalSymbol, "domain" | "providerStatus" | "candidateProvider">>(
  item: T,
): item is T & { candidateProvider: string } {
  return item.providerStatus === "open" &&
    item.candidateProvider !== undefined &&
    (item.domain === "external-host" || item.domain === "web-resource" || item.domain === "node-host");
}

function buildExternalCapabilityBuckets(
  capabilities: readonly CsgWebExternalCapabilityManifestItem[],
  key: "domain" | "candidateProvider",
): CsgWebExternalCapabilityManifestBucket[] {
  const buckets = new Map<string, { count: number; requirementCount: number; externalSymbolCount: number; domain: string; candidateProvider: string }>();
  for (const item of capabilities) {
    const value = item[key];
    const bucket = buckets.get(value) ?? {
      count: 0,
      requirementCount: 0,
      externalSymbolCount: 0,
      domain: key === "domain" ? value : item.domain,
      candidateProvider: key === "candidateProvider" ? value : item.candidateProvider,
    };
    bucket.count += 1;
    if (item.capabilityKind === "runtime_requirement") bucket.requirementCount += 1;
    else bucket.externalSymbolCount += 1;
    buckets.set(value, bucket);
  }
  return [...buckets.entries()]
    .map(([name, bucket]) => ({
      id: stableId("csg.web.external_capability.bucket", key, name),
      domain: bucket.domain,
      candidateProvider: bucket.candidateProvider,
      count: bucket.count,
      requirementCount: bucket.requirementCount,
      externalSymbolCount: bucket.externalSymbolCount,
    }))
    .sort(compareExternalCapabilityBucket);
}

function countWebFacts(
  coreReport: CsgCoreReport,
  coreFactCount: number,
  webFacts: readonly CsgFact[],
  requirements: readonly CsgWebRuntimeRequirement[],
  externalSymbols: readonly CsgWebExternalSymbol[],
): CsgWebCounts {
  const counts = new Map<string, number>();
  for (const fact of webFacts) counts.set(fact.kind, (counts.get(fact.kind) ?? 0) + 1);
  return {
    coreFacts: coreFactCount,
    webFacts: webFacts.length,
    sourceFiles: coreReport.counts.sourceFiles,
    modules: coreReport.counts.modules,
    jsFunctions: counts.get("csg.web.js_function_ref") ?? 0,
    jsCalls: counts.get("csg.web.js_call_ref") ?? 0,
    jsClasses: counts.get("csg.web.js_class_ref") ?? 0,
    jsObjectLiterals: coreReport.counts.objectLiterals,
    jsPropertyAccesses: coreReport.counts.propertyReads + coreReport.counts.propertyWrites,
    jsPropertyWrites: coreReport.counts.propertyWrites,
    jsElementAccesses: coreReport.counts.elementReads + coreReport.counts.elementWrites,
    jsElementWrites: coreReport.counts.elementWrites,
    jsxElements: counts.get("csg.web.jsx_element") ?? 0,
    domNodeTemplates: counts.get("csg.web.dom_node_template") ?? 0,
    moduleImports: counts.get("csg.web.module_import_ref") ?? 0,
    runtimeRequirements: requirements.length,
    externalSymbols: externalSymbols.length,
    unsupported: coreReport.unsupported.length,
    surfaceOwners: counts.get("csg.web.surface_owner") ?? 0,
    truthRefs: counts.get("csg.web.truth_ref") ?? 0,
    pixelRegions: counts.get("csg.web.pixel_region") ?? 0,
  };
}

function buildDomTemplateIndex(webFacts: readonly CsgFact[]): DomTemplateIndex {
  const byCoreFact = new Map<string, CsgFact>();
  for (const fact of webFacts) {
    if (fact.kind !== "csg.web.dom_node_template") continue;
    byCoreFact.set(stringField(fact, "coreFact"), fact);
  }
  return { byCoreFact };
}

function buildControlSurfaceCoverage(webFacts: readonly CsgFact[], domTemplateIndex: DomTemplateIndex): ControlSurfaceCoverage {
  let actionableDomControlCount = 0;
  let skippedUnlabeledCount = 0;
  for (const fact of webFacts) {
    if (fact.kind !== "csg.web.dom_node_template") continue;
    const tagName = stringField(fact, "tagName");
    const nodeKind = stringField(fact, "nodeKind");
    if (nodeKind !== "element") continue;
    const role = controlRole(fact, tagName);
    const actionKind = controlActionKind(fact, tagName);
    if (!role || !actionKind) continue;
    actionableDomControlCount += 1;
    if (!controlLabel(fact, tagName, domTemplateIndex)) skippedUnlabeledCount += 1;
  }
  const covered = actionableDomControlCount - skippedUnlabeledCount;
  return {
    actionableDomControlCount,
    skippedUnlabeledCount,
    coveragePercent: actionableDomControlCount > 0
      ? Math.trunc((covered * 100) / actionableDomControlCount)
      : 0,
  };
}

function controlSurfaceCoverageWithEmbedded(
  coverage: ControlSurfaceCoverage,
  embeddedControlSurfaceCount: number,
): ControlSurfaceCoverage {
  if (embeddedControlSurfaceCount <= 0) return coverage;
  const actionableDomControlCount = coverage.actionableDomControlCount + embeddedControlSurfaceCount;
  const covered = actionableDomControlCount - coverage.skippedUnlabeledCount;
  return {
    actionableDomControlCount,
    skippedUnlabeledCount: coverage.skippedUnlabeledCount,
    coveragePercent: actionableDomControlCount > 0
      ? Math.trunc((covered * 100) / actionableDomControlCount)
      : 0,
  };
}

function buildControlSurfaceFacts(webFacts: readonly CsgFact[], domTemplateIndex: DomTemplateIndex): CsgFact[] {
  const controls: CsgFact[] = [];
  for (const fact of webFacts) {
    if (fact.kind !== "csg.web.dom_node_template") continue;
    const tagName = stringField(fact, "tagName");
    const nodeKind = stringField(fact, "nodeKind");
    if (nodeKind !== "element") continue;
    const role = controlRole(fact, tagName);
    const actionKind = controlActionKind(fact, tagName);
    if (!role || !actionKind) continue;
    const label = controlLabel(fact, tagName, domTemplateIndex);
    if (!label) continue;
    const sourceId = stringField(fact, "id");
    controls.push(webFact({
      kind: "csg.web.control_surface",
      id: stableId("csg.web.control_surface", sourceId, actionKind),
      coreFact: fact.coreFact,
      nodeTemplate: sourceId,
      owner: stringField(fact, "owner"),
      role,
      label,
      stateRef: stableId("csg.web.state_ref", sourceId),
      actionKind,
      routeTarget: controlRouteTarget(fact, tagName),
      payloadSchema: controlPayloadSchema(actionKind),
      effect: controlEffect(actionKind),
      guard: "runtime-event-target",
      trace: stableId("csg.web.control_trace", sourceId, actionKind),
      sourceFile: locFile(fact),
      sourceLine: locLine(fact),
    }));
  }
  return controls.sort((left, right) => compareText(String(left.id ?? ""), String(right.id ?? "")));
}

function buildEmbeddedComputerUseControlSurfaceFacts(
  webFacts: readonly CsgFact[],
  existingControls: readonly CsgFact[],
): CsgFact[] {
  const controls: CsgFact[] = [];
  const seen = new Set<string>();
  for (const fact of existingControls) {
    seen.add(controlSurfaceUniquenessKey(fact));
  }
  for (const fact of webFacts) {
    if (fact.kind !== "csg.web.dom_node_template") continue;
    const sourceFile = locFile(fact);
    const baseLine = locLine(fact);
    const parentId = stringField(fact, "id");
    const children = Array.isArray(fact.children) ? fact.children : [];
    for (const child of children) {
      if (!child || typeof child !== "object") continue;
      const item = child as Record<string, unknown>;
      if (item.kind !== "expression" || typeof item.expression !== "string") continue;
      const embeddedControls = extractEmbeddedJsxComputerUseControls(item.expression, {
        parentId,
        parentCoreFact: stringField(fact, "coreFact"),
        parentOwner: stringField(fact, "owner"),
        sourceFile,
        baseLine,
        ordinal: Number(item.ordinal ?? 0),
      });
      for (const embedded of embeddedControls) {
        const key = controlSurfaceUniquenessKey(embedded);
        if (seen.has(key)) continue;
        seen.add(key);
        controls.push(embedded);
      }
    }
  }
  return controls.sort((left, right) => compareText(String(left.id ?? ""), String(right.id ?? "")));
}

function extractEmbeddedJsxComputerUseControls(
  expression: string,
  context: {
    parentId: string;
    parentCoreFact: string;
    parentOwner: string;
    sourceFile: string;
    baseLine: number;
    ordinal: number;
  },
): CsgFact[] {
  const controls: CsgFact[] = [];
  const prefix = "const __csgEmbeddedExpression = (";
  const sourceText = `${prefix}${expression}\n);`;
  const source = ts.createSourceFile("embedded-expression.tsx", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let localIndex = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) {
      const extracted = embeddedControlFromJsxOpening(node.openingElement, node.children, source, context, localIndex);
      localIndex += 1;
      if (extracted) controls.push(extracted);
    } else if (ts.isJsxSelfClosingElement(node)) {
      const extracted = embeddedControlFromJsxOpening(node, [], source, context, localIndex);
      localIndex += 1;
      if (extracted) controls.push(extracted);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return controls;
}

function embeddedControlFromJsxOpening(
  node: ts.JsxOpeningLikeElement,
  children: readonly ts.JsxChild[],
  source: ts.SourceFile,
  context: {
    parentId: string;
    parentCoreFact: string;
    parentOwner: string;
    sourceFile: string;
    baseLine: number;
    ordinal: number;
  },
  localIndex: number,
): CsgFact | null {
  const tagName = node.tagName.getText(source);
  if (!intrinsicHtmlTags.has(tagName.toLowerCase())) return null;
  const props = jsxAttributesToProps(node, source);
  const role = controlRoleFromProps(tagName, props);
  const actionKind = controlActionKindFromProps(tagName, props);
  if (!role || !actionKind) return null;
  const label = embeddedControlLabel(props, children, source);
  if (!label) return null;
  const line = context.baseLine + source.getLineAndCharacterOfPosition(node.getStart(source)).line;
  const nodeTemplate = stableId(
    "csg.web.embedded_dom_node_template",
    context.parentId,
    String(context.ordinal),
    String(localIndex),
    tagName,
    label,
  );
  return webFact({
    kind: "csg.web.control_surface",
    id: stableId("csg.web.control_surface", nodeTemplate, actionKind),
    coreFact: context.parentCoreFact,
    nodeTemplate,
    owner: context.parentOwner,
    role,
    label,
    stateRef: stableId("csg.web.state_ref", nodeTemplate),
    actionKind,
    routeTarget: controlRouteTargetFromProps(tagName, props),
    payloadSchema: controlPayloadSchema(actionKind),
    effect: controlEffect(actionKind),
    guard: "runtime-event-target",
    trace: stableId("csg.web.control_trace", nodeTemplate, actionKind),
    sourceFile: context.sourceFile,
    sourceLine: line,
  });
}

function jsxAttributesToProps(node: ts.JsxOpeningLikeElement, source: ts.SourceFile): Record<string, unknown>[] {
  const props: Record<string, unknown>[] = [];
  let ordinal = 0;
  for (const prop of node.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const name = prop.name.getText(source);
    const item: Record<string, unknown> = {
      kind: "attribute",
      ordinal,
      name,
    };
    ordinal += 1;
    if (!prop.initializer) {
      item.valueKind = "boolean";
      item.value = "true";
    } else if (ts.isStringLiteral(prop.initializer)) {
      item.valueKind = "string";
      item.value = prop.initializer.text;
    } else if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
      item.valueKind = "expression";
      item.expression = prop.initializer.expression.getText(source);
    }
    props.push(item);
  }
  return props;
}

function embeddedControlLabel(
  props: readonly unknown[],
  children: readonly ts.JsxChild[],
  source: ts.SourceFile,
): string {
  const semanticId = propStringFromProps(props, "data-computer-use-id");
  if (semanticId) return semanticId;
  const label = controlLabelFromProps(props);
  if (label) return label;
  const childText = embeddedJsxChildLabel(children, source);
  if (childText) return childText;
  return "";
}

function controlLabelFromProps(props: readonly unknown[]): string {
  const labelProps = new Set(["aria-label", "aria-labelledby", "title", "placeholder", "alt", "name"]);
  for (const prop of props) {
    if (!prop || typeof prop !== "object") continue;
    const item = prop as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name : "";
    if (!labelProps.has(name)) continue;
    if (typeof item.value === "string") {
      const value = normalizeLabelText(item.value);
      if (value) return value;
    }
    if (typeof item.expression === "string") {
      const value = normalizeLabelText(item.expression);
      if (value) return `expr:${value}`;
    }
  }
  return "";
}

function embeddedJsxChildLabel(children: readonly ts.JsxChild[], source: ts.SourceFile): string {
  const parts: string[] = [];
  const collect = (child: ts.JsxChild): void => {
    if (ts.isJsxText(child)) {
      const text = normalizeLabelText(child.getText(source));
      if (text) parts.push(text);
    } else if (ts.isJsxExpression(child) && child.expression) {
      const expression = normalizeLabelText(child.expression.getText(source));
      if (expression) parts.push(`expr:${expression}`);
    } else if (ts.isJsxElement(child)) {
      for (const nested of child.children) collect(nested);
    }
  };
  for (const child of children) collect(child);
  return parts.join(" ").trim();
}

function controlSurfaceUniquenessKey(fact: CsgFact): string {
  return [
    stringField(fact, "sourceFile"),
    stringField(fact, "actionKind"),
    stringField(fact, "role"),
    stringField(fact, "label"),
    stringField(fact, "nodeTemplate"),
  ].join("\u0000");
}

function buildVoiceComputerUseScenarioFacts(controlSurfaceFacts: readonly CsgFact[]): CsgFact[] {
  const scenarios: CsgFact[] = [];
  for (const fact of controlSurfaceFacts) {
    if (fact.kind !== "csg.web.control_surface") continue;
    const controlSurface = stringField(fact, "id");
    const actionKind = stringField(fact, "actionKind");
    const label = stringField(fact, "label");
    scenarios.push(webFact({
      kind: "csg.web.voice_computer_use_scenario",
      id: stableId("csg.web.voice_computer_use_scenario", controlSurface, actionKind),
      controlSurface,
      nodeTemplate: stringField(fact, "nodeTemplate"),
      scenarioKind: voiceScenarioKind(actionKind),
      role: stringField(fact, "role"),
      label,
      actionKind,
      payloadSchema: stringField(fact, "payloadSchema"),
      utteranceTemplate: voiceUtteranceTemplate(actionKind, label),
      computerUseMode: "typed-control-action",
      automationPath: "voice-input -> intent -> typed-action -> runtime-event",
      eventEffect: stringField(fact, "effect"),
      dispatch: "event-system",
      visualClickFallback: false,
      hardFailReason: "surface-provider-not-attached",
      trace: stringField(fact, "trace"),
    }));
  }
  return scenarios.sort((left, right) => compareText(String(left.id ?? ""), String(right.id ?? "")));
}

function buildComputerUseActionFacts(controlSurfaceFacts: readonly CsgFact[]): CsgFact[] {
  const actions: CsgFact[] = [];
  for (const fact of controlSurfaceFacts) {
    if (fact.kind !== "csg.web.control_surface") continue;
    const controlSurface = stringField(fact, "id");
    const actionKind = stringField(fact, "actionKind");
    const label = stringField(fact, "label");
    const semanticId = stableId(
      "csg.web.semantic_id",
      stringField(fact, "nodeTemplate"),
      actionKind,
      stringField(fact, "role"),
      label,
    );
    actions.push(webFact({
      kind: "csg.web.computer_use_action",
      id: stableId("csg.web.computer_use_action", controlSurface, semanticId),
      controlSurface,
      semanticId,
      nodeTemplate: stringField(fact, "nodeTemplate"),
      owner: stringField(fact, "owner"),
      role: stringField(fact, "role"),
      label,
      actionKind,
      routeTarget: stringField(fact, "routeTarget"),
      payloadSchema: stringField(fact, "payloadSchema"),
      effectClass: computerUseEffectClass(actionKind, label),
      guard: stringField(fact, "guard"),
      trace: stringField(fact, "trace"),
      dispatch: "event-system",
      visualClickFallback: false,
      sourceFile: stringField(fact, "sourceFile"),
      sourceLine: numberField(fact, "sourceLine"),
    }));
  }
  return actions.sort((left, right) => compareText(String(left.id ?? ""), String(right.id ?? "")));
}

function buildVoiceTaskFacts(
  computerUseActionFacts: readonly CsgFact[],
  projectRoot: string,
): VoiceTaskFactBuildResult {
  const facts: CsgFact[] = [];
  const diagnostics: string[] = [];
  let templateCount = 0;
  let stepCount = 0;
  let confirmationGateCount = 0;
  let highRiskStepCount = 0;
  let requiredConfirmationGateCount = 0;
  let missingConfirmationGateCount = 0;
  let blockedStepCount = 0;
  let ambiguousStepCount = 0;
  let readyCount = 0;
  const requireReady = isUnimakerReactProject(projectRoot);
  if (!requireReady) {
    return {
      facts,
      diagnostics,
      templateCount,
      stepCount,
      confirmationGateCount,
      highRiskStepCount,
      requiredConfirmationGateCount,
      missingConfirmationGateCount,
      blockedStepCount,
      ambiguousStepCount,
      unimakerInternalTaskReady: false,
    };
  }

  for (const spec of unimakerVoiceTaskTemplateSpecs) {
    const resolvedSteps: CsgFact[] = [];
    const stepIds: string[] = [];
    const specDiagnostics: string[] = [];
    let resolvedStepCount = 0;
    let resolvedConfirmationGateCount = 0;
    for (let index = 0; index < spec.steps.length; index += 1) {
      const step = spec.steps[index];
      if (!step) continue;
      const matches = findComputerUseActionsForStep(computerUseActionFacts, step);
      if (matches.length !== 1) {
        blockedStepCount += 1;
        if (matches.length > 1) ambiguousStepCount += 1;
        const target = `${step.targetActionKind}:${step.targetRole}:${step.targetLabel}`;
        specDiagnostics.push(
          `voice task ${spec.templateId} step ${index + 1} must resolve exactly one computer-use action, got ${matches.length}: ${target}`,
        );
        continue;
      }
      const highRiskRequiresGate = isHighRiskEffectClass(step.effectClass) && voiceTaskSpecRequiresHighRiskConfirmation(spec);
      if (highRiskRequiresGate && !step.confirmationRequired) {
        highRiskStepCount += 1;
        missingConfirmationGateCount += 1;
        blockedStepCount += 1;
        specDiagnostics.push(
          `voice task ${spec.templateId} step ${index + 1} requires confirmation for ${step.effectClass}`,
        );
        continue;
      }
      const action = matches[0];
      if (!action) continue;
      const actionEffectClass = stringField(action, "effectClass");
      if (actionEffectClass !== step.effectClass) {
        blockedStepCount += 1;
        specDiagnostics.push(
          `voice task ${spec.templateId} step ${index + 1} effect class mismatch: step=${step.effectClass} action=${actionEffectClass}`,
        );
        continue;
      }
      if (isHighRiskEffectClass(step.effectClass)) {
        highRiskStepCount += 1;
        if (highRiskRequiresGate && !step.confirmationRequired) missingConfirmationGateCount += 1;
      }
      if (step.confirmationRequired) requiredConfirmationGateCount += 1;
      const id = stableId("csg.web.voice_task_step", spec.templateId, String(index + 1), stringField(action, "id"));
      const confirmationGateId = step.confirmationRequired
        ? stableId("csg.web.confirmation_gate", spec.templateId, String(index + 1), stringField(action, "id"))
        : "";
      stepIds.push(id);
      if (step.confirmationRequired) resolvedConfirmationGateCount += 1;
      resolvedSteps.push(webFact({
        kind: "csg.web.voice_task_step",
        id,
        templateId: spec.templateId,
        stepIndex: index + 1,
        computerUseAction: stringField(action, "id"),
        semanticId: stringField(action, "semanticId"),
        targetActionKind: step.targetActionKind,
        targetRole: step.targetRole,
        targetLabel: step.targetLabel,
        targetSourceFile: step.targetSourceFile ?? "",
        payloadBinding: step.payloadBinding,
        effectClass: step.effectClass,
        confirmationRequired: step.confirmationRequired,
        confirmationGateId,
        confirmationMode: step.confirmationRequired ? "explicit-user-confirmation" : "",
        blockedUntilConfirmed: step.confirmationRequired,
        guard: stringField(action, "guard"),
        trace: stringField(action, "trace"),
      }));
      resolvedStepCount += 1;
      if (step.confirmationRequired) {
        resolvedSteps.push(webFact({
          kind: "csg.web.confirmation_gate",
          id: confirmationGateId,
          voiceTaskStep: id,
          templateId: spec.templateId,
          computerUseAction: stringField(action, "id"),
          semanticId: stringField(action, "semanticId"),
          effectClass: step.effectClass,
          confirmationMode: "explicit-user-confirmation",
          blockedUntilConfirmed: true,
          confirmIntent: "user-confirmed-high-risk-action",
        }));
      }
    }
    if (specDiagnostics.length > 0) {
      if (requireReady) diagnostics.push(...specDiagnostics);
      continue;
    }
    const templateFact = webFact({
      kind: "csg.web.voice_task_template",
      id: stableId("csg.web.voice_task_template", spec.templateId),
      templateId: spec.templateId,
      taskKind: spec.taskKind,
      utterancePatterns: [...spec.utterancePatterns],
      stepIds,
      riskPolicy: spec.riskPolicy,
    });
    facts.push(templateFact, ...resolvedSteps);
    templateCount += 1;
    stepCount += resolvedStepCount;
    confirmationGateCount += resolvedConfirmationGateCount;
    readyCount += 1;
  }

  return {
    facts,
    diagnostics,
    templateCount,
    stepCount,
    confirmationGateCount,
    highRiskStepCount,
    requiredConfirmationGateCount,
    missingConfirmationGateCount,
    blockedStepCount,
    ambiguousStepCount,
    unimakerInternalTaskReady: readyCount === unimakerVoiceTaskTemplateSpecs.length,
  };
}

function collectSubgraphIdentitySources(
  coreFacts: readonly CsgFact[],
  webFacts: readonly CsgFact[],
): CsgWebSubgraphSource[] {
  const sources: CsgWebSubgraphSource[] = [];
  for (const fact of [...coreFacts, ...webFacts]) {
    const sourceKind = fact.kind;
    if (
      sourceKind !== "csg.function" &&
      sourceKind !== "csg.type" &&
      sourceKind !== "csg.runtime_requirement" &&
      sourceKind !== "csg.web.runtime_requirement" &&
      sourceKind !== "csg.web.dom_node_template" &&
      sourceKind !== "csg.web.voice_computer_use_scenario" &&
      sourceKind !== "csg.web.computer_use_action" &&
      sourceKind !== "csg.web.voice_task_template" &&
      sourceKind !== "csg.web.voice_task_step" &&
      sourceKind !== "csg.web.confirmation_gate"
    ) {
      continue;
    }
    const sourceId = stringField(fact, "id");
    if (!sourceId) continue;
    sources.push({ fact, sourceId, sourceKind });
  }
  return sources;
}

function buildSubgraphCidFactsFromIdentities(
  sources: readonly CsgWebSubgraphSource[],
  identities: readonly ChengCsgFactIdentity[],
): CsgFact[] {
  const result: CsgFact[] = [];
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    if (!source) {
      throw new Error(`pure Cheng web subgraph identity ${index + 1} is missing`);
    }
    const identity = identities[index];
    if (!identity) {
      throw new Error(`pure Cheng web subgraph identity ${index + 1} is missing`);
    }
    const cid = identity.subgraphCid;
    result.push(webFact({
      kind: "csg.web.subgraph_cid",
      id: stableId("csg.web.subgraph_cid", source.sourceKind, source.sourceId, cid),
      sourceFact: source.sourceId,
      sourceKind: source.sourceKind,
      cid,
      target: stringField(source.fact, "target") ||
        stringField(source.fact, "name") ||
        stringField(source.fact, "tagName") ||
        stringField(source.fact, "templateId") ||
        stringField(source.fact, "label"),
    }));
  }
  return result.sort((left, right) => compareText(String(left.id ?? ""), String(right.id ?? "")));
}

// ---------------------------------------------------------------------------
// Surface owner, truth ref, pixel region — reverse-engineering attribution facts
// ---------------------------------------------------------------------------

function buildSurfaceOwnerFacts(webFacts: readonly CsgFact[], coreFacts: readonly CsgFact[], projectRoot: string): CsgFact[] {
  // Build function ID → { file, name } map from core facts (owner field in DOM templates = function ID)
  const funcById = new Map<string, { file: string; name: string }>();
  for (const fact of coreFacts) {
    if (fact.kind === "csg.function" && fact.id && fact.loc && fact.loc.file) {
      funcById.set(String(fact.id), { file: String(fact.loc.file), name: fact.name ? String(fact.name) : "" });
    }
  }

  const ownerStats = new Map<string, { templates: number; jsxElements: number; components: Set<string>; classes: Set<string> }>();
  for (const fact of webFacts) {
    if (fact.kind === "csg.web.dom_node_template") {
      const owner = stringField(fact, "owner");
      if (!owner) continue;
      const func = funcById.get(owner);
      const ownerFile = func?.file ?? owner;
      let entry = ownerStats.get(ownerFile);
      if (!entry) { entry = { templates: 0, jsxElements: 0, components: new Set(), classes: new Set() }; ownerStats.set(ownerFile, entry); }
      entry.templates++;
      const comp = func?.name ?? stringField(fact, "component");
      if (comp) entry.components.add(comp);
      const cls = stringField(fact, "className");
      if (cls) entry.classes.add(cls);
    }
    if (fact.kind === "csg.web.jsx_element") {
      const owner = stringField(fact, "owner");
      if (!owner) continue;
      const func = funcById.get(owner);
      const ownerFile = func?.file ?? owner;
      let entry = ownerStats.get(ownerFile);
      if (!entry) { entry = { templates: 0, jsxElements: 0, components: new Set(), classes: new Set() }; ownerStats.set(ownerFile, entry); }
      entry.jsxElements++;
    }
  }

  const facts: CsgFact[] = [];
  let idCounter = 0;
  const seenSurfaces = new Set<string>();

  for (const [ownerFile, stats] of ownerStats) {
    const surface = surfaceFromFile(ownerFile, projectRoot);
    seenSurfaces.add(surface);
    const isKey = isKeyOwnerFile(ownerFile, stats);
    const primaryComponent = [...stats.components][0];
    const primaryClass = [...stats.classes][0];

    facts.push(webFact({
      kind: "csg.web.surface_owner",
      id: stableId("csg.web.surface_owner", surface, ownerFile, String(idCounter)),
      surface,
      ownerFile,
      ...(primaryComponent ? { component: primaryComponent } : {}),
      ...(primaryClass ? { className: primaryClass } : {}),
      isKey,
    }));
    idCounter++;
  }

  // Ensure known surfaces exist even if no owner files matched the heuristic
  for (const fact of webFacts) {
    if (fact.kind === "csg.web.dom_node_template") {
      const tagName = stringField(fact, "tagName");
      if (tagName === "div" || tagName === "main" || tagName === "section") {
        const domId = stringField(fact, "id");
        if (domId && (domId.includes("home") || domId.includes("thread") || domId.includes("settings"))) {
          const surface = surfaceFromFile(domId, projectRoot);
          if (!seenSurfaces.has(surface)) {
            seenSurfaces.add(surface);
            facts.push(webFact({
              kind: "csg.web.surface_owner",
              id: stableId("csg.web.surface_owner", surface, domId),
              surface,
              ownerFile: projectRoot,
              isKey: true,
            }));
          }
        }
      }
    }
  }

  return facts.sort((left, right) => compareText(String(left.surface ?? ""), String(right.surface ?? "")) || compareText(String(left.ownerFile ?? ""), String(right.ownerFile ?? "")));
}

function surfaceFromFile(filePath: string, _projectRoot: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  // Thread surfaces
  if (/\/thread[-_]official[-_]layout\./i.test(normalized) || /\/thread[-_]detail/i.test(normalized)) return "main-thread-detail";
  if (/\/thread[-_]sidebar/i.test(normalized)) return "main-thread-detail";
  if (/\/thread[-_]overlay/i.test(normalized)) return "thread-overlay";
  if (/\/thread/i.test(normalized) && !/thread[-_]markdown/i.test(normalized)) return "main-thread-detail";
  // Home surfaces
  if (/\/home[-_]surface/i.test(normalized) || /\/home[-_]official/i.test(normalized)) return "main-home";
  if (/\/home[-_]/i.test(normalized)) return "main-home";
  // Settings surfaces
  if (/\/settings[-_]general/i.test(normalized)) return "settings-general";
  if (/\/settings[-_]appearance/i.test(normalized)) return "settings-appearance";
  if (/\/settings[-_]configuration/i.test(normalized)) return "settings-configuration";
  if (/\/settings[-_]personalization/i.test(normalized)) return "settings-personalization";
  if (/\/settings[-_]usage/i.test(normalized)) return "settings-usage";
  if (/\/settings[-_]mcp/i.test(normalized)) return "settings-mcp-servers";
  if (/\/settings[-_]git/i.test(normalized)) return "settings-git";
  if (/\/settings[-_]environments/i.test(normalized)) return "settings-environments";
  if (/\/settings[-_]worktrees/i.test(normalized)) return "settings-worktrees";
  if (/\/settings[-_]archived/i.test(normalized)) return "settings-archived-threads";
  if (/\/settings/i.test(normalized)) return "settings-general";
  // Composer / overlays
  if (/\/composer/i.test(normalized)) return "main-home";
  if (/\/sidebar/i.test(normalized)) return "main-home";
  if (/\/hotkey/i.test(normalized)) return "hotkey-window";
  // Plugins / automations / mobile (home sub-pages)
  if (/\/plugins/i.test(normalized)) return "plugins";
  if (/\/automations/i.test(normalized)) return "automations";
  if (/\/codex[-_]mobile/i.test(normalized)) return "codex-mobile";
  // Fallback: check directory structure first, then basename hints
  const parts = normalized.split("/");
  const dirPath = parts.slice(0, -1).map((p) => p.toLowerCase());
  const basename = (parts[parts.length - 1] ?? "").toLowerCase();
  if (dirPath.some((d) => d.includes("thread") || d === "scenes")) return "main-thread-detail";
  if (dirPath.some((d) => d.includes("settings"))) return "settings-general";
  if (dirPath.some((d) => d.includes("home"))) return "main-home";
  if (dirPath.some((d) => d.includes("composer"))) return "main-home";
  if (basename.includes("thread")) return "main-thread-detail";
  if (basename.includes("settings")) return "settings-general";
  return "main-home";
}

function isKeyOwnerFile(ownerFile: string, stats: { templates: number; jsxElements: number }): boolean {
  const normalized = ownerFile.replace(/\\/g, "/");
  // Contract/layout files are always key
  if (/-contract\./i.test(normalized)) return true;
  if (/-official-layout\./i.test(normalized)) return true;
  if (/-official-/.test(normalized)) return true;
  // High template count files are key
  if (stats.templates >= 5) return true;
  // Files with "surface" or "layout" or "shell" in the name
  if (/surface|layout|shell/i.test(normalized)) return true;
  return false;
}

function buildTruthRefFacts(surfaceOwnerFacts: readonly CsgFact[]): CsgFact[] {
  const surfaces = new Set<string>();
  for (const fact of surfaceOwnerFacts) {
    const surface = stringField(fact, "surface");
    if (surface) surfaces.add(surface);
  }

  const facts: CsgFact[] = [];
  let idCounter = 0;

  for (const surface of surfaces) {
    const baseDir = `ground-truth/${surface}`;
    // Find a key owner for this surface to link
    const keyOwner = surfaceOwnerFacts.find((f) =>
      stringField(f, "surface") === surface && f.isKey === true
    ) ?? surfaceOwnerFacts.find((f) =>
      stringField(f, "surface") === surface
    );

    const ownerId = keyOwner ? stringField(keyOwner, "id") : undefined;

    facts.push(webFact({
      kind: "csg.web.truth_ref",
      id: stableId("csg.web.truth_ref", surface, String(idCounter)),
      surface,
      nodeRef: `${baseDir}/dom.json`,
      geometryRef: `${baseDir}/geometry.json`,
      cssRef: `${baseDir}/css.json`,
      screenshotRef: `${baseDir}/screenshot.png`,
      ...(ownerId ? { ownerFact: ownerId } : {}),
    }));
    idCounter++;
  }

  return facts.sort((left, right) => compareText(String(left.surface ?? ""), String(right.surface ?? "")));
}

function buildPixelRegionFacts(
  surfaceOwnerFacts: readonly CsgFact[],
  truthRefFacts: readonly CsgFact[],
): CsgFact[] {
  const facts: CsgFact[] = [];
  let idCounter = 0;

  for (const surfaceOwner of surfaceOwnerFacts) {
    const surface = stringField(surfaceOwner, "surface");
    if (!surface) continue;
    const ownerId = stringField(surfaceOwner, "id");
    if (!ownerId) continue;

    const truthRef = truthRefFacts.find((f) => stringField(f, "surface") === surface);
    const truthRefId = truthRef ? stringField(truthRef, "id") : undefined;

    const regions = KNOWN_PIXEL_REGIONS[surface];
    if (!regions || regions.length === 0) continue;

    for (const region of regions) {
      facts.push(webFact({
        kind: "csg.web.pixel_region",
        id: stableId("csg.web.pixel_region", surface, region.name, String(idCounter)),
        surface,
        region: region.name,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        ownerFact: ownerId,
        ...(truthRefId ? { truthRef: truthRefId } : {}),
      }));
      idCounter++;
    }
  }

  return facts.sort((left, right) => compareText(String(left.surface ?? ""), String(right.surface ?? "")) || compareText(String(left.region ?? ""), String(right.region ?? "")));
}

interface NormalizedRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const KNOWN_PIXEL_REGIONS: Record<string, NormalizedRegion[]> = {
  "main-home": [
    { name: "sidebar", x: 0, y: 0, width: 0.2573, height: 1 },
    { name: "content", x: 0.2573, y: 0, width: 0.7427, height: 1 },
    { name: "modal", x: 0.3106, y: 0.2657, width: 0.3792, height: 0.4692 },
    { name: "modal-image", x: 0.3106, y: 0.2657, width: 0.3792, height: 0.2192 },
    { name: "modal-body", x: 0.3315, y: 0.4848, width: 0.3315, height: 0.25 },
    { name: "composer", x: 0.6709, y: 0.4242, width: 0.2565, height: 0.1162 },
    { name: "sidebar-top-nav", x: 0, y: 0, width: 0.2573, height: 0.2121 },
    { name: "sidebar-pinned", x: 0, y: 0.2121, width: 0.2573, height: 0.4091 },
    { name: "sidebar-projects", x: 0, y: 0.6212, width: 0.2573, height: 0.3788 },
  ],
  "main-thread-detail": [
    { name: "mainUpper", x: 0.1302, y: 0.0455, width: 0.8698, height: 0.3131 },
    { name: "userBubble", x: 0.4499, y: 0.0758, width: 0.4736, height: 0.1061 },
    { name: "bottomEmpty", x: 0.1302, y: 0.904, width: 0.8698, height: 0.096 },
    { name: "leftSidebarAll", x: 0, y: 0, width: 0.1302, height: 1 },
    { name: "sidebarPinned", x: 0, y: 0.1465, width: 0.1302, height: 0.1667 },
    { name: "composer", x: 0.1302, y: 0.7879, width: 0.8698, height: 0.1162 },
    { name: "topbar", x: 0.1302, y: 0, width: 0.8698, height: 0.0455 },
    { name: "modal", x: 0.2762, y: 0.2626, width: 0.3867, height: 0.4798 },
    { name: "sidebarTop", x: 0, y: 0, width: 0.1302, height: 0.1465 },
    { name: "sidebarProjectsChats", x: 0, y: 0.3131, width: 0.1302, height: 0.4444 },
  ],
};

function controlRole(fact: CsgFact, tagName: string): string {
  return controlRoleFromProps(tagName, Array.isArray(fact.props) ? fact.props : []);
}

function controlRoleFromProps(tagName: string, props: readonly unknown[]): string {
  if (tagName === "input" && propStringFromProps(props, "type") === "file") return "file-input";
  if (tagName === "input" && propStringFromProps(props, "type") === "checkbox") return "checkbox";
  if (tagName === "input" && propStringFromProps(props, "type") === "number") return "spinbutton";
  if (tagName === "button") return "button";
  if (tagName === "a") return "link";
  if (tagName === "input" || tagName === "textarea") return "textbox";
  if (tagName === "select") return "listbox";
  if (tagName === "option") return "option";
  if (controlScrollHandlerFromProps(props)) return "scroll-region";
  return "";
}

function controlActionKind(fact: CsgFact, tagName: string): string {
  return controlActionKindFromProps(tagName, Array.isArray(fact.props) ? fact.props : []);
}

function controlRouteTarget(fact: CsgFact, tagName: string): string {
  return controlRouteTargetFromProps(tagName, Array.isArray(fact.props) ? fact.props : []);
}

function controlActionKindFromProps(tagName: string, props: readonly unknown[]): string {
  if (tagName === "input" && propStringFromProps(props, "type") === "file") return "SelectFile";
  if (tagName === "input" && propStringFromProps(props, "type") === "checkbox") return "Toggle";
  if (tagName === "input" && propStringFromProps(props, "type") === "number") return "SetNumber";
  if (tagName === "input" || tagName === "textarea") return "SetText";
  if (tagName === "select" || tagName === "option") return "Select";
  if (controlRouteTargetFromProps(tagName, props)) return "Route";
  if (controlScrollHandlerFromProps(props)) return "Scroll";
  if (tagName === "button" || tagName === "a") return "Click";
  return "";
}

function controlScrollHandlerFromProps(props: readonly unknown[]): string {
  return propExpressionOrStringFromProps(props, "onScroll");
}

function controlRouteTargetFromProps(tagName: string, props: readonly unknown[]): string {
  if (tagName === "a") {
    const href = propStringFromProps(props, "href");
    if (href) return href;
  }
  const handler = propExpressionOrStringFromProps(props, "onClick");
  if (!handler) return "";
  const tabMatch = handler.match(/\bsetCurrentTab\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)/);
  if (tabMatch && tabMatch[1]) return tabMatch[1];
  const navigateMatch = handler.match(/\bnavigate\(\s*['"]([^'"]+)['"]\s*\)/);
  if (navigateMatch && navigateMatch[1]) return navigateMatch[1];
  const onNavigateMatch = handler.match(/\bonNavigate\??\.\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)/);
  if (onNavigateMatch && onNavigateMatch[1]) return onNavigateMatch[1];
  return "";
}

function propExpressionOrStringFromProps(props: readonly unknown[], name: string): string {
  for (const prop of props) {
    if (!prop || typeof prop !== "object") continue;
    const item = prop as Record<string, unknown>;
    if (item.name !== name) continue;
    if (typeof item.value === "string") return normalizeLabelText(item.value);
    if (typeof item.expression === "string") return normalizeLabelText(item.expression);
  }
  return "";
}

function controlPayloadSchema(actionKind: string): string {
  if (actionKind === "SelectFile") return "file[]";
  if (actionKind === "SetText") return "string";
  if (actionKind === "SetNumber") return "number";
  if (actionKind === "Select") return "string";
  if (actionKind === "Toggle") return "boolean";
  if (actionKind === "Route") return "route-id";
  if (actionKind === "Scroll") return "number";
  return "unit";
}

function controlEffect(actionKind: string): string {
  if (actionKind === "SelectFile") return "dispatch-file-input-event";
  if (actionKind === "SetText") return "dispatch-input-event";
  if (actionKind === "SetNumber") return "dispatch-input-event";
  if (actionKind === "Select") return "dispatch-change-event";
  if (actionKind === "Toggle") return "dispatch-change-event";
  if (actionKind === "Route") return "dispatch-route-navigation";
  if (actionKind === "Scroll") return "dispatch-scroll-event";
  return "dispatch-click-event";
}

function voiceScenarioKind(actionKind: string): string {
  if (actionKind === "SelectFile") return "voice-file-selection";
  if (actionKind === "SetText") return "voice-dictation";
  if (actionKind === "SetNumber") return "voice-number-input";
  if (actionKind === "Select") return "voice-selection";
  if (actionKind === "Toggle") return "voice-toggle";
  if (actionKind === "Route") return "voice-navigation";
  if (actionKind === "Scroll") return "voice-scroll";
  return "voice-command";
}

function voiceUtteranceTemplate(actionKind: string, label: string): string {
  const target = label.length > 0 ? label : "control";
  if (actionKind === "SelectFile") return `choose <file> for ${target}`;
  if (actionKind === "SetText") return `type <text> into ${target}`;
  if (actionKind === "SetNumber") return `set <number> for ${target}`;
  if (actionKind === "Select") return `choose <option> in ${target}`;
  if (actionKind === "Toggle") return `toggle ${target}`;
  if (actionKind === "Route") return `navigate to ${target}`;
  if (actionKind === "Scroll") return `scroll ${target}`;
  return `activate ${target}`;
}

function controlLabel(fact: CsgFact, tagName: string, domTemplateIndex: DomTemplateIndex): string {
  if (tagName === "input" && propString(fact, "type") === "file") {
    const ref = propExpressionOrString(fact, "ref");
    if (ref) return `ref:${ref}`;
  }
  const props = Array.isArray(fact.props) ? fact.props : [];
  if (controlScrollHandlerFromProps(props)) {
    const ref = propExpressionOrString(fact, "ref");
    if (ref) return `ref:${ref}`;
  }
  const computerUseId = propExpressionOrString(fact, "data-computer-use-id");
  if (computerUseId) return computerUseId;
  const labelProps = new Set(["aria-label", "aria-labelledby", "title", "placeholder", "alt", "name"]);
  for (const prop of props) {
    if (!prop || typeof prop !== "object") continue;
    const item = prop as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name : "";
    if (!labelProps.has(name)) continue;
    if (typeof item.value === "string") {
      const value = normalizeLabelText(item.value);
      if (value) return value;
    }
    if (typeof item.expression === "string") {
      const expression = normalizeLabelText(item.expression);
      if (expression) return `expr:${expression}`;
    }
  }
  const childText = controlChildLabel(fact, domTemplateIndex, new Set<string>());
  if (childText) return childText;
  const value = propExpressionOrString(fact, "value");
  if (value) return `value:${value}`;
  const checked = propExpressionOrString(fact, "checked");
  if (checked) return `checked:${checked}`;
  const slot = propExpressionOrString(fact, "data-slot");
  if (slot) return `data-slot:${slot}`;
  const cardId = propExpressionOrString(fact, "data-ddz-card-id");
  if (cardId) return `data-ddz-card-id:${cardId}`;
  const stateToggle = controlStateToggleLabel(fact);
  if (stateToggle) return stateToggle;
  return "";
}

function controlChildLabel(fact: CsgFact, domTemplateIndex: DomTemplateIndex, seenCoreFacts: Set<string>): string {
  const textParts: string[] = [];
  const componentParts: string[] = [];
  collectControlChildLabels(fact, domTemplateIndex, seenCoreFacts, textParts, componentParts);
  const parts = textParts.length > 0 ? textParts : componentParts;
  return parts.join(" ").trim();
}

function collectControlChildLabels(
  fact: CsgFact,
  domTemplateIndex: DomTemplateIndex,
  seenCoreFacts: Set<string>,
  textParts: string[],
  componentParts: string[],
): void {
  const coreFact = stringField(fact, "coreFact");
  if (coreFact) {
    if (seenCoreFacts.has(coreFact)) return;
    seenCoreFacts.add(coreFact);
  }
  const children = Array.isArray(fact.children) ? fact.children : [];
  for (const child of children) {
    if (!child || typeof child !== "object") continue;
    const item = child as Record<string, unknown>;
    if (item.kind === "text" && typeof item.text === "string") {
      const text = normalizeLabelText(item.text);
      if (text) textParts.push(text);
      continue;
    }
    if (item.kind === "expression" && typeof item.expression === "string") {
      const expression = normalizeLabelText(item.expression);
      if (expression) textParts.push(`expr:${expression}`);
      continue;
    }
    if (item.kind === "jsx_ref" && typeof item.coreFact === "string") {
      const childFact = domTemplateIndex.byCoreFact.get(item.coreFact);
      if (!childFact) continue;
      const textCount = textParts.length;
      const componentCount = componentParts.length;
      collectControlChildLabels(childFact, domTemplateIndex, seenCoreFacts, textParts, componentParts);
      if (textParts.length !== textCount || componentParts.length !== componentCount) continue;
      const componentLabel = controlComponentLabel(childFact);
      if (componentLabel) componentParts.push(componentLabel);
    }
  }
}

function controlComponentLabel(fact: CsgFact): string {
  if (stringField(fact, "domain") !== "react-component") return "";
  const tagName = stringField(fact, "tagName");
  if (!tagName || intrinsicHtmlTags.has(tagName.toLowerCase())) return "";
  return `component:${splitIdentifierLabel(tagName)}`;
}

function controlStateToggleLabel(fact: CsgFact): string {
  const handler = propExpressionOrString(fact, "onClick");
  const directToggle = handler.match(/\bset([A-Z][A-Za-z0-9_]*)\s*\(\s*!\s*([A-Za-z_$][\w$]*)\s*\)/);
  if (directToggle && directToggle[1] && directToggle[2]) {
    return `state-toggle:${lowerFirstAscii(directToggle[1])}`;
  }
  const objectToggle = handler.match(/\bset([A-Z][A-Za-z0-9_]*)\s*\(\s*\{[\s\S]*?\b([A-Za-z_$][\w$]*)\s*:\s*!\s*([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)[\s\S]*?\}\s*\)/);
  if (objectToggle && objectToggle[1] && objectToggle[2] && objectToggle[3]) {
    return `state-toggle:${objectToggle[3]}`;
  }
  return "";
}

function normalizeLabelText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitIdentifierLabel(text: string): string {
  return normalizeLabelText(text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase());
}

function lowerFirstAscii(text: string): string {
  if (!text) return "";
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function propString(fact: CsgFact, name: string): string {
  return propStringFromProps(Array.isArray(fact.props) ? fact.props : [], name);
}

function propStringFromProps(props: readonly unknown[], name: string): string {
  for (const prop of props) {
    if (!prop || typeof prop !== "object") continue;
    const item = prop as Record<string, unknown>;
    if (item.name !== name) continue;
    if (typeof item.value === "string") return item.value;
  }
  return "";
}

function propExpressionOrString(fact: CsgFact, name: string): string {
  const props = Array.isArray(fact.props) ? fact.props : [];
  for (const prop of props) {
    if (!prop || typeof prop !== "object") continue;
    const item = prop as Record<string, unknown>;
    if (item.name !== name) continue;
    if (typeof item.value === "string") return normalizeLabelText(item.value);
    if (typeof item.expression === "string") return normalizeLabelText(item.expression);
  }
  return "";
}

function locFile(fact: CsgFact): string {
  const loc = fact.loc;
  return loc && typeof loc.file === "string" ? loc.file : "";
}

function locLine(fact: CsgFact): number {
  const loc = fact.loc;
  return loc && typeof loc.line === "number" ? loc.line : 0;
}

function numberField(fact: CsgFact, field: string): number {
  const value = fact[field];
  return typeof value === "number" ? value : 0;
}

function computerUseEffectClass(actionKind: string, label: string): string {
  if (actionKind === "SelectFile") return "file-selection";
  if (actionKind === "SetText") return "text-input";
  if (actionKind === "SetNumber") return "number-input";
  if (actionKind === "Select") return "selection";
  if (actionKind === "Toggle") return "toggle";
  if (actionKind === "Route") return "navigation";
  if (actionKind === "Scroll") return "scroll";
  const text = label.toLowerCase();
  if (text.includes("删除") || text.includes("移除") || text.includes("revoke") || text.includes("killswitch")) {
    return "destructive";
  }
  if (text.includes("购买") || text.includes("支付") || text.includes("pay") || text.includes("checkout")) {
    return "payment";
  }
  if (text.includes("发布") || text.includes("publish") || text.includes("pub_publish")) {
    return "external-publish";
  }
  return "ui-event";
}

function findComputerUseActionsForStep(
  actions: readonly CsgFact[],
  step: VoiceTaskStepSpec,
): CsgFact[] {
  return actions.filter((action) => {
    if (action.kind !== "csg.web.computer_use_action") return false;
    if (stringField(action, "actionKind") !== step.targetActionKind) return false;
    if (stringField(action, "role") !== step.targetRole) return false;
    if (stringField(action, "label") !== step.targetLabel) return false;
    if (step.targetSourceFile && stringField(action, "sourceFile") !== step.targetSourceFile) return false;
    return true;
  });
}

function isHighRiskEffectClass(effectClass: string): boolean {
  return effectClass === "external-publish" || effectClass === "payment" || effectClass === "destructive";
}

function voiceTaskSpecRequiresHighRiskConfirmation(spec: VoiceTaskTemplateSpec): boolean {
  return spec.riskPolicy.startsWith("confirmation-required-for-");
}

function isUnimakerReactProject(projectRoot: string): boolean {
  return projectRoot.endsWith("/UniMaker/React.js") || projectRoot.includes("/UniMaker/React.js/");
}

function domTemplateTagName(fact: CsgFact): string {
  const tagName = stringField(fact, "tagName");
  return tagName.length > 0 ? tagName : "fragment";
}

function domTemplateNodeKind(fact: CsgFact): "element" | "fragment" {
  return domTemplateTagName(fact) === "fragment" ? "fragment" : "element";
}

function domTemplateDomain(fact: CsgFact): "dom-html" | "react-fragment" | "react-component" {
  const tagName = domTemplateTagName(fact);
  if (tagName === "fragment") return "react-fragment";
  if (intrinsicHtmlTags.has(tagName)) return "dom-html";
  return "react-component";
}

function domTemplateProps(fact: CsgFact): unknown[] {
  return Array.isArray(fact.props) ? fact.props : [];
}

function domTemplateChildren(fact: CsgFact): unknown[] {
  return Array.isArray(fact.children) ? fact.children : [];
}

function runtimeDomain(runtime: string, source: string, kind: string, name: string): string {
  if (runtime === "browser") return webSourceDomain(source, kind, name);
  if (runtime === "node" && source === "react_type") return "react-jsx";
  if (runtime === "node") return "node-host";
  if (source === "jsx_runtime" || kind === "jsx") return "react-jsx";
  if (runtime === "js-core") return "ecmascript";
  if (runtime === "external") return "external-package";
  return runtime || "unknown-runtime";
}

function webSourceDomain(source: string, kind: string, name: string): string {
  const text = `${source}:${kind}:${name}`;
  if (text.includes("electronAPI") ||
    text.includes("agentRunning") ||
    text.includes("webContents") ||
    text.includes("dictationState") ||
    text.includes("sidebarHistoryDom")) return "external-host";
  if (text.includes("css")) return "cssom";
  if (text.includes("event")) return "dom-event";
  if (text.includes("fetch") ||
    text.includes("Request") ||
    text.includes("Response") ||
    text.includes("mediaDevices") ||
    text.includes("geolocation") ||
    text.includes("serviceWorker") ||
    text.includes("clipboard") ||
    text.includes("permissions") ||
    text.includes("indexedDB") ||
    text.includes("caches") ||
    text.includes("WebSocket") ||
    text.includes("EventSource") ||
    text.includes("Worker") ||
    text.includes("getUserMedia") ||
    text.includes("getTracks") ||
    text.includes("getAudioTracks") ||
    text.includes("getVideoTracks") ||
    text.includes("createObjectURL") ||
    text.includes("revokeObjectURL") ||
    text.includes("FileReader") ||
    text.includes("Blob") ||
    text.includes("Headers") ||
    text.includes("FormData")) return "web-resource";
  if (text.includes("storage")) return "web-storage";
  return "dom";
}

function requirementKey(item: Pick<CsgCoreRuntimeRequirement | CsgCoreRuntimeClosureGroup, "runtime" | "source" | "kind" | "name">): string {
  return `${item.runtime}\u0000${item.source}\u0000${item.kind}\u0000${item.name}`;
}

function externalKey(item: Pick<CsgCoreExternalSymbol | CsgCoreRuntimeClosureExternal, "runtime" | "source" | "name">): string {
  return `${item.runtime}\u0000${item.source}\u0000${item.name}`;
}

function decisionFromRequirementGroup(group: CsgCoreRuntimeClosureGroup): ProviderDecision {
  return {
    providerStatus: group.providerStatus,
    provider: group.provider,
    candidateProvider: group.candidateProvider,
  };
}

function decisionFromRequirementFact(
  fact: CsgFact,
  runtime: string,
  source: string,
  kind: string,
  name: string,
): ProviderDecision | undefined {
  const decision = runtimeRequirementProviderDecision({
    runtime,
    source,
    kind,
    name,
    proofs: stringArrayField(fact, "proofs"),
  });
  if (!decision.provider && !decision.candidateProvider) return undefined;
  return {
    providerStatus: decision.status,
    provider: decision.provider,
    candidateProvider: decision.candidateProvider,
  };
}

function decisionFromExternalGroup(group: CsgCoreRuntimeClosureExternal): ProviderDecision {
  return {
    providerStatus: group.providerStatus,
    provider: group.provider,
    candidateProvider: group.candidateProvider,
  };
}

function incrementDomain(
  buckets: Map<string, { count: number; closedCount: number; openCount: number; candidateCount: number }>,
  domain: string,
  closed: boolean,
  candidate: boolean,
): void {
  const bucket = buckets.get(domain) ?? { count: 0, closedCount: 0, openCount: 0, candidateCount: 0 };
  bucket.count += 1;
  if (closed) bucket.closedCount += 1;
  else bucket.openCount += 1;
  if (candidate) bucket.candidateCount += 1;
  buckets.set(domain, bucket);
}

function stringField(fact: CsgFact, primary: string, fallback?: string): string {
  const value = fact[primary] ?? (fallback ? fact[fallback] : undefined);
  return typeof value === "string" ? value : "";
}

function stringArrayField(fact: CsgFact, field: string): string[] | undefined {
  const value = fact[field];
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length === value.length ? items : undefined;
}

function webFact(input: Record<string, unknown>): CsgFact {
  const kind = input.kind;
  if (typeof kind !== "string") {
    throw new Error("csg-web fact missing string kind");
  }
  const output: CsgFact = { kind };
  for (const [key, value] of Object.entries(input)) {
    if (key !== "kind" && value !== undefined) output[key] = value;
  }
  return output;
}

function compareById(left: { id: string }, right: { id: string }): number {
  return compareText(left.id, right.id);
}

function compareByDomain(left: CsgWebRuntimeClosureBucket, right: CsgWebRuntimeClosureBucket): number {
  const count = right.count - left.count;
  if (count !== 0) return count;
  return compareText(left.domain, right.domain);
}

function compareExternalCapability(
  left: CsgWebExternalCapabilityManifestItem,
  right: CsgWebExternalCapabilityManifestItem,
): number {
  return compareText(left.domain, right.domain) ||
    compareText(left.candidateProvider, right.candidateProvider) ||
    compareText(left.capabilityKind, right.capabilityKind) ||
    compareText(left.kind ?? "", right.kind ?? "") ||
    compareText(left.name, right.name) ||
    compareText(left.id, right.id);
}

function compareExternalCapabilityBucket(
  left: CsgWebExternalCapabilityManifestBucket,
  right: CsgWebExternalCapabilityManifestBucket,
): number {
  const count = right.count - left.count;
  if (count !== 0) return count;
  return compareText(left.domain, right.domain) ||
    compareText(left.candidateProvider, right.candidateProvider);
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function stableId(...parts: readonly string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 24);
}
