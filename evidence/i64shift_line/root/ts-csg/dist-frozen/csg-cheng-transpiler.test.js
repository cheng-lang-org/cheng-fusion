/**
 * csg-cheng-transpiler.test.ts
 *
 * Targeted regression tests for React/TS CSG -> Cheng lowering.
 */
import { transpileFunctions } from "./csg-cheng-transpiler.js";
import { emitCsgCoreFromTs } from "./csg-core.js";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const typeTextOnlyLocalFacts = [
    {
        kind: "csg.type_decl",
        id: "type.solar.parts",
        name: "SolarParts",
        declKind: "interface",
        members: [
            { name: "year", optional: false, type: "number" },
            { name: "month", optional: false, type: "number" },
        ],
    },
    {
        kind: "csg.function",
        id: "fn.demo",
        name: "demoTypeTextOnlyLocal",
        parameters: [],
        returnType: "void",
    },
    {
        kind: "csg.op",
        id: "op.local.solar",
        function: "fn.demo",
        block: "block.demo",
        opKind: "local_write",
        ordinal: 1,
        declarationKind: "let",
        name: "solar",
        typeText: "SolarParts",
    },
    {
        kind: "csg.op",
        id: "op.return",
        function: "fn.demo",
        block: "block.demo",
        opKind: "return",
        ordinal: 2,
    },
];
const result = transpileFunctions(typeTextOnlyLocalFacts, ["demoTypeTextOnlyLocal"]);
assert.deepEqual(result.structDiagnostics, [], "typeText-only local struct type must emit without struct diagnostics");
assert.equal(result.results.length, 1);
assert.equal(result.results[0].ok, true, JSON.stringify(result.results[0].diagnostics));
assert.match(result.code, /var solar: SolarParts/, "local_write.typeText must be used when typeSource is absent");
assert.match(result.code, /SolarParts =/, "typeText-only local must mark the struct type as used");
// Optional-absent member read on a call-site-instantiated synth twin (the
// createRealtimeCallSignalEnvelope `options.signal` defect): the receiver's
// compiled type is the literal-shaped ChtInlineObj twin (signal absent), while
// the SOURCE inline-object annotation declares `signal?: string`. The exprType
// side answers "str" for exactly this read (optionalAbsentFieldType), so the
// emit side must fold to the declared zero `""` — pre-fix it fell into the
// synth-excluded archived fold and emitted a BARE `"` (an unterminated string
// literal in the generated source, repro scene-runtime line
// `__t1_obj.signal = chtBridgeNormalizeCallSignalForTransport(")`).
{
    const absentSignalFacts = [
        {
            kind: "csg.function",
            id: "fn.env",
            name: "envelopeTester",
            // The annotation declares signal OPTIONAL — optionalAbsentFieldType's exact
            // provenance (it scans every parameter's inline-object annotation).
            parameters: [{ name: "declSource", typeSource: "{ signal?: string; note: string }" }],
            returnType: "string",
        },
        { kind: "csg.op", id: "op.env.twinDecl", function: "fn.env", block: "block.env", opKind: "local_write", ordinal: 1, declarationKind: "let", name: "twin", typeText: "{ messageId: string }" },
        { kind: "csg.op", id: "op.env.twin", function: "fn.env", block: "block.env", opKind: "identifier", ordinal: 2, name: "twin" },
        { kind: "csg.op", id: "op.env.read", function: "fn.env", block: "block.env", opKind: "property_read", ordinal: 3, receiver: "op.env.twin", name: "signal" },
        { kind: "csg.op", id: "op.env.ret", function: "fn.env", block: "block.env", opKind: "return", ordinal: 4, value: "op.env.read" },
    ];
    const r = transpileFunctions(absentSignalFacts, ["envelopeTester"]);
    assert.deepEqual(r.structDiagnostics, []);
    const main = r.results.find((x) => x.name === "envelopeTester");
    assert.equal(main.ok, true, JSON.stringify(main.diagnostics));
    assert.match(r.code, /var twin: ChtInlineObj_[0-9a-f]{8}/, "the literal-shaped local must bind to the minted synth twin");
    assert.match(r.code, /return ""/, "absent optional str read must fold to the declared zero (empty string)");
    assert.doesNotMatch(r.code, /return "\n/, "must never emit a bare unterminated-quote return (the pre-fix defect)");
}
// Same synth-excluded archived fold, NO declared-optional provenance (the
// parameter annotation does not mention the field): the fold itself must still
// emit the str carrier zero `""` — pre-fix it emitted the bare `"` character
// (the same unterminated-literal defect, hit by the no-provenance path).
{
    const archivedFoldFacts = [
        {
            kind: "csg.function",
            id: "fn.arch",
            name: "archivedFoldTester",
            parameters: [{ name: "declSource", typeSource: "{ note: string }" }],
            returnType: "string",
        },
        { kind: "csg.op", id: "op.arch.twinDecl", function: "fn.arch", block: "block.arch", opKind: "local_write", ordinal: 1, declarationKind: "let", name: "twin", typeText: "{ messageId: string }" },
        { kind: "csg.op", id: "op.arch.twin", function: "fn.arch", block: "block.arch", opKind: "identifier", ordinal: 2, name: "twin" },
        { kind: "csg.op", id: "op.arch.read", function: "fn.arch", block: "block.arch", opKind: "property_read", ordinal: 3, receiver: "op.arch.twin", name: "icon" },
        { kind: "csg.op", id: "op.arch.ret", function: "fn.arch", block: "block.arch", opKind: "return", ordinal: 4, value: "op.arch.read" },
    ];
    const r = transpileFunctions(archivedFoldFacts, ["archivedFoldTester"]);
    assert.deepEqual(r.structDiagnostics, []);
    const main = r.results.find((x) => x.name === "archivedFoldTester");
    assert.equal(main.ok, true, JSON.stringify(main.diagnostics));
    assert.match(r.code, /return ""/, "archived-class fold must emit the str carrier zero (empty string)");
    assert.doesNotMatch(r.code, /return "\n/, "must never emit a bare unterminated-quote return (the pre-fix defect)");
}
// End-to-end probe for compileBlockArrowHelper (multi-statement, guard-clause
// block-bodied `.filter()` arrow lowering — "if (...) return false; ...; return
// expr", the same shape as NodesPage.tsx's real
// `filteredNodes = nodes.filter((node) => { ... })`). Runs the real TS extractor
// (emitCsgCoreFromTs) against fixtures/cheng-source-array-filter-block-arrow, not
// hand-authored op facts, so it exercises the actual TS->CsgFact->Cheng path this
// capability was added for.
const scriptDir = dirname(fileURLToPath(import.meta.url));
const filterBlockArrowFixtureDir = join(scriptDir, "..", "fixtures", "cheng-source-array-filter-block-arrow");
const filterBlockArrowCore = emitCsgCoreFromTs({
    project: join(filterBlockArrowFixtureDir, "tsconfig.json"),
    rootDir: filterBlockArrowFixtureDir,
    runtime: ["node", "browser"],
});
assert.deepEqual(filterBlockArrowCore.diagnostics, [], "fixture extraction must be diagnostic-free");
const filterBlockArrowResult = transpileFunctions(filterBlockArrowCore.facts, ["score"]);
assert.deepEqual(filterBlockArrowResult.structDiagnostics, []);
assert.equal(filterBlockArrowResult.results.length, 3, JSON.stringify(filterBlockArrowResult.results));
for (const r of filterBlockArrowResult.results) {
    assert.equal(r.ok, true, `${r.name}: ${JSON.stringify(r.diagnostics)}`);
}
// The block-arrow body must compile to a standalone named helper called from
// inside the `.filter()` loop (not inlined statements, and not dropped) ...
assert.match(filterBlockArrowResult.code, /while __t\d+_i < __t\d+_src\.len:\n\s*let (__t\d+_it) = __t\d+_src\[__t\d+_i\]\n\s*if (\w+)\(localId, want, \1\):\n\s*add\(__t\d+_filtered, \1\)/, "filter loop must call a named helper predicate per element");
// ... and that helper must itself actually be emitted (not silently dropped —
// the bug this fixture caught: transpileFunctions omitted
// transpiler.auxiliaryFunctions from its output, so the loop above called an
// undefined function) with the real guard-clause body, in emission order.
assert.match(filterBlockArrowResult.code, /fn __t\d+_filterPred\(localId: int64, want: int64, value: int64\): bool =\n\s*if excludesLocal\(localId, value\):\n\s*return false\n\s*if \(\(want != int64\(0\)\) && \(!\(matchesCategory\(value, want\)\)\)\):\n\s*return false\n\s*var doubled = \(value \* int64\(2\)\)\n\s*return \(doubled > int64\(2\)\)/, "block-arrow helper must carry the guard clauses + trailing const + boolean return in source order");
// Named functions referenced only from inside the helper (not from the outer
// `score` body) must still be discovered and emitted transitively.
assert.match(filterBlockArrowResult.code, /^fn excludesLocal\(localId: int64, candidateId: int64\): bool =/m);
assert.match(filterBlockArrowResult.code, /^fn matchesCategory\(category: int64, want: int64\): bool =/m);
// Deterministic: re-running against the same facts must produce byte-identical code.
const filterBlockArrowRerun = transpileFunctions(filterBlockArrowCore.facts, ["score"]);
assert.equal(filterBlockArrowRerun.code, filterBlockArrowResult.code, "block-arrow helper lowering must be deterministic");
// ---------------------------------------------------------------------------
// Mechanism 9 (cht-voice-dual-state-bridge §4): reducible catch. `<tried>().catch(fn)` reduces to
// just `<tried>()` IFF `fn` is a statically-provable zero-arg pure-constant arrow (no bindings, a
// bare literal return). Hand-authored CsgFact fixtures (not run through the real TS extractor) so
// each of the 3 shapes below is isolated and exact, matching this file's existing fixture style
// (see typeTextOnlyLocalFacts above) — this is the hand-written execution-level test the S1 review
// (wdcey0ntx) called for: 1 positive (reduces) + 2 negative (fails loud, never silently drops the
// wrapper or the effect).
function reducibleCatchFacts(arrowBody, mainReturnOp) {
    return [
        { kind: "csg.function", id: "fn.triedCall", name: "triedCall", parameters: [], returnType: "boolean" },
        { kind: "csg.op", id: "op.tried.lit", function: "fn.triedCall", block: "block.tried", opKind: "literal", ordinal: 1, data: "data.true" },
        { kind: "csg.op", id: "op.tried.ret", function: "fn.triedCall", block: "block.tried", opKind: "return", ordinal: 2, value: "op.tried.lit" },
        { kind: "csg.data", id: "data.true", value: true },
        { kind: "csg.function", id: "fn.main", name: "mainHandler", parameters: [], returnType: "boolean" },
        { kind: "csg.op", id: "op.main.tried", function: "fn.main", block: "block.main", opKind: "call", ordinal: 1, callee: "triedCall", arguments: [] },
        { kind: "csg.op", id: "op.main.catch", function: "fn.main", block: "block.main", opKind: "call", ordinal: 2, callee: "triedCall().catch", memberName: "catch", receiver: "op.main.tried", arguments: ["op.main.arrowFv"] },
        { kind: "csg.op", id: "op.main.arrowFv", function: "fn.main", block: "block.main", opKind: "function_value", ordinal: 3, targetFunction: "fn.arrow" },
        { kind: "csg.op", id: "op.main.ret", function: "fn.main", block: "block.main", opKind: "return", ordinal: 4, value: mainReturnOp },
        { kind: "csg.function", id: "fn.arrow", name: "__arrow", parameters: [], returnType: "boolean" },
        ...arrowBody,
    ];
}
// Positive: `() => false` — zero params, bare literal return. Reduces to just `triedCall()`.
{
    const facts = reducibleCatchFacts([
        { kind: "csg.op", id: "op.arrow.lit", function: "fn.arrow", block: "block.arrow", opKind: "literal", ordinal: 1, data: "data.false" },
        { kind: "csg.op", id: "op.arrow.ret", function: "fn.arrow", block: "block.arrow", opKind: "return", ordinal: 2, value: "op.arrow.lit" },
        { kind: "csg.data", id: "data.false", value: false },
    ], "op.main.catch");
    const r = transpileFunctions(facts, ["mainHandler"]);
    const main = r.results.find((x) => x.name === "mainHandler");
    assert.equal(main.ok, true, `positive reducible-catch must compile: ${JSON.stringify(main.diagnostics)}`);
    assert.match(main.code, /return triedCall\(\)/, "pure-constant .catch() must reduce to the bare tried call, dropping the wrapper");
    assert.doesNotMatch(main.code, /\.catch/, "reduced form must not carry any .catch residue");
}
// Negative 1: `() => flag` — reads a captured free variable (not a bare literal). Must fail loud,
// never silently drop the .catch() or fall back to some default.
{
    const facts = reducibleCatchFacts([
        { kind: "csg.op", id: "op.arrow.id", function: "fn.arrow", block: "block.arrow", opKind: "identifier", ordinal: 1, name: "flag" },
        { kind: "csg.op", id: "op.arrow.ret", function: "fn.arrow", block: "block.arrow", opKind: "return", ordinal: 2, value: "op.arrow.id" },
    ], "op.main.catch");
    const r = transpileFunctions(facts, ["mainHandler"]);
    const main = r.results.find((x) => x.name === "mainHandler");
    assert.equal(main.ok, false, "continuation capturing a free variable must NOT compile (no silent fallback)");
    assert.equal(main.diagnostics.length, 1);
    assert.match(main.diagnostics[0].reason, /not a statically-provable pure constant/, "must fail with the reducible-catch diagnostic, not a generic/unrelated one");
}
// Negative 2: `() => sideEffect()` — the continuation itself performs a call (a real side effect,
// not a bare literal). Must fail loud for the same reason as negative 1 — a call can never be
// statically proven constant.
{
    const facts = reducibleCatchFacts([
        { kind: "csg.function", id: "fn.sideEffect", name: "sideEffect", parameters: [], returnType: "boolean" },
        { kind: "csg.op", id: "op.se.lit", function: "fn.sideEffect", block: "block.se", opKind: "literal", ordinal: 1, data: "data.true" },
        { kind: "csg.op", id: "op.se.ret", function: "fn.sideEffect", block: "block.se", opKind: "return", ordinal: 2, value: "op.se.lit" },
        { kind: "csg.op", id: "op.arrow.call", function: "fn.arrow", block: "block.arrow", opKind: "call", ordinal: 1, callee: "sideEffect", arguments: [] },
        { kind: "csg.op", id: "op.arrow.ret", function: "fn.arrow", block: "block.arrow", opKind: "return", ordinal: 2, value: "op.arrow.call" },
    ], "op.main.catch");
    const r = transpileFunctions(facts, ["mainHandler"]);
    const main = r.results.find((x) => x.name === "mainHandler");
    assert.equal(main.ok, false, "continuation with a real call must NOT compile (no silent fallback)");
    assert.equal(main.diagnostics.length, 1);
    assert.match(main.diagnostics[0].reason, /not a statically-provable pure constant/, "must fail with the reducible-catch diagnostic, not a generic/unrelated one");
}
// ---------------------------------------------------------------------------
// `.find` array method (2169 whitelist + emitArrayMethod, same-loop-as-`.findIndex` reuse):
// returns the ELEMENT (not the index like `.findIndex`), zero-value on miss. That convention is
// only sound when the caller can tell "not found" (zero value) apart from "found a real element
// that happens to equal the zero value" — true only for a STRUCT_PRESENCE_FIELDS-registered
// struct element type (a real hit's presence field is audited non-zero). For any other element
// type (primitives, unregistered structs) `.find()` must reject loudly instead of emitting an
// ambiguous result — adversarial review CONFIRMED this with `number[]` + a "no match" predicate:
// pre-fix, that generated code returned `int64(0)` for both "found a real 0" and "found nothing",
// indistinguishable in the compiled output.
// Negative case: `items.find(x => x === 3)` over `number[]` (unregistered primitive element type)
// must fail honestly, not silently emit a zero-value-on-miss result.
{
    const findFacts = [
        { kind: "csg.data", id: "data.three", value: 3 },
        { kind: "csg.function", id: "fn.findArrow", name: "__arrow", parameters: [{ name: "x", typeSource: "number" }], returnType: "boolean" },
        { kind: "csg.op", id: "op.arrow.x", function: "fn.findArrow", block: "block.farrow", opKind: "identifier", ordinal: 1, name: "x" },
        { kind: "csg.op", id: "op.arrow.lit3", function: "fn.findArrow", block: "block.farrow", opKind: "literal", ordinal: 2, data: "data.three" },
        { kind: "csg.op", id: "op.arrow.eq", function: "fn.findArrow", block: "block.farrow", opKind: "binary", ordinal: 3, operator: "EqualsEqualsEqualsToken", left: "op.arrow.x", right: "op.arrow.lit3" },
        { kind: "csg.op", id: "op.arrow.ret", function: "fn.findArrow", block: "block.farrow", opKind: "return", ordinal: 4, value: "op.arrow.eq" },
        { kind: "csg.function", id: "fn.findMain", name: "findTester", parameters: [{ name: "items", typeSource: "number[]" }], returnType: "number" },
        { kind: "csg.op", id: "op.main.items", function: "fn.findMain", block: "block.fmain", opKind: "identifier", ordinal: 1, name: "items" },
        { kind: "csg.op", id: "op.main.arrowFv", function: "fn.findMain", block: "block.fmain", opKind: "function_value", ordinal: 2, targetFunction: "fn.findArrow" },
        { kind: "csg.op", id: "op.main.find", function: "fn.findMain", block: "block.fmain", opKind: "call", ordinal: 3, callee: "items.find", memberName: "find", receiver: "op.main.items", arguments: ["op.main.arrowFv"] },
        { kind: "csg.op", id: "op.main.ret", function: "fn.findMain", block: "block.fmain", opKind: "return", ordinal: 4, value: "op.main.find" },
    ];
    const r = transpileFunctions(findFacts, ["findTester"]);
    assert.deepEqual(r.structDiagnostics, []);
    const main = r.results.find((x) => x.name === "findTester");
    assert.equal(main.ok, false, "must reject .find() on a primitive element type — zero-value-on-miss is ambiguous with a real 0/empty hit");
    assert.match(main.diagnostics[0].reason, /no discriminable "not found" result/, "must fail with the presence-field diagnostic, not a generic/unrelated one");
    assert.match(main.diagnostics[0].reason, /\.findIndex/, "diagnostic must point callers at the real sentinel (.findIndex)");
}
// Positive case: `sessions.find(s => s.sessionId === "sig1")` over `RealtimeCallSession[]`, a
// STRUCT_PRESENCE_FIELDS-registered element type — still gets the zero-value-on-miss scan (sound
// here because `sessionId == ""` on the result unambiguously means "not found").
{
    const findStructFacts = [
        {
            kind: "csg.type_decl",
            id: "type.realtime.call.session",
            name: "RealtimeCallSession",
            declKind: "interface",
            members: [{ name: "sessionId", optional: false, type: "string" }],
        },
        { kind: "csg.data", id: "data.sig1", value: "sig1" },
        { kind: "csg.function", id: "fn.findStructArrow", name: "__arrow2", parameters: [{ name: "s", typeSource: "RealtimeCallSession" }], returnType: "boolean" },
        { kind: "csg.op", id: "op.arrow2.s", function: "fn.findStructArrow", block: "block.farrow2", opKind: "identifier", ordinal: 1, name: "s" },
        { kind: "csg.op", id: "op.arrow2.sid", function: "fn.findStructArrow", block: "block.farrow2", opKind: "property_read", ordinal: 2, receiver: "op.arrow2.s", name: "sessionId" },
        { kind: "csg.op", id: "op.arrow2.lit", function: "fn.findStructArrow", block: "block.farrow2", opKind: "literal", ordinal: 3, data: "data.sig1" },
        { kind: "csg.op", id: "op.arrow2.eq", function: "fn.findStructArrow", block: "block.farrow2", opKind: "binary", ordinal: 4, operator: "EqualsEqualsEqualsToken", left: "op.arrow2.sid", right: "op.arrow2.lit" },
        { kind: "csg.op", id: "op.arrow2.ret", function: "fn.findStructArrow", block: "block.farrow2", opKind: "return", ordinal: 5, value: "op.arrow2.eq" },
        { kind: "csg.function", id: "fn.findStructMain", name: "findSessionTester", parameters: [{ name: "sessions", typeSource: "RealtimeCallSession[]" }], returnType: "RealtimeCallSession" },
        { kind: "csg.op", id: "op.smain.items", function: "fn.findStructMain", block: "block.smain", opKind: "identifier", ordinal: 1, name: "sessions" },
        { kind: "csg.op", id: "op.smain.arrowFv", function: "fn.findStructMain", block: "block.smain", opKind: "function_value", ordinal: 2, targetFunction: "fn.findStructArrow" },
        { kind: "csg.op", id: "op.smain.find", function: "fn.findStructMain", block: "block.smain", opKind: "call", ordinal: 3, callee: "sessions.find", memberName: "find", receiver: "op.smain.items", arguments: ["op.smain.arrowFv"] },
        { kind: "csg.op", id: "op.smain.ret", function: "fn.findStructMain", block: "block.smain", opKind: "return", ordinal: 4, value: "op.smain.find" },
    ];
    const r = transpileFunctions(findStructFacts, ["findSessionTester"]);
    assert.deepEqual(r.structDiagnostics, []);
    const main = r.results.find((x) => x.name === "findSessionTester");
    assert.equal(main.ok, true, JSON.stringify(main.diagnostics));
    // Same scan-loop shape as `.findIndex` (foundIndex starts at -1, set + `found` latch on match),
    // materializing the element at that index into a zero-valued-on-miss result var — sound here
    // because RealtimeCallSession.sessionId is registered in STRUCT_PRESENCE_FIELDS.
    assert.match(r.code, /var (\w+) = int64\(-1\)/, "must scan via a foundIndex var starting at -1, same as .findIndex");
    assert.match(r.code, /var (\w+): RealtimeCallSession\n\s*if \w+ >= int64\(0\):\n\s*\1 = \w+\[int32\(\w+\)\]/, "must materialize the element at foundIndex into a zero-valued-on-miss result var");
    assert.doesNotMatch(r.code, /fabricat/i);
}
// `!x`/truthy struct condition (emitCondition's STRUCT_PRESENCE_FIELDS translation): registered
// struct type -> presence-field emptiness check, NOT a bare `!` on the struct value (which would
// be a constant, indistinguishable-across-all-inputs condition — the bug adversarial review
// CONFIRMED against `!activeVoiceSession`).
{
    const condFacts = [
        {
            kind: "csg.type_decl",
            id: "type.realtime.call.session.cond",
            name: "RealtimeCallSession",
            declKind: "interface",
            members: [{ name: "sessionId", optional: false, type: "string" }],
        },
        { kind: "csg.function", id: "fn.condMain", name: "checkNoSession", parameters: [{ name: "session", typeSource: "RealtimeCallSession" }], returnType: "boolean" },
        { kind: "csg.op", id: "op.cond.session", function: "fn.condMain", block: "block.cond", opKind: "identifier", ordinal: 1, name: "session" },
        { kind: "csg.op", id: "op.cond.not", function: "fn.condMain", block: "block.cond", opKind: "unary", ordinal: 2, operator: "ExclamationToken", operand: "op.cond.session" },
        { kind: "csg.op", id: "op.cond.ret", function: "fn.condMain", block: "block.cond", opKind: "return", ordinal: 3, value: "op.cond.not" },
    ];
    const r = transpileFunctions(condFacts, ["checkNoSession"]);
    assert.deepEqual(r.structDiagnostics, []);
    const main = r.results.find((x) => x.name === "checkNoSession");
    assert.equal(main.ok, true, JSON.stringify(main.diagnostics));
    assert.match(r.code, /len\(\(session\)\.sessionId\)/, "`!session` must translate through the registered presence field (sessionId), not a bare `!` on the struct");
    assert.doesNotMatch(r.code, /!\(session\)\)/, "must not emit a bare `!` on a struct value");
}
// Struct type with NO STRUCT_PRESENCE_FIELDS entry used as a boolean condition: must reject
// loudly (this.fail), never silently emit a bare `!x`/`x` on the struct.
{
    const noPresenceFacts = [
        {
            kind: "csg.type_decl",
            id: "type.unregistered.struct",
            name: "UnregisteredStruct",
            declKind: "interface",
            members: [{ name: "label", optional: false, type: "string" }],
        },
        { kind: "csg.function", id: "fn.noPresMain", name: "checkUnregistered", parameters: [{ name: "thing", typeSource: "UnregisteredStruct" }], returnType: "boolean" },
        { kind: "csg.op", id: "op.nopres.thing", function: "fn.noPresMain", block: "block.nopres", opKind: "identifier", ordinal: 1, name: "thing" },
        { kind: "csg.op", id: "op.nopres.not", function: "fn.noPresMain", block: "block.nopres", opKind: "unary", ordinal: 2, operator: "ExclamationToken", operand: "op.nopres.thing" },
        { kind: "csg.op", id: "op.nopres.ret", function: "fn.noPresMain", block: "block.nopres", opKind: "return", ordinal: 3, value: "op.nopres.not" },
    ];
    const r = transpileFunctions(noPresenceFacts, ["checkUnregistered"]);
    const main = r.results.find((x) => x.name === "checkUnregistered");
    assert.equal(main.ok, false, "must reject a struct-as-boolean-condition with no registered presence field");
    assert.match(main.diagnostics[0].reason, /no registered presence field/, "must fail with the STRUCT_PRESENCE_FIELDS diagnostic");
}
console.log("PASS");
