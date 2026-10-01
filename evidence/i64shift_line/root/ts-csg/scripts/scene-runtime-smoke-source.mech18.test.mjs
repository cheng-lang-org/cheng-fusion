// scene-runtime-smoke-source.mech18.test.mjs
//
// ★UPDATE (mech19 r1, see mech19_impl_r1_verdict.md): 本文件 ⑤ 号"写函数不可达陷阱"发现促成的
// 架构级安全网(写可达性门禁, 跨全部六个 box-ref 家族)已在 mech19 r1 落地。原第五个 check
// ("★KNOWN GAP")当时的断言精确记录的是"未防御"的旧行为, 其自身注释已声明"this is a repro pin,
// not an endorsement"——该 check 已就地更新为"★GAP CLOSED"断言新行为(孤儿写函数 ref 现在在
// admission 层被拒绝, 不再静默编译出死写代码), 历史发现记录(下方①-⑤)原样保留不改, 仍是准确的
// 案发记录。
//
// 机制18 r1: `latestRoomStateRef` 缺口定谳 (ChessPage.tsx:374/408/1264, `useRef<RealtimeChessRoom |
// null>(roomState)` — 状态镜像 ref, 初值为变量 roomState 非 null 字面量). 三个真实 op-trace 探针
// (`scripts/mech18-dump-latestroomstate-ops.mjs`, 对源码只读未改) 对真实提取的 UniMaker
// ChessPage.tsx 逐条实测得到三层独立发现 + 一个此前未知的架构级隐患, 本文件把全部四项锁定为永久、
// 可执行的回归断言 (PASS=断言精确复现已验证的真实行为, 不是猜测):
//
//   ① 声明形态(初值为变量): refDeclaredNullableType 的注册键只看 useRef CALL 自身经 checker 解析的
//      `returnType` 标注 (MutableRefObject<T | null>), 完全不读 useRef(...) 的实参 —— 初值是
//      `roomState`(变量) 还是 `null`(字面量) 对声明注册结果零影响。真实探针确认:
//      `useRef<RealtimeChessRoom | null>(roomState)` 的 returnType 正则匹配成功, declaredType =
//      "RealtimeChessRoom"(stripImportPrefixes 后)。任务原始假设"初值为变量导致声明缺口"被证伪
//      —— 这不是缺口所在。
//   ② 读形态: `const activeRoom = latestRoomStateRef.current;` 是裸 `.current` 读(赋给局部变量),
//      随后 `activeRoom.peerId`/`activeRoom.localJoined` 等字段访问发生在局部变量 `activeRoom`
//      上, 不是 `.current.<field>` 直接链式访问 —— objectLike 门禁的 `nx2.receiver === nx.id`
//      ID回引用检查不命中, 不触发 objectLike。真实探针确认 tripsObjectLike=false。这也不是缺口
//      所在(与机制14 iceConfigRef 同一读形态)。
//   ③ 写形态(真实缺口之一): `latestRoomStateRef.current = roomState;` 的 RHS 是 useState 解构
//      绑定 `const [roomState, setRoomState] = useState<RealtimeChessRoom | null>(...)` 产生的
//      `binding_extract` op —— 真实探针确认这个 op 的 `typeText` 字段就是 `undefined`(不是查找
//      未命中, 是这个 op 本身从未携带 typeText), 导致 structBoxRefs 写形态门禁的
//      `localVarTypeTextByFnAndName.get(...)` 永远查不到条目, `writesOk` 恒为 false —— 这是一个
//      通用缺口(对任何 useState 解构变量写入任何 struct box-ref 都成立), 不是这一个 ref 独有。
//   ④ 类型注册缺口: `CHT_STRUCT_REF_TYPES` 只注册了 `WebRtcIceConfig`(5 字段扁平结构), 没有
//      `RealtimeChessRoom`(13 字段, 含嵌套 `game: ChessGameState` → `Board`(`(Piece|null)[][]`,
//      10x9 嵌套可空结构数组) → `Move[]`/`Position`/`Side`/`GamePhase`/`PieceType`)。
//
// 本文件的核心贡献是第五项 —— ①②③④ 逐一独立解释了 latestRoomStateRef 为何落进 fv-unknown, 但
// 即使假设③④都被"修复", 仍有一个此前从未被任何机制11-17测试覆盖过的架构级隐患:
//
//   ⑤ ★写函数不可达陷阱(本轮新发现, 已用未改动的真实生产代码复现证实, 非推测): 真实 op-trace 对
//      整个 core facts 逐 op 扫描确认, latestRoomStateRef 唯一的 `.current =` 写位点
//      (ChessPage.tsx:408) 所在的匿名闭包函数, 在全部 facts 里除了自身的 op 归属字段外, 唯一的
//      "被引用"记录是它作为 useEffect(...) 的第一个实参(`function_value` op, 见
//      `scripts/mech18-dump-latestroomstate-ops.mjs` 的等价探针方法) —— 它从未是任何 `call` op
//      的目标, 因此永远不可能被任何 `csg.web.scene.event_handler` 编译入口的调用图触达
//      (CHT 只编译 JSX 事件处理器, 从不编译 useEffect 回调体, mech17 verdict 已确认)。
//
//      test "★KNOWN GAP" 下方用一个可执行的最小反例(REUSE 机制14 已验证工作的 WebRtcIceConfig
//      类型 + 已验证工作的"typed-identifier write"形态, 唯一改动是把写函数放进一个不绑定任何
//      event_handler 且不被任何 call op 引用的"孤儿"函数)对**未改动的真实生产代码**
//      (`buildCompiledHandlerTable`)复现: 该 ref 仍被放行进 structBoxRefs 并成功编译, 生成的
//      `__cht_apply` 分支只包含"读"handler 的 load/store 收尾行, 孤儿写函数的赋值从未出现在任何
//      编译产物里 —— 编译成功但读到的永远是 KV 槽的零值/reset 态(`present=false`), 不是真实写入
//      的值。这是一个静默读旧值(stale)的错误运行时行为, 不是编译失败 —— 比诚实的 `fv-unknown:`
//      跳过更危险。structBoxRefs(及同构的 scalar/obj/set/arr BoxRefs)的写形态门禁完全不检查写
//      函数是否可达, 这是一个通用的、跨全部 box-ref 家族的架构级安全网缺失, 不是 latestRoomStateRef
//      独有。
//
// 机制18 r1 的取舍结论(详见 mech18_impl_r1_verdict.md): 鉴于 ⑤ 的真实存在, 本轮**不**扩展任何
// 现有家族去放行 latestRoomStateRef —— 放行前必须补齐"写函数可达性"这张此前不存在的安全网, 否则
// 会把一个诚实的编译期跳过(fv-unknown, 当前行为)替换成一个更危险的静默运行时读旧值 miscompile。
// 补齐可达性安全网需要复用/验证 buildCompiledHandlerTable 既有的跨函数自由变量/调用图遍历语义
// (确保零回归地覆盖全部6个 box-ref 家族), 是一个独立量级的机制, 本轮不做无把握的抢跑实现 —— 0 个
// 安全 admission 点, 如实只诊断+永久锁定证据, 不为凑"阻塞项前移"伪造一个自己已证明危险的放行。
//
// Usage: node scripts/scene-runtime-smoke-source.mech18.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "ChessPageTest", parameters: [], returnType: "void" };
}

// Real WebRtcIceConfig type_decl facts, verbatim from mech14's own test file (same registered
// type reused here as a KNOWN-WORKING positive baseline for the reachability trap — see ⑤).
function webRtcIceConfigTypeDeclFacts() {
  return [
    { kind: "csg.type_decl", name: "WebRtcTurnServer", members: [
        { name: "url", type: "string" },
        { name: "username", type: "string" },
        { name: "credential", type: "string" },
    ] },
    { kind: "csg.type_decl", name: "WebRtcIceConfig", members: [
        { name: "relayOnly", type: "boolean" },
        { name: "stunUrls", type: "string[]" },
        { name: "turnServers", type: "WebRtcTurnServer[]" },
        { name: "iceServers", type: "RTCIceServer[]" },
        { name: "expiresAtMs", type: "number | undefined" },
    ] },
  ];
}

// `const <refName> = useRef<T | null>(<initialValueOpId | undefined>)`. `initialValueOpId`
// (when provided) is threaded onto the useRef CALL op's `arguments` array — mirroring finding ①:
// the classifier reads only `returnType`, never `arguments`, so this parameter exists solely to
// make the fixture shape-faithful to the real `useRef<RealtimeChessRoom | null>(roomState)`
// initial-value-is-a-variable form; every assertion below proves it is inert.
function useRefStructFacts(refName, ordinalBase, declaredTypeText, initialValueOpId) {
  const callOp = { kind: "csg.op", id: `op.useRef.call.${refName}`, function: "fn.component", block: "block.component", opKind: "call", ordinal: ordinalBase, callee: "useRef", arguments: initialValueOpId ? [initialValueOpId] : [], returnType: `MutableRefObject<${declaredTypeText} | null>` };
  return [
    callOp,
    { kind: "csg.op", id: `op.useRef.write.${refName}`, function: "fn.component", block: "block.component", opKind: "local_write", ordinal: ordinalBase + 1, name: refName, value: `op.useRef.call.${refName}` },
  ];
}

function handlerBindingFacts(handlerName, targetFid, ordinalBase) {
  return [
    { kind: "csg.op", id: `op.fnvalue.${handlerName}`, function: "fn.component", block: "block.component", opKind: "function_value", ordinal: ordinalBase, targetFunction: targetFid },
    { kind: "csg.op", id: `op.localwrite.${handlerName}`, function: "fn.component", block: "block.component", opKind: "local_write", ordinal: ordinalBase + 1, name: handlerName, value: `op.fnvalue.${handlerName}` },
    { kind: "csg.function", id: targetFid, name: "<anonymous>", parameters: [], returnType: "void" },
  ];
}

function eventHandlerFact(handlerName) {
  return { kind: "csg.web.scene.event_handler", effect: `invoke:${handlerName}`, routeIndex: 0, nodeId: 0 };
}

// `<refName>.current = null` — mech14's own PROVEN-working write shape (test 1a). Used throughout
// below instead of the "typed-identifier write" shape, because that shape (real typeText, name
// matches the ref's registered type) is proven by mech14's OWN test 1b to ALWAYS transpile-fail
// with a Cheng-type-mismatch diagnostic (TypeMapper's auto-mapped struct name is never literally
// equal to a box-ref's hand-written codec struct name) — an orthogonal, already-guarded issue that
// would add unrelated noise to the isolation/reachability tests below, which need a write shape
// that succeeds so the ONLY variable under test (initial-value argument / write-function
// reachability) is isolated.
function nullWriteFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.data", id: `${idBase}.null`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit`, function: fid, block, opKind: "literal", data: `${idBase}.null` },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.nulllit` },
  ];
}

function returnReadFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.ret`, function: fid, block, opKind: "return", value: `${idBase}.cur` },
  ];
}

// Finding ②'s exact real shape: `const <localName> = <refName>.current;` (bare read, assigned to
// a LOCAL var) — deliberately NOT a `return`, to stay faithful to ChessPage.tsx:1264
// (`const activeRoom = latestRoomStateRef.current;`), followed by field reads on the LOCAL var
// (never chained directly on `.current`).
function localAssignThenFieldReadFacts(fid, block, refName, localName, fieldNames, tag) {
  const idBase = `op.${tag}`;
  const ops = [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.localwrite`, function: fid, block, opKind: "local_write", name: localName, value: `${idBase}.cur` },
  ];
  fieldNames.forEach((fieldName, i) => {
    ops.push(
      { kind: "csg.op", id: `${idBase}.localread${i}`, function: fid, block, opKind: "identifier", name: localName },
      { kind: "csg.op", id: `${idBase}.field${i}`, function: fid, block, opKind: "property_read", name: fieldName, receiver: `${idBase}.localread${i}` },
    );
  });
  return ops;
}

// Finding ③'s exact real shape: a useState-destructured binding — `binding_extract` op carrying
// NO `typeText` (real ts-csg extraction confirmed via `mech18-dump-latestroomstate-ops.mjs`: all
// 3 real `roomState` bindings in ChessPage.tsx have `typeText=undefined`), then
// `<refName>.current = <thatBinding>`.
function useStateDestructuredWriteFacts(fid, block, refName, stateVarName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.usestate.call`, function: fid, block, opKind: "call", callee: "useState", arguments: [] },
    { kind: "csg.op", id: `${idBase}.usestate.bind`, function: fid, block, opKind: "binding_extract", name: stateVarName, value: `${idBase}.usestate.call` }, // NO typeText field — matches real extraction exactly
    { kind: "csg.op", id: `${idBase}.src`, function: fid, block, opKind: "identifier", name: stateVarName },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.src` },
  ];
}

// Finding ⑤'s exact fixture: mech14's own already-verified-working "typed-identifier write" shape
// (real typeText carried, matches a REGISTERED CHT_STRUCT_REF_TYPES entry) — REUSED verbatim from
// mech14's own test file, so this trap is proven against a shape independently known to satisfy
// EVERY EXISTING gate (type registration + write-shape match). The only variable under test is
// WHERE this write lives (see the two call sites below: reachable vs. orphaned).
function typedIdentifierWriteFacts(fid, block, refName, localName, declTypeText, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.data", id: `${idBase}.zero`, dataKind: "number", value: 0 },
    { kind: "csg.op", id: `${idBase}.zerolit`, function: fid, block, opKind: "literal", data: `${idBase}.zero` },
    { kind: "csg.op", id: `${idBase}.decl`, function: fid, block, opKind: "local_write", name: localName, value: `${idBase}.zerolit`, typeText: declTypeText, declarationKind: "const" },
    { kind: "csg.op", id: `${idBase}.src`, function: fid, block, opKind: "identifier", name: localName },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.src` },
  ];
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
// ①②③④ combined: the EXACT real latestRoomStateRef shape (unregistered RealtimeChessRoom-style
// type + useRef initial value = a variable, not null + bare-read-then-local-field-access +
// useState-destructured write with no typeText) is excluded honestly as fv-unknown — the CURRENT,
// SAFE baseline behavior, locked in permanently.
await check("real shape: latestRoomStateRef (unregistered type, initial-value-is-variable, useState-derived write) stays fv-unknown", async () => {
  const coreFacts = [
    componentFn(),
    { kind: "csg.type_decl", name: "RealtimeChessRoom", members: [
        { name: "peerId", type: "string" },
        { name: "conversationId", type: "string" },
        { name: "localJoined", type: "boolean" },
    ] },
    // `const [roomState, setRoomState] = useState<RealtimeChessRoom | null>(...)` — the useRef's
    // initial-value ARGUMENT (finding ①: proven inert, included purely for shape fidelity).
    { kind: "csg.op", id: "op.usestate.call.decl", function: "fn.component", block: "block.component", opKind: "call", ordinal: 0, callee: "useState", arguments: [] },
    { kind: "csg.op", id: "op.usestate.bind.decl", function: "fn.component", block: "block.component", opKind: "binding_extract", name: "roomState", value: "op.usestate.call.decl" }, // no typeText, same as real extraction
    ...useRefStructFacts("latestRoomStateRef", 2, "RealtimeChessRoom", "op.usestate.bind.decl"),
    ...handlerBindingFacts("leaveCurrentRoom", "fn.leaveCurrentRoom", 10),
    ...localAssignThenFieldReadFacts("fn.leaveCurrentRoom", "block.lcr", "latestRoomStateRef", "activeRoom", ["peerId", "localJoined"], "lcr1"),
    // the write lives in a SEPARATE, never-called function (faithful to real ChessPage.tsx:407-411
    // useEffect closure) — irrelevant to THIS test's outcome (excluded via ③④ regardless of ⑤).
    { kind: "csg.function", id: "fn.mirrorEffect", name: "<anonymous-effect>", parameters: [], returnType: "void" },
    ...useStateDestructuredWriteFacts("fn.mirrorEffect", "block.effect", "latestRoomStateRef", "roomState", "eff1"),
  ];
  const sceneFacts = [eventHandlerFact("leaveCurrentRoom")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, "must not compile: RealtimeChessRoom is unregistered AND the write-shape gate cannot match a typeText-less useState binding");
  assert.equal(cht.skips.length, 1);
  assert.match(cht.skips[0].reason, /^fv-unknown:latestRoomStateRef$/, `must fail honestly with fv-unknown, matching the real UniMaker baseline exactly: ${JSON.stringify(cht.skips)}`);
});

// ---------------------------------------------------------------------------
// ① isolation: swap ONLY the useRef initial-value argument (variable -> none/omitted, i.e. the
// classic `useRef<T|null>(null)` shape mechanism 14 already tests) while keeping type registered
// AND write-shape valid (typed identifier, mech14's own working shape) — admission outcome is
// IDENTICAL either way, proving finding ① empirically: the initial-value argument shape has zero
// effect on classification. This is the "同型正对照" for finding ①.
await check("finding ① isolation: useRef(<variable>) vs useRef(null) initial value has ZERO effect on structBoxRefs admission (registered type + valid write-shape)", async () => {
  const buildFacts = (initialValueOpId) => [
    componentFn(),
    ...webRtcIceConfigTypeDeclFacts(),
    ...useRefStructFacts("cfgRef", 1, "WebRtcIceConfig", initialValueOpId),
    ...handlerBindingFacts("writeCfg", "fn.writeCfg", 10),
    ...nullWriteFacts("fn.writeCfg", "block.wc", "cfgRef", "wc1"),
  ];
  // NOTE: buildCompiledHandlerTable REWRITES its sceneFacts array's effect strings in place
  // (`invoke:` -> `compiled:`, see cht-measure.mjs's own header comment) — each call below gets
  // its OWN fresh sceneFacts array, never shared, so the second call is not silently fed an
  // already-"compiled:"-tagged fact left over from the first.

  // Variant A: useRef(null) — no initial-value op at all (mech14's existing baseline shape).
  const chtNullInit = await buildCompiledHandlerTable(buildFacts(undefined), [eventHandlerFact("writeCfg")]);
  // Variant B: useRef(someVariable) — an initial-value identifier op present, exactly like
  // `useRef<RealtimeChessRoom | null>(roomState)`.
  const initOps = [
    { kind: "csg.op", id: "op.somevar.usestate", function: "fn.component", block: "block.component", opKind: "call", ordinal: 0, callee: "useState", arguments: [] },
    { kind: "csg.op", id: "op.somevar.bind", function: "fn.component", block: "block.component", opKind: "binding_extract", name: "someInitVar", value: "op.somevar.usestate" },
  ];
  const chtVarInit = await buildCompiledHandlerTable([...initOps, ...buildFacts("op.somevar.bind")], [eventHandlerFact("writeCfg")]);

  assert.equal(chtNullInit.count, 1, "useRef(null) variant must compile");
  assert.equal(chtVarInit.count, 1, "useRef(<variable>) variant must ALSO compile — identical outcome, proving the initial-value shape is inert");
  assert.deepEqual(chtNullInit.skips, chtVarInit.skips);
  assert.equal(chtNullInit.code.includes("__chtRef_cfgRef"), chtVarInit.code.includes("__chtRef_cfgRef"));
});

// ---------------------------------------------------------------------------
// ③ isolation / collision pair: the EXACT SAME registered type + reachable handler, differing
// ONLY in write-value shape — a useState-destructured identifier (no typeText, finding ③) is
// excluded at the CLASSIFIER layer (never even admitted into structBoxRefs, generic `fv-unknown:`),
// while mech14's own known-working typed-identifier write (has typeText, mech14 test 1b/5) IS
// admitted into structBoxRefs at the classifier layer and only fails later, at the CODEGEN layer,
// for the separate, already-documented Cheng-type-mismatch reason (`transpile-fail:`). Proves
// finding ③ is a real, distinct, CLASSIFIER-layer gap — not the same issue mech14 test 1b already
// covers, and not a general regression: the write-shape gate's identifier branch is reached and
// evaluated differently depending purely on whether the write-value's binding carries a typeText.
await check("finding ③ collision pair: useState-destructured write-value (no typeText) excluded at classifier layer (fv-unknown); typed local (has typeText) admitted at classifier layer, fails later at codegen layer (transpile-fail) — same ref type, same handler reachability", async () => {
  const coreFactsA = [ // useState-destructured write (finding ③ shape)
    componentFn(),
    ...webRtcIceConfigTypeDeclFacts(),
    ...useRefStructFacts("cfgRefA", 1, "WebRtcIceConfig"),
    ...handlerBindingFacts("writeCfgA", "fn.writeCfgA", 10),
    ...useStateDestructuredWriteFacts("fn.writeCfgA", "block.wca", "cfgRefA", "someState", "wca1"),
  ];
  const chtA = await buildCompiledHandlerTable(coreFactsA, [eventHandlerFact("writeCfgA")]);
  assert.equal(chtA.count, 0, "useState-destructured write (no typeText) must NOT compile");
  assert.equal(chtA.skips.length, 1);
  assert.match(chtA.skips[0].reason, /^fv-unknown:cfgRefA$/, `must fail at the classifier layer (ref never admitted into structBoxRefs at all): ${JSON.stringify(chtA.skips)}`);

  const coreFactsB = [ // typed-const write (mech14's own test 1b/5 shape — admitted, then codegen-fails)
    componentFn(),
    ...webRtcIceConfigTypeDeclFacts(),
    ...useRefStructFacts("cfgRefB", 1, "WebRtcIceConfig"),
    ...handlerBindingFacts("writeCfgB", "fn.writeCfgB", 10),
    ...typedIdentifierWriteFacts("fn.writeCfgB", "block.wcb", "cfgRefB", "config", "WebRtcIceConfig", "wcb1"),
  ];
  const chtB = await buildCompiledHandlerTable(coreFactsB, [eventHandlerFact("writeCfgB")]);
  assert.equal(chtB.count, 0, "typed-const write also does not compile end-to-end (mech14's own documented Cheng-type-mismatch guard, test 1b) — but for a DIFFERENT, later-stage reason than cfgRefA");
  assert.equal(chtB.skips.length, 1);
  assert.match(chtB.skips[0].reason, /^transpile-fail:struct box-ref '\.current' write on 'cfgRefB'/, `must fail at the CODEGEN layer (proves the ref WAS admitted into structBoxRefs, unlike cfgRefA above): ${JSON.stringify(chtB.skips)}`);
});

// ---------------------------------------------------------------------------
// ⑤ ★GAP CLOSED by mechanism 19 r1 (see mech19_impl_r1_verdict.md — this test originally pinned
// the UNDEFENDED behavior; its own comment at the time said "this is a repro pin, not an
// endorsement"): a struct box-ref whose ONLY `.current =` write lives in a function that is never
// bound to a `csg.web.scene.event_handler` and never the target of any `call` op (faithfully
// mirroring ChessPage.tsx:407-411's real useEffect closure — verified via
// `mech18-dump-latestroomstate-ops.mjs` that its ONLY reference anywhere in the real extracted
// facts is as useEffect's own first argument, never a call target) USED TO be silently admitted by
// production `buildCompiledHandlerTable` and compile successfully with the write's store-epilogue
// silently dead (a reproducible SILENT STALE-READ risk, compiles clean, wrong value at runtime —
// strictly worse than an honest fv-unknown skip). Mechanism 19 r1 added a write-reachability check
// (shared across all six box-ref families, see scene-runtime-smoke-source.mjs's
// `reachableWriteOwnerFids`/`refWriteReachabilityOk`) that walks the SAME call-graph traversal
// `freeVarsOfClosure` already uses from every JSX-bound handler root; a ref whose every real write
// site is outside that reachable set now correctly falls through to the SAME honest fv-unknown path
// every other unrecognized shape already uses, instead of being silently admitted. This ref (and by
// direct extension, latestRoomStateRef's real production shape) is now REJECTED at admission.
await check("★GAP CLOSED (mech19 r1): struct box-ref write-reachability check now rejects an orphaned-write ref instead of silently admitting it with dead write code", async () => {
  const coreFacts = [
    componentFn(),
    ...webRtcIceConfigTypeDeclFacts(),
    ...useRefStructFacts("mirrorRef", 1, "WebRtcIceConfig"),
    // The write lives in "fn.orphanWriter" — a plain csg.function fact that is NEVER referenced by
    // any function_value/call op and NEVER bound to any eventHandlerFact (faithful to the real
    // useEffect closure's provable unreachability). Uses mech14's own PROVEN-working null-write
    // shape (not typed-identifier-write, which mech14 test 1b already shows always fails on a
    // SEPARATE, unrelated Cheng-type-mismatch guard — using null-write isolates purely the
    // reachability variable, with no confounding noise from that orthogonal issue).
    { kind: "csg.function", id: "fn.orphanWriter", name: "<anonymous-effect>", parameters: [], returnType: "void" },
    ...nullWriteFacts("fn.orphanWriter", "block.orphan", "mirrorRef", "ow1"),
    ...handlerBindingFacts("readMirror", "fn.readMirror", 10),
    ...returnReadFacts("fn.readMirror", "block.rm", "mirrorRef", "rm1"),
  ];
  const sceneFacts = [eventHandlerFact("readMirror")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);

  // mech19 r1: the orphaned-write ref is now excluded at the classifier layer (never reaches
  // structBoxRefs.set at all) — readMirror's only free var (mirrorRef) resolves to fv-unknown, the
  // SAME honest failure shape every other unrecognized ref shape in this file already uses.
  assert.equal(cht.count, 0, "mech19 r1: the orphaned-write ref no longer compiles — its only write is unreachable from any handler root");
  assert.equal(cht.skips.length, 1);
  assert.match(cht.skips[0].reason, /^fv-unknown:mirrorRef$/, `must fail at the classifier layer (mirrorRef never admitted into structBoxRefs): ${JSON.stringify(cht.skips)}`);
  assert.doesNotMatch(cht.code, /orphanWriter/, "the orphaned writer function is never referenced anywhere in the (now-empty) compiled output");
});

// ---------------------------------------------------------------------------
// ⑤ readHealthy control: the SAME ref type/shape, but with the write inside a REACHABLE handler
// (mech14's own iceConfigRef pattern — write inside a handler directly bound to an event) compiles
// AND the KV store-epilogue for the writing handler itself IS present — proving ⑤ is specifically
// about write-reachability, not a general regression in struct box-ref codegen.
await check("⑤ readHealthy control: the identical ref/type/write-shape WITH a reachable writer compiles with a real store-epilogue for the writer itself", async () => {
  const coreFacts = [
    componentFn(),
    ...webRtcIceConfigTypeDeclFacts(),
    ...useRefStructFacts("mirrorRefHealthy", 1, "WebRtcIceConfig"),
    ...handlerBindingFacts("writeMirrorHealthy", "fn.writeMirrorHealthy", 10),
    ...nullWriteFacts("fn.writeMirrorHealthy", "block.wmh", "mirrorRefHealthy", "wmh1"),
  ];
  const sceneFacts = [eventHandlerFact("writeMirrorHealthy")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 1);
  assert.deepEqual(cht.skips, []);
  assert.match(cht.code, /scene\.WebSceneSetStateValueInternal\(graph, "struct:mirrorRefHealthy", scene\.WebSceneEncodeWebRtcIceConfigState\(__chtRef_mirrorRefHealthy\), true\)/, "the reachable writer's own store-epilogue IS present — the write DOES reach compiled code here, unlike the orphaned case above");
});

process.stdout.write(`PASS (${passed}/${passed})\n`);
