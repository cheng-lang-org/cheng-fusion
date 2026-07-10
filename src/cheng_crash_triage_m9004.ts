// @ts-nocheck
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool,jsonResult,parseCrash,triageChengBinaryCrash,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengCrashTriageInputSchema,ChengCrashTriageTool;

var initChengCrashTriageModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  // MCP requires a top-level {type:"object"} inputSchema; a zod union serializes
  // to a bare anyOf and the client rejects the whole tool list. Model the two
  // modes as one object with optional fields and enforce exactly-one at runtime.
  chengCrashTriageInputSchema=zodSchema.strictObject({
    stderr:zodSchema.string().max(4*1024*1024).optional().describe("Stderr mode: raw Cheng compiler or runtime stderr, up to 4 MiB. Mutually exclusive with binary."),
    binary:zodSchema.string().optional().describe("Binary mode: absolute path to the executable to run under lldb. Mutually exclusive with stderr."),
    args:zodSchema.array(zodSchema.string()).optional().describe("Binary mode: argv passed to binary."),
    env:zodSchema.record(zodSchema.string(),zodSchema.string()).optional().describe("Binary mode: extra environment variables for the debuggee."),
    primaryObject:zodSchema.string().optional().describe("Binary mode: path to the driver's own .primary.o for symbolication. Defaults to <binary>.primary.o next to binary."),
    maxFrames:zodSchema.number().int().positive().max(256).optional().describe("Binary mode: max backtrace frames. Default 64."),
    timeoutSec:zodSchema.number().positive().optional().describe("Binary mode: lldb session timeout in seconds. Default 60.")
  });
  ChengCrashTriageTool=createChengTextTool({
    name:"cheng_crash_triage",
    searchHint:"parse Cheng crash stderr, or run a binary under lldb and symbolicate the crash",
    inputSchema:chengCrashTriageInputSchema,
    description:"Parse Cheng compiler diagnostics/runtime stderr into source locations (stderr mode), or run a binary under lldb, capture backtrace/registers/fault instruction, and symbolicate frames against <name>.primary.o via nm+otool (binary mode). Frames outside the primary object's own text extent are reported as provider-unresolved rather than guessed.",
    prompt:"Use {stderr} for existing crash text. Use {binary,args,env,primaryObject} to reproduce and symbolicate a live crash of a pure-emission (0-stderr) Cheng driver or compiled program.",
    toAutoClassifierInput:(input)=>"stderr" in input?`crash:${String(input.stderr||"").length}`:`crash_live:${input.binary}`,
    async execute(input){
      const hasStderr=typeof input.stderr==="string";
      const hasBinary=typeof input.binary==="string";
      if(hasStderr===hasBinary)throw new Error("cheng_crash_triage: provide exactly one of {stderr} (text mode) or {binary,...} (live lldb mode)");
      if(hasStderr)return jsonResult(parseCrash(input.stderr));
      return jsonResult(await triageChengBinaryCrash(input));
    }
  });
});

export {ChengCrashTriageTool,initChengCrashTriageModule};
