import type { CsgFact } from "./schema.js";

export const CsgControlSurfaceSchema = "csg-control-surface" as const;

export interface ControlNodeFact {
  kind: "csg.web.control_surface";
  id: string;
  role: string;
  label: string;
  bounds?: { x: number; y: number; w: number; h: number };
  stateRef?: string;
}

export interface ControlActionFact {
  kind: "csg.web.control_action";
  id: string;
  actionKind: "Click" | "SetText" | "Select" | "Invoke" | "Focus" | "Scroll";
  payloadSchema: string;
  effect: string;
}

export interface ControlGuardFact {
  kind: "csg.web.control_guard";
  actionId: string;
  predicate: string;
}

export interface ControlTraceFact {
  kind: "csg.web.control_trace";
  actionId: string;
  beforeState: string;
  afterState: string;
}

export type ControlSurfaceFact = ControlNodeFact | ControlActionFact | ControlGuardFact | ControlTraceFact;

export interface ControlSurfaceResult {
  schema: typeof CsgControlSurfaceSchema;
  facts: ControlSurfaceFact[];
  nodeCount: number;
  actionCount: number;
  guardCount: number;
  traceCount: number;
}

export function buildControlSurfaceFacts(_webFacts: readonly CsgFact[]): ControlSurfaceFact[] {
  // Control surface facts are built from CSG-Web DOM facts.
  //
  // Per better-plan.md:
  // - ControlNode: id, role, label, bounds?, stateRef?
  // - ControlAction: id, kind, payloadSchema, effect
  // - ControlGuard: action, predicate
  // - ControlTrace: action, beforeState, afterState
  // - Agent calls typed actions (Click, SetText, Select, Invoke)
  // - Runtime lowers actions to event system, not bypass business logic
  // - Benefits: faster than visual click, preserves permissions/audit/event consistency

  return [];
}

export function countControlSurfaceFacts(facts: ControlSurfaceFact[]): {
  nodeCount: number; actionCount: number; guardCount: number; traceCount: number;
} {
  let nodes = 0, actions = 0, guards = 0, traces = 0;
  for (const f of facts) {
    if (f.kind === "csg.web.control_surface") nodes++;
    else if (f.kind === "csg.web.control_action") actions++;
    else if (f.kind === "csg.web.control_guard") guards++;
    else if (f.kind === "csg.web.control_trace") traces++;
  }
  return { nodeCount: nodes, actionCount: actions, guardCount: guards, traceCount: traces };
}
