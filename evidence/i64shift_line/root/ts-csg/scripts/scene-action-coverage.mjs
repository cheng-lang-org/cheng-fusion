const allowedActionKinds = new Set([
  "command",
  "media_lifecycle",
  "route",
  "state_delta",
  "stop_propagation",
  "style_mutation",
]);

export function summarizeSceneActionCoverage(sceneFacts = []) {
  const routesById = new Set();
  const routeIdByIndex = new Map();
  const nodes = new Set();
  const nodeByKey = new Map();
  const parentByNode = new Map();
  const eventHandlerNodes = new Set();
  const actionKindCounts = {};
  const effectPrefixCounts = {};
  const unknownActionKinds = {};
  let eventHandlerCount = 0;
  let hitTargetCount = 0;
  let routeHitTargetCount = 0;
  let nativeControlHitTargetCount = 0;
  let emptyActionKindCount = 0;
  let emptyEffectCount = 0;
  let invokeSegmentCount = 0;
  let invalidHitTargetNodeRefCount = 0;
  let invalidHitTargetRouteRefCount = 0;
  let eventHitTargetWithoutHandlerNodeCount = 0;
  let eventHitTargetWithoutHandlerAncestorCount = 0;
  const eventHitTargetsWithoutHandlerAncestor = [];

  for (const fact of sceneFacts) {
    if (fact?.kind === "csg.web.scene.route") {
      const routeId = String(fact.routeId ?? "");
      if (routeId.length > 0) routesById.add(routeId);
      const routeIndex = Number(fact.routeIndex ?? -1);
      if (routeId.length > 0) routeIdByIndex.set(routeIndex, routeId);
    } else if (fact?.kind === "csg.web.scene.node") {
      const key = sceneNodeKey(fact);
      nodes.add(key);
      nodeByKey.set(key, fact);
      parentByNode.set(key, `${Number(fact.routeIndex ?? -1)}:${Number(fact.parentNodeId ?? -1)}`);
    }
  }

  for (const fact of sceneFacts) {
    if (fact?.kind !== "csg.web.scene.event_handler") continue;
    eventHandlerCount += 1;
    eventHandlerNodes.add(sceneNodeKey(fact));
    const actionKind = String(fact.actionKind ?? "");
    const effect = String(fact.effect ?? "");
    if (actionKind.length === 0) emptyActionKindCount += 1;
    else bump(actionKindCounts, actionKind);
    if (actionKind.length > 0 && !allowedActionKinds.has(actionKind)) bump(unknownActionKinds, actionKind);
    if (effect.length === 0) emptyEffectCount += 1;
    for (const segment of effect.split(";")) {
      if (segment.startsWith("invoke:")) invokeSegmentCount += 1;
      const prefix = effectSegmentPrefix(segment);
      if (prefix.length > 0) bump(effectPrefixCounts, prefix);
    }
  }

  for (const fact of sceneFacts) {
    if (fact?.kind !== "csg.web.scene.hit_target") continue;
    hitTargetCount += 1;
    const nodeKey = sceneNodeKey(fact);
    if (!nodes.has(nodeKey)) invalidHitTargetNodeRefCount += 1;
    const targetKind = String(fact.targetKind ?? "");
    if (targetKind === "route") {
      routeHitTargetCount += 1;
      if (!routesById.has(String(fact.targetRouteId ?? ""))) invalidHitTargetRouteRefCount += 1;
    } else if (targetKind === "native-control") {
      nativeControlHitTargetCount += 1;
    } else if (!eventHandlerNodes.has(nodeKey)) {
      eventHitTargetWithoutHandlerNodeCount += 1;
      if (!nodeOrAncestorHasHandler(nodeKey, parentByNode, eventHandlerNodes)) {
        eventHitTargetWithoutHandlerAncestorCount += 1;
        if (eventHitTargetsWithoutHandlerAncestor.length < 32) {
          const node = nodeByKey.get(nodeKey);
          eventHitTargetsWithoutHandlerAncestor.push({
            routeIndex: Number(fact.routeIndex ?? -1),
            routeId: routeIdByIndex.get(Number(fact.routeIndex ?? -1)) ?? "",
            nodeId: Number(fact.nodeId ?? -1),
            tagName: String(node?.tagName ?? ""),
            targetKind,
            targetRouteId: String(fact.targetRouteId ?? ""),
            eventName: String(fact.eventName ?? ""),
            handler: String(fact.handler ?? ""),
          });
        }
      }
    }
  }

  const unknownActionKindCount = Object.values(unknownActionKinds).reduce((sum, count) => sum + count, 0);
  return {
    schema: "unimaker.scene_action_coverage.v1",
    eventHandlerCount,
    hitTargetCount,
    routeHitTargetCount,
    nativeControlHitTargetCount,
    actionKindCounts,
    effectPrefixCounts,
    emptyActionKindCount,
    emptyEffectCount,
    invokeSegmentCount,
    unknownActionKindCount,
    unknownActionKinds,
    invalidHitTargetNodeRefCount,
    invalidHitTargetRouteRefCount,
    eventHitTargetWithoutHandlerNodeCount,
    eventHitTargetWithoutHandlerAncestorCount,
    eventHitTargetsWithoutHandlerAncestor,
  };
}

function sceneNodeKey(fact) {
  return `${Number(fact?.routeIndex ?? -1)}:${Number(fact?.nodeId ?? -1)}`;
}

function bump(map, key) {
  map[key] = Number(map[key] ?? 0) + 1;
}

function nodeOrAncestorHasHandler(nodeKey, parentByNode, eventHandlerNodes) {
  let current = nodeKey;
  const seen = new Set();
  while (current && !seen.has(current)) {
    if (eventHandlerNodes.has(current)) return true;
    seen.add(current);
    const parent = parentByNode.get(current);
    if (!parent || parent.endsWith(":-1") || parent.endsWith(":0")) return false;
    current = parent;
  }
  return false;
}

function effectSegmentPrefix(segment) {
  const text = String(segment ?? "").trim();
  if (text.length === 0) return "";
  const colon = text.indexOf(":");
  if (colon >= 0) return text.slice(0, colon);
  return text;
}
