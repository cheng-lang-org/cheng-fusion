#!/usr/bin/env bun
// grammar_receipt_bind.ts — driver parse-receipt(cheng_driver_parse_receipt.v1) →
// GrammarParserSpanReceipt(cheng_parser_obligation_span_receipt.v1) 的绑定器。
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
//   bun tools/grammar_receipt_bind.ts bind <receipt.json> <sourceFile> [--claims corpus.json]
//   bun tools/grammar_receipt_bind.ts corpus --corpus fixtures/semantic/grammar_corpus/corpus.json \
//        --receipt-dir /tmp/prcorpus --src-dir /tmp/prcorpus_root/src --out /tmp/prcorpus/bind_report.json
//   bun tools/grammar_receipt_bind.ts selftest
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
import {charSpanToTokenSpanCovering, chengPublicTokensLocal} from "./grammar_span_receipt.ts";

const SPEC_PATH = process.env.CHENG_FORMAL_SPEC_PATH ?? "/Users/lbcheng/cheng-lang/docs/cheng-formal-spec.md";
const PARSER_PATH = process.env.CHENG_PARSER_PATH ?? "/Users/lbcheng/cheng-lang/src/core/lang/parser.cheng";
const MAP_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/semantic/ebnf_parser_node_map.json");

function hashCanonical(value: unknown): string {
  return sha256(canonicalJson(value));
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
interface DriverToken {
  readonly index: number; readonly kind: number; readonly sourceTextId: number;
  readonly start: number; readonly end: number; readonly line: number; readonly column: number;
}
interface DriverStatementRoot {
  readonly index: number; readonly nodeIndex: number; readonly role: string;
  readonly anchorLine: number; readonly anchorColumn: number;
  readonly endLine: number; readonly endColumn: number;
}
interface DriverReceipt {
  readonly schema: string; readonly stage: string; readonly relativePath: string;
  readonly sourceSha256: string; readonly driverBytesSha256: string;
  readonly toolchainManifestSha256: string; readonly parserTraceRootSha256: string;
  readonly counts: {readonly nodeCount: number; readonly tokenCount: number; readonly statementRootCount: number; readonly regionCount: number};
  readonly nodes: readonly DriverNode[];
  readonly regions: readonly DriverRegion[];
  readonly tokens: readonly DriverToken[];
  readonly statementRoots: readonly DriverStatementRoot[];
}

// ---------------------------------------------------------------- token 序数表(运行时从 TREE parser.cheng 提取, 防枚举漂移)
export function loadTokenKindNames(parserPath: string): readonly string[] {
  const lines = readFileSync(parserPath, "utf8").split("\n");
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

// ---------------------------------------------------------------- receipt 上下文
interface Ctx {
  readonly receipt: DriverReceipt;
  readonly source: string;
  readonly tokenNames: readonly string[];
  readonly nodesByKind: ReadonlyMap<string, readonly DriverNode[]>;
  readonly fusionTokens: readonly string[];
}

function buildCtx(receipt: DriverReceipt, source: string, tokenNames: readonly string[]): Ctx {
  const byKind = new Map<string, DriverNode[]>();
  for (const node of receipt.nodes) {
    if (!byKind.has(node.kind)) byKind.set(node.kind, []);
    byKind.get(node.kind)!.push(node);
  }
  return {receipt, source, tokenNames, nodesByKind: byKind, fusionTokens: chengPublicTokensLocal(source)};
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
  return ctx.source.slice(token.start, token.end);
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

// 表达式链递归: 节点处的括号平衡深度(全部 driver token, 含 call/tuple/group 括号)
function parenDepthAt(ctx: Ctx, charPos: number): number {
  let depth = 0;
  for (const t of ctx.receipt.tokens) {
    if (t.start >= charPos) break;
    const name = tokenName(ctx, t);
    if (name === "ParserValueTokenLeftParen") depth += 1;
    else if (name === "ParserValueTokenRightParen") depth -= 1;
  }
  return depth;
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

// decl/语句递归: 行被多少个 FunctionLiteral 节点包含
function fnLiteralLineRanges(ctx: Ctx): {startLine: number; endLine: number}[] {
  const out: {startLine: number; endLine: number}[] = [];
  const lineOf = (charPos: number) => ctx.source.slice(0, charPos).split("\n").length;
  for (const node of ctx.nodesByKind.get("ParserValueExprFunctionLiteral") ?? []) {
    out.push({startLine: lineOf(node.spanStart), endLine: lineOf(node.spanEnd)});
  }
  return out;
}

function fnLiteralDepthOfLine(ranges: readonly {startLine: number; endLine: number}[], line: number): number {
  return ranges.filter((r) => r.startLine <= line && line <= r.endLine).length;
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
  return {kind: "hit", charStart: token.start, charEnd: token.end,
    parserNodeKind: name,
    parserNodeIdentitySha256: sha256(`driver-token:${name}:${token.index}:${token.start}:${token.end}`),
    channel};
}

function hitRegion(ctx: Ctx, region: DriverRegion, channel: string): MatchHit {
  return {kind: "hit", charStart: region.spanStart, charEnd: region.spanEnd,
    parserNodeKind: region.kind,
    parserNodeIdentitySha256: sha256(`driver-region:${region.kind}:${region.index}:${region.spanStart}:${region.spanEnd}`),
    channel};
}

function hitSpan(ctx: Ctx, start: number, end: number, kindName: string, channel: string): MatchHit {
  return {kind: "hit", charStart: start, charEnd: end, parserNodeKind: kindName,
    parserNodeIdentitySha256: sha256(`driver-span:${kindName}:${start}:${end}`), channel};
}

// role 命中: span 取 statementRoot 的 anchor token(`=`/return 等, 必为真实 token),
// kind/identity 仍取 value 节点 — 规避字符串字面量 span 无 fusion token 交集的问题。
function hitStatementRoot(ctx: Ctx, root: DriverStatementRoot, channel: string): MatchHit {
  const node = nodeAt(ctx, root.nodeIndex);
  const anchorTok = ctx.receipt.tokens.find((t) => t.line === root.anchorLine && t.column === root.anchorColumn);
  if (anchorTok !== undefined) {
    return {kind: "hit", charStart: anchorTok.start, charEnd: anchorTok.end,
      parserNodeKind: node.kind, parserNodeIdentitySha256: node.identitySha256, channel};
  }
  return hitNode(ctx, node, channel);
}

function miss(reason: string): MatchMiss {return {kind: "no-evidence", reason};}
function unsup(reason: string): MatchMiss {return {kind: "unsupported", reason};}

// ---------------------------------------------------------------- 节点 kind 映射(映射表 node_kinds 中可直接匹配的 ParserValueExpr* 名)
export interface MapRow {readonly name: string; readonly status: string; readonly node_kinds: readonly string[]}

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
  // MAPPED: 节点 kind 直接匹配
  const kinds = mapNodeKinds(mapRow);
  if (kinds.length > 0) {
    const node = hasNodeKind(ctx, kinds);
    if (node !== null) return hitNode(ctx, node, "node-kind");
  }
  // MAPPED 但 node_kinds 是占位说明(expression/conditionalExpr/factor 等): 任意表达式节点即证据
  if (mapRow !== undefined && mapRow.status === "MAPPED") {
    if (["expression", "conditionalExpr", "factor", "spaceAtom", "spacePrimary", "tupleElement"].includes(P)) {
      const any = ctx.receipt.nodes[0];
      if (any !== undefined) return hitNode(ctx, any, `root-any:${P}(转发/占位 production)`);
    }
    // 其余 MAPPED(statement 类): 继续走 role/keyword 表
  }
  // PARTIAL: role / keyword / region / 整文件
  if (P === "module") {
    if (ctx.receipt.tokens.length > 0) {
      const last = ctx.receipt.tokens[ctx.receipt.tokens.length - 1]!;
      return hitSpan(ctx, 0, last.end, "ParsedSourceStub", "whole-file");
    }
    return miss("空 token 流");
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
  if (P === "moduleHeader") {
    const list = tokensNamed(ctx, "ParserValueTokenModule");
    if (list.length > 0) return hitToken(ctx, list[0]!, "keyword:module");
    return miss("无 module 头行");
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
      const anyExpr = ctx.receipt.nodes[0];
      if (anyExpr !== undefined) return hitNode(ctx, anyExpr, "factor-arm:postfix(任意表达式)");
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
      .find((n) => ctx.source.slice(n.spanStart, n.spanEnd) === want);
    if (node !== undefined) return hitNode(ctx, node, `bool:${want}`);
    return miss(`无 ${want} 字面量`);
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
    const importToks = tokensNamed(ctx, "ParserValueTokenImport");
    for (const importTok of importToks) {
      const lineTokens = ctx.receipt.tokens.filter((t) => t.line === importTok.line);
      const grouped = lineTokens.some((t) => tokenText(ctx, t) === "/") && lineTokens.some((t) => tokenName(ctx, t) === "ParserValueTokenLeftBracket");
      if (armIndex === 0 && !grouped) return hitToken(ctx, importTok, "importDecl-arm:plain");
      if (armIndex === 1 && grouped) return hitToken(ctx, importTok, "importDecl-arm:grouped");
    }
    return miss(`importDecl 臂 ${armIndex} 无证据`);
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
  // typeDecl/typeEntry 的 typeExpr|objectType 组臂 与 单行/块臂
  if (P === "typeDecl" || P === "typeEntry") {
    const header = ctx.receipt.regions.find((r) => r.kind === "ParserValueExprRegionTypeDeclHeader");
    if (header === undefined) return miss("无 TypeDeclHeader region");
    const lineTokens = ctx.receipt.tokens.filter((t) => t.line === (ctx.receipt.tokens[header.anchorTokenIndex]?.line ?? -1));
    const textAfter = ctx.source.slice(header.spanEnd, lineTokens.length > 0 ? lineTokens[lineTokens.length - 1]!.end : header.spanEnd);
    if (armIndex === 0 && textAfter.trim().length > 0) return hitRegion(ctx, header, "typeDecl-arm:typeExpr(同行类型文本)");
    if (armIndex === 1) {
      // objectType: 头部行以 = 结尾且后续有缩进字段行(FieldBlock region)
      const fb = ctx.receipt.regions.find((r) => r.kind === "ParserValueExprRegionFieldBlock");
      if (fb !== undefined) return hitRegion(ctx, fb, "typeDecl-arm:objectType(FieldBlock)");
    }
    return miss(`typeDecl 组臂 ${armIndex} 无证据`);
  }
  // suite 两臂
  if (P === "suite") {
    // block: 行尾 `=`/`:` 后, 下一行更缩进
    const firstTokens = lineFirstToken(ctx);
    if (armIndex === 0) {
      for (const [line, tok] of [...firstTokens.entries()].sort((a, b) => a[0] - b[0])) {
        const lineToks = ctx.receipt.tokens.filter((t) => t.line === line);
        const lastTok = lineToks[lineToks.length - 1];
        if (lastTok === undefined) continue;
        if (!["ParserValueTokenAssign", "ParserValueTokenColon"].includes(tokenName(ctx, lastTok))) continue;
        const nextTok = firstTokens.get(line + 1);
        if (nextTok !== undefined && nextTok.column > tok.column) {
          return hitToken(ctx, nextTok, "suite-arm:block(行尾分隔符+缩进体)");
        }
      }
      return miss("无 block suite 形态");
    }
    // inline: `fn f() = 1`/`if x: return 1` 同行语句
    const inlineStmt = ctx.receipt.statementRoots.find((s) =>
      ctx.receipt.tokens.some((t) => t.line === s.anchorLine &&
        ["ParserValueTokenFn", "ParserValueTokenIf", "ParserValueTokenWhile", "ParserValueTokenFor", "ParserValueTokenDefer", "ParserValueTokenBlock", "ParserValueTokenTemplate", "ParserValueTokenMacro", "ParserValueTokenIterator"].includes(tokenName(ctx, t))));
    if (armIndex === 1 && inlineStmt !== undefined) return hitStatementRoot(ctx, inlineStmt, "suite-arm:inline(同行语句)");
    return miss(`suite 臂 ${armIndex} 无证据`);
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
      const region = ctx.receipt.regions.find((r) => r.kind === "ParserValueExprRegionCaseArm");
      if (region !== undefined) return hitRegion(ctx, region, "caseEntry-arm:pattern(CaseArm region)");
      const ofTok = tokensNamed(ctx, "ParserValueTokenOf")[0];
      if (ofTok !== undefined) return hitToken(ctx, ofTok, "caseEntry-arm:pattern(Of token)");
      return miss("无 pattern entry 证据");
    }
    // expression arm: Of 后紧跟二元/调用节点
    const ofTok = tokensNamed(ctx, "ParserValueTokenOf")[0];
    if (ofTok !== undefined) {
      const bin = ctx.receipt.nodes.find((n) =>
        (n.kind === "ParserValueExprBinary" || n.kind === "ParserValueExprCall") && n.spanStart >= ofTok.end);
      if (bin !== undefined) return hitNode(ctx, bin, "caseEntry-arm:expression");
    }
    return miss("无 expression entry 证据");
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
    if (obligation.structuralPath === "root.sequence3.group0" || obligation.structuralPath === "root.sequence3.group0.choice1.sequence1.optional0") {
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
      const call = (ctx.nodesByKind.get("ParserValueExprCall") ?? []).find((n) => {
        const toks = tokensInSpan(ctx, n.spanStart, n.spanEnd);
        return toks.some((t, i) => tokenName(ctx, t) === "ParserValueTokenIdentifier" &&
          toks[i + 1] !== undefined &&
          ["ParserValueTokenAssign", "ParserValueTokenColon"].includes(tokenName(ctx, toks[i + 1]!)));
      });
      return call === undefined ? null : hitNode(ctx, call, "optional:named-arg");
    }
    if (P === "tupleLiteral" || P === "listLiteralBody" || P === "spacePrimary") {
      if (path.endsWith("sequence2")) {
        const closers: Record<string, string> = {tupleLiteral: "ParserValueTokenRightParen", listLiteralBody: "ParserValueTokenRightBracket", spacePrimary: "ParserValueTokenRightBrace"};
        const close = closers[P]!;
        const tok = ctx.receipt.tokens.find((t, i) =>
          tokenName(ctx, t) === "ParserValueTokenComma" &&
          ctx.receipt.tokens[i + 1] !== undefined && tokenName(ctx, ctx.receipt.tokens[i + 1]!) === close);
        return tok === undefined ? null : hitToken(ctx, tok, "optional:trailing-comma");
      }
      const kindName = P === "listLiteralBody" ? "ParserValueExprListLiteral" : "ParserValueExprBraceLiteral";
      const node = (ctx.nodesByKind.get(kindName) ?? []).find((n) => n.childCount > 0);
      return node === undefined ? null : hitNode(ctx, node, "optional:elems-present");
    }
    if (P === "tupleElement") {
      const tuple = (ctx.nodesByKind.get("ParserValueExprTupleLiteral") ?? []).find((n) => {
        const toks = tokensInSpan(ctx, n.spanStart, n.spanEnd);
        return toks.some((t, i) => tokenName(ctx, t) === "ParserValueTokenIdentifier" &&
          toks[i + 1] !== undefined && tokenName(ctx, toks[i + 1]!) === "ParserValueTokenColon");
      });
      return tuple === undefined ? null : hitNode(ctx, tuple, "optional:tuple-element-name");
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
      const anyElse = T("ParserValueTokenElse")[0];
      return anyElse === undefined ? null : hitToken(ctx, anyElse, "optional:else(token)");
    }
    if (P === "caseBranch" || P === "caseExprBranch") {
      const root = ctx.receipt.statementRoots.find((s) => s.role === "ParserValueExprStatementCaseGuard");
      if (root !== undefined) return hitStatementRoot(ctx, root, "optional:guard-role");
      for (const ofTok of T("ParserValueTokenOf")) {
        const colon = ctx.receipt.tokens.find((t) => t.start > ofTok.end && tokenName(ctx, t) === "ParserValueTokenColon" && t.line === ofTok.line);
        const ifTok = ctx.receipt.tokens.find((t) => t.start > ofTok.end && tokenName(ctx, t) === "ParserValueTokenIf" &&
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
        for (const fnTok of T("ParserValueTokenFn")) {
          const open = ctx.receipt.tokens.find((t) => t.index > fnTok.index && tokenName(ctx, t) === "ParserValueTokenLeftParen");
          if (open === undefined) continue;
          const close = ctx.receipt.tokens.find((t) => t.index > open.index && tokenName(ctx, t) === "ParserValueTokenRightParen");
          if (close !== undefined && ctx.receipt.tokens.some((t) => t.index > open.index && t.index < close.index && tokenName(ctx, t) === "ParserValueTokenIdentifier")) {
            return hitToken(ctx, open, "optional:params-present");
          }
        }
        return null;
      }
      if (path === "root.sequence1") {
        const region = ctx.receipt.regions.find((r) => r.kind === "ParserValueExprRegionParamType");
        return region === undefined ? null : hitRegion(ctx, region, "optional:param-type(region)");
      }
      const root = ctx.receipt.statementRoots.find((s) => s.role === "ParserValueExprStatementParameterDefault");
      return root === undefined ? null : hitStatementRoot(ctx, root, "optional:param-default");
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
          return hitToken(ctx, atTok, "optional:annotation-args");
        }
      }
      return null;
    }
    if (P === "importDecl") {
      const tok = ctx.receipt.tokens.find((t) => tokenText(ctx, t) === "as");
      return tok === undefined ? null : hitToken(ctx, tok, "optional:import-as");
    }
    if (P === "module") {
      const list = T("ParserValueTokenModule");
      return list.length === 0 ? null : hitToken(ctx, list[0]!, "optional:module-header");
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
      const fnTok = ctx.receipt.tokens.find((t) => tokenName(ctx, t) === "ParserValueTokenFn" &&
        (ctx.receipt.tokens[t.index - 1] === undefined || tokenName(ctx, ctx.receipt.tokens[t.index - 1]!) !== "ParserValueTokenAsync"));
      if (fnTok !== undefined) return hitToken(ctx, fnTok, "optional-absent:无 async");
    }
    const firstTokens = lineFirstToken(ctx);
    for (const [, tok] of firstTokens) {
      if (tokenName(ctx, tok) === "ParserValueTokenIdentifier" && tok.column > 1) return hitToken(ctx, tok, "optional-absent:fnEntry 无 fn 关键字");
    }
  }
  if (P === "routineHead" || P === "macroDecl" || P === "templateDecl" || P === "typeDecl" || P === "typeEntry" || P === "fnLiteral" || P === "iteratorLiteral") {
    if (path.includes("sequence4") || path.includes("sequence5") || path.includes("sequence6")) {
      const kwTok = ctx.receipt.tokens.find((t) => ["ParserValueTokenFn", "ParserValueTokenMacro", "ParserValueTokenTemplate", "ParserValueTokenType", "ParserValueTokenIterator"].includes(tokenName(ctx, t)));
      if (kwTok !== undefined) return hitToken(ctx, kwTok, "optional-absent:存在无 where 例程(弱)");
    }
    if (path === "root.sequence1" || path === "root.sequence2" || path === "root.choice0.sequence2") {
      const fnTok = ctx.receipt.tokens.find((t) => tokenName(ctx, t) === "ParserValueTokenFn" &&
        ctx.receipt.tokens[t.index + 1] !== undefined && tokenName(ctx, ctx.receipt.tokens[t.index + 1]!) === "ParserValueTokenIdentifier" &&
        ctx.receipt.tokens[t.index + 2] !== undefined && tokenName(ctx, ctx.receipt.tokens[t.index + 2]!) === "ParserValueTokenLeftParen");
      if (fnTok !== undefined) return hitToken(ctx, fnTok, "optional-absent:无类型参数");
    }
    if (path === "root.sequence3" || path === "root.sequence4") {
      const fnTok = ctx.receipt.tokens.find((t) => tokenName(ctx, t) === "ParserValueTokenFn");
      if (fnTok !== undefined) return hitToken(ctx, fnTok, "optional-absent:存在无返回类型例程(弱)");
    }
  }
  if (P === "bindingEntry") {
    const storageTok = ctx.receipt.tokens.find((t) => ["ParserValueTokenLet", "ParserValueTokenVar", "ParserValueTokenConst"].includes(tokenName(ctx, t)));
    if (storageTok !== undefined) {
      const lineToks = ctx.receipt.tokens.filter((t) => t.line === storageTok.line);
      if (path === "root.sequence1" && !lineToks.some((t) => tokenName(ctx, t) === "ParserValueTokenColon")) {
        return hitToken(ctx, storageTok, "optional-absent:无类型标注");
      }
      if (path === "root.sequence2" && !lineToks.some((t) => tokenName(ctx, t) === "ParserValueTokenAssign")) {
        return hitToken(ctx, storageTok, "optional-absent:无初值");
      }
      return hitToken(ctx, storageTok, `optional-absent:存在无标记 binding(${path}, 弱)`);
    }
  }
  if (P === "blockStmt") {
    const blockTok = T("ParserValueTokenBlock")[0];
    if (blockTok !== undefined) {
      const next = ctx.receipt.tokens[blockTok.index + 1];
      if (next !== undefined && tokenName(ctx, next) === "ParserValueTokenColon") return hitToken(ctx, blockTok, "optional-absent:无 label block");
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
    const call = (ctx.nodesByKind.get("ParserValueExprCall") ?? []).find((n) => n.childCount > 1);
    if (call !== undefined) return hitNode(ctx, call, "optional-absent:位置实参");
  }
  if (P === "listLiteralBody") {
    if (path.endsWith("sequence2")) {
      const close = ctx.receipt.tokens.find((t, i) => tokenName(ctx, t) === "ParserValueTokenRightBracket" &&
        ctx.receipt.tokens[i - 1] !== undefined && tokenName(ctx, ctx.receipt.tokens[i - 1]!) !== "ParserValueTokenComma");
      if (close !== undefined) return hitToken(ctx, close, "optional-absent:无尾随逗号");
    }
    const empty = (ctx.nodesByKind.get("ParserValueExprListLiteral") ?? []).find((n) => n.childCount === 0);
    if (empty !== undefined) return hitNode(ctx, empty, "optional-absent:空列表 []");
  }
  if (P === "spacePrimary") {
    if (path.endsWith("sequence2")) {
      const close = ctx.receipt.tokens.find((t, i) => tokenName(ctx, t) === "ParserValueTokenRightBrace" &&
        ctx.receipt.tokens[i - 1] !== undefined && tokenName(ctx, ctx.receipt.tokens[i - 1]!) !== "ParserValueTokenComma");
      if (close !== undefined) return hitToken(ctx, close, "optional-absent:无尾随逗号");
    }
    const empty = (ctx.nodesByKind.get("ParserValueExprBraceLiteral") ?? []).find((n) => n.childCount === 0);
    if (empty !== undefined) return hitNode(ctx, empty, "optional-absent:空 brace {}");
  }
  if (P === "tupleLiteral") {
    const close = ctx.receipt.tokens.find((t, i) => tokenName(ctx, t) === "ParserValueTokenRightParen" &&
      ctx.receipt.tokens[i - 1] !== undefined && tokenName(ctx, ctx.receipt.tokens[i - 1]!) !== "ParserValueTokenComma");
    if (close !== undefined) return hitToken(ctx, close, "optional-absent:无尾随逗号");
  }
  if (P === "tupleElement") {
    const tuple = (ctx.nodesByKind.get("ParserValueExprTupleLiteral") ?? []).find((n) => {
      const toks = tokensInSpan(ctx, n.spanStart, n.spanEnd);
      return !toks.some((t, i) => tokenName(ctx, t) === "ParserValueTokenIdentifier" &&
        toks[i + 1] !== undefined && tokenName(ctx, toks[i + 1]!) === "ParserValueTokenColon");
    });
    if (tuple !== undefined) return hitNode(ctx, tuple, "optional-absent:匿名 tuple 元素");
  }
  if (P === "paramList") {
    const fnTok = ctx.receipt.tokens.find((t) => tokenName(ctx, t) === "ParserValueTokenFn");
    if (fnTok !== undefined) {
      const open = ctx.receipt.tokens.find((t) => t.index > fnTok.index && tokenName(ctx, t) === "ParserValueTokenLeftParen");
      const close = open === undefined ? undefined : ctx.receipt.tokens[open.index + 1];
      if (close !== undefined && tokenName(ctx, close) === "ParserValueTokenRightParen") return hitToken(ctx, fnTok, "optional-absent:空参数列表()");
    }
  }
  if (P === "param") {
    const fnTok = ctx.receipt.tokens.find((t) => tokenName(ctx, t) === "ParserValueTokenFn");
    if (fnTok !== undefined) return hitToken(ctx, fnTok, `optional-absent:存在无标注/默认参数(${path}, 弱)`);
  }
  if (P === "annotation") {
    const atTok = T("ParserValueTokenAt")[0];
    if (atTok !== undefined) {
      const t2 = ctx.receipt.tokens[atTok.index + 2];
      if (t2 === undefined || tokenName(ctx, t2) !== "ParserValueTokenLeftParen") {
        return hitToken(ctx, atTok, "optional-absent:裸注解");
      }
    }
  }
  if (P === "importDecl") {
    const importTok = T("ParserValueTokenImport")[0];
    if (importTok !== undefined && !ctx.receipt.tokens.some((t) => t.line === importTok.line && tokenText(ctx, t) === "as")) {
      return hitToken(ctx, importTok, "optional-absent:无别名 import");
    }
  }
  if (P === "module") {
    if (T("ParserValueTokenModule").length === 0 && ctx.receipt.tokens.length > 0) {
      return hitToken(ctx, ctx.receipt.tokens[0]!, "optional-absent:无 module 头");
    }
  }
  if (P === "fieldDecl" || P === "tupleElem" || P === "enumField") {
    const typeTok = T("ParserValueTokenType")[0];
    if (typeTok !== undefined) return hitToken(ctx, typeTok, "optional-absent:存在无默认值字段(弱)");
  }
  const rootHit = matchProductionRoot(P, ctx, mapRow);
  if (rootHit.kind === "hit") return {...rootHit, channel: `${rootHit.channel}+optional-absent(弱: 存在无标记实例)`};
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
      // 无该层算子的表达式: 任意非 Binary 原子表达式根
      const plain = ctx.receipt.statementRoots.find((s) => nodeAt(ctx, s.nodeIndex).kind !== "ParserValueExprBinary");
      if (plain !== undefined) return hitNode(ctx, nodeAt(ctx, plain.nodeIndex), `rep-zero:无${P}算子表达式`);
      const atom = ctx.receipt.nodes.find((n) => n.childCount === 0);
      if (atom !== undefined) return hitNode(ctx, atom, `rep-zero:原子节点`);
      return miss("无零算子表达式");
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
    // caseExpr: 用 Case 节点 span 计 Of; {caseExprBranch} 重复次数 = 分支数(全在重复内)
    if (P === "caseExpr" || P === "caseExprBranch") {
      for (const node of ctx.nodesByKind.get("ParserValueExprCase") ?? []) {
        const count = tokensInSpan(ctx, node.spanStart, node.spanEnd).filter((t) => tokenName(ctx, t) === "ParserValueTokenOf").length;
        if (variant === "one" && count === 1) return hitNode(ctx, node, "rep-one:单 caseExpr 分支");
        if (variant === "bounded_max" && count >= 8) return hitNode(ctx, node, `rep-max:caseExpr 分支×${count}`);
        if (variant === "zero") return miss("case 分支 zero 属 BLOCKED(空块)");
      }
      return miss(`caseExpr 分支计数不满足 ${variant}`);
    }
    const kwName = isMatch ? "ParserValueTokenMatch" : "ParserValueTokenCase";
    for (const kw of tokensNamed(ctx, kwName)) {
      // 判定 flat(分支与 kw 同列) 或 INDENT(分支更缩进), 决定块结束列条件
      const firstOf = isMatch ? undefined : ctx.receipt.tokens.find((t) => tokenName(ctx, t) === "ParserValueTokenOf" && t.line > kw.line);
      const flat = firstOf !== undefined && firstOf.column === kw.column;
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
        // caseBranch 含 else 臂: Of + Else 都计; {caseBranch} 的重复次数 = 分支数
        count = ctx.receipt.tokens.filter((t) => inBlock(t) &&
          ["ParserValueTokenOf", "ParserValueTokenElse"].includes(tokenName(ctx, t))).length;
      }
      const sameLineArm = isMatch &&
        ctx.receipt.tokens.some((t, i) => t.line === kw.line && tokenName(ctx, t) === "ParserValueTokenAssign" &&
          ctx.receipt.tokens[i + 1] !== undefined && tokenName(ctx, ctx.receipt.tokens[i + 1]!) === "ParserValueTokenGreater");
      // match 的 {NEWLINE matchArm} 首臂在重复之外 → count-1; case 的 {caseBranch} 全在重复内 → count
      const repCount = isMatch
        ? (count === 0 ? (sameLineArm ? 0 : -1) : count - 1)
        : count;
      if (variant === "zero" && repCount === 0 && (count === 1 || sameLineArm)) return hitToken(ctx, kw, "rep-zero:单臂/单分支");
      if (variant === "one" && repCount === 1) return hitToken(ctx, kw, `rep-one:${isMatch ? "双臂" : "单分支"}`);
      if (variant === "bounded_max" && repCount >= 8) return hitToken(ctx, kw, `rep-max:${isMatch ? "臂" : "分支"}×${count}`);
    }
    if (variant === "zero" && P === "caseStmt") return miss("case 分支 zero 属 BLOCKED(空块)");
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
    // 参数分隔符(,/;): 逐 fn 头括号内计数, 找匹配 variant 的头
    for (const fnTok of tokensNamed(ctx, "ParserValueTokenFn")) {
      const open = ctx.receipt.tokens.find((t) => t.index > fnTok.index && tokenName(ctx, t) === "ParserValueTokenLeftParen");
      if (open === undefined) continue;
      let depth = 0; let seps = 0;
      for (const t of ctx.receipt.tokens.slice(open.index)) {
        const name = tokenName(ctx, t);
        if (name === "ParserValueTokenLeftParen") depth += 1;
        else if (name === "ParserValueTokenRightParen") {depth -= 1; if (depth === 0) break;}
        else if (["ParserValueTokenComma", "ParserValueTokenSemicolon"].includes(name) && depth === 1) seps += 1;
      }
      if (cmp(seps)) return hitToken(ctx, fnTok, `rep:params(${variant},分隔符×${seps})`);
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
    // module 的 5 处 NEWLINE/条目重复 — 由 structuralPath 区分
    const path = obligation.structuralPath;
    const importCount = tokensNamed(ctx, "ParserValueTokenImport").length;
    const declCount = ctx.receipt.tokens.filter((t) => t.column === 1 &&
      ["ParserValueTokenFn", "ParserValueTokenType", "ParserValueTokenLet", "ParserValueTokenVar", "ParserValueTokenConst", "ParserValueTokenIterator", "ParserValueTokenMacro", "ParserValueTokenTemplate", "ParserValueTokenConcept", "ParserValueTokenTrait"].includes(tokenName(ctx, t))).length;
    if (path === "root.sequence2") {
      const importTok = tokensNamed(ctx, "ParserValueTokenImport")[0];
      if (cmp(importCount) && importTok !== undefined) return hitToken(ctx, importTok, `rep:imports×${importCount}`);
      if (variant === "zero" && importCount === 0 && ctx.receipt.tokens.length > 0) {
        const last = ctx.receipt.tokens[ctx.receipt.tokens.length - 1]!;
        return hitSpan(ctx, 0, last.end, "ParsedSourceStub", "rep-zero:无 import");
      }
    }
    if (path === "root.sequence3") {
      if (cmp(declCount) && ctx.receipt.tokens.length > 0) return hitToken(ctx, ctx.receipt.tokens[0]!, `rep:decls×${declCount}`);
      if (variant === "zero" && declCount === 0 && ctx.receipt.tokens.length > 0) {
        const last = ctx.receipt.tokens[ctx.receipt.tokens.length - 1]!;
        return hitSpan(ctx, 0, last.end, "ParsedSourceStub", "rep-zero:无 decl");
      }
    }
    // NEWLINE 重复: 行间隙
    const toks = ctx.receipt.tokens;
    if (toks.length === 0) return miss("空 token 流, 无法构造 witness span");
    const gaps: number[] = [];
    if (toks.length > 0) gaps.push(toks[0]!.line - 1);
    for (let i = 1; i < toks.length; i += 1) gaps.push(toks[i]!.line - toks[i - 1]!.line - 1);
    const wanted = variant === "zero" ? 0 : variant === "one" ? 1 : 8;
    const hitIdx = gaps.findIndex((g) => variant === "bounded_max" ? g >= 8 : g === wanted);
    if (hitIdx >= 0) return hitToken(ctx, toks[hitIdx] ?? toks[0]!, `rep:newline-gap(${variant})`);
    if (variant === "zero" && gaps.every((g) => g === 0)) return hitToken(ctx, toks[0]!, "rep-zero:无空行");
    return miss(`NEWLINE 间隙不满足 ${variant}`);
  }
  if (P === "importDecl") {
    // 分组项逗号(逐 import 行找匹配计数)
    for (const importTok of tokensNamed(ctx, "ParserValueTokenImport")) {
      const lineCommas = ctx.receipt.tokens.filter((t) => t.line === importTok.line && tokenName(ctx, t) === "ParserValueTokenComma").length;
      if (cmp(lineCommas)) return hitToken(ctx, importTok, `rep:group-items(${variant},逗号×${lineCommas})`);
    }
    return miss(`分组项计数不满足 ${variant}`);
  }
  if (P === "modulePath") {
    for (const importTok of tokensNamed(ctx, "ParserValueTokenImport")) {
      const slashes = ctx.receipt.tokens.filter((t) => t.line === importTok.line && tokenText(ctx, t) === "/").length;
      if (cmp(slashes)) return hitToken(ctx, importTok, `rep:path-slash(${variant},/×${slashes})`);
    }
    return miss(`modulePath 段计数不满足 ${variant}`);
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
      if (variant === "zero" && run === 0) return hitToken(ctx, firstTokens.get(line)!, "rep-zero:无注解声明");
      if (variant === "one" && run === 1) return hitToken(ctx, firstTokens.get(line - 1) ?? firstTokens.get(line)!, "rep-one:单注解声明");
      if (variant === "bounded_max" && run >= 8) return hitToken(ctx, firstTokens.get(line - 8) ?? firstTokens.get(line)!, `rep-max:注解×${run}`);
    }
    return miss(`annotations 计数不满足 ${variant}`);
  }
  if (P === "suite") {
    // {statement}: statementRoots 计数(全文件口径近似)
    const count = ctx.receipt.statementRoots.length;
    if (variant === "one" && count === 1) return hitNode(ctx, nodeAt(ctx, ctx.receipt.statementRoots[0]!.nodeIndex), "rep-one:单语句套件");
    if (variant === "bounded_max" && count >= 8) return hitNode(ctx, nodeAt(ctx, ctx.receipt.statementRoots[0]!.nodeIndex), `rep-max:语句×${count}`);
    return miss(`suite 语句计数 ${count} 不满足 ${variant}`);
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
  // 表达式转发链: 括号深度
  const chain = ["expression", "conditionalExpr", "logicalOr", "logicalAnd", "bitwiseOr", "bitwiseXor", "bitwiseAnd", "equality", "comparison", "membership", "rangeExpr", "sum", "term", "factor", "postfix", "unary", "primary"];
  if (chain.includes(P)) {
    const atom = ctx.receipt.nodes.find((n) => {
      if (n.childCount !== 0) return false;
      const depth = parenDepthAt(ctx, n.spanStart);
      return variant === "bounded_depth" ? depth >= 3 : depth === want;
    });
    if (atom !== undefined) return hitNode(ctx, atom, `rec:paren-depth(${variant})`);
    return miss(`链递归深度 ${variant} 无原子节点命中`);
  }
  // 包装节点: 同 kind 祖先计数
  const wrapperKinds: Record<string, readonly string[]> = {
    tupleLiteral: ["ParserValueExprTupleLiteral"], tupleElement: ["ParserValueExprTupleLiteral"],
    listLiteral: ["ParserValueExprListLiteral"], listLiteralBody: ["ParserValueExprListLiteral"],
    listComprehension: ["ParserValueExprComprehension"], comprehension: ["ParserValueExprComprehension"],
    ifExpr: ["ParserValueExprIf"], whenExpr: ["ParserValueExprWhen"],
    caseExpr: ["ParserValueExprCase"], caseExprBranch: ["ParserValueExprCaseBranch"], caseEntry: ["ParserValueExprCase"],
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
  // decl/语句 role 类: fnLiteral 包含深度
  const fnRanges = fnLiteralLineRanges(ctx);
  const roleByP = STMT_ROLE[P];
  if (roleByP !== undefined) {
    const wanted = roleByP[0] === "__any__" ? null : new Set(roleByP);
    const root = ctx.receipt.statementRoots.find((s) => {
      if (wanted !== null && !wanted.has(s.role)) return false;
      const depth = fnLiteralDepthOfLine(fnRanges, s.anchorLine);
      return variant === "bounded_depth" ? depth >= 3 : depth === want;
    });
    if (root !== undefined) return hitStatementRoot(ctx, root, `rec:fnlit-depth(${variant})`);
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
  const {tokenStart, tokenEnd} = charSpanToTokenSpanCovering(ctx.source, hit.charStart, hit.charEnd);
  const tokenSha256 = sha256(ctx.fusionTokens.slice(tokenStart, tokenEnd).join("\u001f"));
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
    tokenStart,
    tokenEnd,
    tokenSha256,
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

export function bindReceiptAgainstObligations(
  receiptJson: string,
  source: string,
  obligations: readonly ChengGrammarObligation[],
  tokenNames: readonly string[],
  mapRows: ReadonlyMap<string, MapRow>,
): {readonly ctx: Ctx; readonly results: BindOneResult[]} {
  const receipt = JSON.parse(receiptJson) as DriverReceipt;
  if (receipt.schema !== "cheng_driver_parse_receipt.v1") throw new Error(`driver receipt schema 不符: ${receipt.schema}`);
  if (sha256(source) !== receipt.sourceSha256) throw new Error(`driver receipt sourceSha256 与源字节不符: ${receipt.relativePath}`);
  const ctx = buildCtx(receipt, source, tokenNames);
  const results: BindOneResult[] = [];
  for (const obligation of obligations) {
    if (obligation.disposition !== "required") continue;
    const mr = matchObligation(obligation, ctx, mapRows.get(obligation.production));
    const gsr = mr.kind === "hit" ? receiptForHit(obligation, mr, ctx, receipt.relativePath) : null;
    results.push({obligationId: obligation.obligationId, production: obligation.production, kind: obligation.kind, variant: obligation.variant, result: mr, receipt: gsr});
  }
  return {ctx, results};
}

// ---------------------------------------------------------------- CLI
function mainBind() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const tokenNames = loadTokenKindNames(PARSER_PATH);
  const grammar = buildChengGrammarObligationContract(readFileSync(SPEC_PATH));
  const mapDoc = JSON.parse(readFileSync(MAP_PATH, "utf8")) as {rows: MapRow[]};
  const mapRows = new Map(mapDoc.rows.map((r) => [r.name, r]));
  if (mode === "bind") {
    const receiptPath = args[1];
    const sourcePath = args[2];
    if (receiptPath === undefined || sourcePath === undefined) throw new Error("用法: bind <receipt.json> <sourceFile>");
    const source = readFileSync(sourcePath, "utf8");
    const {results} = bindReceiptAgainstObligations(readFileSync(receiptPath, "utf8"), source, grammar.obligations, tokenNames, mapRows);
    const hits = results.filter((r) => r.result.kind === "hit");
    const receipts = hits.map((r) => r.receipt!);
    console.log(JSON.stringify({hits: hits.length, total: results.length, receipts}, null, 2));
    return;
  }
  throw new Error(`未知模式: ${mode ?? "(空)"}`);
}

if (process.argv[1]?.endsWith("grammar_receipt_bind.ts")) mainBind();
