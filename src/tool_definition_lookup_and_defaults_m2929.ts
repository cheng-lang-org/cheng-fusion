/*
 * Verbatim copy from claude-code-ts/claude/tool/tool_definition_lookup_and_defaults_m2929.ts.
 * Only the runtime.ts import path changed (was "../../runtime.ts", now local "./runtime.ts").
 */
// @ts-nocheck
import {b as defineModuleInitializer} from "./runtime.ts";
function filterNonHookProgressMessages(e){return e.filter((t)=>t.data?.type!=="hook_progress")}
function toolMatchesNameOrAlias(e,t){return e.name===t||(e.aliases?.includes(t)??!1)}
function setBuiltinToolListProvider(e){builtinToolListProvider=e}
function getBuiltinToolList(){return builtinToolListProvider?.()}
function buildToolLookupMap(e){let t=new Map;for(let r of e){if(!t.has(r.name))t.set(r.name,r);if(r.aliases){for(let n of r.aliases)if(!t.has(n))t.set(n,r)}}return t}
function findToolByNameOrAlias(e,t,r){let n=r&&Object.hasOwn(r,t)?r[t]:void 0;if(n!==void 0&&n!==t)return findToolByNameOrAlias(e,n);let o=toolLookupCacheByToolList.get(e);if(o)return o.get(t);if(toolListsSeenByLookup.has(e)){let i=buildToolLookupMap(e);return toolLookupCacheByToolList.set(e,i),i.get(t)}return toolListsSeenByLookup.add(e),e.find((i)=>toolMatchesNameOrAlias(i,t))}
function safeParseCoercedToolInput(e,t){let r=e.coerceInput?.(t)??null;return e.inputSchema.safeParse(r===null?t:r.input)}
function withDefaultToolDefinitionBehavior(e){return Object.defineProperties({...defaultToolDefinitionBehavior,userFacingName:()=>e.name},Object.getOwnPropertyDescriptors(e))}
var createDefaultToolPermissionContext=()=>({mode:"default",additionalWorkingDirectories:new Map,alwaysAllowRules:{},alwaysDenyRules:{},alwaysAskRules:{},isBypassPermissionsModeAvailable:!1,mcpPermissionModeOverrides:{}}),builtinToolListProvider,toolLookupCacheByToolList,toolListsSeenByLookup,defaultToolDefinitionBehavior;
var initToolDefinitionLookupAndDefaultsModule=defineModuleInitializer(()=>{toolLookupCacheByToolList=new WeakMap,toolListsSeenByLookup=new WeakSet;defaultToolDefinitionBehavior={isEnabled:()=>!0,isConcurrencySafe:(e)=>!1,isReadOnly:(e)=>!1,isDestructive:(e)=>!1,checkPermissions:(e,t)=>Promise.resolve({behavior:"allow",updatedInput:e}),toAutoClassifierInput:(e)=>"",userFacingName:(e)=>""}});
export {filterNonHookProgressMessages,toolMatchesNameOrAlias,setBuiltinToolListProvider,getBuiltinToolList,buildToolLookupMap,findToolByNameOrAlias,safeParseCoercedToolInput,withDefaultToolDefinitionBehavior,createDefaultToolPermissionContext,builtinToolListProvider,toolLookupCacheByToolList,toolListsSeenByLookup,defaultToolDefinitionBehavior,initToolDefinitionLookupAndDefaultsModule};
