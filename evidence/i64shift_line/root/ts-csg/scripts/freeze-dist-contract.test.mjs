import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  freezeDistribution,
  verifyFrozenDistribution,
} from "./freeze-dist.mjs";

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const realPackageRoot = resolve(scriptRoot, "..");
const evidenceBase = join(homedir(), "cheng-patches", "csg-gates");
const identityOrchestratorMutations = [
  {
    source: "function buildIdentityBinary() {}",
    error: /typescript_identity_binary_builder_reintroduced/,
  },
  {
    source: "function ensureIdentityBinary() {}",
    error: /typescript_identity_binary_cache_reintroduced/,
  },
  {
    source: "const identityBuildCommand = \"system-link-exec\";",
    error: /typescript_identity_system_link_exec_reintroduced/,
  },
  {
    source: "const identitySource = \"csg-facts-identity.cheng\";",
    error: /typescript_identity_cheng_source_reintroduced/,
  },
];

function parseArguments(args) {
  let evidenceRoot;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--evidence-root" || evidenceRoot !== undefined) {
      throw new Error(`freeze_dist_contract_unknown_argument:${args[index]}`);
    }
    evidenceRoot = args[index + 1];
    if (evidenceRoot === undefined) throw new Error("freeze_dist_contract_evidence_root_missing");
    index += 1;
  }
  return { evidenceRoot };
}

function makeEvidenceRoot(requested) {
  mkdirSync(evidenceBase, { recursive: true, mode: 0o700 });
  const root = requested === undefined
    ? mkdtempSync(join(evidenceBase, "ts-csg-freeze-contract."))
    : resolve(requested);
  if (requested !== undefined) mkdirSync(root, { recursive: false, mode: 0o700 });
  const canonical = resolve(root);
  if (
    canonical === "/tmp" ||
    canonical.startsWith("/tmp/") ||
    !canonical.startsWith(`${resolve(join(homedir(), "cheng-patches"))}/`)
  ) {
    throw new Error("freeze_dist_contract_evidence_root_invalid");
  }
  return canonical;
}

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
  writeFileSync(path, text, { encoding: "utf8", flag: "wx", mode: 0o644 });
}

function syntheticDistribution(root, marker = "A") {
  const dist = join(root, "dist");
  mkdirSync(dist, { recursive: false, mode: 0o755 });
  write(
    join(dist, "cli.js"),
    [
      "import { requireChengCsgHeldExecLauncherIdentity } from \"./csg-cheng-bridge.js\";",
      `export const cliMarker = ${JSON.stringify(marker)};`,
      "function parseArgs() { return { out: \"fixture.csgc\", help: false }; }",
      "function isCsgcOutput(out) { return out.endsWith(\".csgc\"); }",
      "export function main() {",
      "  const options = parseArgs([]);",
      "  if (options.help) { return; }",
      "  if (options.out && isCsgcOutput(options.out)) {",
      "    return requireChengCsgHeldExecLauncherIdentity();",
      "  }",
      "}",
      "export function writeFactsOutput(options) {",
      "  if (options.out && options.out.endsWith(\".csgc\")) {",
      "    return requireChengCsgHeldExecLauncherIdentity();",
      "  }",
      "}",
      "",
    ].join("\n"),
  );
  write(
    join(dist, "csg-cheng-bridge.js"),
    [
      "export const ChengCsgHeldExecHardRed = \"HARD_RED:production_launcher_runtime_primitives_missing\";",
      "export const ChengCsgHeldCliInstallPath = \"/usr/libexec/cheng/csg-cli\";",
      "export function requireChengCsgHeldExecLauncherIdentity() {",
      "  throw new Error(ChengCsgHeldExecHardRed);",
      "}",
      "// held exec operand /proc/self/fd/N",
      "export function chengCsgRootFileStrict() { return requireChengCsgHeldExecLauncherIdentity(); }",
      "export function chengCsgDecodeFactKindsAuthorized() { return requireChengCsgHeldExecLauncherIdentity(); }",
      "export function chengCsgFactIdentitiesThroughRootCli() { return requireChengCsgHeldExecLauncherIdentity(); }",
      "export function chengCsgPackFacts() { return requireChengCsgHeldExecLauncherIdentity(); }",
      "export function chengCsgUnpackFacts() { return requireChengCsgHeldExecLauncherIdentity(); }",
      "export function chengCsgValidateFacts() { return requireChengCsgHeldExecLauncherIdentity(); }",
      "export function chengCsgFactsRoot() { return requireChengCsgHeldExecLauncherIdentity(); }",
      "export function chengCsgDiffFacts() { return requireChengCsgHeldExecLauncherIdentity(); }",
      "",
    ].join("\n"),
  );
  write(
    join(dist, "csg-facts-identity.js"),
    [
      "import { requireChengCsgHeldExecLauncherIdentity } from \"./csg-cheng-bridge.js\";",
      "export function chengCsgFactIdentities(facts) {",
      "  return requireChengCsgHeldExecLauncherIdentity();",
      "}",
      "",
    ].join("\n"),
  );
  write(
    join(dist, "csgc-reader.js"),
    [
      "import { requireChengCsgHeldExecLauncherIdentity } from \"./csg-cheng-bridge.js\";",
      "export function csgcReadFactKindsAuthorized(path, manifest, kinds) { return requireChengCsgHeldExecLauncherIdentity(); }",
      "export function csgcReadFacts(bytes) { return requireChengCsgHeldExecLauncherIdentity(); }",
      "",
    ].join("\n"),
  );
  write(
    join(dist, "csgc-writer.js"),
    [
      "import { requireChengCsgHeldExecLauncherIdentity } from \"./csg-cheng-bridge.js\";",
      "export function csgcWriteDebugFile(facts) { return requireChengCsgHeldExecLauncherIdentity(); }",
      "export function csgcWriteFacts(facts) { return requireChengCsgHeldExecLauncherIdentity(); }",
      "",
    ].join("\n"),
  );
  write(
    join(dist, "csg-standard.js"),
    [
      "import { requireChengCsgHeldExecLauncherIdentity } from \"./csg-cheng-bridge.js\";",
      "export function csgFactsRoot(facts) { return requireChengCsgHeldExecLauncherIdentity(); }",
      "export function validateCsgFacts(facts) { return requireChengCsgHeldExecLauncherIdentity(); }",
      "export function diffCsgFacts(left, right) { return requireChengCsgHeldExecLauncherIdentity(); }",
      "",
    ].join("\n"),
  );
  write(
    join(dist, "csg-relfacts.js"),
    [
      "export function buildRelationFactsFromFacts(facts) {",
      "  return facts.map((fact) => ({ kind: \"csg.relfact\", predicate: fact.kind, args: [] }));",
      "}",
      "",
    ].join("\n"),
  );
  write(join(dist, "nested", "runtime.js"), `export const marker = ${JSON.stringify(marker)};\n`);
}

function installFreezeTooling(root) {
  const scripts = join(root, "scripts");
  mkdirSync(scripts, { recursive: true, mode: 0o755 });
  for (const name of [
    "freeze-dist.mjs",
    "freeze-dist-contract.test.mjs",
    "atomic-publish-directory",
    "csg-generation-cli",
  ]) {
    copyFileSync(join(scriptRoot, name), join(scripts, name));
  }
  chmodSync(join(scripts, "csg-generation-cli"), 0o500);
  copyFileSync(join(realPackageRoot, "package.json"), join(root, "package.json"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function treeSnapshot(root) {
  const rows = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const info = lstatSync(path);
      const relativePath = relative(root, path).split(sep).join("/");
      if (info.isSymbolicLink()) {
        rows.push(`link:${relativePath}`);
      } else if (info.isDirectory()) {
        rows.push(`dir:${relativePath}`);
        visit(path);
      } else {
        rows.push(`file:${relativePath}:${info.size}:${sha256(path)}`);
      }
    }
  }
  visit(root);
  return rows;
}

function assertFrozenUnchanged(root, expected) {
  assert.deepEqual(treeSnapshot(join(root, "dist-frozen")), expected);
}

function assertNoLinks(root) {
  const source = join(root, "dist");
  const frozen = join(root, "dist-frozen");
  function visit(directory) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const info = lstatSync(path, { bigint: true });
      assert.equal(info.isSymbolicLink(), false, `symlink survived: ${path}`);
      if (info.isDirectory()) visit(path);
      else assert.equal(info.nlink, 1n, `hardlink survived: ${path}`);
    }
  }
  visit(frozen);
  for (const name of [
    "cli.js",
    "csg-cheng-bridge.js",
    "csg-facts-identity.js",
    "csg-standard.js",
    "csgc-reader.js",
    "csgc-writer.js",
  ]) {
    const active = lstatSync(join(source, name), { bigint: true });
    const sealed = lstatSync(join(frozen, name), { bigint: true });
    assert.notDeepEqual([active.dev, active.ino], [sealed.dev, sealed.ino]);
    assert.equal(sha256(join(source, name)), sha256(join(frozen, name)));
  }
}

function assertRejectsPreserving(root, action, pattern) {
  const before = treeSnapshot(join(root, "dist-frozen"));
  assert.throws(action, pattern);
  assertFrozenUnchanged(root, before);
}

function main() {
  const { evidenceRoot: requestedEvidenceRoot } = parseArguments(process.argv.slice(2));
  const evidenceRoot = makeEvidenceRoot(requestedEvidenceRoot);
  const root = join(evidenceRoot, "gate-fixture");
  mkdirSync(root, { recursive: false, mode: 0o755 });
  installFreezeTooling(root);
  syntheticDistribution(root);

  const first = freezeDistribution({ packageRoot: root });
  assert.equal(first.status, "published");
  assert.equal(verifyFrozenDistribution({ packageRoot: root }).status, "verified");
  assertNoLinks(root);
  const firstManifest = readFileSync(join(root, "dist-frozen", "freeze-manifest.json"), "utf8");

  const second = freezeDistribution({ packageRoot: root });
  assert.equal(second.manifestSha256, first.manifestSha256);
  assert.equal(
    readFileSync(join(root, "dist-frozen", "freeze-manifest.json"), "utf8"),
    firstManifest,
  );

  writeFileSync(join(root, "dist-frozen", "stale.js"), "stale\n", "utf8");
  freezeDistribution({ packageRoot: root });
  assert.equal(existsSync(join(root, "dist-frozen", "stale.js")), false);

  writeFileSync(join(root, "dist", "pending.js"), "pending\n", "utf8");
  assertRejectsPreserving(
    root,
    () => freezeDistribution({
      packageRoot: root,
      beforePublish() {
        throw new Error("contract_before_publish");
      },
    }),
    /contract_before_publish/,
  );
  rmSync(join(root, "dist", "pending.js"));

  writeFileSync(join(root, "dist", "changing.js"), "before\n", "utf8");
  assertRejectsPreserving(
    root,
    () => freezeDistribution({
      packageRoot: root,
      beforePublish({ sourceRoot }) {
        writeFileSync(join(sourceRoot, "changing.js"), "after\n", "utf8");
      },
    }),
    /source_tree_changed_before_publish/,
  );
  rmSync(join(root, "dist", "changing.js"));

  symlinkSync("cli.js", join(root, "dist", "linked-cli.js"));
  assertRejectsPreserving(
    root,
    () => freezeDistribution({ packageRoot: root }),
    /symlink_rejected/,
  );
  rmSync(join(root, "dist", "linked-cli.js"));

  linkSync(join(root, "dist", "cli.js"), join(root, "dist", "hardlinked-cli.js"));
  assertRejectsPreserving(
    root,
    () => freezeDistribution({ packageRoot: root }),
    /hardlink_rejected/,
  );
  rmSync(join(root, "dist", "hardlinked-cli.js"));

  renameSync(join(root, "dist", "cli.js"), join(root, "dist", "cli.missing"));
  assertRejectsPreserving(
    root,
    () => freezeDistribution({ packageRoot: root }),
    /required_runtime_file_missing:cli\.js/,
  );
  renameSync(join(root, "dist", "cli.missing"), join(root, "dist", "cli.js"));

  const bridgePath = join(root, "dist", "csg-cheng-bridge.js");
  const bridgeBytes = readFileSync(bridgePath);
  writeFileSync(bridgePath, `${bridgeBytes.toString("utf8")}\nconst CSGC_MAGIC = \"CSGC\";\n`);
  assertRejectsPreserving(
    root,
    () => freezeDistribution({ packageRoot: root }),
    /typescript_physical_codec_reintroduced/,
  );
  writeFileSync(bridgePath, bridgeBytes);

  writeFileSync(
    bridgePath,
    `${bridgeBytes.toString("utf8")}\nimport { createHash } from "node:crypto";\n`,
  );
  assertRejectsPreserving(
    root,
    () => freezeDistribution({ packageRoot: root }),
    /typescript_prelauncher_io_or_path_authority_reintroduced/,
  );
  writeFileSync(bridgePath, bridgeBytes);

  const missingLauncherGuard = bridgeBytes.toString("utf8").replace(
    "export function chengCsgFactIdentitiesThroughRootCli() { return requireChengCsgHeldExecLauncherIdentity(); }",
    "export function chengCsgFactIdentitiesThroughRootCli() { return []; }",
  );
  assert.notEqual(missingLauncherGuard, bridgeBytes.toString("utf8"));
  writeFileSync(bridgePath, missingLauncherGuard);
  assertRejectsPreserving(
    root,
    () => freezeDistribution({ packageRoot: root }),
    /held_exec_launcher_guard_not_dominant:chengCsgFactIdentitiesThroughRootCli/,
  );
  writeFileSync(bridgePath, bridgeBytes);

  const forgedLauncherIdentity = `${bridgeBytes.toString("utf8")}\nconst launcherAdmitted = process.env.CSG_LAUNCHER_VERIFIED;\n`;
  writeFileSync(bridgePath, forgedLauncherIdentity);
  assertRejectsPreserving(
    root,
    () => freezeDistribution({ packageRoot: root }),
    /typescript_prelauncher_io_or_path_authority_reintroduced/,
  );
  writeFileSync(bridgePath, bridgeBytes);

  writeFileSync(
    bridgePath,
    `${bridgeBytes.toString("utf8")}\nfunction buildMerkleProof() { return []; }\n`,
  );
  assertRejectsPreserving(
    root,
    () => freezeDistribution({ packageRoot: root }),
    /typescript_root_or_pack_authority_reintroduced/,
  );
  writeFileSync(bridgePath, bridgeBytes);

  const cliPath = join(root, "dist", "cli.js");
  const cliBytes = readFileSync(cliPath);
  const missingCliGuard = cliBytes.toString("utf8").replace(
    "return requireChengCsgHeldExecLauncherIdentity();",
    "return undefined;",
  );
  assert.notEqual(missingCliGuard, cliBytes.toString("utf8"));
  writeFileSync(cliPath, missingCliGuard);
  assertRejectsPreserving(
    root,
    () => freezeDistribution({ packageRoot: root }),
    /cli_csgc_prelauncher_guard_missing/,
  );
  writeFileSync(cliPath, cliBytes);

  writeFileSync(
    cliPath,
    `${cliBytes.toString("utf8")}\nimport { spawn } from "node:child_process";\n`,
  );
  assertRejectsPreserving(
    root,
    () => freezeDistribution({ packageRoot: root }),
    /cli_csgc_prelauncher_io_or_direct_tool_reintroduced/,
  );
  writeFileSync(cliPath, cliBytes);

  const identityPath = join(root, "dist", "csg-facts-identity.js");
  const identityBytes = readFileSync(identityPath);
  for (const mutation of identityOrchestratorMutations) {
    writeFileSync(
      identityPath,
      `${identityBytes.toString("utf8")}\n${mutation.source}\n`,
    );
    assertRejectsPreserving(
      root,
      () => freezeDistribution({ packageRoot: root }),
      mutation.error,
    );
    writeFileSync(identityPath, identityBytes);
  }

  for (const [name, operation] of [
    ["csg-facts-identity.js", "chengCsgFactIdentities"],
    ["csgc-reader.js", "csgcReadFacts"],
    ["csgc-writer.js", "csgcWriteFacts"],
    ["csg-standard.js", "csgFactsRoot"],
  ]) {
    const adapterPath = join(root, "dist", name);
    const adapterBytes = readFileSync(adapterPath);
    const missingGuard = adapterBytes.toString("utf8").replace(
      new RegExp(`(export function ${operation}\\([^}]+?)return requireChengCsgHeldExecLauncherIdentity\\(\\);`),
      "$1return undefined;",
    );
    assert.notEqual(missingGuard, adapterBytes.toString("utf8"));
    writeFileSync(adapterPath, missingGuard);
    assertRejectsPreserving(
      root,
      () => freezeDistribution({ packageRoot: root }),
      new RegExp(`held_exec_launcher_guard_not_dominant:${operation}`),
    );
    writeFileSync(adapterPath, adapterBytes);
  }

  // dist-frozen already exists here, so every freezeDistribution call below is
  // the refreeze (exchange) path: a guard wrapped in a conditional such as
  // `if (globalThis) { return guard(); }` must be rejected there and the
  // previously frozen distribution must be preserved byte for byte.
  for (const [name, operation] of [
    ["csg-cheng-bridge.js", "chengCsgUnpackFacts"],
    ["csg-standard.js", "csgFactsRoot"],
  ]) {
    const wrapperPath = join(root, "dist", name);
    const wrapperBytes = readFileSync(wrapperPath);
    const wrappedGuard = wrapperBytes.toString("utf8").replace(
      new RegExp(`(export function ${operation}\\([^}]+?)return requireChengCsgHeldExecLauncherIdentity\\(\\);`),
      "$1if (globalThis) { return requireChengCsgHeldExecLauncherIdentity(); }",
    );
    assert.notEqual(wrappedGuard, wrapperBytes.toString("utf8"));
    writeFileSync(wrapperPath, wrappedGuard);
    assertRejectsPreserving(
      root,
      () => freezeDistribution({ packageRoot: root }),
      new RegExp(`held_exec_launcher_guard_not_dominant:${operation}`),
    );
    writeFileSync(wrapperPath, wrapperBytes);
  }

  const relfactsPath = join(root, "dist", "csg-relfacts.js");
  const relfactsBytes = readFileSync(relfactsPath);
  writeFileSync(relfactsPath, `${relfactsBytes.toString("utf8")}\nfunction replayRelfactsDiff() {}\n`);
  assertRejectsPreserving(
    root,
    () => freezeDistribution({ packageRoot: root }),
    /typescript_relfacts_authority_reintroduced/,
  );
  writeFileSync(relfactsPath, relfactsBytes);

  freezeDistribution({ packageRoot: root });
  const frozenIdentityPath = join(root, "dist-frozen", "csg-facts-identity.js");
  const frozenIdentityBytes = readFileSync(frozenIdentityPath);
  for (const mutation of identityOrchestratorMutations) {
    chmodSync(frozenIdentityPath, 0o644);
    writeFileSync(
      frozenIdentityPath,
      `${frozenIdentityBytes.toString("utf8")}\n${mutation.source}\n`,
    );
    assert.throws(
      () => verifyFrozenDistribution({ packageRoot: root }),
      mutation.error,
    );
    writeFileSync(frozenIdentityPath, frozenIdentityBytes);
    chmodSync(frozenIdentityPath, 0o444);
  }
  const manifestPath = join(root, "dist-frozen", "freeze-manifest.json");
  const manifestBytes = readFileSync(manifestPath);
  chmodSync(manifestPath, 0o644);
  writeFileSync(manifestPath, `${manifestBytes.toString("utf8")} `);
  assert.throws(
    () => verifyFrozenDistribution({ packageRoot: root }),
    /manifest_(?:json_invalid|not_canonical)/,
  );
  writeFileSync(manifestPath, manifestBytes);
  chmodSync(manifestPath, 0o444);

  const frozenCli = join(root, "dist-frozen", "cli.js");
  const frozenCliBytes = readFileSync(frozenCli);
  chmodSync(frozenCli, 0o644);
  writeFileSync(frozenCli, `${frozenCliBytes.toString("utf8")}drift\n`);
  assert.throws(
    () => verifyFrozenDistribution({ packageRoot: root }),
    /frozen_tree_bytes_mismatch/,
  );
  writeFileSync(frozenCli, frozenCliBytes);
  chmodSync(frozenCli, 0o444);

  assert.equal(verifyFrozenDistribution({ packageRoot: root }).status, "verified");
  assertNoLinks(root);
  const receipt = [
    "ts_csg_freeze_dist_contract=PASS",
    "atomic_noreplace=verified",
    "atomic_exchange=verified",
    "failure_preserves_previous_frozen=verified",
    "source_target_byte_identity=verified",
    "manifest_canonicality=verified",
    "symlink_hardlink_rejection=verified",
    "pure_cheng_bridge=verified",
    "bridge_semantic_authority_mutations=4",
    "identity_orchestrator_mutations=8",
    "adapter_guard_mutations=4",
    "guard_wrapper_mutations=2",
    "cli_prelauncher_mutations=2",
    "relfacts_authority_absence=verified",
    "new_mutations=20",
    `fixture=${root}`,
    "dynamic_completion_credit=0",
    "",
  ].join("\n");
  writeFileSync(join(evidenceRoot, "receipt.txt"), receipt, "utf8");
  process.stdout.write(receipt);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
