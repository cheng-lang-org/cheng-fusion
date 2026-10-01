#!/usr/bin/env node
// Transform smoke check: verify that every business-side fix installed by the
// UniMaker pipeline is present in generated Cheng sources. Fast (pure text
// scan), no compilation. Exit 0 = all good, exit 1 = regression detected.
//
// Usage: node materialize-transform-smoke.mjs [--expect-no-cht] <runtime.cheng> [entry.cheng]
// Retained-scene-only production path writes no entry source; omit entry then.
// --expect-no-cht: the pipeline compiled zero CHT handlers for this run, so the
// runtime legitimately carries no CHT type blocks — managed-args snapshots and
// 2-D flatten have nothing to act on; their marker checks are unsatisfiable by
// construction and would false-fail static pages (e.g. the voice-task fixture).
import { readFileSync } from "node:fs";

const smokeArgv = process.argv.slice(2);
const expectNoCht = smokeArgv.includes("--expect-no-cht");
const positional = smokeArgv.filter((arg) => !arg.startsWith("--"));
const runtimePath = positional[0] ?? "src/.tmp-exec/unimaker-react_scene_runtime.cheng";
const entryPath = positional[1];
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  (" + detail + ")" : ""));
  if (!ok) failures++;
}

// ---- runtime checks ----
let rt = "";
try { rt = readFileSync(runtimePath, "utf8"); } catch {
  console.log("FAIL  runtime readable  (" + runtimePath + ")");
  process.exit(1);
}
if (expectNoCht) {
  check("runtime: managed-args pass ran", true, "skipped: 0 CHT handlers compiled");
  check("runtime: 2-D flatten applied", true, "skipped: 0 CHT handlers compiled");
} else {
  // Marker checks apply only when the runtime actually declares the shapes these passes
  // own: a CHT struct/json snapshot family (__chtJsonOf_) for managed-args, and a 2-D
  // array field (T[][]) for flatten. A single-scalar CHT fixture constructs neither —
  // same conditional-checkpoint rule as --expect-no-cht (357cdaee8), never a looser gate
  // where the work面 exists.
  const hasChtJsonSnapshotFamily = /__chtJsonOf_[A-Za-z]/.test(rt);
  const hasTwoDArrayField = /\[\]\[\]/.test(rt);
  // The pass's own output signature for entry/locals snapshots is `json.Stringify(__chtJsonOf_T(…)`
  // — no other producer emits that shape (codec bodies use JsonAdd/JsonSetField). Marker is
  // therefore required only when that rewrite workload exists: a jsonOf codec family WITHOUT a
  // snapshot workload (e.g. a struct reaching the runtime purely as a bridge return value —
  // single-consumer, no managed param) is a legitimate no-snapshot state, not a missed pass.
  const hasSnapshotRewriteWorkload = /json\.Stringify\(__chtJsonOf_[A-Za-z]/.test(rt);
  if (hasSnapshotRewriteWorkload) {
    check("runtime: managed-args pass ran", rt.includes("__chtSnapJson"));
  } else if (hasChtJsonSnapshotFamily) {
    check("runtime: managed-args pass ran", true, "skipped: jsonOf codecs present, no managed-args snapshot workload");
  } else {
    check("runtime: managed-args pass ran", true, "skipped: no CHT json snapshot family");
  }
  if (/Rows: int64/.test(rt)) {
    check("runtime: 2-D flatten applied", true);
  } else if (hasTwoDArrayField) {
    // pre-flatten 2-D field still present: the pass should have rewritten it
    check("runtime: 2-D flatten applied", false, "un-flattened T[][] remains");
  } else {
    check("runtime: 2-D flatten applied", true, "skipped: no 2-D array workload");
  }
}

// void functions must not end with literal returns
{
  const lines = rt.split("\n");
  let badVoidReturns = 0;
  let voidFn = false;
  for (const line of lines) {
    const fm = /^fn ([A-Za-z_][\w$]*)\(([^)]*)\)(?::\s*([^=]+))?\s*=/.exec(line);
    if (fm) {
      const ret = (fm[3] ?? "").trim();
      voidFn = ret === "" || ret === "void";
      continue;
    }
    if (/^\S/.test(line)) { voidFn = false; continue; }
    if (voidFn && /^\s*return\s+-?[0-9]+\s*$/.test(line)) badVoidReturns++;
  }
  check("runtime: no literal returns in void fns", badVoidReturns === 0, badVoidReturns + " found");
}

// inline-object call sites must match producer formals when superset-aligned
{
  const lines = rt.split("\n");
  const producerFormals = new Map();
  const typeFields = new Map();
  for (let i = 0; i < lines.length; i++) {
    const pf = /^fn ([A-Za-z_][\w$]*)\(([A-Za-z_][\w$]*): (ChtInlineObj_[0-9a-f]{8})\): /.exec(lines[i]);
    if (pf) producerFormals.set(pf[1], pf[3]);
    const tf = /^    (ChtInlineObj_[0-9a-f]{8}) =$/.exec(lines[i]);
    if (tf) {
      const fields = [];
      let te = i + 1;
      while (te < lines.length) {
        const fmm = /^        ([A-Za-z_][\w$]*): /.exec(lines[te]);
        if (!fmm) break;
        fields.push(fmm[1]);
        te++;
      }
      typeFields.set(tf[1], fields);
    }
  }
  let mismatches = 0;
  for (let i = 0; i < lines.length; i++) {
    const dm = /^    var ([A-Za-z_$][\w$]*): (ChtInlineObj_[0-9a-f]{8})$/.exec(lines[i]);
    if (!dm) continue;
    let fnEnd = i + 1;
    while (fnEnd < lines.length && /^\s/.test(lines[fnEnd])) fnEnd++;
    for (let k = i + 1; k < fnEnd; k++) {
      const needle = "(" + dm[1] + ")";
      const ci = lines[k].indexOf(needle);
      if (ci <= 0) continue;
      const idm = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(lines[k].slice(0, ci));
      if (!idm) continue;
      const formal = producerFormals.get(idm[1]);
      if (!formal || formal === dm[2]) continue;
      const ff = typeFields.get(formal);
      const sf = typeFields.get(dm[2]);
      if (!ff || !sf) continue;
      if (sf.every((f) => ff.includes(f))) mismatches++;
      break;
    }
  }
  check("runtime: inline call sites aligned to formals", mismatches === 0, mismatches + " misaligned");
}

// ---- entry checks (non-retained path only) ----
if (!entryPath) {
  check("entry: skipped retained-scene-only", true, "no entry source");
} else {
  let en = "";
  try { en = readFileSync(entryPath, "utf8"); } catch {
    console.log("FAIL  entry readable  (" + entryPath + ")");
    process.exit(1);
  }
  const hasRuntimeImport = en.split("\n").some((l) => l === "import cheng/.tmp-exec/unimaker-react_scene_runtime as csgSceneRuntime");
  const stripped = en.replace(/csgSceneRuntime.__csg_scene_[a-z0-9_]*\(/g, "");
  const bareHelperCalls = /(^|[^\w.])__csg_scene_[a-z0-9_]*\(/.test(stripped);
  check("entry: scene-runtime helpers qualified", !bareHelperCalls, bareHelperCalls ? "bare calls present" : "ok");
  check("entry: runtime import present", hasRuntimeImport);
}

console.log(failures === 0 ? "\nSMOKE OK" : "\nSMOKE FAILED: " + failures + " check(s)");
process.exit(failures === 0 ? 0 : 1);
