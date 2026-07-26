#!/usr/bin/env bun
// item26: parser receipt 消费闭环自检(语料生成器 + span 校验器 + lint 自测)。
//
// [A] 语料: buildCorpus 内存重建与磁盘逐字节一致; claims 全部指向合同 required
//     obligation; mapStatus 与 ebnf_parser_node_map.json 一致; 不存在人工 BLOCKED;
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
import {
  buildCorpus,
  buildCurrentSourcePlan,
  currentSourcePlanMismatches,
} from "../tools/grammar_corpus_gen.ts";
import {
  canonicalParserTokenSpanFromReceipt,
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
import {
  readCurrentChengGrammarCorpus,
} from "../src/cheng_grammar_corpus_store.ts";
import {
  validateCurrentUnwitnessedEbnfParserNodeMap,
} from "../src/cheng_ebnf_parser_node_map.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = process.env.CHENG_FORMAL_SPEC_PATH ?? "/Users/lbcheng/cheng-lang/docs/cheng-formal-spec.md";
const PARSER_PATH = process.env.CHENG_PARSER_PATH ?? "/Users/lbcheng/cheng-lang/src/core/lang/parser.cheng";
const RECEIPT_PRODUCER_PATH = process.env.CHENG_PARSER_RECEIPT_PRODUCER_PATH ??
  "/Users/lbcheng/cheng-lang/src/core/tooling/compiler_parser_receipt.cheng";
const CORPUS_DIR = resolve(HERE, "../fixtures/semantic/grammar_corpus");
const MAP_PATH = resolve(HERE, "../fixtures/semantic/ebnf_parser_node_map.json");
const PRODUCTION_RECEIPT_PATH = resolve(
  HERE,
  "../fixtures/semantic/annotation_parser_receipt.json",
);

function main() {
  // ---------- [A] 语料 ----------
  const {manifest, files} = buildCorpus();
  const currentCorpus = readCurrentChengGrammarCorpus(CORPUS_DIR);
  assert.equal(manifest.schema, "cheng_grammar_witness_corpus");
  assert.doesNotMatch(manifest.schema, /\.v[0-9]+$/);
  for (const [name, content] of files) {
    const disk = currentCorpus.files.get(name)?.toString("utf8");
    assert.equal(disk, content, `corpus 文件漂移: ${name}(先跑 bun tools/grammar_corpus_gen.ts)`);
  }
  const specBytes = readFileSync(SPEC_PATH);
  const specText = specBytes.toString("utf8");
  const parserBytes = readFileSync(PARSER_PATH);
  const producerClaimsBytes = readFileSync(
    resolve(
      HERE,
      "../fixtures/semantic/ebnf_parser_producer_claims.json",
    ),
  );
  const grammar = buildChengGrammarObligationContract(specBytes);
  assert.equal(manifest.spec.formalSpecSha256, grammar.formalSpecSha256, "corpus 未绑当前 spec");

  const requiredIds = new Set(grammar.obligations.filter((o) => o.disposition === "required").map((o) => o.obligationId));
  const mapBytes = readFileSync(MAP_PATH);
  const currentUnwitnessedMap =
    validateCurrentUnwitnessedEbnfParserNodeMap(
      mapBytes,
      specBytes,
      parserBytes,
      producerClaimsBytes,
    );
  const mapDoc = JSON.parse(mapBytes.toString("utf8")) as {
    receiptEvidence: {
      inputCount: number;
      acceptedCount: number;
      rejectedCount: number;
      rows: unknown[];
    };
    counts: {
      total: number;
      MAPPED: number;
      PARTIAL: number;
      UNMAPPED: number;
      requiredObligationCount: number;
      witnessedRequiredCount: number;
      missingRequiredCount: number;
    };
    rows: {
      name: string;
      status: string;
      receipt_ready: boolean;
      required_obligation_count: number;
      witnessed_required_count: number;
      missing_required_count: number;
      missing_required_obligation_ids: string[];
      witness_projections: unknown[];
      witness_receipt_sha256s: string[];
    }[];
  };
  assert.equal(currentCorpus.generationId,
    currentCorpus.generationDirectory.split("/").at(-1));
  assert.deepEqual(
    currentSourcePlanMismatches(
      buildCurrentSourcePlan({
        specBytes,
        parserBytes,
        producerClaimsBytes,
      }).files,
      CORPUS_DIR,
    ),
    [],
    "current generation 未精确投影当前正式 EBNF/parser producer",
  );
  assert.equal(mapDoc.counts.total, 125);
  assert.equal(mapDoc.counts.requiredObligationCount, 971);
  assert.equal(mapDoc.counts.witnessedRequiredCount, 0);
  assert.equal(mapDoc.counts.missingRequiredCount, 971);
  assert.equal(mapDoc.counts.MAPPED, 0);
  assert.equal(mapDoc.counts.PARTIAL, 125);
  assert.equal(mapDoc.counts.UNMAPPED, 0);
  assert.deepEqual(mapDoc.receiptEvidence, {
    inputCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    rows: [],
  });
  assert.ok(
    mapDoc.rows.every((row) =>
      !row.receipt_ready &&
      row.witnessed_required_count === 0 &&
      row.missing_required_count === row.required_obligation_count &&
      row.missing_required_obligation_ids.length ===
        row.required_obligation_count &&
      row.witness_projections.length === 0 &&
      row.witness_receipt_sha256s.length === 0),
    "无真实 parser receipt 时 checked-in map 必须保持 0/971",
  );
  assert.equal(
    currentUnwitnessedMap.counts.missingRequiredCount,
    mapDoc.counts.missingRequiredCount,
  );
  const rowByProd = new Map(mapDoc.rows.map((r) => [r.name, r]));
  const assertReceiptState = (name: string) => {
    const row = rowByProd.get(name);
    assert.ok(row !== undefined, `${name}: 缺 EBNF map row`);
    assert.equal(
      row.receipt_ready,
      row.missing_required_count === 0,
      `${name}: receipt_ready 与 missingRequired 冲突`,
    );
    assert.equal(
      row.status,
      row.receipt_ready ? "MAPPED" : "PARTIAL",
      `${name}: mapStatus 与真实 receipt 闭合状态冲突`,
    );
  };
  for (const name of [
    "annotationArgs",
    "annotationArg",
    "annotationList",
    "annotationDict",
    "annotationEntry",
    "annotationKey",
  ]) {
    assertReceiptState(name);
  }
  for (const name of ["algebraicType", "variantType"]) {
    assertReceiptState(name);
  }
  const annotationCorpus = files.get("anno_args.cheng");
  assert.ok(annotationCorpus !== undefined, "递归 annotation grammar corpus 缺失");
  const annotationTokens = chengPublicTokensLocal(annotationCorpus);
  for (const token of ["@profile", "[", "{", ":", "=", ";"]) {
    assert.ok(annotationTokens.includes(token), `annotation corpus 缺真实语法 token ${token}`);
  }
  const algebraicCorpus = files.get("algebraic_types.cheng");
  assert.ok(algebraicCorpus !== undefined, "algebraic/variant grammar corpus 缺失");
  const algebraicTokens = chengPublicTokensLocal(algebraicCorpus);
  for (const token of ["Only", "Left", "K8", "None", "Empty", "Comma", "Semi", "Many", "Defaulted", "Deep", "|", ",", ";"]) {
    assert.ok(algebraicTokens.includes(token), `algebraic corpus 缺真实语法 token ${token}`);
  }
  const requiredSourceTokens: Record<string, readonly string[]> = {
    "type_shapes.cheng": ["of", "fn", "tuple", "set", "enum", "var", "ref", "object", ".", "?", ";"],
    "pattern_shapes.cheng": ["match", "_", "..", "..<", "Point", "Many", "case", "of", "."],
    "concept_trait_shapes.cheng": ["concept", "trait", "[", "]"],
  };
  for (const [name, expectedTokens] of Object.entries(requiredSourceTokens)) {
    const source = files.get(name);
    assert.ok(source !== undefined, `source-plan 真实 Cheng source 缺失: ${name}`);
    const tokens = chengPublicTokensLocal(source);
    for (const token of expectedTokens) {
      assert.ok(tokens.includes(token), `${name} 缺 source-plan 结构 token ${token}`);
    }
  }
  const moduleHeaderOnlySource = files.get("mod_empty.cheng");
  assert.ok(
    moduleHeaderOnlySource !== undefined,
    "module header-only source 缺失",
  );
  assert.equal(
    moduleHeaderOnlySource,
    "module corpus_empty\n",
    "module topLevelDecl zero 必须使用唯一合法 header-only source",
  );
  assert.deepEqual(
    chengPublicTokensLocal(moduleHeaderOnlySource),
    ["module", "corpus_empty"],
    "module header-only source 必须精确包含 module 与 ident 两个 token",
  );
  const moduleHeaderOnlyEntry = manifest.entries.find(
    (entry) => entry.shape === "mod_empty",
  );
  assert.ok(moduleHeaderOnlyEntry !== undefined, "mod_empty manifest entry 缺失");
  assert.ok(
    moduleHeaderOnlyEntry.claims.some((claim) =>
      claim.production === "module" &&
      claim.kind === "repetition" &&
      claim.structuralPath === "root.sequence3" &&
      claim.variant === "zero"),
    "mod_empty 未绑定 module/root.sequence3 repetition zero obligation",
  );
  const parserSource = readFileSync(PARSER_PATH, "utf8");
  for (const fragment of [
    "regionKind = ParserValueExprRegionModuleHeaderLine",
    "ParserValueExprTokenStartAt(tree, first)",
    "ParserValueExprTokenEndAt(tree, tokenLimit - 1)",
  ]) {
    assert.ok(
      parserSource.includes(fragment),
      `production parser module-header region producer 缺失: ${fragment}`,
    );
  }
  const receiptProducerSource = readFileSync(
    RECEIPT_PRODUCER_PATH,
    "utf8",
  );
  for (const fragment of [
    '\\"regions\\": [',
    '\\"index\\": ',
    '\\"kind\\": \\"',
    '\\"sourceTextId\\": ',
    '\\"spanStart\\": ',
    '\\"spanEnd\\": ',
    '\\"anchorTokenIndex\\": ',
  ]) {
    assert.ok(
      receiptProducerSource.includes(fragment),
      `production receipt region 字段 producer 缺失: ${fragment}`,
    );
  }
  const statementRepetitionSource = files.get("stmt_rep.cheng");
  assert.ok(
    statementRepetitionSource !== undefined,
    "stmt_rep source 缺失",
  );
  assert.ok(
    statementRepetitionSource.includes(
      "\n    case r\n    of 1: r = 1\n",
    ),
    "caseStmt flat caseBranch repetition zero 缺合法单分支 source",
  );
  const statementRepetitionEntry = manifest.entries.find(
    (entry) => entry.shape === "stmt_rep",
  );
  assert.ok(
    statementRepetitionEntry !== undefined,
    "stmt_rep manifest entry 缺失",
  );
  assert.ok(
    statementRepetitionEntry.claims.some((claim) =>
      claim.production === "caseStmt" &&
      claim.kind === "repetition" &&
      claim.structuralPath ===
        "root.sequence3.group0.choice1.sequence1.group0.choice1.sequence1" &&
      claim.variant === "zero"),
    "caseStmt flat repetition zero 未绑定 formal-nullable source claim",
  );

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
      assert.equal(rowByProd.get(claim.production)?.status, claim.mapStatus,
        `claim ${claim.production} mapStatus 与映射表不一致`);
      assert.equal(rowByProd.get(claim.production)?.receipt_ready, claim.receiptReady,
        `claim ${claim.production} receiptReady 与映射表不一致`);
    }
  }
  assert.equal(claimCount, manifest.counts.claims, "claims 汇总不一致");
  assert.equal(manifest.counts.requiredObligationCount, requiredIds.size,
    "正式 EBNF required obligation 总数与权威合同不一致");
  assert.equal(manifest.counts.coveredRequiredObligations, manifest.counts.requiredObligationCount,
    "source-plan 未覆盖全部 required obligation");
  assert.equal(claimCount, manifest.counts.requiredObligationCount,
    "每个 required obligation 必须由且仅由一个真实 Cheng source claim 承接");
  assert.ok(!Object.hasOwn(manifest, "blocked"), "唯一最新版 corpus 禁止保留 blocked 字段");
  assert.ok(!Object.hasOwn(manifest.counts, "blocked"), "唯一最新版 counts 禁止保留 blocked 字段");
  const noPointerSpecLine = "- **禁用指针类型**：`T*`、`void*`、`ref T`、`ptr[T]`。";
  assert.ok(specText.includes(noPointerSpecLine), "正式 no-pointer 禁用指针类型规范行消失");
  assert.match(specText, /refType\s*::=\s*"ref"\s*objectType\s*;/,
    "正式 refType production 漂移");
  for (const production of ["typeExpr", "refType", "objectType"]) {
    assert.ok(
      manifest.entries.some((entry) =>
        entry.claims.some((claim) => claim.production === production)),
      `${production} 缺真实 managed ref object source claim`,
    );
  }
  assert.equal(manifest.counts.requiredObligationCount, mapDoc.counts.requiredObligationCount,
    "corpus 未保留 EBNF map requiredObligationCount");
  assert.equal(manifest.counts.witnessedRequiredCount, mapDoc.counts.witnessedRequiredCount,
    "corpus 未保留 EBNF map witnessedRequiredCount");
  assert.equal(manifest.counts.missingRequiredCount, mapDoc.counts.missingRequiredCount,
    "corpus 未保留 EBNF map missingRequiredCount");
  assert.equal(
    manifest.counts.requiredObligationCount,
    manifest.counts.witnessedRequiredCount + manifest.counts.missingRequiredCount,
    "corpus required=witnessed+missing 守恒失败",
  );
  // Source claim plan 与 parser receipt 是两条独立证据链。当前 receipt_ready
  // 可全 false，但正式 obligation→source claim 仍必须完整生成且不得改写 map。
  const coveredNames = new Set(
    manifest.entries.flatMap((entry) =>
      entry.claims.map((claim) => claim.production)),
  );
  const coveredRequired = grammar.obligations.filter((o) => o.disposition === "required" && coveredNames.has(o.production));
  assert.equal(coveredRequired.length, manifest.counts.coveredRequiredObligations, "covered required 计数不一致");
  for (const o of coveredRequired) {
    assert.ok(claimIds.has(o.obligationId),
      `covered obligation 无 source claim: ${o.production}/${o.kind}/${o.structuralPath}/${o.variant}`);
  }
  // 每 obligation 类的命中 production 集非空且 ⊆ covered
  for (const kind of ["production", "choice", "optional", "repetition", "recursion"]) {
    const list = manifest.hitProductionsByKind[kind];
    assert.ok(Array.isArray(list) && list.length > 0, `hitProductionsByKind.${kind} 为空`);
    for (const name of list) assert.ok(coveredNames.has(name), `hit 集越界: ${kind}/${name}`);
  }
  console.log(`[item26][A] sources=${manifest.counts.sources} claims=${claimCount} covered=${coveredRequired.length} 完备`);

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
    `全 ${grammar.requiredCount} 未齐前必须保持 red(不得假绿)`);
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
  // 负例 2: canonical raw byte span 缩短，tokenSha256 保持原值。
  const srcEq = files.get("expr_ops.cheng")!;
  const offsEq = chengPublicTokensWithOffsets(srcEq);
  const eqIdx = offsEq.findIndex((t) => t.text === "=");
  assert.ok(eqIdx > 0 && eqIdx + 3 < offsEq.length, "expr_ops 源结构异常");
  const claimEq = positives[0]!;
  const {entry: entryEq, claim: claimEqO} = findClaim(claimEq.production, claimEq.kind, claimEq.variant);
  const wideReceipt = makeSyntheticReceipt(claimEqO, entryEq.relativePath, srcEq,
    offsEq[eqIdx - 1]!.start, offsEq[eqIdx + 3]!.end);
  const shiftedReceipt = remake({
    ...wideReceipt,
    spanEndByte: wideReceipt.spanEndByte - 1,
    canonicalTokens: [{
      ...wideReceipt.canonicalTokens[0]!,
      endByte: wideReceipt.spanEndByte - 1,
    }],
  });
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
  // 负例 5: 旧 tokenStart/tokenEnd-only 形态不得兼容读取。
  const legacyShape = {...receipts[0]!} as unknown as Record<string, unknown>;
  delete legacyShape["spanStartByte"];
  delete legacyShape["spanEndByte"];
  delete legacyShape["canonicalTokens"];
  delete legacyShape["receiptSha256"];
  legacyShape["receiptSha256"] = sha256(canonicalJson(legacyShape));
  const legacyReceipt =
    legacyShape as unknown as GrammarParserSpanReceipt;
  const issues5 = preflightParserSpanReceipts(
    grammar,
    [legacyReceipt],
    sourceFiles,
  );
  assert.ok(
    issues5.some((issue) => issue.code === "GSR05_TOKEN_SPAN"),
    `负例5 旧 span-only receipt 应报 GSR05: ${JSON.stringify(issues5)}`,
  );
  assert.throws(
    () => buildGrammarSourceCoverageReceipt(
      grammar,
      receiptsToWitnesses([legacyReceipt]),
      sourceFiles,
    ),
    /canonical parser token span invalid/,
    "负例5 权威门禁必须拒绝旧 receipt 形态",
  );
  console.log("[item26][B-] 负例×5 全部按预期拒绝(GSR07/GSR06/GSR03/GSR02/旧形态GSR05 + 权威门禁对应抛错)");

  // production token byte span 边界纪律
  const src0 = files.get("expr_ops.cheng")!;
  const firstEq = chengPublicTokensWithOffsets(src0).find((t) => t.text === "||")!;
  const logicalOrKindNames: string[] = [];
  logicalOrKindNames[42] = "ParserValueTokenLogicalOr";
  const logicalOrTokens = [{
    index: 0,
    kind: 42,
    sourceTextId: 0,
    start: firstEq.start,
    end: firstEq.end,
  }];
  const span = canonicalParserTokenSpanFromReceipt(
    src0,
    logicalOrTokens,
    logicalOrKindNames,
    firstEq.start,
    firstEq.end,
  );
  assert.equal(span.tokenStart, 0, "production token index 错位");
  assert.throws(
    () => canonicalParserTokenSpanFromReceipt(
      src0,
      logicalOrTokens,
      logicalOrKindNames,
      firstEq.start + 1,
      firstEq.end,
    ),
    /未精确落在 token 边界/,
    "非边界 byte span 必须 hard-fail",
  );

  // 历史 receipt 只能作为 mutation validator 输入；source generation 已变时
  // 必须明确拒绝，不能把旧 token/span 当作 current witness。
  const historicalReceipt = JSON.parse(
    readFileSync(PRODUCTION_RECEIPT_PATH, "utf8"),
  ) as {
    sourceSha256: string;
    sourceTexts: readonly {
      sourceTextId: number;
      sha256: string;
      byteLength: number;
    }[];
    tokens: readonly {
      index: number;
      kind: number;
      sourceTextId: number;
      start: number;
      end: number;
    }[];
  };
  const currentAnnotationSource = files.get("anno_args.cheng")!;
  assert.notEqual(
    historicalReceipt.sourceSha256,
    sha256(currentAnnotationSource),
    "旧 receipt 不得碰巧冒充 current annotation source",
  );
  assert.equal(
    historicalReceipt.sourceTexts[0]?.sha256,
    historicalReceipt.sourceSha256,
    "历史 receipt 自身 source identity 必须保留，供 mutation validator 使用",
  );

  // MULTILINE_STRING 必须由一个真实 String token 的原始 byte span承接。
  const multilineSource = "let doc = \"\"\"\nalpha\nbeta\n\"\"\"\n";
  const multilineBytes = Buffer.from(multilineSource, "utf8");
  const multilineStart = multilineBytes.indexOf(Buffer.from('"""'));
  const multilineEnd = multilineBytes.indexOf(
    Buffer.from('"""'),
    multilineStart + 3,
  ) + 3;
  const stringKindNames: string[] = [];
  stringKindNames[4] = "ParserValueTokenString";
  stringKindNames[5] = "ParserValueTokenChar";
  const multilineToken = {
    index: 0,
    kind: 4,
    sourceTextId: 0,
    start: multilineStart,
    end: multilineEnd,
  };
  const multilineSpan = canonicalParserTokenSpanFromReceipt(
    multilineSource,
    [multilineToken],
    stringKindNames,
    multilineStart,
    multilineEnd,
  );
  assert.equal(
    multilineSpan.canonicalTokens[0]!.kindText,
    "ParserValueTokenString",
    "MULTILINE_STRING 未保留 canonical String kind",
  );
  assert.equal(
    multilineBytes
      .subarray(multilineSpan.spanStartByte, multilineSpan.spanEndByte)
      .toString("utf8"),
    "\"\"\"\nalpha\nbeta\n\"\"\"",
    "MULTILINE_STRING raw byte span 漂移",
  );
  assert.throws(
    () => canonicalParserTokenSpanFromReceipt(
      multilineSource,
      [{...multilineToken, end: multilineEnd - 1}],
      stringKindNames,
      multilineStart,
      multilineEnd,
    ),
    /未精确落在 token 边界/,
    "截断 MULTILINE_STRING token span 必须 hard-fail",
  );
  assert.throws(
    () => canonicalParserTokenSpanFromReceipt(
      multilineSource,
      [{...multilineToken, kind: 5}],
      stringKindNames,
      multilineStart,
      multilineEnd,
    ),
    /literal token kind invalid/,
    "MULTILINE_STRING 改绑 Char kind 必须 hard-fail",
  );

  // ---------- [C] lint 自测(二元放行 / 前缀仍禁) ----------
  const lintPositives: string[] = [
    "fn f(a: int32, b: int32): int32 = a * b\n",   // term `*` 臂(二元乘法)
    "let bw = a & b\n",                             // bitwiseAnd 重复 one(二元按位与)
    "let chain = a & a & a & a & a & a & a & a & a\n", // bitwiseAnd 重复 bounded_max
    "let neg = a * -b\n",                           // 二元 `*` 右操作数带一元前缀
    "type Managed = ref object:\n    value: int32\n", // 唯一合法托管 ref 表面
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
    ["type Raw = ref int32\n", "M9024_L01"],              // raw ref T
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
