import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

const gates = [
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
];

const results = [];

for (const gate of gates) {
  const tsconfig = join(gate.projectRoot, gate.tsconfig);
  const outA = join(root, `tmp/${gate.name}-a.csgcore`);
  const outB = join(root, `tmp/${gate.name}-b.csgcore`);
  const closureOut = join(root, `tmp/${gate.name}.runtime-closure.json`);
  const reportA = join(root, `tmp/${gate.name}-a.report.json`);
  const reportB = join(root, `tmp/${gate.name}-b.report.json`);

  assert.equal(existsSync(tsconfig), true, `missing ${gate.name} tsconfig: ${tsconfig}`);
  mkdirSync(dirname(outA), { recursive: true });

  runTypecheck(gate);
  runCli(gate, tsconfig, outA, reportA);
  runCli(gate, tsconfig, outB, reportB);
  runRuntimeClosureCli(gate, tsconfig, closureOut);

  const factsA = readFileSync(outA, "utf8");
  const factsB = readFileSync(outB, "utf8");
  assert.equal(factsA, factsB, `${gate.name} CSG-Core facts must be deterministic`);
  assert.equal(readFileSync(reportA, "utf8"), readFileSync(reportB, "utf8"), `${gate.name} CSG-Core report must be deterministic`);

  const report = JSON.parse(readFileSync(reportA, "utf8"));
  const closure = JSON.parse(readFileSync(closureOut, "utf8"));
  assert.equal(report.schema, "csg-core.report");
  assert.deepEqual(report.runtimes, ["browser", "node"]);
  for (const entry of gate.entryRoots) {
    assert.ok(report.entryRoots.includes(entry), `${gate.name} missing entry root ${entry}`);
  }
  assert.ok(report.counts.sourceFiles > 0);
  assert.equal(report.counts.modules, report.counts.sourceFiles);
  assert.equal(report.counts.unsupported, report.unsupported.length);
  assert.equal(report.counts.runtimeRequirements, report.runtimeRequirements.length);
  assert.equal(report.counts.externalSymbols, report.externalSymbols.length);
  assert.equal(report.runtimeClosure.schema, "csg-core.runtime-closure");
  assert.deepEqual(closure, report.runtimeClosure, `${gate.name} runtime-closure output must match CSG-Core report`);
  assert.equal(report.runtimeClosure.complete, report.runtimeClosure.openRequirementCount === 0 && report.runtimeClosure.openExternalSymbolCount === 0);
  assert.equal(report.runtimeClosure.runtimeRequirementCount, report.runtimeRequirements.length);
  assert.equal(report.runtimeClosure.externalSymbolCount, report.externalSymbols.length);
  assert.equal(report.runtimeClosure.closedRequirementCount + report.runtimeClosure.openRequirementCount, report.runtimeRequirements.length);
  assert.equal(report.runtimeClosure.closedExternalSymbolCount + report.runtimeClosure.openExternalSymbolCount, report.externalSymbols.length);
  assert.ok(report.runtimeClosure.candidateRequirementCount <= report.runtimeRequirements.length);
  assert.ok(report.runtimeClosure.candidateExternalSymbolCount <= report.externalSymbols.length);
  assert.ok(report.runtimeClosure.groupCount <= report.runtimeRequirements.length);
  assert.ok(report.runtimeClosure.byRuntime.length > 0, `${gate.name} must expose runtime buckets`);
  assert.ok(report.runtimeClosure.byKind.length > 0, `${gate.name} must expose runtime kind buckets`);
  assert.ok(report.runtimeClosure.bySource.length > 0, `${gate.name} must expose runtime source buckets`);
  assert.ok(report.runtimeClosure.requirements.length > 0, `${gate.name} must expose grouped runtime requirements`);
  assert.equal(report.complete, report.unsupported.length === 0 && report.runtimeClosure.complete);
  assert.ok(
    report.unsupported.length > 0 || report.runtimeRequirements.length > 0,
    `${gate.name} must expose unsupported/runtime requirements instead of blank success`,
  );
  results.push({
    name: gate.name,
    files: report.counts.sourceFiles,
    functions: report.counts.functions,
    unsupported: report.counts.unsupported,
    runtimeRequirements: report.counts.runtimeRequirements,
    runtimeGroups: report.runtimeClosure.groupCount,
    closedRequirements: report.runtimeClosure.closedRequirementCount,
    openRequirements: report.runtimeClosure.openRequirementCount,
    candidateRequirements: report.runtimeClosure.candidateRequirementCount,
    topRuntime: report.runtimeClosure.byRuntime[0]?.runtime ?? "",
    topRuntimeCount: report.runtimeClosure.byRuntime[0]?.count ?? 0,
  });
}

for (const result of results) {
  process.stdout.write(
    `${result.name} gate ok: ${result.files} files, ${result.functions} functions, ${result.unsupported} unsupported, ${result.runtimeRequirements} runtime requirements, ${result.runtimeGroups} runtime groups, closed ${result.closedRequirements}, open ${result.openRequirements}, candidate ${result.candidateRequirements}, top ${result.topRuntime}=${result.topRuntimeCount}\n`,
  );
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

function runCli(gate, tsconfig, out, report) {
  const entryArgs = gate.entryRoots.flatMap((entry) => ["--entry-root", entry]);
  execFileSync(process.execPath, [
    "dist/cli.js",
    "--emit",
    "csg-core",
    "--project",
    tsconfig,
    "--runtime",
    "node,browser",
    "--out",
    out,
    "--report-out",
    report,
    ...entryArgs,
  ], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runRuntimeClosureCli(gate, tsconfig, out) {
  const entryArgs = gate.entryRoots.flatMap((entry) => ["--entry-root", entry]);
  execFileSync(process.execPath, [
    "dist/cli.js",
    "--emit",
    "runtime-closure",
    "--project",
    tsconfig,
    "--runtime",
    "node,browser",
    "--out",
    out,
    ...entryArgs,
  ], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
