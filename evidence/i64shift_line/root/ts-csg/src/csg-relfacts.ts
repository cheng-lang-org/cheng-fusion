import type { CsgFact } from "./schema.js";
import { CsgRelfactsStandard } from "./csg-standard.js";

export const CsgRelfactsSchema = CsgRelfactsStandard;

export interface CsgRelfact {
  kind: "csg.relfact";
  predicate: string;
  args: string[];
}

export interface RuntimeOpenRequirementTop {
  domain: string;
  kind: string;
  name: string;
  count: number;
}

function rel(predicate: string, ...args: string[]): CsgRelfact {
  return { kind: "csg.relfact", predicate, args };
}

function extractRelfactsFromFacts(facts: readonly CsgFact[]): CsgRelfact[] {
  const rf: CsgRelfact[] = [];
  for (const f of facts) {
    switch (f.kind) {
      case "csg.function":
        if (f.name) rf.push(rel("Function", str(f.id), str(f.module) || str(f.owner) || "", str(f.name)));
        if (f.async) rf.push(rel("AsyncFunction", str(f.id)));
        if (f.generator) rf.push(rel("GeneratorFunction", str(f.id)));
        break;
      case "csg.call":
        if (f.callee && f.owner) rf.push(rel("Calls", str(f.owner), str(f.callee), str(f.id)));
        break;
      case "csg.runtime_requirement":
      case "csg.web.runtime_requirement":
        rf.push(rel("RuntimeRequirement",
          str(f.domain), str(f.requirementKind) || str(f.kind) || "", str(f.name), str(f.providerStatus) || "unknown"));
        break;
      case "csg.external_symbol":
      case "csg.web.external_symbol":
        rf.push(rel("ExternalSymbol", str(f.runtime), str(f.name), str(f.providerStatus) || "unknown"));
        break;
      case "csg.jsx":
      case "csg.web.jsx_element":
        if (f.tagName && f.owner) rf.push(rel("JsxElement", str(f.owner), str(f.tagName), str(f.id)));
        break;
      case "csg.web.dom_node_template":
        if (f.tagName && f.owner) rf.push(rel("DomNodeTemplate", str(f.owner), str(f.tagName), str(f.id)));
        break;
      case "csg.web.control_surface":
        rf.push(rel(
          "ControlSurface",
          str(f.id),
          str(f.nodeTemplate),
          str(f.actionKind),
          str(f.role),
          str(f.label),
          str(f.guard),
          str(f.trace),
        ));
        break;
      case "csg.web.voice_computer_use_scenario":
        rf.push(rel(
          "VoiceComputerUseScenario",
          str(f.id),
          str(f.controlSurface),
          str(f.scenarioKind),
          str(f.actionKind),
          str(f.computerUseMode),
          str(f.eventEffect),
        ));
        break;
      case "csg.web.computer_use_action":
        rf.push(rel(
          "ComputerUseAction",
          str(f.id),
          str(f.controlSurface),
          str(f.semanticId),
          str(f.actionKind),
          str(f.role),
          str(f.label),
          str(f.effectClass),
          str(f.guard),
          str(f.trace),
        ));
        break;
      case "csg.web.voice_task_template":
        rf.push(rel(
          "VoiceTaskTemplate",
          str(f.id),
          str(f.templateId),
          str(f.taskKind),
          strArray(f.utterancePatterns),
          strArray(f.stepIds),
          str(f.riskPolicy),
        ));
        break;
      case "csg.web.voice_task_step":
        rf.push(rel(
          "VoiceTaskStep",
          str(f.id),
          str(f.templateId),
          String(typeof f.stepIndex === "number" ? f.stepIndex : 0),
          str(f.computerUseAction),
          str(f.semanticId),
          str(f.targetActionKind),
          str(f.targetRole),
          str(f.targetLabel),
          str(f.payloadBinding),
          str(f.effectClass),
          boolStr(f.confirmationRequired),
          str(f.confirmationGateId),
          str(f.confirmationMode),
          boolStr(f.blockedUntilConfirmed),
        ));
        break;
      case "csg.web.confirmation_gate":
        rf.push(rel(
          "ConfirmationGate",
          str(f.id),
          str(f.voiceTaskStep),
          str(f.templateId),
          str(f.computerUseAction),
          str(f.semanticId),
          str(f.effectClass),
          str(f.confirmationMode),
          boolStr(f.blockedUntilConfirmed),
          str(f.confirmIntent),
        ));
        break;
      case "csg.class":
        if (f.name) rf.push(rel("Class", str(f.id), str(f.module) || "", str(f.name)));
        break;
      case "csg.import":
        if (f.specifier) rf.push(rel("ModuleImport", str(f.module) || "", str(f.specifier)));
        break;
      case "csg.export":
        if (f.name) rf.push(rel("ModuleExport", str(f.module) || "", str(f.name)));
        break;
    }
  }
  return rf;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strArray(v: unknown): string {
  if (!Array.isArray(v)) return "";
  return v.filter((item) => typeof item === "string").join("|");
}

function boolStr(v: unknown): string {
  return v === true ? "true" : "false";
}

export function buildRelationFactsFromFacts(facts: readonly CsgFact[]): CsgRelfact[] {
  return extractRelfactsFromFacts(facts);
}

export function countRelationFactsFromFacts(facts: readonly CsgFact[]): number {
  let count = 0;
  for (const f of facts) {
    switch (f.kind) {
      case "csg.function":
        if (f.name) count += 1;
        if (f.async) count += 1;
        if (f.generator) count += 1;
        break;
      case "csg.call":
        if (f.callee && f.owner) count += 1;
        break;
      case "csg.runtime_requirement":
      case "csg.web.runtime_requirement":
      case "csg.external_symbol":
      case "csg.web.external_symbol":
        count += 1;
        break;
      case "csg.jsx":
      case "csg.web.jsx_element":
        if (f.tagName && f.owner) count += 1;
        break;
      case "csg.web.dom_node_template":
        if (f.tagName && f.owner) count += 1;
        break;
      case "csg.web.control_surface":
      case "csg.web.voice_computer_use_scenario":
      case "csg.web.computer_use_action":
      case "csg.web.voice_task_template":
      case "csg.web.voice_task_step":
      case "csg.web.confirmation_gate":
        count += 1;
        break;
      case "csg.class":
        if (f.name) count += 1;
        break;
      case "csg.import":
        if (f.specifier) count += 1;
        break;
      case "csg.export":
        if (f.name) count += 1;
        break;
    }
  }
  return count;
}

export function runtimeOpenRequirementTop(allFacts: readonly CsgFact[], limit = 10): RuntimeOpenRequirementTop[] {
  const counts = new Map<string, RuntimeOpenRequirementTop>();
  for (const f of allFacts) {
    if (f.kind !== "csg.runtime_requirement" && f.kind !== "csg.web.runtime_requirement") continue;
    if (f.providerStatus !== "open") continue;
    const d = str(f.domain);
    const k = str(f.requirementKind) || str(f.kind) || "";
    const n = str(f.name);
    const key = `${d}:${k}:${n}`;
    const e = counts.get(key);
    if (e) e.count++;
    else counts.set(key, { domain: d, kind: k, name: n, count: 1 });
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
