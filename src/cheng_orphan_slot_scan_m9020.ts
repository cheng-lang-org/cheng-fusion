// @ts-nocheck
// cheng_orphan_slot_scan: 产品化 /Users/lbcheng/cheng-f24/diag_T66/classify.py (在 fixture main fn
// 里找"被 LOAD 但整个函数体内从未 STORE 过"的 [sp,#off] 槽位 -> orphan-consumer, 读栈垃圾信号)。
// 相对原脚本修的已知盲点: stp/ldp 隐式零偏移("stp x0, x1, [sp]"/"ldp x0, x1, [sp]", 无 #imm)
// 之前完全不被 store/load 正则匹配, 会让配对寄存器(如 offset+8 那个)的真实存储/加载不可见 ->
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
// wOnly(默认 true): 32-bit w 寄存器 orphan load 才计入 BAD 判决; x 寄存器 orphan(常是 ABI 结构体
// 返回槽——callee 通过一个提前 `add x8, sp, #N` 算出的指针写入, 调用方代码里看不到显式
// `str ..., [sp,#N]`, 是已知的、与真实 bug 无关的构造性噪音)仍然全量报出, 只是不计入 verdict。
import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool, jsonResult, initChengToolkitModule, zodSchema} from "./cheng_toolkit_m9000.ts";

var chengOrphanSlotScanInputSchema, ChengOrphanSlotScanTool;

const FUNCTION_LABEL_RE = /^(_\S+):$/;
// str/ldr(单寄存器): [sp] 无偏移 == offset 0, 与 [sp,#imm] 二选一, 用可选分组承载.
const STORE_RE = /\b(?:str|stur)\s+(\w+),\s*\[sp(?:,\s*#(0x[0-9a-fA-F]+|\d+))?\]/;
const LOAD_RE = /\b(?:ldr|ldur)\s+(\w+),\s*\[sp(?:,\s*#(0x[0-9a-fA-F]+|\d+))?\]/;
// stp/ldp(寄存器对): 第二个寄存器落在 offset+8. [sp] 无偏移同样按 offset 0 处理.
const STP_RE = /\bstp\s+(\w+),\s*(\w+),\s*\[sp(?:,\s*#(0x[0-9a-fA-F]+|\d+))?\]/;
const LDP_RE = /\bldp\s+(\w+),\s*(\w+),\s*\[sp(?:,\s*#(0x[0-9a-fA-F]+|\d+))?\]/;

function parseImmOffset(text) {
  if (text === undefined) return 0;
  return text.startsWith("0x") || text.startsWith("0X") ? parseInt(text, 16) : parseInt(text, 10);
}

// arm64 寄存器宽度(bit): w*=32, x*=64, s*=32, d*=64, q*=128. 认不出的(理论上不会出现在
// str/ldr/stp/ldp 的寄存器操作数位置, 因为 sp 本身只会出现在地址括号里当 base)返回 null.
function regWidthBits(reg) {
  const match = /^([wxsdq])(\d{1,2}|zr)$/i.exec(reg);
  if (!match) return null;
  switch (match[1].toLowerCase()) {
    case "w": return 32;
    case "x": return 64;
    case "s": return 32;
    case "d": return 64;
    case "q": return 128;
    default: return null;
  }
}

function runOtoolTv(objPath) {
  const result = spawnSync("otool", ["-tv", objPath], {encoding: "utf8", timeout: 15000, maxBuffer: 64 * 1024 * 1024});
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

function classifyFunctionBody(lines) {
  const stores = new Set();
  const loads = [];
  for (const line of lines) {
    let match = STORE_RE.exec(line);
    if (match) stores.add(parseImmOffset(match[2]));
    match = STP_RE.exec(line);
    if (match) {
      const offset = parseImmOffset(match[3]);
      stores.add(offset);
      stores.add(offset + 8);
    }
    match = LOAD_RE.exec(line);
    if (match) loads.push({offset: parseImmOffset(match[2]), reg: match[1], line: line.trim()});
    match = LDP_RE.exec(line);
    if (match) {
      const offset = parseImmOffset(match[3]);
      loads.push({offset, reg: match[1], line: line.trim()});
      loads.push({offset: offset + 8, reg: match[2], line: line.trim()});
    }
  }
  const orphans = loads.filter((load) => !stores.has(load.offset));
  return {insns: lines.length, storeCount: stores.size, loadCount: loads.length, orphans};
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
  const orphanDetails = orphans.map((orphan) => ({offset: orphan.offset, line: orphan.line, reg: orphan.reg, width: regWidthBits(orphan.reg)}));
  const gatedOrphans = wOnly ? orphanDetails.filter((orphan) => orphan.width === 32) : orphanDetails;
  const informationalOrphans = wOnly ? orphanDetails.filter((orphan) => orphan.width !== 32) : [];
  const notes = [];
  if (selected.candidates.length > 1) {
    notes.push(`fnFilter matched ${selected.candidates.length} functions; selected most-specific/exact-suffix "${selected.name}" (candidates: ${selected.candidates.join(", ")})`);
  }
  if (informationalOrphans.length > 0) {
    notes.push(`${informationalOrphans.length} non-32-bit orphan load(s) reported informationally only, not counted toward verdict (wOnly=true; typically ABI struct-return slots a callee writes through a pointer, invisible as a direct [sp,#off] store in this function's own disassembly)`);
  }
  return {
    schema: "cheng_orphan_slot_scan.v1",
    objPath,
    fnFilter,
    wOnly,
    fn: selected.name,
    insns,
    stores: storeCount,
    loads: loadCount,
    orphans: orphanDetails,
    verdict: gatedOrphans.length > 0 ? "BAD" : "GOOD",
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
    wOnly: zodSchema.boolean().optional().describe("Default true: only 32-bit w-register orphan loads count toward verdict=BAD. x/d/q-register orphans (often ABI struct-return slots written by a callee through a pointer, not a real bug) are still listed in `orphans` but reported informationally and excluded from the verdict gate."),
  });
  ChengOrphanSlotScanTool = createChengTextTool({
    name: "cheng_orphan_slot_scan",
    searchHint: "scan a .o's disassembled function for [sp,#off] stack slots that are loaded but never stored anywhere in the function (orphan-consumer / stale-stack-read signal)",
    inputSchema: chengOrphanSlotScanInputSchema,
    description: "Productizes diag_T66/classify.py: disassembles objPath via `otool -tv`, selects the function whose name matches fnFilter (most-specific/exact-suffix wins on ambiguity, never 'last defined wins'), and finds [sp,#offset] slots read by ldr/ldur/ldp but never written by any str/stur/stp in that same function body — an orphan load is a real stale-stack-read signal. Fixes the known stp/ldp implicit-zero-offset blind spot (`stp x0, x1, [sp]` with no `#imm` previously matched no store regex at all, silently missing offset 0 and offset+8 and causing false orphans against a later explicit-offset load of that same slot) and adds ldp load tracking (previously not parsed at all). wOnly (default true) narrows the BAD verdict to 32-bit w-register orphans only; wider orphans are still listed but flagged informational (typically ABI struct-return slots a callee writes through a pointer, not a caller-visible [sp,#off] store).",
    prompt: "Use after a suspected orphan-slot/stale-stack-read miscompile to get a deterministic verdict on one function of a .o, instead of re-deriving classify.py's regex by hand each time.",
    toAutoClassifierInput: (input) => `orphan_slot_scan:${input.objPath}:${input.fnFilter}`,
    async execute(input) {
      const objPath = resolveObjPath(input.objPath);
      const wOnly = input.wOnly !== false;
      return jsonResult(scanOrphanSlots(objPath, input.fnFilter, wOnly));
    },
  });
});

export {ChengOrphanSlotScanTool, initChengOrphanSlotScanModule};
