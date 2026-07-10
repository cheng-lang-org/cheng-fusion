// @ts-nocheck
import {b as defineModuleInitializer} from "./runtime.ts";
import {chengLspQuery,createChengTextTool,jsonResult,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengLspQueryInputSchema,ChengLspQueryTool;

var initChengLspQueryModule=defineModuleInitializer(()=>{
  initChengToolkitModule();
  chengLspQueryInputSchema=zodSchema.strictObject({
    kind:zodSchema.enum(["hover","definition","references","documentSymbol","diagnostics","workspaceSymbol","typeDefinition","completion","signatureHelp","rename","codeAction"]),
    file:zodSchema.string(),
    root:zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml."),
    line:zodSchema.number().int().min(0).optional(),
    character:zodSchema.number().int().min(0).optional(),
    query:zodSchema.string().optional(),
    newName:zodSchema.string().optional(),
    endLine:zodSchema.number().int().min(0).optional(),
    endCharacter:zodSchema.number().int().min(0).optional()
  });
  ChengLspQueryTool=createChengTextTool({
    name:"cheng_lsp_query",
    requiresChengProjectRoot:true,
    searchHint:"query cheng-lsp: hover, definition, refs, diagnostics, symbols, rename, codeAction",
    inputSchema:chengLspQueryInputSchema,
    description:"Query the real cheng-lsp language server for Cheng source intelligence.",
    prompt:"Use this for .cheng files instead of guessing symbol locations.",
    toAutoClassifierInput:(input)=>`lsp:${input.kind}:${input.file||""}`,
    async execute(input){return jsonResult(await chengLspQuery(input))}
  });
});

export {ChengLspQueryTool,initChengLspQueryModule};
