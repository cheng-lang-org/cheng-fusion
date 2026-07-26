import {constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, readdirSync} from "node:fs";
import {dirname, join, relative, resolve, sep} from "node:path";
import {gunzipSync} from "node:zlib";
import {
  CID_EVIDENCE_SCHEMA,
  CID_MIRROR_INSTALL_SCHEMA,
  CidOracleError,
  assertPortableSourceReceiptEqual,
  buildCanonicalCsgSidecar,
  buildCompileSemanticReceipt,
  buildPortableSourceIdentity,
  canonicalModulePath,
  canonicalPackageId,
  encoding,
  parseCanonicalCsgSidecar,
  parseCompileSemanticReceipt,
  parseExportSurface,
  parseMigrationEvidence,
  parseMigrationProof,
  parsePortableSourceReceipt,
  parseUniqueKv,
  sha256,
  sourceImportEdges,
  sourceToCsgBindingSeal,
  verifyMigrationEvidenceRawSources,
  verifyMigrationProofBindings,
  worldHashText,
  type CompileSemanticReceipt,
  type MigrationEvidence,
  type MigrationProof,
  type SourceModuleBytes,
} from "./cheng_cid_identity_chain_oracle.ts";

const HEX32 = /^[0-9a-f]{64}$/;
const UINT = /^(0|[1-9][0-9]*)$/;
export const CID_CURRENT_DRIVER_CONTAINER_PATH =
  "/cheng-hardcap/current-driver";
export const CID_CURRENT_DRIVER_RUN_CASE_COMMAND = "run-case";
export const CID_OFFICIAL_ENTRY_SPECS = Object.freeze({
  "src/core/tooling/backend_driver_dispatch_min.cheng":
    "cheng/core/tooling/backend_driver_dispatch_min",
  "src/core/tooling/backend_driver_main.cheng":
    "cheng/core/tooling/backend_driver_main",
} as const);
const CID_DESCRIPTOR_SEQUENCE_ENCODING = "be64_length_utf8_sequence";
const EXACT_CASE_KINDS = [
  "zero_byte_import",
  "source_bundle_entry",
  "source_csg_binding",
  "csg_atomic_consume",
  "migration_cross_root_fixed_point",
  "mirror_atomic_install",
] as const;

type CaseKind = typeof EXACT_CASE_KINDS[number];

export interface ArtifactRef {
  readonly path: string;
  readonly raw_byte_length: number;
  readonly sha256: string;
}

interface SourceModuleRef {
  readonly module_path: string;
  readonly source: ArtifactRef;
}

interface ClosureFileRef {
  readonly logical_path: string;
  readonly artifact: ArtifactRef;
}

interface EvidenceCase {
  readonly artifacts: Readonly<Record<string, ArtifactRef>>;
  readonly bootstrap_stage: string;
  readonly case_id: string;
  readonly entry_module_path: string;
  readonly kind: CaseKind;
  readonly legacy_modules: readonly SourceModuleRef[];
  readonly migrated_modules: readonly SourceModuleRef[];
  readonly modules: readonly SourceModuleRef[];
  readonly package_id: string;
  readonly providers: readonly string[];
  readonly root_b_legacy_modules: readonly SourceModuleRef[];
  readonly root_b_migrated_modules: readonly SourceModuleRef[];
  readonly target: string;
}

interface CgroupRunRefs {
  readonly artifacts: Readonly<Record<string, ArtifactRef>>;
}

interface EvidenceManifest {
  readonly candidate: ArtifactRef;
  readonly candidate_entry_path: keyof typeof CID_OFFICIAL_ENTRY_SPECS;
  readonly candidate_entry_module_path:
    typeof CID_OFFICIAL_ENTRY_SPECS[keyof typeof CID_OFFICIAL_ENTRY_SPECS];
  readonly candidate_entry_sha256: string;
  readonly cases: readonly EvidenceCase[];
  readonly candidate_build: CgroupRunRefs;
  readonly cgroup_counterexample: CgroupRunRefs;
  readonly evidence_kind: "production";
  readonly image_build_receipt: ArtifactRef;
  readonly image_config: ArtifactRef;
  readonly image_final_layer: ArtifactRef;
  readonly image_final_layer_gzip: ArtifactRef;
  readonly image_manifest: ArtifactRef;
  readonly image_oci_manifest: ArtifactRef;
  readonly manifest_sha256: string;
  readonly mutation_replay: ArtifactRef;
  readonly schema: typeof CID_EVIDENCE_SCHEMA;
  readonly source_manifest: ArtifactRef;
  readonly source_files: readonly ClosureFileRef[];
  readonly tool_manifest: ArtifactRef;
  readonly tool_files: readonly ClosureFileRef[];
}

function officialEntrySpec(
  entryPath: unknown,
  modulePath: unknown,
  label: string,
): {
  path: keyof typeof CID_OFFICIAL_ENTRY_SPECS;
  modulePath:
    typeof CID_OFFICIAL_ENTRY_SPECS[keyof typeof CID_OFFICIAL_ENTRY_SPECS];
} {
  if (
    typeof entryPath !== "string"
    || !Object.prototype.hasOwnProperty.call(
      CID_OFFICIAL_ENTRY_SPECS,
      entryPath,
    )
  ) {
    fail(`${label}: 只接受两个官方 entry`);
  }
  const path = entryPath as keyof typeof CID_OFFICIAL_ENTRY_SPECS;
  const expectedModulePath = CID_OFFICIAL_ENTRY_SPECS[path];
  if (modulePath !== expectedModulePath) {
    fail(`${label}: entry module/path 不匹配`);
  }
  return {path, modulePath: expectedModulePath};
}

interface ManagedMirrorBundle {
  readonly channel: string;
  readonly packageId: string;
  readonly migrationProofCid: string;
  readonly legacySourceIdentityReceiptCid: string;
  readonly migratedSourceIdentityReceiptCid: string;
  readonly compileSemanticReceiptCid: string;
  readonly units: readonly {
    readonly modulePath: string;
    readonly legacyBytes: Buffer;
    readonly legacyCid: string;
    readonly migratedBytes: Buffer;
    readonly migratedCid: string;
  }[];
  readonly baselineCsg: Buffer;
  readonly migratedCsg: Buffer;
  readonly baselineSurface: Buffer;
  readonly migratedSurface: Buffer;
  readonly baselineSemantic: Buffer;
  readonly migratedSemantic: Buffer;
  readonly evidence: Buffer;
  readonly proof: Buffer;
  readonly bundleCid: string;
  readonly raw: Buffer;
}

interface ManifestEntry {
  readonly packageId: string;
  readonly snapshotCid: string;
  readonly syntaxSurfaceCid: string;
  readonly migrationProofCid: string;
  readonly managedMirrorBundleCid: string;
}

interface UniverseManifest {
  readonly channel: string;
  readonly managedDependencyReceiptCid: string;
  readonly entries: readonly ManifestEntry[];
  readonly manifestCid: string;
}

interface PackageSnapshot {
  readonly packageId: string;
  readonly channel: string;
  readonly sourceBundleCid: string;
  readonly csgRootCid: string;
  readonly exportSurfaceCid: string;
  readonly syntaxSurfaceCid: string;
  readonly depsManifestCid: string;
  readonly migrationProofCid: string;
  readonly signature: string;
  readonly snapshotCid: string;
}

interface WorldHead {
  readonly universeId: string;
  readonly channel: string;
  readonly headEpoch: number;
  readonly prevHeadCid: string;
  readonly manifestRootCid: string;
  readonly csgRootCid: string;
  readonly compilerPkgCid: string;
  readonly stdPkgCid: string;
  readonly runtimePkgCid: string;
  readonly signature: string;
  readonly headCid: string;
}

interface CompileReceipt {
  readonly worldHeadCid: string;
  readonly sourceIdentityReceiptCid: string;
  readonly semanticReceiptCid: string;
  readonly target: string;
  readonly outputRawSha256: string;
  readonly canonicalOutputSha256: string;
  readonly bootstrapStage: string;
  readonly providers: readonly string[];
  readonly receiptCid: string;
}

function fail(message: string): never { throw new CidOracleError(message); }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label}: 未知/缺失字段 actual=${actual.join(",")} expected=${wanted.join(",")}`);
  }
}

function exactMapKeyOrder(rows: ReadonlyMap<string, string>, expected: readonly string[], label: string): void {
  const actual = [...rows.keys()];
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label}: 字段顺序/集合不 canonical`);
}

function stringField(value: Record<string, unknown>, key: string, label: string): string {
  const out = value[key];
  if (typeof out !== "string" || out.length === 0 || out.trim() !== out || /[\x00-\x1f\x7f]/.test(out)) fail(`${label}.${key}: 非 canonical 文本`);
  return out;
}

function uintField(value: Record<string, unknown>, key: string, label: string): number {
  const out = value[key];
  if (!Number.isSafeInteger(out) || (out as number) < 0) fail(`${label}.${key}: 非 uint`);
  return out as number;
}

function hex32(value: string, label: string, allowZero = false): string {
  if (!HEX32.test(value) || (!allowZero && value === "0".repeat(64))) fail(`${label}: 非法 SHA-256`);
  return value;
}

function canonicalRelativePath(value: string, label: string): string {
  if (value.length === 0 || value.startsWith("/") || (value.length >= 3 && value[1] === ":" && value[2] === "/") || value.includes("\\")) fail(`${label}: 非相对 canonical path`);
  for (let index = 0; index < value.length; index += 1) { const code = value.charCodeAt(index); if (code < 32 || code === 127 || value[index] === " ") fail(`${label}: 非 canonical path 字节`); }
  const parts = value.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) fail(`${label}: 非 canonical path segment`);
  return value;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("canonical JSON: 只接受安全整数");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isRecord(value)) fail("canonical JSON: 非法值");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function tarOctal(field: Buffer, label: string): number {
  let start = 0; let end = field.length;
  while (start < end && (field[start] === 0 || field[start] === 0x20)) start += 1;
  while (end > start && (field[end - 1] === 0 || field[end - 1] === 0x20)) end -= 1;
  if (start === end) fail(`${label}: non-canonical octal`);
  let value = 0;
  for (let index = start; index < end; index += 1) {
    const byte = field[index];
    if (byte < 0x30 || byte > 0x37) fail(`${label}: non-canonical octal`);
    value = value * 8 + byte - 0x30;
    if (!Number.isSafeInteger(value)) fail(`${label}: octal overflow`);
  }
  return value;
}

function tarText(field: Buffer, label: string, allowEmpty: boolean): string {
  const nul = field.indexOf(0);
  const raw = nul < 0 ? field : field.subarray(0, nul);
  if (nul >= 0 && field.subarray(nul).some((byte) => byte !== 0)) fail(`${label}: non-zero bytes after terminator`);
  if (raw.length === 0 && allowEmpty) return "";
  let value = "";
  try { value = new TextDecoder("utf-8", {fatal: true}).decode(raw); } catch { fail(`${label}: non-UTF-8`); }
  if (value.length === 0) fail(`${label}: empty`);
  return value;
}

function requireCanonicalTarOctal(field: Buffer, value: number, digits: number, suffix: string, label: string): void {
  const encoded = Buffer.from(`${value.toString(8).padStart(digits, "0")}${suffix}`, "binary");
  if (encoded.length !== field.length || !field.equals(encoded)) fail(`${label}: non-canonical octal encoding`);
}

export function canonicalUstarFiles(raw: Buffer, label: string): ReadonlyMap<string, Buffer> {
  const blockSize = 512; const recordSize = blockSize * 20;
  if (raw.length < recordSize || raw.length % recordSize !== 0) fail(`${label}: non-block-aligned USTAR`);
  const files = new Map<string, Buffer>(); let offset = 0; let prior = Buffer.alloc(0);
  while (offset < raw.length) {
    const header = raw.subarray(offset, offset + blockSize);
    if (header.every((byte) => byte === 0)) {
      const expectedLength = Math.ceil((offset + blockSize * 2) / recordSize) * recordSize;
      if (raw.length !== expectedLength || raw.subarray(offset).some((byte) => byte !== 0)) fail(`${label}: non-canonical end records`);
      return files;
    }
    if (!header.subarray(257, 263).equals(Buffer.from("ustar\0")) || !header.subarray(263, 265).equals(Buffer.from("00"))) fail(`${label}: not POSIX USTAR`);
    if (header[156] !== 0x30) fail(`${label}: non-regular USTAR member`);
    if (header.subarray(157, 257).some((byte) => byte !== 0)) fail(`${label}: link target on regular member`);
    if (header.subarray(265, 329).some((byte) => byte !== 0) || header.subarray(500, 512).some((byte) => byte !== 0)) fail(`${label}: non-canonical USTAR identity metadata`);
    const storedChecksum = tarOctal(header.subarray(148, 156), `${label} checksum`);
    requireCanonicalTarOctal(header.subarray(148, 156), storedChecksum, 6, "\0 ", `${label} checksum`);
    let actualChecksum = 8 * 0x20;
    for (let index = 0; index < 148; index += 1) actualChecksum += header[index];
    for (let index = 156; index < blockSize; index += 1) actualChecksum += header[index];
    if (storedChecksum !== actualChecksum) fail(`${label}: USTAR checksum`);
    const mode = tarOctal(header.subarray(100, 108), `${label} mode`); const uid = tarOctal(header.subarray(108, 116), `${label} uid`); const gid = tarOctal(header.subarray(116, 124), `${label} gid`); const size = tarOctal(header.subarray(124, 136), `${label} size`); const mtime = tarOctal(header.subarray(136, 148), `${label} mtime`); const deviceMajor = tarOctal(header.subarray(329, 337), `${label} device major`); const deviceMinor = tarOctal(header.subarray(337, 345), `${label} device minor`);
    requireCanonicalTarOctal(header.subarray(100, 108), mode, 7, "\0", `${label} mode`); requireCanonicalTarOctal(header.subarray(108, 116), uid, 7, "\0", `${label} uid`); requireCanonicalTarOctal(header.subarray(116, 124), gid, 7, "\0", `${label} gid`); requireCanonicalTarOctal(header.subarray(124, 136), size, 11, "\0", `${label} size`); requireCanonicalTarOctal(header.subarray(136, 148), mtime, 11, "\0", `${label} mtime`); requireCanonicalTarOctal(header.subarray(329, 337), deviceMajor, 7, "\0", `${label} device major`); requireCanonicalTarOctal(header.subarray(337, 345), deviceMinor, 7, "\0", `${label} device minor`);
    if (mode !== 0o600 || uid !== 0 || gid !== 0 || mtime !== 0 || deviceMajor !== 0 || deviceMinor !== 0) fail(`${label}: non-canonical USTAR metadata`);
    const name = tarText(header.subarray(0, 100), `${label} name`, false); const prefix = tarText(header.subarray(345, 500), `${label} prefix`, true); const path = canonicalRelativePath(prefix ? `${prefix}/${name}` : name, `${label} path`); const encoded = Buffer.from(path, "utf8");
    if (files.size > 0 && Buffer.compare(encoded, prior) <= 0) fail(`${label}: members not strictly byte sorted`);
    prior = encoded;
    const dataOffset = offset + blockSize; const dataEnd = dataOffset + size; const paddedEnd = dataOffset + Math.ceil(size / blockSize) * blockSize;
    if (!Number.isSafeInteger(dataEnd) || !Number.isSafeInteger(paddedEnd) || dataEnd > raw.length || paddedEnd > raw.length) fail(`${label}: short member`);
    if (raw.subarray(dataEnd, paddedEnd).some((byte) => byte !== 0)) fail(`${label}: non-zero member padding`);
    if (files.has(path)) fail(`${label}: duplicate member`);
    files.set(path, Buffer.from(raw.subarray(dataOffset, dataEnd)));
    offset = paddedEnd;
  }
  fail(`${label}: missing USTAR end records`);
}

export function assertCanonicalUstarFilesEqual(raw: Buffer, expected: ReadonlyMap<string, Buffer>, label: string): void {
  const actual = canonicalUstarFiles(raw, label);
  if (actual.size !== expected.size) fail(`${label}: unbound/missing payload files`);
  for (const [path, expectedRaw] of expected) {
    const actualRaw = actual.get(path);
    if (actualRaw === undefined || !actualRaw.equals(expectedRaw)) fail(`${label}: raw payload mismatch ${path}`);
  }
}

interface CaseImageLayerMember { readonly kind: "directory" | "file"; readonly mode: number; readonly raw: Buffer; }

export function canonicalCaseImageLayerMembers(raw: Buffer, label: string): ReadonlyMap<string, CaseImageLayerMember> {
  const blockSize = 512;
  if (raw.length < blockSize * 2 || raw.length % blockSize !== 0) fail(`${label}: non-block-aligned layer`);
  const members = new Map<string, CaseImageLayerMember>(); let offset = 0; let prior = Buffer.alloc(0);
  while (offset < raw.length) {
    const header = raw.subarray(offset, offset + blockSize);
    if (header.every((byte) => byte === 0)) {
      if (raw.length !== offset + blockSize * 2 || raw.subarray(offset).some((byte) => byte !== 0)) fail(`${label}: non-canonical layer end records`);
      return members;
    }
    if (!header.subarray(257, 263).equals(Buffer.from("ustar\0")) || !header.subarray(263, 265).equals(Buffer.from("00"))) fail(`${label}: not POSIX USTAR`);
    const kind = header[156] === 0x30 ? "file" : header[156] === 0x35 ? "directory" : undefined;
    if (kind === undefined || header.subarray(157, 257).some((byte) => byte !== 0)) fail(`${label}: invalid member type/link`);
    if (header.subarray(265, 329).some((byte) => byte !== 0) || header.subarray(500, 512).some((byte) => byte !== 0)) fail(`${label}: non-canonical identity metadata`);
    const storedChecksum = tarOctal(header.subarray(148, 156), `${label} checksum`); requireCanonicalTarOctal(header.subarray(148, 156), storedChecksum, 6, "\0 ", `${label} checksum`); let actualChecksum = 8 * 0x20; for (let index = 0; index < 148; index += 1) actualChecksum += header[index]; for (let index = 156; index < blockSize; index += 1) actualChecksum += header[index]; if (storedChecksum !== actualChecksum) fail(`${label}: USTAR checksum`);
    const mode = tarOctal(header.subarray(100, 108), `${label} mode`); const uid = tarOctal(header.subarray(108, 116), `${label} uid`); const gid = tarOctal(header.subarray(116, 124), `${label} gid`); const size = tarOctal(header.subarray(124, 136), `${label} size`); const mtime = tarOctal(header.subarray(136, 148), `${label} mtime`); const deviceMajor = tarOctal(header.subarray(329, 337), `${label} device major`); const deviceMinor = tarOctal(header.subarray(337, 345), `${label} device minor`);
    requireCanonicalTarOctal(header.subarray(100, 108), mode, 7, "\0", `${label} mode`); requireCanonicalTarOctal(header.subarray(108, 116), uid, 7, "\0", `${label} uid`); requireCanonicalTarOctal(header.subarray(116, 124), gid, 7, "\0", `${label} gid`); requireCanonicalTarOctal(header.subarray(124, 136), size, 11, "\0", `${label} size`); requireCanonicalTarOctal(header.subarray(136, 148), mtime, 11, "\0", `${label} mtime`); requireCanonicalTarOctal(header.subarray(329, 337), deviceMajor, 7, "\0", `${label} device major`); requireCanonicalTarOctal(header.subarray(337, 345), deviceMinor, 7, "\0", `${label} device minor`);
    if (uid !== 0 || gid !== 0 || mtime !== 0 || deviceMajor !== 0 || deviceMinor !== 0 || (kind === "directory" && size !== 0)) fail(`${label}: non-canonical member metadata`);
    const name = tarText(header.subarray(0, 100), `${label} name`, false); const prefix = tarText(header.subarray(345, 500), `${label} prefix`, true); const headerPath = prefix ? `${prefix}/${name}` : name; if ((kind === "directory") !== headerPath.endsWith("/")) fail(`${label}: member path/type terminator`); const path = canonicalRelativePath(kind === "directory" ? headerPath.slice(0, -1) : headerPath, `${label} path`); const encoded = Buffer.from(path, "utf8"); if (members.size > 0 && Buffer.compare(encoded, prior) <= 0) fail(`${label}: members not strictly byte sorted`); prior = encoded;
    const dataOffset = offset + blockSize; const dataEnd = dataOffset + size; const paddedEnd = dataOffset + Math.ceil(size / blockSize) * blockSize; if (!Number.isSafeInteger(dataEnd) || !Number.isSafeInteger(paddedEnd) || dataEnd > raw.length || paddedEnd > raw.length) fail(`${label}: short member`); if (raw.subarray(dataEnd, paddedEnd).some((byte) => byte !== 0)) fail(`${label}: non-zero member padding`);
    members.set(path, {kind, mode, raw: Buffer.from(raw.subarray(dataOffset, dataEnd))}); offset = paddedEnd;
  }
  fail(`${label}: missing layer end records`);
}

function parseDockerCompactJson(raw: Buffer, label: string): Record<string, unknown> {
  let text = ""; let value: unknown;
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(raw); value = JSON.parse(text); } catch { fail(`${label}: invalid JSON`); }
  if (!isRecord(value)) fail(`${label}: not object`);
  const normalized = text.replaceAll("\\u003c", "<").replaceAll("\\u003e", ">").replaceAll("\\u0026", "&").replaceAll("\\u2028", " ").replaceAll("\\u2029", " ");
  if (JSON.stringify(value) !== normalized) fail(`${label}: non-compact/duplicate JSON`);
  return value;
}

function parseDockerPrettyJson(raw: Buffer, label: string): Record<string, unknown> {
  let text = ""; let value: unknown;
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(raw); value = JSON.parse(text); } catch { fail(`${label}: invalid JSON`); }
  if (!isRecord(value)) fail(`${label}: not object`);
  const normalized = text.replaceAll("\\u003c", "<").replaceAll("\\u003e", ">").replaceAll("\\u0026", "&").replaceAll("\\u2028", " ").replaceAll("\\u2029", " ");
  if (JSON.stringify(value, null, 4) !== normalized) fail(`${label}: non-pretty/duplicate JSON`);
  return value;
}

export function verifyCaseImageRawObjectChain(ociManifestRaw: Buffer, configRaw: Buffer, compressedLayerRaw: Buffer, layerRaw: Buffer, layerCount: number, label: string): {imageId: string; config: Record<string, unknown>} {
  let decompressedLayer: Buffer;
  try { decompressedLayer = gunzipSync(compressedLayerRaw); } catch { fail(`${label}: invalid final-layer gzip`); }
  if (!decompressedLayer.equals(layerRaw)) fail(`${label}: compressed/uncompressed final layer mismatch`);
  const ociManifest = parseDockerPrettyJson(ociManifestRaw, `${label} OCI manifest`); exactKeys(ociManifest, ["config", "layers", "mediaType", "schemaVersion"], `${label} OCI manifest`); const configDescriptor = ociManifest.config; const layerDescriptors = ociManifest.layers; const expectedConfigDescriptor = {digest: `sha256:${sha256(configRaw)}`, mediaType: "application/vnd.oci.image.config.v1+json", size: configRaw.length}; const expectedFinalLayerDescriptor = {digest: `sha256:${sha256(compressedLayerRaw)}`, mediaType: "application/vnd.oci.image.layer.v1.tar+gzip", size: compressedLayerRaw.length};
  if (ociManifest.schemaVersion !== 2 || ociManifest.mediaType !== "application/vnd.oci.image.manifest.v1+json" || canonicalJson(configDescriptor) !== canonicalJson(expectedConfigDescriptor) || !Number.isSafeInteger(layerCount) || layerCount <= 0 || !Array.isArray(layerDescriptors) || layerDescriptors.length !== layerCount || canonicalJson(layerDescriptors[layerDescriptors.length - 1]) !== canonicalJson(expectedFinalLayerDescriptor)) fail(`${label}: OCI descriptor binding`);
  return {imageId: `sha256:${sha256(ociManifestRaw)}`, config: parseDockerCompactJson(configRaw, `${label} config`)};
}

function parseArtifactRef(value: unknown, label: string): ArtifactRef {
  if (!isRecord(value)) fail(`${label}: 非 object`);
  exactKeys(value, ["path", "raw_byte_length", "sha256"], label);
  return {
    path: canonicalRelativePath(stringField(value, "path", label), `${label}.path`),
    raw_byte_length: uintField(value, "raw_byte_length", label),
    sha256: hex32(stringField(value, "sha256", label), `${label}.sha256`),
  };
}

function parseModuleRefs(value: unknown, label: string): SourceModuleRef[] {
  if (!Array.isArray(value)) fail(`${label}: 非 array`);
  const out: SourceModuleRef[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (!isRecord(item)) fail(`${label}[${i}]: 非 object`);
    exactKeys(item, ["module_path", "source"], `${label}[${i}]`);
    const modulePath = canonicalModulePath(stringField(item, "module_path", `${label}[${i}]`));
    if (i > 0 && Buffer.compare(Buffer.from(out[i - 1].module_path), Buffer.from(modulePath)) >= 0) fail(`${label}: module path 非严格排序`);
    out.push({module_path: modulePath, source: parseArtifactRef(item.source, `${label}[${i}].source`)});
  }
  return out;
}

function parseClosureFileRefs(value: unknown, label: string): ClosureFileRef[] {
  if (!Array.isArray(value) || value.length === 0) fail(`${label}: 非空 array required`); const out: ClosureFileRef[] = [];
  for (let i = 0; i < value.length; i += 1) { const item = value[i]; if (!isRecord(item)) fail(`${label}[${i}]: 非 object`); exactKeys(item, ["artifact", "logical_path"], `${label}[${i}]`); const logicalPath = canonicalRelativePath(stringField(item, "logical_path", `${label}[${i}]`), `${label}[${i}].logical_path`); if (i > 0 && Buffer.compare(Buffer.from(out[i - 1].logical_path), Buffer.from(logicalPath)) >= 0) fail(`${label}: logical path 非严格排序`); out.push({logical_path: logicalPath, artifact: parseArtifactRef(item.artifact, `${label}[${i}].artifact`)}); }
  return out;
}

const ALLOWED_ARTIFACT_ROLES = new Set([
  "artifact_manifest", "stdout", "stderr", "cgroup_input_manifest", "cgroup_audit_before", "cgroup_audit_after", "cgroup_container_before", "cgroup_container_after", "cgroup_container_final", "cgroup_control_transcript", "cgroup_receipt", "case_binding",
  "source_receipt", "csg_sidecar", "semantic_receipt", "binding_report", "compile_receipt", "output", "consume_receipt",
  "zero_entry_source", "zero_entry_source_receipt", "zero_entry_stdout", "zero_entry_stderr", "zero_entry_trace",
  "missing_probe_stdout", "missing_probe_stderr", "missing_probe_trace",
  "consume_first_plan_before", "consume_first_graph_before", "consume_first_output_before", "consume_first_plan_after", "consume_first_output_after", "consume_first_graph_after", "consume_first_stdout", "consume_first_stderr",
  "consume_second_plan_before", "consume_second_graph_before", "consume_second_output_before", "consume_second_plan_after", "consume_second_graph_after", "consume_second_output_after", "consume_second_stdout", "consume_second_stderr",
  "consume_rehash_plan_before", "consume_rehash_graph_before", "consume_rehash_output_before", "consume_rehash_plan_after", "consume_rehash_graph_after", "consume_rehash_output_after", "consume_rehash_stdout", "consume_rehash_stderr", "consume_trace",
  "migration_evidence", "migration_proof", "baseline_csg", "migrated_csg", "baseline_surface", "migrated_surface", "baseline_semantic", "migrated_semantic",
  "root_b_migration_evidence", "root_b_migration_proof", "root_b_baseline_csg", "root_b_migrated_csg", "root_b_baseline_surface", "root_b_migrated_surface", "root_b_baseline_semantic", "root_b_migrated_semantic",
  "mirror_bundle", "mirror_install", "mirror_idempotent_install", "root_b_mirror_bundle", "root_b_mirror_install", "mirror_conflict_stdout", "mirror_conflict_stderr", "mirror_conflict_tree", "mirror_tamper_stdout", "mirror_tamper_stderr", "mirror_tampered_tree", "mirror_partial_scan", "mirror_atomic_trace", "managed_dependency_receipt", "universe_manifest", "compiler_snapshot", "std_snapshot", "runtime_snapshot", "world_head", "world_envelope",
]);

export const CID_CGROUP_ARTIFACT_ROLES = [
  "artifact_manifest", "cgroup_audit_after", "cgroup_audit_after_stderr", "cgroup_audit_before", "cgroup_audit_before_stderr", "cgroup_audit_during", "cgroup_audit_during_stderr",
  "cgroup_cleanup_audit", "cgroup_cleanup_audit_stderr", "cgroup_colima_status", "cgroup_colima_status_stderr", "cgroup_config", "cgroup_container_create_stderr", "cgroup_container_after", "cgroup_container_before", "cgroup_container_final", "cgroup_container_remove_stderr",
  "cgroup_control_env", "cgroup_control_stderr", "cgroup_control_transcript", "cgroup_docker_info", "cgroup_docker_info_stderr", "cgroup_docker_version", "cgroup_docker_version_stderr",
  "cgroup_gate_runner", "cgroup_image_inspect", "cgroup_image_inspect_stderr", "cgroup_input_manifest", "cgroup_native_descriptor", "cgroup_receipt_validator", "stderr", "stdout", "cgroup_receipt",
] as const;
const CGROUP_ARTIFACT_ROLES = CID_CGROUP_ARTIFACT_ROLES;

for (const role of CGROUP_ARTIFACT_ROLES) ALLOWED_ARTIFACT_ROLES.add(role);

const CGROUP_ROLE_FILE: Readonly<Record<string, string>> = Object.freeze({
  cgroup_audit_after: "audit-after.json", cgroup_audit_after_stderr: "audit-after.stderr.bin", cgroup_audit_before: "audit-before.json", cgroup_audit_before_stderr: "audit-before.stderr.bin", cgroup_audit_during: "audit-during.json", cgroup_audit_during_stderr: "audit-during.stderr.bin",
  cgroup_cleanup_audit: "cleanup-audit.json", cgroup_cleanup_audit_stderr: "cleanup-audit.stderr.bin",
  cgroup_colima_status: "colima-status.txt", cgroup_colima_status_stderr: "colima-status.txt.stderr.bin", cgroup_config: "config.json", cgroup_container_create_stderr: "container-create.stderr.bin",
  cgroup_container_after: "container-inspect-after.json", cgroup_container_before: "container-inspect-before.json", cgroup_container_final: "container-inspect-final.json", cgroup_container_remove_stderr: "container-remove.stderr.bin",
  cgroup_control_env: "control-env.json", cgroup_control_stderr: "control-stderr.bin", cgroup_control_transcript: "control-transcript.json", cgroup_docker_info: "docker-info.json",
  cgroup_docker_info_stderr: "docker-info.json.stderr.bin", cgroup_docker_version: "docker-version.json", cgroup_docker_version_stderr: "docker-version.json.stderr.bin",
  cgroup_gate_runner: "gate-runner.py", cgroup_image_inspect: "image-inspect.json", cgroup_image_inspect_stderr: "image-inspect.json.stderr.bin", cgroup_input_manifest: "input-manifest.json",
  cgroup_native_descriptor: "native-descriptor.kv", cgroup_receipt_validator: "receipt-validator.py", stderr: "stderr.bin", stdout: "stdout.bin",
});

function parseCgroupRunRefs(value: unknown, label: string): CgroupRunRefs {
  if (!isRecord(value)) fail(`${label}: 非 object`);
  exactKeys(value, ["artifacts"], label);
  const artifacts = value.artifacts;
  if (!isRecord(artifacts)) fail(`${label}.artifacts: 非 object`);
  exactKeys(artifacts, CGROUP_ARTIFACT_ROLES, `${label}.artifacts`);
  return {artifacts: Object.fromEntries(CGROUP_ARTIFACT_ROLES.map((role) => [role, parseArtifactRef(artifacts[role], `${label}.artifacts.${role}`)]))};
}

function parseCase(value: unknown, index: number): EvidenceCase {
  const label = `cases[${index}]`;
  if (!isRecord(value)) fail(`${label}: 非 object`);
  exactKeys(value, ["artifacts", "bootstrap_stage", "case_id", "entry_module_path", "kind", "legacy_modules", "migrated_modules", "modules", "package_id", "providers", "root_b_legacy_modules", "root_b_migrated_modules", "target"], label);
  const artifactsValue = value.artifacts;
  if (!isRecord(artifactsValue)) fail(`${label}.artifacts: 非 object`);
  const artifacts: Record<string, ArtifactRef> = {};
  for (const role of Object.keys(artifactsValue).sort()) {
    if (!ALLOWED_ARTIFACT_ROLES.has(role)) fail(`${label}.artifacts: 未知 role ${role}`);
    artifacts[role] = parseArtifactRef(artifactsValue[role], `${label}.artifacts.${role}`);
  }
  const kind = stringField(value, "kind", label) as CaseKind;
  if (!EXACT_CASE_KINDS.includes(kind)) fail(`${label}.kind: 未知 case`);
  const actualRoles = Object.keys(artifacts).sort(); const expectedRoles = requiredRoles(kind).sort();
  if (actualRoles.length !== expectedRoles.length || actualRoles.some((role, roleIndex) => role !== expectedRoles[roleIndex])) fail(`${label}.artifacts: role 集不精确 actual=${actualRoles.join(",")} expected=${expectedRoles.join(",")}`);
  const providersRaw = value.providers;
  if (!Array.isArray(providersRaw)) fail(`${label}.providers: 非 array`);
  const providers = providersRaw.map((item, providerIndex) => {
    if (typeof item !== "string" || item.length === 0 || item.trim() !== item) fail(`${label}.providers[${providerIndex}]`);
    if (providerIndex > 0 && Buffer.compare(Buffer.from(providersRaw[providerIndex - 1] as string), Buffer.from(item)) >= 0) fail(`${label}.providers: 非严格排序`);
    return item;
  });
  const legacyModules = parseModuleRefs(value.legacy_modules, `${label}.legacy_modules`); const migratedModules = parseModuleRefs(value.migrated_modules, `${label}.migrated_modules`); const modules = parseModuleRefs(value.modules, `${label}.modules`); const rootBLegacyModules = parseModuleRefs(value.root_b_legacy_modules, `${label}.root_b_legacy_modules`); const rootBMigratedModules = parseModuleRefs(value.root_b_migrated_modules, `${label}.root_b_migrated_modules`);
  const migrationCase = kind === "migration_cross_root_fixed_point" || kind === "mirror_atomic_install";
  if (modules.length === 0 && kind !== "migration_cross_root_fixed_point") fail(`${label}: source modules 为空`);
  if (migrationCase ? (legacyModules.length === 0 || migratedModules.length === 0 || rootBLegacyModules.length === 0 || rootBMigratedModules.length === 0) : (legacyModules.length !== 0 || migratedModules.length !== 0 || rootBLegacyModules.length !== 0 || rootBMigratedModules.length !== 0)) fail(`${label}: migration/root-B module 集不精确`);
  return {
    artifacts,
    bootstrap_stage: stringField(value, "bootstrap_stage", label),
    case_id: stringField(value, "case_id", label),
    entry_module_path: canonicalModulePath(stringField(value, "entry_module_path", label)),
    kind,
    legacy_modules: legacyModules,
    migrated_modules: migratedModules,
    modules,
    package_id: canonicalPackageId(stringField(value, "package_id", label)),
    providers,
    root_b_legacy_modules: rootBLegacyModules,
    root_b_migrated_modules: rootBMigratedModules,
    target: stringField(value, "target", label),
  };
}

export function parseEvidenceManifest(raw: Buffer): EvidenceManifest {
  const text = new TextDecoder("utf-8", {fatal: true}).decode(raw);
  if (!text.endsWith("\n") || text.endsWith("\n\n")) fail("CID evidence manifest: 必须单 terminal newline");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { fail("CID evidence manifest: 非法 JSON"); }
  if (!isRecord(parsed)) fail("CID evidence manifest: 非 object");
  exactKeys(parsed, ["candidate", "candidate_build", "candidate_entry_module_path", "candidate_entry_path", "candidate_entry_sha256", "cases", "cgroup_counterexample", "evidence_kind", "image_build_receipt", "image_config", "image_final_layer", "image_final_layer_gzip", "image_manifest", "image_oci_manifest", "manifest_sha256", "mutation_replay", "schema", "source_files", "source_manifest", "tool_files", "tool_manifest"], "CID evidence manifest");
  if (canonicalJson(parsed) + "\n" !== text) fail("CID evidence manifest: 非 canonical JSON/字段顺序");
  if (parsed.schema !== CID_EVIDENCE_SCHEMA || parsed.evidence_kind !== "production") fail("CID evidence manifest: 只接受 production 无版本 schema");
  const claimed = hex32(stringField(parsed, "manifest_sha256", "CID evidence manifest"), "manifest_sha256");
  const entry = officialEntrySpec(
    parsed.candidate_entry_path,
    parsed.candidate_entry_module_path,
    "CID evidence manifest",
  );
  const candidateEntrySha256 = hex32(
    stringField(parsed, "candidate_entry_sha256", "CID evidence manifest"),
    "candidate_entry_sha256",
  );
  const projection = {...parsed}; delete projection.manifest_sha256;
  if (sha256(Buffer.from(canonicalJson(projection), "utf8")) !== claimed) fail("CID evidence manifest: manifest_sha256 不匹配");
  if (!Array.isArray(parsed.cases)) fail("CID evidence manifest: cases 非 array");
  const cases = parsed.cases.map(parseCase);
  const kinds = cases.map((item) => item.kind);
  if (kinds.length !== EXACT_CASE_KINDS.length || EXACT_CASE_KINDS.some((kind, index) => kinds[index] !== kind)) fail("CID evidence manifest: 六例必须精确按冻结顺序出现一次");
  const ids = new Set(cases.map((item) => item.case_id));
  if (ids.size !== cases.length) fail("CID evidence manifest: case_id 重复");
  const candidate = parseArtifactRef(parsed.candidate, "candidate"); const candidateBuild = parseCgroupRunRefs(parsed.candidate_build, "candidate_build"); const cgroupCounterexample = parseCgroupRunRefs(parsed.cgroup_counterexample, "cgroup_counterexample"); const imageBuildReceipt = parseArtifactRef(parsed.image_build_receipt, "image_build_receipt"); const imageConfig = parseArtifactRef(parsed.image_config, "image_config"); const imageFinalLayer = parseArtifactRef(parsed.image_final_layer, "image_final_layer"); const imageFinalLayerGzip = parseArtifactRef(parsed.image_final_layer_gzip, "image_final_layer_gzip"); const imageManifest = parseArtifactRef(parsed.image_manifest, "image_manifest"); const imageOciManifest = parseArtifactRef(parsed.image_oci_manifest, "image_oci_manifest"); const mutationReplay = parseArtifactRef(parsed.mutation_replay, "mutation_replay"); const sourceManifest = parseArtifactRef(parsed.source_manifest, "source_manifest"); const sourceFiles = parseClosureFileRefs(parsed.source_files, "source_files"); const toolManifest = parseArtifactRef(parsed.tool_manifest, "tool_manifest"); const toolFiles = parseClosureFileRefs(parsed.tool_files, "tool_files");
  const paths = new Map<string, string>(); const bindPath = (ref: ArtifactRef, role: string) => { const prior = paths.get(ref.path); if (prior !== undefined) fail(`CID evidence manifest: artifact path role alias ${ref.path} (${prior},${role})`); paths.set(ref.path, role); };
  bindPath(candidate, "candidate"); bindPath(imageBuildReceipt, "image_build_receipt"); bindPath(imageConfig, "image_config"); bindPath(imageFinalLayer, "image_final_layer"); bindPath(imageFinalLayerGzip, "image_final_layer_gzip"); bindPath(imageManifest, "image_manifest"); bindPath(imageOciManifest, "image_oci_manifest"); bindPath(mutationReplay, "mutation_replay"); bindPath(sourceManifest, "source_manifest"); bindPath(toolManifest, "tool_manifest");
  for (const [role, ref] of Object.entries(candidateBuild.artifacts)) bindPath(ref, `candidate_build.${role}`);
  for (const [role, ref] of Object.entries(cgroupCounterexample.artifacts)) bindPath(ref, `cgroup_counterexample.${role}`);
  sourceFiles.forEach((entry, index) => bindPath(entry.artifact, `source_files[${index}]`)); toolFiles.forEach((entry, index) => bindPath(entry.artifact, `tool_files[${index}]`));
  for (const item of cases) {
    for (const [role, ref] of Object.entries(item.artifacts)) bindPath(ref, `${item.case_id}.artifacts.${role}`);
    for (const [group, refs] of [["modules", item.modules], ["legacy_modules", item.legacy_modules], ["migrated_modules", item.migrated_modules], ["root_b_legacy_modules", item.root_b_legacy_modules], ["root_b_migrated_modules", item.root_b_migrated_modules]] as const) refs.forEach((module, index) => bindPath(module.source, `${item.case_id}.${group}[${index}]`));
  }
  return {candidate, candidate_build: candidateBuild, candidate_entry_path: entry.path, candidate_entry_module_path: entry.modulePath, candidate_entry_sha256: candidateEntrySha256, cases, cgroup_counterexample: cgroupCounterexample, evidence_kind: "production", image_build_receipt: imageBuildReceipt, image_config: imageConfig, image_final_layer: imageFinalLayer, image_final_layer_gzip: imageFinalLayerGzip, image_manifest: imageManifest, image_oci_manifest: imageOciManifest, manifest_sha256: claimed, mutation_replay: mutationReplay, schema: CID_EVIDENCE_SCHEMA, source_files: sourceFiles, source_manifest: sourceManifest, tool_files: toolFiles, tool_manifest: toolManifest};
}

class EvidenceFiles {
  readonly root: string;
  readonly rootReal: string;
  constructor(root: string) {
    this.root = resolve(root);
    const stat = lstatSync(this.root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail("evidence root: 必须是真实目录");
    this.rootReal = realpathSync(this.root);
  }

  resolvePath(relativePath: string): string {
    canonicalRelativePath(relativePath, "artifact.path");
    const path = resolve(this.root, relativePath);
    const rel = relative(this.root, path);
    if (rel.startsWith(`..${sep}`) || rel === ".." || rel.startsWith(sep)) fail("artifact.path: escaped evidence root");
    let cursor = this.root;
    for (const part of relativePath.split("/")) {
      cursor = join(cursor, part);
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink()) fail(`artifact.path: symlink ${relativePath}`);
    }
    const real = realpathSync(path);
    if (real !== this.rootReal && !real.startsWith(`${this.rootReal}${sep}`)) fail("artifact.path: realpath escaped evidence root");
    return path;
  }

  read(ref: ArtifactRef, label: string): Buffer {
    const path = this.resolvePath(ref.path);
    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
    const fd = openSync(path, flags);
    try {
      const before = fstatSync(fd, {bigint: true});
      if (!before.isFile() || before.nlink !== 1n || before.size !== BigInt(ref.raw_byte_length)) fail(`${label}: 文件类型/链接数/长度不匹配`);
      const raw = readFileSync(fd);
      const after = fstatSync(fd, {bigint: true});
      const rebound = lstatSync(path, {bigint: true});
      if (rebound.isSymbolicLink() || !rebound.isFile() || rebound.nlink !== 1n || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || after.dev !== rebound.dev || after.ino !== rebound.ino) fail(`${label}: 读取期间改变/路径换绑`);
      if (raw.length !== ref.raw_byte_length || sha256(raw) !== ref.sha256) fail(`${label}: 原始长度/SHA-256 不匹配`);
      return raw;
    } finally { closeSync(fd); }
  }

  readPath(relativePath: string, label: string): Buffer {
    const path = this.resolvePath(relativePath);
    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
    const fd = openSync(path, flags);
    try {
      const before = fstatSync(fd, {bigint: true});
      if (!before.isFile() || before.nlink !== 1n) fail(`${label}: 非单链接普通文件`);
      const raw = readFileSync(fd);
      const after = fstatSync(fd, {bigint: true});
      const rebound = lstatSync(path, {bigint: true});
      if (rebound.isSymbolicLink() || !rebound.isFile() || rebound.nlink !== 1n || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || after.dev !== rebound.dev || after.ino !== rebound.ino || raw.length !== Number(before.size)) fail(`${label}: 读取期间改变/路径换绑`);
      return raw;
    } finally { closeSync(fd); }
  }
}

function parseMirrorBundle(raw: Buffer): ManagedMirrorBundle {
  const rows = parseUniqueKv(raw, "managed mirror bundle");
  const get = (key: string) => { const value = rows.get(key); if (value === undefined) fail(`managed mirror bundle: 缺 ${key}`); return value; };
  const unitCountRaw = get("unit_count");
  if (!UINT.test(unitCountRaw) || Number(unitCountRaw) <= 0) fail("managed mirror bundle: unit_count");
  const unitCount = Number(unitCountRaw);
  const fixedKeys = ["channel", "package_id", "migration_proof_cid", "legacy_source_identity_receipt_cid", "migrated_source_identity_receipt_cid", "compile_semantic_receipt_cid", "unit_count", "baseline_csg_text_hex", "migrated_csg_text_hex", "baseline_surface_text_hex", "migrated_surface_text_hex", "baseline_semantic_receipt_text_hex", "migrated_semantic_receipt_text_hex", "evidence_text_hex", "proof_text_hex", "bundle_cid"];
  const expectedKeys = new Set(fixedKeys);
  for (let i = 0; i < unitCount; i += 1) for (const suffix of ["module_path", "legacy_source_raw_byte_length", "legacy_source_cid", "legacy_source_text_hex", "migrated_source_raw_byte_length", "migrated_source_cid", "migrated_source_text_hex"]) expectedKeys.add(`unit[${i}].${suffix}`);
  for (const key of rows.keys()) if (!expectedKeys.has(key)) fail(`managed mirror bundle: 未知字段 ${key}`);
  for (const key of expectedKeys) if (!rows.has(key)) fail(`managed mirror bundle: 缺 ${key}`);
  const orderedKeys = fixedKeys.slice(0, 7);
  for (let i = 0; i < unitCount; i += 1) for (const suffix of ["module_path", "legacy_source_raw_byte_length", "legacy_source_cid", "legacy_source_text_hex", "migrated_source_raw_byte_length", "migrated_source_cid", "migrated_source_text_hex"]) orderedKeys.push(`unit[${i}].${suffix}`);
  orderedKeys.push(...fixedKeys.slice(7));
  exactMapKeyOrder(rows, orderedKeys, "managed mirror bundle");
  const decode = (key: string) => {
    const value = get(key); if (!/^(?:[0-9a-f]{2})*$/.test(value)) fail(`managed mirror bundle: ${key} 非 hex`);
    return Buffer.from(value, "hex");
  };
  const units: ManagedMirrorBundle["units"][number][] = [];
  for (let i = 0; i < unitCount; i += 1) {
    const prefix = `unit[${i}].`;
    const modulePath = canonicalModulePath(get(`${prefix}module_path`));
    if (i > 0 && Buffer.compare(Buffer.from(units[i - 1].modulePath), Buffer.from(modulePath)) >= 0) fail("managed mirror bundle: unit 非严格排序");
    const legacyBytes = decode(`${prefix}legacy_source_text_hex`); const migratedBytes = decode(`${prefix}migrated_source_text_hex`);
    const legacyLength = Number(get(`${prefix}legacy_source_raw_byte_length`)); const migratedLength = Number(get(`${prefix}migrated_source_raw_byte_length`));
    if (!UINT.test(get(`${prefix}legacy_source_raw_byte_length`)) || !UINT.test(get(`${prefix}migrated_source_raw_byte_length`)) || legacyLength !== legacyBytes.length || migratedLength !== migratedBytes.length) fail("managed mirror bundle: raw length");
    const legacyCid = hex32(get(`${prefix}legacy_source_cid`), "legacy_source_cid"); const migratedCid = hex32(get(`${prefix}migrated_source_cid`), "migrated_source_cid");
    if (encoding.sourceRawCid(legacyBytes) !== legacyCid || encoding.sourceRawCid(migratedBytes) !== migratedCid) fail("managed mirror bundle: source raw CID");
    units.push({modulePath, legacyBytes, legacyCid, migratedBytes, migratedCid});
  }
  const bundle: ManagedMirrorBundle = {
    channel: get("channel"), packageId: canonicalPackageId(get("package_id")), migrationProofCid: hex32(get("migration_proof_cid"), "migration_proof_cid"),
    legacySourceIdentityReceiptCid: hex32(get("legacy_source_identity_receipt_cid"), "legacy_source_identity_receipt_cid"), migratedSourceIdentityReceiptCid: hex32(get("migrated_source_identity_receipt_cid"), "migrated_source_identity_receipt_cid"),
    compileSemanticReceiptCid: hex32(get("compile_semantic_receipt_cid"), "compile_semantic_receipt_cid"), units,
    baselineCsg: decode("baseline_csg_text_hex"), migratedCsg: decode("migrated_csg_text_hex"), baselineSurface: decode("baseline_surface_text_hex"), migratedSurface: decode("migrated_surface_text_hex"),
    baselineSemantic: decode("baseline_semantic_receipt_text_hex"), migratedSemantic: decode("migrated_semantic_receipt_text_hex"), evidence: decode("evidence_text_hex"), proof: decode("proof_text_hex"), bundleCid: hex32(get("bundle_cid"), "bundle_cid"), raw,
  };
  const parts: Buffer[] = [encoding.framedText("cheng.compiler.managed_mirror_bundle"), encoding.framedText(bundle.channel), encoding.framedText(bundle.packageId), encoding.framedFixed32(bundle.migrationProofCid, "proof"), encoding.framedFixed32(bundle.legacySourceIdentityReceiptCid, "legacy_receipt"), encoding.framedFixed32(bundle.migratedSourceIdentityReceiptCid, "migrated_receipt"), encoding.framedFixed32(bundle.compileSemanticReceiptCid, "semantic"), encoding.framedU32(bundle.units.length, "unit_count")];
  for (const unit of bundle.units) parts.push(encoding.framedText(unit.modulePath), encoding.framedU32(unit.legacyBytes.length, "legacy_length"), encoding.framedFixed32(unit.legacyCid, "legacy_cid"), encoding.framedU32(unit.migratedBytes.length, "migrated_length"), encoding.framedFixed32(unit.migratedCid, "migrated_cid"));
  // Cheng text framing is byte-count + raw bytes. Keep payloads as bytes; do not decode/re-encode.
  parts.push(...[bundle.baselineCsg, bundle.migratedCsg, bundle.baselineSurface, bundle.migratedSurface, bundle.baselineSemantic, bundle.migratedSemantic, bundle.evidence, bundle.proof].map((payload) => Buffer.concat([u32be(payload.length), payload])));
  if (encoding.hashParts(parts) !== bundle.bundleCid) fail("managed mirror bundle: CID 不匹配");
  return bundle;
}

function u32be(value: number): Buffer { const out = Buffer.alloc(4); out.writeUInt32BE(value); return out; }

function parseUniverseManifest(raw: Buffer): UniverseManifest {
  const rows = parseUniqueKv(raw, "universe manifest");
  const get = (key: string) => { const value = rows.get(key); if (value === undefined) fail(`universe manifest: 缺 ${key}`); return value; };
  const countRaw = get("entry_count"); if (!UINT.test(countRaw) || Number(countRaw) <= 0) fail("universe manifest: entry_count");
  const count = Number(countRaw); const expected = new Set(["channel", "entry_count", "managed_dependency_receipt_cid", "manifest_cid"]);
  const entries: ManifestEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    for (const suffix of ["package_id", "snapshot_cid", "syntax_surface_cid", "migration_proof_cid", "managed_mirror_bundle_cid"]) expected.add(`entry[${i}].${suffix}`);
    const prefix = `entry[${i}].`;
    const entry = {packageId: canonicalPackageId(get(`${prefix}package_id`)), snapshotCid: hex32(get(`${prefix}snapshot_cid`), "snapshot"), syntaxSurfaceCid: hex32(get(`${prefix}syntax_surface_cid`), "syntax"), migrationProofCid: hex32(get(`${prefix}migration_proof_cid`), "proof", true), managedMirrorBundleCid: hex32(get(`${prefix}managed_mirror_bundle_cid`), "mirror", true)};
    if (i > 0 && Buffer.compare(Buffer.from(entries[i - 1].packageId), Buffer.from(entry.packageId)) >= 0) fail("universe manifest: entry 非严格排序");
    if ((entry.migrationProofCid === "0".repeat(64)) !== (entry.managedMirrorBundleCid === "0".repeat(64))) fail("universe manifest: proof/mirror 不成对");
    entries.push(entry);
  }
  for (const key of rows.keys()) if (!expected.has(key)) fail(`universe manifest: 未知字段 ${key}`);
  const orderedKeys = ["channel", "entry_count", "managed_dependency_receipt_cid"];
  for (let i = 0; i < count; i += 1) for (const suffix of ["package_id", "snapshot_cid", "syntax_surface_cid", "migration_proof_cid", "managed_mirror_bundle_cid"]) orderedKeys.push(`entry[${i}].${suffix}`);
  orderedKeys.push("manifest_cid"); exactMapKeyOrder(rows, orderedKeys, "universe manifest");
  const channel = get("channel"); if (!["stable", "edge"].includes(channel)) fail("universe manifest: channel");
  const dependency = hex32(get("managed_dependency_receipt_cid"), "managed_dependency_receipt_cid", true);
  if (channel === "stable" && entries.some((entry) => entry.managedMirrorBundleCid !== "0".repeat(64)) === (dependency === "0".repeat(64))) fail("universe manifest: managed dependency receipt presence");
  const parts: Buffer[] = [encoding.framedText("cheng.compiler.universe_manifest"), encoding.framedText(channel), encoding.framedFixed32(dependency, "dependency", true), encoding.framedU32(entries.length, "entry_count")];
  for (const entry of entries) parts.push(encoding.framedText(entry.packageId), encoding.framedFixed32(entry.snapshotCid, "snapshot"), encoding.framedFixed32(entry.syntaxSurfaceCid, "syntax"), encoding.framedFixed32(entry.migrationProofCid, "proof", true), encoding.framedFixed32(entry.managedMirrorBundleCid, "mirror", true));
  const manifestCid = hex32(get("manifest_cid"), "manifest_cid");
  if (encoding.hashParts(parts) !== manifestCid) fail("universe manifest: CID 不匹配");
  return {channel, managedDependencyReceiptCid: dependency, entries, manifestCid};
}

function parsePackageSnapshot(raw: Buffer, label: string): PackageSnapshot {
  const rows = parseUniqueKv(raw, label); const keys = ["package_id", "channel", "source_bundle_cid", "csg_root_cid", "export_surface_cid", "syntax_surface_cid", "deps_manifest_cid", "migration_proof_cid", "signature", "snapshot_cid"];
  if (rows.size !== keys.length || keys.some((key) => !rows.has(key))) fail(`${label}: 未知/缺失字段`);
  exactMapKeyOrder(rows, keys, label);
  const get = (key: string) => rows.get(key)!;
  const out: PackageSnapshot = {packageId: canonicalPackageId(get("package_id")), channel: get("channel"), sourceBundleCid: hex32(get("source_bundle_cid"), `${label}.source`), csgRootCid: hex32(get("csg_root_cid"), `${label}.csg`), exportSurfaceCid: hex32(get("export_surface_cid"), `${label}.surface`), syntaxSurfaceCid: hex32(get("syntax_surface_cid"), `${label}.syntax`), depsManifestCid: hex32(get("deps_manifest_cid"), `${label}.deps`), migrationProofCid: hex32(get("migration_proof_cid"), `${label}.proof`, true), signature: get("signature"), snapshotCid: hex32(get("snapshot_cid"), `${label}.snapshot`)};
  if (!["stable", "edge"].includes(out.channel) || out.signature.length === 0) fail(`${label}: channel/signature`);
  const expected = encoding.hashParts([encoding.framedText("cheng.compiler.package_snapshot"), encoding.framedText(out.packageId), encoding.framedText(out.channel), encoding.framedFixed32(out.sourceBundleCid, "source"), encoding.framedFixed32(out.csgRootCid, "csg"), encoding.framedFixed32(out.exportSurfaceCid, "surface"), encoding.framedFixed32(out.syntaxSurfaceCid, "syntax"), encoding.framedFixed32(out.depsManifestCid, "deps"), encoding.framedFixed32(out.migrationProofCid, "proof", true), encoding.framedText(out.signature)]);
  if (expected !== out.snapshotCid) fail(`${label}: CID 不匹配`);
  return out;
}

function parseWorldHead(raw: Buffer): WorldHead {
  const rows = parseUniqueKv(raw, "world head"); const keys = ["universe_id", "channel", "head_epoch", "prev_head_cid", "manifest_root_cid", "csg_root_cid", "compiler_pkg_cid", "std_pkg_cid", "runtime_pkg_cid", "signature", "head_cid"];
  if (rows.size !== keys.length || keys.some((key) => !rows.has(key))) fail("world head: 未知/缺失字段"); const get = (key: string) => rows.get(key)!;
  exactMapKeyOrder(rows, keys, "world head");
  if (!UINT.test(get("head_epoch"))) fail("world head: head_epoch");
  const out: WorldHead = {universeId: get("universe_id"), channel: get("channel"), headEpoch: Number(get("head_epoch")), prevHeadCid: hex32(get("prev_head_cid"), "prev", true), manifestRootCid: hex32(get("manifest_root_cid"), "manifest"), csgRootCid: hex32(get("csg_root_cid"), "csg"), compilerPkgCid: hex32(get("compiler_pkg_cid"), "compiler"), stdPkgCid: hex32(get("std_pkg_cid"), "std"), runtimePkgCid: hex32(get("runtime_pkg_cid"), "runtime"), signature: get("signature"), headCid: hex32(get("head_cid"), "head")};
  if (out.universeId !== "cheng/compiler_universe" || !["stable", "edge"].includes(out.channel) || out.signature.length === 0) fail("world head: identity");
  const expected = encoding.hashParts([encoding.framedText("cheng.compiler.world_head"), encoding.framedText(out.universeId), encoding.framedText(out.channel), encoding.framedU32(out.headEpoch, "epoch"), encoding.framedFixed32(out.prevHeadCid, "prev", true), encoding.framedFixed32(out.manifestRootCid, "manifest"), encoding.framedFixed32(out.csgRootCid, "csg"), encoding.framedFixed32(out.compilerPkgCid, "compiler"), encoding.framedFixed32(out.stdPkgCid, "std"), encoding.framedFixed32(out.runtimePkgCid, "runtime"), encoding.framedText(out.signature)]);
  if (expected !== out.headCid) fail("world head: CID 不匹配"); return out;
}

export function parseCompileReceipt(raw: Buffer): CompileReceipt {
  const text = new TextDecoder("utf-8", {fatal: true}).decode(raw);
  if (text.length === 0 || text.endsWith("\n") || text.includes("\r") || text.includes("\0")) fail("compile receipt: 非 canonical wire/newline");
  const lines = text.split("\n");
  const keys = ["world_head_cid", "source_identity_receipt_cid", "semantic_receipt_cid", "target", "output_raw_sha256", "canonical_output_sha256", "bootstrap_stage", "runtime_provider_count", "receipt_cid"];
  if (lines.length < keys.length) fail("compile receipt: 字段不足");
  const values = keys.map((key, index) => { const prefix = `${key}=`; if (!lines[index].startsWith(prefix)) fail(`compile receipt: 期望 ${key}`); return lines[index].slice(prefix.length); });
  if (!UINT.test(values[7]) || lines.length !== 9 + Number(values[7])) fail("compile receipt: provider count");
  const providers = lines.slice(9).map((line, index) => { const prefix = `runtime_provider[${index}]=`; if (!line.startsWith(prefix)) fail("compile receipt: runtime provider wire/order"); return line.slice(prefix.length); });
  for (let i = 1; i < providers.length; i += 1) if (Buffer.compare(Buffer.from(providers[i - 1]), Buffer.from(providers[i])) >= 0) fail("compile receipt: provider 非严格排序");
  const out: CompileReceipt = {worldHeadCid: hex32(values[0], "world"), sourceIdentityReceiptCid: hex32(values[1], "source"), semanticReceiptCid: hex32(values[2], "semantic"), target: values[3], outputRawSha256: hex32(values[4], "output"), canonicalOutputSha256: hex32(values[5], "canonical_output"), bootstrapStage: values[6], providers, receiptCid: hex32(values[8], "receipt")};
  const parts: Buffer[] = [encoding.framedText("cheng.compiler.compile_receipt"), encoding.framedFixed32(out.worldHeadCid, "world"), encoding.framedFixed32(out.sourceIdentityReceiptCid, "source"), encoding.framedFixed32(out.semanticReceiptCid, "semantic"), encoding.framedFixed32(out.outputRawSha256, "output"), encoding.framedFixed32(out.canonicalOutputSha256, "canonical"), encoding.framedText(out.target), encoding.framedText(out.bootstrapStage), encoding.framedU32(providers.length, "provider_count"), ...providers.map((provider) => encoding.framedText(provider))];
  if (encoding.hashParts(parts) !== out.receiptCid) fail("compile receipt: CID 不匹配"); return out;
}

function parseManagedDependencyReceipt(raw: Buffer): {channel: string; entries: readonly ManifestEntry[]; receiptCid: string} {
  const rows = parseUniqueKv(raw, "managed dependency receipt"); const get = (key: string) => { const value = rows.get(key); if (value === undefined) fail(`managed dependency receipt: 缺 ${key}`); return value; };
  const countRaw = get("dependency_count"); if (!UINT.test(countRaw) || Number(countRaw) <= 0) fail("managed dependency receipt: count"); const count = Number(countRaw); const allowed = new Set(["channel", "dependency_count", "receipt_cid"]); const entries: ManifestEntry[] = [];
  for (let i = 0; i < count; i += 1) { const prefix = `dependency[${i}].`; for (const suffix of ["canonical_package_id", "snapshot_cid", "syntax_surface_cid", "migration_proof_cid", "prior_managed_mirror_bundle_cid"]) allowed.add(`${prefix}${suffix}`); const entry = {packageId: canonicalPackageId(get(`${prefix}canonical_package_id`)), snapshotCid: hex32(get(`${prefix}snapshot_cid`), "snapshot"), syntaxSurfaceCid: hex32(get(`${prefix}syntax_surface_cid`), "syntax"), migrationProofCid: hex32(get(`${prefix}migration_proof_cid`), "proof"), managedMirrorBundleCid: hex32(get(`${prefix}prior_managed_mirror_bundle_cid`), "prior mirror")}; if (i > 0 && Buffer.compare(Buffer.from(entries[i - 1].packageId), Buffer.from(entry.packageId)) >= 0) fail("managed dependency receipt: 非严格排序"); entries.push(entry); }
  for (const key of rows.keys()) if (!allowed.has(key)) fail(`managed dependency receipt: 未知字段 ${key}`);
  const orderedKeys = ["channel", "dependency_count"];
  for (let i = 0; i < count; i += 1) for (const suffix of ["canonical_package_id", "snapshot_cid", "syntax_surface_cid", "migration_proof_cid", "prior_managed_mirror_bundle_cid"]) orderedKeys.push(`dependency[${i}].${suffix}`);
  orderedKeys.push("receipt_cid"); exactMapKeyOrder(rows, orderedKeys, "managed dependency receipt");
  const channel = get("channel"); const parts: Buffer[] = [encoding.framedText("cheng.compiler.managed_dependency_receipt"), encoding.framedText(channel), encoding.framedU32(entries.length, "count")];
  for (const entry of entries) parts.push(encoding.framedText(entry.packageId), encoding.framedFixed32(entry.snapshotCid, "snapshot"), encoding.framedFixed32(entry.syntaxSurfaceCid, "syntax"), encoding.framedFixed32(entry.migrationProofCid, "proof"), encoding.framedFixed32(entry.managedMirrorBundleCid, "mirror"));
  const receiptCid = hex32(get("receipt_cid"), "receipt"); if (encoding.hashParts(parts) !== receiptCid) fail("managed dependency receipt: CID 不匹配"); return {channel, entries, receiptCid};
}

function moduleSourcePath(packageId: string, modulePath: string): string {
  const prefix = `${packageId}/`; if (!modulePath.startsWith(prefix) || modulePath.length <= prefix.length) fail("mirror module path: 不属于 package");
  return `src/${modulePath.slice(prefix.length)}.cheng`;
}

function expectedMirrorFiles(bundle: ManagedMirrorBundle): Map<string, Buffer> {
  const map = new Map<string, Buffer>(); const add = (path: string, raw: Buffer) => { if (map.has(path)) fail(`mirror: 重复 path ${path}`); map.set(path, raw); };
  const sourcePaths = bundle.units.map((unit) => moduleSourcePath(bundle.packageId, unit.modulePath));
  add("bundle.txt", bundle.raw); add("cheng-package.toml", Buffer.from(`package_id = "pkg://${bundle.packageId}"\nmodule_prefix = "${bundle.packageId.slice(bundle.packageId.lastIndexOf("/") + 1)}"\n`)); add("sources.list.txt", Buffer.from(sourcePaths.map((path) => `${path}\n`).join("")));
  for (const [path, raw] of [[".cheng-mirror/baseline.csg.txt", bundle.baselineCsg], [".cheng-mirror/migrated.csg.txt", bundle.migratedCsg], [".cheng-mirror/baseline.surface.txt", bundle.baselineSurface], [".cheng-mirror/migrated.surface.txt", bundle.migratedSurface], [".cheng-mirror/baseline.semantic_receipt.txt", bundle.baselineSemantic], [".cheng-mirror/migrated.semantic_receipt.txt", bundle.migratedSemantic], [".cheng-mirror/evidence.txt", bundle.evidence], [".cheng-mirror/proof.txt", bundle.proof]] as const) add(path, raw);
  bundle.units.forEach((unit, index) => add(sourcePaths[index], unit.migratedBytes));
  let marker = `bundle_cid=${bundle.bundleCid}\nfile_count=${map.size}`; let index = 0;
  for (const [path, raw] of map) { marker += `\nfile[${index}].path=${path}\nfile[${index}].raw_byte_length=${raw.length}\nfile[${index}].content_cid=${encoding.sourceRawCid(raw)}`; index += 1; }
  add(".cheng-mirror/commit.txt", Buffer.from(marker)); return map;
}

function verifyMirrorInstall(files: EvidenceFiles, installRaw: Buffer, bundle: ManagedMirrorBundle): {root: string; installed: ReadonlyMap<string, Buffer>} {
  const text = new TextDecoder("utf-8", {fatal: true}).decode(installRaw); if (!text.endsWith("\n")) fail("mirror install: terminal newline"); let parsed: unknown; try { parsed = JSON.parse(text); } catch { fail("mirror install: JSON"); }
  if (!isRecord(parsed)) fail("mirror install: 非 object"); exactKeys(parsed, ["bundle_cid", "files", "manifest_sha256", "root", "schema"], "mirror install"); if (parsed.schema !== CID_MIRROR_INSTALL_SCHEMA) fail("mirror install: schema"); if (canonicalJson(parsed) + "\n" !== text) fail("mirror install: 非 canonical JSON");
  const projection = {...parsed}; delete projection.manifest_sha256; if (sha256(Buffer.from(canonicalJson(projection))) !== stringField(parsed, "manifest_sha256", "mirror install")) fail("mirror install: manifest hash"); if (stringField(parsed, "bundle_cid", "mirror install") !== bundle.bundleCid) fail("mirror install: bundle CID");
  const rootRel = canonicalRelativePath(stringField(parsed, "root", "mirror install"), "mirror install.root"); const root = files.resolvePath(rootRel); const rootBefore = lstatSync(root, {bigint: true}); if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink()) fail("mirror install: root 非真实目录"); const expected = expectedMirrorFiles(bundle); if (!Array.isArray(parsed.files) || parsed.files.length !== expected.size) fail("mirror install: file count");
  const expectedOrder = [...expected.keys()];
  const listed = new Set<string>(); const installed = new Map<string, Buffer>(); for (let i = 0; i < parsed.files.length; i += 1) { const item = parsed.files[i]; if (!isRecord(item)) fail("mirror install: file item"); exactKeys(item, ["artifact", "relative_path"], `mirror install.files[${i}]`); const rel = canonicalRelativePath(stringField(item, "relative_path", `mirror install.files[${i}]`), "relative_path"); if (rel !== expectedOrder[i]) fail("mirror install: file order 非 canonical"); const ref = parseArtifactRef(item.artifact, `mirror install.files[${i}].artifact`); if (ref.path !== `${rootRel}/${rel}`) fail("mirror install: artifact path/root binding"); const raw = files.read(ref, `mirror install ${rel}`); const wanted = expected.get(rel); if (!wanted || !raw.equals(wanted)) fail(`mirror install: bytes ${rel}`); listed.add(rel); installed.set(rel, raw); }
  const walked: string[] = []; const walk = (dir: string, prefix: string) => { for (const name of readdirSync(dir).sort()) { const path = join(dir, name); const stat = lstatSync(path); if (stat.isSymbolicLink()) fail("mirror install: symlink"); const rel = prefix ? `${prefix}/${name}` : name; if (stat.isDirectory()) walk(path, rel); else if (stat.isFile()) walked.push(rel); else fail("mirror install: 非普通节点"); } }; walk(root, ""); const rootAfter = lstatSync(root, {bigint: true}); if (rootBefore.dev !== rootAfter.dev || rootBefore.ino !== rootAfter.ino || rootBefore.mtimeNs !== rootAfter.mtimeNs || rootBefore.ctimeNs !== rootAfter.ctimeNs || walked.length !== listed.size || walked.some((path) => !listed.has(path))) fail("mirror install: root 读取期间改变或 extra/missing files");
  return {root: rootRel, installed};
}

function mirrorTreeLedger(installed: ReadonlyMap<string, Buffer>): Buffer {
  const entries = [...installed].sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right))).map(([path, raw]) => ({path, raw_byte_length: raw.length, sha256: sha256(raw)}));
  return Buffer.from(canonicalJson(entries));
}

function verifyMirrorTreeSnapshot(files: EvidenceFiles, raw: Buffer, label: string): {root: string; installed: ReadonlyMap<string, Buffer>; ledger: Buffer} {
  const value = parseJsonRaw(raw, label, true); if (!isRecord(value)) fail(`${label}: 非 object`); exactKeys(value, ["files", "manifest_sha256", "root", "schema"], label); if (value.schema !== "cheng.cid.mirror_tree_snapshot") fail(`${label}: schema`); const projection = {...value}; delete projection.manifest_sha256; if (value.manifest_sha256 !== sha256(Buffer.from(canonicalJson(projection)))) fail(`${label}: manifest SHA`);
  const rootRel = canonicalRelativePath(stringField(value, "root", label), `${label}.root`); const root = files.resolvePath(rootRel); const rootBefore = lstatSync(root, {bigint: true}); if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink()) fail(`${label}: root 非真实目录`); if (!Array.isArray(value.files) || value.files.length === 0) fail(`${label}: files 非空 array required`);
  const installed = new Map<string, Buffer>(); let prior = "";
  for (let index = 0; index < value.files.length; index += 1) { const item = value.files[index]; if (!isRecord(item)) fail(`${label}.files[${index}]: 非 object`); exactKeys(item, ["artifact", "relative_path"], `${label}.files[${index}]`); const relativePath = canonicalRelativePath(stringField(item, "relative_path", `${label}.files[${index}]`), `${label}.files[${index}].relative_path`); if (index > 0 && Buffer.compare(Buffer.from(prior), Buffer.from(relativePath)) >= 0) fail(`${label}: relative_path 非严格排序`); prior = relativePath; const ref = parseArtifactRef(item.artifact, `${label}.files[${index}].artifact`); if (ref.path !== `${rootRel}/${relativePath}`) fail(`${label}: artifact path/root binding`); installed.set(relativePath, files.read(ref, `${label}.${relativePath}`)); }
  const walked: string[] = []; const walk = (dir: string, prefix: string) => { for (const name of readdirSync(dir).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))) { const path = join(dir, name); const stat = lstatSync(path); if (stat.isSymbolicLink()) fail(`${label}: symlink`); const relativePath = prefix ? `${prefix}/${name}` : name; if (stat.isDirectory()) walk(path, relativePath); else if (stat.isFile()) walked.push(relativePath); else fail(`${label}: 非普通节点`); } }; walk(root, ""); walked.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))); const rootAfter = lstatSync(root, {bigint: true}); const listed = [...installed.keys()]; if (rootBefore.dev !== rootAfter.dev || rootBefore.ino !== rootAfter.ino || rootBefore.mtimeNs !== rootAfter.mtimeNs || rootBefore.ctimeNs !== rootAfter.ctimeNs || walked.length !== listed.length || walked.some((path, index) => path !== listed[index])) fail(`${label}: root 读取期间改变或 extra/missing files`);
  return {root: rootRel, installed, ledger: mirrorTreeLedger(installed)};
}

function commonRoles(): string[] { return [...CGROUP_ARTIFACT_ROLES, "case_binding"]; }
export function requiredCidEvidenceRoles(kind: CaseKind): string[] {
  const source = ["source_receipt", "csg_sidecar", "semantic_receipt", "binding_report", "compile_receipt", "output"];
  const migration = ["migration_evidence", "migration_proof", "baseline_csg", "migrated_csg", "baseline_surface", "migrated_surface", "baseline_semantic", "migrated_semantic"];
  const rootBMigration = ["root_b_migration_evidence", "root_b_migration_proof", "root_b_baseline_csg", "root_b_migrated_csg", "root_b_baseline_surface", "root_b_migrated_surface", "root_b_baseline_semantic", "root_b_migrated_semantic"];
  if (kind === "zero_byte_import") return [...commonRoles(), ...source, "zero_entry_source", "zero_entry_source_receipt", "zero_entry_stdout", "zero_entry_stderr", "zero_entry_trace", "missing_probe_stdout", "missing_probe_stderr", "missing_probe_trace"];
  if (kind === "csg_atomic_consume") return [...commonRoles(), ...source, "consume_first_plan_before", "consume_first_graph_before", "consume_first_output_before", "consume_first_plan_after", "consume_first_output_after", "consume_first_graph_after", "consume_first_stdout", "consume_first_stderr", "consume_second_plan_before", "consume_second_graph_before", "consume_second_output_before", "consume_second_plan_after", "consume_second_graph_after", "consume_second_output_after", "consume_second_stdout", "consume_second_stderr", "consume_rehash_plan_before", "consume_rehash_graph_before", "consume_rehash_output_before", "consume_rehash_plan_after", "consume_rehash_graph_after", "consume_rehash_output_after", "consume_rehash_stdout", "consume_rehash_stderr", "consume_trace"];
  if (kind === "migration_cross_root_fixed_point") return [...commonRoles(), ...migration, ...rootBMigration];
  if (kind === "mirror_atomic_install") return [...commonRoles(), ...source, ...migration, ...rootBMigration, "mirror_bundle", "mirror_install", "mirror_idempotent_install", "root_b_mirror_bundle", "root_b_mirror_install", "mirror_conflict_stdout", "mirror_conflict_stderr", "mirror_conflict_tree", "mirror_tamper_stdout", "mirror_tamper_stderr", "mirror_tampered_tree", "mirror_partial_scan", "mirror_atomic_trace", "managed_dependency_receipt", "universe_manifest", "compiler_snapshot", "std_snapshot", "runtime_snapshot", "world_head", "world_envelope"];
  return [...commonRoles(), ...source];
}
const requiredRoles = requiredCidEvidenceRoles;

const CASE_PAYLOAD_INDEX_SCHEMA = "cheng.cid.case_payload_index";
const MAX_CASE_BUNDLE_BYTES = 2_147_483_648;
const CASE_MODULE_GROUPS = ["modules", "legacy_modules", "migrated_modules", "root_b_legacy_modules", "root_b_migrated_modules"] as const;

function verifyCasePayloadArchive(files: EvidenceFiles, item: EvidenceCase): void {
  if (item.artifacts.stdout.raw_byte_length === 0 || item.artifacts.stdout.raw_byte_length > MAX_CASE_BUNDLE_BYTES) fail(`${item.case_id}: case bundle size`);
  const payloadPrefix = `cases/${item.case_id}/payload/`;
  const relativePayloadPath = (ref: ArtifactRef, label: string): string => {
    if (!ref.path.startsWith(payloadPrefix) || ref.path.length === payloadPrefix.length) fail(`${label}: payload prefix binding`);
    return canonicalRelativePath(ref.path.slice(payloadPrefix.length), `${label}.payload_path`);
  };
  const payloadRoles = requiredCidEvidenceRoles(item.kind).slice(CGROUP_ARTIFACT_ROLES.length + 1);
  const artifacts = Object.fromEntries(payloadRoles.map((role) => [role, relativePayloadPath(item.artifacts[role], `${item.case_id}.${role}`)]));
  const groups = Object.fromEntries(CASE_MODULE_GROUPS.map((group) => [group, item[group].map((module, index) => ({module_path: module.module_path, path: relativePayloadPath(module.source, `${item.case_id}.${group}[${index}]`)}))])) as Record<typeof CASE_MODULE_GROUPS[number], {module_path: string; path: string}[]>;
  const index = {
    artifacts,
    bootstrap_stage: item.bootstrap_stage,
    case_id: item.case_id,
    entry_module_path: item.entry_module_path,
    kind: item.kind,
    legacy_modules: groups.legacy_modules,
    migrated_modules: groups.migrated_modules,
    modules: groups.modules,
    package_id: item.package_id,
    providers: item.providers,
    root_b_legacy_modules: groups.root_b_legacy_modules,
    root_b_migrated_modules: groups.root_b_migrated_modules,
    schema: CASE_PAYLOAD_INDEX_SCHEMA,
    target: item.target,
  };
  const expected = new Map<string, Buffer>();
  const add = (path: string, raw: Buffer, label: string) => { if (expected.has(path)) fail(`${label}: payload path alias ${path}`); expected.set(path, raw); };
  add("case-index.json", Buffer.from(canonicalJson(index) + "\n", "utf8"), `${item.case_id}.case-index`);
  for (const role of payloadRoles) add(artifacts[role], files.read(item.artifacts[role], `${item.case_id}.${role}`), `${item.case_id}.${role}`);
  for (const group of CASE_MODULE_GROUPS) item[group].forEach((module, index) => add(groups[group][index].path, files.read(module.source, `${item.case_id}.${group}[${index}]`), `${item.case_id}.${group}[${index}]`));
  assertCanonicalUstarFilesEqual(files.read(item.artifacts.stdout, `${item.case_id}.stdout payload archive`), expected, `${item.case_id}: stdout`);
}

function sourceModules(files: EvidenceFiles, refs: readonly SourceModuleRef[], label: string): SourceModuleBytes[] {
  return refs.map((item, index) => ({modulePath: item.module_path, bytes: files.read(item.source, `${label}[${index}]`)}));
}

function verifySourceChain(files: EvidenceFiles, item: EvidenceCase): {sourceReceiptCid: string; semantic: CompileSemanticReceipt; csgCid: string; compile: CompileReceipt} {
  const modules = sourceModules(files, item.modules, `${item.case_id}.modules`); const expectedSource = buildPortableSourceIdentity(item.package_id, item.entry_module_path, modules); const reportedSource = parsePortableSourceReceipt(files.read(item.artifacts.source_receipt, `${item.case_id}.source_receipt`)); assertPortableSourceReceiptEqual(reportedSource, expectedSource);
  const csg = parseCanonicalCsgSidecar(files.read(item.artifacts.csg_sidecar, `${item.case_id}.csg_sidecar`)); if (csg.packageId !== item.package_id) fail(`${item.case_id}: CSG package`);
  const semantic = parseCompileSemanticReceipt(files.read(item.artifacts.semantic_receipt, `${item.case_id}.semantic_receipt`)); const expectedSemantic = buildCompileSemanticReceipt(expectedSource.receiptCid, csg.canonicalGraphCid, semantic.canonicalOutputDigest, item.target, item.bootstrap_stage, item.providers); if (JSON.stringify(semantic) !== JSON.stringify(expectedSemantic)) fail(`${item.case_id}: semantic receipt binding`);
  const binding = sourceToCsgBindingSeal(expectedSource.receiptCid, csg.canonicalGraphCid, semantic.receiptCid); const bindingRows = parseUniqueKv(files.read(item.artifacts.binding_report, `${item.case_id}.binding_report`), "binding report"); if (bindingRows.get("source_to_csg_binding_seal") !== binding) fail(`${item.case_id}: source-to-CSG binding`);
  const compile = parseCompileReceipt(files.read(item.artifacts.compile_receipt, `${item.case_id}.compile_receipt`)); const output = files.read(item.artifacts.output, `${item.case_id}.output`); if (compile.sourceIdentityReceiptCid !== expectedSource.receiptCid || compile.semanticReceiptCid !== semantic.receiptCid || compile.target !== item.target || compile.bootstrapStage !== item.bootstrap_stage || JSON.stringify(compile.providers) !== JSON.stringify(item.providers) || compile.outputRawSha256 !== sha256(output) || compile.canonicalOutputSha256 !== semantic.canonicalOutputDigest) fail(`${item.case_id}: final compile binding`);
  return {sourceReceiptCid: expectedSource.receiptCid, semantic, csgCid: csg.canonicalGraphCid, compile};
}

function verifyMigration(files: EvidenceFiles, item: EvidenceCase, bundle?: ManagedMirrorBundle, rootB = false): {evidence: MigrationEvidence; proof: MigrationProof; raw: Readonly<Record<string, Buffer>>} {
  const prefix = rootB ? "root_b_" : ""; const role = (name: string) => item.artifacts[`${prefix}${name}`]; const raw: Record<string, Buffer> = {};
  for (const name of ["migration_evidence", "migration_proof", "baseline_csg", "migrated_csg", "baseline_surface", "migrated_surface", "baseline_semantic", "migrated_semantic"]) raw[name] = files.read(role(name), `${item.case_id}.${prefix}${name}`);
  const evidenceRaw = raw.migration_evidence; const proofRaw = raw.migration_proof; const evidence = parseMigrationEvidence(evidenceRaw); const proof = parseMigrationProof(proofRaw);
  const legacyRefs = rootB ? item.root_b_legacy_modules : item.legacy_modules; const migratedRefs = rootB ? item.root_b_migrated_modules : item.migrated_modules; const legacy = sourceModules(files, legacyRefs, `${item.case_id}.${prefix}legacy_modules`); const migrated = sourceModules(files, migratedRefs, `${item.case_id}.${prefix}migrated_modules`); verifyMigrationEvidenceRawSources(evidence, legacy, migrated);
  const baselineCsg = parseCanonicalCsgSidecar(raw.baseline_csg); const migratedCsg = parseCanonicalCsgSidecar(raw.migrated_csg); const baselineSurface = parseExportSurface(raw.baseline_surface); const migratedSurface = parseExportSurface(raw.migrated_surface); const baselineSemantic = parseCompileSemanticReceipt(raw.baseline_semantic); const migratedSemantic = parseCompileSemanticReceipt(raw.migrated_semantic); verifyMigrationProofBindings(proof, evidence, baselineCsg, migratedCsg, baselineSurface, migratedSurface, baselineSemantic, migratedSemantic);
  const expectedBaselineSemantic = buildCompileSemanticReceipt(evidence.legacySourceReceipt.receiptCid, baselineCsg.canonicalGraphCid, baselineSemantic.canonicalOutputDigest, item.target, item.bootstrap_stage, item.providers); const expectedMigratedSemantic = buildCompileSemanticReceipt(evidence.migratedSourceReceipt.receiptCid, migratedCsg.canonicalGraphCid, migratedSemantic.canonicalOutputDigest, item.target, item.bootstrap_stage, item.providers); if (JSON.stringify(baselineSemantic) !== JSON.stringify(expectedBaselineSemantic) || JSON.stringify(migratedSemantic) !== JSON.stringify(expectedMigratedSemantic)) fail("migration: semantic target/stage/provider binding");
  if (bundle) {
    const artifactBytes = [
      [bundle.baselineCsg, raw.baseline_csg], [bundle.migratedCsg, raw.migrated_csg],
      [bundle.baselineSurface, raw.baseline_surface], [bundle.migratedSurface, raw.migrated_surface],
      [bundle.baselineSemantic, raw.baseline_semantic], [bundle.migratedSemantic, raw.migrated_semantic],
      [bundle.evidence, evidenceRaw], [bundle.proof, proofRaw],
    ] as const;
    if (artifactBytes.some(([left, right]) => !left.equals(right)) || bundle.packageId !== evidence.packageId || bundle.channel !== proof.channel || bundle.compileSemanticReceiptCid !== migratedSemantic.receiptCid || bundle.migrationProofCid !== proof.proofCid || bundle.legacySourceIdentityReceiptCid !== evidence.legacySourceReceipt.receiptCid || bundle.migratedSourceIdentityReceiptCid !== evidence.migratedSourceReceipt.receiptCid || bundle.units.length !== evidence.units.length) fail("mirror bundle: predecessor raw bytes 不匹配");
    for (let i = 0; i < bundle.units.length; i += 1) { const unit = bundle.units[i]; const evidenceUnit = evidence.units[i]; if (unit.modulePath !== evidenceUnit.modulePath || unit.legacyBytes.length !== evidenceUnit.legacyRawByteLength || unit.legacyCid !== evidenceUnit.legacyRawCid || unit.migratedBytes.length !== evidenceUnit.migratedRawByteLength || unit.migratedCid !== evidenceUnit.migratedRawCid) fail(`mirror bundle: unit[${i}] evidence binding`); }
    verifyMigrationEvidenceRawSources(evidence, bundle.units.map((unit) => ({modulePath: unit.modulePath, bytes: unit.legacyBytes})), bundle.units.map((unit) => ({modulePath: unit.modulePath, bytes: unit.migratedBytes})));
  }
  return {evidence, proof, raw};
}

function verifyCrossRootMigration(files: EvidenceFiles, item: EvidenceCase): ReturnType<typeof verifyMigration> {
  const rootA = verifyMigration(files, item); const rootB = verifyMigration(files, item, undefined, true);
  for (const key of Object.keys(rootA.raw)) if (!rootA.raw[key].equals(rootB.raw[key])) fail(`migration fixed point: root A/B ${key} 原始字节不同`);
  const compareModules = (left: readonly SourceModuleRef[], right: readonly SourceModuleRef[], label: string) => { if (left.length !== right.length) fail(`${label}: count`); for (let i = 0; i < left.length; i += 1) { if (left[i].module_path !== right[i].module_path || !files.read(left[i].source, `${label}.a[${i}]`).equals(files.read(right[i].source, `${label}.b[${i}]`))) fail(`${label}: root A/B source bytes`); } };
  compareModules(item.legacy_modules, item.root_b_legacy_modules, "migration legacy fixed point"); compareModules(item.migrated_modules, item.root_b_migrated_modules, "migration migrated fixed point"); return rootA;
}

function verifyZeroAndMissingProbe(files: EvidenceFiles, item: EvidenceCase): void {
  const modules = sourceModules(files, item.modules, `${item.case_id}.zero_byte_modules`); const entry = modules.find((module) => module.modulePath === item.entry_module_path); const zeroPaths = new Set(modules.filter((module) => module.bytes.length === 0).map((module) => module.modulePath)); const edges = sourceImportEdges(modules); if (!entry || entry.bytes.length === 0 || !edges.some((edge) => zeroPaths.has(edge.targetModulePath))) fail(`${item.case_id}: 主链没有证明非空 entry 导入零字节模块`);
  const zeroEntrySource = files.read(item.artifacts.zero_entry_source, `${item.case_id}.zero_entry_source`); const zeroEntryReceiptRaw = files.read(item.artifacts.zero_entry_source_receipt, `${item.case_id}.zero_entry_source_receipt`); const zeroEntryStdout = files.read(item.artifacts.zero_entry_stdout, `${item.case_id}.zero_entry_stdout`); const zeroEntryStderr = files.read(item.artifacts.zero_entry_stderr, `${item.case_id}.zero_entry_stderr`); const zeroEntryTraceRaw = files.read(item.artifacts.zero_entry_trace, `${item.case_id}.zero_entry_trace`); const zeroEntryTrace = parseJsonRaw(zeroEntryTraceRaw, `${item.case_id}.zero_entry_trace`, true); if (!isRecord(zeroEntryTrace)) fail(`${item.case_id}: zero entry trace`);
  exactKeys(zeroEntryTrace, ["entry_module_path", "exit_code", "manifest_sha256", "package_id", "schema", "source_receipt_sha256", "stderr_sha256", "stdout_sha256"], `${item.case_id}.zero_entry_trace`); const zeroEntryProjection = {...zeroEntryTrace}; delete zeroEntryProjection.manifest_sha256; const zeroEntryModulePath = canonicalModulePath(stringField(zeroEntryTrace, "entry_module_path", `${item.case_id}.zero_entry_trace`)); const zeroEntryPackageId = stringField(zeroEntryTrace, "package_id", `${item.case_id}.zero_entry_trace`); const expectedZeroEntryReceipt = buildPortableSourceIdentity(zeroEntryPackageId, zeroEntryModulePath, [{modulePath: zeroEntryModulePath, bytes: zeroEntrySource}]); const reportedZeroEntryReceipt = parsePortableSourceReceipt(zeroEntryReceiptRaw); assertPortableSourceReceiptEqual(reportedZeroEntryReceipt, expectedZeroEntryReceipt);
  if (zeroEntryTrace.schema !== "cheng.cid.zero_entry_probe" || zeroEntryPackageId !== item.package_id || zeroEntryModulePath === item.entry_module_path || zeroEntrySource.length !== 0 || uintField(zeroEntryTrace, "exit_code", `${item.case_id}.zero_entry_trace`) !== 0 || !zeroEntryStdout.equals(zeroEntryReceiptRaw) || zeroEntryStderr.length !== 0 || zeroEntryTrace.source_receipt_sha256 !== sha256(zeroEntryReceiptRaw) || zeroEntryTrace.stdout_sha256 !== sha256(zeroEntryStdout) || zeroEntryTrace.stderr_sha256 !== sha256(zeroEntryStderr) || zeroEntryTrace.manifest_sha256 !== sha256(Buffer.from(canonicalJson(zeroEntryProjection)))) fail(`${item.case_id}: 零字节 entry/source receipt 原始结果不成立`);
  const stdout = files.read(item.artifacts.missing_probe_stdout, `${item.case_id}.missing_probe_stdout`); const stderr = files.read(item.artifacts.missing_probe_stderr, `${item.case_id}.missing_probe_stderr`); const raw = files.read(item.artifacts.missing_probe_trace, `${item.case_id}.missing_probe_trace`); const value = parseJsonRaw(raw, `${item.case_id}.missing_probe_trace`, true); if (!isRecord(value)) fail(`${item.case_id}: missing probe trace`);
  exactKeys(value, ["exit_code", "manifest_sha256", "missing_module_path", "schema", "stderr_sha256", "stdout_sha256"], `${item.case_id}.missing_probe_trace`); const projection = {...value}; delete projection.manifest_sha256; const missing = canonicalModulePath(stringField(value, "missing_module_path", `${item.case_id}.missing_probe_trace`));
  let stderrText = ""; try { stderrText = new TextDecoder("utf-8", {fatal: true}).decode(stderr); } catch { fail(`${item.case_id}: missing stderr 非 UTF-8`); } if (value.schema !== "cheng.cid.missing_file_probe" || item.modules.some((module) => module.module_path === missing) || zeroEntryModulePath === missing || uintField(value, "exit_code", `${item.case_id}.missing_probe_trace`) === 0 || stdout.length !== 0 || stderr.length === 0 || !stderrText.includes(missing) || value.stdout_sha256 !== sha256(stdout) || value.stderr_sha256 !== sha256(stderr) || value.manifest_sha256 !== sha256(Buffer.from(canonicalJson(projection)))) fail(`${item.case_id}: missing hard-fail 原始结果不成立`);
}

function verifyAtomicConsume(files: EvidenceFiles, item: EvidenceCase): void {
  const roles = ["consume_first_plan_before", "consume_first_graph_before", "consume_first_output_before", "consume_first_plan_after", "consume_first_output_after", "consume_first_graph_after", "consume_first_stdout", "consume_first_stderr", "consume_second_plan_before", "consume_second_graph_before", "consume_second_output_before", "consume_second_plan_after", "consume_second_graph_after", "consume_second_output_after", "consume_second_stdout", "consume_second_stderr", "consume_rehash_plan_before", "consume_rehash_graph_before", "consume_rehash_output_before", "consume_rehash_plan_after", "consume_rehash_graph_after", "consume_rehash_output_after", "consume_rehash_stdout", "consume_rehash_stderr"] as const;
  const bytes = Object.fromEntries(roles.map((role) => [role, files.read(item.artifacts[role], `${item.case_id}.${role}`)])) as Record<typeof roles[number], Buffer>;
  const raw = files.read(item.artifacts.consume_trace, `${item.case_id}.consume_trace`); const value = parseJsonRaw(raw, `${item.case_id}.consume_trace`, true); if (!isRecord(value)) fail("CSG atomic consume: trace"); const keys = ["first_exit_code", "manifest_sha256", "rehash_attack_exit_code", "schema", "second_exit_code", ...roles.map((role) => `${role}_sha256`)]; exactKeys(value, keys, `${item.case_id}.consume_trace`); const projection = {...value}; delete projection.manifest_sha256;
  for (const role of roles) if (value[`${role}_sha256`] !== sha256(bytes[role])) fail(`CSG atomic consume: trace/raw ${role}`);
  if (value.schema !== "cheng.cid.csg_atomic_consume_trace" || uintField(value, "first_exit_code", "consume_trace") !== 0 || uintField(value, "second_exit_code", "consume_trace") === 0 || uintField(value, "rehash_attack_exit_code", "consume_trace") === 0 || bytes.consume_first_stderr.length !== 0 || bytes.consume_second_stdout.length !== 0 || bytes.consume_second_stderr.length === 0 || bytes.consume_rehash_stdout.length !== 0 || bytes.consume_rehash_stderr.length === 0 || value.manifest_sha256 !== sha256(Buffer.from(canonicalJson(projection)))) fail("CSG atomic consume: exit/stdout/stderr/trace identity");
  if (bytes.consume_first_plan_before.length === 0 || bytes.consume_first_graph_before.length === 0 || bytes.consume_first_plan_after.length !== 0 || bytes.consume_first_graph_after.length !== 0 || bytes.consume_first_output_after.length === 0 || bytes.consume_first_output_after.equals(bytes.consume_first_output_before)) fail("CSG atomic consume: 成功状态迁移不完整");
  if (!bytes.consume_second_plan_before.equals(bytes.consume_first_plan_after) || !bytes.consume_second_graph_before.equals(bytes.consume_first_graph_after) || !bytes.consume_second_output_before.equals(bytes.consume_first_output_after) || !bytes.consume_second_plan_after.equals(bytes.consume_second_plan_before) || !bytes.consume_second_graph_after.equals(bytes.consume_second_graph_before) || !bytes.consume_second_output_after.equals(bytes.consume_second_output_before)) fail("CSG atomic consume: 二次消费未 hard-fail 且 graph/plan/out 字节不变");
  if (bytes.consume_rehash_plan_before.length === 0 || bytes.consume_rehash_graph_before.length === 0 || bytes.consume_rehash_plan_before.equals(bytes.consume_first_plan_before) || bytes.consume_rehash_graph_before.equals(bytes.consume_first_graph_before) || !bytes.consume_rehash_output_before.equals(bytes.consume_first_output_before) || !bytes.consume_rehash_plan_after.equals(bytes.consume_rehash_plan_before) || !bytes.consume_rehash_graph_after.equals(bytes.consume_rehash_graph_before) || !bytes.consume_rehash_output_after.equals(bytes.consume_rehash_output_before)) fail("CSG atomic consume: 协调重哈希攻击未被原子拒绝");
}

function mutationBytes(value: Record<string, unknown>, key: string, label: string): Buffer {
  const encoded = stringField(value, key, label);
  if (!/^(?:[0-9a-f]{2})*$/.test(encoded)) fail(`${label}.${key}: 非 canonical hex`);
  return Buffer.from(encoded, "hex");
}

function verifyMirrorAtomicTrace(files: EvidenceFiles, item: EvidenceCase, bundle: ManagedMirrorBundle, install: ReturnType<typeof verifyMirrorInstall>): void {
  const idempotentRaw = files.read(item.artifacts.mirror_idempotent_install, `${item.case_id}.mirror_idempotent_install`); const idempotent = verifyMirrorInstall(files, idempotentRaw, bundle); if (idempotent.root !== install.root) fail("mirror atomic: idempotent install root 不同");
  const rootBBundleRaw = files.read(item.artifacts.root_b_mirror_bundle, `${item.case_id}.root_b_mirror_bundle`); const rootBBundle = parseMirrorBundle(rootBBundleRaw); if (!rootBBundleRaw.equals(bundle.raw) || rootBBundle.bundleCid !== bundle.bundleCid) fail("mirror atomic: fresh rebuild bundle 原始字节不同"); const rootBInstallRaw = files.read(item.artifacts.root_b_mirror_install, `${item.case_id}.root_b_mirror_install`); const rootBInstall = verifyMirrorInstall(files, rootBInstallRaw, rootBBundle); if (rootBInstall.root === install.root || rootBInstall.installed.size !== install.installed.size) fail("mirror atomic: fresh root 不独立"); for (const [path, raw] of install.installed) if (!rootBInstall.installed.get(path)?.equals(raw)) fail(`mirror atomic: fresh rebuild bytes ${path}`);
  const conflictStdout = files.read(item.artifacts.mirror_conflict_stdout, `${item.case_id}.mirror_conflict_stdout`); const conflictStderr = files.read(item.artifacts.mirror_conflict_stderr, `${item.case_id}.mirror_conflict_stderr`); const conflictTreeRaw = files.read(item.artifacts.mirror_conflict_tree, `${item.case_id}.mirror_conflict_tree`); const conflictTree = verifyMirrorTreeSnapshot(files, conflictTreeRaw, `${item.case_id}.mirror_conflict_tree`); const tamperStdout = files.read(item.artifacts.mirror_tamper_stdout, `${item.case_id}.mirror_tamper_stdout`); const tamperStderr = files.read(item.artifacts.mirror_tamper_stderr, `${item.case_id}.mirror_tamper_stderr`); const tamperedTreeRaw = files.read(item.artifacts.mirror_tampered_tree, `${item.case_id}.mirror_tampered_tree`); const tamperedTree = verifyMirrorTreeSnapshot(files, tamperedTreeRaw, `${item.case_id}.mirror_tampered_tree`); if (conflictStdout.length !== 0 || conflictStderr.length === 0 || tamperStdout.length !== 0 || tamperStderr.length === 0) fail("mirror atomic: negative raw stdout/stderr");
  const installedLedger = mirrorTreeLedger(install.installed); if (conflictTree.root !== install.root || !conflictTree.ledger.equals(installedLedger)) fail("mirror atomic: conflict 后物理树改变"); if (tamperedTree.root === install.root || tamperedTree.root === rootBInstall.root || tamperedTree.installed.size !== install.installed.size) fail("mirror atomic: tamper tree 未隔离/文件集不同"); const changedPaths: string[] = []; for (const [path, expected] of install.installed) { const actual = tamperedTree.installed.get(path); if (actual === undefined) fail(`mirror atomic: tamper tree 缺 ${path}`); if (!actual.equals(expected)) changedPaths.push(path); } if (changedPaths.length !== 1 || !(changedPaths[0] === "bundle.txt" || changedPaths[0] === ".cheng-mirror/commit.txt" || changedPaths[0].startsWith("src/"))) fail("mirror atomic: tamper 必须精确改变一个 bundle/commit/source 原始文件"); let conflictError = ""; let tamperError = ""; try { conflictError = new TextDecoder("utf-8", {fatal: true}).decode(conflictStderr); tamperError = new TextDecoder("utf-8", {fatal: true}).decode(tamperStderr); } catch { fail("mirror atomic: negative stderr 非 UTF-8"); } if (!conflictError.includes("InstallAtomic") || !tamperError.includes("OpenVerified") || !tamperError.includes(changedPaths[0])) fail("mirror atomic: negative stderr 未绑定安装/打开阶段与变异路径");
  const scanRaw = files.read(item.artifacts.mirror_partial_scan, `${item.case_id}.mirror_partial_scan`); const scan = parseJsonRaw(scanRaw, `${item.case_id}.mirror_partial_scan`, true); if (!isRecord(scan)) fail("mirror atomic: partial scan"); exactKeys(scan, ["entries", "manifest_sha256", "parent", "schema"], "mirror partial scan"); const scanProjection = {...scan}; delete scanProjection.manifest_sha256; const parentRel = canonicalRelativePath(stringField(scan, "parent", "mirror partial scan"), "mirror partial scan.parent"); const parent = files.resolvePath(parentRel); if (!lstatSync(parent).isDirectory() || !Array.isArray(scan.entries)) fail("mirror atomic: partial scan parent/entries"); const actualEntries = readdirSync(parent).sort(); if (canonicalJson(scan.entries) !== canonicalJson(actualEntries) || actualEntries.some((name) => name.includes("staging") || name.includes(".tmp") || name.includes("partial")) || scan.schema !== "cheng.cid.mirror_partial_scan" || scan.manifest_sha256 !== sha256(Buffer.from(canonicalJson(scanProjection)))) fail("mirror atomic: 残留半安装");
  const traceRaw = files.read(item.artifacts.mirror_atomic_trace, `${item.case_id}.mirror_atomic_trace`); const trace = parseJsonRaw(traceRaw, `${item.case_id}.mirror_atomic_trace`, true); if (!isRecord(trace)) fail("mirror atomic: trace"); exactKeys(trace, ["conflict_exit_code", "conflict_stderr_sha256", "conflict_stdout_sha256", "conflict_tree_after_hex", "conflict_tree_before_hex", "first_exit_code", "fresh_exit_code", "idempotent_exit_code", "manifest_sha256", "mirror_conflict_tree_sha256", "mirror_install_sha256", "mirror_partial_scan_sha256", "mirror_tampered_tree_sha256", "root_b_mirror_install_sha256", "schema", "tamper_open_exit_code", "tamper_stderr_sha256", "tamper_stdout_sha256", "tampered_tree_hex"], "mirror atomic trace"); const traceProjection = {...trace}; delete traceProjection.manifest_sha256; const conflictBefore = mutationBytes(trace, "conflict_tree_before_hex", "mirror trace"); const conflictAfter = mutationBytes(trace, "conflict_tree_after_hex", "mirror trace"); const tampered = mutationBytes(trace, "tampered_tree_hex", "mirror trace");
  if (!conflictBefore.equals(installedLedger) || !conflictAfter.equals(conflictTree.ledger) || !conflictAfter.equals(conflictBefore) || !tampered.equals(tamperedTree.ledger) || tampered.equals(installedLedger) || trace.schema !== "cheng.cid.mirror_atomic_trace" || uintField(trace, "first_exit_code", "mirror trace") !== 0 || uintField(trace, "idempotent_exit_code", "mirror trace") !== 0 || uintField(trace, "fresh_exit_code", "mirror trace") !== 0 || uintField(trace, "conflict_exit_code", "mirror trace") === 0 || uintField(trace, "tamper_open_exit_code", "mirror trace") === 0 || trace.mirror_install_sha256 !== sha256(files.read(item.artifacts.mirror_install, "mirror install")) || trace.root_b_mirror_install_sha256 !== sha256(rootBInstallRaw) || trace.mirror_conflict_tree_sha256 !== sha256(conflictTreeRaw) || trace.mirror_tampered_tree_sha256 !== sha256(tamperedTreeRaw) || trace.mirror_partial_scan_sha256 !== sha256(scanRaw) || trace.conflict_stdout_sha256 !== sha256(conflictStdout) || trace.conflict_stderr_sha256 !== sha256(conflictStderr) || trace.tamper_stdout_sha256 !== sha256(tamperStdout) || trace.tamper_stderr_sha256 !== sha256(tamperStderr) || trace.manifest_sha256 !== sha256(Buffer.from(canonicalJson(traceProjection)))) fail("mirror atomic: trace/raw binding");
}

function verifyWorld(files: EvidenceFiles, item: EvidenceCase, source: ReturnType<typeof verifySourceChain>, migration: ReturnType<typeof verifyMigration>, bundle: ManagedMirrorBundle): void {
  const dependency = parseManagedDependencyReceipt(files.read(item.artifacts.managed_dependency_receipt, "managed dependency receipt")); const manifest = parseUniverseManifest(files.read(item.artifacts.universe_manifest, "universe manifest")); const compiler = parsePackageSnapshot(files.read(item.artifacts.compiler_snapshot, "compiler snapshot"), "compiler snapshot"); const std = parsePackageSnapshot(files.read(item.artifacts.std_snapshot, "std snapshot"), "std snapshot"); const runtime = parsePackageSnapshot(files.read(item.artifacts.runtime_snapshot, "runtime snapshot"), "runtime snapshot"); const head = parseWorldHead(files.read(item.artifacts.world_head, "world head"));
  if (dependency.receiptCid !== manifest.managedDependencyReceiptCid || dependency.channel !== manifest.channel) fail("world: managed dependency receipt binding"); const snapshots = new Map([compiler, std, runtime].map((snapshot) => [snapshot.packageId, snapshot])); if (snapshots.size !== 3) fail("world: compiler/std/runtime package identity 必须互异"); for (const snapshot of snapshots.values()) { const entry = manifest.entries.find((candidate) => candidate.packageId === snapshot.packageId); if (!entry || snapshot.snapshotCid !== entry.snapshotCid || snapshot.syntaxSurfaceCid !== entry.syntaxSurfaceCid || snapshot.migrationProofCid !== entry.migrationProofCid) fail("world: manifest 必须精确提交 compiler/std/runtime snapshot"); }
  for (const entry of dependency.entries) { const committed = manifest.entries.find((candidate) => candidate.packageId === entry.packageId); if (!committed || committed.snapshotCid !== entry.snapshotCid || committed.syntaxSurfaceCid !== entry.syntaxSurfaceCid || committed.migrationProofCid !== entry.migrationProofCid || committed.managedMirrorBundleCid !== entry.managedMirrorBundleCid) fail("world: compact managed dependency/manifest binding"); }
  if (head.channel !== manifest.channel || compiler.channel !== manifest.channel || std.channel !== manifest.channel || runtime.channel !== manifest.channel || head.manifestRootCid !== manifest.manifestCid || head.csgRootCid !== source.csgCid || head.compilerPkgCid !== compiler.snapshotCid || head.stdPkgCid !== std.snapshotCid || head.runtimePkgCid !== runtime.snapshotCid) fail("world: head predecessor/channel binding"); if (!manifest.entries.some((entry) => entry.packageId === bundle.packageId && entry.migrationProofCid === migration.proof.proofCid && entry.managedMirrorBundleCid === bundle.bundleCid)) fail("world: mirror manifest entry"); if (source.compile.worldHeadCid !== head.headCid) fail("world: final compile/worldHead binding");
  const envelopeRows = parseUniqueKv(files.read(item.artifacts.world_envelope, "world envelope"), "world envelope"); const get = (key: string) => { const value = envelopeRows.get(key); if (value === undefined) fail(`world envelope: 缺 ${key}`); return value; }; const mirrorCountRaw = get("managed_mirror_count"); if (!UINT.test(mirrorCountRaw)) fail("world envelope: mirror count"); const mirrorCount = Number(mirrorCountRaw); const known = new Set(["world_head_cid", "manifest_cid", "compiler_snapshot_cid", "std_snapshot_cid", "runtime_snapshot_cid", "canonical_csg_cid", "surface_cid", "source_identity_receipt_cid", "semantic_receipt_cid", "compile_receipt_cid", "output_sha256", "evidence_cid", "proof_cid", "compiler_mirror_bundle_cid", "managed_dependency_receipt_cid", "managed_dependency_payload_receipt_cid", "managed_mirror_count", "envelope_cid"]); const mirrorCids: string[] = []; for (let i = 0; i < mirrorCount; i += 1) { const key = `managed_mirror[${i}].bundle_cid`; known.add(key); mirrorCids.push(hex32(get(key), key)); } for (const key of envelopeRows.keys()) if (!known.has(key)) fail(`world envelope: 未知字段 ${key}`);
  const orderedEnvelopeKeys = ["world_head_cid", "manifest_cid", "compiler_snapshot_cid", "std_snapshot_cid", "runtime_snapshot_cid", "canonical_csg_cid", "surface_cid", "source_identity_receipt_cid", "semantic_receipt_cid", "compile_receipt_cid", "output_sha256", "evidence_cid", "proof_cid", "compiler_mirror_bundle_cid", "managed_dependency_receipt_cid", "managed_dependency_payload_receipt_cid", "managed_mirror_count"];
  for (let i = 0; i < mirrorCount; i += 1) orderedEnvelopeKeys.push(`managed_mirror[${i}].bundle_cid`);
  orderedEnvelopeKeys.push("envelope_cid"); exactMapKeyOrder(envelopeRows, orderedEnvelopeKeys, "world envelope");
  if (source.sourceReceiptCid !== migration.evidence.migratedSourceReceipt.receiptCid || source.csgCid !== migration.proof.migratedGraphCid || compiler.sourceBundleCid !== migration.evidence.migratedSourceBundleCid || compiler.csgRootCid !== source.csgCid || compiler.exportSurfaceCid !== migration.proof.migratedSurfaceCid || compiler.migrationProofCid !== migration.proof.proofCid) fail("world: migrated fixed point/compiler snapshot binding");
  const claimedBindings: readonly [string, string][] = [["world_head_cid", head.headCid], ["manifest_cid", manifest.manifestCid], ["compiler_snapshot_cid", compiler.snapshotCid], ["std_snapshot_cid", std.snapshotCid], ["runtime_snapshot_cid", runtime.snapshotCid], ["canonical_csg_cid", source.csgCid], ["surface_cid", migration.proof.migratedSurfaceCid], ["source_identity_receipt_cid", source.sourceReceiptCid], ["semantic_receipt_cid", source.semantic.receiptCid], ["compile_receipt_cid", source.compile.receiptCid], ["output_sha256", source.compile.outputRawSha256], ["evidence_cid", migration.evidence.evidenceCid], ["proof_cid", migration.proof.proofCid], ["compiler_mirror_bundle_cid", bundle.bundleCid], ["managed_dependency_receipt_cid", manifest.managedDependencyReceiptCid], ["managed_dependency_payload_receipt_cid", dependency.receiptCid]];
  for (const [key, value] of claimedBindings) if (get(key) !== value) fail(`world envelope: ${key} binding`);
  if (new Set(mirrorCids).size !== mirrorCids.length) fail("world envelope: 重复 managed mirror CID"); for (const mirrorCid of mirrorCids) if (!manifest.entries.some((entry) => entry.managedMirrorBundleCid === mirrorCid)) fail("world envelope: managed mirror 未提交 manifest");
  const values = [head.headCid, manifest.manifestCid, compiler.snapshotCid, std.snapshotCid, runtime.snapshotCid, source.csgCid, migration.proof.migratedSurfaceCid, source.sourceReceiptCid, source.semantic.receiptCid, source.compile.receiptCid, source.compile.outputRawSha256, migration.evidence.evidenceCid, migration.proof.proofCid, bundle.bundleCid, manifest.managedDependencyReceiptCid, dependency.receiptCid, String(mirrorCount), ...mirrorCids]; const envelopeCid = worldHashText("cheng.compiler.world_bundle_envelope", values); if (get("envelope_cid") !== envelopeCid) fail("world envelope: CID 不匹配");
}

function uintRow(rows: ReadonlyMap<string, string>, key: string, label: string): number {
  const raw = rows.get(key); if (raw === undefined || !UINT.test(raw)) fail(`${label}: ${key} 非 uint`);
  const value = Number(raw); if (!Number.isSafeInteger(value)) fail(`${label}: ${key} 越界`); return value;
}
function intRow(rows: ReadonlyMap<string, string>, key: string, label: string): number {
  const raw = rows.get(key); if (raw === undefined || !/^(?:0|[1-9][0-9]*|-[1-9][0-9]*)$/.test(raw)) fail(`${label}: ${key} 非 canonical int`); const value = Number(raw); if (!Number.isSafeInteger(value)) fail(`${label}: ${key} 越界`); return value;
}

function parseExternalKv(raw: Buffer, label: string): ReadonlyMap<string, string> {
  const text = new TextDecoder("utf-8", {fatal: true}).decode(raw); if (!text.endsWith("\n") || text.endsWith("\n\n") || text.includes("\r") || text.includes("\0")) fail(`${label}: 非 canonical KV 换行`);
  const rows = new Map<string, string>();
  for (const line of text.slice(0, -1).split("\n")) { const at = line.indexOf("="); if (at <= 0) fail(`${label}: 非法 KV 行`); const key = line.slice(0, at); if (rows.has(key)) fail(`${label}: 重复字段 ${key}`); rows.set(key, line.slice(at + 1)); }
  return rows;
}

export const HARD_GATE_RECEIPT_KEYS = [
  "tool", "schema", "status", "applicability", "darwin_official_driver_status", "hard_memory_limit_proof_status",
  "memory_enforcement_scope", "mode", "colima_profile", "docker_host", "memory_limit_bytes", "memory_swap_max_bytes",
  "memory_and_swap_total_limit_bytes", "attack_child_count", "attack_child_bytes", "attack_aggregate_bytes", "workload_rc", "attack_child_one_rc",
  "attack_child_two_rc", "docker_attach_rc", "container_exit_code", "container_oom_killed_before", "container_oom_killed_after", "container_oom_killed_final",
  "cgroup_path", "cgroup_mount_type", "cgroup_device", "cgroup_inode", "memory_peak_before_bytes", "memory_peak_after_bytes",
  "memory_current_before_bytes", "memory_current_after_bytes", "memory_events_before_low", "memory_events_before_high", "memory_events_before_max", "memory_events_before_oom",
  "memory_events_before_oom_kill", "memory_events_before_oom_group_kill", "memory_events_after_low", "memory_events_after_high", "memory_events_after_max", "memory_events_after_oom",
  "memory_events_after_oom_kill", "memory_events_after_oom_group_kill", "container_id", "container_config_sha256", "container_argv_sha256", "target_argv_count",
  "target_argv_sha256", "target_env_count", "target_env_sha256", "control_env_count", "control_env_sha256", "native_descriptor_path_fshex",
  "native_descriptor_sha256", "native_descriptor_payload_sha256", "native_descriptor_candidate_build_receipt_path_fshex", "native_descriptor_candidate_build_receipt_sha256",
  "native_descriptor_candidate_entry_path", "native_descriptor_candidate_entry_module_path", "native_descriptor_candidate_entry_sha256", "native_descriptor_schema", "native_descriptor_target",
  "native_descriptor_machine", "native_descriptor_image_id", "native_descriptor_worker_path_in_image_fshex", "native_descriptor_worker_sha256", "native_descriptor_target_argv_encoding", "native_descriptor_target_argv_count",
  "native_descriptor_target_argv_sha256", "native_descriptor_target_env_encoding", "native_descriptor_target_env_count", "native_descriptor_target_env_sha256", "native_descriptor_source_closure_cid", "native_descriptor_source_closure_capture_sha256",
  "native_descriptor_controller_host_os", "native_descriptor_controller_host_machine", "native_descriptor_controller_host_translated", "native_descriptor_native_execution_proof", "native_descriptor_official_driver_sha256", "native_descriptor_cgroup_producer_sha256",
  "native_descriptor_cgroup_validator_sha256", "native_descriptor_cgroup_version", "native_descriptor_cgroup_mount_type", "native_descriptor_memory_enforcement_scope", "native_descriptor_memory_max_bytes", "native_descriptor_memory_swap_max_bytes",
  "native_descriptor_memory_and_swap_total_limit_bytes", "native_descriptor_native_execution", "native_descriptor_emulation", "input_manifest_sha256", "image_id", "image_projection_sha256",
  "image_rootfs_sha256", "supervisor_sha256", "audit_script_sha256", "process_tree_audit_script_sha256", "runner_sha256", "validator_sha256",
  "docker_cli_sha256", "docker_cli_path", "colima_cli_sha256", "colima_cli_path", "docker_socket_device", "docker_socket_inode",
  "docker_server_version", "linux_kernel_release", "vm_architecture", "vm_memory_bytes", "vm_swap_total_bytes", "vm_audit_python_sha256",
  "controller_host_os", "controller_host_machine", "controller_host_translated", "guest_cpuinfo_sha256", "guest_cpu_emulation_status", "native_execution_proof",
  "stdout_sha256", "stdout_size", "stdout_initial_device", "stdout_initial_inode", "stdout_initial_size", "stdout_device",
  "stdout_inode", "stdout_mtime_ns", "stdout_ctime_ns", "stderr_sha256", "stderr_size", "stderr_initial_device",
  "stderr_initial_inode", "stderr_initial_size", "stderr_device", "stderr_inode", "stderr_mtime_ns", "stderr_ctime_ns",
  "output_identity_schema", "output_path_history_monitor", "output_path_history_status", "output_path_history_forbidden_events", "control_stderr_sha256", "control_stderr_size",
  "current_source_binding_status", "source_closure_cid", "source_closure_capture_sha256", "current_driver_sha256", "current_build_receipt_sha256",
  "current_entry_path", "current_entry_module_path", "current_entry_sha256", "current_driver_container_path",
  "current_driver_initial_device", "current_driver_initial_inode", "current_driver_initial_size", "current_driver_initial_mtime_ns", "current_driver_initial_ctime_ns", "current_driver_final_device",
  "current_driver_final_inode", "current_driver_final_size", "current_driver_final_mtime_ns", "current_driver_final_ctime_ns", "current_driver_path_history_monitor", "current_driver_path_history_status",
  "current_driver_path_history_forbidden_events", "process_tree_audit_status", "container_cleanup_status", "cgroup_cleanup_status", "cleanup_container_inspect_rc", "cleanup_container_list_rc",
  "cleanup_cgroup_probe_rc", "artifact_manifest_schema", "artifact_manifest_sha256", "output_manifest_sha256", "artifact_count", "receipt_sha256",
] as const;

const HARD_GATE_ARTIFACT_NAMES = [
  "config.json", "control-env.json", "gate-runner.py", "receipt-validator.py", "native-descriptor.kv", "input-manifest.json",
  "stdout.bin", "stderr.bin", "control-stderr.bin", "colima-status.txt", "colima-status.txt.stderr.bin", "docker-info.json",
  "docker-info.json.stderr.bin", "docker-version.json", "docker-version.json.stderr.bin", "image-inspect.json", "image-inspect.json.stderr.bin",
  "container-create.stderr.bin", "container-inspect-before.json", "audit-before.json", "audit-before.stderr.bin", "audit-during.json",
  "audit-during.stderr.bin", "container-inspect-after.json", "audit-after.json", "audit-after.stderr.bin", "container-inspect-final.json",
  "container-remove.stderr.bin", "control-transcript.json", "cleanup-audit.json", "cleanup-audit.stderr.bin",
] as const;

function parseHardGateReceipt(raw: Buffer, label: string): ReadonlyMap<string, string> {
  const rows = parseExternalKv(raw, label);
  exactMapKeyOrder(rows, HARD_GATE_RECEIPT_KEYS, label);
  const text = raw.toString("utf8"); const suffix = `receipt_sha256=${rows.get("receipt_sha256")}\n`; if (!text.endsWith(suffix)) fail(`${label}: receipt_sha256 位置`);
  if (sha256(Buffer.from(text.slice(0, -suffix.length), "utf8")) !== rows.get("receipt_sha256")) fail(`${label}: receipt_sha256 不匹配`);
  if (rows.get("tool") !== "tools/beat_c_linux_cgroup_v2_hard_memory_gate.sh" || rows.get("schema") !== "beat_c_linux_cgroup_v2_hard_memory_gate") fail(`${label}: 非当前无版本 hard gate wire`);
  const attackZeroShaKeys = new Set([
    "source_closure_capture_sha256",
    "current_driver_sha256",
    "current_build_receipt_sha256",
    "current_entry_sha256",
  ]);
  for (const key of HARD_GATE_RECEIPT_KEYS.filter((key) => key.endsWith("sha256") && key !== "receipt_sha256")) {
    hex32(
      rows.get(key) ?? "",
      `${label}.${key}`,
      rows.get("mode") === "aggregate_oom_probe"
        && attackZeroShaKeys.has(key),
    );
  }
  return rows;
}

export function verifyLinuxMemoryReceipt(raw: Buffer, label: string, expectedMode: "workload" | "aggregate_oom_probe"): ReadonlyMap<string, string> {
  const rows = parseHardGateReceipt(raw, label);
  const nativeProof = "controller_guest_same_isa_and_guest_cpuinfo_no_qemu_tcg";
  const normalizeMachine = (value: string | undefined): string => {
    if (value === "x86_64" || value === "amd64") return "x86_64";
    if (value === "aarch64" || value === "arm64") return "aarch64";
    fail(`${label}: 非法 ISA`);
  };
  if (rows.get("memory_limit_bytes") !== "1073741824" || rows.get("memory_swap_max_bytes") !== "0" || rows.get("memory_and_swap_total_limit_bytes") !== "1073741824") fail(`${label}: 非 exact Linux 1GiB/swap=0`);
  if (rows.get("applicability") !== "linux_colima_container_cgroup_v2_only" || rows.get("hard_memory_limit_proof_status") !== "proved_linux_kernel_cgroup_v2_aggregate" || rows.get("memory_enforcement_scope") !== "container_and_all_descendants" || rows.get("cgroup_mount_type") !== "cgroup2") fail(`${label}: 非 Linux cgroup v2 进程树证明`);
  if (rows.get("darwin_official_driver_status") !== "not_covered_macho_cannot_execute_in_linux_vm" || rows.get("output_identity_schema") !== "beat_c_linux_cgroup_v2_output_identity" || rows.get("output_path_history_monitor") !== "darwin_kqueue_vnode" || rows.get("output_path_history_status") !== "verified_clean" || rows.get("output_path_history_forbidden_events") !== "delete,link,rename,revoke" || rows.get("control_stderr_size") !== "0") fail(`${label}: hard gate 输出/路径历史合同`);
  const machine = normalizeMachine(rows.get("native_descriptor_machine"));
  const descriptorEntry = officialEntrySpec(
    rows.get("native_descriptor_candidate_entry_path"),
    rows.get("native_descriptor_candidate_entry_module_path"),
    `${label}.native_descriptor_candidate_entry`,
  );
  const descriptorEntrySha256 = hex32(
    rows.get("native_descriptor_candidate_entry_sha256") ?? "",
    `${label}.native_descriptor_candidate_entry_sha256`,
  );
  if (
    normalizeMachine(rows.get("vm_architecture")) !== machine
    || normalizeMachine(rows.get("controller_host_machine")) !== machine
    || rows.get("native_descriptor_controller_host_machine") !== machine
    || rows.get("controller_host_os") !== "darwin"
    || rows.get("controller_host_translated") !== "false"
    || rows.get("native_descriptor_controller_host_os") !== "darwin"
    || rows.get("native_descriptor_controller_host_translated") !== "false"
    || rows.get("native_descriptor_native_execution") !== "true"
    || rows.get("native_descriptor_emulation") !== "false"
    || rows.get("guest_cpu_emulation_status") !== "not_detected"
    || rows.get("native_execution_proof") !== nativeProof
    || rows.get("native_descriptor_native_execution_proof") !== nativeProof
    || rows.get("native_descriptor_source_closure_cid") === undefined
    || hex32(rows.get("native_descriptor_source_closure_cid") ?? "", `${label}.native_descriptor_source_closure_cid`) !== rows.get("native_descriptor_source_closure_cid")
  ) fail(`${label}: native controller/guest/ELF 身份链不成立`);
  if (rows.get("mode") !== expectedMode) fail(`${label}: mode 不匹配`);
  const beforeMax = uintRow(rows, "memory_events_before_max", label); const beforeOom = uintRow(rows, "memory_events_before_oom", label); const beforeKill = uintRow(rows, "memory_events_before_oom_kill", label);
  const afterMax = uintRow(rows, "memory_events_after_max", label); const afterOom = uintRow(rows, "memory_events_after_oom", label); const afterKill = uintRow(rows, "memory_events_after_oom_kill", label);
  const peak = uintRow(rows, "memory_peak_after_bytes", label); if (peak > 1_073_741_824) fail(`${label}: memory.peak 超 1GiB`);
  if (expectedMode === "aggregate_oom_probe") {
    if (rows.get("status") !== "expected_aggregate_oom_rejected" || rows.get("attack_child_count") !== "2" || rows.get("attack_child_bytes") !== "734003200" || rows.get("attack_aggregate_bytes") !== "1468006400") fail(`${label}: 不是双 700MiB 聚合 OOM 反证`);
    const childOne = intRow(rows, "attack_child_one_rc", label); const childTwo = intRow(rows, "attack_child_two_rc", label); if (beforeMax !== 0 || beforeOom !== 0 || beforeKill !== 0 || afterMax <= beforeMax || afterOom <= beforeOom || afterKill <= beforeKill || intRow(rows, "workload_rc", label) !== 42 || ![0, 137].includes(childOne) || ![0, 137].includes(childTwo) || ![childOne, childTwo].includes(137) || intRow(rows, "docker_attach_rc", label) !== 42 || intRow(rows, "container_exit_code", label) !== 42 || rows.get("container_oom_killed_before") !== "0" || rows.get("container_oom_killed_after") !== "1" || rows.get("container_oom_killed_final") !== "1") fail(`${label}: 缺 kernel OOM kill/退出元组证据`);
    if (
      rows.get("current_source_binding_status") !== "not_applicable_attack_probe"
      || rows.get("source_closure_cid") !== "0".repeat(64)
      || rows.get("source_closure_capture_sha256") !== "0".repeat(64)
      || rows.get("current_driver_sha256") !== "0".repeat(64)
      || rows.get("current_build_receipt_sha256") !== "0".repeat(64)
      || rows.get("current_entry_path") !== ""
      || rows.get("current_entry_module_path") !== ""
      || rows.get("current_entry_sha256") !== "0".repeat(64)
    ) fail(`${label}: attack probe 伪造 current source 绑定`);
  } else {
    if (rows.get("status") !== "completed" || rows.get("attack_child_count") !== "0" || rows.get("attack_child_bytes") !== "0" || rows.get("attack_aggregate_bytes") !== "0") fail(`${label}: workload 状态/攻击维度错误`);
    if (EVENT_KEYS.some((key) => uintRow(rows, `memory_events_after_${key}`, label) !== 0) || afterMax !== beforeMax || afterOom !== beforeOom || afterKill !== beforeKill || rows.get("workload_rc") !== "0" || rows.get("attack_child_one_rc") !== "-1" || rows.get("attack_child_two_rc") !== "-1" || rows.get("docker_attach_rc") !== "0" || rows.get("container_exit_code") !== "0" || rows.get("container_oom_killed_before") !== "0" || rows.get("container_oom_killed_after") !== "0" || rows.get("container_oom_killed_final") !== "0") fail(`${label}: workload 发生 OOM/退出失败`);
    if (
      rows.get("current_source_binding_status") !== "bound_unique_current"
      || rows.get("source_closure_cid") !== rows.get("native_descriptor_source_closure_cid")
      || rows.get("source_closure_capture_sha256") !== rows.get("native_descriptor_source_closure_capture_sha256")
      || rows.get("current_driver_sha256") !== rows.get("native_descriptor_worker_sha256")
      || rows.get("current_build_receipt_sha256") !== rows.get("native_descriptor_candidate_build_receipt_sha256")
      || rows.get("current_entry_path") !== descriptorEntry.path
      || rows.get("current_entry_module_path") !== descriptorEntry.modulePath
      || rows.get("current_entry_sha256") !== descriptorEntrySha256
    ) fail(`${label}: current source/CID/worker 本机绑定不成立`);
  }
  return rows;
}

function parseJsonRaw(raw: Buffer, label: string, canonical = false): unknown {
  const text = new TextDecoder("utf-8", {fatal: true}).decode(raw);
  if (!text.endsWith("\n") || text.endsWith("\n\n") || text.includes("\r") || text.includes("\0")) fail(`${label}: 非 canonical JSON 换行`);
  let value: unknown; try { value = JSON.parse(text); } catch { fail(`${label}: 非法 JSON`); }
  if (canonical && canonicalJson(value) + "\n" !== text) fail(`${label}: JSON 非 canonical`);
  return value;
}

function parseSingleton(raw: Buffer, label: string): Record<string, unknown> {
  const value = parseJsonRaw(raw, label);
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) fail(`${label}: 不是 singleton inspect array`);
  return value[0];
}

function artifactManifest(files: EvidenceFiles, refs: CgroupRunRefs, receipt: ReadonlyMap<string, string>, label: string): void {
  const raw = files.read(refs.artifacts.artifact_manifest, `${label}.artifact_manifest`); const value = parseJsonRaw(raw, `${label}.artifact_manifest`, true);
  if (!isRecord(value)) fail(`${label}: artifact manifest 非 object`); exactKeys(value, ["entries", "schema"], `${label}.artifact_manifest`);
  if (value.schema !== "beat_c_linux_cgroup_v2_artifacts" || receipt.get("artifact_manifest_schema") !== value.schema || receipt.get("artifact_manifest_sha256") !== sha256(raw) || receipt.get("output_manifest_sha256") !== sha256(raw)) fail(`${label}: artifact manifest identity`);
  if (!Array.isArray(value.entries) || value.entries.length !== HARD_GATE_ARTIFACT_NAMES.length || receipt.get("artifact_count") !== String(value.entries.length)) fail(`${label}: artifact manifest count`);
  const byName = new Map<string, {sha256: string; size: number}>();
  for (let i = 0; i < value.entries.length; i += 1) {
    const entry = value.entries[i]; if (!isRecord(entry)) fail(`${label}: artifact entry`); exactKeys(entry, ["path", "sha256", "size"], `${label}.entries[${i}]`);
    const path = stringField(entry, "path", `${label}.entries[${i}]`); if (path !== HARD_GATE_ARTIFACT_NAMES[i]) fail(`${label}: artifact manifest path order`);
    byName.set(path, {sha256: hex32(stringField(entry, "sha256", `${label}.entries[${i}]`), `${label}.${path}.sha256`), size: uintField(entry, "size", `${label}.entries[${i}]`)});
  }
  for (const [role, path] of Object.entries(CGROUP_ROLE_FILE)) {
    const item = files.read(refs.artifacts[role], `${label}.${role}`); const recorded = byName.get(path);
    if (!recorded || recorded.size !== item.length || recorded.sha256 !== sha256(item)) fail(`${label}: artifact manifest/raw ${path}`);
  }
}

const AUDIT_KEYS = ["auditPythonPath", "auditPythonSha256", "cgroupDevice", "cgroupFreeze", "cgroupInode", "cgroupMountType", "cgroupOomGroup", "cgroupPath", "cgroupProcs", "cgroupType", "containerId", "containerInitPid", "kernelRelease", "memoryCurrent", "memoryEvents", "memoryEventsLocal", "memoryMax", "memoryPeak", "memorySwapCurrent", "memorySwapMax", "procCgroupLine", "schema", "source", "vmMemTotalBytes", "vmSwapTotalBytes"] as const;
const EVENT_KEYS = ["high", "low", "max", "oom", "oom_group_kill", "oom_kill"] as const;

function auditObject(raw: Buffer, label: string): Record<string, unknown> {
  const value = parseJsonRaw(raw, label, true); if (!isRecord(value)) fail(`${label}: 非 object`); exactKeys(value, AUDIT_KEYS, label);
  if (value.schema !== "beat_c_linux_cgroup_v2_audit" || value.source !== "colima_vm_host_cgroup_namespace" || value.cgroupMountType !== "cgroup2" || value.cgroupType !== "domain" || value.memoryMax !== 1_073_741_824 || value.memorySwapMax !== 0) fail(`${label}: 非 exact cgroup v2 audit`);
  for (const field of ["memoryEvents", "memoryEventsLocal"] as const) { const events = value[field]; if (!isRecord(events)) fail(`${label}.${field}`); exactKeys(events, EVENT_KEYS, `${label}.${field}`); for (const key of EVENT_KEYS) if (!Number.isSafeInteger(events[key]) || (events[key] as number) < 0) fail(`${label}.${field}.${key}`); }
  if (canonicalJson(value.memoryEvents) !== canonicalJson(value.memoryEventsLocal)) fail(`${label}: local/hierarchical events drift`);
  if (typeof value.containerId !== "string" || !/^[0-9a-f]{64}$/.test(value.containerId) || !Number.isSafeInteger(value.containerInitPid) || (value.containerInitPid as number) <= 0 || value.cgroupPath !== `/docker/${value.containerId}` || value.procCgroupLine !== `0::${value.cgroupPath}` || value.cgroupFreeze !== 0 || value.cgroupOomGroup !== 0 || !Array.isArray(value.cgroupProcs) || !value.cgroupProcs.includes(value.containerInitPid)) fail(`${label}: cgroup/container membership`);
  for (const field of ["memoryCurrent", "memoryPeak", "memorySwapCurrent"] as const) if (!Number.isSafeInteger(value[field]) || (value[field] as number) < 0) fail(`${label}.${field}`); if ((value.memoryCurrent as number) > 1_073_741_824 || (value.memoryPeak as number) > 1_073_741_824 || value.memorySwapCurrent !== 0 || typeof value.auditPythonSha256 !== "string" || !HEX32.test(value.auditPythonSha256)) fail(`${label}: memory/audit identity`);
  return value;
}

function processTreeAuditObject(raw: Buffer, receipt: ReadonlyMap<string, string>, label: string): Record<string, unknown> {
  const value = parseJsonRaw(raw, label, true); if (!isRecord(value)) fail(`${label}: 非 object`);
  exactKeys(value, ["capturedWhileTargetRunning", "cgroupDevice", "cgroupInode", "cgroupMountType", "cgroupPath", "cgroupProcs", "containerId", "containerInitPid", "emulation", "guestCpuEmulationStatus", "guestCpuInfoSha256", "hostMachine", "memoryCurrent", "memoryMax", "memoryPeak", "memorySwapCurrent", "memorySwapMax", "nativeExecution", "nativeExecutionProof", "processes", "schema", "source", "targetArgvSha256", "targetElfMachine", "targetExePath", "targetExeSha256"], label);
  if (
    value.schema !== "beat_c_linux_cgroup_v2_process_tree_audit"
    || value.source !== "colima_vm_host_cgroup_namespace"
    || value.containerId !== receipt.get("container_id")
    || value.cgroupPath !== receipt.get("cgroup_path")
    || String(value.cgroupDevice) !== receipt.get("cgroup_device")
    || String(value.cgroupInode) !== receipt.get("cgroup_inode")
    || value.cgroupMountType !== "cgroup2"
    || value.memoryMax !== 1_073_741_824
    || value.memorySwapMax !== 0
    || value.memorySwapCurrent !== 0
    || value.capturedWhileTargetRunning !== true
    || value.hostMachine !== receipt.get("native_descriptor_machine")
    || value.guestCpuInfoSha256 !== receipt.get("guest_cpuinfo_sha256")
    || value.guestCpuEmulationStatus !== "not_detected"
    || value.nativeExecutionProof !== receipt.get("native_execution_proof")
    || value.nativeExecution !== true
    || value.emulation !== false
    || value.targetArgvSha256 !== receipt.get("target_argv_sha256")
  ) fail(`${label}: native process-tree audit 身份链`);
  if (!Array.isArray(value.cgroupProcs) || !Array.isArray(value.processes) || value.processes.length < 2) fail(`${label}: process tree 缺失`);
  const processIds = new Set<number>();
  for (const [index, row] of value.processes.entries()) {
    if (!isRecord(row)) fail(`${label}.processes[${index}]`);
    exactKeys(row, ["pid", "ppid", "procCgroupLine", "role"], `${label}.processes[${index}]`);
    if (!Number.isSafeInteger(row.pid) || (row.pid as number) <= 0 || processIds.has(row.pid as number) || !Number.isSafeInteger(row.ppid) || (row.ppid as number) < 0 || !["supervisor", "target", "descendant", "attack_child"].includes(String(row.role)) || row.procCgroupLine !== `0::${value.cgroupPath}`) fail(`${label}: process row 身份`);
    processIds.add(row.pid as number);
  }
  if (canonicalJson([...processIds].sort((a, b) => a - b)) !== canonicalJson(value.cgroupProcs)) fail(`${label}: cgroup.procs/process tree 不一致`);
  if (receipt.get("mode") === "workload") {
    if (
      value.targetElfMachine !== receipt.get("native_descriptor_machine")
      || value.targetExePath !== CID_CURRENT_DRIVER_CONTAINER_PATH
      || value.targetExeSha256 !== receipt.get("current_driver_sha256")
      || value.processes.filter((row) => isRecord(row) && row.role === "target").length !== 1
    ) fail(`${label}: workload ELF/current worker 身份`);
  } else if (
    value.targetElfMachine !== ""
    || value.targetExePath !== ""
    || value.targetExeSha256 !== "0".repeat(64)
    || value.processes.filter((row) => isRecord(row) && row.role === "attack_child").length !== 2
  ) fail(`${label}: attack process-tree 身份`);
  return value;
}

function cleanupAuditObject(raw: Buffer, receipt: ReadonlyMap<string, string>, label: string): void {
  const value = parseJsonRaw(raw, label, true); if (!isRecord(value)) fail(`${label}: 非 object`);
  exactKeys(value, ["cgroupDevice", "cgroupInode", "cgroupPath", "cgroupPathExists", "cgroupProbeRc", "containerId", "dockerContainerListCount", "dockerContainerListRc", "dockerInspectRc", "dockerInspectStdoutSize", "schema", "source"], label);
  if (
    value.schema !== "beat_c_linux_cgroup_v2_cleanup_audit"
    || value.source !== "docker_and_colima_vm_host_cgroup_namespace"
    || value.containerId !== receipt.get("container_id")
    || value.cgroupPath !== receipt.get("cgroup_path")
    || String(value.cgroupDevice) !== receipt.get("cgroup_device")
    || String(value.cgroupInode) !== receipt.get("cgroup_inode")
    || value.cgroupPathExists !== false
    || value.dockerInspectRc !== 1
    || value.dockerInspectStdoutSize !== 0
    || value.dockerContainerListRc !== 0
    || value.dockerContainerListCount !== 0
    || value.cgroupProbeRc !== 0
  ) fail(`${label}: cleanup identity`);
}

function containerProjection(value: Record<string, unknown>): Record<string, unknown> {
  const config = value.Config; const host = value.HostConfig; const mounts = value.Mounts;
  if (!isRecord(config) || !isRecord(host) || !Array.isArray(mounts)) fail("cgroup container inspect: config absent");
  const mountRows = mounts.map((item) => { if (!isRecord(item)) fail("cgroup mount row"); return {Type: item.Type, Source: item.Source, Destination: item.Destination, Mode: item.Mode, RW: item.RW, Propagation: item.Propagation}; }).sort((a, b) => String(a.Destination).localeCompare(String(b.Destination)));
  return {Image: value.Image, Config: {Hostname: config.Hostname, User: config.User, Env: config.Env, Cmd: config.Cmd, Entrypoint: config.Entrypoint, OpenStdin: config.OpenStdin, StdinOnce: config.StdinOnce, WorkingDir: config.WorkingDir, Labels: config.Labels}, HostConfig: {Memory: host.Memory, MemorySwap: host.MemorySwap, NetworkMode: host.NetworkMode, ReadonlyRootfs: host.ReadonlyRootfs, CapDrop: host.CapDrop, SecurityOpt: host.SecurityOpt, PidsLimit: host.PidsLimit, ShmSize: host.ShmSize, CgroupnsMode: host.CgroupnsMode, IpcMode: host.IpcMode, OomKillDisable: host.OomKillDisable, AutoRemove: host.AutoRemove}, Mounts: mountRows};
}

function sha256FramedStrings(values: readonly string[]): string {
  const chunks: Buffer[] = []; for (const value of values) { const raw = Buffer.from(value); const length = Buffer.alloc(8); length.writeBigUInt64BE(BigInt(raw.length)); chunks.push(length, raw); } return sha256(Buffer.concat(chunks));
}

export function cidCaseTargetArgv(
  caseId: string,
  candidateSha256: string,
): readonly string[] {
  if (
    caseId.length === 0
    || caseId.trim() !== caseId
    || /[\x00-\x1f\x7f]/.test(caseId)
  ) {
    fail("CID case target argv: case_id 非 canonical");
  }
  hex32(candidateSha256, "CID case target argv.candidate_sha256");
  return Object.freeze([
    CID_CURRENT_DRIVER_CONTAINER_PATH,
    CID_CURRENT_DRIVER_RUN_CASE_COMMAND,
    caseId,
    candidateSha256,
  ]);
}

export function verifyCidCaseControllerBinding(
  receipt: ReadonlyMap<string, string>,
  caseId: string,
  candidateSha256: string,
  candidateEntryPath: keyof typeof CID_OFFICIAL_ENTRY_SPECS,
  candidateEntryModulePath:
    typeof CID_OFFICIAL_ENTRY_SPECS[keyof typeof CID_OFFICIAL_ENTRY_SPECS],
  candidateEntrySha256: string,
  label = "CID case controller",
): void {
  const entry = officialEntrySpec(
    candidateEntryPath,
    candidateEntryModulePath,
    label,
  );
  hex32(candidateEntrySha256, `${label}.candidate_entry_sha256`);
  const expectedArgv = cidCaseTargetArgv(caseId, candidateSha256);
  const expectedArgvSha256 = sha256FramedStrings(expectedArgv);
  const workerPathFshex = Buffer.from(
    CID_CURRENT_DRIVER_CONTAINER_PATH,
    "utf8",
  ).toString("hex");
  const expected = new Map<string, string>([
    ["current_source_binding_status", "bound_unique_current"],
    ["current_driver_container_path", CID_CURRENT_DRIVER_CONTAINER_PATH],
    ["current_driver_sha256", candidateSha256],
    ["current_entry_path", entry.path],
    ["current_entry_module_path", entry.modulePath],
    ["current_entry_sha256", candidateEntrySha256],
    ["native_descriptor_candidate_entry_path", entry.path],
    ["native_descriptor_candidate_entry_module_path", entry.modulePath],
    ["native_descriptor_candidate_entry_sha256", candidateEntrySha256],
    ["native_descriptor_worker_path_in_image_fshex", workerPathFshex],
    ["native_descriptor_worker_sha256", candidateSha256],
    ["target_argv_count", String(expectedArgv.length)],
    ["target_argv_sha256", expectedArgvSha256],
    ["native_descriptor_target_argv_encoding",
      CID_DESCRIPTOR_SEQUENCE_ENCODING],
    ["native_descriptor_target_argv_count", String(expectedArgv.length)],
    ["native_descriptor_target_argv_sha256", expectedArgvSha256],
  ]);
  for (const [key, value] of expected) {
    if (receipt.get(key) !== value) {
      fail(`${label}: ${key} 未绑定 driver-owned run-case`);
    }
  }
  if (
    receipt.get("native_descriptor_target_env_encoding")
      !== CID_DESCRIPTOR_SEQUENCE_ENCODING
    || receipt.get("native_descriptor_target_env_count")
      !== receipt.get("target_env_count")
    || receipt.get("native_descriptor_target_env_sha256")
      !== receipt.get("target_env_sha256")
    || receipt.get("native_descriptor_image_id") !== receipt.get("image_id")
    || receipt.get("native_descriptor_candidate_build_receipt_sha256")
      !== receipt.get("current_build_receipt_sha256")
    || receipt.get("native_descriptor_source_closure_cid")
      !== receipt.get("source_closure_cid")
    || receipt.get("native_descriptor_source_closure_capture_sha256")
      !== receipt.get("source_closure_capture_sha256")
  ) {
    fail(`${label}: descriptor source/image/argv/env hash binding`);
  }
}

export function verifyNativeDescriptorReceiptBinding(
  descriptor: ReadonlyMap<string, string>,
  receipt: ReadonlyMap<string, string>,
  label = "native descriptor",
): void {
  const fixed = new Map<string, string>([
    ["schema", "cheng.backend2.current_source_native_executor"],
    ["status", "CONFIGURED"],
    ["host_os", "linux"],
    ["execution_environment", "controlled_cgroup_v2"],
    ["native_execution", "true"],
    ["emulation", "false"],
    ["controller_host_os", "darwin"],
    ["controller_host_translated", "false"],
    ["native_execution_proof",
      "controller_guest_same_isa_and_guest_cpuinfo_no_qemu_tcg"],
    ["cgroup_version", "2"],
    ["cgroup_mount_type", "cgroup2"],
    ["memory_enforcement_scope", "container_and_all_descendants"],
    ["memory_max_bytes", "1073741824"],
    ["memory_swap_max_bytes", "0"],
    ["memory_and_swap_total_limit_bytes", "1073741824"],
    ["backend_count", "2"],
    ["backend.0.name", "primary"],
    ["backend.1.name", "backend2"],
    ["target_argv_encoding", CID_DESCRIPTOR_SEQUENCE_ENCODING],
    ["target_env_encoding", CID_DESCRIPTOR_SEQUENCE_ENCODING],
  ]);
  for (const [key, expected] of fixed) {
    if (descriptor.get(key) !== expected) {
      fail(`${label}: descriptor fixed field ${key}`);
    }
  }
  const descriptorTarget = descriptor.get("target");
  const descriptorMachine = descriptor.get("machine");
  officialEntrySpec(
    descriptor.get("candidate_entry_path"),
    descriptor.get("candidate_entry_module_path"),
    label,
  );
  hex32(
    descriptor.get("candidate_entry_sha256") ?? "",
    `${label}.candidate_entry_sha256`,
  );
  const expectedMachine = descriptorTarget === "x86_64-unknown-linux-gnu"
    ? "x86_64"
    : descriptorTarget === "aarch64-unknown-linux-gnu"
      ? "aarch64"
      : "";
  if (
    expectedMachine.length === 0
    || descriptorMachine !== expectedMachine
    || descriptor.get("controller_host_machine") !== expectedMachine
  ) {
    fail(`${label}: descriptor target/machine/controller`);
  }
  const fieldPairs: readonly (readonly [string, string])[] = [
    ["schema", "native_descriptor_schema"],
    ["target", "native_descriptor_target"],
    ["machine", "native_descriptor_machine"],
    ["image_id", "native_descriptor_image_id"],
    ["worker_path_in_image_fshex",
      "native_descriptor_worker_path_in_image_fshex"],
    ["worker_sha256", "native_descriptor_worker_sha256"],
    ["source_closure_cid", "native_descriptor_source_closure_cid"],
    ["source_closure_capture_sha256",
      "native_descriptor_source_closure_capture_sha256"],
    ["candidate_build_receipt_path_fshex",
      "native_descriptor_candidate_build_receipt_path_fshex"],
    ["candidate_build_receipt_sha256",
      "native_descriptor_candidate_build_receipt_sha256"],
    ["candidate_entry_path",
      "native_descriptor_candidate_entry_path"],
    ["candidate_entry_module_path",
      "native_descriptor_candidate_entry_module_path"],
    ["candidate_entry_sha256",
      "native_descriptor_candidate_entry_sha256"],
    ["controller_host_os", "native_descriptor_controller_host_os"],
    ["controller_host_machine",
      "native_descriptor_controller_host_machine"],
    ["controller_host_translated",
      "native_descriptor_controller_host_translated"],
    ["native_execution_proof",
      "native_descriptor_native_execution_proof"],
    ["native_execution", "native_descriptor_native_execution"],
    ["emulation", "native_descriptor_emulation"],
    ["target_argv_encoding",
      "native_descriptor_target_argv_encoding"],
    ["target_argv_count", "native_descriptor_target_argv_count"],
    ["target_argv_sha256", "native_descriptor_target_argv_sha256"],
    ["target_env_encoding", "native_descriptor_target_env_encoding"],
    ["target_env_count", "native_descriptor_target_env_count"],
    ["target_env_sha256", "native_descriptor_target_env_sha256"],
    ["cgroup_producer_sha256",
      "native_descriptor_cgroup_producer_sha256"],
    ["cgroup_validator_sha256",
      "native_descriptor_cgroup_validator_sha256"],
    ["cgroup_version", "native_descriptor_cgroup_version"],
    ["cgroup_mount_type", "native_descriptor_cgroup_mount_type"],
    ["memory_enforcement_scope",
      "native_descriptor_memory_enforcement_scope"],
    ["memory_max_bytes", "native_descriptor_memory_max_bytes"],
    ["memory_swap_max_bytes",
      "native_descriptor_memory_swap_max_bytes"],
    ["memory_and_swap_total_limit_bytes",
      "native_descriptor_memory_and_swap_total_limit_bytes"],
    ["descriptor_payload_sha256",
      "native_descriptor_payload_sha256"],
  ];
  for (const [descriptorKey, receiptKey] of fieldPairs) {
    const descriptorValue = descriptor.get(descriptorKey);
    const receiptValue = receipt.get(receiptKey);
    if (
      descriptorValue === undefined
      || receiptValue === undefined
      || descriptorValue !== receiptValue
    ) {
      fail(
        `${label}: descriptor/receipt ${descriptorKey}`
          + ` -> ${receiptKey}`,
      );
    }
  }
  const workerPathHex = descriptor.get("worker_path_in_image_fshex") ?? "";
  if (
    !/^(?:[0-9a-f]{2})+$/.test(workerPathHex)
    || Buffer.from(workerPathHex, "hex").toString("utf8")
      !== CID_CURRENT_DRIVER_CONTAINER_PATH
    || Buffer.from(
      Buffer.from(workerPathHex, "hex").toString("utf8"),
      "utf8",
    ).toString("hex") !== workerPathHex
  ) {
    fail(`${label}: descriptor worker path`);
  }
}

function verifyCgroupRun(files: EvidenceFiles, refs: CgroupRunRefs, expectedMode: "workload" | "aggregate_oom_probe", label: string): ReadonlyMap<string, string> {
  const receiptRaw = files.read(refs.artifacts.cgroup_receipt, `${label}.cgroup_receipt`); const receipt = parseHardGateReceipt(receiptRaw, `${label}.cgroup_receipt`); verifyLinuxMemoryReceipt(receiptRaw, `${label}.cgroup_receipt`, expectedMode); artifactManifest(files, refs, receipt, label);
  const stdout = files.read(refs.artifacts.stdout, `${label}.stdout`); const stderr = files.read(refs.artifacts.stderr, `${label}.stderr`);
  if (receipt.get("stdout_sha256") !== sha256(stdout) || receipt.get("stdout_size") !== String(stdout.length) || receipt.get("stderr_sha256") !== sha256(stderr) || receipt.get("stderr_size") !== String(stderr.length)) fail(`${label}: stdout/stderr binding`);
  for (const name of ["stdout", "stderr"] as const) if (receipt.get(`${name}_initial_size`) !== "0" || receipt.get(`${name}_initial_device`) !== receipt.get(`${name}_device`) || receipt.get(`${name}_initial_inode`) !== receipt.get(`${name}_inode`) || uintRow(receipt, `${name}_mtime_ns`, label) <= 0 || uintRow(receipt, `${name}_ctime_ns`, label) <= 0) fail(`${label}: ${name} path identity/history`);
  for (const role of ["cgroup_audit_after_stderr", "cgroup_audit_before_stderr", "cgroup_audit_during_stderr", "cgroup_cleanup_audit_stderr", "cgroup_container_create_stderr", "cgroup_container_remove_stderr", "cgroup_control_stderr", "cgroup_docker_info_stderr", "cgroup_docker_version_stderr", "cgroup_image_inspect_stderr"] as const) if (files.read(refs.artifacts[role], `${label}.${role}`).length !== 0) fail(`${label}: control stderr 非空 ${role}`);
  if (receipt.get("control_stderr_sha256") !== sha256(Buffer.alloc(0))) fail(`${label}: control stderr receipt hash`);
  const before = auditObject(files.read(refs.artifacts.cgroup_audit_before, `${label}.audit_before`), `${label}.audit_before`); const after = auditObject(files.read(refs.artifacts.cgroup_audit_after, `${label}.audit_after`), `${label}.audit_after`);
  for (const key of ["containerId", "cgroupPath", "cgroupDevice", "cgroupInode", "kernelRelease", "auditPythonSha256", "vmMemTotalBytes", "vmSwapTotalBytes"] as const) if (before[key] !== after[key]) fail(`${label}: audit identity drift ${key}`);
  if (before.containerId !== receipt.get("container_id") || before.cgroupPath !== receipt.get("cgroup_path") || String(before.cgroupDevice) !== receipt.get("cgroup_device") || String(before.cgroupInode) !== receipt.get("cgroup_inode")) fail(`${label}: receipt/audit cgroup identity`);
  for (const [receiptKey, auditKey, audit] of [["memory_peak_before_bytes", "memoryPeak", before], ["memory_peak_after_bytes", "memoryPeak", after], ["memory_current_before_bytes", "memoryCurrent", before], ["memory_current_after_bytes", "memoryCurrent", after]] as const) if (receipt.get(receiptKey) !== String(audit[auditKey])) fail(`${label}: receipt/audit ${receiptKey}`);
  const beforeEvents = before.memoryEvents as Record<string, unknown>; const afterEvents = after.memoryEvents as Record<string, unknown>;
  for (const key of EVENT_KEYS) { if (receipt.get(`memory_events_before_${key}`) !== String(beforeEvents[key]) || receipt.get(`memory_events_after_${key}`) !== String(afterEvents[key])) fail(`${label}: receipt/audit event ${key}`); }
  if (EVENT_KEYS.some((key) => beforeEvents[key] !== 0)) fail(`${label}: before events 非零`);
  const during = processTreeAuditObject(files.read(refs.artifacts.cgroup_audit_during, `${label}.audit_during`), receipt, `${label}.audit_during`);
  if ((during.memoryPeak as number) < (during.memoryCurrent as number) || (after.memoryPeak as number) < (during.memoryPeak as number)) fail(`${label}: during memory peak ordering`);
  cleanupAuditObject(files.read(refs.artifacts.cgroup_cleanup_audit, `${label}.cleanup_audit`), receipt, `${label}.cleanup_audit`);
  if (Number(before.vmMemTotalBytes) <= 1_073_741_824 || before.vmSwapTotalBytes !== 0 || receipt.get("vm_memory_bytes") !== String(before.vmMemTotalBytes) || receipt.get("vm_swap_total_bytes") !== "0" || receipt.get("linux_kernel_release") !== before.kernelRelease || receipt.get("vm_audit_python_sha256") !== before.auditPythonSha256) fail(`${label}: VM headroom/swap/audit identity`);
  const beforeInspect = parseSingleton(files.read(refs.artifacts.cgroup_container_before, `${label}.container_before`), `${label}.container_before`); const afterInspect = parseSingleton(files.read(refs.artifacts.cgroup_container_after, `${label}.container_after`), `${label}.container_after`); const finalInspect = parseSingleton(files.read(refs.artifacts.cgroup_container_final, `${label}.container_final`), `${label}.container_final`);
  if ([beforeInspect, afterInspect, finalInspect].some((value) => value.Id !== receipt.get("container_id"))) fail(`${label}: container ID drift`);
  const projection = containerProjection(beforeInspect); if (canonicalJson(projection) !== canonicalJson(containerProjection(afterInspect)) || canonicalJson(projection) !== canonicalJson(containerProjection(finalInspect)) || sha256(Buffer.from(canonicalJson(projection))) !== receipt.get("container_config_sha256")) fail(`${label}: container projection drift/hash`);
  const config = projection.Config as Record<string, unknown>; const host = projection.HostConfig as Record<string, unknown>;
  const expectedHost = {Memory: 1_073_741_824, MemorySwap: 1_073_741_824, NetworkMode: "none", ReadonlyRootfs: true, CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges"], PidsLimit: 128, ShmSize: 2_147_483_648, CgroupnsMode: "private", IpcMode: "private", OomKillDisable: null, AutoRemove: false};
  if (projection.Image !== receipt.get("image_id") || canonicalJson(host) !== canonicalJson(expectedHost) || config.Hostname !== "cheng-hardcap" || !/^[0-9]+:[0-9]+$/.test(String(config.User)) || canonicalJson(config.Entrypoint) !== canonicalJson(["/bin/sh"]) || config.OpenStdin !== true || config.StdinOnce !== true || config.WorkingDir !== "/" || canonicalJson(config.Labels) !== canonicalJson({"cheng.hardcap.schema": "beat_c_linux_cgroup_v2_hard_memory_gate"})) fail(`${label}: container hardening projection`);
  const states = [beforeInspect.State, afterInspect.State, finalInspect.State]; if (states.some((state) => !isRecord(state))) fail(`${label}: container state absent`); const [beforeState, afterState, finalState] = states as Record<string, unknown>[];
  if (String(Number(Boolean(beforeState.OOMKilled))) !== receipt.get("container_oom_killed_before") || String(Number(Boolean(afterState.OOMKilled))) !== receipt.get("container_oom_killed_after") || String(Number(Boolean(finalState.OOMKilled))) !== receipt.get("container_oom_killed_final") || String(finalState.ExitCode) !== receipt.get("container_exit_code")) fail(`${label}: container state/receipt`);
  const image = parseSingleton(files.read(refs.artifacts.cgroup_image_inspect, `${label}.image_inspect`), `${label}.image_inspect`); if (image.Id !== receipt.get("image_id") || image.Os !== "linux" || !isRecord(image.RootFS) || !Array.isArray(image.RootFS.Layers) || image.RootFS.Layers.length === 0) fail(`${label}: image identity/rootfs`);
  const imageProjection = {Id: image.Id, RepoDigests: image.RepoDigests, Os: image.Os, Architecture: image.Architecture, RootFS: image.RootFS, Config: image.Config}; if (sha256(Buffer.from(canonicalJson(imageProjection))) !== receipt.get("image_projection_sha256") || sha256(Buffer.from(canonicalJson(image.RootFS.Layers))) !== receipt.get("image_rootfs_sha256")) fail(`${label}: image projection/rootfs hash`);
  const nativeDescriptorRaw = files.read(refs.artifacts.cgroup_native_descriptor, `${label}.native_descriptor`);
  const nativeDescriptor = parseExternalKv(nativeDescriptorRaw, `${label}.native_descriptor`);
  const nativeDescriptorText = nativeDescriptorRaw.toString("utf8");
  const nativeDescriptorSuffix = `descriptor_payload_sha256=${nativeDescriptor.get("descriptor_payload_sha256")}\n`;
  if (
    receipt.get("native_descriptor_sha256") !== sha256(nativeDescriptorRaw)
    || !nativeDescriptorText.endsWith(nativeDescriptorSuffix)
    || sha256(Buffer.from(nativeDescriptorText.slice(0, -nativeDescriptorSuffix.length))) !== nativeDescriptor.get("descriptor_payload_sha256")
    || nativeDescriptor.get("descriptor_payload_sha256") !== receipt.get("native_descriptor_payload_sha256")
  ) fail(`${label}: native descriptor raw/payload identity`);
  verifyNativeDescriptorReceiptBinding(
    nativeDescriptor,
    receipt,
    `${label}.native_descriptor`,
  );
  const inputRaw = files.read(refs.artifacts.cgroup_input_manifest, `${label}.input_manifest`); const input = parseJsonRaw(inputRaw, `${label}.input_manifest`, true); if (!isRecord(input)) fail(`${label}: input manifest`);
  exactKeys(input, ["auditScriptSha256", "containerArgvSha256", "controlEnvCount", "controlEnvSha256", "controllerHostMachine", "controllerHostOs", "controllerHostTranslated", "currentBuildReceiptSha256", "currentDriverContainerPath", "currentDriverSha256", "currentEntryModulePath", "currentEntryPath", "currentEntrySha256", "currentSourceBindingStatus", "guestCpuEmulationStatus", "guestCpuInfoSha256", "imageId", "imageProjectionSha256", "imageRootfsSha256", "memoryMax", "memorySwapMax", "mode", "nativeDescriptorCandidateBuildReceiptPathFshex", "nativeDescriptorCandidateBuildReceiptSha256", "nativeDescriptorCandidateEntryModulePath", "nativeDescriptorCandidateEntryPath", "nativeDescriptorCandidateEntrySha256", "nativeDescriptorCgroupMountType", "nativeDescriptorCgroupProducerSha256", "nativeDescriptorCgroupValidatorSha256", "nativeDescriptorCgroupVersion", "nativeDescriptorControllerHostMachine", "nativeDescriptorControllerHostOs", "nativeDescriptorControllerHostTranslated", "nativeDescriptorEmulation", "nativeDescriptorImageId", "nativeDescriptorMachine", "nativeDescriptorMemoryAndSwapTotalLimitBytes", "nativeDescriptorMemoryEnforcementScope", "nativeDescriptorMemoryMaxBytes", "nativeDescriptorMemorySwapMaxBytes", "nativeDescriptorNativeExecution", "nativeDescriptorNativeExecutionProof", "nativeDescriptorOfficialDriverSha256", "nativeDescriptorPathFshex", "nativeDescriptorPayloadSha256", "nativeDescriptorSchema", "nativeDescriptorSha256", "nativeDescriptorSourceClosureCaptureSha256", "nativeDescriptorSourceClosureCid", "nativeDescriptorTarget", "nativeDescriptorTargetArgvCount", "nativeDescriptorTargetArgvEncoding", "nativeDescriptorTargetArgvSha256", "nativeDescriptorTargetEnvCount", "nativeDescriptorTargetEnvEncoding", "nativeDescriptorTargetEnvSha256", "nativeDescriptorWorkerPathInImageFshex", "nativeDescriptorWorkerSha256", "nativeExecutionProof", "processTreeAuditScriptSha256", "runnerSha256", "schema", "sourceClosureCaptureSha256", "sourceClosureCid", "supervisorSha256", "targetArgvCount", "targetArgvSha256", "targetEnvCount", "targetEnvSha256"], `${label}.input_manifest`);
  if (
    input.schema !== "beat_c_linux_cgroup_v2_current_binding"
    || input.mode !== expectedMode
    || input.imageId !== receipt.get("image_id")
    || input.imageProjectionSha256 !== receipt.get("image_projection_sha256")
    || input.imageRootfsSha256 !== receipt.get("image_rootfs_sha256")
    || input.auditScriptSha256 !== receipt.get("audit_script_sha256")
    || input.processTreeAuditScriptSha256 !== receipt.get("process_tree_audit_script_sha256")
    || input.memoryMax !== 1_073_741_824
    || input.memorySwapMax !== 0
    || input.sourceClosureCid !== receipt.get("source_closure_cid")
    || input.sourceClosureCaptureSha256 !== receipt.get("source_closure_capture_sha256")
    || input.controllerHostMachine !== receipt.get("controller_host_machine")
    || input.guestCpuInfoSha256 !== receipt.get("guest_cpuinfo_sha256")
    || input.nativeExecutionProof !== receipt.get("native_execution_proof")
    || sha256(Buffer.from(canonicalJson(input))) !== receipt.get("input_manifest_sha256")
  ) fail(`${label}: input/receipt binding`);
  const inputReceiptBindings: readonly (
    readonly [keyof typeof input, string]
  )[] = [
    ["controllerHostOs", "controller_host_os"],
    ["controllerHostTranslated", "controller_host_translated"],
    ["currentBuildReceiptSha256", "current_build_receipt_sha256"],
    ["currentDriverContainerPath", "current_driver_container_path"],
    ["currentDriverSha256", "current_driver_sha256"],
    ["currentEntryPath", "current_entry_path"],
    ["currentEntryModulePath", "current_entry_module_path"],
    ["currentEntrySha256", "current_entry_sha256"],
    ["currentSourceBindingStatus", "current_source_binding_status"],
    ["guestCpuEmulationStatus", "guest_cpu_emulation_status"],
    ["nativeDescriptorCandidateBuildReceiptPathFshex",
      "native_descriptor_candidate_build_receipt_path_fshex"],
    ["nativeDescriptorCandidateBuildReceiptSha256",
      "native_descriptor_candidate_build_receipt_sha256"],
    ["nativeDescriptorCandidateEntryPath",
      "native_descriptor_candidate_entry_path"],
    ["nativeDescriptorCandidateEntryModulePath",
      "native_descriptor_candidate_entry_module_path"],
    ["nativeDescriptorCandidateEntrySha256",
      "native_descriptor_candidate_entry_sha256"],
    ["nativeDescriptorCgroupMountType",
      "native_descriptor_cgroup_mount_type"],
    ["nativeDescriptorCgroupProducerSha256",
      "native_descriptor_cgroup_producer_sha256"],
    ["nativeDescriptorCgroupValidatorSha256",
      "native_descriptor_cgroup_validator_sha256"],
    ["nativeDescriptorCgroupVersion", "native_descriptor_cgroup_version"],
    ["nativeDescriptorControllerHostMachine",
      "native_descriptor_controller_host_machine"],
    ["nativeDescriptorControllerHostOs",
      "native_descriptor_controller_host_os"],
    ["nativeDescriptorControllerHostTranslated",
      "native_descriptor_controller_host_translated"],
    ["nativeDescriptorEmulation", "native_descriptor_emulation"],
    ["nativeDescriptorImageId", "native_descriptor_image_id"],
    ["nativeDescriptorMachine", "native_descriptor_machine"],
    ["nativeDescriptorMemoryAndSwapTotalLimitBytes",
      "native_descriptor_memory_and_swap_total_limit_bytes"],
    ["nativeDescriptorMemoryEnforcementScope",
      "native_descriptor_memory_enforcement_scope"],
    ["nativeDescriptorMemoryMaxBytes",
      "native_descriptor_memory_max_bytes"],
    ["nativeDescriptorMemorySwapMaxBytes",
      "native_descriptor_memory_swap_max_bytes"],
    ["nativeDescriptorNativeExecution",
      "native_descriptor_native_execution"],
    ["nativeDescriptorNativeExecutionProof",
      "native_descriptor_native_execution_proof"],
    ["nativeDescriptorOfficialDriverSha256",
      "native_descriptor_official_driver_sha256"],
    ["nativeDescriptorPathFshex", "native_descriptor_path_fshex"],
    ["nativeDescriptorPayloadSha256",
      "native_descriptor_payload_sha256"],
    ["nativeDescriptorSchema", "native_descriptor_schema"],
    ["nativeDescriptorSha256", "native_descriptor_sha256"],
    ["nativeDescriptorSourceClosureCaptureSha256",
      "native_descriptor_source_closure_capture_sha256"],
    ["nativeDescriptorSourceClosureCid",
      "native_descriptor_source_closure_cid"],
    ["nativeDescriptorTarget", "native_descriptor_target"],
    ["nativeDescriptorTargetArgvCount",
      "native_descriptor_target_argv_count"],
    ["nativeDescriptorTargetArgvEncoding",
      "native_descriptor_target_argv_encoding"],
    ["nativeDescriptorTargetArgvSha256",
      "native_descriptor_target_argv_sha256"],
    ["nativeDescriptorTargetEnvCount",
      "native_descriptor_target_env_count"],
    ["nativeDescriptorTargetEnvEncoding",
      "native_descriptor_target_env_encoding"],
    ["nativeDescriptorTargetEnvSha256",
      "native_descriptor_target_env_sha256"],
    ["nativeDescriptorWorkerPathInImageFshex",
      "native_descriptor_worker_path_in_image_fshex"],
    ["nativeDescriptorWorkerSha256",
      "native_descriptor_worker_sha256"],
  ];
  for (const [inputKey, receiptKey] of inputReceiptBindings) {
    if (String(input[inputKey]) !== receipt.get(receiptKey)) {
      fail(`${label}: input/receipt ${String(inputKey)} -> ${receiptKey}`);
    }
  }
  const gateRunner = files.read(refs.artifacts.cgroup_gate_runner, `${label}.gate_runner`); const validator = files.read(refs.artifacts.cgroup_receipt_validator, `${label}.receipt_validator`); if (sha256(gateRunner) !== receipt.get("runner_sha256") || sha256(validator) !== receipt.get("validator_sha256") || input.runnerSha256 !== receipt.get("runner_sha256")) fail(`${label}: gate tool binding`);
  if (!files.read(refs.artifacts.cgroup_config, `${label}.config`).equals(Buffer.from("{}\n")) || !files.read(refs.artifacts.cgroup_colima_status, `${label}.colima_status`).includes(Buffer.from("colima is running"))) fail(`${label}: Docker config/Colima status`);
  const controlEnv = parseJsonRaw(files.read(refs.artifacts.cgroup_control_env, `${label}.control_env`), `${label}.control_env`, true); if (!isRecord(controlEnv)) fail(`${label}: control env`); exactKeys(controlEnv, ["DOCKER_CONFIG", "DOCKER_HOST", "HOME", "LANG", "LC_ALL", "PATH", "TZ"], `${label}.control_env`); const controlRows = Object.keys(controlEnv).sort().map((key) => `${key}=${String(controlEnv[key])}`); if (controlEnv.DOCKER_HOST !== receipt.get("docker_host") || controlEnv.LANG !== "C" || controlEnv.LC_ALL !== "C" || controlEnv.TZ !== "UTC" || controlEnv.PATH !== "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin" || String(controlRows.length) !== receipt.get("control_env_count") || sha256FramedStrings(controlRows) !== receipt.get("control_env_sha256") || input.controlEnvCount !== controlRows.length || input.controlEnvSha256 !== receipt.get("control_env_sha256")) fail(`${label}: control env binding`);
  const transcript = parseJsonRaw(files.read(refs.artifacts.cgroup_control_transcript, `${label}.control_transcript`), `${label}.control_transcript`, true); if (!isRecord(transcript)) fail(`${label}: transcript`); exactKeys(transcript, ["after", "attachRc", "before", "continue", "during", "nonceSha256", "release", "schema"], `${label}.transcript`);
  if (transcript.schema !== "beat_c_linux_cgroup_v2_attach_protocol" || typeof transcript.before !== "string" || typeof transcript.during !== "string" || typeof transcript.continue !== "string" || typeof transcript.after !== "string" || typeof transcript.release !== "string") fail(`${label}: attach protocol`); const match = /^cheng_hardcap_before ([0-9a-f]{64})$/.exec(transcript.before); if (!match || sha256(Buffer.from(match[1])) !== transcript.nonceSha256 || transcript.continue !== `cheng_hardcap_continue ${match[1]}` || !transcript.during.startsWith(`cheng_hardcap_during ${match[1]} `) || transcript.release !== `cheng_hardcap_release ${match[1]}` || transcript.after !== `cheng_hardcap_after ${match[1]} ${receipt.get("workload_rc")} ${receipt.get("attack_child_one_rc")} ${receipt.get("attack_child_two_rc")}` || String(transcript.attachRc) !== receipt.get("docker_attach_rc")) fail(`${label}: attach transcript/receipt`);
  const cmd = config.Cmd; if (!Array.isArray(cmd) || cmd.length < 5 || cmd.some((value) => typeof value !== "string") || cmd[0] !== "-c" || cmd[2] !== "beat-c-hardcap-supervisor" || cmd[3] !== expectedMode || cmd[4] !== match[1] || sha256(Buffer.from(cmd[1] as string)) !== receipt.get("supervisor_sha256") || input.supervisorSha256 !== receipt.get("supervisor_sha256")) fail(`${label}: container supervisor Cmd`); const targetArgv = cmd.slice(5) as string[]; const containerArgv = ["/bin/sh", ...(cmd as string[])]; const fixedEnv = ["HOME=/nonexistent", "LANG=C", "LC_ALL=C", "PATH=/usr/bin:/bin", "TZ=UTC"]; if ((expectedMode === "aggregate_oom_probe" ? targetArgv.length !== 0 : targetArgv.length === 0) || sha256FramedStrings(containerArgv) !== receipt.get("container_argv_sha256") || input.containerArgvSha256 !== receipt.get("container_argv_sha256") || canonicalJson(config.Env) !== canonicalJson(fixedEnv) || receipt.get("target_env_count") !== String(fixedEnv.length) || receipt.get("target_env_sha256") !== sha256FramedStrings(fixedEnv) || input.targetEnvCount !== fixedEnv.length || input.targetEnvSha256 !== receipt.get("target_env_sha256") || sha256FramedStrings(targetArgv) !== receipt.get("target_argv_sha256") || String(targetArgv.length) !== receipt.get("target_argv_count") || input.targetArgvSha256 !== receipt.get("target_argv_sha256") || input.targetArgvCount !== targetArgv.length) fail(`${label}: target argv/env binding`);
  return receipt;
}

export interface VerifiedLinuxCgroupEvidenceDirectory {
  readonly receipt: ReadonlyMap<string, string>;
  readonly receiptSha256: string;
  readonly stdout: Buffer;
  readonly stdoutSha256: string;
}

export function verifyLinuxCgroupEvidenceDirectory(
  evidenceDir: string,
  expectedMode: "workload" | "aggregate_oom_probe",
  label = "linux cgroup evidence",
): VerifiedLinuxCgroupEvidenceDirectory {
  const canonicalDir = resolve(evidenceDir);
  if (canonicalDir !== evidenceDir) fail(`${label}: evidence directory 必须是 canonical absolute path`);
  const rootStat = lstatSync(canonicalDir);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || realpathSync.native(canonicalDir) !== canonicalDir) {
    fail(`${label}: evidence directory 必须是真实目录`);
  }
  const expectedEntries = [
    "artifact-manifest.json",
    ...HARD_GATE_ARTIFACT_NAMES,
    "receipt.kv",
  ].sort();
  const actualEntries = readdirSync(canonicalDir).sort();
  if (actualEntries.length !== expectedEntries.length ||
      actualEntries.some((entry, index) => entry !== expectedEntries[index])) {
    fail(`${label}: evidence directory entries 不精确`);
  }
  const files = new EvidenceFiles(canonicalDir);
  const refs: Record<string, ArtifactRef> = {};
  for (const role of CGROUP_ARTIFACT_ROLES) {
    const path = role === "artifact_manifest"
      ? "artifact-manifest.json"
      : role === "cgroup_receipt"
        ? "receipt.kv"
        : CGROUP_ROLE_FILE[role];
    if (path === undefined) fail(`${label}: cgroup role 未绑定 ${role}`);
    const raw = files.readPath(path, `${label}.${role}.identity`);
    refs[role] = {path, raw_byte_length: raw.length, sha256: sha256(raw)};
  }
  if (new Set(Object.values(refs).map((ref) => ref.path)).size !== CGROUP_ARTIFACT_ROLES.length) {
    fail(`${label}: cgroup artifact path alias`);
  }
  const runRefs: CgroupRunRefs = {artifacts: refs};
  const receipt = verifyCgroupRun(files, runRefs, expectedMode, label);
  const receiptRaw = files.read(refs.cgroup_receipt, `${label}.cgroup_receipt.final`);
  const stdout = files.read(refs.stdout, `${label}.stdout.final`);
  for (const name of ["stdout", "stderr"] as const) {
    const ref = refs[name];
    const stat = lstatSync(files.resolvePath(ref.path), {bigint: true});
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n ||
        String(stat.dev) !== receipt.get(`${name}_device`) ||
        String(stat.ino) !== receipt.get(`${name}_inode`) ||
        String(stat.mtimeNs) !== receipt.get(`${name}_mtime_ns`) ||
        String(stat.ctimeNs) !== receipt.get(`${name}_ctime_ns`)) {
      fail(`${label}: ${name} current path identity 不匹配`);
    }
  }
  return Object.freeze({
    receipt,
    receiptSha256: sha256(receiptRaw),
    stdout,
    stdoutSha256: sha256(stdout),
  });
}

const CANDIDATE_MANIFEST_KEYS = ["schema", "target", "machine", "candidate_entry_path", "candidate_entry_module_path", "candidate_entry_sha256", "toolchain_image_id", "toolchain_config_digest", "toolchain_oci_manifest_digest", "source_tool_manifest_sha256", "source_closure_sha256", "source_entry_count", "tool_closure_sha256", "tool_entry_count", "bootstrap_seed_size", "bootstrap_seed_sha256", "bootstrap_seed_device", "bootstrap_seed_inode", "candidate_device", "candidate_inode", "current_report_origin", "candidate_size", "candidate_sha256", "report_size", "report_sha256", "candidate_execution", "candidate_elf_magic", "candidate_elf_class", "candidate_elf_data", "candidate_elf_machine"] as const;

function splitCandidateBundle(raw: Buffer): {manifest: Buffer; report: Buffer; candidate: Buffer} {
  const separator = raw.indexOf("\n\n"); if (separator < 0) fail("candidate build: bundle header terminator"); const header = raw.subarray(0, separator).toString("ascii").split("\n");
  if (header[0] !== "CHENG_CID_LINUX_CURRENT_SOURCE_CANDIDATE_BUNDLE" || header.length !== 7) fail("candidate build: bundle magic/shape"); const keys = ["manifest_size", "manifest_sha256", "report_size", "report_sha256", "candidate_size", "candidate_sha256"] as const; const rows = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 1) { const prefix = `${keys[i]}=`; if (!header[i + 1].startsWith(prefix)) fail(`candidate build: bundle ${keys[i]}`); rows.set(keys[i], header[i + 1].slice(prefix.length)); }
  const sizes = ["manifest_size", "report_size", "candidate_size"].map((key) => { const value = rows.get(key)!; if (!UINT.test(value)) fail(`candidate build: ${key}`); return Number(value); }); const payload = raw.subarray(separator + 2); if (payload.length !== sizes[0] + sizes[1] + sizes[2]) fail("candidate build: bundle payload size");
  const manifest = payload.subarray(0, sizes[0]); const report = payload.subarray(sizes[0], sizes[0] + sizes[1]); const candidate = payload.subarray(sizes[0] + sizes[1]);
  for (const [name, value] of [["manifest", manifest], ["report", report], ["candidate", candidate]] as const) if (sha256(value) !== rows.get(`${name}_sha256`)) fail(`candidate build: bundle ${name} SHA`);
  if (candidate.length < 64 || !candidate.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || candidate[4] !== 2 || candidate[5] !== 1 || candidate.readUInt16LE(18) !== 62) fail("candidate build: 非 x86_64 ELF64");
  return {manifest, report, candidate};
}

const CASE_IMAGE_BUILD_SCHEMA = "cheng.cid.case_image_build";
const CASE_IMAGE_LABELS = ["cheng.cid.candidate_sha256", "cheng.cid.source_manifest_sha256", "cheng.cid.tool_manifest_sha256"] as const;

function inspectRootfsLayers(value: Record<string, unknown>, label: string): string[] {
  const rootfs = value.RootFS;
  if (!isRecord(rootfs) || rootfs.Type !== "layers" || !Array.isArray(rootfs.Layers) || rootfs.Layers.length === 0) fail(`${label}: RootFS`);
  return rootfs.Layers.map((item, index) => { if (typeof item !== "string" || !/^sha256:[0-9a-f]{64}$/.test(item)) fail(`${label}: RootFS.Layers[${index}]`); return item; });
}

export function assertCidExecutionImageLineage(builderImageId: string, counterexampleImageId: string, caseImageId: string): void {
  for (const [value, label] of [[builderImageId, "builder"], [counterexampleImageId, "counterexample"], [caseImageId, "case"]] as const) if (!/^sha256:[0-9a-f]{64}$/.test(value)) fail(`${label} image id invalid`);
  if (builderImageId === caseImageId) fail("builder/case image lineage invalid");
  if (counterexampleImageId !== builderImageId) fail("counterexample is not bound to builder image");
}

export function verifyCidExecutionImageEvidence(input: {
  readonly builderImageId: string;
  readonly counterexampleImageId: string;
  readonly caseImageId: string;
  readonly builderImageManifestRaw: Buffer;
  readonly counterexampleImageManifestRaw: Buffer;
}): Readonly<{builderImageId: string; caseImageId: string}> {
  assertCidExecutionImageLineage(
    input.builderImageId,
    input.counterexampleImageId,
    input.caseImageId,
  );
  if (!input.counterexampleImageManifestRaw.equals(input.builderImageManifestRaw)) {
    fail("cgroup counterexample: builder image raw identity 不一致");
  }
  return Object.freeze({
    builderImageId: input.builderImageId,
    caseImageId: input.caseImageId,
  });
}

function verifyCaseImage(files: EvidenceFiles, manifest: EvidenceManifest, candidate: Buffer, sourceManifestRaw: Buffer, toolManifestRaw: Buffer, builderReceipt: ReadonlyMap<string, string>, finalInspectRaw: Buffer, finalInspect: Record<string, unknown>): void {
  const candidateSha = sha256(candidate); const sourceSha = sha256(sourceManifestRaw); const toolSha = sha256(toolManifestRaw); const labels = Object.fromEntries(CASE_IMAGE_LABELS.map((key, index) => [key, [candidateSha, sourceSha, toolSha][index]]));
  const runnerEntry = manifest.tool_files.find((entry) => entry.logical_path === "tools/cid_linux_identity_chain_evidence_runner.sh"); if (!runnerEntry) fail("case image: frozen runner missing"); const runnerRaw = files.read(runnerEntry.artifact, "case image runner");
  const layerRaw = files.read(manifest.image_final_layer, "case image final layer"); const members = canonicalCaseImageLayerMembers(layerRaw, "case image final layer"); if (members.size !== 3 || !members.has("cheng-cid") || !members.has("cheng-cid/candidate") || !members.has("cheng-cid/run-case")) fail("case image final layer: exact member set"); const directory = members.get("cheng-cid")!; const candidateMember = members.get("cheng-cid/candidate")!; const runnerMember = members.get("cheng-cid/run-case")!; if (directory.kind !== "directory" || directory.mode !== 0o755 || directory.raw.length !== 0 || candidateMember.kind !== "file" || candidateMember.mode !== 0o555 || !candidateMember.raw.equals(candidate) || runnerMember.kind !== "file" || runnerMember.mode !== 0o555 || !runnerMember.raw.equals(runnerRaw)) fail("case image final layer: candidate/runner raw identity");
  const builderInspect = parseSingleton(files.read(manifest.candidate_build.artifacts.cgroup_image_inspect, "candidate build image inspect"), "candidate build image inspect"); const builderId = builderReceipt.get("image_id"); if (builderInspect.Id !== builderId) fail("case image: builder inspect/receipt identity"); const builderLayers = inspectRootfsLayers(builderInspect, "candidate build image inspect");
  const compressedLayerRaw = files.read(manifest.image_final_layer_gzip, "case image final compressed layer"); const ociManifestRaw = files.read(manifest.image_oci_manifest, "case image OCI manifest"); const configRaw = files.read(manifest.image_config, "case image config"); const finalLayers = inspectRootfsLayers(finalInspect, "case image inspect"); const rawChain = verifyCaseImageRawObjectChain(ociManifestRaw, configRaw, compressedLayerRaw, layerRaw, finalLayers.length, "case image"); const imageId = rawChain.imageId; if (finalInspect.Id !== imageId || finalInspect.Parent !== builderId || finalInspect.Os !== "linux" || finalInspect.Architecture !== "amd64") fail("case image: OCI manifest/parent/platform identity"); const layerDiffId = `sha256:${sha256(layerRaw)}`; if (finalLayers.length !== builderLayers.length + 1 || finalLayers.some((value, index) => value !== (index < builderLayers.length ? builderLayers[index] : layerDiffId))) fail("case image: RootFS is not builder plus exact final layer");
  const config = rawChain.config; exactKeys(config, ["architecture", "config", "created", "history", "os", "rootfs"], "case image config"); const configRootfs = config.rootfs; const runtime = config.config; if (config.architecture !== "amd64" || config.os !== "linux" || !isRecord(configRootfs) || configRootfs.type !== "layers" || canonicalJson(configRootfs.diff_ids) !== canonicalJson(finalLayers) || !isRecord(runtime) || canonicalJson(runtime.Labels) !== canonicalJson(labels) || canonicalJson(runtime.Cmd) !== canonicalJson(["/bin/true"]) || !(runtime.Entrypoint === null || (Array.isArray(runtime.Entrypoint) && runtime.Entrypoint.length === 0))) fail("case image: config rootfs/runtime labels"); const inspectConfig = finalInspect.Config; if (!isRecord(inspectConfig) || canonicalJson(inspectConfig.Labels) !== canonicalJson(labels)) fail("case image: inspect labels");
  const receipt = parseJsonRaw(files.read(manifest.image_build_receipt, "case image build receipt"), "case image build receipt", true); if (!isRecord(receipt)) fail("case image build receipt: not object"); const keys = ["builder_image_id", "candidate_raw_byte_length", "candidate_sha256", "final_layer_raw_byte_length", "final_layer_sha256", "image_config_raw_byte_length", "image_config_sha256", "image_final_layer_gzip_raw_byte_length", "image_final_layer_gzip_sha256", "image_id", "image_manifest_sha256", "image_oci_manifest_raw_byte_length", "image_oci_manifest_sha256", "manifest_sha256", "runner_raw_byte_length", "runner_sha256", "schema", "source_manifest_sha256", "status", "tool_manifest_sha256"]; exactKeys(receipt, keys, "case image build receipt"); const projection = {...receipt}; delete projection.manifest_sha256; const expected = {builder_image_id: builderId, candidate_raw_byte_length: candidate.length, candidate_sha256: candidateSha, final_layer_raw_byte_length: layerRaw.length, final_layer_sha256: sha256(layerRaw), image_config_raw_byte_length: configRaw.length, image_config_sha256: sha256(configRaw), image_final_layer_gzip_raw_byte_length: compressedLayerRaw.length, image_final_layer_gzip_sha256: sha256(compressedLayerRaw), image_id: imageId, image_manifest_sha256: sha256(finalInspectRaw), image_oci_manifest_raw_byte_length: ociManifestRaw.length, image_oci_manifest_sha256: sha256(ociManifestRaw), runner_raw_byte_length: runnerRaw.length, runner_sha256: sha256(runnerRaw), schema: CASE_IMAGE_BUILD_SCHEMA, source_manifest_sha256: sourceSha, status: "built", tool_manifest_sha256: toolSha}; if (canonicalJson(projection) !== canonicalJson(expected) || receipt.manifest_sha256 !== sha256(Buffer.from(canonicalJson(expected)))) fail("case image build receipt: raw identity mismatch");
}

function framedClosure(domain: string, entries: readonly Record<string, unknown>[]): string {
  const chunks: Buffer[] = []; const appendU64 = (value: bigint) => { const raw = Buffer.alloc(8); raw.writeBigUInt64BE(value); chunks.push(raw); }; const domainRaw = Buffer.from(domain); appendU64(BigInt(domainRaw.length)); chunks.push(domainRaw); appendU64(BigInt(entries.length));
  for (const entry of entries) { const path = Buffer.from(String(entry.path)); const digest = Buffer.from(String(entry.sha256), "hex"); appendU64(BigInt(path.length)); chunks.push(path); appendU64(BigInt(entry.size as number)); appendU64(BigInt(digest.length)); chunks.push(digest); } return sha256(Buffer.concat(chunks));
}

interface ClosureIdentity { readonly sha256: string; readonly size: number; }

export interface CidSourcePhaseContractInputs {
  readonly systemLinkPlan: Buffer;
  readonly systemLinkExec: Buffer;
  readonly parser: Buffer;
  readonly parserReceipt: Buffer;
  readonly typedExpr: Buffer;
  readonly snapshotBuilder: Buffer;
  readonly snapshotSchema: Buffer;
  readonly snapshotCargo: Buffer;
  readonly snapshotValidator: Buffer;
  readonly compilerWorld: Buffer;
  readonly sha256: Buffer;
  readonly hash256: Buffer;
  readonly compilerCsg: Buffer;
  readonly backendDriver: Buffer;
  readonly debugSectionPlanReceipt: Buffer;
  readonly directObjectDebugSections: Buffer;
}

function cidSourceText(raw: Buffer, label: string): string {
  let text = "";
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(raw); } catch { fail(`${label}: 非 UTF-8 Cheng source`); }
  if (text.length === 0 || text.includes("\0") || text.includes("\r")) fail(`${label}: 非 canonical Cheng source bytes`);
  return text;
}

function cidTopLevelFunction(text: string, name: string, label: string): string {
  const marker = `fn ${name}(`;
  const first = text.indexOf(marker);
  if (first < 0 || text.indexOf(marker, first + marker.length) >= 0) fail(`${label}: function ${name} 必须唯一`);
  const next = text.indexOf("\nfn ", first + marker.length);
  return text.slice(first, next < 0 ? text.length : next + 1);
}

function cidTypeDeclaration(text: string, name: string, label: string): string {
  const marker = `    ${name} =`;
  const first = text.indexOf(marker);
  if (first < 0 || text.indexOf(marker, first + marker.length) >= 0) fail(`${label}: type ${name} 必须唯一`);
  const tail = text.slice(first + marker.length);
  const nextType = tail.search(/\n    [A-Za-z_][A-Za-z0-9_]* =/);
  const nextFunction = tail.indexOf("\nfn ");
  const ends = [nextType, nextFunction].filter((value) => value >= 0);
  const length = ends.length === 0 ? tail.length : Math.min(...ends);
  return text.slice(first, first + marker.length + length);
}

function cidRequire(body: string, needles: readonly string[], label: string): void {
  for (const needle of needles) if (!body.includes(needle)) fail(`${label}: 缺阶段证明 ${needle}`);
}

function cidRequireOrder(body: string, needles: readonly string[], label: string): void {
  let cursor = -1;
  for (const needle of needles) {
    const next = body.indexOf(needle, cursor + 1);
    if (next < 0) fail(`${label}: 阶段顺序缺失 ${needle}`);
    cursor = next;
  }
}

export function assertCidProductionSourceInterfaceContract(
  snapshotBuilderInput: Buffer,
): void {
  const snapshotBuilder = cidSourceText(
    snapshotBuilderInput,
    "CID phase snapshot builder",
  );
  const productionSourceInterfaceFinalize = cidTopLevelFunction(
    snapshotBuilder,
    "CompilerSnapshotProductionSourceInterfacesFinalizeInto",
    "CID phase snapshot builder",
  );
  cidRequireOrder(productionSourceInterfaceFinalize, [
    "let expectedDependencyProofCid =",
    "compilerSnapshotProductionDependencyProofCid(csg)",
    "compilerSnapshotBuilderGraphStrictValidateInto(csg, err)",
    "dependencyProofCid, expectedDependencyProofCid",
    "compilerSnapshotProductionCanonicalSourceRowsBuildInto(",
    "schema.CsgCompilerSymbolRowCidInto(",
    "schema.CsgCompilerSymbolInterfaceCidInto(",
    "csg.semanticGraph.importEdgeTable.ownerSourceIndex",
    "schema.CsgCompilerSourceInterfacesFinalizeInto(tables, err)",
    "schema.CsgCompilerSourceInterfaceCidsInto(",
    "outProofCid = compilerSnapshotProductionSourceInterfaceProofCid(",
  ], "CID phase production source interface authority");
  const productionCandidateBuild = cidTopLevelFunction(
    snapshotBuilder,
    "CompilerSnapshotProductionCandidateBuildInto",
    "CID phase snapshot builder",
  );
  cidRequireOrder(productionCandidateBuild, [
    "CompilerSnapshotProductionAdmissionAssessInto(",
    "CompilerSnapshotParserTablesBuildInto(",
    ".sources.interfaceCids[sourceId]",
    "layout.FixedBytes32()",
    "compilerSnapshotBuilderTypeFunctionProjectValidatedInto(",
    ".missingFunctionOwnerIdentityCount = 0",
    ".missingFunctionInterfaceCount = 0",
    ".missingSymbolInterfaceCount == 0",
    "CompilerSnapshotProductionSourceInterfacesFinalizeInto(",
    ".sourceInterfaceProofCid = proofCid",
    ".missingSourceInterfaceCount = 0",
    "CompilerSnapshotAdmissionMissingSourceInterface",
    ".functionInterfaceProofCid =",
    "compilerSnapshotProductionFunctionInterfaceProofCid(",
    ".functionInterfaceRequiredDomainCid",
    "compilerSnapshotProductionAdmissionReceiptCid(",
    "CompilerSnapshotProductionCandidateReceiptStrictValidateInto(",
    "tables = candidateTables",
    "admission = candidateAdmission",
  ], "CID phase production source interface admission");
  const productionCandidateReplay = cidTopLevelFunction(
    snapshotBuilder,
    "CompilerSnapshotProductionCandidateReceiptStrictValidateInto",
    "CID phase snapshot builder",
  );
  cidRequireOrder(productionCandidateReplay, [
    "CompilerSnapshotProductionAdmissionAssessInto(",
    "schema.CsgCompilerSnapshotSymbolFunctionTablesStrictValidateInto(",
    "tables.functions.symbolIds.len",
    "expected.reachableFunctionCount",
    "expected.missingFunctionOwnerIdentityCount = 0",
    "expected.missingFunctionInterfaceCount = 0",
    "expected.functionInterfaceProofCid =",
    "compilerSnapshotProductionFunctionInterfaceProofCid(",
    "expected.functionInterfaceRequiredDomainCid",
    "CompilerSnapshotAdmissionMissingFunctionInterface",
    "tables.symbols.symbolCids.len",
    "expected.missingSymbolInterfaceCount == 0",
    "expected.sourceInterfaceProofCid =",
    "expected.receiptCid =",
    "compilerSnapshotProductionAdmissionReceiptCid(expected)",
    "compilerSnapshotProductionAdmissionReceiptCid(receipt)",
    "receipt.receiptCid, expected.receiptCid",
  ], "CID phase production Function candidate replay");
}

export function assertCidProductionInterfaceObligationContract(
  snapshotBuilderInput: Buffer,
): void {
  const snapshotBuilder = cidSourceText(
    snapshotBuilderInput,
    "CID phase snapshot builder",
  );
  const symbolObligations = cidTopLevelFunction(
    snapshotBuilder,
    "compilerSnapshotProductionSymbolInterfaceObligations",
    "CID phase snapshot builder",
  );
  cidRequireOrder(symbolObligations, [
    "declarationInterfaceCount = csg.sourceSnapshotCount",
    "csg.parserNormalizedExprReceipt.sourceSidecars.len",
    "sidecar.declarationKinds[declarationRow]",
    "Int32(parser.ParserDeclarationModule)",
    "declarationInterfaceCount + 1",
    "sidecar.typeGenericSymbolNameTokenIds.len",
    "sidecar.annotationTargetTokenIds.len",
  ], "CID phase production Symbol interface obligations");
  const functionInspection = cidTopLevelFunction(
    snapshotBuilder,
    "compilerSnapshotProductionFunctionInspectionStrictValidateInto",
    "CID phase snapshot builder",
  );
  cidRequireOrder(functionInspection, [
    "csg.semanticGraph.reachableFunctionTable.graphNodeIds.len",
    "setLen(functionDeclarationBySpanId, sidecar.spanStartBytes.len)",
    "functionDeclarationBySpanId[spanId] = -1",
    "sidecar.declarationSpanIds[declarationRow]",
    "sidecar.declarationFunctionRows[declarationRow]",
    "functionDeclarationBySpanId[declarationSpanId] =",
    "sidecar.functionIndexes[parserFunctionRow]",
    "csg.semanticGraph.reachableFunctionTable.sourceIndex",
    "sidecar.sourceIndex",
    "sidecar.functionDeclarationSpanIds[parserFunctionRow]",
    "sidecar.functionNameSpanIds[parserFunctionRow]",
    "functionDeclarationBySpanId[functionSpanId]",
    "sidecar.declarationNameSpanIds[ownerDeclaration]",
    "sidecar.declarationFunctionRows[ownerDeclaration]",
    "sidecar.declarationNameTokenIds[ownerDeclaration]",
    "functionSeen[functionId] = true",
    "executableFunctionByOwnerToken[ownerToken] = true",
    "sidecar.declarationOwnerIds[declarationRow]",
    "sidecar.declarationFunctionRows[declarationRow]",
    "parameterCount = parameterCount + 1",
    "sidecar.typeGenericSymbolDeclarationOwnerTokenIds",
    "executableFunctionByOwnerToken[ownerToken]",
    "genericCount = genericCount + 1",
    "if !functionSeen[functionId]:",
  ], "CID phase production FunctionId inspection");
  const parserFunctionLoop = functionInspection.indexOf(
    "for parserFunctionRow in 0..<sidecar.functionIndexes.len:",
  );
  const parameterOwnerRead = functionInspection.indexOf(
    "sidecar.declarationOwnerIds[declarationRow]",
    parserFunctionLoop + 1,
  );
  if (
    parserFunctionLoop < 0 ||
    parameterOwnerRead < 0 ||
    (functionInspection
      .slice(parserFunctionLoop, parameterOwnerRead)
      .match(/for declarationRow in/g)?.length ?? 0) !== 1
  ) {
    fail(
      "CID phase production FunctionId inspection: executable FunctionId loop reopened declaration scan",
    );
  }
  if (
    functionInspection.includes("ownerMatchCount") ||
    functionInspection
      .slice(parserFunctionLoop, parameterOwnerRead)
      .includes("for genericRow in 0..<")
  ) {
    fail(
      "CID phase production FunctionId inspection: FunctionId identity uses superlinear scan",
    );
  }
  const functionRequiredDomain = cidTopLevelFunction(
    snapshotBuilder,
    "compilerSnapshotProductionFunctionRequiredDomainCidInto",
    "CID phase snapshot builder",
  );
  cidRequireOrder(functionRequiredDomain, [
    "csg.semanticGraph.reachableFunctionTable.graphNodeIds.len",
    "CompilerSnapshotProductionTypeArenaBindingStrictValidateInto(",
    "compilerSnapshotBuilderTypedFunctionJoinInto(",
    "ParserCanonicalSourceSidecarStrictValidateInto(",
    "compilerSnapshotProductionFunctionTypeArenaBridgeStrictValidateInto(",
    "setLen(functionByOwnerToken, tokenCount)",
    "sidecar.functionIndexes[localFunctionRow]",
    "sidecar.functionNameSpanIds[localFunctionRow]",
    "functionByOwnerToken[ownerToken] = functionId",
    "compilerSnapshotBuilderTypeFunctionBindingsFromOwnerTokensInto(",
    "returnArenaTypeIds",
    "parameterArenaTypeIds",
    "parameterOwnershipKinds",
    "sidecar.typeGenericSymbolDeclarationOwnerTokenIds",
    "functionGenericRows",
    '"cheng.compiler.snapshot.production_function_required_domain"',
    "csg.typeArena.artifactRaw32",
    "typedRowByReachable[functionId]",
    "csg.semanticGraph.reachableFunctionTable.producerDeclarationIndexes",
    "functionAnnotationFlags[",
    "outCid = compilerSnapshotBuilderHashFinish(buf)",
  ], "CID phase production Function required domain");
  if (
    functionRequiredDomain.includes("sourceText") ||
    functionRequiredDomain.includes("symbolText") ||
    functionRequiredDomain.includes("semanticParamTypeJoin") ||
    functionRequiredDomain.includes("startLines") ||
    functionRequiredDomain.includes("LocalSlot") ||
    functionRequiredDomain.includes("schema.CsgCompilerSnapshotTables")
  ) {
    fail(
      "CID phase production Function required domain: used text/line/slot approximation",
    );
  }
  const functionHashLoop = functionRequiredDomain.indexOf(
    "for functionId in 0..<functionCount:",
    functionRequiredDomain.indexOf(
      '"cheng.compiler.snapshot.production_function_required_domain"',
    ),
  );
  if (
    functionHashLoop < 0 ||
    functionRequiredDomain
      .slice(functionHashLoop)
      .includes("for producerSourceIndex in 0..<sourceCount:")
  ) {
    fail(
      "CID phase production Function required domain: Function hash uses superlinear generic scan",
    );
  }
  const functionTypeBindings = cidTopLevelFunction(
    snapshotBuilder,
    "compilerSnapshotBuilderTypeFunctionBindingsInto",
    "CID phase snapshot builder",
  );
  cidRequireOrder(functionTypeBindings, [
    "var sourceIdByProducer: int32[]",
    "var producerBySourceId: int32[]",
    "for row in 0..<sourceCount:",
    "sourceIdByProducer[producerSourceIndex] = sourceId",
    "producerBySourceId[sourceId] = producerSourceIndex",
    "for producerSourceIndex in 0..<sidecars.len:",
    "var tokenBySpan: int32[]",
    "for localToken in 0..<sidecar.tokenSpanIds.len:",
    "tokenBySpan[spanId] = localToken",
    "for localFunctionRow in 0..<sidecar.functionIndexes.len:",
    "let localNameToken =",
    "tokenBySpan[nameSpanId]",
  ], "CID phase production Function TypeArena binding index");
  const functionBindingLoop = functionTypeBindings.indexOf(
    "for localFunctionRow in 0..<sidecar.functionIndexes.len:",
  );
  if (
    functionBindingLoop < 0 ||
    functionTypeBindings
      .slice(functionBindingLoop)
      .includes("for localToken in 0..<sidecar.tokenSpanIds.len:")
  ) {
    fail(
      "CID phase production Function TypeArena binding index: Function loop uses token scan",
    );
  }
  const functionTypeArenaBridge = cidTopLevelFunction(
    snapshotBuilder,
    "compilerSnapshotProductionFunctionTypeArenaBridgeStrictValidateInto",
    "CID phase snapshot builder",
  );
  cidRequireOrder(functionTypeArenaBridge, [
    "typeSyntaxProducerSourceIndexes",
    "typeSyntaxRootKinds",
    "ParserTypeSyntaxRootFunctionParameter",
    "ParserTypeSyntaxRootFunctionReturn",
    "typeSyntaxParserKinds",
    "typeSyntaxOwnerTokenIndexes",
    "typeSyntaxDeclarationOwnerTokenIndexes",
    "typeSyntaxDeclarationOwnerNodeIndexes",
    "typeSyntaxGenericSymbolCounts",
    "for localGenericRow in 0..<",
    "genericSymbolProducerSourceIndexes",
    "genericSymbolDeclarationOwnerTokenIndexes",
    "genericSymbolNameTokenIndexes",
    "genericSymbolOrdinals",
  ], "CID phase production Function TypeArena parser bridge");
  if (
    functionTypeArenaBridge.includes("sourceText") ||
    functionTypeArenaBridge.includes("symbolText") ||
    functionTypeArenaBridge.includes("startLines") ||
    functionTypeArenaBridge.includes("LocalSlot")
  ) {
    fail(
      "CID phase production Function TypeArena parser bridge: used text/line/slot approximation",
    );
  }
  const admissionCid = cidTopLevelFunction(
    snapshotBuilder,
    "compilerSnapshotProductionAdmissionReceiptCid",
    "CID phase snapshot builder",
  );
  cidRequire(admissionCid, [
    "receipt.functionInterfaceRequiredDomainCid",
  ], "CID phase production Function required-domain receipt");
  const functionInterfaceProof = cidTopLevelFunction(
    snapshotBuilder,
    "compilerSnapshotProductionFunctionInterfaceProofCid",
    "CID phase snapshot builder",
  );
  cidRequireOrder(functionInterfaceProof, [
    "requiredDomainCid",
    "csg.canonicalGraphCid",
    "csg.typeArena.artifactRaw32",
    "tables.functions.symbolIds.len",
    "for functionId in 0..<tables.functions.symbolIds.len:",
    "tables.symbols.symbolCids[symbolId]",
    "tables.functions.interfaceCids[functionId]",
    "tables.symbols.typeIds[symbolId]",
    "tables.functions.typedFunctionIndexes[functionId]",
    "tables.functions.parameterOwnershipCounts[functionId]",
    "tables.functions.parameterOwnershipKinds[",
  ], "CID phase production Function interface proof");
  const functionDomainAdmissionBuild = cidTopLevelFunction(
    snapshotBuilder,
    "compilerSnapshotProductionAdmissionBuildValidated",
    "CID phase snapshot builder",
  );
  cidRequireOrder(functionDomainAdmissionBuild, [
    "out.functionInterfaceRequiredDomainCid =",
    "functionInterfaceRequiredDomainCid",
    "out.missingFunctionOwnerIdentityCount =",
    "out.reachableFunctionCount",
    "out.missingFunctionParameterTypeCount = 0",
    "out.missingFunctionParameterOwnershipCount = 0",
    "out.missingFunctionReturnTypeCount = 0",
    "out.missingFunctionGenericIdentityCount = 0",
  ], "CID phase production Function required-domain ledger");
  const functionDomainAdmissionAssess = cidTopLevelFunction(
    snapshotBuilder,
    "CompilerSnapshotProductionAdmissionAssessInto",
    "CID phase snapshot builder",
  );
  cidRequireOrder(functionDomainAdmissionAssess, [
    "compilerSnapshotProductionFunctionInspectionStrictValidateInto(",
    "compilerSnapshotProductionFunctionRequiredDomainCidInto(",
    "functionInterfaceRequiredDomainCid",
    "compilerSnapshotProductionAdmissionBuildValidated(",
    "receipt.functionInterfaceRequiredDomainCid",
  ], "CID phase production Function required-domain admission");
  const typedInspection = cidTopLevelFunction(
    snapshotBuilder,
    "compilerSnapshotProductionTypedNodeRequiredDomainStrictValidateInto",
    "CID phase snapshot builder",
  );
  cidRequireOrder(typedInspection, [
    "texpr.TypedExprValueDefinitionAuthorityStrictValidateInto(",
    "setLen(sourceNodeBases, sidecars.len)",
    "compilerSnapshotBuilderCountAppendSafe(",
    "setLen(expectedFunctionByParserNode, totalParserNodeCount)",
    "expectedFunctionByParserNode[parserNodeRow] = -1",
    "setLen(parserExprRequiredByFunction, functionCount)",
    "sidecar.normalizedExprParserNodeIds.len",
    "sidecar.normalizedExprProducerSourceIds[exprRow]",
    "csg.semanticGraph.reachableFunctionTable.sourceIndex",
    "expectedFunctionByParserNode[parserNodeRow] =",
    "functionIndex",
    "parserExprRequiredByFunction[functionIndex] = true",
    "setLen(reachableFunctionByGraphNodeId, csg.nodes.len + 1)",
    "reachableFunctionByGraphNodeId[graphNodeId] = -1",
    "csg.semanticGraph.reachableFunctionTable.graphNodeIds",
    "reachableFunctionByGraphNodeId[graphNodeId] =",
    "setLen(typedFunctionSeenByReachableFunction, functionCount)",
    "csg.semanticGraph.typedIrTable.functionGraphNodeIds.len",
    "csg.semanticGraph.typedIrTable.functionSourceIndexes",
    "typedFunctionSeenByReachableFunction[functionIndex]",
    "typedFunctionSeenByReachableFunction[functionIndex] = true",
    "csg.semanticGraph.typedIrTable.functionNodeStart",
    "csg.semanticGraph.typedIrTable.functionNodeCount",
    "parserExprRequiredByFunction[functionIndex]",
    "!typedFunctionSeenByReachableFunction[functionIndex]",
  ], "CID phase production TypedExpr origin inspection");
  const parserExprLoop = typedInspection.indexOf(
    "for exprRow in 0..<sidecar.normalizedExprParserNodeIds.len:",
  );
  const reachableIndexBuild = typedInspection.indexOf(
    "var reachableFunctionByGraphNodeId: int32[]",
    parserExprLoop + 1,
  );
  if (
    parserExprLoop < 0 ||
    reachableIndexBuild < 0 ||
    typedInspection.includes("originMatchCount") ||
    typedInspection
      .slice(parserExprLoop, reachableIndexBuild)
      .includes("for typedRow in") ||
    typedInspection
      .slice(parserExprLoop, reachableIndexBuild)
      .includes("for nodeIndex in")
  ) {
    fail(
      "CID phase production TypedExpr origin inspection: parser expression loop uses superlinear scan",
    );
  }
  const admissionBuild = cidTopLevelFunction(
    snapshotBuilder,
    "compilerSnapshotProductionAdmissionBuildValidated",
    "CID phase snapshot builder",
  );
  cidRequireOrder(admissionBuild, [
    "compilerSnapshotProductionSymbolInterfaceObligations(",
    "out.symbolCount =",
    "declarationInterfaceCount + genericInterfaceCount",
    "out.missingSymbolDeclarationInterfaceCount =",
    "out.missingSymbolGenericInterfaceCount =",
    "out.missingSymbolAnnotationTargetBindingCount =",
    "out.missingSymbolInterfaceCount =",
    "declarationInterfaceCount +",
    "genericInterfaceCount +",
    "annotationTargetBindingCount",
    "out.missingFunctionInterfaceCount = out.reachableFunctionCount",
    "out.missingFunctionOwnerIdentityCount =",
    "out.missingFunctionParameterTypeCount =",
    "out.missingFunctionParameterOwnershipCount =",
    "out.missingFunctionReturnTypeCount =",
    "out.missingFunctionGenericIdentityCount =",
    "out.missingFunctionSourceBindingCount = 0",
  ], "CID phase production interface admission ledger");
  const symbolCountStart = admissionBuild.indexOf("out.symbolCount =");
  const symbolCountEnd = admissionBuild.indexOf(
    "out.reachableFunctionCount =",
    symbolCountStart,
  );
  if (
    symbolCountStart < 0 ||
    symbolCountEnd < 0 ||
    admissionBuild
      .slice(symbolCountStart, symbolCountEnd)
      .includes("annotationTargetBindingCount")
  ) {
    fail(
      "CID phase production interface admission ledger: Annotation target binding 冒充 Symbol 行",
    );
  }
  const admissionAssess = cidTopLevelFunction(
    snapshotBuilder,
    "CompilerSnapshotProductionAdmissionAssessInto",
    "CID phase snapshot builder",
  );
  cidRequireOrder(admissionAssess, [
    "var functionParameterCount: int32",
    "var functionGenericCount: int32",
    "compilerSnapshotBuilderGraphStrictValidateInto(csg, err)",
    "compilerSnapshotProductionFunctionInspectionStrictValidateInto(",
    "csg, functionParameterCount, functionGenericCount, err",
    "compilerSnapshotProductionTypedNodeRequiredDomainStrictValidateInto(",
    "compilerSnapshotProductionAdmissionBuildValidated(",
    "functionInterfaceRequiredDomainCid",
    "receipt.missingSymbolInterfaceCount > 0",
    "receipt.symbolInterfaceProofCid",
    "receipt.missingFunctionInterfaceCount > 0",
    "receipt.functionInterfaceProofCid",
  ], "CID phase production interface proof admission");
}

export function assertCidSourcePhaseContract(inputs: CidSourcePhaseContractInputs): void {
  const plan = cidSourceText(inputs.systemLinkPlan, "CID phase system_link_plan");
  const exec = cidSourceText(inputs.systemLinkExec, "CID phase system_link_exec");
  const parser = cidSourceText(inputs.parser, "CID phase parser");
  const parserReceipt = cidSourceText(inputs.parserReceipt, "CID phase parser receipt");
  const typedExpr = cidSourceText(inputs.typedExpr, "CID phase typed expr");
  const snapshotBuilder = cidSourceText(inputs.snapshotBuilder, "CID phase snapshot builder");
  const snapshotSchema = cidSourceText(inputs.snapshotSchema, "CID phase snapshot schema");
  const snapshotCargo = cidSourceText(inputs.snapshotCargo, "CID phase snapshot cargo");
  const snapshotValidator = cidSourceText(inputs.snapshotValidator, "CID phase snapshot validator");
  const world = cidSourceText(inputs.compilerWorld, "CID phase compiler_world");
  const sha256 = cidSourceText(inputs.sha256, "CID phase sha256");
  const hash256 = cidSourceText(inputs.hash256, "CID phase hash256");
  const csg = cidSourceText(inputs.compilerCsg, "CID phase compiler_csg");
  const driver = cidSourceText(inputs.backendDriver, "CID phase backend_driver");
  const debugReceipt = cidSourceText(inputs.debugSectionPlanReceipt, "CID phase debug section receipt");
  const directDebug = cidSourceText(inputs.directObjectDebugSections, "CID phase direct object debug sections");
  const structuralColumns = cidTopLevelFunction(plan, "SystemLinkPlanSourceBundleBindingStructuralColumnsValidInto", "CID phase plan");
  cidRequire(structuralColumns, ["plan: var SystemLinkPlanStub", "SystemLinkPlanCanonicalExternalPackageRootsInto(", "SystemLinkPlanSourceRowIdentityInto(", "SystemLinkPlanCanonicalImportEdgesInto(", "SystemLinkPlanComputeSourceBundleBindingSeal("], "CID phase structural columns");
  if (structuralColumns.includes("ParserSourceTextWithExternalPackageRootsInto(")) fail("CID phase structural columns: compact receipt phase reopened source bytes");
  const fullColumns = cidTopLevelFunction(plan, "SystemLinkPlanSourceBundleBindingColumnsValidInto", "CID phase plan");
  cidRequire(fullColumns, ["plan: var SystemLinkPlanStub", "SystemLinkPlanSourceBundleBindingStructuralColumnsValidInto(", "ParserSourceTextWithExternalPackageRootsInto(", "SystemLinkPlanPortableSourceBindingValidateTextsInto("], "CID phase full byte validation");
  const structuralSeal = cidTopLevelFunction(plan, "SystemLinkPlanSourceBundleBindingStructuralValidInto", "CID phase plan");
  cidRequire(structuralSeal, ["plan: var SystemLinkPlanStub", "SystemLinkPlanSourceBundleBindingStructuralColumnsValidInto(", "FixedBytes32Equal(expectedSeal, plan.sourceBundleBindingSeal)"], "CID phase structural seal");
  const fullSeal = cidTopLevelFunction(plan, "SystemLinkPlanSourceBundleBindingValidInto", "CID phase plan");
  cidRequire(fullSeal, ["plan: var SystemLinkPlanStub", "SystemLinkPlanSourceBundleBindingColumnsValidInto(", "FixedBytes32Equal(expectedSeal, plan.sourceBundleBindingSeal)"], "CID phase full seal");
  const rebuildImports = cidTopLevelFunction(plan, "SystemLinkPlanRebuildImportEdgesFromTextsInto", "CID phase plan");
  cidRequire(rebuildImports, ["externalPackageRoots: var parser.ParserExternalPackageRoot[]", "sourceClosurePaths: var str[]", "ownerModulePaths: var str[]", "sourceTexts: var str[]", "parser.ParserReadImportSpecs("], "CID phase import graph rebuild");
  if (rebuildImports.includes("ParserReadImportSpecsLines(")) fail("CID phase import graph rebuild: rebuilt imports from retained full line tables");
  const rebuiltBinding = cidTopLevelFunction(plan, "SystemLinkPlanPortableSourceBindingValidateRebuiltTextsInto", "CID phase plan");
  cidRequire(rebuiltBinding, ["modulePaths: var str[]", "sourceTexts: var str[]", "rebuiltImportEdges: var parser.ImportEdge[]", "SystemLinkPlanPortableSourceBindingFromRebuiltImportEdgesInto("], "CID phase rebuilt portable binding");
  if (rebuiltBinding.includes("SystemLinkPlanPortableSourceBindingFromTextsInto(") || rebuiltBinding.includes("ParserReadImport")) fail("CID phase rebuilt portable binding: reparsed immutable source imports");
  const sourcePathBundle = cidTopLevelFunction(plan, "SystemLinkPlanSourcePathBundleCidInto", "CID phase plan");
  cidRequire(sourcePathBundle, ["CompilerWorldPathOrderInto(", "ParserSourceIdentityPathAbsolute(", "ParserSourceIdentityLexicalPathInto(", "CompilerWorldSourceRawBytesCidBorrowed("], "CID phase source-path bundle");
  if (sourcePathBundle.includes("orderedTexts") || sourcePathBundle.includes("CompilerWorldSortPathTextPairs(")) fail("CID phase source-path bundle: materialized a second full source-text sequence");
  const portableFromRebuilt = cidTopLevelFunction(plan, "SystemLinkPlanPortableSourceBindingFromRebuiltImportEdgesInto", "CID phase plan");
  cidRequire(portableFromRebuilt, ["modulePaths: var str[]", "sourceTexts: var str[]", "rebuiltImportEdges: var parser.ImportEdge[]", "let entryIsSourcePath = parser.ParserSourceIdentityPathAbsolute(", "if !entryIsSourcePath:", "SystemLinkPlanModuleOwnedByPackage(entryModulePath, packageId)", "var sourceIdentityValid = parser.ParserSourceIdentityModuleTextValid(", "if !sourceIdentityValid:", "parser.ParserSourceIdentityPathAbsolute(", "parser.ParserSourceIdentityLexicalPathInto(", "canonicalSourceIdentity == modulePaths[sourceIndex]", "var hasSourcePathIdentity = false", "if parser.ParserSourceIdentityPathAbsolute(modulePaths[sourceIndex]):", "if hasSourcePathIdentity:", "SystemLinkPlanSourcePathBundleCidInto(", "CompilerWorldSourceBundleCidFromIdentityTextsBorrowedInto(", "CompilerWorldSourceRawBytesCidBorrowed(", "SystemLinkPlanProgressMemoryStage(\"after_portable_identity_rows\")", "SystemLinkPlanProgressMemoryStage(\"after_portable_import_graph_cid\")", "SystemLinkPlanProgressMemoryStage(\"after_portable_source_bundle_cid\")", "SystemLinkPlanProgressMemoryStage(\"after_portable_entry_source_cid\")", "SystemLinkPlanProgressMemoryStage(\"after_portable_binding_seal\")"], "CID phase portable identity domain");
  cidRequireOrder(portableFromRebuilt, ["SystemLinkPlanProgressMemoryStage(\"after_portable_identity_rows\")", "SystemLinkPlanProgressMemoryStage(\"after_portable_import_graph_cid\")", "SystemLinkPlanProgressMemoryStage(\"after_portable_source_bundle_cid\")", "SystemLinkPlanProgressMemoryStage(\"after_portable_entry_source_cid\")", "SystemLinkPlanProgressMemoryStage(\"after_portable_binding_seal\")"], "CID phase portable memory trace");
  const portableMemoryTrace = cidTopLevelFunction(plan, "SystemLinkPlanProgressMemoryStage", "CID phase plan");
  cidRequire(portableMemoryTrace, ["CHENG_PROGRESS", "system_link_plan_stage=", "ProcessRssBytes()"], "CID phase portable memory trace sink");
  const identityBundle = cidTopLevelFunction(world, "CompilerWorldSourceBundleCidFromIdentityTextsBorrowedInto", "CID phase compiler_world");
  cidRequire(identityBundle, ["identityPaths: var str[]", "sourceTexts: var str[]", "CompilerWorldPathOrderInto(", "CompilerWorldSourceRawBytesCidBorrowed("], "CID phase module bundle");
  if (identityBundle.includes("orderedTexts") || identityBundle.includes("CompilerWorldSortPathTextPairs(")) fail("CID phase module bundle: materialized a second full source-text sequence");
  const rawSourceCidBorrowed = cidTopLevelFunction(world, "CompilerWorldSourceRawBytesCidBorrowed", "CID phase compiler_world");
  cidRequire(rawSourceCidBorrowed, ["sourceText: var str", "rawbytes.BytesFromString(sourceText)", "CompilerWorldSourceRawBytesCidFromSpan("], "CID phase borrowed raw source CID");
  if (rawSourceCidBorrowed.includes("ByteBufInit(") || rawSourceCidBorrowed.includes("CompilerWorldBufCid(")) fail("CID phase borrowed raw source CID: materialized source-sized preimage");
  const rawSourceCidFromBytes = cidTopLevelFunction(world, "CompilerWorldSourceRawBytesCidFromBytes", "CID phase compiler_world");
  cidRequire(rawSourceCidFromBytes, ["sourceBytes: Bytes", "CompilerWorldSourceRawBytesCidFromSpan(", "layout.ByteSpanFromBytes(sourceBytes)"], "CID phase bytes raw source CID");
  if (rawSourceCidFromBytes.includes("ByteBufInit(") || rawSourceCidFromBytes.includes("CompilerWorldBufCid(") || rawSourceCidFromBytes.includes("Sha256Fixed(")) fail("CID phase bytes raw source CID: materialized source-sized preimage");
  const rawSourceCidFromSpan = cidTopLevelFunction(world, "CompilerWorldSourceRawBytesCidFromSpan", "CID phase compiler_world");
  cidRequire(rawSourceCidFromSpan, ["sourceBytes: layout.ByteSpan", "ByteBufInit(64)", 'CompilerWorldAppendText(header, "cheng.compiler.source_raw_bytes")', "CompilerWorldAppendU32BE(header, layout.ByteSpanLen(sourceBytes))", "hash256.Sha256FixedTwo(layout.ByteBufView(header), sourceBytes)", "layout.ByteBufFree(header)"], "CID phase streaming raw source CID");
  if (rawSourceCidFromSpan.includes("sourceBytes.data.len") || rawSourceCidFromSpan.includes("CompilerWorldBufCid(") || rawSourceCidFromSpan.includes("hash256.Sha256Fixed(")) fail("CID phase streaming raw source CID: source payload was coalesced");
  const fixedTwo = cidTopLevelFunction(hash256, "Sha256FixedTwo", "CID phase hash256");
  cidRequire(fixedTwo, ["first: layout.ByteSpan", "second: layout.ByteSpan", "sha256.Sha256DigestTwo(first.data, second.data)", "layout.FixedBytes32FromBytes(digestBytes)", "BytesFree(digestBytes)"], "CID phase fixed two-part SHA");
  const digestTwo = cidTopLevelFunction(sha256, "Sha256DigestTwo", "CID phase sha256");
  cidRequireOrder(digestTwo, ["Sha256TwoPartStateInit()", "Sha256TwoPartUpdate(state, first)", "Sha256TwoPartUpdate(state, second)", "Sha256TwoPartFinish(state)"], "CID phase two-part SHA order");
  if (digestTwo.includes("BytesAlloc(") || digestTwo.includes("Sha256Digest(")) fail("CID phase two-part SHA: concatenated full message");
  const streamInit = cidTopLevelFunction(sha256, "Sha256TwoPartStateInit", "CID phase sha256");
  cidRequire(streamInit, ["BytesAlloc(32)", "BytesAlloc(64)", "BytesAlloc(256)", "setLen(state.schedule, 64)"], "CID phase two-part SHA fixed state");
  const streamUpdate = cidTopLevelFunction(sha256, "Sha256TwoPartUpdate", "CID phase sha256");
  cidRequire(streamUpdate, ["state.totalLen = state.totalLen + Int64(data.len)", "BytesView(", "RawmemPtrAdd(data.data, offset)", "Sha256TwoPartCompress(state, blockView)"], "CID phase two-part SHA streaming update");
  if (streamUpdate.includes("BytesAlloc(") || streamUpdate.includes("setLen(")) fail("CID phase two-part SHA streaming update: input-sized allocation");
  const streamFinish = cidTopLevelFunction(sha256, "Sha256TwoPartFinish", "CID phase sha256");
  cidRequire(streamFinish, ["if state.blockLen > 56:", "state.totalLen * 8", "Sha256TwoPartCompress(state, state.block)", "Sha256TwoPartStateRelease(state)"], "CID phase two-part SHA bounded finish");
  const streamCompress = cidTopLevelFunction(sha256, "Sha256CompressBlockReuse", "CID phase sha256");
  cidRequire(streamCompress, ["schedule: var int64[]", "schedule.len != 64", "schedule[index] = GetU32BE(block, index * 4)"], "CID phase two-part SHA reused schedule");
  if (streamCompress.includes("setLen(") || streamCompress.includes("BytesAlloc(")) fail("CID phase two-part SHA reused schedule: allocated per block");
  const sourceBundleBuild = cidTopLevelFunction(plan, "SystemLinkPlanBuildSourceBundleBindingFromFilesInto", "CID phase plan");
  cidRequire(sourceBundleBuild, ["SystemLinkPlanRebuildImportEdgesFromTextsInto(", "SystemLinkPlanPortableSourceBindingFromRebuiltImportEdgesInto("], "CID phase source bundle producer");
  if (sourceBundleBuild.includes("SystemLinkPlanPortableSourceBindingFromTextsInto(")) fail("CID phase source bundle producer: reparsed exact source imports after graph rebuild");
  const importSpecs = cidTopLevelFunction(parser, "ParserReadImportSpecs", "CID phase parser");
  const importEdges = cidTopLevelFunction(parser, "ParserReadImportEdgesWithExternalPackageRoots", "CID phase parser");
  cidRequire(importSpecs, ["ParserLineRangeStartsImport(", "while lineStart <= text.len"], "CID phase streaming import specs");
  cidRequire(importEdges, ["ParserLineRangeStartsImport(", "while lineStart <= text.len"], "CID phase streaming import edges");
  if (importSpecs.includes("ParserSplitChar(") || importEdges.includes("ParserSplitChar(")) fail("CID phase parser: import-only scan materialized the full source line table");
  const bindingProducer = cidTopLevelFunction(parser, "ParserValueExprProcessBindingEntryRange", "CID phase parser");
  cidRequireOrder(bindingProducer, ["let declarationStart = tree.declarationCount", "ParserValueExprParsePatternRange(", "let bindingDeclarationCount =", "let statementRole =", "ParserValueExprParseExactRoot(", "if bindingDeclarationCount > 0:", "let bindingInitializerEnd =", "tree.declarationSpanEnds", "ParserValueExprSetStatementRootDeclarationAuthority("], "CID phase binding declaration producer");
  cidRequire(bindingProducer, ["tree.declarationCount - declarationStart", "bindingDeclarationCount > 0 ?", "ParserValueExprStatementBindingInitializer", "ParserValueExprStatementAssignmentRhs", "ParserValueExprNodeSpanEndAt(tree, valueRoot)", "for declarationRow in declarationStart..<declarationStart + bindingDeclarationCount:", "arenamod.ArenaArrayInt32Set(", "tree.declarationSpanEnds", "ParserValueExprNodeDirectStatementRootEventAt(tree, valueRoot)", "declarationStart", "bindingDeclarationCount"], "CID phase binding declaration producer");
  if (bindingProducer.includes("tree.statementRootCount - 1")) fail("CID phase binding declaration producer: approximated initializer identity from the last statement root");
  const typeDefaultProducer = cidTopLevelFunction(parser, "ParserValueExprProcessStatementRangeWithTypeOwner", "CID phase parser");
  cidRequireOrder(typeDefaultProducer, ["let assignedFieldColon =", "var assignedFieldDeclarationRow: int32 = -1", "assignedFieldDeclarationRow = ParserValueExprAppendDeclaration(", "let valueRole =", "ParserValueExprStatementTypeDefault", "ParserValueExprParseExactRoot(", "if assignedFieldDeclarationRow >= 0:", "ParserValueExprSetStatementRootDeclarationAuthority(", "ParserValueExprNodeDirectStatementRootEventAt("], "CID phase type default declaration producer");
  cidRequire(typeDefaultProducer, ["ParserDeclarationField", "tree.activeTypeDeclarationRow", "assignedFieldDeclarationRow", "ParserValueExprStatementAssignmentRhs"], "CID phase type default declaration producer");
  const inlineTypeDefaultProducer = cidTopLevelFunction(parser, "ParserValueExprProcessTypeDeclarationRangeInto", "CID phase parser");
  cidRequireOrder(inlineTypeDefaultProducer, ["let defaultRootEventStart = tree.statementRootCount", "ParserValueExprStatementTypeDefault", "var declarationRow: int32", "declarationRow = ParserValueExprAppendDeclaration(", "for defaultRootEvent in defaultRootEventStart..<tree.statementRootCount:", "ParserValueExprStatementRootRoleAt(", "ParserValueExprSetStatementRootDeclarationAuthority("], "CID phase inline type default declaration producer");
  const bindingFact = cidTopLevelFunction(parser, "ParserValueExprAppendBindingInitializerFact", "CID phase parser");
  cidRequire(bindingFact, ["ParserValueExprStatementRootAnchorTokenAt(", "ParserValueExprStatementRootBindingDeclarationStartAt(", "ParserValueExprStatementRootBindingDeclarationCountAt(", "tree.declarationSpanStarts", "ParserValueExprProjectSpan("], "CID phase binding initializer fact");
  if (bindingFact.includes("lineRaw") || bindingFact.includes("PathTrimLeft(") || bindingFact.includes("StartsWith(")) fail("CID phase binding initializer fact: reconstructed declaration identity from source line text");
  const normalizedLayerProducer = cidTopLevelFunction(parser, "ParserReadNormalizedExprLayerFromTextWithKnownCallsAndProfilesCachedWithCurrentLines", "CID phase parser");
  cidRequireOrder(normalizedLayerProducer, ["var lineHasBindingInitializerRoot = false", "var lineHasAssignmentRoot = false", "lineHasBindingInitializerRoot = true", "ParserValueExprAppendBindingInitializerFact(", "lineHasAssignmentRoot = true", "ParserValueExprAppendAssignmentRhsFact(", "if !lineHasBindingInitializerRoot", "!lineHasAssignmentRoot", "!typeDeclarationHeaderLines[i]:", "ParserAppendAssignStmtExprsLine("], "CID phase binding initializer normalized-row uniqueness");
  const nonFunctionDeclarationValue = cidTopLevelFunction(parser, "ParserValueExprStatementRootIsNonFunctionDeclarationValue", "CID phase parser");
  cidRequire(nonFunctionDeclarationValue, ["ParserValueExprStatementRootRoleAt(", "ParserValueExprStatementBindingInitializer", "ParserValueExprStatementTypeDefault", "ParserValueExprStatementRootBindingDeclarationStartAt(", "ParserValueExprStatementRootBindingDeclarationCountAt(", "tree.declarationKinds", "tree.declarationFunctionRows", "tree.declarationLexicalScopeRows", "tree.declarationLexicalScopeKinds", "ParserDeclarationLocal", "ParserDeclarationField", "ParserDeclarationType", "ParserDeclarationLexicalScopeSource", "ParserDeclarationLexicalScopeType"], "CID phase non-function declaration value authority");
  if (nonFunctionDeclarationValue.includes("lineNumber") || nonFunctionDeclarationValue.includes("sourceText") || nonFunctionDeclarationValue.includes("StartsWith(")) fail("CID phase non-function declaration value authority: used text/line approximation");
  const statementStrict = cidTopLevelFunction(parser, "ParserValueExprTreeStatementRootsStrictValidateInto", "CID phase parser");
  cidRequire(statementStrict, ["tree.statementRootAnchorTokenIndexes", "tree.statementRootBindingDeclarationStarts", "tree.statementRootBindingDeclarationCounts", "ParserValueExprStatementTypeDefault", "ParserValueTokenAssign", "ParserDeclarationLocal", "ParserDeclarationField", "ParserDeclarationType", "type default declaration cardinality invalid", "type default declaration authority invalid", "tree.declarationSpanStarts", "tree.declarationSpanEnds"], "CID phase parser statement identity strict validation");
  const parserTreeType = cidTypeDeclaration(parser, "ParserValueExprTree", "CID phase parser");
  cidRequire(parserTreeType, ["tokenProducerSourceIndexes: arenamod.ArenaArrayInt32", "tokenSourceLocalIndexes: arenamod.ArenaArrayInt32", "tokenLexicalParentIndexes: arenamod.ArenaArrayInt32"], "CID phase parser token identity SoA");
  const tokenAppend = cidTopLevelFunction(parser, "ParserValueExprAppendToken", "CID phase parser");
  cidRequire(tokenAppend, ["producerSourceIndex: int32", "sourceLocalIndex: int32", "lexicalParentIndex: int32", "tree.tokenProducerSourceIndexes", "tree.tokenSourceLocalIndexes", "tree.tokenLexicalParentIndexes"], "CID phase parser token identity producer");
  const tokenLexSpan = cidTopLevelFunction(parser, "ParserValueExprLexSpan", "CID phase parser");
  cidRequire(tokenLexSpan, ["lexicalParentIndex: int32", "tree.tokenCount", "lexicalParentIndex)"], "CID phase parser token lexical parent transport");
  const fmtInterpolation = cidTopLevelFunction(parser, "ParserValueExprParseFmtInterpolations", "CID phase parser");
  cidRequire(fmtInterpolation, ["fmtTokenIndex: int32", "expressionTokenCount"], "CID phase parser Fmt token parent producer");
  cidRequireOrder(fmtInterpolation, ["ParserValueExprLexSpan(tree", "fmtTokenIndex", "expressionTokenStart", "expressionTokenCount"], "CID phase parser Fmt token parent producer");
  const tokenStrict = cidTopLevelFunction(parser, "ParserValueExprTreeTokensStrictValidateInto", "CID phase parser");
  cidRequire(tokenStrict, ["tree.tokenProducerSourceIndexes", "tree.tokenSourceLocalIndexes", "tree.tokenLexicalParentIndexes", "sourceLocalCounts[producerSourceIndex]", "ParserValueTokenFmtString", "lastChildEnds[lexicalParentIndex]"], "CID phase parser token identity validation");
  const importOriginType = cidTypeDeclaration(parser, "ParserImportOriginSoA", "CID phase parser");
  cidRequire(importOriginType, ["declarationProducerSourceIndexes: arenamod.ArenaArrayInt32", "declarationSourceLocalRows: arenamod.ArenaArrayInt32", "declarationKeywordTokenIndexes: arenamod.ArenaArrayInt32", "declarationItemStarts: arenamod.ArenaArrayInt32", "declarationItemCounts: arenamod.ArenaArrayInt32", "itemProducerSourceIndexes: arenamod.ArenaArrayInt32", "itemSourceLocalRows: arenamod.ArenaArrayInt32", "itemDeclarationRows: arenamod.ArenaArrayInt32", "itemAliasTokenIndexes: arenamod.ArenaArrayInt32", "itemModuleTokenStarts: arenamod.ArenaArrayInt32", "itemModuleTokenCounts: arenamod.ArenaArrayInt32", "itemPrefixTokenCounts: arenamod.ArenaArrayInt32", "moduleTokenIndexes: arenamod.ArenaArrayInt32"], "CID phase parser import origin SoA");
  const importOriginProducer = cidTopLevelFunction(parser, "ParserValueExprAppendImportDeclaration", "CID phase parser");
  cidRequireOrder(importOriginProducer, ["let declarationRow = origins.declarationCount", "origins.declarationProducerSourceIndexes", "origins.declarationSourceLocalRows", "origins.declarationKeywordTokenIndexes", "origins.declarationItemStarts", "origins.declarationItemCounts", "origins.declarationCount = declarationRow + 1", "parserValueExprAppendImportItem(", "let itemCount = origins.itemCount - itemStartRow", "origins.declarationItemCounts"], "CID phase parser import origin producer");
  cidRequire(importOriginProducer, ["ParserValueTokenLeftBracket", "ParserValueTokenRightBracket", "ParserValueTokenSlash", "ParserValueExprTokenText(tree, moduleLimit) != \"as\"", "err = \"parser import origin: malformed alias\""], "CID phase parser import surface producer");
  const importOriginStrict = cidTopLevelFunction(parser, "ParserValueExprTreeImportOriginsStrictValidateInto", "CID phase parser");
  cidRequire(importOriginStrict, ["origins.declarationProducerSourceIndexes", "origins.declarationSourceLocalRows", "origins.declarationKeywordTokenIndexes", "origins.declarationItemStarts", "origins.declarationItemCounts", "origins.itemProducerSourceIndexes", "origins.itemSourceLocalRows", "origins.itemDeclarationRows", "origins.itemAliasTokenIndexes", "origins.itemModuleTokenStarts", "origins.itemModuleTokenCounts", "origins.itemPrefixTokenCounts", "origins.moduleTokenIndexes", "ParserValueExprTokenProducerSourceIndexAt(", "ParserValueExprTokenKindAt(tree, keywordToken)", "ParserValueTokenImport", "module token adjacency invalid", "simple surface replay failed", "grouped prefix drift", "module token CSR incomplete"], "CID phase parser import origin validation");
  if (importOriginProducer.includes("ParserReadImportSpecs(") || importOriginStrict.includes("ParserReadImportSpecs(")) fail("CID phase parser import origin: reconstructed identity from import text scanner");
  const exactDeclarationDomain = cidTopLevelFunction(csg, "CompilerCsgExactExprRowsMarkNonFunctionDeclarationDomain", "CID phase CompilerCSG");
  cidRequire(exactDeclarationDomain, ["expr.valueExprRootNodeIndex", "expr.originParserNodeId", "parser.ParserValueExprNodeEnclosingStatementRootEventAt(", "parser.ParserValueExprStatementRootIsNonFunctionDeclarationValue(", "CompilerCsgExactExprDomainNonFunctionDeclaration"], "CID phase CompilerCSG non-function declaration domain");
  if (exactDeclarationDomain.includes("lineStarts") || exactDeclarationDomain.includes("sourceText") || exactDeclarationDomain.includes("surfaceText")) fail("CID phase CompilerCSG non-function declaration domain: used text/line approximation");
  const exactDomainClosure = cidTopLevelFunction(csg, "CompilerCsgExactExprRowsRequireClosed", "CID phase CompilerCSG");
  cidRequire(exactDomainClosure, ["CompilerCsgExactExprDomainReachableFunction", "CompilerCsgExactExprDomainUnreachableFunction", "CompilerCsgExactExprDomainNonFunctionDeclaration"], "CID phase CompilerCSG exact expression domain closure");
  const graphPrune = cidTopLevelFunction(csg, "CompilerCsgPruneGraphForReachable", "CID phase CompilerCSG");
  cidRequireOrder(graphPrune, ["if node.nodeKind == CompilerCsgNodeKindPackage ||", "node.nodeKind == CompilerCsgNodeKindModule:", "keepByNodeId[node.nodeId] = true", "if node.nodeKind != CompilerCsgNodeKindSymbol:"], "CID phase zero-function graph base identity");
  const callMetadataPrepare = cidTopLevelFunction(typedExpr, "TypedExprIrPrepareValueExprCallMetadata", "CID phase TypedExpr");
  cidRequireOrder(callMetadataPrepare, ["ir.valueExprTransactionProducerSourceIndex = -1", "ir.valueExprCallMetaResultTypeIds = []", "ir.valueExprCallMetaOriginParserNodeIds = []", "if ir.internPool == nil:"], "CID phase zero-function transaction sentinel");
  const typedIrRelease = cidTopLevelFunction(typedExpr, "TypedExprIrReleasePayload", "CID phase TypedExpr");
  cidRequireOrder(typedIrRelease, ["ir = TypedExprIr()", "ir.valueExprTransactionProducerSourceIndex = -1"], "CID phase zero-function release sentinel");
  const typedIrClone = cidTopLevelFunction(typedExpr, "typedExprIrCloneImpl", "CID phase TypedExpr");
  cidRequireOrder(typedIrClone, ["var out: TypedExprIr", "out.valueExprTransactionProducerSourceIndex = -1", "out.buildIndex = TypedExprBuildIndexClone(ir.buildIndex)"], "CID phase zero-function clone sentinel");
  const typedIrMove = cidTopLevelFunction(typedExpr, "TypedExprIrMoveInto", "CID phase TypedExpr");
  cidRequireOrder(typedIrMove, ["ir = TypedExprIr()", "ir.valueExprTransactionProducerSourceIndex = -1"], "CID phase zero-function moved-from sentinel");
  const typedIrSealedZeroDomain = cidTopLevelFunction(typedExpr, "TypedExprIrZeroFunctionSealedDomainStrictValidate", "CID phase TypedExpr");
  cidRequireOrder(typedIrSealedZeroDomain, ["typedExprIrZeroFunctionDomainStrictValidateWithLocalBindingSeal(", "ir, true"], "CID phase zero-function sealed local-binding identity");
  const semanticDependencyStrict = cidTopLevelFunction(csg, "CompilerCsgSemanticDependencyStrictValidateInto", "CID phase CompilerCSG");
  cidRequire(semanticDependencyStrict, ["semanticGraph.sourceTable.sourcePaths.len", "semanticGraph.sourceTable.modulePaths.len", "semanticGraph.sourceTable.textBytes.len", "semanticGraph.sourceTable.declStart.len", "semanticGraph.sourceTable.declCount.len", "semanticGraph.sourceTable.importEdgeStart.len", "semanticGraph.sourceTable.importEdgeCount.len", "sourceReceipt.sourceSnapshotCount", "semanticGraph.declTable.sourceIndex.len", "semanticGraph.declTable.lineNumbers.len", "semanticGraph.declTable.importc.len", "semanticGraph.declTable.exported.len", "sourceReceipt.importEdgeCount", "semanticGraph.importEdgeTable.targetSourceIndex.len", "semanticGraph.importEdgeTable.ownerModulePaths.len", "semanticGraph.importEdgeTable.targetModulePaths.len", "semanticGraph.importEdgeTable.targetSourcePaths.len", "semanticGraph.importEdgeTable.resolved.len", "semanticGraph.declTable.sourceIndex[declarationIndex]", "semanticGraph.importEdgeTable.ownerSourceIndex[", "semanticGraph.sourceTable.modulePaths[sourceIndex]", "semanticGraph.sourceTable.modulePaths[targetSourceIndex]", "semanticGraph.sourceTable.sourcePaths[targetSourceIndex]"], "CID phase CompilerCSG semantic dependency strict validation");
  const sourceBoundGraphCid = cidTopLevelFunction(csg, "CompilerCsgGraphCid", "CID phase CompilerCSG");
  cidRequireOrder(sourceBoundGraphCid, ["semanticGraph.sourceTable.sourcePaths.len", "semanticGraph.sourceTable.sourcePaths[i]", "semanticGraph.sourceTable.modulePaths[i]", "semanticGraph.sourceTable.textBytes[i]", "semanticGraph.sourceTable.declStart[i]", "semanticGraph.sourceTable.declCount[i]", "semanticGraph.sourceTable.importEdgeStart[i]", "semanticGraph.sourceTable.importEdgeCount[i]", "semanticGraph.declTable.names.len", "semanticGraph.declTable.sourceIndex[i]", "semanticGraph.declTable.names[i]", "semanticGraph.declTable.lineNumbers[i]", "semanticGraph.declTable.importc[i]", "semanticGraph.declTable.exported[i]", "semanticGraph.importEdgeTable.ownerSourceIndex.len", "semanticGraph.importEdgeTable.ownerSourceIndex[i]", "semanticGraph.importEdgeTable.targetSourceIndex[i]", "semanticGraph.importEdgeTable.ownerModulePaths[i]", "semanticGraph.importEdgeTable.targetModulePaths[i]", "semanticGraph.importEdgeTable.targetSourcePaths[i]", "semanticGraph.importEdgeTable.resolved[i]"], "CID phase CompilerCSG semantic dependency CID");
  const sidecarHash = cidTopLevelFunction(parserReceipt, "parserCanonicalSourceSidecarHash", "CID phase parser receipt");
  cidRequire(sidecarHash, ["sidecar.tokenProducerSourceIds[row]", "sidecar.tokenSourceLocalRows[row]", "sidecar.tokenLexicalParentIds[row]", "sidecar.statementRootAnchorTokenIds[row]", "sidecar.statementRootBindingDeclarationStarts[row]", "sidecar.statementRootBindingDeclarationCounts[row]", "importOrigins.importDeclarationProducerSourceIds[row]", "importOrigins.importDeclarationSourceLocalRows[row]", "importOrigins.importDeclarationKeywordTokenIds[row]", "importOrigins.importDeclarationItemStarts[row]", "importOrigins.importDeclarationItemCounts[row]", "importOrigins.importItemProducerSourceIds[row]", "importOrigins.importItemSourceLocalRows[row]", "importOrigins.importItemDeclarationIds[row]", "importOrigins.importItemAliasTokenIds[row]", "importOrigins.importItemModuleTokenStarts[row]", "importOrigins.importItemModuleTokenCounts[row]", "importOrigins.importItemPrefixTokenCounts[row]", "importOrigins.importModuleTokenIds[row]"], "CID phase parser receipt identity hash");
  const sidecarType = cidTypeDeclaration(parserReceipt, "ParserCanonicalSourceSidecar", "CID phase parser receipt");
  cidRequire(sidecarType, ["tokenProducerSourceIds: int32[]", "tokenSourceLocalRows: int32[]", "tokenLexicalParentIds: int32[]", "importOrigins: ParserCanonicalImportOriginSoA"], "CID phase parser receipt token identity SoA");
  const sidecarImportType = cidTypeDeclaration(parserReceipt, "ParserCanonicalImportOriginSoA", "CID phase parser receipt");
  cidRequire(sidecarImportType, ["importDeclarationProducerSourceIds: int32[]", "importDeclarationSourceLocalRows: int32[]", "importDeclarationKeywordTokenIds: int32[]", "importDeclarationSpanIds: int32[]", "importDeclarationItemStarts: int32[]", "importDeclarationItemCounts: int32[]", "importItemProducerSourceIds: int32[]", "importItemSourceLocalRows: int32[]", "importItemDeclarationIds: int32[]", "importItemAliasTokenIds: int32[]", "importItemSpanIds: int32[]", "importItemModuleTokenStarts: int32[]", "importItemModuleTokenCounts: int32[]", "importItemPrefixTokenCounts: int32[]", "importModuleTokenIds: int32[]"], "CID phase parser receipt import origin SoA");
  const sidecarBuild = cidTopLevelFunction(parserReceipt, "parserCanonicalSourceSidecarBuildMappedInto", "CID phase parser receipt");
  cidRequire(sidecarBuild, ["parser.ParserValueExprTreeImportOriginsStrictValidateInto(", "let parserImportOrigins = tree.importOrigins", "let outImportOrigins = out.importOrigins", "parserImportOrigins.declarationProducerSourceIndexes", "outImportOrigins.importDeclarationSourceLocalRows", "outImportOrigins.importDeclarationKeywordTokenIds", "outImportOrigins.importDeclarationItemStarts", "outImportOrigins.importDeclarationItemCounts", "parserImportOrigins.itemProducerSourceIndexes", "outImportOrigins.importItemSourceLocalRows", "outImportOrigins.importItemDeclarationIds", "outImportOrigins.importItemAliasTokenIds", "outImportOrigins.importItemModuleTokenStarts", "outImportOrigins.importItemModuleTokenCounts", "outImportOrigins.importItemPrefixTokenCounts", "outImportOrigins.importModuleTokenIds"], "CID phase parser receipt import origin projection");
  const sidecarPayloadStrict = cidTopLevelFunction(parserReceipt, "parserCanonicalSourceSidecarPayloadStrictValidateInto", "CID phase parser receipt");
  cidRequire(sidecarPayloadStrict, ["sidecar.tokenProducerSourceIds", "sidecar.tokenSourceLocalRows", "sidecar.tokenLexicalParentIds", "parser.ParserValueTokenFmtString", "previousChildEndBytes[parent]", "sidecar.statementRootAnchorTokenIds", "sidecar.statementRootBindingDeclarationStarts", "sidecar.statementRootBindingDeclarationCounts", "parser.ParserValueExprStatementTypeDefault", "parser.ParserValueTokenAssign", "parser.ParserDeclarationLocal", "parser.ParserDeclarationField", "parser.ParserDeclarationType", "type default declaration cardinality invalid", "type default declaration authority invalid", "importOrigins.importDeclarationProducerSourceIds", "importOrigins.importDeclarationSourceLocalRows", "importOrigins.importItemDeclarationIds", "importOrigins.importItemAliasTokenIds", "importOrigins.importModuleTokenIds", "import module adjacency invalid", "simple import replay failed", "grouped prefix drift", "import module token CSR incomplete"], "CID phase parser receipt payload identity validation");
  const sidecarStrict = cidTopLevelFunction(parserReceipt, "ParserCanonicalSourceSidecarStrictValidateInto", "CID phase parser receipt");
  cidRequireOrder(sidecarStrict, ["parserCanonicalSourceSidecarPayloadStrictValidateInto(sidecar, err)", "parserCanonicalSourceSidecarHash(sidecar)", "sidecar.sidecarRaw32"], "CID phase parser receipt sealed identity validation");
  const snapshotSourceInputs = cidTopLevelFunction(snapshotBuilder, "compilerSnapshotBuilderSourceInputsValidateInto", "CID phase snapshot builder");
  cidRequire(snapshotSourceInputs, ["parser_receipt.ParserCanonicalSourceSidecarStrictValidateInto(", "sidecars[producerIndex].sidecarRaw32"], "CID phase snapshot sealed parser sidecar admission");
  const snapshotProjection = cidTopLevelFunction(snapshotBuilder, "compilerSnapshotBuilderProjectionValidate", "CID phase snapshot builder");
  cidRequire(snapshotProjection, ["tokenSourceLocalRows", "tokenLexicalParentIds", "tokens.sourceLocalRows", "tokens.lexicalParentTokenIds", "tokenBase + localParent", "statementRootAnchorTokenIds", "statementRootBindingDeclarationStarts", "statementRootBindingDeclarationCounts", "declarationBase + localBindingDeclarationStart", "tables.parserSidecars.sidecarCids", "sidecars[producerIndex].sidecarRaw32"], "CID phase snapshot identity remap validation");
  const snapshotBuild = cidTopLevelFunction(snapshotBuilder, "CompilerSnapshotParserTablesBuildInto", "CID phase snapshot builder");
  cidRequire(snapshotBuild, ["add(parserSidecars.sidecarCids", "sidecars[producerIndex].sidecarRaw32", "add(tokens.sourceLocalRows", "add(tokens.lexicalParentTokenIds", "tokenBase + localParent", "add(parserSidecars.statementRootAnchorTokenIds", "add(parserSidecars.statementRootBindingDeclarationStarts", "add(parserSidecars.statementRootBindingDeclarationCounts", "declarationBase + localBindingDeclarationStart"], "CID phase snapshot identity remap producer");
  assertCidProductionSourceInterfaceContract(inputs.snapshotBuilder);
  assertCidProductionInterfaceObligationContract(inputs.snapshotBuilder);
  const graphReceiptProducer = cidTopLevelFunction(snapshotBuilder, "compilerSnapshotBuilderGraphReceiptBuildInto", "CID phase snapshot builder");
  cidRequireOrder(graphReceiptProducer, ["let zeroFunctionDomainExact =", "out.sourceCount == 1", "csg.semanticGraph.importEdgeTable.ownerSourceIndex.len == 0", "out.symbolCandidateCount == 0", "out.reachableFunctionCount == 0", "out.typedIrFunctionCount == 0", "out.resolvedCallCount == 0", "prebuildFacts.symbolCids.len == 0", "prebuildFacts.functionSymbolIds.len == 0", "csg.typedIr.nodes2_nodeIndexs.len == 0", "csg.parserNormalizedExprReceipt.functionCount == Int64(0)", "compilerSnapshotBuilderTypedDomainExact(csg)", "let domainExact =", "functionDomainExact || zeroFunctionDomainExact", "out.missingLexicalScopeProofCount =", "zeroFunctionDomainExact ? 0 : out.sourceCount"], "CID phase zero-function graph admission");
  const canonicalSpans = cidTopLevelFunction(snapshotBuilder, "compilerSnapshotBuilderCanonicalSpansBuildInto", "CID phase snapshot builder");
  cidRequireOrder(canonicalSpans, ["var sourceExtent: CompilerSnapshotCanonicalSpanInput", "sourceExtent.startByte =", "sourceExtent.endByte =", "if value.startByte < sourceExtent.startByte:", "if value.endByte > sourceExtent.endByte:", "add(candidates, sourceExtent)"], "CID phase zero-function source extent identity");
  const zeroFunctionLexicalScopes = cidTopLevelFunction(snapshotBuilder, "compilerSnapshotBuilderZeroFunctionLexicalScopesProjectInto", "CID phase snapshot builder");
  cidRequireOrder(zeroFunctionLexicalScopes, ["tables.sources.documentCids.len != 1", "csg.semanticGraph.importEdgeTable.ownerSourceIndex.len != 0", "texpr.TypedExprIrZeroFunctionSealedDomainStrictValidate(", "ParserDeclarationLexicalScopeSource", "compilerSnapshotBuilderSourceSemanticExtentSpanId(tables, 0)", "add(tables.lexicalScopes.sourceIds, 0)", "add(tables.lexicalScopes.parentScopeIds, -1)", "add(tables.lexicalScopes.visibleSymbolIds, symbolId)", "add(tables.lexicalScopes.visibleCounts"], "CID phase zero-function lexical scope identity");
  const arenaTypeTexts = cidTopLevelFunction(snapshotBuilder, "compilerSnapshotBuilderArenaTypeTextsInto", "CID phase snapshot builder");
  cidRequireOrder(arenaTypeTexts, ["TypedExprStructuralTypeTuple", "csg.typeArena.childNameIds", "langintern.LookupIntern(", "add(parts, Value(childNameResult))", 'add(parts, ":")', "add(parts, out[childTypeId])"], "CID phase tuple field text identity");
  const appendArenaType = cidTopLevelFunction(snapshotBuilder, "compilerSnapshotBuilderAppendArenaTypeRow", "CID phase snapshot builder");
  cidRequireOrder(appendArenaType, ["schema.CsgCompilerTypeTuple", "add(tables.types.argTypeIds", "csg.typeArena.childNameIds", "langintern.LookupIntern(", "compilerSnapshotBuilderTextFind(", "add(tables.types.argNameTextIds, childNameTextId)"], "CID phase tuple field identity projection");
  const functionParameterOwnership = cidTopLevelFunction(snapshotBuilder, "compilerSnapshotBuilderFunctionParameterOwnershipKindInto", "CID phase snapshot builder");
  cidRequire(functionParameterOwnership, ["csg.typeArena.typeKinds", "TypedExprStructuralTypeBorrow", "CsgCompilerOwnershipBorrowed", "csg.typeArena.managedFlags", "CsgCompilerOwnershipOwned", "CsgCompilerOwnershipUnmanaged"], "CID phase Function parameter ownership producer");
  if (/functionName|nameText|sourceLine|callTarget|LocalSlot|ownershipKinds/.test(functionParameterOwnership)) fail("CID phase Function parameter ownership producer: guessed ownership outside exact TypeId");
  const snapshotTokenType = cidTypeDeclaration(snapshotSchema, "CsgCompilerTokenTable", "CID phase snapshot schema");
  cidRequire(snapshotTokenType, ["sourceIds: int32[]", "sourceLocalRows: int32[]", "lexicalParentTokenIds: int32[]", "spanIds: int32[]", "kinds: int32[]", "valueTextIds: int32[]"], "CID phase snapshot token identity SoA");
  const snapshotTypeTable = cidTypeDeclaration(snapshotSchema, "CsgCompilerTypeTable", "CID phase snapshot schema");
  cidRequire(snapshotTypeTable, ["argStarts: int32[]", "argCounts: int32[]", "argTypeIds: int32[]", "argNameTextIds: int32[]"], "CID phase tuple field identity SoA");
  const snapshotFunctionTable = cidTypeDeclaration(snapshotSchema, "CsgCompilerFunctionTable", "CID phase snapshot schema");
  cidRequire(snapshotFunctionTable, ["annotationFlags: int32[]", "parameterOwnershipStarts: int32[]", "parameterOwnershipCounts: int32[]", "parameterOwnershipKinds: int32[]"], "CID phase Function annotation/ownership SoA");
  const expectedParameterOwnership = cidTopLevelFunction(snapshotSchema, "csgCompilerFunctionParameterOwnershipExpectedInto", "CID phase snapshot schema");
  cidRequireOrder(expectedParameterOwnership, ["snapshot.types.argStarts[functionTypeId]", "snapshot.types.argCounts[functionTypeId]", "snapshot.types.argTypeIds[argStart + parameterOffset]", "snapshot.types.typeKinds[parameterTypeId]", "CsgCompilerTypeBorrow", "CsgCompilerOwnershipBorrowed", "snapshot.types.managedFlags[parameterTypeId]", "CsgCompilerOwnershipOwned", "CsgCompilerOwnershipUnmanaged"], "CID phase Function parameter ownership exact Type replay");
  const symbolInterfaceCid = cidTopLevelFunction(snapshotSchema, "CsgCompilerSymbolInterfaceCidInto", "CID phase snapshot schema");
  cidRequire(symbolInterfaceCid, ["csgCompilerTypeCidAppendU32(\n            buf,\n            snapshot.functions.annotationFlags[functionId])"], "CID phase Function annotation interface CID");
  cidRequireOrder(symbolInterfaceCid, ["snapshot.functions.parameterOwnershipStarts[functionId]", "snapshot.functions.parameterOwnershipCounts[functionId]", "snapshot.functions.parameterOwnershipKinds", "csgCompilerFunctionParameterOwnershipExpectedInto(", "csgCompilerTypeCidAppendU32(buf, ownershipKind)"], "CID phase Function parameter ownership interface CID");
  const functionsStrict = cidTopLevelFunction(snapshotSchema, "csgCompilerFunctionsAndReadsValidateInto", "CID phase snapshot schema");
  cidRequire(functionsStrict, ["snapshot.functions.annotationFlags.len", "CsgCompilerFunctionAnnotationFlagsValid(", "snapshot.functions.annotationFlags[row]", "snapshot.functions.parameterOwnershipStarts.len", "snapshot.functions.parameterOwnershipCounts.len", "snapshot.functions.parameterOwnershipKinds.len", "ownershipCursor", "csgCompilerFunctionParameterOwnershipExpectedInto("], "CID phase Function annotation/ownership strict replay");
  const snapshotTypeStructure = cidTopLevelFunction(snapshotSchema, "csgCompilerTypeStructureAppendInto", "CID phase snapshot schema");
  cidRequireOrder(snapshotTypeStructure, ["snapshot.types.argNameTextIds.len", "let argNameTextId =", "csgCompilerOptionalIndexValid(", "CsgCompilerTypeTuple", "csgCompilerTypeCidAppendOptionalText("], "CID phase tuple field CID identity");
  const snapshotTypesStrict = cidTopLevelFunction(snapshotSchema, "csgCompilerTypesValidateInto", "CID phase snapshot schema");
  cidRequire(snapshotTypesStrict, ["snapshot.types.argNameTextIds.len", "snapshot.types.argTypeIds.len", "snapshot.types.argNameTextIds[argRow]", "kind != CsgCompilerTypeTuple"], "CID phase tuple field identity validation");
  const snapshotSourceInterfaces = cidTopLevelFunction(snapshotSchema, "CsgCompilerSourceInterfaceCidsInto", "CID phase snapshot schema");
  cidRequire(snapshotSourceInterfaces, ["snapshot.sources.documentCids[sourceId]", "snapshot.symbols.exportedFlags[symbolId]", "snapshot.symbols.symbolCids[symbolId]", "snapshot.symbols.interfaceCids[symbolId]", "snapshot.symbols.symbolKinds[symbolId]", "snapshot.dependencies.targetSourceIds[dependencyId]", "snapshot.dependencies.observedInterfaceCids", "snapshot.sources.interfaceCids[targetSourceId]", "snapshot.dependencies.dependencyKinds[dependencyId]", "hash256.Sha256Fixed("], "CID phase source interface CID producer");
  cidRequireOrder(snapshotSourceInterfaces, ["snapshot.sources.documentCids[sourceId]", "snapshot.symbols.exportedFlags[symbolId]", "snapshot.symbols.symbolCids[symbolId]", "snapshot.symbols.interfaceCids[symbolId]", "snapshot.symbols.symbolKinds[symbolId]", "hash256.Sha256Fixed("], "CID phase source interface CID producer");
  const snapshotSourceInterfaceFinalize = cidTopLevelFunction(snapshotSchema, "CsgCompilerSourceInterfacesFinalizeInto", "CID phase snapshot schema");
  cidRequireOrder(snapshotSourceInterfaceFinalize, ["remainingDependencyCounts[sourceId] =", "dependencyCounts[sourceId]", "if remainingDependencyCounts[sourceId] == 0:", "while queueCursor < queue.len:", "if !completed[targetSourceId]:", "nextObservedInterfaceCids[dependencyId] =", "nextSourceInterfaceCids[targetSourceId]", "hash256.Sha256Fixed(", "if completedCount != sourceCount:", "snapshot.sources.interfaceCids = nextSourceInterfaceCids", "snapshot.dependencies.observedInterfaceCids ="], "CID phase source interface DAG finalization");
  const snapshotDependenciesStrict = cidTopLevelFunction(snapshotSchema, "csgCompilerDependenciesValidateInto", "CID phase snapshot schema");
  cidRequireOrder(snapshotDependenciesStrict, ["snapshot.dependencies.observedInterfaceCids[row]", "snapshot.sources.interfaceCids[target]", "CsgCompilerSourceInterfaceCidsInto(", "expectedInterfaceCids[sourceId]", "snapshot.sources.interfaceCids[sourceId]", "source interface CID mismatch"], "CID phase source interface CID replay");
  const snapshotParserStrict = cidTopLevelFunction(snapshotSchema, "csgCompilerParserValidateInto", "CID phase snapshot schema");
  cidRequire(snapshotParserStrict, ["snapshot.parserSidecars.sidecarCids.len", "csgCompilerCidObserved(snapshot.parserSidecars.sidecarCids[row])", "snapshot.parserSidecars.functionAnnotationFlags", "CsgCompilerFunctionAnnotationFlagsValid(", "tokens.sourceLocalRows", "tokens.lexicalParentTokenIds", "CsgCompilerTokenFmtString", "previousChildEndBytes[lexicalParent]", "statementRootAnchorTokenIds", "statementRootBindingDeclarationStarts", "statementRootBindingDeclarationCounts", "CsgCompilerParserStatementTypeDefault", "CsgCompilerParserDeclarationField", "CsgCompilerParserDeclarationType", "type default declaration cardinality invalid", "type default declaration authority invalid", "binding statement declaration authority invalid"], "CID phase snapshot identity validation");
  const snapshotTokenCargo = cidTopLevelFunction(snapshotCargo, "csgCompilerCargoTokensLine", "CID phase snapshot cargo");
  cidRequireOrder(snapshotTokenCargo, ["snapshot.tokens.kinds", "snapshot.tokens.lexicalParentTokenIds", "snapshot.tokens.sourceIds", "snapshot.tokens.sourceLocalRows", "snapshot.tokens.spanIds", "snapshot.tokens.valueTextIds"], "CID phase snapshot token identity cargo");
  const snapshotTypeCargo = cidTopLevelFunction(snapshotCargo, "csgCompilerCargoTypesLine", "CID phase snapshot cargo");
  cidRequireOrder(snapshotTypeCargo, ["snapshot.types.argCounts", "snapshot.types.argNameTextIds", "snapshot.types.argStarts", "snapshot.types.argTypeIds"], "CID phase tuple field identity cargo");
  const snapshotFunctionCargo = cidTopLevelFunction(snapshotCargo, "csgCompilerCargoFunctionsLine", "CID phase snapshot cargo");
  cidRequireOrder(snapshotFunctionCargo, ['"{\\"annotationFlags\\":"', "snapshot.functions.annotationFlags", '",\\"bodyContentCids\\":"'], "CID phase Function annotation canonical cargo");
  cidRequireOrder(snapshotFunctionCargo, ["snapshot.functions.parameterOwnershipCounts", "snapshot.functions.parameterOwnershipKinds", "snapshot.functions.parameterOwnershipStarts"], "CID phase Function parameter ownership cargo");
  const snapshotParserCargo = cidTopLevelFunction(snapshotCargo, "csgCompilerCargoParserSidecarsLine", "CID phase snapshot cargo");
  cidRequire(snapshotParserCargo, ["statementRootAnchorTokenIds", "statementRootBindingDeclarationCounts", "statementRootBindingDeclarationStarts"], "CID phase snapshot statement cargo");
  cidRequire(snapshotParserCargo, ["snapshot.parserSidecars.functionAnnotationFlags"], "CID phase snapshot Function annotation cargo");
  cidRequireOrder(snapshotParserCargo, ["declarationTypeSyntaxRootIds", "functionAnnotationFlags", "functionBodySpanIds"], "CID phase parser-sidecar Function annotation canonical cargo");
  cidRequireOrder(snapshotParserCargo, ["genericSpanIds", "csg_dialect::cheng_compiler::parser_sidecars", "normalizedExprFunctionIndexes", "normalizedExprKinds", "normalizedExprParserNodeIds", "normalizedExprProducerSourceIds", "normalizedExprSourceLocalRows", "normalizedExprStatementRoles", "parserInputCids"], "CID phase snapshot normalized-expression canonical cargo order");
  cidRequire(snapshotValidator, ["functionAnnotationFlags", "annotationFlags", "lexicalParentTokenIds", "sourceLocalRows", "tokenLexicalParentIds", "tokenSourceLocalRows", "CsgCoreParserTokenFmtString", "statementRootAnchorTokenIds", "statementRootBindingDeclarationCounts", "statementRootBindingDeclarationStarts"], "CID phase snapshot identity cargo validator");
  if ([snapshotBuilder, snapshotSchema, snapshotCargo, snapshotValidator].some((source) =>
    source.includes("functionThreadBoundaryFlags") ||
    source.includes("threadBoundaryFlags")
  )) fail("CID phase Function annotation schema: legacy thread-only compatibility field remains");
  const wireFunctionOwnership = cidTopLevelFunction(snapshotValidator, "csgCompilerWireFunctionParameterOwnershipValidateInto", "CID phase snapshot validator");
  cidRequire(wireFunctionOwnership, ["functionParameterOwnershipStarts", "functionParameterOwnershipCounts", "functionParameterOwnershipKinds", "symbolTypeIds[symbolId]", "typeArgStarts[functionTypeId]", "typeArgCounts[functionTypeId]", "typeArgTypeIds", "typeKinds[parameterTypeId]", "CsgCoreCompilerTypeBorrow", "typeManagedFlags[parameterTypeId]", "CsgCoreCompilerOwnershipBorrowed", "CsgCoreCompilerOwnershipOwned", "CsgCoreCompilerOwnershipUnmanaged"], "CID phase Function parameter ownership wire replay");
  const debugFunctionRow = cidTypeDeclaration(debugReceipt, "DebugSectionPlanFunctionRow", "CID phase debug section receipt");
  const debugOperationRow = cidTypeDeclaration(debugReceipt, "DebugSectionPlanRow", "CID phase debug section receipt");
  if (/^\s+(modulePath|functionName|sourcePath|sourceLine):/m.test(debugFunctionRow) || /^\s+(modulePath|functionName|sourcePath|sourceLine):/m.test(debugOperationRow)) fail("CID phase debug section receipt: function/operation row retained text identity");
  const debugReceiptType = cidTypeDeclaration(debugReceipt, "DebugSectionPlanReceipt", "CID phase debug section receipt");
  cidRequire(debugReceiptType, ["sourceIds: int32[]", "sourceModulePaths: str[]", "sourceDocumentCids: layout.FixedBytes32[]", "functionNames: str[]", "functions: DebugSectionPlanFunctionRow[]", "rows: DebugSectionPlanRow[]"], "CID phase debug source identity SoA");
  const debugReceiptCid = cidTopLevelFunction(debugReceipt, "debugSectionPlanReceiptCid", "CID phase debug section receipt");
  cidRequireOrder(debugReceiptCid, ["debugSectionPlanAppendI32(buf, receipt.sourceIds.len)", "receipt.sourceIds[index]", "receipt.sourceModulePaths[index]", "receipt.sourceDocumentCids[index]", "debugSectionPlanAppendI32(buf, receipt.functions.len)", "receipt.functionNames[index]"], "CID phase debug receipt CID");
  const debugObserveSource = cidTopLevelFunction(debugReceipt, "debugSectionPlanObserveSourceInto", "CID phase debug section receipt");
  cidRequire(debugObserveSource, ["sourceId: int32", "modulePath: str", "documentCid: layout.FixedBytes32", "sourceSeen: var bool[]", "sourceModulePaths: var str[]", "sourceDocumentCids: var layout.FixedBytes32[]", "sourceModulePaths[sourceId] != modulePath", "sourceDocumentCids[sourceId], documentCid", "split source identity"], "CID phase debug source observation");
  const debugBuild = cidTopLevelFunction(debugReceipt, "debugSectionPlanBuildExactInto", "CID phase debug section receipt");
  cidRequireOrder(debugBuild, ["setLen(sourceSeen, facts.sourceCount)", "functionFact.modulePath", "functionFact.documentCid", "operation.modulePath", "operation.documentCid", "add(out.functionNames, functionFact.functionName)", "for sourceId in 0..<facts.sourceCount:", "add(out.sourceIds, sourceId)", "add(out.sourceModulePaths, sourceModulePaths[sourceId])", "add(out.sourceDocumentCids, sourceDocumentCids[sourceId])", "out.receiptCid = debugSectionPlanReceiptCid(out)"], "CID phase debug source projection producer");
  const debugStrict = cidTopLevelFunction(debugReceipt, "DebugSectionPlanReceiptStrictValidateInto", "CID phase debug section receipt");
  cidRequire(debugStrict, ["debugSectionPlanBuildExactInto(", "debugSectionPlanSourceTablesEqual(receipt, rebuilt)", "debugSectionPlanFunctionNamesEqual(", "receipt.receiptCid", "rebuilt.receiptCid"], "CID phase debug source projection strict replay");
  const debugSelf = cidTopLevelFunction(debugReceipt, "DebugSectionPlanReceiptSelfValidateInto", "CID phase debug section receipt");
  cidRequire(debugSelf, ["receipt.sourceIds.len != receipt.sourceModulePaths.len", "receipt.sourceIds.len != receipt.sourceDocumentCids.len", "receipt.functionNames.len != receipt.functions.len", "receipt.sourceIds[sourceIndex] <= previousSourceId", "receipt.sourceDocumentCids[functionSourceIndex]", "functionRow.documentCid", "receipt.sourceDocumentCids[rowSourceIndex]", "row.documentCid"], "CID phase debug source projection self validation");
  const directInfo = cidTopLevelFunction(directDebug, "directObjectDebugBuildInfoInto", "CID phase direct object debug sections");
  cidRequire(directInfo, ["receipt.functionNames[functionRowIndex]", "directObjectDebugSourceFileIndex(", "sourceIds, functionRow.sourceId"], "CID phase direct debug info identity consumption");
  if (directInfo.includes("functionRow.functionName")) fail("CID phase direct debug info: reconstructed semantic function name from row");
  const directBuild = cidTopLevelFunction(directDebug, "DirectObjectDebugSectionsBuildInto", "CID phase direct object debug sections");
  cidRequireOrder(directBuild, ["DebugSectionPlanReceiptSelfValidateInto(receipt, err)", "receipt.sourceIds, receipt.sourceModulePaths", "receipt.sourceIds, symbols"], "CID phase direct debug source table consumption");
  if (directBuild.includes("maxSourceId") || directBuild.includes("compactSourceIds") || directBuild.includes("directObjectDebugBindSourceInto")) fail("CID phase direct debug sections: reconstructed source table from rows");
  if (/row\.modulePath|functionRow\.functionName/.test(directDebug)) fail("CID phase direct debug sections: consumed removed row text identity");
  const capture = cidTopLevelFunction(exec, "SystemLinkExecSourceBundleReceiptCaptureInto", "CID phase exec");
  cidRequire(capture, ["SystemLinkPlanSourceBundleBindingStructuralValidInto(", "PortableSourceIdentityReceiptStrictValidateInto(", "portable source receipt disagrees with sealed source bundle"], "CID phase compact receipt capture");
  if (capture.includes("SystemLinkPlanSourceBundleBindingValidInto(")) fail("CID phase compact receipt capture: reopened full source closure");
  if (exec.includes("slplan.SystemLinkPlanSourceBundleBindingValidInto(")) fail("CID phase system_link_exec: source-bundle phase reopened full source closure");
  const core = cidTopLevelFunction(csg, "compilerCsgBuildConsumeWithOverridesCoreInto", "CID phase CompilerCSG");
  cidRequireOrder(core, ["CompilerCsgExactExprRowsMarkNonFunctionDeclarationDomain(", "CompilerCsgExactExprRowsRequireClosed("], "CID phase CompilerCSG declaration-domain consume order");
  cidRequire(core, ["CompilerCsgReadSourceTextCached(", "CompilerCsgPortableOverrideBindingValidateInto(", "SystemLinkPlanRebuildImportEdgesFromTextsInto(", "CompilerCsgVerifyImmutableSourceIdentity(", "texpr.TypedExprIrZeroFunctionDomainStrictValidate(", "zeroFunctionTypedIr", "CompilerCsgTraceStage(\"after_binding_source_texts\")", "CompilerCsgTraceStage(\"after_binding_import_rebuild\")", "CompilerCsgTraceStage(\"after_binding_import_compare\")", "CompilerCsgTraceStage(\"after_portable_binding_validation\")", "CompilerCsgTraceStage(\"after_binding_source_text_release\")"], "CID phase CompilerCSG byte consumer");
  cidRequireOrder(core, ["CompilerCsgTraceStage(\"after_binding_source_texts\")", "SystemLinkPlanRebuildImportEdgesFromTextsInto(", "CompilerCsgTraceStage(\"after_binding_import_rebuild\")", "CompilerCsgTraceStage(\"after_binding_import_compare\")", "CompilerCsgPortableOverrideBindingValidateInto(", "CompilerCsgTraceStage(\"after_portable_binding_validation\")", "CompilerCsgTraceStage(\"after_binding_source_text_release\")"], "CID phase CompilerCSG memory trace");
  if (core.indexOf("SystemLinkPlanRebuildImportEdgesFromTextsInto(") >= core.indexOf("CompilerCsgPortableOverrideBindingValidateInto(")) fail("CID phase CompilerCSG: portable binding reparsed imports before exact graph rebuild");
  const traceStderrAllowed = cidTopLevelFunction(csg, "CompilerCsgTraceStderrStageAllowed", "CID phase CompilerCSG");
  cidRequire(traceStderrAllowed, ['stage == "after_binding_source_texts"', 'stage == "after_binding_import_rebuild"', 'stage == "after_binding_import_compare"', 'stage == "after_portable_binding_validation"', 'stage == "after_binding_source_text_release"'], "CID phase CompilerCSG trace whitelist");
  const portableOverride = cidTopLevelFunction(csg, "CompilerCsgPortableOverrideBindingValidateInto", "CID phase CompilerCSG");
  cidRequire(portableOverride, ["sourceTexts: var str[]", "rebuiltImportEdges: var parser.ImportEdge[]", "SystemLinkPlanPortableSourceBindingValidateRebuiltTextsInto("], "CID phase CompilerCSG portable binding");
  if (portableOverride.includes("SystemLinkPlanPortableSourceBindingFromTextsInto(")) fail("CID phase CompilerCSG portable binding: reparsed immutable source imports");
  const driverBody = cidTopLevelFunction(driver, "BackendDriverDispatchMinRunSystemLinkExecConcretePlanAfterSourceBundle", "CID phase backend driver");
  cidRequire(driverBody, ["SystemLinkExecSourceBundleReceiptCaptureInto(", "BuildCompilerCsgConsumePortableReceiptWithOverridesInto("], "CID phase production driver");
  if (driverBody.indexOf("SystemLinkExecSourceBundleReceiptCaptureInto(") >= driverBody.indexOf("BuildCompilerCsgConsumePortableReceiptWithOverridesInto(")) fail("CID phase production driver: CSG consume must follow compact receipt capture");
}

function parseSourceToolManifest(raw: Buffer): {sourceClosure: string; toolClosure: string; sourceCount: number; toolCount: number; sourceEntries: ReadonlyMap<string, ClosureIdentity>; toolEntries: ReadonlyMap<string, ClosureIdentity>} {
  const value = parseJsonRaw(raw, "source/tool manifest", true); if (!isRecord(value)) fail("source/tool manifest: 非 object"); exactKeys(value, ["schema", "sourceEntryCount", "sourceClosureSha256", "sourceEntries", "toolEntryCount", "toolClosureSha256", "toolEntries"], "source/tool manifest"); if (value.schema !== "cheng.cid_linux_current_source_closure") fail("source/tool manifest: schema");
  const parseEntries = (name: "sourceEntries" | "toolEntries", countName: "sourceEntryCount" | "toolEntryCount", cidName: "sourceClosureSha256" | "toolClosureSha256", domain: string) => { const entries = value[name]; if (!Array.isArray(entries) || value[countName] !== entries.length) fail(`source/tool manifest: ${name} count`); let prior = ""; const identities = new Map<string, ClosureIdentity>(); for (let i = 0; i < entries.length; i += 1) { const entry = entries[i]; if (!isRecord(entry)) fail(`source/tool manifest: ${name}[${i}]`); exactKeys(entry, ["path", "sha256", "size"], `${name}[${i}]`); const path = canonicalRelativePath(stringField(entry, "path", `${name}[${i}]`), `${name}[${i}].path`); if (i > 0 && Buffer.compare(Buffer.from(prior), Buffer.from(path)) >= 0) fail(`source/tool manifest: ${name} order`); prior = path; const size = uintField(entry, "size", `${name}[${i}]`); identities.set(path, {sha256: hex32(stringField(entry, "sha256", `${name}[${i}]`), `${name}[${i}].sha256`), size}); } const claimed = hex32(String(value[cidName]), cidName); if (framedClosure(domain, entries as Record<string, unknown>[]) !== claimed) fail(`source/tool manifest: ${cidName}`); return {count: entries.length, cid: claimed, identities}; };
  const source = parseEntries("sourceEntries", "sourceEntryCount", "sourceClosureSha256", "cheng.cid_linux_current_source.source_closure"); const tool = parseEntries("toolEntries", "toolEntryCount", "toolClosureSha256", "cheng.cid_linux_current_source.tool_closure"); return {sourceClosure: source.cid, toolClosure: tool.cid, sourceCount: source.count, toolCount: tool.count, sourceEntries: source.identities, toolEntries: tool.identities};
}

function verifyClosureFiles(files: EvidenceFiles, refs: readonly ClosureFileRef[], expected: ReadonlyMap<string, ClosureIdentity>, label: string): ReadonlyMap<string, Buffer> {
  if (refs.length !== expected.size) fail(`${label}: raw closure count`); const rawByPath = new Map<string, Buffer>(); for (let i = 0; i < refs.length; i += 1) { const ref = refs[i]; const identity = expected.get(ref.logical_path); if (!identity) fail(`${label}: unexpected logical path ${ref.logical_path}`); const raw = files.read(ref.artifact, `${label}[${i}]`); if (raw.length !== identity.size || sha256(raw) !== identity.sha256) fail(`${label}: raw bytes ${ref.logical_path}`); rawByPath.set(ref.logical_path, raw); } return rawByPath;
}

function parseCandidateManifest(raw: Buffer): ReadonlyMap<string, string> {
  const rows = parseExternalKv(raw, "candidate manifest"); exactMapKeyOrder(rows, CANDIDATE_MANIFEST_KEYS, "candidate manifest"); if (rows.get("schema") !== "cheng.cid_linux_current_source_candidate_manifest" || rows.get("target") !== "x86_64-unknown-linux-gnu" || rows.get("machine") !== "x86_64" || rows.get("candidate_execution") !== "passed" || rows.get("current_report_origin") !== "bootstrap_seed_current_pure_system_link_exec" || rows.get("candidate_elf_magic") !== "7f454c46" || rows.get("candidate_elf_class") !== "2" || rows.get("candidate_elf_data") !== "1" || rows.get("candidate_elf_machine") !== "62") fail("candidate manifest: production identity");
  officialEntrySpec(rows.get("candidate_entry_path"), rows.get("candidate_entry_module_path"), "candidate manifest");
  for (const key of CANDIDATE_MANIFEST_KEYS.filter((key) => key.endsWith("sha256") || key.endsWith("digest") || key === "toolchain_image_id")) { const value = rows.get(key)!; if (key === "toolchain_image_id") { if (!/^sha256:[0-9a-f]{64}$/.test(value)) fail("candidate manifest: image id"); } else hex32(value.replace(/^sha256:/, ""), `candidate manifest.${key}`); }
  return rows;
}

function parseCaseBinding(raw: Buffer, item: EvidenceCase, candidateSha: string, candidateEntryPath: keyof typeof CID_OFFICIAL_ENTRY_SPECS, candidateEntryModulePath: typeof CID_OFFICIAL_ENTRY_SPECS[keyof typeof CID_OFFICIAL_ENTRY_SPECS], candidateEntrySha256: string, sourceManifestSha: string, toolManifestSha: string, imageManifestSha: string, receipt: ReadonlyMap<string, string>, receiptRawSha: string): void {
  const value = parseJsonRaw(raw, `${item.case_id}.case_binding`, true); if (!isRecord(value)) fail(`${item.case_id}: case binding`); exactKeys(value, ["candidate_entry_module_path", "candidate_entry_path", "candidate_entry_sha256", "candidate_sha256", "case_id", "cgroup_receipt_raw_sha256", "image_id", "image_manifest_sha256", "manifest_sha256", "schema", "source_manifest_sha256", "target_argv", "target_argv_sha256", "tool_manifest_sha256"], `${item.case_id}.case_binding`); const projection = {...value}; delete projection.manifest_sha256; const targetArgv = value.target_argv; const expectedArgv = cidCaseTargetArgv(item.case_id, candidateSha); verifyCidCaseControllerBinding(receipt, item.case_id, candidateSha, candidateEntryPath, candidateEntryModulePath, candidateEntrySha256, item.case_id); if (!Array.isArray(targetArgv) || canonicalJson(targetArgv) !== canonicalJson(expectedArgv)) fail(`${item.case_id}: target argv 不精确`); if (value.schema !== "cheng.cid.case_binding" || value.case_id !== item.case_id || value.candidate_sha256 !== candidateSha || value.candidate_entry_path !== candidateEntryPath || value.candidate_entry_module_path !== candidateEntryModulePath || value.candidate_entry_sha256 !== candidateEntrySha256 || value.source_manifest_sha256 !== sourceManifestSha || value.tool_manifest_sha256 !== toolManifestSha || value.image_manifest_sha256 !== imageManifestSha || value.image_id !== receipt.get("image_id") || value.target_argv_sha256 !== receipt.get("target_argv_sha256") || value.target_argv_sha256 !== sha256FramedStrings(expectedArgv) || value.cgroup_receipt_raw_sha256 !== receiptRawSha || value.manifest_sha256 !== sha256(Buffer.from(canonicalJson(projection)))) fail(`${item.case_id}: case binding mismatch`);
}

const DESTRUCTIVE_MUTATION_CATEGORIES = ["byte", "length", "kind", "package", "module", "entry", "count", "order", "edge", "csg", "provider", "target", "migration_mapping", "proof", "manifest", "mirror_path", "world_lock", "external_payload"] as const;
const PRESERVING_MUTATION_CATEGORIES = ["source_root_relocation", "mirror_root_relocation", "canonical_input_permutation"] as const;
const MUTATION_CATEGORIES = [...DESTRUCTIVE_MUTATION_CATEGORIES, ...PRESERVING_MUTATION_CATEGORIES] as const;
type MutationCategory = typeof MUTATION_CATEGORIES[number];
const MUTATION_ROUTE: Readonly<Record<MutationCategory, string>> = Object.freeze({
  byte: "source_entry_byte", length: "source_entry_length", kind: "csg_node_kind", package: "source_package_id", module: "csg_module_path", entry: "source_entry_module", count: "source_receipt_count", order: "source_receipt_field_order", edge: "source_import_edge", csg: "semantic_csg_binding", provider: "semantic_provider_set", target: "semantic_target", migration_mapping: "migration_unit_mapping", proof: "migration_proof_binding", manifest: "universe_manifest_entry", mirror_path: "mirror_module_path", world_lock: "world_head_manifest_lock", external_payload: "mirror_external_payload", source_root_relocation: "migration_cross_root_source", mirror_root_relocation: "mirror_cross_root_bundle", canonical_input_permutation: "source_module_permutation",
});

interface MutationReplayToolHashes {
  readonly oracle: string;
  readonly evidence: string;
  readonly cli: string;
}

export function assertMutationReplayRecipe(raw: Buffer, expectedCandidateSha256?: string, expectedTools?: MutationReplayToolHashes): void {
  const value = parseJsonRaw(raw, "mutation replay", true); if (!isRecord(value)) fail("mutation replay: 非 object"); exactKeys(value, ["candidate_sha256", "cli_sha256", "evidence_sha256", "manifest_sha256", "oracle_sha256", "rows", "schema"], "mutation replay");
  if (value.schema !== "cheng.cid.mutation_replay") fail("mutation replay: schema");
  const candidateSha = hex32(stringField(value, "candidate_sha256", "mutation replay"), "mutation replay.candidate_sha256");
  const toolHashes = {
    oracle: hex32(stringField(value, "oracle_sha256", "mutation replay"), "mutation replay.oracle_sha256"),
    evidence: hex32(stringField(value, "evidence_sha256", "mutation replay"), "mutation replay.evidence_sha256"),
    cli: hex32(stringField(value, "cli_sha256", "mutation replay"), "mutation replay.cli_sha256"),
  };
  if (expectedCandidateSha256 && candidateSha !== expectedCandidateSha256) fail("mutation replay: candidate binding");
  if (expectedTools && (toolHashes.oracle !== expectedTools.oracle || toolHashes.evidence !== expectedTools.evidence || toolHashes.cli !== expectedTools.cli)) fail("mutation replay: oracle/evidence/CLI raw bytes binding");
  const projection = {...value}; delete projection.manifest_sha256; if (value.manifest_sha256 !== sha256(Buffer.from(canonicalJson(projection)))) fail("mutation replay: manifest SHA");
  if (!Array.isArray(value.rows) || value.rows.length !== MUTATION_CATEGORIES.length) fail("mutation replay: 分类集");
  for (let index = 0; index < MUTATION_CATEGORIES.length; index += 1) { const row = value.rows[index]; const category = MUTATION_CATEGORIES[index]; if (!isRecord(row)) fail(`mutation replay: row[${index}]`); exactKeys(row, ["category", "expected_relation", "id", "oracle_route"], `mutation replay.row[${index}]`); const relation = index < DESTRUCTIVE_MUTATION_CATEGORIES.length ? "reject" : "same_cid"; if (row.category !== category || row.id !== `mutation-${category}` || row.oracle_route !== MUTATION_ROUTE[category] || row.expected_relation !== relation) fail(`mutation replay: row[${index}] 非冻结 recipe`); }
}

function mutationCase(cases: readonly EvidenceCase[], kind: CaseKind): EvidenceCase {
  const matches = cases.filter((item) => item.kind === kind); if (matches.length !== 1) fail(`mutation replay: case ${kind} 不唯一`); return matches[0];
}

function mutationReject(label: string, action: () => void): void {
  let rejected = false;
  try {
    action();
  } catch (error) {
    if (!(error instanceof CidOracleError)) throw error;
    rejected = true;
  }
  if (!rejected) fail(`mutation replay: ${label} 未拒绝`);
}

function mutationLine(raw: Buffer, key: string, mutate: (value: string) => string): Buffer {
  const text = new TextDecoder("utf-8", {fatal: true}).decode(raw); if (text.length === 0 || text.endsWith("\n") || text.includes("\r") || text.includes("\0")) fail(`mutation replay: ${key} baseline wire`); const lines = text.split("\n"); const prefix = `${key}=`; const indexes = lines.map((line, index) => line.startsWith(prefix) ? index : -1).filter((index) => index >= 0); if (indexes.length !== 1) fail(`mutation replay: ${key} baseline field count`); const index = indexes[0]; const before = lines[index].slice(prefix.length); const after = mutate(before); if (after === before || after.length === 0 || after.includes("\n") || after.includes("\r") || after.includes("\0")) fail(`mutation replay: ${key} mutation invalid`); lines[index] = prefix + after; return Buffer.from(lines.join("\n"));
}

function mutationHex(value: string): string {
  if (!/^[0-9a-f]+$/.test(value)) fail("mutation replay: 非 lowercase hex field"); const first = value[0] === "0" ? "1" : "0"; return first + value.slice(1);
}

function mutationUint(value: string): string {
  if (!UINT.test(value)) fail("mutation replay: 非 uint field"); const next = Number(value) + 1; if (!Number.isSafeInteger(next)) fail("mutation replay: uint overflow"); return String(next);
}

function mutationCsgNodeField(raw: Buffer, fieldIndex: number, mutate: (value: string) => string): Buffer {
  return mutationLine(raw, "node[0]", (value) => { const parts = value.split("|"); if (parts.length !== 20 || fieldIndex < 0 || fieldIndex >= parts.length) fail("mutation replay: CSG node baseline"); parts[fieldIndex] = mutate(parts[fieldIndex]); return parts.join("|"); });
}

function mutationSourceContext(files: EvidenceFiles, item: EvidenceCase): {modules: SourceModuleBytes[]; entryIndex: number; receipt: ReturnType<typeof parsePortableSourceReceipt>} {
  const modules = sourceModules(files, item.modules, "mutation replay.source modules"); const entryIndex = modules.findIndex((module) => module.modulePath === item.entry_module_path); if (entryIndex < 0 || modules[entryIndex].bytes.length === 0) fail("mutation replay: source entry 必须非空"); const receipt = parsePortableSourceReceipt(files.read(item.artifacts.source_receipt, "mutation replay.source receipt")); assertPortableSourceReceiptEqual(receipt, buildPortableSourceIdentity(item.package_id, item.entry_module_path, modules)); return {modules, entryIndex, receipt};
}

function mutationSourceBytesReject(files: EvidenceFiles, item: EvidenceCase, lengthMutation: boolean): void {
  const context = mutationSourceContext(files, item); const before = context.modules[context.entryIndex].bytes; const after = lengthMutation ? Buffer.concat([before, Buffer.from([0x20])]) : Buffer.from(before); if (!lengthMutation) after[0] ^= 1; if (lengthMutation ? after.length === before.length : (after.length !== before.length || [...before].filter((value, index) => value !== after[index]).length !== 1)) fail("mutation replay: source byte/length mutation shape"); const modules = context.modules.map((module, index) => index === context.entryIndex ? {...module, bytes: after} : module); const mutant = buildPortableSourceIdentity(item.package_id, item.entry_module_path, modules); if (mutant.receiptCid === context.receipt.receiptCid) fail("mutation replay: source mutation CID 未改变"); mutationReject(lengthMutation ? "length" : "byte", () => assertPortableSourceReceiptEqual(context.receipt, mutant));
}

function verifyMutationReplay(files: EvidenceFiles, cases: readonly EvidenceCase[]): void {
  const sourceItem = mutationCase(cases, "zero_byte_import"); const csgItem = mutationCase(cases, "source_csg_binding"); const migrationItem = mutationCase(cases, "migration_cross_root_fixed_point"); const mirrorItem = mutationCase(cases, "mirror_atomic_install");
  mutationSourceBytesReject(files, sourceItem, false); mutationSourceBytesReject(files, sourceItem, true);
  const csgRaw = files.read(csgItem.artifacts.csg_sidecar, "mutation replay.CSG"); parseCanonicalCsgSidecar(csgRaw); mutationReject("kind", () => parseCanonicalCsgSidecar(mutationCsgNodeField(csgRaw, 1, (value) => value === "2" ? "3" : "2")));
  const sourceContext = mutationSourceContext(files, sourceItem); const packageMutant = buildPortableSourceIdentity(`${sourceItem.package_id}-mutation`, sourceItem.entry_module_path, sourceContext.modules); if (packageMutant.receiptCid === sourceContext.receipt.receiptCid) fail("mutation replay: package CID 未改变"); mutationReject("package", () => assertPortableSourceReceiptEqual(sourceContext.receipt, packageMutant));
  mutationReject("module", () => parseCanonicalCsgSidecar(mutationCsgNodeField(csgRaw, 3, (value) => value + Buffer.from("-mutation").toString("hex"))));
  const sourceReceiptRaw = files.read(sourceItem.artifacts.source_receipt, "mutation replay.source receipt raw"); mutationReject("entry", () => parsePortableSourceReceipt(mutationLine(sourceReceiptRaw, "entry_module_path_cid", mutationHex))); mutationReject("count", () => parsePortableSourceReceipt(mutationLine(sourceReceiptRaw, "source_snapshot_count", mutationUint))); const sourceLines = sourceReceiptRaw.toString("utf8").split("\n"); if (sourceLines.length < 2) fail("mutation replay: source receipt order baseline"); [sourceLines[0], sourceLines[1]] = [sourceLines[1], sourceLines[0]]; mutationReject("order", () => parsePortableSourceReceipt(Buffer.from(sourceLines.join("\n")))); mutationReject("edge", () => parsePortableSourceReceipt(mutationLine(sourceReceiptRaw, "import_graph_cid", mutationHex)));
  const semanticRaw = files.read(csgItem.artifacts.semantic_receipt, "mutation replay.semantic receipt"); parseCompileSemanticReceipt(semanticRaw); mutationReject("csg", () => parseCompileSemanticReceipt(mutationLine(semanticRaw, "canonical_compiler_csg_cid", mutationHex))); mutationReject("provider", () => parseCompileSemanticReceipt(mutationLine(semanticRaw, "ordered_provider_set_cid", mutationHex))); mutationReject("target", () => parseCompileSemanticReceipt(mutationLine(semanticRaw, "target_triple_cid", mutationHex)));
  const migrationRaw = files.read(migrationItem.artifacts.migration_evidence, "mutation replay.migration evidence"); parseMigrationEvidence(migrationRaw); mutationReject("migration_mapping", () => parseMigrationEvidence(mutationLine(migrationRaw, "unit[0].module_path", (value) => `${value}-mutation`))); const proofRaw = files.read(migrationItem.artifacts.migration_proof, "mutation replay.migration proof"); parseMigrationProof(proofRaw); mutationReject("proof", () => parseMigrationProof(mutationLine(proofRaw, "migration_evidence_cid", mutationHex)));
  const manifestRaw = files.read(mirrorItem.artifacts.universe_manifest, "mutation replay.universe manifest"); parseUniverseManifest(manifestRaw); mutationReject("manifest", () => parseUniverseManifest(mutationLine(manifestRaw, "entry[0].snapshot_cid", mutationHex))); const mirrorRaw = files.read(mirrorItem.artifacts.mirror_bundle, "mutation replay.mirror bundle"); parseMirrorBundle(mirrorRaw); mutationReject("mirror_path", () => parseMirrorBundle(mutationLine(mirrorRaw, "unit[0].module_path", (value) => `${value}-mutation`))); const worldRaw = files.read(mirrorItem.artifacts.world_head, "mutation replay.world head"); parseWorldHead(worldRaw); mutationReject("world_lock", () => parseWorldHead(mutationLine(worldRaw, "manifest_root_cid", mutationHex))); mutationReject("external_payload", () => parseMirrorBundle(mutationLine(mirrorRaw, "unit[0].migrated_source_text_hex", (value) => value.length === 0 ? "00" : mutationHex(value))));
  const migrationRootA = files.read(migrationItem.artifacts.migration_evidence, "mutation replay.source root A"); const migrationRootB = files.read(migrationItem.artifacts.root_b_migration_evidence, "mutation replay.source root B"); const migrationA = parseMigrationEvidence(migrationRootA); const migrationB = parseMigrationEvidence(migrationRootB); if (!migrationRootA.equals(migrationRootB) || migrationA.evidenceCid !== migrationB.evidenceCid || migrationA.legacySourceReceipt.receiptCid !== migrationB.legacySourceReceipt.receiptCid || migrationA.migratedSourceReceipt.receiptCid !== migrationB.migratedSourceReceipt.receiptCid) fail("mutation replay: source_root_relocation false red");
  const mirrorRootA = files.read(mirrorItem.artifacts.mirror_bundle, "mutation replay.mirror root A"); const mirrorRootB = files.read(mirrorItem.artifacts.root_b_mirror_bundle, "mutation replay.mirror root B"); const bundleA = parseMirrorBundle(mirrorRootA); const bundleB = parseMirrorBundle(mirrorRootB); if (!mirrorRootA.equals(mirrorRootB) || bundleA.bundleCid !== bundleB.bundleCid) fail("mutation replay: mirror_root_relocation false red");
  if (sourceContext.modules.length < 2) fail("mutation replay: canonical permutation 需要多模块"); const permuted = buildPortableSourceIdentity(sourceItem.package_id, sourceItem.entry_module_path, [...sourceContext.modules].reverse()); const canonical = buildPortableSourceIdentity(sourceItem.package_id, sourceItem.entry_module_path, sourceContext.modules); if (JSON.stringify(permuted) !== JSON.stringify(canonical)) fail("mutation replay: canonical_input_permutation false red");
}

export interface EvidenceVerificationResult {
  readonly manifestSha256: string;
  readonly candidateSha256: string;
  readonly candidateEntryPath:
    keyof typeof CID_OFFICIAL_ENTRY_SPECS;
  readonly candidateEntryModulePath:
    typeof CID_OFFICIAL_ENTRY_SPECS[keyof typeof CID_OFFICIAL_ENTRY_SPECS];
  readonly candidateEntrySha256: string;
  readonly caseIds: readonly string[];
  readonly status: "CID_GREEN_CANDIDATE";
}

export const CID_REQUIRED_FUSION_TOOLS = Object.freeze([
  "cheng-fusion/src/cheng_cid_identity_chain_evidence.ts",
  "cheng-fusion/src/cheng_cid_identity_chain_oracle.ts",
  "cheng-fusion/tools/cid_identity_chain_verify.ts",
] as const);

export const CID_REQUIRED_IDENTITY_TOOLS = Object.freeze([
  ...CID_REQUIRED_FUSION_TOOLS,
  "cheng-fusion/cli.ts",
  "cheng-fusion/index.ts",
  "cheng-fusion/package.json",
  "cheng-fusion/bun.lock",
  "cheng-fusion/src/cheng_cid_identity_chain_audit.ts",
  "cheng-fusion/src/cheng_fusion_tool_registry.ts",
  "cheng-fusion/src/cheng_fusion_mcp_server_m9009.ts",
  "tools/cid_linux_identity_chain_case_image.py",
  "tools/cid_linux_identity_chain_evidence_producer.py",
  "tools/cid_linux_identity_chain_evidence_runner.sh",
  "tools/cid_linux_identity_chain_evidence_schema.py",
] as const);

export function assertCidRequiredIdentityTools(
  sourceToolPaths: ReadonlySet<string>,
  evidenceToolPaths: ReadonlySet<string>,
): void {
  for (const logicalPath of CID_REQUIRED_IDENTITY_TOOLS) {
    if (!sourceToolPaths.has(logicalPath) || !evidenceToolPaths.has(logicalPath)) {
      fail(`source/tool manifest: 缺正式身份工具 ${logicalPath}`);
    }
  }
}

export function verifyCidEvidence(manifestPath: string): EvidenceVerificationResult {
  const absoluteManifest = resolve(manifestPath); const files = new EvidenceFiles(dirname(absoluteManifest)); const manifestName = relative(files.root, absoluteManifest).split(sep).join("/"); canonicalRelativePath(manifestName, "manifest path"); const manifestRaw = files.readPath(manifestName, "evidence manifest"); const manifest = parseEvidenceManifest(manifestRaw);
  const candidate = files.read(manifest.candidate, "candidate"); const candidateSha = sha256(candidate); const sourceManifestRaw = files.read(manifest.source_manifest, "source manifest"); const sourceManifest = parseSourceToolManifest(sourceManifestRaw); const sourceRaw = verifyClosureFiles(files, manifest.source_files, sourceManifest.sourceEntries, "source_files"); verifyClosureFiles(files, manifest.tool_files, sourceManifest.toolEntries, "tool_files");
  const candidateEntryIdentity = sourceManifest.sourceEntries.get(manifest.candidate_entry_path); const candidateEntryRaw = sourceRaw.get(manifest.candidate_entry_path); if (!candidateEntryIdentity || !candidateEntryRaw || candidateEntryIdentity.sha256 !== manifest.candidate_entry_sha256 || sha256(candidateEntryRaw) !== manifest.candidate_entry_sha256) fail("CID evidence manifest: selected entry raw identity mismatch");
  const sourcePhasePaths = {
    systemLinkPlan: "src/core/backend/system_link_plan.cheng",
    systemLinkExec: "src/core/backend/system_link_exec.cheng",
    parser: "src/core/lang/parser.cheng",
    parserReceipt: "src/core/tooling/compiler_parser_receipt.cheng",
    typedExpr: "src/core/lang/typed_expr.cheng",
    snapshotBuilder: "src/core/tooling/compiler_snapshot_builder.cheng",
    snapshotSchema: "src/core/csg_core/compiler_snapshot_schema.cheng",
    snapshotCargo: "src/core/csg_core/compiler_snapshot_cargo.cheng",
    snapshotValidator: "src/core/csg_core/validator.cheng",
    compilerWorld: "src/core/tooling/compiler_world.cheng",
    sha256: "src/std/crypto/sha256.cheng",
    hash256: "src/std/crypto/hash256.cheng",
    compilerCsg: "src/core/tooling/compiler_csg.cheng",
    backendDriver: "src/core/tooling/backend_driver_dispatch_min.cheng",
    debugSectionPlanReceipt: "src/core/backend/debug_section_plan_receipt.cheng",
    directObjectDebugSections: "src/core/backend/direct_object_debug_sections.cheng",
  } as const;
  for (const logicalPath of Object.values(sourcePhasePaths)) if (!sourceRaw.has(logicalPath)) fail(`source/tool manifest: 缺 CID phase contract source ${logicalPath}`);
  assertCidSourcePhaseContract({
    systemLinkPlan: sourceRaw.get(sourcePhasePaths.systemLinkPlan)!,
    systemLinkExec: sourceRaw.get(sourcePhasePaths.systemLinkExec)!,
    parser: sourceRaw.get(sourcePhasePaths.parser)!,
    parserReceipt: sourceRaw.get(sourcePhasePaths.parserReceipt)!,
    typedExpr: sourceRaw.get(sourcePhasePaths.typedExpr)!,
    snapshotBuilder: sourceRaw.get(sourcePhasePaths.snapshotBuilder)!,
    snapshotSchema: sourceRaw.get(sourcePhasePaths.snapshotSchema)!,
    snapshotCargo: sourceRaw.get(sourcePhasePaths.snapshotCargo)!,
    snapshotValidator: sourceRaw.get(sourcePhasePaths.snapshotValidator)!,
    compilerWorld: sourceRaw.get(sourcePhasePaths.compilerWorld)!,
    sha256: sourceRaw.get(sourcePhasePaths.sha256)!,
    hash256: sourceRaw.get(sourcePhasePaths.hash256)!,
    compilerCsg: sourceRaw.get(sourcePhasePaths.compilerCsg)!,
    backendDriver: sourceRaw.get(sourcePhasePaths.backendDriver)!,
    debugSectionPlanReceipt: sourceRaw.get(sourcePhasePaths.debugSectionPlanReceipt)!,
    directObjectDebugSections: sourceRaw.get(sourcePhasePaths.directObjectDebugSections)!,
  });
  assertCidRequiredIdentityTools(new Set(sourceManifest.toolEntries.keys()), new Set(manifest.tool_files.map((entry) => entry.logical_path))); const fusionToolHashes: MutationReplayToolHashes = {evidence: sourceManifest.toolEntries.get(CID_REQUIRED_FUSION_TOOLS[0])!.sha256, oracle: sourceManifest.toolEntries.get(CID_REQUIRED_FUSION_TOOLS[1])!.sha256, cli: sourceManifest.toolEntries.get(CID_REQUIRED_FUSION_TOOLS[2])!.sha256}; const toolManifestRaw = files.read(manifest.tool_manifest, "tool manifest"); const toolManifest = parseCandidateManifest(toolManifestRaw); const imageManifestRaw = files.read(manifest.image_manifest, "image manifest"); const imageManifest = parseSingleton(imageManifestRaw, "image manifest");
  const expectedGateRunner = sourceManifest.toolEntries.get("tools/beat_c_linux_cgroup_v2_hard_memory_gate.py")?.sha256; const expectedGateValidator = sourceManifest.toolEntries.get("tools/beat_c_validate_linux_cgroup_v2_hard_memory_receipt.py")?.sha256; if (!expectedGateRunner || !expectedGateValidator) fail("source/tool manifest: 缺 exact-1GiB gate/validator"); const assertGateTools = (receipt: ReadonlyMap<string, string>, label: string) => { if (receipt.get("runner_sha256") !== expectedGateRunner || receipt.get("validator_sha256") !== expectedGateValidator) fail(`${label}: gate tool identity 不同`); };
  const buildReceipt = verifyCgroupRun(files, manifest.candidate_build, "workload", "candidate_build"); assertGateTools(buildReceipt, "candidate_build"); const bundle = splitCandidateBundle(files.read(manifest.candidate_build.artifacts.stdout, "candidate_build.stdout")); if (!bundle.candidate.equals(candidate) || !bundle.manifest.equals(toolManifestRaw)) fail("candidate build: stdout bundle/candidate/tool manifest 不匹配");
  const expectedBuildArgv = [CID_CURRENT_DRIVER_CONTAINER_PATH, "system-link-exec", "--require-pure-system-link-exec", "--root:/cheng-current-source/repo", `--in:${manifest.candidate_entry_path}`, "--emit:exe", "--link-providers", "--target:x86_64-unknown-linux-gnu", "--out:/cheng-hardcap-work/current-driver.next", "--report-out:/cheng-hardcap-work/current-driver.report"];
  if (toolManifest.get("candidate_sha256") !== candidateSha || toolManifest.get("candidate_size") !== String(candidate.length) || toolManifest.get("report_sha256") !== sha256(bundle.report) || toolManifest.get("report_size") !== String(bundle.report.length) || toolManifest.get("source_tool_manifest_sha256") !== sha256(sourceManifestRaw) || toolManifest.get("source_closure_sha256") !== sourceManifest.sourceClosure || toolManifest.get("source_entry_count") !== String(sourceManifest.sourceCount) || toolManifest.get("tool_closure_sha256") !== sourceManifest.toolClosure || toolManifest.get("tool_entry_count") !== String(sourceManifest.toolCount) || toolManifest.get("candidate_entry_path") !== manifest.candidate_entry_path || toolManifest.get("candidate_entry_module_path") !== manifest.candidate_entry_module_path || toolManifest.get("candidate_entry_sha256") !== manifest.candidate_entry_sha256 || toolManifest.get("toolchain_image_id") !== buildReceipt.get("image_id") || buildReceipt.get("target_argv_count") !== String(expectedBuildArgv.length) || buildReceipt.get("target_argv_sha256") !== sha256FramedStrings(expectedBuildArgv)) fail("candidate build: frozen source/tool/entry/build binding");
  verifyCaseImage(files, manifest, candidate, sourceManifestRaw, toolManifestRaw, buildReceipt, imageManifestRaw, imageManifest);
  const mutationReplayRaw = files.read(manifest.mutation_replay, "mutation replay"); assertMutationReplayRecipe(mutationReplayRaw, candidateSha, fusionToolHashes); const counterReceipt = verifyCgroupRun(files, manifest.cgroup_counterexample, "aggregate_oom_probe", "cgroup_counterexample"); assertGateTools(counterReceipt, "cgroup_counterexample");
  for (const receipt of [buildReceipt, counterReceipt]) if (receipt.get("native_descriptor_candidate_entry_path") !== manifest.candidate_entry_path || receipt.get("native_descriptor_candidate_entry_module_path") !== manifest.candidate_entry_module_path || receipt.get("native_descriptor_candidate_entry_sha256") !== manifest.candidate_entry_sha256) fail("cgroup pair: selected entry descriptor drift");
  for (const key of HARD_GATE_RECEIPT_KEYS.filter((name) => name.startsWith("native_descriptor_"))) if (buildReceipt.get(key) !== counterReceipt.get(key)) fail(`cgroup pair: native descriptor drift ${key}`);
  const builderImageManifestRaw = files.read(manifest.candidate_build.artifacts.cgroup_image_inspect, "candidate_build.image"); const executionImageEvidence = verifyCidExecutionImageEvidence({builderImageId: buildReceipt.get("image_id") ?? "", counterexampleImageId: counterReceipt.get("image_id") ?? "", caseImageId: String(imageManifest.Id ?? ""), builderImageManifestRaw, counterexampleImageManifestRaw: files.read(manifest.cgroup_counterexample.artifacts.cgroup_image_inspect, "counterexample.image")});
  for (const item of manifest.cases) {
    const receipt = verifyCgroupRun(files, {artifacts: Object.fromEntries(CGROUP_ARTIFACT_ROLES.map((role) => [role, item.artifacts[role]]))}, "workload", item.case_id); assertGateTools(receipt, item.case_id); if (!files.read(item.artifacts.cgroup_image_inspect, `${item.case_id}.image`).equals(imageManifestRaw) || receipt.get("image_id") !== executionImageEvidence.caseImageId) fail(`${item.case_id}: immutable image 不一致`); verifyCasePayloadArchive(files, item); parseCaseBinding(files.read(item.artifacts.case_binding, `${item.case_id}.case_binding`), item, candidateSha, manifest.candidate_entry_path, manifest.candidate_entry_module_path, manifest.candidate_entry_sha256, sha256(sourceManifestRaw), sha256(toolManifestRaw), sha256(imageManifestRaw), receipt, sha256(files.read(item.artifacts.cgroup_receipt, `${item.case_id}.cgroup_receipt`)));
    let source: ReturnType<typeof verifySourceChain> | undefined; if (!["migration_cross_root_fixed_point"].includes(item.kind)) source = verifySourceChain(files, item);
    if (item.kind === "zero_byte_import") verifyZeroAndMissingProbe(files, item);
    if (item.kind === "csg_atomic_consume") verifyAtomicConsume(files, item);
    if (item.kind === "migration_cross_root_fixed_point") verifyCrossRootMigration(files, item);
    if (item.kind === "mirror_atomic_install") { const mirrorBundle = parseMirrorBundle(files.read(item.artifacts.mirror_bundle, "mirror bundle")); const install = verifyMirrorInstall(files, files.read(item.artifacts.mirror_install, "mirror install manifest"), mirrorBundle); const migration = verifyMigration(files, item, mirrorBundle); const rootBMigration = verifyMigration(files, item, parseMirrorBundle(files.read(item.artifacts.root_b_mirror_bundle, "root B mirror bundle")), true); for (const key of Object.keys(migration.raw)) if (!migration.raw[key].equals(rootBMigration.raw[key])) fail(`mirror migration fixed point: ${key}`); verifyMirrorAtomicTrace(files, item, mirrorBundle, install); verifyWorld(files, item, source!, migration, mirrorBundle); }
  }
  verifyMutationReplay(files, manifest.cases);
  return {manifestSha256: manifest.manifest_sha256, candidateSha256: candidateSha, candidateEntryPath: manifest.candidate_entry_path, candidateEntryModulePath: manifest.candidate_entry_module_path, candidateEntrySha256: manifest.candidate_entry_sha256, caseIds: manifest.cases.map((item) => item.case_id), status: "CID_GREEN_CANDIDATE"};
}
