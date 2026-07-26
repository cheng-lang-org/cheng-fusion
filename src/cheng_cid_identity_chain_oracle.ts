import {createHash} from "node:crypto";

export const CID_EVIDENCE_SCHEMA = "cheng.cid.identity_chain.evidence";
export const CID_MIRROR_INSTALL_SCHEMA = "cheng.cid.managed_mirror.install";

const HEX32 = /^[0-9a-f]{64}$/;
const UINT = /^(0|[1-9][0-9]*)$/;
const VERSION_FRAGMENT = /(?:^|[._-])v[0-9]+(?:$|[._-])/i;
const decoder = new TextDecoder("utf-8", {fatal: true});

export class CidOracleError extends Error {}

export interface ImportEdge {
  readonly ownerModulePath: string;
  readonly targetModulePath: string;
  readonly importAlias: string;
  readonly qualifier: string;
  readonly allowsUnqualifiedCall: boolean;
  readonly resolved: true;
}

export interface SourceModuleBytes {
  readonly modulePath: string;
  readonly bytes: Buffer;
}

export interface PortableSourceIdentityReceipt {
  readonly sourceSnapshotCount: number;
  readonly importEdgeCount: number;
  readonly unresolvedImportCount: number;
  readonly sourcePackageIdCid: string;
  readonly entryModulePathCid: string;
  readonly sourceBundleCid: string;
  readonly entrySourceCid: string;
  readonly importGraphCid: string;
  readonly receiptCid: string;
}

export interface CompileSemanticReceipt {
  readonly sourceIdentityReceiptCid: string;
  readonly canonicalCompilerCsgCid: string;
  readonly canonicalOutputDigest: string;
  readonly targetTripleCid: string;
  readonly bootstrapStageCid: string;
  readonly orderedProviderSetCid: string;
  readonly receiptCid: string;
}

export interface CsgNode {
  readonly nodeId: number;
  readonly nodeKind: number;
  readonly ownerNodeId: number;
  readonly modulePath: string;
  readonly symbolText: string;
  readonly factText: string;
  readonly semanticSource: string;
  readonly semanticDeclarationLineIndex: number;
  readonly semanticParamTypeJoin: string;
  readonly semanticReturnType: string;
  readonly semanticSignatureComplete: number;
  readonly resultLayoutKind: number;
  readonly effectKind: number;
  readonly capabilityKind: number;
  readonly callConv: number;
  readonly entryFlag: number;
  readonly exportedFlag: number;
  readonly exportSymbolName: string;
  readonly exportNameExplicit: number;
  readonly factCid: string;
}

export interface CsgEdge {
  readonly edgeId: number;
  readonly edgeKind: number;
  readonly fromNodeId: number;
  readonly toNodeId: number;
  readonly edgeCid: string;
}

export interface CanonicalCsgSidecar {
  readonly packageId: string;
  readonly nodes: readonly CsgNode[];
  readonly edges: readonly CsgEdge[];
  readonly canonicalGraphCid: string;
  readonly sidecarCid: string;
}

export interface ExportSurface {
  readonly packageId: string;
  readonly rows: readonly {
    readonly symbol: string;
    readonly target: string;
    readonly layout: number;
    readonly effect: number;
    readonly capability: number;
  }[];
  readonly surfaceCid: string;
}

export interface MigrationEvidence {
  readonly packageId: string;
  readonly entryModulePath: string;
  readonly unitCount: number;
  readonly units: readonly {
    readonly modulePath: string;
    readonly legacyRawByteLength: number;
    readonly legacyRawCid: string;
    readonly migratedRawByteLength: number;
    readonly migratedRawCid: string;
  }[];
  readonly ruleIds: readonly string[];
  readonly legacySourceBundleCid: string;
  readonly migratedSourceBundleCid: string;
  readonly legacySourceReceipt: PortableSourceIdentityReceipt;
  readonly migratedSourceReceipt: PortableSourceIdentityReceipt;
  readonly evidenceCid: string;
}

export interface MigrationProof {
  readonly proofKind: string;
  readonly packageId: string;
  readonly channel: string;
  readonly migrationEvidenceCid: string;
  readonly legacySourceIdentityReceiptCid: string;
  readonly migratedSourceIdentityReceiptCid: string;
  readonly baselineGraphCid: string;
  readonly migratedGraphCid: string;
  readonly baselineSurfaceCid: string;
  readonly migratedSurfaceCid: string;
  readonly baselineSemanticReceiptCid: string;
  readonly migratedSemanticReceiptCid: string;
  readonly baselineSemanticSourceIdentityReceiptCid: string;
  readonly migratedSemanticSourceIdentityReceiptCid: string;
  readonly baselineSemanticCompilerCsgCid: string;
  readonly migratedSemanticCompilerCsgCid: string;
  readonly baselineSemanticOutputDigest: string;
  readonly migratedSemanticOutputDigest: string;
  readonly baselineSemanticTargetTripleCid: string;
  readonly migratedSemanticTargetTripleCid: string;
  readonly baselineSemanticBootstrapStageCid: string;
  readonly migratedSemanticBootstrapStageCid: string;
  readonly baselineSemanticProviderSetCid: string;
  readonly migratedSemanticProviderSetCid: string;
  readonly target: string;
  readonly graphEquivalent: number;
  readonly exportSurfaceCompatible: number;
  readonly semanticEquivalent: number;
  readonly equivalenceKind: string;
  readonly proofCid: string;
}

export function sha256(raw: Uint8Array | string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function u32(value: number, label: string): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new CidOracleError(`${label}: u32 越界`);
  }
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value, 0);
  return out;
}

function textBytes(value: string, label: string): Buffer {
  const raw = Buffer.from(value, "utf8");
  if (raw.length > 0xffff_ffff) throw new CidOracleError(`${label}: 文本过长`);
  return raw;
}

function framedText(value: string, label = "text"): Buffer {
  const raw = textBytes(value, label);
  return Buffer.concat([u32(raw.length, `${label}.length`), raw]);
}

function rawFixed32(value: string, label: string, allowZero = false): Buffer {
  if (!HEX32.test(value) || (!allowZero && value === "0".repeat(64))) {
    throw new CidOracleError(`${label}: 非法 SHA-256`);
  }
  return Buffer.from(value, "hex");
}

function framedFixed32(value: string, label: string, allowZero = false): Buffer {
  return Buffer.concat([u32(32, `${label}.length`), rawFixed32(value, label, allowZero)]);
}

function framedU32(value: number, label: string): Buffer {
  return Buffer.concat([u32(4, `${label}.length`), u32(value, label)]);
}

function hashParts(parts: readonly Buffer[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}

function canonicalText(value: string, label: string, allowEmpty = false): string {
  if ((!allowEmpty && value.length === 0) || value.trim() !== value || /[\x00-\x1f\x7f]/.test(value)) {
    throw new CidOracleError(`${label}: 文本不 canonical`);
  }
  return value;
}

export function assertUnversionedCidBytes(raw: Buffer, label: string): void {
  const text = decoder.decode(raw);
  for (const token of text.split(/[^A-Za-z0-9._-]+/)) {
    if (token.length > 0 && VERSION_FRAGMENT.test(token)) {
      throw new CidOracleError(`${label}: 拒绝版本碎片 ${token}`);
    }
  }
}

export function canonicalModulePath(value: string, label = "module_path"): string {
  if (value.length === 0 || value[0] === "/" || value[value.length - 1] === "/" || (value.length >= 3 && value[1] === ":" && value[2] === "/")) throw new CidOracleError(`${label}: 非 canonical module path`);
  let segmentStart = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index); const ch = value[index];
    if (code < 32 || code === 127 || ch === "\\" || ch === " ") throw new CidOracleError(`${label}: 非 canonical module path 字节`);
    if (ch !== "/") continue;
    if (index <= segmentStart) throw new CidOracleError(`${label}: 空 module path segment`);
    const segment = value.slice(segmentStart, index); if (segment === "." || segment === "..") throw new CidOracleError(`${label}: 非 canonical module path segment`);
    segmentStart = index + 1;
  }
  const tail = value.slice(segmentStart); if (tail === "." || tail === "..") throw new CidOracleError(`${label}: 非 canonical module path segment`);
  return value;
}

export function canonicalPackageId(value: string): string {
  return canonicalModulePath(value, "package_id");
}

function exactInteger(value: string, label: string): number {
  if (!UINT.test(value)) throw new CidOracleError(`${label}: 非 canonical uint`);
  const out = Number(value);
  if (!Number.isSafeInteger(out) || out > 0x7fff_ffff) throw new CidOracleError(`${label}: 超出 int32`);
  return out;
}

function decodeHexText(value: string, label: string): string {
  if (!/^(?:[0-9a-f]{2})*$/.test(value)) throw new CidOracleError(`${label}: 非 canonical lowercase hex`);
  return decoder.decode(Buffer.from(value, "hex"));
}

function parseExactLines(raw: Buffer, label: string): string[] {
  const text = decoder.decode(raw);
  if (text.includes("\r") || text.includes("\0")) throw new CidOracleError(`${label}: 非 canonical 换行`);
  // Cheng 的 CID report builders 都返回无 terminal newline 的精确 wire；
  // 接受可选末尾换行会让同一逻辑 receipt 拥有两种原始字节表示。
  if (text.length === 0 || text.endsWith("\n")) throw new CidOracleError(`${label}: 必须是无 terminal newline 的 canonical wire`);
  return text.split("\n");
}

function exactField(line: string, key: string, label: string): string {
  const prefix = `${key}=`;
  if (!line.startsWith(prefix) || line.length <= prefix.length) {
    throw new CidOracleError(`${label}: 期望字段 ${key}`);
  }
  return line.slice(prefix.length);
}

function rejectDuplicateKeys(lines: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const line of lines) {
    const at = line.indexOf("=");
    if (at <= 0) throw new CidOracleError(`${label}: 非法 KV 行`);
    const key = line.slice(0, at);
    if (seen.has(key)) throw new CidOracleError(`${label}: 重复字段 ${key}`);
    seen.add(key);
  }
}

function sourceRawCid(bytes: Buffer): string {
  return hashParts([
    framedText("cheng.compiler.source_raw_bytes", "source_raw.domain"),
    u32(bytes.length, "source_raw.length"),
    bytes,
  ]);
}

export function sourcePackageIdCid(packageId: string): string {
  canonicalPackageId(packageId);
  return hashParts([
    framedText("cheng.compiler.source_package_id"),
    framedText(packageId),
  ]);
}

export function entryModulePathCid(modulePath: string): string {
  canonicalModulePath(modulePath);
  return hashParts([
    framedText("cheng.compiler.entry_module_path"),
    framedText(modulePath),
  ]);
}

export function sourceBundleCid(packageId: string, modules: readonly SourceModuleBytes[]): string {
  canonicalPackageId(packageId);
  if (modules.length === 0) throw new CidOracleError("source bundle: 空闭包");
  const ordered = [...modules].sort((a, b) => Buffer.compare(Buffer.from(a.modulePath), Buffer.from(b.modulePath)));
  for (let i = 0; i < ordered.length; i += 1) {
    canonicalModulePath(ordered[i].modulePath, `source[${i}].module_path`);
    if (ordered[i].modulePath.endsWith(".cheng")) throw new CidOracleError("source bundle: module path 带扩展名");
    if (i > 0 && ordered[i - 1].modulePath === ordered[i].modulePath) throw new CidOracleError("source bundle: 重复 module path");
  }
  const parts: Buffer[] = [
    framedText("cheng.compiler.source_bundle.portable"),
    framedText(packageId),
    framedU32(ordered.length, "source_count"),
  ];
  for (const module of ordered) {
    parts.push(framedText(module.modulePath), framedU32(module.bytes.length, "source_length"));
    parts.push(framedFixed32(sourceRawCid(module.bytes), "source_raw_cid"));
  }
  return hashParts(parts);
}

function stripComment(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"' && (i === 0 || line[i - 1] !== "\\")) quoted = !quoted;
    if (!quoted && line[i] === "#") return line.slice(0, i);
  }
  return line;
}

function importSpecs(bytes: Buffer, label: string): {target: string; alias: string}[] {
  const text = decoder.decode(bytes);
  const out: {target: string; alias: string}[] = [];
  for (const rawLine of text.split("\n")) {
    const line = stripComment(rawLine).trim();
    if (!line.startsWith("import")) continue;
    if (!line.startsWith("import ")) throw new CidOracleError(`${label}: 非法 import 表面`);
    const body = line.slice(7).trim();
    const grouped = /^([^\s\[\],]+)\/\[([^\]]+)\]$/.exec(body);
    if (grouped) {
      for (const leafRaw of grouped[2].split(",")) {
        const leaf = leafRaw.trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(leaf)) throw new CidOracleError(`${label}: 非法分组 import`);
        out.push({target: `${grouped[1]}/${leaf}`, alias: ""});
      }
      continue;
    }
    const plain = /^([^\s,\[\]]+)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/.exec(body);
    if (!plain) throw new CidOracleError(`${label}: oracle 不接受未识别 import 表面`);
    out.push({target: plain[1], alias: plain[2] ?? ""});
  }
  return out;
}

export function sourceImportEdges(modules: readonly SourceModuleBytes[]): ImportEdge[] {
  const moduleSet = new Set(modules.map((module) => canonicalModulePath(module.modulePath)));
  if (moduleSet.size !== modules.length) throw new CidOracleError("import graph: 重复 module path");
  const out: ImportEdge[] = [];
  for (const module of modules) {
    for (const spec of importSpecs(module.bytes, module.modulePath)) {
      let target = canonicalModulePath(spec.target, `${module.modulePath}.import`);
      if (!moduleSet.has(target) && target.startsWith("cheng/") && moduleSet.has(target.slice(6))) target = target.slice(6);
      if (!moduleSet.has(target)) throw new CidOracleError(`import graph: 缺 target ${module.modulePath} -> ${target}`);
      const alias = spec.alias;
      const qualifier = alias.length > 0 ? alias : target.slice(target.lastIndexOf("/") + 1);
      out.push({
        ownerModulePath: module.modulePath,
        targetModulePath: target,
        importAlias: alias,
        qualifier,
        allowsUnqualifiedCall: alias.length === 0,
        resolved: true,
      });
    }
  }
  return out;
}

function edgeCompare(left: ImportEdge, right: ImportEdge): number {
  for (const key of ["ownerModulePath", "targetModulePath", "importAlias", "qualifier"] as const) {
    const cmp = Buffer.compare(Buffer.from(left[key]), Buffer.from(right[key]));
    if (cmp !== 0) return cmp;
  }
  if (left.allowsUnqualifiedCall !== right.allowsUnqualifiedCall) return left.allowsUnqualifiedCall ? 1 : -1;
  return 0;
}

export function importGraphCid(packageId: string, edges: readonly ImportEdge[]): string {
  canonicalPackageId(packageId);
  const ordered = [...edges].sort(edgeCompare);
  for (let i = 0; i < ordered.length; i += 1) {
    const edge = ordered[i];
    canonicalModulePath(edge.ownerModulePath);
    canonicalModulePath(edge.targetModulePath);
    canonicalText(edge.qualifier, "import.qualifier");
    if (!edge.resolved) throw new CidOracleError("import graph: unresolved edge");
    if (i > 0 && edgeCompare(ordered[i - 1], edge) === 0) throw new CidOracleError("import graph: 重复 edge");
  }
  const parts: Buffer[] = [
    framedText("cheng.compiler.portable_import_graph"), framedText(packageId),
    framedU32(ordered.length, "import_count"),
  ];
  for (const edge of ordered) {
    parts.push(framedText(edge.ownerModulePath), framedText(edge.targetModulePath));
    parts.push(framedText(edge.importAlias), framedText(edge.qualifier));
    parts.push(framedU32(edge.allowsUnqualifiedCall ? 1 : 0, "allows_unqualified"));
    parts.push(framedU32(1, "resolved"));
  }
  parts.push(framedU32(0, "unresolved_count"));
  return hashParts(parts);
}

export function buildPortableSourceIdentity(
  packageId: string,
  entryModulePath: string,
  modules: readonly SourceModuleBytes[],
): PortableSourceIdentityReceipt {
  canonicalPackageId(packageId);
  canonicalModulePath(entryModulePath);
  const entry = modules.filter((module) => module.modulePath === entryModulePath);
  if (entry.length !== 1) throw new CidOracleError("source receipt: entry 必须唯一存在");
  const edges = sourceImportEdges(modules);
  const outgoing = new Map<string, string[]>();
  for (const module of modules) outgoing.set(module.modulePath, []);
  for (const edge of edges) outgoing.get(edge.ownerModulePath)!.push(edge.targetModulePath);
  const reachable = new Set<string>();
  const pending = [entryModulePath];
  while (pending.length > 0) {
    const modulePath = pending.pop()!;
    if (reachable.has(modulePath)) continue;
    reachable.add(modulePath);
    for (const target of outgoing.get(modulePath) ?? []) pending.push(target);
  }
  if (reachable.size !== modules.length) {
    const unreachable = modules
      .map((module) => module.modulePath)
      .filter((modulePath) => !reachable.has(modulePath))
      .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
    throw new CidOracleError(`source receipt: entry 可达闭包不完整 ${unreachable.join(",")}`);
  }
  const base = {
    sourceSnapshotCount: modules.length,
    importEdgeCount: edges.length,
    unresolvedImportCount: 0,
    sourcePackageIdCid: sourcePackageIdCid(packageId),
    entryModulePathCid: entryModulePathCid(entryModulePath),
    sourceBundleCid: sourceBundleCid(packageId, modules),
    entrySourceCid: sourceRawCid(entry[0].bytes),
    importGraphCid: importGraphCid(packageId, edges),
  };
  const receiptCid = hashParts([
    framedText("cheng.compiler.portable_source_identity_receipt"),
    framedU32(base.sourceSnapshotCount, "source_count"),
    framedU32(base.importEdgeCount, "import_count"),
    framedU32(0, "unresolved_count"),
    framedFixed32(base.sourcePackageIdCid, "package_cid"),
    framedFixed32(base.entryModulePathCid, "entry_module_cid"),
    framedFixed32(base.sourceBundleCid, "source_bundle_cid"),
    framedFixed32(base.entrySourceCid, "entry_source_cid"),
    framedFixed32(base.importGraphCid, "import_graph_cid"),
  ]);
  return {...base, receiptCid};
}

export function parsePortableSourceReceipt(raw: Buffer): PortableSourceIdentityReceipt {
  const lines = parseExactLines(raw, "portable source receipt");
  const keys = [
    "source_snapshot_count", "import_edge_count", "unresolved_import_count",
    "source_package_id_cid", "entry_module_path_cid", "source_bundle_cid",
    "entry_source_cid", "import_graph_cid", "receipt_cid",
  ];
  if (lines.length !== keys.length) throw new CidOracleError("portable source receipt: 字段数错误");
  const values = keys.map((key, index) => exactField(lines[index], key, "portable source receipt"));
  const out: PortableSourceIdentityReceipt = {
    sourceSnapshotCount: exactInteger(values[0], keys[0]),
    importEdgeCount: exactInteger(values[1], keys[1]),
    unresolvedImportCount: exactInteger(values[2], keys[2]),
    sourcePackageIdCid: values[3], entryModulePathCid: values[4], sourceBundleCid: values[5],
    entrySourceCid: values[6], importGraphCid: values[7], receiptCid: values[8],
  };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === "string") rawFixed32(value, key);
  }
  const expected = hashParts([
    framedText("cheng.compiler.portable_source_identity_receipt"),
    framedU32(out.sourceSnapshotCount, "source_count"), framedU32(out.importEdgeCount, "import_count"),
    framedU32(out.unresolvedImportCount, "unresolved_count"), framedFixed32(out.sourcePackageIdCid, "package"),
    framedFixed32(out.entryModulePathCid, "entry"), framedFixed32(out.sourceBundleCid, "bundle"),
    framedFixed32(out.entrySourceCid, "source"), framedFixed32(out.importGraphCid, "imports"),
  ]);
  if (out.unresolvedImportCount !== 0 || out.receiptCid !== expected) throw new CidOracleError("portable source receipt: CID 不匹配");
  return out;
}

export function assertPortableSourceReceiptEqual(actual: PortableSourceIdentityReceipt, expected: PortableSourceIdentityReceipt): void {
  for (const key of Object.keys(expected) as (keyof PortableSourceIdentityReceipt)[]) {
    if (actual[key] !== expected[key]) throw new CidOracleError(`portable source receipt: ${key} 不匹配`);
  }
}

function csgFactCid(node: CsgNode): string {
  return hashParts([
    framedText("cheng.compiler.csg.node"), u32(node.nodeKind, "node_kind"), u32(node.ownerNodeId, "owner"),
    framedText(node.modulePath), framedText(node.symbolText), framedText(node.factText), framedText(node.semanticSource),
    u32(node.semanticDeclarationLineIndex, "decl_line"), u32(node.semanticSignatureComplete, "signature_complete"),
    framedText(node.semanticParamTypeJoin), framedText(node.semanticReturnType),
    u32(node.resultLayoutKind, "layout"), u32(node.effectKind, "effect"), u32(node.capabilityKind, "capability"),
    u32(node.callConv, "call_conv"), u32(node.entryFlag, "entry"), u32(node.exportedFlag, "exported"),
    framedText(node.exportSymbolName),
  ]);
}

function csgEdgeCid(edge: CsgEdge): string {
  return hashParts([
    framedText("cheng.compiler.csg.edge"), u32(edge.fromNodeId, "from"),
    u32(edge.toNodeId, "to"), u32(edge.edgeKind, "edge_kind"),
  ]);
}

function normalizedNodeCid(node: CsgNode, ownerCid: string | null): string {
  const parts: Buffer[] = [
    framedText("cheng.compiler.csg.node.normalized"), u32(node.nodeKind, "node_kind"),
    framedText(node.modulePath), framedText(node.symbolText), framedText(node.factText), framedText(node.semanticSource),
    u32(node.semanticSignatureComplete, "signature_complete"),
  ];
  if (node.semanticSignatureComplete !== 0) parts.push(framedText(node.semanticParamTypeJoin), framedText(node.semanticReturnType));
  parts.push(u32(node.resultLayoutKind, "layout"), u32(node.effectKind, "effect"), u32(node.capabilityKind, "capability"));
  parts.push(u32(node.callConv, "call_conv"), u32(node.entryFlag, "entry"), u32(node.exportedFlag, "exported"));
  parts.push(framedText(node.exportSymbolName), u32(ownerCid === null ? 0 : 1, "has_owner"));
  if (ownerCid !== null) parts.push(rawFixed32(ownerCid, "owner_ncid"));
  return hashParts(parts);
}

function normalizedGraphCid(packageId: string, nodes: readonly CsgNode[], edges: readonly CsgEdge[]): string {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const memo = new Map<number, string>();
  const active = new Set<number>();
  function visit(id: number): string {
    const ready = memo.get(id);
    if (ready !== undefined) return ready;
    const node = byId.get(id);
    if (!node) throw new CidOracleError("CSG: dangling owner/edge node");
    if (active.has(id)) throw new CidOracleError("CSG: owner 必须是无环树");
    active.add(id);
    const ownerCid = node.ownerNodeId === 0 ? null : visit(node.ownerNodeId);
    const cid = normalizedNodeCid(node, ownerCid);
    active.delete(id);
    memo.set(id, cid);
    return cid;
  }
  const nodeCids = nodes.map((node) => Buffer.from(visit(node.nodeId), "hex")).sort(Buffer.compare);
  const edgeCids = edges.map((edge) => hashParts([
    framedText("cheng.compiler.csg.edge.normalized"), u32(edge.edgeKind, "edge_kind"),
    rawFixed32(visit(edge.fromNodeId), "from_ncid"), rawFixed32(visit(edge.toNodeId), "to_ncid"),
  ])).map((cid) => Buffer.from(cid, "hex")).sort(Buffer.compare);
  return hashParts([
    framedText("cheng.compiler.csg.canonical_graph.normalized"), framedText(packageId),
    u32(nodeCids.length, "node_count"), ...nodeCids, u32(edgeCids.length, "edge_count"), ...edgeCids,
  ]);
}

function sidecarCid(packageId: string, nodes: readonly CsgNode[], edges: readonly CsgEdge[]): string {
  const parts: Buffer[] = [framedText("cheng.compiler.csg.canonical_sidecar"), framedText(packageId), framedU32(nodes.length, "node_count")];
  for (const node of nodes) {
    parts.push(framedU32(node.nodeId, "node_id"), framedU32(node.nodeKind, "node_kind"), framedU32(node.ownerNodeId, "owner"));
    parts.push(framedText(node.modulePath), framedText(node.symbolText), framedText(node.factText), framedText(node.semanticSource));
    parts.push(framedU32(node.semanticDeclarationLineIndex, "decl_line"), framedText(node.semanticParamTypeJoin), framedText(node.semanticReturnType));
    parts.push(framedU32(node.semanticSignatureComplete, "signature_complete"), framedU32(node.resultLayoutKind, "layout"));
    parts.push(framedU32(node.effectKind, "effect"), framedU32(node.capabilityKind, "capability"), framedU32(node.callConv, "call_conv"));
    parts.push(framedU32(node.entryFlag, "entry"), framedU32(node.exportedFlag, "exported"), framedText(node.exportSymbolName));
    parts.push(framedU32(node.exportNameExplicit, "export_explicit"), framedFixed32(node.factCid, "fact_cid"));
  }
  parts.push(framedU32(edges.length, "edge_count"));
  for (const edge of edges) {
    parts.push(framedU32(edge.edgeId, "edge_id"), framedU32(edge.edgeKind, "edge_kind"));
    parts.push(framedU32(edge.fromNodeId, "from"), framedU32(edge.toNodeId, "to"), framedFixed32(edge.edgeCid, "edge_cid"));
  }
  return hashParts(parts);
}

function csgEdgeOrder(left: CsgEdge, right: CsgEdge): number {
  return left.edgeKind - right.edgeKind || left.fromNodeId - right.fromNodeId || left.toNodeId - right.toNodeId;
}

function hexText(value: string): string {
  return Buffer.from(value, "utf8").toString("hex");
}

export function encodeCanonicalCsgSidecar(sidecar: CanonicalCsgSidecar): Buffer {
  const lines = [
    `package_id_hex=${hexText(sidecar.packageId)}`,
    `node_count=${sidecar.nodes.length}`,
    `edge_count=${sidecar.edges.length}`,
    `canonical_graph_cid=${sidecar.canonicalGraphCid}`,
    `sidecar_cid=${sidecar.sidecarCid}`,
  ];
  for (let index = 0; index < sidecar.nodes.length; index += 1) {
    const node = sidecar.nodes[index];
    lines.push(`node[${index}]=${[
      node.nodeId, node.nodeKind, node.ownerNodeId, hexText(node.modulePath),
      hexText(node.symbolText), hexText(node.factText), hexText(node.semanticSource),
      node.semanticDeclarationLineIndex, hexText(node.semanticParamTypeJoin),
      hexText(node.semanticReturnType), node.semanticSignatureComplete,
      node.resultLayoutKind, node.effectKind, node.capabilityKind, node.callConv,
      node.entryFlag, node.exportedFlag, hexText(node.exportSymbolName),
      node.exportNameExplicit, node.factCid,
    ].join("|")}`);
  }
  for (let index = 0; index < sidecar.edges.length; index += 1) {
    const edge = sidecar.edges[index];
    lines.push(`edge[${index}]=${[edge.edgeId, edge.edgeKind, edge.fromNodeId, edge.toNodeId, edge.edgeCid].join("|")}`);
  }
  return Buffer.from(lines.join("\n"));
}

export function buildCanonicalCsgSidecar(
  packageId: string,
  nodes: readonly CsgNode[],
  edges: readonly CsgEdge[],
): CanonicalCsgSidecar {
  canonicalPackageId(packageId);
  const rebuiltNodes = nodes.map((node) => {
    const base = {...node, factCid: "0".repeat(64)};
    return {...base, factCid: csgFactCid(base)};
  });
  const rebuiltEdges = edges.map((edge) => {
    const base = {...edge, edgeCid: "0".repeat(64)};
    return {...base, edgeCid: csgEdgeCid(base)};
  });
  const rebuilt: CanonicalCsgSidecar = {
    packageId,
    nodes: rebuiltNodes,
    edges: rebuiltEdges,
    canonicalGraphCid: normalizedGraphCid(packageId, rebuiltNodes, rebuiltEdges),
    sidecarCid: sidecarCid(packageId, rebuiltNodes, rebuiltEdges),
  };
  return parseCanonicalCsgSidecar(encodeCanonicalCsgSidecar(rebuilt));
}

export function parseCanonicalCsgSidecar(raw: Buffer): CanonicalCsgSidecar {
  const lines = parseExactLines(raw, "canonical CSG sidecar");
  if (lines.length < 6) throw new CidOracleError("CSG sidecar: 字段不足");
  const packageId = decodeHexText(exactField(lines[0], "package_id_hex", "CSG sidecar"), "package_id_hex");
  canonicalPackageId(packageId);
  const nodeCount = exactInteger(exactField(lines[1], "node_count", "CSG sidecar"), "node_count");
  const edgeCount = exactInteger(exactField(lines[2], "edge_count", "CSG sidecar"), "edge_count");
  const canonicalGraphCid = exactField(lines[3], "canonical_graph_cid", "CSG sidecar");
  const claimedSidecarCid = exactField(lines[4], "sidecar_cid", "CSG sidecar");
  rawFixed32(canonicalGraphCid, "canonical_graph_cid");
  rawFixed32(claimedSidecarCid, "sidecar_cid");
  if (lines.length !== 5 + nodeCount + edgeCount) throw new CidOracleError("CSG sidecar: row 数量不匹配");
  const nodes: CsgNode[] = [];
  for (let i = 0; i < nodeCount; i += 1) {
    const parts = exactField(lines[5 + i], `node[${i}]`, "CSG sidecar").split("|");
    if (parts.length !== 20) throw new CidOracleError(`CSG sidecar: node[${i}] shape`);
    const node: CsgNode = {
      nodeId: exactInteger(parts[0], "node_id"), nodeKind: exactInteger(parts[1], "node_kind"),
      ownerNodeId: exactInteger(parts[2], "owner"), modulePath: decodeHexText(parts[3], "module_path"),
      symbolText: decodeHexText(parts[4], "symbol"), factText: decodeHexText(parts[5], "fact"),
      semanticSource: decodeHexText(parts[6], "semantic_source"), semanticDeclarationLineIndex: exactInteger(parts[7], "decl_line"),
      semanticParamTypeJoin: decodeHexText(parts[8], "semantic_params"), semanticReturnType: decodeHexText(parts[9], "semantic_return"),
      semanticSignatureComplete: exactInteger(parts[10], "signature_complete"), resultLayoutKind: exactInteger(parts[11], "layout"),
      effectKind: exactInteger(parts[12], "effect"), capabilityKind: exactInteger(parts[13], "capability"),
      callConv: exactInteger(parts[14], "call_conv"), entryFlag: exactInteger(parts[15], "entry"),
      exportedFlag: exactInteger(parts[16], "exported"), exportSymbolName: decodeHexText(parts[17], "export_name"),
      exportNameExplicit: exactInteger(parts[18], "export_explicit"), factCid: parts[19],
    };
    if (node.nodeId !== i + 1 || ![1, 2, 3, 4, 5, 6].includes(node.nodeKind) || node.ownerNodeId > nodeCount) {
      throw new CidOracleError(`CSG sidecar: node[${i}] identity/order`);
    }
    for (const flag of [node.semanticSignatureComplete, node.entryFlag, node.exportedFlag, node.exportNameExplicit]) {
      if (flag !== 0 && flag !== 1) throw new CidOracleError(`CSG sidecar: node[${i}] flag`);
    }
    if (node.factCid !== csgFactCid(node)) throw new CidOracleError(`CSG sidecar: node[${i}] fact CID`);
    nodes.push(node);
  }
  if (nodes.filter((node) => node.nodeKind === 1 && node.ownerNodeId === 0).length !== 1) throw new CidOracleError("CSG sidecar: package root 数量错误");
  if (nodes.some((node) => node.nodeKind !== 1 && node.ownerNodeId === 0)) throw new CidOracleError("CSG sidecar: 非根节点缺 owner");
  const edges: CsgEdge[] = [];
  for (let i = 0; i < edgeCount; i += 1) {
    const parts = exactField(lines[5 + nodeCount + i], `edge[${i}]`, "CSG sidecar").split("|");
    if (parts.length !== 5) throw new CidOracleError(`CSG sidecar: edge[${i}] shape`);
    const edge: CsgEdge = {
      edgeId: exactInteger(parts[0], "edge_id"), edgeKind: exactInteger(parts[1], "edge_kind"),
      fromNodeId: exactInteger(parts[2], "from"), toNodeId: exactInteger(parts[3], "to"), edgeCid: parts[4],
    };
    if (edge.edgeId !== i + 1 || ![1, 2, 3, 4, 5].includes(edge.edgeKind) || edge.fromNodeId < 1 || edge.toNodeId < 1 || edge.fromNodeId > nodeCount || edge.toNodeId > nodeCount) {
      throw new CidOracleError(`CSG sidecar: edge[${i}] identity/order`);
    }
    if (i > 0 && csgEdgeOrder(edges[i - 1], edge) >= 0) throw new CidOracleError(`CSG sidecar: edge[${i}] 非严格排序`);
    if (edge.edgeCid !== csgEdgeCid(edge)) throw new CidOracleError(`CSG sidecar: edge[${i}] CID`);
    edges.push(edge);
  }
  const recomputedGraph = normalizedGraphCid(packageId, nodes, edges);
  const recomputedSidecar = sidecarCid(packageId, nodes, edges);
  if (canonicalGraphCid !== recomputedGraph) throw new CidOracleError("CSG sidecar: canonical graph CID 不匹配");
  if (claimedSidecarCid !== recomputedSidecar) throw new CidOracleError("CSG sidecar: sidecar CID 不匹配");
  return {packageId, nodes, edges, canonicalGraphCid, sidecarCid: claimedSidecarCid};
}

export function orderedProviderSetCid(providers: readonly string[]): string {
  const ordered = [...providers].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  if (ordered.length !== providers.length || ordered.some((value, index) => value !== providers[index])) throw new CidOracleError("provider set: 非 canonical 排序");
  for (let i = 0; i < ordered.length; i += 1) {
    canonicalText(ordered[i], `provider[${i}]`);
    if (i > 0 && ordered[i - 1] === ordered[i]) throw new CidOracleError("provider set: 重复");
  }
  return hashParts([framedText("cheng.system_link_exec.ordered_provider_set"), framedU32(ordered.length, "provider_count"), ...ordered.map((value) => framedText(value))]);
}

function semanticTextCid(domain: string, value: string): string {
  canonicalText(domain, "semantic.domain");
  canonicalText(value, "semantic.value");
  return hashParts([framedText(domain), framedText(value)]);
}

export function buildCompileSemanticReceipt(
  sourceIdentityReceiptCid: string,
  canonicalCompilerCsgCid: string,
  canonicalOutputDigest: string,
  target: string,
  bootstrapStage: string,
  providers: readonly string[],
): CompileSemanticReceipt {
  const base = {
    sourceIdentityReceiptCid,
    canonicalCompilerCsgCid,
    canonicalOutputDigest,
    targetTripleCid: semanticTextCid("cheng.compiler.target_triple", target),
    bootstrapStageCid: semanticTextCid("cheng.compiler.bootstrap_stage", bootstrapStage),
    orderedProviderSetCid: orderedProviderSetCid(providers),
  };
  for (const [key, value] of Object.entries(base)) rawFixed32(value, key);
  return {...base, receiptCid: hashParts([
    framedText("cheng.system_link_exec.compile_semantic_receipt"),
    framedFixed32(base.sourceIdentityReceiptCid, "source"), framedFixed32(base.canonicalCompilerCsgCid, "csg"),
    framedFixed32(base.canonicalOutputDigest, "output"), framedFixed32(base.targetTripleCid, "target"),
    framedFixed32(base.bootstrapStageCid, "stage"), framedFixed32(base.orderedProviderSetCid, "providers"),
  ])};
}

export function parseCompileSemanticReceipt(raw: Buffer): CompileSemanticReceipt {
  const lines = parseExactLines(raw, "semantic receipt");
  const keys = ["source_identity_receipt_cid", "canonical_compiler_csg_cid", "canonical_output_digest", "target_triple_cid", "bootstrap_stage_cid", "ordered_provider_set_cid", "semantic_receipt_cid"];
  if (lines.length !== keys.length) throw new CidOracleError("semantic receipt: 字段数错误");
  const values = keys.map((key, index) => exactField(lines[index], key, "semantic receipt"));
  for (let i = 0; i < values.length; i += 1) rawFixed32(values[i], keys[i]);
  const receiptCid = hashParts([framedText("cheng.system_link_exec.compile_semantic_receipt"), ...values.slice(0, 6).map((value, index) => framedFixed32(value, keys[index]))]);
  if (receiptCid !== values[6]) throw new CidOracleError("semantic receipt: CID 不匹配");
  return {
    sourceIdentityReceiptCid: values[0], canonicalCompilerCsgCid: values[1], canonicalOutputDigest: values[2],
    targetTripleCid: values[3], bootstrapStageCid: values[4], orderedProviderSetCid: values[5], receiptCid: values[6],
  };
}

export function sourceToCsgBindingSeal(sourceReceiptCid: string, canonicalCsgCid: string, semanticReceiptCid: string): string {
  return hashParts([
    framedText("cheng.system_link_exec.source_to_csg_binding"), framedFixed32(sourceReceiptCid, "source"),
    framedFixed32(canonicalCsgCid, "csg"), framedFixed32(semanticReceiptCid, "semantic"),
  ]);
}

export function parseUniqueKv(raw: Buffer, label: string): ReadonlyMap<string, string> {
  const lines = parseExactLines(raw, label);
  rejectDuplicateKeys(lines, label);
  return new Map(lines.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
}

export function parseExportSurface(raw: Buffer): ExportSurface {
  const lines = parseExactLines(raw, "export surface");
  if (lines.length < 3) throw new CidOracleError("export surface: 字段不足");
  const packageId = decodeHexText(exactField(lines[0], "package_id_hex", "export surface"), "package_id_hex");
  canonicalPackageId(packageId);
  const count = exactInteger(exactField(lines[1], "exported_count", "export surface"), "exported_count");
  const claimedCid = exactField(lines[2], "surface_cid", "export surface");
  rawFixed32(claimedCid, "surface_cid");
  if (lines.length !== 3 + count) throw new CidOracleError("export surface: row 数量不匹配");
  const rows: ExportSurface["rows"][number][] = [];
  for (let i = 0; i < count; i += 1) {
    const parts = exactField(lines[3 + i], `export[${i}]`, "export surface").split("|");
    if (parts.length !== 5) throw new CidOracleError(`export surface: row[${i}] shape`);
    rows.push({symbol: decodeHexText(parts[0], "symbol"), target: decodeHexText(parts[1], "target"), layout: exactInteger(parts[2], "layout"), effect: exactInteger(parts[3], "effect"), capability: exactInteger(parts[4], "capability")});
    if (i > 0) {
      const prior = rows[i - 1];
      const current = rows[i];
      const order = Buffer.compare(Buffer.from(prior.symbol), Buffer.from(current.symbol)) ||
        Buffer.compare(Buffer.from(prior.target), Buffer.from(current.target)) ||
        prior.layout - current.layout || prior.effect - current.effect || prior.capability - current.capability;
      if (order >= 0) throw new CidOracleError(`export surface: row[${i}] 非严格排序`);
    }
  }
  const parts: Buffer[] = [framedText("cheng.compiler.export_surface"), framedText(packageId), framedU32(count, "exported_count")];
  for (const row of rows) parts.push(framedText(row.symbol), framedText(row.target), framedU32(row.layout, "layout"), framedU32(row.effect, "effect"), framedU32(row.capability, "capability"));
  const surfaceCid = hashParts(parts);
  if (surfaceCid !== claimedCid) throw new CidOracleError("export surface: CID 不匹配");
  return {packageId, rows, surfaceCid};
}

function receiptFromMigration(lines: readonly string[], start: number, prefix: string): PortableSourceIdentityReceipt {
  const keys = ["source_snapshot_count", "import_edge_count", "unresolved_import_count", "source_package_id_cid", "entry_module_path_cid", "source_bundle_cid", "entry_source_cid", "import_graph_cid", "receipt_cid"];
  const values = keys.map((key, index) => exactField(lines[start + index], `${prefix}.${key}`, "migration evidence"));
  const out: PortableSourceIdentityReceipt = {
    sourceSnapshotCount: exactInteger(values[0], keys[0]), importEdgeCount: exactInteger(values[1], keys[1]),
    unresolvedImportCount: exactInteger(values[2], keys[2]), sourcePackageIdCid: values[3], entryModulePathCid: values[4],
    sourceBundleCid: values[5], entrySourceCid: values[6], importGraphCid: values[7], receiptCid: values[8],
  };
  const expected = hashParts([framedText("cheng.compiler.portable_source_identity_receipt"), framedU32(out.sourceSnapshotCount, "count"), framedU32(out.importEdgeCount, "edges"), framedU32(out.unresolvedImportCount, "unresolved"), framedFixed32(out.sourcePackageIdCid, "package"), framedFixed32(out.entryModulePathCid, "entry"), framedFixed32(out.sourceBundleCid, "bundle"), framedFixed32(out.entrySourceCid, "source"), framedFixed32(out.importGraphCid, "graph")]);
  if (expected !== out.receiptCid || out.unresolvedImportCount !== 0) throw new CidOracleError(`migration evidence: ${prefix} receipt CID`);
  return out;
}

function appendMigrationReceipt(parts: Buffer[], receipt: PortableSourceIdentityReceipt): void {
  parts.push(framedU32(receipt.sourceSnapshotCount, "source_count"), framedU32(receipt.importEdgeCount, "edge_count"), framedU32(receipt.unresolvedImportCount, "unresolved"));
  parts.push(framedFixed32(receipt.sourcePackageIdCid, "package"), framedFixed32(receipt.entryModulePathCid, "entry"), framedFixed32(receipt.sourceBundleCid, "bundle"));
  parts.push(framedFixed32(receipt.entrySourceCid, "source"), framedFixed32(receipt.importGraphCid, "imports"), framedFixed32(receipt.receiptCid, "receipt"));
}

function migrationReceiptLines(prefix: string, receipt: PortableSourceIdentityReceipt): string[] {
  return [
    `${prefix}.source_snapshot_count=${receipt.sourceSnapshotCount}`,
    `${prefix}.import_edge_count=${receipt.importEdgeCount}`,
    `${prefix}.unresolved_import_count=${receipt.unresolvedImportCount}`,
    `${prefix}.source_package_id_cid=${receipt.sourcePackageIdCid}`,
    `${prefix}.entry_module_path_cid=${receipt.entryModulePathCid}`,
    `${prefix}.source_bundle_cid=${receipt.sourceBundleCid}`,
    `${prefix}.entry_source_cid=${receipt.entrySourceCid}`,
    `${prefix}.import_graph_cid=${receipt.importGraphCid}`,
    `${prefix}.receipt_cid=${receipt.receiptCid}`,
  ];
}

export function encodeMigrationEvidence(evidence: MigrationEvidence): Buffer {
  const lines = [
    `package_id=${evidence.packageId}`,
    `entry_module_path=${evidence.entryModulePath}`,
    `unit_count=${evidence.units.length}`,
  ];
  for (let index = 0; index < evidence.units.length; index += 1) {
    const unit = evidence.units[index];
    lines.push(
      `unit[${index}].module_path=${unit.modulePath}`,
      `unit[${index}].legacy_raw_byte_length=${unit.legacyRawByteLength}`,
      `unit[${index}].legacy_raw_cid=${unit.legacyRawCid}`,
      `unit[${index}].migrated_raw_byte_length=${unit.migratedRawByteLength}`,
      `unit[${index}].migrated_raw_cid=${unit.migratedRawCid}`,
    );
  }
  lines.push(`rule_id_count=${evidence.ruleIds.length}`);
  for (let index = 0; index < evidence.ruleIds.length; index += 1) lines.push(`rule_id[${index}]=${evidence.ruleIds[index]}`);
  lines.push(
    `legacy_source_bundle_cid=${evidence.legacySourceBundleCid}`,
    `migrated_source_bundle_cid=${evidence.migratedSourceBundleCid}`,
    ...migrationReceiptLines("legacy_source_receipt", evidence.legacySourceReceipt),
    ...migrationReceiptLines("migrated_source_receipt", evidence.migratedSourceReceipt),
    `evidence_cid=${evidence.evidenceCid}`,
  );
  return Buffer.from(lines.join("\n"));
}

export function buildMigrationEvidence(
  packageId: string,
  entryModulePath: string,
  legacySources: readonly SourceModuleBytes[],
  migratedSources: readonly SourceModuleBytes[],
  ruleIds: readonly string[],
): MigrationEvidence {
  canonicalPackageId(packageId);
  canonicalModulePath(entryModulePath);
  const legacy = [...legacySources].sort((left, right) => Buffer.compare(Buffer.from(left.modulePath), Buffer.from(right.modulePath)));
  const migrated = [...migratedSources].sort((left, right) => Buffer.compare(Buffer.from(left.modulePath), Buffer.from(right.modulePath)));
  if (legacy.length === 0 || legacy.length !== migrated.length) throw new CidOracleError("migration evidence builder: source count");
  const units: MigrationEvidence["units"][number][] = [];
  for (let index = 0; index < legacy.length; index += 1) {
    if (legacy[index].modulePath !== migrated[index].modulePath) throw new CidOracleError("migration evidence builder: module mapping");
    units.push({
      modulePath: legacy[index].modulePath,
      legacyRawByteLength: legacy[index].bytes.length,
      legacyRawCid: sourceRawCid(legacy[index].bytes),
      migratedRawByteLength: migrated[index].bytes.length,
      migratedRawCid: sourceRawCid(migrated[index].bytes),
    });
  }
  const orderedRules = [...ruleIds].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  if (orderedRules.some((rule, index) => rule !== ruleIds[index] || (index > 0 && orderedRules[index - 1] === rule))) throw new CidOracleError("migration evidence builder: rule order");
  for (const rule of orderedRules) canonicalText(rule, "migration rule");
  const legacySourceReceipt = buildPortableSourceIdentity(packageId, entryModulePath, legacy);
  const migratedSourceReceipt = buildPortableSourceIdentity(packageId, entryModulePath, migrated);
  const base = {
    packageId,
    entryModulePath,
    unitCount: units.length,
    units,
    ruleIds: orderedRules,
    legacySourceBundleCid: legacySourceReceipt.sourceBundleCid,
    migratedSourceBundleCid: migratedSourceReceipt.sourceBundleCid,
    legacySourceReceipt,
    migratedSourceReceipt,
  };
  const parts: Buffer[] = [framedText("cheng.compiler.migration_evidence"), framedText(packageId), framedText(entryModulePath), framedU32(units.length, "unit_count"), framedFixed32(base.legacySourceBundleCid, "legacy_bundle"), framedFixed32(base.migratedSourceBundleCid, "migrated_bundle")];
  appendMigrationReceipt(parts, legacySourceReceipt); appendMigrationReceipt(parts, migratedSourceReceipt);
  for (const unit of units) parts.push(framedText(unit.modulePath), framedU32(unit.legacyRawByteLength, "legacy_length"), framedFixed32(unit.legacyRawCid, "legacy_cid"), framedU32(unit.migratedRawByteLength, "migrated_length"), framedFixed32(unit.migratedRawCid, "migrated_cid"));
  parts.push(framedU32(orderedRules.length, "rule_count"), ...orderedRules.map((rule) => framedText(rule)));
  const rebuilt: MigrationEvidence = {...base, evidenceCid: hashParts(parts)};
  return parseMigrationEvidence(encodeMigrationEvidence(rebuilt));
}

export function parseMigrationEvidence(raw: Buffer): MigrationEvidence {
  const lines = parseExactLines(raw, "migration evidence");
  let cursor = 0;
  const packageId = exactField(lines[cursor++], "package_id", "migration evidence");
  const entryModulePath = exactField(lines[cursor++], "entry_module_path", "migration evidence");
  canonicalPackageId(packageId); canonicalModulePath(entryModulePath);
  const unitCount = exactInteger(exactField(lines[cursor++], "unit_count", "migration evidence"), "unit_count");
  if (unitCount <= 0) throw new CidOracleError("migration evidence: 空 units");
  const units: MigrationEvidence["units"][number][] = [];
  for (let i = 0; i < unitCount; i += 1) {
    const modulePath = exactField(lines[cursor++], `unit[${i}].module_path`, "migration evidence");
    canonicalModulePath(modulePath);
    const unit = {
      modulePath,
      legacyRawByteLength: exactInteger(exactField(lines[cursor++], `unit[${i}].legacy_raw_byte_length`, "migration evidence"), "legacy_length"),
      legacyRawCid: exactField(lines[cursor++], `unit[${i}].legacy_raw_cid`, "migration evidence"),
      migratedRawByteLength: exactInteger(exactField(lines[cursor++], `unit[${i}].migrated_raw_byte_length`, "migration evidence"), "migrated_length"),
      migratedRawCid: exactField(lines[cursor++], `unit[${i}].migrated_raw_cid`, "migration evidence"),
    };
    rawFixed32(unit.legacyRawCid, "legacy_raw_cid"); rawFixed32(unit.migratedRawCid, "migrated_raw_cid");
    if (i > 0 && Buffer.compare(Buffer.from(units[i - 1].modulePath), Buffer.from(modulePath)) >= 0) throw new CidOracleError("migration evidence: units 非严格排序");
    units.push(unit);
  }
  const ruleCount = exactInteger(exactField(lines[cursor++], "rule_id_count", "migration evidence"), "rule_count");
  const ruleIds: string[] = [];
  for (let i = 0; i < ruleCount; i += 1) {
    const rule = exactField(lines[cursor++], `rule_id[${i}]`, "migration evidence");
    canonicalText(rule, "rule_id");
    if (i > 0 && Buffer.compare(Buffer.from(ruleIds[i - 1]), Buffer.from(rule)) >= 0) throw new CidOracleError("migration evidence: rule 非严格排序");
    ruleIds.push(rule);
  }
  const legacySourceBundleCid = exactField(lines[cursor++], "legacy_source_bundle_cid", "migration evidence");
  const migratedSourceBundleCid = exactField(lines[cursor++], "migrated_source_bundle_cid", "migration evidence");
  const legacySourceReceipt = receiptFromMigration(lines, cursor, "legacy_source_receipt"); cursor += 9;
  const migratedSourceReceipt = receiptFromMigration(lines, cursor, "migrated_source_receipt"); cursor += 9;
  const evidenceCid = exactField(lines[cursor++], "evidence_cid", "migration evidence");
  if (cursor !== lines.length) throw new CidOracleError("migration evidence: 未知字段");
  const parts: Buffer[] = [framedText("cheng.compiler.migration_evidence"), framedText(packageId), framedText(entryModulePath), framedU32(unitCount, "unit_count"), framedFixed32(legacySourceBundleCid, "legacy_bundle"), framedFixed32(migratedSourceBundleCid, "migrated_bundle")];
  appendMigrationReceipt(parts, legacySourceReceipt); appendMigrationReceipt(parts, migratedSourceReceipt);
  for (const unit of units) parts.push(framedText(unit.modulePath), framedU32(unit.legacyRawByteLength, "legacy_length"), framedFixed32(unit.legacyRawCid, "legacy_cid"), framedU32(unit.migratedRawByteLength, "migrated_length"), framedFixed32(unit.migratedRawCid, "migrated_cid"));
  parts.push(framedU32(ruleIds.length, "rule_count"), ...ruleIds.map((rule) => framedText(rule)));
  if (hashParts(parts) !== evidenceCid) throw new CidOracleError("migration evidence: CID 不匹配");
  return {packageId, entryModulePath, unitCount, units, ruleIds, legacySourceBundleCid, migratedSourceBundleCid, legacySourceReceipt, migratedSourceReceipt, evidenceCid};
}

export function verifyMigrationEvidenceRawSources(evidence: MigrationEvidence, legacy: readonly SourceModuleBytes[], migrated: readonly SourceModuleBytes[]): void {
  if (legacy.length !== evidence.unitCount || migrated.length !== evidence.unitCount) throw new CidOracleError("migration raw sources: unit 数量不匹配");
  const byLegacy = new Map(legacy.map((item) => [item.modulePath, item.bytes]));
  const byMigrated = new Map(migrated.map((item) => [item.modulePath, item.bytes]));
  for (const unit of evidence.units) {
    const legacyBytes = byLegacy.get(unit.modulePath); const migratedBytes = byMigrated.get(unit.modulePath);
    if (!legacyBytes || !migratedBytes) throw new CidOracleError(`migration raw sources: 缺 ${unit.modulePath}`);
    if (legacyBytes.length !== unit.legacyRawByteLength || sourceRawCid(legacyBytes) !== unit.legacyRawCid) throw new CidOracleError(`migration raw sources: legacy ${unit.modulePath}`);
    if (migratedBytes.length !== unit.migratedRawByteLength || sourceRawCid(migratedBytes) !== unit.migratedRawCid) throw new CidOracleError(`migration raw sources: migrated ${unit.modulePath}`);
  }
  assertPortableSourceReceiptEqual(evidence.legacySourceReceipt, buildPortableSourceIdentity(evidence.packageId, evidence.entryModulePath, legacy));
  assertPortableSourceReceiptEqual(evidence.migratedSourceReceipt, buildPortableSourceIdentity(evidence.packageId, evidence.entryModulePath, migrated));
}

export function parseMigrationProof(raw: Buffer): MigrationProof {
  const rows = parseUniqueKv(raw, "migration proof");
  const keys = [
    "proof_kind", "package_id", "channel", "migration_evidence_cid", "legacy_source_identity_receipt_cid", "migrated_source_identity_receipt_cid",
    "baseline_graph_cid", "migrated_graph_cid", "baseline_surface_cid", "migrated_surface_cid", "baseline_semantic_receipt_cid", "migrated_semantic_receipt_cid",
    "baseline_semantic_source_identity_receipt_cid", "migrated_semantic_source_identity_receipt_cid", "baseline_semantic_compiler_csg_cid", "migrated_semantic_compiler_csg_cid",
    "baseline_semantic_output_digest", "migrated_semantic_output_digest", "baseline_semantic_target_triple_cid", "migrated_semantic_target_triple_cid",
    "baseline_semantic_bootstrap_stage_cid", "migrated_semantic_bootstrap_stage_cid", "baseline_semantic_provider_set_cid", "migrated_semantic_provider_set_cid",
    "target", "graph_equivalent", "export_surface_compatible", "semantic_equivalent", "equivalence_kind", "proof_cid",
  ];
  for (const key of keys) if (!rows.has(key)) throw new CidOracleError(`migration proof: 缺 ${key}`);
  const egraphRows = Object.freeze({
    egraph_active_contract: "canonical_csg_equivalence",
    egraph_equivalence_surface: "canonical_graph_cid",
    canonical_csg_equivalence_available: "1",
    canonical_hash_count: "from_cold_compile_stats",
    normalization_coverage: "I32_I64_bitwise_integer_only",
    uir_egraph_status: "compiled_not_invoked",
    uir_egraph_available: "1",
    uir_egraph_pipeline_invoked: "0",
    uir_egraph_rewrite_enabled: "0",
    uir_egraph_rewrite_rule_count: "36",
    uir_egraph_changed: "0",
    uir_egraph_require_proof: "1",
    uir_egraph_hard_fail: "0",
    uir_egraph_reason: "typed_ir_to_uir_bridge_not_implemented",
  });
  const allowedExtra = new Set(Object.keys(egraphRows));
  for (const key of rows.keys()) if (!keys.includes(key) && !allowedExtra.has(key)) throw new CidOracleError(`migration proof: 未知字段 ${key}`);
  for (const [key, value] of Object.entries(egraphRows)) {
    if (rows.get(key) !== value) throw new CidOracleError(`migration proof: 非 canonical egraph contract ${key}`);
  }
  const expectedOrder = [
    ...keys.slice(0, 6),
    ...Object.keys(egraphRows),
    ...keys.slice(6),
  ];
  const actualOrder = [...rows.keys()];
  if (actualOrder.length !== expectedOrder.length || actualOrder.some((key, index) => key !== expectedOrder[index])) {
    throw new CidOracleError("migration proof: 字段顺序不 canonical");
  }
  const get = (key: string) => rows.get(key)!;
  const proof: MigrationProof = {
    proofKind: get("proof_kind"), packageId: get("package_id"), channel: get("channel"), migrationEvidenceCid: get("migration_evidence_cid"),
    legacySourceIdentityReceiptCid: get("legacy_source_identity_receipt_cid"), migratedSourceIdentityReceiptCid: get("migrated_source_identity_receipt_cid"),
    baselineGraphCid: get("baseline_graph_cid"), migratedGraphCid: get("migrated_graph_cid"), baselineSurfaceCid: get("baseline_surface_cid"), migratedSurfaceCid: get("migrated_surface_cid"),
    baselineSemanticReceiptCid: get("baseline_semantic_receipt_cid"), migratedSemanticReceiptCid: get("migrated_semantic_receipt_cid"), baselineSemanticSourceIdentityReceiptCid: get("baseline_semantic_source_identity_receipt_cid"), migratedSemanticSourceIdentityReceiptCid: get("migrated_semantic_source_identity_receipt_cid"),
    baselineSemanticCompilerCsgCid: get("baseline_semantic_compiler_csg_cid"), migratedSemanticCompilerCsgCid: get("migrated_semantic_compiler_csg_cid"), baselineSemanticOutputDigest: get("baseline_semantic_output_digest"), migratedSemanticOutputDigest: get("migrated_semantic_output_digest"),
    baselineSemanticTargetTripleCid: get("baseline_semantic_target_triple_cid"), migratedSemanticTargetTripleCid: get("migrated_semantic_target_triple_cid"), baselineSemanticBootstrapStageCid: get("baseline_semantic_bootstrap_stage_cid"), migratedSemanticBootstrapStageCid: get("migrated_semantic_bootstrap_stage_cid"),
    baselineSemanticProviderSetCid: get("baseline_semantic_provider_set_cid"), migratedSemanticProviderSetCid: get("migrated_semantic_provider_set_cid"), target: get("target"),
    graphEquivalent: exactInteger(get("graph_equivalent"), "graph_equivalent"), exportSurfaceCompatible: exactInteger(get("export_surface_compatible"), "export_surface_compatible"), semanticEquivalent: exactInteger(get("semantic_equivalent"), "semantic_equivalent"), equivalenceKind: get("equivalence_kind"), proofCid: get("proof_cid"),
  };
  canonicalPackageId(proof.packageId); canonicalText(proof.target, "target");
  if (proof.proofKind !== "migration_semantic" || !["stable", "edge"].includes(proof.channel)) throw new CidOracleError("migration proof: kind/channel");
  const cidKeys = Object.keys(proof).filter((key) => key.endsWith("Cid"));
  for (const key of cidKeys) rawFixed32((proof as unknown as Record<string, string>)[key], key);
  const graphEquivalent = proof.baselineGraphCid === proof.migratedGraphCid ? 1 : 0;
  const surfaceCompatible = proof.baselineSurfaceCid === proof.migratedSurfaceCid ? 1 : 0;
  const semanticEquivalent = ["CompilerCsgCid", "OutputDigest", "TargetTripleCid", "BootstrapStageCid", "ProviderSetCid"].every((suffix) => (proof as unknown as Record<string, string>)[`baselineSemantic${suffix}`] === (proof as unknown as Record<string, string>)[`migratedSemantic${suffix}`]) ? 1 : 0;
  const kind = graphEquivalent && surfaceCompatible && semanticEquivalent ? "canonical_semantic_identity" : "incompatible";
  if (proof.graphEquivalent !== graphEquivalent || proof.exportSurfaceCompatible !== surfaceCompatible || proof.semanticEquivalent !== semanticEquivalent || proof.equivalenceKind !== kind) throw new CidOracleError("migration proof: caller-supplied equivalence flags 不可信");
  const parts: Buffer[] = [framedText("cheng.compiler.migration_semantic_proof"), framedText(proof.proofKind), framedText(proof.packageId), framedText(proof.channel)];
  for (const key of ["migrationEvidenceCid", "legacySourceIdentityReceiptCid", "migratedSourceIdentityReceiptCid", "baselineGraphCid", "migratedGraphCid", "baselineSurfaceCid", "migratedSurfaceCid", "baselineSemanticReceiptCid", "migratedSemanticReceiptCid", "baselineSemanticSourceIdentityReceiptCid", "migratedSemanticSourceIdentityReceiptCid", "baselineSemanticCompilerCsgCid", "migratedSemanticCompilerCsgCid", "baselineSemanticOutputDigest", "migratedSemanticOutputDigest", "baselineSemanticTargetTripleCid", "migratedSemanticTargetTripleCid", "baselineSemanticBootstrapStageCid", "migratedSemanticBootstrapStageCid", "baselineSemanticProviderSetCid", "migratedSemanticProviderSetCid"] as const) parts.push(framedFixed32(proof[key], key));
  parts.push(framedText(proof.target), framedU32(proof.graphEquivalent, "graph_equivalent"), framedU32(proof.exportSurfaceCompatible, "surface_compatible"), framedU32(proof.semanticEquivalent, "semantic_equivalent"), framedText(proof.equivalenceKind));
  if (hashParts(parts) !== proof.proofCid) throw new CidOracleError("migration proof: CID 不匹配");
  return proof;
}

export function verifyMigrationProofBindings(proof: MigrationProof, evidence: MigrationEvidence, baselineCsg: CanonicalCsgSidecar, migratedCsg: CanonicalCsgSidecar, baselineSurface: ExportSurface, migratedSurface: ExportSurface, baselineSemantic: CompileSemanticReceipt, migratedSemantic: CompileSemanticReceipt): void {
  const exact: readonly [string, string, string][] = [
    ["evidence", proof.migrationEvidenceCid, evidence.evidenceCid], ["legacy receipt", proof.legacySourceIdentityReceiptCid, evidence.legacySourceReceipt.receiptCid],
    ["migrated receipt", proof.migratedSourceIdentityReceiptCid, evidence.migratedSourceReceipt.receiptCid], ["baseline graph", proof.baselineGraphCid, baselineCsg.canonicalGraphCid],
    ["migrated graph", proof.migratedGraphCid, migratedCsg.canonicalGraphCid], ["baseline surface", proof.baselineSurfaceCid, baselineSurface.surfaceCid],
    ["migrated surface", proof.migratedSurfaceCid, migratedSurface.surfaceCid], ["baseline semantic", proof.baselineSemanticReceiptCid, baselineSemantic.receiptCid],
    ["migrated semantic", proof.migratedSemanticReceiptCid, migratedSemantic.receiptCid],
  ];
  for (const [label, actual, expected] of exact) if (actual !== expected) throw new CidOracleError(`migration proof binding: ${label}`);
  const proofTargetCid = semanticTextCid("cheng.compiler.target_triple", proof.target);
  if (proof.packageId !== evidence.packageId || proof.baselineSemanticSourceIdentityReceiptCid !== baselineSemantic.sourceIdentityReceiptCid || proof.migratedSemanticSourceIdentityReceiptCid !== migratedSemantic.sourceIdentityReceiptCid || proof.baselineSemanticCompilerCsgCid !== baselineSemantic.canonicalCompilerCsgCid || proof.migratedSemanticCompilerCsgCid !== migratedSemantic.canonicalCompilerCsgCid || proof.baselineSemanticTargetTripleCid !== proofTargetCid || proof.migratedSemanticTargetTripleCid !== proofTargetCid || baselineSemantic.targetTripleCid !== proofTargetCid || migratedSemantic.targetTripleCid !== proofTargetCid) throw new CidOracleError("migration proof binding: semantic predecessors/target");
  if (proof.graphEquivalent !== 1 || proof.exportSurfaceCompatible !== 1 || proof.semanticEquivalent !== 1 || proof.equivalenceKind !== "canonical_semantic_identity") {
    throw new CidOracleError("migration proof binding: stable production proof 不等价");
  }
}

export function worldHashText(tag: string, values: readonly string[]): string {
  return hashParts([framedText("cheng.compiler.hash_text"), framedText(tag), framedU32(values.length, "value_count"), ...values.map((value) => framedText(value))]);
}

export const encoding = Object.freeze({framedText, framedFixed32, framedU32, rawFixed32, hashParts, sourceRawCid, semanticTextCid});
