// @ts-nocheck
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool,jsonResult,parseCrash,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengCrashTriageInputSchema,ChengCrashTriageTool;

var initChengCrashTriageModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengCrashTriageInputSchema=zodSchema.strictObject({stderr:zodSchema.string().max(4*1024*1024).describe("Raw Cheng compiler or runtime stderr, up to 4 MiB.")});
  ChengCrashTriageTool=createChengTextTool({
    name:"cheng_crash_triage",
    searchHint:"parse Cheng crash stderr into file:line frames",
    inputSchema:chengCrashTriageInputSchema,
    description:"Parse Cheng compiler diagnostics, runtime crash markers, and stack traces into structured source locations.",
    prompt:"Use this on Cheng compiler or runtime stderr to land on exact source frames.",
    toAutoClassifierInput:(input)=>`crash:${String(input.stderr||"").length}`,
    async execute(input){return jsonResult(parseCrash(input.stderr))}
  });
});

export {ChengCrashTriageTool,initChengCrashTriageModule};
