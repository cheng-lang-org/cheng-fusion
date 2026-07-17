// @ts-nocheck
// cheng_corrupt_hunt: 两阶段 lldb watchpoint 写点定位。方法论取自今日案卷
// docs/patches-form34-layerA-writer.md(gen2 seq 头腐蚀取证): 阶段1 在一个已知的"检测点"
// (断点)读出被害地址 H(基址寄存器 + 偏移)和它当下的(往往已经被坏的)值; 阶段2 换一个全新
// lldb 进程, 直接在 H 上挂 write watchpoint, 从进程起点开始重放, 第一批真正命中就是把 H
// 写坏的那条指令(及其调用栈) —— 不用像案卷里那样手工反汇编/试凑锚点, 工具化成两次调用。
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool, jsonResult, chengCorruptHunt, initChengToolkitModule, zodSchema} from "./cheng_toolkit_m9000.ts";

var chengCorruptHuntInputSchema, ChengCorruptHuntTool;

var initChengCorruptHuntModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  // MCP 顶层 inputSchema 必须是 {type:"object"}(顶层 zod union 会序列化成裸 anyOf, 客户端整个
  // 工具列表拒收 —— 见 cheng_crash_triage 的同一条注释)。breakAddr/breakSymbol 两选一同样建模
  // 成一个 object 里的两组 optional 字段, 运行时强制恰好一种。
  chengCorruptHuntInputSchema = zodSchema.strictObject({
    binary: zodSchema.string().describe("Absolute path to the executable to run under lldb (same binary/args/env used for both stages)."),
    args: zodSchema.array(zodSchema.string()).optional().describe("argv passed to binary."),
    env: zodSchema.record(zodSchema.string(), zodSchema.string()).optional().describe("Extra environment variables for the debuggee only. They never alter the LLDB controller process; CHENG_PROCESS_MAX_RSS_BYTES is reserved and cannot be overridden."),
    breakAddr: zodSchema.string().optional().describe("Stage-1 breakpoint address as a hex string (with or without 0x prefix). Mutually exclusive with breakSymbol. The tool explicitly disables ASLR and proves that setting in both stages, so repeated launches use the same address space."),
    breakSymbol: zodSchema.string().optional().describe("Stage-1 breakpoint by function name, resolved via `nm -n primaryObject` and normalized against that object's __TEXT,__text section address before mapping to the linked binary's __text start (the system-link-exec primary+provider concatenation convention), with zero ASLR slide. Mutually exclusive with breakAddr. For symbols inside linked provider objects, or a mid-function offset that isn't a symbol's own entry point, compute the address yourself and pass breakAddr instead."),
    primaryObject: zodSchema.string().optional().describe("Path to the driver's own primary .o (or, for a plain non-Cheng binary, whichever single relocatable .o was linked first). Required with breakSymbol for address resolution; also used standalone to symbolicate stage1/stage2 backtraces even in breakAddr mode."),
    watchRegister: zodSchema.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/).describe("Register holding the base pointer at the stage-1 breakpoint, e.g. 'x1' (no '$' prefix)."),
    watchOffset: zodSchema.number().int().describe("Byte offset from watchRegister's value to the watched address: H = watchRegister value + watchOffset."),
    watchSize: zodSchema.union([zodSchema.literal(1), zodSchema.literal(2), zodSchema.literal(4), zodSchema.literal(8)]).describe("Watchpoint width in bytes: 1, 2, 4, or 8."),
    breakpointSkip: zodSchema.number().int().nonnegative().max(256).optional().describe("Number of earlier stage-1 breakpoint hits to skip before reading the victim address. Default 0 means the first hit; 1 means the second hit. This is independent of stage-2 maxHits."),
    maxHits: zodSchema.number().int().positive().max(256).optional().describe("Max stage-2 watchpoint hits to record before stopping. Default 8."),
    timeoutSec: zodSchema.number().positive().max(600).optional().describe("Per-stage lldb session timeout in seconds, maximum 600. Default 60."),
    maxOutputBytes: zodSchema.number().int().positive().max(1024 * 1024 * 1024).optional().describe("Maximum combined LLDB stdout/stderr bytes per stage, maximum 1 GiB. Overflow is a hard error."),
  });
  ChengCorruptHuntTool = createChengTextTool({
    name: "cheng_corrupt_hunt",
    searchHint: "two-stage lldb watchpoint hunt: locate the exact instruction that corrupted a header/struct field at a known address",
    inputSchema: chengCorruptHuntInputSchema,
    description: "Two-stage lldb watchpoint write-point localization. The binary and optional primaryObject must be non-empty regular non-symlink files; their SHA-256/inode/size are locked before stage 1, rechecked before stage 2, and checked again after stage 2. Stage 1 creates one target breakpoint, applies LLDB ignore-count=breakpointSkip, parses its exact id, and accepts only a stop reason from that id before reading watchRegister+watchOffset as H; the memory read must succeed. Stage 2 starts a fresh process, parses the exact write-watchpoint id for H, and records {address, newValue, pc, symbol, backtrace} only when continue stops on that id. Signals, other breakpoints, missing hits, failed memory reads, unsupported hardware watchpoints, and input drift are explicit errors, never hits. maxHits is only an upper capture bound.",
    prompt: "Use for frame-overlap / stray-write corruption bugs where you already know a detection point and a base-pointer+offset for the victim address, but not which instruction actually wrote it.",
    toAutoClassifierInput: (input) => `corrupt_hunt:${input.binary}:${input.breakSymbol || input.breakAddr}`,
    async execute(input) {
      const hasBreakAddr = typeof input.breakAddr === "string" && input.breakAddr.length > 0;
      const hasBreakSymbol = typeof input.breakSymbol === "string" && input.breakSymbol.length > 0;
      if (hasBreakAddr === hasBreakSymbol) throw new Error("cheng_corrupt_hunt: provide exactly one of {breakAddr} or {breakSymbol,primaryObject}");
      if (hasBreakSymbol && !input.primaryObject) throw new Error("cheng_corrupt_hunt: breakSymbol requires primaryObject");
      return jsonResult(await chengCorruptHunt(input));
    },
  });
});

export {ChengCorruptHuntTool, initChengCorruptHuntModule};
