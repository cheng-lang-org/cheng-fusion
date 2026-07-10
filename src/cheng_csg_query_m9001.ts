// @ts-nocheck
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool,getChengFacts,jsonResult,lookupByNameInFacts,callsOfInFacts,whoCallsInFacts,normalizeToSubstratePath,factsStalenessWarning,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengCsgQueryInputSchema,ChengCsgQueryTool;

var initChengCsgQueryModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengCsgQueryInputSchema=zodSchema.strictObject({
    kind:zodSchema.enum(["symbol","references","calls"]).describe("symbol = find declarations by name; references = who calls a callee by name; calls = what a function calls."),
    root:zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml."),
    file:zodSchema.string().optional().describe("Project-relative or absolute Cheng file used to select the project when root is omitted."),
    source:zodSchema.string().optional().describe("Project-relative or absolute Cheng source used to select the project when root is omitted."),
    name:zodSchema.string().optional(),
    id:zodSchema.string().optional(),
    limit:zodSchema.number().int().positive().optional()
  });
  ChengCsgQueryTool=createChengTextTool({
    name:"cheng_csg_query",
    requiresChengProjectRoot:true,
    searchHint:"query CSG compiler facts: symbol location, callers, callees",
    inputSchema:chengCsgQueryInputSchema,
    description:"Query the current Cheng project's CSG facts for symbol records, inbound references, and outbound reloc/call edges.",
    prompt:"Use this before grep for Cheng project symbol/reference lookup. If facts are missing, run cheng_csg_roundtrip for the target .cheng source first.",
    toAutoClassifierInput:(input)=>`${input.kind}:${input.name||input.id||""}`,
    async execute(input){
      const targetPath=input.file||input.source||null;
      const facts=await getChengFacts({root:input.root,file:targetPath});
      if(!facts)return jsonResult({error:"CSG facts not available",hint:"run cheng_csg_roundtrip with root and source for this Cheng project"});
      const limit=input.limit||50;
      const staleWarning=factsStalenessWarning(facts,targetPath);
      const factsMeta={
        factsGeneratedAt:facts.generatedAt||null,
        factsSource:facts.source?normalizeToSubstratePath(facts.source,facts.root):null,
        ...(staleWarning?{staleWarning}:{}),
      };
      if(input.kind==="symbol"){
        if(!input.name)return jsonResult({error:"kind=symbol requires name"});
        return jsonResult({query:"symbol",root:facts.root,factsPath:facts.factsPath,factsRoot:facts.factsRoot,...factsMeta,name:input.name,matches:lookupByNameInFacts(facts,input.name)});
      }
      if(input.kind==="references"){
        if(!input.name)return jsonResult({error:"kind=references requires name"});
        const calls=whoCallsInFacts(facts,input.name);
        return jsonResult({query:"references",root:facts.root,factsPath:facts.factsPath,factsRoot:facts.factsRoot,...factsMeta,callee:input.name,totalCallers:calls.length,callers:calls.slice(0,limit).map((call)=>{const caller=facts.funcById.get(call.owner);return{callerId:call.owner,caller:caller?.name,callerSymbol:caller?.symbol,callerLoc:caller?.loc,callLoc:call.loc,loc:call.loc,calleeText:call.calleeText,targetFqName:call.target?.fqName}})});
      }
      let functionId=input.id;
      if(!functionId&&input.name){
        const matches=lookupByNameInFacts(facts,input.name).filter((item)=>item.kind==="csg.function"||item.kind==="csg.async_function"||item.kind==="cheng_cold.function");
        if(matches.length>1)return jsonResult({error:"function name is overloaded; pass id from kind=symbol",name:input.name,matches:matches.map((item)=>({id:item.id,symbol:item.symbol,loc:item.loc}))});
        functionId=matches[0]?.id;
      }
      if(!functionId)return jsonResult({error:"kind=calls requires id or resolvable function name"});
      const calls=callsOfInFacts(facts,functionId);
      return jsonResult({query:"calls",root:facts.root,factsPath:facts.factsPath,factsRoot:facts.factsRoot,...factsMeta,function:functionId,totalCallees:calls.length,callees:calls.slice(0,limit).map((call)=>({callee:call.target?.name||call.calleeText,targetFqName:call.target?.fqName,loc:call.loc}))});
    }
  });
});

export {ChengCsgQueryTool,initChengCsgQueryModule};
