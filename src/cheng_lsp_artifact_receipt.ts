import {createHash} from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import {join, resolve} from "node:path";
import {canonicalJson} from "./cheng_semantic_matrix_m9023.ts";
import {
  assertExactCurrentObjectKeys,
  parseUniqueCurrentJson,
} from "./current_schema_json.ts";

export const CHENG_LSP_ARTIFACT_RECEIPT_SCHEMA =
  "cheng_lsp_artifact_receipt";
export const CHENG_LSP_REVOKED_OUTPUT_RAW32 =
  "e13ad8f8949835c413f490118de520ae25f99e63fe508a98eebd7b2b982671a2";

const HASH = /^[0-9a-f]{64}$/;
const MAX_RECEIPT_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_EXECUTABLE_BYTES = 1024 * 1024 * 1024;
const FILE_PIN_KEYS = ["path", "byteLength", "bytesRaw32"] as const;
const RECEIPT_KEYS = [
  "schema",
  "officialDriver",
  "parser",
  "lspServer",
  "output",
  "receiptRaw32",
] as const;

interface FileGeneration {
  readonly device: string;
  readonly inode: string;
  readonly mode: string;
  readonly linkCount: string;
  readonly byteLength: number;
  readonly mtimeNs: string;
  readonly ctimeNs: string;
}

export interface ChengLspArtifactFileIdentity {
  readonly path: string;
  readonly byteLength: number;
  readonly bytesRaw32: string;
  readonly generation: FileGeneration;
}

export interface ChengLspArtifactIdentity {
  readonly schema: typeof CHENG_LSP_ARTIFACT_RECEIPT_SCHEMA;
  readonly officialDriver: ChengLspArtifactFileIdentity;
  readonly parser: ChengLspArtifactFileIdentity;
  readonly lspServer: ChengLspArtifactFileIdentity;
  readonly output: ChengLspArtifactFileIdentity;
  readonly receiptPath: string;
  readonly receiptBytesRaw32: string;
  readonly receiptGeneration: FileGeneration;
  readonly receiptRaw32: string;
}

interface StableArtifact {
  readonly identity: ChengLspArtifactFileIdentity;
  readonly raw: Buffer | null;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameStat(
  left: ReturnType<typeof lstatSync>,
  right: ReturnType<typeof lstatSync>,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function fileGeneration(
  stat: ReturnType<typeof lstatSync>,
): FileGeneration {
  if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("cheng-lsp artifact byte length exceeds safe integer");
  }
  return Object.freeze({
    device: stat.dev.toString(10),
    inode: stat.ino.toString(10),
    mode: stat.mode.toString(10),
    linkCount: stat.nlink.toString(10),
    byteLength: Number(stat.size),
    mtimeNs: stat.mtimeNs.toString(10),
    ctimeNs: stat.ctimeNs.toString(10),
  });
}

function stableRegularArtifact(
  path: string,
  label: string,
  maxBytes: number,
  options: {
    readonly executable?: boolean;
    readonly retainBytes?: boolean;
  } = {},
): StableArtifact {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    resolve(path) !== path
  ) {
    throw new Error(`${label} path must be absolute: ${path}`);
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error(`${label} byte limit is invalid`);
  }
  let pathBefore: ReturnType<typeof lstatSync>;
  try {
    pathBefore = lstatSync(path, {bigint: true});
  } catch (error) {
    throw new Error(
      `${label} not materialized or missing: ${path}: ` +
      `${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    pathBefore.isSymbolicLink() ||
    !pathBefore.isFile() ||
    pathBefore.nlink !== 1n ||
    pathBefore.size <= 0n
  ) {
    throw new Error(
      `${label} must be a non-empty regular single-link file: ${path}`,
    );
  }
  if (pathBefore.size > BigInt(maxBytes)) {
    throw new Error(`${label} exceeds ${maxBytes} bytes: ${path}`);
  }
  if (
    options.executable === true &&
    (pathBefore.mode & 0o111n) === 0n
  ) {
    throw new Error(`${label} is not executable: ${path}`);
  }
  let canonicalPath: string;
  try {
    canonicalPath = realpathSync.native(path);
  } catch (error) {
    throw new Error(
      `${label} canonical path could not be resolved: ${path}: ` +
      `${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (canonicalPath !== path) {
    throw new Error(`${label} path is not canonical: ${path}`);
  }
  if (!Number.isInteger(constants.O_NOFOLLOW)) {
    throw new Error("cheng-lsp artifact validation requires O_NOFOLLOW");
  }
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new Error(
      `${label} could not be opened without following links: ${path}: ` +
      `${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    const opened = fstatSync(fd, {bigint: true});
    if (!opened.isFile() || !sameStat(pathBefore, opened)) {
      throw new Error(`${label} changed between path validation and open`);
    }
    const expectedSize = Number(opened.size);
    const retained: Buffer[] = [];
    const hash = createHash("sha256");
    let offset = 0;
    while (offset < expectedSize) {
      const chunk = Buffer.allocUnsafe(
        Math.min(1024 * 1024, expectedSize - offset),
      );
      const bytesRead = readSync(fd, chunk, 0, chunk.length, offset);
      if (bytesRead <= 0) {
        throw new Error(`${label} became truncated while hashing`);
      }
      const bytes =
        bytesRead === chunk.length ? chunk : chunk.subarray(0, bytesRead);
      hash.update(bytes);
      if (options.retainBytes === true) retained.push(bytes);
      offset += bytesRead;
    }
    const descriptorAfter = fstatSync(fd, {bigint: true});
    let pathAfter: ReturnType<typeof lstatSync>;
    try {
      pathAfter = lstatSync(path, {bigint: true});
    } catch (error) {
      throw new Error(
        `${label} path disappeared while hashing: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (
      pathAfter.isSymbolicLink() ||
      !pathAfter.isFile() ||
      !sameStat(opened, descriptorAfter) ||
      !sameStat(descriptorAfter, pathAfter)
    ) {
      throw new Error(`${label} changed generation while hashing`);
    }
    return Object.freeze({
      identity: Object.freeze({
        path,
        byteLength: expectedSize,
        bytesRaw32: hash.digest("hex"),
        generation: fileGeneration(pathAfter),
      }),
      raw:
        options.retainBytes === true
          ? Buffer.concat(retained, expectedSize)
          : null,
    });
  } finally {
    closeSync(fd);
  }
}

function observedPin(
  value: unknown,
  expectedPath: string,
  observed: ChengLspArtifactFileIdentity,
  label: string,
): void {
  assertExactCurrentObjectKeys(value, FILE_PIN_KEYS, label);
  if (
    value.path !== expectedPath ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength <= 0 ||
    typeof value.bytesRaw32 !== "string" ||
    !HASH.test(value.bytesRaw32)
  ) {
    throw new Error(`${label} identity is invalid`);
  }
  if (value.byteLength !== observed.byteLength) {
    throw new Error(`${label} byte length mismatch`);
  }
  if (value.bytesRaw32 !== observed.bytesRaw32) {
    throw new Error(`${label} hash mismatch`);
  }
}

function sameFileIdentity(
  left: ChengLspArtifactFileIdentity,
  right: ChengLspArtifactFileIdentity,
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function chengLspArtifactReceiptPath(outputPath: string): string {
  if (
    typeof outputPath !== "string" ||
    outputPath.length === 0 ||
    resolve(outputPath) !== outputPath
  ) {
    throw new Error(
      `cheng-lsp output path must be absolute: ${outputPath}`,
    );
  }
  return `${outputPath}.receipt.json`;
}

export function chengLspAssertArtifactOutputAllowed(
  outputRaw32: string,
): void {
  if (typeof outputRaw32 !== "string" || !HASH.test(outputRaw32)) {
    throw new Error("cheng-lsp output hash is invalid");
  }
  if (outputRaw32 === CHENG_LSP_REVOKED_OUTPUT_RAW32) {
    throw new Error(
      `revoked installed cheng-lsp artifact is forbidden: ${outputRaw32}`,
    );
  }
}

export function chengLspCaptureArtifactIdentity(
  outputPath: string,
  toolchainRoot: string,
): ChengLspArtifactIdentity {
  if (
    typeof toolchainRoot !== "string" ||
    toolchainRoot.length === 0 ||
    resolve(toolchainRoot) !== toolchainRoot ||
    realpathSync.native(toolchainRoot) !== toolchainRoot
  ) {
    throw new Error(
      `Cheng toolchain root must be an existing canonical absolute path: ` +
      `${toolchainRoot}`,
    );
  }
  const expectedPaths = Object.freeze({
    officialDriver: join(
      toolchainRoot,
      "artifacts/backend_driver/cheng",
    ),
    parser: join(toolchainRoot, "src/core/lang/parser.cheng"),
    lspServer: join(
      toolchainRoot,
      "src/core/tooling/lsp_server.cheng",
    ),
    output: outputPath,
  });
  const outputBefore = stableRegularArtifact(
    outputPath,
    "cheng-lsp output",
    MAX_EXECUTABLE_BYTES,
    {executable: true},
  );
  chengLspAssertArtifactOutputAllowed(outputBefore.identity.bytesRaw32);

  const receiptPath = chengLspArtifactReceiptPath(outputPath);
  const receiptBefore = stableRegularArtifact(
    receiptPath,
    "cheng-lsp artifact receipt",
    MAX_RECEIPT_BYTES,
    {retainBytes: true},
  );
  let receiptText: string;
  try {
    receiptText = new TextDecoder("utf-8", {fatal: true}).decode(
      receiptBefore.raw!,
    );
  } catch {
    throw new Error("cheng-lsp artifact receipt is not valid UTF-8");
  }
  if (
    !receiptText.endsWith("\n") ||
    receiptText.includes("\r") ||
    receiptText.slice(0, -1).includes("\n")
  ) {
    throw new Error(
      "cheng-lsp artifact receipt must be one LF-terminated JSON line",
    );
  }
  const receipt = parseUniqueCurrentJson(
    receiptText.slice(0, -1),
    "cheng_lsp_artifact_receipt",
  );
  assertExactCurrentObjectKeys(
    receipt,
    RECEIPT_KEYS,
    "cheng_lsp_artifact_receipt",
  );
  if (
    receipt.schema !== CHENG_LSP_ARTIFACT_RECEIPT_SCHEMA ||
    typeof receipt.receiptRaw32 !== "string" ||
    !HASH.test(receipt.receiptRaw32) ||
    `${canonicalJson(receipt)}\n` !== receiptText
  ) {
    throw new Error(
      "cheng-lsp artifact receipt header or canonical JSON is invalid",
    );
  }
  const payload = {...receipt};
  delete payload.receiptRaw32;
  if (sha256(canonicalJson(payload)) !== receipt.receiptRaw32) {
    throw new Error("cheng-lsp artifact receipt self hash mismatch");
  }

  const officialDriver = stableRegularArtifact(
    expectedPaths.officialDriver,
    "official Cheng backend driver",
    MAX_EXECUTABLE_BYTES,
    {executable: true},
  );
  const parser = stableRegularArtifact(
    expectedPaths.parser,
    "parser source",
    MAX_SOURCE_BYTES,
  );
  const lspServer = stableRegularArtifact(
    expectedPaths.lspServer,
    "lsp_server source",
    MAX_SOURCE_BYTES,
  );
  observedPin(
    receipt.officialDriver,
    expectedPaths.officialDriver,
    officialDriver.identity,
    "official Cheng backend driver",
  );
  observedPin(
    receipt.parser,
    expectedPaths.parser,
    parser.identity,
    "parser source",
  );
  observedPin(
    receipt.lspServer,
    expectedPaths.lspServer,
    lspServer.identity,
    "lsp_server source",
  );
  observedPin(
    receipt.output,
    expectedPaths.output,
    outputBefore.identity,
    "cheng-lsp output",
  );

  const outputAfter = stableRegularArtifact(
    outputPath,
    "cheng-lsp output post-receipt",
    MAX_EXECUTABLE_BYTES,
    {executable: true},
  );
  const receiptAfter = stableRegularArtifact(
    receiptPath,
    "cheng-lsp artifact receipt post-validation",
    MAX_RECEIPT_BYTES,
  );
  const officialDriverAfter = stableRegularArtifact(
    expectedPaths.officialDriver,
    "official Cheng backend driver post-validation",
    MAX_EXECUTABLE_BYTES,
    {executable: true},
  );
  const parserAfter = stableRegularArtifact(
    expectedPaths.parser,
    "parser source post-validation",
    MAX_SOURCE_BYTES,
  );
  const lspServerAfter = stableRegularArtifact(
    expectedPaths.lspServer,
    "lsp_server source post-validation",
    MAX_SOURCE_BYTES,
  );
  if (
    !sameFileIdentity(outputBefore.identity, outputAfter.identity) ||
    !sameFileIdentity(
      receiptBefore.identity,
      receiptAfter.identity,
    ) ||
    !sameFileIdentity(
      officialDriver.identity,
      officialDriverAfter.identity,
    ) ||
    !sameFileIdentity(parser.identity, parserAfter.identity) ||
    !sameFileIdentity(lspServer.identity, lspServerAfter.identity)
  ) {
    throw new Error(
      "cheng-lsp artifact closure changed during validation",
    );
  }

  return Object.freeze({
    schema: CHENG_LSP_ARTIFACT_RECEIPT_SCHEMA,
    officialDriver: officialDriverAfter.identity,
    parser: parserAfter.identity,
    lspServer: lspServerAfter.identity,
    output: outputAfter.identity,
    receiptPath,
    receiptBytesRaw32: receiptAfter.identity.bytesRaw32,
    receiptGeneration: receiptAfter.identity.generation,
    receiptRaw32: receipt.receiptRaw32,
  });
}

export function chengLspAssertArtifactIdentityStable(
  before: ChengLspArtifactIdentity,
  after: ChengLspArtifactIdentity,
  label = "cheng-lsp",
): void {
  if (canonicalJson(before) !== canonicalJson(after)) {
    throw new Error(`${label} artifact identity changed`);
  }
}

export function chengLspArtifactCacheKey(
  root: string,
  identity: ChengLspArtifactIdentity,
): string {
  if (
    typeof root !== "string" ||
    root.length === 0 ||
    resolve(root) !== root
  ) {
    throw new Error(`cheng-lsp cache root must be absolute: ${root}`);
  }
  chengLspAssertArtifactOutputAllowed(identity.output.bytesRaw32);
  return canonicalJson({
    root,
    lspSha: identity.output.bytesRaw32,
  });
}
