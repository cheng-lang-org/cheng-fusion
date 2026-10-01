# Coordinate-Aware Pointer / Drag Dispatch

Status: proposal
Owner: scene-runtime / codegen
Supersedes nothing. Extends the click-only tap pipeline with `pointerdown` / `pointermove` /
`pointerup` dispatch carrying `(xMilli, yMilli, pointerId)`, while preserving the existing
click tap-path byte-for-byte and the qi ink ripple.

---

## 0. Executive verdict (honest, not papered over)

The feasibility question was: *"can pointer/drag be done with coordinate-aware dispatch alone,
no closure layer?"*

**Answer: NO for the handlers this task actually targets.** The verdict splits by handler class,
and the coordinate-computation class — which is the core loop of `MinecraftPage` and `DouDiZhuPage`
drag-select — provably needs the transpile/closure layer. Coordinate-aware dispatch is **necessary
but not sufficient**: it routes the event to the right node and keeps `(x,y)` alive, but it cannot
*execute* `const dx = e.clientX - origin; setCardPos(dx)`. That body is computation, not a static
delta, and only `transpileClosure` (`ts-csg/src/csg-cheng-transpiler.ts:1427`) can run it.

Two handler classes, disjoint by what their body data-flow needs:

| Class | Example handlers | Needs closure? | Needs coordinate plumbing? |
|-------|------------------|----------------|----------------------------|
| **A — pure state delta, keyed by node identity** | `DouDiZhuPage.applyCardSelection(card.id)` (`DouDiZhuPage.tsx:1390`) | **No** | **No** |
| **B — event-coordinate computation** | `MinecraftPage.handleBlockClick` (`MinecraftPage.tsx:504`), `MinecraftPage.onMove` joystick/look (`MinecraftPage.tsx:565`), `DouDiZhuPage.onPointerMove` drag-select (`DouDiZhuPage.tsx:1568`) | **Yes** | **Yes** |

Class A is the *minority* of real interaction. The optimistic "just dispatch" reading is only true
for Class A. This spec delivers Class A end-to-end now (Phase 1–3) and lays the *coordinate-carrying
dispatch substrate* that Class B requires (Phase 4–5), explicitly flagging the two further blockers
Class B still has even with that substrate (array-of-struct state; ref writes).

### The killer flaw that was corrected: event-name casing

The original fragments dispatched lowercase literals `pointerdown` / `pointermove` / `pointerup`.
**That is dead on arrival.** `sceneEventNameForProp` (`ts-csg/src/csg-web-materializer.ts:3327`)
only lowercases the **first** character of the prop suffix:

```ts
function sceneEventNameForProp(propName: string): string {
  const suffix = propName.slice(2);            // "PointerMove"
  if (suffix.length === 0) return "";
  return `${suffix[0]!.toLowerCase()}${suffix.slice(1)}`;   // "pointerMove"
}
```

So `onClick → "click"` (single-syllable, accidentally all-lowercase), but
`onPointerDown → "pointerDown"`, `onPointerMove → "pointerMove"`, `onPointerUp → "pointerUp"` —
**camelCase**. The runtime match is exact string equality (`web_scene_runtime.cheng:11445`,
`handler.eventName == eventName`), so any lowercase dispatch literal would never match.

**Decision:** all dispatch literals and all interaction-kind string compares use the **exact
camelCase names the materializer emits**: `"pointerDown"`, `"pointerMove"`, `"pointerUp"`. This is
the single source of truth; do not introduce a second casing convention anywhere. (Do **not** "fix"
`sceneEventNameForProp` to force lowercase — that would also change `"click"`'s neighbours and any
other already-shipped event name; match what it emits.)

---

## 1. End-to-end data flow (native → codegen → runtime → body)

### 1.1 Today (click-only), with real anchors

```
[native C drain]
  mobile_shell_codegen.cheng:3502-3509
    forwards action 0/1/2/3 + (xMilli,yMilli) + pointerId; force-forwards action==2 during scroll
        |
        v
[codegen entry]  ts-csg/scripts/scene-runtime-smoke-source.mjs:4921
  cheng_app_on_touch_milli(appId, action, pointerId, xMilli, yMilli)
    action==0 DOWN  (4925) ink.WebInkQiSpawn(x/1000,y/1000); top_interaction; arm :active
    action==2 MOVE  (4946) ink.WebInkQiOnTouchMove(x/1000,y/1000); RETURN   <-- coords discarded
    action==1 UP    (4950) ink.WebInkQiOnTouchEnd(); click cascade
        |
        v
[hit-test + apply]  smoke:4381 __csg_scene_top_interaction(xMilli,yMilli)  -> __csgSceneTopNode/Kind
                    smoke:4437 __csg_scene_apply_event_to_node(nodeId)      <-- ONLY nodeId, coords gone
                    smoke:4553 __csg_scene_find_event_hit_target_node(...,"click")
        |
        v
[runtime]  web_scene_runtime.cheng:11497 WebSceneApplyNodeEventEffect(graph,route,nodeId,"click",true)
             11436 WebSceneFindEventHandlerForNodeEvent: "click" -> interaction kind 2 fast path,
                   else linear scan 11442-11447 (exact eventName equality at 11445)
             11502-11506 effect whitelist -> WebSceneApplyEventEffectSegment (11340)  toggle:/set:/route:/stop
        |
        v
[body]  static state delta only (toggle:/set:scalar). No arithmetic, no coordinates.
```

The coordinate is consumed by hit-test and **discarded** at the apply boundary
(`__csg_scene_apply_event_to_node(nodeId)` takes only `nodeId`). Verified: the strings
`pointerDown` / `pointerMove` / `pointerUp` (any casing) appear **nowhere** in either
`scene-runtime-smoke-source.mjs` or `web_scene_runtime.cheng` today. The MOVE branch does ink only
and returns — there is no continuous-event dispatch path at all.

### 1.2 After this spec

```
[native C drain]  UNCHANGED functionally (mobile_shell_codegen.cheng:3502-3509)
                  only the stale comment at 3505-3508 is updated to note MOVE now hit-tests.
        |
        v
[codegen entry]  cheng_app_on_touch_milli
    action -> module slot __csgScenePointerEventName via integer if-chain (cold-safe):
        action==0 -> "pointerDown"   action==2 -> "pointerMove"   action==1 -> "pointerUp"
    DOWN: ink.WebInkQiSpawn FIRST (verbatim); top_interaction(pointerDown); arm :active (unchanged);
          if Top kind==2 -> apply pointerDown to node; record drag-arm slots
    MOVE: ink.WebInkQiOnTouchMove FIRST (verbatim); top_interaction(pointerMove);
          if Top kind==2 -> apply pointerMove (kind==1 route NEVER navigates on move)
    UP:   ink.WebInkQiOnTouchEnd FIRST (verbatim);
          pointerUp pass (top_interaction(pointerUp); if kind==2 apply pointerUp);
          THEN the existing click cascade UNCHANGED (route / event-click / hitRect / text-focus)
        |
        v
[runtime]  WebSceneApplyNodePointerEvent(graph, route, nodeId, eventName, xMilli, yMilli): bool   (NEW)
             - maintains pointer/drag capture state ON the graph
             - forwards to existing WebSceneApplyNodeEventEffect for Class-A registered effects
           WebSceneFindEventHandlerForNodeEvent generalized: "click"->kind2,
             "pointerDown/Move/Up"->kinds 3/4/5 fast path, else linear scan (text-input untouched)
           WebSceneEnsureInteractionIndex inserts kinds 3/4/5 alongside click kind 2
        |
        v
[body]  Class A: static toggle:/set: delta as today (no closure).
        Class B: pointer:N tag -> generated __csg_scene_dispatch_pointer(...) -> transpileClosure body
                 fed event coords as injected free vars (Phase 4+).
```

---

## 2. Why fragments contradicted, and the resolution

Four fragments disagreed on three axes. Resolution adopted here:

1. **Effect path vs bypass (the big one).** Fragments 1 & 2 route pointer handlers *through* the
   effect-string path (`WebSceneApplyNodeEventEffect → …Segment`, `web_scene_runtime.cheng:11340`).
   Fragment 4 says *do not* — pointer handlers carry `actionKind == "pointer"`, `effect == "pointer:N"`,
   whitelisted as pass-through (`return true`) so they never enter the segment parser, and call a
   generated `__csg_scene_dispatch_pointer` directly.

   **Resolution: both, split by class.** Class-A pointer handlers (a `toggle:`/`set:` scalar delta)
   are *ordinary event handlers distinguished only by eventName* and flow through the effect path
   (Fragment 1/2). Class-B pointer handlers (arithmetic on coordinates) carry `actionKind == "pointer"`
   + `effect == "pointer:N"`, are whitelisted as pass-through, and bypass to the generated dispatcher
   (Fragment 4). Fragments 1/2 are *insufficient* for Class B — they have no mechanism to run
   arithmetic through a static effect string. Fragment 4 is *overkill* for Class A. Each handler is
   classified once in `inferSceneEventActionInfo` (`ts-csg/src/csg-web-materializer.ts:2186`); a
   handler whose body the static extractor fully resolves stays `state_delta`, one whose body needs
   computed coords becomes `actionKind == "pointer"`.

2. **Drag-state ownership.** Fragment 2 puts capture/drag fields on `WebSceneGraph`. Fragment 4 puts
   them in generator module slots. **Resolution: capture/active state lives on `WebSceneGraph`**
   (single source of truth, survives across the generated helpers, queryable by the runtime
   `WebSceneApplyNodePointerEvent`), and the generator holds **no** parallel drag fields — it only
   holds the transient `__csgScenePointerEventName` selector slot and the `__csgScenePointerStatus`
   apply-status slot. This kills the double-tracking/drift risk the adversary flagged.

3. **Casing.** Resolved in §0: camelCase `pointerDown/pointerMove/pointerUp` everywhere.

---

## 3. Runtime: `WebSceneApplyNodePointerEvent` + pointer/drag state

### 3.1 New `WebSceneGraph` fields

Append **after** `graph.version = 0` (`web_scene_runtime.cheng:923`) in the struct
(`515-564`, before `interactionRouteIds:555` is fine since they are appended, not inserted) and
init them in `WebSceneResetGraph` mirroring the `graph.activeRouteIndex = -1` style. Eight flat
`int32` scalars — no new struct type, no multi-touch table:

```
activePointerId:   int32   # -1 = no capture; 0 = single logical pointer captured
activePointerNodeId: int32 # node that captured the pointer (drag target); -1 idle
activePointerRoute: int32  # route owning the capture; -1 idle
dragging:          int32   # 0/1; set to 1 on first pointerMove with a live capture
dragOriginXMilli:  int32   # pointer x at pointerDown
dragOriginYMilli:  int32   # pointer y at pointerDown
dragLastXMilli:    int32   # pointer x at last pointerMove (origin until first move)
dragLastYMilli:    int32   # pointer y at last pointerMove
```

Init (in reset): `activePointerId = -1`, `activePointerNodeId = -1`, `activePointerRoute = -1`,
`dragging = 0`, the four milli fields `= 0`. **All graph construction must go through
`WebSceneResetGraph`** — verify no positional `WebSceneGraph{...}` literal exists before relying on
defaulted fields (adversary anchor flag).

### 3.2 Public entry (signature exactly as requested)

```
fn WebSceneApplyNodePointerEvent(graph: var WebSceneGraph,
                                 routeIndex: int32,
                                 nodeId: int32,
                                 eventName: str,
                                 xMilli: int32,
                                 yMilli: int32): bool =
```

Dispatch keyed by an **integer if-chain over a tiny helper** (cold-safe, no chained string compares
in branches), mirroring `WebSceneApplyNodeEventEffect:11497`:

```
fn webScenePointerInteractionKind(eventName: str): int32 =
    if eventName == "pointerDown": return 3
    if eventName == "pointerMove": return 4
    if eventName == "pointerUp":   return 5
    return 0
```

Body:

- `let k = webScenePointerInteractionKind(eventName)` at top.
- **k == 3 (pointerDown):** capture — `activePointerId = 0`, `activePointerNodeId = nodeId`,
  `activePointerRoute = routeIndex`, `dragOriginXMilli/YMilli = xMilli/yMilli`,
  `dragLastXMilli/YMilli = xMilli/yMilli`, `dragging = 0`. Then run any registered pointerDown
  effect: `return WebSceneApplyNodeEventEffect(graph, routeIndex, nodeId, "pointerDown", true)`
  (returns `true` even with no handler — parity with click no-op at `11499-11500`).
- **k == 4 (pointerMove):** if `activePointerNodeId < 0 || activePointerRoute != routeIndex`:
  `return true` (no capture, ignore). Else `dragging = 1`,
  `dragLastXMilli/YMilli = xMilli/yMilli`, then
  `return WebSceneApplyNodeEventEffect(graph, routeIndex, nodeId, "pointerMove", true)`.
- **k == 5 (pointerUp):** if no capture for this node/route: `return true`. Else run the pointerUp
  effect, then reset capture: `activePointerId = -1`, `activePointerNodeId = -1`,
  `activePointerRoute = -1`, `dragging = 0` (origin/last left as-is). Return the effect's bool.
- **else (k == 0):** `return WebSceneApplyNodeEventEffect(graph, routeIndex, nodeId, eventName, true)`
  — one door for arbitrary names, no special-casing.

All capture-state mutations are direct field assignments to the `var WebSceneGraph` param, computed
**before** the `WebSceneApplyNodeEventEffect` call, and the call's bool is consumed in a `return`,
never stored back into an element slot. Coordinates stay **integer-milli** end-to-end; convert to px
only at the layer-nudge boundary via `WebSceneRoundMilliToPx` (`web_scene_runtime.cheng:3119`).

### 3.3 `WebSceneFindEventHandlerForNodeEvent` generalization (`11436`)

Today `11437` hard-codes `"click" → kind 2`. Generalize:

```
if eventName == "click":
    <existing kind-2 payload path 11438-11441, with -2147483647 -> -1 guard>
let k = webScenePointerInteractionKind(eventName)
if k != 0:
    <same payload path, kind = k, same sentinel guard>
<existing linear scan 11442-11447 unchanged>      # text-input change/input still routes here
```

`WebSceneEventHandlerAcceptsTextInput` / `FindTextInputEventHandlerForNode` (`11449-11465`) stay on
the linear-scan path, untouched.

### 3.4 Interaction index admits pointer kinds (`11092-11104`)

In `WebSceneEnsureInteractionIndex`, after the click insert at `11102-11103`, add: for each event
handler map `eventName` via `webScenePointerInteractionKind`; if it returns 3/4/5 call
`webSceneInteractionInsert(graph, route, node, k, i)` (k a literal kind, `i` the handler index) — same
shape as the click insert, cold-safe. Click stays kind 2. The lower-bound/lookup machinery
(`11107-11129`) is kind-agnostic, no change.

### 3.5 **Index version invalidation — the verified blocker, fixed here**

**Verified:** `WebSceneAddEventHandlerWithAction` (`1757-1790`) and
`WebSceneAddEventHandlerKnownLoadedNode` (`1793-...`) **do NOT bump `graph.version`** — they only
`add(graph.eventHandlers, …)`. `WebSceneEnsureInteractionIndex` rebuilds only when
`interactionVersion != version` (`11093`). Today this is benign because the index is first built
*after* a version-moving op (layout/state, e.g. `11267`/`11524`/`2822`) once all handlers are
registered. But **relying on that ordering for pointer handlers is fragile** — if the index is built
between handler-add calls, pointer rows get dropped silently.

**Fix (mandatory, part of this spec):** make `WebSceneAddEventHandlerWithAction` and
`WebSceneAddEventHandlerKnownLoadedNode` bump `graph.version` after a successful `add` (one line each:
`graph.version = graph.version + 1`), so a stale interaction index is always invalidated by any
handler mutation. This is the same discipline `WebSceneSetNodeState:2822` and
`WebSceneSetStateValueInternal:11267` already follow. This also retroactively hardens the click path.

### 3.6 Effect whitelist (`11502-11505`)

- **Class A** pointer handlers carry the normal `state_delta` actionKind and a `toggle:`/`set:`/`route:`/`stop`
  segment effect → already accepted by `WebSceneApplyEventEffectSegment` (`11340-11365`). No whitelist
  change.
- **Class B** pointer handlers carry `actionKind == "pointer"` → add a pass-through at `11502`:
  `if actionKind == "pointer": return true`. It **MUST NOT** fall into `WebSceneApplyEventEffect` or
  `pointer:N` hits the segment parser's final `return -1` (`11365`) and fails loud. The library never
  executes pointer-bypass logic; the generated layer does, exactly once. The drag position itself is
  recorded in graph state, never pushed through an effect string, so the segment vocabulary stays
  closed.

---

## 4. Codegen: all edits in the generator string literals

All edits are to `lines.push(...)` blocks in `ts-csg/scripts/scene-runtime-smoke-source.mjs`.
Current verified line numbers below (the file is generated; re-verify against current numbers before
editing — do not trust drifted citations).

### 4.1 action → eventName module slot (cold-safe)

Add a module var `var __csgScenePointerEventName: str` near the other module slots
(`4369-4371`, where `__csgSceneTopKind/Node/ApplyStatus` live). At the top of
`cheng_app_on_touch_milli` (`4921`), an integer if-chain writing the slot — **never** a branch-local
`let name = ...`:

```
__csgScenePointerEventName = ""
if action == 0: __csgScenePointerEventName = "pointerDown"
if action == 2: __csgScenePointerEventName = "pointerMove"
if action == 1: __csgScenePointerEventName = "pointerUp"
```

### 4.2 Generalize `__csg_scene_top_interaction` (`4381`)

Change signature to `fn __csg_scene_top_interaction(xMilli: int32, yMilli: int32, eventName: str) =`.
Replace the literal `"click"` at the event-ancestor call (`4403`) with `eventName`. Route-node
arbitration (kind 1, `4399-4400`) stays as-is — route edges are click/up-only and are NOT pointer.
Update all callers (`4927` DOWN, `4955` UP, and the new MOVE site) to pass the eventName slot.

### 4.3 Generalize the apply helpers (`4437`, `4542`)

`__csg_scene_apply_event_to_node` (`4437`) bakes `"click"` at `4442`;
`__csg_scene_apply_event_hit_target` (`4542`) bakes `"click"` at `4553` (find) and `4560` (apply).
`__csg_scene_find_event_hit_target_node` (`4344`) is already eventName-parameterized.

Add an `eventName: str` param to `__csg_scene_apply_event_to_node` and forward it to
`WebSceneApplyNodePointerEvent` instead of the old `WebSceneApplyNodeEventEffect("click")`. Collapse
the duplicated apply+refresh sequence (`4442-4450` and `4560-4567`) into one generalized helper:

```
fn __csg_scene_apply_node_pointer_event(nodeId: int32, eventName: str): int32 =
    __csgSceneLastEventHitNodeId = nodeId
    let activeRoute = scene.WebSceneActiveRouteIndex(__csgSceneGraph)
    __csgSceneLastEventHitStatus = 1
    scene.WebSceneClearDirty(__csgSceneGraph)
    if !scene.WebSceneApplyNodePointerEvent(__csgSceneGraph, activeRoute, nodeId, eventName, __csgScenePointerX, __csgScenePointerY):
        __csgSceneLastEventApplyStatus = -1
        return -1
    __csgSceneLastEventApplyStatus = 1
    if !__csg_scene_refresh_effect_dirty_frame(nodeId):
        __csgSceneLastEventApplyStatus = -2
        return -1
    __csgSceneLastTouchHitIndex = -1
    return 1
```

`__csgScenePointerX/Y` are module-slot int32 (milli), set by the entry from `xMilli/yMilli` before
any dispatch call. For the click cascade they are the tap coords; for pointer phases they are the
phase coords. (For pure click, `WebSceneApplyNodePointerEvent` with `eventName == "click"` hits the
k==0 branch and forwards to `WebSceneApplyNodeEventEffect` identically to today — so the click
cascade stays behaviorally identical.)

### 4.4 DOWN branch (`4925-4944`)

1. KEEP `ink.WebInkQiSpawn(xMilli / 1000, yMilli / 1000)` as the **first** statement (verbatim).
2. KEEP the `:active` css-state arbitration via `__csg_scene_top_interaction(xMilli, yMilli, "pointerDown")`
   and `var downNodeId = __csgSceneTopNode`; `:active` visual stays driven by `__csgSceneTopNode`.
   Keep `__csgSceneLastActiveNodeId = downNodeId` so UP clears `:active`.
3. After `:active`, additionally: `if __csgSceneTopKind == 2: __csgScenePointerStatus =
   __csg_scene_apply_node_pointer_event(__csgSceneTopNode, "pointerDown")`. This *arms* the runtime
   capture (set inside `WebSceneApplyNodePointerEvent`) and fires any registered pointerDown effect.

**Down-winner arbitration must stay identical to today** so the `:active` node and the eventual click
target never drift (adversary risk on `__csgSceneLastActiveNodeId`).

### 4.5 MOVE branch (`4945-4947`)

1. KEEP `ink.WebInkQiOnTouchMove(xMilli / 1000, yMilli / 1000)` as the **first** statement (qi trail).
2. THEN: `__csg_scene_top_interaction(xMilli, yMilli, "pointerMove")`. **CRITICAL: pointerMove acts
   on `__csgSceneTopKind == 2` only, NEVER kind == 1** — moves never navigate.
   `if __csgSceneTopKind == 2: __csgScenePointerStatus =
   __csg_scene_apply_node_pointer_event(__csgSceneTopNode, "pointerMove")`.
3. `return` after, like today. The status goes to the module slot `__csgScenePointerStatus`, never a
   branch-local `let`.

### 4.6 UP branch (`4948-5004`)

1. KEEP `ink.WebInkQiOnTouchEnd()` (verbatim) and the `releaseNodeId`/`:active`-clear logic.
2. ADD a **pointerUp pass before the click cascade**:
   `__csg_scene_top_interaction(xMilli, yMilli, "pointerUp")`;
   `if __csgSceneTopKind == 2: __csgScenePointerStatus =
   __csg_scene_apply_node_pointer_event(__csgSceneTopNode, "pointerUp")`. Kind-1 route stays in the
   click cascade, **not** in the pointerUp pass.
3. THEN the existing click cascade **UNCHANGED** (kind1 route → kind2 event click → route hit-rect →
   event hit-target click → text focus). Because `pointerUp` and `click` are distinct eventNames
   matched separately (`11445`), firing pointerUp does **not** consume the click handler: a pure
   `onClick` node sees the pointerUp find return no-op and the click cascade fires exactly as today —
   **byte-identical to current behavior**.

### 4.7 C side — no functional change

`mobile_shell_codegen.cheng:3502-3509` already forwards action 0/1/2/3 + milli coords + pointerId and
force-forwards `action==2` during scroll. **Only the stale comment at 3505-3508** is updated to note
that MOVE now also dispatches pointerMove hit-testing.

---

## 5. Single-handler-per-node: the "fires both" claim is FALSE (corrected)

Fragment 1 claimed a node with both `onClick` and `onPointerUp` "fires both (DOM semantics)".
**Verified false at the materializer:** `sceneHitTargetForNode` (`ts-csg/src/csg-web-materializer.ts:3355`)
takes only `eventProps[0]` — **one** event prop per node becomes the hitTarget. So a node declaring
both registers ONE hitTarget, not two.

However, `emitSceneEventHandlerFact` runs over **all** `eventProps` (`csg-web-materializer.ts:1561`),
so all handlers do land in `graph.eventHandlers`. The asymmetry: the `hitTarget` table (used by the
hit-test ancestor walk) has one row, but the `eventHandlers` table (used by
`WebSceneFindEventHandlerForNodeEvent`) has all rows. The pointer dispatch path resolves the node via
`top_interaction`/hit-test (one hitTarget) then applies by eventName against the full eventHandlers
table — so a node *can* fire both click and pointerUp **only if its single hitTarget routes the hit
and both handlers exist in eventHandlers**. **Decision:** do not promise "fires both" as a feature.
Class A target nodes declare a single interaction prop. If a real node needs both, that is a separate
materializer change to emit multiple hitTargets — out of scope here.

---

## 6. Cold-safe codegen constraints (binding)

These are the rules every generated string and every runtime edit MUST obey (cold compiler
miscompiles certain shapes — documented at `scene-runtime-smoke-source.mjs:4956-4958`):

1. **action → eventName is an integer if-chain writing the module slot** `__csgScenePointerEventName`
   — never a branch-local `let name = <str>`.
2. **Apply status flows through the module slot** `__csgScenePointerStatus` (and the existing
   `__csgSceneTopApplyStatus`), never `let s = __csg_scene_apply_*(...)` inside an if-branch (cold
   miscompiles let-of-call-result in a branch).
3. **No bare element stores after calls.** Use whole-array/whole-value resets placed *ahead* of all
   calls (the existing `__csgSceneRouteRuntimeReady = []` at `4519` pattern), or write into module
   scalar slots. Never `graph.stateEntries[i].value = x` or `positions[i].x = v` after a call — it is
   swallowed.
4. **All new `WebSceneGraph` pointer fields are plain int32 scalar stores** in `WebSceneResetGraph`
   (`920-923`), same shape as `graph.activeRouteIndex = -1` / `graph.version = 0`. Capture-state
   mutations in `WebSceneApplyNodePointerEvent` are direct field assignments computed before the
   effect call, not interleaved with it.
5. **Pointer dispatch is an integer if-chain with direct `return`** (`if k == N: return …` … `return -1`),
   no `match`/fallthrough — paradigm at `scene-runtime-smoke-source.mjs:5650-5655`.
6. **Interaction-index inserts call `webSceneInteractionInsert(graph, route, node, kind, i)` directly**
   with `kind` a literal 3/4/5 — no intermediate array-element write after a call (identical to the
   cold-safe click insert at `11103`).
7. **State writes go only through `WebSceneSetStateValue`** (str-encoded, equality short-circuit +
   markDirty, `11295`). For Class B, computed numbers round-trip via `intToStr`. Coords stay
   **integer-milli** in slots (no f64 in module slots); any float math (atan2/sqrt) stays *local
   inside* the transpiled closure body, never written to a module array slot.
8. **`pointer:N` tag parse reuses `WebSceneStrStartsWith` + `SliceBytes`** (`11343`/`11350`); no new
   string scanner. Generated `emitName` (`__pointer_N`, `__pointer_N_apply`) must be a legal Cheng
   identifier (numeric N, no special chars).
9. **`WebSceneInteractionPayload` sentinel** `-2147483647` is mapped to `-1` in a plain `if` before
   the result is used (mirror `11438-11441`), no bare element store after the call.

---

## 7. Smallest vertical slice (prove it, one real handler) + device pixel check

**Slice = `DouDiZhuPage.applyCardSelection` (`DouDiZhuPage.tsx:1390`) exercised as a TAP (UP).**
This is the ONE genuinely closure-free handler (Class A, node-identity `Set` toggle). It needs
**zero** new runtime export, **zero** closure, **zero** coordinate plumbing — it validates the
Class-A half of the verdict end-to-end and would immediately expose the casing bug if `onPointerUp`
were used instead of `onClick`.

Steps:

1. On a card node bound to `applyCardSelection(card.id)`, confirm the materializer emits a
   `state_delta` effect (a `toggle:` on a `selectedIds`-derived scalar ref) via
   `inferSceneEventActionInfo` (`csg-web-materializer.ts:2186`) — **NOT `command`**. The argument
   `card.id` resolves as node-static metadata (`sceneInlineFreeVarResolver:2510` → `data-csg-static-item-<key>`,
   the `data-ddz-card-id` attribute at `DouDiZhuPage.tsx:711`).
2. Tap the card through the existing pipeline:
   `cheng_app_on_touch_milli` UP → click cascade → `__csg_scene_apply_event_hit_target` →
   `WebSceneApplyNodeEventEffect(graph, route, nodeId, "click", true)`. (Unchanged path; the slice
   does not even need the new pointer code — it locks the byte-stable baseline first.)
3. **Verify on device** with `tools/interaction_regression_test.sh run_tap`
   (`tools/interaction_regression_test.sh:9`): tap the card coords, assert `post_tap_route_index`
   stays on the doudizhu route (selection is in-route, no navigation), AND assert the selection state
   flipped via a **home-pixel digest** of the card-selection visual (the card lifts / highlights),
   captured by the same headless harness (`$H route ir.raw 390 844`) used by the route asserts. The
   digest before-tap ≠ after-tap on exactly the tapped card's pixels, and is unchanged elsewhere.

This proves Class A. It does **not** prove Class B. The smallest **Class B** slice (to demonstrate the
closure layer is mandatory) is `MinecraftPage.handleBlockClick` reduced to a single scalar: write
`blockX = Math.floor(point.x + 0.5)` into a scalar str state via a transpiled closure fed `clientX`
as a free var. That slice is **not small** — it requires building the coordinate plumbing (§4.3
`__csgScenePointerX/Y`), the `actionKind == "pointer"` bypass dispatch, and `transpileClosure` wiring
— and proving it confirms the verdict's optimistic reading was wrong. Start with Class A; attempt
Class B only after the baseline is locked.

---

## 8. Phased plan with per-phase gates

Every phase must pass the **standard gate triple** before merge, plus its own check:

- **census** — `route/state_delta/stop/command` actionKind counts emitted by the materializer stay
  byte-stable vs baseline (no handler is poached into a new class unintentionally;
  `inferSceneEventActionInfo` regression).
- **route-stable** — `tools/interaction_regression_test.sh` all-pass (every existing tap → same route).
- **total-conserved** — production regression 1346/1348 held; `tools/ci_gate.sh` 9/9.
- **device drag check** (phases that touch MOVE/pointer) — on-device home-pixel digest before vs after
  a synthetic drag is deterministic and matches the expected delta (no churn frames, no spurious
  route change).

### Phase 0 — index version hardening (prereq, no behavior change)

Add `graph.version + 1` bump to `WebSceneAddEventHandlerWithAction` and
`WebSceneAddEventHandlerKnownLoadedNode` (§3.5). Gate: census unchanged, route-stable, total-conserved.
No pointer code yet. This is safe-to-ship alone and de-risks every later phase.

### Phase 1 — runtime pointer state + entry, no codegen wiring

Add the 8 `WebSceneGraph` fields (§3.1), `WebSceneApplyNodePointerEvent` (§3.2),
`webScenePointerInteractionKind`, generalize `WebSceneFindEventHandlerForNodeEvent` (§3.3) and
`WebSceneEnsureInteractionIndex` (§3.4), add the `pointer` whitelist pass-through (§3.6). No generator
edits. Gate: census unchanged (no new handlers), route-stable (click path untouched), total-conserved.
Unit-test `WebSceneApplyNodePointerEvent` directly: capture on down, ignore move w/o capture, reset on
up.

### Phase 2 — codegen wiring (Class A pointer + preserved click)

Generalize `__csg_scene_top_interaction` / apply helpers, add `__csg_scene_apply_node_pointer_event`,
wire DOWN/MOVE/UP (§4.1–4.6), update the C comment (§4.7). Gate: **census byte-stable**,
**route-stable** (pure onClick nodes byte-identical — the decisive regression), total-conserved,
device drag check (a drag over a no-pointer-handler node changes nothing but the ink trail).

### Phase 3 — prove Class A slice end-to-end

The §7 `applyCardSelection` tap slice. Gate: the slice's device pixel digest flips on the tapped card
and nowhere else; route-stable; census; total-conserved. **This locks the Class-A verdict.**

### Phase 4 — Class B substrate (coordinate plumbing + `pointer:N` dispatch)

Add `__csgScenePointerX/Y` module slots set from `xMilli/yMilli` (§4.3), the
`actionKind == "pointer"` classification in `inferSceneEventActionInfo`, the `pointer:N` effect tag,
and `__csg_scene_dispatch_pointer(pid, phase, nodeId, xMilli, yMilli)` (integer if-chain →
`__pointer_N_apply`). `transpileClosure` wiring with injected free vars
`{clientX: int32-milli, clientY: int32-milli, + read state via ForRef}`; write computed result back
via `WebSceneSetStateValue(intToStr(v))`. Gate: census shows the *expected* count moving from
`command` → `pointer` (the previously-dropped handlers), route-stable, total-conserved, device drag
check on the chosen Class-B handler.

### Phase 5 — prove Class B scalar slice + document remaining blockers

`MinecraftPage.handleBlockClick` reduced to one scalar `blockX`. Gate: device pixel digest shows the
block placed at the computed coordinate (Math.floor of the hit point), deterministic across repeated
identical taps. **Explicitly document the two blockers Class B still has and that this spec does NOT
solve:**

- **Array-of-struct state.** `setPlacedCubes(prev => [...prev, {pos:[x,y,z], type}])`
  (`MinecraftPage.tsx:509-514`) appends an object to an array. Runtime state is str-encoded **scalar**
  (`WebSceneSetStateValue:11295`); `WebSceneApplyEventEffectSegment` supports only `toggle:`/`set:`scalar
  (`11355-11364`). The full block-placement handler is **unreachable** without an array-state
  representation — a separate, larger workstream than coordinate dispatch.
- **Ref writes.** `beginHandDrag` (`DouDiZhuPage.tsx:1404`) and the touch handlers write refs
  (`dragSelectRef`, `moveInputRef`, `moveTouchId`), not `useState`. Refs have no state slot and no
  canonical entry; misclassifying a ref-write as a state delta would silently no-op. Out of scope.
- **Re-entrant hit-test.** `DouDiZhuPage.onPointerMove` (`DouDiZhuPage.tsx:1568`) calls
  `document.elementFromPoint(clientX,clientY)` — a *second* hit-test inside the handler body. Executing
  it means calling the runtime hit-test from inside a closure (re-entrancy), heavier than "coord as
  free var". Out of scope for Phase 5.

---

## 9. Open risks (carried, with mitigations)

| Risk | Mitigation |
|------|-----------|
| Per-move `__csg_scene_refresh_effect_dirty_frame` resets `__csgSceneRouteRuntimeReady = []` (`4519`) every move → full prewarm invalidation per drag frame, tanks framerate and can indirectly regress home-pixel/route gates via CPU. | `WebSceneSetStateValue` already has an equality short-circuit (no dirty if value unchanged). For moves that produce no state change, skip the refresh (fast path: only refresh when `WebSceneDirtyCount > 0` after apply). Move-event coalescing is a Phase-4 perf task, gated by the device drag check. |
| C force-forwards MOVE during scroll (`3504-3508`) → pointerMove hit-tests during scroll gestures. | Acceptable (web passive-listener-like); pointerMove only acts on kind==2 event nodes and is a no-op without an armed capture. Confirm against scroll semantics in Phase 2 device check. |
| Drag-state staleness across route change / interrupted gesture → move fires against a dead node. | Reset capture fields on route change (mirror the back-path resets at `scene-runtime-smoke-source.mjs:5687`); `WebSceneApplyNodePointerEvent` move-branch already guards `activePointerRoute != routeIndex → no-op`. |
| `dragging` set on first move (no threshold) may fire drag for taps. | Acceptable for the minimal cut; flagged for product review. A threshold is a one-field comparison on `dragOrigin` when needed. |
| Double-firing for a node with both pointerUp and click. | §5: materializer emits a single hitTarget per node; do not promise "fires both". Class-A targets declare one interaction prop. |
| Float ABI is panic-disabled (`scene-runtime-smoke-source.mjs:4918`). | All dispatch and drag math stays int32-milli; float math, if any, stays local inside the transpiled closure body (already passed 44/44 cold), never in a module slot. |

---

## 10. Decision summary

1. **Closure layer is required for Class B** (MinecraftPage block-place/joystick/look, DouDiZhu
   drag-select). Coordinate-aware dispatch alone is necessary but insufficient. Class A
   (node-identity toggles) needs no closure.
2. **Casing: camelCase `pointerDown/pointerMove/pointerUp` everywhere** — matches
   `sceneEventNameForProp`'s actual output; the lowercase fragments were dead on arrival.
3. **`WebSceneApplyNodePointerEvent`** is the single public entry; pointer/drag capture state lives on
   `WebSceneGraph` (8 int32 fields), NOT duplicated in generator slots.
4. **Class A flows through the effect path; Class B bypasses via `actionKind == "pointer"` +
   `pointer:N`** to a generated dispatcher + `transpileClosure`. Each handler classified once in
   `inferSceneEventActionInfo`.
5. **Index version bump on handler-add is mandatory** (Phase 0) — verified missing today; required so
   the interaction index never serves a stale table for pointer kinds.
6. **Click tap-path and qi ink ripple preserved byte-for-byte**; pointerUp is a separate
   additionally-matched event, fired before the unchanged click cascade.
7. **Prove Class A first** (`applyCardSelection` tap, device pixel digest), then Class B scalar
   (`handleBlockClick` one coordinate). Array-of-struct state and ref writes remain explicitly
   unsolved blockers.
