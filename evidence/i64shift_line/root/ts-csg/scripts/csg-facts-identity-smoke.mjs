import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptPath = fileURLToPath(import.meta.url);
const packageDir = resolve(dirname(scriptPath), "..");
const repoRoot = resolve(packageDir, "..");
const staticOnly = process.argv.includes("--static-only");
const guarded = process.env.CSG_FACTS_IDENTITY_EXACT_1G === "1";
const legacyIdentityMutations = [
  ["buildIdentityBinary", "function buildIdentityBinary() {}"],
  ["ensureIdentityBinary", "function ensureIdentityBinary() {}"],
  ["system-link-exec", "const identityBuildCommand = \"system-link-exec\";"],
  ["csg-facts-identity.cheng", "const identitySource = \"csg-facts-identity.cheng\";"],
];

function parsedSource(path, text) {
  return {
    path,
    text,
    ast: ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true),
  };
}

function sourceFile(path) {
  const text = readFileSync(path, "utf8");
  return parsedSource(path, text);
}

function findFunctionBody(source, name) {
  let body;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      body = node.body;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source.ast);
  assert.ok(body, `${source.path}: missing function ${name}`);
  return body;
}

function hasCatchClause(node) {
  let found = false;
  function visit(current) {
    if (ts.isCatchClause(current)) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function assertPureProducer(source, name, requiredCall = null) {
  const body = findFunctionBody(source, name);
  const text = body.getText(source.ast);
  if (requiredCall !== null) {
    assert.match(text, new RegExp(`\\b${requiredCall}\\s*\\(`));
  }
  assert.doesNotMatch(text, /\b(?:createHash|crypto|subtle)\b/);
  assert.equal(hasCatchClause(body), false, `${name} must not catch and fall back`);
  return text;
}

function assertNoLegacyIdentityOrchestrator(source) {
  for (const [token] of legacyIdentityMutations) {
    assert.equal(
      source.text.includes(token),
      false,
      `${source.path}: forbidden legacy identity orchestrator token ${token}`,
    );
  }
}

/**
 * Sandbox stdout-rows contract (post strict-artifact removal): the held Cheng
 * CLI produces every identity byte; the bridge is a verbatim transport. Each
 * identity entry point must pin sandbox mode, stream rows from stdout
 * (`fact_hash=...\tsubgraph_cid=...` lines), hard-fail on nonzero status, and
 * return the parsed rows unmodified — no artifact file, no JS hashing.
 */
function assertBridgeSandboxRowsContract(bridge) {
  assert.equal(
    bridge.text.match(/\bcreateHash\b/g)?.length ?? 0,
    0,
    "bridge must never hash identity bytes in JS; identity is produced exclusively by the held CLI",
  );
  assert.doesNotMatch(bridge.text, /node:crypto|\bcrypto\.subtle\b/);
  assert.doesNotMatch(
    bridge.text,
    /\b(?:createHmac|sha256Facts|hashFact|computeFactsRoot|computeFactHash|buildMerkleProof|verifyMerkleProof|encodeCsgc|decodeCsgc)\b/,
  );
  for (const name of [
    "chengCsgFactIdentitiesHeld",
    "chengCsgFactIdentitiesAsync",
    "chengCsgFactIdentitiesCanonicalAsync",
  ]) {
    const body = findFunctionBody(bridge, name);
    const text = body.getText(bridge.ast);
    assert.equal(
      hasCatchClause(body),
      false,
      `${name} must not catch and fall back`,
    );
    assert.match(
      text,
      /"fact-identities",\s*"--mode",\s*"sandbox"/,
      `${name} must run the held CLI sandbox identity scan`,
    );
    assert.doesNotMatch(
      text,
      /"--out"/,
      `${name}: sandbox identity rows stream on stdout, no artifact file`,
    );
    assert.match(
      text,
      /if \(result\.status !== 0\)/,
      `${name}: nonzero held-CLI status must hard-fail`,
    );
    assert.match(
      text,
      /line\.startsWith\("fact_hash="\)/,
      `${name}: rows must be taken verbatim from fact_hash= stdout lines`,
    );
    assert.match(
      text,
      /"\)\.slice\("subgraph_cid="\.length\)/,
      `${name}: subgraph_cid must be parsed from the CLI row`,
    );
    assert.match(text, /return rows/, `${name}: must return the CLI rows unmodified`);
  }
  const canonicalBody = findFunctionBody(
    bridge,
    "chengCsgFactIdentitiesCanonicalAsync",
  ).getText(bridge.ast);
  assert.match(
    canonicalBody,
    /"--canonical-input",\s*tmp\.path/,
    "canonical identity twin must run the verified canonical-input path",
  );
}

function runStaticMutations(identity, bridge) {
  let mutationCount = 0;
  for (const [token, mutation] of legacyIdentityMutations) {
    const mutant = parsedSource(
      `${identity.path}.${token}.mutant`,
      `${identity.text}\n${mutation}\n`,
    );
    assert.throws(
      () => assertNoLegacyIdentityOrchestrator(mutant),
      new RegExp(`forbidden legacy identity orchestrator token ${token.replace(".", "\\.")}`),
    );
    mutationCount += 1;
  }

  const bridgeMutations = [
    // JS-side hashing reintroduced: identity bytes must never be computed in JS.
    `${bridge.text}\nconst semanticHash = createHash("sha256");\n`,
    // Row filter gutted: bridge would fabricate rows from non-row stdout lines
    // instead of taking them verbatim from fact_hash= lines.
    bridge.text.replace(
      'if (!line.startsWith("fact_hash=")) continue;',
      "if (false) continue;",
    ),
    // Status check gutted: nonzero held-CLI status must hard-fail, not pass.
    bridge.text.replace(
      "if (result.status !== 0) {",
      "if (false) {",
    ),
  ];
  for (let index = 0; index < bridgeMutations.length; index += 1) {
    const mutation = bridgeMutations[index];
    assert.notEqual(mutation, bridge.text, `bridge mutation ${index + 1} did not change source`);
    const mutant = parsedSource(`${bridge.path}.sandbox-${index + 1}.mutant`, mutation);
    assert.throws(() => assertBridgeSandboxRowsContract(mutant));
    mutationCount += 1;
  }
  assert.equal(mutationCount, 7);
  return mutationCount;
}

function runStaticContract() {
  const identity = sourceFile(join(packageDir, "src", "csg-facts-identity.ts"));
  const bridge = sourceFile(join(packageDir, "src", "csg-cheng-bridge.ts"));
  const standard = sourceFile(join(packageDir, "src", "csg-standard.ts"));
  const relfacts = sourceFile(join(packageDir, "src", "csg-relfacts.ts"));
  const web = sourceFile(join(packageDir, "src", "csg-web.ts"));

  const identitySources = [identity, bridge, standard, relfacts, web];
  const forbiddenSwitches = [
    "CSG_FACT_HASH_VIA_JS",
    "CSG_FACTS_ROOT_VIA_JS",
    "CSG_SUBGRAPH_CID_VIA_JS",
    "CSG_IDENTITY_FALLBACK",
  ];
  for (const source of identitySources) {
    for (const token of forbiddenSwitches) {
      assert.equal(source.text.includes(token), false, `${source.path}: forbidden ${token}`);
    }
  }

  assert.doesNotMatch(identity.text, /node:crypto|\bcreateHash\b|crypto\.subtle/);
  assert.doesNotMatch(standard.text, /node:crypto|\bcreateHash\b|crypto\.subtle/);
  assert.doesNotMatch(relfacts.text, /node:crypto|\bcreateHash\b|crypto\.subtle/);
  assertNoLegacyIdentityOrchestrator(identity);

  const identityBody = assertPureProducer(
    identity,
    "chengCsgFactIdentities",
    "chengCsgFactIdentitiesThroughRootCli",
  );
  const rootBody = assertPureProducer(standard, "csgFactsRoot", "chengCsgFactsRoot");

  assert.match(identityBody, /return\s+chengCsgFactIdentitiesThroughRootCli\(facts\);\s*\}/);
  assert.doesNotMatch(
    identityBody,
    /\.map\s*\(/,
    "chengCsgFactIdentities must return bridge rows verbatim, no JS transform",
  );
  assert.match(rootBody, /return\s+chengCsgFactsRoot\(facts\)/);
  const subgraphBody = assertPureProducer(web, "buildSubgraphCidFactsFromIdentities");
  assert.match(subgraphBody, /const\s+cid\s*=\s*identity\.subgraphCid/);
  assert.match(subgraphBody, /identities\[index\]/);
  // Subgraph CIDs enter web facts only through held-CLI identity calls.
  assert.match(
    web.text,
    /chengCsgFactIdentities\(context\.subgraphSources\.map\(\(source\) => source\.fact\)\)/,
  );
  assert.match(web.text, /chengCsgFactIdentitiesCanonicalAsync\(/);

  const bridgeBody = findFunctionBody(
    bridge,
    "chengCsgFactIdentitiesThroughRootCli",
  );
  assert.equal(
    hasCatchClause(bridgeBody),
    false,
    "root CLI fact-identities bridge must not catch and fall back",
  );
  const bridgeText = bridgeBody.getText(bridge.ast);
  assert.doesNotMatch(bridgeText, /\bcreateHash\b|crypto\.subtle/);
  assert.match(
    bridgeText,
    /return\s+chengCsgFactIdentitiesHeld\(facts\)/,
    "root CLI bridge must be a pure passthrough to the held-CLI identity scan",
  );
  assertBridgeSandboxRowsContract(bridge);

  assert.match(identity.text, /from "\.\/csg-cheng-bridge\.js"/);
  assert.doesNotMatch(
    relfacts.text,
    /withRelfactHashes|relfactsRoot|replayRelfactsDiff|parseRelfactsDiff|csgFactsRoot|chengCsgFactIdentities/,
  );
  assert.match(relfacts.text, /export function buildRelationFactsFromFacts\(/);
  assert.match(web.text, /from "\.\/csg-facts-identity\.js"/);
  return runStaticMutations(identity, bridge);
}

function command(file, args, options = {}) {
  const result = spawnSync(file, args, {
    cwd: options.cwd ?? packageDir,
    env: options.env ?? process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    signal: result.signal,
    stdout: Buffer.from(result.stdout ?? []),
    stderr: Buffer.from(result.stderr ?? []),
  };
}

function requireSuccess(result, label) {
  if (result.status !== 0) {
    const detail = Buffer.concat([result.stderr, result.stdout]).toString("utf8").trim();
    throw new Error(`${label} failed (${result.status ?? result.signal ?? "signal"})${detail ? `: ${detail}` : ""}`);
  }
}

function assertStableFailure(run, expected, label) {
  const first = run();
  const second = run();
  assert.notEqual(first.status, 0, `${label}: first run unexpectedly succeeded`);
  assert.notEqual(second.status, 0, `${label}: second run unexpectedly succeeded`);
  assert.equal(first.status, second.status, `${label}: exit status drift`);
  assert.equal(first.signal, second.signal, `${label}: signal drift`);
  assert.deepEqual(first.stdout, second.stdout, `${label}: stdout drift`);
  assert.deepEqual(first.stderr, second.stderr, `${label}: stderr drift`);
  assert.match(first.stderr.toString("utf8"), expected, `${label}: missing diagnostic`);
}

function byteCompare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function factIdentityRows(stdout, label) {
  const lines = stdout.toString("utf8").split("\n");
  assert.equal(lines.pop(), "", `${label}: terminal LF missing`);
  return lines.map((line) => {
    const matched = /^fact_hash=(sha256:[0-9a-f]{64})\tsubgraph_cid=(sha256:[0-9a-f]{64})$/.exec(line);
    assert.ok(matched, `${label}: malformed identity row`);
    return { factHash: matched[1], subgraphCid: matched[2] };
  });
}

function sortedRows(rows) {
  return rows
    .map((row) => `${row.factHash}\t${row.subgraphCid}`)
    .sort(byteCompare);
}

function reverseObjectKeys(value) {
  return Object.fromEntries(Object.entries(value).reverse());
}

function oneByteDifference(left, right) {
  const a = Buffer.from(JSON.stringify(left), "utf8");
  const b = Buffer.from(JSON.stringify(right), "utf8");
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) differences += 1;
  }
  return differences === 1;
}

function loadFactsFixture() {
  return [
    { kind: "csg.core.schema", schema: "csg_core", features: ["core-facts"] },
    { kind: "csg.module", id: "mod_identity", path: "src/main.ts", sha256: "sha256:identity" },
    { kind: "csg.symbol", id: "sym_identity", module: "mod_identity", name: "Alpha", symbolKind: "function" },
    { kind: "csg.function", id: "fn_identity", module: "mod_identity", symbol: "sym_identity", name: "alpha" },
  ];
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort(byteCompare)
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

function writeCanonicalFacts(path, facts) {
  const bytes = `${facts.map((fact) => JSON.stringify(canonicalValue(fact))).join("\n")}\n`;
  writeFileSync(path, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

function heldCliInstallPathForPlatform() {
  // Exact literals the bridge pins (csg-cheng-bridge.ts: fixed install path
  // outside any repo tree, never env/HOME-derived). The tools/csg wrapper's
  // root-owned production-launcher receipt gate is an installer concern; the
  // identity contract under test is the exact CLI bytes the bridge invokes.
  if (process.platform === "linux") return "/usr/libexec/cheng/csg-cli";
  if (process.platform === "darwin") return "/Users/lbcheng/.cheng-held/csg-cli";
  return null;
}

function factIdentityCliCommand(rootCli, input, { canonicalInput = false } = {}) {
  const args = ["fact-identities", "--mode", "sandbox"];
  if (canonicalInput) args.push("--canonical-input");
  args.push(input);
  return command(rootCli, args);
}

async function runDynamicContract(runDir) {
  // Sandbox stdout-rows identity contract. The old strict-mode raw-JSONL
  // artifact/root receipt contract is gone at the CLI level: root is now
  // production-admission gated (`production_admission_csgc_required`) and
  // fact-identities streams `fact_hash=`/`subgraph_cid=` rows on stdout.
  const rootCli = heldCliInstallPathForPlatform();
  assert.ok(rootCli, `unsupported platform: ${process.platform}`);
  assert.equal(existsSync(rootCli), true, `missing pure Cheng held CLI: ${rootCli}`);
  const facts = loadFactsFixture();
  const firstPath = join(runDir, "facts-a.jsonl");
  const secondPath = join(runDir, "facts-b.jsonl");
  writeCanonicalFacts(firstPath, facts);
  writeCanonicalFacts(secondPath, facts);

  const runA = factIdentityCliCommand(rootCli, firstPath);
  const runB = factIdentityCliCommand(rootCli, secondPath);
  requireSuccess(runA, "fact-identities A");
  requireSuccess(runB, "fact-identities B");
  assert.equal(runA.stderr.length, 0, "fact-identities A: unexpected stderr");
  assert.equal(runB.stderr.length, 0, "fact-identities B: unexpected stderr");
  assert.deepEqual(runA.stdout, runB.stdout, "identity rows drift across identical runs");
  const rowsA = factIdentityRows(runA.stdout, "fact-identities A");
  assert.equal(rowsA.length, facts.length, "fact-identities A: row count mismatch");

  // Canonical-input verified path must emit identical rows for canonical bytes.
  const runACanonical = factIdentityCliCommand(rootCli, firstPath, {
    canonicalInput: true,
  });
  requireSuccess(runACanonical, "fact-identities A canonical-input");
  assert.deepEqual(
    runACanonical.stdout,
    runA.stdout,
    "canonical-input rows drifted from plain sandbox rows",
  );

  // Identity is fact-line-order independent (rows compared sorted).
  const reordered = [...facts].reverse();
  const reorderedPath = join(runDir, "facts-reordered.jsonl");
  writeCanonicalFacts(reorderedPath, reordered);
  const runReordered = factIdentityCliCommand(rootCli, reorderedPath);
  requireSuccess(runReordered, "fact-identities reordered");
  assert.deepEqual(
    sortedRows(factIdentityRows(runReordered.stdout, "fact-identities reordered")),
    sortedRows(rowsA),
    "identity rows changed after fact-line reordering",
  );

  const changed = facts.map((fact) => fact.id === "sym_identity"
    ? { ...fact, name: "Alphb" }
    : { ...fact });
  assert.equal(oneByteDifference(facts, changed), true, "mutation must change exactly one byte");
  const changedPath = join(runDir, "facts-changed.jsonl");
  writeCanonicalFacts(changedPath, changed);
  const runChanged = factIdentityCliCommand(rootCli, changedPath);
  requireSuccess(runChanged, "fact-identities changed");
  assert.notDeepEqual(
    sortedRows(factIdentityRows(runChanged.stdout, "fact-identities changed")),
    sortedRows(rowsA),
    "one-byte mutation did not change identity rows",
  );

  const malformedDir = join(runDir, "malformed");
  mkdirSync(malformedDir, { recursive: true });
  // Canonicality is enforced, not tolerated: key-permuted JSON hard-fails.
  const nonCanonicalPath = join(malformedDir, "non-canonical.jsonl");
  writeFileSync(
    nonCanonicalPath,
    `${facts.map((fact) => JSON.stringify(reverseObjectKeys(fact))).join("\n")}\n`,
    "utf8",
  );
  assertStableFailure(
    () => factIdentityCliCommand(rootCli, nonCanonicalPath),
    /canonical|json/i,
    "non-canonical key order identity input",
  );
  const truncatedPath = join(malformedDir, "truncated.jsonl");
  const invalidUtf8Path = join(malformedDir, "invalid-utf8.jsonl");
  writeFileSync(truncatedPath, Buffer.from('{"kind":"csg.symbol","id":"truncated"', "utf8"));
  writeFileSync(invalidUtf8Path, Buffer.concat([
    Buffer.from('{"kind":"csg.symbol","id":"bad-', "utf8"),
    Buffer.from([0xc3, 0x28]),
    Buffer.from('"}\n', "utf8"),
  ]));
  assertStableFailure(
    () => factIdentityCliCommand(rootCli, truncatedPath),
    /canonical|json|framing|trunc/i,
    "truncated identity input",
  );
  assertStableFailure(
    () => factIdentityCliCommand(rootCli, invalidUtf8Path),
    /utf-?8|unicode|canonical|json/i,
    "invalid UTF-8 identity input",
  );

  process.stdout.write("csg-facts-identity root-cli smoke ok\n");
}

function runUnderExactGuard() {
  const guard = join(repoRoot, "tools", "beat_c_process_group_guard.sh");
  assert.equal(existsSync(guard), true, `missing exact process-tree guard: ${guard}`);
  const evidenceRoot = process.env.CSG_FACTS_IDENTITY_EVIDENCE_ROOT ??
    join(homedir(), "cheng-patches", "csg-facts-identity");
  mkdirSync(evidenceRoot, { recursive: true });
  const runDir = mkdtempSync(join(evidenceRoot, "run-"));
  const stdoutPath = join(runDir, "smoke.stdout");
  const stderrPath = join(runDir, "smoke.stderr");
  const receiptPath = join(runDir, "smoke.guard.receipt");
  const args = [
    "--rss-limit:1073741824",
    "--timeout:900",
    `--report-out:${receiptPath}`,
    `--stdout:${stdoutPath}`,
    `--stderr:${stderrPath}`,
    "--",
    process.execPath,
    scriptPath,
  ];
  const result = command(guard, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      CSG_FACTS_IDENTITY_EXACT_1G: "1",
      CSG_FACTS_IDENTITY_RUN_DIR: runDir,
    },
  });
  if (existsSync(stdoutPath)) process.stdout.write(readFileSync(stdoutPath));
  if (existsSync(stderrPath)) process.stderr.write(readFileSync(stderrPath));
  process.stderr.write(`csg_facts_identity_evidence=${runDir}\n`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const staticMutationCount = runStaticContract();
if (staticOnly) {
  process.stdout.write(`csg-facts-identity static ok mutations=${staticMutationCount}\n`);
} else if (!guarded) {
  runUnderExactGuard();
} else {
  const runDir = process.env.CSG_FACTS_IDENTITY_RUN_DIR;
  assert.ok(runDir, "guarded smoke is missing CSG_FACTS_IDENTITY_RUN_DIR");
  await runDynamicContract(runDir);
}
