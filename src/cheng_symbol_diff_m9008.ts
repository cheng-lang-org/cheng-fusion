// @ts-nocheck
import {existsSync} from "node:fs";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool,jsonResult,snapshotChengSymbols,compareChengBinarySymbols,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengSymbolDiffInputSchema,ChengSymbolDiffTool;

// compare 模式的 objectA/objectB 常是 /tmp 下的实验世代 .primary.o 或已链接可执行文件, 不必
// (也不应该)落在活跃 Cheng 项目 root 内 —— 同 cheng_exec_diff 的 driverA/driverB 一样对待。
function resolveArbitraryBinaryPath(value,label){
  if(!value)throw new Error(`${label} is required`);
  const path=String(value);
  if(!existsSync(path))throw new Error(`${label} not found: ${path}`);
  return path;
}

var initChengSymbolDiffModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengSymbolDiffInputSchema=zodSchema.strictObject({
    action:zodSchema.enum(["snapshot","compare"]),
    root:zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml."),
    source:zodSchema.string().optional().describe("snapshot mode: .cheng source to run print-symbols against."),
    objectA:zodSchema.string().optional().describe("compare mode: absolute path to the first .o or executable (nm-readable)."),
    objectB:zodSchema.string().optional().describe("compare mode: absolute path to the second .o or executable (nm-readable)."),
    limit:zodSchema.number().int().positive().optional().describe("compare mode: cap on onlyInA/onlyInB/common name lists. Default 2000; counts are always exact."),
    includeCommon:zodSchema.boolean().optional().describe("compare mode: also return the (usually large, low-signal) common symbol name list. Default false (count only).")
  });
  ChengSymbolDiffTool=createChengTextTool({
    name:"cheng_symbol_diff",
    requiresChengProjectRoot:true,
    searchHint:"snapshot Cheng compiler symbols via print-symbols, or diff defined T symbols between two binaries",
    inputSchema:chengSymbolDiffInputSchema,
    description:"action:snapshot runs cheng print-symbols and returns cheng_symbols_v1 counts (primary_unsupported_count > 0 is a compiler lowering regression signal). action:compare takes two .o/executable paths (objectA, objectB) and returns the defined global T (text) symbol set diff: onlyInA/onlyInB/common counts + name lists + prefix-cluster summaries (Primary/Typed/std_/...), replacing manual nm+sort+diff for generation-to-generation binary comparisons.",
    prompt:"Use {action:snapshot} after Cheng compiler edits; default canary should stay primary_unsupported_count=0. Use {action:compare,objectA,objectB} to diff two build generations' .primary.o or executables and spot symbols unique to one side.",
    toAutoClassifierInput:(input)=>input.action==="compare"?`symbol_diff_compare:${input.objectA}:${input.objectB}`:`symbol_diff:${input.source||"canary"}`,
    async execute(input){
      if(input.action==="compare"){
        const objectA=resolveArbitraryBinaryPath(input.objectA,"objectA");
        const objectB=resolveArbitraryBinaryPath(input.objectB,"objectB");
        return jsonResult(compareChengBinarySymbols(objectA,objectB,{limit:input.limit,includeCommon:input.includeCommon}));
      }
      const result=await snapshotChengSymbols(input.source,{root:input.root});
      if(!result)return jsonResult({error:"cheng driver not found"});
      return jsonResult(result);
    }
  });
});

export {ChengSymbolDiffTool,initChengSymbolDiffModule};
