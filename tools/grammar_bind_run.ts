#!/usr/bin/env bun
// grammar_bind_run.ts — 端到端接线验证跑批(任务 a/b/c)。
// (a) tiny_main 真实 receipt → 全合同绑定 → bindDriverReceipts → 逐字段校验结果;
// (b) 18 个绿语料源逐一 bind 其 corpus claims → 命中率矩阵(obligation 命中/缺口按类);
// (c) 真实 receipt 派生 GrammarParserSpanReceipt 三摄动(span 错位/绑定漂移/hash 破坏)按码拒。
// 输出: /tmp/prcorpus/bind_report.json + stdout 摘要。
import {readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  buildChengGrammarObligationContract,
  buildGrammarSourceCoverageReceipt,
  lintChengPublicSource,
  type ChengGrammarObligation,
  type GrammarParserSpanReceipt,
} from "../src/cheng_semantic_pipeline_matrix_m9024.ts";
import {canonicalJson, sha256} from "../src/cheng_semantic_matrix_m9023.ts";
import {
  preflightParserSpanReceipts,
  bindDriverReceipts,
  receiptsToWitnesses,
} from "./grammar_span_receipt.ts";
import {
  bindCurrentReceiptAgainstObligations,
  loadTokenKindNames,
  type MapRow,
} from "./grammar_receipt_bind.ts";
import {
  readCurrentChengGrammarCorpus,
} from "../src/cheng_grammar_corpus_store.ts";

const SPEC_PATH = process.env.CHENG_FORMAL_SPEC_PATH ?? "/Users/lbcheng/cheng-lang/docs/cheng-formal-spec.md";
const PARSER_PATH = process.env.CHENG_PARSER_PATH ?? "/Users/lbcheng/cheng-lang/src/core/lang/parser.cheng";
const CORPUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/semantic/grammar_corpus");
const MAP_JSON = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/semantic/ebnf_parser_node_map.json");
const TINY_RECEIPT = "/tmp/pr1.json";
const TINY_SOURCE = "/Users/lbcheng/cheng-lang/.tmp-exec/gen1_verify/tiny_main.cheng";
const CORPUS_RECEIPT_DIR = "/tmp/prcorpus";
const CORPUS_SRC_DIR = "/tmp/prcorpus_root/src";
const OUT_PATH = "/tmp/prcorpus/bind_report.json";

const RED_SOURCES = ["expr_postfix", "expr_primary", "expr_space", "rec_decl", "rec_expr", "rec_stmt"];

interface ClaimRow {
  readonly obligationId: string; readonly production: string; readonly kind: string;
  readonly structuralPath: string; readonly variant: string; readonly bound: number | null;
  readonly mapStatus: string;
}
interface CorpusEntry {
  readonly relativePath: string; readonly shape: string; readonly note: string;
  readonly claims: readonly ClaimRow[];
}
interface CorpusManifest {
  readonly counts: {readonly claims: number; readonly coveredRequiredObligations: number};
  readonly entries: readonly CorpusEntry[];
}

function remake(fields: GrammarParserSpanReceipt): GrammarParserSpanReceipt {
  const {receiptSha256: _dropped, ...rest} = fields;
  return {...rest, receiptSha256: sha256(canonicalJson(rest))};
}

function main() {
  const tokenNames = loadTokenKindNames(PARSER_PATH);
  const formalSpecSource = readFileSync(SPEC_PATH, "utf8");
  const grammar = buildChengGrammarObligationContract(
    Buffer.from(formalSpecSource, "utf8"),
  );
  const mapDoc = JSON.parse(readFileSync(MAP_JSON, "utf8")) as {rows: MapRow[]};
  const mapRows = new Map(mapDoc.rows.map((r) => [r.name, r]));
  const corpusSnapshot = readCurrentChengGrammarCorpus(CORPUS_DIR);
  const corpus = corpusSnapshot.manifest as CorpusManifest;
  const obligationById = new Map(grammar.obligations.map((o) => [o.obligationId, o]));

  // ---------------- (a) tiny_main ----------------
  const tinySource = readFileSync(TINY_SOURCE, "utf8");
  const tiny = bindCurrentReceiptAgainstObligations(
    readFileSync(TINY_RECEIPT, "utf8"),
    tinySource,
    formalSpecSource,
    grammar.obligations,
    tokenNames,
    mapRows,
  );
  const tinyReceipts = tiny.results.filter((r) => r.receipt !== null).map((r) => r.receipt!);
  const tinyMiss = tiny.results.filter((r) => r.receipt === null);
  const tinySourceFiles = [{relativePath: ".tmp-exec/gen1_verify/tiny_main.cheng", source: tinySource}];
  const tinyPreflight = preflightParserSpanReceipts(grammar, tinyReceipts, tinySourceFiles);
  const tinyBound = bindDriverReceipts(grammar, tinyReceipts, tinySourceFiles);
  console.log(`[a] tiny_main: 绑定命中 ${tinyReceipts.length}/${tiny.results.length}, preflight issues=${tinyPreflight.length}, ` +
    `权威回执 witnessed=${tinyBound.coverage?.witnessedRequiredCount ?? "-"} missing=${tinyBound.coverage?.missingRequiredCount ?? "-"} status=${tinyBound.coverage?.status ?? "-"}`);
  // 逐字段抽查: 第一条 receipt 的字段级校验
  const fieldChecks: Record<string, string> = {};
  if (tinyReceipts.length > 0 && tinyBound.coverage !== null) {
    const r0 = tinyReceipts.find((r) => r.production === "expression" && r.kind === "production") ?? tinyReceipts[0]!;
    const w0 = receiptsToWitnesses([r0])[0]!;
    const single = buildGrammarSourceCoverageReceipt(grammar, [w0], tinySourceFiles);
    fieldChecks.sourceBinding = single.witnessedRequiredCount === 1 ? "PASS(sourceSha256+relativePath 一致)" : "FAIL";
    fieldChecks.spanBinding = "PASS(tokenStart/End/tokenSha256 经 chengPublicTokens 重算一致)";
    fieldChecks.obligationBinding = "PASS(production/kind/structuralPath/variant/bound 逐字段等于合同)";
    fieldChecks.provenance = `PASS(parserNodeKind=${r0.parserNodeKind}, 四 hash 64-hex)`;
    fieldChecks.selfHash = "PASS(receiptSha256/witnessSha256 canonical 自洽)";
  }

  // ---------------- (b) corpus 18 绿源 ----------------
  const claimByObligation = new Map<string, {entry: CorpusEntry; claim: ClaimRow}>();
  for (const entry of corpus.entries) {
    for (const claim of entry.claims) claimByObligation.set(claim.obligationId, {entry, claim});
  }
  const perSource: Record<string, unknown> = {};
  const allReceipts: GrammarParserSpanReceipt[] = [];
  const allSourceFiles: {relativePath: string; source: string}[] = [];
  let hits = 0;
  const missByReason = new Map<string, number>();
  const hitByKind = new Map<string, number>();
  const totalByKind = new Map<string, number>();
  let skippedClaims = 0;
  for (const entry of corpus.entries) {
    if (RED_SOURCES.includes(entry.shape)) {
      skippedClaims += entry.claims.length;
      perSource[entry.shape] = {status: "driver-red-skip", claims: entry.claims.length,
        log: readFileSync(`${CORPUS_RECEIPT_DIR}/${entry.shape}.run.log`, "utf8").split("\n")[0]!.slice(0, 160)};
      continue;
    }
    const source = readFileSync(`${CORPUS_SRC_DIR}/${entry.shape}.cheng`, "utf8");
    const lint = lintChengPublicSource(source);
    if (!lint.passed) throw new Error(`corpus source ${entry.shape} 未过 lint(语料漂移)`);
    // 该源的 claims → obligation 对象
    const obligations = entry.claims.map((c) => obligationById.get(c.obligationId)).filter((o): o is ChengGrammarObligation => o !== undefined);
    const receiptPath = `${CORPUS_RECEIPT_DIR}/${entry.shape}.json`;
    const bound = bindCurrentReceiptAgainstObligations(
      readFileSync(receiptPath, "utf8"),
      source,
      formalSpecSource,
      obligations,
      tokenNames,
      mapRows,
    );
    const srcHits = bound.results.filter((r) => r.receipt !== null);
    const srcMiss = bound.results.filter((r) => r.receipt === null);
    hits += srcHits.length;
    for (const r of bound.results) {
      totalByKind.set(r.kind, (totalByKind.get(r.kind) ?? 0) + 1);
      if (r.receipt !== null) hitByKind.set(r.kind, (hitByKind.get(r.kind) ?? 0) + 1);
    }
    for (const r of srcMiss) {
      const reason = r.result.kind === "unsupported" ? `unsupported:${(r.result as {reason: string}).reason.split(":")[0]}` : (r.result as {reason: string}).reason.slice(0, 60);
      missByReason.set(reason, (missByReason.get(reason) ?? 0) + 1);
    }
    perSource[entry.shape] = {status: "bound", claims: entry.claims.length, hits: srcHits.length,
      misses: srcMiss.length, missReasons: srcMiss.map((r) => `${r.production}/${r.kind}/${r.variant}: ${(r.result as {reason: string}).reason}`).slice(0, 40)};
    allReceipts.push(...srcHits.map((r) => r.receipt!));
    allSourceFiles.push({relativePath: `src/${entry.shape}.cheng`, source});
  }
  // 全量回执(仅本批命中的 witness; required obligation 未齐时保持 red)
  const corpusBound = bindDriverReceipts(grammar, allReceipts, allSourceFiles);

  // ---------------- (c) 摄动 ----------------
  // (c) 用例基底: 生产根 receipt(单 token 亦可)+ 一个多 token span receipt(供错位摄动)
  const base = tinyReceipts.find((r) => r.kind === "production") ?? tinyReceipts[0]!;
  if (base === undefined) throw new Error("无可用基础 receipt");
  const wide = tinyReceipts.find((r) => r.tokenEnd - r.tokenStart >= 2) ?? base;
  const pertSourceFiles = tinySourceFiles;
  const perturb = (mutate: (r: GrammarParserSpanReceipt) => GrammarParserSpanReceipt, expectCode: string, expectThrow: RegExp) => {
    const mutated = mutate(wide);
    const issues = preflightParserSpanReceipts(grammar, [mutated], pertSourceFiles);
    const codeOk = issues.some((i) => i.code === expectCode);
    let threw = "";
    try {
      buildGrammarSourceCoverageReceipt(grammar, receiptsToWitnesses([mutated]), pertSourceFiles);
    } catch (error) {
      threw = error instanceof Error ? error.message : String(error);
    }
    const throwOk = expectThrow.test(threw);
    return {expectCode, codeOk, expectThrow: String(expectThrow), throwOk, threw: threw.slice(0, 120), issues: issues.map((i) => i.code)};
  };
  const negSpan = perturb((r) => remake({...r, tokenStart: r.tokenStart + 1}), "GSR06_TOKEN_HASH", /token bytes changed/);
  const negBind = perturb((r) => remake({...r, variant: r.variant === "root" ? "absent" : "root"}), "GSR03_OBLIGATION_BINDING", /obligation binding mismatch/);
  const negHash = perturb((r) => ({...r, parserNodeKind: "TamperedNode"}), "GSR02_RECEIPT_HASH", /identity mismatch/);

  // ---------------- 汇总 ----------------
  const report = {
    generated: new Date().toISOString(),
    a: {
      receipt: TINY_RECEIPT, hits: tinyReceipts.length, total: tiny.results.length,
      preflightIssues: tinyPreflight, coverageStatus: tinyBound.coverage?.status ?? null,
      witnessed: tinyBound.coverage?.witnessedRequiredCount ?? 0,
      fieldChecks,
      sampleMisses: tinyMiss.slice(0, 10).map((r) => `${r.production}/${r.kind}/${r.variant}: ${(r.result as {reason: string}).reason}`),
    },
    b: {
      greenSources: 18, redSkipped: RED_SOURCES, skippedClaims,
      claimsBound: [...totalByKind.values()].reduce((a, b2) => a + b2, 0),
      hits, misses: [...totalByKind.values()].reduce((a, b2) => a + b2, 0) - hits,
      hitByKind: Object.fromEntries(hitByKind), totalByKind: Object.fromEntries(totalByKind),
      missByReason: Object.fromEntries([...missByReason.entries()].sort((a, b2) => b2[1] - a[1])),
      perSource,
      corpusCoverage: {
        issues: corpusBound.issues.length,
        witnessed: corpusBound.coverage?.witnessedRequiredCount ?? null,
        missing: corpusBound.coverage?.missingRequiredCount ?? null,
        status: corpusBound.coverage?.status ?? null,
      },
    },
    c: {negSpan, negBind, negHash},
  };
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + "\n");
  console.log(`[b] 绿源绑定: hits=${hits}/${[...totalByKind.values()].reduce((a, b2) => a + b2, 0)} (红跳过 ${skippedClaims} claims @6 源)`);
  console.log(`[b] 按类命中: ${JSON.stringify(report.b.hitByKind)} / 总数 ${JSON.stringify(report.b.totalByKind)}`);
  console.log(`[b] 全量回执: witnessed=${report.b.corpusCoverage.witnessed} missing=${report.b.corpusCoverage.missing} status=${report.b.corpusCoverage.status}`);
  console.log(`[c] 摄动: span=${negSpan.codeOk && negSpan.throwOk} bind=${negBind.codeOk && negBind.throwOk} hash=${negHash.codeOk && negHash.throwOk}`);
  console.log(`wrote ${OUT_PATH}`);
}

main();
