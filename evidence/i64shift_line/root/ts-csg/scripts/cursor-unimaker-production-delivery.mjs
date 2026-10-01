#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");

const projects = [
  {
    name: "cursor-agents-window",
    family: "cursor",
    projectRoot: "/Users/lbcheng/cursor-restored/cursor-agents-window",
    tsconfig: "tsconfig.json",
    typecheck: ["npm", "run", "typecheck"],
    entryRoots: ["src/index.ts", "src/main.ts", "src/renderer.ts"],
  },
  {
    name: "unimaker-react",
    family: "unimaker",
    projectRoot: "/Users/lbcheng/UniMaker/React.js",
    tsconfig: "tsconfig.json",
    typecheck: ["./node_modules/.bin/tsc", "--noEmit", "-p", "tsconfig.json"],
    entryRoots: [
      "app/main.tsx",
      "app/App.tsx",
      "app/libp2p/index.ts",
    ],
  },
  {
    name: "unimaker-website",
    family: "unimaker",
    projectRoot: "/Users/lbcheng/UniMaker/website",
    tsconfig: "tsconfig.app.json",
    typecheck: ["./node_modules/.bin/tsc", "-b"],
    entryRoots: [
      "src/main.tsx",
      "src/App.tsx",
    ],
  },
];

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}

const selectedProjects = projects.filter((project) => options.only.size === 0 || options.only.has(project.name));
if (selectedProjects.length === 0) fail(`no projects matched --project filter: ${[...options.only].join(",")}`);

const outDir = resolvePath(options.outDir ?? join(packageDir, "tmp", "cursor-unimaker-production-delivery"));
if (options.clean) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const startedAt = Date.now();
const projectResults = [];

for (const project of selectedProjects) {
  projectResults.push(runProject(project));
}

const productionReady = projectResults.every((result) => result.productionReady);
const manifest = {
  schema: "cursor-unimaker.production-delivery.v1",
  mode: options.mode,
  productionReady,
  generatedAtUnixMs: startedAt,
  elapsedMs: Date.now() - startedAt,
  artifactRoot: outDir,
  projectCount: projectResults.length,
  readyProjectCount: projectResults.filter((result) => result.productionReady).length,
  blockedProjectCount: projectResults.filter((result) => !result.productionReady).length,
  projects: projectResults,
};

const manifestPath = join(outDir, "delivery.manifest.json");
writeStableJson(manifestPath, manifest);

for (const result of projectResults) {
  process.stdout.write(formatProjectLine(result));
}
process.stdout.write(`delivery_manifest=${manifestPath}\n`);

if (!productionReady && options.mode === "production") {
  fail(`production delivery blocked: ${projectResults.filter((result) => !result.productionReady).map((result) => result.name).join(", ")}`);
}

process.stdout.write(`cursor-unimaker ${options.mode} delivery ok productionReady=${productionReady}\n`);

function runProject(project) {
  const projectOutDir = join(outDir, project.name);
  const factsA = join(projectOutDir, `${project.name}-a.csgweb`);
  const factsB = join(projectOutDir, `${project.name}-b.csgweb`);
  const reportA = join(projectOutDir, `${project.name}-a.web.report.json`);
  const reportB = join(projectOutDir, `${project.name}-b.web.report.json`);
  const failurePath = join(projectOutDir, `${project.name}.delivery.failure.json`);
  const successPath = join(projectOutDir, `${project.name}.delivery.success.json`);
  const tsconfig = join(project.projectRoot, project.tsconfig);

  mkdirSync(projectOutDir, { recursive: true });
  assert.equal(existsSync(project.projectRoot), true, `missing project root: ${project.projectRoot}`);
  assert.equal(existsSync(tsconfig), true, `missing tsconfig: ${tsconfig}`);

  runTypecheck(project);
  runCsgWeb(project, tsconfig, factsA, reportA);
  runCsgWeb(project, tsconfig, factsB, reportB);

  const factsTextA = readFileSync(factsA, "utf8");
  const factsTextB = readFileSync(factsB, "utf8");
  const reportTextA = readFileSync(reportA, "utf8");
  const reportTextB = readFileSync(reportB, "utf8");
  assert.equal(factsTextA, factsTextB, `${project.name} csg-web facts are not deterministic`);
  assert.equal(reportTextA, reportTextB, `${project.name} csg-web report is not deterministic`);
  assert.equal(factsTextA.includes("__gui_"), false, `${project.name} must not lower JSX directly to Cheng GUI calls`);

  const facts = parseJsonl(factsTextA);
  const report = JSON.parse(reportTextA);
  validateReportContract(project, facts, report);

  const projectManifest = {
    schema: "cursor-unimaker.production-project.v1",
    name: project.name,
    family: project.family,
    projectRoot: project.projectRoot,
    tsconfig,
    entryRoots: project.entryRoots,
    productionReady: report.complete === true,
    facts: factsA,
    factsDeterministicTwin: factsB,
    report: reportA,
    reportDeterministicTwin: reportB,
    counts: report.counts,
    runtimeClosure: closureSummary(report),
    externalCapabilityManifest: externalCapabilitySummary(report),
    topOpenRequirements: summarizeOpenRequirements(report.runtimeClosure.requirements, 20),
    topExternalCapabilities: summarizeExternalCapabilities(report.externalCapabilityManifest.capabilities, 20),
    blockedReasons: report.blockedReasons,
    invariants: {
      deterministicFacts: true,
      deterministicReport: true,
      noDirectGuiLowering: true,
      runtimeIndependent: report.runtimeIndependent === true,
      engineDependency: report.engineDependency,
      browserOracleOnly: true,
      visualClickFallback: false,
    },
  };

  if (projectManifest.productionReady) {
    writeStableJson(successPath, projectManifest);
  } else {
    writeStableJson(failurePath, projectManifest);
  }

  return {
    name: project.name,
    family: project.family,
    productionReady: projectManifest.productionReady,
    facts: factsA,
    report: reportA,
    deliveryReport: projectManifest.productionReady ? successPath : failurePath,
    sourceFiles: report.counts.sourceFiles,
    jsxElements: report.counts.jsxElements,
    domNodeTemplates: report.counts.domNodeTemplates,
    runtimeRequirements: report.runtimeClosure.requirementCount,
    openRuntimeRequirements: report.runtimeClosure.openRequirementCount,
    openExternalSymbols: report.runtimeClosure.openExternalSymbolCount,
    openExternalCapabilities: report.externalCapabilityManifest.openCapabilityCount,
    controlSurfaceActions: report.control_surface_action_count,
    computerUseActions: report.computer_use_action_count,
    blockedReasons: report.blockedReasons,
    topOpenRequirements: projectManifest.topOpenRequirements.slice(0, 10),
  };
}

function runTypecheck(project) {
  const [command, ...args] = project.typecheck;
  const resolvedCommand = command.includes("/") ? join(project.projectRoot, command) : command;
  assert.equal(existsSync(resolvedCommand) || !command.includes("/"), true, `missing ${project.name} typecheck command: ${resolvedCommand}`);
  execFileSync(resolvedCommand, args, {
    cwd: project.projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.typecheckTimeoutMs,
  });
}

function runCsgWeb(project, tsconfig, out, reportOut) {
  const entryArgs = project.entryRoots.flatMap((entry) => ["--entry-root", entry]);
  execFileSync(process.execPath, [
    "dist/cli.js",
    "--emit",
    "csg-web",
    "--project",
    tsconfig,
    "--runtime",
    "node,browser",
    "--out",
    out,
    "--report-out",
    reportOut,
    ...entryArgs,
  ], {
    cwd: packageDir,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.csgTimeoutMs,
  });
}

function validateReportContract(project, facts, report) {
  assert.equal(report.schema, "csg-web.report", `${project.name} report schema`);
  assert.equal(report.coreReport.schema, "csg-core.report", `${project.name} core report schema`);
  assert.equal(report.runtimeIndependent, true, `${project.name} must be runtime-independent`);
  assert.equal(report.engineDependency, "none", `${project.name} must not depend on host engine`);
  assert.deepEqual(report.runtimes, ["browser", "node"], `${project.name} runtime list`);
  for (const entry of project.entryRoots) {
    assert.ok(report.entryRoots.includes(entry), `${project.name} missing entry root ${entry}`);
  }
  assert.equal(report.counts.coreFacts, facts.filter((fact) => !fact.kind.startsWith("csg.web.")).length);
  assert.equal(report.counts.webFacts, facts.filter((fact) => fact.kind.startsWith("csg.web.") && fact.kind !== "csg.web.schema").length);
  assert.equal(report.counts.domNodeTemplates, facts.filter((fact) => fact.kind === "csg.web.dom_node_template").length);
  assert.equal(report.counts.runtimeRequirements, report.runtimeClosure.requirementCount);
  assert.equal(report.counts.externalSymbols, report.runtimeClosure.externalSymbolCount);
  assert.equal(report.control_surface_action_count, facts.filter((fact) => fact.kind === "csg.web.control_surface").length);
  assert.equal(report.computer_use_action_count, facts.filter((fact) => fact.kind === "csg.web.computer_use_action").length);
  assert.equal(report.computer_use_action_count, report.control_surface_action_count);
  assert.equal(report.runtimeClosure.complete, report.runtimeClosure.openRequirementCount === 0 && report.runtimeClosure.openExternalSymbolCount === 0);
  assert.equal(report.externalCapabilityManifest.complete, report.externalCapabilityManifest.openCapabilityCount === 0);
  assert.equal(report.complete, report.coreComplete && report.runtimeClosure.complete);
  assert.equal(report.externalCapabilityManifest.hardFailUntilProvided, true);
  assert.equal(report.externalCapabilityManifest.requiredProvider, "surface-provider");
  if (!report.complete) {
    assert.ok(report.blockedReasons.length > 0, `${project.name} incomplete report must explain blockedReasons`);
  }
  if (project.name === "unimaker-react") {
    assert.equal(report.unimaker_internal_task_ready, true, "unimaker-react must keep internal task template coverage");
    assert.equal(report.confirmation_gate_count >= 3, true, "unimaker-react high-risk actions must keep confirmation gates");
  }
}

function closureSummary(report) {
  return {
    complete: report.runtimeClosure.complete,
    requirementCount: report.runtimeClosure.requirementCount,
    externalSymbolCount: report.runtimeClosure.externalSymbolCount,
    closedRequirementCount: report.runtimeClosure.closedRequirementCount,
    openRequirementCount: report.runtimeClosure.openRequirementCount,
    closedExternalSymbolCount: report.runtimeClosure.closedExternalSymbolCount,
    openExternalSymbolCount: report.runtimeClosure.openExternalSymbolCount,
    domainCount: report.runtimeClosure.domainCount,
    byDomain: report.runtimeClosure.byDomain,
  };
}

function externalCapabilitySummary(report) {
  return {
    complete: report.externalCapabilityManifest.complete,
    openCapabilityCount: report.externalCapabilityManifest.openCapabilityCount,
    requirementCount: report.externalCapabilityManifest.requirementCount,
    externalSymbolCount: report.externalCapabilityManifest.externalSymbolCount,
    byDomain: report.externalCapabilityManifest.byDomain,
    byCandidateProvider: report.externalCapabilityManifest.byCandidateProvider,
  };
}

function parseJsonl(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function summarizeOpenRequirements(requirements, limit) {
  const counts = new Map();
  for (const item of requirements) {
    if (item.providerStatus !== "open") continue;
    const key = `${item.domain}|${item.runtime}|${item.kind}|${item.name}|${item.candidateProvider ?? ""}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return summarizeCounts(counts, limit).map(({ key, count }) => {
    const [domain, runtime, kind, name, candidateProvider] = key.split("|");
    return { count, domain, runtime, kind, name, candidateProvider };
  });
}

function summarizeExternalCapabilities(capabilities, limit) {
  const counts = new Map();
  for (const item of capabilities) {
    const key = `${item.domain}|${item.capabilityKind}|${item.name}|${item.candidateProvider ?? ""}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return summarizeCounts(counts, limit).map(({ key, count }) => {
    const [domain, capabilityKind, name, candidateProvider] = key.split("|");
    return { count, domain, capabilityKind, name, candidateProvider };
  });
}

function summarizeCounts(counts, limit) {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit);
}

function formatProjectLine(result) {
  const top = result.topOpenRequirements
    .slice(0, 3)
    .map((item) => `${item.domain}:${item.kind}:${item.name}=${item.count}`)
    .join(", ");
  return [
    `${result.name} delivery ${result.productionReady ? "ready" : "blocked"}`,
    `  facts=${relative(process.cwd(), result.facts)}`,
    `  report=${relative(process.cwd(), result.report)}`,
    `  delivery_report=${relative(process.cwd(), result.deliveryReport)}`,
    `  files=${result.sourceFiles} jsx=${result.jsxElements} dom_templates=${result.domNodeTemplates}`,
    `  runtime_open=${result.openRuntimeRequirements} external_open=${result.openExternalSymbols} external_capabilities=${result.openExternalCapabilities}`,
    `  control_actions=${result.controlSurfaceActions} computer_use_actions=${result.computerUseActions}`,
    `  blocked_reasons=${result.blockedReasons.length === 0 ? "none" : result.blockedReasons.join("; ")}`,
    `  top_open=${top || "none"}`,
    "",
  ].join("\n");
}

function writeStableJson(path, value) {
  writeFileSync(path, `${stableJson(value, 0)}\n`, "utf8");
}

function stableJson(value, indent) {
  return JSON.stringify(sortJson(value), null, indent);
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortJson(value[key]);
  }
  return out;
}

function parseArgs(args) {
  const parsed = {
    mode: "production",
    only: new Set(),
    clean: true,
    outDir: undefined,
    typecheckTimeoutMs: 120000,
    csgTimeoutMs: 180000,
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => {
      index += 1;
      if (index >= args.length) fail(`missing value for ${arg}`);
      return args[index];
    };
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--mode") parsed.mode = parseMode(next());
    else if (arg === "--audit") parsed.mode = "audit";
    else if (arg === "--production") parsed.mode = "production";
    else if (arg === "--project") parsed.only.add(next());
    else if (arg === "--out-dir") parsed.outDir = next();
    else if (arg === "--no-clean") parsed.clean = false;
    else if (arg === "--typecheck-timeout-ms") parsed.typecheckTimeoutMs = positiveInteger(next(), arg);
    else if (arg === "--csg-timeout-ms") parsed.csgTimeoutMs = positiveInteger(next(), arg);
    else fail(`unknown argument: ${arg}`);
  }
  return parsed;
}

function parseMode(value) {
  if (value === "production" || value === "audit") return value;
  fail(`--mode must be production or audit, got ${value}`);
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) fail(`${name} must be a positive integer`);
  return number;
}

function resolvePath(value) {
  return resolve(process.cwd(), value);
}

function fail(message) {
  process.stderr.write(`cursor-unimaker-production-delivery: ${message}\n`);
  process.exit(1);
}

function helpText() {
  return `cursor-unimaker-production-delivery

Usage:
  node scripts/cursor-unimaker-production-delivery.mjs [--mode production|audit] [--out-dir <dir>]

Modes:
  production  hard-fail when any Cursor/UniMaker CSG-Web report is incomplete
  audit       emit the same artifacts and manifest, but exit 0 for progress tracking

Outputs:
  delivery.manifest.json
  <project>/<project>-a.csgweb
  <project>/<project>-a.web.report.json
  <project>/<project>.delivery.failure.json or .delivery.success.json
`;
}
