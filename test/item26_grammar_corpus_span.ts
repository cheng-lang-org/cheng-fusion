#!/usr/bin/env bun
// item26: 966 parser receipt 消费半套自检(语料生成器 + span 校验器 + lint 自测)。
//
// [A] 语料: buildCorpus 内存重建与磁盘逐字节一致; 666 claims 全部指向合同 required
//     obligation; mapStatus 与 ebnf_parser_node_map.json 一致; blocked=6 全部未被 claim
//     且各带仲裁 disposition(no-pointer 门禁排除/表面不可写)+ spec 证据;
//     每个 source 过 lint、token 数与 m9024 lint 回执一致(token 模型平价锚);
//     每个 source 的 evidence(has 下限/lacks 为零)成立。
// [B] span 校验器: 合成 receipt 正例过(bindDriverReceipts → m9024 权威回执,
//     witnessedRequiredCount 精确); 四负例拒: span-only 伪造(GSR07/ provenance missing)、
//     span 错位(GSR06/ token bytes changed)、obligation 哈希漂移(GSR03/ binding mismatch)、
//     receipt 自洽 hash 破坏(GSR02/ identity mismatch)。
// [C] lint 自测(二元/前缀口径): 二元 `*`/`&` 合法放行(term/bitwiseAnd 臂可写);
//     前缀解引用 `*p`、取址 `&x`、指针成员 `p->f`、指针类型 `int32*`、关键字后 `return *p`
//     仍按 M9024_L03/L04 拒绝(no-pointer 生产门禁的公开表面镜像)。
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";
import {buildCorpus} from "../tools/grammar_corpus_gen.ts";
import {
  charSpanToTokenSpan,
  chengPublicTokensLocal,
  chengPublicTokensWithOffsets,
  makeSyntheticReceipt,
  preflightParserSpanReceipts,
  bindDriverReceipts,
  receiptsToWitnesses,
} from "../tools/grammar_span_receipt.ts";
import {
  buildChengGrammarObligationContract,
  buildGrammarSourceCoverageReceipt,
  lintChengPublicSource,
  type GrammarParserSpanReceipt,
} from "../src/cheng_semantic_pipeline_matrix_m9024.ts";
import {canonicalJson, sha256} from "../src/cheng_semantic_matrix_m9023.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = process.env.CHENG_FORMAL_SPEC_PATH ?? "/Users/lbcheng/cheng-lang/docs/cheng-formal-spec.md";
const CORPUS_DIR = resolve(HERE, "../fixtures/semantic/grammar_corpus");
const MAP_PATH = resolve(HERE, "../fixtures/semantic/ebnf_parser_node_map.json");

function main() {
  // ---------- [A] 语料 ----------
  const {manifest, files} = buildCorpus();
  for (const [name, content] of files) {
    const disk = readFileSync(resolve(CORPUS_DIR, name), "utf8");
    assert.equal(disk, content, `corpus 文件漂移: ${name}(先跑 bun tools/grammar_corpus_gen.ts)`);
  }
  const grammar = buildChengGrammarObligationContract(readFileSync(SPEC_PATH));
  assert.equal(manifest.spec.formalSpecSha256, grammar.formalSpecSha256, "corpus 未绑当前 spec");

  const requiredIds = new Set(grammar.obligations.filter((o) => o.disposition === "required").map((o) => o.obligationId));
  const mapDoc = JSON.parse(readFileSync(MAP_PATH, "utf8")) as {rows: {name: string; status: string}[]};
  const statusByProd = new Map(mapDoc.rows.map((r) => [r.name, r.status]));

  let claimCount = 0;
  const claimIds = new Set<string>();
  for (const entry of manifest.entries) {
    const source = files.get(`${entry.shape}.cheng`);
    assert.ok(source !== undefined, `entry ${entry.shape} 无源`);
    // lint + token 平价
    const lint = lintChengPublicSource(source);
    assert.ok(lint.passed, `entry ${entry.shape} 未过 lint: ${lint.violations.join(",")}`);
    assert.equal(chengPublicTokensLocal(source).length, lint.tokenCount,
      `entry ${entry.shape} token 数与 m9024 lint 不一致(移植漂移)`);
    assert.equal(entry.lintTokenCount, lint.tokenCount, `entry ${entry.shape} manifest tokenCount 漂移`);
    assert.equal(entry.sourceSha256, sha256(source), `entry ${entry.shape} sourceSha256 漂移`);
    // evidence
    const tokens = chengPublicTokensLocal(source);
    const countOf = (needle: string) => tokens.filter((t) => t === needle).length;
    for (const [needle, min] of Object.entries(entry.evidence.has)) {
      assert.ok(countOf(needle) >= min, `entry ${entry.shape} evidence.has ${needle}: ${countOf(needle)} < ${min}`);
    }
    for (const needle of entry.evidence.lacks) {
      assert.equal(countOf(needle), 0, `entry ${entry.shape} evidence.lacks ${needle} 违规出现`);
    }
    // claims 合法性
    for (const claim of entry.claims) {
      claimCount += 1;
      assert.ok(requiredIds.has(claim.obligationId), `claim 指向非 required obligation: ${claim.obligationId}`);
      assert.ok(!claimIds.has(claim.obligationId), `claim 重复: ${claim.obligationId}`);
      claimIds.add(claim.obligationId);
      assert.equal(statusByProd.get(claim.production), claim.mapStatus,
        `claim ${claim.production} mapStatus 与映射表不一致`);
    }
  }
  assert.equal(claimCount, manifest.counts.claims, "claims 汇总不一致");
  assert.equal(claimCount + manifest.blocked.length, manifest.counts.coveredRequiredObligations,
    "claims+blocked 必须等于 covered required 总数");
  for (const b of manifest.blocked) {
    assert.ok(requiredIds.has(b.obligationId), `blocked 指向非 required: ${b.obligationId}`);
    assert.ok(!claimIds.has(b.obligationId), `blocked 与 claim 冲突: ${b.obligationId}`);
    assert.ok(b.disposition === "excluded_no_pointer_public_gate" || b.disposition === "excluded_surface_unwritable",
      `blocked ${b.obligationId} 缺仲裁 disposition`);
    assert.ok(Array.isArray(b.evidence) && b.evidence.length > 0, `blocked ${b.obligationId} 缺 spec 证据`);
  }
  // 覆盖投影: 85 covered production 的 required obligation 全集 = claims ∪ blocked
  const coveredNames = new Set(mapDoc.rows.filter((r) => r.status !== "UNMAPPED").map((r) => r.name));
  const coveredRequired = grammar.obligations.filter((o) => o.disposition === "required" && coveredNames.has(o.production));
  assert.equal(coveredRequired.length, manifest.counts.coveredRequiredObligations, "covered required 计数不一致");
  for (const o of coveredRequired) {
    assert.ok(claimIds.has(o.obligationId) || manifest.blocked.some((b) => b.obligationId === o.obligationId),
      `covered obligation 无 claim 且无 blocked: ${o.production}/${o.kind}/${o.structuralPath}/${o.variant}`);
  }
  // 每 obligation 类的命中 production 集非空且 ⊆ covered
  for (const kind of ["production", "choice", "optional", "repetition", "recursion"]) {
    const list = manifest.hitProductionsByKind[kind];
    assert.ok(Array.isArray(list) && list.length > 0, `hitProductionsByKind.${kind} 为空`);
    for (const name of list) assert.ok(coveredNames.has(name), `hit 集越界: ${kind}/${name}`);
  }
  console.log(`[item26][A] sources=${manifest.counts.sources} claims=${claimCount} blocked=${manifest.blocked.length} covered=${coveredRequired.length} 完备`);

  // ---------- [B] span 校验器 ----------
  const sourceFiles = manifest.entries.map((entry) => ({
    relativePath: entry.relativePath,
    source: files.get(`${entry.shape}.cheng`)!,
  }));
  const findClaim = (production: string, kind: string, variant: string) => {
    for (const entry of manifest.entries) {
      for (const claim of entry.claims) {
        if (claim.production === production && claim.kind === kind && claim.variant === variant) {
          return {entry, claim};
        }
      }
    }
    throw new Error(`claim 未找到: ${production}/${kind}/${variant}`);
  };
  // 正例: 5 个不同类 obligation 各一条合成 receipt
  const positives = [
    {production: "equality", kind: "production", variant: "root", needle: "="},
    {production: "ifStmt", kind: "optional", variant: "present", needle: "else"},
    {production: "logicalOr", kind: "repetition", variant: "bounded_max", needle: "||"},
    {production: "fnDecl", kind: "choice", variant: "alternative_0", needle: "fn"},
    {production: "expression", kind: "recursion", variant: "bounded_depth", needle: "("},
  ];
  const receipts: GrammarParserSpanReceipt[] = [];
  for (const p of positives) {
    const {entry, claim} = findClaim(p.production, p.kind, p.variant);
    const source = files.get(`${entry.shape}.cheng`)!;
    const offsets = chengPublicTokensWithOffsets(source);
    const hit = offsets.find((t) => t.text === p.needle);
    assert.ok(hit !== undefined, `${entry.shape} 缺 token ${p.needle}`);
    receipts.push(makeSyntheticReceipt(claim, entry.relativePath, source, hit.start, hit.end));
  }
  const preflightOk = preflightParserSpanReceipts(grammar, receipts, sourceFiles);
  assert.deepEqual(preflightOk, [], `正例 preflight 应无 issue: ${JSON.stringify(preflightOk)}`);
  const bound = bindDriverReceipts(grammar, receipts, sourceFiles);
  assert.equal(bound.issues.length, 0, "bindDriverReceipts 正例应零 issue");
  assert.ok(bound.coverage !== null, "bindDriverReceipts 未产覆盖回执");
  assert.equal(bound.coverage.witnessedRequiredCount, receipts.length, "权威回执见证数不符");
  assert.equal(bound.coverage.missingRequiredCount, grammar.requiredCount - receipts.length, "缺失数不符");
  assert.equal(bound.coverage.status, "red_required_source_witnesses_missing",
    "全 966 未齐前必须保持 red(不得假绿)");
  console.log(`[item26][B+] 正例 ${receipts.length} 条合成 receipt 过权威回执(witnessed=${bound.coverage.witnessedRequiredCount})`);

  // 负例 1: span-only 伪造(parserNodeKind 空, provenance 无)
  const remake = (fields: GrammarParserSpanReceipt): GrammarParserSpanReceipt => {
    const {receiptSha256: _dropped, ...rest} = fields;
    return {...rest, receiptSha256: sha256(canonicalJson(rest))};
  };
  const forgedReceipt = remake({...receipts[0]!, parserNodeKind: ""});
  const issues1 = preflightParserSpanReceipts(grammar, [forgedReceipt], sourceFiles);
  assert.ok(issues1.some((i) => i.code === "GSR07_PROVENANCE"), `负例1 应报 GSR07: ${JSON.stringify(issues1)}`);
  assert.throws(
    () => buildGrammarSourceCoverageReceipt(grammar, receiptsToWitnesses([forgedReceipt]), sourceFiles),
    /provenance missing/,
    "负例1 权威门禁必须拒",
  );
  // 负例 2: span 错位(tokenStart+1, tokenSha256 不变; receiptSha256 重算以隔离变量)
  const srcEq = files.get("expr_ops.cheng")!;
  const offsEq = chengPublicTokensWithOffsets(srcEq);
  const eqIdx = offsEq.findIndex((t) => t.text === "=");
  assert.ok(eqIdx > 0 && eqIdx + 3 < offsEq.length, "expr_ops 源结构异常");
  const claimEq = positives[0]!;
  const {entry: entryEq, claim: claimEqO} = findClaim(claimEq.production, claimEq.kind, claimEq.variant);
  const wideReceipt = makeSyntheticReceipt(claimEqO, entryEq.relativePath, srcEq,
    offsEq[eqIdx - 1]!.start, offsEq[eqIdx + 3]!.end);
  const shiftedReceipt = remake({...wideReceipt, tokenStart: wideReceipt.tokenStart + 1});
  const issues2 = preflightParserSpanReceipts(grammar, [shiftedReceipt], sourceFiles);
  assert.ok(issues2.some((i) => i.code === "GSR06_TOKEN_HASH"), `负例2 应报 GSR06: ${JSON.stringify(issues2)}`);
  assert.throws(
    () => buildGrammarSourceCoverageReceipt(grammar, receiptsToWitnesses([shiftedReceipt]), sourceFiles),
    /token bytes changed/,
    "负例2 权威门禁必须拒",
  );
  // 负例 3: obligation 绑定漂移(variant 改动 + receiptSha256 重算 — 自洽但绑错)
  const driftedReceipt = remake({...receipts[1]!, variant: "absent"});
  const issues3 = preflightParserSpanReceipts(grammar, [driftedReceipt], sourceFiles);
  assert.ok(issues3.some((i) => i.code === "GSR03_OBLIGATION_BINDING"), `负例3 应报 GSR03: ${JSON.stringify(issues3)}`);
  assert.throws(
    () => buildGrammarSourceCoverageReceipt(grammar, receiptsToWitnesses([driftedReceipt]), sourceFiles),
    /obligation binding mismatch/,
    "负例3 权威门禁必须拒",
  );
  // 负例 4: receipt 自洽 hash 破坏(改 parserNodeKind 但不重算 receiptSha256)
  const brokenHash = {...receipts[0]!, parserNodeKind: "TamperedNode"} as GrammarParserSpanReceipt;
  const issues4 = preflightParserSpanReceipts(grammar, [brokenHash], sourceFiles);
  assert.ok(issues4.some((i) => i.code === "GSR02_RECEIPT_HASH"), `负例4 应报 GSR02: ${JSON.stringify(issues4)}`);
  assert.throws(
    () => buildGrammarSourceCoverageReceipt(grammar, receiptsToWitnesses([brokenHash]), sourceFiles),
    /identity mismatch/,
    "负例4 权威门禁必须拒",
  );
  console.log("[item26][B-] 负例×4 全部按预期拒绝(GSR07/GSR06/GSR03/GSR02 + 权威门禁对应抛错)");

  // charSpanToTokenSpan 边界纪律
  const src0 = files.get("expr_ops.cheng")!;
  const firstEq = chengPublicTokensWithOffsets(src0).find((t) => t.text === "||")!;
  const span = charSpanToTokenSpan(src0, firstEq.start, firstEq.end);
  assert.equal(chengPublicTokensLocal(src0)[span.tokenStart], "||", "char→token 换算错位");
  assert.throws(() => charSpanToTokenSpan(src0, firstEq.start + 1, firstEq.end), /未落在 token 边界/,
    "非边界 char span 必须 hard-fail");

  // ---------- [C] lint 自测(二元放行 / 前缀仍禁) ----------
  const lintPositives: string[] = [
    "fn f(a: int32, b: int32): int32 = a * b\n",   // term `*` 臂(二元乘法)
    "let bw = a & b\n",                             // bitwiseAnd 重复 one(二元按位与)
    "let chain = a & a & a & a & a & a & a & a & a\n", // bitwiseAnd 重复 bounded_max
    "let neg = a * -b\n",                           // 二元 `*` 右操作数带一元前缀
  ];
  for (const src of lintPositives) {
    const receipt = lintChengPublicSource(src);
    assert.ok(receipt.passed, `二元 * / & 合法形必须放行: ${JSON.stringify(src)} → ${receipt.violations.join(",")}`);
  }
  const lintNegatives: [string, string][] = [
    ["let z = *p\n", "M9024_L04"],                       // 前缀解引用
    ["let w = &x\n", "M9024_L03"],                       // 前缀取址
    ["let v = p->f\n", "M9024_L03"],                     // 指针成员访问
    ["fn f(p: int32*): int32 = 1\n", "M9024_L04"],       // 指针类型位置
    ["fn f(): int32 =\n    return *p\n", "M9024_L04"],   // 表达式关键字后的解引用
    ["fn f(): int32 =\n    return &x\n", "M9024_L03"],   // 表达式关键字后的取址
  ];
  for (const [src, code] of lintNegatives) {
    const receipt = lintChengPublicSource(src);
    assert.ok(!receipt.passed, `no-pointer 禁用形必须拒绝: ${JSON.stringify(src)}`);
    assert.ok(receipt.violations.some((v) => v.startsWith(code)),
      `违规码 ${code} 缺失: ${JSON.stringify(src)} → ${receipt.violations.join(",")}`);
  }
  console.log(`[item26][C] lint 自测: 二元 */& 正例×${lintPositives.length} 放行, 前缀/指针型负例×${lintNegatives.length} 全拒`);
  console.log("[item26] 全部通过");
}

main();
