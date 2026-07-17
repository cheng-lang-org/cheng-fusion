// @ts-nocheck
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool,evidenceForFileInFacts,evidenceForSymbolInFacts,getChengFacts,jsonResult,normalizeToSubstratePath,factsStalenessWarning,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengEvidenceInputSchema,ChengEvidenceTool;

var initChengEvidenceModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengEvidenceInputSchema=zodSchema.strictObject({
    root:zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml."),
    symbol:zodSchema.string().optional(),
    source:zodSchema.string().optional().describe("Project-relative or absolute Cheng source used to select the project when root is omitted."),
    file:zodSchema.string().optional().describe("Symbol/file evidence target. Also selects the project when root is omitted."),
    limit:zodSchema.number().int().positive().optional()
  });
  ChengEvidenceTool=createChengTextTool({
    name:"cheng_evidence",
    requiresChengProjectRoot:true,
    searchHint:"cross-module refactor evidence from CSG: impact radius and caller files",
    inputSchema:chengEvidenceInputSchema,
    description:"Return refactor impact evidence from CSG facts for a symbol and/or file: declarations, inbound callers, cross-module callers, and top-risk functions.",
    prompt:"Use this before editing a shared symbol or file to size blast radius without grep.",
    toAutoClassifierInput:(input)=>`evidence:${input.symbol||input.file||""}`,
    async execute(input){
      const targetPath=input.file||input.source||null;
      const facts=await getChengFacts({root:input.root,file:targetPath});
      if(!facts)throw new Error("CSG facts not available; run cheng_csg_roundtrip with root and source for this Cheng project");
      if(!input.symbol&&!input.file)throw new Error("provide symbol and/or file");
      const staleWarning=factsStalenessWarning(facts,targetPath);
      const result={
        root:facts.root,
        factsPath:facts.factsPath,
        factsRoot:facts.factsRoot,
        factsGeneratedAt:facts.generatedAt||null,
        factsSource:facts.source?normalizeToSubstratePath(facts.source,facts.root):null,
        ...(staleWarning?{staleWarning}:{}),
      };
      if(input.symbol){
        const item=evidenceForSymbolInFacts(facts,input.symbol);
        if(input.limit)item.crossModuleCallerFiles=(item.crossModuleCallerFiles||[]).slice(0,input.limit);
        result.symbol=item;
      }
      if(input.file){
        const item=evidenceForFileInFacts(facts,input.file);
        if(input.limit)item.topRisk=(item.topRisk||[]).slice(0,Math.min(input.limit,5));
        result.file=item;
      }
      return jsonResult(result);
    }
  });
});

export {ChengEvidenceTool,initChengEvidenceModule};
