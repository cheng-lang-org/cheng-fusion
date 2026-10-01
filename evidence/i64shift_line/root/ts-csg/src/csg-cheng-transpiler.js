// React/TS function IR → Cheng source transpiler (M1 core).
//
// Consumes csg facts (csg.function / csg.op / csg.data / csg.type_decl) and
// emits Cheng functions reproducing the TS semantics. JS `number` maps to
// int64 (the repo is fixed-point throughout for digest determinism; cold
// float→int conversion is miscompiled, findings 2026-06-12). Nullable unions
// over primitives map to JS-falsy zero values ("", 0, false) — semantics
// preserving wherever the source branches on truthiness. Array higher-order
// methods (filter/map/sort/includes) are INLINED into loops, so arrow closures
// capture surrounding locals by simply being in the same scope. Everything
// outside the supported subset is a hard transpile error with diagnostics.
import { createHash } from "node:crypto";
export class TranspilerFactIndex {
    opsById = new Map();
    opsByBlock = new Map();
    functionById = new Map();
    functionByName = new Map();
    dataById = new Map();
    typeDeclByName = new Map();
    constLiterals = new Map();
    constLiteralTypes = new Map();
    // catch-clause parameter names grouped by OWNING FUNCTION id (csg.binding
    // declarationKind="catch" — the owner field is the enclosing csg.function, verified against
    // the real extraction; there is no op-level or block-level owner, so pairing to one try op
    // uses the intersection rule documented at the try lowering site).
    catchParamsByFunction = new Map();
    constructor(facts, functionAliases, baseIndex) {
        if (baseIndex !== undefined) {
            this.opsById = baseIndex.opsById;
            this.opsByBlock = baseIndex.opsByBlock;
            this.functionById = baseIndex.functionById;
            this.functionByName = new Map(baseIndex.functionByName);
            this.dataById = baseIndex.dataById;
            this.typeDeclByName = baseIndex.typeDeclByName;
            this.constLiterals = baseIndex.constLiterals;
            this.constLiteralTypes = baseIndex.constLiteralTypes;
            this.catchParamsByFunction = baseIndex.catchParamsByFunction;
            this.applyFunctionAliases(functionAliases);
            return;
        }
        for (const fact of facts) {
            if (fact.kind === "csg.op") {
                const op = fact;
                this.opsById.set(op.id, op);
                const block = typeof op.block === "string" ? op.block : "";
                if (!this.opsByBlock.has(block))
                    this.opsByBlock.set(block, []);
                this.opsByBlock.get(block).push(op);
            }
            else if (fact.kind === "csg.function") {
                const id = String(fact.id);
                this.functionById.set(id, fact);
                const name = typeof fact.name === "string" ? fact.name : "";
                if (name && name !== "<anonymous>" && !this.functionByName.has(name)) {
                    this.functionByName.set(name, fact);
                }
            }
            else if (fact.kind === "csg.data") {
                this.dataById.set(String(fact.id), fact.value);
            }
            else if (fact.kind === "csg.binding") {
                const b = fact;
                if (b.declarationKind === "catch" && typeof b.owner === "string" && typeof b.name === "string") {
                    if (!this.catchParamsByFunction.has(b.owner))
                        this.catchParamsByFunction.set(b.owner, new Set());
                    this.catchParamsByFunction.get(b.owner).add(b.name);
                }
            }
            else if (fact.kind === "csg.symbol") {
                // `as const` module constants carry their VALUE in the type text:
                // readonly ["a","b",...] tuples and literal types inline at use sites.
                const name = String(fact.name ?? "");
                const declKind = String(fact.declarationKind ?? "");
                const typeText = String(fact.type ?? "");
                if (name.length > 0 && declKind === "const" && !this.constLiterals.has(name)) {
                    const chengConstExpr = typeof fact.chengConstExpr === "string" ? String(fact.chengConstExpr) : "";
                    const chengType = typeof fact.chengType === "string" ? String(fact.chengType) : "";
                    if (chengConstExpr.length > 0 && chengType.length > 0) {
                        this.constLiterals.set(name, chengConstExpr);
                        this.constLiteralTypes.set(name, chengType);
                        continue;
                    }
                    const tuple = /^readonly \[(.*)\]$/.exec(typeText.trim());
                    if (tuple) {
                        const items = tuple[1].match(/"([^"]*)"/g);
                        if (items && items.length > 0) {
                            this.constLiterals.set(name, `[${items.join(", ")}]`);
                            this.constLiteralTypes.set(name, "str[]");
                        }
                    }
                    else if (/^"[^"]*"$/.test(typeText.trim())) {
                        this.constLiterals.set(name, typeText.trim());
                        this.constLiteralTypes.set(name, "str");
                    }
                    else if (/^-?\d+$/.test(typeText.trim())) {
                        this.constLiterals.set(name, `int64(${typeText.trim()})`);
                        this.constLiteralTypes.set(name, "int64");
                    }
                }
            }
            else if (fact.kind === "csg.type_decl") {
                const name = String(fact.name ?? "");
                if (name && !this.typeDeclByName.has(name))
                    this.typeDeclByName.set(name, fact);
            }
        }
        this.applyFunctionAliases(functionAliases);
        for (const ops of this.opsByBlock.values()) {
            ops.sort((a, b) => (Number(a.ordinal) || 0) - (Number(b.ordinal) || 0));
        }
    }
    // Names registered through applyFunctionAliases (component-local useCallback/const-arrow
    // aliases) — as opposed to real module-level functions that also live in functionByName. An
    // alias target is a component-closure function: it may read the enclosing component's free
    // vars, so calls to it must pass the injected free-var actuals and its compilation must inject
    // the same free-var params (S2 alias-fv slice). Module functions get NEITHER treatment.
    aliasNames = new Set();
    applyFunctionAliases(functionAliases) {
        if (functionAliases === undefined)
            return;
        for (const [name, fid] of functionAliases) {
            if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name))
                continue;
            if (this.functionByName.has(name))
                continue;
            const target = this.functionById.get(fid);
            if (target !== undefined) {
                this.functionByName.set(name, target);
                this.aliasNames.add(name);
            }
        }
    }
}
// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------
export class TypeMapper {
    usedStructs = new Set();
    index;
    constructor(index) {
        this.index = index;
    }
    map(typeSource) {
        let t = stripImportPrefixes(String(typeSource)).trim();
        while (t.startsWith("(") && t.endsWith(")") && balancedParens(t))
            t = t.slice(1, -1).trim();
        if (t.length === 0)
            return { reason: "empty type" };
        if (t === "number")
            return { type: "int64" };
        if (t === "string")
            return { type: "str" };
        if (t === "boolean" || t === "bool" || t === "true" || t === "false")
            return { type: "bool" };
        if (t === "HTMLVideoElement")
            return { type: "int64" };
        // MediaStream (mechanism 13, cht-voice-dual-state-bridge §3.3): same "opaque host handle ->
        // int64 id" contract as HTMLVideoElement above — Cheng never models the browser/WebView
        // WebRTC engine's internal MediaStream structure, only carries the host-assigned handle.
        if (t === "MediaStream")
            return { type: "int64" };
        if (t === "void")
            return { type: "void" };
        if (/^['"].*['"]$/.test(t))
            return { type: "str" };
        if (/^-?\d+$/.test(t))
            return { type: "int64" };
        if (t.endsWith("[]")) {
            const elem = this.map(t.slice(0, -2));
            if (elem.type === undefined)
                return { reason: `array element: ${elem.reason}` };
            return { type: `${elem.type}[]` };
        }
        if (t.startsWith("[") && t.endsWith("]")) {
            const tupleItems = splitTopLevelObjectMembers(t.slice(1, -1));
            if (tupleItems.length === 0)
                return { reason: "empty tuple" };
            const mappedItems = tupleItems.map((item) => this.map(item));
            const bad = mappedItems.find((item) => item.type === undefined);
            if (bad)
                return { reason: `tuple element: ${bad.reason}` };
            const first = mappedItems[0].type;
            if (!mappedItems.every((item) => item.type === first))
                return { reason: `heterogeneous tuple '${t}' not supported` };
            return { type: `${first}[]` };
        }
        const arrayMatch = /^(?:Array|ReadonlyArray)\s*<(.+)>$/.exec(t);
        if (arrayMatch) {
            const elem = this.map(arrayMatch[1]);
            if (elem.type === undefined)
                return { reason: `array element: ${elem.reason}` };
            return { type: `${elem.type}[]` };
        }
        // `Promise<T>` unwrap (S2 async-signature slice): an async function's declared Promise return
        // is a transparent wrapper IFF the body contains no `await` — the transpiler has NO await
        // codegen (an `await` op reaching emitExpr fails loudly), so every still-async body keeps
        // failing honestly and only synchronous bodies (whose Promise is unobservable: callers either
        // void the result or `.catch(fn)` it, and mechanism 9's reducible catch already drops the
        // wrapper for statically-provable pure-constant continuations) compile through. A Promise
        // VALUE passed around as data (stored, returned to a caller that awaits it) has no
        // representable Cheng type either way — those paths keep their own honest failures; this
        // unwrap never fabricates a channel for them.
        const promiseMatch = /^Promise\s*<(.+)>$/.exec(t);
        if (promiseMatch)
            return this.map(promiseMatch[1]);
        const partialMatch = /^Partial\s*<(.+)>$/.exec(t);
        if (partialMatch)
            return this.map(partialMatch[1]);
        if (/^Record\s*<\s*string\s*,/.test(t))
            return { type: "json.JsonNode" };
        const inlineObjectMembers = parseInlineObjectTypeMembers(t);
        if (inlineObjectMembers !== undefined) {
            const name = inlineObjectTypeName(t);
            if (!this.index.typeDeclByName.has(name)) {
                this.index.typeDeclByName.set(name, { kind: "synthesized.inline_object_type", name, members: inlineObjectMembers });
            }
            this.usedStructs.add(name);
            return { type: name };
        }
        // `ReturnType<typeof X>`: resolve through the named function's own declared return type
        // (exact identity — e.g. `ReturnType<typeof createRealtimeCallSignalEnvelope>` =
        // RealtimeCallSignalEnvelope). Unknown function or unmapped return type falls through to a
        // reason (no fabrication).
        const returnTypeMatch = /^ReturnType\s*<\s*typeof\s+([A-Za-z_$][\w$]*)\s*>$/.exec(t);
        if (returnTypeMatch) {
            const fn = this.index.functionByName.get(returnTypeMatch[1]);
            if (!fn)
                return { reason: `ReturnType<typeof ${returnTypeMatch[1]}>: function not found` };
            return this.map(String(fn.returnType ?? ""));
        }
        // Indexed access `T['field']` (e.g. `RealtimeChessSignalEnvelope['action']`): exact
        // field-type lookup through the type_decl member table, recursively mapped — the SAME
        // identity a property_read on a value of T would get. A non-decl base, a missing field, or
        // a field type that itself fails to map all fall through to a reason (no fabrication).
        const indexedMatch = /^([A-Za-z_$][\w$]*)\s*\[\s*'([^']+)'\s*\]$/.exec(t);
        if (indexedMatch) {
            const decl = this.index.typeDeclByName.get(indexedMatch[1]);
            if (!decl)
                return { reason: `indexed access base '${indexedMatch[1]}' is not a known type decl` };
            const member = (decl.members ?? []).find((m) => m.name === indexedMatch[2]);
            if (!member)
                return { reason: `indexed access field '${indexedMatch[2]}' not a member of '${indexedMatch[1]}'` };
            return this.map(member.type);
        }
        // `typeof CONST` / `typeof CONST[number]` — resolve through the const-literal type
        // table (string const → str, string-array const indexed by [number] → str). Honest:
        // unknown consts / non-array index fall through to a reason (no fabrication).
        const typeofMatch = /^typeof\s+([A-Za-z_$][\w$]*)\s*(\[\s*number\s*\])?$/.exec(t);
        if (typeofMatch) {
            const ct = this.index.constLiteralTypes.get(typeofMatch[1]);
            if (ct === undefined)
                return { reason: `typeof of unknown const '${typeofMatch[1]}'` };
            if (typeofMatch[2])
                return ct.endsWith("[]") ? { type: ct.slice(0, -2) } : { reason: `typeof ${typeofMatch[1]}[number] on non-array` };
            return { type: ct };
        }
        const isecParts = splitTopLevelIntersection(t);
        if (isecParts.length > 1) {
            // Intersection A & B (& C ...): member-level confluence. Each side must resolve to a
            // struct-shaped type (a type_decl, an inline object, or an alias of either); members
            // merge by union, with a SAME-Cheng-type field collapse for name collisions (TS
            // intersection of compatible types — e.g. RealtimeBaseEnvelope's kind:'dm'|... (maps to
            // str) & { kind: K } with K instantiated as str collapses to str). A collision between
            // DIFFERENT Cheng types is a real narrowing problem, not silently resolved -> fail loud.
            const merged = [];
            const seenFields = new Map();
            let failed;
            const collect = (partText) => {
                if (failed !== undefined)
                    return;
                const mapped = this.map(partText);
                if (mapped.type === undefined) {
                    failed = `intersection side '${partText}': ${mapped.reason}`;
                    return;
                }
                const decl = this.index.typeDeclByName.get(mapped.type);
                if (!decl) {
                    failed = `intersection side '${partText}' is not a struct type (${mapped.type})`;
                    return;
                }
                for (const m of (decl.members ?? [])) {
                    // m.type is TS text on source decls ("string", "A | B") but already a CHENG type name
                    // on synthesized decls ("str" — inline-object members are stored post-mapping), so a
                    // failed map() falls back to the raw text (same raw text on both sides conflates
                    // cleanly; different raw text rejects — never silently coerced).
                    const memberType = this.map(m.type).type ?? m.type;
                    const prior = seenFields.get(m.name);
                    if (prior !== undefined) {
                        if (prior !== (memberType ?? "")) {
                            failed = `intersection member conflict '${m.name}': '${prior}' vs '${memberType ?? "?"}`;
                            return;
                        }
                        continue;
                    }
                    seenFields.set(m.name, memberType ?? "");
                    merged.push(m);
                }
            };
            for (const part of isecParts)
                collect(part);
            if (failed !== undefined)
                return { reason: failed };
            const name = `ChtIntersection_${stableInlineTypeHash(t.replace(/\s+/g, " ").trim())}`;
            if (!this.index.typeDeclByName.has(name)) {
                this.index.typeDeclByName.set(name, { kind: "synthesized.intersection", name, members: merged });
            }
            this.usedStructs.add(name);
            return { type: name };
        }
        const parts = splitTopLevelUnion(t);
        if (parts.length > 1) {
            const nonNull = parts.filter((p) => p !== "null" && p !== "undefined");
            if (nonNull.length === 0)
                return { reason: "union of only null/undefined" };
            if (nonNull.every((p) => /^['"].*['"]$/.test(p)))
                return { type: "str" };
            if (nonNull.every((p) => /^-?\d+$/.test(p)))
                return { type: "int64" };
            if (nonNull.length === 1) {
                const inner = this.map(nonNull[0]);
                if (inner.type === undefined)
                    return { reason: `nullable inner: ${inner.reason}` };
                if (inner.type === "int64" || inner.type === "str" || inner.type === "bool")
                    return { type: inner.type };
                // nullable arrays use the empty array as the falsy sentinel: the
                // ubiquitous `x?.length` / `x ?? []` patterns are semantics-equal
                if (inner.type.endsWith("[]"))
                    return { type: inner.type };
                // nullable Record: the zero JsonNode IS the null node
                if (inner.type === "json.JsonNode")
                    return { type: inner.type };
                if (this.index.typeDeclByName.has(inner.type))
                    return { type: inner.type };
                return { reason: `nullable non-primitive '${nonNull[0]}' not yet supported` };
            }
            if (nonNull.every((p) => /^['"].*['"]$/.test(p) || p === "string"))
                return { type: "str" };
            // Union whose members each independently resolve to str (named string-alias types
            // and `typeof STRING_CONST`, e.g. `PublishType | typeof HOME_APP_CHANNEL`). Pure
            // recursion through the real mapper — no fabrication; mixed/non-str unions still fail.
            if (nonNull.every((p) => this.map(p).type === "str"))
                return { type: "str" };
            return { reason: `union '${t}' not supported` };
        }
        if (this.index.typeDeclByName.has(t)) {
            const decl = this.index.typeDeclByName.get(t);
            const aliasTarget = String(decl.aliasTarget ?? "");
            const members = decl.members ?? [];
            if (members.length === 0 && aliasTarget.length > 0)
                return this.map(aliasTarget);
            if (members.length === 0)
                return { reason: `type decl '${t}' has no members` };
            this.usedStructs.add(t);
            return { type: t };
        }
        return { reason: `unsupported type '${t}'` };
    }
    zeroValueOf(chengType) {
        if (chengType === "int64")
            return "int64(0)";
        if (chengType === "str")
            return "\"\"";
        if (chengType === "bool")
            return "false";
        if (chengType === "json.JsonNode")
            return "json.NewJObject()";
        if (chengType.endsWith("[]"))
            return "[]";
        return "";
    }
    emitStructs() {
        const emitted = new Set();
        const bodies = [];
        const diagnostics = [];
        const queue = [...this.usedStructs];
        while (queue.length > 0) {
            const name = queue.shift();
            if (emitted.has(name))
                continue;
            emitted.add(name);
            const decl = this.index.typeDeclByName.get(name);
            if (!decl) {
                diagnostics.push(`struct '${name}' has no type decl`);
                continue;
            }
            // Inheritance expansion at EMISSION time (CHT_INTERFACE_SUPERS): the extractor records
            // only an interface's OWN members, but a Cheng struct's PHYSICAL layout must carry the
            // inherited fields too (TS interface extends is full-field — the RealtimeBaseEnvelope
            // fields (messageId/timestampMs/...) physically exist on every RealtimeEnvelope member,
            // and their JSON serializations require them). Parent members come FIRST (base layout
            // prefix), own members override on name conflict (same rule as TS extends).
            const ownMembers = decl.members ?? [];
            const superChain = [];
            {
                let cur = CHT_INTERFACE_SUPERS.get(name);
                const seenSupers = new Set();
                while (cur !== undefined && !seenSupers.has(cur)) {
                    seenSupers.add(cur);
                    superChain.unshift(cur);
                    cur = CHT_INTERFACE_SUPERS.get(cur);
                }
            }
            const memberMap = new Map();
            for (const sup of superChain) {
                const supDecl = this.index.typeDeclByName.get(sup);
                for (const m of (supDecl?.members ?? []))
                    if (!memberMap.has(m.name))
                        memberMap.set(m.name, m);
            }
            for (const m of ownMembers)
                memberMap.set(m.name, m);
            const members = [...memberMap.values()];
            const fieldLines = [`    ${name} =`];
            for (const member of members) {
                const before = new Set(this.usedStructs);
                const mapped = this.map(member.type);
                if (mapped.type === undefined) {
                    diagnostics.push(`struct '${name}.${member.name}': ${mapped.reason}`);
                    continue;
                }
                for (const used of this.usedStructs)
                    if (!before.has(used))
                        queue.push(used);
                fieldLines.push(`        ${sanitizeFieldName(member.name)}: ${mapped.type}`);
            }
            if (fieldLines.length > 1)
                bodies.push(fieldLines);
        }
        if (bodies.length === 0)
            return { code: "", diagnostics };
        const lines = ["type"];
        for (const body of bodies)
            lines.push(...body);
        return { code: lines.join("\n"), diagnostics };
    }
}
export function stripImportPrefixes(t) {
    return t.replace(/import\("[^"]*"\)\./g, "");
}
function balancedParens(t) {
    let depth = 0;
    for (let i = 0; i < t.length; i++) {
        if (t[i] === "(")
            depth++;
        else if (t[i] === ")") {
            depth--;
            if (depth === 0 && i < t.length - 1)
                return false;
        }
    }
    return depth === 0;
}
function splitTopLevelUnion(t) {
    const parts = [];
    let depth = 0;
    let current = "";
    for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (ch === "<" || ch === "(" || ch === "[" || ch === "{")
            depth++;
        else if (ch === ">" || ch === ")" || ch === "]" || ch === "}")
            depth--;
        if (ch === "|" && depth === 0) {
            parts.push(current.trim());
            current = "";
            continue;
        }
        current += ch;
    }
    parts.push(current.trim());
    return parts.filter((p) => p.length > 0);
}
function splitTopLevelIntersection(t) {
    const parts = [];
    let depth = 0;
    let quote = "";
    let current = "";
    for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (quote.length > 0) {
            current += ch;
            if (ch === "\\") {
                current += t[i + 1] ?? "";
                i++;
            }
            else if (ch === quote)
                quote = "";
            continue;
        }
        if (ch === "'" || ch === '"' || ch === "`") {
            quote = ch;
            current += ch;
            continue;
        }
        if (ch === "<" || ch === "(" || ch === "[" || ch === "{")
            depth++;
        else if (ch === ">" || ch === ")" || ch === "]" || ch === "}")
            depth--;
        if (ch === "&" && depth === 0) {
            parts.push(current.trim());
            current = "";
            continue;
        }
        current += ch;
    }
    parts.push(current.trim());
    return parts.filter((p) => p.length > 0);
}
function splitTopLevelObjectMembers(t) {
    const parts = [];
    let depth = 0;
    let quote = "";
    let current = "";
    for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (quote.length > 0) {
            current += ch;
            if (ch === "\\" && i + 1 < t.length) {
                i += 1;
                current += t[i];
            }
            else if (ch === quote) {
                quote = "";
            }
            continue;
        }
        if (ch === "\"" || ch === "'") {
            quote = ch;
            current += ch;
            continue;
        }
        if (ch === "<" || ch === "(" || ch === "[" || ch === "{")
            depth++;
        else if (ch === ">" || ch === ")" || ch === "]" || ch === "}")
            depth--;
        if ((ch === ";" || ch === ",") && depth === 0) {
            const item = current.trim();
            if (item.length > 0)
                parts.push(item);
            current = "";
            continue;
        }
        current += ch;
    }
    const tail = current.trim();
    if (tail.length > 0)
        parts.push(tail);
    return parts;
}
function parseInlineObjectTypeMembers(t) {
    const text = t.trim();
    if (!text.startsWith("{") || !text.endsWith("}"))
        return undefined;
    const body = text.slice(1, -1).trim();
    if (body.length === 0)
        return undefined;
    const members = [];
    for (const part of splitTopLevelObjectMembers(body)) {
        const match = /^([A-Za-z_$][\w$]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(\?)?\s*:\s*([\s\S]+)$/.exec(part);
        if (!match)
            return undefined;
        const rawName = match[1];
        const name = rawName.startsWith("\"") || rawName.startsWith("'") ? rawName.slice(1, -1) : rawName;
        members.push({ name, optional: match[2] === "?", type: match[3].trim() });
    }
    return members.length > 0 ? members : undefined;
}
function stableInlineTypeHash(text) {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}
function inlineObjectTypeName(t) {
    return `ChtInlineObj_${stableInlineTypeHash(stripImportPrefixes(t).replace(/\s+/g, " ").trim())}`;
}
const CHENG_KEYWORDS = new Set([
    "type", "fn", "var", "let", "const", "if", "elif", "else", "while", "for",
    "in", "return", "import", "true", "false", "nil", "and", "or", "not",
    "break", "continue", "pass", "struct", "enum", "match", "defer",
]);
function sanitizeFieldName(name) {
    if (CHENG_KEYWORDS.has(name))
        return `f_${name}`;
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `f_${name.replace(/[^A-Za-z0-9_]/g, "_")}`;
}
const BINARY_OPERATOR_MAP = new Map([
    ["PlusToken", "+"],
    ["MinusToken", "-"],
    ["AsteriskToken", "*"],
    ["PercentToken", "%"],
    ["LessThanToken", "<"],
    ["FirstBinaryOperator", "<"], // TS reverse-maps LessThanToken(30) to its alias "FirstBinaryOperator"
    ["LessThanEqualsToken", "<="],
    ["GreaterThanToken", ">"],
    ["GreaterThanEqualsToken", ">="],
    ["EqualsEqualsEqualsToken", "=="],
    ["EqualsEqualsToken", "=="],
    ["ExclamationEqualsEqualsToken", "!="],
    ["ExclamationEqualsToken", "!="],
    ["AmpersandAmpersandToken", "&&"],
    ["BarBarToken", "||"],
]);
// Struct types whose boolean-condition ("truthy"/`!x`) reading has a well-defined presence
// semantics — value maps to `<type>.<field> != <field's zero value>` (mirrors JS's own
// `x !== null` check on the source side: a "not found" struct is decoded to its all-zero
// value, exactly like objBoxRef/mechanism-8's existing convention, and the registered field is
// guaranteed non-zero on every real hit). A struct type with NO entry here has no such
// contract — `emitCondition`/`.find()` must reject it loudly (`this.fail`) rather than silently
// coerce a struct value to bool (there is no such coercion in Cheng, and guessing one would be
// exactly the kind of un-auditable heuristic CLAUDE.md forbids). Add an entry only after
// confirming BY READING THE SOURCE that the field is non-empty/non-zero on every real
// (non-"not found") instance — same audit bar as CHT_LOCAL_DERIVED_VALUES in
// scene-runtime-smoke-source.mjs.
const STRUCT_PRESENCE_FIELDS = new Map([
    // RealtimeCallSession: mechanism 8's `activeVoiceSession` derived value (§ CHT_LOCAL_DERIVED_
    // VALUES in scene-runtime-smoke-source.mjs) and the KV-round-tripped `roomVoiceSessions`
    // useState<RealtimeCallSession[]> slot both decode a "not found"/absent session to the
    // zero-value struct. `sessionId` is built as `voice_room_${roomId}` (ChessPage.tsx:469,
    // gated on truthy roomId; the `voice_${action}_${ts}_${rand}` pattern is the messageId
    // construction, not sessionId) — never empty — so `sessionId == ""` is the correct,
    // audited presence check for both `!activeVoiceSession`-shaped reads and `roomVoiceSessions
    // .find(...)`.
    ["RealtimeCallSession", "sessionId"],
]);
const PRELUDE_SOURCES = new Map([
    ["jsFloorDiv", [
            "fn jsFloorDiv(numer: int64, denom: int64): int64 =",
            "    let q = numer / denom",
            "    let r = numer % denom",
            "    if r != int64(0) && ((numer < int64(0)) != (denom < int64(0))):",
            "        return q - int64(1)",
            "    return q",
        ].join("\n")],
    ["jsNumToStr", [
            "fn jsNumToStr(value: int64): str =",
            "    return strings.IntToStr(int32(value))",
        ].join("\n")],
    ["jsMathMax", [
            "fn jsMathMax(a: int64, b: int64): int64 =",
            "    if a >= b:",
            "        return a",
            "    return b",
        ].join("\n")],
    ["jsMathMin", [
            "fn jsMathMin(a: int64, b: int64): int64 =",
            "    if a <= b:",
            "        return a",
            "    return b",
        ].join("\n")],
    ["jsRandomSuffix36", [
            "# Session-unique base36 suffix for message-id construction (`msg_${ts}_${rand}` idioms).",
            "# JS Math.random() is itself only required to be pseudo-random (the spec demands no",
            "# cryptographic strength), so an LCG seeded from the deterministic host clock is a FAITHFUL",
            "# implementation of the same contract — uniqueness within the session, never a fabricated",
            "# crypto-grade source. The clock seed is mixed with a per-call LCG step so two calls in the",
            "# same millisecond still diverge (the exact collision Math.random suffixes exist to avoid).",
            "var __jsRand36State: int64",
            "",
            "fn jsRandomSuffix36(): str =",
            "    if __jsRand36State == int64(0):",
            "        __jsRand36State = jsDateNow() * int64(1103515245) + int64(12345)",
            "        if __jsRand36State == int64(0):",
            "            __jsRand36State = int64(88172645463325252)",
            "    __jsRand36State = __jsRand36State * int64(1103515245) + int64(12345)",
            "    var x = __jsRand36State & int64(2147483647)",
            "    let digits = \"0123456789abcdefghijklmnopqrstuvwxyz\"",
            "    var out = \"\"",
            "    var i = 0",
            "    while i < 6:",
            "        let d = x % int64(36)",
            "        out = out + strings.SliceBytes(digits, int32(d), 1)",
            "        x = x / int64(36)",
            "        i = i + 1",
            "    return out",
        ].join("\n")],
    ["chtAsyncError", [
            "# Synchronous-collapse async error channel (mechanism-9/10 headless slice): under the",
            "# headless compilation host every async leaf is a synchronous dual-state bridge, so a",
            "# Promise rejection collapses to a plain value-channel write: an async fn's `throw` sets",
            "# this and returns the zero value; `await` (and Promise.all's own snapshot/merge logic)",
            "# checks it right after the operand call and either propagates (no enclosing try -> return",
            "# the zero value, channel preserved) or enters the nearest catch (enclosing try -> move to",
            "# the try mark and break out of the try shell). Never a runtime fallback, never a mock:",
            "# the value carried is always the REAL Error message thrown in the source.",
            "var __chtAsyncError: str",
        ].join("\n")],
    ["jsStrTrim", [
            "fn jsStrTrim(value: str): str =",
            "    let n = len(value)",
            "    var lo = 0",
            "    while lo < n && (value[lo] == 32 || value[lo] == 9 || value[lo] == 10 || value[lo] == 13):",
            "        lo = lo + 1",
            "    var hi = n",
            "    while hi > lo && (value[hi - 1] == 32 || value[hi - 1] == 9 || value[hi - 1] == 10 || value[hi - 1] == 13):",
            "        hi = hi - 1",
            "    if lo == 0 && hi == n:",
            "        return value",
            "    return strings.SliceBytes(value, lo, hi - lo)",
        ].join("\n")],
    ["jsStrToInt", [
            "# Number(str): integer prefix parse; non-numeric -> 0 (JS NaN folds to the",
            "# falsy zero sentinel in the int64 model)",
            "fn jsStrToInt(value: str): int64 =",
            "    var i = 0",
            "    let n = len(value)",
            "    var neg = false",
            "    if i < n && value[i] == 45:",
            "        neg = true",
            "        i = i + 1",
            "    var acc = int64(0)",
            "    var any = false",
            "    while i < n && value[i] >= 48 && value[i] <= 57:",
            "        acc = acc * int64(10) + int64(value[i] - 48)",
            "        any = true",
            "        i = i + 1",
            "    if !any:",
            "        return int64(0)",
            "    if neg:",
            "        return int64(0) - acc",
            "    return acc",
        ].join("\n")],
    ["jsStrToLower", [
            "# ASCII lowercase; non-ASCII bytes (CJK) pass through unchanged.",
            "fn jsStrToLower(value: str): str =",
            "    let n = len(value)",
            "    if n == 0:",
            "        return value",
            "    var b = rawbytes.BytesAlloc(n)",
            "    for i in 0..<n:",
            "        var c = value[i]",
            "        if c >= 65 && c <= 90:",
            "            c = c + 32",
            "        rawbytes.BytesSet(b, i, c)",
            "    return rawbytes.BytesToString(b)",
        ].join("\n")],
    ["jsIntSqrt", [
            "fn jsIntSqrt(value: int64): int64 =",
            "    if value <= int64(0):",
            "        return int64(0)",
            "    var lo = int64(0)",
            "    var hi = value",
            "    if hi > int64(3037000499):",
            "        hi = int64(3037000499)",
            "    while lo < hi:",
            "        let mid = (lo + hi + int64(1)) / int64(2)",
            "        if mid * mid <= value:",
            "            lo = mid",
            "        else:",
            "            hi = mid - int64(1)",
            "    return lo",
        ].join("\n")],
    ["jsDateNow", [
            "# Deterministic host clock: the app tick sets this each frame; harness and",
            "# digest replay inject fixed values.",
            "var __jsNowMs: int64",
            "",
            "fn jsSetNowMs(value: int64) =",
            "    __jsNowMs = value",
            "",
            "fn jsDateNow(): int64 =",
            "    return __jsNowMs",
            "",
            "fn jsDateIsLeapYear(year: int64): bool =",
            "    if year % int64(400) == int64(0):",
            "        return true",
            "    if year % int64(100) == int64(0):",
            "        return false",
            "    return year % int64(4) == int64(0)",
            "",
            "fn jsDateDaysBeforeYear(year: int64): int64 =",
            "    let y = year - int64(1)",
            "    return y * int64(365) + y / int64(4) - y / int64(100) + y / int64(400)",
            "",
            "fn jsDateEpochDayFromMs(ms: int64): int64 =",
            "    let dayMs = int64(86400000)",
            "    var days = ms / dayMs",
            "    if ms < int64(0) && ms % dayMs != int64(0):",
            "        days = days - int64(1)",
            "    return days",
            "",
            "fn jsDateFullYearFromEpochMs(ms: int64): int64 =",
            "    let epochDays = jsDateEpochDayFromMs(ms)",
            "    let baseDays = jsDateDaysBeforeYear(int64(1970))",
            "    var year = int64(1970) + epochDays / int64(365)",
            "    while jsDateDaysBeforeYear(year + int64(1)) - baseDays <= epochDays:",
            "        year = year + int64(1)",
            "    while jsDateDaysBeforeYear(year) - baseDays > epochDays:",
            "        year = year - int64(1)",
            "    return year",
            "",
            "fn jsDateGetFullYearNow(): int64 =",
            "    return jsDateFullYearFromEpochMs(jsDateNow())",
        ].join("\n")],
    ["jsMathAbs", [
            "fn jsMathAbs(value: int64): int64 =",
            "    if value < int64(0):",
            "        return int64(0) - value",
            "    return value",
        ].join("\n")],
]);
const STATEMENT_OP_KINDS = new Set([
    "var_statement", "local_write", "assign", "property_write", "element_write",
    "return", "branch_if", "block", "for_of", "for_count", "while", "expression",
    "statement", "try", "throw", "await",
]);
// Interface inheritance registry (hand-audited against realtimeProtocol.ts — the extractor
// records only an interface's OWN declared members, never its `extends` parentage; every
// RealtimeEnvelope union member extends RealtimeBaseEnvelope there (lines 15-23 for the base,
// per-member `extends RealtimeBaseEnvelope` clauses verified by reading the source), so the
// shared envelope fields (protocol/kind/action/messageId/conversationId/timestampMs/peerId)
// resolve through this exact table. Same "hand-audited, not a generic analyzer" contract as
// CHT_STRUCT_REF_TYPES / STRUCT_PRESENCE_FIELDS.
const CHT_INTERFACE_SUPERS = new Map([
    ["RealtimeDmMessageEnvelope", "RealtimeBaseEnvelope"],
    ["RealtimeAppInviteEnvelope", "RealtimeBaseEnvelope"],
    ["RealtimeCallSignalEnvelope", "RealtimeBaseEnvelope"],
    ["RealtimeChessSignalEnvelope", "RealtimeBaseEnvelope"],
    ["RealtimeDoudizhuSignalEnvelope", "RealtimeBaseEnvelope"],
]);
// Dual-state bridge RETURN types (hand-audited, one row per bridge impl in CHT_BRIDGE_IMPLS —
// the impls are our own generated code, so the declared return type IS the contract). exprType
// of a call to one of these callees reads this table; everything else keeps its normal path.
const CHT_BRIDGE_RETURN_TYPES = new Map([
    // Keys are the SOURCE callee texts exprType sees at the call op (not the bridge fn names —
    // those only exist after emitCall's bridge rewrite).
    ["normalizeCallSignalForTransport", "str"],
    ["sendManagedSocialDm", "bool"],
    ["prepareUiDirectRoute", "bool"],
    ["ensureLocalVoiceMedia", "int64"],
    ["hydrateIceConfig", "scene.WebSceneWebRtcIceConfigRecord"],
    ["chtBridgeNormalizeCallSignalForTransport", "str"],
]);
// Default-parameter actuals registry (hand-audited against UniMaker source, verified by
// reading it — the extractor records only `initializerKind` ("CallExpression"/"StringLiteral")
// for an optional parameter, NEVER the default value itself, and regenerating the extraction
// is off-limits for byte-stability. A call passing fewer arguments than the target's declared
// parameters is legal ONLY when every missing trailing parameter is optional AND has an
// audited default expression registered here (ChessPage.tsx:516 `updatedAt = Date.now()` for
// handleClose's `finalizeRoomVoiceSessions(closeAction)`, ChessPage.tsx:760 `content = ''`
// for handleVoiceAction's `await sendCallEnvelope(envelope)`). Anything else is a real arity
// mismatch and must fail loudly — NEVER pad with a zero value (a zero timestamp would
// fabricate semantics).
const CHT_DEFAULT_PARAM_VALUES = new Map([
    ["finalizeRoomVoiceSessions.updatedAt", "jsDateNow()"],
    ["sendCallEnvelope.content", "\"\""],
    // ChessPage.tsx:575 `content = ` — leaveCurrentRoom's `void sendRealtimeEnvelope(envelope)`
    // passes one argument (verified by reading the source).
    ["sendRealtimeEnvelope.content", "\"\""],
]);
const NO_HOIST = [];
export class ChengFunctionTranspiler {
    index;
    types;
    diagnostics = [];
    preludeUsed = new Set();
    fnId = "";
    fnName = "";
    localTypes = new Map();
    constBindings = new Map();
    tmpCounter = 0;
    // call-site monomorphization: unknown/any/T parameters instantiated with the
    // argument types observed at the call (queued for the dependency closure)
    monomorphRequests = [];
    // Struct/array types that need a __chtJsonOf_<T> / __chtJsonArray_<hash> encoder
    // emitted by the .mjs side (chtBuildJsonHelpers) — requested at sendManagedSocialDm
    // and realtimeSessionStore.applyEnvelope payload flattening (see emitCall).
    jsonStructEncoderRequests = new Set();
    jsonStructEncoderName(type) {
        return `__chtJsonOf_${String(type).replace(/[^A-Za-z0-9_]/g, "_")}`;
    }
    jsonArrayEncoderName(type) {
        return `__chtJsonArray_${createHash("sha1").update(String(type)).digest("hex").slice(0, 10)}`;
    }
    // block-bodied array-method arrow arguments (guard-clause early returns, e.g.
    // `.filter((x) => { if (a) return false; ...; return expr; })`) are compiled as
    // standalone named helper functions (see compileBlockArrowHelper) instead of the
    // single-expression inline path — their generated `fn` text collects here so
    // transpileClosure appends them to its output alongside the main closure body.
    auxiliaryFunctions = [];
    // deferred-effect lowering: `window.setTimeout(() => <effect>, <msLiteral>)` inside a handler
    // becomes a real wall-clock async frame. The synchronous handler emits
    // `__asyncRegisterDeferred(int32(<kind>), int32(<ms>))` here; the deferred callback body is
    // captured (its target function id + ms) so transpileClosure can emit the resume function the
    // pump runs once <ms> real wall-clock ms have elapsed (host monotonic clock). Single-threaded.
    deferredFrameKind = undefined; // injected by transpileClosure
    deferredResumeCallbackFid = undefined; // captured callback target fid
    deferredMs = 0; // captured literal ms
    // async-IIFE await-split lowering: `void (async () => { try { await <send> } catch {...}
    // finally {...} })()`. The IIFE call op carries `calleeFn` (the inner async function_value).
    // To lower the await to a real recv-done frame the transpiler needs (a) a non-blocking
    // send-ISSUE bridge for the awaited call (issues bytes, returns the (side, streamId) the
    // recv-done frame polls) and (b) a real content-id/like source for the send args. The
    // recvDoneFrameKind is injected by the CHT only when those production seams are present.
    recvDoneFrameKind = undefined; // injected by transpileClosure
    recvDoneResumeCallbackFid = undefined; // captured inner-fn finally/resume fid
    externNames;
    // useState setter names backed by emitStateSlots-generated `fn setX(value)` functions
    // in the same compilation unit: a `setX(...)` call-statement is emitted verbatim and
    // resolved by the Cheng compiler against that generated setter (the CHT state-write path).
    stateSetterNames;
    // host-capability bridges: a host method-call path (e.g. "navigator.clipboard.writeText",
    // "localStorage.setItem") → the flat name of a real @importc Cheng function that implements it.
    // The call is emitted as `<flatName>(args)`; its body is supplied via externImpls (the FFI
    // boundary for platform I/O — clipboard/storage/etc. — that the transpiled subset cannot model).
    hostBridges;
    // names of bridged host objects (e.g. a React useRef like `videoRef`) whose `.current` is owned
    // by the native bridge. The handler is only dispatched for a live node, so the ref is always
    // present: `videoRef.current` reads as `true` (used in guards), and `videoRef.current.method()`
    // calls resolve through hostBridges by their full callee path. Never a value, never fabricated data.
    hostObjects;
    // mutable-box useRefs holding a SCALAR (str/bool/int64), used as instance storage (only
    // `ref.current` read/written, never `.field`/DOM). Each maps to a CHT state slot var: a
    // `ref.current` read emits the slot var, `ref.current = v` writes it. Lossless, no fabrication.
    boxRefSlots; // refName -> chengType
    // object mutable-box useRefs holding {field: scalar}|null, used as instance storage. Each
    // decomposes into a `present` bool slot + one scalar slot per field. `ref.current = null` →
    // present=false; `ref.current = {f:v}` → present=true + field slots; `ref.current.f` → field
    // slot; `ref.current` truthiness → present. Lossless field decomposition, no fabrication.
    objBoxRefSlots; // refName -> (field -> chengType)
    // Set<string> mutable-box useRefs (mechanism 11), used only via `.current.has/add/clear`. Each
    // maps to a KV-synced `str[]` CHT slot var (element type always "str"). `.has(x)`/`.add(x)`/
    // `.clear()` lower to the production JSON-string-array primitives (WebSceneJsonStringArrayContains
    // / a dedup-checked `add` / `setLen(...,0)`) against that slot var directly. Lossless, no fabrication.
    setBoxRefSlots; // refName -> elemType ("str")
    // array-of-struct mutable-box useRefs (mechanism 12), used only via `.current = []` (clear),
    // `.current.push(...xs)` (spread-append), `[...ref.current]` (copy-read), `.current.length`.
    // Each maps to a KV-synced `<ChengStruct>[]` CHT slot var — elemType is the qualified Cheng
    // struct name (e.g. "scene.WebSceneIceCandidateRecord"), keyed off ARR_BOX_REF_ELEM_TYPES in
    // scene-runtime-smoke-source.mjs (the sole classifier — this class only consumes the resolved
    // map, mirroring setBoxRefSlots/objBoxRefSlots above). Slot var naming reuses boxRefSlotVar —
    // arrBoxRefs is disjoint from scalarBoxRefs/objBoxRefs/setBoxRefs by construction (the .mjs
    // classifier assigns each ref to at most one family).
    arrBoxRefSlots; // refName -> qualified Cheng elemType
    // struct mutable-box useRefs (mechanism 14, ChessPage.tsx iceConfigRef family): a
    // `useRef<T | null>(null)` used only via a BARE `.current` read (truthy condition or a whole-
    // value return — never `.current.<field>`) and a whole-value write (`.current = null` or
    // `.current = <identifier>`). Each maps to a KV-synced single struct CHT slot var — the
    // singular counterpart to arrBoxRefSlots above (an array-of-struct slot), keyed off
    // CHT_STRUCT_REF_TYPES in scene-runtime-smoke-source.mjs (the sole classifier — this class only
    // consumes the resolved map). Slot var naming reuses boxRefSlotVar; structBoxRefs is disjoint
    // from scalarBoxRefs/objBoxRefs/setBoxRefs/arrBoxRefs by construction (the .mjs classifier
    // assigns each ref to at most one family).
    structBoxRefSlots; // refName -> qualified Cheng struct type
    // async await-split send-ISSUE bridges: an awaited send callee (e.g. "setDistributedContentLike")
    // -> the flat name of a real non-blocking issue function (writes bytes, arms a recv-done handle).
    // Only present when a production issue+poll seam exists; otherwise the await-split fails honestly.
    recvDoneSendBridges;
    // Mechanism 15 (RTCPeerConnection alias-teardown fold): handle box-refs (a subset of boxRefSlots,
    // int64-typed) that additionally have a registered teardown bridge — refName -> config. Consumed
    // ONLY by tryFoldHandleTeardown (see handleAliasSource below); every scalar box-ref outside this
    // family (bool/str/plain int64/MediaStream) is simply absent here, same "hand-audited, not
    // fabricated" contract as every other *BoxRefSlots map above.
    handleTeardownBridges;
    // State-setter slot types (setter name -> slot Cheng type), threaded from the .mjs stateType
    // maps so a literal `null` passed to a state setter zero-fills by the SLOT'S OWN type
    // (int64(0) for an int64 handle like MediaStream, false for bool, "" for str, [] for arrays,
    // json.NewJObject() for JsonNode, a fresh zero var for structs) — never the blanket "" that
    // literal-null emission otherwise produces (a str zero passed to an int64 slot is a hard
    // cold type error).
    setterTypes;
    // Mechanism 22 (prop-callback navigation dispatch): callee name -> semantic kind, resolved by
    // the .mjs side against the handler's OWN route's csg.web.scene.component_prop fact (exact
    // identity: routeId + propName + unique expression + optional===false — never a name guess).
    // Currently the only kind is "close-app": a zero-arg call to the callback prop (e.g. ChessPage
    // handleClose's `onClose()`, expression closeCurrentApp) lowers to the generated
    // __csg_scene_prop_callback_close_app() navigation-pop helper (source-aware, nav-stack backed).
    propCallbacks;
    // Mechanism 21 (ref-state-mirror `.current` fold): names of useRef bindings ADMITTED by the
    // .mjs side (CHT_REF_STATE_MIRRORS + its structural admission gate — fidelity proof, write-site
    // and read-site audits all live there; this class only consumes the admitted name set). For
    // such a ref, the mirrored useState slot is injected as this function's free-var parameter
    // UNDER THE REF'S OWN NAME (the .mjs puts the ref name in freeVarTypes with the mirrored
    // state's Cheng type), so a bare `<mirrorRef>.current` deref folds to the parameter itself.
    // Field-level access (`.current.x`) and writes never reach emitExpr — admission rejects the
    // whole handler before transpilation if any exist. Disjoint from every *BoxRefSlots family by
    // construction (the .mjs classifier assigns a ref to at most one family, and a mirror ref is
    // never a KV-synced slot of its own — its truth source IS the mirrored state slot).
    refStateMirrors;
    // Mechanism 15: local variable name -> the handle box-ref name it was read from, recorded when a
    // `local_write` binds `const <alias> = <handleBoxRef>.current;` (see the "local_write" case).
    // Consulted by tryFoldHandleTeardown to recognize a LATER `if (<alias>) {...}` in the SAME
    // function as the teardown idiom. Scoped per-transpile (cleared in transpile()/
    // transpileWithInjectedParams(), mirroring localTypes.clear()) — never leaks across functions.
    //
    // ★ r3 alias-escape fix (registration-time whole-function exclusivity, not ordinal-interval):
    // an entry is only EVER written here if functionHasOtherWriteToName (below) proves, by scanning
    // EVERY op of the owning function (every block, any nesting depth, regardless of ordinal position
    // relative to this declaration or to any later use), that no other `local_write`/`assign` targets
    // this exact name anywhere else in the function. This is a static existence check, not a
    // declaration-to-use ordinal range: an ordinal-range check is unsound for loops, because a write
    // positioned AFTER a guard in program order still executes BEFORE that guard's evaluation on the
    // next loop iteration (the extractor assigns one static ordinal per loop-body statement, not one
    // per dynamic execution — see emitOp/newBlock in csg-core.ts, loop bodies are a single emitted
    // block walked once). Reassignment (`connection = x;`, incl. compound `??=`/`+=`), conditional
    // reassignment (inside any `if`/`else` branch), loop-body reassignment (inside `while`/`for`/
    // `for_of`/`for_in`), and same-name shadowing redeclaration at any nested-block depth are all
    // ordinary `local_write`/`assign` ops carrying this function's id — all uniformly disqualify
    // registration, independent of where in the function they appear. A disjoint-branch shadow
    // (e.g. `if (a) { const connection = ref.current; ...fold-site... } else { const connection = 5;
    // }`) is over-conservatively refused too (the two `connection`s can never actually interfere) —
    // accepted as a missed optimization, never a correctness risk, per this file's fail-closed
    // contract. Because safety is decided once at registration time, tryFoldHandleTeardown needs no
    // separate re-check: a name is either never in this map, or was proven exclusive for the whole
    // function before being added.
    handleAliasSource = new Map();
    // See handleAliasSource above. `declOpId` is the id of the alias's own binding `local_write` (to
    // exclude it from matching itself); every OTHER op of `ownerFunctionId`, in every block the fact
    // index knows about, is checked for a `local_write` re-declaring `name`, an `assign` whose `left`
    // resolves to an `identifier` op named `name`, OR a `for_of` loop whose OWN iteration binding
    // (carried in the op's `initializerName` FIELD — codegen emits it as `let <name> = <iter>[<i>]`
    // inside the loop body, see the "for_of" case above — not a separate `local_write`/`assign` op,
    // so it needs its own explicit check here) shadows `name`. `for_count`/`for_in`/`while` loops
    // have no generic codegen (unmodeled, fail loud on their own — see emitBlockInner's dispatch),
    // so `for_of` is the only loop-shaped binding that can actually reach generated code. Pure
    // read-only lookup over already-fully-extracted static facts (extraction completes before any
    // codegen runs), so this is correct regardless of the order in which the codegen walk visits
    // blocks/statements.
    functionHasOtherWriteToName(ownerFunctionId, name, declOpId) {
        for (const ops of this.index.opsByBlock.values()) {
            for (const op of ops) {
                if (op.function !== ownerFunctionId || op.id === declOpId)
                    continue;
                if (op.opKind === "local_write" && String(op.name ?? "") === name)
                    return true;
                if (op.opKind === "assign") {
                    const leftOp = this.index.opsById.get(String(op.left));
                    if (leftOp && leftOp.opKind === "identifier" && String(leftOp.name ?? "") === name)
                        return true;
                }
                if (op.opKind === "for_of" && String(op.initializerName ?? "") === name)
                    return true;
            }
        }
        return false;
    }
    constructor(index, types, externNames, stateSetterNames, hostBridges, hostObjects, boxRefSlots, objBoxRefSlots, setBoxRefSlots, recvDoneSendBridges, arrBoxRefSlots, structBoxRefSlots, handleTeardownBridges, refStateMirrors, propCallbacks, setterTypes) {
        this.index = index;
        this.types = types;
        this.externNames = externNames ?? new Set();
        this.stateSetterNames = stateSetterNames ?? new Set();
        this.hostBridges = hostBridges ?? new Map();
        this.hostObjects = hostObjects ?? new Set();
        this.boxRefSlots = boxRefSlots ?? new Map();
        this.objBoxRefSlots = objBoxRefSlots ?? new Map();
        this.setBoxRefSlots = setBoxRefSlots ?? new Map();
        this.recvDoneSendBridges = recvDoneSendBridges ?? new Map();
        this.arrBoxRefSlots = arrBoxRefSlots ?? new Map();
        this.structBoxRefSlots = structBoxRefSlots ?? new Map();
        this.handleTeardownBridges = handleTeardownBridges ?? new Map();
        this.refStateMirrors = refStateMirrors ?? new Set();
        this.propCallbacks = propCallbacks ?? new Map();
        this.setterTypes = setterTypes ?? new Map();
    }
    // Handler-only narrowing (set by transpileClosure's narrowAnyReturnToVoid): a CHT-compiled
    // handler's return value is unobservable through the dispatch ABI, so an any/unknown-typed
    // expression-body arrow may narrow its declared return to void (body lowers to side effects).
    narrowAnyReturnToVoid = false;
    // Owner-scoped state setters (minified inline-arrow handlers): a useState setter captured from
    // the arrow's lexical owner (e.g. `v` from `const [x, v] = useState(...)`) must emit its
    // OWNER-KEYED setter fn, never the bare name (cross-component collision) and never the /^set/
    // prefix derivation (minified names break it).
    setterEmitNames = new Map(); // callee -> emitted setter fn name
    setterStateNames = new Map(); // callee -> state name (functional updater)
    // Owner-scoped useRef slots (minified inline-arrow handlers): `.current` still lowers to the
    // slot var, but the var is OWNER-KEYED (`__cht_ro_<owner8>_<name>`) — the bare `__chtRef_<name>`
    // would be a cross-component first-match for minified single-letter ref names.
    boxRefGlobalNames = new Map(); // ref source name -> owner-keyed slot var
    // Event-type propagation into the dependency closure: when the entry handler's param is
    // ChtEvent (params:event class), callees reached from it take the same event object — an
    // any/unknown-typed param named e/event/ev narrows to it (declared types still win).
    preferredEventParamType;
    // Prop-callee aliases (context/mount-resolved member calls: `u.onItemFocus(...)`): the
    // receiver is a context/props placeholder; the member's exact function id comes from the
    // CHT's mount/context index (unique value, ambiguity poisoned upstream).
    propCalleeAliases = new Map();
    // ------------------------------------------------------------------
    // Object-literal value model (Phase 1): an object literal `{a: expr, b: expr}`
    // used as a VALUE with no named struct type synthesizes a named Cheng struct.
    // The name is deterministic from the sorted (field-name, scalar-type) set, so the
    // same shape reuses one type decl (no duplicate decls). Scalar fields only
    // (str/bool/int64); a non-scalar field value falls through to the NEXT atom.
    // The synthesized decl is registered on the shared index so emitStructs() emits it.
    // ------------------------------------------------------------------
    chengScalarToTsType(t) {
        if (t === "int64")
            return "number";
        if (t === "str")
            return "string";
        if (t === "bool")
            return "boolean";
        return undefined;
    }
    // Infer the synthesized struct shape of an object literal: each property's value must
    // type to a scalar (int64/str/bool). Returns the sorted field list or undefined if any
    // field is non-scalar / un-inferable (the nested-value NEXT atom).
    objectLiteralShape(op) {
        const props = op.properties ?? [];
        if (props.length === 0)
            return undefined;
        const fields = [];
        for (const prop of props) {
            const ct = this.exprType(prop.value);
            const ts = ct === undefined ? undefined : this.chengScalarToTsType(ct);
            if (ts === undefined)
                return undefined;
            fields.push({ name: prop.name, cheng: ct, ts });
        }
        fields.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        return fields;
    }
    // Deterministic struct name from the sorted (field, type) set. Same shape -> same name.
    synthStructName(fields) {
        const sig = fields.map((f) => `${sanitizeFieldName(f.name)}_${f.cheng}`).join("__");
        return `ChtObj_${sig}`;
    }
    // Register (idempotently) a synthesized struct decl on the shared index and mark it used,
    // so the module emitter declares it. Returns the type name.
    synthesizeObjectStruct(op) {
        const fields = this.objectLiteralShape(op);
        if (fields === undefined)
            return undefined;
        const name = this.synthStructName(fields);
        if (!this.index.typeDeclByName.has(name)) {
            // member.type stored as TS-source scalar so emitStructs()'s TypeMapper.map() resolves it.
            const members = fields.map((f) => ({ name: sanitizeFieldName(f.name), optional: false, type: f.ts }));
            this.index.typeDeclByName.set(name, { kind: "synthesized.object_literal", name, members });
        }
        this.types.map(name); // adds to usedStructs
        return name;
    }
    // slot var naming (shared convention with the CHT dispatcher that declares + KV-syncs them).
    objBoxRefPresentVar(refName) { return `__chtRefP_${refName}`; }
    objBoxRefFieldVar(refName, field) { return `__chtRefF_${refName}_${field}`; }
    // op is `<objBoxRef>.current` — returns the ref name if so, else undefined.
    objBoxRefCurrentName(op) {
        if (String(op.name) !== "current")
            return undefined;
        const recv = this.index.opsById.get(String(op.receiver));
        if (!recv || recv.opKind !== "identifier")
            return undefined;
        const rn = String(recv.name);
        return this.objBoxRefSlots.has(rn) ? rn : undefined;
    }
    // op is `<objBoxRef>.current.<field>` — returns {refName, field} if so.
    objBoxRefFieldAccess(op) {
        const recv = this.index.opsById.get(String(op.receiver));
        if (!recv || recv.opKind !== "property_read")
            return undefined;
        const refName = this.objBoxRefCurrentName(recv);
        if (refName === undefined)
            return undefined;
        const fields = this.objBoxRefSlots.get(refName);
        const field = String(op.name);
        return fields.has(field) ? { refName, field } : undefined;
    }
    // `<boxRef>.current` — a scalar mutable-box ref deref backed by a CHT slot var. Returns the
    // ref name if op is exactly `<boxRef>.current` for a known box-ref slot, else undefined.
    boxRefCurrentName(op) {
        if (String(op.name) !== "current")
            return undefined;
        const recv = this.index.opsById.get(String(op.receiver));
        if (!recv || recv.opKind !== "identifier")
            return undefined;
        const rn = String(recv.name);
        return this.boxRefSlots.has(rn) ? rn : undefined;
    }
    boxRefSlotVar(refName) { return this.boxRefGlobalNames.get(refName) ?? `__chtRef_${refName}`; }
    // `<setBoxRef>.current` — a Set<string> mutable-box ref backed by a KV-synced `str[]` CHT slot
    // (mechanism 11). Returns the ref name if op is exactly `<setBoxRef>.current` for a known
    // set box-ref slot, else undefined. Slot var naming reuses boxRefSlotVar — scalarBoxRefs,
    // objBoxRefs and setBoxRefs are disjoint name sets (the .mjs classifier assigns each ref to
    // at most one family), so `__chtRef_<name>` never collides across families.
    setBoxRefCurrentName(op) {
        if (String(op.name) !== "current")
            return undefined;
        const recv = this.index.opsById.get(String(op.receiver));
        if (!recv || recv.opKind !== "identifier")
            return undefined;
        const rn = String(recv.name);
        return this.setBoxRefSlots.has(rn) ? rn : undefined;
    }
    // `<arrBoxRef>.current` — an array-of-struct mutable-box ref backed by a KV-synced `<Struct>[]`
    // CHT slot var (mechanism 12). Returns the ref name if op is exactly `<arrBoxRef>.current` for a
    // known array box-ref slot, else undefined. `.current` itself has NO generic bare-expression
    // resolution here (mirroring setBoxRefCurrentName) — it is only ever resolved as part of one of
    // the three whitelisted shapes (clear-reassign / spread-push / spread-copy-read) plus `.length`,
    // each intercepted at its own call site below; any other use of `.current` on an array box-ref
    // falls through to the ordinary unsupported-property/unsupported-call fail paths.
    arrBoxRefCurrentName(op) {
        if (String(op.name) !== "current")
            return undefined;
        const recv = this.index.opsById.get(String(op.receiver));
        if (!recv || recv.opKind !== "identifier")
            return undefined;
        const rn = String(recv.name);
        return this.arrBoxRefSlots.has(rn) ? rn : undefined;
    }
    // `<structBoxRef>.current` — a struct mutable-box ref backed by a KV-synced single-struct CHT
    // slot var (mechanism 14). Returns the ref name if op is exactly `<structBoxRef>.current` for a
    // known struct box-ref slot, else undefined. Slot var naming reuses boxRefSlotVar (disjoint name
    // space from every other box-ref family, same guarantee as arrBoxRefCurrentName above).
    structBoxRefCurrentName(op) {
        if (String(op.name) !== "current")
            return undefined;
        const recv = this.index.opsById.get(String(op.receiver));
        if (!recv || recv.opKind !== "identifier")
            return undefined;
        const rn = String(recv.name);
        return this.structBoxRefSlots.has(rn) ? rn : undefined;
    }
    // Runtime-only presence cache field on the struct slot var itself (`__chtRef_<name>.present`) —
    // NOT a separate KV-synced slot (mirrors objBoxRefPresentVar's NAME convention only; the value
    // lives INSIDE the struct, not a sibling module-level var — see WebSceneWebRtcIceConfigRecord's
    // own `present` field doc in web_scene_runtime.cheng for the full KV-sentinel rationale).
    structBoxRefPresentExpr(refName) { return `${this.boxRefSlotVar(refName)}.present`; }
    // `<mirrorRef>.current` — a ref-state-mirror deref (mechanism 21). Returns the ref name if op
    // is exactly `<mirrorRef>.current` for an admitted mirror ref, else undefined. Same shape-check
    // contract as the box-ref family matchers above (op name `current` over a bare identifier
    // receiver); disjoint name space guaranteed by the .mjs classifier.
    refStateMirrorCurrentName(op) {
        if (String(op.name) !== "current")
            return undefined;
        const recv = this.index.opsById.get(String(op.receiver));
        if (!recv || recv.opKind !== "identifier")
            return undefined;
        const rn = String(recv.name);
        return this.refStateMirrors.has(rn) ? rn : undefined;
    }
    // Mechanism 15 helper: the "logical" statement ops of a block, unwrapping the extractor's
    // single-op `{opKind:"block", nestedBlock}` wrapper chain (the SAME wrapping emitBlockInner's own
    // "block" case recurses through) AND filtering out sub-expression ops referenced by another op in
    // the same block (the EXACT `referenced` computation emitBlockInner itself does at the top of its
    // own loop — duplicated here, not reused, since emitBlockInner's copy is local to that method) so
    // tryFoldHandleTeardown sees the same "top-level statement" list emitBlockInner would actually
    // iterate, not the raw op soup (which also includes each property-write's own literal/identifier
    // operands). Never used for actual codegen — emitBlock/emitBlockInner remain the only paths that
    // ever produce output; this is a pure read-only peek.
    resolveStatementBlockOps(blockId, ownerFunctionId) {
        let cur = blockId;
        for (;;) {
            const ops = (this.index.opsByBlock.get(cur) ?? []).filter((o) => o.function === ownerFunctionId);
            if (ops.length === 1 && ops[0].opKind === "block" && typeof ops[0].nestedBlock === "string") {
                cur = String(ops[0].nestedBlock);
                continue;
            }
            const referenced = new Set();
            for (const op of ops) {
                for (const key of ["left", "right", "operand", "value", "condition", "receiver", "argument"]) {
                    const v = op[key];
                    if (typeof v === "string")
                        referenced.add(v);
                }
                for (const listKey of ["arguments", "spanOpIds", "elements"]) {
                    const list = op[listKey];
                    if (Array.isArray(list))
                        for (const a of list)
                            if (typeof a === "string")
                                referenced.add(a);
                }
            }
            return ops.filter((op) => !(referenced.has(op.id) && !STATEMENT_OP_KINDS.has(op.opKind)));
        }
    }
    // Mechanism 15 (RTCPeerConnection alias-teardown fold, ChessPage.tsx releaseVoiceRuntime 692-700):
    // recognizes `if (<alias>) { <alias>.<prop1> = null; ...; try { <alias>.<closeMethod>() } catch
    // {} }` — EXACTLY the registered eventProps in order, nothing more/fewer, guarding a try/catch
    // whose try-body is EXACTLY one zero-arg <closeMethod> call and whose catch-body is EXACTLY
    // empty — and folds it into one host bridge call over the alias's own (already int64-typed) value.
    // A partial/reordered/extra-statement/non-empty-catch/`finally`/`else` shape does NOT match: this
    // returns undefined and the caller falls through to the ordinary branch_if codegen unchanged,
    // which then fails loud on the unmodeled property-write-on-int64-receiver / bare-try-statement
    // (neither has a generic codegen path) — never a silent partial translation.
    tryFoldHandleTeardown(condOp, branchOp, ownerFunctionId, indent) {
        if (condOp.opKind !== "identifier" || typeof branchOp.elseBlock === "string" || typeof branchOp.thenBlock !== "string")
            return undefined;
        const aliasName = String(condOp.name);
        const refName = this.handleAliasSource.get(aliasName);
        if (refName === undefined)
            return undefined;
        const cfg = this.handleTeardownBridges.get(refName);
        if (cfg === undefined)
            return undefined;
        const stmts = this.resolveStatementBlockOps(branchOp.thenBlock, ownerFunctionId);
        if (stmts.length !== cfg.eventProps.length + 1)
            return undefined;
        for (let i = 0; i < cfg.eventProps.length; i++) {
            const s = stmts[i];
            if (s.opKind !== "property_write" || String(s.name) !== cfg.eventProps[i])
                return undefined;
            const recv = this.index.opsById.get(String(s.receiver));
            if (!recv || recv.opKind !== "identifier" || String(recv.name) !== aliasName)
                return undefined;
            const val = this.index.opsById.get(String(s.value));
            const isNull = (val?.opKind === "literal" && this.index.dataById.get(String(val.data)) === null)
                || (val?.opKind === "identifier" && (val.name === "null" || val.name === "undefined"));
            if (!isNull)
                return undefined;
        }
        const tryStmt = stmts[cfg.eventProps.length];
        if (tryStmt.opKind !== "try" || typeof tryStmt.tryBlock !== "string" || typeof tryStmt.catchBlock !== "string" || typeof tryStmt.finallyBlock === "string")
            return undefined;
        const tryStmts = this.resolveStatementBlockOps(tryStmt.tryBlock, ownerFunctionId);
        if (tryStmts.length !== 1)
            return undefined;
        const closeCall = tryStmts[0];
        if (closeCall.opKind !== "call" || String(closeCall.memberName || "") !== cfg.closeMethod || (closeCall.arguments ?? []).length !== 0)
            return undefined;
        const closeRecv = this.index.opsById.get(String(closeCall.receiver));
        if (!closeRecv || closeRecv.opKind !== "identifier" || String(closeRecv.name) !== aliasName)
            return undefined;
        if (this.resolveStatementBlockOps(tryStmt.catchBlock, ownerFunctionId).length !== 0)
            return undefined;
        const handleExpr = this.renameOf(aliasName);
        return [indent + `if ${handleExpr} != int64(0):`, indent + `    ${cfg.bridgeFn}(${handleExpr})`];
    }
    // `window.setTimeout(() => <effect>, <msLiteral>)` (or bare `setTimeout(...)`) — the deferred-
    // effect pattern. Returns the callback target function id + the integer ms literal, else
    // undefined. Exact shape only: arg0 a function_value, arg1 a numeric literal. No heuristic.
    matchSetTimeoutDeferred(op) {
        const callee = String(op.callee ?? op.calleeText ?? "");
        if (callee !== "window.setTimeout" && callee !== "setTimeout")
            return undefined;
        const argIds = op.arguments ?? [];
        if (argIds.length !== 2)
            return undefined;
        const cb = this.index.opsById.get(String(argIds[0]));
        if (!cb || cb.opKind !== "function_value")
            return undefined;
        const callbackFid = String(cb.targetFunction ?? "");
        if (callbackFid.length === 0)
            return undefined;
        const msOp = this.index.opsById.get(String(argIds[1]));
        if (!msOp || msOp.opKind !== "literal")
            return undefined;
        const raw = this.index.dataById.get(String(msOp.data));
        if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0)
            return undefined;
        return { callbackFid, ms: raw };
    }
    // async-IIFE await-split: `void (async () => { <pre> try { await <send>(args) } catch {...}
    // finally {<post>} })()`. The call op carries `calleeFn` resolving (through a function_value
    // op) to the inner async fn. Returns the inner fn id + its single await op + the awaited send
    // call op, else undefined. EXACT shape only: a calleeFn-bearing call op whose inner fn has a
    // single `await` over a single call expression. No heuristic — the link is the explicit
    // calleeFn edge the CSG emitter stamps for an IIFE callee (csg-core.ts emitExpression).
    matchAsyncIifeAwait(op) {
        if (typeof op.calleeFn !== "string")
            return undefined;
        const fvOp = this.index.opsById.get(String(op.calleeFn));
        if (!fvOp || fvOp.opKind !== "function_value")
            return undefined;
        const innerFid = String(fvOp.targetFunction ?? "");
        if (innerFid.length === 0)
            return undefined;
        const innerFn = this.index.functionById.get(innerFid);
        if (!innerFn || innerFn.async !== true)
            return undefined;
        const innerOps = [...(this.index.opsByBlock.values())].flat().filter((o) => o.function === innerFid);
        const awaits = innerOps.filter((o) => o.opKind === "await");
        if (awaits.length !== 1)
            return undefined; // single-await split only (chained awaits = NEXT atom)
        const awaitOp = awaits[0];
        const sendCallOp = this.index.opsById.get(String(awaitOp.value));
        if (!sendCallOp || sendCallOp.opKind !== "call")
            return undefined;
        return { innerFid, awaitOp, sendCallOp };
    }
    // Lower the matched async-IIFE await-split. seg0 (this handler) issues the real send and
    // registers a recv-done frame, then suspends; the inner fn's post-await body becomes the
    // resume fn (emitted by transpileClosure via emitAsyncResumeBody). The await is honestly
    // lowerable ONLY when (1) a recv-done frame kind is injected (the CHT enabled the runtime),
    // (2) a non-blocking send-ISSUE bridge exists for the awaited callee, and (3) the send args
    // (content.id / like) resolve to real sources. Any missing piece FAILS with the precise wall
    // reason — never a fabricated frame, never a dropped effect.
    lowerAsyncIifeAwaitSplit(iife, lines, pre, indent) {
        if (this.recvDoneFrameKind === undefined) {
            this.fail(iife.sendCallOp.id, "async await-split not enabled for this handler (no recv-done frame kind)");
            return;
        }
        const callee = String(iife.sendCallOp.callee ?? iife.sendCallOp.calleeText ?? "");
        const issueBridge = this.recvDoneSendBridges.get(callee);
        if (issueBridge === undefined) {
            this.fail(iife.sendCallOp.id, `async await: no production non-blocking send-issue bridge for '${callee}'`);
            return;
        }
        if (this.recvDoneResumeCallbackFid !== undefined) {
            this.fail(iife.sendCallOp.id, "multiple async await-splits in one handler not supported");
            return;
        }
        // resolve the send args to real exprs — fails honestly if a source is missing. Two arg shapes:
        //  (a) positional scalars (content.id, !isLiked) → emit each directly (moment-like/comment).
        //  (b) a single object-literal options arg ({contentId, channel, reasonCode, detail}) → FLATTEN
        //      its property values to positional scalar args, in source order, matching the issue
        //      bridge signature `<bridge>(contentId, channel, reasonCode, detail)`. The object never
        //      materializes as a struct; each field expr (logical-or, template literal, builtins) is
        //      lowered through emitExpr exactly as a normal value (report handler).
        const argIds = iife.sendCallOp.arguments ?? [];
        let argExprs;
        const soleArgOp = argIds.length === 1 ? this.index.opsById.get(String(argIds[0])) : undefined;
        if (soleArgOp && soleArgOp.opKind === "object_literal") {
            const props = soleArgOp.properties ?? [];
            argExprs = props.map((p) => this.emitExpr(p.value, pre, indent));
        }
        else {
            argExprs = argIds.map((a) => this.emitExpr(a, pre, indent));
        }
        if (this.diagnostics.length > 0)
            return; // an arg source failed honestly
        lines.push(...pre);
        // seg0: issue the real send (bytes out the socket) — returns the (side, streamId, ackLen)
        // the recv-done frame polls — then arm the frame and suspend (return). The issue bridge
        // signature is `<bridge>(<sendArgs...>): <recv-done handle>` and registers internally.
        lines.push(indent + `${issueBridge}(${argExprs.join(", ")})`);
        lines.push(indent + `__asyncRegisterRecvDone(int32(${this.recvDoneFrameKind}), __asyncSendSide(), __asyncSendStream(), int32(1), int32(5000))`);
        this.recvDoneResumeCallbackFid = iife.innerFid;
    }
    // Public entry so transpileClosure can emit the captured deferred-effect callback body as a
    // standalone resume function (run by the pump). Reuses this transpiler's full config so the
    // deferred `setX(false)` resolves to the same generated state setter. Returns the body lines
    // (indent depth 1) or undefined on any diagnostic.
    emitDeferredResumeBody(callbackFid) {
        const before = this.diagnostics.length;
        const entry = this.entryBlockOf(callbackFid);
        if (entry === undefined) {
            this.fail("", "deferred resume: callback entry block not found");
            return undefined;
        }
        const lines = this.emitBlock(entry, 1, callbackFid);
        if (this.diagnostics.length > before)
            return undefined;
        return lines;
    }
    // async await-split resume body: the inner async fn's POST-await statements. The recv-done
    // success path runs the try/catch/finally tail after the send completes — for the moment-like
    // handler that is the `finally { setEngagementBusy(null) }` block. The pre-await/send was
    // already issued in seg0, so here we emit ONLY the finally block (the deterministic post-await
    // state update). Returns the body lines (indent depth 1) or undefined on any diagnostic.
    emitAsyncResumeBody(innerFid) {
        const before = this.diagnostics.length;
        const innerOps = [...(this.index.opsByBlock.values())].flat().filter((o) => o.function === innerFid);
        const tryOp = innerOps.find((o) => o.opKind === "try");
        if (!tryOp || typeof tryOp.finallyBlock !== "string") {
            this.fail("", "async resume: inner async fn has no finally block to run post-await");
            return undefined;
        }
        const lines = this.emitBlock(String(tryOp.finallyBlock), 1, innerFid);
        if (this.diagnostics.length > before)
            return undefined;
        return lines;
    }
    // `<hostObject>.current` — a bridged ref deref. True (present) by the bridge contract.
    hostObjectCurrentRead(op) {
        if (String(op.name) !== "current")
            return false;
        const recv = this.index.opsById.get(String(op.receiver));
        return !!recv && recv.opKind === "identifier" && this.hostObjects.has(String(recv.name));
    }
    hostVideoRefCurrentName(op) {
        if (String(op.name) !== "current")
            return undefined;
        const recv = this.index.opsById.get(String(op.receiver));
        if (!recv || recv.opKind !== "identifier")
            return undefined;
        const name = String(recv.name);
        if ((name === "videoRef" || name === "hiResVideoRef") && this.hostObjects.has(name))
            return name;
        return undefined;
    }
    // Field lookup across the hand-audited inheritance registry (CHT_INTERFACE_SUPERS): own
    // members first, then the registered parent chain (single/multi-level), never by name
    // coincidence with an unrelated decl.
    typeDeclFieldOf(typeName, fieldName) {
        let cur = typeName;
        const seen = new Set();
        while (cur !== undefined && !seen.has(cur)) {
            seen.add(cur);
            const decl = this.index.typeDeclByName.get(cur);
            const member = decl ? (decl.members ?? []).find((m) => m.name === fieldName) : undefined;
            if (member)
                return member;
            cur = CHT_INTERFACE_SUPERS.get(cur);
        }
        return undefined;
    }
    // The declared type of an OPTIONAL field named `fieldName` found in ANY inline-object
    // parameter annotation of the function currently being compiled (call-site-instantiated
    // instances omit such fields — the annotation is the exact provenance, never a guess).
    optionalAbsentFieldType(fieldName) {
        const fn = this.index.functionById.get(this.fnId);
        for (const p of (fn?.parameters ?? [])) {
            const src = String(p.typeSource ?? "");
            if (!src.includes("{"))
                continue;
            const members = parseInlineObjectTypeMembers(src);
            if (!members)
                continue;
            const hit = members.find((m) => m.name === fieldName && m.optional === true);
            if (hit) {
                const mapped = this.types.map(hit.type).type;
                if (mapped !== undefined)
                    return mapped;
                if (/(^|\W)string(\W|$)/.test(hit.type))
                    return "str";
                if (/(^|\W)number(\W|$)/.test(hit.type))
                    return "int64";
                if (/(^|\W)boolean(\W|$)/.test(hit.type))
                    return "bool";
            }
        }
        return undefined;
    }
    // Zero-value EXPRESSION for an absent optional field of the given Cheng type, emitting any
    // needed declarations into `pre` (struct zero requires a fresh var; scalars are inline).
    zeroValueExprFor(chengType, pre, indent) {
        if (chengType === "str")
            return `""`;
        if (chengType === "int64")
            return "int64(0)";
        if (chengType === "bool")
            return "false";
        if (chengType === "json.JsonNode")
            return "json.NewJObject()";
        if (chengType.endsWith("[]"))
            return "[]";
        const z = this.freshVar("absent");
        pre.push(`${indent}var ${z}: ${chengType}`);
        return z;
    }
    // True when the operand is an undefined/null atom (identifier "undefined"/"null" or a null
    // literal) — the only shapes whose absence collapses to the other operand's zero value in
    // `||`/`&&` value semantics.
    isUndefinedishOperand(opId) {
        const o = this.index.opsById.get(opId);
        if (!o)
            return false;
        if (o.opKind === "identifier")
            return o.name === "undefined" || o.name === "null";
        if (o.opKind === "literal")
            return this.index.dataById.get(String(o.data)) === null;
        return false;
    }
    hostVideoHandleExpr(refName) {
        return refName === "hiResVideoRef" ? "int64(2)" : "int64(1)";
    }
    // `document.fullscreenElement` — DOM fullscreen state, backed by an explicit host bridge.
    hostFullscreenElementRead(op) {
        if (String(op.name) !== "fullscreenElement")
            return false;
        const recv = this.index.opsById.get(String(op.receiver));
        return !!recv && recv.opKind === "identifier" && String(recv.name) === "document";
    }
    // Free-var names injected as leading params by the CURRENT transpile (transpileWithInjected
    // Params), in declaration order — the actual suffix/prefix list alias calls must pass (S2
    // alias-fv slice). Empty under plain transpile() (no injection). const:-prefixed bindings are
    // compile-time constants, never params, so they are excluded.
    injectedFvNames = [];
    // Synchronous-collapse try/catch state (mechanism-9/10 headless slice): a stack of per-try
    // mark variable names (each try lowers to `var <mark>: str = ""; while true: <tryBody> break`
    // — a `throw` inside writes the REAL Error message to the mark and breaks; the catch runs
    // when the mark is non-empty). catchParamStack holds the catch-clause parameter name (or ""
    // for a parameterless catch) so `error.message` / `error instanceof Error` can be reduced
    // by exact identity below. throwShellHasLoop is set while emitting a try body that contains
    // no loop op — the while-shell break only ever targets the shell because a `throw`/`await`
    // inside a loop would break the wrong level; such try bodies fail loudly instead.
    tryMarkStack = [];
    catchParamStack = [];
    currentReturnType = "void";
    // Return-type text with call-site generic instantiations applied: a parameter annotated with
    // a single capital letter (K/A/...) that carries an override type is substituted into the
    // declared return type at identifier-word boundaries (e.g. buildBaseEnvelope<K, A>'s
    // `RealtimeBaseEnvelope & { kind: K; action: A }` becomes `... & { kind: str; action: str }`
    // for the __str_str instance). No override -> the declared text unchanged (exact identity,
    // never a heuristic rewrite).
    returnTypeWithOverrides(fn, paramOverrides) {
        let text = String(fn.returnType ?? "void");
        if (paramOverrides === undefined || paramOverrides.size === 0)
            return text;
        const params = fn.parameters ?? [];
        for (const [pi, overrideType] of paramOverrides) {
            const src = String(params[pi]?.typeSource ?? "").trim();
            if (/^[A-Z]$/.test(src))
                text = text.replace(new RegExp(`\\b${src}\\b`, "g"), overrideType);
        }
        return text;
    }
    // Union RETURN-TYPE narrowing for a call-site-instantiated callee (envelope-construction
    // family): when the declared union return type does not map, the member that maps to the
    // SAME Cheng type as one of the call-site parameter overrides is the instantiated return
    // type (e.g. normalizeCallSignalForTransport__str's `Record<string, unknown> | string |
    // undefined` narrows to str). Exactly one matching member is required — zero matches (the
    // callee returns something the instance never produces) or several (genuinely ambiguous)
    // both keep the honest failure.
    returnTypeNarrowedForInstance(fn, paramOverrides) {
        const declared = String(fn.returnType ?? "");
        if (this.types.map(declared).type !== undefined || paramOverrides === undefined || paramOverrides.size === 0)
            return undefined;
        if (!declared.includes("|"))
            return undefined;
        const overrideTypes = new Set([...paramOverrides.values()]);
        const matches = splitTopLevelUnion(declared)
            .map((m) => this.types.map(m.trim()).type)
            .filter((t) => t !== undefined && overrideTypes.has(t));
        const unique = [...new Set(matches)];
        return unique.length === 1 ? unique[0] : undefined;
    }
    transpileWithInjectedParams(functionId, emitName, freeVarTypes, paramTypes, paramOverrides) {
        const fn = this.index.functionById.get(functionId);
        if (!fn) {
            return { ok: false, name: emitName, code: "", preludeUsed: new Set(), structsUsed: new Set(), diagnostics: [{ functionId, functionName: emitName, opId: "", reason: "function fact not found" }] };
        }
        this.fnId = functionId;
        this.fnName = emitName;
        this.localTypes.clear();
        this.handleAliasSource.clear();
        this.tmpCounter = 0;
        const paramDecls = [];
        this.injectedFvNames = [];
        for (const [name, t] of freeVarTypes) {
            if (t.startsWith("const:")) {
                this.constBindings.set(name, t.slice("const:".length));
                continue;
            }
            this.localTypes.set(name, t);
            paramDecls.push(`${name}: ${t}`);
            this.injectedFvNames.push(name);
        }
        // The closure's OWN parameters (e.g. handleMorePanelAction(action)) — bound per-node by the
        // caller (the CHT dispatcher passes the node-resolved value). Type via the supplied
        // paramOverrides (a call-site monomorph instance — e.g. a union-typed alias parameter
        // instantiated with the concrete argument type, mechanism-union slice), else the supplied
        // paramTypes, else the param's own annotation; FAIL on an untyped param (never silently
        // leave it unresolved).
        let paramOverrideIndex = -1;
        for (const p of (fn.parameters ?? [])) {
            paramOverrideIndex += 1;
            const pname = String(p.name ?? "");
            if (pname.length === 0 || freeVarTypes.has(pname))
                continue;
            let pt = paramOverrides?.get(paramOverrideIndex) ?? paramTypes?.get(pname);
            if (pt === undefined) {
                // Real extraction writes parameter annotations to typeSource (the field transpile()
                // itself reads); type/typeText are the fixture-era spellings. Read typeSource FIRST or a
                // real annotated alias parameter (e.g. finalizeRoomVoiceSessions's lastAction:
                // 'reject' | 'end') reports "no inferable type" — never swap the priority of the other two.
                const ann = String(p.typeSource ?? p.type ?? p.typeText ?? "");
                pt = ann.length > 0 ? this.types.map(ann).type : undefined;
            }
            if (pt === undefined) {
                this.fail("", `parameter '${pname}' has no inferable type (supply via paramTypes)`);
                return this.result("");
            }
            this.localTypes.set(pname, pt);
            paramDecls.push(`${pname}: ${pt}`);
        }
        const narrowedRet = this.returnTypeNarrowedForInstance(fn, paramOverrides);
        const retText = this.returnTypeWithOverrides(fn, paramOverrides);
        let ret = narrowedRet !== undefined ? { type: narrowedRet } : this.types.map(retText);
        if (ret.type === undefined && this.narrowAnyReturnToVoid && /^(?:any|unknown)?$/.test(retText.trim()))
            ret = { type: "void" };
        if (ret.type === undefined) {
            this.fail("", `return type: ${ret.reason}`);
            return this.result("");
        }
        this.currentReturnType = ret.type;
        const entryBlock = this.entryBlockOf(functionId);
        if (entryBlock === undefined) {
            this.fail("", "entry block not found");
            return this.result("");
        }
        const bodyLines = this.emitBlock(entryBlock, 1, functionId);
        if (this.diagnostics.length > 0)
            return this.result("");
        const header = `fn ${emitName}(${paramDecls.join(", ")}): ${ret.type} =`;
        const fallback = ret.type === "void" ? ["    return"] : [`    return ${this.types.zeroValueOf(ret.type) || "0"}`];
        return this.result([header, ...(bodyLines.length > 0 ? bodyLines : fallback)].join("\n"));
    }
    transpile(functionId, emitNameOverride, paramOverrides) {
        const fn = this.index.functionById.get(functionId);
        if (!fn) {
            return { ok: false, name: "", code: "", preludeUsed: new Set(), structsUsed: new Set(), diagnostics: [{ functionId, functionName: "", opId: "", reason: "function fact not found" }] };
        }
        this.fnId = functionId;
        this.fnName = emitNameOverride ?? (typeof fn.name === "string" ? fn.name : "<anonymous>");
        this.localTypes.clear();
        this.handleAliasSource.clear();
        this.tmpCounter = 0;
        this.injectedFvNames = [];
        const params = fn.parameters ?? [];
        const paramDecls = [];
        for (let pi = 0; pi < params.length; pi++) {
            const p = params[pi];
            const override = paramOverrides?.get(pi);
            let mapped = override !== undefined ? { type: override } : this.types.map(String(p.typeSource ?? ""));
            if (mapped.type === undefined
                && this.preferredEventParamType !== undefined
                && ![...this.propCalleeAliases.values()].includes(functionId) // prop-callee targets have item semantics, never the event
                && /^(e|event|ev)$/i.test(String(p.name ?? "")))
                mapped = { type: this.preferredEventParamType };
            if (mapped.type === undefined || mapped.type === "void") {
                this.fail("", `parameter '${p.name}': ${mapped.reason ?? "void parameter"}`);
                return this.result("");
            }
            this.localTypes.set(p.name, mapped.type);
            paramDecls.push(`${p.name}: ${mapped.type}`);
        }
        const narrowedRet = this.returnTypeNarrowedForInstance(fn, paramOverrides);
        const ret = narrowedRet !== undefined ? { type: narrowedRet } : this.types.map(this.returnTypeWithOverrides(fn, paramOverrides));
        if (ret.type === undefined) {
            this.fail("", `return type: ${ret.reason}`);
            return this.result("");
        }
        this.currentReturnType = ret.type;
        const entryBlock = this.entryBlockOf(functionId);
        if (entryBlock === undefined) {
            this.fail("", "entry block not found");
            return this.result("");
        }
        const bodyLines = this.emitBlock(entryBlock, 1, functionId);
        if (this.diagnostics.length > 0)
            return this.result("");
        const header = `fn ${this.fnName}(${paramDecls.join(", ")}): ${ret.type} =`;
        const fallback = ret.type === "void" ? ["    return"] : [`    return ${this.types.zeroValueOf(ret.type) || "0"}`];
        const body = bodyLines.length > 0 ? bodyLines : fallback;
        return this.result([header, ...body].join("\n"));
    }
    result(code) {
        return {
            ok: this.diagnostics.length === 0 && code.length > 0,
            name: this.fnName,
            code,
            preludeUsed: new Set(this.preludeUsed),
            structsUsed: new Set(this.types.usedStructs),
            diagnostics: [...this.diagnostics],
        };
    }
    fail(opId, reason) {
        this.diagnostics.push({ functionId: this.fnId, functionName: this.fnName, opId, reason });
    }
    freshVar(hint) {
        this.tmpCounter += 1;
        return `__t${this.tmpCounter}_${hint}`;
    }
    entryBlockOf(functionId) {
        let best;
        let bestOrdinal = Number.POSITIVE_INFINITY;
        const nested = new Set();
        for (const ops of this.index.opsByBlock.values()) {
            for (const op of ops) {
                if (op.function !== functionId)
                    continue;
                if (op.opKind === "block" && typeof op.nestedBlock === "string")
                    nested.add(op.nestedBlock);
                if (op.opKind === "branch_if") {
                    if (typeof op.thenBlock === "string")
                        nested.add(op.thenBlock);
                    if (typeof op.elseBlock === "string")
                        nested.add(op.elseBlock);
                }
                if (typeof op.bodyBlock === "string")
                    nested.add(op.bodyBlock);
                // try/catch/finally blocks are nested bodies of the try statement (same rule as
                // branch_if arms above) — without this a try body can be mis-elected as the entry
                // block and compiled WITHOUT its try shell (mechanism-9/10).
                if (op.opKind === "try") {
                    if (typeof op.tryBlock === "string")
                        nested.add(op.tryBlock);
                    if (typeof op.catchBlock === "string")
                        nested.add(op.catchBlock);
                    if (typeof op.finallyBlock === "string")
                        nested.add(op.finallyBlock);
                }
            }
        }
        for (const [blockId, ops] of this.index.opsByBlock) {
            const first = ops.find((op) => op.function === functionId);
            if (!first || nested.has(blockId))
                continue;
            const ord = Number(first.ordinal) || 0;
            if (ord < bestOrdinal) {
                bestOrdinal = ord;
                best = blockId;
            }
        }
        return best;
    }
    // ownerFunctionId: ops in nested arrow bodies belong to the arrow's function
    // id; when inlining we pass that id so block filtering still works.
    emitBlock(blockId, depth, ownerFunctionId) {
        // Cheng locals are block-scoped: roll back names declared inside this
        // block so sibling branches re-declare their own (e.g. `const now` in
        // both arms of an if/else).
        const declaredBefore = new Set(this.localTypes.keys());
        try {
            return this.emitBlockInner(blockId, depth, ownerFunctionId);
        }
        finally {
            for (const key of [...this.localTypes.keys()]) {
                if (!declaredBefore.has(key))
                    this.localTypes.delete(key);
            }
        }
    }
    emitBlockInner(blockId, depth, ownerFunctionId) {
        const indent = "    ".repeat(depth);
        const ops = (this.index.opsByBlock.get(blockId) ?? []).filter((op) => op.function === ownerFunctionId);
        const referenced = new Set();
        for (const op of ops) {
            for (const key of ["left", "right", "operand", "value", "condition", "receiver", "argument"]) {
                const v = op[key];
                if (typeof v === "string")
                    referenced.add(v);
            }
            for (const listKey of ["arguments", "spanOpIds", "elements"]) {
                const list = op[listKey];
                if (Array.isArray(list))
                    for (const a of list)
                        if (typeof a === "string")
                            referenced.add(a);
            }
        }
        const lines = [];
        // Operands of statement-position logical/comma binaries are emitted by emitLogicalStatement
        // (control-flow lowering) — the op-level loop must not emit them a second time (measured:
        // `k.current = t, A.current = e.clientX` wrote each ref slot twice).
        const logicalHandled = new Set();
        const collectLogicalOperands = (opId) => {
            const sub = this.index.opsById.get(opId);
            if (!sub)
                return;
            if (sub.opKind === "binary" && ["AmpersandAmpersandToken", "BarBarToken", "CommaToken"].includes(String(sub.operator))) {
                logicalHandled.add(String(sub.id));
                collectLogicalOperands(String(sub.left));
                collectLogicalOperands(String(sub.right));
                return;
            }
            logicalHandled.add(String(sub.id));
        };
        for (const op of ops) {
            if (referenced.has(op.id))
                continue;
            if (op.opKind === "binary" && ["AmpersandAmpersandToken", "BarBarToken", "CommaToken"].includes(String(op.operator))) {
                collectLogicalOperands(String(op.left));
                collectLogicalOperands(String(op.right));
            }
        }
        for (const op of ops) {
            if (logicalHandled.has(String(op.id)))
                continue;
            if (referenced.has(op.id) && !STATEMENT_OP_KINDS.has(op.opKind))
                continue;
            const pre = [];
            switch (op.opKind) {
                case "return": {
                    const v = typeof op.value === "string" ? this.emitExpr(op.value, pre, indent) : undefined;
                    lines.push(...pre);
                    if (v !== undefined && this.currentReturnType === "void" && this.narrowAnyReturnToVoid) {
                        // any-typed expression-body arrow narrowed to void (handler-only): the return value
                        // is unobservable through the dispatch ABI — keep the side effects, drop the value.
                        if (v.length > 0)
                            lines.push(indent + v);
                        lines.push(indent + "return");
                    }
                    else {
                        lines.push(indent + (v !== undefined ? `return ${v}` : "return"));
                    }
                    break;
                }
                case "branch_if": {
                    // Mechanism 15: recognize the RTCPeerConnection alias-teardown idiom BEFORE the generic
                    // condition/then-block emission below — a match replaces the whole `if` statement with
                    // one folded bridge call; a non-match (condOp undefined, alias unrecognized, shape not
                    // exact) returns undefined and falls through to the unchanged generic path.
                    const condOpForFold = this.index.opsById.get(String(op.condition));
                    const folded = condOpForFold ? this.tryFoldHandleTeardown(condOpForFold, op, ownerFunctionId, indent) : undefined;
                    if (folded !== undefined) {
                        lines.push(...folded);
                        break;
                    }
                    const cond = this.emitCondition(String(op.condition), pre, indent);
                    if (cond === "false" || cond === "(!true)") {
                        if (typeof op.elseBlock === "string")
                            lines.push(...this.emitBlock(op.elseBlock, depth, ownerFunctionId));
                        break;
                    }
                    if (cond === "true" || cond === "(!false)") {
                        if (typeof op.thenBlock === "string")
                            lines.push(...this.emitBlock(op.thenBlock, depth, ownerFunctionId));
                        break;
                    }
                    lines.push(...pre);
                    lines.push(indent + `if ${cond}:`);
                    const thenLines = typeof op.thenBlock === "string" ? this.emitBlock(op.thenBlock, depth + 1, ownerFunctionId) : [];
                    lines.push(...(thenLines.length > 0 ? thenLines : [indent + "    pass"]));
                    if (typeof op.elseBlock === "string") {
                        const elseLines = this.emitBlock(op.elseBlock, depth + 1, ownerFunctionId);
                        if (elseLines.length > 0) {
                            lines.push(indent + "else:");
                            lines.push(...elseLines);
                        }
                    }
                    break;
                }
                case "block": {
                    if (typeof op.nestedBlock === "string")
                        lines.push(...this.emitBlock(op.nestedBlock, depth, ownerFunctionId));
                    break;
                }
                case "var_statement":
                case "local_write": {
                    const name = String(op.name ?? "");
                    if (name.length === 0)
                        break; // declaration shell; binding arrives as local_write
                    // Mechanism 15 (RTCPeerConnection alias-teardown fold, ChessPage.tsx releaseVoiceRuntime):
                    // `const <alias> = <handleBoxRef>.current;` — record alias->refName so a LATER
                    // `if (<alias>) {...}` in the SAME function can be recognized by tryFoldHandleTeardown.
                    // The var declaration itself still emits through the ordinary scalar box-ref bare-read
                    // codegen below (boxRefCurrentName's slot-var substitution in emitExpr) — this only adds
                    // the side-channel record, never changes what gets emitted for this statement. Harmless
                    // for every other local_write: boxRefCurrentName only matches an actual box-ref receiver,
                    // and handleTeardownBridges is empty unless that ref has a registered teardown bridge.
                    if (typeof op.value === "string") {
                        const valueOpForAlias = this.index.opsById.get(op.value);
                        const aliasRefName = valueOpForAlias ? this.boxRefCurrentName(valueOpForAlias) : undefined;
                        if (aliasRefName !== undefined && this.handleTeardownBridges.has(aliasRefName)
                            && !this.functionHasOtherWriteToName(ownerFunctionId, name, op.id)) {
                            this.handleAliasSource.set(name, aliasRefName);
                        }
                    }
                    // expected-type backfill: an object literal initializer adopts the
                    // declared/known type of its binding target
                    const expectedTypeSource = typeof op.typeSource === "string"
                        ? op.typeSource
                        : typeof op.typeText === "string"
                            ? op.typeText
                            : undefined;
                    if (typeof op.value === "string" && expectedTypeSource !== undefined) {
                        const valueOp = this.index.opsById.get(op.value);
                        if (valueOp && valueOp.opKind === "object_literal" && typeof valueOp.returnType !== "string") {
                            valueOp.returnType = expectedTypeSource;
                        }
                    }
                    const init = typeof op.value === "string" ? this.emitExpr(String(op.value), pre, indent) : undefined;
                    lines.push(...pre);
                    if (this.localTypes.has(name)) {
                        lines.push(indent + `${name} = ${init ?? "0"}`);
                        break;
                    }
                    const declType = this.inferLocalType(op);
                    if (declType === undefined) {
                        this.fail(op.id, `cannot infer type for local '${name}'`);
                        break;
                    }
                    this.localTypes.set(name, declType);
                    lines.push(indent + (init !== undefined ? `var ${name} = ${init}` : `var ${name}: ${declType}`));
                    break;
                }
                case "property_write": {
                    // Array box-ref clear-reassign (mechanism 12): `<arrBoxRef>.current = []` -> `setLen(slot,
                    // 0)`. This is the ONLY write shape the whitelist covers — any other value written to
                    // `.current` on an array box-ref (a non-empty array literal, a variable holding a whole
                    // replacement array, etc.) fails loudly rather than being silently mistranslated. The .mjs
                    // classifier already fails this ref out of arrBoxRefSlots entirely if ANY use site
                    // (anywhere in the component) isn't one of the three whitelisted shapes, so this check is
                    // a redundant second guard, not the enforcement point itself.
                    const arrRn = this.arrBoxRefCurrentName(op);
                    if (arrRn !== undefined) {
                        const valOp = this.index.opsById.get(String(op.value));
                        const elementCount = valOp && valOp.opKind === "array_literal"
                            ? Number(valOp.elementCount ?? (valOp.elements ?? []).length)
                            : -1;
                        if (elementCount !== 0) {
                            this.fail(op.id, `array box-ref '.current' write on '${arrRn}' only supports clear-reassign ('.current = []') — mechanism 12 whitelist`);
                            break;
                        }
                        lines.push(...pre);
                        lines.push(indent + `setLen(${this.boxRefSlotVar(arrRn)}, 0)`);
                        break;
                    }
                    // object box-ref write `ref.current = null | {f:v}` -> present + field slots.
                    const objRn = this.objBoxRefCurrentName(op);
                    if (objRn !== undefined) {
                        const valOp = this.index.opsById.get(String(op.value));
                        const fields = this.objBoxRefSlots.get(objRn);
                        if (valOp && (valOp.opKind === "literal" || (valOp.opKind === "identifier" && (valOp.name === "null" || valOp.name === "undefined")))) {
                            // `= null` -> cleared (present=false); field slots retain last value (unread while !present)
                            lines.push(...pre);
                            lines.push(indent + `${this.objBoxRefPresentVar(objRn)} = false`);
                            break;
                        }
                        if (valOp && valOp.opKind === "object_literal") {
                            // `= {f:v,...}` -> present=true + each field slot (must cover exactly the known fields)
                            const props = valOp.properties ?? [];
                            const provided = new Map(props.map((p) => [String(p.name), String(p.value)]));
                            if (provided.size !== fields.size || [...fields.keys()].some((f) => !provided.has(f))) {
                                this.fail(op.id, `object box-ref write shape mismatch on '${objRn}'`);
                                break;
                            }
                            const vals = new Map();
                            for (const [f, vid] of provided)
                                vals.set(f, this.emitExpr(vid, pre, indent));
                            lines.push(...pre);
                            lines.push(indent + `${this.objBoxRefPresentVar(objRn)} = true`);
                            for (const [f] of fields)
                                lines.push(indent + `${this.objBoxRefFieldVar(objRn, f)} = ${vals.get(f)}`);
                            break;
                        }
                        this.fail(op.id, `object box-ref write of unsupported value on '${objRn}'`);
                        break;
                    }
                    // struct box-ref write `ref.current = null | <identifier>` -> whole-struct slot var
                    // assignment (mechanism 14). The .mjs classifier (structBoxRefs, scene-runtime-smoke-
                    // source.mjs) has ALREADY hand-audited, component-wide, that every write to THIS ref is
                    // one of exactly these two shapes before ever registering it in structBoxRefSlots — this
                    // is a redundant second guard (mirrors the array box-ref clear-reassign comment above),
                    // not the enforcement point itself.
                    const structRn = this.structBoxRefCurrentName(op);
                    if (structRn !== undefined) {
                        const valOp = this.index.opsById.get(String(op.value));
                        const isNullSentinel = (valOp?.opKind === "literal" && this.index.dataById.get(String(valOp.data)) === null)
                            || (valOp?.opKind === "identifier" && (valOp.name === "null" || valOp.name === "undefined"));
                        if (isNullSentinel) {
                            // `= null` -> present=false; struct fields retain their last value (unread while
                            // !present — same "stale field, gated by presence" convention objBoxRef's own
                            // `.current = null` write already established above).
                            lines.push(...pre);
                            lines.push(indent + `${this.structBoxRefPresentExpr(structRn)} = false`);
                            break;
                        }
                        if (valOp && valOp.opKind === "identifier") {
                            // ★adversarial-review finding (mech14 review round): the .mjs classifier only
                            // guarantees the write value's TS-DECLARED typeText string-equals the ref's TS-
                            // declared type (both post stripImportPrefixes) — it says nothing about the CHENG
                            // type each side actually maps to. `inferLocalType`'s generic TypeMapper path names
                            // a project TS interface struct by its OWN TS name (e.g. "WebRtcIceConfig", via
                            // emitStructs() — which, per the recon verdict §2.3, silently DROPS iceServers
                            // there too), a DIFFERENT Cheng nominal type than this box-ref's hand-written codec
                            // struct (e.g. "scene.WebSceneWebRtcIceConfigRecord"). Confirmed via a direct
                            // stage3 system-link-exec + execute repro (not hypothetical): emitting the raw
                            // `slot = value` assignment across these two distinct, differently-shaped Cheng
                            // struct types compiles cleanly and SILENTLY CORRUPTS every field (verified
                            // byte-for-byte: a `relayOnly=true` source flips to `false` in the slot, and an
                            // unrelated `expiresAtMs=999` source value leaks into the slot's `iceServers.len`)
                            // — exit 0, no crash, no diagnostic. There is currently no field-bridging codegen
                            // between "the natural Cheng type a TS interface auto-maps to" and "the struct box-
                            // ref's own hand-written Cheng type" (a real design gap the recon verdict's §3
                            // storage proposal never actually specified: HOW loadWebRtcIceConfig()'s host value
                            // becomes a scene.WebSceneWebRtcIceConfigRecord in the first place). Rather than
                            // land a codegen path proven to silently corrupt data, fail loudly here — exactly
                            // "let it crash" — until that bridging design exists. This means hydrateIceConfig's
                            // OWN write line still does not compile today; the mechanism-14 gain actually
                            // delivered is the free-var CLASSIFICATION advance (iceConfigRef no longer the
                            // first blocker) plus the read/condition/null-write shapes and the KV codec, all
                            // independently stage3-verified — not the identifier-write population path.
                            const expectedType = this.structBoxRefSlots.get(structRn);
                            const actualType = this.exprType(String(op.value));
                            if (actualType !== expectedType) {
                                this.fail(op.id, `struct box-ref '.current' write on '${structRn}': value has Cheng type '${actualType ?? "?"}', expected '${expectedType}' — no field-bridging codegen exists between a TS-interface-auto-mapped struct and this box-ref's hand-written codec struct (mechanism 14 known gap, see adversarial-review comment above; a raw assignment across mismatched struct types was confirmed via stage3 to silently corrupt fields, not merely fail to compile)`);
                                break;
                            }
                            const v = this.emitExpr(String(op.value), pre, indent);
                            lines.push(...pre);
                            lines.push(indent + `${this.boxRefSlotVar(structRn)} = ${v}`);
                            lines.push(indent + `${this.structBoxRefPresentExpr(structRn)} = true`);
                            break;
                        }
                        this.fail(op.id, `struct box-ref '.current' write on '${structRn}' only supports '= null' or '= <identifier>' — mechanism 14 whitelist`);
                        break;
                    }
                    // scalar box-ref write `ref.current = v` -> slot var assignment (lossless, no fabrication).
                    const boxRn = this.boxRefCurrentName(op);
                    if (boxRn !== undefined) {
                        // `= null`/`= undefined` (mechanism 13, cht-voice-dual-state-bridge §3.3:
                        // localStreamRef.current = null, ChessPage.tsx:704) is a TYPED zero-write, not
                        // literally the string "" — the generic literal emitter (`case "literal"` above)
                        // hardcodes `null -> ""` for every scalar type alike (a pre-existing convention that
                        // only ever needed to hold for `str`-typed box refs before this mechanism; the Cheng
                        // cold compiler correctly rejects `int64Var = ""` as a real type error, `cold
                        // assignment value must be int64` — never a silent miscompile). Route the ref's OWN
                        // declared slot type through zeroValueOf instead of trusting the generic emitter, so
                        // an int64 handle slot's null-clear becomes `int64(0)`, not a str literal.
                        const valOp = this.index.opsById.get(String(op.value));
                        const isNullSentinel = (valOp?.opKind === "literal" && this.index.dataById.get(String(valOp.data)) === null)
                            || (valOp?.opKind === "identifier" && (valOp.name === "null" || valOp.name === "undefined"));
                        const boxType = this.boxRefSlots.get(boxRn);
                        const bv = isNullSentinel ? (this.types.zeroValueOf(boxType) || "0") : this.emitExpr(String(op.value), pre, indent);
                        lines.push(...pre);
                        lines.push(indent + `${this.boxRefSlotVar(boxRn)} = ${bv}`);
                        break;
                    }
                    // Only a known struct type has writable fields. Writing `.field` on a primitive/opaque
                    // receiver (e.g. a React useRef typed as str → `ref.current = null`) has no scalar-KV
                    // representation — FAIL rather than emit an invalid `str.current = ...` (silent leak).
                    const recvType = this.exprType(String(op.receiver));
                    if (recvType === "int64" && String(op.name) === "muted") {
                        const recv = this.emitExpr(String(op.receiver), pre, indent);
                        const v = this.emitExpr(String(op.value), pre, indent);
                        lines.push(...pre);
                        lines.push(indent + `chengVideoSetMuted(${recv}, ${v})`);
                        break;
                    }
                    if (recvType === undefined || !this.index.typeDeclByName.has(recvType)) {
                        this.fail(op.id, `property write '${String(op.name)}' on unsupported receiver type '${recvType}'`);
                        break;
                    }
                    const recv = this.emitExpr(String(op.receiver), pre, indent);
                    const v = this.emitExpr(String(op.value), pre, indent);
                    lines.push(...pre);
                    lines.push(indent + `${recv}.${sanitizeFieldName(String(op.name))} = ${v}`);
                    break;
                }
                case "element_write": {
                    const recvType = this.exprType(String(op.receiver));
                    if (recvType === "json.JsonNode") {
                        const recv = this.emitExpr(String(op.receiver), pre, indent);
                        const idx = this.emitExpr(String(op.argument ?? op.index), pre, indent);
                        const v = this.emitExpr(String(op.value), pre, indent);
                        lines.push(...pre);
                        lines.push(indent + `${recv}[${idx}] = ${v}`);
                        break;
                    }
                    if (recvType === undefined || !recvType.endsWith("[]")) {
                        this.fail(op.id, `element write on unsupported receiver type '${recvType}'`);
                        break;
                    }
                    const recv = this.emitExpr(String(op.receiver), pre, indent);
                    const idx = this.emitExpr(String(op.argument ?? op.index), pre, indent);
                    const v = this.emitExpr(String(op.value), pre, indent);
                    lines.push(...pre);
                    lines.push(indent + `${recv}[int32(${idx})] = ${v}`);
                    break;
                }
                case "assign": {
                    const leftOp = this.index.opsById.get(String(op.left));
                    const rightExpr = this.emitExpr(String(op.right), pre, indent);
                    lines.push(...pre);
                    if (leftOp && leftOp.opKind === "identifier") {
                        lines.push(indent + `${this.renameOf(String(leftOp.name))} = ${rightExpr}`);
                    }
                    else if (leftOp && leftOp.opKind === "property_read") {
                        const recvType = this.exprType(String(leftOp.receiver));
                        if (recvType === "int64" && String(leftOp.name) === "muted") {
                            const recv = this.emitExpr(String(leftOp.receiver), pre, indent);
                            lines.push(indent + `chengVideoSetMuted(${recv}, ${rightExpr})`);
                            break;
                        }
                        if (recvType === undefined || !this.index.typeDeclByName.has(recvType)) {
                            this.fail(op.id, `property write '${String(leftOp.name)}' on unsupported receiver type '${recvType}'`);
                            break;
                        }
                        const recv = this.emitExpr(String(leftOp.receiver), pre, indent);
                        lines.push(indent + `${recv}.${sanitizeFieldName(String(leftOp.name))} = ${rightExpr}`);
                    }
                    else if (leftOp && leftOp.opKind === "element_read") {
                        const recvType = this.exprType(String(leftOp.receiver));
                        if (recvType === "json.JsonNode") {
                            const recv = this.emitExpr(String(leftOp.receiver), pre, indent);
                            const idx = this.emitExpr(String(leftOp.argument), pre, indent);
                            lines.push(indent + `${recv}[${idx}] = ${rightExpr}`);
                        }
                        else if (recvType !== undefined && recvType.endsWith("[]")) {
                            const recv = this.emitExpr(String(leftOp.receiver), pre, indent);
                            const idx = this.emitExpr(String(leftOp.argument), pre, indent);
                            lines.push(indent + `${recv}[int32(${idx})] = ${rightExpr}`);
                        }
                        else {
                            this.fail(op.id, `element write on unsupported receiver type '${recvType}'`);
                        }
                    }
                    else {
                        this.fail(op.id, `unsupported assign target '${leftOp ? leftOp.opKind : "?"}'`);
                    }
                    break;
                }
                case "for_of": {
                    const iterableId = String(op.iterable ?? "");
                    const loopName = String(op.initializerName ?? "");
                    if (iterableId.length === 0 || loopName.length === 0) {
                        this.fail(op.id, "for_of missing iterable/initializer");
                        break;
                    }
                    const recvType = this.exprType(iterableId);
                    if (recvType === undefined || !recvType.endsWith("[]")) {
                        this.fail(op.id, `for_of over unsupported iterable type '${recvType}'`);
                        break;
                    }
                    const iterableExpr = this.emitExpr(iterableId, pre, indent);
                    const src = this.freshVar("iter");
                    const i = this.freshVar("i");
                    lines.push(...pre);
                    lines.push(indent + `let ${src} = ${iterableExpr}`);
                    lines.push(indent + `var ${i} = 0`);
                    lines.push(indent + `while ${i} < ${src}.len:`);
                    lines.push(indent + `    let ${loopName} = ${src}[${i}]`);
                    // Increment BEFORE the body, not after it: a `continue` inside the body must skip to
                    // the loop condition WITH the index already advanced, or it spins forever on the same
                    // element (Cheng `continue` re-enters the condition check). The index is a fresh
                    // internal temp the body can never name, so moving the increment changes nothing the
                    // body can observe — the two orderings are observationally identical for continue-free
                    // bodies and correct-by-construction for bodies with `continue`/`break`.
                    lines.push(indent + `    ${i} = ${i} + 1`);
                    const hadLoopVar = this.localTypes.get(loopName);
                    this.localTypes.set(loopName, recvType.slice(0, -2));
                    const bodyLines = typeof op.bodyBlock === "string" ? this.emitBlock(op.bodyBlock, depth + 1, ownerFunctionId) : [];
                    if (hadLoopVar === undefined)
                        this.localTypes.delete(loopName);
                    else
                        this.localTypes.set(loopName, hadLoopVar);
                    lines.push(...bodyLines);
                    break;
                }
                case "await": {
                    // Statement-level await (`await x;` as an expression statement): evaluate + channel
                    // check via the emitExpr lowering, discard the value.
                    const v = this.emitExpr(op.id, pre, indent);
                    lines.push(...pre);
                    break;
                }
                case "try": {
                    // Synchronous-collapse try/catch (mechanism-9/10 headless slice). The try body is
                    // wrapped in a one-shot `while true` shell: a `throw` (or an `await` observing a
                    // rejection on the channel) writes the REAL Error message to the mark and breaks into
                    // the catch. A try body containing ANY loop op is rejected: a `break` inside a nested
                    // loop would leave the loop, not the shell — never silently break the wrong level.
                    if (typeof op.tryBlock !== "string" || (typeof op.catchBlock !== "string" && typeof op.finallyBlock !== "string")) {
                        this.fail(op.id, "try statement with neither catch nor finally block has no lowering");
                        break;
                    }
                    const hasCatchBlock = typeof op.catchBlock === "string";
                    const hasFinallyBlock = typeof op.finallyBlock === "string";
                    const tryOps = [];
                    {
                        // Unwrap the same single-op block-wrapper chain as the catch-param analysis below:
                        // the loop guard must see the REAL try-body statements, not just the wrapper op.
                        const blockQueue = [String(op.tryBlock)];
                        const seenBlocks = new Set();
                        while (blockQueue.length > 0) {
                            const bid = blockQueue.shift();
                            if (seenBlocks.has(bid))
                                continue;
                            seenBlocks.add(bid);
                            for (const o of (this.index.opsByBlock.get(bid) ?? [])) {
                                if (o.opKind === "block" && typeof o.nestedBlock === "string")
                                    blockQueue.push(String(o.nestedBlock));
                                else
                                    tryOps.push(o);
                            }
                        }
                    }
                    if (tryOps.some((o) => o.opKind === "for_of" || o.opKind === "for_count" || o.opKind === "for_in" || o.opKind === "while")) {
                        this.fail(op.id, "try body contains a loop — the catch-shell break would target the wrong level (never silently mislowered)");
                        break;
                    }
                    const mark = this.freshVar("tryErr");
                    if (!hasCatchBlock) {
                        // try/finally without a catch: no parameter to identify — skip the analysis below.
                    }
                    // Catch-parameter identity (mechanism-9/10): csg.binding's owner is the EMIT-TIME
                    // context id (a neighbouring statement, NOT the try op — verified against the real
                    // extraction), so it cannot locate the parameter. Exact alternative: within the catch
                    // block's ops, names bound by local_write/binding_extract/for-initializers are locals,
                    // names already in localTypes are outer free vars/params — the catch parameter is the
                    // ONLY unbound free name. Exactly one such name = the parameter (precise); zero =
                    // parameterless catch; more than one = fail loudly, never a first-match guess.
                    const catchParam = !hasCatchBlock ? "" : (() => {
                        // Unwrap the extractor's single-op {opKind:"block", nestedBlock} wrapper chain —
                        // the catch block id on the try op points at the WRAPPER, whose only op links to
                        // the nested block holding the real statements (mirrors resolveStatementBlockOps).
                        const catchOps = [];
                        const blockQueue = [String(op.catchBlock)];
                        const seenBlocks = new Set();
                        while (blockQueue.length > 0) {
                            const bid = blockQueue.shift();
                            if (seenBlocks.has(bid))
                                continue;
                            seenBlocks.add(bid);
                            for (const o of (this.index.opsByBlock.get(bid) ?? [])) {
                                if (o.opKind === "block" && typeof o.nestedBlock === "string")
                                    blockQueue.push(String(o.nestedBlock));
                                else
                                    catchOps.push(o);
                            }
                        }
                        const boundNames = new Set();
                        for (const o of catchOps) {
                            if ((o.opKind === "local_write" || o.opKind === "binding_extract") && o.name)
                                boundNames.add(String(o.name));
                            if ((o.opKind === "for_of" || o.opKind === "for_in" || o.opKind === "for_count") && o.initializerName)
                                boundNames.add(String(o.initializerName));
                        }
                        const freeNames = new Set();
                        // NOTE: localTypes is deliberately NOT subtracted — a catch parameter SHADOWS an
                        // outer same-named binding (ChessPage's catch (error) shadows the `error` state),
                        // so the parameter name may well collide with an outer free var.
                        for (const o of catchOps) {
                            if (o.opKind === "identifier" && o.name && !boundNames.has(String(o.name)))
                                freeNames.add(String(o.name));
                        }
                        // Pair with the extractor's own record: csg.binding(declarationKind="catch") names
                        // the parameter, grouped by owning function. The parameter of THIS try = the
                        // intersection of the function's catch-param names with this block's free names.
                        // Intersection empty + the function has exactly one catch param (an unread
                        // parameter, e.g. `catch (e) {}`) -> that name. Anything else fails loudly.
                        const fnCatchParams = this.index.catchParamsByFunction.get(ownerFunctionId) ?? new Set();
                        const intersection = [...freeNames].filter((n) => fnCatchParams.has(n));
                        if (intersection.length === 1)
                            return intersection[0];
                        // No catch binding recorded for the whole function == parameterless catch
                        // (`catch { ... }` — the extractor records a binding whenever a parameter exists,
                        // so its absence is the exact identity of "no parameter"), NOT an ambiguity.
                        if (fnCatchParams.size === 0)
                            return "";
                        if (intersection.length === 0 && fnCatchParams.size === 1)
                            return [...fnCatchParams][0];
                        this.fail(op.id, `catch parameter not uniquely identifiable (free=[${[...freeNames].join(",")}] fnCatchParams=[${[...fnCatchParams].join(",")}])`);
                        return "";
                    })();
                    lines.push(indent + `var ${mark}: str = ""`);
                    lines.push(indent + "while true:");
                    this.tryMarkStack.push(mark);
                    this.catchParamStack.push(catchParam);
                    const tryLines = this.emitBlock(String(op.tryBlock), depth + 1, ownerFunctionId);
                    lines.push(...tryLines);
                    this.tryMarkStack.pop();
                    lines.push(indent + "    break");
                    if (hasCatchBlock) {
                        lines.push(indent + `if len(${mark}) > 0:`);
                        if (catchParam.length > 0) {
                            lines.push(indent + `    let ${catchParam} = ${mark}`);
                            const hadCatchLocal = this.localTypes.get(catchParam);
                            this.localTypes.set(catchParam, "str");
                            const catchLines = this.emitBlock(String(op.catchBlock), depth + 1, ownerFunctionId);
                            if (hadCatchLocal === undefined)
                                this.localTypes.delete(catchParam);
                            else
                                this.localTypes.set(catchParam, hadCatchLocal);
                            lines.push(...catchLines);
                        }
                        else {
                            lines.push(...this.emitBlock(String(op.catchBlock), depth + 1, ownerFunctionId));
                        }
                        // The catch PARAM stack pops only AFTER the catch body is compiled (its
                        // `error instanceof Error` / `error.message` reductions key on it), while the
                        // MARK stack popped before it (a `throw` inside the catch block is NOT caught by
                        // its own try — it propagates outward, exactly like JS).
                        this.catchParamStack.pop();
                    }
                    // try/finally (and try/catch/finally): the finally body runs UNCONDITIONALLY after
                    // the try/catch path (JS guarantees it on both the normal and the exceptional exit),
                    // then a non-empty mark propagates OUTWARD — into the enclosing try's mark (whose
                    // shell we can still break from, since this whole try statement lives inside that
                    // shell's body) or onto the async error channel, exactly like JS propagation.
                    if (hasFinallyBlock) {
                        lines.push(...this.emitBlock(String(op.finallyBlock), depth + 1, ownerFunctionId));
                    }
                    if (!hasCatchBlock) {
                        lines.push(indent + `if len(${mark}) > 0:`);
                        if (this.tryMarkStack.length > 0) {
                            const outerMark = this.tryMarkStack[this.tryMarkStack.length - 1];
                            lines.push(indent + `    ${outerMark} = ${mark}`);
                            lines.push(indent + "    break");
                        }
                        else {
                            this.preludeUsed.add("chtAsyncError");
                            lines.push(indent + `    __chtAsyncError = ${mark}`);
                            lines.push(indent + `    return ${this.types.zeroValueOf(this.currentReturnType) || "0"}`);
                        }
                    }
                    break;
                }
                case "throw": {
                    // `throw new Error(<msg>)` — the ONLY throw shape on the compiled chain (audited:
                    // ensureLocalVoiceMedia/sendHiddenVoiceSignal both use new Error(str)). Any other
                    // thrown value has no honest message identity -> fail loudly.
                    const throwValueOp = this.index.opsById.get(String(op.value));
                    const throwArgs = throwValueOp?.arguments ?? [];
                    const isErrorNew = !!throwValueOp && throwValueOp.opKind === "new" && String(throwValueOp.callee ?? "") === "Error" && throwArgs.length === 1;
                    if (!isErrorNew) {
                        this.fail(op.id, "unsupported throw shape (only `throw new Error(<one string arg>)` is lowered)");
                        break;
                    }
                    const msgExpr = this.emitExpr(String(throwArgs[0]), pre, indent);
                    lines.push(...pre);
                    if (this.tryMarkStack.length > 0) {
                        const mark = this.tryMarkStack[this.tryMarkStack.length - 1];
                        lines.push(indent + `${mark} = ${msgExpr}`);
                        lines.push(indent + "break");
                    }
                    else {
                        this.preludeUsed.add("chtAsyncError");
                        lines.push(indent + `__chtAsyncError = ${msgExpr}`);
                        lines.push(indent + `return ${this.types.zeroValueOf(this.currentReturnType) || "0"}`);
                    }
                    break;
                }
                case "expression":
                case "statement": {
                    // Loop-control statements: exact Cheng one-to-one mappings. `continue` is only correct
                    // because the for_of lowering above increments the index BEFORE the body (see its
                    // comment); `break` exits the enclosing loop directly in both languages.
                    if (op.statementKind === "ContinueStatement") {
                        lines.push(indent + "continue");
                        break;
                    }
                    if (op.statementKind === "BreakStatement") {
                        lines.push(indent + "break");
                        break;
                    }
                    // async-IIFE await-split: a `void (async()=>{...})()` statement is a VoidExpression
                    // whose operand is the IIFE call op (calleeFn-bearing). The IIFE call op is NOT a
                    // statement op-kind (so it is skipped as a referenced sub-expression), so the split is
                    // lowered HERE from the void-wrapper: seg0 = issue send + arm recv-done frame + suspend.
                    const wrapId = String(op.operand ?? op.value ?? "");
                    const wrapOp = this.index.opsById.get(wrapId);
                    if (wrapOp && wrapOp.opKind === "call") {
                        const iife = this.matchAsyncIifeAwait(wrapOp);
                        if (iife !== undefined) {
                            this.lowerAsyncIifeAwaitSplit(iife, lines, pre, indent);
                            break;
                        }
                    }
                    // A statement-expression carries a side effect. Emit its inner value, or — when there
                    // is no `value` field (e.g. `void (async()=>{})()` = VoidExpression) — route the op
                    // itself through emitExpr, which FAILS on unsupported kinds rather than silently
                    // dropping the effect (the fail-on-drop guard; closes the IIFE/void leak).
                    const v = typeof op.value === "string"
                        ? this.emitExpr(String(op.value), pre, indent)
                        : this.emitExpr(op.id, pre, indent);
                    lines.push(...pre);
                    if (v !== undefined)
                        lines.push(indent + v);
                    break;
                }
                case "call": {
                    // Deferred-effect lowering: `window.setTimeout(() => <effect>, <msLiteral>)` becomes a
                    // real wall-clock async frame registration. The callback body becomes the resume function.
                    const deferred = this.matchSetTimeoutDeferred(op);
                    if (deferred !== undefined) {
                        if (this.deferredFrameKind === undefined) {
                            this.fail(op.id, "setTimeout deferred-effect not enabled for this handler (no frame kind)");
                            break;
                        }
                        if (this.deferredResumeCallbackFid !== undefined) {
                            this.fail(op.id, "multiple setTimeout deferrals in one handler not supported");
                            break;
                        }
                        this.deferredResumeCallbackFid = deferred.callbackFid;
                        this.deferredMs = deferred.ms;
                        lines.push(indent + `__asyncRegisterDeferred(int32(${this.deferredFrameKind}), int32(${Math.trunc(deferred.ms)}))`);
                        break;
                    }
                    // A bare call-statement (e.g. `setX(...)`, `void (async()=>{})()`) carries a side
                    // effect — emit it, or fail on an unsupported callee. NEVER silently drop it, or we
                    // would fabricate a handler missing its real effect (no-fallback violation).
                    const v = this.emitExpr(op.id, pre, indent);
                    lines.push(...pre);
                    if (v !== undefined && v.length > 0)
                        lines.push(indent + v);
                    break;
                }
                default: {
                    if (!referenced.has(op.id)) {
                        // Statement-position logical/comma binaries (`cond && call()`, `cond || (a(), b())`,
                        // comma chains) carry operand side effects that MUST survive — the discard list below
                        // would silently drop them (measured miscompile: `e.currentTarget.contains(...) ||
                        // (window.clearTimeout(...), E.current = "")` compiled to just the bare assignment).
                        // Lower to control flow instead; any un-emittable operand fails honestly.
                        if (op.opKind === "binary" && ["AmpersandAmpersandToken", "BarBarToken", "CommaToken"].includes(String(op.operator))) {
                            this.emitLogicalStatement(op, lines, indent);
                            break;
                        }
                        // Bare value-expression statements with no side effect are safe to discard.
                        // `call` is deliberately NOT here — it is handled above (emit or fail).
                        if (["literal", "identifier", "binary", "unary", "template", "property_read", "element_read", "array_literal", "object_literal", "function_value"].includes(op.opKind))
                            break;
                        this.fail(op.id, `unsupported statement op '${op.opKind}'`);
                    }
                    break;
                }
            }
        }
        return lines;
    }
    // Statement-position logical/comma binary lowering: `cond && effect` / `cond || effect` /
    // `a(), b()` — control flow so every operand's side effects survive (never a value-shaped
    // discard). Any operand that cannot be emitted fails honestly through emitExpr/emitCondition.
    emitLogicalStatement(op, lines, indent) {
        const operator = String(op.operator);
        if (operator === "CommaToken") {
            this.emitStatementOperand(String(op.left), lines, indent);
            this.emitStatementOperand(String(op.right), lines, indent);
            return;
        }
        const pre = [];
        const cond = this.emitCondition(String(op.left), pre, indent);
        lines.push(...pre);
        lines.push(indent + (operator === "AmpersandAmpersandToken" ? `if ${cond}:` : `if !(${cond}):`));
        this.emitStatementOperand(String(op.right), lines, indent + "    ");
    }
    emitStatementOperand(opId, lines, indent) {
        const sub = this.index.opsById.get(opId);
        if (!sub) {
            this.fail(opId, "statement operand op missing");
            return;
        }
        if (sub.opKind === "binary" && ["AmpersandAmpersandToken", "BarBarToken", "CommaToken"].includes(String(sub.operator))) {
            this.emitLogicalStatement(sub, lines, indent);
            return;
        }
        if (sub.opKind === "property_write") {
            // Comma-chain write operand (`a(), x.current = v`): the dominant idiom is a box-ref
            // `.current` write — lower it here (emitExpr has no property_write expression form).
            // Any other write target fails honestly.
            const boxRn = this.boxRefCurrentName(sub);
            if (boxRn === undefined) {
                this.fail(sub.id, `unsupported statement write target '${String(sub.name)}'`);
                return;
            }
            const pre = [];
            const wv = this.emitExpr(String(sub.value), pre, indent);
            lines.push(...pre);
            if (wv !== undefined && wv.length > 0)
                lines.push(indent + `${this.boxRefSlotVar(boxRn)} = ${wv}`);
            return;
        }
        const pre = [];
        const v = this.emitExpr(opId, pre, indent);
        lines.push(...pre);
        if (v !== undefined && v.length > 0)
            lines.push(indent + v);
    }
    emitCondition(opId, pre, indent) {
        // Struct box-ref bare `.current` used as a truthy condition (mechanism 14, e.g.
        // `if (iceConfigRef.current)`) — intercepted BEFORE the generic exprType/STRUCT_PRESENCE_
        // FIELDS struct-condition path below, which is designed for project-extracted TS interface
        // structs registered in typeDeclByName (TypeMapper-mapped); WebSceneWebRtcIceConfigRecord is a
        // hand-written runtime `scene.*` struct that never goes through that registration, so it would
        // otherwise fall through to an invalid bare-struct-as-bool emission. `present` is a real field
        // on the struct (see web_scene_runtime.cheng), so no STRUCT_PRESENCE_FIELDS entry is needed.
        const condOp = this.index.opsById.get(opId);
        if (condOp) {
            const structRn = this.structBoxRefCurrentName(condOp);
            if (structRn !== undefined)
                return this.structBoxRefPresentExpr(structRn);
        }
        const t = this.exprType(opId);
        const expr = this.emitExpr(opId, pre, indent);
        if (t === "str")
            return `len(${expr}) > 0`;
        if (t === "int64")
            return `${expr} != int64(0)`;
        if (t !== undefined && t !== "bool" && this.index.typeDeclByName.has(t)) {
            // Struct value used as a boolean condition (e.g. `!activeVoiceSession`, `if session:`).
            // Cheng has no truthiness coercion for struct values — translate through the type's
            // registered presence field (STRUCT_PRESENCE_FIELDS) instead of emitting a bare `!x`/`x`
            // on the struct, which would silently compile to a constant (always-false/-true)
            // condition indistinguishable across every real input. No registered field -> reject
            // loudly; never guess.
            const presenceField = STRUCT_PRESENCE_FIELDS.get(t);
            if (presenceField === undefined) {
                this.fail(opId, `struct type '${t}' used as a boolean condition has no registered presence field (STRUCT_PRESENCE_FIELDS) — add one after auditing which field is guaranteed non-zero on every real instance`);
                return "false";
            }
            const decl = this.index.typeDeclByName.get(t);
            const member = (decl.members ?? []).find((m) => m.name === presenceField);
            const fieldType = member !== undefined ? this.types.map(member.type).type : undefined;
            const fieldExpr = `(${expr}).${sanitizeFieldName(presenceField)}`;
            if (fieldType === "str")
                return `len(${fieldExpr}) > 0`;
            if (fieldType === "int64")
                return `${fieldExpr} != int64(0)`;
            this.fail(opId, `struct '${t}' presence field '${presenceField}' has unsupported type '${fieldType}'`);
            return "false";
        }
        return expr;
    }
    inferLocalType(op) {
        if (typeof op.typeSource === "string") {
            const mapped = this.types.map(op.typeSource);
            if (mapped.type !== undefined)
                return mapped.type;
        }
        if (typeof op.typeText === "string") {
            const mapped = this.types.map(op.typeText);
            if (mapped.type !== undefined)
                return mapped.type;
        }
        if (typeof op.value === "string") {
            const valueType = this.exprType(op.value);
            if (valueType !== undefined)
                return valueType;
        }
        return undefined;
    }
    exprType(opId) {
        const op = this.index.opsById.get(opId);
        if (!op)
            return undefined;
        // A `Record<string, ...>` returnType folds to json.JsonNode — a LOSSY approximation
        // (TypeMapper.map, "Record<string,"). On a property_read, the receiver-chain struct field's
        // own declared type is the exact identity and must get a chance to win over the fold
        // (mechanism-6 snapshot bridge: `snapshot.callSessions` — the getSnapshot call's narrowed
        // ChtRtSnapshotBridge return type carries `callSessions: RealtimeCallSession[]`, while this
        // property_read's own TS returnType is the Record the fold loses). The folded type is kept
        // as the fallback when no field-level derivation succeeds, so behavior is unchanged for
        // every non-fold case and every fold whose receiver chain has no better answer.
        let foldedRecordType;
        if (typeof op.returnType === "string") {
            const mapped = this.types.map(op.returnType);
            if (mapped.type !== undefined) {
                if (mapped.type === "json.JsonNode" && op.opKind === "property_read")
                    foldedRecordType = mapped.type;
                // object_literal always goes through its own case (the annotated-literal synthesis for
                // union-membered annotations lives there) — a premature return here would skip it and
                // keep the union-shaped member in the emitted struct (mechanism-union slice).
                else if (op.opKind !== "object_literal")
                    return mapped.type;
            }
        }
        if (op.opKind === "literal") {
            const v = this.index.dataById.get(String(op.data));
            if (typeof v === "number")
                return "int64";
            if (typeof v === "string")
                return "str";
            if (typeof v === "boolean")
                return "bool";
        }
        if (op.opKind === "identifier") {
            const local = this.localTypes.get(String(op.name));
            if (local !== undefined)
                return local;
            return this.index.constLiteralTypes.get(String(op.name));
        }
        if (op.opKind === "call") {
            const callCallee = String(op.callee ?? op.calleeText ?? "");
            const bridgeRt = CHT_BRIDGE_RETURN_TYPES.get(callCallee);
            if (bridgeRt !== undefined)
                return bridgeRt;
        }
        if (op.opKind === "template")
            return "str";
        if (op.opKind === "binary") {
            const operator = String(op.operator);
            // Comparison/equality/instanceof always yield bool (InstanceOfKeyword included — without
            // it the left operand's type leaks through and emitCondition treats the bool literal
            // "true" as a str truthiness check, emitting len(true) — a hard cold type error).
            if (["LessThanToken", "FirstBinaryOperator", "LessThanEqualsToken", "GreaterThanToken", "GreaterThanEqualsToken", "EqualsEqualsEqualsToken", "EqualsEqualsToken", "ExclamationEqualsEqualsToken", "ExclamationEqualsToken", "InstanceOfKeyword"].includes(operator))
                return "bool";
            // JS `a || b` / `a && b` evaluate to an OPERAND value, not a boolean. When BOTH operands are
            // the SAME value type (str/int64), the result is that operand type (value context, e.g.
            // `content.postId || content.id` → str, `content.title || ''` → str). Mixed operands
            // (e.g. `!x || s` where x is bool, s is str) keep the boolean short-circuit form — the typed
            // model has no bool|str union, and that form is only ever consumed as a condition. Comparison
            // operators above always yield bool.
            if (operator === "BarBarToken" || operator === "AmpersandAmpersandToken") {
                const lt = this.exprType(String(op.left));
                const rt = this.exprType(String(op.right));
                if ((lt === "str" || lt === "int64") && lt === rt)
                    return lt;
                // `x || undefined` / `x && undefined`: undefined/null has no type of its own, and its
                // absence IS the other side's zero value under the CHT convention — the value type is
                // the typed side's own type, never bool (a bool result here makes a str-typed field
                // store mismatch at cold time).
                if (lt === "str" || lt === "int64") {
                    if (rt === undefined && this.isUndefinedishOperand(String(op.right)))
                        return lt;
                }
                if (rt === "str" || rt === "int64") {
                    if (lt === undefined && this.isUndefinedishOperand(String(op.left)))
                        return rt;
                }
                return "bool";
            }
            return this.exprType(String(op.left));
        }
        if (op.opKind === "unary" && String(op.operator) === "ExclamationToken")
            return "bool";
        if (op.opKind === "property_read") {
            const fieldName = String(op.name);
            const objField = this.objBoxRefFieldAccess(op);
            if (objField !== undefined)
                return this.objBoxRefSlots.get(objField.refName).get(objField.field); // obj box-ref field type
            if (this.objBoxRefCurrentName(op) !== undefined)
                return "bool"; // obj box-ref `.current` -> present (bool)
            const boxRn = this.boxRefCurrentName(op);
            if (boxRn !== undefined)
                return this.boxRefSlots.get(boxRn); // scalar box-ref deref -> its slot type
            // Array box-ref `.current` -> its qualified Cheng array type (mechanism 12). This is a pure
            // type query, consulted by inferLocalType (via the copy-read array_literal's own exprType
            // delegating to this same receiver) — it does NOT unlock any new emitExpr codegen path: only
            // the whitelisted call/write/spread shapes actually special-case `.current` in emitExpr; a
            // bare `.current` still has no generic emission there, so e.g. `.current[0]` still fails
            // exactly as before, even though its TYPE is now known here.
            const arrRn = this.arrBoxRefCurrentName(op);
            if (arrRn !== undefined)
                return `${this.arrBoxRefSlots.get(arrRn)}[]`;
            // Struct box-ref `.current` -> its qualified Cheng struct type (mechanism 14). Same "pure
            // type query" contract as the array case above: this alone does not unlock a generic
            // emitExpr codegen path for every struct shape — only the specific whitelisted read (bare
            // return-value use, via emitExpr below) and condition (bare truthy use, via emitCondition's
            // own early special-case) consult it.
            const structRn = this.structBoxRefCurrentName(op);
            if (structRn !== undefined)
                return this.structBoxRefSlots.get(structRn);
            // Mechanism 21: bare `.current` on an admitted mirror ref — its type is the mirrored
            // state's injected free-var parameter type (localTypes holds it under the ref's own name).
            // Pure type query, same contract as the box-ref cases above.
            const mirrorRn = this.refStateMirrorCurrentName(op);
            if (mirrorRn !== undefined)
                return this.localTypes.get(mirrorRn);
            if (this.hostVideoRefCurrentName(op) !== undefined)
                return "int64";
            if (this.hostObjectCurrentRead(op))
                return "bool";
            if (this.hostFullscreenElementRead(op))
                return "bool";
            if (fieldName === "length")
                return "int64";
            if (fieldName === "paused" && this.exprType(String(op.receiver)) === "int64")
                return "bool";
            if (this.exprType(String(op.receiver)) === "json.JsonNode")
                return "json.JsonNode";
            const recvType = this.exprType(String(op.receiver));
            if (recvType !== undefined) {
                const member = this.typeDeclFieldOf(recvType, fieldName);
                if (member) {
                    const mapped = this.types.map(member.type);
                    if (mapped.type !== undefined)
                        return mapped.type;
                }
                // Optional-absent field TYPE (envelope-construction family): the field is absent on
                // this call-site instance but declared optional in a parameter inline-object
                // annotation — its declared zero type answers the type query (mirrors the emitExpr
                // lowering; used by call-site argument typing, e.g. options.signal).
                {
                    const absentType = this.optionalAbsentFieldType(fieldName);
                    if (absentType !== undefined)
                        return absentType;
                }
                // Union-alias receiver (envelope-construction family): a property read whose receiver
                // types as a union alias (RealtimeEnvelope) is legal EXACTLY when every member declares
                // the field with the SAME Cheng type (the public-member view — messageId/timestampMs
                // et al. are RealtimeBaseEnvelope fields every union member inherits, resolved through
                // CHT_INTERFACE_SUPERS). Any member missing it, or disagreeing on the type, fails.
                const unionDecl = this.index.typeDeclByName.get(recvType);
                const unionTarget = String(unionDecl?.aliasTarget ?? "");
                if (unionDecl !== undefined && unionTarget.includes("|")) {
                    const memberNames = splitTopLevelUnion(unionTarget).map((m) => stripImportPrefixes(m).trim()).filter((m) => m.length > 0);
                    let fieldType;
                    let unionOk = memberNames.length > 0;
                    for (const mn of memberNames) {
                        const mm = this.typeDeclFieldOf(mn, fieldName);
                        const mt = mm ? (this.types.map(mm.type).type ?? mm.type) : undefined;
                        if (mt === undefined || (fieldType !== undefined && fieldType !== mt)) {
                            unionOk = false;
                            break;
                        }
                        fieldType = mt;
                    }
                    if (unionOk && fieldType !== undefined)
                        return fieldType;
                }
            }
            if (foldedRecordType !== undefined)
                return foldedRecordType;
            return undefined;
        }
        // Array box-ref drain call (mechanism 12, mech17 r1): `<arrBoxRef>.current.splice(0)` returns
        // the drained snapshot, typed `<elemType>[]` — same "pure type query" contract as the `.current`
        // property_read case above (this alone does not unlock generic call codegen, only the exact
        // whitelisted `splice(0)` shape emitCall special-cases). Needed so a `const x = ref.current.
        // splice(0)` local_write can infer `x`'s type (inferLocalType delegates to exprType on the
        // value op, and a bare "call" op otherwise has no type here at all).
        if (op.opKind === "call" && String(op.memberName || "") === "splice" && typeof op.receiver === "string") {
            const receiverOp = this.index.opsById.get(op.receiver);
            const arrRn = receiverOp ? this.arrBoxRefCurrentName(receiverOp) : undefined;
            if (arrRn !== undefined)
                return `${this.arrBoxRefSlots.get(arrRn)}[]`;
        }
        if (op.opKind === "element_read") {
            const recvType = this.exprType(String(op.receiver));
            if (recvType !== undefined && recvType.endsWith("[]"))
                return recvType.slice(0, -2);
            if (recvType === "str")
                return "str";
            if (recvType === "json.JsonNode")
                return "json.JsonNode";
            return undefined;
        }
        if (op.opKind === "expression") {
            const ek = String(op.expressionKind ?? "");
            if (ek === "AsExpression" || ek === "NonNullExpression" || ek === "ParenthesizedExpression" || ek === "SatisfiesExpression")
                return this.exprType(String(op.operand ?? op.value));
            if (ek === "TypeOfExpression")
                return "str";
            if (ek === "ConditionalExpression")
                return this.exprType(String(op.whenTrue)) ?? this.exprType(String(op.whenFalse));
            return undefined;
        }
        if (op.opKind === "object_literal") {
            let annotated;
            if (typeof op.returnType === "string") {
                const mapped = this.types.map(op.returnType);
                if (mapped.type !== undefined && mapped.type !== "json.JsonNode" && this.index.typeDeclByName.has(mapped.type)) {
                    const existingDecl = this.index.typeDeclByName.get(mapped.type);
                    const hasUnmappableMember = (existingDecl?.members ?? []).some((m) => this.types.map(m.type).type === undefined);
                    if (!hasUnmappableMember)
                        return mapped.type;
                    // Union-membered annotation: the checker-typed literal maps to a decl whose
                    // union-shaped member would be ILLEGAL as a Cheng struct field — rebuild through
                    // annotated-literal synthesis (value-typed per member) below.
                    annotated = parseInlineObjectTypeMembers(op.returnType);
                }
                else if (mapped.type === "json.JsonNode") {
                    return mapped.type;
                }
                else {
                    annotated = parseInlineObjectTypeMembers(op.returnType);
                }
            }
            // Annotated-literal synthesis (envelope-construction family): the literal carries a real
            // inline-object annotation (e.g. `{ conversationId: string; envelope: RealtimeEnvelope;
            // ... }`) that does NOT map only because SOME member types are union-shaped. Keep every
            // annotation member, resolving an un-mappable member type through the matching property
            // VALUE's own exprType (the call-site concrete type — envelope: <identifier typed
            // RealtimeCallSignalEnvelope>). Members absent from the literal stay out (optional-absent
            // lowering reads them as the declared zero). A member that is neither mappable nor
            // value-typed fails honestly. The synthesized decl is REGISTERED here (Cheng-named member
            // types only — a union-shaped member never enters a Cheng struct).
            if (annotated !== undefined) {
                const props = op.properties ?? [];
                const fields = [];
                let synthOk = true;
                for (const m of annotated) {
                    const own = this.types.map(m.type).type;
                    if (own !== undefined) {
                        fields.push({ name: m.name, cheng: own, optional: m.optional === true });
                        continue;
                    }
                    let prop = props.find((pp) => pp.name === m.name);
                    let vt = prop ? this.exprType(prop.value) : undefined;
                    if (vt === undefined) {
                        // Spread-form literal (`{...base, k: v, ... }`): named fields live in
                        // propertyNames[k]/elements[k], not in properties.
                        const spreadNames = op.propertyNames ?? [];
                        const spreadElems = op.elements ?? [];
                        const spreadFlags = op.spreadFlags ?? [];
                        const k = spreadNames.findIndex((nm) => nm === m.name);
                        if (k >= 0 && k < spreadElems.length && spreadFlags[k] !== true)
                            vt = this.exprType(spreadElems[k]);
                    }
                    if (vt !== undefined) {
                        fields.push({ name: m.name, cheng: vt, optional: m.optional === true });
                        continue;
                    }
                    if (m.optional === true)
                        continue; // optional-absent: instance simply lacks the field
                    synthOk = false;
                    break;
                }
                if (synthOk) {
                    const name = this.synthStructName(fields.map((f) => ({ name: f.name, cheng: f.cheng })));
                    if (!this.index.typeDeclByName.has(name)) {
                        // emitStructs re-maps every member type with TypeMapper.map at emission time, so
                        // member types must be stored as TS-SOURCE spellings ("string"/"number"/"boolean"
                        // for scalars — a Cheng "str" would fail the re-map and silently drop the field,
                        // exactly the bug cold later reports as unknown field assignment target). Struct /
                        // array / json names are already declaration-level identities and pass through.
                        const tsSpellingOf = (cheng) => cheng === "str" ? "string" : cheng === "int64" ? "number" : cheng === "bool" ? "boolean" : cheng;
                        this.index.typeDeclByName.set(name, { kind: "synthesized.annotated_object_literal", name, members: fields.map((f) => ({ name: sanitizeFieldName(f.name), optional: f.optional, type: tsSpellingOf(f.cheng) })) });
                    }
                    this.types.map(name);
                    return name;
                }
            }
            // synthesized value-model struct (deterministic name from the scalar-field shape)
            const fields = this.objectLiteralShape(op);
            if (fields !== undefined)
                return this.synthStructName(fields);
            return undefined;
        }
        if (op.opKind === "array_literal") {
            const elementIds = op.elements ?? [];
            const spreadFlags = op.spreadFlags ?? [];
            if (elementIds.length === 1 && spreadFlags[0] === true)
                return this.exprType(elementIds[0]);
            // element type from the first operand whose type resolves: a spread contributes its element
            // type (T[] -> T), a bare element contributes its own type. Result is always `<elem>[]`.
            for (let k = 0; k < elementIds.length; k++) {
                const t = this.exprType(elementIds[k]);
                if (t === undefined)
                    continue;
                const elem = spreadFlags[k] === true ? (t.endsWith("[]") ? t.slice(0, -2) : t) : t;
                return `${elem}[]`;
            }
            return undefined;
        }
        return undefined;
    }
    emitExpr(opId, pre, indent) {
        const op = this.index.opsById.get(opId);
        if (!op) {
            this.fail(opId, "expression op not found");
            return "0";
        }
        switch (op.opKind) {
            case "literal": {
                const v = this.index.dataById.get(String(op.data));
                if (typeof v === "number") {
                    if (!Number.isInteger(v)) {
                        this.fail(op.id, `non-integer numeric literal ${v} (number maps to int64)`);
                        return "int64(0)";
                    }
                    return `int64(${v})`;
                }
                if (typeof v === "string")
                    return JSON.stringify(v);
                if (typeof v === "boolean")
                    return v ? "true" : "false";
                if (v === null)
                    return "\"\"";
                this.fail(op.id, `unsupported literal value ${JSON.stringify(v)}`);
                return "0";
            }
            case "identifier": {
                const name = String(op.name);
                const constVal = this.constBindings.get(name);
                if (constVal !== undefined)
                    return constVal;
                if (this.localTypes.has(name))
                    return this.renameOf(name);
                const moduleConst = this.index.constLiterals.get(name);
                if (moduleConst !== undefined) {
                    const moduleConstType = this.index.constLiteralTypes.get(name);
                    if (moduleConstType !== undefined)
                        this.types.map(moduleConstType);
                    return moduleConst;
                }
                if (name === "undefined" || name === "null")
                    return "\"\"";
                this.fail(op.id, `unresolved identifier '${name}'`);
                return name;
            }
            case "binary": {
                const operator = String(op.operator);
                // catch-param `error instanceof Error` (synchronous-collapse try/catch): the try mark
                // carries the REAL Error message string thrown by `throw new Error(...)` — the only
                // throw shape lowered — so instanceof-Error on the current catch parameter is always
                // true. Any other instanceof has no honest value -> fail loudly.
                if (operator === "InstanceOfKeyword") {
                    const leftOp = this.index.opsById.get(String(op.left));
                    const rightOp = this.index.opsById.get(String(op.right));
                    const isCatchParam = !!leftOp && leftOp.opKind === "identifier" && this.catchParamStack.includes(String(leftOp.name));
                    const isErrorRight = !!rightOp && rightOp.opKind === "identifier" && String(rightOp.name) === "Error";
                    if (isCatchParam && isErrorRight)
                        return "true";
                    this.fail(op.id, `unsupported instanceof shape (only '<catchParam> instanceof Error' is lowered)`);
                    return "false";
                }
                if (operator === "QuestionQuestionToken") {
                    // `(<optional-absent field read>) ?? y`: the field is absent on this call-site
                    // instance by construction (see optionalAbsentFieldType), so it is CONSTANTLY
                    // undefined here and the right side is the exact JS result — never an approximation.
                    {
                        const leftOp = this.index.opsById.get(String(op.left));
                        if (leftOp && leftOp.opKind === "property_read" && this.optionalAbsentFieldType(String(leftOp.name)) !== undefined) {
                            const recvTypeOfLeft = this.exprType(String(leftOp.receiver));
                            if (recvTypeOfLeft !== undefined && this.index.typeDeclByName.has(recvTypeOfLeft) && this.typeDeclFieldOf(recvTypeOfLeft, String(leftOp.name)) === undefined) {
                                const absentType = this.optionalAbsentFieldType(String(leftOp.name));
                                const rightOp = this.index.opsById.get(String(op.right));
                                if (absentType !== undefined && rightOp && rightOp.opKind === "object_literal" && ((rightOp.properties ?? []).length === 0) && absentType !== "str" && absentType !== "int64" && absentType !== "bool" && !absentType.endsWith("[]") && absentType !== "json.JsonNode") {
                                    // `absentStruct ?? {}` — both sides are the same zero struct, so the absent
                                    // zero IS the exact JS result ({} == undefined here produces {} either way).
                                    return this.zeroValueExprFor(absentType, pre, indent);
                                }
                                return this.emitExpr(String(op.right), pre, indent);
                            }
                        }
                    }
                    // zero-sentinel model: ?? takes the fallback when the left side is
                    // the falsy zero value (JS difference only when the left is a real
                    // ""/0/false, which the nullable-primitive mapping already folds)
                    const t = this.exprType(String(op.left)) ?? this.exprType(String(op.right));
                    if (t !== "str" && t !== "int64" && t !== "bool") {
                        this.fail(op.id, `?? on unsupported type '${t}'`);
                        return "0";
                    }
                    const tmp = this.freshVar("coal");
                    const leftExpr = this.emitExpr(String(op.left), pre, indent);
                    pre.push(`${indent}var ${tmp} = ${leftExpr}`);
                    const zeroCheck = t === "str" ? `len(${tmp}) == 0` : t === "int64" ? `${tmp} == int64(0)` : `!${tmp}`;
                    const innerPre = [];
                    const rightExpr = this.emitExpr(String(op.right), innerPre, indent + "    ");
                    pre.push(`${indent}if ${zeroCheck}:`);
                    pre.push(...innerPre);
                    pre.push(`${indent}    ${tmp} = ${rightExpr}`);
                    return tmp;
                }
                if (operator === "SlashToken") {
                    // int64 number model: division floors (deviation from JS fractional
                    // division is part of the recorded integer-semantics subset)
                    this.preludeUsed.add("jsFloorDiv");
                    const numer = this.emitExpr(String(op.left), pre, indent);
                    const denom = this.emitExpr(String(op.right), pre, indent);
                    return `jsFloorDiv(${numer}, ${denom})`;
                }
                const mapped = BINARY_OPERATOR_MAP.get(operator);
                if (mapped === undefined) {
                    this.fail(op.id, `unsupported binary operator '${operator}'`);
                    return "0";
                }
                if (mapped === "&&" || mapped === "||") {
                    // JS `a || b` / `a && b` return an OPERAND value, not a boolean. When BOTH operands are
                    // the SAME value type (str/int64), emit the value-returning form: `||` yields the left
                    // when truthy else the right; `&&` yields the left when falsy else the right (same
                    // temp-var pattern as `??`). An undefined/null side adopts the other side's type
                    // (its absence IS that side's zero value). Mixed/bool operands keep the boolean
                    // short-circuit form.
                    let lt2 = this.exprType(String(op.left));
                    let rt2 = this.exprType(String(op.right));
                    if (rt2 === undefined && this.isUndefinedishOperand(String(op.right)))
                        rt2 = lt2;
                    else if (lt2 === undefined && this.isUndefinedishOperand(String(op.left)))
                        lt2 = rt2;
                    const vt = (lt2 === rt2) ? lt2 : undefined;
                    if (vt === "str" || vt === "int64") {
                        const tmp = this.freshVar(mapped === "||" ? "lor" : "land");
                        const leftExpr = this.emitExpr(String(op.left), pre, indent);
                        pre.push(`${indent}var ${tmp} = ${leftExpr}`);
                        const truthy = vt === "str" ? `len(${tmp}) > 0` : `${tmp} != int64(0)`;
                        const cond = mapped === "||" ? `if !(${truthy}):` : `if ${truthy}:`;
                        const innerPre = [];
                        const rightExpr = this.emitExpr(String(op.right), innerPre, indent + "    ");
                        pre.push(`${indent}${cond}`);
                        pre.push(...innerPre);
                        pre.push(`${indent}    ${tmp} = ${rightExpr}`);
                        return tmp;
                    }
                    const rightOp = this.index.opsById.get(String(op.right));
                    const rightIsEmptyObject = rightOp?.opKind === "object_literal" &&
                        ((rightOp.properties ?? []).length === 0) &&
                        ((rightOp.elements ?? []).length === 0);
                    if (mapped === "||" && lt2 !== undefined && this.index.typeDeclByName.has(lt2) && (rt2 === lt2 || rightIsEmptyObject)) {
                        return this.emitExpr(String(op.left), pre, indent);
                    }
                    const left = this.emitCondition(String(op.left), pre, indent);
                    const right = this.emitCondition(String(op.right), pre, indent);
                    return `(${left} ${mapped} ${right})`;
                }
                const left = this.emitExpr(String(op.left), pre, indent);
                const right = this.emitExpr(String(op.right), pre, indent);
                return `(${left} ${mapped} ${right})`;
            }
            case "unary": {
                const operator = String(op.operator);
                // emitCondition returns an UNPARENTHESIZED comparison for non-bool operands (str →
                // `len(x) > 0`, int → `x != int64(0)`), so `!` must wrap it or precedence breaks it
                // into `(!len(x)) > 0`. Parenthesize the inner condition.
                if (operator === "ExclamationToken")
                    return `(!(${this.emitCondition(String(op.operand), pre, indent)}))`;
                if (operator === "MinusToken")
                    return `(int64(0) - ${this.emitExpr(String(op.operand), pre, indent)})`;
                this.fail(op.id, `unsupported unary operator '${operator}'`);
                return "0";
            }
            case "await": {
                // Synchronous-collapse await (mechanism-9/10 headless slice): under the headless host
                // every async leaf resolves to a synchronous dual-state bridge call, so `await x`
                // lowers to evaluating x synchronously and then checking the error channel — a pending
                // rejection either propagates (no enclosing try: return this fn's zero value, channel
                // preserved for the caller's own await) or enters the nearest catch (enclosing try:
                // move the message to the try mark and break out of the shell).
                const awaited = this.emitExpr(String(op.value ?? op.operand ?? ""), pre, indent);
                const v = this.freshVar("await");
                pre.push(indent + `let ${v} = ${awaited}`);
                this.preludeUsed.add("chtAsyncError");
                pre.push(indent + `if len(__chtAsyncError) > 0:`);
                if (this.tryMarkStack.length > 0) {
                    const mark = this.tryMarkStack[this.tryMarkStack.length - 1];
                    pre.push(indent + `    ${mark} = __chtAsyncError`);
                    pre.push(indent + `    __chtAsyncError = ""`);
                    pre.push(indent + "    break");
                }
                else {
                    pre.push(indent + `    return ${this.types.zeroValueOf(this.currentReturnType) || "0"}`);
                }
                return v;
            }
            case "call":
                return this.emitCall(op, pre, indent);
            case "template": {
                const parts = op.parts ?? [];
                const spans = op.spanOpIds ?? [];
                const pieces = [];
                for (let i = 0; i < parts.length; i++) {
                    if (parts[i].length > 0)
                        pieces.push(JSON.stringify(parts[i]));
                    if (i < spans.length) {
                        const spanType = this.exprType(spans[i]);
                        const spanExpr = this.emitExpr(spans[i], pre, indent);
                        if (spanType === "str")
                            pieces.push(spanExpr);
                        else if (spanType === "int64") {
                            this.preludeUsed.add("jsNumToStr");
                            pieces.push(`jsNumToStr(${spanExpr})`);
                        }
                        else {
                            this.fail(op.id, `template span has unsupported type '${spanType}'`);
                        }
                    }
                }
                if (pieces.length === 0)
                    return "\"\"";
                return pieces.join(" + ");
            }
            case "property_read": {
                const fieldName = String(op.name);
                const objField = this.objBoxRefFieldAccess(op);
                if (objField !== undefined)
                    return this.objBoxRefFieldVar(objField.refName, objField.field); // obj box-ref `.current.f` -> field slot
                const objRn = this.objBoxRefCurrentName(op);
                if (objRn !== undefined)
                    return this.objBoxRefPresentVar(objRn); // obj box-ref `.current` truthiness -> present slot
                const boxRn = this.boxRefCurrentName(op);
                if (boxRn !== undefined)
                    return this.boxRefSlotVar(boxRn); // scalar box-ref deref -> slot var
                // Array box-ref length read (mechanism 12): `<arrBoxRef>.current.length` — the only
                // property read the whitelist permits on `.current` besides the push/copy/clear call and
                // write shapes handled in emitCall/property_write. Checked BEFORE the generic `recv`
                // computation two lines below, which would otherwise recurse into `.current` itself and
                // fail (arrBoxRefSlots has no bare-`.current` resolution — mirroring mechanism 11's
                // setBoxRefSlots, `.current` is only ever resolved as part of one of the whitelisted shapes).
                if (fieldName === "length") {
                    const arrReceiverOp = this.index.opsById.get(String(op.receiver));
                    const arrRn = arrReceiverOp ? this.arrBoxRefCurrentName(arrReceiverOp) : undefined;
                    if (arrRn !== undefined)
                        return `int64(${this.boxRefSlotVar(arrRn)}.len)`;
                }
                // Struct box-ref bare `.current` (mechanism 14) — the WHOLE-VALUE read shape (e.g.
                // `return iceConfigRef.current;`), default codegen for this op. The other supported shape
                // (`if (iceConfigRef.current)`, a TRUTHY condition) is intercepted earlier, in
                // emitCondition, before it ever reaches this generic emitExpr path — so the same op id
                // reads as "the struct value" here and as "is it present" there, exactly matching each
                // shape's own JS semantics (never a bool coercion of a struct value at the Cheng level,
                // which has no such coercion).
                const structRn = this.structBoxRefCurrentName(op);
                if (structRn !== undefined)
                    return this.boxRefSlotVar(structRn);
                // Mechanism 21 (ref-state-mirror `.current` fold): the mirrored state was injected as
                // this function's free-var parameter under the REF's own name, so the deref folds to the
                // parameter itself (renameOf resolves any active shadow-rename, mirroring the identifier
                // case below). Field access/writes on `.current` were rejected at .mjs admission time.
                const mirrorRn = this.refStateMirrorCurrentName(op);
                if (mirrorRn !== undefined)
                    return this.renameOf(mirrorRn);
                const videoRef = this.hostVideoRefCurrentName(op);
                if (videoRef !== undefined)
                    return this.hostVideoHandleExpr(videoRef);
                if (this.hostObjectCurrentRead(op))
                    return "true"; // bridged ref deref: present by contract
                if (this.hostFullscreenElementRead(op))
                    return "chengFullscreenActive()";
                // ChtEvent DOM-input read (params:event handlers): `e.target.value` /
                // `e.currentTarget.value` lower to the __csgEventTargetValue host bridge. target/currentTarget
                // are int64 opaque node handles (ChtEvent struct) and the input's live string value lives
                // host-side (retained scene graph / native DOM), so the read is a bridge call on the WHOLE
                // event, never a struct-field deref of the handle. Only lowered when the .mjs side actually
                // registered the bridge (externImpls key present — externNames is derived from it, see
                // transpileClosure) — otherwise the pre-existing honest `.value on unsupported receiver type`
                // failure below stands, never a fabricated "".
                if (fieldName === "value") {
                    const evFieldOp = this.index.opsById.get(String(op.receiver));
                    if (evFieldOp && evFieldOp.opKind === "property_read" && (String(evFieldOp.name) === "target" || String(evFieldOp.name) === "currentTarget")) {
                        const evRootOp = typeof evFieldOp.receiver === "string" ? this.index.opsById.get(evFieldOp.receiver) : undefined;
                        if (evRootOp && evRootOp.opKind === "identifier" && this.localTypes.get(String(evRootOp.name)) === "ChtEvent" && this.externNames.has("__csgEventTargetValue")) {
                            return `__csgEventTargetValue(${this.renameOf(String(evRootOp.name))})`;
                        }
                    }
                }
                const recv = this.emitExpr(String(op.receiver), pre, indent);
                if (fieldName === "length") {
                    const recvType = this.exprType(String(op.receiver));
                    if (recvType === "str")
                        return `int64(len(${recv}))`;
                    if (recvType !== undefined && recvType.endsWith("[]"))
                        return `int64(${recv}.len)`;
                    this.fail(op.id, `.length on unsupported receiver type '${recvType}'`);
                    return "int64(0)";
                }
                // catch-param `error.message` (synchronous-collapse try/catch): the catch parameter
                // already IS the thrown Error's message string (the mark carries exactly it), so the
                // property read reduces to the parameter itself — exact identity, not an approximation.
                if (fieldName === "message") {
                    const recvOp = this.index.opsById.get(String(op.receiver));
                    if (!!recvOp && recvOp.opKind === "identifier" && this.catchParamStack.includes(String(recvOp.name)))
                        return this.renameOf(String(recvOp.name));
                }
                const recvType = this.exprType(String(op.receiver));
                if (fieldName === "paused" && recvType === "int64")
                    return `chengVideoPaused(${recv})`;
                if (recvType === "json.JsonNode") {
                    return `json.JsonGetField(${recv}, ${JSON.stringify(fieldName)})`;
                }
                if (recvType !== undefined && this.index.typeDeclByName.has(recvType)) {
                    if (this.typeDeclFieldOf(recvType, fieldName) !== undefined)
                        return `${recv}.${sanitizeFieldName(fieldName)}`;
                    // Optional-absent field (envelope-construction family): the field is NOT on the
                    // (call-site-instantiated) struct, but the CURRENT function's own inline-object
                    // parameter annotation declares it OPTIONAL (e.g. options.extra / options.signal on
                    // an instance synthesized from a literal that simply omits them). JS reads undefined
                    // there; the Cheng counterpart is the field's declared zero value ("" for str — the
                    // same absence convention every state slot already uses; a fresh zero struct for a
                    // struct field; json.NewJObject() for a json field). No annotation match -> the field
                    // genuinely does not exist -> fail loudly below.
                    const absent = this.optionalAbsentFieldType(fieldName);
                    if (absent !== undefined)
                        return this.zeroValueExprFor(absent, pre, indent);
                    this.fail(op.id, `property '${fieldName}' does not exist on '${recvType}' and is not a declared-optional parameter field`);
                    return "0";
                }
                this.fail(op.id, `property '${fieldName}' on unsupported receiver type '${recvType}'`);
                return "0";
            }
            case "element_read": {
                const recv = this.emitExpr(String(op.receiver), pre, indent);
                const idx = this.emitExpr(String(op.argument), pre, indent);
                const recvType = this.exprType(String(op.receiver));
                if (recvType === "json.JsonNode")
                    return `${recv}[${idx}]`;
                if (recvType !== undefined && recvType.endsWith("[]"))
                    return `${recv}[int32(${idx})]`;
                this.fail(op.id, `element read on unsupported receiver type '${recvType}'`);
                return "0";
            }
            case "expression": {
                const ek = String(op.expressionKind ?? "");
                if (ek === "AsExpression" || ek === "NonNullExpression" || ek === "ParenthesizedExpression" || ek === "SatisfiesExpression") {
                    return this.emitExpr(String(op.operand ?? op.value), pre, indent);
                }
                if (ek === "VoidExpression") {
                    // `void EXPR` discards the result — emit the operand for its side effect. A bridged/named
                    // call survives; an un-emittable operand (e.g. an async IIFE arrow) fails honestly in emitExpr.
                    if (typeof op.operand !== "string") {
                        this.fail(op.id, "void expression without operand");
                        return "0";
                    }
                    return this.emitExpr(String(op.operand), pre, indent);
                }
                if (ek === "TypeOfExpression") {
                    const t = this.exprType(String(op.operand));
                    if (t === "str")
                        return JSON.stringify("string");
                    if (t === "int64")
                        return JSON.stringify("number");
                    if (t === "bool")
                        return JSON.stringify("boolean");
                    this.fail(op.id, `typeof on unsupported operand type '${t}'`);
                    return "\"\"";
                }
                if (ek === "ConditionalExpression") {
                    const t = this.exprType(String(op.whenTrue)) ?? this.exprType(String(op.whenFalse));
                    if (t === undefined) {
                        this.fail(op.id, "ternary branches have no inferable type");
                        return "0";
                    }
                    const tmp = this.freshVar("tern");
                    const cond = this.emitCondition(String(op.condition), pre, indent);
                    const zero = this.types.zeroValueOf(t);
                    if (zero.length > 0) {
                        pre.push(`${indent}var ${tmp} = ${zero}`);
                    }
                    else {
                        pre.push(`${indent}var ${tmp}: ${t}`);
                    }
                    const thenPre = [];
                    const thenExpr = this.emitExpr(String(op.whenTrue), thenPre, indent + "    ");
                    pre.push(`${indent}if ${cond}:`);
                    pre.push(...thenPre);
                    pre.push(`${indent}    ${tmp} = ${thenExpr}`);
                    const elsePre = [];
                    const elseExpr = this.emitExpr(String(op.whenFalse), elsePre, indent + "    ");
                    pre.push(`${indent}else:`);
                    pre.push(...elsePre);
                    pre.push(`${indent}    ${tmp} = ${elseExpr}`);
                    return tmp;
                }
                this.fail(op.id, `unsupported expression kind '${ek}'`);
                return "0";
            }
            case "object_literal": {
                // `{}` — an empty object literal is EXACTLY an empty Record in every TS context (TS
                // has no empty-struct type), so the Cheng counterpart is the empty json object.
                {
                    const emptyProps = (op.properties ?? []).length === 0 && (op.elements ?? []).length === 0;
                    if (emptyProps)
                        return "json.NewJObject()";
                }
                const annotated = typeof op.returnType === "string" ? this.types.map(op.returnType) : { type: undefined };
                const elementIds = op.elements ?? [];
                const spreadFlags = op.spreadFlags ?? [];
                const propertyNames = op.propertyNames ?? [];
                const computedKeys = op.computedKeys ?? [];
                // Record-vs-struct spread disambiguation: a spread literal takes the json path ONLY
                // when it is Record-typed (annotation maps to json.JsonNode) or carries NO named struct
                // type at all. A spread literal with a real struct annotation (e.g. createRealtimeCall-
                // SignalEnvelope's `{...buildBaseEnvelope(...), action, ... }`) belongs to the struct
                // spread path below (field-wise copy via targetMemberNames) — sending it down the json
                // path emits json bracket writes on a struct, a hard cold error (unsupported index
                // assignment target).
                const jsonNode = annotated.type === "json.JsonNode" || ((elementIds.length > 0 && spreadFlags.some((f) => f === true)) && (annotated.type === undefined || annotated.type === "json.JsonNode"));
                if (jsonNode || annotated.type === "json.JsonNode") {
                    // Record spread/update: `{...base, [k]: v}` / `{...base, k: v}` → in-place bracket writes on base.
                    if (elementIds.length >= 1 && spreadFlags[0] === true) {
                        const base = this.emitExpr(elementIds[0], pre, indent);
                        const out = this.freshVar("rec");
                        pre.push(`${indent}let ${out} = ${base}`);
                        for (let k = 1; k < elementIds.length; k++) {
                            if (spreadFlags[k] === true) {
                                this.fail(op.id, "multi-spread Record literal not yet supported");
                                return "json.NewJObject()";
                            }
                            const keyExpr = computedKeys[k] !== undefined
                                ? this.emitExpr(String(computedKeys[k]), pre, indent)
                                : JSON.stringify(String(propertyNames[k] ?? ""));
                            const val = this.emitExpr(elementIds[k], pre, indent);
                            pre.push(`${indent}${out}[${keyExpr}] = ${val}`);
                        }
                        return out;
                    }
                    const tmp = this.freshVar("obj");
                    pre.push(`${indent}let ${tmp} = json.NewJObject()`);
                    for (let k = 0; k < elementIds.length; k++) {
                        if (spreadFlags[k] === true)
                            continue;
                        const keyExpr = computedKeys[k] !== undefined
                            ? this.emitExpr(String(computedKeys[k]), pre, indent)
                            : JSON.stringify(String(propertyNames[k] ?? ""));
                        const val = this.emitExpr(elementIds[k], pre, indent);
                        pre.push(`${indent}${tmp}[${keyExpr}] = ${val}`);
                    }
                    return tmp;
                }
                // Prefer the exprType-driven name (annotated-literal synthesis for union-membered
                // annotations included — the decl is already registered there); else the checker-mapped
                // name; else synthesize one from the object's scalar-field shape (Phase 1 value model).
                let typeName = this.exprType(op.id);
                if (typeName === undefined || !this.index.typeDeclByName.has(typeName)) {
                    typeName = annotated.type !== undefined && this.index.typeDeclByName.has(annotated.type) ? annotated.type : undefined;
                }
                if (typeName === undefined)
                    typeName = this.synthesizeObjectStruct(op);
                if (typeName === undefined) {
                    const shape = this.objectLiteralShape(op);
                    const reason = shape === undefined ? "non-scalar or un-inferable field value (nested-value atom)" : "no synthesizable shape";
                    this.fail(op.id, `object literal needs a named struct type (${reason})`);
                    return "0";
                }
                const tmp = this.freshVar("obj");
                pre.push(`${indent}var ${tmp}: ${typeName}`);
                const targetDecl = this.index.typeDeclByName.get(typeName);
                const targetMembers = (targetDecl?.members ?? []);
                const targetMemberNames = new Set(targetMembers.map((m) => sanitizeFieldName(m.name)));
                if (elementIds.length > 0 && spreadFlags.length === elementIds.length) {
                    for (let k = 0; k < elementIds.length; k++) {
                        if (spreadFlags[k] === true) {
                            const baseExpr = this.emitExpr(elementIds[k], pre, indent);
                            const baseType = this.exprType(elementIds[k]);
                            const baseDecl = baseType !== undefined ? this.index.typeDeclByName.get(baseType) : undefined;
                            const baseMembers = (baseDecl?.members ?? []);
                            for (const member of baseMembers) {
                                const fieldName = sanitizeFieldName(member.name);
                                if (targetMemberNames.has(fieldName))
                                    pre.push(`${indent}${tmp}.${fieldName} = ${baseExpr}.${fieldName}`);
                            }
                            continue;
                        }
                        const propName = propertyNames[k];
                        if (propName === undefined)
                            continue;
                        const v = this.emitExpr(elementIds[k], pre, indent);
                        pre.push(`${indent}${tmp}.${sanitizeFieldName(propName)} = ${v}`);
                    }
                }
                else {
                    const props = op.properties ?? [];
                    for (const prop of props) {
                        const v = this.emitExpr(prop.value, pre, indent);
                        pre.push(`${indent}${tmp}.${sanitizeFieldName(prop.name)} = ${v}`);
                    }
                }
                return tmp;
            }
            case "array_literal": {
                const elementIds = op.elements ?? [];
                const spreadFlags = op.spreadFlags ?? [];
                if (elementIds.length === 1 && spreadFlags[0] === true) {
                    // Array box-ref copy-read (mechanism 12): `[...<arrBoxRef>.current]`. MUST be a real,
                    // independent element-by-element copy — never the generic single-spread alias shortcut
                    // below. Cheng `T[]` assignment shares the underlying buffer (proven empirically: `var b
                    // = a; b[0] = x` mutates `a` too — it is NOT a value copy), and the real call site
                    // (ChessPage.tsx flushPendingIceCandidates) reads this copy AFTER the ref is cleared
                    // elsewhere in the same handler (`ref.current = []`, mechanism 12 shape 1) — aliasing the
                    // slot var here would let a LATER push into the (cleared-but-same-capacity) slot silently
                    // corrupt data the caller believes is a stable snapshot. The generic shortcut is only
                    // sound because ITS consumers (sort/filter) always copy again downstream; this one does not.
                    const srcOp = this.index.opsById.get(elementIds[0]);
                    const arrRn = srcOp ? this.arrBoxRefCurrentName(srcOp) : undefined;
                    if (arrRn !== undefined) {
                        const elemType = this.arrBoxRefSlots.get(arrRn);
                        const slotVar = this.boxRefSlotVar(arrRn);
                        const out = this.freshVar("arrCopy");
                        const i = this.freshVar("i");
                        pre.push(`${indent}var ${out}: ${elemType}[]`);
                        pre.push(`${indent}var ${i} = 0`);
                        pre.push(`${indent}while ${i} < ${slotVar}.len:`);
                        pre.push(`${indent}    add(${out}, ${slotVar}[int32(${i})])`);
                        pre.push(`${indent}    ${i} = ${i} + 1`);
                        return out;
                    }
                    // [...xs] — defer the copy to the consumer (sort/filter copy anyway)
                    return this.emitExpr(elementIds[0], pre, indent);
                }
                if (spreadFlags.some((f) => f === true)) {
                    // Mixed/multi-element spread `[...a, x, ...b]` → fresh array built by push-loops for spread
                    // operands and `add` for scalar operands. SCALAR-array indexed writes are miscompiled by the
                    // cold backend, but `add` (push) works for both scalar and struct arrays — so the whole
                    // build is push-based. The result element type is inferred from the first operand: a spread
                    // contributes its element type, a bare element contributes its own type.
                    let elemType;
                    for (let k = 0; k < elementIds.length; k++) {
                        const t = this.exprType(elementIds[k]);
                        if (t === undefined)
                            continue;
                        elemType = spreadFlags[k] === true ? (t.endsWith("[]") ? t.slice(0, -2) : t) : t;
                        if (elemType !== undefined)
                            break;
                    }
                    if (elemType === undefined) {
                        this.fail(op.id, "spread array literal element type not inferable");
                        return "0";
                    }
                    const out = this.freshVar("spread");
                    pre.push(`${indent}var ${out}: ${elemType}[]`);
                    for (let k = 0; k < elementIds.length; k++) {
                        if (spreadFlags[k] === true) {
                            const srcExpr = this.emitExpr(elementIds[k], pre, indent);
                            const src = this.freshVar("ssrc");
                            const i = this.freshVar("i");
                            pre.push(`${indent}let ${src} = ${srcExpr}`);
                            pre.push(`${indent}var ${i} = 0`);
                            pre.push(`${indent}while ${i} < ${src}.len:`);
                            pre.push(`${indent}    add(${out}, ${src}[int32(${i})])`);
                            pre.push(`${indent}    ${i} = ${i} + 1`);
                        }
                        else {
                            const v = this.emitExpr(elementIds[k], pre, indent);
                            pre.push(`${indent}add(${out}, ${v})`);
                        }
                    }
                    return out;
                }
                const elements = elementIds.map((e) => this.emitExpr(e, pre, indent));
                return `[${elements.join(", ")}]`;
            }
            default:
                this.fail(op.id, `unsupported expression op '${op.opKind}'`);
                return "0";
        }
    }
    // ------------------------------------------------------------------
    // Arrow inlining: resolve a function_value argument to its body's single
    // return expression. Captured locals stay valid because we inline into the
    // same Cheng scope. Multi-statement arrow bodies are not yet supported.
    // ------------------------------------------------------------------
    resolveArrowReturnExpr(argOpId) {
        const argOp = this.index.opsById.get(argOpId);
        if (!argOp || argOp.opKind !== "function_value")
            return undefined;
        const targetId = String(argOp.targetFunction ?? "");
        const target = this.index.functionById.get(targetId);
        if (!target)
            return undefined;
        const params = (target.parameters ?? []).map((p) => p.name);
        const entry = this.entryBlockOf(targetId);
        if (entry === undefined)
            return undefined;
        const ops = (this.index.opsByBlock.get(entry) ?? []).filter((op) => op.function === targetId);
        const statements = ops.filter((op) => STATEMENT_OP_KINDS.has(op.opKind));
        const last = statements[statements.length - 1];
        if (!last || last.opKind !== "return" || typeof last.value !== "string")
            return undefined;
        const bindings = [];
        for (const st of statements.slice(0, -1)) {
            // an "expression"-kind op that IS the returned value (e.g. a ConditionalExpression in
            // `prev => a ? b : c`) is listed as a statement but is really the return expression — skip it.
            if (st.id === String(last.value))
                continue;
            if ((st.opKind === "local_write" || st.opKind === "var_statement") && typeof st.name === "string" && st.name.length > 0 && typeof st.value === "string") {
                bindings.push(st);
                continue;
            }
            if (st.opKind === "var_statement" && (st.name === undefined || String(st.name).length === 0))
                continue;
            return undefined; // anything beyond simple let-bindings is not inlinable yet
        }
        return { fnId: targetId, params, bindings, returnOpId: String(last.value) };
    }
    resolveZeroArgLocalReturnExpr(functionId) {
        const target = this.index.functionById.get(functionId);
        if (!target || String(target.name ?? "") !== "<anonymous>")
            return undefined;
        const params = target.parameters ?? [];
        if (params.length !== 0)
            return undefined;
        const entry = this.entryBlockOf(functionId);
        if (entry === undefined)
            return undefined;
        const ops = (this.index.opsByBlock.get(entry) ?? []).filter((op) => op.function === functionId);
        const statements = ops.filter((op) => STATEMENT_OP_KINDS.has(op.opKind));
        const ret = statements[statements.length - 1];
        if (!ret)
            return undefined;
        if (ret.opKind !== "return" || typeof ret.value !== "string")
            return undefined;
        for (const st of statements.slice(0, -1)) {
            if (st.id === String(ret.value))
                continue;
            if (st.opKind === "var_statement" && (st.name === undefined || String(st.name).length === 0))
                continue;
            return undefined;
        }
        return { returnOpId: String(ret.value) };
    }
    emitArrowBindings(arrow, renames, pre, indent) {
        for (const st of arrow.bindings) {
            const orig = String(st.name);
            const fresh = this.freshVar(orig);
            const before = this.diagnostics.length;
            this.renameStack.push(renames);
            let valueExpr;
            try {
                valueExpr = this.emitExpr(String(st.value), pre, indent);
            }
            finally {
                this.renameStack.pop();
            }
            if (this.diagnostics.length > before)
                return false;
            const t = this.exprTypeUnderRenames(String(st.value), renames);
            if (t === undefined)
                return false;
            pre.push(`${indent}let ${fresh} = ${valueExpr}`);
            renames.set(orig, fresh);
            this.localTypes.set(orig, t);
        }
        return true;
    }
    exprTypeUnderRenames(opId, renames) {
        this.renameStack.push(renames);
        try {
            return this.exprType(opId);
        }
        finally {
            this.renameStack.pop();
        }
    }
    inlineArrowExpr(arrow, paramBindings, elemTypes, pre, indent) {
        const saved = new Map();
        for (const [param] of paramBindings) {
            saved.set(param, this.localTypes.get(param));
            const t = elemTypes.get(param);
            if (t === undefined)
                return undefined;
            this.localTypes.set(param, t);
        }
        const renames = new Map();
        for (const [param, loopVar] of paramBindings)
            renames.set(param, loopVar);
        const before = this.diagnostics.length;
        let raw;
        if (!this.emitArrowBindings(arrow, renames, pre, indent)) {
            raw = undefined;
        }
        else {
            raw = this.emitExprWithRenames(arrow.returnOpId, renames, pre, indent);
        }
        for (const [param, prev] of saved) {
            if (prev === undefined)
                this.localTypes.delete(param);
            else
                this.localTypes.set(param, prev);
        }
        if (this.diagnostics.length > before)
            return undefined;
        return raw;
    }
    renameStack = [];
    emitExprWithRenames(opId, renames, pre, indent) {
        this.renameStack.push(renames);
        try {
            return this.emitExpr(opId, pre, indent);
        }
        finally {
            this.renameStack.pop();
        }
    }
    renameOf(name) {
        for (let i = this.renameStack.length - 1; i >= 0; i--) {
            const hit = this.renameStack[i].get(name);
            if (hit !== undefined)
                return hit;
        }
        return name;
    }
    emitCall(op, pre, indent) {
        const callee = String(op.callee ?? "");
        const memberName = typeof op.memberName === "string" ? op.memberName : "";
        const argIds = op.arguments ?? [];
        // ChtEvent DOM-event ABI (params:event handlers): preventDefault/stopPropagation on the
        // synthesized event struct lower to field writes — never fabricated host calls.
        // preventDefault sets defaultPrevented (radix handlers read it back on the same event);
        // stopPropagation is a no-op under the single-handler dispatch (no propagation chain).
        if ((memberName === "preventDefault" || memberName === "stopPropagation") && typeof op.receiver === "string") {
            const recvOp = this.index.opsById.get(op.receiver);
            if (recvOp && recvOp.opKind === "identifier" && this.localTypes.get(String(recvOp.name)) === "ChtEvent") {
                if (argIds.length !== 0) {
                    this.fail(op.id, `ChtEvent.${memberName} takes no arguments, got ${argIds.length}`);
                    return "0";
                }
                if (memberName === "preventDefault")
                    pre.push(indent + `${recvOp.name}.defaultPrevented = true`);
                return "";
            }
        }
        // `e.currentTarget.contains(x)` / `e.target.contains(x)`: the only DOM node method the
        // retained scene graph implements exactly (ancestor walk). Receiver must be a ChtEvent
        // currentTarget/target field read — any other `.contains(` shape keeps the honest failure.
        if (memberName === "contains" && argIds.length === 1 && typeof op.receiver === "string") {
            const fieldOp = this.index.opsById.get(op.receiver);
            if (fieldOp && fieldOp.opKind === "property_read" && (String(fieldOp.name) === "currentTarget" || String(fieldOp.name) === "target")) {
                const rootOp = this.index.opsById.get(String(fieldOp.receiver));
                if (rootOp && rootOp.opKind === "identifier" && this.localTypes.get(String(rootOp.name)) === "ChtEvent") {
                    const haystack = this.emitExpr(op.receiver, pre, indent);
                    const needle = this.emitExpr(String(argIds[0]), pre, indent);
                    return `__chtDomContains(${haystack}, ${needle})`;
                }
            }
        }
        // Promise.all([a, b, ...]) synchronous-collapse (mechanism-9/10 headless slice): every
        // element call is issued in source order (under the headless host they are synchronous
        // dual-state bridge calls — JS starts all of them before settling, and the sequential
        // evaluation preserves exactly that: every element's side effects happen), the channel is
        // snapshotted and cleared after each, and the FIRST non-empty error wins (a legal,
        // deterministic choice of "first rejection" — with multiple failures JS's temporal winner is
        // unspecified, so reporting the earliest in source order is a faithful implementation,
        // never a fabricated one). The array result is only ever ignored on the compiled chain
        // (handleVoiceAction awaits Promise.all purely for completion) — a destructured/indexed
        // read of it would need element typing and must fail loudly if ever reached.
        if ((callee === "Promise.all" || (memberName === "all" && (() => { const r = this.index.opsById.get(String(op.receiver)); return !!r && r.opKind === "identifier" && String(r.name) === "Promise"; })())) && argIds.length === 1) {
            const arrOp = this.index.opsById.get(String(argIds[0]));
            if (!arrOp || arrOp.opKind !== "array_literal") {
                this.fail(op.id, "Promise.all with a non-array-literal argument is not lowered");
                return "0";
            }
            const elemIds = arrOp.elements ?? [];
            const errVars = [];
            for (let i = 0; i < elemIds.length; i++) {
                this.preludeUsed.add("chtAsyncError");
                pre.push(indent + `__chtAsyncError = ""`);
                const elemExpr = this.emitExpr(String(elemIds[i]), pre, indent);
                const ev = this.freshVar("allErr");
                pre.push(indent + `let ${ev} = __chtAsyncError`);
                errVars.push(ev);
            }
            for (let i = 0; i < errVars.length; i++) {
                pre.push(indent + (i === 0 ? `if len(${errVars[i]}) > 0:` : `elif len(${errVars[i]}) > 0:`));
                pre.push(indent + `    __chtAsyncError = ${errVars[i]}`);
            }
            pre.push(indent + "else:");
            pre.push(indent + `    __chtAsyncError = ""`);
            return "0";
        }
        // `Math.random().toString(36).slice(2, 8)` exact idiom reduction (message-id suffixes, e.g.
        // ChessPage.tsx:1078/1275): the int64 number model has no [0,1) float to give a bare
        // Math.random() (it would collapse to 0 — a fabrication), but THIS full chain is a string
        // suffix whose only semantic contract is session uniqueness. Matched by the exact op-id
        // chain (slice -> toString(36) -> Math.random()), with literal window 2/8 verified — any
        // other Math.random shape keeps failing loudly.
        if (memberName === "slice" && argIds.length === 2 && typeof op.receiver === "string") {
            const toStringOp = this.index.opsById.get(op.receiver);
            const randOp = toStringOp && toStringOp.opKind === "call" && toStringOp.memberName === "toString" && typeof toStringOp.receiver === "string"
                ? this.index.opsById.get(toStringOp.receiver) : undefined;
            const toStringArgs = (toStringOp?.arguments ?? []);
            const radixArgOp = toStringArgs.length === 1 ? this.index.opsById.get(String(toStringArgs[0])) : undefined;
            const radixOk = !!radixArgOp && radixArgOp.opKind === "literal"
                && this.index.dataById.get(String(radixArgOp.data)) === 36;
            const windowOk = argIds.every((id, idx) => {
                const a = this.index.opsById.get(String(id));
                return !!a && a.opKind === "literal" && this.index.dataById.get(String(a.data)) === (idx === 0 ? 2 : 8);
            });
            if (randOp && randOp.opKind === "call" && randOp.memberName === "random" && radixOk && windowOk) {
                const mathRecv = this.index.opsById.get(String(randOp.receiver));
                if (mathRecv && mathRecv.opKind === "identifier" && String(mathRecv.name) === "Math") {
                    this.preludeUsed.add("jsRandomSuffix36");
                    this.preludeUsed.add("jsDateNow");
                    return "jsRandomSuffix36()";
                }
            }
        }
        // Prop-callback navigation dispatch (mechanism 22): a zero-arg call to a component callback
        // prop whose csg.web.scene.component_prop fact pins its exact identity (resolved on the .mjs
        // side — this class only consumes the admitted map). "close-app" lowers to the generated
        // __csg_scene_prop_callback_close_app() helper, which pops the overlay-app nav stack and cuts
        // back to the route the app was opened from (UniMaker closeCurrentApp's source-aware pop —
        // the runtime equivalence proof lives with the helper's generator). Any argument list is
        // rejected loudly: the registered prop callback's real signature here is exactly `() => void`.
        const propCallbackKind = this.propCallbacks.get(callee);
        if (propCallbackKind !== undefined) {
            if (argIds.length !== 0) {
                this.fail(op.id, `prop-callback '${callee}' must be called with zero arguments (the component_prop-registered form), got ${argIds.length}`);
                return "0";
            }
            if (propCallbackKind === "close-app")
                return "__csg_scene_prop_callback_close_app()";
            this.fail(op.id, `prop-callback '${callee}' has unsupported kind '${propCallbackKind}'`);
            return "0";
        }
        // Reducible catch (mechanism 9, cht-voice-dual-state-bridge §4): `<tried>().catch(fn)`. Cheng
        // has no promise-rejection channel — a Cheng-mapped bridge call either runs to completion and
        // returns its own real success/failure value, or compilation fails outright; there is no
        // runtime "reject" path to model. So `.catch(fn)` is honestly reducible to just the tried call
        // IFF `fn` is a statically-provable no-op: zero params, zero let-bindings, and its return
        // expression is a bare literal (no identifier reads, no calls, no side effects). Dropping the
        // wrapper then loses nothing observable. Any other continuation (captures a variable, calls
        // something, multiple params) fails loudly — never silently guessed at or defaulted away.
        if (memberName === "catch" && typeof op.receiver === "string") {
            if (argIds.length !== 1) {
                this.fail(op.id, `unsupported callee '${callee}': .catch() must take exactly one continuation`);
                return "0";
            }
            const arrow = this.resolveArrowReturnExpr(String(argIds[0]));
            const isPureConstant = arrow !== undefined
                && arrow.params.length === 0
                && arrow.bindings.length === 0
                && this.index.opsById.get(arrow.returnOpId)?.opKind === "literal";
            if (!isPureConstant) {
                this.fail(op.id, `unsupported callee '${callee}': .catch() continuation is not a statically-provable pure constant (reducible-catch requires a zero-arg arrow returning a bare literal)`);
                return "0";
            }
            return this.emitExpr(String(op.receiver), pre, indent);
        }
        // Set<string> box-ref methods (mechanism 11): `<setBoxRef>.current.has/add/clear(...)`. The
        // .mjs classifier only ever admits a ref into setBoxRefSlots when EVERY use site anywhere in
        // the component is one of these three exact shapes — so a resolved setBoxRef ref here is
        // guaranteed the right arity by construction; the arity checks below are a second, redundant
        // guard (never expected to actually fire) rather than the enforcement point itself.
        if ((memberName === "has" || memberName === "add" || memberName === "clear") && typeof op.receiver === "string") {
            const receiverOp = this.index.opsById.get(op.receiver);
            const setRn = receiverOp ? this.setBoxRefCurrentName(receiverOp) : undefined;
            if (setRn !== undefined) {
                const slotVar = this.boxRefSlotVar(setRn);
                if (memberName === "has") {
                    if (argIds.length !== 1) {
                        this.fail(op.id, `unsupported callee 'Set.has': expected exactly 1 argument`);
                        return "0";
                    }
                    const needle = this.emitExpr(String(argIds[0]), pre, indent);
                    return `scene.WebSceneJsonStringArrayContains(${slotVar}, ${needle})`;
                }
                if (memberName === "add") {
                    if (argIds.length !== 1) {
                        this.fail(op.id, `unsupported callee 'Set.add': expected exactly 1 argument`);
                        return "0";
                    }
                    const valExpr = this.emitExpr(String(argIds[0]), pre, indent);
                    // Materialize once — the value expression is used twice below (dedup check + push), and
                    // JS evaluates a Set.add() argument exactly once even though the resulting text is
                    // referenced twice here (same precedent as the Math.pow exp=2 squaring above).
                    const val = this.freshVar("setVal");
                    pre.push(`${indent}let ${val} = ${valExpr}`);
                    // JS Set.add is idempotent — dedup-check before pushing so the KV-backed array never
                    // accumulates duplicate entries across repeated dispatches.
                    pre.push(`${indent}if !scene.WebSceneJsonStringArrayContains(${slotVar}, ${val}):`);
                    pre.push(`${indent}    add(${slotVar}, ${val})`);
                    return "0"; // Set.add()'s return value (the Set itself) is unused at every real call site.
                }
                // clear
                if (argIds.length !== 0) {
                    this.fail(op.id, `unsupported callee 'Set.clear': expected 0 arguments`);
                    return "0";
                }
                pre.push(`${indent}setLen(${slotVar}, 0)`);
                return "0";
            }
        }
        // Array box-ref spread-push (mechanism 12): `<arrBoxRef>.current.push(...xs)`. A spread
        // argument lowers via the element-copy loop below. A plain `.push(item)` single non-spread call
        // is a SEPARATE shape (mech17 r1) — the .mjs classifier now admits a ref that uses it elsewhere
        // in the file (queuedVoiceIceCandidatesRef, ChessPage.tsx:847) into arrBoxRefSlots (no longer
        // excluded from the whole family over one such call site), but codegen for THIS specific shape
        // is still deferred (see the fail() message below) — no currently-compiled handler's transitive
        // closure reaches a single-item push call site to construct/verify a per-element struct
        // constructor against (mech17 r1 verdict §4/§5).
        if (memberName === "push" && typeof op.receiver === "string") {
            const receiverOp = this.index.opsById.get(op.receiver);
            const arrRn = receiverOp ? this.arrBoxRefCurrentName(receiverOp) : undefined;
            if (arrRn !== undefined) {
                if (argIds.length !== 1) {
                    this.fail(op.id, `unsupported callee 'Array.push': expected exactly 1 (spread) argument`);
                    return "0";
                }
                const argOp = this.index.opsById.get(String(argIds[0]));
                if (!argOp || argOp.opKind !== "spread") {
                    this.fail(op.id, `unsupported callee 'Array.push' on '${arrRn}': single-item 'push(x)' is a classified mechanism-12 shape but codegen is not yet lowered (mech17 r1) — only spread-append 'push(...xs)' is currently supported`);
                    return "0";
                }
                const slotVar = this.boxRefSlotVar(arrRn);
                const srcExpr = this.emitExpr(String(argOp.value), pre, indent);
                // Materialize once — JS evaluates a spread argument exactly once (same single-evaluation
                // discipline as mechanism 11's Set.add above), even though the text is referenced twice
                // below (loop bound + index read).
                const src = this.freshVar("pushSrc");
                const i = this.freshVar("i");
                pre.push(`${indent}let ${src} = ${srcExpr}`);
                pre.push(`${indent}var ${i} = 0`);
                pre.push(`${indent}while ${i} < ${src}.len:`);
                pre.push(`${indent}    add(${slotVar}, ${src}[int32(${i})])`);
                pre.push(`${indent}    ${i} = ${i} + 1`);
                return "0"; // Array.push()'s return value (new length) is unused at every real call site.
            }
        }
        // Array box-ref drain (mechanism 12, mech17 r1): `<arrBoxRef>.current.splice(0)` — JS
        // `Array.prototype.splice(0)` removes and returns EVERY element starting at index 0 (the real
        // call site, ChessPage.tsx:828 flushQueuedVoiceIceCandidates, always drains the whole queue).
        // Lowers to the SAME element-by-element copy loop as the `[...arrBoxRef.current]` copy-read
        // above (array_literal case) — building an independent snapshot, never an alias of slotVar, for
        // the identical reason documented there (a later push into the cleared-but-same-capacity slot
        // must not retroactively corrupt a snapshot the caller already holds) — followed by clearing the
        // slot in place (`setLen(slotVar, 0)`), matching the property_write clear-reassign codegen below
        // byte-for-byte. Only the exact zero-argument-index, single-argument shape is accepted — the
        // .mjs classifier's isArrDrainCall gate already narrows to this (see its comment), the checks
        // here are the same "guaranteed by construction, redundant second guard" contract as push above.
        if (memberName === "splice" && typeof op.receiver === "string") {
            const receiverOp = this.index.opsById.get(op.receiver);
            const arrRn = receiverOp ? this.arrBoxRefCurrentName(receiverOp) : undefined;
            if (arrRn !== undefined) {
                if (argIds.length !== 1) {
                    this.fail(op.id, `unsupported callee 'Array.splice' on '${arrRn}': only drain-all 'splice(0)' is supported (mechanism 12 whitelist)`);
                    return "0";
                }
                const argOp = this.index.opsById.get(String(argIds[0]));
                const argIsLiteralZero = argOp && argOp.opKind === "literal" && this.index.dataById.get(String(argOp.data)) === 0;
                if (!argIsLiteralZero) {
                    this.fail(op.id, `unsupported callee 'Array.splice' on '${arrRn}': only drain-all 'splice(0)' is supported (mechanism 12 whitelist)`);
                    return "0";
                }
                const elemType = this.arrBoxRefSlots.get(arrRn);
                const slotVar = this.boxRefSlotVar(arrRn);
                const out = this.freshVar("arrDrain");
                const i = this.freshVar("i");
                pre.push(`${indent}var ${out}: ${elemType}[]`);
                pre.push(`${indent}var ${i} = 0`);
                pre.push(`${indent}while ${i} < ${slotVar}.len:`);
                pre.push(`${indent}    add(${out}, ${slotVar}[int32(${i})])`);
                pre.push(`${indent}    ${i} = ${i} + 1`);
                pre.push(`${indent}setLen(${slotVar}, 0)`);
                return out;
            }
        }
        // Functional state updater: `setX(prev => expr)`. Inline the arrow with `prev` bound to the
        // CURRENT state value — a typed input named after the state (the CHT builder supplies state X
        // as a free-var read from the KV). Must run BEFORE the arg loop, which would fail on the arrow.
        if (this.stateSetterNames.has(callee) && argIds.length === 1) {
            const arrow = this.resolveArrowReturnExpr(String(argIds[0]));
            if (arrow && arrow.params.length === 1) {
                const stateName = this.setterStateNames.get(callee) ?? (callee.charAt(3).toLowerCase() + callee.slice(4));
                const st = this.localTypes.get(stateName);
                if (st === undefined) {
                    this.fail(op.id, `functional updater '${callee}' needs state '${stateName}' as a typed input`);
                    return "0";
                }
                const prev = arrow.params[0];
                const renames = new Map([[prev, this.renameOf(stateName)]]);
                const saved = this.localTypes.get(prev);
                this.localTypes.set(prev, st);
                let newVal;
                if (this.emitArrowBindings(arrow, renames, pre, indent)) {
                    this.renameStack.push(renames);
                    try {
                        newVal = this.emitExpr(arrow.returnOpId, pre, indent);
                    }
                    finally {
                        this.renameStack.pop();
                    }
                }
                if (saved === undefined)
                    this.localTypes.delete(prev);
                else
                    this.localTypes.set(prev, saved);
                if (newVal === undefined)
                    return "0";
                return `${this.setterEmitNames.get(callee) ?? callee}(${newVal})`;
            }
        }
        // `libp2pService.isNativePlatform()` (mechanism 6, cht-voice-dual-state-bridge §4/§5):
        // compile-time host selection, NOT a runtime probe. headless is, as a matter of fact, never a
        // native mobile shell — folding to the literal `false` here is an honest constant for this
        // generation target, not a fabricated bridge; it routes the call into the SAME "non-native"
        // branch the original source already has for that case. Device targets fold to `true` (their
        // own generation pass), so the produced artifact carries a single path with zero runtime
        // `if (isNativePlatform)`-style probing.
        if (callee === "libp2pService.isNativePlatform" && argIds.length === 0) {
            return "false";
        }
        // `Object.values(x)` (cht-voice-dual-state-bridge §8 risk registry): Cheng has no Record/Map
        // value type, so this is only ever reachable on an operand whose Cheng-side type is ALREADY an
        // array (e.g. the `realtimeSessionStore.getSnapshot()` bridge deliberately types `callSessions`
        // as `[]RealtimeCallSession`, not a keyed record — the key (`sessionId`) is redundant with a
        // field already carried on each value). On such an operand `Object.values` is a true identity:
        // no key information is discarded because none was ever present in the Cheng-side value. Any
        // other operand type is a real modeling gap, not silently coerced — fail loud.
        // `realtimeSessionStore.finalizeCallSession(sessionId, options?)` (mechanism 6, §3.1): the
        // options argument is always an inline object literal at the real call sites (never a variable
        // holding a pre-built options value) — destructure it directly by property name into 3 flat
        // scalar args for the bridge, rather than relying on the generic object-literal struct
        // synthesis (whose struct name is a content hash of the TS literal's inferred type, not
        // predictable ahead of time in CHT_BRIDGE_IMPLS). Any field name other than the 3 real ones on
        // `RealtimeCallSession['status'|'lastAction'|'updatedAt']`-typed options fails loudly. Omitted
        // fields fall back to realtimeSessionStore.ts:736-738's REAL `??` defaults verbatim
        // (`status ?? 'ended'`, `lastAction ?? 'end'`, `updatedAt ?? Date.now()`) — not placeholder
        // empty strings / zero, which would silently diverge from the TS semantics.
        if (callee === "realtimeSessionStore.finalizeCallSession" && argIds.length >= 1 && argIds.length <= 2) {
            const sessionIdExpr = this.emitExpr(String(argIds[0]), pre, indent);
            let statusExpr = '"ended"';
            let lastActionExpr = '"end"';
            let updatedAtExpr;
            if (argIds.length === 2) {
                const optionsOp = this.index.opsById.get(String(argIds[1]));
                if (!optionsOp || optionsOp.opKind !== "object_literal") {
                    this.fail(op.id, `unsupported callee '${callee}': options argument must be an inline object literal`);
                    return "0";
                }
                const props = optionsOp.properties ?? [];
                for (const prop of props) {
                    const v = this.emitExpr(prop.value, pre, indent);
                    if (prop.name === "status")
                        statusExpr = v;
                    else if (prop.name === "lastAction")
                        lastActionExpr = v;
                    else if (prop.name === "updatedAt")
                        updatedAtExpr = v;
                    else {
                        this.fail(op.id, `unsupported callee '${callee}': options field '${prop.name}' not modeled`);
                        return "0";
                    }
                }
            }
            if (updatedAtExpr === undefined) {
                this.preludeUsed.add("jsDateNow");
                updatedAtExpr = "jsDateNow()";
            }
            return `chengRtFinalizeCallSession(${sessionIdExpr}, ${statusExpr}, ${lastActionExpr}, ${updatedAtExpr})`;
        }
        // Record/JsonValue normalize family (envelope-construction family): normalizeJsonRecord /
        // normalizeJsonValue / asRecord are all Record-shapedness normalizers. With a STRUCT
        // argument the value already IS a record in Cheng's value semantics — the JS deep-copy
        // normalize is value-equivalent to the identity (every field is already a JsonValue-shaped
        // Cheng value, and a struct is trivially a non-null, non-array object, so the record check
        // always passes). With a json.JsonNode argument, normalizeJsonRecord's contract is the
        // JObject check (anything else throws expected_json_record — surfaced through the
        // synchronous-collapse error channel), while normalizeJsonValue/asRecord are identity /
        // empty-object respectively. Any other argument type falls through to the honest body
        // compilation.
        if ((callee === "normalizeJsonRecord" || callee === "normalizeJsonValue" || callee === "asRecord") && argIds.length === 1) {
            const argT = this.exprType(String(argIds[0]));
            if (argT !== undefined && this.index.typeDeclByName.has(argT))
                return this.emitExpr(String(argIds[0]), pre, indent);
            if (argT === "json.JsonNode") {
                if (callee === "normalizeJsonRecord") {
                    const v = this.emitExpr(String(argIds[0]), pre, indent);
                    const out = this.freshVar("njr");
                    this.preludeUsed.add("chtAsyncError");
                    pre.push(`${indent}var ${out}: json.JsonNode = json.NewJObject()`);
                    pre.push(`${indent}if ${v}.kind == json.JObject:`);
                    pre.push(`${indent}    ${out} = ${v}`);
                    pre.push(`${indent}else:`);
                    pre.push(`${indent}    __chtAsyncError = "expected_json_record"`);
                    return out;
                }
                if (callee === "asRecord") {
                    const v = this.emitExpr(String(argIds[0]), pre, indent);
                    const out = this.freshVar("asr");
                    pre.push(`${indent}var ${out}: json.JsonNode = json.NewJObject()`);
                    pre.push(`${indent}if ${v}.kind == json.JObject:`);
                    pre.push(`${indent}    ${out} = ${v}`);
                    return out;
                }
                return this.emitExpr(String(argIds[0]), pre, indent);
            }
        }
        // sendManagedSocialDm's payload argument: the bridge takes json.JsonNode, but on this chain
        // the payload is a synthesized STRUCT (buildRealtimeSignalPayload's annotated-literal
        // output). Encode it through the deterministic struct->json helper (__chtJsonOf_<T>) and
        // REGISTER the request so the .mjs side emits that helper via chtBuildJsonHelpers (same
        // codec family as every state-slot round trip — never a hand-rolled per-call encoder).
        if (callee === "sendManagedSocialDm" && argIds.length === 4) {
            const payloadT = this.exprType(String(argIds[2]));
            if (payloadT !== undefined && this.index.typeDeclByName.has(payloadT)) {
                this.jsonStructEncoderRequests.add(payloadT);
                const encArg0 = this.emitExpr(String(argIds[0]), pre, indent);
                const encArg1 = this.emitExpr(String(argIds[1]), pre, indent);
                const encArg2 = this.emitExpr(String(argIds[2]), pre, indent);
                const encArg3 = this.emitExpr(String(argIds[3]), pre, indent);
                return `chtBridgeSendManagedSocialDm(${encArg0}, ${encArg1}, ${this.jsonStructEncoderName(payloadT)}(${encArg2}), ${encArg3})`;
            }
        }
        // normalizeCallSignalForTransport(value) — headless str-only contract (mechanism-9/10
        // dual-state bridge): on the compiled chain the signal argument is ALWAYS absent-or-string
        // (handleVoiceAction's createCall literal carries no signal field, so the optional-absent
        // read yields ""). For a str argument the JS behavior is EXACTLY the identity:
        // isRecord(str) === false, so the function takes `typeof value === 'string' ? value :
        // undefined` and returns the string unchanged ("" for the absent case, matching JS
        // undefined). An SDP-object argument is NOT this shape — it falls through to the honest
        // body compilation (the canonicalizeSdp machinery is its own campaign).
        if (callee === "normalizeCallSignalForTransport" && argIds.length === 1) {
            const argT = this.exprType(String(argIds[0]));
            if (argT === "str")
                return `chtBridgeNormalizeCallSignalForTransport(${this.emitExpr(String(argIds[0]), pre, indent)})`;
        }
        // realtimeSessionStore.applyEnvelope({direction, peerId, conversationId, envelope,
        // peerName}) — the context argument is always an inline object literal at the real call
        // sites (applyOutgoingEnvelope, verified). Flattened to the dual-state bridge scalar +
        // envelope-subfield args (mechanism-9/10 dual-state bridge; the impl writes the REAL
        // store effect into the roomState/roomVoiceSessions KV slots). sessionId exists only on
        // call-kind envelopes — chess envelopes pass "" (the chess branch never reads it).
        // bid/cardIds/state exist only on RealtimeDoudizhuSignalEnvelope: type-level absent
        // becomes int64(-1) / "" / "" (never a fabricated [] or {} — those would impersonate
        // a playable bid/play/sync). Present fields pass the real value; arrays/objects go
        // through the same chtBuildJsonHelpers codec as every other JSON slot.
        if (callee === "realtimeSessionStore.applyEnvelope" && argIds.length === 1) {
            const optionsOp = this.index.opsById.get(String(argIds[0]));
            if (!optionsOp || optionsOp.opKind !== "object_literal") {
                this.fail(op.id, `unsupported callee '${callee}': context argument must be an inline object literal`);
                return "0";
            }
            const props = optionsOp.properties ?? [];
            let directionExpr;
            let peerIdExpr;
            let conversationExpr;
            let envelopeExpr;
            let envelopeType;
            let peerNameExpr;
            for (const prop of props) {
                if (prop.name === "direction")
                    directionExpr = this.emitExpr(prop.value, pre, indent);
                else if (prop.name === "peerId")
                    peerIdExpr = this.emitExpr(prop.value, pre, indent);
                else if (prop.name === "conversationId")
                    conversationExpr = this.emitExpr(prop.value, pre, indent);
                else if (prop.name === "peerName")
                    peerNameExpr = this.emitExpr(prop.value, pre, indent);
                else if (prop.name === "envelope") {
                    envelopeExpr = this.emitExpr(prop.value, pre, indent);
                    envelopeType = this.exprType(prop.value);
                }
                else {
                    this.fail(op.id, `unsupported callee '${callee}': context field '${prop.name}' not modeled`);
                    return "0";
                }
            }
            if (directionExpr === undefined || peerIdExpr === undefined || conversationExpr === undefined || envelopeExpr === undefined || envelopeType === undefined || !this.index.typeDeclByName.has(envelopeType)) {
                this.fail(op.id, `unsupported callee '${callee}': context is missing direction/peerId/conversationId or a concretely-typed envelope`);
                return "0";
            }
            const envelopeField = (field) => this.typeDeclFieldOf(envelopeType, field);
            const sub = (field) => envelopeField(field) !== undefined ? `(${envelopeExpr}).${sanitizeFieldName(field)}` : (field === "timestampMs" ? "int64(0)" : `""`);
            const bidMember = envelopeField("bid");
            const bidArg = bidMember !== undefined ? `(${envelopeExpr}).${sanitizeFieldName("bid")}` : "int64(-1)";
            let cardIdsArg = `""`;
            const cardIdsMember = envelopeField("cardIds");
            if (cardIdsMember !== undefined) {
                const mapped = this.types.map(cardIdsMember.type);
                if (mapped.type === undefined || !mapped.type.endsWith("[]")) {
                    this.fail(op.id, `unsupported callee '${callee}': envelope.cardIds type '${cardIdsMember.type}' is not a concrete array`);
                    return "0";
                }
                this.jsonStructEncoderRequests.add(mapped.type);
                cardIdsArg = `json.JsonStringify(${this.jsonArrayEncoderName(mapped.type)}((${envelopeExpr}).${sanitizeFieldName("cardIds")}))`;
            }
            let stateArg = `""`;
            const stateMember = envelopeField("state");
            if (stateMember !== undefined) {
                const mapped = this.types.map(stateMember.type);
                if (mapped.type === undefined || !this.index.typeDeclByName.has(mapped.type)) {
                    this.fail(op.id, `unsupported callee '${callee}': envelope.state type '${stateMember.type}' is not a concrete struct`);
                    return "0";
                }
                this.jsonStructEncoderRequests.add(mapped.type);
                stateArg = `json.JsonStringify(${this.jsonStructEncoderName(mapped.type)}((${envelopeExpr}).${sanitizeFieldName("state")}))`;
            }
            const peerNameArg = peerNameExpr ?? `""`;
            return `chengRtApplyEnvelope(${directionExpr}, ${conversationExpr}, ${peerIdExpr}, ${peerNameArg}, ${sub("kind")}, ${sub("action")}, ${sub("sessionId")}, ${sub("roomId")}, ${sub("messageId")}, ${sub("timestampMs")}, ${bidArg}, ${cardIdsArg}, ${stateArg})`;
        }
        // realtimeSessionStore.subscribe(listener) — Cheng has no JS closure listener table.
        // The production effect is "room KV changed, re-read": mark the scene dirty so the
        // next rebind re-reads getSnapshot / roomState. The listener argument is a placeholder
        // (DouDiZhuPage `subscribe(refresh)` where refresh(snapshot) reads getSnapshot) — it is
        // NOT compiled or invoked. applyEnvelope already writes roomState + markDirty; subscribe
        // still dirties once at the call site (mount) so the first frame getSnapshot matches.
        // Unknown arity hard-fails; never silently drop the call. Unsubscribe is not modeled
        // (void; handler narrowAnyReturnToVoid keeps the dirty side effect and drops the value).
        if (callee === "realtimeSessionStore.subscribe") {
            if (argIds.length !== 1) {
                this.fail(op.id, `unsupported callee '${callee}': expected exactly 1 listener argument, got ${argIds.length}`);
                return "0";
            }
            if (!this.index.opsById.has(String(argIds[0]))) {
                this.fail(op.id, `unsupported callee '${callee}': listener argument is missing`);
                return "0";
            }
            return "chengRtSubscribe()";
        }
        // prepareUiDirectRoute(bridge, {peerId, connect, timeoutMs}) — the options argument is
        // always an inline object literal at the real call sites (never a variable), flattened to
        // the dual-state bridge's 3 scalar args in source order, mirroring the
        // realtimeSessionStore.finalizeCallSession destructure below exactly (mechanism-9/10
        // dual-state bridge; headless contract = honest no-device false, see CHT_HOST_BRIDGES).
        // The bridge object itself (libp2pService host global) carries no value at this seam.
        if (callee === "prepareUiDirectRoute" && argIds.length === 2) {
            const optionsOp = this.index.opsById.get(String(argIds[1]));
            if (!optionsOp || optionsOp.opKind !== "object_literal") {
                this.fail(op.id, `unsupported callee '${callee}': options argument must be an inline object literal`);
                return "0";
            }
            let peerIdExpr;
            let connectExpr = "false";
            let timeoutExpr = "int64(0)";
            const props = optionsOp.properties ?? [];
            for (const prop of props) {
                const v = this.emitExpr(prop.value, pre, indent);
                if (prop.name === "peerId")
                    peerIdExpr = v;
                else if (prop.name === "connect")
                    connectExpr = v;
                else if (prop.name === "timeoutMs")
                    timeoutExpr = v;
                else {
                    this.fail(op.id, `unsupported callee '${callee}': options field '${prop.name}' not modeled`);
                    return "0";
                }
            }
            if (peerIdExpr === undefined) {
                this.fail(op.id, `unsupported callee '${callee}': options.peerId is required`);
                return "0";
            }
            return `chtBridgePrepareUiDirectRoute(${peerIdExpr}, ${connectExpr}, ${timeoutExpr})`;
        }
        if (callee === "Object.values" && argIds.length === 1) {
            const argOpId = String(argIds[0]);
            const argType = this.exprType(argOpId);
            if (argType === undefined || !argType.endsWith("[]")) {
                this.fail(op.id, `Object.values() operand type '${argType ?? "?"}' is not an already-array-shaped bridge value (no Record support)`);
                return "0";
            }
            return this.emitExpr(argOpId, pre, indent);
        }
        // `getNodeRemark(peerId, remarks)` (app/utils/nodeRemarks.ts): 2nd arg is
        // Record<string,string> (no Cheng Record support yet — same documented M2.5 gap
        // as content.extra tags, see searchableContentTags). Only the peerId arg is a
        // supported type, so it alone is evaluated; the extern-backed replacement narrows
        // the remark-text search domain to empty until Record support lands.
        if (callee === "getNodeRemark" && argIds.length === 2) {
            const peerIdExpr = this.emitExpr(String(argIds[0]), pre, indent);
            return `getNodeRemarkTag(${peerIdExpr})`;
        }
        if (callee === "Math.floor") {
            const argOp = this.index.opsById.get(String(argIds[0] ?? ""));
            if (argOp && argOp.opKind === "binary" && String(argOp.operator) === "SlashToken") {
                this.preludeUsed.add("jsFloorDiv");
                const numer = this.emitExpr(String(argOp.left), pre, indent);
                const denom = this.emitExpr(String(argOp.right), pre, indent);
                return `jsFloorDiv(${numer}, ${denom})`;
            }
            return this.emitExpr(String(argIds[0] ?? ""), pre, indent);
        }
        // String/array member methods.
        if (memberName.length > 0 && typeof op.receiver === "string") {
            const recvType = this.exprType(op.receiver);
            if (recvType === "str") {
                const recv = this.emitExpr(op.receiver, pre, indent);
                if (memberName === "includes") {
                    const needle = this.emitExpr(String(argIds[0]), pre, indent);
                    return `strings.StrContains(${recv}, ${needle})`;
                }
                if (memberName === "toLowerCase") {
                    this.preludeUsed.add("jsStrToLower");
                    return `jsStrToLower(${recv})`;
                }
                if (memberName === "trim") {
                    this.preludeUsed.add("jsStrTrim");
                    // JS trim() never mutates or consumes the receiver; jsStrTrim may return a
                    // slice of its owned argument, so clone here to keep the caller\'s string usable.
                    return `jsStrTrim(strings.CloneStr(${recv}))`;
                }
                if (memberName === "startsWith") {
                    const needle = this.emitExpr(String(argIds[0]), pre, indent);
                    return `strings.HasPrefix(${recv}, ${needle})`;
                }
                if (memberName === "endsWith") {
                    const needle = this.emitExpr(String(argIds[0]), pre, indent);
                    return `strings.HasSuffix(${recv}, ${needle})`;
                }
                if (memberName === "slice" && argIds.length <= 2) {
                    const start = argIds.length > 0 ? this.emitExpr(String(argIds[0]), pre, indent) : "int64(0)";
                    if (argIds.length === 2) {
                        const end = this.emitExpr(String(argIds[1]), pre, indent);
                        return `strings.SliceBytes(strings.CloneStr(${recv}), int32(${start}), int32(${end}) - int32(${start}))`;
                    }
                    return `strings.SliceBytes(strings.CloneStr(${recv}), int32(${start}), len(${recv}) - int32(${start}))`;
                }
            }
            if (recvType !== undefined && recvType.endsWith("[]")) {
                const elemType = recvType.slice(0, -2);
                if (memberName === "filter" || memberName === "map" || memberName === "sort" || memberName === "includes" || memberName === "slice" || memberName === "findIndex" || memberName === "find") {
                    return this.emitArrayMethod(op, memberName, recvType, elemType, argIds, pre, indent);
                }
                if (memberName === "push") {
                    // `arr.push(x)` mutates the receiver in place (Cheng `add`). The receiver MUST be an
                    // assignable array variable, not a copy — emit `add(recv, x)` against the receiver expr
                    // directly. Returns the new length (JS semantics), which a statement-context ignores.
                    const recv = this.emitExpr(String(op.receiver), pre, indent);
                    for (const aid of argIds) {
                        const v = this.emitExpr(aid, pre, indent);
                        pre.push(`${indent}add(${recv}, ${v})`);
                    }
                    return `int64(${recv}.len)`;
                }
            }
        }
        if (callee === "Math.pow") {
            const expOp = this.index.opsById.get(String(argIds[1] ?? ""));
            const expVal = expOp && expOp.opKind === "literal" ? this.index.dataById.get(String(expOp.data)) : undefined;
            if (expVal === 0.5) {
                this.preludeUsed.add("jsIntSqrt");
                return `jsIntSqrt(${this.emitExpr(String(argIds[0]), pre, indent)})`;
            }
            if (expVal === 2) {
                const b = this.emitExpr(String(argIds[0]), pre, indent);
                const tmp = this.freshVar("sq");
                pre.push(`${indent}let ${tmp} = ${b}`);
                return `(${tmp} * ${tmp})`;
            }
            this.fail(op.id, `Math.pow exponent must be 0.5 or 2 (integer model)`);
            return "0";
        }
        if (callee === "Date.now") {
            this.preludeUsed.add("jsDateNow");
            return "jsDateNow()";
        }
        const receiverOp = typeof op.receiver === "string" ? this.index.opsById.get(op.receiver) : undefined;
        if (memberName === "getFullYear" &&
            receiverOp?.opKind === "new" &&
            String(receiverOp.constructor ?? "") === "Date" &&
            (receiverOp.arguments ?? []).length === 0) {
            this.preludeUsed.add("jsDateNow");
            return "jsDateGetFullYearNow()";
        }
        if ((memberName === "play" || memberName === "pause") && typeof op.receiver === "string" && this.exprType(op.receiver) === "int64") {
            const recv = this.emitExpr(op.receiver, pre, indent);
            return memberName === "play" ? `chengVideoPlaySlot(${recv})` : `chengVideoPauseSlot(${recv})`;
        }
        const args = argIds.map((a) => this.emitExpr(a, pre, indent));
        switch (callee) {
            case "Math.max":
                this.preludeUsed.add("jsMathMax");
                return `jsMathMax(${args.join(", ")})`;
            case "Math.min":
                this.preludeUsed.add("jsMathMin");
                return `jsMathMin(${args.join(", ")})`;
            case "Math.abs":
                this.preludeUsed.add("jsMathAbs");
                return `jsMathAbs(${args[0]})`;
            case "Number.isFinite":
                return "true";
            case "Math.trunc":
            case "Math.round":
                // int64 semantics: inputs are already integers
                return args[0] ?? "int64(0)";
            case "Number": {
                const t = this.exprType(String(argIds[0] ?? ""));
                if (t === "int64")
                    return args[0];
                if (t === "str") {
                    this.preludeUsed.add("jsStrToInt");
                    return `jsStrToInt(${args[0]})`;
                }
                if (t === "bool") {
                    const tmp = this.freshVar("numb");
                    pre.push(`${indent}var ${tmp} = int64(0)`);
                    pre.push(`${indent}if ${args[0]}:`);
                    pre.push(`${indent}    ${tmp} = int64(1)`);
                    return tmp;
                }
                this.fail(op.id, `Number() on unsupported type '${t}'`);
                return "int64(0)";
            }
            case "String":
                this.preludeUsed.add("jsNumToStr");
                return `jsNumToStr(${args[0]})`;
            default: {
                // useState setter → resolves to the emitStateSlots-generated `fn setX(value)` in the
                // same unit. Emit verbatim (single value arg). This is the CHT state-write path. A
                // literal `null` actual zero-fills by the SLOT'S OWN type (see setterTypes above) —
                // `setRemoteVoiceStream(null)` (MediaStream handle, int64) must pass int64(0), not "".
                if (this.stateSetterNames.has(callee)) {
                    const slotType = this.setterTypes.get(callee);
                    const nullZeroOf = (t) => t === "int64" ? "int64(0)" : t === "bool" ? "false" : t === "json.JsonNode" ? "json.NewJObject()" : (t !== undefined && t.endsWith("[]") ? "[]" : undefined);
                    const fixed = argIds.map((a, i) => {
                        const argOp = this.index.opsById.get(String(a));
                        if (argOp && argOp.opKind === "literal" && this.index.dataById.get(String(argOp.data)) === null) {
                            const z = nullZeroOf(slotType);
                            if (z !== undefined)
                                return z;
                            if (slotType !== undefined && this.index.typeDeclByName.has(slotType)) {
                                const zv = this.freshVar("nullz");
                                pre.push(`${indent}var ${zv}: ${slotType}`);
                                return zv;
                            }
                        }
                        return args[i];
                    });
                    return `${this.setterEmitNames.get(callee) ?? callee}(${fixed.join(", ")})`;
                }
                // extern implementations keep their original signature: no mangling
                if (this.externNames.has(callee) && this.index.functionByName.has(callee)) {
                    return `${callee}(${args.join(", ")})`;
                }
                // host-capability bridge: a platform I/O call mapped to a real @importc Cheng function.
                // Checked BEFORE the local functionByName lookup below (mechanism 13,
                // cht-voice-dual-state-bridge §3.3): a hostBridges entry keyed on a BARE name (e.g.
                // `stopStreamTracks`, unlike every pre-mechanism-13 entry's dotted member path such as
                // `videoRef.current.play`) intentionally SHADOWS a same-named local helper whose own TS
                // body is host-managed (opaque MediaStream track enumeration), not in the transpiled
                // subset — the bridge redirect must win so that helper's real body is never attempted.
                // Safe for every pre-existing dotted-path entry: a dotted string can never collide with a
                // functionByName key (those only ever hold bare identifiers), so this reorder is a no-op
                // for all call sites that were already resolving via functionByName.
                const bridgeShadow = this.hostBridges.get(callee);
                if (bridgeShadow !== undefined) {
                    return `${bridgeShadow}(${args.join(", ")})`;
                }
                // Prop-callee alias: a member call on a context/props placeholder (`u.onItemFocus(...)`)
                // or a context-callback bare callee (`u(...)`) resolved by the CHT's mount/context index
                // to the exact function id — never the first-match global for minified names.
                {
                    const recvOp = typeof op.receiver === "string" ? this.index.opsById.get(op.receiver) : undefined;
                    const isBareCallee = memberName.length === 0 && (op.receiver === undefined || (recvOp !== undefined && recvOp.opKind === "identifier" && String(recvOp.name) === callee));
                    const bareAliasFid = isBareCallee ? this.propCalleeAliases.get(callee) : undefined;
                    const aliasFid = bareAliasFid ?? (() => {
                        if (memberName.length === 0 || !recvOp || recvOp.opKind !== "identifier")
                            return undefined;
                        return this.propCalleeAliases.get(`${String(recvOp.name)}.${memberName}`);
                    })();
                    if (aliasFid !== undefined) {
                        const aliasTarget = this.index.functionById.get(aliasFid);
                        if (aliasTarget !== undefined) {
                            const aliasName = `chtPropCallee_${aliasFid.slice(0, 12)}`;
                            if (!this.index.functionByName.has(aliasName))
                                this.index.functionByName.set(aliasName, aliasTarget);
                            return `${aliasName}(${args.join(", ")})`;
                        }
                    }
                }
                const target = this.index.functionByName.get(callee);
                if (target) {
                    // S2 alias-fv slice: a component-closure alias callee (registered through
                    // applyFunctionAliases) receives the current scope's injected free-var actuals
                    // BEFORE its explicit arguments — matching the param order
                    // transpileWithInjectedParams emits for the alias's own compilation (freeVarTypes
                    // first, explicit params after). renameOf resolves any active shadow-rename, exactly
                    // like compileBlockArrowHelper's free-var actual list. Module-level functions are
                    // never touched (they take no closure free vars).
                    const aliasPrefix = this.index.aliasNames.has(callee)
                        ? this.injectedFvNames.map((n) => this.renameOf(n))
                        : [];
                    const params = target.parameters ?? [];
                    if (params.length === 0) {
                        const inlined = this.resolveZeroArgLocalReturnExpr(String(target.id ?? ""));
                        if (inlined !== undefined)
                            return this.emitExpr(inlined.returnOpId, pre, indent);
                    }
                    const overrides = new Map();
                    let mangle = "";
                    for (let pi = 0; pi < params.length; pi++) {
                        const src = String(params[pi]?.typeSource ?? "").trim();
                        // Union-alias single instantiation (mechanism-union slice): a parameter annotated
                        // with a type ALIAS whose target is a union of named structs (RealtimeEnvelope =
                        // RealtimeDmMessageEnvelope | ... | RealtimeChessSignalEnvelope) has no Cheng
                        // union representation — but at a call site the argument's concrete type IS one
                        // member, so the callee compiles as a concrete-type instance, exactly like the
                        // generic monomorphization below. Membership is VERIFIED against the alias target's
                        // own member list (exact identity, never "any argument accepted"): an argument
                        // whose type is not a declared member fails loudly. A second call site with a
                        // DIFFERENT member type mangles its own instance (same mangling rule as generics),
                        // so multi-member use never collides.
                        const isGenericParam = src === "unknown" || src === "any" || /^[A-Z]$/.test(src);
                        let unionMembers;
                        if (!isGenericParam && src.length > 0 && this.types.map(src).type === undefined) {
                            // Only when the annotation itself does NOT map (union of named structs — a string-
                            // literal union like VoiceCallState already maps to str through the generic union
                            // branch and must keep that path, never be instance-mangled).
                            const aliasDecl = this.index.typeDeclByName.get(src);
                            const aliasTarget = String(aliasDecl?.aliasTarget ?? "");
                            if (aliasDecl !== undefined && aliasTarget.length > 0 && aliasTarget.includes("|")) {
                                unionMembers = splitTopLevelUnion(aliasTarget).map((m) => stripImportPrefixes(m).trim()).filter((m) => m.length > 0);
                            }
                        }
                        // Generalized call-site instantiation (mechanism-union slice, envelope-construction
                        // family): an annotation that does NOT map and carries a union/intersection/inline-
                        // object shape ('|' or '{' or '&' in the text — e.g. buildRealtimeSignalPayload's
                        // inline `{ conversationId: string; envelope: RealtimeEnvelope; ... }`, or
                        // normalizeCallSignalForTransport's anonymous `object | string | undefined`)
                        // instantiates with the argument's concrete type, exactly like the alias-union and
                        // generic cases above. Anonymous-union members are verified through a PRIMITIVE-NAME
                        // MAPPING (string->str, number->int64, boolean->bool, object->any struct/JsonNode,
                        // Record<string,..>->json.JsonNode, literal->str, undefined/null->no value type) —
                        // never a free pass: an argument matching NO member fails loudly.
                        const anonymousUnionMembers = (unionMembers === undefined && !isGenericParam && src.includes("|") && this.types.map(src).type === undefined)
                            ? splitTopLevelUnion(src).map((m) => m.trim()).filter((m) => m.length > 0)
                            : undefined;
                        const inlineHasUnmappableField = src.includes("{")
                            && ((parseInlineObjectTypeMembers(src) ?? []).some((m) => this.types.map(m.type).type === undefined));
                        const generalizable = !isGenericParam && unionMembers === undefined && anonymousUnionMembers === undefined
                            && src.length > 0 && (this.types.map(src).type === undefined || inlineHasUnmappableField)
                            && (src.includes("|") || src.includes("{") || src.includes("&"));
                        const memberAccepts = (members, argT) => members.some((m) => {
                            const mt = stripImportPrefixes(m).trim();
                            if (mt === "string")
                                return argT === "str";
                            if (mt === "number")
                                return argT === "int64";
                            if (mt === "boolean")
                                return argT === "bool";
                            if (mt === "object")
                                return this.index.typeDeclByName.has(argT) || argT === "json.JsonNode";
                            if (mt === "undefined" || mt === "null")
                                return false;
                            if (/^Record\s*</.test(mt))
                                return argT === "json.JsonNode" || this.index.typeDeclByName.has(argT);
                            if (/^['\"]/.test(mt))
                                return argT === "str";
                            return argT === mt;
                        });
                        if (isGenericParam || unionMembers !== undefined || anonymousUnionMembers !== undefined || generalizable) {
                            const argT = pi < argIds.length ? this.exprType(argIds[pi]) : undefined;
                            if (argT === undefined) {
                                this.fail(op.id, `cannot monomorphize '${callee}' param ${pi}: argument type unknown`);
                                return "0";
                            }
                            if (unionMembers !== undefined && !unionMembers.includes(argT)) {
                                this.fail(op.id, `union-argument type '${argT}' is not a declared member of alias '${src}' (${unionMembers.join(" | ")}) — never instantiated from a non-member`);
                                return "0";
                            }
                            if (anonymousUnionMembers !== undefined && !memberAccepts(anonymousUnionMembers, argT)) {
                                this.fail(op.id, `argument type '${argT}' matches no member of anonymous union '${src}' — never instantiated from a non-member`);
                                return "0";
                            }
                            overrides.set(pi, argT);
                            mangle += `_${argT.replace(/\[\]/g, "Arr")}`;
                        }
                    }
                    // Audited default-parameter actuals (CHT_DEFAULT_PARAM_VALUES): fill ONLY optional
                    // trailing parameters that have a registered audited default; every other arity
                    // mismatch fails loudly (never zero-padded).
                    if (argIds.length < params.length) {
                        for (let pi = argIds.length; pi < params.length; pi++) {
                            const mp = params[pi];
                            const mpName = String(mp.name ?? "");
                            const mpOptional = mp.optional === true;
                            const dv = mpOptional ? CHT_DEFAULT_PARAM_VALUES.get(`${callee}.${mpName}`) : undefined;
                            if (!mpOptional || dv === undefined) {
                                this.fail(op.id, `call to '${callee}' is missing ${mpOptional ? "an audited default for optional" : "required"} parameter '${mpName}' (CHT_DEFAULT_PARAM_VALUES has no entry — never zero-padded)`);
                                return "0";
                            }
                            if (dv === "jsDateNow()")
                                this.preludeUsed.add("jsDateNow");
                            args.push(dv);
                        }
                    }
                    if (overrides.size > 0) {
                        const mangled = `${callee}__${mangle.slice(1)}`;
                        this.monomorphRequests.push({ name: callee, mangled, overrides });
                        return `${mangled}(${[...aliasPrefix, ...args].join(", ")})`;
                    }
                    return `${callee}(${[...aliasPrefix, ...args].join(", ")})`;
                }
                this.fail(op.id, `unsupported callee '${callee}'`);
                return "0";
            }
        }
    }
    // Multi-statement block-bodied array-method arrow arguments (guard-clause early
    // returns interleaved with local const/let bindings, e.g.
    // `.filter((x) => { if (a) return false; const q = ...; return expr; })`) aren't
    // inlinable as a single expression by resolveArrowReturnExpr — compile the arrow's
    // body as a standalone named helper function instead, reusing the exact same
    // transpileWithInjectedParams machinery transpileClosure already uses for the outer
    // closure (a `return` inside a REAL function only exits that function, which is
    // exactly guard-clause semantics — unlike inlining the statements into the caller's
    // loop, where a literal `return` would wrongly abort the whole array walk). The
    // helper's free vars are the subset of the enclosing closure's own free vars actually
    // referenced in the arrow body (never the full outer scope, so no unused-param
    // helpers are synthesized). Returns a call-expression builder for a given element
    // var, or undefined (after recording the real diagnostic) if the arrow isn't a
    // function value or its body fails to transpile for any other reason — never a
    // silent fallback.
    compileBlockArrowHelper(op, argOpId, elemType) {
        const argOp = this.index.opsById.get(argOpId);
        if (!argOp || argOp.opKind !== "function_value")
            return undefined;
        const targetFn = String(argOp.targetFunction ?? "");
        const target = this.index.functionById.get(targetFn);
        if (!target)
            return undefined;
        const params = target.parameters ?? [];
        const elemParamName = params[0]?.name;
        if (!elemParamName)
            return undefined;
        const bodyOps = [...this.index.opsByBlock.values()].flat().filter((o) => o.function === targetFn);
        const usedNames = new Set(bodyOps.filter((o) => o.opKind === "identifier").map((o) => String(o.name)));
        const freeVarNames = [...this.localTypes.keys()].filter((n) => usedNames.has(n) && n !== elemParamName);
        const freeVarTypes = new Map(freeVarNames.map((n) => [n, this.localTypes.get(n)]));
        const paramTypes = new Map([[elemParamName, elemType]]);
        const helperName = this.freshVar("filterPred");
        const helper = new ChengFunctionTranspiler(this.index, this.types, this.externNames, this.stateSetterNames, this.hostBridges, this.hostObjects, this.boxRefSlots, this.objBoxRefSlots, this.setBoxRefSlots, this.recvDoneSendBridges);
        helper.narrowAnyReturnToVoid = this.narrowAnyReturnToVoid;
        helper.setterEmitNames = this.setterEmitNames;
        helper.setterStateNames = this.setterStateNames;
        helper.boxRefGlobalNames = this.boxRefGlobalNames;
        helper.preferredEventParamType = this.preferredEventParamType;
        const res = helper.transpileWithInjectedParams(targetFn, helperName, freeVarTypes, paramTypes);
        if (!res.ok) {
            const reason = res.diagnostics[0]?.reason ?? "block-bodied arrow not transpilable";
            this.fail(op.id, `array .filter block-bodied arrow: ${reason}`);
            return undefined;
        }
        this.auxiliaryFunctions.push(res.code);
        for (const p of res.preludeUsed)
            this.preludeUsed.add(p);
        for (const req of helper.monomorphRequests)
            this.monomorphRequests.push(req);
        const argExprs = freeVarNames.map((n) => this.renameOf(n));
        return (itVar) => `${helperName}(${[...argExprs, itVar].join(", ")})`;
    }
    // Array higher-order methods inline to loops hoisted before the statement.
    emitArrayMethod(op, method, recvType, elemType, argIds, pre, indent) {
        const recvExpr = this.emitExpr(String(op.receiver), pre, indent);
        const recvVar = this.freshVar("src");
        pre.push(`${indent}let ${recvVar} = ${recvExpr}`);
        if (method === "includes") {
            const needle = this.emitExpr(String(argIds[0]), pre, indent);
            const found = this.freshVar("found");
            const i = this.freshVar("i");
            pre.push(`${indent}var ${found} = false`);
            pre.push(`${indent}var ${i} = 0`);
            pre.push(`${indent}while ${i} < ${recvVar}.len:`);
            pre.push(`${indent}    if ${recvVar}[${i}] == ${needle}:`);
            pre.push(`${indent}        ${found} = true`);
            pre.push(`${indent}    ${i} = ${i} + 1`);
            return found;
        }
        if (method === "slice") {
            // `arr.slice(start, end)` → push-copy of indices [start, end). Cold-backend SCALAR-array
            // indexed writes are miscompiled, but `add` (push) works for both scalar and struct arrays,
            // so the copy is push-based. end defaults to arr.len; negative indices are NOT in the recorded
            // integer subset (the census uses only non-negative literal/derived bounds) — fail otherwise is
            // unnecessary since callers pass `index`/`index+8` style non-negative bounds.
            const out = this.freshVar("sliced");
            const i = this.freshVar("i");
            const startExpr = argIds.length > 0 ? this.emitExpr(String(argIds[0]), pre, indent) : "int64(0)";
            const start = this.freshVar("start");
            pre.push(`${indent}var ${start} = ${startExpr}`);
            const end = this.freshVar("end");
            if (argIds.length >= 2) {
                const endExpr = this.emitExpr(String(argIds[1]), pre, indent);
                pre.push(`${indent}var ${end} = ${endExpr}`);
                // clamp end to length (JS slice tolerates end > length)
                pre.push(`${indent}if ${end} > int64(${recvVar}.len):`);
                pre.push(`${indent}    ${end} = int64(${recvVar}.len)`);
            }
            else {
                pre.push(`${indent}var ${end} = int64(${recvVar}.len)`);
            }
            pre.push(`${indent}var ${out}: ${recvType}`);
            pre.push(`${indent}var ${i} = ${start}`);
            pre.push(`${indent}while ${i} < ${end}:`);
            pre.push(`${indent}    add(${out}, ${recvVar}[int32(${i})])`);
            pre.push(`${indent}    ${i} = ${i} + 1`);
            return out;
        }
        const arrow = this.resolveArrowReturnExpr(String(argIds[0] ?? ""));
        if (arrow === undefined) {
            if (method === "filter") {
                const before = this.diagnostics.length;
                const helperCall = this.compileBlockArrowHelper(op, String(argIds[0] ?? ""), elemType);
                if (helperCall !== undefined) {
                    const out = this.freshVar("filtered");
                    const i = this.freshVar("i");
                    const it = this.freshVar("it");
                    pre.push(`${indent}var ${out}: ${recvType}`);
                    pre.push(`${indent}var ${i} = 0`);
                    pre.push(`${indent}while ${i} < ${recvVar}.len:`);
                    pre.push(`${indent}    let ${it} = ${recvVar}[${i}]`);
                    pre.push(`${indent}    if ${helperCall(it)}:`);
                    pre.push(`${indent}        add(${out}, ${it})`);
                    pre.push(`${indent}    ${i} = ${i} + 1`);
                    return out;
                }
                if (this.diagnostics.length > before)
                    return "0"; // real reason already recorded
            }
            this.fail(op.id, `array .${method} requires a single-expression arrow argument`);
            return "0";
        }
        if (method === "filter") {
            if (arrow.params.length < 1) {
                this.fail(op.id, ".filter arrow must take one parameter");
                return "0";
            }
            const out = this.freshVar("filtered");
            const i = this.freshVar("i");
            const it = this.freshVar("it");
            pre.push(`${indent}var ${out}: ${recvType}`);
            pre.push(`${indent}var ${i} = 0`);
            pre.push(`${indent}while ${i} < ${recvVar}.len:`);
            pre.push(`${indent}    let ${it} = ${recvVar}[${i}]`);
            const innerPre = [];
            const cond = this.inlineArrowCondition(arrow, new Map([[arrow.params[0], it]]), new Map([[arrow.params[0], elemType]]), innerPre, indent + "    ");
            if (cond === undefined) {
                this.fail(op.id, `.filter arrow body not inlinable`);
                return "0";
            }
            pre.push(...innerPre);
            pre.push(`${indent}    if ${cond}:`);
            pre.push(`${indent}        add(${out}, ${it})`);
            pre.push(`${indent}    ${i} = ${i} + 1`);
            return out;
        }
        if (method === "findIndex") {
            if (arrow.params.length < 1) {
                this.fail(op.id, ".findIndex arrow must take one parameter");
                return "0";
            }
            const out = this.freshVar("foundIndex");
            const i = this.freshVar("i");
            const it = this.freshVar("it");
            const done = this.freshVar("found");
            pre.push(`${indent}var ${out} = int64(-1)`);
            pre.push(`${indent}var ${done} = false`);
            pre.push(`${indent}var ${i} = 0`);
            pre.push(`${indent}while ${i} < ${recvVar}.len && !${done}:`);
            pre.push(`${indent}    let ${it} = ${recvVar}[${i}]`);
            const innerPre = [];
            const cond = this.inlineArrowCondition(arrow, new Map([[arrow.params[0], it]]), new Map([[arrow.params[0], elemType]]), innerPre, indent + "    ");
            if (cond === undefined) {
                this.fail(op.id, ".findIndex arrow body not inlinable");
                return "0";
            }
            pre.push(...innerPre);
            pre.push(`${indent}    if ${cond}:`);
            pre.push(`${indent}        ${out} = ${i}`);
            pre.push(`${indent}        ${done} = true`);
            pre.push(`${indent}    ${i} = ${i} + 1`);
            return out;
        }
        if (method === "find") {
            // Same scan as `.findIndex`, producing an index (foundIdx, -1 on miss), then materializes
            // the element at that index. Miss -> zero-value elemType, mirroring the existing "present
            // boolean + zero-value payload" convention objBoxRef/mechanism-8 already use for a not-found
            // struct. That convention is only sound when the caller can actually tell "not found" apart
            // from "found a real element that happens to equal the zero value" — true for a registered-
            // presence-field struct (STRUCT_PRESENCE_FIELDS: e.g. sessionId is never "" on a real hit),
            // false in general (a primitive array CAN legitimately contain its own zero value, e.g. 0 in
            // number[], "" in string[]; an unregistered struct has no audited non-zero field either).
            // Narrow to the audited case; anything else is rejected loudly rather than emitting a result
            // callers cannot reliably discriminate — use `.findIndex` (a real not-found sentinel, -1)
            // instead.
            if (!STRUCT_PRESENCE_FIELDS.has(elemType)) {
                this.fail(op.id, `.find() on element type '${elemType}' has no discriminable "not found" result (no registered presence field in STRUCT_PRESENCE_FIELDS) — use .findIndex instead`);
                return "0";
            }
            if (arrow.params.length < 1) {
                this.fail(op.id, ".find arrow must take one parameter");
                return "0";
            }
            const foundIdx = this.freshVar("foundIndex");
            const i = this.freshVar("i");
            const it = this.freshVar("it");
            const done = this.freshVar("found");
            pre.push(`${indent}var ${foundIdx} = int64(-1)`);
            pre.push(`${indent}var ${done} = false`);
            pre.push(`${indent}var ${i} = 0`);
            pre.push(`${indent}while ${i} < ${recvVar}.len && !${done}:`);
            pre.push(`${indent}    let ${it} = ${recvVar}[${i}]`);
            const innerPre = [];
            const cond = this.inlineArrowCondition(arrow, new Map([[arrow.params[0], it]]), new Map([[arrow.params[0], elemType]]), innerPre, indent + "    ");
            if (cond === undefined) {
                this.fail(op.id, ".find arrow body not inlinable");
                return "0";
            }
            pre.push(...innerPre);
            pre.push(`${indent}    if ${cond}:`);
            pre.push(`${indent}        ${foundIdx} = ${i}`);
            pre.push(`${indent}        ${done} = true`);
            pre.push(`${indent}    ${i} = ${i} + 1`);
            const out = this.freshVar("foundItem");
            pre.push(`${indent}var ${out}: ${elemType}`);
            pre.push(`${indent}if ${foundIdx} >= int64(0):`);
            pre.push(`${indent}    ${out} = ${recvVar}[int32(${foundIdx})]`);
            return out;
        }
        if (method === "map") {
            if (arrow.params.length < 1) {
                this.fail(op.id, ".map arrow must take one parameter");
                return "0";
            }
            const mappedElemType = this.exprTypeWithBinding(arrow, elemType);
            if (mappedElemType === undefined) {
                this.fail(op.id, ".map result element type not inferable");
                return "0";
            }
            const out = this.freshVar("mapped");
            const i = this.freshVar("i");
            const it = this.freshVar("it");
            pre.push(`${indent}var ${out}: ${mappedElemType}[]`);
            pre.push(`${indent}var ${i} = 0`);
            pre.push(`${indent}while ${i} < ${recvVar}.len:`);
            pre.push(`${indent}    let ${it} = ${recvVar}[${i}]`);
            const innerPre = [];
            const value = this.inlineArrowExpr(arrow, new Map([[arrow.params[0], it]]), new Map([[arrow.params[0], elemType]]), innerPre, indent + "    ");
            if (value === undefined) {
                this.fail(op.id, ".map arrow body not inlinable");
                return "0";
            }
            pre.push(...innerPre);
            pre.push(`${indent}    add(${out}, ${value})`);
            pre.push(`${indent}    ${i} = ${i} + 1`);
            return out;
        }
        // sort: copy + insertion sort with the inlined comparator (cmp < 0 keeps order).
        if (arrow.params.length < 2) {
            this.fail(op.id, ".sort arrow must take two parameters");
            return "0";
        }
        const out = this.freshVar("sorted");
        const i = this.freshVar("i");
        const j = this.freshVar("j");
        const key = this.freshVar("key");
        pre.push(`${indent}var ${out}: ${recvType}`);
        pre.push(`${indent}var ${i} = 0`);
        pre.push(`${indent}while ${i} < ${recvVar}.len:`);
        pre.push(`${indent}    add(${out}, ${recvVar}[${i}])`);
        pre.push(`${indent}    ${i} = ${i} + 1`);
        pre.push(`${indent}${i} = 1`);
        const moving = this.freshVar("moving");
        pre.push(`${indent}while ${i} < ${out}.len:`);
        pre.push(`${indent}    let ${key} = ${out}[${i}]`);
        pre.push(`${indent}    var ${j} = ${i} - 1`);
        pre.push(`${indent}    var ${moving} = true`);
        pre.push(`${indent}    while ${j} >= 0 && ${moving}:`);
        const innerPre = [];
        const cmp = this.inlineArrowExpr(arrow, new Map([[arrow.params[0], `${out}[${j}]`], [arrow.params[1], key]]), new Map([[arrow.params[0], elemType], [arrow.params[1], elemType]]), innerPre, indent + "        ");
        if (cmp === undefined) {
            this.fail(op.id, ".sort comparator body not inlinable");
            return "0";
        }
        pre.push(...innerPre);
        pre.push(`${indent}        if ${cmp} > int64(0):`);
        pre.push(`${indent}            ${out}[${j} + 1] = ${out}[${j}]`);
        pre.push(`${indent}            ${j} = ${j} - 1`);
        pre.push(`${indent}        else:`);
        pre.push(`${indent}            ${moving} = false`);
        pre.push(`${indent}    ${out}[${j} + 1] = ${key}`);
        pre.push(`${indent}    ${i} = ${i} + 1`);
        return out;
    }
    inlineArrowCondition(arrow, bindings, elemTypes, pre, indent) {
        const saved = new Map();
        for (const [param] of bindings)
            saved.set(param, this.localTypes.get(param));
        for (const [param, _v] of bindings)
            this.localTypes.set(param, elemTypes.get(param));
        const renames = new Map();
        for (const [param, loopVar] of bindings)
            renames.set(param, loopVar);
        const before = this.diagnostics.length;
        let cond = "";
        if (!this.emitArrowBindings(arrow, renames, pre, indent)) {
            cond = "";
        }
        else {
            this.renameStack.push(renames);
            try {
                cond = this.emitCondition(arrow.returnOpId, pre, indent);
            }
            finally {
                this.renameStack.pop();
            }
        }
        for (const [param, prev] of saved) {
            if (prev === undefined)
                this.localTypes.delete(param);
            else
                this.localTypes.set(param, prev);
        }
        if (this.diagnostics.length > before)
            return undefined;
        return cond;
    }
    exprTypeWithBinding(arrow, elemType) {
        const param = arrow.params[0];
        const saved = this.localTypes.get(param);
        this.localTypes.set(param, elemType);
        const t = this.exprType(arrow.returnOpId);
        if (saved === undefined)
            this.localTypes.delete(param);
        else
            this.localTypes.set(param, saved);
        return t;
    }
}
// Map a handler parameter's TS type annotation to its Cheng type via the real type
// system (e.g. a string-literal union like PublishCategory → "str"), so the CHT can
// decide honestly whether a single-param handler is round-trippable from a node prop
// string. Returns undefined for un-mappable / non-scalar types (never fabricates).
export function mapParamType(facts, typeSource, baseIndex) {
    const index = baseIndex ?? new TranspilerFactIndex(facts);
    return new TypeMapper(index).map(String(typeSource)).type;
}
export function transpileClosure(facts, closureFunctionId, emitName, freeVarTypes, externImpls, stateSetterNames, paramTypes, hostBridges, hostObjects, boxRefSlots, objBoxRefSlots, setBoxRefSlots, deferredFrameKind, recvDoneFrameKind, recvDoneSendBridges, localFunctionAliases, baseIndex, arrBoxRefSlots, structBoxRefSlots, handleTeardownBridges, refStateMirrors, propCallbacks, setterTypes, narrowAnyReturnToVoid, setterEmitNames, setterStateNames, boxRefGlobalNames, propCalleeAliases) {
    const index = baseIndex === undefined
        ? new TranspilerFactIndex(facts, localFunctionAliases)
        : new TranspilerFactIndex(facts, localFunctionAliases, baseIndex);
    const types = new TypeMapper(index);
    const externNames = new Set(externImpls ? [...externImpls.keys()] : []);
    const setterNames = stateSetterNames ?? new Set();
    const bridges = hostBridges ?? new Map();
    const hostObjs = hostObjects ?? new Set();
    const boxRefs = boxRefSlots ?? new Map();
    const objBoxRefs = objBoxRefSlots ?? new Map();
    const setBoxRefs = setBoxRefSlots ?? new Map();
    const recvDoneBridges = recvDoneSendBridges ?? new Map();
    const arrBoxRefs = arrBoxRefSlots ?? new Map();
    const structBoxRefs = structBoxRefSlots ?? new Map();
    const handleTeardowns = handleTeardownBridges ?? new Map();
    const transpiler = new ChengFunctionTranspiler(index, types, externNames, setterNames, bridges, hostObjs, boxRefs, objBoxRefs, setBoxRefs, recvDoneBridges, arrBoxRefs, structBoxRefs, handleTeardowns, refStateMirrors, propCallbacks, setterTypes);
    if (narrowAnyReturnToVoid === true)
        transpiler.narrowAnyReturnToVoid = true;
    if (setterEmitNames !== undefined)
        transpiler.setterEmitNames = setterEmitNames;
    if (setterStateNames !== undefined)
        transpiler.setterStateNames = setterStateNames;
    if (boxRefGlobalNames !== undefined)
        transpiler.boxRefGlobalNames = boxRefGlobalNames;
    if (propCalleeAliases !== undefined)
        transpiler.propCalleeAliases = propCalleeAliases;
    if (paramTypes !== undefined && [...paramTypes.values()].includes("ChtEvent"))
        transpiler.preferredEventParamType = "ChtEvent";
    if (deferredFrameKind !== undefined)
        transpiler.deferredFrameKind = deferredFrameKind;
    if (recvDoneFrameKind !== undefined)
        transpiler.recvDoneFrameKind = recvDoneFrameKind;
    const result = transpiler.transpileWithInjectedParams(closureFunctionId, emitName, freeVarTypes, paramTypes);
    const results = [result];
    // Struct->json encoder requests collected across the outer transpiler AND every queued helper
    // instance (each emits into its own set — merged here for the .mjs codec pass).
    const jsonStructEncoders = new Set();
    const prelude = new Set(result.preludeUsed);
    const bodies = result.ok ? [result.code, ...transpiler.auxiliaryFunctions] : [];
    // dependency closure over named helpers
    const queue = [];
    const seen = new Set();
    const pendingMonomorphs = [];
    if (result.ok) {
        for (const req of transpiler.monomorphRequests) {
            if (!seen.has(req.mangled)) {
                seen.add(req.mangled);
                pendingMonomorphs.push(req);
            }
        }
        const calleeRe = /\b([A-Za-z_$][A-Za-z0-9_$]*)\(/g;
        let m;
        // scan the outer closure body AND any block-arrow helper functions it spawned
        // (compileBlockArrowHelper) — a call inside a helper (e.g. a Record-shimming
        // extern) is otherwise invisible to this dependency closure.
        const resultText = [result.code, ...transpiler.auxiliaryFunctions].join("\n");
        while ((m = calleeRe.exec(resultText)) !== null) {
            if (!seen.has(m[1]) && (index.functionByName.has(m[1]) || externImpls?.has(m[1]))) {
                seen.add(m[1]);
                queue.push(m[1]);
            }
        }
    }
    const workQueue = [...pendingMonomorphs.map((r) => ({ name: r.name, emitName: r.mangled, overrides: r.overrides })), ...queue.map((name) => ({ name }))];
    while (workQueue.length > 0) {
        const item = workQueue.shift();
        // explicit Cheng implementations take precedence (FFI boundary: platform
        // containers / host capabilities not yet in the transpiled subset)
        const extern = externImpls?.get(item.name);
        if (extern !== undefined && item.emitName === undefined) {
            bodies.push(extern);
            results.push({ ok: true, name: item.name, code: extern, preludeUsed: new Set(), structsUsed: new Set(), diagnostics: [] });
            continue;
        }
        const fn = index.functionByName.get(item.name);
        // Mechanism 15: queued local helper functions (e.g. releaseVoiceRuntime, compiled here as its
        // own Cheng function) need handleTeardownBridges too — the alias-teardown idiom lives INSIDE
        // such a helper's own body, not the outer closure's.
        const t = new ChengFunctionTranspiler(index, types, externNames, setterNames, bridges, hostObjs, boxRefs, objBoxRefs, setBoxRefs, undefined, arrBoxRefs, structBoxRefs, handleTeardowns, refStateMirrors, propCallbacks, setterTypes);
        t.narrowAnyReturnToVoid = transpiler.narrowAnyReturnToVoid;
        t.setterEmitNames = transpiler.setterEmitNames;
        t.setterStateNames = transpiler.setterStateNames;
        t.boxRefGlobalNames = transpiler.boxRefGlobalNames;
        t.preferredEventParamType = transpiler.preferredEventParamType;
        // S2 alias-fv slice: component-closure alias targets are compiled with the SAME injected
        // free-var params as the outer closure (their bodies read the enclosing component's free
        // vars — previously every one of those reads was an unresolved-identifier failure). The
        // matching call-site actuals are added in emitCall (aliasPrefix). Module-level functions
        // keep the plain transpile path (no closure free vars exist for them). Monomorph overrides
        // only ever occur on module-level generic helpers today; an alias target that would need
        // them fails its parameter annotation honestly, never silently un-injected.
        const res = localFunctionAliases !== undefined && localFunctionAliases.has(item.name)
            ? t.transpileWithInjectedParams(String(fn.id), item.emitName ?? item.name, freeVarTypes, undefined, item.overrides)
            : t.transpile(String(fn.id), item.emitName, item.overrides);
        for (const et of t.jsonStructEncoderRequests)
            jsonStructEncoders.add(et);
        results.push(res);
        if (res.ok) {
            bodies.push(res.code);
            for (const pl of res.preludeUsed)
                prelude.add(pl);
            for (const req of t.monomorphRequests) {
                if (!seen.has(req.mangled)) {
                    seen.add(req.mangled);
                    workQueue.push({ name: req.name, emitName: req.mangled, overrides: req.overrides });
                }
            }
            const calleeRe = /\b([A-Za-z_$][A-Za-z0-9_$]*)\(/g;
            let m;
            while ((m = calleeRe.exec(res.code)) !== null) {
                if (!seen.has(m[1]) && (index.functionByName.has(m[1]) || externImpls?.has(m[1]))) {
                    seen.add(m[1]);
                    workQueue.push({ name: m[1] });
                }
            }
        }
    }
    // Deferred-effect resume function: if the handler lowered a `window.setTimeout(...)`, emit its
    // captured callback body as `<emitName>__resume()` (the pump runs it at the wall-clock deadline).
    let deferred;
    if (result.ok && deferredFrameKind !== undefined && transpiler.deferredResumeCallbackFid !== undefined) {
        const resumeFnName = `${emitName}__resume`;
        const bodyLines = transpiler.emitDeferredResumeBody(transpiler.deferredResumeCallbackFid);
        if (bodyLines === undefined) {
            results.push({ ok: false, name: resumeFnName, code: "", preludeUsed: new Set(), structsUsed: new Set(), diagnostics: [{ functionId: transpiler.deferredResumeCallbackFid, functionName: resumeFnName, opId: "", reason: "deferred resume body not transpilable" }] });
        }
        else {
            const body = bodyLines.length > 0 ? bodyLines : ["    return"];
            bodies.push([`fn ${resumeFnName}(): void =`, ...body].join("\n"));
            deferred = { kind: deferredFrameKind, resumeFnName, ms: transpiler.deferredMs };
        }
    }
    // async await-split resume function: if the handler lowered an async-IIFE await, emit the
    // inner fn's post-await body as `<emitName>__resume()` (run by the pump once the real recv-done
    // signal arrives). The handler body itself became seg0 (issue send + arm frame + suspend).
    let recvDone;
    if (result.ok && recvDoneFrameKind !== undefined && transpiler.recvDoneResumeCallbackFid !== undefined) {
        const resumeFnName = `${emitName}__resume`;
        const bodyLines = transpiler.emitAsyncResumeBody(transpiler.recvDoneResumeCallbackFid);
        if (bodyLines === undefined) {
            results.push({ ok: false, name: resumeFnName, code: "", preludeUsed: new Set(), structsUsed: new Set(), diagnostics: [{ functionId: transpiler.recvDoneResumeCallbackFid, functionName: resumeFnName, opId: "", reason: "async resume body not transpilable" }] });
        }
        else {
            const body = bodyLines.length > 0 ? bodyLines : ["    return"];
            bodies.push([`fn ${resumeFnName}(): void =`, ...body].join("\n"));
            recvDone = { kind: recvDoneFrameKind, resumeFnName };
        }
    }
    const structs = types.emitStructs();
    const preludeCode = [...prelude].sort().map((n) => PRELUDE_SOURCES.get(n) ?? "").filter((x) => x.length > 0);
    const sections = ["import std/strings as strings", "import std/rawbytes as rawbytes", "import std/json as json", ""];
    if (structs.code.length > 0)
        sections.push(structs.code, "");
    sections.push(...preludeCode, "", ...bodies);
    for (const et of transpiler.jsonStructEncoderRequests)
        jsonStructEncoders.add(et);
    const base = { code: sections.join("\n\n"), results, structDiagnostics: structs.diagnostics, jsonStructEncoders: [...jsonStructEncoders] };
    if (deferred !== undefined)
        base.deferred = deferred;
    if (recvDone !== undefined)
        base.recvDone = recvDone;
    return base;
}
export function emitStateSlots(facts, componentFunctionId, prefix, wanted, baseIndex) {
    const index = baseIndex ?? new TranspilerFactIndex(facts);
    const types = new TypeMapper(index);
    const diagnostics = [];
    const slots = [];
    // wanted-name driven: useState may live in split component bodies / hooks,
    // so scan all functions when names are given; componentFunctionId is the
    // fallback scope for wanted=[] (all states of one component).
    const ops = wanted.length > 0
        ? [...index.opsById.values()]
        : [...index.opsById.values()].filter((op) => op.function === componentFunctionId);
    const extracts = ops.filter((op) => op.opKind === "binding_extract");
    const seenStates = new Set();
    // mech16 r4 fix (mech16_r3v_a_m16r3b_verdict.md — REFUTED, real defect): a `wanted`-driven scan
    // (used by the project-wide `stateType` map, see scene-runtime-smoke-source.mjs
    // buildCompiledHandlerTable) walks EVERY component's ops with no cross-component scope boundary —
    // the exact same disease family already fixed for refDeclaredNullableType/refDeclaredArrayElemType
    // (mech16 r3, registerDeclaredRefType): two different components' useState declarations sharing a
    // bare name but a DIFFERENT tuple-head type let the first-scanned declaration silently win a
    // wrong-but-legal Cheng type for every consumer — worse than a skip, a real type-confusion hazard
    // (compiles clean, misreads a live value's bit pattern under the wrong type at runtime). Fixed the
    // same way as the ref family: on a conflicting SECOND mappable type for a name already accepted,
    // mark it ambiguous, DELETE its already-pushed slot, and never resolve it again — every consumer's
    // lookup (the `stateType` map / the `slots` array used for codegen) misses exactly as if the state
    // had never been declared, falling through to its own pre-existing honest fv-unknown/unclassified
    // path. A name whose repeated declarations all agree on the SAME type (the established same-name-
    // same-type sharing precedent already regression-tested for the useRef family, e.g. ChatPage/
    // ChessPage `iceConfigRef`) is untouched — dedup behavior for that case is unchanged.
    const acceptedStateType = new Map(); // stateName -> accepted chengType
    const ambiguousStates = new Set(); // stateName -> saw 2+ conflicting declared types, permanently excluded
    for (const call of ops.filter((op) => op.opKind === "call" && /(?:^|\.)useState$/.test(String(op.callee || op.calleeText || "")))) {
        const valueExtract = extracts.find((e) => e.source === call.id && Array.isArray(e.path) && e.path[0]?.index === 0);
        const setterExtract = extracts.find((e) => e.source === call.id && Array.isArray(e.path) && e.path[0]?.index === 1);
        if (!valueExtract || !setterExtract)
            continue;
        const stateName = String(valueExtract.name);
        if (wanted.length > 0 && !wanted.includes(stateName))
            continue;
        if (ambiguousStates.has(stateName))
            continue; // already known ambiguous — stays excluded, no-op.
        // returnType: "[T, React.Dispatch<...>]" — take the tuple head
        const rt = String(call.returnType ?? "");
        const tupleHead = rt.startsWith("[") ? splitTopLevelUnion(rt.slice(1, rt.lastIndexOf(","))).join("|") : "";
        const mapped = types.map(tupleHead);
        if (seenStates.has(stateName)) {
            // A prior declaration already claimed this name. Only a prior declaration that itself mapped
            // to a real Cheng type (recorded in acceptedStateType) can conflict; if the prior declaration's
            // own type was unmappable, this preserves the pre-existing "first declaration permanently
            // claims the name" behavior untouched (no slot either way).
            const priorType = acceptedStateType.get(stateName);
            if (priorType !== undefined && mapped.type !== undefined && mapped.type !== priorType) {
                ambiguousStates.add(stateName);
                acceptedStateType.delete(stateName);
                const idx = slots.findIndex((s) => s.stateName === stateName);
                if (idx !== -1)
                    slots.splice(idx, 1);
                diagnostics.push(`state '${stateName}': ambiguous — conflicting declared types (${priorType} vs ${mapped.type}) across useState declarations, slot excluded`);
            }
            continue;
        }
        seenStates.add(stateName);
        let mappedType = mapped.type;
        const argId = call.arguments?.[0];
        const argOp = argId ? index.opsById.get(argId) : undefined;
        if (mappedType === undefined) {
            // Minified-bundle fallback (no type annotations survive the pipeline, e.g. `Dm.useState`
            // with an any-typed namespace): infer the state type from the INITIAL VALUE literal —
            // `useState(false)` -> bool, `useState(0)` -> int64, `useState("")` -> str. Non-literal
            // initials keep the honest unmappable-type skip (no guessing from identifier shapes).
            if (argOp && argOp.opKind === "literal") {
                const lv = index.dataById.get(String(argOp.data));
                if (typeof lv === "boolean")
                    mappedType = "bool";
                else if (typeof lv === "number" && Number.isInteger(lv))
                    mappedType = "int64";
                else if (typeof lv === "string")
                    mappedType = "str";
            }
            else if (argOp && argOp.opKind === "unary" && String(argOp.operator) === "ExclamationToken") {
                const operand = index.opsById.get(String(argOp.operand));
                if (operand && operand.opKind === "literal" && typeof index.dataById.get(String(operand.data)) === "number")
                    mappedType = "bool";
            }
            else if (argOp && argOp.opKind === "array_literal") {
                // useState([]) — an any[] initial: a JSON-array complex-JSON slot. Routed through the
                // existing json.JsonNode slot codec (driver CHT_SLOT_TYPES, chtSlotLoadLine/StoreLine) —
                // no new driver machinery, chtParseJsonNode auto-emitted via needsJsonNode.
                mappedType = "json.JsonNode";
            }
            else if (argOp && argOp.opKind === "object_literal" && (argOp.properties ?? []).length === 0 && (argOp.elements ?? []).length === 0) {
                // useState({}) — an empty-object initial: a JSON-object complex-JSON slot.
                mappedType = "json.JsonNode";
            }
            if (mappedType === undefined) {
                diagnostics.push(`state '${stateName}': ${mapped.reason}`);
                continue;
            }
        }
        acceptedStateType.set(stateName, mappedType);
        // initial value from the useState argument literal
        let initialExpr = types.zeroValueOf(mappedType);
        if (argOp && argOp.opKind === "literal") {
            const v = index.dataById.get(String(argOp.data));
            if (typeof v === "string")
                initialExpr = JSON.stringify(v);
            else if (typeof v === "number" && Number.isInteger(v))
                initialExpr = `int64(${v})`;
            else if (typeof v === "boolean")
                initialExpr = v ? "true" : "false";
        }
        else if (argOp && argOp.opKind === "unary" && String(argOp.operator) === "ExclamationToken") {
            const operand = index.opsById.get(String(argOp.operand));
            const num = operand && operand.opKind === "literal" ? index.dataById.get(String(operand.data)) : undefined;
            if (typeof num === "number")
                initialExpr = num === 0 ? "true" : "false";
        }
        else if (argOp && argOp.opKind === "array_literal") {
            // useState([]) — JSON-array complex-JSON slot initial value.
            initialExpr = "json.NewJArray()";
        }
        else if (argOp && argOp.opKind === "object_literal" && (argOp.properties ?? []).length === 0 && (argOp.elements ?? []).length === 0) {
            // useState({}) — JSON-object complex-JSON slot initial value.
            initialExpr = "json.NewJObject()";
        }
        const slotVar = `__${prefix}_${stateName}`;
        slots.push({ stateName, setterName: String(setterExtract.name), chengType: mappedType, slotVar, initialExpr });
    }
    const lines = [`var __${prefix}_dirty: bool`];
    for (const slot of slots) {
        lines.push(`var ${slot.slotVar}: ${slot.chengType}`);
    }
    lines.push("");
    lines.push(`fn ${prefix}StateInit() =`);
    lines.push(`    __${prefix}_dirty = true`);
    for (const slot of slots) {
        if (slot.initialExpr.length > 0)
            lines.push(`    ${slot.slotVar} = ${slot.initialExpr}`);
    }
    lines.push("");
    for (const slot of slots) {
        lines.push(`fn ${slot.setterName}(value: ${slot.chengType}) =`);
        if (slot.chengType === "str" || slot.chengType === "bool" || slot.chengType === "int64") {
            lines.push(`    if ${slot.slotVar} != value:`);
            lines.push(`        ${slot.slotVar} = value`);
            lines.push(`        __${prefix}_dirty = true`);
        }
        else {
            lines.push(`    ${slot.slotVar} = value`);
            lines.push(`    __${prefix}_dirty = true`);
        }
        lines.push("");
    }
    lines.push(`fn ${prefix}TakeDirty(): bool =`);
    lines.push(`    if __${prefix}_dirty:`);
    lines.push(`        __${prefix}_dirty = false`);
    lines.push(`        return true`);
    lines.push(`    return false`);
    return { code: lines.join("\n"), slots, diagnostics };
}
export function transpileFunctions(facts, functionNames) {
    const index = new TranspilerFactIndex(facts);
    const types = new TypeMapper(index);
    const results = [];
    const prelude = new Set();
    const bodies = [];
    const queue = functionNames.map((name) => ({ name }));
    const seen = new Set(functionNames);
    while (queue.length > 0) {
        const item = queue.shift();
        const fn = index.functionByName.get(item.name);
        if (!fn) {
            results.push({ ok: false, name: item.name, code: "", preludeUsed: new Set(), structsUsed: new Set(), diagnostics: [{ functionId: "", functionName: item.name, opId: "", reason: "function not found by name" }] });
            continue;
        }
        const transpiler = new ChengFunctionTranspiler(index, types);
        const result = transpiler.transpile(String(fn.id), item.emitName, item.overrides);
        results.push(result);
        if (result.ok) {
            // A block-bodied array-method arrow (compileBlockArrowHelper) compiles to a
            // standalone named helper pushed onto `transpiler.auxiliaryFunctions`, not
            // inlined into `result.code` — it must be emitted alongside the body it's
            // called from, or the call site references an undefined function (mirrors
            // transpileClosure's handling of the same helper mechanism above).
            bodies.push(result.code, ...transpiler.auxiliaryFunctions);
            for (const p of result.preludeUsed)
                prelude.add(p);
            for (const req of transpiler.monomorphRequests) {
                if (!seen.has(req.mangled)) {
                    seen.add(req.mangled);
                    queue.push({ name: req.name, emitName: req.mangled, overrides: req.overrides });
                }
            }
            const calleeRe = /\b([A-Za-z_$][A-Za-z0-9_$]*)\(/g;
            let m;
            const resultText = [result.code, ...transpiler.auxiliaryFunctions].join("\n");
            while ((m = calleeRe.exec(resultText)) !== null) {
                const callee = m[1];
                if (!seen.has(callee) && index.functionByName.has(callee)) {
                    seen.add(callee);
                    queue.push({ name: callee });
                }
            }
        }
    }
    const structs = types.emitStructs();
    const preludeCode = [...prelude].sort().map((name) => PRELUDE_SOURCES.get(name) ?? "").filter((s) => s.length > 0);
    const sections = ["import std/strings as strings", "import std/rawbytes as rawbytes", "import std/json as json", ""];
    if (structs.code.length > 0)
        sections.push(structs.code, "");
    sections.push(...preludeCode, "", ...bodies);
    return { code: sections.join("\n\n"), results, structDiagnostics: structs.diagnostics };
}
