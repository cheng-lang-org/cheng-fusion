#!/usr/bin/env bun
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  CHENG_PARSER_RECEIPT_BUILD_COMPILER,
  CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE,
  CHENG_PARSER_PRODUCTION_RECEIPT_HARNESS_SCHEMA,
  buildParserReceiptHarnessExecutableIdentity,
  buildParserReceiptHarnessToolClosure,
  parserReceiptHarnessCompilerEnvironment,
  parserReceiptHarnessCompilerProfile,
  validateParserProductionReceiptHarnessArtifactFiles,
  validateParserProductionReceiptHarnessIdentity,
  validateParserProductionReceiptHarnessSourcePlan,
} from "../src/cheng_ebnf_parser_node_map.ts";
import {canonicalJson} from "../src/cheng_semantic_matrix_m9023.ts";
import {
  validateDriverReceiptToolchainIdentity,
} from "../tools/grammar_receipt_bind.ts";
import {
  assertCurrentParserProductionProfile,
  currentParserHarnessAuthorityFromIdentities,
  parseCurrentParserHarnessArgs,
} from "../tools/current_parser_production_receipt_harness.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fusionRoot = resolve(here, "..");
const harnessPath = resolve(
  fusionRoot,
  "tools/current_parser_production_receipt_harness.ts",
);
const receiptToolchainFixturePath = resolve(
  fusionRoot,
  "fixtures/semantic/annotation_parser_receipt.json",
);
const unregisteredAnnotationMutationPath = resolve(
  "/Users/lbcheng/cheng-lang",
  "src/tests/parser_unregistered_annotation_inline_negative.cheng",
);

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const toolClosure = await buildParserReceiptHarnessToolClosure(
  harnessPath,
  fusionRoot,
);
const harnessSource = readFileSync(harnessPath, "utf8");
assert.equal(
  readFileSync(unregisteredAnnotationMutationPath, "utf8"),
  "@inline\nfn main(): int32 =\n    return 0\n",
  "未注册注解 mutation 必须绑定精确当前源字节",
);
assert.match(
  harnessSource,
  /assertUnregisteredAnnotationMutation\(\s*authority\.unregisteredAnnotationMutationPath,\s*\);\n  const frozenSources =/,
  "mutation 精确源必须在冻结输入和 driver 构建前 hard-fail",
);
assert.doesNotMatch(
  harnessSource,
  /process\.env\.CHENG_ROOT|CHENG_ROOT\s*\?\?|\/Users\/lbcheng\/cheng-lang/,
  "harness 禁止 ambient/live CHENG_ROOT 或固定 live default",
);
assert.doesNotMatch(
  harnessSource,
  /--source-snapshot-manifest|--official-driver/,
  "harness 禁止旧 snapshot/driver 输入",
);
assert.match(
  harnessSource,
  /--official-current-build-binding/,
  "harness 必须只接受 official current build binding",
);
assert.match(
  harnessSource,
  /drivers\[0\]!\.sha256 !==\s*authority\.officialCurrentBuild\.officialDriverSha256/,
  "harness 构建 driver 必须与 official current driver 原始字节一致",
);
assert.match(
  harnessSource,
  /realpathSync\(path\) !== path/,
  "harness source 必须拒绝父目录 symlink 别名",
);
assert.match(
  harnessSource,
  /realpathSync\(dirname\(outDir\)\)/,
  "harness 输出父目录必须是 canonical 真实路径",
);
assert.match(
  harnessSource,
  /for \(const driver of drivers\) \{[\s\S]*?runRejected\(driver\.path,[\s\S]*?"parser annotation: unregistered @inline"\);[\s\S]*?if \(existsSync\(mutationOut\)\)[\s\S]*?assertInputsUnchanged\(/,
  "两个独立 driver 都必须执行未注册注解 mutation",
);
assert.match(
  harnessSource,
  /result\.status !== 2 \|\|[\s\S]*?String\(result\.stdout\) !== "" \|\|[\s\S]*?!String\(result\.stderr\)\.includes\(expectedStderr\)/,
  "mutation admission 必须验证 rc=2、空 stdout 和精确错误",
);
const productionProfileGate = harnessSource.indexOf(
  "assertCurrentParserProductionProfile(",
  harnessSource.indexOf("export async function runCurrentParserProductionReceiptHarness"),
);
const seedBuild = harnessSource.indexOf(
  'const seed = join(outDir, "cheng-cold-current")',
);
assert.ok(
  productionProfileGate >= 0 && seedBuild > productionProfileGate,
  "125 productions、971 obligations、29 sources 必须在 seed 构建前 hard-fail",
);
assert.doesNotThrow(
  () => assertCurrentParserProductionProfile(125, 971, 29),
);
for (const profile of [
  [124, 971, 29],
  [125, 970, 29],
  [125, 971, 28],
  [125, 971, 30],
] as const) {
  assert.throws(
    () => assertCurrentParserProductionProfile(...profile),
    /current production profile invalid/,
  );
}
assert.equal(toolClosure.fileCount, toolClosure.rows.length);
assert.ok(toolClosure.fileCount > 1);
assert.ok(
  toolClosure.rows.some(
    (row) => row.path ===
      "tools/current_parser_production_receipt_harness.ts",
  ),
);
assert.equal(toolClosure.sha256, sha256(canonicalJson(toolClosure.rows)));

assert.deepEqual(
  parseCurrentParserHarnessArgs([
    "--official-current-build-binding",
    "/private/build/current-official-binding.kv",
    "--out-dir",
    "/private/harness-out",
    "--source",
    "/private/corpus/a.cheng",
  ]),
  {
    officialCurrentBuildBindingPath:
      "/private/build/current-official-binding.kv",
    outDir: "/private/harness-out",
    sources: ["/private/corpus/a.cheng"],
  },
);
for (const args of [
  [
    "--out-dir",
    "/private/harness-out",
    "--source",
    "/private/corpus/a.cheng",
  ],
  [
    "--official-current-build-binding",
    "relative-binding.kv",
    "--out-dir",
    "/private/harness-out",
    "--source",
    "/private/corpus/a.cheng",
  ],
  [
    "--source-snapshot-manifest",
    "/private/old.manifest",
    "--out-dir",
    "/private/harness-out",
    "--source",
    "/private/corpus/a.cheng",
  ],
  [
    "--official-driver",
    "/private/old-driver",
    "--out-dir",
    "/private/harness-out",
    "--source",
    "/private/corpus/a.cheng",
  ],
] as const) {
  assert.throws(
    () => parseCurrentParserHarnessArgs(args),
    /current parser receipt harness:/,
  );
}
const removedCli = spawnSync(process.execPath, [
  harnessPath,
  "--source-snapshot-manifest",
  "/private/old.manifest",
  "--out-dir",
  "/private/harness-out",
  "--source",
  "/private/corpus/a.cheng",
], {
  cwd: fusionRoot,
  encoding: "utf8",
});
assert.equal(removedCli.status, 1);
assert.equal(removedCli.stdout, "");
assert.match(removedCli.stderr, /unknown argument --source-snapshot-manifest/);

const receiptToolchainFixtureValue = JSON.parse(
  readFileSync(receiptToolchainFixturePath, "utf8"),
) as any;
receiptToolchainFixtureValue.counts.normalizedStatementFactCount = 0;
receiptToolchainFixtureValue.counts.normalizedScopeFactCount = 0;
receiptToolchainFixtureValue.counts.importEdgeCount = 0;
receiptToolchainFixtureValue.counts.typeEnumVariantCount = 0;
receiptToolchainFixtureValue.counts.declarationCount = 0;
receiptToolchainFixtureValue.normalizedStatementFacts = [];
receiptToolchainFixtureValue.normalizedScopeFacts = [];
receiptToolchainFixtureValue.importEdges = [];
receiptToolchainFixtureValue.typeEnumVariants = [];
receiptToolchainFixtureValue.declarations = [];
const receiptToolchainFixture =
  JSON.stringify(receiptToolchainFixtureValue);
validateDriverReceiptToolchainIdentity(receiptToolchainFixture);
assert.throws(
  () => validateDriverReceiptToolchainIdentity(
    receiptToolchainFixture.replace(
      /^\{/,
      "{\"schema\":\"cheng_driver_parse_receipt_v1\",",
    ),
  ),
  /duplicate_key:schema/,
  "receipt JSON 禁止双写旧/current schema",
);
const compatibilityReceipt = JSON.parse(receiptToolchainFixture) as any;
compatibilityReceipt.legacyPayload = {schema: "cheng_driver_parse_receipt_v1"};
assert.throws(
  () => validateDriverReceiptToolchainIdentity(
    JSON.stringify(compatibilityReceipt),
  ),
  /forbidden_compatibility_key:legacyPayload/,
  "receipt JSON 禁止 legacy/compatibility 列",
);
const changedEmbeddedToolchain =
  JSON.parse(receiptToolchainFixture) as any;
changedEmbeddedToolchain.toolchainManifest.driverBytesSha256 =
  "0".repeat(64);
assert.throws(
  () => validateDriverReceiptToolchainIdentity(
    JSON.stringify(changedEmbeddedToolchain),
  ),
  /driver receipt toolchain identity invalid/,
);

const runtimeExecutableSha256 = sha256(readFileSync(process.execPath));
const buildCompiler =
  buildParserReceiptHarnessExecutableIdentity(
    CHENG_PARSER_RECEIPT_BUILD_COMPILER,
  );
assert.equal(buildCompiler.command, "/usr/bin/cc");
const compilerProfile = parserReceiptHarnessCompilerProfile();
const frozenParent = "/frozen";
const frozenRoot = join(frozenParent, "source-snapshot");
const sourcePath = join(frozenParent, "source.cheng");
const receiptPath = join(frozenParent, "receipt-a.json");
const sourceBytes = Buffer.from("let value = 1\n");
const receiptBytes = Buffer.from("{\"stage\":\"parser\"}\n");
const driverSha256 = "1".repeat(64);
const traceSha256 = "2".repeat(64);
const officialCurrentBuild = {
  bindingPath: join(frozenParent, "current-official-binding.kv"),
  bindingSha256: "a".repeat(64),
  officialBuildReceiptPath: join(
    frozenParent,
    "cheng.current-build-receipt.kv",
  ),
  officialBuildReceiptSha256: "b".repeat(64),
  sourceSnapshotManifestPath: join(
    frozenParent,
    "cheng-source-snapshot.manifest.txt",
  ),
  sourceSnapshotManifestSha256: "c".repeat(64),
  sourceSnapshotRoot: frozenRoot,
  sourceSnapshotClosureSha256: "d".repeat(64),
  officialDriverPath: join(frozenParent, "official", "cheng"),
  officialDriverSha256: driverSha256,
};
const authority = currentParserHarnessAuthorityFromIdentities(
  {
    bindingPath: officialCurrentBuild.bindingPath,
    bindingSha256: officialCurrentBuild.bindingSha256,
    officialBuildReceiptPath:
      officialCurrentBuild.officialBuildReceiptPath,
    officialBuildReceiptSha256:
      officialCurrentBuild.officialBuildReceiptSha256,
    sourceSnapshotManifestPath:
      officialCurrentBuild.sourceSnapshotManifestPath,
    sourceSnapshotManifestSha256:
      officialCurrentBuild.sourceSnapshotManifestSha256,
    sourceSnapshotRoot: officialCurrentBuild.sourceSnapshotRoot,
    officialDriverPath: officialCurrentBuild.officialDriverPath,
    officialDriverSha256: officialCurrentBuild.officialDriverSha256,
  },
  {
    manifestPath: officialCurrentBuild.sourceSnapshotManifestPath,
    manifestSha256: officialCurrentBuild.sourceSnapshotManifestSha256,
    closureSha256: officialCurrentBuild.sourceSnapshotClosureSha256,
    entryCount: 1,
    compilerSourceCount: 1,
    rows: [],
  },
);
assert.equal(authority.chengRoot, frozenRoot);
assert.equal(
  authority.driverEntryPath,
  join(frozenRoot, CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE),
);
assert.deepEqual(authority.officialCurrentBuild, officialCurrentBuild);
assert.throws(
  () => currentParserHarnessAuthorityFromIdentities(
    {
      bindingPath: officialCurrentBuild.bindingPath,
      bindingSha256: officialCurrentBuild.bindingSha256,
      officialBuildReceiptPath:
        officialCurrentBuild.officialBuildReceiptPath,
      officialBuildReceiptSha256:
        officialCurrentBuild.officialBuildReceiptSha256,
      sourceSnapshotManifestPath:
        officialCurrentBuild.sourceSnapshotManifestPath,
      sourceSnapshotManifestSha256:
        officialCurrentBuild.sourceSnapshotManifestSha256,
      sourceSnapshotRoot: officialCurrentBuild.sourceSnapshotRoot,
      officialDriverPath: officialCurrentBuild.officialDriverPath,
      officialDriverSha256: officialCurrentBuild.officialDriverSha256,
    },
    {
      manifestPath: officialCurrentBuild.sourceSnapshotManifestPath,
      manifestSha256: "0".repeat(64),
      closureSha256: officialCurrentBuild.sourceSnapshotClosureSha256,
      entryCount: 1,
      compilerSourceCount: 1,
      rows: [],
    },
  ),
  /official binding snapshot drift/,
);
const closureRows = [{
  path: "src/core/lang/parser.cheng",
  byteLength: 128,
  sha256: "3".repeat(64),
}];
const manifest = {
  schema: CHENG_PARSER_PRODUCTION_RECEIPT_HARNESS_SCHEMA,
  status: "accepted",
  officialCurrentBuild,
  formalEbnfSha256: "4".repeat(64),
  formalSpec: {
    path: join(frozenRoot, "docs/cheng-formal-spec.md"),
    sha256: "5".repeat(64),
  },
  parser: {
    path: join(frozenRoot, "src/core/lang/parser.cheng"),
    sha256: closureRows[0].sha256,
  },
  receiptProducer: {
    path: join(
      frozenRoot,
      "src/core/tooling/compiler_parser_receipt.cheng",
    ),
    sha256: "6".repeat(64),
  },
  driverEntry: {
    path: join(frozenRoot, CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE),
    sha256: "7".repeat(64),
  },
  bootstrap: {
    path: join(frozenRoot, "bootstrap/cheng_cold.c"),
    sha256: "8".repeat(64),
  },
  harness: {path: harnessPath, sha256: "9".repeat(64)},
  dependencyClosure: {
    fileCount: closureRows.length,
    sha256: sha256(canonicalJson(closureRows)),
    rows: closureRows,
  },
  toolClosure,
  buildCompiler,
  compilerProfile,
  runtime: {
    executablePath: process.execPath,
    executableSha256: runtimeExecutableSha256,
    version: Bun.version,
  },
  drivers: [
    {
      role: "receipt_driver_a",
      path: "/frozen/receipt_driver_a/cheng",
      sha256: driverSha256,
      inode: "101",
      byteLength: 1024,
    },
    {
      role: "receipt_driver_b",
      path: "/frozen/receipt_driver_b/cheng",
      sha256: driverSha256,
      inode: "102",
      byteLength: 1024,
    },
  ],
  sources: [{
    path: sourcePath,
    sha256: sha256(sourceBytes),
    byteLength: sourceBytes.length,
  }],
  receipts: [
    {
      path: receiptPath,
      sha256: sha256(receiptBytes),
      inode: "201",
      byteLength: receiptBytes.length,
      sourcePath,
      driverRole: "receipt_driver_a",
      driverSha256,
      parserTraceRootSha256: traceSha256,
    },
    {
      path: "/frozen/receipt-b.json",
      sha256: sha256(receiptBytes),
      inode: "202",
      byteLength: receiptBytes.length,
      sourcePath,
      driverRole: "receipt_driver_b",
      driverSha256,
      parserTraceRootSha256: traceSha256,
    },
  ],
};
const validationInput = {
  officialCurrentBuild,
  formalSpecPath: manifest.formalSpec.path,
  formalSpecSha256: manifest.formalSpec.sha256,
  formalEbnfSha256: manifest.formalEbnfSha256,
  parserPath: manifest.parser.path,
  parserSha256: manifest.parser.sha256,
  receiptProducerPath: manifest.receiptProducer.path,
  receiptProducerSha256: manifest.receiptProducer.sha256,
  driverEntryPath: manifest.driverEntry.path,
  driverEntrySha256: manifest.driverEntry.sha256,
  bootstrapPath: manifest.bootstrap.path,
  bootstrapSha256: manifest.bootstrap.sha256,
  harnessPath: manifest.harness.path,
  harnessSha256: manifest.harness.sha256,
  sourcePath,
  sourceSha256: sha256(sourceBytes),
  receiptPath,
  receiptSha256: sha256(receiptBytes),
  dependencyClosureSha256: manifest.dependencyClosure.sha256,
  toolClosureSha256: toolClosure.sha256,
  buildCompilerExecutablePath: buildCompiler.executablePath,
  buildCompilerExecutableSha256: buildCompiler.executableSha256,
  buildCompilerVersionSha256: buildCompiler.versionSha256,
  runtimeExecutablePath: process.execPath,
  runtimeExecutableSha256,
  runtimeVersion: Bun.version,
};

assert.equal(
  validateParserProductionReceiptHarnessIdentity(
    manifest,
    validationInput,
  ).driverRole,
  "receipt_driver_a",
);
const poisonedCompilerEnvironment =
  parserReceiptHarnessCompilerEnvironment({
    PATH: "/current/path",
    BACKEND_JOBS: "99",
    CPATH: "/poison/include",
    CHENG_STRICT_CALL_SYNTAX: "0",
    CHENG_TYPED_EXPR_LEGACY: "legacy",
  });
assert.equal(
  poisonedCompilerEnvironment.PATH,
  "/usr/bin:/bin:/usr/sbin:/sbin",
);
assert.equal(poisonedCompilerEnvironment.BACKEND_JOBS, "1");
assert.equal(poisonedCompilerEnvironment.CHENG_STRICT_CALL_SYNTAX, "1");
assert.equal(poisonedCompilerEnvironment.CHENG_TYPED_EXPR_LEGACY, undefined);
assert.equal(poisonedCompilerEnvironment.CPATH, undefined);
assert.equal(compilerProfile.schema, "cheng_formal_compile_profile");
validateParserProductionReceiptHarnessSourcePlan(
  manifest,
  manifest.sources,
);
assert.equal(
  CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE,
  "src/core/tooling/backend_driver_dispatch_min.cheng",
);

const fullDriverInput = {
  ...validationInput,
  driverEntryPath: join(
    frozenRoot,
    "src/core/tooling/backend_driver_main.cheng",
  ),
};
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    manifest,
    fullDriverInput,
  ),
  /driver_entry_current_authority_invalid/,
);
const changedSourcePlan = clone(manifest);
changedSourcePlan.sources[0].sha256 = "0".repeat(64);
assert.throws(
  () => validateParserProductionReceiptHarnessSourcePlan(
    changedSourcePlan,
    manifest.sources,
  ),
  /harness_source_plan_identity_invalid/,
);

const changedDependency = clone(manifest);
changedDependency.dependencyClosure.rows[0].sha256 = "0".repeat(64);
changedDependency.dependencyClosure.sha256 =
  sha256(canonicalJson(changedDependency.dependencyClosure.rows));
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    changedDependency,
    validationInput,
  ),
  /dependency_closure_identity_invalid/,
);

const changedOfficialBuild = clone(manifest);
changedOfficialBuild.officialCurrentBuild.bindingSha256 = "0".repeat(64);
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    changedOfficialBuild,
    validationInput,
  ),
  /harness_official_current_build_identity_invalid/,
);

const liveRootOfficialBuild = clone(manifest);
liveRootOfficialBuild.officialCurrentBuild.sourceSnapshotRoot =
  "/Users/lbcheng/cheng-lang";
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    liveRootOfficialBuild,
    validationInput,
  ),
  /harness_official_current_build_identity_invalid/,
);

const changedDriverEntry = clone(manifest);
changedDriverEntry.driverEntry.path = "/swapped/driver.cheng";
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    changedDriverEntry,
    validationInput,
  ),
  /driver_entry_identity_invalid/,
);

const changedHarness = clone(manifest);
changedHarness.harness.sha256 = "0".repeat(64);
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    changedHarness,
    validationInput,
  ),
  /harness_tool_identity_invalid/,
);

const removedTool = clone(manifest) as any;
removedTool.toolClosure.rows.pop();
removedTool.toolClosure.fileCount = removedTool.toolClosure.rows.length;
removedTool.toolClosure.sha256 =
  sha256(canonicalJson(removedTool.toolClosure.rows));
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    removedTool,
    validationInput,
  ),
  /tool_closure_identity_invalid/,
);

const changedToolBytes = clone(manifest) as any;
changedToolBytes.toolClosure.rows[0].sha256 = "0".repeat(64);
changedToolBytes.toolClosure.sha256 =
  sha256(canonicalJson(changedToolBytes.toolClosure.rows));
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    changedToolBytes,
    validationInput,
  ),
  /tool_closure_identity_invalid/,
);

const changedRuntime = clone(manifest);
changedRuntime.runtime.executableSha256 = "0".repeat(64);
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    changedRuntime,
    validationInput,
  ),
  /harness_runtime_identity_invalid/,
);

const changedCompilerProfile = clone(manifest) as any;
changedCompilerProfile.compilerProfile.env.BACKEND_JOBS = "2";
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    changedCompilerProfile,
    validationInput,
  ),
  /harness_compiler_profile_identity_invalid/,
);

const changedCompiler = clone(manifest) as any;
changedCompiler.buildCompiler.executableSha256 = "0".repeat(64);
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    changedCompiler,
    validationInput,
  ),
  /harness_build_compiler_identity_invalid/,
);

const missingRuntime = clone(manifest) as any;
delete missingRuntime.runtime;
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    missingRuntime,
    validationInput,
  ),
  /harness_keys_invalid/,
);

const changedSource = clone(manifest);
changedSource.sources[0].sha256 = "0".repeat(64);
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    changedSource,
    validationInput,
  ),
  /harness_source_not_bound/,
);

const changedReceiptTrace = clone(manifest);
changedReceiptTrace.receipts[1].parserTraceRootSha256 = "0".repeat(64);
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    changedReceiptTrace,
    validationInput,
  ),
  /harness_receipt_fixed_point_invalid/,
);

const changedDriverLength = clone(manifest);
changedDriverLength.drivers[1].byteLength += 1;
assert.throws(
  () => validateParserProductionReceiptHarnessIdentity(
    changedDriverLength,
    validationInput,
  ),
  /harness_driver_fixed_point_invalid/,
);

const artifactRoot = mkdtempSync(
  join(tmpdir(), "cheng-parser-harness-artifacts-"),
);
try {
  const artifactManifest = clone(manifest);
  const artifactSourcePath = join(artifactRoot, "source.cheng");
  const artifactDriverAPath = join(
    artifactRoot, "receipt_driver_a", "cheng");
  const artifactDriverBPath = join(
    artifactRoot, "receipt_driver_b", "cheng");
  const artifactReceiptAPath = join(artifactRoot, "receipt-a.json");
  const artifactReceiptBPath = join(artifactRoot, "receipt-b.json");
  const artifactManifestPath = join(artifactRoot, "manifest.json");
  const driverBytes = Buffer.from("deterministic-driver\n");
  mkdirSync(dirname(artifactDriverAPath));
  mkdirSync(dirname(artifactDriverBPath));
  writeFileSync(artifactSourcePath, sourceBytes);
  writeFileSync(artifactDriverAPath, driverBytes);
  writeFileSync(artifactDriverBPath, driverBytes);
  writeFileSync(artifactReceiptAPath, receiptBytes);
  writeFileSync(artifactReceiptBPath, receiptBytes);
  artifactManifest.sources[0] = {
    path: artifactSourcePath,
    sha256: sha256(sourceBytes),
    byteLength: sourceBytes.length,
  };
  for (const [row, path] of [
    [artifactManifest.drivers[0], artifactDriverAPath],
    [artifactManifest.drivers[1], artifactDriverBPath],
  ] as const) {
    const stat = lstatSync(path, {bigint: true});
    row.path = path;
    row.sha256 = sha256(driverBytes);
    row.inode = stat.ino.toString();
    row.byteLength = driverBytes.length;
  }
  for (const [row, path] of [
    [artifactManifest.receipts[0], artifactReceiptAPath],
    [artifactManifest.receipts[1], artifactReceiptBPath],
  ] as const) {
    const stat = lstatSync(path, {bigint: true});
    row.path = path;
    row.sourcePath = artifactSourcePath;
    row.sha256 = sha256(receiptBytes);
    row.inode = stat.ino.toString();
    row.byteLength = receiptBytes.length;
  }
  writeFileSync(
    artifactManifestPath,
    JSON.stringify(artifactManifest) + "\n",
  );
  validateParserProductionReceiptHarnessArtifactFiles(
    artifactManifest,
    artifactManifestPath,
  );
  writeFileSync(artifactDriverBPath, "drifted-driver\n");
  assert.throws(
    () => validateParserProductionReceiptHarnessArtifactFiles(
      artifactManifest,
      artifactManifestPath,
    ),
    /harness_driver_file_identity_invalid/,
  );
} finally {
  rmSync(artifactRoot, {recursive: true});
}

console.log(
  "item25 parser harness identity: PASS " +
  `tool_files=${toolClosure.fileCount} ` +
  `tool_sha256=${toolClosure.sha256} ` +
  `runtime_sha256=${runtimeExecutableSha256}`,
);
