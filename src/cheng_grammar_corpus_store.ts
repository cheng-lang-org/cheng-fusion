import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import {basename, join, resolve} from "node:path";
import {
  canonicalJson,
  sha256,
} from "./cheng_semantic_matrix_m9023.ts";
import {
  assertExactCurrentObjectKeys,
  parseUniqueCurrentJson,
} from "./current_schema_json.ts";

export const CHENG_GRAMMAR_CORPUS_CURRENT = "current";
export const CHENG_GRAMMAR_CORPUS_GENERATIONS =
  ".cheng-grammar-corpus-generations";
export const CHENG_GRAMMAR_CORPUS_SCHEMA =
  "cheng_grammar_witness_corpus";

const GENERATION_ID = /^sha256-[0-9a-f]{64}$/;
const SOURCE_NAME = /^[a-z][a-z0-9_]*\.cheng$/;
const MAX_POINTER_BYTES = 80;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;

interface StableRegularFile {
  readonly bytes: Buffer;
  readonly device: number;
  readonly inode: number;
  readonly size: number;
  readonly modifiedMs: number;
  readonly changedMs: number;
}

export interface ChengGrammarCorpusFileIdentity {
  readonly device: number;
  readonly inode: number;
  readonly size: number;
  readonly modifiedMs: number;
  readonly changedMs: number;
}

export interface ChengGrammarCorpusManifestEntry {
  readonly relativePath: string;
  readonly shape: string;
  readonly note: string;
  readonly evidence: {
    readonly has: Readonly<Record<string, number>>;
    readonly lacks: readonly string[];
  };
  readonly sourceSha256: string;
  readonly lintTokenCount: number;
  readonly claims: readonly unknown[];
}

export interface ChengGrammarCorpusManifest {
  readonly schema: typeof CHENG_GRAMMAR_CORPUS_SCHEMA;
  readonly generated: string;
  readonly spec: {
    readonly formalSpecSha256: string;
    readonly ebnfSha256: string;
    readonly mapSha256: string;
    readonly productionCount: number;
  };
  readonly counts: {
    readonly coveredProductions: number;
    readonly sources: number;
    readonly claims: number;
    readonly coveredRequiredObligations: number;
    readonly requiredObligationCount: number;
    readonly witnessedRequiredCount: number;
    readonly missingRequiredCount: number;
  };
  readonly hitProductionsByKind: Readonly<Record<string, readonly string[]>>;
  readonly entries: readonly ChengGrammarCorpusManifestEntry[];
}

export interface ChengGrammarCorpusSnapshot {
  readonly root: string;
  readonly pointerPath: string;
  readonly generationId: string;
  readonly generationDirectory: string;
  readonly manifest: ChengGrammarCorpusManifest;
  readonly files: ReadonlyMap<string, Buffer>;
  readonly filePaths: ReadonlyMap<string, string>;
  readonly fileIdentities:
    ReadonlyMap<string, ChengGrammarCorpusFileIdentity>;
  readonly pointerIdentity: ChengGrammarCorpusFileIdentity;
  readonly sourcePaths: readonly string[];
}

function stableRegularFile(
  path: string,
  label: string,
  maxBytes: number,
): StableRegularFile {
  const before = lstatSync(path);
  if (before.isSymbolicLink() || !before.isFile() ||
      before.size < 0 || before.size > maxBytes) {
    throw new Error(`${label} must be a bounded regular non-symlink file`);
  }
  const bytes = readFileSync(path);
  const after = lstatSync(path);
  if (after.isSymbolicLink() || !after.isFile() ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      bytes.length !== after.size) {
    throw new Error(`${label} changed during stable read`);
  }
  return {
    bytes,
    device: after.dev,
    inode: after.ino,
    size: after.size,
    modifiedMs: after.mtimeMs,
    changedMs: after.ctimeMs,
  };
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} sha256 invalid`);
  }
}

function stableFileIdentity(
  value: StableRegularFile,
): ChengGrammarCorpusFileIdentity {
  return {
    device: value.device,
    inode: value.inode,
    size: value.size,
    modifiedMs: value.modifiedMs,
    changedMs: value.changedMs,
  };
}

export function chengGrammarCorpusFileIdentityEqual(
  left: ChengGrammarCorpusFileIdentity,
  right: ChengGrammarCorpusFileIdentity,
): boolean {
  return left.device === right.device &&
    left.inode === right.inode &&
    left.size === right.size &&
    left.modifiedMs === right.modifiedMs &&
    left.changedMs === right.changedMs;
}

function assertCanonicalManifest(
  value: unknown,
): asserts value is ChengGrammarCorpusManifest {
  assertExactCurrentObjectKeys(value, [
    "schema",
    "generated",
    "spec",
    "counts",
    "hitProductionsByKind",
    "entries",
  ], "grammar_corpus_manifest");
  if (value.schema !== CHENG_GRAMMAR_CORPUS_SCHEMA ||
      typeof value.generated !== "string" ||
      !Array.isArray(value.entries)) {
    throw new Error("grammar corpus manifest identity invalid");
  }
  assertExactCurrentObjectKeys(value.spec, [
    "formalSpecSha256",
    "ebnfSha256",
    "mapSha256",
    "productionCount",
  ], "grammar_corpus_manifest_spec");
  assertSha256(value.spec.formalSpecSha256, "formal spec");
  assertSha256(value.spec.ebnfSha256, "formal EBNF");
  assertSha256(value.spec.mapSha256, "EBNF map");
  if (!Number.isSafeInteger(value.spec.productionCount) ||
      value.spec.productionCount <= 0) {
    throw new Error("grammar corpus production count invalid");
  }
  assertExactCurrentObjectKeys(value.counts, [
    "coveredProductions",
    "sources",
    "claims",
    "coveredRequiredObligations",
    "requiredObligationCount",
    "witnessedRequiredCount",
    "missingRequiredCount",
  ], "grammar_corpus_manifest_counts");
  for (const [name, count] of Object.entries(value.counts)) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`grammar corpus count invalid: ${name}`);
    }
  }
  assertExactCurrentObjectKeys(value.hitProductionsByKind, [
    "production",
    "choice",
    "optional",
    "repetition",
    "recursion",
  ], "grammar_corpus_manifest_hit_kinds");
  for (const [kind, rows] of
    Object.entries(value.hitProductionsByKind)) {
    if (!Array.isArray(rows) ||
        rows.some((row) => typeof row !== "string")) {
      throw new Error(`grammar corpus hit production list invalid: ${kind}`);
    }
  }
  if (value.counts.sources !== value.entries.length) {
    throw new Error("grammar corpus source count invalid");
  }
  const shapes = new Set<string>();
  const logicalPaths = new Set<string>();
  const obligationIds = new Set<string>();
  const claimProductions = new Set<string>();
  const claimProductionsByKind = new Map<string, Set<string>>(
    ["production", "choice", "optional", "repetition", "recursion"]
      .map((kind) => [kind, new Set<string>()]),
  );
  const productionClaimIdentity = new Map<string, string>();
  let claimCount = 0;
  let receiptReadyCount = 0;
  for (const entry of value.entries) {
    assertExactCurrentObjectKeys(entry, [
      "relativePath",
      "shape",
      "note",
      "evidence",
      "sourceSha256",
      "lintTokenCount",
      "claims",
    ], "grammar_corpus_manifest_entry");
    if (typeof entry.shape !== "string" ||
        !/^[a-z][a-z0-9_]*$/.test(entry.shape) ||
        shapes.has(entry.shape) ||
        entry.relativePath !==
          `fixtures/semantic/grammar_corpus/${entry.shape}.cheng` ||
        logicalPaths.has(entry.relativePath) ||
        typeof entry.note !== "string" ||
        !Number.isSafeInteger(entry.lintTokenCount) ||
        entry.lintTokenCount < 0 ||
        !Array.isArray(entry.claims)) {
      throw new Error("grammar corpus manifest entry identity invalid");
    }
    assertSha256(entry.sourceSha256, "grammar corpus source");
    assertExactCurrentObjectKeys(entry.evidence, [
      "has",
      "lacks",
    ], "grammar_corpus_manifest_evidence");
    if (entry.evidence.has === null ||
        typeof entry.evidence.has !== "object" ||
        Array.isArray(entry.evidence.has) ||
        !Array.isArray(entry.evidence.lacks) ||
        entry.evidence.lacks.some((row) =>
          typeof row !== "string" || row === "") ||
        new Set(entry.evidence.lacks).size !==
          entry.evidence.lacks.length) {
      throw new Error("grammar corpus manifest evidence invalid");
    }
    for (const [token, count] of Object.entries(entry.evidence.has)) {
      if (token === "" || typeof count !== "number" ||
          !Number.isSafeInteger(count) || count < 0) {
        throw new Error("grammar corpus manifest evidence count invalid");
      }
      if (entry.evidence.lacks.includes(token)) {
        throw new Error("grammar corpus manifest evidence conflicts");
      }
    }
    for (const claim of entry.claims) {
      assertExactCurrentObjectKeys(claim, [
        "obligationId",
        "production",
        "kind",
        "structuralPath",
        "variant",
        "bound",
        "mapStatus",
        "receiptReady",
      ], "grammar_corpus_manifest_claim");
      if (typeof claim.obligationId !== "string" ||
          claim.obligationId === "" ||
          obligationIds.has(claim.obligationId) ||
          typeof claim.production !== "string" ||
          claim.production === "" ||
          !["production", "choice", "optional", "repetition", "recursion"]
            .includes(claim.kind) ||
          typeof claim.structuralPath !== "string" ||
          typeof claim.variant !== "string" ||
          !(claim.bound === null ||
            (Number.isSafeInteger(claim.bound) && claim.bound >= 0)) ||
          !["MAPPED", "PARTIAL"].includes(claim.mapStatus) ||
          typeof claim.receiptReady !== "boolean" ||
          claim.receiptReady !== (claim.mapStatus === "MAPPED")) {
        throw new Error("grammar corpus manifest claim invalid");
      }
      const claimIdentity =
        `${claim.mapStatus}:${claim.receiptReady ? "ready" : "missing"}`;
      const existingClaimIdentity =
        productionClaimIdentity.get(claim.production);
      if (existingClaimIdentity !== undefined &&
          existingClaimIdentity !== claimIdentity) {
        throw new Error(
          "grammar corpus production claim identity inconsistent",
        );
      }
      productionClaimIdentity.set(claim.production, claimIdentity);
      claimProductions.add(claim.production);
      claimProductionsByKind.get(claim.kind)!.add(claim.production);
      if (claim.receiptReady) receiptReadyCount += 1;
      obligationIds.add(claim.obligationId);
    }
    shapes.add(entry.shape);
    logicalPaths.add(entry.relativePath);
    claimCount += entry.claims.length;
  }
  if (claimCount !== value.counts.claims ||
      value.counts.claims !== value.counts.coveredRequiredObligations ||
      value.counts.coveredRequiredObligations !==
        value.counts.requiredObligationCount ||
      value.counts.coveredProductions !== claimProductions.size ||
      value.counts.coveredProductions !== value.spec.productionCount ||
      value.counts.witnessedRequiredCount !== receiptReadyCount ||
      value.counts.missingRequiredCount !==
        claimCount - receiptReadyCount ||
      value.counts.requiredObligationCount !==
        value.counts.witnessedRequiredCount +
          value.counts.missingRequiredCount) {
    throw new Error("grammar corpus manifest obligation counts invalid");
  }
  for (const [kind, productions] of claimProductionsByKind) {
    const actual = value.hitProductionsByKind[kind];
    const expected = [...productions].sort();
    if (canonicalJson(actual) !== canonicalJson(expected)) {
      throw new Error(
        `grammar corpus hit production projection invalid: ${kind}`,
      );
    }
  }
}

export function chengGrammarCorpusGenerationId(
  files: ReadonlyMap<string, string | Buffer>,
): string {
  const rows = [...files.entries()]
    .sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0)
    .map(([name, value]) => {
      const bytes =
        typeof value === "string" ? Buffer.from(value, "utf8") : value;
      return {
        name,
        byteLength: bytes.length,
        sha256: sha256(bytes),
      };
    });
  return `sha256-${sha256(canonicalJson(rows))}`;
}

function readPointer(root: string): {
  readonly path: string;
  readonly generationId: string;
  readonly identity: StableRegularFile;
} {
  const path = join(root, CHENG_GRAMMAR_CORPUS_CURRENT);
  const identity = stableRegularFile(
    path,
    "grammar corpus current pointer",
    MAX_POINTER_BYTES,
  );
  const text = identity.bytes.toString("utf8");
  if (!GENERATION_ID.test(text.slice(0, -1)) ||
      text !== `${text.slice(0, -1)}\n`) {
    throw new Error("grammar corpus current pointer invalid");
  }
  return {path, generationId: text.slice(0, -1), identity};
}

function pointerUnchanged(
  baseline: ReturnType<typeof readPointer>,
  current: ReturnType<typeof readPointer>,
): boolean {
  return baseline.generationId === current.generationId &&
    baseline.identity.device === current.identity.device &&
    baseline.identity.inode === current.identity.inode &&
    baseline.identity.size === current.identity.size &&
    baseline.identity.modifiedMs === current.identity.modifiedMs &&
    baseline.identity.changedMs === current.identity.changedMs &&
    baseline.identity.bytes.equals(current.identity.bytes);
}

export function readCurrentChengGrammarCorpus(
  rootRaw: string,
): ChengGrammarCorpusSnapshot {
  const root = resolve(rootRaw);
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error("grammar corpus root must be a regular directory");
  }
  const rootNames = readdirSync(root).sort();
  const expectedRootNames = [
    CHENG_GRAMMAR_CORPUS_GENERATIONS,
    CHENG_GRAMMAR_CORPUS_CURRENT,
  ].sort();
  if (canonicalJson(rootNames) !== canonicalJson(expectedRootNames)) {
    throw new Error("grammar corpus root entries invalid");
  }
  const generationsRoot = join(root, CHENG_GRAMMAR_CORPUS_GENERATIONS);
  const generationsStat = lstatSync(generationsRoot);
  if (generationsStat.isSymbolicLink() || !generationsStat.isDirectory()) {
    throw new Error("grammar corpus generations root invalid");
  }
  for (const name of readdirSync(generationsRoot)) {
    const generationPath = join(generationsRoot, name);
    const stat = lstatSync(generationPath);
    if (!GENERATION_ID.test(name) ||
        stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error("grammar corpus generation entry invalid");
    }
  }
  const pointer = readPointer(root);
  const generationDirectory =
    join(generationsRoot, pointer.generationId);
  if (!existsSync(generationDirectory)) {
    throw new Error("grammar corpus current generation missing");
  }
  const generationStat = lstatSync(generationDirectory);
  if (generationStat.isSymbolicLink() || !generationStat.isDirectory()) {
    throw new Error("grammar corpus current generation invalid");
  }
  const manifestPath = join(generationDirectory, "corpus.json");
  const manifestIdentity = stableRegularFile(
    manifestPath,
    "grammar corpus manifest",
    MAX_MANIFEST_BYTES,
  );
  const manifestValue = parseUniqueCurrentJson(
    manifestIdentity.bytes.toString("utf8"),
    "grammar_corpus_manifest",
  );
  assertCanonicalManifest(manifestValue);
  const manifest = manifestValue;
  const expectedNames = [
    "corpus.json",
    ...manifest.entries.map((entry) => `${entry.shape}.cheng`),
  ].sort();
  const actualNames = readdirSync(generationDirectory).sort();
  if (canonicalJson(actualNames) !== canonicalJson(expectedNames)) {
    throw new Error("grammar corpus generation file set invalid");
  }
  const files = new Map<string, Buffer>([
    ["corpus.json", manifestIdentity.bytes],
  ]);
  const filePaths = new Map<string, string>([
    ["corpus.json", manifestPath],
  ]);
  const fileIdentities =
    new Map<string, ChengGrammarCorpusFileIdentity>([
      ["corpus.json", stableFileIdentity(manifestIdentity)],
    ]);
  const sourcePaths: string[] = [];
  for (const entry of manifest.entries) {
    const name = `${entry.shape}.cheng`;
    if (!SOURCE_NAME.test(name) ||
        basename(entry.relativePath) !== name) {
      throw new Error("grammar corpus source name invalid");
    }
    const path = join(generationDirectory, name);
    const identity = stableRegularFile(
      path,
      `grammar corpus source ${name}`,
      MAX_SOURCE_BYTES,
    );
    if (sha256(identity.bytes) !== entry.sourceSha256) {
      throw new Error(`grammar corpus source hash invalid: ${name}`);
    }
    files.set(name, identity.bytes);
    filePaths.set(name, path);
    fileIdentities.set(name, stableFileIdentity(identity));
    sourcePaths.push(path);
  }
  if (chengGrammarCorpusGenerationId(files) !== pointer.generationId) {
    throw new Error("grammar corpus generation content address invalid");
  }
  const finalPointer = readPointer(root);
  if (!pointerUnchanged(pointer, finalPointer) ||
      canonicalJson(readdirSync(generationDirectory).sort()) !==
        canonicalJson(expectedNames)) {
    throw new Error("grammar corpus current pointer changed during read");
  }
  for (const [name, path] of filePaths) {
    const identity = fileIdentities.get(name)!;
    const finalIdentity = lstatSync(path);
    if (finalIdentity.isSymbolicLink() || !finalIdentity.isFile() ||
        !chengGrammarCorpusFileIdentityEqual(identity, {
          device: finalIdentity.dev,
          inode: finalIdentity.ino,
          size: finalIdentity.size,
          modifiedMs: finalIdentity.mtimeMs,
          changedMs: finalIdentity.ctimeMs,
        })) {
      throw new Error(
        `grammar corpus generation file changed during read: ${name}`,
      );
    }
  }
  return {
    root,
    pointerPath: pointer.path,
    generationId: pointer.generationId,
    generationDirectory,
    manifest,
    files,
    filePaths,
    fileIdentities,
    pointerIdentity: stableFileIdentity(pointer.identity),
    sourcePaths,
  };
}
