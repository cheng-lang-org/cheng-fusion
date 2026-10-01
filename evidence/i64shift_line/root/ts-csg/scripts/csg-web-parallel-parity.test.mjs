// Parity gate: the parallel extract engine (emitCsgWebFromTsAsync, which runs
// the held-CLI `validate --mode sandbox` and `fact-identities` scans
// concurrently) must produce output identical to the serial engine
// (emitCsgWebFromTs) — facts bytes, diagnostics, and report.
//
// Run: node scripts/csg-web-parallel-parity.test.mjs   (after npm run build)
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const heldCli =
  process.platform === "darwin"
    ? join(process.env.HOME ?? "", ".cheng-held/csg-cli")
    : "/usr/libexec/cheng/csg-cli";
if (!existsSync(heldCli)) {
  console.error(`held CLI missing at ${heldCli}; parity run would be vacuous`);
  process.exit(1);
}

const { emitCsgWebFromTs, emitCsgWebFromTsAsync } = await import(
  pathToFileURL(join(root, "dist/csg-web.js")).href
);

const fixtures = [
  {
    name: "basic",
    project: join(root, "fixtures/basic/tsconfig.json"),
    runtime: ["node", "browser"],
  },
  {
    name: "voice-task",
    project: join(root, "fixtures/csg-web-unimaker-voice-task/tsconfig.json"),
    runtime: ["node", "browser"],
  },
];

for (const fixture of fixtures) {
  const options = {
    project: fixture.project,
    rootDir: root,
    runtime: fixture.runtime,
    emitText: true,
  };
  const serial = emitCsgWebFromTs(options);
  assert.equal(serial.diagnostics.length, 0, `${fixture.name}: serial diagnostics: ${serial.diagnostics.join("\n")}`);
  assert.ok(serial.report.coreReport.facts_root.startsWith("sha256:"), `${fixture.name}: serial core must produce a facts root`);
  assert.ok(
    serial.facts.some((fact) => fact.kind === "csg.web.subgraph_cid"),
    `${fixture.name}: fixture must exercise the subgraph identity scan`,
  );

  const parallel = await emitCsgWebFromTsAsync(options);

  assert.deepEqual(parallel.facts, serial.facts, `${fixture.name}: facts mismatch`);
  assert.deepEqual(parallel.diagnostics, serial.diagnostics, `${fixture.name}: diagnostics mismatch`);
  assert.equal(parallel.text, serial.text, `${fixture.name}: JSONL text mismatch`);
  assert.deepEqual(
    JSON.parse(JSON.stringify(parallel.report)),
    JSON.parse(JSON.stringify(serial.report)),
    `${fixture.name}: report mismatch`,
  );
  assert.equal(parallel.report.coreReport.facts_root, serial.report.coreReport.facts_root);
  assert.equal(parallel.report.coreReport.factsRoot, serial.report.coreReport.factsRoot);
  console.log(
    `parity ok: ${fixture.name} facts=${serial.facts.length} facts_root=${serial.report.coreReport.facts_root}`,
  );
}

const {
  chengCsgValidateFacts,
  chengCsgValidateFactsAsync,
  chengCsgValidateCanonicalFactsAsync,
  chengCsgFactIdentitiesThroughRootCli,
  chengCsgFactIdentitiesAsync,
  chengCsgFactIdentitiesCanonicalAsync,
} = await import(pathToFileURL(join(root, "dist/csg-cheng-bridge.js")).href);

// Bridge-level concurrency check: both scans on one fact set, launched
// concurrently through the async spawn path, must match the sync results.
{
  const options = {
    project: join(root, "fixtures/csg-web-unimaker-voice-task/tsconfig.json"),
    rootDir: root,
    runtime: ["node", "browser"],
    emitText: false,
  };
  const { facts } = emitCsgWebFromTs(options);
  const syncValidation = chengCsgValidateFacts(facts, "sandbox");
  const syncIdentities = chengCsgFactIdentitiesThroughRootCli(facts);
  const [asyncValidation, asyncIdentities] = await Promise.all([
    chengCsgValidateFactsAsync(facts, "sandbox"),
    chengCsgFactIdentitiesAsync(facts),
  ]);
  assert.deepEqual(asyncValidation, syncValidation, "bridge: concurrent validate mismatch");
  assert.deepEqual(asyncIdentities, syncIdentities, "bridge: concurrent fact-identities mismatch");
  assert.ok(syncIdentities.length > 0, "bridge: identity rows must be non-empty");
  console.log(`parity ok: bridge concurrent scans rows=${syncIdentities.length}`);

  // Canonical-input contract: stableJson output is canonical, so the
  // --canonical-input verified-input scans must return identical results.
  const [canonicalValidation, canonicalIdentities] = await Promise.all([
    chengCsgValidateCanonicalFactsAsync(facts, "sandbox"),
    chengCsgFactIdentitiesCanonicalAsync(facts),
  ]);
  assert.deepEqual(canonicalValidation, syncValidation, "bridge: canonical-input validate mismatch");
  assert.deepEqual(canonicalIdentities, syncIdentities, "bridge: canonical-input fact-identities mismatch");
  console.log(`parity ok: bridge canonical-input scans rows=${canonicalIdentities.length}`);
}

console.log("csg-web-parallel-parity: PASS");
