#!/usr/bin/env bun
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  CHENG_PARSER_RECEIPT_BUILD_COMPILER,
  buildParserReceiptHarnessChengClosure,
  buildParserReceiptHarnessExecutableIdentity,
  buildParserReceiptHarnessToolClosure,
  buildEbnfParserNodeMap,
  serializeCurrentUnwitnessedEbnfParserNodeMap,
  serializeEbnfParserNodeMap,
  validateParserProductionReceiptHarnessArtifactFiles,
  validateParserProductionReceiptHarnessSourcePlan,
} from "../src/cheng_ebnf_parser_node_map.ts";
import {
  readCurrentChengGrammarCorpus,
  type ChengGrammarCorpusSnapshot,
} from "../src/cheng_grammar_corpus_store.ts";
import {canonicalJson} from "../src/cheng_semantic_matrix_m9023.ts";
import {parseUniqueCurrentJson} from "../src/current_schema_json.ts";
import {
  buildCurrentSourcePlan,
  currentSourcePlanMismatches,
} from "./grammar_corpus_gen.ts";
import {
  resolveCurrentParserHarnessAuthority,
  type CurrentParserHarnessAuthority,
} from "./current_parser_production_receipt_harness.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fusionRoot = resolve(here, "..");
const currentHarnessPath = resolve(
  here,
  "current_parser_production_receipt_harness.ts",
);
const claimsPath = resolve(
  here,
  "../fixtures/semantic/ebnf_parser_producer_claims.json",
);
const outputPath = resolve(
  here,
  "../fixtures/semantic/ebnf_parser_node_map.json",
);
const corpusSourceDirectory = resolve(
  here,
  "../fixtures/semantic/grammar_corpus",
);

type GeneratorMode =
  | {readonly kind: "current-unwitnessed"}
  | {
      readonly kind: "witnessed";
      readonly officialCurrentBuildBindingPath: string;
    };

function fail(message: string): never {
  throw new Error(`EBNF map generator: ${message}`);
}

function readIdentityFile(path: string, label: string): Buffer {
  if (path !== resolve(path) || realpathSync(path) !== path) {
    fail(`${label} path must be canonical: ${path}`);
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail(`${label} must be a regular non-symlink file`);
  }
  return readFileSync(path);
}

function parseGeneratorMode(args: readonly string[]): GeneratorMode {
  if (args.includes("--prepare-current-unwitnessed")) {
    if (args.length !== 1 || args[0] !== "--prepare-current-unwitnessed") {
      fail(
        "--prepare-current-unwitnessed is an isolated diagnostic mode " +
        "and cannot be mixed with witnessed inputs",
      );
    }
    return {kind: "current-unwitnessed"};
  }
  if (args.length !== 2) {
    fail(
      "usage: --official-current-build-binding " +
      "<canonical-absolute-current-official-binding.kv>",
    );
  }
  if (args[0] !== "--official-current-build-binding") {
    fail(`unknown argument ${args[0]}`);
  }
  const bindingPath = args[1]!;
  if (bindingPath !== resolve(bindingPath) ||
      realpathSync(bindingPath) !== bindingPath) {
    fail("official current build binding path must be canonical");
  }
  const bindingStat = lstatSync(bindingPath);
  if (bindingStat.isSymbolicLink() || !bindingStat.isFile()) {
    fail("official current build binding must be a regular non-symlink file");
  }
  return {
    kind: "witnessed",
    officialCurrentBuildBindingPath: bindingPath,
  };
}

function currentCorpusSourceRows(
  snapshot: ChengGrammarCorpusSnapshot,
): readonly {
  path: string;
  sha256: string;
  byteLength: number;
}[] {
  return snapshot.sourcePaths.map((path) => {
    const bytes = readIdentityFile(path, "grammar corpus source");
    return {
      path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.length,
    };
  });
}

function buildCurrentReceiptHarness(
  officialCurrentBuildBindingPath: string,
  sourceRows: readonly {path: string}[],
): string {
  const artifactParent = dirname(officialCurrentBuildBindingPath);
  const volatileRoot = realpathSync(tmpdir());
  const protectedRoots = [
    volatileRoot,
    fusionRoot,
    resolve(fusionRoot, "../cheng-lang"),
  ];
  if (realpathSync(artifactParent) !== artifactParent ||
      protectedRoots.some((root) => {
        const suffix = relative(root, artifactParent);
        return suffix === "" ||
          (!suffix.startsWith("..") && resolve(root, suffix) ===
            artifactParent);
      })) {
    fail(
      "official binding parent must be a canonical persistent " +
      "transaction directory outside source trees",
    );
  }
  const runDirectory = mkdtempSync(
    join(artifactParent, "cheng-ebnf-parser-receipts-"),
  );
  const outDirectory = join(runDirectory, "harness");
  const sourceArgs = sourceRows.flatMap(
    (row) => ["--source", row.path],
  );
  const result = spawnSync(
    process.execPath,
    [
      "run",
      currentHarnessPath,
      "--official-current-build-binding",
      officialCurrentBuildBindingPath,
      "--out-dir",
      outDirectory,
      ...sourceArgs,
    ],
    {
      cwd: fusionRoot,
      encoding: "utf8",
      env: {PATH: "/usr/bin:/bin:/usr/sbin:/sbin"},
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error !== undefined || result.status !== 0) {
    fail(
      "current parser receipt harness failed " +
      `rc=${result.status ?? "spawn"} ` +
      `stdout=${String(result.stdout).slice(-2000)} ` +
      `stderr=${String(result.stderr).slice(-4000)}`,
    );
  }
  const match =
    /(?:^|\s)manifest=([^\s]+)(?:\s|$)/.exec(String(result.stdout));
  if (match?.[1] === undefined) {
    fail("receipt harness did not report a manifest");
  }
  const manifestPath = match[1];
  readIdentityFile(manifestPath, "receipt harness manifest");
  return manifestPath;
}

function runCurrentUnwitnessedDiagnostic(): never {
  const diagnosticChengRoot = resolve(fusionRoot, "../cheng-lang");
  if (realpathSync(diagnosticChengRoot) !== diagnosticChengRoot) {
    fail("diagnostic Cheng root must be canonical");
  }
  const specPath = join(
    diagnosticChengRoot,
    "docs/cheng-formal-spec.md",
  );
  const parserPath = join(
    diagnosticChengRoot,
    "src/core/lang/parser.cheng",
  );
  const specBytes = readIdentityFile(specPath, "diagnostic formal spec");
  const parserBytes = readIdentityFile(parserPath, "diagnostic parser");
  const claimsBytes = readIdentityFile(claimsPath, "producer claims");
  const stagedOutputPath = `${outputPath}.staged-${process.pid}`;
  writeFileSync(
    stagedOutputPath,
    serializeCurrentUnwitnessedEbnfParserNodeMap(
      specBytes,
      parserBytes,
      claimsBytes,
    ),
    {flag: "wx"},
  );
  if (!readIdentityFile(specPath, "diagnostic formal spec")
        .equals(specBytes) ||
      !readIdentityFile(parserPath, "diagnostic parser")
        .equals(parserBytes) ||
      !readIdentityFile(claimsPath, "producer claims")
        .equals(claimsBytes)) {
    fail("diagnostic source closure drifted during unwitnessed generation");
  }
  renameSync(stagedOutputPath, outputPath);
  console.log(
    "[ebnf-map] prepared exact current unwitnessed diagnostic " +
    "witnessed=0",
  );
  process.exit(0);
}

const mode = parseGeneratorMode(process.argv.slice(2));
if (mode.kind === "current-unwitnessed") {
  runCurrentUnwitnessedDiagnostic();
}

const bindingPath = mode.officialCurrentBuildBindingPath;
const authority = resolveCurrentParserHarnessAuthority(bindingPath);
const specPath = authority.formalSpecPath;
const parserPath = authority.parserPath;
const receiptProducerPath = authority.receiptProducerPath;
const driverEntryPath = authority.driverEntryPath;
const bootstrapPath = authority.bootstrapPath;
const specBytes = readIdentityFile(specPath, "formal spec");
const parserBytes = readIdentityFile(parserPath, "parser");
const receiptProducerBytes =
  readIdentityFile(receiptProducerPath, "receipt producer");
const driverEntryBytes =
  readIdentityFile(driverEntryPath, "driver entry");
const bootstrapBytes = readIdentityFile(bootstrapPath, "bootstrap");
const claimsBytes = readIdentityFile(claimsPath, "producer claims");
const harnessBytes = readIdentityFile(currentHarnessPath, "harness");
const harnessDependencyClosure =
  buildParserReceiptHarnessChengClosure(
    authority.chengRoot,
    authority.formalSpecPath,
  );
const harnessToolClosure =
  await buildParserReceiptHarnessToolClosure(
    currentHarnessPath,
    fusionRoot,
  );
const harnessBuildCompiler =
  buildParserReceiptHarnessExecutableIdentity(
    CHENG_PARSER_RECEIPT_BUILD_COMPILER,
  );
const harnessRuntimeExecutableSha256 =
  createHash("sha256")
    .update(readFileSync(process.execPath))
    .digest("hex");
const corpusSnapshot =
  readCurrentChengGrammarCorpus(corpusSourceDirectory);
const corpusSourceRows = currentCorpusSourceRows(corpusSnapshot);

function assertCurrentAuthorityAndSourceClosure(stage: string): void {
  const currentAuthority =
    resolveCurrentParserHarnessAuthority(bindingPath);
  const currentDependencyClosure =
    buildParserReceiptHarnessChengClosure(
      currentAuthority.chengRoot,
      currentAuthority.formalSpecPath,
    );
  const currentCorpus =
    readCurrentChengGrammarCorpus(corpusSourceDirectory);
  if (canonicalJson(currentAuthority) !== canonicalJson(authority) ||
      canonicalJson(currentDependencyClosure) !==
        canonicalJson(harnessDependencyClosure) ||
      currentCorpus.generationId !== corpusSnapshot.generationId ||
      canonicalJson(currentCorpusSourceRows(currentCorpus)) !==
        canonicalJson(corpusSourceRows) ||
      !readIdentityFile(specPath, "formal spec").equals(specBytes) ||
      !readIdentityFile(parserPath, "parser").equals(parserBytes) ||
      !readIdentityFile(
        receiptProducerPath,
        "receipt producer",
      ).equals(receiptProducerBytes) ||
      !readIdentityFile(driverEntryPath, "driver entry")
        .equals(driverEntryBytes) ||
      !readIdentityFile(bootstrapPath, "bootstrap")
        .equals(bootstrapBytes) ||
      !readIdentityFile(claimsPath, "producer claims")
        .equals(claimsBytes)) {
    fail(`official authority/source closure drifted during ${stage}`);
  }
}

assertCurrentAuthorityAndSourceClosure("source-plan admission");
const sourcePlanMismatches = currentSourcePlanMismatches(
  buildCurrentSourcePlan({
    specBytes,
    parserBytes,
    producerClaimsBytes: claimsBytes,
  }).files,
  corpusSourceDirectory,
);
if (sourcePlanMismatches.length > 0) {
  fail(
    "current grammar source-plan drifted before parser receipts:\n  " +
    sourcePlanMismatches.join("\n  "),
  );
}
assertCurrentAuthorityAndSourceClosure("parser receipt launch");
const harnessPath = buildCurrentReceiptHarness(
  bindingPath,
  corpusSourceRows,
);
assertCurrentAuthorityAndSourceClosure("parser receipt execution");

const receiptEvidence = (() => {
  const manifestBytes =
    readIdentityFile(harnessPath, "receipt harness manifest");
  const manifest = parseUniqueCurrentJson(
    manifestBytes.toString("utf8"),
    "parser_receipt_harness_manifest",
  ) as {
    officialCurrentBuild: unknown;
    receipts: {path: string; sourcePath: string}[];
  };
  if (canonicalJson(manifest.officialCurrentBuild) !==
      canonicalJson(authority.officialCurrentBuild)) {
    fail("receipt harness official current build identity drifted");
  }
  validateParserProductionReceiptHarnessArtifactFiles(
    manifest,
    harnessPath,
  );
  validateParserProductionReceiptHarnessSourcePlan(
    manifest,
    corpusSourceRows,
  );
  return manifest.receipts.map((receipt) => ({
    sourcePath: receipt.sourcePath,
    sourceBytes: readIdentityFile(receipt.sourcePath, "receipt source"),
    receiptPath: receipt.path,
    receiptBytes: readIdentityFile(receipt.path, "parser receipt"),
    manifestPath: harnessPath,
    manifestBytes,
  }));
})();
assertCurrentAuthorityAndSourceClosure("receipt evidence admission");

const doc = buildEbnfParserNodeMap(
  specBytes,
  parserBytes,
  claimsBytes,
  {
    receiptProducerBytes,
    receiptEvidence,
    harnessFormalSpecPath: specPath,
    harnessParserPath: parserPath,
    harnessReceiptProducerPath: receiptProducerPath,
    harnessDriverEntryPath: driverEntryPath,
    harnessDriverEntrySha256:
      createHash("sha256").update(driverEntryBytes).digest("hex"),
    harnessBootstrapPath: bootstrapPath,
    harnessBootstrapSha256:
      createHash("sha256").update(bootstrapBytes).digest("hex"),
    harnessPath: currentHarnessPath,
    harnessSha256:
      createHash("sha256").update(harnessBytes).digest("hex"),
    harnessDependencyClosureSha256: harnessDependencyClosure.sha256,
    harnessToolClosureSha256: harnessToolClosure.sha256,
    harnessBuildCompilerExecutablePath:
      harnessBuildCompiler.executablePath,
    harnessBuildCompilerExecutableSha256:
      harnessBuildCompiler.executableSha256,
    harnessBuildCompilerVersionSha256:
      harnessBuildCompiler.versionSha256,
    harnessRuntimeExecutablePath: process.execPath,
    harnessRuntimeExecutableSha256,
    harnessRuntimeVersion: Bun.version,
    harnessOfficialCurrentBuild: authority.officialCurrentBuild,
  },
);
assertCurrentAuthorityAndSourceClosure("parser map build");
if (doc.receiptEvidence.inputCount === 0 ||
    doc.receiptEvidence.acceptedCount !== doc.receiptEvidence.inputCount ||
    doc.receiptEvidence.rejectedCount !== 0) {
  const rejected = doc.receiptEvidence.rows
    .filter((row) => !row.accepted)
    .slice(0, 8)
    .map((row) => `${row.sourcePath}: ${row.reason}`)
    .join("; ");
  fail(
    "parser receipt evidence was not fully admitted " +
    `input=${doc.receiptEvidence.inputCount} ` +
    `accepted=${doc.receiptEvidence.acceptedCount} ` +
    `rejected=${doc.receiptEvidence.rejectedCount}` +
    `${rejected === "" ? "" : ` ${rejected}`}`,
  );
}

async function assertGenerationInputsUnchanged(stage: string): Promise<void> {
  assertCurrentAuthorityAndSourceClosure(stage);
  const currentManifestBytes =
    readIdentityFile(harnessPath, "receipt harness manifest");
  validateParserProductionReceiptHarnessArtifactFiles(
    parseUniqueCurrentJson(
      currentManifestBytes.toString("utf8"),
      "parser_receipt_harness_manifest",
    ),
    harnessPath,
  );
  const currentToolClosure =
    await buildParserReceiptHarnessToolClosure(
      currentHarnessPath,
      fusionRoot,
    );
  const currentBuildCompiler =
    buildParserReceiptHarnessExecutableIdentity(
      CHENG_PARSER_RECEIPT_BUILD_COMPILER,
    );
  if (canonicalJson(currentToolClosure) !==
        canonicalJson(harnessToolClosure) ||
      canonicalJson(currentBuildCompiler) !==
        canonicalJson(harnessBuildCompiler) ||
      !readIdentityFile(currentHarnessPath, "harness")
        .equals(harnessBytes) ||
      createHash("sha256")
        .update(readFileSync(process.execPath))
        .digest("hex") !== harnessRuntimeExecutableSha256) {
    fail(`tool/runtime closure drifted during ${stage}`);
  }
  for (const evidence of receiptEvidence) {
    if (!readIdentityFile(evidence.sourcePath, "receipt source")
          .equals(evidence.sourceBytes) ||
        !readIdentityFile(evidence.receiptPath, "parser receipt")
          .equals(evidence.receiptBytes) ||
        !readIdentityFile(evidence.manifestPath, "receipt harness manifest")
          .equals(evidence.manifestBytes)) {
      fail(`receipt evidence drifted during ${stage}`);
    }
  }
}

await assertGenerationInputsUnchanged("output staging");
const stagedOutputPath = `${outputPath}.staged-${process.pid}`;
writeFileSync(
  stagedOutputPath,
  serializeEbnfParserNodeMap(doc),
  {flag: "wx"},
);
await assertGenerationInputsUnchanged("output commit");
renameSync(stagedOutputPath, outputPath);
console.log(
  `[ebnf-map] rows=${doc.counts.total} MAPPED=${doc.counts.MAPPED} ` +
  `PARTIAL=${doc.counts.PARTIAL} UNMAPPED=${doc.counts.UNMAPPED}`,
  `required=${doc.counts.requiredObligationCount} ` +
  `witnessed=${doc.counts.witnessedRequiredCount} ` +
  `missingRequiredCount=${doc.counts.missingRequiredCount}`,
);
