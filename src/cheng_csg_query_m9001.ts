// @ts-nocheck
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool,getChengFacts,jsonResult,lookupByNameInFacts,callsOfInFacts,whoCallsInFacts,normalizeToSubstratePath,factsStalenessWarning,resolveProjectPath,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengCsgQueryInputSchema,ChengCsgQueryTool;

var initChengCsgQueryModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengCsgQueryInputSchema=zodSchema.strictObject({
    kind:zodSchema.enum(["symbol","references","calls"]).describe("symbol = find declarations by name; references = who calls a callee by name; calls = what a function calls."),
    root:zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml."),
    file:zodSchema.string().optional().describe("Project-relative or absolute Cheng file used to select the project when root is omitted."),
    source:zodSchema.string().optional().describe("Project-relative or absolute Cheng source used to select the project when root is omitted."),
    entrySource:zodSchema.string().optional().describe("Exact package entry .cheng file whose committed closure must own these facts. Required with file/source."),
    name:zodSchema.string().optional(),
    id:zodSchema.string().optional(),
    limit:zodSchema.number().int().positive().optional()
  });
  ChengCsgQueryTool=createChengTextTool({
    name:"cheng_csg_query",
    requiresChengProjectRoot:true,
    searchHint:"query CSG compiler facts: symbol location, callers, callees",
    inputSchema:chengCsgQueryInputSchema,
    description:"Query one exactly source/entry-bound committed CSG generation for symbol records, inbound references, and outbound reloc/call edges. A mismatched source or package entry is rejected; stale facts are never returned.",
    prompt:"Use this before grep for Cheng project symbol/reference lookup. Pass the target source and exact package entrySource used by cheng_csg_roundtrip.",
    toAutoClassifierInput:(input)=>`${input.kind}:${input.name||input.id||""}`,
    async execute(input){
      const targetPath=input.file||input.source||null;
      if(targetPath&&!input.entrySource)throw new Error("cheng_csg_query requires the exact package entrySource with file/source; stale fixture facts are not queryable");
      const facts=await getChengFacts({root:input.root,file:targetPath});
      if(!facts)throw new Error("CSG facts not available; run cheng_csg_roundtrip with root, source, and entrySource for this Cheng project");
      const limit=input.limit||50;
      const staleWarning=factsStalenessWarning(facts,targetPath);
      if(staleWarning)throw new Error(`refusing stale Cheng CSG facts: ${staleWarning}`);
      if(input.entrySource){
        const expectedEntrySource=resolveProjectPath(input.entrySource,facts.root);
        const actualEntrySource=facts.entrySource?resolveProjectPath(facts.entrySource,facts.root):null;
        if(!actualEntrySource||actualEntrySource!==expectedEntrySource)throw new Error(`refusing Cheng CSG entry source mismatch: facts=${actualEntrySource?normalizeToSubstratePath(actualEntrySource,facts.root):"missing"} requested=${normalizeToSubstratePath(expectedEntrySource,facts.root)}; run cheng_csg_roundtrip with the exact source and entrySource`);
      }
      const factsMeta={
        factsSource:facts.source?normalizeToSubstratePath(facts.source,facts.root):null,
        factsEntrySource:facts.entrySource?normalizeToSubstratePath(facts.entrySource,facts.root):null,
      };
      if(input.kind==="symbol"){
        if(!input.name)throw new Error("kind=symbol requires name");
        return jsonResult({query:"symbol",root:facts.root,factsPath:facts.factsPath,factsRoot:facts.factsRoot,...factsMeta,name:input.name,matches:lookupByNameInFacts(facts,input.name)});
      }
      if(input.kind==="references"){
        if(!input.name)throw new Error("kind=references requires name");
        const calls=whoCallsInFacts(facts,input.name);
        return jsonResult({query:"references",root:facts.root,factsPath:facts.factsPath,factsRoot:facts.factsRoot,...factsMeta,callee:input.name,totalCallers:calls.length,callers:calls.slice(0,limit).map((call)=>{const caller=facts.funcById.get(call.owner);return{callerId:call.owner,caller:caller?.name,callerSymbol:caller?.symbol,callerLoc:caller?.loc,callLoc:call.loc,loc:call.loc,calleeText:call.calleeText,targetFqName:call.target?.fqName}})});
      }
      let functionId=input.id;
      if(!functionId&&input.name){
        const matches=lookupByNameInFacts(facts,input.name).filter((item)=>item.kind==="csg.function"||item.kind==="csg.async_function"||item.kind==="cheng_cold.function");
        if(matches.length>1)throw new Error(`function name is overloaded; pass id from kind=symbol: ${JSON.stringify(matches.map((item)=>({id:item.id,symbol:item.symbol,loc:item.loc})))}`);
        functionId=matches[0]?.id;
      }
      if(!functionId)throw new Error("kind=calls requires id or resolvable function name");
      const calls=callsOfInFacts(facts,functionId);
      return jsonResult({query:"calls",root:facts.root,factsPath:facts.factsPath,factsRoot:facts.factsRoot,...factsMeta,function:functionId,totalCallees:calls.length,callees:calls.slice(0,limit).map((call)=>({callee:call.target?.name||call.calleeText,targetFqName:call.target?.fqName,loc:call.loc}))});
    }
  });
});

export {ChengCsgQueryTool,initChengCsgQueryModule};
