// @ts-nocheck
// Local static registry replacing the source repo's ../artifact/builtin_tool_registry_m4623.ts
// (that module was a 1000+ line registry of ALL claude-code builtin tools; cheng-fusion only
// ever consumed getAllBuiltinTools().filter(name.startsWith("cheng_"))). This registers exactly
// the 8 cheng_* tools directly, in the same order and with the same init-call sequence as the
// original registry's initBuiltinToolRegistryModule (see the "cheng*" block there).
import {b as defineModuleInitializer} from "./runtime.ts";
import {ChengCsgQueryTool, initChengCsgQueryModule} from "./cheng_csg_query_m9001.ts";
import {ChengEvidenceTool, initChengEvidenceModule} from "./cheng_evidence_m9002.ts";
import {ChengCsgRoundtripTool, initChengCsgRoundtripModule} from "./cheng_csg_roundtrip_m9003.ts";
import {ChengCrashTriageTool, initChengCrashTriageModule} from "./cheng_crash_triage_m9004.ts";
import {ChengLineMapReadTool, initChengLineMapReadModule} from "./cheng_line_map_read_m9005.ts";
import {ChengLspQueryTool, initChengLspQueryModule} from "./cheng_lsp_query_m9006.ts";
import {ChengProfileReportTool, initChengProfileReportModule} from "./cheng_profile_report_m9007.ts";
import {ChengSymbolDiffTool, initChengSymbolDiffModule} from "./cheng_symbol_diff_m9008.ts";

var chengFusionTools;

var initChengFusionToolRegistryModule = defineModuleInitializer(() => {
  initChengCsgQueryModule();
  initChengEvidenceModule();
  initChengCsgRoundtripModule();
  initChengCrashTriageModule();
  initChengLineMapReadModule();
  initChengLspQueryModule();
  initChengProfileReportModule();
  initChengSymbolDiffModule();
  chengFusionTools = [ChengCsgQueryTool, ChengEvidenceTool, ChengCsgRoundtripTool, ChengCrashTriageTool, ChengLineMapReadTool, ChengLspQueryTool, ChengProfileReportTool, ChengSymbolDiffTool];
});

function getChengFusionTools() {
  return chengFusionTools;
}

export {getChengFusionTools, initChengFusionToolRegistryModule};
