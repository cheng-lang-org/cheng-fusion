import { createHash } from "node:crypto";

import {
  emitCsgCoreFromTs,
  CsgCoreSchema,
  type CsgCoreExternalSymbol,
  type CsgCoreOptions,
  type CsgCoreReport,
  type CsgCoreRuntimeClosureExternal,
  type CsgCoreRuntimeClosureGroup,
  type CsgCoreRuntimeRequirement,
} from "./csg-core.js";
import { runtimeRequirementProviderDecision } from "./runtime-providers.js";
import type { CsgFact, SourceLoc } from "./schema.js";
import { stableJson } from "./stable-json.js";

export const CsgJsSchema = "csg-js" as const;
export const CsgJsFeatures = ["js-structured-facts", "runtime-closure"] as const;
export const CsgJsReportSchema = "csg-js.report" as const;

export interface CsgJsOptions extends CsgCoreOptions {}

export type CsgJsRuntimeDomain =
  | "ecmascript"
  | "object"
  | "prototype"
  | "promise"
  | "module"
  | "exception"
  | "iterator"
  | "json"
  | "timer"
  | "console"
  | "node"
  | "browser"
  | "external";

export interface CsgJsRuntimeRequirement {
  id: string;
  coreRequirement: string;
  domain: CsgJsRuntimeDomain;
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

export interface CsgJsExternalSymbol {
  id: string;
  coreExternalSymbol: string;
  domain: CsgJsRuntimeDomain;
  name: string;
  runtime: string;
  source: string;
  providerStatus: "closed" | "open";
  provider?: string | undefined;
  candidateProvider?: string | undefined;
}

export interface CsgJsRuntimeClosureBucket {
  id: string;
  domain: CsgJsRuntimeDomain;
  count: number;
  closedCount: number;
  openCount: number;
  candidateCount: number;
}

export interface CsgJsRuntimeClosure {
  schema: "csg-js.runtime-closure";
  features: typeof CsgJsFeatures;
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
  byDomain: CsgJsRuntimeClosureBucket[];
  requirements: CsgJsRuntimeRequirement[];
  externalSymbols: CsgJsExternalSymbol[];
}

export interface CsgJsCounts {
  coreFacts: number;
  jsFacts: number;
  sourceFiles: number;
  modules: number;
  functions: number;
  calls: number;
  classes: number;
  classHeritage: number;
  objectLiterals: number;
  propertyAccesses: number;
  propertyWrites: number;
  elementAccesses: number;
  elementWrites: number;
  moduleImports: number;
  runtimeRequirements: number;
  externalSymbols: number;
  unsupported: number;
}

export interface CsgJsReport {
  schema: typeof CsgJsReportSchema;
  features: typeof CsgJsFeatures;
  complete: false;
  coreComplete: boolean;
  runtimeImplemented: false;
  projectRoot: string;
  projectFile?: string | undefined;
  runtimes: string[];
  entryRoots: string[];
  counts: CsgJsCounts;
  runtimeClosure: CsgJsRuntimeClosure;
  blockedReasons: string[];
  coreReport: CsgCoreReport;
  diagnostics: string[];
}

export interface CsgJsResult {
  facts: CsgFact[];
  diagnostics: string[];
  report: CsgJsReport;
  text: string;
}

export interface CsgJsValidationResult {
  ok: boolean;
  diagnostics: string[];
  facts: CsgFact[];
}

type ProviderDecision = {
  providerStatus: "closed" | "open";
  provider?: string | undefined;
  candidateProvider?: string | undefined;
};

const allowedJsFactKinds = new Set([
  "csg.js.schema",
  "csg.js.project",
  "csg.js.function_ref",
  "csg.js.call_ref",
  "csg.js.class_ref",
  "csg.js.class_heritage_ref",
  "csg.js.array_literal_ref",
  "csg.js.object_literal_ref",
  "csg.js.property_access_ref",
  "csg.js.element_access_ref",
  "csg.js.module_import_ref",
  "csg.js.runtime_requirement",
  "csg.js.external_symbol",
  "csg.js.unsupported_ref",
  "csg.js.jsx_element",
]);

export function emitCsgJsFromTs(options: CsgJsOptions): CsgJsResult {
  const core = emitCsgCoreFromTs(options);
  const requirementDecisionByKey = new Map<string, ProviderDecision>();
  for (const group of core.report.runtimeClosure.requirements) {
    requirementDecisionByKey.set(requirementKey(group), decisionFromRequirementGroup(group));
  }
  const externalDecisionByKey = new Map<string, ProviderDecision>();
  for (const external of core.report.runtimeClosure.externalSymbols) {
    externalDecisionByKey.set(externalKey(external), decisionFromExternalGroup(external));
  }

  const opByLoc = indexOpsByLoc(core.facts);
  const jsFacts: CsgFact[] = [];
  const runtimeRequirements: CsgJsRuntimeRequirement[] = [];
  const externalSymbols: CsgJsExternalSymbol[] = [];
  const schemaFact: CsgFact = {
    kind: "csg.js.schema",
    language: "typescript",
    schema: CsgJsSchema,
    features: CsgJsFeatures,
    extends: CsgCoreSchema,
  };

  jsFacts.push(jsFact({
    kind: "csg.js.project",
    id: stableId("csg.js.project", core.report.projectRoot, core.report.projectFile ?? ""),
    coreSchema: CsgCoreSchema,
    projectRoot: core.report.projectRoot,
    projectFile: core.report.projectFile,
    runtimes: core.report.runtimes,
    entryRoots: core.report.entryRoots,
    runtimeImplemented: false,
    coreFactCount: core.facts.length,
  }));

  for (const fact of core.facts) {
    switch (fact.kind) {
      case "csg.import":
        jsFacts.push(jsFact({
          kind: "csg.js.module_import_ref",
          id: stableId("csg.js.module_import_ref", stringField(fact, "id")),
          coreFact: fact.id,
          loc: fact.loc,
          module: fact.module,
          classification: fact.classification,
          runtime: fact.runtime,
          typeOnly: fact.typeOnly,
          defaultName: fact.defaultName,
          namespaceName: fact.namespaceName,
          named: fact.named,
        }));
        break;
      case "csg.function":
        jsFacts.push(jsFact({
          kind: "csg.js.function_ref",
          id: stableId("csg.js.function_ref", stringField(fact, "id")),
          coreFact: fact.id,
          loc: fact.loc,
          name: fact.name,
          symbol: fact.symbol,
          async: fact.async,
          generator: fact.generator,
          exported: fact.exported,
          typeParameters: fact.typeParameters,
          parameters: fact.parameters,
          returnType: fact.returnType,
        }));
        break;
      case "csg.call": {
        const op = opByLoc.get(locKey(fact.loc));
        jsFacts.push(jsFact({
          kind: "csg.js.call_ref",
          id: stableId("csg.js.call_ref", stringField(fact, "id")),
          coreFact: fact.id,
          op: op?.id,
          loc: fact.loc,
          owner: fact.owner,
          calleeText: fact.calleeText,
          calleeKind: fact.calleeKind,
          target: fact.target,
          receiver: op?.receiver,
          member: op?.memberName,
          argumentCount: fact.argumentCount,
          arguments: op?.arguments,
          returnType: fact.returnType,
        }));
        break;
      }
      case "csg.class":
        jsFacts.push(jsFact({
          kind: "csg.js.class_ref",
          id: stableId("csg.js.class_ref", stringField(fact, "id")),
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
        jsFacts.push(jsFact({
          kind: "csg.js.class_heritage_ref",
          id: stableId("csg.js.class_heritage_ref", stringField(fact, "id")),
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
        jsFacts.push(jsFact({
          kind: "csg.js.jsx_element",
          id: stableId("csg.js.jsx_element", stringField(fact, "id")),
          coreFact: fact.id,
          loc: fact.loc,
          owner: fact.owner,
          tagName: fact.tagName,
          jsxKind: fact.jsxKind,
          attributeCount: fact.attributeCount,
          childCount: fact.childCount,
          props: fact.props,
          children: fact.children,
        }));
        break;
      case "csg.op":
        if (fact.opKind === "object_literal") {
          jsFacts.push(jsFact({
            kind: "csg.js.object_literal_ref",
            id: stableId("csg.js.object_literal_ref", stringField(fact, "id")),
            coreFact: fact.id,
            op: fact.id,
            loc: fact.loc,
            owner: fact.function,
            function: fact.function,
            block: fact.block,
            propertyCount: fact.propertyCount,
            properties: Array.isArray(fact.properties) ? fact.properties : [],
          }));
        } else if (fact.opKind === "array_literal") {
          jsFacts.push(jsFact({
            kind: "csg.js.array_literal_ref",
            id: stableId("csg.js.array_literal_ref", stringField(fact, "id")),
            coreFact: fact.id,
            op: fact.id,
            loc: fact.loc,
            owner: fact.function,
            function: fact.function,
            block: fact.block,
            elementCount: fact.elementCount,
            elements: Array.isArray(fact.elements) ? fact.elements : [],
          }));
        } else if (fact.opKind === "property_read") {
          jsFacts.push(jsFact({
            kind: "csg.js.property_access_ref",
            id: stableId("csg.js.property_access_ref", stringField(fact, "id")),
            coreFact: fact.id,
            op: fact.id,
            loc: fact.loc,
            owner: fact.function,
            function: fact.function,
            block: fact.block,
            accessKind: "read",
            receiver: fact.receiver,
            propertyName: fact.name,
          }));
        } else if (fact.opKind === "property_write") {
          jsFacts.push(jsFact({
            kind: "csg.js.property_access_ref",
            id: stableId("csg.js.property_access_ref", stringField(fact, "id")),
            coreFact: fact.id,
            op: fact.id,
            loc: fact.loc,
            owner: fact.function,
            function: fact.function,
            block: fact.block,
            accessKind: "write",
            receiver: fact.receiver,
            propertyName: fact.name,
            value: fact.value,
          }));
        } else if (fact.opKind === "element_read") {
          jsFacts.push(jsFact({
            kind: "csg.js.element_access_ref",
            id: stableId("csg.js.element_access_ref", stringField(fact, "id")),
            coreFact: fact.id,
            op: fact.id,
            loc: fact.loc,
            owner: fact.function,
            function: fact.function,
            block: fact.block,
            accessKind: "read",
            receiver: fact.receiver,
            argument: fact.argument,
          }));
        } else if (fact.opKind === "element_write") {
          jsFacts.push(jsFact({
            kind: "csg.js.element_access_ref",
            id: stableId("csg.js.element_access_ref", stringField(fact, "id")),
            coreFact: fact.id,
            op: fact.id,
            loc: fact.loc,
            owner: fact.function,
            function: fact.function,
            block: fact.block,
            accessKind: "write",
            receiver: fact.receiver,
            argument: fact.argument,
            value: fact.value,
          }));
        }
        break;
      case "csg.runtime_requirement": {
        const requirement = jsRequirementFromFact(fact, requirementDecisionByKey);
        runtimeRequirements.push(requirement);
        jsFacts.push(jsFact({
          kind: "csg.js.runtime_requirement",
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
        const external = jsExternalFromFact(fact, externalDecisionByKey);
        externalSymbols.push(external);
        jsFacts.push(jsFact({
          kind: "csg.js.external_symbol",
          ...external,
        }));
        break;
      }
      case "csg.unsupported":
        jsFacts.push(jsFact({
          kind: "csg.js.unsupported_ref",
          id: stableId("csg.js.unsupported_ref", stringField(fact, "id")),
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

  const allFacts = [schemaFact, ...core.facts, ...jsFacts];
  const runtimeClosure = buildJsRuntimeClosure(runtimeRequirements, externalSymbols);
  const report: CsgJsReport = {
    schema: CsgJsReportSchema,
    features: CsgJsFeatures,
    complete: false,
    coreComplete: core.report.complete,
    runtimeImplemented: false,
    projectRoot: core.report.projectRoot,
    projectFile: core.report.projectFile,
    runtimes: core.report.runtimes,
    entryRoots: core.report.entryRoots,
    counts: countJsFacts(core.report, core.facts.length, jsFacts, runtimeRequirements, externalSymbols),
    runtimeClosure,
    blockedReasons: buildBlockedReasons(core.report, runtimeClosure),
    coreReport: core.report,
    diagnostics: core.diagnostics,
  };

  return {
    facts: allFacts,
    diagnostics: core.diagnostics,
    report,
    text: allFacts.map((fact) => stableJson(fact, options.pretty)).join("\n") + "\n",
  };
}

export function validateCsgJsText(text: string): CsgJsValidationResult {
  const diagnostics: string[] = [];
  const facts: CsgFact[] = [];
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { ok: false, diagnostics: ["empty csg-js facts"], facts };
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        diagnostics.push(`line ${index + 1}: fact must be a JSON object`);
        continue;
      }
      facts.push(parsed as CsgFact);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(`line ${index + 1}: invalid JSON fact: ${message}`);
    }
  }

  const first = facts[0];
  if (!first || first.kind !== "csg.js.schema" || first.schema !== CsgJsSchema) {
    diagnostics.push("first fact must be csg.js.schema with schema=csg-js");
  }
  if (!facts.some((fact) => fact.kind === "csg.core.schema" && fact.schema === CsgCoreSchema)) {
    diagnostics.push(`csg-js facts must embed ${CsgCoreSchema} schema facts`);
  }
  for (const fact of facts) {
    if (typeof fact.kind !== "string") {
      diagnostics.push("fact kind must be a string");
    } else if (fact.kind.startsWith("csg.js.") && !allowedJsFactKinds.has(fact.kind)) {
      diagnostics.push(`unknown csg-js fact kind: ${fact.kind}`);
    }
  }
  return { ok: diagnostics.length === 0, diagnostics, facts };
}

function jsRequirementFromFact(
  fact: CsgFact,
  decisions: ReadonlyMap<string, ProviderDecision>,
): CsgJsRuntimeRequirement {
  const runtime = stringField(fact, "runtime");
  const source = stringField(fact, "source");
  const kind = stringField(fact, "requirementKind", "kind");
  const name = stringField(fact, "name");
  const decision = decisionFromRequirementFact(fact, runtime, source, kind, name) ??
    decisions.get(requirementKey({ runtime, source, kind, name })) ??
    { providerStatus: "open" as const };
  return {
    id: stableId("csg.js.runtime_requirement", stringField(fact, "id")),
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

function jsExternalFromFact(
  fact: CsgFact,
  decisions: ReadonlyMap<string, ProviderDecision>,
): CsgJsExternalSymbol {
  const runtime = stringField(fact, "runtime");
  const source = stringField(fact, "source");
  const name = stringField(fact, "name");
  const decision = decisions.get(externalKey({ runtime, source, name })) ?? { providerStatus: "open" as const };
  return {
    id: stableId("csg.js.external_symbol", stringField(fact, "id")),
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

function buildJsRuntimeClosure(
  requirements: readonly CsgJsRuntimeRequirement[],
  externalSymbols: readonly CsgJsExternalSymbol[],
): CsgJsRuntimeClosure {
  const byDomain = new Map<CsgJsRuntimeDomain, { count: number; closedCount: number; openCount: number; candidateCount: number }>();
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
      id: stableId("csg.js.runtime_domain", domain),
      domain,
      count: value.count,
      closedCount: value.closedCount,
      openCount: value.openCount,
      candidateCount: value.candidateCount,
    }))
    .sort(compareByDomain);

  return {
    schema: "csg-js.runtime-closure",
    features: CsgJsFeatures,
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

function buildBlockedReasons(coreReport: CsgCoreReport, closure: CsgJsRuntimeClosure): string[] {
  const reasons = ["cheng js runtime is not complete"];
  if (coreReport.diagnostics.length > 0) reasons.push("typescript diagnostics are present");
  if (coreReport.unsupported.length > 0) reasons.push("csg-core contains unsupported semantics");
  if (closure.openRequirementCount > 0) reasons.push("cheng js runtime has open runtime requirements");
  if (closure.openExternalSymbolCount > 0) reasons.push("cheng js runtime has open external symbols");
  return reasons.sort();
}

function countJsFacts(
  coreReport: CsgCoreReport,
  coreFactCount: number,
  jsFacts: readonly CsgFact[],
  requirements: readonly CsgJsRuntimeRequirement[],
  externalSymbols: readonly CsgJsExternalSymbol[],
): CsgJsCounts {
  const counts = new Map<string, number>();
  for (const fact of jsFacts) counts.set(fact.kind, (counts.get(fact.kind) ?? 0) + 1);
  return {
    coreFacts: coreFactCount,
    jsFacts: jsFacts.length,
    sourceFiles: coreReport.counts.sourceFiles,
    modules: coreReport.counts.modules,
    functions: counts.get("csg.js.function_ref") ?? 0,
    calls: counts.get("csg.js.call_ref") ?? 0,
    classes: counts.get("csg.js.class_ref") ?? 0,
    classHeritage: counts.get("csg.js.class_heritage_ref") ?? 0,
    objectLiterals: counts.get("csg.js.object_literal_ref") ?? 0,
    propertyAccesses: counts.get("csg.js.property_access_ref") ?? 0,
    propertyWrites: jsFacts.filter((fact) => fact.kind === "csg.js.property_access_ref" && fact.accessKind === "write").length,
    elementAccesses: counts.get("csg.js.element_access_ref") ?? 0,
    elementWrites: jsFacts.filter((fact) => fact.kind === "csg.js.element_access_ref" && fact.accessKind === "write").length,
    moduleImports: counts.get("csg.js.module_import_ref") ?? 0,
    runtimeRequirements: requirements.length,
    externalSymbols: externalSymbols.length,
    unsupported: coreReport.unsupported.length,
  };
}

function runtimeDomain(runtime: string, source: string, kind: string, name: string): CsgJsRuntimeDomain {
  const text = `${source}:${kind}:${name}`.toLowerCase();
  if (runtime === "node" || source.startsWith("node")) return "node";
  if (runtime === "browser" || source.includes("dom") || source.includes("browser")) return "browser";
  if (runtime === "external" || source.includes("external")) return "external";
  if (text.includes("console")) return "console";
  if (text.includes("timeout") || text.includes("interval") || text.includes("timer")) return "timer";
  if (text.includes("json")) return "json";
  if (text.includes("promise") || text.includes("async") || text.includes("await")) return "promise";
  if (text.includes("module") || text.includes("import") || text.includes("export")) return "module";
  if (text.includes("throw") || text.includes("catch") || text.includes("exception") || text.includes("error")) return "exception";
  if (text.includes("iterator") || text.includes("iterable") || text.includes("spread") || text.includes("for_of") || text.includes("generator")) return "iterator";
  if (text.includes("prototype")) return "prototype";
  if (text.includes("object") || text.includes("array") || text.includes("property") || text.includes("class")) return "object";
  return "ecmascript";
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
  buckets: Map<CsgJsRuntimeDomain, { count: number; closedCount: number; openCount: number; candidateCount: number }>,
  domain: CsgJsRuntimeDomain,
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

function indexOpsByLoc(facts: readonly CsgFact[]): Map<string, CsgFact> {
  const out = new Map<string, CsgFact>();
  for (const fact of facts) {
    if (fact.kind !== "csg.op") continue;
    if (fact.opKind !== "call" && fact.opKind !== "new") continue;
    out.set(locKey(fact.loc), fact);
  }
  return out;
}

function locKey(loc: SourceLoc | undefined): string {
  if (!loc) return "";
  return `${loc.file}:${loc.start}:${loc.end}`;
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

function jsFact(input: Record<string, unknown>): CsgFact {
  const kind = input.kind;
  if (typeof kind !== "string") {
    throw new Error("csg-js fact missing string kind");
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

function compareByDomain(left: CsgJsRuntimeClosureBucket, right: CsgJsRuntimeClosureBucket): number {
  const count = right.count - left.count;
  if (count !== 0) return count;
  return compareText(left.domain, right.domain);
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
