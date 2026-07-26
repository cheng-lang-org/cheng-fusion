// @ts-nocheck
// cheng_orphan_slot_scan: 产品化 /Users/lbcheng/cheng-f24/diag_T66/classify.py (在 fixture main fn
// 里找"被 LOAD 但整个函数体内从未 STORE 过"的 [sp,#off] 槽位 -> orphan-consumer, 读栈垃圾信号)。
// 相对原脚本修的已知盲点: stp/ldp 隐式零偏移("stp x0, x1, [sp]"/"ldp x0, x1, [sp]", 无 #imm)
// 之前完全不被 store/load 正则匹配, 会让第二个配对寄存器槽位的真实存储/加载不可见 ->
// 对应槽位若被别处以显式偏移 ldr/str 访问就会假报 orphan(今天在每个 fixture 上都炸过一次,
// 见 x1@sp+0x8 case); 单目 str/ldr 的 "[sp]"(无偏移=offset 0)同理。ldp 本身原脚本完全不解析
// (连当 load 都不算), 现在补上 —— 否则 stp 的隐式偏移修复对 load 侧没有对应的验证对象。
//
// 函数选择: fnFilter 是子串, 多个函数命中时原脚本 `for name in fns: if fn_filter in name: target=name`
// 是"字典最后一个命中的赢"(dict 迭代顺序 = 定义顺序, 完全跟 filter 本身的特异性无关) —— 这里改成
// 确定性的"最特异/精确后缀优先": 先看是否有唯一精确匹配(name===fnFilter), 否则优先后缀匹配
// (name.endsWith(fnFilter)), 再在候选池里选名字最短(离 fnFilter 越近, extra chars 越少)的那个;
// 若最终仍并列, 明确报 ambiguous 而不是隐式选一个 —— 不做启发式兜底.
//
// wOnly(默认 true): 32-bit w 寄存器 orphan load 进入优先候选; x 寄存器 orphan(常是 ABI 结构体
// 返回槽——callee 通过一个提前 `add x8, sp, #N` 算出的指针写入, 调用方代码里看不到显式
// `str ..., [sp,#N]`)仍然全量报出, 只是不计入优先候选。任何结果都不是正确性 verdict。
import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool, jsonResult, initChengToolkitModule, zodSchema} from "./cheng_toolkit_m9000.ts";

var chengOrphanSlotScanInputSchema, ChengOrphanSlotScanTool;

const ORPHAN_SLOT_SCAN_SCHEMA = "cheng_orphan_slot_scan";
const FUNCTION_LABEL_RE = /^(_\S+):$/;
const ARM64_IMMEDIATE = "-?(?:0x[0-9a-fA-F]+|\\d+)";
// Single/pair forms accept ordinary, pre-indexed and post-indexed [sp] addressing.
// The scanner tracks each SP adjustment relative to function entry, so two accesses with
// the same textual `[sp,#off]` but different live SP values are never conflated.
const SINGLE_SP_ACCESS_RE = new RegExp(`\\b(str|stur|ldr|ldur)\\s+(\\w+),\\s*\\[sp(?:,\\s*#(${ARM64_IMMEDIATE}))?\\](!?)(?:,\\s*#(${ARM64_IMMEDIATE}))?`, "i");
const PAIR_SP_ACCESS_RE = new RegExp(`\\b(stp|ldp)\\s+(\\w+),\\s*(\\w+),\\s*\\[sp(?:,\\s*#(${ARM64_IMMEDIATE}))?\\](!?)(?:,\\s*#(${ARM64_IMMEDIATE}))?`, "i");
const ANY_SP_ACCESS_RE = /\b(?:str|stur|ldr|ldur|stp|ldp)\b[^\n]*\[\s*sp\b/i;
const SP_ADJUST_RE = new RegExp(`\\b(add|sub)\\s+sp,\\s*sp,\\s*#(${ARM64_IMMEDIATE})\\b`, "i");
const UNSUPPORTED_SP_WRITE_RE = /\b(?:mov|and|orr|eor|lsl|lsr|asr)\s+sp\s*,/i;

function assertOrphanSlotScanReportSchema(report) {
  if (!report || typeof report !== "object" || report.schema !== ORPHAN_SLOT_SCAN_SCHEMA) {
    throw new Error(`unsupported orphan slot scan report schema: ${report?.schema}`);
  }
  return report;
}

function parseImmOffset(text, context) {
  if (text === undefined) return 0;
  const source = String(text);
  const negative = source.startsWith("-");
  const magnitudeText = negative ? source.slice(1) : source;
  const magnitude = magnitudeText.startsWith("0x") || magnitudeText.startsWith("0X") ? Number.parseInt(magnitudeText, 16) : Number.parseInt(magnitudeText, 10);
  if (!Number.isSafeInteger(magnitude)) throw new Error(`${context}: stack immediate is not a safe integer: ${text}`);
  return negative ? -magnitude : magnitude;
}

function parseSpAccess(line) {
  const pair = PAIR_SP_ACCESS_RE.exec(line);
  if (pair) {
    const preIndexed = pair[5] === "!";
    const baseImm = pair[4] === undefined ? 0 : parseImmOffset(pair[4], "stack pair access");
    const postImm = pair[6] === undefined ? null : parseImmOffset(pair[6], "stack pair access");
    if (preIndexed && postImm !== null) throw new Error(`stack pair access cannot be both pre- and post-indexed: ${line.trim()}`);
    if (preIndexed && pair[4] === undefined) throw new Error(`pre-indexed stack pair access requires an immediate: ${line.trim()}`);
    return {kind: /^stp$/i.test(pair[1]) ? "store" : "load", registers: [pair[2], pair[3]], baseImm, preIndexed, postImm};
  }
  const single = SINGLE_SP_ACCESS_RE.exec(line);
  if (single) {
    const preIndexed = single[4] === "!";
    const baseImm = single[3] === undefined ? 0 : parseImmOffset(single[3], "stack access");
    const postImm = single[5] === undefined ? null : parseImmOffset(single[5], "stack access");
    if (preIndexed && postImm !== null) throw new Error(`stack access cannot be both pre- and post-indexed: ${line.trim()}`);
    if (preIndexed && single[3] === undefined) throw new Error(`pre-indexed stack access requires an immediate: ${line.trim()}`);
    return {kind: /^(?:str|stur)$/i.test(single[1]) ? "store" : "load", registers: [single[2]], baseImm, preIndexed, postImm};
  }
  if (ANY_SP_ACCESS_RE.test(line)) throw new Error(`unsupported arm64 [sp] addressing form: ${line.trim()}`);
  return null;
}

// arm64 寄存器宽度(bit): w*=32, x*=64, s*=32, d*=64, q*=128. 认不出的(理论上不会出现在
// str/ldr/stp/ldp 的寄存器操作数位置, 因为 sp 本身只会出现在地址括号里当 base)返回 null.
function regWidthBits(reg) {
  const match = /^([bhsdqwx])(\d{1,2}|zr)$/i.exec(reg);
  if (!match) return null;
  switch (match[1].toLowerCase()) {
    case "b": return 8;
    case "h": return 16;
    case "w": return 32;
    case "x": return 64;
    case "s": return 32;
    case "d": return 64;
    case "q": return 128;
    default: return null;
  }
}

function registerBytes(reg, context) {
  const bits = regWidthBits(reg);
  if (bits === null) throw new Error(`${context}: unsupported register width for ${reg}`);
  return bits / 8;
}

function pairBytes(first, second, context) {
  const firstBytes = registerBytes(first, context);
  const secondBytes = registerBytes(second, context);
  if (firstBytes !== secondBytes) {
    throw new Error(`${context}: pair registers have different widths (${first}, ${second})`);
  }
  return firstBytes;
}

function runOtoolTv(objPath) {
  /* Compiler-scale thin objects (current backend driver ~59MB Mach-O) disassemble
     to ~500MB of text over tens of seconds; fixture-era 64MiB/15s limits
     ENOBUFS/ETIMEDOUT on exactly the inputs this tool exists for. */
  const result = spawnSync("otool", ["-tv", objPath], {encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024 * 1024});
  if (result.error) throw new Error(`otool -tv failed to run: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`otool -tv exited ${result.status} for ${objPath}: ${(result.stderr || "").trim()}`);
  }
  return result.stdout || "";
}

function parseOtoolFunctions(otoolOutput) {
  const fns = new Map();
  let cur = null;
  for (const rawLine of otoolOutput.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const labelMatch = FUNCTION_LABEL_RE.exec(line);
    if (labelMatch) {
      cur = labelMatch[1];
      fns.set(cur, []);
      continue;
    }
    if (cur !== null && line.length > 0) fns.get(cur).push(line);
  }
  return fns;
}

// 最特异/精确后缀优先选择, 明确决定性规则代替"最后一个命中的赢":
// 1) 唯一精确匹配(name===fnFilter)直接胜出;
// 2) 否则优先后缀匹配(name.endsWith(fnFilter))子集, 否则退到全部子串命中;
// 3) 该子集里选名字最短(离 fnFilter 最近)的; 若仍并列, 报 ambiguous 而不是隐式挑一个.
function selectFunction(names, fnFilter) {
  const substringMatches = names.filter((name) => name.includes(fnFilter));
  if (substringMatches.length === 0) return {name: null, candidates: []};
  if (substringMatches.length === 1) return {name: substringMatches[0], candidates: substringMatches};
  const exact = substringMatches.filter((name) => name === fnFilter);
  if (exact.length === 1) return {name: exact[0], candidates: substringMatches};
  const suffixMatches = substringMatches.filter((name) => name.endsWith(fnFilter));
  const pool = suffixMatches.length > 0 ? suffixMatches : substringMatches;
  const minLen = Math.min(...pool.map((name) => name.length));
  const mostSpecific = pool.filter((name) => name.length === minLen);
  if (mostSpecific.length === 1) return {name: mostSpecific[0], candidates: substringMatches};
  throw new Error(`fnFilter "${fnFilter}" is ambiguous: ${mostSpecific.length} equally-specific candidates (${mostSpecific.join(", ")}) among ${substringMatches.length} total substring matches (${substringMatches.join(", ")})`);
}

function parseOtoolInstruction(line, index) {
  const match = /^\s*([0-9a-fA-F]+)\s+(.+?)\s*$/.exec(line);
  return match ? {index, address: Number.parseInt(match[1], 16), text: match[2], raw: line} : {index, address: null, text: line, raw: line};
}

function branchTargetAddress(text) {
  const matches = [...String(text).matchAll(/\b0x([0-9a-fA-F]+)\b/g)];
  return matches.length === 0 ? null : Number.parseInt(matches.at(-1)[1], 16);
}

function successorsForInstruction(instructions, addressToIndex, instruction) {
  const text = instruction.text.trim().toLowerCase();
  const fallthrough = instruction.index + 1 < instructions.length ? [instruction.index + 1] : [];
  if (/^ret\b/.test(text)) return [];
  if (/^(?:br|braa|brab|eret)\b/.test(text)) {
    throw new Error(`unsupported indirect arm64 control flow while tracking stack slots: ${instruction.raw.trim()}`);
  }
  const unconditional = /^b\s+(?!\.)(?:0x[0-9a-f]+)\b/.test(text);
  const conditional = /^(?:b\.[a-z]+|cbz|cbnz|tbz|tbnz)\b/.test(text);
  if (!unconditional && !conditional) return fallthrough;
  const targetAddress = branchTargetAddress(text);
  const targetIndex = targetAddress === null ? undefined : addressToIndex.get(targetAddress);
  if (targetIndex === undefined) throw new Error(`unresolvable arm64 branch target while tracking stack slots: ${instruction.raw.trim()}`);
  return conditional ? [...fallthrough, targetIndex] : [targetIndex];
}

function classifyFunctionBody(lines) {
  const stores = [];
  const loads = [];
  const addStore = (offset, bytes) => stores.push({start: offset, end: offset + bytes});
  // `offset` remains the operand's local [sp,#offset] spelling for users; the
  // canonical frame-relative coordinate is retained only for coverage analysis.
  const addLoad = (canonicalOffset, displayOffset, reg, line) => loads.push({offset: displayOffset, canonicalOffset, bytes: registerBytes(reg, "stack load"), reg, line: line.trim()});
  if (lines.length === 0) return {insns: 0, storeCount: 0, loadCount: 0, orphans: []};
  const instructions = lines.map(parseOtoolInstruction);
  const anyAddress = instructions.some((instruction) => instruction.address !== null);
  const allAddressed = instructions.every((instruction) => instruction.address !== null);
  if (anyAddress && !allAddressed) throw new Error("otool function body mixes addressed and unaddressed instruction lines");
  const addressToIndex = new Map();
  if (allAddressed) {
    for (const instruction of instructions) {
      if (addressToIndex.has(instruction.address)) throw new Error(`duplicate otool instruction address: ${instruction.raw.trim()}`);
      addressToIndex.set(instruction.address, instruction.index);
    }
  }
  const states = new Map([[0, new Set([0])]]);
  const pending = [[0, 0]];
  const processed = new Set();
  while (pending.length > 0) {
    const [index, incomingDelta] = pending.pop();
    const stateKey = `${index}:${incomingDelta}`;
    if (processed.has(stateKey)) continue;
    processed.add(stateKey);
    const instruction = instructions[index];
    if (!instruction) throw new Error(`stack dataflow reached an invalid instruction index: ${index}`);
    const line = instruction.text;
    let nextDelta = incomingDelta;
    const adjustment = SP_ADJUST_RE.exec(line);
    if (adjustment) {
      const amount = parseImmOffset(adjustment[2], "stack pointer adjustment");
      nextDelta += /^sub$/i.test(adjustment[1]) ? -amount : amount;
    } else {
      if (UNSUPPORTED_SP_WRITE_RE.test(line)) throw new Error(`unsupported arm64 stack-pointer write: ${instruction.raw.trim()}`);
      const access = parseSpAccess(line);
      if (access) {
        if (access.preIndexed) nextDelta += access.baseImm;
        const offset = access.preIndexed ? nextDelta : nextDelta + access.baseImm;
        if (!Number.isSafeInteger(offset)) throw new Error(`stack access offset is not a safe integer: ${instruction.raw.trim()}`);
        if (access.registers.length === 1) {
          if (access.kind === "store") addStore(offset, registerBytes(access.registers[0], "stack store"));
          else addLoad(offset, access.baseImm, access.registers[0], instruction.raw);
        } else {
          const bytes = pairBytes(access.registers[0], access.registers[1], `stack pair ${access.kind}`);
          if (access.kind === "store") {
            addStore(offset, bytes);
            addStore(offset + bytes, bytes);
          } else {
            addLoad(offset, access.baseImm, access.registers[0], instruction.raw);
            addLoad(offset + bytes, access.baseImm + bytes, access.registers[1], instruction.raw);
          }
        }
        if (access.postImm !== null) nextDelta += access.postImm;
      }
    }
    if (!Number.isSafeInteger(nextDelta)) throw new Error(`stack pointer delta is not a safe integer: ${instruction.raw.trim()}`);
    const successors = allAddressed ? successorsForInstruction(instructions, addressToIndex, instruction) : (index + 1 < instructions.length && !/^ret\b/i.test(line.trim()) ? [index + 1] : []);
    for (const successor of successors) {
      let values = states.get(successor);
      if (!values) states.set(successor, values = new Set());
      if (values.has(nextDelta)) continue;
      // Distinct incoming SP values at one instruction make an implicit stack slot
      // ambiguous. Reporting a candidate in that state would be fabricated evidence.
      if (values.size > 0) throw new Error(`ambiguous arm64 stack-pointer state at ${instructions[successor].raw.trim()}`);
      values.add(nextDelta);
      pending.push([successor, nextDelta]);
    }
  }
  stores.sort((a, b) => a.start - b.start || a.end - b.end);
  const covered = [];
  for (const interval of stores) {
    const last = covered[covered.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else covered.push({...interval});
  }
  const orphans = loads.filter((load) => !covered.some((store) => store.start <= load.canonicalOffset && store.end >= load.canonicalOffset + load.bytes));
  return {insns: lines.length, storeCount: stores.length, loadCount: loads.length, orphans};
}

function scanOrphanSlots(objPath, fnFilter, wOnly) {
  const fns = parseOtoolFunctions(runOtoolTv(objPath));
  if (fns.size === 0) throw new Error(`otool -tv produced no recognizable functions for ${objPath} (not a Mach-O relocatable object, or the __text section is empty)`);
  const names = [...fns.keys()];
  const selected = selectFunction(names, fnFilter);
  if (!selected.name) {
    throw new Error(`no function matching fnFilter "${fnFilter}" in ${objPath}; available functions (first 10 of ${names.length}): ${names.slice(0, 10).join(", ")}`);
  }
  const {insns, storeCount, loadCount, orphans} = classifyFunctionBody(fns.get(selected.name));
  const orphanDetails = orphans.map((orphan) => ({offset: orphan.offset, bytes: orphan.bytes, line: orphan.line, reg: orphan.reg, width: regWidthBits(orphan.reg)}));
  const gatedOrphans = wOnly ? orphanDetails.filter((orphan) => orphan.width === 32) : orphanDetails;
  const informationalOrphans = wOnly ? orphanDetails.filter((orphan) => orphan.width !== 32) : [];
  const notes = [];
  if (selected.candidates.length > 1) {
    notes.push(`fnFilter matched ${selected.candidates.length} functions; selected most-specific/exact-suffix "${selected.name}" (candidates: ${selected.candidates.join(", ")})`);
  }
  if (informationalOrphans.length > 0) {
    notes.push(`${informationalOrphans.length} non-32-bit explicit orphan candidate(s) are outside the wOnly priority set (callee/computed-pointer writes are invisible to this narrow scan)`);
  }
  return {
    schema: ORPHAN_SLOT_SCAN_SCHEMA,
    objPath,
    fnFilter,
    wOnly,
    fn: selected.name,
    insns,
    stores: storeCount,
    loads: loadCount,
    orphans: orphanDetails,
    status: orphanDetails.length > 0 ? "EXPLICIT_ORPHAN_CANDIDATES" : "NO_EXPLICIT_ORPHAN_CANDIDATES",
    priorityCandidateCount: gatedOrphans.length,
    notes: notes.length > 0 ? notes.join(" ") : null,
  };
}

function resolveObjPath(value) {
  if (!value) throw new Error("objPath is required");
  const path = String(value);
  if (!existsSync(path)) throw new Error(`objPath not found: ${path}`);
  if (!path.endsWith(".o")) throw new Error(`objPath must be a .o file, got: ${path}`);
  return path;
}

var initChengOrphanSlotScanModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengOrphanSlotScanInputSchema = zodSchema.strictObject({
    objPath: zodSchema.string().describe("Absolute path to a .o (relocatable object) file, disassembled via `otool -tv`."),
    fnFilter: zodSchema.string().min(1).describe("Substring to select the function to scan. If multiple functions match, the most specific one wins: a unique exact match first, then the shortest suffix match, never 'last one found'; truly tied candidates raise an error instead of guessing."),
    wOnly: zodSchema.boolean().optional().describe("Default true: only 32-bit w-register orphan loads enter the priority candidate set. Every explicit candidate remains listed in `orphans`; this option never creates a correctness verdict."),
  });
  ChengOrphanSlotScanTool = createChengTextTool({
    name: "cheng_orphan_slot_scan",
    searchHint: "scan a .o's disassembled function for [sp,#off] stack slots that are loaded but never stored anywhere in the function (orphan-consumer / stale-stack-read signal)",
    inputSchema: chengOrphanSlotScanInputSchema,
    description: "Productizes diag_T66/classify.py as a narrow structural diagnostic: disassembles objPath via `otool -tv`, selects the function whose name matches fnFilter, and lists explicit [sp,#offset] loads whose complete byte range is not covered by an explicit str/stur/stp in that same function body. Pair stride is derived from register width (w/s=4, x/d=8, q=16), including implicit-zero-offset stp/ldp. Computed-pointer/callee writes and control flow are outside this scan, so the result is always a candidate list, never a GOOD/BAD correctness verdict. wOnly only selects 32-bit priority candidates; it never suppresses the full orphan list.",
    prompt: "Use after a suspected orphan-slot/stale-stack-read miscompile to get a deterministic explicit-access candidate list for one function of a .o; confirm candidates with runtime or control-flow evidence before claiming a bug.",
    toAutoClassifierInput: (input) => `orphan_slot_scan:${input.objPath}:${input.fnFilter}`,
    async execute(input) {
      const objPath = resolveObjPath(input.objPath);
      const wOnly = input.wOnly !== false;
      return jsonResult(assertOrphanSlotScanReportSchema(scanOrphanSlots(objPath, input.fnFilter, wOnly)));
    },
  });
});

export {ChengOrphanSlotScanTool, assertOrphanSlotScanReportSchema, classifyFunctionBody, initChengOrphanSlotScanModule};
