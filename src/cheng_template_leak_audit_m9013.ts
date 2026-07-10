// @ts-nocheck
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool,jsonResult,chengTemplateLeakAudit,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengTemplateLeakAuditInputSchema,ChengTemplateLeakAuditTool;

var initChengTemplateLeakAuditModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengTemplateLeakAuditInputSchema=zodSchema.strictObject({
    objectPath:zodSchema.string().describe("Path to a compiled Cheng .primary.o object file (absolute, or relative to root)."),
    root:zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml.")
  });
  ChengTemplateLeakAuditTool=createChengTextTool({
    name:"cheng_template_leak_audit",
    requiresChengProjectRoot:true,
    searchHint:"audit .primary.o for unresolved generic template symbols (__L mangling) still carrying bare T in return/param position",
    inputSchema:chengTemplateLeakAuditInputSchema,
    description:"Enumerate defined T symbols in a Cheng .primary.o with __L<line> mangling (generic functions not monomorphized per call site — see PrimarySymbolNameForFunction), resolve each back to source to check whether the signature still carries a bare unbound generic type parameter in return or parameter position, and count real BL/branch call edges via objdump -r. live_leak = genuinely called generic-leak symbol (correctness risk); dead_weight = present but uncalled. Golden invariant: liveLeakCount should be 0.",
    prompt:"Use on a .primary.o build artifact to find template/generic monomorphization leaks the linker never caught. Pass the exact objectPath; root defaults to the active Cheng project.",
    toAutoClassifierInput:(input)=>`template_leak_audit:${input.objectPath||""}`,
    async execute(input){
      const result=await chengTemplateLeakAudit(input);
      return jsonResult(result);
    }
  });
});

export {ChengTemplateLeakAuditTool,initChengTemplateLeakAuditModule};
