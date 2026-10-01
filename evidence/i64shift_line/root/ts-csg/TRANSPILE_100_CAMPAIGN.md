# ts-csg React→Cheng 100% Functional Coverage Campaign

Goal: one-click transpile covers UI (layout, already 1:1) AND functionality (handlers) to
the honest ceiling. Today: layout 1:1, executable handlers ~56% (682/1217). Honest ceiling
~95–97% executing + a named/gated float/cross-component tail (int-only numeric model is a
permanent constraint). "100%" = zero `invoke` handlers without a recorded reason (compiled /
bridged / no-op / enumerated-diagnostic), CI-gated.

Key asset: the full transpiler **already exists but is dormant** —
`ts-csg/src/csg-cheng-transpiler.ts` (`ChengFunctionTranspiler` / `transpileClosure` /
`emitStateSlots` / `TypeMapper`). It transpiles TS control flow, array methods, struct/array/
nullable/Record types, FFI bridges. Used only by `scripts/scene-runtime-smoke-source.mjs`,
NOT by production `scripts/unimaker-one-click.mjs`. Architecture = **Compiled Handler Table
(CHT)**: reuse this transpiler, generalize the proven try-handler-first dispatch ladder, back
handlers with typed runtime state slots, bridge I/O via real `@importc` C shims.

Census method: `node ts-csg/scripts/unimaker-one-click.mjs --project /Users/lbcheng/UniMaker/React.js
--out <dir> --stop-after materialize` then count `scene_data.bin` effect prefixes.

## Phases (each census + device gated)
- [x] **P0 DONE (verified 2026-06-17)** Census honesty: classify text_input (29, runs via
      WebSceneApplyNodeTextInputValue) + no_op (45, preventDefault) with distinct prefixes instead
      of invoke. **56% → 64.5%** (census: set 441 / route 241 / toggle 32 / text_input 29 / no_op 45 /
      invoke 409). set/route/toggle byte-stable (change is only in the invoke-fallback branch).
      Code: csg-web-materializer.ts inferSceneEventActionInfo (2 new pre-invoke classifications);
      web_scene_runtime.cheng WebSceneApplyEventEffectSegment(+WithValue) treat text_input:/no_op: as
      inert (→0; unknown prefix was -1). Census cmd:
      `CHENG_PROCESS_MAX_RSS_BYTES=8589934592 node ts-csg/scripts/unimaker-one-click.mjs --project-root
      /Users/lbcheng/UniMaker/React.js --stop-after materialize --out-dir tmp/census-p0
      --mobile-content-snapshot-file tmp/unimaker-pwa-content-snapshot.json` (minimal snapshot hand-written).
      **409 invoke remaining = the real P1-P5 target.**
- [ ] **P1** CHT spine + scalar compiled handlers (~190 scalar guards/derived/conditional). Wire
      the dormant transpiler into one-click; non-click dispatch surface; generated dispatch ladder;
      WebSceneApplyNodeCompiledHandler; setter→typed-slot binding; reconcile. ~64→~80%. 4-8 wk.
      **P1 HOOK LOCATED (2026-06-17, measured)**: handlers are const-arrow/async functions —
      transpiler `functionByName` (named-decls only) MISSES them (0/49 by name = "function not found").
      But the transpiler is driven by function-ID: `transpileClosure(facts, functionId, emitName,
      freeVars, externs)` + `ChengFunctionTranspiler.transpile(functionId)`. The materializer ALREADY
      resolves handler→id: `sceneEventStateDeltasFromHandlerBody` uses
      `localHandlerTargetFunctionInAnyFunction(name, context) ?? context.functionIdByName.get(name)`
      → `context.opsByFunction.get(functionId)` / `context.functionById`. So P1 wires at the
      invoke-fallback in `inferSceneEventActionInfo`: resolve functionId (existing helper) → run
      transpileClosure by id → on ok, emit `compiled:<id>` + collect the Cheng fn; runtime/codegen add
      a CHT dispatch (`WebSceneApplyNodeCompiledHandler`) calling it + typed state slots. Remaining P1
      sub-problems: freeVar inference + types (smoke supplies them manually per closure), externs for
      cross-component callbacks, non-click dispatch surface (today dispatch hardcodes "click").
- [ ] **P2** Typed array/struct/Map slots + functional updaters (prev=>[...], .filter writeback,
      Map rebuild). Widen emitStateSlots + TypeMapper. ~80→~88%. 8-16 wk.
- [ ] **P3** @importc native bridges for I/O allowlist (fetch/P2P/payment/file/geo). Completes
      handlePublish end-to-end. ~88→~92%. 6-10 wk.
- [ ] **P4** Pointer/drag: WebSceneHandlerEvent struct + @importc pointer feed + gesture/ref slots
      + fixed-point coord math. ~92→~97%. 6-12 wk.
- [ ] **P5** Residual sweep + CI gate (every invoke must carry a reason). Enumerate float/cross-
      component tail. ~97→honest 100%. 2-4 wk + open tail.

Total ~7-13 engineer-months. Hard residual: array-of-struct/Map state (P2), float-sensitive
handlers (permanent fixed-point/diagnostic tail), async I/O interleaving (P3), cross-component
opaque callbacks (small permanent tail).

## CHT de-risk — CRITICAL prerequisite finding (2026-06-17)
Measured the dormant transpiler on the real handler corpus (standalone, facts from one-click
--stop-after extract --emit jsonl). Resolution chain VERIFIED: handler name → `local_write{name}`
op → its `value` → `staticFunctionValueTarget` (`function_value.targetFunction`, unwrap `useCallback`)
→ function-id; drive `transpileClosure(facts, fnId, name, freeVarTypes, externs)` by id (by-NAME is a
dead end — handlers are const-arrow/async, not named decls).
- 66/81 named-helper handlers resolved to a function-id.
- **transpileClosure SILENTLY DROPS statements it cannot model** (setters without state slots, async
  IIFEs `void (async()=>{})()`, unknown I/O calls) — it does NOT fail, it emits a partial/empty body.
  Verified by dumping output: handleLike → only `if(engagementBusy) return` (DROPPED setEngagementBusy
  + the entire async network like); handleSettingsToggle/resetWorld → just `return` (whole body dropped).
- So **"compiles OK" is a FALSE POSITIVE**: naively using it as coverage fabricates handlers that
  "pass" but do nothing — a severe no-fallback violation. The smoke (buildM2HomeWiring) works only
  because it supplies emitStateSlots + externs for its specific closure.
- **Honest CHT requires, per handler: emitStateSlots(its useState) + externs(its I/O) + transpileClosure,
  PLUS a fail-on-drop guard** (transpiler must error when a statement is unrepresentable, never silently
  drop). Without that guard the campaign would silently fabricate. This is the #1 prerequisite for P1.
- Bucketed (free-vars supplied as str, NO slots/externs — so most are dropped/wrong): ~20 io_async (P3),
  ~16 free-var-residual, ~2 obj (P2), rest other. The real per-handler honest ceiling needs the full
  per-handler setup above; P1 and P3 are COUPLED (most compilable handlers have I/O that must be bridged,
  not dropped). Measurement scripts: /tmp/snap/cht_ceiling.mjs, cht_p1.mjs, dump_handle.mjs.

## fail-on-drop guard COMPLETE + honest P1 ceiling measured (2026-06-17)
The #1 CHT prerequisite (de-risk below) is now DONE in `csg-cheng-transpiler.ts`. Two silent-drop
gaps closed:
1. **call-statement** (`emitBlockInner` case "call"): a bare call-statement now emits via emitExpr
   or FAILS on an unsupported callee; "call" removed from the default-case silent-drop whitelist.
2. **VoidExpression / async IIFE** (`emitBlockInner` case "expression"/"statement"): when the op has
   no `value` field (e.g. `void (async()=>{})()` = expressionKind VoidExpression — the fire-and-forget
   I/O pattern), it now routes the op itself through emitExpr, which FAILS on the unsupported kind
   instead of silently emitting nothing. VERIFIED: handleLike now FAILS (was emitting guard+2 setters
   while dropping the entire `setDistributedContentLike` network call — `has network call = false`).
Also added: state-setter acceptance (`stateSetterNames` threaded through ChengFunctionTranspiler
constructor + emitCall default case + transpileClosure signature) so `setX(...)` from the handler's
own useState compiles instead of failing as unknown-callee.

3. **property/element-write without type-check** (`emitBlockInner` case "property_write",
   "element_write", and the `assign`→property_read/element_read branches): these emitted
   `recv.field = v` / `recv[i] = v` literally without verifying the receiver is a known struct
   (`typeDeclByName`) / array type. So a React `useRef` typed as str emitted `ref.current = ""`
   (str has no `.current`; a useRef has no scalar-KV representation) and "compiled OK". VERIFIED:
   handleMorePanelTouchCancel (= `morePanelTouchStartRef.current = null`) now correctly FAILS.
   Mirrors the existing property_READ validation (line 943: `typeDeclByName.has(recvType)`).

**Honest no-bridge ceiling, PROPER free-var typing (useState→emitStateSlots type, module-const→
literal type), all 3 leak-fixes ON: 1/221 resolvable handlers** — and that one (handleError =
`setDidError(true)`) is NOT a scene-wired event handler (absent from scene_data; it's an internal
callback). **Among the 59 distinct scene-invoke handler names actually in scene_data, the no-bridge
compilable count is ~0** — they are all async I/O (`Promise<void>`), unsupported-callee (helper/I/O
calls needing externs), untyped-param (event/type/id — materializer must supply per-node param type),
or gesture/array/object. **DEFINITIVE: the CHT spine WITHOUT P3 bridges upgrades ZERO real scene
handlers. CHT is strictly dominated by the existing static set:/toggle:/param-switch paths until
bridges (P3) / typed slots (P2) / param-coupling exist. Building the spine plumbing now nets 0
verifiable coverage; the device-compile path (backend_driver/cheng) is also blocked pre-existingly,
so an end-to-end run cannot be verified regardless.** The genuine completable deliverable is the 3
transpiler honesty fixes (the #1 prerequisite — the transpiler is now trustworthy, will never again
fabricate a "passing" handler that drops its effect). The full CHT (spine + bridge corpus) is the
multi-month P1-P5 build. Measurement scripts: /tmp/snap/cht_p3.mjs, cht_p4.mjs, dump_mptc.mjs.

(superseded by the above) Earlier intermediate: OK = 1/66 named-helper handlers with free-vars-as-str.

## CORRECTION + exact CHT completion inventory (2026-06-17)
**device-compile is NOT blocked (earlier claim was wrong).** The generated 60153-line
`unimaker-react.scene-runtime.cheng` compiles cleanly: `cheng.stage3 system-link-exec
--in:<scene-runtime> --emit:obj --target:arm64-apple-darwin` → exit 0, 13MB .o (env:
CHENG_NO_BACKEND_DRIVER_HANDOFF=1 BACKEND_INCREMENTAL=0 BACKEND_MULTI_MODULE_CACHE=0
CHENG_DISABLE_PRIMARY_OBJECT_CACHE=1). The earlier "blocked" was a DIFFERENT desktop web-run smoke,
not this production compile. **So every CHT increment IS verifiable end-to-end.**

**4th transpiler fix landed: param-type support.** `transpileWithInjectedParams` never emitted the
closure's OWN parameters (only injected free-vars), so every param-handler failed "unresolved
identifier '<param>'". Added: emit `fn.parameters` typed via a new `paramTypes` arg (threaded through
`transpileClosure` as the 7th arg) or the param's annotation; FAIL on an untyped+unsupplied param.

**Definitive ceiling: 0/59 real scene handlers compile even with param-types + proper free-var
typing.** Exact blocker inventory (from /tmp/snap/callee_names.mjs over all 59) — this is the CHT
completion backlog, each item a real subsystem, all verifiable on desktop once built:
- **Host I/O bridges (P3, dominant):** `localStorage.setItem/getItem` ×4 (persistent KV),
  `window.confirm` ×4 (dialog), `window.setTimeout`/`requestAnimationFrame` (timers/scheduling),
  `navigator.clipboard.writeText` ×2, `new Date().getFullYear` (clock), `reader.readAsDataURL`
  (file), `videoRef.current.pause`/media. These need real `@importc` platform bridges (Harmony/
  Android native), NOT transpilation. Most scene handlers hit ≥2 of these → no single-bridge unlock.
- **Typed collections (P2):** `Map.has/get` (`worldBlocks`, `selectedPeerIds`), `Set.has`
  (`visibleWorldBlocks`), `.findIndex` (`placedCubes`), array-of-struct state — need typed slots +
  TypeMapper widening.
- **str/array method gaps (transpiler work):** `str.trim`, `/re/.test`, `.slice().map().join`,
  `Array.from`, `.forEach` — real but bounded transpiler additions.
- **async (P3):** 4 handlers `Promise<void>` (await I/O interleave).
- **const-arrow callee resolution:** ~11 callees are const-arrow helpers (`handleSendComment`,
  `persistDomain`, `appendLedger`, `loadData`, `validateAddress`…) — the dependency closure only
  follows NAMED functions; resolving const-arrows (via local_write→function_value) + injecting their
  free-vars would follow them, but they themselves bottom out in the host-I/O bridges above.
- **handler-name resolution gap:** 12/59 names don't resolve to a function-id (component-method or
  differently-defined) — a separate resolution fix.

**Spine status:** the spine (buildCompiledHandlerTable + runtime compiled: dispatch + codegen
injection + slot↔KV reconcile) is NOT yet built, BUT the mechanism it depends on is now PROVEN
end-to-end (see below). It needs cross-module dispatch design (the generated `__cht_apply` lives in
the app module; web_scene_runtime.cheng can't call it — the app-module `__csg_scene_apply_event_to_node`
ladder must read the node effect + try compiled: before the generic runtime apply).

## CHT mechanism PROVEN end-to-end to native code (2026-06-17) — keystone de-risk
The hardest, riskiest question ("can a real scene handler transpile to valid, compilable Cheng with a
real I/O bridge?") is now ANSWERED YES, with a compiled `.o` as evidence.
- **2 more transpiler features landed (6 total now):** (5) **host-capability bridges** — a new
  `hostBridges` map (method-path → flat extern name), 8th arg to transpileClosure, threaded through
  ChengFunctionTranspiler; `emitCall` maps e.g. `navigator.clipboard.writeText(x)` →
  `chengClipboardWriteText(x)` before failing; the dependency closure now includes externImpls bodies
  (calleeRe condition `|| externImpls.has`). (6) **unary-not parenthesization** — `!str.trim()` was
  lowered to `(!len(...) > 0)` = `(!len(...)) > 0` (precedence bug, would not typecheck); now
  `(!(len(...) > 0))`. Also confirmed `str.trim/toLowerCase/startsWith/endsWith/slice/includes` already
  work (jsStrTrim prelude etc.).
- **handleCopyDidBackup compiles to a native object.** Body: guard `if (!(len(jsStrTrim(payload))>0))
  return` + `chengClipboardWriteText(payload)` (bridge) + `setDidActionHint("…")` (state slot). The
  bridge extern is the FFI-correct wrapper (the C ABI rejects a Cheng `str` param — must be cstring):
  `@importc("cheng_host_clipboard_write_text") fn …_raw(text: cstring): void` +
  `fn chengClipboardWriteText(text: str) = …_raw(system.strToCStringTemp(text))`. Assembled module
  (transpiled handler + emitStateSlots(didActionHint) + bridge + entry) → `cheng.stage3 --emit:obj` →
  **exit 0, 4251-byte .o**; `nm`: `T _chengClipboardWriteText` defined, `U _cheng_host_clipboard_write_text`
  left for native linking. Generator: /tmp/snap/gen_selftest2.mjs; module: ts-csg/tmp/cht_selftest.cheng.
- **Coverage with host-bridges {clipboard, localStorage.get/set/remove, confirm, alert} + param-types:
  1/59 scene handlers fully compile (handleCopyDidBackup).** The localStorage/confirm handlers do NOT
  flip — they carry additional blockers (async ×4, more callees ×8, props/refs ×7, objects ×2,
  unresolved-param/freevar ×15, name-unresolved ×12). So compiled:1 is the immediate honest spine
  yield; each further handler needs its specific blocker class built (async, P2 collections/structs,
  ref modeling, name-resolution).

## Device deploy attempt — pipeline verified, black-screen cause isolated (2026-06-18)
Corrected an earlier wrong claim: **coldnow is NOT missing** — `bootstrap/cheng_cold` IS it. The CHT
scene runtime coldnow-compiles for `aarch64-unknown-linux-ohos` (13.4MB, has cheng_scene_media_es_open
+ __cht_apply + chengVideoPlay/Pause). Also implemented a **REAL Harmony clipboard bridge** (OH
pasteboard via UDMF native C API — oh_pasteboard.h/udmf.h/uds.h, libpasteboard+libudmf; not a stub).
Full deploy run on device 3KN0224C18003262:
- HAP built (CHT scene + video + clipboard bridges), installed, launched, process alive **3s CPU = no
  busy-loop** (coldnow fixed the stage3 busy-loop bug).
- BUT screen BLACK with my fresh census CHT scene (7.2MB). Isolated by a control build: the WORKING
  秒开 scene (5.6MB) + my source bridges + pasteboard dep RENDERS correctly (video card + play button +
  publish selector visible). So the pasteboard dep did NOT break .so load — **the black screen is the
  scene-generation mismatch**: my census scene (7.2MB, hand-written snapshot) ≠ the proven 5.6MB bundle.
- **Device restored** to the working 秒开 scene (renders). Repo binary assets restored from backup; the
  correct source bridges (cheng_gui_host.c video+clipboard, CMakeLists pasteboard/udmf) kept.
- **Root cause of the black screen = PWA growth, NOT CHT.** The snapshot auto-loads either way, so the
  current one-click scene is 7.2MB regardless; the working bundle is 5.6MB (built 6月16 from an older PWA
  state). The CHT delta in scene_data is ~6 effect strings (invoke→compiled) — it cannot black-screen a
  7.2MB scene that the 5.6MB-era version rendered, and the coldnow .so (+ bridges + pasteboard) is
  IDENTICAL between the build that rendered (5.6MB scene) and the one that didn't (7.2MB scene). So the
  current full UniMaker PWA scene (7.2MB) has a device-render regression independent of CHT.
- **CHT-video tap-verify on device is therefore blocked by that pre-existing current-PWA render issue**,
  not by anything in the CHT/bridge work (which is verified: compiles, coldnow-builds, bridges link,
  pipeline renders for a good scene). To unblock: fix the current PWA scene's device rendering (debug why
  the 7.2MB scene black-screens — separate from CHT), then redeploy with CHT and tap-verify play/pause.

## Visible-playback path mapped (media surface wired; needs MoQ publisher) (2026-06-18)
To make the video PIXELS actually play on device (the practical 设备真跑), content media must use the
`p2pmedia://` scheme (csg-web-materializer.ts:2078 staticIsP2PMediaUri) so the materializer emits a
fetching MEDIA SURFACE (not the plain image atlas — progress.md:514). Fixed the test snapshot
(tmp/unimaker-pwa-content-snapshot.json) video/image media to `p2pmedia://...`; regenerated → 196
media-surface refs in the scene runtime (was 0) + media assets embedded (runtime/media/assets/*.mp4,*.png).
Deployed: scene renders (status=0 layers=2), `ChengMD: DRAW_REGISTERED` path active. BUT remaining for
actual pixels:
- Home feed shows `wordcount=0 count=0 drawn=0` — no media-surface draw commands present on route 0 yet
  (known feed media-surface plumbing area; progress.md homeRootSlots/commands issues).
- The host (cheng_gui_host.c prepare_media_surface_texture) FETCHES the video from a hardcoded network
  endpoint `192.168.1.3:38000` / cache `xdev_fetched.mp4` (the 秒开 cross-device path) — it does NOT use
  the embedded rawfile media asset. Mac is 192.168.1.2; no MoQ publisher running.
- So visible playback = the 秒开 MoQ streaming system: a publisher (麦田) at the device's fetch endpoint
  (fix host .3→.2 or run publisher at .3) + the feed media-surface presentation. This is a substantial
  separate integration (the 5.6MB 6-16 demo had it working cross-device Android→Harmony).
The CHT video HANDLER itself is already device-tap-verified (below) independent of pixel playback.

## ✅ DEVICE TAP-VERIFIED: CHT video handler runs on Harmony device (2026-06-18)
The black screen is FIXED and the compiled video handler executes on the physical device.
- **Root-cause fix (no fallback):** csg-web-materializer.ts emitSceneNodePaintEntries (~18138) emitted an
  `image` paint op for EVERY non-svg image src — INCLUDING ones whose `decodeStaticImageSource` failed
  (symbolic srcs like "poster"/"maitian"/"wechatQr"/"alipayQr" with no static bytes). The paint then
  referenced a pixel-less resource → runtime image-atlas miss (811) → GPU compositor hard-fail → 0
  layers → black. Fix: only emit the `image` paint when the image actually decodes to a raster PNG
  (matching the established collectImageStyle:19532 guard which already skips undecodable srcs). An
  undecodable image has no raster to paint; skipping it is correct, not a fallback.
- **Device result:** regenerated CHT scene (--mobile-scene-initial-route publish_content --viewport
  1024x768) + coldnow obj + HAP → deployed. ChengGuiDiag `status=0 step=85000 layers=2 glyphFail=0`
  (RENDERS). Scene interactive (➕ opened the publish selector). Navigated feed→video-detail
  (handleOpenFeedCard route), tapped the video → **`ChengCHT: cht video bridge: play`** logged on
  device (PID 56131). Tap → compiled handleVideoToggle → __cht_apply → chengVideoPlay → native
  cheng_host_video_play, end-to-end on device 3KN0224C18003262. App healthy (no faultlog; relaunches +
  renders). This satisfies 设备真跑 + 视频路径 handler.
- Note: the actual video pixels don't play (my minimal snapshot's "maitian" isn't a deployed MoQ stream)
  — but the HANDLER + native bridge fire correctly; real playback is the separate MoQ-streaming asset path.
- Also added instrumented ChengGuiDiag glyph/svg fail fields to cheng_gui_host.c (~5961) for the diagnosis.

## EXACT black-screen cause: image-atlas miss (code 811, node 113) (2026-06-18, device-instrumented)
Added glyph/svg-fail fields to the ChengGuiDiag tick emitter (cheng_gui_host.c ~5961, via the dlsym'd
cheng_app_debug_glyph_atlas_fail_* accessors) and deployed the 7.2MB CHT scene. Device logged:
`status=2 step=84500 layers=0 needs=1 glyphFail=811 route=0 node=113 ord=0 cp=-1 svgFail=0`.
**Code 811 = IMAGE resource missing** (web_scene_runtime.cheng: WebSceneImageAtlasTextureIdForResource
returned <=0 for node 113's image paint) — NOT a glyph miss. The scene has 6759 nodes / 80 embedded
resources (one-click.summary.json scene.resources=80); node 113 (route 0 / home_default) has an image
paint whose resourceId is not covered by the runtime-built image atlas (WebSceneBuildImageAtlasFromResources,
scene-runtime-smoke-source.mjs:2327). So the current tool emits an image node whose resource isn't
embedded/covered — a regression in image-resource collection/embedding between a971c7510 and HEAD,
independent of CHT (CHT only adds ~6 'compiled:' effect strings). The 5.6MB 6-16 scene rendered image
cards fine. **Next focused fix:** find node 113's image resourceId + why it's not among the 80 embedded
resources (materializer image-resource collection path), ensure it's embedded/covered; then the current
scene renders and CHT video can be deployed + tap-verified. Device left restored to working 秒开.

## RESOLVED: data recovered, device restored; black screen = TOOL regression (2026-06-18)
- **Data loss recovered:** the exact 5.6MB working scene_data was NOT lost — it survived at
  /tmp/snap/scene_data.bin (5,598,774B, CSD1, 6月16 13:54), with /tmp/snap/glyph.bin (32MB) +
  scene_app_oh_es.o (13.98MB). Durable backup → ~/cheng_miaokai_6yue16_backup/.
- **Device restored + renders:** redeployed the recovered working 秒开 bundle (es-obj + 5.6MB scene +
  glyph). ChengGuiDiag `status=0 step=85000 layers=2 needs=0`; screenshot shows the full UniMaker feed
  (video cards + ➕ publish nav). Device is back to working.
- **Black screen root cause = a cheng-lang TOOL regression, NOT CHT, NOT flags.** Recon (wf) + on-device
  tests proved: the CURRENT tool's 7.2MB scene → status=2/layers=0 (GPU compositor build fails on a
  per-node atlas miss) EVEN regenerated with the working build's flags (--mobile-scene-initial-route
  publish_content --viewport 1024x768) — still 7.2MB, still black. The 6-16 tool (a971c7510) produced the
  5.6MB scene that renders. So the regression is in the cheng-lang generator/materializer between
  a971c7510 and HEAD (committed csg-core/tools/csg binary 5c78e02→1e911bd + materializer changes), which
  grew the scene 5.6→7.2MB and broke GPU-build atlas coverage. CHT's own scene_data delta is ~6 strings
  and is NOT the cause (verified: same .so renders 5.6MB, blacks 7.2MB).
- **CHT video handler remains build-verified** (compiles, coldnow obj for OH target, video + real OH
  pasteboard/UDMF clipboard bridges link, HAP builds). Tap-verify on device is blocked ONLY by the tool's
  scene-render regression.
- **Direction (from the workflow):** to land CHT-video tap-verify, fix the tool regression — bisect
  cheng-lang a971c7510..HEAD (start f7c38b4d2 which touched csg-core/tools/csg) for the generator/materializer
  change that broke the GPU compositor build (atlas coverage), via non-destructive worktrees
  (git worktree add --detach /tmp/cheng-616 a971c7510; PWA @ 1b8e00a). Then regenerate with CHT + deploy + tap.

## Black screen DIAGNOSED + a data-loss to flag (2026-06-18, device) [superseded — data WAS recoverable; see above]
On-device hilog (domain A0C0DE) shows the native host fully working: XComponent OnSurfaceCreated
(1316x2598), rawfile reads OK (scene_data + glyph CRC pass), cheng_app_init, "render loop begun".
Then `ChengGuiDiag: tick status=2 step=84500 layers=0 needs=1` — **the 7.2MB scene lays out to ZERO
render layers** (render thread spins ~22s CPU drawing nothing → black). Route is home_default (present,
92 nodes) — not a route issue. So the black screen is a **layout regression in the CURRENT UniMaker PWA's
home_default scene** (6月16's 5.6MB scene rendered; today's 7.2MB lays out to 0 layers), INDEPENDENT of
CHT / the .so / coldnow / assets (all verified working).
- **DATA LOSS (my error, must fix):** while deploying I overwrote the working 5.6MB
  rawfile/runtime/unimaker_scene_data.bin and removed the backup. It is gone from the Mac (not in git —
  untracked; my rebuilds overwrote the 6月16 HAP). Its matching scene_app_oh_es.o (13983629B) survives at
  /tmp/snap/scene_app_oh_es.o but is useless without the 5.6MB scene_data (CRC). Regenerable ONLY from the
  6月16 UniMaker PWA state. The device currently holds my black-screen CHT build.
- **Recovery:** (a) regenerate the working bundle from the 6月16 UniMaker PWA git state + scene_app_oh_es.o,
  or (b) debug the current PWA's 0-layers home_default layout regression (PWA-side, deep). CHT video
  tap-verify can only happen after the scene renders again.

## Video device-build FULLY verified (both halves compile for OH target) (2026-06-17)
- Scene runtime (with compiled handleVideoToggle) → `cheng.stage3 --emit:obj --target:aarch64-unknown-linux-ohos`
  exit 0, 13.4MB; nm: T __cht_apply/chengVideoPlay/chengVideoPause, U cheng_host_video_play/_pause.
- `cheng_gui_host.c` (with the s_stream_paused gate + cheng_host_video_play/pause real impls) → OH NDK
  clang (`aarch64-unknown-linux-ohos-clang --sysroot=<DevEco OH sysroot> -D_GNU_SOURCE`) exit 0, 221KB;
  nm: T cheng_host_video_play/_pause. So the scene's undefined video symbols resolve to these at HAP link.
- cheng_gui_host.c is the working source (the 秒开 commit 238653de6 hand-edited it directly; build_gui_host.sh's
  "do not edit" header is stale — s_stream_play_base_ns etc. live only here, committed). My edits are correctly placed.
- Both devices connected (hdc: Harmony 3KN0224C18003262; adb: Android GBJ0222B24021692).
- **Remaining for actual on-device play/pause = the physical deploy:** replace prebuilt/scene_app_oh.o with the
  CHT build (CONSENT — it's the committed working device artifact; back up first), build HAP (DevEco/hvigor — no
  hvigorw in ChengGuiDemo), hdc install + launch + tap the 麦田 video. Needs the user (tap + DevEco). Android
  needs the same video bridge in mobile_shell_codegen.cheng (the Android host generator) — follow-up.

## Functional updaters landed → handleSettingsToggle compiles (3 handlers, 2026-06-17)
`setX(prev => expr)` now compiles. Transpiler emitCall intercepts a state-setter call whose single
arg is a 1-param arrow (before the arg loop that would fail on the function_value): inlines the arrow
body with `prev` bound to the current state value — a typed input named after the state. The CHT
builder appends state X as a free-var (read from KV) for each `setX(function_value)` it finds. Also
fixed `resolveArrowReturnExpr`: it bailed on an expression-bodied arrow whose return value is itself a
STATEMENT-kind op (ConditionalExpression) — now skips the op that IS the return value. Verified:
`fn handleSettingsToggle(activeTopView: str) = var __t1_tern=""; if (activeTopView=="main"): __t1_tern="settings"
else: __t1_tern="main"; setActiveTopView(__t1_tern)` — faithful. Census: compiled 3 [handleVideoToggle,
handleSettingsToggle, handleCopyDidBackup], invoke 394→393, set/route/toggle/text_input/no_op stable,
M2 407 lines, csg-web smoke passes, full runtime --emit:obj exit 0. (The other 2 function_value handlers
have additional blockers — long tail confirmed: ~1 handler per feature.)

## Phase 1/2 device-readiness verified + Phase 3 measured as a long-tail swamp (2026-06-17)
- **FirstBinary operator fix** (transpiler): TS reverse-maps LessThanToken(30) to its alias
  "FirstBinaryOperator"; added it to BINARY_OPERATOR_MAP (`<`) + the bool-type comparison list.
  Correct (no regression) but doesn't fully unlock handleCreateGroup/handleTransferDomain — they hit
  the NEXT blocker. census stable: compiled 2, invoke 394, set 449/route 241/toggle 34/text_input 29/
  no_op 45. csg-core + csg-web smokes pass.
- **Device-readiness (Harmony):** the CHT scene runtime (with the compiled handleVideoToggle) compiles
  for the device target `aarch64-unknown-linux-ohos`: `cheng.stage3 --emit:obj` exit 0, 13.4MB obj;
  nm: T __cht_apply / chengVideoPlay / chengVideoPause defined, U cheng_host_video_play / _pause
  (now defined in cheng_gui_host.c — they resolve at the HAP link). So the device scene side + native
  bridges are ready. Remaining for an actual on-device play/pause: OH-NDK HAP build (hvigor) + replace
  prebuilt/scene_app_oh.o (regenerated by the build) + hdc deploy to device 3KN0224C18003262 + tap the
  麦田 video — needs the physical device + DevEco toolchain (NOT done here; do not overwrite the
  prebuilt .o without consent).
- **Phase 3 measured = deep long-tail swamp (no cheap batch).** Over the 57 distinct invoke handlers
  with current features (bool slots + void operand + ref deref + bridges + FirstBinary): 0 compile
  zero-param, 0 with real-param. First-blocker histogram: prop ×8, async ×4, function_value (inline
  closures / functional updaters) ×3, object ×2, then a long tail of singletons (refs, STORAGE_KEYS
  object member, window.confirm, commentText.trim, amount.toFixed, async IIFEs, ...). Each handler has
  3-5 COMPOUNDING blockers — no single transpiler feature unlocks one. Grinding individual features is
  low-ROI; broad coverage needs the R2C compiler path (src/r2c, the more complete compilation model the
  handlePublish recon identified). Scripts: /tmp/snap/rank2.mjs, probe_blockers.mjs. Recon: tasks/w2j69u3m3.output.

## Phase 2 — video handler handleVideoToggle compiled through CHT (2026-06-17, verified)
The user's core goal (video play/pause as pure-Cheng) now compiles end-to-end. 4 new capabilities:
- **bool state slots/free-vars** (CHT builder): str↔bool reconcile through the str KV — bool free-var
  reads `(WebSceneStateValueForRef(...) == "true")`, bool slot writes via a generated `chtBoolToStr`.
  CHT_SLOT_TYPES = {str, bool}. (int64 next.)
- **VoidExpression operand** (csg-core.ts:1756 + transpiler): `void EXPR` was lowered as a bare
  expressionKind with the operand DROPPED (extractor catch-all). Now lowers the operand; the
  transpiler emits it for its side effect (`void videoRef.current.play()` → the bridged play call
  survives; an async IIFE arrow still fails honestly).
- **host-object ref deref** (transpiler hostObjects, 9th arg to transpileClosure): a bridged useRef
  (videoRef/containerRef) — `videoRef.current` reads as `true` (present by bridge contract, used in
  guards), `videoRef.current.method()` resolves through hostBridges by full callee path. Never a value.
- **video host bridges**: CHT_HOST_BRIDGES += videoRef.current.play→chengVideoPlay,
  .pause→chengVideoPause; @importc no-arg void wrappers; videoRef/containerRef in CHT_HOST_GLOBALS.
- **native C (real, Harmony host)**: cheng_gui_host.c gained `s_stream_paused`/`s_stream_pause_started_ns`
  + `cheng_host_video_play()`/`cheng_host_video_pause()` that gate the wall-clock play-clock advance
  (freeze frame on pause; on resume shift s_stream_play_base_ns by paused duration → no time jump);
  the draw loop (cheng_android_draw_media_surface, both surface + CPU paths) skips frame-consume when paused.
- **VERIFIED:** generated `fn handleVideoToggle(videoRef: str, isVideoPlaying: bool) = if isVideoPlaying:
  chengVideoPause() else: chengVideoPlay(); setIsVideoPlaying((!(isVideoPlaying)))` — faithful. Census:
  compiled 2 handlers [handleVideoToggle, handleCopyDidBackup], compiled:5 nodes, invoke 398→394, no
  regression (M2 407 lines). Full scene runtime compiles: --emit:obj exit 0, 13.3MB .o; nm: T _chengVideoPlay/
  _chengVideoPause defined, U _cheng_host_video_play/_pause for native link. csg-core + csg-web smokes pass.
- **Remaining for device run:** clipboard native (Harmony NAPI @ohos.pasteboard via cheng_gui_entry.cpp /
  Android JNI in mobile_shell_codegen.cheng) for handleCopyDidBackup; build+deploy HAP and tap-verify
  play/pause on the 麦田 video. Phase 3 (more handlers: real-param + localStorage + functional-updater) and
  Phase 4 (handlePublish via R2C host contract) per the recon (tasks/w2j69u3m3.output).

## CHT SPINE BUILT + verified end-to-end (2026-06-17)
The spine is now wired into the production pipeline and PROVEN to compile to native code.
- **`buildCompiledHandlerTable(coreFacts, sceneFacts)`** in scene-runtime-smoke-source.mjs: resolves
  each `invoke:<name>` scene handler → fnId, transpiles with host-bridges + state-setters + free-var
  typing; compiles only honest candidates (zero real-params, free-vars are str-state [→KV] or bridged
  host globals [→""], str slots only, full transpile success — never fabricates a value). Emits the
  merged handler module (dedup top-level defs) + emitStateSlots + a `__cht_apply(graph, effect): int32`
  dispatcher (load slots from KV → call → write dirty slots back), and REWRITES compiled handlers'
  effect `invoke:`→`compiled:` in-place on sceneFacts before serialization.
- **Runtime dispatch:** `emitSceneMobileRuntimeSource` gained a `compiledHandlerCode` option — injects
  the module at end + a CHT-first branch in the app-module `__csg_scene_apply_event_to_node` ladder
  (reads node effect via WebSceneFindEventHandlerForNodeEvent + WebSceneEventHandlerEffectAt, calls
  `__cht_apply` before the generic scalar apply). web_scene_runtime.cheng treats `compiled:` as inert
  in both segment parsers (defensive — same as invoke: was on non-CHT paths; no regression).
- **unimaker-one-click.mjs:** calls buildCompiledHandlerTable before bin serialization, passes
  compiledHandlerCode.
- **VERIFIED:** census `compiled:1` (handleCopyDidBackup), `invoke 399→398`, all other prefixes
  byte-identical (set 449/route 241/toggle 34/text_input 29/no_op 45 — total conserved, no regression).
  Full 60227-line scene runtime compiles: `cheng.stage3 --emit:obj` exit 0, 13.3MB .o; `nm`:
  `T ___cht_apply`, `T _chengClipboardWriteText`, `U _cheng_host_clipboard_write_text` (links at native
  host). The Cheng side is COMPLETE; the only undefined symbol is the real platform clipboard.
- **To run on device:** provide `cheng_host_clipboard_write_text(const char*)` in each native host
  (darwin NSPasteboard / Harmony OH pasteboard / Android ClipboardManager via JNI). Adding more
  handlers is now purely additive through the same spine as bridges/transpiler-features land
  (next high-value: media play/pause via the existing cheng_gui_host.c decoder for the video path).

(historical) Remaining to land compiled:1 in the PRODUCT (the spine, now de-risked + clearly worth it):
1. `buildCompiledHandlerTable(coreFacts, sceneFacts)` in scene-runtime-smoke-source.mjs: for each
   `invoke:<name>` handler, attempt transpile (host-bridges + param-types(str) + state-setters +
   free-var typing via emitStateSlots/const); collect fully-compiling ones (today: handleCopyDidBackup);
   emit slots + handler bodies + bridge wrappers + a `__cht_apply(graph, handlerId): int32` dispatcher
   that loads the handler's slots from the KV, calls it, writes dirty slots back
   (WebSceneSetStateValueInternal); REWRITE those facts' effect `invoke:`→`compiled:`.
2. Runtime: app-module `__csg_scene_apply_event_to_node` reads the node effect (add a runtime accessor
   if none) and, on `compiled:<name>`, calls `__cht_apply` before the generic apply.
3. Native C: real `cheng_host_clipboard_write_text` (darwin NSPasteboard / Harmony pasteboard / Android
   ClipboardManager) — desktop --emit:obj verifies compile with the symbol undefined; device run needs it.
4. Verify: full 60153-line scene runtime compiles (--emit:obj, already verified to work) + census shows
   compiled:1, invoke 399→398.
Fails bucket: io_async 20, callee 9 (= 29 I/O handlers), freevar 17, obj_array 2, other 17.
Free-var classification across all handlers: 53 distinct I/O free-vars (setters/refs/services/host
objects) vs a typeable-scalar-state subset that is small once host/built-ins (Array/Promise/URL/
localStorage/navigator/Capacitor) and leaked locals (err/i/idx/result/resolve) are excluded. Perfect
scalar free-var typing lifts the ceiling to maybe ~5-15, but each must also be I/O-free.
**CONCLUSION (first-principles): P1-alone is near-worthless for this corpus — it is I/O-dominated.
P1 and P3 are inseparable; the real coverage path is P3 native I/O bridges, which the CHT spine then
consumes. Building the full spine plumbing (materializer-emit + runtime-dispatch + codegen + device)
to execute ~1-5 pure handlers is path-suboptimal. Recommend P3-bridge-first.** Census unchanged after
all three transpiler fixes (set 449/route 241/toggle 34/text_input 29/no_op 45/invoke 399 = no
regression; the transpiler is not yet wired into one-click, so production materialize is untouched).
Measurement scripts: /tmp/snap/cht_p2.mjs, dump3.mjs, freevar_probe.mjs.

## Param-switch fold landed → 65.4% (2026-06-17, census-verified, honest)
`sceneEventStateDeltasFromHandlerBody` now constant-folds `if(param===LIT){set*;return} ...` chains
when `param` is a per-node static (e.g. handleMorePanelAction(entry.key)): picks the branch whose
literal === the node's resolved param value (the branch that deterministically runs), emits its
effects ONLY if the branch body is purely set*+return — descends nested `block` ops via `nestedBlock`,
and BAILS to invoke on any non-setter call / `expression` (void I/O) / `property_write` / nested
control flow (never fabricates). Census: set 441→449 (+8), invoke 409→399; route/toggle/text_input/
no_op unchanged (no regression). Verified honest: redPacket→set:showRedPacketModal=true,
location→set:showLocationModal=true (match source); voiceCall (handleSendVideoInvite I/O)→invoke.
Coverage 64.7%→**65.4%**.

## Bounded-static wins EXHAUSTED at 64.7% (2026-06-17, census-verified) [superseded by param-switch fold above]
P0 (text_input 29 + no_op 45) → 64.5%. Functional-toggle `setX(p=>!p)`→`toggle:` (+2) → 64.7%
(toggle 34, invoke 407; set/route/text_input/no_op unchanged = no regression). The 407 remaining
invoke handlers have NO further safe static shortcut — verified by full categorization + real
helper-body inspection:
- ~86 gestures (pointer/drag) → P4 (runtime pointer state + fixed-point coords).
- ~116 helper-calls (handleVideoToggle/handleSendComment/handleLike/handleFullscreen…) whose bodies
  are I/O-DOMINATED: `videoRef.current.play()/pause()` (DOM media), `requestFullscreen()`, async
  `addDistributedContentComment`/`setDistributedContentLike` (network). These need **P3 native
  bridges** (real Cheng impls of video control / network like-comment / fullscreen), NOT transpilation.
- rest: object-spread/array/Map state (P2), ref guards, ternary w/ Number()/parseFloat (float tail).
Each class = a months-scale subsystem. There is NO quick path to "near 100%"; it is the P1-P5 build.

Contract: no fallback / no fabricated effects. Device-gated: census + route-stable +
total-conserved (1217) + real-device pixel/interaction.
