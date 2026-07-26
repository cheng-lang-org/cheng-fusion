#!/usr/bin/env bun
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  CHENG_EBNF_PARSER_NODE_MAP_SCHEMA,
  CHENG_EBNF_PARSER_PRODUCER_CLAIMS_SCHEMA,
  CHENG_PARSER_RECEIPT_BUILD_COMPILER,
  CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE,
  CHENG_PARSER_PRODUCTION_RECEIPT_HARNESS_SCHEMA,
  buildParserReceiptHarnessToolClosure,
  buildParserReceiptHarnessExecutableIdentity,
  buildEbnfParserNodeMap,
  auditCurrentFormalParserCoverage,
  parserOwnedStructuredWitnessAccepted,
  parserReceiptHarnessCompilerProfile,
  parserWitnessFixedPointRejectedReceiptPaths,
  serializeEbnfParserNodeMap,
  validateCurrentUnwitnessedEbnfParserNodeMap,
  validateParserProductionReceiptHarnessIdentity,
  type EbnfParserNodeMap,
} from "../src/cheng_ebnf_parser_node_map.ts";
import {
  buildChengGrammarObligationContract,
} from "../src/cheng_semantic_pipeline_matrix_m9024.ts";
import {
  bindCurrentReceiptAgainstObligations,
  bindReceiptAgainstObligations,
  driverDeclarationIdentity,
  driverDeclarationLexicalScopeIdentity,
  driverImportEdgeIdentity,
  driverModuleDeclarationIdentity,
  driverNormalizedScopeFactIdentity,
  driverNormalizedStatementFactIdentity,
  parserAnnotationArgIdentity,
  parserAnnotationIdentity,
  parserReceiptObjectTypeSurface,
  parserPatternIdentity,
  parserTypeEnumVariantIdentity,
  parserTypeSyntaxIdentity,
  parserValueNodeIdentity,
  registeredAnnotationNamesFromFormalSpec,
  tokenKindNamesFromParserSource,
  utf8ByteSpanToUtf16Span,
  valueExprKindNamesFromParserSource,
  type MapRow,
} from "../tools/grammar_receipt_bind.ts";
import {
  buildCorpus,
  buildCurrentSourcePlan,
  currentSourcePlanMismatches,
  publishGrammarCorpusFiles,
} from "../tools/grammar_corpus_gen.ts";
import {canonicalJson} from "../src/cheng_semantic_matrix_m9023.ts";
import {
  readCurrentChengGrammarCorpus,
} from "../src/cheng_grammar_corpus_store.ts";

const here = dirname(fileURLToPath(import.meta.url));
const specPath = process.env.CHENG_FORMAL_SPEC_PATH ??
  "/Users/lbcheng/cheng-lang/docs/cheng-formal-spec.md";
const parserPath = process.env.CHENG_PARSER_PATH ??
  "/Users/lbcheng/cheng-lang/src/core/lang/parser.cheng";
const receiptProducerPath = process.env.CHENG_PARSER_RECEIPT_PRODUCER_PATH ??
  "/Users/lbcheng/cheng-lang/src/core/tooling/compiler_parser_receipt.cheng";
const claimsPath = resolve(
  here,
  "../fixtures/semantic/ebnf_parser_producer_claims.json",
);
const mapPath = resolve(
  here,
  "../fixtures/semantic/ebnf_parser_node_map.json",
);
const mapGeneratorPath = resolve(
  here,
  "../tools/ebnf_parser_node_map_gen.ts",
);
const corpusStoreRoot = resolve(
  here,
  "../fixtures/semantic/grammar_corpus",
);
const currentAnnotationSourcePath =
  readCurrentChengGrammarCorpus(corpusStoreRoot)
  .filePaths.get("anno_args.cheng")!;
const receiptPath = resolve(
  here,
  "../fixtures/semantic/annotation_parser_receipt.json",
);
const fusionRoot = resolve(here, "..");
const chengRoot = resolve(dirname(specPath), "..");
const harnessToolPath = resolve(
  here,
  "../tools/current_parser_production_receipt_harness.ts",
);
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildCurrentStructureMutationFixture(
  baseReceipt: any,
  baseSource: string,
  tokenKindNames: readonly string[],
): {readonly receipt: any; readonly source: string} {
  const receipt = clone(baseReceipt);
  const importSurface = "import cheng/std/system\n";
  const source = baseSource + importSurface;
  const importStart = Buffer.byteLength(baseSource, "utf8");
  const importLine = baseSource.split("\n").length;
  const tokenSpecs = [
    ["ParserValueTokenImport", "import", 0, 6],
    ["ParserValueTokenIdentifier", "cheng", 7, 12],
    ["ParserValueTokenSlash", "/", 12, 13],
    ["ParserValueTokenIdentifier", "std", 13, 16],
    ["ParserValueTokenSlash", "/", 16, 17],
    ["ParserValueTokenIdentifier", "system", 17, 23],
  ] as const;
  const importTokens = tokenSpecs.map(
    ([kindText, _text, start, end], offset) => {
      const kind = tokenKindNames.indexOf(kindText);
      assert.ok(kind > 0, `current token kind missing: ${kindText}`);
      return {
        index: receipt.tokens.length + offset,
        kind,
        sourceTextId: 0,
        producerSourceIndex: 0,
        sourceLocalIndex: receipt.tokens.length + offset,
        lexicalParentIndex: -1,
        start: importStart + start,
        end: importStart + end,
        line: importLine,
        column: start + 1,
      };
    },
  );
  receipt.tokens.push(...importTokens);
  receipt.counts.tokenCount = receipt.tokens.length;
  receipt.sourceSha256 = sha256(source);
  receipt.sourceTexts[0].sha256 = receipt.sourceSha256;
  receipt.sourceTexts[0].byteLength =
    Buffer.byteLength(source, "utf8");

  const returnRoot =
    receipt.statementRoots[receipt.statementRoots.length - 1];
  assert.equal(
    returnRoot.role,
    "ParserValueExprStatementReturnValue",
  );
  const returnNode = receipt.nodes[returnRoot.nodeIndex];
  const normalizedStatement = {
    index: 0,
    producerSourceIndex: 0,
    sourceLocalRow: 0,
    normalizedExprRow: 0,
    sourceTextId: 0,
    kind: 9,
    kindText: "NormalizedExprReturn",
    anchorTokenIndex: returnRoot.anchorTokenIndex,
    spanStart: returnNode.spanStart,
    spanEnd: returnNode.spanEnd,
    line: returnRoot.anchorLine,
    column: returnRoot.anchorColumn,
    endLine: returnRoot.endLine,
    endColumn: returnRoot.endColumn,
    rootNodeIndex: returnRoot.nodeIndex,
    originNodeIndex: returnRoot.nodeIndex,
    statementRole: returnRoot.role,
    lexicalScopeId: 1,
    suiteScopeId: -1,
    statementOrdinal: -1,
    lexicalOrdinal: -1,
    deferOwnerStatementOrdinal: -1,
    identitySha256: "",
  };
  normalizedStatement.identitySha256 =
    driverNormalizedStatementFactIdentity(
      normalizedStatement,
      source,
      receipt.tokens,
      receipt.nodes,
    );
  receipt.normalizedStatementFacts = [normalizedStatement];
  receipt.counts.normalizedStatementFactCount = 1;

  const rootScope = {
    index: 0,
    producerSourceIndex: 0,
    sourceLocalRow: 0,
    sourceTextId: 0,
    scopeId: 0,
    sourceScopeId: 0,
    parentScopeId: -1,
    parentScopeIndex: -1,
    kind: 0,
    kindText: "NormalizedScopeRoot",
    ownerStatementOrdinal: -1,
    ownerStatementRow: -1,
    moduleRootAnchor: true,
    lexicalOrdinal: 0,
    indentColumn: 0,
    anchorTokenIndex: 0,
    line: 1,
    column: 1,
    endLine: importLine,
    endColumn: 23,
    identitySha256: "",
  };
  rootScope.identitySha256 =
    driverNormalizedScopeFactIdentity(
      rootScope,
      source,
      receipt.tokens,
    );
  receipt.normalizedScopeFacts = [rootScope];
  receipt.counts.normalizedScopeFactCount = 1;

  const ownerModulePath = "fixture/annotation_parser_receipt";
  const targetModulePath = "cheng/std/system";
  const targetSourcePath =
    "/Users/lbcheng/cheng-lang/src/std/system.cheng";
  const importEdge = {
    index: 0,
    ownerProducerSourceIndex: 0,
    targetProducerSourceIndex: 1,
    sourceDeclarationIdentitySha256:
      driverModuleDeclarationIdentity(
        0, receipt.sourcePath, ownerModulePath),
    targetDeclarationIdentitySha256:
      driverModuleDeclarationIdentity(
        1, targetSourcePath, targetModulePath),
    importDeclarationRow: 0,
    importItemRow: 0,
    keywordTokenIndex: importTokens[0]!.index,
    aliasTokenIndex: -1,
    spanStart: importTokens[1]!.start,
    spanEnd: importTokens[5]!.end,
    moduleTokenIndexes: [
      importTokens[1]!.index,
      importTokens[3]!.index,
      importTokens[5]!.index,
    ],
    prefixTokenCount: 0,
    ownerModulePath,
    targetModulePath,
    targetSourcePath,
    targetProfileIndex: 1,
    identitySha256: "",
  };
  importEdge.identitySha256 =
    driverImportEdgeIdentity(importEdge, source, receipt.tokens);
  receipt.importEdges = [importEdge];
  receipt.counts.importEdgeCount = 1;
  return {receipt, source};
}

function build(
  claimsBytes: Buffer,
  parserBytes: Buffer,
): EbnfParserNodeMap {
  return buildEbnfParserNodeMap(
    readFileSync(specPath),
    parserBytes,
    claimsBytes,
    {
      receiptProducerBytes: readFileSync(receiptProducerPath),
      receiptEvidence: [],
    },
  );
}

async function main(): Promise<void> {
  const fixedPointRows = [
    {
      manifestSha256: "a".repeat(64),
      sourcePath: "/source.cheng",
      receiptPath: "/receipt-a.json",
      accepted: true,
      witnessedObligationIds: ["p\u0000o1", "p\u0000o2"],
    },
    {
      manifestSha256: "a".repeat(64),
      sourcePath: "/source.cheng",
      receiptPath: "/receipt-b.json",
      accepted: true,
      witnessedObligationIds: ["p\u0000o2", "p\u0000o1"],
    },
  ];
  assert.deepEqual(
    [...parserWitnessFixedPointRejectedReceiptPaths(fixedPointRows)],
    [],
    "双 driver obligation witness 集相同才可 admission",
  );
  const mismatchedFixedPointRows = clone(fixedPointRows);
  mismatchedFixedPointRows[1]!.witnessedObligationIds = ["p\u0000o1"];
  assert.deepEqual(
    [...parserWitnessFixedPointRejectedReceiptPaths(
      mismatchedFixedPointRows)],
    ["/receipt-a.json", "/receipt-b.json"],
    "双 driver 只要少一个 obligation witness，整对 receipt 必须拒绝",
  );
  const halfRejectedFixedPointRows = clone(fixedPointRows);
  halfRejectedFixedPointRows[1]!.accepted = false;
  assert.deepEqual(
    [...parserWitnessFixedPointRejectedReceiptPaths(
      halfRejectedFixedPointRows)],
    ["/receipt-a.json", "/receipt-b.json"],
    "双 driver 一侧 admission 失败时另一侧不得进入 witness union",
  );
  for (const [
    spanModel,
    parserNodeKind,
    production,
    declaredNodeKinds,
  ] of [
    ["type_syntax_span", "ParserTypeSyntaxTuple", "tupleType", []],
    ["type_syntax_span", "ParserTypeSyntaxBracketConstArg", "typeArg", []],
    ["pattern_span", "ParserPatternNamedField", "objectPattern", []],
    ["annotation_span", "ParserAnnotation", "annotation", []],
    ["annotation_arg_span", "ParserAnnotationArgKeyValue", "annotationEntry", []],
    ["annotation_arg_span", "ParserAnnotation", "annotationArgs", []],
    [
      "statement_root_span",
      "ParserValueExprStatementAssignmentRhs",
      "assignStmt",
      ["ParserValueExprStatementAssignmentRhs"],
    ],
    ["record_fact", "ParserValueExprSourceText", "module", []],
    ["record_fact", "ParserValueTokenLet", "storage", []],
    ["record_fact", "ParserImportEdge", "importDecl", ["ImportEdge"]],
    ["record_fact", "ParserImportEdge", "modulePath", ["ImportEdge"]],
    ["line_fact_span", "NormalizedExprBreakStmt", "breakStmt", []],
    ["line_fact_span", "NormalizedExprContinueStmt", "continueStmt", []],
    ["line_fact_span", "NormalizedExprDeferStmt", "deferStmt", []],
    ["line_fact_span", "NormalizedScopeDeferSuite", "deferStmt", []],
    ["line_fact_span", "NormalizedScopeIndentedSuite", "suite", []],
    ["line_fact_span", "NormalizedScopeInlineSuite", "suite", []],
    [
      "declaration_span",
      "ParserDeclarationModule",
      "moduleHeader",
      ["ParserDeclarationModule"],
    ],
    [
      "region_span",
      "ParserValueExprRegionFieldBlock",
      "objectFields",
      ["ParserValueExprRegionFieldBlock"],
    ],
    ["region_span", "ParserStructuredCaseArm", "caseArm", []],
    ["region_span", "ParserStructuredLValue", "lvalue", []],
  ] as const) {
    assert.equal(
      parserOwnedStructuredWitnessAccepted(
        spanModel,
        parserNodeKind,
        production,
        declaredNodeKinds,
      ),
      true,
      `${spanModel} 必须接受 parser-owned ${parserNodeKind}`,
    );
  }
  for (const [
    spanModel,
    parserNodeKind,
    production,
    declaredNodeKinds,
  ] of [
    ["type_syntax_span", "ParserValueTokenIdentifier", "typeExpr", []],
    ["type_syntax_span", "ParserValueExprRegionParamType", "typeExpr", []],
    ["pattern_span", "ParserValueExprRegionPattern", "pattern", []],
    ["annotation_span", "ParserValueExprRegionAnnotationArgs", "annotation", []],
    ["annotation_arg_span", "ParserValueTokenColon", "annotationEntry", []],
    [
      "statement_root_span",
      "ParserValueTokenIf",
      "statementCore",
      [],
    ],
    [
      "statement_root_span",
      "ParserValueExprStatementCondition",
      "statementCore",
      [],
    ],
    ["line_fact_span", "ParserValueTokenBreak", "breakStmt", []],
    [
      "line_fact_span",
      "ParserValueExprStatementExpression",
      "suite",
      [],
    ],
    ["record_fact", "ParserValueTokenImport", "importDecl", ["ImportEdge"]],
    ["record_fact", "ParserValueExprSourceText", "modulePath", ["ImportEdge"]],
    [
      "declaration_span",
      "ParserValueTokenModule",
      "moduleHeader",
      ["ParserDeclarationModule"],
    ],
    [
      "region_span",
      "ParserValueExprRegionCaseArm",
      "caseArm",
      ["ParserValueExprRegionCaseArm"],
    ],
    [
      "value_node_char_span",
      "ParserValueTokenLeftParen",
      "tupleLiteral",
      ["ParserValueExprTupleLiteral"],
    ],
    [
      "value_node_char_span",
      "ParserValueExprRegionCaseArm",
      "caseEntry",
      ["ParserValueExprCaseBranch"],
    ],
  ] as const) {
    assert.equal(
      parserOwnedStructuredWitnessAccepted(
        spanModel,
        parserNodeKind,
        production,
        declaredNodeKinds,
      ),
      false,
      `${spanModel} 禁止 token/region ${parserNodeKind} 冒充 parser-owned witness`,
    );
  }
  const unicodeSource = "let 名 = true\n";
  const unicodeBytes = Buffer.from(unicodeSource, "utf8");
  const trueStartByte = unicodeBytes.indexOf(Buffer.from("true"));
  assert.deepEqual(
    utf8ByteSpanToUtf16Span(
      unicodeSource, trueStartByte, trueStartByte + 4),
    {
      charStart: unicodeSource.indexOf("true"),
      charEnd: unicodeSource.indexOf("true") + 4,
    },
    "driver UTF-8 byte span 必须精确转换为 Fusion UTF-16 token span",
  );
  const nameStartByte = unicodeBytes.indexOf(Buffer.from("名"));
  assert.throws(
    () => utf8ByteSpanToUtf16Span(
      unicodeSource, nameStartByte + 1, nameStartByte + 3),
    /未落在码点边界/,
    "多字节码点内部偏移必须 hard-fail",
  );
  const specBytes = readFileSync(specPath);
  const parserBytes = readFileSync(parserPath);
  const receiptProducerSource =
    readFileSync(receiptProducerPath, "utf8");
  const claimsBytes = readFileSync(claimsPath);
  const mapGeneratorSource = readFileSync(mapGeneratorPath, "utf8");
  const spanReceiptBuildStart = receiptProducerSource.indexOf(
    "fn ParserSpanReceiptJsonBuild(",
  );
  assert.ok(
    spanReceiptBuildStart >= 0,
    "正式 parser span receipt producer 必须存在",
  );
  const spanReceiptBuildSource =
    receiptProducerSource.slice(spanReceiptBuildStart);
  assert.match(
    spanReceiptBuildSource,
    /ParserValueExprTreeAnnotationsStrictValidateInto/,
    "正式 receipt 必须在生成 Annotation CID 前严格校验 SoA/owner/child CSR",
  );
  assert.match(
    spanReceiptBuildSource,
    /ParserNormalizedAnnotationRegisteredName/,
    "正式 receipt 必须在 publish 前 hard-fail 未注册注解",
  );
  assert.ok(
    [...receiptProducerSource.matchAll(
      /ParserNormalizedAnnotationRegisteredName/g,
    )].length >= 2,
    "正式 JSON receipt 与 canonical sidecar 必须共用当前唯一注解注册表 admission",
  );
  for (const producer of [
    "parserSpanReceiptAnnotationIdentityRaw32",
    "parserSpanReceiptAnnotationArgIdentityRaw32",
  ]) {
    assert.match(
      receiptProducerSource,
      new RegExp(`fn ${producer}\\(`),
      `${producer} 必须生成 owner/token/span/child 绑定 CID`,
    );
  }
  assert.match(
    mapGeneratorSource,
    /resolveCurrentParserHarnessAuthority\(bindingPath\)/,
    "witnessed 映射必须从唯一 official current build binding 解析权威",
  );
  assert.match(
    mapGeneratorSource,
    /buildCurrentReceiptHarness\(\s*bindingPath,\s*corpusSourceRows,\s*\)/,
    "witnessed 映射必须把同一 binding 传入 current parser receipt harness",
  );
  assert.match(
    mapGeneratorSource,
    /harnessOfficialCurrentBuild: authority\.officialCurrentBuild/,
    "map admission 必须绑定 exact official current build identity",
  );
  assert.match(
    mapGeneratorSource,
    /assertCurrentAuthorityAndSourceClosure\("source-plan admission"\)[\s\S]*?assertCurrentAuthorityAndSourceClosure\("parser receipt launch"\)[\s\S]*?buildCurrentReceiptHarness\([\s\S]*?assertCurrentAuthorityAndSourceClosure\("parser receipt execution"\)[\s\S]*?assertCurrentAuthorityAndSourceClosure\("receipt evidence admission"\)[\s\S]*?assertCurrentAuthorityAndSourceClosure\("parser map build"\)/,
    "source-plan、harness、receipt admission 和 map build 每阶段都必须重验 authority/source closure",
  );
  assert.doesNotMatch(
    mapGeneratorSource,
    /process\.env\.(?:CHENG_ROOT|CHENG_FORMAL_SPEC_PATH|CHENG_PARSER_PATH|CHENG_PARSER_RECEIPT_PRODUCER_PATH|CHENG_EBNF_RECEIPT_HARNESS_PATH|CHENG_EBNF_MAP_OUTPUT_PATH|CHENG_EBNF_RECEIPT_ARTIFACT_PARENT)/,
    "生成器禁止 ambient Cheng/spec/parser/producer/harness/output 权威",
  );
  assert.match(
    mapGeneratorSource,
    /const artifactParent = dirname\(officialCurrentBuildBindingPath\)/,
    "正式 receipt 必须持久化到 exact official binding transaction",
  );
  assert.doesNotMatch(
    mapGeneratorSource,
    /--source-snapshot-manifest|--official-driver/,
    "生成器禁止旧 snapshot/driver 参数碎片",
  );
  assert.match(
    mapGeneratorSource,
    /args\.includes\("--prepare-current-unwitnessed"\)[\s\S]*?args\.length !== 1[\s\S]*?cannot be mixed with witnessed inputs/,
    "unwitnessed 必须是不可混用的显式诊断模式",
  );
  assert.match(
    mapGeneratorSource,
    /grammar_corpus/,
    "默认 receipt source 必须来自当前正式 grammar corpus",
  );
  const sourcePlanGateOffset = mapGeneratorSource.indexOf(
    "const sourcePlanMismatches = currentSourcePlanMismatches(",
  );
  const harnessStartOffset = mapGeneratorSource.indexOf(
    "const harnessPath = buildCurrentReceiptHarness(",
  );
  assert.ok(
    sourcePlanGateOffset >= 0 &&
      harnessStartOffset > sourcePlanGateOffset,
    "current source-plan 漂移必须在启动 parser receipt driver 前 hard-fail",
  );
  assert.doesNotMatch(
    mapGeneratorSource,
    /grammar_blocked_migrations/,
    "旧 BLOCKED manifest 禁止控制当前映射结果",
  );
  assert.match(
    mapGeneratorSource,
    /validateParserProductionReceiptHarnessSourcePlan/,
    "harness 必须精确绑定 current grammar source-plan",
  );
  assert.doesNotMatch(
    mapGeneratorSource,
    /backend_driver_main\.cheng/,
    "parser receipt 禁止绑定非当前 full backend driver entry",
  );
  const rejectedGeneratorCases = [
    {
      args: [],
      expected: /usage: --official-current-build-binding/,
    },
    {
      args: ["--source-snapshot-manifest", "/private/snapshot.txt"],
      expected: /unknown argument --source-snapshot-manifest/,
    },
    {
      args: ["--official-driver", "/private/cheng"],
      expected: /unknown argument --official-driver/,
    },
    {
      args: ["--official-current-build-binding", "relative-binding.kv"],
      expected: /binding path must be canonical/,
    },
    {
      args: [
        "--prepare-current-unwitnessed",
        "--official-current-build-binding",
        "/private/current-official-binding.kv",
      ],
      expected: /cannot be mixed with witnessed inputs/,
    },
  ] as const;
  for (const row of rejectedGeneratorCases) {
    const result = spawnSync(
      process.execPath,
      ["run", mapGeneratorPath, ...row.args],
      {
        cwd: fusionRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          CHENG_ROOT: "/forbidden/live-root",
          CHENG_FORMAL_SPEC_PATH: "/forbidden/spec.md",
          CHENG_PARSER_PATH: "/forbidden/parser.cheng",
          CHENG_PARSER_RECEIPT_PRODUCER_PATH:
            "/forbidden/receipt-producer.cheng",
        },
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(
      `${String(result.stdout)}\n${String(result.stderr)}`,
      row.expected,
      `生成器旧/非 canonical/mixed 参数必须 hard-fail: ${row.args.join(" ")}`,
    );
  }
  if (process.argv.includes("--current-binding-generator-only")) {
    console.log(
      "item25 EBNF generator current binding contract: PASS " +
      `negative_cases=${rejectedGeneratorCases.length}`,
    );
    return;
  }
  const generatedWithoutReceipts = build(claimsBytes, parserBytes);
  const currentGrammar = buildChengGrammarObligationContract(specBytes);
  const registeredAnnotationNames =
    registeredAnnotationNamesFromFormalSpec(
      specBytes.toString("utf8"),
    );
  assert.deepEqual(registeredAnnotationNames, [
    "compiler_top_level",
    "exportc",
    "exported",
    "importc",
    "ffi_map",
    "ffi_out_ptrs",
    "ffi_owned_result",
    "ffi_handle",
    "abi_internal",
    "borrow_result",
    "borrows",
    "escapes",
    "thread_boundary",
    "profile",
    "weak",
    "trusted_abi",
    "no_alloc",
    "interrupt_handler",
    "keep_export_binding",
  ]);
  const currentAnnotationNames = [
    ...readFileSync(currentAnnotationSourcePath, "utf8")
      .matchAll(/@([a-z][a-z0-9_]*)/g),
  ].map((match) => match[1]!);
  assert.ok(currentAnnotationNames.length > 0);
  assert.ok(
    currentAnnotationNames.every((name) =>
      registeredAnnotationNames.includes(name)),
    "current annotation corpus 只允许正式注册名",
  );
  assert.equal(currentGrammar.productionCount, 125);
  assert.equal(currentGrammar.requiredCount, 971);
  assert.equal(generatedWithoutReceipts.counts.total, 125);
  assert.equal(
    generatedWithoutReceipts.counts.requiredObligationCount,
    971,
  );
  const currentCoverageAudit =
    auditCurrentFormalParserCoverage(generatedWithoutReceipts);
  assert.equal(currentCoverageAudit.status, "HARD_RED");
  assert.equal(currentCoverageAudit.productionCount, 125);
  assert.equal(currentCoverageAudit.producerDeclaredCount, 125);
  assert.equal(currentCoverageAudit.receiptMappedCount, 0);
  assert.equal(
    currentCoverageAudit.recomputedUnmappedProductionCount,
    0,
    "历史 36 UNMAPPED 不得作为 current 输入；当前 producer 声明重算为 0",
  );
  assert.equal(currentCoverageAudit.unwitnessedProductionCount, 125);
  assert.equal(currentCoverageAudit.requiredObligationCount, 971);
  assert.equal(currentCoverageAudit.witnessedRequiredCount, 0);
  assert.equal(currentCoverageAudit.missingRequiredCount, 971);
  assert.deepEqual(
    currentCoverageAudit.focusRows.map((row) => row.name),
    [
      "moduleHeader",
      "annotation",
      "annotationArgs",
      "annotationArg",
      "annotationList",
      "annotationDict",
      "annotationEntry",
      "annotationKey",
      "implicitObjectType",
      "objectType",
      "conceptDecl",
      "traitDecl",
      "typeParamList",
      "typeParam",
      "typeExpr",
      "algebraicType",
      "variantType",
      "procType",
      "tupleType",
      "setType",
      "enumType",
      "refType",
      "varType",
      "typePostfix",
      "typePrimary",
      "typeArg",
      "lvalue",
      "caseArm",
      "pattern",
    ],
  );
  assert.ok(
    currentCoverageAudit.focusRows.every(
      (row) =>
        row.status === "PARTIAL" &&
        row.witnessedRequiredCount === 0 &&
        row.missingRequiredCount === row.requiredObligationCount,
    ),
  );
  assert.match(currentCoverageAudit.auditSha256, /^[0-9a-f]{64}$/);
  assert.throws(
    () => auditCurrentFormalParserCoverage(
      clone(generatedWithoutReceipts),
    ),
    /current_formal_parser_coverage_map_not_builder_owned/,
    "解析 JSON 或手填 map 不得取得 current coverage audit 能力",
  );
  assert.ok(
    generatedWithoutReceipts.rows.every(
      (row) =>
        row.witnessed_required_count === 0 &&
        row.witness_projections.length === 0,
    ),
    "无 current parser receipt 时实际 witness 投影必须严格为空",
  );
  const implicitObjectObligations = currentGrammar.obligations.filter(
    (entry) =>
      entry.production === "implicitObjectType" &&
      entry.disposition === "required",
  );
  assert.deepEqual(
    Object.fromEntries(
      ["choice", "optional", "production", "recursion"].map((kind) => [
        kind,
        implicitObjectObligations.filter((entry) => entry.kind === kind)
          .length,
      ]),
    ),
    {choice: 2, optional: 6, production: 1, recursion: 3},
    "implicitObjectType 必须由正式 EBNF 机械产生 12 个 required obligation",
  );
  const implicitObjectProducer = generatedWithoutReceipts.rows.find(
    (row) => row.name === "implicitObjectType",
  )!;
  assert.equal(implicitObjectProducer.production, 28);
  assert.equal(
    implicitObjectProducer.body_ref.sha256,
    "5ffd6c66f85437c686aa92e1bd84cc187885ef623764951504ee1eea1afa0d2a",
  );
  assert.equal(implicitObjectProducer.required_obligation_count, 12);
  assert.deepEqual(
    [...implicitObjectProducer.missing_required_obligation_ids],
    implicitObjectObligations.map((entry) => entry.obligationId),
    "implicitObjectType map 行义务只能来自当前正式 EBNF contract",
  );
  assert.deepEqual(
    implicitObjectProducer.node_kind_receipts.map((entry) =>
      Object.keys(entry).sort()),
    implicitObjectProducer.node_kind_receipts.map(() => [
      "declarationKind",
      "declarationSha256",
      "file",
      "line",
      "name",
    ]),
    "parser 节点 receipt 必须绑定唯一声明行，不得保留 firstLine 文本近似身份",
  );
  assert.ok(
    implicitObjectProducer.node_kind_receipts.every(
      (entry: any) =>
        entry.file === "src/core/lang/parser.cheng" &&
        /^[0-9a-f]{64}$/.test(entry.declarationSha256),
    ),
  );
  assert.equal(
    parserReceiptObjectTypeSurface(
      "ParserTypeSyntaxImplicitObject",
      "ParserValueTokenIdentifier",
    ),
    "implicit",
  );
  assert.equal(
    parserReceiptObjectTypeSurface(
      "ParserTypeSyntaxObject",
      "ParserValueTokenOf",
    ),
    "implicit",
  );
  assert.equal(
    parserReceiptObjectTypeSurface(
      "ParserTypeSyntaxObject",
      "ParserValueTokenObject",
    ),
    "explicit",
  );
  assert.equal(
    parserReceiptObjectTypeSurface(
      "ParserTypeSyntaxObject",
      "object",
    ),
    null,
    "源码文本 object 不得冒充 receipt token kind",
  );
  assert.equal(
    parserReceiptObjectTypeSurface(
      "ParserTypeSyntaxNominal",
      "ParserValueTokenOf",
    ),
    null,
    "仅有 of token 不得冒充 ImplicitObject/Object TypeSyntax 根",
  );
  const currentDeclarations = JSON.parse(
    claimsBytes.toString("utf8"),
  ) as any;
  const missingImplicitClaim = clone(currentDeclarations);
  missingImplicitClaim.rows = missingImplicitClaim.rows.filter(
    (row: any) => row.name !== "implicitObjectType",
  );
  assert.throws(
    () => build(
      Buffer.from(JSON.stringify(missingImplicitClaim)),
      parserBytes,
    ),
    /producer claim count=124, productions=125/,
    "旧 124-row claims 必须 hard-fail",
  );
  const duplicateImplicitClaim = clone(currentDeclarations);
  duplicateImplicitClaim.rows.push(clone(
    duplicateImplicitClaim.rows.find(
      (row: any) => row.name === "implicitObjectType",
    ),
  ));
  assert.throws(
    () => build(
      Buffer.from(JSON.stringify(duplicateImplicitClaim)),
      parserBytes,
    ),
    /duplicate producer claim implicitObjectType/,
  );
  for (const [label, mutate] of [
    [
      "node kind",
      (row: any) => {
        row.nodeKinds = row.nodeKinds.filter(
          (kind: string) => kind !== "ParserTypeSyntaxImplicitObject",
        );
      },
    ],
    [
      "span model",
      (row: any) => { row.spanModel = "statement_root_span"; },
    ],
  ] as const) {
    const copy = clone(currentDeclarations);
    mutate(copy.rows.find(
      (row: any) => row.name === "implicitObjectType",
    ));
    assert.throws(
      () => build(Buffer.from(JSON.stringify(copy)), parserBytes),
      /implicitObjectType current TypeSyntax producer declaration invalid/,
      `implicitObjectType ${label} mutation 必须 hard-fail`,
    );
  }
  const exactTypeSyntaxProducerNames = [
    "implicitObjectType",
    "objectType",
    "typeParamList",
    "typeParam",
    "typeExpr",
    "algebraicType",
    "variantType",
    "procType",
    "tupleType",
    "setType",
    "enumType",
    "refType",
    "varType",
    "typePostfix",
    "typePrimary",
    "typeArg",
  ] as const;
  const exactTypeSyntaxRows = exactTypeSyntaxProducerNames.map(
    (name) => generatedWithoutReceipts.rows.find(
      (candidate) => candidate.name === name,
    )!,
  );
  assert.equal(
    exactTypeSyntaxRows.reduce(
      (sum, row) => sum + row.required_obligation_count,
      0,
    ),
    138,
  );
  assert.equal(
    exactTypeSyntaxRows.reduce(
      (sum, row) => sum + row.missing_required_count,
      0,
    ),
    138,
    "无 current 双 driver receipt 时 TypeSyntax 16 项必须如实保留 138 个缺口",
  );
  for (const name of exactTypeSyntaxProducerNames) {
    const row = generatedWithoutReceipts.rows.find(
      (candidate) => candidate.name === name,
    )!;
    assert.equal(row.span_model, "type_syntax_span");
    assert.ok(row.parser_fn.length > 0);
    assert.ok(row.node_kind_receipts.length > 0);
    for (const field of ["parserFunctions", "nodeKinds"] as const) {
      const missingTypeSyntaxClaim = clone(currentDeclarations);
      const changed = missingTypeSyntaxClaim.rows.find(
        (candidate: any) => candidate.name === name,
      );
      changed[field] = changed[field].slice(1);
      assert.throws(
        () => build(
          Buffer.from(JSON.stringify(missingTypeSyntaxClaim)),
          parserBytes,
        ),
        new RegExp(
          `${name} current TypeSyntax producer declaration invalid`,
        ),
        `${name} ${field} 删除 mutation 必须 hard-fail`,
      );
    }
  }
  const annotationProducerNames = [
    "annotations",
    "annotation",
    "annotationArgs",
    "annotationArg",
    "annotationList",
    "annotationDict",
    "annotationEntry",
    "annotationKey",
  ] as const;
  for (const name of annotationProducerNames) {
    const row = generatedWithoutReceipts.rows.find(
      (candidate) => candidate.name === name,
    )!;
    assert.ok(row.node_kind_receipts.length > 0);
    assert.ok(row.node_kind_receipts.every(
      (receipt: any) =>
        receipt.file === "src/core/lang/parser.cheng" &&
        ["function", "type", "field", "enum_member"].includes(
          receipt.declarationKind,
        ) &&
        /^[0-9a-f]{64}$/.test(receipt.declarationSha256),
    ));
    const missingAnnotationNodeKind = clone(currentDeclarations);
    const changed = missingAnnotationNodeKind.rows.find(
      (candidate: any) => candidate.name === name,
    );
    changed.nodeKinds = changed.nodeKinds.slice(1);
    assert.throws(
      () => build(
        Buffer.from(JSON.stringify(missingAnnotationNodeKind)),
        parserBytes,
      ),
      new RegExp(
        `${name} current parser producer declaration invalid`,
      ),
      `${name} 必须锁定 parser-owned producer 声明集合`,
    );
  }
  for (const separatorKind of [
    "ParserValueTokenColon",
    "ParserValueTokenAssign",
  ]) {
    const missingSeparatorKind = clone(currentDeclarations);
    const entry = missingSeparatorKind.rows.find(
      (row: any) => row.name === "annotationEntry",
    );
    entry.nodeKinds = entry.nodeKinds.filter(
      (kind: string) => kind !== separatorKind,
    );
    assert.throws(
      () => build(
        Buffer.from(JSON.stringify(missingSeparatorKind)),
        parserBytes,
      ),
      /annotationEntry current parser producer declaration invalid/,
      `${separatorKind} 声明缺失必须 hard-fail`,
    );
  }
  for (const name of [
    "moduleHeader",
    "lvalue",
    "caseArm",
  ] as const) {
    const row = generatedWithoutReceipts.rows.find(
      (candidate) => candidate.name === name,
    )!;
    assert.ok(row.node_kind_receipts.length > 0);
    assert.ok(row.node_kind_receipts.every(
      (receipt: any) =>
        receipt.file === "src/core/lang/parser.cheng" &&
        /^[0-9a-f]{64}$/.test(receipt.declarationSha256),
    ));
    for (const field of ["parserFunctions", "nodeKinds"] as const) {
      const missingExactSurfaceClaim = clone(currentDeclarations);
      const changed = missingExactSurfaceClaim.rows.find(
        (candidate: any) => candidate.name === name,
      );
      changed[field] = changed[field].slice(1);
      assert.throws(
        () => build(
          Buffer.from(JSON.stringify(missingExactSurfaceClaim)),
          parserBytes,
        ),
        new RegExp(
          `${name} current exact parser producer declaration invalid`,
        ),
        `${name} ${field} 删除 mutation 必须 hard-fail`,
      );
    }
  }
  const compatibilityClaim = clone(currentDeclarations);
  compatibilityClaim.rows.find(
    (row: any) => row.name === "implicitObjectType",
  ).compatibility = "v1";
  assert.throws(
    () => build(Buffer.from(JSON.stringify(compatibilityClaim)), parserBytes),
    /forbidden_compatibility_key:compatibility/,
    "claims 禁止兼容字段和版本碎片",
  );
  const duplicateSchemaClaims = claimsBytes.toString("utf8").replace(
    /^\{/,
    "{\"schema\":\"cheng_ebnf_parser_producer_declarations_v1\",",
  );
  assert.throws(
    () => build(Buffer.from(duplicateSchemaClaims), parserBytes),
    /duplicate_key:schema/,
    "同一 JSON 双写旧/current schema 必须 hard-fail",
  );
  const textOnlyImplicitParser = parserBytes.toString("utf8").replace(
    /^        ParserTypeSyntaxImplicitObject$/m,
    "        ParserTypeSyntaxImplicitObject_REMOVED # " +
      "ParserTypeSyntaxImplicitObject",
  );
  assert.notEqual(textOnlyImplicitParser, parserBytes.toString("utf8"));
  assert.throws(
    () => build(claimsBytes, Buffer.from(textOnlyImplicitParser)),
    /parser node declaration cardinality invalid: ParserTypeSyntaxImplicitObject\/0/,
    "注释和使用点中的同名文本不得冒充 parser-owned 节点声明",
  );
  const duplicateImplicitParser = parserBytes.toString("utf8").replace(
    /^        ParserTypeSyntaxImplicitObject$/m,
    "        ParserTypeSyntaxImplicitObject\n" +
      "        ParserTypeSyntaxImplicitObject",
  );
  assert.notEqual(
    duplicateImplicitParser,
    parserBytes.toString("utf8"),
  );
  assert.throws(
    () => build(claimsBytes, Buffer.from(duplicateImplicitParser)),
    /parser node declaration cardinality invalid: ParserTypeSyntaxImplicitObject\/2/,
    "线性声明索引仍必须 hard-fail 重复 parser-owned 节点声明",
  );
  assert.throws(
    () => serializeEbnfParserNodeMap(generatedWithoutReceipts),
    /without complete fully admitted production receipt evidence/,
    "零 receipt 或零 witnessed obligation 的 map 禁止序列化",
  );
  const forgedRows = generatedWithoutReceipts.rows.map((row) => ({
    ...row,
    status: "MAPPED",
    receipt_ready: true,
    witnessed_required_count: row.required_obligation_count,
    missing_required_count: 0,
    missing_required_obligation_ids: [],
    witness_receipt_sha256s: ["f".repeat(64)],
  }));
  const forgedMap = {
    ...generatedWithoutReceipts,
    receiptEvidence: {
      inputCount: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      rows: [],
    },
    counts: {
      total: forgedRows.length,
      MAPPED: forgedRows.length,
      PARTIAL: 0,
      UNMAPPED: 0,
      requiredObligationCount:
        generatedWithoutReceipts.counts.requiredObligationCount,
      witnessedRequiredCount:
        generatedWithoutReceipts.counts.requiredObligationCount,
      missingRequiredCount: 0,
    },
    rows: forgedRows,
  } as unknown as EbnfParserNodeMap;
  assert.throws(
    () => serializeEbnfParserNodeMap(forgedMap),
    /without complete fully admitted production receipt evidence/,
    "手填 counts/status/evidence 不能取得 map serializer 能力",
  );
  assert.throws(
    () => buildCorpus(Buffer.from(JSON.stringify(forgedMap))),
    /receipt_evidence|manifest_identity|not current/i,
    "corpus 禁止信任手填 MAPPED/status/count",
  );
  const zeroReceiptMapBytes = Buffer.from(
    JSON.stringify(generatedWithoutReceipts),
  );
  const sourcePlanA = buildCorpus(zeroReceiptMapBytes);
  const sourcePlanB = buildCorpus(zeroReceiptMapBytes);
  assert.deepEqual(
    sourcePlanA.files,
    sourcePlanB.files,
    "当前正式 EBNF 的 29 源 source-plan 必须逐字节确定",
  );
  assert.equal(sourcePlanA.manifest.counts.sources, 29);
  assert.equal(
    sourcePlanA.manifest.counts.claims,
    generatedWithoutReceipts.counts.requiredObligationCount,
  );
  assert.equal(
    sourcePlanA.manifest.counts.coveredRequiredObligations,
    generatedWithoutReceipts.counts.requiredObligationCount,
  );
  const typeShapesEntry = [...sourcePlanA.files.entries()].find(
    ([name]) => name.endsWith("/type_shapes.cheng") ||
      name === "type_shapes.cheng",
  );
  assert.ok(typeShapesEntry !== undefined);
  const typeShapes = typeShapesEntry[1];
  for (const exactSurface of [
    "type BaseObject =\n",
    "type DerivedWithColon = of BaseObject:\n",
    "type DerivedNoColon = of BaseObject\n",
    "type EmptyImplicit =\n",
  ]) {
    assert.ok(
      typeShapes.includes(exactSurface),
      `implicitObjectType source-plan 缺精确形态: ${JSON.stringify(exactSurface)}`,
    );
  }
  assert.ok(
    !Object.hasOwn(sourcePlanA.manifest, "blocked") &&
      !Object.hasOwn(sourcePlanA.manifest.counts, "blocked"),
    "唯一最新版 source-plan 禁止 BLOCKED 控制字段",
  );
  const currentSourcePlan = buildCurrentSourcePlan({
    specBytes,
    parserBytes,
    producerClaimsBytes: claimsBytes,
  });
  assert.deepEqual(
    currentSourcePlanMismatches(currentSourcePlan.files),
    [],
    "磁盘 29 源必须等于当前正式 EBNF source-plan",
  );
  const tamperedSourcePlanFiles = new Map(currentSourcePlan.files);
  const firstSourceName = [...tamperedSourcePlanFiles.keys()]
    .find((name) => name.endsWith(".cheng"))!;
  tamperedSourcePlanFiles.set(
    firstSourceName,
    `${tamperedSourcePlanFiles.get(firstSourceName)!} `,
  );
  assert.ok(
    currentSourcePlanMismatches(tamperedSourcePlanFiles)
      .some((issue) => issue.includes(`${firstSourceName}: 内容漂移`)),
    "source-plan 单字节篡改必须 hard-fail",
  );
  const tamperedSourcePlanManifest = new Map(currentSourcePlan.files);
  tamperedSourcePlanManifest.set(
    "corpus.json",
    `${tamperedSourcePlanManifest.get("corpus.json")!} `,
  );
  assert.ok(
    currentSourcePlanMismatches(tamperedSourcePlanManifest)
      .some((issue) => issue.includes("corpus.json: 内容漂移")),
    "source-plan manifest 单字节篡改必须 hard-fail",
  );
  const incompleteSourcePlan = new Map(currentSourcePlan.files);
  incompleteSourcePlan.delete(firstSourceName);
  assert.ok(
    currentSourcePlanMismatches(incompleteSourcePlan)
      .some((issue) =>
        issue.includes(`${firstSourceName}: source-plan 输入缺失`)),
    "source-plan 输入缺一个 canonical 文件必须 hard-fail",
  );
  const extraSourcePlan = new Map(currentSourcePlan.files);
  extraSourcePlan.set("legacy_v1.cheng", "discard\n");
  assert.ok(
    currentSourcePlanMismatches(extraSourcePlan)
      .some((issue) =>
        issue.includes("legacy_v1.cheng: 非当前 source-plan 输入")),
    "source-plan 输入混入版本碎片必须 hard-fail",
  );
  const sourcePlanCheckRoot = mkdtempSync(
    resolve(tmpdir(), "cheng-grammar-corpus-check-"),
  );
  const sourcePlanCheckOutput =
    resolve(sourcePlanCheckRoot, "grammar_corpus");
  publishGrammarCorpusFiles(
    sourcePlanCheckOutput,
    currentSourcePlan.files,
  );
  const symlinkTarget = resolve(sourcePlanCheckRoot, "symlink-target");
  writeFileSync(symlinkTarget, "pointer\n");
  const sourcePlanCheckSnapshot =
    readCurrentChengGrammarCorpus(sourcePlanCheckOutput);
  rmSync(sourcePlanCheckSnapshot.pointerPath);
  symlinkSync(symlinkTarget, sourcePlanCheckSnapshot.pointerPath);
  assert.ok(
    currentSourcePlanMismatches(
      currentSourcePlan.files,
      sourcePlanCheckOutput,
    ).some((issue) =>
      issue.includes("current pointer") &&
      issue.includes("regular non-symlink")),
    "source-plan current pointer 符号链接必须 hard-fail",
  );
  chmodSync(sourcePlanCheckSnapshot.generationDirectory, 0o755);
  rmSync(sourcePlanCheckRoot, {recursive: true, force: true});
  const publishRoot = mkdtempSync(
    resolve(tmpdir(), "cheng-grammar-corpus-publish-"),
  );
  const publishOutput = resolve(publishRoot, "grammar_corpus");
  assert.throws(
    () => publishGrammarCorpusFiles(
      publishOutput,
      new Map([["corpus.json", "{}\n"]]),
    ),
    /grammar corpus publish file set invalid/,
    "publisher 禁止不完整 canonical 文件集",
  );
  const invalidManifestFiles = new Map(currentSourcePlan.files);
  const invalidManifest =
    JSON.parse(invalidManifestFiles.get("corpus.json")!) as any;
  invalidManifest.counts.witnessedRequiredCount = 1;
  invalidManifest.counts.missingRequiredCount -= 1;
  invalidManifestFiles.set(
    "corpus.json",
    `${JSON.stringify(invalidManifest, null, 2)}\n`,
  );
  assert.throws(
    () => publishGrammarCorpusFiles(
      publishOutput,
      invalidManifestFiles,
    ),
    /grammar corpus manifest obligation counts invalid/,
    "publisher 必须在 current commit 前拒绝伪造 witness 计数",
  );
  assert.equal(
    existsSync(publishOutput),
    false,
    "非法 manifest 不得残留半初始化 store",
  );
  assert.throws(
    () => publishGrammarCorpusFiles(
      publishOutput,
      currentSourcePlan.files,
      {
        afterStagedFile(stagedCount) {
          if (stagedCount === 1) {
            throw new Error("injected initial generation failure");
          }
        },
      },
    ),
    /injected initial generation failure/,
  );
  assert.equal(
    existsSync(publishOutput),
    false,
    "首次 generation 未提交 current 时不得残留半初始化 store",
  );
  publishGrammarCorpusFiles(publishOutput, currentSourcePlan.files);
  const initialSnapshot =
    readCurrentChengGrammarCorpus(publishOutput);
  const nextFiles = new Map(currentSourcePlan.files);
  const publishNames = [...nextFiles.keys()].sort();
  const changedSourceName = publishNames
    .find((name) => name.endsWith(".cheng"))!;
  nextFiles.set(
    changedSourceName,
    `${nextFiles.get(changedSourceName)!}\n`,
  );
  const nextManifest = JSON.parse(nextFiles.get("corpus.json")!) as any;
  const changedShape = changedSourceName.slice(0, -".cheng".length);
  const changedEntry = nextManifest.entries.find(
    (entry: any) => entry.shape === changedShape,
  );
  assert.ok(changedEntry !== undefined);
  changedEntry.sourceSha256 = sha256(nextFiles.get(changedSourceName)!);
  nextFiles.set(
    "corpus.json",
    `${JSON.stringify(nextManifest, null, 2)}\n`,
  );
  const unexpectedPath = resolve(publishOutput, "unexpected.cheng");
  writeFileSync(unexpectedPath, "unexpected\n");
  assert.throws(
    () => publishGrammarCorpusFiles(publishOutput, nextFiles),
    /not the unique current generation store/,
    "publisher 禁止磁盘残留非当前 source-plan 源",
  );
  rmSync(unexpectedPath);
  for (let failAt = 1; failAt <= publishNames.length; failAt += 1) {
    assert.throws(
      () => publishGrammarCorpusFiles(
        publishOutput,
        nextFiles,
        {
          afterStagedFile(stagedCount) {
            if (stagedCount === failAt) {
              assert.equal(
                readCurrentChengGrammarCorpus(publishOutput).generationId,
                initialSnapshot.generationId,
                "staging 中间态不得对 current reader 可见",
              );
              throw new Error(
                `injected grammar corpus publish failure:${failAt}`,
              );
            }
          },
        },
      ),
      new RegExp(`injected grammar corpus publish failure:${failAt}`),
    );
    const failedSnapshot =
      readCurrentChengGrammarCorpus(publishOutput);
    assert.equal(
      failedSnapshot.generationId,
      initialSnapshot.generationId,
      `staged file ${failAt} 失败不得改变 current pointer`,
    );
    assert.equal(
      readdirSync(publishRoot)
        .some((name) =>
          name.startsWith(".grammar-corpus-generation-staging-")),
      false,
      `staged file ${failAt} 失败后 staging 必须清零`,
    );
  }
  assert.throws(
    () => publishGrammarCorpusFiles(
      publishOutput,
      nextFiles,
      {
        beforeCurrentPointerRename() {
          throw new Error("injected current pointer failure");
        },
      },
    ),
    /injected current pointer failure/,
  );
  assert.equal(
    readCurrentChengGrammarCorpus(publishOutput).generationId,
    initialSnapshot.generationId,
    "current pointer rename 前失败必须保留旧 generation",
  );
  assert.throws(
    () => publishGrammarCorpusFiles(
      publishOutput,
      nextFiles,
      {
        beforeCurrentPointerRename() {
          const pointerStat = lstatSync(initialSnapshot.pointerPath);
          utimesSync(
            initialSnapshot.pointerPath,
            new Date(pointerStat.atimeMs),
            new Date(pointerStat.mtimeMs + 60_000),
          );
        },
      },
    ),
    /current snapshot changed before commit/,
    "publisher 必须拒绝同 generationId 的 current identity 漂移",
  );
  assert.equal(
    readCurrentChengGrammarCorpus(publishOutput).generationId,
    initialSnapshot.generationId,
    "current identity 漂移不得切换 generation",
  );
  publishGrammarCorpusFiles(publishOutput, nextFiles);
  const committedSnapshot =
    readCurrentChengGrammarCorpus(publishOutput);
  for (const [name, content] of nextFiles) {
    assert.equal(
      committedSnapshot.files.get(name)?.toString("utf8"),
      content,
      `${name}: current generation 必须逐字节等于完整 staging 集合`,
    );
  }
  const committedPointerInode =
    lstatSync(committedSnapshot.pointerPath).ino;
  const committedInodes = new Map([...committedSnapshot.filePaths]
    .map(([name, path]) => [name, lstatSync(path).ino]));
  publishGrammarCorpusFiles(publishOutput, nextFiles);
  const fixedPointSnapshot =
    readCurrentChengGrammarCorpus(publishOutput);
  assert.equal(
    lstatSync(fixedPointSnapshot.pointerPath).ino,
    committedPointerInode,
    "相同 generation 固定点不得轮换 current pointer inode",
  );
  for (const [name, inode] of committedInodes) {
    assert.equal(
      lstatSync(fixedPointSnapshot.filePaths.get(name)!).ino,
      inode,
      `${name}: 相同 generation 固定点不得轮换 inode`,
    );
  }
  chmodSync(fixedPointSnapshot.pointerPath, 0o644);
  writeFileSync(
    fixedPointSnapshot.pointerPath,
    `sha256-${"0".repeat(64)}\n`,
  );
  assert.throws(
    () => readCurrentChengGrammarCorpus(publishOutput),
    /current generation missing/,
    "current pointer 指向不存在 generation 必须 hard-fail",
  );
  writeFileSync(
    fixedPointSnapshot.pointerPath,
    `${fixedPointSnapshot.generationId}\n`,
  );
  chmodSync(fixedPointSnapshot.pointerPath, 0o444);
  const tamperedGenerationSource =
    fixedPointSnapshot.filePaths.get(changedSourceName)!;
  const generationSourceBytes = readFileSync(tamperedGenerationSource);
  chmodSync(tamperedGenerationSource, 0o644);
  writeFileSync(
    tamperedGenerationSource,
    Buffer.concat([generationSourceBytes, Buffer.from(" ")]),
  );
  assert.throws(
    () => readCurrentChengGrammarCorpus(publishOutput),
    /source hash invalid|content address invalid/,
    "current generation 单字节篡改必须 hard-fail",
  );
  writeFileSync(tamperedGenerationSource, generationSourceBytes);
  chmodSync(tamperedGenerationSource, 0o444);
  assert.equal(
    readCurrentChengGrammarCorpus(publishOutput).generationId,
    fixedPointSnapshot.generationId,
    "mutation 还原后必须恢复同一 current generation",
  );
  assert.equal(
    readdirSync(publishRoot)
      .some((name) =>
        name.startsWith(".grammar-corpus-generation-staging-")),
    false,
    "成功后 staging 必须清零",
  );
  const publishGenerations = resolve(
    publishOutput,
    ".cheng-grammar-corpus-generations",
  );
  for (const generationId of readdirSync(publishGenerations)) {
    chmodSync(resolve(publishGenerations, generationId), 0o755);
  }
  rmSync(publishRoot, {recursive: true, force: true});
  if (process.argv.includes("--source-plan-only")) {
    console.log(
      "item25 current producer source-plan: PASS " +
      `productions=${generatedWithoutReceipts.counts.total} ` +
      `required=${generatedWithoutReceipts.counts.requiredObligationCount} ` +
      `MAPPED=${generatedWithoutReceipts.counts.MAPPED} ` +
      `PARTIAL=${generatedWithoutReceipts.counts.PARTIAL} ` +
      `UNMAPPED=${generatedWithoutReceipts.counts.UNMAPPED} ` +
      `missing=${generatedWithoutReceipts.counts.missingRequiredCount}`,
    );
    return;
  }
  const checkedInMapBytes = readFileSync(mapPath);
  const admittedCurrentAudit =
    validateCurrentUnwitnessedEbnfParserNodeMap(
      checkedInMapBytes,
      specBytes,
      parserBytes,
      claimsBytes,
    );
  const generated = JSON.parse(
    checkedInMapBytes.toString("utf8"),
  ) as EbnfParserNodeMap;
  const producerProjection = (doc: EbnfParserNodeMap) => ({
    schema: doc.schema,
    spec: doc.spec,
    parser: doc.parser,
    producerDeclarations: doc.producerDeclarations,
    requiredObligationCount: doc.counts.requiredObligationCount,
    rows: doc.rows.map((row) => ({
      production: row.production,
      name: row.name,
      body_ref: row.body_ref,
      parser_fn: row.parser_fn,
      node_kinds: row.node_kinds,
      node_kind_receipts: row.node_kind_receipts,
      span_model: row.span_model,
      required_obligation_count: row.required_obligation_count,
      producer_receipt_sha256: row.producer_receipt_sha256,
      notes: row.notes,
    })),
  });
  assert.deepEqual(
    producerProjection(generated),
    producerProjection(generatedWithoutReceipts),
    "checked-in map 的正式 EBNF/parser-owned producer 投影必须可重算",
  );
  assert.equal(generated.schema, CHENG_EBNF_PARSER_NODE_MAP_SCHEMA);
  assert.equal(generated.schema, "cheng_ebnf_parser_node_map");
  assert.doesNotMatch(generated.schema, /\.v[0-9]+$/);
  assert.ok(generated.rows.length > 0);
  assert.equal(generated.counts.total, generated.rows.length);
  assert.equal(
    generated.counts.MAPPED +
      generated.counts.PARTIAL +
      generated.counts.UNMAPPED,
    generated.rows.length,
  );
  assert.equal(
    generated.counts.requiredObligationCount,
    generated.rows.reduce(
      (sum, row) => sum + row.required_obligation_count,
      0,
    ),
  );
  assert.equal(
    generated.counts.missingRequiredCount,
    generated.rows.reduce(
      (sum, row) => sum + row.missing_required_count,
      0,
    ),
  );
  assert.equal(
    generated.counts.requiredObligationCount,
    generated.counts.witnessedRequiredCount +
      generated.counts.missingRequiredCount,
  );
  assert.equal(generated.receiptEvidence.inputCount, 0);
  assert.equal(generated.receiptEvidence.acceptedCount, 0);
  assert.equal(generated.receiptEvidence.rejectedCount, 0);
  assert.equal(generated.receiptEvidence.rows.length, 0);
  assert.equal(generated.counts.MAPPED, 0);
  assert.equal(generated.counts.PARTIAL, generated.counts.total);
  assert.equal(generated.counts.UNMAPPED, 0);
  assert.equal(generated.counts.witnessedRequiredCount, 0);
  assert.equal(
    generated.counts.missingRequiredCount,
    generated.counts.requiredObligationCount,
  );
  assert.ok(generated.rows.every(
    (row) =>
      row.status === "PARTIAL" &&
      !row.receipt_ready &&
      row.witnessed_required_count === 0 &&
      row.missing_required_count === row.required_obligation_count &&
      row.missing_required_obligation_ids.length ===
        row.required_obligation_count,
  ));
  assert.ok(generated.rows.every(
    (row) =>
      row.witness_projections.length === 0 &&
      row.witness_receipt_sha256s.length === 0,
  ), "无真实 parser receipt 时 checked-in map 禁止投影 witness");
  assert.equal(
    admittedCurrentAudit.counts.missingRequiredCount,
    generated.counts.requiredObligationCount,
  );
  const validateCurrentAuditMutation = (candidate: unknown) =>
    validateCurrentUnwitnessedEbnfParserNodeMap(
      Buffer.from(JSON.stringify(candidate)),
      specBytes,
      parserBytes,
      claimsBytes,
    );
  for (const [label, mutate] of [
    [
      "receipt delete",
      (copy: any) => { copy.receiptEvidence.inputCount = 1; },
    ],
    [
      "receipt swap",
      (copy: any) => {
        copy.receiptEvidence.inputCount = 2;
        copy.receiptEvidence.acceptedCount = 2;
        copy.receiptEvidence.rows = [
          {
            sourcePath: "/old/source.cheng",
            receiptPath: "/old/receipt-b.json",
            manifestPath: "/old/manifest.json",
            sourceSha256: "1".repeat(64),
            receiptSha256: "3".repeat(64),
            manifestSha256: "2".repeat(64),
            accepted: true,
            reason: "",
          },
          {
            sourcePath: "/old/source.cheng",
            receiptPath: "/old/receipt-a.json",
            manifestPath: "/old/manifest.json",
            sourceSha256: "1".repeat(64),
            receiptSha256: "4".repeat(64),
            manifestSha256: "2".repeat(64),
            accepted: true,
            reason: "",
          },
        ];
      },
    ],
    [
      "owner span projection",
      (copy: any) => {
        copy.rows[0].witness_projections = [{
          obligation_id:
            copy.rows[0].missing_required_obligation_ids[0],
          parser_node_kind: "ParserTypeSyntaxNominal",
          parser_node_identity_sha256: "5".repeat(64),
          channel: "forged-owner-span",
          receipt_sha256: "3".repeat(64),
        }];
      },
    ],
    [
      "token node projection",
      (copy: any) => {
        copy.rows.find(
          (row: any) => row.span_model === "type_syntax_span",
        ).witness_projections = [{
          obligation_id: copy.rows.find(
            (row: any) => row.span_model === "type_syntax_span",
          ).missing_required_obligation_ids[0],
          parser_node_kind: "ParserValueTokenIdentifier",
          parser_node_identity_sha256: "6".repeat(64),
          channel: "forged-token-node",
          receipt_sha256: "3".repeat(64),
        }];
      },
    ],
    [
      "old parser",
      (copy: any) => { copy.parser.sha256 = "7".repeat(64); },
    ],
    [
      "old driver",
      (copy: any) => {
        copy.receiptEvidence.inputCount = 1;
        copy.receiptEvidence.acceptedCount = 1;
        copy.receiptEvidence.rows = [{
          sourcePath: "/old/source.cheng",
          receiptPath: "/old/receipt.json",
          manifestPath: "/old/manifest.json",
          sourceSha256: "1".repeat(64),
          receiptSha256: "8".repeat(64),
          manifestSha256: "2".repeat(64),
          accepted: true,
          reason: "",
        }];
      },
    ],
  ] as const) {
    const copy = clone(generated);
    mutate(copy);
    assert.throws(
      () => validateCurrentAuditMutation(copy),
      /current unwitnessed EBNF parser map projection is not exact/,
      `${label} mutation 必须 hard-fail`,
    );
  }

  const declarations = JSON.parse(claimsBytes.toString("utf8")) as any;
  assert.equal(
    declarations.schema,
    CHENG_EBNF_PARSER_PRODUCER_CLAIMS_SCHEMA,
  );
  assert.ok(
    declarations.rows.every(
      (row: any) =>
        !("status" in row) &&
        !("coverage" in row) &&
        !("receiptReady" in row) &&
        !("receipt_ready" in row),
    ),
    "producer declaration 禁止手填映射状态或 receipt-ready",
  );

  const byName = new Map(generated.rows.map((row) => [row.name, row]));
  const currentStructureReceiptRows = generated.rows.filter((row) =>
    row.span_model === "line_fact_span" ||
    (row.span_model === "record_fact" &&
      (row.name === "importDecl" || row.name === "modulePath")));
  assert.equal(
    currentStructureReceiptRows.reduce(
      (sum, row) => sum + row.required_obligation_count,
      0,
    ),
    27,
    "current structure receipt 必须覆盖 line-fact 15 与 ImportEdge 12",
  );
  const undeclaredStatementRootRows = generated.rows.filter((row) =>
    row.span_model === "statement_root_span" &&
    !row.node_kinds.some((kind) =>
      kind.startsWith("ParserValueExprStatement")));
  assert.equal(
    undeclaredStatementRootRows.reduce(
      (sum, row) => sum + row.required_obligation_count,
      0,
    ),
    57,
    "无正式 statement-root role 的转发/块 production 必须继续缺失",
  );
  for (const [name, kind, span] of [
    ["typeExpr", "ParserTypeSyntaxKind", "type_syntax_span"],
    ["pattern", "ParserPatternKind", "pattern_span"],
  ] as const) {
    const row = byName.get(name)!;
    assert.notEqual(row.status, "UNMAPPED");
    assert.ok(row.node_kinds.includes(kind));
    assert.equal(row.span_model, span);
  }
  const typeExpr = byName.get("typeExpr")!;
  assert.ok(typeExpr.node_kinds.includes("typeSyntaxQuestionTokenIndexes"));
  assert.match(typeExpr.notes, /optional `\?`.*question token/);
  assert.match(typeExpr.notes, /object inheritance.*base child/);
  const objectType = byName.get("objectType")!;
  assert.ok(objectType.node_kinds.includes("typeSyntaxChildNodeIndexes"));
  assert.ok(objectType.node_kinds.includes("ParserValueTokenOf"));
  assert.match(objectType.notes, /base TypeSyntax child/);
  const implicitObjectType = byName.get("implicitObjectType")!;
  assert.ok(
    implicitObjectType.node_kinds.includes(
      "ParserTypeSyntaxImplicitObject",
    ),
  );
  assert.match(implicitObjectType.notes, /独立 ImplicitObject TypeSyntax 根/);
  const typeParam = byName.get("typeParam")!;
  assert.notEqual(typeParam.status, "UNMAPPED");
  assert.ok(typeParam.node_kinds.includes(
    "typeGenericSymbolConstraintTypeSyntaxNodeIndexes",
  ));
  assert.ok(typeParam.node_kinds.includes(
    "typeGenericSymbolDefaultTypeSyntaxNodeIndexes",
  ));
  assert.match(typeParam.notes, /constraint\/default TypeSyntax.*精确/);
  for (const name of [
    "annotationArgs",
    "annotationArg",
    "annotationList",
    "annotationDict",
    "annotationEntry",
    "annotationKey",
  ]) {
    const row = byName.get(name)!;
    assert.notEqual(row.status, "UNMAPPED");
    assert.equal(row.span_model, "annotation_arg_span");
  }
  const refType = byName.get("refType")!;
  assert.ok(refType.node_kinds.includes("ParserTypeSyntaxRefObject"));
  assert.ok(!refType.node_kinds.includes("ParserTypeSyntaxRef"));
  assert.ok(byName.get("typePrimary")!.node_kinds.includes(
    "ParserTypeSyntaxGrouped",
  ));
  assert.ok(!byName.get("typePostfix")!.node_kinds.includes(
    "ParserTypeSyntaxRawPointer",
  ));
  assert.match(
    specBytes.toString("utf8"),
    /refType\s*::=\s*"ref"\s*objectType\s*;/,
    "托管 ref object 必须保留为正式合法 object kind",
  );

  const grammar = buildChengGrammarObligationContract(specBytes);
  const annotationNames = new Set([
    "annotationArgs",
    "annotationArg",
    "annotationList",
    "annotationDict",
    "annotationEntry",
    "annotationKey",
  ]);
  const obligations = grammar.obligations.filter(
    (entry) =>
      entry.disposition === "required" &&
      annotationNames.has(entry.production),
  );
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as any;
  const mutationSourcePath = resolve(receipt.sourcePath);
  assert.notEqual(
    mutationSourcePath,
    currentAnnotationSourcePath,
    "历史 receipt 必须与 current generation 隔离",
  );
  const historicalSource = [
    "@r1",
    "@r2",
    "@r3",
    "@r4",
    "@r5",
    "@r6",
    "@r7",
    "@r8",
    "let annotationRun = 1",
    "@empty()",
    "let annotationEmpty = 1",
    "@scalar(id)",
    "let annotationScalar = 1",
    "@separators(left: id; right = true)",
    "let annotationSeparators = 1",
    "@all(id, 1, 2.5, \"s\", 'c', false, key = id, " +
      "[id, 1, \"s\", 'c', true, [id], {nested: id}, tail, last, " +
      "extra,], {id: id, \"s\" = 1, 2: true, false: id, a: [id], " +
      "b: {c = id}, d: id, e: id, f: id, g: id,}, extra)",
    "let annotationAll = 1",
    "@empties([], {})",
    "let annotationEmpties = 1",
    "@one([a], {a: a})",
    "let annotationOne = 1",
    "@two([a, b], {a: a, b = b})",
    "let annotationTwo = 1",
    "@trailing([a,], {a: a,})",
    "let annotationTrailing = 1",
    "@deep_list([[[[id]]]])",
    "let annotationDeepList = 1",
    "@deep_dict({a: {b = {c: {d = id}}}})",
    "let annotationDeepDict = 1",
    "@deep_entry(a = b: c = d: e)",
    "let annotationDeepEntry = 1",
    "fn annotated(a: int32, b: int32): int32 =",
    "    return a + b",
  ].join("\n") + "\n";
  assert.equal(
    sha256(historicalSource),
    receipt.sourceSha256,
    "历史 mutation source 必须精确绑定历史 receipt 字节",
  );
  const receiptBytes = readFileSync(receiptPath);
  let mutationReceipt = clone(receipt);
  mutationReceipt.counts.typeSyntaxCount = 0;
  mutationReceipt.counts.typeSyntaxChildCount = 0;
  mutationReceipt.counts.typeEnumVariantCount = 0;
  mutationReceipt.counts.typeSyntaxBracketArgCount = 0;
  mutationReceipt.counts.typeConstExprCount = 0;
  mutationReceipt.counts.typeGenericSymbolCount = 0;
  mutationReceipt.counts.typeGenericSymbolChildCount = 0;
  mutationReceipt.counts.declarationLexicalScopeCount = 2;
  mutationReceipt.counts.declarationCount = 0;
  mutationReceipt.counts.patternCount = 0;
  mutationReceipt.counts.patternChildCount = 0;
  mutationReceipt.typeSyntaxes = [];
  mutationReceipt.typeSyntaxChildren = [];
  mutationReceipt.typeEnumVariants = [];
  mutationReceipt.typeSyntaxBracketArgs = [];
  mutationReceipt.typeConstExprs = [];
  mutationReceipt.typeGenericSymbols = [];
  mutationReceipt.typeGenericSymbolChildren = [];
  mutationReceipt.declarations = [];
  for (const root of mutationReceipt.statementRoots) {
    if (root.role ===
        "ParserValueExprStatementBindingInitializer") {
      root.role = "ParserValueExprStatementExpression";
      root.bindingDeclarationStart = -1;
      root.bindingDeclarationCount = 0;
    }
  }
  const currentStructureFixture =
    buildCurrentStructureMutationFixture(
      mutationReceipt,
      historicalSource,
      tokenKindNamesFromParserSource(parserBytes.toString("utf8")),
    );
  mutationReceipt = currentStructureFixture.receipt;
  const source = currentStructureFixture.source;
  const sourceLexicalScope = {
    index: 0,
    producerSourceIndex: 0,
    sourceLocalRow: 0,
    kind: 1,
    kindText: "ParserDeclarationLexicalScopeSource",
    parentScopeIndex: -1,
    ownerDeclarationIndex: -1,
    spanStart: 0,
    spanEnd: Buffer.byteLength(source, "utf8"),
    identitySha256: "",
  };
  sourceLexicalScope.identitySha256 =
    driverDeclarationLexicalScopeIdentity(sourceLexicalScope);
  const blockLexicalScope = {
    index: 1,
    producerSourceIndex: 0,
    sourceLocalRow: 1,
    kind: 4,
    kindText: "ParserDeclarationLexicalScopeBlock",
    parentScopeIndex: 0,
    ownerDeclarationIndex: -1,
    spanStart: mutationReceipt.tokens[0].start,
    spanEnd: mutationReceipt.tokens[0].end,
    identitySha256: "",
  };
  blockLexicalScope.identitySha256 =
    driverDeclarationLexicalScopeIdentity(blockLexicalScope);
  mutationReceipt.declarationLexicalScopes = [
    sourceLexicalScope,
    blockLexicalScope,
  ];
  mutationReceipt.patterns = [];
  mutationReceipt.patternChildren = [];
  const annotationArgIdentities: string[] = [];
  for (const arg of mutationReceipt.annotationArgs) {
    arg.identitySha256 = parserAnnotationArgIdentity(
      arg,
      source,
      mutationReceipt.tokens,
      mutationReceipt.annotationArgChildren,
      annotationArgIdentities,
    );
    annotationArgIdentities.push(arg.identitySha256);
  }
  for (const annotation of mutationReceipt.annotations) {
    annotation.identitySha256 = parserAnnotationIdentity(
      annotation,
      source,
      mutationReceipt.tokens,
      mutationReceipt.annotationArgRoots,
      annotationArgIdentities,
    );
  }
  const rehashAnnotations = (candidate: any): void => {
    const identities: string[] = [];
    for (const arg of candidate.annotationArgs) {
      arg.identitySha256 = parserAnnotationArgIdentity(
        arg,
        source,
        candidate.tokens,
        candidate.annotationArgChildren,
        identities,
      );
      identities.push(arg.identitySha256);
    }
    for (const annotation of candidate.annotations) {
      annotation.identitySha256 = parserAnnotationIdentity(
        annotation,
        source,
        candidate.tokens,
        candidate.annotationArgRoots,
        identities,
      );
    }
  };
  const mapRows = new Map<string, MapRow>(
    generatedWithoutReceipts.rows.map((row) => [row.name, row]),
  );
  const valueExprKindNames =
    valueExprKindNamesFromParserSource(
      parserBytes.toString("utf8"),
    );
  const moduleObligations = grammar.obligations.filter(
    (entry) =>
      entry.disposition === "required" &&
      entry.production === "module",
  );
  const bindModule = (candidate: any, candidateSource: string) =>
    bindReceiptAgainstObligations(
      JSON.stringify(candidate),
      candidateSource,
      moduleObligations,
      tokenKindNamesFromParserSource(parserBytes.toString("utf8")),
      mapRows,
      valueExprKindNames,
    );
  const moduleBound = bindModule(mutationReceipt, source);
  const moduleResult = (
    path: string,
    variant: string,
  ) => {
    const obligation = moduleObligations.find(
      (entry) =>
        entry.kind === "repetition" &&
        entry.structuralPath === path &&
        entry.variant === variant,
    );
    return obligation === undefined
      ? undefined
      : moduleBound.results.find(
        (result) => result.obligationId === obligation.obligationId);
  };
  assert.equal(
    moduleResult("root.sequence2", "one")?.receipt?.parserNodeKind,
    "ParserValueExprSourceText",
    "module import repetition 必须绑定 SourceText 复合事实",
  );
  assert.equal(
    moduleResult(
      "root.sequence2.repetition0.sequence1",
      "zero",
    )?.receipt?.parserNodeKind,
    "ParserValueExprSourceText",
    "module import 后 NEWLINE zero 必须命中精确 import occurrence",
  );
  const unrelatedGapReceipt = clone(mutationReceipt);
  const importKeywordIndex =
    unrelatedGapReceipt.importEdges[0].keywordTokenIndex;
  const importKeyword = unrelatedGapReceipt.tokens[importKeywordIndex];
  assert.ok(importKeyword !== undefined);
  const sourceBytes = Buffer.from(source, "utf8");
  const unrelatedGapSource = Buffer.concat([
    sourceBytes.subarray(0, importKeyword.start),
    Buffer.from("\n"),
    sourceBytes.subarray(importKeyword.start),
  ]).toString("utf8");
  for (const token of unrelatedGapReceipt.tokens) {
    if (token.index < importKeywordIndex) continue;
    token.start += 1;
    token.end += 1;
    token.line += 1;
  }
  unrelatedGapReceipt.sourceSha256 = sha256(unrelatedGapSource);
  unrelatedGapReceipt.sourceTexts[0].sha256 =
    unrelatedGapReceipt.sourceSha256;
  unrelatedGapReceipt.sourceTexts[0].byteLength =
    Buffer.byteLength(unrelatedGapSource, "utf8");
  unrelatedGapReceipt.declarationLexicalScopes[0].spanEnd =
    unrelatedGapReceipt.sourceTexts[0].byteLength;
  unrelatedGapReceipt.declarationLexicalScopes[0].identitySha256 =
    driverDeclarationLexicalScopeIdentity(
      unrelatedGapReceipt.declarationLexicalScopes[0],
    );
  unrelatedGapReceipt.normalizedScopeFacts[0].endLine += 1;
  unrelatedGapReceipt.normalizedScopeFacts[0].identitySha256 =
    driverNormalizedScopeFactIdentity(
      unrelatedGapReceipt.normalizedScopeFacts[0],
      unrelatedGapSource,
      unrelatedGapReceipt.tokens,
    );
  const unrelatedImportEdge = unrelatedGapReceipt.importEdges[0];
  unrelatedImportEdge.spanStart =
    unrelatedGapReceipt.tokens[
      unrelatedImportEdge.moduleTokenIndexes[
        unrelatedImportEdge.prefixTokenCount
      ]
    ].start;
  unrelatedImportEdge.spanEnd =
    unrelatedGapReceipt.tokens[
      unrelatedImportEdge.moduleTokenIndexes[
        unrelatedImportEdge.moduleTokenIndexes.length - 1
      ]
    ].end;
  unrelatedImportEdge.identitySha256 =
    driverImportEdgeIdentity(
      unrelatedImportEdge,
      unrelatedGapSource,
      unrelatedGapReceipt.tokens,
    );
  const unrelatedGapBound =
    bindModule(unrelatedGapReceipt, unrelatedGapSource);
  const unrelatedImportOneObligation = moduleObligations.find(
    (entry) =>
      entry.kind === "repetition" &&
      entry.structuralPath ===
        "root.sequence2.repetition0.sequence1" &&
      entry.variant === "one",
  );
  assert.ok(unrelatedImportOneObligation !== undefined);
  const unrelatedImportOne = unrelatedGapBound.results.find(
    (result) =>
      result.obligationId ===
        unrelatedImportOneObligation.obligationId,
  );
  assert.equal(
    unrelatedImportOne?.receipt,
    null,
    "import 前的无关空行不得冒充 import occurrence 后的 NEWLINE one",
  );
  const bind = (candidate: any, candidateSource = source) =>
    bindReceiptAgainstObligations(
      JSON.stringify(candidate),
      candidateSource,
      obligations,
      tokenKindNamesFromParserSource(parserBytes.toString("utf8")),
      mapRows,
      valueExprKindNames,
    );
  assert.throws(
    () => bindCurrentReceiptAgainstObligations(
      JSON.stringify(mutationReceipt),
      source,
      specBytes.toString("utf8"),
      obligations,
      tokenKindNamesFromParserSource(parserBytes.toString("utf8")),
      mapRows,
      valueExprKindNames,
    ),
    /current_unknown_annotation_admission:r1/,
    "未注册注解必须在 current semantic admission hard-fail",
  );
  const annotationMutationBound = bind(mutationReceipt);
  assert.equal(
    annotationMutationBound.results.filter(
      (result) => result.receipt === null,
    ).length,
    0,
    "通用 AnnotationArg 正例必须覆盖标量、递归容器、空值、尾逗号与两种 entry/root 分隔符",
  );
  const annotationTokenNames =
    tokenKindNamesFromParserSource(parserBytes.toString("utf8"));
  const annotationTokenKind = (name: string): number => {
    const kind = annotationTokenNames.indexOf(name);
    assert.ok(kind > 0, `current annotation token kind missing: ${name}`);
    return kind;
  };
  const annotationTokensInside = (candidate: any, arg: any): any[] =>
    candidate.tokens.filter((token: any) =>
      token.producerSourceIndex === arg.producerSourceIndex &&
      token.sourceTextId === arg.sourceTextId &&
      token.start >= arg.spanStart &&
      token.end <= arg.spanEnd);

  const scalarTokenKinds = new Map<string, readonly string[]>([
    [
      "ParserAnnotationArgIdentifier",
      [
        "ParserValueTokenIdentifier",
        "ParserValueTokenBlock",
        "ParserValueTokenObject",
      ],
    ],
    [
      "ParserAnnotationArgNumber",
      ["ParserValueTokenInteger", "ParserValueTokenFloat"],
    ],
    ["ParserAnnotationArgString", ["ParserValueTokenString"]],
    ["ParserAnnotationArgCharacter", ["ParserValueTokenChar"]],
    [
      "ParserAnnotationArgBoolean",
      ["ParserValueTokenTrue", "ParserValueTokenFalse"],
    ],
  ]);
  for (const [kindText, tokenKinds] of scalarTokenKinds) {
    const scalar = mutationReceipt.annotationArgs.find(
      (arg: any) => arg.kindText === kindText);
    assert.ok(scalar !== undefined, `${kindText} parser-owned row missing`);
    const tokenKindText = annotationTokenNames[
      mutationReceipt.tokens[scalar.tokenIndex]!.kind];
    assert.ok(tokenKinds.includes(tokenKindText!));

    const invalidScalarKind = clone(mutationReceipt);
    invalidScalarKind.tokens[scalar.tokenIndex].kind =
      annotationTokenKind("ParserValueTokenLeftBrace");
    rehashAnnotations(invalidScalarKind);
    assert.throws(
      () => bind(invalidScalarKind),
      /annotation scalar shape invalid/,
      `${kindText} 必须绑定精确 token kind`,
    );

    const invalidScalarSource = clone(mutationReceipt);
    invalidScalarSource.annotationArgs[scalar.index].sourceTextId += 1;
    rehashAnnotations(invalidScalarSource);
    assert.throws(
      () => bind(invalidScalarSource),
      /annotation arg receipt row invalid/,
      `${kindText} 必须绑定与 token 相同的 sourceTextId`,
    );

    const invalidScalarSpan = clone(mutationReceipt);
    invalidScalarSpan.annotationArgs[scalar.index].spanEnd =
      invalidScalarSpan.tokens[scalar.tokenIndex].end + 1;
    rehashAnnotations(invalidScalarSpan);
    assert.throws(
      () => bind(invalidScalarSpan),
      /annotation scalar shape invalid/,
      `${kindText} span 必须与 token 完全相等`,
    );
  }
  console.log(
    "item25 annotation scalar token/source/span mutations: PASS " +
    `families=${scalarTokenKinds.size} ` +
    `mutations=${scalarTokenKinds.size * 3}`,
  );

  const emptyList = mutationReceipt.annotationArgs.find(
    (arg: any) =>
      arg.kindText === "ParserAnnotationArgList" &&
      arg.childCount === 0,
  );
  assert.ok(emptyList !== undefined);
  const invalidEmptyList = clone(mutationReceipt);
  invalidEmptyList.tokens[emptyList.tokenIndex].kind =
    annotationTokenKind("ParserValueTokenIdentifier");
  rehashAnnotations(invalidEmptyList);
  assert.throws(
    () => bind(invalidEmptyList),
    /annotation container separator invalid/,
    "空 list 必须保留精确 [] token 边界",
  );

  const emptyDict = mutationReceipt.annotationArgs.find(
    (arg: any) =>
      arg.kindText === "ParserAnnotationArgDict" &&
      arg.childCount === 0,
  );
  assert.ok(emptyDict !== undefined);
  const invalidEmptyDict = clone(mutationReceipt);
  invalidEmptyDict.tokens[emptyDict.tokenIndex].kind =
    annotationTokenKind("ParserValueTokenIdentifier");
  rehashAnnotations(invalidEmptyDict);
  assert.throws(
    () => bind(invalidEmptyDict),
    /annotation container separator invalid/,
    "空 dict 必须保留精确 {} token 边界",
  );

  const nestedContainer = mutationReceipt.annotationArgs.find(
    (arg: any) =>
      ["ParserAnnotationArgList", "ParserAnnotationArgDict"].includes(
        arg.kindText,
      ) &&
      mutationReceipt.annotationArgChildren
        .slice(arg.childStart, arg.childStart + arg.childCount)
        .some((child: number) =>
          ["ParserAnnotationArgList", "ParserAnnotationArgDict"].includes(
            mutationReceipt.annotationArgs[child]!.kindText,
          )),
  );
  assert.ok(nestedContainer !== undefined);
  const invalidNestedContainer = clone(mutationReceipt);
  invalidNestedContainer.annotationArgChildren[
    nestedContainer.childStart
  ] = nestedContainer.index;
  assert.throws(
    () => bind(invalidNestedContainer),
    /annotation arg child CSR invalid/,
    "递归容器必须只指向已完成的同 owner 子行",
  );

  const trailingList = mutationReceipt.annotationArgs.find((arg: any) => {
    if (arg.kindText !== "ParserAnnotationArgList" ||
        arg.childCount === 0) return false;
    const tokens = annotationTokensInside(mutationReceipt, arg);
    return annotationTokenNames[tokens.at(-2)?.kind] ===
      "ParserValueTokenComma";
  });
  assert.ok(trailingList !== undefined);
  const invalidTrailingList = clone(mutationReceipt);
  const trailingTokens = annotationTokensInside(
    invalidTrailingList,
    invalidTrailingList.annotationArgs[trailingList.index],
  );
  trailingTokens.at(-2)!.kind =
    annotationTokenKind("ParserValueTokenSemicolon");
  assert.throws(
    () => bind(invalidTrailingList),
    /annotation container trailing separator invalid/,
    "list 尾分隔只允许一个逗号",
  );

  const listWithTwoChildren = mutationReceipt.annotationArgs.find(
    (arg: any) =>
      arg.kindText === "ParserAnnotationArgList" &&
      arg.childCount >= 2,
  );
  assert.ok(listWithTwoChildren !== undefined);
  const invalidListSeparator = clone(mutationReceipt);
  const listChildren = invalidListSeparator.annotationArgChildren
    .slice(
      listWithTwoChildren.childStart,
      listWithTwoChildren.childStart + listWithTwoChildren.childCount,
    )
    .map((row: number) => invalidListSeparator.annotationArgs[row]);
  const listComma = invalidListSeparator.tokens.find((token: any) =>
    token.start >= listChildren[0].spanEnd &&
    token.end <= listChildren[1].spanStart &&
    annotationTokenNames[token.kind] === "ParserValueTokenComma");
  assert.ok(listComma !== undefined);
  listComma.kind = annotationTokenKind("ParserValueTokenSemicolon");
  assert.throws(
    () => bind(invalidListSeparator),
    /annotation container child span invalid/,
    "list 内部元素只允许逗号分隔",
  );

  const colonEntry = mutationReceipt.annotationArgs.find((arg: any) =>
    arg.kindText === "ParserAnnotationArgKeyValue" &&
    annotationTokenNames[
      mutationReceipt.tokens[arg.separatorTokenIndex]?.kind
    ] === "ParserValueTokenColon");
  assert.ok(colonEntry !== undefined);
  const invalidEntrySeparator = clone(mutationReceipt);
  invalidEntrySeparator.tokens[colonEntry.separatorTokenIndex].kind =
    annotationTokenKind("ParserValueTokenSemicolon");
  rehashAnnotations(invalidEntrySeparator);
  assert.throws(
    () => bind(invalidEntrySeparator),
    /annotation KeyValue shape invalid/,
    "annotation entry 只允许 : 或 =",
  );

  const topLevelSeparated = mutationReceipt.annotations.find(
    (annotation: any) => {
      if (annotation.argRootCount < 2) return false;
      const left = mutationReceipt.annotationArgs[
        mutationReceipt.annotationArgRoots[annotation.argRootStart]
      ];
      const right = mutationReceipt.annotationArgs[
        mutationReceipt.annotationArgRoots[annotation.argRootStart + 1]
      ];
      return mutationReceipt.tokens.some((token: any) =>
        token.start >= left.spanEnd &&
        token.end <= right.spanStart &&
        annotationTokenNames[token.kind] ===
          "ParserValueTokenSemicolon");
    },
  );
  assert.ok(topLevelSeparated !== undefined);
  const invalidTopLevelSeparator = clone(mutationReceipt);
  const topLeft = invalidTopLevelSeparator.annotationArgs[
    invalidTopLevelSeparator.annotationArgRoots[
      topLevelSeparated.argRootStart
    ]
  ];
  const topRight = invalidTopLevelSeparator.annotationArgs[
    invalidTopLevelSeparator.annotationArgRoots[
      topLevelSeparated.argRootStart + 1
    ]
  ];
  const topSemicolon = invalidTopLevelSeparator.tokens.find(
    (token: any) =>
      token.start >= topLeft.spanEnd &&
      token.end <= topRight.spanStart &&
      annotationTokenNames[token.kind] ===
        "ParserValueTokenSemicolon",
  );
  assert.ok(topSemicolon !== undefined);
  topSemicolon.kind = annotationTokenKind("ParserValueTokenColon");
  assert.throws(
    () => bind(invalidTopLevelSeparator),
    /annotation root span\/separator invalid/,
    "顶层 annotationArgs 只允许逗号或分号分隔",
  );
  const patternMutationReceipt = clone(mutationReceipt);
  const patternRegion = patternMutationReceipt.regions[8];
  const patternNameToken =
    patternMutationReceipt.tokens[patternRegion.anchorTokenIndex];
  const patternBindingDeclaration = {
    index: 0,
    producerSourceIndex: 0,
    sourceLocalRow: 0,
    sourceTextId: 0,
    kind: 6,
    kindText: "ParserDeclarationLocal",
    nameTokenIndex: patternNameToken.index,
    ownerDeclarationIndex: -1,
    lexicalScopeIndex: 0,
    functionRow: -1,
    typeSyntaxRootIndex: -1,
    genericSymbolStart: -1,
    genericSymbolCount: 0,
    suiteLexicalScopeIndex: -1,
    spanStart: patternRegion.spanStart,
    spanEnd: patternRegion.spanEnd,
    nameSpanStart: patternNameToken.start,
    nameSpanEnd: patternNameToken.end,
    mutableFlag: 0,
    exportedFlag: 0,
    identitySha256: "",
  };
  patternBindingDeclaration.identitySha256 =
    driverDeclarationIdentity(
      patternBindingDeclaration,
      source,
      patternMutationReceipt.tokens,
      [],
      patternMutationReceipt.declarationLexicalScopes,
      patternMutationReceipt.typeSyntaxes,
      patternMutationReceipt.typeGenericSymbols,
    );
  patternMutationReceipt.counts.declarationCount = 1;
  patternMutationReceipt.declarations = [
    patternBindingDeclaration,
  ];
  const patternRow = {
    index: 0,
    producerSourceIndex: 0,
    sourceLocalRow: 0,
    kind: 1,
    kindText: "ParserPatternBinding",
    nameTokenIndex: patternRegion.anchorTokenIndex,
    ownerLexicalScopeIndex: 0,
    ownerKind: 1,
    ownerRow: patternRegion.index,
    bindingDeclarationIndex: 0,
    typeSyntaxRootIndex: -1,
    spanStart: patternRegion.spanStart,
    spanEnd: patternRegion.spanEnd,
    childStart: 0,
    childCount: 0,
    identitySha256: "",
  };
  patternRow.identitySha256 = parserPatternIdentity(patternRow);
  patternMutationReceipt.counts.patternCount = 1;
  patternMutationReceipt.counts.patternChildCount = 0;
  patternMutationReceipt.patterns = [patternRow];
  patternMutationReceipt.patternChildren = [];
  const patternObligations = currentGrammar.obligations.filter(
    (entry) =>
      entry.disposition === "required" &&
      entry.production === "pattern",
  );
  const patternBound = bindReceiptAgainstObligations(
    JSON.stringify(patternMutationReceipt),
    source,
    patternObligations,
    tokenKindNamesFromParserSource(parserBytes.toString("utf8")),
    mapRows,
  );
  const patternRootWitness = patternBound.results.find(
    (result) =>
      result.kind === "production" &&
      result.receipt !== null,
  )?.receipt;
  assert.ok(patternRootWitness !== undefined);
  assert.notEqual(
    patternRootWitness.parserNodeIdentitySha256,
    patternRow.identitySha256,
    "Pattern witness CID 必须再绑定 source/token/scope/owner/child/trace closure",
  );
  for (const [label, mutate, expected] of [
    [
      "owner",
      (copy: any) => {
        copy.declarations[0].ownerDeclarationIndex = 0;
      },
      /driver declaration receipt row invalid: 0/,
    ],
    [
      "span",
      (copy: any) => {
        copy.declarations[0].spanEnd =
          copy.declarations[0].spanStart;
      },
      /driver declaration receipt row invalid: 0/,
    ],
    [
      "source",
      (copy: any) => {
        copy.declarations[0].sourceTextId = 1;
      },
      /driver declaration receipt row invalid: 0/,
    ],
    [
      "CID",
      (copy: any) => {
        copy.declarations[0].identitySha256 = "0".repeat(64);
      },
      /driver declaration receipt row invalid: 0/,
    ],
  ] as const) {
    const copy = clone(patternMutationReceipt);
    mutate(copy);
    assert.throws(
      () => bind(copy),
      expected,
      `Declaration ${label} mutation 必须 hard-fail`,
    );
  }
  const deletedPatternDeclaration = clone(patternMutationReceipt);
  deletedPatternDeclaration.declarations = [];
  deletedPatternDeclaration.counts.declarationCount = 0;
  assert.throws(
    () => bind(deletedPatternDeclaration),
    /driver pattern receipt row invalid: 0|binding authority invalid/,
    "删除 Pattern binding declaration producer 必须 hard-fail",
  );
  const wrongPatternOwner = clone(patternMutationReceipt);
  wrongPatternOwner.patterns[0].ownerRow = 9;
  wrongPatternOwner.patterns[0].identitySha256 =
    parserPatternIdentity(wrongPatternOwner.patterns[0]);
  assert.throws(
    () => bind(wrongPatternOwner),
    /driver pattern region owner invalid/,
    "Pattern 错 owner row 即使重算行 hash 也必须 hard-fail",
  );
  const wrongPatternCid = clone(patternMutationReceipt);
  wrongPatternCid.patterns[0].identitySha256 = "0".repeat(64);
  assert.throws(
    () => bind(wrongPatternCid),
    /driver pattern receipt row invalid: 0/,
    "Pattern 错 CID 必须 hard-fail",
  );
  const deletedValueNode = clone(mutationReceipt);
  deletedValueNode.nodes.pop();
  assert.throws(
    () => bind(deletedValueNode),
    /driver value node count\/array mismatch/,
    "删除 value node 但保留 current count 必须 hard-fail",
  );
  const swappedValueNodes = clone(mutationReceipt);
  [
    swappedValueNodes.nodes[0],
    swappedValueNodes.nodes[1],
  ] = [
    swappedValueNodes.nodes[1],
    swappedValueNodes.nodes[0],
  ];
  assert.throws(
    () => bind(swappedValueNodes),
    /driver value node row invalid/,
    "交换 value node 行必须 hard-fail",
  );
  const childOwnedNode = mutationReceipt.nodes.find(
    (node: any) => node.parent >= 0,
  );
  assert.ok(childOwnedNode !== undefined);
  const crossOwnerValueNode = clone(mutationReceipt);
  const crossOwnerRow =
    crossOwnerValueNode.nodes[childOwnedNode.index];
  crossOwnerRow.parent = -1;
  crossOwnerRow.identitySha256 = parserValueNodeIdentity(
    crossOwnerRow,
    valueExprKindNames.indexOf(crossOwnerRow.kind),
  );
  assert.throws(
    () => bind(crossOwnerValueNode),
    /driver value node child edge invalid|driver value node parent\/child edge invalid/,
    "value node 跨 owner 即使重算行 CID 也必须 hard-fail",
  );
  assert.ok(mutationReceipt.statementRoots.length > 0);
  const swappedStatementAnchor = clone(mutationReceipt);
  const statementRoot = swappedStatementAnchor.statementRoots[0];
  statementRoot.anchorTokenIndex =
    statementRoot.anchorTokenIndex === 0 ? 1 : 0;
  assert.throws(
    () => bind(swappedStatementAnchor),
    /driver statement root row invalid/,
    "statement root 换 anchor token 必须 hard-fail",
  );
  const bindStatementProduction = (
    candidate: any,
    production: string,
  ) => {
    const bound = bindReceiptAgainstObligations(
      JSON.stringify(candidate),
      source,
      currentGrammar.obligations.filter(
        (entry) =>
          entry.disposition === "required" &&
          entry.production === production &&
          entry.kind === "production",
      ),
      tokenKindNamesFromParserSource(parserBytes.toString("utf8")),
      mapRows,
      valueExprKindNames,
    );
    const hit = bound.results.find(
      (result) => result.result.kind === "hit",
    );
    assert.ok(hit !== undefined && hit.result.kind === "hit");
    return hit.result;
  };
  const expressionStatementHit = bindStatementProduction(
    mutationReceipt,
    "expressionStmt",
  );
  assert.equal(
    expressionStatementHit.parserNodeKind,
    "ParserValueExprStatementExpression",
    "statement-root witness 必须保留 receipt role，不得退化为 value node kind",
  );
  assert.notEqual(
    expressionStatementHit.parserNodeIdentitySha256,
    mutationReceipt.nodes[
      mutationReceipt.statementRoots[0].nodeIndex
    ].identitySha256,
    "statement-root witness 不得复用底层 value node CID",
  );
  const returnStatementReceipt = clone(mutationReceipt);
  returnStatementReceipt.statementRoots[0].role =
    "ParserValueExprStatementReturnValue";
  const returnStatementHit = bindStatementProduction(
    returnStatementReceipt,
    "returnStmt",
  );
  assert.equal(
    returnStatementHit.parserNodeKind,
    "ParserValueExprStatementReturnValue",
  );
  assert.notEqual(
    expressionStatementHit.parserNodeIdentitySha256,
    returnStatementHit.parserNodeIdentitySha256,
    "同一 anchor/value node 换 statement role 必须改变复合 witness CID",
  );
  const forgedLValueReceipt = clone(mutationReceipt);
  forgedLValueReceipt.nodes[0].kind = "ParserValueExprIdentifier";
  forgedLValueReceipt.nodes[0].identitySha256 =
    parserValueNodeIdentity(
      forgedLValueReceipt.nodes[0],
      valueExprKindNames.indexOf("ParserValueExprIdentifier"),
    );
  forgedLValueReceipt.regions.push({
    index: forgedLValueReceipt.regions.length,
    kind: "ParserValueExprRegionLValue",
    sourceTextId: 0,
    spanStart: forgedLValueReceipt.nodes[0].spanStart,
    spanEnd: forgedLValueReceipt.nodes[0].spanEnd,
    anchorTokenIndex: forgedLValueReceipt.nodes[0].tokenStart,
  });
  forgedLValueReceipt.counts.regionCount += 1;
  const forgedLValueBound = bindReceiptAgainstObligations(
    JSON.stringify(forgedLValueReceipt),
    source,
    currentGrammar.obligations.filter(
      (entry) =>
        entry.disposition === "required" &&
        entry.production === "lvalue",
    ),
    tokenKindNamesFromParserSource(parserBytes.toString("utf8")),
    mapRows,
    valueExprKindNames,
  );
  assert.equal(
    forgedLValueBound.results.some(
      (result) =>
        result.kind === "production" &&
        result.receipt !== null,
    ),
    false,
    "仅有同 span writable node/LValue region、但无 = 与 AssignmentRhs edge 不得命中",
  );
  const forgedCaseArmReceipt = clone(patternMutationReceipt);
  const forgedCaseArmRegion = {
    ...forgedCaseArmReceipt.regions[8],
    index: forgedCaseArmReceipt.regions.length,
    kind: "ParserValueExprRegionCaseArm",
  };
  forgedCaseArmReceipt.regions.push(forgedCaseArmRegion);
  forgedCaseArmReceipt.counts.regionCount += 1;
  forgedCaseArmReceipt.patterns[0].ownerRow =
    forgedCaseArmRegion.index;
  forgedCaseArmReceipt.patterns[0].identitySha256 =
    parserPatternIdentity(forgedCaseArmReceipt.patterns[0]);
  const forgedCaseArmBound = bindReceiptAgainstObligations(
    JSON.stringify(forgedCaseArmReceipt),
    source,
    currentGrammar.obligations.filter(
      (entry) =>
        entry.disposition === "required" &&
        entry.production === "caseArm",
    ),
    tokenKindNamesFromParserSource(parserBytes.toString("utf8")),
    mapRows,
    valueExprKindNames,
  );
  assert.equal(
    forgedCaseArmBound.results.some(
      (result) =>
        result.kind === "production" &&
        result.receipt !== null,
    ),
    false,
    "缺少精确 of/colon 上下文的 CaseArm region/Pattern owner 不得命中",
  );
  if (process.argv.includes("--static-exact-surfaces-only")) {
    console.log(
      "item25 exact surface static/mutation checks: PASS " +
      "moduleHeader=1 moduleOccurrenceMutations=1 lvalue=4 caseArm=7",
    );
    return;
  }
  const childIdentityReceipt = clone(mutationReceipt);
  const tupleSurface =
    "type TupleAuthority = tuple[int32, int64]\n";
  const tupleSurfaceStart = Buffer.byteLength(source, "utf8");
  const childIdentitySource = source + tupleSurface;
  const tupleLine = source.split("\n").length;
  const currentTokenKindNames =
    tokenKindNamesFromParserSource(parserBytes.toString("utf8"));
  const appendedTypeTokens = [
    ["ParserValueTokenType", "type", 0, 4],
    ["ParserValueTokenIdentifier", "TupleAuthority", 5, 19],
    ["ParserValueTokenAssign", "=", 20, 21],
    ["ParserValueTokenTuple", "tuple", 22, 27],
    ["ParserValueTokenLeftBracket", "[", 27, 28],
    ["ParserValueTokenIdentifier", "int32", 28, 33],
    ["ParserValueTokenComma", ",", 33, 34],
    ["ParserValueTokenIdentifier", "int64", 35, 40],
    ["ParserValueTokenRightBracket", "]", 40, 41],
  ].map(([kindText, _text, start, end], offset) => {
    const index = childIdentityReceipt.tokens.length + offset;
    const kind = currentTokenKindNames.indexOf(String(kindText));
    assert.ok(kind > 0, `current token kind missing: ${kindText}`);
    return {
      index,
      kind,
      sourceTextId: 0,
      start: tupleSurfaceStart + Number(start),
      end: tupleSurfaceStart + Number(end),
      line: tupleLine,
      column: Number(start) + 1,
      producerSourceIndex: 0,
      sourceLocalIndex: index,
      lexicalParentIndex: -1,
    };
  });
  childIdentityReceipt.tokens.push(...appendedTypeTokens);
  childIdentityReceipt.counts.tokenCount =
    childIdentityReceipt.tokens.length;
  childIdentityReceipt.sourceSha256 = sha256(childIdentitySource);
  childIdentityReceipt.sourceTexts[0].sha256 =
    childIdentityReceipt.sourceSha256;
  childIdentityReceipt.sourceTexts[0].byteLength =
    Buffer.byteLength(childIdentitySource, "utf8");
  childIdentityReceipt.declarationLexicalScopes[0].spanEnd =
    childIdentityReceipt.sourceTexts[0].byteLength;
  childIdentityReceipt.declarationLexicalScopes[0].identitySha256 =
    driverDeclarationLexicalScopeIdentity(
      childIdentityReceipt.declarationLexicalScopes[0],
    );
  const typeDeclarationTokenIndex = appendedTypeTokens[0]!.index;
  const typeDeclarationNameTokenIndex = appendedTypeTokens[1]!.index;
  const tupleMarkerTokenIndex = appendedTypeTokens[3]!.index;
  const tupleFirstTypeTokenIndex = appendedTypeTokens[5]!.index;
  const tupleSecondTypeTokenIndex = appendedTypeTokens[7]!.index;
  const typeSyntaxChildren = [0, 1];
  const typeSyntaxRows: any[] = [
    {
      index: 0,
      producerSourceIndex: 0,
      sourceLocalRow: 0,
      sourceTextId: 0,
      kind: 1,
      kindText: "ParserTypeSyntaxNominal",
      spanStart: appendedTypeTokens[5]!.start,
      spanEnd: appendedTypeTokens[5]!.end,
      ownerTokenIndex: typeDeclarationNameTokenIndex,
      declarationOwnerTokenIndex: -1,
      declarationOwnerIndex: -1,
      genericSymbolStart: -1,
      genericSymbolCount: 0,
      childStart: 0,
      childCount: 0,
      bracketArgStart: 0,
      bracketArgCount: 0,
      nameTokenIndex: tupleFirstTypeTokenIndex,
      fixedLength: -1,
      questionTokenIndex: -1,
      rootKind: 0,
      enumVariantStart: -1,
      enumVariantCount: 0,
      identitySha256: "",
    },
    {
      index: 1,
      producerSourceIndex: 0,
      sourceLocalRow: 1,
      sourceTextId: 0,
      kind: 1,
      kindText: "ParserTypeSyntaxNominal",
      spanStart: appendedTypeTokens[7]!.start,
      spanEnd: appendedTypeTokens[7]!.end,
      ownerTokenIndex: typeDeclarationNameTokenIndex,
      declarationOwnerTokenIndex: -1,
      declarationOwnerIndex: -1,
      genericSymbolStart: -1,
      genericSymbolCount: 0,
      childStart: 0,
      childCount: 0,
      bracketArgStart: 0,
      bracketArgCount: 0,
      nameTokenIndex: tupleSecondTypeTokenIndex,
      fixedLength: -1,
      questionTokenIndex: -1,
      rootKind: 0,
      enumVariantStart: -1,
      enumVariantCount: 0,
      identitySha256: "",
    },
    {
      index: 2,
      producerSourceIndex: 0,
      sourceLocalRow: 2,
      sourceTextId: 0,
      kind: 6,
      kindText: "ParserTypeSyntaxTuple",
      spanStart: appendedTypeTokens[3]!.start,
      spanEnd: appendedTypeTokens[8]!.end,
      ownerTokenIndex: typeDeclarationNameTokenIndex,
      declarationOwnerTokenIndex: typeDeclarationNameTokenIndex,
      declarationOwnerIndex: 2,
      genericSymbolStart: -1,
      genericSymbolCount: 0,
      childStart: 0,
      childCount: 2,
      bracketArgStart: 0,
      bracketArgCount: 0,
      nameTokenIndex: tupleMarkerTokenIndex,
      fixedLength: -1,
      questionTokenIndex: -1,
      rootKind: 3,
      enumVariantStart: -1,
      enumVariantCount: 0,
      identitySha256: "",
    },
  ];
  for (const row of typeSyntaxRows) {
    row.identitySha256 =
      parserTypeSyntaxIdentity(row, typeSyntaxChildren);
  }
  childIdentityReceipt.counts.typeSyntaxCount = typeSyntaxRows.length;
  childIdentityReceipt.counts.typeSyntaxChildCount =
    typeSyntaxChildren.length;
  childIdentityReceipt.typeSyntaxes = typeSyntaxRows;
  childIdentityReceipt.typeSyntaxChildren = typeSyntaxChildren;
  const typeDeclaration = {
    index: 0,
    producerSourceIndex: 0,
    sourceLocalRow: 0,
    sourceTextId: 0,
    kind: 2,
    kindText: "ParserDeclarationType",
    nameTokenIndex: typeDeclarationNameTokenIndex,
    ownerDeclarationIndex: -1,
    lexicalScopeIndex: 0,
    functionRow: -1,
    typeSyntaxRootIndex: 2,
    genericSymbolStart: -1,
    genericSymbolCount: 0,
    suiteLexicalScopeIndex: -1,
    spanStart: appendedTypeTokens[0]!.start,
    spanEnd: appendedTypeTokens[8]!.end,
    nameSpanStart: appendedTypeTokens[1]!.start,
    nameSpanEnd: appendedTypeTokens[1]!.end,
    mutableFlag: 0,
    exportedFlag: 1,
    identitySha256: "",
  };
  typeDeclaration.identitySha256 = driverDeclarationIdentity(
    typeDeclaration,
    childIdentitySource,
    childIdentityReceipt.tokens,
    [],
    childIdentityReceipt.declarationLexicalScopes,
    typeSyntaxRows,
    [],
  );
  childIdentityReceipt.declarations = [typeDeclaration];
  childIdentityReceipt.counts.declarationCount = 1;
  bind(childIdentityReceipt, childIdentitySource);
  const typeExprBound = bindReceiptAgainstObligations(
    JSON.stringify(childIdentityReceipt),
    childIdentitySource,
    currentGrammar.obligations.filter(
      (entry) =>
        entry.disposition === "required" &&
        entry.production === "typeExpr",
    ),
    currentTokenKindNames,
    mapRows,
  );
  const typeExprRootWitness = typeExprBound.results.find(
    (result) =>
      result.kind === "production" &&
      result.receipt !== null,
  )?.receipt;
  assert.ok(typeExprRootWitness !== undefined);
  assert.notEqual(
    typeExprRootWitness.parserNodeIdentitySha256,
    typeSyntaxRows[0]!.identitySha256,
    "TypeSyntax witness CID 必须再绑定 source/token/owner/child/trace closure",
  );
  const swappedChildIdentity = clone(childIdentityReceipt);
  swappedChildIdentity.typeSyntaxChildren = [1, 0];
  assert.throws(
    () => bind(swappedChildIdentity, childIdentitySource),
    /driver TypeSyntax receipt row invalid: 2/,
    "TypeSyntax 行身份必须绑定有序 child targets",
  );
  const wrongDeclarationOwnerDomain = clone(childIdentityReceipt);
  wrongDeclarationOwnerDomain.typeSyntaxes[2].declarationOwnerIndex = 0;
  wrongDeclarationOwnerDomain.typeSyntaxes[2].identitySha256 =
    parserTypeSyntaxIdentity(
      wrongDeclarationOwnerDomain.typeSyntaxes[2],
      wrongDeclarationOwnerDomain.typeSyntaxChildren,
    );
  wrongDeclarationOwnerDomain.declarations[0].identitySha256 =
    driverDeclarationIdentity(
      wrongDeclarationOwnerDomain.declarations[0],
      childIdentitySource,
      wrongDeclarationOwnerDomain.tokens,
      [],
      wrongDeclarationOwnerDomain.declarationLexicalScopes,
      wrongDeclarationOwnerDomain.typeSyntaxes,
      [],
    );
  assert.throws(
    () => bind(wrongDeclarationOwnerDomain, childIdentitySource),
    /driver TypeSyntax receipt row invalid: 2/,
    "TypeSyntax declarationOwnerIndex 必须是 TypeSyntax self/owner 边，不能按 Declaration 行解释",
  );
  const objectReceipt = clone(childIdentityReceipt);
  const objectSurface = [
    "type ObjectAuthority = object:",
    "    left: int32",
    "    right: int64",
    "",
  ].join("\n");
  const objectSurfaceStart =
    Buffer.byteLength(childIdentitySource, "utf8");
  const objectSource = childIdentitySource + objectSurface;
  const objectLine = childIdentitySource.split("\n").length;
  const objectTokenSpecs = [
    ["ParserValueTokenType", "type", 0, 4, 0],
    ["ParserValueTokenIdentifier", "ObjectAuthority", 5, 20, 0],
    ["ParserValueTokenAssign", "=", 21, 22, 0],
    ["ParserValueTokenObject", "object", 23, 29, 0],
    ["ParserValueTokenColon", ":", 29, 30, 0],
    ["ParserValueTokenIdentifier", "left", 35, 39, 1],
    ["ParserValueTokenColon", ":", 39, 40, 1],
    ["ParserValueTokenIdentifier", "int32", 41, 46, 1],
    ["ParserValueTokenIdentifier", "right", 51, 56, 2],
    ["ParserValueTokenColon", ":", 56, 57, 2],
    ["ParserValueTokenIdentifier", "int64", 58, 63, 2],
  ] as const;
  const objectTokens = objectTokenSpecs.map(
    ([kindText, _text, start, end, lineOffset], offset) => {
      const kind = currentTokenKindNames.indexOf(kindText);
      assert.ok(kind > 0, `current token kind missing: ${kindText}`);
      return {
        index: objectReceipt.tokens.length + offset,
        kind,
        sourceTextId: 0,
        start: objectSurfaceStart + start,
        end: objectSurfaceStart + end,
        line: objectLine + lineOffset,
        column: lineOffset === 0 ? start + 1 : start - (
          lineOffset === 1 ? 30 : 46),
        producerSourceIndex: 0,
        sourceLocalIndex: objectReceipt.tokens.length + offset,
        lexicalParentIndex: -1,
      };
    },
  );
  objectReceipt.tokens.push(...objectTokens);
  objectReceipt.counts.tokenCount = objectReceipt.tokens.length;
  objectReceipt.sourceSha256 = sha256(objectSource);
  objectReceipt.sourceTexts[0].sha256 = objectReceipt.sourceSha256;
  objectReceipt.sourceTexts[0].byteLength =
    Buffer.byteLength(objectSource, "utf8");
  objectReceipt.declarationLexicalScopes[0].spanEnd =
    objectReceipt.sourceTexts[0].byteLength;
  objectReceipt.declarationLexicalScopes[0].identitySha256 =
    driverDeclarationLexicalScopeIdentity(
      objectReceipt.declarationLexicalScopes[0],
    );
  const objectTypeScope = {
    index: objectReceipt.declarationLexicalScopes.length,
    producerSourceIndex: 0,
    sourceLocalRow: objectReceipt.declarationLexicalScopes.length,
    kind: 2,
    kindText: "ParserDeclarationLexicalScopeType",
    parentScopeIndex: 0,
    ownerDeclarationIndex: 1,
    spanStart: objectTokens[0]!.start,
    spanEnd: objectTokens[10]!.end,
    identitySha256: "",
  };
  objectTypeScope.identitySha256 =
    driverDeclarationLexicalScopeIdentity(objectTypeScope);
  objectReceipt.declarationLexicalScopes.push(objectTypeScope);
  objectReceipt.counts.declarationLexicalScopeCount =
    objectReceipt.declarationLexicalScopes.length;
  const objectTypeRows = objectReceipt.typeSyntaxes;
  objectTypeRows.push(
    {
      index: 3,
      producerSourceIndex: 0,
      sourceLocalRow: 3,
      sourceTextId: 0,
      kind: 10,
      kindText: "ParserTypeSyntaxObject",
      spanStart: objectTokens[3]!.start,
      spanEnd: objectTokens[3]!.end,
      ownerTokenIndex: objectTokens[1]!.index,
      declarationOwnerTokenIndex: objectTokens[1]!.index,
      declarationOwnerIndex: 3,
      genericSymbolStart: -1,
      genericSymbolCount: 0,
      childStart: 2,
      childCount: 0,
      bracketArgStart: 0,
      bracketArgCount: 0,
      nameTokenIndex: objectTokens[3]!.index,
      fixedLength: -1,
      questionTokenIndex: -1,
      rootKind: 3,
      enumVariantStart: -1,
      enumVariantCount: 0,
      identitySha256: "",
    },
    {
      index: 4,
      producerSourceIndex: 0,
      sourceLocalRow: 4,
      sourceTextId: 0,
      kind: 1,
      kindText: "ParserTypeSyntaxNominal",
      spanStart: objectTokens[7]!.start,
      spanEnd: objectTokens[7]!.end,
      ownerTokenIndex: objectTokens[5]!.index,
      declarationOwnerTokenIndex: objectTokens[1]!.index,
      declarationOwnerIndex: 3,
      genericSymbolStart: -1,
      genericSymbolCount: 0,
      childStart: 2,
      childCount: 0,
      bracketArgStart: 0,
      bracketArgCount: 0,
      nameTokenIndex: objectTokens[7]!.index,
      fixedLength: -1,
      questionTokenIndex: -1,
      rootKind: 4,
      enumVariantStart: -1,
      enumVariantCount: 0,
      identitySha256: "",
    },
    {
      index: 5,
      producerSourceIndex: 0,
      sourceLocalRow: 5,
      sourceTextId: 0,
      kind: 1,
      kindText: "ParserTypeSyntaxNominal",
      spanStart: objectTokens[10]!.start,
      spanEnd: objectTokens[10]!.end,
      ownerTokenIndex: objectTokens[8]!.index,
      declarationOwnerTokenIndex: objectTokens[1]!.index,
      declarationOwnerIndex: 3,
      genericSymbolStart: -1,
      genericSymbolCount: 0,
      childStart: 2,
      childCount: 0,
      bracketArgStart: 0,
      bracketArgCount: 0,
      nameTokenIndex: objectTokens[10]!.index,
      fixedLength: -1,
      questionTokenIndex: -1,
      rootKind: 4,
      enumVariantStart: -1,
      enumVariantCount: 0,
      identitySha256: "",
    },
  );
  for (const row of objectTypeRows) {
    row.identitySha256 =
      parserTypeSyntaxIdentity(row, objectReceipt.typeSyntaxChildren);
  }
  objectReceipt.counts.typeSyntaxCount = objectTypeRows.length;
  const objectDeclarations = objectReceipt.declarations;
  objectDeclarations[0].identitySha256 = driverDeclarationIdentity(
    objectDeclarations[0],
    objectSource,
    objectReceipt.tokens,
    [],
    objectReceipt.declarationLexicalScopes,
    objectTypeRows,
    [],
  );
  const objectDeclaration = {
    index: 1,
    producerSourceIndex: 0,
    sourceLocalRow: 1,
    sourceTextId: 0,
    kind: 2,
    kindText: "ParserDeclarationType",
    nameTokenIndex: objectTokens[1]!.index,
    ownerDeclarationIndex: -1,
    lexicalScopeIndex: 0,
    functionRow: -1,
    typeSyntaxRootIndex: 3,
    genericSymbolStart: -1,
    genericSymbolCount: 0,
    suiteLexicalScopeIndex: -1,
    spanStart: objectTokens[0]!.start,
    spanEnd: objectTokens[10]!.end,
    nameSpanStart: objectTokens[1]!.start,
    nameSpanEnd: objectTokens[1]!.end,
    mutableFlag: 0,
    exportedFlag: 1,
    identitySha256: "",
  };
  objectDeclaration.identitySha256 = driverDeclarationIdentity(
    objectDeclaration,
    objectSource,
    objectReceipt.tokens,
    [objectDeclarations[0].identitySha256],
    objectReceipt.declarationLexicalScopes,
    objectTypeRows,
    [],
  );
  objectDeclarations.push(objectDeclaration);
  for (const [
    nameToken,
    typeRootIndex,
    spanEndToken,
  ] of [
    [objectTokens[5]!, 4, objectTokens[7]!],
    [objectTokens[8]!, 5, objectTokens[10]!],
  ] as const) {
    const field = {
      index: objectDeclarations.length,
      producerSourceIndex: 0,
      sourceLocalRow: objectDeclarations.length,
      sourceTextId: 0,
      kind: 4,
      kindText: "ParserDeclarationField",
      nameTokenIndex: nameToken.index,
      ownerDeclarationIndex: objectDeclaration.index,
      lexicalScopeIndex: objectTypeScope.index,
      functionRow: -1,
      typeSyntaxRootIndex: typeRootIndex,
      genericSymbolStart: -1,
      genericSymbolCount: 0,
      suiteLexicalScopeIndex: -1,
      spanStart: nameToken.start,
      spanEnd: spanEndToken.end,
      nameSpanStart: nameToken.start,
      nameSpanEnd: nameToken.end,
      mutableFlag: 0,
      exportedFlag: 0,
      identitySha256: "",
    };
    field.identitySha256 = driverDeclarationIdentity(
      field,
      objectSource,
      objectReceipt.tokens,
      objectDeclarations.map((entry: any) => entry.identitySha256),
      objectReceipt.declarationLexicalScopes,
      objectTypeRows,
      [],
    );
    objectDeclarations.push(field);
  }
  objectReceipt.counts.declarationCount = objectDeclarations.length;
  objectReceipt.regions.push({
    index: objectReceipt.regions.length,
    kind: "ParserValueExprRegionFieldBlock",
    sourceTextId: 0,
    spanStart: objectTokens[5]!.start,
    spanEnd: objectTokens[10]!.end,
    anchorTokenIndex: objectTokens[5]!.index,
  });
  objectReceipt.counts.regionCount = objectReceipt.regions.length;
  const objectObligations = grammar.obligations.filter(
    (entry) =>
      entry.disposition === "required" &&
      entry.production === "objectFields",
  );
  const objectBound = bindReceiptAgainstObligations(
    JSON.stringify(objectReceipt),
    objectSource,
    objectObligations,
    currentTokenKindNames,
    mapRows,
    valueExprKindNames,
  );
  const objectRootReceipt = objectBound.results.find(
    (result) => result.kind === "production",
  )?.receipt;
  assert.equal(
    objectRootReceipt?.parserNodeKind,
    "ParserValueExprRegionFieldBlock",
    "objectFields 多字段复合必须使用正式 FieldBlock 结构 kind",
  );
  const objectOneObligation = objectObligations.find(
    (entry) =>
      entry.kind === "repetition" &&
      entry.variant === "one",
  );
  assert.ok(objectOneObligation !== undefined);
  assert.equal(
    objectBound.results.find((result) =>
      result.obligationId === objectOneObligation.obligationId)
      ?.receipt?.parserNodeKind,
    "ParserValueExprRegionFieldBlock",
    "objectFields direct-field CSR one 必须真实命中",
  );
  const wrongObjectOwner = clone(objectReceipt);
  wrongObjectOwner.typeSyntaxes[4].declarationOwnerIndex = 2;
  wrongObjectOwner.typeSyntaxes[4].identitySha256 =
    parserTypeSyntaxIdentity(
      wrongObjectOwner.typeSyntaxes[4],
      wrongObjectOwner.typeSyntaxChildren,
    );
  assert.throws(
    () => bindReceiptAgainstObligations(
      JSON.stringify(wrongObjectOwner),
      objectSource,
      objectObligations,
      currentTokenKindNames,
      mapRows,
      valueExprKindNames,
    ),
    /driver TypeSyntax receipt row invalid: 4/,
    "objectFields field TypeSyntax owner 改绑非 object target 必须 hard-fail",
  );
  const wrongFieldDeclarationOwner = clone(objectReceipt);
  const siblingTypeDeclaration =
    wrongFieldDeclarationOwner.declarations[0];
  const siblingTypeRoot =
    wrongFieldDeclarationOwner.typeSyntaxes[
      siblingTypeDeclaration.typeSyntaxRootIndex
    ];
  const siblingTypeMarker =
    wrongFieldDeclarationOwner.tokens[siblingTypeRoot.nameTokenIndex];
  const movedFieldDeclaration =
    wrongFieldDeclarationOwner.declarations[2];
  const movedFieldType =
    wrongFieldDeclarationOwner.typeSyntaxes[
      movedFieldDeclaration.typeSyntaxRootIndex
    ];
  siblingTypeMarker.kind =
    currentTokenKindNames.indexOf("ParserValueTokenObject");
  siblingTypeRoot.kind = 10;
  siblingTypeRoot.kindText = "ParserTypeSyntaxObject";
  siblingTypeRoot.spanEnd = siblingTypeMarker.end;
  siblingTypeRoot.childStart =
    wrongFieldDeclarationOwner.typeSyntaxChildren.length;
  siblingTypeRoot.childCount = 0;
  siblingTypeDeclaration.spanEnd = movedFieldDeclaration.spanEnd;
  const siblingTypeScope = {
    index: wrongFieldDeclarationOwner.declarationLexicalScopes.length,
    producerSourceIndex: 0,
    sourceLocalRow:
      wrongFieldDeclarationOwner.declarationLexicalScopes.length,
    kind: 2,
    kindText: "ParserDeclarationLexicalScopeType",
    parentScopeIndex: siblingTypeDeclaration.lexicalScopeIndex,
    ownerDeclarationIndex: siblingTypeDeclaration.index,
    spanStart: siblingTypeDeclaration.spanStart,
    spanEnd: siblingTypeDeclaration.spanEnd,
    identitySha256: "",
  };
  wrongFieldDeclarationOwner.declarationLexicalScopes.push(
    siblingTypeScope,
  );
  wrongFieldDeclarationOwner.counts.declarationLexicalScopeCount =
    wrongFieldDeclarationOwner.declarationLexicalScopes.length;
  movedFieldDeclaration.ownerDeclarationIndex =
    siblingTypeDeclaration.index;
  movedFieldDeclaration.lexicalScopeIndex = siblingTypeScope.index;
  movedFieldType.declarationOwnerIndex = siblingTypeRoot.index;
  movedFieldType.declarationOwnerTokenIndex =
    siblingTypeRoot.declarationOwnerTokenIndex;
  for (const scope of wrongFieldDeclarationOwner.declarationLexicalScopes) {
    scope.identitySha256 = driverDeclarationLexicalScopeIdentity(scope);
  }
  for (const typeSyntax of wrongFieldDeclarationOwner.typeSyntaxes) {
    typeSyntax.identitySha256 = parserTypeSyntaxIdentity(
      typeSyntax,
      wrongFieldDeclarationOwner.typeSyntaxChildren,
    );
  }
  const wrongFieldDeclarationIdentities: string[] = [];
  for (const declaration of wrongFieldDeclarationOwner.declarations) {
    declaration.identitySha256 = driverDeclarationIdentity(
      declaration,
      objectSource,
      wrongFieldDeclarationOwner.tokens,
      wrongFieldDeclarationIdentities,
      wrongFieldDeclarationOwner.declarationLexicalScopes,
      wrongFieldDeclarationOwner.typeSyntaxes,
      wrongFieldDeclarationOwner.typeGenericSymbols,
    );
    wrongFieldDeclarationIdentities.push(declaration.identitySha256);
  }
  assert.throws(
    () => bindReceiptAgainstObligations(
      JSON.stringify(wrongFieldDeclarationOwner),
      objectSource,
      objectObligations,
      currentTokenKindNames,
      mapRows,
      valueExprKindNames,
    ),
    /driver object FieldBlock\/direct owner join invalid: 0/,
    "Field owner/scope/TypeSyntax 全同步改绑 sibling Type 并重算全部关联 CID 后，FieldBlock direct owner 不一致仍必须 hard-fail",
  );
  const enumReceipt = clone(objectReceipt);
  const enumSurface = [
    "type EnumAuthority = enum:",
    "    First",
    "    Second",
    "",
  ].join("\n");
  const enumSurfaceStart = Buffer.byteLength(objectSource, "utf8");
  const enumSource = objectSource + enumSurface;
  const enumLine = objectSource.split("\n").length;
  const enumTokenSpecs = [
    ["ParserValueTokenType", 0, 4, 0],
    ["ParserValueTokenIdentifier", 5, 18, 0],
    ["ParserValueTokenAssign", 19, 20, 0],
    ["ParserValueTokenEnum", 21, 25, 0],
    ["ParserValueTokenColon", 25, 26, 0],
    ["ParserValueTokenIdentifier", 31, 36, 1],
    ["ParserValueTokenIdentifier", 41, 47, 2],
  ] as const;
  const enumTokens = enumTokenSpecs.map(
    ([kindText, start, end, lineOffset], offset) => {
      const kind = currentTokenKindNames.indexOf(kindText);
      assert.ok(kind > 0, `current token kind missing: ${kindText}`);
      return {
        index: enumReceipt.tokens.length + offset,
        kind,
        sourceTextId: 0,
        start: enumSurfaceStart + start,
        end: enumSurfaceStart + end,
        line: enumLine + lineOffset,
        column: lineOffset === 0
          ? start + 1
          : start - (lineOffset === 1 ? 26 : 36),
        producerSourceIndex: 0,
        sourceLocalIndex: enumReceipt.tokens.length + offset,
        lexicalParentIndex: -1,
      };
    },
  );
  enumReceipt.tokens.push(...enumTokens);
  enumReceipt.counts.tokenCount = enumReceipt.tokens.length;
  enumReceipt.sourceSha256 = sha256(enumSource);
  enumReceipt.sourceTexts[0].sha256 = enumReceipt.sourceSha256;
  enumReceipt.sourceTexts[0].byteLength =
    Buffer.byteLength(enumSource, "utf8");
  enumReceipt.declarationLexicalScopes[0].spanEnd =
    enumReceipt.sourceTexts[0].byteLength;
  enumReceipt.declarationLexicalScopes[0].identitySha256 =
    driverDeclarationLexicalScopeIdentity(
      enumReceipt.declarationLexicalScopes[0],
    );
  const enumDeclarationIndex = enumReceipt.declarations.length;
  const enumTypeScope = {
    index: enumReceipt.declarationLexicalScopes.length,
    producerSourceIndex: 0,
    sourceLocalRow: enumReceipt.declarationLexicalScopes.length,
    kind: 2,
    kindText: "ParserDeclarationLexicalScopeType",
    parentScopeIndex: 0,
    ownerDeclarationIndex: enumDeclarationIndex,
    spanStart: enumTokens[0]!.start,
    spanEnd: enumTokens[6]!.end,
    identitySha256: "",
  };
  enumTypeScope.identitySha256 =
    driverDeclarationLexicalScopeIdentity(enumTypeScope);
  enumReceipt.declarationLexicalScopes.push(enumTypeScope);
  enumReceipt.counts.declarationLexicalScopeCount =
    enumReceipt.declarationLexicalScopes.length;
  const enumTypeRow = {
    index: enumReceipt.typeSyntaxes.length,
    producerSourceIndex: 0,
    sourceLocalRow: enumReceipt.typeSyntaxes.length,
    sourceTextId: 0,
    kind: 13,
    kindText: "ParserTypeSyntaxEnum",
    spanStart: enumTokens[3]!.start,
    spanEnd: enumTokens[3]!.end,
    ownerTokenIndex: enumTokens[1]!.index,
    declarationOwnerTokenIndex: enumTokens[1]!.index,
    declarationOwnerIndex: enumReceipt.typeSyntaxes.length,
    genericSymbolStart: -1,
    genericSymbolCount: 0,
    childStart: enumReceipt.typeSyntaxChildren.length,
    childCount: 0,
    bracketArgStart: 0,
    bracketArgCount: 0,
    nameTokenIndex: enumTokens[3]!.index,
    fixedLength: -1,
    questionTokenIndex: -1,
    rootKind: 3,
    enumVariantStart: 0,
    enumVariantCount: 2,
    identitySha256: "",
  };
  enumTypeRow.identitySha256 =
    parserTypeSyntaxIdentity(
      enumTypeRow,
      enumReceipt.typeSyntaxChildren,
    );
  enumReceipt.typeSyntaxes.push(enumTypeRow);
  enumReceipt.counts.typeSyntaxCount = enumReceipt.typeSyntaxes.length;
  const enumVariants = [
    {
      index: 0,
      producerSourceIndex: 0,
      declarationOwnerIndex: enumTypeRow.index,
      declarationOwnerTokenIndex: enumTokens[1]!.index,
      nameTokenIndex: enumTokens[5]!.index,
      ordinal: 0,
      payloadTypeSyntaxIndex: -1,
      identitySha256: "",
    },
    {
      index: 1,
      producerSourceIndex: 0,
      declarationOwnerIndex: enumTypeRow.index,
      declarationOwnerTokenIndex: enumTokens[1]!.index,
      nameTokenIndex: enumTokens[6]!.index,
      ordinal: 1,
      payloadTypeSyntaxIndex: -1,
      identitySha256: "",
    },
  ];
  for (const variant of enumVariants) {
    variant.identitySha256 = parserTypeEnumVariantIdentity(
      variant,
      enumSource,
      enumReceipt.tokens,
      enumReceipt.typeSyntaxes,
    );
  }
  enumReceipt.typeEnumVariants = enumVariants;
  enumReceipt.counts.typeEnumVariantCount = enumVariants.length;
  const declarationIdentities: string[] = [];
  for (const declaration of enumReceipt.declarations) {
    declaration.identitySha256 = driverDeclarationIdentity(
      declaration,
      enumSource,
      enumReceipt.tokens,
      declarationIdentities,
      enumReceipt.declarationLexicalScopes,
      enumReceipt.typeSyntaxes,
      [],
    );
    declarationIdentities.push(declaration.identitySha256);
  }
  const enumDeclaration = {
    index: enumDeclarationIndex,
    producerSourceIndex: 0,
    sourceLocalRow: enumDeclarationIndex,
    sourceTextId: 0,
    kind: 2,
    kindText: "ParserDeclarationType",
    nameTokenIndex: enumTokens[1]!.index,
    ownerDeclarationIndex: -1,
    lexicalScopeIndex: 0,
    functionRow: -1,
    typeSyntaxRootIndex: enumTypeRow.index,
    genericSymbolStart: -1,
    genericSymbolCount: 0,
    suiteLexicalScopeIndex: -1,
    spanStart: enumTokens[0]!.start,
    spanEnd: enumTokens[6]!.end,
    nameSpanStart: enumTokens[1]!.start,
    nameSpanEnd: enumTokens[1]!.end,
    mutableFlag: 0,
    exportedFlag: 1,
    identitySha256: "",
  };
  enumDeclaration.identitySha256 = driverDeclarationIdentity(
    enumDeclaration,
    enumSource,
    enumReceipt.tokens,
    declarationIdentities,
    enumReceipt.declarationLexicalScopes,
    enumReceipt.typeSyntaxes,
    [],
  );
  enumReceipt.declarations.push(enumDeclaration);
  enumReceipt.counts.declarationCount = enumReceipt.declarations.length;
  const enumObligations = grammar.obligations.filter(
    (entry) =>
      entry.disposition === "required" &&
      entry.production === "enumFields",
  );
  const enumBound = bindReceiptAgainstObligations(
    JSON.stringify(enumReceipt),
    enumSource,
    enumObligations,
    currentTokenKindNames,
    mapRows,
    valueExprKindNames,
  );
  assert.equal(
    enumBound.results.find((result) =>
      result.kind === "production")?.receipt?.parserNodeKind,
    "ParserTypeSyntaxEnum",
    "enumFields 必须命中真实 Enum TypeSyntax witness",
  );
  const enumOneObligation = enumObligations.find(
    (entry) =>
      entry.kind === "repetition" &&
      entry.variant === "one",
  );
  assert.ok(enumOneObligation !== undefined);
  assert.equal(
    enumBound.results.find((result) =>
      result.obligationId === enumOneObligation.obligationId)
      ?.receipt?.parserNodeKind,
    "ParserTypeSyntaxEnum",
    "enumFields variant CSR one 必须真实命中",
  );
  const wrongEnumOwner = clone(enumReceipt);
  wrongEnumOwner.typeEnumVariants[1].declarationOwnerIndex = 3;
  wrongEnumOwner.typeEnumVariants[1].identitySha256 =
    parserTypeEnumVariantIdentity(
      wrongEnumOwner.typeEnumVariants[1],
      enumSource,
      wrongEnumOwner.tokens,
      wrongEnumOwner.typeSyntaxes,
    );
  assert.throws(
    () => bindReceiptAgainstObligations(
      JSON.stringify(wrongEnumOwner),
      enumSource,
      enumObligations,
      currentTokenKindNames,
      mapRows,
      valueExprKindNames,
    ),
    /driver enum variant receipt row invalid: 1/,
    "enumFields variant owner 改绑其他 TypeSyntax 必须 hard-fail",
  );
  const literalReceipt = clone(enumReceipt);
  const literalSurface = "1\n\"s\"\ntrue\n'c'\n";
  const literalSurfaceStart = Buffer.byteLength(enumSource, "utf8");
  const literalSource = enumSource + literalSurface;
  const literalLine = enumSource.split("\n").length;
  const literalTokenSpecs = [
    ["ParserValueTokenInteger", 0, 1, 0],
    ["ParserValueTokenString", 2, 5, 1],
    ["ParserValueTokenTrue", 6, 10, 2],
    ["ParserValueTokenChar", 11, 14, 3],
  ] as const;
  const literalTokens = literalTokenSpecs.map(
    ([kindText, start, end, lineOffset], offset) => {
      const kind = currentTokenKindNames.indexOf(kindText);
      assert.ok(kind > 0, `current token kind missing: ${kindText}`);
      return {
        index: literalReceipt.tokens.length + offset,
        kind,
        sourceTextId: 0,
        start: literalSurfaceStart + start,
        end: literalSurfaceStart + end,
        line: literalLine + lineOffset,
        column: 1,
        producerSourceIndex: 0,
        sourceLocalIndex: literalReceipt.tokens.length + offset,
        lexicalParentIndex: -1,
      };
    },
  );
  literalReceipt.tokens.push(...literalTokens);
  literalReceipt.counts.tokenCount = literalReceipt.tokens.length;
  literalReceipt.sourceSha256 = sha256(literalSource);
  literalReceipt.sourceTexts[0].sha256 = literalReceipt.sourceSha256;
  literalReceipt.sourceTexts[0].byteLength =
    Buffer.byteLength(literalSource, "utf8");
  literalReceipt.declarationLexicalScopes[0].spanEnd =
    literalReceipt.sourceTexts[0].byteLength;
  literalReceipt.declarationLexicalScopes[0].identitySha256 =
    driverDeclarationLexicalScopeIdentity(
      literalReceipt.declarationLexicalScopes[0],
    );
  const literalDeclarationIdentities: string[] = [];
  for (const declaration of literalReceipt.declarations) {
    declaration.identitySha256 = driverDeclarationIdentity(
      declaration,
      literalSource,
      literalReceipt.tokens,
      literalDeclarationIdentities,
      literalReceipt.declarationLexicalScopes,
      literalReceipt.typeSyntaxes,
      [],
    );
    literalDeclarationIdentities.push(declaration.identitySha256);
  }
  const literalRegions = literalTokens.map((token) => ({
    index: literalReceipt.regions.length,
    kind: "ParserValueExprRegionPattern",
    sourceTextId: 0,
    spanStart: token.start,
    spanEnd: token.end,
    anchorTokenIndex: token.index,
  }));
  for (const region of literalRegions) {
    region.index = literalReceipt.regions.length;
    literalReceipt.regions.push(region);
  }
  literalReceipt.counts.regionCount = literalReceipt.regions.length;
  literalReceipt.patterns = literalTokens.map((token, index) => {
    const row = {
      index,
      producerSourceIndex: 0,
      sourceLocalRow: index,
      kind: 3,
      kindText: "ParserPatternLiteral",
      nameTokenIndex: token.index,
      ownerLexicalScopeIndex: 0,
      ownerKind: 1,
      ownerRow: literalRegions[index]!.index,
      bindingDeclarationIndex: -1,
      typeSyntaxRootIndex: -1,
      spanStart: token.start,
      spanEnd: token.end,
      childStart: 0,
      childCount: 0,
      identitySha256: "",
    };
    row.identitySha256 = parserPatternIdentity(row);
    return row;
  });
  literalReceipt.patternChildren = [];
  literalReceipt.counts.patternCount = literalReceipt.patterns.length;
  literalReceipt.counts.patternChildCount = 0;
  const literalObligations = grammar.obligations.filter(
    (entry) =>
      entry.disposition === "required" &&
      entry.production === "literalPattern",
  );
  const literalBound = bindReceiptAgainstObligations(
    JSON.stringify(literalReceipt),
    literalSource,
    literalObligations,
    currentTokenKindNames,
    mapRows,
    valueExprKindNames,
  );
  const literalChoiceResults = literalBound.results.filter(
    (result) => result.kind === "choice",
  );
  assert.equal(literalChoiceResults.length, 4);
  assert.ok(
    literalChoiceResults.every((result) =>
      result.receipt?.parserNodeKind === "ParserPatternLiteral"),
    "literalPattern 四臂必须全部命中真实 Pattern witness，token 只能作判别",
  );
  const wrongLiteralOwner = clone(literalReceipt);
  wrongLiteralOwner.patterns[0].ownerRow =
    wrongLiteralOwner.patterns[1].ownerRow;
  wrongLiteralOwner.patterns[0].identitySha256 =
    parserPatternIdentity(wrongLiteralOwner.patterns[0]);
  assert.throws(
    () => bindReceiptAgainstObligations(
      JSON.stringify(wrongLiteralOwner),
      literalSource,
      literalObligations,
      currentTokenKindNames,
      mapRows,
      valueExprKindNames,
    ),
    /driver pattern region owner invalid: 0/,
    "literalPattern Pattern owner 改绑其他 region 必须 hard-fail",
  );
  const conceptReceipt = clone(literalReceipt);
  const conceptSurface = [
    "concept ConceptAuthority:",
    "    let x = 1",
    "trait TraitAuthority:",
    "    let y = 1",
    "",
  ].join("\n");
  const conceptSurfaceStart =
    Buffer.byteLength(literalSource, "utf8");
  const conceptSource = literalSource + conceptSurface;
  const conceptLine = literalSource.split("\n").length;
  const conceptTokenSpecs = [
    ["ParserValueTokenConcept", 0, 7, 0, 1],
    ["ParserValueTokenIdentifier", 8, 24, 0, 9],
    ["ParserValueTokenColon", 24, 25, 0, 25],
    ["ParserValueTokenLet", 30, 33, 1, 5],
    ["ParserValueTokenIdentifier", 34, 35, 1, 9],
    ["ParserValueTokenAssign", 36, 37, 1, 11],
    ["ParserValueTokenInteger", 38, 39, 1, 13],
    ["ParserValueTokenTrait", 40, 45, 2, 1],
    ["ParserValueTokenIdentifier", 46, 60, 2, 7],
    ["ParserValueTokenColon", 60, 61, 2, 21],
    ["ParserValueTokenLet", 66, 69, 3, 5],
    ["ParserValueTokenIdentifier", 70, 71, 3, 9],
    ["ParserValueTokenAssign", 72, 73, 3, 11],
    ["ParserValueTokenInteger", 74, 75, 3, 13],
  ] as const;
  const conceptTokens = conceptTokenSpecs.map(
    ([kindText, start, end, lineOffset, column], offset) => {
      const kind = currentTokenKindNames.indexOf(kindText);
      assert.ok(kind > 0, `current token kind missing: ${kindText}`);
      return {
        index: conceptReceipt.tokens.length + offset,
        kind,
        sourceTextId: 0,
        start: conceptSurfaceStart + start,
        end: conceptSurfaceStart + end,
        line: conceptLine + lineOffset,
        column,
        producerSourceIndex: 0,
        sourceLocalIndex: conceptReceipt.tokens.length + offset,
        lexicalParentIndex: -1,
      };
    },
  );
  conceptReceipt.tokens.push(...conceptTokens);
  conceptReceipt.counts.tokenCount = conceptReceipt.tokens.length;
  conceptReceipt.sourceSha256 = sha256(conceptSource);
  conceptReceipt.sourceTexts[0].sha256 =
    conceptReceipt.sourceSha256;
  conceptReceipt.sourceTexts[0].byteLength =
    Buffer.byteLength(conceptSource, "utf8");
  conceptReceipt.declarationLexicalScopes[0].spanEnd =
    conceptReceipt.sourceTexts[0].byteLength;
  conceptReceipt.declarationLexicalScopes[0].identitySha256 =
    driverDeclarationLexicalScopeIdentity(
      conceptReceipt.declarationLexicalScopes[0],
    );
  const conceptDeclarationIndex =
    conceptReceipt.declarations.length;
  const traitDeclarationIndex = conceptDeclarationIndex + 1;
  const conceptScope = {
    index: conceptReceipt.declarationLexicalScopes.length,
    producerSourceIndex: 0,
    sourceLocalRow:
      conceptReceipt.declarationLexicalScopes.length,
    kind: 4,
    kindText: "ParserDeclarationLexicalScopeBlock",
    parentScopeIndex: 0,
    ownerDeclarationIndex: conceptDeclarationIndex,
    spanStart: conceptTokens[3]!.start,
    spanEnd: conceptTokens[6]!.end,
    identitySha256: "",
  };
  conceptScope.identitySha256 =
    driverDeclarationLexicalScopeIdentity(conceptScope);
  const traitScope = {
    index: conceptScope.index + 1,
    producerSourceIndex: 0,
    sourceLocalRow: conceptScope.index + 1,
    kind: 4,
    kindText: "ParserDeclarationLexicalScopeBlock",
    parentScopeIndex: 0,
    ownerDeclarationIndex: traitDeclarationIndex,
    spanStart: conceptTokens[10]!.start,
    spanEnd: conceptTokens[13]!.end,
    identitySha256: "",
  };
  traitScope.identitySha256 =
    driverDeclarationLexicalScopeIdentity(traitScope);
  conceptReceipt.declarationLexicalScopes.push(
    conceptScope,
    traitScope,
  );
  conceptReceipt.counts.declarationLexicalScopeCount =
    conceptReceipt.declarationLexicalScopes.length;
  const conceptDeclarationIdentities: string[] = [];
  for (const declaration of conceptReceipt.declarations) {
    declaration.identitySha256 = driverDeclarationIdentity(
      declaration,
      conceptSource,
      conceptReceipt.tokens,
      conceptDeclarationIdentities,
      conceptReceipt.declarationLexicalScopes,
      conceptReceipt.typeSyntaxes,
      conceptReceipt.typeGenericSymbols,
    );
    conceptDeclarationIdentities.push(
      declaration.identitySha256,
    );
  }
  const conceptDeclaration = {
    index: conceptDeclarationIndex,
    producerSourceIndex: 0,
    sourceLocalRow: conceptDeclarationIndex,
    sourceTextId: 0,
    kind: 7,
    kindText: "ParserDeclarationConcept",
    nameTokenIndex: conceptTokens[1]!.index,
    ownerDeclarationIndex: -1,
    lexicalScopeIndex: 0,
    functionRow: -1,
    typeSyntaxRootIndex: -1,
    genericSymbolStart: -1,
    genericSymbolCount: 0,
    suiteLexicalScopeIndex: conceptScope.index,
    spanStart: conceptTokens[0]!.start,
    spanEnd: conceptTokens[6]!.end,
    nameSpanStart: conceptTokens[1]!.start,
    nameSpanEnd: conceptTokens[1]!.end,
    mutableFlag: 0,
    exportedFlag: 1,
    identitySha256: "",
  };
  conceptDeclaration.identitySha256 = driverDeclarationIdentity(
    conceptDeclaration,
    conceptSource,
    conceptReceipt.tokens,
    conceptDeclarationIdentities,
    conceptReceipt.declarationLexicalScopes,
    conceptReceipt.typeSyntaxes,
    conceptReceipt.typeGenericSymbols,
  );
  conceptDeclarationIdentities.push(
    conceptDeclaration.identitySha256,
  );
  const traitDeclaration = {
    index: traitDeclarationIndex,
    producerSourceIndex: 0,
    sourceLocalRow: traitDeclarationIndex,
    sourceTextId: 0,
    kind: 8,
    kindText: "ParserDeclarationTrait",
    nameTokenIndex: conceptTokens[8]!.index,
    ownerDeclarationIndex: -1,
    lexicalScopeIndex: 0,
    functionRow: -1,
    typeSyntaxRootIndex: -1,
    genericSymbolStart: -1,
    genericSymbolCount: 0,
    suiteLexicalScopeIndex: traitScope.index,
    spanStart: conceptTokens[7]!.start,
    spanEnd: conceptTokens[13]!.end,
    nameSpanStart: conceptTokens[8]!.start,
    nameSpanEnd: conceptTokens[8]!.end,
    mutableFlag: 0,
    exportedFlag: 1,
    identitySha256: "",
  };
  traitDeclaration.identitySha256 = driverDeclarationIdentity(
    traitDeclaration,
    conceptSource,
    conceptReceipt.tokens,
    conceptDeclarationIdentities,
    conceptReceipt.declarationLexicalScopes,
    conceptReceipt.typeSyntaxes,
    conceptReceipt.typeGenericSymbols,
  );
  conceptReceipt.declarations.push(
    conceptDeclaration,
    traitDeclaration,
  );
  conceptReceipt.counts.declarationCount =
    conceptReceipt.declarations.length;
  conceptReceipt.regions.push(
    {
      index: conceptReceipt.regions.length,
      kind: "ParserValueExprRegionConceptTraitHeader",
      sourceTextId: 0,
      spanStart: conceptTokens[0]!.start,
      spanEnd: conceptTokens[2]!.end,
      anchorTokenIndex: conceptTokens[0]!.index,
    },
    {
      index: conceptReceipt.regions.length + 1,
      kind: "ParserValueExprRegionConceptTraitHeader",
      sourceTextId: 0,
      spanStart: conceptTokens[7]!.start,
      spanEnd: conceptTokens[9]!.end,
      anchorTokenIndex: conceptTokens[7]!.index,
    },
  );
  conceptReceipt.counts.regionCount =
    conceptReceipt.regions.length;
  const conceptTraitProductions = [
    "conceptDecl",
    "traitDecl",
    "conceptStmt",
    "traitStmt",
  ];
  const conceptTraitObligations = grammar.obligations.filter(
    (entry) =>
      entry.disposition === "required" &&
      conceptTraitProductions.includes(entry.production),
  );
  const conceptTraitBound = bindReceiptAgainstObligations(
    JSON.stringify(conceptReceipt),
    conceptSource,
    conceptTraitObligations,
    currentTokenKindNames,
    mapRows,
    valueExprKindNames,
  );
  for (const production of conceptTraitProductions) {
    const root = conceptTraitBound.results.find((result) =>
      result.production === production &&
      result.kind === "production");
    assert.ok(
      root?.receipt !== null && root?.receipt !== undefined,
      `${production} production 必须真实命中 declaration/suite/header`,
    );
    const depthZero = conceptTraitBound.results.find((result) =>
      result.production === production &&
      result.kind === "recursion" &&
      result.variant === "depth_zero");
    assert.ok(
      depthZero?.receipt !== null &&
        depthZero?.receipt !== undefined,
      `${production} depth_zero 必须真实命中 declaration owner 链`,
    );
  }
  for (const production of ["conceptDecl", "traitDecl"]) {
    const absent = conceptTraitBound.results.find((result) =>
      result.production === production &&
      result.kind === "optional" &&
      result.variant === "absent");
    assert.ok(
      absent?.receipt !== null && absent?.receipt !== undefined,
      `${production} 无 typeParamList 必须真实命中 absent`,
    );
  }
  const wrongConceptSuite = clone(conceptReceipt);
  wrongConceptSuite.declarations[
    conceptDeclarationIndex
  ].suiteLexicalScopeIndex = traitScope.index;
  const wrongConceptIdentities: string[] = [];
  for (const declaration of wrongConceptSuite.declarations) {
    declaration.identitySha256 = driverDeclarationIdentity(
      declaration,
      conceptSource,
      wrongConceptSuite.tokens,
      wrongConceptIdentities,
      wrongConceptSuite.declarationLexicalScopes,
      wrongConceptSuite.typeSyntaxes,
      wrongConceptSuite.typeGenericSymbols,
    );
    wrongConceptIdentities.push(declaration.identitySha256);
  }
  assert.throws(
    () => bindReceiptAgainstObligations(
      JSON.stringify(wrongConceptSuite),
      conceptSource,
      conceptTraitObligations,
      currentTokenKindNames,
      mapRows,
      valueExprKindNames,
    ),
    /driver concept\/trait suite scope invalid/,
    "concept/trait suite scope 改绑其他 declaration 必须 hard-fail",
  );
  for (const [label, mutate, expected] of [
    [
      "owner",
      (copy: any) => { copy.typeSyntaxes[0].ownerTokenIndex = -1; },
      /driver TypeSyntax receipt row invalid: 0/,
    ],
    [
      "span",
      (copy: any) => {
        copy.typeSyntaxes[0].spanEnd =
          copy.typeSyntaxes[0].spanStart;
      },
      /driver TypeSyntax receipt row invalid: 0/,
    ],
    [
      "source",
      (copy: any) => { copy.typeSyntaxes[0].sourceTextId = 1; },
      /driver TypeSyntax receipt row invalid: 0|owner token invalid/,
    ],
    [
      "source local row",
      (copy: any) => { copy.typeSyntaxes[0].sourceLocalRow = 1; },
      /driver TypeSyntax receipt row invalid: 0/,
    ],
    [
      "CID",
      (copy: any) => {
        copy.typeSyntaxes[0].identitySha256 = "0".repeat(64);
      },
      /driver TypeSyntax receipt row invalid: 0/,
    ],
  ] as const) {
    const copy = clone(childIdentityReceipt);
    mutate(copy);
    assert.throws(
      () => bind(copy, childIdentitySource),
      expected,
      `TypeSyntax ${label} mutation 必须 hard-fail`,
    );
  }
  for (const [label, mutate, expected] of [
    [
      "producer node",
      (copy: any) => {
        copy.annotationArgs.pop();
        copy.counts.annotationArgCount -= 1;
      },
      /root(?: CSR)? invalid|child CSR invalid|ownership invalid|index invalid/,
    ],
    [
      "owner",
      (copy: any) => { copy.annotationArgs[0].ownerAnnotationIndex = -1; },
      /owner invalid|ownership invalid|receipt row invalid/,
    ],
    [
      "span",
      (copy: any) => {
        copy.annotationArgs[0].spanEnd = copy.annotationArgs[0].spanStart;
      },
      /span invalid|receipt row invalid/,
    ],
    [
      "child",
      (copy: any) => {
        copy.annotationArgChildren[1] = copy.annotationArgChildren[0];
      },
      /child CSR invalid|ownership invalid/,
    ],
    [
      "token",
      (copy: any) => { copy.annotationArgs[0].tokenIndex = -1; },
      /token invalid|receipt row invalid/,
    ],
    [
      "schema",
      (copy: any) => { copy.schema = "cheng_driver_parse_receipt_v1"; },
      /schema\/stage 不符/,
    ],
    [
      "compatibility fragment",
      (copy: any) => { copy.compatibility = "v1"; },
      /forbidden_compatibility_key:compatibility/,
    ],
    [
      "embedded toolchain",
      (copy: any) => {
        copy.toolchainManifest.driverBytesSha256 = "0".repeat(64);
      },
      /driver receipt toolchain identity invalid/,
    ],
    [
      "bracket argument schema column",
      (copy: any) => { delete copy.typeSyntaxBracketArgs; },
      /driver_receipt_keys_invalid|TypeSyntax bracket argument receipt count\/array mismatch/,
    ],
    [
      "enum variant schema column",
      (copy: any) => { delete copy.typeEnumVariants; },
      /driver_receipt_keys_invalid|enum variant receipt count\/array mismatch/,
    ],
    [
      "enum variant count schema column",
      (copy: any) => { delete copy.counts.typeEnumVariantCount; },
      /driver_receipt_counts_keys_invalid|enum variant receipt count\/array mismatch/,
    ],
    [
      "type const expression schema column",
      (copy: any) => { delete copy.typeConstExprs; },
      /driver_receipt_keys_invalid|TypeSyntax bracket argument receipt count\/array mismatch/,
    ],
    [
      "generic schema column",
      (copy: any) => { delete copy.typeGenericSymbols; },
      /driver_receipt_keys_invalid|type generic symbol receipt count\/array mismatch/,
    ],
    [
      "declaration lexical scope schema column",
      (copy: any) => { delete copy.declarationLexicalScopes; },
      /driver_receipt_keys_invalid|declaration lexical scope receipt count\/array mismatch/,
    ],
    [
      "declaration schema column",
      (copy: any) => { delete copy.declarations; },
      /driver_receipt_keys_invalid|declaration receipt count\/array mismatch/,
    ],
    [
      "declaration count schema column",
      (copy: any) => { delete copy.counts.declarationCount; },
      /driver_receipt_counts_keys_invalid|declaration receipt count\/array mismatch/,
    ],
    [
      "declaration lexical scope span",
      (copy: any) => {
        copy.declarationLexicalScopes[1].spanEnd =
          Buffer.byteLength(source, "utf8") + 1;
      },
      /declaration lexical scope receipt row invalid/,
    ],
    [
      "declaration lexical scope exchange",
      (copy: any) => {
        const first = copy.declarationLexicalScopes[0];
        copy.declarationLexicalScopes[0] =
          copy.declarationLexicalScopes[1];
        copy.declarationLexicalScopes[1] = first;
      },
      /declaration lexical scope receipt row invalid/,
    ],
    [
      "pattern schema column",
      (copy: any) => { delete copy.patterns; },
      /driver_receipt_keys_invalid|pattern receipt count\/array mismatch/,
    ],
    [
      "TypeSyntax source-local schema column",
      (copy: any) => {
        copy.typeSyntaxes = [{
          sourceLocalRow: 0,
        }];
        copy.counts.typeSyntaxCount = 1;
      },
      /driver TypeSyntax receipt schema invalid/,
    ],
  ] as const) {
    const copy = clone(mutationReceipt);
    mutate(copy);
    assert.throws(() => bind(copy), expected, `${label} mutation 必须 hard-fail`);
  }
  assert.throws(
    () => bind(mutationReceipt, `${source} `),
    /sourceSha256 与源字节不符/,
    "换 source 必须 hard-fail",
  );
  for (const [kindText, oldOrdinal] of [
    ["ParserTypeSyntaxRef", 8],
    ["ParserTypeSyntaxRawPointer", 10],
  ] as const) {
    const forbiddenLegacyTypeReceipt = clone(childIdentityReceipt);
    assert.ok(forbiddenLegacyTypeReceipt.typeSyntaxes.length > 0);
    forbiddenLegacyTypeReceipt.typeSyntaxes[0].kindText = kindText;
    forbiddenLegacyTypeReceipt.typeSyntaxes[0].kind = oldOrdinal;
    assert.throws(
      () => bind(
        forbiddenLegacyTypeReceipt,
        childIdentitySource,
      ),
      new RegExp(`forbidden public TypeSyntax kind: ${kindText}`),
      `${kindText} receipt 必须在 obligation 匹配前 hard-fail`,
    );
  }

  const closureRows = [{
    path: "src/core/lang/parser.cheng",
    byteLength: parserBytes.length,
    sha256: sha256(parserBytes),
  }];
  const driverSha256 = receipt.driverBytesSha256 as string;
  const traceSha256 = receipt.parserTraceRootSha256 as string;
  const toolClosure = await buildParserReceiptHarnessToolClosure(
    harnessToolPath,
    fusionRoot,
  );
  const runtimeExecutableSha256 =
    sha256(readFileSync(process.execPath));
  const buildCompiler =
    buildParserReceiptHarnessExecutableIdentity(
      CHENG_PARSER_RECEIPT_BUILD_COMPILER,
    );
  const compilerProfile = parserReceiptHarnessCompilerProfile();
  const syntheticBuildRoot = "/frozen";
  const syntheticSourceRoot = resolve(
    syntheticBuildRoot,
    "source-snapshot",
  );
  const syntheticOfficialCurrentBuild = {
    bindingPath: resolve(
      syntheticBuildRoot,
      "current-official-binding.kv",
    ),
    bindingSha256: "a".repeat(64),
    officialBuildReceiptPath: resolve(
      syntheticBuildRoot,
      "cheng.current-build-receipt.kv",
    ),
    officialBuildReceiptSha256: "b".repeat(64),
    sourceSnapshotManifestPath: resolve(
      syntheticBuildRoot,
      "cheng-source-snapshot.manifest.txt",
    ),
    sourceSnapshotManifestSha256: "c".repeat(64),
    sourceSnapshotRoot: syntheticSourceRoot,
    sourceSnapshotClosureSha256: "d".repeat(64),
    officialDriverPath: resolve(
      syntheticBuildRoot,
      "official",
      "cheng",
    ),
    officialDriverSha256: driverSha256,
  };
  const manifest = {
    schema: CHENG_PARSER_PRODUCTION_RECEIPT_HARNESS_SCHEMA,
    status: "accepted",
    officialCurrentBuild: syntheticOfficialCurrentBuild,
    formalEbnfSha256: grammar.ebnfSha256,
    formalSpec: {
      path: resolve(
        syntheticSourceRoot,
        "docs/cheng-formal-spec.md",
      ),
      sha256: grammar.formalSpecSha256,
    },
    parser: {
      path: resolve(
        syntheticSourceRoot,
        "src/core/lang/parser.cheng",
      ),
      sha256: sha256(parserBytes),
    },
    receiptProducer: {
      path: resolve(
        syntheticSourceRoot,
        "src/core/tooling/compiler_parser_receipt.cheng",
      ),
      sha256: sha256(readFileSync(receiptProducerPath)),
    },
    driverEntry: {
      path: resolve(
        syntheticSourceRoot,
        CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE,
      ),
      sha256: "1".repeat(64),
    },
    bootstrap: {
      path: resolve(syntheticSourceRoot, "bootstrap/cheng_cold.c"),
      sha256: "2".repeat(64),
    },
    harness: {path: "/test/harness.ts", sha256: "3".repeat(64)},
    dependencyClosure: {
      fileCount: closureRows.length,
      sha256: sha256(canonicalJson(closureRows)),
      rows: closureRows,
    },
    toolClosure,
    buildCompiler,
    compilerProfile,
    runtime: {
      executablePath: process.execPath,
      executableSha256: runtimeExecutableSha256,
      version: Bun.version,
    },
    drivers: [
      {
        role: "receipt_driver_a",
        path: "/test/driver-a/cheng",
        sha256: driverSha256,
        inode: "101",
        byteLength: 10,
      },
      {
        role: "receipt_driver_b",
        path: "/test/driver-b/cheng",
        sha256: driverSha256,
        inode: "102",
        byteLength: 10,
      },
    ],
    sources: [{
      path: mutationSourcePath,
      sha256: sha256(source),
      byteLength: Buffer.byteLength(source),
    }],
    receipts: [
      {
        path: receiptPath,
        sha256: sha256(receiptBytes),
        inode: "201",
        byteLength: receiptBytes.length,
        sourcePath: mutationSourcePath,
        driverRole: "receipt_driver_a",
        driverSha256,
        parserTraceRootSha256: traceSha256,
      },
      {
        path: `${receiptPath}.independent-copy`,
        sha256: sha256(receiptBytes),
        inode: "202",
        byteLength: receiptBytes.length,
        sourcePath: mutationSourcePath,
        driverRole: "receipt_driver_b",
        driverSha256,
        parserTraceRootSha256: traceSha256,
      },
    ],
  };
  const validationInput = {
    officialCurrentBuild: syntheticOfficialCurrentBuild,
    formalSpecPath: manifest.formalSpec.path,
    formalSpecSha256: grammar.formalSpecSha256,
    formalEbnfSha256: grammar.ebnfSha256,
    parserPath: manifest.parser.path,
    parserSha256: sha256(parserBytes),
    receiptProducerPath: manifest.receiptProducer.path,
    receiptProducerSha256: sha256(readFileSync(receiptProducerPath)),
    driverEntryPath: manifest.driverEntry.path,
    driverEntrySha256: manifest.driverEntry.sha256,
    bootstrapPath: manifest.bootstrap.path,
    bootstrapSha256: manifest.bootstrap.sha256,
    harnessPath: manifest.harness.path,
    harnessSha256: manifest.harness.sha256,
    sourcePath: mutationSourcePath,
    sourceSha256: sha256(source),
    receiptPath,
    receiptSha256: sha256(receiptBytes),
    dependencyClosureSha256: manifest.dependencyClosure.sha256,
    toolClosureSha256: toolClosure.sha256,
    buildCompilerExecutablePath: buildCompiler.executablePath,
    buildCompilerExecutableSha256: buildCompiler.executableSha256,
    buildCompilerVersionSha256: buildCompiler.versionSha256,
    runtimeExecutablePath: process.execPath,
    runtimeExecutableSha256,
    runtimeVersion: Bun.version,
  };
  assert.equal(
    validateParserProductionReceiptHarnessIdentity(
      manifest,
      validationInput,
    ).driverRole,
    "receipt_driver_a",
  );
  for (const [label, mutate, expected] of [
    [
      "harness schema",
      (copy: any) => { copy.schema += "_v1"; },
      /harness_schema_invalid/,
    ],
    [
      "harness keys",
      (copy: any) => { copy.compatibility = true; },
      /harness_keys_invalid/,
    ],
    [
      "formal EBNF",
      (copy: any) => { copy.formalEbnfSha256 = "0".repeat(64); },
      /formal_ebnf_identity_invalid/,
    ],
    [
      "parser source",
      (copy: any) => { copy.parser.sha256 = "0".repeat(64); },
      /parser_identity_invalid/,
    ],
    [
      "receipt producer",
      (copy: any) => { copy.receiptProducer.sha256 = "0".repeat(64); },
      /receipt_producer_identity_invalid/,
    ],
    [
      "closure",
      (copy: any) => { copy.dependencyClosure.rows[0].byteLength += 1; },
      /dependency_closure_identity_invalid/,
    ],
    [
      "tool closure",
      (copy: any) => { copy.toolClosure.rows[0].byteLength += 1; },
      /tool_closure_identity_invalid/,
    ],
    [
      "build compiler",
      (copy: any) => {
        copy.buildCompiler.executableSha256 = "0".repeat(64);
      },
      /harness_build_compiler_identity_invalid/,
    ],
    [
      "runtime",
      (copy: any) => {
        copy.runtime.executableSha256 = "0".repeat(64);
      },
      /harness_runtime_identity_invalid/,
    ],
    [
      "driver inode",
      (copy: any) => {
        copy.drivers[1].inode = copy.drivers[0].inode;
      },
      /harness_driver_fixed_point_invalid/,
    ],
    [
      "driver bytes",
      (copy: any) => { copy.drivers[1].sha256 = "0".repeat(64); },
      /harness_driver_fixed_point_invalid|harness_receipt_identity_invalid/,
    ],
    [
      "source",
      (copy: any) => { copy.sources[0].sha256 = "0".repeat(64); },
      /harness_source_not_bound/,
    ],
    [
      "receipt inode",
      (copy: any) => {
        copy.receipts[1].inode = copy.receipts[0].inode;
      },
      /harness_receipt_fixed_point_invalid/,
    ],
    [
      "receipt trace",
      (copy: any) => {
        copy.receipts[1].parserTraceRootSha256 = "0".repeat(64);
      },
      /harness_receipt_fixed_point_invalid/,
    ],
    [
      "parser trace fixed point",
      (copy: any) => {
        copy.receipts[1].parserTraceRootSha256 = "0".repeat(64);
      },
      /harness_receipt_fixed_point_invalid/,
    ],
    [
      "receipt path",
      (copy: any) => { copy.receipts[0].path += ".swapped"; },
      /harness_receipt_not_bound/,
    ],
  ] as const) {
    const copy = clone(manifest);
    mutate(copy);
    assert.throws(
      () => validateParserProductionReceiptHarnessIdentity(
        copy,
        validationInput,
      ),
      expected,
      `${label} mutation 必须 hard-fail`,
    );
  }
  if (process.argv.includes("--projection-admission-only")) {
    console.log(
      "item25 current parser-owned projection admission: PASS " +
      `productions=${generated.counts.total} ` +
      `witnessed=${generated.counts.witnessedRequiredCount} ` +
      `missing=${generated.counts.missingRequiredCount}`,
    );
    return;
  }

  const badClaims = clone(declarations);
  badClaims.rows[0].status = "MAPPED";
  assert.throws(
    () => build(Buffer.from(JSON.stringify(badClaims)), parserBytes),
    /must not contain generated status/,
  );
  const missingNode = clone(declarations);
  missingNode.rows.find((row: any) => row.name === "annotationArg").nodeKinds = [];
  assert.throws(
    () => build(Buffer.from(JSON.stringify(missingNode)), parserBytes),
    /annotationArg current parser producer declaration invalid/,
  );
  const badSchema = clone(declarations);
  badSchema.schema = "cheng_ebnf_parser_producer_declarations_v1";
  assert.throws(
    () => build(Buffer.from(JSON.stringify(badSchema)), parserBytes),
    /invalid EBNF parser producer claims schema/,
  );
  const missingFunctionParser = parserBytes.toString("utf8").replace(
    "fn ParserValueExprParseAnnotationArgInto",
    "fn ParserValueExprParseAnnotationArgInto_REMOVED",
  );
  assert.throws(
    () => build(claimsBytes, Buffer.from(missingFunctionParser)),
    /parser producer function missing: annotationArgs\/ParserValueExprParseAnnotationArgInto/,
  );

  console.log(
    `item25 ebnf parser node map: PASS rows=${generated.counts.total} ` +
    `MAPPED=${generated.counts.MAPPED} PARTIAL=${generated.counts.PARTIAL} ` +
    `UNMAPPED=${generated.counts.UNMAPPED} ` +
    `missingRequiredCount=${generated.counts.missingRequiredCount}`,
  );
}

await main();
