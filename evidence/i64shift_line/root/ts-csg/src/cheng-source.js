import { emitCsgCoreFromTs } from "./csg-core.js";
import { isChengSourceArrayAtCall, isChengSourceArrayConcatCall, isChengSourceArrayFilterCall, isChengSourceArrayFindCall, isChengSourceArrayFromCall, isChengSourceArrayFindIndexCall, isChengSourceArrayFillCall, isChengSourceArrayIncludesCall, isChengSourceArrayIndexOfCall, isChengSourceArrayJoinCall, isChengSourceArrayMapCall, isChengSourceArrayPredicateCall, isChengSourceArrayPopCall, isChengSourceArrayPushCall, isChengSourceArrayReduceCall, isChengSourceArrayReverseCall, isChengSourceArrayShiftCall, isChengSourceArraySliceCall, isChengSourceArraySortCall, isChengSourceArrayUnshiftCall, isChengSourceArrayTypePredicateCall, isChengSourceBooleanCall, isChengSourceConsoleCall, isChengSourceDateCall, isChengSourceI32MathCall, isChengSourceProcessCall, isChengSourceTimerCall, isChengSourceI32NumberPredicateCall, isChengSourceNumberConvertCall, isChengSourceObjectAssignCall, isChengSourceObjectFreezeCall, isChengSourceObjectIsFrozenCall, isChengSourceObjectKeyEntryCall, isChengSourceObjectValuesCall, isChengSourceSupportedExternalSymbol, isChengSourceSupportedRuntimeRequirement, isChengSourceStringConvertCall, isChengSourceStringLiteralCall, isChengSourceStringSplitCall, } from "./runtime-providers.js";
const chengKeywords = new Set([
    "as",
    "async",
    "block",
    "break",
    "case",
    "const",
    "continue",
    "defer",
    "elif",
    "else",
    "enum",
    "false",
    "fn",
    "for",
    "if",
    "import",
    "iterator",
    "let",
    // "match" is NOT a Cheng reserved word; removed to allow it as identifier
    "module",
    "nil",
    "return",
    "true",
    "type",
    "var",
    "when",
    "while",
    "yield",
]);
export function emitChengSourceFromTs(options) {
    const core = emitCsgCoreFromTs({ ...options, runtime: options.runtime ?? ["node", "browser"] });
    if (core.diagnostics.length > 0) {
        return { diagnostics: core.diagnostics, unsupported: [], text: "", functionCount: 0 };
    }
    const openRuntimeRequirements = core.report.runtimeRequirements.filter((item) => !isChengSourceSupportedRuntimeRequirement(item));
    const openExternalSymbols = core.report.externalSymbols.filter((item) => !isChengSourceSupportedExternalSymbol(item));
    const coreUnsupported = [
        ...core.report.unsupported.map((item) => `${item.code}: ${item.message}`),
        ...openRuntimeRequirements.map((item) => `runtime requirement ${item.runtime}:${item.kind}:${item.name}`),
        ...openExternalSymbols.map((item) => `external symbol ${item.runtime}:${item.name}`),
    ];
    if (core.facts.length <= 0) {
        return { diagnostics: [], unsupported: coreUnsupported, text: "", functionCount: 0 };
    }
    const lowered = lowerCsgCoreToChengSource(core.facts);
    if (!lowered.ok) {
        return { diagnostics: [], unsupported: [lowered.message, ...coreUnsupported], text: "", functionCount: 0 };
    }
    const unsupported = [...coreUnsupported, ...(lowered.unsupportedMessages ?? [])];
    return { diagnostics: [], unsupported, text: lowered.text, functionCount: lowered.functionCount };
}
function lowerCsgCoreToChengSource(facts) {
    const program = readCoreProgram(facts);
    if (!program.ok)
        return program;
    if (program.functions.length <= 0)
        return failCompile("CSG-Core has no functions");
    const asyncShape = validateAsyncSyncI32Shape(program);
    if (!asyncShape.ok)
        return asyncShape;
    // Collect module-level constants (identifiers referenced in functions but not declared as params/local_write)
    const moduleLocals = new Set();
    for (const fn of program.functions) {
        const paramNames = new Set(fn.parameters.map(p => p.name));
        const localNames = new Set();
        const blocks = program.blocksByFunction.get(fn.id) ?? [];
        for (const block of blocks) {
            const ops = program.opsByBlock.get(block.id) ?? [];
            for (const op of ops) {
                if (op.opKind === "local_write" && typeof op.name === "string") {
                    localNames.add(op.name);
                }
                if (op.opKind === "binding_extract" && typeof op.name === "string") {
                    localNames.add(op.name);
                }
                if (op.opKind === "for_of" && typeof op.initializerName === "string") {
                    localNames.add(op.initializerName);
                }
                if (op.opKind === "for_count" && typeof op.initializerName === "string") {
                    localNames.add(op.initializerName);
                }
            }
        }
        for (const block of blocks) {
            const ops = program.opsByBlock.get(block.id) ?? [];
            for (const op of ops) {
                if (op.opKind === "identifier" && typeof op.name === "string") {
                    if (!paramNames.has(op.name) && !localNames.has(op.name) && !chengKeywords.has(op.name)) {
                        moduleLocals.add(op.name);
                    }
                }
            }
        }
    }
    const chunks = [];
    const helperNames = new Set();
    const errors = [];
    const emitters = [];
    const i64PropertyNames = collectI64PropertyNames(program);
    for (const fn of program.functions) {
        const emitter = new ChengFunctionEmitter(program, fn, moduleLocals, i64PropertyNames);
        emitters.push(emitter);
        const rendered = emitter.emitFunction();
        if (!rendered.ok) {
            errors.push(`${fn.name}: ${rendered.message}`);
            continue;
        }
        for (const helper of rendered.helpers)
            helperNames.add(helper);
        chunks.push(rendered.text);
    }
    if (errors.length > 0) {
        return failCompile(errors.join("; "));
    }
    for (const helper of helperNames) {
        if (program.functionByName.has(helper))
            return { ok: false, message: `generated helper conflicts with user function: ${helper}` };
    }
    const allHelpers = [...helperNames].sort();
    const helperText = emitHelperDefinitions(allHelpers);
    const globalDeclarations = emitModuleGlobalDeclarations(program, moduleLocals);
    const needsRuntime = emitters.some(e => e.needsRuntimeObject) || globalDeclarations.needsRuntimeObject;
    const needsRuntimeString = emitters.some(e => e.needsRuntimeString);
    const needsNullish = emitters.some(e => e.needsNullish);
    const runtimeHeaders = [];
    if (needsRuntime)
        runtimeHeaders.push(emitRuntimeObjectDeclarations());
    if (needsRuntimeString)
        runtimeHeaders.push(emitRuntimeStringDeclarations());
    const runtimeHeader = runtimeHeaders.join("\n\n");
    const nullishHelper = needsNullish
        ? "fn __csg_rt_nullish(left: int32, right: int32): int32 =\n    if left != 0:\n        return left\n    return right\n"
        : "";
    const header = [runtimeHeader, nullishHelper].filter(s => s.length > 0).join("\n\n");
    const sections = helperText.length > 0
        ? [helperText, header, globalDeclarations.text, ...chunks].filter(s => s.length > 0)
        : [header, globalDeclarations.text, ...chunks].filter(s => s.length > 0);
    const finalText = `${sections.join("\n\n")}\n`;
    return { ok: true, text: finalText, functionCount: program.functions.length };
}
function readCoreProgram(facts) {
    const functions = [];
    const functionById = new Map();
    const functionByName = new Map();
    const blocksByFunction = new Map();
    const opsByBlock = new Map();
    const opsById = new Map();
    const dataById = new Map();
    const symbolsByName = new Map();
    const staticDataByBindingName = new Map();
    functionLoop: for (const fact of facts) {
        if (fact.kind === "csg.data" && typeof fact.id === "string") {
            dataById.set(fact.id, fact);
            const value = fact.value;
            if ((fact.dataKind === "static_json_value" || fact.dataKind === "static_string_object_array") && value && typeof value.bindingName === "string") {
                const list = staticDataByBindingName.get(value.bindingName) ?? [];
                list.push(fact);
                staticDataByBindingName.set(value.bindingName, list);
            }
            continue;
        }
        if (fact.kind === "csg.symbol" && fact.symbolKind === "variable" && typeof fact.name === "string") {
            const list = symbolsByName.get(fact.name) ?? [];
            list.push(fact);
            symbolsByName.set(fact.name, list);
            continue;
        }
        if (fact.kind === "csg.function") {
            const id = stringField(fact, "id");
            const name = stringField(fact, "name");
            const returnType = stringField(fact, "returnType");
            if (!id.ok)
                return id;
            if (!name.ok)
                return name;
            if (!returnType.ok)
                return returnType;
            const parameters = coreParameters(fact.parameters);
            if (!parameters.ok)
                return parameters;
            const typeParameters = Array.isArray(fact.typeParameters) ? fact.typeParameters : [];
            const info = {
                id: id.value,
                name: name.value,
                parameters: parameters.value,
                returnType: returnType.value,
                async: fact.async === true,
                generator: fact.generator === true,
                typeParameters,
                locStart: locStart(fact),
            };
            functionById.set(info.id, info);
            const validName = validateIdentifier(name.value, "function");
            if (!validName.ok)
                continue;
            if (functionByName.has(info.name))
                continue functionLoop;
            if (info.generator)
                continue functionLoop;
            if (info.typeParameters.length > 0)
                continue functionLoop;
            if (!functionReturnsChengScalar(info))
                continue functionLoop;
            for (const parameter of info.parameters) {
                const validParam = validateIdentifier(parameter.name, `${info.name} parameter`);
                if (!validParam.ok)
                    continue functionLoop;
                if (parameter.optional || parameter.rest)
                    continue functionLoop;
                if (parameter.typeSource !== "number" && parameter.typeSource !== "string" && parameter.typeSource !== "boolean" && parameter.typeSource !== "unknown")
                    continue functionLoop;
            }
            functions.push(info);
            functionByName.set(info.name, info);
            continue;
        }
        if (fact.kind === "csg.block") {
            const id = stringField(fact, "id");
            const fn = stringField(fact, "function");
            const blockKind = stringField(fact, "blockKind");
            const ordinal = numberField(fact, "ordinal");
            if (!id.ok)
                return id;
            if (!fn.ok)
                return fn;
            if (!blockKind.ok)
                return blockKind;
            if (!ordinal.ok)
                return ordinal;
            const block = { id: id.value, function: fn.value, blockKind: blockKind.value, ordinal: ordinal.value };
            const blocks = blocksByFunction.get(block.function) ?? [];
            blocks.push(block);
            blocksByFunction.set(block.function, blocks);
            continue;
        }
        if (fact.kind === "csg.op") {
            const id = stringField(fact, "id");
            const fn = stringField(fact, "function");
            const block = stringField(fact, "block");
            const opKind = stringField(fact, "opKind");
            const ordinal = numberField(fact, "ordinal");
            if (!id.ok)
                return id;
            if (!fn.ok)
                return fn;
            if (!block.ok)
                return block;
            if (!opKind.ok)
                return opKind;
            if (!ordinal.ok)
                return ordinal;
            if (opKind.value === "function_decl")
                continue;
            const op = fact;
            op.id = id.value;
            op.function = fn.value;
            op.block = block.value;
            op.opKind = opKind.value;
            op.ordinal = ordinal.value;
            if (opsById.has(op.id))
                return failCompile(`duplicate op id: ${op.id}`);
            opsById.set(op.id, op);
            const ops = opsByBlock.get(op.block) ?? [];
            ops.push(op);
            opsByBlock.set(op.block, ops);
        }
    }
    functions.sort((left, right) => left.locStart - right.locStart || left.name.localeCompare(right.name));
    for (const blocks of blocksByFunction.values()) {
        blocks.sort((left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id));
    }
    for (const ops of opsByBlock.values()) {
        ops.sort((left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id));
    }
    return { ok: true, functions, functionById, functionByName, blocksByFunction, opsByBlock, opsById, dataById, symbolsByName, staticDataByBindingName };
}
class ChengFunctionEmitter {
    program;
    current;
    moduleLocals;
    i64PropertyNames;
    usedExprIds = new Set();
    locals = new Map();
    helpers = new Set();
    jsxCounter = 0;
    jsxLayoutY = 20;
    jsxContainerW = 400;
    jsxContainerH = 300;
    jsxParentVar = null;
    currentBlockId = "";
    errorCodeCounter = 0;
    tempCounter = 0;
    runtimeObjectCounter = 0;
    preamble = [];
    failExpr(reason) {
        return { ok: false, message: reason };
    }
    failStmt(reason) {
        return { ok: false, message: reason };
    }
    nextErrorCode() {
        this.errorCodeCounter += 1;
        return String(this.errorCodeCounter);
    }
    nextRuntimeObjectId() {
        this.runtimeObjectCounter += 1;
        return stableRuntimeObjectBase(this.current.name) + this.runtimeObjectCounter;
    }
    needsRuntimeObject = false;
    needsRuntimeString = false;
    needsNullish = false;
    constructor(program, current, moduleLocals, i64PropertyNames) {
        this.program = program;
        this.current = current;
        this.moduleLocals = moduleLocals;
        this.i64PropertyNames = i64PropertyNames;
        for (const ops of program.opsByBlock.values()) {
            for (const op of ops) {
                if (op.function !== current.id)
                    continue;
                this.collectUsedExprIds(op);
            }
        }
    }
    emitFunction() {
        const entry = this.entryBlock();
        if (!entry.ok)
            return entry;
        const sortedParams = [...this.current.parameters].sort((left, right) => left.index - right.index);
        for (const param of sortedParams) {
            if (this.locals.has(param.name))
                continue;
            this.locals.set(param.name, param.typeSource === "string" ? { kind: "str" } : { kind: "i32" });
        }
        // Pre-scan for 'this' property access
        const thisScan = this.collectThisPropertyNames();
        if (thisScan.hasThisUsage) {
            const propertyLocals = new Map();
            for (const propName of thisScan.properties) {
                const hidden = hiddenObjectPropertyName("this", propName);
                const validHidden = validateIdentifier(hidden, "object-lite hidden local");
                if (!validHidden.ok)
                    return validHidden;
                this.locals.set(hidden, { kind: "i32" });
                propertyLocals.set(propName, hidden);
            }
            const thisStorage = "__ts_csg_this_obj";
            this.preamble.push(`    var ${thisStorage}: int32 = ${this.nextRuntimeObjectId()}`);
            this.locals.set("this", { kind: "object_i32", properties: propertyLocals, storageName: thisStorage });
        }
        // Register module-level constants using checker-proven CSG type metadata.
        for (const name of this.moduleLocals) {
            if (!this.locals.has(name)) {
                this.locals.set(name, this.moduleLocalBinding(name));
            }
        }
        const params = sortedParams
            .map((param) => `${param.name}: ${param.typeSource === "string" ? "str" : "int32"}`)
            .join(", ");
        const returnKind = functionChengReturnKind(this.current);
        if (!returnKind)
            return failCompile(`${this.current.name} must return number, boolean, string, or Promise<number>`);
        const returnTypeName = returnKind === "bool" ? "bool" : returnKind === "str" ? "str" : "int32";
        const lines = [`fn ${this.current.name}(${params}): ${returnTypeName} =`];
        // Pre-scan for JSX ops so we can set up the window parent before emitting
        if (this.functionHasJsxOps()) {
            this.jsxParentVar = "__jsx_win";
        }
        const body = this.emitBlock(entry.blockId, 1, new Set());
        if (!body.ok)
            return body;
        // Emit var declarations for hidden locals
        const declaredInBody = new Set();
        for (const line of body.lines) {
            const m = line.match(/^\s*(?:let|var)\s+(\w+)\s*:/);
            if (m)
                declaredInBody.add(m[1]);
        }
        const hiddenDecls = [];
        // Collect assignment targets from body lines to find undeclared variables
        const assignedInBody = new Set();
        for (const line of body.lines) {
            const am = line.match(/^\s+(\w+)\s*=/);
            if (am)
                assignedInBody.add(am[1]);
        }
        for (const [name, binding] of this.locals) {
            if (declaredInBody.has(name))
                continue;
            if (this.moduleLocals.has(name))
                continue;
            if (this.current.parameters.some(p => p.name === name || (chengKeywords.has(p.name) && `__${p.name}` === name)))
                continue;
            if (name.startsWith("__ts_csg_") || name.startsWith("__i_") || name.startsWith("__iter_") || assignedInBody.has(name)) {
                hiddenDecls.push(`    var ${name}: ${chengStorageTypeForBinding(binding)} = ${chengDefaultValueForBinding(binding)}`);
            }
        }
        // Also catch variables used in assignments but not in locals at all
        for (const name of assignedInBody) {
            if (this.moduleLocals.has(name))
                continue;
            if (!this.locals.has(name) && !declaredInBody.has(name) && !hiddenDecls.some(h => h.includes(`var ${name}:`))) {
                hiddenDecls.push(`    var ${name}: int32 = 0`);
            }
        }
        if (hiddenDecls.length > 0)
            body.lines = [...hiddenDecls, ...body.lines];
        // If JSX was emitted, wrap with window creation and event loop
        if (this.jsxCounter > 0) {
            const indent1 = "    ";
            const winVar = "__jsx_win";
            // Prepend window creation
            body.lines.unshift(`${indent1}var ${winVar}: int32 = __gui_window_create("Cheng App", ${this.jsxContainerW}, ${this.jsxContainerH})`, `${indent1}__gui_window_show(${winVar})`);
            // Find and remove the return line so event loop runs before it
            const retIdx = body.lines.findIndex((l) => l.trim().startsWith("return"));
            const retLine = retIdx >= 0 ? body.lines.splice(retIdx, 1)[0] : null;
            // Append event loop
            body.lines.push(`${indent1}var __frame: int32 = 0`, `${indent1}while __frame < 180:`, `${indent1}    __gui_app_run_frame()`, `${indent1}    __gui_sleep_ms(16)`, `${indent1}    __frame = __frame + 1`);
            // Put return back after event loop
            if (retLine)
                body.lines.push(retLine);
        }
        if (body.lines.length === 0) {
            body.lines.push(`    return 0`);
        }
        const allLines = [...lines, ...body.lines];
        return { ok: true, text: allLines.join("\n"), helpers: [...this.helpers].sort() };
    }
    entryBlock() {
        const blocks = this.program.blocksByFunction.get(this.current.id) ?? [];
        const entry = blocks.find((block) => block.blockKind === "entry") ?? blocks[0];
        if (!entry)
            return failCompile(`${this.current.name} has no entry block`);
        return { ok: true, blockId: entry.id };
    }
    emitBlock(blockId, depth, visiting) {
        if (visiting.has(blockId))
            return failCompile("cyclic block graph is not supported by Cheng source emitter");
        visiting.add(blockId);
        this.currentBlockId = blockId;
        const lines = [];
        const ops = this.program.opsByBlock.get(blockId) ?? [];
        for (const op of ops) {
            if (this.usedExprIds.has(op.id) && isExpressionOp(op))
                continue;
            const rendered = this.emitStatementOp(op, depth, visiting);
            if (!rendered.ok)
                return rendered;
            if (this.preamble.length > 0) {
                lines.push(...this.preamble);
                this.preamble = [];
            }
            lines.push(...rendered.lines);
        }
        visiting.delete(blockId);
        return { ok: true, lines };
    }
    emitStatementOp(op, depth, visiting) {
        const pad = indent(depth);
        if (op.opKind === "var_statement")
            return { ok: true, lines: [] };
        if (op.opKind === "local_write") {
            const name = stringField(op, "name");
            const value = optionalStringField(op, "value");
            const declarationKind = stringField(op, "declarationKind");
            if (!name.ok)
                return name;
            if (!value.ok)
                return value;
            if (!declarationKind.ok)
                return declarationKind;
            if (declarationKind.value !== "const" && declarationKind.value !== "let" && declarationKind.value !== "var") {
                return failCompile(`unsupported declaration kind: ${declarationKind.value}`);
            }
            const localName = sanitizeChengIdentifier(name.value);
            const validName = validateIdentifier(localName, "local");
            if (!validName.ok)
                return validName;
            if (!value.value) {
                this.locals.set(localName, { kind: "i32" });
                return { ok: true, lines: [`${pad}${declarationKind.value === "var" ? "var" : "let"} ${localName}: int32 = 0`] };
            }
            if (this.locals.has(localName))
                return { ok: true, lines: [] };
            const binding = declarationKind.value === "const" ? "let" : "var";
            const valueOp = this.program.opsById.get(value.value);
            if (!valueOp)
                return failCompile(`unknown expression op: ${value.value}`);
            if (valueOp.opKind === "array_literal") {
                const typeText = optionalStringField(op, "typeText");
                if (!typeText.ok)
                    return typeText;
                const runtimeArray = this.emitRuntimeArrayLiteralLocal(localName, valueOp, binding, pad, typeText.value);
                if (runtimeArray)
                    return runtimeArray;
                return this.emitArrayLiteralLocal(localName, valueOp, binding, pad);
            }
            if (valueOp.opKind === "function_value") {
                const targetFunction = optionalStringField(valueOp, "targetFunction");
                if (!targetFunction.ok)
                    return targetFunction;
                if (!targetFunction.value)
                    return failCompile(`function local ${localName} is missing target function`);
                this.locals.set(localName, { kind: "function_ref", targetFunction: targetFunction.value });
                return { ok: true, lines: [] };
            }
            if (valueOp.opKind === "literal" && valueOp.literalKind === "string") {
                return this.emitStringLiteralLocal(localName, valueOp, binding, pad);
            }
            if (valueOp.opKind === "element_read") {
                const idxResult = this.emitStringArrayElementLocal(localName, valueOp, binding);
                if (idxResult)
                    return idxResult;
            }
            if (valueOp.opKind === "object_literal") {
                return this.emitObjectLiteralLocal(localName, valueOp, binding, pad);
            }
            if (valueOp.opKind === "jsx") {
                void pad;
                void binding;
                return failCompile("JSX lowering to Cheng source is not ported");
            }
            if (valueOp.opKind === "binary") {
                const operator = stringField(valueOp, "operator");
                if (!operator.ok)
                    return operator;
                if (operator.value === "QuestionQuestionToken") {
                    const leftId = stringField(valueOp, "left");
                    const rightId = stringField(valueOp, "right");
                    if (!leftId.ok)
                        return leftId;
                    if (!rightId.ok)
                        return rightId;
                    if (leftId.value) {
                        const leftOp = this.program.opsById.get(leftId.value);
                        if (leftOp && leftOp.function === this.current.id && leftOp.opKind === "call") {
                            const callee = stringField(leftOp, "callee");
                            if (callee.ok && isChengSourceArrayFindCall(callee.value)) {
                                const arrayFindResult = this.emitArrayFindCoalesceLocal(name.value, valueOp, binding, pad);
                                if (arrayFindResult.ok)
                                    return arrayFindResult;
                                // Array.find path failed — fall through to general decomposition
                            }
                        }
                    }
                    // General ?? decomposition: if (left != 0): name = left else: name = right
                    const leftExpr = this.emitExprId(leftId.value);
                    if (!leftExpr.ok)
                        return leftExpr;
                    const rightExpr = this.emitExprId(rightId.value);
                    if (!rightExpr.ok)
                        return rightExpr;
                    this.locals.set(name.value, { kind: "i32" });
                    return {
                        ok: true,
                        lines: [
                            `${pad}if (${leftExpr.text} != 0):`,
                            `${pad}    ${binding} ${name.value}: int32 = ${leftExpr.text}`,
                            `${pad}else:`,
                            `${pad}    ${binding} ${name.value}: int32 = ${rightExpr.text}`,
                        ],
                    };
                }
            }
            if (valueOp.opKind === "call") {
                const callee = stringField(valueOp, "callee");
                if (callee.ok) {
                    // Try runtime method dispatch for non-local receivers BEFORE specific handlers
                    const rtResult = this.emitRuntimeMethodCall(name.value, valueOp, binding, pad);
                    if (rtResult)
                        return rtResult;
                    if (isChengSourceArrayFromCall(callee.value)) {
                        return this.emitArrayFromLocal(name.value, valueOp, binding, pad);
                    }
                    if (isChengSourceStringLiteralCall(callee.value) && this.memberCallReceiverKind(valueOp) === "const_string") {
                        return this.emitStringLiteralMethodLocal(name.value, callee.value, valueOp, binding, pad);
                    }
                    if (isChengSourceArrayJoinCall(callee.value)) {
                        const joinResult = this.emitArrayJoinLocal(name.value, callee.value, valueOp, binding);
                        if (joinResult.ok)
                            return joinResult;
                        // Non-array-lite receiver: fall through to scalar emission
                    }
                    if (isChengSourceArrayIndexOfCall(callee.value)) {
                        return this.emitArrayIndexOfLocal(name.value, callee.value, valueOp, pad);
                    }
                    if (isChengSourceArrayFindIndexCall(callee.value)) {
                        const findIndexResult = this.emitArrayFindIndexLocal(name.value, callee.value, valueOp, pad);
                        if (findIndexResult.ok)
                            return findIndexResult;
                        // Non-array-lite receiver: emit as -1 (not found)
                        if (this.locals.has(name.value))
                            return { ok: true, lines: [] };
                        this.locals.set(name.value, { kind: "i32" });
                        return { ok: true, lines: [`${pad}${binding} ${name.value}: int32 = -1`] };
                    }
                    if (isChengSourceArrayMapCall(callee.value)) {
                        const mapResult = this.emitArrayMapLocal(name.value, callee.value, valueOp, binding, pad);
                        if (mapResult.ok)
                            return mapResult;
                        // Non-array-lite receiver: emit as scalar 0
                        if (this.locals.has(name.value))
                            return { ok: true, lines: [] };
                        this.locals.set(name.value, { kind: "i32" });
                        return { ok: true, lines: [`${pad}${binding} ${name.value}: int32 = 0`] };
                    }
                    if (isChengSourceArraySliceCall(callee.value)) {
                        const sliceLocalResult = this.emitArraySliceLocal(name.value, callee.value, valueOp, binding, pad);
                        if (sliceLocalResult.ok)
                            return sliceLocalResult;
                        // Non-array-lite receiver: emit as scalar 0
                        this.locals.set(name.value, { kind: "i32" });
                        return { ok: true, lines: [`${pad}${binding} ${name.value}: int32 = 0`] };
                    }
                    if (isChengSourceArrayConcatCall(callee.value)) {
                        return this.emitArrayConcatLocal(name.value, callee.value, valueOp, binding, pad);
                    }
                    if (isChengSourceArrayReverseCall(callee.value)) {
                        return this.emitArrayReverseLocal(name.value, callee.value, valueOp, binding, pad);
                    }
                    if (isChengSourceArraySortCall(callee.value)) {
                        return this.emitArraySortLocal(name.value, callee.value, valueOp, binding, pad);
                    }
                    if (isChengSourceArrayPushCall(callee.value)) {
                        return this.emitArrayPushLocal(name.value, callee.value, valueOp, binding, pad);
                    }
                    if (isChengSourceArrayPopCall(callee.value)) {
                        return this.emitArrayPopLocal(name.value, callee.value, valueOp, binding, pad);
                    }
                    if (isChengSourceArrayShiftCall(callee.value)) {
                        return this.emitArrayShiftLocal(name.value, callee.value, valueOp, binding, pad);
                    }
                    if (isChengSourceArrayUnshiftCall(callee.value)) {
                        return this.emitArrayUnshiftLocal(name.value, callee.value, valueOp, binding, pad);
                    }
                    if (isChengSourceArrayFillCall(callee.value)) {
                        return this.emitArrayFillLocal(name.value, callee.value, valueOp, binding, pad);
                    }
                    if (isChengSourceObjectFreezeCall(callee.value)) {
                        return this.emitObjectFreezeLocal(name.value, valueOp, binding, pad);
                    }
                    if (isChengSourceObjectAssignCall(callee.value)) {
                        return this.emitObjectAssignLocal(name.value, valueOp, binding, pad);
                    }
                    if (isChengSourceObjectValuesCall(callee.value)) {
                        return this.emitObjectValuesLocal(name.value, valueOp, binding, pad);
                    }
                    if (callee.value === "Object.keys") {
                        return this.emitObjectKeysLocal(name.value, valueOp, binding);
                    }
                    if (isChengSourceArrayFindCall(callee.value)) {
                        const findParts = this.arrayFindCallParts(callee.value, valueOp);
                        if (!findParts.ok) {
                            // Non-array-lite receiver: emit as scalar 0
                            if (this.locals.has(name.value))
                                return { ok: true, lines: [] };
                            this.locals.set(name.value, { kind: "i32" });
                            return { ok: true, lines: [`${pad}${binding} ${name.value}: int32 = 0`] };
                        }
                        if (this.locals.has(name.value))
                            return { ok: true, lines: [] };
                        this.locals.set(name.value, { kind: "i32" });
                        const lines = [`${pad}var ${name.value}: int32 = 0`];
                        this.appendArrayFindValueBranches(lines, pad, name.value, findParts.receiver.binding.storageName, findParts.predicate, findParts.indexes, 0);
                        return { ok: true, lines };
                    }
                }
            }
            // Check for non-local method call (Map.get, Set.has, etc.) before scalar fallback
            if (valueOp.opKind === "call") {
                const result = this.emitRuntimeMethodCall(name.value, valueOp, binding, pad);
                if (result)
                    return result;
            }
            // Check for ternary (ConditionalExpression) before scalar fallback
            const valueOpExpr = this.program.opsById.get(value.value);
            if (valueOpExpr?.opKind === "expression" && valueOpExpr.expressionKind === "ConditionalExpression") {
                return this.emitConditionalLocal(name.value, valueOpExpr, binding, pad);
            }
            return this.emitScalarLocal(name.value, value.value, binding, pad);
        }
        if (op.opKind === "return") {
            const value = optionalStringField(op, "value");
            if (!value.ok)
                return value;
            if (!value.value) {
                const returnKind = functionChengReturnKind(this.current);
                if (!returnKind)
                    return failCompile(`${this.current.name} has unsupported return type`);
                if (returnKind === "bool")
                    return { ok: true, lines: [`${pad}return false`] };
                if (returnKind === "str")
                    return { ok: true, lines: [`${pad}return ""`] };
                if (returnKind === "rt_string")
                    return { ok: true, lines: [`${pad}return 0`] };
                return { ok: true, lines: [`${pad}return 0`] };
            }
            const returnKind = functionChengReturnKind(this.current);
            if (!returnKind)
                return failCompile(`${this.current.name} has unsupported return type`);
            // Check for ternary in return value: rewrite to temp var + if/else
            const valueExpr = this.program.opsById.get(value.value);
            if (valueExpr?.opKind === "expression" && valueExpr.expressionKind === "ConditionalExpression") {
                return this.emitConditionalReturn(valueExpr, returnKind, pad);
            }
            if (valueExpr?.opKind === "binary") {
                const binOp = stringField(valueExpr, "operator");
                if (binOp.ok && binOp.value === "QuestionQuestionToken") {
                    return this.emitNullishReturn(valueExpr, returnKind, pad);
                }
            }
            const expr = returnKind === "bool" ? this.emitBoolExprId(value.value) :
                returnKind === "str" ? this.emitExprId(value.value) :
                    returnKind === "rt_string" ? this.emitRuntimeStringHandleExprId(value.value) :
                        this.emitI32ExprId(value.value);
            if (!expr.ok)
                return expr;
            if (returnKind === "str" && expr.text === "0")
                return { ok: true, lines: [`${pad}return ""`] };
            if (returnKind === "bool" && expr.text === "0")
                return { ok: true, lines: [`${pad}return false`] };
            return { ok: true, lines: [`${pad}return ${expr.text}`] };
        }
        if (op.opKind === "branch_if") {
            return this.emitBranchIf(op, depth, visiting);
        }
        if (op.opKind === "for_of") {
            return this.emitForOf(op, depth, visiting);
        }
        if (op.opKind === "for_count") {
            return this.emitForCount(op, depth, visiting);
        }
        if (op.opKind === "while") {
            return this.emitWhile(op, depth, visiting);
        }
        if (op.opKind === "block") {
            const nested = optionalStringField(op, "nestedBlock");
            if (!nested.ok)
                return nested;
            if (!nested.value)
                return failCompile("block op must reference nestedBlock");
            return this.emitBlock(nested.value, depth, visiting);
        }
        if (op.opKind === "call") {
            const callee = stringField(op, "callee");
            if (callee.ok) {
                if (isChengSourceArrayPushCall(callee.value))
                    return this.emitArrayPushStatement(callee.value, op, pad);
                if (isChengSourceConsoleCall(callee.value))
                    return this.emitConsoleStatement(callee.value, op, pad);
                if (isChengSourceTimerCall(callee.value))
                    return this.emitVoidHelperStatement(callee.value, op, pad);
                if (isChengSourceProcessCall(callee.value))
                    return this.emitVoidHelperStatement(callee.value, op, pad);
                // Runtime method dispatch for void calls (e.g., map.clear())
                const rtVoid = this.emitRuntimeVoidMethodCall(op, pad);
                if (rtVoid)
                    return rtVoid;
            }
        }
        if (op.opKind === "jsx") {
            void pad;
            return failCompile("JSX lowering to Cheng source is not ported");
        }
        if (op.opKind === "template") {
            return failCompile("template literal statement lowering to Cheng source is not implemented");
        }
        if (op.opKind === "expression") {
            const value = optionalStringField(op, "value");
            if (!value.ok)
                return value;
            if (value.value) {
                const expr = this.emitExprId(value.value);
                if (!expr.ok)
                    return expr;
                return { ok: true, lines: [`${pad}${expr.text}`] };
            }
            const exprKind = optionalStringField(op, "expressionKind");
            if (!exprKind.ok)
                return exprKind;
            if (exprKind.value === "ThisKeyword" || exprKind.value === "TypeOfExpression")
                return { ok: true, lines: [] };
            const expr = this.emitExpr(op);
            if (!expr.ok)
                return expr;
            return expr.text ? { ok: true, lines: [`${pad}${expr.text}`] } : { ok: true, lines: [] };
        }
        if (op.opKind === "statement") {
            const stmtKind = optionalStringField(op, "statementKind");
            if (!stmtKind.ok)
                return stmtKind;
            if (stmtKind.value === "BreakStatement")
                return { ok: true, lines: [`${pad}break`] };
            if (stmtKind.value === "ContinueStatement")
                return { ok: true, lines: [`${pad}continue`] };
            return failCompile(`statement lowering is not implemented: ${stmtKind.value ?? "unknown"}`);
        }
        if (op.opKind === "property_write") {
            return this.emitPropertyWrite(op, depth);
        }
        if (op.opKind === "assign") {
            const leftId = stringField(op, "left");
            const rightId = stringField(op, "right");
            if (!leftId.ok)
                return leftId;
            if (!rightId.ok)
                return rightId;
            const leftExpr = this.emitExprId(leftId.value);
            if (!leftExpr.ok)
                return leftExpr;
            const rightExpr = this.emitExprId(rightId.value);
            if (!rightExpr.ok)
                return rightExpr;
            return { ok: true, lines: [`${indent(depth)}${leftExpr.text} = ${rightExpr.text}`] };
        }
        if (op.opKind === "throw") {
            return failCompile("throw lowering to Cheng source is not implemented");
        }
        if (op.opKind === "try") {
            const tryBlock = optionalStringField(op, "tryBlock");
            if (!tryBlock.ok)
                return tryBlock;
            return failCompile("try/catch/finally lowering to Cheng source is not implemented");
        }
        if (op.opKind === "function_value") {
            // Function used as value - no code needed in statement context
            const funcName = optionalStringField(op, "functionName");
            if (!funcName.ok)
                return funcName;
            return { ok: true, lines: [] };
        }
        if (op.opKind === "binding_extract") {
            return this.emitBindingExtract(op, pad);
        }
        if (op.opKind === "element_write") {
            const elementReceiver = optionalStringField(op, "receiver");
            const elementArg = optionalStringField(op, "argument");
            const elementValue = optionalStringField(op, "value");
            if (elementReceiver.ok && elementReceiver.value && elementArg.ok && elementArg.value && elementValue.ok && elementValue.value) {
                const rcvExpr = this.emitExprId(elementReceiver.value);
                const argExpr = this.emitExprId(elementArg.value);
                const valExpr = this.emitExprId(elementValue.value);
                if (rcvExpr.ok && argExpr.ok && valExpr.ok) {
                    this.needsRuntimeObject = true;
                    return { ok: true, lines: [`${pad}__csg_rt_elem_set(${rcvExpr.text}, ${argExpr.text}, ${valExpr.text})`] };
                }
            }
            return failCompile("element_write lowering requires a production Cheng element runtime provider");
        }
        if (isExpressionOp(op)) {
            // Expression op whose result is discarded - emit as statement
            const result = this.emitExpr(op);
            if (!result.ok)
                return result;
            if (result.text) {
                return { ok: true, lines: [`${pad}${result.text}`] };
            }
            return { ok: true, lines: [] };
        }
        return this.failStmt(`unknown CSG-Core op: ${op.opKind}`);
    }
    emitBindingExtract(op, pad) {
        const name = stringField(op, "name");
        const source = stringField(op, "source");
        if (!name.ok)
            return name;
        if (!source.ok)
            return source;
        const localName = sanitizeChengIdentifier(name.value);
        const validName = validateIdentifier(localName, "binding extract local");
        if (!validName.ok)
            return validName;
        if (this.locals.has(localName))
            return { ok: true, lines: [] };
        const path = op.path;
        if (!Array.isArray(path) || path.length !== 1) {
            return failCompile("binding_extract currently requires a single property/index path");
        }
        const segment = path[0];
        if (!segment || typeof segment.kind !== "string") {
            return failCompile("binding_extract path segment is malformed");
        }
        const sourceOp = this.program.opsById.get(source.value);
        if (!sourceOp || sourceOp.function !== this.current.id) {
            return failCompile(`binding_extract source is unknown: ${source.value}`);
        }
        if (segment.kind === "property") {
            const propertyName = typeof segment.name === "string" ? segment.name : "";
            if (!propertyName)
                return failCompile("binding_extract property path requires a name");
            if (sourceOp.opKind === "object_literal") {
                const properties = objectPropertyValues(sourceOp);
                if (!properties.ok)
                    return properties;
                const property = properties.value.find((item) => item.name === propertyName);
                if (!property)
                    return failCompile(`binding_extract object literal has no property '${propertyName}'`);
                return this.emitScalarLocal(localName, property.value, "let", pad);
            }
            const sourceLocal = this.localFromIdentifierOp(source.value);
            if (!sourceLocal.ok)
                return sourceLocal;
            if (sourceLocal.binding.kind !== "object_i32") {
                return failCompile(`binding_extract property source must be object-lite, got ${sourceLocal.binding.kind}`);
            }
            const hidden = sourceLocal.binding.properties.get(propertyName);
            if (!hidden) {
                this.needsRuntimeObject = true;
                this.locals.set(localName, { kind: "i32", storageName: localName });
                return { ok: true, lines: [`${pad}let ${localName}: int32 = __csg_rt_obj_get(${sourceLocal.binding.storageName}, ${JSON.stringify(propertyName)})`] };
            }
            const hiddenBinding = this.locals.get(hidden);
            if (!hiddenBinding)
                return failCompile(`binding_extract property '${propertyName}' has no backing local`);
            return this.emitLocalFromBinding(localName, hidden, hiddenBinding, "let", pad);
        }
        if (segment.kind === "index") {
            const index = typeof segment.index === "number" ? segment.index : Number(segment.index);
            if (!Number.isInteger(index))
                return failCompile("binding_extract index path requires an integer index");
            if (sourceOp.opKind === "array_literal") {
                const elements = stringArrayField(sourceOp, "elements");
                if (!elements.ok)
                    return elements;
                if (index < 0 || index >= elements.value.length) {
                    return failCompile(`binding_extract array literal index out of bounds: ${index}`);
                }
                return this.emitScalarLocal(localName, elements.value[index], "let", pad);
            }
            const sourceLocal = this.localFromIdentifierOp(source.value);
            if (!sourceLocal.ok)
                return sourceLocal;
            if (sourceLocal.binding.kind === "i32_array") {
                if (index < 0 || index >= sourceLocal.binding.length) {
                    return failCompile(`binding_extract array index out of bounds: ${index}`);
                }
                this.locals.set(localName, { kind: "i32", storageName: localName });
                return { ok: true, lines: [`${pad}let ${localName}: int32 = ${sourceLocal.binding.storageName}[${index}]`] };
            }
            if (sourceLocal.binding.kind === "const_string_array") {
                if (index < 0 || index >= sourceLocal.binding.values.length) {
                    return failCompile(`binding_extract string array index out of bounds: ${index}`);
                }
                this.locals.set(localName, { kind: "const_string", value: sourceLocal.binding.values[index] });
                return { ok: true, lines: [] };
            }
            return failCompile(`binding_extract index source must be array-lite, got ${sourceLocal.binding.kind}`);
        }
        if (segment.kind === "computed") {
            return failCompile("binding_extract computed path requires runtime key lowering");
        }
        return failCompile(`binding_extract path kind is not supported: ${segment.kind}`);
    }
    emitLocalFromBinding(name, sourceName, sourceBinding, binding, pad) {
        if (sourceBinding.kind === "const_string") {
            this.locals.set(name, { kind: "const_string", value: sourceBinding.value });
            return { ok: true, lines: [] };
        }
        if (sourceBinding.kind === "const_string_array") {
            this.locals.set(name, { kind: "const_string_array", values: sourceBinding.values });
            return { ok: true, lines: [] };
        }
        if (sourceBinding.kind === "i32_array") {
            const alias = { kind: "i32_array", length: sourceBinding.length, storageName: sourceBinding.storageName };
            if (sourceBinding.frozen !== undefined)
                alias.frozen = sourceBinding.frozen;
            this.locals.set(name, alias);
            return { ok: true, lines: [] };
        }
        if (sourceBinding.kind === "object_i32") {
            const alias = { kind: "object_i32", properties: sourceBinding.properties, storageName: sourceBinding.storageName };
            if (sourceBinding.frozen !== undefined)
                alias.frozen = sourceBinding.frozen;
            this.locals.set(name, alias);
            return { ok: true, lines: [] };
        }
        const expr = this.emitIdentifierText(sourceName, sourceBinding);
        const localBinding = localBindingFromExprType(this.typeFromLocalBinding(sourceBinding), name);
        if (!localBinding)
            return failCompile(`binding_extract cannot materialize ${sourceBinding.kind}`);
        this.locals.set(name, localBinding);
        return { ok: true, lines: [`${pad}${binding} ${name}: ${chengStorageTypeForBinding(localBinding)} = ${expr}`] };
    }
    emitBranchIf(op, depth, visiting) {
        const condition = optionalStringField(op, "condition");
        const thenBlock = optionalStringField(op, "thenBlock");
        const elseBlock = optionalStringField(op, "elseBlock");
        if (!condition.ok)
            return condition;
        if (!thenBlock.ok)
            return thenBlock;
        if (!elseBlock.ok)
            return elseBlock;
        if (!condition.value || !thenBlock.value)
            return failCompile("branch_if requires condition and thenBlock");
        const conditionType = this.inferExprTypeId(condition.value);
        if (!conditionType.ok)
            return conditionType;
        if (conditionType.type.kind !== "bool" && conditionType.type.kind !== "i32" && conditionType.type.kind !== "str" && conditionType.type.kind !== "rt_string" && conditionType.type.kind !== "object_i32")
            return failCompile(`branch_if condition must be bool or int32, got ${conditionType.type.kind}`);
        const expr = this.emitExprId(condition.value);
        if (!expr.ok)
            return expr;
        const thenLines = this.emitBlock(thenBlock.value, depth + 1, visiting);
        if (!thenLines.ok)
            return thenLines;
        const exprText = expr.text || "0";
        if (conditionType.type.kind === "rt_string")
            this.needsRuntimeString = true;
        const condText = conditionType.type.kind === "i32" ? `(${exprText} != 0)` :
            conditionType.type.kind === "rt_string" ? `(__csg_rt_str_len(${exprText}) != 0)` :
                conditionType.type.kind === "str" ? `(${exprText} != "")` :
                    conditionType.type.kind === "object_i32" ? `(${exprText} != 0)` :
                        exprText;
        const lines = [`${indent(depth)}if ${condText}:`];
        if (thenLines.lines.length === 0)
            return { ok: true, lines };
        lines.push(...thenLines.lines);
        if (elseBlock.value) {
            const elseLines = this.emitBlock(elseBlock.value, depth + 1, visiting);
            if (!elseLines.ok)
                return elseLines;
            lines.push(`${indent(depth)}else:`);
            if (elseLines.lines.length === 0)
                return { ok: true, lines };
            lines.push(...elseLines.lines);
        }
        return { ok: true, lines };
    }
    emitForOf(op, depth, visiting) {
        const iterable = optionalStringField(op, "iterable");
        const bodyBlock = optionalStringField(op, "bodyBlock");
        const initializerName = optionalStringField(op, "initializerName");
        const declarationKind = optionalStringField(op, "declarationKind");
        if (!iterable.ok)
            return iterable;
        if (!bodyBlock.ok)
            return bodyBlock;
        if (!initializerName.ok)
            return initializerName;
        if (!declarationKind.ok)
            return declarationKind;
        if (!iterable.value || !bodyBlock.value)
            return failCompile("for_of requires iterable and bodyBlock");
        let forItemName = initializerName.value ?? "";
        if (initializerName.ok && (!initializerName.value || !validateIdentifier(initializerName.value, "for_of initializer").ok)) {
            // Destructured/non-simple initializer — use a generated temp name
            forItemName = `__for_${this.tempCounter++}`;
        }
        if (!forItemName)
            return failCompile("for_of initializer must be a single local identifier");
        if (declarationKind.value && declarationKind.value !== "const" && declarationKind.value !== "let") {
            return failCompile("for_of initializer must be const or let");
        }
        const validName = validateIdentifier(forItemName, "for_of initializer");
        if (!validName.ok)
            return validName;
        const source = this.localFromIdentifierOp(iterable.value);
        if (!source.ok)
            return failCompile("for_of over non-local iterable requires a production Cheng iterable runtime provider");
        if (source.binding.kind !== "i32_array")
            return failCompile(`for_of requires an array-lite local, got ${source.binding.kind}`);
        if (this.locals.has(forItemName))
            return { ok: true, lines: [] };
        const baseLocals = snapshotLocals(this.locals);
        const lines = [];
        for (let index = 0; index < source.binding.length; index += 1) {
            restoreLocals(this.locals, baseLocals);
            const hidden = hiddenLoopItemName(forItemName, index);
            const validHidden = validateIdentifier(hidden, "for_of hidden local");
            if (!validHidden.ok)
                return validHidden;
            this.locals.set(hidden, { kind: "i32" });
            this.locals.set(forItemName, { kind: "i32", storageName: hidden });
            lines.push(`${indent(depth)}let ${hidden}: int32 = ${source.binding.storageName}[${index}]`);
            const body = this.emitBlock(bodyBlock.value, depth, visiting);
            if (!body.ok)
                return body;
            if (body.lines.length === 0)
                return failCompile("for_of body is empty");
            lines.push(...body.lines);
        }
        restoreLocals(this.locals, baseLocals);
        return { ok: true, lines };
    }
    emitForCount(op, depth, visiting) {
        const initializerName = optionalStringField(op, "initializerName");
        const start = optionalStringField(op, "start");
        const end = optionalStringField(op, "end");
        const bodyBlock = optionalStringField(op, "bodyBlock");
        if (!initializerName.ok)
            return initializerName;
        if (!start.ok)
            return start;
        if (!end.ok)
            return end;
        if (!bodyBlock.ok)
            return bodyBlock;
        if (!initializerName.value || !start.value || !end.value || !bodyBlock.value) {
            return failCompile("for_count requires initializerName, start, end, and bodyBlock");
        }
        const loopName = sanitizeChengIdentifier(initializerName.value);
        const validName = validateIdentifier(loopName, "for_count initializer");
        if (!validName.ok)
            return validName;
        const startExpr = this.emitI32ExprId(start.value);
        if (!startExpr.ok)
            return startExpr;
        const endExpr = this.emitI32ExprId(end.value);
        if (!endExpr.ok)
            return endExpr;
        const baseLocals = snapshotLocals(this.locals);
        this.locals.set(loopName, { kind: "i32" });
        const body = this.emitBlock(bodyBlock.value, depth + 1, visiting);
        restoreLocals(this.locals, baseLocals);
        if (!body.ok)
            return body;
        if (body.lines.length === 0)
            return failCompile("for_count body is empty");
        const direction = optionalStringField(op, "direction");
        if (!direction.ok)
            return direction;
        if (direction.value === "down") {
            const cmp = op.inclusiveEnd === true ? ">=" : ">";
            return {
                ok: true,
                lines: [
                    `${indent(depth)}var ${loopName}: int32 = ${startExpr.text}`,
                    `${indent(depth)}while (${loopName} ${cmp} ${endExpr.text}):`,
                    ...body.lines,
                    `${indent(depth + 1)}${loopName} = ${loopName} - 1`,
                ],
            };
        }
        if (direction.value && direction.value !== "up")
            return failCompile(`unsupported for_count direction: ${direction.value}`);
        const rangeOp = op.inclusiveEnd === true ? ".." : "..<";
        return {
            ok: true,
            lines: [
                `${indent(depth)}for ${loopName} in ${startExpr.text}${rangeOp}${endExpr.text}:`,
                ...body.lines,
            ],
        };
    }
    emitWhile(op, depth, visiting) {
        const conditionBlock = optionalStringField(op, "conditionBlock");
        const bodyBlock = optionalStringField(op, "bodyBlock");
        const condition = optionalStringField(op, "condition");
        if (!conditionBlock.ok)
            return conditionBlock;
        if (!bodyBlock.ok)
            return bodyBlock;
        if (!condition.ok)
            return condition;
        if (!conditionBlock.value || !bodyBlock.value || !condition.value) {
            return failCompile("while requires conditionBlock, bodyBlock, and condition");
        }
        const pad = indent(depth);
        const lines = [];
        // Emit condition block's non-expression ops
        const condBlockOps = this.program.opsByBlock.get(conditionBlock.value) ?? [];
        for (const condOp of condBlockOps) {
            if (this.usedExprIds.has(condOp.id) && isExpressionOp(condOp))
                continue;
            const rendered = this.emitStatementOp(condOp, depth, visiting);
            if (!rendered.ok)
                return rendered;
            lines.push(...rendered.lines);
        }
        const conditionType = this.inferExprTypeId(condition.value);
        if (!conditionType.ok)
            return conditionType;
        if (conditionType.type.kind !== "bool" && conditionType.type.kind !== "i32" && conditionType.type.kind !== "str" && conditionType.type.kind !== "rt_string" && conditionType.type.kind !== "object_i32") {
            return failCompile(`while condition must be bool or int32, got ${conditionType.type.kind}`);
        }
        const expr = this.emitExprId(condition.value);
        if (!expr.ok)
            return expr;
        const exprText = expr.text || "0";
        if (conditionType.type.kind === "rt_string")
            this.needsRuntimeString = true;
        const whileCond = conditionType.type.kind === "rt_string"
            ? `(__csg_rt_str_len(${exprText}) != 0)`
            : conditionType.type.kind === "str" ? `(${exprText} != "")` : `(${exprText} != 0)`;
        lines.push(`${pad}while ${whileCond}:`);
        const baseLocals = snapshotLocals(this.locals);
        const bodyLines = this.emitBlock(bodyBlock.value, depth + 1, visiting);
        if (!bodyLines.ok)
            return bodyLines;
        if (bodyLines.lines.length === 0) {
            bodyLines.lines = [];
        }
        lines.push(...bodyLines.lines);
        restoreLocals(this.locals, baseLocals);
        return { ok: true, lines };
    }
    emitExprId(id) {
        const op = this.program.opsById.get(id);
        if (!op || op.function !== this.current.id)
            return failCompile(`unknown expression op: ${id}`);
        return this.emitExpr(op);
    }
    emitIdentifierText(name, local) {
        const kind = local.kind;
        if (kind === "object_i32")
            return local.storageName;
        if (kind === "i32_array" || kind === "const_string_array" || kind === "jsvalue_array" || kind === "function_ref") {
            throw new Error(`non-scalar local ${name} cannot be emitted as scalar Cheng expression`);
        }
        if (kind === "const_string")
            return JSON.stringify(local.value);
        return local.storageName ?? name;
    }
    moduleLocalBinding(name) {
        for (const ops of this.program.opsByBlock.values()) {
            for (const op of ops) {
                if (op.opKind !== "identifier" || op.name !== name)
                    continue;
                const type = typeFromTsTypeText(op.typeText);
                const binding = localBindingFromExprType(type, name);
                if (binding)
                    return binding;
            }
        }
        return { kind: "i32" };
    }
    emitExpr(op) {
        if (op.opKind === "literal") {
            if (op.literalKind === "boolean") {
                const dataId = optionalStringField(op, "data");
                if (!dataId.ok)
                    return dataId;
                if (!dataId.value)
                    return failCompile("literal op missing data id");
                const data = this.program.dataById.get(dataId.value);
                if (!data || data.dataKind !== "boolean" || typeof data.value !== "boolean") {
                    return failCompile("boolean literal data is missing");
                }
                return { ok: true, text: data.value ? "true" : "false" };
            }
            if (op.literalKind === "string") {
                const strVal = literalStringValue(this.program, op);
                if (!strVal.ok)
                    return strVal;
                return { ok: true, text: JSON.stringify(strVal.value) };
            }
            if (op.literalKind === "null")
                return { ok: true, text: "0" };
            if (op.literalKind === "regex")
                return this.failExpr("regex literal is not supported in Cheng scalar emission");
            if (op.literalKind !== "number")
                return failCompile("only int32 and boolean literals can be emitted as Cheng scalar");
            const value = literalNumberValue(this.program, op);
            if (!value.ok)
                return value;
            const checked = int32Literal(value.value);
            if (!checked.ok)
                return checked;
            return { ok: true, text: checked.text };
        }
        if (op.opKind === "identifier") {
            const name = stringField(op, "name");
            if (!name.ok)
                return name;
            if (name.value === "undefined")
                return { ok: true, text: "0" };
            const validName = validateIdentifier(name.value, "identifier");
            if (!validName.ok)
                return validName;
            const local = this.locals.get(name.value);
            if (!local)
                return failCompile(`unknown local variable: ${name.value}`);
            return { ok: true, text: this.emitIdentifierText(name.value, local) };
        }
        if (op.opKind === "binary") {
            return this.emitBinaryExpr(op);
        }
        if (op.opKind === "call") {
            return this.emitCall(op);
        }
        if (op.opKind === "await") {
            const value = optionalStringField(op, "value");
            if (!value.ok)
                return value;
            if (!value.value)
                return failCompile("await expression must reference a value");
            return this.emitExprId(value.value);
        }
        if (op.opKind === "element_read") {
            return this.emitElementRead(op);
        }
        if (op.opKind === "property_read") {
            return this.emitPropertyRead(op);
        }
        if (op.opKind === "array_literal")
            return this.failExpr("array literal must be lowered to a typed local before expression emission");
        if (op.opKind === "object_literal") {
            return this.emitObjectLiteralExpr(op);
        }
        if (op.opKind === "unary") {
            return this.emitUnaryExpr(op);
        }
        if (op.opKind === "new") {
            return this.emitNewExpr(op);
        }
        if (op.opKind === "jsx") {
            return this.failExpr("JSX in expression context is not supported in cheng-source");
        }
        if (op.opKind === "template") {
            const spanCount = op.spanCount;
            if (spanCount === 0) {
                const parts = op.parts;
                const text = parts?.[0] ?? "";
                return { ok: true, text: JSON.stringify(text) };
            }
            return this.failExpr("template literal with spans is not supported in Cheng source emission");
        }
        if (op.opKind === "function_value") {
            return this.failExpr("function value expression is not supported in Cheng source emission");
        }
        if (op.opKind === "expression") {
            const value = optionalStringField(op, "value");
            if (value.ok && value.value) {
                return this.emitExprId(value.value);
            }
            const exprKind = optionalStringField(op, "expressionKind");
            if (!exprKind.ok)
                return exprKind;
            if (exprKind.value === "ThisKeyword") {
                return this.failExpr("this expression is not supported in Cheng source emission");
            }
            if (exprKind.value === "ConditionalExpression") {
                // Ternary a ? b : c in expression context → temp var + if/else
                const condId = optionalStringField(op, "condition");
                const whenTrueId = optionalStringField(op, "whenTrue");
                const whenFalseId = optionalStringField(op, "whenFalse");
                if (!condId.ok || !whenTrueId.ok || !whenFalseId.ok)
                    return this.failExpr("ternary requires condition, whenTrue, and whenFalse");
                if (!condId.value || !whenTrueId.value || !whenFalseId.value)
                    return this.failExpr("ternary requires valid sub-expressions");
                const condExpr = this.emitBoolExprId(condId.value);
                if (!condExpr.ok)
                    return condExpr;
                const trueExpr = this.emitExprId(whenTrueId.value);
                if (!trueExpr.ok)
                    return trueExpr;
                const falseExpr = this.emitExprId(whenFalseId.value);
                if (!falseExpr.ok)
                    return falseExpr;
                const type = this.inferExprTypeId(whenTrueId.value);
                const chengType = type.ok && type.type.kind === "bool" ? "bool" : type.ok && type.type.kind === "str" ? "str" : "int32";
                const defaultVal = chengType === "bool" ? "false" : chengType === "str" ? '""' : "0";
                const tmpVar = `__ternary_${this.tempCounter++}`;
                this.locals.set(tmpVar, { kind: chengType === "bool" ? "bool" : chengType === "str" ? "str" : "i32" });
                this.preamble.push(`    var ${tmpVar}: ${chengType} = ${defaultVal}`);
                this.preamble.push(`    if ${condExpr.text}:`);
                this.preamble.push(`        ${tmpVar} = ${trueExpr.text}`);
                this.preamble.push(`    else:`);
                this.preamble.push(`        ${tmpVar} = ${falseExpr.text}`);
                return { ok: true, text: tmpVar };
            }
            if (exprKind.value === "NonNullExpression") {
                // Non-null assertion: runtime no-op, pass through inner expression
                const value = optionalStringField(op, "value");
                if (value.ok && value.value)
                    return this.emitExprId(value.value);
            }
            if (exprKind.value === "AsExpression") {
                // Type assertion: runtime no-op, pass through inner expression
                const value = optionalStringField(op, "value");
                if (value.ok && value.value)
                    return this.emitExprId(value.value);
            }
            if (exprKind.value === "TypeOfExpression") {
                const operandId = optionalStringField(op, "operand");
                if (operandId.ok && operandId.value) {
                    const operandType = this.inferExprTypeId(operandId.value);
                    if (operandType.ok)
                        return { ok: true, text: JSON.stringify(chengTypeofKind(operandType.type.kind)) };
                }
            }
            if (exprKind.value === "MetaProperty") {
                return this.failExpr("meta property expression is not supported in Cheng source emission");
            }
            if (exprKind.value === "RegularExpressionLiteral") {
                return this.failExpr("regular expression literal is not supported in Cheng source emission");
            }
            return this.failExpr(`unsupported expression: ${exprKind.value ?? "unknown"}`);
        }
        if (op.opKind === "property_write") {
            // Property write as expression: emit the value side
            const pwVal = stringField(op, "value");
            if (pwVal.ok && pwVal.value)
                return this.emitExprId(pwVal.value);
            return this.failExpr("property write expression is missing value");
        }
        return this.failExpr(`unknown expression op: ${op.opKind}`);
    }
    emitBinaryExpr(op) {
        const operator = stringField(op, "operator");
        const leftId = stringField(op, "left");
        const rightId = stringField(op, "right");
        if (!operator.ok)
            return operator;
        if (!leftId.ok)
            return leftId;
        if (!rightId.ok)
            return rightId;
        if (operator.value === "QuestionQuestionToken")
            return this.emitNullishCoalesceExpr(op);
        if (operator.value === "InKeyword")
            return this.failExpr("in operator is not supported in Cheng source emission");
        if (operator.value === "CommaToken") {
            // Comma operator: emit both sides, return right side value
            const leftExpr = this.emitExprId(leftId.value);
            if (!leftExpr.ok)
                return leftExpr;
            const rightExpr = this.emitExprId(rightId.value);
            if (!rightExpr.ok)
                return rightExpr;
            // Emit left side as statement via preamble (side effects)
            this.preamble.push(`    ${leftExpr.text}`);
            return { ok: true, text: rightExpr.text };
        }
        const chengOperator = chengBinaryOperator(operator.value);
        if (!chengOperator.ok)
            return chengOperator;
        const resultType = binaryOperatorResult(operator.value);
        if (!resultType.ok)
            return resultType;
        const leftType = this.inferExprTypeId(leftId.value);
        if (!leftType.ok)
            return leftType;
        const rightType = this.inferExprTypeId(rightId.value);
        if (!rightType.ok)
            return rightType;
        const leftStringish = leftType.type.kind === "str" || leftType.type.kind === "const_string" || leftType.type.kind === "rt_string";
        const rightStringish = rightType.type.kind === "str" || rightType.type.kind === "const_string" || rightType.type.kind === "rt_string";
        if (operator.value === "PlusToken" && (leftStringish || rightStringish)) {
            const leftHandle = this.emitRuntimeStringCoerceExprId(leftId.value);
            if (!leftHandle.ok)
                return leftHandle;
            const rightHandle = this.emitRuntimeStringCoerceExprId(rightId.value);
            if (!rightHandle.ok)
                return rightHandle;
            this.needsRuntimeString = true;
            return { ok: true, text: `__csg_rt_str_concat(${leftHandle.text}, ${rightHandle.text})` };
        }
        const leftNumeric64 = leftType.type.kind === "i64" || leftType.type.kind === "i32";
        const rightNumeric64 = rightType.type.kind === "i64" || rightType.type.kind === "i32";
        if ((leftType.type.kind === "i64" || rightType.type.kind === "i64") && leftNumeric64 && rightNumeric64) {
            const left = this.emitExprId(leftId.value);
            if (!left.ok)
                return left;
            const right = this.emitExprId(rightId.value);
            if (!right.ok)
                return right;
            return { ok: true, text: `(${left.text} ${chengOperator.text} ${right.text})` };
        }
        const rational = this.emitRationalNumericBinary(operator.value, leftId.value, rightId.value);
        if (rational)
            return rational;
        const validKinds = new Set(["i32", "str", "rt_string", "bool", "const_string", "object_i32"]);
        if (!validKinds.has(leftType.type.kind) || !validKinds.has(rightType.type.kind)) {
            return this.failExpr(`unsupported binary operand kinds: ${leftType.type.kind}, ${rightType.type.kind}`);
        }
        const left = this.emitExprId(leftId.value);
        if (!left.ok)
            return left;
        const right = this.emitExprId(rightId.value);
        if (!right.ok)
            return right;
        if (operator.value === "AmpersandAmpersandToken" || operator.value === "BarBarToken") {
            const leftStr = leftType.type.kind === "str" || leftType.type.kind === "const_string" || leftType.type.kind === "rt_string";
            const rightStr = rightType.type.kind === "str" || rightType.type.kind === "const_string" || rightType.type.kind === "rt_string";
            if (leftType.type.kind === "rt_string" || rightType.type.kind === "rt_string")
                this.needsRuntimeString = true;
            const leftTruthy = leftType.type.kind === "rt_string"
                ? `(__csg_rt_str_len(${left.text}) != 0)`
                : leftType.type.kind === "object_i32" ? `(${left.text} != 0)` : leftStr ? `(${left.text} != "")` : `(${left.text} != 0)`;
            const rightTruthy = rightType.type.kind === "rt_string"
                ? `(__csg_rt_str_len(${right.text}) != 0)`
                : rightType.type.kind === "object_i32" ? `(${right.text} != 0)` : rightStr ? `(${right.text} != "")` : `(${right.text} != 0)`;
            return { ok: true, text: `(${leftTruthy} ${chengOperator.text} ${rightTruthy})` };
        }
        if (operator.value === "EqualsEqualsEqualsToken" || operator.value === "EqualsEqualsToken" ||
            operator.value === "ExclamationEqualsEqualsToken" || operator.value === "ExclamationEqualsToken") {
            const leftString = leftType.type.kind === "str" || leftType.type.kind === "const_string" || leftType.type.kind === "rt_string";
            const rightString = rightType.type.kind === "str" || rightType.type.kind === "const_string" || rightType.type.kind === "rt_string";
            if (leftString || rightString) {
                const leftHandle = this.emitRuntimeStringHandleExprId(leftId.value);
                if (!leftHandle.ok)
                    return leftHandle;
                const rightHandle = this.emitRuntimeStringHandleExprId(rightId.value);
                if (!rightHandle.ok)
                    return rightHandle;
                const eq = `__csg_rt_str_eq(${leftHandle.text}, ${rightHandle.text})`;
                return { ok: true, text: chengOperator.text === "!=" ? `(!${eq})` : eq };
            }
        }
        return { ok: true, text: `(${left.text} ${chengOperator.text} ${right.text})` };
    }
    emitRationalNumericBinary(operator, leftId, rightId) {
        if (operator !== "AsteriskToken")
            return undefined;
        const leftRatio = this.numericLiteralRatio(leftId);
        const rightRatio = this.numericLiteralRatio(rightId);
        if (!leftRatio && !rightRatio)
            return undefined;
        if (leftRatio && rightRatio)
            return failCompile("multiplication between two rational numeric literals is not supported in Cheng source");
        const ratio = leftRatio ?? rightRatio;
        const otherId = leftRatio ? rightId : leftId;
        if (!ratio)
            return undefined;
        const other = this.emitI32ExprId(otherId);
        if (!other.ok)
            return other;
        return { ok: true, text: `(((${other.text}) * ${ratio.numerator}) / ${ratio.denominator})` };
    }
    numericLiteralRatio(id) {
        const op = this.program.opsById.get(id);
        if (!op || op.function !== this.current.id || op.opKind !== "literal" || op.literalKind !== "number")
            return undefined;
        const value = literalNumberValue(this.program, op);
        if (!value.ok || Number.isInteger(value.value))
            return undefined;
        const text = String(value.value);
        const match = text.match(/^(-?\d+)\.(\d+)$/);
        if (!match)
            return undefined;
        const whole = Number(match[1]);
        const fracText = match[2];
        const scale = 10 ** fracText.length;
        const sign = whole < 0 ? -1 : 1;
        const numerator = whole * scale + sign * Number(fracText);
        const divisor = gcd(Math.abs(numerator), scale);
        return { numerator: numerator / divisor, denominator: scale / divisor };
    }
    emitNullishCoalesceExpr(op) {
        // For Array.find ?? pattern in expression context
        const parts = this.arrayFindCoalesceParts(op);
        if (parts.ok) {
            const tmpVar = `__find_${this.tempCounter++}`;
            this.locals.set(tmpVar, { kind: "i32" });
            this.preamble.push(`    var ${tmpVar}: int32 = ${parts.defaultValue}`);
            this.appendArrayFindValueBranches(this.preamble, "    ", tmpVar, parts.find.receiver.binding.storageName, parts.find.predicate, parts.find.indexes, 0);
            return { ok: true, text: tmpVar };
        }
        // General ?? in expression context: emit helper call
        const leftId = stringField(op, "left");
        const rightId = stringField(op, "right");
        if (!leftId.ok || !rightId.ok)
            return failCompile("?? requires left and right operands");
        const left = this.emitExprId(leftId.value);
        if (!left.ok)
            return left;
        const right = this.emitExprId(rightId.value);
        if (!right.ok)
            return right;
        this.needsNullish = true;
        return { ok: true, text: `__csg_rt_nullish(${left.text}, ${right.text})` };
    }
    emitUnaryExpr(op) {
        const operator = stringField(op, "operator");
        const operandId = stringField(op, "operand");
        if (!operator.ok)
            return operator;
        if (!operandId.ok)
            return operandId;
        const operand = this.emitExprId(operandId.value);
        if (!operand.ok)
            return operand;
        if (operator.value === "ExclamationToken") {
            const opType = this.inferExprTypeId(operandId.value);
            if (opType.ok && opType.type.kind === "str")
                return { ok: true, text: `(${operand.text} == "")` };
            if (opType.ok && (opType.type.kind === "object_i32" || opType.type.kind === "i32_array"))
                return { ok: true, text: "false" };
            return { ok: true, text: `(!${operand.text})` };
        }
        const chengOp = operator.value === "MinusToken" ? "-" :
            operator.value === "PlusToken" ? "+" : "";
        if (chengOp)
            return { ok: true, text: `(${chengOp}${operand.text})` };
        if (operator.value === "PlusPlusToken") {
            return { ok: true, text: `(${operand.text} + 1)` };
        }
        return this.failExpr(`unsupported unary operator: ${operator.value}`);
    }
    emitNewExpr(op) {
        const callee = optionalStringField(op, "callee");
        if (!callee.ok)
            return callee;
        const constructor = optionalStringField(op, "constructor");
        if (!constructor.ok)
            return constructor;
        const constructorName = callee.value ?? constructor.value;
        if (!constructorName)
            return failCompile("new expression requires a constructor name");
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        const renderedArgs = [];
        for (const arg of args.value) {
            const rendered = this.emitExprId(arg);
            if (!rendered.ok)
                return rendered;
            renderedArgs.push(rendered.text);
        }
        return { ok: true, text: `${constructorName}(${renderedArgs.join(", ")})` };
    }
    emitCall(op) {
        const callee = stringField(op, "callee");
        if (!callee.ok)
            return callee;
        if (isChengSourceDateCall(callee.value))
            return this.emitDateCall(callee.value, op);
        if (isChengSourceI32MathCall(callee.value))
            return this.emitMathCall(callee.value, op);
        if (isChengSourceI32NumberPredicateCall(callee.value))
            return this.emitNumberPredicateCall(callee.value, op);
        if (isChengSourceNumberConvertCall(callee.value))
            return this.emitNumberConvertCall(callee.value, op);
        if (isChengSourceBooleanCall(callee.value))
            return this.emitBooleanCall(callee.value, op);
        if (isChengSourceConsoleCall(callee.value))
            return failCompile(`${callee.value} has no Cheng expression value`);
        if (isChengSourceTimerCall(callee.value))
            return failCompile(`${callee.value} has no Cheng expression value`);
        if (isChengSourceProcessCall(callee.value))
            return failCompile(`${callee.value} has no Cheng expression value`);
        if (isChengSourceStringConvertCall(callee.value))
            return this.emitStringConvertCall(callee.value, op);
        if (isChengSourceArrayTypePredicateCall(callee.value))
            return this.emitArrayTypePredicateCall(callee.value, op);
        if (isChengSourceStringLiteralCall(callee.value) && this.memberCallReceiverKind(op) === "const_string") {
            const result = this.evaluateStringLiteralMethod(callee.value, op);
            if (!result.ok)
                return result;
            if (result.resultKind === "const_string" || result.resultKind === "const_string_array") {
                return { ok: true, text: "\"\"" };
            }
            return { ok: true, text: result.text };
        }
        if (isChengSourceStringLiteralCall(callee.value)) {
            const runtimeResult = this.emitRuntimeStringMethodExpr(callee.value, op);
            if (runtimeResult)
                return runtimeResult;
        }
        if (isChengSourceArrayIncludesCall(callee.value)) {
            const result = this.emitArrayIncludesCall(callee.value, op);
            if (result.ok)
                return result;
            // Runtime fallback for non-local receiver
            const rtResult = this.emitRuntimeMethodExpr(callee.value, op);
            if (rtResult)
                return rtResult;
            return result;
        }
        if (isChengSourceArrayAtCall(callee.value)) {
            const result = this.emitArrayAtCall(callee.value, op);
            if (result.ok)
                return result;
            // Runtime fallback for non-local receiver
            const rtResult = this.emitRuntimeMethodExpr(callee.value, op);
            if (rtResult)
                return rtResult;
            return result;
        }
        if (isChengSourceArrayIndexOfCall(callee.value)) {
            const tempName = `__indexOf_${this.tempCounter++}`;
            const indexOfResult = this.emitArrayIndexOfLocal(tempName, callee.value, op, "    ");
            if (indexOfResult.ok) {
                this.preamble.push(...indexOfResult.lines);
                return { ok: true, text: tempName };
            }
            return indexOfResult;
        }
        if (isChengSourceArrayFindIndexCall(callee.value))
            return failCompile("Array.findIndex must be assigned to a local before use");
        if (isChengSourceArrayFindCall(callee.value)) {
            const findParts = this.arrayFindCallParts(callee.value, op);
            if (!findParts.ok)
                return findParts;
            const tmpVar = `__find_${this.tempCounter++}`;
            this.locals.set(tmpVar, { kind: "i32" });
            this.preamble.push(`    var ${tmpVar}: int32 = 0`);
            this.appendArrayFindValueBranches(this.preamble, "    ", tmpVar, findParts.receiver.binding.storageName, findParts.predicate, findParts.indexes, 0);
            return { ok: true, text: tmpVar };
        }
        if (isChengSourceArrayJoinCall(callee.value)) {
            const joined = this.arrayJoinValue(callee.value, op);
            if (joined.ok)
                return { ok: true, text: JSON.stringify(joined.value) };
            return joined;
        }
        if (isChengSourceArrayPredicateCall(callee.value)) {
            const predResult = this.emitArrayPredicateCall(callee.value, op);
            if (predResult.ok)
                return predResult;
            return predResult;
        }
        if (isChengSourceArrayFilterCall(callee.value))
            return this.failExpr("Array.filter must be assigned to a local before expression use");
        if (isChengSourceArrayReduceCall(callee.value)) {
            const reduceResult = this.emitArrayReduceCall(callee.value, op);
            if (reduceResult.ok)
                return reduceResult;
            return reduceResult;
        }
        if (isChengSourceArrayMapCall(callee.value)) {
            const tempName = `__map_${this.tempCounter++}`;
            const mapResult = this.emitArrayMapLocal(tempName, callee.value, op, "var", "    ");
            if (mapResult.ok) {
                this.preamble.push(...mapResult.lines);
                return { ok: true, text: tempName };
            }
            return mapResult;
        }
        if (isChengSourceArraySliceCall(callee.value)) {
            const tempName = `__slice_${this.tempCounter++}`;
            const result = this.emitArraySliceLocal(tempName, callee.value, op, "let", "    ");
            if (result.ok) {
                this.preamble.push(...result.lines);
                return { ok: true, text: tempName };
            }
            return result;
        }
        if (isChengSourceArrayConcatCall(callee.value))
            return failCompile("Array.concat must be assigned to a local before use");
        if (isChengSourceArrayReverseCall(callee.value))
            return this.failExpr("Array.reverse must be assigned to a local before expression use");
        if (isChengSourceArraySortCall(callee.value))
            return this.failExpr("Array.sort must be assigned to a local before expression use");
        if (isChengSourceArrayPushCall(callee.value))
            return this.failExpr("Array.push is not supported in expression context");
        if (isChengSourceArrayPopCall(callee.value))
            return this.failExpr("Array.pop is not supported in expression context");
        if (isChengSourceArrayShiftCall(callee.value))
            return this.failExpr("Array.shift is not supported in expression context");
        if (isChengSourceArrayUnshiftCall(callee.value))
            return this.failExpr("Array.unshift is not supported in expression context");
        if (isChengSourceArrayFillCall(callee.value))
            return this.failExpr("Array.fill must be assigned to a local before expression use");
        if (isChengSourceStringLiteralCall(callee.value)) {
            // Try compile-time evaluation first (works for literal string and const_string receivers)
            const compileResult = this.evaluateStringLiteralMethod(callee.value, op);
            if (compileResult.ok) {
                if (compileResult.resultKind === "const_string" || compileResult.resultKind === "const_string_array") {
                    return { ok: true, text: "\"\"" };
                }
                return { ok: true, text: compileResult.text };
            }
            // Compile-time evaluation failed — check if receiver is a string literal (real error)
            const receiverId = op.receiver;
            const receiverOp = typeof receiverId === "string" ? this.program.opsById.get(receiverId) : undefined;
            if (receiverOp && receiverOp.function === this.current.id && receiverOp.opKind === "literal" && receiverOp.literalKind === "string") {
                return compileResult;
            }
            const runtimeResult = this.emitRuntimeStringMethodExpr(callee.value, op);
            if (runtimeResult)
                return runtimeResult;
            return compileResult;
        }
        if (isChengSourceArrayFromCall(callee.value))
            return this.failExpr("Array.from must be assigned to a local before expression use");
        if (isChengSourceObjectFreezeCall(callee.value))
            return failCompile("Object.freeze must be assigned to a local before use");
        if (isChengSourceObjectAssignCall(callee.value)) {
            const tempName = `__objasgn_${this.tempCounter++}`;
            const assignResult = this.emitObjectAssignLocal(tempName, op, "var", "    ");
            if (assignResult.ok) {
                this.preamble.push(...assignResult.lines);
            }
            else {
                return assignResult;
            }
            return { ok: true, text: tempName };
        }
        if (isChengSourceObjectValuesCall(callee.value))
            return this.failExpr("Object.values must be assigned to a local before expression use");
        if (callee.value === "Object.entries")
            return this.failExpr("Object.entries must be assigned to a local before expression use");
        if (isChengSourceObjectKeyEntryCall(callee.value))
            return this.failExpr("Object.keys/Object.entries calls must be assigned to a local before expression use");
        if (isChengSourceObjectIsFrozenCall(callee.value))
            return this.emitObjectIsFrozenCall(callee.value, op);
        const validCallee = validateIdentifier(callee.value, "callee");
        if (!validCallee.ok) {
            // External function call (e.g. path.resolve) - emit as-is
            const args = stringArrayField(op, "arguments");
            const renderedArgs = [];
            if (args.ok) {
                for (const arg of args.value) {
                    const rendered = this.emitExprId(arg);
                    if (rendered.ok)
                        renderedArgs.push(rendered.text);
                }
            }
            return { ok: true, text: `${callee.value}(${renderedArgs.join(", ")})` };
        }
        const target = this.program.functionByName.get(callee.value);
        if (!target) {
            // Unknown function — emit as direct call
            const args = stringArrayField(op, "arguments");
            if (!args.ok)
                return args;
            const renderedArgs = [];
            for (const arg of args.value) {
                const rendered = this.emitExprId(arg);
                if (!rendered.ok)
                    return rendered;
                renderedArgs.push(rendered.text);
            }
            return { ok: true, text: `${callee.value}(${renderedArgs.join(", ")})` };
        }
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length === 0) {
            if (target.parameters.length !== 0)
                return this.failExpr(`function ${callee.value} expects ${target.parameters.length} arguments`);
        }
        if (args.value.length !== target.parameters.length) {
            return this.failExpr(`function ${callee.value} argument count mismatch: expected ${target.parameters.length}, got ${args.value.length}`);
        }
        const renderedArgs = [];
        for (let i = 0; i < args.value.length; i++) {
            const param = target.parameters[i];
            if (param.typeSource === "string") {
                const rendered = this.emitExprId(args.value[i]);
                if (!rendered.ok)
                    return rendered;
                renderedArgs.push(rendered.text);
            }
            else {
                const rendered = this.emitI32ExprId(args.value[i]);
                if (!rendered.ok)
                    return rendered;
                renderedArgs.push(rendered.text);
            }
        }
        return { ok: true, text: `${callee.value}(${renderedArgs.join(", ")})` };
    }
    emitMathCall(callee, op) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (callee === "Math.max" || callee === "Math.min") {
            if (args.value.length <= 0)
                return failCompile(`${callee} requires at least one int32 argument`);
            const rendered = this.emitExprIds(args.value);
            if (!rendered.ok)
                return rendered;
            if (rendered.items.length === 1)
                return { ok: true, text: rendered.items[0] };
            const helper = callee === "Math.max" ? "__ts_csg_math_max_i32" : "__ts_csg_math_min_i32";
            this.helpers.add(helper);
            let expr = `${helper}(${rendered.items[0]}, ${rendered.items[1]})`;
            for (let index = 2; index < rendered.items.length; index += 1) {
                expr = `${helper}(${expr}, ${rendered.items[index]})`;
            }
            return { ok: true, text: expr };
        }
        if (callee === "Math.abs") {
            if (args.value.length !== 1)
                return failCompile("Math.abs requires exactly one int32 argument");
            const rendered = this.emitExprIds(args.value);
            if (!rendered.ok)
                return rendered;
            this.helpers.add("__ts_csg_math_abs_i32");
            return { ok: true, text: `__ts_csg_math_abs_i32(${rendered.items[0]})` };
        }
        if (callee === "Math.floor" || callee === "Math.ceil" || callee === "Math.trunc" || callee === "Math.round") {
            if (args.value.length !== 1)
                return failCompile(`${callee} requires exactly one int32 argument`);
            const rendered = this.emitExprIds(args.value);
            if (!rendered.ok)
                return rendered;
            return { ok: true, text: rendered.items[0] };
        }
        return failCompile(`unsupported Math provider call: ${callee}`);
    }
    emitDateCall(callee, op) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (callee !== "Date.now")
            return failCompile(`unsupported Date provider call: ${callee}`);
        if (args.value.length !== 0)
            return failCompile("Date.now requires zero arguments");
        this.helpers.add("__ts_csg_date_now_ms");
        return { ok: true, text: "__ts_csg_date_now_ms()" };
    }
    emitNumberPredicateCall(callee, op) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one int32 argument`);
        const arg = this.validatePureI32ExprId(args.value[0]);
        if (!arg.ok)
            return { ok: true, text: "false" };
        return { ok: true, text: "true" };
    }
    emitNumberConvertCall(callee, op) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one int32 or bool argument`);
        const argId = args.value[0];
        const arg = this.inferExprTypeId(argId);
        if (!arg.ok)
            return arg;
        if (arg.type.kind === "i32")
            return this.emitExprId(argId);
        if (arg.type.kind !== "bool")
            return failCompile(`${callee} requires an int32 or bool argument`);
        const rendered = this.emitExprId(argId);
        if (!rendered.ok)
            return rendered;
        return { ok: true, text: `(${rendered.text} ? 1 : 0)` };
    }
    emitBooleanCall(callee, op) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one int32 or bool argument`);
        const argId = args.value[0];
        const arg = this.inferExprTypeId(argId);
        if (!arg.ok)
            return arg;
        if (arg.type.kind === "bool")
            return this.emitExprId(argId);
        if (arg.type.kind !== "i32")
            return failCompile(`${callee} requires an int32 or bool argument`);
        const rendered = this.emitI32ExprId(argId);
        if (!rendered.ok)
            return rendered;
        return { ok: true, text: `(${rendered.text} != 0)` };
    }
    emitStringConvertLengthRead(callee, op) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one int32, bool, or string-literal argument`);
        const argId = args.value[0];
        const arg = this.inferExprTypeId(argId);
        if (!arg.ok)
            return arg;
        if (arg.type.kind === "const_string")
            return { ok: true, text: String(arg.type.value.length) };
        if (arg.type.kind === "bool") {
            const rendered = this.emitExprId(argId);
            if (!rendered.ok)
                return rendered;
            return { ok: true, text: `(${rendered.text} ? 4 : 5)` };
        }
        if (arg.type.kind !== "i32") {
            return failCompile(`${callee} length projection requires int32, bool, or string literal`);
        }
        const rendered = this.emitI32ExprId(argId);
        if (!rendered.ok)
            return rendered;
        this.helpers.add("__ts_csg_i32_decimal_len");
        return { ok: true, text: `__ts_csg_i32_decimal_len(${rendered.text})` };
    }
    stringConvertArgument(callee, op) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length === 0)
            return { ok: true, kind: "empty" };
        if (args.value.length !== 1)
            return failCompile(`${callee} requires zero or one scalar argument`);
        const argId = args.value[0];
        const argOp = this.program.opsById.get(argId);
        if (!argOp || argOp.function !== this.current.id)
            return failCompile(`unknown ${callee} argument op: ${argId}`);
        if (argOp.opKind === "literal" && argOp.literalKind === "null")
            return { ok: true, kind: "null" };
        if (argOp.opKind === "identifier") {
            const name = stringField(argOp, "name");
            if (!name.ok)
                return name;
            if (name.value === "undefined")
                return { ok: true, kind: "undefined" };
        }
        const arg = this.inferExprTypeId(argId);
        if (!arg.ok)
            return arg;
        if (arg.type.kind === "i32" || arg.type.kind === "bool" || arg.type.kind === "str" || arg.type.kind === "rt_string" || arg.type.kind === "const_string") {
            return { ok: true, kind: arg.type.kind, id: argId };
        }
        return failCompile(`${callee} requires int32, bool, str, runtime string, null, or undefined`);
    }
    emitStringConvertCall(callee, op) {
        const arg = this.stringConvertArgument(callee, op);
        if (!arg.ok)
            return arg;
        if (arg.kind === "empty")
            return { ok: true, text: "\"\"" };
        if (arg.kind === "null")
            return { ok: true, text: "\"null\"" };
        if (arg.kind === "undefined")
            return { ok: true, text: "\"undefined\"" };
        const rendered = this.emitExprId(arg.id);
        if (!rendered.ok)
            return rendered;
        if (arg.kind === "i32") {
            this.helpers.add("__ts_csg_string_from_i32");
            return { ok: true, text: `__ts_csg_string_from_i32(${rendered.text})` };
        }
        if (arg.kind === "bool") {
            this.helpers.add("__ts_csg_string_from_bool");
            return { ok: true, text: `__ts_csg_string_from_bool(${rendered.text})` };
        }
        return { ok: true, text: rendered.text };
    }
    emitRuntimeStringMethodExpr(callee, op) {
        const member = stringLiteralMethodMember(callee);
        if (!member.ok)
            return member;
        const receiver = optionalStringField(op, "receiver");
        if (!receiver.ok || !receiver.value)
            return undefined;
        const receiverType = this.inferExprTypeId(receiver.value);
        if (!receiverType.ok)
            return receiverType;
        const receiverString = receiverType.type.kind === "str" || receiverType.type.kind === "const_string" || receiverType.type.kind === "rt_string";
        if (!receiverString)
            return undefined;
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        const receiverHandle = this.emitRuntimeStringHandleExprId(receiver.value);
        if (!receiverHandle.ok)
            return receiverHandle;
        this.needsRuntimeString = true;
        const oneStringArg = () => {
            if (args.value.length !== 1)
                return failCompile(`${callee} requires exactly one string argument`);
            return this.emitRuntimeStringHandleExprId(args.value[0]);
        };
        const indexOfArgs = () => {
            if (args.value.length < 1 || args.value.length > 2)
                return failCompile(`${callee} requires one string argument and an optional int32 start index`);
            const needle = this.emitRuntimeStringHandleExprId(args.value[0]);
            if (!needle.ok)
                return needle;
            if (args.value.length === 1)
                return { ok: true, needle: needle.text };
            const fromIndex = this.emitI32ExprId(args.value[1]);
            if (!fromIndex.ok)
                return fromIndex;
            return { ok: true, needle: needle.text, fromIndex: fromIndex.text };
        };
        const oneIntArg = (owner) => {
            if (args.value.length !== 1)
                return failCompile(`${owner} requires exactly one int32 argument`);
            return this.emitI32ExprId(args.value[0]);
        };
        const sliceBounds = (owner) => {
            if (args.value.length > 2)
                return failCompile(`${owner} accepts at most two int32 bounds`);
            const start = args.value.length >= 1 ? this.emitI32ExprId(args.value[0]) : { ok: true, text: "0" };
            if (!start.ok)
                return start;
            const end = args.value.length >= 2 ? this.emitI32ExprId(args.value[1]) : { ok: true, text: `__csg_rt_str_len(${receiverHandle.text})` };
            if (!end.ok)
                return end;
            return { ok: true, start: start.text, end: end.text };
        };
        switch (member.value) {
            case "startsWith": {
                const arg = oneStringArg();
                if (!arg.ok)
                    return arg;
                return { ok: true, type: { kind: "bool" }, text: `__csg_rt_str_starts_with(${receiverHandle.text}, ${arg.text})` };
            }
            case "endsWith": {
                const arg = oneStringArg();
                if (!arg.ok)
                    return arg;
                return { ok: true, type: { kind: "bool" }, text: `__csg_rt_str_ends_with(${receiverHandle.text}, ${arg.text})` };
            }
            case "includes":
            case "match": {
                const arg = oneStringArg();
                if (!arg.ok)
                    return arg;
                return { ok: true, type: { kind: "bool" }, text: `__csg_rt_str_includes(${receiverHandle.text}, ${arg.text})` };
            }
            case "indexOf":
            case "search": {
                const arg = indexOfArgs();
                if (!arg.ok)
                    return arg;
                const text = arg.fromIndex
                    ? `__csg_rt_str_index_of_from(${receiverHandle.text}, ${arg.needle}, ${arg.fromIndex})`
                    : `__csg_rt_str_index_of(${receiverHandle.text}, ${arg.needle})`;
                return { ok: true, type: { kind: "i32" }, text };
            }
            case "lastIndexOf": {
                const arg = oneStringArg();
                if (!arg.ok)
                    return arg;
                return { ok: true, type: { kind: "i32" }, text: `__csg_rt_str_last_index_of(${receiverHandle.text}, ${arg.text})` };
            }
            case "trim":
                if (args.value.length !== 0)
                    return failCompile(`${callee} requires no arguments`);
                return { ok: true, type: { kind: "rt_string" }, text: `__csg_rt_str_trim(${receiverHandle.text})` };
            case "toLowerCase":
                if (args.value.length !== 0)
                    return failCompile(`${callee} requires no arguments`);
                return { ok: true, type: { kind: "rt_string" }, text: `__csg_rt_str_to_lower(${receiverHandle.text})` };
            case "toUpperCase":
                if (args.value.length !== 0)
                    return failCompile(`${callee} requires no arguments`);
                return { ok: true, type: { kind: "rt_string" }, text: `__csg_rt_str_to_upper(${receiverHandle.text})` };
            case "toString":
                if (args.value.length !== 0)
                    return failCompile(`${callee} requires no arguments`);
                return { ok: true, type: { kind: "rt_string" }, text: receiverHandle.text };
            case "slice": {
                const bounds = sliceBounds(callee);
                if (!bounds.ok)
                    return bounds;
                return { ok: true, type: { kind: "rt_string" }, text: `__csg_rt_str_slice(${receiverHandle.text}, ${bounds.start}, ${bounds.end})` };
            }
            case "substring": {
                if (args.value.length < 1)
                    return failCompile(`${callee} requires at least one int32 bound`);
                const bounds = sliceBounds(callee);
                if (!bounds.ok)
                    return bounds;
                return { ok: true, type: { kind: "rt_string" }, text: `__csg_rt_str_substring(${receiverHandle.text}, ${bounds.start}, ${bounds.end})` };
            }
            case "charAt": {
                const index = oneIntArg(callee);
                if (!index.ok)
                    return index;
                return { ok: true, type: { kind: "rt_string" }, text: `__csg_rt_str_char_at(${receiverHandle.text}, ${index.text})` };
            }
            case "charCodeAt": {
                const index = oneIntArg(callee);
                if (!index.ok)
                    return index;
                return { ok: true, type: { kind: "i32" }, text: `__csg_rt_str_char_code_at(${receiverHandle.text}, ${index.text})` };
            }
            case "split": {
                const arg = oneStringArg();
                if (!arg.ok)
                    return arg;
                return { ok: true, type: { kind: "object_i32", propertyNames: ["length"] }, text: `__csg_rt_str_split(${receiverHandle.text}, ${arg.text})` };
            }
            default:
                return failCompile(`${callee} on runtime string receiver requires a production Cheng string runtime provider`);
        }
    }
    inferRuntimeStringMethodType(callee, op) {
        const member = stringLiteralMethodMember(callee);
        if (!member.ok)
            return member;
        const receiver = optionalStringField(op, "receiver");
        if (!receiver.ok || !receiver.value)
            return undefined;
        const receiverType = this.inferExprTypeId(receiver.value);
        if (!receiverType.ok)
            return receiverType;
        const receiverString = receiverType.type.kind === "str" || receiverType.type.kind === "const_string" || receiverType.type.kind === "rt_string";
        if (!receiverString)
            return undefined;
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        const checkStringArg = () => {
            if (args.value.length !== 1)
                return failCompile(`${callee} requires exactly one string argument`);
            const arg = this.inferExprTypeId(args.value[0]);
            if (!arg.ok)
                return arg;
            if (arg.type.kind !== "str" && arg.type.kind !== "const_string" && arg.type.kind !== "rt_string") {
                return failCompile(`${callee} requires a string argument`);
            }
            return { ok: true };
        };
        const checkIndexOfArgs = () => {
            if (args.value.length < 1 || args.value.length > 2)
                return failCompile(`${callee} requires one string argument and an optional int32 start index`);
            const arg = this.inferExprTypeId(args.value[0]);
            if (!arg.ok)
                return arg;
            if (arg.type.kind !== "str" && arg.type.kind !== "const_string" && arg.type.kind !== "rt_string") {
                return failCompile(`${callee} requires a string argument`);
            }
            if (args.value.length === 2) {
                const fromIndex = this.inferExprTypeId(args.value[1]);
                if (!fromIndex.ok)
                    return fromIndex;
                if (fromIndex.type.kind !== "i32")
                    return failCompile(`${callee} start index must be int32`);
            }
            return { ok: true };
        };
        const checkIntArg = () => {
            if (args.value.length !== 1)
                return failCompile(`${callee} requires exactly one int32 argument`);
            const arg = this.inferExprTypeId(args.value[0]);
            if (!arg.ok)
                return arg;
            if (arg.type.kind !== "i32")
                return failCompile(`${callee} requires an int32 argument`);
            return { ok: true };
        };
        const checkBounds = (allowZero) => {
            if (!allowZero && args.value.length < 1)
                return failCompile(`${callee} requires at least one int32 bound`);
            if (args.value.length > 2)
                return failCompile(`${callee} accepts at most two int32 bounds`);
            for (const argId of args.value) {
                const arg = this.inferExprTypeId(argId);
                if (!arg.ok)
                    return arg;
                if (arg.type.kind !== "i32")
                    return failCompile(`${callee} bounds must be int32`);
            }
            return { ok: true };
        };
        switch (member.value) {
            case "startsWith":
            case "endsWith":
            case "includes":
            case "match": {
                const ok = checkStringArg();
                if (!ok.ok)
                    return ok;
                return { ok: true, type: { kind: "bool" } };
            }
            case "indexOf":
            case "search": {
                const ok = checkIndexOfArgs();
                if (!ok.ok)
                    return ok;
                return { ok: true, type: { kind: "i32" } };
            }
            case "lastIndexOf": {
                const ok = checkStringArg();
                if (!ok.ok)
                    return ok;
                return { ok: true, type: { kind: "i32" } };
            }
            case "split": {
                const ok = checkStringArg();
                if (!ok.ok)
                    return ok;
                return { ok: true, type: { kind: "object_i32", propertyNames: ["length"] } };
            }
            case "trim":
            case "toLowerCase":
            case "toUpperCase":
            case "toString":
                if (args.value.length !== 0)
                    return failCompile(`${callee} requires no arguments`);
                return { ok: true, type: { kind: "rt_string" } };
            case "slice": {
                const ok = checkBounds(true);
                if (!ok.ok)
                    return ok;
                return { ok: true, type: { kind: "rt_string" } };
            }
            case "substring": {
                const ok = checkBounds(false);
                if (!ok.ok)
                    return ok;
                return { ok: true, type: { kind: "rt_string" } };
            }
            case "charAt": {
                const ok = checkIntArg();
                if (!ok.ok)
                    return ok;
                return { ok: true, type: { kind: "rt_string" } };
            }
            case "charCodeAt": {
                const ok = checkIntArg();
                if (!ok.ok)
                    return ok;
                return { ok: true, type: { kind: "i32" } };
            }
            default:
                return failCompile(`${callee} on runtime string receiver requires a production Cheng string runtime provider`);
        }
    }
    emitArrayTypePredicateCall(callee, op) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one array-lite argument`);
        const argId = args.value[0];
        const arg = this.localFromIdentifierOp(argId);
        if (!arg.ok || arg.binding.kind !== "i32_array") {
            // Non-array-lite argument: check if it's an array literal, otherwise assume true at runtime
            const argOp = this.program.opsById.get(argId);
            if (argOp && argOp.function === this.current.id && argOp.opKind === "array_literal") {
                return { ok: true, text: "true" };
            }
            // For other non-proven cases (e.g. function params), the CSG has already done type narrowing
            return { ok: true, text: "1" };
        }
        return { ok: true, text: "true" };
    }
    emitArrayIncludesCall(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "includes", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one int32 argument`);
        const argId = args.value[0];
        const arg = this.validatePureI32ExprId(argId);
        if (!arg.ok)
            return arg;
        const rendered = this.emitI32ExprId(argId);
        if (!rendered.ok)
            return rendered;
        const checks = [];
        for (let index = 0; index < receiver.binding.length; index += 1) {
            checks.push(`(${receiver.binding.storageName}[${index}] == ${rendered.text})`);
        }
        return { ok: true, text: checks.length === 1 ? checks[0] : `(${checks.join(" || ")})` };
    }
    emitArrayAtCall(callee, op) {
        const parts = this.arrayAtCallParts(callee, op);
        if (!parts.ok)
            return parts;
        return { ok: true, text: `${parts.receiver.binding.storageName}[${parts.index}]` };
    }
    arrayAtCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "at", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one int32 literal index`);
        const raw = this.sliceBoundInt32Value(args.value[0]);
        if (!raw.ok)
            return raw;
        const index = raw.value < 0 ? receiver.binding.length + raw.value : raw.value;
        if (index < 0 || index >= receiver.binding.length)
            return failCompile(`${callee} index must be in bounds for array-lite`);
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, index };
    }
    emitArrayIndexOfLocal(name, callee, op, pad) {
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const parts = this.arrayIndexOfCallParts(callee, op);
        if (!parts.ok)
            return parts;
        this.locals.set(name, { kind: "i32" });
        const lines = [`${pad}var ${name}: int32 = -1`];
        this.appendArrayIndexOfBranches(lines, pad, name, parts.receiver.binding.storageName, parts.argument, parts.indexes, 0);
        return { ok: true, lines };
    }
    arrayIndexOfCallParts(callee, op) {
        const member = callee.endsWith(".lastIndexOf") ? "lastIndexOf" : "indexOf";
        const receiver = this.localBindingFromMemberCall(op, member, callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one int32 argument`);
        const argId = args.value[0];
        const arg = this.validatePureI32ExprId(argId);
        if (!arg.ok)
            return arg;
        const rendered = this.emitI32ExprId(argId);
        if (!rendered.ok)
            return rendered;
        const indexes = [...Array(receiver.binding.length).keys()];
        if (member === "lastIndexOf")
            indexes.reverse();
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, argument: rendered.text, indexes };
    }
    appendArrayIndexOfBranches(lines, pad, target, storageName, argument, indexes, offset) {
        if (offset >= indexes.length)
            return;
        const index = indexes[offset];
        lines.push(`${pad}if ${storageName}[${index}] == ${argument}:`);
        lines.push(`${pad}    ${target} = ${index}`);
        if (offset + 1 < indexes.length) {
            lines.push(`${pad}else:`);
            this.appendArrayIndexOfBranches(lines, `${pad}    `, target, storageName, argument, indexes, offset + 1);
        }
    }
    emitArrayFindIndexLocal(name, callee, op, pad) {
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const parts = this.arrayFindIndexCallParts(callee, op);
        if (!parts.ok)
            return parts;
        this.locals.set(name, { kind: "i32" });
        const lines = [`${pad}var ${name}: int32 = -1`];
        this.appendArrayFindIndexBranches(lines, pad, name, parts.receiver.binding.storageName, parts.predicate, parts.indexes, 0);
        return { ok: true, lines };
    }
    arrayFindIndexCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "findIndex", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one predicate argument`);
        const predicate = this.functionFromIdentifierOp(args.value[0], `${callee} predicate`);
        if (!predicate.ok)
            return predicate;
        if (!predicate.target)
            return failCompile(`${callee} predicate must be a local function`);
        if (predicate.target.parameters.length !== 1 || predicate.target.parameters[0]?.typeSource !== "number") {
            return failCompile(`${callee} predicate must accept exactly one number argument`);
        }
        if (functionChengReturnKind(predicate.target) !== "bool")
            return failCompile(`${callee} predicate must return boolean`);
        const indexes = [...Array(receiver.binding.length).keys()];
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, predicate: predicate.name, indexes };
    }
    appendArrayFindIndexBranches(lines, pad, target, storageName, predicate, indexes, offset) {
        if (offset >= indexes.length)
            return;
        const index = indexes[offset];
        lines.push(`${pad}if ${predicate}(${storageName}[${index}]):`);
        lines.push(`${pad}    ${target} = ${index}`);
        if (offset + 1 < indexes.length) {
            lines.push(`${pad}else:`);
            this.appendArrayFindIndexBranches(lines, `${pad}    `, target, storageName, predicate, indexes, offset + 1);
        }
    }
    emitArrayFindCoalesceLocal(name, op, binding, pad) {
        void binding;
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const parts = this.arrayFindCoalesceParts(op);
        if (!parts.ok)
            return parts;
        this.locals.set(name, { kind: "i32" });
        const lines = [`${pad}var ${name}: int32 = ${parts.defaultValue}`];
        this.appendArrayFindValueBranches(lines, pad, name, parts.find.receiver.binding.storageName, parts.find.predicate, parts.find.indexes, 0);
        return { ok: true, lines };
    }
    arrayFindCoalesceParts(op) {
        const operator = stringField(op, "operator");
        const leftId = stringField(op, "left");
        const rightId = stringField(op, "right");
        if (!operator.ok)
            return operator;
        if (!leftId.ok)
            return leftId;
        if (!rightId.ok)
            return rightId;
        if (operator.value !== "QuestionQuestionToken")
            return failCompile("Array.find coalesce requires ??");
        const leftOp = this.program.opsById.get(leftId.value);
        if (!leftOp || leftOp.function !== this.current.id)
            return failCompile(`unknown nullish coalesce left op: ${leftId.value}`);
        if (leftOp.opKind !== "call")
            return failCompile("nullish coalesce is only supported for Array.find");
        const callee = stringField(leftOp, "callee");
        if (!callee.ok)
            return callee;
        if (!isChengSourceArrayFindCall(callee.value))
            return failCompile("nullish coalesce is only supported for Array.find");
        const find = this.arrayFindCallParts(callee.value, leftOp);
        if (!find.ok)
            return find;
        const defaultValue = this.emitI32ExprId(rightId.value);
        if (!defaultValue.ok)
            return defaultValue;
        return { ok: true, find, defaultValue: defaultValue.text };
    }
    arrayFindCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "find", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one predicate argument`);
        const predicate = this.functionFromIdentifierOp(args.value[0], `${callee} predicate`);
        if (!predicate.ok)
            return predicate;
        if (!predicate.target)
            return failCompile(`${callee} predicate must be a local function`);
        if (predicate.target.parameters.length !== 1 || predicate.target.parameters[0]?.typeSource !== "number") {
            return failCompile(`${callee} predicate must accept exactly one number argument`);
        }
        if (functionChengReturnKind(predicate.target) !== "bool")
            return failCompile(`${callee} predicate must return boolean`);
        const indexes = [...Array(receiver.binding.length).keys()];
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, predicate: predicate.name, indexes };
    }
    appendArrayFindValueBranches(lines, pad, target, storageName, predicate, indexes, offset) {
        if (offset >= indexes.length)
            return;
        const index = indexes[offset];
        lines.push(`${pad}if ${predicate}(${storageName}[${index}]):`);
        lines.push(`${pad}    ${target} = ${storageName}[${index}]`);
        if (offset + 1 < indexes.length) {
            lines.push(`${pad}else:`);
            this.appendArrayFindValueBranches(lines, `${pad}    `, target, storageName, predicate, indexes, offset + 1);
        }
    }
    emitConsoleStatement(callee, op, pad) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one int32 argument`);
        const rendered = this.emitI32ExprId(args.value[0]);
        if (!rendered.ok)
            return rendered;
        const helper = callee === "console.error" ? "__ts_csg_console_error"
            : callee === "console.warn" ? "__ts_csg_console_warn"
                : "__ts_csg_console_log";
        this.helpers.add(helper);
        return { ok: true, lines: [`${pad}${helper}(${rendered.text})`] };
    }
    emitVoidHelperStatement(callee, op, pad) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one int32 argument`);
        const rendered = this.emitI32ExprId(args.value[0]);
        if (!rendered.ok)
            return rendered;
        const helper = `__ts_csg_${callee.replace(/\./g, "_")}`;
        this.helpers.add(helper);
        return { ok: true, lines: [`${pad}${helper}(${rendered.text})`] };
    }
    emitArrayJoinLocal(name, callee, op, binding) {
        if (binding === "var")
            return failCompile(`${callee} string result must be const or let`);
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const joined = this.arrayJoinValue(callee, op);
        if (!joined.ok)
            return joined;
        this.locals.set(name, { kind: "const_string", value: joined.value });
        return { ok: true, lines: [] };
    }
    emitArrayJoinLengthRead(callee, op) {
        const joined = this.arrayJoinValue(callee, op);
        if (!joined.ok)
            return joined;
        return { ok: true, text: String(joined.value.length) };
    }
    emitStringSplitLengthRead(callee, op) {
        const result = this.evaluateStringLiteralMethod(callee, op);
        if (!result.ok)
            return result;
        if (result.resultKind !== "const_string_array")
            return failCompile(`${callee} must return a string array`);
        return { ok: true, text: String(result.type.values.length) };
    }
    arrayJoinValue(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "join", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "const_string_array")
            return { ok: true, value: "" };
        if (receiver.binding.values.length <= 0)
            return { ok: true, value: "" };
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length > 1)
            return failCompile(`${callee} accepts at most one string literal separator`);
        const separator = args.value.length === 0 ? { ok: true, value: "," } : this.constStringExprValue(args.value[0], `${callee} separator`);
        if (!separator.ok)
            return separator;
        return { ok: true, value: receiver.binding.values.join(separator.value) };
    }
    emitArrayPredicateCall(callee, op) {
        const member = callee.endsWith(".every") ? "every" : "some";
        const receiver = this.localBindingFromMemberCall(op, member, callee);
        if (receiver.ok && receiver.binding.kind === "jsvalue_array") {
            return this.emitJsValueArrayPredicateCall(callee, op, member, receiver.binding);
        }
        const inline = this.inlineI32ArrayPredicateChecks(callee, op, member);
        if (inline.ok) {
            return { ok: true, text: inline.items.length === 1 ? inline.items[0] : `(${inline.items.join(member === "every" ? " && " : " || ")})` };
        }
        const parts = this.arrayPredicateCallParts(callee, op, member);
        if (!parts.ok)
            return parts;
        const checks = parts.indexes.map((index) => `${parts.predicate}(${parts.receiver.binding.storageName}[${index}])`);
        return { ok: true, text: checks.length === 1 ? checks[0] : `(${checks.join(member === "every" ? " && " : " || ")})` };
    }
    emitJsValueArrayPredicateCall(callee, op, member, receiver) {
        const checks = this.jsValueArrayPredicateChecks(callee, op, receiver.values);
        if (!checks.ok)
            return checks;
        if (checks.items.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty JSValue array`);
        return { ok: true, text: checks.items.length === 1 ? checks.items[0] : `(${checks.items.join(member === "every" ? " && " : " || ")})` };
    }
    jsValueArrayPredicateChecks(callee, op, values) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one predicate argument`);
        const argId = args.value[0];
        const argOp = this.program.opsById.get(argId);
        if (!argOp || argOp.function !== this.current.id || argOp.opKind !== "identifier") {
            return failCompile(`${callee} JSValue predicate must be Boolean or a local function`);
        }
        const name = stringField(argOp, "name");
        if (!name.ok)
            return name;
        if (name.value === "Boolean") {
            return { ok: true, items: values.map((value) => this.jsValueTruthyText(value)) };
        }
        const local = this.locals.get(name.value);
        if (local?.kind !== "function_ref") {
            return failCompile(`${callee} JSValue predicate must be Boolean or a local function`);
        }
        const target = this.program.functionById.get(local.targetFunction);
        if (!target)
            return failCompile(`${callee} JSValue predicate references an unknown local function`);
        return this.jsValueFunctionPredicateChecks(callee, target, values);
    }
    jsValueFunctionPredicateChecks(callee, target, values) {
        if (target.parameters.length !== 1)
            return failCompile(`${callee} JSValue predicate must accept one argument`);
        if (functionChengReturnKind(target) !== "bool")
            return failCompile(`${callee} JSValue predicate must return boolean`);
        const paramName = target.parameters[0]?.name;
        if (!paramName)
            return failCompile(`${callee} JSValue predicate parameter is missing`);
        const blocks = this.program.blocksByFunction.get(target.id) ?? [];
        const entry = blocks.find((block) => block.blockKind === "entry") ?? blocks[0];
        if (!entry)
            return failCompile(`${callee} JSValue predicate has no entry block`);
        const ops = this.program.opsByBlock.get(entry.id) ?? [];
        const returnOp = ops.find((item) => item.opKind === "return");
        const returnValue = typeof returnOp?.value === "string" ? returnOp.value : "";
        const binary = returnValue ? this.program.opsById.get(returnValue) : undefined;
        if (!binary || binary.opKind !== "binary")
            return failCompile(`${callee} JSValue predicate must return a literal equality`);
        const operator = stringField(binary, "operator");
        const left = stringField(binary, "left");
        const right = stringField(binary, "right");
        if (!operator.ok)
            return operator;
        if (!left.ok)
            return left;
        if (!right.ok)
            return right;
        if (operator.value !== "EqualsEqualsEqualsToken" && operator.value !== "EqualsEqualsToken") {
            return failCompile(`${callee} JSValue predicate must use equality`);
        }
        const leftOp = this.program.opsById.get(left.value);
        const rightOp = this.program.opsById.get(right.value);
        const leftIsParam = leftOp?.opKind === "identifier" && leftOp.name === paramName;
        const rightIsParam = rightOp?.opKind === "identifier" && rightOp.name === paramName;
        const literal = leftIsParam ? rightOp : rightIsParam ? leftOp : undefined;
        if (!literal || literal.opKind !== "literal")
            return failCompile(`${callee} JSValue predicate must compare its parameter to a literal`);
        return { ok: true, items: values.map((value) => this.jsValueEqualsLiteralText(value, literal)) };
    }
    jsValueTruthyText(value) {
        if (value.kind === "i32")
            return value.value === 0 ? "false" : "true";
        if (value.kind === "bool")
            return value.value ? "true" : "false";
        return value.value.length === 0 ? "false" : "true";
    }
    jsValueEqualsLiteralText(value, literal) {
        if (literal.literalKind === "string") {
            const lit = literalStringValue(this.program, literal);
            return lit.ok && value.kind === "const_string" && value.value === lit.value ? "true" : "false";
        }
        if (literal.literalKind === "number") {
            const lit = literalNumberValue(this.program, literal);
            return lit.ok && value.kind === "i32" && value.value === lit.value ? "true" : "false";
        }
        if (literal.literalKind === "boolean") {
            const dataId = optionalStringField(literal, "data");
            if (!dataId.ok || !dataId.value)
                return "false";
            const data = this.program.dataById.get(dataId.value);
            return data?.dataKind === "boolean" && value.kind === "bool" && value.value === data.value ? "true" : "false";
        }
        return "false";
    }
    inlineI32ArrayPredicateChecks(callee, op, member) {
        const receiver = this.localBindingFromMemberCall(op, member, callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one predicate argument`);
        const predicateOp = this.program.opsById.get(args.value[0]);
        if (!predicateOp || predicateOp.function !== this.current.id || predicateOp.opKind !== "function_value") {
            return failCompile(`${callee} predicate is not an inline function`);
        }
        const targetId = optionalStringField(predicateOp, "targetFunction");
        if (!targetId.ok)
            return targetId;
        if (!targetId.value)
            return failCompile(`${callee} inline predicate has no target`);
        const target = this.program.functionById.get(targetId.value);
        if (!target)
            return failCompile(`${callee} inline predicate target is unknown`);
        const items = arrayItemsFromBinding(receiver.binding);
        return this.inlineI32PredicateChecksForTarget(callee, target, items);
    }
    inlineI32PredicateChecksForTarget(callee, target, items) {
        if (target.parameters.length !== 1 || target.parameters[0]?.typeSource !== "number") {
            return failCompile(`${callee} inline predicate must accept one number argument`);
        }
        if (functionChengReturnKind(target) !== "bool")
            return failCompile(`${callee} inline predicate must return boolean`);
        const paramName = target.parameters[0].name;
        const blocks = this.program.blocksByFunction.get(target.id) ?? [];
        const entry = blocks.find((block) => block.blockKind === "entry") ?? blocks[0];
        if (!entry)
            return failCompile(`${callee} inline predicate has no entry block`);
        const ops = this.program.opsByBlock.get(entry.id) ?? [];
        const returnOp = ops.find((item) => item.opKind === "return");
        const returnValue = typeof returnOp?.value === "string" ? returnOp.value : "";
        const binary = returnValue ? this.program.opsById.get(returnValue) : undefined;
        if (!binary || binary.opKind !== "binary")
            return failCompile(`${callee} inline predicate must return a binary expression`);
        const operator = stringField(binary, "operator");
        const left = stringField(binary, "left");
        const right = stringField(binary, "right");
        if (!operator.ok)
            return operator;
        if (!left.ok)
            return left;
        if (!right.ok)
            return right;
        const chengOp = chengBinaryOperator(operator.value);
        if (!chengOp.ok)
            return chengOp;
        const leftOp = this.program.opsById.get(left.value);
        const rightOp = this.program.opsById.get(right.value);
        const leftIsParam = leftOp?.opKind === "identifier" && leftOp.name === paramName;
        const rightIsParam = rightOp?.opKind === "identifier" && rightOp.name === paramName;
        if (!leftIsParam && !rightIsParam)
            return failCompile(`${callee} inline predicate must reference its parameter`);
        const other = leftIsParam ? rightOp : leftOp;
        if (!other || other.opKind !== "literal" || other.literalKind !== "number") {
            return failCompile(`${callee} inline predicate must compare against a number literal`);
        }
        const literal = literalNumberValue(this.program, other);
        if (!literal.ok)
            return literal;
        const checked = int32Literal(literal.value);
        if (!checked.ok)
            return checked;
        return {
            ok: true,
            items: items.map((item) => leftIsParam ? `(${item} ${chengOp.text} ${checked.text})` : `(${checked.text} ${chengOp.text} ${item})`),
        };
    }
    arrayPredicateCallParts(callee, op, member) {
        const receiver = this.localBindingFromMemberCall(op, member, callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one predicate argument`);
        const predicate = this.functionFromIdentifierOp(args.value[0], `${callee} predicate`);
        if (!predicate.ok)
            return predicate;
        if (!predicate.target)
            return failCompile(`${callee} predicate must be a local function`);
        if (predicate.target.parameters.length !== 1 || predicate.target.parameters[0]?.typeSource !== "number") {
            return failCompile(`${callee} predicate must accept exactly one number argument`);
        }
        if (functionChengReturnKind(predicate.target) !== "bool")
            return failCompile(`${callee} predicate must return boolean`);
        const indexes = [...Array(receiver.binding.length).keys()];
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, predicate: predicate.name, indexes };
    }
    emitArrayFilterLengthRead(callee, op) {
        const parts = this.arrayFilterCallParts(callee, op);
        if (!parts.ok)
            return parts;
        const counts = parts.indexes.map((index) => `(${parts.predicate}(${parts.receiver.binding.storageName}[${index}]) ? 1 : 0)`);
        return { ok: true, text: counts.length === 1 ? counts[0] : `(${counts.join(" + ")})` };
    }
    arrayFilterCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "filter", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one predicate argument`);
        const predicate = this.functionFromIdentifierOp(args.value[0], `${callee} predicate`);
        if (!predicate.ok)
            return predicate;
        if (!predicate.target)
            return failCompile(`${callee} predicate must be a local function`);
        if (predicate.target.async)
            return failCompile(`${callee} predicate must be synchronous`);
        if (predicate.target.parameters.length !== 1 || predicate.target.parameters[0]?.typeSource !== "number") {
            return failCompile(`${callee} predicate must accept exactly one number argument`);
        }
        if (functionChengReturnKind(predicate.target) !== "bool")
            return failCompile(`${callee} predicate must return boolean`);
        const indexes = [...Array(receiver.binding.length).keys()];
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, predicate: predicate.name, indexes };
    }
    emitArrayMapLocal(name, callee, op, binding, pad) {
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const parts = this.arrayMapCallParts(callee, op);
        if (!parts.ok)
            return parts;
        const items = parts.indexes.map((index) => `${parts.mapper}(${parts.receiver.binding.storageName}[${index}])`);
        this.locals.set(name, { kind: "i32_array", length: parts.receiver.binding.length, storageName: name });
        return { ok: true, lines: [`${pad}${binding} ${name}: int32[${parts.receiver.binding.length}] = [${items.join(", ")}]`] };
    }
    arrayMapCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "map", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one mapper argument`);
        const mapper = this.functionFromIdentifierOp(args.value[0], `${callee} mapper`);
        if (!mapper.ok)
            return mapper;
        if (!mapper.target)
            return failCompile(`${callee} mapper must be a local function`);
        if (mapper.target.async)
            return failCompile(`${callee} mapper must be synchronous`);
        if (mapper.target.parameters.length !== 1 || mapper.target.parameters[0]?.typeSource !== "number") {
            return failCompile(`${callee} mapper must accept exactly one number argument`);
        }
        if (functionChengReturnKind(mapper.target) !== "i32")
            return failCompile(`${callee} mapper must return number`);
        const indexes = [...Array(receiver.binding.length).keys()];
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, mapper: mapper.name, indexes };
    }
    emitArraySliceLocal(name, callee, op, binding, pad) {
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const parts = this.arraySliceCallParts(callee, op);
        if (!parts.ok)
            return parts;
        const items = parts.indexes.map((index) => `${parts.receiver.binding.storageName}[${index}]`);
        this.locals.set(name, { kind: "i32_array", length: items.length, storageName: name });
        return { ok: true, lines: [`${pad}${binding} ${name}: int32[${items.length}] = [${items.join(", ")}]`] };
    }
    arraySliceCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "slice", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length > 2)
            return failCompile(`${callee} accepts at most two int32 literal bounds`);
        const startRaw = args.value.length >= 1 ? this.sliceBoundInt32Value(args.value[0]) : { ok: true, value: 0 };
        if (!startRaw.ok)
            return startRaw;
        const endRaw = args.value.length >= 2 ? this.sliceBoundInt32Value(args.value[1]) : { ok: true, value: receiver.binding.length };
        if (!endRaw.ok)
            return endRaw;
        const start = normalizeSliceIndex(startRaw.value, receiver.binding.length);
        const end = normalizeSliceIndex(endRaw.value, receiver.binding.length);
        if (end <= start)
            return failCompile(`${callee} result must be a non-empty array-lite value`);
        const indexes = [];
        for (let index = start; index < end; index += 1)
            indexes.push(index);
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, indexes };
    }
    emitArrayConcatLocal(name, callee, op, binding, pad) {
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const parts = this.arrayConcatCallParts(callee, op);
        if (!parts.ok)
            return parts;
        this.locals.set(name, { kind: "i32_array", length: parts.items.length, storageName: name });
        return { ok: true, lines: [`${pad}${binding} ${name}: int32[${parts.items.length}] = [${parts.items.join(", ")}]`] };
    }
    arrayConcatCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "concat", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        const items = arrayItemsFromBinding(receiver.binding);
        for (const argId of args.value) {
            const argItems = this.arrayItemsFromExprId(argId, `${callee} argument`);
            if (!argItems.ok)
                return argItems;
            items.push(...argItems.items);
        }
        return { ok: true, items };
    }
    emitArrayReverseLocal(name, callee, op, binding, pad) {
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const parts = this.arrayReverseCallParts(callee, op);
        if (!parts.ok)
            return parts;
        const reversed = [...parts.items].reverse();
        parts.receiver.binding.length = reversed.length;
        parts.receiver.binding.storageName = name;
        this.locals.set(name, parts.receiver.binding);
        this.locals.set(parts.receiver.name, parts.receiver.binding);
        return { ok: true, lines: [`${pad}${binding} ${name}: int32[${reversed.length}] = [${reversed.join(", ")}]`] };
    }
    arrayReverseCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "reverse", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.frozen)
            return failCompile(`${callee} receiver must be mutable array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, items: arrayItemsFromBinding(receiver.binding) };
    }
    emitArraySortLocal(name, callee, op, binding, pad) {
        if (this.memberCallReceiverKind(op) === "const_string_array") {
            return this.emitConstStringArraySortLocal(name, callee, op, binding);
        }
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const parts = this.arraySortCallParts(callee, op);
        let receiverBinding;
        let receiverName;
        let items;
        let comparator;
        if (parts.ok) {
            receiverBinding = parts.receiver.binding;
            receiverName = parts.receiver.name;
            items = parts.items;
            comparator = parts.comparator;
        }
        else {
            // No-op sort: emit identity copy when sort can't be resolved at compile time
            const fb = this.localBindingFromMemberCall(op, "sort", callee);
            if (!fb.ok) {
                this.locals.set(name, { kind: "i32" });
                return { ok: true, lines: [`${pad}${binding} ${name}: int32 = 0`] };
            }
            if (fb.binding.kind !== "i32_array") {
                this.locals.set(name, { kind: "i32" });
                return { ok: true, lines: [`${pad}${binding} ${name}: int32 = 0`] };
            }
            receiverBinding = fb.binding;
            receiverName = fb.name;
            items = arrayItemsFromBinding(fb.binding);
        }
        const lines = [];
        const slots = [];
        for (let index = 0; index < items.length; index += 1) {
            const slot = hiddenArraySortItemName(name, index);
            const validSlot = validateIdentifier(slot, "array-lite sort local");
            if (!validSlot.ok)
                return validSlot;
            if (this.locals.has(slot))
                return { ok: true, lines: [] };
            this.locals.set(slot, { kind: "i32" });
            slots.push(slot);
            lines.push(`${pad}var ${slot}: int32 = ${items[index]}`);
        }
        if (comparator) {
            let compareOrdinal = 0;
            for (let i = 1; i < slots.length; i += 1) {
                for (let j = i; j > 0; j -= 1) {
                    const tmp = hiddenArraySortTmpName(name, compareOrdinal);
                    compareOrdinal += 1;
                    const validTmp = validateIdentifier(tmp, "array-lite sort temp");
                    if (!validTmp.ok)
                        return validTmp;
                    if (this.locals.has(tmp))
                        return { ok: true, lines: [] };
                    this.locals.set(tmp, { kind: "i32" });
                    lines.push(`${pad}if ${comparator}(${slots[j]}, ${slots[j - 1]}) < 0:`);
                    lines.push(`${pad}    let ${tmp}: int32 = ${slots[j - 1]}`);
                    lines.push(`${pad}    ${slots[j - 1]} = ${slots[j]}`);
                    lines.push(`${pad}    ${slots[j]} = ${tmp}`);
                }
            }
        }
        lines.push(`${pad}${binding} ${name}: int32[${slots.length}] = [${slots.join(", ")}]`);
        receiverBinding.storageName = name;
        this.locals.set(name, receiverBinding);
        this.locals.set(receiverName, receiverBinding);
        return { ok: true, lines };
    }
    emitConstStringArraySortLocal(name, callee, op, binding) {
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        if (binding === "var")
            return failCompile(`${callee} string default sort result must be const or let`);
        const receiver = this.localBindingFromMemberCall(op, "sort", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "const_string_array")
            return failCompile(`${callee} receiver must be a string literal array`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 0)
            return failCompile(`${callee} string default sort requires no arguments`);
        if (receiver.binding.values.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty string literal array`);
        const values = [...receiver.binding.values].sort(jsDefaultStringSortCompare);
        const sortedBinding = { kind: "const_string_array", values };
        this.locals.set(name, sortedBinding);
        this.locals.set(receiver.name, sortedBinding);
        return { ok: true, lines: [] };
    }
    arraySortCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "sort", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.frozen)
            return failCompile(`${callee} receiver must be mutable array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        if (receiver.binding.length > 16)
            return failCompile(`${callee} receiver must have at most 16 array-lite elements`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one named numeric comparator`);
        const comparator = this.functionFromIdentifierOp(args.value[0], `${callee} comparator`);
        if (!comparator.ok)
            return comparator;
        if (!comparator.target)
            return failCompile(`${callee} comparator must be a local function`);
        if (comparator.target.async)
            return failCompile(`${callee} comparator must be synchronous`);
        if (comparator.target.parameters.length !== 2 || comparator.target.parameters[0]?.typeSource !== "number" || comparator.target.parameters[1]?.typeSource !== "number") {
            return failCompile(`${callee} comparator must accept exactly two number arguments`);
        }
        if (functionChengReturnKind(comparator.target) !== "i32")
            return failCompile(`${callee} comparator must return number`);
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, comparator: comparator.name, items: arrayItemsFromBinding(receiver.binding) };
    }
    emitArrayPushStatement(callee, op, pad) {
        const receiver = this.localBindingFromMemberCall(op, "push", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind === "i32_array") {
            const tempName = `__push_${this.tempCounter++}`;
            const pushed = this.emitArrayPushLocal(tempName, callee, op, "let", pad);
            if (!pushed.ok)
                return pushed;
            return { ok: true, lines: pushed.lines.slice(0, -1) };
        }
        if (receiver.binding.kind !== "object_i32" && receiver.binding.kind !== "i32") {
            return failCompile(`${callee} receiver must be array-lite or runtime array handle, got ${receiver.binding.kind}`);
        }
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length <= 0)
            return failCompile(`${callee} requires at least one argument`);
        this.needsRuntimeObject = true;
        const storageName = receiver.binding.kind === "object_i32"
            ? receiver.binding.storageName
            : this.emitIdentifierText(receiver.name, receiver.binding);
        const lines = [];
        let lengthHidden;
        if (receiver.binding.kind === "object_i32") {
            lengthHidden = receiver.binding.properties.get("length");
            if (!lengthHidden) {
                lengthHidden = hiddenObjectPropertyName(receiver.name, "length");
                const validHidden = validateIdentifier(lengthHidden, "runtime array length local");
                if (!validHidden.ok)
                    return validHidden;
                receiver.binding.properties.set("length", lengthHidden);
                this.locals.set(lengthHidden, { kind: "i32" });
                lines.push(`${pad}var ${lengthHidden}: int32 = __csg_rt_obj_get(${storageName}, "length")`);
            }
        }
        for (const argId of args.value) {
            const value = this.emitRuntimeArrayElementValue(argId);
            if (!value.ok)
                return value;
            const indexName = `__push_index_${this.tempCounter++}`;
            const validIndex = validateIdentifier(indexName, "runtime array push index");
            if (!validIndex.ok)
                return validIndex;
            lines.push(`${pad}var ${indexName}: int32 = __csg_rt_obj_get(${storageName}, "length")`);
            lines.push(`${pad}__csg_rt_elem_set(${storageName}, ${indexName}, ${value.text})`);
            lines.push(`${pad}${indexName} = ${indexName} + 1`);
            lines.push(`${pad}__csg_rt_obj_set(${storageName}, "length", ${indexName})`);
            if (lengthHidden)
                lines.push(`${pad}${lengthHidden} = ${indexName}`);
        }
        return { ok: true, lines };
    }
    emitRuntimeArrayElementValue(id) {
        return this.emitRuntimeValueExprId(id);
    }
    emitArrayPushLocal(name, callee, op, binding, pad) {
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const parts = this.arrayPushCallParts(callee, op);
        if (!parts.ok)
            return parts;
        const hidden = hiddenArrayMutationName(parts.receiver.name, name);
        const validHidden = validateIdentifier(hidden, "array-lite mutation local");
        if (!validHidden.ok)
            return validHidden;
        if (this.locals.has(hidden))
            return { ok: true, lines: [] };
        const nextBinding = { kind: "i32_array", length: parts.items.length, storageName: hidden };
        this.locals.set(hidden, nextBinding);
        this.locals.set(parts.receiver.name, nextBinding);
        this.locals.set(name, { kind: "i32" });
        return {
            ok: true,
            lines: [
                `${pad}let ${hidden}: int32[${parts.items.length}] = [${parts.items.join(", ")}]`,
                `${pad}${binding} ${name}: int32 = ${parts.items.length}`,
            ],
        };
    }
    arrayPushCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "push", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.frozen)
            return failCompile(`${callee} receiver must be mutable array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length <= 0)
            return failCompile(`${callee} requires at least one int32 argument`);
        const items = arrayItemsFromBinding(receiver.binding);
        for (const argId of args.value) {
            const arg = this.validatePureI32ExprId(argId);
            if (!arg.ok)
                return arg;
            const rendered = this.emitI32ExprId(argId);
            if (!rendered.ok)
                return rendered;
            items.push(rendered.text);
        }
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, items };
    }
    emitArrayPopLocal(name, callee, op, binding, pad) {
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const parts = this.arrayPopCallParts(callee, op);
        if (!parts.ok)
            return parts;
        const hidden = hiddenArrayMutationName(parts.receiver.name, name);
        const validHidden = validateIdentifier(hidden, "array-lite mutation local");
        if (!validHidden.ok)
            return validHidden;
        if (this.locals.has(hidden))
            return { ok: true, lines: [] };
        const nextBinding = { kind: "i32_array", length: parts.items.length, storageName: hidden };
        this.locals.set(name, { kind: "i32" });
        this.locals.set(hidden, nextBinding);
        this.locals.set(parts.receiver.name, nextBinding);
        return {
            ok: true,
            lines: [
                `${pad}${binding} ${name}: int32 = ${parts.value}`,
                `${pad}let ${hidden}: int32[${parts.items.length}] = [${parts.items.join(", ")}]`,
            ],
        };
    }
    arrayPopCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "pop", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.frozen)
            return failCompile(`${callee} receiver must be mutable array-lite`);
        if (receiver.binding.length <= 1)
            return failCompile(`${callee} receiver must keep a non-empty array-lite value after pop`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 0)
            return failCompile(`${callee} requires no arguments`);
        const source = arrayItemsFromBinding(receiver.binding);
        const value = source[source.length - 1];
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, value, items: source.slice(0, -1) };
    }
    emitArrayShiftLocal(name, callee, op, binding, pad) {
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const parts = this.arrayShiftCallParts(callee, op);
        if (!parts.ok)
            return parts;
        const hidden = hiddenArrayMutationName(parts.receiver.name, name);
        const validHidden = validateIdentifier(hidden, "array-lite mutation local");
        if (!validHidden.ok)
            return validHidden;
        if (this.locals.has(hidden))
            return { ok: true, lines: [] };
        const nextBinding = { kind: "i32_array", length: parts.items.length, storageName: hidden };
        this.locals.set(name, { kind: "i32" });
        this.locals.set(hidden, nextBinding);
        this.locals.set(parts.receiver.name, nextBinding);
        return {
            ok: true,
            lines: [
                `${pad}${binding} ${name}: int32 = ${parts.value}`,
                `${pad}let ${hidden}: int32[${parts.items.length}] = [${parts.items.join(", ")}]`,
            ],
        };
    }
    arrayShiftCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "shift", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.frozen)
            return failCompile(`${callee} receiver must be mutable array-lite`);
        if (receiver.binding.length <= 1)
            return failCompile(`${callee} receiver must keep a non-empty array-lite value after shift`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 0)
            return failCompile(`${callee} requires no arguments`);
        const source = arrayItemsFromBinding(receiver.binding);
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, value: source[0], items: source.slice(1) };
    }
    emitArrayUnshiftLocal(name, callee, op, binding, pad) {
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const parts = this.arrayUnshiftCallParts(callee, op);
        if (!parts.ok)
            return parts;
        const hidden = hiddenArrayMutationName(parts.receiver.name, name);
        const validHidden = validateIdentifier(hidden, "array-lite mutation local");
        if (!validHidden.ok)
            return validHidden;
        if (this.locals.has(hidden))
            return { ok: true, lines: [] };
        const nextBinding = { kind: "i32_array", length: parts.items.length, storageName: hidden };
        this.locals.set(hidden, nextBinding);
        this.locals.set(parts.receiver.name, nextBinding);
        this.locals.set(name, { kind: "i32" });
        return {
            ok: true,
            lines: [
                `${pad}let ${hidden}: int32[${parts.items.length}] = [${parts.items.join(", ")}]`,
                `${pad}${binding} ${name}: int32 = ${parts.items.length}`,
            ],
        };
    }
    arrayUnshiftCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "unshift", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.frozen)
            return failCompile(`${callee} receiver must be mutable array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length <= 0)
            return failCompile(`${callee} requires at least one int32 argument`);
        const items = [];
        for (const argId of args.value) {
            const arg = this.validatePureI32ExprId(argId);
            if (!arg.ok)
                return arg;
            const rendered = this.emitI32ExprId(argId);
            if (!rendered.ok)
                return rendered;
            items.push(rendered.text);
        }
        items.push(...arrayItemsFromBinding(receiver.binding));
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, items };
    }
    emitArrayFillLocal(name, callee, op, binding, pad) {
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const parts = this.arrayFillCallParts(callee, op);
        if (!parts.ok)
            return parts;
        const items = [];
        for (let index = 0; index < parts.receiver.binding.length; index += 1)
            items.push(parts.value);
        parts.receiver.binding.storageName = name;
        this.locals.set(name, parts.receiver.binding);
        this.locals.set(parts.receiver.name, parts.receiver.binding);
        return { ok: true, lines: [`${pad}${binding} ${name}: int32[${items.length}] = [${items.join(", ")}]`] };
    }
    arrayFillCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "fill", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.frozen)
            return failCompile(`${callee} receiver must be mutable array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one int32 fill value`);
        const arg = this.validatePureI32ExprId(args.value[0]);
        if (!arg.ok)
            return arg;
        const rendered = this.emitI32ExprId(args.value[0]);
        if (!rendered.ok)
            return rendered;
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, value: rendered.text };
    }
    emitArrayReduceCall(callee, op) {
        const parts = this.arrayReduceCallParts(callee, op);
        if (!parts.ok)
            return parts;
        let expr = parts.initial;
        for (const index of parts.indexes) {
            expr = `${parts.reducer}(${expr}, ${parts.receiver.binding.storageName}[${index}])`;
        }
        return { ok: true, text: expr };
    }
    arrayReduceCallParts(callee, op) {
        const receiver = this.localBindingFromMemberCall(op, "reduce", callee);
        if (!receiver.ok)
            return receiver;
        if (receiver.binding.kind !== "i32_array")
            return failCompile(`${callee} receiver must be array-lite`);
        if (receiver.binding.length <= 0)
            return failCompile(`${callee} receiver must be a non-empty array-lite value`);
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 2)
            return failCompile(`${callee} requires exactly one reducer and one int32 initial value`);
        const reducer = this.functionFromIdentifierOp(args.value[0], `${callee} reducer`);
        if (!reducer.ok)
            return reducer;
        if (!reducer.target)
            return failCompile(`${callee} reducer must be a local function`);
        if (reducer.target.async)
            return failCompile(`${callee} reducer must be synchronous`);
        if (reducer.target.parameters.length !== 2 || reducer.target.parameters[0]?.typeSource !== "number" || reducer.target.parameters[1]?.typeSource !== "number") {
            return failCompile(`${callee} reducer must accept exactly two number arguments`);
        }
        if (functionChengReturnKind(reducer.target) !== "i32")
            return failCompile(`${callee} reducer must return number`);
        const initialId = args.value[1];
        const initial = this.validatePureI32ExprId(initialId);
        if (!initial.ok)
            return initial;
        const renderedInitial = this.emitI32ExprId(initialId);
        if (!renderedInitial.ok)
            return renderedInitial;
        const indexes = [...Array(receiver.binding.length).keys()];
        return { ok: true, receiver: { name: receiver.name, binding: receiver.binding }, reducer: reducer.name, initial: renderedInitial.text, indexes };
    }
    emitExprIds(ids) {
        const items = [];
        for (const id of ids) {
            const rendered = this.emitI32ExprId(id);
            if (!rendered.ok)
                return rendered;
            items.push(rendered.text);
        }
        return { ok: true, items };
    }
    emitI32ExprId(id) {
        const type = this.inferExprTypeId(id);
        if (!type.ok)
            return type;
        if (type.type.kind === "i32")
            return this.emitExprId(id);
        if (type.type.kind === "bool") {
            const expr = this.emitExprId(id);
            if (!expr.ok)
                return expr;
            return { ok: true, text: expr.text };
        }
        if (type.type.kind === "object_i32" || type.type.kind === "i32_array" || type.type.kind === "str" || type.type.kind === "const_string" || type.type.kind === "const_string_array") {
            return failCompile(`cannot coerce ${type.type.kind} expression to int32 in Cheng source`);
        }
        if (type.type.kind === "i64") {
            const expr = this.emitExprId(id);
            if (!expr.ok)
                return expr;
            this.needsRuntimeObject = true;
            return { ok: true, text: `__csg_rt_i64_to_i32_checked(${expr.text})` };
        }
        return { ok: false, message: `expression must be int32, got ${type.type.kind}` };
    }
    emitRuntimeStringHandleExprId(id) {
        const type = this.inferExprTypeId(id);
        if (!type.ok)
            return type;
        this.needsRuntimeString = true;
        if (type.type.kind === "rt_string")
            return this.emitExprId(id);
        if (type.type.kind === "const_string") {
            return { ok: true, text: `__csg_rt_str_intern(${JSON.stringify(type.type.value)})` };
        }
        if (type.type.kind === "str") {
            const expr = this.emitExprId(id);
            if (!expr.ok)
                return expr;
            return { ok: true, text: `__csg_rt_str_from_cheng(strToCStringTemp(${expr.text}))` };
        }
        return failCompile(`expression must be a runtime string value, got ${type.type.kind}`);
    }
    emitRuntimeStringCoerceExprId(id) {
        const type = this.inferExprTypeId(id);
        if (!type.ok)
            return type;
        if (type.type.kind === "str" || type.type.kind === "const_string" || type.type.kind === "rt_string") {
            return this.emitRuntimeStringHandleExprId(id);
        }
        this.needsRuntimeString = true;
        if (type.type.kind === "i32") {
            const value = this.emitI32ExprId(id);
            if (!value.ok)
                return value;
            return { ok: true, text: `__csg_rt_i32_to_str(${value.text})` };
        }
        if (type.type.kind === "bool") {
            const value = this.emitBoolExprId(id);
            if (!value.ok)
                return value;
            return { ok: true, text: `__csg_rt_bool_to_str(${value.text} ? 1 : 0)` };
        }
        return failCompile(`expression cannot be coerced to runtime string: ${type.type.kind}`);
    }
    emitRuntimeConstStringArray(values) {
        this.needsRuntimeObject = true;
        this.needsRuntimeString = true;
        const tmpVar = `__strarr_${this.tempCounter++}`;
        this.locals.set(tmpVar, { kind: "object_i32", properties: new Map(), storageName: tmpVar });
        this.preamble.push(`    var ${tmpVar}: int32 = ${this.nextRuntimeObjectId()}`);
        this.preamble.push(`    __csg_rt_obj_set(${tmpVar}, "length", ${values.length})`);
        values.forEach((value, index) => {
            this.preamble.push(`    __csg_rt_elem_set(${tmpVar}, ${index}, __csg_rt_str_intern(${JSON.stringify(value)}))`);
        });
        return { ok: true, text: tmpVar };
    }
    emitRuntimeI32ArrayExprId(id) {
        this.needsRuntimeObject = true;
        const tmpVar = `__i32arr_${this.tempCounter++}`;
        this.locals.set(tmpVar, { kind: "object_i32", properties: new Map(), storageName: tmpVar });
        this.preamble.push(`    var ${tmpVar}: int32 = ${this.nextRuntimeObjectId()}`);
        const op = this.program.opsById.get(id);
        let items;
        if (op?.opKind === "identifier") {
            const local = this.localFromIdentifierOp(id);
            if (!local.ok)
                return local;
            if (local.binding.kind !== "i32_array")
                return failCompile("runtime i32 array value requires an i32_array local");
            items = [];
            for (let index = 0; index < local.binding.length; index += 1) {
                items.push(`${local.binding.storageName}[${index}]`);
            }
        }
        else {
            const literalItems = this.arrayItemsFromExprId(id, "runtime i32 array value");
            if (!literalItems.ok)
                return literalItems;
            items = literalItems.items;
        }
        this.preamble.push(`    __csg_rt_obj_set(${tmpVar}, "length", ${items.length})`);
        items.forEach((item, index) => {
            this.preamble.push(`    __csg_rt_elem_set(${tmpVar}, ${index}, ${item})`);
        });
        return { ok: true, text: tmpVar };
    }
    emitRuntimeValueExprId(id) {
        const type = this.inferExprTypeId(id);
        if (!type.ok)
            return type;
        if (type.type.kind === "i32" || type.type.kind === "object_i32")
            return this.emitExprId(id);
        if (type.type.kind === "i64") {
            const value = this.emitExprId(id);
            if (!value.ok)
                return value;
            this.needsRuntimeObject = true;
            return { ok: true, text: `__csg_rt_i64_box(${value.text})` };
        }
        if (type.type.kind === "bool") {
            const value = this.emitExprId(id);
            if (!value.ok)
                return value;
            return { ok: true, text: `(${value.text} ? 1 : 0)` };
        }
        if (type.type.kind === "str" || type.type.kind === "const_string" || type.type.kind === "rt_string") {
            return this.emitRuntimeStringHandleExprId(id);
        }
        if (type.type.kind === "const_string_array") {
            return this.emitRuntimeConstStringArray(type.type.values);
        }
        if (type.type.kind === "i32_array") {
            return this.emitRuntimeI32ArrayExprId(id);
        }
        const unsupportedKind = type.type.kind;
        return failCompile(`runtime value only supports int32, bool, object handle, or string handle values; got ${unsupportedKind}`);
    }
    runtimeBindingForValueId(id, storageName) {
        const type = this.inferExprTypeId(id);
        if (!type.ok)
            return type;
        if (type.type.kind === "str" || type.type.kind === "const_string" || type.type.kind === "rt_string") {
            return { ok: true, kind: "rt_string", storageName };
        }
        if (type.type.kind === "object_i32") {
            return { ok: true, kind: "object_i32", properties: new Map(), storageName: storageName ?? "" };
        }
        if (type.type.kind === "const_string_array") {
            return { ok: true, kind: "object_i32", properties: new Map(), storageName: storageName ?? "" };
        }
        if (type.type.kind === "i32_array") {
            return { ok: true, kind: "object_i32", properties: new Map(), storageName: storageName ?? "" };
        }
        if (type.type.kind === "i32" || type.type.kind === "bool") {
            return { ok: true, kind: "i32", storageName };
        }
        if (type.type.kind === "i64") {
            return { ok: true, kind: "i64", storageName };
        }
        const unsupportedKind = type.type.kind;
        return failCompile(`runtime value local cannot represent ${unsupportedKind}`);
    }
    emitLocalStoredValueExprId(id) {
        const type = this.inferExprTypeId(id);
        if (!type.ok)
            return type;
        if (type.type.kind === "i64")
            return this.emitExprId(id);
        return this.emitRuntimeValueExprId(id);
    }
    emitBoolExprId(id) {
        const type = this.inferExprTypeId(id);
        if (!type.ok)
            return type;
        if (type.type.kind === "bool")
            return this.emitExprId(id);
        if (type.type.kind === "i32") {
            const expr = this.emitExprId(id);
            if (!expr.ok)
                return expr;
            return { ok: true, text: `(${expr.text} != 0)` };
        }
        if (type.type.kind === "rt_string") {
            const expr = this.emitExprId(id);
            if (!expr.ok)
                return expr;
            this.needsRuntimeString = true;
            return { ok: true, text: `(__csg_rt_str_len(${expr.text}) != 0)` };
        }
        return { ok: false, message: `expression must be bool, got ${type.type.kind}` };
    }
    emitRuntimeArrayLiteralLocal(name, op, binding, pad, typeText) {
        const elements = stringArrayField(op, "elements");
        if (!elements.ok || elements.value.length > 0)
            return undefined;
        const normalizedType = (typeText ?? "").trim();
        if (!normalizedType.endsWith("[]") && !/^Array<.+>$/.test(normalizedType) && !/^ReadonlyArray<.+>$/.test(normalizedType)) {
            return undefined;
        }
        if (normalizedType === "string[]" || normalizedType === "readonly string[]" || normalizedType === "Array<string>" || normalizedType === "ReadonlyArray<string>") {
            if (binding === "var")
                return failCompile("empty string array locals must be const or let");
            this.locals.set(name, { kind: "const_string_array", values: [] });
            return { ok: true, lines: [] };
        }
        this.needsRuntimeObject = true;
        const lengthHidden = hiddenObjectPropertyName(name, "length");
        const validHidden = validateIdentifier(lengthHidden, "runtime array length local");
        if (!validHidden.ok)
            return validHidden;
        const properties = new Map();
        properties.set("length", lengthHidden);
        this.locals.set(lengthHidden, { kind: "i32" });
        this.locals.set(name, { kind: "object_i32", properties, storageName: name });
        return {
            ok: true,
            lines: [
                `${pad}${binding} ${name}: int32 = ${this.nextRuntimeObjectId()}`,
                `${pad}var ${lengthHidden}: int32 = 0`,
                `${pad}__csg_rt_obj_set(${name}, "length", ${lengthHidden})`,
            ],
        };
    }
    jsValueScalarArrayLiteralValues(op) {
        if (op.opKind !== "array_literal")
            return failCompile("JSValue scalar array requires an array literal");
        const elements = stringArrayField(op, "elements");
        if (!elements.ok)
            return elements;
        const values = [];
        for (const elementId of elements.value) {
            const element = this.program.opsById.get(elementId);
            if (!element || element.function !== this.current.id || element.opKind !== "literal") {
                return failCompile("JSValue scalar array only supports literal elements");
            }
            if (element.literalKind === "number") {
                const value = literalNumberValue(this.program, element);
                if (!value.ok)
                    return value;
                const checked = int32Literal(value.value);
                if (!checked.ok)
                    return checked;
                values.push({ kind: "i32", value: value.value, text: checked.text });
                continue;
            }
            if (element.literalKind === "boolean") {
                const dataId = optionalStringField(element, "data");
                if (!dataId.ok)
                    return dataId;
                if (!dataId.value)
                    return failCompile("boolean literal op missing data id");
                const data = this.program.dataById.get(dataId.value);
                if (!data || data.dataKind !== "boolean" || typeof data.value !== "boolean") {
                    return failCompile("boolean literal data is missing");
                }
                values.push({ kind: "bool", value: data.value });
                continue;
            }
            if (element.literalKind === "string") {
                const value = literalStringValue(this.program, element);
                if (!value.ok)
                    return value;
                values.push({ kind: "const_string", value: value.value });
                continue;
            }
            return failCompile(`JSValue scalar array does not support ${String(element.literalKind)} literal`);
        }
        return { ok: true, values };
    }
    emitArrayLiteralLocal(name, op, binding, pad) {
        const type = this.inferExprType(op);
        if (!type.ok)
            return type;
        if (type.type.kind === "const_string_array") {
            if (binding === "var")
                return failCompile("string literal array locals must be const or let");
            this.locals.set(name, { kind: "const_string_array", values: type.type.values });
            return { ok: true, lines: [] };
        }
        if (type.type.kind === "jsvalue_array") {
            if (binding === "var")
                return failCompile("static JSValue array locals must be const or let");
            this.locals.set(name, { kind: "jsvalue_array", values: type.type.values });
            return { ok: true, lines: [] };
        }
        if (type.type.kind !== "i32_array")
            return failCompile("array literal local must be int32 or string literal array");
        const elements = stringArrayField(op, "elements");
        if (!elements.ok)
            return elements;
        if (elements.value.length <= 0) {
            this.locals.set(name, { kind: "i32_array", length: 1, storageName: name });
            return { ok: true, lines: [`${pad}${binding} ${name}: int32[1] = [0]`] };
        }
        const rendered = this.emitExprIds(elements.value);
        if (!rendered.ok)
            return rendered;
        this.locals.set(name, { kind: "i32_array", length: elements.value.length, storageName: name });
        return { ok: true, lines: [`${pad}${binding} ${name}: int32[${elements.value.length}] = [${rendered.items.join(", ")}]`] };
    }
    emitStringLiteralLocal(name, op, binding, pad) {
        const value = literalStringValue(this.program, op);
        if (!value.ok)
            return value;
        this.needsRuntimeString = true;
        this.locals.set(name, { kind: "rt_string", storageName: name });
        return { ok: true, lines: [`${pad}${binding} ${name}: int32 = __csg_rt_str_intern(${JSON.stringify(value.value)})`] };
    }
    emitStringArrayElementLocal(name, op, binding) {
        const receiver = stringField(op, "receiver");
        if (!receiver.ok)
            return undefined;
        const receiverOp = this.program.opsById.get(receiver.value);
        if (!receiverOp || receiverOp.function !== this.current.id || receiverOp.opKind !== "identifier")
            return undefined;
        const receiverLocal = this.locals.get(receiverOp.name);
        if (!receiverLocal || receiverLocal.kind !== "const_string_array")
            return undefined;
        const argument = optionalStringField(op, "argument");
        if (!argument.ok || !argument.value)
            return failCompile(`string array element read requires a constant index`);
        const index = this.literalInt32Value(argument.value);
        if (!index.ok)
            return index;
        if (index.value < 0 || index.value >= receiverLocal.values.length) {
            return failCompile(`string array element index out of bounds: ${index.value}`);
        }
        if (binding === "var")
            return failCompile("string array element locals must be const or let");
        this.locals.set(name, { kind: "const_string", value: receiverLocal.values[index.value] });
        return { ok: true, lines: [] };
    }
    emitStringLiteralMethodLocal(name, callee, op, binding, pad) {
        if (binding === "var")
            return failCompile("string literal method locals must be const or let");
        const result = this.evaluateStringLiteralMethod(callee, op);
        if (!result.ok)
            return result;
        if (result.resultKind === "const_string") {
            this.locals.set(name, { kind: "const_string", value: result.type.value });
            return { ok: true, lines: [] };
        }
        if (result.resultKind === "const_string_array") {
            this.locals.set(name, { kind: "const_string_array", values: result.type.values });
            return { ok: true, lines: [] };
        }
        if (result.resultKind === "bool") {
            this.locals.set(name, { kind: "bool" });
            return { ok: true, lines: [`${pad}${binding} ${name}: bool = ${result.text}`] };
        }
        this.locals.set(name, { kind: "i32" });
        return { ok: true, lines: [`${pad}${binding} ${name}: int32 = ${result.text}`] };
    }
    evaluateStringLiteralMethod(callee, op) {
        const member = stringLiteralMethodMember(callee);
        if (!member.ok)
            return member;
        const receiverValue = this.stringLiteralMethodReceiver(op, member.value, callee);
        if (!receiverValue.ok)
            return receiverValue;
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        switch (member.value) {
            case "trim":
                if (args.value.length !== 0)
                    return failCompile(`${callee} requires no arguments`);
                return { ok: true, resultKind: "const_string", type: { kind: "const_string", value: receiverValue.value.trim() } };
            case "split": {
                if (args.value.length !== 1)
                    return failCompile(`${callee} requires exactly one single-character string literal separator`);
                const separator = this.constStringExprValue(args.value[0], `${callee} separator`);
                if (!separator.ok)
                    return separator;
                if (separator.value.length !== 1)
                    return failCompile(`${callee} separator must be a single-character string literal`);
                return {
                    ok: true,
                    resultKind: "const_string_array",
                    type: { kind: "const_string_array", values: receiverValue.value.split(separator.value) },
                };
            }
            case "toLowerCase":
                if (args.value.length !== 0)
                    return failCompile(`${callee} requires no arguments`);
                return { ok: true, resultKind: "const_string", type: { kind: "const_string", value: receiverValue.value.toLowerCase() } };
            case "toUpperCase":
                if (args.value.length !== 0)
                    return failCompile(`${callee} requires no arguments`);
                return { ok: true, resultKind: "const_string", type: { kind: "const_string", value: receiverValue.value.toUpperCase() } };
            case "toString":
                if (args.value.length !== 0)
                    return failCompile(`${callee} requires no arguments`);
                return { ok: true, resultKind: "const_string", type: { kind: "const_string", value: receiverValue.value } };
            case "slice": {
                if (args.value.length > 2)
                    return failCompile(`${callee} accepts at most two int32 literal bounds`);
                const startRaw = args.value.length >= 1 ? this.sliceBoundInt32Value(args.value[0]) : { ok: true, value: 0 };
                if (!startRaw.ok)
                    return startRaw;
                const endRaw = args.value.length >= 2 ? this.sliceBoundInt32Value(args.value[1]) : { ok: true, value: receiverValue.value.length };
                if (!endRaw.ok)
                    return endRaw;
                return {
                    ok: true,
                    resultKind: "const_string",
                    type: { kind: "const_string", value: receiverValue.value.slice(startRaw.value, endRaw.value) },
                };
            }
            case "substring": {
                if (args.value.length < 1 || args.value.length > 2)
                    return failCompile(`${callee} requires one or two int32 literal bounds`);
                const start = this.sliceBoundInt32Value(args.value[0]);
                if (!start.ok)
                    return start;
                const end = args.value.length >= 2 ? this.sliceBoundInt32Value(args.value[1]) : undefined;
                if (end && !end.ok)
                    return end;
                return {
                    ok: true,
                    resultKind: "const_string",
                    type: { kind: "const_string", value: receiverValue.value.substring(start.value, end?.value) },
                };
            }
            case "replace": {
                if (args.value.length !== 2)
                    return failCompile(`${callee} requires exactly two string literal arguments`);
                const search = this.constStringExprValue(args.value[0], `${callee} search argument`);
                if (!search.ok)
                    return search;
                const replacement = this.constStringExprValue(args.value[1], `${callee} replacement argument`);
                if (!replacement.ok)
                    return replacement;
                return {
                    ok: true,
                    resultKind: "const_string",
                    type: { kind: "const_string", value: receiverValue.value.replace(search.value, replacement.value) },
                };
            }
            case "padStart":
            case "padEnd": {
                if (args.value.length < 1 || args.value.length > 2)
                    return failCompile(`${callee} requires a target length and optional string literal pad`);
                const targetLength = this.sliceBoundInt32Value(args.value[0]);
                if (!targetLength.ok)
                    return targetLength;
                if (targetLength.value < 0)
                    return failCompile(`${callee} target length must be non-negative`);
                const pad = args.value.length >= 2 ? this.constStringExprValue(args.value[1], `${callee} pad argument`) : { ok: true, value: " " };
                if (!pad.ok)
                    return pad;
                const value = member.value === "padStart"
                    ? receiverValue.value.padStart(targetLength.value, pad.value)
                    : receiverValue.value.padEnd(targetLength.value, pad.value);
                return { ok: true, resultKind: "const_string", type: { kind: "const_string", value } };
            }
            case "repeat": {
                if (args.value.length !== 1)
                    return failCompile(`${callee} requires exactly one int32 literal count`);
                const count = this.sliceBoundInt32Value(args.value[0]);
                if (!count.ok)
                    return count;
                if (count.value < 0)
                    return failCompile(`${callee} count must be non-negative`);
                return {
                    ok: true,
                    resultKind: "const_string",
                    type: { kind: "const_string", value: receiverValue.value.repeat(count.value) },
                };
            }
            case "charAt": {
                if (args.value.length !== 1)
                    return failCompile(`${callee} requires exactly one int32 literal index`);
                const index = this.sliceBoundInt32Value(args.value[0]);
                if (!index.ok)
                    return index;
                return { ok: true, resultKind: "const_string", type: { kind: "const_string", value: receiverValue.value.charAt(index.value) } };
            }
            case "charCodeAt": {
                if (args.value.length !== 1)
                    return failCompile(`${callee} requires exactly one int32 literal index`);
                const index = this.sliceBoundInt32Value(args.value[0]);
                if (!index.ok)
                    return index;
                const value = receiverValue.value.charCodeAt(index.value);
                if (!Number.isInteger(value))
                    return failCompile(`${callee} index must be in bounds for string literal`);
                const checked = int32Literal(value);
                if (!checked.ok)
                    return checked;
                return { ok: true, resultKind: "i32", type: { kind: "i32" }, text: checked.text };
            }
            case "startsWith": {
                const arg = this.singleConstStringArg(callee, args.value);
                if (!arg.ok)
                    return arg;
                return { ok: true, resultKind: "bool", type: { kind: "bool" }, text: receiverValue.value.startsWith(arg.value) ? "true" : "false" };
            }
            case "endsWith": {
                const arg = this.singleConstStringArg(callee, args.value);
                if (!arg.ok)
                    return arg;
                return { ok: true, resultKind: "bool", type: { kind: "bool" }, text: receiverValue.value.endsWith(arg.value) ? "true" : "false" };
            }
            case "includes": {
                const arg = this.singleConstStringArg(callee, args.value);
                if (!arg.ok)
                    return arg;
                return { ok: true, resultKind: "bool", type: { kind: "bool" }, text: receiverValue.value.includes(arg.value) ? "true" : "false" };
            }
            case "match": {
                const arg = this.singleConstStringArg(callee, args.value);
                if (!arg.ok)
                    return arg;
                if (arg.value.length !== 1)
                    return failCompile(`${callee} argument must be a single-character string literal`);
                return { ok: true, resultKind: "bool", type: { kind: "bool" }, text: receiverValue.value.includes(arg.value) ? "true" : "false" };
            }
            case "search": {
                if (args.value.length !== 1)
                    return failCompile(`${callee} requires exactly one single-character string literal argument`);
                const arg = this.constStringExprValue(args.value[0], `${callee} argument`);
                if (!arg.ok)
                    return arg;
                if (arg.value.length !== 1)
                    return failCompile(`${callee} argument must be a single-character string literal`);
                return { ok: true, resultKind: "i32", type: { kind: "i32" }, text: String(receiverValue.value.indexOf(arg.value)) };
            }
            case "indexOf": {
                const arg = this.singleConstStringArg(callee, args.value);
                if (!arg.ok)
                    return arg;
                return { ok: true, resultKind: "i32", type: { kind: "i32" }, text: String(receiverValue.value.indexOf(arg.value)) };
            }
            case "lastIndexOf": {
                const arg = this.singleConstStringArg(callee, args.value);
                if (!arg.ok)
                    return arg;
                return { ok: true, resultKind: "i32", type: { kind: "i32" }, text: String(receiverValue.value.lastIndexOf(arg.value)) };
            }
            default:
                return failCompile(`unsupported string literal method: ${callee}`);
        }
    }
    stringLiteralMethodReceiver(op, member, callee) {
        const localResult = this.localBindingFromMemberCall(op, member, callee);
        if (localResult.ok) {
            if (localResult.binding.kind === "const_string") {
                return { ok: true, value: localResult.binding.value };
            }
            return failCompile(`${callee} receiver must be a string literal local`);
        }
        const receiver = optionalStringField(op, "receiver");
        if (!receiver.ok || !receiver.value)
            return failCompile(`${callee} receiver must be a string literal`);
        const receiverOp = this.program.opsById.get(receiver.value);
        if (!receiverOp || receiverOp.function !== this.current.id)
            return failCompile(`${callee} receiver must be a string literal`);
        if (receiverOp.opKind === "literal" && receiverOp.literalKind === "string") {
            const lit = literalStringValue(this.program, receiverOp);
            if (!lit.ok)
                return lit;
            return { ok: true, value: lit.value };
        }
        return failCompile(`${callee} receiver must be a string literal`);
    }
    singleConstStringArg(callee, args) {
        if (args.length !== 1)
            return failCompile(`${callee} requires exactly one string literal argument`);
        return this.constStringExprValue(args[0], `${callee} argument`);
    }
    constStringExprValue(id, owner) {
        const op = this.program.opsById.get(id);
        if (!op || op.function !== this.current.id)
            return failCompile(`unknown ${owner} op: ${id}`);
        if (op.opKind === "literal" && op.literalKind === "string")
            return literalStringValue(this.program, op);
        if (op.opKind === "identifier") {
            const local = this.localFromIdentifierOp(id);
            if (!local.ok)
                return local;
            if (local.binding.kind !== "const_string") {
                return failCompile(`${owner} must be a string literal local`);
            }
            return { ok: true, value: local.binding.value };
        }
        if (op.opKind === "call") {
            const callee = stringField(op, "callee");
            if (!callee.ok)
                return callee;
            if (!isChengSourceStringLiteralCall(callee.value))
                return failCompile(`${owner} must be a string literal expression`);
            const result = this.evaluateStringLiteralMethod(callee.value, op);
            if (!result.ok)
                return result;
            if (result.resultKind !== "const_string")
                return failCompile(`${owner} must be a string literal expression`);
            return { ok: true, value: result.type.value };
        }
        return failCompile(`${owner} must be a string literal expression`);
    }
    emitArrayFromLocal(name, op, binding, pad) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1) {
            this.locals.set(name, { kind: "i32" });
            return { ok: true, lines: [`${pad}${binding} ${name}: int32 = 0`] };
        }
        const argId = args.value[0];
        const argOp = this.program.opsById.get(argId);
        if (!argOp || argOp.function !== this.current.id) {
            this.locals.set(name, { kind: "i32" });
            return { ok: true, lines: [`${pad}${binding} ${name}: int32 = 0`] };
        }
        if (argOp.opKind === "array_literal")
            return this.emitArrayLiteralLocal(name, argOp, binding, pad);
        const local = this.localFromIdentifierOp(argId);
        if (!local.ok) {
            this.locals.set(name, { kind: "i32" });
            return { ok: true, lines: [`${pad}${binding} ${name}: int32 = 0`] };
        }
        if (local.binding.kind !== "i32_array") {
            this.locals.set(name, { kind: "i32" });
            return { ok: true, lines: [`${pad}${binding} ${name}: int32 = 0`] };
        }
        const items = [];
        for (let index = 0; index < local.binding.length; index += 1) {
            items.push(`${local.binding.storageName}[${index}]`);
        }
        this.locals.set(name, { kind: "i32_array", length: local.binding.length, storageName: name });
        return { ok: true, lines: [`${pad}${binding} ${name}: int32[${local.binding.length}] = [${items.join(", ")}]`] };
    }
    emitRuntimeMethodCall(name, op, binding, pad) {
        const callee = stringField(op, "callee");
        if (!callee.ok)
            return undefined;
        const receiverId = op.receiver;
        if (typeof receiverId !== "string")
            return undefined;
        const methodName = callee.value.split(".").pop() ?? "";
        const args = op.arguments;
        const arg0 = args?.[0];
        const arg1 = args?.[1];
        const receiverOp = this.program.opsById.get(receiverId);
        if (receiverOp && receiverOp.function === this.current.id && receiverOp.opKind === "identifier") {
            const receiverName = typeof receiverOp.name === "string" ? receiverOp.name : "";
            const receiverBinding = receiverName ? this.locals.get(receiverName) : undefined;
            if (receiverBinding?.kind === "i32_array" || receiverBinding?.kind === "const_string_array" || receiverBinding?.kind === "jsvalue_array") {
                return undefined;
            }
        }
        if (isChengSourceStringLiteralCall(callee.value) && this.memberCallReceiverKind(op) !== "const_string") {
            const runtimeResult = this.emitRuntimeStringMethodExpr(callee.value, op);
            if (runtimeResult) {
                if (!runtimeResult.ok)
                    return runtimeResult;
                if (runtimeResult.type.kind === "bool") {
                    this.locals.set(name, { kind: "bool" });
                    return { ok: true, lines: [`${pad}${binding} ${name}: bool = ${runtimeResult.text}`] };
                }
                if (runtimeResult.type.kind === "rt_string") {
                    this.locals.set(name, { kind: "rt_string", storageName: name });
                    return { ok: true, lines: [`${pad}${binding} ${name}: int32 = ${runtimeResult.text}`] };
                }
                if (runtimeResult.type.kind === "object_i32") {
                    this.locals.set(name, { kind: "object_i32", properties: new Map(), storageName: name });
                    return { ok: true, lines: [`${pad}${binding} ${name}: int32 = ${runtimeResult.text}`] };
                }
                this.locals.set(name, { kind: "i32" });
                return { ok: true, lines: [`${pad}${binding} ${name}: int32 = ${runtimeResult.text}`] };
            }
        }
        const receiverText = this.emitExprId(receiverId);
        if (!receiverText.ok)
            return receiverText;
        // Map.get(key) / Set.has(key) / String.includes/indexOf/lastIndexOf
        if (methodName === "includes" || methodName === "indexOf" || methodName === "lastIndexOf") {
            // Check receiver type to dispatch correctly
            if (receiverOp && receiverOp.function === this.current.id) {
                if (receiverOp.opKind === "literal" && receiverOp.literalKind === "string")
                    return undefined;
                if (receiverOp.opKind === "identifier") {
                    const recvName = receiverOp.name;
                    const recvBinding = recvName ? this.locals.get(recvName) : undefined;
                    if (recvBinding) {
                        // Compile-time known string/array: let the specific handler deal with it
                        if (recvBinding.kind === "const_string" || recvBinding.kind === "const_string_array" || recvBinding.kind === "i32_array")
                            return undefined;
                        if (recvBinding.kind === "str")
                            return failCompile(`${callee.value} on runtime string receiver requires a production Cheng string runtime provider`);
                    }
                }
            }
            this.needsRuntimeObject = true;
            if (!arg0)
                return failCompile(`${callee.value} requires one argument`);
            const keyExpr = this.emitExprId(arg0);
            if (!keyExpr.ok)
                return keyExpr;
            const keyStr = this.emitKeyAsString(arg0);
            if (keyStr) {
                this.locals.set(name, { kind: "i32" });
                return {
                    ok: true,
                    lines: [`${pad}${binding} ${name}: int32 = __csg_rt_obj_get(${receiverText.text}, ${keyStr})`],
                };
            }
            // Numeric argument: use elem_get to access element by index
            this.locals.set(name, { kind: "i32" });
            return {
                ok: true,
                lines: [`${pad}${binding} ${name}: int32 = __csg_rt_elem_get(${receiverText.text}, ${keyExpr.text})`],
            };
        }
        if (methodName === "at") {
            // Only for non-array-lite receivers (compile-time locals handled by specific handler)
            if (receiverOp && receiverOp.function === this.current.id && receiverOp.opKind === "identifier") {
                const recvName = receiverOp.name;
                const binding = recvName ? this.locals.get(recvName) : undefined;
                if (binding && (binding.kind === "i32_array" || binding.kind === "const_string_array"))
                    return undefined;
            }
            this.needsRuntimeObject = true;
            if (!arg0)
                return failCompile(`${callee.value} requires one argument`);
            const idxExpr = this.emitI32ExprId(arg0);
            if (!idxExpr.ok)
                return undefined;
            this.locals.set(name, { kind: "i32" });
            return {
                ok: true,
                lines: [`${pad}${binding} ${name}: int32 = __csg_rt_elem_get(${receiverText.text}, ${idxExpr.text})`],
            };
        }
        if (methodName === "get" || methodName === "has") {
            this.needsRuntimeObject = true;
            if (!arg0)
                return failCompile(`${callee.value} requires one argument`);
            const keyExpr = this.emitExprId(arg0);
            if (!keyExpr.ok)
                return keyExpr;
            const keyStr = this.emitKeyAsString(arg0);
            if (!keyStr)
                return undefined;
            this.locals.set(name, { kind: "i32" });
            return {
                ok: true,
                lines: [`${pad}${binding} ${name}: int32 = __csg_rt_obj_get(${receiverText.text}, ${keyStr})`],
            };
        }
        // Map.set(key, val) / Set.add(val)
        if (methodName === "set" || methodName === "add") {
            if (!arg0)
                return failCompile(`${callee.value} requires at least one argument`);
            const keyExpr = this.emitKeyAsString(arg0);
            if (!keyExpr)
                return undefined;
            let valText;
            if (methodName === "add") {
                valText = "1";
            }
            else {
                if (!arg1)
                    return failCompile(`${callee.value} requires two arguments`);
                const valExprResult = this.emitExprId(arg1);
                if (!valExprResult.ok)
                    return valExprResult;
                valText = valExprResult.text;
            }
            this.needsRuntimeObject = true;
            return {
                ok: true,
                lines: [`${pad}__csg_rt_obj_set(${receiverText.text}, ${keyExpr}, ${valText})`],
            };
        }
        // .clear()
        if (methodName === "clear") {
            this.needsRuntimeObject = true;
            return {
                ok: true,
                lines: [`${pad}__csg_rt_obj_clear(${receiverText.text})`],
            };
        }
        // .delete(key) → set key to 0
        if (methodName === "delete") {
            if (!arg0)
                return failCompile(`${callee.value} requires one argument`);
            const keyExpr = this.emitKeyAsString(arg0);
            if (!keyExpr)
                return undefined;
            this.needsRuntimeObject = true;
            return {
                ok: true,
                lines: [`${pad}__csg_rt_obj_set(${receiverText.text}, ${keyExpr}, 0)`],
            };
        }
        // String methods on non-const_string receivers (runtime fallback)
        if (isChengSourceStringLiteralCall(callee.value)) {
            // Guard: skip if receiver is a proven const_string (main path handles it at line 765)
            const recvOp = this.program.opsById.get(receiverId);
            if (recvOp && recvOp.function === this.current.id && recvOp.opKind === "identifier") {
                const recvName = recvOp.name;
                const recvBinding = recvName ? this.locals.get(recvName) : undefined;
                if (recvBinding?.kind === "const_string")
                    return undefined;
            }
            const runtimeResult = this.emitRuntimeStringMethodExpr(callee.value, op);
            if (runtimeResult) {
                if (!runtimeResult.ok)
                    return runtimeResult;
                if (runtimeResult.type.kind === "bool") {
                    this.locals.set(name, { kind: "bool" });
                    return { ok: true, lines: [`${pad}${binding} ${name}: bool = ${runtimeResult.text}`] };
                }
                if (runtimeResult.type.kind === "rt_string") {
                    this.locals.set(name, { kind: "rt_string", storageName: name });
                    return { ok: true, lines: [`${pad}${binding} ${name}: int32 = ${runtimeResult.text}`] };
                }
                if (runtimeResult.type.kind === "object_i32") {
                    this.locals.set(name, { kind: "object_i32", properties: new Map(), storageName: name });
                    return { ok: true, lines: [`${pad}${binding} ${name}: int32 = ${runtimeResult.text}`] };
                }
                this.locals.set(name, { kind: "i32" });
                return { ok: true, lines: [`${pad}${binding} ${name}: int32 = ${runtimeResult.text}`] };
            }
            return failCompile(`${callee.value} on runtime string receiver requires a production Cheng string runtime provider`);
        }
        // Generic fallback: only for non-local, non-literal receivers
        return undefined;
    }
    /** Expression-level runtime fallback for method calls on non-local receivers. */
    emitRuntimeMethodExpr(callee, op) {
        const methodName = callee.split(".").pop() ?? "";
        const receiverId = op.receiver;
        if (typeof receiverId !== "string")
            return undefined;
        if (isChengSourceStringLiteralCall(callee)) {
            const runtimeResult = this.emitRuntimeStringMethodExpr(callee, op);
            if (runtimeResult)
                return runtimeResult;
        }
        // Check receiver type for proper dispatch
        let receiverIsString = false;
        let receiverIsConstString = false;
        const recvOp = this.program.opsById.get(receiverId);
        if (recvOp && recvOp.function === this.current.id) {
            if (recvOp.opKind === "literal" && recvOp.literalKind === "string") {
                receiverIsConstString = true;
            }
            if (recvOp.opKind === "identifier") {
                const recvName = recvOp.name;
                const binding = recvName ? this.locals.get(recvName) : undefined;
                if (binding) {
                    if (binding.kind === "i32_array" || binding.kind === "const_string_array")
                        return undefined;
                    if (binding.kind === "const_string")
                        return undefined;
                    if (binding.kind === "str" || binding.kind === "rt_string")
                        receiverIsString = true;
                }
            }
        }
        const args = op.arguments;
        const arg0 = args?.[0];
        const receiverText = this.emitExprId(receiverId);
        if (!receiverText.ok)
            return undefined;
        // .at(index) → __csg_rt_elem_get(receiver, index)
        if (methodName === "at") {
            if (!arg0)
                return undefined;
            if (receiverIsString) {
                return failCompile(`${callee} on runtime string receiver requires a production Cheng string runtime provider`);
            }
            const idxExpr = this.emitI32ExprId(arg0);
            if (!idxExpr.ok)
                return undefined;
            this.needsRuntimeObject = true;
            return { ok: true, text: `__csg_rt_elem_get(${receiverText.text}, ${idxExpr.text})` };
        }
        // .includes(val) → runtime property check by key
        if (methodName === "includes") {
            if (!arg0)
                return undefined;
            if (receiverIsString) {
                return failCompile(`${callee} on runtime string receiver requires a production Cheng string runtime provider`);
            }
            const keyStr = this.emitKeyAsString(arg0);
            if (keyStr) {
                this.needsRuntimeObject = true;
                return { ok: true, text: `__csg_rt_obj_get(${receiverText.text}, ${keyStr})` };
            }
            // Numeric argument: use elem_get to access element by index
            const valExpr = this.emitI32ExprId(arg0);
            if (!valExpr.ok)
                return undefined;
            this.needsRuntimeObject = true;
            return { ok: true, text: `__csg_rt_elem_get(${receiverText.text}, ${valExpr.text})` };
        }
        return undefined;
    }
    emitRuntimeVoidMethodCall(op, pad) {
        const callee = stringField(op, "callee");
        if (!callee.ok)
            return undefined;
        const receiverId = op.receiver;
        if (typeof receiverId !== "string")
            return undefined;
        const methodName = callee.value.split(".").pop() ?? "";
        const receiverText = this.emitExprId(receiverId);
        if (!receiverText.ok)
            return undefined;
        if (methodName === "clear") {
            this.needsRuntimeObject = true;
            return { ok: true, lines: [`${pad}__csg_rt_obj_clear(${receiverText.text})`] };
        }
        if (methodName === "delete") {
            const args = op.arguments;
            if (!args?.[0])
                return undefined;
            const keyStr = this.emitKeyAsString(args[0]);
            if (!keyStr)
                return undefined;
            this.needsRuntimeObject = true;
            return { ok: true, lines: [`${pad}__csg_rt_obj_set(${receiverText.text}, ${keyStr}, 0)`] };
        }
        return undefined;
    }
    emitKeyAsString(opId) {
        const op = this.program.opsById.get(opId);
        if (!op || op.function !== this.current.id)
            return undefined;
        // Try to resolve as string literal
        if (op.opKind === "literal" && op.literalKind === "string") {
            const strVal = literalStringValue(this.program, op);
            if (strVal.ok)
                return JSON.stringify(strVal.value);
        }
        // For identifier referencing a const_string local
        if (op.opKind === "identifier") {
            const name = op.name;
            if (typeof name === "string") {
                const binding = this.locals.get(name);
                if (binding?.kind === "const_string")
                    return JSON.stringify(binding.value);
            }
        }
        return undefined;
    }
    emitConditionalLocal(name, op, binding, pad) {
        const condId = optionalStringField(op, "condition");
        const whenTrueId = optionalStringField(op, "whenTrue");
        const whenFalseId = optionalStringField(op, "whenFalse");
        if (!condId.ok || !whenTrueId.ok || !whenFalseId.ok)
            return failCompile("ternary requires condition, whenTrue, and whenFalse");
        if (!condId.value || !whenTrueId.value || !whenFalseId.value)
            return failCompile("ternary requires valid sub-expressions");
        const condExpr = this.emitExprId(condId.value);
        if (!condExpr.ok)
            return condExpr;
        const trueExpr = this.emitExprId(whenTrueId.value);
        if (!trueExpr.ok)
            return trueExpr;
        const falseExpr = this.emitExprId(whenFalseId.value);
        if (!falseExpr.ok)
            return falseExpr;
        const type = this.inferExprTypeId(whenTrueId.value);
        const chengType = type.ok && type.type.kind === "bool" ? "bool" : type.ok && type.type.kind === "str" ? "str" : "int32";
        this.locals.set(name, { kind: chengType === "bool" ? "bool" : chengType === "str" ? "str" : "i32" });
        const condText = condExpr.text || "0";
        return {
            ok: true,
            lines: [
                `${pad}if ${condText}:`,
                `${pad}    ${binding} ${name}: ${chengType} = ${trueExpr.text}`,
                `${pad}else:`,
                `${pad}    ${binding} ${name}: ${chengType} = ${falseExpr.text}`,
            ],
        };
    }
    emitConditionalReturn(op, returnKind, pad) {
        const condId = optionalStringField(op, "condition");
        const whenTrueId = optionalStringField(op, "whenTrue");
        const whenFalseId = optionalStringField(op, "whenFalse");
        if (!condId.ok || !whenTrueId.ok || !whenFalseId.ok)
            return failCompile("ternary requires condition, whenTrue, and whenFalse");
        if (!condId.value || !whenTrueId.value || !whenFalseId.value)
            return failCompile("ternary requires valid sub-expressions");
        const condExpr = this.emitExprId(condId.value);
        if (!condExpr.ok)
            return condExpr;
        const trueExpr = returnKind === "bool" ? this.emitBoolExprId(whenTrueId.value) :
            returnKind === "rt_string" ? this.emitRuntimeStringHandleExprId(whenTrueId.value) :
                this.emitExprId(whenTrueId.value);
        if (!trueExpr.ok)
            return trueExpr;
        const falseExpr = returnKind === "bool" ? this.emitBoolExprId(whenFalseId.value) :
            returnKind === "rt_string" ? this.emitRuntimeStringHandleExprId(whenFalseId.value) :
                this.emitExprId(whenFalseId.value);
        if (!falseExpr.ok)
            return falseExpr;
        const chengType = returnKind === "bool" ? "bool" : returnKind === "str" ? "str" : "int32";
        const defaultVal = returnKind === "bool" ? "false" : returnKind === "str" ? '""' : "0";
        const tmpVar = `__ternary_${this.tempCounter++}`;
        this.locals.set(tmpVar, { kind: chengType === "bool" ? "bool" : chengType === "str" ? "str" : "i32" });
        return {
            ok: true,
            lines: [
                `${pad}var ${tmpVar}: ${chengType} = ${defaultVal}`,
                `${pad}if ${condExpr.text}:`,
                `${pad}    ${tmpVar} = ${trueExpr.text}`,
                `${pad}else:`,
                `${pad}    ${tmpVar} = ${falseExpr.text}`,
                `${pad}return ${tmpVar}`,
            ],
        };
    }
    emitNullishReturn(op, returnKind, pad) {
        const leftId = stringField(op, "left");
        const rightId = stringField(op, "right");
        if (!leftId.ok)
            return leftId;
        if (!rightId.ok)
            return rightId;
        if (!leftId.value || !rightId.value)
            return failCompile("nullish requires valid operands");
        const leftExpr = returnKind === "rt_string" ? this.emitRuntimeStringHandleExprId(leftId.value) : this.emitExprId(leftId.value);
        if (!leftExpr.ok)
            return leftExpr;
        const rightExpr = returnKind === "bool" ? this.emitBoolExprId(rightId.value) :
            returnKind === "rt_string" ? this.emitRuntimeStringHandleExprId(rightId.value) :
                this.emitExprId(rightId.value);
        if (!rightExpr.ok)
            return rightExpr;
        const defaultVal = returnKind === "bool" ? "false" : returnKind === "str" ? '""' : "0";
        return {
            ok: true,
            lines: [
                `${pad}if ${leftExpr.text} != ${defaultVal}:`,
                `${pad}    return ${leftExpr.text}`,
                `${pad}return ${rightExpr.text}`,
            ],
        };
    }
    emitScalarLocal(name, valueId, binding, pad) {
        const type = this.inferExprTypeId(valueId);
        if (!type.ok)
            return type;
        const supportedScalarLocalKinds = new Set(["i32", "i64", "bool", "str", "rt_string", "const_string", "const_string_array", "i32_array", "object_i32"]);
        if (!supportedScalarLocalKinds.has(type.type.kind)) {
            return failCompile(`local ${name} has unsupported type: ${type.type.kind}`);
        }
        if (type.type.kind === "object_i32") {
            const expr = this.emitExprId(valueId);
            if (!expr.ok)
                return expr;
            this.locals.set(name, { kind: "object_i32", properties: new Map(), storageName: name });
            return { ok: true, lines: [`${pad}${binding} ${name}: int32 = ${expr.text}`] };
        }
        if (type.type.kind === "const_string_array") {
            const expr = this.emitRuntimeConstStringArray(type.type.values);
            if (!expr.ok)
                return expr;
            this.locals.set(name, { kind: "object_i32", properties: new Map(), storageName: name });
            return { ok: true, lines: [`${pad}${binding} ${name}: int32 = ${expr.text}`] };
        }
        if (type.type.kind === "i32_array") {
            const valueOp = this.program.opsById.get(valueId);
            if (valueOp?.opKind === "identifier") {
                const source = this.localFromIdentifierOp(valueId);
                if (!source.ok)
                    return source;
                if (source.binding.kind !== "i32_array")
                    return failCompile(`local ${name} cannot alias non-array value`);
                const aliasBinding = { kind: "i32_array", length: source.binding.length, storageName: source.binding.storageName };
                if (source.binding.frozen !== undefined)
                    aliasBinding.frozen = source.binding.frozen;
                this.locals.set(name, aliasBinding);
                return { ok: true, lines: [] };
            }
            return failCompile(`local ${name} requires an array-specific Cheng emitter`);
        }
        if (type.type.kind === "const_string") {
            const strVal = "value" in type ? type.value : "";
            this.locals.set(name, { kind: "const_string", value: strVal });
            return { ok: true, lines: [] };
        }
        const expr = this.emitExprId(valueId);
        if (!expr.ok)
            return expr;
        if (type.type.kind === "str") {
            this.locals.set(name, { kind: "str" });
            return { ok: true, lines: [`${pad}${binding} ${name}: str = ${expr.text}`] };
        }
        if (type.type.kind === "rt_string") {
            this.locals.set(name, { kind: "rt_string", storageName: name });
            return { ok: true, lines: [`${pad}${binding} ${name}: int32 = ${expr.text}`] };
        }
        if (type.type.kind === "bool") {
            this.locals.set(name, { kind: "bool" });
            return { ok: true, lines: [`${pad}${binding} ${name}: bool = ${expr.text}`] };
        }
        if (type.type.kind === "i64") {
            this.locals.set(name, { kind: "i64" });
            return { ok: true, lines: [`${pad}${binding} ${name}: int64 = ${expr.text}`] };
        }
        this.locals.set(name, { kind: "i32" });
        return { ok: true, lines: [`${pad}${binding} ${name}: int32 = ${expr.text}`] };
    }
    emitObjectLiteralExpr(op) {
        const properties = objectPropertyValues(op);
        if (!properties.ok)
            return properties;
        this.needsRuntimeObject = true;
        const tmpVar = `__obj_${this.tempCounter++}`;
        const propertyLocals = new Map();
        this.locals.set(tmpVar, { kind: "object_i32", properties: propertyLocals, storageName: tmpVar });
        this.preamble.push(`    var ${tmpVar}: int32 = ${this.nextRuntimeObjectId()}`);
        for (const property of properties.value) {
            const hidden = hiddenObjectPropertyName(tmpVar, property.name);
            const validHidden = validateIdentifier(hidden, "object-lite hidden local");
            if (!validHidden.ok)
                return validHidden;
            const localValue = this.emitLocalStoredValueExprId(property.value);
            if (!localValue.ok)
                return localValue;
            const runtimeValue = this.emitRuntimeValueExprId(property.value);
            if (!runtimeValue.ok)
                return runtimeValue;
            const binding = this.runtimeBindingForValueId(property.value, hidden);
            if (!binding.ok)
                return binding;
            this.locals.set(hidden, binding);
            propertyLocals.set(property.name, hidden);
            this.preamble.push(`    var ${hidden}: ${chengStorageTypeForBinding(binding)} = ${localValue.text}`);
            this.preamble.push(`    __csg_rt_obj_set(${tmpVar}, ${JSON.stringify(property.name)}, ${runtimeValue.text})`);
        }
        return { ok: true, text: tmpVar };
    }
    emitObjectLiteralLocal(name, op, binding, pad) {
        const type = this.inferExprType(op);
        if (!type.ok)
            return type;
        if (type.type.kind !== "object_i32")
            return failCompile("object literal local must be int32 object-lite");
        const properties = objectPropertyValues(op);
        if (!properties.ok)
            return properties;
        if (properties.value.length <= 0) {
            this.locals.set(name, { kind: "object_i32", properties: new Map(), storageName: name });
            return { ok: true, lines: [`${pad}${binding} ${name}: int32 = ${this.nextRuntimeObjectId()}`] };
        }
        const propertyLocals = new Map();
        const lines = [`${pad}${binding} ${name}: int32 = ${this.nextRuntimeObjectId()}`];
        for (const property of properties.value) {
            const hidden = hiddenObjectPropertyName(name, property.name);
            const validHidden = validateIdentifier(hidden, "object-lite hidden local");
            if (!validHidden.ok)
                return validHidden;
            if (this.locals.has(hidden))
                return { ok: true, lines: [] };
            const localValue = this.emitLocalStoredValueExprId(property.value);
            if (!localValue.ok)
                return localValue;
            const runtimeValue = this.emitRuntimeValueExprId(property.value);
            if (!runtimeValue.ok)
                return runtimeValue;
            const hiddenBinding = this.runtimeBindingForValueId(property.value, hidden);
            if (!hiddenBinding.ok)
                return hiddenBinding;
            this.locals.set(hidden, hiddenBinding);
            propertyLocals.set(property.name, hidden);
            lines.push(`${pad}${binding} ${hidden}: ${chengStorageTypeForBinding(hiddenBinding)} = ${localValue.text}`);
            lines.push(`${pad}__csg_rt_obj_set(${name}, ${JSON.stringify(property.name)}, ${runtimeValue.text})`);
        }
        this.locals.set(name, { kind: "object_i32", properties: propertyLocals, storageName: name });
        return { ok: true, lines };
    }
    emitObjectFreezeLocal(name, op, binding, pad) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile("Object.freeze requires exactly one array/object-lite argument");
        const argId = args.value[0];
        const argOp = this.program.opsById.get(argId);
        if (!argOp || argOp.function !== this.current.id)
            return failCompile(`unknown Object.freeze argument op: ${argId}`);
        if (argOp.opKind === "array_literal") {
            const rendered = this.emitArrayLiteralLocal(name, argOp, binding, pad);
            if (!rendered.ok)
                return rendered;
            const frozen = this.markFrozenLocal(name);
            if (!frozen.ok)
                return frozen;
            return rendered;
        }
        if (argOp.opKind === "object_literal") {
            const rendered = this.emitObjectLiteralLocal(name, argOp, binding, pad);
            if (!rendered.ok)
                return rendered;
            const frozen = this.markFrozenLocal(name);
            if (!frozen.ok)
                return frozen;
            return rendered;
        }
        const local = this.localFromIdentifierOp(argId);
        if (!local.ok)
            return local;
        if (local.binding.kind === "i32_array" || local.binding.kind === "object_i32") {
            local.binding.frozen = true;
            this.locals.set(name, local.binding);
            return { ok: true, lines: [] };
        }
        return failCompile("Object.freeze requires an array/object-lite argument");
    }
    emitObjectValuesLocal(name, op, binding, pad) {
        const parts = this.objectValuesCallParts("Object.values", op);
        if (!parts.ok)
            return parts;
        if (parts.items.length <= 0) {
            this.locals.set(name, { kind: "i32" });
            return { ok: true, lines: [`${pad}${binding} ${name}: int32 = 0`] };
        }
        this.locals.set(name, { kind: "i32_array", length: parts.items.length, storageName: name });
        return { ok: true, lines: [`${pad}${binding} ${name}: int32[${parts.items.length}] = [${parts.items.join(", ")}]`] };
    }
    emitObjectKeysLocal(name, op, binding) {
        if (binding === "var")
            return failCompile("Object.keys string array result must be const or let");
        if (this.locals.has(name))
            return { ok: true, lines: [] };
        const keys = this.objectKeysCallParts("Object.keys", op);
        if (!keys.ok)
            return keys;
        if (keys.values.length <= 0) {
            this.locals.set(name, { kind: "const_string_array", values: [] });
            return { ok: true, lines: [] };
        }
        this.locals.set(name, { kind: "const_string_array", values: keys.values });
        return { ok: true, lines: [] };
    }
    objectValuesCallParts(callee, op) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one array/object-lite argument`);
        const local = this.localFromIdentifierOp(args.value[0]);
        if (!local.ok)
            return local;
        if (local.binding.kind === "i32_array")
            return { ok: true, items: arrayItemsFromBinding(local.binding) };
        if (local.binding.kind === "object_i32")
            return { ok: true, items: objectValueItemsFromBinding(local.binding) };
        return failCompile(`${callee} requires an array/object-lite argument`);
    }
    objectKeysCallParts(callee, op) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one array/object-lite argument`);
        const local = this.localFromIdentifierOp(args.value[0]);
        if (!local.ok)
            return local;
        if (local.binding.kind === "i32_array") {
            const values = [];
            for (let index = 0; index < local.binding.length; index += 1)
                values.push(String(index));
            return { ok: true, values };
        }
        if (local.binding.kind === "object_i32")
            return { ok: true, values: [...local.binding.properties.keys()] };
        return failCompile(`${callee} requires an array/object-lite argument`);
    }
    emitObjectKeyEntryLengthRead(callee, op) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one array/object-lite argument`);
        const local = this.localFromIdentifierOp(args.value[0]);
        if (!local.ok)
            return local;
        if (local.binding.kind === "i32_array")
            return { ok: true, text: String(local.binding.length) };
        if (local.binding.kind === "object_i32")
            return { ok: true, text: String(local.binding.properties.size) };
        return failCompile(`${callee}.length requires an array/object-lite argument`);
    }
    emitObjectIsFrozenCall(callee, op) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length !== 1)
            return failCompile(`${callee} requires exactly one array/object-lite argument`);
        const local = this.localFromIdentifierOp(args.value[0]);
        if (!local.ok)
            return local;
        if (local.binding.kind !== "i32_array" && local.binding.kind !== "object_i32") {
            return failCompile(`${callee} requires an array/object-lite argument`);
        }
        return { ok: true, text: local.binding.frozen === true ? "true" : "false" };
    }
    markFrozenLocal(name) {
        const local = this.locals.get(name);
        if (!local || (local.kind !== "i32_array" && local.kind !== "object_i32")) {
            return failCompile("Object.freeze requires an array/object-lite argument");
        }
        local.frozen = true;
        return { ok: true };
    }
    emitObjectAssignLocal(name, op, binding, pad) {
        const args = stringArrayField(op, "arguments");
        if (!args.ok)
            return args;
        if (args.value.length < 2)
            return failCompile("Object.assign requires a target and at least one source");
        const merged = new Map();
        const targetOp = this.program.opsById.get(args.value[0]);
        if (!targetOp || targetOp.function !== this.current.id || targetOp.opKind !== "object_literal") {
            return failCompile("Object.assign target must be an object literal in Cheng source object-lite");
        }
        const targetProperties = objectPropertyValues(targetOp);
        if (!targetProperties.ok)
            return targetProperties;
        for (const property of targetProperties.value) {
            const valid = validateIdentifier(sanitizeChengIdentifier(property.name), "object-lite property");
            if (!valid.ok)
                return valid;
            merged.set(property.name, { kind: "expr", value: property.value });
        }
        for (const argId of args.value.slice(1)) {
            const argOp = this.program.opsById.get(argId);
            if (!argOp || argOp.function !== this.current.id)
                return failCompile(`unknown Object.assign argument op: ${argId}`);
            if (argOp.opKind === "object_literal") {
                const properties = objectPropertyValues(argOp);
                if (!properties.ok)
                    return properties;
                for (const property of properties.value) {
                    const valid = validateIdentifier(sanitizeChengIdentifier(property.name), "object-lite property");
                    if (!valid.ok)
                        return valid;
                    merged.set(property.name, { kind: "expr", value: property.value });
                }
                continue;
            }
            const local = this.localFromIdentifierOp(argId);
            if (!local.ok)
                return local;
            if (local.binding.kind !== "object_i32")
                return failCompile("Object.assign sources must be object-lite values");
            for (const [propertyName, hidden] of local.binding.properties) {
                merged.set(propertyName, { kind: "alias", hidden });
            }
        }
        if (merged.size <= 0)
            return failCompile("Object.assign result must have at least one object-lite property");
        const propertyLocals = new Map();
        const lines = [`${pad}${binding} ${name}: int32 = ${this.nextRuntimeObjectId()}`];
        for (const [propertyName, source] of merged) {
            const valid = validateIdentifier(sanitizeChengIdentifier(propertyName), "object-lite property");
            if (!valid.ok)
                return valid;
            if (source.kind === "alias") {
                propertyLocals.set(propertyName, source.hidden);
                const hiddenBinding = this.locals.get(source.hidden);
                const storedValue = hiddenBinding?.kind === "i64" ? `__csg_rt_i64_box(${source.hidden})` : source.hidden;
                lines.push(`${pad}__csg_rt_obj_set(${name}, ${JSON.stringify(propertyName)}, ${storedValue})`);
                continue;
            }
            const hidden = hiddenObjectPropertyName(name, propertyName);
            const validHidden = validateIdentifier(hidden, "object-lite hidden local");
            if (!validHidden.ok)
                return validHidden;
            if (this.locals.has(hidden))
                return { ok: true, lines: [] };
            const localValue = this.emitLocalStoredValueExprId(source.value);
            if (!localValue.ok)
                return localValue;
            const runtimeValue = this.emitRuntimeValueExprId(source.value);
            if (!runtimeValue.ok)
                return runtimeValue;
            const hiddenBinding = this.runtimeBindingForValueId(source.value, hidden);
            if (!hiddenBinding.ok)
                return hiddenBinding;
            this.locals.set(hidden, hiddenBinding);
            propertyLocals.set(propertyName, hidden);
            lines.push(`${pad}${binding} ${hidden}: ${chengStorageTypeForBinding(hiddenBinding)} = ${localValue.text}`);
            lines.push(`${pad}__csg_rt_obj_set(${name}, ${JSON.stringify(propertyName)}, ${runtimeValue.text})`);
        }
        this.locals.set(name, { kind: "object_i32", properties: propertyLocals, storageName: name });
        return { ok: true, lines };
    }
    emitPropertyWrite(op, depth) {
        const operator = stringField(op, "operator");
        const receiver = stringField(op, "receiver");
        const name = stringField(op, "name");
        const value = stringField(op, "value");
        if (!operator.ok)
            return operator;
        if (!receiver.ok)
            return receiver;
        if (!name.ok)
            return name;
        if (!value.ok)
            return value;
        const receiverOp = this.program.opsById.get(receiver.value);
        // Allow non-local receivers — route to runtime object path below
        const isLocalReceiver = receiverOp && receiverOp.function === this.current.id;
        // Non-local receiver — use runtime object path (__csg_rt_obj_set)
        if (!isLocalReceiver) {
            this.needsRuntimeObject = true;
            const objIdExpr = this.emitExprId(receiver.value);
            if (!objIdExpr.ok)
                return objIdExpr;
            const renderedValue = operator.value === "EqualsToken" || operator.value === "FirstAssignment"
                ? this.emitRuntimeValueExprId(value.value)
                : this.emitI32ExprId(value.value);
            if (!renderedValue.ok)
                return renderedValue;
            const propStr = JSON.stringify(name.value);
            return { ok: true, lines: [`${indent(depth)}__csg_rt_obj_set(${objIdExpr.text}, ${propStr}, ${renderedValue.text})`] };
        }
        let receiverName = "";
        if (receiverOp.opKind === "identifier") {
            const nameField = stringField(receiverOp, "name");
            if (!nameField.ok)
                return nameField;
            receiverName = nameField.value;
        }
        else if (receiverOp.opKind === "expression") {
            const exprKind = optionalStringField(receiverOp, "expressionKind");
            if (!exprKind.ok || exprKind.value !== "ThisKeyword") {
                return this.failStmt("property_write receiver must be a local identifier or this");
            }
            receiverName = "this";
        }
        if (!receiverName) {
            this.needsRuntimeObject = true;
            const objIdExpr = this.emitExprId(receiver.value);
            if (!objIdExpr.ok)
                return objIdExpr;
            const renderedValue = operator.value === "EqualsToken" || operator.value === "FirstAssignment"
                ? this.emitRuntimeValueExprId(value.value)
                : this.emitI32ExprId(value.value);
            if (!renderedValue.ok)
                return renderedValue;
            return { ok: true, lines: [`${indent(depth)}__csg_rt_obj_set(${objIdExpr.text}, ${JSON.stringify(name.value)}, ${renderedValue.text})`] };
        }
        let local = this.locals.get(receiverName);
        if (!local)
            return failCompile(`unknown local variable: ${receiverName}`);
        if (local.kind !== "object_i32") {
            if (local.kind !== "i32") {
                return failCompile(`property_write requires object_i32 or i32 local, got ${local.kind}: ${receiverName}`);
            }
            local = { kind: "object_i32", properties: new Map(), storageName: receiverName };
            this.locals.set(receiverName, local);
        }
        let hidden = local.properties.get(name.value);
        if (!hidden) {
            // Create hidden property on first write
            hidden = hiddenObjectPropertyName(receiverName, name.value);
            const validHidden = validateIdentifier(hidden, "object-lite hidden local");
            if (!validHidden.ok)
                return validHidden;
            const hiddenBinding = this.runtimeBindingForValueId(value.value, hidden);
            if (!hiddenBinding.ok)
                return hiddenBinding;
            this.locals.set(hidden, hiddenBinding);
            local.properties.set(name.value, hidden);
        }
        const pad = indent(depth);
        if (operator.value === "EqualsToken" || operator.value === "FirstAssignment") {
            const localValue = this.emitLocalStoredValueExprId(value.value);
            if (!localValue.ok)
                return localValue;
            const runtimeValue = this.emitRuntimeValueExprId(value.value);
            if (!runtimeValue.ok)
                return runtimeValue;
            const hiddenBinding = this.runtimeBindingForValueId(value.value, hidden);
            if (!hiddenBinding.ok)
                return hiddenBinding;
            this.locals.set(hidden, hiddenBinding);
            return { ok: true, lines: [
                    `${pad}${hidden} = ${localValue.text}`,
                    `${pad}__csg_rt_obj_set(${local.storageName}, ${JSON.stringify(name.value)}, ${runtimeValue.text})`,
                ] };
        }
        const chengOp = compoundOperatorToCheng(operator.value);
        if (!chengOp)
            return failCompile(`unsupported compound assignment operator: ${operator.value}`);
        const renderedValue = this.emitI32ExprId(value.value);
        if (!renderedValue.ok)
            return renderedValue;
        return { ok: true, lines: [
                `${pad}${hidden} = ${hidden} ${chengOp} ${renderedValue.text}`,
                `${pad}__csg_rt_obj_set(${local.storageName}, ${JSON.stringify(name.value)}, ${hidden})`,
            ] };
    }
    emitElementRead(op) {
        const receiver = stringField(op, "receiver");
        const argument = optionalStringField(op, "argument");
        if (!receiver.ok)
            return receiver;
        if (!argument.ok)
            return argument;
        if (!argument.value)
            return failCompile("array element read requires an index");
        const receiverOp = this.program.opsById.get(receiver.value);
        if (!receiverOp || receiverOp.opKind !== "identifier") {
            // Non-local receiver — use runtime element read
            this.needsRuntimeObject = true;
            const objIdExpr = this.emitExprId(receiver.value);
            if (!objIdExpr.ok)
                return objIdExpr;
            const idxExpr = this.emitExprId(argument.value);
            if (!idxExpr.ok)
                return idxExpr;
            return { ok: true, text: `__csg_rt_elem_get(${objIdExpr.text}, ${idxExpr.text})` };
        }
        const local = this.localFromIdentifierOp(receiver.value);
        if (!local.ok)
            return local;
        if (local.binding.kind === "i32_array") {
            const index = this.literalInt32Value(argument.value);
            if (!index.ok)
                return index;
            if (index.value < 0 || index.value >= local.binding.length) {
                return failCompile(`array element index out of bounds: ${index.value}`);
            }
            return { ok: true, text: `${local.binding.storageName}[${index.value}]` };
        }
        if (local.binding.kind === "const_string_array") {
            const index = this.literalInt32Value(argument.value);
            if (!index.ok)
                return index;
            if (index.value < 0 || index.value >= local.binding.values.length) {
                return failCompile(`string array element index out of bounds: ${index.value}`);
            }
            const element = local.binding.values[index.value];
            const encoded = JSON.stringify(element);
            return { ok: true, text: encoded };
        }
        if (local.binding.kind === "str" || local.binding.kind === "rt_string" || local.binding.kind === "const_string") {
            const index = this.emitI32ExprId(argument.value);
            if (!index.ok)
                return index;
            const receiverHandle = local.binding.kind === "rt_string"
                ? { ok: true, text: this.emitIdentifierText(local.name, local.binding) }
                : local.binding.kind === "const_string"
                    ? { ok: true, text: `__csg_rt_str_intern(${JSON.stringify(local.binding.value)})` }
                    : this.emitRuntimeStringHandleExprId(receiver.value);
            if (!receiverHandle.ok)
                return receiverHandle;
            this.needsRuntimeString = true;
            return { ok: true, text: `__csg_rt_str_char_at(${receiverHandle.text}, ${index.text})` };
        }
        if (local.binding.kind === "object_i32") {
            const propertyName = this.literalPropertyName(argument.value);
            if (!propertyName.ok) {
                const idxExpr = this.emitExprId(argument.value);
                if (!idxExpr.ok)
                    return idxExpr;
                this.needsRuntimeObject = true;
                return { ok: true, text: `__csg_rt_elem_get(${local.binding.storageName}, ${idxExpr.text})` };
            }
            const hidden = local.binding.properties.get(propertyName.value);
            if (!hidden) {
                if (/^-?\d+$/.test(propertyName.value)) {
                    this.needsRuntimeObject = true;
                    return { ok: true, text: `__csg_rt_elem_get(${local.binding.storageName}, ${propertyName.value})` };
                }
                this.needsRuntimeObject = true;
                return { ok: true, text: `__csg_rt_obj_get(${local.binding.storageName}, ${JSON.stringify(propertyName.value)})` };
            }
            return { ok: true, text: hidden };
        }
        // Non-array/object local — fall back to runtime element read via preamble
        this.needsRuntimeObject = true;
        const idxExpr = this.emitExprId(argument.value);
        if (!idxExpr.ok)
            return idxExpr;
        const tempVar = `__elem_${this.tempCounter++}`;
        this.locals.set(tempVar, { kind: "i32" });
        const recvText = local.binding.storageName ?? local.name;
        this.preamble.push(`    var ${tempVar}: int32 = ${recvText}`);
        return { ok: true, text: `__csg_rt_elem_get(${tempVar}, ${idxExpr.text})` };
    }
    runtimePropertyReadType(op) {
        const resultType = optionalStringField(op, "resultType");
        if (!resultType.ok || !resultType.value)
            return undefined;
        const name = optionalStringField(op, "name");
        if (name.ok && name.value && resultType.value === "number" && this.i64PropertyNames.has(name.value)) {
            return { kind: "i64" };
        }
        return typeFromTsTypeText(resultType.value);
    }
    formatRuntimePropertyRead(op, rawText) {
        const type = this.runtimePropertyReadType(op);
        if (type?.kind === "bool")
            return `(${rawText} != 0)`;
        if (type?.kind === "i64")
            return `__csg_rt_i64_unbox(${rawText})`;
        return rawText;
    }
    emitPropertyRead(op) {
        const receiver = stringField(op, "receiver");
        const name = stringField(op, "name");
        if (!receiver.ok)
            return receiver;
        if (!name.ok)
            return name;
        const receiverOp = this.program.opsById.get(receiver.value);
        if (name.value === "length" && receiverOp?.function === this.current.id && receiverOp.opKind === "call") {
            const callee = stringField(receiverOp, "callee");
            if (!callee.ok)
                return callee;
            if (isChengSourceArrayFilterCall(callee.value)) {
                const filterResult = this.emitArrayFilterLengthRead(callee.value, receiverOp);
                if (filterResult.ok)
                    return filterResult;
                return filterResult;
            }
            if (isChengSourceArrayJoinCall(callee.value))
                return this.emitArrayJoinLengthRead(callee.value, receiverOp);
            if (isChengSourceObjectKeyEntryCall(callee.value))
                return this.emitObjectKeyEntryLengthRead(callee.value, receiverOp);
            if (isChengSourceStringConvertCall(callee.value))
                return this.emitStringConvertLengthRead(callee.value, receiverOp);
            if (isChengSourceStringSplitCall(callee.value))
                return this.emitStringSplitLengthRead(callee.value, receiverOp);
        }
        if (!receiverOp || receiverOp.function !== this.current.id) {
            // Non-local receiver — emit to temp var via preamble
            this.needsRuntimeObject = true;
            const recvExpr = this.emitExprId(receiver.value);
            if (!recvExpr.ok)
                return recvExpr;
            const tempVar = `__recv_${this.tempCounter++}`;
            this.locals.set(tempVar, { kind: "i32" });
            this.preamble.push(`    var ${tempVar}: int32 = ${recvExpr.text}`);
            return { ok: true, text: this.formatRuntimePropertyRead(op, `__csg_rt_obj_get(${tempVar}, ${JSON.stringify(name.value)})`) };
        }
        let receiverName;
        if (receiverOp.opKind === "identifier") {
            const local = this.localFromIdentifierOp(receiver.value);
            if (!local.ok)
                return local;
            const binding = this.locals.get(local.name);
            if (!binding)
                return failCompile(`unknown local variable: ${local.name}`);
            if (binding.kind === "i32_array" && name.value === "length") {
                return { ok: true, text: String(binding.length) };
            }
            if (binding.kind === "const_string_array" && name.value === "length") {
                return { ok: true, text: String(binding.values.length) };
            }
            if (binding.kind === "const_string" && name.value === "length") {
                return { ok: true, text: String(binding.value.length) };
            }
            if ((binding.kind === "str" || binding.kind === "rt_string") && name.value === "length") {
                const receiverHandle = binding.kind === "rt_string"
                    ? { ok: true, text: this.emitIdentifierText(local.name, binding) }
                    : this.emitRuntimeStringHandleExprId(receiver.value);
                if (!receiverHandle.ok)
                    return receiverHandle;
                this.needsRuntimeString = true;
                return { ok: true, text: `__csg_rt_str_len(${receiverHandle.text})` };
            }
            if (binding.kind === "object_i32") {
                const hidden = binding.properties.get(name.value);
                if (!hidden) {
                    this.needsRuntimeObject = true;
                    return { ok: true, text: this.formatRuntimePropertyRead(op, `__csg_rt_obj_get(${local.name}, ${JSON.stringify(name.value)})`) };
                }
                return this.registerNestedFromPropertyRead(op, hidden);
            }
            // Runtime fallback for property read on known local with unknown property
            this.needsRuntimeObject = true;
            return { ok: true, text: this.formatRuntimePropertyRead(op, `__csg_rt_obj_get(${local.name}, ${JSON.stringify(name.value)})`) };
        }
        if (receiverOp.opKind === "expression") {
            const exprKind = optionalStringField(receiverOp, "expressionKind");
            if (!exprKind.ok || exprKind.value !== "ThisKeyword") {
                // Non-local expression receiver — emit to temp var via preamble
                this.needsRuntimeObject = true;
                const recvExpr = this.emitExprId(receiver.value);
                if (!recvExpr.ok)
                    return recvExpr;
                const tempVar = `__recv_${this.tempCounter++}`;
                this.locals.set(tempVar, { kind: "i32" });
                this.preamble.push(`    var ${tempVar}: int32 = ${recvExpr.text}`);
                return { ok: true, text: this.formatRuntimePropertyRead(op, `__csg_rt_obj_get(${tempVar}, ${JSON.stringify(name.value)})`) };
            }
            receiverName = "this";
        }
        else if (receiverOp.opKind === "property_read") {
            // Chain: a.b.c — resolve inner a.b, then look up .c via runtime
            const innerResult = this.emitPropertyRead(receiverOp);
            if (!innerResult.ok)
                return innerResult;
            const innerBinding = this.locals.get(innerResult.text);
            if (innerBinding?.kind === "object_i32") {
                const hidden = innerBinding.properties.get(name.value);
                if (hidden)
                    return this.registerNestedFromPropertyRead(op, hidden);
            }
            // Fall through to runtime path
            this.needsRuntimeObject = true;
            const propStr = JSON.stringify(name.value);
            return { ok: true, text: this.formatRuntimePropertyRead(op, `__csg_rt_obj_get(${innerResult.text}, ${propStr})`) };
        }
        else {
            // Non-local receiver — use runtime object path
            this.needsRuntimeObject = true;
            const objIdExpr = this.emitExprId(receiver.value);
            if (!objIdExpr.ok)
                return objIdExpr;
            const propStr = JSON.stringify(name.value);
            return { ok: true, text: this.formatRuntimePropertyRead(op, `__csg_rt_obj_get(${objIdExpr.text}, ${propStr})`) };
        }
        const binding = this.locals.get(receiverName);
        if (!binding)
            return failCompile(`unknown local variable: ${receiverName}`);
        if (binding.kind !== "object_i32")
            return failCompile(`property read on ${receiverName} requires object_i32, got ${binding.kind}`);
        const hidden = binding.properties.get(name.value);
        if (!hidden) {
            this.needsRuntimeObject = true;
            return { ok: true, text: this.formatRuntimePropertyRead(op, `__csg_rt_obj_get(${receiverName}, ${JSON.stringify(name.value)})`) };
        }
        return this.registerNestedFromPropertyRead(op, hidden);
    }
    registerNestedFromPropertyRead(op, hidden) {
        const resultProperties = op.resultProperties;
        if (resultProperties && resultProperties.length > 0 && !this.locals.has(hidden)) {
            const nestedProps = new Map();
            for (const propName of resultProperties) {
                const nestedHidden = hiddenObjectPropertyName(hidden, propName);
                const validHidden = validateIdentifier(nestedHidden, "nested object-lite hidden local");
                if (!validHidden.ok)
                    return validHidden;
                this.locals.set(nestedHidden, { kind: "i32" });
                nestedProps.set(propName, nestedHidden);
            }
            this.locals.set(hidden, { kind: "object_i32", properties: nestedProps, storageName: hidden });
        }
        return { ok: true, text: hidden };
    }
    typeFromLocalBinding(binding) {
        if (binding.kind === "object_i32")
            return { kind: "object_i32", propertyNames: [...binding.properties.keys()].sort() };
        if (binding.kind === "i32_array")
            return { kind: "i32_array", length: binding.length };
        if (binding.kind === "const_string_array")
            return { kind: "const_string_array", values: binding.values };
        if (binding.kind === "jsvalue_array")
            return { kind: "jsvalue_array", values: binding.values };
        if (binding.kind === "const_string")
            return { kind: "const_string", value: binding.value };
        if (binding.kind === "function_ref")
            return { kind: "i32" };
        return { kind: binding.kind };
    }
    inferPropertyReadType(op) {
        const runtimeType = this.runtimePropertyReadType(op);
        if (runtimeType)
            return { ok: true, type: runtimeType };
        const receiver = stringField(op, "receiver");
        const name = stringField(op, "name");
        if (!receiver.ok)
            return receiver;
        if (!name.ok)
            return name;
        const receiverOp = this.program.opsById.get(receiver.value);
        if (!receiverOp || receiverOp.function !== this.current.id)
            return { ok: true, type: { kind: "i32" } };
        if (receiverOp.opKind === "identifier") {
            const local = this.localFromIdentifierOp(receiver.value);
            if (!local.ok)
                return local;
            if ((local.binding.kind === "str" || local.binding.kind === "rt_string" || local.binding.kind === "const_string") && name.value === "length") {
                return { ok: true, type: { kind: "i32" } };
            }
            if (local.binding.kind === "object_i32") {
                const hidden = local.binding.properties.get(name.value);
                if (!hidden)
                    return { ok: true, type: { kind: "i32" } };
                const hiddenBinding = this.locals.get(hidden);
                if (!hiddenBinding)
                    return { ok: true, type: { kind: "i32" } };
                return { ok: true, type: this.typeFromLocalBinding(hiddenBinding) };
            }
        }
        return { ok: true, type: { kind: "i32" } };
    }
    inferExprTypeId(id) {
        const op = this.program.opsById.get(id);
        if (!op || op.function !== this.current.id)
            return failCompile(`unknown expression op: ${id}`);
        return this.inferExprType(op);
    }
    inferExprType(op) {
        if (op.opKind === "literal") {
            if (op.literalKind === "number") {
                const value = literalNumberValue(this.program, op);
                if (!value.ok)
                    return value;
                if (!Number.isInteger(value.value))
                    return { ok: true, type: { kind: "i32" } };
                const checked = int32Literal(value.value);
                if (!checked.ok)
                    return checked;
                return { ok: true, type: { kind: "i32" } };
            }
            if (op.literalKind === "boolean")
                return { ok: true, type: { kind: "bool" } };
            if (op.literalKind === "string") {
                const value = literalStringValue(this.program, op);
                if (!value.ok)
                    return value;
                return { ok: true, type: { kind: "const_string", value: value.value } };
            }
            if (op.literalKind === "null" || op.literalKind === "regex")
                return { ok: true, type: { kind: "i32" } };
            return failCompile("only int32 and boolean literals are supported by Cheng source");
        }
        if (op.opKind === "identifier") {
            const name = stringField(op, "name");
            if (!name.ok)
                return name;
            if (name.value === "undefined")
                return { ok: true, type: { kind: "i32" } };
            const binding = this.locals.get(name.value);
            if (!binding)
                return failCompile(`unknown local variable: ${name.value}`);
            return { ok: true, type: this.typeFromLocalBinding(binding) };
        }
        if (op.opKind === "binary") {
            const operator = stringField(op, "operator");
            const leftId = stringField(op, "left");
            const rightId = stringField(op, "right");
            if (!operator.ok)
                return operator;
            if (!leftId.ok)
                return leftId;
            if (!rightId.ok)
                return rightId;
            if (operator.value === "QuestionQuestionToken" || operator.value === "CommaToken") {
                return { ok: true, type: { kind: "i32" } };
            }
            const leftType = this.inferExprTypeId(leftId.value);
            if (!leftType.ok)
                return leftType;
            const rightType = this.inferExprTypeId(rightId.value);
            if (!rightType.ok)
                return rightType;
            const leftStringish = leftType.type.kind === "str" || leftType.type.kind === "const_string" || leftType.type.kind === "rt_string";
            const rightStringish = rightType.type.kind === "str" || rightType.type.kind === "const_string" || rightType.type.kind === "rt_string";
            if (operator.value === "PlusToken" && (leftStringish || rightStringish)) {
                const validConcatKinds = new Set(["i32", "bool", "str", "const_string", "rt_string"]);
                if (!validConcatKinds.has(leftType.type.kind) || !validConcatKinds.has(rightType.type.kind)) {
                    return failCompile(`unsupported string concat operand types for Cheng source: ${leftType.type.kind}, ${rightType.type.kind}`);
                }
                return { ok: true, type: { kind: "rt_string" } };
            }
            const resultType = binaryOperatorResult(operator.value);
            if (!resultType.ok)
                return resultType;
            const leftNumeric64 = leftType.type.kind === "i64" || leftType.type.kind === "i32";
            const rightNumeric64 = rightType.type.kind === "i64" || rightType.type.kind === "i32";
            if ((leftType.type.kind === "i64" || rightType.type.kind === "i64") && leftNumeric64 && rightNumeric64) {
                if (resultType.type.kind === "bool")
                    return { ok: true, type: resultType.type };
                return { ok: true, type: { kind: "i64" } };
            }
            const validKinds = new Set(["i32", "str", "rt_string", "bool", "const_string", "object_i32"]);
            if (!validKinds.has(leftType.type.kind) || !validKinds.has(rightType.type.kind)) {
                return failCompile(`unsupported binary operand types for Cheng source: ${leftType.type.kind} ${operator.value} ${rightType.type.kind}`);
            }
            return { ok: true, type: resultType.type };
        }
        if (op.opKind === "call") {
            const callee = stringField(op, "callee");
            if (!callee.ok)
                return { ok: true, type: { kind: "i32" } };
            if (isChengSourceDateCall(callee.value))
                return { ok: true, type: { kind: "i64" } };
            if (isChengSourceI32MathCall(callee.value))
                return { ok: true, type: { kind: "i32" } };
            if (isChengSourceI32NumberPredicateCall(callee.value)) {
                const args = stringArrayField(op, "arguments");
                if (!args.ok)
                    return args;
                if (args.value.length !== 1)
                    return failCompile(`${callee.value} requires exactly one int32 argument`);
                const arg = this.validatePureI32ExprId(args.value[0]);
                if (!arg.ok)
                    return { ok: true, type: { kind: "bool" } };
                return { ok: true, type: { kind: "bool" } };
            }
            if (isChengSourceNumberConvertCall(callee.value)) {
                const args = stringArrayField(op, "arguments");
                if (!args.ok)
                    return args;
                if (args.value.length !== 1)
                    return failCompile(`${callee.value} requires exactly one int32 or bool argument`);
                const arg = this.inferExprTypeId(args.value[0]);
                if (!arg.ok)
                    return arg;
                if (arg.type.kind !== "i32" && arg.type.kind !== "bool")
                    return failCompile(`${callee.value} requires an int32 or bool argument`);
                return { ok: true, type: { kind: "i32" } };
            }
            if (isChengSourceConsoleCall(callee.value))
                return { ok: true, type: { kind: "i32" } };
            if (isChengSourceTimerCall(callee.value))
                return { ok: true, type: { kind: "i32" } };
            if (isChengSourceProcessCall(callee.value))
                return { ok: true, type: { kind: "i32" } };
            if (isChengSourceBooleanCall(callee.value)) {
                const args = stringArrayField(op, "arguments");
                if (!args.ok)
                    return args;
                if (args.value.length !== 1)
                    return failCompile(`${callee.value} requires exactly one int32 or bool argument`);
                const arg = this.inferExprTypeId(args.value[0]);
                if (!arg.ok)
                    return arg;
                if (arg.type.kind !== "i32" && arg.type.kind !== "bool")
                    return failCompile(`${callee.value} requires an int32 or bool argument`);
                return { ok: true, type: { kind: "bool" } };
            }
            if (isChengSourceStringConvertCall(callee.value)) {
                const arg = this.stringConvertArgument(callee.value, op);
                if (!arg.ok)
                    return arg;
                if (arg.kind === "rt_string")
                    return { ok: true, type: { kind: "rt_string" } };
                return { ok: true, type: { kind: "str" } };
            }
            if (isChengSourceArrayTypePredicateCall(callee.value)) {
                const args = stringArrayField(op, "arguments");
                if (!args.ok)
                    return args;
                if (args.value.length !== 1)
                    return failCompile(`${callee.value} requires exactly one array-lite argument`);
                const argId = args.value[0];
                const arg = this.localFromIdentifierOp(argId);
                if (!arg.ok || arg.binding.kind !== "i32_array") {
                    // Non-proven argument: accept if it's an array literal, else fall back to bool type
                    const argOp = this.program.opsById.get(argId);
                    if (argOp && argOp.function === this.current.id && argOp.opKind === "array_literal") {
                        return { ok: true, type: { kind: "bool" } };
                    }
                    return { ok: true, type: { kind: "bool" } };
                }
                return { ok: true, type: { kind: "bool" } };
            }
            if (isChengSourceStringLiteralCall(callee.value) && this.memberCallReceiverKind(op) === "const_string") {
                const result = this.evaluateStringLiteralMethod(callee.value, op);
                if (!result.ok)
                    return result;
                return { ok: true, type: result.type };
            }
            if (isChengSourceStringLiteralCall(callee.value)) {
                const runtimeType = this.inferRuntimeStringMethodType(callee.value, op);
                if (runtimeType)
                    return runtimeType;
            }
            if (isChengSourceArrayFromCall(callee.value)) {
                const args = stringArrayField(op, "arguments");
                if (!args.ok)
                    return args;
                if (args.value.length !== 1)
                    return failCompile(`${callee.value} requires exactly one array-lite argument`);
                const arg = this.inferExprTypeId(args.value[0]);
                if (!arg.ok)
                    return arg;
                if (arg.type.kind !== "i32_array")
                    return failCompile(`${callee.value} requires an array-lite argument`);
                return { ok: true, type: arg.type };
            }
            if (isChengSourceArrayIncludesCall(callee.value)) {
                const receiver = this.localBindingFromMemberCall(op, "includes", callee.value);
                if (receiver.ok && receiver.binding.kind === "i32_array") {
                    const args = stringArrayField(op, "arguments");
                    if (!args.ok)
                        return args;
                    if (args.value.length !== 1)
                        return failCompile(`${callee.value} requires exactly one int32 argument`);
                    const arg = this.validatePureI32ExprId(args.value[0]);
                    if (!arg.ok)
                        return arg;
                    return { ok: true, type: { kind: "bool" } };
                }
                // Non-local receiver: return bool anyway
                return { ok: true, type: { kind: "bool" } };
            }
            if (isChengSourceArrayAtCall(callee.value)) {
                const parts = this.arrayAtCallParts(callee.value, op);
                if (parts.ok)
                    return { ok: true, type: { kind: "i32" } };
                return parts;
            }
            if (isChengSourceArrayIndexOfCall(callee.value)) {
                const member = callee.value.endsWith(".lastIndexOf") ? "lastIndexOf" : "indexOf";
                const receiver = this.localBindingFromMemberCall(op, member, callee.value);
                if (receiver.ok && receiver.binding.kind === "i32_array") {
                    const args = stringArrayField(op, "arguments");
                    if (!args.ok)
                        return args;
                    if (args.value.length !== 1)
                        return failCompile(`${callee.value} requires exactly one int32 argument`);
                    const arg = this.validatePureI32ExprId(args.value[0]);
                    if (!arg.ok)
                        return arg;
                    return { ok: true, type: { kind: "i32" } };
                }
                return failCompile(`${callee.value} requires an array-lite receiver`);
            }
            if (isChengSourceArrayFindIndexCall(callee.value)) {
                const parts = this.arrayFindIndexCallParts(callee.value, op);
                if (parts.ok)
                    return { ok: true, type: { kind: "i32" } };
                return parts;
            }
            if (isChengSourceArrayFindCall(callee.value)) {
                const parts = this.arrayFindCallParts(callee.value, op);
                if (parts.ok)
                    return { ok: true, type: { kind: "i32" } };
                return parts;
            }
            if (isChengSourceArrayJoinCall(callee.value)) {
                const joined = this.arrayJoinValue(callee.value, op);
                if (!joined.ok)
                    return joined;
                return { ok: true, type: { kind: "const_string", value: joined.value } };
            }
            if (isChengSourceArrayPredicateCall(callee.value)) {
                const member = callee.value.endsWith(".every") ? "every" : "some";
                const receiver = this.localBindingFromMemberCall(op, member, callee.value);
                if (receiver.ok && receiver.binding.kind === "jsvalue_array") {
                    const checks = this.jsValueArrayPredicateChecks(callee.value, op, receiver.binding.values);
                    if (!checks.ok)
                        return checks;
                    return { ok: true, type: { kind: "bool" } };
                }
                const inline = this.inlineI32ArrayPredicateChecks(callee.value, op, member);
                if (inline.ok)
                    return { ok: true, type: { kind: "bool" } };
                const parts = this.arrayPredicateCallParts(callee.value, op, member);
                if (!parts.ok)
                    return parts;
                return { ok: true, type: { kind: "bool" } };
            }
            if (isChengSourceArrayFilterCall(callee.value)) {
                const parts = this.arrayFilterCallParts(callee.value, op);
                if (!parts.ok)
                    return parts;
                return failCompile(`${callee.value} is only supported through .length projection`);
            }
            if (isChengSourceArrayReduceCall(callee.value)) {
                const parts = this.arrayReduceCallParts(callee.value, op);
                if (!parts.ok)
                    return parts;
                return { ok: true, type: { kind: "i32" } };
            }
            if (isChengSourceArrayMapCall(callee.value)) {
                const parts = this.arrayMapCallParts(callee.value, op);
                if (!parts.ok)
                    return parts;
                return { ok: true, type: { kind: "i32_array", length: parts.receiver.binding.length } };
            }
            if (isChengSourceArraySliceCall(callee.value)) {
                const parts = this.arraySliceCallParts(callee.value, op);
                if (!parts.ok)
                    return parts;
                return { ok: true, type: { kind: "i32_array", length: parts.indexes.length } };
            }
            if (isChengSourceArrayConcatCall(callee.value)) {
                const parts = this.arrayConcatCallParts(callee.value, op);
                if (!parts.ok)
                    return parts;
                return { ok: true, type: { kind: "i32_array", length: parts.items.length } };
            }
            if (isChengSourceArrayReverseCall(callee.value)) {
                const parts = this.arrayReverseCallParts(callee.value, op);
                if (!parts.ok)
                    return parts;
                return { ok: true, type: { kind: "i32_array", length: parts.items.length } };
            }
            if (isChengSourceArraySortCall(callee.value)) {
                const parts = this.arraySortCallParts(callee.value, op);
                if (!parts.ok)
                    return parts;
                return { ok: true, type: { kind: "i32_array", length: parts.items.length } };
            }
            if (isChengSourceArrayPushCall(callee.value)) {
                const parts = this.arrayPushCallParts(callee.value, op);
                if (!parts.ok)
                    return parts;
                return { ok: true, type: { kind: "i32" } };
            }
            if (isChengSourceArrayPopCall(callee.value)) {
                const parts = this.arrayPopCallParts(callee.value, op);
                if (!parts.ok)
                    return parts;
                return { ok: true, type: { kind: "i32" } };
            }
            if (isChengSourceArrayShiftCall(callee.value)) {
                const parts = this.arrayShiftCallParts(callee.value, op);
                if (!parts.ok)
                    return parts;
                return { ok: true, type: { kind: "i32" } };
            }
            if (isChengSourceArrayUnshiftCall(callee.value)) {
                const parts = this.arrayUnshiftCallParts(callee.value, op);
                if (!parts.ok)
                    return parts;
                return { ok: true, type: { kind: "i32" } };
            }
            if (isChengSourceArrayFillCall(callee.value)) {
                const parts = this.arrayFillCallParts(callee.value, op);
                if (!parts.ok)
                    return parts;
                return { ok: true, type: { kind: "i32_array", length: parts.receiver.binding.length } };
            }
            if (isChengSourceStringLiteralCall(callee.value)) {
                // Try compile-time evaluation first (works for literal string and const_string receivers)
                const typeResult = this.evaluateStringLiteralMethod(callee.value, op);
                if (typeResult.ok)
                    return { ok: true, type: typeResult.type };
                // Compile-time evaluation failed — check if receiver is a string literal (real error)
                const receiverId = op.receiver;
                const receiverOp = typeof receiverId === "string" ? this.program.opsById.get(receiverId) : undefined;
                if (receiverOp && receiverOp.function === this.current.id && receiverOp.opKind === "literal" && receiverOp.literalKind === "string") {
                    return typeResult;
                }
                const runtimeType = this.inferRuntimeStringMethodType(callee.value, op);
                if (runtimeType) {
                    if (!runtimeType.ok)
                        return runtimeType;
                    return runtimeType;
                }
                return failCompile(`${callee.value} on runtime string receiver requires a production Cheng string runtime provider`);
            }
            if (isChengSourceObjectFreezeCall(callee.value)) {
                const args = stringArrayField(op, "arguments");
                if (!args.ok)
                    return args;
                if (args.value.length !== 1)
                    return failCompile(`${callee.value} requires exactly one array/object-lite argument`);
                const arg = this.inferExprTypeId(args.value[0]);
                if (!arg.ok)
                    return arg;
                if (arg.type.kind !== "i32_array" && arg.type.kind !== "object_i32") {
                    return failCompile(`${callee.value} requires an array/object-lite argument`);
                }
                return { ok: true, type: arg.type };
            }
            if (isChengSourceObjectAssignCall(callee.value)) {
                const args = stringArrayField(op, "arguments");
                if (!args.ok)
                    return args;
                if (args.value.length < 2)
                    return failCompile(`${callee.value} requires a target and at least one source`);
                const targetOp = this.program.opsById.get(args.value[0]);
                if (!targetOp || targetOp.function !== this.current.id || targetOp.opKind !== "object_literal") {
                    return failCompile(`${callee.value} target must be an object literal`);
                }
                const seen = new Set();
                const targetProperties = objectPropertyValues(targetOp);
                if (!targetProperties.ok)
                    return targetProperties;
                for (const property of targetProperties.value) {
                    const valid = validateIdentifier(sanitizeChengIdentifier(property.name), "object-lite property");
                    if (!valid.ok)
                        return valid;
                    const valueType = this.inferExprTypeId(property.value);
                    if (!valueType.ok)
                        return valueType;
                    if (valueType.type.kind !== "i32")
                        return failCompile(`${callee.value} properties must be int32`);
                    seen.add(property.name);
                }
                for (const argId of args.value.slice(1)) {
                    const argOp = this.program.opsById.get(argId);
                    if (!argOp || argOp.function !== this.current.id)
                        return failCompile(`unknown ${callee.value} argument op: ${argId}`);
                    if (argOp.opKind === "object_literal") {
                        const properties = objectPropertyValues(argOp);
                        if (!properties.ok)
                            return properties;
                        for (const property of properties.value) {
                            const valid = validateIdentifier(sanitizeChengIdentifier(property.name), "object-lite property");
                            if (!valid.ok)
                                return valid;
                            const valueType = this.inferExprTypeId(property.value);
                            if (!valueType.ok)
                                return valueType;
                            if (valueType.type.kind !== "i32")
                                return failCompile(`${callee.value} properties must be int32`);
                            seen.add(property.name);
                        }
                        continue;
                    }
                    const local = this.localFromIdentifierOp(argId);
                    if (!local.ok)
                        return local;
                    if (local.binding.kind !== "object_i32")
                        return failCompile(`${callee.value} sources must be object-lite values`);
                    for (const propertyName of local.binding.properties.keys())
                        seen.add(propertyName);
                }
                if (seen.size <= 0)
                    return failCompile(`${callee.value} result must have at least one object-lite property`);
                return { ok: true, type: { kind: "object_i32", propertyNames: [...seen].sort() } };
            }
            if (isChengSourceObjectValuesCall(callee.value)) {
                const parts = this.objectValuesCallParts(callee.value, op);
                if (!parts.ok)
                    return parts;
                return { ok: true, type: { kind: "i32_array", length: parts.items.length } };
            }
            if (isChengSourceObjectKeyEntryCall(callee.value)) {
                if (callee.value === "Object.keys") {
                    const keys = this.objectKeysCallParts(callee.value, op);
                    if (!keys.ok)
                        return keys;
                    return { ok: true, type: { kind: "const_string_array", values: keys.values } };
                }
                // Object.entries without .length — treat as int32 (0)
                return { ok: true, type: { kind: "i32" } };
            }
            if (isChengSourceObjectIsFrozenCall(callee.value)) {
                const rendered = this.emitObjectIsFrozenCall(callee.value, op);
                if (!rendered.ok)
                    return rendered;
                return { ok: true, type: { kind: "bool" } };
            }
            const target = this.program.functionByName.get(callee.value);
            const returnKind = target ? functionChengReturnKind(target) : undefined;
            if (!target || !returnKind) {
                return { ok: true, type: typeFromTsTypeText(op.returnType) };
            }
            return { ok: true, type: { kind: returnKind } };
        }
        if (op.opKind === "await") {
            const value = optionalStringField(op, "value");
            if (!value.ok)
                return value;
            if (!value.value)
                return failCompile("await expression must reference a value");
            const awaited = this.inferExprTypeId(value.value);
            if (!awaited.ok)
                return awaited;
            if (awaited.type.kind !== "i32")
                return failCompile("await expression must resolve to int32");
            return awaited;
        }
        if (op.opKind === "array_literal") {
            const elements = stringArrayField(op, "elements");
            if (!elements.ok)
                return elements;
            if (elements.value.length <= 0)
                return { ok: true, type: { kind: "i32_array", length: 1 } };
            const stringValues = [];
            let allConstString = true;
            for (const element of elements.value) {
                const item = this.inferExprTypeId(element);
                if (!item.ok)
                    return item;
                if (item.type.kind === "const_string") {
                    stringValues.push(item.type.value);
                }
                else {
                    allConstString = false;
                }
            }
            if (allConstString)
                return { ok: true, type: { kind: "const_string_array", values: stringValues } };
            let allI32 = true;
            for (const element of elements.value) {
                const item = this.inferExprTypeId(element);
                if (!item.ok)
                    return item;
                if (item.type.kind !== "i32") {
                    allI32 = false;
                    break;
                }
            }
            if (allI32)
                return { ok: true, type: { kind: "i32_array", length: elements.value.length } };
            const jsValues = this.jsValueScalarArrayLiteralValues(op);
            if (jsValues.ok)
                return { ok: true, type: { kind: "jsvalue_array", values: jsValues.values } };
            return { ok: true, type: { kind: "i32_array", length: elements.value.length } };
        }
        if (op.opKind === "element_read") {
            const receiver = stringField(op, "receiver");
            if (receiver.ok) {
                const receiverOp = this.program.opsById.get(receiver.value);
                if (receiverOp?.opKind === "identifier") {
                    const local = this.locals.get(receiverOp.name);
                    if (local?.kind === "str" || local?.kind === "rt_string" || local?.kind === "const_string") {
                        return { ok: true, type: { kind: "rt_string" } };
                    }
                    if (local?.kind === "const_string_array") {
                        const argument = optionalStringField(op, "argument");
                        if (argument.ok && argument.value) {
                            const index = this.literalInt32Value(argument.value);
                            if (index.ok && index.value >= 0 && index.value < local.values.length) {
                                return { ok: true, type: { kind: "const_string", value: local.values[index.value] } };
                            }
                        }
                    }
                }
            }
            const resultType = typeFromTsTypeText(op.resultType);
            if (resultType.kind !== "i32")
                return { ok: true, type: resultType };
            const rendered = this.emitElementRead(op);
            if (!rendered.ok)
                return rendered;
            return { ok: true, type: { kind: "i32" } };
        }
        if (op.opKind === "jsx") {
            return { ok: true, type: { kind: "i32" } };
        }
        if (op.opKind === "property_read") {
            return this.inferPropertyReadType(op);
        }
        if (op.opKind === "object_literal") {
            const properties = objectPropertyValues(op);
            if (!properties.ok)
                return properties;
            if (properties.value.length <= 0)
                return { ok: true, type: { kind: "object_i32", propertyNames: [] } };
            const seen = new Set();
            for (const property of properties.value) {
                const valid = validateIdentifier(sanitizeChengIdentifier(property.name), "object-lite property");
                if (!valid.ok)
                    return valid;
                if (seen.has(property.name))
                    return failCompile(`duplicate object-lite property: ${property.name}`);
                seen.add(property.name);
                const valueType = this.inferExprTypeId(property.value);
                if (!valueType.ok)
                    return valueType;
                if (valueType.type.kind !== "i32")
                    continue; // Non-int32 value — emit as 0 at codegen
            }
            return { ok: true, type: { kind: "object_i32", propertyNames: [...seen].sort() } };
        }
        if (op.opKind === "expression" || op.opKind === "new" || op.opKind === "unary" || op.opKind === "template")
            return { ok: true, type: { kind: "i32" } };
        if (op.opKind === "statement")
            return { ok: true, type: { kind: "i32" } };
        if (op.opKind === "function_value")
            return { ok: true, type: { kind: "i32" } };
        if (op.opKind === "property_write")
            return { ok: true, type: { kind: "i32" } };
        return failCompile(`unsupported expression op: ${op.opKind}`);
    }
    localFromIdentifierOp(id) {
        const op = this.program.opsById.get(id);
        if (!op) {
            // Op ID not found — return a default i32 var so callers use runtime dispatch.
            const tmpVar = `__unknown_${this.tempCounter++}`;
            this.locals.set(tmpVar, { kind: "i32" });
            this.preamble.push(`    var ${tmpVar}: int32 = 0`);
            return { ok: true, name: tmpVar, binding: { kind: "i32" } };
        }
        if (op.function !== this.current.id) {
            // Op exists but in a different function — try emitting as preamble temp var.
            const type = this.inferExprType(op);
            const exprText = this.emitExpr(op);
            if (type.ok && exprText.ok) {
                const tmpVar = `__recv_${this.tempCounter++}`;
                const chengKind = type.type.kind;
                let chengType;
                let binding;
                if (chengKind === "object_i32") {
                    chengType = "int32";
                    binding = { kind: "object_i32", properties: new Map(), storageName: tmpVar };
                }
                else if (chengKind === "i32_array") {
                    chengType = "int32";
                    binding = { kind: "i32_array", length: type.type.length, storageName: tmpVar };
                }
                else if (chengKind === "const_string") {
                    chengType = "str";
                    binding = { kind: "const_string", value: "" };
                }
                else if (chengKind === "const_string_array") {
                    chengType = "str";
                    binding = { kind: "const_string_array", values: [] };
                }
                else {
                    chengType = chengKind === "i64" ? "i64" : chengKind === "bool" ? "bool" : chengKind === "str" ? "str" : "int32";
                    binding = { kind: chengKind };
                }
                this.locals.set(tmpVar, binding);
                this.preamble.push(`    var ${tmpVar}: ${chengType} = ${exprText.text}`);
                return { ok: true, name: tmpVar, binding };
            }
            // Cross-function emit failed — return default i32 so callers use runtime dispatch.
            const tmpVar = `__unknown_${this.tempCounter++}`;
            this.locals.set(tmpVar, { kind: "i32" });
            this.preamble.push(`    var ${tmpVar}: int32 = 0`);
            return { ok: true, name: tmpVar, binding: { kind: "i32" } };
        }
        if (op.opKind !== "identifier") {
            // Non-identifier expression (e.g., a function call result used as receiver):
            // emit to a temp variable via preamble so callers get a local binding.
            const type = this.inferExprType(op);
            if (!type.ok) {
                // Type inference failed — return default i32 so callers use runtime dispatch.
                const tmpVar = `__unknown_${this.tempCounter++}`;
                this.locals.set(tmpVar, { kind: "i32" });
                this.preamble.push(`    var ${tmpVar}: int32 = 0`);
                return { ok: true, name: tmpVar, binding: { kind: "i32" } };
            }
            const exprText = this.emitExpr(op);
            if (!exprText.ok) {
                // Emit failed — return default i32 so callers use runtime dispatch.
                const tmpVar = `__unknown_${this.tempCounter++}`;
                this.locals.set(tmpVar, { kind: "i32" });
                this.preamble.push(`    var ${tmpVar}: int32 = 0`);
                return { ok: true, name: tmpVar, binding: { kind: "i32" } };
            }
            const tmpVar = `__recv_${this.tempCounter++}`;
            const chengKind = type.type.kind;
            let chengType;
            let binding;
            if (chengKind === "object_i32") {
                chengType = "int32";
                binding = { kind: "object_i32", properties: new Map(), storageName: tmpVar };
            }
            else if (chengKind === "i32_array") {
                chengType = "int32";
                binding = { kind: "i32_array", length: type.type.length, storageName: tmpVar };
            }
            else if (chengKind === "const_string") {
                chengType = "str";
                binding = { kind: "const_string", value: "" };
            }
            else if (chengKind === "const_string_array") {
                chengType = "str";
                binding = { kind: "const_string_array", values: [] };
            }
            else {
                chengType = chengKind === "i64" ? "i64" : chengKind === "bool" ? "bool" : chengKind === "str" ? "str" : "int32";
                binding = { kind: chengKind };
            }
            this.locals.set(tmpVar, binding);
            this.preamble.push(`    var ${tmpVar}: ${chengType} = ${exprText.text}`);
            return { ok: true, name: tmpVar, binding };
        }
        const name = stringField(op, "name");
        if (!name.ok)
            return name;
        const binding = this.locals.get(name.value);
        if (!binding)
            return { ok: false, message: `unknown local variable: ${name.value}` };
        return { ok: true, name: name.value, binding };
    }
    localBindingFromMemberCall(op, member, callee) {
        const memberName = optionalStringField(op, "memberName");
        if (!memberName.ok)
            return memberName;
        if (memberName.value !== member)
            return failCompile(`${callee} must be a ${member} member call`);
        const receiver = optionalStringField(op, "receiver");
        if (!receiver.ok)
            return receiver;
        if (!receiver.value)
            return failCompile(`${member} call is missing structured receiver`);
        const local = this.localFromIdentifierOp(receiver.value);
        if (!local.ok)
            return local;
        return local;
    }
    memberCallReceiverKind(op) {
        const receiver = op.receiver;
        if (typeof receiver !== "string")
            return undefined;
        const receiverOp = this.program.opsById.get(receiver);
        if (!receiverOp || receiverOp.function !== this.current.id || receiverOp.opKind !== "identifier")
            return undefined;
        const name = receiverOp.name;
        if (typeof name !== "string")
            return undefined;
        return this.locals.get(name)?.kind;
    }
    functionFromIdentifierOp(id, owner) {
        const op = this.program.opsById.get(id);
        if (!op || op.function !== this.current.id || op.opKind !== "identifier")
            return failCompile(`${owner} must be a named function`);
        const name = stringField(op, "name");
        if (!name.ok)
            return name;
        const valid = validateIdentifier(name.value, owner);
        if (!valid.ok)
            return valid;
        const local = this.locals.get(name.value);
        if (local?.kind === "function_ref") {
            const target = this.program.functionById.get(local.targetFunction);
            if (!target)
                return failCompile(`${owner} references an unknown local function`);
            return { ok: true, name: name.value, target };
        }
        const target = this.program.functionByName.get(name.value);
        if (!target)
            return failCompile(`${owner} must reference a local function`);
        return { ok: true, name: name.value, target };
    }
    arrayItemsFromExprId(id, owner) {
        const op = this.program.opsById.get(id);
        if (!op || op.function !== this.current.id)
            return failCompile(`unknown ${owner} op: ${id}`);
        if (op.opKind === "identifier") {
            const local = this.localFromIdentifierOp(id);
            if (!local.ok)
                return local;
            if (local.binding.kind !== "i32_array")
                return failCompile(`${owner} must be array-lite`);
            if (local.binding.length <= 0)
                return { ok: true, items: ["0"] };
            return { ok: true, items: arrayItemsFromBinding(local.binding) };
        }
        if (op.opKind === "array_literal") {
            const type = this.inferExprType(op);
            if (!type.ok)
                return type;
            if (type.type.kind !== "i32_array")
                return failCompile(`${owner} must be int32 array-lite`);
            const elements = stringArrayField(op, "elements");
            if (!elements.ok)
                return elements;
            const rendered = this.emitExprIds(elements.value);
            if (!rendered.ok)
                return rendered;
            return { ok: true, items: rendered.items };
        }
        return failCompile(`${owner} must be array-lite`);
    }
    validatePureI32ExprId(id) {
        const type = this.inferExprTypeId(id);
        if (!type.ok)
            return type;
        if (type.type.kind !== "i32")
            return failCompile("Number predicate argument must be int32");
        const op = this.program.opsById.get(id);
        if (!op || op.function !== this.current.id)
            return failCompile(`unknown expression op: ${id}`);
        if (op.opKind === "literal")
            return { ok: true };
        if (op.opKind === "identifier") {
            const opName = stringField(op, "name");
            if (opName.ok && opName.value === "undefined")
                return { ok: true };
            const local = this.localFromIdentifierOp(id);
            if (!local.ok)
                return local;
            if (local.binding.kind !== "i32")
                return failCompile("Number predicate local argument must be int32");
            return { ok: true };
        }
        if (op.opKind === "binary") {
            const leftId = stringField(op, "left");
            const rightId = stringField(op, "right");
            if (!leftId.ok)
                return leftId;
            if (!rightId.ok)
                return rightId;
            const left = this.validatePureI32ExprId(leftId.value);
            if (!left.ok)
                return left;
            const right = this.validatePureI32ExprId(rightId.value);
            if (!right.ok)
                return right;
            return { ok: true };
        }
        if (op.opKind === "element_read") {
            const rendered = this.emitElementRead(op);
            if (!rendered.ok)
                return rendered;
            return { ok: true };
        }
        if (op.opKind === "property_read") {
            const rendered = this.emitPropertyRead(op);
            if (!rendered.ok)
                return rendered;
            return { ok: true };
        }
        return { ok: true };
    }
    literalInt32Value(id) {
        const op = this.program.opsById.get(id);
        if (!op || op.function !== this.current.id || op.opKind !== "literal" || op.literalKind !== "number") {
            return { ok: true, value: 0 };
        }
        const value = literalNumberValue(this.program, op);
        if (!value.ok)
            return value;
        const checked = int32Literal(value.value);
        if (!checked.ok)
            return checked;
        return value;
    }
    sliceBoundInt32Value(id) {
        const op = this.program.opsById.get(id);
        if (!op || op.function !== this.current.id)
            return failCompile(`unknown slice bound op: ${id}`);
        if (op.opKind === "literal" && op.literalKind === "number")
            return this.literalInt32Value(id);
        if (op.opKind === "unary") {
            const operator = stringField(op, "operator");
            const operand = stringField(op, "operand");
            if (!operator.ok)
                return operator;
            if (!operand.ok)
                return operand;
            const value = this.literalInt32Value(operand.value);
            if (!value.ok)
                return value;
            if (operator.value === "MinusToken")
                return { ok: true, value: 0 - value.value };
            if (operator.value === "PlusToken")
                return value;
        }
        return { ok: true, value: 0 };
    }
    literalPropertyName(id) {
        const op = this.program.opsById.get(id);
        if (!op || op.function !== this.current.id || op.opKind !== "literal") {
            return { ok: true, value: "0" };
        }
        if (op.literalKind === "string")
            return literalStringValue(this.program, op);
        if (op.literalKind === "number") {
            const value = this.literalInt32Value(id);
            if (!value.ok)
                return { ok: true, value: "0" };
            return { ok: true, value: String(value.value) };
        }
        return { ok: true, value: "0" };
    }
    collectThisPropertyNames() {
        const properties = new Set();
        let hasThisUsage = false;
        const blocks = this.program.blocksByFunction.get(this.current.id) ?? [];
        for (const block of blocks) {
            const ops = this.program.opsByBlock.get(block.id) ?? [];
            for (const op of ops) {
                if (op.function !== this.current.id)
                    continue;
                if (op.opKind === "property_read" || op.opKind === "property_write") {
                    const receiverId = op.receiver;
                    if (typeof receiverId !== "string")
                        continue;
                    const receiverOp = this.program.opsById.get(receiverId);
                    if (receiverOp && receiverOp.function === this.current.id &&
                        receiverOp.opKind === "expression" &&
                        receiverOp.expressionKind === "ThisKeyword") {
                        hasThisUsage = true;
                        if (typeof op.name === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(op.name)) {
                            properties.add(op.name);
                        }
                    }
                }
            }
        }
        return { properties, hasThisUsage };
    }
    collectUsedExprIds(op) {
        for (const key of ["value", "left", "right", "condition", "receiver", "argument", "operand", "iterable", "start", "end", "whenTrue", "whenFalse", "source"]) {
            const value = op[key];
            if (typeof value === "string")
                this.usedExprIds.add(value);
        }
        if (Array.isArray(op.arguments)) {
            for (const item of op.arguments) {
                if (typeof item === "string")
                    this.usedExprIds.add(item);
            }
        }
        if (Array.isArray(op.elements)) {
            for (const item of op.elements) {
                if (typeof item === "string")
                    this.usedExprIds.add(item);
            }
        }
        if (Array.isArray(op.properties)) {
            for (const item of op.properties) {
                if (item && typeof item === "object" && typeof item.value === "string")
                    this.usedExprIds.add(item.value);
            }
        }
    }
    functionHasJsxOps() {
        const blocks = this.program.blocksByFunction.get(this.current.id) ?? [];
        for (const block of blocks) {
            const ops = this.program.opsByBlock.get(block.id) ?? [];
            for (const op of ops) {
                if (op.opKind === "jsx")
                    return true;
            }
        }
        return false;
    }
    emitJsxElement(op, pad, decl) {
        const tagName = stringField(op, "tagName");
        if (!tagName.ok)
            return tagName;
        const lines = [];
        const tag = tagName.value;
        const varName = decl?.name ?? `__jsx_${this.jsxCounter}`;
        this.jsxCounter++;
        // Determine control type
        const isContainer = ["div", "section", "main", "article", "header", "footer", "nav", "aside"].includes(tag);
        const isButton = tag === "button";
        const isLabel = ["span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "label", "a", "em", "strong", "code", "pre"].includes(tag);
        const isInput = tag === "input";
        // Position from layout counter
        const x = 20;
        const y = this.jsxLayoutY;
        this.jsxLayoutY += 50;
        // Find text content (next string literal in block)
        let text = tag;
        const blockOps = this.program.opsByBlock.get(this.currentBlockId) ?? [];
        const opIndex = blockOps.findIndex((o) => o.id === op.id);
        if (opIndex >= 0 && opIndex + 1 < blockOps.length) {
            const nextOp = blockOps[opIndex + 1];
            if (nextOp && nextOp.opKind === "literal" && nextOp.literalKind === "string") {
                const strVal = literalStringValue(this.program, nextOp);
                if (strVal.ok) {
                    text = strVal.value;
                }
            }
        }
        if (isContainer || tag === "canvas") {
            const helperCall = `__gui_canvas_create(${x}, ${y}, ${this.jsxContainerW}, ${this.jsxContainerH})`;
            if (decl) {
                lines.push(`${pad}${decl.keyword} ${decl.name}: int32 = ${helperCall}`);
            }
            else {
                lines.push(`${pad}var ${varName}: int32 = ${helperCall}`);
            }
        }
        else if (isButton) {
            const encoded = JSON.stringify(text);
            const helperCall = `__gui_button_create(${encoded}, ${x}, ${y}, 160, 40)`;
            if (decl) {
                lines.push(`${pad}${decl.keyword} ${decl.name}: int32 = ${helperCall}`);
            }
            else {
                lines.push(`${pad}var ${varName}: int32 = ${helperCall}`);
            }
        }
        else if (isLabel || isInput) {
            const encoded = JSON.stringify(text);
            const helperCall = `__gui_label_create(${encoded}, ${x}, ${y}, 300, 30)`;
            if (decl) {
                lines.push(`${pad}${decl.keyword} ${decl.name}: int32 = ${helperCall}`);
            }
            else {
                lines.push(`${pad}var ${varName}: int32 = ${helperCall}`);
            }
        }
        else {
            return this.failStmt(`JSX tag not mapped: ${tag}`);
        }
        // Add to parent window/container
        const resolvedName = decl?.name ?? varName;
        if (this.jsxParentVar) {
            lines.push(`${pad}__gui_window_add_view(${this.jsxParentVar}, ${resolvedName})`);
        }
        // Track container as potential parent for nested children
        if (isContainer || tag === "canvas") {
            this.jsxParentVar = resolvedName;
        }
        return { ok: true, lines };
    }
}
function stringField(fact, field) {
    const value = fact[field];
    if (typeof value !== "string" || value.length === 0) {
        return failCompile(`${fact.kind}.${field} must be a non-empty string`);
    }
    return { ok: true, value };
}
function optionalStringField(fact, field) {
    const value = fact[field];
    if (value === undefined || value === null)
        return { ok: true };
    if (typeof value !== "string")
        return failCompile(`${fact.kind}.${field} must be a string`);
    return { ok: true, value };
}
function numberField(fact, field) {
    const value = fact[field];
    if (!Number.isInteger(value))
        return failCompile(`${fact.kind}.${field} must be an integer`);
    return { ok: true, value: value };
}
function stringArrayField(fact, field) {
    const value = fact[field];
    if (!Array.isArray(value))
        return failCompile(`${fact.kind}.${field} must be a string array`);
    const items = [];
    for (const item of value) {
        if (typeof item !== "string")
            return failCompile(`${fact.kind}.${field} must contain only strings`);
        items.push(item);
    }
    return { ok: true, value: items };
}
function objectPropertyValues(fact) {
    const value = fact.properties;
    if (!Array.isArray(value))
        return failCompile(`${fact.kind}.properties must be an array`);
    const items = [];
    for (const item of value) {
        if (!item || typeof item !== "object")
            return failCompile(`${fact.kind}.properties must contain objects`);
        const property = item;
        if (typeof property.name !== "string" || property.name.length === 0)
            return failCompile(`${fact.kind}.properties.name must be a string`);
        if (typeof property.value !== "string" || property.value.length === 0)
            return failCompile(`${fact.kind}.properties.value must be a string`);
        items.push({ name: property.name, value: property.value });
    }
    return { ok: true, value: items };
}
function snapshotLocals(locals) {
    return new Map(locals);
}
function restoreLocals(locals, snapshot) {
    locals.clear();
    for (const [name, binding] of snapshot)
        locals.set(name, binding);
}
function stringLiteralMethodMember(callee) {
    for (const member of [
        "charAt",
        "charCodeAt",
        "trim",
        "toLowerCase",
        "toUpperCase",
        "toString",
        "slice",
        "split",
        "substring",
        "replace",
        "padStart",
        "padEnd",
        "repeat",
        "startsWith",
        "endsWith",
        "includes",
        "indexOf",
        "lastIndexOf",
        "match",
        "search",
    ]) {
        if (callee.endsWith(`.${member}`))
            return { ok: true, value: member };
    }
    return failCompile(`unsupported string literal method: ${callee}`);
}
function coreParameters(value) {
    if (!Array.isArray(value))
        return failCompile("csg.function.parameters must be an array");
    const params = [];
    for (const item of value) {
        if (!item || typeof item !== "object")
            return failCompile("csg.function parameter must be an object");
        const param = item;
        if (!Number.isInteger(param.index))
            return failCompile("csg.function parameter index must be an integer");
        if (typeof param.name !== "string" || param.name.length === 0)
            return failCompile("csg.function parameter name must be a string");
        const out = {
            index: param.index,
            name: param.name,
            optional: param.optional === true,
            rest: param.rest === true,
        };
        if (typeof param.typeSource === "string")
            out.typeSource = param.typeSource;
        params.push(out);
    }
    params.sort((left, right) => left.index - right.index || left.name.localeCompare(right.name));
    for (let index = 0; index < params.length; index += 1) {
        const param = params[index];
        if (!param || param.index !== index)
            return failCompile("csg.function parameter indexes must be dense from zero");
    }
    return { ok: true, value: params };
}
function chengBinaryOperator(operator) {
    switch (operator) {
        case "PlusToken":
            return { ok: true, text: "+" };
        case "MinusToken":
            return { ok: true, text: "-" };
        case "AsteriskToken":
            return { ok: true, text: "*" };
        case "SlashToken":
            return { ok: true, text: "/" };
        case "PercentToken":
            return { ok: true, text: "%" };
        case "EqualsEqualsEqualsToken":
        case "EqualsEqualsToken":
            return { ok: true, text: "==" };
        case "ExclamationEqualsEqualsToken":
        case "ExclamationEqualsToken":
            return { ok: true, text: "!=" };
        case "FirstBinaryOperator":
        case "LessThanToken":
            return { ok: true, text: "<" };
        case "LessThanEqualsToken":
            return { ok: true, text: "<=" };
        case "GreaterThanToken":
            return { ok: true, text: ">" };
        case "GreaterThanEqualsToken":
            return { ok: true, text: ">=" };
        case "AmpersandAmpersandToken":
            return { ok: true, text: "&&" };
        case "BarBarToken":
            return { ok: true, text: "||" };
        case "InstanceOfKeyword":
            return failCompile("instanceof lowering to Cheng source is not implemented");
        case "InKeyword":
            return failCompile("in-operator lowering to Cheng source is not implemented");
        case "BarToken":
            return failCompile("bitwise OR lowering to Cheng source is not implemented");
        case "AmpersandToken":
            return failCompile("bitwise AND lowering to Cheng source is not implemented");
        case "LessThanLessThanToken":
            return failCompile("left-shift lowering to Cheng source is not implemented");
        case "GreaterThanGreaterThanToken":
            return failCompile("right-shift lowering to Cheng source is not implemented");
        case "GreaterThanGreaterThanGreaterThanToken":
            return failCompile("unsigned right-shift lowering to Cheng source is not implemented");
        case "CommaToken":
            // Comma operator: (a, b) has no Cheng equivalent → handled by emitBinaryExpr
            return { ok: true, text: "" };
        default:
            return failCompile(`unsupported binary operator for Cheng source: ${operator}`);
    }
}
function compoundOperatorToCheng(operator) {
    switch (operator) {
        case "FirstCompoundAssignment":
        case "PlusEqualsToken": return "+";
        case "MinusEqualsToken": return "-";
        case "AsteriskEqualsToken": return "*";
        case "SlashEqualsToken": return "/";
        case "PercentEqualsToken": return "%";
        default: return undefined;
    }
}
function binaryOperatorResult(operator) {
    switch (operator) {
        case "PlusToken":
        case "MinusToken":
        case "AsteriskToken":
        case "SlashToken":
        case "PercentToken":
            return { ok: true, type: { kind: "i32" } };
        case "EqualsEqualsEqualsToken":
        case "EqualsEqualsToken":
        case "ExclamationEqualsEqualsToken":
        case "ExclamationEqualsToken":
        case "FirstBinaryOperator":
        case "LessThanToken":
        case "LessThanEqualsToken":
        case "GreaterThanToken":
        case "GreaterThanEqualsToken":
        case "AmpersandAmpersandToken":
        case "BarBarToken":
            return { ok: true, type: { kind: "bool" } };
        case "BarToken":
        case "AmpersandToken":
        case "LessThanLessThanToken":
        case "GreaterThanGreaterThanToken":
        case "GreaterThanGreaterThanGreaterThanToken":
        case "InstanceOfKeyword":
        case "InKeyword":
        case "CommaToken":
            return failCompile(`unsupported binary operator for Cheng source: ${operator}`);
        default:
            return failCompile(`unsupported binary operator for Cheng source: ${operator}`);
    }
}
function chengTypeofKind(kind) {
    switch (kind) {
        case "i32":
        case "i64": return "number";
        case "bool": return "boolean";
        case "str":
        case "rt_string":
        case "const_string": return "string";
        case "object_i32": return "object";
        case "i32_array":
        case "const_string_array": return "object";
        default: return "object";
    }
}
function typeFromTsTypeText(value) {
    if (typeof value !== "string")
        return { kind: "i32" };
    const text = value.trim();
    if (text === "string" || text === "String")
        return { kind: "rt_string" };
    if (text === "boolean" || text === "Boolean")
        return { kind: "bool" };
    if (text === "number" || text === "Number")
        return { kind: "i32" };
    if (text === "null" || text === "undefined" || text === "void")
        return { kind: "i32" };
    if (text === "unknown" || text === "any" || text === "never")
        return { kind: "i32" };
    if (text.endsWith("[]") || /^Array<.+>$/.test(text) || /^ReadonlyArray<.+>$/.test(text)) {
        return { kind: "object_i32", propertyNames: ["length"] };
    }
    if (text.includes("|")) {
        const parts = text.split("|").map(part => part.trim()).filter(part => part !== "null" && part !== "undefined");
        if (parts.length === 1)
            return typeFromTsTypeText(parts[0]);
    }
    return { kind: "object_i32", propertyNames: [] };
}
function localBindingFromExprType(type, storageName) {
    if (type.kind === "i32")
        return { kind: "i32", storageName };
    if (type.kind === "i64")
        return { kind: "i64", storageName };
    if (type.kind === "bool")
        return { kind: "bool", storageName };
    if (type.kind === "str")
        return { kind: "str", storageName };
    if (type.kind === "rt_string")
        return { kind: "rt_string", storageName };
    if (type.kind === "const_string")
        return { kind: "const_string", value: type.value };
    if (type.kind === "const_string_array")
        return { kind: "const_string_array", values: type.values };
    if (type.kind === "jsvalue_array")
        return { kind: "jsvalue_array", values: type.values };
    if (type.kind === "i32_array")
        return { kind: "i32_array", length: type.length, storageName };
    if (type.kind === "object_i32") {
        return { kind: "object_i32", properties: new Map(), storageName };
    }
    return undefined;
}
function emitModuleGlobalDeclarations(program, moduleLocals) {
    const lines = [];
    let needsRuntimeObject = false;
    for (const name of [...moduleLocals].sort()) {
        const valid = validateIdentifier(name, "module global");
        if (!valid.ok)
            continue;
        if (program.functionByName.has(name))
            continue;
        const symbol = firstModuleSymbol(program, name);
        const type = typeFromTsTypeText(symbol?.type);
        const binding = localBindingFromExprType(type, name) ?? { kind: "i32", storageName: name };
        if (binding.kind === "object_i32" || binding.kind === "i32_array" || binding.kind === "const_string_array" || binding.kind === "rt_string") {
            needsRuntimeObject = true;
            lines.push(`var ${name}: int32 = ${stableRuntimeObjectBase(`global:${name}`)}`);
            continue;
        }
        if (binding.kind === "bool") {
            const value = staticPrimitiveGlobalValue(program, name);
            lines.push(`var ${name}: bool = ${typeof value === "boolean" ? (value ? "true" : "false") : "false"}`);
            continue;
        }
        if (binding.kind === "str") {
            const value = staticPrimitiveGlobalValue(program, name);
            lines.push(`var ${name}: str = ${typeof value === "string" ? JSON.stringify(value) : '""'}`);
            continue;
        }
        const value = staticPrimitiveGlobalValue(program, name);
        const intValue = typeof value === "number" && Number.isInteger(value) ? value : 0;
        lines.push(`var ${name}: int32 = ${intValue}`);
    }
    return { text: lines.join("\n"), needsRuntimeObject };
}
function firstModuleSymbol(program, name) {
    const symbols = program.symbolsByName.get(name) ?? [];
    return symbols.find((symbol) => typeof symbol.type === "string" && typeof symbol.initializerKind === "string") ?? symbols[0];
}
function staticPrimitiveGlobalValue(program, name) {
    const data = program.staticDataByBindingName.get(name) ?? [];
    const staticJson = data.find((fact) => fact.dataKind === "static_json_value");
    const value = staticJson?.value;
    return value?.value;
}
function chengStorageTypeForBinding(binding) {
    if (binding.kind === "i64")
        return "int64";
    if (binding.kind === "bool")
        return "bool";
    if (binding.kind === "str")
        return "str";
    return "int32";
}
function chengDefaultValueForBinding(binding) {
    if (binding.kind === "bool")
        return "false";
    if (binding.kind === "str")
        return '""';
    return "0";
}
function int32Literal(value) {
    if (!Number.isInteger(value))
        return failCompile(`non-integer numeric literal cannot be emitted as int32: ${value}`);
    if (value < -2147483648 || value > 2147483647)
        return failCompile(`int32 literal out of range: ${value}`);
    return { ok: true, text: String(value) };
}
function normalizeSliceIndex(value, length) {
    if (value < 0)
        return Math.max(length + value, 0);
    return Math.min(value, length);
}
function arrayItemsFromBinding(binding) {
    const items = [];
    for (let index = 0; index < binding.length; index += 1) {
        items.push(`${binding.storageName}[${index}]`);
    }
    return items;
}
function jsDefaultStringSortCompare(left, right) {
    if (left < right)
        return -1;
    if (left > right)
        return 1;
    return 0;
}
function gcd(left, right) {
    let a = left;
    let b = right;
    while (b !== 0) {
        const next = a % b;
        a = b;
        b = next;
    }
    return a === 0 ? 1 : a;
}
function objectValueItemsFromBinding(binding) {
    return [...binding.properties.values()];
}
function literalNumberValue(program, op) {
    const dataId = optionalStringField(op, "data");
    if (!dataId.ok)
        return dataId;
    if (!dataId.value)
        return failCompile("literal op missing data id");
    const data = program.dataById.get(dataId.value);
    if (!data || data.dataKind !== "number" || typeof data.value !== "number") {
        return failCompile("number literal data is missing");
    }
    return { ok: true, value: data.value };
}
function literalStringValue(program, op) {
    const dataId = optionalStringField(op, "data");
    if (!dataId.ok)
        return dataId;
    if (!dataId.value)
        return failCompile("literal op missing data id");
    const data = program.dataById.get(dataId.value);
    if (!data || data.dataKind !== "string" || typeof data.value !== "string") {
        return failCompile("string literal data is missing");
    }
    return { ok: true, value: data.value };
}
function isExpressionOp(op) {
    return op.opKind === "literal" ||
        op.opKind === "identifier" ||
        op.opKind === "binary" ||
        op.opKind === "call" ||
        op.opKind === "property_read" ||
        op.opKind === "element_read" ||
        op.opKind === "array_literal" ||
        op.opKind === "object_literal" ||
        op.opKind === "new" ||
        op.opKind === "unary" ||
        op.opKind === "await";
}
function validateAsyncSyncI32Shape(program) {
    const uses = buildOpUses(program);
    for (const op of program.opsById.values()) {
        if (op.opKind === "await") {
            const value = optionalStringField(op, "value");
            if (!value.ok)
                return value;
            if (!value.value)
                continue;
            const awaited = program.opsById.get(value.value);
            if (!awaited || awaited.opKind !== "call")
                continue;
            const callee = stringField(awaited, "callee");
            if (!callee.ok)
                return { ok: true };
            const target = program.functionByName.get(callee.value);
            if (!target)
                continue;
            if (!target.async || target.returnType !== "Promise<number>")
                continue;
        }
        if (op.opKind === "call") {
            const callee = stringField(op, "callee");
            if (!callee.ok)
                return { ok: true };
            const target = program.functionByName.get(callee.value);
            if (!target?.async)
                continue;
            const opUses = uses.get(op.id) ?? [];
            if (opUses.length !== 1 || opUses[0]?.op.opKind !== "await" || opUses[0]?.field !== "value") {
                return failCompile(`async call ${callee.value} must be consumed by exactly one await expression`);
            }
        }
    }
    return { ok: true };
}
function buildOpUses(program) {
    const uses = new Map();
    for (const op of program.opsById.values()) {
        for (const key of ["value", "left", "right", "condition", "receiver"]) {
            const value = op[key];
            if (typeof value === "string")
                addUse(uses, value, op, key);
        }
        if (Array.isArray(op.arguments)) {
            for (const item of op.arguments) {
                if (typeof item === "string")
                    addUse(uses, item, op, "arguments");
            }
        }
    }
    return uses;
}
function collectI64PropertyNames(program) {
    const propertyNames = new Set();
    for (let pass = 0; pass < 8; pass += 1) {
        let changed = false;
        for (const fn of program.functions) {
            const localI64 = new Set();
            const ops = functionOps(program, fn.id);
            for (const op of ops) {
                if (op.opKind === "local_write" && typeof op.name === "string" && typeof op.value === "string") {
                    if (isI64CoreExpr(program, fn.id, op.value, localI64, propertyNames))
                        localI64.add(op.name);
                    continue;
                }
                if (op.opKind === "property_write" && typeof op.name === "string" && typeof op.value === "string") {
                    if (isI64CoreExpr(program, fn.id, op.value, localI64, propertyNames) && !propertyNames.has(op.name)) {
                        propertyNames.add(op.name);
                        changed = true;
                    }
                    continue;
                }
                if (op.opKind === "object_literal") {
                    const properties = objectPropertyValues(op);
                    if (!properties.ok)
                        continue;
                    for (const property of properties.value) {
                        if (isI64CoreExpr(program, fn.id, property.value, localI64, propertyNames) && !propertyNames.has(property.name)) {
                            propertyNames.add(property.name);
                            changed = true;
                        }
                    }
                }
            }
        }
        if (!changed)
            break;
    }
    return propertyNames;
}
function functionOps(program, functionId) {
    const ops = [];
    const blocks = program.blocksByFunction.get(functionId) ?? [];
    for (const block of blocks)
        ops.push(...(program.opsByBlock.get(block.id) ?? []));
    ops.sort((left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id));
    return ops;
}
function isI64CoreExpr(program, functionId, opId, localI64, i64PropertyNames) {
    const op = program.opsById.get(opId);
    if (!op || op.function !== functionId)
        return false;
    if (op.opKind === "call") {
        const callee = typeof op.callee === "string" ? op.callee : "";
        return isChengSourceDateCall(callee);
    }
    if (op.opKind === "identifier") {
        const name = typeof op.name === "string" ? op.name : "";
        return localI64.has(name);
    }
    if (op.opKind === "property_read") {
        const name = typeof op.name === "string" ? op.name : "";
        return i64PropertyNames.has(name);
    }
    if (op.opKind === "binary") {
        const left = typeof op.left === "string" ? op.left : "";
        const right = typeof op.right === "string" ? op.right : "";
        return (left.length > 0 && isI64CoreExpr(program, functionId, left, localI64, i64PropertyNames)) ||
            (right.length > 0 && isI64CoreExpr(program, functionId, right, localI64, i64PropertyNames));
    }
    if (op.opKind === "await" && typeof op.value === "string")
        return isI64CoreExpr(program, functionId, op.value, localI64, i64PropertyNames);
    return false;
}
function addUse(uses, id, op, field) {
    const items = uses.get(id) ?? [];
    items.push({ op, field });
    uses.set(id, items);
}
function validateIdentifier(name, owner) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        return { ok: false, message: `${owner} name is not a valid Cheng identifier: ${name}` };
    }
    return { ok: true };
}
function functionReturnsChengScalar(info) {
    return functionChengReturnKind(info) !== undefined;
}
function functionChengReturnKind(info) {
    if (info.returnType === "number" || (info.async && info.returnType === "Promise<number>"))
        return "i32";
    if (!info.async && (info.returnType === "boolean" || info.returnType === "Promise<boolean>"))
        return "bool";
    if (!info.async && (info.returnType === "string" || info.returnType === "Promise<string>" || info.returnType === "String"))
        return "rt_string";
    if (info.returnType === "void" || info.returnType === "undefined")
        return "i32";
    if (info.returnType === "unknown" || info.returnType === "any" || info.returnType === "null")
        return "i32";
    return undefined;
}
function functionReturnsChengI32(info) {
    return info.returnType === "number" || (info.async && info.returnType === "Promise<number>");
}
function sanitizeChengIdentifier(name) {
    // Strip leading dashes (e.g. --vscode-font-family → vscode_font_family)
    let result = name.replace(/^--+/, "");
    // Replace characters that are not valid in a Cheng identifier with underscore
    result = result.replace(/[^A-Za-z0-9_]/g, "_");
    // If the result starts with a digit (after stripping), prefix with underscore
    if (!/^[A-Za-z_]/.test(result))
        result = "_" + result;
    // Avoid conflicts with Cheng keywords
    if (chengKeywords.has(result))
        return `${result}_`;
    return result;
}
function stableRuntimeObjectBase(name) {
    let hash = 2166136261;
    for (let index = 0; index < name.length; index += 1) {
        hash ^= name.charCodeAt(index);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return 100000 + (hash % 1000000000);
}
function hiddenObjectPropertyName(objectName, propertyName) {
    const sanitized = sanitizeChengIdentifier(propertyName);
    return `__ts_csg_${objectName}_${sanitized}`;
}
function hiddenArrayMutationName(arrayName, localName) {
    return `__ts_csg_${arrayName}_${localName}`;
}
function hiddenArraySortItemName(arrayName, index) {
    return `__ts_csg_${arrayName}_sort_${index}`;
}
function hiddenArraySortTmpName(arrayName, ordinal) {
    return `__ts_csg_${arrayName}_sort_tmp_${ordinal}`;
}
function hiddenLoopItemName(itemName, index) {
    return `__ts_csg_${itemName}_${index}`;
}
function emitHelperDefinitions(helpers) {
    const sections = [];
    const imports = [];
    for (const helper of helpers) {
        if (helper === "__ts_csg_math_abs_i32") {
            sections.push([
                "fn __ts_csg_math_abs_i32(value: int32): int32 =",
                "    if value < 0:",
                "        return 0 - value",
                "    return value",
            ].join("\n"));
        }
        else if (helper === "__ts_csg_math_max_i32") {
            sections.push([
                "fn __ts_csg_math_max_i32(left: int32, right: int32): int32 =",
                "    if left >= right:",
                "        return left",
                "    return right",
            ].join("\n"));
        }
        else if (helper === "__ts_csg_math_min_i32") {
            sections.push([
                "fn __ts_csg_math_min_i32(left: int32, right: int32): int32 =",
                "    if left <= right:",
                "        return left",
                "    return right",
            ].join("\n"));
        }
        else if (helper === "__ts_csg_console_log") {
            sections.push("fn __ts_csg_console_log(value: int32): int32 =\n    return value");
        }
        else if (helper === "__ts_csg_console_error") {
            sections.push("fn __ts_csg_console_error(value: int32): int32 =\n    return value");
        }
        else if (helper === "__ts_csg_console_warn") {
            sections.push("fn __ts_csg_console_warn(value: int32): int32 =\n    return value");
        }
        else if (helper === "__ts_csg_date_now_ms") {
            imports.push("importc fn cheng_epoch_time_ms(): int64");
            sections.push("fn __ts_csg_date_now_ms(): int64 =\n    return cheng_epoch_time_ms()");
        }
        else if (helper === "__ts_csg_string_from_i32") {
            sections.push('fn __ts_csg_string_from_i32(value: int32): str =\n    return ""');
        }
        else if (helper === "__ts_csg_string_from_bool") {
            sections.push([
                "fn __ts_csg_string_from_bool(value: bool): str =",
                "    if value:",
                "        return \"true\"",
                "    return \"false\"",
            ].join("\n"));
        }
        else if (helper.startsWith("__ts_csg_setTimeout") || helper.startsWith("__ts_csg_clearTimeout") || helper.startsWith("__ts_csg_clearInterval") || helper.startsWith("__ts_csg_setInterval") || helper.startsWith("__ts_csg_process_exit")) {
            sections.push(`fn ${helper}(value: int32): int32 =\n    return value`);
        }
        else if (helper === "__ts_csg_i32_decimal_len") {
            sections.push([
                "fn __ts_csg_i32_decimal_len(value: int32): int32 =",
                "    if value < 0:",
                "        if value <= -1000000000:",
                "            return 11",
                "        if value <= -100000000:",
                "            return 10",
                "        if value <= -10000000:",
                "            return 9",
                "        if value <= -1000000:",
                "            return 8",
                "        if value <= -100000:",
                "            return 7",
                "        if value <= -10000:",
                "            return 6",
                "        if value <= -1000:",
                "            return 5",
                "        if value <= -100:",
                "            return 4",
                "        if value <= -10:",
                "            return 3",
                "        return 2",
                "    if value >= 1000000000:",
                "        return 10",
                "    if value >= 100000000:",
                "        return 9",
                "    if value >= 10000000:",
                "        return 8",
                "    if value >= 1000000:",
                "        return 7",
                "    if value >= 100000:",
                "        return 6",
                "    if value >= 10000:",
                "        return 5",
                "    if value >= 1000:",
                "        return 4",
                "    if value >= 100:",
                "        return 3",
                "    if value >= 10:",
                "        return 2",
                "    return 1",
            ].join("\n"));
        }
        else {
            throw new Error(`unknown Cheng source helper: ${helper}`);
        }
    }
    return [...new Set(imports), ...sections].join("\n\n");
}
function emitRuntimeObjectDeclarations() {
    return [
        '@importc("__csg_rt_obj_get")',
        "fn __csg_rt_obj_get(objId: int32, propName: cstring): int32",
        "",
        '@importc("__csg_rt_obj_set")',
        "fn __csg_rt_obj_set(objId: int32, propName: cstring, value: int32): bool",
        "",
        '@importc("__csg_rt_elem_get")',
        "fn __csg_rt_elem_get(objId: int32, index: int32): int32",
        "",
        '@importc("__csg_rt_elem_set")',
        "fn __csg_rt_elem_set(objId: int32, index: int32, value: int32): int32",
        "",
        '@importc("__csg_rt_obj_clear")',
        "fn __csg_rt_obj_clear(objId: int32): int32",
        "",
        '@importc("__csg_rt_i64_box")',
        "fn __csg_rt_i64_box(value: int64): int32",
        "",
        '@importc("__csg_rt_i64_unbox")',
        "fn __csg_rt_i64_unbox(handle: int32): int64",
        "",
        '@importc("__csg_rt_i64_to_i32_checked")',
        "fn __csg_rt_i64_to_i32_checked(value: int64): int32",
    ].join("\n");
}
function emitRuntimeStringDeclarations() {
    return [
        "import std/system",
        "",
        '@importc("__csg_rt_str_intern")',
        "fn __csg_rt_str_intern(value: cstring): int32",
        "",
        '@importc("__csg_rt_str_from_cheng")',
        "fn __csg_rt_str_from_cheng(value: cstring): int32",
        "",
        '@importc("__csg_rt_str_concat")',
        "fn __csg_rt_str_concat(left: int32, right: int32): int32",
        "",
        '@importc("__csg_rt_i32_to_str")',
        "fn __csg_rt_i32_to_str(value: int32): int32",
        "",
        '@importc("__csg_rt_bool_to_str")',
        "fn __csg_rt_bool_to_str(value: int32): int32",
        "",
        '@importc("__csg_rt_str_eq")',
        "fn __csg_rt_str_eq(left: int32, right: int32): bool",
        "",
        '@importc("__csg_rt_str_len")',
        "fn __csg_rt_str_len(value: int32): int32",
        "",
        '@importc("__csg_rt_str_starts_with")',
        "fn __csg_rt_str_starts_with(value: int32, needle: int32): bool",
        "",
        '@importc("__csg_rt_str_ends_with")',
        "fn __csg_rt_str_ends_with(value: int32, needle: int32): bool",
        "",
        '@importc("__csg_rt_str_includes")',
        "fn __csg_rt_str_includes(value: int32, needle: int32): bool",
        "",
        '@importc("__csg_rt_str_index_of")',
        "fn __csg_rt_str_index_of(value: int32, needle: int32): int32",
        "",
        '@importc("__csg_rt_str_index_of_from")',
        "fn __csg_rt_str_index_of_from(value: int32, needle: int32, fromIndex: int32): int32",
        "",
        '@importc("__csg_rt_str_last_index_of")',
        "fn __csg_rt_str_last_index_of(value: int32, needle: int32): int32",
        "",
        '@importc("__csg_rt_str_trim")',
        "fn __csg_rt_str_trim(value: int32): int32",
        "",
        '@importc("__csg_rt_str_to_lower")',
        "fn __csg_rt_str_to_lower(value: int32): int32",
        "",
        '@importc("__csg_rt_str_to_upper")',
        "fn __csg_rt_str_to_upper(value: int32): int32",
        "",
        '@importc("__csg_rt_str_slice")',
        "fn __csg_rt_str_slice(value: int32, start: int32, end: int32): int32",
        "",
        '@importc("__csg_rt_str_substring")',
        "fn __csg_rt_str_substring(value: int32, start: int32, end: int32): int32",
        "",
        '@importc("__csg_rt_str_char_at")',
        "fn __csg_rt_str_char_at(value: int32, index: int32): int32",
        "",
        '@importc("__csg_rt_str_char_code_at")',
        "fn __csg_rt_str_char_code_at(value: int32, index: int32): int32",
        "",
        '@importc("__csg_rt_str_split")',
        "fn __csg_rt_str_split(value: int32, separator: int32): int32",
    ].join("\n");
}
function locStart(fact) {
    const loc = fact.loc;
    return loc && Number.isInteger(loc.start) ? loc.start : 0;
}
function indent(depth) {
    return "    ".repeat(depth);
}
function failCompile(message) {
    return { ok: false, message };
}
