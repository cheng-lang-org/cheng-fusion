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
    env: zodSchema.record(zodSchema.string(), zodSchema.string()).optional().describe("Extra environment variables for the debuggee, applied via `settings set target.env-vars` on top of the process's own inherited environment."),
    breakAddr: zodSchema.string().optional().describe("Stage-1 breakpoint address as a hex string (with or without 0x prefix). Mutually exclusive with breakSymbol. Must already be the correct absolute vm address for this binary+args+env under lldb (lldb defaults target.disable-aslr=true, so repeated launches are stable — a documented lldb behavior this tool relies on, not something it silently patches over)."),
    breakSymbol: zodSchema.string().optional().describe("Stage-1 breakpoint by function name, resolved via `nm -n primaryObject`. Assumes the primary object's own __text sits at file-offset 0 of the linked binary's __TEXT (the system-link-exec primary+provider concatenation convention) plus zero ASLR slide. Mutually exclusive with breakAddr. For symbols inside linked provider objects, or a mid-function offset that isn't a symbol's own entry point, compute the address yourself (e.g. via cheng_crash_triage or objdump) and pass breakAddr instead."),
    primaryObject: zodSchema.string().optional().describe("Path to the driver's own primary .o (or, for a plain non-Cheng binary, whichever single relocatable .o was linked first). Required with breakSymbol for address resolution; also used standalone to symbolicate stage1/stage2 backtraces even in breakAddr mode."),
    watchRegister: zodSchema.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/).describe("Register holding the base pointer at the stage-1 breakpoint, e.g. 'x1' (no '$' prefix)."),
    watchOffset: zodSchema.number().int().describe("Byte offset from watchRegister's value to the watched address: H = watchRegister value + watchOffset."),
    watchSize: zodSchema.union([zodSchema.literal(1), zodSchema.literal(2), zodSchema.literal(4), zodSchema.literal(8)]).describe("Watchpoint width in bytes: 1, 2, 4, or 8."),
    maxHits: zodSchema.number().int().positive().max(256).optional().describe("Max stage-2 watchpoint hits to record before stopping. Default 8."),
    timeoutSec: zodSchema.number().positive().optional().describe("Per-stage lldb session timeout in seconds. Default 60."),
  });
  ChengCorruptHuntTool = createChengTextTool({
    name: "cheng_corrupt_hunt",
    searchHint: "two-stage lldb watchpoint hunt: locate the exact instruction that corrupted a header/struct field at a known address",
    inputSchema: chengCorruptHuntInputSchema,
    description: "Two-stage lldb watchpoint write-point localization. Stage 1: breakpoint at a known detection site (breakAddr, or breakSymbol+primaryObject resolved via nm), read watchRegister+watchOffset as the victim address H and its current value, record the backtrace. Stage 2: a fresh lldb process sets a write watchpoint on the literal address H and replays from process start, recording {pc, symbol, newValue, backtrace} for each of up to maxHits hits — the first hit whose pc/backtrace lands in the real culprit function is the actual corrupting write. Explicitly reports capability failures (e.g. no hardware watchpoint slots) instead of silently returning zero hits. Cross-run address stability (H must be the same address in both the stage-1 launch and the stage-2 launch) is a caller-visible precondition: pass the identical binary/args/env to both stages implicitly by calling this tool once (it runs both stages itself), and rely on lldb's default target.disable-aslr=true.",
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
