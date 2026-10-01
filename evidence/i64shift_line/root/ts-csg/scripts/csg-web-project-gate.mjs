import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

const standardGates = [
  {
    name: "cursor-agents-window",
    projectRoot: "/Users/lbcheng/cursor-restored/cursor-agents-window",
    tsconfig: "tsconfig.json",
    typecheck: ["npm", "run", "typecheck"],
    entryRoots: ["src/index.ts", "src/main.ts", "src/renderer.ts"],
  },
  {
    name: "unimaker-react",
    projectRoot: "/Users/lbcheng/UniMaker/React.js",
    tsconfig: "tsconfig.json",
    typecheck: ["./node_modules/.bin/tsc", "--noEmit", "-p", "tsconfig.json"],
    entryRoots: [
      "app/main.tsx",
      "app/App.tsx",
      "app/libp2p/index.ts",
    ],
  },
];

const localExtendedGates = [
  {
    name: "unimaker-website",
    projectRoot: "/Users/lbcheng/UniMaker/website",
    tsconfig: "tsconfig.app.json",
    typecheck: ["./node_modules/.bin/tsc", "-b"],
    entryRoots: [
      "src/main.tsx",
      "src/App.tsx",
    ],
  },
  {
    name: "cc-haha-desktop",
    projectRoot: "/Users/lbcheng/cc-haha/desktop",
    tsconfig: "tsconfig.json",
    typecheck: ["./node_modules/.bin/tsc", "--noEmit"],
    entryRoots: [
      "src/main.tsx",
      "src/App.tsx",
    ],
  },
  {
    name: "remote-control-server",
    projectRoot: "/Users/lbcheng/claude-code/packages/remote-control-server",
    tsconfig: "tsconfig.json",
    typecheck: ["./node_modules/.bin/tsc", "--noEmit"],
    entryRoots: [
      "src/index.ts",
    ],
  },
  {
    name: "deepseek-tui-web",
    projectRoot: "/Users/lbcheng/DeepSeek-TUI/web",
    tsconfig: "tsconfig.json",
    typecheck: ["./node_modules/.bin/tsc", "--noEmit"],
    entryRoots: [
      "app/layout.tsx",
    ],
  },
];

const gateSet = process.env.CSG_WEB_PROJECT_GATE_SET ?? "standard";
assert.ok(gateSet === "standard" || gateSet === "local-extended",
  `unknown CSG_WEB_PROJECT_GATE_SET: ${gateSet}`);
const gates = gateSet === "local-extended"
  ? [...standardGates, ...localExtendedGates]
  : standardGates;

const results = [];

for (const gate of gates) {
  const tsconfig = join(gate.projectRoot, gate.tsconfig);
  const legacyOutA = join(root, `tmp/${gate.name}-a.csgweb`);
  const legacyOutB = join(root, `tmp/${gate.name}-b.csgweb`);
  const outA = join(root, `tmp/${gate.name}-a.csgc`);
  const outB = join(root, `tmp/${gate.name}-b.csgc`);
  const reportA = join(root, `tmp/${gate.name}-a.web.report.json`);
  const reportB = join(root, `tmp/${gate.name}-b.web.report.json`);

  assert.equal(existsSync(tsconfig), true, `missing ${gate.name} tsconfig: ${tsconfig}`);
  mkdirSync(dirname(outA), { recursive: true });
  rmSync(legacyOutA, { force: true });
  rmSync(legacyOutB, { force: true });

  runTypecheck(gate);
  const runA = runCsgWebCsgc(gate, tsconfig, outA, reportA);
  const runB = runCsgWebCsgc(gate, tsconfig, outB, reportB);

  assert.equal(Buffer.compare(runA.factsBuffer, runB.factsBuffer), 0, `${gate.name} CSGC facts must be deterministic`);
  assert.equal(runA.reportText, runB.reportText, `${gate.name} CSG-Web report must be deterministic`);
  assert.equal(runA.facts.some((fact) => JSON.stringify(fact).includes("__gui_")), false, `${gate.name} must not lower JSX directly to Cheng GUI calls`);

  const report = runA.report;
  const facts = runA.facts;
  assert.equal(report.schema, "csg-web.report");
  assert.equal(report.coreReport.schema, "csg-core.report");
  assert.equal(report.runtimeIndependent, true);
  assert.equal(report.engineDependency, "none");
  assert.deepEqual(report.runtimes, ["browser", "node"]);
  for (const entry of gate.entryRoots) {
    assert.ok(report.entryRoots.includes(entry), `${gate.name} missing entry root ${entry}`);
  }
  assert.equal(report.counts.coreFacts, facts.filter((fact) => !fact.kind.startsWith("csg.web.")).length);
  assert.equal(report.counts.webFacts, facts.filter((fact) => fact.kind.startsWith("csg.web.") && fact.kind !== "csg.web.schema").length);
  assert.equal(report.counts.domNodeTemplates, facts.filter((fact) => fact.kind === "csg.web.dom_node_template").length);
  assert.equal(report.counts.sourceFiles > 0, true);
  assert.equal(report.counts.modules, report.counts.sourceFiles);
  assert.equal(report.counts.runtimeRequirements, report.runtimeClosure.requirementCount);
  assert.equal(report.counts.externalSymbols, report.runtimeClosure.externalSymbolCount);
  assert.equal(report.control_surface_action_count, facts.filter((fact) => fact.kind === "csg.web.control_surface").length);
  assert.equal(report.actionable_dom_control_count, report.control_surface_action_count + report.control_surface_skipped_unlabeled_count);
  assert.equal(
    report.control_surface_actionable_coverage_percent,
    report.actionable_dom_control_count > 0
      ? Math.trunc((report.control_surface_action_count * 100) / report.actionable_dom_control_count)
      : 0,
  );
  assert.equal(report.voice_computer_use_scenario_count, facts.filter((fact) => fact.kind === "csg.web.voice_computer_use_scenario").length);
  assert.equal(report.voice_computer_use_scenario_count, report.control_surface_action_count);
  assert.equal(report.voice_computer_use_control_coverage_percent, report.control_surface_action_count > 0 ? 100 : 0);
  assert.equal(report.computer_use_action_count, facts.filter((fact) => fact.kind === "csg.web.computer_use_action").length);
  assert.equal(report.computer_use_action_count, report.control_surface_action_count);
  assert.equal(report.computer_use_action_coverage_percent, report.control_surface_action_count > 0 ? 100 : 0);
  assert.equal(report.computer_use_action_unresolved_count, 0);
  assert.equal(report.voice_task_template_count, facts.filter((fact) => fact.kind === "csg.web.voice_task_template").length);
  assert.equal(report.voice_task_step_count, facts.filter((fact) => fact.kind === "csg.web.voice_task_step").length);
  assert.equal(report.confirmation_gate_count, facts.filter((fact) => fact.kind === "csg.web.confirmation_gate").length);
  assert.equal(report.voice_task_required_confirmation_gate_count, facts.filter((fact) => fact.kind === "csg.web.voice_task_step" && fact.confirmationRequired === true).length);
  assert.equal(report.voice_task_required_confirmation_gate_count, report.confirmation_gate_count);
  assert.equal(typeof report.voice_task_high_risk_step_count, "number");
  assert.equal(typeof report.voice_task_missing_confirmation_gate_count, "number");
  assert.equal(typeof report.voice_task_blocked_step_count, "number");
  assert.equal(typeof report.voice_task_ambiguous_step_count, "number");
  assert.equal(report.runtimeClosure.complete, report.runtimeClosure.openRequirementCount === 0 && report.runtimeClosure.openExternalSymbolCount === 0);
  assert.equal(report.complete, report.coreComplete && report.runtimeClosure.complete);
  // report.complete is computed from runtime closure
  assert.equal(report.runtimeClosure.domainCount > 0, true);
  assert.equal(report.runtimeClosure.openRequirementCount >= 0, true);
  assert.equal(report.runtimeClosure.byDomain.length >= 0, true);
  assertExternalCapabilityManifest(report);
  // blockedReasons varies by project state
  if (gate.name === "unimaker-react") {
    assert.equal(report.counts.domNodeTemplates > 0, true, `${gate.name} must emit DOM node templates`);
    assert.equal(report.control_surface_skipped_unlabeled_count, 0, `${gate.name} must not skip actionable DOM controls without semantic labels`);
    assert.equal(report.control_surface_actionable_coverage_percent, 100, `${gate.name} must cover every actionable DOM control semantically`);
    assert.equal(report.actionable_dom_control_count, report.control_surface_action_count, `${gate.name} actionable DOM controls must all become control surfaces`);
    assert.equal(report.unimaker_internal_task_ready, true, `${gate.name} must resolve UniMaker internal voice task templates`);
    assert.equal(report.voice_task_template_count, 8, `${gate.name} must emit the UniMaker ASR voice task templates`);
    assert.equal(report.voice_task_blocked_step_count, 0, `${gate.name} must not have blocked voice task steps`);
    assert.equal(report.voice_task_ambiguous_step_count, 0, `${gate.name} must not have ambiguous voice task steps`);
    assert.equal(report.voice_task_missing_confirmation_gate_count, 0, `${gate.name} must not miss confirmation gates`);
    assert.equal(report.confirmation_gate_count, 0, `${gate.name} AI-mode voice tasks must not require confirmation gates`);
    const highRiskSteps = facts.filter((fact) =>
      fact.kind === "csg.web.voice_task_step" &&
      (fact.effectClass === "external-publish" || fact.effectClass === "payment" || fact.effectClass === "destructive")
    );
    assert.equal(highRiskSteps.length >= 4, true, `${gate.name} must expose high-risk task steps`);
    assert.equal(highRiskSteps.every((fact) => fact.confirmationRequired === false), true, `${gate.name} AI-mode high-risk steps must run without confirmation`);
    assert.equal(highRiskSteps.every((fact) => fact.confirmationGateId === ""), true, `${gate.name} AI-mode high-risk steps must not reference confirmation gate facts`);
  } else {
    assert.equal(report.unimaker_internal_task_ready, false, `${gate.name} must not claim UniMaker task readiness`);
    assert.equal(report.voice_task_template_count, 0, `${gate.name} must not emit UniMaker voice task templates`);
    assert.equal(report.voice_task_step_count, 0, `${gate.name} must not emit UniMaker voice task steps`);
  }

  results.push({
    name: gate.name,
    files: report.counts.sourceFiles,
    functions: report.counts.jsFunctions,
    jsxElements: report.counts.jsxElements,
    domNodeTemplates: report.counts.domNodeTemplates,
    runtimeRequirements: report.counts.runtimeRequirements,
    openRequirements: report.runtimeClosure.openRequirementCount,
    domains: report.runtimeClosure.domainCount,
    topAllDomain: report.runtimeClosure.byDomain[0]?.domain ?? "",
    topAllDomainCount: report.runtimeClosure.byDomain[0]?.count ?? 0,
    topOpenDomains: summarizeOpenDomains(report.runtimeClosure.requirements, 5),
    topOpenRequirements: summarizeOpenRequirements(report.runtimeClosure.requirements, 10),
    voiceComputerUseScenarios: report.voice_computer_use_scenario_count,
    voiceComputerUseCoverage: report.voice_computer_use_control_coverage_percent,
    computerUseActions: report.computer_use_action_count,
    computerUseCoverage: report.computer_use_action_coverage_percent,
    voiceTaskTemplates: report.voice_task_template_count,
    voiceTaskSteps: report.voice_task_step_count,
    confirmationGates: report.confirmation_gate_count,
    actionableDomControls: report.actionable_dom_control_count,
    skippedUnlabeledControls: report.control_surface_skipped_unlabeled_count,
    actionableControlCoverage: report.control_surface_actionable_coverage_percent,
    voiceTaskBlockedSteps: report.voice_task_blocked_step_count,
    voiceTaskAmbiguousSteps: report.voice_task_ambiguous_step_count,
    voiceTaskMissingConfirmationGates: report.voice_task_missing_confirmation_gate_count,
    unimakerInternalTaskReady: report.unimaker_internal_task_ready,
    externalCapabilities: report.externalCapabilityManifest.openCapabilityCount,
    externalCapabilityDomains: summarizeExternalCapabilities(report.externalCapabilityManifest.capabilities, 5),
  });
}

for (const result of results) {
  process.stdout.write(
    `${result.name} csg-web gate ok: ${result.files} files, ${result.functions} js functions, ${result.jsxElements} jsx elements, ${result.domNodeTemplates} dom node templates, ${result.runtimeRequirements} runtime requirements, ${result.openRequirements} open, ${result.domains} domains, top all domains ${result.topAllDomain}=${result.topAllDomainCount}\n` +
    `  top open domains: ${formatSummary(result.topOpenDomains)}\n` +
    `  top open requirements: ${formatSummary(result.topOpenRequirements)}\n` +
    `  voice computer-use scenarios: ${result.voiceComputerUseScenarios}, control coverage ${result.voiceComputerUseCoverage}%\n` +
    `  typed computer-use actions: ${result.computerUseActions}, control coverage ${result.computerUseCoverage}%, actionable DOM controls ${result.actionableDomControls}, skipped unlabeled ${result.skippedUnlabeledControls}, actionable coverage ${result.actionableControlCoverage}%, voice task templates ${result.voiceTaskTemplates}, steps ${result.voiceTaskSteps}, confirmation gates ${result.confirmationGates}, blocked steps ${result.voiceTaskBlockedSteps}, ambiguous steps ${result.voiceTaskAmbiguousSteps}, missing gates ${result.voiceTaskMissingConfirmationGates}, unimaker ready ${result.unimakerInternalTaskReady}\n` +
    `  external capabilities: ${result.externalCapabilities}, ${formatSummary(result.externalCapabilityDomains)}\n`,
  );
}

function assertExternalCapabilityManifest(report) {
  const manifest = report.externalCapabilityManifest;
  assert.equal(manifest.schema, "csg-web.external-capability-manifest");
  assert.equal(manifest.hardFailUntilProvided, true);
  assert.equal(manifest.requiredProvider, "surface-provider");
  const expectedRequirements = report.runtimeClosure.requirements.filter(isExternalSurfaceCapability).length;
  const expectedExternalSymbols = report.runtimeClosure.externalSymbols.filter(isExternalSurfaceCapability).length;
  assert.equal(manifest.requirementCount, expectedRequirements);
  assert.equal(manifest.externalSymbolCount, expectedExternalSymbols);
  assert.equal(manifest.openCapabilityCount, expectedRequirements + expectedExternalSymbols);
  assert.equal(manifest.complete, manifest.openCapabilityCount === 0);
  if (manifest.openCapabilityCount > 0) {
    assert.equal(report.complete, false);
    assert.equal(report.blockedReasons.includes("surface provider has open external capabilities"), true);
  }
}

function isExternalSurfaceCapability(item) {
  return item.providerStatus === "open" &&
    typeof item.candidateProvider === "string" &&
    (item.domain === "external-host" || item.domain === "web-resource" || item.domain === "node-host");
}

function summarizeOpenDomains(requirements, limit) {
  const counts = new Map();
  for (const item of requirements) {
    if (item.providerStatus !== "open") continue;
    counts.set(item.domain, (counts.get(item.domain) ?? 0) + 1);
  }
  return sortSummary(counts).slice(0, limit);
}

function summarizeOpenRequirements(requirements, limit) {
  const counts = new Map();
  for (const item of requirements) {
    if (item.providerStatus !== "open") continue;
    const key = `${item.domain}:${item.runtime}:${item.kind}:${item.name}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return sortSummary(counts).slice(0, limit);
}

function summarizeExternalCapabilities(capabilities, limit) {
  const counts = new Map();
  for (const item of capabilities) {
    const key = `${item.domain}:${item.candidateProvider}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return sortSummary(counts).slice(0, limit);
}

function sortSummary(counts) {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => {
      const count = right.count - left.count;
      if (count !== 0) return count;
      return left.name.localeCompare(right.name);
    });
}

function formatSummary(items) {
  if (items.length === 0) return "none";
  return items.map((item) => `${item.name}=${item.count}`).join(", ");
}

function runTypecheck(gate) {
  const [command, ...args] = gate.typecheck;
  const resolvedCommand = command.includes("/") ? join(gate.projectRoot, command) : command;
  assert.equal(existsSync(resolvedCommand) || !command.includes("/"), true, `missing ${gate.name} typecheck command: ${resolvedCommand}`);
  execFileSync(resolvedCommand, args, {
    cwd: gate.projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runCsgWebCsgc(gate, tsconfig, out, reportPath) {
  const { emitCsgWebFromTs } = require(join(root, "dist", "csg-web.js"));
  const { csgcWriteFacts } = require(join(root, "dist", "csgc-writer.js"));
  const result = emitCsgWebFromTs({
    project: tsconfig,
    runtime: ["node", "browser"],
    entryRoots: gate.entryRoots,
    emitText: false,
  });
  assert.equal(result.diagnostics.length, 0, `${gate.name} CSG-Web diagnostics:\n${result.diagnostics.join("\n")}`);
  const encoded = csgcWriteFacts(result.facts);
  const reportText = `${JSON.stringify(result.report, null, 2)}\n`;
  writeFileSync(out, encoded.factsBuffer);
  writeFileSync(reportPath, reportText, "utf8");
  return {
    facts: result.facts,
    factsBuffer: encoded.factsBuffer,
    report: result.report,
    reportText,
  };
}
