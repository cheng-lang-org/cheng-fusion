// @ts-nocheck
// Local static registry replacing the source repo's ../artifact/builtin_tool_registry_m4623.ts
// (that module was a 1000+ line registry of ALL claude-code builtin tools; cheng-fusion only
// ever consumed getAllBuiltinTools().filter(name.startsWith("cheng_"))). MCP and the headless CLI
// consume this one validated registry; its count and identity are derived from the actual entries.
import {createHash} from "node:crypto";
import {b as defineModuleInitializer} from "./runtime.ts";
import {ChengCsgQueryTool, initChengCsgQueryModule} from "./cheng_csg_query_m9001.ts";
import {ChengEvidenceTool, initChengEvidenceModule} from "./cheng_evidence_m9002.ts";
import {ChengCsgRoundtripTool, initChengCsgRoundtripModule} from "./cheng_csg_roundtrip_m9003.ts";
import {ChengCrashTriageTool, initChengCrashTriageModule} from "./cheng_crash_triage_m9004.ts";
import {ChengLineMapReadTool, initChengLineMapReadModule} from "./cheng_line_map_read_m9005.ts";
import {ChengLspQueryTool, initChengLspQueryModule} from "./cheng_lsp_query_m9006.ts";
import {ChengProfileReportTool, initChengProfileReportModule} from "./cheng_profile_report_m9007.ts";
import {ChengSymbolDiffTool, initChengSymbolDiffModule} from "./cheng_symbol_diff_m9008.ts";
import {ChengExecDiffTool, initChengExecDiffModule} from "./cheng_exec_diff_m9012.ts";
import {ChengTemplateLeakAuditTool, initChengTemplateLeakAuditModule} from "./cheng_template_leak_audit_m9013.ts";
import {ChengZcCensusTool, initChengZcCensusModule} from "./cheng_zc_census_m9014.ts";
import {ChengCorruptHuntTool, initChengCorruptHuntModule} from "./cheng_corrupt_hunt_m9015.ts";
import {ChengShapeMatrixTool, initChengShapeMatrixModule} from "./cheng_shape_matrix_m9016.ts";
import {ChengClaimAuditTool, initChengClaimAuditModule} from "./cheng_claim_audit_m9017.ts";
import {ChengIgnitionChainTool, initChengIgnitionChainModule} from "./cheng_ignition_chain_m9018.ts";
import {ChengResidualPeelTool, initChengResidualPeelModule} from "./cheng_residual_peel_m9019.ts";
import {ChengOrphanSlotScanTool, initChengOrphanSlotScanModule} from "./cheng_orphan_slot_scan_m9020.ts";
import {ChengFixtureMatrixTool, initChengFixtureMatrixModule} from "./cheng_fixture_matrix_m9021.ts";
import {ChengAddrSymbolicateTool, initChengAddrSymbolicateModule} from "./cheng_addr_symbolicate_m9021.ts";
import {ChengRegallocPreflightTool, initChengRegallocPreflightModule} from "./cheng_regalloc_preflight_m9022.ts";
import {ChengSemanticSnapshotAuditTool, initChengSemanticSnapshotAuditModule} from "./cheng_semantic_snapshot_audit.ts";
import {ChengCidIdentityChainAuditTool, initChengCidIdentityChainAuditModule} from "./cheng_cid_identity_chain_audit.ts";
import {ChengMemoryReleaseGateAuditTool, initChengMemoryReleaseGateAuditModule} from "./cheng_memory_release_gate_audit.ts";
import {ChengDriverFrontierProbeTool, initChengDriverFrontierProbeModule} from "./cheng_driver_frontier_probe_m9026.ts";
import {ChengTreeQuiesceProbeTool, initChengTreeQuiesceProbeModule} from "./cheng_tree_quiesce_probe_m9027.ts";

var chengFusionTools, chengFusionToolManifest;

function buildChengFusionToolManifest(tools) {
  if (!Array.isArray(tools) || tools.length === 0) throw new Error("Cheng Fusion tool registry must not be empty");
  const names = tools.map((tool, index) => {
    const name = tool?.name;
    if (typeof name !== "string" || !/^cheng_[a-z0-9_]+$/.test(name)) throw new Error(`Cheng Fusion tool ${index} has an invalid name`);
    return name;
  });
  const sortedNames = [...names].sort();
  if (new Set(sortedNames).size !== sortedNames.length) throw new Error("Cheng Fusion tool registry contains duplicate names");
  const sha256 = createHash("sha256").update(sortedNames.map((name) => `${name}\n`).join(""), "utf8").digest("hex");
  return Object.freeze({schema: "cheng_fusion_tool_registry", count: sortedNames.length, names: Object.freeze(sortedNames), sha256});
}

var initChengFusionToolRegistryModule = defineModuleInitializer(() => {
  initChengCsgQueryModule();
  initChengEvidenceModule();
  initChengCsgRoundtripModule();
  initChengCrashTriageModule();
  initChengLineMapReadModule();
  initChengLspQueryModule();
  initChengProfileReportModule();
  initChengSymbolDiffModule();
  initChengExecDiffModule();
  initChengTemplateLeakAuditModule();
  initChengZcCensusModule();
  initChengCorruptHuntModule();
  initChengShapeMatrixModule();
  initChengClaimAuditModule();
  initChengIgnitionChainModule();
  initChengResidualPeelModule();
  initChengOrphanSlotScanModule();
  initChengFixtureMatrixModule();
  initChengAddrSymbolicateModule();
  initChengRegallocPreflightModule();
  initChengSemanticSnapshotAuditModule();
  initChengCidIdentityChainAuditModule();
  initChengMemoryReleaseGateAuditModule();
  initChengDriverFrontierProbeModule();
  initChengTreeQuiesceProbeModule();
  chengFusionTools = [ChengCsgQueryTool, ChengEvidenceTool, ChengCsgRoundtripTool, ChengCrashTriageTool, ChengLineMapReadTool, ChengLspQueryTool, ChengProfileReportTool, ChengSymbolDiffTool, ChengExecDiffTool, ChengTemplateLeakAuditTool, ChengZcCensusTool, ChengCorruptHuntTool, ChengShapeMatrixTool, ChengClaimAuditTool, ChengIgnitionChainTool, ChengResidualPeelTool, ChengOrphanSlotScanTool, ChengFixtureMatrixTool, ChengAddrSymbolicateTool, ChengRegallocPreflightTool, ChengSemanticSnapshotAuditTool, ChengCidIdentityChainAuditTool, ChengMemoryReleaseGateAuditTool, ChengDriverFrontierProbeTool, ChengTreeQuiesceProbeTool];
  chengFusionToolManifest = buildChengFusionToolManifest(chengFusionTools);
});

function getChengFusionTools() {
  return chengFusionTools;
}

function getChengFusionToolManifest() {
  return chengFusionToolManifest;
}

export {getChengFusionToolManifest, getChengFusionTools, initChengFusionToolRegistryModule};
