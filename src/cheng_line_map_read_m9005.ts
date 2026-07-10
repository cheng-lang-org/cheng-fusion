// @ts-nocheck
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool,jsonResult,readLineMap,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengLineMapReadInputSchema,ChengLineMapReadTool;

var initChengLineMapReadModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengLineMapReadInputSchema=zodSchema.strictObject({
    file:zodSchema.string().describe(".cheng source path or an existing cheng_line_map_v1 text file."),
    root:zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml.")
  });
  ChengLineMapReadTool=createChengTextTool({
    name:"cheng_line_map_read",
    requiresChengProjectRoot:true,
    searchHint:"parse Cheng line-map for function source spans",
    inputSchema:chengLineMapReadInputSchema,
    description:"Return canonical compiler-frontend function spans for a .cheng source, or parse an existing Cheng line-map file.",
    prompt:"Use before editing a Cheng function by name to get exact sig/body lines.",
    toAutoClassifierInput:(input)=>`line_map:${input.file}`,
    async execute(input){return jsonResult(await readLineMap(input.file,{root:input.root}))}
  });
});

export {ChengLineMapReadTool,initChengLineMapReadModule};
