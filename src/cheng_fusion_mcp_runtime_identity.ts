import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  type BigIntStats,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./cheng_semantic_matrix_m9023.ts";

export const CHENG_FUSION_MCP_RUNTIME_IDENTITY_SCHEMA =
  "cheng_fusion_mcp_runtime_identity";

const HASH = /^[0-9a-f]{64}$/;
const FUSION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_STARTED_UNIX_MS = Date.now();

export interface ChengFusionMcpSourcePin {
  readonly path: string;
  readonly byteLength: number;
  readonly bytesRaw32: string;
}

export interface ChengFusionMcpToolRegistryIdentity {
  readonly schema: "cheng_fusion_tool_registry";
  readonly count: number;
  readonly names: readonly string[];
  readonly sha256: string;
}

export interface ChengFusionMcpRuntimeExecutablePin {
  readonly path: string;
  readonly byteLength: number;
  readonly bytesRaw32: string;
  readonly bunVersion: string;
}

export interface ChengFusionMcpRuntimeIdentity {
  readonly schema: typeof CHENG_FUSION_MCP_RUNTIME_IDENTITY_SCHEMA;
  readonly status: "LIVE";
  readonly serverPid: number;
  readonly runtimeStartedUnixMs: number;
  readonly initializationNonce: string;
  readonly sources: readonly ChengFusionMcpSourcePin[];
  readonly sourceSetRaw32: string;
  readonly runtimeExecutable: ChengFusionMcpRuntimeExecutablePin;
  readonly toolRegistry: ChengFusionMcpToolRegistryIdentity;
  readonly implementationRaw32: string;
  readonly receiptRaw32: string;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}_object_required`);
  }
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label}_keys_invalid`);
  }
}

function sameStat(left: BigIntStats, right: BigIntStats): boolean {
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

function pinSource(path: string): ChengFusionMcpSourcePin {
  const absolute = resolve(path);
  const before = lstatSync(absolute, { bigint: true });
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1n ||
    before.size <= 0n ||
    before.size > BigInt(Number.MAX_SAFE_INTEGER) ||
    realpathSync.native(absolute) !== absolute
  ) {
    throw new Error(`mcp_runtime_source_identity_invalid:${absolute}`);
  }
  const raw = readFileSync(absolute);
  const after = lstatSync(absolute, { bigint: true });
  if (!sameStat(before, after) || raw.length !== Number(before.size)) {
    throw new Error(`mcp_runtime_source_drift:${absolute}`);
  }
  const pathFromRoot = relative(FUSION_ROOT, absolute);
  if (
    pathFromRoot.length === 0 ||
    pathFromRoot.startsWith("..") ||
    resolve(FUSION_ROOT, pathFromRoot) !== absolute
  ) {
    throw new Error(`mcp_runtime_source_escape:${absolute}`);
  }
  return Object.freeze({
    path: pathFromRoot,
    byteLength: raw.length,
    bytesRaw32: sha256(raw),
  });
}

function sourcePaths(): string[] {
  const srcRoot = join(FUSION_ROOT, "src");
  const srcFiles = readdirSync(srcRoot, { withFileTypes: true })
    .filter((entry) => entry.name.endsWith(".ts"))
    .map((entry) => {
      if (!entry.isFile()) {
        throw new Error(`mcp_runtime_source_entry_invalid:${entry.name}`);
      }
      return join(srcRoot, entry.name);
    });
  return [
    ...srcFiles,
    join(FUSION_ROOT, "index.ts"),
    join(FUSION_ROOT, "package.json"),
    join(FUSION_ROOT, "bun.lock"),
  ].sort();
}

function sourceSetRaw32(
  sources: readonly ChengFusionMcpSourcePin[],
): string {
  return sha256(
    canonicalJson({
      domain: "cheng.fusion.mcp.current_source_set",
      sources,
    }),
  );
}

export function captureCurrentChengFusionMcpSources():
  readonly ChengFusionMcpSourcePin[] {
  const rows = sourcePaths().map(pinSource);
  if (
    rows.length === 0 ||
    new Set(rows.map((row) => row.path)).size !== rows.length
  ) {
    throw new Error("mcp_runtime_source_set_invalid");
  }
  return Object.freeze(rows);
}

const STARTUP_SOURCES = captureCurrentChengFusionMcpSources();
const STARTUP_SOURCE_SET_RAW32 = sourceSetRaw32(STARTUP_SOURCES);

function pinRuntimeExecutable(): ChengFusionMcpRuntimeExecutablePin {
  const absolute = resolve(process.execPath);
  const before = lstatSync(absolute, { bigint: true });
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1n ||
    before.size <= 0n ||
    before.size > BigInt(Number.MAX_SAFE_INTEGER) ||
    realpathSync.native(absolute) !== absolute
  ) {
    throw new Error("mcp_runtime_executable_identity_invalid");
  }
  const raw = readFileSync(absolute);
  const after = lstatSync(absolute, { bigint: true });
  if (!sameStat(before, after) || raw.length !== Number(before.size)) {
    throw new Error("mcp_runtime_executable_drift");
  }
  const bunVersion = process.versions.bun;
  if (typeof bunVersion !== "string" || bunVersion.length === 0) {
    throw new Error("mcp_runtime_bun_version_missing");
  }
  return Object.freeze({
    path: absolute,
    byteLength: raw.length,
    bytesRaw32: sha256(raw),
    bunVersion,
  });
}

const STARTUP_RUNTIME_EXECUTABLE = pinRuntimeExecutable();

function validateRegistry(
  value: unknown,
): ChengFusionMcpToolRegistryIdentity {
  exactKeys(
    value,
    ["schema", "count", "names", "sha256"],
    "mcp_runtime_tool_registry",
  );
  if (
    value.schema !== "cheng_fusion_tool_registry" ||
    !Number.isSafeInteger(value.count) ||
    Number(value.count) <= 0 ||
    !Array.isArray(value.names) ||
    value.names.length !== value.count ||
    value.names.some(
      (name) =>
        typeof name !== "string" || !/^cheng_[a-z0-9_]+$/.test(name),
    )
  ) {
    throw new Error("mcp_runtime_tool_registry_invalid");
  }
  const names = value.names as string[];
  const sorted = [...names].sort();
  if (
    new Set(names).size !== names.length ||
    names.some((name, index) => name !== sorted[index]) ||
    typeof value.sha256 !== "string" ||
    !HASH.test(value.sha256) ||
    sha256(names.map((name) => `${name}\n`).join("")) !== value.sha256
  ) {
    throw new Error("mcp_runtime_tool_registry_identity_drift");
  }
  return Object.freeze({
    schema: "cheng_fusion_tool_registry",
    count: Number(value.count),
    names: Object.freeze([...names]),
    sha256: value.sha256,
  });
}

function implementationRaw32(
  sourceSet: string,
  runtimeExecutable: ChengFusionMcpRuntimeExecutablePin,
  registry: ChengFusionMcpToolRegistryIdentity,
): string {
  return sha256(
    canonicalJson({
      domain: "cheng.fusion.mcp.current_implementation",
      sourceSetRaw32: sourceSet,
      runtimeExecutable,
      toolRegistryRaw32: sha256(canonicalJson(registry)),
    }),
  );
}

export function createChengFusionMcpRuntimeIdentity(
  registryValue: unknown,
  initializationNonce: string,
): ChengFusionMcpRuntimeIdentity {
  const registry = validateRegistry(registryValue);
  if (!HASH.test(initializationNonce)) {
    throw new Error("mcp_runtime_initialization_nonce_invalid");
  }
  const payload = {
    schema: CHENG_FUSION_MCP_RUNTIME_IDENTITY_SCHEMA,
    status: "LIVE" as const,
    serverPid: process.pid,
    runtimeStartedUnixMs: RUNTIME_STARTED_UNIX_MS,
    initializationNonce,
    sources: STARTUP_SOURCES,
    sourceSetRaw32: STARTUP_SOURCE_SET_RAW32,
    runtimeExecutable: STARTUP_RUNTIME_EXECUTABLE,
    toolRegistry: registry,
    implementationRaw32: implementationRaw32(
      STARTUP_SOURCE_SET_RAW32,
      STARTUP_RUNTIME_EXECUTABLE,
      registry,
    ),
  };
  return Object.freeze({
    ...payload,
    receiptRaw32: sha256(canonicalJson(payload)),
  });
}

export function validateChengFusionMcpRuntimeIdentity(
  value: unknown,
  options: {
    readonly expectedServerPid?: number;
    readonly expectedInitializationNonce?: string;
    readonly earliestRuntimeStartedUnixMs?: number;
    readonly latestRuntimeStartedUnixMs?: number;
    readonly requireCurrentSources?: boolean;
  } = {},
): ChengFusionMcpRuntimeIdentity {
  exactKeys(
    value,
    [
      "schema",
      "status",
      "serverPid",
      "runtimeStartedUnixMs",
      "initializationNonce",
      "sources",
      "sourceSetRaw32",
      "runtimeExecutable",
      "toolRegistry",
      "implementationRaw32",
      "receiptRaw32",
    ],
    "mcp_runtime_identity",
  );
  if (
    value.schema !== CHENG_FUSION_MCP_RUNTIME_IDENTITY_SCHEMA ||
    value.status !== "LIVE" ||
    !Number.isSafeInteger(value.serverPid) ||
    Number(value.serverPid) <= 0 ||
    !Number.isSafeInteger(value.runtimeStartedUnixMs) ||
    Number(value.runtimeStartedUnixMs) <= 0 ||
    typeof value.initializationNonce !== "string" ||
    !HASH.test(value.initializationNonce) ||
    typeof value.sourceSetRaw32 !== "string" ||
    !HASH.test(value.sourceSetRaw32) ||
    typeof value.implementationRaw32 !== "string" ||
    !HASH.test(value.implementationRaw32) ||
    typeof value.receiptRaw32 !== "string" ||
    !HASH.test(value.receiptRaw32) ||
    !Array.isArray(value.sources) ||
    value.sources.length === 0
  ) {
    throw new Error("mcp_runtime_identity_header_invalid");
  }
  const sources = value.sources.map((source, index) => {
    exactKeys(
      source,
      ["path", "byteLength", "bytesRaw32"],
      `mcp_runtime_source_${index}`,
    );
    if (
      typeof source.path !== "string" ||
      source.path.length === 0 ||
      source.path.startsWith("/") ||
      source.path.split("/").some((part) => !part || part === "." || part === "..") ||
      !Number.isSafeInteger(source.byteLength) ||
      Number(source.byteLength) <= 0 ||
      typeof source.bytesRaw32 !== "string" ||
      !HASH.test(source.bytesRaw32)
    ) {
      throw new Error(`mcp_runtime_source_${index}_invalid`);
    }
    return Object.freeze({
      path: source.path,
      byteLength: Number(source.byteLength),
      bytesRaw32: source.bytesRaw32,
    });
  });
  const sortedPaths = sources.map((row) => row.path).sort();
  if (
    new Set(sortedPaths).size !== sources.length ||
    sources.some((row, index) => row.path !== sortedPaths[index])
  ) {
    throw new Error("mcp_runtime_source_order_invalid");
  }
  const computedSourceSet = sourceSetRaw32(sources);
  exactKeys(
    value.runtimeExecutable,
    ["path", "byteLength", "bytesRaw32", "bunVersion"],
    "mcp_runtime_executable",
  );
  if (
    typeof value.runtimeExecutable.path !== "string" ||
    value.runtimeExecutable.path !== resolve(value.runtimeExecutable.path) ||
    !Number.isSafeInteger(value.runtimeExecutable.byteLength) ||
    Number(value.runtimeExecutable.byteLength) <= 0 ||
    typeof value.runtimeExecutable.bytesRaw32 !== "string" ||
    !HASH.test(value.runtimeExecutable.bytesRaw32) ||
    typeof value.runtimeExecutable.bunVersion !== "string" ||
    value.runtimeExecutable.bunVersion.length === 0
  ) {
    throw new Error("mcp_runtime_executable_pin_invalid");
  }
  const runtimeExecutable = Object.freeze({
    path: value.runtimeExecutable.path,
    byteLength: Number(value.runtimeExecutable.byteLength),
    bytesRaw32: value.runtimeExecutable.bytesRaw32,
    bunVersion: value.runtimeExecutable.bunVersion,
  });
  const registry = validateRegistry(value.toolRegistry);
  if (
    computedSourceSet !== value.sourceSetRaw32 ||
    implementationRaw32(computedSourceSet, runtimeExecutable, registry) !==
      value.implementationRaw32
  ) {
    throw new Error("mcp_runtime_implementation_identity_drift");
  }
  const payload = { ...value };
  delete payload.receiptRaw32;
  if (sha256(canonicalJson(payload)) !== value.receiptRaw32) {
    throw new Error("mcp_runtime_receipt_self_hash_drift");
  }
  if (
    options.expectedServerPid !== undefined &&
    value.serverPid !== options.expectedServerPid
  ) {
    throw new Error("mcp_runtime_server_pid_drift");
  }
  if (
    options.expectedInitializationNonce !== undefined &&
    value.initializationNonce !== options.expectedInitializationNonce
  ) {
    throw new Error("mcp_runtime_initialization_nonce_drift");
  }
  if (
    options.earliestRuntimeStartedUnixMs !== undefined &&
    value.runtimeStartedUnixMs < options.earliestRuntimeStartedUnixMs
  ) {
    throw new Error("mcp_runtime_process_not_fresh");
  }
  if (
    options.latestRuntimeStartedUnixMs !== undefined &&
    value.runtimeStartedUnixMs > options.latestRuntimeStartedUnixMs
  ) {
    throw new Error("mcp_runtime_start_time_invalid");
  }
  if (options.requireCurrentSources !== false) {
    const current = captureCurrentChengFusionMcpSources();
    const currentRuntimeExecutable = pinRuntimeExecutable();
    if (
      value.sourceSetRaw32 !== sourceSetRaw32(current) ||
      canonicalJson(sources) !== canonicalJson(current) ||
      canonicalJson(runtimeExecutable) !==
        canonicalJson(currentRuntimeExecutable)
    ) {
      throw new Error("mcp_runtime_current_source_drift");
    }
  }
  return Object.freeze({
    schema: CHENG_FUSION_MCP_RUNTIME_IDENTITY_SCHEMA,
    status: "LIVE",
    serverPid: Number(value.serverPid),
    runtimeStartedUnixMs: Number(value.runtimeStartedUnixMs),
    initializationNonce: value.initializationNonce,
    sources: Object.freeze(sources),
    sourceSetRaw32: value.sourceSetRaw32,
    runtimeExecutable,
    toolRegistry: registry,
    implementationRaw32: value.implementationRaw32,
    receiptRaw32: value.receiptRaw32,
  });
}
