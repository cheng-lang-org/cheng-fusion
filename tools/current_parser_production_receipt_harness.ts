#!/usr/bin/env bun
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {basename, dirname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  CHENG_PARSER_RECEIPT_BUILD_COMPILER,
  CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE,
  CHENG_PARSER_PRODUCTION_RECEIPT_HARNESS_SCHEMA,
  buildParserReceiptHarnessChengClosure,
  buildParserReceiptHarnessExecutableIdentity,
  buildParserReceiptHarnessToolClosure,
  parserReceiptHarnessCompilerEnvironment,
  parserReceiptHarnessCompilerProfile,
  type ParserReceiptHarnessOfficialCurrentBuildIdentity,
} from "../src/cheng_ebnf_parser_node_map.ts";
import {
  CHENG_CURRENT_PARSER_RECEIPT_PRODUCTION_COUNT,
  CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT,
  CHENG_CURRENT_PARSER_RECEIPT_SOURCE_COUNT,
  validateCurrentSourceSnapshot,
  validateOfficialCurrentBuildBinding,
  type CurrentSourceSnapshotIdentity,
  type OfficialCurrentBuildBindingIdentity,
} from "../src/cheng_current_parser_receipt_ingress.ts";
import {
  buildChengGrammarObligationContract,
} from "../src/cheng_semantic_pipeline_matrix_m9024.ts";
import {canonicalJson} from "../src/cheng_semantic_matrix_m9023.ts";
import {
  validateDriverReceiptToolchainIdentityValue,
} from "./grammar_receipt_bind.ts";
import {parseUniqueCurrentJson} from "../src/current_schema_json.ts";

const FORMAL_SPEC_RELATIVE = "docs/cheng-formal-spec.md";
const PARSER_RELATIVE = "src/core/lang/parser.cheng";
const RECEIPT_PRODUCER_RELATIVE =
  "src/core/tooling/compiler_parser_receipt.cheng";
const BOOTSTRAP_RELATIVE = "bootstrap/cheng_cold.c";
const UNREGISTERED_ANNOTATION_MUTATION_RELATIVE =
  "src/tests/parser_unregistered_annotation_inline_negative.cheng";
const UNREGISTERED_ANNOTATION_MUTATION_BYTES =
  "@inline\nfn main(): int32 =\n    return 0\n";
const HARNESS = fileURLToPath(import.meta.url);
const FUSION_ROOT = resolve(dirname(HARNESS), "..");

export interface CurrentParserHarnessAuthority {
  readonly officialCurrentBuild:
    ParserReceiptHarnessOfficialCurrentBuildIdentity;
  readonly chengRoot: string;
  readonly formalSpecPath: string;
  readonly parserPath: string;
  readonly receiptProducerPath: string;
  readonly driverEntryPath: string;
  readonly bootstrapPath: string;
  readonly unregisteredAnnotationMutationPath: string;
}

export function currentParserHarnessAuthorityFromIdentities(
  binding: OfficialCurrentBuildBindingIdentity,
  snapshot: CurrentSourceSnapshotIdentity,
): CurrentParserHarnessAuthority {
  if (binding.sourceSnapshotManifestPath !== snapshot.manifestPath ||
      binding.sourceSnapshotManifestSha256 !== snapshot.manifestSha256) {
    throw new Error(
      "current parser receipt harness: official binding snapshot drift",
    );
  }
  const chengRoot = binding.sourceSnapshotRoot;
  const formalSpecPath = join(chengRoot, FORMAL_SPEC_RELATIVE);
  const parserPath = join(chengRoot, PARSER_RELATIVE);
  const receiptProducerPath = join(
    chengRoot,
    RECEIPT_PRODUCER_RELATIVE,
  );
  const driverEntryPath = join(
    chengRoot,
    CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE,
  );
  const bootstrapPath = join(chengRoot, BOOTSTRAP_RELATIVE);
  const unregisteredAnnotationMutationPath = join(
    chengRoot,
    UNREGISTERED_ANNOTATION_MUTATION_RELATIVE,
  );
  return {
    officialCurrentBuild: {
      bindingPath: binding.bindingPath,
      bindingSha256: binding.bindingSha256,
      officialBuildReceiptPath: binding.officialBuildReceiptPath,
      officialBuildReceiptSha256: binding.officialBuildReceiptSha256,
      sourceSnapshotManifestPath: binding.sourceSnapshotManifestPath,
      sourceSnapshotManifestSha256:
        binding.sourceSnapshotManifestSha256,
      sourceSnapshotRoot: binding.sourceSnapshotRoot,
      sourceSnapshotClosureSha256: snapshot.closureSha256,
      officialDriverPath: binding.officialDriverPath,
      officialDriverSha256: binding.officialDriverSha256,
    },
    chengRoot,
    formalSpecPath,
    parserPath,
    receiptProducerPath,
    driverEntryPath,
    bootstrapPath,
    unregisteredAnnotationMutationPath,
  };
}

export function resolveCurrentParserHarnessAuthority(
  officialCurrentBuildBindingPath: string,
): CurrentParserHarnessAuthority {
  const binding = validateOfficialCurrentBuildBinding(
    officialCurrentBuildBindingPath,
  );
  const snapshot = validateCurrentSourceSnapshot(
    binding.sourceSnapshotManifestPath,
    binding.sourceSnapshotRoot,
  );
  return currentParserHarnessAuthorityFromIdentities(binding, snapshot);
}

let rejectionContext: {
  outDir: string;
  stage: string;
  officialCurrentBuild:
    ParserReceiptHarnessOfficialCurrentBuildIdentity;
  formalEbnfSha256: string;
  productionCount: number;
  requiredObligationCount: number;
  dependencyClosure: ReturnType<typeof sourceClosure>;
  toolClosure: Awaited<
    ReturnType<typeof buildParserReceiptHarnessToolClosure>
  >;
  buildCompiler: ReturnType<
    typeof buildParserReceiptHarnessExecutableIdentity
  >;
  compilerProfile: ReturnType<
    typeof parserReceiptHarnessCompilerProfile
  >;
  runtime: {
    executablePath: string;
    executableSha256: string;
    version: string;
  };
  sources: ReturnType<typeof sourceInputs>["rows"];
  completedDriverCount: number;
  completedReceiptCount: number;
} | undefined;

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(message: string): never {
  throw new Error(`current parser receipt harness: ${message}`);
}

export function parseCurrentParserHarnessArgs(
  args: readonly string[],
): {
  officialCurrentBuildBindingPath: string;
  outDir: string;
  sources: string[];
} {
  let officialCurrentBuildBindingPath = "";
  let outDir = "";
  const sources: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    const value = args[++index] ??
      fail(`missing ${arg} value`);
    if (value.startsWith("--") || value !== resolve(value)) {
      fail(`non-absolute ${arg} value`);
    }
    if (arg === "--official-current-build-binding") {
      if (officialCurrentBuildBindingPath !== "") {
        fail("duplicate official current build binding");
      }
      officialCurrentBuildBindingPath = value;
    } else if (arg === "--out-dir") {
      if (outDir !== "") fail("duplicate out-dir");
      outDir = value;
    } else if (arg === "--source") {
      sources.push(value);
    } else {
      fail(`unknown argument ${arg}`);
    }
  }
  if (officialCurrentBuildBindingPath === "" ||
      outDir === "" || sources.length === 0) {
    fail(
      "usage: --official-current-build-binding <absolute-file> " +
      "--out-dir <absolute-new-dir> --source <absolute-file> " +
      "[--source <absolute-file>...]",
    );
  }
  if (new Set(sources).size !== sources.length) {
    fail("duplicate source");
  }
  return {officialCurrentBuildBindingPath, outDir, sources};
}

export function assertCurrentParserProductionProfile(
  productionCount: number,
  requiredObligationCount: number,
  sourceCount: number,
): void {
  if (productionCount !== CHENG_CURRENT_PARSER_RECEIPT_PRODUCTION_COUNT ||
      requiredObligationCount !==
        CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT ||
      sourceCount !== CHENG_CURRENT_PARSER_RECEIPT_SOURCE_COUNT) {
    fail(
      "current production profile invalid: " +
      `productions=${productionCount} ` +
      `required=${requiredObligationCount} sources=${sourceCount}`,
    );
  }
}

function sourceClosure(authority: CurrentParserHarnessAuthority) {
  return buildParserReceiptHarnessChengClosure(
    authority.chengRoot,
    authority.formalSpecPath,
  );
}

function assertClosureUnchanged(
  before: ReturnType<typeof sourceClosure>,
  authority: CurrentParserHarnessAuthority,
  stage: string,
): void {
  const after = sourceClosure(authority);
  if (canonicalJson(after) !== canonicalJson(before)) {
    const beforeByPath = new Map(before.rows.map((row) => [row.path, row]));
    const afterByPath = new Map(after.rows.map((row) => [row.path, row]));
    const changed = [...new Set([
      ...beforeByPath.keys(),
      ...afterByPath.keys(),
    ])].filter((path) =>
      canonicalJson(beforeByPath.get(path)) !==
        canonicalJson(afterByPath.get(path)),
    ).sort();
    fail(
      `source closure drifted during ${stage}: ` +
      `${changed.slice(0, 16).join(",")}` +
      `${changed.length > 16 ? `,+${changed.length - 16}` : ""}`,
    );
  }
}

function sourceInputs(sources: readonly string[]) {
  const rows = sources.map((path) => {
    const stat = lstatSync(path);
    if (realpathSync(path) !== path ||
        stat.isSymbolicLink() || !stat.isFile()) {
      fail(`source must be a regular non-symlink file: ${path}`);
    }
    const bytes = readFileSync(path);
    return {path, sha256: sha256(bytes), byteLength: bytes.length};
  });
  return {
    fileCount: rows.length,
    sha256: sha256(canonicalJson(rows)),
    rows,
  };
}

function assertUnregisteredAnnotationMutation(
  path: string,
): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile() ||
      readFileSync(path, "utf8") !==
        UNREGISTERED_ANNOTATION_MUTATION_BYTES) {
    fail("unregistered annotation mutation source invalid");
  }
}

function assertSourceInputsUnchanged(
  before: ReturnType<typeof sourceInputs>,
  stage: string,
): void {
  const after = sourceInputs(before.rows.map((row) => row.path));
  if (canonicalJson(after) !== canonicalJson(before)) {
    fail(`source inputs drifted during ${stage}`);
  }
}

async function assertToolClosureUnchanged(
  before: Awaited<ReturnType<typeof buildParserReceiptHarnessToolClosure>>,
  stage: string,
): Promise<void> {
  const after = await buildParserReceiptHarnessToolClosure(
    HARNESS,
    FUSION_ROOT,
  );
  if (canonicalJson(after) !== canonicalJson(before)) {
    fail(`tool closure drifted during ${stage}`);
  }
}

async function assertInputsUnchanged(
  authorityBefore: CurrentParserHarnessAuthority,
  officialCurrentBuildBindingPath: string,
  closureBefore: ReturnType<typeof sourceClosure>,
  toolBefore: Awaited<
    ReturnType<typeof buildParserReceiptHarnessToolClosure>
  >,
  sourceBefore: ReturnType<typeof sourceInputs>,
  buildCompilerBefore: ReturnType<
    typeof buildParserReceiptHarnessExecutableIdentity
  >,
  runtimeBefore: {
    executablePath: string;
    executableSha256: string;
    version: string;
  },
  stage: string,
): Promise<void> {
  const authorityAfter = resolveCurrentParserHarnessAuthority(
    officialCurrentBuildBindingPath,
  );
  if (canonicalJson(authorityAfter) !== canonicalJson(authorityBefore)) {
    fail(`official current build drifted during ${stage}`);
  }
  assertClosureUnchanged(closureBefore, authorityBefore, stage);
  assertSourceInputsUnchanged(sourceBefore, stage);
  await assertToolClosureUnchanged(toolBefore, stage);
  const buildCompiler =
    buildParserReceiptHarnessExecutableIdentity(
      CHENG_PARSER_RECEIPT_BUILD_COMPILER,
    );
  if (canonicalJson(buildCompiler) !==
      canonicalJson(buildCompilerBefore)) {
    fail(`build compiler drifted during ${stage}`);
  }
  const runtime = {
    executablePath: process.execPath,
    executableSha256: sha256(readFileSync(process.execPath)),
    version: Bun.version,
  };
  if (canonicalJson(runtime) !== canonicalJson(runtimeBefore)) {
    fail(`runtime drifted during ${stage}`);
  }
}

function run(
  command: string,
  args: string[],
  chengRoot: string,
  label: string,
  logPath: string,
): {stdout: string; stderr: string} {
  const result = spawnSync(command, args, {
    cwd: chengRoot,
    encoding: "utf8",
    env: parserReceiptHarnessCompilerEnvironment({}),
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(
    logPath,
    JSON.stringify({
      schema: "cheng_parser_production_receipt_command_log",
      label,
      command,
      args,
      cwd: chengRoot,
      exitCode: result.status,
      signal: result.signal,
      error: result.error?.message ?? "",
      stdout: String(result.stdout),
      stderr: String(result.stderr),
    }, null, 2) + "\n",
    {flag: "wx"},
  );
  if (result.error !== undefined || result.status !== 0) {
    fail(
      `${label} failed rc=${result.status ?? "spawn"} ` +
      `log=${logPath} ` +
      `stdout=${String(result.stdout).slice(-2000)} ` +
      `stderr=${String(result.stderr).slice(-4000)}`,
    );
  }
  return {
    stdout: String(result.stdout),
    stderr: String(result.stderr),
  };
}

function runRejected(
  command: string,
  args: string[],
  chengRoot: string,
  label: string,
  logPath: string,
  expectedStderr: string,
): void {
  const result = spawnSync(command, args, {
    cwd: chengRoot,
    encoding: "utf8",
    env: parserReceiptHarnessCompilerEnvironment({}),
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(
    logPath,
    JSON.stringify({
      schema: "cheng_parser_production_receipt_command_log",
      label,
      command,
      args,
      cwd: chengRoot,
      exitCode: result.status,
      signal: result.signal,
      error: result.error?.message ?? "",
      stdout: String(result.stdout),
      stderr: String(result.stderr),
    }, null, 2) + "\n",
    {flag: "wx"},
  );
  if (result.error !== undefined || result.status !== 2 ||
      String(result.stdout) !== "" ||
      !String(result.stderr).includes(expectedStderr)) {
    fail(
      `${label} rejection invalid rc=${result.status ?? "spawn"} ` +
      `log=${logPath} stdout=${String(result.stdout).slice(-1000)} ` +
      `stderr=${String(result.stderr).slice(-2000)}`,
    );
  }
}

function fileIdentity(path: string) {
  const stat = statSync(path, {bigint: true});
  if (!stat.isFile() || stat.size <= 0n) fail(`artifact missing: ${path}`);
  return {
    path,
    sha256: sha256(readFileSync(path)),
    inode: stat.ino.toString(),
    byteLength: Number(stat.size),
  };
}

function writeRejectionManifest(error: unknown): string | undefined {
  const context = rejectionContext;
  if (context === undefined) return undefined;
  const commandLogs = readdirSync(context.outDir)
    .filter((name) => name.endsWith(".command-log.json"))
    .sort()
    .map((name) => fileIdentity(join(context.outDir, name)));
  const manifestPath = join(
    context.outDir,
    "parser-production-receipt-harness.rejected.json",
  );
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schema: "cheng_parser_production_receipt_harness_rejection",
      status: "rejected",
      stage: context.stage,
      error: error instanceof Error ? error.message : String(error),
      officialCurrentBuild: context.officialCurrentBuild,
      formalEbnfSha256: context.formalEbnfSha256,
      productionCount: context.productionCount,
      requiredObligationCount: context.requiredObligationCount,
      expectedSourceCount: context.sources.length,
      expectedReceiptCount: context.sources.length * 2,
      completedDriverCount: context.completedDriverCount,
      completedReceiptCount: context.completedReceiptCount,
      dependencyClosure: context.dependencyClosure,
      toolClosure: context.toolClosure,
      buildCompiler: context.buildCompiler,
      compilerProfile: context.compilerProfile,
      runtime: context.runtime,
      sources: context.sources,
      commandLogs,
    }, null, 2) + "\n",
    {flag: "wx"},
  );
  return manifestPath;
}

export async function runCurrentParserProductionReceiptHarness(): Promise<void> {
  const {
    officialCurrentBuildBindingPath,
    outDir,
    sources,
  } = parseCurrentParserHarnessArgs(process.argv.slice(2));
  const authority = resolveCurrentParserHarnessAuthority(
    officialCurrentBuildBindingPath,
  );
  const chengRoot = authority.chengRoot;
  if (join(realpathSync(dirname(outDir)), basename(outDir)) !== outDir) {
    fail(`out-dir parent is not canonical: ${outDir}`);
  }
  if (existsSync(outDir)) fail(`out-dir already exists: ${outDir}`);
  assertUnregisteredAnnotationMutation(
    authority.unregisteredAnnotationMutationPath,
  );
  const frozenSources = sourceInputs(sources);
  mkdirSync(outDir, {recursive: false});
  const before = sourceClosure(authority);
  const toolClosure = await buildParserReceiptHarnessToolClosure(
    HARNESS,
    FUSION_ROOT,
  );
  const buildCompiler =
    buildParserReceiptHarnessExecutableIdentity(
      CHENG_PARSER_RECEIPT_BUILD_COMPILER,
    );
  const compilerProfile = parserReceiptHarnessCompilerProfile();
  const runtime = {
    executablePath: process.execPath,
    executableSha256: sha256(readFileSync(process.execPath)),
    version: Bun.version,
  };
  const grammar = buildChengGrammarObligationContract(
    readFileSync(authority.formalSpecPath),
  );
  rejectionContext = {
    outDir,
    stage: "production profile admission",
    officialCurrentBuild: authority.officialCurrentBuild,
    formalEbnfSha256: grammar.ebnfSha256,
    productionCount: grammar.productionCount,
    requiredObligationCount: grammar.requiredCount,
    dependencyClosure: before,
    toolClosure,
    buildCompiler,
    compilerProfile,
    runtime,
    sources: frozenSources.rows,
    completedDriverCount: 0,
    completedReceiptCount: 0,
  };
  assertCurrentParserProductionProfile(
    grammar.productionCount,
    grammar.requiredCount,
    frozenSources.fileCount,
  );
  rejectionContext.stage = "seed build";
  const seed = join(outDir, "cheng-cold-current");
  run(
    buildCompiler.executablePath,
    ["-std=c11", "-O2", "-o", seed, authority.bootstrapPath],
    chengRoot,
    "seed build",
    join(outDir, "seed-build.command-log.json"),
  );
  await assertInputsUnchanged(
    authority,
    officialCurrentBuildBindingPath,
    before,
    toolClosure,
    frozenSources,
    buildCompiler,
    runtime,
    "seed build",
  );

  const drivers: Array<
    ReturnType<typeof fileIdentity> & {role: string}
  > = [];
  for (const role of ["receipt_driver_a", "receipt_driver_b"]) {
    rejectionContext.stage = `driver ${role} build`;
    const driverDir = join(outDir, role);
    mkdirSync(driverDir, {recursive: false});
    const path = join(driverDir, "cheng");
    const report = join(outDir, `${role}.report.txt`);
    run(seed, [
      "system-link-exec",
      `--root:${chengRoot}`,
      `--in:${relative(chengRoot, authority.driverEntryPath)}`,
      "--emit:exe",
      "--target:arm64-apple-darwin",
      `--out:${path}`,
      `--report-out:${report}`,
    ], chengRoot, `driver ${role} build`,
    join(outDir, `${role}.build.command-log.json`));
    await assertInputsUnchanged(
      authority,
      officialCurrentBuildBindingPath,
      before,
      toolClosure,
      frozenSources,
      buildCompiler,
      runtime,
      `driver ${role} build`,
    );
    drivers.push({role, ...fileIdentity(path)});
    rejectionContext.completedDriverCount = drivers.length;
  }
  if (drivers[0]!.inode === drivers[1]!.inode ||
      drivers[0]!.sha256 !== drivers[1]!.sha256 ||
      drivers[0]!.byteLength !== drivers[1]!.byteLength) {
    fail("receipt driver inode or byte fixed point invalid");
  }
  if (drivers[0]!.sha256 !==
      authority.officialCurrentBuild.officialDriverSha256) {
    fail("receipt driver differs from official current driver");
  }
  if (basename(drivers[0]!.path) !== "cheng" ||
      basename(drivers[1]!.path) !== "cheng" ||
      dirname(drivers[0]!.path) === dirname(drivers[1]!.path)) {
    fail("receipt driver directory or basename fixed point invalid");
  }
  const driverUuids: string[] = [];
  for (const driver of drivers) {
    rejectionContext.stage = `driver ${driver.role} Mach-O identity`;
    const macho = run(
      "/usr/bin/otool",
      ["-l", driver.path],
      chengRoot,
      `driver ${driver.role} Mach-O identity`,
      join(outDir, `${driver.role}.otool.command-log.json`),
    );
    const uuidMatches = [...macho.stdout.matchAll(
      /\buuid ([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})\b/g,
    )];
    if (uuidMatches.length !== 1 || uuidMatches[0]?.[1] === undefined) {
      fail(`receipt driver canonical LC_UUID missing: ${driver.path}`);
    }
    driverUuids.push(uuidMatches[0][1].toUpperCase());
    run(
      "/usr/bin/codesign",
      ["--verify", "--strict", driver.path],
      chengRoot,
      `driver ${driver.role} code signature`,
      join(outDir, `${driver.role}.codesign.command-log.json`),
    );
  }
  if (driverUuids.length !== 2 || driverUuids[0] !== driverUuids[1]) {
    fail("receipt driver LC_UUID fixed point invalid");
  }
  for (const driver of drivers) {
    rejectionContext.stage =
      `unregistered annotation mutation ${driver.role}`;
    const mutationOut = join(
      outDir,
      `${driver.role}.unregistered-annotation-mutation.json`,
    );
    runRejected(driver.path, [
      "parse-receipt",
      `--root:${chengRoot}`,
      `--in:${authority.unregisteredAnnotationMutationPath}`,
      `--out:${mutationOut}`,
    ], chengRoot, `unregistered annotation mutation ${driver.role}`,
    join(
      outDir,
      `${driver.role}.unregistered-annotation-mutation.command-log.json`,
    ), "parser annotation: unregistered @inline");
    if (existsSync(mutationOut)) {
      fail(`unregistered annotation mutation wrote output: ${mutationOut}`);
    }
    await assertInputsUnchanged(
      authority,
      officialCurrentBuildBindingPath,
      before,
      toolClosure,
      frozenSources,
      buildCompiler,
      runtime,
      `unregistered annotation mutation ${driver.role}`,
    );
  }

  const sourceRows = frozenSources.rows;
  const receipts: Array<ReturnType<typeof fileIdentity> & {
    sourcePath: string;
    driverRole: string;
    driverSha256: string;
    parserTraceRootSha256: string;
  }> = [];
  for (const source of sourceRows) {
    for (const driver of drivers) {
      const safe = basename(source.path).replace(/[^A-Za-z0-9_.-]/g, "_");
      rejectionContext.stage = `receipt ${safe}/${driver.role}`;
      const path = join(
        outDir,
        `${safe}.${driver.role.toLowerCase()}.parse-receipt.json`,
      );
      run(driver.path, [
        "parse-receipt",
        `--root:${chengRoot}`,
        `--in:${source.path}`,
        `--out:${path}`,
      ], chengRoot, `receipt ${safe}/${driver.role}`,
      join(
        outDir,
        `${safe}.${driver.role.toLowerCase()}.command-log.json`,
      ));
      await assertInputsUnchanged(
        authority,
        officialCurrentBuildBindingPath,
        before,
        toolClosure,
        frozenSources,
        buildCompiler,
        runtime,
        `receipt ${safe}/${driver.role}`,
      );
      const receiptBytes = readFileSync(path);
      const receipt = parseUniqueCurrentJson(
        receiptBytes.toString("utf8"),
        "driver_receipt",
      ) as any;
      validateDriverReceiptToolchainIdentityValue(receipt);
      if (receipt.schema !== "cheng_driver_parse_receipt" ||
          receipt.stage !== "parser" ||
          receipt.sourcePath !== source.path ||
          receipt.sourceSha256 !== source.sha256 ||
          receipt.driverBytesSha256 !== driver.sha256 ||
          receipt.toolchainManifest.driverPath !== driver.path ||
          resolve(receipt.toolchainManifest.packageRoot) !==
            chengRoot ||
          resolve(receipt.toolchainManifest.rootDir) !==
            chengRoot ||
          !/^[0-9a-f]{64}$/.test(receipt.parserTraceRootSha256)) {
        fail(`receipt identity invalid: ${path}`);
      }
      receipts.push({
        ...fileIdentity(path),
        sourcePath: source.path,
        driverRole: driver.role,
        driverSha256: driver.sha256,
        parserTraceRootSha256: receipt.parserTraceRootSha256,
      });
      rejectionContext.completedReceiptCount = receipts.length;
    }
  }
  for (const source of sourceRows) {
    const pair = receipts.filter((row) => row.sourcePath === source.path);
    if (pair.length !== 2 || pair[0]!.inode === pair[1]!.inode ||
        pair[0]!.parserTraceRootSha256 !== pair[1]!.parserTraceRootSha256) {
      fail(`receipt fixed point invalid: ${source.path}`);
    }
  }
  await assertInputsUnchanged(
    authority,
    officialCurrentBuildBindingPath,
    before,
    toolClosure,
    frozenSources,
    buildCompiler,
    runtime,
    "finalization",
  );
  rejectionContext.stage = "manifest staging";
  const manifest = {
    schema: CHENG_PARSER_PRODUCTION_RECEIPT_HARNESS_SCHEMA,
    status: "accepted",
    officialCurrentBuild: authority.officialCurrentBuild,
    formalEbnfSha256: grammar.ebnfSha256,
    formalSpec: {
      path: authority.formalSpecPath,
      sha256: sha256(readFileSync(authority.formalSpecPath)),
    },
    parser: {
      path: authority.parserPath,
      sha256: sha256(readFileSync(authority.parserPath)),
    },
    receiptProducer: {
      path: authority.receiptProducerPath,
      sha256: sha256(readFileSync(authority.receiptProducerPath)),
    },
    driverEntry: {
      path: authority.driverEntryPath,
      sha256: sha256(readFileSync(authority.driverEntryPath)),
    },
    bootstrap: {
      path: authority.bootstrapPath,
      sha256: sha256(readFileSync(authority.bootstrapPath)),
    },
    harness: {path: HARNESS, sha256: sha256(readFileSync(HARNESS))},
    dependencyClosure: before,
    toolClosure,
    buildCompiler,
    compilerProfile,
    runtime,
    drivers,
    sources: sourceRows,
    receipts,
  };
  const manifestPath = join(outDir, "parser-production-receipt-harness.json");
  const stagedManifestPath = `${manifestPath}.staged`;
  writeFileSync(stagedManifestPath, JSON.stringify(manifest, null, 2) + "\n");
  await assertInputsUnchanged(
    authority,
    officialCurrentBuildBindingPath,
    before,
    toolClosure,
    frozenSources,
    buildCompiler,
    runtime,
    "manifest staging",
  );
  renameSync(stagedManifestPath, manifestPath);
  console.log(
    `current_parser_receipt_harness=PASS manifest=${manifestPath} ` +
    `sources=${sources.length} receipts=${receipts.length} ` +
      `closure=${before.sha256}`,
  );
  rejectionContext = undefined;
}

if (import.meta.main) {
  try {
    await runCurrentParserProductionReceiptHarness();
  } catch (error) {
    let rejectionManifest: string | undefined;
    try {
      rejectionManifest = writeRejectionManifest(error);
    } catch (manifestError) {
      console.error(
        "current_parser_receipt_harness=RED " +
        `rejection_manifest_error=${
          manifestError instanceof Error ?
            manifestError.message :
            String(manifestError)
        }`,
      );
    }
    if (rejectionManifest !== undefined) {
      console.error(
        `current_parser_receipt_harness=RED manifest=${rejectionManifest}`,
      );
    }
    throw error;
  }
}
