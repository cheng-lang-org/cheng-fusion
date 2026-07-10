// @ts-nocheck
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool,jsonResult,snapshotChengSymbols,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengSymbolDiffInputSchema,ChengSymbolDiffTool;

var initChengSymbolDiffModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengSymbolDiffInputSchema=zodSchema.strictObject({
    action:zodSchema.enum(["snapshot"]),
    root:zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml."),
    source:zodSchema.string().optional()
  });
  ChengSymbolDiffTool=createChengTextTool({
    name:"cheng_symbol_diff",
    requiresChengProjectRoot:true,
    searchHint:"snapshot Cheng compiler symbols via print-symbols",
    inputSchema:chengSymbolDiffInputSchema,
    description:"Run cheng print-symbols and return cheng_symbols_v1 counts; primary_unsupported_count > 0 is a compiler lowering regression signal.",
    prompt:"Use after Cheng compiler edits; default canary should stay primary_unsupported_count=0.",
    toAutoClassifierInput:(input)=>`symbol_diff:${input.source||"canary"}`,
    async execute(input){
      const result=await snapshotChengSymbols(input.source,{root:input.root});
      if(!result)return jsonResult({error:"cheng driver not found"});
      return jsonResult(result);
    }
  });
});

export {ChengSymbolDiffTool,initChengSymbolDiffModule};
