// @ts-nocheck
// Local static registry replacing the source repo's ../artifact/builtin_tool_registry_m4623.ts
// (that module was a 1000+ line registry of ALL claude-code builtin tools; cheng-fusion only
// ever consumed getAllBuiltinTools().filter(name.startsWith("cheng_"))). MCP and the headless CLI
// consume this one validated registry; its count and identity are derived from the actual entries.
//
// 惰性加载(2026-08-27): 全量静态 import 把 25 个工具模块(~3MB TS, 含 624KB regalloc/277KB evidence)
// 压进每一个进程, 实测占冷启动 ~95ms/125ms。现在模块体按需 dynamic import:
//   - 名称清单/manifest 由静态 DEF 表在 import 本模块时零成本导出(去重/格式校验与旧逻辑同规则);
//   - resolveChengFusionTool(name) 只加载并初始化一个工具模块 —— `run <tool>` 冷启动只付一个模块的钱;
//   - loadAllChengFusionTools() 显式全量装配(tools/list 用), 装配顺序与旧数组完全一致;
//   - manifest(names+sha256) 不依赖模块体, initialize/runtimeIdentity 无需加载任何工具即可发布。
import {createHash} from "node:crypto";

const CHENG_FUSION_TOOL_DEFS = [
  {name: "cheng_csg_query", specifier: "./cheng_csg_query_m9001.ts", toolExport: "ChengCsgQueryTool", initExport: "initChengCsgQueryModule"},
  {name: "cheng_evidence", specifier: "./cheng_evidence_m9002.ts", toolExport: "ChengEvidenceTool", initExport: "initChengEvidenceModule"},
  {name: "cheng_csg_roundtrip", specifier: "./cheng_csg_roundtrip_m9003.ts", toolExport: "ChengCsgRoundtripTool", initExport: "initChengCsgRoundtripModule"},
  {name: "cheng_crash_triage", specifier: "./cheng_crash_triage_m9004.ts", toolExport: "ChengCrashTriageTool", initExport: "initChengCrashTriageModule"},
  {name: "cheng_line_map_read", specifier: "./cheng_line_map_read_m9005.ts", toolExport: "ChengLineMapReadTool", initExport: "initChengLineMapReadModule"},
  {name: "cheng_lsp_query", specifier: "./cheng_lsp_query_m9006.ts", toolExport: "ChengLspQueryTool", initExport: "initChengLspQueryModule"},
  {name: "cheng_profile_report", specifier: "./cheng_profile_report_m9007.ts", toolExport: "ChengProfileReportTool", initExport: "initChengProfileReportModule"},
  {name: "cheng_symbol_diff", specifier: "./cheng_symbol_diff_m9008.ts", toolExport: "ChengSymbolDiffTool", initExport: "initChengSymbolDiffModule"},
  {name: "cheng_exec_diff", specifier: "./cheng_exec_diff_m9012.ts", toolExport: "ChengExecDiffTool", initExport: "initChengExecDiffModule"},
  {name: "cheng_template_leak_audit", specifier: "./cheng_template_leak_audit_m9013.ts", toolExport: "ChengTemplateLeakAuditTool", initExport: "initChengTemplateLeakAuditModule"},
  {name: "cheng_zc_census", specifier: "./cheng_zc_census_m9014.ts", toolExport: "ChengZcCensusTool", initExport: "initChengZcCensusModule"},
  {name: "cheng_corrupt_hunt", specifier: "./cheng_corrupt_hunt_m9015.ts", toolExport: "ChengCorruptHuntTool", initExport: "initChengCorruptHuntModule"},
  {name: "cheng_shape_matrix", specifier: "./cheng_shape_matrix_m9016.ts", toolExport: "ChengShapeMatrixTool", initExport: "initChengShapeMatrixModule"},
  {name: "cheng_claim_audit", specifier: "./cheng_claim_audit_m9017.ts", toolExport: "ChengClaimAuditTool", initExport: "initChengClaimAuditModule"},
  {name: "cheng_ignition_chain", specifier: "./cheng_ignition_chain_m9018.ts", toolExport: "ChengIgnitionChainTool", initExport: "initChengIgnitionChainModule"},
  {name: "cheng_residual_peel", specifier: "./cheng_residual_peel_m9019.ts", toolExport: "ChengResidualPeelTool", initExport: "initChengResidualPeelModule"},
  {name: "cheng_orphan_slot_scan", specifier: "./cheng_orphan_slot_scan_m9020.ts", toolExport: "ChengOrphanSlotScanTool", initExport: "initChengOrphanSlotScanModule"},
  {name: "cheng_fixture_matrix", specifier: "./cheng_fixture_matrix_m9021.ts", toolExport: "ChengFixtureMatrixTool", initExport: "initChengFixtureMatrixModule"},
  {name: "cheng_addr_symbolicate", specifier: "./cheng_addr_symbolicate_m9021.ts", toolExport: "ChengAddrSymbolicateTool", initExport: "initChengAddrSymbolicateModule"},
  {name: "cheng_regalloc_preflight", specifier: "./cheng_regalloc_preflight_m9022.ts", toolExport: "ChengRegallocPreflightTool", initExport: "initChengRegallocPreflightModule"},
  {name: "cheng_semantic_snapshot_audit", specifier: "./cheng_semantic_snapshot_audit.ts", toolExport: "ChengSemanticSnapshotAuditTool", initExport: "initChengSemanticSnapshotAuditModule"},
  {name: "cheng_cid_identity_chain_audit", specifier: "./cheng_cid_identity_chain_audit.ts", toolExport: "ChengCidIdentityChainAuditTool", initExport: "initChengCidIdentityChainAuditModule"},
  {name: "cheng_memory_release_gate_audit", specifier: "./cheng_memory_release_gate_audit.ts", toolExport: "ChengMemoryReleaseGateAuditTool", initExport: "initChengMemoryReleaseGateAuditModule"},
  {name: "cheng_driver_frontier_probe", specifier: "./cheng_driver_frontier_probe_m9026.ts", toolExport: "ChengDriverFrontierProbeTool", initExport: "initChengDriverFrontierProbeModule"},
  {name: "cheng_tree_quiesce_probe", specifier: "./cheng_tree_quiesce_probe_m9027.ts", toolExport: "ChengTreeQuiesceProbeTool", initExport: "initChengTreeQuiesceProbeModule"},
];

function assertValidChengFusionToolName(name, index) {
  if (typeof name !== "string" || !/^cheng_[a-z0-9_]+$/.test(name)) throw new Error(`Cheng Fusion tool ${index} has an invalid name`);
}

// 与旧实现同一规则: 注册表非空、名称唯一且匹配 cheng_[a-z0-9_]+、sha256 绑定排序后的唯一名集合。
{
  if (!Array.isArray(CHENG_FUSION_TOOL_DEFS) || CHENG_FUSION_TOOL_DEFS.length === 0) throw new Error("Cheng Fusion tool registry must not be empty");
  const seen = new Set();
  CHENG_FUSION_TOOL_DEFS.forEach((def, index) => {
    assertValidChengFusionToolName(def.name, index);
    if (seen.has(def.name)) throw new Error("Cheng Fusion tool registry contains duplicate names");
    seen.add(def.name);
  });
}

function buildChengFusionToolManifest(names) {
  if (!Array.isArray(names) || names.length === 0) throw new Error("Cheng Fusion tool registry must not be empty");
  for (const [index, name] of names.entries()) assertValidChengFusionToolName(name, index);
  const sortedNames = [...names].sort();
  if (new Set(sortedNames).size !== sortedNames.length) throw new Error("Cheng Fusion tool registry contains duplicate names");
  const sha256 = createHash("sha256").update(sortedNames.map((name) => `${name}\n`).join(""), "utf8").digest("hex");
  return Object.freeze({schema: "cheng_fusion_tool_registry", count: sortedNames.length, names: Object.freeze(sortedNames), sha256});
}

const CHENG_FUSION_TOOL_NAMES = Object.freeze(CHENG_FUSION_TOOL_DEFS.map((def) => def.name));
const chengFusionToolManifest = buildChengFusionToolManifest(CHENG_FUSION_TOOL_NAMES);

let chengFusionTools = null;
let chengFusionLoadAllPromise = null;
const loadedChengFusionToolsByName = new Map();

function bindLoadedChengFusionTool(def, tool) {
  // 物化校验: 表名与模块真实导出必须一致, 执行器必须是函数 —— 名单口径与实体永远绑死。
  if (!tool || tool.name !== def.name) throw new Error(`Cheng Fusion tool module ${def.specifier} exported a mismatched tool identity`);
  if (typeof tool.execute !== "function") throw new Error(`Cheng Fusion tool ${def.name} has no execute function`);
  return tool;
}

async function loadChengFusionToolModule(def) {
  const target = await import(/* @vite-ignore */ def.specifier);
  const init = target[def.initExport];
  if (typeof init === "function") init();
  return bindLoadedChengFusionTool(def, target[def.toolExport]);
}

async function loadAllChengFusionTools() {
  if (chengFusionTools) return chengFusionTools;
  if (!chengFusionLoadAllPromise) {
    chengFusionLoadAllPromise = (async () => {
      // 并行动态加载, 按 DEF 表顺序回填装配 —— 顺序与旧静态数组逐位一致,
      // 加载墙钟不再随模块数线性叠加(串行 await 实测比静态整包还慢 18ms)。
      const materialized = await Promise.all(CHENG_FUSION_TOOL_DEFS.map(async (def) => {
        if (loadedChengFusionToolsByName.has(def.name)) return [def.name, loadedChengFusionToolsByName.get(def.name)];
        const tool = await loadChengFusionToolModule(def);
        loadedChengFusionToolsByName.set(def.name, tool);
        return [def.name, tool];
      }));
      const tools = materialized.map(([, tool]) => tool);
      if (new Set(tools.map((tool) => tool.name)).size !== tools.length) throw new Error("Cheng Fusion tool registry contains duplicate names");
      chengFusionTools = Object.freeze(tools.slice());
      return chengFusionTools;
    })();
    chengFusionLoadAllPromise.catch(() => {
      // 失败后允许下一次调用重试; 当前调用的异常原样上抛。
      chengFusionLoadAllPromise = null;
    });
  }
  return chengFusionLoadAllPromise;
}

async function resolveChengFusionTool(name) {
  if (typeof name !== "string") return undefined;
  if (loadedChengFusionToolsByName.has(name)) return loadedChengFusionToolsByName.get(name);
  if (chengFusionTools) return chengFusionTools.find((candidate) => candidate.name === name);
  const def = CHENG_FUSION_TOOL_DEFS.find((candidate) => candidate.name === name);
  if (!def) return undefined;
  const tool = await loadChengFusionToolModule(def);
  loadedChengFusionToolsByName.set(name, tool);
  return tool;
}

// 兼容别名: 旧代码把它当"立即全量初始化"用。ESM 动态加载天然异步, 返回 Promise,
// 需要拿数组的新代码请直接 await loadAllChengFusionTools()。
async function initChengFusionToolRegistryModule() {
  await loadAllChengFusionTools();
}

function getChengFusionTools() {
  return chengFusionTools;
}

function getChengFusionToolManifest() {
  return chengFusionToolManifest;
}

export {getChengFusionToolManifest, getChengFusionTools, loadAllChengFusionTools, resolveChengFusionTool, initChengFusionToolRegistryModule};
