#!/usr/bin/env bun
// grammar_receipt_bind.ts — driver parse-receipt(cheng_driver_parse_receipt) →
// GrammarParserSpanReceipt(cheng_parser_obligation_span_receipt) 的绑定器。
//
// 证据通道(全部取自 receipt 本身, 不回读源文件做独立解析):
//   nodes(kind/span/父子链/identitySha256) + regions(kind/span) + statementRoots(role/anchor)
//   + tokens(driver ParserValueTokenKind 序数/span/line/column)。
// 匹配语义按 obligation 形态:
//   production 根 → 节点 kind / statementRoot role / region / 关键字 token;
//   choice 臂 → 算子文本(子节点间 token)/节点 kind/首 token 判别;
//   optional absent|present → 标记物(Else/Where/role/region/Ternary/子 span)存在性;
//   repetition zero|one|bounded_max → 计数(算子链长/逗号/elif/分支/条目/行间隙);
//   recursion depth 0|1|3 → 嵌套深度(括号平衡深度/同 kind 祖先链/缩进包含/fnLiteral 包含)。
// 无法机械取证的归入 unsupported:*(如实计数, 不凑数)。
//
// 用法:
//   bun tools/grammar_receipt_bind.ts bind <receipt.json> <sourceFile>
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  CHENG_GRAMMAR_PARSER_SPAN_RECEIPT_SCHEMA,
  buildChengGrammarObligationContract,
  type ChengGrammarObligation,
  type GrammarParserSpanReceipt,
} from "../src/cheng_semantic_pipeline_matrix_m9024.ts";
import {canonicalJson, sha256} from "../src/cheng_semantic_matrix_m9023.ts";
import {
  assertExactCurrentObjectKeys,
  parseUniqueCurrentJson,
} from "../src/current_schema_json.ts";
import {canonicalParserTokenSpanFromReceipt} from "./grammar_span_receipt.ts";

const SPEC_PATH = process.env.CHENG_FORMAL_SPEC_PATH ?? "/Users/lbcheng/cheng-lang/docs/cheng-formal-spec.md";
const PARSER_PATH = process.env.CHENG_PARSER_PATH ?? "/Users/lbcheng/cheng-lang/src/core/lang/parser.cheng";
const MAP_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/semantic/ebnf_parser_node_map.json");

function hashCanonical(value: unknown): string {
  return sha256(canonicalJson(value));
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function utf8Slice(value: string, startByte: number, endByte: number): string {
  return Buffer.from(value, "utf8").subarray(startByte, endByte).toString("utf8");
}

export function utf8ByteSpanToUtf16Span(
  value: string,
  startByte: number,
  endByte: number,
): {charStart: number; charEnd: number} {
  const bytes = Buffer.from(value, "utf8");
  if (startByte < 0 || endByte <= startByte || endByte > bytes.length) {
    throw new Error(
      `UTF-8 byte span 越界: [${startByte}, ${endByte}) / bytes=${bytes.length}`,
    );
  }
  const prefix = bytes.subarray(0, startByte).toString("utf8");
  const covered = bytes.subarray(startByte, endByte).toString("utf8");
  if (Buffer.byteLength(prefix, "utf8") !== startByte ||
      Buffer.byteLength(covered, "utf8") !== endByte - startByte) {
    throw new Error(`UTF-8 byte span 未落在码点边界: [${startByte}, ${endByte})`);
  }
  return {
    charStart: prefix.length,
    charEnd: prefix.length + covered.length,
  };
}

// ---------------------------------------------------------------- driver receipt 类型
interface DriverNode {
  readonly index: number; readonly kind: string; readonly sourceTextId: number;
  readonly spanStart: number; readonly spanEnd: number;
  readonly tokenStart: number; readonly tokenEnd: number;
  readonly parent: number; readonly firstChild: number; readonly childCount: number;
  readonly nextSibling: number; readonly identitySha256: string;
}
interface DriverRegion {
  readonly index: number; readonly kind: string; readonly sourceTextId: number;
  readonly spanStart: number; readonly spanEnd: number; readonly anchorTokenIndex: number;
}
export interface DriverToken {
  readonly index: number; readonly kind: number; readonly sourceTextId: number;
  readonly start: number; readonly end: number; readonly line: number; readonly column: number;
  readonly producerSourceIndex: number; readonly sourceLocalIndex: number;
  readonly lexicalParentIndex: number;
}
interface DriverSourceText {
  readonly sourceTextId: number;
  readonly sha256: string;
  readonly byteLength: number;
}
interface DriverStatementRoot {
  readonly index: number; readonly nodeIndex: number; readonly role: string;
  readonly anchorTokenIndex: number;
  readonly bindingDeclarationStart: number;
  readonly bindingDeclarationCount: number;
  readonly anchorLine: number; readonly anchorColumn: number;
  readonly endLine: number; readonly endColumn: number;
}
interface DriverNormalizedStatementFact {
  readonly index: number; readonly producerSourceIndex: number;
  readonly sourceLocalRow: number; readonly normalizedExprRow: number;
  readonly sourceTextId: number;
  readonly kind: number; readonly kindText: string;
  readonly anchorTokenIndex: number;
  readonly spanStart: number; readonly spanEnd: number;
  readonly line: number; readonly column: number;
  readonly endLine: number; readonly endColumn: number;
  readonly rootNodeIndex: number; readonly originNodeIndex: number;
  readonly statementRole: string;
  readonly lexicalScopeId: number; readonly suiteScopeId: number;
  readonly statementOrdinal: number; readonly lexicalOrdinal: number;
  readonly deferOwnerStatementOrdinal: number;
  readonly identitySha256: string;
}
interface DriverNormalizedScopeFact {
  readonly index: number; readonly producerSourceIndex: number;
  readonly sourceLocalRow: number; readonly sourceTextId: number;
  readonly scopeId: number; readonly sourceScopeId: number;
  readonly parentScopeId: number; readonly parentScopeIndex: number;
  readonly kind: number; readonly kindText: string;
  readonly ownerStatementOrdinal: number;
  readonly ownerStatementRow: number;
  readonly moduleRootAnchor: boolean;
  readonly lexicalOrdinal: number; readonly indentColumn: number;
  readonly anchorTokenIndex: number;
  readonly line: number; readonly column: number;
  readonly endLine: number; readonly endColumn: number;
  readonly identitySha256: string;
}
interface DriverImportEdge {
  readonly index: number;
  readonly ownerProducerSourceIndex: number;
  readonly targetProducerSourceIndex: number;
  readonly sourceDeclarationIdentitySha256: string;
  readonly targetDeclarationIdentitySha256: string;
  readonly importDeclarationRow: number;
  readonly importItemRow: number;
  readonly keywordTokenIndex: number;
  readonly aliasTokenIndex: number;
  readonly spanStart: number; readonly spanEnd: number;
  readonly moduleTokenIndexes: readonly number[];
  readonly prefixTokenCount: number;
  readonly ownerModulePath: string;
  readonly targetModulePath: string;
  readonly targetSourcePath: string;
  readonly targetProfileIndex: number;
  readonly identitySha256: string;
}
export interface DriverAnnotation {
  readonly index: number; readonly producerSourceIndex: number;
  readonly sourceTextId: number; readonly sourceLocalRow: number;
  readonly nameTokenIndex: number; readonly targetTokenIndex: number;
  readonly spanStart: number; readonly spanEnd: number;
  readonly argRootStart: number; readonly argRootCount: number;
  readonly identitySha256: string;
}
export interface DriverAnnotationArg {
  readonly index: number; readonly producerSourceIndex: number;
  readonly sourceTextId: number; readonly sourceLocalRow: number;
  readonly ownerAnnotationIndex: number;
  readonly kind: number; readonly kindText: string;
  readonly tokenIndex: number; readonly separatorTokenIndex: number;
  readonly spanStart: number; readonly spanEnd: number;
  readonly childStart: number; readonly childCount: number;
  readonly identitySha256: string;
}
interface DriverTypeSyntax {
  readonly index: number; readonly producerSourceIndex: number;
  readonly sourceLocalRow: number;
  readonly sourceTextId: number; readonly kind: number; readonly kindText: string;
  readonly spanStart: number; readonly spanEnd: number;
  readonly ownerTokenIndex: number; readonly declarationOwnerTokenIndex: number;
  // Canonical TypeSyntax -> TypeSyntax declaration-owner edge. A type
  // declaration root owns itself; a field root names its containing object.
  readonly declarationOwnerIndex: number;
  readonly genericSymbolStart: number; readonly genericSymbolCount: number;
  readonly childStart: number; readonly childCount: number;
  readonly bracketArgStart: number; readonly bracketArgCount: number;
  readonly nameTokenIndex: number; readonly fixedLength: number;
  readonly questionTokenIndex: number;
  readonly rootKind: number; readonly enumVariantStart: number;
  readonly enumVariantCount: number; readonly identitySha256: string;
}
interface DriverTypeSyntaxBracketArg {
  readonly index: number; readonly producerSourceIndex: number;
  readonly sourceTextId: number; readonly ownerTypeSyntaxIndex: number;
  readonly ordinal: number; readonly tokenStart: number;
  readonly tokenCount: number; readonly typeSyntaxIndex: number;
  readonly constExprRootIndex: number; readonly identitySha256: string;
}
interface DriverTypeEnumVariant {
  readonly index: number; readonly producerSourceIndex: number;
  readonly declarationOwnerIndex: number;
  readonly declarationOwnerTokenIndex: number;
  readonly nameTokenIndex: number; readonly ordinal: number;
  readonly payloadTypeSyntaxIndex: number;
  readonly identitySha256: string;
}
interface DriverTypeConstExpr {
  readonly index: number; readonly kind: number;
  readonly producerSourceIndex: number; readonly sourceTextId: number;
  readonly tokenIndex: number; readonly leftChildIndex: number;
  readonly rightChildIndex: number; readonly integerValue: number;
  readonly identitySha256: string;
}
interface DriverTypeGenericSymbol {
  readonly index: number; readonly producerSourceIndex: number;
  readonly declarationOwnerTokenIndex: number; readonly nameTokenIndex: number;
  readonly ordinal: number; readonly spanStart: number; readonly spanEnd: number;
  readonly ownerDeclarationIndex: number;
  readonly ownerTypeSyntaxIndex: number;
  readonly constraintTypeSyntaxIndex: number;
  readonly defaultTypeSyntaxIndex: number;
  readonly childStart: number; readonly childCount: number;
  readonly identitySha256: string;
}
export interface DriverDeclarationLexicalScope {
  readonly index: number; readonly producerSourceIndex: number;
  readonly sourceLocalRow: number; readonly kind: number;
  readonly kindText: string; readonly parentScopeIndex: number;
  readonly ownerDeclarationIndex: number;
  readonly spanStart: number; readonly spanEnd: number;
  readonly identitySha256: string;
}
export interface DriverDeclaration {
  readonly index: number; readonly producerSourceIndex: number;
  readonly sourceLocalRow: number; readonly sourceTextId: number;
  readonly kind: number; readonly kindText: string;
  readonly nameTokenIndex: number; readonly ownerDeclarationIndex: number;
  readonly lexicalScopeIndex: number; readonly functionRow: number;
  readonly typeSyntaxRootIndex: number;
  readonly genericSymbolStart: number; readonly genericSymbolCount: number;
  readonly suiteLexicalScopeIndex: number;
  readonly spanStart: number; readonly spanEnd: number;
  readonly nameSpanStart: number; readonly nameSpanEnd: number;
  readonly mutableFlag: number; readonly exportedFlag: number;
  readonly identitySha256: string;
}
interface DriverPattern {
  readonly index: number; readonly producerSourceIndex: number;
  readonly sourceLocalRow: number; readonly kind: number; readonly kindText: string;
  readonly nameTokenIndex: number; readonly ownerLexicalScopeIndex: number;
  readonly ownerKind: number; readonly ownerRow: number;
  readonly bindingDeclarationIndex: number; readonly typeSyntaxRootIndex: number;
  readonly spanStart: number; readonly spanEnd: number;
  readonly childStart: number; readonly childCount: number;
  readonly identitySha256: string;
}
interface DriverReceipt {
  readonly schema: string; readonly stage: string;
  readonly producerIdentity: string;
  readonly relativePath: string; readonly sourcePath: string;
  readonly sourceSha256: string; readonly driverBytesSha256: string;
  readonly toolchainManifestSha256: string; readonly parserTraceRootSha256: string;
  readonly toolchainManifest: {
    readonly schema: string;
    readonly producerIdentity: string;
    readonly driverPath: string;
    readonly driverBytesSha256: string;
    readonly packageRoot: string;
    readonly rootDir: string;
  };
  readonly counts: {
    readonly nodeCount: number; readonly tokenCount: number;
    readonly sourceTextCount: number;
    readonly statementRootCount: number; readonly regionCount: number;
    readonly normalizedStatementFactCount: number;
    readonly normalizedScopeFactCount: number;
    readonly importEdgeCount: number;
    readonly annotationCount: number; readonly annotationArgCount: number;
    readonly annotationArgRootCount: number;
    readonly annotationArgChildCount: number;
    readonly typeSyntaxCount: number; readonly typeSyntaxChildCount: number;
    readonly typeEnumVariantCount: number;
    readonly typeSyntaxBracketArgCount: number;
    readonly typeConstExprCount: number;
    readonly typeGenericSymbolCount: number;
    readonly typeGenericSymbolChildCount: number;
    readonly declarationLexicalScopeCount: number;
    readonly declarationCount: number;
    readonly patternCount: number; readonly patternChildCount: number;
  };
  readonly nodes: readonly DriverNode[];
  readonly regions: readonly DriverRegion[];
  readonly sourceTexts: readonly DriverSourceText[];
  readonly tokens: readonly DriverToken[];
  readonly statementRoots: readonly DriverStatementRoot[];
  readonly normalizedStatementFacts:
    readonly DriverNormalizedStatementFact[];
  readonly normalizedScopeFacts: readonly DriverNormalizedScopeFact[];
  readonly importEdges: readonly DriverImportEdge[];
  readonly annotations: readonly DriverAnnotation[];
  readonly annotationArgRoots: readonly number[];
  readonly annotationArgs: readonly DriverAnnotationArg[];
  readonly annotationArgChildren: readonly number[];
  readonly typeSyntaxes: readonly DriverTypeSyntax[];
  readonly typeSyntaxChildren: readonly number[];
  readonly typeEnumVariants: readonly DriverTypeEnumVariant[];
  readonly typeSyntaxBracketArgs: readonly DriverTypeSyntaxBracketArg[];
  readonly typeConstExprs: readonly DriverTypeConstExpr[];
  readonly typeGenericSymbols: readonly DriverTypeGenericSymbol[];
  readonly typeGenericSymbolChildren: readonly number[];
  readonly declarationLexicalScopes:
    readonly DriverDeclarationLexicalScope[];
  readonly declarations: readonly DriverDeclaration[];
  readonly patterns: readonly DriverPattern[];
  readonly patternChildren: readonly number[];
}

function driverReceiptToolchainManifestText(
  manifest: DriverReceipt["toolchainManifest"],
): string {
  return "{\n" +
    `  "schema": ${JSON.stringify(manifest.schema)},\n` +
    `  "producerIdentity": ${JSON.stringify(manifest.producerIdentity)},\n` +
    `  "driverPath": ${JSON.stringify(manifest.driverPath)},\n` +
    `  "driverBytesSha256": ${JSON.stringify(manifest.driverBytesSha256)},\n` +
    `  "packageRoot": ${JSON.stringify(manifest.packageRoot)},\n` +
    `  "rootDir": ${JSON.stringify(manifest.rootDir)}\n` +
    "}\n";
}

export function validateDriverReceiptToolchainIdentityValue(
  receiptValue: unknown,
): void {
  assertExactCurrentObjectKeys(receiptValue, [
    "schema",
    "stage",
    "producerIdentity",
    "relativePath",
    "sourcePath",
    "sourceSha256",
    "driverBytesSha256",
    "toolchainManifestSha256",
    "parserTraceRootSha256",
    "toolchainManifest",
    "counts",
    "nodes",
    "regions",
    "sourceTexts",
    "tokens",
    "roots",
    "statementRoots",
    "normalizedStatementFacts",
    "normalizedScopeFacts",
    "importEdges",
    "callEvents",
    "explicitGenericSpans",
    "annotations",
    "annotationArgRoots",
    "annotationArgs",
    "annotationArgChildren",
    "typeSyntaxes",
    "typeSyntaxChildren",
    "typeEnumVariants",
    "typeSyntaxBracketArgs",
    "typeConstExprs",
    "typeGenericSymbols",
    "typeGenericSymbolChildren",
    "declarationLexicalScopes",
    "declarations",
    "patterns",
    "patternChildren",
  ], "driver_receipt");
  const receipt = receiptValue as DriverReceipt;
  assertExactCurrentObjectKeys(receipt.counts, [
    "nodeCount",
    "genericCount",
    "rootCount",
    "tokenCount",
    "callEventCount",
    "statementRootCount",
    "normalizedStatementFactCount",
    "normalizedScopeFactCount",
    "importEdgeCount",
    "typeSyntaxCount",
    "typeSyntaxChildCount",
    "typeEnumVariantCount",
    "typeSyntaxBracketArgCount",
    "typeConstExprCount",
    "typeGenericSymbolCount",
    "typeGenericSymbolChildCount",
    "regionCount",
    "declarationLexicalScopeCount",
    "declarationCount",
    "patternCount",
    "patternChildCount",
    "annotationCount",
    "annotationArgCount",
    "annotationArgRootCount",
    "annotationArgChildCount",
    "sourceTextCount",
  ], "driver_receipt_counts");
  const manifest = receipt.toolchainManifest;
  if (receipt.producerIdentity !== "compiler_parser_span_receipt" ||
      typeof receipt.sourcePath !== "string" ||
      receipt.sourcePath === "" ||
      receipt.sourcePath !== resolve(receipt.sourcePath) ||
      manifest === null || typeof manifest !== "object" ||
      Array.isArray(manifest) ||
      canonicalJson(Object.keys(manifest).sort()) !== canonicalJson([
        "driverBytesSha256",
        "driverPath",
        "packageRoot",
        "producerIdentity",
        "rootDir",
        "schema",
      ]) ||
      manifest.schema !== "cheng_driver_toolchain_manifest" ||
      manifest.producerIdentity !== receipt.producerIdentity ||
      manifest.driverBytesSha256 !== receipt.driverBytesSha256 ||
      typeof manifest.driverPath !== "string" ||
      manifest.driverPath === "" ||
      manifest.driverPath !== resolve(manifest.driverPath) ||
      typeof manifest.packageRoot !== "string" ||
      typeof manifest.rootDir !== "string" ||
      manifest.packageRoot === "" || manifest.rootDir === "" ||
      resolve(manifest.packageRoot) !== resolve(manifest.rootDir) ||
      sha256(driverReceiptToolchainManifestText(manifest)) !==
        receipt.toolchainManifestSha256) {
    throw new Error("driver receipt toolchain identity invalid");
  }
}

export function validateDriverReceiptToolchainIdentity(
  receiptJson: string,
): void {
  validateDriverReceiptToolchainIdentityValue(
    parseUniqueCurrentJson(receiptJson, "driver_receipt"),
  );
}

// ---------------------------------------------------------------- token 序数表(运行时从 TREE parser.cheng 提取, 防枚举漂移)
export function tokenKindNamesFromParserSource(
  parserSource: string,
): readonly string[] {
  const lines = parserSource.split("\n");
  const start = lines.findIndex((line) => /ParserValueTokenKind = enum/.test(line));
  if (start < 0) throw new Error("ParserValueTokenKind enum 未找到");
  const names: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    const m = /^(ParserValueToken[A-Za-z0-9]+)\b/.exec(line);
    if (m === null) break;
    names.push(m[1]!);
  }
  if (names.length < 50) throw new Error(`token enum 过短(${names.length}), 解析失败`);
  return names;
}

export function valueExprKindNamesFromParserSource(
  parserSource: string,
): readonly string[] {
  const lines = parserSource.split("\n");
  const start = lines.findIndex((line) =>
    /ParserValueExprKind = enum/.test(line));
  if (start < 0) throw new Error("ParserValueExprKind enum 未找到");
  const names: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    const match = /^(ParserValueExpr[A-Za-z0-9]+)\b/.exec(line);
    if (match === null) break;
    names.push(match[1]!);
  }
  if (names.length < 20 ||
      names[0] !== "ParserValueExprInvalid") {
    throw new Error(
      `value expr enum 解析失败(${names.length})`,
    );
  }
  return names;
}

export function loadTokenKindNames(parserPath: string): readonly string[] {
  return tokenKindNamesFromParserSource(readFileSync(parserPath, "utf8"));
}

function appendReceiptU32BE(parts: Buffer[], value: number): void {
  const bytes = Buffer.allocUnsafe(4);
  bytes.writeUInt32BE(value >>> 0, 0);
  parts.push(bytes);
}

function appendReceiptText(parts: Buffer[], value: string): void {
  const bytes = Buffer.from(value, "utf8");
  appendReceiptU32BE(parts, bytes.length);
  parts.push(bytes);
}

function appendReceiptI32(parts: Buffer[], value: number): void {
  appendReceiptU32BE(parts, 4);
  appendReceiptU32BE(parts, value);
}

export function parserValueNodeIdentity(
  node: DriverNode,
  kindOrdinal: number,
): string {
  const parts: Buffer[] = [];
  appendReceiptText(parts, "cheng.parser_span_receipt.node");
  appendReceiptI32(parts, kindOrdinal);
  appendReceiptI32(parts, node.sourceTextId);
  appendReceiptI32(parts, node.spanStart);
  appendReceiptI32(parts, node.spanEnd);
  appendReceiptI32(parts, node.parent);
  appendReceiptI32(parts, node.firstChild);
  appendReceiptI32(parts, node.childCount);
  appendReceiptI32(parts, node.nextSibling);
  return createHash("sha256").update(Buffer.concat(parts)).digest("hex");
}

// ---------------------------------------------------------------- receipt 上下文
interface Ctx {
  readonly receipt: DriverReceipt;
  readonly source: string;
  readonly tokenNames: readonly string[];
  readonly nodesByKind: ReadonlyMap<string, readonly DriverNode[]>;
  readonly annotations: readonly DriverAnnotation[];
  readonly annotationArgRoots: readonly number[];
  readonly annotationArgs: readonly DriverAnnotationArg[];
  readonly annotationArgChildren: readonly number[];
  readonly annotationArgParents: readonly number[];
  readonly typeSyntaxes: readonly DriverTypeSyntax[];
  readonly typeSyntaxChildren: readonly number[];
  readonly typeSyntaxParents: readonly number[];
  readonly typeEnumVariants: readonly DriverTypeEnumVariant[];
  readonly typeSyntaxBracketArgs: readonly DriverTypeSyntaxBracketArg[];
  readonly typeConstExprs: readonly DriverTypeConstExpr[];
  readonly typeGenericSymbols: readonly DriverTypeGenericSymbol[];
  readonly typeGenericSymbolChildren: readonly number[];
  readonly declarationLexicalScopes:
    readonly DriverDeclarationLexicalScope[];
  readonly declarations: readonly DriverDeclaration[];
  readonly patterns: readonly DriverPattern[];
  readonly patternChildren: readonly number[];
  readonly patternParents: readonly number[];
  readonly normalizedStatementFacts:
    readonly DriverNormalizedStatementFact[];
  readonly normalizedScopeFacts: readonly DriverNormalizedScopeFact[];
  readonly importEdges: readonly DriverImportEdge[];
}

const parserOwnedRowContext = new WeakMap<object, Ctx>();

function parserReceiptFrameText(value: string): Buffer {
  const body = Buffer.from(value, "utf8");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(body.length, 0);
  return Buffer.concat([length, body]);
}

function parserReceiptFrameI32(value: number): Buffer {
  const out = Buffer.allocUnsafe(8);
  out.writeUInt32BE(4, 0);
  out.writeUInt32BE(value >>> 0, 4);
  return out;
}

function parserReceiptFrameBool(value: boolean): Buffer {
  const out = Buffer.allocUnsafe(5);
  out.writeUInt32BE(1, 0);
  out[4] = value ? 1 : 0;
  return out;
}

function parserReceiptFrameFixed32(value: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("parser receipt FixedBytes32 identity invalid");
  }
  const out = Buffer.allocUnsafe(36);
  out.writeUInt32BE(32, 0);
  Buffer.from(value, "hex").copy(out, 4);
  return out;
}

function parserReceiptTokenIdentityFrames(
  source: string,
  token: DriverToken,
): readonly Buffer[] {
  return [
    parserReceiptFrameI32(token.index),
    parserReceiptFrameI32(token.kind),
    parserReceiptFrameI32(token.sourceTextId),
    parserReceiptFrameI32(token.producerSourceIndex),
    parserReceiptFrameI32(token.sourceLocalIndex),
    parserReceiptFrameI32(token.lexicalParentIndex),
    parserReceiptFrameI32(token.start),
    parserReceiptFrameI32(token.end),
    parserReceiptFrameI32(token.line),
    parserReceiptFrameI32(token.column),
    parserReceiptFrameText(utf8Slice(source, token.start, token.end)),
  ];
}

export function driverNormalizedStatementFactIdentity(
  row: DriverNormalizedStatementFact,
  source: string,
  tokens: readonly DriverToken[],
  nodes: readonly DriverNode[],
): string {
  const anchor = tokens[row.anchorTokenIndex]!;
  return sha256(Buffer.concat([
    parserReceiptFrameText(
      "cheng.parser_span_receipt.normalized_statement_fact"),
    parserReceiptFrameI32(row.index),
    parserReceiptFrameI32(row.producerSourceIndex),
    parserReceiptFrameI32(row.sourceLocalRow),
    parserReceiptFrameI32(row.normalizedExprRow),
    parserReceiptFrameI32(row.sourceTextId),
    parserReceiptFrameI32(row.kind),
    parserReceiptFrameI32(row.anchorTokenIndex),
    ...parserReceiptTokenIdentityFrames(source, anchor),
    parserReceiptFrameI32(row.spanStart),
    parserReceiptFrameI32(row.spanEnd),
    parserReceiptFrameI32(row.line),
    parserReceiptFrameI32(row.column),
    parserReceiptFrameI32(row.endLine),
    parserReceiptFrameI32(row.endColumn),
    parserReceiptFrameI32(row.rootNodeIndex),
    ...(row.rootNodeIndex < 0
      ? []
      : [parserReceiptFrameFixed32(
        nodes[row.rootNodeIndex]!.identitySha256)]),
    parserReceiptFrameI32(row.originNodeIndex),
    parserReceiptFrameI32(row.statementRole ===
        "ParserValueExprStatementInvalid"
      ? 0
      : [
        "ParserValueExprStatementInvalid",
        "ParserValueExprStatementBindingInitializer",
        "ParserValueExprStatementAssignmentRhs",
        "ParserValueExprStatementReturnValue",
        "ParserValueExprStatementImplicitReturnValue",
        "ParserValueExprStatementYieldValue",
        "ParserValueExprStatementExpression",
        "ParserValueExprStatementCondition",
        "ParserValueExprStatementLoopSource",
        "ParserValueExprStatementParameterDefault",
        "ParserValueExprStatementTypeDefault",
        "ParserValueExprStatementWhereCondition",
        "ParserValueExprStatementCaseEntry",
        "ParserValueExprStatementCaseGuard",
      ].indexOf(row.statementRole)),
    parserReceiptFrameI32(row.lexicalScopeId),
    parserReceiptFrameI32(row.suiteScopeId),
    parserReceiptFrameI32(row.statementOrdinal),
    parserReceiptFrameI32(row.lexicalOrdinal),
    parserReceiptFrameI32(row.deferOwnerStatementOrdinal),
  ]));
}

export function driverNormalizedScopeFactIdentity(
  row: DriverNormalizedScopeFact,
  source: string,
  tokens: readonly DriverToken[],
): string {
  return sha256(Buffer.concat([
    parserReceiptFrameText(
      "cheng.parser_span_receipt.normalized_scope_fact"),
    parserReceiptFrameI32(row.index),
    parserReceiptFrameI32(row.producerSourceIndex),
    parserReceiptFrameI32(row.sourceLocalRow),
    parserReceiptFrameI32(row.sourceTextId),
    parserReceiptFrameI32(row.scopeId),
    parserReceiptFrameI32(row.sourceScopeId),
    parserReceiptFrameI32(row.parentScopeId),
    parserReceiptFrameI32(row.parentScopeIndex),
    parserReceiptFrameI32(row.kind),
    parserReceiptFrameI32(row.ownerStatementOrdinal),
    parserReceiptFrameI32(row.ownerStatementRow),
    parserReceiptFrameBool(row.moduleRootAnchor),
    parserReceiptFrameI32(row.lexicalOrdinal),
    parserReceiptFrameI32(row.indentColumn),
    parserReceiptFrameI32(row.anchorTokenIndex),
    ...parserReceiptTokenIdentityFrames(
      source, tokens[row.anchorTokenIndex]!),
    parserReceiptFrameI32(row.line),
    parserReceiptFrameI32(row.column),
    parserReceiptFrameI32(row.endLine),
    parserReceiptFrameI32(row.endColumn),
  ]));
}

export function driverModuleDeclarationIdentity(
  producerSourceIndex: number,
  sourcePath: string,
  modulePath: string,
): string {
  return sha256(Buffer.concat([
    parserReceiptFrameText(
      "cheng.parser_span_receipt.module_declaration"),
    parserReceiptFrameI32(producerSourceIndex),
    parserReceiptFrameText(sourcePath),
    parserReceiptFrameText(modulePath),
  ]));
}

export function driverImportEdgeIdentity(
  row: DriverImportEdge,
  source: string,
  tokens: readonly DriverToken[],
): string {
  const parts = [
    parserReceiptFrameText(
      "cheng.parser_span_receipt.import_edge_fact"),
    parserReceiptFrameI32(row.index),
    parserReceiptFrameI32(row.ownerProducerSourceIndex),
    parserReceiptFrameI32(row.targetProducerSourceIndex),
    parserReceiptFrameFixed32(
      row.sourceDeclarationIdentitySha256),
    parserReceiptFrameFixed32(
      row.targetDeclarationIdentitySha256),
    parserReceiptFrameI32(row.importDeclarationRow),
    parserReceiptFrameI32(row.importItemRow),
    parserReceiptFrameI32(row.keywordTokenIndex),
    ...parserReceiptTokenIdentityFrames(
      source, tokens[row.keywordTokenIndex]!),
    parserReceiptFrameI32(row.aliasTokenIndex),
  ];
  if (row.aliasTokenIndex >= 0) {
    parts.push(...parserReceiptTokenIdentityFrames(
      source, tokens[row.aliasTokenIndex]!));
  }
  parts.push(
    parserReceiptFrameI32(row.spanStart),
    parserReceiptFrameI32(row.spanEnd),
    parserReceiptFrameI32(row.moduleTokenIndexes.length),
  );
  for (const tokenIndex of row.moduleTokenIndexes) {
    parts.push(...parserReceiptTokenIdentityFrames(
      source, tokens[tokenIndex]!));
  }
  parts.push(
    parserReceiptFrameI32(row.prefixTokenCount),
    parserReceiptFrameText(row.ownerModulePath),
    parserReceiptFrameText(row.targetModulePath),
    parserReceiptFrameText(row.targetSourcePath),
    parserReceiptFrameI32(row.targetProfileIndex),
  );
  return sha256(Buffer.concat(parts));
}

export function driverDeclarationLexicalScopeIdentity(
  row: DriverDeclarationLexicalScope,
): string {
  return sha256(Buffer.concat([
    parserReceiptFrameText(
      "cheng.parser_span_receipt.declaration_lexical_scope"),
    parserReceiptFrameI32(row.index),
    parserReceiptFrameI32(row.producerSourceIndex),
    parserReceiptFrameI32(row.sourceLocalRow),
    parserReceiptFrameI32(row.kind),
    parserReceiptFrameI32(row.parentScopeIndex),
    parserReceiptFrameI32(row.ownerDeclarationIndex),
    parserReceiptFrameI32(row.spanStart),
    parserReceiptFrameI32(row.spanEnd),
  ]));
}

export function driverDeclarationIdentity(
  row: DriverDeclaration,
  source: string,
  tokens: readonly DriverToken[],
  priorDeclarationIdentities: readonly string[],
  lexicalScopes: readonly DriverDeclarationLexicalScope[],
  typeSyntaxes: readonly DriverTypeSyntax[],
  typeGenericSymbols: readonly DriverTypeGenericSymbol[],
): string {
  const nameToken = tokens[row.nameTokenIndex]!;
  const ownerIdentity = row.ownerDeclarationIndex < 0
    ? undefined
    : priorDeclarationIdentities[row.ownerDeclarationIndex];
  const scopeIdentity =
    lexicalScopes[row.lexicalScopeIndex]?.identitySha256;
  const typeIdentity = row.typeSyntaxRootIndex < 0
    ? undefined
    : typeSyntaxes[row.typeSyntaxRootIndex]?.identitySha256;
  const suiteScopeIdentity = row.suiteLexicalScopeIndex < 0
    ? undefined
    : lexicalScopes[row.suiteLexicalScopeIndex]?.identitySha256;
  const genericIdentities = row.genericSymbolStart < 0
    ? []
    : typeGenericSymbols.slice(
      row.genericSymbolStart,
      row.genericSymbolStart + row.genericSymbolCount,
    );
  if ((row.ownerDeclarationIndex >= 0 && ownerIdentity === undefined) ||
      scopeIdentity === undefined ||
      (row.typeSyntaxRootIndex >= 0 && typeIdentity === undefined) ||
      (row.suiteLexicalScopeIndex >= 0 &&
        suiteScopeIdentity === undefined) ||
      genericIdentities.length !== row.genericSymbolCount) {
    throw new Error(`driver declaration identity edge invalid: ${row.index}`);
  }
  return sha256(Buffer.concat([
    parserReceiptFrameText("cheng.parser_span_receipt.declaration"),
    parserReceiptFrameI32(row.index),
    parserReceiptFrameI32(row.producerSourceIndex),
    parserReceiptFrameI32(row.sourceLocalRow),
    parserReceiptFrameI32(row.sourceTextId),
    parserReceiptFrameI32(row.kind),
    ...parserReceiptTokenIdentityFrames(source, nameToken),
    parserReceiptFrameI32(row.ownerDeclarationIndex),
    ...(ownerIdentity === undefined
      ? [] : [parserReceiptFrameFixed32(ownerIdentity)]),
    parserReceiptFrameI32(row.lexicalScopeIndex),
    parserReceiptFrameFixed32(scopeIdentity),
    parserReceiptFrameI32(row.functionRow),
    parserReceiptFrameI32(row.typeSyntaxRootIndex),
    ...(typeIdentity === undefined
      ? [] : [parserReceiptFrameFixed32(typeIdentity)]),
    parserReceiptFrameI32(row.genericSymbolStart),
    parserReceiptFrameI32(row.genericSymbolCount),
    ...genericIdentities.flatMap((symbol) => [
      parserReceiptFrameI32(symbol.index),
      parserReceiptFrameFixed32(symbol.identitySha256),
    ]),
    parserReceiptFrameI32(row.suiteLexicalScopeIndex),
    ...(suiteScopeIdentity === undefined
      ? [] : [parserReceiptFrameFixed32(suiteScopeIdentity)]),
    parserReceiptFrameI32(row.spanStart),
    parserReceiptFrameI32(row.spanEnd),
    parserReceiptFrameI32(row.nameSpanStart),
    parserReceiptFrameI32(row.nameSpanEnd),
    parserReceiptFrameI32(row.mutableFlag),
    parserReceiptFrameI32(row.exportedFlag),
  ]));
}

export function parserAnnotationIdentity(
  row: DriverAnnotation,
  source: string,
  tokens: readonly DriverToken[],
  rootTargets: readonly number[],
  argIdentities: readonly string[],
): string {
  const at = tokens[row.nameTokenIndex - 1]!;
  const name = tokens[row.nameTokenIndex]!;
  const target = tokens[row.targetTokenIndex]!;
  const roots = rootTargets.slice(
    row.argRootStart,
    row.argRootStart + row.argRootCount,
  );
  return sha256(Buffer.concat([
    parserReceiptFrameText("cheng.parser_span_receipt.annotation"),
    parserReceiptFrameI32(row.index),
    parserReceiptFrameI32(row.producerSourceIndex),
    parserReceiptFrameI32(row.sourceLocalRow),
    ...parserReceiptTokenIdentityFrames(source, at),
    ...parserReceiptTokenIdentityFrames(source, name),
    ...parserReceiptTokenIdentityFrames(source, target),
    parserReceiptFrameI32(row.spanStart),
    parserReceiptFrameI32(row.spanEnd),
    parserReceiptFrameI32(row.argRootStart),
    parserReceiptFrameI32(row.argRootCount),
    ...roots.flatMap((root) => [
      parserReceiptFrameI32(root),
      parserReceiptFrameFixed32(argIdentities[root]!),
    ]),
  ]));
}

export function parserAnnotationArgIdentity(
  row: DriverAnnotationArg,
  source: string,
  tokens: readonly DriverToken[],
  childTargets: readonly number[],
  priorIdentities: readonly string[],
): string {
  const token = tokens[row.tokenIndex]!;
  const separator = row.separatorTokenIndex < 0
    ? undefined
    : tokens[row.separatorTokenIndex]!;
  const children = childTargets.slice(
    row.childStart,
    row.childStart + row.childCount,
  );
  return sha256(Buffer.concat([
    parserReceiptFrameText("cheng.parser_span_receipt.annotation_arg"),
    parserReceiptFrameI32(row.index),
    parserReceiptFrameI32(row.producerSourceIndex),
    parserReceiptFrameI32(row.sourceLocalRow),
    parserReceiptFrameI32(row.ownerAnnotationIndex),
    parserReceiptFrameI32(row.kind),
    ...parserReceiptTokenIdentityFrames(source, token),
    parserReceiptFrameI32(row.separatorTokenIndex),
    ...(separator === undefined
      ? [] : parserReceiptTokenIdentityFrames(source, separator)),
    parserReceiptFrameI32(row.spanStart),
    parserReceiptFrameI32(row.spanEnd),
    parserReceiptFrameI32(row.childStart),
    parserReceiptFrameI32(row.childCount),
    ...children.flatMap((child) => [
      parserReceiptFrameI32(child),
      parserReceiptFrameFixed32(priorIdentities[child]!),
    ]),
  ]));
}

export function parserTypeSyntaxIdentity(
  row: DriverTypeSyntax,
  children: readonly number[],
): string {
  return sha256(Buffer.concat([
    parserReceiptFrameText("cheng.parser_span_receipt.type_syntax"),
    parserReceiptFrameI32(row.index),
    parserReceiptFrameI32(row.producerSourceIndex),
    parserReceiptFrameI32(row.sourceLocalRow),
    parserReceiptFrameI32(row.sourceTextId),
    parserReceiptFrameI32(row.kind),
    parserReceiptFrameI32(row.spanStart),
    parserReceiptFrameI32(row.spanEnd),
    parserReceiptFrameI32(row.ownerTokenIndex),
    parserReceiptFrameI32(row.declarationOwnerTokenIndex),
    parserReceiptFrameI32(row.declarationOwnerIndex),
    parserReceiptFrameI32(row.genericSymbolStart),
    parserReceiptFrameI32(row.genericSymbolCount),
    parserReceiptFrameI32(row.childStart),
    parserReceiptFrameI32(row.childCount),
    ...children
      .slice(row.childStart, row.childStart + row.childCount)
      .map(parserReceiptFrameI32),
    parserReceiptFrameI32(row.bracketArgStart),
    parserReceiptFrameI32(row.bracketArgCount),
    parserReceiptFrameI32(row.nameTokenIndex),
    parserReceiptFrameI32(row.fixedLength),
    parserReceiptFrameI32(row.questionTokenIndex),
    parserReceiptFrameI32(row.rootKind),
    parserReceiptFrameI32(row.enumVariantStart),
    parserReceiptFrameI32(row.enumVariantCount),
  ]));
}

export interface CurrentTupleTypeSyntaxSurface {
  readonly row: number;
  readonly spanStart: number;
  readonly spanEnd: number;
  readonly markerTokenIndex: number;
  readonly markerKindText: string | null;
  readonly markerStart: number;
  readonly openTokenIndex: number;
  readonly openKindText: string | null;
  readonly openEnd: number;
  readonly closeTokenIndex: number;
  readonly closeKindText: string | null;
  readonly closeStart: number;
  readonly closeEnd: number;
  readonly separatorCount: number;
  readonly children: readonly {
    readonly spanStart: number;
    readonly spanEnd: number;
    readonly ownerTokenAccepted: boolean;
  }[];
}

export function assertCurrentTupleTypeSyntaxSurface(
  surface: CurrentTupleTypeSyntaxSurface,
): void {
  let previousChildEnd = surface.openEnd;
  const childrenInvalid = surface.children.some((child) => {
    const invalid = child.spanStart < previousChildEnd ||
      child.spanEnd <= child.spanStart ||
      child.spanEnd > surface.closeStart ||
      !child.ownerTokenAccepted;
    previousChildEnd = child.spanEnd;
    return invalid;
  });
  if (surface.row < 0 ||
      surface.spanStart < 0 ||
      surface.spanEnd <= surface.spanStart ||
      surface.markerKindText !== "ParserValueTokenTuple" ||
      surface.markerStart !== surface.spanStart ||
      surface.openTokenIndex !== surface.markerTokenIndex + 1 ||
      surface.openKindText !== "ParserValueTokenLeftBracket" ||
      surface.openEnd <= surface.markerStart ||
      surface.closeTokenIndex <= surface.openTokenIndex ||
      surface.closeKindText !== "ParserValueTokenRightBracket" ||
      surface.closeStart < surface.openEnd ||
      surface.closeEnd !== surface.spanEnd ||
      surface.children.length < 1 ||
      surface.separatorCount !== surface.children.length - 1 ||
      childrenInvalid) {
    throw new Error(
      `driver Tuple TypeSyntax authority invalid: ${surface.row}`);
  }
}

function parserTypeSyntaxBracketArgIdentity(
  row: DriverTypeSyntaxBracketArg,
): string {
  return sha256(Buffer.concat([
    parserReceiptFrameText(
      "cheng.parser_span_receipt.type_syntax_bracket_arg"),
    parserReceiptFrameI32(row.index),
    parserReceiptFrameI32(row.producerSourceIndex),
    parserReceiptFrameI32(row.sourceTextId),
    parserReceiptFrameI32(row.ownerTypeSyntaxIndex),
    parserReceiptFrameI32(row.ordinal),
    parserReceiptFrameI32(row.tokenStart),
    parserReceiptFrameI32(row.tokenCount),
    parserReceiptFrameI32(row.typeSyntaxIndex),
    parserReceiptFrameI32(row.constExprRootIndex),
  ]));
}

export function parserTypeEnumVariantIdentity(
  row: DriverTypeEnumVariant,
  source: string,
  tokens: readonly DriverToken[],
  typeSyntaxes: readonly DriverTypeSyntax[],
): string {
  const owner = typeSyntaxes[row.declarationOwnerIndex];
  const ownerToken = tokens[row.declarationOwnerTokenIndex];
  const nameToken = tokens[row.nameTokenIndex];
  const payload = row.payloadTypeSyntaxIndex < 0
    ? undefined
    : typeSyntaxes[row.payloadTypeSyntaxIndex];
  if (owner === undefined ||
      ownerToken === undefined ||
      nameToken === undefined ||
      (row.payloadTypeSyntaxIndex >= 0 && payload === undefined)) {
    throw new Error(
      `driver enum variant identity edge invalid: ${row.index}`);
  }
  return sha256(Buffer.concat([
    parserReceiptFrameText(
      "cheng.parser_span_receipt.type_enum_variant"),
    parserReceiptFrameI32(row.index),
    parserReceiptFrameI32(row.producerSourceIndex),
    parserReceiptFrameI32(row.declarationOwnerIndex),
    parserReceiptFrameFixed32(owner.identitySha256),
    ...parserReceiptTokenIdentityFrames(source, ownerToken),
    ...parserReceiptTokenIdentityFrames(source, nameToken),
    parserReceiptFrameI32(row.ordinal),
    parserReceiptFrameI32(row.payloadTypeSyntaxIndex),
    ...(payload === undefined
      ? []
      : [parserReceiptFrameFixed32(payload.identitySha256)]),
  ]));
}

function parserTypeConstExprIdentity(row: DriverTypeConstExpr): string {
  return sha256(Buffer.concat([
    parserReceiptFrameText("cheng.parser_span_receipt.type_const_expr"),
    parserReceiptFrameI32(row.index),
    parserReceiptFrameI32(row.producerSourceIndex),
    parserReceiptFrameI32(row.sourceTextId),
    parserReceiptFrameI32(row.tokenIndex),
    parserReceiptFrameI32(row.kind),
    parserReceiptFrameI32(row.leftChildIndex),
    parserReceiptFrameI32(row.rightChildIndex),
    parserReceiptFrameI32(row.integerValue),
  ]));
}

function parserTypeGenericSymbolIdentity(
  row: DriverTypeGenericSymbol,
): string {
  return sha256(Buffer.concat([
    parserReceiptFrameText("cheng.parser_span_receipt.type_generic_symbol"),
    parserReceiptFrameI32(row.index),
    parserReceiptFrameI32(row.producerSourceIndex),
    parserReceiptFrameI32(row.declarationOwnerTokenIndex),
    parserReceiptFrameI32(row.nameTokenIndex),
    parserReceiptFrameI32(row.ordinal),
    parserReceiptFrameI32(row.spanStart),
    parserReceiptFrameI32(row.spanEnd),
    parserReceiptFrameI32(row.ownerDeclarationIndex),
    parserReceiptFrameI32(row.ownerTypeSyntaxIndex),
    parserReceiptFrameI32(row.constraintTypeSyntaxIndex),
    parserReceiptFrameI32(row.defaultTypeSyntaxIndex),
    parserReceiptFrameI32(row.childStart),
    parserReceiptFrameI32(row.childCount),
  ]));
}

export function parserPatternIdentity(row: DriverPattern): string {
  return sha256(Buffer.concat([
    parserReceiptFrameText("cheng.parser_span_receipt.pattern"),
    parserReceiptFrameI32(row.index),
    parserReceiptFrameI32(row.producerSourceIndex),
    parserReceiptFrameI32(row.sourceLocalRow),
    parserReceiptFrameI32(row.kind),
    parserReceiptFrameI32(row.nameTokenIndex),
    parserReceiptFrameI32(row.ownerLexicalScopeIndex),
    parserReceiptFrameI32(row.ownerKind),
    parserReceiptFrameI32(row.ownerRow),
    parserReceiptFrameI32(row.bindingDeclarationIndex),
    parserReceiptFrameI32(row.typeSyntaxRootIndex),
    parserReceiptFrameI32(row.spanStart),
    parserReceiptFrameI32(row.spanEnd),
    parserReceiptFrameI32(row.childStart),
    parserReceiptFrameI32(row.childCount),
  ]));
}

export function assertCurrentPatternBindingTypeSyntaxJoin(
  row: number,
  patternKindText: string,
  bindingDeclarationIndex: number,
  patternTypeSyntaxRootIndex: number,
  declarationTypeSyntaxRootIndex: number | undefined,
): void {
  const accepted = patternKindText === "ParserPatternBinding"
    ? bindingDeclarationIndex >= 0 &&
      declarationTypeSyntaxRootIndex === patternTypeSyntaxRootIndex
    : bindingDeclarationIndex === -1;
  if (!accepted) {
    throw new Error(
      `driver pattern binding TypeSyntax join invalid: ${row}`);
  }
}

export interface CurrentPatternFormalShapeToken {
  readonly index: number;
  readonly kindText: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface CurrentPatternFormalShapeChild {
  readonly spanStart: number;
  readonly spanEnd: number;
}

export interface CurrentPatternFormalShape {
  readonly row: number;
  readonly kindText: string;
  readonly nameTokenIndex: number;
  readonly spanStart: number;
  readonly spanEnd: number;
  readonly tokens: readonly CurrentPatternFormalShapeToken[];
  readonly children: readonly CurrentPatternFormalShapeChild[];
}

export function assertCurrentPatternFormalShape(
  shape: CurrentPatternFormalShape,
): void {
  const tokens = shape.tokens;
  const children = shape.children;
  let previousTokenIndex = -1;
  let previousTokenEnd = shape.spanStart;
  let previousChildEnd = shape.spanStart;
  const tokenRowsInvalid = tokens.length === 0 ||
    tokens.some((token) => {
      const invalid = token.index <= previousTokenIndex ||
        token.start < previousTokenEnd ||
        token.start < shape.spanStart ||
        token.end <= token.start ||
        token.end > shape.spanEnd ||
        token.kindText.length === 0;
      previousTokenIndex = token.index;
      previousTokenEnd = token.end;
      return invalid;
    });
  const childRowsInvalid = children.some((child) => {
    const invalid = child.spanStart < previousChildEnd ||
      child.spanStart < shape.spanStart ||
      child.spanEnd <= child.spanStart ||
      child.spanEnd > shape.spanEnd;
    previousChildEnd = child.spanEnd;
    return invalid;
  });
  if (shape.row < 0 ||
      shape.spanStart < 0 ||
      shape.spanEnd <= shape.spanStart ||
      shape.nameTokenIndex < -1 ||
      tokenRowsInvalid ||
      childRowsInvalid) {
    throw new Error(
      `driver pattern formal shape invalid: ${shape.row}`);
  }
  const nameToken = shape.nameTokenIndex < 0
    ? undefined
    : tokens.find((token) => token.index === shape.nameTokenIndex);
  const tokensBetween = (
    start: number,
    end: number,
  ): readonly CurrentPatternFormalShapeToken[] =>
    tokens.filter((token) =>
      token.start >= start && token.end <= end && token.start < end);
  const exactTokenKinds = (
    rows: readonly CurrentPatternFormalShapeToken[],
    kinds: readonly string[],
  ): boolean =>
    rows.length === kinds.length &&
    rows.every((token, index) => token.kindText === kinds[index]);
  const exactDelimitedChildren = (
    openKind: string,
    closeKind: string,
    prefix: CurrentPatternFormalShapeToken | undefined,
    allowEmpty: boolean,
  ): boolean => {
    const openOffset = prefix === undefined ? 0 : 1;
    const open = tokens[openOffset];
    const close = tokens[tokens.length - 1];
    if (tokens[0] === undefined || open === undefined ||
        close === undefined ||
        (prefix !== undefined && tokens[0] !== prefix) ||
        open.kindText !== openKind ||
        close.kindText !== closeKind ||
        shape.spanStart !== tokens[0]!.start ||
        shape.spanEnd !== close.end ||
        (!allowEmpty && children.length === 0)) {
      return false;
    }
    if (children.length === 0) {
      return tokens.length === openOffset + 2 &&
        open.end <= close.start;
    }
    let boundary = open.end;
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index]!;
      if (child.spanStart < boundary || child.spanEnd > close.start ||
          !exactTokenKinds(
            tokensBetween(boundary, child.spanStart),
            index === 0 ? [] : ["ParserValueTokenComma"],
          )) {
        return false;
      }
      boundary = child.spanEnd;
    }
    return boundary <= close.start &&
      tokensBetween(boundary, close.start).length === 0;
  };
  const nameTokenKinds = new Set([
    "ParserValueTokenIdentifier",
    "ParserValueTokenBlock",
    "ParserValueTokenObject",
  ]);
  const literalTokenKinds = new Set([
    "ParserValueTokenInteger",
    "ParserValueTokenFloat",
    "ParserValueTokenString",
    "ParserValueTokenChar",
    "ParserValueTokenTrue",
    "ParserValueTokenFalse",
  ]);
  const singleNameToken = nameToken !== undefined &&
    tokens.length === 1 &&
    tokens[0] === nameToken &&
    shape.spanStart === nameToken.start &&
    shape.spanEnd === nameToken.end;
  let accepted = false;
  switch (shape.kindText) {
    case "ParserPatternBinding":
      accepted = children.length === 0 &&
        singleNameToken &&
        nameTokenKinds.has(nameToken!.kindText) &&
        nameToken!.text !== "_";
      break;
    case "ParserPatternWildcard":
      accepted = children.length === 0 &&
        singleNameToken &&
        nameTokenKinds.has(nameToken!.kindText) &&
        nameToken!.text === "_";
      break;
    case "ParserPatternLiteral":
      accepted = children.length === 0 &&
        singleNameToken &&
        (literalTokenKinds.has(nameToken!.kindText) ||
          nameTokenKinds.has(nameToken!.kindText));
      break;
    case "ParserPatternTuple":
      accepted = exactDelimitedChildren(
        "ParserValueTokenLeftParen",
        "ParserValueTokenRightParen",
        undefined,
        false,
      );
      break;
    case "ParserPatternSequence":
      accepted = exactDelimitedChildren(
        "ParserValueTokenLeftBracket",
        "ParserValueTokenRightBracket",
        undefined,
        true,
      );
      break;
    case "ParserPatternObject":
      accepted = exactDelimitedChildren(
        "ParserValueTokenLeftBrace",
        "ParserValueTokenRightBrace",
        undefined,
        false,
      );
      break;
    case "ParserPatternConstructor":
      accepted = nameToken !== undefined &&
        nameTokenKinds.has(nameToken.kindText) &&
        exactDelimitedChildren(
          "ParserValueTokenLeftParen",
          "ParserValueTokenRightParen",
          nameToken,
          true,
        );
      break;
    case "ParserPatternNamedField": {
      const child = children[0];
      accepted = children.length === 1 &&
        child !== undefined &&
        nameToken !== undefined &&
        nameTokenKinds.has(nameToken.kindText) &&
        shape.spanStart === nameToken.start &&
        shape.spanEnd === child.spanEnd &&
        exactTokenKinds(
          tokensBetween(nameToken.end, child.spanStart),
          ["ParserValueTokenColon"],
        );
      break;
    }
    case "ParserPatternRange": {
      const left = children[0];
      const right = children[1];
      const between = left === undefined || right === undefined
        ? []
        : tokensBetween(left.spanEnd, right.spanStart);
      accepted = children.length === 2 &&
        left !== undefined && right !== undefined &&
        shape.spanStart === left.spanStart &&
        shape.spanEnd === right.spanEnd &&
        between.length === 1 &&
        ["ParserValueTokenRangeInclusive",
          "ParserValueTokenRangeExclusive"].includes(
            between[0]!.kindText);
      break;
    }
  }
  if (!accepted) {
    throw new Error(
      `driver pattern formal shape invalid: ${shape.row}`);
  }
}

function tokenTextRaw(source: string, token: DriverToken): string {
  return utf8Slice(source, token.start, token.end);
}

interface ExpectedTypeConstExpr {
  readonly kind: number;
  readonly tokenIndex: number;
  readonly integerValue: number;
  readonly left?: ExpectedTypeConstExpr;
  readonly right?: ExpectedTypeConstExpr;
}

function parseExpectedTypeConstExpr(
  receipt: DriverReceipt,
  source: string,
  tokenNames: readonly string[],
  tokenStart: number,
  tokenLimit: number,
): ExpectedTypeConstExpr {
  let cursor = tokenStart;
  const tokenText = (index: number): string =>
    tokenTextRaw(source, receipt.tokens[index]!);

  const parsePrimary = (): ExpectedTypeConstExpr => {
    if (cursor >= tokenLimit) {
      throw new Error("driver TypeSyntax const expression primary missing");
    }
    const tokenIndex = cursor;
    const token = receipt.tokens[cursor]!;
    const text = tokenText(cursor);
    if (text === "+" || text === "-") {
      cursor += 1;
      return {
        kind: text === "+" ? 2 : 3,
        tokenIndex,
        integerValue: 0,
        left: parsePrimary(),
      };
    }
    if (text === "(") {
      cursor += 1;
      const nested = parseAdd();
      if (cursor >= tokenLimit || tokenText(cursor) !== ")") {
        throw new Error(
          "driver TypeSyntax const expression close paren missing");
      }
      cursor += 1;
      return nested;
    }
    if (tokenNames[token.kind] !== "ParserValueTokenInteger" ||
        !/^[0-9]+$/.test(text)) {
      throw new Error(
        `driver TypeSyntax const expression integer invalid: ${tokenIndex}`);
    }
    const integerValue = Number(text);
    if (!Number.isSafeInteger(integerValue) ||
        integerValue < 0 || integerValue > 2147483647) {
      throw new Error(
        `driver TypeSyntax const expression integer overflow: ${tokenIndex}`);
    }
    cursor += 1;
    return {kind: 1, tokenIndex, integerValue};
  };

  const parseMul = (): ExpectedTypeConstExpr => {
    let left = parsePrimary();
    while (cursor < tokenLimit) {
      const text = tokenText(cursor);
      const kind = text === "*" ? 6 :
        text === "/" ? 7 :
          text === "%" ? 8 : 0;
      if (kind === 0) break;
      const tokenIndex = cursor;
      cursor += 1;
      left = {
        kind,
        tokenIndex,
        integerValue: 0,
        left,
        right: parsePrimary(),
      };
    }
    return left;
  };

  const parseAdd = (): ExpectedTypeConstExpr => {
    let left = parseMul();
    while (cursor < tokenLimit) {
      const text = tokenText(cursor);
      const kind = text === "+" ? 4 : text === "-" ? 5 : 0;
      if (kind === 0) break;
      const tokenIndex = cursor;
      cursor += 1;
      left = {
        kind,
        tokenIndex,
        integerValue: 0,
        left,
        right: parseMul(),
      };
    }
    return left;
  };

  const root = parseAdd();
  if (cursor !== tokenLimit) {
    throw new Error(
      `driver TypeSyntax const expression trailing token: ${cursor}`);
  }
  return root;
}

function matchingTokenIndex(
  tokens: readonly DriverToken[],
  tokenNames: readonly string[],
  openIndex: number,
  openKind: string,
  closeKind: string,
): number {
  const open = tokens[openIndex];
  if (open === undefined || tokenNames[open.kind] !== openKind) {
    return -1;
  }
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.sourceTextId !== open.sourceTextId ||
        token.producerSourceIndex !== open.producerSourceIndex) {
      continue;
    }
    const kind = tokenNames[token.kind];
    if (kind === openKind) depth += 1;
    if (kind === closeKind) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function topLevelSeparatorCount(
  tokens: readonly DriverToken[],
  tokenNames: readonly string[],
  start: number,
  limit: number,
): number {
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let count = 0;
  for (let index = start; index < limit; index += 1) {
    const kind = tokenNames[tokens[index]!.kind];
    if (kind === "ParserValueTokenLeftParen") paren += 1;
    else if (kind === "ParserValueTokenRightParen") paren -= 1;
    else if (kind === "ParserValueTokenLeftBracket") bracket += 1;
    else if (kind === "ParserValueTokenRightBracket") bracket -= 1;
    else if (kind === "ParserValueTokenLeftBrace") brace += 1;
    else if (kind === "ParserValueTokenRightBrace") brace -= 1;
    else if (paren === 0 && bracket === 0 && brace === 0 &&
      (kind === "ParserValueTokenComma" ||
       kind === "ParserValueTokenSemicolon")) {
      count += 1;
    }
    if (paren < 0 || bracket < 0 || brace < 0) return -1;
  }
  return paren === 0 && bracket === 0 && brace === 0 ? count : -1;
}

function buildCtx(
  receipt: DriverReceipt,
  source: string,
  tokenNames: readonly string[],
  valueExprKindNames: readonly string[],
): Ctx {
  const byKind = new Map<string, DriverNode[]>();
  for (const node of receipt.nodes) {
    if (!byKind.has(node.kind)) byKind.set(node.kind, []);
    byKind.get(node.kind)!.push(node);
  }
  const annotations = receipt.annotations;
  const annotationArgRoots = receipt.annotationArgRoots;
  const annotationArgs = receipt.annotationArgs;
  const annotationArgChildren = receipt.annotationArgChildren;
  const typeSyntaxes = receipt.typeSyntaxes;
  const typeSyntaxChildren = receipt.typeSyntaxChildren;
  const typeEnumVariants = receipt.typeEnumVariants;
  const typeSyntaxBracketArgs = receipt.typeSyntaxBracketArgs;
  const typeConstExprs = receipt.typeConstExprs;
  const typeGenericSymbols = receipt.typeGenericSymbols;
  const typeGenericSymbolChildren = receipt.typeGenericSymbolChildren;
  const declarationLexicalScopes = receipt.declarationLexicalScopes;
  const declarations = receipt.declarations;
  const patterns = receipt.patterns;
  const patternChildren = receipt.patternChildren;
  const normalizedStatementFacts = receipt.normalizedStatementFacts;
  const normalizedScopeFacts = receipt.normalizedScopeFacts;
  const importEdges = receipt.importEdges;
  const hex64 = /^[0-9a-f]{64}$/;
  if (!Array.isArray(declarations) ||
      receipt.counts.declarationCount !== declarations.length) {
    throw new Error("driver declaration receipt count/array mismatch");
  }
  if (receipt.relativePath.length === 0 ||
      !hex64.test(receipt.sourceSha256) ||
      !hex64.test(receipt.driverBytesSha256) ||
      !hex64.test(receipt.toolchainManifestSha256) ||
      !hex64.test(receipt.parserTraceRootSha256)) {
    throw new Error("driver receipt top-level identity invalid");
  }
  if (!Array.isArray(receipt.sourceTexts) ||
      receipt.counts.sourceTextCount !== 1 ||
      receipt.sourceTexts.length !== 1 ||
      canonicalJson(Object.keys(receipt.sourceTexts[0] ?? {}).sort()) !==
        canonicalJson(["byteLength", "sha256", "sourceTextId"]) ||
      receipt.sourceTexts[0]!.sourceTextId !== 0 ||
      receipt.sourceTexts[0]!.sha256 !== receipt.sourceSha256 ||
      receipt.sourceTexts[0]!.byteLength !== utf8ByteLength(source) ||
      !Array.isArray(receipt.tokens) ||
      receipt.counts.tokenCount !== receipt.tokens.length) {
    throw new Error("driver source/token authority invalid");
  }
  let previousTokenEnd = -1;
  for (const token of receipt.tokens) {
    if (canonicalJson(Object.keys(token).sort()) !== canonicalJson([
      "column",
      "end",
      "index",
      "kind",
      "lexicalParentIndex",
      "line",
      "producerSourceIndex",
      "sourceLocalIndex",
      "sourceTextId",
      "start",
    ]) ||
        !Number.isInteger(token.index) ||
        token.index < 0 ||
        receipt.tokens[token.index] !== token ||
        !Number.isInteger(token.kind) ||
        token.kind <= 0 ||
        tokenNames[token.kind] === undefined ||
        token.sourceTextId !== 0 ||
        token.producerSourceIndex !== 0 ||
        token.sourceLocalIndex !== token.index ||
        !Number.isInteger(token.lexicalParentIndex) ||
        token.lexicalParentIndex < -1 ||
        token.lexicalParentIndex >= token.index ||
        !Number.isInteger(token.start) ||
        !Number.isInteger(token.end) ||
        token.start < 0 ||
        token.end <= token.start ||
        token.end > utf8ByteLength(source) ||
        token.start < previousTokenEnd ||
        !Number.isInteger(token.line) ||
        token.line <= 0 ||
        !Number.isInteger(token.column) ||
        token.column <= 0) {
      throw new Error(`driver canonical token row invalid: ${token.index}`);
    }
    previousTokenEnd = token.end;
  }
  if (!Array.isArray(receipt.nodes) ||
      receipt.counts.nodeCount !== receipt.nodes.length) {
    throw new Error("driver value node count/array mismatch");
  }
  const nodeParentsFromChildren =
    new Array<number>(receipt.nodes.length).fill(-1);
  for (const node of receipt.nodes) {
    const kindOrdinal = valueExprKindNames.indexOf(node.kind);
    const containedTokens = receipt.tokens.filter((token) =>
      token.sourceTextId === node.sourceTextId &&
      token.start >= node.spanStart &&
      token.end <= node.spanEnd);
    const expectedTokenStart =
      containedTokens[0]?.index ?? -1;
    const expectedTokenEnd =
      containedTokens.length === 0
        ? -1
        : containedTokens[containedTokens.length - 1]!.index + 1;
    if (canonicalJson(Object.keys(node).sort()) !== canonicalJson([
      "childCount",
      "firstChild",
      "identitySha256",
      "index",
      "kind",
      "nextSibling",
      "parent",
      "sourceTextId",
      "spanEnd",
      "spanStart",
      "tokenEnd",
      "tokenStart",
    ]) ||
        !Number.isInteger(node.index) ||
        node.index < 0 ||
        receipt.nodes[node.index] !== node ||
        kindOrdinal <= 0 ||
        node.sourceTextId !== 0 ||
        !Number.isInteger(node.spanStart) ||
        !Number.isInteger(node.spanEnd) ||
        node.spanStart < 0 ||
        node.spanEnd <= node.spanStart ||
        node.spanEnd > utf8ByteLength(source) ||
        node.tokenStart !== expectedTokenStart ||
        node.tokenEnd !== expectedTokenEnd ||
        !Number.isInteger(node.parent) ||
        node.parent < -1 ||
        node.parent >= receipt.nodes.length ||
        (node.parent >= 0 && node.parent <= node.index) ||
        !Number.isInteger(node.firstChild) ||
        !Number.isInteger(node.childCount) ||
        node.childCount < 0 ||
        (node.childCount === 0) !== (node.firstChild === -1) ||
        node.firstChild < -1 ||
        node.firstChild >= node.index ||
        !Number.isInteger(node.nextSibling) ||
        node.nextSibling < -1 ||
        node.nextSibling >= receipt.nodes.length ||
        !/^[0-9a-f]{64}$/.test(node.identitySha256) ||
        node.identitySha256 !==
          parserValueNodeIdentity(node, kindOrdinal)) {
      throw new Error(`driver value node row invalid: ${node.index}`);
    }
    let childIndex = node.firstChild;
    for (let ordinal = 0; ordinal < node.childCount; ordinal += 1) {
      const child = receipt.nodes[childIndex];
      if (child === undefined ||
          child.index >= node.index ||
          child.parent !== node.index ||
          child.sourceTextId !== node.sourceTextId ||
          child.spanStart < node.spanStart ||
          child.spanEnd > node.spanEnd ||
          nodeParentsFromChildren[child.index] !== -1) {
        throw new Error(
          `driver value node child edge invalid: ${node.index}/${ordinal}`);
      }
      nodeParentsFromChildren[child.index] = node.index;
      childIndex = child.nextSibling;
    }
    if (childIndex !== -1) {
      throw new Error(
        `driver value node child chain length invalid: ${node.index}`);
    }
  }
  for (const node of receipt.nodes) {
    if (nodeParentsFromChildren[node.index] !== node.parent) {
      throw new Error(
        `driver value node parent/child edge invalid: ${node.index}`);
    }
    if (node.nextSibling >= 0) {
      const sibling = receipt.nodes[node.nextSibling]!;
      if (node.parent < 0 ||
          sibling.parent !== node.parent ||
          sibling.index <= node.index) {
        throw new Error(
          `driver value node sibling edge invalid: ${node.index}`);
      }
    }
  }
  if (!Array.isArray(receipt.statementRoots) ||
      receipt.counts.statementRootCount !==
        receipt.statementRoots.length) {
    throw new Error("driver statement root count/array mismatch");
  }
  const statementRootRoles = new Set([
    "ParserValueExprStatementBindingInitializer",
    "ParserValueExprStatementAssignmentRhs",
    "ParserValueExprStatementReturnValue",
    "ParserValueExprStatementImplicitReturnValue",
    "ParserValueExprStatementYieldValue",
    "ParserValueExprStatementExpression",
    "ParserValueExprStatementCondition",
    "ParserValueExprStatementLoopSource",
    "ParserValueExprStatementParameterDefault",
    "ParserValueExprStatementTypeDefault",
    "ParserValueExprStatementWhereCondition",
    "ParserValueExprStatementCaseEntry",
    "ParserValueExprStatementCaseGuard",
  ]);
  const statementRootNodes = new Set<number>();
  for (const root of receipt.statementRoots) {
    const node = receipt.nodes[root.nodeIndex];
    const anchor = receipt.tokens[root.anchorTokenIndex];
    const endToken = node === undefined || node.tokenEnd <= 0
      ? undefined
      : receipt.tokens[node.tokenEnd - 1];
    const declarationAuthority =
      root.role === "ParserValueExprStatementBindingInitializer" ||
      root.role === "ParserValueExprStatementTypeDefault";
    if (canonicalJson(Object.keys(root).sort()) !== canonicalJson([
      "anchorColumn",
      "anchorLine",
      "anchorTokenIndex",
      "bindingDeclarationCount",
      "bindingDeclarationStart",
      "endColumn",
      "endLine",
      "index",
      "nodeIndex",
      "role",
    ]) ||
        !Number.isInteger(root.index) ||
        root.index < 0 ||
        receipt.statementRoots[root.index] !== root ||
        !Number.isInteger(root.nodeIndex) ||
        node === undefined ||
        node.parent !== -1 ||
        statementRootNodes.has(root.nodeIndex) ||
        !statementRootRoles.has(root.role) ||
        !Number.isInteger(root.anchorTokenIndex) ||
        anchor === undefined ||
        anchor.sourceTextId !== node.sourceTextId ||
        root.anchorLine !== anchor.line ||
        root.anchorColumn !== anchor.column ||
        endToken === undefined ||
        endToken.sourceTextId !== node.sourceTextId ||
        endToken.end !== node.spanEnd ||
        root.endLine !== endToken.line ||
        root.endColumn !==
          endToken.column + endToken.end - endToken.start - 1 ||
        !Number.isInteger(root.bindingDeclarationStart) ||
        !Number.isInteger(root.bindingDeclarationCount) ||
        (!declarationAuthority &&
          (root.bindingDeclarationStart !== -1 ||
           root.bindingDeclarationCount !== 0)) ||
        (declarationAuthority &&
          (root.bindingDeclarationStart < 0 ||
           root.bindingDeclarationCount <= 0 ||
           root.bindingDeclarationStart >
             receipt.declarations.length ||
           root.bindingDeclarationCount >
             receipt.declarations.length -
               root.bindingDeclarationStart))) {
      throw new Error(`driver statement root row invalid: ${root.index}`);
    }
    if (declarationAuthority &&
        tokenNames[anchor.kind] !== "ParserValueTokenAssign") {
      throw new Error(
        `driver statement root declaration anchor invalid: ${root.index}`);
    }
    statementRootNodes.add(root.nodeIndex);
  }
  if (!Array.isArray(normalizedStatementFacts) ||
      receipt.counts.normalizedStatementFactCount !==
        normalizedStatementFacts.length ||
      !Array.isArray(normalizedScopeFacts) ||
      receipt.counts.normalizedScopeFactCount !==
        normalizedScopeFacts.length ||
      !Array.isArray(importEdges) ||
      receipt.counts.importEdgeCount !== importEdges.length) {
    throw new Error(
      "driver normalized/import fact count/array mismatch");
  }
  const normalizedStatementKinds = [
    "NormalizedExprIf",
    "NormalizedExprRange",
    "NormalizedExprComprehension",
    "NormalizedExprStrFormat",
    "NormalizedExprResultIntrinsic",
    "NormalizedExprCall",
    "NormalizedExprTry",
    "NormalizedExprDefaultInit",
    "NormalizedExprConstructor",
    "NormalizedExprReturn",
    "NormalizedExprAssign",
    "NormalizedExprIfStmt",
    "NormalizedExprElifStmt",
    "NormalizedExprElseStmt",
    "NormalizedExprForStmt",
    "NormalizedExprMatchStmt",
    "NormalizedExprCaseStmt",
    "NormalizedExprWhileStmt",
    "NormalizedExprDeferStmt",
    "NormalizedExprBreakStmt",
    "NormalizedExprContinueStmt",
  ];
  const normalizedStatementRoleKinds = [
    "ParserValueExprStatementInvalid",
    ...statementRootRoles,
  ];
  let statementLocalRow = 0;
  const normalizedExprRows = new Set<number>();
  for (const fact of normalizedStatementFacts) {
    const anchor = receipt.tokens[fact.anchorTokenIndex];
    const root = fact.rootNodeIndex < 0
      ? undefined : receipt.nodes[fact.rootNodeIndex];
    if (canonicalJson(Object.keys(fact).sort()) !== canonicalJson([
      "anchorTokenIndex",
      "column",
      "deferOwnerStatementOrdinal",
      "endColumn",
      "endLine",
      "identitySha256",
      "index",
      "kind",
      "kindText",
      "lexicalOrdinal",
      "lexicalScopeId",
      "line",
      "normalizedExprRow",
      "originNodeIndex",
      "producerSourceIndex",
      "rootNodeIndex",
      "sourceLocalRow",
      "sourceTextId",
      "spanEnd",
      "spanStart",
      "statementOrdinal",
      "statementRole",
      "suiteScopeId",
    ]) ||
        fact.index !== statementLocalRow ||
        fact.producerSourceIndex !== 0 ||
        fact.sourceLocalRow !== statementLocalRow ||
        !Number.isInteger(fact.normalizedExprRow) ||
        fact.normalizedExprRow < 0 ||
        normalizedExprRows.has(fact.normalizedExprRow) ||
        fact.sourceTextId !== 0 ||
        !Number.isInteger(fact.kind) ||
        fact.kind < 9 || fact.kind >= normalizedStatementKinds.length ||
        normalizedStatementKinds[fact.kind] !== fact.kindText ||
        anchor === undefined ||
        anchor.producerSourceIndex !== fact.producerSourceIndex ||
        anchor.sourceTextId !== fact.sourceTextId ||
        anchor.line !== fact.line ||
        anchor.column !== fact.column ||
        fact.spanStart < 0 || fact.spanEnd <= fact.spanStart ||
        fact.spanEnd > utf8ByteLength(source) ||
        !Number.isInteger(fact.endLine) ||
        !Number.isInteger(fact.endColumn) ||
        fact.endLine < fact.line || fact.endColumn <= 0 ||
        fact.rootNodeIndex < -1 ||
        fact.rootNodeIndex >= receipt.nodes.length ||
        (root !== undefined &&
          root.sourceTextId !== fact.sourceTextId) ||
        fact.originNodeIndex < -1 ||
        fact.originNodeIndex >= receipt.nodes.length ||
        !normalizedStatementRoleKinds.includes(fact.statementRole) ||
        !Number.isInteger(fact.lexicalScopeId) ||
        !Number.isInteger(fact.suiteScopeId) ||
        !Number.isInteger(fact.statementOrdinal) ||
        !Number.isInteger(fact.lexicalOrdinal) ||
        ((fact.kind >= 11 && fact.kind <= 20) &&
          (fact.statementOrdinal < 0 ||
           fact.lexicalOrdinal < 0)) ||
        ((fact.kind < 11 || fact.kind > 20) &&
          (fact.statementOrdinal !== -1 ||
           fact.lexicalOrdinal !== -1)) ||
        !Number.isInteger(fact.deferOwnerStatementOrdinal) ||
        fact.deferOwnerStatementOrdinal < -1 ||
        !hex64.test(fact.identitySha256) ||
        fact.identitySha256 !==
          driverNormalizedStatementFactIdentity(
            fact, source, receipt.tokens, receipt.nodes)) {
      throw new Error(
        `driver normalized statement fact invalid: ${fact.index}`);
    }
    normalizedExprRows.add(fact.normalizedExprRow);
    statementLocalRow += 1;
  }
  const normalizedScopeKinds = [
    "NormalizedScopeRoot",
    "NormalizedScopeIndentedSuite",
    "NormalizedScopeInlineSuite",
    "NormalizedScopeDeferSuite",
  ];
  let scopeLocalRow = 0;
  for (const fact of normalizedScopeFacts) {
    const anchor = receipt.tokens[fact.anchorTokenIndex];
    const parent = fact.parentScopeIndex < 0
      ? undefined : normalizedScopeFacts[fact.parentScopeIndex];
    if (canonicalJson(Object.keys(fact).sort()) !== canonicalJson([
      "anchorTokenIndex",
      "column",
      "endColumn",
      "endLine",
      "identitySha256",
      "indentColumn",
      "index",
      "kind",
      "kindText",
      "lexicalOrdinal",
      "line",
      "moduleRootAnchor",
      "ownerStatementOrdinal",
      "ownerStatementRow",
      "parentScopeId",
      "parentScopeIndex",
      "producerSourceIndex",
      "scopeId",
      "sourceLocalRow",
      "sourceScopeId",
      "sourceTextId",
    ]) ||
        fact.index !== scopeLocalRow ||
        fact.producerSourceIndex !== 0 ||
        fact.sourceLocalRow !== scopeLocalRow ||
        fact.sourceTextId !== 0 ||
        fact.scopeId < 0 ||
        fact.sourceScopeId < 0 ||
        fact.parentScopeId < -1 ||
        fact.parentScopeIndex < -1 ||
        fact.parentScopeIndex >= fact.index ||
        !Number.isInteger(fact.kind) ||
        normalizedScopeKinds[fact.kind] !== fact.kindText ||
        (fact.kind === 0) !==
          (fact.parentScopeIndex === -1 &&
           fact.parentScopeId === -1) ||
        (parent !== undefined &&
          (parent.producerSourceIndex !== fact.producerSourceIndex ||
           parent.scopeId !== fact.parentScopeId)) ||
        fact.ownerStatementOrdinal < -1 ||
        !Number.isInteger(fact.ownerStatementRow) ||
        fact.ownerStatementRow < -1 ||
        typeof fact.moduleRootAnchor !== "boolean" ||
        fact.lexicalOrdinal < 0 ||
        fact.indentColumn < 0 ||
        anchor === undefined ||
        anchor.producerSourceIndex !== fact.producerSourceIndex ||
        anchor.sourceTextId !== fact.sourceTextId ||
        anchor.line !== fact.line ||
        anchor.column !== fact.column ||
        fact.endLine < fact.line || fact.endColumn <= 0 ||
        !hex64.test(fact.identitySha256) ||
        fact.identitySha256 !== driverNormalizedScopeFactIdentity(
          fact, source, receipt.tokens)) {
      throw new Error(
        `driver normalized scope fact invalid: ${fact.index}`);
    }
    const owner = fact.ownerStatementRow < 0
      ? undefined
      : normalizedStatementFacts.find(
        (statement) =>
          statement.normalizedExprRow === fact.ownerStatementRow);
    if (fact.kind === 0) {
      if (!fact.moduleRootAnchor ||
          fact.ownerStatementOrdinal !== -1 ||
          fact.ownerStatementRow !== -1 ||
          anchor?.sourceLocalIndex !== 0) {
        throw new Error(
          `driver normalized scope module-root invalid: ${fact.index}`);
      }
    } else if (fact.moduleRootAnchor ||
               owner === undefined ||
               owner.producerSourceIndex !== fact.producerSourceIndex ||
               owner.statementOrdinal !== fact.ownerStatementOrdinal ||
               owner.anchorTokenIndex !== fact.anchorTokenIndex) {
      throw new Error(
        `driver normalized scope owner-row invalid: ${fact.index}`);
    }
    scopeLocalRow += 1;
  }
  const importItemRows = new Set<number>();
  for (const edge of importEdges) {
    const keyword = receipt.tokens[edge.keywordTokenIndex];
    const alias = edge.aliasTokenIndex < 0
      ? undefined : receipt.tokens[edge.aliasTokenIndex];
    const moduleTokens = edge.moduleTokenIndexes.map(
      (index) => receipt.tokens[index]);
    const expectedPath = moduleTokens.map((token) =>
      token === undefined ? "" : tokenTextRaw(source, token)).join("/");
    const firstSuffix =
      moduleTokens[edge.prefixTokenCount];
    const lastModule = moduleTokens[moduleTokens.length - 1];
    if (canonicalJson(Object.keys(edge).sort()) !== canonicalJson([
      "aliasTokenIndex",
      "identitySha256",
      "importDeclarationRow",
      "importItemRow",
      "index",
      "keywordTokenIndex",
      "moduleTokenIndexes",
      "ownerModulePath",
      "ownerProducerSourceIndex",
      "prefixTokenCount",
      "sourceDeclarationIdentitySha256",
      "spanEnd",
      "spanStart",
      "targetDeclarationIdentitySha256",
      "targetModulePath",
      "targetProducerSourceIndex",
      "targetProfileIndex",
      "targetSourcePath",
    ]) ||
        edge.index < 0 || importEdges[edge.index] !== edge ||
        edge.ownerProducerSourceIndex !== 0 ||
        edge.targetProducerSourceIndex < 0 ||
        edge.targetProducerSourceIndex !== edge.targetProfileIndex ||
        edge.importDeclarationRow < 0 ||
        edge.importItemRow < 0 ||
        importItemRows.has(edge.importItemRow) ||
        keyword === undefined ||
        tokenNames[keyword.kind] !== "ParserValueTokenImport" ||
        keyword.producerSourceIndex !== edge.ownerProducerSourceIndex ||
        alias !== undefined &&
          alias.producerSourceIndex !== edge.ownerProducerSourceIndex ||
        moduleTokens.length === 0 ||
        moduleTokens.some((token) =>
          token === undefined ||
          token.producerSourceIndex !== edge.ownerProducerSourceIndex ||
          !["ParserValueTokenIdentifier",
            "ParserValueTokenExportedIdentifier"].includes(
              tokenNames[token.kind] ?? "")) ||
        edge.prefixTokenCount < 0 ||
        edge.prefixTokenCount >= moduleTokens.length ||
        firstSuffix === undefined || lastModule === undefined ||
        edge.spanStart !== firstSuffix.start ||
        edge.spanEnd !== (alias?.end ?? lastModule.end) ||
        expectedPath !== edge.targetModulePath ||
        edge.ownerModulePath.length === 0 ||
        edge.targetSourcePath.length === 0 ||
        edge.targetSourcePath !== resolve(edge.targetSourcePath) ||
        edge.sourceDeclarationIdentitySha256 !==
          driverModuleDeclarationIdentity(
            edge.ownerProducerSourceIndex,
            receipt.sourcePath,
            edge.ownerModulePath) ||
        edge.targetDeclarationIdentitySha256 !==
          driverModuleDeclarationIdentity(
            edge.targetProducerSourceIndex,
            edge.targetSourcePath,
            edge.targetModulePath) ||
        !hex64.test(edge.identitySha256) ||
        edge.identitySha256 !== driverImportEdgeIdentity(
          edge, source, receipt.tokens)) {
      throw new Error(`driver import edge invalid: ${edge.index}`);
    }
    importItemRows.add(edge.importItemRow);
  }
  if (!Array.isArray(receipt.regions) ||
      receipt.counts.regionCount !== receipt.regions.length) {
    throw new Error("driver parser region count/array mismatch");
  }
  for (const region of receipt.regions) {
    const anchor = receipt.tokens[region.anchorTokenIndex];
    if (canonicalJson(Object.keys(region).sort()) !== canonicalJson([
      "anchorTokenIndex",
      "index",
      "kind",
      "sourceTextId",
      "spanEnd",
      "spanStart",
    ]) ||
        !Number.isInteger(region.index) ||
        region.index < 0 ||
        receipt.regions[region.index] !== region ||
        !/^ParserValueExprRegion[A-Za-z0-9_]+$/.test(region.kind) ||
        region.sourceTextId !== 0 ||
        !Number.isInteger(region.spanStart) ||
        !Number.isInteger(region.spanEnd) ||
        region.spanStart < 0 ||
        region.spanEnd <= region.spanStart ||
        region.spanEnd > utf8ByteLength(source) ||
        anchor === undefined ||
        anchor.sourceTextId !== region.sourceTextId ||
        anchor.start !== region.spanStart ||
        anchor.end > region.spanEnd) {
      throw new Error(`driver parser region row invalid: ${region.index}`);
    }
  }
  if (!Array.isArray(declarationLexicalScopes) ||
      receipt.counts.declarationLexicalScopeCount !==
        declarationLexicalScopes.length) {
    throw new Error(
      "driver declaration lexical scope receipt count/array mismatch");
  }
  const lexicalScopeKindByOrdinal = [
    "ParserDeclarationLexicalScopeInvalid",
    "ParserDeclarationLexicalScopeSource",
    "ParserDeclarationLexicalScopeType",
    "ParserDeclarationLexicalScopeFunction",
    "ParserDeclarationLexicalScopeBlock",
  ];
  let sourceLexicalScopeCount = 0;
  for (const scope of declarationLexicalScopes) {
    if (canonicalJson(Object.keys(scope).sort()) !== canonicalJson([
      "identitySha256",
      "index",
      "kind",
      "kindText",
      "ownerDeclarationIndex",
      "parentScopeIndex",
      "producerSourceIndex",
      "sourceLocalRow",
      "spanEnd",
      "spanStart",
    ]) ||
        !Number.isInteger(scope.index) ||
        scope.index < 0 ||
        scope.index >= declarationLexicalScopes.length ||
        declarationLexicalScopes[scope.index] !== scope ||
        scope.producerSourceIndex !== 0 ||
        scope.sourceLocalRow !== scope.index ||
        !Number.isInteger(scope.kind) ||
        scope.kind < 1 ||
        scope.kind >= lexicalScopeKindByOrdinal.length ||
        lexicalScopeKindByOrdinal[scope.kind] !== scope.kindText ||
        !Number.isInteger(scope.parentScopeIndex) ||
        scope.parentScopeIndex < -1 ||
        scope.parentScopeIndex >= scope.index ||
        !Number.isInteger(scope.ownerDeclarationIndex) ||
        scope.ownerDeclarationIndex < -1 ||
        !Number.isInteger(scope.spanStart) ||
        !Number.isInteger(scope.spanEnd) ||
        scope.spanStart < 0 ||
        scope.spanEnd < scope.spanStart ||
        (scope.spanEnd === scope.spanStart &&
          scope.kindText !== "ParserDeclarationLexicalScopeSource") ||
        scope.spanEnd > utf8ByteLength(source) ||
        !hex64.test(scope.identitySha256) ||
        scope.identitySha256 !==
          driverDeclarationLexicalScopeIdentity(scope)) {
      throw new Error(
        `driver declaration lexical scope receipt row invalid: ${scope.index}`);
    }
    if (scope.kindText === "ParserDeclarationLexicalScopeSource") {
      sourceLexicalScopeCount += 1;
      if (scope.index !== 0 ||
          scope.parentScopeIndex !== -1 ||
          scope.ownerDeclarationIndex !== -1 ||
          scope.spanStart !== 0 ||
          scope.spanEnd !== utf8ByteLength(source)) {
        throw new Error(
          `driver source lexical scope receipt invalid: ${scope.index}`);
      }
    } else {
      const parent = declarationLexicalScopes[scope.parentScopeIndex];
      if (parent === undefined ||
          parent.producerSourceIndex !== scope.producerSourceIndex ||
          parent.spanStart > scope.spanStart ||
          parent.spanEnd < scope.spanEnd ||
          ((scope.kindText === "ParserDeclarationLexicalScopeType" ||
            scope.kindText === "ParserDeclarationLexicalScopeFunction") &&
            scope.ownerDeclarationIndex < 0)) {
        throw new Error(
          `driver declaration lexical scope containment invalid: ${scope.index}`);
      }
    }
  }
  if (sourceLexicalScopeCount !== 1) {
    throw new Error("driver source lexical scope cardinality invalid");
  }
  if (!Array.isArray(typeSyntaxes) || !Array.isArray(typeSyntaxChildren) ||
      receipt.counts.typeSyntaxCount !== typeSyntaxes.length ||
      receipt.counts.typeSyntaxChildCount !== typeSyntaxChildren.length) {
    throw new Error("driver TypeSyntax receipt count/array mismatch");
  }
  const typeParents = new Array<number>(typeSyntaxes.length).fill(-1);
  const typeKindByOrdinal = [
    "ParserTypeSyntaxInvalid",
    "ParserTypeSyntaxNominal",
    "ParserTypeSyntaxQualified",
    "ParserTypeSyntaxBracketApply",
    "ParserTypeSyntaxSeq",
    "ParserTypeSyntaxFixedArray",
    "ParserTypeSyntaxTuple",
    "ParserTypeSyntaxFunction",
    "ParserTypeSyntaxVarBorrow",
    "ParserTypeSyntaxAlias",
    "ParserTypeSyntaxObject",
    "ParserTypeSyntaxRefObject",
    "ParserTypeSyntaxImplicitObject",
    "ParserTypeSyntaxEnum",
    "ParserTypeSyntaxVariant",
    "ParserTypeSyntaxAlgebraic",
    "ParserTypeSyntaxGrouped",
    "ParserTypeSyntaxOptional",
  ];
  const typeSyntaxDeclarationOwnerEdgeValid = (
    row: DriverTypeSyntax,
  ): boolean => {
    if (row.rootKind === 3) {
      return row.declarationOwnerIndex === row.index;
    }
    if (row.rootKind !== 4) {
      return row.declarationOwnerIndex === -1;
    }
    if (row.declarationOwnerIndex < 0 ||
        row.declarationOwnerIndex >= row.index) {
      return false;
    }
    const owner = typeSyntaxes[row.declarationOwnerIndex];
    if (owner === undefined ||
        owner.producerSourceIndex !== row.producerSourceIndex ||
        owner.sourceTextId !== row.sourceTextId) {
      return false;
    }
    const topLevelObjectOwner =
      owner.rootKind === 3 &&
      [
        "ParserTypeSyntaxImplicitObject",
        "ParserTypeSyntaxObject",
        "ParserTypeSyntaxRefObject",
      ].includes(owner.kindText);
    const nestedObjectOwner =
      owner.rootKind === 4 &&
      [
        "ParserTypeSyntaxObject",
        "ParserTypeSyntaxRefObject",
      ].includes(owner.kindText);
    return topLevelObjectOwner || nestedObjectOwner;
  };
  for (const row of typeSyntaxes) {
    if (canonicalJson(Object.keys(row).sort()) !== canonicalJson([
      "bracketArgCount",
      "bracketArgStart",
      "childCount",
      "childStart",
      "declarationOwnerIndex",
      "declarationOwnerTokenIndex",
      "enumVariantCount",
      "enumVariantStart",
      "fixedLength",
      "genericSymbolCount",
      "genericSymbolStart",
      "identitySha256",
      "index",
      "kind",
      "kindText",
      "nameTokenIndex",
      "ownerTokenIndex",
      "producerSourceIndex",
      "questionTokenIndex",
      "rootKind",
      "sourceLocalRow",
      "sourceTextId",
      "spanEnd",
      "spanStart",
    ])) {
      throw new Error(
        `driver TypeSyntax receipt schema invalid: ${row.index}`);
    }
    if (row.kindText === "ParserTypeSyntaxRef" ||
        row.kindText === "ParserTypeSyntaxRawPointer") {
      throw new Error(
        `driver forbidden public TypeSyntax kind: ${row.kindText}`);
    }
    if (row.index < 0 || row.index >= typeSyntaxes.length ||
        typeSyntaxes[row.index] !== row ||
        row.producerSourceIndex !== 0 ||
        row.sourceLocalRow !== row.index ||
        !Number.isInteger(row.kind) || row.kind <= 0 ||
        typeKindByOrdinal[row.kind] !== row.kindText ||
        row.spanStart < 0 || row.spanEnd <= row.spanStart ||
        row.spanEnd > utf8ByteLength(source) ||
        row.ownerTokenIndex < 0 || row.ownerTokenIndex >= receipt.tokens.length ||
        row.declarationOwnerTokenIndex < -1 ||
        row.declarationOwnerTokenIndex >= receipt.tokens.length ||
        row.declarationOwnerIndex < -1 ||
        row.declarationOwnerIndex >= typeSyntaxes.length ||
        !typeSyntaxDeclarationOwnerEdgeValid(row) ||
        row.childStart < 0 || row.childCount < 0 ||
        row.childStart + row.childCount > typeSyntaxChildren.length ||
        row.genericSymbolStart < -1 || row.genericSymbolCount < 0 ||
        (row.genericSymbolCount === 0) !== (row.genericSymbolStart === -1) ||
        row.bracketArgStart < 0 || row.bracketArgCount < 0 ||
        row.enumVariantStart < -1 || row.enumVariantCount < 0 ||
        (row.enumVariantCount === 0) !== (row.enumVariantStart === -1) ||
        row.nameTokenIndex < -1 || row.nameTokenIndex >= receipt.tokens.length ||
        !Number.isInteger(row.rootKind) ||
        row.rootKind < 0 || row.rootKind > 7 ||
        !Number.isInteger(row.questionTokenIndex) ||
        row.questionTokenIndex < -1 ||
        row.questionTokenIndex >= receipt.tokens.length ||
        (row.kindText === "ParserTypeSyntaxOptional") !==
          (row.questionTokenIndex >= 0) ||
        !hex64.test(row.identitySha256) ||
        row.identitySha256 !==
          parserTypeSyntaxIdentity(row, typeSyntaxChildren)) {
      throw new Error(`driver TypeSyntax receipt row invalid: ${row.index}`);
    }
    const owner = receipt.tokens[row.ownerTokenIndex]!;
    if (owner.sourceTextId !== row.sourceTextId ||
        owner.producerSourceIndex !== row.producerSourceIndex) {
      throw new Error(`driver TypeSyntax owner token invalid: ${row.index}`);
    }
    if (row.declarationOwnerTokenIndex >= 0) {
      const declarationOwner =
        receipt.tokens[row.declarationOwnerTokenIndex]!;
      if (declarationOwner.sourceTextId !== row.sourceTextId ||
          declarationOwner.producerSourceIndex !==
            row.producerSourceIndex) {
        throw new Error(
          `driver TypeSyntax declaration owner token invalid: ${row.index}`);
      }
    }
    if ((row.rootKind === 3 || row.rootKind === 4) &&
        row.declarationOwnerTokenIndex < 0) {
      throw new Error(
        `driver TypeSyntax declaration owner token missing: ${row.index}`);
    }
    if (row.rootKind === 3 &&
        row.declarationOwnerTokenIndex !== row.ownerTokenIndex) {
      throw new Error(
        `driver TypeSyntax declaration root token invalid: ${row.index}`);
    }
    if (row.rootKind === 4) {
      const declarationOwner =
        typeSyntaxes[row.declarationOwnerIndex]!;
      if (row.declarationOwnerTokenIndex !==
          declarationOwner.declarationOwnerTokenIndex) {
        throw new Error(
          `driver TypeSyntax nested declaration token drift: ${row.index}`);
      }
    }
    if (row.nameTokenIndex >= 0) {
      const name = receipt.tokens[row.nameTokenIndex]!;
      if (name.sourceTextId !== row.sourceTextId ||
          name.start < row.spanStart || name.end > row.spanEnd) {
        throw new Error(`driver TypeSyntax name token invalid: ${row.index}`);
      }
    }
    if ((row.kindText === "ParserTypeSyntaxFixedArray"
          ? row.fixedLength < 1
          : row.fixedLength !== -1) ||
        (row.kindText !== "ParserTypeSyntaxEnum" &&
          (row.enumVariantStart !== -1 ||
           row.enumVariantCount !== 0))) {
      throw new Error(
        `driver TypeSyntax kind-specific scalar invalid: ${row.index}`);
    }
    const orderedChildren = typeSyntaxChildren
      .slice(row.childStart, row.childStart + row.childCount)
      .map((index) => typeSyntaxes[index]!);
    for (let offset = 1; offset < orderedChildren.length; offset += 1) {
      if (orderedChildren[offset - 1]!.spanEnd >
          orderedChildren[offset]!.spanStart) {
        throw new Error(
          `driver TypeSyntax ordered child span invalid: ${row.index}/${offset}`);
      }
    }
    if (row.kindText === "ParserTypeSyntaxNominal") {
      const name = receipt.tokens[row.nameTokenIndex];
      if (row.childCount !== 0 ||
          name === undefined ||
          name.producerSourceIndex !== row.producerSourceIndex ||
          name.start !== row.spanStart ||
          name.end !== row.spanEnd) {
        throw new Error(
          `driver Nominal TypeSyntax authority invalid: ${row.index}`);
      }
    }
    if (row.kindText === "ParserTypeSyntaxQualified") {
      const children = typeSyntaxChildren
        .slice(row.childStart, row.childStart + row.childCount)
        .map((index) => typeSyntaxes[index]!);
      if (children.length < 2 ||
          row.nameTokenIndex !==
            children[children.length - 1]!.nameTokenIndex ||
          children[0]!.spanStart !== row.spanStart ||
          children[children.length - 1]!.spanEnd !== row.spanEnd ||
          children.some((child) =>
            child.kindText !== "ParserTypeSyntaxNominal" ||
            child.ownerTokenIndex !== row.ownerTokenIndex ||
            child.rootKind !== 0 ||
            child.declarationOwnerIndex !== -1)) {
        throw new Error(
          `driver Qualified TypeSyntax child authority invalid: ${row.index}`);
      }
      for (let offset = 1; offset < children.length; offset += 1) {
        const left = children[offset - 1]!;
        const right = children[offset]!;
        const between = receipt.tokens.filter((token) =>
          token.producerSourceIndex === row.producerSourceIndex &&
          token.sourceTextId === row.sourceTextId &&
          token.start >= left.spanEnd &&
          token.end <= right.spanStart);
        if (between.length !== 1 ||
            tokenNames[between[0]!.kind] !==
              "ParserValueTokenDot") {
          throw new Error(
            `driver Qualified TypeSyntax dot edge invalid: ${row.index}/${offset}`);
        }
      }
    }
    if (row.kindText === "ParserTypeSyntaxAlias") {
      const childIndex = typeSyntaxChildren[row.childStart];
      const child = childIndex === undefined
        ? undefined
        : typeSyntaxes[childIndex];
      if (row.childCount !== 1 ||
          child === undefined ||
          child.spanStart !== row.spanStart ||
          child.spanEnd !== row.spanEnd ||
          child.ownerTokenIndex !== row.ownerTokenIndex ||
          child.rootKind !== 0 ||
          child.declarationOwnerIndex !== -1) {
        throw new Error(
          `driver Alias TypeSyntax authority invalid: ${row.index}`);
      }
    }
    if (row.kindText === "ParserTypeSyntaxVarBorrow") {
      const marker = receipt.tokens[row.nameTokenIndex];
      const childIndex = typeSyntaxChildren[row.childStart];
      const child = childIndex === undefined
        ? undefined
        : typeSyntaxes[childIndex];
      const firstChildToken = marker === undefined
        ? undefined
        : receipt.tokens[marker.index + 1];
      if (row.childCount !== 1 ||
          marker === undefined ||
          tokenNames[marker.kind] !== "ParserValueTokenVar" ||
          marker.start !== row.spanStart ||
          child === undefined ||
          firstChildToken === undefined ||
          child.spanStart !== firstChildToken.start ||
          child.spanEnd !== row.spanEnd ||
          child.ownerTokenIndex !== row.ownerTokenIndex ||
          child.rootKind !== 0 ||
          child.declarationOwnerIndex !== -1) {
        throw new Error(
          `driver VarBorrow TypeSyntax authority invalid: ${row.index}`);
      }
    }
    if (row.kindText === "ParserTypeSyntaxSeq") {
      const childIndex = typeSyntaxChildren[row.childStart];
      const child = childIndex === undefined
        ? undefined
        : typeSyntaxes[childIndex];
      const open = child === undefined
        ? undefined
        : receipt.tokens.find((token) =>
          token.producerSourceIndex === row.producerSourceIndex &&
          token.sourceTextId === row.sourceTextId &&
          token.start >= child.spanEnd &&
          tokenNames[token.kind] === "ParserValueTokenLeftBracket");
      const close = open === undefined
        ? undefined
        : receipt.tokens[open.index + 1];
      if (row.childCount !== 1 ||
          child === undefined ||
          child.spanStart !== row.spanStart ||
          child.ownerTokenIndex !== row.ownerTokenIndex ||
          open === undefined ||
          open.start < child.spanEnd ||
          close === undefined ||
          tokenNames[close.kind] !== "ParserValueTokenRightBracket" ||
          close.end !== row.spanEnd) {
        throw new Error(
          `driver Seq TypeSyntax postfix authority invalid: ${row.index}`);
      }
    }
    if (row.kindText === "ParserTypeSyntaxBracketApply" ||
        row.kindText === "ParserTypeSyntaxFixedArray") {
      const baseIndex = typeSyntaxChildren[row.childStart];
      const base = baseIndex === undefined
        ? undefined
        : typeSyntaxes[baseIndex];
      const firstArg =
        typeSyntaxBracketArgs[row.bracketArgStart];
      const open = firstArg === undefined
        ? undefined
        : receipt.tokens[firstArg.tokenStart - 1];
      const finalArg = row.bracketArgCount <= 0
        ? undefined
        : typeSyntaxBracketArgs[
          row.bracketArgStart + row.bracketArgCount - 1];
      const close = finalArg === undefined
        ? undefined
        : receipt.tokens[
          finalArg.tokenStart + finalArg.tokenCount];
      if (base === undefined ||
          base.spanStart !== row.spanStart ||
          base.ownerTokenIndex !== row.ownerTokenIndex ||
          open === undefined ||
          tokenNames[open.kind] !==
            "ParserValueTokenLeftBracket" ||
          open.start < base.spanEnd ||
          close === undefined ||
          tokenNames[close.kind] !==
            "ParserValueTokenRightBracket" ||
          close.end !== row.spanEnd) {
        throw new Error(
          `driver bracket TypeSyntax base/token authority invalid: ${row.index}`);
      }
    }
    if (row.kindText === "ParserTypeSyntaxTuple" ||
        row.kindText === "ParserTypeSyntaxFunction") {
      const marker = receipt.tokens[row.nameTokenIndex];
      const tuple = row.kindText === "ParserTypeSyntaxTuple";
      const openKind = tuple
        ? "ParserValueTokenLeftBracket"
        : "ParserValueTokenLeftParen";
      const closeKind = tuple
        ? "ParserValueTokenRightBracket"
        : "ParserValueTokenRightParen";
      const open = marker === undefined
        ? undefined
        : receipt.tokens[marker.index + 1];
      const closeIndex = open === undefined
        ? -1
        : matchingTokenIndex(
          receipt.tokens,
          tokenNames,
          open.index,
          openKind,
          closeKind,
        );
      const close = receipt.tokens[closeIndex];
      const children = typeSyntaxChildren
        .slice(row.childStart, row.childStart + row.childCount)
        .map((index) => typeSyntaxes[index]!);
      const listChildren = tuple
        ? children
        : children.filter((child) =>
          close === undefined || child.spanStart < close.start);
      const returnChildren = tuple
        ? []
        : children.filter((child) =>
          close !== undefined && child.spanStart > close.end);
      const returnFirstToken = returnChildren.length !== 1
        ? undefined
        : receipt.tokens.find((token) =>
          token.producerSourceIndex === row.producerSourceIndex &&
          token.sourceTextId === row.sourceTextId &&
          token.start === returnChildren[0]!.spanStart);
      const returnSeparator = returnFirstToken === undefined
        ? undefined
        : receipt.tokens[returnFirstToken.index - 1];
      const separatorCount = open === undefined || close === undefined
        ? -1
        : topLevelSeparatorCount(
          receipt.tokens,
          tokenNames,
          open.index + 1,
          close.index,
        );
      const childOwnerTokenAccepted = (child: DriverTypeSyntax):
        boolean =>
        child.ownerTokenIndex === row.ownerTokenIndex ||
        (receipt.tokens[child.ownerTokenIndex] !== undefined &&
         tokenNames[
           receipt.tokens[child.ownerTokenIndex]!.kind
         ] === "ParserValueTokenIdentifier");
      if (tuple) {
        assertCurrentTupleTypeSyntaxSurface({
          row: row.index,
          spanStart: row.spanStart,
          spanEnd: row.spanEnd,
          markerTokenIndex: marker?.index ?? -1,
          markerKindText: marker === undefined
            ? null : tokenNames[marker.kind] ?? null,
          markerStart: marker?.start ?? -1,
          openTokenIndex: open?.index ?? -1,
          openKindText: open === undefined
            ? null : tokenNames[open.kind] ?? null,
          openEnd: open?.end ?? -1,
          closeTokenIndex: close?.index ?? -1,
          closeKindText: close === undefined
            ? null : tokenNames[close.kind] ?? null,
          closeStart: close?.start ?? -1,
          closeEnd: close?.end ?? -1,
          separatorCount,
          children: listChildren.map((child) => ({
            spanStart: child.spanStart,
            spanEnd: child.spanEnd,
            ownerTokenAccepted: childOwnerTokenAccepted(child),
          })),
        });
      } else if (marker === undefined ||
          tokenNames[marker.kind] !== "ParserValueTokenFn" ||
          marker.start !== row.spanStart ||
          open === undefined ||
          tokenNames[open.kind] !== openKind ||
          close === undefined ||
          separatorCount !== Math.max(0, listChildren.length - 1) ||
          returnChildren.length > 1 ||
          children.some((child) => !childOwnerTokenAccepted(child)) ||
          (returnChildren.length === 0 &&
            close.end !== row.spanEnd) ||
          (returnChildren.length === 1 &&
            (returnChildren[0]!.spanEnd !== row.spanEnd ||
             returnSeparator === undefined ||
             returnSeparator.index !== close.index + 1 ||
             tokenNames[returnSeparator.kind] !==
               "ParserValueTokenColon"))) {
        throw new Error(
          `driver Function TypeSyntax authority invalid: ${row.index}`);
      }
    }
    if (row.kindText === "ParserTypeSyntaxGrouped") {
      const childIndex = typeSyntaxChildren[row.childStart];
      const child = childIndex === undefined
        ? undefined
        : typeSyntaxes[childIndex];
      const open = receipt.tokens[row.nameTokenIndex];
      const close = receipt.tokens.find((token) =>
        token.sourceTextId === row.sourceTextId &&
        token.start >= (child?.spanEnd ?? row.spanStart) &&
        token.end === row.spanEnd &&
        tokenNames[token.kind] === "ParserValueTokenRightParen");
      if (row.childCount !== 1 ||
          child === undefined ||
          open === undefined ||
          close === undefined ||
          tokenNames[open.kind] !== "ParserValueTokenLeftParen" ||
          open.start !== row.spanStart ||
          open.end > child.spanStart ||
          child.spanEnd > close.start ||
          child.producerSourceIndex !== row.producerSourceIndex ||
          child.sourceTextId !== row.sourceTextId ||
          child.ownerTokenIndex !== row.ownerTokenIndex ||
          child.rootKind !== 0 ||
          child.declarationOwnerIndex !== -1) {
        throw new Error(
          `driver Grouped TypeSyntax token authority invalid: ${row.index}`);
      }
    }
    if (row.kindText === "ParserTypeSyntaxOptional") {
      const childIndex = typeSyntaxChildren[row.childStart];
      const child = childIndex === undefined
        ? undefined
        : typeSyntaxes[childIndex];
      const question = receipt.tokens[row.questionTokenIndex];
      const previous = receipt.tokens[row.questionTokenIndex - 1];
      if (row.childCount !== 1 ||
          child === undefined ||
          question === undefined ||
          previous === undefined ||
          tokenNames[question.kind] !== "ParserValueTokenQuestion" ||
          tokenTextRaw(source, question) !== "?" ||
          question.sourceTextId !== row.sourceTextId ||
          (question.producerSourceIndex !== undefined &&
            question.producerSourceIndex !== row.producerSourceIndex) ||
          previous.sourceTextId !== row.sourceTextId ||
          (previous.producerSourceIndex !== undefined &&
            previous.producerSourceIndex !== row.producerSourceIndex) ||
          previous.end > question.start ||
          child.producerSourceIndex !== row.producerSourceIndex ||
          child.sourceTextId !== row.sourceTextId ||
          child.ownerTokenIndex !== row.ownerTokenIndex ||
          child.spanStart !== row.spanStart ||
          child.spanEnd !== previous.end ||
          row.spanEnd !== question.end ||
          child.rootKind !== 0 ||
          child.declarationOwnerIndex !== -1) {
        throw new Error(
          `driver Optional TypeSyntax token authority invalid: ${row.index}`);
      }
    }
    const objectType =
      row.kindText === "ParserTypeSyntaxObject" ||
      row.kindText === "ParserTypeSyntaxRefObject";
    const implicitObject =
      row.kindText === "ParserTypeSyntaxImplicitObject";
    if (implicitObject) {
      const marker = receipt.tokens[row.nameTokenIndex];
      if (row.childCount !== 0 ||
          marker === undefined ||
          tokenNames[marker.kind] !== "ParserValueTokenIdentifier" ||
          marker.sourceTextId !== row.sourceTextId ||
          marker.producerSourceIndex !== row.producerSourceIndex ||
          marker.start !== row.spanStart ||
          marker.end !== row.spanEnd) {
        throw new Error(
          `driver implicit object TypeSyntax authority invalid: ${row.index}`);
      }
    }
    if (objectType) {
      if (row.childCount > 1 || row.nameTokenIndex < 0) {
        throw new Error(
          `driver object TypeSyntax arity invalid: ${row.index}`);
      }
      const marker = receipt.tokens[row.nameTokenIndex]!;
      const markerKind = tokenNames[marker.kind];
      const objectToken = receipt.tokens[row.nameTokenIndex + 1];
      if (marker.sourceTextId !== row.sourceTextId ||
          marker.producerSourceIndex !== row.producerSourceIndex ||
          marker.start !== row.spanStart ||
          (row.kindText === "ParserTypeSyntaxObject" &&
           markerKind !== "ParserValueTokenObject" &&
           markerKind !== "ParserValueTokenOf") ||
          (row.kindText === "ParserTypeSyntaxRefObject" &&
           markerKind !== "ParserValueTokenRef")) {
        throw new Error(
          `driver object TypeSyntax marker invalid: ${row.index}`);
      }
      if (row.childCount === 0) {
        const bareObject =
          row.kindText === "ParserTypeSyntaxObject" &&
          markerKind === "ParserValueTokenObject" &&
          row.spanEnd === marker.end;
        const explicitRefObject =
          row.kindText === "ParserTypeSyntaxRefObject" &&
          objectToken !== undefined &&
          tokenNames[objectToken.kind] === "ParserValueTokenObject" &&
          objectToken.sourceTextId === row.sourceTextId &&
          objectToken.producerSourceIndex === row.producerSourceIndex &&
          marker.end <= objectToken.start &&
          row.spanEnd === objectToken.end;
        if (!bareObject && !explicitRefObject) {
          throw new Error(
            `driver empty object TypeSyntax span invalid: ${row.index}`);
        }
      } else {
        const childIndex = typeSyntaxChildren[row.childStart];
        const child = childIndex === undefined
          ? undefined
          : typeSyntaxes[childIndex];
        let baseTokenIndex = row.nameTokenIndex + 1;
        if (row.kindText === "ParserTypeSyntaxRefObject") {
          baseTokenIndex = row.nameTokenIndex + 3;
        } else if (markerKind === "ParserValueTokenObject") {
          baseTokenIndex = row.nameTokenIndex + 2;
        }
        const ofTokenIndex = baseTokenIndex - 1;
        const ofToken = receipt.tokens[ofTokenIndex];
        const baseToken = receipt.tokens[baseTokenIndex];
        if (child === undefined || child.index >= row.index ||
            ofToken === undefined || baseToken === undefined ||
            tokenNames[ofToken.kind] !== "ParserValueTokenOf" ||
            ofToken.sourceTextId !== row.sourceTextId ||
            ofToken.producerSourceIndex !== row.producerSourceIndex ||
            baseToken.sourceTextId !== row.sourceTextId ||
            baseToken.producerSourceIndex !== row.producerSourceIndex ||
            (row.kindText === "ParserTypeSyntaxRefObject" &&
             (objectToken === undefined ||
              tokenNames[objectToken.kind] !==
                "ParserValueTokenObject" ||
              objectToken.sourceTextId !== row.sourceTextId ||
              objectToken.producerSourceIndex !==
                row.producerSourceIndex ||
              marker.end > objectToken.start ||
              objectToken.end > ofToken.start)) ||
            ofToken.end > child.spanStart ||
            child.producerSourceIndex !== row.producerSourceIndex ||
            child.sourceTextId !== row.sourceTextId ||
            child.ownerTokenIndex !== row.ownerTokenIndex ||
            child.rootKind !== 0 ||
            child.declarationOwnerIndex !== -1 ||
            child.spanStart !== baseToken.start ||
            child.spanEnd !== row.spanEnd) {
          throw new Error(
            `driver object TypeSyntax inheritance edge invalid: ${row.index}`);
        }
      }
    }
    for (let offset = 0; offset < row.childCount; offset += 1) {
      const child = typeSyntaxChildren[row.childStart + offset]!;
      if (child < 0 || child >= row.index ||
          (typeParents[child] ?? -1) >= 0) {
        throw new Error(`driver TypeSyntax child CSR invalid: ${row.index}/${offset}`);
      }
      const childRow = typeSyntaxes[child]!;
      if (childRow.sourceTextId !== row.sourceTextId ||
          childRow.spanStart < row.spanStart || childRow.spanEnd > row.spanEnd) {
        throw new Error(`driver TypeSyntax child span invalid: ${row.index}/${offset}`);
      }
      typeParents[child] = row.index;
    }
    if (row.kindText === "ParserTypeSyntaxAlgebraic") {
      if (row.childCount < 1) {
        throw new Error(`driver Algebraic TypeSyntax child missing: ${row.index}`);
      }
      const children = typeSyntaxChildren
        .slice(row.childStart, row.childStart + row.childCount)
        .map((child) => typeSyntaxes[child]!);
      if (children[0]!.spanStart !== row.spanStart ||
          children[children.length - 1]!.spanEnd !== row.spanEnd) {
        throw new Error(
          `driver Algebraic TypeSyntax span invalid: ${row.index}`);
      }
      for (let offset = 0; offset < row.childCount; offset += 1) {
        const child = typeSyntaxChildren[row.childStart + offset]!;
        if (typeSyntaxes[child]!.kindText !== "ParserTypeSyntaxVariant") {
          throw new Error(`driver Algebraic TypeSyntax child kind invalid: ${row.index}/${offset}`);
        }
        if (offset > 0) {
          const left = children[offset - 1]!;
          const right = children[offset]!;
          const pipes = receipt.tokens.filter((token) =>
            token.start >= left.spanEnd && token.end <= right.spanStart &&
            utf8Slice(source, token.start, token.end) === "|");
          if (pipes.length !== 1) {
            throw new Error(`driver Algebraic TypeSyntax pipe invalid: ${row.index}/${offset}`);
          }
        }
      }
    }
    if (row.kindText === "ParserTypeSyntaxVariant") {
      if (row.nameTokenIndex < 0 ||
          tokenNames[receipt.tokens[row.nameTokenIndex]!.kind] !==
            "ParserValueTokenIdentifier") {
        throw new Error(`driver Variant TypeSyntax name invalid: ${row.index}`);
      }
      const name = receipt.tokens[row.nameTokenIndex]!;
      if (name.start !== row.spanStart) {
        throw new Error(`driver Variant TypeSyntax name span invalid: ${row.index}`);
      }
      const open = receipt.tokens[row.nameTokenIndex + 1];
      const closeIndex = open === undefined
        ? -1
        : matchingTokenIndex(
          receipt.tokens,
          tokenNames,
          open.index,
          "ParserValueTokenLeftParen",
          "ParserValueTokenRightParen",
        );
      const close = receipt.tokens[closeIndex];
      if (row.childCount === 0) {
        const bare = row.spanEnd === name.end;
        const emptyPayload =
          open !== undefined &&
          tokenNames[open.kind] ===
            "ParserValueTokenLeftParen" &&
          close !== undefined &&
          close.index === open.index + 1 &&
          close.end === row.spanEnd;
        if (!bare && !emptyPayload) {
          throw new Error(
            `driver empty Variant TypeSyntax payload invalid: ${row.index}`);
        }
      } else if (open === undefined ||
          tokenNames[open.kind] !==
            "ParserValueTokenLeftParen" ||
          close === undefined ||
          close.end !== row.spanEnd ||
          topLevelSeparatorCount(
            receipt.tokens,
            tokenNames,
            open.index + 1,
            close.index,
          ) !== row.childCount - 1) {
        throw new Error(
          `driver Variant TypeSyntax payload token invalid: ${row.index}`);
      }
      for (let offset = 0; offset < row.childCount; offset += 1) {
        const child = typeSyntaxes[
          typeSyntaxChildren[row.childStart + offset]!
        ]!;
        const fieldName = receipt.tokens[child.ownerTokenIndex]!;
        const colon = receipt.tokens[child.ownerTokenIndex + 1];
        if (tokenNames[fieldName.kind] !== "ParserValueTokenIdentifier" ||
            fieldName.start <= name.start ||
            fieldName.end > child.spanStart ||
            colon === undefined ||
            tokenNames[colon.kind] !== "ParserValueTokenColon" ||
            colon.end > child.spanStart ||
            child.declarationOwnerIndex !== row.declarationOwnerIndex) {
          throw new Error(`driver Variant TypeSyntax field join invalid: ${row.index}/${offset}`);
        }
      }
    }
  }
  if (!Array.isArray(typeEnumVariants) ||
      receipt.counts.typeEnumVariantCount !==
        typeEnumVariants.length) {
    throw new Error("driver enum variant receipt count/array mismatch");
  }
  const enumPayloadSeen =
    new Array<boolean>(typeSyntaxes.length).fill(false);
  let enumVariantCursor = 0;
  for (const owner of typeSyntaxes) {
    const enumRoot =
      owner.kindText === "ParserTypeSyntaxEnum" &&
      owner.rootKind === 3 &&
      owner.declarationOwnerIndex === owner.index;
    if ((owner.enumVariantCount === 0) !==
          (owner.enumVariantStart === -1) ||
        (!enumRoot && owner.enumVariantCount !== 0) ||
        (owner.enumVariantCount > 0 &&
          (owner.enumVariantStart !== enumVariantCursor ||
           owner.enumVariantStart + owner.enumVariantCount >
             typeEnumVariants.length))) {
      throw new Error(
        `driver enum variant owner CSR invalid: ${owner.index}`);
    }
    if (owner.enumVariantCount === 0) continue;
    const names = new Set<string>();
    let previousNameTokenIndex = -1;
    for (let ordinal = 0;
      ordinal < owner.enumVariantCount;
      ordinal += 1) {
      const row =
        typeEnumVariants[owner.enumVariantStart + ordinal]!;
      const ownerToken =
        receipt.tokens[row.declarationOwnerTokenIndex];
      const nameToken = receipt.tokens[row.nameTokenIndex];
      const payload = row.payloadTypeSyntaxIndex < 0
        ? undefined
        : typeSyntaxes[row.payloadTypeSyntaxIndex];
      const name = nameToken === undefined
        ? ""
        : tokenTextRaw(source, nameToken);
      if (canonicalJson(Object.keys(row).sort()) !== canonicalJson([
        "declarationOwnerIndex",
        "declarationOwnerTokenIndex",
        "identitySha256",
        "index",
        "nameTokenIndex",
        "ordinal",
        "payloadTypeSyntaxIndex",
        "producerSourceIndex",
      ]) ||
          row.index !== owner.enumVariantStart + ordinal ||
          typeEnumVariants[row.index] !== row ||
          row.producerSourceIndex !== owner.producerSourceIndex ||
          row.declarationOwnerIndex !== owner.index ||
          row.declarationOwnerTokenIndex !==
            owner.declarationOwnerTokenIndex ||
          ownerToken === undefined ||
          ownerToken.producerSourceIndex !== row.producerSourceIndex ||
          ownerToken.sourceTextId !== owner.sourceTextId ||
          nameToken === undefined ||
          nameToken.producerSourceIndex !== row.producerSourceIndex ||
          nameToken.sourceTextId !== owner.sourceTextId ||
          tokenNames[nameToken.kind] !==
            "ParserValueTokenIdentifier" ||
          row.nameTokenIndex <= previousNameTokenIndex ||
          row.ordinal !== ordinal ||
          row.payloadTypeSyntaxIndex < -1 ||
          row.payloadTypeSyntaxIndex >= typeSyntaxes.length ||
          names.has(name) ||
          (payload !== undefined &&
            (enumPayloadSeen[payload.index] ||
             typeParents[payload.index] !== -1 ||
             payload.producerSourceIndex !==
               owner.producerSourceIndex ||
             payload.sourceTextId !== owner.sourceTextId ||
             payload.rootKind !== 0 ||
             payload.declarationOwnerIndex !== -1 ||
             payload.ownerTokenIndex !== row.nameTokenIndex ||
             payload.spanStart < nameToken.end)) ||
          !hex64.test(row.identitySha256) ||
          row.identitySha256 !== parserTypeEnumVariantIdentity(
            row,
            source,
            receipt.tokens,
            typeSyntaxes,
          )) {
        throw new Error(
          `driver enum variant receipt row invalid: ${row.index}`);
      }
      names.add(name);
      previousNameTokenIndex = row.nameTokenIndex;
      if (payload !== undefined) enumPayloadSeen[payload.index] = true;
    }
    enumVariantCursor += owner.enumVariantCount;
  }
  if (enumVariantCursor !== typeEnumVariants.length) {
    throw new Error("driver enum variant receipt coverage invalid");
  }
  if (!Array.isArray(typeSyntaxBracketArgs) ||
      !Array.isArray(typeConstExprs) ||
      receipt.counts.typeSyntaxBracketArgCount !==
        typeSyntaxBracketArgs.length ||
      !Number.isInteger(receipt.counts.typeConstExprCount) ||
      receipt.counts.typeConstExprCount !== typeConstExprs.length) {
    throw new Error(
      "driver TypeSyntax bracket argument receipt count/array mismatch");
  }
  const constKindByOrdinal = [
    "ParserTypeConstExprInvalid",
    "ParserTypeConstExprInteger",
    "ParserTypeConstExprUnaryPlus",
    "ParserTypeConstExprUnaryMinus",
    "ParserTypeConstExprAdd",
    "ParserTypeConstExprSubtract",
    "ParserTypeConstExprMultiply",
    "ParserTypeConstExprDivide",
    "ParserTypeConstExprModulo",
  ];
  const constUseCounts = new Array<number>(typeConstExprs.length).fill(0);
  const expectedConstRows: Array<{
    readonly kind: number;
    readonly tokenIndex: number;
    readonly leftChildIndex: number;
    readonly rightChildIndex: number;
    readonly integerValue: number;
  }> = [];
  for (const row of typeConstExprs) {
    const token = receipt.tokens[row.tokenIndex];
    const integerNode = row.kind === 1;
    const unaryNode = row.kind === 2 || row.kind === 3;
    const binaryNode = row.kind >= 4 && row.kind <= 8;
    if (row.index < 0 || row.index >= typeConstExprs.length ||
        typeConstExprs[row.index] !== row ||
        constKindByOrdinal[row.kind] === undefined || row.kind <= 0 ||
        row.producerSourceIndex < 0 ||
        token === undefined ||
        row.sourceTextId !== token.sourceTextId ||
        (token.producerSourceIndex !== undefined &&
          token.producerSourceIndex !== row.producerSourceIndex) ||
        !Number.isInteger(row.integerValue) ||
        !hex64.test(row.identitySha256) ||
        row.identitySha256 !== parserTypeConstExprIdentity(row) ||
        (integerNode &&
          (row.leftChildIndex !== -1 ||
            row.rightChildIndex !== -1 ||
            tokenNames[token.kind] !== "ParserValueTokenInteger")) ||
        (unaryNode &&
          (row.leftChildIndex < 0 ||
            row.leftChildIndex >= row.index ||
            row.rightChildIndex !== -1 ||
            row.integerValue !== 0 ||
            tokenTextRaw(source, token) !==
              (row.kind === 2 ? "+" : "-"))) ||
        (binaryNode &&
          (row.leftChildIndex < 0 ||
            row.leftChildIndex >= row.index ||
            row.rightChildIndex < 0 ||
            row.rightChildIndex >= row.index ||
            row.integerValue !== 0 ||
            tokenTextRaw(source, token) !==
              ["", "", "", "", "+", "-", "*", "/", "%"][row.kind]))) {
      throw new Error(
        `driver TypeSyntax const expression row invalid: ${row.index}`);
    }
    for (const childIndex of [
      row.leftChildIndex, row.rightChildIndex,
    ]) {
      if (childIndex < 0) continue;
      const child = typeConstExprs[childIndex]!;
      if (child.producerSourceIndex !== row.producerSourceIndex ||
          child.sourceTextId !== row.sourceTextId) {
        throw new Error(
          `driver TypeSyntax const expression child authority invalid: ${row.index}`);
      }
      constUseCounts[childIndex] =
        (constUseCounts[childIndex] ?? 0) + 1;
    }
  }
  let bracketArgCursor = 0;
  const bracketTypeSeen = new Array<boolean>(typeSyntaxes.length).fill(false);
  for (const owner of typeSyntaxes) {
    if (owner.bracketArgStart !== bracketArgCursor ||
        owner.bracketArgStart + owner.bracketArgCount >
          typeSyntaxBracketArgs.length) {
      throw new Error(
        `driver TypeSyntax bracket argument CSR invalid: ${owner.index}`);
    }
    const bracketKind = owner.kindText === "ParserTypeSyntaxBracketApply" ||
      owner.kindText === "ParserTypeSyntaxFixedArray";
    if (bracketKind !== (owner.bracketArgCount > 0) ||
        (owner.kindText === "ParserTypeSyntaxFixedArray" &&
          owner.bracketArgCount !== 1)) {
      throw new Error(
        `driver TypeSyntax bracket argument owner shape invalid: ${owner.index}`);
    }
    let typeArgOffset = 1;
    for (let ordinal = 0; ordinal < owner.bracketArgCount; ordinal += 1) {
      const argRow = bracketArgCursor + ordinal;
      const arg = typeSyntaxBracketArgs[argRow]!;
      const tokenLimit = arg.tokenStart + arg.tokenCount;
      const firstToken = receipt.tokens[arg.tokenStart];
      const finalToken = receipt.tokens[tokenLimit - 1];
      const separator = receipt.tokens[arg.tokenStart - 1];
      const trailing = receipt.tokens[tokenLimit];
      const hasType = arg.typeSyntaxIndex >= 0;
      const hasConst = arg.constExprRootIndex >= 0;
      if (arg.index !== argRow ||
          typeSyntaxBracketArgs[arg.index] !== arg ||
          arg.producerSourceIndex !== owner.producerSourceIndex ||
          arg.ownerTypeSyntaxIndex !== owner.index ||
          arg.ordinal !== ordinal ||
          arg.tokenStart <= 0 || arg.tokenCount <= 0 ||
          tokenLimit >= receipt.tokens.length ||
          firstToken === undefined || finalToken === undefined ||
          separator === undefined || trailing === undefined ||
          arg.sourceTextId !== firstToken.sourceTextId ||
          finalToken.sourceTextId !== arg.sourceTextId ||
          firstToken.start < owner.spanStart ||
          finalToken.end > owner.spanEnd ||
          hasType === hasConst ||
          arg.typeSyntaxIndex < -1 ||
          arg.typeSyntaxIndex >= owner.index ||
          arg.constExprRootIndex < -1 ||
          arg.constExprRootIndex >= receipt.counts.typeConstExprCount ||
          (owner.kindText === "ParserTypeSyntaxFixedArray" &&
            !hasConst) ||
          (ordinal === 0
            ? tokenTextRaw(source, separator) !== "["
            : ![",", ";"].includes(tokenTextRaw(source, separator))) ||
          (ordinal > 0 &&
            typeSyntaxBracketArgs[argRow - 1]!.tokenStart +
              typeSyntaxBracketArgs[argRow - 1]!.tokenCount !==
                arg.tokenStart - 1) ||
          (ordinal + 1 === owner.bracketArgCount &&
            tokenTextRaw(source, trailing) !== "]") ||
          !hex64.test(arg.identitySha256) ||
          arg.identitySha256 !== parserTypeSyntaxBracketArgIdentity(arg)) {
        throw new Error(
          `driver TypeSyntax bracket argument row invalid: ${argRow}`);
      }
      for (let tokenIndex = arg.tokenStart;
           tokenIndex < tokenLimit; tokenIndex += 1) {
        const token = receipt.tokens[tokenIndex]!;
        if (token.sourceTextId !== arg.sourceTextId ||
            (token.producerSourceIndex !== undefined &&
              token.producerSourceIndex !== arg.producerSourceIndex)) {
          throw new Error(
            `driver TypeSyntax bracket argument token authority invalid: ${argRow}`);
        }
      }
      if (hasType) {
        const typeArg = typeSyntaxes[arg.typeSyntaxIndex]!;
        const expectedChild =
          typeSyntaxChildren[owner.childStart + typeArgOffset];
        if (expectedChild !== arg.typeSyntaxIndex ||
            bracketTypeSeen[arg.typeSyntaxIndex] ||
            typeParents[arg.typeSyntaxIndex] !== owner.index ||
            typeArg.producerSourceIndex !== owner.producerSourceIndex ||
            typeArg.sourceTextId !== arg.sourceTextId ||
            typeArg.spanStart !== firstToken.start ||
            typeArg.spanEnd !== finalToken.end ||
            typeArg.rootKind !== 0 ||
            typeArg.declarationOwnerIndex !== -1 ||
            typeArg.genericSymbolCount !== 0) {
          throw new Error(
            `driver TypeSyntax bracket type argument authority invalid: ${argRow}`);
        }
        bracketTypeSeen[arg.typeSyntaxIndex] = true;
        typeArgOffset += 1;
      } else if (owner.kindText === "ParserTypeSyntaxFixedArray" &&
                 (arg.tokenCount !== 1 ||
                  tokenNames[firstToken.kind] !==
                    "ParserValueTokenInteger" ||
                  Number(tokenTextRaw(source, firstToken)) !==
                    owner.fixedLength)) {
        throw new Error(
          `driver fixed-array argument authority invalid: ${argRow}`);
      } else if (hasConst) {
        const root = typeConstExprs[arg.constExprRootIndex]!;
        const rootToken = receipt.tokens[root.tokenIndex]!;
        if (root.producerSourceIndex !== arg.producerSourceIndex ||
            root.sourceTextId !== arg.sourceTextId ||
            root.tokenIndex < arg.tokenStart ||
            root.tokenIndex >= tokenLimit) {
          throw new Error(
            `driver TypeSyntax const argument authority invalid: ${argRow}`);
        }
        const expectedRoot = parseExpectedTypeConstExpr(
          receipt, source, tokenNames, arg.tokenStart, tokenLimit);
        const appendExpected = (
          expected: ExpectedTypeConstExpr,
        ): number => {
          const leftChildIndex = expected.left === undefined
            ? -1 : appendExpected(expected.left);
          const rightChildIndex = expected.right === undefined
            ? -1 : appendExpected(expected.right);
          const index = expectedConstRows.length;
          expectedConstRows.push({
            kind: expected.kind,
            tokenIndex: expected.tokenIndex,
            leftChildIndex,
            rightChildIndex,
            integerValue: expected.integerValue,
          });
          return index;
        };
        if (appendExpected(expectedRoot) !== arg.constExprRootIndex) {
          throw new Error(
            `driver TypeSyntax const argument root order invalid: ${argRow}`);
        }
        constUseCounts[arg.constExprRootIndex] =
          (constUseCounts[arg.constExprRootIndex] ?? 0) + 1;
      }
    }
    if (bracketKind && typeArgOffset !== owner.childCount) {
      throw new Error(
        `driver TypeSyntax bracket child coverage invalid: ${owner.index}`);
    }
    bracketArgCursor += owner.bracketArgCount;
  }
  if (bracketArgCursor !== typeSyntaxBracketArgs.length) {
    throw new Error(
      "driver TypeSyntax bracket argument coverage invalid");
  }
  if (expectedConstRows.length !== typeConstExprs.length) {
    throw new Error(
      "driver TypeSyntax const expression exact coverage invalid");
  }
  for (let row = 0; row < expectedConstRows.length; row += 1) {
    const expected = expectedConstRows[row]!;
    const actual = typeConstExprs[row]!;
    if (actual.kind !== expected.kind ||
        actual.tokenIndex !== expected.tokenIndex ||
        actual.leftChildIndex !== expected.leftChildIndex ||
        actual.rightChildIndex !== expected.rightChildIndex ||
        actual.integerValue !== expected.integerValue) {
      throw new Error(
        `driver TypeSyntax const expression token AST mismatch: ${row}`);
    }
  }
  for (let row = 0; row < constUseCounts.length; row += 1) {
    if (constUseCounts[row] !== 1) {
      throw new Error(
        `driver TypeSyntax const expression ownership invalid: ${row}`);
    }
  }
  for (const row of typeSyntaxes) {
    const parentRow = typeParents[row.index] ?? -1;
    if (parentRow >= 0) {
      if (row.rootKind !== 0 ||
          row.declarationOwnerTokenIndex !== -1 ||
          row.declarationOwnerIndex !== -1 ||
          row.genericSymbolStart !== -1 ||
          row.genericSymbolCount !== 0) {
        throw new Error(`driver nested TypeSyntax root proof invalid: ${row.index}`);
      }
    }
  }
  if (!Array.isArray(typeGenericSymbols) ||
      !Array.isArray(typeGenericSymbolChildren) ||
      receipt.counts.typeGenericSymbolCount !== typeGenericSymbols.length ||
      receipt.counts.typeGenericSymbolChildCount !==
        typeGenericSymbolChildren.length) {
    throw new Error("driver type generic symbol receipt count/array mismatch");
  }
  const genericChildSeen = new Array<boolean>(typeSyntaxes.length).fill(false);
  let genericChildCursor = 0;
  for (const symbol of typeGenericSymbols) {
    if (canonicalJson(Object.keys(symbol).sort()) !== canonicalJson([
      "childCount",
      "childStart",
      "constraintTypeSyntaxIndex",
      "declarationOwnerTokenIndex",
      "defaultTypeSyntaxIndex",
      "identitySha256",
      "index",
      "nameTokenIndex",
      "ordinal",
      "ownerDeclarationIndex",
      "ownerTypeSyntaxIndex",
      "producerSourceIndex",
      "spanEnd",
      "spanStart",
    ])) {
      throw new Error(
        `driver type generic symbol receipt schema invalid: ${symbol.index}`);
    }
    const ownerToken = receipt.tokens[symbol.declarationOwnerTokenIndex];
    const nameToken = receipt.tokens[symbol.nameTokenIndex];
    const ownerDeclaration = declarations[symbol.ownerDeclarationIndex];
    const constraint = symbol.constraintTypeSyntaxIndex;
    const defaultType = symbol.defaultTypeSyntaxIndex;
    const expectedChildren = [
      ...(constraint >= 0 ? [constraint] : []),
      ...(defaultType >= 0 ? [defaultType] : []),
    ];
    if (symbol.index < 0 || symbol.index >= typeGenericSymbols.length ||
        typeGenericSymbols[symbol.index] !== symbol ||
        symbol.producerSourceIndex < 0 ||
        ownerToken === undefined || nameToken === undefined ||
        (ownerToken.producerSourceIndex !== undefined &&
          ownerToken.producerSourceIndex !== symbol.producerSourceIndex) ||
        (nameToken.producerSourceIndex !== undefined &&
          nameToken.producerSourceIndex !== symbol.producerSourceIndex) ||
        ownerToken.sourceTextId !== nameToken.sourceTextId ||
        tokenNames[nameToken.kind] !== "ParserValueTokenIdentifier" ||
        symbol.ordinal < 0 ||
        symbol.spanStart < 0 || symbol.spanEnd <= symbol.spanStart ||
        symbol.spanEnd > utf8ByteLength(source) ||
        nameToken.start < symbol.spanStart || nameToken.end > symbol.spanEnd ||
        ownerDeclaration === undefined ||
        ownerDeclaration.producerSourceIndex !==
          symbol.producerSourceIndex ||
        ownerDeclaration.nameTokenIndex !==
          symbol.declarationOwnerTokenIndex ||
        ownerDeclaration.genericSymbolStart < 0 ||
        ownerDeclaration.genericSymbolCount <= 0 ||
        symbol.index < ownerDeclaration.genericSymbolStart ||
        symbol.index >= ownerDeclaration.genericSymbolStart +
          ownerDeclaration.genericSymbolCount ||
        symbol.ordinal !==
          symbol.index - ownerDeclaration.genericSymbolStart ||
        symbol.ownerTypeSyntaxIndex < -1 ||
        symbol.ownerTypeSyntaxIndex >= typeSyntaxes.length ||
        constraint < -1 || constraint >= typeSyntaxes.length ||
        defaultType < -1 || defaultType >= typeSyntaxes.length ||
        symbol.childStart !== genericChildCursor ||
        symbol.childCount !== expectedChildren.length ||
        symbol.childCount < 0 || symbol.childCount > 2 ||
        symbol.childStart + symbol.childCount >
          typeGenericSymbolChildren.length ||
        !hex64.test(symbol.identitySha256) ||
        symbol.identitySha256 !== parserTypeGenericSymbolIdentity(symbol)) {
      throw new Error(
        `driver type generic symbol receipt row invalid: ${symbol.index}`);
    }
    if (symbol.ownerTypeSyntaxIndex >= 0) {
      const owner = typeSyntaxes[symbol.ownerTypeSyntaxIndex]!;
      if (owner.producerSourceIndex !== symbol.producerSourceIndex ||
          owner.declarationOwnerTokenIndex !==
            symbol.declarationOwnerTokenIndex ||
          owner.rootKind === 0 ||
          owner.genericSymbolStart < 0 || owner.genericSymbolCount <= 0 ||
          symbol.index < owner.genericSymbolStart ||
          symbol.index >= owner.genericSymbolStart + owner.genericSymbolCount ||
          symbol.ordinal !== symbol.index - owner.genericSymbolStart) {
        throw new Error(
          `driver type generic symbol owner root invalid: ${symbol.index}`);
      }
    }
    const constraintRow = constraint < 0
      ? undefined
      : typeSyntaxes[constraint];
    const defaultRow = defaultType < 0
      ? undefined
      : typeSyntaxes[defaultType];
    const constraintFirst = constraintRow === undefined
      ? undefined
      : receipt.tokens.find((token) =>
        token.producerSourceIndex === symbol.producerSourceIndex &&
        token.start === constraintRow.spanStart);
    const defaultFirst = defaultRow === undefined
      ? undefined
      : receipt.tokens.find((token) =>
        token.producerSourceIndex === symbol.producerSourceIndex &&
        token.start === defaultRow.spanStart);
    const colonToken = constraintFirst === undefined
      ? undefined
      : receipt.tokens[constraintFirst.index - 1];
    const assignToken = defaultFirst === undefined
      ? undefined
      : receipt.tokens[defaultFirst.index - 1];
    if (nameToken.start !== symbol.spanStart ||
        symbol.spanEnd !==
          (defaultRow?.spanEnd ??
           constraintRow?.spanEnd ??
           nameToken.end) ||
        (constraintRow !== undefined &&
          (constraintFirst === undefined ||
           colonToken === undefined ||
           tokenNames[colonToken.kind] !==
             "ParserValueTokenColon" ||
           colonToken.end > constraintRow.spanStart)) ||
        (defaultRow !== undefined &&
          (defaultFirst === undefined ||
           assignToken === undefined ||
           tokenNames[assignToken.kind] !==
             "ParserValueTokenAssign" ||
           assignToken.end > defaultRow.spanStart)) ||
        (constraintRow !== undefined &&
          defaultRow !== undefined &&
          (assignToken === undefined ||
           colonToken === undefined ||
           constraintRow.spanEnd > assignToken.start ||
           colonToken.index >= assignToken.index))) {
      throw new Error(
        `driver type generic symbol token/span invalid: ${symbol.index}`);
    }
    for (let offset = 0; offset < expectedChildren.length; offset += 1) {
      const child = typeGenericSymbolChildren[symbol.childStart + offset];
      const expected = expectedChildren[offset]!;
      if (child !== expected || child < 0 || child >= typeSyntaxes.length ||
          genericChildSeen[child]) {
        throw new Error(
          `driver type generic symbol child CSR invalid: ${symbol.index}/${offset}`);
      }
      const childRow = typeSyntaxes[child]!;
      const expectedRootKind = child === constraint ? 6 : 7;
      if (childRow.rootKind !== expectedRootKind ||
          childRow.producerSourceIndex !== symbol.producerSourceIndex ||
          childRow.ownerTokenIndex !== symbol.nameTokenIndex ||
          childRow.declarationOwnerTokenIndex !==
            symbol.declarationOwnerTokenIndex ||
          childRow.declarationOwnerIndex !== -1 ||
          childRow.spanStart < symbol.spanStart ||
          childRow.spanEnd > symbol.spanEnd) {
        throw new Error(
          `driver type generic symbol child authority invalid: ${symbol.index}/${offset}`);
      }
      genericChildSeen[child] = true;
    }
    genericChildCursor += symbol.childCount;
  }
  if (genericChildCursor !== typeGenericSymbolChildren.length) {
    throw new Error("driver type generic symbol child coverage invalid");
  }
  for (const row of typeSyntaxes) {
    if (row.genericSymbolCount === 0) continue;
    if (row.genericSymbolStart < 0 ||
        row.genericSymbolStart + row.genericSymbolCount >
          typeGenericSymbols.length) {
      throw new Error(`driver TypeSyntax generic CSR invalid: ${row.index}`);
    }
    for (let offset = 0; offset < row.genericSymbolCount; offset += 1) {
      const symbol = typeGenericSymbols[row.genericSymbolStart + offset]!;
      if (symbol.ordinal !== offset ||
          symbol.declarationOwnerTokenIndex !==
            row.declarationOwnerTokenIndex) {
        throw new Error(
          `driver TypeSyntax generic context invalid: ${row.index}/${offset}`);
      }
    }
  }
  const declarationKindByOrdinal = [
    "ParserDeclarationInvalid",
    "ParserDeclarationModule",
    "ParserDeclarationType",
    "ParserDeclarationFunction",
    "ParserDeclarationField",
    "ParserDeclarationParameter",
    "ParserDeclarationLocal",
    "ParserDeclarationConcept",
    "ParserDeclarationTrait",
  ];
  const declarationIdentities: string[] = [];
  const functionDeclarationRows = new Set<number>();
  for (const row of declarations) {
    if (canonicalJson(Object.keys(row).sort()) !== canonicalJson([
      "exportedFlag",
      "functionRow",
      "genericSymbolCount",
      "genericSymbolStart",
      "identitySha256",
      "index",
      "kind",
      "kindText",
      "lexicalScopeIndex",
      "mutableFlag",
      "nameSpanEnd",
      "nameSpanStart",
      "nameTokenIndex",
      "ownerDeclarationIndex",
      "producerSourceIndex",
      "sourceLocalRow",
      "sourceTextId",
      "spanEnd",
      "spanStart",
      "suiteLexicalScopeIndex",
      "typeSyntaxRootIndex",
    ])) {
      throw new Error(
        `driver declaration receipt schema invalid: ${row.index}`);
    }
    const nameToken = receipt.tokens[row.nameTokenIndex];
    const scope = declarationLexicalScopes[row.lexicalScopeIndex];
    const owner = row.ownerDeclarationIndex < 0
      ? undefined
      : declarations[row.ownerDeclarationIndex];
    const typeRoot = row.typeSyntaxRootIndex < 0
      ? undefined
      : typeSyntaxes[row.typeSyntaxRootIndex];
    const ownerTypeRoot = owner === undefined ||
        owner.typeSyntaxRootIndex < 0
      ? undefined
      : typeSyntaxes[owner.typeSyntaxRootIndex];
    const ownerTypeScopes = owner === undefined
      ? []
      : declarationLexicalScopes.filter((candidate) =>
        candidate.kindText === "ParserDeclarationLexicalScopeType" &&
        candidate.ownerDeclarationIndex === owner.index &&
        candidate.parentScopeIndex === owner.lexicalScopeIndex);
    const suiteScope = row.suiteLexicalScopeIndex < 0
      ? undefined
      : declarationLexicalScopes[row.suiteLexicalScopeIndex];
    if (!Number.isInteger(row.index) ||
        row.index < 0 || row.index >= declarations.length ||
        declarations[row.index] !== row ||
        row.producerSourceIndex !== 0 ||
        row.sourceLocalRow !== row.index ||
        row.sourceTextId !== 0 ||
        !Number.isInteger(row.kind) ||
        row.kind <= 0 ||
        declarationKindByOrdinal[row.kind] !== row.kindText ||
        nameToken === undefined ||
        nameToken.producerSourceIndex !== row.producerSourceIndex ||
        nameToken.sourceTextId !== row.sourceTextId ||
        tokenNames[nameToken.kind] !==
          "ParserValueTokenIdentifier" ||
        row.ownerDeclarationIndex < -1 ||
        row.ownerDeclarationIndex >= row.index ||
        scope === undefined ||
        scope.producerSourceIndex !== row.producerSourceIndex ||
        row.functionRow < -1 ||
        row.typeSyntaxRootIndex < -1 ||
        row.typeSyntaxRootIndex >= typeSyntaxes.length ||
        row.genericSymbolStart < -1 ||
        row.genericSymbolCount < 0 ||
        (row.genericSymbolCount === 0) !==
          (row.genericSymbolStart === -1) ||
        (row.genericSymbolCount > 0 &&
          row.genericSymbolStart + row.genericSymbolCount >
            typeGenericSymbols.length) ||
        row.suiteLexicalScopeIndex < -1 ||
        row.suiteLexicalScopeIndex >= declarationLexicalScopes.length ||
        row.spanStart < 0 ||
        row.spanEnd <= row.spanStart ||
        row.spanEnd > utf8ByteLength(source) ||
        row.nameSpanStart !== nameToken.start ||
        row.nameSpanEnd !== nameToken.end ||
        row.nameSpanStart < row.spanStart ||
        row.nameSpanEnd > row.spanEnd ||
        scope.spanStart > row.spanStart ||
        scope.spanEnd < row.spanEnd ||
        (row.mutableFlag !== 0 && row.mutableFlag !== 1) ||
        (row.exportedFlag !== 0 && row.exportedFlag !== 1) ||
        !hex64.test(row.identitySha256)) {
      throw new Error(
        `driver declaration receipt row invalid: ${row.index}`);
    }
    const ownerKind = owner?.kindText ?? "ParserDeclarationInvalid";
    if ((row.kindText === "ParserDeclarationModule" &&
          (owner !== undefined ||
           row.functionRow !== -1 ||
           typeRoot !== undefined ||
           row.mutableFlag !== 0)) ||
        (row.kindText === "ParserDeclarationType" &&
          (typeRoot === undefined ||
           (owner !== undefined &&
            ownerKind !== "ParserDeclarationModule" &&
            ownerKind !== "ParserDeclarationType" &&
            ownerKind !== "ParserDeclarationFunction" &&
            ownerKind !== "ParserDeclarationConcept" &&
            ownerKind !== "ParserDeclarationTrait"))) ||
        (row.kindText === "ParserDeclarationFunction" &&
          (row.functionRow < 0 ||
           (owner !== undefined &&
            ownerKind !== "ParserDeclarationModule" &&
            ownerKind !== "ParserDeclarationType" &&
            ownerKind !== "ParserDeclarationFunction" &&
            ownerKind !== "ParserDeclarationConcept" &&
            ownerKind !== "ParserDeclarationTrait"))) ||
        (row.kindText === "ParserDeclarationField" &&
          (ownerKind !== "ParserDeclarationType" ||
           row.functionRow !== -1 ||
           typeRoot === undefined)) ||
        (row.kindText === "ParserDeclarationParameter" &&
          (ownerKind !== "ParserDeclarationFunction" ||
           row.functionRow < 0)) ||
        (row.kindText === "ParserDeclarationLocal" &&
          ((row.functionRow >= 0 &&
            ownerKind !== "ParserDeclarationFunction") ||
           (row.functionRow < 0 &&
            owner !== undefined &&
            ownerKind !== "ParserDeclarationModule" &&
            ownerKind !== "ParserDeclarationType" &&
            ownerKind !== "ParserDeclarationConcept" &&
            ownerKind !== "ParserDeclarationTrait"))) ||
        ((row.kindText === "ParserDeclarationConcept" ||
          row.kindText === "ParserDeclarationTrait") &&
          (row.functionRow !== -1 ||
           typeRoot !== undefined ||
           row.mutableFlag !== 0 ||
           (owner !== undefined &&
            ownerKind !== "ParserDeclarationModule" &&
            ownerKind !== "ParserDeclarationType" &&
            ownerKind !== "ParserDeclarationFunction" &&
            ownerKind !== "ParserDeclarationConcept" &&
            ownerKind !== "ParserDeclarationTrait")))) {
      throw new Error(
        `driver declaration owner domain invalid: ${row.index}`);
    }
    const conceptTraitDeclaration =
      row.kindText === "ParserDeclarationConcept" ||
      row.kindText === "ParserDeclarationTrait";
    if (conceptTraitDeclaration) {
      if (suiteScope === undefined ||
          suiteScope.kindText !== "ParserDeclarationLexicalScopeBlock" ||
          suiteScope.ownerDeclarationIndex !== row.index) {
        throw new Error(
          `driver concept/trait suite scope invalid: ${row.index}`);
      }
    } else if (suiteScope !== undefined) {
      throw new Error(
        `driver non-concept suite scope invalid: ${row.index}`);
    }
    if (row.genericSymbolCount > 0) {
      if (row.kindText !== "ParserDeclarationType" &&
          row.kindText !== "ParserDeclarationFunction" &&
          row.kindText !== "ParserDeclarationConcept" &&
          row.kindText !== "ParserDeclarationTrait") {
        throw new Error(
          `driver declaration generic kind invalid: ${row.index}`);
      }
      for (let offset = 0; offset < row.genericSymbolCount; offset += 1) {
        const symbol =
          typeGenericSymbols[row.genericSymbolStart + offset];
        if (symbol === undefined ||
            symbol.ownerDeclarationIndex !== row.index ||
            symbol.ordinal !== offset) {
          throw new Error(
            `driver declaration generic CSR invalid: ${row.index}/${offset}`);
        }
      }
    }
    if (row.kindText === "ParserDeclarationFunction") {
      if (functionDeclarationRows.has(row.functionRow)) {
        throw new Error(
          `driver declaration duplicate function row: ${row.index}`);
      }
      functionDeclarationRows.add(row.functionRow);
    }
    if (typeRoot !== undefined &&
        typeRoot.producerSourceIndex !== row.producerSourceIndex) {
      throw new Error(
        `driver declaration TypeSyntax identity invalid: ${row.index}`);
    }
    if (row.kindText === "ParserDeclarationType" &&
        (typeRoot === undefined ||
         typeRoot.rootKind !== 3 ||
         typeRoot.declarationOwnerIndex !== typeRoot.index ||
         typeRoot.ownerTokenIndex !== row.nameTokenIndex ||
         typeRoot.declarationOwnerTokenIndex !== row.nameTokenIndex)) {
      throw new Error(
        `driver declaration TypeSyntax type-root join invalid: ${row.index}`);
    }
    if (row.kindText === "ParserDeclarationField" &&
        (typeRoot === undefined ||
         owner === undefined ||
         owner.kindText !== "ParserDeclarationType" ||
         ownerTypeRoot === undefined ||
         owner.typeSyntaxRootIndex !== typeRoot.declarationOwnerIndex ||
         ownerTypeRoot.index !== typeRoot.declarationOwnerIndex ||
         ownerTypeScopes.length !== 1 ||
         ownerTypeScopes[0] !== scope ||
         scope.kindText !== "ParserDeclarationLexicalScopeType" ||
         scope.ownerDeclarationIndex !== owner.index ||
         scope.parentScopeIndex !== owner.lexicalScopeIndex ||
         typeRoot.rootKind !== 4 ||
         typeRoot.ownerTokenIndex !== row.nameTokenIndex ||
         typeRoot.declarationOwnerIndex < 0)) {
      throw new Error(
        `driver declaration TypeSyntax field-root join invalid: ${row.index}`);
    }
    if (typeRoot !== undefined &&
        row.kindText !== "ParserDeclarationType" &&
        row.kindText !== "ParserDeclarationField" &&
        typeRoot.declarationOwnerIndex !== -1) {
      throw new Error(
        `driver declaration TypeSyntax non-owner root invalid: ${row.index}`);
    }
    const expectedIdentity = driverDeclarationIdentity(
      row,
      source,
      receipt.tokens,
      declarationIdentities,
      declarationLexicalScopes,
      typeSyntaxes,
      typeGenericSymbols,
    );
    if (row.identitySha256 !== expectedIdentity) {
      throw new Error(
        `driver declaration receipt row invalid: ${row.index}`);
    }
    declarationIdentities.push(expectedIdentity);
  }
  for (const scope of declarationLexicalScopes) {
    if (scope.ownerDeclarationIndex < -1 ||
        scope.ownerDeclarationIndex >= declarations.length) {
      throw new Error(
        `driver declaration lexical scope owner invalid: ${scope.index}`);
    }
    if (scope.ownerDeclarationIndex >= 0) {
      const owner = declarations[scope.ownerDeclarationIndex]!;
      if (owner.producerSourceIndex !== scope.producerSourceIndex ||
          owner.spanStart > scope.spanStart ||
          owner.spanEnd < scope.spanEnd) {
        throw new Error(
          `driver declaration lexical scope owner invalid: ${scope.index}`);
      }
    }
  }
  if (!Array.isArray(patterns) || !Array.isArray(patternChildren) ||
      receipt.counts.patternCount !== patterns.length ||
      receipt.counts.patternChildCount !== patternChildren.length) {
    throw new Error("driver pattern receipt count/array mismatch");
  }
  const patternKindByOrdinal = [
    "ParserPatternInvalid",
    "ParserPatternBinding",
    "ParserPatternWildcard",
    "ParserPatternLiteral",
    "ParserPatternTuple",
    "ParserPatternSequence",
    "ParserPatternObject",
    "ParserPatternConstructor",
    "ParserPatternNamedField",
    "ParserPatternRange",
  ];
  const patternParents = new Array<number>(patterns.length).fill(-1);
  const patternChildSeen = new Array<boolean>(patterns.length).fill(false);
  const patternBindingDeclarationSeen = new Set<number>();
  const patternBindingNameSeen = new Set<string>();
  const nextPatternLocalRow = new Map<number, number>();
  let patternChildCursor = 0;
  for (const pattern of patterns) {
    if (canonicalJson(Object.keys(pattern).sort()) !== canonicalJson([
      "bindingDeclarationIndex",
      "childCount",
      "childStart",
      "identitySha256",
      "index",
      "kind",
      "kindText",
      "nameTokenIndex",
      "ownerKind",
      "ownerLexicalScopeIndex",
      "ownerRow",
      "producerSourceIndex",
      "sourceLocalRow",
      "spanEnd",
      "spanStart",
      "typeSyntaxRootIndex",
    ])) {
      throw new Error(`driver pattern receipt schema invalid: ${pattern.index}`);
    }
    const expectedLocalRow = nextPatternLocalRow.get(
      pattern.producerSourceIndex) ?? 0;
    const nameToken = pattern.nameTokenIndex < 0
      ? undefined
      : receipt.tokens[pattern.nameTokenIndex];
    if (pattern.index < 0 || pattern.index >= patterns.length ||
        patterns[pattern.index] !== pattern ||
        pattern.producerSourceIndex < 0 ||
        pattern.sourceLocalRow !== expectedLocalRow ||
        !Number.isInteger(pattern.kind) || pattern.kind <= 0 ||
        patternKindByOrdinal[pattern.kind] !== pattern.kindText ||
        pattern.nameTokenIndex < -1 ||
        pattern.nameTokenIndex >= receipt.tokens.length ||
        (nameToken?.producerSourceIndex !== undefined &&
          nameToken.producerSourceIndex !== pattern.producerSourceIndex) ||
        pattern.ownerLexicalScopeIndex < 0 ||
        pattern.ownerLexicalScopeIndex >= declarationLexicalScopes.length ||
        !Number.isInteger(pattern.ownerKind) ||
        pattern.ownerKind < 0 || pattern.ownerKind > 2 ||
        !Number.isInteger(pattern.ownerRow) ||
        (pattern.ownerKind === 0 && pattern.ownerRow !== -1) ||
        (pattern.ownerKind !== 0 && pattern.ownerRow < 0) ||
        pattern.bindingDeclarationIndex < -1 ||
        pattern.bindingDeclarationIndex >= declarations.length ||
        pattern.typeSyntaxRootIndex < -1 ||
        pattern.typeSyntaxRootIndex >= typeSyntaxes.length ||
        pattern.spanStart < 0 || pattern.spanEnd <= pattern.spanStart ||
        pattern.spanEnd > utf8ByteLength(source) ||
        (nameToken !== undefined &&
          (nameToken.start < pattern.spanStart ||
            nameToken.end > pattern.spanEnd)) ||
        pattern.childStart !== patternChildCursor ||
        pattern.childCount < 0 ||
        pattern.childStart + pattern.childCount > patternChildren.length ||
        !hex64.test(pattern.identitySha256) ||
        pattern.identitySha256 !== parserPatternIdentity(pattern)) {
      throw new Error(`driver pattern receipt row invalid: ${pattern.index}`);
    }
    const ownerScope =
      declarationLexicalScopes[pattern.ownerLexicalScopeIndex]!;
    if (ownerScope.producerSourceIndex !==
          pattern.producerSourceIndex ||
        ownerScope.spanStart > pattern.spanStart ||
        ownerScope.spanEnd < pattern.spanEnd) {
      throw new Error(
        `driver pattern lexical scope owner invalid: ${pattern.index}`);
    }
    if (pattern.kindText === "ParserPatternBinding") {
      const declaration =
        declarations[pattern.bindingDeclarationIndex];
      const bindingKey = nameToken === undefined
        ? ""
        : `${pattern.ownerLexicalScopeIndex}\0${
          utf8Slice(source, nameToken.start, nameToken.end)
        }`;
      if (nameToken === undefined ||
          declaration === undefined ||
          declaration.kindText !== "ParserDeclarationLocal" ||
          declaration.nameTokenIndex !== pattern.nameTokenIndex ||
          declaration.lexicalScopeIndex !==
            pattern.ownerLexicalScopeIndex ||
          patternBindingDeclarationSeen.has(
            pattern.bindingDeclarationIndex) ||
          patternBindingNameSeen.has(bindingKey)) {
        throw new Error(
          `driver pattern binding authority invalid: ${pattern.index}`);
      }
      assertCurrentPatternBindingTypeSyntaxJoin(
        pattern.index,
        pattern.kindText,
        pattern.bindingDeclarationIndex,
        pattern.typeSyntaxRootIndex,
        declaration.typeSyntaxRootIndex,
      );
      patternBindingDeclarationSeen.add(pattern.bindingDeclarationIndex);
      patternBindingNameSeen.add(bindingKey);
    } else if (pattern.bindingDeclarationIndex !== -1) {
      throw new Error(
        `driver pattern non-binding declaration invalid: ${pattern.index}`);
    }
    const namedKind = [
      "ParserPatternBinding", "ParserPatternWildcard",
      "ParserPatternLiteral", "ParserPatternConstructor",
      "ParserPatternNamedField",
    ].includes(pattern.kindText);
    if (namedKind !== (nameToken !== undefined)) {
      throw new Error(`driver pattern name token invalid: ${pattern.index}`);
    }
    for (let offset = 0; offset < pattern.childCount; offset += 1) {
      const child = patternChildren[pattern.childStart + offset];
      if (child === undefined || child < 0 || child >= pattern.index ||
          patternChildSeen[child]) {
        throw new Error(
          `driver pattern child CSR invalid: ${pattern.index}/${offset}`);
      }
      const childRow = patterns[child]!;
      if (childRow.producerSourceIndex !== pattern.producerSourceIndex ||
          childRow.ownerLexicalScopeIndex !== pattern.ownerLexicalScopeIndex ||
          childRow.spanStart < pattern.spanStart ||
          childRow.spanEnd > pattern.spanEnd) {
        throw new Error(
          `driver pattern child authority invalid: ${pattern.index}/${offset}`);
      }
      patternChildSeen[child] = true;
      patternParents[child] = pattern.index;
    }
    patternChildCursor += pattern.childCount;
    nextPatternLocalRow.set(
      pattern.producerSourceIndex, pattern.sourceLocalRow + 1);
  }
  if (patternChildCursor !== patternChildren.length) {
    throw new Error("driver pattern child coverage invalid");
  }
  const patternTokens = (pattern: DriverPattern): readonly DriverToken[] =>
    receipt.tokens.filter((token) =>
      token.producerSourceIndex === pattern.producerSourceIndex &&
      token.start >= pattern.spanStart &&
      token.end <= pattern.spanEnd &&
      token.start < pattern.spanEnd);
  const patternChildRows = (
    pattern: DriverPattern,
  ): readonly DriverPattern[] =>
    patternChildren
      .slice(pattern.childStart, pattern.childStart + pattern.childCount)
      .map((child) => patterns[child]!);
  for (const pattern of patterns) {
    const tokens = patternTokens(pattern);
    const children = patternChildRows(pattern);
    assertCurrentPatternFormalShape({
      row: pattern.index,
      kindText: pattern.kindText,
      nameTokenIndex: pattern.nameTokenIndex,
      spanStart: pattern.spanStart,
      spanEnd: pattern.spanEnd,
      tokens: tokens.map((token) => ({
        index: token.index,
        kindText: tokenNames[token.kind]!,
        text: utf8Slice(source, token.start, token.end),
        start: token.start,
        end: token.end,
      })),
      children: children.map((child) => ({
        spanStart: child.spanStart,
        spanEnd: child.spanEnd,
      })),
    });
  }
  for (const pattern of patterns) {
    const parent = patternParents[pattern.index]!;
    if (parent >= 0) {
      if (pattern.ownerKind !== 0 || pattern.ownerRow !== -1) {
        throw new Error(
          `driver pattern child owns syntax surface: ${pattern.index}`);
      }
      continue;
    }
    const firstToken = receipt.tokens.find((token) =>
      token.start >= pattern.spanStart && token.end <= pattern.spanEnd);
    if (firstToken === undefined ||
        firstToken.producerSourceIndex !== pattern.producerSourceIndex) {
      throw new Error(
        `driver pattern root source identity invalid: ${pattern.index}`);
    }
    if (pattern.ownerKind === 1) {
      const region = receipt.regions[pattern.ownerRow];
      if (region === undefined || region.index !== pattern.ownerRow ||
          !["ParserValueExprRegionPattern",
            "ParserValueExprRegionCaseArm"].includes(region.kind) ||
          region.sourceTextId !== firstToken.sourceTextId ||
          region.spanStart > pattern.spanStart ||
          region.spanEnd < pattern.spanEnd) {
        throw new Error(
          `driver pattern region owner invalid: ${pattern.index}`);
      }
      const anchor = receipt.tokens[region.anchorTokenIndex];
      if (anchor === undefined ||
          anchor.producerSourceIndex !== pattern.producerSourceIndex ||
          anchor.sourceTextId !== region.sourceTextId) {
        throw new Error(
          `driver pattern region anchor invalid: ${pattern.index}`);
      }
    } else if (pattern.ownerKind === 2) {
      const node = receipt.nodes[pattern.ownerRow];
      if (node === undefined || node.index !== pattern.ownerRow ||
          node.kind !== "ParserValueExprCaseBranch" ||
          node.sourceTextId !== firstToken.sourceTextId ||
          node.spanStart > pattern.spanStart ||
          node.spanEnd < pattern.spanEnd) {
        throw new Error(
          `driver pattern value owner invalid: ${pattern.index}`);
      }
    } else {
      throw new Error(`driver pattern root owner missing: ${pattern.index}`);
    }
  }
  const annotationOwnerByTypeSyntax = new Map<number, number>();
  for (const pattern of patterns) {
    if (pattern.typeSyntaxRootIndex < 0) continue;
    const typeRoot = typeSyntaxes[pattern.typeSyntaxRootIndex]!;
    if (typeRoot.rootKind !== 5 ||
        typeRoot.producerSourceIndex !== pattern.producerSourceIndex ||
        typeRoot.declarationOwnerIndex !== -1) {
      throw new Error(
        `driver pattern type annotation authority invalid: ${pattern.index}`);
    }
    let root = pattern.index;
    while (patternParents[root]! >= 0) root = patternParents[root]!;
    if (pattern.index === root &&
        pattern.kindText !== "ParserPatternBinding" &&
        pattern.kindText !== "ParserPatternWildcard") {
      throw new Error(
        `driver pattern root annotation surface invalid: ${pattern.index}`);
    }
    if (pattern.kindText !== "ParserPatternBinding" &&
        patternParents[pattern.index]! >= 0) {
      throw new Error(
        `driver pattern nested annotation owner invalid: ${pattern.index}`);
    }
    if (pattern.index === root) {
      const previous = annotationOwnerByTypeSyntax.get(
        pattern.typeSyntaxRootIndex);
      if (previous !== undefined) {
        throw new Error(
          `driver pattern type annotation root reused: ${pattern.index}/${previous}`);
      }
      annotationOwnerByTypeSyntax.set(pattern.typeSyntaxRootIndex, root);
    }
    if (pattern.kindText === "ParserPatternBinding") {
      const rootType = patterns[root]!.typeSyntaxRootIndex;
      if (rootType !== pattern.typeSyntaxRootIndex) {
        throw new Error(
          `driver pattern binding annotation join invalid: ${pattern.index}`);
      }
    }
  }
  for (const [typeSyntaxIndex, rootPatternIndex] of
    annotationOwnerByTypeSyntax.entries()) {
    const typeRoot = typeSyntaxes[typeSyntaxIndex]!;
    const bindingNameTokens: number[] = [];
    for (const pattern of patterns) {
      if (pattern.kindText !== "ParserPatternBinding" ||
          pattern.typeSyntaxRootIndex !== typeSyntaxIndex) continue;
      let root = pattern.index;
      while (patternParents[root]! >= 0) root = patternParents[root]!;
      if (root !== rootPatternIndex || pattern.nameTokenIndex < 0) {
        throw new Error(
          `driver pattern annotation crossed pattern: ${pattern.index}`);
      }
      bindingNameTokens.push(pattern.nameTokenIndex);
    }
    const ownerTokenIndex = bindingNameTokens.length > 0
      ? Math.min(...bindingNameTokens)
      : patterns[rootPatternIndex]!.nameTokenIndex;
    if (ownerTokenIndex < 0 ||
        typeRoot.ownerTokenIndex !== ownerTokenIndex ||
        typeRoot.declarationOwnerTokenIndex !== ownerTokenIndex ||
        typeRoot.spanStart <= patterns[rootPatternIndex]!.spanEnd) {
      throw new Error(
        `driver pattern annotation owner/span invalid: ${rootPatternIndex}`);
    }
  }
  if (!Array.isArray(annotations) ||
      !Array.isArray(annotationArgRoots) ||
      !Array.isArray(annotationArgs) ||
      !Array.isArray(annotationArgChildren) ||
      receipt.counts.annotationCount !== annotations.length ||
      receipt.counts.annotationArgCount !== annotationArgs.length ||
      receipt.counts.annotationArgRootCount !== annotationArgRoots.length ||
      receipt.counts.annotationArgChildCount !== annotationArgChildren.length) {
    throw new Error("driver annotation receipt count/array mismatch");
  }
  const parent = new Array<number>(annotationArgs.length).fill(-1);
  const rootOwner = new Array<number>(annotationArgs.length).fill(-1);
  let annotationRootCursor = 0;
  for (const annotation of annotations) {
    const nameToken = receipt.tokens[annotation.nameTokenIndex];
    const targetToken = receipt.tokens[annotation.targetTokenIndex];
    const atToken = receipt.tokens[annotation.nameTokenIndex - 1];
    const annotationTailTokens = receipt.tokens.filter((token) =>
      token.producerSourceIndex === annotation.producerSourceIndex &&
      token.sourceTextId === annotation.sourceTextId &&
      token.start >= (nameToken?.end ?? annotation.spanEnd) &&
      token.end <= annotation.spanEnd);
    const openToken = annotationTailTokens[0];
    const closeToken =
      annotationTailTokens[annotationTailTokens.length - 1];
    const noArgumentList =
      annotationTailTokens.length === 0 &&
      nameToken !== undefined &&
      annotation.spanEnd === nameToken.end;
    const exactArgumentList =
      openToken !== undefined &&
      closeToken !== undefined &&
      tokenNames[openToken.kind] === "ParserValueTokenLeftParen" &&
      tokenNames[closeToken.kind] === "ParserValueTokenRightParen" &&
      closeToken.end === annotation.spanEnd &&
      (annotation.argRootCount > 0 || annotationTailTokens.length === 2);
    if (annotation.index < 0 || annotation.index >= annotations.length ||
        annotations[annotation.index] !== annotation ||
        annotation.sourceLocalRow !== annotation.index ||
        annotation.producerSourceIndex < 0 ||
        nameToken === undefined || targetToken === undefined ||
        atToken === undefined ||
        tokenNames[atToken.kind] !== "ParserValueTokenAt" ||
        tokenNames[nameToken.kind] !== "ParserValueTokenIdentifier" ||
        annotation.sourceTextId !== nameToken.sourceTextId ||
        annotation.sourceTextId !== targetToken.sourceTextId ||
        annotation.sourceTextId !== atToken.sourceTextId ||
        annotation.producerSourceIndex !== nameToken.producerSourceIndex ||
        annotation.producerSourceIndex !== targetToken.producerSourceIndex ||
        annotation.producerSourceIndex !== atToken.producerSourceIndex ||
        annotation.spanStart < 0 || annotation.spanEnd <= annotation.spanStart ||
        annotation.spanEnd > utf8ByteLength(source) ||
        atToken.start !== annotation.spanStart ||
        atToken.end !== nameToken.start ||
        nameToken.end > annotation.spanEnd ||
        targetToken.start <= annotation.spanEnd ||
        (!noArgumentList && !exactArgumentList) ||
        (noArgumentList && annotation.argRootCount !== 0) ||
        annotation.argRootStart !== annotationRootCursor ||
        annotation.argRootCount < 0 ||
        annotation.argRootStart + annotation.argRootCount > annotationArgRoots.length ||
        !hex64.test(annotation.identitySha256)) {
      throw new Error(`driver annotation receipt row invalid: ${annotation.index}`);
    }
    for (let offset = 0; offset < annotation.argRootCount; offset += 1) {
      const root = annotationArgRoots[annotation.argRootStart + offset]!;
      if (root < 0 || root >= annotationArgs.length ||
          (rootOwner[root] ?? -1) >= 0) {
        throw new Error(`driver annotation root CSR invalid: ${annotation.index}/${offset}`);
      }
      rootOwner[root] = annotation.index;
    }
    annotationRootCursor += annotation.argRootCount;
  }
  if (annotationRootCursor !== annotationArgRoots.length) {
    throw new Error("driver annotation root CSR coverage invalid");
  }
  const kindByOrdinal = [
    "ParserAnnotationArgInvalid",
    "ParserAnnotationArgIdentifier",
    "ParserAnnotationArgNumber",
    "ParserAnnotationArgString",
    "ParserAnnotationArgCharacter",
    "ParserAnnotationArgBoolean",
    "ParserAnnotationArgList",
    "ParserAnnotationArgDict",
    "ParserAnnotationArgKeyValue",
  ];
  const annotationArgExpectedIdentities: string[] = [];
  let annotationChildCursor = 0;
  for (const arg of annotationArgs) {
    const argToken = receipt.tokens[arg.tokenIndex];
    const separatorToken = arg.separatorTokenIndex < 0
      ? undefined
      : receipt.tokens[arg.separatorTokenIndex];
    if (arg.index < 0 || arg.index >= annotationArgs.length ||
        annotationArgs[arg.index] !== arg ||
        arg.sourceLocalRow !== arg.index ||
        arg.producerSourceIndex < 0 ||
        arg.ownerAnnotationIndex < 0 || arg.ownerAnnotationIndex >= annotations.length ||
        !Number.isInteger(arg.kind) || arg.kind <= 0 ||
        kindByOrdinal[arg.kind] !== arg.kindText ||
        argToken === undefined ||
        arg.sourceTextId !== argToken.sourceTextId ||
        arg.producerSourceIndex !== argToken.producerSourceIndex ||
        arg.separatorTokenIndex < -1 || arg.separatorTokenIndex >= receipt.tokens.length ||
        (separatorToken !== undefined &&
          (separatorToken.sourceTextId !== arg.sourceTextId ||
           separatorToken.producerSourceIndex !== arg.producerSourceIndex ||
           separatorToken.start < arg.spanStart ||
           separatorToken.end > arg.spanEnd)) ||
        arg.spanStart < 0 || arg.spanEnd <= arg.spanStart ||
        arg.spanEnd > utf8ByteLength(source) ||
        argToken.start < arg.spanStart ||
        argToken.end > arg.spanEnd ||
        arg.childStart !== annotationChildCursor || arg.childCount < 0 ||
        arg.childStart + arg.childCount > annotationArgChildren.length ||
        !hex64.test(arg.identitySha256)) {
      throw new Error(`driver annotation arg receipt row invalid: ${arg.index}`);
    }
    for (let offset = 0; offset < arg.childCount; offset += 1) {
      const child = annotationArgChildren[arg.childStart + offset]!;
      if (child < 0 || child >= arg.index ||
          (parent[child] ?? -1) >= 0 ||
          annotationArgs[child]!.ownerAnnotationIndex !== arg.ownerAnnotationIndex) {
        throw new Error(`driver annotation arg child CSR invalid: ${arg.index}/${offset}`);
      }
      parent[child] = arg.index;
    }
    const expectedIdentity = parserAnnotationArgIdentity(
      arg,
      source,
      receipt.tokens,
      annotationArgChildren,
      annotationArgExpectedIdentities,
    );
    if (arg.identitySha256 !== expectedIdentity) {
      throw new Error(`driver annotation arg receipt row invalid: ${arg.index}`);
    }
    annotationArgExpectedIdentities.push(expectedIdentity);
    annotationChildCursor += arg.childCount;
  }
  if (annotationChildCursor !== annotationArgChildren.length) {
    throw new Error("driver annotation arg child CSR coverage invalid");
  }
  for (const annotation of annotations) {
    if (annotation.identitySha256 !== parserAnnotationIdentity(
      annotation,
      source,
      receipt.tokens,
      annotationArgRoots,
      annotationArgExpectedIdentities,
    )) {
      throw new Error(
        `driver annotation receipt row invalid: ${annotation.index}`);
    }
  }
  for (const arg of annotationArgs) {
    const root = rootOwner[arg.index] ?? -1;
    const hasParent = (parent[arg.index] ?? -1) >= 0;
    if ((root >= 0) === hasParent ||
        (root >= 0 && root !== arg.ownerAnnotationIndex)) {
      throw new Error(`driver annotation arg ownership invalid: ${arg.index}`);
    }
    const children = annotationArgChildren.slice(
      arg.childStart, arg.childStart + arg.childCount);
    if (arg.kindText === "ParserAnnotationArgKeyValue") {
      const separator = receipt.tokens[arg.separatorTokenIndex];
      const key = annotationArgs[children[0] ?? -1];
      const value = annotationArgs[children[1] ?? -1];
      const between = key === undefined || value === undefined
        ? []
        : receipt.tokens.filter((token) =>
          token.producerSourceIndex === arg.producerSourceIndex &&
          token.sourceTextId === arg.sourceTextId &&
          token.start >= key.spanEnd &&
          token.end <= value.spanStart);
      if (children.length !== 2 ||
          arg.tokenIndex !== arg.separatorTokenIndex ||
          separator === undefined ||
          !["ParserValueTokenColon", "ParserValueTokenAssign"].includes(
            tokenNames[separator.kind] ?? "") ||
          key === undefined || value === undefined ||
          arg.spanStart !== key.spanStart ||
          key.spanEnd > separator.start ||
          separator.end > value.spanStart ||
          between.length !== 1 || between[0] !== separator ||
          arg.spanEnd !== value.spanEnd) {
        throw new Error(`driver annotation KeyValue shape invalid: ${arg.index}`);
      }
      if (![
        "ParserAnnotationArgIdentifier", "ParserAnnotationArgString",
        "ParserAnnotationArgNumber", "ParserAnnotationArgBoolean",
      ].includes(key.kindText)) {
        throw new Error(`driver annotation key kind invalid: ${arg.index}`);
      }
    } else if (arg.kindText === "ParserAnnotationArgList" ||
               arg.kindText === "ParserAnnotationArgDict") {
      const open = receipt.tokens[arg.tokenIndex];
      const list = arg.kindText === "ParserAnnotationArgList";
      const close = receipt.tokens.find((token) =>
        token.producerSourceIndex === arg.producerSourceIndex &&
        token.sourceTextId === arg.sourceTextId &&
        token.end === arg.spanEnd &&
        token.start >= (open?.end ?? arg.spanEnd) &&
        tokenNames[token.kind] ===
          (list
            ? "ParserValueTokenRightBracket"
            : "ParserValueTokenRightBrace"));
      if (arg.separatorTokenIndex !== -1 ||
          open === undefined || close === undefined ||
          tokenNames[open.kind] !==
            (list
              ? "ParserValueTokenLeftBracket"
              : "ParserValueTokenLeftBrace") ||
          open.start !== arg.spanStart) {
        throw new Error(`driver annotation container separator invalid: ${arg.index}`);
      }
      if (arg.kindText === "ParserAnnotationArgDict" &&
          children.some((child) =>
            annotationArgs[child]!.kindText !== "ParserAnnotationArgKeyValue")) {
        throw new Error(`driver annotation dictionary child invalid: ${arg.index}`);
      }
      const childRows = children.map((child) => annotationArgs[child]!);
      for (let index = 0; index < childRows.length; index += 1) {
        const child = childRows[index]!;
        const leftBoundary =
          index === 0 ? open.end : childRows[index - 1]!.spanEnd;
        const rightBoundary = child.spanStart;
        const between = receipt.tokens.filter((token) =>
          token.producerSourceIndex === arg.producerSourceIndex &&
          token.sourceTextId === arg.sourceTextId &&
          token.start >= leftBoundary && token.end <= rightBoundary);
        const commas = between.filter((token) =>
          tokenNames[token.kind] === "ParserValueTokenComma");
        if (child.spanStart < open.end || child.spanEnd > close.start ||
            (index > 0 &&
              (commas.length !== 1 || between.length !== 1)) ||
            (index === 0 && between.length !== 0)) {
          throw new Error(
            `driver annotation container child span invalid: ${arg.index}/${index}`);
        }
      }
      const trailing = receipt.tokens.filter((token) =>
        token.producerSourceIndex === arg.producerSourceIndex &&
        token.sourceTextId === arg.sourceTextId &&
        token.start >=
          (childRows[childRows.length - 1]?.spanEnd ?? open.end) &&
        token.end <= close.start);
      if ((childRows.length === 0 && trailing.length !== 0) ||
          trailing.length > 1 ||
          trailing.some((token) =>
            tokenNames[token.kind] !== "ParserValueTokenComma")) {
        throw new Error(
          `driver annotation container trailing separator invalid: ${arg.index}`);
      }
    } else {
      const scalarKinds: Readonly<Record<string, readonly string[]>> = {
        ParserAnnotationArgIdentifier: [
          "ParserValueTokenIdentifier",
          "ParserValueTokenBlock",
          "ParserValueTokenObject",
        ],
        ParserAnnotationArgNumber: [
          "ParserValueTokenInteger", "ParserValueTokenFloat",
        ],
        ParserAnnotationArgString: ["ParserValueTokenString"],
        ParserAnnotationArgCharacter: ["ParserValueTokenChar"],
        ParserAnnotationArgBoolean: [
          "ParserValueTokenTrue", "ParserValueTokenFalse",
        ],
      };
      const expectedTokenKinds = scalarKinds[arg.kindText];
      const token = receipt.tokens[arg.tokenIndex];
      if (children.length !== 0 || arg.separatorTokenIndex !== -1 ||
          expectedTokenKinds === undefined || token === undefined ||
          !expectedTokenKinds.includes(tokenNames[token.kind] ?? "") ||
          arg.spanStart !== token.start || arg.spanEnd !== token.end) {
        throw new Error(`driver annotation scalar shape invalid: ${arg.index}`);
      }
    }
  }
  for (const annotation of annotations) {
    const roots = annotationArgRoots
      .slice(
        annotation.argRootStart,
        annotation.argRootStart + annotation.argRootCount,
      )
      .map((row) => annotationArgs[row]!);
    const name = receipt.tokens[annotation.nameTokenIndex]!;
    const close = receipt.tokens.find((token) =>
      token.producerSourceIndex === annotation.producerSourceIndex &&
      token.sourceTextId === annotation.sourceTextId &&
      token.end === annotation.spanEnd &&
      tokenNames[token.kind] === "ParserValueTokenRightParen");
    if (roots.length > 0 && close === undefined) {
      throw new Error(
        `driver annotation argument list close invalid: ${annotation.index}`);
    }
    for (let index = 0; index < roots.length; index += 1) {
      const root = roots[index]!;
      const leftBoundary =
        index === 0 ? name.end : roots[index - 1]!.spanEnd;
      const between = receipt.tokens.filter((token) =>
        token.producerSourceIndex === annotation.producerSourceIndex &&
        token.sourceTextId === annotation.sourceTextId &&
        token.start >= leftBoundary &&
        token.end <= root.spanStart);
      const separators = between.filter((token) =>
        ["ParserValueTokenComma", "ParserValueTokenSemicolon"].includes(
          tokenNames[token.kind] ?? ""));
      if (root.spanStart < name.end ||
          root.spanEnd > (close?.start ?? annotation.spanEnd) ||
          (index === 0 &&
            (separators.length !== 0 ||
             between.length !== 1 ||
             tokenNames[between[0]!.kind] !==
               "ParserValueTokenLeftParen")) ||
          (index > 0 &&
            (separators.length !== 1 || between.length !== 1))) {
        throw new Error(
          `driver annotation root span/separator invalid: ${annotation.index}/${index}`);
      }
    }
    if (roots.length > 0 && close !== undefined) {
      const trailing = receipt.tokens.filter((token) =>
        token.producerSourceIndex === annotation.producerSourceIndex &&
        token.sourceTextId === annotation.sourceTextId &&
        token.start >= roots[roots.length - 1]!.spanEnd &&
        token.end <= close.start);
      if (trailing.length !== 0) {
        throw new Error(
          `driver annotation trailing root separator invalid: ${annotation.index}`);
      }
    }
  }
  const ctx: Ctx = {
    receipt, source, tokenNames, nodesByKind: byKind,
    annotations, annotationArgRoots, annotationArgs, annotationArgChildren,
    annotationArgParents: parent,
    typeSyntaxes, typeSyntaxChildren, typeSyntaxParents: typeParents,
    typeEnumVariants,
    typeSyntaxBracketArgs, typeConstExprs,
    typeGenericSymbols, typeGenericSymbolChildren,
    declarationLexicalScopes, declarations,
    patterns, patternChildren, patternParents,
    normalizedStatementFacts, normalizedScopeFacts, importEdges,
  };
  for (const row of [
    ...typeSyntaxes,
    ...typeGenericSymbols,
    ...patterns,
  ]) {
    parserOwnedRowContext.set(row, ctx);
  }
  return ctx;
}

function nodeAt(ctx: Ctx, index: number): DriverNode {
  return ctx.receipt.nodes[index]!;
}

function childrenOf(ctx: Ctx, node: DriverNode): DriverNode[] {
  const out: DriverNode[] = [];
  let cursor = node.firstChild;
  while (cursor >= 0) {
    const child = nodeAt(ctx, cursor);
    out.push(child);
    cursor = child.nextSibling;
  }
  return out;
}

function tokenText(ctx: Ctx, token: DriverToken): string {
  return utf8Slice(ctx.source, token.start, token.end);
}

function tokenName(ctx: Ctx, token: DriverToken): string {
  return ctx.tokenNames[token.kind] ?? `?${token.kind}`;
}

function binaryOperator(ctx: Ctx, node: DriverNode): string {
  const kids = childrenOf(ctx, node);
  if (kids.length !== 2) return "";
  const between = ctx.receipt.tokens.filter((t) => t.index >= kids[0]!.tokenEnd && t.index < kids[1]!.tokenStart);
  return between.map((t) => tokenText(ctx, t)).join(" ");
}

function unaryOperator(ctx: Ctx, node: DriverNode): string {
  const kids = childrenOf(ctx, node);
  if (kids.length !== 1) return "";
  const before = ctx.receipt.tokens.filter((t) => t.index >= node.tokenStart && t.index < kids[0]!.tokenStart);
  return before.map((t) => tokenText(ctx, t)).join(" ");
}

function tokensInSpan(ctx: Ctx, spanStart: number, spanEnd: number): DriverToken[] {
  return ctx.receipt.tokens.filter((t) => t.start >= spanStart && t.end <= spanEnd && t.start < spanEnd);
}

function tokensNamed(ctx: Ctx, name: string): DriverToken[] {
  return ctx.receipt.tokens.filter((t) => tokenName(ctx, t) === name);
}

function moduleHeaderRegion(ctx: Ctx): DriverRegion | null {
  const regions = ctx.receipt.regions.filter(
    (row) => row.kind === "ParserValueExprRegionModuleHeaderLine",
  );
  return regions.length === 1 ? regions[0]! : null;
}

function moduleHeaderOnlyRegion(ctx: Ctx): DriverRegion | null {
  const region = moduleHeaderRegion(ctx);
  if (region === null ||
      ctx.receipt.regions.length !== 1 ||
      ctx.receipt.tokens.length !== 2 ||
      ctx.receipt.nodes.length !== 0 ||
      ctx.receipt.statementRoots.length !== 0) {
    return null;
  }
  const [moduleToken, nameToken] = ctx.receipt.tokens;
  if (moduleToken === undefined ||
      nameToken === undefined ||
      tokenName(ctx, moduleToken) !== "ParserValueTokenModule" ||
      tokenText(ctx, moduleToken) !== "module" ||
      tokenName(ctx, nameToken) !== "ParserValueTokenIdentifier" ||
      region.anchorTokenIndex !== moduleToken.index ||
      region.spanStart !== moduleToken.start ||
      region.spanEnd !== nameToken.end) {
    return null;
  }
  const regionTokens = tokensInSpan(ctx, region.spanStart, region.spanEnd);
  return regionTokens.length === 2 &&
      regionTokens[0] === moduleToken &&
      regionTokens[1] === nameToken
    ? region
    : null;
}

interface ModuleNewlineOccurrence {
  readonly count: number;
  readonly fact: Readonly<Record<string, unknown>>;
}

function trailingBlankLineCount(
  ctx: Ctx,
  finalToken: DriverToken,
  nextToken: DriverToken | undefined,
): number {
  if (nextToken !== undefined) {
    if (nextToken.index <= finalToken.index ||
        nextToken.line <= finalToken.line) {
      throw new Error(
        `module newline boundary invalid: ${finalToken.index}/${nextToken.index}`);
    }
    return nextToken.line - finalToken.line - 1;
  }
  const tail = Buffer.from(ctx.source, "utf8").subarray(finalToken.end);
  let newlineCount = 0;
  for (const byte of tail) {
    if (byte === 10) newlineCount += 1;
  }
  return Math.max(0, newlineCount - 1);
}

function moduleTopLevelDeclarations(
  ctx: Ctx,
): readonly DriverDeclaration[] {
  const moduleRows = new Set(
    ctx.declarations
      .filter((row) => row.kindText === "ParserDeclarationModule")
      .map((row) => row.index),
  );
  return ctx.declarations
    .filter((row) =>
      row.kindText !== "ParserDeclarationModule" &&
      (row.ownerDeclarationIndex === -1 ||
       moduleRows.has(row.ownerDeclarationIndex)))
    .sort((left, right) =>
      left.spanStart - right.spanStart || left.index - right.index);
}

function moduleImportOccurrences(
  ctx: Ctx,
): readonly {
  readonly importDeclarationRow: number;
  readonly edges: readonly DriverImportEdge[];
  readonly keyword: DriverToken;
  readonly finalToken: DriverToken;
  readonly nextToken: DriverToken | undefined;
}[] {
  const byDeclaration = new Map<number, DriverImportEdge[]>();
  for (const edge of ctx.importEdges) {
    const rows = byDeclaration.get(edge.importDeclarationRow) ?? [];
    rows.push(edge);
    byDeclaration.set(edge.importDeclarationRow, rows);
  }
  return [...byDeclaration.entries()]
    .map(([importDeclarationRow, edges]) => {
      const orderedEdges = edges.slice().sort(
        (left, right) => left.importItemRow - right.importItemRow);
      const keyword =
        ctx.receipt.tokens[orderedEdges[0]!.keywordTokenIndex]!;
      if (orderedEdges.some((edge) =>
          edge.keywordTokenIndex !== keyword.index ||
          edge.ownerProducerSourceIndex !==
            orderedEdges[0]!.ownerProducerSourceIndex)) {
        throw new Error(
          `module import declaration owner edge invalid: ${importDeclarationRow}`);
      }
      const lineTokens = ctx.receipt.tokens.filter((token) =>
        token.producerSourceIndex === keyword.producerSourceIndex &&
        token.sourceTextId === keyword.sourceTextId &&
        token.line === keyword.line &&
        token.index >= keyword.index);
      const finalToken = lineTokens[lineTokens.length - 1]!;
      const nextToken = ctx.receipt.tokens.find((token) =>
        token.producerSourceIndex === keyword.producerSourceIndex &&
        token.sourceTextId === keyword.sourceTextId &&
        token.line > keyword.line);
      return {
        importDeclarationRow,
        edges: orderedEdges,
        keyword,
        finalToken,
        nextToken,
      };
    })
    .sort((left, right) => left.keyword.index - right.keyword.index);
}

function moduleNewlineOccurrences(
  ctx: Ctx,
  path: string,
): readonly ModuleNewlineOccurrence[] {
  const sourceText = ctx.receipt.sourceTexts[0]!;
  if (path === "root.sequence0") {
    const first = ctx.receipt.tokens[0];
    return first === undefined
      ? []
      : [{
        count: first.line - 1,
        fact: {
          occurrence: "leading",
          firstTokenIdentitySha256:
            hitToken(ctx, first, "module-leading-boundary")
              .parserNodeIdentitySha256,
        },
      }];
  }
  if (path === "root.sequence1.optional0.sequence1") {
    const region = moduleHeaderRegion(ctx);
    const declaration = region === null
      ? undefined
      : ctx.declarations.find((row) =>
          row.kindText === "ParserDeclarationModule" &&
          row.spanStart === region.spanStart &&
          row.spanEnd === region.spanEnd);
    const regionTokens = region === null
      ? []
      : tokensInSpan(ctx, region.spanStart, region.spanEnd);
    const finalToken = regionTokens[regionTokens.length - 1];
    if (region === null || declaration === undefined ||
        finalToken === undefined) {
      return [];
    }
    const nextToken = ctx.receipt.tokens.find(
      (token) => token.index > finalToken.index);
    return [{
      count: trailingBlankLineCount(ctx, finalToken, nextToken),
      fact: {
        occurrence: "module-header",
        declarationIdentitySha256: declaration.identitySha256,
        regionIdentitySha256:
          hitRegion(ctx, region, "module-newline-header-region")
            .parserNodeIdentitySha256,
        finalTokenIdentitySha256:
          hitToken(ctx, finalToken, "module-newline-header-final")
            .parserNodeIdentitySha256,
        nextTokenIdentitySha256: nextToken === undefined
          ? null
          : hitToken(ctx, nextToken, "module-newline-header-next")
            .parserNodeIdentitySha256,
        sourceTextSha256: sourceText.sha256,
      },
    }];
  }
  if (path === "root.sequence2.repetition0.sequence1") {
    return moduleImportOccurrences(ctx).map((occurrence) => ({
      count: trailingBlankLineCount(
        ctx, occurrence.finalToken, occurrence.nextToken),
      fact: {
        occurrence: "import-declaration",
        importDeclarationRow: occurrence.importDeclarationRow,
        edgeIdentitySha256s:
          occurrence.edges.map((edge) => edge.identitySha256),
        keywordTokenIdentitySha256:
          hitToken(ctx, occurrence.keyword, "module-newline-import-keyword")
            .parserNodeIdentitySha256,
        finalTokenIdentitySha256:
          hitToken(ctx, occurrence.finalToken, "module-newline-import-final")
            .parserNodeIdentitySha256,
        nextTokenIdentitySha256: occurrence.nextToken === undefined
          ? null
          : hitToken(
            ctx,
            occurrence.nextToken,
            "module-newline-import-next",
          ).parserNodeIdentitySha256,
      },
    }));
  }
  if (path === "root.sequence3.repetition0.sequence1") {
    const declarations = moduleTopLevelDeclarations(ctx);
    return declarations.flatMap((declaration, ordinal) => {
      const declarationTokens =
        tokensInSpan(ctx, declaration.spanStart, declaration.spanEnd);
      const finalToken = declarationTokens[declarationTokens.length - 1];
      if (finalToken === undefined) return [];
      const nextDeclaration = declarations[ordinal + 1];
      const nextToken = nextDeclaration === undefined
        ? undefined
        : ctx.receipt.tokens.find((token) =>
            token.start >= nextDeclaration.spanStart &&
            token.end <= nextDeclaration.spanEnd);
      return [{
        count: trailingBlankLineCount(ctx, finalToken, nextToken),
        fact: {
          occurrence: "top-level-declaration",
          declarationIndex: declaration.index,
          declarationIdentitySha256: declaration.identitySha256,
          finalTokenIdentitySha256:
            hitToken(ctx, finalToken, "module-newline-declaration-final")
              .parserNodeIdentitySha256,
          nextDeclarationIdentitySha256:
            nextDeclaration?.identitySha256 ?? null,
          nextTokenIdentitySha256: nextToken === undefined
            ? null
            : hitToken(
              ctx,
              nextToken,
              "module-newline-declaration-next",
            ).parserNodeIdentitySha256,
        },
      }];
    });
  }
  return [];
}

function hasNodeKind(ctx: Ctx, kinds: readonly string[]): DriverNode | null {
  for (const kind of kinds) {
    const list = ctx.nodesByKind.get(kind);
    if (list !== undefined && list.length > 0) return list[0]!;
  }
  return null;
}

function sameKindAncestorCount(ctx: Ctx, node: DriverNode): number {
  let count = 0;
  let cursor = node.parent;
  while (cursor >= 0) {
    const parent = nodeAt(ctx, cursor);
    if (parent.kind === node.kind) count += 1;
    cursor = parent.parent;
  }
  return count;
}

// 表达式链递归只认 exact receipt token 栈；返回活跃左括号本身，
// 让最终 witness CID 绑定真实 delimiter identity，而不是只记录算出的深度。
function activeParenTokensAt(
  ctx: Ctx,
  node: DriverNode,
): readonly DriverToken[] {
  const stack: DriverToken[] = [];
  for (const t of ctx.receipt.tokens) {
    if (t.sourceTextId !== node.sourceTextId) continue;
    if (t.start >= node.spanStart) break;
    const name = tokenName(ctx, t);
    if (name === "ParserValueTokenLeftParen") {
      stack.push(t);
    } else if (name === "ParserValueTokenRightParen") {
      stack.pop();
    }
  }
  return stack;
}

// 语句递归: 同 keyword token 的缩进嵌套深度
function keywordNestDepth(ctx: Ctx, keywordKind: string): number {
  const tokens = tokensNamed(ctx, keywordKind);
  let maxDepth = 0;
  const stack: number[] = [];
  for (const t of tokens) {
    while (stack.length > 0 && t.column <= stack[stack.length - 1]!) stack.pop();
    stack.push(t.column);
    if (stack.length > maxDepth) maxDepth = stack.length;
  }
  return maxDepth;
}

// decl/语句递归使用 exact sourceText/span containment；禁止把源码行范围
// 或缩进列当 owner edge。最终 composite CID 同时绑定 root 与全部容器节点。
function functionLiteralOwnersOfStatementRoot(
  ctx: Ctx,
  root: DriverStatementRoot,
): readonly DriverNode[] {
  const rootNode = nodeAt(ctx, root.nodeIndex);
  return (ctx.nodesByKind.get("ParserValueExprFunctionLiteral") ?? [])
    .filter((owner) =>
      owner.sourceTextId === rootNode.sourceTextId &&
      owner.spanStart <= rootNode.spanStart &&
      rootNode.spanEnd <= owner.spanEnd)
    .sort((left, right) =>
      right.spanEnd - right.spanStart -
      (left.spanEnd - left.spanStart));
}

function lineFirstToken(ctx: Ctx): ReadonlyMap<number, DriverToken> {
  const map = new Map<number, DriverToken>();
  for (const t of ctx.receipt.tokens) {
    if (!map.has(t.line)) map.set(t.line, t);
  }
  return map;
}

// ---------------------------------------------------------------- 匹配结果
export type MatchCategory = "hit" | "no-evidence" | "unsupported";
export interface MatchHit {
  readonly kind: "hit";
  readonly charStart: number;
  readonly charEnd: number;
  readonly parserNodeKind: string;
  readonly parserNodeIdentitySha256: string;
  readonly channel: string;
}
export interface MatchMiss {
  readonly kind: "no-evidence" | "unsupported";
  readonly reason: string;
}
export type MatchResult = MatchHit | MatchMiss;

function hitNode(ctx: Ctx, node: DriverNode, channel: string): MatchHit {
  return {kind: "hit", charStart: node.spanStart, charEnd: node.spanEnd,
    parserNodeKind: node.kind, parserNodeIdentitySha256: node.identitySha256, channel};
}

function hitToken(ctx: Ctx, token: DriverToken, channel: string): MatchHit {
  const name = tokenName(ctx, token);
  const sourceText = ctx.receipt.sourceTexts[token.sourceTextId]!;
  return {kind: "hit", charStart: token.start, charEnd: token.end,
    parserNodeKind: name,
    parserNodeIdentitySha256: hashCanonical({
      domain: "cheng.parser_span_receipt.token",
      index: token.index,
      kind: token.kind,
      kindText: name,
      sourceTextId: token.sourceTextId,
      sourceSha256: sourceText.sha256,
      sourceByteLength: sourceText.byteLength,
      start: token.start,
      end: token.end,
      line: token.line,
      column: token.column,
      producerSourceIndex: token.producerSourceIndex,
      sourceLocalIndex: token.sourceLocalIndex,
      lexicalParentIndex: token.lexicalParentIndex,
    }),
    channel};
}

function hitRegion(ctx: Ctx, region: DriverRegion, channel: string): MatchHit {
  const sourceText = ctx.receipt.sourceTexts[region.sourceTextId]!;
  const anchor = ctx.receipt.tokens[region.anchorTokenIndex]!;
  return {kind: "hit", charStart: region.spanStart, charEnd: region.spanEnd,
    parserNodeKind: region.kind,
    parserNodeIdentitySha256: hashCanonical({
      domain: "cheng.parser_span_receipt.region",
      index: region.index,
      kind: region.kind,
      sourceTextId: region.sourceTextId,
      sourceSha256: sourceText.sha256,
      sourceByteLength: sourceText.byteLength,
      spanStart: region.spanStart,
      spanEnd: region.spanEnd,
      anchorTokenIndex: region.anchorTokenIndex,
      anchorTokenIdentitySha256:
        hitToken(ctx, anchor, "region-anchor").parserNodeIdentitySha256,
    }),
    channel};
}

function statementRootWitnessIdentity(
  ctx: Ctx,
  root: DriverStatementRoot,
): string {
  const node = nodeAt(ctx, root.nodeIndex);
  const anchor = ctx.receipt.tokens[root.anchorTokenIndex]!;
  const declarationIdentities: string[] = [];
  for (let offset = 0;
    offset < root.bindingDeclarationCount;
    offset += 1) {
    declarationIdentities.push(
      ctx.declarations[
        root.bindingDeclarationStart + offset
      ]!.identitySha256,
    );
  }
  return hashCanonical({
    domain: "cheng.parser_span_receipt.current_statement_root_witness",
    parserTraceRootSha256: ctx.receipt.parserTraceRootSha256,
    sourceSha256: ctx.receipt.sourceSha256,
    index: root.index,
    role: root.role,
    anchorTokenIndex: root.anchorTokenIndex,
    anchorTokenIdentitySha256:
      hitToken(
        ctx,
        anchor,
        "statement-root-anchor",
      ).parserNodeIdentitySha256,
    nodeIndex: root.nodeIndex,
    nodeIdentitySha256: node.identitySha256,
    bindingDeclarationStart: root.bindingDeclarationStart,
    bindingDeclarationCount: root.bindingDeclarationCount,
    bindingDeclarationIdentitySha256s: declarationIdentities,
    anchorLine: root.anchorLine,
    anchorColumn: root.anchorColumn,
    endLine: root.endLine,
    endColumn: root.endColumn,
  });
}

function hitSourceText(ctx: Ctx, channel: string): MatchHit {
  const sourceText = ctx.receipt.sourceTexts[0]!;
  const first = ctx.receipt.tokens[0];
  const last = ctx.receipt.tokens[ctx.receipt.tokens.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error("parser source-text witness requires canonical token extent");
  }
  return {
    kind: "hit",
    charStart: first.start,
    charEnd: last.end,
    parserNodeKind: "ParserValueExprSourceText",
    parserNodeIdentitySha256: hashCanonical({
      domain: "cheng.parser_span_receipt.source_text",
      sourceTextId: sourceText.sourceTextId,
      sourceSha256: sourceText.sha256,
      sourceByteLength: sourceText.byteLength,
      firstTokenIdentitySha256:
        hitToken(ctx, first, "source-first").parserNodeIdentitySha256,
      lastTokenIdentitySha256:
        hitToken(ctx, last, "source-last").parserNodeIdentitySha256,
    }),
    channel,
  };
}

function hitModuleSourceTextFact(
  ctx: Ctx,
  channel: string,
  fact: unknown,
): MatchHit {
  const sourceText = hitSourceText(ctx, channel);
  return {
    ...sourceText,
    parserNodeIdentitySha256: hashCanonical({
      domain:
        "cheng.parser_span_receipt.current_module_source_text_fact_witness",
      parserTraceRootSha256: ctx.receipt.parserTraceRootSha256,
      sourceSha256: ctx.receipt.sourceSha256,
      sourceTextIdentitySha256: sourceText.parserNodeIdentitySha256,
      fact,
    }),
  };
}

function hitModuleDeclaration(
  ctx: Ctx,
  declaration: DriverDeclaration,
  region: DriverRegion,
  channel: string,
): MatchHit {
  return {
    kind: "hit",
    charStart: declaration.spanStart,
    charEnd: declaration.spanEnd,
    parserNodeKind: declaration.kindText,
    parserNodeIdentitySha256: hashCanonical({
      domain:
        "cheng.parser_span_receipt.current_module_declaration_witness",
      parserTraceRootSha256: ctx.receipt.parserTraceRootSha256,
      sourceSha256: ctx.receipt.sourceSha256,
      declarationIdentitySha256: declaration.identitySha256,
      regionIdentitySha256:
        hitRegion(ctx, region, "module-header-region")
          .parserNodeIdentitySha256,
      tokens: tokensInSpan(
        ctx,
        region.spanStart,
        region.spanEnd,
      ).map((token) => ({
        index: token.index,
        cid: hitToken(
          ctx,
          token,
          "module-header-token",
        ).parserNodeIdentitySha256,
      })),
    }),
    channel,
  };
}

function hitConceptTraitDeclaration(
  ctx: Ctx,
  declaration: DriverDeclaration,
  region: DriverRegion,
  channel: string,
): MatchHit {
  const suiteScope =
    ctx.declarationLexicalScopes[declaration.suiteLexicalScopeIndex]!;
  const genericSymbols = declaration.genericSymbolStart < 0
    ? []
    : ctx.typeGenericSymbols.slice(
      declaration.genericSymbolStart,
      declaration.genericSymbolStart + declaration.genericSymbolCount,
    );
  return {
    kind: "hit",
    charStart: declaration.spanStart,
    charEnd: declaration.spanEnd,
    parserNodeKind: declaration.kindText,
    parserNodeIdentitySha256: hashCanonical({
      domain:
        "cheng.parser_span_receipt.current_concept_trait_declaration_witness",
      parserTraceRootSha256: ctx.receipt.parserTraceRootSha256,
      sourceSha256: ctx.receipt.sourceSha256,
      declarationIdentitySha256: declaration.identitySha256,
      headerRegionIdentitySha256:
        hitRegion(ctx, region, "concept-trait-header-region")
          .parserNodeIdentitySha256,
      suiteLexicalScopeIndex: suiteScope.index,
      suiteLexicalScopeIdentitySha256: suiteScope.identitySha256,
      genericSymbols: genericSymbols.map((symbol) => ({
        index: symbol.index,
        identitySha256: parserTypeGenericSymbolWitnessIdentity(symbol),
      })),
      headerTokens: tokensInSpan(
        ctx,
        region.spanStart,
        region.spanEnd,
      ).map((token) => ({
        index: token.index,
        cid: hitToken(
          ctx,
          token,
          "concept-trait-header-token",
        ).parserNodeIdentitySha256,
      })),
      suiteTokens: tokensInSpan(
        ctx,
        suiteScope.spanStart,
        suiteScope.spanEnd,
      ).map((token) => ({
        index: token.index,
        cid: hitToken(
          ctx,
          token,
          "concept-trait-suite-token",
        ).parserNodeIdentitySha256,
      })),
    }),
    channel,
  };
}

function hitAnnotation(
  _ctx: Ctx,
  annotation: DriverAnnotation,
  channel: string,
): MatchHit {
  return {
    kind: "hit",
    charStart: annotation.spanStart,
    charEnd: annotation.spanEnd,
    parserNodeKind: "ParserAnnotation",
    parserNodeIdentitySha256: annotation.identitySha256,
    channel,
  };
}

function hitAnnotationArg(
  _ctx: Ctx,
  arg: DriverAnnotationArg,
  channel: string,
): MatchHit {
  return {
    kind: "hit",
    charStart: arg.spanStart,
    charEnd: arg.spanEnd,
    parserNodeKind: arg.kindText,
    parserNodeIdentitySha256: arg.identitySha256,
    channel,
  };
}

function contextForParserOwnedRow(row: object): Ctx {
  const ctx = parserOwnedRowContext.get(row);
  if (ctx === undefined) {
    throw new Error("parser-owned witness row is not admitted");
  }
  return ctx;
}

function parserTypeSyntaxWitnessIdentity(
  row: DriverTypeSyntax,
): string {
  const ctx = contextForParserOwnedRow(row);
  const memo = new Map<number, string>();
  const constMemo = new Map<number, string>();
  const constWitness = (index: number): string => {
    const previous = constMemo.get(index);
    if (previous !== undefined) return previous;
    const current = ctx.typeConstExprs[index]!;
    const identity = hashCanonical({
      domain:
        "cheng.parser_span_receipt.current_type_const_expr_witness",
      row: current.index,
      rowIdentitySha256: current.identitySha256,
      tokenIdentitySha256: hitToken(
        ctx,
        ctx.receipt.tokens[current.tokenIndex]!,
        "type-const-expr-token",
      ).parserNodeIdentitySha256,
      left: current.leftChildIndex < 0
        ? null
        : constWitness(current.leftChildIndex),
      right: current.rightChildIndex < 0
        ? null
        : constWitness(current.rightChildIndex),
    });
    constMemo.set(index, identity);
    return identity;
  };
  const visit = (current: DriverTypeSyntax): string => {
    const previous = memo.get(current.index);
    if (previous !== undefined) return previous;
    const children = ctx.typeSyntaxChildren
      .slice(current.childStart, current.childStart + current.childCount)
      .map((index) => ({
        index,
        cid: visit(ctx.typeSyntaxes[index]!),
      }));
    const tokens = tokensInSpan(
      ctx,
      current.spanStart,
      current.spanEnd,
    ).map((token) => ({
      index: token.index,
      cid: hitToken(
        ctx,
        token,
        "type-syntax-witness-token",
      ).parserNodeIdentitySha256,
    }));
    const genericSymbols = current.genericSymbolStart < 0
      ? []
      : ctx.typeGenericSymbols
        .slice(
          current.genericSymbolStart,
          current.genericSymbolStart + current.genericSymbolCount,
        )
        .map((symbol) => ({
          index: symbol.index,
          identitySha256: symbol.identitySha256,
          childTypeSyntaxes: ctx.typeGenericSymbolChildren
            .slice(
              symbol.childStart,
              symbol.childStart + symbol.childCount,
            )
            .map((index) => ({
              index,
              witnessIdentitySha256: visit(ctx.typeSyntaxes[index]!),
            })),
        }));
    const bracketArgs = ctx.typeSyntaxBracketArgs
      .slice(
        current.bracketArgStart,
        current.bracketArgStart + current.bracketArgCount,
      )
      .map((arg) => ({
        index: arg.index,
        identitySha256: arg.identitySha256,
        typeSyntaxIndex: arg.typeSyntaxIndex,
        typeSyntaxWitnessIdentitySha256: arg.typeSyntaxIndex < 0
          ? null
          : visit(ctx.typeSyntaxes[arg.typeSyntaxIndex]!),
        constExprRootIndex: arg.constExprRootIndex,
        constExprWitnessIdentitySha256: arg.constExprRootIndex < 0
          ? null
          : constWitness(arg.constExprRootIndex),
      }));
    const enumVariants = current.enumVariantStart < 0
      ? []
      : ctx.typeEnumVariants
        .slice(
          current.enumVariantStart,
          current.enumVariantStart + current.enumVariantCount,
        )
        .map((variant) => ({
          index: variant.index,
          identitySha256: variant.identitySha256,
          nameTokenIdentitySha256: hitToken(
            ctx,
            ctx.receipt.tokens[variant.nameTokenIndex]!,
            "type-enum-variant-name",
          ).parserNodeIdentitySha256,
          payloadTypeSyntaxIndex: variant.payloadTypeSyntaxIndex,
          payloadTypeSyntaxIdentitySha256:
            variant.payloadTypeSyntaxIndex < 0
              ? null
              : visit(
                ctx.typeSyntaxes[
                  variant.payloadTypeSyntaxIndex]!,
              ),
        }));
    const ancestorEdges: Array<{
      readonly parentIndex: number;
      readonly parentIdentitySha256: string;
      readonly childOrdinal: number;
      readonly ownerTokenIdentitySha256: string;
      readonly declarationOwnerTokenIdentitySha256: string | null;
      readonly declarationOwnerTypeSyntaxIdentitySha256: string | null;
    }> = [];
    let descendantIndex = current.index;
    let parentIndex =
      ctx.typeSyntaxParents[descendantIndex] ?? -1;
    while (parentIndex >= 0) {
      const parent = ctx.typeSyntaxes[parentIndex]!;
      const childOrdinal = ctx.typeSyntaxChildren
        .slice(
          parent.childStart,
          parent.childStart + parent.childCount,
        )
        .indexOf(descendantIndex);
      if (childOrdinal < 0) {
        throw new Error(
          `type syntax witness ancestor edge invalid: ${descendantIndex}`);
      }
      ancestorEdges.push({
        parentIndex,
        parentIdentitySha256: parent.identitySha256,
        childOrdinal,
        ownerTokenIdentitySha256: hitToken(
          ctx,
          ctx.receipt.tokens[parent.ownerTokenIndex]!,
          "type-syntax-ancestor-owner",
        ).parserNodeIdentitySha256,
        declarationOwnerTokenIdentitySha256:
          parent.declarationOwnerTokenIndex < 0
            ? null
            : hitToken(
              ctx,
              ctx.receipt.tokens[
                parent.declarationOwnerTokenIndex]!,
              "type-syntax-ancestor-declaration-owner",
            ).parserNodeIdentitySha256,
        declarationOwnerTypeSyntaxIdentitySha256:
          parent.declarationOwnerIndex < 0
            ? null
            : ctx.typeSyntaxes[parent.declarationOwnerIndex]!
              .identitySha256,
      });
      descendantIndex = parentIndex;
      parentIndex =
        ctx.typeSyntaxParents[descendantIndex] ?? -1;
    }
    const declarationOwnerEdges: Array<{
      readonly childIndex: number;
      readonly ownerIndex: number;
      readonly ownerRowIdentitySha256: string;
      readonly ownerWitnessIdentitySha256: string | null;
      readonly selfOwnedRoot: boolean;
    }> = [];
    let declarationChild = current;
    const declarationOwnerSeen = new Set<number>();
    while (declarationChild.declarationOwnerIndex >= 0) {
      const ownerIndex = declarationChild.declarationOwnerIndex;
      const owner = ctx.typeSyntaxes[ownerIndex];
      const selfOwnedRoot = ownerIndex === declarationChild.index;
      if (owner === undefined ||
          (!selfOwnedRoot && declarationOwnerSeen.has(ownerIndex))) {
        throw new Error(
          `type syntax declaration-owner witness edge invalid: ${current.index}/${ownerIndex}`);
      }
      declarationOwnerEdges.push({
        childIndex: declarationChild.index,
        ownerIndex,
        ownerRowIdentitySha256: owner.identitySha256,
        ownerWitnessIdentitySha256:
          selfOwnedRoot ? null : visit(owner),
        selfOwnedRoot,
      });
      if (selfOwnedRoot) break;
      declarationOwnerSeen.add(ownerIndex);
      declarationChild = owner;
    }
    const identity = hashCanonical({
      domain: "cheng.parser_span_receipt.current_type_syntax_witness",
      parserTraceRootSha256: ctx.receipt.parserTraceRootSha256,
      sourceSha256: ctx.receipt.sourceSha256,
      row: current.index,
      rowIdentitySha256: current.identitySha256,
      ownerTokenIdentitySha256: hitToken(
        ctx,
        ctx.receipt.tokens[current.ownerTokenIndex]!,
        "type-syntax-owner",
      ).parserNodeIdentitySha256,
      declarationOwnerTokenIdentitySha256:
        current.declarationOwnerTokenIndex < 0
          ? null
          : hitToken(
            ctx,
            ctx.receipt.tokens[current.declarationOwnerTokenIndex]!,
            "type-syntax-declaration-owner",
          ).parserNodeIdentitySha256,
      declarationOwnerIndex: current.declarationOwnerIndex,
      declarationOwnerTypeSyntaxIdentitySha256:
        current.declarationOwnerIndex < 0
          ? null
          : ctx.typeSyntaxes[current.declarationOwnerIndex]!
            .identitySha256,
      declarationOwnerEdges,
      tokens,
      children,
      ancestorEdges,
      genericSymbols,
      bracketArgs,
      enumVariants,
    });
    memo.set(current.index, identity);
    return identity;
  };
  return visit(row);
}

function parserTypeGenericSymbolWitnessIdentity(
  row: DriverTypeGenericSymbol,
): string {
  const ctx = contextForParserOwnedRow(row);
  const typeIdentity = (index: number): string | null =>
    index < 0
      ? null
      : parserTypeSyntaxWitnessIdentity(ctx.typeSyntaxes[index]!);
  return hashCanonical({
    domain: "cheng.parser_span_receipt.current_type_generic_symbol_witness",
    parserTraceRootSha256: ctx.receipt.parserTraceRootSha256,
    sourceSha256: ctx.receipt.sourceSha256,
    row: row.index,
    rowIdentitySha256: row.identitySha256,
    declarationOwnerTokenIdentitySha256: hitToken(
      ctx,
      ctx.receipt.tokens[row.declarationOwnerTokenIndex]!,
      "type-generic-declaration-owner",
    ).parserNodeIdentitySha256,
    nameTokenIdentitySha256: hitToken(
      ctx,
      ctx.receipt.tokens[row.nameTokenIndex]!,
      "type-generic-name",
    ).parserNodeIdentitySha256,
    ownerDeclarationIndex: row.ownerDeclarationIndex,
    ownerDeclarationIdentitySha256:
      ctx.declarations[row.ownerDeclarationIndex]!.identitySha256,
    ownerTypeSyntax: typeIdentity(row.ownerTypeSyntaxIndex),
    constraintTypeSyntax: typeIdentity(row.constraintTypeSyntaxIndex),
    defaultTypeSyntax: typeIdentity(row.defaultTypeSyntaxIndex),
    children: ctx.typeGenericSymbolChildren
      .slice(row.childStart, row.childStart + row.childCount)
      .map((index) => ({
        index,
        cid: parserTypeSyntaxWitnessIdentity(ctx.typeSyntaxes[index]!),
      })),
  });
}

function parserPatternWitnessIdentity(row: DriverPattern): string {
  const ctx = contextForParserOwnedRow(row);
  const memo = new Map<number, string>();
  const visit = (current: DriverPattern): string => {
    const previous = memo.get(current.index);
    if (previous !== undefined) return previous;
    const ownerIdentitySha256 = current.ownerKind === 1
      ? hitRegion(
        ctx,
        ctx.receipt.regions[current.ownerRow]!,
        "pattern-owner-region",
      ).parserNodeIdentitySha256
      : current.ownerKind === 2
        ? hitNode(
          ctx,
          ctx.receipt.nodes[current.ownerRow]!,
          "pattern-owner-value-node",
        ).parserNodeIdentitySha256
        : null;
    const ancestors: {
      row: number;
      rowIdentitySha256: string;
      childOrdinal: number;
    }[] = [];
    let rootIndex = current.index;
    while (ctx.patternParents[rootIndex]! >= 0) {
      const parentIndex = ctx.patternParents[rootIndex]!;
      const parent = ctx.patterns[parentIndex]!;
      const childOrdinal = ctx.patternChildren
        .slice(parent.childStart, parent.childStart + parent.childCount)
        .indexOf(rootIndex);
      if (childOrdinal < 0) {
        throw new Error(
          `pattern witness ancestor edge invalid: ${rootIndex}/${parentIndex}`);
      }
      ancestors.push({
        row: parentIndex,
        rowIdentitySha256: parent.identitySha256,
        childOrdinal,
      });
      rootIndex = parentIndex;
    }
    const root = ctx.patterns[rootIndex]!;
    const rootOwnerIdentitySha256 = root.ownerKind === 1
      ? hitRegion(
        ctx,
        ctx.receipt.regions[root.ownerRow]!,
        "pattern-root-owner-region",
      ).parserNodeIdentitySha256
      : hitNode(
        ctx,
        ctx.receipt.nodes[root.ownerRow]!,
        "pattern-root-owner-value-node",
      ).parserNodeIdentitySha256;
    const identity = hashCanonical({
      domain: "cheng.parser_span_receipt.current_pattern_witness",
      parserTraceRootSha256: ctx.receipt.parserTraceRootSha256,
      sourceSha256: ctx.receipt.sourceSha256,
      row: current.index,
      rowIdentitySha256: current.identitySha256,
      ownerLexicalScopeIdentitySha256:
        ctx.declarationLexicalScopes[current.ownerLexicalScopeIndex]!
          .identitySha256,
      ownerKind: current.ownerKind,
      ownerRow: current.ownerRow,
      ownerIdentitySha256,
      ancestors,
      rootRow: root.index,
      rootRowIdentitySha256: root.identitySha256,
      rootOwnerKind: root.ownerKind,
      rootOwnerRow: root.ownerRow,
      rootOwnerIdentitySha256,
      bindingDeclarationIndex: current.bindingDeclarationIndex,
      bindingDeclarationIdentitySha256:
        current.bindingDeclarationIndex < 0
          ? null
          : ctx.declarations[current.bindingDeclarationIndex]!
            .identitySha256,
      typeSyntaxRootIdentitySha256: current.typeSyntaxRootIndex < 0
        ? null
        : parserTypeSyntaxWitnessIdentity(
          ctx.typeSyntaxes[current.typeSyntaxRootIndex]!,
        ),
      tokens: patternTokens(ctx, current).map((token) => ({
        index: token.index,
        cid: hitToken(
          ctx,
          token,
          "pattern-witness-token",
        ).parserNodeIdentitySha256,
      })),
      children: ctx.patternChildren
        .slice(current.childStart, current.childStart + current.childCount)
        .map((index) => ({
          index,
          cid: visit(ctx.patterns[index]!),
        })),
    });
    memo.set(current.index, identity);
    return identity;
  };
  return visit(row);
}

function hitTypeSyntax(row: DriverTypeSyntax, channel: string): MatchHit {
  return {
    kind: "hit",
    charStart: row.spanStart,
    charEnd: row.spanEnd,
    parserNodeKind: row.kindText,
    parserNodeIdentitySha256: parserTypeSyntaxWitnessIdentity(row),
    channel,
  };
}

function hitTypeSyntaxBracketArg(
  ctx: Ctx,
  row: DriverTypeSyntaxBracketArg,
  channel: string,
): MatchHit {
  const first = ctx.receipt.tokens[row.tokenStart]!;
  const final =
    ctx.receipt.tokens[row.tokenStart + row.tokenCount - 1]!;
  const owner = ctx.typeSyntaxes[row.ownerTypeSyntaxIndex]!;
  const typeSyntaxIdentitySha256 = row.typeSyntaxIndex < 0
    ? null
    : parserTypeSyntaxWitnessIdentity(
      ctx.typeSyntaxes[row.typeSyntaxIndex]!);
  const constExprIdentity = (
    index: number,
    memo = new Map<number, string>(),
  ): string => {
    const previous = memo.get(index);
    if (previous !== undefined) return previous;
    const current = ctx.typeConstExprs[index]!;
    const identity = hashCanonical({
      domain:
        "cheng.parser_span_receipt.current_type_const_expr_witness",
      row: current.index,
      rowIdentitySha256: current.identitySha256,
      tokenIdentitySha256: hitToken(
        ctx,
        ctx.receipt.tokens[current.tokenIndex]!,
        "type-const-expr-token",
      ).parserNodeIdentitySha256,
      left: current.leftChildIndex < 0
        ? null
        : constExprIdentity(current.leftChildIndex, memo),
      right: current.rightChildIndex < 0
        ? null
        : constExprIdentity(current.rightChildIndex, memo),
    });
    memo.set(index, identity);
    return identity;
  };
  return {
    kind: "hit",
    charStart: first.start,
    charEnd: final.end,
    parserNodeKind: row.typeSyntaxIndex >= 0
      ? "ParserTypeSyntaxBracketTypeArg"
      : "ParserTypeSyntaxBracketConstArg",
    parserNodeIdentitySha256: hashCanonical({
      domain:
        "cheng.parser_span_receipt.current_type_syntax_bracket_arg_witness",
      parserTraceRootSha256: ctx.receipt.parserTraceRootSha256,
      sourceSha256: ctx.receipt.sourceSha256,
      row: row.index,
      rowIdentitySha256: row.identitySha256,
      ownerTypeSyntaxIndex: owner.index,
      ownerTypeSyntaxIdentitySha256:
        parserTypeSyntaxWitnessIdentity(owner),
      ordinal: row.ordinal,
      tokens: ctx.receipt.tokens
        .slice(row.tokenStart, row.tokenStart + row.tokenCount)
        .map((token) => ({
          index: token.index,
          cid: hitToken(
            ctx,
            token,
            "type-bracket-arg-token",
          ).parserNodeIdentitySha256,
        })),
      typeSyntaxIdentitySha256,
      constExprIdentitySha256: row.constExprRootIndex < 0
        ? null
        : constExprIdentity(row.constExprRootIndex),
    }),
    channel,
  };
}

function hitTypeGenericSymbol(
  row: DriverTypeGenericSymbol,
  channel: string,
): MatchHit {
  return {
    kind: "hit",
    charStart: row.spanStart,
    charEnd: row.spanEnd,
    parserNodeKind: "ParserTypeGenericSymbol",
    parserNodeIdentitySha256:
      parserTypeGenericSymbolWitnessIdentity(row),
    channel,
  };
}

function hitPattern(row: DriverPattern, channel: string): MatchHit {
  return {
    kind: "hit",
    charStart: row.spanStart,
    charEnd: row.spanEnd,
    parserNodeKind: row.kindText,
    parserNodeIdentitySha256: parserPatternWitnessIdentity(row),
    channel,
  };
}

function typeSyntaxChildren(ctx: Ctx, row: DriverTypeSyntax): readonly DriverTypeSyntax[] {
  return ctx.typeSyntaxChildren
    .slice(row.childStart, row.childStart + row.childCount)
    .map((child) => ctx.typeSyntaxes[child]!);
}

function typeSyntaxTokens(ctx: Ctx, row: DriverTypeSyntax): readonly DriverToken[] {
  return ctx.receipt.tokens.filter((token) =>
    token.producerSourceIndex === row.producerSourceIndex &&
    token.sourceTextId === row.sourceTextId &&
    token.start >= row.spanStart && token.end <= row.spanEnd);
}

function typeSyntaxFirstChild(
  ctx: Ctx,
  row: DriverTypeSyntax,
): DriverTypeSyntax | undefined {
  const child = ctx.typeSyntaxChildren[row.childStart];
  return child === undefined ? undefined : ctx.typeSyntaxes[child];
}

function exactNominalTypeText(
  ctx: Ctx,
  row: DriverTypeSyntax,
  text: string,
): boolean {
  const name = ctx.receipt.tokens[row.nameTokenIndex];
  return row.kindText === "ParserTypeSyntaxNominal" &&
    row.childCount === 0 &&
    name !== undefined &&
    (tokenName(ctx, name) === "ParserValueTokenIdentifier" ||
     (text === "set" &&
      tokenName(ctx, name) === "ParserValueTokenSet")) &&
    tokenText(ctx, name) === text &&
    name.start === row.spanStart &&
    name.end === row.spanEnd;
}

function exactSetTypeSyntax(
  ctx: Ctx,
  row: DriverTypeSyntax,
): boolean {
  if (row.kindText !== "ParserTypeSyntaxBracketApply" ||
      row.childCount !== 2 ||
      row.bracketArgCount !== 1) {
    return false;
  }
  const base = typeSyntaxFirstChild(ctx, row);
  const arg = ctx.typeSyntaxBracketArgs[row.bracketArgStart];
  const typeArg = arg === undefined || arg.typeSyntaxIndex < 0
    ? undefined
    : ctx.typeSyntaxes[arg.typeSyntaxIndex];
  const children = typeSyntaxChildren(ctx, row);
  return base !== undefined &&
    exactNominalTypeText(ctx, base, "set") &&
    arg !== undefined &&
    arg.ownerTypeSyntaxIndex === row.index &&
    arg.ordinal === 0 &&
    arg.typeSyntaxIndex >= 0 &&
    arg.constExprRootIndex === -1 &&
    typeArg !== undefined &&
    children[1]?.index === typeArg.index;
}

function exactTypeProductionSyntax(
  ctx: Ctx,
  production: string,
  row: DriverTypeSyntax,
): boolean {
  switch (production) {
    case "objectType":
      return objectTypeSurface(ctx, row) === "explicit";
    case "implicitObjectType":
      return objectTypeSurface(ctx, row) === "implicit";
    case "procType":
      return row.kindText === "ParserTypeSyntaxFunction";
    case "tupleType":
      return row.kindText === "ParserTypeSyntaxTuple";
    case "setType":
      return exactSetTypeSyntax(ctx, row);
    case "enumType":
      return row.kindText === "ParserTypeSyntaxEnum";
    case "refType":
      return row.kindText === "ParserTypeSyntaxRefObject";
    case "varType":
      return row.kindText === "ParserTypeSyntaxVarBorrow";
    case "algebraicType":
      return row.kindText === "ParserTypeSyntaxAlgebraic";
    case "variantType":
      return row.kindText === "ParserTypeSyntaxVariant";
    case "typePrimary":
      return row.kindText === "ParserTypeSyntaxNominal" ||
        row.kindText === "ParserTypeSyntaxGrouped";
    case "typePostfix":
      return [
        "ParserTypeSyntaxNominal",
        "ParserTypeSyntaxQualified",
        "ParserTypeSyntaxBracketApply",
        "ParserTypeSyntaxSeq",
        "ParserTypeSyntaxFixedArray",
        "ParserTypeSyntaxGrouped",
        "ParserTypeSyntaxOptional",
      ].includes(row.kindText);
    case "typeExpr":
      return [
        "ParserTypeSyntaxFunction",
        "ParserTypeSyntaxTuple",
        "ParserTypeSyntaxEnum",
        "ParserTypeSyntaxRefObject",
        "ParserTypeSyntaxVarBorrow",
        "ParserTypeSyntaxAlgebraic",
      ].includes(row.kindText) ||
        exactSetTypeSyntax(ctx, row) ||
        exactTypeProductionSyntax(ctx, "typePostfix", row);
    default:
      return false;
  }
}

function functionTypeReturnChild(
  ctx: Ctx,
  row: DriverTypeSyntax,
): DriverTypeSyntax | undefined {
  if (row.kindText !== "ParserTypeSyntaxFunction") return undefined;
  const marker = ctx.receipt.tokens[row.nameTokenIndex];
  const open = marker === undefined
    ? undefined
    : ctx.receipt.tokens[marker.index + 1];
  const closeIndex = open === undefined
    ? -1
    : matchingTokenIndex(
      ctx.receipt.tokens,
      ctx.tokenNames,
      open.index,
      "ParserValueTokenLeftParen",
      "ParserValueTokenRightParen",
    );
  const close = ctx.receipt.tokens[closeIndex];
  if (close === undefined) return undefined;
  return typeSyntaxChildren(ctx, row).find(
    (child) => child.spanStart > close.end);
}

function enumTypeVariants(
  ctx: Ctx,
  row: DriverTypeSyntax,
): readonly DriverTypeEnumVariant[] {
  return row.enumVariantStart < 0
    ? []
    : ctx.typeEnumVariants.slice(
      row.enumVariantStart,
      row.enumVariantStart + row.enumVariantCount,
    );
}

type ObjectTypeSurface = "implicit" | "explicit";

export function parserReceiptObjectTypeSurface(
  kindText: string,
  markerKindText: string | null,
): ObjectTypeSurface | null {
  if (kindText === "ParserTypeSyntaxImplicitObject") return "implicit";
  if (kindText === "ParserTypeSyntaxObject") {
    if (markerKindText === "ParserValueTokenOf") return "implicit";
    if (markerKindText === "ParserValueTokenObject") return "explicit";
  }
  if (kindText === "ParserTypeSyntaxRefObject" &&
      markerKindText === "ParserValueTokenRef") {
    return "explicit";
  }
  return null;
}

function objectTypeSurface(
  ctx: Ctx,
  row: DriverTypeSyntax,
): ObjectTypeSurface | null {
  const marker = ctx.receipt.tokens[row.nameTokenIndex];
  return parserReceiptObjectTypeSurface(
    row.kindText,
    marker === undefined ? null : tokenName(ctx, marker),
  );
}

function objectTypeOfToken(
  ctx: Ctx,
  row: DriverTypeSyntax,
): DriverToken | undefined {
  return typeSyntaxTokens(ctx, row).find(
    (token) => tokenName(ctx, token) === "ParserValueTokenOf");
}

function objectTypeColonToken(
  ctx: Ctx,
  row: DriverTypeSyntax,
): DriverToken | undefined {
  const owner = ctx.receipt.tokens[row.declarationOwnerTokenIndex];
  if (owner === undefined) return undefined;
  const assign = ctx.receipt.tokens.find((token) =>
    token.sourceTextId === row.sourceTextId &&
    token.line === owner.line &&
    token.start >= owner.end &&
    tokenName(ctx, token) === "ParserValueTokenAssign");
  if (assign === undefined) return undefined;
  const markerStart = Math.max(row.spanEnd, assign.end);
  return ctx.receipt.tokens.find((token) =>
    token.sourceTextId === row.sourceTextId &&
    token.line === owner.line &&
    token.start >= markerStart &&
    tokenName(ctx, token) === "ParserValueTokenColon");
}

function objectTypeFieldBlock(
  ctx: Ctx,
  row: DriverTypeSyntax,
): DriverRegion | undefined {
  if (row.rootKind !== 3 ||
      row.declarationOwnerIndex !== row.index ||
      row.declarationOwnerTokenIndex < 0) {
    return undefined;
  }
  const owner = ctx.receipt.tokens[row.declarationOwnerTokenIndex];
  if (owner === undefined) return undefined;
  const headerFirst = ctx.receipt.tokens.find(
    (token) => token.line === owner.line);
  const bodyFirst = ctx.receipt.tokens.find(
    (token) => token.line > owner.line);
  if (headerFirst === undefined || bodyFirst === undefined ||
      bodyFirst.column <= headerFirst.column) {
    return undefined;
  }
  return ctx.receipt.regions.find((region) => {
    if (region.kind !== "ParserValueExprRegionFieldBlock") return false;
    const anchor = ctx.receipt.tokens[region.anchorTokenIndex];
    return anchor === bodyFirst &&
      region.sourceTextId === row.sourceTextId &&
      region.spanStart === bodyFirst.start;
  });
}

interface ConceptTraitDeclarationSurface {
  readonly declaration: DriverDeclaration;
  readonly region: DriverRegion;
}

function conceptTraitDeclarationSurfaces(
  ctx: Ctx,
  expectedKind: "ParserDeclarationConcept" | "ParserDeclarationTrait",
): readonly ConceptTraitDeclarationSurface[] {
  const expectedKeyword = expectedKind === "ParserDeclarationConcept"
    ? "ParserValueTokenConcept"
    : "ParserValueTokenTrait";
  const surfaces: ConceptTraitDeclarationSurface[] = [];
  for (const declaration of ctx.declarations) {
    if (declaration.kindText !== expectedKind) continue;
    const regions = ctx.receipt.regions.filter((row) =>
      row.kind === "ParserValueExprRegionConceptTraitHeader" &&
      row.spanStart === declaration.spanStart);
    if (regions.length !== 1) continue;
    const region = regions[0]!;
    const suiteScope =
      ctx.declarationLexicalScopes[declaration.suiteLexicalScopeIndex];
    const regionTokens =
      tokensInSpan(ctx, region.spanStart, region.spanEnd);
    const keywordToken = regionTokens[0];
    const nameToken = ctx.receipt.tokens[declaration.nameTokenIndex];
    const colonToken = regionTokens[regionTokens.length - 1];
    const genericSymbols = declaration.genericSymbolStart < 0
      ? []
      : ctx.typeGenericSymbols.slice(
        declaration.genericSymbolStart,
        declaration.genericSymbolStart + declaration.genericSymbolCount,
      );
    if (suiteScope === undefined ||
        keywordToken === undefined ||
        nameToken === undefined ||
        colonToken === undefined ||
        tokenName(ctx, keywordToken) !== expectedKeyword ||
        tokenName(ctx, nameToken) !== "ParserValueTokenIdentifier" ||
        tokenName(ctx, colonToken) !== "ParserValueTokenColon" ||
        declaration.nameTokenIndex !== keywordToken.index + 1 ||
        declaration.typeSyntaxRootIndex !== -1 ||
        declaration.functionRow !== -1 ||
        suiteScope.kindText !== "ParserDeclarationLexicalScopeBlock" ||
        suiteScope.ownerDeclarationIndex !== declaration.index ||
        suiteScope.spanStart < region.spanEnd ||
        suiteScope.spanEnd !== declaration.spanEnd ||
        genericSymbols.length !== declaration.genericSymbolCount ||
        genericSymbols.some((symbol, offset) =>
          symbol.ownerDeclarationIndex !== declaration.index ||
          symbol.declarationOwnerTokenIndex !==
            declaration.nameTokenIndex ||
          symbol.ordinal !== offset)) {
      continue;
    }
    surfaces.push({declaration, region});
  }
  return surfaces;
}

function declarationNestingDepth(
  ctx: Ctx,
  declaration: DriverDeclaration,
): number {
  let depth = 0;
  let ownerIndex = declaration.ownerDeclarationIndex;
  while (ownerIndex >= 0) {
    const owner = ctx.declarations[ownerIndex];
    if (owner === undefined) {
      throw new Error(
        `declaration nesting owner missing: ${declaration.index}/${ownerIndex}`);
    }
    if (owner.kindText !== "ParserDeclarationModule") depth += 1;
    ownerIndex = owner.ownerDeclarationIndex;
  }
  return depth;
}

interface ObjectFieldsSurface {
  readonly objectType: DriverTypeSyntax;
  readonly ownerDeclaration: DriverDeclaration;
  readonly fieldBlock: DriverRegion;
  readonly fields: readonly DriverDeclaration[];
  readonly depth: number;
  readonly spanStart: number;
  readonly spanEnd: number;
}

function objectFieldsAncestorDepth(
  ctx: Ctx,
  row: DriverTypeSyntax,
): number | null {
  let depth = 0;
  let ownerIndex = row.declarationOwnerIndex;
  if (ownerIndex === row.index) return 0;
  const seen = new Set<number>([row.index]);
  while (ownerIndex >= 0) {
    if (seen.has(ownerIndex)) return null;
    seen.add(ownerIndex);
    const owner = ctx.typeSyntaxes[ownerIndex];
    if (owner === undefined || objectTypeSurface(ctx, owner) === null) {
      return null;
    }
    depth += 1;
    if (owner.declarationOwnerIndex === owner.index) return depth;
    ownerIndex = owner.declarationOwnerIndex;
  }
  return null;
}

function objectFieldsSurfaces(
  ctx: Ctx,
): readonly ObjectFieldsSurface[] {
  const surfaces: ObjectFieldsSurface[] = [];
  for (const objectType of ctx.typeSyntaxes) {
    if (objectTypeSurface(ctx, objectType) === null ||
        objectType.rootKind === 0) {
      continue;
    }
    const ownerDeclarations = ctx.declarations.filter((declaration) =>
      declaration.typeSyntaxRootIndex === objectType.index &&
      declaration.kindText === "ParserDeclarationType");
    if (ownerDeclarations.length !== 1) continue;
    const ownerDeclaration = ownerDeclarations[0]!;
    const ownerTypeScopes = ctx.declarationLexicalScopes.filter((scope) =>
      scope.kindText === "ParserDeclarationLexicalScopeType" &&
      scope.ownerDeclarationIndex === ownerDeclaration.index &&
      scope.parentScopeIndex === ownerDeclaration.lexicalScopeIndex);
    if (ownerTypeScopes.length !== 1 ||
        ownerDeclaration.typeSyntaxRootIndex !== objectType.index ||
        objectType.declarationOwnerIndex !== objectType.index) {
      continue;
    }
    const ownerTypeScope = ownerTypeScopes[0]!;
    const fields = ctx.declarations.filter((declaration) => {
      if (declaration.kindText !== "ParserDeclarationField" ||
          declaration.ownerDeclarationIndex !== ownerDeclaration.index ||
          declaration.lexicalScopeIndex !== ownerTypeScope.index ||
          declaration.typeSyntaxRootIndex < 0) {
        return false;
      }
      const fieldType =
        ctx.typeSyntaxes[declaration.typeSyntaxRootIndex];
      return fieldType !== undefined &&
        ownerDeclaration.typeSyntaxRootIndex ===
          fieldType.declarationOwnerIndex &&
        fieldType.declarationOwnerIndex === objectType.index;
    }).sort((left, right) =>
      left.spanStart - right.spanStart || left.index - right.index);
    if (fields.length === 0) continue;
    if (fields.some((field, index) =>
          field.spanStart <= objectType.spanEnd ||
          field.spanEnd > ownerDeclaration.spanEnd ||
          (index > 0 &&
            fields[index - 1]!.spanEnd > field.spanStart))) {
      throw new Error(
        `driver object FieldBlock/direct owner join invalid: ${ownerDeclaration.index}`);
    }
    const spanStart = fields[0]!.spanStart;
    const spanEnd = fields[fields.length - 1]!.spanEnd;
    if (spanEnd !== ownerDeclaration.spanEnd) {
      throw new Error(
        `driver object FieldBlock/direct owner join invalid: ${ownerDeclaration.index}`);
    }
    const firstFieldName =
      ctx.receipt.tokens[fields[0]!.nameTokenIndex];
    const fieldBlocks = ctx.receipt.regions.filter((region) =>
      region.kind === "ParserValueExprRegionFieldBlock" &&
      region.sourceTextId === objectType.sourceTextId &&
      firstFieldName !== undefined &&
      region.anchorTokenIndex === firstFieldName.index &&
      region.spanStart === spanStart &&
      region.spanEnd === spanEnd);
    if (fieldBlocks.length !== 1) {
      throw new Error(
        `driver object FieldBlock/direct owner join invalid: ${ownerDeclaration.index}`);
    }
    const depth = objectFieldsAncestorDepth(ctx, objectType);
    if (depth === null) continue;
    surfaces.push({
      objectType,
      ownerDeclaration,
      fieldBlock: fieldBlocks[0]!,
      fields,
      depth,
      spanStart,
      spanEnd,
    });
  }
  return surfaces;
}

function hitObjectFieldsSurface(
  ctx: Ctx,
  surface: ObjectFieldsSurface,
  channel: string,
): MatchHit {
  return {
    kind: "hit",
    charStart: surface.fieldBlock.spanStart,
    charEnd: surface.fieldBlock.spanEnd,
    parserNodeKind: "ParserValueExprRegionFieldBlock",
    parserNodeIdentitySha256: hashCanonical({
      domain:
        "cheng.parser_span_receipt.current_object_fields_declaration_witness",
      parserTraceRootSha256: ctx.receipt.parserTraceRootSha256,
      sourceSha256: ctx.receipt.sourceSha256,
      objectType: {
        index: surface.objectType.index,
        identitySha256:
          parserTypeSyntaxWitnessIdentity(surface.objectType),
        declarationOwnerIndex:
          surface.objectType.declarationOwnerIndex,
      },
      ownerDeclaration: {
        index: surface.ownerDeclaration.index,
        identitySha256: surface.ownerDeclaration.identitySha256,
      },
      fieldBlockIdentitySha256:
        hitRegion(
          ctx,
          surface.fieldBlock,
          "object-fields-container",
        ).parserNodeIdentitySha256,
      directFieldCsr: surface.fields.map((field, ordinal) => {
        const fieldType = ctx.typeSyntaxes[field.typeSyntaxRootIndex]!;
        return {
          ordinal,
          declarationIndex: field.index,
          declarationIdentitySha256: field.identitySha256,
          typeSyntaxIndex: fieldType.index,
          typeSyntaxIdentitySha256:
            parserTypeSyntaxWitnessIdentity(fieldType),
          declarationOwnerIndex: fieldType.declarationOwnerIndex,
        };
      }),
      depth: surface.depth,
      spanStart: surface.spanStart,
      spanEnd: surface.spanEnd,
    }),
    channel,
  };
}

function typeSyntaxBracketArgTokens(
  ctx: Ctx,
  row: DriverTypeSyntaxBracketArg,
): readonly DriverToken[] {
  return ctx.receipt.tokens.slice(
    row.tokenStart, row.tokenStart + row.tokenCount);
}

function typeSyntaxSameKindAncestorDepth(ctx: Ctx, row: DriverTypeSyntax): number {
  let depth = 0;
  let parent = ctx.typeSyntaxParents[row.index] ?? -1;
  while (parent >= 0) {
    const parentRow = ctx.typeSyntaxes[parent]!;
    if (parentRow.kindText === row.kindText) depth += 1;
    parent = ctx.typeSyntaxParents[parent] ?? -1;
  }
  return depth;
}

function patternChildren(
  ctx: Ctx,
  row: DriverPattern,
): readonly DriverPattern[] {
  return ctx.patternChildren
    .slice(row.childStart, row.childStart + row.childCount)
    .map((child) => ctx.patterns[child]!);
}

function patternTokens(
  ctx: Ctx,
  row: DriverPattern,
): readonly DriverToken[] {
  return ctx.receipt.tokens.filter((token) =>
    token.producerSourceIndex === row.producerSourceIndex &&
    token.start >= row.spanStart &&
    token.end <= row.spanEnd &&
    token.start < row.spanEnd);
}

function patternNameTokenIsFormalIdentifier(
  ctx: Ctx,
  row: DriverPattern,
): boolean {
  const token = ctx.receipt.tokens[row.nameTokenIndex];
  return token !== undefined &&
    ["ParserValueTokenIdentifier",
      "ParserValueTokenBlock",
      "ParserValueTokenObject"].includes(tokenName(ctx, token));
}

function patternIsFormalLiteral(
  ctx: Ctx,
  row: DriverPattern,
): boolean {
  const token = ctx.receipt.tokens[row.nameTokenIndex];
  return row.kindText === "ParserPatternLiteral" &&
    token !== undefined &&
    ["ParserValueTokenInteger", "ParserValueTokenFloat",
      "ParserValueTokenString", "ParserValueTokenChar",
      "ParserValueTokenTrue", "ParserValueTokenFalse"].includes(
        tokenName(ctx, token));
}

function patternIsBareVariant(
  ctx: Ctx,
  row: DriverPattern,
): boolean {
  return row.kindText === "ParserPatternLiteral" &&
    patternNameTokenIsFormalIdentifier(ctx, row);
}

function patternIsVariantPayloadIdentifier(
  ctx: Ctx,
  row: DriverPattern,
): boolean {
  return (row.kindText === "ParserPatternBinding" ||
      patternIsBareVariant(ctx, row)) &&
    patternNameTokenIsFormalIdentifier(ctx, row) &&
    row.childCount === 0;
}

function patternConstructorClass(
  ctx: Ctx,
  row: DriverPattern,
): "variant" | "object" | null {
  if (row.kindText !== "ParserPatternConstructor") return null;
  const children = patternChildren(ctx, row);
  return children.every((child) =>
      patternIsVariantPayloadIdentifier(ctx, child))
    ? "variant"
    : "object";
}

function exactPatternProductionSyntax(
  ctx: Ctx,
  production: string,
  row: DriverPattern,
): boolean {
  if (production === "pattern") {
    return row.kindText !== "ParserPatternNamedField" &&
      row.kindText !== "ParserPatternInvalid";
  }
  if (production === "literalPattern") {
    return patternIsFormalLiteral(ctx, row);
  }
  if (production === "rangePattern") {
    return row.kindText === "ParserPatternRange";
  }
  if (production === "variantPattern") {
    return patternIsBareVariant(ctx, row) ||
      patternConstructorClass(ctx, row) === "variant";
  }
  if (production === "objectPattern") {
    return row.kindText === "ParserPatternConstructor";
  }
  if (production === "patternArg") {
    return row.kindText === "ParserPatternNamedField" ||
      exactPatternProductionSyntax(ctx, "pattern", row);
  }
  return false;
}

function patternAncestorDepth(ctx: Ctx, row: DriverPattern): number {
  let depth = 0;
  let parent = ctx.patternParents[row.index] ?? -1;
  while (parent >= 0) {
    depth += 1;
    parent = ctx.patternParents[parent] ?? -1;
  }
  return depth;
}

function typeSyntaxAncestorDepth(ctx: Ctx, row: DriverTypeSyntax): number {
  let depth = 0;
  let parent = ctx.typeSyntaxParents[row.index] ?? -1;
  while (parent >= 0) {
    depth += 1;
    parent = ctx.typeSyntaxParents[parent] ?? -1;
  }
  return depth;
}

function annotationRoots(ctx: Ctx, annotation: DriverAnnotation): readonly DriverAnnotationArg[] {
  return ctx.annotationArgRoots
    .slice(annotation.argRootStart, annotation.argRootStart + annotation.argRootCount)
    .map((row) => ctx.annotationArgs[row]!);
}

function annotationArgChildren(ctx: Ctx, arg: DriverAnnotationArg): readonly DriverAnnotationArg[] {
  return ctx.annotationArgChildren
    .slice(arg.childStart, arg.childStart + arg.childCount)
    .map((row) => ctx.annotationArgs[row]!);
}

function annotationSeparatorBetween(
  ctx: Ctx,
  left: DriverAnnotationArg,
  right: DriverAnnotationArg,
): DriverToken | undefined {
  return ctx.receipt.tokens.find((token) =>
    token.start >= left.spanEnd && token.end <= right.spanStart &&
    ["ParserValueTokenComma", "ParserValueTokenSemicolon"].includes(
      tokenName(ctx, token)));
}

function annotationTrailingComma(ctx: Ctx, arg: DriverAnnotationArg): DriverToken | undefined {
  const tokens = ctx.receipt.tokens.filter((token) =>
    token.start >= arg.spanStart && token.end <= arg.spanEnd);
  if (tokens.length < 2) return undefined;
  const close = tokens[tokens.length - 1]!;
  if (!["ParserValueTokenRightBracket", "ParserValueTokenRightBrace"]
      .includes(tokenName(ctx, close))) return undefined;
  const previous = tokens[tokens.length - 2]!;
  return tokenName(ctx, previous) === "ParserValueTokenComma"
    ? previous
    : undefined;
}

// role 命中必须保留 statementRoot 自身的 role/anchor/value-def/binding
// declaration 复合身份；底层 value node 不能冒充 statement-root witness。
function hitStatementRoot(ctx: Ctx, root: DriverStatementRoot, channel: string): MatchHit {
  const node = nodeAt(ctx, root.nodeIndex);
  const anchorTok = ctx.receipt.tokens[root.anchorTokenIndex];
  if (anchorTok === undefined ||
      anchorTok.sourceTextId !== node.sourceTextId ||
      anchorTok.line !== root.anchorLine ||
      anchorTok.column !== root.anchorColumn) {
    throw new Error(
      `driver statement root anchor authority invalid: ${root.index}`,
    );
  }
  return {
    kind: "hit",
    charStart: anchorTok.start,
    charEnd: anchorTok.end,
    parserNodeKind: root.role,
    parserNodeIdentitySha256: statementRootWitnessIdentity(ctx, root),
    channel,
  };
}

function hitStatementRootRecursion(
  ctx: Ctx,
  root: DriverStatementRoot,
  owners: readonly DriverNode[],
  channel: string,
): MatchHit {
  const base = hitStatementRoot(ctx, root, channel);
  return {
    ...base,
    parserNodeIdentitySha256: hashCanonical({
      domain:
        "cheng.parser_span_receipt.current_statement_root_recursion_witness",
      statementRootIdentitySha256: base.parserNodeIdentitySha256,
      functionLiteralOwners: owners.map((owner) => ({
        index: owner.index,
        identitySha256: owner.identitySha256,
      })),
    }),
  };
}

function hitNormalizedStatementFact(
  fact: DriverNormalizedStatementFact,
  channel: string,
): MatchHit {
  return {
    kind: "hit",
    charStart: fact.spanStart,
    charEnd: fact.spanEnd,
    parserNodeKind: fact.kindText,
    parserNodeIdentitySha256: fact.identitySha256,
    channel,
  };
}

function hitNormalizedScopeFact(
  ctx: Ctx,
  fact: DriverNormalizedScopeFact,
  channel: string,
): MatchHit {
  const anchor = ctx.receipt.tokens[fact.anchorTokenIndex]!;
  return {
    kind: "hit",
    charStart: anchor.start,
    charEnd: anchor.end,
    parserNodeKind: fact.kindText,
    parserNodeIdentitySha256: fact.identitySha256,
    channel,
  };
}

function hitImportEdge(
  edge: DriverImportEdge,
  channel: string,
): MatchHit {
  return {
    kind: "hit",
    charStart: edge.spanStart,
    charEnd: edge.spanEnd,
    parserNodeKind: "ParserImportEdge",
    parserNodeIdentitySha256: edge.identitySha256,
    channel,
  };
}

function hitParenRecursion(
  ctx: Ctx,
  node: DriverNode,
  activeParens: readonly DriverToken[],
  channel: string,
): MatchHit {
  const base = hitNode(ctx, node, channel);
  return {
    ...base,
    parserNodeIdentitySha256: hashCanonical({
      domain:
        "cheng.parser_span_receipt.current_paren_recursion_witness",
      valueNodeIdentitySha256: base.parserNodeIdentitySha256,
      activeParenTokenIdentitySha256s: activeParens.map((token) =>
        hitToken(
          ctx,
          token,
          "paren-recursion-delimiter",
        ).parserNodeIdentitySha256),
    }),
  };
}

function miss(reason: string): MatchMiss {return {kind: "no-evidence", reason};}
function unsup(reason: string): MatchMiss {return {kind: "unsupported", reason};}

// ---------------------------------------------------------------- 节点 kind 映射(映射表 node_kinds 中可直接匹配的 ParserValueExpr* 名)
export interface MapRow {
  readonly name: string;
  readonly node_kinds: readonly string[];
  readonly span_model?: string;
}

function mapNodeKinds(row: MapRow | undefined): readonly string[] {
  if (row === undefined) return [];
  return row.node_kinds.filter((k) => k.startsWith("ParserValueExpr") && !k.startsWith("ParserValueExprStatement") && !k.startsWith("ParserValueExprToken"));
}

// statement 类 PARTIAL production 的 role/keyword 证据表
const STMT_ROLE: Record<string, readonly string[]> = {
  bindingDecl: ["ParserValueExprStatementBindingInitializer"],
  bindingEntry: ["ParserValueExprStatementBindingInitializer"],
  assignStmt: ["ParserValueExprStatementAssignmentRhs"],
  returnStmt: ["ParserValueExprStatementReturnValue"],
  yieldStmt: ["ParserValueExprStatementYieldValue"],
  expressionStmt: ["ParserValueExprStatementExpression"],
  exprDecl: ["ParserValueExprStatementExpression"],
  ifStmt: ["ParserValueExprStatementCondition"],
  whileStmt: ["ParserValueExprStatementCondition"],
  whenStmt: ["ParserValueExprStatementCondition"],
  matchStmt: ["ParserValueExprStatementCondition"],
  caseStmt: ["ParserValueExprStatementCondition"],
  forStmt: ["ParserValueExprStatementLoopSource"],
  caseBranch: ["ParserValueExprStatementCaseGuard"],
  routineHead: ["ParserValueExprStatementParameterDefault", "ParserValueExprStatementWhereCondition"],
  paramList: ["ParserValueExprStatementParameterDefault"],
  param: ["ParserValueExprStatementParameterDefault"],
  fieldDecl: ["ParserValueExprStatementTypeDefault"],
  tupleElem: ["ParserValueExprStatementTypeDefault"],
  typeDecl: ["ParserValueExprStatementTypeDefault", "ParserValueExprStatementWhereCondition"],
  typeEntry: ["ParserValueExprStatementTypeDefault", "ParserValueExprStatementWhereCondition"],
  enumField: ["ParserValueExprStatementAssignmentRhs", "ParserValueExprStatementTypeDefault"],
  fnDecl: ["ParserValueExprStatementParameterDefault", "ParserValueExprStatementImplicitReturnValue"],
  fnStmt: ["ParserValueExprStatementParameterDefault", "ParserValueExprStatementImplicitReturnValue"],
  macroDecl: ["ParserValueExprStatementParameterDefault"],
  macroStmt: ["ParserValueExprStatementParameterDefault"],
  templateDecl: ["ParserValueExprStatementParameterDefault"],
  templateStmt: ["ParserValueExprStatementParameterDefault"],
  iteratorDecl: ["ParserValueExprStatementParameterDefault"],
  iteratorStmt: ["ParserValueExprStatementParameterDefault"],
  suite: ["__any__"],
  statement: ["__any__"],
  statementCore: ["__any__"],
  topLevelDecl: ["__any__"],
  topLevelCore: ["__any__"],
};

const STMT_KEYWORD: Record<string, readonly string[]> = {
  breakStmt: ["ParserValueTokenBreak"],
  continueStmt: ["ParserValueTokenContinue"],
  deferStmt: ["ParserValueTokenDefer"],
  blockStmt: ["ParserValueTokenBlock"],
  storage: ["ParserValueTokenLet", "ParserValueTokenVar", "ParserValueTokenConst"],
  annotations: ["ParserValueTokenAt"],
  annotation: ["ParserValueTokenAt"],
  importDecl: ["ParserValueTokenImport"],
  modulePath: ["ParserValueTokenImport"],
  matchArm: ["ParserValueTokenMatch"],
  caseEntry: ["ParserValueTokenOf", "ParserValueTokenElse"],
  caseBranch: ["ParserValueTokenOf", "ParserValueTokenElse"],
  fnEntry: ["ParserValueTokenFn"],
  iteratorDecl: ["ParserValueTokenIterator"],
  macroDecl: ["ParserValueTokenMacro"],
  macroStmt: ["ParserValueTokenMacro"],
  templateDecl: ["ParserValueTokenTemplate"],
  templateStmt: ["ParserValueTokenTemplate"],
  iteratorStmt: ["ParserValueTokenIterator"],
  templateBody: ["ParserValueTokenTemplate"],
};

// 二元层 production → 算子文本表
const LEVEL_OPS: Record<string, readonly string[]> = {
  logicalOr: ["||"], logicalAnd: ["&&"], bitwiseOr: ["|"], bitwiseXor: ["^"], bitwiseAnd: ["&"],
  equality: ["==", "!="], comparison: ["<", "<=", ">", ">="], membership: ["in", "notin"],
  rangeExpr: ["..", "..<"], sum: ["+", "-"], term: ["*", "/", "%"],
};

const PRIMARY_NODE_KINDS = new Set([
  "ParserValueExprIdentifier",
  "ParserValueExprIntegerLiteral",
  "ParserValueExprFloatLiteral",
  "ParserValueExprStringLiteral",
  "ParserValueExprCharLiteral",
  "ParserValueExprBoolLiteral",
  "ParserValueExprNilLiteral",
  "ParserValueExprFmtLiteral",
  "ParserValueExprTupleLiteral",
  "ParserValueExprListLiteral",
  "ParserValueExprBraceLiteral",
  "ParserValueExprFunctionLiteral",
  "ParserValueExprIteratorLiteral",
]);

const POSTFIX_ROOT_NODE_KINDS = new Set([
  ...PRIMARY_NODE_KINDS,
  "ParserValueExprUnary",
  "ParserValueExprComprehension",
  "ParserValueExprField",
  "ParserValueExprCall",
  "ParserValueExprIndex",
  "ParserValueExprSlice",
  "ParserValueExprTry",
]);

interface StructuredCaseArm {
  readonly region: DriverRegion;
  readonly ofToken: DriverToken;
  readonly colonToken: DriverToken;
  readonly spanStart: number;
  readonly spanEnd: number;
  readonly entries: readonly MatchHit[];
}

function hitStructuredCaseExpressionEntry(
  ctx: Ctx,
  region: DriverRegion,
  root: DriverStatementRoot,
  node: DriverNode,
): MatchHit {
  return {
    kind: "hit",
    charStart: node.spanStart,
    charEnd: node.spanEnd,
    parserNodeKind: node.kind,
    parserNodeIdentitySha256: hashCanonical({
      domain: "cheng.parser_span_receipt.structured_case_expression_entry",
      caseArmRegionIdentitySha256:
        hitRegion(ctx, region, "case-entry-region")
          .parserNodeIdentitySha256,
      statementRoot: {
        identitySha256:
          statementRootWitnessIdentity(ctx, root),
      },
      valueNodeIdentitySha256: node.identitySha256,
    }),
    channel: "case-entry:value-statement-root-in-case-arm",
  };
}

function structuredCaseArms(ctx: Ctx): readonly StructuredCaseArm[] {
  const out: StructuredCaseArm[] = [];
  for (const region of ctx.receipt.regions.filter(
    (entry) => entry.kind === "ParserValueExprRegionCaseArm")) {
    const tokens = tokensInSpan(ctx, region.spanStart, region.spanEnd);
    const firstRegionToken = tokens[0];
    const finalRegionToken = tokens[tokens.length - 1];
    const ofToken = firstRegionToken === undefined
      ? undefined
      : ctx.receipt.tokens[firstRegionToken.index - 1];
    const colonToken = finalRegionToken === undefined
      ? undefined
      : ctx.receipt.tokens[finalRegionToken.index + 1];
    if (firstRegionToken === undefined ||
        finalRegionToken === undefined ||
        ofToken === undefined ||
        colonToken === undefined ||
        region.anchorTokenIndex !== firstRegionToken.index ||
        tokenName(ctx, ofToken) !== "ParserValueTokenOf" ||
        tokenName(ctx, colonToken) !== "ParserValueTokenColon" ||
        ofToken.sourceTextId !== region.sourceTextId ||
        colonToken.sourceTextId !== region.sourceTextId ||
        ofToken.end > region.spanStart ||
        finalRegionToken.end !== region.spanEnd ||
        colonToken.start < region.spanEnd) {
      continue;
    }
    let parenDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;
    const segments: DriverToken[][] = [];
    let segment: DriverToken[] = [];
    for (const token of tokens) {
      const name = tokenName(ctx, token);
      if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0 &&
          name === "ParserValueTokenIf") {
        break;
      }
      if (name === "ParserValueTokenLeftParen") parenDepth += 1;
      else if (name === "ParserValueTokenRightParen") parenDepth -= 1;
      else if (name === "ParserValueTokenLeftBracket") bracketDepth += 1;
      else if (name === "ParserValueTokenRightBracket") bracketDepth -= 1;
      else if (name === "ParserValueTokenLeftBrace") braceDepth += 1;
      else if (name === "ParserValueTokenRightBrace") braceDepth -= 1;
      if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0 &&
          name === "ParserValueTokenComma") {
        if (segment.length > 0) segments.push(segment);
        segment = [];
      } else {
        segment.push(token);
      }
    }
    if (segment.length > 0) segments.push(segment);
    if (segments.length === 0) continue;
    const entries: MatchHit[] = [];
    let complete = true;
    for (const entryTokens of segments) {
      const first = entryTokens[0]!;
      const final = entryTokens[entryTokens.length - 1]!;
      const pattern = ctx.patterns.find((entry) =>
        entry.spanStart === first.start &&
        entry.spanEnd === final.end &&
        entry.ownerKind === 1 &&
        entry.ownerRow === region.index);
      if (pattern !== undefined) {
        entries.push(hitPattern(
          pattern, "case-entry:pattern-owner-edge-in-case-arm"));
        continue;
      }
      const statementRoots = ctx.receipt.statementRoots.filter((root) => {
        if (root.role !== "ParserValueExprStatementCaseEntry" ||
            root.anchorTokenIndex !== ofToken.index) {
          return false;
        }
        const node = nodeAt(ctx, root.nodeIndex);
        return node.sourceTextId === region.sourceTextId &&
          node.spanStart === first.start && node.spanEnd === final.end;
      });
      if (statementRoots.length === 1) {
        const statementRoot = statementRoots[0]!;
        const expression = nodeAt(ctx, statementRoot.nodeIndex);
        entries.push(hitStructuredCaseExpressionEntry(
          ctx, region, statementRoot, expression));
        continue;
      }
      complete = false;
      break;
    }
    if (complete) {
      out.push({
        region,
        ofToken,
        colonToken,
        spanStart: segments[0]![0]!.start,
        spanEnd:
          segments[segments.length - 1]![
            segments[segments.length - 1]!.length - 1]!.end,
        entries,
      });
    }
  }
  return out;
}

function structuredCaseEntry(
  ctx: Ctx,
  wanted: "pattern" | "expression" | "either",
): MatchHit | null {
  for (const arm of structuredCaseArms(ctx)) {
    for (const entry of arm.entries) {
      const pattern = entry.parserNodeKind.startsWith("ParserPattern");
      if (wanted === "either" ||
          (wanted === "pattern" && pattern) ||
          (wanted === "expression" && !pattern)) {
        return entry;
      }
    }
  }
  return null;
}

function hitStructuredCaseArm(
  ctx: Ctx,
  arm: StructuredCaseArm,
  channel: string,
): MatchHit {
  return {
    kind: "hit",
    charStart: arm.spanStart,
    charEnd: arm.spanEnd,
    parserNodeKind: "ParserStructuredCaseArm",
    parserNodeIdentitySha256: hashCanonical({
      domain: "cheng.parser_span_receipt.structured_case_arm",
      regionIdentitySha256:
        hitRegion(ctx, arm.region, "case-arm-region")
          .parserNodeIdentitySha256,
      ofTokenIdentitySha256:
        hitToken(ctx, arm.ofToken, "case-arm-of")
          .parserNodeIdentitySha256,
      colonTokenIdentitySha256:
        hitToken(ctx, arm.colonToken, "case-arm-colon")
          .parserNodeIdentitySha256,
      entries: arm.entries.map((entry, ordinal) => ({
        ordinal,
        kind: entry.parserNodeKind,
        identitySha256: entry.parserNodeIdentitySha256,
      })),
    }),
    channel,
  };
}

interface StructuredLValue {
  readonly region: DriverRegion;
  readonly node: DriverNode;
  readonly assignToken: DriverToken;
  readonly rhsRoot: DriverStatementRoot;
  readonly rhsNode: DriverNode;
  readonly hit: MatchHit;
}

function structuredLValues(ctx: Ctx): readonly StructuredLValue[] {
  const out: StructuredLValue[] = [];
  const writableSurfaceKinds = new Set([
    "ParserValueExprIdentifier",
    "ParserValueExprField",
    "ParserValueExprIndex",
  ]);
  for (const region of ctx.receipt.regions.filter(
    (entry) => entry.kind === "ParserValueExprRegionLValue")) {
    const nodes = ctx.receipt.nodes.filter((entry) =>
      entry.sourceTextId === region.sourceTextId &&
      entry.spanStart === region.spanStart &&
      entry.spanEnd === region.spanEnd &&
      entry.parent === -1 &&
      writableSurfaceKinds.has(entry.kind));
    if (nodes.length !== 1) continue;
    const node = nodes[0]!;
    const regionTokens = tokensInSpan(
      ctx,
      region.spanStart,
      region.spanEnd,
    );
    const finalRegionToken = regionTokens[regionTokens.length - 1];
    const assignToken = finalRegionToken === undefined
      ? undefined
      : ctx.receipt.tokens[finalRegionToken.index + 1];
    if (assignToken === undefined ||
        regionTokens.length === 0 ||
        region.anchorTokenIndex !== regionTokens[0]?.index ||
        node.tokenStart !== regionTokens[0]!.index ||
        node.tokenEnd !== finalRegionToken!.index + 1 ||
        finalRegionToken.end !== region.spanEnd ||
        tokenName(ctx, assignToken) !== "ParserValueTokenAssign" ||
        assignToken.sourceTextId !== region.sourceTextId ||
        assignToken.start < region.spanEnd) {
      continue;
    }
    const rhsToken = ctx.receipt.tokens[assignToken.index + 1];
    const rhsRoots = ctx.receipt.statementRoots.filter((root) => {
      if (root.role !== "ParserValueExprStatementAssignmentRhs" ||
          root.anchorTokenIndex !== assignToken.index) {
        return false;
      }
      const rootNode = ctx.receipt.nodes[root.nodeIndex];
      return rootNode !== undefined &&
        rhsToken !== undefined &&
        rootNode.sourceTextId === region.sourceTextId &&
        rootNode.tokenStart === rhsToken.index &&
        rootNode.spanStart === rhsToken.start &&
        rootNode.spanStart >= assignToken.end;
    });
    if (rhsRoots.length !== 1) continue;
    const rhsRoot = rhsRoots[0]!;
    const rhsNode = ctx.receipt.nodes[rhsRoot.nodeIndex]!;
    out.push({region, node, assignToken, rhsRoot, rhsNode, hit: {
      kind: "hit",
      charStart: region.spanStart,
      charEnd: region.spanEnd,
      parserNodeKind: "ParserStructuredLValue",
      parserNodeIdentitySha256: hashCanonical({
        domain: "cheng.parser_span_receipt.structured_lvalue",
        regionIdentitySha256:
          hitRegion(ctx, region, "lvalue-region")
            .parserNodeIdentitySha256,
        postfixNodeIdentitySha256: node.identitySha256,
        assignmentTokenIdentitySha256:
          hitToken(ctx, assignToken, "lvalue-assignment-token")
            .parserNodeIdentitySha256,
        assignmentRhsStatementRootIdentitySha256:
          statementRootWitnessIdentity(ctx, rhsRoot),
        assignmentRhsNodeIdentitySha256: rhsNode.identitySha256,
      }),
      channel: "lvalue:region-postfix-assign-rhs-exact-edge",
    }});
  }
  return out;
}

function structuredLValue(ctx: Ctx): MatchHit | null {
  return structuredLValues(ctx)[0]?.hit ?? null;
}

function structuredLValuePostfixDepth(
  ctx: Ctx,
  value: StructuredLValue,
): number {
  const postfixKinds = new Set([
    "ParserValueExprField",
    "ParserValueExprIndex",
  ]);
  let depth = 0;
  let node = value.node;
  while (postfixKinds.has(node.kind)) {
    const children = childrenOf(ctx, node);
    if (children.length === 0) return -1;
    depth += 1;
    node = children[0]!;
  }
  return node.kind === "ParserValueExprIdentifier" ? depth : -1;
}

function patternSubtreeDepth(ctx: Ctx, root: DriverPattern): number {
  let depth = 0;
  const stack: {row: DriverPattern; depth: number}[] =
    [{row: root, depth: 0}];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.depth > depth) depth = current.depth;
    for (const child of patternChildren(ctx, current.row)) {
      stack.push({row: child, depth: current.depth + 1});
    }
  }
  return depth;
}

interface ParameterListSurface {
  readonly keyword: DriverToken;
  readonly open: DriverToken;
  readonly close: DriverToken;
  readonly segments: readonly (readonly DriverToken[])[];
}

function parameterListSurfaces(ctx: Ctx): readonly ParameterListSurface[] {
  const out: ParameterListSurface[] = [];
  for (const keyword of tokensNamed(ctx, "ParserValueTokenFn")) {
    let bracketDepth = 0;
    let braceDepth = 0;
    let inBacktickName = false;
    let open: DriverToken | undefined;
    for (const token of ctx.receipt.tokens.slice(keyword.index + 1)) {
      if (token.line > keyword.line) break;
      const name = tokenName(ctx, token);
      if (name === "ParserValueTokenBacktick") {
        inBacktickName = !inBacktickName;
        continue;
      }
      if (inBacktickName) continue;
      if (name === "ParserValueTokenLeftBracket") bracketDepth += 1;
      else if (name === "ParserValueTokenRightBracket") bracketDepth -= 1;
      else if (name === "ParserValueTokenLeftBrace") braceDepth += 1;
      else if (name === "ParserValueTokenRightBrace") braceDepth -= 1;
      else if (name === "ParserValueTokenLeftParen" &&
               bracketDepth === 0 && braceDepth === 0) {
        open = token;
        break;
      }
      if (bracketDepth < 0 || braceDepth < 0 ||
          (bracketDepth === 0 && braceDepth === 0 &&
           name === "ParserValueTokenAssign")) {
        break;
      }
    }
    if (open === undefined) continue;
    let parenDepth = 0;
    bracketDepth = 0;
    braceDepth = 0;
    let close: DriverToken | undefined;
    const segments: DriverToken[][] = [];
    let segment: DriverToken[] = [];
    for (const token of ctx.receipt.tokens.slice(open.index)) {
      const name = tokenName(ctx, token);
      if (name === "ParserValueTokenLeftParen") {
        parenDepth += 1;
        if (parenDepth > 1) segment.push(token);
        continue;
      }
      if (name === "ParserValueTokenRightParen") {
        parenDepth -= 1;
        if (parenDepth === 0) {
          if (segment.length > 0) segments.push(segment);
          close = token;
          break;
        }
        segment.push(token);
        continue;
      }
      if (parenDepth !== 1) {
        if (parenDepth > 1) segment.push(token);
        continue;
      }
      if (name === "ParserValueTokenLeftBracket") bracketDepth += 1;
      else if (name === "ParserValueTokenRightBracket") bracketDepth -= 1;
      else if (name === "ParserValueTokenLeftBrace") braceDepth += 1;
      else if (name === "ParserValueTokenRightBrace") braceDepth -= 1;
      if (parenDepth === 1 && bracketDepth === 0 && braceDepth === 0 &&
          ["ParserValueTokenComma", "ParserValueTokenSemicolon"].includes(
            name)) {
        if (segment.length > 0) segments.push(segment);
        segment = [];
      } else {
        segment.push(token);
      }
    }
    if (close !== undefined) {
      out.push({keyword, open, close, segments});
    }
  }
  return out;
}

function parameterSegmentMarkers(
  ctx: Ctx,
  segment: readonly DriverToken[],
): {colon: DriverToken | null; assign: DriverToken | null} {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let colon: DriverToken | null = null;
  let assign: DriverToken | null = null;
  for (const token of segment) {
    const name = tokenName(ctx, token);
    if (name === "ParserValueTokenLeftParen") parenDepth += 1;
    else if (name === "ParserValueTokenRightParen") parenDepth -= 1;
    else if (name === "ParserValueTokenLeftBracket") bracketDepth += 1;
    else if (name === "ParserValueTokenRightBracket") bracketDepth -= 1;
    else if (name === "ParserValueTokenLeftBrace") braceDepth += 1;
    else if (name === "ParserValueTokenRightBrace") braceDepth -= 1;
    else if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      if (name === "ParserValueTokenAssign" && assign === null) {
        assign = token;
      } else if (name === "ParserValueTokenColon" &&
                 colon === null && assign === null) {
        colon = token;
      }
    }
  }
  return {colon, assign};
}

function parameterTypeSyntax(
  ctx: Ctx,
  segment: readonly DriverToken[],
  markers: ReturnType<typeof parameterSegmentMarkers>,
): DriverTypeSyntax | undefined {
  if (markers.colon === null) return undefined;
  const owner = segment.find(
    (token) => tokenName(ctx, token) === "ParserValueTokenIdentifier");
  const firstTypeToken = ctx.receipt.tokens[markers.colon.index + 1];
  const finalTypeToken = markers.assign === null
    ? segment[segment.length - 1]
    : ctx.receipt.tokens[markers.assign.index - 1];
  if (owner === undefined || firstTypeToken === undefined ||
      finalTypeToken === undefined ||
      firstTypeToken.index > finalTypeToken.index) {
    return undefined;
  }
  return ctx.typeSyntaxes.find((row) =>
    row.rootKind === 1 &&
    row.ownerTokenIndex === owner.index &&
    row.spanStart === firstTypeToken.start &&
    row.spanEnd === finalTypeToken.end);
}

function parameterDefaultRoot(
  ctx: Ctx,
  segment: readonly DriverToken[],
  markers: ReturnType<typeof parameterSegmentMarkers>,
): DriverStatementRoot | undefined {
  if (markers.assign === null) return undefined;
  const valueStart = ctx.receipt.tokens[markers.assign.index + 1];
  const segmentEnd = segment[segment.length - 1];
  if (valueStart === undefined || segmentEnd === undefined) return undefined;
  return ctx.receipt.statementRoots.find((root) => {
    if (root.role !== "ParserValueExprStatementParameterDefault" ||
        root.anchorLine !== markers.assign!.line ||
        root.anchorColumn !== markers.assign!.column) {
      return false;
    }
    const node = nodeAt(ctx, root.nodeIndex);
    return node.spanStart === valueStart.start &&
      node.spanEnd === segmentEnd.end;
  });
}
// 二元层 production → 下一级 production(用于 chain 递归/层级归属; 未用, 备查)

function armOperator(armFragment: string): string | null {
  const m = /^sequence\("([^"]+)"\)$/.exec(armFragment);
  return m === null ? null : m[1]!;
}

// ---------------------------------------------------------------- 匹配器
export function matchObligation(
  obligation: {readonly production: string; readonly kind: string; readonly structuralPath: string; readonly variant: string; readonly bound: number | null},
  ctx: Ctx,
  mapRow: MapRow | undefined,
): MatchResult {
  const P = obligation.production;
  const K = obligation.kind;
  if (K === "production") return matchProductionRoot(P, ctx, mapRow);
  if (K === "choice") return matchChoice(P, obligation, ctx, mapRow);
  if (K === "optional") return matchOptional(P, obligation, ctx, mapRow);
  if (K === "repetition") return matchRepetition(P, obligation, ctx, mapRow);
  if (K === "recursion") return matchRecursion(P, obligation.variant, ctx, mapRow);
  return unsup(`未知 obligation kind: ${K}`);
}

function matchProductionRoot(P: string, ctx: Ctx, mapRow: MapRow | undefined): MatchResult {
  if (P === "caseArm") {
    const arm = structuredCaseArms(ctx)[0];
    return arm === undefined
      ? miss("caseArm: 无完整 parser-owned entry 序列")
      : hitStructuredCaseArm(ctx, arm, "case-arm:structured-entries");
  }
  if (P === "caseEntry") {
    return structuredCaseEntry(ctx, "either") ??
      miss("caseEntry: CaseArm 内无 parser-owned Pattern/value 节点");
  }
  if (P === "lvalue") {
    return structuredLValue(ctx) ??
      miss("lvalue: LValue region 未连接同 span 的 writable postfix 节点");
  }
  if (P === "moduleHeader") {
    const region = moduleHeaderRegion(ctx);
    const regionTokens = region === null
      ? []
      : tokensInSpan(ctx, region.spanStart, region.spanEnd);
    const moduleToken = regionTokens[0];
    const nameToken = regionTokens[1];
    const declarations = ctx.declarations.filter((row) =>
      row.kindText === "ParserDeclarationModule");
    const declaration = declarations[0];
    if (region === null ||
        regionTokens.length !== 2 ||
        moduleToken === undefined ||
        nameToken === undefined ||
        tokenName(ctx, moduleToken) !== "ParserValueTokenModule" ||
        tokenText(ctx, moduleToken) !== "module" ||
        tokenName(ctx, nameToken) !== "ParserValueTokenIdentifier" ||
        declarations.length !== 1 ||
        declaration === undefined ||
        declaration.nameTokenIndex !== nameToken.index ||
        declaration.ownerDeclarationIndex !== -1 ||
        declaration.lexicalScopeIndex !== 0 ||
        declaration.functionRow !== -1 ||
        declaration.typeSyntaxRootIndex !== -1 ||
        declaration.genericSymbolStart !== -1 ||
        declaration.genericSymbolCount !== 0 ||
        declaration.suiteLexicalScopeIndex !== -1 ||
        declaration.mutableFlag !== 0 ||
        declaration.spanStart !== region.spanStart ||
        declaration.spanEnd !== region.spanEnd) {
      return miss(
        "moduleHeader: ModuleHeaderLine/token 与唯一 ParserDeclarationModule CID 未精确闭合",
      );
    }
    return hitModuleDeclaration(
      ctx,
      declaration,
      region,
      "module-header:declaration-region-token-cid",
    );
  }
  if (P === "conceptDecl" || P === "traitDecl" ||
      P === "conceptStmt" || P === "traitStmt") {
    const conceptProduction =
      P === "conceptDecl" || P === "conceptStmt";
    const expectedKind = conceptProduction
      ? "ParserDeclarationConcept"
      : "ParserDeclarationTrait";
    const surface = conceptTraitDeclarationSurfaces(
      ctx,
      expectedKind,
    )[0];
    if (surface === undefined) {
      return miss(`${P}: 无 ${expectedKind} declaration row`);
    }
    return hitConceptTraitDeclaration(
      ctx,
      surface.declaration,
      surface.region,
      `concept-trait-declaration-soa:${P}`,
    );
  }
  if (P === "objectFields") {
    const surface = objectFieldsSurfaces(ctx)[0];
    return surface === undefined
      ? miss(
          "objectFields: declaration/TypeSyntax/FieldBlock/direct-field CSR 未精确闭合")
      : hitObjectFieldsSurface(
          ctx,
          surface,
          "object-fields:declaration-type-region-csr",
        );
  }
  if (P === "typeParamList" || P === "typeParam") {
    const symbol = ctx.typeGenericSymbols[0];
    return symbol === undefined
      ? miss(`${P}: 无 parser-owned TypeGenericSymbol 行`)
      : hitTypeGenericSymbol(symbol, `type-generic-symbol-soa:${P}`);
  }
  if (P === "typeArg") {
    const arg = ctx.typeSyntaxBracketArgs[0];
    return arg === undefined
      ? miss("typeArg: 无 parser-owned TypeSyntaxBracketArg 行")
      : hitTypeSyntaxBracketArg(
          ctx, arg, "type-syntax-bracket-arg-soa:typeArg");
  }
  if (P === "enumFields") {
    const row = ctx.typeSyntaxes.find((entry) =>
      entry.kindText === "ParserTypeSyntaxEnum" &&
      entry.enumVariantStart >= 0 &&
      entry.enumVariantCount > 0);
    return row === undefined
      ? miss("enumFields: 无带精确 variant CSR 的 Enum TypeSyntax 行")
      : hitTypeSyntax(row, "type-syntax-soa:enumFields");
  }
  if ([
    "typeExpr",
    "objectType",
    "implicitObjectType",
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
  ].includes(P)) {
    const row = ctx.typeSyntaxes.find((entry) =>
      exactTypeProductionSyntax(ctx, P, entry));
    return row === undefined
      ? miss(`${P}: 无 parser-owned TypeSyntax 行`)
      : hitTypeSyntax(row, `type-syntax-soa:${P}`);
  }
  if (P === "pattern" || P === "variantPattern" ||
      P === "rangePattern" || P === "objectPattern" ||
      P === "patternArg" || P === "literalPattern") {
    const row = ctx.patterns.find((entry) =>
      exactPatternProductionSyntax(ctx, P, entry));
    return row === undefined
      ? miss(`${P}: 无 parser-owned Pattern 行`)
      : hitPattern(row, `pattern-soa:${P}`);
  }
  if (mapRow?.span_model === "type_syntax_span") {
    const wanted = mapRow.node_kinds.filter((kind) =>
      /^ParserTypeSyntax[A-Z]/.test(kind) &&
      kind !== "ParserTypeSyntaxKind" &&
      kind !== "ParserTypeSyntaxRootKind");
    const row = ctx.typeSyntaxes.find((entry) =>
      wanted.includes(entry.kindText));
    if (row !== undefined) {
      return hitTypeSyntax(row, `type-syntax-soa:${P}`);
    }
  }
  // 声明的 parser node kind 直接匹配。
  const kinds = mapNodeKinds(mapRow);
  if (kinds.length > 0) {
    const node = hasNodeKind(ctx, kinds);
    if (node !== null) return hitNode(ctx, node, "node-kind");
  }
  // 无独立 kind 的正式转发 production 必须落到其真实父/子边。
  if (P === "expression" || P === "conditionalExpr") {
    const root = ctx.receipt.statementRoots[0];
    if (root !== undefined) {
      return hitStatementRoot(
        ctx, root, `forwarding-root:${P}`);
    }
  }
  if (P === "factor" || P === "spacePrimary") {
    const node = ctx.receipt.nodes.find((entry) =>
      PRIMARY_NODE_KINDS.has(entry.kind));
    if (node !== undefined) {
      return hitNode(
        ctx,
        node,
        P === "factor"
          ? "factor-postfix-zero-suffix"
          : "space-primary-shared-primary-node",
      );
    }
  }
  if (P === "spaceAtom") {
    for (const call of ctx.nodesByKind.get("ParserValueExprSpaceCall") ?? []) {
      const argument = childrenOf(ctx, call)[1];
      if (argument !== undefined) {
        return hitNode(ctx, argument, "space-call-argument-root");
      }
    }
  }
  if (P === "tupleElement") {
    for (const tuple of ctx.nodesByKind.get(
      "ParserValueExprTupleLiteral") ?? []) {
      const element = childrenOf(ctx, tuple)[0];
      if (element !== undefined) {
        return hitNode(ctx, element, "tuple-literal-element-child");
      }
    }
  }
  // role / keyword / region / source-text record
  if (P === "module") {
    return hitSourceText(ctx, "source-text-record");
  }
  if (P === "annotations" || P === "annotation" || P === "annotationArgs") {
    const annotation = P === "annotationArgs"
      ? ctx.annotations.find((row) => row.argRootCount >= 0)
      : ctx.annotations[0];
    return annotation === undefined
      ? miss(`${P}: 无 parser-owned Annotation 行`)
      : hitAnnotation(ctx, annotation, `annotation-soa:${P}`);
  }
  const annotationKindByProduction: Readonly<Record<string, readonly string[]>> = {
    annotationArg: [
      "ParserAnnotationArgIdentifier", "ParserAnnotationArgNumber",
      "ParserAnnotationArgString", "ParserAnnotationArgCharacter",
      "ParserAnnotationArgBoolean", "ParserAnnotationArgKeyValue",
      "ParserAnnotationArgList", "ParserAnnotationArgDict",
    ],
    annotationList: ["ParserAnnotationArgList"],
    annotationDict: ["ParserAnnotationArgDict"],
    annotationEntry: ["ParserAnnotationArgKeyValue"],
  };
  const annotationKinds = annotationKindByProduction[P];
  if (annotationKinds !== undefined) {
    const arg = ctx.annotationArgs.find((row) => annotationKinds.includes(row.kindText));
    return arg === undefined
      ? miss(`${P}: 无 parser-owned AnnotationArg 行`)
      : hitAnnotationArg(ctx, arg, `annotation-arg-soa:${P}`);
  }
  if (P === "annotationKey") {
    const key = ctx.annotationArgs.find((row) => {
      const parent = ctx.annotationArgParents[row.index];
      if (parent === undefined || parent < 0 ||
          ctx.annotationArgs[parent]!.kindText !== "ParserAnnotationArgKeyValue") return false;
      return annotationArgChildren(ctx, ctx.annotationArgs[parent]!)[0]?.index === row.index;
    });
    return key === undefined
      ? miss("annotationKey: 无 parser-owned KeyValue key child")
      : hitAnnotationArg(ctx, key, "annotation-arg-soa:key");
  }
  const normalizedKindByProduction: Readonly<Record<string, string>> = {
    breakStmt: "NormalizedExprBreakStmt",
    continueStmt: "NormalizedExprContinueStmt",
    deferStmt: "NormalizedExprDeferStmt",
  };
  const normalizedKind = normalizedKindByProduction[P];
  if (normalizedKind !== undefined) {
    const fact = ctx.normalizedStatementFacts.find(
      (entry) => entry.kindText === normalizedKind);
    return fact === undefined
      ? miss(`${P}: 无 parser-owned normalized statement fact`)
      : hitNormalizedStatementFact(
          fact, `normalized-statement:${normalizedKind}`);
  }
  if (P === "suite") {
    const scope = ctx.normalizedScopeFacts.find(
      (entry) => entry.kindText !== "NormalizedScopeRoot");
    return scope === undefined
      ? miss("suite: 无 parser-owned normalized scope fact")
      : hitNormalizedScopeFact(
          ctx, scope, `normalized-scope:${scope.kindText}`);
  }
  if (P === "importDecl" || P === "modulePath") {
    const edge = ctx.importEdges[0];
    return edge === undefined
      ? miss(`${P}: 无 parser-owned resolved import edge`)
      : hitImportEdge(edge, `import-edge:${P}`);
  }
  const roles = STMT_ROLE[P];
  if (roles !== undefined) {
    const wanted = roles[0] === "__any__" ? null : new Set(roles);
    const root = ctx.receipt.statementRoots.find((s) => wanted === null || wanted.has(s.role));
    if (root !== undefined) return hitStatementRoot(ctx, root, `role:${root.role}`);
  }
  const keywords = STMT_KEYWORD[P];
  if (keywords !== undefined) {
    for (const name of keywords) {
      const list = tokensNamed(ctx, name);
      if (list.length > 0) return hitToken(ctx, list[0]!, `keyword:${name}`);
    }
  }
  // region 证据
  const regionKinds: Record<string, readonly string[]> = {
    routineHead: ["ParserValueExprRegionReturnType", "ParserValueExprRegionParamType", "ParserValueExprRegionTypeParamList"],
    typeDecl: ["ParserValueExprRegionTypeDeclHeader"],
    typeEntry: ["ParserValueExprRegionTypeDeclHeader"],
    fieldDecl: ["ParserValueExprRegionFieldDeclType", "ParserValueExprRegionFieldBlock"],
    param: ["ParserValueExprRegionParamType"],
    bindingEntry: ["ParserValueExprRegionPattern"],
    caseArm: ["ParserValueExprRegionCaseArm"],
    matchArm: ["ParserValueExprRegionCaseArm"],
    caseEntry: ["ParserValueExprRegionCaseArm"],
    assignStmt: ["ParserValueExprRegionLValue"],
  };
  const rk = regionKinds[P];
  if (rk !== undefined) {
    const region = ctx.receipt.regions.find((r) => rk.includes(r.kind));
    if (region !== undefined) return hitRegion(ctx, region, `region:${region.kind}`);
  }
  return miss(`production ${P} 无任何证据通道命中`);
}

function matchChoice(
  P: string,
  obligation: {readonly structuralPath: string; readonly variant: string; readonly bound: number | null},
  ctx: Ctx,
  mapRow: MapRow | undefined,
): MatchResult {
  const armIndex = obligation.bound;
  if (P === "implicitObjectType" || P === "objectType") {
    const surface: ObjectTypeSurface =
      P === "implicitObjectType" ? "implicit" : "explicit";
    const row = ctx.typeSyntaxes.find((entry) => {
      if (objectTypeSurface(ctx, entry) !== surface) return false;
      const hasFields = objectTypeFieldBlock(ctx, entry) !== undefined;
      return armIndex === 0 ? hasFields : armIndex === 1 ? !hasFields : false;
    });
    return row === undefined
      ? miss(`${P} choice ${armIndex} 缺声明根与 FieldBlock 精确连接`)
      : hitTypeSyntax(row, `${P}-choice:${armIndex}`);
  }
  if (P === "typeExpr") {
    const kindSets: readonly (readonly string[])[] = [
      ["ParserTypeSyntaxFunction"],
      ["ParserTypeSyntaxTuple"],
      ["ParserTypeSyntaxBracketApply"],
      ["ParserTypeSyntaxEnum"],
      ["ParserTypeSyntaxRefObject"],
      ["ParserTypeSyntaxVarBorrow"],
      ["ParserTypeSyntaxAlgebraic"],
      [
        "ParserTypeSyntaxNominal", "ParserTypeSyntaxQualified",
        "ParserTypeSyntaxBracketApply", "ParserTypeSyntaxSeq",
        "ParserTypeSyntaxFixedArray",
        "ParserTypeSyntaxGrouped",
        "ParserTypeSyntaxOptional",
      ],
    ];
    const kinds = armIndex === null ? undefined : kindSets[armIndex];
    const row = kinds === undefined
      ? undefined
      : ctx.typeSyntaxes.find((entry) => {
          if (!kinds.includes(entry.kindText)) return false;
          if (armIndex === 2) {
            return exactSetTypeSyntax(ctx, entry);
          }
          if (armIndex === 7) {
            return exactTypeProductionSyntax(
              ctx, "typePostfix", entry);
          }
          return true;
        });
    return row === undefined
      ? miss(`typeExpr choice ${armIndex} 缺精确 TypeSyntax kind`)
      : hitTypeSyntax(row, `type-expr-choice:${armIndex}`);
  }
  if (P === "tupleType") {
    const separator = armIndex === 0 ? "," : armIndex === 1 ? ";" : "";
    const row = ctx.typeSyntaxes.find((entry) => {
      if (!exactTypeProductionSyntax(ctx, P, entry) ||
          entry.childCount < 2) {
        return false;
      }
      const children = typeSyntaxChildren(ctx, entry);
      return children.slice(1).some((right, index) =>
        ctx.receipt.tokens.some((token) =>
          token.producerSourceIndex === entry.producerSourceIndex &&
          token.sourceTextId === entry.sourceTextId &&
          token.start >= children[index]!.spanEnd &&
          token.end <= right.spanStart &&
          tokenText(ctx, token) === separator));
    });
    return row === undefined
      ? miss(`tupleType choice ${separator} 缺精确 element child 邻接`)
      : hitTypeSyntax(row, `tuple-element-separator:${separator}`);
  }
  if (P === "enumType" &&
      obligation.structuralPath === "root.sequence1.optional0") {
    const row = ctx.typeSyntaxes.find((entry) => {
      if (!exactTypeProductionSyntax(ctx, P, entry)) return false;
      const marker = ctx.receipt.tokens[entry.nameTokenIndex];
      const variants = enumTypeVariants(ctx, entry);
      if (marker === undefined || variants.length === 0) return false;
      const firstName =
        ctx.receipt.tokens[variants[0]!.nameTokenIndex];
      if (firstName === undefined) return false;
      return armIndex === 0
        ? firstName.line === marker.line
        : armIndex === 1
          ? firstName.line > marker.line &&
            firstName.column > marker.column
          : false;
    });
    return row === undefined
      ? miss(`enumType choice ${armIndex} 缺 exact Enum variant row`)
      : hitTypeSyntax(row, `enum-fields-surface:${armIndex}`);
  }
  if (P === "typePostfix" &&
      obligation.structuralPath === "root.sequence1.repetition0") {
    const kinds: readonly (readonly string[])[] = [
      ["ParserTypeSyntaxQualified"],
      [
        "ParserTypeSyntaxBracketApply", "ParserTypeSyntaxSeq",
        "ParserTypeSyntaxFixedArray",
      ],
      [],
    ];
    const wanted = armIndex === null ? undefined : kinds[armIndex];
    const row = wanted === undefined
      ? undefined
      : ctx.typeSyntaxes.find((entry) => {
          if (armIndex === 2) {
            if (entry.kindText !== "ParserTypeSyntaxOptional" ||
                entry.questionTokenIndex < 0) return false;
            const question = ctx.receipt.tokens[entry.questionTokenIndex];
            return question !== undefined &&
              tokenName(ctx, question) === "ParserValueTokenQuestion" &&
              tokenText(ctx, question) === "?";
          }
          return wanted.includes(entry.kindText);
        });
    return row === undefined
      ? miss(`typePostfix choice ${armIndex} 缺精确 TypeSyntax/token`)
      : hitTypeSyntax(row, `type-postfix-choice:${armIndex}`);
  }
  if (P === "typePostfix" &&
      obligation.structuralPath.endsWith(
        "optional0.sequence1.repetition0.sequence0.group0")) {
    const separator = armIndex === 0 ? "," : armIndex === 1 ? ";" : "";
    const arg = ctx.typeSyntaxBracketArgs.find((entry) => {
      if (entry.ordinal <= 0) return false;
      const owner = ctx.typeSyntaxes[entry.ownerTypeSyntaxIndex];
      const separatorToken = ctx.receipt.tokens[entry.tokenStart - 1];
      return owner?.kindText === "ParserTypeSyntaxBracketApply" &&
        separatorToken !== undefined &&
        tokenText(ctx, separatorToken) === separator;
    });
    return arg === undefined
      ? miss(`typePostfix bracket separator ${separator} 缺精确 token`)
      : {
          ...hitTypeSyntaxBracketArg(
            ctx,
            arg,
            `type-postfix-bracket-separator:${separator}`,
          ),
          charStart: ctx.receipt.tokens[arg.tokenStart - 1]!.start,
          charEnd: ctx.receipt.tokens[arg.tokenStart - 1]!.end,
        };
  }
  if (P === "typePrimary") {
    const wanted = armIndex === 0
      ? "ParserTypeSyntaxNominal"
      : armIndex === 1
        ? "ParserTypeSyntaxGrouped"
        : "";
    const row = ctx.typeSyntaxes.find((entry) =>
      entry.kindText === wanted);
    return row === undefined
      ? miss(`typePrimary choice ${armIndex} 缺精确 TypeSyntax span`)
      : hitTypeSyntax(row, `type-primary-choice:${armIndex}`);
  }
  if (P === "typeArg") {
    const row = ctx.typeSyntaxBracketArgs.find((entry) => {
      const tokens = typeSyntaxBracketArgTokens(ctx, entry);
      if (armIndex === 0) {
        if (entry.typeSyntaxIndex < 0) return false;
        const typeRow = ctx.typeSyntaxes[entry.typeSyntaxIndex]!;
        return tokens.length !== 1 ||
          tokenName(ctx, tokens[0]!) !== "ParserValueTokenIdentifier" ||
          typeRow.kindText !== "ParserTypeSyntaxNominal";
      }
      if (armIndex === 1) {
        return entry.constExprRootIndex >= 0 &&
          tokens.length === 1 &&
          tokenName(ctx, tokens[0]!) === "ParserValueTokenInteger";
      }
      if (armIndex === 2) {
        return entry.typeSyntaxIndex >= 0 &&
          tokens.length === 1 &&
          tokenName(ctx, tokens[0]!) ===
            "ParserValueTokenIdentifier" &&
          ctx.typeSyntaxes[entry.typeSyntaxIndex]!.kindText ===
            "ParserTypeSyntaxNominal";
      }
      return false;
    });
    return row === undefined
      ? miss(`typeArg choice ${armIndex} 缺精确 bracket-argument 行`)
      : hitTypeSyntaxBracketArg(
          ctx, row, `type-arg-choice:${armIndex}`);
  }
  if (P === "typeParamList") {
    const separator = armIndex === 0 ? "," : armIndex === 1 ? ";" : "";
    const owner = ctx.typeSyntaxes.find((entry) => {
      if (entry.genericSymbolCount < 2) return false;
      const symbols = ctx.typeGenericSymbols.slice(
        entry.genericSymbolStart,
        entry.genericSymbolStart + entry.genericSymbolCount);
      for (let index = 1; index < symbols.length; index += 1) {
        if (ctx.receipt.tokens.some((token) =>
          token.start >= symbols[index - 1]!.spanEnd &&
          token.end <= symbols[index]!.spanStart &&
          tokenText(ctx, token) === separator)) return true;
      }
      return false;
    });
    const symbol = owner === undefined
      ? undefined
      : ctx.typeGenericSymbols[owner.genericSymbolStart];
    return symbol === undefined
      ? miss(`typeParamList separator ${separator} 缺精确 symbol 邻接`)
      : hitTypeGenericSymbol(
          symbol, `type-param-list-separator:${separator}`);
  }
  if (P === "pattern") {
    const kindByArm = [
      "ParserPatternBinding", "ParserPatternWildcard",
      "ParserPatternLiteral", "ParserPatternTuple",
      "ParserPatternSequence", "ParserPatternObject",
      "ParserPatternRange", "ParserPatternConstructor",
      "ParserPatternConstructor",
    ];
    const wanted = armIndex === null ? undefined : kindByArm[armIndex];
    const row = wanted === undefined
      ? undefined
      : ctx.patterns.find((entry) => {
          if (entry.kindText !== wanted) return false;
          if (armIndex === 7) return true;
          if (armIndex === 8) {
            return patternConstructorClass(ctx, entry) === "variant";
          }
          return true;
        });
    return row === undefined
      ? miss(`pattern choice ${armIndex} 缺精确 Pattern kind`)
      : hitPattern(row, `pattern-choice:${armIndex}`);
  }
  if (P === "literalPattern") {
    const tokenKindsByArm: readonly (readonly string[])[] = [
      ["ParserValueTokenInteger", "ParserValueTokenFloat"],
      ["ParserValueTokenString"],
      ["ParserValueTokenTrue", "ParserValueTokenFalse"],
      ["ParserValueTokenChar"],
    ];
    const tokenKinds = armIndex === null
      ? undefined
      : tokenKindsByArm[armIndex];
    const row = tokenKinds === undefined
      ? undefined
      : ctx.patterns.find((entry) => {
          if (!patternIsFormalLiteral(ctx, entry)) return false;
          const token = ctx.receipt.tokens[entry.nameTokenIndex];
          return token !== undefined &&
            tokenKinds.includes(tokenName(ctx, token));
        });
    return row === undefined
      ? miss(
          `literalPattern choice ${armIndex} 缺精确 Pattern/token owner 边`)
      : hitPattern(
          row,
          `literal-pattern-choice:${armIndex}`,
        );
  }
  if (P === "patternArg") {
    const row = armIndex === 1
      ? ctx.patterns.find(
          (entry) => entry.kindText === "ParserPatternNamedField")
      : ctx.patterns.find(
          (entry) => entry.kindText !== "ParserPatternNamedField");
    return row === undefined
      ? miss(`patternArg choice ${armIndex} 缺精确 Pattern kind`)
      : hitPattern(row, `pattern-arg-choice:${armIndex}`);
  }
  if (P === "rangePattern") {
    const operator = armIndex === 0 ? ".." : armIndex === 1 ? "..<" : "";
    const row = ctx.patterns.find((entry) =>
      entry.kindText === "ParserPatternRange" &&
      ctx.receipt.tokens.some((token) =>
        token.start >= entry.spanStart && token.end <= entry.spanEnd &&
        tokenText(ctx, token) === operator));
    return row === undefined
      ? miss(`rangePattern operator ${operator} 缺精确 Pattern span token`)
      : hitPattern(row, `range-pattern-choice:${operator}`);
  }
  if (P === "variantType") {
    const separator = armIndex === 0 ? "," : armIndex === 1 ? ";" : "";
    const row = ctx.typeSyntaxes.find((entry) => {
      if (entry.kindText !== "ParserTypeSyntaxVariant" ||
          entry.childCount < 2) return false;
      const children = typeSyntaxChildren(ctx, entry);
      return children.slice(1).some((right, index) =>
        ctx.receipt.tokens.some((token) =>
          token.start >= children[index]!.spanEnd &&
          token.end <= right.spanStart &&
          tokenText(ctx, token) === separator));
    });
    return row === undefined
      ? miss(`variantType choice ${separator} 缺精确 field child 邻接`)
      : hitTypeSyntax(row, `variant-field-separator:${separator}`);
  }
  if (P === "annotationArg") {
    const kinds = [
      "ParserAnnotationArgIdentifier", "ParserAnnotationArgNumber",
      "ParserAnnotationArgString", "ParserAnnotationArgCharacter",
      "ParserAnnotationArgBoolean", "ParserAnnotationArgKeyValue",
      "ParserAnnotationArgList", "ParserAnnotationArgDict",
    ];
    const wanted = armIndex === null ? undefined : kinds[armIndex];
    const arg = wanted === undefined
      ? undefined
      : ctx.annotationArgs.find((row) => row.kindText === wanted);
    return arg === undefined
      ? miss(`annotationArg 臂 ${armIndex} 缺 parser-owned kind`)
      : hitAnnotationArg(ctx, arg, `annotation-choice:${wanted}`);
  }
  if (P === "annotationKey") {
    const kinds = [
      "ParserAnnotationArgIdentifier", "ParserAnnotationArgString",
      "ParserAnnotationArgNumber", "ParserAnnotationArgBoolean",
    ];
    const wanted = armIndex === null ? undefined : kinds[armIndex];
    const arg = wanted === undefined
      ? undefined
      : ctx.annotationArgs.find((row) => {
          if (row.kindText !== wanted) return false;
          const parent = ctx.annotationArgParents[row.index];
          return parent !== undefined && parent >= 0 &&
            ctx.annotationArgs[parent]!.kindText === "ParserAnnotationArgKeyValue" &&
            annotationArgChildren(ctx, ctx.annotationArgs[parent]!)[0]?.index === row.index;
        });
    return arg === undefined
      ? miss(`annotationKey 臂 ${armIndex} 缺 parser-owned key child`)
      : hitAnnotationArg(ctx, arg, `annotation-key-choice:${wanted}`);
  }
  if (P === "annotationEntry") {
    const separator = armIndex === 0
      ? "ParserValueTokenColon"
      : armIndex === 1
        ? "ParserValueTokenAssign"
        : "";
    const entry = ctx.annotationArgs.find((row) =>
      row.kindText === "ParserAnnotationArgKeyValue" &&
      row.separatorTokenIndex >= 0 &&
      tokenName(ctx, ctx.receipt.tokens[row.separatorTokenIndex]!) ===
        separator);
    return entry === undefined
      ? miss(`annotationEntry separator ${separator} 缺 parser-owned KeyValue`)
      : hitAnnotationArg(
          ctx, entry, `annotation-entry-choice:${separator}`);
  }
  if (P === "annotationArgs") {
    const separator = armIndex === 0
      ? "ParserValueTokenComma"
      : armIndex === 1
        ? "ParserValueTokenSemicolon"
        : "";
    for (const annotation of ctx.annotations) {
      const roots = annotationRoots(ctx, annotation);
      for (let index = 1; index < roots.length; index += 1) {
        const token = annotationSeparatorBetween(ctx, roots[index - 1]!, roots[index]!);
        if (token !== undefined && tokenName(ctx, token) === separator) {
          return hitAnnotation(
            ctx, annotation, `annotation-args-choice:${separator}`);
        }
      }
    }
    return miss(`annotationArgs separator ${separator} 缺 parser-owned root adjacency`);
  }
  // 二元层算子臂
  const levelOps = LEVEL_OPS[P];
  if (levelOps !== undefined && obligation.structuralPath !== "root") {
    // 层内算子 choice(equality/comparison/.../term)
    const ops = levelOps;
    if (armIndex !== null && armIndex >= 0 && armIndex < ops.length) {
      const want = ops[armIndex]!;
      const node = (ctx.nodesByKind.get("ParserValueExprBinary") ?? [])
        .find((n) => binaryOperator(ctx, n) === want);
      if (node !== undefined) return hitNode(ctx, node, `binary-op:${want}`);
      return miss(`无算子 ${want} 的 Binary 节点`);
    }
  }
  // unary
  if (P === "unary") {
    if (armIndex === 0) {
      const atom = ctx.receipt.nodes.find((n) => n.kind !== "ParserValueExprUnary" && n.kind !== "ParserValueExprBinary" && n.childCount === 0);
      if (atom !== undefined) return hitNode(ctx, atom, "unary-arm:primary");
    }
    if (armIndex === 1) {
      const node = (ctx.nodesByKind.get("ParserValueExprUnary") ?? [])
        .find((n) => ["+", "-", "!", "~", "$", "^", "%"].includes(unaryOperator(ctx, n)));
      if (node !== undefined) return hitNode(ctx, node, "unary-arm:prefix");
    }
    if (armIndex === 2) {
      const node = (ctx.nodesByKind.get("ParserValueExprUnary") ?? [])
        .find((n) => unaryOperator(ctx, n) === "await");
      if (node !== undefined) return hitNode(ctx, node, "unary-arm:await");
    }
    if (armIndex === 5) {
      const node = hasNodeKind(ctx, ["ParserValueExprComprehension"]);
      if (node !== null) return hitNode(ctx, node, "unary-arm:comprehension");
    }
    // 前缀组内算子 choice(root.choice1.sequence0.group0): bound 为组内臂序
    const groupOps = ["+", "-", "!", "~", "$", "^", "%"];
    if (armIndex !== null && armIndex >= 0 && armIndex < groupOps.length) {
      const want = groupOps[armIndex]!;
      const node = (ctx.nodesByKind.get("ParserValueExprUnary") ?? [])
        .find((n) => unaryOperator(ctx, n) === want);
      if (node !== undefined) return hitNode(ctx, node, `unary-op:${want}`);
    }
    return miss(`unary 臂 ${armIndex} 无证据`);
  }
  // factor
  if (P === "factor") {
    const armKinds: Record<number, readonly string[]> = {
      0: ["ParserValueExprSpaceCall"],
      2: ["ParserValueExprWhen"],
      3: ["ParserValueExprIf"],
      4: ["ParserValueExprCase"],
    };
    if (armIndex === 1) {
      const postfix = ctx.receipt.nodes.find((entry) =>
        POSTFIX_ROOT_NODE_KINDS.has(entry.kind));
      if (postfix !== undefined) {
        return hitNode(ctx, postfix, "factor-arm:postfix-root");
      }
      return miss("factor postfix 臂缺 unary/primary/postfix 根");
    }
    const kinds = armKinds[armIndex ?? -1];
    if (kinds !== undefined) {
      const node = hasNodeKind(ctx, kinds);
      if (node !== null) return hitNode(ctx, node, `factor-arm:${kinds[0]}`);
      return miss(`factor 臂 ${armIndex} 节点缺失`);
    }
  }
  // postfix/spaceAtom 后缀臂
  if (P === "postfix" || P === "spaceAtom") {
    const armKinds: Record<number, readonly string[]> = {
      0: ["ParserValueExprField"],
      2: ["ParserValueExprCall"],
      3: ["ParserValueExprIndex"],
      4: ["ParserValueExprSlice"],
      5: ["ParserValueExprTry"],
    };
    if (obligation.structuralPath.endsWith("choice4.sequence2.group0") || obligation.structuralPath.endsWith("choice3.sequence2.group0")) {
      // 切片内 ../ ..< 臂
      const want = armIndex === 0 ? "ParserValueTokenRangeInclusive" : "ParserValueTokenRangeExclusive";
      const node = (ctx.nodesByKind.get("ParserValueExprSlice") ?? []).find((n) => {
        const kids = childrenOf(ctx, n);
        if (kids.length !== 3) return false;
        return ctx.receipt.tokens.some((t) => t.index >= kids[1]!.tokenEnd && t.index < kids[2]!.tokenStart && tokenName(ctx, t) === want);
      });
      if (node !== undefined) return hitNode(ctx, node, `slice-op:${want}`);
      return miss(`无 ${want} 切片`);
    }
    const kinds = armKinds[armIndex ?? -1];
    if (kinds !== undefined) {
      const node = hasNodeKind(ctx, kinds);
      if (node !== null) return hitNode(ctx, node, `postfix-arm:${kinds[0]}`);
      return miss(`postfix 臂 ${armIndex} 节点缺失`);
    }
  }
  // primary/spacePrimary 原子臂
  if (P === "primary" || P === "spacePrimary") {
    const armKinds: Record<number, readonly string[]> = {
      0: ["ParserValueExprIdentifier"],
      1: ["ParserValueExprIntegerLiteral", "ParserValueExprFloatLiteral"],
      2: ["ParserValueExprStringLiteral"],
      3: ["ParserValueExprCharLiteral"],
      4: ["ParserValueExprBoolLiteral"],
      5: ["ParserValueExprTupleLiteral"],
      6: ["ParserValueExprListLiteral"],
    };
    if (P === "primary") {
      armKinds[7] = ["ParserValueExprFunctionLiteral"];
      armKinds[8] = ["ParserValueExprIteratorLiteral"];
    } else {
      armKinds[7] = ["ParserValueExprBraceLiteral"];
      armKinds[8] = ["ParserValueExprFunctionLiteral"];
      armKinds[9] = ["ParserValueExprIteratorLiteral"];
    }
    if (armIndex === (P === "primary" ? 9 : 10)) {
      // 括号臂: 节点被紧邻括号包裹
      const node = ctx.receipt.nodes.find((n) => {
        const prev = ctx.receipt.tokens[n.tokenStart - 1];
        const next = ctx.receipt.tokens[n.tokenEnd];
        return prev !== undefined && next !== undefined &&
          tokenName(ctx, prev) === "ParserValueTokenLeftParen" &&
          tokenName(ctx, next) === "ParserValueTokenRightParen";
      });
      if (node !== undefined) return hitNode(ctx, node, "paren-arm(括号包裹节点)");
      return miss("无括号包裹节点");
    }
    const kinds = armKinds[armIndex ?? -1];
    if (kinds !== undefined) {
      const node = hasNodeKind(ctx, kinds);
      if (node !== null) return hitNode(ctx, node, `primary-arm:${kinds[0]}`);
      return miss(`primary 臂 ${armIndex} 节点缺失`);
    }
  }
  // boolLiteral
  if (P === "boolLiteral") {
    const want = armIndex === 0 ? "true" : "false";
    const node = (ctx.nodesByKind.get("ParserValueExprBoolLiteral") ?? [])
      .find((n) => utf8Slice(ctx.source, n.spanStart, n.spanEnd) === want);
    if (node !== undefined) return hitNode(ctx, node, `bool:${want}`);
    return miss(`无 ${want} 字面量`);
  }
  if (P === "stringLiteral") {
    const wantMultiline = armIndex === 1;
    const node = (ctx.nodesByKind.get("ParserValueExprStringLiteral") ?? [])
      .find((entry) => {
        const tokens = tokensInSpan(ctx, entry.spanStart, entry.spanEnd);
        if (tokens.length !== 1 ||
            tokenName(ctx, tokens[0]!) !== "ParserValueTokenString" ||
            tokens[0]!.start !== entry.spanStart ||
            tokens[0]!.end !== entry.spanEnd) return false;
        return tokenText(ctx, tokens[0]!).startsWith('"""') === wantMultiline;
    });
    if (node !== undefined) {
      return hitNode(
        ctx,
        node,
        wantMultiline ? "string:multiline" : "string:short",
      );
    }
    return miss(
      wantMultiline ? "无 MULTILINE_STRING token" : "无 SHORT_STRING token",
    );
  }
  // storage
  if (P === "storage") {
    const names = ["ParserValueTokenLet", "ParserValueTokenVar", "ParserValueTokenConst"];
    const want = names[armIndex ?? -1];
    if (want !== undefined) {
      const list = tokensNamed(ctx, want);
      if (list.length > 0) return hitToken(ctx, list[0]!, `storage:${want}`);
    }
    return miss(`storage 臂 ${armIndex} 缺失`);
  }
  // statementCore / topLevelCore 臂: 首 token 判别(语句行/顶层行)
  if (P === "statementCore" || P === "topLevelCore") {
    const arms = P === "statementCore"
      ? ["bindingDecl", "typeDecl", "assignStmt", "returnStmt", "yieldStmt", "breakStmt", "continueStmt", "deferStmt", "ifStmt", "matchStmt", "whileStmt", "forStmt", "caseStmt", "whenStmt", "blockStmt", "macroStmt", "templateStmt", "conceptStmt", "traitStmt", "fnStmt", "iteratorStmt", "expressionStmt"]
      : ["bindingDecl", "fnDecl", "iteratorDecl", "macroDecl", "templateDecl", "conceptDecl", "traitDecl", "typeDecl", "exprDecl"];
    const armName = arms[armIndex ?? -1];
    if (armName === undefined) return miss(`${P} 臂序号越界`);
    const keywordByArm: Record<string, readonly string[]> = {
      bindingDecl: ["ParserValueTokenLet", "ParserValueTokenVar", "ParserValueTokenConst"],
      typeDecl: ["ParserValueTokenType"], assignStmt: [], returnStmt: ["ParserValueTokenReturn"],
      yieldStmt: ["ParserValueTokenYield"], breakStmt: ["ParserValueTokenBreak"],
      continueStmt: ["ParserValueTokenContinue"], deferStmt: ["ParserValueTokenDefer"],
      ifStmt: ["ParserValueTokenIf"], matchStmt: ["ParserValueTokenMatch"],
      whileStmt: ["ParserValueTokenWhile"], forStmt: ["ParserValueTokenFor"],
      caseStmt: ["ParserValueTokenCase"], whenStmt: ["ParserValueTokenWhen"],
      blockStmt: ["ParserValueTokenBlock"], macroStmt: ["ParserValueTokenMacro"],
      templateStmt: ["ParserValueTokenTemplate"], conceptStmt: ["ParserValueTokenConcept"],
      traitStmt: ["ParserValueTokenTrait"], fnStmt: ["ParserValueTokenFn"],
      iteratorStmt: ["ParserValueTokenIterator"], fnDecl: ["ParserValueTokenFn"],
      iteratorDecl: ["ParserValueTokenIterator"], macroDecl: ["ParserValueTokenMacro"],
      templateDecl: ["ParserValueTokenTemplate"], conceptDecl: ["ParserValueTokenConcept"],
      traitDecl: ["ParserValueTokenTrait"],
    };
    const firstTokens = lineFirstToken(ctx);
    if (armName === "expressionStmt" || armName === "exprDecl") {
      const root = ctx.receipt.statementRoots.find((s) => s.role === "ParserValueExprStatementExpression" &&
        (P === "statementCore" || s.anchorColumn === 1));
      if (root !== undefined) return hitStatementRoot(ctx, root, `arm:${armName}`);
      return miss(`无 ${armName} role 事件`);
    }
    if (armName === "assignStmt") {
      const root = ctx.receipt.statementRoots.find((s) => s.role === "ParserValueExprStatementAssignmentRhs");
      if (root !== undefined) return hitStatementRoot(ctx, root, "arm:assignStmt");
      return miss("无 AssignmentRhs role 事件");
    }
    const wanted = keywordByArm[armName] ?? [];
    for (const [line, token] of firstTokens) {
      if (P === "topLevelCore" && token.column !== 1) continue;
      if (wanted.includes(tokenName(ctx, token))) {
        void line;
        return hitToken(ctx, token, `arm:${armName}`);
      }
    }
    return miss(`${P} 臂 ${armName} 无首 token 命中`);
  }
  // importDecl 两臂
  if (P === "importDecl") {
    for (const edge of ctx.importEdges) {
      const grouped = edge.prefixTokenCount > 0;
      if ((armIndex === 0 && !grouped) ||
          (armIndex === 1 && grouped)) {
        return hitImportEdge(
          edge,
          grouped
            ? "importDecl-arm:grouped-edge"
            : "importDecl-arm:plain-edge",
        );
      }
    }
    return miss(`importDecl 臂 ${armIndex} 无 resolved edge`);
  }
  // bindingDecl 两臂: 单行 vs 块
  if (P === "bindingDecl") {
    const storageTok = ctx.receipt.tokens.find((t) =>
      ["ParserValueTokenLet", "ParserValueTokenVar", "ParserValueTokenConst"].includes(tokenName(ctx, t)));
    if (storageTok === undefined) return miss("无 binding 行");
    const lineTokens = ctx.receipt.tokens.filter((t) => t.line === storageTok.line);
    if (armIndex === 0 && lineTokens.length > 1) return hitToken(ctx, storageTok, "bindingDecl-arm:inline");
    if (armIndex === 1 && lineTokens.length === 1) return hitToken(ctx, storageTok, "bindingDecl-arm:block");
    // 找另一种形态
    const all = ctx.receipt.tokens.filter((t) => ["ParserValueTokenLet", "ParserValueTokenVar", "ParserValueTokenConst"].includes(tokenName(ctx, t)));
    for (const tok of all) {
      const count = ctx.receipt.tokens.filter((t) => t.line === tok.line).length;
      if (armIndex === 0 && count > 1) return hitToken(ctx, tok, "bindingDecl-arm:inline");
      if (armIndex === 1 && count === 1) return hitToken(ctx, tok, "bindingDecl-arm:block");
    }
    return miss(`bindingDecl 臂 ${armIndex} 无证据`);
  }
  // fnDecl 两臂
  if (P === "fnDecl") {
    const fnToks = tokensNamed(ctx, "ParserValueTokenFn");
    for (const tok of fnToks) {
      const count = ctx.receipt.tokens.filter((t) => t.line === tok.line).length;
      if (armIndex === 0 && count > 1) return hitToken(ctx, tok, "fnDecl-arm:inline");
      if (armIndex === 1 && count === 1) return hitToken(ctx, tok, "fnDecl-arm:block");
    }
    return miss(`fnDecl 臂 ${armIndex} 无证据`);
  }
  // typeDecl/typeEntry 的 typeExpr|implicitObjectType 组臂。
  if (P === "typeDecl" || P === "typeEntry") {
    if (P === "typeDecl" &&
        obligation.structuralPath === "root") {
      for (const token of tokensNamed(ctx, "ParserValueTokenType")) {
        const lineTokenCount = ctx.receipt.tokens.filter(
          (candidate) => candidate.line === token.line).length;
        if (armIndex === 0 && lineTokenCount > 1) {
          return hitToken(ctx, token, "typeDecl-arm:inline");
        }
        if (armIndex === 1 && lineTokenCount === 1) {
          return hitToken(ctx, token, "typeDecl-arm:block");
        }
      }
      return miss(`typeDecl 根形态臂 ${armIndex} 无精确 token 行`);
    }
    const row = ctx.typeSyntaxes.find((entry) => {
      if (entry.rootKind !== 3) return false;
      const marker = ctx.receipt.tokens[entry.nameTokenIndex];
      const implicit =
        entry.kindText === "ParserTypeSyntaxImplicitObject" ||
        (entry.kindText === "ParserTypeSyntaxObject" &&
         marker !== undefined &&
         tokenName(ctx, marker) === "ParserValueTokenOf");
      return armIndex === 1 ? implicit : !implicit;
    });
    return row === undefined
      ? miss(`${P} typeExpr|implicitObjectType 臂 ${armIndex} 缺精确 TypeSyntax 根`)
      : hitTypeSyntax(
          row,
          `${P}-arm:${armIndex === 1 ? "implicitObjectType" : "typeExpr"}`);
  }
  // suite 两臂
  if (P === "suite") {
    const wanted = armIndex === 0
      ? "NormalizedScopeIndentedSuite"
      : armIndex === 1
        ? "NormalizedScopeInlineSuite"
        : "";
    const scope = ctx.normalizedScopeFacts.find(
      (entry) => entry.kindText === wanted);
    return scope === undefined
      ? miss(`suite 臂 ${armIndex} 无 normalized scope fact`)
      : hitNormalizedScopeFact(
          ctx, scope, `suite-arm:${wanted}`);
  }
  // matchStmt 两臂
  if (P === "matchStmt") {
    const matchTok = tokensNamed(ctx, "ParserValueTokenMatch")[0];
    if (matchTok === undefined) return miss("无 match");
    const sameLineArm = ctx.receipt.tokens.some((t, i) =>
      t.line === matchTok.line && tokenName(ctx, t) === "ParserValueTokenAssign" &&
      ctx.receipt.tokens[i + 1] !== undefined && tokenName(ctx, ctx.receipt.tokens[i + 1]!) === "ParserValueTokenGreater");
    if (armIndex === 1 && sameLineArm) return hitToken(ctx, matchTok, "matchStmt-arm:inline");
    if (armIndex === 0 && !sameLineArm) return hitToken(ctx, matchTok, "matchStmt-arm:block");
    return miss(`matchStmt 臂 ${armIndex} 无证据`);
  }
  // caseBranch 两臂
  if (P === "caseBranch") {
    const want = armIndex === 0 ? "ParserValueTokenOf" : "ParserValueTokenElse";
    const list = tokensNamed(ctx, want);
    if (list.length > 0) return hitToken(ctx, list[0]!, `caseBranch-arm:${want}`);
    return miss(`caseBranch 臂 ${armIndex} 无证据`);
  }
  // caseEntry 两臂
  if (P === "caseEntry") {
    if (armIndex === 0) {
      return structuredCaseEntry(ctx, "pattern") ??
        miss("CaseArm region 内无 parser-owned Pattern entry");
    }
    return structuredCaseEntry(ctx, "expression") ??
      miss("CaseArm region 内无 parser-owned expression entry");
  }
  // listLiteralBody 两臂
  if (P === "listLiteralBody") {
    if (armIndex === 0) {
      const node = hasNodeKind(ctx, ["ParserValueExprComprehension"]);
      if (node !== null) return hitNode(ctx, node, "listLiteralBody-arm:comprehension");
    } else {
      const node = hasNodeKind(ctx, ["ParserValueExprListLiteral"]);
      if (node !== null) return hitNode(ctx, node, "listLiteralBody-arm:list");
    }
    return miss(`listLiteralBody 臂 ${armIndex} 无证据`);
  }
  // callArg 分隔符臂(= / :)
  if (P === "callArg") {
    const want = armIndex === 0 ? "ParserValueTokenAssign" : "ParserValueTokenColon";
    const call = (ctx.nodesByKind.get("ParserValueExprCall") ?? []).find((n) => {
      const toks = tokensInSpan(ctx, n.spanStart, n.spanEnd);
      return toks.some((t, i) =>
        tokenName(ctx, t) === "ParserValueTokenIdentifier" &&
        toks[i + 1] !== undefined && tokenName(ctx, toks[i + 1]!) === want);
    });
    if (call !== undefined) return hitNode(ctx, call, `callArg-sep:${want}`);
    return miss(`callArg 臂 ${armIndex} 无证据`);
  }
  // templateBody 两臂
  if (P === "templateBody") {
    const tmplTok = tokensNamed(ctx, "ParserValueTokenTemplate")[0];
    if (tmplTok === undefined) return miss("无 template");
    if (armIndex === 0) return hitToken(ctx, tmplTok, "templateBody-arm:suite");
    if (armIndex === 1) return hitToken(ctx, tmplTok, "templateBody-arm:expression");
  }
  // caseStmt/caseExpr 形态臂
  if (P === "caseStmt" || P === "caseExpr") {
    const caseToks = tokensNamed(ctx, "ParserValueTokenCase");
    if (obligation.structuralPath === "root.sequence3.group0") {
      // arm0 = 内联 suite/表达式; arm1 = NEWLINE 分支
      for (const ct of caseToks) {
        const sameLineOf = ctx.receipt.tokens.some((t) => t.line === ct.line && tokenName(ctx, t) === "ParserValueTokenOf");
        const laterOf = ctx.receipt.tokens.some((t) => t.line > ct.line && tokenName(ctx, t) === "ParserValueTokenOf");
        const sameLineStmt = ctx.receipt.tokens.some((t) => t.line === ct.line && t.start > ct.end &&
          ["ParserValueTokenIdentifier", "ParserValueTokenInteger"].includes(tokenName(ctx, t)));
        if (armIndex === 0 && sameLineStmt && !sameLineOf) return hitToken(ctx, ct, `${P}-arm:内联`);
        if (armIndex === 1 && laterOf) return hitToken(ctx, ct, `${P}-arm:NEWLINE 分支`);
      }
      return miss(`${P} 形态臂 ${armIndex} 无证据`);
    }
    // INDENT/flat 包裹臂
    for (const ct of caseToks) {
      const ofTok = ctx.receipt.tokens.find((t) => tokenName(ctx, t) === "ParserValueTokenOf" && t.line > ct.line);
      if (ofTok === undefined) continue;
      if (armIndex === 0 && ofTok.column > ct.column) return hitToken(ctx, ofTok, "caseStmt-臂:INDENT(分支缩进)");
      if (armIndex === 1 && ofTok.column === ct.column) return hitToken(ctx, ofTok, "caseStmt-臂:flat(分支同列)");
    }
    return miss(`${P} 包裹臂 ${armIndex} 无证据`);
  }
  // paramList 分隔符臂(, / ;)
  if (P === "paramList" && obligation.structuralPath.endsWith("group0")) {
    const want = armIndex === 0 ? "ParserValueTokenComma" : "ParserValueTokenSemicolon";
    const fnToks = tokensNamed(ctx, "ParserValueTokenFn");
    for (const ft of fnToks) {
      const open = ctx.receipt.tokens.find((t) => t.index > ft.index && tokenName(ctx, t) === "ParserValueTokenLeftParen");
      if (open === undefined) continue;
      const close = ctx.receipt.tokens.find((t) => t.index > open.index && tokenName(ctx, t) === "ParserValueTokenRightParen");
      if (close === undefined) continue;
      const sep = ctx.receipt.tokens.find((t) => t.index > open.index && t.index < close.index && tokenName(ctx, t) === want);
      if (sep !== undefined) return hitToken(ctx, sep, `paramList-sep:${want}`);
    }
    return miss(`paramList 分隔符臂 ${armIndex} 无证据`);
  }
  // rangeExpr ../ ..< 臂(顶层 choice)
  if (P === "rangeExpr" && obligation.structuralPath === "root.sequence1.repetition0.sequence0.group0") {
    const want = armIndex === 0 ? ".." : "..<";
    const node = (ctx.nodesByKind.get("ParserValueExprBinary") ?? []).find((n) => binaryOperator(ctx, n) === want);
    if (node !== undefined) return hitNode(ctx, node, `range-op:${want}`);
  }
  void mapRow;
  return unsup(`choice 未覆盖通道: ${P} @ ${obligation.structuralPath} 臂 ${armIndex}`);
}

function matchOptional(
  P: string,
  obligation: {readonly structuralPath: string; readonly variant: string},
  ctx: Ctx,
  mapRow: MapRow | undefined,
): MatchResult {
  const present = obligation.variant === "present";
  const path = obligation.structuralPath;
  const T = (name: string) => tokensNamed(ctx, name);
  if (P === "conceptDecl" || P === "traitDecl") {
    const expectedKind = P === "conceptDecl"
      ? "ParserDeclarationConcept"
      : "ParserDeclarationTrait";
    const surface = conceptTraitDeclarationSurfaces(
      ctx,
      expectedKind,
    ).find((entry) =>
      (entry.declaration.genericSymbolCount > 0) === present);
    return surface === undefined
      ? miss(
          `${P} optional typeParamList/${obligation.variant} ` +
          "缺 declaration/generic/suite 精确闭合")
      : hitConceptTraitDeclaration(
          ctx,
          surface.declaration,
          surface.region,
          `${P}-optional:type-params:${obligation.variant}`,
        );
  }
  if (P === "implicitObjectType" || P === "objectType") {
    const surface: ObjectTypeSurface =
      P === "implicitObjectType" ? "implicit" : "explicit";
    const colonPath = P === "implicitObjectType"
      ? path === "root.choice0.sequence1"
      : path === "root.choice0.sequence2";
    const fieldsArm = path.startsWith("root.choice0.");
    const row = ctx.typeSyntaxes.find((entry) => {
      if (objectTypeSurface(ctx, entry) !== surface) return false;
      const hasFields = objectTypeFieldBlock(ctx, entry) !== undefined;
      if (hasFields !== fieldsArm) return false;
      const actual = colonPath
        ? objectTypeColonToken(ctx, entry) !== undefined
        : objectTypeOfToken(ctx, entry) !== undefined;
      return actual === present;
    });
    if (row === undefined) {
      return miss(
        `${P} optional ${colonPath ? "colon" : "of"}/${obligation.variant} ` +
        `缺声明 TypeSyntax/FieldBlock/token 精确连接`);
    }
    return hitTypeSyntax(
      row,
      `${P}-optional:${colonPath ? "colon" : "of"}:` +
        `${present ? "present" : "absent"}`,
    );
  }
  if (P === "typeParam") {
    const isConstraint = path === "root.sequence1";
    const symbol = ctx.typeGenericSymbols.find((entry) => {
      const child = isConstraint
        ? entry.constraintTypeSyntaxIndex
        : entry.defaultTypeSyntaxIndex;
      return present ? child >= 0 : child < 0;
    });
    return symbol === undefined
      ? miss(
          `typeParam optional ${isConstraint ? "constraint" : "default"}/${obligation.variant} 缺 symbol`)
      : hitTypeGenericSymbol(
          symbol,
          `type-param-optional:${isConstraint ? "constraint" : "default"}:${obligation.variant}`);
  }
  if (P === "procType" && path === "root.sequence2") {
    const row = ctx.typeSyntaxes.find((entry) => {
      if (!exactTypeProductionSyntax(ctx, P, entry)) return false;
      const returnChild = functionTypeReturnChild(ctx, entry);
      return present ? returnChild !== undefined : returnChild === undefined;
    });
    return row === undefined
      ? miss(`procType optional return/${obligation.variant} 缺 exact child`)
      : hitTypeSyntax(
          row,
          `proc-type-return:${present ? "present" : "absent"}`,
        );
  }
  if (P === "enumType" && path === "root.sequence1") {
    const row = ctx.typeSyntaxes.find((entry) =>
      exactTypeProductionSyntax(ctx, P, entry) &&
      (present
        ? enumTypeVariants(ctx, entry).length > 0
        : enumTypeVariants(ctx, entry).length === 0));
    return row === undefined
      ? miss(`enumType optional fields/${obligation.variant} 缺 exact variant CSR`)
      : hitTypeSyntax(
          row,
          `enum-fields-optional:${present ? "present" : "absent"}`,
        );
  }
  if (P === "pattern" &&
      (path === "root.choice0.sequence1" ||
       path === "root.choice1.sequence1")) {
    const kind = path === "root.choice0.sequence1"
      ? "ParserPatternBinding"
      : "ParserPatternWildcard";
    const row = ctx.patterns.find((entry) =>
      entry.kindText === kind &&
      (present ? entry.typeSyntaxRootIndex >= 0 :
        entry.typeSyntaxRootIndex < 0));
    return row === undefined
      ? miss(`pattern annotation ${kind}/${obligation.variant} 缺精确边`)
      : hitPattern(row, `pattern-annotation:${kind}:${obligation.variant}`);
  }
  if (P === "pattern" &&
      path === "root.choice4.sequence1") {
    const row = ctx.patterns.find((entry) =>
      entry.kindText === "ParserPatternSequence" &&
      (present ? entry.childCount > 0 : entry.childCount === 0));
    return row === undefined
      ? miss(`sequence pattern optional/${obligation.variant} 缺 child CSR`)
      : hitPattern(row, `sequence-pattern-optional:${obligation.variant}`);
  }
  if (P === "variantPattern") {
    const row = ctx.patterns.find((entry) => {
      if (entry.kindText !== "ParserPatternConstructor") return false;
      const tokens = ctx.receipt.tokens.filter((token) =>
        token.start >= entry.spanStart && token.end <= entry.spanEnd);
      const hasParen = tokens.some((token) => tokenText(ctx, token) === "(");
      if (path === "root.sequence1") return hasParen === present;
      if (path === "root.sequence1.optional0.sequence1") {
        return hasParen && (entry.childCount > 0) === present;
      }
      return false;
    });
    return row === undefined
      ? miss(`variantPattern optional ${path}/${obligation.variant} 缺 Pattern`)
      : hitPattern(row, `variant-pattern-optional:${path}:${obligation.variant}`);
  }
  if (P === "typePostfix" &&
      path === "root.sequence1.repetition0.choice1.sequence1") {
    const row = ctx.typeSyntaxes.find((entry) =>
      [
        "ParserTypeSyntaxBracketApply", "ParserTypeSyntaxSeq",
        "ParserTypeSyntaxFixedArray",
      ].includes(entry.kindText) &&
      (present ? entry.bracketArgCount > 0 : entry.bracketArgCount === 0));
    return row === undefined
      ? miss(`typePostfix bracket optional/${obligation.variant} 缺 TypeSyntax`)
      : hitTypeSyntax(row, `type-postfix-bracket-optional:${obligation.variant}`);
  }
  if (P === "variantType") {
    const row = ctx.typeSyntaxes.find((entry) => {
      if (entry.kindText !== "ParserTypeSyntaxVariant") return false;
      const hasParen = typeSyntaxTokens(ctx, entry)
        .some((token) => tokenText(ctx, token) === "(");
      if (path === "root.sequence1") return hasParen === present;
      if (path === "root.sequence1.optional0.sequence1") {
        return hasParen && (entry.childCount > 0) === present;
      }
      return false;
    });
    return row === undefined
      ? miss(`variantType optional ${path}/${obligation.variant} 缺 TypeSyntax 行`)
      : hitTypeSyntax(row, `variant-optional:${path}:${obligation.variant}`);
  }
  if (P === "annotationArgs") {
    const annotation = ctx.annotations.find((row) =>
      present ? row.argRootCount > 0 : row.argRootCount === 0);
    return annotation === undefined
      ? miss(`annotationArgs optional ${obligation.variant} 缺 parser-owned root CSR`)
      : hitAnnotation(
          ctx,
          annotation,
          `annotation-args-optional:${obligation.variant}`,
        );
  }
  if (P === "annotationList" || P === "annotationDict") {
    const kind = P === "annotationList"
      ? "ParserAnnotationArgList"
      : "ParserAnnotationArgDict";
    if (path === "root.sequence1") {
      const arg = ctx.annotationArgs.find((row) =>
        row.kindText === kind &&
        (present ? row.childCount > 0 : row.childCount === 0));
      return arg === undefined
        ? miss(`${P} optional ${obligation.variant} 缺 parser-owned child CSR`)
        : hitAnnotationArg(
            ctx, arg, `${P}-optional:${obligation.variant}`);
    }
    const arg = ctx.annotationArgs.find((row) => {
      if (row.kindText !== kind || row.childCount === 0) return false;
      const trailing = annotationTrailingComma(ctx, row) !== undefined;
      return present ? trailing : !trailing;
    });
    return arg === undefined
      ? miss(`${P} trailing-comma ${obligation.variant} 缺 parser-owned span`)
      : hitAnnotationArg(
          ctx, arg, `${P}-trailing-comma:${obligation.variant}`);
  }
  // ---- 标记物查找器(返回 present 证据) ----
  const marker = (): MatchHit | null => {
    if (P === "conditionalExpr") {
      const node = hasNodeKind(ctx, ["ParserValueExprTernary"]);
      return node === null ? null : hitNode(ctx, node, "optional:ternary");
    }
    if (P === "comprehension" || P === "listComprehension") {
      const node = (ctx.nodesByKind.get("ParserValueExprComprehension") ?? []).find((n) =>
        tokensInSpan(ctx, n.spanStart, n.spanEnd).some((t) => tokenName(ctx, t) === "ParserValueTokenIf"));
      return node === undefined ? null : hitNode(ctx, node, "optional:comprehension-if");
    }
    if (P === "callSuffix") {
      const node = (ctx.nodesByKind.get("ParserValueExprCall") ?? []).find((n) => n.childCount > 1);
      return node === undefined ? null : hitNode(ctx, node, "optional:call-args");
    }
    if (P === "callArg") {
      for (const call of ctx.nodesByKind.get("ParserValueExprCall") ?? []) {
        for (const argument of childrenOf(ctx, call).slice(1)) {
          const first = tokensInSpan(
            ctx, argument.spanStart, argument.spanEnd)[0];
          const prefix = first === undefined
            ? undefined
            : ctx.receipt.tokens[first.index - 1];
          if (prefix !== undefined &&
            ["ParserValueTokenAssign", "ParserValueTokenColon"].includes(
              tokenName(ctx, prefix))) {
            return hitNode(ctx, argument, "optional:named-arg");
          }
        }
      }
      return null;
    }
    if (P === "tupleLiteral" || P === "listLiteralBody" || P === "spacePrimary") {
      const kindName = P === "tupleLiteral"
        ? "ParserValueExprTupleLiteral"
        : P === "listLiteralBody"
          ? "ParserValueExprListLiteral"
          : "ParserValueExprBraceLiteral";
      if (path.endsWith("sequence2")) {
        const closers: Record<string, string> = {tupleLiteral: "ParserValueTokenRightParen", listLiteralBody: "ParserValueTokenRightBracket", spacePrimary: "ParserValueTokenRightBrace"};
        const close = closers[P]!;
        let tok: DriverToken | undefined;
        for (const node of ctx.nodesByKind.get(kindName) ?? []) {
          const tokens = tokensInSpan(ctx, node.spanStart, node.spanEnd);
          const final = tokens[tokens.length - 1];
          const comma = tokens[tokens.length - 2];
          if (final !== undefined && comma !== undefined &&
              tokenName(ctx, final) === close &&
              tokenName(ctx, comma) === "ParserValueTokenComma") {
            tok = comma;
            break;
          }
        }
        return tok === undefined ? null : hitToken(ctx, tok, "optional:trailing-comma");
      }
      const node = (ctx.nodesByKind.get(kindName) ?? []).find((n) => n.childCount > 0);
      return node === undefined ? null : hitNode(ctx, node, "optional:elems-present");
    }
    if (P === "tupleElement") {
      for (const tuple of ctx.nodesByKind.get(
        "ParserValueExprTupleLiteral") ?? []) {
        for (const element of childrenOf(ctx, tuple)) {
          const first = tokensInSpan(
            ctx, element.spanStart, element.spanEnd)[0];
          const colon = first === undefined
            ? undefined
            : ctx.receipt.tokens[first.index - 1];
          const name = colon === undefined
            ? undefined
            : ctx.receipt.tokens[colon.index - 1];
          if (colon !== undefined && name !== undefined &&
            tokenName(ctx, colon) === "ParserValueTokenColon" &&
            tokenName(ctx, name) === "ParserValueTokenIdentifier") {
            return hitNode(ctx, element, "optional:tuple-element-name");
          }
        }
      }
      return null;
    }
    if (P === "whenExpr") {
      const node = (ctx.nodesByKind.get("ParserValueExprWhen") ?? []).find((n) =>
        tokensInSpan(ctx, n.spanStart, n.spanEnd).some((t) => tokenName(ctx, t) === "ParserValueTokenElse"));
      return node === undefined ? null : hitNode(ctx, node, "optional:when-else");
    }
    if (P === "returnStmt" || P === "yieldStmt") {
      const roleName = P === "returnStmt" ? "ParserValueExprStatementReturnValue" : "ParserValueExprStatementYieldValue";
      const root = ctx.receipt.statementRoots.find((s) => s.role === roleName);
      return root === undefined ? null : hitStatementRoot(ctx, root, `optional:${roleName}`);
    }
    if (P === "ifStmt" || P === "whenStmt") {
      const kwName = P === "ifStmt" ? "ParserValueTokenIf" : "ParserValueTokenWhen";
      for (const kw of T(kwName)) {
        const blockEnd = ctx.receipt.tokens.find((t) => t.line > kw.line && t.column <= kw.column);
        if (blockEnd !== undefined && tokenName(ctx, blockEnd) === "ParserValueTokenElse" && blockEnd.column === kw.column) {
          return hitToken(ctx, blockEnd, "optional:else(同列跟随)");
        }
      }
      return null;
    }
    if (P === "caseBranch" || P === "caseExprBranch") {
      const root = ctx.receipt.statementRoots.find((s) => s.role === "ParserValueExprStatementCaseGuard");
      if (root !== undefined) return hitStatementRoot(ctx, root, "optional:guard-role");
      for (const ofTok of T("ParserValueTokenOf")) {
        const colon = ctx.receipt.tokens.find((t) => t.start > ofTok.end && tokenName(ctx, t) === "ParserValueTokenColon" && t.line === ofTok.line);
        const ifTok = ctx.receipt.tokens.find((t) => t.start > ofTok.end &&
          t.line === ofTok.line &&
          tokenName(ctx, t) === "ParserValueTokenIf" &&
          (colon === undefined || t.start < colon.start));
        if (ifTok !== undefined) return hitToken(ctx, ifTok, "optional:guard-token");
      }
      return null;
    }
    if (P === "caseStmt" || P === "caseExpr") {
      if (path === "root.sequence2") {
        const caseTok = T("ParserValueTokenCase")[0];
        if (caseTok === undefined) return null;
        const colon = ctx.receipt.tokens.find((t) => t.line === caseTok.line && t.start > caseTok.end && tokenName(ctx, t) === "ParserValueTokenColon");
        return colon === undefined ? null : hitToken(ctx, colon, "optional:case-colon");
      }
      if (P === "caseExpr" && path === "root.sequence4") {
        const node = (ctx.nodesByKind.get("ParserValueExprCase") ?? []).find((n) =>
          tokensInSpan(ctx, n.spanStart, n.spanEnd).some((t) => tokenName(ctx, t) === "ParserValueTokenElse"));
        return node === undefined ? null : hitNode(ctx, node, "optional:case-expr-else");
      }
      const caseTok = T("ParserValueTokenCase")[0];
      if (caseTok === undefined) return null;
      const ofTok = ctx.receipt.tokens.find((t) => tokenName(ctx, t) === "ParserValueTokenOf" && t.line > caseTok.line);
      if (ofTok !== undefined && ofTok.column > caseTok.column) return hitToken(ctx, ofTok, "optional:INDENT 包裹(分支缩进)");
      return null;
    }
    if (P === "blockStmt") {
      for (const blockTok of T("ParserValueTokenBlock")) {
        const next = ctx.receipt.tokens[blockTok.index + 1];
        if (next !== undefined && tokenName(ctx, next) === "ParserValueTokenIdentifier") return hitToken(ctx, next, "optional:block-label");
      }
      return null;
    }
    if (P === "routineHead" || P === "macroDecl" || P === "templateDecl" || P === "typeDecl" || P === "typeEntry") {
      if (path.includes("sequence4") || path.includes("sequence5") || path.includes("sequence6") || path === "root.choice0.sequence3" || (path === "root.sequence2" && P === "typeEntry")) {
        const root = ctx.receipt.statementRoots.find((s) => s.role === "ParserValueExprStatementWhereCondition");
        if (root !== undefined) return hitStatementRoot(ctx, root, "optional:where");
      }
      if (path === "root.sequence1" || path === "root.sequence2" || path === "root.choice0.sequence2") {
        const region = ctx.receipt.regions.find((r) => r.kind === "ParserValueExprRegionTypeParamList");
        if (region !== undefined) return hitRegion(ctx, region, "optional:typeParamList(region)");
        // token 通道: 声明名后紧跟 LeftBracket(driver 对 type/macro/template 声明不发 region)
        const kwTok = ctx.receipt.tokens.find((t) =>
          ["ParserValueTokenFn", "ParserValueTokenMacro", "ParserValueTokenTemplate", "ParserValueTokenType", "ParserValueTokenIterator"].includes(tokenName(ctx, t)) &&
          ctx.receipt.tokens[t.index + 1] !== undefined && tokenName(ctx, ctx.receipt.tokens[t.index + 1]!) === "ParserValueTokenIdentifier" &&
          ctx.receipt.tokens[t.index + 2] !== undefined && tokenName(ctx, ctx.receipt.tokens[t.index + 2]!) === "ParserValueTokenLeftBracket");
        if (kwTok !== undefined) return hitToken(ctx, kwTok, "optional:typeParamList(token)");
        return null;
      }
      if (path === "root.sequence3" || path === "root.sequence4") {
        const region = ctx.receipt.regions.find((r) => r.kind === "ParserValueExprRegionReturnType");
        if (region !== undefined) return hitRegion(ctx, region, "optional:return-type(region)");
      }
      return null;
    }
    if (P === "fnLiteral" || P === "iteratorLiteral") {
      if (path === "root.sequence1") {
        const kwName = P === "fnLiteral" ? "ParserValueTokenFn" : "ParserValueTokenIterator";
        for (const kw of T(kwName)) {
          const next = ctx.receipt.tokens[kw.index + 1];
          if (next !== undefined && tokenName(ctx, next) === "ParserValueTokenIdentifier") return hitToken(ctx, next, "optional:literal-name");
        }
        return null;
      }
      if (path === "root.sequence2") {
        const region = ctx.receipt.regions.find((r) => r.kind === "ParserValueExprRegionTypeParamList");
        if (region !== undefined) return hitRegion(ctx, region, "optional:typeParamList(region)");
        const kwName = P === "fnLiteral" ? "ParserValueTokenFn" : "ParserValueTokenIterator";
        // 字面量 typeParams: `fn[T]`(Fn 直接跟 [)或 `fn name[T]`(Fn ident [)
        const kwTok = ctx.receipt.tokens.find((t) => tokenName(ctx, t) === kwName && (
          (ctx.receipt.tokens[t.index + 1] !== undefined && tokenName(ctx, ctx.receipt.tokens[t.index + 1]!) === "ParserValueTokenLeftBracket") ||
          (ctx.receipt.tokens[t.index + 1] !== undefined && tokenName(ctx, ctx.receipt.tokens[t.index + 1]!) === "ParserValueTokenIdentifier" &&
           ctx.receipt.tokens[t.index + 2] !== undefined && tokenName(ctx, ctx.receipt.tokens[t.index + 2]!) === "ParserValueTokenLeftBracket")));
        if (kwTok !== undefined) return hitToken(ctx, kwTok, "optional:typeParamList(token)");
        return null;
      }
      if (path === "root.sequence4") {
        const region = ctx.receipt.regions.find((r) => r.kind === "ParserValueExprRegionReturnType");
        if (region !== undefined) return hitRegion(ctx, region, "optional:return-type(region)");
        return null;
      }
      const root = ctx.receipt.statementRoots.find((s) => s.role === "ParserValueExprStatementWhereCondition");
      if (root !== undefined) return hitStatementRoot(ctx, root, "optional:where(role)");
      // token 通道: 字面量 span 内的 Where token(driver 对字面量 where 不发 role)
      const kindName = P === "fnLiteral" ? "ParserValueExprFunctionLiteral" : "ParserValueExprIteratorLiteral";
      const lit = (ctx.nodesByKind.get(kindName) ?? []).find((n) =>
        tokensInSpan(ctx, n.spanStart, n.spanEnd).some((t) => tokenName(ctx, t) === "ParserValueTokenWhere"));
      return lit === undefined ? null : hitNode(ctx, lit, "optional:where(token-in-literal)");
    }
    if (P === "fnDecl" || P === "fnStmt" || P === "fnEntry") {
      if (path.endsWith("sequence0")) {
        const asyncTok = T("ParserValueTokenAsync")[0];
        return asyncTok === undefined ? null : hitToken(ctx, asyncTok, "optional:async");
      }
      const firstTokens = lineFirstToken(ctx);
      for (const [, tok] of firstTokens) {
        if (tokenName(ctx, tok) === "ParserValueTokenFn" && tok.column > 1) return hitToken(ctx, tok, "optional:fnEntry-fn 关键字");
      }
      return null;
    }
    if (P === "param" || P === "paramList") {
      if (P === "paramList") {
        const list = parameterListSurfaces(ctx).find(
          (entry) => entry.segments.length > 0);
        if (list !== undefined) {
          return hitToken(ctx, list.open, "optional:params-present");
        }
        return null;
      }
      const typedOrDefault = parameterListSurfaces(ctx)
        .flatMap((list) => list.segments)
        .map((segment) => ({
          segment,
          markers: parameterSegmentMarkers(ctx, segment),
        }));
      if (path === "root.sequence1") {
        for (const entry of typedOrDefault) {
          const typeSyntax = parameterTypeSyntax(
            ctx, entry.segment, entry.markers);
          if (typeSyntax !== undefined) {
            return hitTypeSyntax(
              typeSyntax, "optional:param-type-syntax");
          }
        }
        return null;
      }
      for (const entry of typedOrDefault) {
        const root = parameterDefaultRoot(
          ctx, entry.segment, entry.markers);
        if (root !== undefined) {
          return hitStatementRoot(
            ctx, root, "optional:param-default-root");
        }
      }
      return null;
    }
    if (P === "bindingEntry") {
      for (const storageTok of ctx.receipt.tokens.filter((t) => ["ParserValueTokenLet", "ParserValueTokenVar", "ParserValueTokenConst"].includes(tokenName(ctx, t)))) {
        const lineToks = ctx.receipt.tokens.filter((t) => t.line === storageTok.line);
        if (path === "root.sequence1") {
          const colon = lineToks.find((t) => tokenName(ctx, t) === "ParserValueTokenColon");
          if (colon !== undefined) return hitToken(ctx, colon, "optional:binding-type");
        } else {
          const assign = lineToks.find((t) => tokenName(ctx, t) === "ParserValueTokenAssign");
          if (assign !== undefined) return hitToken(ctx, assign, "optional:binding-init");
        }
      }
      return null;
    }
    if (P === "fieldDecl" || P === "tupleElem" || P === "enumField") {
      const root = ctx.receipt.statementRoots.find((s) => s.role === "ParserValueExprStatementTypeDefault");
      if (root !== undefined) return hitStatementRoot(ctx, root, "optional:type-default");
      const assignRoot = ctx.receipt.statementRoots.find((s) => s.role === "ParserValueExprStatementAssignmentRhs");
      return assignRoot === undefined ? null : hitStatementRoot(ctx, assignRoot, "optional:enumField-default(AssignmentRhs)");
    }
    if (P === "annotation") {
      for (const atTok of T("ParserValueTokenAt")) {
        const t1 = ctx.receipt.tokens[atTok.index + 1];
        const t2 = ctx.receipt.tokens[atTok.index + 2];
        if (t1 !== undefined && t2 !== undefined && tokenName(ctx, t1) === "ParserValueTokenIdentifier" &&
            tokenName(ctx, t2) === "ParserValueTokenLeftParen") {
          const annotation = ctx.annotations.find((row) =>
            row.spanStart <= atTok.start && row.spanEnd >= t2.end);
          if (annotation !== undefined) {
            return hitAnnotation(
              ctx,
              annotation,
              "optional:annotation-args",
            );
          }
        }
      }
      return null;
    }
    if (P === "importDecl") {
      const edge = ctx.importEdges.find(
        (entry) => entry.aliasTokenIndex >= 0);
      return edge === undefined
        ? null
        : hitImportEdge(edge, "optional:import-alias-edge");
    }
    if (P === "module") {
      const region = moduleHeaderRegion(ctx);
      const declaration = region === null
        ? undefined
        : ctx.declarations.find((entry) =>
            entry.kindText === "ParserDeclarationModule" &&
            entry.spanStart === region.spanStart &&
            entry.spanEnd === region.spanEnd);
      if (region === null || declaration === undefined) return null;
      return hitModuleSourceTextFact(
        ctx,
        "optional:module-header",
        {
          state: "present",
          declarationIdentitySha256: declaration.identitySha256,
          regionIdentitySha256:
            hitRegion(ctx, region, "module-header-region")
              .parserNodeIdentitySha256,
        },
      );
    }
    return null;
  };

  if (present) {
    const hit = marker();
    return hit ?? miss(`${P} optional present 标记物缺失 @ ${path}`);
  }
  return matchOptionalAbsent(P, path, ctx, mapRow);
}

function matchOptionalAbsent(P: string, path: string, ctx: Ctx, mapRow: MapRow | undefined): MatchResult {
  const T = (name: string) => tokensNamed(ctx, name);
  if (P === "conditionalExpr") {
    const root = ctx.receipt.statementRoots.find((s) => nodeAt(ctx, s.nodeIndex).kind !== "ParserValueExprTernary");
    if (root !== undefined) return hitStatementRoot(ctx, root, "optional-absent:非三元表达式根");
  }
  if (P === "returnStmt" || P === "yieldStmt") {
    const tokName = P === "returnStmt" ? "ParserValueTokenReturn" : "ParserValueTokenYield";
    const roleName = P === "returnStmt" ? "ParserValueExprStatementReturnValue" : "ParserValueExprStatementYieldValue";
    const bare = T(tokName).find((t) =>
      !ctx.receipt.statementRoots.some((s) => s.role === roleName && s.anchorLine === t.line));
    if (bare !== undefined) return hitToken(ctx, bare, "optional-absent:裸 return/yield");
  }
  if (P === "ifStmt" || P === "whenStmt") {
    const kwName = P === "ifStmt" ? "ParserValueTokenIf" : "ParserValueTokenWhen";
    for (const kw of T(kwName)) {
      const blockEnd = ctx.receipt.tokens.find((t) => t.line > kw.line && t.column <= kw.column);
      const followedByElse = blockEnd !== undefined && tokenName(ctx, blockEnd) === "ParserValueTokenElse" && blockEnd.column === kw.column;
      if (!followedByElse) return hitToken(ctx, kw, "optional-absent:无 else 的 if/when");
    }
  }
  if (P === "whenExpr") {
    const node = (ctx.nodesByKind.get("ParserValueExprWhen") ?? []).find((n) =>
      !tokensInSpan(ctx, n.spanStart, n.spanEnd).some((t) => tokenName(ctx, t) === "ParserValueTokenElse"));
    if (node !== undefined) return hitNode(ctx, node, "optional-absent:when 无 else");
  }
  if (P === "caseExpr" && path === "root.sequence4") {
    const node = (ctx.nodesByKind.get("ParserValueExprCase") ?? []).find((n) =>
      !tokensInSpan(ctx, n.spanStart, n.spanEnd).some((t) => tokenName(ctx, t) === "ParserValueTokenElse"));
    if (node !== undefined) return hitNode(ctx, node, "optional-absent:caseExpr 无 else");
  }
  if (P === "caseStmt" || P === "caseExpr") {
    if (path === "root.sequence2") {
      for (const caseTok of T("ParserValueTokenCase")) {
        const lineToks = ctx.receipt.tokens.filter((t) => t.line === caseTok.line);
        if (!lineToks.some((t) => tokenName(ctx, t) === "ParserValueTokenColon")) {
          return hitToken(ctx, caseTok, "optional-absent:case 行内无冒号");
        }
      }
    }
    if (P === "caseStmt") {
      const caseTok = T("ParserValueTokenCase")[0];
      if (caseTok !== undefined) {
        const ofTok = ctx.receipt.tokens.find((t) => tokenName(ctx, t) === "ParserValueTokenOf" && t.line > caseTok.line && t.column === caseTok.column);
        if (ofTok !== undefined) return hitToken(ctx, ofTok, "optional-absent:flat 分支(同列)");
      }
    }
  }
  if (P === "fnDecl" || P === "fnStmt" || P === "fnEntry") {
    if (path.endsWith("sequence0")) {
      const fnTok = ctx.receipt.tokens.find((t) => {
        if (tokenName(ctx, t) !== "ParserValueTokenFn" ||
            (P === "fnDecl" && t.column !== 1) ||
            (P !== "fnDecl" && t.column <= 1)) return false;
        const previous = ctx.receipt.tokens[t.index - 1];
        return previous === undefined || previous.line !== t.line ||
          tokenName(ctx, previous) !== "ParserValueTokenAsync";
      });
      if (fnTok !== undefined) return hitToken(ctx, fnTok, "optional-absent:无 async");
    }
    if (P === "fnEntry") {
      const firstTokens = lineFirstToken(ctx);
      for (const fnBlock of T("ParserValueTokenFn")) {
        const lineTokens = ctx.receipt.tokens.filter(
          (token) => token.line === fnBlock.line);
        if (lineTokens.length !== 1) continue;
        const entry = firstTokens.get(fnBlock.line + 1);
        if (entry !== undefined &&
            entry.column > fnBlock.column &&
            tokenName(ctx, entry) === "ParserValueTokenIdentifier") {
          return hitToken(
            ctx, entry, "optional-absent:fnEntry 无 fn 关键字");
        }
      }
    }
  }
  if (P === "routineHead" || P === "fnLiteral" ||
      P === "iteratorLiteral") {
    if (path === "root.sequence1" || path === "root.sequence2" || path === "root.choice0.sequence2") {
      const keyword = P === "iteratorLiteral"
        ? "ParserValueTokenIterator"
        : "ParserValueTokenFn";
      for (const keywordToken of T(keyword)) {
        const lineTokens = ctx.receipt.tokens.filter((token) =>
          token.line === keywordToken.line && token.index > keywordToken.index);
        const open = lineTokens.find((token) =>
          tokenName(ctx, token) === "ParserValueTokenLeftParen");
        if (open === undefined) continue;
        const hasTypeParams = lineTokens.some((token) =>
          token.index < open.index &&
          tokenName(ctx, token) === "ParserValueTokenLeftBracket");
        if (!hasTypeParams) {
          return hitToken(
            ctx, keywordToken, "optional-absent:无类型参数");
        }
      }
    }
  }
  if (P === "bindingEntry") {
    for (const region of ctx.receipt.regions.filter(
      (entry) => entry.kind === "ParserValueExprRegionPattern")) {
      const pattern = ctx.receipt.tokens[region.anchorTokenIndex];
      if (pattern === undefined) continue;
      const lineToks = ctx.receipt.tokens.filter(
        (token) => token.line === pattern.line);
      if (path === "root.sequence1" && !lineToks.some((t) => tokenName(ctx, t) === "ParserValueTokenColon")) {
        return hitRegion(ctx, region, "optional-absent:无类型标注");
      }
      if (path === "root.sequence2" && !lineToks.some((t) => tokenName(ctx, t) === "ParserValueTokenAssign")) {
        return hitRegion(ctx, region, "optional-absent:无初值");
      }
    }
  }
  if (P === "blockStmt") {
    const blockTok = T("ParserValueTokenBlock")[0];
    if (blockTok !== undefined) {
      const next = ctx.receipt.tokens[blockTok.index + 1];
      if (next !== undefined && next.line === blockTok.line &&
          tokenName(ctx, next) === "ParserValueTokenColon") {
        return hitToken(ctx, blockTok, "optional-absent:无 label block");
      }
    }
  }
  if (P === "caseBranch" || P === "caseExprBranch") {
    for (const ofTok of T("ParserValueTokenOf")) {
      const colon = ctx.receipt.tokens.find((t) => t.start > ofTok.end && tokenName(ctx, t) === "ParserValueTokenColon" && t.line === ofTok.line);
      const hasGuard = ctx.receipt.tokens.some((t) => t.start > ofTok.end && tokenName(ctx, t) === "ParserValueTokenIf" &&
        (colon === undefined || t.start < colon.start));
      if (!hasGuard) return hitToken(ctx, ofTok, "optional-absent:无 guard 分支");
    }
  }
  if (P === "comprehension" || P === "listComprehension") {
    const node = (ctx.nodesByKind.get("ParserValueExprComprehension") ?? []).find((n) =>
      !tokensInSpan(ctx, n.spanStart, n.spanEnd).some((t) => tokenName(ctx, t) === "ParserValueTokenIf"));
    if (node !== undefined) return hitNode(ctx, node, "optional-absent:无 if 生成式");
  }
  if (P === "callSuffix") {
    const node = (ctx.nodesByKind.get("ParserValueExprCall") ?? []).find((n) => n.childCount === 1);
    if (node !== undefined) return hitNode(ctx, node, "optional-absent:空实参 f()");
  }
  if (P === "callArg") {
    for (const call of ctx.nodesByKind.get("ParserValueExprCall") ?? []) {
      for (const argument of childrenOf(ctx, call).slice(1)) {
        const first = tokensInSpan(
          ctx, argument.spanStart, argument.spanEnd)[0];
        const prefix = first === undefined
          ? undefined
          : ctx.receipt.tokens[first.index - 1];
        if (prefix !== undefined &&
            !["ParserValueTokenAssign", "ParserValueTokenColon"].includes(
              tokenName(ctx, prefix))) {
          return hitNode(ctx, argument, "optional-absent:位置实参");
        }
      }
    }
  }
  if (P === "listLiteralBody") {
    if (path.endsWith("sequence2")) {
      for (const node of ctx.nodesByKind.get("ParserValueExprListLiteral") ?? []) {
        const tokens = tokensInSpan(ctx, node.spanStart, node.spanEnd);
        const close = tokens[tokens.length - 1];
        const previous = tokens[tokens.length - 2];
        if (close !== undefined && previous !== undefined &&
            tokenName(ctx, close) === "ParserValueTokenRightBracket" &&
            tokenName(ctx, previous) !== "ParserValueTokenComma") {
          return hitToken(ctx, close, "optional-absent:无尾随逗号");
        }
      }
    }
    const empty = (ctx.nodesByKind.get("ParserValueExprListLiteral") ?? []).find((n) => n.childCount === 0);
    if (empty !== undefined) return hitNode(ctx, empty, "optional-absent:空列表 []");
  }
  if (P === "spacePrimary") {
    if (path.endsWith("sequence2")) {
      for (const node of ctx.nodesByKind.get("ParserValueExprBraceLiteral") ?? []) {
        const tokens = tokensInSpan(ctx, node.spanStart, node.spanEnd);
        const close = tokens[tokens.length - 1];
        const previous = tokens[tokens.length - 2];
        if (close !== undefined && previous !== undefined &&
            tokenName(ctx, close) === "ParserValueTokenRightBrace" &&
            tokenName(ctx, previous) !== "ParserValueTokenComma") {
          return hitToken(ctx, close, "optional-absent:无尾随逗号");
        }
      }
    }
    const empty = (ctx.nodesByKind.get("ParserValueExprBraceLiteral") ?? []).find((n) => n.childCount === 0);
    if (empty !== undefined) return hitNode(ctx, empty, "optional-absent:空 brace {}");
  }
  if (P === "tupleLiteral") {
    for (const node of ctx.nodesByKind.get("ParserValueExprTupleLiteral") ?? []) {
      const tokens = tokensInSpan(ctx, node.spanStart, node.spanEnd);
      const close = tokens[tokens.length - 1];
      const previous = tokens[tokens.length - 2];
      if (close !== undefined && previous !== undefined &&
          tokenName(ctx, close) === "ParserValueTokenRightParen" &&
          tokenName(ctx, previous) !== "ParserValueTokenComma") {
        return hitToken(ctx, close, "optional-absent:无尾随逗号");
      }
    }
  }
  if (P === "tupleElement") {
    for (const tuple of ctx.nodesByKind.get(
      "ParserValueExprTupleLiteral") ?? []) {
      for (const element of childrenOf(ctx, tuple)) {
        const first = tokensInSpan(
          ctx, element.spanStart, element.spanEnd)[0];
        const prefix = first === undefined
          ? undefined
          : ctx.receipt.tokens[first.index - 1];
        if (prefix !== undefined &&
            tokenName(ctx, prefix) !== "ParserValueTokenColon") {
          return hitNode(
            ctx, element, "optional-absent:匿名 tuple 元素");
        }
      }
    }
  }
  if (P === "paramList") {
    const empty = parameterListSurfaces(ctx).find(
      (entry) => entry.segments.length === 0);
    if (empty !== undefined) {
      return hitToken(
        ctx, empty.open, "optional-absent:空参数列表()");
    }
  }
  if (P === "param") {
    for (const segment of parameterListSurfaces(ctx)
      .flatMap((list) => list.segments)) {
      const markers = parameterSegmentMarkers(ctx, segment);
      if (path === "root.sequence1" && markers.colon === null) {
        return hitToken(
          ctx, segment[0]!, "optional-absent:参数无类型");
      }
      if (path === "root.sequence2" && markers.assign === null) {
        return hitToken(
          ctx, segment[0]!, "optional-absent:参数无默认值");
      }
    }
    return miss(`param optional absent 缺精确参数 segment @ ${path}`);
  }
  if (P === "annotation") {
    const atTok = T("ParserValueTokenAt")[0];
    if (atTok !== undefined) {
      const t2 = ctx.receipt.tokens[atTok.index + 2];
      if (t2 === undefined || tokenName(ctx, t2) !== "ParserValueTokenLeftParen") {
        const annotation = ctx.annotations.find((row) =>
          row.spanStart <= atTok.start && row.spanEnd >= atTok.end);
        if (annotation !== undefined) {
          return hitAnnotation(
            ctx,
            annotation,
            "optional-absent:裸注解",
          );
        }
      }
    }
  }
  if (P === "importDecl") {
    const edge = ctx.importEdges.find(
      (entry) => entry.aliasTokenIndex < 0);
    if (edge !== undefined) {
      return hitImportEdge(edge, "optional-absent:import-without-alias");
    }
  }
  if (P === "module") {
    const moduleDeclarations = ctx.declarations.filter((entry) =>
      entry.kindText === "ParserDeclarationModule");
    const moduleRegions = ctx.receipt.regions.filter((entry) =>
      entry.kind === "ParserValueExprRegionModuleHeaderLine");
    if (T("ParserValueTokenModule").length === 0 &&
        moduleDeclarations.length === 0 &&
        moduleRegions.length === 0 &&
        ctx.receipt.tokens.length > 0) {
      return hitModuleSourceTextFact(
        ctx,
        "optional-absent:无 module 头",
        {
          state: "absent",
          moduleDeclarationCount: 0,
          moduleRegionCount: 0,
          moduleTokenCount: 0,
        },
      );
    }
  }
  void mapRow;
  return miss(`${P} optional absent 无证据 @ ${path}`);
}
function matchRepetition(
  P: string,
  obligation: {readonly structuralPath: string; readonly variant: string; readonly bound: number | null},
  ctx: Ctx,
  mapRow: MapRow | undefined,
): MatchResult {
  const variant = obligation.variant;
  const wantCount = variant === "zero" ? 0 : variant === "one" ? 1 : 8;
  const cmp = (count: number) => variant === "bounded_max" ? count >= 8 : count === wantCount;

  if (P === "caseArm") {
    const arm = structuredCaseArms(ctx).find((entry) =>
      cmp(Math.max(0, entry.entries.length - 1)));
    return arm === undefined
      ? miss(`caseArm repetition ${variant} 缺完整 entry 序列`)
      : hitStructuredCaseArm(
          ctx, arm, `case-arm-repetition:${variant}`);
  }
  if (P === "enumFields") {
    const row = ctx.typeSyntaxes.find((entry) =>
      entry.kindText === "ParserTypeSyntaxEnum" &&
      enumTypeVariants(ctx, entry).length > 0 &&
      cmp(Math.max(0, enumTypeVariants(ctx, entry).length - 1)));
    return row === undefined
      ? miss(`enumFields repetition ${variant} 缺 enum variant CSR`)
      : hitTypeSyntax(row, `enum-fields-repetition:${variant}`);
  }
  if (P === "objectFields") {
    const surface = objectFieldsSurfaces(ctx).find((entry) =>
      cmp(Math.max(0, entry.fields.length - 1)));
    return surface === undefined
      ? miss(
          `objectFields repetition ${variant} ` +
          "缺 declaration/TypeSyntax/FieldBlock/direct-field CSR")
      : hitObjectFieldsSurface(
          ctx,
          surface,
          `object-fields-repetition:${variant}`,
        );
  }
  if (P === "typeParamList") {
    const symbol = ctx.typeGenericSymbols.find((entry) => {
      if (entry.ownerTypeSyntaxIndex < 0) return false;
      const owner = ctx.typeSyntaxes[entry.ownerTypeSyntaxIndex]!;
      return entry.ordinal === 0 && cmp(Math.max(0, owner.genericSymbolCount - 1));
    });
    return symbol === undefined
      ? miss(`typeParamList repetition ${variant} 缺 generic symbol CSR`)
      : hitTypeGenericSymbol(symbol, `type-param-list-repetition:${variant}`);
  }
  if (P === "tupleType" &&
      obligation.structuralPath === "root.sequence3") {
    const row = ctx.typeSyntaxes.find((entry) =>
      exactTypeProductionSyntax(ctx, P, entry) &&
      entry.childCount >= 1 &&
      cmp(Math.max(0, entry.childCount - 1)));
    return row === undefined
      ? miss(`tupleType repetition ${variant} 缺 exact child CSR`)
      : hitTypeSyntax(row, `tuple-type-repetition:${variant}`);
  }
  if (P === "pattern") {
    const kindByPath: Readonly<Record<string, string>> = {
      "root.choice3.sequence2": "ParserPatternTuple",
      "root.choice4.sequence1.optional0.sequence1": "ParserPatternSequence",
      "root.choice5.sequence2": "ParserPatternObject",
    };
    const kind = kindByPath[obligation.structuralPath];
    const row = kind === undefined
      ? undefined
      : ctx.patterns.find((entry) =>
          entry.kindText === kind &&
          cmp(Math.max(0, entry.childCount - 1)));
    return row === undefined
      ? miss(`pattern repetition ${obligation.structuralPath}/${variant} 缺 child CSR`)
      : hitPattern(row, `pattern-repetition:${kind}:${variant}`);
  }
  if (P === "variantPattern" || P === "objectPattern") {
    const row = ctx.patterns.find((entry) => {
      if (entry.kindText !== "ParserPatternConstructor") return false;
      if (P === "variantPattern" &&
          patternConstructorClass(ctx, entry) !== "variant") return false;
      if (P === "objectPattern" && entry.childCount < 1) return false;
      return cmp(Math.max(0, entry.childCount - 1));
    });
    return row === undefined
      ? miss(`${P} repetition ${variant} 缺 constructor child CSR`)
      : hitPattern(row, `${P}-repetition:${variant}`);
  }
  if (P === "typePostfix" &&
      obligation.structuralPath ===
        "root.sequence1.repetition0.choice1.sequence1.optional0.sequence1") {
    const row = ctx.typeSyntaxes.find((entry) =>
      [
        "ParserTypeSyntaxBracketApply", "ParserTypeSyntaxSeq",
        "ParserTypeSyntaxFixedArray",
      ].includes(entry.kindText) &&
      cmp(Math.max(0, entry.bracketArgCount - 1)));
    return row === undefined
      ? miss(`typePostfix bracket repetition ${variant} 缺 arg CSR`)
      : hitTypeSyntax(row, `type-postfix-arg-repetition:${variant}`);
  }
  if (P === "typePostfix" &&
      obligation.structuralPath === "root.sequence1") {
    const postfixKinds = new Set([
      "ParserTypeSyntaxQualified", "ParserTypeSyntaxBracketApply",
      "ParserTypeSyntaxSeq", "ParserTypeSyntaxFixedArray",
      "ParserTypeSyntaxOptional",
    ]);
    const chainLength = (entry: DriverTypeSyntax): number => {
      let count = 0;
      let row: DriverTypeSyntax | undefined = entry;
      while (row !== undefined) {
        if (postfixKinds.has(row.kindText)) count += 1;
        const child: DriverTypeSyntax | undefined =
          typeSyntaxChildren(ctx, row)[0];
        row = child;
      }
      return count;
    };
    const row = ctx.typeSyntaxes.find((entry) => cmp(chainLength(entry)));
    return row === undefined
      ? miss(`typePostfix repetition ${variant} 缺 TypeSyntax chain`)
      : hitTypeSyntax(row, `type-postfix-repetition:${variant}`);
  }
  if (P === "algebraicType" || P === "variantType") {
    const kind = P === "algebraicType"
      ? "ParserTypeSyntaxAlgebraic"
      : "ParserTypeSyntaxVariant";
    const row = ctx.typeSyntaxes.find((entry) =>
      entry.kindText === kind && cmp(Math.max(0, entry.childCount - 1)));
    return row === undefined
      ? miss(`${P} repetition ${variant} 缺 TypeSyntax child CSR`)
      : hitTypeSyntax(row, `${P}-repetition:${variant}`);
  }
  if (P === "annotationArgs") {
    const matches = (count: number) =>
      variant === "zero" ? count === 0 :
      variant === "one" ? count === 1 :
      variant === "bounded_max" ? count >= 8 :
      variant === "plus_one_reject" ? count >= 9 : false;
    const annotation = ctx.annotations.find((row) =>
      matches(Math.max(0, row.argRootCount - 1)));
    return annotation === undefined
      ? miss(`annotationArgs repetition ${variant} 缺 parser-owned root CSR`)
      : hitAnnotation(
          ctx, annotation, `annotation-args-repetition:${variant}`);
  }
  if (P === "annotationList" || P === "annotationDict") {
    const kind = P === "annotationList"
      ? "ParserAnnotationArgList"
      : "ParserAnnotationArgDict";
    const matches = (count: number) =>
      variant === "zero" ? count === 0 :
      variant === "one" ? count === 1 :
      variant === "bounded_max" ? count >= 8 :
      variant === "plus_one_reject" ? count >= 9 : false;
    const arg = ctx.annotationArgs.find((row) =>
      row.kindText === kind && matches(Math.max(0, row.childCount - 1)));
    return arg === undefined
      ? miss(`${P} repetition ${variant} 缺 parser-owned child CSR`)
      : hitAnnotationArg(ctx, arg, `${P}-repetition:${variant}`);
  }
  // 二元层算子链
  const levelOps = LEVEL_OPS[P];
  if (levelOps !== undefined) {
    const nodes = ctx.nodesByKind.get("ParserValueExprBinary") ?? [];
    const chainLen = (node: DriverNode): number => {
      const kids = childrenOf(ctx, node);
      if (kids.length !== 2) return 1;
      const op = binaryOperator(ctx, node);
      const left = kids[0]!;
      if (left.kind === "ParserValueExprBinary" && binaryOperator(ctx, left) === op) return 1 + chainLen(left);
      return 1;
    };
    const lengths = nodes.filter((n) => levelOps.includes(binaryOperator(ctx, n))).map(chainLen);
    const maxLen = lengths.length === 0 ? 0 : Math.max(...lengths);
    if (variant === "zero") {
      // 只有正式 statement root 直接落到 factor/postfix 根，才能证明该层
      // repetition 为零；嵌套原子或任意非 Binary 节点不能替外层表达式作证。
      const plain = ctx.receipt.statementRoots.find((statement) =>
        POSTFIX_ROOT_NODE_KINDS.has(
          nodeAt(ctx, statement.nodeIndex).kind));
      if (plain !== undefined) {
        return hitStatementRoot(
          ctx, plain, `rep-zero:无${P}算子表达式根`);
      }
      return miss(`${P} 无零算子 statement root`);
    }
    const hitChain = nodes.find((n) => levelOps.includes(binaryOperator(ctx, n)) &&
      (variant === "one" ? chainLen(n) === 1 : chainLen(n) >= 8));
    void maxLen;
    if (hitChain !== undefined) return hitNode(ctx, hitChain, `rep:${P}链(${variant})`);
    return miss(`${P} 链长不满足 ${variant}(max=${maxLen})`);
  }

  // elif 计数(按构造块: 语句看缩进块, 表达式看节点 span)
  if (P === "ifStmt" || P === "whenStmt" || P === "ifExpr" || P === "whenExpr") {
    if (P === "ifExpr" || P === "whenExpr") {
      const kindName = P === "ifExpr" ? "ParserValueExprIf" : "ParserValueExprWhen";
      const node = (ctx.nodesByKind.get(kindName) ?? []).find((n) => {
        const elifs = tokensInSpan(ctx, n.spanStart, n.spanEnd).filter((t) => tokenName(ctx, t) === "ParserValueTokenElif").length;
        return variant === "bounded_max" ? elifs >= 8 : elifs === wantCount;
      });
      if (node !== undefined) return hitNode(ctx, node, `rep:elif-in-${P}(${variant})`);
      return miss(`${P} elif 计数不满足 ${variant}`);
    }
    const kwName = P === "ifStmt" ? "ParserValueTokenIf" : "ParserValueTokenWhen";
    for (const kw of tokensNamed(ctx, kwName)) {
      // 块结束: 列 < kw 列, 或同列但非 Elif/Else 的行首 token
      const blockEnd = ctx.receipt.tokens.find((t) => t.line > kw.line &&
        (t.column < kw.column || (t.column === kw.column &&
          !["ParserValueTokenElif", "ParserValueTokenElse"].includes(tokenName(ctx, t)))));
      const endLine = blockEnd === undefined ? Number.MAX_SAFE_INTEGER : blockEnd.line;
      const elifs = ctx.receipt.tokens.filter((t) => tokenName(ctx, t) === "ParserValueTokenElif" &&
        t.line > kw.line && t.line < endLine && t.column === kw.column).length;
      if (variant === "bounded_max" ? elifs >= 8 : elifs === wantCount) return hitToken(ctx, kw, `rep:elif块内×${elifs}(${variant})`);
    }
    return miss(`elif 块内计数不满足 ${variant}`);
  }

  // 分支计数(按构造块): match 臂 / case 分支
  if (P === "matchStmt" || P === "caseStmt" || P === "caseExpr" || P === "matchArm" || P === "caseBranch" || P === "caseExprBranch") {
    const isMatch = P === "matchStmt" || P === "matchArm";
    // caseExpr: 首个 caseExprBranch 已在 repetition 外；重复次数=Of 数-1。
    if (P === "caseExpr" || P === "caseExprBranch") {
      for (const node of ctx.nodesByKind.get("ParserValueExprCase") ?? []) {
        const count = tokensInSpan(ctx, node.spanStart, node.spanEnd).filter((t) => tokenName(ctx, t) === "ParserValueTokenOf").length;
        const repCount = count - 1;
        if (variant === "zero" && repCount === 0) return hitNode(ctx, node, "rep-zero:单 caseExpr 分支");
        if (variant === "one" && repCount === 1) return hitNode(ctx, node, "rep-one:双 caseExpr 分支");
        if (variant === "bounded_max" && repCount >= 8) return hitNode(ctx, node, `rep-max:caseExpr 追加分支×${repCount}`);
      }
      return miss(`caseExpr 分支计数不满足 ${variant}`);
    }
    if (P === "caseStmt") {
      const firstTokens = lineFirstToken(ctx);
      const orderedLines = [...firstTokens.keys()].sort((a, b) => a - b);
      const indentPath = obligation.structuralPath.includes(
        "group0.choice0.sequence2");
      const flatPath = obligation.structuralPath.includes(
        "group0.choice1.sequence1");
      for (const kw of tokensNamed(ctx, "ParserValueTokenCase")) {
        let branchColumn = -1;
        let branchCount = 0;
        for (const line of orderedLines) {
          if (line <= kw.line) continue;
          const token = firstTokens.get(line)!;
          const kind = tokenName(ctx, token);
          const isBranch = ["ParserValueTokenOf",
            "ParserValueTokenElse"].includes(kind);
          if (branchColumn < 0) {
            if (token.column < kw.column ||
                (token.column === kw.column && !isBranch)) {
              break;
            }
            if (!isBranch) continue;
            branchColumn = token.column;
            branchCount = 1;
            continue;
          }
          if (token.column < branchColumn ||
              (token.column === branchColumn && !isBranch)) {
            break;
          }
          if (token.column === branchColumn && isBranch) {
            branchCount += 1;
          }
        }
        if (branchCount <= 0) continue;
        const flat = branchColumn === kw.column;
        if ((indentPath && flat) || (flatPath && !flat)) continue;
        const repetitionCount = branchCount - 1;
        const matched = variant === "zero"
          ? repetitionCount === 0
          : variant === "one"
            ? repetitionCount === 1
            : repetitionCount >= 8;
        if (matched) {
          return hitToken(
            ctx,
            kw,
            `caseStmt-additional-branches:${repetitionCount}(${variant})`,
          );
        }
      }
      return miss(`caseStmt 追加分支计数不满足 ${variant}`);
    }
    const kwName = isMatch ? "ParserValueTokenMatch" : "ParserValueTokenCase";
    for (const kw of tokensNamed(ctx, kwName)) {
      // 判定 flat(分支与 kw 同列) 或 INDENT(分支更缩进), 决定块结束列条件
      const firstOf = isMatch ? undefined : ctx.receipt.tokens.find((t) => tokenName(ctx, t) === "ParserValueTokenOf" && t.line > kw.line);
      const flat = firstOf !== undefined && firstOf.column === kw.column;
      const indentPath = obligation.structuralPath.includes(
        "group0.choice0.sequence2");
      const flatPath = obligation.structuralPath.includes(
        "group0.choice1.sequence1");
      if ((indentPath && flat) || (flatPath && !flat)) continue;
      const blockEnd = ctx.receipt.tokens.find((t) => t.line > kw.line &&
        (flat
          ? (t.column < kw.column || (t.column === kw.column && !["ParserValueTokenOf", "ParserValueTokenElse"].includes(tokenName(ctx, t))))
          : t.column <= kw.column));
      const endLine = blockEnd === undefined ? Number.MAX_SAFE_INTEGER : blockEnd.line;
      const inBlock = (t: DriverToken) => t.line > kw.line && t.line < endLine;
      let count: number;
      if (isMatch) {
        count = ctx.receipt.tokens.filter((t, i) => inBlock(t) &&
          tokenName(ctx, t) === "ParserValueTokenAssign" &&
          ctx.receipt.tokens[i + 1] !== undefined && tokenName(ctx, ctx.receipt.tokens[i + 1]!) === "ParserValueTokenGreater").length;
      } else {
        // caseBranch 含 else 臂；首分支在 repetition 外。
        count = ctx.receipt.tokens.filter((t) => inBlock(t) &&
          ["ParserValueTokenOf", "ParserValueTokenElse"].includes(tokenName(ctx, t))).length;
      }
      const sameLineArm = isMatch &&
        ctx.receipt.tokens.some((t, i) => t.line === kw.line && tokenName(ctx, t) === "ParserValueTokenAssign" &&
          ctx.receipt.tokens[i + 1] !== undefined && tokenName(ctx, ctx.receipt.tokens[i + 1]!) === "ParserValueTokenGreater");
      // match 的 {NEWLINE matchArm} 首臂在重复之外 → count-1; case 的 {caseBranch} 全在重复内 → count
      const repCount = isMatch
        ? (count === 0 ? (sameLineArm ? 0 : -1) : count - 1)
        : count - 1;
      if (variant === "zero" && isMatch && repCount === 0 &&
          (count === 1 || sameLineArm)) {
        return hitToken(ctx, kw, "rep-zero:单 match 臂");
      }
      if (variant === "one" && repCount === 1) return hitToken(ctx, kw, `rep-one:${isMatch ? "双臂" : "单分支"}`);
      if (variant === "bounded_max" && repCount >= 8) return hitToken(ctx, kw, `rep-max:${isMatch ? "臂" : "分支"}×${count}`);
    }
    return miss(`分支计数不满足 ${variant}`);
  }

  // 逗号计数类: callSuffix/callArg/tupleLiteral/listLiteralBody/spacePrimary(param/elem/args)
  if (P === "callSuffix" || P === "callArg") {
    const call = (ctx.nodesByKind.get("ParserValueExprCall") ?? []).find((n) => {
      const args = n.childCount - 1;
      return cmp(args - 1) || (variant === "zero" && args === 1) || (variant === "one" && args === 2) || (variant === "bounded_max" && args >= 9);
    });
    if (call !== undefined) return hitNode(ctx, call, `rep:call-args(${variant})`);
    return miss(`call args 计数不满足 ${variant}`);
  }
  if (P === "tupleLiteral" || P === "tupleElement") {
    const tuple = (ctx.nodesByKind.get("ParserValueExprTupleLiteral") ?? []).find((n) => {
      const elems = n.childCount;
      return (variant === "zero" && elems === 1) || (variant === "one" && elems === 2) || (variant === "bounded_max" && elems >= 9);
    });
    if (tuple !== undefined) return hitNode(ctx, tuple, `rep:tuple-elems(${variant})`);
    return miss(`tuple 元素计数不满足 ${variant}`);
  }
  if (P === "listLiteralBody" || P === "listLiteral") {
    const list = (ctx.nodesByKind.get("ParserValueExprListLiteral") ?? []).find((n) => {
      const elems = n.childCount;
      return (variant === "zero" && elems === 1) || (variant === "one" && elems === 2) || (variant === "bounded_max" && elems >= 9);
    });
    if (list !== undefined) return hitNode(ctx, list, `rep:list-elems(${variant})`);
    if (variant === "zero") {
      const empty = (ctx.nodesByKind.get("ParserValueExprListLiteral") ?? []).find((n) => n.childCount === 0);
      if (empty !== undefined) return hitNode(ctx, empty, "rep-zero:空列表");
    }
    return miss(`list 元素计数不满足 ${variant}`);
  }
  if (P === "spacePrimary") {
    const brace = (ctx.nodesByKind.get("ParserValueExprBraceLiteral") ?? []).find((n) => {
      const elems = n.childCount;
      return (variant === "zero" && elems === 1) || (variant === "one" && elems === 2) || (variant === "bounded_max" && elems >= 9);
    });
    if (brace !== undefined) return hitNode(ctx, brace, `rep:brace-elems(${variant})`);
    return miss(`brace 元素计数不满足 ${variant}`);
  }
  if (P === "paramList" || P === "param") {
    // paramList repetition 次数是精确 segment 数减一；嵌套默认值中的
    // 逗号/分号不属于参数分隔符。
    for (const list of parameterListSurfaces(ctx)) {
      const repetitions = Math.max(0, list.segments.length - 1);
      if (cmp(repetitions)) {
        return hitToken(
          ctx,
          list.open,
          `rep:params(${variant},segments=${list.segments.length})`,
        );
      }
    }
    return miss(`param 计数不满足 ${variant}`);
  }
  if (P === "forStmt" || P === "listComprehension") {
    for (const forTok of tokensNamed(ctx, "ParserValueTokenFor")) {
      const inTok = ctx.receipt.tokens.find((t) => t.index > forTok.index && tokenName(ctx, t) === "ParserValueTokenIn");
      if (inTok === undefined) continue;
      const commas = ctx.receipt.tokens.filter((t) => t.index > forTok.index && t.index < inTok.index && tokenName(ctx, t) === "ParserValueTokenComma").length;
      if (cmp(commas)) return hitToken(ctx, forTok, `rep:patterns(${variant},逗号×${commas})`);
    }
    return miss(`pattern 计数不满足 ${variant}`);
  }
  if (P === "module") {
    const path = obligation.structuralPath;
    const importOccurrences = moduleImportOccurrences(ctx);
    const topLevelDeclarations = moduleTopLevelDeclarations(ctx);
    const importCount = importOccurrences.length;
    const declCount = topLevelDeclarations.length;
    if (path === "root.sequence2") {
      const occurrence = importOccurrences[0];
      if (cmp(importCount) && occurrence !== undefined) {
        return hitModuleSourceTextFact(
          ctx,
          `rep:imports×${importCount}`,
          {
            path,
            variant,
            importCount,
            importDeclarationRows: importOccurrences.map(
              (entry) => entry.importDeclarationRow),
            edgeIdentitySha256s: importOccurrences.map((entry) =>
              entry.edges.map((edge) => edge.identitySha256)),
            anchorTokenIdentitySha256: hitToken(
              ctx,
              occurrence.keyword,
              "module-import-anchor",
            ).parserNodeIdentitySha256,
          },
        );
      }
      if (variant === "zero" && importCount === 0) {
        return hitModuleSourceTextFact(
          ctx,
          "rep-zero:无 import",
          {path, variant, importCount: 0},
        );
      }
    }
    if (path === "root.sequence3") {
      const declaration = topLevelDeclarations[0];
      if (cmp(declCount) && declaration !== undefined) {
        return hitModuleSourceTextFact(
          ctx,
          `rep:decls×${declCount}`,
          {
            path,
            variant,
            declarationCount: declCount,
            declarationIdentitySha256s:
              topLevelDeclarations.map((entry) => entry.identitySha256),
            anchorDeclarationIdentitySha256:
              declaration.identitySha256,
          },
        );
      }
      if (variant === "zero" && declCount === 0) {
        const region = moduleHeaderOnlyRegion(ctx);
        return hitModuleSourceTextFact(
          ctx,
          "rep-zero:无 top-level declaration",
          {
            path,
            variant,
            declarationCount: 0,
            moduleDeclarationIdentitySha256s: ctx.declarations
              .filter((entry) =>
                entry.kindText === "ParserDeclarationModule")
              .map((entry) => entry.identitySha256),
            importDeclarationRows:
              importOccurrences.map((entry) => entry.importDeclarationRow),
            moduleHeaderRegionIdentitySha256: region === null
              ? null
              : hitRegion(ctx, region, "module-header-only-region")
                .parserNodeIdentitySha256,
          },
        );
      }
    }
    const occurrences = moduleNewlineOccurrences(ctx, path);
    const occurrence = occurrences.find((entry) => cmp(entry.count));
    if (occurrence !== undefined) {
      return hitModuleSourceTextFact(
        ctx,
        `rep:newline-occurrence(${variant})`,
        {
          path,
          variant,
          count: occurrence.count,
          ...occurrence.fact,
        },
      );
    }
    return occurrences.length === 0
      ? miss(`module NEWLINE occurrence 缺失 @ ${path}`)
      : miss(`module NEWLINE occurrence 不满足 ${variant} @ ${path}`);
  }
  if (P === "importDecl") {
    for (const edge of ctx.importEdges) {
      const itemCount = ctx.importEdges.filter((candidate) =>
        candidate.ownerProducerSourceIndex ===
          edge.ownerProducerSourceIndex &&
        candidate.importDeclarationRow ===
          edge.importDeclarationRow).length;
      const repetitions = Math.max(0, itemCount - 1);
      if (cmp(repetitions)) {
        return hitImportEdge(
          edge,
          `rep:import-items(${variant},items=${itemCount})`,
        );
      }
    }
    return miss(`resolved import item CSR 不满足 ${variant}`);
  }
  if (P === "modulePath") {
    for (const edge of ctx.importEdges) {
      const repetitions =
        Math.max(0, edge.moduleTokenIndexes.length - 1);
      if (cmp(repetitions)) {
        return hitImportEdge(
          edge,
          `rep:module-path(${variant},segments=${
            edge.moduleTokenIndexes.length})`,
        );
      }
    }
    return miss(`resolved module path segment CSR 不满足 ${variant}`);
  }
  if (P === "annotations") {
    // 按声明计连续注解行数: 声明行(fn/type/let/...)前的连续 At 行
    const firstTokens = lineFirstToken(ctx);
    const declLines = [...firstTokens.entries()].filter(([, tok]) =>
      ["ParserValueTokenFn", "ParserValueTokenType", "ParserValueTokenLet", "ParserValueTokenVar", "ParserValueTokenConst", "ParserValueTokenIterator", "ParserValueTokenMacro", "ParserValueTokenTemplate", "ParserValueTokenConcept", "ParserValueTokenTrait"].includes(tokenName(ctx, tok)));
    for (const [line] of declLines.sort((a, b) => a[0] - b[0])) {
      let run = 0;
      let cursor = line - 1;
      while (firstTokens.has(cursor) && tokenName(ctx, firstTokens.get(cursor)!) === "ParserValueTokenAt") {
        run += 1;
        cursor -= 1;
      }
      if (run > 0 &&
          (variant === "one" && run === 1 ||
           variant === "bounded_max" && run >= 8)) {
        const anchor =
          firstTokens.get(variant === "one" ? line - 1 : line - 8);
        const annotation = anchor === undefined
          ? undefined
          : ctx.annotations.find((row) =>
              row.spanStart <= anchor.start && row.spanEnd >= anchor.end);
        if (annotation !== undefined) {
          return hitAnnotation(
            ctx,
            annotation,
            `annotations-repetition:${variant}:${run}`,
          );
        }
      }
    }
    return miss(
      `annotations 计数不满足 ${variant} 或零次缺 declaration-owned 边`,
    );
  }
  if (P === "suite") {
    for (const scope of ctx.normalizedScopeFacts.filter(
      (entry) => entry.kindText !== "NormalizedScopeRoot")) {
      const statementOrdinals = new Set(
        ctx.normalizedStatementFacts
          .filter((fact) =>
            fact.producerSourceIndex === scope.producerSourceIndex &&
            fact.lexicalScopeId === scope.scopeId)
          .map((fact) => fact.statementOrdinal),
      );
      const directCount = statementOrdinals.size;
      if (directCount <= 0) continue;
      const repetitionCount = directCount - 1;
      const matched = variant === "zero"
        ? repetitionCount === 0
        : variant === "one"
          ? repetitionCount === 1
          : repetitionCount >= 8;
      if (matched) {
        return hitNormalizedScopeFact(
          ctx,
          scope,
          `suite-direct-normalized-statements:${
            directCount}(${variant})`,
        );
      }
    }
    return miss(`suite 追加语句计数不满足 ${variant}`);
  }
  if (P === "postfix" || P === "spaceAtom") {
    // 后缀链: Field/Call/Index/Slice/Try 节点链长
    const postfixKinds = ["ParserValueExprField", "ParserValueExprCall", "ParserValueExprIndex", "ParserValueExprSlice", "ParserValueExprTry"];
    const isPost = (n: DriverNode) => postfixKinds.includes(n.kind);
    const chainLen = (n: DriverNode): number => {
      let count = 0;
      let cursor: number = n.index;
      while (cursor >= 0 && isPost(nodeAt(ctx, cursor))) {
        count += 1;
        const kids = childrenOf(ctx, nodeAt(ctx, cursor));
        cursor = kids.length > 0 ? kids[0]!.index : -1;
      }
      return count;
    };
    if (variant === "zero") {
      const plain = ctx.receipt.nodes.find((n) => !isPost(n) && n.childCount === 0 && (n.parent < 0 || !isPost(nodeAt(ctx, n.parent))));
      if (plain !== undefined) return hitNode(ctx, plain, "rep-zero:裸原子(无后缀)");
      return miss("无裸原子节点");
    }
    const chain = ctx.receipt.nodes.find((n) => isPost(n) && (variant === "one" ? chainLen(n) === 1 : chainLen(n) >= 8));
    if (chain !== undefined) return hitNode(ctx, chain, `rep:postfix链(${variant})`);
    return miss(`postfix 链长不满足 ${variant}`);
  }
  if (P === "bindingDecl" || P === "fnDecl" || P === "typeDecl") {
    // 块条目重复: 块 opener(行内仅一个 storage/fn/type token)后的等缩进条目行计数
    const openerNames = P === "bindingDecl"
      ? ["ParserValueTokenLet", "ParserValueTokenVar", "ParserValueTokenConst"]
      : P === "fnDecl" ? ["ParserValueTokenFn"] : ["ParserValueTokenType"];
    const firstTokens = lineFirstToken(ctx);
    for (const opener of ctx.receipt.tokens) {
      if (!openerNames.includes(tokenName(ctx, opener))) continue;
      const lineToks = ctx.receipt.tokens.filter((t) => t.line === opener.line);
      if (lineToks.length !== 1) continue; // 非块 opener
      // 条目 = 之后 col > opener.col 的行, 最小缩进列
      let minCol = Number.MAX_SAFE_INTEGER;
      for (const [line, tok] of [...firstTokens.entries()].sort((a, b) => a[0] - b[0])) {
        if (line <= opener.line) continue;
        if (tok.column <= opener.column) break;
        if (tok.column < minCol) minCol = tok.column;
      }
      if (minCol === Number.MAX_SAFE_INTEGER) continue;
      let entries = 0;
      for (const [line, tok] of [...firstTokens.entries()].sort((a, b) => a[0] - b[0])) {
        if (line <= opener.line) continue;
        if (tok.column <= opener.column) break;
        if (tok.column === minCol) entries += 1;
      }
      const reps = entries - 1;
      if (variant === "zero" && reps === 0) return hitToken(ctx, opener, `rep-zero:单条目块`);
      if (variant === "one" && reps === 1) return hitToken(ctx, opener, `rep-one:双条目块`);
      if (variant === "bounded_max" && reps >= 8) return hitToken(ctx, opener, `rep-max:条目×${entries}`);
    }
    return miss(`${P} 块条目计数不满足 ${variant}`);
  }
  void mapRow;
  return unsup(`repetition 未覆盖通道: ${P} @ ${obligation.structuralPath} ${variant}`);
}

function matchRecursion(P: string, variant: string, ctx: Ctx, mapRow: MapRow | undefined): MatchResult {
  const want = variant === "depth_zero" ? 0 : variant === "depth_one" ? 1 : 3;
  if (P === "suite") {
    const scope = ctx.normalizedScopeFacts.find((entry) => {
      if (entry.kindText === "NormalizedScopeRoot") return false;
      let depth = 0;
      let parent = entry.parentScopeIndex;
      while (parent >= 0) {
        const owner = ctx.normalizedScopeFacts[parent]!;
        if (owner.kindText !== "NormalizedScopeRoot") depth += 1;
        parent = owner.parentScopeIndex;
      }
      return variant === "bounded_depth" ? depth >= 3 : depth === want;
    });
    return scope === undefined
      ? miss(`suite recursion ${variant} 缺 normalized scope parent chain`)
      : hitNormalizedScopeFact(
          ctx, scope, `suite-recursion:${variant}`);
  }
  if (P === "deferStmt") {
    const defers = ctx.normalizedStatementFacts.filter(
      (entry) => entry.kindText === "NormalizedExprDeferStmt");
    const byOrdinal = new Map(defers.map(
      (entry) => [entry.statementOrdinal, entry]));
    const fact = defers.find((entry) => {
      let depth = 0;
      let owner = entry.deferOwnerStatementOrdinal;
      const seen = new Set<number>();
      while (owner >= 0) {
        if (seen.has(owner)) return false;
        seen.add(owner);
        const parent = byOrdinal.get(owner);
        if (parent === undefined) break;
        depth += 1;
        owner = parent.deferOwnerStatementOrdinal;
      }
      return variant === "bounded_depth" ? depth >= 3 : depth === want;
    });
    return fact === undefined
      ? miss(`deferStmt recursion ${variant} 缺 exact defer owner chain`)
      : hitNormalizedStatementFact(
          fact, `defer-recursion:${variant}`);
  }
  if (P === "caseArm" || P === "caseEntry") {
    for (const arm of structuredCaseArms(ctx)) {
      for (const entry of arm.entries) {
        const pattern = ctx.patterns.find((row) =>
          row.identitySha256 === entry.parserNodeIdentitySha256);
        if (pattern === undefined) continue;
        const depth = patternSubtreeDepth(ctx, pattern);
        const matched = variant === "bounded_depth"
          ? depth >= 3
          : depth === want;
        if (!matched) continue;
        return P === "caseArm"
          ? hitStructuredCaseArm(
              ctx, arm, `caseArm-recursion:${variant}`)
          : hitPattern(pattern, `caseEntry-recursion:${variant}`);
      }
    }
    return miss(
      `${P} recursion ${variant} 缺 exact CaseArm owner Pattern subtree`);
  }
  if (P === "conceptDecl" || P === "traitDecl" ||
      P === "conceptStmt" || P === "traitStmt") {
    const conceptProduction =
      P === "conceptDecl" || P === "conceptStmt";
    const expectedKind = conceptProduction
      ? "ParserDeclarationConcept"
      : "ParserDeclarationTrait";
    const surface = conceptTraitDeclarationSurfaces(
      ctx,
      expectedKind,
    ).find((entry) => {
      const depth =
        declarationNestingDepth(ctx, entry.declaration);
      return variant === "bounded_depth"
        ? depth >= 3
        : depth === want;
    });
    return surface === undefined
      ? miss(
          `${P} recursion ${variant} ` +
          "缺 declaration owner/suite/generic 精确链")
      : hitConceptTraitDeclaration(
          ctx,
          surface.declaration,
          surface.region,
          `${P}-recursion:${variant}`,
        );
  }
  if (P === "objectFields") {
    const surface = objectFieldsSurfaces(ctx).find((entry) =>
      variant === "bounded_depth"
        ? entry.depth >= 3
        : entry.depth === want);
    return surface === undefined
      ? miss(
          `objectFields recursion ${variant} ` +
          "缺 TypeSyntax declaration-owner/FieldBlock/direct-field CSR")
      : hitObjectFieldsSurface(
          ctx,
          surface,
          `object-fields-recursion:${variant}`,
        );
  }
  if (P === "enumFields") {
    const row = ctx.typeSyntaxes.find((entry) => {
      if (entry.kindText !== "ParserTypeSyntaxEnum" ||
          enumTypeVariants(ctx, entry).length === 0) return false;
      const depth = typeSyntaxAncestorDepth(ctx, entry);
      return variant === "bounded_depth" ? depth >= 3 : depth === want;
    });
    return row === undefined
      ? miss(`enumFields recursion ${variant} 缺 enum owner parent chain`)
      : hitTypeSyntax(row, `enum-fields-recursion:${variant}`);
  }
  if (P === "lvalue") {
    const value = structuredLValues(ctx).find((entry) => {
      const depth = structuredLValuePostfixDepth(ctx, entry);
      return variant === "bounded_depth" ? depth >= 3 : depth === want;
    });
    return value === undefined
      ? miss(`lvalue recursion ${variant} 缺 exact writable postfix chain`)
      : {
          ...value.hit,
          channel: `lvalue-recursion:${variant}`,
        };
  }
  if (P === "typeArg") {
    const arg = ctx.typeSyntaxBracketArgs.find((entry) => {
      if (entry.typeSyntaxIndex < 0) return false;
      let depth = 0;
      let owner = ctx.typeSyntaxParents[entry.ownerTypeSyntaxIndex] ?? -1;
      while (owner >= 0) {
        const parent = ctx.typeSyntaxes[owner]!;
        if (parent.kindText === "ParserTypeSyntaxBracketApply" &&
            ctx.typeSyntaxBracketArgs
              .slice(
                parent.bracketArgStart,
                parent.bracketArgStart + parent.bracketArgCount,
              )
              .some((candidate) =>
                candidate.typeSyntaxIndex ===
                  entry.ownerTypeSyntaxIndex)) {
          depth += 1;
        }
        owner = ctx.typeSyntaxParents[owner] ?? -1;
      }
      return variant === "bounded_depth" ? depth >= 3 : depth === want;
    });
    return arg === undefined
      ? miss(`typeArg recursion ${variant} 缺 bracket TypeSyntax parent chain`)
      : hitTypeSyntaxBracketArg(
          ctx, arg, `typeArg-recursion:${variant}`);
  }
  if ([
    "objectType",
    "implicitObjectType",
    "procType",
    "tupleType",
    "setType",
    "enumType",
    "refType",
    "varType",
  ].includes(P)) {
    const row = ctx.typeSyntaxes.find((entry) => {
      if (!exactTypeProductionSyntax(ctx, P, entry)) return false;
      const depth = typeSyntaxAncestorDepth(ctx, entry);
      return variant === "bounded_depth" ? depth >= 3 : depth === want;
    });
    return row === undefined
      ? miss(`${P} recursion ${variant} 缺 exact TypeSyntax parent chain`)
      : hitTypeSyntax(row, `${P}-recursion:${variant}`);
  }
  if (P === "typeExpr" || P === "typePostfix" ||
      P === "typePrimary") {
    const row = ctx.typeSyntaxes.find((entry) => {
      if (P === "typePrimary" &&
          entry.kindText !== "ParserTypeSyntaxNominal") return false;
      if (P === "typePostfix" && ![
        "ParserTypeSyntaxNominal", "ParserTypeSyntaxQualified",
        "ParserTypeSyntaxBracketApply", "ParserTypeSyntaxSeq",
        "ParserTypeSyntaxFixedArray", "ParserTypeSyntaxGrouped",
        "ParserTypeSyntaxOptional",
      ].includes(entry.kindText)) return false;
      const depth = typeSyntaxAncestorDepth(ctx, entry);
      return variant === "bounded_depth" ? depth >= 3 : depth === want;
    });
    return row === undefined
      ? miss(`${P} recursion ${variant} 缺 TypeSyntax parent chain`)
      : hitTypeSyntax(row, `${P}-recursion:${variant}`);
  }
  if (P === "typeParam" || P === "typeParamList") {
    const symbol = ctx.typeGenericSymbols.find((entry) => {
      if (entry.ownerTypeSyntaxIndex < 0) return false;
      const depth = typeSyntaxAncestorDepth(
        ctx, ctx.typeSyntaxes[entry.ownerTypeSyntaxIndex]!);
      return variant === "bounded_depth" ? depth >= 3 : depth === want;
    });
    return symbol === undefined
      ? miss(`${P} recursion ${variant} 缺 generic owner chain`)
      : hitTypeGenericSymbol(symbol, `${P}-recursion:${variant}`);
  }
  if (P === "pattern" || P === "variantPattern" ||
      P === "rangePattern" || P === "objectPattern" ||
      P === "patternArg") {
    const row = ctx.patterns.find((entry) => {
      if (P === "rangePattern" &&
          entry.kindText !== "ParserPatternRange") return false;
      if ((P === "variantPattern" || P === "objectPattern") &&
          entry.kindText !== "ParserPatternConstructor") return false;
      if (P === "patternArg" &&
          entry.kindText === "ParserPatternInvalid") return false;
      if (P === "variantPattern" &&
          patternConstructorClass(ctx, entry) !== "variant") return false;
      if (P === "objectPattern" && entry.childCount < 1) return false;
      const depth = patternAncestorDepth(ctx, entry);
      return variant === "bounded_depth" ? depth >= 3 : depth === want;
    });
    return row === undefined
      ? miss(`${P} recursion ${variant} 缺 Pattern parent chain`)
      : hitPattern(row, `${P}-recursion:${variant}`);
  }
  if (P === "algebraicType" || P === "variantType") {
    const kind = P === "algebraicType"
      ? "ParserTypeSyntaxAlgebraic"
      : "ParserTypeSyntaxVariant";
    const row = ctx.typeSyntaxes.find((entry) => {
      if (entry.kindText !== kind) return false;
      const depth = typeSyntaxSameKindAncestorDepth(ctx, entry);
      return variant === "bounded_depth" ? depth >= 3 : depth === want;
    });
    return row === undefined
      ? miss(`${P} recursion ${variant} 缺 TypeSyntax parent chain`)
      : hitTypeSyntax(row, `${P}-recursion:${variant}`);
  }
  if (P === "annotationArg" || P === "annotationList" ||
      P === "annotationDict" || P === "annotationEntry") {
    const productionKind = P === "annotationList"
      ? "ParserAnnotationArgList"
      : P === "annotationDict"
        ? "ParserAnnotationArgDict"
        : P === "annotationEntry"
          ? "ParserAnnotationArgKeyValue"
          : null;
    const ancestorDepth = (row: DriverAnnotationArg): number => {
      let depth = 0;
      let parent = ctx.annotationArgParents[row.index] ?? -1;
      while (parent >= 0) {
        const parentRow = ctx.annotationArgs[parent]!;
        if (productionKind === null || parentRow.kindText === productionKind) depth += 1;
        parent = ctx.annotationArgParents[parent] ?? -1;
      }
      return depth;
    };
    const matches = (depth: number) =>
      variant === "depth_zero" ? depth === 0 :
      variant === "depth_one" ? depth === 1 :
      variant === "bounded_depth" ? depth >= 3 :
      variant === "plus_one_reject" ? depth >= 4 : false;
    const arg = ctx.annotationArgs.find((row) =>
      (productionKind === null || row.kindText === productionKind) &&
      matches(ancestorDepth(row)));
    return arg === undefined
      ? miss(`${P} recursion ${variant} 缺 parser-owned child chain`)
      : hitAnnotationArg(ctx, arg, `${P}-recursion:${variant}`);
  }
  // 表达式转发链: 括号深度
  const chain = ["expression", "conditionalExpr", "logicalOr", "logicalAnd", "bitwiseOr", "bitwiseXor", "bitwiseAnd", "equality", "comparison", "membership", "rangeExpr", "sum", "term", "factor", "postfix", "unary", "primary"];
  if (chain.includes(P)) {
    const match = ctx.receipt.nodes
      .map((node) => ({
        node,
        activeParens: activeParenTokensAt(ctx, node),
      }))
      .find(({node, activeParens}) => {
        const depth = activeParens.length;
        if (node.childCount !== 0) return false;
        return variant === "bounded_depth" ? depth >= 3 : depth === want;
      });
    if (match !== undefined) {
      return hitParenRecursion(
        ctx,
        match.node,
        match.activeParens,
        `rec:paren-depth(${variant})`,
      );
    }
    return miss(`链递归深度 ${variant} 无原子节点命中`);
  }
  // 包装节点: 同 kind 祖先计数
  const wrapperKinds: Record<string, readonly string[]> = {
    tupleLiteral: ["ParserValueExprTupleLiteral"], tupleElement: ["ParserValueExprTupleLiteral"],
    listLiteral: ["ParserValueExprListLiteral"], listLiteralBody: ["ParserValueExprListLiteral"],
    listComprehension: ["ParserValueExprComprehension"], comprehension: ["ParserValueExprComprehension"],
    ifExpr: ["ParserValueExprIf"], whenExpr: ["ParserValueExprWhen"],
    caseExpr: ["ParserValueExprCase"], caseExprBranch: ["ParserValueExprCaseBranch"],
    fnLiteral: ["ParserValueExprFunctionLiteral"], iteratorLiteral: ["ParserValueExprIteratorLiteral"],
    callSuffix: ["ParserValueExprCall"], callArg: ["ParserValueExprCall"],
    spaceCall: ["ParserValueExprSpaceCall"], spaceAtom: ["ParserValueExprSpaceCall"], spacePrimary: ["ParserValueExprSpaceCall"],
  };
  const wk = wrapperKinds[P];
  if (wk !== undefined) {
    const node = (wk.flatMap((k) => ctx.nodesByKind.get(k) ?? [])).find((n) => {
      const depth = sameKindAncestorCount(ctx, n);
      return variant === "bounded_depth" ? depth >= 3 : depth === want;
    });
    if (node !== undefined) return hitNode(ctx, node, `rec:node-depth(${variant})`);
    return miss(`${P} 节点嵌套深度 ${variant} 无命中`);
  }
  // 语句类: keyword 缩进嵌套
  const stmtKeyword: Record<string, string> = {
    ifStmt: "ParserValueTokenIf", whileStmt: "ParserValueTokenWhile", forStmt: "ParserValueTokenFor",
    whenStmt: "ParserValueTokenWhen", deferStmt: "ParserValueTokenDefer", blockStmt: "ParserValueTokenBlock",
    matchStmt: "ParserValueTokenMatch", caseStmt: "ParserValueTokenCase",
    suite: "ParserValueTokenIf", statement: "ParserValueTokenIf", statementCore: "ParserValueTokenIf",
    matchArm: "ParserValueTokenMatch", caseBranch: "ParserValueTokenCase",
  };
  const kw = stmtKeyword[P];
  if (kw !== undefined) {
    const depth = keywordNestDepth(ctx, kw);
    const maxDepth = depth - 1; // 最内层为 depth 0
    if (variant === "depth_zero" && maxDepth >= 0) return hitToken(ctx, tokensNamed(ctx, kw)[0]!, "rec:stmt-nest(0)");
    if (variant === "depth_one" && maxDepth >= 1) return hitToken(ctx, tokensNamed(ctx, kw)[0]!, "rec:stmt-nest(1)");
    if (variant === "bounded_depth" && maxDepth >= 3) return hitToken(ctx, tokensNamed(ctx, kw)[0]!, "rec:stmt-nest(3)");
    return miss(`${P} 缩进嵌套深度不足(${maxDepth})`);
  }
  // decl/语句 role 类: exact FunctionLiteral span containment
  const roleByP = STMT_ROLE[P];
  if (roleByP !== undefined) {
    const wanted = roleByP[0] === "__any__" ? null : new Set(roleByP);
    const match = ctx.receipt.statementRoots
      .map((root) => ({
        root,
        owners: functionLiteralOwnersOfStatementRoot(ctx, root),
      }))
      .find(({root, owners}) => {
        if (wanted !== null && !wanted.has(root.role)) return false;
        const depth = owners.length;
        return variant === "bounded_depth" ? depth >= 3 : depth === want;
      });
    if (match !== undefined) {
      return hitStatementRootRecursion(
        ctx,
        match.root,
        match.owners,
        `rec:fnlit-depth(${variant})`,
      );
    }
  }
  void mapRow;
  return unsup(`recursion 未覆盖通道: ${P} ${variant}`);
}

// ---------------------------------------------------------------- receipt 装配
export function receiptForHit(
  obligation: Pick<ChengGrammarObligation, "obligationId" | "production" | "kind" | "structuralPath" | "variant" | "bound">,
  hit: MatchHit,
  ctx: Ctx,
  relativePath: string,
): GrammarParserSpanReceipt {
  const canonicalSpan = canonicalParserTokenSpanFromReceipt(
    ctx.source,
    ctx.receipt.tokens,
    ctx.tokenNames,
    hit.charStart,
    hit.charEnd,
  );
  const identity = {
    schema: CHENG_GRAMMAR_PARSER_SPAN_RECEIPT_SCHEMA as typeof CHENG_GRAMMAR_PARSER_SPAN_RECEIPT_SCHEMA,
    stage: "parser" as const,
    obligationId: obligation.obligationId,
    production: obligation.production,
    kind: obligation.kind,
    structuralPath: obligation.structuralPath,
    variant: obligation.variant,
    bound: obligation.bound,
    relativePath,
    sourceSha256: ctx.receipt.sourceSha256,
    ...canonicalSpan,
    parserNodeKind: hit.parserNodeKind,
    parserNodeIdentitySha256: hit.parserNodeIdentitySha256,
    parserTraceRootSha256: ctx.receipt.parserTraceRootSha256,
    driverBytesSha256: ctx.receipt.driverBytesSha256,
    toolchainManifestSha256: ctx.receipt.toolchainManifestSha256,
  };
  return {...identity, receiptSha256: hashCanonical(identity)};
}

export interface BindOneResult {
  readonly obligationId: string;
  readonly production: string;
  readonly kind: string;
  readonly variant: string;
  readonly result: MatchResult;
  readonly receipt: GrammarParserSpanReceipt | null;
}

export function registeredAnnotationNamesFromFormalSpec(
  formalSpecSource: string,
): readonly string[] {
  const start = formalSpecSource.indexOf("当前注册表为");
  const end = start < 0
    ? -1
    : formalSpecSource.indexOf("；其他名字", start);
  if (start < 0 || end < 0) {
    throw new Error("current_annotation_registry_missing");
  }
  const names = [...formalSpecSource
    .slice(start, end)
    .matchAll(/`([a-z][a-z0-9_]*)`/g)]
    .map((match) => match[1]!);
  if (names.length === 0 ||
      new Set(names).size !== names.length) {
    throw new Error("current_annotation_registry_invalid");
  }
  return Object.freeze(names);
}

export function bindReceiptAgainstObligations(
  receiptJson: string,
  source: string,
  obligations: readonly ChengGrammarObligation[],
  tokenNames: readonly string[],
  mapRows: ReadonlyMap<string, MapRow>,
  valueExprKindNames: readonly string[] =
    valueExprKindNamesFromParserSource(
      readFileSync(PARSER_PATH, "utf8"),
    ),
): {readonly ctx: Ctx; readonly results: BindOneResult[]} {
  const receipt = parseUniqueCurrentJson(
    receiptJson,
    "driver_receipt",
  ) as DriverReceipt;
  validateDriverReceiptToolchainIdentityValue(receipt);
  if (receipt.schema !== "cheng_driver_parse_receipt" ||
      receipt.stage !== "parser") {
    throw new Error(
      `driver receipt schema/stage 不符: ${receipt.schema}/${receipt.stage}`,
    );
  }
  if (sha256(source) !== receipt.sourceSha256) throw new Error(`driver receipt sourceSha256 与源字节不符: ${receipt.relativePath}`);
  const ctx = buildCtx(
    receipt,
    source,
    tokenNames,
    valueExprKindNames,
  );
  const results: BindOneResult[] = [];
  for (const obligation of obligations) {
    if (obligation.disposition !== "required") continue;
    const mr = matchObligation(obligation, ctx, mapRows.get(obligation.production));
    const gsr = mr.kind === "hit" ? receiptForHit(obligation, mr, ctx, receipt.relativePath) : null;
    results.push({obligationId: obligation.obligationId, production: obligation.production, kind: obligation.kind, variant: obligation.variant, result: mr, receipt: gsr});
  }
  return {ctx, results};
}

export function bindCurrentReceiptAgainstObligations(
  receiptJson: string,
  source: string,
  formalSpecSource: string,
  obligations: readonly ChengGrammarObligation[],
  tokenNames: readonly string[],
  mapRows: ReadonlyMap<string, MapRow>,
  valueExprKindNames: readonly string[] =
    valueExprKindNamesFromParserSource(
      readFileSync(PARSER_PATH, "utf8"),
    ),
): {readonly ctx: Ctx; readonly results: BindOneResult[]} {
  const bound = bindReceiptAgainstObligations(
    receiptJson,
    source,
    obligations,
    tokenNames,
    mapRows,
    valueExprKindNames,
  );
  const registered = new Set(
    registeredAnnotationNamesFromFormalSpec(formalSpecSource),
  );
  for (const annotation of bound.ctx.annotations) {
    const nameToken =
      bound.ctx.receipt.tokens[annotation.nameTokenIndex]!;
    const name = tokenText(bound.ctx, nameToken);
    if (!registered.has(name)) {
      throw new Error(`current_unknown_annotation_admission:${name}`);
    }
  }
  return bound;
}

// ---------------------------------------------------------------- CLI
function mainBind() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const tokenNames = loadTokenKindNames(PARSER_PATH);
  const valueExprKindNames =
    valueExprKindNamesFromParserSource(
      readFileSync(PARSER_PATH, "utf8"),
    );
  const grammar = buildChengGrammarObligationContract(readFileSync(SPEC_PATH));
  const mapDoc = parseUniqueCurrentJson(
    readFileSync(MAP_PATH, "utf8"),
    "ebnf_parser_node_map",
  ) as {rows: MapRow[]};
  const mapRows = new Map(mapDoc.rows.map((r) => [r.name, r]));
  if (mode === "bind") {
    const receiptPath = args[1];
    const sourcePath = args[2];
    if (receiptPath === undefined || sourcePath === undefined) throw new Error("用法: bind <receipt.json> <sourceFile>");
    const source = readFileSync(sourcePath, "utf8");
    const {results} = bindCurrentReceiptAgainstObligations(
      readFileSync(receiptPath, "utf8"),
      source,
      readFileSync(SPEC_PATH, "utf8"),
      grammar.obligations,
      tokenNames,
      mapRows,
      valueExprKindNames,
    );
    const hits = results.filter((r) => r.result.kind === "hit");
    const receipts = hits.map((r) => r.receipt!);
    console.log(JSON.stringify({hits: hits.length, total: results.length, receipts}, null, 2));
    return;
  }
  throw new Error(`未知模式: ${mode ?? "(空)"}`);
}

if (process.argv[1]?.endsWith("grammar_receipt_bind.ts")) mainBind();
