// @ts-nocheck
// cheng_addr_symbolicate: 从 exe 崩溃地址反查 .o 符号+偏移。链产的 GEN2/DRV 被内部 linker
// 剥符号(nm 只剩几十个动态符号), *.map 是 cheng_line_map_v1 行映射(无地址字段), 唯一还留着
// 完整符号表的是链前的 <name>.primary.o(nm -n 几千到上万条 T/t 符号)。
//
// 与既有 symbolizeChengPc(cheng_toolkit_m9000.ts, 供 cheng_crash_triage/cheng_corrupt_hunt 用)的
// 区别: 那条路径靠 otool -l 文本解析 + "primary.o 的代码在链接产物里从文件偏移 0 开始摆放"这个
// 未经验证的假设做地址算术, 对活的调试会话足够(还有 provider 兄弟 .o 的内容锚点定位兜底)。这里是
// 离线场景(只有一个历史崩溃地址, 没有可复现的进程), 所以：
//   1) 自己直接解析 Mach-O load commands 拿 __TEXT,__text 的 addr/size/文件内 offset, 不依赖
//      otool 文本格式(不同 otool 版本的输出格式差异不会影响这里)。
//   2) 不只做地址算术就下结论 —— 在假设的偏移处从 exe 切一段字节窗, 到 .o 的 __text 节里做内容
//      搜索, 唯一命中才判(与 locateProviderBase 同一手法, 只是这里验证的是"主对象自己的偏移
//      假设"本身, 不是 provider 拼接基址), 零命中/多命中如实返回, 不猜。
//
// 窗口大小实测踩过的坑: 起 64 字节在真实崩溃地址(0x100ee84f8, ignite_20260717T214635_f91128
// 的 GEN2)上命中 5 处 —— 这段代码是"struct 逐字段 ldr/str 拷贝", 同样的指令序列在 21MB 的
// primary.o 里重复出现多次, 64 字节窗完全不够格判"唯一"。按 WINDOW_LADDER 递增到 160 字节才
// 唯一; 继续放大到 256+ 反而命中数变 0(窗口跨过一处引用外部符号/字面量的重定位字, 链接后立即数
// 变了, 逐字节不再相同)。见到 0 立即停止放大并报最后一次的非零结果 —— 放大不会让命中数变回
// 非零, 再试更大的窗口没有意义。
import {existsSync, readFileSync, statSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {isAbsolute} from "node:path";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool, jsonResult, initChengToolkitModule, zodSchema} from "./cheng_toolkit_m9000.ts";

var chengAddrSymbolicateInputSchema, ChengAddrSymbolicateTool;

const MH_MAGIC_64 = 0xfeedfacf;
const LC_SEGMENT_64 = 0x19;
const WINDOW_LADDER = [64, 96, 128, 160, 192, 224, 256, 320, 384, 448, 512, 640, 768, 896, 1024];

// 路径白名单: 只认已存在的绝对路径普通文件(不接受相对路径/目录/符号解析猜测)。
function resolveExistingAbsoluteFile(value, label) {
  if (!value) throw new Error(`${label} is required`);
  const text = String(value);
  if (!isAbsolute(text)) throw new Error(`${label} must be an absolute path, got: ${text}`);
  if (!existsSync(text)) throw new Error(`${label} not found: ${text}`);
  if (!statSync(text).isFile()) throw new Error(`${label} is not a regular file: ${text}`);
  return text;
}

function parseAddressInput(value) {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) throw new Error(`address must be a non-negative integer, got: ${value}`);
    return value;
  }
  const text = String(value).trim();
  const parsed = /^0x/i.test(text) ? parseInt(text, 16) : parseInt(text, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`address must be a hex (0x...) or decimal non-negative integer, got: ${value}`);
  }
  return parsed;
}

function cstr16(buf, off) {
  const slice = buf.subarray(off, off + 16);
  const nul = slice.indexOf(0);
  return (nul >= 0 ? slice.subarray(0, nul) : slice).toString("utf8");
}

// 直接解析 Mach-O load commands 找 __TEXT,__text 节的 addr/size/文件内 offset。兼容可执行文件
// (LC_SEGMENT_64.segname 本身就是 "__TEXT")和可重定位 .o(单个匿名段, 但节自己的 segname 字段
// 仍是 "__TEXT") —— 两种情况都只看 section 自己的 sectname/segname, 不看外层 segment 的名字。
function findTextSection(buf, label) {
  if (buf.length < 32) throw new Error(`${label} too small to be a Mach-O file`);
  const magic = buf.readUInt32LE(0);
  if (magic !== MH_MAGIC_64) {
    throw new Error(`${label} is not a 64-bit little-endian Mach-O (MH_MAGIC_64 0xfeedfacf expected, got 0x${magic.toString(16)})`);
  }
  const ncmds = buf.readUInt32LE(16);
  let off = 32; // sizeof(mach_header_64)
  for (let i = 0; i < ncmds; i++) {
    if (off + 8 > buf.length) break;
    const cmd = buf.readUInt32LE(off);
    const cmdsize = buf.readUInt32LE(off + 4);
    if (cmdsize <= 0) break;
    if (cmd === LC_SEGMENT_64) {
      const nsects = buf.readUInt32LE(off + 64);
      let sectOff = off + 72;
      for (let s = 0; s < nsects; s++) {
        const sectname = cstr16(buf, sectOff);
        const segname = cstr16(buf, sectOff + 16);
        if (sectname === "__text" && segname === "__TEXT") {
          const addr = Number(buf.readBigUInt64LE(sectOff + 32));
          const size = Number(buf.readBigUInt64LE(sectOff + 40));
          const fileOff = buf.readUInt32LE(sectOff + 48);
          return {addr, size, fileOff};
        }
        sectOff += 80; // sizeof(section_64)
      }
    }
    off += cmdsize;
  }
  return null;
}

// nm -n 的 T(全局)/t(局部)符号地址表按地址升序; 只认 T 会漏掉海量 local 符号, 让
// nearest-preceding 命中一个离得很远的全局符号(与 cheng_toolkit_m9000.ts 内部版本同一教训)。
function nmTextSymbolsFor(objectPath) {
  const result = spawnSync("nm", ["-n", objectPath], {encoding: "utf8", timeout: 20000, maxBuffer: 128 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout) return [];
  const symbols = [];
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^([0-9a-fA-F]{16})\s+[Tt]\s+(\S+)$/);
    if (match) symbols.push({addr: Number(`0x${match[1]}`), name: match[2]});
  }
  symbols.sort((a, b) => a.addr - b.addr);
  return symbols;
}

function nearestPrecedingSymbol(symbols, addr) {
  let lo = 0, hi = symbols.length - 1, best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (symbols[mid].addr <= addr) {
      best = symbols[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

// window 在 haystack 里的全部出现位置(与 locateProviderBase 同一枚举写法), 不设隐藏截断上限 ——
// 命中数本身就是输出的一部分, 多命中要如实报, 截断会漏掉真实的歧义。
function findAllOccurrences(haystack, needle) {
  const hits = [];
  let from = 0;
  for (;;) {
    const hit = haystack.indexOf(needle, from);
    if (hit < 0) break;
    hits.push(hit);
    from = hit + 1;
  }
  return hits;
}

function symbolicateAddress(binaryPath, objectPath, address, requestedWindowSize) {
  const exeBuf = readFileSync(binaryPath);
  const objBuf = readFileSync(objectPath);
  const exeText = findTextSection(exeBuf, "binaryPath");
  const objText = findTextSection(objBuf, "objectPath");
  if (!exeText) throw new Error(`binaryPath has no __TEXT,__text section: ${binaryPath}`);
  if (!objText) throw new Error(`objectPath has no __TEXT,__text section: ${objectPath}`);

  const addressHex = `0x${address.toString(16)}`;
  // AArch64 instructions are always 4-byte aligned; a misaligned crash address cannot be a real
  // instruction PC. Reject up front, before any window search, rather than let an unaligned
  // address flow into byte-matching and produce a misleadingly "confident" result.
  if (address % 4 !== 0) {
    throw new Error(`address must be 4-byte aligned (AArch64 instruction alignment), got: ${addressHex} (address % 4 = ${address % 4})`);
  }
  const relative = address - exeText.addr;
  if (relative < 0 || relative >= exeText.size) {
    return {
      schema: "cheng_addr_symbolicate.v1", binaryPath, objectPath, address: addressHex,
      symbol: null, symbolOffset: null, matchCount: 0, confidence: "none",
      reason: "address_outside_text_section",
      exeText: {addr: `0x${exeText.addr.toString(16)}`, size: exeText.size, end: `0x${(exeText.addr + exeText.size).toString(16)}`},
    };
  }

  const exeFileOffset = exeText.fileOff + relative;
  const objTextBytes = objBuf.subarray(objText.fileOff, objText.fileOff + objText.size);
  const availableInExe = exeBuf.length - exeFileOffset;
  const ladderStart = Math.max(64, Number(requestedWindowSize) || 64);
  const ladder = WINDOW_LADDER.filter((size) => size >= ladderStart);
  if (ladder.length === 0 || ladder[0] !== ladderStart) ladder.unshift(ladderStart);

  let lastNonEmpty = null; // {windowSize, hits}
  let resolved = null;
  const attempts = [];
  for (const windowSize of ladder) {
    const actualSize = Math.min(windowSize, availableInExe);
    if (actualSize < 16) break; // too close to the end of the section to say anything meaningful
    const window = exeBuf.subarray(exeFileOffset, exeFileOffset + actualSize);
    const hits = findAllOccurrences(objTextBytes, window);
    attempts.push({requestedWindowSize: windowSize, actualWindowSize: actualSize, matchCount: hits.length});
    if (hits.length === 0) break; // a superset of an already-matched window never re-matches by growing further
    lastNonEmpty = {windowSize: actualSize, hits};
    if (hits.length === 1) {
      resolved = lastNonEmpty;
      break;
    }
  }

  if (!resolved) {
    const matchCount = lastNonEmpty ? lastNonEmpty.hits.length : 0;
    return {
      schema: "cheng_addr_symbolicate.v1", binaryPath, objectPath, address: addressHex,
      symbol: null, symbolOffset: null, matchCount, confidence: matchCount > 1 ? "ambiguous" : "none",
      reason: matchCount > 1 ? "multiple_candidate_offsets_in_object" : "no_matching_byte_sequence_in_object",
      windowAttempts: attempts,
      candidateOffsets: lastNonEmpty ? lastNonEmpty.hits.map((h) => `0x${(objText.addr + h).toString(16)}`) : [],
    };
  }

  const localAddr = objText.addr + resolved.hits[0];
  const symbols = nmTextSymbolsFor(objectPath);
  const sym = nearestPrecedingSymbol(symbols, localAddr);
  if (!sym) {
    return {
      schema: "cheng_addr_symbolicate.v1", binaryPath, objectPath, address: addressHex,
      symbol: null, symbolOffset: null, matchCount: 1, confidence: "none",
      reason: "unique_byte_match_but_no_preceding_symbol_in_object_symtab",
      windowAttempts: attempts,
    };
  }
  return {
    schema: "cheng_addr_symbolicate.v1", binaryPath, objectPath, address: addressHex,
    symbol: sym.name, symbolOffset: localAddr - sym.addr, matchCount: 1, confidence: "high",
    windowSize: resolved.windowSize, windowAttempts: attempts,
  };
}

var initChengAddrSymbolicateModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengAddrSymbolicateInputSchema = zodSchema.strictObject({
    binaryPath: zodSchema.string().describe("Absolute path to the linked Mach-O executable the crash address belongs to (e.g. a chain-baked GEN2)."),
    objectPath: zodSchema.string().describe("Absolute path to the sibling .primary.o (or any .o) whose __text carries a full nm symbol table, used to resolve the matched byte offset to a function+offset."),
    address: zodSchema.union([zodSchema.string(), zodSchema.number()]).describe("Crash virtual address, hex (0x...) or decimal, as it appears in binaryPath's own __TEXT.__text (no slide correction is applied)."),
    windowSize: zodSchema.number().int().min(64).optional().describe("Starting byte window size (must be >=64). Escalates automatically through a fixed ladder (64,96,128,...,1024) until exactly one match is found in objectPath's __text, or the match count drops to 0 (reported using the last non-empty result). Default 64."),
  });
  ChengAddrSymbolicateTool = createChengTextTool({
    name: "cheng_addr_symbolicate",
    searchHint: "resolve a crash virtual address in a linked Cheng-built executable to a function+offset by content-matching against its sibling .primary.o, without otool text parsing or debug info",
    inputSchema: chengAddrSymbolicateInputSchema,
    description: "Symbolicates a crash address inside a linked Mach-O executable that has been stripped by Cheng's internal linker (nm sees only a handful of dynamic symbols) against its sibling .primary.o (which still carries a full local+global nm symbol table). Parses both Mach-O files' load commands directly (no otool text-format dependency) to find __TEXT,__text's addr/size/file-offset, extracts the raw instruction bytes at `address` in binaryPath, and searches for that exact byte sequence inside objectPath's __text — starting at a 64-byte window and escalating through a fixed ladder until the match becomes unique (repetitive code patterns, e.g. unrolled struct-field copies, commonly make small windows non-unique) or the match count drops to zero (the window crossed a link-time-patched relocation byte; reported honestly using the last non-empty result, never guessed). A unique match's offset is mapped through `nm -n` to its enclosing function + offset. Multiple or zero matches are reported as-is (confidence 'ambiguous'/'none'), never silently guessed.",
    prompt: "Use with a crash address recorded from a chain run (e.g. journal/lldb output) plus the run's GEN2/GEN2.primary.o pair to get a function name without a bisect bake or a live lldb session.",
    toAutoClassifierInput: (input) => `addr_symbolicate:${input.binaryPath}:${input.address}`,
    async execute(input) {
      const binaryPath = resolveExistingAbsoluteFile(input.binaryPath, "binaryPath");
      const objectPath = resolveExistingAbsoluteFile(input.objectPath, "objectPath");
      const address = parseAddressInput(input.address);
      return jsonResult(symbolicateAddress(binaryPath, objectPath, address, input.windowSize));
    },
  });
});

export {ChengAddrSymbolicateTool, initChengAddrSymbolicateModule};
