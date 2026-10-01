export const CsgControlSurfaceSchema = "csg-control-surface";
export function buildControlSurfaceFacts(_webFacts) {
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
export function countControlSurfaceFacts(facts) {
    let nodes = 0, actions = 0, guards = 0, traces = 0;
    for (const f of facts) {
        if (f.kind === "csg.web.control_surface")
            nodes++;
        else if (f.kind === "csg.web.control_action")
            actions++;
        else if (f.kind === "csg.web.control_guard")
            guards++;
        else if (f.kind === "csg.web.control_trace")
            traces++;
    }
    return { nodeCount: nodes, actionCount: actions, guardCount: guards, traceCount: traces };
}
