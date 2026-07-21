#!/usr/bin/env bun
// mutation_net_gen.ts — 变异证明网生成器(变异算子实现 + mutants.json 台账校验)。
//
// 纪律(同 semantic_gen/grammar_corpus_gen):
//   - 确定性: 全部变异从 checked-in 输入(spec/corpus/map/evidence receipt)与
//     m9023/m9024 内存工件派生, 无 RNG 无时间戳; 同输入必得同字节。
//   - 不硬凑: 算子 kill 契约只写真实存在的门; 无门可杀的算子登记 gapRegistry,
//     harness 实测必须 survived(被杀了说明门已加固, 台账要跟进)。
//   - 只读: 本工具与 item27 均不写 fixtures/evidence 任何文件, 变异全在内存副本上。
//
// 用法:
//   bun tools/mutation_net_gen.ts --check   校验 mutants.json 形状 + 算子实现覆盖对齐
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";
import {
  buildBaseSemanticSourceBundle,
  buildChengGrammarObligationContract,
  buildPipelineProfileSourceBundle,
  generatePipelineMatrix,
  mutateSourceBundle,
  type ChengGrammarObligationContract,
  type ChengSemanticSourceBundle,
  type GrammarObligationKind,
  type GrammarParserSpanReceipt,
  type PipelineProfileCase,
  type SourceBundleMutation,
} from "../src/cheng_semantic_pipeline_matrix_m9024.ts";
import {
  buildSemanticContractLedger,
  canonicalJson,
  enumerateSemanticUniverse,
  mutateSemanticContractLedger,
  sha256,
  type SemanticCase,
  type SemanticContractLedger,
  type SemanticContractMutation,
} from "../src/cheng_semantic_matrix_m9023.ts";
import {
  chengPublicTokensWithOffsets,
  makeSyntheticReceipt,
  type ProvenanceAnchor,
} from "./grammar_span_receipt.ts";
import {buildCorpus} from "./grammar_corpus_gen.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = process.env.CHENG_FORMAL_SPEC_PATH ?? "/Users/lbcheng/cheng-lang/docs/cheng-formal-spec.md";
const MAP_PATH = resolve(HERE, "../fixtures/semantic/ebnf_parser_node_map.json");
const TABLE_PATH = resolve(HERE, "../fixtures/mutation/mutants.json");
const EVIDENCE_DIR = resolve(HERE, "../evidence");

// ---------------------------------------------------------------- 台账加载
export interface KillContract {
  readonly gate: string;
  readonly signal: string;
  readonly authorityGate?: string;
  readonly authoritySignal?: string;
  readonly gap?: string;
}

export interface MutantDecl {
  readonly id: string;
  readonly class: "destructive" | "preservative";
  readonly operator: string;
  readonly target: string;
  readonly detail: string;
  readonly killContract: KillContract;
}

export interface GapEntry {
  readonly title: string;
  readonly detail: string;
  readonly hardening: string;
}

export interface MutantTable {
  readonly schema: "cheng_mutation_net.v1";
  readonly gates: Readonly<Record<string, string>>;
  readonly gapRegistry: Readonly<Record<string, GapEntry>>;
  readonly operators: readonly MutantDecl[];
}

export function loadMutantTable(path: string = TABLE_PATH): MutantTable {
  const table = JSON.parse(readFileSync(path, "utf8")) as MutantTable;
  if (table.schema !== "cheng_mutation_net.v1") throw new Error(`mutants.json schema 不符: ${table.schema}`);
  const ids = new Set<string>();
  for (const op of table.operators) {
    if (ids.has(op.id)) throw new Error(`mutants.json id 重复: ${op.id}`);
    ids.add(op.id);
    if (op.class !== "destructive" && op.class !== "preservative") throw new Error(`${op.id}: class 非法`);
    const contract = op.killContract;
    if (contract === undefined || typeof contract.gate !== "string" || typeof contract.signal !== "string") {
      throw new Error(`${op.id}: killContract 缺 gate/signal`);
    }
    if (contract.gap !== undefined && table.gapRegistry[contract.gap] === undefined) {
      throw new Error(`${op.id}: 引用未登记缺口 ${contract.gap}`);
    }
    if (op.class === "destructive" && contract.gate === "none" && contract.gap === undefined) {
      throw new Error(`${op.id}: 破坏性算子无 kill 门又未登记缺口 — 不允许硬凑`);
    }
    if (contract.gate !== "none" && contract.gate !== "all" && table.gates[contract.gate] === undefined) {
      throw new Error(`${op.id}: kill 门 ${contract.gate} 未在 gates 表登记`);
    }
    if (contract.authorityGate !== undefined && table.gates[contract.authorityGate] === undefined) {
      throw new Error(`${op.id}: 权威门 ${contract.authorityGate} 未在 gates 表登记`);
    }
  }
  for (const [gapId, gap] of Object.entries(table.gapRegistry)) {
    if (!gap.title || !gap.detail || !gap.hardening) throw new Error(`缺口 ${gapId} 缺 title/detail/hardening`);
  }
  return table;
}

// ---------------------------------------------------------------- 基础工件
export interface CorpusManifestEntry {
  readonly relativePath: string;
  readonly shape: string;
  readonly note: string;
  readonly evidence: {readonly has: Record<string, number>; readonly lacks: readonly string[]};
  readonly sourceSha256: string;
  readonly lintTokenCount: number;
  readonly claims: readonly {
    readonly obligationId: string;
    readonly production: string;
    readonly kind: GrammarObligationKind;
    readonly structuralPath: string;
    readonly variant: string;
    readonly bound: number | null;
    readonly mapStatus: "MAPPED" | "PARTIAL";
  }[];
}

export interface CorpusManifest {
  readonly schema: string;
  readonly spec: {readonly formalSpecSha256: string; readonly ebnfSha256: string; readonly mapSha256: string; readonly productionCount: number};
  readonly counts: {readonly coveredProductions: number; readonly sources: number; readonly claims: number; readonly blocked: number; readonly coveredRequiredObligations: number};
  readonly entries: readonly CorpusManifestEntry[];
  readonly blocked: readonly unknown[];
  readonly hitProductionsByKind: Readonly<Record<string, readonly string[]>>;
}

export interface NodeMapDoc {
  readonly schema: string;
  readonly spec: {readonly formalSpecSha256: string; readonly ebnfSha256: string};
  readonly counts: {readonly total: number; readonly MAPPED: number; readonly PARTIAL: number; readonly UNMAPPED: number};
  readonly rows: readonly {readonly name: string; readonly status: "MAPPED" | "PARTIAL" | "UNMAPPED"}[];
}

export interface MutationBases {
  readonly specBytes: Buffer;
  readonly grammar: ChengGrammarObligationContract;
  readonly corpus: {readonly manifest: CorpusManifest; readonly files: ReadonlyMap<string, string>};
  readonly mapDoc: NodeMapDoc;
  readonly sourceFiles: readonly Readonly<{relativePath: string; source: string}>[];
  /** 五条合成正例 receipt(与 item26[B+] 同口径, synthetic provenance) */
  readonly receipts: readonly GrammarParserSpanReceipt[];
  /** 宽 span 正例(equality claim, "="前后各扩数 token; span 平移类算子的载体, 同 item26 负例2 构造) */
  readonly wideReceipt: GrammarParserSpanReceipt;
  readonly ledgerCases: {readonly owned: SemanticCase; readonly call: SemanticCase; readonly field: SemanticCase};
  readonly ledgers: {readonly owned: SemanticContractLedger; readonly call: SemanticContractLedger; readonly field: SemanticContractLedger};
  readonly firstBase: SemanticCase;
  readonly firstBaseBundle: ChengSemanticSourceBundle;
  readonly firstProfile: PipelineProfileCase;
  readonly firstProfileBundle: ChengSemanticSourceBundle;
  readonly evidenceReceiptPath: string | null;
  readonly evidenceReceipt: Readonly<Record<string, unknown>> | null;
  /** 发布钉住的 provenance 锚(fixtures/semantic/toolchain_anchor.json; GAP-2 锚定门基底) */
  readonly provenanceAnchor: ProvenanceAnchor;
}

function findClaim(manifest: CorpusManifest, production: string, kind: string, variant: string) {
  for (const entry of manifest.entries) {
    for (const claim of entry.claims) {
      if (claim.production === production && claim.kind === kind && claim.variant === variant) {
        return {entry, claim};
      }
    }
  }
  throw new Error(`claim 未找到: ${production}/${kind}/${variant}`);
}

function latestEvidenceReceipt(): {path: string; receipt: Record<string, unknown>} | null {
  let names: string[] = [];
  try {
    names = Object.keys(
      (JSON.parse(readFileSync(resolve(EVIDENCE_DIR, "index.json"), "utf8")) as {runs?: Record<string, unknown>}).runs ?? {},
    ).sort();
  } catch {
    names = [];
  }
  if (names.length === 0) return null;
  const runId = names[names.length - 1]!;
  const path = resolve(EVIDENCE_DIR, runId, "receipt.json");
  try {
    return {path, receipt: JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>};
  } catch {
    return null;
  }
}

export function buildMutationBases(): MutationBases {
  const specBytes = readFileSync(SPEC_PATH);
  const grammar = buildChengGrammarObligationContract(specBytes);
  const {manifest, files} = buildCorpus() as {manifest: CorpusManifest; files: Map<string, string>};
  const mapDoc = JSON.parse(readFileSync(MAP_PATH, "utf8")) as NodeMapDoc;
  const sourceFiles = manifest.entries.map((entry) => ({
    relativePath: entry.relativePath,
    source: files.get(`${entry.shape}.cheng`)!,
  }));

  // 五条合成正例(与 item26[B+] 同五类 obligation)
  const positives = [
    {production: "equality", kind: "production", variant: "root", needle: "="},
    {production: "ifStmt", kind: "optional", variant: "present", needle: "else"},
    {production: "logicalOr", kind: "repetition", variant: "bounded_max", needle: "||"},
    {production: "fnDecl", kind: "choice", variant: "alternative_0", needle: "fn"},
    {production: "expression", kind: "recursion", variant: "bounded_depth", needle: "("},
  ] as const;
  const receipts: GrammarParserSpanReceipt[] = [];
  for (const p of positives) {
    const {entry, claim} = findClaim(manifest, p.production, p.kind, p.variant);
    const source = files.get(`${entry.shape}.cheng`)!;
    const hit = chengPublicTokensWithOffsets(source).find((t) => t.text === p.needle);
    if (hit === undefined) throw new Error(`${entry.shape} 缺 token ${p.needle}`);
    receipts.push(makeSyntheticReceipt(claim, entry.relativePath, source, hit.start, hit.end));
  }
  // 宽 span 正例(同 item26 负例2 构造: expr_ops 的 "=" 前后各扩 3 token)
  const {entry: entryEq, claim: claimEq} = findClaim(manifest, "equality", "production", "root");
  const srcEq = files.get(`${entryEq.shape}.cheng`)!;
  const offsEq = chengPublicTokensWithOffsets(srcEq);
  const eqIdx = offsEq.findIndex((t) => t.text === "=");
  if (eqIdx <= 0 || eqIdx + 3 >= offsEq.length) throw new Error("expr_ops 源结构异常, 无法构造宽 span 正例");
  const wideReceipt = makeSyntheticReceipt(claimEq, entryEq.relativePath, srcEq, offsEq[eqIdx - 1]!.start, offsEq[eqIdx + 3]!.end);

  const universe = enumerateSemanticUniverse();
  const owned = universe.legalCases.find((entry) => entry.dimensions.type === "str" && entry.dimensions.ownership === "Owned" && entry.dimensions.storage === "global" && entry.dimensions.valueCategory === "call");
  const call = universe.legalCases.find((entry) => entry.dimensions.valueCategory === "call" && entry.dimensions.overload === "same_name_same_arity" && entry.dimensions.moduleScope === "imported_module");
  const field = universe.legalCases.find((entry) => entry.dimensions.fieldPath === "ref_boundary_field");
  if (owned === undefined || call === undefined || field === undefined) throw new Error("ledger 用例缺失");
  const firstBase = universe.legalCases[0];
  if (firstBase === undefined) throw new Error("legalCases 为空");
  const firstBaseBundle = buildBaseSemanticSourceBundle(firstBase, grammar);
  const matrix = generatePipelineMatrix("mutation-net-seed");
  const firstProfile = matrix.cases.find((entry): entry is PipelineProfileCase => entry.expected === "accept");
  if (firstProfile === undefined) throw new Error("pipeline matrix 无 accept 用例");
  const firstProfileBundle = buildPipelineProfileSourceBundle(firstProfile, grammar);
  const evidence = latestEvidenceReceipt();
  const anchorDoc = JSON.parse(readFileSync(resolve(HERE, "../fixtures/semantic/toolchain_anchor.json"), "utf8")) as {
    schema: string; driverBytesSha256: string; toolchainManifestSha256: string;
  };
  if (anchorDoc.schema !== "cheng_fusion_toolchain_anchor.v1") {
    throw new Error(`toolchain_anchor.json schema 意外: ${anchorDoc.schema}`);
  }
  const provenanceAnchor: ProvenanceAnchor = {
    driverBytesSha256: anchorDoc.driverBytesSha256,
    toolchainManifestSha256: anchorDoc.toolchainManifestSha256,
  };
  return {
    specBytes, grammar, corpus: {manifest, files}, mapDoc, sourceFiles, receipts, wideReceipt,
    ledgerCases: {owned, call, field},
    ledgers: {owned: buildSemanticContractLedger(owned), call: buildSemanticContractLedger(call), field: buildSemanticContractLedger(field)},
    firstBase, firstBaseBundle, firstProfile, firstProfileBundle,
    evidenceReceiptPath: evidence?.path ?? null,
    evidenceReceipt: evidence?.receipt ?? null,
    provenanceAnchor,
  };
}

// ---------------------------------------------------------------- 变异算子
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** receipt 改字段后重算 receiptSha256(与 item26 remake 同口径, 隔离变量) */
export function rehashReceipt(fields: GrammarParserSpanReceipt): GrammarParserSpanReceipt {
  const {receiptSha256: _dropped, ...rest} = fields;
  return {...rest, receiptSha256: sha256(canonicalJson(rest))};
}

function flipHex(hex: string): string {
  const last = hex.slice(-1);
  const flipped = last === "0" ? "1" : "0";
  return `${hex.slice(0, -1)}${flipped}`;
}

export interface SpanReceiptMutant {
  readonly kind: "span_receipt";
  readonly receipt: GrammarParserSpanReceipt;
}
export interface GrammarContractMutant {
  readonly kind: "grammar_contract";
  readonly staleContract: ChengGrammarObligationContract;
}
export interface CorpusMutant {
  readonly kind: "corpus";
  readonly manifest: CorpusManifest;
  readonly files: ReadonlyMap<string, string>;
  readonly mapDoc: NodeMapDoc;
}
export interface LedgerMutant {
  readonly kind: "ledger";
  readonly testCase: SemanticCase;
  readonly ledger: SemanticContractLedger;
}
export interface BundleMutant {
  readonly kind: "bundle_base" | "bundle_profile";
  readonly bundle: ChengSemanticSourceBundle;
}
export interface EvidenceMutant {
  readonly kind: "evidence";
  readonly receipt: Record<string, unknown>;
}
export type MutantPayload =
  | SpanReceiptMutant
  | GrammarContractMutant
  | CorpusMutant
  | LedgerMutant
  | BundleMutant
  | EvidenceMutant;

export function applyMutant(id: string, bases: MutationBases): MutantPayload {
  const base = bases.receipts[0];
  if (base === undefined) throw new Error("receipts 为空");
  switch (id) {
    case "M-DROP-FIELD": {
      const mutant = clone(base) as unknown as Record<string, unknown>;
      delete mutant["tokenSha256"];
      return {kind: "span_receipt", receipt: mutant as unknown as GrammarParserSpanReceipt};
    }
    case "M-SPAN-SHIFT-REHASH": {
      const wide = bases.wideReceipt;
      return {kind: "span_receipt", receipt: rehashReceipt({...wide, tokenStart: wide.tokenStart + 1})};
    }
    case "M-SPAN-ESCAPE-REHASH": {
      const source = bases.sourceFiles.find((f) => f.relativePath === base.relativePath);
      if (source === undefined) throw new Error("source 缺失");
      const tokenCount = chengPublicTokensWithOffsets(source.source).length;
      return {kind: "span_receipt", receipt: rehashReceipt({...base, tokenEnd: tokenCount + 1})};
    }
    case "M-HASH-SWAP-TOKEN":
      return {kind: "span_receipt", receipt: rehashReceipt({...base, tokenSha256: base.sourceSha256})};
    case "M-BINDING-VARIANT":
      return {kind: "span_receipt", receipt: rehashReceipt({...bases.receipts[1]!, variant: "absent"})};
    case "M-RECEIPT-HASH-BREAK":
      return {kind: "span_receipt", receipt: {...base, parserNodeKind: "TamperedNode"} as GrammarParserSpanReceipt};
    case "M-SOURCE-SHA-DRIFT":
      return {kind: "span_receipt", receipt: rehashReceipt({...base, sourceSha256: flipHex(base.sourceSha256)})};
    case "M-FORGE-PROVENANCE-SHAPE":
      return {kind: "span_receipt", receipt: rehashReceipt({...base, parserNodeKind: ""})};
    case "M-FORGE-PROVENANCE-SELFCONS":
      return {
        kind: "span_receipt",
        receipt: rehashReceipt({
          ...base,
          parserNodeKind: "ForgedNode(attacker)",
          parserNodeIdentitySha256: sha256("attacker:node"),
          parserTraceRootSha256: sha256("attacker:trace"),
          driverBytesSha256: sha256("attacker:driver-bytes"),
          toolchainManifestSha256: sha256("attacker:toolchain-manifest"),
        }),
      };
    case "M-PROVENANCE-TOOLCHAIN-SALT":
      // 真实 receipt 基底(driverBytes 对锚)+ 过期 toolchain 盐: 锚门必须只拒 toolchain 一字段
      return {kind: "span_receipt", receipt: rehashReceipt({
        ...base,
        driverBytesSha256: bases.provenanceAnchor.driverBytesSha256,
        toolchainManifestSha256: sha256("stale:toolchain-manifest:v0"),
      })};
    case "M-STALE-SPEC-SALT":
      return {
        kind: "grammar_contract",
        staleContract: buildChengGrammarObligationContract(Buffer.concat([bases.specBytes, Buffer.from("\n# stale spec salt\n")])),
      };
    case "M-CORPUS-SHA-DRIFT": {
      const manifest = clone(bases.corpus.manifest);
      const entry = manifest.entries[0] as {sourceSha256: string} | undefined;
      if (entry === undefined) throw new Error("corpus entries 为空");
      entry.sourceSha256 = flipHex(entry.sourceSha256);
      return {kind: "corpus", manifest, files: bases.corpus.files, mapDoc: bases.mapDoc};
    }
    case "M-CORPUS-SOURCE-DRIFT": {
      const entry = bases.corpus.manifest.entries[0];
      if (entry === undefined) throw new Error("corpus entries 为空");
      const files = new Map(bases.corpus.files);
      files.set(`${entry.shape}.cheng`, `${files.get(`${entry.shape}.cheng`)!}\nlet mutationNetDrift = 1\n`);
      return {kind: "corpus", manifest: bases.corpus.manifest, files, mapDoc: bases.mapDoc};
    }
    case "M-CORPUS-DROP-COUNT": {
      const manifest = clone(bases.corpus.manifest) as {counts: Record<string, unknown>};
      delete manifest.counts["claims"];
      return {kind: "corpus", manifest: manifest as unknown as CorpusManifest, files: bases.corpus.files, mapDoc: bases.mapDoc};
    }
    case "M-MAP-STATUS-FLIP": {
      const claimed = bases.corpus.manifest.entries[0]?.claims[0];
      if (claimed === undefined) throw new Error("claims 为空");
      const mapDoc = clone(bases.mapDoc);
      const row = mapDoc.rows.find((r) => r.name === claimed.production) as {status: string} | undefined;
      if (row === undefined) throw new Error(`map 行缺失: ${claimed.production}`);
      row.status = "UNMAPPED";
      return {kind: "corpus", manifest: bases.corpus.manifest, files: bases.corpus.files, mapDoc};
    }
    case "M-LEDGER-OWNERSHIP-SWAP":
      return {kind: "ledger", testCase: bases.ledgerCases.owned, ledger: mutateSemanticContractLedger(bases.ledgers.owned, "ownership_swap" as SemanticContractMutation)};
    case "M-LEDGER-CALL-IDENTITY":
      return {kind: "ledger", testCase: bases.ledgerCases.call, ledger: mutateSemanticContractLedger(bases.ledgers.call, "call_identity_swap" as SemanticContractMutation)};
    case "M-LEDGER-FIELD-OFFSET-DROP":
      return {kind: "ledger", testCase: bases.ledgerCases.field, ledger: mutateSemanticContractLedger(bases.ledgers.field, "field_offset_proof_drop" as SemanticContractMutation)};
    case "M-LEDGER-STAGE-OMISSION":
      return {kind: "ledger", testCase: bases.ledgerCases.owned, ledger: mutateSemanticContractLedger(bases.ledgers.owned, "stage_omission" as SemanticContractMutation)};
    case "M-BUNDLE-SOURCE-REPLACE":
      return {kind: "bundle_base", bundle: mutateSourceBundle(bases.firstBaseBundle, "source_bytes_replace" as SourceBundleMutation)};
    case "M-BUNDLE-CASE-SWAP":
      return {kind: "bundle_base", bundle: mutateSourceBundle(bases.firstBaseBundle, "case_binding_swap" as SourceBundleMutation)};
    case "M-BUNDLE-MATERIALIZER-SALT":
      return {kind: "bundle_base", bundle: mutateSourceBundle(bases.firstBaseBundle, "materializer_binding_swap" as SourceBundleMutation)};
    case "M-BUNDLE-GRAMMAR-ROOT-SWAP":
      return {kind: "bundle_base", bundle: mutateSourceBundle(bases.firstBaseBundle, "grammar_root_swap" as SourceBundleMutation)};
    case "M-BUNDLE-AXIS-SPAN-DROP":
      return {kind: "bundle_profile", bundle: mutateSourceBundle(bases.firstProfileBundle, "axis_span_drop" as SourceBundleMutation)};
    case "M-EVIDENCE-SEED-SWAP": {
      if (bases.evidenceReceipt === null) throw new Error("evidence receipt 缺失");
      const receipt = clone(bases.evidenceReceipt) as {hashes: Record<string, string>};
      const seed = receipt.hashes["seedSha256"];
      if (typeof seed !== "string") throw new Error("evidence receipt 缺 seedSha256");
      receipt.hashes["seedSha256"] = flipHex(seed);
      return {kind: "evidence", receipt: receipt as unknown as Record<string, unknown>};
    }
    case "M-EVIDENCE-VERDICT-DROP": {
      if (bases.evidenceReceipt === null) throw new Error("evidence receipt 缺失");
      const receipt = clone(bases.evidenceReceipt) as Record<string, unknown>;
      delete receipt["verdict"];
      return {kind: "evidence", receipt};
    }
    default:
      throw new Error(`未知算子 id: ${id}`);
  }
}

/** 台账 ↔ 实现覆盖对齐: 每个破坏性算子必须有实现, 每个实现必须登记 */
export const IMPLEMENTED_MUTANT_IDS = [
  "M-DROP-FIELD", "M-SPAN-SHIFT-REHASH", "M-SPAN-ESCAPE-REHASH", "M-HASH-SWAP-TOKEN",
  "M-BINDING-VARIANT", "M-RECEIPT-HASH-BREAK", "M-SOURCE-SHA-DRIFT",
  "M-FORGE-PROVENANCE-SHAPE", "M-FORGE-PROVENANCE-SELFCONS", "M-PROVENANCE-TOOLCHAIN-SALT",
  "M-STALE-SPEC-SALT",
  "M-CORPUS-SHA-DRIFT", "M-CORPUS-SOURCE-DRIFT", "M-CORPUS-DROP-COUNT", "M-MAP-STATUS-FLIP",
  "M-LEDGER-OWNERSHIP-SWAP", "M-LEDGER-CALL-IDENTITY", "M-LEDGER-FIELD-OFFSET-DROP", "M-LEDGER-STAGE-OMISSION",
  "M-BUNDLE-SOURCE-REPLACE", "M-BUNDLE-CASE-SWAP", "M-BUNDLE-MATERIALIZER-SALT", "M-BUNDLE-GRAMMAR-ROOT-SWAP",
  "M-BUNDLE-AXIS-SPAN-DROP",
  "M-EVIDENCE-SEED-SWAP", "M-EVIDENCE-VERDICT-DROP",
] as const;

function main() {
  if (!process.argv.includes("--check")) {
    console.error("用法: bun tools/mutation_net_gen.ts --check");
    process.exit(2);
  }
  const table = loadMutantTable();
  const destructive = table.operators.filter((op) => op.class === "destructive");
  const preservative = table.operators.filter((op) => op.class === "preservative");
  const implemented = new Set<string>(IMPLEMENTED_MUTANT_IDS);
  for (const op of destructive) {
    if (!implemented.has(op.id)) throw new Error(`台账已登记但无实现: ${op.id}`);
  }
  for (const id of implemented) {
    if (!destructive.some((op) => op.id === id)) throw new Error(`有实现但台账未登记: ${id}`);
  }
  const contracted = destructive.filter((op) => op.killContract.gate !== "none");
  const gapped = destructive.filter((op) => op.killContract.gate === "none");
  console.log(`[mutation_net_gen] --check 通过: 破坏性=${destructive.length}(有 kill 契约=${contracted.length}, 登记缺口=${gapped.length}), 保持类=${preservative.length}, 缺口=${Object.keys(table.gapRegistry).length}`);
}

if (process.argv[1]?.endsWith("mutation_net_gen.ts")) main();
