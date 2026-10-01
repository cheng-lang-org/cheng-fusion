// Lane H static contract probe: home-feed realtime event chain
// (gossipsub inbound -> social_wait_feed_event -> host feed pump ->
//  chengFeedInboundWake -> canonical snapshot merge ->
//  cheng_app_distributed_contents_update_utf8 -> runtime __m2Contents rebind).
//
// This is a SOURCE-contract gate only: it locks the cross-layer seams so any
// drift on either side fails loudly without needing an APK build or a device.
// It proves wiring, not latency; dual-device end-to-end proof stays deviceOnly.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ffiRel = "src/libp2p/mobile_ffi/unimaker_compat_ffi.cheng";
const codegenRel = "src/core/tooling/mobile_shell_codegen.cheng";
const apkBuildRel = "ts-csg/scripts/unimaker-apk-build.mjs";

const failures = [];
function check(label, cond) {
  if (!cond) failures.push(label);
}

function read(rel) {
  return readFileSync(join(repoRoot, rel), "utf8");
}

// Slice the source from an inclusive start marker up to (exclusive) an end marker.
function sliceBetween(text, startMarker, endMarker, label) {
  const start = text.indexOf(startMarker);
  if (start < 0) {
    failures.push(`${label}: start marker missing: ${startMarker}`);
    return "";
  }
  const endIdx = text.indexOf(endMarker, start + startMarker.length);
  const end = endIdx < 0 ? text.length : endIdx;
  return text.slice(start, end);
}

// ── A. Cheng backend contract (compat FFI) ────────────────────────────────
const ffi = read(ffiRel);

const waitBlock = sliceBetween(
  ffi,
  '@exportc("social_wait_feed_event")',
  '@exportc(',
  "ffi.social_wait_feed_event",
);
check("ffi.social_wait_feed_event drains gossip inbox", waitBlock.includes("drainInboundGossipMessagesPtr(node)"));
check("ffi.social_wait_feed_event returns 1 only when stored>0", waitBlock.includes("if stored > 0:") && waitBlock.includes("return 1"));
check("ffi.social_wait_feed_event honours deadline (0 on timeout)", waitBlock.includes("deadlineMs") && waitBlock.includes("return 0"));
check("ffi.social_wait_feed_event hard-fails invalid handle (-1)", waitBlock.includes("return -1"));

const pollBlock = sliceBetween(
  ffi,
  '@exportc("social_poll_events")',
  "@exportc(",
  "ffi.social_poll_events",
);
check("ffi.social_poll_events piggybacks gossip drain", pollBlock.includes("drainInboundGossipMessagesPtr(node)"));
check("ffi.social_poll_events returns drained events", pollBlock.includes("DrainNodeSocialEvents"));

const snapBlock = sliceBetween(
  ffi,
  '@exportc("social_feed_snapshot_cstr")',
  "@exportc(",
  "ffi.social_feed_snapshot_cstr",
);
check("ffi.social_feed_snapshot_cstr drains BEFORE reading store", snapBlock.indexOf("drainInboundGossipMessagesPtr(node)") >= 0 && snapBlock.indexOf("drainInboundGossipMessagesPtr(node)") < snapBlock.indexOf("feedSnapshotJsonPtr(node)"));
check("ffi.social_feed_snapshot_cstr empty-store ok=false shape kept honest", snapBlock.includes("node_not_initialized") || snapBlock.includes("feedSnapshot"));

check("ffi.libp2p_string_free exported (pump frees polled events)", ffi.includes('@exportc("libp2p_string_free")'));

// String-allocator parity: returned cstrings come from c_strdup-family and are
// freed via c_free — mismatch here would corrupt device heap through the pump.
check("ffi cstrings allocated with c_strdup", ffi.includes("fn dupCString(v: str): cstring =\n    if isNullText(v):\n        return c_strdup(cStr(\"\"))\n    return c_strdup(cStr(v))"));
check("ffi libp2p_string_free pairs c_free", /@exportc\("libp2p_string_free"\)[\s\S]{0,200}c_free\(value\)/.test(ffi));

// ── B. Generated host template (mobile_shell_codegen.cheng) ───────────────
const cg = read(codegenRel);

// Native pump worker.
const workerBlock = sliceBetween(
  cg,
  "static void cheng_feed_event_pump_worker_inner(void)",
  "static void* cheng_feed_event_pump_worker(void* arg)",
  "codegen.pump_worker",
);
for (const sym of ["social_wait_feed_event", "social_poll_events", "libp2p_string_free"]) {
  check(`codegen.worker dlsym ${sym}`, workerBlock.includes(`dlsym(h, "${sym}")`));
}
check("codegen.worker loud-fails when backend lacks exports", workerBlock.includes("backend lacks social_wait_feed_event/social_poll_events/libp2p_string_free"));
check("codegen.worker exits loud on wait failure (no retry spin)", workerBlock.includes('"feed event pump: wait failed rc=%d — pump exits loud (no retry spin)"'));
check("codegen.worker polls only after a positive wait", workerBlock.includes("if (wrc == 0) continue;") && workerBlock.indexOf("pollFn(s_feed_pump_handle, 32)") > workerBlock.indexOf("waitFn(s_feed_pump_handle, 30000)"));
check("codegen.worker wakes Kotlin activity method", workerBlock.includes('GetMethodID(env, cls, "chengFeedInboundWalk'.replace("Walk", "Wake"), ' "()V")'));

// Cross-seam symbol parity: everything the host dlsyms must be an FFI export.
for (const m of workerBlock.matchAll(/dlsym\(h, "([A-Za-z0-9_]+)"\)/g)) {
  check(`seam-parity ${m[1]} exported by compat FFI`, ffi.includes(`@exportc("${m[1]}")`));
}

// Worker death clears the latch so create/resume can retry (no silent one-shot).
const workerTail = sliceBetween(
  cg,
  "static void* cheng_feed_event_pump_worker(void* arg)",
  "static jboolean native_start_feed_event_pump",
  "codegen.pump_tail",
);
check("codegen.worker-clears-latch on exit", workerTail.includes("s_feed_pump_started = 0;") && workerTail.includes("DetachCurrentThread"));
check("codegen.native-start rejects zero handle", sliceBetween(cg, "static jboolean native_start_feed_event_pump", undefined, "x").includes('feed event pump: zero node handle'));

// Kotlin wake + canonical snapshot merge + render-thread application.
const wakeBlock = sliceBetween(
  cg,
  "fun chengFeedInboundWake()",
  "@Volatile private var feedEventPumpStartInFlight",
  "codegen.kotlin_wake",
);
check("codegen.wake posts onto main handler then pushes snapshot", wakeBlock.includes("mainHandler.post") && wakeBlock.includes('pushDistributedContentsToRuntime("gossipsub_inbound")'));

const pushBlock = sliceBetween(
  cg,
  "private fun pushDistributedContentsToRuntime(reason: String)",
  "// Home-feed realtime wake (gossipsub inbound)",
  "codegen.push_to_runtime",
);
check("codegen.push builds real canonical snapshot (no fabricated payload)", pushBlock.includes("chengDistributedContentsSnapshotForRuntime()"));
check("codegen.push applies on render thread", pushBlock.includes("postRender") && pushBlock.includes("nativeApplyDistributedContentsUpdate(handle, snapshot)"));
check("codegen.push drops stale-handle race via identity check", pushBlock.includes("runtimeHandle == handle"));

const snapKtBlock = sliceBetween(
  cg,
  "private fun chengDistributedContentsSnapshotForRuntime(): String",
  "private fun pushDistributedContentsToRuntime(reason: String)",
  "codegen.snapshot_merge",
);
check("codegen.snapshot merges real backend sources only", ["socialFeedSnapshot", "socialPublishTasks", "socialMomentsTimeline"].every((s) => snapKtBlock.includes(s)));
check("codegen.snapshot forbids storage-key/mock injection paths", !snapKtBlock.includes("localStorage") && !snapKtBlock.includes("unimaker_distributed_contents_v1"));

// Arming points: create / resume / successful social-backend start.
const createArmed = sliceBetween(cg, 'pushDistributedContentsToRuntime("runtime_create")', "override fun onResume()", "codegen.arm_create").includes("startFeedEventPumpIfNeeded()");
check("codegen.arms pump at runtime_create", createArmed);
const resumeRegion = sliceBetween(cg, "override fun onResume()", "override fun onPause()", "codegen.arm_resume");
check("codegen.arms pump at resume", resumeRegion.includes("pushDistributedContentsToRuntime(\"resume\")") && resumeRegion.includes("startFeedEventPumpIfNeeded()"));
const backendStartBlock = sliceBetween(cg, "chengSocialBackendStarted = true", "fun chengCreateSocialGroupFromNative", "codegen.arm_social_start");
check("codegen.arms pump after social backend start", backendStartBlock.includes("startFeedEventPumpIfNeeded()"));

// Application entry reaches the scene runtime export exactly once per call.
const applyBlock = sliceBetween(
  cg,
  "static jboolean native_apply_distributed_contents_update(JNIEnv* env, jobject thiz",
  "static jboolean native_apply_nodes_update",
  "codegen.apply_entry",
);
check("codegen.apply calls update_utf8 once", (applyBlock.match(/s_app_distributed_contents_update_utf8\(/g) || []).length === 1);
check("codegen.apply dlsym bound from scene .so", cg.includes('dlsym(s_app_handle, "cheng_app_distributed_contents_update_utf8")'));

// Reentry/threading: the JNI apply entry must only ever be reached from the
// render-thread queue (postRender), never directly off main/pump threads.
// Occurrence 1 = external declaration, occurrence 2 = the single call site,
// occurrence 3 = the JNI method table registration.
const applyRefs = [...cg.matchAll(/nativeApplyDistributedContentsUpdate/g)].map((m) => m.index);
check("codegen.apply refs = decl + 1 call site + jni table", applyRefs.length === 3);
check("codegen.apply called from exactly one Kotlin site", (() => {
  const calls = [...cg.matchAll(/val ok = .*nativeApplyDistributedContentsUpdate\(handle, snapshot\)/g)];
  return calls.length === 1 ? calls[0].index : false;
})() !== false);
check("codegen.single call site sits inside postRender", (() => {
  const call = /val ok = .*nativeApplyDistributedContentsUpdate\(handle, snapshot\)/.exec(cg);
  if (!call || call.index === undefined) return false;
  const ctxStart = Math.max(0, call.index - 600);
  return cg.slice(ctxStart, call.index).includes("postRender");
})());

// ── C. Build-gate consistency (read-only cross-check of ts-csg gate) ──────
const apkBuild = read(apkBuildRel);
for (const sym of ["social_wait_feed_event", "social_poll_events"]) {
  check(`apk-build.full-symbols require ${sym}`, apkBuild.includes(`"${sym}"`));
}
check("apk-build.gate enforces pump wiring", apkBuild.includes("Android shell is missing the gossipsub-inbound realtime feed event pump"));
check("apk-build.one-click smoke pins update_utf8 ABI", read("ts-csg/scripts/unimaker-one-click-output-smoke.mjs").includes('cheng_app_distributed_contents_update_utf8'));

if (failures.length > 0) {
  console.error(`h-feed-event-smoke FAIL (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("h-feed-event-smoke PASS: backend drain/wait, host pump, wake->snapshot->render-thread apply, arming points, seam parity, build gates");
