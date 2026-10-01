import type { CsgFact } from "./schema.js";
export declare const CsgControlSurfaceSchema: "csg-control-surface";
export interface ControlNodeFact {
    kind: "csg.web.control_surface";
    id: string;
    role: string;
    label: string;
    bounds?: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
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
export declare function buildControlSurfaceFacts(_webFacts: readonly CsgFact[]): ControlSurfaceFact[];
export declare function countControlSurfaceFacts(facts: ControlSurfaceFact[]): {
    nodeCount: number;
    actionCount: number;
    guardCount: number;
    traceCount: number;
};
